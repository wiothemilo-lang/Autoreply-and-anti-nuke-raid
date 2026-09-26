// Build shim — đa nền tảng (Windows/macOS/Linux), không đụng vite.config.ts.
//
// Vì sao cần: Convex deployment KHÔNG có DISCORD_CLIENT_ID (env deployment ≠ env
// hosting) và khi bot offline thì không có botApplicationId để fallback → nút
// đăng nhập Discord chết. Hosting build luôn có DISCORD_CLIENT_ID trong env, còn
// Vite chỉ expose biến có tiền tố VITE_* vào bundle. Shim này chuyển đổi trước
// khi chạy vite build, để usePublicConfig có BAKED_CLIENT_ID dự phòng.
import { spawnSync } from "node:child_process";

// Chỉ nướng giá trị Client ID HỢP LỆ (Discord Application ID là snowflake: chỉ
// gồm chữ số, 15-21 ký tự). Bug thật 18/09: env chứa blob mã hóa dán nhầm
// (base64 "{\"v\":\"v2\",...}") → bundle mang giá trị rác → URL đăng nhập
// Discord bị từ chối “Invalid Form Body” ngay trang Discord. Giá trị sai bị bỏ
// qua để runtime fallback về Convex (botApplicationId) thay vì phá nút đăng nhập.
// Chọn biến URL Convex ĐẦU TIÊN HỢP LỆ — không phải biến đầu tiên bất kể sai.
// Bug thật 26/09: env production chứa blob 1104 ký tự KHÔNG có scheme dán nhầm
// vào CONVEX_URL (giống vụ blob dán nhầm vào DISCORD_CLIENT_ID 18/09) che mất
// VITE_CONVEX_URL đúng → build fail "Invalid URL" mà không rõ nguyên nhân.
// Chuẩn như nhau cho mọi biến: HTTPS + host *.convex.cloud, không
// path/query/hash/credentials, không localhost. Fail-closed khi KHÔNG có biến
// nào hợp lệ (không fallback âm thầm sang deployment khác).
const CONVEX_HOST_RE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.convex\.cloud$/i;
const CONVEX_URL_VARS = ["CONVEX_URL", "VITE_CONVEX_URL", "PROTOGON_BUILD_CONVEX_URL"];

// Đáy an toàn tường minh (26/09): store env của hosting biến dạng MỌI giá trị
// set qua `freebuff-deploy env set` thành blob ~1.1k ký tự không dùng được
// (unset thì sạch, set thì hỏng — đã thử 3 key khác nhau, log deploy 00:40-00:50).
// Build không thể phụ thuộc env khi env không đáng tin. Giá trị đáy là CẤU HÌNH
// CÔNG KHAI chứ không phải secret: URL Convex client vốn được nướng vào bundle
// JS mà mọi visitor tải về. Người dùng vẫn override được qua env (ưu tiên cao
// hơn) khi chuyển deployment; env chết thì build về đúng deployment hiện tại
// thay vì chết máy hoặc âm thầm trỏ deployment khác.
const PROTOGON_DEFAULT_CONVEX_URL = "https://accomplished-chipmunk-74.convex.cloud";

const rejectedShapes = [];
let trimmedConvexUrl = "";

for (const name of CONVEX_URL_VARS) {
  const raw = (process.env[name] ?? "").trim().replace(/\/+$/, "");
  if (!raw) {
    rejectedShapes.push(`${name}: rỗng/không có`);
    continue;
  }
  try {
    const parsedConvexUrl = new URL(raw);
    const isLocal = /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(parsedConvexUrl.hostname);
    if (isLocal) {
      throw new Error("localhost không được dùng cho production build");
    } else if (
      parsedConvexUrl.protocol !== "https:" ||
      !CONVEX_HOST_RE.test(parsedConvexUrl.hostname)
    ) {
      throw new Error("production phải là HTTPS với host *.convex.cloud");
    }
    if (
      parsedConvexUrl.username ||
      parsedConvexUrl.password ||
      parsedConvexUrl.search ||
      parsedConvexUrl.hash ||
      (parsedConvexUrl.pathname && parsedConvexUrl.pathname !== "/")
    ) {
      throw new Error("không được có path, query, hash hoặc credentials");
    }
    trimmedConvexUrl = raw;
    break;
  } catch (error) {
    // Không in nội dung giá trị (phòng khi ai đó dán nhầm secret vào env) — chỉ
    // in DẠNG giá trị để chẩn đoán: độ dài, khoảng trắng trong, scheme gì.
    const shape =
      `length=${raw.length}, khoảng trắng trong=${/\s/.test(raw)}, ` +
      `scheme=${raw.startsWith("https://") ? "https" : raw.startsWith("http://") ? "http" : "không có"}`;
    rejectedShapes.push(`${name}: ${error.message} (dạng: ${shape})`);
  }
}

if (!trimmedConvexUrl) {
  // Không fail-closed nữa mà dùng đáy an toàn TƯỜNG MINH ở trên — vì env của
  // hosting có thể chết bất kỳ lúc nào (đang chết). Log đầy đủ nguyên nhân từng
  // biến bị loại: hành vi có kiểm soát, KHÔNG phải fallback âm thầm.
  console.error(
    "[build] Không có CONVEX_URL/VITE_CONVEX_URL hợp lệ — dùng đáy an toàn PROTOGON_DEFAULT_CONVEX_URL (cấu hình công khai, có review trong git). Env bị loại:",
  );
  for (const line of rejectedShapes) console.error(`[build]   · ${line}`);
  trimmedConvexUrl = PROTOGON_DEFAULT_CONVEX_URL;
}
process.env.VITE_CONVEX_URL = trimmedConvexUrl;

const rawClientId = process.env.VITE_DISCORD_CLIENT_ID || process.env.DISCORD_CLIENT_ID || "";
const trimmedClientId = rawClientId.trim();
if (rawClientId && !/^\d{15,21}$/.test(trimmedClientId)) {
  console.warn(
    "[build] DISCORD_CLIENT_ID không đúng dạng Application ID (chỉ chữ số, 15-21 ký tự)" +
      " — bỏ qua thay vì nướng vào bundle (tránh lỗi Invalid Form Body khi đăng nhập).",
  );
}
process.env.VITE_DISCORD_CLIENT_ID = /^\d{15,21}$/.test(trimmedClientId) ? trimmedClientId : "";

const res = spawnSync("vite", ["build"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
// Lỗi spawn (ENOENT…) không đi qua stdio "inherit" — không in thì chết exit 1
// im lặng, gây mù chẩn đoán (xảy ra thật 26/09 khi shim chạy trực tiếp bằng node
// không có node_modules/.bin trên PATH). In ra để biết gốc rễ thay vì đoán.
if (res.error) {
  console.error(`[build] Không chạy được vite: ${res.error.message}`);
  process.exit(res.status ?? 1);
}
process.exit(res.status ?? 1);
