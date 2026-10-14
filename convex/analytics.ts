/**
 * convex/analytics.ts — LƯU LƯỢNG TRANG tự host (14/10/2026).
 *
 * Vì sao tự đếm trong Convex thay vì Google Analytics / Plausible:
 *  · Không chèn script bên thứ ba — CSP `script-src 'self'` vẫn kín, không mở
 *    thêm origin nào cho JS ngoài.
 *  · KHÔNG cookie, KHÔNG IP, KHÔNG user-agent: chỉ đếm ĐƯỜNG DẪN CÔNG KHAI —
 *    không thu dữ liệu cá nhân nào, nên không cần banner consent.
 *  · Số liệu nằm trong DB đang dùng; admin xem ngay trong cửa sổ Admin.
 *
 * Mô hình dữ liệu — GHI THEO NGÀY, không phải từng lượt:
 * một dòng = (ngày VN, đường dẫn, số lượt). ~15 đường dẫn công khai × trần 90
 * ngày ≈ 1.350 dòng tối đa, nên bảng không bao giờ phình như log từng lượt và
 * câu "7 ngày / 30 ngày" chỉ đọc ~450 dòng.
 *
 * Quyền — đọc kỹ vì có endpoint công khai:
 *  · GHI (`pageView`) CÔNG KHAI, không token: mọi khách chưa đăng nhập cũng
 *    đếm được. Bù lại mọi thứ nguy hiểm bị chặn Ở SERVER: whitelist ký tự,
 *    chặn khu vực riêng tư (/dashboard, /admin — đường dẫn chứa ID server),
 *    trần đếm RATE_MAX_IN_WINDOW/phút và trần lưu trữ KEEP_DAYS.
 *  · ĐỌC (`stats`): requireBotAdmin — cùng cổng cửa sổ Admin (chủ bot +
 *    quản trị viên nhóm). Không function nào khác đọc bảng này.
 *
 * Vì sao pageView KHÔNG BAO GIỜ ném lỗi: đây là endpoint công khai bị gọi từ
 * mọi trang; ném lỗi chỉ đốt log + dạy script biết đã bị phát hiện. Vượt trần
 * hay đường dẫn rác → trả lặng lẽ `{ counted: false }`.
 */
import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { getUserByToken } from "./auth";
import { requireBotAdmin } from "./hidden";

/** Trần độ dài đường dẫn nhận vào — dài hơn là rác, không phải route có thật. */
export const PATH_MAX = 120;
/** Trần chống đốt: tối đa 120 lượt đếm trong 1 phút (mọi người gộp lại). */
export const RATE_WINDOW_MS = 60_000;
export const RATE_MAX_IN_WINDOW = 120;
/** Trần lưu trữ: giữ N ngày gần nhất, dọn dần theo lô (xem trimAnalytics). */
export const KEEP_DAYS = 90;
export const TRIM_BATCH = 50;
/** Xác suất dọn mỗi lượt — 1/20: gần như không tốn gì lúc bình thường. */
export const TRIM_CHANCE = 1 / 20;
/** Cửa sổ thống kê + số đường dẫn top trả cho cửa sổ Admin. */
export const STATS_DAYS = 30;
export const TOP_PATHS = 10;

const DAY_MS = 86_400_000;
/** Ngày tính theo GIỜ VIỆT NAM (UTC+7) — "7 ngày qua" khớp cảm nhận người dùng. */
const VN_OFFSET_MS = 7 * 3_600_000;

/** Khoá ngày "YYYY-MM-DD" theo giờ VN. Export để test hermetic khoá biên ngày. */
export function dayKey(now: number): string {
  return new Date(now + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Chuẩn hoá + KIỂM ĐỊNH đường dẫn nhận từ client. null = không đếm.
 *
 * Whitelist ký tự ASCII (mọi route công khai đều ASCII: /features, /premium…)
 * và chặn thẳng khu vực riêng tư: /dashboard/123… chứa ID server — đếm nó vừa
 * vô nghĩa vừa lưu dấu vết người dùng vào bảng đọc chung.
 * Export để test khoá từng luật.
 */
export function normalizePath(raw: string): string | null {
  const s = String(raw ?? "").trim();
  if (!s.startsWith("/")) return null;
  if (s.length > PATH_MAX) return null;
  if (!/^\/[A-Za-z0-9\-_/]*$/.test(s)) return null;
  if (s.includes("//")) return null;
  // Bỏ gạch chéo cuối (/features/ === /features) — không nhân đôi dòng.
  const path = s.length > 1 && s.endsWith("/") ? s.slice(0, -1) : s;
  if (path.startsWith("/dashboard") || path.startsWith("/admin")) return null;
  return path;
}

/**
 * Dọn ngày quá cũ — giữ bảng ở trần KEEP_DAYS. Export để test gọi thẳng
 * (pageView gọi theo xác suất nên test không thể dựa vào Math.random).
 */
export async function trimAnalytics(ctx: MutationCtx): Promise<number> {
  const cutoff = dayKey(Date.now() - KEEP_DAYS * DAY_MS);
  const old = await ctx.db
    .query("pageViews")
    .withIndex("by_day", (q) => q.lt("day", cutoff))
    .take(TRIM_BATCH);
  for (const row of old) await ctx.db.delete(row._id);
  return old.length;
}

/**
 * Đếm MỘT lượt xem. Endpoint công khai — không token, không ném lỗi.
 * Vượt trần đếm (bot đốt) hay đường dẫn rác → `{ counted: false }` im lặng.
 */
export const pageView = mutation({
  args: { path: v.string() },
  handler: async (ctx, { path: rawPath }) => {
    const path = normalizePath(rawPath);
    if (!path) return { counted: false as const };

    const now = Date.now();

    // Trần theo cửa sổ: MỘT dòng khoá (analyticsRate) — Convex xử lý mutation
    // tuần tự theo document nên hai lượt đồng thời không làm mất lượt đếm.
    const rate = await ctx.db
      .query("analyticsRate")
      .withIndex("by_kind", (q) => q.eq("kind", "analyticsRate"))
      .first();
    if (rate && now - rate.windowStart < RATE_WINDOW_MS) {
      if (rate.count >= RATE_MAX_IN_WINDOW) return { counted: false as const };
      await ctx.db.patch(rate._id, { count: rate.count + 1 });
    } else if (rate) {
      await ctx.db.patch(rate._id, { windowStart: now, count: 1 });
    } else {
      await ctx.db.insert("analyticsRate", {
        kind: "analyticsRate",
        windowStart: now,
        count: 1,
      });
    }

    const day = dayKey(now);
    const row = await ctx.db
      .query("pageViews")
      .withIndex("by_day_path", (q) => q.eq("day", day).eq("path", path))
      .first();
    if (row) await ctx.db.patch(row._id, { count: row.count + 1, updatedAt: now });
    else await ctx.db.insert("pageViews", { day, path, count: 1, updatedAt: now });

    // Dọn BEST-EFFORT: lỗi dọn không bao giờ được biến thành lỗi đếm.
    if (Math.random() < TRIM_CHANCE) {
      try {
        await trimAnalytics(ctx);
      } catch {
        // việc phụ — lượt dọn kế tiếp sẽ xử lý tiếp
      }
    }
    return { counted: true as const };
  },
});

/**
 * Số liệu cho cửa sổ Admin: tổng 7 ngày / 30 ngày + top đường dẫn 30 ngày.
 * Chỉ requireBotAdmin gọi được; người thường/khách bị từ chối ngay.
 */
export const stats = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await getUserByToken(ctx, token);
    await requireBotAdmin(ctx, user);

    const now = Date.now();
    const cutoff30 = dayKey(now - STATS_DAYS * DAY_MS);
    const cutoff7 = dayKey(now - 7 * DAY_MS);
    const rows = await ctx.db
      .query("pageViews")
      .withIndex("by_day", (q) => q.gte("day", cutoff30))
      .take(5_000);

    let total7d = 0;
    let total30d = 0;
    const byPath = new Map<string, number>();
    for (const r of rows) {
      total30d += r.count;
      if (r.day >= cutoff7) total7d += r.count;
      byPath.set(r.path, (byPath.get(r.path) ?? 0) + r.count);
    }
    const topPaths = [...byPath.entries()]
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
      .slice(0, TOP_PATHS);

    return { total7d, total30d, topPaths };
  },
});
