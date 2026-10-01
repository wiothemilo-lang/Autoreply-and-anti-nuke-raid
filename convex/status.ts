import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getUserByToken } from "./auth";
import { isBotOwnerUser } from "./hidden";
import { requireBotKeyStrict } from "./botAuth";

/**
 * Cửa sổ coi bot còn "online". Bot đẩy heartbeat trong vòng sync guild mỗi
 * 180s (bot/src/index.js), và vòng đó hẹn nhịp KẾ TIẾP sau khi lượt trước chạy
 * xong — nên ngay trước mỗi nhịp, tuổi heartbeat đã > 180s một chút. Lấy đúng
 * 180s làm ngưỡng thì huy hiệu online nhấp nháy offline vài giây mỗi 3 phút.
 * Rộng 2 nhịp = bỏ qua được 1 nhịp lỡ mà vẫn phát hiện bot chết trong ~6 phút.
 */
const BOT_ONLINE_WINDOW_MS = 360_000;

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
    reportedAt: v.number(),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { botKey, level, diskUsedPct, diskFreeGb, rssMb, uptimeHours, reportedAt },
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
