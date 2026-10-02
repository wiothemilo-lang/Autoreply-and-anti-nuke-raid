// ĐÁNH GIÁ AI chống raid/nuke trên key THẬT (live, chạy tay — KHÔNG nằm trong
// `bun run test` vì run-all-tests chỉ glob test-*.cjs).
// Chạy: node scripts/test-ai-raid-eval.mjs
// Yêu cầu: env có key provider (GROQ_API_KEY / NVIDIA_API_KEY / KIRA_API_KEY...).
// Không key → SKIP (exit 0), không fail CI.
// Mục đích: đo độ CHÍNH XÁC + ĐỘ TRỄ của AI trên bộ case raid/benign gắn nhãn,
// để "huấn luyện" prompt có số liệu (sửa prompt → chạy lại → so sánh).
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const ai = require("../bot/src/ai.js");

const LAT_BUDGET_MS = 15_000;
let pass = 0;
let fail = 0;
let skipped = 0;
/** Số case KHÔNG có provider nào trả lời (hạ tầng, không phải độ chính xác). */
let offlineCount = 0;
/** Số case thật sự có câu trả lời (loại trừ offline). */
function answeredTotal() {
  return pass + fail;
}
const rows = [];

async function runCase(name, fn, check) {
  const t0 = Date.now();
  try {
    const res = await Promise.race([
      fn(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), LAT_BUDGET_MS)),
    ]);
    const ms = Date.now() - t0;
    const ok = check(res);
    // `offline` = KHÔNG CÓ provider nào trả lời (hạ tầng / 429 / hết hạn mức).
    // Đây KHÔNG phải "AI trả sai" — phải tách riêng, nếu không thì một lần
    // gateway chập chờn sẽ bị báo thành "AI mất chính xác" và cổng đỏ oan.
    const offline = Boolean(res && res.offline);
    rows.push({ name, ok, offline, ms, detail: JSON.stringify(res).slice(0, 160) });
    if (offline) offlineCount++;
    else if (ok) pass++;
    else fail++;
  } catch (e) {
    rows.push({
      name,
      ok: false,
      offline: false,
      ms: Date.now() - t0,
      detail: `LỖI: ${e.message}`,
    });
    fail++;
  }
}

if (!ai.aiAvailable()) {
  console.log("SKIP: không có key provider AI nào trong env — không đánh giá được.");
  process.exit(0);
}

const spamRaid = Array.from({ length: 6 }, () => "@everyone FREE NITRO discord-gift.ru/claim");
const friendChat = ["haha", "haha", "kkk", "vui quá", "haha", "😂😂", "chơi tiếp không"];

await runCase(
  "classify: spam @everyone + link lạ từ acc mới → raid",
  () =>
    ai.classifyViolation({
      module: "spam",
      count: 8,
      windowSeconds: 10,
      threshold: 6,
      sampleMessages: spamRaid,
      recentJoins: 12,
      memberCount: 1200,
    }),
  (r) => r && !r.offline && r.classification === "raid" && r.confidence >= 0.6,
);

await runCase(
  "classify: 1 người spam 'haha' → individual (không phải raid)",
  () =>
    ai.classifyViolation({
      module: "spam",
      count: 7,
      windowSeconds: 10,
      threshold: 6,
      sampleMessages: friendChat,
      recentJoins: 0,
      memberCount: 1200,
    }),
  (r) => r && !r.offline && r.classification !== "raid",
);

await runCase(
  "analyzeRaid: cụm sockpuppet (mới + default avatar + tên máy + cùng nhịp) → coordinated",
  () =>
    ai.analyzeRaid({
      module: "massJoin",
      count: 8,
      windowSeconds: 10,
      threshold: 5,
      clusterProfile: [
        "1. user1001 (acc 1 ngày, avatar không, vào cùng nhịp)",
        "2. user1002 (acc 1 ngày, avatar không, vào cùng nhịp)",
        "3. user1003 (acc 0 ngày, avatar không, vào cùng nhịp)",
      ].join("\n"),
      recentActions: "3 lượt tạo invite trong 2 phút",
    }),
  (r) => r && !r.offline && r.coordinated === true && r.confidence >= 0.6,
);

await runCase(
  "analyzeRaid: nhóm bạn (tên người + avatar + rải rác) → không phối hợp",
  () =>
    ai.analyzeRaid({
      module: "massJoin",
      count: 6,
      windowSeconds: 20,
      threshold: 5,
      clusterProfile: [
        "1. Minh Anh (acc 400 ngày, avatar có)",
        "2. Thu Trang (acc 900 ngày, avatar có)",
        "3. Hoàng Nam (acc 30 ngày, avatar có)",
      ].join("\n"),
      recentActions: "(không có)",
    }),
  (r) => r && !r.offline && r.coordinated === false,
);

await runCase(
  "analyzeExternalApp: app 'Free Nitro Premium' + spam → isRaid",
  () =>
    ai.analyzeExternalApp({
      count: 4,
      windowSeconds: 30,
      threshold: 2,
      appProfile:
        'App "Free Nitro Premium" được 4 acc mới kết nối; tin: "@everyone claim bit.ly/xyz"',
      recentJoins: 6,
      memberCount: 800,
    }),
  (r) => r && !r.offline && r.isRaid === true,
);

await runCase(
  "analyzeExternalApp: mod thử app nhạc quen → không phải raid",
  () =>
    ai.analyzeExternalApp({
      count: 1,
      windowSeconds: 30,
      threshold: 2,
      appProfile: 'Mod kết nối app "Rythm" (nhạc); tin: "Now playing: ..."',
      recentJoins: 0,
      memberCount: 800,
    }),
  (r) => r && !r.offline && r.isRaid === false,
);

console.log("\nKết quả đánh giá AI (live):");
for (const row of rows) {
  console.log(`${row.ok ? "✅" : "❌"} [${row.ms}ms] ${row.name}\n   ${row.detail}`);
}
const lat = rows.map((r) => r.ms);
console.log(
  `\nTổng: ${pass} đúng / ${answeredTotal()} case CÓ câu trả lời · không có provider trả lời: ${offlineCount}` +
    ` · trễ TB ${Math.round(lat.reduce((a, b) => a + b, 0) / Math.max(1, lat.length))}ms · max ${Math.max(...lat)}ms`,
);
if (skipped) console.log(`Bỏ qua: ${skipped}`);

/**
 * CỔNG ĐỘ CHÍNH XÁC (đợt #2) — so với đường cơ sở đã ghi lại.
 *
 * Trước đây file này chỉ in số liệu để NGƯỜI đọc, nên "sửa prompt xong điều
 * chỉnh lên 90%" không bao giờ bị chặn. Nay:
 *   - đường cơ sở nằm trong file (BASELINE) → sửa prompt mà độ đúng tụt quá hạn
 *     thì FAIL, có số để so;
 *   - trần trễ: prompt/model nặng lên thì độ đúng chưa đổi nhưng hoá đơn và
 *     deadline 6,5s thì không (đó là lý do #2 cần cổng này);
 *   - hạn mức chỉ áp dụng khi CÓ key provider (thiếu key thì SKIP như trước,
 *     không để CI đỏ vì lý do không liên quan).
 *
 * Cách cập nhật đường cơ sở khi cải thiện THẬT: sửa BASELINE bằng đúng số mới
 * đo được, kèm comment nói vì sao tăng — đừng nới hạn mức để xanh.
 */
const BASELINE = { correct: 6, total: 6, maxMs: 12_000 };
if (!ai.aiAvailable()) {
  console.log("\nCổng độ chính xác: KHÔNG bật (không có key provider) — coi như skip.");
} else {
  const answered = pass + fail;
  const accuracy = answered > 0 ? pass / answered : 1;
  const baseAccuracy = BASELINE.correct / Math.max(1, BASELINE.total);
  const totalCases = answered + offlineCount;
  console.log(
    `\nCổng độ chính xác: ${(accuracy * 100).toFixed(1)}% trong ${answered} ca CÓ trả lời` +
      ` (đường cơ sở ${(baseAccuracy * 100).toFixed(1)}%) · trễ max ${Math.max(...lat)}ms` +
      ` · không có provider trả lời: ${offlineCount}/${totalCases}`,
  );
  if (offlineCount > 0) {
    console.log(
      `⚠️ ${offlineCount}/${totalCases} ca rơi vào offline (không provider nào trả lời: 429/hết hạn mức/gateway chập chờn).` +
        ` Đây là tín hiệu HẠ TẦNG, không phải độ chính xác — độ chính xác chỉ tính trên các ca có câu trả lời.`,
    );
  }
  // Cổng CHẶT chỉ khi được bật tường minh: độ chính xác phụ thuộc cả chuỗi
  // provider bên ngoài, nên bắt CI đỏ theo nó là bắt đỏ oan. Mặc định chỉ CẢNH
  // BÁO — người đọc log mới quyết định có chặn merge hay không.
  const hard = process.env.AI_EVAL_GATE === "1";
  if (accuracy < baseAccuracy) {
    const msg = `ĐỘ CHÍNH XÁC TỤT so với đường cơ sở (${(accuracy * 100).toFixed(1)}% < ${(baseAccuracy * 100).toFixed(1)}%)`;
    if (hard) {
      console.log(`❌ ${msg} — đừng merge, hoặc cập nhật BASELINE kèm lý do.`);
      process.exit(1);
    }
    console.log(`⚠️ ${msg} — chỉ cảnh báo vì AI_EVAL_GATE chưa bật.`);
  }
  if (Math.max(...lat) > BASELINE.maxMs) {
    const msg = `Trễ vượt hạn ${BASELINE.maxMs}ms — prompt/model đang nặng`;
    if (hard) {
      console.log(`❌ ${msg}.`);
      process.exit(1);
    }
    console.log(`⚠️ ${msg}.`);
  }
}
process.exit(fail === 0 ? 0 : 1);
