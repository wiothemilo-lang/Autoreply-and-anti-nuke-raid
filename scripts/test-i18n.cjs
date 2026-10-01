#!/usr/bin/env node
/**
 * test-i18n.cjs — khoá hệ đa ngôn ngữ VI/EN/DE (thêm 20/09/2026).
 *
 * Bối cảnh: web trước đây chỉ có tiếng Việt cứng trong JSX. Khi thêm tiếng Anh,
 * ba lỗi cấu trúc đã thật sự xảy ra và đều "im lặng" (UI vẫn chạy, chỉ sai
 * ngôn ngữ), nên phải có test chặn:
 *   1. Chuỗi bọc translate() mà thiếu bản EN → người dùng EN đọc tiếng Việt.
 *   2. Nhãn nằm trong hằng số cấp module (NAV_ITEMS của sidebar) — không bao
 *      giờ được dịch vì eval một lần lúc import.
 *   3. Quên gắn LangProvider, hoặc App không phải consumer → đổi ngôn ngữ
 *      nhưng cây UI không re-render (React bail-out khi element không đổi).
 *   4. Chữ Việt nằm TRỰC TIẾP trong JSX (kể cả trong {…} của biểu thức và trong
 *      nhãn dữ liệu cấp module) — không có translate() nào để dịch. Đợt trước
 *      chỉ rà bằng regex theo dòng nên bỏ sót text node một từ và cả nhóm trong
 *      {"…"}; nay check-i18n.cjs bắt bằng parser TypeScript và FAIL cứng.
 *   5. Mảng dữ liệu tiếng Việt render NGUYÊN tham số .map() ({m}) — mảng khai
 *      báo ngoài JSX nên không phải JsxText cũng chẳng phải {x.label}; đã lọt
 *      ra production ở danh sách 32 module trang chủ (22/09/2026).
 *
 * Ngoài ra khoá: định dạng ngày/giờ theo ngôn ngữ (bug locale rác "vi-VV"),
 * công tắc ngôn ngữ có mặt ở chrome mọi trang, và Convex nhận lang để AI trả
 * lời đúng ngôn ngữ người dùng chọn. Tiếng Đức (DE) phải đủ 100% key EN —
 * thiếu là lỗi cứng (người dùng DE sẽ đọc tiếng Anh nguyên bản).
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

let pass = 0;
let fail = 0;
function check(label, cond) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    fail++;
    console.error(`  ❌ ${label}`);
  }
}

// ─── 1. Lõi i18n: API + mặc định + placeholder + locale ─────────────────────
const i18n = read("src/lib/i18n.tsx");
check(
  "i18n.tsx export LangProvider/useT/translate/dateLocale/currentLanguage",
  /export function LangProvider/.test(i18n) &&
    /export function useT/.test(i18n) &&
    /export function translate/.test(i18n) &&
    /export function dateLocale/.test(i18n) &&
    /export function currentLanguage/.test(i18n),
);
check(
  "translate() rơi về chuỗi VI khi thiếu bản dịch (không vỡ UI)",
  /lookupTranslation\(currentLang, s\) \?\? s/.test(i18n) &&
    /lookupTranslation\(lang, s\) \?\? s/.test(i18n),
);
// Từ điển nạp LƯỜI: đo 30/09/2026 hai từ điển chiếm ~404 KB / 509 KB chunk entry.
// Import tĩnh quay lại là kéo cả EN lẫn DE về cho người dùng tiếng Việt.
const dictEn = read("src/lib/i18n.dict.en.ts");
const dictDe = read("src/lib/i18n.dict.de.ts");
const main0 = read("src/main.tsx");
check(
  "i18n.tsx KHÔNG import tĩnh từ điển EN/DE (chỉ import() động theo ngôn ngữ)",
  !/^import .* from "\.\/i18n\.(en|de)(\.panels|\.labels)?";/m.test(i18n) &&
    /import\("\.\/i18n\.dict\.en"\)/.test(i18n) &&
    /import\("\.\/i18n\.dict\.de"\)/.test(i18n),
);
check(
  "Từ điển EN gộp 3 file (i18n.en.ts + i18n.en.panels.ts + i18n.en.labels.ts) — không mất bản dịch",
  /import \{ EN \} from "\.\/i18n\.en"/.test(dictEn) &&
    /import \{ EN_PANELS \} from "\.\/i18n\.en\.panels"/.test(dictEn) &&
    /import \{ EN_LABELS \} from "\.\/i18n\.en\.labels"/.test(dictEn) &&
    /\{ \.\.\.EN, \.\.\.EN_PANELS, \.\.\.EN_LABELS \}/.test(dictEn) &&
    fs.existsSync(path.join(ROOT, "src/lib/i18n.en.panels.ts")) &&
    fs.existsSync(path.join(ROOT, "src/lib/i18n.en.labels.ts")),
);
check(
  "Từ điển DE gộp 3 file (i18n.de.ts + i18n.de.panels.ts + i18n.de.labels.ts) — không mất bản dịch",
  /import \{ DE \} from "\.\/i18n\.de"/.test(dictDe) &&
    /import \{ DE_PANELS \} from "\.\/i18n\.de\.panels"/.test(dictDe) &&
    /import \{ DE_LABELS \} from "\.\/i18n\.de\.labels"/.test(dictDe) &&
    /\{ \.\.\.DE, \.\.\.DE_PANELS, \.\.\.DE_LABELS \}/.test(dictDe),
);
check(
  "main.tsx chờ từ điển ngôn ngữ ban đầu trước khi vẽ lần đầu (không nháy tiếng Việt)",
  /await prepareInitialLanguage\(\)/.test(main0) &&
    main0.indexOf("await prepareInitialLanguage()") < main0.indexOf(".render("),
);
check("Lưu lựa chọn ngôn ngữ vào localStorage (protogon-lang)", /protogon-lang/.test(i18n));
check("Cập nhật <html lang> khi đổi ngôn ngữ", /document\.documentElement\.lang = lang/.test(i18n));

// ─── 2. Gắn provider + consumer (điều kiện để đổi ngôn ngữ re-render) ──────
const main = read("src/main.tsx");
check("main.tsx bọc app trong LangProvider", /<LangProvider>/.test(main));
check(
  "LangProvider nằm NGOÀI mọi provider khác (dịch được cả màn hình lỗi)",
  main.indexOf("<LangProvider>") < main.indexOf("<ConvexProvider"),
);
const app = read("src/App.tsx");
check(
  "App.tsx là consumer của LangContext (useT) → đổi ngôn ngữ vẽ lại toàn cây",
  /const \{ lang \} = useT\(\);/.test(app),
);
check(
  "RouteMetadataSync đồng bộ title/metadata và phụ thuộc lang",
  /syncRouteMetadata\(pathname, lang\)/.test(app) && /\}, \[pathname, lang\]\);/.test(app),
);

// ─── 3. Công tắc ngôn ngữ có ở chrome mọi trang ────────────────────────────
const switchSrc = read("src/components/LangSwitch.tsx");
check("LangSwitch dùng useT (tự re-render khi đổi ngôn ngữ)", /useT\(\)/.test(switchSrc));
check(
  "LangSwitch có aria-label + aria-pressed (a11y)",
  /aria-label=\{t\("Ngôn ngữ"\)\}/.test(switchSrc) &&
    /aria-pressed=\{lang === code\}/.test(switchSrc),
);

const OPTIONS_SRC = read("src/components/LangSwitch.tsx");
check(
  "LangSwitch có 3 nút VI/EN/DE",
  /\["vi", "VI"\]/.test(OPTIONS_SRC) &&
    /\["en", "EN"\]/.test(OPTIONS_SRC) &&
    /\["de", "DE"\]/.test(OPTIONS_SRC),
);

const chrome = [
  "src/components/Taskbar.tsx",
  "src/components/landing/Nav.tsx",
  "src/pages/Dashboard.tsx",
  "src/pages/GuildPage.tsx",
  "src/pages/Monitor.tsx",
  "src/pages/Admin.tsx",
  "src/pages/StatsPage.tsx",
  "src/pages/GuildHistory.tsx",
  "src/pages/AuthPage.tsx",
];
for (const f of chrome) {
  const src = read(f);
  check(`${f} có <LangSwitch`, /<LangSwitch/.test(src));
}

// ─── 4. KHÔNG còn nhãn sidebar ở dạng chuỗi thô ────────────────────────────
const guildPage = read("src/pages/GuildPage.tsx");
check(
  "Nhãn NAV_ITEMS được dịch lúc render (translate(item.label))",
  /translate\(item\.label\)/.test(guildPage),
);

// ─── 5. Locale ngày/giờ đi qua dateLocale(), không hardcode ────────────────
const walk = (dir) =>
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) return walk(p);
    return /\.(tsx?|jsx?)$/.test(e.name) && !/i18n\.(en|tsx)$/.test(e.name) ? [p] : [];
  });
const srcFiles = walk("src");
const hardcodedLocale = srcFiles.filter((f) => /"vi-VN"|"vi-VV"/.test(read(f)));
check(
  `Không file nào hardcode locale ngày/giờ (còn: ${hardcodedLocale.join(", ") || "không"})`,
  hardcodedLocale.length === 0,
);
check(
  'Bug locale rác "vi-VV" ở WebhookPanel đã hết',
  !read("src/components/dashboard/WebhookPanel.tsx").includes("vi-VV"),
);

// ─── 6. Chat Haimiya: phần giới thiệu + chrome phải có bản EN ──────────────
const en = read("src/lib/i18n.en.ts");
const kb = read("src/lib/haimiya.ts");
const greeting = kb.match(/export const GREETING\s*=\s*\n?\s*"((?:[^"\\]|\\.)*)"/)[1];
check(
  "GREETING của Haimiya có bản EN (phần giới thiệu đầu)",
  en.includes(JSON.parse(`"${greeting}"`)),
);
for (const m of kb
  .match(/export const QUICK_QUESTIONS\s*=\s*\[([\s\S]*?)\]/)[1]
  .matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
  check(
    `Câu hỏi gợi ý có bản EN: ${JSON.parse(`"${m[1]}"`).slice(0, 40)}`,
    en.includes(JSON.parse(`"${m[1]}"`)),
  );
}
check(
  "Chat dịch tin nhắn + gợi ý lúc render (đổi ngôn ngữ cập nhật ngay)",
  /translate\(m\.text\)/.test(read("src/components/HaimiyaChat.tsx")) &&
    /translate\(s\)/.test(read("src/components/HaimiyaChat.tsx")),
);

// ─── 7. Backend AI nhận ngôn ngữ người dùng chọn ───────────────────────────
const convexHaimiya = read("convex/haimiya.ts");
check(
  "haimiya.ask nhận arg lang (vi|en|de) — không phá call cũ vì optional",
  /lang: v\.optional\(v\.union\(v\.literal\("vi"\), v\.literal\("en"\), v\.literal\("de"\)\)\)/.test(
    convexHaimiya,
  ),
);
check(
  "System prompt có placeholder {LANG} và được thay theo lựa chọn",
  /Trả lời bằng \{LANG\}/.test(convexHaimiya) &&
    /SYSTEM_PROMPT\.replace\(\s*"\{LANG\}"/.test(convexHaimiya),
);
check(
  "HaimiyaChat gửi currentLanguage() lên Convex",
  /lang: currentLanguage\(\)/.test(read("src/components/HaimiyaChat.tsx")),
);

// ─── 8. Lá chắn CI: mọi chuỗi người dùng phải có bản EN ───────────────────
// Bắt bằng parser TypeScript (không phải regex theo dòng) → phủ cả text node
// nhiều dòng, text node một từ, góc {"…"} và {cond ? "A" : "B"}.
const guardSrc = read("scripts/check-i18n.cjs");
check(
  "check-i18n.cjs phát hiện chữ Việt bằng parser TypeScript (ts.isJsxText)",
  /ts\.isJsxText/.test(guardSrc) && /CHƯA DỊCH/.test(guardSrc),
);
check(
  "check-i18n.cjs đọc cả 2 bộ từ điển EN + DE (không bỏ sót ngôn ngữ)",
  /i18n\.en\.panels\.ts/.test(guardSrc) &&
    /i18n\.de\.labels\.ts/.test(guardSrc) &&
    /THIẾU DE/.test(guardSrc),
);
check(
  "Không còn chữ Việt chưa bọc translate() trong JSX (0 mục)",
  execFileSync("node", [path.join(__dirname, "check-i18n.cjs"), "--all"], {
    cwd: ROOT,
    encoding: "utf8",
  }).includes("0 FAIL"),
);

let guardOk = false;
let guardOut;
try {
  execFileSync("node", [path.join(__dirname, "check-i18n.cjs")], {
    cwd: ROOT,
    encoding: "utf8",
  });
  guardOk = true;
} catch (e) {
  guardOut = `${e.stdout || ""}\n${e.stderr || ""}`;
}
check("scripts/check-i18n.cjs xanh (không key nào thiếu bản EN/DE)", guardOk);
if (!guardOk) console.error(String(guardOut).split("\n").slice(0, 12).join("\n"));

// ─── 9. Guard i18n phải khớp key CÓ ESCAPE (\n, dấu " bên trong) ────────────
// Bug thật (22/09): khi đọc từ điển, nhánh NHÁY ĐƠN lấy nguyên văn chuỗi nên
// key chứa `\n` hay dấu " không bao giờ khớp key trong code — bản dịch đã có
// mà vẫn báo "THIẾU EN" (lộ ra đúng lúc bọc translate() cho câu xác nhận khôi
// phục nhiều đoạn). Test dựng một repo tí hon rồi chạy CHÍNH guard thật.
const FIXTURE = path.join(__dirname, "_i18n-fixture");
const NEWLINE_KEY_LIT = "'Dòng một\\ndòng hai'";
// Nhãn tiếng Việt của mảng dữ liệu dùng ở mục 11 (đã có bản EN/DE trong fixture).
const ARRAY_LABEL = "Chống ban hàng loạt";
const QUOTE_KEY_LIT = '"Nhãn \\"trích dẫn\\" kèm \\n xuống dòng"';

function makeFixture(codeExtra, extraFiles) {
  fs.rmSync(FIXTURE, { recursive: true, force: true });
  const put = (rel, body) => {
    const p = path.join(FIXTURE, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  };
  for (const [rel, body] of Object.entries(extraFiles || {})) put(rel, body);
  put("scripts/check-i18n.cjs", read("scripts/check-i18n.cjs")); // chạy ĐÚNG guard của repo
  put("convex/.keep", "");
  put(
    "src/App.tsx",
    [
      "import { translate } from './lib/i18n';",
      `export const a = translate(${NEWLINE_KEY_LIT});`,
      `export const b = translate(${QUOTE_KEY_LIT});`,
      codeExtra || "",
      "export default function App() { return <div />; }",
    ].join("\n"),
  );
  put(
    "src/lib/i18n.en.ts",
    [
      "export const EN: Record<string, string> = {",
      `  ${NEWLINE_KEY_LIT}: 'line one\\nline two',`,
      `  ${QUOTE_KEY_LIT}: "Label \\"quoted\\" with \\n newline",`,
      `  "${ARRAY_LABEL}": "Anti mass ban",`,
      "};",
    ].join("\n"),
  );
  put(
    "src/lib/i18n.de.ts",
    [
      "export const DE: Record<string, string> = {",
      `  ${NEWLINE_KEY_LIT}: 'Zeile eins\\nZeile zwei',`,
      `  ${QUOTE_KEY_LIT}: "Beschriftung \\"zitiert\\" mit \\n Umbruch",`,
      `  "${ARRAY_LABEL}": "Anti-Massen-Ban",`,
      "};",
    ].join("\n"),
  );
}

function runFixtureGuard() {
  try {
    // stdio ghim rõ ràng: mặc định stderr của tiến trình con được đẩy thẳng ra
    // stderr của suite → log test đỏ nhoè dù assert đang xanh (gây hiểu nhầm).
    const out = execFileSync("node", [path.join(FIXTURE, "scripts/check-i18n.cjs")], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, out: String(out) };
  } catch (e) {
    return { ok: false, out: `${e.stdout || ""}\n${e.stderr || ""}` };
  }
}

try {
  makeFixture("");
  const escaped = runFixtureGuard();
  check(
    'Guard i18n khớp key từ điển có escape (\\n, dấu " bên trong) — không báo THIẾU EN oan',
    escaped.ok,
  );
  if (!escaped.ok) console.error(escaped.out.split("\n").slice(0, 8).join("\n"));

  // Đối chứng: fixture thiếu bản dịch THẬT thì guard phải đổ — chứng minh
  // phép thử trên không "xanh vô nghĩa" vì harness hỏng.
  makeFixture("export const c = translate('Chưa có bản dịch');");
  const missing = runFixtureGuard();
  check(
    "Guard i18n vẫn bắt được key dùng mà thiếu bản EN (đối chứng)",
    !missing.ok && /THIẾU EN/.test(missing.out),
  );
} finally {
  fs.rmSync(FIXTURE, { recursive: true, force: true });
}

// ─── 10. Guard i18n báo (MỀM) bản DE mồ côi — không được làm đỏ CI ─────────
// Key DE không có bản EN tương ứng là rác không bao giờ hiển thị (tra cứu
// theo chuỗi VI, thiếu EN thì rơi về VI). Cổng phải BÁO nhưng vẫn xanh: nợ vệ
// sinh từ điển không được chặn ship.
try {
  makeFixture("");
  const dePath = path.join(FIXTURE, "src/lib/i18n.de.ts");
  fs.writeFileSync(
    dePath,
    fs
      .readFileSync(dePath, "utf8")
      .replace("};", `  "Chuỗi mồ côi không có EN": "verwaiste Zeile",\n};`),
  );
  const orphan = runFixtureGuard();
  check(
    "Guard i18n báo MỀM bản DE mồ côi (key DE không có bản EN) — vẫn xanh",
    orphan.ok && /mồ côi/.test(orphan.out),
  );
  if (!(orphan.ok && /mồ côi/.test(orphan.out)))
    console.error(orphan.out.split("\n").slice(0, 6).join("\n"));
} finally {
  fs.rmSync(FIXTURE, { recursive: true, force: true });
}

// ─── 11. Guard bắt mảng dữ liệu render NGUYÊN tham số .map() ───────────────
// Bug thật (22/09): 2 danh sách module ở trang chủ render {m} thẳng nên người
// dùng EN/DE vẫn đọc tiếng Việt — mảng khai báo ngoài JSX nên cổng JsxText và
// cổng {x.label} đều không thấy. Guard phải bắt, và bọc translate() thì yên.
try {
  makeFixture(
    [
      "const mods = ['" + ARRAY_LABEL + "'];",
      "export function List() {",
      "  return <div>{mods.map((m) => <span key={m}>{m}</span>)}</div>;",
      "}",
    ].join("\n"),
  );
  const bare = runFixtureGuard();
  check(
    "Guard i18n bắt được mảng VI render {m} thẳng trong .map() (chưa bọc translate)",
    !bare.ok && /render mảng/.test(bare.out),
  );
  if (bare.ok || !/render mảng/.test(bare.out))
    console.error(bare.out.split("\n").slice(0, 8).join("\n"));

  // Đối chứng: bọc translate(m) thì mảng dữ liệu hợp lệ → guard xanh.
  makeFixture(
    [
      "const mods = ['" + ARRAY_LABEL + "'];",
      "export function List() {",
      "  return <div>{mods.map((m) => <span key={m}>{translate(m)}</span>)}</div>;",
      "}",
    ].join("\n"),
  );
  const wrapped = runFixtureGuard();
  check("Guard i18n cho qua khi mảng VI được bọc translate(m)", wrapped.ok);
  if (!wrapped.ok) console.error(wrapped.out.split("\n").slice(0, 8).join("\n"));
} finally {
  fs.rmSync(FIXTURE, { recursive: true, force: true });
}

// ─── 12. Cổng nội dung đa ngữ tự chứa (văn bản pháp lý) ─────────────────────
// Trang pháp lý cần văn bản dài 3 thứ tiếng — không nhét vào từ điển key-VI
// được. File đánh dấu `@i18n-content` vì thế được MIỄN luật "nhãn dữ liệu",
// nhưng phải qua kiểm tra cấu trúc vi/en/de. Nếu cổng chỉ miễn mà không kiểm
// thì đó là lỗ mở để mọi chuỗi VI lọt ra người dùng EN/DE.
const CONTENT_OK = [
  "// @i18n-content: fixture",
  "export const DOCS = {",
  "  vi: { name: 'Điều khoản sử dụng', sections: ['Mục một', 'Mục hai'] },",
  "  en: { name: 'Terms of Service', sections: ['Section one', 'Section two'] },",
  "  de: { name: 'Nutzungsbedingungen', sections: ['Abschnitt eins', 'Abschnitt zwei'] },",
  "};",
].join("\n");
const CONTENT_MISSING_DE = CONTENT_OK.replace(", 'Abschnitt zwei'", "");
try {
  // 12a. Đủ 3 ngôn ngữ → cổng xanh (nội dung dài không cần vào từ điển).
  makeFixture("", { "src/lib/content.ts": CONTENT_OK });
  const okContent = runFixtureGuard();
  check("Cổng i18n cho qua file @i18n-content có đủ bản vi/en/de", okContent.ok);
  if (!okContent.ok) console.error(okContent.out.split("\n").slice(0, 8).join("\n"));

  // 12b. Thiếu một nhánh DE → cổng PHẢI đổ (miễn luật cũ KHÔNG có nghĩa là bỏ kiểm).
  makeFixture("", { "src/lib/content.ts": CONTENT_MISSING_DE });
  const missingDe = runFixtureGuard();
  check(
    "Cổng i18n bắt được nội dung @i18n-content thiếu nhánh DE",
    !missingDe.ok && /THIẾU DE \(nội dung đa ngữ\)/.test(missingDe.out),
  );
  if (missingDe.ok || !/THIẾU DE \(nội dung đa ngữ\)/.test(missingDe.out))
    console.error(missingDe.out.split("\n").slice(0, 8).join("\n"));

  // 12c. Đối chứng: CÙNG nội dung nhưng KHÔNG có marker → vẫn bị luật "nhãn dữ
  //      liệu" bắt (chứng minh 12a xanh là nhờ kiểm cấu trúc, không phải lỗ).
  makeFixture("", { "src/lib/content.ts": CONTENT_OK.replace("// @i18n-content: fixture\n", "") });
  const unmarked = runFixtureGuard();
  check(
    "Không có marker @i18n-content thì chuỗi VI vẫn bị bắt là chưa dịch (đối chứng)",
    !unmarked.ok && /nhãn dữ liệu/.test(unmarked.out),
  );
} finally {
  fs.rmSync(FIXTURE, { recursive: true, force: true });
}

console.log(`\nKết quả i18n suite: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
