// TEST: các luồng lỗi trước đây bị NUỐT IM LẶNG (chỉ console.error trên VPS,
// dashboard/web không bao giờ biết) — giờ bot PHẢI gọi mutation botReport*
// tương ứng. Chạy: node scripts/test-silent-error-reporting.cjs
//
// Che phủ:
//   1. Backup lỗi (tick)          → botReportBackupError  (trước: botClearBackup im lặng)
//   2. Restore lỗi (tick)         → botReportRestoreError  (đã vá trước, chống regress)
//   3. Import lỗi (tick)          → botReportImportError   (đã vá trước, chống regress)
//   4. Panel reaction role lỗi    → botReportPanelError    (trước: chỉ console)
//   5. Giveaway lỗi gửi           → botReportGiveawayError(phase=post)
//   6. Giveaway lỗi kết thúc      → botReportGiveawayError(phase=end) + VẪN chốt winners
//   7. DM trực tiếp lỗi           → botReportDmError; thành công → botClearDm
//   8. Verify panel lỗi           → clearVerifySendPanel({error}) ; thành công → clear không error
//   9. runBackup lưu Convex lỗi    → botReportBackupError (trước: chỉ console.error rồi
//      vẫn xóa cờ + ghi log "đã tạo backup" → dashboard im lặng — bug thật 23/09)
//  10. runBackup checksum trùng    → botClearBackup kèm unchanged=true (web báo "không đổi")
//  11. runBackup thành công        → botClearBackup kèm unchanged=false (web báo "đã tạo xong")
const DJS_MOCK = require("./support/djs-mock-path.cjs");
const Module = require("module");
const fs = require("fs");

// Mock discord.js (giống test-restore-pipeline).
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
  setThumbnail(t) { this.d.thumbnail = t; return this; }
  setImage(t) { this.d.image = t; return this; }
  setTimestamp() { return this; }
  setFooter(f) { this.d.footer = f; return this; }
}
class ActionRowBuilder { addComponents() { return this; } }
class ButtonBuilder { setCustomId() { return this; } setLabel() { return this; } setStyle() { return this; } }
class Collection extends Map {}
module.exports = {
  Colors: new Proxy({}, { get: () => 0x000000 }),
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle: { Primary: 1, Success: 3 },
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
const hidden = require("../bot/src/handlers/hidden.js");

let pass = 0;
let fail = 0;
const check = (label, ok) => {
  console.log(ok ? `PASS ${label}` : `FAIL ${label}`);
  ok ? pass++ : fail++;
};
// `match` là tên mutation hoặc hàm lọc (dùng khi cần lọc thêm args, vd kind="backup").
const last = (arr, match) =>
  [...arr].reverse().find((m) => (typeof match === "function" ? match(m) : m.name === match));

/** Mock store ghi lại mọi mutation gọi ra. */
function makeStore(opts = {}) {
  const mutations = [];
  const queries = [];
  return {
    _mutations: mutations,
    _queries: queries,
    client: {
      mutation: async (name, args = {}) => {
        mutations.push({ name, args });
        if (opts.onMutation) return opts.onMutation(name, args);
        if (name === "bot_writes:botClaimBackup") return { ok: true };
        return { ok: true };
      },
      query: async (name, args = {}) => {
        queries.push({ name, args });
        if (opts.onQuery) return opts.onQuery(name, args);
        return null;
      },
      action: async () => ({ ok: true }),
    },
    getConfig: async () => ({ logChannelId: opts.logChannelId ?? "log-ch-1" }),
  };
}

// `full: true` thêm emojis/stickers để snapshotGuild chạy hết (mặc định CỐ TÌNH thiếu
// để case 1 mô phỏng snapshot lỗi — đừng thêm vào nhánh mặc định).
function makeGuild({ failChannelSend = false, noChannel = false, full = false } = {}) {
  const sent = [];
  const channelById = (id) => ({
    id,
    name: id === "log-ch-1" ? "log" : id,
    type: 0,
    isTextBased: () => !noChannel,
    send: async () => {
      if (failChannelSend) throw new Error("Missing Permissions");
      sent.push(1);
      return { id: "msg-1", react: async () => {}, edit: async () => {} };
    },
    messages: { fetch: async () => ({ edit: async () => {} }) },
    guild: null,
  });
  const guild = {
    id: "999888777666555444",
    name: "Server Test",
    available: true,
    members: { fetch: async () => ({ user: { username: "u" } }) },
    channels: {
      cache: new Map(),
      create: async () => channelById("nc1"),
      fetch: async (id) => channelById(id),
    },
    roles: { cache: new Map(), create: async () => ({ id: "nr1", setPosition: async () => {} }) },
  };
  guild.channels.fetch = async () => (noChannel ? null : channelById("ch-1"));
  if (full) {
    guild.emojis = { cache: new Map() };
    guild.stickers = { cache: new Map() };
  }
  return {
    client: {
      guilds: { cache: new Map([[guild.id, guild]]) },
      // Verify panel dùng client.channels.fetch — mock cùng hành vi guild.channels.fetch.
      channels: { fetch: async () => (noChannel ? null : channelById("ch-1")) },
      users: {
        fetch: async () => ({
          id: "u1",
          tag: "u#1",
          send: async () => {
            throw new Error("Cannot send messages to this user");
          },
        }),
      },
    },
    guild,
    sent,
  };
}

// 1️⃣ BACKUP lỗi → botReportBackupError (không phải botClearBackup im lặng)
(async () => {
  {
    const store = makeStore();
    const { client } = makeGuild({ noChannel: true });
    // snapshotWithSettings sẽ ném vì guild.channels.fetch trả null (kênh cache trống + bot không fetch được).
    await tick.runBackupJobs(client, store, [
      {
        kind: "backup",
        guildId: "999888777666555444",
        pushToGithub: false,
        includeMessages: false,
      },
    ]);
    const rep = last(store._mutations, "bot_writes:botReportBackupError");
    const cleared = store._mutations.find(
      (m) => m.name === "bot_writes:botClearBackup" && m.args.kind === "backup",
    );
    check(
      "backup lỗi → botReportBackupError được gọi với lý do",
      !!rep && typeof rep.args.error === "string" && rep.args.error.length > 0,
    );
    check("backup lỗi → KHÔNG xóa cờ im lặng bằng botClearBackup", !cleared);
  }

  // 2️⃣ RESTORE lỗi → botReportRestoreError (chống regress)
  {
    const store = makeStore();
    const { client } = makeGuild();
    await tick.runBackupJobs(client, store, [
      {
        kind: "restore",
        guildId: "999888777666555444",
        backupId: "bk1",
        backupJson: "z:not-valid-json-at-all",
        guildName: "X",
      },
    ]);
    const rep = last(store._mutations, "bot_writes:botReportRestoreError");
    check(
      "restore lỗi → botReportRestoreError với lý do",
      !!rep && typeof rep.args.error === "string",
    );
  }

  // 3️⃣ IMPORT lỗi → botReportImportError (chống regress)
  {
    const store = makeStore();
    const { client } = makeGuild();
    await tick.runBackupJobs(client, store, [
      {
        kind: "import",
        guildId: "999888777666555444",
        fileName: "bad.msc",
        fileContent: "không phải json",
      },
    ]);
    const rep = last(store._mutations, "bot_writes:botReportImportError");
    check(
      "import lỗi → botReportImportError với lý do",
      !!rep && typeof rep.args.error === "string",
    );
  }

  // 4️⃣ PANEL lỗi gửi → botReportPanelError
  {
    const store = makeStore();
    const { client } = makeGuild({ noChannel: true });
    await hidden.processHiddenJobsData(client, store, [
      {
        guildId: "999888777666555444",
        panels: [
          {
            _id: "p1",
            channelId: "ch-1",
            label: "Roles",
            description: null,
            thumbnailUrl: null,
            entries: [],
            messageId: "",
          },
        ],
        giveaways: [],
        dmRequested: false,
        defaultWebhook: null,
      },
    ]);
    const rep = last(store._mutations, "hidden:botReportPanelError");
    check(
      "panel lỗi kênh → botReportPanelError với lý do",
      !!rep && typeof rep.args.error === "string" && rep.args.error.length > 0,
    );
    check(
      "panel lỗi → KHÔNG gọi panelPosted (không đánh dấu đã gửi)",
      !store._mutations.some((m) => m.name === "hidden:panelPosted"),
    );
  }

  // 5️⃣ GIVEAWAY lỗi gửi → botReportGiveawayError(phase=post)
  {
    const store = makeStore();
    const { client } = makeGuild({ noChannel: true });
    await hidden.processHiddenJobsData(client, store, [
      {
        guildId: "999888777666555444",
        panels: [],
        giveaways: [
          {
            _id: "g1",
            channelId: "ch-1",
            title: "Test",
            prize: "1$",
            winnerCount: 1,
            endsAt: Date.now() + 3600_000,
            status: "active",
            messageId: "",
            entries: [],
            dmWinners: false,
          },
        ],
        dmRequested: false,
        defaultWebhook: null,
      },
    ]);
    const rep = last(store._mutations, "hidden:botReportGiveawayError");
    check(
      "giveaway lỗi kênh → botReportGiveawayError phase=post",
      !!rep && rep.args.phase === "post" && typeof rep.args.error === "string",
    );
    check(
      "giveaway lỗi → KHÔNG gọi giveawayPosted",
      !store._mutations.some((m) => m.name === "hidden:giveawayPosted"),
    );
  }

  // 6️⃣ GIVEAWAY lỗi KẾT THÚC → báo lỗi phase=end nhưng VẪN chốt winners
  {
    const store = makeStore();
    const { client } = makeGuild({ failChannelSend: true });
    const gw = {
      _id: "g2",
      channelId: "ch-1",
      title: "Test End",
      prize: "1$",
      winnerCount: 1,
      endsAt: Date.now() - 1000,
      status: "active",
      messageId: "m1",
      entries: [{ userId: "u1", username: "u1" }],
      dmWinners: false,
      prizeRoleId: null,
    };
    // Gọi trực tiếp endGiveaway qua job (messageId có sẵn + đã hết hạn).
    await hidden.processHiddenJobsData(client, store, [
      {
        guildId: "999888777666555444",
        panels: [],
        giveaways: [gw],
        dmRequested: false,
        defaultWebhook: null,
      },
    ]);
    const rep = last(store._mutations, "hidden:botReportGiveawayError");
    check(
      "giveaway lỗi kết thúc → botReportGiveawayError phase=end",
      !!rep && rep.args.phase === "end",
    );
    const ended = last(store._mutations, "hidden:giveawayEnd");
    check(
      "giveaway lỗi hiển thị → VẪN chốt winners (không bỏ trao thưởng)",
      !!ended && Array.isArray(ended.args.winners) && ended.args.winners.length === 1,
    );
  }

  // 7️⃣ DM lỗi → botReportDmError; thành công → botClearDm
  {
    const store = makeStore({
      onQuery: (name) => {
        if (name === "hidden:getBotHidden") {
          return {
            guildId: "999888777666555444",
            dmRequested: true,
            dmTargetUserId: "u1",
            dmTargetUsername: "u",
            dmMessage: "hi",
          };
        }
        return null;
      },
    });
    const { client } = makeGuild(); // users.fetch().send ném "Cannot send messages to this user"
    await hidden.processHiddenJobsData(client, store, [
      {
        guildId: "999888777666555444",
        panels: [],
        giveaways: [],
        dmRequested: true,
        defaultWebhook: null,
      },
    ]);
    const rep = last(store._mutations, "hidden:botReportDmError");
    check(
      "DM lỗi → botReportDmError với lý do",
      !!rep && typeof rep.args.error === "string" && rep.args.error.length > 0,
    );
    check(
      "DM lỗi → KHÔNG xóa DM như thể đã gửi",
      !store._mutations.some((m) => m.name === "hidden:botClearDm"),
    );
  }

  // 8️⃣ VERIFY PANEL lỗi → clearVerifySendPanel({error}); thành công → clear sạch
  {
    const store = makeStore();
    const { client } = makeGuild({ noChannel: true });
    await hidden.processVerifyPanelItems(client, store, [
      {
        guildId: "999888777666555444",
        verifyChannelId: "ch-1",
        unverifiedRoleId: "r1",
        verifiedRoleId: "r2",
        verifyMethod: "button",
      },
    ]);
    const rep = last(store._mutations, "guilds:clearVerifySendPanel");
    check(
      "verify panel lỗi kênh → clearVerifySendPanel kèm error",
      !!rep && typeof rep.args.error === "string" && rep.args.error.length > 0,
    );

    // Thiếu role → cũng phải báo lỗi rõ ràng (trước đây chỉ console.warn + im lặng).
    const store2 = makeStore();
    const { client: c2 } = makeGuild();
    await hidden.processVerifyPanelItems(c2, store2, [
      {
        guildId: "999888777666555444",
        verifyChannelId: "ch-1",
        unverifiedRoleId: null,
        verifiedRoleId: null,
        verifyMethod: "button",
      },
    ]);
    const rep2 = last(store2._mutations, "guilds:clearVerifySendPanel");
    check(
      "verify thiếu role → clearVerifySendPanel kèm error hướng dẫn",
      !!rep2 && typeof rep2.args.error === "string" && /role/i.test(rep2.args.error),
    );
  }

  // 9️⃣ runBackup — lưu lên Convex THẤT BẠI không được nuốt lỗi.
  // Trước đây chỉ console.error rồi vẫn xóa cờ + ghi log "Đã tạo backup server" →
  // người dùng bấm "Backup ngay" thấy không có bản nào mà cũng không có báo lỗi.
  {
    const store = makeStore({
      onMutation: (name) => {
        if (name === "bot_writes:botClaimBackup") return { ok: true };
        if (name === "bot_writes:botStoreBackup") {
          throw new Error("Document is too large: 1187291 bytes (maximum 1048576)");
        }
        return { ok: true };
      },
    });
    const { client } = makeGuild({ full: true });
    await tick.runBackupJobs(client, store, [
      { kind: "backup", guildId: "999888777666555444", pushToGithub: false, includeMessages: true },
    ]);
    const rep = last(store._mutations, "bot_writes:botReportBackupError");
    check("lưu backup lỗi → botReportBackupError (không nuốt lỗi)", !!rep);
    check(
      "lỗi quá giới hạn document → chỉ đúng việc cần làm (tắt Kèm tin nhắn)",
      !!rep && /Kèm tin nhắn/.test(rep.args.error) && /1 MB/.test(rep.args.error),
    );
    check(
      "lưu backup lỗi → KHÔNG botClearBackup (không đánh dấu thành công)",
      !store._mutations.some((m) => m.name === "bot_writes:botClearBackup"),
    );
  }

  // 9b. Lỗi lưu KHÁC (mạng/Convex tạm lỗi) → vẫn báo lý do gốc, không nuốt.
  {
    const store = makeStore({
      onMutation: (name) => {
        if (name === "bot_writes:botClaimBackup") return { ok: true };
        if (name === "bot_writes:botStoreBackup") throw new Error("ECONNRESET");
        return { ok: true };
      },
    });
    const { client } = makeGuild({ full: true });
    await tick.runBackupJobs(client, store, [
      {
        kind: "backup",
        guildId: "999888777666555444",
        pushToGithub: false,
        includeMessages: false,
      },
    ]);
    const rep = last(store._mutations, "bot_writes:botReportBackupError");
    check(
      "lỗi lưu khác → botReportBackupError kèm lý do gốc",
      !!rep && /ECONNRESET/.test(rep.args.error),
    );
  }

  // 🔟+1️⃣1️⃣ runBackup xong → botClearBackup phải nói RÕ kết quả cho dashboard:
  // unchanged=true (bỏ qua vì server không đổi) hay unchanged=false (đã tạo bản mới).
  const utils = require("../bot/src/backupUtils.js");
  // Phải khớp CHÍNH XÁC phần "ổn định" mà snapshotGuild sinh ra (guild giả của
  // makeGuild không có banner/roles.everyone → các field đó null).
  const sameChecksum = utils.computeSnapshotChecksum({
    roles: [],
    channels: [],
    emojis: [],
    stickers: [],
    settings: {
      prefix: "!",
      badWords: [],
      modRoles: [],
      adminRoles: [],
      whitelistRoles: [],
      whitelistUsers: [],
      logChannelId: "log-ch-1",
      modLogChannelId: null,
    },
    guildMeta: {
      name: "Server Test",
      description: null,
      iconUrl: null,
      bannerUrl: null,
      splashUrl: null,
      verificationLevel: null,
      explicitContentFilter: null,
      defaultMessageNotifications: null,
      systemChannelId: null,
      afkChannelId: null,
      afkTimeout: null,
      preferredLocale: null,
    },
    everyonePermissions: null,
    // P2: bản đồ thành viên ↔ vai trò cũng nằm trong phần "ổn định". Guild giả
    // ở đây không có members.fetch/cache → captureMemberRoles trả mảng rỗng.
    members: [],
  });
  {
    const store = makeStore({
      onQuery: (name) =>
        name === "backup:botGetLastChecksum"
          ? { backupSnapshotChecksum: sameChecksum, backupMessageCount: 0 }
          : null,
    });
    const { client } = makeGuild({ full: true });
    await tick.runBackupJobs(client, store, [
      {
        kind: "backup",
        guildId: "999888777666555444",
        pushToGithub: false,
        includeMessages: false,
      },
    ]);
    const cleared = last(
      store._mutations,
      (m) => m.name === "bot_writes:botClearBackup" && m.args.kind === "backup",
    );
    check(
      'checksum trùng → botClearBackup kèm unchanged=true (web báo "không có thay đổi")',
      !!cleared && cleared.args.unchanged === true,
    );
    check(
      "checksum trùng → KHÔNG lưu bản trùng lặp lên Convex",
      !store._mutations.some((m) => m.name === "bot_writes:botStoreBackup"),
    );
  }
  {
    const store = makeStore({
      onMutation: (name) => {
        if (name === "bot_writes:botClaimBackup") return { ok: true };
        if (name === "bot_writes:botStoreBackup") return { ok: true, backupId: "bk-9" };
        return { ok: true };
      },
    });
    const { client } = makeGuild({ full: true });
    await tick.runBackupJobs(client, store, [
      {
        kind: "backup",
        guildId: "999888777666555444",
        pushToGithub: false,
        includeMessages: false,
      },
    ]);
    const stored = last(store._mutations, "bot_writes:botStoreBackup");
    const cleared = last(
      store._mutations,
      (m) => m.name === "bot_writes:botClearBackup" && m.args.kind === "backup",
    );
    check("backup thành công → lưu lên Convex rồi mới xóa cờ", !!stored && !!cleared);
    check(
      'backup thành công → botClearBackup kèm unchanged=false (web báo "đã tạo xong")',
      !!cleared && cleared.args.unchanged === false && cleared.args.storeOk === true,
    );
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
})();
