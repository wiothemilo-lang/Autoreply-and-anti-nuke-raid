export const DEFAULT_CONVEX_URL = "http://127.0.0.1:3210";

const CONVEX_HOST_RE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.convex\.cloud$/i;
const CONVEX_SITE_HOST_RE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.convex\.site$/i;
const LOCAL_CONVEX_HOST_RE = /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/i;

/** Chuẩn hóa URL Convex và từ chối origin ngoài allowlist của hosting. */
export function normalizeConvexUrl(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    const isLocal = LOCAL_CONVEX_HOST_RE.test(url.host);
    if (isLocal) {
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    } else if (url.protocol !== "https:" || !CONVEX_HOST_RE.test(url.hostname)) {
      return null;
    }
    if (url.username || url.password || url.search || url.hash) return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/**
 * Một nguồn quyết định duy nhất cho client Convex.
 * URL localhost chỉ hữu ích trong sandbox; production build fail-closed khi env
 * sai thay vì âm thầm trỏ sang deployment public khác.
 */
export function resolveConvexUrl(
  raw: string | null | undefined = import.meta.env.VITE_CONVEX_URL,
): string {
  const configured = normalizeConvexUrl(raw);
  const value = String(raw ?? "").trim();
  if (!value) {
    if (import.meta.env.DEV) return DEFAULT_CONVEX_URL;
    throw new Error("Thiếu CONVEX_URL cho production build");
  }
  if (!configured) throw new Error("CONVEX_URL không hợp lệ hoặc không nằm trong allowlist");
  const isLocal = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configured);
  if (isLocal && !import.meta.env.DEV) {
    throw new Error("Không dùng CONVEX_URL localhost trong production build");
  }
  return configured;
}

export function convexPingUrl(raw?: string | null): string {
  return `${resolveConvexUrl(raw)}/api/query`;
}

/** Chuẩn hóa origin phục vụ HTTP actions: https + *.convex.site (hoặc localhost). */
function normalizeConvexSiteUrl(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    const isLocal = LOCAL_CONVEX_HOST_RE.test(url.host);
    if (isLocal) {
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    } else if (url.protocol !== "https:" || !CONVEX_SITE_HOST_RE.test(url.hostname)) {
      return null;
    }
    if (url.username || url.password || url.search || url.hash) return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/**
 * URL gốc của HTTP actions (httpRouter). LƯU Ý BẮT LỖI: Convex phục vụ HTTP
 * actions (routes trong convex/http.ts) ở domain `.convex.site`, KHÔNG phải
 * `.convex.cloud` — domain đó chỉ phục vụ query/mutation/action API (paths
 * `/api/*`). Bug thật 26/09: web fetch `${cloud}/geo_lang` → 404 âm thầm
 * (catch → null) → geo-detect chết hoàn toàn dù endpoint sống và test xanh.
 *
 * Ưu tiên VITE_CONVEX_SITE_URL khi môi trường có khai báo: đổi hậu tố chỉ đúng
 * khi API và HTTP actions cùng một host. `convex dev` tách cổng (API 3210,
 * site 3211) nên nếu chỉ đổi hậu tố thì fetch vẫn 404 — đúng lỗi 26/09 ở dạng
 * khác, và im lặng vì catch → null. Thiếu biến thì mới lùi về cách đổi hậu tố.
 */
export function convexSiteUrl(raw: string | null | undefined = resolveConvexUrl()): string {
  const explicit = normalizeConvexSiteUrl(import.meta.env.VITE_CONVEX_SITE_URL);
  // Production TUYỆT ĐỐI không được trỏ HTTP actions về máy người dùng: bundle
  // từng bake `http://127.0.0.1:3211` (env Vercel sai) khiến mọi fetch chết và
  // VerifyWebCard gửi kèm Bearer session token tới localhost. Bỏ qua giá trị
  // localhost ngoài môi trường dev rồi lùi về đổi hậu tố (.cloud → .site).
  const explicitIsLocal =
    explicit !== null && /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(explicit);
  if (explicit && (import.meta.env.DEV || !explicitIsLocal)) return explicit;
  return resolveConvexUrl(raw).replace(/\.convex\.cloud$/i, ".convex.site");
}
