// TEST: pipeline KHÔI PHỤC end-to-end qua tick thật (bot/src/tick.js).
// Chạy: node scripts/test-restore-pipeline.cjs — mock Discord + Convex, không mạng.
//
// Tái hiện đúng luồng khi chủ server bấm "Khôi phục vào server này":
//   web → requestRestore đặt cờ (mô phỏng bằng state) → bot_tick:getPendingJobs
//   (mô phỏng batch) → runBackupJobs → botClaimBackup (claim/in-flight) →
//   runRestore → botClearBackup (xong) | botReportRestoreError (lỗi).
// Trước fix: restore lỗi bị XÓA CỜ IM LẶNG — dashboard không bao giờ biết.
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
  `class EmbedBuilder {
  constructor(data = {}) { this.d = data; }
  setColor(c) { this.d.color = c; return this; }
  setTitle(t) { this.d.title = t; return this; }
  setDescription(t) { this.d.description = t; return this; }
  addFields(f) { this.d.fields = [...(this.d.fields ?? []), ...f]; return this; }
  setTimestamp() { return this; }
  setFooter(f) { this.d.footer = f; return this; }
}
class Collection extends Map {}
module.exports = {
  Colors: new Proxy({}, { get: () => 0x000000 }),
  EmbedBuilder,
  Collection,
  ChannelType: { GuildText: 0, GuildAnnouncement: 5, GuildVoice: 2, GuildCategory: 4, GuildStageVoice: 13, GuildForum: 15 },
  PermissionsBitField: { Flags: new Proxy({}, { get: () => 1n }) },
  PermissionFlagsBits: { ManageGuild: 1n << 5n, Administrator: 1n << 3n, ViewChannel: 1n << 10n },
  AuditLogEvent: new Proxy({}, { get: () => 0 }),
  Partials: {},
  GatewayIntentBits: new Proxy({}, { get: () => 0 }),
};
`,
);

delete process.env.BACKUP_ENCRYPT_KEY;

const tick = require("../bot/src/tick.js");
const utils = require("../bot/src/backupUtils.js");

let pass = 0;
let fail = 0;
const check = (label, ok) => {
  console.log(ok ? `PASS ${label}` : `FAIL ${label}`);
  ok ? pass++ : fail++;
};

/** Giả lập DB Convex cho side của cờ restore (giống botClaimBackup thật). */
function makeFlagDb(initial = {}) {
  const state = {
    restoreRequested: true,
    restoreBackupId: "bk1",
    restoreClaimedAt: undefined,
    restoreError: undefined,
    restoreErrorAt: undefined,
    ...initial,
  };
  return state;
}

/** Mock store: claim hoạt động như botClaimBackup thật trên "DB" cờ. */
function makeStore(flagDb, { logChannelId = "log-ch-1" } = {}) {
  const mutations = [];
  return {
    _mutations: mutations,
    _flagDb: flagDb,
    client: {
      mutation: async (name, args = {}) => {
        mutations.push({ name, args });
        if (name === "bot_writes:botClaimBackup") {
          const now = Date.now();
          if (args.kind === "backup") {
            if (!flagDb.backupRequested) return { ok: false, reason: "no_request" };
            if (flagDb.backupClaimedAt !== undefined && now - flagDb.backupClaimedAt < 600_000) {
              return { ok: false, reason: "in_flight" };
            }
            flagDb.backupClaimedAt = now;
            return { ok: true };
          }
          if (!flagDb.restoreRequested) return { ok: false, reason: "no_request" };
          if (flagDb.restoreClaimedAt !== undefined && now - flagDb.restoreClaimedAt < 600_000) {
            return { ok: false, reason: "in_flight" };
          }
          flagDb.restoreClaimedAt = now;
          return { ok: true };
        }
        if (name === "bot_writes:botClearBackup" && args.kind === "restore") {
          flagDb.restoreRequested = false;
          flagDb.restoreBackupId = undefined;
          flagDb.restoreClaimedAt = undefined;
          return { ok: true };
        }
        if (name === "bot_writes:botReportRestoreError") {
          flagDb.restoreRequested = false;
          flagDb.restoreClaimedAt = undefined;
          flagDb.restoreError = args.error;
          return { ok: true };
        }
        return { ok: true };
      },
      query: async () => null,
      action: async () => ({ ok: true }),
    },
    // getConfig trả kênh log (giống server đã setup) → sendLog gửi embed qua channel.send.
    getConfig: async () => ({ logChannelId }),
  };
}

function makeClient() {
  const sent = [];
  const role = { id: "nr1", name: "Mod", setPosition: async () => {} };
  // Kênh id "log-ch-1" khớp config.logChannelId → sendLog chọn làm đích.
  const channelById = (id) => ({
    id,
    name: id === "log-ch-1" ? "log" : id,
    type: 0,
    isTextBased: () => true,
    setPosition: async () => {},
    send: async (p) => sent.push(p),
    createWebhook: async () => ({ name: "w", send: async () => {}, delete: async () => {} }),
  });
  const guild = {
    id: "999888777666555444",
    name: "Server Phụ",
    available: true,
    roles: { cache: new Map(), create: async () => role },
    channels: {
      cache: new Map(),
      create: async () => channelById("nc1"),
      fetch: async (id) => channelById(id),
    },
    members: { fetch: async () => ({ user: { username: "u" } }) },
  };
  return { client: { guilds: { cache: new Map([["999888777666555444", guild]]) } }, guild, sent };
}

function makeBatchItem(overrides = {}) {
  const snapshot = {
    version: 4,
    guildId: "111122223333444455",
    guildName: "Server Gốc",
    createdAt: 0,
    roles: [{ id: "r1", name: "Mod", color: 0xff0000, permissions: "8", position: 1 }],
    channels: [{ id: "c1", name: "general", type: 0, overwrites: [], messages: [] }],
    emojis: [],
    stickers: [],
    messageCount: 0,
  };
  return {
    kind: "restore",
    guildId: "999888777666555444",
    backupId: "bk1",
    backupJson: utils.compressAndEncryptBackup(snapshot).backupJson,
    guildName: "Server Gốc",
    ...overrides,
  };
}

(async () => {
  // ---- 1. Restore THÀNH CÔNG qua pipeline tick thật ----
  {
    const flagDb = makeFlagDb();
    const store = makeStore(flagDb);
    const { client, sent } = makeClient();
    await tick.runBackupJobs(client, store, [makeBatchItem()]);
    const cleared = store._mutations.find(
      (m) => m.name === "bot_writes:botClearBackup" && m.args.kind === "restore",
    );
    check("restore thành công → botClearBackup xóa cờ", !!cleared);
    check("restore thành công → embed xác nhận gửi kênh log", sent.length > 0);
    check("cờ restore về false sau khi xong", flagDb.restoreRequested === false);
  }

  // ---- 2. Restore THẤT BẠI → bot PHẢI báo lỗi về dashboard (fix lỗi im lặng) ----
  {
    const flagDb = makeFlagDb();
    const store = makeStore(flagDb, { failRestore: true });
    // Backup JSON hỏng → runRestore ném lỗi "Backup bị hỏng".
    const { client } = makeClient();
    await tick.runBackupJobs(client, store, [makeBatchItem({ backupJson: "khong-doc-duoc{{{" })]);
    const reported = store._mutations.find((m) => m.name === "bot_writes:botReportRestoreError");
    check("restore lỗi → botReportRestoreError được gọi (trước đây im lặng)", !!reported);
    check(
      "lỗi có nội dung rõ ràng",
      typeof reported?.args?.error === "string" && reported.args.error.length > 3,
    );
    check("restore lỗi → cờ bị xóa (không kẹt vĩnh viễn)", flagDb.restoreRequested === false);
    check("lỗi được ghi vào flagDb để dashboard hiển thị", typeof flagDb.restoreError === "string");
    const wronglyCleared = store._mutations.find(
      (m) => m.name === "bot_writes:botClearBackup" && m.args.kind === "restore",
    );
    check("restore lỗi KHÔNG được tính là hoàn tất (không botClearBackup)", !wronglyCleared);
  }

  // ---- 3. Claim in-flight: lượt quét khác KHÔNG cướp trong 10 phút ----
  {
    const flagDb = makeFlagDb({ restoreClaimedAt: Date.now() - 60_000 }); // claim cách đây 1 phút
    const store = makeStore(flagDb);
    const { client } = makeClient();
    await tick.runBackupJobs(client, store, [makeBatchItem()]);
    const report = store._mutations.find((m) => m.name === "bot_writes:botReportRestoreError");
    check(
      "in-flight 1 phút → lượt khác không chạy lại restore",
      !report && flagDb.restoreError === undefined,
    );
    check("in-flight → cờ vẫn giữ (đang chạy)", flagDb.restoreRequested === true);
  }

  // ---- 4. Không có yêu cầu → bỏ qua không lỗi ----
  {
    const flagDb = makeFlagDb({ restoreRequested: false });
    const store = makeStore(flagDb);
    const { client } = makeClient();
    await tick.runBackupJobs(client, store, [makeBatchItem()]);
    check(
      "no_request → không claim, không mutation thừa",
      store._mutations.every((m) => m.name !== "bot_writes:botReportRestoreError"),
    );
  }

  // ---- 5. Import lỗi vẫn báo đúng như cũ (không regress) ----
  {
    const flagDb = makeFlagDb();
    const store = makeStore(flagDb);
    const { client } = makeClient();
    await tick.runBackupJobs(client, store, [
      {
        kind: "import",
        guildId: "999888777666555444",
        fileName: "bad.msc",
        fileContent: "{{{hỏng",
      },
    ]);
    const importErr = store._mutations.find((m) => m.name === "bot_writes:botReportImportError");
    check("import lỗi → vẫn botReportImportError (không regress)", !!importErr);
  }

  // ---- 6. Backup thường lỗi → báo botReportBackupError (không nuốt im lặng) ----
  {
    const flagDb = makeFlagDb({
      restoreRequested: false,
      backupRequested: true,
      backupClaimedAt: undefined,
    });
    const store = makeStore(flagDb);
    const { client } = makeClient();
    await tick.runBackupJobs(client, store, [
      makeBatchItem({ kind: "backup", backupJson: undefined }),
    ]);
    const rep = store._mutations.find((m) => m.name === "bot_writes:botReportBackupError");
    check(
      "backup lỗi → botReportBackupError với lý do (không im lặng)",
      !!rep && typeof rep.args.error === "string" && rep.args.error.length > 0,
    );
    const cleared = store._mutations.find(
      (m) => m.name === "bot_writes:botClearBackup" && m.args.kind === "backup",
    );
    check("backup lỗi → KHÔNG xóa cờ như thể đã xong", !cleared);
  }

  console.log(`\nKết quả restore pipeline: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
