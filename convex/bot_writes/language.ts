/**
 * Đợt #5 tách `convex/bot_writes.ts` (75KB) — nhóm NGÔN NGỮ NGƯỜI DÙNG:
 * `/language` ghi lựa chọn, bot đọc lại khi trả lời (bảng `userLangs`).
 *
 * Wrapper `export const X = mutation/query({…})` giữ NGUYÊN trong
 * `convex/bot_writes.ts` để tên function + validator không đổi (hợp đồng
 * bot ⇄ Convex). Thân hàm nằm ở đây — chỉ tách file, không đổi hành vi.
 */
import { v } from "convex/values";
import type { ObjectType } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireBotKeyStrict } from "../botAuth";

/** Lưu ngôn ngữ người dùng chọn qua `/language`. */
export const botSetUserLangArgs = {
  userId: v.string(),
  lang: v.string(),
  botKey: v.optional(v.string()),
};
export type BotSetUserLangArgs = ObjectType<typeof botSetUserLangArgs>;

export async function botSetUserLangHandler(ctx: MutationCtx, args: BotSetUserLangArgs) {
  await requireBotKeyStrict(ctx, args.botKey);
  // Chỉ nhận ngôn ngữ bot thực sự hỗ trợ — rác thì bỏ qua, không ghi.
  if (!["vi", "en", "de"].includes(args.lang)) return { ok: false };
  const row = await ctx.db
    .query("userLangs")
    .withIndex("by_userId", (q) => q.eq("userId", args.userId))
    .first();
  const now = Date.now();
  if (row) await ctx.db.patch(row._id, { lang: args.lang, updatedAt: now });
  else await ctx.db.insert("userLangs", { userId: args.userId, lang: args.lang, updatedAt: now });
  return { ok: true };
}

/** Đọc ngôn ngữ người dùng đã chọn; null = chưa chọn (bot tự nhận ra locale). */
export const botGetUserLangArgs = {
  userId: v.string(),
  botKey: v.optional(v.string()),
};
export type BotGetUserLangArgs = ObjectType<typeof botGetUserLangArgs>;

export async function botGetUserLangHandler(ctx: QueryCtx, args: BotGetUserLangArgs) {
  await requireBotKeyStrict(ctx, args.botKey);
  const row = await ctx.db
    .query("userLangs")
    .withIndex("by_userId", (q) => q.eq("userId", args.userId))
    .first();
  return { lang: row?.lang ?? null };
}
