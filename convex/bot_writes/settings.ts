/**
 * Đợt #5 tách `convex/bot_writes.ts` (75KB) — nhóm GHI CẤU HÌNH SERVER: patch
 * document `guilds` cho prefix/log/verify/alt, lockdown, antinuke, daily report.
 *
 * Wrapper `export const X = mutation({…})` giữ NGUYÊN trong `convex/bot_writes.ts`
 * để tên function + validator không đổi (hợp đồng bot ⇄ Convex). Thân hàm nằm ở
 * đây — chỉ tách file, không đổi hành vi.
 */
import { v } from "convex/values";
import type { ObjectType } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import { requireBotKeyStrict } from "../botAuth";

export const botUpdateSettingsArgs = {
  guildId: v.string(),
  prefix: v.optional(v.string()),
  logChannelId: v.optional(v.union(v.string(), v.null())),
  modRoles: v.optional(v.array(v.string())),
  adminRoles: v.optional(v.array(v.string())),
  badWords: v.optional(v.array(v.string())),
  // Verify system — bot commands `/verify` and `!verify` call this mutation
  verifyEnabled: v.optional(v.boolean()),
  verifyMethod: v.optional(v.union(v.literal("button"), v.literal("captcha"))),
  verifyChannelId: v.optional(v.union(v.string(), v.null())),
  unverifiedRoleId: v.optional(v.union(v.string(), v.null())),
  verifiedRoleId: v.optional(v.union(v.string(), v.null())),
  // Alt detection — các lệnh /alt on|off|punish|threshold|vpn gọi mutation này.
  // Thiếu các field dưới đây khiến validator từ chối (ArgumentValidationError)
  // và lệnh chạy thật hỏng câm — xem scripts/test-convex-arg-contract.cjs.
  altDetectionEnabled: v.optional(v.boolean()),
  vpnBlockEnabled: v.optional(v.boolean()),
  altMaxRiskScore: v.optional(v.number()),
  altPunish: v.optional(
    v.union(v.literal("kick"), v.literal("ban"), v.literal("timeout"), v.literal("verify")),
  ),
  altVpnMode: v.optional(v.union(v.literal("strict"), v.literal("warn"), v.literal("off"))),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type BotUpdateSettingsArgs = ObjectType<typeof botUpdateSettingsArgs>;

export async function botUpdateSettingsHandler(ctx: MutationCtx, args: BotUpdateSettingsArgs) {
  await requireBotKeyStrict(ctx, args.botKey);
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", args.guildId))
    .first();
  if (!guild) throw new Error("Server chưa được đồng bộ");
  const patch: Record<string, unknown> = { updatedAt: Date.now() };
  if (args.prefix !== undefined) {
    if (!/^[!^$#&%]{1,3}$/.test(args.prefix)) {
      throw new Error("Prefix phải là 1-3 ký tự đặc biệt");
    }
    patch.prefix = args.prefix;
  }
  if (args.logChannelId !== undefined) patch.logChannelId = args.logChannelId ?? undefined;
  if (args.modRoles !== undefined) patch.modRoles = args.modRoles;
  if (args.adminRoles !== undefined) patch.adminRoles = args.adminRoles;
  if (args.badWords !== undefined) {
    const words = args.badWords
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length > 0 && w.length <= 40)
      .slice(0, 100);
    patch.badWords = [...new Set(words)];
  }
  if (args.verifyEnabled !== undefined) patch.verifyEnabled = args.verifyEnabled;
  if (args.verifyMethod !== undefined) patch.verifyMethod = args.verifyMethod;
  if (args.verifyChannelId !== undefined) patch.verifyChannelId = args.verifyChannelId ?? undefined;
  if (args.unverifiedRoleId !== undefined)
    patch.unverifiedRoleId = args.unverifiedRoleId ?? undefined;
  if (args.verifiedRoleId !== undefined) patch.verifiedRoleId = args.verifiedRoleId ?? undefined;
  if (args.altDetectionEnabled !== undefined) patch.altDetectionEnabled = args.altDetectionEnabled;
  if (args.vpnBlockEnabled !== undefined) patch.vpnBlockEnabled = args.vpnBlockEnabled;
  if (args.altMaxRiskScore !== undefined)
    patch.altMaxRiskScore = Math.max(10, Math.min(100, args.altMaxRiskScore));
  if (args.altPunish !== undefined) patch.altPunish = args.altPunish;
  if (args.altVpnMode !== undefined) patch.altVpnMode = args.altVpnMode;
  await ctx.db.patch(guild._id, patch);
  return { ok: true };
}

export const botUpdateLockdownArgs = {
  guildId: v.string(),
  enabled: v.optional(v.boolean()),
  minutes: v.optional(v.number()),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type BotUpdateLockdownArgs = ObjectType<typeof botUpdateLockdownArgs>;

export async function botUpdateLockdownHandler(ctx: MutationCtx, args: BotUpdateLockdownArgs) {
  await requireBotKeyStrict(ctx, args.botKey);
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", args.guildId))
    .first();
  if (!guild) throw new Error("Server chưa được đồng bộ");
  const patch: Record<string, unknown> = { updatedAt: Date.now() };
  if (args.enabled !== undefined) patch.lockdownEnabled = args.enabled;
  if (args.minutes !== undefined) {
    patch.lockdownMinutes = Math.max(1, Math.min(120, Math.floor(args.minutes)));
  }
  await ctx.db.patch(guild._id, patch);
  return { ok: true };
}

/** Bot records the current lockdown state (until = unlock timestamp, requested = manual unlock flag). */
export const botLockStateArgs = {
  guildId: v.string(),
  until: v.optional(v.union(v.number(), v.null())),
  requested: v.optional(v.boolean()),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type BotLockStateArgs = ObjectType<typeof botLockStateArgs>;

export async function botLockStateHandler(
  ctx: MutationCtx,
  { botKey, guildId, until, requested }: BotLockStateArgs,
) {
  await requireBotKeyStrict(ctx, botKey);
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
    .first();
  if (!guild) return { ok: true };
  const patch: Record<string, unknown> = { updatedAt: Date.now() };
  if (until !== undefined) patch.lockdownUntil = until ?? undefined;
  if (requested !== undefined) patch.lockdownRequested = requested;
  await ctx.db.patch(guild._id, patch);
  return { ok: true };
}

/** Bot xóa cờ yêu cầu reset nhiệt sau khi đã dọn bộ nhớ. */
export const botClearHeatResetArgs = {
  guildId: v.string(),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type BotClearHeatResetArgs = ObjectType<typeof botClearHeatResetArgs>;

export async function botClearHeatResetHandler(
  ctx: MutationCtx,
  { botKey, guildId }: BotClearHeatResetArgs,
) {
  await requireBotKeyStrict(ctx, botKey);
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
    .first();
  if (!guild) return { ok: true };
  await ctx.db.patch(guild._id, {
    heatResetRequested: false,
    heatResetUserId: undefined,
    updatedAt: Date.now(),
  });
  return { ok: true };
}

/** Bot records when the daily report for a guild was sent. */
export const botSetReportAtArgs = {
  guildId: v.string(),
  at: v.number(),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type BotSetReportAtArgs = ObjectType<typeof botSetReportAtArgs>;

export async function botSetReportAtHandler(
  ctx: MutationCtx,
  { botKey, guildId, at }: BotSetReportAtArgs,
) {
  await requireBotKeyStrict(ctx, botKey);
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
    .first();
  if (!guild) return { ok: true };
  await ctx.db.patch(guild._id, { lastReportAt: at, updatedAt: Date.now() });
  return { ok: true };
}

export const botSetAntinukeArgs = {
  guildId: v.string(),
  enabled: v.boolean(),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type BotSetAntinukeArgs = ObjectType<typeof botSetAntinukeArgs>;

export async function botSetAntinukeHandler(
  ctx: MutationCtx,
  { botKey, guildId, enabled }: BotSetAntinukeArgs,
) {
  await requireBotKeyStrict(ctx, botKey);
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
    .first();
  if (!guild) throw new Error("Server chưa được đồng bộ");
  await ctx.db.patch(guild._id, { antinukeEnabled: enabled, updatedAt: Date.now() });
  return { ok: true };
}
