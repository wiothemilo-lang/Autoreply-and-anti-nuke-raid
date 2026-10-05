#!/usr/bin/env node
/**
 * scripts/check-bot-payload.cjs — Chạy VALIDATOR THẬT của Convex với PAYLOAD THẬT
 * của bot, không cần mạng, không cần deploy.
 *
 * Vì sao cần cổng riêng (bối cảnh 05/10/2026):
 *  - Convex kiểm tra args TRƯỚC khi chạy handler, và kiểm tra MẠNH hơn hẳn so
 *    tên field: thừa field là lỗi, thiếu field bắt buộc là lỗi, SAI KIỂU cũng là
 *    lỗi. Một payload lệch đúng một kiểu là cả mutation chết — và `botSyncGuilds`
 *    đã chết đúng như vậy hai lần liên tiếp.
 *  - Cổng cũ (`test-convex-arg-contract.cjs`) chỉ so TÊN field ở cấp ngoài, và
 *    so schema↔args với nhau chứ chưa bao giờ so với payload bot thật — nên khi
 *    cả hai cùng khai một field thì vẫn "khớp" dù bot không hề gửi field đó.
 *  - Cổng này dựng lại validator từ NGUỒN `convex/*.ts` rồi chạy đúng quy tắc của
 *    Convex lên payload do chính hàm bot sinh ra. Không có Convex, không có
 *    network: chạy được trên VPS ngay sau khi pull, trước cả khi CI deploy.
 *
 * Nguyên tắc: PAYLOAD BOT là mốc, không phải schema. Args phải khớp đúng thứ bot
 * GỨI; schema bảng thì khác (nó mô tả thứ được LƯU, nên server tự gán thêm cột
 * cũng hợp lệ).
 *
 * Chạy: node scripts/check-bot-payload.cjs [--self-test]
 * Dùng lại: test-convex-arg-contract.cjs require cổng này để không viết trùng
 * bộ dựng validator / walker.
 */
const fs = require("fs");
const path = require("path");

const { v } = require("convex/values");
const { stripComments } = require("./check-settings-signal.cjs");

const ROOT = path.resolve(__dirname, "..");
const CONVEX_DIR = path.join(ROOT, "convex");

// ── Tiện ích bóc nguồn ────────────────────────────────────────────────────────

/** Bỏ comment, chú thích kiểu TS và cast `as X` để biểu thức còn chạy được. */
function toJs(expr) {
  return stripComments(expr)
    .replace(/\bas\s+const\b/g, "")
    .replace(/\bas\s+[A-Za-z_$][\w$.<>[\]|"']*/g, "");
}

/**
 * Tách biểu thức `v.xxx(...)` cân bằng ngoặc bắt đầu từ `anchor`.
 * Dùng cho validator lồng nhau — nếu chỉ `indexOf` tới dấu `)` kế tiếp sẽ cắt
 * cụt khối `v.object({...})` và dựng ra validator sai (rồi cổng xanh vô nghĩa).
 */
function balancedCall(src, anchor) {
  const i = src.indexOf(anchor);
  if (i < 0) return null;
  const open = src.indexOf("(", i + anchor.length - 1);
  if (open < 0) return null;
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === "(") depth++;
    else if (src[j] === ")") {
      depth--;
      if (depth === 0) return src.slice(i, j + 1);
    }
  }
  return null;
}

/** Dựng validator Convex THẬT từ biểu thức lấy ra từ source `convex/*.ts`. */
function buildValidator(expr) {
  // Cố ý dùng new Function: dựng lại validator TỪ SOURCE thay vì hard-code, để
  // validator đổi là cổng đổi theo. `v` là tham số duy nhất được đưa vào.
  return new Function("v", `return (${toJs(expr)});`)(v);
}

// ── Walker mô phỏng đúng quy tắc Convex ─────────────────────────────────────

const NUMERIC = (x) => typeof x === "number" && Number.isFinite(x);

function matches(val, value) {
  if (val.kind === "union") return val.members.some((m) => matches(m, value));
  if (val.kind === "null") return value === null;
  if (val.kind === "float64") return NUMERIC(value);
  if (val.kind === "string") return typeof value === "string";
  if (val.kind === "boolean") return typeof value === "boolean";
  if (val.kind === "array") return Array.isArray(value);
  if (val.kind === "object")
    return value !== null && typeof value === "object" && !Array.isArray(value);
  return true;
}

/**
 * Thu thập mọi sai lệch, không dừng ở lỗi đầu tiên — để tên assert liệt kê hết
 * field lệch thay vì bắt sửa lần này rồi lộ lỗi sau.
 */
function validate(val, value, path, out) {
  if (value === undefined) {
    if (val.isOptional !== "optional") {
      out.push(`${path}: BẮT BUỘC nhưng bot không gửi`);
    }
    return;
  }
  if (!matches(val, value)) {
    out.push(
      `${path}: sai kiểu — cần ${val.kind}, bot gửi ${value === null ? "null" : typeof value}`,
    );
    return;
  }
  if (val.kind === "object") {
    const declared = Object.keys(val.fields);
    for (const k of Object.keys(value)) {
      if (!declared.includes(k)) out.push(`${path}.${k}: KHÔNG có trong validator (thừa field)`);
    }
    for (const [k, fv] of Object.entries(val.fields)) {
      validate(fv, value[k], path ? `${path}.${k}` : k, out);
    }
    return;
  }
  if (val.kind === "array") {
    value.forEach((el, i) => validate(val.element, el, `${path}[${i}]`, out));
    return;
  }
  if (val.kind === "union") {
    // 1 union khớp ở nhánh nào thì đi tiếp nhánh đó để soi bên trong.
    const hit = val.members.find((m) => matches(m, value));
    if (hit && (hit.kind === "object" || hit.kind === "array")) {
      validate(hit, value, path, out);
    }
  }
}

// ── Cổng ─────────────────────────────────────────────────────────────────────

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/**
 * @returns {Array<{name: string, ok: boolean, detail?: string}>}
 */
function runChecks() {
  const results = [];
  const guilds = read(path.join("convex", "guilds.ts"));

  const aiExpr = balancedCall(guilds, "aiHealth: v.optional(");
  const budgetExpr = aiExpr ? balancedCall(aiExpr, "budget: v.optional(") : null;

  if (!aiExpr) {
    results.push({
      name: "tìm thấy validator aiHealth trong args của botSyncGuilds",
      ok: false,
      detail: "không thấy `aiHealth: v.optional(` — hoặc cổng bị đổi tên, hoặc file đã bị xóa",
    });
    return results;
  }

  let aiVal;
  try {
    aiVal = buildValidator(aiExpr.replace(/^aiHealth:\s*/, ""));
  } catch (e) {
    results.push({
      name: "dựng được validator aiHealth từ source",
      ok: false,
      detail: `${e.message} — cổng phải đỏ chứ không bỏ qua im lặng`,
    });
    return results;
  }
  results.push({ name: "dựng được validator aiHealth từ source convex/guilds.ts", ok: true });

  // Payload THẬT — gọi chính hàm bot, không hard-code, để đổi aiStats() là đỏ.
  let sent;
  try {
    sent = require(path.join(ROOT, "bot", "src", "ai.js")).aiStats();
  } catch (e) {
    results.push({
      name: "nạp được aiStats() để so payload thật",
      ok: false,
      detail: `${e.message} — mất lớp bảo vệ, phải đỏ chứ không bỏ qua`,
    });
    return results;
  }

  const out = [];
  validate(aiVal, sent, "aiHealth", out);
  results.push({
    name:
      out.length === 0
        ? "aiStats() thật khớp validator aiHealth (kiểu + field lồng, kiểm đệ quy)"
        : `payload lệch validator aiHealth: ${out.join("; ")}`,
    ok: out.length === 0,
  });

  // Không riêng hoá sẵn phần con bot tạo ra.
  if (budgetExpr) {
    let budgetVal;
    try {
      budgetVal = buildValidator(budgetExpr.replace(/^budget:\s*/, ""));
    } catch (e) {
      results.push({
        name: "dựng được validator aiHealth.budget",
        ok: false,
        detail: e.message,
      });
      budgetVal = null;
    }
    if (budgetVal) {
      const bOut = [];
      validate(budgetVal, sent.budget, "aiHealth.budget", bOut);
      results.push({
        name:
          bOut.length === 0
            ? "budgetSummary() thật khớp validator aiHealth.budget"
            : `payload lệch validator budget: ${bOut.join("; ")}`,
        ok: bOut.length === 0,
      });
    }
  }

  // Chống cổng tự rỗng: phải soi được các node lồng, nếu không thì "xanh" vô nghĩa.
  const nested = [];
  const countNested = (val) => {
    if (!val) return;
    if (val.kind === "object") {
      for (const fv of Object.values(val.fields)) countNested(fv);
      if (val.kind === "object" && val.fields) nested.push(Object.keys(val.fields));
    } else if (val.kind === "array" && val.element) countNested(val.element);
  };
  countNested(aiVal);
  // Bắt buộc phải thấy ít nhất object lồng thật (có field con), nếu không thì
  // walker chỉ đang soi cấp ngoài — đúng loại hở đã gây ra bug 05/10.
  const deepCount = nested.filter(
    (keys) => keys.length > 0 && keys.some((k) => k.includes("label")),
  ).length;
  results.push({
    name:
      deepCount > 0
        ? `walker soi được object lồng có field con (${deepCount} khối)`
        : "walker KHÔNG soi được object lồng nào — cổng chỉ kiểm cấp ngoài, hở",
    ok: deepCount > 0,
  });

  return results;
}

// ── Tự kiểm: chứng minh cổng bắt được cả lớp lỗi ────────────────────────────

function selfTest() {
  const cases = [
    {
      name: "bắt thiếu field bắt buộc",
      expr: "v.object({ a: v.number() })",
      value: {},
      expect: "BẮT BUỘC",
    },
    {
      name: "bắt field thừa",
      expr: "v.object({ a: v.number() })",
      value: { a: 1, b: 2 },
      expect: "KHÔNG có trong validator",
    },
    {
      name: "bắt sai kiểu (string ở chỗ cần float64)",
      expr: "v.object({ a: v.number() })",
      value: { a: "x" },
      expect: "sai kiểu",
    },
    {
      name: "bắt sai kiểu phần tử trong mảng",
      expr: "v.array(v.object({ z: v.boolean() }))",
      value: [{ z: true }, { z: 1 }],
      expect: "sai kiểu",
    },
    {
      name: "bắt thiếu field bắt buộc bên trong object lồng",
      expr: "v.object({ m: v.object({ n: v.string() }) })",
      value: { m: {} },
      expect: "m.n: BẮT BUỘC",
    },
    {
      name: "bắt union không khớp nhánh nào",
      expr: "v.nullable(v.number())",
      value: "x",
      expect: "sai kiểu",
    },
  ];
  const results = [];
  for (const c of cases) {
    const out = [];
    validate(buildValidator(c.expr), c.value, "$", out);
    results.push({
      name: `self-test: ${c.name}`,
      ok: out.some((m) => m.includes(c.expect)),
      detail: out.join("; "),
    });
  }
  // Các ca phải ĐÚNG (không báo động giả).
  const clean = [
    {
      name: "self-test: optional thiếu thì hợp lệ",
      expr: "v.object({ a: v.optional(v.number()) })",
      value: {},
    },
    { name: "self-test: nullable nhận null", expr: "v.nullable(v.number())", value: null },
    {
      name: "self-test: payload đầy đủ hợp lệ",
      expr: "v.object({ a: v.number(), b: v.optional(v.string()) })",
      value: { a: 1, b: "x" },
    },
  ];
  for (const c of clean) {
    const out = [];
    validate(buildValidator(c.expr), c.value, "$", out);
    results.push({ name: c.name, ok: out.length === 0, detail: out.join("; ") });
  }
  return results;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

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
  const mode = process.argv.includes("--self-test");
  const results = mode ? [...selfTest(), ...runChecks()] : runChecks();
  process.exit(print(results) ? 1 : 0);
}

module.exports = { runChecks, selfTest, buildValidator, validate, balancedCall, CONVEX_DIR };
