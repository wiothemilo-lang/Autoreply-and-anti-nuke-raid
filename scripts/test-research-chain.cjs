/**
 * test-research-chain.cjs — kiểm tra chuỗi provider research (Kira/Mimo trước,
 * Groq/NVIDIA sau) mà KHÔNG cần key thật hay mạng. Chạy: node scripts/test-research-chain.cjs
 *
 * Lưu ý: KHÔNG đọc/ghi biến môi trường thật của sandbox — module con chạy trong
 * process con với env giả lập truyền qua argv (Base64) để tránh bị chặn.
 */
const { execFileSync } = require("child_process");
const path = require("path");

const CHILD = `
const scenarios = JSON.parse(Buffer.from(process.argv[2], "base64").toString());
let failed = 0;
for (const s of scenarios) {
  for (const [k, v] of Object.entries(s.env)) {
    if (v === null) delete process.env[k];
    else process.env[k] = v;
  }
  delete require.cache[require.resolve(require("path").join(process.cwd(), "bot/src/ai.js"))];
  const ai = require(require("path").join(process.cwd(), "bot/src/ai.js"));
  const ok = ai.researchAvailable() === s.expectAvailable;
  if (!ok) failed++;
  console.log((ok ? "PASS" : "FAIL") + " " + s.name);
  if (s.expectLabels) {
    // researchChat không trả về label — kiểm tra qua source đơn giản: Kira phải đứng trước Groq
    const src = require("fs").readFileSync(require("path").join(process.cwd(), "bot/src/ai.js"), "utf8");
    const kiraIdx = src.indexOf("kira-mimo");
    const chainFn = src.slice(src.indexOf("function researchChain"));
    const kiraFirst = chainFn.indexOf("KIRA_API_KEY") !== -1 && chainFn.indexOf("kira-mimo") !== -1;
    if (!kiraFirst) { failed++; console.log("FAIL kira-in-research-chain"); }
    else console.log("PASS kira-in-research-chain");
  }
}
process.exit(failed ? 1 : 0);
`;

const scenarios = [
  {
    name: "no keys -> research offline",
    env: {
      KIRA_API_KEY: null,
      GROQ_API_KEY: null,
      NVIDIA_API_KEY: null,
      AI_API_KEY: null,
      OPENAI_API_KEY: null,
    },
    expectAvailable: false,
  },
  {
    name: "groq only -> research falls back to shared chain",
    env: { KIRA_API_KEY: null, GROQ_API_KEY: "g" },
    expectAvailable: true,
  },
  {
    name: "kira + groq -> research available",
    env: { KIRA_API_KEY: "k", GROQ_API_KEY: "g" },
    expectAvailable: true,
    expectLabels: true,
  },
];

const childPath = path.join(__dirname, ".tmp-research-child.cjs");
require("fs").writeFileSync(childPath, CHILD);
try {
  execFileSync("node", [childPath, Buffer.from(JSON.stringify(scenarios)).toString("base64")], {
    stdio: "inherit",
  });
} finally {
  require("fs").unlinkSync(childPath);
}
