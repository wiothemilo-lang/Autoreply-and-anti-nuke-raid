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

// ═══ XÁC MINH WEB (Double Counter style) ════════════════════════════════════

/**
 * Origin được phép POST kết quả verify.
 *
 * Vì sao allowlist thay vì `*`: request mang token phiên trong body. Dù token
 * tự nó là capability (không có cookie, không có session), một trang lạ đọc
 * được token từ URL referrer rồi tự POST hộ sẽ đốt lượt verify của người dùng
 * và ghi tín hiệu rác vào đồ thị identity. Chỉ domain của sản phẩm được gọi.
 *
 * `httpAction` chạy ở default runtime nên KHÔNG đọc được `process.env`; danh
 * sách này là hằng số có chủ đích (đổi domain phải sửa file + deploy).
 */
const VERIFY_ORIGINS = new Set([
  "https://protogon.freebuff.app",
  "https://www.protogon.freebuff.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
]);

function verifyCors(origin: string | null): Record<string, string> {
  const allow = origin && VERIFY_ORIGINS.has(origin) ? origin : "";
  const headers: Record<string, string> = {
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
    vary: "origin",
    "cache-control": "no-store",
  };
  if (allow) headers["access-control-allow-origin"] = allow;
  return headers;
}

function verifyJson(body: unknown, origin: string | null, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...verifyCors(origin) },
  });
}

/**
 * POST /verify/complete — nhận tín hiệu trình duyệt, quyết định, trả kết quả.
 *
 * IP lấy từ `x-forwarded-for` (Convex chạy sau proxy) — KHÔNG BAO GIỜ từ body.
 * Đây là ranh giới tin cậy quan trọng nhất của cả tính năng: nếu client tự khai
 * IP thì kẻ bị ban chỉ cần gửi IP sạch là qua.
 */
const verifyComplete = httpAction(async (ctx, request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: verifyCors(origin) });
  }
  // Origin lạ: từ chối trước khi parse body (chặn trang thứ ba POST hộ).
  if (origin && !VERIFY_ORIGINS.has(origin)) {
    return verifyJson({ ok: false, code: "forbidden_origin" }, origin, 403);
  }

  const ip = parseClientIp(request.headers.get("x-forwarded-for"));
  if (!isPublicIp(ip) || !allowGeoRequest(ip)) {
    return verifyJson({ ok: false, code: "rate_limited" }, origin, 429);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return verifyJson({ ok: false, code: "bad_request" }, origin, 400);
  }

  const token = typeof body.token === "string" ? body.token : "";
  if (!token || token.length > 128) {
    return verifyJson({ ok: false, code: "not_found" }, origin, 200);
  }

  // UA lấy từ HEADER (client không sửa được qua JS) thay vì body.
  const userAgent = request.headers.get("user-agent") ?? "";
  const fingerprint = typeof body.fingerprint === "string" ? body.fingerprint : undefined;
  const cookieId = typeof body.cookieId === "string" ? body.cookieId : undefined;
  const consentVersion = typeof body.consentVersion === "string" ? body.consentVersion : undefined;

  try {
    const result = await ctx.runAction(internal.verifyActions.complete, {
      token,
      ip,
      userAgent,
      fingerprint,
      cookieId,
      human: body.human === true,
      consentVersion,
    });
    return verifyJson(result, origin);
  } catch {
    // Không rò chi tiết lỗi hạ tầng ra trình duyệt.
    return verifyJson({ ok: false, code: "server_error" }, origin, 500);
  }
});

http.route({ path: "/verify/complete", method: "POST", handler: verifyComplete });
http.route({ path: "/verify/complete", method: "OPTIONS", handler: verifyComplete });

export default http;
