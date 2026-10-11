/**
 * convex/announcements.ts — THÔNG BÁO CẬP NHẬT + BẢN CẬP NHẬT HIỆN TẠI
 * (10/10/2026).
 *
 * Vì sao tồn tại: trước đây web không có kênh nào để admin thông báo bản cập
 * nhật / sự cố cho người dùng — muốn nói gì phải sửa code rồi deploy. Nay
 * admin viết ngay trong cửa sổ Admin, người dùng thấy thanh thông báo toàn
 * site, và nhãn "bản cập nhật hiện tại" hiển thị cùng chỗ.
 *
 * Quyền — đúng cổng của cửa sổ Admin:
 *  - GHI (save / remove / setSiteInfo) + danh sách (adminList): requireBotAdmin
 *    = chủ bot HOẶC quản trị viên nhóm (cùng cổng mọi tính năng khác trong
 *    Admin từ 10/10/2026). Người thường gọi vào bị từ chối ngay.
 *  - ĐỌC công khai (publicFeed): KHÔNG cần đăng nhập — nội dung thông báo là
 *    thông tin công khai. Cùng pattern `plans.catalog` (args: {}).
 *
 * Mọi ràng buộc độ dài nằm Ở ĐÂY (client chỉ là form): title/body bắt buộc,
 * version tuỳ chọn; `active=false` ẩn bài khỏi web nhưng giữ dữ liệu — không
 * có "xoá mềm" nào làm mất lịch sử thông báo của admin.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUserByToken } from "./auth";
import { requireBotAdmin } from "./hidden";

/** Trần ký tự — khớp maxLength của form trong Admin.tsx. */
export const TITLE_MAX = 120;
export const BODY_MAX = 4000;
export const VERSION_MAX = 32;
/** Số bài adminList trả về — mới nhất trước, đủ xem mà không kéo cả bảng. */
export const LIST_MAX = 50;

/** Chuỗi bắt buộc: trim + chặn rỗng + chặn vượt trần (lỗi NÓI RÕ giới hạn). */
function cleanRequired(value: string, max: number, label: string): string {
  const s = String(value ?? "").trim();
  if (!s) throw new Error(`${label} không được để trống.`);
  if (s.length > max) throw new Error(`${label} tối đa ${max} ký tự.`);
  return s;
}

/**
 * Chuỗi version: trim + trần; RỖNG là hợp lệ (= xoá nhãn bản cập nhật) nên
 * không dùng cleanRequired — admin cần cách tắt nhãn cũ mà không phải xoá bài.
 */
function cleanOptional(value: string | undefined, max: number, label: string): string {
  const s = String(value ?? "").trim();
  if (s.length > max) throw new Error(`${label} tối đa ${max} ký tự.`);
  return s;
}

/** Hồ sơ người hiển thị trong danh sách admin (null = chưa từng đăng nhập web). */
async function authorProfile(ctx: Parameters<typeof getUserByToken>[0], discordId: string) {
  const row = await ctx.db
    .query("users")
    .withIndex("by_discordId", (q) => q.eq("discordId", discordId))
    .first();
  return { username: row?.username ?? null, globalName: row?.globalName ?? null };
}

/** Danh sách TẤT CẢ bài (kể cả đã ẩn) cho cửa sổ Admin — mới nhất trước. */
export const adminList = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await getUserByToken(ctx, token);
    await requireBotAdmin(ctx, user);
    const rows = await ctx.db
      .query("announcements")
      .withIndex("by_createdAt")
      .order("desc")
      .take(LIST_MAX);
    const out = [];
    for (const r of rows) {
      const who = await authorProfile(ctx, r.authorDiscordId);
      out.push({
        id: r._id,
        title: r.title,
        body: r.body,
        version: r.version ?? null,
        active: r.active,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        authorDiscordId: r.authorDiscordId,
        authorName: who.globalName ?? who.username,
      });
    }
    return out;
  },
});

/**
 * Tạo / sửa thông báo. `id` có mặt = sửa bài cũ (giữ nguyên createdAt — bài
 * cũ không "nhảy lên đầu" chỉ vì admin sửa chính tả); thiếu = bài mới.
 */
export const save = mutation({
  args: {
    token: v.string(),
    id: v.optional(v.id("announcements")),
    title: v.string(),
    body: v.string(),
    version: v.optional(v.string()),
    active: v.boolean(),
  },
  handler: async (ctx, { token, id, title, body, version, active }) => {
    const user = await getUserByToken(ctx, token);
    await requireBotAdmin(ctx, user);
    // requireBotAdmin đã ném khi user=null nhưng TS không hẹp kiểu được — dòng
    // này chỉ để compiler biết authorDiscordId không bao giờ đọc null.
    if (!user) throw new Error("Vui lòng đăng nhập");
    const t = cleanRequired(title, TITLE_MAX, "Tiêu đề");
    const b = cleanRequired(body, BODY_MAX, "Nội dung");
    const ver = cleanOptional(version, VERSION_MAX, "Phiên bản") || undefined;
    const now = Date.now();

    if (id) {
      const row = await ctx.db.get(id);
      if (!row) throw new Error("Thông báo không tồn tại — có thể đã bị xoá.");
      await ctx.db.patch(id, { title: t, body: b, version: ver, active, updatedAt: now });
      return { ok: true as const, id };
    }
    const newId = await ctx.db.insert("announcements", {
      title: t,
      body: b,
      version: ver,
      active,
      authorDiscordId: user.discordId,
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true as const, id: newId };
  },
});

/** Xoá vĩnh viễn một bài (dùng khi bài lỗi/spam — bài ẩn thì dùng `save`). */
export const remove = mutation({
  args: { token: v.string(), id: v.id("announcements") },
  handler: async (ctx, { token, id }) => {
    const user = await getUserByToken(ctx, token);
    await requireBotAdmin(ctx, user);
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Thông báo không tồn tại — có thể đã bị xoá trước đó.");
    await ctx.db.delete(id);
    return { ok: true as const };
  },
});

/**
 * Đặt BẢN CẬP NHẬT HIỆN TẠI (1 dòng siteInfo, upsert). Cho phép chuỗi rỗng =
 * tắt nhãn trên web (hợp lý: chưa chốt phiên bản thì đừng hứa).
 */
export const setSiteInfo = mutation({
  args: { token: v.string(), currentVersion: v.string() },
  handler: async (ctx, { token, currentVersion }) => {
    const user = await getUserByToken(ctx, token);
    await requireBotAdmin(ctx, user);
    const ver = cleanOptional(currentVersion, VERSION_MAX, "Bản cập nhật");
    const now = Date.now();
    const row = await ctx.db
      .query("siteInfo")
      .withIndex("by_kind", (q) => q.eq("kind", "siteInfo"))
      .first();
    if (row) {
      await ctx.db.patch(row._id, { currentVersion: ver, updatedAt: now });
    } else {
      await ctx.db.insert("siteInfo", { kind: "siteInfo", currentVersion: ver, updatedAt: now });
    }
    return { ok: true as const, currentVersion: ver };
  },
});

/**
 * Feed CÔNG KHÔNG cho web: bài active MỚI NHẤT + bản cập nhật hiện tại.
 * Không nhận token — mọi khách (kể cả chưa đăng nhập) đều đọc được; không có
 * bài ẩn nào lọt ra vì lọc bằng index `by_active_createdAt` ngay tại nguồn.
 */
export const publicFeed = query({
  args: {},
  handler: async (ctx) => {
    const site = await ctx.db
      .query("siteInfo")
      .withIndex("by_kind", (q) => q.eq("kind", "siteInfo"))
      .first();
    const notice = await ctx.db
      .query("announcements")
      .withIndex("by_active_createdAt", (q) => q.eq("active", true))
      .order("desc")
      .first();
    return {
      // "" (đã xoá nhãn) → null để web khỏi render một chip bản rỗng.
      currentVersion: site?.currentVersion ? site.currentVersion : null,
      notice: notice
        ? {
            id: notice._id,
            title: notice.title,
            body: notice.body,
            version: notice.version ?? null,
            createdAt: notice.createdAt,
            updatedAt: notice.updatedAt,
          }
        : null,
    };
  },
});
