import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getUserByToken, canManageGuild } from "./auth";
import { requireBotKeyStrict } from "./botAuth";
import { TRIM_BATCH, dropBeyondCap, shouldTrim } from "./bot_writes/shared";

/** Alt detection configuration per guild. */
export const getAltConfig = query({
  args: { token: v.string(), guildId: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.token);
    if (!user) return null;
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", args.guildId))
      .first();
    if (!guild || !canManageGuild(user, guild)) return null;
    return {
      altDetectionEnabled: guild.altDetectionEnabled ?? false,
      vpnBlockEnabled: guild.vpnBlockEnabled ?? false,
      altMinAgeDays: guild.altMinAgeDays ?? 7,
      altMaxRiskScore: guild.altMaxRiskScore ?? 70,
      altPunish: guild.altPunish ?? "kick",
      altVpnMode: guild.altVpnMode ?? "off",
      altWhitelistRoles: guild.altWhitelistRoles ?? [],
      altWhitelistUsers: guild.altWhitelistUsers ?? [],
      altSimilarityThreshold: guild.altSimilarityThreshold ?? 70,
      altJoinWindowMinutes: guild.altJoinWindowMinutes ?? 5,
      altSafeMode: guild.altSafeMode ?? true,
    };
  },
});

/** Update alt detection settings. */
export const updateAltConfig = mutation({
  args: {
    token: v.string(),
    guildId: v.string(),
    altDetectionEnabled: v.optional(v.boolean()),
    vpnBlockEnabled: v.optional(v.boolean()),
    altMinAgeDays: v.optional(v.number()),
    altMaxRiskScore: v.optional(v.number()),
    altPunish: v.optional(
      v.union(v.literal("kick"), v.literal("ban"), v.literal("timeout"), v.literal("verify")),
    ),
    altVpnMode: v.optional(v.union(v.literal("strict"), v.literal("warn"), v.literal("off"))),
    altWhitelistRoles: v.optional(v.array(v.string())),
    altWhitelistUsers: v.optional(v.array(v.string())),
    altSafeMode: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.token);
    if (!user) throw new Error("Chưa đăng nhập");
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", args.guildId))
      .first();
    if (!guild || !canManageGuild(user, guild)) throw new Error("Không có quyền");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.altDetectionEnabled !== undefined)
      patch.altDetectionEnabled = args.altDetectionEnabled;
    if (args.vpnBlockEnabled !== undefined) patch.vpnBlockEnabled = args.vpnBlockEnabled;
    if (args.altMinAgeDays !== undefined)
      patch.altMinAgeDays = Math.max(1, Math.min(365, args.altMinAgeDays));
    if (args.altMaxRiskScore !== undefined)
      patch.altMaxRiskScore = Math.max(10, Math.min(100, args.altMaxRiskScore));
    if (args.altPunish !== undefined) patch.altPunish = args.altPunish;
    if (args.altVpnMode !== undefined) patch.altVpnMode = args.altVpnMode;
    if (args.altWhitelistRoles !== undefined) {
      // Validate: chỉ nhận Discord snowflake ID hợp lệ, tối đa 100 — chống nhét
      // dữ liệu rác/phình document qua mutation công khai.
      patch.altWhitelistRoles = [
        ...new Set(
          args.altWhitelistRoles
            .map((id) => id.trim())
            .filter((id) => /^\d{15,20}$/.test(id))
            .slice(0, 100),
        ),
      ];
    }
    if (args.altWhitelistUsers !== undefined) {
      patch.altWhitelistUsers = [
        ...new Set(
          args.altWhitelistUsers
            .map((id) => id.trim())
            .filter((id) => /^\d{15,20}$/.test(id))
            .slice(0, 100),
        ),
      ];
    }
    if (args.altSafeMode !== undefined) patch.altSafeMode = args.altSafeMode;
    // Tín hiệu cấu hình vừa đổi → vòng tick của bot xoá cache config của guild này
    // (không có thì bot giữ bản cũ tới hết TTL 30 phút — xem schema.ts).
    patch.settingsChangedAt = Date.now();
    await ctx.db.patch(guild._id, patch);
    return { ok: true };
  },
});

/** Record a member join with risk analysis data. */
export const recordJoin = mutation({
  args: {
    guildId: v.string(),
    userId: v.string(),
    username: v.string(),
    avatar: v.optional(v.string()),
    createdAt: v.number(),
    flags: v.optional(v.number()),
    riskScore: v.number(),
    riskFactors: v.array(v.string()),
    strongSignals: v.optional(v.number()),
    action: v.optional(v.string()),
    isVPN: v.optional(v.boolean()),
    ipCountry: v.optional(v.string()),
    ipOrg: v.optional(v.string()),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    const now = Date.now();
    // Store join record
    await ctx.db.insert("memberJoins", {
      guildId: args.guildId,
      userId: args.userId,
      username: args.username,
      avatar: args.avatar,
      createdAt: args.createdAt,
      flags: args.flags,
      joinedAt: now,
      riskScore: args.riskScore,
      riskFactors: args.riskFactors,
      strongSignals: args.strongSignals,
      action: args.action,
      isVPN: args.isVPN ?? false,
      ipCountry: args.ipCountry,
      ipOrg: args.ipOrg,
    });
    // Giữ tối đa 500 lượt join/server. KHÔNG đọc toàn bộ mỗi lần join (tốn ~500
    // reads/join — rất nặng khi raid) — dọn theo xác suất + lô, xem `shouldTrim`.
    if (shouldTrim()) {
      const newest = await ctx.db
        .query("memberJoins")
        .withIndex("by_guildId_joinedAt", (q) => q.eq("guildId", args.guildId))
        .order("desc")
        .take(500 + TRIM_BATCH);
      await dropBeyondCap(ctx, newest, 500);
    }
    return { ok: true, riskScore: args.riskScore };
  },
});

/**
 * Đánh dấu record join gần nhất của user đã bị xử lý (kick/ban/timeout/verify).
 * Bot gọi sau khi executePunishment thành công — để lần join SAU với account
 * khác có thể đối chiếu (rejoin-evasion detection).
 */
export const markJoinPunished = mutation({
  args: {
    guildId: v.string(),
    userId: v.string(),
    action: v.string(),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    const rec = await ctx.db
      .query("memberJoins")
      .withIndex("by_guildId_joinedAt", (q) => q.eq("guildId", args.guildId))
      .order("desc")
      .take(50);
    const mine = rec.find((r) => r.userId === args.userId);
    if (!mine) return { ok: false };
    await ctx.db.patch(mine._id, {
      action: args.action.slice(0, 20),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Lịch sử join gần đây cho bot (không cần token — bot chạy với deploy key). */
export const botGetJoinHistory = query({
  args: {
    guildId: v.string(),
    limit: v.optional(v.number()),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    const joins = await ctx.db
      .query("memberJoins")
      .withIndex("by_guildId_joinedAt", (q) => q.eq("guildId", args.guildId))
      .order("desc")
      .take(Math.min(args.limit ?? 100, 200));
    return joins.map((j) => ({
      userId: j.userId,
      username: j.username,
      avatar: j.avatar,
      createdAt: j.createdAt,
      joinedAt: j.joinedAt,
      riskScore: j.riskScore,
      strongSignals: j.strongSignals ?? 0,
      action: j.action ?? null,
    }));
  },
});

/** Get recent joins with risk data for a guild. */
export const getRecentJoins = query({
  args: { token: v.string(), guildId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.token);
    if (!user) return [];
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", args.guildId))
      .first();
    if (!guild || !canManageGuild(user, guild)) return [];
    const limit = Math.min(args.limit ?? 50, 100);
    const joins = await ctx.db
      .query("memberJoins")
      .withIndex("by_guildId_joinedAt", (q) => q.eq("guildId", args.guildId).gte("joinedAt", 0))
      .order("desc")
      .take(limit);
    return joins.map((j) => ({
      _id: j._id,
      userId: j.userId,
      username: j.username,
      avatar: j.avatar,
      createdAt: j.createdAt,
      joinedAt: j.joinedAt,
      riskScore: j.riskScore,
      riskFactors: j.riskFactors,
      strongSignals: j.strongSignals ?? 0,
      action: j.action ?? null,
      isVPN: j.isVPN,
      ipCountry: j.ipCountry,
      ipOrg: j.ipOrg,
    }));
  },
});

/** Get alt detection statistics. */
export const getAltStats = query({
  args: { token: v.string(), guildId: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.token);
    if (!user) return null;
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", args.guildId))
      .first();
    if (!guild || !canManageGuild(user, guild)) return null;

    const now = Date.now();
    const dayMs = 86_400_000;
    const sevenDaysAgo = now - 7 * dayMs;

    const recentJoins = await ctx.db
      .query("memberJoins")
      .withIndex("by_guildId_joinedAt", (q) =>
        q.eq("guildId", args.guildId).gte("joinedAt", sevenDaysAgo),
      )
      .order("asc")
      .collect();

    const highRisk = recentJoins.filter((j) => j.riskScore >= 70);
    const vpnUsers = recentJoins.filter((j) => j.isVPN);
    const newAccounts = recentJoins.filter((j) => {
      const ageDays = (j.joinedAt - j.createdAt) / dayMs;
      return ageDays < 7;
    });

    // Top risk factors
    const factorCounts: Record<string, number> = {};
    for (const j of recentJoins) {
      for (const f of j.riskFactors) {
        factorCounts[f] = (factorCounts[f] ?? 0) + 1;
      }
    }
    const topFactors = Object.entries(factorCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    return {
      totalJoins7d: recentJoins.length,
      highRiskCount: highRisk.length,
      vpnCount: vpnUsers.length,
      newAccountCount: newAccounts.length,
      avgRiskScore:
        recentJoins.length > 0
          ? Math.round(recentJoins.reduce((a, j) => a + j.riskScore, 0) / recentJoins.length)
          : 0,
      topFactors,
    };
  },
});
