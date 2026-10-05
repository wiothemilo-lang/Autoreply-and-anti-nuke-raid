// TEST LIVE Haimiya trên deployment THẬT (giống hệt đường đi của web).
// Chạy: bun scripts/test-haimiya-live.mjs [deployment-url] [session-token]
// Gọi action haimiya:ask qua ConvexHttpClient — cần SESSION TOKEN hợp lệ
// (action giờ yêu cầu đăng nhập khi chưa cấu hình FUNC_SEED).
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const url = process.argv[2] || "https://accomplished-chipmunk-74.convex.cloud";
const token = process.argv[3] || "";
console.log(
  "Deployment:",
  url,
  token ? "(có token)" : "(KHÔNG có token — sẽ bị từ chối nếu backend yêu cầu đăng nhập)",
);

const client = new ConvexHttpClient(url);

// Test 0: aiStatus là action PUBLIC (không cần token) → chẩn đoán chuỗi
// provider ngay cả khi không đăng nhập được. `providerCount` mới có từ bản vá
// 05/10/2026: 1 = chỉ một key, hỏng là chết; >1 = còn đường lùi.
try {
  const s = await client.action(anyApi.haimiya.aiStatus, {});
  console.log(
    "[aiStatus] configured:",
    s.configured,
    "| providerCount:",
    s.providerCount,
    "| provider đầu:",
    s.gatewayHost,
    "| model:",
    s.model,
    "| rateLimited:",
    s.rateLimited,
  );
} catch (e) {
  console.log("[aiStatus] lỗi gọi endpoint:", String(e.message).slice(0, 120));
}

// Test 1: chat Haimiya cơ bản
const r1 = await client
  .action(anyApi.haimiya.ask, {
    messages: [
      { role: "user", content: "Haimiya ơi, hệ thống nhiệt độ của Protogon có mấy giai đoạn?" },
    ],
    token,
  })
  .catch((e) => ({ offline: true, reply: `TỪ CHỐI: ${e.message}` }));
console.log("[chat] offline:", r1.offline, "| reply:", String(r1.reply || "").slice(0, 220));
// `reason` là chỗ backend giải thích vì sao lỗi — không có nó thì mọi lỗi đều
// trông giống nhau ("chưa có key"), giống hệt bug 05/10 làm ta mất thời gian.
console.log("[chat] needLogin:", !!r1.needLogin, "| reason:", String(r1.reason || "(không có)"));

// Test 2: classifyViolation giờ CHỈ bot có BOT_KEY được gọi — call không key
// phải bị từ chối (xác nhận hành vi bảo mật mới).
const r2 = await client
  .action(anyApi.haimiya.classifyViolation, {
    guildId: "test",
    module: "spam",
    count: 8,
    windowSeconds: 10,
    threshold: 6,
    sampleMessages: [
      "@everyone JOIN NOW discord.gg/abc",
      "@everyone JOIN NOW discord.gg/abc",
      "@everyone JOIN NOW discord.gg/abc",
    ],
    recentJoins: 15,
    memberCount: 5000,
  })
  .then((v) => ({ denied: false, ...v }))
  .catch((e) => ({ denied: true, message: e.message }));
if (r2.denied) {
  console.log(
    `[classify] ✅ đã bị chặn khi thiếu botKey ("${String(r2.message).slice(0, 80)}") — đúng chính sách mới`,
  );
} else {
  console.log(
    `[classify] offline: ${r2.offline} | verdict: ${r2.classification} (${r2.confidence}) — ${r2.reason || ""}`.slice(
      0,
      260,
    ),
  );
}

// Kết luận phải phân biệt 3 ca, nếu không sẽ báo động giả mỗi lần chạy:
//  0 = chat AI thật sự hoạt động trên deployment.
//  2 = CHƯA ĐỦ ĐIỀU KIỆN kiểm tra (thiếu session token) — KHÔNG phải lỗi AI.
//  1 = chat offline thật, đọc `reason` ở trên để biết nguyên nhân.
const ok1 = !r1.offline && String(r1.reply || "").length > 20;
if (ok1) {
  console.log("\n✅ Haimiya chat LIVE — key AI trên deployment hoạt động");
  process.exit(0);
}
if (r1.needLogin) {
  console.log(
    "\n⚠️  CHƯA KẾT LUẬN ĐƯỢC (exit 2) — action yêu cầu đăng nhập và script không có session token.\n" +
      "    Đây KHÔNG phải lỗi AI. Chạy lại có token để kiểm thật:\n" +
      `      bun scripts/test-haimiya-live.mjs ${url} <session-token>`,
  );
  process.exit(2);
}
console.log(
  `\n❌ Haimiya chat OFFLINE (exit 1) — nguyên nhân: ${r1.reason || "(không có reason)"}`,
);
process.exit(1);
