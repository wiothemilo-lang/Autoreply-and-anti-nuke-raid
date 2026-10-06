#!/usr/bin/env node
/**
 * run-all-tests.cjs — chạy toàn bộ test suites, tổng hợp kết quả, thoát khác 0
 * nếu có suite fail (dùng cho `npm test` và CI GitHub Actions).
 *
 * Chạy SONG SONG theo mặc định (tối đa 4 suite cùng lúc). Trước đây phải chạy tuần
 * tự vì 45 suite dùng chung `bot/test-djs-mock.cjs`; nay mỗi tiến trình có file mock
 * riêng (scripts/support/djs-mock-path.cjs) nên giẫm chân nhau không còn.
 *
 * Cờ:
 *   --ts         chạy suite .ts tầng Convex/Haimiya (bun) thay vì .cjs. Tách khỏi luồng
 *                .cjs để không đụng phép đo coverage của c8 (chỉ include bot/src).
 *   --jobs N     số suite chạy cùng lúc (mặc định min(4, số lõi); hoặc env TEST_JOBS).
 *   --serial     = --jobs 1 — tái hiện lỗi / đo thời gian từng suite.
 *   --no-retry   tắt chạy lại lẻ các suite đỏ (xem dưới).
 *   --dir <đường dẫn>  thư mục chứa suite (mặc định: thư mục của file này) — cho test
 *                của chính runner.
 * Env TEST_SUITE_TIMEOUT_MS đổi trần 120s/suite (test của runner dùng số nhỏ).
 *
 * Quy ước:
 *  - Suite cần tài nguyên ĐỘC QUYỀN (cổng cố định, Chromium + build dist) chạy lẻ sau
 *    khi pool xong: EXCLUSIVE bên dưới.
 *  - Suite chậm nhất chạy ĐẦU pool để đuôi ngắn (SLOW_FIRST).
 *  - Suite đỏ khi chạy song song được chạy lại MỘT lần ở chế độ lẻ. Xanh khi chạy lẻ →
 *    ⚠️ "nhạy tài nguyên/thời gian" (không làm đỏ cả lượt, nhưng in rõ tên để sửa);
 *    vẫn đỏ → lỗi thật. Dòng ⚠️ cố ý KHÔNG chứa ❌/THẤT BẠI (guardrails.js coi hai
 *    dấu đó là đỏ).
 *  - Mỗi suite chạy trong nhóm tiến trình riêng: quá hạn thì giết CẢ nhóm (Chromium,
 *    bun con) thay vì để mồ côi như execFileSync cũ.
 */
const { spawn } = require("child_process");
const os = require("os");
const path = require("path");
const fs = require("fs");

const argv = process.argv.slice(2);
const flagValue = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const TS_MODE = argv.includes("--ts");
const SUITE_DIR = path.resolve(flagValue("--dir") || __dirname);
const TIMEOUT_MS = Number(process.env.TEST_SUITE_TIMEOUT_MS) || 120_000;
const CPUS =
  typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
const JOBS = argv.includes("--serial")
  ? 1
  : Math.max(
      1,
      Math.floor(Number(flagValue("--jobs") || process.env.TEST_JOBS) || Math.min(4, CPUS)),
    );
const RETRY = !argv.includes("--no-retry") && JOBS > 1;

// Cổng cố định 127.0.0.1:8791 (kiira-proxy) và Chromium + build dist (browser-contracts).
const EXCLUSIVE = ["test-kiira-proxy", "test-browser-contracts"];
const SLOW_FIRST = [
  "test-backup-pipeline",
  "test-restore-e2e",
  "test-restore-pipeline",
  "test-register-slash",
  "test-false-positive",
  "test-external-app-guard",
  "test-alt-detection",
  "test-research-commands",
  "test-i18n",
  "test-chaos",
];

const baseName = (f) => f.replace(/\.(cjs|ts)$/, "");
const rank = (f) => {
  const i = SLOW_FIRST.indexOf(baseName(f));
  return i < 0 ? SLOW_FIRST.length : i;
};

const all = fs
  .readdirSync(SUITE_DIR)
  .filter((f) => (TS_MODE ? /^test-.*\.ts$/.test(f) : /^test-.*\.cjs$/.test(f)))
  .sort((a, b) => a.localeCompare(b));

// Không có suite nào = runner mất khả năng phát hiện (glob sai/đổi tên thư mục)
// → fail to, thay vì in "0/0 suites pass" rồi xanh.
if (all.length === 0) {
  console.error(
    `❌ Không tìm thấy suite ${TS_MODE ? "test-*.ts" : "test-*.cjs"} nào trong ${SUITE_DIR} — kiểm tra lại glob.`,
  );
  process.exit(1);
}

const exclusive = all.filter((f) => EXCLUSIVE.includes(baseName(f)));
const pool = all
  .filter((f) => !EXCLUSIVE.includes(baseName(f)))
  .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

const BUN_BIN =
  process.env.BUN_BIN ||
  ["/usr/local/bun/bin/bun", "/usr/local/bin/bun", "/usr/bin/bun"].find((candidate) =>
    fs.existsSync(candidate),
  ) ||
  "bun";
const RUNNER = TS_MODE ? BUN_BIN : "node";

/**
 * Hợp đồng số suite: AGENTS.md ("**N suites**") và CONTRACT_SUITES trong
 * .opencode/plugins/guardrails.js phải khớp số suite .cjs thật. Số liệu này từng lệch
 * 5 nơi mà không ai hay (README/verify.md/ship.md nói 41–80, thật là 81) vì chỉ có
 * người đếm tay. Chỉ kiểm khi chạy trọn bộ .cjs của repo (không --ts, không --dir).
 */
function checkSuiteContract() {
  if (TS_MODE || flagValue("--dir")) return;
  const root = path.resolve(__dirname, "..");
  const read = (rel) => {
    try {
      return fs.readFileSync(path.join(root, rel), "utf8");
    } catch {
      return null; // thiếu file (bản rút gọn) → không ép
    }
  };
  const guard = read(".opencode/plugins/guardrails.js")?.match(
    /const CONTRACT_SUITES = (\d+);/,
  )?.[1];
  const agents = read("AGENTS.md")?.match(/\*\*(\d+) suites\*\*/)?.[1];
  const bad = [];
  if (guard !== undefined && Number(guard) !== all.length) {
    bad.push(`.opencode/plugins/guardrails.js CONTRACT_SUITES=${guard}`);
  }
  if (agents !== undefined && Number(agents) !== all.length) {
    bad.push(`AGENTS.md "**${agents} suites**"`);
  }
  if (bad.length > 0) {
    console.error(
      `❌ Có ${all.length} suite .cjs nhưng ${bad.join(" và ")} — sửa CẢ HAI trong cùng commit (AGENTS.md, Pha 4).`,
    );
    process.exit(1);
  }
}
checkSuiteContract();

const live = new Set();
const killGroup = (child) => {
  try {
    if (process.platform === "win32") child.kill("SIGKILL");
    else process.kill(-child.pid, "SIGKILL");
  } catch {
    // đã thoát
  }
};
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    for (const child of live) killGroup(child);
    process.exit(130);
  });
}

/** Chờ thêm bấy nhiêu ms để đọc nốt stdio sau khi tiến trình chính của suite đã thoát. */
const STDIO_GRACE_MS = Number(process.env.TEST_STDIO_GRACE_MS) || 3000;

/** Chạy một suite; không bao giờ reject. */
function runSuite(suite) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const chunks = [];
    let timedOut = false;
    let settled = false;
    let timer;
    let grace;
    let child;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(grace);
      live.delete(child);
      // Con cháu đã thoát khỏi nhóm tiến trình có thể còn giữ pipe: đóng phía mình để không rò.
      child.stdout.destroy();
      child.stderr.destroy();
      resolve({
        suite,
        code: code === null ? 1 : code,
        timedOut,
        out: Buffer.concat(chunks).toString("utf8"),
        ms: Date.now() - t0,
      });
    };
    try {
      child = spawn(RUNNER, [path.join(SUITE_DIR, suite)], {
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
      });
    } catch (e) {
      resolve({ suite, code: 1, timedOut: false, out: String(e?.message || e), ms: 0 });
      return;
    }
    live.add(child);
    child.stdout.on("data", (d) => chunks.push(d));
    child.stderr.on("data", (d) => chunks.push(d));
    timer = setTimeout(() => {
      timedOut = true;
      killGroup(child);
    }, TIMEOUT_MS);
    child.on("error", (e) => chunks.push(Buffer.from(`\n${e.message}\n`)));
    // `close` chỉ phát khi MỌI stdio đã EOF, mà pipe được mọi con cháu kế thừa: một con cháu đã
    // thoát khỏi nhóm (setsid) mà còn giữ pipe khiến `close` không bao giờ tới và treo cả pool
    // tới hết timeout của job CI. Nên khi tiến trình chính đã thoát (kể cả do bị giết vì quá
    // hạn) chỉ chờ stdio thêm STDIO_GRACE_MS để đọc nốt dữ liệu rồi tự kết thúc.
    child.on("close", (code) => finish(code));
    child.on("exit", (code) => {
      grace = setTimeout(() => finish(code), STDIO_GRACE_MS);
    });
  });
}

/** Một lệnh console cho mỗi suite — kết quả các suite chạy song song không xen kẽ. */
function report(r) {
  const name = baseName(r.suite);
  if (r.code === 0) {
    // Trích dòng tổng kết (pass/fail) nếu suite có in.
    const tail = r.out.trim().split("\n").slice(-1)[0];
    console.log(`✅ ${name} (${(r.ms / 1000).toFixed(1)}s) — ${tail}`);
    return;
  }
  const head = `❌ ${name} — THẤT BẠI${r.timedOut ? ` (quá ${Math.round(TIMEOUT_MS / 1000)}s, đã giết nhóm tiến trình)` : ""}`;
  console.error([head, ...failureLines(r)].join("\n"));
}

/** Các dòng đáng xem của một lần chạy đỏ: dòng báo lỗi, không có thì 20 dòng cuối. */
function failureLines(r) {
  const lines = r.out.split("\n");
  // Bị kill vì quá hạn → in FULL tail, không lọc theo từ khóa. CI 06/10: kill
  // ở 300s chỉ thấy `ok 13` (dòng khớp từ khóa), không thấy breadcrumb tên
  // test đang treo vì dòng breadcrumb không chứa từ khóa lọc — đoán hoài
  // không biết treo ở đâu. Tail giữ nguyên thứ tự nên breadcrumb + TAP cuối
  // chỉ đúng chỗ chết.
  if (r.timedOut) {
    return lines
      .filter((l) => l.trim())
      .slice(-150)
      .map((l) => `   ${l.trim()}`);
  }
  const fails = lines
    .filter((l) => /FAIL|❌|✗|✖|Error|THẤT BẠI/.test(l) && !/\b0 (FAIL|fail|sai)\b/.test(l))
    .slice(0, 15);
  const shown = fails.length > 0 ? fails : lines.filter((l) => l.trim()).slice(-20);
  return shown.map((l) => `   ${l.trim()}`);
}

/** Chạy `list` với tối đa `jobs` tiến trình; gọi `onDone` mỗi khi một suite xong. */
async function runPool(list, jobs, onDone) {
  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const r = await runSuite(list[next++]);
      results.push(r);
      onDone(r);
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, list.length) }, worker));
  return results;
}

(async () => {
  console.log(
    `Chạy ${all.length} test suites (${RUNNER}${JOBS > 1 ? `, ${JOBS} song song` : ", tuần tự"})...\n`,
  );
  const t0 = Date.now();

  // Khi sẽ chạy lại suite đỏ thì chưa in lỗi ngay: một dòng ❌ in sớm rồi suite lại xanh
  // khi chạy lẻ sẽ làm cổng guardrails tưởng cả lượt đỏ.
  const held = [];
  const onDone = (r) => {
    if (r.code === 0 || !RETRY) report(r);
    else held.push(r);
  };

  const results = await runPool(pool, JOBS, onDone);
  for (const suite of exclusive) {
    const r = await runSuite(suite);
    results.push(r);
    report(r); // độc quyền + lẻ rồi: đỏ là đỏ thật, không có gì để chạy lại
  }

  const failed = results.filter((r) => r.code !== 0 && !held.includes(r));
  const flaky = [];
  if (held.length > 0) {
    console.log(
      `\n↻ ${held.length} suite đỏ khi chạy song song — chạy lại lẻ một lần để phân biệt lỗi thật với tranh chấp tài nguyên…`,
    );
    for (const first of held) {
      const again = await runSuite(first.suite);
      const name = baseName(first.suite);
      const firstNote = `lần chạy song song${first.timedOut ? ` (quá ${Math.round(TIMEOUT_MS / 1000)}s)` : ""}`;
      if (again.code === 0) {
        flaky.push(name);
        // Lỗi của lần chạy SONG SONG là chẩn đoán đáng giá nhất (EADDRINUSE, quá hạn dưới tải…)
        // nên không được vứt. Dấu đỏ trong đoạn trích được đổi để cổng guardrails.js không đọc
        // nhầm cả lượt là đỏ.
        console.log(
          [
            `⚠️ ${name} — đỏ khi chạy song song nhưng xanh khi chạy lẻ (${(again.ms / 1000).toFixed(1)}s): nghi nhạy tài nguyên/thời gian`,
            `   ${firstNote} đã ghi:`,
            ...failureLines(first).map((l) =>
              `  ${l}`.replace(/❌/g, "✗").replace(/THẤT BẠI/g, "thất bại"),
            ),
          ].join("\n"),
        );
        // Hiện trong giao diện GitHub Actions dưới dạng annotation (không đổi kết quả xanh/đỏ).
        if (process.env.GITHUB_ACTIONS === "true") {
          console.log(
            `::warning title=Suite nhạy tài nguyên::${name} đỏ khi chạy song song, xanh khi chạy lẻ`,
          );
        }
      } else {
        report(again);
        console.error(
          [`   (${firstNote} trước đó:)`, ...failureLines(first).map((l) => `  ${l}`)].join("\n"),
        );
        failed.push(again);
      }
    }
  }

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `\n${failed.length === 0 ? "✅" : "❌"} ${all.length - failed.length}/${all.length} suites pass (${secs}s)`,
  );
  if (flaky.length > 0) {
    console.log(
      `⚠️ ${flaky.length} suite chỉ xanh khi chạy lẻ: ${flaky.join(", ")} — sửa tính tất định của chúng (chạy --serial để kiểm)`,
    );
  }
  if (failed.length > 0) {
    console.error(
      `Suites thất bại: ${failed
        .map((r) => r.suite)
        .sort()
        .join(", ")}`,
    );
    process.exit(1);
  }
})();
