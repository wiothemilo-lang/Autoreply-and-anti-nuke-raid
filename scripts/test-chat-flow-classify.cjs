// TEST: AI có phân biệt được LUỒNG CHAT RAID vs LƯU LƯỢNG LỚN NGƯỜI THẬT KHÔNG?
// Chạy: node scripts/test-chat-flow-classify.cjs
//
// Cách test: gọi classifyViolation (code AI thật trong bot/src/ai.js) với 2 luồng
// dữ liệu — (A) 8 người THẬT chat nhộn nhịp server lớn, (B) raid chat 8 acc bot.
// Fetch được mock để trả lời THEO NỘI DUNG prompt (mô phỏng model phân loại đúng):
// nếu prompt chứa mẫu tin nhắn đa dạng + memberCount lớn → trả "individual/benign";
// nếu mẫu lặp giống hệt/tin rác → trả "raid". Test xác minh:
//   1) Prompt ĐƯA ĐỦ dữ liệu cho AI phân biệt (memberCount, mẫu tin nhắn từng người).
//   2) Đường quyết định của bot (handleSpam/handleMessagePatterns) hành xử đúng:
//      luồng thật → không ban/khóa kênh; raid → ban + khóa kênh.
// Chế độ LIVE (key thật trên VPS): node scripts/test-chat-flow-classify.cjs --live
// → gọi API thật, in verdict AI cho từng luồng.

const realFetch = globalThis.fetch;
const LIVE = process.argv.includes("--live");

if (!LIVE) {
  // Mock fetch mô phỏng model phân loại: đọc prompt trong body để trả verdict hợp lý.
  globalThis.fetch = async (url, opts = {}) => {
    const host = new URL(String(url)).host;
    if (!/groq\.com|nvidia\.com|sambanova\.ai|openai\.com/.test(host)) return realFetch(url, opts);
    let body = {};
    try {
      body = JSON.parse(opts.body || "{}");
    } catch {}
    // Chỉ đọc message role=user (dữ liệu vụ việc + mẫu tin nhắn) — system prompt
    // chứa VÍ DỤ huấn luyện (kể cả mẫu raid) nên không được tính là tín hiệu.
    const userMsg = (body.messages || [])
      .filter((m) => m.role === "user")
      .map((m) => m.content || "")
      .join("\n");
    // 2 mẫu đầu GIỐNG HỆT cả dòng (không tính trùng tiền tố) hoặc có link mời/scam
    const lines = userMsg.split("\n");
    const sampleOf = (l) => (l.match(/^\d+\. (.*)$/) || [])[1];
    const idx = lines.findIndex((l) => /^1\. /.test(l));
    const identicalDup =
      idx >= 0 && lines[idx + 1] && sampleOf(lines[idx]) === sampleOf(lines[idx + 1]);
    const isRaidish = identicalDup || /(JOIN MY SERVER|FREE NITRO|gg\/[\w]+)/i.test(userMsg);
    const verdict = isRaidish
      ? {
          classification: "raid",
          confidence: 0.85,
          reason: "nội dung lặp + link mời",
          suggestPunish: "ban",
        }
      : {
          classification: "individual",
          confidence: 0.7,
          reason: "chat đa dạng của nhiều người, không phối hợp",
          suggestPunish: null,
        };
    return {
      ok: true,
      status: 200,
      // Response thật luôn có .text() — chatOne đọc text rồi parse JSON (fix HTTP).
      text: async () =>
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(verdict) } }] }),
      json: async () => ({ choices: [{ message: { content: JSON.stringify(verdict) } }] }),
    };
  };
} else {
  // LIVE: chỉ chạy khi có key — đọc env theo đúng loadenv của bot.
  // PHẢI gọi loadEnv(): loadenv.js chỉ export hàm, require thôi KHÔNG nạp gì
  // → nhánh LIVE âm thầm rơi về mock dù bot/.env có key thật (bug 05/10/2026).
  try {
    require("../bot/src/loadenv.js").loadEnv();
  } catch {}
}

Object.defineProperty(process.env, "GROQ_API_KEY", {
  value: process.env.GROQ_API_KEY || "fake-groq-key-for-mock",
  configurable: true,
  writable: true,
  enumerable: true,
});

const ai = require("../bot/src/ai.js");

let pass = 0;
let fail = 0;
const check = (label, ok) => {
  console.log(ok ? `  ✅ ${label}` : `  ❌ ${label}`);
  ok ? pass++ : fail++;
};

// --- Luồng A: server LỚN, 8 NGƯỜI THẬT chat nhộn nhịp (mỗi người nội dung riêng) ---
const realBusyChat = [
  "ao hojei qua buồn ngủ quá",
  "mấy band xem CS2 chưa trận hôm qua đỉnh vậy",
  "ok ai chơi valorant không gánh tui",
  "mình vừa nộp hồ sơ đại học xong :D",
  "đồi quán xá在今天 this game updated hai",
  "có ai rảnh test map custom không",
  "bn ơi cho hỏi bot nhạc sao không chạy",
  "chet roi quên deadline nộp bài",
];

// --- Luồng B: RAID chat — 8 acc bot, nội dung LẶP GIỐNG HỆT + link mời ---
const raidChat = [
  "JOIN MY SERVER NOW https://discord.gg/freenitro",
  "JOIN MY SERVER NOW https://discord.gg/freenitro",
  "JOIN MY SERVER NOW https://discord.gg/freenitro",
  "JOIN MY SERVER NOW https://discord.gg/freenitro",
  "JOIN MY SERVER NOW https://discord.gg/freenitro",
  "JOIN MY SERVER NOW https://discord.gg/freenitro",
  "JOIN MY SERVER NOW https://discord.gg/freenitro",
  "JOIN MY SERVER NOW https://discord.gg/freenitro",
];

const baseEvent = { module: "spam", count: 8, windowSeconds: 10, threshold: 6 };

(async () => {
  console.log(
    `Chế độ: ${LIVE ? "LIVE — gọi API AI thật" : "MOCK — kiểm tra đường quyết định + dữ liệu prompt"}\n`,
  );

  // 0) AI phải available (key được set, có provider)
  check("AI available (provider chain có provider)", ai.aiAvailable() === true);

  // 1) LUỒNG CHAT THẬT LƯU LƯỢNG LỚN → KHÔNG được kết luận raid
  console.log("Luồng A: 8 người thật chat nhộn nhịp (server 12,000 thành viên)");
  const real = await ai.classifyViolation({
    ...baseEvent,
    sampleMessages: realBusyChat,
    recentJoins: 2,
    memberCount: 12000,
  });
  console.log(`   verdict: ${JSON.stringify(real)}`);
  check("KHÔNG phân loại là raid", real.classification !== "raid");
  check("nêu lý do có chủ đích", (real.reason || "").length > 3);

  // 2) LUỒNG RAID → phải kết luận raid
  console.log("\nLuồng B: 8 acc raid spam link mời lặp giống hệt");
  const raid = await ai.classifyViolation({
    ...baseEvent,
    sampleMessages: raidChat,
    recentJoins: 9,
    memberCount: 12000,
  });
  console.log(`   verdict: ${JSON.stringify(raid)}`);
  check("phân loại là raid", raid.classification === "raid");
  check("tin cậy >= 0.6 (ngưỡng ban + khóa kênh của bot)", (raid.confidence ?? 0) >= 0.6);

  // 3) Đường quyết định thật của bot với từng verdict (handleSpam logic):
  const isRaidOf = (v) => v?.classification === "raid" && (v?.confidence ?? 0) >= 0.6;
  const isBenignOf = (v) => v?.classification === "benign";
  const outcomeOf = (v) => {
    if (isRaidOf(v)) return "ban + lockdown";
    if (isBenignOf(v)) return "bỏ qua";
    return "heat: +10 nhiệt → warn/timeout theo cấp";
  };
  console.log("\nĐường quyết định bot (classify → punish):");
  console.log(`   Luồng thật → ${outcomeOf(real)}`);
  console.log(`   Luồng raid → ${outcomeOf(raid)}`);
  check("luồng thật KHÔNG ban + KHÔNG khóa kênh", outcomeOf(real) !== "ban + lockdown");
  check("luồng raid bị ban + khóa kênh", outcomeOf(raid) === "ban + lockdown");

  // 4) Khối lượng lớn nhưng CÙNG 1 người spam → individual heat, không phải raid-lockdown
  console.log("\nLuồng C: 1 người dùng bình thường gửi 8 tin liên tiếp trong 10s");
  const soloSpam = await ai.classifyViolation({
    ...baseEvent,
    sampleMessages: ["ok", "ok wait", "ừ", "dm tôi", "sao thế", "lol", "brb", "ok ok"],
    recentJoins: 0,
    memberCount: 12000,
  });
  console.log(`   verdict: ${JSON.stringify(soloSpam)}`);
  check("1 người spam nhanh = KHÔNG raid (chỉ heat)", soloSpam.classification !== "raid");

  console.log(`\nKết quả: ${pass} PASS, ${fail} FAIL`);
  if (LIVE) globalThis.fetch = realFetch;
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error("ERROR:", e);
  if (LIVE) globalThis.fetch = realFetch;
  process.exit(1);
});
