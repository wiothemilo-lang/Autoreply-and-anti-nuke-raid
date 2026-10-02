// Test metrics.js + logId.js — đo lường và log có mã.
// Không mạng, không DB, không discord.js. Chạy: node scripts/test-metrics.cjs
const metrics = require("../bot/src/metrics.js");
const { log, withId, currentId, newId, JSON_PREFIX } = require("../bot/src/logId.js");
const { startMetrics } = require("../bot/src/metricsRuntime.js");

let pass = 0;
let fail = 0;
// In qua `realLog` chứ không qua console.log: phần dưới sẽ chặn console.log
// để kiểm tra log dual-write — nếu check() dùng console.log thì chính dòng
// PASS/FAIL cũng bị chặn và ta mất dấu vết ca nào hỏng.
const realLog = console.log.bind(console);
const realWarn = console.warn.bind(console);
function check(label, cond, extra) {
  if (cond) {
    pass++;
    realLog("PASS", label);
  } else {
    fail++;
    realLog("FAIL", label, extra ?? "");
  }
}

let captured = [];
console.log = (...args) => captured.push(args);
console.warn = (...args) => captured.push(args);
function lines() {
  return captured.map((a) => a.join(" "));
}

// Toàn bộ phần kiểm tra bọc trong một hàm async: CommonJS không có top-level
// await mà nhiều ca kiểm tra cần chờ (timeAsync, startFlush, withId).
async function main() {
  // ── 1. counter + histogram: đếm đúng, có cả nhánh lỗi ──
  {
    metrics.__resetForTest();
    metrics.count("convex", "botSyncGuilds");
    metrics.count("convex", "botSyncGuilds");
    metrics.count("convex", "botSyncGuilds", "error");
    const s = metrics.snapshot();
    const key = 'bot_operations_total{subsystem="convex",op="botSyncGuilds",outcome="ok"}';
    check("count() tích luỹ đúng số lần", s.counters[key] === 2, JSON.stringify(s.counters));
    check(
      "count() tách nhánh lỗi khỏi nhánh thành công",
      s.counters[key.replace('outcome="ok"', 'outcome="error"')] === 1,
    );
  }

  // ── 2. timeAsync: đo thời gian, KHÔNG nuốt lỗi ──
  {
    metrics.__resetForTest();
    metrics.observeDuration("t", "op", 0.5);
    metrics.observeDuration("t", "op", 1.5);
    const s = metrics.snapshot();
    const cnt = s.histograms['bot_operation_duration_seconds_count{subsystem="t",op="op"}'];
    const sum = s.histograms['bot_operation_duration_seconds_sum{subsystem="t",op="op"}'];
    check("observeDuration đếm đúng số lần", cnt === 2, String(cnt));
    check("observeDuration cộng đúng tổng độ trễ", sum === 2, String(sum));

    let thrown = null;
    let out = null;
    try {
      out = await metrics.timeAsync("mod", "ban", async () => "xong");
    } catch (err) {
      thrown = err;
    }
    check("timeAsync trả về đúng giá trị của fn", out === "xong" && thrown === null);

    const boom = new Error("hỏng chỗ khác");
    let caught = null;
    try {
      await metrics.timeAsync("mod", "ban", async () => {
        throw boom;
      });
    } catch (err) {
      caught = err;
    }
    check("timeAsync ném LẠI đúng lỗi gốc (không nuốt)", caught === boom);
    const after = metrics.snapshot();
    check(
      "timeAsync ghi outcome=error khi fn ném",
      after.counters['bot_operations_total{subsystem="mod",op="ban",outcome="error"}'] === 1,
    );
    check(
      "timeAsync vẫn đo thời gian cả khi fn ném",
      after.histograms['bot_operation_duration_seconds_count{subsystem="mod",op="ban"}'] === 2,
    );
  }

  // ── 3. observeDuration: số rác → bỏ qua, không ghi sai ──
  {
    metrics.__resetForTest();
    metrics.observeDuration("x", "y", NaN);
    metrics.observeDuration("x", "y", -3);
    metrics.observeDuration("x", "y", Infinity);
    const s = metrics.snapshot();
    check(
      "observeDuration bỏ qua số rác (NaN/âm/Infinity)",
      Object.keys(s.histograms).length === 0,
      JSON.stringify(s.histograms),
    );
  }

  // ── 4. gauge: giá trị mới đè giá trị cũ, số rác bị bỏ ──
  {
    metrics.__resetForTest();
    metrics.setGauge("guilds", 7);
    metrics.setGauge("guilds", 9);
    metrics.setGauge("guilds", "không phải số");
    const g = metrics.snapshot().gauges;
    check("gauge lấy giá trị MỚI nhất", g.bot_guilds === 9, JSON.stringify(g));
    check("gauge bỏ qua giá trị không phải số", g.bot_guilds === 9);

    metrics.setGauge("memory_rss_bytes", 1024);
    check(
      "gauge tự thêm tiền tố bot_ khi thiếu",
      metrics.snapshot().gauges.bot_memory_rss_bytes === 1024,
    );
  }

  // ── 5. snapshot của histogram KHÔNG phình theo bucket ──
  {
    metrics.__resetForTest();
    await metrics.timeAsync("convex", "botSyncGuilds", async () => {});
    const s = metrics.snapshot();
    const keys = Object.keys(s.histograms);
    check(
      "histogram gộp còn 2 khoá (count+sum), KHÔNG một dòng mỗi bucket",
      keys.length === 2,
      `${keys.length}: ${keys.join(" | ")}`,
    );
    check(
      "mỗi khoá histogram đều có số thực",
      keys.every((k) => typeof s.histograms[k] === "number" && Number.isFinite(s.histograms[k])),
    );
  }

  // ── 6. AI: token / chi phí / số lượt ──
  {
    metrics.__resetForTest();
    metrics.observeAiCall("kiira", {
      durationSeconds: 1.2,
      promptTokens: 100,
      completionTokens: 20,
      costUsd: 0.0023456,
    });
    metrics.observeAiFailure("kiira", 5);
    const s = metrics.snapshot();
    check(
      "AI đếm token vào",
      s.counters['bot_ai_tokens_total{provider="kiira",direction="prompt"}'] === 100,
    );
    check(
      "AI đếm token ra",
      s.counters['bot_ai_tokens_total{provider="kiira",direction="completion"}'] === 20,
    );
    check(
      "AI làm tròn chi phí 6 chữ số",
      s.counters['bot_ai_cost_usd_total{provider="kiira"}'] === 0.002346,
    );
    check(
      "AI đếm lượt thành công",
      s.counters['bot_ai_calls_total{provider="kiira",outcome="ok"}'] === 1,
    );
    check(
      "AI đếm lượt lỗi",
      s.counters['bot_ai_calls_total{provider="kiira",outcome="error"}'] === 1,
    );

    metrics.__resetForTest();
    metrics.observeAiCall("kiira", {});
    check(
      "AI lượt không có usage vẫn không làm hỏng",
      Object.keys(metrics.snapshot().counters).length === 0,
    );
  }

  // ── 7. Trần cardinality: nhãn động không được phình RAM vô hạn ──
  {
    metrics.__resetForTest();
    for (let i = 0; i < 900; i++) metrics.count("nuke", `op-dong-${i}`);
    const n = Object.keys(metrics.snapshot().counters).length;
    check("trần cardinality giữ bảng nhãn < 600 dòng", n > 0 && n <= 520, String(n));
  }

  // ── 8. render() trả đúng định dạng Prometheus ──
  {
    metrics.__resetForTest();
    metrics.count("convex", "botSyncGuilds");
    const text = await metrics.render();
    check(
      "render() có dòng metric bot_ theo chuẩn Prometheus",
      /^bot_operations_total\{[^}]+\} \d+$/m.test(text),
      text.split("\n")[0],
    );
    check("render() KHÔNG lẫn metric mặc định của Node (chưa bật)", !/^nodejs_/m.test(text));
  }

  // ── 9. startFlush + flushNow: đẩy số liệu định kỳ, không giữ tiến trình ──
  {
    metrics.__resetForTest();
    const got = [];
    const stop = metrics.startFlush(20, (snap) => {
      got.push(snap);
    });
    await new Promise((r) => setTimeout(r, 70));
    stop();
    await metrics.flushNow((snap) => got.push(snap));
    check("startFlush đẩy số liệu theo chu kỳ", got.length >= 2, String(got.length));
    check(
      "mẫu số liệu có trường at + counters",
      typeof got[0].at === "number" && typeof got[0].counters === "object",
    );

    // push() ném lỗi → KHÔNG được làm chết tiến trình (never throw).
    const pushOk = await metrics.flushNow(() => {
      throw new Error("Convex chết");
    });
    check("flushNow nuốt lỗi của hàm push (không crash bot)", pushOk === false);
  }

  // ── 10. __resetForTest dọn sạch cả registry lẫn bảng tích luỹ ──
  {
    metrics.__resetForTest();
    metrics.count("a", "b");
    metrics.setGauge("c", 1);
    metrics.__resetForTest();
    const s = metrics.snapshot();
    check(
      "__resetForTest xoá sạch số đo",
      Object.keys(s.counters).length === 0 && Object.keys(s.gauges).length === 0,
    );
  }

  // ══════════ logId.js ══════════

  // ── 11. Mã: ngắn, khác nhau, hợp lệ ──
  {
    const ids = new Set();
    for (let i = 0; i < 200; i++) ids.add(newId());
    check("newId sinh 200 mà không trùng", ids.size === 200, String(ids.size));
    check(
      "newId đúng 8 ký tự hex",
      [...ids].every((id) => /^[0-9a-f]{8}$/.test(id)),
    );
    check("ngoài phạm vi thì currentId() = null", currentId() === null);
  }

  // ── 12. withId gắn mã, và mã sống qua await ──
  {
    let seen = null;
    let deep = null;
    await withId(async () => {
      seen = currentId();
      await new Promise((r) => setTimeout(r, 5));
      deep = currentId();
      const deeper = async () => currentId();
      deep = await deeper();
    });
    check("withId gắn mã cho phạm vi bên trong", typeof seen === "string" && seen.length === 8);
    check("mã sống qua await và qua hàm gọi sâu hơn", deep === seen, `${seen} vs ${deep}`);
    check("ra khỏi phạm vi thì mã trở lại null", currentId() === null);
  }

  // ── 13. withId ném lại đúng lỗi gốc ──
  {
    const boom = new Error("lỗi gốc");
    let caught = null;
    try {
      await withId(() => {
        throw boom;
      });
    } catch (err) {
      caught = err;
    }
    check("withId ném lại đúng lỗi gốc", caught === boom);
  }

  // ── 14. Dual-write: một lần log → hai dòng (text + JSON) ──
  {
    captured = [];
    log.info("xin chào", { guildId: "123" });
    const out = lines();
    check(
      "dual-write in DÒNG TEXT cho người đọc",
      out.some((l) => l.startsWith("[info]")),
      out[0],
    );
    check(
      "dòng text có dữ liệu kèm theo",
      out.some((l) => l.includes("xin chào") && l.includes('"guildId":"123"')),
    );
    const jsonLines = out.filter((l) => l.startsWith(JSON_PREFIX));
    check("dual-write in DÒNG JSON cho máy đọc", jsonLines.length === 1, String(jsonLines.length));
    const parsed = JSON.parse(jsonLines[0].slice(JSON_PREFIX.length));
    check(
      "dòng JSON có level/msg/timestamp",
      parsed.level === "info" && parsed.msg === "xin chào" && !!parsed.ts,
    );
    check("dòng JSON có dữ liệu kèm theo", parsed.guildId === "123");
    check("ngoài phạm vi thì id = null (không bịa mã)", parsed.id === null);
  }

  // ── 15. Dòng JSON trong phạm vi việc có mang mã ──
  {
    captured = [];
    await withId(async () => {
      log.warn("có mã", { guildId: "9" });
    });
    const out = lines();
    const text = out.find((l) => l.startsWith("[warn]"));
    const parsed = JSON.parse(out.find((l) => l.startsWith(JSON_PREFIX)).slice(JSON_PREFIX.length));
    check("dòng text trong phạm vi có [mã]", /\] \[[0-9a-f]{8}\]/.test(text), text);
    check(
      "dòng JSON trong phạm vi có id khớp dòng text",
      parsed.id && text.includes(`[${parsed.id}]`),
    );
  }

  // ── 16. Field khó serialize không được làm mất dòng log ──
  {
    captured = [];
    const circular = {};
    circular.self = circular;
    log.error("lỗi khó", { err: new Error("bùng"), vòng: circular, big: 10n });
    const out = lines();
    check(
      "log vẫn in dòng text dù field không serialize được",
      out.some((l) => l.startsWith("[error]")),
    );
    const parsed = JSON.parse(out.find((l) => l.startsWith(JSON_PREFIX)).slice(JSON_PREFIX.length));
    check(
      "Error được rút gọn thành name+message",
      parsed.err?.name === "Error" && parsed.err?.message === "bùng",
    );
    check("BigInt được đổi thành chuỗi", parsed.big === "10");
  }

  // ── 17. Log bao giờ cũng không ném lỗi ra ngoài ──
  {
    captured = [];
    let threw = false;
    try {
      log.info(undefined, undefined);
      log.info("x", null);
      log.info("y", {});
    } catch {
      threw = true;
    }
    check("log với tham số rác không ném lỗi", !threw);
    check(
      "log với tham số rác vẫn in đủ dòng",
      lines().filter((l) => l.startsWith("[info]")).length === 3,
    );
  }

  // ── 18. sampleMemory đặt gauge vùng nhớ ──
  {
    metrics.__resetForTest();
    metrics.sampleMemory();
    const g = metrics.snapshot().gauges;
    check(
      "sampleMemory đặt gauge RSS và heap",
      typeof g.bot_memory_rss_bytes === "number" &&
        typeof g.bot_memory_heap_used_bytes === "number",
      JSON.stringify(g),
    );
  }

  // ── 19. metricsRuntime: lắp ráp trong tiến trình thật ──
  // `startMetrics` là chỗ ghép vòng đo với store/client thật — không test thì
  // lỗi ở đây chỉ lộ khi bot chạy production, đúng chỗ ta không muốn lộ nhất.
  {
    // Thu nhỏ mọi khoảng để test chạy nhanh (giá trị thật là 60s / 5 phút).
    process.env.METRICS_SAMPLE_INTERVAL_MS = "20";
    process.env.METRICS_STDOUT_INTERVAL_MS = "25";
    process.env.METRICS_PUSH_INTERVAL_MS = "20";
    delete process.env.METRICS;

    const pushes = [];
    const fakeStore = { recordMetrics: async (snap) => pushes.push(snap) };
    const fakeClient = {
      guilds: {
        cache: new Map([
          ["g1", { memberCount: 10 }],
          ["g2", { memberCount: 32 }],
        ]),
      },
    };

    metrics.__resetForTest();
    const stop = startMetrics({ client: fakeClient, store: fakeStore });

    const gaugesNow = metrics.snapshot().gauges;
    check(
      "startMetrics đo số server từ client",
      gaugesNow.bot_guilds === 2,
      JSON.stringify(gaugesNow),
    );
    check(
      "startMetrics đo tổng thành viên",
      gaugesNow.bot_members === 42,
      JSON.stringify(gaugesNow),
    );
    check("startMetrics đo uptime", typeof gaugesNow.bot_uptime_seconds === "number");

    await new Promise((r) => setTimeout(r, 90));
    stop();
    const pushesAfterStop = pushes.length;
    check(
      "startMetrics đẩy snapshot lên store theo chu kỳ",
      pushesAfterStop >= 1,
      String(pushesAfterStop),
    );
    check(
      "snapshot đẩy đi có trường at/counters",
      typeof pushes[0]?.at === "number" && typeof pushes[0]?.counters === "object",
    );
    await new Promise((r) => setTimeout(r, 60));
    // `pushesAfterStop` đo SAU `stop()`, nên đã gồm cả mẫu cuối mà stop() đẩy.
    // Từ đó trở đi không được có thêm lần nào — đó mới là "vòng đã dừng".
    // (Trước đợt này `stop()` truyền NHẦM hàm dừng vào clearInterval nên vòng
    // đẩy sống mãi; ca này chính là chỗ bắt được lỗi đó.)
    check(
      "stop() dừng hẳn vòng đẩy (không còn đẩy thêm sau khi dừng)",
      pushes.length === pushesAfterStop,
      `lúc dừng=${pushesAfterStop} sau=${pushes.length}`,
    );

    // Thiếu store / thiếu client → KHÔNG được ném (bot vẫn phải chạy).
    let threw = false;
    try {
      metrics.__resetForTest();
      startMetrics({})();
      startMetrics({ client: {}, store: { recordMetrics: "không phải hàm" } })();
    } catch {
      threw = true;
    }
    check("startMetrics không ném khi thiếu store/client", !threw);

    // METRICS=0 → tắt hoàn toàn, không đo gì cả.
    process.env.METRICS = "0";
    metrics.__resetForTest();
    startMetrics({ client: fakeClient, store: fakeStore })();
    check("METRICS=0 tắt đo lường hoàn toàn", Object.keys(metrics.snapshot().gauges).length === 0);
    delete process.env.METRICS;
    for (const k of [
      "METRICS_SAMPLE_INTERVAL_MS",
      "METRICS_STDOUT_INTERVAL_MS",
      "METRICS_PUSH_INTERVAL_MS",
    ]) {
      delete process.env[k];
    }
  }

  console.log = realLog;
  console.warn = realWarn;
  realLog(`\nKết quả metrics + logId: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.log = realLog;
  console.warn = realWarn;
  realLog(`\nLỗi: test-metrics.cjs ném ngoài dự kiến — ${err?.stack ?? err}`);
  process.exit(1);
});
