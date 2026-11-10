#!/usr/bin/env node
/**
 * Tạo file protogon-bot.zip đúng chuẩn để upload lên Wispbyte (wispbyte.com)
 * hoặc bất kỳ host nào nhận zip + tự chạy `npm install`:
 * - Gồm package.json, src/ — host tự chạy `npm install`
 * - KHÔNG gồm node_modules, .git, .env, .env.local/.env.example, .bot-key,
 *   data/ (log + state runtime), *.md
 * - 🔒 KHÔNG bao giờ kèm file .env vào zip (bảo mật: tránh lộ token khi zip
 *   được commit lên repo public). Biến môi trường phải nhập trên panel host.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const out = path.join(root, "protogon-bot.zip");

if (fs.existsSync(out)) fs.unlinkSync(out);

let cmd;
const isWin = process.platform === "win32";

if (isWin) {
  // PowerShell: nén nội dung thư mục bot (không kèm thư mục cha)
  const excludes = [
    "node_modules",
    ".git",
    ".env",
    ".env.local",
    ".env.example",
    ".bot-key",
    "data",
    "protogon-bot.zip",
    "wio-discloud.zip",
  ];
  const items = fs
    .readdirSync(root)
    .filter((n) => !excludes.includes(n) && !n.endsWith(".md"))
    .map((n) => `'${n}'`)
    .join(",");
  cmd = `powershell -NoProfile -Command "Compress-Archive -Path ${items} -DestinationPath '${out}' -Force"`;
} else {
  // zip (macOS/Linux): loại bỏ các thư mục/file không cần
  cmd = `cd '${root}' && zip -r '${out}' . -x '*node_modules*' -x '*.git*' -x '.env' -x '.env.local' -x '.env.example' -x '.bot-key' -x 'data/*' -x 'protogon-bot.zip' -x 'wio-discloud.zip' -x '*.md'`;
}

try {
  execSync(cmd, { stdio: "inherit", shell: isWin ? undefined : "/bin/bash" });
} catch (err) {
  console.error("❌ Không tạo được zip:", err.message);
  process.exit(1);
}

const size = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
console.log(`\n✅ Đã tạo ${out} (${size} MB)`);
console.log("   → 🔒 .env và .bot-key KHÔNG được kèm vào zip (bảo mật).");
console.log(
  "   → Nhập biến môi trường trên panel host (Environment) hoặc tạo bot/.env trên server.",
);
console.log("   → Wispbyte: panel Files → Upload zip → Unarchive → Start.");
