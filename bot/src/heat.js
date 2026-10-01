/**
 * Hệ thống nhiệt độ vi phạm (Heat system).
 *
 * Mỗi vi phạm cộng "nhiệt" theo cài đặt của module. Nhiệt tự giảm theo thời gian
 * (decay) và chia 4 giai đoạn hình phạt: cảnh báo (warnAt) → tạm khóa (timeoutAt)
 * → kick (kickAt) → ban (banAt).
 *
 * Chống tái phạm: nếu thành viên vừa bị phạt (warn/timeout/kick/ban) mà tái phạm
 * trong cửa sổ heatRepeatWindowMin, điểm nhiệt lần sau được nhân với
 * heatRepeatMultiplier → đầy thanh nhanh hơn.
 *
 * Warn tích lũy (moderation): khi hình phạt là "warn", mỗi lần vi phạm đếm 1
 * strike; đủ warnStrikeLimit lần trong cửa sổ → tự tăng cấp thành warnStrikePunish.
 */
const { UserFlags } = require("discord.js");
const timeoutWatch = require("./timeoutWatch");
// MISFIRE FEEDBACK (vòng 11): phạt tự động thành công → ghi chú chờ mod xét —
// mod gỡ phạt sau đó = phạt nhầm đã xác nhận → AI tự soi khi phân tích lần sau.
const misfire = require("./misfire");
const actionBudget = require("./actionBudget");

const TIER_STRENGTH = { warn: 1, timeout: 2, kick: 3, ban: 4 };
const HEAT_MAX = 100;
const MIN_MS = 60_000;
const MAX_WARN_STRIKE_WINDOW_MIN = 1440;

/** Lấy cài đặt nhiệt độ + warn strike của guild (kèm giá trị mặc định). */
function heatSettings(config) {
  return {
    enabled: config?.heatEnabled !== false,
    decayPerMin: Math.max(0, config?.heatDecayPerMin ?? 3),
    warnAt: config?.heatWarnAt ?? 25,
    timeoutAt: config?.heatTimeoutAt ?? 40,
    kickAt: config?.heatKickAt ?? 70,
    banAt: config?.heatBanAt ?? 90,
    repeatMultiplier: Math.max(1, Math.min(10, config?.heatRepeatMultiplier ?? 2)),
    repeatWindowMin: Math.max(1, Math.min(1440, config?.heatRepeatWindowMin ?? 30)),
    warnStrikeLimit: Math.max(0, Math.min(20, config?.warnStrikeLimit ?? 3)),
    warnStrikeWindowMin: Math.max(
      1,
      Math.min(MAX_WARN_STRIKE_WINDOW_MIN, config?.warnStrikeWindowMin ?? 60),
    ),
    warnStrikePunish: config?.warnStrikePunish ?? "timeout",
  };
}

/** Bậc nhiệt hiện tại dựa trên các ngưỡng. */
function tierFor(heat, s) {
  if (heat >= s.banAt) return "ban";
  if (heat >= s.kickAt) return "kick";
  if (heat >= s.timeoutAt) return "timeout";
  if (heat >= s.warnAt) return "warn";
  return "safe";
}

/**
 * Thực thi một hình phạt đơn. Trả về { action, caseNumber }:
 *  - action: mô tả hành động đã làm (string).
 *  - caseNumber: số case moderation của server (kiểu Carl-bot) hoặc undefined.
 * Nếu truyền `store`, ghi luôn vào bảng hình phạt trên dashboard.
 */
async function punishMember(guild, member, punishType, reason, timeoutSeconds = 300, store) {
  // GLOBAL ACTION BUDGET: trần tổng punish tự động/phút/guild — chống phản ứng
  // dây chuyền khi 1 trận nuke kích nhiều module cùng lúc (spam + massMessage
  // + antinuke + heat leo thang). Vượt trần → bỏ qua phạt (bảo toàn được ghi
  // bình thường ở nơi gọi). Fail-open: mọi lỗi nội tại → vẫn phạt (đang bị nuke
  // thật thì chặn nhầm còn nguy hơn). Mod thủ công không đi qua hàm này.
  const budgetKey = guild?.id;
  if (budgetKey) {
    let config = null;
    try {
      config = await store?.getConfig?.(budgetKey);
    } catch {
      // lấy config lỗi → dùng mặc định, không chặn phạt
    }
    if (!actionBudget.canPunish(budgetKey, config)) {
      console.warn(
        `[budget] ${budgetKey}: vượt trần ${actionBudget.usage(budgetKey)}/${actionBudget.budgetLimitFor(config)} punish tự động/phút — bỏ qua ${punishType}`,
      );
      return {
        action: "bỏ qua: vượt trần hành động tự động/phút (action budget)",
        caseNumber: undefined,
      };
    }
    actionBudget.recordPunish(budgetKey);
  }
  let result;
  if (punishType === "timeout") {
    const seconds = Math.max(1, Math.min(86400, Math.floor(timeoutSeconds || 300)));
    try {
      await member.timeout(seconds * 1000, reason);
      // Track vào timeoutWatch để khi hết hạn TỰ NHIÊN có embed "⏱️ Timeout hết
      // hạn" — nhất quán với timeout thủ công (modTools.timeoutMember). Nếu mod
      // gỡ sớm (lệnh /mod untimeout hoặc bấm trên Discord) thì timeoutWatch
      // forget → không log nhầm. Chỉ track khi áp dụng THÀNH CÔNG.
      timeoutWatch.track(guild.id, member.id, Date.now() + seconds * 1000);
      result = `đã tạm khóa ${Math.round(seconds / 60)} phút`;
    } catch {
      result = "không thể tạm khóa (thiếu quyền)";
    }
  } else if (punishType === "warn") {
    try {
      await member.send(
        `⚠️ **Cảnh báo từ Protogon**\n${reason}\n\nĐây là cảnh báo tự động từ hệ thống bảo vệ. Vui lòng dừng hành vi này.`,
      );
      result = "đã cảnh báo qua DM";
    } catch {
      result = "đã cố cảnh báo (DM đóng)";
    }
  } else {
    // CHỐNG BAN NHẦM BOT HỢP LỆ: bot xác minh (tick) hoặc đã ở lại server >= 7
    // ngày là bot được mời chính thức (Carl-bot, Dyno, Wick…) — không bao giờ
    // ban/kick, THỰC THI timeout thay thế. Chỉ bot MỚI (bot nuke vừa thêm) bị ban.
    // (Lỗi cũ: chỉ đổi biến punishType rồi vẫn rơi xuống nhánh ban — bot tin cậy
    // vẫn bị ban; giờ hạ cấp bằng cách gọi timeout trực tiếp.)
    const user = member?.user ?? member;
    const isBot = user?.bot === true;
    const verified =
      typeof user?.flags?.has === "function" && user.flags.has(UserFlags.VerifiedBot);
    const joinedLong =
      typeof member?.joinedTimestamp === "number" &&
      Date.now() - member.joinedTimestamp >= 7 * 86_400_000;
    if (isBot && (verified || joinedLong) && (punishType === "ban" || punishType === "kick")) {
      const seconds = Math.max(1, Math.min(86400, Math.floor(timeoutSeconds || 300)));
      try {
        await member.timeout(seconds * 1000, reason);
        timeoutWatch.track(guild.id, member.id, Date.now() + seconds * 1000);
        result = `bot tin cậy bị hạ cấp: đã tạm khóa ${Math.round(seconds / 60)} phút (thay vì ${punishType})`;
        punishType = "timeout";
      } catch {
        result = "không thể tạm khóa bot (thiếu quyền) — bỏ qua hình phạt mạnh";
        punishType = "timeout";
      }
    } else {
      try {
        if (punishType === "kick") {
          await member.kick(reason);
          result = "đã kick";
        } else {
          await member.ban({ reason, deleteMessageSeconds: 0 });
          result = "đã ban";
        }
      } catch {
        result = "không thể xử lý (thiếu quyền)";
      }
    }
  }
  let caseNumber;
  if (store) {
    try {
      const rec = await store.client.mutation("bot_writes:botRecordModAction", {
        guildId: guild.id,
        action: `Tự động: ${punishType}`,
        targetId: member.id,
        targetName: member.user?.username ?? undefined,
        reason: reason || undefined,
        details: result,
      });
      caseNumber = rec?.caseNumber;
    } catch (e) {
      console.error(`[heat:record] ${guild.id}:`, e.message);
    }
    // Lưu ý: thông báo cho người dùng sẽ do embed case (sendCaseLog) ở nơi gọi
    // (filters.js / antinuke.js) gửi — đồng bộ với phần Moderation trên web.
  }
  // MISFIRE FEEDBACK (vòng 11): chỉ ghi khi phạt áp dụng THÀNH CÔNG (result bắt
  // đầu bằng "đã") — lỗi quyền/budget thì không có phạt nào để mod gỡ.
  if (typeof result === "string" && result.startsWith("đã")) {
    misfire.notePunished(guild.id, member.id, punishType);
  }
  return { action: result, caseNumber };
}

/**
 * Quyết định hình phạt cuối cùng: nếu nhiệt độ đủ cao để tăng cấp
 * (mạnh hơn hình phạt mặc định của module) thì dùng bậc nhiệt.
 */
function choosePunish(basePunish, heatResult) {
  if (!heatResult) return basePunish;
  if (TIER_STRENGTH[heatResult.tier] > TIER_STRENGTH[basePunish]) return heatResult.tier;
  return basePunish;
}

/** Chuỗi tóm tắt nhiệt độ để thêm vào log (vd: " · +10 nhiệt → 40/100"). */
function heatSummary(heatResult) {
  if (!heatResult) return "";
  const extra = [];
  if (heatResult.repeated) extra.push(`tái phạm x${heatResult.multiplier}`);
  if (heatResult.warned) extra.push("⚠️ đã DM cảnh báo");
  const tag = extra.length > 0 ? ` (${extra.join(", ")})` : "";
  return ` · +${heatResult.added} nhiệt → ${Math.round(heatResult.heat)}/${HEAT_MAX}${tag}`;
}

class HeatTracker {
  constructor(client, store) {
    this.client = client;
    this.store = store;
    this.states = new Map(); // `${guildId}:${userId}` -> { heat, updatedAt, lastPunishedAt, username }
    this.warned = new Set(); // đã gửi cảnh báo DM cho ngưỡng này
    this.strikes = new Map(); // `${guildId}:${userId}` -> { count, firstAt, username } (warn tích lũy)
    this.pending = new Set(); // guildId đang chờ đồng bộ lên Convex
    this.timers = new Map(); // guildId -> setTimeout id
  }

  _key(guildId, userId) {
    return `${guildId}:${userId}`;
  }

  _decay(entry, s) {
    const elapsedMin = (Date.now() - entry.updatedAt) / MIN_MS;
    return Math.max(0, Math.round(entry.heat - elapsedMin * s.decayPerMin));
  }

  /**
   * Dọn entry nguội của guild im lặng (memGuard gọi định kỳ). flushGuild chỉ
   * dọn guild CÓ vi phạm mới — guild im lặng lâu ngày vẫn giữ entry cũ mãi.
   * Trả về số entry đã dọn.
   */
  sweepCold() {
    let removed = 0;
    for (const [key, entry] of this.states) {
      // Entry nguội hoàn toàn và không còn trong cửa sổ tái phạm → bỏ.
      // Cửa sổ dùng trần cấu hình cho phép (1440 phút) — không đọc config từng
      // guild (tốn call); guild nào có entry nóng thì flushGuild tự giữ đúng.
      //
      // Tốc độ giảm lấy từ decay GHI KÈM entry (`add`/`getHeat` cập nhật theo
      // config mới nhất của guild). Trước đây hardcode 1 điểm/phút cho mọi
      // guild, nên guild cấu hình decay < 1 (kể cả 0 = không bao giờ giảm) bị
      // coi là đã nguội → dọn MẤT nhiệt còn sống: mất trí nhớ leo thang và
      // lệch với hàng heatStates bên Convex (bảng vẫn còn nhiệt). Entry cũ
      // không có field (dữ liệu cũ) → giữ nguyên hành vi 1 điểm/phút.
      const decayPerMin = Number.isFinite(entry.decayPerMin) ? entry.decayPerMin : 1;
      const heat = Math.max(
        0,
        Math.round(entry.heat - ((Date.now() - entry.updatedAt) / MIN_MS) * decayPerMin),
      );
      if (heat > 0) continue;
      if (entry.lastPunishedAt && Date.now() - entry.lastPunishedAt < 1440 * MIN_MS) continue;
      this.states.delete(key);
      this.warned.delete(key);
      removed++;
    }
    // Strikes: chỉ dọn sau cửa sổ cấu hình dài nhất để không cắt tích lũy đang hiệu lực.
    for (const [key, st] of this.strikes) {
      if (Date.now() - st.firstAt > MAX_WARN_STRIKE_WINDOW_MIN * MIN_MS) {
        this.strikes.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /** Nhiệt độ hiệu dụng (đã trừ decay) của một thành viên. */
  getHeat(guildId, userId, s) {
    const key = this._key(guildId, userId);
    const entry = this.states.get(key);
    if (!entry) return 0;
    const heat = this._decay(entry, s);
    // Cập nhật tốc độ giảm theo config MỚI NHẤT (đọc là đường đi thường gặp:
    // mỗi vi phạm, mỗi lần xem /heat status) → sweeper dọn đúng cả khi guild
    // đổi heatDecayPerMin sau khi entry đã được tạo.
    if (Number.isFinite(s?.decayPerMin)) entry.decayPerMin = s.decayPerMin;
    if (heat <= 0) {
      this.warned.delete(key);
      // Nhiệt nguội về 0 NHƯNG còn trong cửa sổ tái phạm → GIỮ entry: đây là
      // chỗ DUY NHẤT nhớ `lastPunishedAt`, xoá đi là mất luôn hệ số nhân tái
      // phạm (bug thật: `add()` gọi `getHeat()` trước khi đọc entry, nên mọi
      // lần tái phạm sau khi nhiệt đã nguội về 0 đều không được nhân — trong
      // khi cả `flushGuild` lẫn `sweepCold` đều cố ý giữ entry cho mục đích
      // này, tức phần giữ đó trước giờ vô hiệu). Hết cửa sổ thì dọn ngay tại
      // đây, nên không rò rỉ RAM.
      const withinRepeat =
        !!entry.lastPunishedAt && Date.now() - entry.lastPunishedAt < s.repeatWindowMin * MIN_MS;
      if (!withinRepeat) this.states.delete(key);
    } else if (heat < s.warnAt) {
      this.warned.delete(key); // nguội xuống dưới ngưỡng → có thể cảnh báo lại lần sau
    }
    return heat;
  }

  /** Gửi cảnh báo DM khi thành viên chạm ngưỡng warnAt (mỗi chu kỳ 1 lần). */
  async _maybeWarn(guildId, userId, heat, s) {
    const key = this._key(guildId, userId);
    if (heat < s.warnAt || this.warned.has(key)) return false;
    this.warned.add(key);
    try {
      const guild = this.client.guilds.cache.get(guildId);
      const member = guild ? await guild.members.fetch(userId).catch(() => null) : null;
      if (!member) return true;
      await member.send(
        `🔥 **Cảnh báo nhiệt độ từ Protogon**\n\n` +
          `Bạn vừa đạt **${heat}/${HEAT_MAX}** điểm nhiệt vi phạm tại **${guild.name}**.\n` +
          `Tiếp tục vi phạm sẽ bị:\n` +
          `• Tạm khóa khi chạm **${s.timeoutAt}**\n` +
          `• Kick khi chạm **${s.kickAt}**\n` +
          `• Ban khi chạm **${s.banAt}**\n\n` +
          `Nhiệt độ tự giảm ${s.decayPerMin} điểm mỗi phút. Hãy dừng hành vi vi phạm!`,
      );
      return true;
    } catch {
      return true; // DM đóng — vẫn tính là đã cảnh báo để không spam lại
    }
  }

  /**
   * Cộng nhiệt cho một vi phạm. Nếu đang trong cửa sổ tái phạm (vừa bị phạt),
   * điểm nhiệt được nhân với heatRepeatMultiplier.
   */
  async add(guildId, userId, username, points, s) {
    if (!s.enabled || points <= 0) return null;
    const key = this._key(guildId, userId);
    const prev = this.getHeat(guildId, userId, s);
    let repeated = false;
    const entry = this.states.get(key);
    if (entry?.lastPunishedAt) {
      const minutesSince = (Date.now() - entry.lastPunishedAt) / MIN_MS;
      if (minutesSince < s.repeatWindowMin) {
        points *= s.repeatMultiplier;
        repeated = true;
      }
    }
    const heat = Math.min(HEAT_MAX, prev + Math.round(points));
    this.states.set(key, {
      heat,
      updatedAt: Date.now(),
      lastPunishedAt: entry?.lastPunishedAt,
      username,
      // Nhớ tốc độ giảm của guild ngay trên entry để sweeper dọn đúng (xem sweepCold).
      decayPerMin: s.decayPerMin,
    });
    const warned = await this._maybeWarn(guildId, userId, heat, s);
    this._scheduleFlush(guildId);
    return {
      heat,
      tier: tierFor(heat, s),
      added: heat - prev,
      warned,
      repeated,
      multiplier: s.repeatMultiplier,
    };
  }

  /** Ghi nhận thời điểm bị phạt (để lần tái phạm sau nhân nhiệt). */
  markPunished(guildId, userId) {
    const key = this._key(guildId, userId);
    const entry = this.states.get(key);
    this.states.set(key, {
      heat: entry?.heat ?? 0,
      updatedAt: entry?.updatedAt ?? Date.now(),
      lastPunishedAt: Date.now(),
      username: entry?.username,
      decayPerMin: entry?.decayPerMin, // giữ nguyên tốc độ giảm sweeper cần
    });
  }

  /**
   * Đếm warn tích lũy. Trả về { escalated, punish, count }:
   *  - punish === "warn" + escalated=false: chưa đủ ngưỡng, chỉ cảnh báo.
   *  - escalated=true: đủ warnStrikeLimit lần → tăng cấp warnStrikePunish (và reset đếm).
   *  - limit <= 0: tắt tính năng, luôn trả warn.
   */
  strike(guildId, userId, s, username) {
    const key = this._key(guildId, userId);
    if (!s.warnStrikeLimit) return { escalated: false, punish: "warn", count: 0 };
    const now = Date.now();
    const hit = this.strikes.get(key);
    let count = 0;
    if (hit && now - hit.firstAt < s.warnStrikeWindowMin * MIN_MS) {
      count = hit.count;
    }
    count += 1;
    if (count >= s.warnStrikeLimit) {
      this.strikes.delete(key);
      this._scheduleFlush(guildId);
      return { escalated: true, punish: s.warnStrikePunish, count };
    }
    // `firstAt` là mốc strike ĐẦU của cửa sổ: chỉ đặt lại khi mở cửa sổ mới. Ghi
    // `now` ở mọi strike thì cửa sổ trượt theo strike cuối — strike cách nhau 59
    // phút tích luỹ mãi và tăng cấp dù cửa sổ cấu hình chỉ 60 phút.
    this.strikes.set(key, {
      count,
      firstAt: count > 1 ? hit.firstAt : now,
      username: username || hit?.username,
    });
    this._scheduleFlush(guildId);
    return { escalated: false, punish: "warn", count };
  }

  /** Xóa toàn bộ warn tích lũy của một thành viên (lệnh gỡ warn). */
  clearStrikes(guildId, userId) {
    const key = this._key(guildId, userId);
    this.strikes.delete(key);
    this._scheduleFlush(guildId);
  }

  /** Số strike hiện tại của một thành viên (cho /heat status). */
  strikeCount(guildId, userId, s) {
    const hit = this.strikes.get(this._key(guildId, userId));
    if (!hit || Date.now() - hit.firstAt >= s.warnStrikeWindowMin * MIN_MS) return 0;
    return hit.count;
  }

  /** Username của lần warn tích lũy gần nhất (cho embed case log), hoặc null. */
  strikeUsername(guildId, userId) {
    const hit = this.strikes.get(this._key(guildId, userId));
    return hit?.username || null;
  }

  /** Chụp nhiệt độ hiện tại của toàn guild (cho báo cáo hàng ngày). */
  heatSnapshot(guildId, s) {
    const prefix = `${guildId}:`;
    const out = [];
    for (const [key, entry] of this.states) {
      if (!key.startsWith(prefix)) continue;
      const heat = this._decay(entry, s);
      if (heat <= 0) continue;
      out.push({
        userId: key.slice(prefix.length),
        username: entry.username ?? "",
        heat,
        tier: tierFor(heat, s),
      });
    }
    return out.sort((a, b) => b.heat - a.heat).slice(0, 15);
  }

  /** Chụp warn tích lũy hiện tại của toàn guild (cho báo cáo hàng ngày). */
  strikeSnapshot(guildId, s) {
    const prefix = `${guildId}:`;
    const out = [];
    const now = Date.now();
    for (const [key, hit] of this.strikes) {
      if (!key.startsWith(prefix)) continue;
      if (now - hit.firstAt >= s.warnStrikeWindowMin * MIN_MS) continue;
      out.push({
        userId: key.slice(prefix.length),
        username: hit.username ?? "",
        count: hit.count,
        limit: s.warnStrikeLimit,
      });
    }
    return out.sort((a, b) => b.count - a.count).slice(0, 15);
  }

  /** Xóa nhiệt trong bộ nhớ (khi dashboard yêu cầu reset) + xóa hàng tương ứng trên Convex. */
  resetGuild(guildId, userId) {
    const prefix = `${guildId}:`;
    const exact = userId ? `${guildId}:${userId}` : null;
    const removed = new Set();
    for (const key of [...this.states.keys()]) {
      if (!key.startsWith(prefix)) continue;
      if (exact && key !== exact) continue;
      this.states.delete(key);
      this.warned.delete(key);
      removed.add(key.slice(prefix.length));
    }
    for (const key of [...this.strikes.keys()]) {
      if (!key.startsWith(prefix)) continue;
      if (exact && key !== exact) continue;
      this.strikes.delete(key);
      removed.add(key.slice(prefix.length));
    }
    this.pending.delete(guildId);
    for (const uid of removed) {
      void this.store.client
        .mutation("bot_writes:botRecordHeat", {
          guildId,
          userId: uid,
          heat: 0,
          updatedAt: Date.now(),
          warnStrikes: 0,
        })
        .catch((e) => console.error("[heat:reset]", e.message));
    }
  }

  /** Đánh dấu guild cần đồng bộ lên Convex (gộp nhiều thay đổi, 15 giây/lần). */
  _scheduleFlush(guildId) {
    this.pending.add(guildId);
    if (this.timers.has(guildId)) return;
    this.timers.set(
      guildId,
      setTimeout(() => {
        this.timers.delete(guildId);
        void this.flushGuild(guildId);
      }, 15_000),
    );
  }

  /**
   * Ghi toàn bộ nhiệt + warn tích lũy của một guild lên Convex.
   * Fire-and-forget: các mutation chạy song song, không block nhau.
   */
  async flushGuild(guildId) {
    this.pending.delete(guildId);
    this.timers.delete(guildId);
    let config = null;
    try {
      config = await this.store.getConfig(guildId);
    } catch {
      // vẫn dùng cài đặt mặc định
    }
    const s = heatSettings(config);
    const prefix = `${guildId}:`;
    const flushedAt = Date.now();
    const keys = new Set([
      ...[...this.states.keys()].filter((k) => k.startsWith(prefix)),
      ...[...this.strikes.keys()].filter((k) => k.startsWith(prefix)),
    ]);
    // GOM tất cả member của guild vào MỘT mutation batch (botRecordHeatBatch)
    // thay vì N mutation riêng lẻ — giảm mạnh operations khi nhiều user nóng.
    const entries = [];
    for (const key of keys) {
      const [, userId] = key.split(":");
      const entry = this.states.get(key);
      const heat = entry ? this._decay(entry, s) : 0;
      const strikes = this.strikeCount(guildId, userId, s);
      entries.push({
        userId,
        username: entry?.username || this.strikes.get(key)?.username || undefined,
        heat: Math.max(0, heat),
        // `heat` đã trừ decay TỚI BÂY GIỜ nên mốc thời gian phải là bây giờ. Giữ
        // entry.updatedAt thì mọi nơi đọc (loadHeatStates, HeatBar, StatsPage) lại
        // trừ decay lần nữa cho đoạn [updatedAt, bây giờ] — người đang nóng 30
        // hiện 0 và biến khỏi /heat top.
        updatedAt: flushedAt,
        warnStrikes: strikes,
      });
      // Chống rò rỉ RAM: entry nhiệt = 0 và không còn trong cửa sổ tái phạm
      // thì xóa khỏi bộ nhớ (bảng Convex đã được botRecordHeatBatch dọn tương ứng).
      if (heat <= 0 && strikes <= 0) {
        const keepPunished =
          !!entry?.lastPunishedAt && Date.now() - entry.lastPunishedAt < s.repeatWindowMin * MIN_MS;
        if (!keepPunished) {
          this.states.delete(key);
          this.warned.delete(key);
        }
      }
    }
    if (entries.length > 0) {
      await this.store.client
        .mutation("bot_writes:botRecordHeatBatch", { guildId, entries })
        .catch((e) => console.error("[heat:flush]", e.message));
    }
  }

  /** Ghi tất cả guild còn chờ (chạy song song tất cả guilds). */
  async flushAll() {
    const pending = [...this.pending];
    this.pending.clear();
    await Promise.allSettled(pending.map((guildId) => this.flushGuild(guildId)));
  }
}

module.exports = {
  HeatTracker,
  heatSettings,
  tierFor,
  TIER_STRENGTH,
  HEAT_MAX,
  punishMember,
  choosePunish,
  heatSummary,
  actionBudget,
};
