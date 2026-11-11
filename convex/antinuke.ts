import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getUserByToken, canManageGuild } from "./auth";
import { requireBotKeyStrict } from "./botAuth";
import { isAntiNukeModule } from "./modules";

/** Hành động hợp lệ của module: hình phạt thành viên + dọn tin nhắn. */
const ALLOWED_ACTIONS = [
  "warn",
  "kick",
  "ban",
  "timeout",
  "deleteMessages",
  "purgeMessages",
] as const;
const ACTION_STRENGTH: Record<string, number> = { warn: 1, timeout: 2, kick: 3, ban: 4 };

/** Lọc + chuẩn hóa danh sách hành động, trả về hình phạt mạnh nhất. */
function normalizeActions(raw: string[] | undefined): {
  actions: string[];
  strongest: "warn" | "kick" | "ban" | "timeout";
} {
  const actions = [
    ...new Set((raw ?? []).filter((a) => (ALLOWED_ACTIONS as readonly string[]).includes(a))),
  ].slice(0, 6);
  const member = actions
    .filter((a) => ACTION_STRENGTH[a] != null)
    .sort((a, b) => ACTION_STRENGTH[b] - ACTION_STRENGTH[a]);
  const strongest = (member[0] ?? "warn") as "warn" | "kick" | "ban" | "timeout";
  return { actions, strongest };
}

export const updateModule = mutation({
  args: {
    token: v.string(),
    guildId: v.string(),
    module: v.string(),
    enabled: v.optional(v.boolean()),
    threshold: v.optional(v.number()),
    windowSeconds: v.optional(v.number()),
    punish: v.optional(
      v.union(v.literal("warn"), v.literal("kick"), v.literal("ban"), v.literal("timeout")),
    ),
    actions: v.optional(v.array(v.string())),
    timeoutSeconds: v.optional(v.number()),
    whitelistRoles: v.optional(v.array(v.string())),
    heat: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!isAntiNukeModule(args.module)) throw new Error("Module không hợp lệ");
    const user = await getUserByToken(ctx, args.token);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", args.guildId))
      .first();
    if (!canManageGuild(user, guild)) throw new Error("Không có quyền quản lý server này");

    const mod = await ctx.db
      .query("antinukeModules")
      .withIndex("by_guild_module", (q) => q.eq("guildId", args.guildId).eq("module", args.module))
      .first();
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.enabled !== undefined) patch.enabled = args.enabled;
    if (args.threshold !== undefined) {
      patch.threshold = Math.max(1, Math.min(100, Math.floor(args.threshold)));
    }
    if (args.windowSeconds !== undefined) {
      patch.windowSeconds = Math.max(1, Math.min(3600, Math.floor(args.windowSeconds)));
    }
    if (args.actions !== undefined) {
      const { actions, strongest } = normalizeActions(args.actions);
      patch.actions = actions;
      patch.punish = strongest;
    } else if (args.punish !== undefined) {
      // Giữ tương thích: đổi punish → đồng bộ lại actions chỉ còn hình phạt đó.
      patch.punish = args.punish;
      patch.actions = [args.punish];
    }
    if (args.timeoutSeconds !== undefined) {
      patch.timeoutSeconds = Math.max(1, Math.min(86400, Math.floor(args.timeoutSeconds)));
    }
    if (args.whitelistRoles !== undefined) patch.whitelistRoles = args.whitelistRoles;
    if (args.heat !== undefined) patch.heat = Math.max(1, Math.min(100, Math.floor(args.heat)));
    // Module antinuke được bot đọc qua cache getBotConfig → đánh dấu cấu hình vừa
    // đổi để vòng tick xoá cache, nếu không bật/tắt module phải chờ tới 90 phút.
    if (guild) await ctx.db.patch(guild._id, { settingsChangedAt: Date.now() });
    if (mod) {
      await ctx.db.patch(mod._id, patch);
    } else {
      const { actions, strongest } = normalizeActions(args.actions);
      const punish = args.punish ?? strongest;
      await ctx.db.insert("antinukeModules", {
        guildId: args.guildId,
        module: args.module,
        enabled: args.enabled ?? true,
        threshold: args.threshold ?? 5,
        windowSeconds: args.windowSeconds ?? 10,
        punish,
        actions: actions.length > 0 ? actions : [punish],
        timeoutSeconds: args.timeoutSeconds ?? 300,
        whitelistRoles: args.whitelistRoles ?? [],
        heat: args.heat ?? 10,
        updatedAt: Date.now(),
      });
    }
    return { ok: true };
  },
});

/**
 * Raid Intel — tổng quan dữ liệu thu thập + săn nguồn cơn raid của một server:
 * số mẫu huấn luyện đã ghi, cài đặt săn nguồn cơn, và các vụ gần đây (AI verdict
 * + nghi phạm nguồn cơn bị ban). Dùng cho panel Chống nuke/raid trên web.
 */
export const raidIntel = query({
  args: { token: v.string(), guildId: v.string() },
  handler: async (ctx, { token, guildId }) => {
    const user = await getUserByToken(ctx, token);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild || !canManageGuild(user, guild)) return null;
    const samples = await ctx.db
      .query("raidSamples")
      .withIndex("by_guildId_createdAt", (q) => q.eq("guildId", guildId))
      .order("desc")
      .take(12);
    const all = await ctx.db
      .query("raidSamples")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .collect();
    return {
      huntEnabled: guild.raidHuntEnabled ?? true,
      banSuspects: guild.raidHuntBanSuspects ?? true,
      count: all.length,
      recent: samples.map((s) => ({
        module: s.module,
        createdAt: s.createdAt,
        count: s.count,
        action: s.action ?? null,
        aiClassification: s.aiClassification ?? null,
        aiConfidence: s.aiConfidence ?? null,
        aiReason: s.aiReason ?? null,
        punishedCount: s.punishedCount ?? null,
        lockdownTriggered: s.lockdownTriggered ?? false,
        clusterMemberCount: s.clusterMemberCount ?? null,
        suspectedSourceName: s.sourceHunt?.suspectedSourceName ?? null,
        banned: s.sourceHunt?.banned ?? false,
        reason: s.sourceHunt?.reason ?? null,
      })),
    };
  },
});

/**
 * Lịch sử raid bằng ứng dụng ngoài (External App Guard) — danh sách các vụ bot
 * đã chặn: AI (người dùng bị xử lý), app gì (ứng dụng ngoài được kết nối), lúc
 * nào (thời điểm). Bot ghi mỗi mẫu khi vượt ngưỡng module externalAppRaid, kèm
 * AI verdict + săn nguồn cơn.
 */
export const externalAppRaids = query({
  args: {
    token: v.string(),
    guildId: v.string(),
  },
  handler: async (ctx, { token, guildId }) => {
    const user = await getUserByToken(ctx, token);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild || !canManageGuild(user, guild)) return null;
    const rows = await ctx.db
      .query("raidSamples")
      .withIndex("by_guildId_createdAt", (q) => q.eq("guildId", guildId))
      .order("desc")
      .filter((q) => q.eq(q.field("module"), "externalAppRaid"))
      .take(25);
    return rows.map((s) => ({
      createdAt: s.createdAt,
      count: s.count,
      windowSeconds: s.windowSeconds,
      threshold: s.threshold,
      action: s.action ?? null,
      punish: s.punish ?? null,
      aiClassification: s.aiClassification ?? null,
      aiConfidence: s.aiConfidence ?? null,
      aiReason: s.aiReason ?? null,
      lockdownTriggered: s.lockdownTriggered ?? false,
      apps: (s.apps ?? []).map((a) => ({
        appName: a.appName ?? null,
        executorName: a.executorName ?? null,
        executorId: a.executorId ?? null,
      })),
      punished: (s.punished ?? []).map((p) => ({
        userId: p.userId ?? null,
        username: p.username ?? null,
        action: p.action ?? null,
      })),
      suspectedSourceName: s.sourceHunt?.suspectedSourceName ?? null,
      banned: s.sourceHunt?.banned ?? false,
      reason: s.sourceHunt?.reason ?? null,
    }));
  },
});

/** Bot đọc các mẫu raid gần nhất (Raid Intel) — dùng cho ambient learning (0 token AI). */
export const recentRaidSamples = query({
  args: {
    limit: v.optional(v.number()),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, limit }) => {
    await requireBotKeyStrict(ctx, botKey);
    const rows = await ctx.db
      .query("raidSamples")
      .withIndex("by_createdAt", (q) => q.gt("createdAt", 0))
      .order("desc")
      .take(Math.min(Math.max(limit ?? 60, 1), 200));
    return rows.map((s) => ({
      module: s.module,
      action: s.action ?? null,
      aiReason: s.aiReason ?? null,
      aiClassification: s.aiClassification ?? null,
      apps: (s.apps ?? []).map((a) => a.appName ?? null).filter(Boolean),
    }));
  },
});
