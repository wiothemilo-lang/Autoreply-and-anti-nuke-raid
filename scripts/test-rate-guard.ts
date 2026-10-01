// TEST Rate-guard chống đốt usage — tầng guard cho action public không auth.
// Chạy: bun scripts/test-rate-guard.ts
// Gọi trực tiếp hàm guard + handler thật của publicConfig/aiStatus (mock ctx)
// để xác minh: vượt trần → fallback NHẸ (không chạm DB) + hợp đồng no-throw.
import { rateLimitPublicAction, __resetRateGuardForTest } from "../convex/rateGuard";
import {
  allowGeoRequest,
  isPublicIp,
  parseClientIp,
  __resetGeoGuardForTest,
  GEO_MAX_PER_IP_PER_MIN,
  GEO_MAX_GLOBAL_PER_MIN,
  GEO_WINDOW_MS,
} from "../convex/geoGuard";
import { publicConfig } from "../convex/public";
import { aiStatus } from "../convex/haimiya";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean) => {
  console.log(ok ? `  ✅ ${label}` : `  ❌ ${label}`);
  if (ok) pass++;
  else fail++;
};

const publicConfigHandler = (publicConfig as any)._handler;
const aiStatusHandler = (aiStatus as any)._handler;
if (typeof publicConfigHandler !== "function" || typeof aiStatusHandler !== "function") {
  console.error("Không lấy được handler từ Convex action — cấu trúc convex thay đổi?");
  process.exit(1);
}

console.log("── rateGuard: sliding window per-identity ──");

// 1. Trong trần → ok.
__resetRateGuardForTest();
let ctx: any = { auth: { getIdentity: () => "user-A" } };
let allOk = true;
for (let i = 0; i < 30; i++) {
  if (!rateLimitPublicAction(ctx, { name: "publicConfig", maxPerMin: 30, globalMaxPerMin: 600 }).ok)
    allOk = false;
}
check("30 lần trong trần → tất cả ok", allOk);

// 2. Vượt trần per-identity → chặn.
check(
  "lần thứ 31 trong 1 phút → bị chặn",
  !rateLimitPublicAction(ctx, { name: "publicConfig", maxPerMin: 30, globalMaxPerMin: 600 }).ok,
);

// 3. Identity khác không bị ảnh hưởng (bucket tách riêng).
__resetRateGuardForTest();
ctx = { auth: { getIdentity: () => "user-B" } };
allOk = true;
for (let i = 0; i < 40; i++) {
  if (!rateLimitPublicAction(ctx, { name: "aiStatus", maxPerMin: 30, globalMaxPerMin: 600 }).ok)
    allOk = false;
}
check("user-B gọi 40 lần chỉ bị chặn từ lần 31", allOk === false); // 31..40 bị chặn
__resetRateGuardForTest();
const userC = { auth: { getIdentity: () => "user-C" } };
allOk = true;
for (let i = 0; i < 30; i++) {
  if (
    !rateLimitPublicAction(userC, { name: "publicConfig", maxPerMin: 30, globalMaxPerMin: 600 }).ok
  )
    allOk = false;
}
check("user-C (identity khác) vẫn đủ 30 lượt đầu", allOk);

// 3b. Convex thực tế trả identity object; guard phải dùng subject, không bỏ qua bucket.
__resetRateGuardForTest();
const objectCtx: any = { auth: { getIdentity: () => ({ subject: "user-object" }) } };
const objectFirst = rateLimitPublicAction(objectCtx, {
  name: "publicConfig",
  maxPerMin: 1,
  globalMaxPerMin: 10,
}).ok;
const objectSecond = rateLimitPublicAction(objectCtx, {
  name: "publicConfig",
  maxPerMin: 1,
  globalMaxPerMin: 10,
}).ok;
check("identity object dùng subject và vẫn bị giới hạn", objectFirst && !objectSecond);

__resetRateGuardForTest();
const tokenCtx: any = {
  auth: { getIdentity: () => ({ tokenIdentifier: "token-identity" }) },
};
const tokenFirst = rateLimitPublicAction(tokenCtx, {
  name: "publicConfig",
  maxPerMin: 1,
  globalMaxPerMin: 10,
}).ok;
const tokenSecond = rateLimitPublicAction(tokenCtx, {
  name: "publicConfig",
  maxPerMin: 1,
  globalMaxPerMin: 10,
}).ok;
check("identity object fallback tokenIdentifier vẫn bị giới hạn", tokenFirst && !tokenSecond);

__resetRateGuardForTest();
const anonymousObjectCtx: any = { auth: { getIdentity: () => ({ opaque: true }) } };
check(
  "identity object không có subject/tokenIdentifier vẫn dùng anonymous/global",
  rateLimitPublicAction(anonymousObjectCtx, {
    name: "publicConfig",
    maxPerMin: 1,
    globalMaxPerMin: 10,
  }).ok &&
    rateLimitPublicAction(anonymousObjectCtx, {
      name: "publicConfig",
      maxPerMin: 1,
      globalMaxPerMin: 10,
    }).ok,
);

// 4. Trần toàn cục chặn cả identity mới (botnet).
__resetRateGuardForTest();
allOk = true;
const users: string[] = [];
for (let i = 0; i < 700; i++) users.push(`botnet-${i}`);
for (const u of users) {
  const r = rateLimitPublicAction(
    { auth: { getIdentity: () => u } },
    { name: "publicConfig", maxPerMin: 30, globalMaxPerMin: 600 },
  );
  if (!r.ok) {
    allOk = false;
    break;
  }
}
check("botnet 600 identity → chặn trước khi hết (trần toàn cục)", !allOk);

// 5. Bucket tách theo endpoint (không trộn lẫn).
__resetRateGuardForTest();
allOk = true;
for (let i = 0; i < 30; i++) {
  if (
    !rateLimitPublicAction(userC, { name: "publicConfig", maxPerMin: 30, globalMaxPerMin: 600 }).ok
  )
    allOk = false;
}
check(
  "hết trần publicConfig nhưng aiStatus vẫn ok",
  allOk &&
    rateLimitPublicAction(userC, { name: "aiStatus", maxPerMin: 60, globalMaxPerMin: 1200 }).ok,
);

console.log("── handler thật: hợp đồng no-throw khi bị rate-limit ──");

// 6. publicConfig handler khi guard chặn: phải TRẢ object (không throw) + cờ rateLimited.
__resetRateGuardForTest();
const anonCtx: any = { auth: { getIdentity: async () => null } };
allOk = true;
let last: any = null;
for (let i = 0; i < 700; i++) {
  try {
    last = await publicConfigHandler(anonCtx, {});
    if (last?.rateLimited === true) break;
  } catch {
    allOk = false;
    break;
  }
}
check(
  "publicConfig: 700 call ẩn danh → không throw, trả rateLimited=true",
  allOk && last?.rateLimited === true,
);
check(
  "publicConfig fallback vẫn đủ clientId/invite/facebook",
  typeof last?.clientId === "string" &&
    typeof last?.discordInvite === "string" &&
    typeof last?.facebookUrl === "string",
);

// 7. aiStatus handler khi guard chặn: trả configured=false, không throw.
__resetRateGuardForTest();
allOk = true;
last = null;
for (let i = 0; i < 1300; i++) {
  try {
    last = await aiStatusHandler(anonCtx, {});
    if (last?.rateLimited === true) break;
  } catch {
    allOk = false;
    break;
  }
}
check(
  "aiStatus: 1300 call ẩn danh → không throw, trả rateLimited=true",
  allOk && last?.rateLimited === true,
);
check(
  "aiStatus fallback configured=false + model null",
  last?.configured === false && last?.model === null,
);

console.log("── geoGuard: /geo_lang chống đốt usage + DDoS ──");

// 8. Chuẩn hoá x-forwarded-for: mục ĐẦU là IP client (Convex chạy sau proxy).
check("xff nhiều mục → lấy mục đầu", parseClientIp("1.2.3.4, 10.0.0.1") === "1.2.3.4");
check("xff IPv4 kèm cổng → cắt cổng", parseClientIp("1.2.3.4:5678") === "1.2.3.4");
check(
  "xff IPv6 trong ngoặc → bỏ ngoặc + cổng",
  parseClientIp("[2001:db8::1]:443") === "2001:db8::1",
);
check("xff IPv6 kèm zone id → bỏ zone", parseClientIp("fe80::1%eth0") === "fe80::1");
check("xff rỗng/null → ''", parseClientIp("") === "" && parseClientIp(null) === "");
check("xff chuỗi dài bất thường → '' (không tốn gì)", parseClientIp("9".repeat(70)) === "");

// 9. Chỉ gọi upstream cho IP CÔNG CỘNG — IP riêng tư/rác trả rỗng ngay.
for (const bad of [
  "",
  "abc",
  "999.1.1.1",
  "1.2.3",
  "127.0.0.1",
  "10.1.2.3",
  "172.16.0.1",
  "192.168.1.5",
  "169.254.1.1",
  "100.64.0.1",
  "::1",
  "fd00::1",
  "fe80::1",
]) {
  check(`isPublicIp từ chối "${bad}"`, !isPublicIp(bad));
}
for (const good of ["1.1.1.1", "8.8.8.8", "2001:4860:4860::8888"]) {
  check(`isPublicIp nhận "${good}"`, isPublicIp(good));
}

// 10. Trần per-IP (script loop một IP) + trần toàn cục (botnet phân tán).
__resetGeoGuardForTest();
let geoAllOk = true;
for (let i = 0; i < GEO_MAX_PER_IP_PER_MIN; i++) {
  if (!allowGeoRequest("1.1.1.1", 1000)) geoAllOk = false;
}
check(`IP gọi ${GEO_MAX_PER_IP_PER_MIN} lượt trong cửa sổ → ok`, geoAllOk);
check("lượt vượt trần của cùng IP → chặn", !allowGeoRequest("1.1.1.1", 1000));
check("IP khác không bị ảnh hưởng (bucket tách riêng)", allowGeoRequest("2.2.2.2", 1000));
check("qua cửa sổ 60s → IP được gọi lại", allowGeoRequest("1.1.1.1", 1000 + GEO_WINDOW_MS + 1));
__resetGeoGuardForTest();
let geoBlockedAt = -1;
for (let i = 0; i <= GEO_MAX_GLOBAL_PER_MIN + 20; i++) {
  const ip = `9.9.${Math.floor(i / 250)}.${i % 250}`;
  if (!allowGeoRequest(ip, 2000)) {
    geoBlockedAt = i;
    break;
  }
}
check(
  "botnet nhiều IP khác nhau → chặn bằng trần toàn cục",
  geoBlockedAt === GEO_MAX_GLOBAL_PER_MIN,
  String(geoBlockedAt),
);
__resetGeoGuardForTest();

console.log(`\nKết quả: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
