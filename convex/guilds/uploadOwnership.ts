import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

declare const process: { env: { DASHBOARD_URL?: string; OAUTH_REDIRECT_URI?: string } };

export function dashboardUploadOrigins(): string[] {
  const origins = [
    "https://protogon.freebuff.app",
    "https://www.protogon.freebuff.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
  ];
  const configured = process.env.DASHBOARD_URL || process.env.OAUTH_REDIRECT_URI;
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" && !origins.includes(url.origin)) origins.push(url.origin);
    } catch {
      // Origin cấu hình sai không được phép gọi đường upload có xác thực.
    }
  }
  return origins;
}

export function greetingImageContentType(bytes: Uint8Array): string | null {
  const has = (offset: number, signature: number[]) =>
    signature.every((value, index) => bytes[offset + index] === value);
  if (has(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (has(0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (has(0, [0x47, 0x49, 0x46, 0x38]) && [0x37, 0x39].includes(bytes[4]) && bytes[5] === 0x61) {
    return "image/gif";
  }
  if (has(0, [0x52, 0x49, 0x46, 0x46]) && has(8, [0x57, 0x45, 0x42, 0x50])) return "image/webp";
  return null;
}

export async function findOwnedUpload(ctx: MutationCtx, storageId: Id<"_storage">) {
  return await ctx.db
    .query("dashboardUploads")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .first();
}

export async function findOwnedImageUrl(ctx: MutationCtx, url: unknown) {
  if (typeof url !== "string" || !/\/api\/storage\/[^/?#]+/.test(url)) return null;
  const canonical = url.split(/[?#]/, 1)[0];
  return await ctx.db
    .query("dashboardUploads")
    .withIndex("by_url", (q) => q.eq("url", canonical))
    .first();
}

export async function deleteOwnedUpload(
  ctx: MutationCtx,
  guildId: string,
  purpose: Doc<"dashboardUploads">["purpose"],
  upload: Doc<"dashboardUploads"> | null,
) {
  if (upload?.guildId !== guildId || upload.purpose !== purpose) return;
  await ctx.storage.delete(upload.storageId);
  await ctx.db.delete(upload._id);
}
