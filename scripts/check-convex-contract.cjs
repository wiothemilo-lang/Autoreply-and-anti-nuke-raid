#!/usr/bin/env node
/**
 * scripts/check-convex-contract.cjs — Chặn lệch hợp đồng bot ⇄ Convex NGAY LÚC CI.
 *
 * Bối cảnh: bot gọi Convex bằng TÊN CHUỖI ("bot_writes:botClaimBackup",
 * "backup:botGetPending"…) — TypeScript không kiểm tra được. Khi đổi tên/di
 * chuyển function Convex mà quên grep lại phía bot: CI vẫn xanh, bot crash
 * runtime ngay khi luồng đó chạy (đúng kiểu bug thiếu import 15/09 mà
 * eslint no-undef đã chặn được cho phía bot — script này chặn nốt phía đối
 * diện).
 *
 * Cách hoạt động:
 *  1. Quét mọi chuỗi "module:function" trong bot/src qua lệnh
 *     .mutation/.query/.action — thành danh sách BÊN GỌI.
 *  2. Đọc exports thật của convex/*.ts (đã loại _generated) — thành danh
 *     sách BÊN NHẬN.
 *  3. Mọi "module:function" bot gọi mà không có export tương ứng → lỗi.
 *
 * Giới hạn có chủ đích: chỉ kiểm tra TÊN function tồn tại, không kiểm tra
 * args (đã có typecheck phía Convex + test luồng). Cũng kiểm tra chiều
 * dashboard → Convex ở mức "module tồn tại" (src/ dùng api.anynAny typed nên
 * tsc đã phủ — không quét lại để tránh noise).
 */

const fs = require("fs");
const path = require("path");
const { blankComments } = require("./lib/commentScan.cjs");

const ROOT = path.resolve(__dirname, "..");

function walk(dir, ext, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, ext, out);
    else if (entry.name.endsWith(ext)) out.push(p);
  }
  return out;
}

// ── 1. Bên gọi: các chuỗi "module:function" trong bot/src ──
const CALL_RE =
  /\.(?:mutation|query|action)\(\s*"([A-Za-z_][A-Za-z0-9_]*:[A-Za-z_][A-Za-z0-9_]*)"/g;
const calls = new Map(); // ref -> [{file, line}]
for (const file of walk(path.join(ROOT, "bot", "src"), ".js")) {
  const text = fs.readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file);
  let m;
  while ((m = CALL_RE.exec(text))) {
    const line = text.slice(0, m.index).split("\n").length;
    if (!calls.has(m[1])) calls.set(m[1], []);
    calls.get(m[1]).push({ file: rel, line });
  }
}

// ── 2. Bên nhận: exports thật của convex/*.ts ──
const EXPORT_RE = /export\s+(?:async\s+)?(?:const|function)\s+([A-Za-z_][A-Za-z0-9_]*)/g;
const convexExports = new Set();
const convexFiles = walk(path.join(ROOT, "convex"), ".ts").filter(
  (f) => !f.includes(`${path.sep}_generated${path.sep}`) && !f.endsWith("tsconfig.ts"),
);
for (const file of convexFiles) {
  // Bỏ comment: `// export const foo` không được tính là export thật, nếu không
  // gate sẽ xanh trong khi bot gọi một function đã bị comment/xoá.
  const text = blankComments(fs.readFileSync(file, "utf8"));
  const module = path.basename(file, ".ts");
  let m;
  while ((m = EXPORT_RE.exec(text))) {
    convexExports.add(`${module}:${m[1]}`);
  }
}

// ── 2b. Ref viết dạng LITERAL nhưng không nằm ngay trong lời gọi ──
// Ví dụ bot/src/handlers/backup.js:
//   const reportKind = item.kind === "import"
//     ? "bot_writes:botReportImportError" : "bot_writes:botClearBackup";
//   await store.client.mutation(reportKind, …)
// Đối số là BIẾN nên regex ở mục 1 không thấy — gõ sai một trong hai nhánh này
// sẽ lọt lưới cho tới lúc chạy thật (đúng kiểu bug hợp đồng script này chặn).
// Chỉ xét literal có phần module TRÙNG tên file convex, nên chuỗi minh hoạ
// kiểu "name:id" trong tài liệu không bị báo nhầm.
const convexModules = new Set(convexFiles.map((f) => path.basename(f, ".ts")));
const REF_LITERAL_RE = /["'`]([A-Za-z_][A-Za-z0-9_]*):([A-Za-z_][A-Za-z0-9_]*)["'`]/g;
const literalRefs = new Map(); // ref -> [{file, line}]
for (const file of walk(path.join(ROOT, "bot", "src"), ".js")) {
  const text = fs.readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file);
  let m;
  while ((m = REF_LITERAL_RE.exec(text))) {
    const ref = `${m[1]}:${m[2]}`;
    if (!convexModules.has(m[1])) continue; // không phải namespace Convex
    if (calls.has(ref)) continue; // đã kiểm qua lời gọi trực tiếp
    const line = text.slice(0, m.index).split("\n").length;
    if (!literalRefs.has(ref)) literalRefs.set(ref, []);
    literalRefs.get(ref).push({ file: rel, line });
  }
}

// ── 3. So khớp ──
const missing = [];
for (const [ref, sites] of [...calls.entries()].sort()) {
  if (!convexExports.has(ref)) {
    missing.push({ ref, sites });
  }
}
const missingLiteral = [];
for (const [ref, sites] of [...literalRefs.entries()].sort()) {
  if (!convexExports.has(ref)) {
    missingLiteral.push({ ref, sites });
  }
}

if (missing.length === 0 && missingLiteral.length === 0) {
  console.log(
    `convex-contract OK — ${calls.size} function gọi trực tiếp + ${literalRefs.size} ref dựng động đều tồn tại phía Convex (${convexExports.size} exports)`,
  );
  process.exit(0);
}

console.error(
  `convex-contract LỆCH — ${missing.length + missingLiteral.length} ref bot dùng nhưng Convex KHÔNG có:\n`,
);
for (const { ref, sites } of [...missing, ...missingLiteral]) {
  const where = sites.map((s) => `${s.file}:${s.line}`).join(", ");
  console.error(`  - ${ref}  (gọi tại ${where})`);
}
console.error(
  "\nSửa: đổi tên function về như cũ, hoặc cập nhật TẤT CẢ vị trí gọi phía bot trong cùng commit (grep toàn bộ bot/src trước khi đổi).",
);
process.exit(1);
