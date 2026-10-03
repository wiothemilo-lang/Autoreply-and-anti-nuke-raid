/**
 * Đợt #5 tách `convex/bot_writes.ts` (75KB) — nhóm CASE MOD: ghi hành động
 * moderation vào bảng `modActions` (đánh số case tăng dần, dọn theo trần).
 *
 * Wrapper `export const X = mutation({…})` giữ NGUYÊN trong `convex/bot_writes.ts`
 * để tên function + validator không đổi (hợp đồng bot ⇄ Convex). Thân hàm nằm ở
 * đây — chỉ tách file, không đổi hành vi.
 */
import { v } from "convex/values";
import type { ObjectType } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import { requireBotKeyStrict } from "../botAuth";
import { TRIM_BATCH, dropBeyondCap, shouldTrim } from "./shared";

export const botRecordModActionArgs = {
  guildId: v.string(),
  action: v.string(),
  targetId: v.optional(v.string()),
  targetName: v.optional(v.string()),
  executorId: v.optional(v.string()),
  executorName: v.optional(v.string()),
  reason: v.optional(v.string()),
  details: v.optional(v.string()),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type BotRecordModActionArgs = ObjectType<typeof botRecordModActionArgs>;

export async function botRecordModActionHandler(ctx: MutationCtx, args: BotRecordModActionArgs) {
  await requireBotKeyStrict(ctx, args.botKey);
  const now = Date.now();
  // Số case tăng dần của server (kiểu Carl-bot): bắt đầu từ số case đã có nếu chưa ghi.
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", args.guildId))
    .first();
  let counter = guild?.modCaseCounter ?? 0;
  if (guild?.modCaseCounter === undefined) {
    const existing = await ctx.db
      .query("modActions")
      .withIndex("by_guildId", (q) => q.eq("guildId", args.guildId))
      .collect();
    counter = existing.length;
  }
  const caseNumber = counter + 1;
  if (guild) {
    await ctx.db.patch(guild._id, { modCaseCounter: caseNumber, updatedAt: now });
  }
  await ctx.db.insert("modActions", {
    guildId: args.guildId,
    action: args.action.slice(0, 30),
    targetId: args.targetId ?? undefined,
    targetName: args.targetName ? args.targetName.slice(0, 80) : undefined,
    executorId: args.executorId ?? undefined,
    executorName: args.executorName ? args.executorName.slice(0, 80) : undefined,
    reason: args.reason ? args.reason.slice(0, 500) : undefined,
    details: args.details ? args.details.slice(0, 200) : undefined,
    caseNumber,
    createdAt: now,
  });
  // Chống phình DB: giữ tối đa 100 bản/server — dọn theo xác suất + lô (xem `shouldTrim`).
  if (shouldTrim()) {
    const newest = await ctx.db
      .query("modActions")
      .withIndex("by_guildId_createdAt", (q) => q.eq("guildId", args.guildId))
      .order("desc")
      .take(100 + TRIM_BATCH);
    await dropBeyondCap(ctx, newest, 100);
  }
  return { ok: true, caseNumber };
}
