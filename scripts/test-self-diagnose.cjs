// Test selfDiagnose.js — fingerprint, cooldown, code context, store GIẢ.
// Chạy: node scripts/test-self-diagnose.cjs
// Mock discord.js bằng đường dẫn trỏ sang module giả (giống test-research-commands).
const Module = require("module");
const path = require("path");
const DJS_MOCK = require("./support/djs-mock-path.cjs");
const fs = require("fs");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "discord.js") {
    return DJS_MOCK;
  }
  return origResolve.call(this, request, ...args);
};
fs.writeFileSync(
  DJS_MOCK,
  `class EmbedBuilder {
  constructor(data = {}) { this.d = data; }
  setColor(c) { this.d.color = c; return this; }
  setTitle(t) { this.d.title = t; return this; }
  setDescription(t) { this.d.description = t; return this; }
  addFields(f) { this.d.fields = [...(this.d.fields ?? []), ...f]; return this; }
  setTimestamp() { return this; }
  setFooter(f) { this.d.footer = f; return this; }
}
module.exports = { Colors: new Proxy({}, { get: () => 0x000000 }), EmbedBuilder, PermissionFlagsBits: { ManageGuild: 1n << 5n, Administrator: 1n << 3n } };
`,
);

const sd = require("../bot/src/handlers/selfDiagnose.js");

let pass = 0;
let fail = 0;
function assert(cond, msg) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${msg}`);
  }
}

async function main() {
  // ---- 1. Fingerprint: cùng lỗi cùng vị trí → cùng fp; khác lỗi → khác fp ----
  const e1 = new Error("Cannot read properties of undefined (reading 'id')");
  // Gắn stack giả với frame trong bot/src
  e1.stack = `Error: Cannot read properties of undefined (reading 'id')
    at handleSpam (${path.resolve(__dirname, "..", "bot", "src", "handlers", "antinuke.js")}:1234:56)
    at Object.attach (...:0:0)`;
  const e2 = new Error(e1.message);
  e2.stack = e1.stack;
  const e3 = new Error("Khác hoàn toàn");
  e3.stack = `Error: Khác hoàn toàn
    at handleSpam (${path.resolve(__dirname, "..", "bot", "src", "handlers", "antinuke.js")}:999:1)`;

  // fingerprintOf không export — test qua hành vi cooldown: set enabled + store giả.
  const mutations = [];
  const store = {
    client: {
      mutation: async (name, args) => {
        mutations.push({ name, args });
        return { ok: true };
      },
      query: async () => null,
    },
    getConfig: async () => null,
  };
  const client = {
    guilds: { cache: new Map() },
  };

  // Vô hiệu hóa AI thật: researchChat trả JSON hợp lệ (không gọi mạng).
  const aiMod = require("../bot/src/ai.js");
  aiMod.researchChat = async () =>
    JSON.stringify({
      severity: "medium",
      cause: "Biến undefined khi member rời server giữa chừng.",
      fix: "Thêm optional chaining member?.id.",
      diff: "- x.id\n+ x?.id",
    });
  aiMod.researchAvailable = () => true;

  sd.attach(client, store);
  sd.setEnabledFromJobs({ enabled: true });

  // Lần 1: chạy được (state.inFlight giải phóng sau await)
  await sd.diagnoseError("unhandledRejection", e1);
  assert(mutations.length === 1, `lượt 1 ghi 1 mutation (thực tế ${mutations.length})`);
  assert(mutations[0]?.name === "selfDiagnose:botRecordDiagnose", "mutation đúng tên");
  assert(mutations[0]?.args.severity === "medium", "severity đúng");
  assert(typeof mutations[0]?.args.fingerprint === "string", "fingerprint là string");

  // Lần 2: cùng lỗi → cooldown, KHÔNG mutation mới
  await sd.diagnoseError("unhandledRejection", e2);
  assert(mutations.length === 1, `cùng lỗi bị chặn cooldown (thực tế ${mutations.length})`);

  // Lần 3: lỗi khác → chạy được
  await sd.diagnoseError("unhandledRejection", e3);
  assert(mutations.length === 2, `lỗi khác vẫn chạy (thực tế ${mutations.length})`);

  // ---- 2. Bật/tắt: tắt → KHÔNG chạy ----
  sd.setEnabledFromJobs({ enabled: false });
  await sd.diagnoseError("unhandledRejection", new Error("Lỗi khi tắt"));
  assert(mutations.length === 2, "tắt → không chẩn đoán");

  // Bật lại, lỗi mới (fingerprint chưa từng) → chạy
  sd.setEnabledFromJobs({ enabled: true });
  const e4 = new Error("Lỗi thứ tư");
  e4.stack = `Error: Lỗi thứ tư
    at (${path.resolve(__dirname, "..", "bot", "src", "util.js")}:10:5)`;
  await sd.diagnoseError("uncaughtException", e4);
  assert(mutations.length === 3, "bật lại + lỗi mới → chạy");

  // ---- 3. Lỗi không phải Error (string reason) → không vỡ ----
  await sd.diagnoseError("unhandledRejection", "chuỗi lỗi thường");
  assert(mutations.length >= 3, "reason dạng string không vỡ");

  // ---- 4. setEnabledFromJobs với input rác → không vỡ, giữ trạng thái cũ ----
  sd.setEnabledFromJobs(undefined);
  sd.setEnabledFromJobs(null);
  sd.setEnabledFromJobs("rác");
  assert(true, "input rác không vỡ");

  // ---- 5. Lỗi lúc AI OFFLINE không được ăn hạn mức 5 lượt/giờ ----
  // Provider (Kira) chết một lúc rồi hồi phục: các lỗi phát sinh lúc offline
  // KHÔNG tốn token nào, nên không có lý do ghi chúng vào hạn mức. Trước đây
  // 5 lỗi lúc AI tắt là đủ để chặn cả giờ sau khi AI hồi phục — self-diagnose
  // im lặng đúng lúc bot đang lỗi.
  let aiCalls = 0;
  const realResearchChat = aiMod.researchChat;
  aiMod.researchChat = async (...a) => {
    aiCalls++;
    return realResearchChat(...a);
  };
  aiMod.researchAvailable = () => false;
  for (let i = 0; i < 8; i++) {
    const off = new Error(`Lỗi lúc AI offline ${i}`);
    off.stack = `Error: Lỗi lúc AI offline ${i}\n    at (${path.resolve(__dirname, "..", "bot", "src", "handlers", "x" + i + ".js")}:${10 + i}:5)`;
    await sd.diagnoseError("unhandledRejection", off);
  }
  assert(aiCalls === 0, `AI offline → không gọi AI (gọi ${aiCalls} lần)`);
  assert(
    mutations.length === 3,
    `AI offline → không ghi mutation nào (mutation ${mutations.length})`,
  );

  // AI hồi phục → lỗi mới vẫn phải chẩn đoán được (hạn mức còn nguyên).
  aiMod.researchAvailable = () => true;
  const back = new Error("Lỗi sau khi AI hồi phục");
  back.stack = `Error: Lỗi sau khi AI hồi phục\n    at (${path.resolve(__dirname, "..", "bot", "src", "handlers", "back.js")}:7:1)`;
  await sd.diagnoseError("unhandledRejection", back);
  assert(
    mutations.length === 4,
    `AI hồi phục → vẫn còn suất chẩn đoán (mutation ${mutations.length}, mong đợi 4)`,
  );
  aiMod.researchChat = realResearchChat;

  // ---- 6. AI trả rác → bot không vỡ, vẫn ghi 1 mutation với mức mặc định ----
  // `severity` lạ phải rơi về "medium" (không rò severity tự do lên dashboard),
  // JSON hỏng thì bỏ qua lượt đó chứ không ném ra ngoài.
  const okChat = realResearchChat;
  aiMod.researchChat = async () => JSON.stringify({ severity: "CỰC KỲ NGHIÊM TRỌNG", cause: "x" });
  const junk = new Error("AI trả severity lạ");
  junk.stack = `Error: AI trả severity lạ\n    at (${path.resolve(__dirname, "..", "bot", "src", "handlers", "junk.js")}:3:1)`;
  await sd.diagnoseError("unhandledRejection", junk);
  assert(mutations.length === 5, "AI trả severity lạ → vẫn ghi mutation");
  assert(
    mutations[4]?.args.severity === "medium",
    `severity lạ → rơi về medium (thực tế ${mutations[4]?.args.severity})`,
  );

  aiMod.researchChat = async () => "không phải JSON";
  const broken = new Error("AI trả rác");
  broken.stack = `Error: AI trả rác\n    at (${path.resolve(__dirname, "..", "bot", "src", "handlers", "broken.js")}:4:1)`;
  await sd.diagnoseError("unhandledRejection", broken);
  assert(mutations.length === 5, "AI trả rác → bỏ qua lượt đó, không vỡ");

  // ---- 7. Đăng embed đề xuất: guild chưa bật kênh log → bỏ qua, không vỡ ----
  // Dùng bản module SẠNG (xoá require.cache) để có hạn mức 5 lượt/giờ nguyên —
  // các kịch bản trên đã dùng hết, nếu không lượt này chỉ bị chặn vì cap.
  const sdPath = require.resolve("../bot/src/handlers/selfDiagnose.js");
  delete require.cache[sdPath];
  const sd2 = require(sdPath);
  const mutations2 = [];
  const store2 = {
    client: {
      mutation: async (n, a) => mutations2.push({ name: n, args: a }),
      query: async () => null,
    },
    getConfig: async () => null, // server chưa bật kênh log
  };
  const client2 = {
    guilds: {
      cache: new Map([["g-no-log", { id: "g-no-log", name: "Không log" }]]),
    },
  };
  sd2.attach(client2, store2);
  sd2.setEnabledFromJobs({ enabled: true });
  aiMod.researchChat = okChat;
  const posted = new Error("Lỗi cần đăng đề xuất");
  posted.stack = `Error: Lỗi cần đăng đề xuất\n    at (${path.resolve(__dirname, "..", "bot", "src", "handlers", "post.js")}:5:1)`;
  await sd2.diagnoseError("unhandledRejection", posted);
  assert(mutations2.length === 1, "guild chưa bật log → vẫn ghi mutation, không vỡ");
  await sd2.diagnoseError("unhandledRejection", "reason dạng string");
  assert(mutations2.length === 1, "bản module mới: cooldown vẫn giữ nguyên hành vi");
}

main()
  .then(() => {
    console.log(`Kết quả self-diagnose: ${pass} PASS, ${fail} FAIL`);
    process.exit(fail > 0 ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
