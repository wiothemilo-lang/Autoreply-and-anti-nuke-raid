// TEST: handlers/antinuke/index.js — ORCHESTRATOR (file nối 9 tầng vào
// client). Trước đây file này 0% function coverage: mọi listener Discord
// được đăng ký ở đây chưa từng chạy trong test, nên sai sót ở đây chỉ lộ ra
// trên VPS thật (server raid → im lặng, không chặn được gì).
//
// Vì sao mock 9 module con thay vì chạy thật: orchestrator chỉ làm việc
// ĐỊNH TUYẾN (event Discord → đúng module + đúng eventType + đúng targetId).
// Logic phát hiện nuke nằm ở tầng con, mỗi tầng đã có suite riêng. Ở đây ta
// chỉ chứng minh: đúng sự kiện → đúng hàm, và lỗi ở tầng con không làm chết
// bot.
//
// Chạy: node scripts/test-antinuke-orchestrator.cjs
const DJS_MOCK = require("./support/djs-mock-path.cjs");
const Module = require("module");
const fs = require("fs");

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "discord.js") return DJS_MOCK;
  return origResolve.call(this, request, ...args);
};
fs.writeFileSync(
  DJS_MOCK,
  `module.exports = {
  // Tên hằng nguyên văn để assert được (Proxy Symbol sẽ đổi mỗi lần đọc).
  AuditLogEvent: {
    MemberBanAdd: 1,
    MemberKick: 2,
    ChannelCreate: 3,
    ChannelDelete: 4,
    RoleCreate: 5,
    RoleDelete: 6,
    IntegrationCreate: 7,
    WebhookCreate: 8,
  },
};
`,
);

let pass = 0;
let fail = 0;
const check = (label, cond, detail) => {
  if (cond) {
    pass++;
    console.log("PASS", label);
  } else {
    fail++;
    console.error("FAIL", label, detail ?? "");
  }
};

/** Nhật ký lời gọi mọi tầng con — orchestrator phải gọi đúng hàm. */
const calls = [];
const rec =
  (name) =>
  async (...args) => {
    calls.push({ name, args });
    if (ctl.throws.has(name)) throw new Error(`${name} ném lỗi`);
    return ctl.result[name];
  };

/** Kết quả trả về theo từng hàm + tập hàm được ép ném lỗi. */
const ctl = {
  result: {},
  throws: new Set(),
  audit: null,
  auditQueue: [],
  auditThrows: false,
  auditThrowsAfterFirst: false,
};

// state.state.botAddTimes — orchestrator đọc thẳng để ghi mốc bot mới vào.
const botAddTimes = new Map();

const state = {
  state: { botAddTimes },
  // Orchestrator DESTRUCTURE hàm này lúc factory chạy → mock phải được cài
  // từ đầu và đọc trạng thái qua `ctl`, không gán lại hàm giữa chừng.
  auditLookup: async () => {
    if (ctl.auditThrowsAfterFirst && ctl.auditQueue.length === 0) {
      throw new Error("Missing Permissions");
    }
    if (ctl.auditThrows) throw new Error("Missing Permissions");
    const a = ctl.auditQueue.length ? ctl.auditQueue.shift() : ctl.audit;
    return a;
  },
  sweepMemory: () => calls.push({ name: "sweepMemory", args: [] }),
};
const origLoad = Module._load;
Module._load = function (request, parent) {
  if (parent && /antinuke[\\/]index\.js$/.test(parent.filename)) {
    if (request === "./shared") return { MODULE_LABELS: {}, messageFingerprint: () => "fp" };
    if (request === "./state") return () => state;
    if (request === "./ai") return () => ({});
    if (request === "./raidIntel") return () => ({});
    if (request === "./enforce") return () => ({});
    if (request === "./externalApp")
      return () => ({
        handleExternalApp: rec("handleExternalApp"),
        handleButtonRaid: rec("handleButtonRaid"),
      });
    if (request === "./members")
      return () => ({
        handleSuspiciousBotJoin: rec("handleSuspiciousBotJoin"),
        handleHitAndRunLeave: rec("handleHitAndRunLeave"),
        handleRaidJoin: rec("handleRaidJoin"),
      });
    if (request === "./messages")
      return () => ({
        handleSpam: rec("handleSpam"),
        handleMessagePatterns: rec("handleMessagePatterns"),
      });
    if (request === "./audit")
      return () => ({
        handleAttributeEvent: rec("handleAttributeEvent"),
        handleAuditEntry: rec("handleAuditEntry"),
        routeAuditEntry: rec("routeAuditEntry"),
        handleMessageBulk: rec("handleMessageBulk"),
        tickUnlocks: rec("tickUnlocks"),
        tickHeatResets: rec("tickHeatResets"),
        tickVandalReleases: rec("tickVandalReleases"),
      });
  }
  return origLoad.apply(this, arguments);
};

const createAntiNuke = require("../bot/src/handlers/antinuke");

/** client giả: `on` gom listener để test bắn event. */
function mkClient() {
  const handlers = new Map();
  return {
    handlers,
    on(ev, fn) {
      handlers.set(ev, fn);
      return this;
    },
    emit(ev, ...args) {
      return handlers.get(ev)?.(...args);
    },
    guilds: { cache: new Map() },
  };
}

const reset = () => {
  calls.length = 0;
  ctl.result = {};
  ctl.throws = new Set();
  ctl.audit = { ok: true, found: false, ambiguous: false, executor: null };
  ctl.auditQueue = [];
  ctl.auditThrows = false;
  ctl.auditThrowsAfterFirst = false;
  botAddTimes.clear();
};

(async () => {
  const client = mkClient();
  const api = createAntiNuke(client, { client: {} }, {});
  check(
    "factory trả về attach + sweepMemory",
    typeof api.attach === "function" && typeof api.sweepMemory === "function",
  );

  // ── Listener interactionCreate đăng ký NGAY (ngoài attach) ──
  {
    reset();
    await client.emit("interactionCreate", { id: "int-1" });
    check(
      "interactionCreate → handleButtonRaid (đăng ký ngoài attach)",
      calls.some((c) => c.name === "handleButtonRaid" && c.args[0].id === "int-1"),
    );
  }

  // ── attach() định tuyến từng sự kiện Discord ──
  // setInterval thật sẽ giữ process sống 20s/lần và treo test → bắt callback.
  let tick = null;
  const realSetInterval = global.setInterval;
  global.setInterval = (fn, ms) => {
    tick = { fn, ms };
    return 0;
  };
  try {
    api.attach();
  } finally {
    global.setInterval = realSetInterval;
  }
  check("attach đăng ký setInterval 20s", !!tick && tick.ms === 20_000, JSON.stringify(tick?.ms));
  for (const ev of [
    "guildBanAdd",
    "guildMemberRemove",
    "channelCreate",
    "channelDelete",
    "roleCreate",
    "roleDelete",
    "messageDeleteBulk",
    "guildMemberAdd",
    "messageCreate",
    "guildAuditLogEntryCreate",
  ]) {
    check(`attach đăng ký listener ${ev}`, client.handlers.has(ev));
  }

  const guild = { id: "G1", name: "Guild" };
  const named = (name, extra) => client.handlers.get(name)({ guild, ...extra });

  {
    reset();
    await named("guildBanAdd", { user: { id: "U1" } });
    const c = calls.find((x) => x.name === "handleAttributeEvent");
    check(
      "guildBanAdd → massBan đúng eventType + target",
      c?.args[0].module === "massBan" && c?.args[0].targetId === "U1" && c?.args[0].eventType === 1,
      JSON.stringify(c?.args[0]),
    );
  }
  for (const [ev, module, type, extra, wantTarget] of [
    ["channelCreate", "massChannelCreate", 3, { id: "C1", name: "kênh" }, "C1"],
    ["channelDelete", "massChannelDelete", 4, { id: "C2", name: "kênh" }, "C2"],
    ["roleCreate", "massRoleCreate", 5, { id: "R1", name: "role" }, "R1"],
    ["roleDelete", "massRoleDelete", 6, { id: "R2", name: "role" }, "R2"],
  ]) {
    reset();
    await named(ev, extra);
    const c = calls.find((x) => x.name === "handleAttributeEvent");
    check(
      `${ev} → ${module}`,
      c?.args[0].module === module &&
        c?.args[0].eventType === type &&
        c?.args[0].targetId === wantTarget,
      JSON.stringify(c?.args[0]),
    );
  }
  {
    reset();
    await named("messageDeleteBulk", { size: 3 });
    check(
      "messageDeleteBulk → handleMessageBulk",
      calls.some((c) => c.name === "handleMessageBulk" && c.args[0].size === 3),
    );
  }
  {
    reset();
    ctl.result.handleRaidJoin = null;
    await named("guildMemberAdd", { id: "U9", user: { id: "U9", bot: true } });
    check(
      "guildMemberAdd → handleRaidJoin",
      calls.some((c) => c.name === "handleRaidJoin"),
    );
    check(
      "guildMemberAdd (bot) → ghi mốc botAddTimes cho module botHitAndRun",
      botAddTimes.has("G1:U9"),
      [...botAddTimes.keys()].join(","),
    );
    check(
      "guildMemberAdd → handleSuspiciousBotJoin",
      calls.some((c) => c.name === "handleSuspiciousBotJoin"),
    );
  }
  {
    reset();
    await named("guildMemberAdd", { id: "U10", user: { id: "U10", bot: false } });
    check(
      "người thường vào KHÔNG ghi botAddTimes",
      botAddTimes.size === 0,
      [...botAddTimes.keys()].join(","),
    );
  }
  {
    reset();
    await named("messageCreate", { id: "M1" });
    check(
      "messageCreate → handleSpam",
      calls.some((c) => c.name === "handleSpam"),
    );
    check(
      "messageCreate → handleMessagePatterns",
      calls.some((c) => c.name === "handleMessagePatterns"),
    );
  }

  // ── guildMemberRemove: kết luận dựa trên audit log ──
  {
    // Audit log API lỗi → KHÔNG kết luận tự rời (tránh phạt oan).
    reset();
    ctl.auditThrows = true;
    await named("guildMemberRemove", { id: "U2" });
    check(
      "audit log lỗi → im lặng, không tính là massKick",
      !calls.some((c) => c.name === "handleAttributeEvent") &&
        !calls.some((c) => c.name === "handleHitAndRunLeave"),
    );
  }
  {
    reset();
    ctl.audit = { ok: true, found: true, ambiguous: false, executor: { id: "M1" } };
    await named("guildMemberRemove", { id: "U3" });
    const c = calls.find((x) => x.name === "handleAttributeEvent");
    check(
      "audit có kick → massKick",
      c?.args[0].module === "massKick" && c?.args[0].eventType === 2,
      JSON.stringify(c?.args[0]),
    );
    check(
      "có kick thì KHÔNG chạy hit-and-run",
      !calls.some((x) => x.name === "handleHitAndRunLeave"),
    );
  }
  {
    // Audit log đến trễ: lần 1 chưa thấy + không mơ hồ → chờ rồi tra lại,
    // lần 2 thấy kick thì vẫn phải tính massKick (nếu không, kẻ raid kick
    // nạp nhân sẽ thoát phạt vì audit log chậm vài trăm ms).
    reset();
    ctl.auditQueue = [
      { ok: true, found: false, ambiguous: false, executor: null },
      { ok: true, found: true, ambiguous: false, executor: { id: "M2" } },
    ];
    await named("guildMemberRemove", { id: "U4" });
    check(
      "audit đến trễ: tra lại lần 2 rồi mới kết luận",
      ctl.auditQueue.length === 0 &&
        calls.some((c) => c.name === "handleAttributeEvent" && c.args[0].module === "massKick"),
      `còn ${ctl.auditQueue.length} phần tử chưa dùng`,
    );
  }
  {
    // Không có kick nào sau cả 2 lần tra → người tự rời: đi vào hit-and-run.
    reset();
    await named("guildMemberRemove", { id: "U5" });
    check(
      "không có kick → kiểm hit-and-run",
      calls.some((c) => c.name === "handleHitAndRunLeave"),
    );
  }
  {
    // Mơ hồ (cửa sổ audit đầy) → dừng lại, không kết luận gì.
    reset();
    ctl.audit = { ok: true, found: false, ambiguous: true, executor: null };
    await named("guildMemberRemove", { id: "U6" });
    check(
      "audit mơ hồ → dừng, không kết luận tự rời",
      !calls.some((c) => c.name === "handleAttributeEvent" || c.name === "handleHitAndRunLeave"),
    );
  }
  {
    // Kick nhưng không đọc được thủ phạm → bỏ qua (đọc sai người = phạt nặng).
    reset();
    ctl.audit = { ok: true, found: true, ambiguous: false, executor: null };
    await named("guildMemberRemove", { id: "U7" });
    check(
      "có kick nhưng không rõ thủ phạm → bỏ qua, không phạt",
      !calls.some((c) => c.name === "handleAttributeEvent"),
    );
  }

  // ── guildAuditLogEntryCreate: external app có AI riêng, phải RỚI trước ──
  {
    reset();
    ctl.result.routeAuditEntry = { module: "massRoleCreate", describeTarget: "<@&R9>" };
    await client.emit("guildAuditLogEntryCreate", { action: 7 }, guild);
    check(
      "IntegrationCreate → handleExternalApp (không đi qua audit thường)",
      calls.some((c) => c.name === "handleExternalApp") &&
        !calls.some((c) => c.name === "handleAuditEntry"),
    );
  }
  {
    reset();
    ctl.result.routeAuditEntry = null;
    await client.emit("guildAuditLogEntryCreate", { action: 8 }, guild);
    check(
      "event không thuộc nuke nào → bỏ qua, không ghi log ồn",
      calls.some((c) => c.name === "routeAuditEntry") &&
        !calls.some((c) => c.name === "handleAuditEntry"),
    );
  }
  {
    reset();
    ctl.result.routeAuditEntry = { module: "massChannelDelete", describeTarget: "#c" };
    await client.emit("guildAuditLogEntryCreate", { action: 4 }, guild);
    const c = calls.find((x) => x.name === "handleAuditEntry");
    check(
      "có route → handleAuditEntry mang đúng module",
      c?.args[2] === "massChannelDelete" && c?.args[1] === guild,
      JSON.stringify(c?.args.slice(1)),
    );
  }

  {
    // Audit log đến trễ VÀ lần 2 lại lỗi/mơ hồ → dừng, không kết luận tự rời.
    // Nhánh này khác nhánh "tra lại rồi thấy kick": nếu không bắt lỗi lần 2,
    // một lần audit API lỗi sẽ khiến người bị kick hợp lệ bị quy thành tự rời
    // rồi đi vào kiểm hit-and-run.
    reset();
    ctl.auditQueue = [{ ok: true, found: false, ambiguous: false, executor: null }];
    ctl.auditThrowsAfterFirst = true;
    await named("guildMemberRemove", { id: "U8" });
    check(
      "tra lại lần 2 mà audit lỗi → dừng, không tính tự rời",
      !calls.some((c) => c.name === "handleAttributeEvent" || c.name === "handleHitAndRunLeave"),
      JSON.stringify(calls.map((c) => c.name)),
    );
  }

  // ── Tầng con ném lỗi: bot KHÔNG được chết theo ──
  // Không có catch ở đây là unhandled rejection → Node/Bun có thể tắt tiến
  // trình, tức MỘT lỗi tầng con khiến bot anti-nuke chết sống trong lúc
  // đang chống raid.
  {
    reset();
    ctl.throws.add("handleMessageBulk");
    await named("messageDeleteBulk", { size: 2 });
    check("tầng con ném lỗi ở listener bất đồng bộ → không ném ra ngoài", true);
  }
  {
    reset();
    ctl.throws.add("handleAttributeEvent");
    await named("guildBanAdd", { user: { id: "U1" } });
    check("tầng con ném lỗi ở listener ban → không ném ra ngoài", true);
  }

  // ── Vòng tick 20s: gọi 3 hàm quét + dọn RAM ──
  {
    reset();
    await tick.fn();
    check(
      "tick gọi tickUnlocks",
      calls.some((c) => c.name === "tickUnlocks"),
    );
    check(
      "tick gọi tickHeatResets",
      calls.some((c) => c.name === "tickHeatResets"),
    );
    check(
      "tick gọi tickVandalReleases",
      calls.some((c) => c.name === "tickVandalReleases"),
    );
    check(
      "tick gọi sweepMemory (dọn RAM)",
      calls.some((c) => c.name === "sweepMemory"),
    );
  }
  {
    // Một lệnh trong tick ném lỗi → các lệnh còn lại VẪN phải chạy.
    reset();
    ctl.throws.add("tickUnlocks");
    await tick.fn();
    check(
      "lệnh đầu ném lỗi → lệnh sau vẫn chạy, không bỏ dở cả vòng tick",
      calls.some((c) => c.name === "tickHeatResets") && calls.some((c) => c.name === "sweepMemory"),
    );
  }

  console.log(`\nKết quả: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
