// TEST: S3 nukeRollback — TỰ HỒI PHỤC server sau khi bị bot nuke.
// Chạy: node scripts/test-nuke-rollback.cjs
//
// Vì sao cần suite riêng: test-rollback-budget.cjs chỉ phủ đường "gọi
// runRollback trực tiếp" với engine backup THẬT. Nhánh production thật lại
// đi qua scheduleRollback → hẹn giờ 60s → tự chạy, và mọi nhánh lỗi quanh
// đó chưa suite nào chạm tới:
//   - timer grace bắn ra nhưng runRollback nổ → unhandled rejection chết bot.
//   - cooldown bị ăn oan khi lần chạy không đủ điều kiện (chưa có snapshot)
//     → 10 phút sau vụ nuke thật mới được hồi phục.
//   - so khớp tên phân biệt/thiếu phân biệt hoa thường → tạo role trùng hoặc
//     bỏ sót role thật sự đã mất.
//   - engine backup ném (quota rate limit, mất Manage Roles) → có nuốt lỗi
//     hay làm hỏng luôn lần rollback.
// Bug ở đây = server bị nuke xong KHÔNG tự hồi phục, chủ server phải restore tay.
//
// Không mạng, không DB thật, không đụng Convex. Snapshot ghi vào temp dir;
// util + engine backup mock đúng y hệt lời gọi thật (đều trả Promise).
const fs = require("fs");
const os = require("os");
const path = require("path");
const DJS_MOCK = require("./support/djs-mock-path.cjs");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "proto-nuke-rollback-"));
process.env.PROTOGON_SNAPSHOT_DIR = path.join(tmp, "snapshots");
process.env.PROTOGON_LOG_DIR = path.join(tmp, "logs");

const Module = require("module");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "discord.js") return DJS_MOCK;
  return origResolve.call(this, request, ...args);
};
fs.writeFileSync(
  DJS_MOCK,
  `class EmbedBuilder {
  constructor(data = {}) { this.d = data; }
  setColor(c) { this.d.color = c; return this; }
  setTitle(t) { this.d.title = t; return this; }
  setDescription(t) { this.d.description = t; return this; }
  addFields(f) { this.d.fields = [...(this.d.fields ?? []), ...f]; return this; }
  setTimestamp() { return this; }
  setFooter(f) { this.d.footer = f; return this; }
}
module.exports = {
  Colors: new Proxy({}, { get: () => 0x000000 }),
  EmbedBuilder,
  PermissionFlagsBits: { ManageGuild: 1n << 5n, Administrator: 1n << 3n },
  UserFlags: { VerifiedBot: 1n << 16n },
};
`,
);

// ── Cặp bơm cho setTimeout: nukeRollback hẹn 1 timer 60s rồi .unref() ──
// Bắt thay vì chờ thật để kiểm tra ĐÚNG đường đi production (schedule →
// timer bắn → tự chạy), thay vì lại gọi runRollback trực tiếp cho nhanh.
const timers = [];
const realSetTimeout = global.setTimeout;
global.setTimeout = (cb, ms) => {
  timers.push({ cb, ms });
  return { unref() {} };
};

/** Bắt đầu một timer đã hẹn (tương đương 60s sau đó) và chờ callback xong. */
async function fireTimer(index) {
  await timers[index].cb();
}

// ── Mock util + engine backup ─────────────────────────────────────────
const calls = { createRoles: [], createChannels: [], logs: [] };

/** createRoles: ghi lời gọi, trả Map oldId -> newId (đúng hợp đồng engine thật). */
function makeCreateRoles() {
  return async (guild, partial) => {
    calls.createRoles.push({ guildId: guild.id, partial });
    const map = new Map();
    for (const r of partial.roles || []) map.set(r.id, `new-${r.id}`);
    return map;
  };
}

/** createChannels: nhận thêm Map role đã tạo để dựng kênh con/category. */
function makeCreateChannels() {
  return async (guild, partial, createdRoles) => {
    calls.createChannels.push({ guildId: guild.id, partial, createdRoles });
    const map = new Map();
    for (const c of partial.channels || []) map.set(c.id, `new-${c.id}`);
    return map;
  };
}

const ctl = {
  createRoles: makeCreateRoles(),
  createChannels: makeCreateChannels(),
  sendLog: async (guild, config, embed) => {
    calls.logs.push({ guildId: guild.id, config, embed });
  },
};

function resetCalls() {
  calls.createRoles.length = 0;
  calls.createChannels.length = 0;
  calls.logs.length = 0;
  ctl.createRoles = makeCreateRoles();
  ctl.createChannels = makeCreateChannels();
}

const origLoad = Module._load;
Module._load = function (request, parent) {
  const isRollback = parent && /antinuke[\\/]nukeRollback\.js$/.test(parent.filename);
  if (isRollback && request === "../../util") {
    return {
      logEmbed: (opts) => ({ ...opts }),
      sendLog: (guild, config, embed) => ctl.sendLog(guild, config, embed),
    };
  }
  if (isRollback && request === "../backup") {
    return {
      createRoles: (guild, partial) => ctl.createRoles(guild, partial),
      createChannels: (guild, partial, createdRoles) =>
        ctl.createChannels(guild, partial, createdRoles),
    };
  }
  return origLoad.apply(this, arguments);
};

const localSnapshot = require("../bot/src/localSnapshot");
const createNukeRollback = require("../bot/src/handlers/antinuke/nukeRollback");

// ── Tiện ích dựng dữ liệu ────────────────────────────────────────────
const configs = new Map();
let configThrows = false;
const store = {
  getConfig: (id) =>
    configThrows
      ? Promise.reject(new Error("Convex chết"))
      : Promise.resolve(configs.get(id) ?? null),
};

const newRb = () => createNukeRollback({ store });

/** Guild Discord sau vụ nuke: cache chỉ còn những gì kẻ xấu chưa xoá. */
function mkGuild(id, { roles = [], channels = [], available = true } = {}) {
  return {
    id,
    name: `Server ${id}`,
    available,
    roles: { cache: new Map(roles.map((r, i) => [`r-${i}`, { id: `r-${i}`, name: r }])) },
    channels: {
      cache: new Map(
        channels.map((c, i) => [`c-${i}`, { id: `c-${i}`, name: c.name, type: c.type ?? 0 }]),
      ),
    },
  };
}

function writeSnap(guildId, guild, ts, extra = {}) {
  return localSnapshot.writeLocalSnapshot(
    guildId,
    {
      snapshotAt: ts,
      guild: { version: 4, guildId, guildName: `Server ${guildId}`, ...guild },
      ...extra,
    },
    ts,
  );
}

/** Cấu trúc server TRƯỚC vụ nuke — nguồn khôi phục. */
const PRE_NUKE = {
  settings: { restoreRolesEnabled: true, restoreChannelsEnabled: true },
  roles: [
    { id: "r-admin", name: "Admin", color: 0xff0000, permissions: "8", position: 3 },
    { id: "r-mod", name: "Mod", color: 0x00ff00, permissions: "4", position: 2 },
    { id: "r-member", name: "Member", color: 0, permissions: "0", position: 1 },
  ],
  channels: [
    { id: "c-general", name: "general", type: 0, position: 1, overwrites: [] },
    { id: "c-news", name: "tin-tuc", type: 5, position: 2, overwrites: [] },
    { id: "c-chat", name: "chat", type: 0, position: 3, overwrites: [] },
  ],
};

let pass = 0;
let fail = 0;
function check(name, ok, extra) {
  if (ok) {
    pass++;
    return;
  }
  fail++;
  console.error(`FAIL: ${name}${extra === undefined ? "" : ` — ${JSON.stringify(extra)}`}`);
}

/** Bắt console trong lúc chạy để kiểm tra dòng log của module. */
async function capture(fn) {
  const log = [];
  const error = [];
  const realLog = console.log;
  const realError = console.error;
  console.log = (...a) => log.push(a.map(String).join(" "));
  console.error = (...a) => error.push(a.map(String).join(" "));
  try {
    await fn();
  } finally {
    console.log = realLog;
    console.error = realError;
  }
  return { log, error };
}

(async () => {
  // ══ A. Đường đi thật: anti-nuke gọi scheduleRollback → hẹn 60s → tự chạy ══
  {
    resetCalls();
    configs.clear();
    const gid = "g-grace";
    configs.set(gid, { rollbackEnabled: true, logChannelId: "log-1" });
    writeSnap(gid, PRE_NUKE, 1_700_000_000_000);
    // Bot nuke xoá sạch trừ role Member + kênh chat.
    const guild = mkGuild(gid, { roles: ["Member"], channels: [{ name: "chat", type: 0 }] });
    const rb = newRb();

    const s0 = rb.scheduleRollback(null, "massRoleDelete", "atk");
    check(
      "A1 không có guild → không hẹn lịch",
      s0.scheduled === false && s0.reason === "thiếu guild",
    );
    check("A1b guild hỏng không hẹn timer nào", timers.length === 0, timers.length);

    const s1 = rb.scheduleRollback(guild, "massRoleDelete", "atk1");
    check(
      "A2 vụ đầu hẹn lịch đúng GRACE_MS",
      s1.scheduled === true && s1.graceMs === rb.GRACE_MS && rb.GRACE_MS === 60_000,
      s1,
    );
    check(
      "A3 hẹn đúng 1 timer 60 giây",
      timers.length === 1 && timers[0].ms === rb.GRACE_MS,
      timers.length,
    );

    const s2 = rb.scheduleRollback(guild, "massChannelDelete", "atk2");
    const s3 = rb.scheduleRollback(guild, "massBan", "atk3");
    check(
      "A4 các vụ sau trong grace window gộp chung lịch",
      s2.scheduled === false && s3.scheduled === false && timers.length === 1,
      { s2, s3, timers: timers.length },
    );
    check(
      "A5 cùng module lặp lại không hẹn timer thứ hai",
      rb.scheduleRollback(guild, "massRoleDelete", "atk1").scheduled === false &&
        timers.length === 1,
      timers.length,
    );

    // Timer bắn: rollback phải tự chạy, hồi đủ role + kênh đã mất.
    await fireTimer(0);
    check("A6 timer bắn → tạo lại 2 role", calls.createRoles.length === 1);
    check("A7 timer bắn → tạo lại 2 kênh", calls.createChannels.length === 1);
    check(
      "A8 đúng các mục bị nuke bị hồi phục (không đụng thứ còn nguyên)",
      calls.createRoles[0]?.partial.roles.map((r) => r.name).join() === "Admin,Mod" &&
        calls.createChannels[0]?.partial.channels.map((c) => c.name).join() === "general,tin-tuc",
      calls.createRoles[0]?.partial.roles.map((r) => r.name),
    );
    check("A9 timer bắn → báo log 1 lần", calls.logs.length === 1, calls.logs.length);
    check(
      "A10 log nhắc đủ module của cả 3 vụ + thủ phạm",
      ["massRoleDelete", "massChannelDelete", "massBan", "<@atk1>"].every((t) =>
        String(calls.logs[0]?.embed.description).includes(t),
      ),
      calls.logs[0]?.embed.description,
    );
  }

  // ══ B. Chặn sai: KHÔNG mất mát thì không được đụng server ══
  {
    const rb = newRb();
    const gid = "g-guard";
    configs.set(gid, { rollbackEnabled: true });

    check(
      "B1 runRollback(null) → bỏ qua, không ném",
      (await rb.runRollback(null, ["massRoleDelete"], "atk")).ran === false,
    );

    writeSnap("g-unavail", PRE_NUKE, 1_700_000_100_000);
    configs.set("g-unavail", { rollbackEnabled: true });
    const unavail = mkGuild("g-unavail", { available: false, roles: [], channels: [] });
    const r1 = await rb.runRollback(unavail, ["massRoleDelete"], "atk", { force: true });
    check(
      "B2 guild chưa sẵn sàng (Discord còn đang ổn định) → bỏ qua",
      r1.ran === false && r1.reason === "guild không sẵn sàng",
      r1,
    );

    configThrows = true;
    const r2 = await rb.runRollback(mkGuild("g-x", { roles: [], channels: [] }), [], "atk");
    configThrows = false;
    check("B3 Convex chết (getConfig ném) → bỏ qua, không ném ra ngoài", r2.ran === false, r2);

    const r3 = await rb.runRollback(
      mkGuild("g-chua-config", { roles: [], channels: [] }),
      [],
      "atk",
    );
    check("B4 guild chưa cấu hình → bỏ qua", r3.ran === false, r3);

    configs.set(gid, { rollbackEnabled: false });
    const r4 = await rb.runRollback(
      mkGuild(gid, { roles: ["Member"], channels: [{ name: "chat" }] }),
      ["massRoleDelete"],
      "atk",
      { force: true },
    );
    check(
      "B5 chủ server tắt rollbackEnabled → bỏ qua",
      r4.ran === false && r4.reason === "rollback tắt",
      r4,
    );
  }

  // ══ C. Ngưỡng MIN_MISSING + cooldown: biên trên/biên dưới ══
  {
    // Chỉ thiếu đúng 1 role (Mod) → không đáng bật cả cơ chế khôi phục.
    const gid1 = "g-mot";
    configs.set(gid1, { rollbackEnabled: true });
    writeSnap(gid1, PRE_NUKE, 1_700_000_200_000);
    const g1 = mkGuild(gid1, {
      roles: ["Admin", "Member"],
      channels: [
        { name: "general", type: 0 },
        { name: "tin-tuc", type: 5 },
        { name: "chat", type: 0 },
      ],
    });
    const rb = newRb();
    const r1 = await rb.runRollback(g1, ["massRoleDelete"], "atk", { force: true });
    check(
      "C1 thiếu đúng 1 mục → bỏ qua (không spam tạo role cho 1 thứ)",
      r1.ran === false && r1.missingRoles === 1 && /chỉ thiếu 1 mục/.test(r1.reason || ""),
      r1,
    );

    // Biên trên: thiếu đúng 2 mục → chạy.
    const gid2 = "g-hai";
    configs.set(gid2, { rollbackEnabled: true });
    writeSnap(gid2, PRE_NUKE, 1_700_000_200_001);
    const g2 = mkGuild(gid2, {
      roles: ["Admin", "Member"],
      channels: [
        { name: "tin-tuc", type: 5 },
        { name: "chat", type: 0 },
      ],
    });
    resetCalls();
    const r2 = await rb.runRollback(g2, ["massRoleDelete"], "atk", { force: true });
    check(
      "C2 thiếu đúng 2 mục (biên MIN_MISSING) → chạy",
      r2.ran === true && r2.restoredRoles === 1 && r2.restoredChannels === 1,
      r2,
    );

    // Cooldown 10 phút + force.
    resetCalls();
    const r3 = await rb.runRollback(g2, ["massChannelDelete"], "atk");
    check(
      "C3 lần thứ 2 trong 10 phút → bị cooldown chặn",
      r3.ran === false && r3.reason === "trong cooldown" && calls.createRoles.length === 0,
      r3,
    );
    const r4 = await rb.runRollback(g2, ["massChannelDelete"], "atk", { force: true });
    check("C4 force → bỏ qua cooldown, chạy lại được", r4.ran === true, r4);
    const r5 = await rb.runRollback(g2, ["massChannelDelete"], "atk");
    check("C5 sau lần force vẫn còn cooldown mới nhất", r5.ran === false, r5);
    rb.reset();
    const r6 = await rb.runRollback(g2, ["massChannelDelete"], "atk");
    check("C6 reset() xoá cooldown", r6.ran === true, r6);
  }

  // ══ D. Đối chiếu snapshot: chọn đúng bản, không so sai chữ ══
  {
    const rb = newRb();
    // D1 — không có snapshot nào (VPS mới cài, chưa kịp chụp).
    configs.set("g-rong", { rollbackEnabled: true });
    const r1 = await rb.runRollback(
      mkGuild("g-rong", { roles: [], channels: [] }),
      ["massRoleDelete"],
      "atk",
      { force: true },
    );
    check(
      "D1 chưa có snapshot → bỏ qua im lặng",
      r1.ran === false && r1.reason === "không có snapshot",
      r1,
    );

    // D2 — snapshot hỏng (không có mảng roles/channels).
    writeSnap("g-hong-snap", { note: "file cắt dở" }, 1_700_000_300_000);
    configs.set("g-hong-snap", { rollbackEnabled: true });
    const r2 = await rb.runRollback(
      mkGuild("g-hong-snap", { roles: [], channels: [] }),
      ["massRoleDelete"],
      "atk",
      { force: true },
    );
    check(
      "D2 snapshot không có cấu trúc → bỏ qua, không ném",
      r2.ran === false && r2.reason === "snapshot không có cấu trúc",
      r2,
    );

    // D3 — mốc snapshot: phải hồi phục theo bản TRƯỚC nuke, không theo bản
    // mới hơn (bản sau nuke đã thiếu sẵn role/kênh → hồi lại cũng vô ích).
    const gid3 = "g-moc";
    configs.set(gid3, { rollbackEnabled: true });
    writeSnap(gid3, PRE_NUKE, 1_700_000_400_000);
    const sauNuke = {
      settings: PRE_NUKE.settings,
      roles: PRE_NUKE.roles.filter((r) => r.name === "Member"),
      channels: PRE_NUKE.channels.filter((c) => c.name === "chat"),
    };
    writeSnap(gid3, sauNuke, 1_700_000_500_000);
    const g3 = mkGuild(gid3, { roles: ["Member"], channels: [{ name: "chat", type: 0 }] });
    resetCalls();
    const r3 = await rb.runRollback(g3, ["massRoleDelete"], "atk", {
      force: true,
      snapshotTs: 1_700_000_400_000,
    });
    check(
      "D3 chỉ định mốc TRƯỚC nuke → hồi đủ 2 role + 2 kênh",
      r3.ran === true && r3.restoredRoles === 2 && r3.restoredChannels === 2,
      r3,
    );
    const r4 = await rb.runRollback(g3, ["massRoleDelete"], "atk", {
      force: true,
      snapshotTs: 1_700_000_500_000,
    });
    check(
      "D4 mốc SAU nuke (đã thiếu sẵn) → không có gì để hồi",
      r4.ran === false && r4.missingRoles === 0 && r4.missingChannels === 0,
      r4,
    );

    // D5 — so tên không phân biệt hoa thường (Discord cho phép "Admin"/"admin").
    const gid5 = "g-hoa";
    configs.set(gid5, { rollbackEnabled: true });
    writeSnap(gid5, PRE_NUKE, 1_700_000_600_000);
    const g5 = mkGuild(gid5, {
      roles: ["admin", "mod", "Member"],
      channels: [
        { name: "GENERAL", type: 0 },
        { name: "TIN-TUC", type: 5 },
        { name: "chat", type: 0 },
      ],
    });
    resetCalls();
    const r5 = await rb.runRollback(g5, ["massRoleDelete"], "atk", { force: true });
    check(
      "D5 role/kênh còn trong server (khác hoa thường) → KHÔNG tạo trùng",
      r5.ran === false && r5.missingRoles === 0 && r5.missingChannels === 0,
      r5,
    );

    // D6 — khoá so là `type:tên`, nên kênh trùng TÊN nhưng KHÁC LOẠI vẫn phải
    // hồi: server còn kênh voice "general" nhưng kênh text đã bị nuke xoá.
    const gid6 = "g-type";
    configs.set(gid6, { rollbackEnabled: true });
    writeSnap(gid6, PRE_NUKE, 1_700_000_700_000);
    const g6 = mkGuild(gid6, {
      roles: ["Admin", "Mod", "Member"],
      channels: [
        { name: "general", type: 2 },
        { name: "chat", type: 0 },
      ],
    });
    resetCalls();
    const r6 = await rb.runRollback(g6, ["massChannelDelete"], "atk", { force: true });
    check(
      "D6 kênh trùng tên nhưng khác loại → vẫn hồi (role còn nguyên thì không tạo)",
      r6.ran === true &&
        r6.missingChannels === 2 &&
        r6.missingRoles === 0 &&
        calls.createChannels[0]?.partial.channels.map((c) => c.name).join() === "general,tin-tuc" &&
        calls.createRoles.length === 0,
      r6,
    );

    // D7 — mục không có tên (snapshot hỏng) → bỏ qua, không tạo role rỗng.
    const gid7 = "g-rong-ten";
    configs.set(gid7, { rollbackEnabled: true });
    writeSnap(
      gid7,
      {
        roles: [{ id: "x1" }, { id: "x2", name: "" }, { id: "r-a", name: "A" }],
        channels: [{ id: "y1" }, { id: "y2", name: "kenh" }],
      },
      1_700_000_800_000,
    );
    const g7 = mkGuild(gid7, { roles: [], channels: [] });
    resetCalls();
    const r7 = await rb.runRollback(g7, ["massRoleDelete"], "atk", { force: true });
    check(
      "D7 mục thiếu tên bị bỏ qua, chỉ hồi mục có tên",
      r7.ran === true &&
        r7.missingRoles === 1 &&
        calls.createRoles[0]?.partial.roles[0].name === "A" &&
        calls.createChannels[0]?.partial.channels[0].name === "kenh",
      r7,
    );
  }

  // ══ E. Tôn trọng cấu hình + lỗi engine không được làm hỏng lần hồi phục ══
  {
    const gid = "g-cau-hinh";
    const g = mkGuild(gid, { roles: ["Member"], channels: [{ name: "chat" }] });
    writeSnap(gid, PRE_NUKE, 1_700_001_000_000);

    // E1 — tắt tạo role.
    resetCalls();
    configs.set(gid, { rollbackEnabled: true, restoreRolesEnabled: false });
    const r1 = await createNukeRollback({ store }).runRollback(g, ["massRoleDelete"], "atk", {
      force: true,
    });
    check(
      "E1 restoreRolesEnabled=false → không tạo role, kênh vẫn hồi",
      r1.ran === true &&
        r1.restoredRoles === 0 &&
        calls.createRoles.length === 0 &&
        r1.restoredChannels === 2,
      r1,
    );

    // E2 — tắt tạo kênh.
    resetCalls();
    configs.set(gid, { rollbackEnabled: true, restoreChannelsEnabled: false });
    const r2 = await createNukeRollback({ store }).runRollback(g, ["massChannelDelete"], "atk", {
      force: true,
    });
    check(
      "E2 restoreChannelsEnabled=false → không tạo kênh, role vẫn hồi",
      r2.ran === true &&
        r2.restoredChannels === 0 &&
        calls.createChannels.length === 0 &&
        r2.restoredRoles === 2,
      r2,
    );

    // E3 — createRoles ném (mất Manage Roles / rate limit): KHÔNG được ném ra
    // ngoài, và createChannels vẫn phải chạy (với map rỗng) để hồi kênh.
    resetCalls();
    configs.set(gid, { rollbackEnabled: true });
    const rb3 = createNukeRollback({ store });
    ctl.createRoles = async () => {
      throw new Error("Missing Permissions");
    };
    let nemRaNgoai = false;
    let r3;
    try {
      r3 = await rb3.runRollback(g, ["massRoleDelete"], "atk", { force: true });
    } catch (e) {
      nemRaNgoai = true;
      r3 = { err: e.message };
    }
    check(
      "E3 createRoles ném → nuốt lỗi, kênh vẫn được hồi",
      nemRaNgoai === false &&
        r3.ran === true &&
        r3.restoredRoles === 0 &&
        r3.restoredChannels === 2,
      r3,
    );
    check(
      "E4 createChannels nhận Map rỗng khi role tạo hỏng (không undefined)",
      calls.createChannels[0]?.createdRoles instanceof Map &&
        calls.createChannels[0].createdRoles.size === 0,
      calls.createChannels[0]?.createdRoles,
    );

    // E5 — createChannels ném.
    resetCalls();
    ctl.createChannels = async () => {
      throw new Error("rate limit");
    };
    const r5 = await rb3.runRollback(g, ["massChannelDelete"], "atk", { force: true });
    check(
      "E5 createChannels ném → vẫn báo thành công phần role, không ném ra ngoài",
      r5.ran === true && r5.restoredRoles === 2 && r5.restoredChannels === 0,
      r5,
    );
    ctl.createChannels = makeCreateChannels();
  }

  // ══ F. Truyền đúng dữ liệu xuống engine backup ══
  {
    const gid = "f-noi-dung";
    const g = mkGuild(gid, { roles: ["Member"], channels: [{ name: "chat" }] });
    writeSnap(gid, PRE_NUKE, 1_700_002_000_000);
    configs.set(gid, { rollbackEnabled: true, logChannelId: "log-f" });
    resetCalls();
    const r = await createNukeRollback({ store }).runRollback(g, ["massRoleDelete"], "atk9", {
      force: true,
    });
    const sent = calls.createRoles[0]?.partial;
    const chan = calls.createChannels[0];
    check(
      "F1 partial chỉ mang cấu trúc THIẾU + định danh server",
      sent?.roles.map((x) => x.id).join() === "r-admin,r-mod" &&
        sent?.channels.map((x) => x.id).join() === "c-general,c-news" &&
        sent?.guildId === gid &&
        sent?.guildName === `Server ${gid}` &&
        sent?.settings?.restoreRolesEnabled === true &&
        sent?.settings?.restoreChannelsEnabled === true,
      sent && { roles: sent.roles.map((x) => x.id), channels: sent.channels.map((x) => x.id) },
    );
    check(
      "F2 createChannels nhận Map role đã tạo (dựng được kênh con theo role)",
      chan?.createdRoles instanceof Map &&
        chan.createdRoles.get("r-admin") === "new-r-admin" &&
        chan.createdRoles.get("r-mod") === "new-r-mod",
      chan?.createdRoles,
    );
    check("F3 kết quả trả về đầy đủ", r.ran === true && r.snapshotTs === 1_700_002_000_000, r);
  }

  // ══ G. Embed log + dòng tổng kết ══
  {
    const gid = "g-log";
    const g = mkGuild(gid, { roles: ["Member"], channels: [{ name: "chat" }] });
    writeSnap(gid, PRE_NUKE, 1_700_003_000_000);
    configs.set(gid, { rollbackEnabled: true, logChannelId: "log-g" });
    resetCalls();
    const { log } = await capture(() =>
      createNukeRollback({ store }).runRollback(g, ["massRoleDelete", "massBan"], "atk10", {
        force: true,
      }),
    );
    const embed = calls.logs[0]?.embed;
    check(
      "G1 embed log có tiêu đề + footer đúng chuẩn",
      /Nuke Rollback/.test(embed?.title || "") && embed?.footer === "Protogon · Nuke Rollback",
      embed,
    );
    check(
      "G2 embed liệt kê đủ 3 trường số liệu",
      embed?.fields?.length === 3 &&
        embed.fields[0].name === "Role thiếu" &&
        embed.fields[0].value === "2" &&
        embed.fields[1].name === "Kênh thiếu" &&
        embed.fields[1].value === "2",
      embed?.fields,
    );
    check(
      "G3 mô tả ghi rõ đã tạo lại bao nhiêu + mốc snapshot",
      /\*\*2 role\*\*/.test(embed?.description || "") &&
        /\*\*2 kênh\*\*/.test(embed.description) &&
        /2023-11-14 23:03/.test(embed.description),
      embed?.description,
    );
    check(
      "G4 in dòng tổng kết ra log bot",
      log.some(
        (l) => l.startsWith(`[nukeRollback] ${gid}:`) && l.includes("+2 roles, +2 channels"),
      ),
      log,
    );

    // G5 — log hỏng (kênh log bị xoá, mất quyền) KHÔNG được phá kết quả.
    resetCalls();
    ctl.sendLog = async () => {
      throw new Error("50007 Missing Access");
    };
    const r5 = await createNukeRollback({ store }).runRollback(g, ["massRoleDelete"], "atk10", {
      force: true,
    });
    check(
      "G5 gửi log lỗi → kết quả hồi phục vẫn trả về bình thường",
      r5.ran === true && r5.restoredRoles === 2,
      r5,
    );
    ctl.sendLog = async (guild, config, embed) => {
      calls.logs.push({ guildId: guild.id, config, embed });
    };

    // G6 — snapshot không ghi mốc thời gian → không bịa mốc trong log.
    const gid6 = "g-khong-moc";
    writeSnap(gid6, PRE_NUKE, 1_700_003_100_000, { snapshotAt: undefined });
    configs.set(gid6, { rollbackEnabled: true, logChannelId: "log-g6" });
    resetCalls();
    const r6 = await createNukeRollback({ store }).runRollback(
      mkGuild(gid6, { roles: ["Member"], channels: [{ name: "chat" }] }),
      ["massRoleDelete"],
      "atk",
      { force: true },
    );
    check(
      "G6 snapshot không có mốc → snapshotTs null, log không bịa thời gian",
      r6.ran === true &&
        r6.snapshotTs === null &&
        !/UTC\)/.test(calls.logs[0]?.embed.description || ""),
      r6,
    );
  }

  // ══ H. Timer bắn mà runRollback nổ → bot KHÔNG chết, có log lỗi ══
  {
    const gid = "g-timer-no";
    configs.set(gid, { rollbackEnabled: true });
    writeSnap(gid, PRE_NUKE, 1_700_004_000_000);
    // Guild hỏng (cache chưa sẵn sàng) → runRollback ném TypeError.
    const badGuild = { id: gid, available: true, roles: undefined, channels: { cache: new Map() } };
    const rb = createNukeRollback({ store });
    rb.scheduleRollback(badGuild, "massRoleDelete", "atk");
    const idx = timers.length - 1;
    const { error } = await capture(() => fireTimer(idx));
    check(
      "H1 timer bắn lỗi → bắt được, in log, KHÔNG unhandled rejection",
      error.some((l) => l.startsWith(`[nukeRollback] ${gid}:`)),
      error,
    );
    check(
      "H2 sau lỗi, lịch đã được xoá (không kẹt ở pending)",
      rb.scheduleRollback(mkGuild(gid, { roles: [], channels: [] }), "massRoleDelete", "atk")
        .scheduled === true,
    );
  }

  // ══ I. Ghi chú hành vi: cooldown bị ăn CẢ khi lần chạy không đủ điều kiện ══
  // lastRun được set TRƯỚC khi kiểm tra snapshot → lần gọi "không có snapshot"
  // vẫn ăn 10 phút cooldown của guild. Cố ý chốt lại ở đây: nếu sau này đổi
  // thứ tự này (set lastRun sau các nhánh "bỏ qua") thì test phải đổi theo.
  {
    const gid = "i-cooldown-an";
    configs.set(gid, { rollbackEnabled: true });
    const rb = createNukeRollback({ store });
    const g = mkGuild(gid, { roles: ["Member"], channels: [{ name: "chat" }] });

    // Chưa có snapshot nào trên VPS (mới cài, vòng chụp chưa chạy tới).
    const r1 = await rb.runRollback(g, ["massRoleDelete"], "atk");
    check(
      "I1 chưa có snapshot → bỏ qua",
      r1.ran === false && r1.reason === "không có snapshot",
      r1,
    );

    // Vụ nuke thật xảy ra ngay sau đó: snapshot đã có, nhưng vẫn bị cooldown.
    writeSnap(gid, PRE_NUKE, 1_700_005_000_000);
    const r2 = await rb.runRollback(g, ["massRoleDelete"], "atk");
    check("I2 lần gọi vô tình đã ăn cooldown của lần hợp lệ ngay sau", r2.ran === false, r2);
    const r3 = await rb.runRollback(g, ["massRoleDelete"], "atk", { force: true });
    check("I3 force vẫn hồi phục được (lệnh thủ công không bị kẹt)", r3.ran === true, r3);

    // Ngược lại: config chưa có thì KHÔNG ăn cooldown (guard chạy trước).
    const gid2 = "i-chua-config";
    configs.delete(gid2);
    writeSnap(gid2, PRE_NUKE, 1_700_005_100_000);
    const rb2 = createNukeRollback({ store });
    const g2 = mkGuild(gid2, { roles: ["Member"], channels: [{ name: "chat" }] });
    const r4 = await rb2.runRollback(g2, ["massRoleDelete"], "atk");
    check("I4 chưa có config → bỏ qua", r4.ran === false, r4);
    configs.set(gid2, { rollbackEnabled: true });
    const r5 = await rb2.runRollback(g2, ["massRoleDelete"], "atk");
    check(
      "I5 bật cấu hình rồi thì chạy được ngay (config-không-có không ăn cooldown)",
      r5.ran === true,
      r5,
    );
  }

  global.setTimeout = realSetTimeout;
  console.log(`\n${pass}/${pass + fail} ✅`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(fail > 0 ? 1 : 0);
})();
