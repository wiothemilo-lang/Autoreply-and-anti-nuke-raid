import manifest from "./routes.json";

/**
 * routes.ts — lớp kiểu + hàm đọc cho bảng tuyến đường (route manifest).
 *
 * VÌ SAO CÓ BẢNG NÀY (bug lớp đã xảy ra thật 28/09/2026):
 * trước đây kiến thức "route nào public/private/indexable/cần SPA fallback"
 * nằm RẢI ở 4 nơi độc lập — `App.tsx` (React route), `seo.ts`
 * (meta robots/canonical), `vercel.json` (rewrite), `Dockerfile.web` (nginx
 * location), `public/sitemap.xml`. Thêm trang `/features` vào React rồi QUÊN
 * cả hai hosting → trang 404 khi mở trực tiếp, CI vẫn xanh. Thêm `/status`
 * vào sitemap rồi quên canonical → hai URL tự khai canonical, trùng lặp nội
 * dung. Lớp bug này không tự lộ ra ở loại test so khớp chuỗi.
 *
 * BẢNG NÀY LÀ NGUỒN DUY NHẤT: App.tsx đăng ký route theo nó, seo.ts suy ra
 * meta từ nó, và test suy ra kỳ vọng cho vercel.json / nginx / sitemap /
 * robots.txt / llms.txt TỪ NÓ. Thiếu một dòng trong bảng = route mới không
 * tồn tại = test fail, thay vì fail im lặng ở production.
 *
 * Lưu ý: file dữ liệu là JSON (không phải TS) để cả test CJS (require) lẫn
 * code TS (import với resolveJsonModule) đều đọc CÙNG một nguồn, không cần
 * sinh file trung gian.
 */

/** Các route seoKind phải khớp bộ title/description trong seo.ts. */
export type RouteSeoKind =
  | "home"
  | "features"
  | "terms"
  | "privacy"
  | "data-deletion"
  | "monitor"
  | "donate"
  | "feedback"
  | "premium"
  | "auth"
  | "dashboard"
  | "stats"
  | "admin"
  | "callback";

export type RouteVisibility = "public" | "private";
export type RouteMatch = "exact" | "prefix";

export interface RouteEntry {
  /** Path trong React Router; với match="prefix" là tiền tố (/dashboard). */
  path: string;
  match: RouteMatch;
  /** Khóa title/description trong seo.ts (COPY). */
  seoKind: RouteSeoKind;
  /** public = khách vào được; private = cần đăng nhập, luôn noindex. */
  visibility: RouteVisibility;
  /** Có được index bởi công cụ tìm kiếm không. Alias KHÔNG bao giờ index. */
  index: boolean;
  /** Có vào sitemap không (chỉ route canonical + indexable). */
  sitemap: boolean;
  /** Hosting cần SPA fallback (mở trực tiếp/tải lại không được 404). */
  spaFallback: boolean;
  /** Alias: redirect vĩnh viễn sang đây thay vì tự phục vụ nội dung. */
  redirect: string | null;
  note?: string;
}

export const ROUTES: RouteEntry[] = manifest.routes as RouteEntry[];

/** Bỏ dấu gạch chéo cuối (trừ "/") để so khớp ổn định: /terms/ === /terms. */
export function normalizePath(pathname: string): string {
  const path = pathname || "/";
  if (path === "/") return "/";
  const trimmed = path.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/** Route khớp pathname (exact trước, rồi prefix). Không khớp → null (404). */
export function routeForPath(pathname: string): RouteEntry | null {
  const path = normalizePath(pathname);
  const exact = ROUTES.find((r) => r.match === "exact" && r.path === path);
  if (exact) return exact;
  const prefix = ROUTES.find(
    (r) => r.match === "prefix" && (path === r.path || path.startsWith(`${r.path}/`)),
  );
  return prefix ?? null;
}

/**
 * Đường dẫn CANONICAL mà một URL nên trỏ tới: chính nó, hoặc đích redirect nếu
 * là alias. `null` = route không tồn tại (404) → không có canonical.
 */
export function canonicalPathFor(pathname: string): string | null {
  const route = routeForPath(pathname);
  if (!route) return null;
  if (route.redirect) return route.redirect;
  return normalizePath(pathname);
}

/** Route canonical công khai, được index — nguồn cho sitemap. */
export const SITEMAP_ROUTES: RouteEntry[] = ROUTES.filter(
  (r) => r.index && !r.redirect && r.visibility === "public",
);

/** Route cần SPA fallback (không tính alias — alias có redirect, không phục vụ). */
export const SPA_FALLBACK_ROUTES: RouteEntry[] = ROUTES.filter((r) => r.spaFallback);

/** Route cần redirect vĩnh cứu (alias). */
export const REDIRECT_ROUTES: RouteEntry[] = ROUTES.filter((r) => r.redirect);

/** Route private — luôn noindex, hosting phải gắn X-Robots-Tag. */
export const PRIVATE_ROUTES: RouteEntry[] = ROUTES.filter((r) => r.visibility === "private");

/** Route public indexable — hosting KHÔNG được gắn noindex. */
export const PUBLIC_INDEXABLE_ROUTES: RouteEntry[] = ROUTES.filter(
  (r) => r.visibility === "public" && r.index,
);

/** Source rewrite tương ứng trên Vercel cho một route. */
export function vercelRewriteSource(route: RouteEntry): string {
  return route.match === "prefix" ? `${route.path}/:path*` : route.path;
}

/** Nhãn đọc cho test/log: "/dashboard (prefix)" > "/terms". */
export function routeLabel(route: RouteEntry): string {
  return route.match === "prefix" ? `${route.path}/*` : route.path;
}
