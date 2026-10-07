#!/usr/bin/env node
/**
 * test-bot-contracts.cjs — lá chắn hợp đồng bot (20/09/2026).
 *
 * Chặn tái diễn 4 bug thật tìm thấy khi review bot/src/:
 *  1. messages.js gọi relayClient.reportSignatureBatch 2 LẦN trong nhánh raid —
 *     Convex dedupe tăng weight cho mỗi lần gọi → 1 server tự nâng weight
 *     signature 1→2, vượt MIN_WEIGHT_AGED=2 rồi signature "xác nhận bởi 1
 *     server" được phân phối toàn mạng (vỡ chống đầu độc relay).
 *  2. joinGate burst auto-lockdown chỉ gọi botUpdateLockdown (bật cờ tính
 *     năng) mà KHÔNG gọi botLockState { until } → lockdownUntil không bao giờ
 *     được ghi → tickUnlocks không bao giờ mở khóa → server khóa kênh vĩnh viễn.
 *  3. interactionCreate khai báo verifyAttempts (rate-limit captcha DM) nhưng
 *     KHÔNG BAO GIỜ kiểm tra → spam nút "Nhận mã xác minh" = bot DM vô hạn.
 *     (Sau #5 nhánh nút nằm ở handlers/interactionVerify.js — guard đọc file
 *     mới, cùng ngữ nghĩa kiểm.)
 *  4. captchaStore.verifyCode không hủy mã khi sai → brute-force 10^6 tổ hợp
 *     trong cửa sổ 5 phút đoán trúng mã 6 chữ số không cần DM.
 *
 * Hermetic: regex đọc source + require trực tiếp captchaStore (pure CommonJS).
 * Chạy: node scripts/test-bot-contracts.cjs
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
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

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

// ─── 1. Threat relay: nhánh raid massMessage chỉ đóng góp signature 1 lần ───
const messagesSrc = read("bot/src/handlers/antinuke/messages.js");
const relayCalls = [...messagesSrc.matchAll(/reportSignatureBatch\(/g)].length;
check(
  "nhánh raid chỉ gọi reportSignatureBatch 1 lần (không double-report nâng weight oan)",
  relayCalls === 2, // 1 trong handleMessagePatterns + 1 trong handleSpam
  `hiện ${relayCalls} chỗ gọi trong messages.js`,
);

// ─── 2. Burst auto-lockdown phải đặt hạn mở khóa trên Convex ─────────────────
const joinGateSrc = read("bot/src/handlers/joinGate.js");
check(
  "joinGate burst lockdown gọi botLockState (ghi lockdownUntil để tickUnlocks mở được)",
  /bot_writes:botLockState/.test(joinGateSrc),
  "thiếu botLockState — server sẽ bị khóa kênh vĩnh viễn sau burst",
);
// botUpdateLockdown không đặt lockdownUntil phía Convex — chỉ là cờ tính năng.
// Đợt #5: thân hàm ở convex/bot_writes/settings.ts (wrapper giữ ở bot_writes.ts).
const settingsSrc = read("convex/bot_writes/settings.ts");
const updateLockdownBody = settingsSrc.slice(
  settingsSrc.indexOf("export async function botUpdateLockdownHandler("),
  settingsSrc.indexOf("export async function botLockStateHandler("),
);
check(
  "botUpdateLockdown KHÔNG ghi lockdownUntil (đặc tính — nên luồng khóa thật phải qua botLockState)",
  updateLockdownBody.includes("lockdownEnabled") && !updateLockdownBody.includes("lockdownUntil"),
);

// ─── 3. Rate-limit captcha DM phải được KIỂM TRA, không chỉ khai báo ─────────
// Sau #5 tách monolith, hàm nhận nút captcha nằm ở interactionVerify.js —
// đọc đúng file mới, cùng ngữ nghĩa kiểm.
const interactionSrc = read("bot/src/handlers/interactionVerify.js");
const hasMap = /const verifyAttempts = new Map\(\)/.test(interactionSrc);
// Kiểm tra thật: trong hàm xử lý nút, trước khi setCode phải có
// check verifyAttempts.get + trả lời chặn khi vượt hạn mức.
const captchaBranch = interactionSrc.slice(
  interactionSrc.indexOf("async function handleVerifyRequestCaptcha"),
  interactionSrc.indexOf("// Tạo mã captcha và gửi DM"),
);
check("verifyAttempts được khai báo", hasMap);
check(
  "nút nhận mã captcha kiểm tra rate-limit TRƯỚC khi tạo mã (chặn DM vô hạn)",
  /verifyAttempts\.get\(/.test(captchaBranch) && /attempts\.attempts >= \d+/.test(captchaBranch),
  "Map chỉ khai báo + dọn dẹp nhưng không bao giờ được check — rate-limit chết",
);

// ─── 4. Captcha chống brute-force: sai quá hạn mức phải HỦY mã ───────────────
const captchaStore = require("../bot/src/captchaStore");
check(
  "captchaStore xuất MAX_WRONG_ATTEMPTS (hợp đồng chống brute-force)",
  Number.isInteger(captchaStore.MAX_WRONG_ATTEMPTS) && captchaStore.MAX_WRONG_ATTEMPTS >= 3,
);
{
  const GUILD = "guild-test";
  const USER = "user-bruteforce";
  captchaStore.setCode(GUILD, USER, "123456");
  let canceled = false;
  let correctAfter = false;
  for (let i = 0; i < captchaStore.MAX_WRONG_ATTEMPTS; i++) {
    captchaStore.verifyCode(GUILD, USER, "000000");
    // Sau lượt sai cuối, mã phải đã bị hủy — lượt đoán ĐÚNG tiếp theo vẫn fail.
    if (i === captchaStore.MAX_WRONG_ATTEMPTS - 1) {
      const okTry = captchaStore.verifyCode(GUILD, USER, "123456");
      correctAfter = okTry.ok === true;
      canceled = okTry.reason === "no_code";
    }
  }
  check(
    `sai ${captchaStore.MAX_WRONG_ATTEMPTS} lần → mã bị hủy (đoán đúng sau đó vẫn fail)`,
    canceled && !correctAfter,
    "mã vẫn sống sau nhiều lượt sai — brute-force 10^6 tổ hợp trong 5 phút khả thi",
  );
  // Trường hợp đúng mã lần đầu vẫn hoạt động như cũ.
  captchaStore.setCode(GUILD, "u2", "654321");
  const ok = captchaStore.verifyCode(GUILD, "u2", "654321");
  check("đoán đúng lần đầu vẫn pass (không phá luồng verify thường)", ok.ok === true);
  // Một lượt sai đơn lẻ KHÔNG hủy mã (người thật gõ nhầm được tha thứ).
  captchaStore.setCode(GUILD, "u3", "111222");
  captchaStore.verifyCode(GUILD, "u3", "999999");
  const still = captchaStore.verifyCode(GUILD, "u3", "111222");
  check("1 lượt sai không hủy mã (người gõ nhầm vẫn xác minh được)", still.ok === true);
}

// ─── 5. Sức khỏe AI đẩy lên Convex + guard owner (đợt 12) ────────────────────
// Bot gộp aiStats() vào botSyncGuilds (0 function call thêm); Convex lưu vào
// botStatus.aiHealth; query getAiHealth CHỈ owner đọc được — người dùng thường
// gọi phải nhận null. Lỡ ai bỏ guard → hạ tầng AI (provider/model) lộ công khai.
const guildSyncSrc = read("bot/src/handlers/guildSync.js");
check(
  "guildSync nạp aiStats() vào globalStatus (dashboard Admin thấy sức khỏe AI)",
  /require\("\.\.\/ai"\)\.aiStats\(\)/.test(guildSyncSrc) && /aiHealth,/.test(guildSyncSrc),
  "bot sync 60s phải mang theo aiStats — nếu bỏ, panel AI trắng vĩnh viễn",
);
const guildsSrc = read("convex/guilds.ts");
const syncHandler =
  guildsSrc.match(/export const botSyncGuilds = mutation\(\{[\s\S]*?\n\}\);/)?.[0] ?? "";
check(
  "botSyncGuilds nhận aiHealth + patch vào botStatus (kèm reportedAt server-side)",
  syncHandler.includes("aiHealth") && syncHandler.includes("reportedAt: now"),
  "validator thiếu field → bot gửi bị từ chối im lặng; thiếu reportedAt → không biết dữ liệu cũ",
);
const statusSrc = read("convex/status.ts");
const aiHealthQuery =
  statusSrc.match(/export const getAiHealth = query\(\{[\s\S]*?\n\}\);/)?.[0] ?? "";
// 07/10/2026 — YÊU CẦU ĐỔI: cửa sổ Admin mở cho cả QUẢN TRỊ VIÊN NHÓM (do
// chủ bot đặt), nên guard đúng là isBotAdminUser = chủ bot HOẶC quản trị viên
// nhóm. Điều KHÔNG được đổi: phải có guard và phải nằm TRƯỚC khi đọc aiHealth,
// nếu không provider/model AI lộ công khai.
check(
  "getAiHealth guard admin TRƯỚC khi đọc aiHealth (người thường phải nhận null)",
  aiHealthQuery.includes("getUserByToken") &&
    aiHealthQuery.includes("isBotAdminUser") &&
    aiHealthQuery.indexOf("isBotAdminUser") < aiHealthQuery.indexOf("const ai ="),
  "thiếu guard → provider/model AI lộ công khai qua API Convex",
);
const adminSrc = read("src/pages/Admin.tsx");
check(
  "Admin đọc getAiHealth qua token phiên (getSessionToken, không chạm storage thô)",
  adminSrc.includes("api.status.getAiHealth") &&
    !/getAiHealth, \{ token: [^}]/.test(
      adminSrc.replace(/getAiHealth, token \? \{ token \} : "skip"/g, ""),
    ),
  "panel AI phải nằm trong cửa sổ Admin (chỉ owner nhìn thấy)",
);

const indexSrc = read("bot/src/index.js");
const uncaughtBranch = indexSrc.slice(
  indexSrc.indexOf('process.on("uncaughtException"'),
  indexSrc.indexOf("// --- Event handlers ---"),
);
check(
  "uncaughtException chẩn đoán có timeout rồi exit non-zero để PM2 restart",
  /UNCAUGHT_DIAGNOSIS_TIMEOUT_MS\s*=\s*5_000/.test(indexSrc) &&
    /setTimeout\(/.test(uncaughtBranch) &&
    /process\.exit\(1\)/.test(uncaughtBranch) &&
    /\.finally\(/.test(uncaughtBranch) &&
    !/Don't exit/.test(uncaughtBranch),
);

console.log(`\nKết quả bot contracts: ${pass} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
