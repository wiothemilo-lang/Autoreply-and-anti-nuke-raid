/**
 * HTTP endpoints công khai của Convex (httpAction) — phục vụ dashboard web.
 *
 * Vì sao qua Convex thay vì fetch thẳng từ trình duyệt: CSP connect-src chỉ
 * cho phép 'self' + *.convex.cloud + discord.com (vercel.json + Dockerfile.web)
 * nên mọi API geo ngoài đều bị chặn; còn *.convex.cloud thì ĐÃ được phép →
 * proxy qua đây chạy được ở mọi môi trường deploy mà không phải nới CSP.
 */

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

/** Cache đáp án geo: quốc gia ít đổi → 1 ngày; lỗi/trống → 60s để tự phục hồi. */
const CACHE_OK = "public, max-age=86400";
const CACHE_MISS = "public, max-age=60";

// Endpoint công khai, không nhạy cảm (chỉ mã quốc gia) → CORS mở cho mọi origin;
// dashboard web gọi từ origin khác *.convex.cloud nên không có header này là bị
// trình duyệt chặn đáp án.
const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(body: unknown, cache: string): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cache,
      ...CORS,
    },
  });
}

/**
 * GET /geo_lang — trả mã quốc gia ISO của người gọi (dò theo IP) cho web tự
 * chọn ngôn ngữ ban đầu. Không lưu IP, không lưu DB: chỉ pass-through sang
 * api.country.is. Bất kỳ lỗi nào → trả country rỗng (web giữ ngôn ngữ mặc định).
 */
const geoLang = httpAction(async (_ctx, request) => {
  // GET đơn giản (không header tùy chỉnh) không cần preflight, nhưng vẫn trả
  // 204 + CORS ngay tại đây nếu trình duyệt hỏi OPTIONS.
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    // Convex chạy sau proxy — IP client nằm trong x-forwarded-for (client đầu tiên).
    const forwarded = request.headers.get("x-forwarded-for") ?? "";
    const ip = forwarded.split(",")[0]?.trim() ?? "";
    if (!ip) return json({ country: "" }, CACHE_MISS);
    const upstream = await fetch(`https://api.country.is/${encodeURIComponent(ip)}`, {
      headers: { "user-agent": "protogon-dashboard" },
      signal: AbortSignal.timeout(4000),
    });
    if (!upstream.ok) return json({ country: "" }, CACHE_MISS);
    const data: unknown = await upstream.json();
    const country =
      typeof data === "object" && data !== null && "country" in data
        ? String((data as { country: unknown }).country ?? "").toUpperCase()
        : "";
    return json({ country }, /^[A-Z]{2}$/.test(country) ? CACHE_OK : CACHE_MISS);
  } catch {
    return json({ country: "" }, CACHE_MISS);
  }
});

const http = httpRouter();
http.route({ path: "/geo_lang", method: "GET", handler: geoLang });
http.route({ path: "/geo_lang", method: "OPTIONS", handler: geoLang });

export default http;
