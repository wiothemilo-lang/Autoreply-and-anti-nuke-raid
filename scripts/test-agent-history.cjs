#!/usr/bin/env node
/**
 * test-agent-history.cjs — kiểm tra plugin "hộp lịch sử làm việc" (18/09/2026).
 *
 * Plugin .opencode/plugins/session-history.js ghi mỗi sự kiện phiên vào
 * ~/.config/opencode/history/sessions.jsonl và TỰ DỌN mục quá hạn TTL
 * (AGENT_HISTORY_TTL_DAYS, mặc định 14 ngày, 0 = giữ vô hạn).
 *
 * Bug thật 11/10/2026 (nâng OpenCode V1 → V2): plugin viết theo API V1 (export
 * hàm trả object hook `event`) KHÔNG còn được V2 nạp — log
 * "Plugin must export a default definition with an id and an effect or setup
 * function" → hộp lịch sử ngừng ghi IM LẶNG. Vì vậy suite này nạp CHÍNH plugin
 * thật, chạy setup() với ctx giả (ctx.event.subscribe nhả sự kiện V2) và đối
 * chiếu hộp JSONL thật trong HOME tạm — không thể "xanh giả" khi plugin chết.
 *
 * Khóa 4 thứ:
 *   1. Plugin đúng vị trí auto-load + đúng dạng V2 (default export id + setup)
 *   2. Hành vi thật: 3 sự kiện created/idle/error → đúng 3 dòng JSONL, đúng tên
 *      trường mà lệnh /history đọc (at/event/sessionId/title/directory/error)
 *   3. TTL/dọn: quá hạn → dọn, còn hạn → giữ, 0/ttl sai → không dọn,
 *      JSON hỏng → giữ (kiểm chứng trên hộp thật, không tái tạo logic tay)
 *   4. Plugin KHÔNG bao giờ ghi nội dung nhạy cảm (không env, không token) —
 *      chỉ metadata phiên; lỗi ghi/dọn bị nuốt, không làm rớt phiên
 *
 * Chạy: node scripts/test-agent-history.cjs
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = path.join(__dirname, "..");
const PLUGIN = path.join(ROOT, ".opencode", "plugins", "session-history.js");
const PLUGIN_URL = pathToFileURL(PLUGIN).href;
const COMMAND = path.join(ROOT, ".opencode", "commands", "history.md");

let pass = 0;
let fail = 0;
function check(label, cond) {
  if (cond) {
    pass++;
    console.log(`PASS ${label}`);
  } else {
    fail++;
    console.error(`FAIL ${label}`);
  }
}

// ─── 1. Plugin tồn tại + đúng dạng V2 ────────────────────────────────────────
const pluginSrc = fs.readFileSync(PLUGIN, "utf8");

check("plugin tồn tại đúng thư mục auto-load (.opencode/plugins)", fs.existsSync(PLUGIN));
check(
  "plugin dùng ctx.event.subscribe (đăng ký sự kiện theo API V2)",
  /ctx\.event\.subscribe\(/.test(pluginSrc),
);
check(
  "plugin nghe đủ 3 sự kiện created/idle/error (V2: session.execution.failed)",
  pluginSrc.includes('"session.created"') &&
    pluginSrc.includes('"session.idle"') &&
    pluginSrc.includes('"session.execution.failed"'),
);
check(
  "lỗi ghi/dọn bị nuốt (không được làm rớt phiên)",
  /catch/.test(pluginSrc) && pluginSrc.includes("best-effort"),
);

check(
  "lệnh /history tồn tại kèm mô tả",
  fs.existsSync(COMMAND) && fs.readFileSync(COMMAND, "utf8").includes("description:"),
);
{
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "opencode.json"), "utf8"));
  check(
    "opencode.json đặt AGENT_HISTORY_TTL_DAYS mặc định 14",
    cfg.env && cfg.env.AGENT_HISTORY_TTL_DAYS === "14",
  );
}

// ─── 2. Hành vi THẬT: chạy plugin với ctx giả + HOME tạm, đọc hộp JSONL ──────
// Plugin instance mới mỗi lần (?v=N) để mỗi kịch bản bắt đầu với module sạch.
let instance = 0;

/**
 * Chạy plugin thật: HOME đổi sang thư mục tạm (os.homedir() tôn trọng $HOME),
 * ctx.event.subscribe là async generator nhả đúng dãy sự kiện V2, rồi đợi
 * loop fire-and-forget ghi xong. `seed` (nếu có) ghi sẵn nội dung vào hộp
 * TRƯỚC khi plugin chạy — dùng cho case dọn TTL. Trả về nội dung hộp.
 */
async function runPluginWithEvents(events, { ttl, seed } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "agent-history-test-"));
  const file = path.join(home, ".config", "opencode", "history", "sessions.jsonl");
  const prev = { home: process.env.HOME, ttl: process.env.AGENT_HISTORY_TTL_DAYS };
  process.env.HOME = home;
  if (ttl === undefined) delete process.env.AGENT_HISTORY_TTL_DAYS;
  else process.env.AGENT_HISTORY_TTL_DAYS = String(ttl);

  try {
    if (seed !== undefined) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, seed);
    }
    const mod = await import(`${PLUGIN_URL}?v=${instance++}`);
    const ctx = {
      event: {
        subscribe: async function* () {
          for (const e of events) yield e;
        },
      },
    };
    const cleanup = await mod.default.setup(ctx);
    // Hộp có thể đã sẵn nội dung seed → đợi tới khi thấy CHÍNH dòng plugin vừa
    // ghi (dấu vết = sessionId của sự kiện đầu tiên) rồi mới đọc, nếu không
    // sẽ đọc nhầm bản seed và báo FAIL giả.
    const marker = `"sessionId":${JSON.stringify(String(events[0]?.data?.sessionID ?? ""))}`;
    let raw = "";
    for (let i = 0; i < 100; i++) {
      try {
        raw = fs.readFileSync(file, "utf8");
      } catch {
        raw = "";
      }
      if (marker && raw.includes(marker)) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    if (typeof cleanup === "function") await cleanup();
    return raw;
  } finally {
    if (prev.home === undefined) delete process.env.HOME;
    else process.env.HOME = prev.home;
    if (prev.ttl === undefined) delete process.env.AGENT_HISTORY_TTL_DAYS;
    else process.env.AGENT_HISTORY_TTL_DAYS = prev.ttl;
  }
}

const parse = (raw) =>
  raw
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

const EVENTS = [
  {
    type: "session.created",
    data: { sessionID: "ses_test1", title: "Phiên thử", location: { directory: "/repo/x" } },
  },
  { type: "session.idle", data: { sessionID: "ses_test1" } },
  {
    type: "session.execution.failed",
    data: {
      sessionID: "ses_test1",
      error: { type: "provider", message: "lỗi nổ chuỗi ".repeat(100) },
    },
  },
];
const NOW = Date.now();
const OLD_ENTRY = JSON.stringify({ at: NOW - 30 * 864e5, event: "idle", sessionId: "ses_cu" });
const FRESH_ENTRY = JSON.stringify({ at: NOW - 864e5, event: "idle", sessionId: "ses_con_han" });

(async () => {
  // ── 2a. 3 sự kiện V2 → 3 dòng JSONL đúng trường ──
  {
    const lines = parse(await runPluginWithEvents(EVENTS, { ttl: 14 }));
    check("hộp có đúng 3 dòng cho 3 sự kiện", lines.length === 3);
    check(
      "dòng 1 là created kèm sessionId/title/directory (đúng trường /history đọc)",
      lines[0]?.event === "created" &&
        lines[0]?.sessionId === "ses_test1" &&
        lines[0]?.title === "Phiên thử" &&
        lines[0]?.directory === "/repo/x" &&
        typeof lines[0]?.at === "number",
    );
    check(
      "dòng 2 là idle kèm sessionId",
      lines[1]?.event === "idle" && lines[1]?.sessionId === "ses_test1",
    );
    check(
      "dòng 3 là error kèm sessionId + lý do",
      lines[2]?.event === "error" &&
        lines[2]?.sessionId === "ses_test1" &&
        String(lines[2]?.error).includes("lỗi nổ chuỗi"),
    );
    check(
      "nội dung error bị cắt ngắn (300 ký tự) — tránh nhét cả stack/log dài",
      typeof lines[2]?.error === "string" && lines[2].error.length <= 300,
    );
  }

  // ── 2b. TTL/dọn trên HỘP THẬT ──
  {
    const lines = parse(
      await runPluginWithEvents([EVENTS[1]], { ttl: 14, seed: `${OLD_ENTRY}\n${FRESH_ENTRY}\n` }),
    );
    check(
      "TTL 14 ngày: dọn mục quá hạn, giữ mục còn hạn + mục vừa ghi",
      lines.length === 2 &&
        lines.some((e) => e.sessionId === "ses_con_han") &&
        lines.some((e) => e.sessionId === "ses_test1") &&
        !lines.some((e) => e.sessionId === "ses_cu"),
    );
  }
  {
    const lines = parse(await runPluginWithEvents([EVENTS[1]], { ttl: 0, seed: `${OLD_ENTRY}\n` }));
    check("TTL 0 = tắt dọn, giữ vô hạn", lines.length === 2);
  }
  {
    const lines = parse(
      await runPluginWithEvents([EVENTS[1]], { ttl: -5, seed: `${OLD_ENTRY}\n` }),
    );
    check("TTL âm (giá trị sai) không dọn gì — an toàn mặc định", lines.length === 2);
  }
  {
    const raw = await runPluginWithEvents([EVENTS[1]], { ttl: 14, seed: '{"at":"hỏng",\n' });
    const entries = raw.split("\n").filter(Boolean);
    check(
      "dòng JSON hỏng được giữ lại, không mất dữ liệu",
      entries.length === 2 && entries[0].startsWith('{"at":"hỏng"'),
    );
  }
  {
    const lines = parse(await runPluginWithEvents([EVENTS[1]], { ttl: 14 }));
    check("thư mục history chưa tồn tại vẫn ghi được (mkdir recursive)", lines.length === 1);
  }

  // ─── 3. An toàn: hộp lịch sử chỉ chứa metadata, không chứa secret ──────────
  check(
    "plugin không ghi giá trị env/biến môi trường vào lịch sử",
    !/process\.env\.[A-Z_]*(KEY|TOKEN|SECRET|PASSWORD)/.test(
      pluginSrc.replace(/AGENT_HISTORY_TTL_DAYS/g, ""),
    ),
  );
  // .env/.bot-key chỉ bị cấm với tư cách TÊN FILE (đứng sau quote/slash/khoảng
  // trắng) — `process.env.TÊN_BIẾN` là truy cập biến môi trường bình thường,
  // plugin cần nó để đọc TTL và không phải vi phạm.
  check(
    "plugin không đọc/ghi file .env/.bot-key",
    !/(["'\s/])\.env(["'\s]|$)/.test(pluginSrc) && !pluginSrc.includes(".bot-key"),
  );

  // ─── 3b. Khóa bản vá 18/09: ghi lịch sử bằng fs API, KHÔNG dùng shell redirect ──
  // Bun Shell không có .redirection() — dùng nó là TypeError khi ghi, lịch sử
  // mất im lặng (bug thật đã xác minh bằng harness Bun).
  check(
    "không gọi .redirection() (không tồn tại trong Bun Shell)",
    // bắt lệnh gọi thật: .redirection( đứng sau dấu chấm ở vị trí code (không phải
    // sau // hoặc chữ trong chú thích) — đủ chặn hồi quy, chấp nhận chữ trong chú thích
    !/[^/]\.redirection\(/.test(pluginSrc.replace(/\/\/[^\n]*/g, "")),
  );
  check("ghi nối tiếp bằng fs.appendFileSync", pluginSrc.includes("fs.appendFileSync"));
  check(
    "mkdir recursive trước khi ghi (thư mục history chưa có cũng chạy)",
    pluginSrc.includes("mkdirSync"),
  );
  check(
    "plugin chỉ ghi trường metadata cho phép (at/event/sessionId/title/directory/error)",
    !/"(?:content|message|prompt|diff|output)"/.test(pluginSrc.replace(/"error"/g, "")),
  );

  // ─── 4. Đúng dạng V2 — cổng chặn "plugin chết im lặng" ─────────────────────
  {
    const mod = await import(`${PLUGIN_URL}?v=shape`);
    check(
      "plugin V2: default export có id + setup (bản V1 từng làm plugin KHÔNG nạp)",
      mod.default && typeof mod.default.id === "string" && typeof mod.default.setup === "function",
    );
    check(
      "plugin không import @opencode/plugin (plugin local không resolve được gói đó)",
      !/from\s+["']@opencode\/plugin["']/.test(pluginSrc),
    );
  }

  console.log(`\nKết quả agent-history: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
