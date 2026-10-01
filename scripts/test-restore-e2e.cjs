// TEST E2E: khôi phục backup vào SERVER PHỤ — mô phỏng trọn vẹn luồng restore thật.
// Chạy: node scripts/test-restore-e2e.cjs — mock Discord + Convex, không mạng, không DB thật.
//
// Che phủ đúng các giai đoạn bot chạy khi chủ server bấm "Khôi phục vào server này":
//   1. Backup chủ động lưu bản NÉN 'z:' vào Convex giả (giống bản thật sau commit 1de0ae4).
//   2. runRestore(): giải nén → createRoles (thứ tự + màu + quyền) → createChannels
//      (danh mục trước, kênh con + overwrite map role mới) → replayMessages (webhook,
//      media Buffer) → restoreEmojis/restoreStickers → botRestoreSettings với ID MỚI.
//   3. botClearBackup xóa cờ sau khi xong.
// Kiểm tra thêm các nhánh: tùy chỉnh khôi phục (tắt role/tin nhắn), guild mất, JSON hỏng.

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
const ChannelType = { GuildText: 0, GuildAnnouncement: 5, GuildVoice: 2, GuildCategory: 4, GuildStageVoice: 13, GuildForum: 15 };
class PermissionsBitField {
  constructor(bits = 0n) { this.bitfield = BigInt(bits); }
  has(b) { return (this.bitfield & BigInt(b)) === BigInt(b); }
  static Flags = { Administrator: 1n << 3n, ManageGuild: 1n << 5n, ViewChannel: 1n << 10n, SendMessages: 1n << 11n, ManageChannels: 1n << 4n };
}
module.exports = {
  Colors: new Proxy({}, { get: () => 0x000000 }),
  EmbedBuilder,
  Collection,
  ChannelType,
  PermissionsBitField,
  PermissionFlagsBits: PermissionsBitField.Flags,
  AuditLogEvent: new Proxy({}, { get: () => 0 }),
  Partials: {},
  GatewayIntentBits: new Proxy({}, { get: () => 0 }),
};
`,
);

delete process.env.BACKUP_ENCRYPT_KEY; // test chạy ngoài VPS — không mã hóa

const backup = require("../bot/src/handlers/backup.js");

let pass = 0;
let fail = 0;
const check = (label, ok) => {
  console.log(ok ? `PASS ${label}` : `FAIL ${label}`);
  ok ? pass++ : fail++;
};

/* ────────────────────────── Mock Discord guild (server phụ) ────────────────────────── */

// 1px PNG thật (fetch/data URI decode được) — dùng cho emoji + media tin nhắn.
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function makeTargetGuild() {
  const rolesCreated = [];
  const channelsCreated = [];
  const messagesSent = [];
  const webhooksCreated = [];
  const emojisCreated = [];
  const stickersCreated = [];

  const mkRole = (name) => ({
    id: `new-role-${rolesCreated.length + 1}`,
    name,
    setPosition: async () => {},
    setIcon: async () => {},
  });

  const mkChannel = (opts) => {
    // Discord TỪ CHỐI tin không có gì để gửi (content/embeds/components/files
    // đều rỗng) — "Cannot send an empty message". Mock phải giống thật, nếu không
    // lỗi "gửi payload rỗng" của bot sẽ không bao giờ lộ ra trong test.
    const discordSend = async (p) => {
      const hasBody =
        (typeof p?.content === "string" && p.content.trim() !== "") ||
        (Array.isArray(p?.files) && p.files.length > 0) ||
        (Array.isArray(p?.embeds) && p.embeds.length > 0);
      if (!hasBody) throw new Error("Cannot send an empty message");
      messagesSent.push(p);
    };
    const ch = {
      id: `new-ch-${channelsCreated.length + 1}`,
      name: opts.name,
      type: opts.type,
      opts, // giữ opts gốc để test assert overwrite/bitrate/userLimit
      setPosition: async () => {},
      isTextBased: () => opts.type === 0 || opts.type === 5,
      // Bot thiếu quyền Manage Webhooks là tình huống rất phổ biến →
      // replayMessages phải lùi về channel.send.
      createWebhook: async (o) => {
        if (guild._noWebhook) throw new Error("Missing Permissions");
        const wh = { name: o.name, send: discordSend, delete: async () => {} };
        webhooksCreated.push(wh);
        return wh;
      },
      send: discordSend,
    };
    channelsCreated.push(ch);
    return ch;
  };

  const guild = {
    id: "999888777666555444",
    name: "Server Phụ",
    available: true,
    iconURL: () => null,
    roles: {
      cache: new Map(),
      create: async (opts) => {
        const r = mkRole(opts.name);
        rolesCreated.push({ role: r, opts });
        guild.roles.cache.set(r.id, r);
        return r;
      },
    },
    channels: {
      cache: new Map(),
      create: async (opts) => {
        const c = mkChannel(opts);
        guild.channels.cache.set(c.id, c);
        return c;
      },
      fetch: async (id) => guild.channels.cache.get(id) ?? null,
    },
    emojis: {
      create: async (o) => {
        emojisCreated.push(o);
        return { name: o.name };
      },
    },
    stickers: {
      create: async (o) => {
        stickersCreated.push(o);
        return { name: o.name };
      },
    },
    members: { me: { permissions: { bitfield: (1n << 40n) - 1n } } },
    // Dữ liệu phục vụ assertion
    _created: {
      rolesCreated,
      channelsCreated,
      messagesSent,
      webhooksCreated,
      emojisCreated,
      stickersCreated,
    },
  };
  return guild;
}

/* ────────────────────────── Mock Convex store ────────────────────────── */

function makeStore(_targetGuild) {
  const mutations = [];
  const store = {
    client: {
      mutation: async (name, args) => {
        mutations.push({ name, args });
        return { ok: true };
      },
      query: async () => null,
      action: async () => ({ ok: true }),
    },
    getConfig: async () => ({
      restoreRolesEnabled: store._restoreRoles,
      restoreChannelsEnabled: store._restoreChannels,
      restoreMessagesEnabled: store._restoreMessages,
      restoreEmojisEnabled: store._restoreEmojis,
    }),
    _restoreRoles: true,
    _restoreChannels: true,
    _restoreMessages: true,
    _restoreEmojis: true,
    _mutations: mutations,
  };
  return store;
}

/* ────────────────────────── Snapshot nguồn (server gốc bị nuke) ────────────────────────── */

function sourceSnapshot() {
  return {
    version: 4,
    guildId: "111122223333444455",
    guildName: "Server Gốc Bị Nuke",
    createdAt: Date.now(),
    roles: [
      {
        id: "old-role-1",
        name: "Member",
        color: 0x00ff00,
        hoist: false,
        mentionable: true,
        permissions: "1024",
        position: 1,
      },
      {
        id: "old-role-2",
        name: "Admin",
        color: 0xff0000,
        hoist: true,
        mentionable: false,
        permissions: "8",
        position: 2,
      },
    ],
    channels: [
      {
        id: "old-cat-1",
        name: "DANH MỤC CHÍNH",
        type: 4,
        position: 0,
        parentId: null,
        overwrites: [],
      },
      {
        id: "old-ch-1",
        name: "general",
        type: 0,
        topic: "kênh chat",
        nsfw: false,
        position: 1,
        parentId: "old-cat-1",
        overwrites: [
          { id: "old-role-2", type: 0, allow: "1024", deny: "0" }, // role Admin → phải map sang role mới
        ],
        messages: [
          {
            id: "m1",
            authorName: "alice",
            timestamp: 1000,
            content: "xin chào server phụ!",
            attachments: [],
          },
          {
            id: "m2",
            authorName: "bob",
            timestamp: 2000,
            content: "kèm ảnh",
            attachments: [`data:image/png;base64,${PNG_B64}`],
          },
          {
            id: "m3",
            authorName: "carol",
            timestamp: 3000,
            content: "tin sau cùng",
            attachments: [],
          },
        ],
      },
      {
        id: "old-ch-2",
        name: "voice-room",
        type: 2,
        position: 2,
        parentId: "old-cat-1",
        bitrate: 64000,
        userLimit: 10,
        overwrites: [],
      },
    ],
    emojis: [
      {
        id: "old-emoji-1",
        name: "Sakura Bloom",
        animated: false,
        url: `data:image/png;base64,${PNG_B64}`,
      },
    ],
    stickers: [
      {
        id: "old-st-1",
        name: "cool",
        tags: "😀",
        formatType: 1,
        url: `data:image/png;base64,${PNG_B64}`,
      },
    ],
    emojiCount: 1,
    stickerCount: 1,
    messageCount: 3,
    settings: {
      prefix: "?",
      badWords: ["spam"],
      modRoles: ["old-role-2"],
      adminRoles: ["old-role-2"],
      whitelistRoles: ["old-role-1"],
      logChannelId: "old-ch-1",
    },
  };
}

(async () => {
  /* ── 1. Happy path: backup nén 'z:' → restore đầy đủ vào server phụ ── */
  const utils = require("../bot/src/backupUtils.js");
  const snap = sourceSnapshot();
  const stored = utils.compressAndEncryptBackup(snap);
  check("backup nguồn lưu dưới dạng nén 'z:'", stored.backupJson.startsWith("z:"));

  const guild = makeTargetGuild();
  const store = makeStore(guild);

  await backup.runRestore(
    { guilds: { cache: new Map([["999888777666555444", guild]]) } },
    store,
    "999888777666555444",
    stored.backupJson, // bản NÉN — đúng luồng thật đọc từ guildBackups
    "Server Gốc Bị Nuke",
  );

  const m = store._mutations;
  const created = guild._created;

  check(
    "botRestoreSettings được gọi",
    m.some((x) => x.name === "bot_writes:botRestoreSettings"),
  );
  check(
    "botClearBackup xóa cờ restore sau khi xong",
    m.some((x) => x.name === "bot_writes:botClearBackup" && x.args.kind === "restore"),
  );

  // Role: tạo đủ 2 role, tên + màu + quyền giữ nguyên
  check("tạo lại đủ 2 role", created.rolesCreated.length === 2);
  check(
    "role giữ tên + màu + quyền",
    created.rolesCreated.some(
      (r) =>
        r.opts.name === "Admin" && r.opts.color === 0xff0000 && BigInt(r.opts.permissions) === 8n,
    ),
  );
  check(
    "role sắp xếp theo thứ tự (setPosition từng role)",
    created.rolesCreated.every((r) => typeof r.role.setPosition === "function"),
  );

  // Kênh: danh mục + 2 kênh con; overwrite map sang ID ROLE MỚI
  check("tạo đủ 3 kênh (danh mục + text + voice)", created.channelsCreated.length === 3);
  const cat = created.channelsCreated.find((c) => c.name === "DANH MỤC CHÍNH");
  const gen = created.channelsCreated.find((c) => c.name === "general");
  check("tạo danh mục trước kênh con", !!cat && created.channelsCreated.indexOf(cat) === 0);
  const adminNewId = created.rolesCreated.find((r) => r.opts.name === "Admin")?.role.id;
  const overwrites = gen?.opts?.permissionOverwrites ?? [];
  check(
    "overwrite kênh map sang ID role MỚI (không dùng ID cũ vô nghĩa)",
    overwrites.some((o) => o.id === adminNewId && o.type === 0),
  );
  check(
    "kênh voice giữ bitrate + userLimit",
    created.channelsCreated.some(
      (c) => c.name === "voice-room" && c.opts?.bitrate === 64000 && c.opts?.userLimit === 10,
    ),
  );

  // Tin nhắn: phát lại theo thứ tự thời gian qua webhook, giữ tên người gửi
  check(
    "tạo webhook để phát lại tin nhắn (giữ tên người gửi)",
    created.webhooksCreated.length >= 1,
  );
  const texts = created.messagesSent.map((p) => p.content ?? "");
  check("phát lại đủ 3 tin nhắn", created.messagesSent.length === 3);
  check(
    "tin nhắn đúng thứ tự thời gian",
    texts[0].includes("xin chào") && texts[1].includes("kèm ảnh") && texts[2].includes("sau cùng"),
  );
  const withMedia = created.messagesSent.find((p) => Array.isArray(p.files));
  check(
    "media data URI đăng lại THẬT (Buffer, không còn là link)",
    !!withMedia && Buffer.isBuffer(withMedia.files[0]?.attachment ?? withMedia.files[0]),
  );

  // Emoji + sticker: tạo lại từ data URI
  check(
    "tạo lại emoji từ data URI",
    created.emojisCreated.length === 1 &&
      created.emojisCreated[0].name === "sakura_bloom" &&
      Buffer.isBuffer(created.emojisCreated[0].attachment),
  );

  // Settings: prefix + badWords nguyên vẹn; role/kênh map sang ID MỚI
  const settingsCall = m.find((x) => x.name === "bot_writes:botRestoreSettings");
  check("settings: prefix '?' được áp lại", settingsCall?.args?.prefix === "?");
  check(
    "settings: modRoles map sang ID role mới",
    Array.isArray(settingsCall?.args?.modRoles) && settingsCall.args.modRoles[0] === adminNewId,
  );
  check(
    "settings: logChannelId map sang ID kênh mới",
    settingsCall?.args?.logChannelId === gen?.id,
  );

  /* ── 2. Tùy chỉnh khôi phục: tắt role + tin nhắn → bỏ qua đúng phần ── */
  const guild2 = makeTargetGuild();
  const store2 = makeStore(guild2);
  store2._restoreRoles = false;
  store2._restoreMessages = false;

  await backup.runRestore(
    { guilds: { cache: new Map([["999888777666555444", guild2]]) } },
    store2,
    "999888777666555444",
    stored.backupJson,
    "Server Gốc Bị Nuke",
  );
  const c2 = guild2._created;
  check("tắt role → không tạo role nào", c2.rolesCreated.length === 0);
  check("tắt tin nhắn → không phát lại tin", c2.messagesSent.length === 0);
  check("vẫn tạo kênh khi chỉ tắt role/tin", c2.channelsCreated.length === 3);
  const s2 = store2._mutations.find((x) => x.name === "bot_writes:botRestoreSettings");
  // Trước đây test này khóa luôn BUG: role bị tắt → roleMap rỗng → map ra [] →
  // ghi đè admin/mod/whitelist của server thành rỗng. Mất cấu hình "role nào là
  // admin/mod" ⇒ tê liệt heat + mất mọi miễn trừ anti-nuke, trong khi chủ server
  // chỉ xin ĐỪNG đụng role. Nay phải BỎ QUA field (undefined) để Convex giữ nguyên.
  check(
    "tắt role → KHÔNG ghi đè modRoles (giữ cấu hình server)",
    s2?.args?.modRoles === undefined,
    JSON.stringify(s2?.args?.modRoles),
  );
  check(
    "tắt role → KHÔNG ghi đè adminRoles/whitelistRoles",
    s2?.args?.adminRoles === undefined && s2?.args?.whitelistRoles === undefined,
    JSON.stringify([s2?.args?.adminRoles, s2?.args?.whitelistRoles]),
  );
  // Tắt kênh → logChannelId/modLogChannelId cũng phải giữ, không bị set null.
  const guildNoCh = makeTargetGuild();
  const storeNoCh = makeStore(guildNoCh);
  storeNoCh._restoreChannels = false;
  await backup.runRestore(
    { guilds: { cache: new Map([["999888777666555444", guildNoCh]]) } },
    storeNoCh,
    "999888777666555444",
    stored.backupJson,
    "Server Gốc Bị Nuke",
  );
  const sNoCh = storeNoCh._mutations.find((x) => x.name === "bot_writes:botRestoreSettings");
  check(
    "tắt kênh → KHÔNG xoá logChannelId/modLogChannelId của server",
    sNoCh?.args?.logChannelId === undefined && sNoCh?.args?.modLogChannelId === undefined,
    JSON.stringify([sNoCh?.args?.logChannelId, sNoCh?.args?.modLogChannelId]),
  );
  /* ── 2b. Role TẠO LỖI (thiếu quyền/trần 250 role) → KHÔNG mất cấu hình ── */
  // Bug thật 29/09/2026: .filter(Boolean) âm thầm loại role không tạo được khỏi
  // danh sách ⇒ Convex nhận mảng THIẾU phần tử ⇒ mất role admin/mod của server
  // trong khi báo cáo vẫn ghi "Role đã tạo: N".
  {
    const guildFail = makeTargetGuild();
    const storeFail = makeStore(guildFail);
    // Role "Admin" (old-role-2) không tạo được — mô phỏng thiếu Manage Roles.
    const realCreate = guildFail.roles.create;
    guildFail.roles.create = async (opts) => {
      if (opts.name === "Admin") throw new Error("Missing Permissions");
      return realCreate(opts);
    };
    await backup.runRestore(
      { guilds: { cache: new Map([["999888777666555444", guildFail]]) } },
      storeFail,
      "999888777666555444",
      stored.backupJson,
      "Server Gốc Bị Nuke",
    );
    const sFail = storeFail._mutations.find((x) => x.name === "bot_writes:botRestoreSettings");
    check(
      "role tạo lỗi thì KHÔNG ghi đè adminRoles (giữ cấu hình cũ)",
      sFail?.args?.adminRoles === undefined,
      JSON.stringify(sFail?.args?.adminRoles),
    );
    check(
      "role tạo lỗi thì KHÔNG ghi đè modRoles (giữ cấu hình cũ)",
      sFail?.args?.modRoles === undefined,
      JSON.stringify(sFail?.args?.modRoles),
    );
    // whitelistRoles map trọn vẹn → vẫn được ghi đè đúng (không mất dữ liệu hợp lệ).
    check(
      "role tạo lỗi nhưng whitelistRoles map trọn vẹn → vẫn ghi đè đúng",
      Array.isArray(sFail?.args?.whitelistRoles) && sFail.args.whitelistRoles.length === 1,
      JSON.stringify(sFail?.args?.whitelistRoles),
    );
  }

  /* ── 2c. Tên sticker 1 ký tự (khoảng trắng) → Discord từ chối, phải đệm ── */
  // Bug thật 29/09/2026: sanitizeStickerName("  ") trả "_" — ngắn hơn ngưỡng
  // 2 ký tự của Discord ⇒ guild.stickers.create ném lỗi ⇒ mất sticker âm thầm.
  {
    const guildSt = makeTargetGuild();
    const storeSt = makeStore(guildSt);
    const snapSt = sourceSnapshot();
    snapSt.stickers = [
      {
        id: "old-st-blank",
        name: "  ",
        tags: "😀",
        formatType: 1,
        url: `data:image/png;base64,${PNG_B64}`,
      },
    ];
    const storedSt = utils.compressAndEncryptBackup(snapSt);
    await backup.runRestore(
      { guilds: { cache: new Map([["999888777666555444", guildSt]]) } },
      storeSt,
      "999888777666555444",
      storedSt.backupJson,
      "Server Gốc Bị Nuke",
    );
    const names = guildSt._created.stickersCreated.map((o) => o.name);
    check(
      "sticker tên toàn khoảng trắng → tên ≥ 2 ký tự (Discord chỉ nhận từ 2)",
      names.length === 1 && names[0].length >= 2,
      JSON.stringify(names),
    );
  }

  // Vẫn map được role khi bật role (hành vi cũ phải giữ nguyên).
  check(
    "tắt kênh nhưng bật role → modRoles vẫn map sang ID mới",
    Array.isArray(sNoCh?.args?.modRoles) && sNoCh.args.modRoles.length === 1,
    JSON.stringify(sNoCh?.args?.modRoles),
  );

  /* ── 3. Nhánh lỗi: guild không tồn tại → ném lỗi rõ ràng (bot báo về dashboard) ── */
  let threw = "";
  try {
    await backup.runRestore(
      { guilds: { cache: new Map() } },
      makeStore(null),
      "000000000000000000",
      stored.backupJson,
      "x",
    );
  } catch (e) {
    threw = e.message;
  }
  check(
    "guild mất → ném lỗi rõ ràng (không crash im lặng)",
    threw.includes("Bot không còn trong server cần khôi phục"),
  );

  /* ── 4. Nhánh lỗi: JSON hỏng → ném lỗi có hướng dẫn ── */
  let threw2 = "";
  try {
    await backup.runRestore(
      { guilds: { cache: new Map([["999888777666555444", makeTargetGuild()]]) } },
      makeStore(null),
      "999888777666555444",
      "z:this-is-not-valid-zlib-data!!!",
      "hỏng",
    );
  } catch (e) {
    threw2 = e.message;
  }
  check("backup hỏng → ném lỗi có hướng dẫn (không crash process)", threw2.length > 0);

  /* ── 5. Settings dị dạng: whitelistRoles/modRoles là object (không phải mảng) ──
   * File import từ bot nuke khác có thể chứa settings sai kiểu. restoreCore map
   * thẳng s.modRoles.map(...) → TypeError làm hỏng cả restore. */
  const guildChOff = makeTargetGuild();
  const store3 = makeStore(guildChOff);
  const badSettings = JSON.parse(JSON.stringify(snap));
  badSettings.settings = {
    prefix: "!",
    badWords: {},
    whitelistRoles: { r: 1 },
    whitelistUsers: "not-array",
    modRoles: "not-array",
    adminRoles: null,
    logChannelId: "old-ch-1",
  };
  let threw3 = "";
  try {
    await backup.runRestore(
      { guilds: { cache: new Map([["999888777666555444", guildChOff]]) } },
      store3,
      "999888777666555444",
      JSON.stringify(badSettings),
      "settings hỏng",
    );
  } catch (e) {
    threw3 = e.message;
  }
  check("settings sai kiểu không làm hỏng restore", threw3 === "", threw3);
  check("settings sai kiểu vẫn tạo role/kênh", guildChOff._created.rolesCreated.length > 0);

  /* ── 6. Bot thiếu quyền Manage Webhooks + tin chỉ có khoảng trắng ──
   * Đường dự phòng channel.send chưa suite nào chạm. Nội dung toàn khoảng
   * trắng là payload RỖNG mà Discord từ chối → tin bị nuốt im lặng, không ai
   * báo, số "đã phục hồi" lệch. */
  {
    const blankSnap = JSON.parse(JSON.stringify(snap));
    const srcCh = blankSnap.channels.find((c) => Array.isArray(c.messages));
    blankSnap.channels = [srcCh];
    srcCh.messages = [
      { id: "b1", authorName: "dave", timestamp: 1000, content: "   \n  ", attachments: [] },
      { id: "b2", authorName: "erin", timestamp: 2000, content: "tin thường", attachments: [] },
    ];
    const g4 = makeTargetGuild();
    g4._noWebhook = true; // thiếu Manage Webhooks → createWebhook ném lỗi
    const st4 = makeStore(g4);
    await backup.runRestore(
      { guilds: { cache: new Map([["999888777666555444", g4]]) } },
      st4,
      "999888777666555444",
      utils.compressAndEncryptBackup(blankSnap).backupJson,
      "Server Gốc Bị Nuke",
    );
    const sent4 = g4._created.messagesSent;
    check(
      "thiếu quyền webhook → lùi về channel.send",
      g4._created.webhooksCreated.length === 0 && sent4.length === 2,
      `webhook=${g4._created.webhooksCreated.length} sent=${sent4.length}`,
    );
    check(
      "tin toàn khoảng trắng vẫn được phục hồi (không bị nuốt)",
      sent4.some((p) => String(p?.content ?? "").includes("dave")),
      JSON.stringify(sent4.map((p) => p?.content)),
    );
    check(
      "tin thường không bị ảnh hưởng",
      sent4.some((p) => String(p?.content ?? "").includes("tin thường")),
    );
  }

  console.log(`\nKết quả restore e2e: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
