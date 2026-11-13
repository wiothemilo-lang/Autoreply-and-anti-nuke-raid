"use strict";
/**
 * channelLock.js — LỆNH KHOÁ CHAT của chủ server (`/lock`).
 *
 * Khác với `lockdown.js` (khóa toàn server khi RAID, @everyone, tự mở theo
 * `lockdownMinutes`), module này là thao tác chủ server chủ động:
 *   - khoá được MỘT kênh hoặc TẤT CẢ kênh chat;
 *   - khoá được THEO ROLE (chỉ cấm role đó, không đụng @everyone);
 *   - có thể khoá VÔ HẠN (bỏ trống thời lượng) hoặc tự mở sau N phút.
 *
 * ⚠️ VÌ SAO PHẢI LƯU `prev` — điểm mấu chốt của cả module:
 * khoá là GHI ĐÈ quyền của một role trên kênh. Lúc mở khoá chỉ có 2 cách:
 *   1. reset về `null` → XOÁ SẠCH override chủ server tự đặt (kênh vốn đã
 *      cấm @everyone gửi tin sẽ bị MỞ tràn sau khi bot "gỡ khoá");
 *   2. giữ nguyên → kênh KẸT VĨNH VIỄN, không ai mở được.
 * Nên ở đây mỗi lần khoá đều đọc quyền HIỆN TẠI rồi lưu vào Convex; mở khoá
 * thì trả về đúng giá trị cũ — kể cả `null` (nghĩa là "chưa đặt, kế thừa từ
 * trên"), vốn KHÁC `false` một cách quyết định.
 *
 * ⚠️ KHOÁ 2 LẦN KHÔNG ĐƯỢC GHI ĐÈ `prev`: nếu lần 2 lưu `prev = false` (trạng
 * thái đang bị khoá) thì lúc mở sẽ khôi phục về `false` → kênh kẹt vĩnh viễn
 * và không còn dấu vết để mở. Vì vậy `botSaveChannelLock` GIỮ NGUYÊN `prev`
 * cũ, và handler bỏ qua kênh đã có bản ghi khoá.
 *
 * Phần quyết định thuần (parse thời lượng, chọn kênh, đọc quyền) viết để
 * test được không cần mạng — `scripts/test-channel-lock.cjs`.
 */

const { PermissionFlagsBits, Colors } = require("discord.js");
const { logEmbed, sendLog, formatDuration } = require("./util");

/** Trần thời lượng khoá: 30 ngày. Quá dài thì chủ server sai số, không phải chủ ý. */
const MAX_MINUTES = 30 * 24 * 60;

/** Quyền bị chặn theo loại kênh. */
const LOCK_KEY = { text: "SendMessages", voice: "Connect" };

/**
 * Thời lượng khoá.
 *
 * Rỗng / không truyền → `null` = **VÔ HẠN** (tự mở tay bằng `/lock remove`).
 * Đây là khác biệt quan trọng với `parseDuration` của `/mod timeout`: bỏ trống
 * ở đó là lỗi người dùng, bỏ trống ở đây là chủ ý.
 *
 * @returns {{ok: true, minutes: number|null} | {ok: false, error: string}}
 */
function parseLockMinutes(raw) {
  if (raw === undefined || raw === null) return { ok: true, minutes: null };
  const text = String(raw).trim();
  if (!text) return { ok: true, minutes: null }; // ô trống = vô hạn
  const m = /^(\d+)\s*([smhd]?)$/i.exec(text);
  if (!m) return { ok: false, error: "Thời lượng phải kiểu 30m, 2h, 1d (để trống = khoá vô hạn)." };
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0)
    return { ok: false, error: "Thời lượng phải lớn hơn 0 (để trống = khoá vô hạn)." };
  const unit = (m[2] || "m").toLowerCase();
  const minutes =
    unit === "s" ? Math.ceil(n / 60) : unit === "h" ? n * 60 : unit === "d" ? n * 1440 : n;
  if (minutes > MAX_MINUTES)
    return { ok: false, error: `Tối đa ${MAX_MINUTES / 1440} ngày cho một lần khoá.` };
  return { ok: true, minutes: Math.max(1, minutes) };
}

/** Diễn giải thời lượng cho người đọc. `null` → "vô hạn". */
function formatLockDuration(minutes) {
  if (minutes === null || minutes === undefined) return "vô hạn";
  return formatDuration(minutes);
}

/**
 * Loại khoá của một kênh, hoặc `null` nếu KHÔNG khoá được.
 *
 * Thread bị loại có chủ đích: thread kế thừa quyền từ kênh cha, khoá riêng
 * thread vừa thừa vừa dễ để lại thread mồ côi khi kênh cha mở lại.
 * Danh mục (category) cũng tự loại vì `isTextBased()` trả false.
 */
function channelLockKind(channel) {
  if (!channel) return null;
  if (channel.isThread && channel.isThread()) return null;
  if (channel.isVoiceBased && channel.isVoiceBased()) return "voice";
  if (channel.isTextBased && channel.isTextBased()) return "text";
  return null;
}

/**
 * Đọc quyền HIỆN TẠI của một role trên kênh.
 *
 * Phân biệt 3 trạng thái — đây là chỗ dễ sai nhất:
 *   `true`  = cho phép · `false` = cấm · `null` = CHƯA ĐẶT (kế thừa từ trên).
 * Nếu gộp `null` với `false` thì mở khoá sẽ mở nhầm kênh vốn đã bị cấm.
 *
 * @returns {true|false|null}
 */
function readPermission(channel, roleId, kind) {
  const key = LOCK_KEY[kind];
  if (!key) return null;
  const overwrite = channel?.permissionOverwrites?.cache?.get(roleId);
  if (!overwrite) return null; // chưa có override cho role này
  if (overwrite.allow && overwrite.allow.has(key)) return true;
  if (overwrite.deny && overwrite.deny.has(key)) return false;
  // Có override nhưng không đụng quyền này → vẫn là kế thừa.
  return null;
}

/**
 * Giải quyết role bị khoá: @everyone (không chọn) hoặc một role cụ thể.
 *
 * @returns {{ok: true, roleId: string, everyone: boolean} | {ok: false, error: string}}
 */
function resolveTargetRole(guild, roleOption) {
  const everyoneId = guild?.roles?.everyone?.id;
  if (!everyoneId) return { ok: false, error: "Không đọc được server này." };
  if (!roleOption) return { ok: true, roleId: everyoneId, everyone: true };
  const roleId = typeof roleOption === "string" ? roleOption : roleOption.id;
  if (roleId === everyoneId) return { ok: true, roleId: everyoneId, everyone: true };
  const role = guild.roles?.cache?.get(roleId);
  if (!role) return { ok: false, error: "Không tìm thấy role này trong server." };
  if (role.managed)
    return { ok: false, error: `Role \`${role.name}\` do bot quản lý — không sửa được quyền.` };
  // Bot không thể sửa quyền cho role nằm CAO HƠN bot: Discord từ chối.
  const me = guild.members?.me;
  if (me && role.position >= me.roles?.highest?.position)
    return {
      ok: false,
      error: `Role \`${role.name}\` nằm trên role của bot — bot không sửa được quyền cho nó.`,
    };
  return { ok: true, roleId, everyone: false };
}

/**
 * Tập kênh sẽ khoá khi dùng `/lock all`.
 *
 * Bỏ qua: danh mục, thread, kênh bot không sửa được quyền (đã lọc ở
 * `channelLockKind`). KHÔNG bỏ qua kênh ticket: người mở ticket có override
 * riêng nên vẫn chat được trong kênh của họ.
 */
function collectChatChannels(guild) {
  const out = [];
  for (const channel of guild?.channels?.cache?.values?.() ?? []) {
    const kind = channelLockKind(channel);
    if (kind) out.push({ channel, kind });
  }
  return out;
}

/**
 * Ghi quyền khoá lên kênh. Truyền `key` tường minh để test được.
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function writePermission(channel, roleId, key, value) {
  try {
    await channel.permissionOverwrites.edit(roleId, { [key]: value });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * KHOÁ MỘT kênh.
 *
 * @param prevKnown quyền đã lưu từ lần khoá trước (nếu có) — khi đó KHÔNG
 *   đọc/ghi lại `prev`, giữ nguyên bản ghi cũ.
 * @returns {{ok: boolean, prev?: boolean|null, error?: string}}
 */
async function lockChannel({ channel, roleId, kind, prevKnown }) {
  const key = LOCK_KEY[kind];
  const prev = prevKnown === undefined ? readPermission(channel, roleId, kind) : prevKnown;
  const w = await writePermission(channel, roleId, key, false);
  if (!w.ok) return { ok: false, error: w.error, prev };
  return { ok: true, prev };
}

/**
 * MỞ KHOÁ một kênh — trả về ĐÚNG quyền trước khi khoá.
 *
 * `prev = null` → đặt quyền về "kế thừa" (xoá override của riêng quyền này,
 * giữ nguyên phần khác của override). KHÔNG bao giờ dùng cách xoá hết cả
 * override: sẽ mất luôn các quyền chủ server tự đặt cho role đó.
 *
 * @returns {{ok: boolean, error?: string}}
 */
async function unlockChannel({ channel, roleId, kind, prev }) {
  const key = LOCK_KEY[kind];
  const value = prev === undefined ? null : prev;
  return writePermission(channel, roleId, key, value);
}

/** Bot có quyền Quản lý kênh không — thiếu thì không khoá được gì. */
function botCanManageChannels(guild) {
  const me = guild?.members?.me;
  if (!me?.permissions?.has) return false;
  return me.permissions.has(PermissionFlagsBits.ManageChannels);
}

/** Mô tả kênh cho log: `#tên`. */
function channelLabel(channel) {
  const name = channel?.name || "kênh";
  return `\`#${name}\``;
}

/**
 * Mô tả kèm id cho DANH SÁCH LỖI — server có thể có nhiều kênh trùng tên,
 * chỉ ghi `#general` thì quản trị không biết phải mở kênh nào.
 */
function channelLabelWithId(channel, channelId) {
  return `${channelLabel(channel)} (\`${channelId}\`)`;
}

/** Embed ghi log thao tác khoá/mở (dùng chung cho lệnh lẫn tự mở hạn). */
function lockLogEmbed({ action, channelNames, roleLabel, duration, reason, actor, auto }) {
  const title = auto
    ? action === "lock"
      ? "🔒 Đã khoá chat tự động (hết hạn)"
      : "🔓 Đã tự mở khoá chat"
    : action === "lock"
      ? "🔒 Đã khoá chat"
      : "🔓 Đã mở khoá chat";
  const lines = [`Kênh: ${channelNames.join(", ")}`, `Đối tượng: ${roleLabel}`];
  if (action === "lock") lines.push(`Thời lượng: ${formatLockDuration(duration)}`);
  if (reason) lines.push(`Lý do: ${reason}`);
  if (actor) lines.push(`Người thực hiện: ${actor}`);
  return logEmbed({
    title,
    description: lines.join("\n"),
    color: action === "lock" ? Colors.Red : Colors.Green,
    fields: [{ name: "Số kênh", value: String(channelNames.length), inline: true }],
    footer: "Protogon · Khóa kênh",
  });
}

/** Fetch kênh tươi (cache bot vừa restart thì cache trống). */
async function fetchChannel(client, channelId) {
  if (!client?.channels?.fetch) return null;
  return (await client.channels.fetch(channelId).catch(() => null)) || null;
}

/**
 * Mở khoá theo danh sách bản ghi — dùng chung cho `/lock remove`,
 * `/lock unlock-all` và cho vòng tự mở hạn trong tick.
 *
 * Xoá bản ghi ở cả 2 trường hợp: mở được, VÀ kênh đã bị xoá khỏi server.
 * Giữ bản ghi của kênh không còn tồn tại thì mỗi lượt tick lại quét vô ích
 * (bản ghi có hạn sẽ không bao giờ tự xoá).
 *
 * @returns {{restored: string[], missing: string[], failed: string[]}}
 *   `restored` là NHÃN kênh (`#tên`) để ghép log; `failed` là lỗi đã bám
 *   nhãn kênh kèm id để người quản trị biết kênh nào cần xử lý tay.
 *   `missing` là **ID** kênh đã bị xoá — kênh không còn nên không có tên để
 *   hiển thị; người gọi chỉ được dùng `missing.length`, đem đi in ra là lộ
 *   snowflake cho người dùng (đúng lỗi doc cũ hứa "nhãn kênh" nhưng code
 *   đẩy id vào).
 */
async function releaseLocks({ client, guild, records, store, botKey }) {
  const restored = [];
  const missing = [];
  const failed = [];
  const drop = [];
  for (const rec of records || []) {
    const channel =
      guild?.channels?.cache?.get(rec.channelId) || (await fetchChannel(client, rec.channelId));
    if (!channel) {
      missing.push(rec.channelId);
      drop.push(rec);
      continue;
    }
    const label = channelLabel(channel);
    const r = await unlockChannel({
      channel,
      roleId: rec.roleId,
      kind: rec.kind,
      prev: rec.prev,
    });
    if (r.ok) {
      restored.push(label);
      drop.push(rec);
    } else {
      failed.push(`${channelLabelWithId(channel, rec.channelId)}: ${r.error}`);
    }
  }
  for (const rec of drop) {
    await store.client
      .mutation("channelLocks:botReleaseChannelLock", {
        botKey,
        guildId: rec.guildId,
        channelId: rec.channelId,
        roleId: rec.roleId,
      })
      .catch((e) => console.error("[channelLock] xoá bản ghi thất bại:", e.message));
  }
  return { restored, missing, failed };
}

/** Nhãn role cho log: tên role, hoặc “@everyone” khi khoá toàn server. */
function roleLabel(guild, roleId) {
  const everyoneId = guild?.roles?.everyone?.id;
  if (roleId === everyoneId) return "@everyone";
  return guild?.roles?.cache?.get(roleId)?.name || `role \`${roleId}\``;
}

/**
 * Vòng tự mở khoá (chạy mỗi lượt tick): mở mọi khoá đã HẾT HẠN.
 *
 * Khoá vô hạn không bao giờ tới đây — nó không có `until` nên không nằm
 * trong index `by_due`. Đó là điểm hay: “không đặt hạn” = “không tự mở”,
 * không phải “tự mở sau 0 phút”.
 *
 * Gom theo guild trước khi xử lý: một server khoá 50 kênh cùng lúc hết hạn
 * thì chỉ cần một lần `getConfig` + một lần ghi log.
 */
async function processDueLocks(client, store, records) {
  if (!records || records.length === 0) return { guilds: 0, restored: 0 };
  const botKey = process.env.PROTOGON_BOT_KEY || undefined;

  const byGuild = new Map();
  for (const rec of records) {
    if (!byGuild.has(rec.guildId)) byGuild.set(rec.guildId, []);
    byGuild.get(rec.guildId).push(rec);
  }

  let restoredTotal = 0;
  for (const [guildId, recs] of byGuild) {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        // Bot đã rời server → quyền cũng đã mất cùng server, bản ghi chỉ còn
        // làm nhiễu mỗi lượt tick. Xoá.
        for (const r of recs) {
          await store.client
            .mutation("channelLocks:botReleaseChannelLock", {
              botKey,
              guildId,
              channelId: r.channelId,
              roleId: r.roleId,
            })
            .catch(() => {});
        }
        continue;
      }
      const config = await store.getConfig(guildId).catch(() => null);
      const { restored, failed } = await releaseLocks({
        client,
        guild,
        records: recs,
        store,
        botKey,
      });
      if (failed.length)
        console.error(`[channelLock] mở khoá lỗi ${guildId}: ${failed.join(" | ")}`);
      if (restored.length === 0) continue;
      restoredTotal += restored.length;
      const roleIds = new Set(recs.map((r) => r.roleId));
      await sendLog(
        guild,
        config,
        lockLogEmbed({
          action: "unlock",
          channelNames: restored.slice(0, 20),
          roleLabel:
            roleIds.size === 1 ? roleLabel(guild, recs[0].roleId) : `${roleIds.size} nhóm role`,
          duration: null,
          auto: true,
        }),
      );
      console.log(`[channelLock] ${guildId}: tự mở khoá ${restored.length} kênh (hết hạn)`);
    } catch (e) {
      console.error(`[channelLock] tick ${guildId}:`, e?.message || e);
    }
  }
  return { guilds: byGuild.size, restored: restoredTotal };
}

module.exports = {
  parseLockMinutes,
  formatLockDuration,
  channelLockKind,
  readPermission,
  resolveTargetRole,
  collectChatChannels,
  lockChannel,
  unlockChannel,
  releaseLocks,
  processDueLocks,
  botCanManageChannels,
  channelLabel,
  roleLabel,
  lockLogEmbed,
};
