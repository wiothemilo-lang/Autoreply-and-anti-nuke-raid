/**
 * selfDiagnose.js — Self-Diagnose: bot TỰ DÒ LỖI runtime qua AI.
 *
 * Luồng hoạt động:
 *  1. index.js đăng ký process.on("unhandledRejection"/"uncaughtException")
 *     → gọi diagnoseError(kind, reason) cho MỌI lỗi runtime.
 *  2. Lỗi được fingerprint (thông điệp + file gốc trong bot/src) — cùng 1 lỗi
 *     chỉ chẩn đoán 1 LẦN/GIỜ (chống đốt token khi lỗi lặp vô hạn).
 *  3. AI chẩn đoán (chuỗi research: Kira/Mimo V2.5 free 30M tokens/ngày —
 *     KHÔNG đụng hạn mức Groq/NVIDIA của chống raid): nguyên nhân + cách sửa
 *     + diff đề xuất (~1-3k tokens/lượt).
 *  4. Ghi thống kê 1 mutation rẻ (selfDiagnose:botRecordDiagnose) + đăng embed
 *     ĐỀ XUẤT vào kênh log chung (tối đa 3 server).
 *
 * AN TOÀN QUAN TRỌNG: kết quả CHỈ LÀ ĐỀ XUẤT đăng kênh log — bot KHÔNG TỰ ÁP
 * patch, KHÔNG TỰ RESTART. Người vận hành duyệt rồi sửa code thủ công.
 *
 * Chi phí 0 khi: tắt (flag từ batch tick 60s sẵn có), không lỗi, hoặc lỗi đã
 * chẩn đoán trong 1 giờ. Flag đồng bộ qua setEnabledFromJobs từ tick.js.
 */

const fs = require("fs");
const path = require("path");

/** Cùng 1 lỗi (cùng fingerprint) chỉ chẩn đoán 1 lần/giờ. */
const COOLDOWN_MS = 60 * 60 * 1000;
/** Chỉ số lỗi KHÁC nhau tối đa được chẩn đoán mỗi giờ (chống nổ nhiều lỗi liên tiếp đốt token). */
const MAX_RUNS_PER_HOUR = 5;
/** Số guild tối đa nhận embed đề xuất. */
const MAX_GUILDS = 3;

let client = null;
let store = null;
let enabled = false;
let inFlight = false;
/** fingerprint -> lần chẩn đoán gần nhất (ms). */
const recent = new Map();
/** Dấu thời gian các lượt đã chạy (dọn khi quá 1 giờ) — để cap MAX_RUNS_PER_HOUR. */
const runTimestamps = [];

/** Bật/tắt từ batch tick (tick.js gửi jobs.selfDiagnose mỗi 60s). Input rác → giữ trạng thái cũ. */
function setEnabledFromJobs(jobs) {
  try {
    if (jobs && typeof jobs === "object" && typeof jobs.enabled === "boolean") {
      enabled = jobs.enabled;
    }
  } catch {
    // không bao giờ để flag sync làm vỡ tick
  }
}

/** Gắn client + store (gọi trong clientReady) — để đăng đề xuất vào kênh log. */
function attach(clientRef, storeRef) {
  client = clientRef;
  store = storeRef;
}

/**
 * Fingerprint lỗi: thông điệp (chuẩn hoá số) + file bot/src đầu tiên trong stack.
 * Cùng lỗi cùng vị trí → cùng fp; khác lỗi hoặc khác file → fp khác.
 */
function fingerprintOf(reason) {
  const msg = String(reason?.message ?? reason ?? "")
    .slice(0, 160)
    .toLowerCase()
    .replace(/\d+/g, "#");
  const frames = String(reason?.stack ?? "")
    .split("\n")
    .map((l) => l.trim());
  const botFrame = frames.find((l) => l.includes(".js") && l.includes("bot")) ?? frames[1] ?? "";
  const loc = (botFrame.match(/([^\s(/\\]+\.(?:js|cjs|mjs)):\d+:\d+/) || [])[1] ?? "unknown";
  return `${msg}::${loc}`.slice(0, 200);
}

/** Đọc đoạn code quanh vị trí lỗi từ đĩa (best effort — dùng cho prompt AI). */
function codeContextOf(reason) {
  try {
    const frames = String(reason?.stack ?? "").split("\n");
    for (const line of frames) {
      const m = line.match(/\(?([^\s()]+\.js):(\d+):\d+\)?/);
      if (!m) continue;
      const file = m[1];
      if (!file.includes("bot") || !fs.existsSync(file)) continue;
      const lineNo = Number(m[2]);
      const src = fs.readFileSync(file, "utf8").split("\n");
      const from = Math.max(0, lineNo - 6);
      const snippet = src
        .slice(from, lineNo + 4)
        .map(
          (l, i) =>
            `${from + i + 1 === lineNo ? "→" : " "}${String(from + i + 1).padStart(5)}| ${l.slice(0, 160)}`,
        )
        .join("\n")
        .slice(0, 1200);
      return { file: path.basename(file), line: lineNo, snippet };
    }
  } catch {
    // đọc code lỗi — không chặn chẩn đoán
  }
  return null;
}

/** Chẩn đoán 1 lỗi: kiểm flag → fingerprint/cooldown → AI → ghi Convex → đăng kênh log. */
async function diagnoseError(kind, reason) {
  try {
    if (!enabled) return;
    if (inFlight) return;
    // Chỉ xử lý Error thật (có stack/message) — chuỗi/giá trị lạ bỏ qua im lặng.
    if (!reason || typeof reason !== "object" || typeof reason.stack !== "string") return;

    inFlight = true;
    try {
      const fp = fingerprintOf(reason);
      const last = recent.get(fp) ?? 0;
      if (Date.now() - last < COOLDOWN_MS) return; // lỗi đã chẩn đoán — không đốt token
      // AI có sẵn không? Kiểm TRƯỚC khi ăn hạn mức: lỗi lúc AI offline không tốn
      // token nào, nên không có lý nó ghi vào bộ đếm MAX_RUNS_PER_HOUR. Trước đây
      // 5 lỗi phát sinh lúc provider chết là đủ để chặn cả giờ sau khi AI hồi
      // phục — self-diagnose im lặng đúng lúc bot đang lỗi.
      const ai = require("../ai");
      const available =
        typeof ai.researchAvailable === "function" ? ai.researchAvailable() : ai.aiAvailable();
      if (!available) return;
      // Cap toàn cục: quá MAX_RUNS_PER_HOUR lượt khác nhau trong 1 giờ → dừng.
      while (runTimestamps.length && Date.now() - runTimestamps[0] > COOLDOWN_MS)
        runTimestamps.shift();
      if (runTimestamps.length >= MAX_RUNS_PER_HOUR) return;
      // Đánh dấu TRƯỚC khi gọi AI: lỗi lặp vô hạn vẫn chỉ tốn tối đa 1 lượt AI/giờ.
      // Giữ nguyên thứ tự này (sau khi đã biết AI sẵn sàng) — hai lỗi cùng
      // fingerprint phát sinh liên tiếp vẫn chỉ tốn 1 lượt.
      recent.set(fp, Date.now());
      runTimestamps.push(Date.now());
      if (recent.size > 120) {
        for (const [k, ts] of recent) {
          if (Date.now() - ts > COOLDOWN_MS) recent.delete(k);
        }
      }

      const ctx = codeContextOf(reason);
      const system = `Bạn là kỹ sư bảo trì bot Discord Node.js (discord.js v14). Nhận 1 lỗi runtime kèm stack + đoạn code liên quan. NHIỆM VỤ: chẩn đoán nguyên nhân gốc và đề xuất cách sửa NGẮN GỌN.
Chỉ trả JSON thuần (không markdown): {"severity":"high|medium|low","cause":"nguyên nhân gốc, tối đa 2 câu tiếng Việt","fix":"cách sửa cụ thể tiếng Việt","diff":"diff nhỏ đề xuất dạng - dòng cũ\\n+ dòng mới (hoặc chuỗi rỗng nếu không chắc)"}
severity: "high" nếu có thể crash/anh hưởng chống raid, "medium" nếu lỗi logic cục bộ, "low" nếu chỉ là cảnh báo nhẹ.`;
      const user = `Loại lỗi: ${kind}
Thông điệp: ${String(reason?.message ?? "").slice(0, 300)}
Stack (rút gọn):
${String(reason.stack).split("\n").slice(0, 8).join("\n").slice(0, 1000)}
${ctx ? `\nĐoạn code tại ${ctx.file}:${ctx.line}:\n${ctx.snippet}` : ""}`;
      const raw = await ai.researchChat(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        { maxTokens: 900, temperature: 0.2 },
      );
      const parsed = require("../ai").extractJson(raw);
      if (!parsed) return;

      const severity = ["high", "medium", "low"].includes(parsed.severity)
        ? parsed.severity
        : "medium";
      const cause = String(parsed.cause ?? "").slice(0, 800);
      const fix = String(parsed.fix ?? "").slice(0, 800);
      const diff = String(parsed.diff ?? "").slice(0, 800);

      // 1 mutation rẻ — thống kê cho panel Admin (tần suất thấp nhờ cooldown).
      await store?.client
        ?.mutation("selfDiagnose:botRecordDiagnose", {
          fingerprint: fp,
          severity,
          summary: `${kind}: ${cause}`.slice(0, 500),
        })
        .catch(() => null);

      // Đăng ĐỀ XUẤT vào kênh log chung (không tự áp).
      await postProposal(kind, reason, { severity, cause, fix, diff }, ctx).catch(() => {});
    } finally {
      inFlight = false;
    }
  } catch {
    // xử lý lỗi toàn cục — tuyệt đối không throw ra ngoài
  }
}

/** Đăng embed đề xuất vá vào kênh log chung của tối đa 3 server. */
async function postProposal(kind, reason, { severity, cause, fix, diff }, ctx) {
  if (!client?.guilds?.cache) return;
  const { logEmbed, sendLog, Colors } = require("../util");
  const color =
    severity === "high" ? Colors.Red : severity === "medium" ? Colors.Orange : Colors.Yellow;
  const fields = [
    { name: "Loại lỗi", value: String(kind).slice(0, 100), inline: true },
    { name: "Vị trí", value: ctx ? `\`${ctx.file}:${ctx.line}\`` : "không rõ", inline: true },
    { name: "Mức độ", value: severity, inline: true },
    { name: "Nguyên nhân (AI)", value: cause || "—", inline: false },
    { name: "Cách sửa đề xuất", value: fix || "—", inline: false },
  ];
  if (diff)
    fields.push({
      name: "Diff đề xuất",
      value: `\`\`\`diff\n${diff.slice(0, 700)}\n\`\`\``,
      inline: false,
    });
  const embed = logEmbed({
    title: "🩺 Self-Diagnose: đề xuất vá lỗi runtime",
    description: `Lỗi: \`${String(reason?.message ?? reason ?? "").slice(0, 300)}\`\n⚠️ **Chỉ là ĐỀ XUẤT từ AI (Mimo V2.5)** — bot không tự sửa code. Người vận hành duyệt rồi áp dụng.`,
    color,
    fields,
    footer: "Protogon · Self-Diagnose",
  });
  let sent = 0;
  for (const guild of client.guilds.cache.values()) {
    if (sent >= MAX_GUILDS) break;
    try {
      const config = await store?.getConfig?.(guild.id);
      if (!config) continue;
      await sendLog(guild, config, embed, "general");
      sent++;
    } catch {
      // guild chưa set log — bỏ qua
    }
  }
}

module.exports = { attach, setEnabledFromJobs, diagnoseError };
