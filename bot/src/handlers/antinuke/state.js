"use strict";
/**
 * State + tiện ích nền: bucket đo tần suất trong RAM, chống trùng phạt/case,
 * đọc audit log, dọn bộ nhớ định kỳ. recordEvent ghi sự kiện lên Convex.
 */
const { AuditLogEvent } = require("discord.js");
const { BUCKET_MAX } = require("./shared");

module.exports = function createAntiNukeState({ client, store }) {
  /** Persist a punished event for the daily report. Fire-and-forget. */
  async function recordEvent(guildId, payload) {
    try {
      await store.client.mutation("bot_writes:botRecordAntinukeEvent", { guildId, ...payload });
    } catch (err) {
      console.error("[antinuke:record]", err.message);
    }
  }
  const buckets = new Map(); // `${guildId}:${module}` -> [timestamps]
  // Nhánh MIỄN TRỪ (owner/whitelist/admin): đếm riêng theo từng executor.
  // `buckets` gộp mọi người vào cùng một số đếm — nếu nhánh miễn trừ cũng
  // đếm vào đó thì hành vi của mod được miễn sẽ vô tình vũ khí hóa ngưỡng
  // phạt của người khác (mod tạo 2 webhook → raider tạo webhook đầu tiên
  // bị phạt oan). Số ở đây chỉ quyết định có DM cảnh báo owner hay không.
  const exemptBuckets = new Map(); // `${guildId}:${module}:${executorId}` -> [timestamps]
  const joiners = new Map(); // guildId -> [{id, ts}]
  const spamBuckets = new Map(); // `${guildId}:${userId}` -> [timestamps]
  const patternBuckets = new Map(); // `${guildId}:${userId}:${pattern}` -> [timestamps]
  const recentMessages = new Map(); // `${guildId}:${userId}` -> [{content, ts}] (mẫu cho AI)
  const appEvents = new Map(); // guildId -> [{ts, appName, executorId, executorName}] (external app)
  const appMsgSamples = new Map(); // `${guildId}:${appId}` -> [{content, ts, id, channelId}] (spam message từ app)
  const buttonClickEvents = new Map(); // `${guildId}:${messageId}` -> {appId, channelId, clicks:[{userId, ts}]} (raid nút bấm)
  const lastConfigs = new Map(); // guildId -> config (đã đọc gần nhất)
  // Bot hit-and-run: `${guildId}:${botId}` -> addedAt (ms). Ghi khi BotAdd (audit log
  // guildMemberAdd của bot), xóa khi bot rời — nếu rời trong cửa sổ → botHitAndRun.
  const botAddTimes = new Map();
  // `${guildId}:${botId}` -> bot CÓ ĐƯỢC miễn trừ (owner/admin/mod/whitelist)
  // tại thời điểm được thêm hay không. Cần nhớ LÚC JOIN vì tới lúc bot rời thì
  // roles.cache đã rỗng ⇒ isExempt() trả false cho MỌI bot, kể cả bot hợp pháp
  // do mod chủ động thêm ⇒ module botHitAndRun (phạt ban) phạt oan.
  const botExemptAtJoin = new Map();
  // Chống log "chồng chặp" (trùng lặp):
  //  - appUserHandledAt: người dùng app vừa bị xử lý bởi 1 tầng (audit IntegrationCreate
  //    hoặc tầng tin nhắn app) trong cửa sổ → tầng còn lại bỏ qua, không phạt/log trùng.
  //  - lastExtAppProcessedAt: guild vừa xử lý 1 đợt kết nối app → IntegrationCreate kế tiếp
  //    trong cùng cửa sổ không log thành vụ mới (1 làn sóng = 1 sự kiện).
  //  - patternPunishedAt: ĐÃ BỎ. Chống phạt lặt cho pattern (tin dài/lặp/blank) dùng
  //    chung `punishedRecently` qua markHandled/wasHandled như massJoin — map riêng
  //    không ai ghi nên chỉ là trạng thái chết + nhầm lẫn.
  const appUserHandledAt = new Map(); // `${guildId}:${userId}` -> ts
  const lastExtAppProcessedAt = new Map(); // guildId -> ts
  const buttonRaidHandledAt = new Map(); // `${guildId}:${msgId}` -> ts — debounce vụ bấm nút đã xử lý
  const staleUnlockSwept = new Set(); // guild key mốc đã quét (chống spam log mở khóa)
  const punishedRecently = new Map(); // `${guildId}:${module}:${userId}` -> ts (chống phạt/case lặp)

  function record(guildId, module, cfg) {
    const key = `${guildId}:${module}`;
    const arr = buckets.get(key) ?? [];
    const now = Date.now();
    arr.push(now);
    const cutoff = now - cfg.windowSeconds * 1000;
    const pruned = arr.filter((t) => t >= cutoff);
    buckets.set(key, pruned);
    return pruned.length;
  }

  /**
   * Đếm hành vi riêng của MỘT executor được miễn trừ (owner/whitelist/admin).
   * Tách bucket khỏi `record()` để không đè ngưỡng phạt của người khác — xem
   * giải thích ở khai báo `exemptBuckets`.
   */
  function recordExempt(guildId, module, cfg, executorId) {
    const key = `${guildId}:${module}:${executorId}`;
    const arr = exemptBuckets.get(key) ?? [];
    const now = Date.now();
    arr.push(now);
    const cutoff = now - cfg.windowSeconds * 1000;
    const pruned = arr.filter((t) => t >= cutoff);
    exemptBuckets.set(key, pruned);
    return pruned.length;
  }

  /** Danh dau 1 vu da phat/hanh dong — window chong lap phat + lap case log. */
  function markHandled(guildId, module, userId, windowMs) {
    if (!userId) return;
    punishedRecently.set(`${guildId}:${module}:${userId}`, { ts: Date.now(), ms: windowMs });
    if (punishedRecently.size > 2000) {
      const now = Date.now();
      for (const [k, v] of punishedRecently) {
        if (now - v.ts > v.ms) punishedRecently.delete(k);
      }
    }
  }

  /** Da phat/hanh dong cho cung module + thu pham trong window chua? (chong log/case trung). */
  function wasHandled(guildId, module, userId) {
    if (!userId) return false;
    const hit = punishedRecently.get(`${guildId}:${module}:${userId}`);
    return !!hit && Date.now() - hit.ts < hit.ms;
  }

  function appUserHandledRecently(guildId, userId, windowMs) {
    if (!userId) return false;
    const ts = appUserHandledAt.get(`${guildId}:${userId}`);
    return !!ts && Date.now() - ts < windowMs;
  }

  function markAppUserHandled(guildId, userId) {
    if (!userId) return;
    appUserHandledAt.set(`${guildId}:${userId}`, Date.now());
  }

  /** Số thành viên mới vào server trong cửa sổ (đo làn sóng raid đang diễn ra). */
  function recentJoinCount(guildId, windowMs) {
    const arr = joiners.get(guildId) ?? [];
    const cutoff = Date.now() - windowMs;
    return arr.filter((j) => j.ts >= cutoff).length;
  }

  async function auditLookup(guild, eventType, targetId) {
    // Nếu chỉ lấy 5 entry, một burst kick có thể đẩy target ra khỏi cửa sổ và
    // khiến bot tưởng bot tự rời. Lấy đủ 50 entry; khi target vẫn miss nhưng
    // cửa sổ đã đầy, caller phải coi đây là UNKNOWN, không được phạt oan.
    const limit = 50;
    try {
      const fetched = await guild.fetchAuditLogs({ type: eventType, limit });
      if (targetId) {
        const entry = fetched.entries.find((e) => e.target?.id === targetId);
        const entryCount = fetched.entries.size ?? fetched.entries.length ?? 0;
        return {
          ok: true,
          found: !!entry,
          ambiguous: !entry && entryCount >= limit,
          executor: entry?.executor ?? null,
        };
      }
      const first = fetched.entries.first();
      return { ok: true, found: !!first, ambiguous: false, executor: first?.executor ?? null };
    } catch {
      return { ok: false, found: false, ambiguous: true, executor: null };
    }
  }

  async function auditExecutor(guild, eventType, targetId) {
    const result = await auditLookup(guild, eventType, targetId);
    return result.executor;
  }

  /** Xác định người dùng đã TẠO webhook (audit log WebhookCreate) — để phạt đúng người kết nối app. */
  async function webhookCreator(guild, webhookId) {
    try {
      const fetched = await guild.fetchAuditLogs({ type: AuditLogEvent.WebhookCreate, limit: 10 });
      const entry = fetched.entries.find((e) => e.target?.id === webhookId);
      return entry?.executor ?? null;
    } catch {
      return null;
    }
  }

  /** Dọn bộ nhớ định kỳ: xóa entry cũ của guild đã rời / vượt cửa sổ. */
  function sweepMemory() {
    const now = Date.now();
    // Khai báo TRƯỚC mọi vòng lặp dùng nó: `const` sau vòng exemptBuckets khiến
    // lần quét đầu tiên có entry exempt ném ReferenceError (TDZ) → sập bot.
    const stale = now - 600_000;
    const live = new Set(client.guilds.cache.keys());
    for (const [key] of buckets) {
      const guildId = key.split(":")[0];
      if (!live.has(guildId)) buckets.delete(key);
    }
    for (const [key, arr] of exemptBuckets) {
      const guildId = key.split(":")[0];
      if (!live.has(guildId)) {
        exemptBuckets.delete(key);
        continue;
      }
      const fresh = arr.filter((t) => t >= stale);
      if (fresh.length === 0) exemptBuckets.delete(key);
      else exemptBuckets.set(key, fresh);
    }
    // Chống rò rỉ RAM: ngoài việc xóa guild đã rời, còn loại luôn entry cũ
    // quá 10 phút của guild ĐANG hoạt động (trước đây cứ tích lại mãi).
    for (const [guildId, arr] of joiners) {
      if (!live.has(guildId)) {
        joiners.delete(guildId);
        continue;
      }
      const fresh = arr.filter((j) => j.ts >= stale);
      if (fresh.length === 0) joiners.delete(guildId);
      else joiners.set(guildId, fresh);
    }
    for (const [key, ts] of botAddTimes) {
      if (now - ts > 900_000) {
        botAddTimes.delete(key);
        botExemptAtJoin.delete(key);
      }
    }
    for (const [key, arr] of spamBuckets) {
      const guildId = key.split(":")[0];
      if (!live.has(guildId)) {
        spamBuckets.delete(key);
        continue;
      }
      const fresh = arr.filter((t) => t >= stale);
      if (fresh.length === 0) spamBuckets.delete(key);
      else spamBuckets.set(key, fresh);
    }
    for (const [key, arr] of patternBuckets) {
      const guildId = key.split(":")[0];
      if (!live.has(guildId)) {
        patternBuckets.delete(key);
        continue;
      }
      const fresh = arr.filter((t) => t >= stale);
      if (fresh.length === 0) patternBuckets.delete(key);
      else patternBuckets.set(key, fresh);
    }
    for (const [key, arr] of recentMessages) {
      const guildId = key.split(":")[0];
      if (!live.has(guildId)) {
        recentMessages.delete(key);
        continue;
      }
      const fresh = arr.filter((m) => now - m.ts < 60_000);
      if (fresh.length === 0) recentMessages.delete(key);
      else recentMessages.set(key, fresh);
    }
    for (const [guildId, arr] of appEvents) {
      if (!live.has(guildId)) {
        appEvents.delete(guildId);
        continue;
      }
      const fresh = arr.filter((e) => e.ts >= stale);
      if (fresh.length === 0) appEvents.delete(guildId);
      else appEvents.set(guildId, fresh);
    }
    for (const [key, arr] of appMsgSamples) {
      const guildId = key.split(":")[0];
      if (!live.has(guildId)) {
        appMsgSamples.delete(key);
        continue;
      }
      const fresh = arr.filter((e) => e.ts >= stale);
      if (fresh.length === 0) appMsgSamples.delete(key);
      else appMsgSamples.set(key, fresh);
    }
    for (const [key, bucket] of buttonClickEvents) {
      const guildId = key.split(":")[0];
      if (!live.has(guildId)) {
        buttonClickEvents.delete(key);
        continue;
      }
      const fresh = bucket.clicks.filter((c) => c.ts >= stale);
      if (fresh.length === 0) buttonClickEvents.delete(key);
      else buttonClickEvents.set(key, { ...bucket, clicks: fresh });
    }
    for (const [guildId] of lastConfigs) {
      if (!live.has(guildId)) lastConfigs.delete(guildId);
    }
    // Lưu ý: `stale` là MỐC THỜI GIAN (now - 600_000), không phải tuổi. So sánh
    // `now - ts >= stale` luôn sai (tuổi ~1e5 < mốc ~1.7e12) khiến entry của
    // guild đang hoạt động KHÔNG BAO GIỜ hết hạn → rò rỉ RAM. Dùng `ts < stale`.
    for (const [key, ts] of appUserHandledAt) {
      const guildId = key.split(":")[0];
      if (!live.has(guildId) || ts < stale) appUserHandledAt.delete(key);
    }
    for (const [guildId, ts] of lastExtAppProcessedAt) {
      if (!live.has(guildId) || ts < stale) lastExtAppProcessedAt.delete(guildId);
    }
    for (const [key, ts] of buttonRaidHandledAt) {
      const guildId = key.split(":")[0];
      if (!live.has(guildId) || ts < stale) buttonRaidHandledAt.delete(key);
    }
    if (buckets.size > BUCKET_MAX) {
      // Giữ lại 200 key gần nhất (chống phình vô hạn)
      const keys = [...buckets.keys()].slice(0, buckets.size - BUCKET_MAX);
      for (const k of keys) buckets.delete(k);
    }
    if (exemptBuckets.size > BUCKET_MAX) {
      const keys = [...exemptBuckets.keys()].slice(0, exemptBuckets.size - BUCKET_MAX);
      for (const k of keys) exemptBuckets.delete(k);
    }
  }
  return {
    recordEvent,
    record,
    recordExempt,
    markHandled,
    wasHandled,
    appUserHandledRecently,
    markAppUserHandled,
    recentJoinCount,
    auditLookup,
    auditExecutor,
    webhookCreator,
    sweepMemory,
    state: {
      buckets,
      exemptBuckets,
      joiners,
      spamBuckets,
      patternBuckets,
      recentMessages,
      appEvents,
      appMsgSamples,
      buttonClickEvents,
      lastConfigs,
      botAddTimes,
      botExemptAtJoin,
      appUserHandledAt,
      lastExtAppProcessedAt,
      buttonRaidHandledAt,
      staleUnlockSwept,
      punishedRecently,
    },
  };
};
