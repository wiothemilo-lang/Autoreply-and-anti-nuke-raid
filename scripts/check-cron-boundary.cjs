#!/usr/bin/env node
/**
 * scripts/check-cron-boundary.cjs — Chặn cron Convex vượt ra ngoài ranh giới
 * "chỉ tính + đặt cờ" (đợt #4).
 *
 * Vì sao cần cổng:
 *  - Cron chạy trong môi trường server của Convex: KHÔNG có tiến trình bot.
 *    Một cron "thông minh" tự gửi embed, tự chạy backup hay tự ghi đè trạng
 *    thái bot là việc KHÔNG THỂ chạy — hoặc chạy được rồi hỏng âm thầm (bot
 *    không biết việc đã bị cron làm thay). Loại lỗi "im lặng" đúng kiểu dự án
 *    này đang chặn.
 *  - Quy tắc KHÔNG gõ tay danh sách field bot tự ghi: suy từ chính các handler
 *    trong `convex/bot_writes.ts` + `convex/bot_writes/*.ts` (nguồn đã có sẵn,
 *    dùng chung `collectConfigWrites`) ⇒ danh sách tự cập nhật khi bot thêm
 *    handler mới, không lệch theo thời gian.
 *
 * Luật áp cho MỌI cron đăng ký trong `convex/crons.ts`:
 *  R1. Target phải là `internalMutation` (cron không được thành cửa cho client).
 *  R2. Thân hàm không được nhận/kiểm tra `botKey` (cron không phải lối bot).
 *  R3. Không gọi function khác: `ctx.runQuery|runMutation|runAfter|scheduler|
 *      asyncWork`, `api.*`, `internal.*`.
 *  R4. Không I/O ngoài DB: `fetch(`, `ctx.storage`, `require(`, `requireEnv(`,
 *      `process.env` (không có Discord client, không có mạng tới Discord).
 *  R5. Chỉ ghi bảng `guilds`; chỉ ghi field cờ trong allowlist; field bot TỰ ghi
 *      thì chỉ được ghi `undefined` (nhả quyền sở hữu), không được ghi giá trị.
 *  R6. Key dạng `[k]:` (không biết chắc ghi field nào) → FAIL, phải khai tường minh.
 *  R7. `crons.ts` không được rỗng (cron bị xoá sạch mà cổng vẫn xanh).
 *
 * Chạy: node scripts/check-cron-boundary.cjs [--self-test]
 * Bộ tự kiểm dựng lại từng việc phá ranh giới trên NGUỒN THẬT để chứng minh cổng
 * không mù, đồng thời chứng minh cổng không bị COMMENT lừa.
 */
const fs = require("fs");
const path = require("path");

const { collectConfigWrites, stripComments, matchBlock } = require("./check-settings-signal.cjs");

const ROOT = path.resolve(__dirname, "..");
const CONVEX_DIR = path.join(ROOT, "convex");
const CRONS_REL = "crons.ts";

/** Bảng cron được phép chạm — chỉ `guilds` (document cấu hình server). */
const ALLOWED_TABLES = {
  guilds: "cron chỉ đặt cờ việc cần làm trên document cấu hình của server",
};

/**
 * Field mà cron ĐƯỢC ghi giá trị. Mỗi mục kèm lý do kiểm chứng được — đây là
 * HỢP ĐỒNG có chủ ý: thêm field mới ở đây = một quyết định đã review, không
 * phải tiện tay. Ghi `undefined` thì không cần khai (xem R5 — nhả quyền sở hữu).
 */
const ALLOWED_FLAG_FIELDS = {
  backupRequested: "cron auto-backup đặt cờ; bot xoá sau khi chạy xong (runBackupJobs)",
  backupPushToGithub: "chế độ đẩy GitHub của lần backup tự động, kế thừa từ cấu hình",
  backupIncludeMessages: "bản backup tự động có kèm tin nhắn hay không (kế thừa bản gần nhất)",
  reportRequestedAt: "cron báo cáo ngày đặt cờ; bot xoá qua botSetReportAt sau khi gửi",
  updatedAt: "mốc sửa document, dùng để dashboard nhận biết có thay đổi",
};

/** Không được xuất hiện trong thân hàm cron (ngoài comment). */
/**
 * Field MỌI bên đều ghi (metadata của document) — không phải trạng thái riêng
 * của bot, nên cron ghi không tính là tranh chấp quyền sở hữu.
 */
const SHARED_METADATA_FIELDS = {
  updatedAt: "mốc sửa document — dashboard, bot, cron đều ghi; không phải trạng thái sở hữu",
};

/** Không được xuất hiện trong thân hàm cron (ngoài comment). */
const FORBIDDEN = [
  {
    re: /requireBotKey|botKey/,
    msg: "không được nhận/kiểm tra botKey — cron không phải lối vào của bot",
  },
  {
    re: /ctx\.(?:runQuery|runMutation|runAfter|scheduler|asyncWork|runBatch|retryWithBackoff)\b/,
    msg: "không được gọi function khác (chỉ đọc/ghi DB được)",
  },
  {
    re: /\b(?:api|internal)\.[A-Za-z0-9_]+\./,
    msg: "không được gọi function khác qua api.*/internal.*",
  },
  { re: /\bfetch\s*\(/, msg: "không được gọi mạng (cron không có Discord client)" },
  { re: /ctx\.storage\b/, msg: "không được đụng storage" },
  { re: /\brequire(?:Env)?\s*\(/, msg: "không được require/đọc env lúc chạy" },
  { re: /process\.env\b/, msg: "không được đọc process.env" },
];

/** Mọi field của bảng guilds trong schema (nguồn chân lý cho phép ghi). */
function guildSchemaFields() {
  const schema = fs.readFileSync(path.join(CONVEX_DIR, "schema.ts"), "utf8");
  const tStart = schema.indexOf("guilds: defineTable({");
  if (tStart < 0) throw new Error("không tìm thấy bảng guilds trong convex/schema.ts");
  const tEnd = matchBlock(schema, schema.indexOf("{", tStart));
  return new Set(
    [...schema.slice(tStart, tEnd + 1).matchAll(/^\s{4}([A-Za-z][A-Za-z0-9_]*)\s*:/gm)].map(
      (m) => m[1],
    ),
  );
}

/**
 * Field mà BOT tự ghi GIÁ TRỊ — suy từ thân hàm thật trong `bot_writes.ts` +
 * `bot_writes/*.ts` (không gõ tay). Cron ghi đè các field này = tranh chấp quyền
 * sở hữu với tiến trình bot, đúng thứ hỏng âm thầm.
 *
 * Phân biệt quan trọng: bot thường chỉ XOÁ cờ (`backupRequested: undefined` sau
 * khi chạy xong) — đó là "trả lại", không phải "sở hữu trạng thái". Field bot
 * chỉ xoá mà chưa từng ghi giá trị thì cron ĐƯỢC phép đặt (đó chính là cờ mà
 * bot và cron phối hợp).
 */
function botWrittenFields(guildFields) {
  const sources = new Map();
  sources.set("bot_writes.ts", fs.readFileSync(path.join(CONVEX_DIR, "bot_writes.ts"), "utf8"));
  const dir = path.join(CONVEX_DIR, "bot_writes");
  if (fs.existsSync(dir)) {
    for (const e of fs.readdirSync(dir).sort()) {
      if (e.endsWith(".ts"))
        sources.set(`bot_writes/${e}`, fs.readFileSync(path.join(dir, e), "utf8"));
    }
  }
  const owned = new Set();
  for (const src of sources.values()) {
    for (const w of collectConfigWrites(src, [...guildFields])) {
      for (const f of w.clearedOnly || []) owned.delete(f);
      for (const f of w.fields) {
        if (!(w.clearedOnly || []).includes(f)) owned.add(f);
      }
    }
  }
  return owned;
}

/** Cron đăng ký trong crons.ts → [{name, module, fn, line}]. */
function parseCronTargets(crontsSrc) {
  const src = stripComments(crontsSrc);
  const targets = [];
  const re =
    /crons\.(?:interval|hourly|daily|weekly|monthly)\(\s*"([^"]+)"\s*,\s*(\{[^}]*\})\s*,\s*(?:api|internal)\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\s*,/g;
  let m;
  while ((m = re.exec(src))) {
    targets.push({
      name: m[1],
      schedule: m[2].replace(/\s+/g, " ").trim(),
      module: m[3],
      fn: m[4],
      line: src.slice(0, m.index).split("\n").length,
    });
  }
  return targets;
}

/** Thân hàm export `export const fn = <kind>({...})` trong một file Convex. */
function findCronHandler(src, fn) {
  const re = new RegExp(
    `export const ${fn} = (internalMutation|mutation|internalAction|action)\\s*\\(`,
  );
  const m = re.exec(src);
  if (!m) return null;
  const braceAt = src.indexOf("{", m.index + m[0].length - 1);
  const end = matchBlock(src, braceAt);
  if (end < 0) return null;
  return {
    kind: m[1],
    body: stripComments(src.slice(braceAt, end + 1)),
    line: src.slice(0, m.index).split("\n").length,
  };
}

/**
 * Object literal trong mọi lệnh ghi `ctx.db.patch|insert|replace` → danh sách
 * {table, key, value, computed}. Bỏ comment TRƯỚC (comment giải thích luật cũng
 * chứa tên biến — đã bị cổng này dắm nhầm một lần với kiểu "phát hiện bằng
 * chuỗi con").
 */
function writesOf(body) {
  const out = [];
  const writeRe = /ctx\.db\.(?:patch|insert|replace)\s*\(/g;
  let m;
  while ((m = writeRe.exec(body))) {
    const head = body.slice(m.index, m.index + 160);
    const tableMatch = /^\s*ctx\.db\.(?:patch|insert|replace)\s*\(\s*"([A-Za-z0-9_]+)"/.exec(head);
    const openRel = body.indexOf("{", m.index + m[0].length - 1);
    if (openRel < 0 || openRel - (m.index + m[0].length) > 80) continue;
    const close = matchBlock(body, openRel);
    if (close < 0) continue;
    const lit = body.slice(openRel, close + 1);
    for (const km of lit.matchAll(/(?:^|[{,\n])\s*(\[[^\]]+\]|[A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*/g)) {
      const key = km[1];
      // `km.index` là chỉ số TƯƠNG ĐỐI trong `lit` — cắt giá trị cũng phải tương
      // đối (lần trước trộn hai hệ toạ độ → mọi giá trị thành chuỗi rỗng).
      const valueStart = km.index + km[0].length;
      out.push({
        table: tableMatch ? tableMatch[1] : null,
        key,
        computed: key.startsWith("["),
        value: lit.slice(valueStart, nextTopLevelComma(lit, valueStart)).trim(),
      });
    }
  }
  return out;
}

/** Vị trí dấu phẩy kế tiếp ở độ sâu ngoặc 0, tính từ `from` trong object literal. */
function nextTopLevelComma(lit, from) {
  let depth = 0;
  for (let i = from; i < lit.length; i++) {
    const c = lit[i];
    if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") depth--;
    else if (c === "," && depth === 0) return i;
  }
  return lit.length;
}

/** Kiểm một cron target → danh sách lỗi (rỗng = sạch). */
function checkTarget(target, files, botFields) {
  const errors = [];
  const rel = `${target.module}.ts`;
  const src = files.get(rel);
  if (!src) {
    return [`${CRONS_REL}:${target.line} cron "${target.name}" trỏ tới ${rel} không tồn tại`];
  }
  const handler = findCronHandler(src, target.fn);
  if (!handler) {
    return [
      `${rel}:${target.line} không tìm thấy "export const ${target.fn}" — cron sẽ KHÔNG chạy (im lặng)`,
    ];
  }
  const at = `${rel}:${handler.line} (cron "${target.name}")`;

  // R1 — cron phải là internalMutation.
  if (handler.kind !== "internalMutation") {
    errors.push(
      `${at}: phải là internalMutation, đang là ${handler.kind} — nếu là mutation() thì client/dashboard gọi được, mất tính chỉ-cron`,
    );
  }

  // R2–R4 — không gọi bot, không gọi hàm khác, không I/O ngoài DB.
  for (const rule of FORBIDDEN) {
    const hit = rule.re.exec(handler.body);
    if (hit) errors.push(`${at}: ${rule.msg} (khớp "${hit[0].slice(0, 60)}")`);
  }

  // R5–R6 — chỉ đặt cờ trên `guilds`.
  const writes = writesOf(handler.body);
  for (const w of writes) {
    if (w.table && !ALLOWED_TABLES[w.table]) {
      errors.push(
        `${at}: ghi bảng "${w.table}" — chỉ được ghi ${Object.keys(ALLOWED_TABLES).join(", ")}`,
      );
    }
    if (w.computed) {
      errors.push(
        `${at}: key "${w.key}" không nêu tên field — phải khai tường minh để cổng kiểm được`,
      );
      continue;
    }
    const isRelease = w.value === "undefined";
    if (isRelease) continue; // nhả quyền sở hữu — không giả lập trạng thái bot
    if (SHARED_METADATA_FIELDS[w.key]) continue;
    // Allowlist là HỢP ĐỒNG có chủ ý: cờ này cron được đặt, bot được xoá
    // (`backupRequested`, `reportRequestedAt`…). Ưu tiên allowlist trước vì
    // nhiều field trong đó CŨNG được bot/dashboard ghi (đặt yêu cầu) — đó là
    // cờ chia sẻ, không phải trạng thái riêng của tiến trình bot.
    if (ALLOWED_FLAG_FIELDS[w.key]) continue;
    if (botFields.has(w.key)) {
      errors.push(
        `${at}: ghi "${w.key}" — field BOT TỰ GHI (trạng thái tiến trình bot) và chưa khai trong allowlist cờ của cron`,
      );
      continue;
    }
    errors.push(`${at}: ghi "${w.key}" chưa có trong allowlist cờ của cron`);
  }
  // R5b — ghi theo id (không có tên bảng trong lệnh) thì id PHẢI đến từ query
  // guilds; nếu không, cổng không biết đang patch document nào.
  if (writes.some((w) => !w.table) && !/query\(\s*"guilds"/.test(handler.body)) {
    errors.push(
      `${at}: patch theo id mà thân hàm không có query("guilds") — không xác định được đang ghi document nào`,
    );
  }
  return errors;
}

/** Phân tích toàn bộ crons.ts với bản đồ nguồn (cho phép self-test tiêm thay đổi). */
function analyzeCrons(crontsSrc, files, botFields) {
  const targets = parseCronTargets(crontsSrc);
  if (targets.length === 0) {
    // R7 — fail-closed: crons.ts rỗng là thay đổi kiến trúc không ai kêu.
    return [`${CRONS_REL}: không đăng ký cron nào — lịch cron biến mất mà cổng vẫn im`];
  }
  return targets.flatMap((t) => checkTarget(t, files, botFields));
}

function loadFiles() {
  const files = new Map();
  files.set(CRONS_REL, fs.readFileSync(path.join(CONVEX_DIR, "crons.ts"), "utf8"));
  for (const f of fs.readdirSync(CONVEX_DIR)) {
    if (f.endsWith(".ts") && !f.startsWith("_"))
      files.set(f, fs.readFileSync(path.join(CONVEX_DIR, f), "utf8"));
  }
  return files;
}

/** Bộ tự kiểm: dựng lại từng cách phá ranh giới trên nguồn THẬT. */
const SELF_TEST = [
  {
    desc: "nguồn thật hiện tại phải SẠCH (cổng không báo nhầm)",
    mutate: () => {},
    expect: 0,
  },
  {
    desc: "comment giải thích luật KHÔNG được tính là vi phạm",
    mutate: (files) =>
      inject(
        files,
        "reports.ts",
        "sweepDueDailyReports",
        "// botKey: cron không dùng botKey\n  // ctx.runMutation(internal.x.y) — không gọi hàm khác\n",
      ),
    expect: 0,
  },
  {
    desc: "cron gọi ctx.runMutation (định nghĩa khác bot) → FAIL",
    mutate: (files) =>
      inject(
        files,
        "reports.ts",
        "sweepDueDailyReports",
        "await ctx.runMutation(internal.backup.x, {});\n  ",
      ),
    expect: 1,
  },
  {
    desc: "cron nhận botKey (lối vào cho bot) → FAIL",
    mutate: (files) =>
      inject(files, "reports.ts", "sweepDueDailyReports", "if (!botKey) return;\n  "),
    expect: 1,
  },
  {
    desc: "cron gọi fetch tới Discord → FAIL",
    mutate: (files) =>
      inject(
        files,
        "reports.ts",
        "sweepDueDailyReports",
        'await fetch("https://discord.com/api/v10/channels/1/messages");\n  ',
      ),
    expect: 1,
  },
  {
    desc: "cron ghi field bot TỰ GHI (lastReportAt) → FAIL",
    mutate: (files) =>
      inject(
        files,
        "reports.ts",
        "sweepDueDailyReports",
        "await ctx.db.patch(g._id, { lastReportAt: now });\n  ",
      ),
    expect: 1,
  },
  {
    desc: "cron ghi field lạ chưa khai báo → FAIL",
    mutate: (files) =>
      inject(
        files,
        "reports.ts",
        "sweepDueDailyReports",
        "await ctx.db.patch(g._id, { mysteryFlag: 1 });\n  ",
      ),
    expect: 1,
  },
  {
    desc: "cron ghi bảng khác guilds → FAIL",
    mutate: (files) =>
      inject(
        files,
        "reports.ts",
        "sweepDueDailyReports",
        'await ctx.db.insert("metrics", { a: 1 });\n  ',
      ),
    expect: 1,
  },
  {
    desc: "cron khai key động [k]: → FAIL",
    mutate: (files) =>
      inject(
        files,
        "reports.ts",
        "sweepDueDailyReports",
        "await ctx.db.patch(g._id, { [flagName]: 1 });\n  ",
      ),
    expect: 1,
  },
  {
    desc: "cron patch theo id mà thân hàm không query guilds → FAIL",
    mutate: (files) => {
      // Thay MỌI query("guilds") trong file: nếu chỉ thay cái đầu tiên thì bản
      // trong thân hàm cron vẫn còn ⇒ luật R5b không được kích hoạt.
      const src = files.get("reports.ts").replace(/query\(\s*"guilds"/g, 'query("someOtherTable")');
      files.set(
        "reports.ts",
        injectInto(src, "sweepDueDailyReports", "await ctx.db.patch(otherId, {});\n  "),
      );
    },
    expect: 1,
  },
  {
    desc: "đổi internalMutation thành mutation (client gọi được) → FAIL",
    mutate: (files) => {
      const src = files.get("reports.ts");
      files.set(
        "reports.ts",
        src.replace(
          /export const sweepDueDailyReports = internalMutation\(/,
          "export const sweepDueDailyReports = mutation(",
        ),
      );
    },
    expect: 1,
  },
  {
    desc: "crons.ts rỗng (lịch biến mất) → FAIL",
    mutate: (files) => files.set(CRONS_REL, "const crons = cronJobs();\nexport default crons;\n"),
    expect: 1,
  },
];

/**
 * Tiêm đoạn code vào đầu thân hàm cron (ngay sau `handler`). Dùng `[\s\S]` vì
 * `args: {}` giữa khai báo và handler có dấu `}` — `[^}]*` sẽ không với tới.
 */
function inject(files, file, fn, code) {
  files.set(file, injectInto(files.get(file), fn, code));
  return files;
}

function injectInto(src, fn, code) {
  const re = new RegExp(
    `(export const ${fn} = internalMutation\\(\\{[\\s\\S]{0,600}?handler:[\\s\\S]{0,120}?=>\\s*\\{)`,
  );
  if (!re.test(src)) throw new Error(`self-test: không tìm thấy chỗ chèn của ${fn}`);
  return src.replace(re, `$1\n  ${code}`);
}

function runSelfTest(botFields) {
  const base = loadFiles();
  let failed = 0;
  console.log(`# self-test cổng ranh giới cron (${botFields.size} field bot tự ghi)`);
  for (const c of SELF_TEST) {
    const files = new Map([...base.entries()].map(([k, v]) => [k, v]));
    try {
      c.mutate(files);
    } catch (e) {
      console.error(`❌ self-test: ${c.desc} — KHÔNG tạo được nguồn giả: ${e.message}`);
      failed++;
      continue;
    }
    const errs = analyzeCrons(files.get(CRONS_REL), files, botFields);
    const ok = errs.length >= c.expect;
    if (!ok) failed++;
    console.log(
      `${ok ? "✅" : "❌"} self-test: ${c.desc} — mong ≥${c.expect} lỗi, nhận ${errs.length}` +
        (ok && c.expect > 0 ? ` → ${errs[0].slice(0, 96)}` : ""),
    );
  }
  if (failed > 0) {
    console.error(`\n❌ self-test FAIL — ${failed} case sai (cổng mù hoặc báo nhầm chỗ sạch)`);
    process.exit(1);
  }
  console.log("✅ self-test PASS — cổng bắt đúng vi phạm, không bị comment lừa");
}

function main() {
  const fields = guildSchemaFields();
  const botFields = botWrittenFields(fields);
  if (process.argv.includes("--self-test")) {
    runSelfTest(botFields);
    return;
  }
  const files = loadFiles();
  const errors = analyzeCrons(files.get(CRONS_REL), files, botFields);
  const targets = parseCronTargets(files.get(CRONS_REL));
  if (errors.length === 0) {
    console.log(
      `cron-boundary OK — ${targets.length} cron chỉ đặt cờ trên guilds (${botFields.size} field bot tự ghi được bảo vệ)`,
    );
    process.exit(0);
  }
  console.error(`cron-boundary LỆCH — ${errors.length} vi phạm ranh giới:\n`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error(
    "\nSửa: cron chỉ được TÍNH + ĐẶT CỜ (xem docs/cron-migration.md). Cần field ghi mới thì thêm vào ALLOWED_FLAG_FIELDS kèm lý do; cần chạm ngoài DB thì đó là việc của BOT, không phải cron.",
  );
  process.exit(1);
}

module.exports = { analyzeCrons, parseCronTargets, checkTarget, writesOf, ALLOWED_FLAG_FIELDS };

if (require.main === module) main();
