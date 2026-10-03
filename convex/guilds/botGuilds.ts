/**
 * Đợt #5 tách `convex/guilds.ts` (99KB) — nhóm function PHÍA BOT (query danh
 * sách guild, heartbeat, đồng bộ kênh/role/emoji, đánh dấu bot rời guild).
 *
 * `botSyncGuilds` (mutation gộp sync + heartbeat, có allowlist riêng trong
 * `scripts/check-settings-signal.cjs`) vẫn ở `convex/guilds.ts`; các function
 * còn lại tách thân hàm sang đây. Wrapper + validator giữ NGUYÊN ở file gốc —
 * hợp đồng tên (`guilds:botHeartbeat`…) không đổi. Chỉ tách file.
 */
import { v } from "convex/values";
import type { ObjectType } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireBotKeyStrict } from "../botAuth";
import { getUserByToken } from "../auth";
import { getBotStatus, isBotOwnerUser } from "../hidden";

/**
 * Bot lấy danh sách guild ID bot đang ở (1 query — dùng bởi scripts/audit-backups.cjs).
 * Bảo mật cao: botKey bắt buộc. Trả tối thiểu thông tin — không lộ gì thêm.
 */
export const botListGuildIdsArgs = { botKey: v.optional(v.string()) };
export type BotListGuildIdsArgs = ObjectType<typeof botListGuildIdsArgs>;
export async function botListGuildIdsHandler(ctx: QueryCtx, { botKey }: BotListGuildIdsArgs) {
  await requireBotKeyStrict(ctx, botKey);
  const all = await ctx.db
    .query("guilds")
    .withIndex("by_botInGuild", (q) => q.eq("botInGuild", true))
    .collect();
  return all.map((g) => ({ discordId: g.discordId, name: g.name }));
}

/** Bot bị kick khỏi guild → đánh dấu đúng guild đó (sự kiện guildDelete, không sweep toàn bộ). */
export const botGuildGoneArgs = {
  guildId: v.string(),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type BotGuildGoneArgs = ObjectType<typeof botGuildGoneArgs>;
export async function botGuildGoneHandler(ctx: MutationCtx, { botKey, guildId }: BotGuildGoneArgs) {
  await requireBotKeyStrict(ctx, botKey);
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
    .first();
  if (!guild) return { ok: true };
  await ctx.db.patch(guild._id, { botInGuild: false, updatedAt: Date.now() });
  return { ok: true };
}

/** Chẩn đoán sức khỏe sync: số guild đang hiển thị / đã ẩn / heartbeat cũ (không lộ id).
 *  Chỉ bot (botKey) hoặc chủ bot đăng nhập web được gọi — trước đây quét toàn bộ
 *  bảng guilds mở công khai, tốn hạn mức mỗi lần gọi. */
export const botGuildStatsArgs = {
  botKey: v.optional(v.string()),
  token: v.optional(v.string()),
};
export type BotGuildStatsArgs = ObjectType<typeof botGuildStatsArgs>;
export async function botGuildStatsHandler(ctx: QueryCtx, { botKey, token }: BotGuildStatsArgs) {
  if (botKey) {
    await requireBotKeyStrict(ctx, botKey);
  } else if (token) {
    const user = await getUserByToken(ctx, token);
    if (!user) return null;
    const status = await getBotStatus(ctx);
    if (!isBotOwnerUser(user, status)) return null;
  } else {
    return null;
  }
  const all = await ctx.db.query("guilds").collect();
  const now = Date.now();
  let inGuild = 0;
  let gone = 0;
  let staleInGuild = 0;
  let oldestHeartbeat = now;
  for (const g of all) {
    if (g.botInGuild) {
      inGuild++;
      if (now - (g.lastHeartbeat ?? 0) > 15 * 60_000) staleInGuild++;
      oldestHeartbeat = Math.min(oldestHeartbeat, g.lastHeartbeat ?? now);
    } else {
      gone++;
    }
  }
  return {
    total: all.length,
    inGuild,
    gone,
    staleInGuild,
    now,
    oldestHeartbeat,
  };
}

export const botHeartbeatArgs = {
  guildCount: v.number(),
  memberCount: v.number(),
  version: v.string(),
  ownerName: v.optional(v.string()),
  ownerAvatarUrl: v.optional(v.string()),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type BotHeartbeatArgs = ObjectType<typeof botHeartbeatArgs>;
export async function botHeartbeatHandler(ctx: MutationCtx, args: BotHeartbeatArgs) {
  await requireBotKeyStrict(ctx, args.botKey);
  const now = Date.now();
  const existing = await ctx.db
    .query("botStatus")
    .withIndex("by_kind", (q) => q.eq("kind", "status"))
    .first();
  const patch: Record<string, unknown> = {
    online: true,
    guildCount: args.guildCount,
    memberCount: args.memberCount,
    lastHeartbeat: now,
    version: args.version,
  };
  if (args.ownerName !== undefined) patch.ownerName = args.ownerName.slice(0, 120);
  if (args.ownerAvatarUrl !== undefined) patch.ownerAvatarUrl = args.ownerAvatarUrl.slice(0, 2000);
  if (existing) {
    await ctx.db.patch(existing._id, patch);
  } else {
    await ctx.db.insert("botStatus", {
      kind: "status",
      online: true,
      guildCount: args.guildCount,
      memberCount: args.memberCount,
      lastHeartbeat: now,
      startedAt: now,
      version: args.version,
      ownerName: args.ownerName?.slice(0, 120),
      ownerAvatarUrl: args.ownerAvatarUrl?.slice(0, 2000),
    });
  }
  return { ok: true };
}

export const syncChannelsArgs = {
  guildId: v.string(),
  channels: v.array(v.object({ channelId: v.string(), name: v.string(), type: v.number() })),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type SyncChannelsArgs = ObjectType<typeof syncChannelsArgs>;
export async function syncChannelsHandler(
  ctx: MutationCtx,
  { botKey, guildId, channels }: SyncChannelsArgs,
) {
  await requireBotKeyStrict(ctx, botKey);
  const old = await ctx.db
    .query("guildChannels")
    .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
    .collect();
  for (const c of old) await ctx.db.delete(c._id);
  for (const c of channels) {
    await ctx.db.insert("guildChannels", {
      guildId,
      channelId: c.channelId,
      name: c.name,
      type: c.type,
    });
  }
  return { ok: true };
}

export const syncRolesArgs = {
  guildId: v.string(),
  roles: v.array(
    v.object({ roleId: v.string(), name: v.string(), color: v.number(), position: v.number() }),
  ),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type SyncRolesArgs = ObjectType<typeof syncRolesArgs>;
export async function syncRolesHandler(
  ctx: MutationCtx,
  { botKey, guildId, roles }: SyncRolesArgs,
) {
  await requireBotKeyStrict(ctx, botKey);
  const old = await ctx.db
    .query("guildRoles")
    .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
    .collect();
  for (const r of old) await ctx.db.delete(r._id);
  for (const r of roles) {
    await ctx.db.insert("guildRoles", {
      guildId,
      roleId: r.roleId,
      name: r.name,
      color: r.color,
      position: r.position,
    });
  }
  return { ok: true };
}

/**
 * Emoji tuỳ chỉnh của server — chỉ để dashboard hiển thị picker chèn emoji.
 * Bot gửi mã `<:ten:id>` chứ không gửi ảnh, nên bảng này là dữ liệu hiển thị:
 * emoji bị xoá sau đó không làm hỏng tin nhắn đã lưu.
 */
export const syncEmojisArgs = {
  guildId: v.string(),
  emojis: v.array(v.object({ emojiId: v.string(), name: v.string(), animated: v.boolean() })),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type SyncEmojisArgs = ObjectType<typeof syncEmojisArgs>;
export async function syncEmojisHandler(
  ctx: MutationCtx,
  { botKey, guildId, emojis }: SyncEmojisArgs,
) {
  await requireBotKeyStrict(ctx, botKey);
  // Chỉ ghi khi danh sách thật sự đổi — tránh xoá/ghi lại mỗi vòng sync
  // (bot sync mỗi ~5 phút; ghi vô điều kiện làm dashboard re-render liên tục).
  const old = await ctx.db
    .query("guildEmojis")
    .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
    .collect();
  const cur = old
    .map((e) => `${e.emojiId}:${e.name}:${e.animated ? 1 : 0}`)
    .sort()
    .join(",");
  const next = emojis
    .map((e) => `${e.emojiId}:${e.name}:${e.animated ? 1 : 0}`)
    .sort()
    .join(",");
  if (cur === next && old.length > 0) return { ok: true, unchanged: true };
  for (const e of old) await ctx.db.delete(e._id);
  for (const e of emojis) {
    await ctx.db.insert("guildEmojis", {
      guildId,
      emojiId: e.emojiId,
      name: e.name,
      animated: e.animated,
    });
  }
  return { ok: true, unchanged: false };
}
