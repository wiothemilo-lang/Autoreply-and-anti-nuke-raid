/**
 * Đợt #5 tách `convex/bot_writes.ts` (75KB) — nhóm AUTO-REPLY: bot upsert/xoá
 * rule trả lời tự động theo từ khoá (bảng `autoReplies`).
 *
 * Wrapper `export const X = mutation({…})` giữ NGUYÊN trong `convex/bot_writes.ts`
 * để tên function + validator không đổi (hợp đồng bot ⇄ Convex). Thân hàm nằm ở
 * đây — chỉ tách file, không đổi hành vi.
 */
import { v } from "convex/values";
import type { ObjectType } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import { requireBotKeyStrict } from "../botAuth";

export const botAutoReplyUpsertArgs = {
  guildId: v.string(),
  name: v.string(),
  triggerType: v.union(v.literal("keyword"), v.literal("mention")),
  keywords: v.array(v.string()),
  response: v.string(),
  channels: v.array(v.string()),
  cooldownSeconds: v.number(),
  enabled: v.boolean(),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type BotAutoReplyUpsertArgs = ObjectType<typeof botAutoReplyUpsertArgs>;

export async function botAutoReplyUpsertHandler(ctx: MutationCtx, args: BotAutoReplyUpsertArgs) {
  await requireBotKeyStrict(ctx, args.botKey);
  if (!/^[a-z0-9_-]{1,32}$/i.test(args.name)) throw new Error("Tên rule không hợp lệ");
  const now = Date.now();
  const existing = await ctx.db
    .query("autoReplies")
    .withIndex("by_guildId_name", (q) => q.eq("guildId", args.guildId).eq("name", args.name))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, {
      triggerType: args.triggerType,
      keywords: args.keywords,
      response: args.response,
      channels: args.channels,
      cooldownSeconds: args.cooldownSeconds,
      enabled: args.enabled,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("autoReplies", {
      guildId: args.guildId,
      name: args.name,
      triggerType: args.triggerType,
      keywords: args.keywords,
      response: args.response,
      channels: args.channels,
      cooldownSeconds: args.cooldownSeconds,
      enabled: args.enabled,
      createdAt: now,
      updatedAt: now,
    });
  }
  return { ok: true };
}

export const botAutoReplyRemoveArgs = {
  guildId: v.string(),
  name: v.string(),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type BotAutoReplyRemoveArgs = ObjectType<typeof botAutoReplyRemoveArgs>;

export async function botAutoReplyRemoveHandler(
  ctx: MutationCtx,
  { botKey, guildId, name }: BotAutoReplyRemoveArgs,
) {
  await requireBotKeyStrict(ctx, botKey);
  const existing = await ctx.db
    .query("autoReplies")
    .withIndex("by_guildId_name", (q) => q.eq("guildId", guildId).eq("name", name))
    .first();
  if (existing) await ctx.db.delete(existing._id);
  return { ok: true };
}
