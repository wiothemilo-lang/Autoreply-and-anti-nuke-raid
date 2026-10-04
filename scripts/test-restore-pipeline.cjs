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
  const metaCalls = [];
  const everyoneCalls = [];
  const channelOpts = [];
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
    roles: {
      cache: new Map(),
      create: async () => role,
      everyone: { setPermissions: async (bits) => everyoneCalls.push(bits) },
    },
    channels: {
      cache: new Map(),
      create: async (opts) => {
        channelOpts.push(opts);
        return channelById("nc1");
      },
      fetch: async (id) => channelById(id),
    },
    members: { fetch: async () => ({ user: { username: "u" } }) },
    setVerificationLevel: async (v) => metaCalls.push(["verificationLevel", v]),
    setExplicitContentFilter: async (v) => metaCalls.push(["explicitContentFilter", v]),
    setDefaultMessageNotifications: async (v) => metaCalls.push(["defaultMessageNotifications", v]),
    setAFKTimeout: async (v) => metaCalls.push(["afkTimeout", v]),
    setSystemChannel: async (v) => metaCalls.push(["systemChannel", v]),
    setAFKChannel: async (v) => metaCalls.push(["afkChannel", v]),
    setPreferredLocale: async (v) => metaCalls.push(["locale", v]),
    setBanner: async (v) => metaCalls.push(["banner", v]),
    setSplash: async (v) => metaCalls.push(["splash", v]),
  };
  return {
    client: { guilds: { cache: new Map([["999888777666555444", guild]]) } },
    guild,
    sent,
    metaCalls,
    everyoneCalls,
    channelOpts,
  };
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

  // ---- 7. Cấu hình server/kênh + quyền @everyone được ÁP LẠI khi restore ----
  {
    const flagDb = makeFlagDb();
    const store = makeStore(flagDb);
    const { client, metaCalls, everyoneCalls, channelOpts } = makeClient();
    const snapshot7 = {
      version: 5,
      guildId: "111122223333444455",
      guildName: "Server Gốc",
      createdAt: 0,
      everyonePermissions: ((1n << 10n) & ((1n << 10n) | (1n << 11n))).toString(),
      guildMeta: {
        name: "Server Gốc",
        bannerUrl: "https://cdn/banner.png",
        splashUrl: "https://cdn/splash.png",
        verificationLevel: 2,
        explicitContentFilter: 1,
        defaultMessageNotifications: 1,
        systemChannelId: "c-sys",
        afkChannelId: "c-voice",
        afkTimeout: 300,
        preferredLocale: "vi",
      },
      roles: [{ id: "r1", name: "Mod", permissions: "8", position: 1 }],
      channels: [
        {
          id: "c-sys",
          name: "system",
          type: 0,
          overwrites: [],
          rateLimitPerUser: 45,
          defaultAutoArchiveDuration: 1440,
        },
        {
          id: "c-voice",
          name: "Voice",
          type: 2,
          overwrites: [],
          rtcRegion: "us-west",
          videoQualityMode: 2,
        },
      ],
      emojis: [],
      stickers: [],
      messageCount: 0,
    };
    const packed7 = utils.compressAndEncryptBackup(snapshot7);
    await tick.runBackupJobs(client, store, [
      {
        kind: "restore",
        guildId: "999888777666555444",
        backupId: "bk1",
        backupJson: packed7.backupJson,
        backupChecksum: packed7.checksum,
        guildName: "Server Gốc",
      },
    ]);
    check(
      "restore: @everyone được áp lại quyền đã chụp",
      everyoneCalls.length === 1 && everyoneCalls[0] === BigInt(snapshot7.everyonePermissions),
      JSON.stringify(everyoneCalls.map(String)),
    );
    check(
      "restore: thiết lập server được áp lại (xác minh/lọc nội dung/thông báo/AFK/locale/banner/splash)",
      metaCalls.some((c) => c[0] === "verificationLevel" && c[1] === 2) &&
        metaCalls.some((c) => c[0] === "explicitContentFilter" && c[1] === 1) &&
        metaCalls.some((c) => c[0] === "defaultMessageNotifications" && c[1] === 1) &&
        metaCalls.some((c) => c[0] === "afkTimeout" && c[1] === 300) &&
        metaCalls.some((c) => c[0] === "locale" && c[1] === "vi") &&
        metaCalls.some((c) => c[0] === "banner") &&
        metaCalls.some((c) => c[0] === "splash"),
      JSON.stringify(metaCalls),
    );
    check(
      "restore: kênh hệ thống/AFK được map sang id MỚI (không phải id cũ)",
      metaCalls.some((c) => c[0] === "systemChannel" && c[1] !== "c-sys") &&
        metaCalls.some((c) => c[0] === "afkChannel" && c[1] !== "c-voice"),
      JSON.stringify(metaCalls),
    );
    check(
      "restore: cấu hình kênh được truyền khi tạo (slowmode + region/chất lượng video)",
      channelOpts.some((o) => o.rateLimitPerUser === 45 && o.defaultAutoArchiveDuration === 1440) &&
        channelOpts.some((o) => o.rtcRegion === "us-west" && o.videoQualityMode === 2),
      JSON.stringify(channelOpts),
    );
  }

  // ---- 8. Checksum LỆCH → DỪNG khôi phục, không tạo cấu trúc từ bản hỏng ----
  {
    const flagDb = makeFlagDb();
    const store = makeStore(flagDb);
    const { client, channelOpts } = makeClient();
    const packed = utils.compressAndEncryptBackup({
      version: 5,
      guildId: "111122223333444455",
      guildName: "S",
      createdAt: 0,
      roles: [{ id: "r1", name: "Mod", position: 1 }],
      channels: [{ id: "c1", name: "general", type: 0, overwrites: [] }],
      emojis: [],
      stickers: [],
      messageCount: 0,
    });
    await tick.runBackupJobs(client, store, [
      {
        kind: "restore",
        guildId: "999888777666555444",
        backupId: "bk1",
        backupJson: packed.backupJson,
        backupChecksum: "0".repeat(64), // checksum SAI
        guildName: "S",
      },
    ]);
    const reported = store._mutations.find((m) => m.name === "bot_writes:botReportRestoreError");
    check(
      "checksum lệch → báo lỗi + KHÔNG tạo kênh nào",
      !!reported && /checksum/i.test(reported.args.error) && channelOpts.length === 0,
      JSON.stringify(reported?.args),
    );
    check(
      "checksum lệch → KHÔNG botClearBackup (không coi là xong)",
      !store._mutations.some(
        (m) => m.name === "bot_writes:botClearBackup" && m.args.kind === "restore",
      ),
    );
  }

  // ---- 9. Checksum KHỚP → restore chạy bình thường ----
  {
    const flagDb = makeFlagDb();
    const store = makeStore(flagDb);
    const { client } = makeClient();
    const packed = utils.compressAndEncryptBackup({
      version: 5,
      guildId: "111122223333444455",
      guildName: "S",
      createdAt: 0,
      roles: [{ id: "r1", name: "Mod", position: 1 }],
      channels: [{ id: "c1", name: "general", type: 0, overwrites: [] }],
      emojis: [],
      stickers: [],
      messageCount: 0,
    });
    await tick.runBackupJobs(client, store, [
      {
        kind: "restore",
        guildId: "999888777666555444",
        backupId: "bk1",
        backupJson: packed.backupJson,
        backupChecksum: packed.checksum,
        guildName: "S",
      },
    ]);
    check(
      "checksum khớp → restore thành công (botClearBackup)",
      store._mutations.some(
        (m) => m.name === "bot_writes:botClearBackup" && m.args.kind === "restore",
      ),
    );
  }

  // ══════════ VAI TRÒ THÀNH VIÊN — END-TO-END QUA tick ══════════
  // Unit test ở trên gọi thẳng applyMemberRoles; test này đi trọn đường
  // job → restoreCore → createRoles → applyMemberRoles để chứng minh bản đồ
  // dùng id role CŨ và vai trò được gán vào role MỚI đã tạo lại.
  {
    const GID = "999888777666555444";
    const store = makeStore(makeFlagDb({ restoreRequested: true, restoreBackupId: "bk1" }));
    const assigned = [];
    const roleCache = new Map();
    let seq = 0;
    const e2eGuild = {
      id: GID,
      name: "Server Phụ",
      available: true,
      roles: {
        cache: roleCache,
        everyone: { id: GID, setPermissions: async () => {} },
        create: async (opts) => {
          const r = {
            id: `new-r${++seq}`,
            name: opts.name,
            position: 0,
            managed: false,
            permissions: { bitfield: BigInt(opts.permissions ?? 0) },
            setPosition: async () => {},
            setIcon: async () => {},
          };
          roleCache.set(r.id, r);
          return r;
        },
      },
      channels: { cache: new Map(), create: async () => ({ id: "nc1" }), fetch: async () => null },
      members: {
        me: {
          user: { id: "bot1" },
          permissions: { bitfield: (1n << 28n) | (1n << 10n), has: (f) => f === "ManageRoles" },
          roles: { highest: { position: 9 } },
        },
        cache: new Map(),
        fetch: async () => ({}),
      },
    };
    const mkM = (id) => ({
      user: { id },
      roles: { cache: new Map(), add: async (list) => assigned.push([id, list.map((r) => r.id)]) },
    });
    e2eGuild.members.cache.set("u1", mkM("u1"));
    const snap = {
      version: 6,
      guildId: "111122223333444455",
      guildName: "Server Gốc",
      roles: [{ id: "old-mod", name: "Mod", permissions: (1n << 10n).toString(), position: 1 }],
      channels: [],
      emojis: [],
      stickers: [],
      members: [{ userId: "u1", roles: ["old-mod"] }],
      memberCount: 1,
      messageCount: 0,
    };
    const packed = utils.compressAndEncryptBackup(snap);
    await tick.runBackupJobs({ guilds: { cache: new Map([[GID, e2eGuild]]) } }, store, [
      {
        kind: "restore",
        guildId: GID,
        backupId: "bk1",
        backupJson: packed.backupJson,
        backupChecksum: packed.checksum,
        guildName: "Server Gốc",
      },
    ]);
    check(
      "vai trò e2e: role được tạo lại (id mới) và bản đồ id cũ được tra sang",
      roleCache.size === 1 && [...roleCache.values()][0].name === "Mod",
      JSON.stringify([...roleCache.keys()]),
    );
    check(
      "vai trò e2e: gán vai trò mới tạo cho thành viên đang có",
      assigned.length === 1 && assigned[0][0] === "u1" && assigned[0][1][0] === "new-r1",
      JSON.stringify(assigned),
    );
    check(
      "vai trò e2e: job restore vẫn báo xong (không lỗi)",
      store._mutations.some(
        (m) => m.name === "bot_writes:botClearBackup" && m.args.kind === "restore",
      ),
    );
  }

  // ══════════ VAI TRÒ THÀNH VIÊN (P2) ══════════
  // Đây là phần NHẠY CẢM NHẤT của restore: gán sai là leo thang quyền. Bốn
  // lớp chặn phải được chứng minh bằng test, không chỉ bằng đọc code.
  {
    const rebuild = require("../bot/src/backupRebuild.js");
    const MANAGE_ROLES = 1n << 28n;
    const ADMIN = 1n << 3n;
    const VIEW = 1n << 10n;
    const BAN = 1n << 2n;

    const mkRole = (id, position, o = {}) => ({
      id,
      name: id,
      position,
      managed: o.managed ?? false,
      permissions: { bitfield: o.perms ?? 0n },
    });
    const mkMember = (id, roles) => ({
      user: { id },
      roles: {
        cache: new Map(roles.map((r) => [r, {}])),
        add: async (list) => added.push([id, list.map((r) => r.id)]),
      },
    });
    let added = [];
    const mkGuild = (botBits, botTop) => {
      const newRoles = new Map([
        // @everyone CÓ id = guild.id — đây là cách Discord đánh dấu nó.
        ["g1", mkRole("g1", 0)],
        ["n-mod", mkRole("n-mod", 1, { perms: VIEW })],
        ["n-managed", mkRole("n-managed", 1, { managed: true, perms: VIEW })],
        // Có quyền (Ban Members) mà BOT KHÔNG có → phải bị chặn (lớp chặn 4).
        ["n-danger", mkRole("n-danger", 1, { perms: BAN })],
        // Vị trí cao hơn bot → phải bị chặn (lớp chặn 3).
        ["n-top", mkRole("n-top", botTop + 1, { perms: VIEW })],
      ]);
      return {
        id: "g1",
        roles: { cache: newRoles, everyone: { id: "g1" } },
        members: {
          me: {
            user: { id: "bot1" },
            permissions: {
              bitfield: botBits,
              has: (f) => (f === "ManageRoles" ? (botBits & MANAGE_ROLES) !== 0n : false),
            },
            roles: { highest: { position: botTop } },
          },
          cache: new Map(),
        },
      };
    };
    const roleMap = new Map([
      ["o-everyone", "g1"],
      ["o-mod", "n-mod"],
      ["o-managed", "n-managed"],
      ["o-danger", "n-danger"],
      ["o-top", "n-top"],
    ]);

    added = [];
    const g = mkGuild(MANAGE_ROLES | ADMIN | VIEW, 5);
    // `u-gone` CỐ Ý không có trong cache (đã rời server) — đó là nhánh "missing".
    // `bot1` CÓ trong cache: chỉ nhờ chặn tự-gán mà không nhận vai trò.
    for (const id of ["u-ok", "u-has-mod", "bot1"]) {
      g.members.cache.set(id, mkMember(id, id === "u-has-mod" ? ["n-mod"] : []));
    }
    const backupMap = {
      guildId: "g1",
      members: [
        { userId: "u-ok", roles: ["o-everyone", "o-mod", "o-managed", "o-danger", "o-top"] },
        { userId: "u-has-mod", roles: ["o-mod"] },
        { userId: "u-gone", roles: ["o-mod"] },
        { userId: "bot1", roles: ["o-mod"] },
      ],
    };
    const stats = await rebuild.applyMemberRoles(g, backupMap, roleMap);
    check(
      "vai trò: chỉ gán role AN TOÀN cho thành viên đang có",
      added.length === 1 &&
        added[0][0] === "u-ok" &&
        added[0][1].length === 1 &&
        added[0][1][0] === "n-mod",
      JSON.stringify(added),
    );
    check(
      "vai trò: chặn @everyone + managed + vị trí cao hơn bot + quyền vượt quyền bot",
      !added
        .flat()
        .some((x) => typeof x === "string" && ["g1", "n-managed", "n-danger", "n-top"].includes(x)),
      JSON.stringify(added),
    );
    check(
      "vai trò: không gán lại role đã có, không tự gán cho bot, đếm thành viên đã rời",
      stats.members === 1 && stats.assigned === 1 && stats.missing === 1,
      JSON.stringify(stats),
    );

    // Không có Manage Roles → không gán gì và nói rõ.
    const gNoPerm = mkGuild(0n, 5);
    gNoPerm.members.cache.set("u-ok", mkMember("u-ok", []));
    const before = added.length;
    const noPerm = await rebuild.applyMemberRoles(gNoPerm, backupMap, roleMap);
    check(
      "vai trò: thiếu quyền Manage Roles → gán 0 và báo noPermission",
      noPerm.noPermission === true && noPerm.assigned === 0 && added.length === before,
      JSON.stringify(noPerm),
    );

    // Không có bản đồ → no-op im lặng (bản backup cũ).
    const empty = await rebuild.applyMemberRoles(g, { guildId: "g1" }, roleMap);
    check("vai trò: bản backup cũ không có bản đồ → không làm gì", empty.assigned === 0);
  }

  console.log(`\nKết quả restore pipeline: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
