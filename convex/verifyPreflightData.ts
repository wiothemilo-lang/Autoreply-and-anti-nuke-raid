/**
 * verifyPreflightData — phần đọc DB cho self-test verify (default runtime).
 *
 * Tách khỏi `verifyPreflight.ts` vì file đó `"use node"` (chỉ action); query
 * không được nằm trong file Node runtime. Ở đây KHÔNG trả secret, KHÔNG trả
 * IP/hash — chỉ cấu hình guild, trạng thái bot và thống kê 24 giờ.
 */

import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { canManageGuild, getUserByToken } from "./auth";

/** Chỉ đọc tối đa 200 phiên gần nhất — đủ để thấy lỗi, không quét cả bảng. */
const RECENT_TAKE = 200;

export const authorize = internalQuery({
  args: { token: v.string(), guildId: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.token);
    if (!user) return { ok: false as const, code: "unauthenticated" as const };

    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", args.guildId))
      .first();
    if (!guild || !canManageGuild(user, guild)) {
      return { ok: false as const, code: "forbidden" as const };
    }

    const status = await ctx.db
      .query("botStatus")
      .withIndex("by_kind", (q) => q.eq("kind", "status"))
      .first();

    const dayAgo = Date.now() - 24 * 3600_000;
    const recent = await ctx.db
      .query("verifySessions")
      .withIndex("by_guildId_createdAt", (q) => q.eq("guildId", args.guildId))
      .order("desc")
      .take(RECENT_TAKE);

    const stats = {
      total: 0,
      verified: 0,
      denied: 0,
      banned: 0,
      failed: 0,
      pending: 0,
      grantPending: 0,
    };
    for (const row of recent) {
      if (row.createdAt < dayAgo) continue;
      stats.total++;
      if (row.status === "verified") stats.verified++;
      else if (row.status === "denied") stats.denied++;
      else if (row.status === "banned") stats.banned++;
      else if (row.status === "failed") stats.failed++;
      else if (row.status === "pending") stats.pending++;
      if (row.grantPending) stats.grantPending++;
    }

    return {
      ok: true as const,
      guild: {
        verifyEnabled: guild.verifyEnabled === true,
        verifyWebEnabled: guild.verifyWebEnabled === true,
        verifyMethod: guild.verifyMethod ?? null,
        verifyChannelId: guild.verifyChannelId ?? null,
        unverifiedRoleId: guild.unverifiedRoleId ?? null,
        verifiedRoleId: guild.verifiedRoleId ?? null,
      },
      bot: {
        online: status?.online === true,
        lastHeartbeat: status?.lastHeartbeat ?? 0,
      },
      stats,
    };
  },
});
