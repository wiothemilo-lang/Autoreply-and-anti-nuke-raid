/**
 * Đợt #5 tách `convex/bot_writes.ts` (75KB) — nhóm KHÔI PHỤC/IMPORT: đặt yêu
 * cầu, giành quyền (claim fencing), báo lỗi/kế hoạch, dọn cờ và ghi lại cấu
 * hình sau restore.
 *
 * Wrapper `export const X = mutation({…})` giữ NGUYÊN trong `convex/bot_writes.ts`
 * để tên function + validator không đổi (hợp đồng bot ⇄ Convex). Thân hàm nằm ở
 * đây — chỉ tách file, không đổi hành vi.
 */
import { v } from "convex/values";
import type { ObjectType } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import { requireBotKeyStrict } from "../botAuth";
import { BACKUP_CLAIM_TTL_MS, claimIsActive, claimMatches } from "./shared";

/** Bot (lệnh !backup restore / /backup restore) đặt cờ khôi phục cho một backup của đúng guild đó. */
export const botSetRestoreRequestArgs = {
  guildId: v.string(),
  backupId: v.id("guildBackups"),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type BotSetRestoreRequestArgs = ObjectType<typeof botSetRestoreRequestArgs>;

export async function botSetRestoreRequestHandler(
  ctx: MutationCtx,
  { botKey, guildId, backupId }: BotSetRestoreRequestArgs,
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
  const backup = await ctx.db.get(backupId);
  if (!backup || backup.guildId !== guildId) {
    throw new Error("Backup không tồn tại hoặc không thuộc server này");
  }
  await ctx.db.patch(guild._id, {
    restoreRequested: true,
    restoreBackupId: backupId,
    restoreClaimedAt: undefined,
    restoreLeaseUntil: undefined,
    updatedAt: Date.now(),
  });
  return { ok: true };
}

/**
 * Bot giành quyền xử lý một yêu cầu backup/khôi phục (chống lặp).
 * Chỉ bot claim THÀNH CÔNG mới được chạy; lượt quét khác/instance khác
 * gọi tới trong 10 phút sẽ bị từ chối và bỏ qua. Job còn sống có thể gia hạn lease
 * bằng `botRenewBackupClaim`; nếu bot chết, lease tự hết hạn để worker khác cứu.
 */
export const botClaimBackupArgs = {
  guildId: v.string(),
  kind: v.union(v.literal("backup"), v.literal("restore"), v.literal("import"), v.literal("plan")),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type BotClaimBackupArgs = ObjectType<typeof botClaimBackupArgs>;

export async function botClaimBackupHandler(
  ctx: MutationCtx,
  { botKey, guildId, kind }: BotClaimBackupArgs,
) {
  await requireBotKeyStrict(ctx, botKey);
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
    .first();
  if (!guild) return { ok: false, reason: "no_guild" };
  const now = Date.now();
  if (kind === "backup") {
    if (!guild.backupRequested) return { ok: false, reason: "no_request" };
    if (
      claimIsActive(guild.backupClaimedAt, guild.backupLeaseUntil) ||
      claimIsActive(guild.restoreClaimedAt, guild.restoreLeaseUntil)
    ) {
      return { ok: false, reason: "in_flight" };
    }
    await ctx.db.patch(guild._id, {
      backupClaimedAt: now,
      backupLeaseUntil: now + BACKUP_CLAIM_TTL_MS,
      updatedAt: now,
    });
    return { ok: true, claimAt: now };
  }
  if (kind === "import") {
    if (!guild.importRestoreRequested) return { ok: false, reason: "no_request" };
    if (
      claimIsActive(guild.backupClaimedAt, guild.backupLeaseUntil) ||
      claimIsActive(guild.restoreClaimedAt, guild.restoreLeaseUntil)
    ) {
      return { ok: false, reason: "in_flight" };
    }
    await ctx.db.patch(guild._id, {
      restoreClaimedAt: now,
      restoreLeaseUntil: now + BACKUP_CLAIM_TTL_MS,
      updatedAt: now,
    });
    return { ok: true, claimAt: now };
  }
  // Dry-run dùng CHUNG claim của restore: chủ server bấm "xem kế hoạch" rồi
  // bấm "khôi phục" ngay thì 2 việc phải loại trừ nhau, không được chạy chồng.
  if (kind === "plan") {
    if (!guild.restorePlanRequested) return { ok: false, reason: "no_request" };
    if (
      claimIsActive(guild.backupClaimedAt, guild.backupLeaseUntil) ||
      claimIsActive(guild.restoreClaimedAt, guild.restoreLeaseUntil)
    ) {
      return { ok: false, reason: "in_flight" };
    }
    await ctx.db.patch(guild._id, {
      restoreClaimedAt: now,
      restoreLeaseUntil: now + BACKUP_CLAIM_TTL_MS,
      updatedAt: now,
    });
    return { ok: true, claimAt: now };
  }
  if (!guild.restoreRequested) return { ok: false, reason: "no_request" };
  if (
    claimIsActive(guild.backupClaimedAt, guild.backupLeaseUntil) ||
    claimIsActive(guild.restoreClaimedAt, guild.restoreLeaseUntil)
  ) {
    return { ok: false, reason: "in_flight" };
  }
  await ctx.db.patch(guild._id, {
    restoreClaimedAt: now,
    restoreLeaseUntil: now + BACKUP_CLAIM_TTL_MS,
    updatedAt: now,
  });
  return { ok: true, claimAt: now };
}

/** Bot gia hạn lease khi restore còn sống; claimAt giữ nguyên làm fencing token. */
export const botRenewBackupClaimArgs = {
  guildId: v.string(),
  kind: v.union(v.literal("backup"), v.literal("restore"), v.literal("import"), v.literal("plan")),
  claimAt: v.number(),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type BotRenewBackupClaimArgs = ObjectType<typeof botRenewBackupClaimArgs>;

export async function botRenewBackupClaimHandler(
  ctx: MutationCtx,
  { botKey, guildId, kind, claimAt }: BotRenewBackupClaimArgs,
) {
  await requireBotKeyStrict(ctx, botKey);
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
    .first();
  if (!guild) return { ok: false, reason: "no_guild" };
  if (!claimMatches(guild, kind, claimAt)) return { ok: false, reason: "stale_claim" };
  const leaseUntil = Date.now() + BACKUP_CLAIM_TTL_MS;
  if (kind === "backup") {
    await ctx.db.patch(guild._id, { backupLeaseUntil: leaseUntil, updatedAt: Date.now() });
  } else {
    await ctx.db.patch(guild._id, { restoreLeaseUntil: leaseUntil, updatedAt: Date.now() });
  }
  return { ok: true, leaseUntil };
}

/**
 * Bot báo lỗi khôi phục — dashboard hiển thị lý do rõ ràng thay vì im lặng.
 * Xóa cờ restore (người dùng bấm lại sau khi khắc phục: bot online đủ quyền,
 * backup còn đọc được…).
 */
export const botReportRestoreErrorArgs = {
  guildId: v.string(),
  error: v.string(),
  claimAt: v.optional(v.number()),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type BotReportRestoreErrorArgs = ObjectType<typeof botReportRestoreErrorArgs>;

export async function botReportRestoreErrorHandler(
  ctx: MutationCtx,
  { botKey, guildId, error, claimAt }: BotReportRestoreErrorArgs,
) {
  await requireBotKeyStrict(ctx, botKey);
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
    .first();
  if (!guild) return { ok: true };
  if (!claimMatches(guild, "restore", claimAt)) return { ok: false, reason: "stale_claim" };
  await ctx.db.patch(guild._id, {
    restoreRequested: false,
    restoreBackupId: undefined,
    restoreClaimedAt: undefined,
    restoreLeaseUntil: undefined,
    restoreError: String(error || "Lỗi không xác định").slice(0, 300),
    restoreErrorAt: Date.now(),
    updatedAt: Date.now(),
  });
  return { ok: true };
}

/** Bot xóa cờ yêu cầu backup/khôi phục sau khi đã xử lý xong. */
export const botClearBackupArgs = {
  guildId: v.string(),
  kind: v.union(v.literal("backup"), v.literal("restore"), v.literal("import"), v.literal("plan")),
  /** true khi backup đã lưu thành công (hoặc bỏ qua vì không đổi) — chỉ khi đó mới cập nhật lastBackupAt. */
  storeOk: v.optional(v.boolean()),
  /** Backup bị bỏ qua vì server không đổi (checksum trùng) — dashboard nói rõ lý do. */
  unchanged: v.optional(v.boolean()),
  claimAt: v.optional(v.number()),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type BotClearBackupArgs = ObjectType<typeof botClearBackupArgs>;

export async function botClearBackupHandler(
  ctx: MutationCtx,
  { botKey, guildId, kind, storeOk, unchanged, claimAt }: BotClearBackupArgs,
) {
  await requireBotKeyStrict(ctx, botKey);
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
    .first();
  if (!guild) return { ok: true };
  if (!claimMatches(guild, kind, claimAt)) return { ok: false, reason: "stale_claim" };
  const patch: Record<string, unknown> = { updatedAt: Date.now() };
  if (kind === "backup") {
    patch.backupRequested = false;
    patch.backupPushToGithub = false;
    patch.backupClaimedAt = undefined;
    patch.backupLeaseUntil = undefined;
    patch.backupError = undefined;
    patch.backupErrorAt = undefined;
    // Backup đã xử lý xong (kể cả trường hợp bỏ qua vì checksum trùng) —
    // cập nhật mốc để botGetDueAuto không kích hoạt lại tức thì (chống lặp/spam).
    // Store thất bại → KHÔNG cập nhật, để bot thử lại ở vòng quét sau.
    if (storeOk !== false) patch.lastBackupAt = Date.now();
    // Mốc "xong" + lý do (không đổi) cho dashboard báo kết quả cho người dùng.
    // storeOk=false = lưu thất bại (bot còn thử lại) → KHÔNG đánh dấu xong, nếu
    // không dashboard sẽ đọc thành "vừa tạo xong một bản" trong khi thật ra lỗi.
    if (storeOk !== false) {
      patch.backupFinishedAt = Date.now();
      patch.backupUnchanged = !!unchanged;
    } else {
      // Lưu thất bại → xóa mốc: dashboard không được đọc thành "vừa tạo xong".
      patch.backupFinishedAt = undefined;
      patch.backupUnchanged = false;
    }
  } else if (kind === "import") {
    patch.importRestoreRequested = false;
    patch.importFileName = undefined;
    patch.importStorageId = undefined;
    patch.importError = undefined;
    patch.importErrorAt = undefined;
    patch.restoreClaimedAt = undefined;
    patch.restoreLeaseUntil = undefined;
    // Xóa luôn file backup đã tải lên (Convex file storage) — không để rác.
    if (guild.importStorageId) {
      try {
        await ctx.storage.delete(guild.importStorageId);
      } catch (e) {
        console.error(`[backup:clear:storage] ${guildId}:`, e instanceof Error ? e.message : e);
      }
    }
  } else if (kind === "plan") {
    // Dry-run KHÔNG đụng server nên không có "xong" để đánh dấu, và tuyệt đối
    // không đụng restoreFinishedAt — nếu không dashboard tưởng đã khôi phục xong.
    patch.restorePlanRequested = false;
    patch.restorePlanBackupId = undefined;
    patch.restoreClaimedAt = undefined;
    patch.restoreLeaseUntil = undefined;
  } else {
    patch.restoreRequested = false;
    patch.restoreBackupId = undefined;
    patch.restoreClaimedAt = undefined;
    patch.restoreLeaseUntil = undefined;
    patch.restoreError = undefined;
    patch.restoreErrorAt = undefined;
    patch.restoreFinishedAt = Date.now();
  }
  await ctx.db.patch(guild._id, patch);
  return { ok: true };
}

/**
 * Bot báo KẾ HOẠCH khôi phục (dry-run) hoặc lỗi khi tính kế hoạch. Một mutation
 * duy nhất cho cả hai vì cả hai đều ghi kết quả vào CÙNG chỗ (trường hợp lỗi
 * thì `plan` rỗng) — tách làm hai sẽ dễ quên xóa cờ yêu cầu ở nhánh lỗi, và
 * dashboard mãi chờ một kế hoạch không bao giờ tới.
 */
export const botReportRestorePlanArgs = {
  guildId: v.string(),
  /** Kế hoạch đã tính xong — bỏ trống khi tính lỗi. */
  plan: v.optional(
    v.object({
      guildName: v.optional(v.string()),
      createdAt: v.optional(v.number()),
      roleCount: v.number(),
      channelCount: v.number(),
      messageCount: v.number(),
      emojiCount: v.number(),
      stickerCount: v.number(),
      threadCount: v.optional(v.number()),
      /** Số thành viên có bản đồ vai trò trong backup (P2). */
      memberCount: v.optional(v.number()),
      /** Tổng số lượt gán vai trò dự kiến (P2). */
      memberRoleAssignments: v.optional(v.number()),
      banCount: v.optional(v.number()),
      /** Số trường thông tin server sẽ áp lại (tên/mô tả/icon/banner/splash). */
      metaFieldCount: v.optional(v.number()),
      settingsCount: v.number(),
      warnings: v.array(v.string()),
      at: v.number(),
    }),
  ),
  /** Lý do không tính được (backup hỏng, bot mất quyền…) — dashboard hiện ngay. */
  error: v.optional(v.string()),
  claimAt: v.optional(v.number()),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type BotReportRestorePlanArgs = ObjectType<typeof botReportRestorePlanArgs>;

export async function botReportRestorePlanHandler(
  ctx: MutationCtx,
  { botKey, guildId, plan, error, claimAt }: BotReportRestorePlanArgs,
) {
  await requireBotKeyStrict(ctx, botKey);
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
    .first();
  if (!guild) return { ok: true };
  // Dry-run dùng chung claim với restore (xem botClaimBackup kind "plan").
  if (!claimMatches(guild, "plan", claimAt)) return { ok: false, reason: "stale_claim" };
  const failed = !!error;
  await ctx.db.patch(guild._id, {
    restorePlanRequested: false,
    restorePlanBackupId: undefined,
    restoreClaimedAt: undefined,
    restoreLeaseUntil: undefined,
    restorePlan: plan ?? undefined,
    restorePlanError: failed ? String(error || "Lỗi không xác định").slice(0, 300) : undefined,
    restorePlanErrorAt: failed ? Date.now() : undefined,
    updatedAt: Date.now(),
  });
  return { ok: true };
}

/**
 * Bot báo lỗi xử lý file import (.msc/.json) — dashboard hiển thị lý do thay vì
 * im lặng. Xóa cờ + file (người dùng tải lại file khác), nhưng GIỮ lại lỗi để
 * web đọc qua backup:importStatus.
 */
export const botReportImportErrorArgs = {
  guildId: v.string(),
  error: v.string(),
  claimAt: v.optional(v.number()),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type BotReportImportErrorArgs = ObjectType<typeof botReportImportErrorArgs>;

export async function botReportImportErrorHandler(
  ctx: MutationCtx,
  { botKey, guildId, error, claimAt }: BotReportImportErrorArgs,
) {
  await requireBotKeyStrict(ctx, botKey);
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
    .first();
  if (!guild) return { ok: true };
  if (!claimMatches(guild, "import", claimAt)) return { ok: false, reason: "stale_claim" };
  await ctx.db.patch(guild._id, {
    importRestoreRequested: false,
    importFileName: undefined,
    importStorageId: undefined,
    importError: String(error || "Lỗi không xác định").slice(0, 300),
    importErrorAt: Date.now(),
    restoreClaimedAt: undefined,
    restoreLeaseUntil: undefined,
    updatedAt: Date.now(),
  });
  // Xóa file backup đã tải lên — không để rác storage (người dùng sẽ tải lại).
  if (guild.importStorageId) {
    try {
      await ctx.storage.delete(guild.importStorageId);
    } catch (e) {
      console.error(
        `[backup:import:error:storage] ${guildId}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }
  return { ok: true };
}

/** Bot ghi lại cấu hình cơ bản sau khi khôi phục backup (role/kênh đã map sang id mới). */
export const botRestoreSettingsArgs = {
  guildId: v.string(),
  prefix: v.optional(v.string()),
  badWords: v.optional(v.array(v.string())),
  whitelistRoles: v.optional(v.array(v.string())),
  whitelistUsers: v.optional(v.array(v.string())),
  modRoles: v.optional(v.array(v.string())),
  adminRoles: v.optional(v.array(v.string())),
  logChannelId: v.optional(v.union(v.string(), v.null())),
  modLogChannelId: v.optional(v.union(v.string(), v.null())),
  /** Claim timestamp để fence worker restore đã cũ. */
  claimAt: v.optional(v.number()),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type BotRestoreSettingsArgs = ObjectType<typeof botRestoreSettingsArgs>;

export async function botRestoreSettingsHandler(ctx: MutationCtx, args: BotRestoreSettingsArgs) {
  await requireBotKeyStrict(ctx, args.botKey);
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", args.guildId))
    .first();
  if (!guild) throw new Error("Server chưa được đồng bộ");
  if (args.claimAt !== undefined && !claimMatches(guild, "restore", args.claimAt)) {
    return { ok: false, reason: "stale_claim" };
  }
  const patch: Record<string, unknown> = { updatedAt: Date.now() };
  if (args.prefix !== undefined) patch.prefix = args.prefix;
  if (args.badWords !== undefined) patch.badWords = args.badWords.slice(0, 100);
  if (args.whitelistRoles !== undefined) patch.whitelistRoles = args.whitelistRoles.slice(0, 100);
  if (args.whitelistUsers !== undefined) patch.whitelistUsers = args.whitelistUsers.slice(0, 100);
  if (args.modRoles !== undefined) patch.modRoles = args.modRoles.slice(0, 50);
  if (args.adminRoles !== undefined) patch.adminRoles = args.adminRoles.slice(0, 50);
  if (args.logChannelId !== undefined) patch.logChannelId = args.logChannelId ?? undefined;
  if (args.modLogChannelId !== undefined) patch.modLogChannelId = args.modLogChannelId ?? undefined;
  await ctx.db.patch(guild._id, patch);
  return { ok: true };
}
