/**
 * Session hardening — các mutation cũ của sessions.ts trở thành INTERNAL để
 * client không tự gọi được. `sessions:login` giờ chỉ được gọi từ action
 * `sessionAuth:exchangeAndLogin` (server-side), token do server sinh.
 */
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { v, type GenericId } from "convex/values";
import {
  getUserByToken,
  PERM_MANAGE_GUILD,
  SESSION_TTL_MS,
  CURRENT_SESSION_AUTH_VERSION,
} from "./auth";

/**
 * Dọn phiên đã quá hạn (gọi cơ hội khi đăng nhập — không cần cron, không tốn
 * function call định kỳ). Bảng sessions luôn nhỏ → auth query nhanh + rẻ.
 */
async function purgeExpiredSessions(ctx: MutationCtx): Promise<void> {
  const expiredBefore = Date.now() - SESSION_TTL_MS;
  const oldest = await ctx.db.query("sessions").withIndex("by_creation_time").order("asc").take(50);
  for (const s of oldest) {
    if (s.createdAt <= expiredBefore) await ctx.db.delete(s._id);
    else break;
  }
}

/** (internal) Đăng ký session — CHỈ action server-side được gọi. */
export const loginInternal = internalMutation({
  args: {
    token: v.string(),
    user: v.object({
      discordId: v.string(),
      username: v.string(),
      globalName: v.optional(v.string()),
      avatar: v.optional(v.string()),
    }),
    guilds: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        icon: v.optional(v.string()),
        permissions: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await purgeExpiredSessions(ctx);
    const manageable = args.guilds
      .filter((g) => (BigInt(g.permissions) & BigInt(PERM_MANAGE_GUILD)) !== 0n)
      .map((g) => g.id);

    let userId: GenericId<"users">;
    const existing = await ctx.db
      .query("users")
      .withIndex("by_discordId", (q) => q.eq("discordId", args.user.discordId))
      .first();
    if (existing) {
      userId = existing._id;
      await ctx.db.patch(existing._id, {
        username: args.user.username,
        globalName: args.user.globalName,
        avatar: args.user.avatar,
        manageableGuildIds: manageable,
        lastLoginAt: Date.now(),
      });
    } else {
      userId = await ctx.db.insert("users", {
        discordId: args.user.discordId,
        username: args.user.username,
        globalName: args.user.globalName,
        avatar: args.user.avatar,
        manageableGuildIds: manageable,
        lastLoginAt: Date.now(),
      });
    }

    // Register the user as a manager on every guild they can manage.
    for (const guildId of manageable) {
      const guild = await ctx.db
        .query("guilds")
        .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
        .first();
      if (guild && !guild.managers.includes(args.user.discordId)) {
        await ctx.db.patch(guild._id, {
          managers: [...guild.managers, args.user.discordId],
        });
      }
    }

    await ctx.db.insert("sessions", {
      token: args.token,
      userId,
      createdAt: Date.now(),
      authVersion: CURRENT_SESSION_AUTH_VERSION,
    });
    return { ok: true };
  },
});

/**
 * (internal) Cập nhật danh sách server quản lý của một user ĐÃ đăng nhập từ dữ
 * liệu Discord fetch phía server — client không được tự báo danh sách (trước
 * đây `sessions:refreshGuilds` nhận guilds từ client → kẻ xấu tự nhận quyền
 * Manage Server trên mọi guild). CHỈ sessionAuth:refreshGuildsServer gọi.
 */
export const guildsInternal = internalMutation({
  args: {
    discordId: v.string(),
    guilds: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        icon: v.optional(v.string()),
        permissions: v.string(),
      }),
    ),
  },
  handler: async (ctx, { discordId, guilds }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_discordId", (q) => q.eq("discordId", discordId))
      .first();
    if (!user) return { ok: false };

    const manageable = guilds
      .filter((g) => (BigInt(g.permissions) & BigInt(PERM_MANAGE_GUILD)) !== 0n)
      .map((g) => g.id);
    await ctx.db.patch(user._id, { manageableGuildIds: manageable });

    // Ghi người dùng vào managers của mọi guild họ quản lý đã có trên Convex.
    for (const guildId of manageable) {
      const guild = await ctx.db
        .query("guilds")
        .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
        .first();
      if (guild && !guild.managers.includes(discordId)) {
        await ctx.db.patch(guild._id, {
          managers: [...guild.managers, discordId],
        });
      }
    }
    return { ok: true };
  },
});

/** (internal) Đọc user theo token — dùng nội bộ. */
export const getUserByTokenInternal = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    return await getUserByToken(ctx, token);
  },
});
