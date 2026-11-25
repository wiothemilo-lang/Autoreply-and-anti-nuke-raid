/**
 * Đợt #5 tách `convex/guilds.ts` (99KB) — nhóm ẢNH THẺ CHÀO welcome/goodbye.
 *
 * Wrapper `export const …` + validator giữ NGUYÊN trong `convex/guilds.ts` để
 * hợp đồng tên với bot (`guilds:saveGreetingImage`…) không đổi; thân hàm nằm ở
 * đây. Chỉ tách file — không đổi hành vi.
 */
import { v } from "convex/values";
import type { ObjectType } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import { getUserByToken, canManageGuild } from "../auth";

/** Trần ảnh thẻ chào: 8 MB — ảnh nặng hơn khiến Discord tải chậm mỗi lượt join/leave. */
const MAX_GREETING_IMAGE_BYTES = 8_000_000;

/** URL upload ảnh thẻ chào (banner/thumbnail) — manager của server tự tải lên. */
export const generateGreetingImageUploadUrlArgs = { token: v.string(), guildId: v.string() };
export type GenerateGreetingImageUploadUrlArgs = ObjectType<
  typeof generateGreetingImageUploadUrlArgs
>;
export async function generateGreetingImageUploadUrlHandler(
  ctx: MutationCtx,
  { token, guildId }: GenerateGreetingImageUploadUrlArgs,
) {
  const user = await getUserByToken(ctx, token);
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
    .first();
  if (!guild || !canManageGuild(user, guild)) throw new Error("Không có quyền quản lý server này");
  return await ctx.storage.generateUploadUrl();
}

/**
 * Lưu ảnh vừa upload (từ dashboard) vào đúng ô banner/thumbnail của welcome
 * hoặc goodbye. Trả URL công khai để dashboard hiển thị preview NGAY; bot đọc
 * lại URL từ `getGuild` mỗi tick nên đổi ảnh là bot dùng ảnh mới trong ~1 tick.
 */
export const saveGreetingImageArgs = {
  token: v.string(),
  guildId: v.string(),
  storageId: v.id("_storage"),
  slot: v.union(
    v.literal("welcomeEmbedImage"),
    v.literal("welcomeEmbedThumbnail"),
    v.literal("goodbyeEmbedImage"),
    v.literal("goodbyeEmbedThumbnail"),
    v.literal("welcomeCardBackground"),
    v.literal("goodbyeCardBackground"),
  ),
};
export type SaveGreetingImageArgs = ObjectType<typeof saveGreetingImageArgs>;
export async function saveGreetingImageHandler(
  ctx: MutationCtx,
  { token, guildId, storageId, slot }: SaveGreetingImageArgs,
) {
  const user = await getUserByToken(ctx, token);
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
    .first();
  if (!guild || !canManageGuild(user, guild)) throw new Error("Không có quyền quản lý server này");
  const meta = await ctx.storage.getMetadata(storageId);
  if (!meta) throw new Error("Ảnh không tồn tại hoặc đã bị xoá — hãy chọn lại ảnh");
  if (!String(meta.contentType ?? "").startsWith("image/")) {
    throw new Error("Chỉ nhận file ảnh (PNG, JPG, GIF, WEBP).");
  }
  if (meta.size > MAX_GREETING_IMAGE_BYTES) {
    throw new Error(
      `Ảnh quá lớn (tối đa ${MAX_GREETING_IMAGE_BYTES / 1_000_000} MB — ảnh này ${(meta.size / 1_000_000).toFixed(1)} MB).`,
    );
  }
  const url = await ctx.storage.getUrl(storageId);
  if (!url) throw new Error("Không lấy được URL ảnh vừa tải lên");
  // ID do dashboard gửi không chứng minh quyền sở hữu file. Chỉ cập nhật tham chiếu.
  await ctx.db.patch(guild._id, {
    [slot]: url,
    updatedAt: Date.now(),
    // Tín hiệu cho bot áp dụng ngay (cùng cơ chế settingsChangedAt của updateSettings).
    settingsChangedAt: Date.now(),
  });
  return { ok: true, url };
}

/**
 * Gỡ tham chiếu ảnh khỏi một ô banner/thumbnail.
 * Tách riêng khỏi updateSettings vì nút "Xoá ảnh" phải xoá ĐÚNG ô đó, không
 * ghi đè các field khác mà panel đang giữ trong state.
 */
export const removeGreetingImageArgs = {
  token: v.string(),
  guildId: v.string(),
  slot: v.union(
    v.literal("welcomeEmbedImage"),
    v.literal("welcomeEmbedThumbnail"),
    v.literal("goodbyeEmbedImage"),
    v.literal("goodbyeEmbedThumbnail"),
    v.literal("welcomeCardBackground"),
    v.literal("goodbyeCardBackground"),
  ),
};
export type RemoveGreetingImageArgs = ObjectType<typeof removeGreetingImageArgs>;
export async function removeGreetingImageHandler(
  ctx: MutationCtx,
  { token, guildId, slot }: RemoveGreetingImageArgs,
) {
  const user = await getUserByToken(ctx, token);
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
    .first();
  if (!guild || !canManageGuild(user, guild)) throw new Error("Không có quyền quản lý server này");
  await ctx.db.patch(guild._id, {
    [slot]: undefined,
    updatedAt: Date.now(),
    settingsChangedAt: Date.now(),
  });
  return { ok: true };
}
