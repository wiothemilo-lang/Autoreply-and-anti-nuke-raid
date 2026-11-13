// TEST Rate-guard chống đốt usage — tầng guard cho action public không auth.
// Chạy: bun scripts/test-rate-guard.ts
// Gọi trực tiếp hàm guard + handler thật của publicConfig/aiStatus (mock ctx)
// để xác minh: vượt trần → fallback NHẸ (không chạm DB) + hợp đồng no-throw.
import { rateLimitPublicAction, __resetRateGuardForTest } from "../convex/rateGuard";
import {
  allowVerifyRequest,
  allowVerifySelfTest,
  __resetHttpRateGuardForTest,
  RATE_WINDOW_MS,
  SELFTEST_MAX_PER_IP_PER_MIN,
  VERIFY_MAX_PER_IP_PER_MIN,
  VERIFY_MAX_GLOBAL_PER_MIN,
} from "../convex/httpRateGuard";
import { isPublicIp, parseClientIp, resolveClientIp } from "../convex/clientIp";
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
let ctx: any = { auth: { getUserIdentity: async () => "user-A" } };
let allOk = true;
for (let i = 0; i < 30; i++) {
  if (
    !(
      await rateLimitPublicAction(ctx, {
        name: "publicConfig",
        maxPerMin: 30,
        globalMaxPerMin: 600,
      })
    ).ok
  )
    allOk = false;
}
check("30 lần trong trần → tất cả ok", allOk);

// 2. Vượt trần per-identity → chặn.
check(
  "lần thứ 31 trong 1 phút → bị chặn",
  !(await rateLimitPublicAction(ctx, { name: "publicConfig", maxPerMin: 30, globalMaxPerMin: 600 }))
    .ok,
);

// 3. Identity khác không bị ảnh hưởng (bucket tách riêng).
__resetRateGuardForTest();
ctx = { auth: { getUserIdentity: async () => "user-B" } };
let firstBlocked = -1;
for (let i = 0; i < 40; i++) {
  const r = await rateLimitPublicAction(ctx, {
    name: "aiStatus",
    maxPerMin: 30,
    globalMaxPerMin: 600,
  });
  if (!r.ok && firstBlocked < 0) firstBlocked = i + 1;
}
check("user-B gọi 40 lần chỉ bị chặn từ lần 31", firstBlocked === 31, firstBlocked);
__resetRateGuardForTest();
const userC = { auth: { getUserIdentity: async () => "user-C" } };
allOk = true;
for (let i = 0; i < 30; i++) {
  if (
    !(
      await rateLimitPublicAction(userC, {
        name: "publicConfig",
        maxPerMin: 30,
        globalMaxPerMin: 600,
      })
    ).ok
  )
    allOk = false;
}
check("user-C (identity khác) vẫn đủ 30 lượt đầu", allOk);

// 3b. Convex thực tế trả identity object; guard phải dùng subject, không bỏ qua bucket.
__resetRateGuardForTest();
const objectCtx: any = { auth: { getUserIdentity: async () => ({ subject: "user-object" }) } };
const objectFirst = (
  await rateLimitPublicAction(objectCtx, {
    name: "publicConfig",
    maxPerMin: 1,
    globalMaxPerMin: 10,
  })
).ok;
const objectSecond = (
  await rateLimitPublicAction(objectCtx, {
    name: "publicConfig",
    maxPerMin: 1,
    globalMaxPerMin: 10,
  })
).ok;
check("identity object dùng subject và vẫn bị giới hạn", objectFirst && !objectSecond);

__resetRateGuardForTest();
const tokenCtx: any = {
  auth: { getUserIdentity: async () => ({ tokenIdentifier: "token-identity" }) },
};
const tokenFirst = (
  await rateLimitPublicAction(tokenCtx, {
    name: "publicConfig",
    maxPerMin: 1,
    globalMaxPerMin: 10,
  })
).ok;
const tokenSecond = (
  await rateLimitPublicAction(tokenCtx, {
    name: "publicConfig",
    maxPerMin: 1,
    globalMaxPerMin: 10,
  })
).ok;
check("identity object fallback tokenIdentifier vẫn bị giới hạn", tokenFirst && !tokenSecond);

__resetRateGuardForTest();
const anonymousObjectCtx: any = { auth: { getUserIdentity: async () => ({ opaque: true }) } };
check(
  "identity object không có subject/tokenIdentifier vẫn dùng anonymous/global",
  (
    await rateLimitPublicAction(anonymousObjectCtx, {
      name: "publicConfig",
      maxPerMin: 1,
      globalMaxPerMin: 10,
    })
  ).ok &&
    (
      await rateLimitPublicAction(anonymousObjectCtx, {
        name: "publicConfig",
        maxPerMin: 1,
        globalMaxPerMin: 10,
      })
    ).ok,
);

// 4. Trần toàn cục chặn cả identity mới (botnet).
__resetRateGuardForTest();
allOk = true;
const users: string[] = [];
for (let i = 0; i < 700; i++) users.push(`botnet-${i}`);
for (const u of users) {
  const r = await rateLimitPublicAction(
    { auth: { getUserIdentity: async () => u } },
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
    !(
      await rateLimitPublicAction(userC, {
        name: "publicConfig",
        maxPerMin: 30,
        globalMaxPerMin: 600,
      })
    ).ok
  )
    allOk = false;
}
check(
  "hết trần publicConfig nhưng aiStatus vẫn ok",
  allOk &&
    (await rateLimitPublicAction(userC, { name: "aiStatus", maxPerMin: 60, globalMaxPerMin: 1200 }))
      .ok,
);

console.log("── handler thật: hợp đồng no-throw khi bị rate-limit ──");

// 6. publicConfig handler khi guard chặn: phải TRẢ object (không throw) + cờ rateLimited.
__resetRateGuardForTest();
const anonCtx: any = { auth: { getUserIdentity: async () => null } };
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

console.log("── httpRateGuard + clientIp: chuẩn hoá IP & trần verify ──");

// 8. Chuẩn hoá x-forwarded-for: mục CUỐI là IP do proxy append (không spoof được).
// Lấy mục đầu là lỗ hổng cũ: client tự đặt "X-Forwarded-For: <IP nạn nhân>".
check(
  "xff nhiều mục → lấy mục CUỐI (proxy append)",
  parseClientIp("1.2.3.4, 10.0.0.1") === "10.0.0.1",
);
check(
  "xff client giả mạo IP nạn nhân → không lấy mục đầu",
  parseClientIp("203.0.113.7, 198.51.100.4") === "198.51.100.4",
);
check(
  "resolveClientIp: XFF có IP công cộng → dùng mục cuối",
  resolveClientIp({ forwardedFor: "203.0.113.7, 198.51.100.4" }).ip === "198.51.100.4",
);
check(
  "resolveClientIp: mục cuối private → lùi về metadata công cộng",
  resolveClientIp({ metaIp: "8.8.8.8", forwardedFor: "203.0.113.7, 10.0.0.1" }).ip === "8.8.8.8",
);
check(
  "resolveClientIp: không có nguồn nào → rỗng",
  resolveClientIp({ metaIp: "", forwardedFor: "" }).ip === "",
);
check(
  "resolveClientIp: cảnh báo khi meta trùng mục đầu (nền tảng đọc XFF client)",
  resolveClientIp({ metaIp: "203.0.113.7", forwardedFor: "203.0.113.7, 198.51.100.4" })
    .spoofRisk === true,
);
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

// 10. Trần per-IP + trần toàn cục của /verify/complete vẫn hoạt động đúng.
__resetHttpRateGuardForTest();
let verifyAllOk = true;
for (let i = 0; i < VERIFY_MAX_PER_IP_PER_MIN; i++) {
  if (!allowVerifyRequest("6.6.6.6", 4000)) verifyAllOk = false;
}
check(`/verify/complete: IP gọi ${VERIFY_MAX_PER_IP_PER_MIN} lượt → ok`, verifyAllOk);
check("/verify/complete: lượt vượt trần cùng IP → chặn", !allowVerifyRequest("6.6.6.6", 4000));
check("… IP khác vẫn được (bucket riêng)", allowVerifyRequest("8.8.4.4", 4000));
check("qua cửa sổ 60s → IP được gọi lại", allowVerifyRequest("6.6.6.6", 4000 + RATE_WINDOW_MS + 1));

// 11. Trần toàn cục chặn botnet phân tán; self-test có bucket riêng nên
//     flood verify không khoá được thao tác admin.
__resetHttpRateGuardForTest();
let verifyBlockedAt = -1;
for (let i = 0; i <= VERIFY_MAX_GLOBAL_PER_MIN + 20; i++) {
  const ip = `3.3.${Math.floor(i / 250)}.${i % 250}`;
  if (!allowVerifyRequest(ip, 5000)) {
    verifyBlockedAt = i;
    break;
  }
}
check(
  "flood /verify/complete chạm trần toàn cục của chính nó",
  verifyBlockedAt === VERIFY_MAX_GLOBAL_PER_MIN,
  String(verifyBlockedAt),
);
check("… nhưng self-test vẫn còn lượt", allowVerifySelfTest("9.9.9.9", 5000));

// 14. Self-test có bucket RIÊNG: admin bấm kiểm tra không tiêu lượt verify.
__resetHttpRateGuardForTest();
let selfTestAllOk = true;
for (let i = 0; i < SELFTEST_MAX_PER_IP_PER_MIN; i++) {
  if (!allowVerifySelfTest("4.4.4.4", 6000)) selfTestAllOk = false;
}
check(`self-test: IP gọi ${SELFTEST_MAX_PER_IP_PER_MIN} lượt → ok`, selfTestAllOk);
check("self-test: lượt vượt trần cùng IP → chặn", !allowVerifySelfTest("4.4.4.4", 6000));
check("… /verify/complete vẫn còn lượt cho cùng IP", allowVerifyRequest("4.4.4.4", 6000));
__resetHttpRateGuardForTest();

console.log(`\nKết quả: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
