// TEST: hợp đồng tham số bot → Convex.
// Bot gọi store.client.mutation/query/action("file:fn", { ...args }) nhưng Convex
// dùng validator v.object() và TỪ CHỐI field lạ (ArgumentValidationError). Vì vậy
// mọi key bot gửi PHẢI có trong `args:` của function tương ứng, nếu không lệnh
// chạy thật sẽ lỗi câm (chỉ thấy trong error.log VPS).
//
// Đã từng xảy ra:
//   - bot_writes:botUpdateSettings nhận 5 field alt detection (altDetectionEnabled,
//     altPunish, altMaxRiskScore, altVpnMode, vpnBlockEnabled) → /alt * hỏng.
//   - bot_writes:botSetBackupRequest nhận includeMessages → auto-backup hỏng.
// Test này quét tĩnh toàn bộ bot/src, đối chiếu với validator convex/*.ts để chặn
// tái diễn mà không cần chạy Convex thật.
//
// Chạy: node scripts/test-convex-arg-contract.cjs

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const botSrc = path.join(root, "bot", "src");
const convexDir = path.join(root, "convex");

let pass = 0;
let fail = 0;
const check = (name, cond, detail) => {
  if (cond) {
    pass++;
    console.log(`PASS ${name}`);
  } else {
    fail++;
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

/**
 * Bỏ comment + string/template literal (giữ cấu trúc ngoặc) để parser không bắt
 * nhầm `key:` nằm trong chuỗi (vd summary: `... risk: 70 ...`).
 */
function strip(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && n === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === q) {
          i++;
          break;
        }
        i++;
      }
      out += " ";
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Lấy tên key ở tầng ngoài cùng của một object block (đã bỏ string/comment). */
function topKeys(block) {
  const keys = new Set();
  let depth = 0;
  let buf = "";
  let hadColon = false;
  const flush = () => {
    const t = buf.trim();
    // shorthand `{ includeMessages, pushToGithub }` chỉ hợp lệ khi segment KHÔNG
    // có dấu ':' (nếu có thì token cuối là value, vd `count: 1` → "1").
    if (!hadColon && /^[A-Za-z0-9_$]+$/.test(t)) keys.add(t);
    buf = "";
    hadColon = false;
  };
  for (const ch of block) {
    if ("{[(".includes(ch)) depth++;
    else if ("}])".includes(ch)) depth--;
    if (ch === ":" && depth === 0) {
      const k = buf.trim().split(/\s/).pop();
      if (/^[A-Za-z0-9_$]+$/.test(k)) keys.add(k);
      buf = "";
      hadColon = true;
      continue;
    }
    if (ch === "," && depth === 0) {
      flush();
      continue;
    }
    buf += ch;
  }
  flush();
  return keys;
}

/** Vị trí '}' đóng block mở ở `braceStart` (cấu trúc ngoặc còn nguyên sau strip). */
function blockEnd(src, braceStart) {
  let depth = 0;
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (!depth) return i;
    }
  }
  return src.length;
}

/** Parse convex/*.ts → Map(fnName → Set(argNames)). */
function convexFns(file) {
  const src = strip(fs.readFileSync(file, "utf8"));
  // Đợt #5 tách thân hàm sang module con (vd `convex/guilds/*.ts`): validator nằm
  // ở file con (`export const xArgs = {…}`), wrapper ở file gốc viết `args: xArgs`
  // → gom cả file con để vẫn đọc được hợp đồng, không nới lỏng check.
  const subDir = path.join(path.dirname(file), path.basename(file, ".ts"));
  const sources = [src];
  try {
    for (const e of fs.readdirSync(subDir)) {
      if (e.endsWith(".ts")) sources.push(strip(fs.readFileSync(path.join(subDir, e), "utf8")));
    }
  } catch {
    // chưa tách file con — bình thường
  }
  // Bảng tra `export const xArgs = {…}` để giải `args: xArgs`.
  const argObjs = new Map();
  for (const s of sources) {
    const reC = /export\s+const\s+([A-Za-z0-9_$]+)\s*=\s*\{/g;
    let mc;
    while ((mc = reC.exec(s))) {
      const bs = s.indexOf("{", mc.index);
      argObjs.set(mc[1], topKeys(s.slice(bs + 1, blockEnd(s, bs))));
    }
  }
  const map = new Map();
  for (const s of sources) {
    const re = /export\s+const\s+([A-Za-z0-9_$]+)\s*=\s*(query|mutation|action)\s*\(/g;
    let m;
    while ((m = re.exec(s))) {
      const argsIdx = s.indexOf("args:", m.index + m[0].length);
      if (argsIdx === -1) {
        map.set(m[1], new Set());
        continue;
      }
      const ident = s
        .slice(argsIdx + "args:".length)
        .trimStart()
        .match(/^([A-Za-z0-9_$]+)\s*(?:,|\})/);
      // `args: {…}` literal HOẶC `args: xArgs` trỏ tới object export; không tra
      // được thì trả set RỖNG để FAIL to (không im lặng cho qua).
      let keys;
      if (ident && argObjs.has(ident[1])) {
        keys = argObjs.get(ident[1]);
      } else {
        const braceStart = s.indexOf("{", argsIdx);
        keys =
          braceStart === -1 ? new Set() : topKeys(s.slice(braceStart + 1, blockEnd(s, braceStart)));
      }
      map.set(m[1], keys);
    }
  }
  return map;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}

const cache = new Map();
const fnsOf = (f) => {
  if (!cache.has(f)) cache.set(f, convexFns(f));
  return cache.get(f);
};

const mismatches = [];
for (const f of walk(botSrc)) {
  // Quét trên source GỐC để không mất tên function nằm trong string literal
  // ("file:fn"); chỉ strip riêng phần block args trước khi bóc key để tránh bắt
  // nhầm `key:` trong template string (vd summary: "... risk: 70 ...").
  const src = fs.readFileSync(f, "utf8");
  const re = /\.(mutation|query|action)\(\s*["']([A-Za-z0-9_$]+):([A-Za-z0-9_$]+)["']\s*,\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const braceStart = m.index + m[0].length - 1;
    let depth = 0;
    let i = braceStart;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") {
        depth--;
        if (!depth) break;
      }
    }
    const keys = topKeys(strip(src.slice(braceStart + 1, i)));
    const cfile = path.join(convexDir, m[2] + ".ts");
    if (!fs.existsSync(cfile)) {
      mismatches.push(`${path.relative(root, f)}: convex/${m[2]}.ts không tồn tại`);
      continue;
    }
    const fns = fnsOf(cfile);
    if (!fns.has(m[3])) {
      mismatches.push(`${path.relative(root, f)}: ${m[2]}:${m[3]} không export`);
      continue;
    }
    const declared = fns.get(m[3]);
    for (const k of keys) {
      if (!declared.has(k)) {
        mismatches.push(
          `${path.relative(root, f)}: ${m[2]}:${m[3]} gửi "${k}" nhưng validator không nhận`,
        );
      }
    }
  }
}

check(
  "mọi tham số bot gửi Convex đều có trong validator",
  mismatches.length === 0,
  mismatches.join(" | "),
);

// Chốt trực tiếp 2 hồi quy đã xảy ra thật (bổ sung cho phép quét tổng quát).
const bw = fnsOf(path.join(convexDir, "bot_writes.ts"));
for (const k of [
  "altDetectionEnabled",
  "altPunish",
  "altMaxRiskScore",
  "altVpnMode",
  "vpnBlockEnabled",
]) {
  check(`botUpdateSettings nhận "${k}"`, bw.get("botUpdateSettings")?.has(k));
}
check(
  'botSetBackupRequest nhận "includeMessages"',
  bw.get("botSetBackupRequest")?.has("includeMessages"),
);

// ── Chiều ngược: field bot ĐỌC từ config phải được getBotConfig TRẢ VỀ ─────────
// bot gọi store.getConfig() → convex guilds:getBotConfig. Nếu bot đọc một field
// mà query không trả về, giá trị luôn undefined → cấu hình chết lặng (bug
// actionBudgetPerMinute: preset ghi vào DB nhưng bot không bao giờ thấy).
{
  const guildsSrc = fs.readFileSync(path.join(convexDir, "guilds.ts"), "utf8");
  const fnStart = guildsSrc.indexOf("export const getBotConfig");
  const retIdx = guildsSrc.indexOf("return {", fnStart);
  const modIdx = guildsSrc.indexOf("modules: modules.map", retIdx);
  const returned = new Set(
    [...guildsSrc.slice(retIdx, modIdx).matchAll(/^\s*([a-zA-Z][A-Za-z0-9_]*)\s*:/gm)].map(
      (m) => m[1],
    ),
  );
  // Field config bot đọc qua `config.X` hoặc `config?.X` (bỏ field nội bộ chỉ có
  // trong object khác — quét thô nhưng đủ bắt hồi quy field cấu hình).
  const readFields = new Set();
  for (const f of walk(botSrc)) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/\bconfig\??\.([a-zA-Z][A-Za-z0-9_]*)/g)) readFields.add(m[1]);
  }
  // Các field không đến từ getBotConfig (biến cục bộ/module config lồng nhau).
  const IGNORE = new Set([
    "modules",
    "autoReplies",
    "giveaways",
    "heatStates",
    "safetyPercent",
    "rollbackEnabled", // không có trong schema — mặc định BẬT, đọc false mới tắt
  ]);
  const missing = [...readFields].filter((k) => !returned.has(k) && !IGNORE.has(k)).sort();
  check(
    "field config bot đọc đều được getBotConfig trả về",
    missing.length === 0,
    missing.join(", "),
  );
  check('getBotConfig trả "actionBudgetPerMinute"', returned.has("actionBudgetPerMinute"));
}

// ── Validator của mutation phải KHÔNG kém validator của bảng ──
// Bug thật 05/10/2026: `budget` thêm vào aiHealth của convex/schema.ts ở
// 87e62b3 (PR #33) nhưng bản sao trong args của guilds:botSyncGuilds bị bỏ sót.
// Convex TỪ CHỐI field lạ trong tham số → botSyncGuilds fail mỗi 180s
// ("extra field `budget`"), AI health không lên dashboard. Scan bot→convex bên
// trên không bắt được vì bot gửi cả khối globalStatus, không gọi từng field.
{
  const readBlock = (file, anchor) => {
    const src = fs.readFileSync(path.join(convexDir, file), "utf8");
    const i = src.indexOf(anchor);
    if (i < 0) return "";
    let d = 0;
    let out = "";
    for (let j = src.indexOf("v.optional(", i); j < src.length; j++) {
      out += src[j];
      if (src[j] === "(") d++;
      if (src[j] === ")") {
        d--;
        if (d === 0) break;
      }
    }
    return out;
  };
  // Cấp 1: key trực tiếp của aiHealth.
  const topKeys = (blk) =>
    new Set(
      [...blk.matchAll(/^\s{6,}([a-zA-Z][a-zA-Z0-9]*):\s*v\./gm)]
        .map((m) => m[1])
        .filter((k) => k !== "available"),
    );
  const fromSchema = topKeys(readBlock("schema.ts", "aiHealth: v.optional("));
  const fromMutation = topKeys(readBlock("guilds.ts", "aiHealth: v.optional("));
  const missing = [...fromSchema].filter((k) => !fromMutation.has(k));

  check(
    missing.length === 0
      ? "aiHealth của botSyncGuilds có đủ field như schema"
      : `aiHealth thiếu field so với schema: ${missing.join(", ")}`,
    missing.length === 0,
  );

  // Cấp 2: các field con của budget phải khớp y hệt, không chỉ khác tên.
  const budgetShape = (src) => {
    const i = src.indexOf("budget: v.optional(");
    if (i < 0) return null;
    return new Set(
      [...src.slice(i, i + 700).matchAll(/([a-zA-Z][a-zA-Z0-9]*):\s*v\./g)].map((m) => m[1]),
    );
  };
  const sBudget = budgetShape(fs.readFileSync(path.join(convexDir, "schema.ts"), "utf8"));
  const gBudget = budgetShape(fs.readFileSync(path.join(convexDir, "guilds.ts"), "utf8"));
  const missBudget = sBudget && gBudget ? [...sBudget].filter((k) => !gBudget.has(k)) : ["budget"];
  check(
    missBudget.length === 0
      ? "aiHealth.budget có đủ field con như schema"
      : `aiHealth.budget thiếu field con: ${missBudget.join(", ")}`,
    missBudget.length === 0,
  );
}

// ── Args KHÔNG được đòi field mà bot không gửi ──
// Bug 05/10/2026 (phát sinh sau ee36db1): args của guilds:botSyncGuilds khai
// `reportedAt: v.number()` BẮT BUỘC, nhưng `aiStats()` KHÔNG gửi field đó —
// server tự ghi ở `statusPatch.aiHealth = { ...aiHealth, reportedAt: now }` để
// bot không thể giả mạo mốc thời gian. Convex validate args TRƯỚC khi chạy
// handler → ArgumentValidationError, mỗi 180s, cả vòng sync chết.
//
// Hai khối test ngay trên vẫn XANH khi bug còn: chúng chỉ so schema↔args với
// nhau, chưa BAO GIỜ so với payload bot thật. Test này gọi chính aiStats() để
// bịt đúng lỗ hổng đó — payload bot là mốc, không phải schema.
{
  /** Cắt khối cân bằng ngoặc bắt đầu từ `anchor` (dùng cho v.object lồng nhau). */
  const balanced = (src, anchor) => {
    const i = src.indexOf(anchor);
    if (i < 0) return "";
    let d = 0;
    let out = "";
    for (let j = src.indexOf("(", i); j < src.length; j++) {
      out += src[j];
      if (src[j] === "(") d++;
      if (src[j] === ")") {
        d--;
        if (d === 0) break;
      }
    }
    return out;
  };
  /**
   * Key TRỤC TIẾP của một khối + cờ bắt buộc.
   * Dùng THỤT LỀ của field mốc (`seedKey`) để không lẫn field con: regex so
   * thụt lề ">= N" sẽ nuốt luôn field lồng sâu hơn và sinh báo động giả.
   */
  const directFields = (blk, seedKey) => {
    const m = blk.match(new RegExp(`^(\\s*)${seedKey}:`, "m"));
    if (!m) return null;
    const indent = m[1].length;
    const re = new RegExp(`^ {${indent}}([a-zA-Z][a-zA-Z0-9]*):\\s*v\\.(optional\\()?`, "gm");
    const all = [];
    for (const hit of blk.matchAll(re)) all.push([hit[1], !hit[2]]);
    return { all, required: all.filter(([, req]) => req).map(([k]) => k) };
  };

  const guildsSrc = fs.readFileSync(path.join(convexDir, "guilds.ts"), "utf8");
  const aiBlk = balanced(guildsSrc, "aiHealth: v.optional(");
  const aiArgs = directFields(aiBlk, "available");

  // Payload THẬT bot gửi — không hard-code, để test đỏ đúng lúc aiStats() đổi.
  let sent = null;
  try {
    const { aiStats } = require(path.join(root, "bot", "src", "ai.js"));
    sent = aiStats();
  } catch (e) {
    // Không bỏ qua âm thầm: hỏng ở đây nghĩa là mất lớp bảo vệ, phải đỏ.
    check(`nạp được aiStats() để so payload thật — ${e.message}`, false);
  }

  if (sent && aiArgs) {
    const sentTop = Object.keys(sent).filter((k) => sent[k] !== undefined);
    const requiredNotSent = aiArgs.required.filter((k) => !sentTop.includes(k));
    check(
      requiredNotSent.length === 0
        ? "args botSyncGuilds không đòi field nào aiStats() không gửi"
        : `args botSyncGuilds đòi BẮT BUỘC nhưng aiStats() không gửi: ${requiredNotSent.join(", ")}`,
      requiredNotSent.length === 0,
    );

    // Chiều ngược lại: field bot gửi mà args chưa khai → Convex báo "extra field".
    const declared = new Set(aiArgs.all.map(([k]) => k));
    const undeclared = sentTop.filter((k) => !declared.has(k));
    check(
      undeclared.length === 0
        ? "mọi field aiStats() gửi đều được args khai báo"
        : `aiStats() gửi field chưa có trong args (Convex sẽ báo extra field): ${undeclared.join(", ")}`,
      undeclared.length === 0,
    );
  }

  // budget: field con bắt buộc cũng phải có mặt trong payload bot thật.
  const budgetBlk = balanced(aiBlk, "budget: v.optional(");
  const budgetArgs = directFields(budgetBlk, "day");
  if (sent && sent.budget && budgetArgs) {
    const sentBudget = Object.keys(sent.budget).filter((k) => sent.budget[k] !== undefined);
    const missReq = budgetArgs.required.filter((k) => !sentBudget.includes(k));
    check(
      missReq.length === 0
        ? "args aiHealth.budget không đòi field nào budgetSummary() không gửi"
        : `args aiHealth.budget đòi BẮT BUỘC nhưng budgetSummary() không gửi: ${missReq.join(", ")}`,
      missReq.length === 0,
    );
  }
}

// ── Chạy VALIDATOR THẬT với PAYLOAD THẬT (đệ quy, có kiểu) ──────────────────
// Các khối trên chỉ so TÊN field ở cấp ngoài. Convex thì kiểm tra MẠNH hơn:
// thừa field / thiếu field bắt buộc / SAI KIỂU trong object lồng và phần tử
// mảng đều giết mutation. Cổng dùng chung nằm ở scripts/check-bot-payload.cjs
// để không viết trùng bộ dựng validator + walker.
{
  const { runChecks } = require("./check-bot-payload.cjs");
  for (const r of runChecks()) check(r.name, r.ok, r.detail);
}

console.log(`\nKết quả: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
