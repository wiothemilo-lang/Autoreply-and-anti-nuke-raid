import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getUserByToken, listBotGuildsForUser } from "./auth";

/**
 * ĐĂNG NHẬP cũ đã BỊ XÓA khỏi API công khai: mutation `sessions:login` nhận
 * token + user tự báo từ client → ai cũng tự tạo phiên giả cho bất kỳ discordId
 * nào (chiếm quyền quản lý mọi server). Giờ đăng nhập đi qua action
 * `sessionAuth:exchangeAndLogin` — server tự trao đổi code với Discord, tự sinh
 * token, và gọi internal mutation (sessionHardening.loginInternal).
 */

export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (session) await ctx.db.delete(session._id);
    return { ok: true };
  },
});

/**
 * Làm mới quyền quản lý server ĐÃ CHUYỂN sang action `sessionAuth:refreshGuildsServer`:
 * server tự hỏi Discord /users/@me/guilds bằng access token — mutation cũ nhận
 * danh sách guilds do client tự báo (permissions giả mạo được) nên đã BỊ XÓA.
 */

export const me = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await getUserByToken(ctx, token);
    if (!user) return null;
    // Chỉ tra server user quản lý (manageableGuildIds) thay vì quét cả bảng —
    // xem `listBotGuildsForUser`. Server đã kick bot tự biến mất sau lượt sync.
    const guilds = (await listBotGuildsForUser(ctx, user)).map((g) => ({
      discordId: g.discordId,
      name: g.name,
      icon: g.icon ?? null,
      memberCount: g.memberCount ?? null,
      prefix: g.prefix,
      antinukeEnabled: g.antinukeEnabled,
      botInGuild: g.botInGuild,
      lastHeartbeat: g.lastHeartbeat ?? null,
    }));
    const status = await ctx.db
      .query("botStatus")
      .withIndex("by_kind", (q) => q.eq("kind", "status"))
      .first();
    return {
      user: {
        discordId: user.discordId,
        username: user.username,
        globalName: user.globalName ?? null,
        avatar: user.avatar ?? null,
      },
      guilds,
      botOnline: status?.online ?? false,
      botGuildCount: status?.guildCount ?? 0,
      botMemberCount: status?.memberCount ?? 0,
    };
  },
});
