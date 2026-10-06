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
import { internal } from "./_generated/api";
import { allowGeoRequest, isPublicIp, parseClientIp } from "./geoGuard";

/**
 * Cache đáp án geo — PHẢI là `private`.
 *
 * Đáp án này theo IP của TỪNG người gọi (x-forwarded-for), nên `public` là
 * sai: bất kỳ cache dùng chung nào (CDN trước .convex.site, proxy của công
 * ty, cache dùng chung của trình duyệt) đều được phép lưu theo URL rồi đưa
 * đáp án của người A cho người B trong 24h — web tự đổi ngôn ngữ theo IP của
 * người lạ. `private` chỉ cho cache riêng của chính người gọi dùng lại.
 * Lỗi/rống thì 60s để tự phục hồi.
 */
const CACHE_OK = "private, max-age=3600";
const CACHE_MISS = "private, max-age=60";

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
  // Chống đốt usage/DDoS (xem geoGuard.ts): IP rác, IP không công cộng hoặc vượt
  // trần → trả rỗng NGAY, không gọi upstream. Không có lớp này thì `curl` loop
  // biến deployment thành proxy geo-IP miễn phí và đốt hạn mức của mọi user thật.
  const ip = parseClientIp(request.headers.get("x-forwarded-for"));
  if (!isPublicIp(ip) || !allowGeoRequest(ip)) return json({ country: "" }, CACHE_MISS);
  try {
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

/**
 * IPN thanh toán ZaloPay (POST từ server ZaloPay — không cần CORS).
 * Vai trò của httpAction này CHỈ là bắc cầu: parse body rồi giao cho
 * `paymentsAction.handleCallback` (action "use node" — nơi duy nhất đọc được
 * ZALOPAY_KEY2 để verify MAC). Trả đúng thể thức ZaloPay mong muốn:
 * {return_code: 1|2} — 2 nghĩa là "không hợp lệ, gửi lại".
 */
const zalopayCallback = httpAction(async (ctx, request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  let data = "";
  let mac = "";
  let type = 1;
  try {
    const body = (await request.json()) as { data?: unknown; mac?: unknown; type?: unknown };
    data = typeof body.data === "string" ? body.data : "";
    mac = typeof body.mac === "string" ? body.mac : "";
    type = typeof body.type === "number" ? body.type : 1;
  } catch {
    return json({ return_code: 2, return_message: "bad request" });
  }
  try {
    const out = await ctx.runAction(internal.paymentsAction.handleCallback, { data, mac, type });
    return json({ return_code: out.returnCode, return_message: out.message });
  } catch {
    // Lỗi server → trả 2 để ZaloPay retry (tiền thật không được nuốt im lặng).
    return json({ return_code: 2, return_message: "server error" });
  }
});

const http = httpRouter();
http.route({ path: "/geo_lang", method: "GET", handler: geoLang });
http.route({ path: "/geo_lang", method: "OPTIONS", handler: geoLang });
http.route({ path: "/zalopay/callback", method: "POST", handler: zalopayCallback });

export default http;
