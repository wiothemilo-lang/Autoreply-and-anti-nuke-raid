/**
 * Theo dõi timeout đang áp dụng của từng thành viên (bộ nhớ trong process).
 *
 * Mục đích: khi timeout HẾT HẠN TỰ NHIÊN, bot ghi một embed case kiểu Carl-bot
 * ("⏱️ Timeout hết hạn") — phân biệt với trường hợp mod chủ động GỠ timeout
 * (lệnh /mod untimeout — vốn đã có log riêng).
 *
 * ⚠️ Vì sao KHÔNG dựa vào sự kiện guildMemberUpdate làm đường chính:
 * discord.js v14 KHÔNG phát sự kiện này cho thành viên KHÔNG nằm trong cache
 * (discordjs/discord.js#5685), và bot này giới hạn cache member ở 200 — nên ở
 * server lớn, sự kiện hết hạn bị rơi, embed không xuất hiện. Vì vậy:
 *
 *  1. track() lên lịch MỘT TIMER NGAY (hết hạn + 1.5s): khi chạy, kiểm tra mục
 *     vẫn là bản đang theo dõi (chưa bị gỡ / gia hạn) → forget + gửi embed.
 *     Đây là đường CHÍNH — hoạt động kể cả khi gateway không gửi sự kiện gì.
 *  2. guildMemberUpdate chỉ là đường PHỤ: timeout mới áp trực tiếp trên Discord
 *     (không qua bot) mới được track ở đây; khi thấy timeout biến mất thì gửi
 *     embed như cũ. Cả 2 đường đều forget TRƯỚC khi gửi → không bao giờ log trùng.
 *
 * Gỡ chủ động thì modTools.js gọi forget() trước → không log nhầm thành hết hạn.
 * Giới hạn: tracker nằm trong RAM — nếu bot khởi động lại giữa chừng, các timeout
 * đang chạy sẽ không được log lúc hết hạn (best-effort, không phạt ai thêm).
 *
 * key = `${guildId}:${userId}` → thời điểm hết hạn (ms).
 */
const { sendCaseLog } = require("./caseLog");
const { formatDuration } = require("./util");

const timeouts = new Map(); // key -> { until, durationMs } (ms)
const timers = new Map(); // key -> setTimeout id
const MAX_TIMER_MS = 2_147_000_000; // setTimeout 32-bit: ~24.8 ngày (Discord tối đa 28 ngày)

let clientRef = null;
let storeRef = null;

function key(guildId, userId) {
  return `${guildId}:${userId}`;
}

/** Lên lịch timer kiểm tra hết hạn (hủy timer cũ nếu có — gia hạn sẽ thay thế). */
function scheduleTimer(guildId, userId, until) {
  const k = key(guildId, userId);
  clearTimeout(timers.get(k));
  const delay = Math.max(1_000, Math.min(MAX_TIMER_MS, until - Date.now() + 1_500));
  timers.set(
    k,
    setTimeout(() => {
      void onTimerFire(guildId, userId, until).catch((e) =>
        console.error("[timeoutWatch:timer]", e?.message || e),
      );
    }, delay),
  );
}

/** Timer chạy: mục vẫn là bản đang theo dõi và đã qua mốc hết hạn → log. */
async function onTimerFire(guildId, userId, until) {
  const k = key(guildId, userId);
  const entry = timeouts.get(k);
  if (!entry || entry.until !== until) return; // đã bị gỡ / gia hạn → bỏ qua
  if (Date.now() < until) {
    // Timer bị cap 32-bit với timeout rất dài — đặt lại cho tới hạn.
    timers.set(
      k,
      setTimeout(
        () => {
          void onTimerFire(guildId, userId, until).catch((e) =>
            console.error("[timeoutWatch:timer]", e?.message || e),
          );
        },
        Math.min(MAX_TIMER_MS, until - Date.now() + 1_500),
      ),
    );
    return;
  }
  timers.delete(k);
  const durationMs = entry.durationMs;
  timeouts.delete(k);
  await maybeLogExpired(guildId, userId, until, durationMs);
}

/** Gửi embed "⏱️ Timeout hết hạn" (caller đã forget đồng bộ trước khi await). */
async function maybeLogExpired(guildId, userId, until, durationMs) {
  if (Date.now() < until) return false; // mod gỡ sớm → không log
  const guild = clientRef?.guilds?.cache.get(guildId);
  if (!guild || guild.available === false) return false;
  const guildConfig = storeRef ? await storeRef.getConfig(guildId).catch(() => null) : null;
  const username = guild.members?.cache?.get(userId)?.user?.username ?? userId;
  // Format thời lượng timeout ban đầu (kiểu Carl-bot)
  const extra = [];
  if (durationMs && durationMs > 0) {
    const mins = Math.round(durationMs / 60_000);
    extra.push(`**Thời lượng ban đầu:** ${formatDuration(mins)}`);
  }
  await sendCaseLog({
    guild,
    guildConfig,
    action: "timeout_expired",
    offender: { id: userId, username },
    reason: "Timeout đã hết hạn tự nhiên.",
    extraDescription: extra,
  });
  return true;
}

/** Ghi nhận một timeout đang chạy, hết hạn lúc `until` (ms). */
function track(guildId, userId, until) {
  if (!guildId || !userId || !Number.isFinite(until)) return;
  const k = key(guildId, userId);
  const durationMs = until - Date.now();
  timeouts.set(k, { until, durationMs });
  scheduleTimer(guildId, userId, until);
}

/** Bỏ theo dõi (gỡ timeout / hết hạn / thành viên rời server). Trả về durationMs hoặc null. */
function forget(guildId, userId) {
  const k = key(guildId, userId);
  const entry = timeouts.get(k);
  const durationMs = entry?.durationMs;
  timeouts.delete(k);
  clearTimeout(timers.get(k));
  timers.delete(k);
  return durationMs;
}

/** Thời điểm hết hạn đang theo dõi (ms) hoặc null. */
function getUntil(guildId, userId) {
  const entry = timeouts.get(key(guildId, userId));
  return entry ? entry.until : null;
}

/**
 * Dọn các mục đã hết hạn (chống rò rỉ RAM). Đợi quá hạn 2 phút trước khi xóa —
 * nếu gateway gửi sự kiện hết hạn trễ hơn timer, đường phụ vẫn có mục để log.
 */
function sweep() {
  const cutoff = Date.now() - 120_000;
  for (const [k, entry] of timeouts) {
    if (entry.until <= cutoff) {
      timeouts.delete(k);
      clearTimeout(timers.get(k));
      timers.delete(k);
    }
  }
}

/** Số mục đang theo dõi (chẩn đoán). */
function size() {
  return timeouts.size;
}

/**
 * Gắn listener (gọi 1 lần từ index.js):
 *  - guildMemberUpdate: đường PHỤ — timeout mới/gia hạn → track (có timer riêng);
 *    timeout biến mất và đã qua mốc track → gửi embed "⏱️ Timeout hết hạn" (dedupe
 *    bằng forget-first; timer chính cũng bị vô hiệu vì mục đã hết).
 *  - guildMemberRemove: forget (thành viên rời server khi đang bị timeout).
 *  - sweep định kỳ 60s dọn bộ nhớ (chỉ mục quá hạn > 2 phút).
 */
function attach(client, store) {
  clientRef = client;
  storeRef = store;

  client.on("guildMemberUpdate", async (_oldMember, newMember) => {
    try {
      const guildId = newMember.guild?.id;
      const userId = newMember.id;
      if (!guildId || !userId) return;
      const after = newMember.communicationDisabledUntil;
      if (after) {
        // Timeout mới hoặc được gia hạn (kể cả áp trực tiếp trên Discord) → theo dõi.
        track(guildId, userId, after.getTime());
        return;
      }
      // Timeout đã được gỡ / hết hạn: quyết định dựa trên mốc đã track.
      const trackedUntil = getUntil(guildId, userId);
      if (!trackedUntil) return;
      // forget đồng bộ TRƯỚC await → đường chính (timer) thấy mục hết nên không log trùng.
      const durationMs = forget(guildId, userId);
      if (Date.now() < trackedUntil) return; // mod gỡ sớm → không log
      await maybeLogExpired(guildId, userId, trackedUntil, durationMs);
    } catch (e) {
      console.error("[timeoutWatch]", e?.message || e);
    }
  });

  client.on("guildMemberRemove", (member) => {
    if (member.guild?.id && member.id) forget(member.guild.id, member.id);
  });

  setInterval(() => sweep(), 60_000);
}

module.exports = { track, forget, getUntil, sweep, size, attach };
