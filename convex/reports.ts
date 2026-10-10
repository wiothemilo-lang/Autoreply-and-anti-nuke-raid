import { internalMutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { getUserByToken, canManageGuild } from "./auth";
import { requireBotKeyStrict } from "./botAuth";
import { HEAT_DEFAULTS } from "./modules";
import { planForGuild, planLimits } from "./plans";

const EVENT_FIELDS = (e: {
  module: string;
  executorId?: string;
  executorName?: string;
  action: string;
  count: number;
  threshold: number;
  windowSeconds: number;
  punish: string;
  createdAt: number;
}) => ({
  module: e.module,
  executorId: e.executorId ?? null,
  executorName: e.executorName ?? null,
  action: e.action,
  count: e.count,
  threshold: e.threshold,
  windowSeconds: e.windowSeconds,
  punish: e.punish,
  createdAt: e.createdAt,
});

/** Recent anti-nuke events for the dashboard (manager-gated). */
export const recentForGuild = query({
  args: {
    token: v.string(),
    guildId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { token, guildId, limit }) => {
    const user = await getUserByToken(ctx, token);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!canManageGuild(user, guild)) return null;
    const events = await ctx.db
      .query("antinukeEvents")
      .withIndex("by_guildId_createdAt", (q) => q.eq("guildId", guildId))
      .order("desc")
      .take(Math.min(limit ?? 8, 50));
    return events.map(EVENT_FIELDS);
  },
});

/**
 * Paginated event history for the dashboard (manager-gated).
 * Filters: module, from/to timestamp range, and case-insensitive search on the
 * culprit's Discord name.
 */
export const historyForGuild = query({
  args: {
    token: v.string(),
    guildId: v.string(),
    module: v.optional(v.string()),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { token, guildId, module, from, to, search, paginationOpts }) => {
    const user = await getUserByToken(ctx, token);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!canManageGuild(user, guild)) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    let q = ctx.db
      .query("antinukeEvents")
      .withIndex("by_guildId_createdAt", (qq) => qq.eq("guildId", guildId))
      .order("desc");
    if (module) q = q.filter((qq) => qq.eq(qq.field("module"), module));
    if (from !== undefined) q = q.filter((qq) => qq.gte(qq.field("createdAt"), from));
    if (to !== undefined) q = q.filter((qq) => qq.lte(qq.field("createdAt"), to));
    const term = search?.trim().toLowerCase();
    if (term) {
      // Case-insensitive prefix match on the culprit's name: [term, term + maxChar)
      const termUpper = term + "\uffff";
      q = q.filter((qq) =>
        qq.and(
          qq.gte(qq.field("executorNameLower"), term),
          qq.lt(qq.field("executorNameLower"), termUpper),
        ),
      );
    }
    const page = await q.paginate(paginationOpts);
    return { ...page, page: page.page.map(EVENT_FIELDS) };
  },
});

/**
 * Top thành viên bị cảnh báo nhiệt độ (heat) cho trang /stats (manager-gated).
 * Đọc qua index by_guildId_heat theo thứ tự giảm dần — chỉ nhận thành viên còn
 * nhiệt độ (> 0). Bot tự giảm nhiệt theo thời gian, nên record cũ tự rơi khỏi
 * bảng xếp hạng mà không cần dọn dẹp.
 */
export const heatLeaderboard = query({
  args: {
    token: v.string(),
    guildId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { token, guildId, limit }) => {
    const user = await getUserByToken(ctx, token);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!canManageGuild(user, guild)) return null;
    // TRẦN theo gói (P4): `heatTopRows` là đặc quyền dữ liệu của gói trả phí —
    // Miễn phí top 10, Đồng hành 30, Tiên phong 50 (trần cứng cũ). Chặn ở ĐÂY
    // chứ không chỉ ở UI: gọi API trực tiếp với limit lớn cũng bị cắt.
    const { plan } = await planForGuild(ctx, guildId);
    const rows = await ctx.db
      .query("heatStates")
      .withIndex("by_guildId_heat", (q) => q.eq("guildId", guildId))
      .order("desc")
      .take(Math.min(limit ?? 10, planLimits(plan).heatTopRows));
    // Trả kèm decay THẬT của guild: client trừ decay từ `updatedAt` và không được
    // đoán bằng mặc định (guild đặt decay 0 sẽ bị hiện nhiệt thấp hơn thực tế).
    const decayPerMin = guild?.heatDecayPerMin ?? HEAT_DEFAULTS.decayPerMin;
    return rows
      .filter((r) => r.heat > 0)
      .map((r) => ({
        userId: r.userId,
        username: r.username,
        heat: r.heat,
        warnStrikes: r.warnStrikes ?? null,
        updatedAt: r.updatedAt,
        decayPerMin,
      }));
  },
});

/** Danh sách guild đang có bot (dùng cho script chẩn đoán lặp từng guild). */
export const botListGuildIds = query({
  args: { botKey: v.optional(v.string()) },
  handler: async (ctx, { botKey }) => {
    await requireBotKeyStrict(ctx, botKey);
    const guilds = await ctx.db.query("guilds").collect();
    return guilds.filter((g) => g.botInGuild).map((g) => ({ guildId: g.discordId, name: g.name }));
  },
});

/** Tất cả sự kiện chống nuke từ mốc `since` (script chẩn đoán: dup-logs, ext-app).
 * Hàm này bị script gọi nhưng chưa từng tồn tại → script luôn lỗi "Unknown function". */
export const getDailyEvents = query({
  args: {
    since: v.number(),
    /** Chìa khóa bot (botAuth) — script chẩn đoán gửi cùng BOT_KEY từ .env. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, since }) => {
    await requireBotKeyStrict(ctx, botKey);
    const events = await ctx.db
      .query("antinukeEvents")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", since))
      .order("desc")
      .take(2000);
    return events.map(EVENT_FIELDS);
  },
});

/** Sự kiện chống nuke của MỘT guild từ mốc `since` (dùng cho báo cáo hằng ngày).
 * Per-guild thay vì query global: chỉ chạy khi guild thực sự đến hạn báo cáo
 * (tiết kiệm hàng triệu reads/tháng khi nhiều guild). */
/** Hành động mod gần đây của MỘT guild (bot-side, botKey) — dùng cho /report:
 * AI đọc lại các phạt gần nhất để nhận xét xem bot có phạt nhầm hay không.
 */
export const getGuildModActions = query({
  args: {
    guildId: v.string(),
    since: v.number(),
    limit: v.optional(v.number()),
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, guildId, since, limit }) => {
    await requireBotKeyStrict(ctx, botKey);
    const actions = await ctx.db
      .query("modActions")
      .withIndex("by_guildId_createdAt", (q) => q.eq("guildId", guildId).gte("createdAt", since))
      .order("desc")
      .take(Math.min(limit ?? 60, 100));
    return actions.map((a) => ({
      action: a.action,
      targetId: a.targetId ?? null,
      targetName: a.targetName ?? null,
      executorId: a.executorId ?? null,
      executorName: a.executorName ?? null,
      reason: a.reason ?? null,
      details: a.details ?? null,
      caseNumber: a.caseNumber ?? null,
      createdAt: a.createdAt,
    }));
  },
});

export const getGuildEvents = query({
  args: {
    guildId: v.string(),
    since: v.number(),
    limit: v.optional(v.number()),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, guildId, since, limit }) => {
    await requireBotKeyStrict(ctx, botKey);
    const events = await ctx.db
      .query("antinukeEvents")
      .withIndex("by_guildId_createdAt", (q) => q.eq("guildId", guildId).gte("createdAt", since))
      .order("desc")
      .take(Math.min(limit ?? 500, 500));
    return events.map(EVENT_FIELDS);
  },
});

/**
 * PHẢI khớp `MIN_INTERVAL_MS` trong `bot/src/handlers/dailyReport.js` — nếu lệch,
 * bot sẽ bỏ qua báo cáo do cron đặt cờ (gửi chậm tới khi cache hết hạn) hoặc
 * cron đặt cờ cho guild mà bot còn thấy "chưa đến hạn".
 */
const MIN_REPORT_INTERVAL_MS = 20 * 60 * 60 * 1000;

/**
 * ── Chính sách báo cáo KHẨN (raid/nuke) — NGUỒN SỐ DUY NHẤT phía Convex ─────
 *
 * Vì sao tách khỏi UI và khỏi bot: cùng một câu hỏi "khi nào thì báo?" được
 * trả lời ở ba nơi — `updateSettings` (kẹp khi lưu), `getBotConfig` (mặc định
 * cho guild cũ), và `bot/src/handlers/incidentReport.js` (thực thi). Ba bản
 * sao lệch nhau = dashboard hứa một đằng, bot làm một nẻo, không gì báo sai.
 * Bot chạy CommonJS nên KHÔNG import được file này; `scripts/test-web-contracts.cjs`
 * đọc số THẬT từ cả hai file và chốt hạ.
 *
 * Vì sao có 2 knob: khoảng cách thời gian chặn "báo liên tục" (một vụ raid
 * kích nhiều module trong nhiều giờ), còn số sự kiện chặn "báo vì một sự kiện
 * lẻ" (false positive đơn lẻ). Sự kiện bị chặn bởi khoảng cách vẫn được DỒN,
 * không bị mất — hết khoảng cách là báo ngay lượt kế tiếp.
 */
export const REPORT_MIN_INTERVAL_MINUTES = 15;
export const REPORT_MIN_INTERVAL_MINUTES_MIN = 1;
export const REPORT_MIN_INTERVAL_MINUTES_MAX = 360;
export const REPORT_MIN_EVENTS = 1;
export const REPORT_MIN_EVENTS_MIN = 1;
export const REPORT_MIN_EVENTS_MAX = 50;

/** Kẹp số phút giữa 2 báo cáo khẩn — giá trị rác về mức mặc định, không về biên. */
export function clampReportMinIntervalMinutes(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return REPORT_MIN_INTERVAL_MINUTES;
  return Math.max(
    REPORT_MIN_INTERVAL_MINUTES_MIN,
    Math.min(REPORT_MIN_INTERVAL_MINUTES_MAX, Math.round(n)),
  );
}

/** Kẹp số sự kiện nuke tối thiểu để gửi báo cáo khẩn. */
export function clampReportMinEvents(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return REPORT_MIN_EVENTS;
  return Math.max(REPORT_MIN_EVENTS_MIN, Math.min(REPORT_MIN_EVENTS_MAX, Math.round(n)));
}

/**
 * Cron Convex (đợt #4): thay vòng `reportInterval` 15 phút của bot.
 *
 * Đồng hồ "đến hạn báo cáo ngày" thuộc SERVER: mỗi lượt cron quét guild đang có
 * bot, guild nào đủ điều kiện (có kênh log, không tắt báo cáo, quá 20h từ mốc
 * gửi gần nhất — hoặc chưa từng gửi) thì đặt cờ `reportRequestedAt`.
 *
 * Bot đọc cờ qua batch tick (`bot_tick.getPendingJobs.reports` — đọc TƯƠI,
 * không đi qua bundle cache) rồi gửi embed và gọi `botSetReportAt` để xoá cờ +
 * ghi mốc `lastReportAt`. Cờ còn nguyên nghĩa là bot CHƯA gửi: hoặc đang offline
 * (bật lại là gửi), hoặc cấu hình vừa bị tắt kênh log/báo cáo (bật lại là gửi
 * báo cáo còn nợ — đúng tinh thần "không im lặng bỏ sót").
 *
 * Mỗi guild tối đa MỘT cờ: đã đặt thì bỏ qua để không ghi đè liên tục lên
 * document (đỡ tốn writes, `lastReportAt` mới là mốc chống gửi trùng).
 */
export const sweepDueDailyReports = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const guilds = await ctx.db
      .query("guilds")
      .withIndex("by_botInGuild", (q) => q.eq("botInGuild", true))
      .collect();
    let flagged = 0;
    for (const g of guilds) {
      if (g.reportRequestedAt !== undefined) continue; // cờ đang chờ bot — đừng dồn thêm
      if (!g.logChannelId) continue;
      if (g.dailyReportEnabled === false) continue;
      const lastAt = g.lastReportAt;
      if (lastAt !== undefined && now - lastAt < MIN_REPORT_INTERVAL_MS) continue;
      await ctx.db.patch(g._id, { reportRequestedAt: now });
      flagged++;
    }
    return { flagged };
  },
});
