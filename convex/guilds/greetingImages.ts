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
import { deleteOwnedUpload, findOwnedImageUrl, findOwnedUpload } from "./uploadOwnership";
import type { Doc } from "../_generated/dataModel";

/** Trần upload ảnh và file import qua dashboard. */
export const MAX_DASHBOARD_UPLOAD_BYTES = 8_000_000;
export const GREETING_IMAGE_SLOTS = [
  "welcomeEmbedImage",
  "welcomeEmbedThumbnail",
  "goodbyeEmbedImage",
  "goodbyeEmbedThumbnail",
  "welcomeCardBackground",
  "goodbyeCardBackground",
] as const;

export async function reconcileGreetingImages(
  ctx: MutationCtx,
  guild: Doc<"guilds">,
  patch: Record<string, unknown>,
) {
  const removed = new Set<string>();
  for (const slot of GREETING_IMAGE_SLOTS) {
    if (!(slot in patch) || patch[slot] === guild[slot]) continue;
    const next = await findOwnedImageUrl(ctx, patch[slot]);
    if (next && next.guildId !== guild.discordId) throw new Error("Ảnh thuộc server khác");
    const old = guild[slot];
    if (old) removed.add(old);
  }
  const urlsInUse = new Set(
    GREETING_IMAGE_SLOTS.map((slot) => (slot in patch ? patch[slot] : guild[slot]))
      .filter((url): url is string => typeof url === "string")
      .map((url) => url.split(/[?#]/, 1)[0]),
  );
  for (const url of removed) {
    if (urlsInUse.has(url.split(/[?#]/, 1)[0])) continue;
    await deleteOwnedUpload(ctx, guild.discordId, "greeting", await findOwnedImageUrl(ctx, url));
  }
}

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
  slot: v.union(...GREETING_IMAGE_SLOTS.map((slot) => v.literal(slot))),
};
export type SaveGreetingImageArgs = ObjectType<typeof saveGreetingImageArgs>;
export async function saveGreetingImageHandler(
  ctx: MutationCtx,
  { token, guildId, storageId, slot }: SaveGreetingImageArgs,
  owned = false,
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
  if (meta.size > MAX_DASHBOARD_UPLOAD_BYTES) {
    throw new Error(
      `Ảnh quá lớn (tối đa ${MAX_DASHBOARD_UPLOAD_BYTES / 1_000_000} MB — ảnh này ${(meta.size / 1_000_000).toFixed(1)} MB).`,
    );
  }
  const url = await ctx.storage.getUrl(storageId);
  if (!url) throw new Error("Không lấy được URL ảnh vừa tải lên");
  const upload = await findOwnedUpload(ctx, storageId);
  if (upload && (upload.guildId !== guildId || upload.purpose !== "greeting")) {
    throw new Error("Ảnh thuộc server khác");
  }
  if (owned && !upload) {
    await ctx.db.insert("dashboardUploads", { storageId, guildId, purpose: "greeting", url });
  }
  await reconcileGreetingImages(ctx, guild, { [slot]: url });
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
  await reconcileGreetingImages(ctx, guild, { [slot]: undefined });
  await ctx.db.patch(guild._id, {
    [slot]: undefined,
    updatedAt: Date.now(),
    settingsChangedAt: Date.now(),
  });
  return { ok: true };
}
