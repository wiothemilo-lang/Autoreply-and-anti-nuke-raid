import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getUserByToken } from "./auth";
import { isBotOwnerUser } from "./hidden";
import { requireBotKeyStrict } from "./botAuth";
// Cửa sổ "bot còn online" (2 nhịp sync) — hằng số dùng CHUNG với
// convex/backup.ts để hai màn hình không trả lời hai đáp án khác nhau về
// cùng một con bot. Nhịp thật + lý do chọn 2 nhịp: xem convex/heartbeat.ts.
import { BOT_ONLINE_WINDOW_MS } from "./heartbeat";

/**
 * Trạng thái tổng thể của bot (công khai, không nhạy cảm): online hay không,
 * số server/thành viên, heartbeat gần nhất, và thông tin chủ bot mà bot tự
 * đồng bộ từ Discord mỗi phút (cập nhật 24/7).
 */
/** Người dùng đang đăng nhập có phải chủ sở hữu bot không (cửa sổ Admin ẩn). */
export const isOwner = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await getUserByToken(ctx, token);
    if (!user) return false;
    const status = await ctx.db
      .query("botStatus")
      .withIndex("by_kind", (q) => q.eq("kind", "status"))
      .first();
    return isBotOwnerUser(user, status);
  },
});

/** Bot heartbeat — called every 30s to update status (mutation, not action). */
export const heartbeat = mutation({
  args: {
    online: v.boolean(),
    guildCount: v.number(),
    memberCount: v.number(),
    version: v.string(),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, online, guildCount, memberCount, version }) => {
    await requireBotKeyStrict(ctx, botKey);
    const now = Date.now();
    const status = await ctx.db
      .query("botStatus")
      .withIndex("by_kind", (q) => q.eq("kind", "status"))
      .first();
    if (status) {
      await ctx.db.patch(status._id, {
        online,
        guildCount,
        memberCount,
        lastHeartbeat: now,
        version,
      });
    } else {
      await ctx.db.insert("botStatus", {
        kind: "status" as const,
        online,
        guildCount,
        memberCount,
        lastHeartbeat: now,
        startedAt: now,
        version,
      });
    }
    return { ok: true };
  },
});

/**
 * Bot báo khả năng VẼ THẺ ảnh chào của máy chủ (thư viện canvas + font nhúng).
 *
 * Vì sao có đường riêng thay vì đi nhờ botSyncGuilds: dashboard phải biết TRƯỚC
 * khi người dùng bật thẻ rồi thắc mắc sao không thấy ảnh. Không có tín hiệu này
 * thì "thẻ bật" và "thẻ vẽ được" là hai chuyện khác nhau mà web không phân biệt
 * nổi — đúng lớp lỗi im lặng mà dự án này đang chặn.
 *
 * Bot gọi MỘT LẦN lúc khởi động: kết quả nạp module/font được cache trong tiến
 * trình nên không đổi giữa chừng (không tốn function call định kỳ).
 */
export const reportCardCapability = mutation({
  args: {
    ready: v.boolean(),
    reason: v.optional(v.string()),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, ready, reason }) => {
    await requireBotKeyStrict(ctx, botKey);
    const now = Date.now();
    const patch = {
      cardReady: ready,
      // Vẽ được thì xoá lý do cũ (tránh lý do của lần hỏng trước còn nằm lại).
      cardUnavailableReason: ready
        ? undefined
        : String(reason || "Lý do không xác định").slice(0, 200),
    };
    const status = await ctx.db
      .query("botStatus")
      .withIndex("by_kind", (q) => q.eq("kind", "status"))
      .first();
    if (status) {
      await ctx.db.patch(status._id, patch);
    } else {
      await ctx.db.insert("botStatus", {
        kind: "status" as const,
        online: false,
        guildCount: 0,
        memberCount: 0,
        lastHeartbeat: now,
        startedAt: now,
        version: "",
        ...patch,
      });
    }
    return { ok: true, cardReady: ready };
  },
});

/**
 * Sức khỏe AI (đợt 12) — tổng hợp aiStats() bot đẩy lên qua botSyncGuilds.
 * CHỈ owner bot đọc được: cửa sổ Admin là khu vực riêng tư, người dùng thường
 * không được thấy provider/model/đếm verdict (tránh lộ hạ tầng AI cho kẻ xấu).
 */
/**
 * Sức khoẻ máy chủ — CHỈ chủ bot xem được (cửa sổ Admin), vì đây là số liệu
 * hạ tầng: % đĩa, GB trống, RAM. Trang Monitor công khai chỉ nhận MỨC.
 */
/**
 * HÀNG ĐỢI VIỆC — bao nhiêu việc đang chờ bot xử lý, và việc nào BỊ KẸT.
 *
 * Vì sao cần (đợt #4): từ khi chuyển việc quét sang Convex cron, phần lớn
 * việc đi theo mẫu "cron đặt cờ → bot xử lý ở tick". Khi một mắt xích đứt
 * (bot offline, tick lỗi, cấu hình sai) thì cờ sẽ nằm im — và im lặng là
 * kiểu hỏng nguy hiểm nhất. Số liệu này biến "chờ" thành "đang kẹt 3 việc
 * từ 2 tiếng trước ở server X", tức là nhìn thấy được.
 *
 * Ngưỡng `STUCK_AFTER_MS`: tick chạy mỗi 3 phút, nên 15 phút = 5 nhịp mà
 * vẫn chưa xử lý thì coi như kẹt (không phải chỉ nhiễu).
 */
const STUCK_AFTER_MS = 15 * 60_000;

export const getJobBacklog = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await getUserByToken(ctx, token);
    if (!user) return null;
    const status = await ctx.db
      .query("botStatus")
      .withIndex("by_kind", (q) => q.eq("kind", "status"))
      .first();
    if (!isBotOwnerUser(user, status)) return null;

    const now = Date.now();
    const guilds = await ctx.db.query("guilds").collect();
    const totals = { backup: 0, report: 0, verifyPanel: 0, ticketPanel: 0, dm: 0 };
    const stuck: {
      guildId: string;
      name: string;
      jobs: number;
      oldestAt: number;
      ageMin: number;
    }[] = [];

    for (const g of guilds) {
      // Mỗi cờ có thể là boolean (chỉ "có/không") hoặc số mốc thời gian (đặt lúc
      // nào). Cờ boolean không mang mốc ⇒ dùng `updatedAt` là xấp nhất.
      const marks: { job: keyof typeof totals; pending: boolean; at?: number }[] = [
        { job: "backup", pending: !!g.backupRequested },
        { job: "report", pending: g.reportRequestedAt !== undefined, at: g.reportRequestedAt },
        { job: "verifyPanel", pending: g.verifySendPanel === true },
        { job: "ticketPanel", pending: g.ticketSendPanel === true },
        { job: "dm", pending: g.dmRequested === true },
      ];
      let jobs = 0;
      let oldest = now;
      for (const m of marks) {
        if (!m.pending) continue;
        totals[m.job] += 1;
        jobs += 1;
        oldest = Math.min(oldest, m.at ?? g.updatedAt ?? now);
      }
      if (jobs > 0 && now - oldest >= STUCK_AFTER_MS) {
        stuck.push({
          guildId: g.discordId,
          name: g.name ?? g.discordId,
          jobs,
          oldestAt: oldest,
          ageMin: Math.round((now - oldest) / 60_000),
        });
      }
    }

    stuck.sort((a, b) => b.ageMin - a.ageMin);
    return {
      totals,
      total: Object.values(totals).reduce((s, n) => s + n, 0),
      stuck: stuck.slice(0, 20),
      stuckAfterMin: STUCK_AFTER_MS / 60_000,
      checkedAt: now,
    };
  },
});

export const getHostHealth = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await getUserByToken(ctx, token);
    if (!user) return null;
    const status = await ctx.db
      .query("botStatus")
      .withIndex("by_kind", (q) => q.eq("kind", "status"))
      .first();
    if (!isBotOwnerUser(user, status)) return null;
    const health = status?.hostHealth;
    if (!health) return null;
    return { stale: Date.now() - health.reportedAt >= 1_800_000, ...health };
  },
});

export const getAiHealth = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await getUserByToken(ctx, token);
    if (!user) return null;
    const status = await ctx.db
      .query("botStatus")
      .withIndex("by_kind", (q) => q.eq("kind", "status"))
      .first();
    if (!isBotOwnerUser(user, status)) return null;
    const ai = status?.aiHealth;
    if (!ai) return null;
    // Bot ngừng sync quá 2 nhịp (lỡ 1 nhịp + dư) → số liệu cũ coi như mất kết nối.
    if (Date.now() - status.lastHeartbeat > BOT_ONLINE_WINDOW_MS) return { stale: true, ...ai };
    return { stale: false, ...ai };
  },
});

/**
 * Bot báo sức khoẻ MÁY CHỦ (đĩa/bộ nhớ) — `bot/src/handlers/healthWatch.js`
 * đo mỗi 5 phút rồi gọi mutation này.
 *
 * Vì sao đường riêng chứ không nhờ botSyncGuilds: đây là dữ liệu TOÀN CỤC
 * của một tiến trình, không theo nhịp guild; và nó phải ghi được cả khi bot
 * đang không còn sync guild (đúng lúc máy chủ yếu nhất).
 */
export const reportHealth = mutation({
  args: {
    level: v.union(v.literal("ok"), v.literal("warn"), v.literal("critical")),
    diskUsedPct: v.optional(v.number()),
    diskFreeGb: v.optional(v.number()),
    rssMb: v.number(),
    uptimeHours: v.number(),
    // Vòng đời gateway Discord — undefined = bot bản cũ chưa báo.
    gatewayConnected: v.optional(v.boolean()),
    gatewayDisconnectedMs: v.optional(v.number()),
    gatewayDisconnects: v.optional(v.number()),
    reportedAt: v.number(),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (
    ctx,
    {
      botKey,
      level,
      diskUsedPct,
      diskFreeGb,
      rssMb,
      uptimeHours,
      gatewayConnected,
      gatewayDisconnectedMs,
      gatewayDisconnects,
      reportedAt,
    },
  ) => {
    await requireBotKeyStrict(ctx, botKey);
    const health = {
      level,
      // undefined = không đo được → bỏ trường, KHÔNG ép về 0 (0% là "còn rất
      // nhiều dung lượng", con số sai nguy hiểm hơn thiếu số).
      ...(typeof diskUsedPct === "number" ? { diskUsedPct } : {}),
      ...(typeof diskFreeGb === "number" ? { diskFreeGb } : {}),
      rssMb,
      uptimeHours,
      ...(typeof gatewayConnected === "boolean" ? { gatewayConnected } : {}),
      ...(typeof gatewayDisconnectedMs === "number" ? { gatewayDisconnectedMs } : {}),
      ...(typeof gatewayDisconnects === "number" ? { gatewayDisconnects } : {}),
      reportedAt: reportedAt || Date.now(),
    };
    const status = await ctx.db
      .query("botStatus")
      .withIndex("by_kind", (q) => q.eq("kind", "status"))
      .first();
    if (status) {
      await ctx.db.patch(status._id, { hostHealth: health });
    } else {
      const now = Date.now();
      await ctx.db.insert("botStatus", {
        kind: "status" as const,
        online: false,
        guildCount: 0,
        memberCount: 0,
        lastHeartbeat: now,
        startedAt: now,
        version: "",
        hostHealth: health,
      });
    }
    return { ok: true, level };
  },
});

export const botStatus = query({
  // botKey: script chẩn đoán chèn chìa khóa vào mọi call — bỏ qua an toàn ở đây
  // (đây là query công khai, không nhạy cảm).
  args: { botKey: v.optional(v.string()) },
  handler: async (ctx, _args) => {
    const status = await ctx.db
      .query("botStatus")
      .withIndex("by_kind", (q) => q.eq("kind", "status"))
      .first();
    if (!status) {
      return {
        online: false,
        guildCount: 0,
        memberCount: 0,
        lastHeartbeat: null,
        ownerName: null,
        ownerAvatarUrl: null,
        hostHealth: null,
      };
    }
    return {
      online: status.online && Date.now() - status.lastHeartbeat < BOT_ONLINE_WINDOW_MS,
      guildCount: status.guildCount,
      memberCount: status.memberCount,
      lastHeartbeat: status.lastHeartbeat,
      ownerName: status.ownerName ?? null,
      ownerAvatarUrl: status.ownerAvatarUrl ?? null,
      // Bot bản mới báo khả năng vẽ thẻ chào; null = bot chưa báo (đừng kết luận là hỏng).
      cardReady: status.cardReady ?? null,
      // Sức khoẻ máy chủ: chỉ MỨC, không lộ số liệu hạ tầng công khai.
      // null = bot chưa báo (bản cũ) — đừng kết luận là hỏng.
      // Quá 30 phút không báo lại (bot treo/restart) → null, KHÔNG khoe
      // "critical" cũ: cảnh báo cũ còn treo là cảnh báo sai.
      hostHealth:
        status.hostHealth && Date.now() - status.hostHealth.reportedAt < 1_800_000
          ? status.hostHealth.level
          : null,
    };
  },
});

/**
 * Số đo toàn hệ thống bot (đồng hồ metrics) — CHỈ chủ bot xem được (cửa sổ
 * Admin), cùng lý do với `getHostHealth`: đây là số liệu hạ tầng (RAM, số
 * server, provider AI, chi phí token) — lộ ra công khai là tự cho kẻ xấu bản
 * đồ hạ tầng của bot.
 *
 * `null` = bot chưa đẩy số đo (bản cũ, hoặc bot mới deploy chưa tới kỳ đẩy
 * đầu tiên). Dashboard phải hiện "chưa có dữ liệu", KHÔNG hiện 0 — 0 là số
 * thật và sẽ khiến người dùng tưởng bot đang không làm gì.
 */
export const getMetrics = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await getUserByToken(ctx, token);
    if (!user) return null;
    const row = await ctx.db
      .query("botMetrics")
      .withIndex("by_kind_at", (q) => q.eq("kind", "latest"))
      .first();
    if (!row) return null;
    return {
      at: row.at,
      counters: row.counters,
      gauges: row.gauges,
      histograms: row.histograms,
    };
  },
});

/**
 * Chuỗi lịch sử số đo để VẼ ĐƯỜNG (RAM, độ trễ, số lượt gọi...).
 *
 * Trả mốc cũ → mốc mới, tối đa `limit` mẫu (mặc định 288 ≈ 24 giờ ở nhịp đẩy
 * 5 phút). Chỉ trả `at` + `gauges` + `histograms`: đường quan tâm là "diễn biến",
 * còn counter thì lấy ở `getMetrics` (tích luỹ từ đầu tiến trình, đọc ở mẫu
 * cuối là đủ và tránh kéo hàng trăm khoá nhãn qua dây mỗi lần vẽ).
 */
export const getMetricsHistory = query({
  args: { token: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { token, limit }) => {
    const user = await getUserByToken(ctx, token);
    if (!user) return [];
    const take = Math.min(Math.max(limit ?? 288, 1), 576);
    const rows = await ctx.db
      .query("botMetrics")
      .withIndex("by_kind_at", (q) => q.eq("kind", "sample"))
      .order("desc")
      .take(take);
    return rows
      .map((r) => ({ at: r.at, gauges: r.gauges, histograms: r.histograms }))
      .sort((a, b) => a.at - b.at);
  },
});
