#!/usr/bin/env node
/**
 * test-oauth-client-id.cjs — chặn tái diễn bug "Invalid Form Body" (18/09/2026).
 *
 * Bối cảnh: giá trị env DISCORD_CLIENT_ID bị dán nhầm bằng blob mã hóa của
 * dashboard khác (base64 `{"v":"v2","c":"..."}`) → bundle production mang
 * giá trị rác → URL đăng nhập Discord bị từ chối NGAY TRANG DISCORD với
 * thông báo "Invalid Form Body", người dùng tưởng dashboard lỗi.
 *
 * Lá chắn: Client ID phải là Discord snowflake (chỉ chữ số, 15-21 ký tự).
 * Giá trị sai bị loại ở 3 lớp:
 *   1. runtime  — src/lib/discord.ts: isValidDiscordClientId / pickValidClientId
 *   2. runtime  — src/lib/usePublicConfig.ts (lọc mọi nguồn: Convex + baked)
 *   3. build    — scripts/build.mjs (không nướng giá trị rác vào bundle)
 *
 * File TS được phân tích bằng regex vì suite này chạy thuần Node không qua
 * bundler — đủ để khóa HÌNH THỨC hàm validate (thay đổi phải chủ đích).
 */

const fs = require("fs");
const path = require("path");

let pass = 0;
let fail = 0;
function check(label, cond) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    fail++;
    console.error(`  ❌ ${label}`);
  }
}

const ROOT = path.join(__dirname, "..");

// ─── 1. discord.ts — hàm validate tồn tại và đúng hình thức ─────────────────
const discordTs = fs.readFileSync(path.join(ROOT, "src/lib/discord.ts"), "utf8");

check(
  "discord.ts định nghĩa isValidDiscordClientId",
  /export function isValidDiscordClientId/.test(discordTs),
);
check(
  "discord.ts định nghĩa pickValidClientId",
  /export function pickValidClientId/.test(discordTs),
);
// Regex snowflake: chỉ chữ số, 15-21 ký tự — đủ rộng cho Discord ID hiện tại
// và tương lai, đủ chặt để loại blob base64 / chữ / khoảng trắng.
check(
  "validate dùng regex snowflake /^\\\\d{15,21}$/",
  /isValidDiscordClientId[^}]*\/\^\\d\{15,21\}\$\//.test(discordTs),
);
// pickValidClientId KHÔNG bao giờ trả về giá trị không hợp lệ (chỉ trả trong
// nhánh đã validate, mặc định rỗng).
check(
  "pickValidClientId trả rỗng khi không có ứng viên hợp lệ",
  /return "";\s*\}\s*export function redirectUri|for \(const c of candidates\)[\s\S]*?return ""/.test(
    discordTs,
  ),
);
// safeRedirectPath: chặn open redirect qua returnTo (CVE-2025-68470 tương tự).
check("discord.ts định nghĩa safeRedirectPath", /export function safeRedirectPath/.test(discordTs));
check(
  "safeRedirectPath chặn protocol-relative // (open redirect)",
  /startsWith\("\/\/"\)/.test(discordTs) && /startsWith\("\/\\\\"\)/.test(discordTs),
);

// ─── 2. usePublicConfig.ts — mọi nguồn client_id đều qua bộ lọc ──────────────
const usePublicConfigTs = fs.readFileSync(path.join(ROOT, "src/lib/usePublicConfig.ts"), "utf8");

check(
  "usePublicConfig import pickValidClientId",
  /import \{ pickValidClientId \} from "\.\/discord"/.test(usePublicConfigTs),
);
// Kết hợp Convex + baked phải qua bộ lọc — KHÔNG còn chỗ nào dùng BAKED_CLIENT_ID
// thô làm clientId (bỏ qua các chỗ đã bọc pickValidClientId(...)).
const usesRawBakedAsClientId = (
  usePublicConfigTs.match(/clientId:\s*[^,\n]*BAKED_CLIENT_ID/g) || []
).filter((m) => !m.includes("pickValidClientId"));
check(
  "không còn gán clientId trực tiếp từ BAKED_CLIENT_ID (phải qua pickValidClientId)",
  usesRawBakedAsClientId.length === 0,
);
check(
  "clientId gộp qua pickValidClientId",
  /clientId:\s*pickValidClientId\(/.test(usePublicConfigTs),
);

// ─── 3. build.mjs — chặn nướng giá trị rác vào bundle lúc build ──────────────
const buildMjs = fs.readFileSync(path.join(ROOT, "scripts/build.mjs"), "utf8");
check(
  "build.mjs kiểm tra snowflake trước khi set VITE_DISCORD_CLIENT_ID",
  /\^\\d\{15,21\}\$/.test(buildMjs) && /VITE_DISCORD_CLIENT_ID\s*=/.test(buildMjs),
);

// ─── 4. Mô phỏng hành vi runtime (logic validate thuần) ──────────────────────
// Tái tạo đúng regex của production để test giá trị thật.
function isValid(id) {
  return typeof id === "string" && /^\d{15,21}$/.test(id.trim());
}
function pick(...candidates) {
  for (const c of candidates) if (isValid(c)) return c.trim();
  return "";
}

const BLOB =
  "eyJ2IjoidjIiLCJjIjoidDRsd21wenRaaGRGVFhhajE1NWppckxIeGZEZHIyaFB0c00wWVdXcVZJVnpGOCtHT2I4VzNPOS9BaXlhVUVXQktVN1dkU08xL2F";
check("blob mã hóa (bug thật 18/09) bị TỪ CHỐI", !isValid(BLOB));
check("blob base64 có số lẫn vào vẫn bị từ chối", !isValid("eyJ2MTIzNDU2Nzg5MDEyMzQ1"));
check("chuỗi có khoảng trắng 2 đầu bị trim rồi CHẤP NHẬN", isValid("  123456789012345678  "));
check("snowflake 18 số hợp lệ", isValid("123456789012345678"));
check("snowflake 15 số hợp lệ (biên dưới)", isValid("123456789012345"));
check("snowflake 21 số hợp lệ (biên trên)", isValid("123456789012345678901"));
check("14 số bị từ chối (biên dưới -1)", !isValid("12345678901234"));
check("22 số bị từ chối (biên trên +1)", !isValid("1234567890123456789012"));
check("rỗng bị từ chối", !isValid(""));
check("undefined/null bị từ chối", !isValid(undefined) && !isValid(null));

check(
  "pick ưu tiên giá trị hợp lệ sau khi giá trị đầu bị loại",
  pick(BLOB, "123456789012345678") === "123456789012345678",
);
check("pick KHÔNG fallback về giá trị rác khi mọi ứng viên sai", pick(BLOB, "garbage") === "");

// ─── 5. safeRedirectPath — chống open redirect (returnTo) ────────────────────
// Tái tạo đúng logic production để test giá trị thật.
function safeRedirect(raw, fallback = "/dashboard") {
  if (typeof raw !== "string") return fallback;
  const path = raw.trim();
  if (!path.startsWith("/")) return fallback;
  if (path.startsWith("//") || path.startsWith("/\\")) return fallback;
  if (path.includes("\\")) return fallback;
  return path;
}

check("đường dẫn nội bộ hợp lệ được giữ", safeRedirect("/dashboard/g/123") === "/dashboard/g/123");
check(
  "query string nội bộ được giữ",
  safeRedirect("/dashboard?tab=heat") === "/dashboard?tab=heat",
);
check("//evil.com bị TỪ CHỐI (open redirect)", safeRedirect("//evil.com") === "/dashboard");
check("//evil.com/ path bị TỪ CHỐI", safeRedirect("//evil.com/steal") === "/dashboard");
check("/\\evil.com bị TỪ CHỐI (backslash)", safeRedirect("/\\evil.com") === "/dashboard");
check("backslash trong path bị TỪ CHỐI", safeRedirect("/dash\\board") === "/dashboard");
check(
  "http://evil.com (không bắt đầu /) bị TỪ CHỐI",
  safeRedirect("http://evil.com") === "/dashboard",
);
check("https://evil.com bị TỪ CHỐI", safeRedirect("https://evil.com") === "/dashboard");
check("javascript:alert(1) bị TỪ CHỐI", safeRedirect("javascript:alert(1)") === "/dashboard");
check("null → fallback", safeRedirect(null) === "/dashboard");
check("undefined → fallback", safeRedirect(undefined) === "/dashboard");
check("chuỗi rỗng → fallback", safeRedirect("") === "/dashboard");
check("khoảng trắng 2 đầu bị trim", safeRedirect("  /dashboard  ") === "/dashboard");
check("fallback tùy chỉnh được tôn trọng", safeRedirect("//evil.com", "/") === "/");

// ─── 6. DiscordCallback dùng safeRedirectPath (không còn check startsWith thô) ─
const callbackTsx = fs.readFileSync(path.join(ROOT, "src/pages/DiscordCallback.tsx"), "utf8");
check(
  "DiscordCallback dùng safeRedirectPath cho returnTo",
  /safeRedirectPath\(returnTo\)/.test(callbackTsx),
);
check(
  "DiscordCallback dùng safeRedirectPath cho silent return",
  /safeRedirectPath\(sessionStorage\.getItem\("wio_silent_return"\)\)/.test(callbackTsx),
);
check(
  "DiscordCallback KHÔNG còn check startsWith thô cho điều hướng",
  !/navigate\(returnTo\.startsWith/.test(callbackTsx),
);

// ─── 7. KHÔNG có đường TỰ ĐỘNG nhảy sang Discord (sự cố "lặp đăng nhập") ─────
// Người dùng báo sự cố này HAI lần. Lần 1 vá bằng khoá sessionStorage (theo tab),
// lần 2 vá bằng khoá localStorage (theo trình duyệt) — cả hai KHÔNG đủ, vì gốc rễ
// không phải chỗ lưu khoá mà là VIỆC TỰ CHUYỂN TRANG:
//   · Dashboard tự gọi prompt=none khi effect mount chạy lại; effect có deps `me`
//     — giá trị reactive của Convex ĐỔI OBJECT mỗi lần server cập nhật (heartbeat
//     bot ~60 giây) ⇒ effect chạy lại mỗi phút.
//   · Khoá chỉ là bộ đếm COOLDOWN 10 phút ⇒ hết 10 phút là cả trang bị nhảy sang
//     Discord lần nữa, lặp vô hạn trong một tab đang mở. Mỗi lần nhảy là tải lại
//     trang thật + mất ngữ cảnh + quay về kèm toast lỗi.
// Nên hợp đồng bây giờ là: luồng prompt=none CHỈ chạy khi người dùng bấm "Tải lại",
// và mọi lần chuyển trang phải nằm trong handler của nút đó.
const dashboardTsx = fs.readFileSync(path.join(ROOT, "src/pages/Dashboard.tsx"), "utf8");
const authPageTsx = fs.readFileSync(path.join(ROOT, "src/pages/AuthPage.tsx"), "utf8");
const authRouteTs = fs.readFileSync(path.join(ROOT, "src/lib/authRoute.ts"), "utf8");

check(
  "Dashboard KHÔNG còn khoá chống lặp nào (đã bỏ hẳn đường tự động)",
  !/SILENT_(FAILED|ATTEMPT)_KEY|judgeSilentRefresh|markSilentFailed|clearSilentFailed/.test(
    dashboardTsx,
  ),
);
check(
  "module khoá chống lặp theo tab/trình duyệt đã bị xoá (không còn code chết)",
  !fs.existsSync(path.join(ROOT, "src/lib/silentRefresh.ts")),
);
check(
  "Dashboard KHÔNG có effect mount nào gọi làm mới (không tự chuyển trang)",
  !/useEffect\([\s\S]{0,300}?refreshServerList\(/.test(dashboardTsx) &&
    !/useEffect\([\s\S]{0,300}?startSilentRefresh\(/.test(dashboardTsx),
);
check(
  "lượt làm mới nằm TRONG handler của nút Tải lại (handleRefresh → refreshServerList)",
  /async function handleRefresh\(\)[\s\S]{0,200}refreshServerList\(\)/.test(dashboardTsx),
);
check(
  "buildSilentAuthorizeUrl + window.location.assign nằm trong refreshServerList (do người dùng bấm)",
  /async function refreshServerList\(\)[\s\S]{0,600}?window\.location\.assign\(buildSilentAuthorizeUrl/.test(
    dashboardTsx,
  ) && (dashboardTsx.match(/buildSilentAuthorizeUrl\(/g) || []).length === 1,
);
check(
  "sau khi quay về (?silent=ok|err) KHÔNG có hành động điều hướng nào",
  /silent === "ok"[\s\S]{0,600}?window\.history\.replaceState/.test(dashboardTsx) &&
    !/silent === "ok"[\s\S]{0,600}?window\.location\.(assign|replace)\(/.test(dashboardTsx),
);
// `/auth` phải TỰ ĐI TIẾP khi phiên còn sống — nếu không, bấm Back sau khi đăng
// nhập (hoặc mở bookmark /auth) là thấy form đăng nhập: "đăng nhập vô rồi mà cứ
// yêu cầu đăng nhập lại".
check(
  "AuthPage quyết định bằng resolveAuthPageState (hàm thuần, có test hermetic)",
  /resolveAuthPageState\(\{/.test(authPageTsx) && /from "\.\.\/lib\/authRoute"/.test(authPageTsx),
);
check(
  "AuthPage: đã đăng nhập → <Navigate> vào app, KHÔNG hiện form đăng nhập",
  /if \(authState\.kind === "app"\)[\s\S]{0,120}<Navigate to=\{authState\.to\} replace \/>/.test(
    authPageTsx,
  ),
);
check(
  "AuthPage: đang kiểm tra phiên → splash, chưa hiện nút đăng nhập",
  /authState\.kind === "splash"[\s\S]{0,400}PageSplash/.test(authPageTsx),
);
check(
  "authRoute chặn đích vòng lặp (/auth, /discord/callback)",
  /NEVER_REDIRECT_TO = \["\/auth", "\/discord\/callback"\]/.test(authRouteTs) &&
    /isAuthLoopTarget/.test(authRouteTs),
);
check(
  "callback: mất verifier/state nhưng PHIÊN CÒN SỐNG → đi tiếp, không bắt đăng nhập lại",
  /if \(!verifier \|\| !savedState \|\| savedState !== state\)[\s\S]{0,900}?if \(getSessionToken\(\)\)[\s\S]{0,200}?navigate\(safeRedirectPath\(returnTo\)/.test(
    callbackTsx,
  ),
);

console.log(`\nKết quả OAuth client-id guard: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
