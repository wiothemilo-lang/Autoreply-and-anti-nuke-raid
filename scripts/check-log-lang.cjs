#!/usr/bin/env node
/**
 * scripts/check-log-lang.cjs — Ngôn ngữ log phải khớp ở CẢ HAI phía.
 *
 * Vì sao cần cổng:
 *  - `convex/guilds/updateSettings.ts` khai `LOG_LANGS` (server CHẤP NHẬN mấy
 *    ngôn ngữ) còn `bot/src/logI18n.js` khai `LANGS` (bot DỊCH ĐƯỢC mấy ngôn
 *    ngữ). Hai danh sách này là một hợp đồng đặt ở hai tệp khác nhau.
 *  - Lệch là lỗi im lặng: chủ server chọn "de" trên dashboard, server nhận và
 *    lưu, nhưng bot rơi về tiếng Việt — dashboard báo "đã lưu" trong khi log
 *    không đổi. Không có gì báo.
 *  - Thêm ngôn ngữ mà chỉ sửa một bên là loại bug đã xảy ra nhiều lần ở repo
 *    này (magic number ở nhiều file không có hợp đồng canh giữa).
 *
 * Ngoài ra: mỗi ngôn ngữ phải có ĐỦ mọi khoá chuỗi, và mọi hành động case phải
 * có nhãn — thiếu một mục thì log rơi về nhãn gốc (tiếng Việt) giữa chừng.
 *
 * Chạy: node scripts/check-log-lang.cjs [--self-test]
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const CONVEX_REL = path.join("convex", "guilds", "updateSettings.ts");
const CASE_ACTIONS = [
  "ban",
  "timeout",
  "kick",
  "warn",
  "purge",
  "untimeout",
  "timeout_expired",
  "unban",
  "unwarn",
  "delete",
];

/** Danh sách ngôn ngữ khai ở Convex. */
function convexLangs(src) {
  const m = src.match(/LOG_LANGS\s*=\s*\[([^\]]*)\]/);
  if (!m) return null;
  return [...m[1].matchAll(/["']([a-z]{2})["']/g)].map((x) => x[1]);
}

/** Nạp module dịch của bot thật (không parse text). */
function botModule() {
  return require(path.join(ROOT, "bot", "src", "logI18n.js"));
}

function check() {
  const out = [];
  const add = (name, ok, detail) => out.push({ name, ok, detail });

  const src = read(CONVEX_REL);
  const server = convexLangs(src);
  const bot = botModule();

  add(
    server ? "Convex khai được LOG_LANGS" : "Convex KHÔNG khai được LOG_LANGS",
    Array.isArray(server) && server.length > 0,
    server ? server.join(",") : "không tìm thấy LOG_LANGS",
  );
  if (!server) return out;

  add(
    "Danh sách ngôn ngữ khớp giữa Convex và bot",
    server.join(",") === bot.LANGS.join(","),
    `convex=[${server}] bot=[${bot.LANGS}]`,
  );

  const keys = ["offender", "reason", "responsible", "noReason", "case", "bot"];
  for (const lang of server) {
    const table = bot.DICT[lang];
    if (!table) {
      add(`ngôn ngữ "${lang}" có bảng dịch trong bot`, false, "thiếu hẳn trong DICT");
      continue;
    }
    const missing = keys.filter((k) => typeof table[k] !== "string" || !table[k].trim());
    add(
      missing.length === 0
        ? `ngôn ngữ "${lang}" đủ ${keys.length} khoá chuỗi log`
        : `ngôn ngữ "${lang}" thiếu khoá: ${missing.join(", ")}`,
      missing.length === 0,
    );
    const noLabel = CASE_ACTIONS.filter((a) => typeof table.labels?.[a] !== "string");
    add(
      noLabel.length === 0
        ? `ngôn ngữ "${lang}" có nhãn cho cả ${CASE_ACTIONS.length} hành động case`
        : `ngôn ngữ "${lang}" thiếu nhãn hành động: ${noLabel.join(", ")}`,
      noLabel.length === 0,
    );
  }

  // Mọi hành động case bot gửi phải có nhãn ở ngôn ngữ mặc định.
  const caseLog = read(path.join("bot", "src", "caseLog.js"));
  add("caseLog dùng logLabel (không ghim CASE_LABEL cứng)", /logLabel\(lang, action/.test(caseLog));
  add(
    "caseLog dịch cả tên trường + câu fallback",
    /logT\(lang, "offender"\)/.test(caseLog) && /logT\(lang, "noReason"\)/.test(caseLog),
  );
  return out;
}

/** Tự kiểm: nạp nguồn sai và chứng minh cổng bắt được. */
function selfTest() {
  const real = read(CONVEX_REL);
  const results = [];

  const drift = real.replace(
    /export const LOG_LANGS = \[[^\]]*\]/,
    'export const LOG_LANGS = ["vi", "en", "fr"]',
  );
  results.push({
    name: "self-test: cổng ĐỎ khi Convex thêm ngôn ngữ bot chưa dịch",
    ok: (() => {
      const before = convexLangs(real).join(",");
      const after = convexLangs(drift).join(",");
      const bot = botModule();
      return before === bot.LANGS.join(",") && after !== bot.LANGS.join(",");
    })(),
  });

  results.push({
    name: "self-test: cổng XANH trên nguồn thật",
    ok: check().every((r) => r.ok),
  });
  return results;
}

function print(results) {
  let fail = 0;
  for (const r of results) {
    if (r.ok) console.log(`PASS ${r.name}`);
    else {
      fail++;
      console.error(`FAIL ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
    }
  }
  console.log(`\nKết quả: ${results.length - fail} pass, ${fail} fail`);
  return fail;
}

if (require.main === module) {
  const results = process.argv.includes("--self-test") ? [...selfTest(), ...check()] : check();
  process.exit(print(results) ? 1 : 0);
}

module.exports = { check, selfTest };
