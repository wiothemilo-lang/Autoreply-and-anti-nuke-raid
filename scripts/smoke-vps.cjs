#!/usr/bin/env node
/**
 * smoke-vps.cjs — SMOKE TEST CHẠY TRÊN VPS sau khi `git pull` + trước/như một phần của
 * `pm2 restart`. Bắt lỗi MÔI TRƯỜNG mà CI không thấy được (env thiếu, module nạp lỗi,
 * mất kết nối Convex) — chính là lớp lỗi từng gây crash khi raid thật xảy ra.
 *
 * Chạy:  node scripts/smoke-vps.cjs            (kiểm tra đầy đủ)
 *        node scripts/smoke-vps.cjs --offline  (không login Discord — dùng khi bot đang chạy)
 *
 * Thoát 0 khi mọi check pass, 1 khi có lỗi (dùng được cho cron/monitoring).
 */
const path = require("path");
const fs = require("fs");

let pass = 0;
let fail = 0;
const failures = [];
function check(label, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    fail++;
    failures.push(label + (detail ? ` — ${detail}` : ""));
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(title) {
  console.log(`\n━━━ ${title} ━━━`);
}

// ─────────────────────────── 1. Node version ───────────────────────────
section("1. Runtime");
const [major] = process.versions.node.split(".").map(Number);
check(`Node.js >= 18 (hiện tại ${process.versions.node})`, major >= 18);

// ─────────────────────────── 2. Env vars ───────────────────────────
section("2. Biến môi trường (nạp bot/src/loadenv.js)");
try {
  // PHẢI gọi loadEnv() — chỉ require() thôi KHÔNG nạp gì: loadenv.js chỉ
  // export hàm (module.exports = { loadEnv }), không tự chạy khi require.
  // Bot thật gọi ở bot/src/index.js:6 và register-slash.js:1; smoke test
  // trước đây chỉ require → bot/.env bị bỏ qua và 2 biến bắt buộc luôn ❌
  // dù VPS đã cấu hình đúng (bug thật 05/10/2026 lúc dựng VPS mới).
  require(path.join(__dirname, "..", "bot", "src", "loadenv.js")).loadEnv();
  console.log("  ℹ️  loadenv.js đã nạp bot/.env (nếu có)");
} catch (e) {
  console.log(`  ⚠️  loadenv.js không nạp được: ${e.message}`);
}
const REQUIRED_ENV = [
  ["DISCORD_TOKEN", "token bot Discord — thiếu = bot không login được"],
  ["CONVEX_URL", "địa chỉ Convex deployment — thiếu = mất DB + dashboard"],
];
for (const [name, why] of REQUIRED_ENV) {
  const v = process.env[name];
  check(`${name} tồn tại`, typeof v === "string" && v.length > 10, why);
}
// AI keys: tùy chọn nhưng cảnh báo khi không có cái nào
const AI_KEYS = ["GROQ_API_KEY", "NVIDIA_API_KEY", "SAMBANOVA_API_KEY", "OPENAI_API_KEY"];
const aiCount = AI_KEYS.filter((k) => process.env[k]).length;
check(
  aiCount > 0 ? `Có ${aiCount} AI key` : "AI key (GROQ/NVIDIA/SAMBANOVA/OPENAI)",
  true,
  aiCount > 0
    ? undefined
    : "không bắt buộc — bot chạy được nhưng AI phân loại raid bị tắt (fallback heuristic)",
);
// Không in giá trị, chỉ tên biến — secrets không bao giờ được in ra

// ─────────────────────────── 3. Module load ───────────────────────────
section("3. Nạp toàn bộ module bot (bắt lỗi import/undefined)");
const CORE_MODULES = [
  "bot/src/index.js",
  "bot/src/handlers/antinuke/index.js",
  "bot/src/handlers/antinuke/audit.js",
  "bot/src/handlers/antinuke/members.js",
  "bot/src/handlers/antinuke/messages.js",
  "bot/src/handlers/antinuke/externalApp.js",
  "bot/src/handlers/backup.js",
  "bot/src/handlers/joinGate.js",
  "bot/src/altDetection.js",
  "bot/src/heat.js",
  "bot/src/lockdown.js",
  "bot/src/caseLog.js",
  "bot/src/webhookHub.js",
  "bot/src/threatEngine.js",
];
let loaded = 0;
for (const rel of CORE_MODULES) {
  const abs = path.join(__dirname, "..", rel);
  if (!fs.existsSync(abs)) {
    check(`nạp ${rel}`, false, "file không tồn tại");
    continue;
  }
  try {
    require(abs);
    loaded++;
  } catch (e) {
    check(`nạp ${rel}`, false, e.message.split("\n")[0]);
  }
}
check(`${loaded}/${CORE_MODULES.length} module nạp sạch`, loaded === CORE_MODULES.length);

// ─────────────────────────── Main (async) ───────────────────────────
(async () => {
  // ─────────────────────────── 4. Convex connectivity ───────────────────────────
  section("4. Kết nối Convex");
  const CONVEX_URL = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!CONVEX_URL) {
    check("Convex reachable", false, "không có CONVEX_URL — bỏ qua check kết nối");
  } else {
    // Ping function query nhẹ qua HTTP API (round-trip đầy đủ tới deployment).
    const pinged = await Promise.race([
      (async () => {
        const res = await fetch(`${CONVEX_URL.replace(/\/$/, "")}/api/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: "status:botStatus", args: {}, format: "json" }),
        });
        return res.ok;
      })().catch(() => false),
      new Promise((r) => setTimeout(() => r(false), 10_000)),
    ]);
    check(
      "Convex deployment phản hồi (<= 10s)",
      pinged === true,
      CONVEX_URL.replace(/https?:\/\//, "").slice(0, 24) + "…",
    );
  }

  // ─────────────────────────── 5. Discord login (trừ --offline) ───────────────────────────
  if (!process.argv.includes("--offline")) {
    section("5. Discord login + Gateway intents");
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
      check("Discord login", false, "thiếu DISCORD_TOKEN");
    } else {
      try {
        // discord.js nằm ở bot/node_modules (chỉ trong bot/package.json).
        // require("discord.js") từ scripts/ sẽ dò scripts/node_modules →
        // root/node_modules — KHÔNG có ở đâu cả → luôn "Cannot find module"
        // dù bot deps đã cài đủ (bug thật 05/10/2026). createRequire với
        // đường dẫn trong bot/ ép Node giải resolve theo gốc bot.
        const { createRequire } = require("module");
        const botRequire = createRequire(path.join(__dirname, "..", "bot", "package.json"));
        const { Client, GatewayIntentBits } = botRequire("discord.js");
        const probe = new Client({ intents: [GatewayIntentBits.Guilds] });
        const loginResult = await Promise.race([
          probe
            .login(token)
            .then(() => true)
            .catch(() => false),
          new Promise((r) => setTimeout(() => r(false), 15_000)),
        ]);
        check(
          "Discord login thành công",
          loginResult === true,
          loginResult ? undefined : "token sai/hết hạn hoặc mạng chặn gateway — kiểm tra pm2 logs",
        );
        if (loginResult) await probe.destroy();
      } catch (e) {
        check("Discord login", false, e.message.split("\n")[0]);
      }
    }
  }

  // ─────────────────────────── Tổng kết ───────────────────────────
  console.log(`\n${"═".repeat(50)}`);
  console.log(`SMOKE TEST: ${pass} PASS, ${fail} FAIL`);
  if (fail > 0) {
    console.log("\nLỗi cần xử lý trước khi tin bot chạy ổn:");
    for (const f of failures) console.log(`  • ${f}`);
    process.exit(1);
  }
  console.log("Môi trường sẵn sàng — bot có thể chạy an toàn.");
  process.exit(0);
})();
