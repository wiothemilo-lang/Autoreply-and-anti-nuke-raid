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

// ─── 7. Làm mới im lặng KHÔNG được lặp vô hạn (sự cố "lặp đăng nhập") ─────────
// Dashboard tự nhảy sang Discord (prompt=none) để làm mới danh sách server, khoá
// lặp nằm ở `src/lib/silentRefresh.ts`. Nếu Discord từ chối prompt=none thì cứ mở
// dashboard lại bị đẩy sang Discord → thất bại → quay lại: đúng cảm giác "lặp
// đăng nhập". Ba lá chắn: khoá lượt tự động khi thất bại, chỉ nút "Tải lại" mở
// lại, và không nhảy khi phiên đã hỏng (me === null).
//
// Sự cố 06/10/2026 (bản trước): khoá nằm ở SESSIONSTORAGE — riêng từng tab — nên
// mỗi tab mới lại bị đẩy sang Discord một lần nữa. Bản này bắt buộc khoá nằm ở
// localStorage (phạm vi trình duyệt) và Dashboard KHÔNG được tự đọc/ghi
// sessionStorage cho hai khoá đó nữa.
const dashboardTsx = fs.readFileSync(path.join(ROOT, "src/pages/Dashboard.tsx"), "utf8");
const silentRefreshTs = fs.readFileSync(path.join(ROOT, "src/lib/silentRefresh.ts"), "utf8");

check(
  "cờ SILENT_FAILED_KEY khai báo trong silentRefresh.ts",
  /export const SILENT_FAILED_KEY\s*=\s*"wio_silent_failed"/.test(silentRefreshTs),
);
check(
  "mốc SILENT_ATTEMPT_KEY khai báo trong silentRefresh.ts",
  /export const SILENT_ATTEMPT_KEY\s*=\s*"wio_silent_last_attempt"/.test(silentRefreshTs),
);
check(
  "khoá lưu ở localStorage (phạm vi TRÌNH DUYỆT, không phải từng tab)",
  /localStorage\.setItem\(key, value\)/.test(silentRefreshTs) &&
    /localStorage\.removeItem\(key\)/.test(silentRefreshTs) &&
    /localStorage\.getItem\(key\)/.test(silentRefreshTs),
);
// Ba hàm chạm storage (readRaw/writeRaw/removeRaw) đều phải có nhánh catch: chế
// độ riêng tư / cookie bị chặn làm localStorage NÉM lỗi, không bắt là trắng trang.
// (Hành vi thật — gọi hàm khi KHÔNG có localStorage — được chứng minh ở
// scripts/test-web-ux-upgrades.ts, mục "#16 khoá chống lặp làm mới im lặng".)
check(
  "3 hàm storage đều bọc try/catch (chế độ riêng tư ném lỗi → trắng trang)",
  (silentRefreshTs.match(/function (readRaw|writeRaw|removeRaw)/g) || []).length === 3 &&
    (silentRefreshTs.match(/\} catch \{/g) || []).length >= 6,
);
check(
  "startSilentRefresh quyết định qua judgeSilentRefresh (hasSession = có token + clientId)",
  /judgeSilentRefresh\(readSilentLock\(\), now, \{[\s\S]{0,200}?hasSession: Boolean\(clientId && token\)/.test(
    dashboardTsx,
  ),
);
check(
  "Dashboard KHÔNG còn tự đọc/ghi 2 khoá đó bằng sessionStorage",
  !/sessionStorage\.(getItem|setItem|removeItem)\(\s*SILENT_(FAILED|ATTEMPT)_KEY/.test(
    dashboardTsx,
  ),
);
check(
  "nhánh lỗi (else sau silent=ok) khoá lượt tự động qua markSilentFailed()",
  /if \(silent === "ok"\)[\s\S]{0,400}?\}\s*else\s*\{[\s\S]{0,400}markSilentFailed\(\)/.test(
    dashboardTsx,
  ),
);
check(
  "nhánh silent=ok XOÁ cờ thất bại",
  /silent === "ok"[\s\S]{0,200}clearSilentFailed\(\)/.test(dashboardTsx),
);
check(
  "nút Tải lại (force) mở lại lượt tự động",
  /async function handleRefresh\(\)[\s\S]{0,300}clearSilentFailed\(\)/.test(dashboardTsx),
);
check(
  "KHÔNG nhảy sang Discord khi phiên đã hỏng (me null)",
  /useEffect\(\(\) => \{\s*\n\s*if \(!me\) return;[\s\S]{0,200}startSilentRefresh\(false\)/.test(
    dashboardTsx,
  ),
);
check(
  "đăng xuất xoá cờ thất bại (đăng nhập lại không mang theo lỗi cũ)",
  /async function handleLogout\(\)[\s\S]{0,400}clearSilentFailed\(\)/.test(dashboardTsx),
);
check(
  "discord.ts KHÔNG còn giữ 2 khoá chống lặp (một nguồn duy nhất)",
  !/export const SILENT_(FAILED|ATTEMPT)_KEY/.test(discordTs),
);

console.log(`\nKết quả OAuth client-id guard: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
