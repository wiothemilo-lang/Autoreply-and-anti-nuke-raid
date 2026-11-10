import { type QueryCtx, type MutationCtx } from "./_generated/server";

/** Phiên đăng nhập hết hạn sau 30 ngày — token bị đánh cắp không dùng được vĩnh viễn. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Phiên đã quá hạn chưa (so với createdAt của phiên). */
export function sessionExpired(session: { createdAt: number }): boolean {
  return Date.now() - session.createdAt > SESSION_TTL_MS;
}

/** Resolve the logged-in user from a session token, or null. */
export async function getUserByToken(ctx: QueryCtx | MutationCtx, token: string) {
  if (!token) return null;
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .first();
  if (!session || sessionExpired(session) || !isCurrentSession(session)) return null;
  return await ctx.db.get(session.userId);
}

export const CURRENT_SESSION_AUTH_VERSION = 1;

/** Phiên cũ không có marker chỉ dùng client-trusted claims nên phải đăng nhập lại. */
export function isCurrentSession(session: { authVersion?: number }): boolean {
  return session.authVersion === CURRENT_SESSION_AUTH_VERSION;
}

/** MANAGE_GUILD permission bit (Discord). */
export const PERM_MANAGE_GUILD = 0x20;

/**
 * True khi ảnh chụp quyền hiện tại của user có guild này.
 * Chỉ tin manageableGuildIds — danh sách server Discord xác nhận user có Manage
 * Server tại lần đăng nhập / làm mới gần nhất. guild.managers giữ lại để hiển thị
 * và tương thích dữ liệu cũ, nhưng không cấp quyền vì có thể đã stale.
 */
export function guildAccessibleBy(
  user: { discordId: string; manageableGuildIds?: string[] } | null,
  guild: { discordId?: string; managers?: string[] } | null | undefined,
) {
  if (!user || !guild) return false;
  return (user.manageableGuildIds ?? []).includes(guild.discordId ?? "");
}

export function canManageGuild(
  user: { discordId: string; manageableGuildIds?: string[] } | null,
  guild: { managers: string[]; discordId?: string } | null | undefined,
) {
  return guildAccessibleBy(user, guild);
}

/**
 * Các server user quản lý VÀ bot đang ở trong — tra thẳng theo `by_discordId`.
 *
 * Trước đây `sessions.me` + `guilds.listMine` quét TOÀN BỘ bảng `guilds`
 * (hàng nghìn document ~90 field) rồi lọc trong RAM, dù `manageableGuildIds`
 * đã là danh sách chính xác (Discord xác nhận lúc đăng nhập). Mỗi tab mở
 * dashboard chạy query này; quét cả bảng là reads vô ích tăng theo số server
 * của TOÀN hệ thống, không theo số server của user.
 *
 * Giữ thứ tự `manageableGuildIds` (thứ tự Discord trả về) và khử trùng lặp.
 */
export async function listBotGuildsForUser(
  ctx: QueryCtx | MutationCtx,
  user: { manageableGuildIds?: string[] } | null,
) {
  const ids = [...new Set(user?.manageableGuildIds ?? [])];
  const rows = await Promise.all(
    ids.map((discordId) =>
      ctx.db
        .query("guilds")
        .withIndex("by_discordId", (q) => q.eq("discordId", discordId))
        .first(),
    ),
  );
  return rows.filter((g): g is NonNullable<typeof g> => !!g && g.botInGuild);
}
