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
const rawConvexUrl = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL || "";
const trimmedConvexUrl = rawConvexUrl.trim().replace(/\/+$/, "");
if (rawConvexUrl) {
  try {
    const parsedConvexUrl = new URL(trimmedConvexUrl);
    const isLocal = /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(parsedConvexUrl.hostname);
    const isConvexHost = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.convex\.cloud$/i.test(
      parsedConvexUrl.hostname,
    );
    if (isLocal) {
      throw new Error("production build không được dùng CONVEX_URL localhost");
    } else if (parsedConvexUrl.protocol !== "https:" || !isConvexHost) {
      throw new Error("production phải là HTTPS với host *.convex.cloud");
    }
    if (
      parsedConvexUrl.username ||
      parsedConvexUrl.password ||
      parsedConvexUrl.search ||
      parsedConvexUrl.hash ||
      (parsedConvexUrl.pathname && parsedConvexUrl.pathname !== "/")
    ) {
      throw new Error("CONVEX_URL không được có path, query, hash hoặc credentials");
    }
  } catch (error) {
    // Không in nội dung giá trị (có thể ai đó dán nhầm secret vào env) — chỉ in
    // DẠNG giá trị để chẩn đoán: độ dài, khoảng trắng trong, có scheme không.
    const trimmed = rawConvexUrl.trim();
    const shape =
      `length=${rawConvexUrl.length}, khoảng trắng trong=${/\s/.test(trimmed)}, ` +
      `scheme=${trimmed.startsWith("https://") ? "https" : trimmed.startsWith("http://") ? "http" : "không có"}, ` +
      `nguồn=${process.env.CONVEX_URL ? "CONVEX_URL" : process.env.VITE_CONVEX_URL ? "VITE_CONVEX_URL" : "không rõ"}`;
    console.error(`[build] CONVEX_URL không hợp lệ: ${error.message} (dạng: ${shape})`);
    process.exit(1);
  }
}
if (!rawConvexUrl) {
  console.error(
    "[build] Thiếu CONVEX_URL/VITE_CONVEX_URL — production build phải trỏ tường minh tới deployment, không dùng fallback âm thầm.",
  );
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
