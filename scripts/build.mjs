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
const CONVEX_URL_VARS = ["CONVEX_URL", "VITE_CONVEX_URL"];
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
  console.error(
    "[build] Không có CONVEX_URL/VITE_CONVEX_URL hợp lệ — production build phải trỏ tường minh tới deployment, không dùng fallback âm thầm. Nguyên nhân từng biến:",
  );
  for (const line of rejectedShapes) console.error(`[build]   · ${line}`);
  process.exit(1);
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
process.exit(res.status ?? 1);
