// Test lớp audit log (antinuke/audit.js) — pipeline xử lý MỌI nuke cấu trúc:
//   handleAuditEntry / handleAttributeEvent (massBan, massKick, massMessageDelete…)
//   routeAuditEntry (định tuyến audit → module), tickUnlocks, tickHeatResets
// Che phủ: ngưỡng thường vs bot gây hại (threshold 1), miễn owner/exempt,
// bot logging hợp pháp không bị xử lý oan, thiếu member → chỉ ghi nhận,
// dedupe 1 hành vi = 1 phạt, tick mở khóa + xóa nhiệt từ dashboard.
// Không mạng, không DB thật. Chạy: node scripts/test-audit-layers.cjs
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
module.exports = {
  Colors: new Proxy({}, { get: () => 0x000000 }),
  EmbedBuilder,
  PermissionFlagsBits: { ManageGuild: 1n << 5n, Administrator: 1n << 3n, ManageRoles: 1n << 28n, ManageWebhooks: 1n << 29n, BanMembers: 1n << 2n },
  UserFlags: { VerifiedBot: 1n << 16n },
  AuditLogEvent: new Proxy({}, { get: (t, k) => (t[k] ??= Symbol(k)) }),
  ChannelType: { GuildText: 0, GuildVoice: 2, GuildCategory: 4, GuildAnnouncement: 5, GuildForum: 15 },
};
`,
);

(async () => {
  const calls = {
    events: [],
    raidSamples: [],
    modActions: [],
    memberBans: [],
    memberKicks: [],
    memberTimeouts: [],
    mutations: [],
    unlockEdits: [],
    heatResets: [],
    ownerDms: [],
    bulkDeleted: [],
    singleDeleted: [],
  };

  // Kênh giả có tin nhắn để chạy nhánh purgeMessages (dọn tin của thủ phạm).
  function makeMsg(id, authorId) {
    return {
      id,
      author: { id: authorId },
      deletable: true,
      delete: async () => {
        calls.singleDeleted.push(id);
      },
    };
  }
  function withMessages(guild, msgs) {
    const col = new Map(msgs.map((m) => [m.id, m]));
    col.filter = (fn) => {
      const out = [...col.values()].filter(fn);
      out.first = (n) => (typeof n === "number" ? out.slice(0, n) : out[0]);
      out.sort = Array.prototype.sort.bind(out);
      return out;
    };
    const ch = guild.channels.cache.get("ch-1");
    ch.messages.fetch = async () => col;
    ch.bulkDelete = async (targets) => {
      calls.bulkDeleted.push(targets.length);
      return { size: targets.length };
    };
    return ch;
  }
  function withModule(config, moduleName, patch) {
    return {
      ...config,
      modules: config.modules.map((m) => (m.module === moduleName ? { ...m, ...patch } : m)),
    };
  }

  function baseConfig(overrides = {}) {
    return {
      antinukeEnabled: true,
      lockdownEnabled: false,
      logChannelId: null,
      modLogChannelId: null,
      modules: [
        {
          module: "massBan",
          enabled: true,
          threshold: 3,
          windowSeconds: 10,
          punish: "ban",
          timeoutSeconds: 600,
          actions: ["ban"],
          whitelistRoles: [],
        },
        {
          module: "massChannelDelete",
          enabled: true,
          threshold: 2,
          windowSeconds: 10,
          punish: "ban",
          timeoutSeconds: 600,
          actions: ["ban"],
          whitelistRoles: [],
        },
        {
          module: "massMessageDelete",
          enabled: true,
          threshold: 2,
          windowSeconds: 10,
          punish: "timeout",
          timeoutSeconds: 600,
          actions: ["timeout"],
          whitelistRoles: [],
        },
        {
          module: "adminSelfGrant",
          enabled: true,
          threshold: 1,
          windowSeconds: 10,
          punish: "ban",
          timeoutSeconds: 600,
          actions: ["ban"],
          whitelistRoles: [],
        },
      ],
      whitelistUsers: [],
      whitelistRoles: [],
      adminRoles: [],
      modRoles: [],
      ...overrides,
    };
  }

  const configs = new Map(); // guildId -> config (đổi được giữa các case)
  const store = {
    client: {
      mutation: async (name, args) => {
        calls.mutations.push({ name, args });
        if (name === "bot_writes:botRecordAntinukeEvent") {
          calls.events.push(args);
          return { caseNumber: 1 };
        }
        if (name === "bot_writes:botRecordRaidSample") return {};
        if (name === "bot_writes:botRecordModAction") {
          calls.modActions.push(args);
          return { caseNumber: 77 };
        }
        return {};
      },
    },
    getConfig: async (guildId) => configs.get(guildId) ?? null,
  };

  const heat = {
    add: async () => ({ tier: "timeout", escalated: false, score: 35 }),
    markPunished: () => {},
    resetGuild: (guildId, userId) => calls.heatResets.push({ guildId, userId }),
  };

  // ---- Mock member / guild ----
  function makeMember(id, { bot = false, admin = false, joinedDaysAgo = 400 } = {}) {
    return {
      id,
      guild: null, // gán khi tạo guild
      user: {
        id,
        bot,
        username: id + "-name",
        tag: id + "-name#0001",
        createdTimestamp: Date.now() - 3 * 365 * 86_400_000,
        avatar: "av",
        flags: { has: () => false },
      },
      permissions: { has: (p) => admin && String(p) === String(1n << 3n) },
      roles: { cache: new Set() },
      joinedTimestamp: Date.now() - joinedDaysAgo * 86_400_000,
      timeout: async () => calls.memberTimeouts.push(id),
      ban: async () => calls.memberBans.push(id),
      kick: async () => calls.memberKicks.push(id),
      send: async () => calls.dm.push(id),
    };
  }

  // entry executor: user object (như Discord audit log) — không phải member
  function makeExecutorUser(id, { bot = false, username = id + "-name" } = {}) {
    return { id, bot, username, tag: username + "#0001", flags: { has: () => false } };
  }

  function makeGuild(id, membersList = [], auditEntries = []) {
    const membersMap = new Map(membersList.map((m) => [m.id, m]));
    for (const m of membersList) m.guild = null;
    const entries = [...auditEntries];
    entries.first = () => entries[0] ?? null;
    const guild = {
      id,
      available: true,
      ownerId: "owner-1",
      name: "G-" + id,
      roles: { cache: new Map(), everyone: { id: id }, fetch: async () => null },
      members: {
        cache: membersMap,
        fetch: async (mid) => membersMap.get(mid) ?? null,
        ban: async (mid) => calls.memberBans.push(mid),
      },
      channels: {
        cache: (() => {
          const m = new Map([
            [
              "ch-1",
              {
                id: "ch-1",
                type: 0,
                isTextBased: () => true,
                isThread: () => false,
                isVoiceBased: () => false,
                viewable: true,
                permissionOverwrites: { edit: async () => calls.unlockEdits.push(id) },
                messages: { filter: () => ({ first: () => [] }), fetch: async () => ({ size: 0 }) },
              },
            ],
          ]);
          m.filter = (fn) => {
            const out = [...m.values()].filter(fn);
            out.first = (n) => (typeof n === "number" ? out.slice(0, n) : out[0]);
            out.sort = Array.prototype.sort.bind(out);
            return out;
          };
          return m;
        })(),
      },
      fetchAuditLogs: async () => ({ entries }),
      member: async () => null,
    };
    for (const m of membersList) m.guild = guild;
    return guild;
  }

  // Ghép các lớp như orchestrator thật (index.js) nhưng AI/raidIntel là giả để đo được.
  const createState = require("../bot/src/handlers/antinuke/state");
  const createAi = require("../bot/src/handlers/antinuke/ai");
  const createEnforce = require("../bot/src/handlers/antinuke/enforce");
  const createAudit = require("../bot/src/handlers/antinuke/audit");

  let client = {
    user: { id: "bot-self" },
    guilds: { cache: new Map() },
    // ownerAlert DM chủ server — kênh không xoá được từ trong server.
    users: {
      fetch: async () => ({
        send: async (opts) => {
          calls.ownerDms.push(opts);
        },
      }),
    },
    on: () => {},
  };
  const state = createState({ client, store });
  const realAi = createAi({ state });
  const ai = {
    aiClassify: realAi.aiClassify, // giữ thật — AI offline trả individual (an toàn)
    clusterStats: (profiles) => ({
      total: profiles.length,
      suspicious: 0,
      ratio: 0,
      freshAccounts: 0,
      defaultAvatars: 0,
      machineNames: 0,
    }),
  };
  const raidIntel = {
    huntRaidSource: async () => ({ banned: false }),
    recordRaidSample: async (guild, config, sample) => calls.raidSamples.push(sample),
  };
  const core = createEnforce({ client, store, heat, state });
  const audit = createAudit({ client, store, heat, state, core, ai, raidIntel });

  let pass = 0;
  let fail = 0;
  function check(label, cond) {
    if (cond) {
      pass++;
      console.log("PASS", label);
    } else {
      fail++;
      console.log("FAIL", label);
    }
  }
  const clear = () => {
    for (const k of Object.keys(calls)) calls[k].length = 0;
  };

  // ── 1. massBan người thật đạt ngưỡng 3 → phạt lần thứ 3 ──
  {
    clear();
    const gid = "g-massban";
    const raider = makeMember("raider-1");
    const guild = makeGuild(gid, [raider]);
    configs.set(gid, baseConfig());
    client.guilds.cache.set(gid, guild);
    const exec = makeExecutorUser("raider-1");
    const entry = { executor: exec, target: { id: "victim" }, changes: [] };
    await audit.handleAuditEntry(entry, guild, "massBan", "x1");
    await audit.handleAuditEntry(entry, guild, "massBan", "x2");
    check(
      "dưới ngưỡng: chưa phạt, chưa ghi sự kiện",
      calls.memberBans.length === 0 && calls.events.length === 0,
    );
    await audit.handleAuditEntry(entry, guild, "massBan", "x3");
    check("đạt ngưỡng 3 → ban thủ phạm", calls.memberBans.includes("raider-1"));
    const ev = calls.events.find((e) => e.module === "massBan");
    check("ghi sự kiện massBan count=3", !!ev && ev.count === 3);
    check(
      "ghi mẫu raid sample cho threat intel",
      calls.raidSamples.some((s) => s.module === "massBan" && s.count === 3),
    );
  }

  // ── 2. Owner → miễn tuyệt đối ──
  {
    clear();
    const gid = "g-owner";
    const guild = makeGuild(gid, []);
    configs.set(gid, baseConfig());
    client.guilds.cache.set(gid, guild);
    const entry = { executor: makeExecutorUser("owner-1"), target: { id: "victim" }, changes: [] };
    await audit.handleAuditEntry(entry, guild, "massBan", "x");
    await audit.handleAuditEntry(entry, guild, "massBan", "x");
    await audit.handleAuditEntry(entry, guild, "massBan", "x");
    check(
      "owner exempt: không phạt, không ghi sự kiện",
      calls.memberBans.length === 0 && calls.events.length === 0,
    );
  }

  // ── 2b. Executor KHÔNG còn trong server (bot vừa bị kick/đã rời) ──
  // Nhánh này ban bằng guild.members.ban(userId) — KHÔNG có punishWithHeat vì
  // không còn member để phạt. Chỉ chạy khi executor là BOT GÂY HẠI (không tick
  // xác minh, không ở lâu); người thật/bot tin cậy thì bỏ qua, không ban oan.
  {
    clear();
    const gid = "g-bot-ngoai-server";
    // Không đưa bot vào membersMap ⇒ guild.members.fetch trả null (đã rời/kicked).
    const guild = makeGuild(gid, []);
    configs.set(gid, baseConfig());
    client.guilds.cache.set(gid, guild);
    // Bot mới vào (joinedTimestamp = hôm nay) + không tick xác minh ⇒ host.
    const hostile = makeExecutorUser("hostile-bot", { bot: true });
    hostile.joinedTimestamp = Date.now();
    const entry = { executor: hostile, target: { id: "ch-1" }, changes: [] };
    await audit.handleAuditEntry(entry, guild, "massChannelDelete", "x1");
    check(
      "T-bot-ngoai-server: bot gây hại 1 lần (ngưỡng 1 với bot) → ban",
      calls.memberBans.includes("hostile-bot"),
      JSON.stringify(calls.memberBans),
    );
    const ev = calls.events.find((e) => e.module === "massChannelDelete");
    check(
      "T-bot-ngoai-server: ghi sự kiện + punish=ban",
      !!ev && ev.punish === "ban" && ev.executorId === "hostile-bot",
      JSON.stringify(ev),
    );
  }
  {
    // Cùng tình huống nhưng bot TIN CẬY (đã ở lâu) → KHÔNG ban.
    clear();
    const gid = "g-bot-tin-cay";
    const guild = makeGuild(gid, []);
    configs.set(gid, baseConfig());
    client.guilds.cache.set(gid, guild);
    const trusted = makeExecutorUser("trusted-bot", { bot: true });
    trusted.joinedTimestamp = Date.now() - 30 * 86_400_000; // ở lâu ⇒ tin cậy
    // Bot tin cậy dùng NGƯỠNG ĐẦY ĐỦ (2) — chỉ ban ngoài server sau 2 lượt.
    const entry = { executor: trusted, target: { id: "ch-1" }, changes: [] };
    await audit.handleAuditEntry(entry, guild, "massChannelDelete", "x1");
    await audit.handleAuditEntry(entry, guild, "massChannelDelete", "x2");
    check(
      "bot tin cậy (đã ở lâu) không còn member → KHÔNG ban oan",
      calls.memberBans.length === 0,
      JSON.stringify(calls.memberBans),
    );
  }
  {
    // Người THẬT không còn trong server (vừa bị kick) → không ban (chỉ ghi nhận).
    clear();
    const gid = "g-nguoi-ngoai-server";
    const guild = makeGuild(gid, []);
    configs.set(gid, baseConfig());
    client.guilds.cache.set(gid, guild);
    const human = makeExecutorUser("human-1");
    human.joinedTimestamp = Date.now();
    const entry = { executor: human, target: { id: "ch-1" }, changes: [] };
    await audit.handleAuditEntry(entry, guild, "massChannelDelete", "x1");
    await audit.handleAuditEntry(entry, guild, "massChannelDelete", "x2");
    check(
      "người thật không còn trong server → không ban ngoài server",
      calls.memberBans.length === 0,
      JSON.stringify(calls.memberBans),
    );
  }

  // ── 2c. handleAttributeEvent: ban executor ngoài server (bot vừa rời) ──
  // Đường sự kiện (guildMemberRemove/gUILD_UPDATE…) không qua audit-entry nên
  // cũng có nhánh ban ngoài server riêng: không còn member để punishWithHeat
  // thì ban thẳng bằng guild.members.ban — CHỈ khi là bot gây hại.
  {
    clear();
    const gid = "g-attr-ban";
    const hostile = makeExecutorUser("attr-hostile", { bot: true });
    hostile.joinedTimestamp = Date.now(); // vừa vào ⇒ không tin cậy
    const entries = [{ target: { id: "ch-1" }, executor: hostile }];
    const guild = makeGuild(gid, [], entries);
    configs.set(gid, baseConfig());
    client.guilds.cache.set(gid, guild);
    await audit.handleAttributeEvent({
      guild,
      module: "massChannelDelete",
      eventType: "ChannelDelete",
      targetId: "ch-1",
      describeTarget: "Xoá 5 kênh",
    });
    check(
      "T-attr-ban: bot gây hại ngoài server → ban ngay lần đầu",
      calls.memberBans.includes("attr-hostile"),
      JSON.stringify(calls.memberBans),
    );
  }
  {
    // Bot tin cậy tạo sự kiện → KHÔNG ban dù không còn member.
    clear();
    const gid = "g-attr-ban-trusted";
    const trusted = makeExecutorUser("attr-trusted", { bot: true });
    trusted.joinedTimestamp = Date.now() - 30 * 86_400_000;
    const entries = [{ target: { id: "ch-1" }, executor: trusted }];
    const guild = makeGuild(gid, [], entries);
    configs.set(gid, baseConfig());
    client.guilds.cache.set(gid, guild);
    for (let i = 0; i < 2; i++) {
      await audit.handleAttributeEvent({
        guild,
        module: "massChannelDelete",
        eventType: "ChannelDelete",
        targetId: "ch-1",
        describeTarget: "Xoá 5 kênh",
      });
    }
    check(
      "T-attr-ban: bot tin cậy ngoài server → KHÔNG ban oan",
      calls.memberBans.length === 0,
      JSON.stringify(calls.memberBans),
    );
  }

  // ── 3. Bot logging hợp pháp (Carl-bot) ban bot spam → KHÔNG bị xử lý oan ──
  {
    clear();
    const gid = "g-carl";
    const guild = makeGuild(gid, []);
    configs.set(gid, baseConfig());
    client.guilds.cache.set(gid, guild);
    const entry = {
      executor: makeExecutorUser("carl-1", { username: "Carl-bot" }),
      target: { id: "v" },
      changes: [],
    };
    await audit.handleAuditEntry(entry, guild, "massBan", "x");
    await audit.handleAuditEntry(entry, guild, "massBan", "x");
    await audit.handleAuditEntry(entry, guild, "massBan", "x");
    check(
      "Carl-bot ban bot spam → không bị coi là nuke",
      calls.memberBans.length === 0 && calls.events.length === 0,
    );
  }

  // ── 4. Bot gây hại (vừa thêm, không tick) → ngưỡng hạ xuống 1, bị ban NGAY ──
  {
    clear();
    const gid = "g-hostile";
    const hostile = makeMember("nuke-bot", { bot: true, joinedDaysAgo: 0.001 });
    const guild = makeGuild(gid, [hostile]);
    configs.set(gid, baseConfig());
    client.guilds.cache.set(gid, guild);
    const entry = {
      executor: makeExecutorUser("nuke-bot", { bot: true }),
      target: { id: "v" },
      changes: [],
    };
    await audit.handleAuditEntry(entry, guild, "massBan", "x");
    const ev = calls.events.find((e) => e.module === "massBan");
    check("bot gây hại bị xử lý ngay ở lượt đầu (count=1)", !!ev && ev.count === 1);
    check("bot gây hại bị ban", calls.memberBans.includes("nuke-bot"));
  }

  // ── 5. Bot tin cậy (đã ở lại 8 ngày) làm moderation → đi theo ngưỡng thường ──
  {
    clear();
    const gid = "g-trusted";
    const trusted = makeMember("carl-old", { bot: true, joinedDaysAgo: 8 });
    const guild = makeGuild(gid, [trusted]);
    configs.set(gid, baseConfig());
    client.guilds.cache.set(gid, guild);
    const entry = {
      executor: makeExecutorUser("carl-old", { bot: true }),
      target: { id: "v" },
      changes: [],
    };
    await audit.handleAuditEntry(entry, guild, "massBan", "x");
    await audit.handleAuditEntry(entry, guild, "massBan", "x");
    check(
      "bot tin cậy dưới ngưỡng → chưa bị phạt",
      calls.memberBans.length === 0 && calls.events.length === 0,
    );
  }

  // ── 6. Executor ngoài server (fetch không thấy) + người → chỉ ghi nhận, không ban mù ──
  {
    clear();
    const gid = "g-gone";
    const guild = makeGuild(gid, []); // không có member nào trong cache
    configs.set(gid, baseConfig());
    client.guilds.cache.set(gid, guild);
    const entry = { executor: makeExecutorUser("gone-user"), target: { id: "v" }, changes: [] };
    for (let i = 0; i < 3; i++) await audit.handleAuditEntry(entry, guild, "massBan", "x");
    const ev = calls.events.find((e) => e.module === "massBan");
    check("không fetch được member → không ban mù", calls.memberBans.length === 0);
    check(
      "vẫn ghi sự kiện với action 'đã ghi nhận'",
      !!ev && String(ev.action).startsWith("đã ghi nhận"),
    );
  }

  // ── 7. massMessageDelete qua handleAttributeEvent (MessageBulkDelete) ──
  {
    clear();
    const gid = "g-bulk";
    const raider = makeMember("bulk-raider");
    const guild = makeGuild(gid, [raider]);
    configs.set(gid, baseConfig());
    client.guilds.cache.set(gid, guild);
    guild.fetchAuditLogs = async () => ({
      entries: (() => {
        const arr = [{ executor: makeExecutorUser("bulk-raider"), target: null }];
        arr.first = () => arr[0];
        arr.find = Array.prototype.find.bind(arr);
        return arr;
      })(),
    });
    const messages = { first: () => ({ guild, channelId: "ch-1" }), size: 50 };
    await audit.handleMessageBulk(messages);
    await audit.handleMessageBulk(messages);
    const ev = calls.events.find((e) => e.module === "massMessageDelete");
    check(
      "xóa tin hàng loạt đạt ngưỡng → timeout thủ phạm",
      !!ev && calls.memberTimeouts.includes("bulk-raider"),
    );
  }

  // ── 8. tickHeatResets: dashboard bấm "Xóa nhiệt" → bot reset + xóa cờ ──
  {
    clear();
    const gid = "g-heat";
    const guild = makeGuild(gid, []);
    configs.set(gid, baseConfig({ heatResetRequested: true, heatResetUserId: "u9" }));
    client.guilds.cache.set(gid, guild);
    await audit.tickHeatResets();
    check(
      "xóa nhiệt guild theo yêu cầu dashboard",
      calls.heatResets.some((h) => h.guildId === gid && h.userId === "u9"),
    );
    check(
      "xóa cờ heatResetRequested sau khi reset",
      calls.mutations.some(
        (m) => m.name === "bot_writes:botClearHeatReset" && m.args.guildId === gid,
      ),
    );
  }

  // ── 9. tickUnlocks: lockdown hết hạn sau restart → mở khóa ĐÚNG 1 LẦN ──
  {
    clear();
    const gid = "g-lock";
    const guild = makeGuild(gid, []);
    configs.set(gid, baseConfig({ lockdownUntil: Date.now() - 1000 }));
    client.guilds.cache.set(gid, guild);
    await audit.tickUnlocks();
    const unlocks = calls.mutations.filter(
      (m) => m.name === "bot_writes:botLockState" && m.args.guildId === gid,
    );
    check(
      "lockdown hết hạn → mở khóa (reset overwrite + ghi trạng thái)",
      calls.unlockEdits.includes(gid) && unlocks.length === 1 && unlocks[0].args.until === null,
    );
    await audit.tickUnlocks();
    const unlocks2 = calls.mutations.filter(
      (m) => m.name === "bot_writes:botLockState" && m.args.guildId === gid,
    );
    check("cùng 1 mốc hết hạn → KHÔNG mở khóa lặp lại (chống spam log)", unlocks2.length === 1);
  }

  // ── 10. tickUnlocks: đang trong thời gian khóa (restart giữa chừng) → nhớ lại trạng thái ──
  {
    clear();
    const gid = "g-lock2";
    const guild = makeGuild(gid, []);
    configs.set(gid, baseConfig({ lockdownUntil: Date.now() + 60_000 }));
    client.guilds.cache.set(gid, guild);
    await audit.tickUnlocks();
    check(
      "đang khóa (chưa hết hạn) → không mở khóa",
      !calls.mutations.some((m) => m.name === "bot_writes:botLockState"),
    );
  }

  // ── 11. routeAuditEntry: định tuyến đúng module cho từng loại audit ──
  {
    clear();
    const gid = "g-route";
    const adminRole = {
      id: "role-admin",
      name: "Admin",
      permissions: { has: (p) => String(p) === String(1n << 3n) },
    };
    const normalRole = { id: "role-x", name: "X", permissions: { has: () => false } };
    const guild = makeGuild(gid, []);
    guild.roles.cache = new Map([
      ["role-admin", adminRole],
      ["role-x", normalRole],
    ]);
    const AE = require("discord.js").AuditLogEvent;
    const r1 = await audit.routeAuditEntry(
      { action: AE.WebhookCreate, target: { name: "w1" }, changes: [] },
      guild,
    );
    check("WebhookCreate → massWebhookCreate", r1?.module === "massWebhookCreate");
    const r2 = await audit.routeAuditEntry(
      {
        action: AE.ChannelUpdate,
        target: { name: "c" },
        changes: [{ key: "permission_overwrites" }],
      },
      guild,
    );
    check("ChannelUpdate đổi quyền → massChannelOverwrite", r2?.module === "massChannelOverwrite");
    const r3 = await audit.routeAuditEntry(
      { action: AE.ChannelUpdate, target: { name: "c" }, changes: [{ key: "name" }] },
      guild,
    );
    check("ChannelUpdate đổi tên → massChannelRename", r3?.module === "massChannelRename");
    const r4 = await audit.routeAuditEntry(
      {
        action: AE.MemberRoleUpdate,
        target: { id: "u1" },
        changes: [{ key: "$add", new: [{ id: "role-admin" }] }],
      },
      guild,
    );
    check("cấp role admin cho người khác → adminSelfGrant", r4?.module === "adminSelfGrant");
    const r5 = await audit.routeAuditEntry(
      {
        action: AE.MemberRoleUpdate,
        target: { id: "u1" },
        changes: [{ key: "$add", new: [{ id: "role-x" }] }],
      },
      guild,
    );
    check(
      "cấp role thường → massRoleAssign (không phải leo thang)",
      r5?.module === "massRoleAssign",
    );
    const r6 = await audit.routeAuditEntry(
      { action: AE.BotAdd, target: { username: "nuke-bot" }, changes: [] },
      guild,
    );
    check("BotAdd → massBotAdd", r6?.module === "massBotAdd");
    const r7 = await audit.routeAuditEntry(
      { action: AE.GuildUpdate, target: null, changes: [{ key: "icon_hash" }] },
      guild,
    );
    check("đổi icon server → guildTamper", r7?.module === "guildTamper");
    const r8 = await audit.routeAuditEntry(
      { action: AE.EmojiDelete, target: null, changes: [] },
      guild,
    );
    check("audit không liên quan → null (không xử lý)", r8 === null);
  }

  // ── 12. Dedupe: cùng 1 hành vi fire 2 lần audit → chỉ 1 sự kiện ──
  {
    clear();
    const gid = "g-dedupe";
    const raider = makeMember("dedupe-raider");
    const guild = makeGuild(gid, [raider]);
    configs.set(
      gid,
      baseConfig({
        modules: baseConfig().modules.map((m) =>
          m.module === "massChannelDelete" ? { ...m, threshold: 1 } : m,
        ),
      }),
    );
    client.guilds.cache.set(gid, guild);
    const entry = { executor: makeExecutorUser("dedupe-raider"), target: { id: "v" }, changes: [] };
    await audit.handleAuditEntry(entry, guild, "massChannelDelete", "x");
    await audit.handleAuditEntry(entry, guild, "massChannelDelete", "x");
    const evs = calls.events.filter((e) => e.module === "massChannelDelete");
    check(
      "1 hành vi = 1 phạt + 1 sự kiện (audit log thường fire 2 lần)",
      evs.length === 1 && calls.memberBans.filter((b) => b === "dedupe-raider").length === 1,
    );
  }

  // ── 13. punishWithHeat: module CHỈ dọn tin nhắn → không đụng thành viên ──
  // Nhánh này chưa từng chạy. Hậu quả nếu hỏng: chủ server chọn “chỉ xoá tin
  // nhắn” cho module nhưng bot vẫn ban thành viên — phạt oan, mất niềm tin.
  {
    clear();
    const gid = "g-no-punish";
    const spammer = makeMember("spammer-1");
    const guild = makeGuild(gid, [spammer]);
    configs.set(
      gid,
      baseConfig({
        modules: [
          {
            module: "massSpam",
            enabled: true,
            threshold: 1,
            windowSeconds: 10,
            punish: "ban",
            timeoutSeconds: 600,
            actions: ["delete", "purge"], // KHÔNG có warn/kick/ban/timeout
            whitelistRoles: [],
          },
        ],
      }),
    );
    client.guilds.cache.set(gid, guild);
    const res = await core.punishWithHeat(
      guild,
      spammer,
      { module: "massSpam", punish: "ban", actions: ["delete", "purge"] },
      "spam",
    );
    check(
      "chỉ dọn tin nhắn → không ban/kick/timeout thành viên",
      calls.memberBans.length === 0 &&
        calls.memberKicks.length === 0 &&
        calls.memberTimeouts.length === 0,
      JSON.stringify(calls.memberBans),
    );
    check(
      "trả về mô tả 'không phạt thành viên' + chosen=null",
      res.chosen === null && String(res.action).includes("không phạt thành viên"),
      JSON.stringify(res),
    );
  }

  // ── 14. routeAuditEntry: GUILD_UPDATE phải bắt được bước CHIẾM QUYỀN server ──
  // Danh sách key cũ chỉ có key "trang trí" (tên/icon/splash) + mfa/verification.
  // `owner_id` (chuyển quyền sở hữu server) và `system_channel_id` /
  // `rules_channel_id` (trỏ sang kênh scam cho mọi thành viên mới) rơi ngoài
  // danh sách nên im lặng hoàn toàn — trong khi module guildTamper cấu hình sẵn
  // punish=ban và nằm trong nhóm rollback cấu trúc.
  {
    clear();
    const gid = "g-tamper";
    const guild = makeGuild(gid, []);
    const AE = require("discord.js").AuditLogEvent;
    const routeKey = (key) =>
      audit.routeAuditEntry({ action: AE.GuildUpdate, target: null, changes: [{ key }] }, guild);
    for (const key of [
      "owner_id",
      "system_channel_id",
      "rules_channel_id",
      "afk_channel_id",
      "public_updates_channel_id",
      "explicit_content_filter",
      "description",
      "banner_hash",
    ]) {
      const r = await routeKey(key);
      check(`GuildUpdate doi \`${key}\` → guildTamper`, r?.module === "guildTamper");
    }
    const benign = await routeKey("premium_tier");
    check("GuildUpdate doi thuoc tinh vo hai → khong bat nham", benign === null);
    const mixed = await audit.routeAuditEntry(
      {
        action: AE.GuildUpdate,
        target: null,
        changes: [{ key: "premium_tier" }, { key: "owner_id" }],
      },
      guild,
    );
    check(
      "GuildUpdate lẫn key vo hai + key chiem quyen → van guildTamper",
      mixed?.module === "guildTamper",
    );
  }

  // ── 15. handleAuditEntry: nguoi co quyen vuot nguong → canh bao owner ──
  // handleAttributeEvent đã DM owner khi thủ phạm là người được miễn, nhưng
  // đường audit (xoá kênh, thêm bot, sửa role, đổi cấu hình server…) lại
  // `if (exempt) return` trần im lặng. Hậu quả: mod có quyền xoá 20 kênh →
  // owner KHÔNG nhận tín hiệu nào, dù massChannelDelete là vector nuke nghiêm
  // trọng nhất sau massBan.
  {
    clear();
    const { _ownerAlertForTest } = require("../bot/src/handlers/antinuke/ownerAlert");
    _ownerAlertForTest();
    const gid = "g-privileged-audit";
    const mod = makeMember("mod-priv", { admin: true });
    const guild = makeGuild(gid, [mod]);
    configs.set(
      gid,
      baseConfig({
        modules: [
          {
            module: "massChannelDelete",
            enabled: true,
            threshold: 2,
            windowSeconds: 10,
            punish: "ban",
            timeoutSeconds: 600,
            actions: ["ban"],
            whitelistRoles: [],
          },
        ],
      }),
    );
    client.guilds.cache.set(gid, guild);
    const entry = { executor: makeExecutorUser("mod-priv"), target: { id: "ch-1" }, changes: [] };
    await audit.handleAuditEntry(entry, guild, "massChannelDelete", "#general");
    await audit.handleAuditEntry(entry, guild, "massChannelDelete", "#random");
    await new Promise((r) => setImmediate(r));
    check(
      "mod duoc mien: bot khong phat",
      !calls.memberBans.includes("mod-priv") && calls.events.length === 0,
      JSON.stringify(calls.memberBans),
    );
    check(
      "mod vuot nguong → DM owner (privileged)",
      calls.ownerDms.length === 1,
      `ownerDms=${calls.ownerDms.length}`,
    );
    const dmText = calls.ownerDms[0]?.embeds?.[0]?.d?.description ?? "";
    check("DM ghi ro thu pham de owner go quyen", dmText.includes("<@mod-priv>"), dmText);
    check("DM nói rõ bot không phat (chống hiểu nhầm)", dmText.includes("không phạt"), dmText);
  }

  // ── 16. Bộ đếm ngưỡng phải tách theo từng executor ──
  // `record()` gộp mọi người vào cùng bucket `${guildId}:${module}`. Nếu nhánh
  // "được miễn" cũng đếm vào đó thì mod tạo 2 webhook sẽ đẩy bộ đếm lên ngưỡng
  // và raider tạo webhook ĐẦU TIÊN bị phạt oan. Nhánh miễn trừ phải đếm ở
  // bucket riêng theo executor.
  {
    clear();
    const { _ownerAlertForTest } = require("../bot/src/handlers/antinuke/ownerAlert");
    _ownerAlertForTest();
    const gid = "g-bucket";
    const mod = makeMember("mod-bucket", { admin: true });
    const raider = makeMember("raider-bucket");
    const guild = makeGuild(gid, [mod, raider]);
    configs.set(
      gid,
      baseConfig({
        modules: [
          {
            module: "massWebhookCreate",
            enabled: true,
            threshold: 2,
            windowSeconds: 10,
            punish: "ban",
            timeoutSeconds: 600,
            actions: ["ban"],
            whitelistRoles: [],
          },
        ],
      }),
    );
    client.guilds.cache.set(gid, guild);
    const webhookEntry = (id) => ({
      executor: makeExecutorUser(id),
      target: { id: "w" },
      changes: [],
    });
    await audit.handleAuditEntry(webhookEntry("mod-bucket"), guild, "massWebhookCreate", "w1");
    await audit.handleAuditEntry(webhookEntry("mod-bucket"), guild, "massWebhookCreate", "w2");
    await audit.handleAuditEntry(webhookEntry("raider-bucket"), guild, "massWebhookCreate", "w3");
    await new Promise((r) => setImmediate(r));
    check(
      "nguoi duoc mien spam khong vu khi hoa nguong cua nguoi khac",
      !calls.memberBans.includes("raider-bucket"),
      JSON.stringify(calls.memberBans),
    );
  }

  // ── 17. handleAttributeEvent: cảnh báo owner vẫn còn (chặn hồi quy) ──
  {
    clear();
    const { _ownerAlertForTest } = require("../bot/src/handlers/antinuke/ownerAlert");
    _ownerAlertForTest();
    const gid = "g-privileged-attr";
    const mod = makeMember("mod-attr", { admin: true });
    const guild = makeGuild(
      gid,
      [mod],
      [{ executor: makeExecutorUser("mod-attr"), target: { id: "ch-1" } }],
    );
    configs.set(
      gid,
      baseConfig({
        modules: [
          {
            module: "massChannelCreate",
            enabled: true,
            threshold: 2,
            windowSeconds: 10,
            punish: "ban",
            timeoutSeconds: 600,
            actions: ["ban"],
            whitelistRoles: [],
          },
        ],
      }),
    );
    client.guilds.cache.set(gid, guild);
    // auditExecutor tra thu pham theo targetId → phai khop `target.id` cua entry.
    const attr = (n) => ({
      guild,
      module: "massChannelCreate",
      eventType: "GuildChannelCreate",
      targetId: "ch-1",
      describeTarget: "#k" + n,
    });
    await audit.handleAttributeEvent(attr(1));
    await audit.handleAttributeEvent(attr(2));
    await new Promise((r) => setImmediate(r));
    check(
      "handleAttributeEvent: mod vuot nguong → DM owner (khong hoi quy)",
      calls.ownerDms.length === 1,
      `ownerDms=${calls.ownerDms.length}`,
    );
    check(
      "handleAttributeEvent: mod duoc mien thi khong phat",
      !calls.memberBans.includes("mod-attr"),
    );
  }

  // ── 16. purgeMessages: dọn tin của thủ phạm trên toàn server ──
  // Nhánh này chưa từng chạy: cleanupMessages gọi
  // guild.channels.cache.filter(...).first(8) + channel.bulkDelete, mock cũ
  // không có nên nhánh chỉ tồn tại trên giấy. Đây là bước cắt thiệt hại ngay
  // sau khi ban — quan trọng không kém việc ban.
  {
    clear();
    const gid = "g-audit-purge";
    const raider = makeMember("purge-raider");
    const guild = makeGuild(gid, [raider]);
    withMessages(guild, [
      makeMsg("pm1", "purge-raider"),
      makeMsg("pm2", "purge-raider"),
      makeMsg("pm3", "nguoi-tot"),
    ]);
    configs.set(
      gid,
      withModule(baseConfig(), "massChannelDelete", { actions: ["ban", "purgeMessages"] }),
    );
    client.guilds.cache.set(gid, guild);
    const entry = { executor: makeExecutorUser("purge-raider"), target: { id: "ch-x" } };
    await audit.handleAuditEntry(entry, guild, "massChannelDelete", "x1");
    await audit.handleAuditEntry(entry, guild, "massChannelDelete", "x2");
    check(
      `audit purgeMessages: xoá hết tin của thủ phạm (thực tế ${calls.bulkDeleted.join(",")})`,
      calls.bulkDeleted.length === 1 && calls.bulkDeleted[0] === 2,
    );
    check("audit purgeMessages: KHÔNG xoá tin của người khác", calls.singleDeleted.length === 0);
    const ev = calls.events.find((e) => e.module === "massChannelDelete");
    check(
      `audit purgeMessages: sự kiện ghi kèm số tin đã dọn (${String(ev?.action ?? "").slice(0, 80)})`,
      String(ev?.action ?? "").includes("purge 2 tin"),
    );
  }
  {
    // handleAttributeEvent cũng có nhánh purgeMessages riêng (audit entry có
    // executor rõ, attribute event thì tra từ audit log theo targetId).
    clear();
    const gid = "g-attr-purge";
    const raider = makeMember("attr-purge");
    const guild = makeGuild(gid, [raider]);
    withMessages(guild, [makeMsg("ap1", "attr-purge"), makeMsg("ap2", "nguoi-khac")]);
    configs.set(
      gid,
      withModule(baseConfig(), "massChannelDelete", { actions: ["ban", "purgeMessages"] }),
    );
    client.guilds.cache.set(gid, guild);
    guild.fetchAuditLogs = async () => ({
      entries: {
        first: () => ({ id: "e1", executor: { id: "attr-purge", username: "attr-purge" } }),
        find: () => ({ id: "e1", executor: { id: "attr-purge", username: "attr-purge" } }),
      },
    });
    const attr = (n) => ({
      guild,
      module: "massChannelDelete",
      eventType: "GuildChannelDelete",
      targetId: "ch-" + n,
      describeTarget: "#k" + n,
    });
    await audit.handleAttributeEvent(attr(1));
    await audit.handleAttributeEvent(attr(2));
    check(
      `attribute purgeMessages: xoá tin của thủ phạm (thực tế ${calls.singleDeleted.join(",")})`,
      calls.singleDeleted.includes("ap1"),
    );
  }

  // ── 17. LỖI BƯỚC PHỤ KHÔNG ĐƯỢC XOÁ THÔNG TIN ĐÃ PHẠT ──
  // Khóa kênh + dọn tin nằm cùng try với phạt. Nếu chúng lỗi (mất gateway
  // giữa lúc raid — đúng lúc bot phản ứng), catch ghi đè action thành
  // "không thể xử lý" → chủ server đọc log tưởng bot chưa làm gì, trong khi
  // thủ phạm ĐÃ bị ban.
  {
    clear();
    const gid = "g-substep-fail";
    const raider = makeMember("substep-raider");
    const guild = makeGuild(gid, [raider]);
    // Mock guild không có members.fetchMe → lockGuild ném TypeError, đúng
    // dạng lỗi "gateway mất kết nối" mà bot gặp giữa lúc raid.
    configs.set(
      gid,
      withModule(baseConfig({ lockdownEnabled: true }), "massChannelDelete", {
        actions: ["ban", "purgeMessages"],
      }),
    );
    client.guilds.cache.set(gid, guild);
    const entry = { executor: makeExecutorUser("substep-raider"), target: { id: "ch-x" } };
    await audit.handleAuditEntry(entry, guild, "massChannelDelete", "x1");
    await audit.handleAuditEntry(entry, guild, "massChannelDelete", "x2");
    check("bước phụ lỗi: thủ phạm VẪN bị ban", calls.memberBans.includes("substep-raider"));
    const ev = calls.events.find((e) => e.module === "massChannelDelete");
    check(
      `bước phụ lỗi: sự kiện không mất thông tin đã ban (${String(ev?.action ?? "").slice(0, 80)})`,
      String(ev?.action ?? "").includes("đã ban"),
    );
  }

  // ── 18. handleAttributeEvent: các nhánh miễn trừ chưa chạy ──
  {
    clear();
    const { _ownerAlertForTest } = require("../bot/src/handlers/antinuke/ownerAlert");
    _ownerAlertForTest();
    const gid = "g-attr-exempt";
    const guild = makeGuild(gid, []);
    configs.set(gid, baseConfig({ whitelistUsers: ["white-1"] }));
    client.guilds.cache.set(gid, guild);
    const mk = (executor) => ({
      guild,
      module: "massChannelDelete",
      eventType: "GuildChannelDelete",
      targetId: "ch-1",
      describeTarget: "#a",
      _exec: executor,
    });
    // auditExecutor dùng auditLookup — nạp executor qua fetchAuditLogs
    const setExec = (id) => {
      guild.fetchAuditLogs = async () => ({
        entries: {
          first: () => ({ id: "e1", executor: { id, username: id } }),
          find: () => ({ id: "e1", executor: { id, username: id } }),
        },
      });
    };
    const run = async (id) => {
      setExec(id);
      await audit.handleAttributeEvent(mk());
      await new Promise((r) => setImmediate(r));
    };
    // Owner (miễn ngay cả khi không fetch được member)
    await run("owner-1");
    check("attr: owner → bỏ qua, không ghi sự kiện", calls.events.length === 0);
    // Whitelist toàn cục
    await run("white-1");
    check("attr: whitelist toàn cục → bỏ qua", calls.events.length === 0);
    // Bot logging hợp pháp
    await run("carl-bot-x");
    check("attr: bot logging (Carl-bot) → bỏ qua", calls.events.length === 0);
    // Không tra được executor → im lặng, không vỡ
    guild.fetchAuditLogs = async () => ({ entries: { first: () => null, find: () => null } });
    await audit.handleAttributeEvent(mk());
    check("attr: không tra được executor → im lặng", calls.events.length === 0);
    // Guild unavailable → bỏ qua ngay
    await audit.handleAttributeEvent({ ...mk(), guild: { id: gid, available: false } });
    check("attr: guild unavailable → bỏ qua", calls.events.length === 0);
    await audit.handleAttributeEvent({ guild: null, module: "massChannelDelete" });
    check("attr: thiếu guild → bỏ qua, không vỡ", true);
  }

  // ── 19. handleAttributeEvent: ban bot ngoài server thất bại ──
  {
    clear();
    const gid = "g-attr-banfail";
    const guild = makeGuild(gid, []);
    configs.set(
      gid,
      withModule(baseConfig(), "massChannelDelete", { actions: ["ban"], threshold: 1 }),
    );
    client.guilds.cache.set(gid, guild);
    guild.members.ban = async () => {
      throw new Error("Missing Permissions");
    };
    guild.fetchAuditLogs = async () => ({
      entries: {
        first: () => ({
          id: "e1",
          executor: { id: "bot-ngoai", bot: true, username: "bot-ngoai" },
        }),
        find: () => ({
          id: "e1",
          executor: { id: "bot-ngoai", bot: true, username: "bot-ngoai" },
        }),
      },
    });
    await audit.handleAttributeEvent({
      guild,
      module: "massChannelDelete",
      eventType: "GuildChannelDelete",
      targetId: "ch-1",
      describeTarget: "#a",
    });
    const ev = calls.events.find((e) => e.module === "massChannelDelete");
    check(
      `attr: ban bot ngoài server thất bại → ghi rõ (${String(ev?.action ?? "").slice(0, 60)})`,
      String(ev?.action ?? "").includes("không thể ban"),
    );
  }

  // ── 20. routeAuditEntry: các loại audit còn thiếu ──
  {
    clear();
    const AE = require("discord.js").AuditLogEvent;
    const gid = "g-route";
    const guild = makeGuild(gid, []);
    const go = (action, target, changes) =>
      audit.routeAuditEntry({ action, target, changes }, guild);
    check(
      "route: ThreadCreate → massThreadCreate",
      (await go(AE.ThreadCreate, { name: "t" }))?.module === "massThreadCreate",
    );
    check(
      "route: ThreadDelete → massThreadDelete",
      (await go(AE.ThreadDelete, { name: "t" }))?.module === "massThreadDelete",
    );
    check(
      "route: RoleUpdate → massRoleEdit",
      (await go(AE.RoleUpdate, { name: "r" }))?.module === "massRoleEdit",
    );
    check(
      "route: MemberUpdate đổi biệt danh → massNickname",
      (await go(AE.MemberUpdate, { id: "u1" }, [{ key: "nick" }]))?.module === "massNickname",
    );
    check(
      "route: MemberUpdate khác biệt danh → null",
      (await go(AE.MemberUpdate, { id: "u1" }, [{ key: "avatar" }])) === null,
    );
    check(
      "route: ChannelUpdate đổi thuộc tính vô hại → null",
      (await go(AE.ChannelUpdate, { name: "c" }, [{ key: "icon" }])) === null,
    );
    check(
      "route: EmojiCreate → massEmoji",
      (await go(AE.EmojiCreate, { name: "e" }))?.module === "massEmoji",
    );
    check(
      "route: StickerCreate → massEmoji",
      (await go(AE.StickerCreate, { name: "s" }))?.module === "massEmoji",
    );
    check(
      "route: InviteCreate → massInviteCreate",
      (await go(AE.InviteCreate, null))?.module === "massInviteCreate",
    );
    // MemberRoleUpdate: role thường (không có quyền quản trị) → massRoleAssign
    const plain = await go(AE.MemberRoleUpdate, { id: "u1" }, [
      { key: "$add", new: [{ id: "role-x" }] },
    ]);
    check(
      `route: cấp role thường → massRoleAssign (${plain?.module})`,
      plain?.module === "massRoleAssign",
    );
    // Role admin đã có trong cache → adminSelfGrant
    guild.roles.cache.set("role-admin", {
      id: "role-admin",
      name: "Admin",
      permissions: { has: (p) => String(p) === String(1n << 3n) },
    });
    const grant = await go(AE.MemberRoleUpdate, { id: "u1" }, [
      { key: "$add", new: [{ id: "role-admin" }] },
    ]);
    check(
      `route: cấp role admin → adminSelfGrant (${grant?.module})`,
      grant?.module === "adminSelfGrant",
    );
    // Không có entry.executor / target → không vỡ
    check("route: audit rác → không vỡ", (await go("KhongTonTai", null)) === null);
  }

  // ── 21. tickUnlocks: guild không có config → bỏ qua, không vỡ ──
  {
    clear();
    const gidNoCfg = "g-khong-config";
    client.guilds.cache.set(gidNoCfg, makeGuild(gidNoCfg, []));
    let ok = true;
    try {
      await audit.tickUnlocks();
    } catch (e) {
      ok = false;
    }
    check("tickUnlocks: guild chưa có config → bỏ qua, không vỡ", ok);
  }

  fs.unlinkSync(DJS_MOCK);
  console.log(`\nKết quả audit layers: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
