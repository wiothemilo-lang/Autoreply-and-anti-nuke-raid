/**
 * Đợt #5 tách `convex/bot_writes.ts` (75KB) — nhóm BACKUP: bot lưu bản backup,
 * quy tắc giữ bản, đẩy GitHub, tự động theo ngày, yêu cầu tạo, xoá bản hỏng và
 * báo lỗi chụp backup (bảng `guildBackups` + `backupChunks`).
 *
 * Wrapper `export const X = mutation({…})` giữ NGUYÊN trong `convex/bot_writes.ts`
 * để tên function + validator không đổi (hợp đồng bot ⇄ Convex). Thân hàm nằm ở
 * đây — chỉ tách file, không đổi hành vi.
 */
import { v } from "convex/values";
import type { ObjectType } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import {
  CHUNK_CHARS,
  MAX_INLINE_CHARS,
  CHUNKED_PREFIX,
  deleteBackupChunks,
  splitBackupJson,
} from "../backupChunks";
import { requireBotKeyStrict } from "../botAuth";
import { generateRestoreKey } from "../backupKeys";
import { claimIsActive, claimMatches } from "./shared";

/** Chặn trên/dưới + làm tròn — người dùng gõ bừa số cũng không làm hỏng dữ liệu. */
function clampRetention(value: number | undefined, fallback: number, min: number, max: number) {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

/** Bot lưu một backup cấu trúc server vào bảng guildBackups (giữ tối đa 3 bản/server). */
export const botStoreBackupArgs = {
  guildId: v.string(),
  guildName: v.string(),
  backupJson: v.string(),
  roleCount: v.number(),
  channelCount: v.number(),
  emojiCount: v.optional(v.number()),
  stickerCount: v.optional(v.number()),
  messageCount: v.optional(v.number()),
  /** Số dòng bản đồ thành viên ↔ vai trò trong backup (P2). */
  memberCount: v.optional(v.number()),
  /** Bản đồ vai trò bị cắt do vượt trần số thành viên (P2). */
  memberRolesTruncated: v.optional(v.boolean()),
  source: v.optional(v.string()),
  /** SHA-256 checksum (nén + mã hóa) — bot gửi từ backupUtils. */
  backupChecksum: v.optional(v.string()),
  /** Backup có nén zlib không. */
  backupCompressed: v.optional(v.boolean()),
  /** Backup có mã hóa AES-256-GCM không. */
  backupEncrypted: v.optional(v.boolean()),
  /** Checksum "ổn định" của snapshot (so khớp incremental — bỏ qua khi không đổi). */
  backupSnapshotChecksum: v.optional(v.string()),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
  claimAt: v.optional(v.number()),
};
export type BotStoreBackupArgs = ObjectType<typeof botStoreBackupArgs>;

export async function botStoreBackupHandler(ctx: MutationCtx, args: BotStoreBackupArgs) {
  await requireBotKeyStrict(ctx, args.botKey);
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", args.guildId))
    .first();
  if (args.claimAt !== undefined && !guild) return { ok: false, reason: "no_guild" };
  const claimKind = args.source === "import" ? "import" : "backup";
  if (guild && !claimMatches(guild, claimKind, args.claimAt)) {
    return { ok: false, reason: "stale_claim" };
  }
  const now = Date.now();
  // Vượt trần 1 MB → tách chunk; document cha chỉ giữ ký hiệu + số chunk.
  const rawJson = args.backupJson;
  const chunked = rawJson.length > MAX_INLINE_CHARS;
  const chunkCount = chunked ? Math.ceil(rawJson.length / CHUNK_CHARS) : 0;
  // Mã khôi phục sinh 1 lần lúc lưu: đường cứu hộ khi chủ server đã mất quyền
  // với server gốc (xem convex/backupKeys.ts). Bản backup CŨ chưa có field này
  // thì `restoreKey` vắng mặt — người dùng vẫn khôi phục được bằng đường cũ
  // (còn quyền server gốc), chỉ là không có mã để dán.
  const restoreKey = generateRestoreKey();
  const backupId = await ctx.db.insert("guildBackups", {
    guildId: args.guildId,
    guildName: args.guildName.slice(0, 120),
    backupJson: chunked ? `${CHUNKED_PREFIX}${chunkCount}` : rawJson,
    backupChunkCount: chunked ? chunkCount : undefined,
    roleCount: Math.max(0, Math.floor(args.roleCount)),
    channelCount: Math.max(0, Math.floor(args.channelCount)),
    emojiCount:
      args.emojiCount === undefined ? undefined : Math.max(0, Math.floor(args.emojiCount)),
    stickerCount:
      args.stickerCount === undefined ? undefined : Math.max(0, Math.floor(args.stickerCount)),
    messageCount:
      args.messageCount === undefined ? undefined : Math.max(0, Math.floor(args.messageCount)),
    memberCount:
      args.memberCount === undefined ? undefined : Math.max(0, Math.floor(args.memberCount)),
    memberRolesTruncated: args.memberRolesTruncated ?? undefined,
    source: args.source ?? undefined,
    backupChecksum: args.backupChecksum ?? undefined,
    backupCompressed: args.backupCompressed ?? undefined,
    backupEncrypted: args.backupEncrypted ?? undefined,
    backupSnapshotChecksum: args.backupSnapshotChecksum ?? undefined,
    restoreKey,
    pushedToGithub: false,
    createdAt: now,
  });
  // Ghi từng chunk sau khi đã có id bản cha (chunk tham chiếu backupId).
  if (chunked) {
    for (const [index, data] of splitBackupJson(rawJson).entries()) {
      await ctx.db.insert("backupChunks", {
        guildId: args.guildId,
        backupId,
        index,
        data,
        createdAt: now,
      });
    }
  }
  // Đánh dấu lần backup gần nhất — lịch tự động tính từ đây.
  if (guild) await ctx.db.patch(guild._id, { lastBackupAt: now, updatedAt: now });
  // Tự dọn dẹp backup tồn dư theo CẢ HAI quy tắc của server: giữ N bản mới
  // nhất + xoá mọi bản quá hạn (nếu bật). Trước đây `slice(3)` hard-code nên
  // không ai chỉnh được; server lớn mất dữ liệu, server nhỏ tốn chỗ vô ích.
  const all = await ctx.db
    .query("guildBackups")
    .withIndex("by_guildId", (q) => q.eq("guildId", args.guildId))
    .collect();
  const keepCount = clampRetention(guild?.backupKeepCount, 3, 2, 50);
  const keepDays = clampRetention(guild?.backupKeepDays, 0, 0, 365);
  // -Infinity = TẮT dọn theo tuổi. Dùng Infinity sẽ khiến mọi bản đều "quá hạn"
  // (createdAt < Infinity luôn đúng) và xoá sạch — đã dính lỗi này một lần.
  const cutoff = keepDays > 0 ? now - keepDays * 86_400_000 : -Infinity;
  const drop = all
    .sort((a, b) => b.createdAt - a.createdAt)
    .filter((row, i) => i >= keepCount || row.createdAt < cutoff)
    .map((row) => row._id);
  for (const id of drop) {
    // Chunk là rác nếu bản cha biến mất — xoá kèm, không để lọt vào bảng.
    await deleteBackupChunks(ctx, id);
    await ctx.db.delete(id);
  }
  // Trả kèm mã khôi phục để bot có thể in ra log nếu cần — dashboard đọc mã qua
  // query riêng (`backup:myRestoreKeys`) nên không cần gửi qua bot.
  return { ok: true, backupId, restoreKey };
}

/**
 * Bot (lệnh chat `!backup keep`) đổi quy tắc giữ bản: giữ N bản gần nhất và
 * dọn bản quá hạn. Bot TỰ ghi (nên không cần settingsChangedAt — không có
 * bundle cache nào đọc 2 field này; việc dọn chạy ngay trong botStoreBackup).
 */
export const botSetBackupRetentionArgs = {
  guildId: v.string(),
  keepCount: v.optional(v.number()),
  keepDays: v.optional(v.number()),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type BotSetBackupRetentionArgs = ObjectType<typeof botSetBackupRetentionArgs>;

export async function botSetBackupRetentionHandler(
  ctx: MutationCtx,
  { botKey, guildId, keepCount, keepDays }: BotSetBackupRetentionArgs,
) {
  await requireBotKeyStrict(ctx, botKey);
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
    .first();
  if (!guild) return { ok: false, reason: "no_guild" };
  await ctx.db.patch(guild._id, {
    backupKeepCount:
      keepCount === undefined ? guild.backupKeepCount : clampRetention(keepCount, 3, 2, 50),
    backupKeepDays:
      keepDays === undefined ? guild.backupKeepDays : clampRetention(keepDays, 0, 0, 365),
    updatedAt: Date.now(),
  });
  return {
    ok: true,
    keepCount: clampRetention(keepCount ?? guild.backupKeepCount, 3, 2, 50),
    keepDays: clampRetention(keepDays ?? guild.backupKeepDays, 0, 0, 365),
  };
}

/** Action backup:githubPush cập nhật URL gist sau khi đẩy thành công. */
export const botSetBackupGithubArgs = {
  backupId: v.id("guildBackups"),
  url: v.string(),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type BotSetBackupGithubArgs = ObjectType<typeof botSetBackupGithubArgs>;

export async function botSetBackupGithubHandler(
  ctx: MutationCtx,
  { botKey, backupId, url }: BotSetBackupGithubArgs,
) {
  await requireBotKeyStrict(ctx, botKey);
  const backup = await ctx.db.get(backupId);
  if (!backup) return { ok: true };
  await ctx.db.patch(backup._id, {
    githubUrl: url.slice(0, 500),
    pushedToGithub: true,
  });
  return { ok: true };
}

/** Bot (lệnh !backup auto / /backup auto) bật/tắt tự động backup theo số ngày (2-30, 0 = tắt). */
export const botSetAutoBackupArgs = {
  guildId: v.string(),
  days: v.number(),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type BotSetAutoBackupArgs = ObjectType<typeof botSetAutoBackupArgs>;

export async function botSetAutoBackupHandler(
  ctx: MutationCtx,
  { botKey, guildId, days }: BotSetAutoBackupArgs,
) {
  await requireBotKeyStrict(ctx, botKey);
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
    .first();
  if (!guild) throw new Error("Server chưa được đồng bộ");
  const next = days <= 0 ? 0 : Math.max(2, Math.min(30, Math.floor(days)));
  await ctx.db.patch(guild._id, {
    backupAutoDays: next,
    updatedAt: Date.now(),
  });
  return { ok: true, days: next };
}

/** Bot (lệnh !backup / /backup) đặt cờ yêu cầu tạo backup — vòng quét 20s sẽ thực hiện. */
export const botSetBackupRequestArgs = {
  guildId: v.string(),
  pushToGithub: v.optional(v.boolean()),
  /** Kèm tin nhắn (tối đa 50 tin/kênh) khi chụp backup — auto sweep kế thừa
   * chế độ của bản gần nhất để checksum incremental không lệch. */
  includeMessages: v.optional(v.boolean()),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type BotSetBackupRequestArgs = ObjectType<typeof botSetBackupRequestArgs>;

export async function botSetBackupRequestHandler(
  ctx: MutationCtx,
  { botKey, guildId, pushToGithub, includeMessages }: BotSetBackupRequestArgs,
) {
  await requireBotKeyStrict(ctx, botKey);
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
    .first();
  if (!guild) throw new Error("Server chưa được đồng bộ");
  if (!guild.botInGuild) throw new Error("Bot chưa có trong server này");
  if (
    claimIsActive(guild.backupClaimedAt, guild.backupLeaseUntil) ||
    claimIsActive(guild.restoreClaimedAt, guild.restoreLeaseUntil)
  ) {
    return { ok: false, reason: "in_flight" };
  }
  await ctx.db.patch(guild._id, {
    backupRequested: true,
    backupPushToGithub: !!pushToGithub,
    backupIncludeMessages: !!includeMessages,
    backupClaimedAt: undefined,
    backupLeaseUntil: undefined,
    updatedAt: Date.now(),
  });
  return { ok: true };
}

/**
 * Bot xóa 1 bản backup hỏng (audit từ scripts/audit-backups.cjs) — BẢO MẬT CAO.
 * Chỉ nhận id thuộc bảng guildBackups; botKey sai → từ chối tuyệt đối.
 * Bản "suspect" (checksum lệch) KHÔNG được xóa qua function này — giữ làm bằng chứng.
 */
export const botDeleteBackupArgs = {
  backupId: v.id("guildBackups"),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type BotDeleteBackupArgs = ObjectType<typeof botDeleteBackupArgs>;

export async function botDeleteBackupHandler(
  ctx: MutationCtx,
  { botKey, backupId }: BotDeleteBackupArgs,
) {
  await requireBotKeyStrict(ctx, botKey);
  const row = await ctx.db.get(backupId);
  if (!row) return { ok: true, alreadyGone: true };
  await deleteBackupChunks(ctx, backupId);
  await ctx.db.delete(backupId);
  return { ok: true, deleted: true, guildId: row.guildId };
}

/**
 * Bot báo lỗi backup (chụp snapshot thất bại — bot thiếu quyền/không còn trong
 * server) — dashboard hiển thị lý do thay vì im lặng. Giữ `lastBackupAt` KHÔNG
 * đổi để lịch tự động có thể thử lại ở vòng sau.
 */
export const botReportBackupErrorArgs = {
  guildId: v.string(),
  error: v.string(),
  claimAt: v.optional(v.number()),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type BotReportBackupErrorArgs = ObjectType<typeof botReportBackupErrorArgs>;

export async function botReportBackupErrorHandler(
  ctx: MutationCtx,
  { botKey, guildId, error, claimAt }: BotReportBackupErrorArgs,
) {
  await requireBotKeyStrict(ctx, botKey);
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
    .first();
  if (!guild) return { ok: true };
  if (!claimMatches(guild, "backup", claimAt)) return { ok: false, reason: "stale_claim" };
  await ctx.db.patch(guild._id, {
    backupRequested: false,
    backupPushToGithub: false,
    backupClaimedAt: undefined,
    backupLeaseUntil: undefined,
    backupError: String(error || "Lỗi không xác định").slice(0, 300),
    backupErrorAt: Date.now(),
    // Xóa mốc "xong" cũ: lần này THẤT BẠI, giữ lại mốc cũ thì dashboard có thể
    // đọc nhầm thành vừa tạo xong một bản backup.
    backupFinishedAt: undefined,
    backupUnchanged: false,
    updatedAt: Date.now(),
  });
  return { ok: true };
}
