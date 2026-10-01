// TEST: scripts/run-all-tests.cjs — chính cái runner mà mọi cổng (CI, guardrails) dựa vào.
// Chạy: node scripts/test-run-all-tests.cjs
//
// Vì sao cần test: runner từng chạy tuần tự bằng execFileSync; nay chạy song song, có
// retry lẻ, nhóm tiến trình, làn độc quyền và hợp đồng số suite. Lỗi ở đây hoặc làm
// CI xanh giả (nuốt suite đỏ), hoặc đỏ giả (suite nhạy tranh chấp), hoặc để mồ côi
// Chromium khi quá hạn. Mọi kịch bản chạy trên suite GIẢ trong thư mục tạm (--dir)
// nên không tốn thời gian của bộ thật.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const RUNNER = path.join(__dirname, "run-all-tests.cjs");
let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  console.log(
    `${ok ? "PASS" : "FAIL"} ${label}${ok || !detail ? "" : ` — ${String(detail).slice(0, 400)}`}`,
  );
  ok ? pass++ : fail++;
};

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "protogon-runner-"));
process.on("exit", () => fs.rmSync(tmpRoot, { recursive: true, force: true }));

/** Tạo thư mục suite giả: { "test-a.cjs": "<mã>" }. */
function fixture(name, files) {
  const dir = path.join(tmpRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [f, code] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), code);
  return dir;
}
const run = (args, env = {}) =>
  spawnSync(process.execPath, [RUNNER, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
    timeout: 60_000,
  });
const out = (r) => `${r.stdout}\n${r.stderr}`;

const PASS = `console.log("Kết quả: 3 pass, 0 fail");`;

// ── 1. Tất cả xanh ──
{
  const dir = fixture("ok", { "test-a.cjs": PASS, "test-b.cjs": PASS });
  const r = run(["--dir", dir]);
  check(
    "tất cả xanh → exit 0 + tổng kết đúng",
    r.status === 0 && /✅ 2\/2 suites pass/.test(r.stdout),
    out(r),
  );
  check(
    "in dòng tổng kết của từng suite",
    /✅ test-a \(.*\) — Kết quả: 3 pass, 0 fail/.test(r.stdout),
  );
  check("không có dấu đỏ nào khi xanh", !/❌|THẤT BẠI/.test(out(r)));
}

// ── 2. Suite đỏ: exit 1, nêu đúng lý do, in MỘT lần ──
{
  const dir = fixture("fail", {
    "test-a.cjs": PASS,
    "test-b-fail.cjs": `console.log("FAIL something broke"); console.log("Error: boom"); process.exit(1);`,
    // Suite chết bằng ngoại lệ không có dòng FAIL/Error chuẩn → vẫn phải thấy đuôi log.
    "test-c-crash.cjs": `console.log("bắt đầu"); console.log("dòng cuối cùng trước khi chết"); process.exit(3);`,
  });
  const r = run(["--dir", dir, "--no-retry"]);
  const o = out(r);
  check("suite đỏ → exit 1", r.status === 1, r.status);
  check(
    "nêu ❌ + THẤT BẠI + dòng FAIL thật",
    /❌ test-b-fail — THẤT BẠI/.test(o) && /FAIL something broke/.test(o),
    o,
  );
  check(
    "suite chết không có dòng FAIL vẫn hiện đuôi log (không báo trống)",
    /dòng cuối cùng trước khi chết/.test(o),
    o,
  );
  check(
    "tổng kết đỏ + danh sách suite thất bại",
    /❌ 1\/3 suites pass/.test(o) && /Suites thất bại: test-b-fail\.cjs, test-c-crash\.cjs/.test(o),
    o,
  );
  check("mỗi suite đỏ chỉ được in MỘT lần", (o.match(/❌ test-b-fail/g) || []).length === 1, o);

  // Thứ tự hoàn thành giữa hai suite tức thì là ngẫu nhiên: bảng tổng kết phải theo TÊN
  // (ổn định), nếu không khẳng định trên sẽ đỏ giả khi máy bận.
  check(
    "danh sách thất bại theo tên suite, không theo thứ tự hoàn thành",
    /Suites thất bại: test-b-fail\.cjs, test-c-crash\.cjs\s*$/.test(o.trim()),
    o,
  );

  // Có retry, suite vẫn đỏ ở lần chạy lẻ: lỗi của lần chạy SONG SONG trước đó không được vứt.
  const retried = run(["--dir", dir, "--jobs", "2"]);
  const ro = out(retried);
  check("retry vẫn đỏ → exit 1", retried.status === 1, retried.status);
  check(
    "vẫn đỏ sau chạy lẻ: in lại lỗi của lần chạy song song trước đó",
    /lần chạy song song trước đó/.test(ro) && (ro.match(/FAIL something broke/g) || []).length >= 2,
    ro,
  );
}

// ── 3. Nhạy tranh chấp: đỏ lần đầu, xanh khi chạy lại lẻ ──
// Suite giả đỏ ở lần chạy ĐẦU rồi xanh (đếm lần chạy qua file): mô phỏng suite nhạy
// tranh chấp mà KHÔNG phụ thuộc tốc độ máy. Bản trước dùng marker + sleep nên có thể
// xanh giả trên runner chậm (hai tiến trình khởi động lệch hơn cửa sổ chờ).
{
  const J = JSON.stringify;
  const attempts = path.join(tmpRoot, "flaky.attempts");
  const log = path.join(tmpRoot, "flaky.log");
  const dir = fixture("flaky", {
    "test-a-flaky.cjs":
      `const fs=require("fs");const A=${J(attempts)},L=${J(log)};` +
      `const n=(fs.existsSync(A)?Number(fs.readFileSync(A,"utf8")):0)+1;fs.writeFileSync(A,String(n));` +
      `fs.appendFileSync(L,"flaky "+n+" "+Date.now()+"\\n");` +
      `if(n===1){console.log("  ❌ nhãn lỗi giả lập");console.log("FAIL lần đầu (giả lập tranh chấp)");process.exit(1);}` +
      `console.log("Kết quả: flaky xanh ở lần "+n);`,
    "test-b-slow.cjs":
      `const fs=require("fs");const L=${J(log)};` +
      `setTimeout(()=>{fs.appendFileSync(L,"slow-end 0 "+Date.now()+"\\n");console.log("Kết quả: slow xong");},1200);`,
  });
  const reset = () => {
    fs.rmSync(attempts, { force: true });
    fs.rmSync(log, { force: true });
  };
  const attemptCount = () => (fs.existsSync(attempts) ? fs.readFileSync(attempts, "utf8") : "0");

  reset();
  const r = run(["--dir", dir, "--jobs", "2"], { GITHUB_ACTIONS: "" });
  const o = out(r);
  check(
    "đỏ lần đầu + xanh khi chạy lại lẻ → exit 0 (không đỏ cả lượt)",
    r.status === 0 && /✅ 2\/2 suites pass/.test(o),
    o,
  );
  check(
    "báo rõ ⚠️ nhạy tài nguyên kèm tên suite",
    /⚠️ test-a-flaky — đỏ khi chạy song song nhưng xanh khi chạy lẻ/.test(o),
    o,
  );
  check(
    "tổng kết nhắc danh sách suite chỉ xanh khi chạy lẻ",
    /chỉ xanh khi chạy lẻ: test-a-flaky/.test(o),
    o,
  );
  check("KHÔNG in ❌/THẤT BẠI (guardrails.js coi đó là đỏ)", !/❌|THẤT BẠI/.test(o), o);
  check("chạy lại đúng MỘT lần (2 lượt tổng cộng)", attemptCount() === "2", attemptCount());
  check(
    "in lại chẩn đoán của lần chạy song song (không vứt)",
    /lần chạy song song đã ghi:/.test(o) && /FAIL lần đầu \(giả lập tranh chấp\)/.test(o),
    o,
  );
  check(
    "đoạn trích đã gỡ dấu đỏ (❌ → ✗) để guardrails không đọc nhầm",
    /✗ nhãn lỗi giả lập/.test(o) && !/nhãn lỗi giả lập/.test(o.replace(/✗ nhãn lỗi giả lập/g, "")),
    o,
  );
  check("ngoài GitHub Actions: không phát annotation", !/::warning/.test(o), o);
  // Mốc thời gian do chính các suite ghi nên không phụ thuộc thứ tự in ra: lần chạy lại
  // phải bắt đầu SAU khi suite kia (đang chạy lúc flaky đỏ) đã xong — tức chạy lẻ thật.
  const ts = Object.fromEntries(
    fs
      .readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map((l) => l.split(" "))
      .map(([name, n, t]) => [`${name}#${n}`, Number(t)]),
  );
  check(
    "lần chạy lại bắt đầu SAU khi pool đã xong (chạy lẻ, không chồng lên suite khác)",
    ts["flaky#2"] >= ts["slow-end#0"],
    ts,
  );

  reset();
  const onCi = run(["--dir", dir, "--jobs", "2"], { GITHUB_ACTIONS: "true" });
  check(
    "trên GitHub Actions: phát ::warning để suite nhạy tải hiện trên giao diện (vẫn xanh)",
    onCi.status === 0 && /::warning title=Suite nhạy tài nguyên::test-a-flaky /.test(out(onCi)),
    out(onCi),
  );

  reset();
  const strict = run(["--dir", dir, "--jobs", "2", "--no-retry"]);
  check(
    "--no-retry: suite đỏ lần đầu là đỏ thật (exit 1), không chạy lại",
    strict.status === 1 && /❌ test-a-flaky — THẤT BẠI/.test(out(strict)) && attemptCount() === "1",
    out(strict),
  );

  reset();
  const serial = run(["--dir", dir, "--serial"]);
  check(
    "--serial: nghiêm ngặt — không retry nên lần đầu đỏ là đỏ thật",
    serial.status === 1 &&
      /❌ test-a-flaky — THẤT BẠI/.test(out(serial)) &&
      !/↻|⚠️/.test(out(serial)) &&
      attemptCount() === "1",
    out(serial),
  );
}

// ── 4. Quá hạn: giết CẢ nhóm tiến trình (không mồ côi grandchild) ──
if (process.platform !== "win32") {
  const pidFile = path.join(tmpRoot, "grandchild.pid");
  const dir = fixture("timeout", {
    "test-a.cjs": PASS,
    "test-z-hang.cjs": `const {spawn}=require("child_process");const g=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});require("fs").writeFileSync(${JSON.stringify(pidFile)},String(g.pid));setInterval(()=>{},1000);`,
  });
  const r = run(["--dir", dir, "--no-retry"], { TEST_SUITE_TIMEOUT_MS: "4000" });
  const o = out(r);
  check(
    "quá hạn → đỏ, nói rõ quá 4s và đã giết nhóm",
    r.status === 1 && /test-z-hang — THẤT BẠI \(quá 4s/.test(o),
    o,
  );
  // Không ném khi máy quá chậm để suite kịp ghi pid: báo check đỏ có lý do rõ ràng.
  const pidText = fs.existsSync(pidFile) ? fs.readFileSync(pidFile, "utf8") : "";
  const gpid = Number(pidText);
  check(
    "suite treo kịp ghi pid tiến trình con trước khi bị giết",
    gpid > 0,
    pidText || "thiếu file pid",
  );
  let alive = gpid > 0;
  if (alive) {
    try {
      process.kill(gpid, 0);
    } catch {
      alive = false;
    }
  }
  check(
    "tiến trình CON của suite quá hạn đã bị giết (không mồ côi)",
    alive === false,
    `pid ${gpid} còn sống`,
  );
  if (alive && gpid > 0) process.kill(gpid, "SIGKILL");
}

// ── 4b. Con cháu thoát khỏi nhóm tiến trình còn giữ pipe: runner KHÔNG được treo ──
// `close` của child_process chỉ phát khi mọi stdio đã EOF; pipe lại được mọi con cháu kế
// thừa. Suite thoát xong mà để lại một tiến trình setsid giữ pipe (hoặc suite treo bị giết
// nhóm nhưng con cháu đã thoát nhóm) làm bản runner cũ treo tới hết timeout của job CI.
if (process.platform !== "win32") {
  const J = JSON.stringify;
  const leakPid = path.join(tmpRoot, "leak.pid");
  const hangPid = path.join(tmpRoot, "hang-detached.pid");
  const holder = (pidFile) =>
    `const {spawn}=require("child_process");` +
    `const g=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{detached:true,stdio:["ignore","inherit","inherit"]});` +
    `require("fs").writeFileSync(${J(pidFile)},String(g.pid));g.unref();`;
  const dir = fixture("leak", {
    // Thoát 0 ngay nhưng để lại con cháu (nhóm riêng) giữ stdout/stderr.
    "test-a-leak.cjs": holder(leakPid) + `console.log("Kết quả: ok, để lại tiến trình con");`,
    // Treo + con cháu thoát nhóm giữ pipe → bị giết theo timeout.
    "test-b-hang-detached.cjs": holder(hangPid) + `setInterval(()=>{},1000);`,
  });
  const killQuietly = (f) => {
    try {
      process.kill(Number(fs.readFileSync(f, "utf8")), "SIGKILL");
    } catch {
      // đã chết hoặc chưa kịp ghi
    }
  };
  const t0 = Date.now();
  const r = run(["--dir", dir, "--no-retry"], {
    TEST_SUITE_TIMEOUT_MS: "4000",
    TEST_STDIO_GRACE_MS: "1000",
  });
  const took = Date.now() - t0;
  const o = out(r);
  killQuietly(leakPid);
  killQuietly(hangPid);
  check(
    "runner kết thúc dù con cháu còn giữ pipe (không treo tới hết hạn của job)",
    r.status !== null && took < 30_000,
    `${took}ms · status=${r.status} · ${o}`,
  );
  check("suite thoát 0 để lại con cháu vẫn được tính xanh", /✅ test-a-leak/.test(o), o);
  check(
    "suite treo có con cháu thoát nhóm vẫn bị báo quá hạn, không im lặng",
    r.status === 1 && /test-b-hang-detached — THẤT BẠI \(quá 4s/.test(o),
    o,
  );
}

// ── 5. Làn độc quyền: chạy SAU pool và không chồng lấn ──
{
  const log = path.join(tmpRoot, "lanes.log");
  const body = (name) =>
    `const fs=require("fs");const L=${JSON.stringify(log)};fs.appendFileSync(L,"${name} start "+Date.now()+"\\n");setTimeout(()=>{fs.appendFileSync(L,"${name} end "+Date.now()+"\\n");console.log("Kết quả: ok");},1500);`;
  const dir = fixture("lanes", {
    "test-x1.cjs": body("x1"),
    "test-x2.cjs": body("x2"),
    "test-x3.cjs": body("x3"),
    "test-kiira-proxy.cjs": body("kiira"),
  });
  const r = run(["--dir", dir, "--jobs", "3"]);
  const ev = fs
    .readFileSync(log, "utf8")
    .trim()
    .split("\n")
    .map((l) => l.split(" "))
    .map(([n, k, t]) => ({ n, k, t: Number(t) }));
  const t = (n, k) => ev.find((e) => e.n === n && e.k === k).t;
  const poolEnd = Math.max(t("x1", "end"), t("x2", "end"), t("x3", "end"));
  check("pool chạy song song (x1..x3 chồng lấn thời gian)", t("x2", "start") < t("x1", "end"), ev);
  check("suite độc quyền chỉ bắt đầu SAU khi cả pool xong", t("kiira", "start") >= poolEnd, ev);
  check(
    "chạy trọn 4 suite, exit 0",
    r.status === 0 && /✅ 4\/4 suites pass/.test(r.stdout),
    out(r),
  );
}

// ── 6. Thư mục không có suite → đỏ to, không "0/0 xanh" ──
{
  const dir = fixture("empty", { "README.txt": "không có suite" });
  const r = run(["--dir", dir]);
  check(
    "không có suite → exit 1 + báo rõ",
    r.status === 1 && /Không tìm thấy suite/.test(out(r)),
    out(r),
  );
}

// ── 7. Hợp đồng số suite: AGENTS.md + guardrails.js phải khớp số suite thật ──
{
  const mkRepo = (name, suites, guard, agents) => {
    const root = path.join(tmpRoot, name);
    fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
    fs.mkdirSync(path.join(root, ".opencode", "plugins"), { recursive: true });
    fs.copyFileSync(RUNNER, path.join(root, "scripts", "run-all-tests.cjs"));
    for (let i = 0; i < suites; i++)
      fs.writeFileSync(path.join(root, "scripts", `test-s${i}.cjs`), PASS);
    fs.writeFileSync(
      path.join(root, ".opencode", "plugins", "guardrails.js"),
      `const CONTRACT_SUITES = ${guard};\n`,
    );
    fs.writeFileSync(
      path.join(root, "AGENTS.md"),
      `- [ ] toàn bộ suites xanh (hiện tại **${agents} suites**)\n`,
    );
    return path.join(root, "scripts", "run-all-tests.cjs");
  };
  const go = (script) =>
    spawnSync(process.execPath, [script], { encoding: "utf8", timeout: 60_000 });
  const good = go(mkRepo("contract-ok", 2, 2, 2));
  check("số suite khớp cả 2 nơi → chạy bình thường", good.status === 0, out(good));
  const badGuard = go(mkRepo("contract-guard", 2, 3, 2));
  check(
    "CONTRACT_SUITES lệch → đỏ ngay, nêu rõ nơi lệch",
    badGuard.status === 1 && /guardrails\.js CONTRACT_SUITES=3/.test(out(badGuard)),
    out(badGuard),
  );
  const badAgents = go(mkRepo("contract-agents", 2, 2, 5));
  check(
    "AGENTS.md lệch → đỏ ngay, nêu rõ nơi lệch",
    badAgents.status === 1 && /AGENTS\.md "\*\*5 suites\*\*"/.test(out(badAgents)),
    out(badAgents),
  );
  check(
    "lệch hợp đồng thì KHÔNG chạy suite nào",
    !/✅ test-s/.test(badAgents.stdout),
    out(badAgents),
  );
}

console.log(`\nKết quả run-all-tests: ${pass} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
