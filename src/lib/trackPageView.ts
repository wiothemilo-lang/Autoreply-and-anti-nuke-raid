import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { resolveConvexUrl } from "./convexUrl";
import { ROUTES, normalizePath } from "./routes";

/**
 * ĐẾM LƯỢT XEM TRANG tự host (14/10/2026) — nửa client của `convex/analytics.ts`.
 *
 * Vì sao tự đếm thay vì GA/Plausible: không chèn script bên thứ ba (CSP
 * `script-src 'self'` vẫn kín), không cookie, không IP — chỉ đếm ĐƯỜNG DẪN
 * CÔNG KHAI nên không có dữ liệu cá nhân nào để xin consent.
 *
 * Danh sách đường dẫn lấy TỪ `routes.ts` (nguồn duy nhất của bảng tuyến
 * đường): chỉ route `visibility: "public"`, khớp exact, không phải alias
 * redirect. Thêm trang công khai mới vào routes.json là nó tự được đếm —
 * không có bảng thứ hai để lệch.
 *
 * Ba chốt chống rác (khớp luật server, đều có test khoá):
 *  1. `navigator.webdriver` → trình duyệt tự động (e2e/CI) không đếm: số liệu
 *     chỉ nói về người thật, không bị bơm bởi chính test của mình.
 *  2. Chống LẶP theo phiên (sessionStorage, 30 phút/trang): F5 liên tục không
 *     biến mỗi lần tải thành một lượt.
 *  3. Lỗi mạng/backend chưa deploy function → nuốt im lặng trong promise
 *     (ConvexHttpClient ném exception trong promise, KHÔNG console.error,
 *     không chạm render) — cùng lý do đã chốt ở UpdateNotice 10/10/2026.
 */
const PV_KEY = "protogon:page-view";
const DEDUPE_MS = 30 * 60_000;

/** Route công khai được đếm: đúng bảng tuyến đường, trừ alias redirect. */
const PUBLIC_PATHS = new Set(
  ROUTES.filter((r) => r.visibility === "public" && r.match === "exact" && !r.redirect).map(
    (r) => r.path,
  ),
);

/** Lượt xem trước đó của phiên này (null nếu chưa có / storage bị chặn). */
function readPrev(): { path: string; at: number } | null {
  try {
    const raw = window.sessionStorage.getItem(PV_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { path?: unknown; at?: unknown };
    return typeof parsed?.path === "string" && typeof parsed?.at === "number"
      ? { path: parsed.path, at: parsed.at }
      : null;
  } catch {
    return null;
  }
}

/**
 * Ghi nhận lượt xem trang hiện tại. Gọi từ App.tsx mỗi khi `pathname` đổi.
 * Fire-and-forget — KHÔNG BAO GIỜ ném lỗi, không trả gì.
 */
export function trackPageView(pathname: string): void {
  try {
    if (typeof window === "undefined") return;
    if (navigator.webdriver) return;

    const path = normalizePath(pathname);
    if (!PUBLIC_PATHS.has(path)) return;

    const now = Date.now();
    const prev = readPrev();
    if (prev && prev.path === path && now - prev.at < DEDUPE_MS) return;
    try {
      window.sessionStorage.setItem(PV_KEY, JSON.stringify({ path, at: now }));
    } catch {
      // storage bị chặn — vẫn đếm, chỉ mất chống lặp
    }

    const client = new ConvexHttpClient(resolveConvexUrl());
    void client.mutation(api.analytics.pageView, { path }).catch(() => {});
  } catch {
    // Đếm là việc phụ — không bao giờ được làm vỡ trang.
  }
}
