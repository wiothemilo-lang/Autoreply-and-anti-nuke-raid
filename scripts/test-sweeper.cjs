// Test vòng dọn CHUNG của tiến trình bot (bot/src/sweeper.js, đợt #4):
//   - Engine: đếm hạn theo chu kỳ RIÊNG của từng việc (không phải nhịp quét),
//     lỗi của một việc không nuốt và không chặn việc khác, startSweeper idempotent
//     và chỉ tạo MỘT timer.
//   - Hành vi thật của sweeper đã tách: captcha hết hạn, dữ liệu voice IP cũ.
//   - Chặn hồi quy kiến trúc: 5 module dọn RAM KHÔNG được tự dựng setInterval
//     nữa; chu kỳ khai báo phải khớp hành vi cũ; index.js phải gọi startSweeper.
// Chạy: node scripts/test-sweeper.cjs
const path = require("path");
const DJS_MOCK = require("./support/djs-mock-path.cjs");

const Module = require("module");
const fs = require("fs");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "discord.js") return DJS_MOCK;
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
module.exports = { Colors: new Proxy({}, { get: () => 0x000000 }), EmbedBuilder, PermissionFlagsBits: { ManageGuild: 1n << 5n, Administrator: 1n << 3n }, AuditLogEvent: new Proxy({}, { get: () => 1 }) };
`,
);

const BOT = path.join(__dirname, "..", "bot", "src");
const sweeper = require(path.join(BOT, "sweeper.js"));

let pass = 0;
let fail = 0;
const check = (label, ok) => {
  console.log(ok ? `PASS ${label}` : `FAIL ${label}`);
  ok ? pass++ : fail++;
};
const readBot = (rel) => fs.readFileSync(path.join(BOT, rel), "utf8");

(async () => {
  // ═══ 1. Engine: đếm hạn theo chu kỳ riêng ═══
  sweeper.resetSweeper();
  const ran = [];
  sweeper.registerSweep("nhanh", () => ran.push("nhanh"), 20_000);
  sweeper.registerSweep("cham", () => ran.push("cham"), 300_000);

  const t0 = 1_700_000_000_000;
  // Lượt đầu MỌI việc đều "tới hạn" (nextAt = 0) → nên chạy cả hai, rồi mỗi
  // việc tự lên lịch theo chu kỳ RIÊNG của nó.
  check(
    "lượt đầu: cả hai việc tới hạn đều chạy",
    JSON.stringify(sweeper.runDueSweeps(t0)) === '["nhanh","cham"]',
  );
  check(
    "lượt kế 19s: chưa việc nào tới hạn",
    JSON.stringify(sweeper.runDueSweeps(t0 + 19_000)) === "[]",
  );
  check(
    "lượt kế 20s: chỉ việc 20s chạy",
    JSON.stringify(sweeper.runDueSweeps(t0 + 20_000)) === '["nhanh"]',
  );
  check(
    "lượt kế 4p59s: việc 5p vẫn im",
    JSON.stringify(sweeper.runDueSweeps(t0 + 299_000)) === '["nhanh"]',
  );
  check(
    "lượt kế 5p: việc 5p chạy",
    JSON.stringify(sweeper.runDueSweeps(t0 + 300_000)) === '["cham"]',
  );
  check(
    "lượt kế 9p: việc 5p KHÔNG chạy lại sớm",
    JSON.stringify(sweeper.runDueSweeps(t0 + 540_000)) === '["nhanh"]',
  );
  check(
    "lượt kế 10p: việc 5p chạy đúng 2 lần",
    JSON.stringify(sweeper.runDueSweeps(t0 + 600_000)) === '["nhanh","cham"]',
  );
  check(
    "tổng số lần chạy khớp số lượt quét (nhanh 5, cham 3)",
    ran.filter((r) => r === "nhanh").length === 5 && ran.filter((r) => r === "cham").length === 3,
  );

  // ═══ 2. Lỗi của một việc không nuốt, không chặn việc khác ═══
  sweeper.resetSweeper();
  const okRuns = [];
  const origErr = console.error;
  const errLines = [];
  console.error = (...a) => errLines.push(a.join(" "));
  sweeper.registerSweep(
    "hỏng",
    () => {
      throw new Error("lỗi dọn giả");
    },
    20_000,
  );
  sweeper.registerSweep("tốt", () => okRuns.push(1), 20_000);
  let threw = false;
  let out;
  try {
    out = sweeper.runDueSweeps(t0);
  } catch (e) {
    threw = true;
  }
  console.error = origErr;
  check("việc hỏng KHÔNG làm runDueSweeps ném ra ngoài", threw === false);
  check("việc hỏng không tính là đã chạy", JSON.stringify(out) === '["tốt"]');
  check("việc sau vẫn chạy", okRuns.length === 1);
  check(
    "lỗi được in kèm nhãn [sweeper:hỏng]",
    errLines.some((l) => l.includes("[sweeper:hỏng]") && l.includes("lỗi dọn giả")),
  );
  check(
    "việc hỏng vẫn được lên lịch lại (không dính lỗi vĩnh viễn)",
    sweeper.sweeperState().find((s) => s.name === "hỏng").nextAt === t0 + 20_000,
  );

  // ═══ 3. registerSweep chặn đăng ký sai ═══
  const bad = [
    ["thiếu tên", () => sweeper.registerSweep("", () => {}, 1000)],
    ["fn không phải hàm", () => sweeper.registerSweep("x", 1, 1000)],
    ["chu kỳ âm", () => sweeper.registerSweep("x", () => {}, -1)],
  ];
  for (const [label, fn] of bad) {
    let msg = null;
    try {
      fn();
    } catch (e) {
      msg = e.message;
    }
    check(`registerSweep chặn: ${label}`, typeof msg === "string" && msg.length > 0);
  }

  // ═══ 4. startSweeper: MỘT timer, idempotent, unref, không giữ tiến trình ═══
  sweeper.resetSweeper();
  const realSetInterval = global.setInterval;
  const realClearInterval = global.clearInterval;
  const started = [];
  let cleared = 0;
  global.setInterval = (fn, ms) => {
    const h = realSetInterval(fn, ms);
    started.push({ fn, ms, h });
    return h;
  };
  global.clearInterval = (h) => {
    cleared += 1;
    return realClearInterval(h);
  };
  const t1 = sweeper.startSweeper();
  sweeper.startSweeper();
  sweeper.startSweeper();
  global.setInterval = realSetInterval;
  check("startSweeps chỉ tạo MỘT timer dù gọi 3 lần", started.length === 1);
  check(
    "timer quét đúng nhịp TICK_MS (20s)",
    started[0].ms === sweeper.TICK_MS && sweeper.TICK_MS === 20_000,
  );
  check("timer có unref (không giữ tiến trình)", typeof t1.unref === "function");
  sweeper.stopSweeper();
  global.clearInterval = realClearInterval;
  check("stopSweeper dọn đúng timer đã dựng", cleared === 1);
  check("stopSweeper xong thì start lại dựng timer mới", sweeper.startSweeper() !== t1);
  sweeper.resetSweeper();

  // ═══ 5. Hành vi thật: captchaStore ═══
  sweeper.resetSweeper();
  const captcha = require(path.join(BOT, "captchaStore.js"));
  captcha.setCode("g1", "u1", "123456");
  captcha.setCode("g1", "u2", "654321");
  check("captcha: sweep quá sớm không xoá", captcha.sweepExpiredCaptchas(Date.now()) === 0);
  check(
    "captcha: sweep sau 5p xoá đúng số mã hết hạn",
    captcha.sweepExpiredCaptchas(Date.now() + captcha.CAPTCHA_TTL_MS + 1_000) === 2,
  );
  check(
    "captcha: sau sweep thì mã không còn dùng được",
    captcha.verifyCode("g1", "u1", "123456").reason === "no_code",
  );

  // ═══ 6. Hành vi thật: altDetection voice IP ═══
  const alt = require(path.join(BOT, "altDetection.js"));
  alt.trackVoiceIp("g1", "u1", "1.2.3.4", "VN");
  alt.trackVoiceIp("g1", "u2", "1.2.3.4", "VN");
  check("alt: sweep quá sớm giữ nguyên dữ liệu", alt.sweepVoiceIpMap(Date.now()) === 0);
  check(
    "alt: sweep sau 24h dọn hết dữ liệu voice cũ",
    alt.sweepVoiceIpMap(Date.now() + alt.VOICE_DATA_TTL_MS + 1_000) === 2,
  );
  check(
    "alt: sau sweep không còn user nào theo IP",
    (alt.getGuildVoiceIps("g1") || []).length === 0,
  );

  // ═══ 7. 5 module đăng ký đúng tên + đúng chu kỳ ═══
  sweeper.resetSweeper();
  // Xoá cache require: hai module ở mục 5-6 đã đăng ký lúc require đầu, nạp
  // lại (không xoá cache) sẽ KHÔNG đăng ký lần hai → cổng test báo sai.
  for (const rel of ["captchaStore.js", "altDetection.js"]) {
    delete require.cache[require.resolve(path.join(BOT, rel))];
  }
  require(path.join(BOT, "captchaStore.js"));
  require(path.join(BOT, "altDetection.js"));
  require(path.join(BOT, "handlers", "filters.js"));
  require(path.join(BOT, "handlers", "interactionVerify.js"));
  const registered = Object.fromEntries(sweeper.sweeperState().map((s) => [s.name, s.everyMs]));
  check("filters đăng ký chu kỳ 5 phút", registered.filters === 300_000);
  check("interactionVerify đăng ký chu kỳ 5 phút", registered.interactionVerify === 300_000);
  check("captchaStore đăng ký chu kỳ 5 phút", registered.captchaStore === 300_000);
  check("altDetection đăng ký chu kỳ 1 giờ", registered.altDetection === 60 * 60_000);

  const antinukeSrc = readBot(path.join("handlers", "antinuke", "index.js"));
  check(
    "antinuke đăng ký sweep chu kỳ 20 giây",
    /registerSweep\(\s*"antinuke"[\s\S]{0,1200}?20_000,?\s*\)/.test(antinukeSrc),
  );

  // ═══ 8. Chặn hồi quy: 5 module KHÔNG được tự dựng setInterval ═══
  const RAM_SWEEPERS = [
    "captchaStore.js",
    path.join("handlers", "filters.js"),
    path.join("handlers", "interactionVerify.js"),
    path.join("handlers", "antinuke", "index.js"),
    "altDetection.js",
  ];
  for (const rel of RAM_SWEEPERS) {
    const src = readBot(rel);
    const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    check(`${rel}: không còn setInterval tự dựng`, !/setInterval\s*\(/.test(code));
  }
  const indexSrc = readBot("index.js");
  check("index.js gọi startSweeper (vòng dọn có mốc bắt đầu)", /startSweeper\(\)/.test(indexSrc));

  console.log(`\nKết quả sweeper: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
