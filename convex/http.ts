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
import { allowVerifyRequest, allowVerifySelfTest } from "./httpRateGuard";
import { GREETING_IMAGE_SLOTS, MAX_DASHBOARD_UPLOAD_BYTES } from "./guilds/greetingImages";
import { dashboardUploadOrigins, greetingImageContentType } from "./guilds/uploadOwnership";
import { isPublicIp, normalizeIpToken, resolveClientIp, splitXff } from "./clientIp";
import {
  isIpCollectionEnabled,
  IP_COLLECTION_LOCK_CODE,
  IP_COLLECTION_LOCK_REASON,
} from "./ipCollectionLock";

const http = httpRouter();

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

const uploadDashboardFile = httpAction(async (ctx, request) => {
  const origin = request.headers.get("origin");
  const allowed = origin && dashboardUploadOrigins().includes(origin);
  const headers = {
    ...verifyCors(origin),
    "access-control-allow-headers": "authorization, content-type",
    ...(allowed ? { "access-control-allow-origin": origin } : {}),
  };
  const reply = (status: number, code: string) => Response.json({ code }, { status, headers });
  if (!allowed) return reply(403, "forbidden_origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return reply(401, "unauthenticated");

  const params = new URL(request.url).searchParams;
  const guildId = params.get("guild") ?? "";
  const purpose = params.get("purpose");
  const slotName = params.get("slot");
  const slot = GREETING_IMAGE_SLOTS.find((item) => item === slotName);
  const fileName = params.get("fileName")?.slice(0, 120) || "backup.msc";
  if (!/^\d{15,21}$/.test(guildId) || (purpose !== "import" && !(purpose === "greeting" && slot))) {
    return reply(400, "invalid_upload");
  }
  const user = await ctx.runQuery(internal.sessionHardening.getUserByTokenInternal, { token });
  if (!user?.manageableGuildIds?.includes(guildId)) return reply(403, "forbidden");
  if (Number(request.headers.get("content-length")) > MAX_DASHBOARD_UPLOAD_BYTES) {
    return reply(413, "file_too_large");
  }

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0) return reply(400, "empty_file");
  if (bytes.byteLength > MAX_DASHBOARD_UPLOAD_BYTES) return reply(413, "file_too_large");
  const type =
    purpose === "greeting"
      ? greetingImageContentType(new Uint8Array(bytes))
      : "application/octet-stream";
  if (!type) return reply(415, "invalid_image_type");

  const storageId = await ctx.storage.store(new Blob([bytes], { type }));
  try {
    if (slot && purpose === "greeting") {
      await ctx.runMutation(internal.guilds.saveOwnedGreetingImage, {
        token,
        guildId,
        storageId,
        slot,
      });
    } else {
      await ctx.runMutation(internal.backup.requestOwnedImportRestore, {
        token,
        guildId,
        storageId,
        fileName,
      });
    }
    return reply(200, "ok");
  } catch {
    await ctx.storage.delete(storageId).catch(() => {});
    return reply(409, "upload_not_saved");
  }
});

http.route({ path: "/dashboard/upload", method: "POST", handler: uploadDashboardFile });
http.route({ path: "/dashboard/upload", method: "OPTIONS", handler: uploadDashboardFile });

/**
 * CORS riêng cho self-test: cho phép `authorization` + hai header dò XFF.
 *
 * Vì sao nới header ở ĐÂY mà không ở `/verify/complete`: self-test cần gửi
 * thử `x-forwarded-for` để chứng minh hạ tầng có ghi đè/append hay không.
 * `/verify/complete` giữ nguyên allowlist hẹp — trình duyệt không được phép
 * tự đặt XFF ở đường xác minh thật.
 */
function selfTestCors(origin: string | null): Record<string, string> {
  return {
    ...verifyCors(origin),
    "access-control-allow-headers":
      "content-type, authorization, x-forwarded-for, x-protogon-probe-ip",
  };
}

function selfTestJson(body: unknown, origin: string | null, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...selfTestCors(origin) },
  });
}

type PreflightCheck = { id: string; ok: boolean; detail: string; advisory?: boolean };

/**
 * POST /verify/complete — nhận tín hiệu trình duyệt, quyết định, trả kết quả.
 *
 * IP lấy từ mục CUỐI của `x-forwarded-for` (proxy append), lùi về metadata của
 * Convex — KHÔNG BAO GIỜ từ body. Đây là ranh giới tin cậy quan trọng nhất của
 * cả tính năng: nếu client tự khai IP thì kẻ bị ban chỉ cần gửi IP sạch là qua.
 * Xem `clientIp.ts` để biết vì sao không lấy mục đầu.
 *
 * Trần tần suất dùng `allowVerifyRequest` — bộ đếm RIÊNG của verify, tách
 * khỏi self-test để admin bấm kiểm tra liên tục không khoá người dùng thật
 * (xem `httpRateGuard.ts`).
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

  // Công tắc tạm khoá: trả lời TRƯỚC `getRequestMetadata()` và trước mọi
  // thao tác đọc `x-forwarded-for`. Đây là điểm quan trọng nhất — nếu chỉ chặn
  // sau khi resolve IP thì IP thô đã đi vào bộ nhớ Convex, đúng thứ đang khoá.
  if (!isIpCollectionEnabled()) {
    return verifyJson(
      { ok: false, code: IP_COLLECTION_LOCK_CODE, message: IP_COLLECTION_LOCK_REASON },
      origin,
      503,
    );
  }

  const metaIp = (await ctx.meta.getRequestMetadata()).ip ?? "";
  const resolved = resolveClientIp({
    metaIp,
    forwardedFor: request.headers.get("x-forwarded-for"),
  });
  const ip = resolved.ip;
  if (!isPublicIp(ip) || !allowVerifyRequest(ip)) {
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

  try {
    const result = await ctx.runAction(internal.verifyActions.complete, {
      token,
      ip,
      userAgent,
      fingerprint,
      cookieId,
      human: body.human === true,
      // Đồng ý phải là hành động tường minh của người dùng (checkbox ở trang
      // verify). Server tự gắn phiên bản consent — client không được khai.
      consent: body.consent === true,
    });
    return verifyJson(result, origin);
  } catch {
    // Không rò chi tiết lỗi hạ tầng ra trình duyệt.
    return verifyJson({ ok: false, code: "server_error" }, origin, 500);
  }
});

http.route({ path: "/verify/complete", method: "POST", handler: verifyComplete });
http.route({ path: "/verify/complete", method: "OPTIONS", handler: verifyComplete });

/**
 * POST /verify/self-test — checklist trước khi bật xác minh web.
 *
 * Chỉ admin của guild gọi được (Bearer token dashboard). Trả checklist KHÔNG
 * chứa secret/IP thô: env đã cấu hình chưa, ipapi.is có sống không, XFF có bị
 * client điều khiển không, guild đã đủ role/kênh chưa, bot còn heartbeat không.
 *
 * Vì sao là HTTP action chứ không phải query: chỉ nơi đây mới thấy được header
 * `x-forwarded-for` thật của request. Query/action thường chỉ thấy metadata đã
 * được nền tảng tổng hợp, không đủ để chứng minh chống giả mạo IP.
 */
const verifySelfTest = httpAction(async (ctx, request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: selfTestCors(origin) });
  }
  if (origin && !VERIFY_ORIGINS.has(origin)) {
    return selfTestJson({ ok: false, code: "forbidden_origin" }, origin, 403);
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return selfTestJson({ ok: false, code: "unauthenticated" }, origin, 401);

  const metaIp = (await ctx.meta.getRequestMetadata()).ip ?? "";
  const forwardedFor = request.headers.get("x-forwarded-for");
  const resolved = resolveClientIp({ metaIp, forwardedFor });
  if (!allowVerifySelfTest(resolved.ip || "unknown")) {
    return selfTestJson({ ok: false, code: "rate_limited" }, origin, 429);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return selfTestJson({ ok: false, code: "bad_request" }, origin, 400);
  }
  const guildId = typeof body.guildId === "string" ? body.guildId : "";
  if (!/^\d{15,21}$/.test(guildId)) {
    return selfTestJson({ ok: false, code: "bad_request" }, origin, 400);
  }

  const authRes = await ctx
    .runQuery(internal.verifyPreflightData.authorize, { token, guildId })
    .catch(() => null);
  if (!authRes) return selfTestJson({ ok: false, code: "server_error" }, origin, 500);
  if (!authRes.ok) {
    return selfTestJson(
      { ok: false, code: authRes.code },
      origin,
      authRes.code === "unauthenticated" ? 401 : 403,
    );
  }

  const probe = await ctx.runAction(internal.verifyPreflight.probe, {}).catch(() => null);
  if (!probe) return selfTestJson({ ok: false, code: "server_error" }, origin, 500);

  // Dò XFF: trình duyệt gửi kèm `x-protogon-probe-ip` + `x-forwarded-for` cùng
  // một IP TEST-NET. Nếu mục CUỐI của chuỗi vẫn là IP thử → hạ tầng đang để
  // client điều khiển XFF (NGUY HIỂM). Nếu IP thử chỉ nằm ở đầu chuỗi → proxy
  // đã append IP thật, an toàn.
  const marker = normalizeIpToken(request.headers.get("x-protogon-probe-ip"));
  const chain = splitXff(forwardedFor);
  const probeSeen = marker !== "" && chain.includes(marker);
  const spoof =
    marker === "" || !probeSeen
      ? "probe_missing"
      : chain[chain.length - 1] === marker
        ? "spoof_accepted"
        : "ok";

  const g = authRes.guild;
  const botAge = Date.now() - authRes.bot.lastHeartbeat;
  const checks: PreflightCheck[] = [
    {
      id: "ip_collection",
      ok: isIpCollectionEnabled(),
      detail: isIpCollectionEnabled() ? "enabled" : "locked",
    },
    { id: "ip_hash_secret", ok: probe.env.ipHashSecret === "ok", detail: probe.env.ipHashSecret },
    { id: "ipintel_key", ok: probe.env.ipintelKey === "ok", detail: probe.env.ipintelKey },
    {
      id: "ipapi",
      ok: probe.ipapi.ok,
      detail: probe.ipapi.detail,
      // Thiếu key là cảnh báo (verify vẫn chạy, chỉ mất phần VPN), không chặn.
      advisory: probe.ipapi.detail === "skipped_no_key",
    },
    {
      id: "xff_spoof",
      ok: spoof !== "spoof_accepted",
      detail: spoof,
      // Trình duyệt có thể chặn header thử → không kết luận được, chỉ cảnh báo.
      advisory: spoof === "probe_missing",
    },
    {
      id: "guild_verify",
      ok: g.verifyEnabled && g.verifyWebEnabled && g.verifyMethod === "web",
      detail: !g.verifyEnabled
        ? "verify_off"
        : !g.verifyWebEnabled
          ? "web_off"
          : g.verifyMethod !== "web"
            ? "method_not_web"
            : "ok",
    },
    {
      id: "guild_roles",
      ok: Boolean(g.unverifiedRoleId && g.verifiedRoleId),
      detail: !g.unverifiedRoleId
        ? "missing_unverified"
        : !g.verifiedRoleId
          ? "missing_verified"
          : "ok",
    },
    {
      id: "guild_channel",
      ok: Boolean(g.verifyChannelId),
      detail: g.verifyChannelId ? "ok" : "missing",
    },
    {
      id: "bot_online",
      ok: authRes.bot.online && botAge < 5 * 60_000,
      detail: !authRes.bot.online ? "offline" : botAge >= 5 * 60_000 ? "stale" : "ok",
    },
    {
      id: "recent_failures",
      ok: authRes.stats.failed === 0,
      detail: authRes.stats.failed > 0 ? "has_failures" : "none",
      advisory: true,
    },
  ];

  return selfTestJson(
    {
      ok: checks.every((c) => c.ok || c.advisory),
      checks,
      stats: authRes.stats,
      ip: {
        source: resolved.source,
        public: isPublicIp(resolved.ip),
        chainLength: resolved.chain.length,
        spoofRisk: resolved.spoofRisk,
      },
    },
    origin,
  );
});

http.route({ path: "/verify/self-test", method: "POST", handler: verifySelfTest });
http.route({ path: "/verify/self-test", method: "OPTIONS", handler: verifySelfTest });

export default http;
