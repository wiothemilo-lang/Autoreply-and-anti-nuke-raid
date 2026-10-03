#!/usr/bin/env node
/**
 * scripts/check-timer-allowlist.cjs — Chặn `setInterval` MỚI ngoài allowlist (đợt #4).
 *
 * Vì sao cần cổng:
 *  - Đợt #4 chuyển phần việc có thể chuyển sang Convex cron và gom 5 vòng dọn
 *    RAM về MỘT timer (`bot/src/sweeper.js`). Nhưng quyết định kiến trúc đó
 *    chỉ sống trong tài liệu — chỉ cần một module mới tự `setInterval` là
 *    quyết định bị lùi, và sẽ chỉ lộ ra khi đọc tay toàn bộ code.
 *  - 20 timer còn lại là CÁI GIÁ đã biết: presence, flush heat, heartbeat,
 *    quét alt, metrics, snapshot cục bộ, canh bộ nhớ, tra cứu threat… mỗi cái
 *    có lý do giữ ở tiến trình bot (xem `docs/cron-migration.md`). Cổng này
 *    đóng danh sách đó thành HỢP ĐỒNG: thêm timer mới phải khai ở đây kèm lý
 *    do, và số timer chỉ giảm được sau khi review.
 *
 * Hợp đồng (so HAI CHIỀU — đây là phần quan trọng):
 *  1. Mọi `setInterval` trong `bot/src/**` phải khớp một mục allowlist
 *     (theo TÊN BIẾN được gán, không theo số dòng — số dòng trôi mỗi lần sửa).
 *  2. Mọi mục allowlist phải còn tồn tại trong code. Xoá timer mà quên sửa
 *     allowlist ⇒ FAIL, vì cổng không được im lặng để người khác tưởng còn.
 *     Hệ quả: "xoá 1 cái rồi thêm 1 cái khác trong cùng file" cũng bị bắt.
 *  3. Comment KHÔNG tính (chính nơi giải thích luật hay nhắc `setInterval`),
 *     và chuỗi trong code không được hiểu là comment.
 *
 * Chạy: node scripts/check-timer-allowlist.cjs [--self-test]
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BOT_SRC = path.join(ROOT, "bot", "src");

/**
 * Allowlist: `file` → { why, timers: [tên biến được gán] }.
 * `why` là lý do giữ vòng timer đó trong tiến trình bot — mục chú thích bắt buộc,
 * vì một mục không kèm lý do chính là chỗ allowlist sẽ bị lạm dụng.
 */
const ALLOWED_TIMERS = {
  "sweeper.js": {
    why: "timer DUY NHẤT được phép thêm: vòng dọn chung của tiến trình (đợt #4). Mọi việc dọn khác phải `registerSweep` thay vì dựng timer riêng.",
    timers: ["timer"],
  },
  "index.js": {
    why: "Các vòng gắn với ĐỜI SỐNG của bot (chạm Discord client hoặc đẩy số đo lên Convex) — không dựng được trong Convex cron vì không có tiến trình bot.",
    timers: [
      "presenceInterval",
      "heatInterval",
      "heartbeatInterval",
      "memMonitorInterval",
      "altScanInterval",
    ],
  },
  "tick.js": {
    why: "Vòng tick chu kỳ 3 phút (backup/restore/import/verify/webhook/cấu hình) và gia hạn lease claim 4 phút — cần chính Convex client để chạy.",
    timers: ["timer", "interval"],
  },
  "handlers/antinuke/index.js": {
    why: "Không còn timer ở đây nữa (đã gom vào sweeper, chu kỳ 20 giây) — giữ mục rỗng để thêm timer mới ở đây là FAIL, không phải im lặng.",
    timers: [],
  },
  "handlers/healthWatch.js": {
    why: "Canh đĩa/RAM trên VPS bằng `fs.statfs` rồi DM chủ — đọc đĩa của tiến trình bot, Convex cron không đọc được.",
    timers: ["timer"],
  },
  "timeoutWatch.js": {
    why: "Dọn bản ghi timeout hết hạn trong RAM mỗi 60s — dữ liệu chỉ có ở tiến trình.",
    timers: ["<anon>"],
  },
  "metrics.js": {
    why: "Đẩy số đo prom-client lên Convex; cần giữ `timer` để `stop()` được khi module tắt.",
    timers: ["timer"],
  },
  "metricsRuntime.js": {
    why: "Lấy mẫu số đo trong RAM (60s) và in ra stdout (5 phút) — không có ý nghĩa nếu chạy ngoài tiến trình.",
    timers: ["<push>#1", "<push>#2"],
  },
  "localSnapshot.js": {
    why: "Chụp snapshot cục bộ rồi đẩy lên — cần đĩa của VPS.",
    timers: ["timer"],
  },
  "memGuard.js": {
    why: "Canh bộ nhớ tiến trình; trả `stop()` cho index.js — chỉ đọc được RAM của chính tiến trình này.",
    timers: ["timer"],
  },
  "research.js": {
    why: "Nạp lại nghiên cứu 10 phút + nghiên cứu chậm 4 giờ; kết quả nạp vào RAM dùng lại liên tục.",
    timers: ["interval", "slowInterval"],
  },
  "threatEngine.js": {
    why: "Nạp feed URLhaus/OpenPhish/n-gram + self-test từ khoá; có hàm dừng riêng cho từng feed.",
    timers: ["urlhausInt", "openphishInt", "ngramInt", "stInt"],
  },
};

/**
 * Xoá COMMENT nhưng GIỮ NGUYÊN độ dài và số dòng (thay bằng khoảng trắng).
 *
 * Vì sao không dùng regex `//[^\n]*` như cổng khác: trong bot có rất nhiều
 * URL (`https://…`) trong chuỗi — regex đó sẽ nuốt mất phần còn lại của dòng,
 * tức là cổng có thể BỎ SÓT một `setInterval` thật nằm sau URL trên cùng dòng.
 * Ở đây đi qua máy trạng thái nên chuỗi không bị nhầm là comment.
 */
function blankComments(src) {
  const out = src.split("");
  let i = 0;
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " ";
  };
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      let j = i;
      while (j < src.length && src[j] !== "\n") j++;
      blank(i, j);
      i = j;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? src.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    i++;
  }
  return out.join("");
}

/**
 * Suy ra "tên" của một lần gọi `setInterval` — dùng để định danh ổn định bất
 * kể số dòng thay đổi:
 *  - `const presenceInterval = setInterval(` → `presenceInterval`
 *  - `timer = setInterval(`              → `timer`
 *  - `timers.push(setInterval(`           → `<push>` (đánh số thứ tự nếu nhiều)
 *  - `setInterval(` trần, không gán       → `<anon>` (đánh số thứ tự nếu nhiều)
 */
function timerNames(code) {
  const names = [];
  const re = /\bsetInterval\s*\(/g;
  const ASSIGN = /([A-Za-z_$][\w$]*)\s*=\s*[^=]*$/;
  const PUSH = /\.\s*push\s*\(\s*$/;
  let m;
  while ((m = re.exec(code))) {
    const before = code.slice(0, m.index);
    const cut = before.lastIndexOf("\n");
    const curLine = before.slice(cut + 1);
    // Nhìn lùi 1 dòng: `timers.push(` ở dòng trên, `setInterval(` ở dòng dưới.
    const prevLine = before.slice(0, cut).split("\n").pop() || "";
    let name = null;
    for (const line of [curLine, prevLine]) {
      const a = ASSIGN.exec(line);
      if (a) {
        name = a[1];
        break;
      }
      if (PUSH.test(line)) {
        name = "<push>";
        break;
      }
    }
    names.push(name || "<anon>");
  }
  // Tên trùng nhau trong cùng file (ví dụ hai `timers.push(setInterval(...))`) thì
  // đánh số THỨ TỰ cho TẤT CẢ bản sao — nếu chỉ đánh số từ bản thứ hai thì
  // allowlist phải ghi `<push>` cho cái đầu, khó đọc và dễ lệch khi thêm cái mới.
  const counts = new Map();
  for (const name of names) counts.set(name, (counts.get(name) || 0) + 1);
  const seen = new Map();
  return names.map((name) => {
    const n = (seen.get(name) || 0) + 1;
    seen.set(name, n);
    return counts.get(name) > 1 ? `${name}#${n}` : name;
  });
}

/** Mọi file .js dưới bot/src (bỏ node_modules). */
function listBotFiles(dir = BOT_SRC, base = BOT_SRC) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listBotFiles(full, base));
    else if (entry.name.endsWith(".js"))
      out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
}

/** Nguồn dạng Map<đường dẫn tương đối, mã nguồn> — nhận từ thật lẫn self-test. */
function loadSources() {
  return new Map(
    listBotFiles().map((rel) => [rel, fs.readFileSync(path.join(BOT_SRC, rel), "utf8")]),
  );
}

/** So code với allowlist → danh sách lỗi (rỗng = sạch). */
function checkSources(sources) {
  const errors = [];
  const found = new Map();
  for (const [rel, src] of sources) {
    const names = timerNames(blankComments(src));
    if (names.length > 0) found.set(rel, names);
  }

  for (const [rel, names] of found) {
    const entry = ALLOWED_TIMERS[rel];
    if (!entry) {
      errors.push(
        `${rel}: có ${names.length} setInterval (${names.join(", ")}) mà file KHÔNG có trong allowlist — việc dọn/nền mới phải đăng ký vào sweeper.js, không tự dựng timer`,
      );
      continue;
    }
    const allowed = new Set(entry.timers);
    for (const n of names) {
      if (!allowed.has(n)) {
        errors.push(
          `${rel}: setInterval "${n}" KHÔNG có trong allowlist. Thêm timer mới = quyết định kiến trúc mới: nếu nó chỉ dọn/trạng thái trong RAM thì dùng registerSweep của sweeper.js; nếu buộc phải có timer riêng thì khai ở đây kèm lý do`,
        );
      }
    }
  }

  for (const [rel, entry] of Object.entries(ALLOWED_TIMERS)) {
    if (!sources.has(rel)) continue; // file đã xoá — báo ở check-repo-map, không phải ở đây
    if (!found.has(rel)) {
      if (entry.timers.length === 0) continue; // mục "cấm im lặng" có chủ ý
      errors.push(
        `${rel}: allowlist khai ${entry.timers.length} timer nhưng code KHÔNG còn — đã xoá timer thì sửa allowlist luôn (cổng không để mục chết lại)`,
      );
      continue;
    }
    const actual = new Set(found.get(rel));
    for (const t of entry.timers) {
      if (!actual.has(t)) {
        errors.push(
          `${rel}: allowlist khai "${t}" nhưng code không còn biến đó — đổi tên/xoá timer mà quên cập nhật allowlist`,
        );
      }
    }
  }

  return errors;
}

/** Bộ tự kiểm: dựng lại trên nguồn thật để chứng minh cổng không mù. */
const SELF_TEST = [
  {
    desc: "nguồn thật hiện tại phải SẠCH",
    mutate: () => {},
    expect: 0,
  },
  {
    desc: "comment giải thích KHÔNG tính là timer",
    mutate: (files) =>
      set(
        files,
        "index.js",
        addTo(files.get("index.js"), "  // const fakeInterval = setInterval(() => {}, 1000);\n"),
      ),
    expect: 0,
  },
  {
    desc: "chuỗi chứa // không làm mất setInterval cùng dòng",
    mutate: (files) =>
      set(
        files,
        "timeoutWatch.js",
        addTo(
          files.get("timeoutWatch.js"),
          '  const u = "https://x.dev"; setInterval(() => {}, 1000);\n',
        ),
      ),
    expect: 1,
  },
  {
    desc: "thêm timer mới vào file ĐÃ có allowlist → FAIL",
    mutate: (files) =>
      set(
        files,
        "index.js",
        addTo(files.get("index.js"), "  const extraInterval = setInterval(() => {}, 1000);\n"),
      ),
    expect: 1,
  },
  {
    desc: "timer mới trong file CHƯA có trong allowlist → FAIL",
    mutate: (files) =>
      set(files, "handlers/brandNew.js", "const t = setInterval(() => {}, 1000);\n"),
    expect: 1,
  },
  {
    desc: "xoá timer đang khai (đổi tên biến) → FAIL cả 2 chiều",
    mutate: (files) =>
      set(
        files,
        "research.js",
        files.get("research.js").replace("slowInterval", "renamedInterval"),
      ),
    expect: 2,
  },
  {
    desc: "timer trần lặp thêm lần nữa phải đánh số thứ tự (2 cái lạ + 1 mục khai thừa)",
    mutate: (files) =>
      set(
        files,
        "timeoutWatch.js",
        addTo(files.get("timeoutWatch.js"), "  setInterval(() => {}, 1000);\n"),
      ),
    expect: 3,
  },
  {
    desc: "timer ĐÃ đăng ký qua sweeper không cần khai ở đây",
    mutate: (files) =>
      set(
        files,
        "handlers/filters.js",
        addTo(
          files.get("handlers/filters.js"),
          '  const { registerSweep } = require("../sweeper");\n  registerSweep("x", () => {}, 1000);\n',
        ),
      ),
    expect: 0,
  },
];

function set(files, rel, src) {
  files.set(rel, src);
  return files;
}
function addTo(src, code) {
  return `${src}\n${code}`;
}

function runSelfTest() {
  const base = loadSources();
  let failed = 0;
  console.log(
    `# self-test cổng allowlist timer (${base.size} file bot/src, ${Object.keys(ALLOWED_TIMERS).length} mục allowlist)`,
  );
  for (const c of SELF_TEST) {
    const files = new Map([...base.entries()].map(([k, v]) => [k, v]));
    c.mutate(files);
    const errs = checkSources(files);
    const ok = errs.length >= c.expect;
    if (!ok) failed++;
    console.log(
      `${ok ? "✅" : "❌"} self-test: ${c.desc} — mong ≥${c.expect} lỗi, nhận ${errs.length}` +
        (ok && c.expect > 0 ? ` → ${errs[0].slice(0, 92)}` : ""),
    );
  }
  if (failed > 0) {
    console.error(`\n❌ self-test FAIL — ${failed} case sai (cổng mù hoặc báo nhầm chỗ sạch)`);
    process.exit(1);
  }
  console.log("✅ self-test PASS — cổng bắt đúng timer lạ, không bị comment lừa");
}

function main() {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
    return;
  }
  const sources = loadSources();
  const errors = checkSources(sources);
  let total = 0;
  for (const src of sources.values()) total += timerNames(blankComments(src)).length;
  if (errors.length === 0) {
    console.log(
      `timer-allowlist OK — ${total} setInterval trong bot/src đều có trong allowlist (${Object.keys(ALLOWED_TIMERS).length} file, mọi mục kèm lý do)`,
    );
    process.exit(0);
  }
  console.error(`timer-allowlist LỆCH — ${errors.length} vi phạm:\n`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error(
    "\nSửa: việc dọn/trạng thái trong RAM → registerSweep của bot/src/sweeper.js (KHÔNG dựng timer). Buộc phải có timer riêng → thêm mục vào ALLOWED_TIMERS kèm lý do.",
  );
  process.exit(1);
}

module.exports = { checkSources, timerNames, blankComments, ALLOWED_TIMERS };

if (require.main === module) main();
