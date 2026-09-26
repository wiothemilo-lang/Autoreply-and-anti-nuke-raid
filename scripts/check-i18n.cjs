#!/usr/bin/env node
/**
 * scripts/check-i18n.cjs — chặn chuỗi tiếng Việt lọt sang người dùng EN.
 *
 * Kiến trúc i18n: chuỗi VI trong code CHÍNH LÀ key (kiểu gettext), thiếu bản
 * EN thì translate() rơi về nguyên chuỗi VI — không vỡ UI nhưng người dùng EN
 * đọc phải tiếng Việt. Script này là lá chắn cho đúng kiểu "lọt âm thầm" đó.
 *
 * Kiểm tra CỨNG (exit 1 nếu vi phạm):
 *   1. Mọi key trong translate("…") / t("…") trên src/ phải có bản EN.
 *   2. Mọi chuỗi trong src/lib/haimiya.ts đi tới người dùng (GREETING,
 *      QUICK_QUESTIONS, answer, suggestions của từng topic, FALLBACK) phải
 *      có bản EN — phần này được dịch lúc render nên không lộ ra ở dạng
 *      literal translate("…").
 *   3. Chuỗi VI hiển thị TRỰC TIẾP trong JSX (text node), {…} biểu thức, nhãn
 *      dữ liệu ({x.label}) và mảng dữ liệu render qua .map ({m}) đều phải đi
 *      qua translate(); thiếu là FAIL cứng (người dùng EN/DE đọc tiếng Việt).
 *
 * Báo cáo MỀM (không fail — chỉ nhắc để rà):
 *   3. Thuộc tính JSX (label/title/placeholder/aria-label/alt) có dấu tiếng
 *      Việt mà không bọc translate() — dấu hiệu quên dịch khi thêm UI mới.
 *   4. Key EN không còn xuất hiện trong code (bản dịch chết).
 *   5. Key DE không có bản EN tương ứng (bản dịch mồ côi).
 *
 * Dùng: node scripts/check-i18n.cjs
 *       node scripts/check-i18n.cjs --all   # in HẾT danh sách việc còn lại
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const VIET = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđĐ]/;

/** Giải escape của chuỗi JS (\" \\ \n…) để so khớp với key thật. */
function unescapeJs(raw) {
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    return raw;
  }
}

/**
 * Key từ điển → chuỗi thật. PHẢI giải escape ở CẢ hai kiểu nháy: bản cũ lấy
 * nguyên văn nhánh nháy đơn nên key chứa escape (`\n`, dấu " bên trong) không
 * bao giờ khớp key trong code — bản dịch đã có mà vẫn báo "THIẾU EN".
 *
 * Bug thật 26/09: key nháy đơn chứa dấu " literal (JS hợp lệ) làm JSON.parse
 * chết giữa chuỗi → catch → trả raw có `\uXXXX` chưa giải → so khớp FAIL dù
 * bản dịch có mặt. Chuỗi JS nháy đơn cần escape dấu " thành \" trước khi
 * JSON.parse (JSON không biết chuỗi nháy đơn).
 */
function dictKey(raw, quote) {
  if (quote === "'") {
    const normalized = raw.replace(/\\'/g, "'").replace(/"/g, '\\"');
    return unescapeJs(normalized);
  }
  return unescapeJs(raw);
}

/** Một dòng định nghĩa trong từ điển: `  "key": "value",` (key nháy đơn/kép/không nháy). */
const DICT_KEY_RE = /^\s{2}(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^\s:]+))\s*:/gm;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(tsx?|jsx?)$/.test(e.name) ? [p] : [];
  });
}

const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

// ── Key có trong từ điển EN ────────────────────────────────────────────────
const enKeys = new Set();
for (const name of ["i18n.en.ts", "i18n.en.panels.ts", "i18n.en.labels.ts"]) {
  const p = path.join(SRC, "lib", name);
  if (!fs.existsSync(p)) continue;
  const enSrc = fs.readFileSync(p, "utf8");
  for (const m of enSrc.matchAll(DICT_KEY_RE)) {
    enKeys.add(
      m[1] !== undefined ? dictKey(m[1], '"') : m[2] !== undefined ? dictKey(m[2], "'") : m[3],
    );
  }
}

// ── Key có trong từ điển DE — thiếu so với EN là lỗi CỨNG (người dùng DE sẽ
//    thấy tiếng Anh nguyên bản, đúng kiểu "lọt âm thầm" mà lá chắn phải chặn) ─
const deKeys = new Set();
for (const name of ["i18n.de.ts", "i18n.de.panels.ts", "i18n.de.labels.ts"]) {
  const p = path.join(SRC, "lib", name);
  if (!fs.existsSync(p)) continue;
  const deSrc = fs.readFileSync(p, "utf8");
  for (const m of deSrc.matchAll(DICT_KEY_RE)) {
    deKeys.add(
      m[1] !== undefined ? dictKey(m[1], '"') : m[2] !== undefined ? dictKey(m[2], "'") : m[3],
    );
  }
}
const problems = [];
for (const k of enKeys) if (!deKeys.has(k)) problems.push(`THIẾU DE: ${k.slice(0, 80)}`);

// ── Key CHỈ có ở DE mà không có bản EN = bản dịch mồ côi: key chuỗi VI là
//    nguồn tra cứu, thiếu EN thì không có cách nào chuỗi đó hiện ra bản DE —
//    rác còn lại sau các đợt viết lại copy. Báo MỀM (không chặn ship) vì đây
//    là vệ sinh từ điển, không phải chuỗi người dùng bị lọt tiếng Việt.
const orphanDeKeys = [...deKeys].filter((k) => !enKeys.has(k));

// ── 1. Mọi translate("…") phải có bản EN ───────────────────────────────────
// Loại MỌI file từ điển (base + panels + labels) khỏi "code": nếu chỉ quét
// base dict, key sống sót nhờ chính entry của nó trong i18n.*.panels.ts sẽ
// không bao giờ bị báo là bản dịch chết (đúng lỗi tự-quét-chính-mình).
const codeFiles = walk(SRC).filter(
  (p) => !/lib[\\/]i18n(\.en|\.de)?(\.(panels|labels))?\.tsx?$/.test(p),
);
const wrappedKeys = new Set();
for (const file of codeFiles) {
  const src = fs.readFileSync(file, "utf8");
  // (?<![A-Za-z0-9_$.]) để KHÔNG khớp `import(` (kết thúc bằng "t(" ).
  for (const m of src.matchAll(/(?<![A-Za-z0-9_$.])(?:translate|t)\(\s*"((?:[^"\\]|\\.)*)"/g)) {
    const key = unescapeJs(m[1]);
    wrappedKeys.add(key);
    if (!enKeys.has(key)) problems.push(`THIẾU EN: ${rel(file)} — ${key.slice(0, 80)}`);
  }
  // Chuỗi nháy ĐƠN (thường dùng khi key chứa dấu ") — bản regex cũ bỏ sót
  // nhóm này nên key nháy đơn lọt lưới hoàn toàn.
  for (const m of src.matchAll(/(?<![A-Za-z0-9_$.])(?:translate|t)\(\s*'((?:[^'\\\n]|\\.)*)'/g)) {
    const key = unescapeJs(m[1].replace(/\\'/g, "'"));
    wrappedKeys.add(key);
    if (!enKeys.has(key)) problems.push(`THIẾU EN: ${rel(file)} — ${key.slice(0, 80)}`);
  }
  // Template literal tĩnh (không có ${}) cũng là key.
  for (const m of src.matchAll(/(?<![A-Za-z0-9_$.])(?:translate|t)\(\s*`([^`$\\]*)`/g)) {
    wrappedKeys.add(m[1]);
    if (!enKeys.has(m[1])) problems.push(`THIẾU EN: ${rel(file)} — ${m[1].slice(0, 80)}`);
  }
}

// ── 2. Chuỗi tới người dùng trong haimiya.ts phải có bản EN ────────────────
const kbPath = path.join(SRC, "lib/haimiya.ts");
if (fs.existsSync(kbPath)) {
  const kb = fs.readFileSync(kbPath, "utf8");
  const kbKeys = new Set();
  for (const m of kb.matchAll(/answer:\s*\n?\s*"((?:[^"\\]|\\.)*)"/g)) kbKeys.add(unescapeJs(m[1]));
  for (const blk of kb.matchAll(/suggestions:\s*\[([\s\S]*?)\]/g))
    for (const m of blk[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)) kbKeys.add(unescapeJs(m[1]));
  const greeting = kb.match(/export const GREETING\s*=\s*\n?\s*"((?:[^"\\]|\\.)*)"/);
  if (greeting) kbKeys.add(unescapeJs(greeting[1]));
  const quick = kb.match(/export const QUICK_QUESTIONS\s*=\s*\[([\s\S]*?)\]/);
  if (quick)
    for (const m of quick[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)) kbKeys.add(unescapeJs(m[1]));
  const fallback = kb.match(/const FALLBACK[\s\S]*?text:\s*"((?:[^"\\]|\\.)*)"/);
  if (fallback) kbKeys.add(unescapeJs(fallback[1]));
  for (const key of kbKeys)
    if (!enKeys.has(key)) problems.push(`THIẾU EN (Haimiya): ${key.slice(0, 80)}`);
}

// ── 3. Chữ Việt còn nằm TRỰC TIẾP trong JSX (text node) hoặc trong thuộc
// tính dạng chuỗi → chưa bọc translate(), người dùng EN sẽ đọc tiếng Việt.
//
// Phát hiện bằng PARSER THẬT (typescript đã có trong devDependency) chứ không
// dùng regex theo dòng: JsxText mới là chữ hiển thị thật, còn comment / code
// JS / chuỗi trong translate() đều không phải JsxText nên KHÔNG báo nhầm.
// Bản regex cũ bỏ sót text node một từ đứng riêng dòng (nút "Backup ngay")
// và bỏ sót text node nhiều dòng — đúng kiểu lọt âm thầm cần chặn.
const ts = require("typescript");
const unresolved = [];
for (const file of codeFiles.filter((f) => /\.(tsx|jsx)$/.test(f))) {
  const source = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.JSX,
  );
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  // Miễn trừ có ghi chú: dữ liệu nhãn được dịch LÚC RENDER (translate(label))
  // nên chuỗi gốc còn tiếng Việt là đúng ý — đánh dấu `// i18n-ok: <lý do>`
  // trong vòng 2 dòng phía trên để script không báo nhầm.
  const sourceLines = source.split("\n");
  const suppressed = (node, line) => {
    // 1) Mảng/object chứa node có ghi chú i18n-ok → cả khối được miễn trừ
    //    (nhãn dữ liệu dịch lúc render, ví dụ translate(item.label)).
    //    Duyệt MỌI mảng/object bao ngoài (tuple lồng trong mảng lớn vẫn tính).
    let sawContainer = false;
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isArrayLiteralExpression(p) || ts.isObjectLiteralExpression(p)) {
        sawContainer = true;
        if (p.getText(sf).includes("i18n-ok")) return true;
      }
    }
    if (sawContainer) return false;
    // 2) Không thuộc mảng/object: dùng ghi chú gần đó (±2 dòng phía trên).
    return sourceLines.slice(Math.max(0, line - 3), line + 1).some((l) => l.includes("i18n-ok"));
  };
  const flag = (node, kind, value) => {
    const line = lineOf(node.getStart(sf));
    if (suppressed(node, line)) return;
    unresolved.push({
      file: rel(file),
      line,
      kind,
      text: value.replace(/\s+/g, " ").trim().slice(0, 70),
    });
  };
  const isTranslateCall = (node) =>
    ts.isCallExpression(node) && /(^|\.)(translate|t)$/.test(node.expression.getText(sf));
  // So sánh (`x === "spam"`) dùng chuỗi kỹ thuật trong đối số translate() —
  // không phải chuỗi hiển thị, không được đòi bản dịch.
  const isComparison = (node) => {
    const p = node.parent;
    return (
      p &&
      ts.isBinaryExpression(p) &&
      [
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsToken,
      ].includes(p.operatorToken.kind)
    );
  };
  // MỌI chuỗi nằm trong đối số translate(…) đều là KEY — kể cả khi không đứng
  // ngay sau dấu ngoặc: `translate(cond ? "A" : "B")`. Bản regex cũ chỉ bắt
  // dạng translate("…") nên nhóm ternary lọt lưới: chuỗi được dịch nhưng
  // KHÔNG có bản EN → UI vẫn hiện tiếng Việt (đúng lỗi người dùng báo).
  const requireTranslations = (call) => {
    const walkArgs = (n) => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
        if (!isComparison(n) && VIET.test(n.text)) {
          wrappedKeys.add(n.text);
          if (!enKeys.has(n.text))
            problems.push(`THIẾU EN (trong translate): ${rel(file)} — ${n.text}`);
        }
        return;
      }
      if (ts.isTemplateExpression(n)) {
        for (const part of [n.head.text, ...n.templateSpans.map((s) => s.literal.text)]) {
          if (VIET.test(part)) {
            wrappedKeys.add(part);
            if (!enKeys.has(part))
              problems.push(`THIẾU EN (trong translate): ${rel(file)} — ${part}`);
          }
        }
      }
      ts.forEachChild(n, walkArgs);
    };
    for (const arg of call.arguments) walkArgs(arg);
  };
  // `inExpr` = đang ở trong một {…} của JSX. Chuỗi VI nằm ở đó vẫn hiển thị
  // ({cond ? "Bật" : "Tắt"}, {"Trực tuyến"}, ` · lần cuối ${x}`) nhưng JSXText
  // không bắt được — đúng nhóm "bấm nút không đổi ngôn ngữ" người dùng thấy.
  const visit = (node, inExpr) => {
    if (isTranslateCall(node)) {
      requireTranslations(node);
      return; // phần còn lại của cây đã là đối số được dịch
    }
    if (ts.isJsxText(node)) {
      const raw = node.getText(sf);
      if (VIET.test(raw)) flag(node, "text", raw);
      return;
    }
    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const value = node.initializer.text;
      if (VIET.test(value)) flag(node, `attr ${node.name.getText(sf)}`, value);
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && inExpr) {
      // Bỏ qua giá trị thuộc tính JSX — nhánh JsxAttribute đã xử lý riêng.
      const isAttrValue = ts.isJsxAttribute(node.parent);
      if (!isAttrValue && VIET.test(node.text)) flag(node, "expr", node.text);
    }
    if (inExpr && ts.isTemplateExpression(node)) {
      if (VIET.test(node.head.text)) flag(node, "expr", node.head.text);
      for (const span of node.templateSpans)
        if (VIET.test(span.literal.text)) flag(span.literal, "expr", span.literal.text);
    }
    const next = ts.isJsxExpression(node) ? true : inExpr;
    ts.forEachChild(node, (child) => visit(child, next));
  };
  visit(sf, false);
}
const rawText = unresolved.filter((u) => u.kind === "text");
const exprText = unresolved.filter((u) => u.kind === "expr");
const softAttr = unresolved.filter((u) => u.kind.startsWith("attr "));
for (const u of unresolved) problems.push(`CHƯA DỊCH (${u.kind}): ${u.file}:${u.line} — ${u.text}`);

// ── 3f. Nội dung đa ngữ TỰ CHỨA (văn bản pháp lý) ──────────────────────────
// Văn bản dài (điều khoản, quyền riêng tư) không hợp với từ điển key-tiếng-Việt:
// 3 bản × 3 ngôn ngữ là ~150 đoạn, nhét vào i18n.en/de.ts thì không ai đối chiếu
// nổi. Vì vậy file được đánh dấu `@i18n-content` sẽ MIỄN luật 3c — ĐỔI LẠI phải
// qua kiểm tra CẤU TRÚC dưới đây: cây `vi` và `en`/`de` phải trùng đường dẫn,
// không ô rỗng, và không đoạn nào giữ nguyên tiếng Việt ở bản dịch.
// Marker mà thiếu ngôn ngữ = FAIL cứng, nên không có chỗ nào giấu chuỗi chưa dịch.
const selfTranslated = new Set();
function flattenContent(node, pathParts, out) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    out.set(pathParts.join("."), node.text);
    return;
  }
  if (ts.isArrayLiteralExpression(node)) {
    node.elements.forEach((el, i) => flattenContent(el, [...pathParts, String(i)], out));
    return;
  }
  if (ts.isObjectLiteralExpression(node)) {
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const name =
        ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : null;
      if (name) flattenContent(prop.initializer, [...pathParts, name], out);
    }
    return;
  }
}
for (const file of walk(SRC)) {
  if (!/\.tsx?$/.test(file)) continue;
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes("@i18n-content")) continue;
  selfTranslated.add(file);
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  // Khai báo cấp file → tra tên (LEGAL_DOCS trỏ tới VI/EN/DE).
  const decls = new Map();
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const d of stmt.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.initializer) decls.set(d.name.text, d.initializer);
    }
  }
  const resolve = (node) =>
    ts.isIdentifier(node) && decls.has(node.text) ? decls.get(node.text) : node;
  // Tìm object literal có đủ khoá vi/en/de (nội dung đa ngữ).
  let langs = null;
  for (const init of decls.values()) {
    if (!ts.isObjectLiteralExpression(init)) continue;
    const props = new Map();
    for (const p of init.properties) {
      if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name))
        props.set(p.name.text, p.initializer);
    }
    if (props.has("vi") && props.has("en") && props.has("de")) {
      langs = props;
      break;
    }
  }
  if (!langs) {
    problems.push(
      `NỘI DUNG ĐA NGỮ: ${rel(file)} có marker @i18n-content nhưng không thấy khối { vi, en, de }`,
    );
    continue;
  }
  const trees = {};
  for (const l of ["vi", "en", "de"]) {
    const out = new Map();
    // KHÔNG kèm tên ngôn ngữ vào đường dẫn — nếu kèm thì "vi.0.name" và
    // "en.0.name" không bao giờ khớp nhau và luật này báo sai toàn bộ.
    flattenContent(resolve(langs.get(l)), [], out);
    trees[l] = out;
  }
  for (const l of ["en", "de"]) {
    for (const [path, value] of trees.vi) {
      if (!trees[l].has(path)) {
        problems.push(`THIẾU ${l.toUpperCase()} (nội dung đa ngữ): ${rel(file)} — ${path}`);
        continue;
      }
      const tr = trees[l].get(path);
      if (!tr.trim()) problems.push(`Ô RỖNG (nội dung đa ngữ): ${rel(file)} — ${l}:${path}`);
      else if (tr === value && VIET.test(value))
        problems.push(`CHƯA DỊCH (nội dung đa ngữ): ${rel(file)} — ${l}:${path}`);
    }
    for (const path of trees[l].keys())
      if (!trees.vi.has(path))
        problems.push(`THỪA ${l.toUpperCase()} (nội dung đa ngữ): ${rel(file)} — ${path}`);
  }
}
if (selfTranslated.size)
  console.log(
    `Nội dung đa ngữ tự chứa (kiểm cấu trúc vi/en/de): ${[...selfTranslated].map(rel).join(", ")}`,
  );

// ── 3c. Nhãn DỮ LIỆU (object/array trong src/*.ts) render qua translate(item.label)
// không đứng sau dấu ngoặc translate( nên các check trên không thấy — đúng
// nguồn chữ Việt còn sót trên UI (tên/mô tả 32 module, tên nhóm, nhãn hình
// phạt, giai đoạn nhiệt, nhãn chọn kiểu kênh…). Yêu cầu: mọi chuỗi tiếng Việt
// trong file dữ liệu phải có bản EN, TRỪ chuỗi kỹ thuật dùng để so khớp/parse
// dữ liệu backend (includes/replace/test/replace…) và trừ khoá đối tượng.
const dataLabels = [];
// Bỏ qua MỌI file từ điển (i18n.ts / i18n.en|de.ts / *.panels.ts / *.labels.ts):
// key trong đó vốn đã là chuỗi VI đã được dịch, quét như "nhãn dữ liệu" sẽ
// báo lỗi giả (bản DE cũ còn sót bị đòi bản EN trong khi thiếu EN vốn không
// làm người dùng DE thấy tiếng Việt).
for (const file of walk(SRC).filter(
  (p) => !/lib[\\/]i18n(\.(en|de)(\.(panels|labels))?)?\.tsx?$/.test(p),
)) {
  if (!/\.(ts|tsx)$/.test(file)) continue;
  // File nội dung đa ngữ tự chứa đã được luật 3f kiểm cấu trúc — không quét lại
  // ở đây (chuỗi VI trong bản `vi` là hợp lệ, bản dịch nằm ngay cùng file).
  if (selfTranslated.has(file)) continue;
  const source = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const isTechnical = (node) => {
    // So sánh hoặc tham số của hàm xử lý chuỗi → chuỗi kỹ thuật, không phải UI.
    let p = node.parent;
    for (let i = 0; i < 3 && p; i++, p = p.parent) {
      if (ts.isBinaryExpression(p)) return true;
      if (ts.isCallExpression(p)) {
        const callee = p.expression.getText(sf);
        if (
          /\.(includes|startsWith|endsWith|replace|replaceAll|split|match|test|indexOf|padStart|trim)$/.test(
            callee,
          )
        )
          return true;
        if (/^(translate|t|Array|String|JSON|Number|Math|Boolean)$/.test(callee)) return false;
        return true; // tham số hàm khác: coi là kỹ thuật (toast/API cần rà riêng)
      }
      if (ts.isPropertyAssignment(p) || ts.isPropertySignature(p)) {
        const name = p.name.getText(sf);
        // value/key/… và TÀI LIỆU TỪ KHOÁ (keywords/tags/patterns/phrases) là
        // chuỗi kỹ thuật để so khớp — không hiển thị cho người dùng.
        return /^(value|key|id|ids|punish|module|modules|action|actions|group|groups|type|kind|code|route|path|url|href|event|events|tag|tags|version|locale|lang|keyword|keywords|pattern|patterns|phrase|phrases|slug|alias|aliases|regex|trigger|triggers)$/.test(
          name,
        );
      }
    }
    return false;
  };
  const visitData = (node) => {
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      VIET.test(node.text)
    ) {
      if (!isTechnical(node))
        dataLabels.push({ file: rel(file), line: lineOf(node.getStart(sf)), text: node.text });
      return;
    }
    if (ts.isJsxAttribute(node)) return; // đã xử lý ở nhánh JSX
    ts.forEachChild(node, visitData);
  };
  visitData(sf);
}
const uniqueDataLabels = [];
const seenDataKeys = new Set();
for (const d of dataLabels) {
  if (seenDataKeys.has(d.text)) continue;
  seenDataKeys.add(d.text);
  uniqueDataLabels.push(d);
}
for (const d of uniqueDataLabels) {
  if (!enKeys.has(d.text))
    problems.push(`THIẾU EN (nhãn dữ liệu): ${d.file}:${d.line} — ${d.text}`);
}

// ── 3d. Nhãn dữ liệu render TRỰC TIẾP, không qua translate() ───────────────
// Rule 3c chỉ đòi CÓ bản EN. Nhưng nếu chỗ render vẫn viết {x.label} thì React
// không hề biết nhãn cần dịch → bấm EN vẫn thấy tiếng Việt (đúng lỗi người dùng
// báo). Bắt buộc phải là {translate(x.label)}.
// Miễn trừ: dữ liệu do NGƯỜI DÙNG nhập (tên giveaway, nội dung webhook, panel
// reaction-role từ DB) — dịch những thứ đó là sai.
const USER_DATA = /^(g|p|embed|rule|webhook|msg|message)\./;
const RAW_LABEL =
  /\{([A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*\??\.(?:label|desc|description|title|hint))\}/g;
for (const file of codeFiles) {
  if (!/\.tsx$/.test(file)) continue;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.includes("translate(") || line.includes("i18n-ok")) return;
    for (const m of line.matchAll(RAW_LABEL)) {
      // `key={f.title}` / `value={x.desc}` là thuộc tính, không phải chữ hiển thị.
      if (line.slice(0, m.index).trimEnd().endsWith("=")) continue;
      if (USER_DATA.test(m[1])) continue;
      problems.push(
        `CHƯA DỊCH (render nhãn): ${rel(file)}:${i + 1} — {${m[1]}} → bọc translate(${m[1]})`,
      );
    }
  });
}

// ── 3e. Mảng dữ liệu tiếng Việt render NGUYÊN tham số .map() ───────────────
// `{nukeModules.map((m) => <span>{m}</span>)}`: chuỗi VI nằm trong mảng khai
// báo NGOÀI JSX nên không phải JsxText (3) cũng chẳng phải {x.label} (3d) →
// cả hai cổng đều mù. Đây là lỗi thật đã lọt ra production: danh sách 32
// module ở trang chủ hiện nguyên tiếng Việt cho người dùng EN/DE.
// Miễn trừ: ghi chú `// i18n-ok: <lý do>` ngay trên lời gọi .map().
for (const file of codeFiles) {
  if (!/\.tsx$/.test(file)) continue;
  const source = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines = source.split(/\r?\n/);
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  // Mảng toàn chuỗi khai báo trong CHÍNH file này (mảng nhập từ file khác
  // không đủ dữ liệu để phán — bỏ qua, tránh báo nhầm).
  const viArrays = new Set();
  const collectArrays = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer) &&
      node.initializer.elements.some((el) => ts.isStringLiteral(el) && VIET.test(el.text))
    ) {
      viArrays.add(node.name.text);
    }
    ts.forEachChild(node, collectArrays);
  };
  collectArrays(sf);
  if (!viArrays.size) continue;
  const visitMaps = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "map" &&
      ts.isIdentifier(node.expression.expression) &&
      viArrays.has(node.expression.expression.text)
    ) {
      const cb = node.arguments[0];
      const param = cb && cb.parameters && cb.parameters[0] && cb.parameters[0].name;
      if (param && ts.isIdentifier(param)) {
        // `>{m}` = thẻ bao NỘI DUNG; `key={m}` (thuộc tính) không phải chữ hiển thị.
        const bare = new RegExp(`>\\s*\\{\\s*${param.text}\\s*\\}`);
        const line = lineOf(node.getStart(sf));
        const noted = lines.slice(Math.max(0, line - 3), line).some((l) => l.includes("i18n-ok"));
        if (bare.test(cb.getText(sf)) && !noted) {
          problems.push(
            `CHƯA DỊCH (render mảng): ${rel(file)}:${line} — {${param.text}} trong ` +
              `${node.expression.expression.text}.map(...) → bọc translate(${param.text})`,
          );
        }
      }
    }
    ts.forEachChild(node, visitMaps);
  };
  visitMaps(sf);
}

// ── 4. Cảnh báo mềm: bản dịch không còn dùng trong code ───────────────────
// Key chứa dấu nháy nằm trong code ở dạng escape (\") nên phải so cả bản
// đã escape — nếu chỉ so bản thô sẽ báo nhầm "bản dịch chết".
// Tính cả convex/*.ts: vài chuỗi VI sinh ra ở backend (lý do AI trả về) được
// web dịch lúc render — nếu chỉ quét src sẽ báo nhầm là "bản dịch chết".
const convexFiles = fs
  .readdirSync(path.join(ROOT, "convex"))
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
  .map((f) => path.join(ROOT, "convex", f));
const allCode = [...codeFiles, ...convexFiles].map((f) => fs.readFileSync(f, "utf8")).join("\n");
const deadKeys = [...enKeys].filter((k) => {
  if (k.length <= 3) return false;
  if (allCode.includes(k)) return false;
  const escaped = JSON.stringify(k).slice(1, -1);
  return !allCode.includes(escaped);
});

// ── Báo cáo ───────────────────────────────────────────────────────────────
console.log(
  `i18n: ${wrappedKeys.size} key translate() ⇄ ${enKeys.size} bản EN · ${deKeys.size} bản DE`,
);
if (rawText.length) {
  console.log(
    `\nℹ️  Còn ${rawText.length} dòng chữ Việt trong JSX chưa bọc translate() ` +
      "(câu bị nội suy {…} nhiều mảnh — cần gộp thành 1 key có placeholder {p0}):",
  );
  const rawShow = process.argv.includes("--all") ? rawText : rawText.slice(0, 8);
  for (const s of rawShow) console.log(`   · ${s.file}:${s.line} — ${s.text}`);
  if (rawShow.length < rawText.length)
    console.log(`   … còn ${rawText.length - rawShow.length} dòng`);
}
if (exprText.length) {
  console.log(
    `\nℹ️  ${exprText.length} chuỗi Việt nằm trong biểu thức JSX {} chưa bọc translate() ` +
      "(nhãn điều kiện, template literal, chuỗi hiển thị trực tiếp):",
  );
  const exprShow = process.argv.includes("--all") ? exprText : exprText.slice(0, 8);
  for (const s of exprShow) console.log(`   · ${s.file}:${s.line} — ${s.text}`);
  if (exprShow.length < exprText.length)
    console.log(`   … còn ${exprText.length - exprShow.length} dòng`);
}
if (softAttr.length) {
  console.log(
    `\nℹ️  ${softAttr.length} thuộc tính JSX có tiếng Việt chưa bọc translate() (rà tay):`,
  );
  const attrShow = process.argv.includes("--all") ? softAttr : softAttr.slice(0, 15);
  for (const s of attrShow) console.log(`   · ${s.file}:${s.line} — ${s.text}`);
  if (attrShow.length < softAttr.length)
    console.log(`   … còn ${softAttr.length - attrShow.length} mục`);
}
if (deadKeys.length) {
  console.log(
    `\nℹ️  ${deadKeys.length} bản dịch không còn xuất hiện trong code (có thể đã xoá UI):`,
  );
  for (const s of deadKeys.slice(0, 10)) console.log(`   · ${s.slice(0, 80)}`);
  if (deadKeys.length > 10) console.log(`   … còn ${deadKeys.length - 10} mục`);
}

if (orphanDeKeys.length) {
  console.log(
    `\nℹ️  ${orphanDeKeys.length} bản DE mồ côi (không có bản EN tương ứng — không bao giờ hiển thị):`,
  );
  for (const s of orphanDeKeys.slice(0, 10)) console.log(`   · ${s.slice(0, 80)}`);
  if (orphanDeKeys.length > 10) console.log(`   … còn ${orphanDeKeys.length - 10} mục`);
}

if (problems.length) {
  console.error(`\n❌ i18n guard: ${problems.length} mục chưa dịch / thiếu bản EN`);
  const all = process.argv.includes("--all");
  for (const p of all ? problems : problems.slice(0, 40)) console.error(`   ${p}`);
  if (!all && problems.length > 40)
    console.error(`   … còn ${problems.length - 40} mục (--all để in hết)`);
  console.error("\nThêm bản dịch vào src/lib/i18n.en.ts (key = nguyên chuỗi tiếng Việt).");
  process.exit(1);
}
console.log(`\n✅ i18n guard OK — mọi chuỗi người dùng đều có bản EN (0 FAIL)`);
