/**
 * Đợt #5 tách `convex/guilds.ts` (99KB) — nhóm MANG CẤU HÌNH SANG HOST KHÁC
 * (export/import JSON của dashboard).
 *
 * Wrapper `export const …` + validator giữ NGUYÊN trong `convex/guilds.ts` để
 * hợp đồng tên với dashboard (api.guilds.exportGuildConfig…) không đổi; thân
 * hàm nằm ở đây. Logic thuần (allowlist field, chuẩn hoá) vẫn ở
 * `convex/guildConfig.ts` — file này chỉ là lớp gọi db. Chỉ tách file — không
 * đổi hành vi.
 */
import { v } from "convex/values";
import type { ObjectType } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getUserByToken, canManageGuild } from "../auth";
import { buildGuildConfigExport, sanitizeImportedConfig } from "../guildConfig";

/**
 * Xuất cấu hình server ra JSON (để lưu ở nơi khác / dán lại sau khi đổi host).
 *
 * CHỈ trả cấu hình — `convex/backup.ts` đã lo phần nội dung Discord (role,
 * kênh, quyền). Danh sách field lấy từ allowlist `PORTABLE_CONFIG_FIELDS`, nên
 * `ownerId` / `lastHeartbeat` / cờ backup-restore KHÔNG bao giờ lọt ra file.
 */
export const exportGuildConfigArgs = { token: v.string(), guildId: v.string() };
export type ExportGuildConfigArgs = ObjectType<typeof exportGuildConfigArgs>;
export async function exportGuildConfigHandler(
  ctx: QueryCtx,
  { token, guildId }: ExportGuildConfigArgs,
) {
  const user = await getUserByToken(ctx, token);
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
    .first();
  if (!guild || !canManageGuild(user, guild)) throw new Error("Không có quyền quản lý server này");
  return buildGuildConfigExport(guild);
}

/**
 * Nạp cấu hình từ JSON xuất ra (kèm nút tải lên trên dashboard).
 *
 * Ba điều bắt buộc ở đây, đừng bỏ khi sửa:
 *   1. `canManageGuild` — nạp cấu hình là quyền quản trị server, không phải
 *      ai có token phiên cũng nạp được.
 *   2. `settingsChangedAt` — bot đọc field này để biết "cấu hình vừa đổi".
 *      Thiếu nó thì thay đổi phải chờ hết TTL cache 30 phút (đúng lớp lỗi
 *      23/09, cổng `check-settings-signal.cjs` canh chỗ này).
 *   3. `sanitizeImportedConfig` lọc allowlist + chuẩn hoá TRƯỚC khi patch —
 *      không tin file client gửi lên.
 */
export const importGuildConfigArgs = {
  token: v.string(),
  guildId: v.string(),
  config: v.record(v.string(), v.any()),
};
export type ImportGuildConfigArgs = ObjectType<typeof importGuildConfigArgs>;
export async function importGuildConfigHandler(
  ctx: MutationCtx,
  { token, guildId, config }: ImportGuildConfigArgs,
) {
  const user = await getUserByToken(ctx, token);
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
    .first();
  if (!guild || !canManageGuild(user, guild)) throw new Error("Không có quyền quản lý server này");

  const result = sanitizeImportedConfig(config, guild);
  // Không có gì để ghi — trả về số liệu để UI báo, đừng patch rỗng rồi báo
  // "thành công" là gây hiểu nhầm.
  if (result.applied.length === 0) {
    return { ok: false, applied: [], ignored: result.ignored, invalid: result.invalid };
  }

  const now = Date.now();
  await ctx.db.patch(guild._id, {
    ...result.patch,
    updatedAt: now,
    settingsChangedAt: now,
  });
  // KHÔNG trả `patch` về client: chỉ cần số liệu để báo, đỡ kéo cả cấu hình
  // (có thể vài chục KB) qua dây. Cấu hình đã ghi thì Convex tự đẩy về.
  return { ok: true, applied: result.applied, ignored: result.ignored, invalid: result.invalid };
}
