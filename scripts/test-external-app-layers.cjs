// Test 3 tầng External App Guard (antinuke/externalApp.js):
//   Tầng 1: handleExternalApp — audit log IntegrationCreate (loạt kết nối app)
//   Tầng 2: handleExternalAppMessage — spam do app gửi (webhook/bot lạ)
//   Tầng 3: handleButtonRaid — spam bấm nút trên tin mồi của app
// Che phủ: AI raid / AI not-raid / AI offline, exempt (owner/whitelist/bot tin cậy),
// phân biệt app ngoài vs bot được mời vs kết nối twitch/youtube, dedupe 1 làn sóng,
// xóa webhook + truy thủ phạm, debounce bấm nút. Không mạng, không DB thật.
// Chạy: node scripts/test-external-app-layers.cjs
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
  AuditLogEvent: new Proxy({}, { get: (t, k) => (t[k] ??=Symbol(k)) }),
};
`,
);

// HERMETIC: nhiều case kỳ vọng "AI chưa cấu hình" (offline path). Env ambient
// có thể set AI_API_KEY/AI_BASE_URL → engine thấy AI online, luồng khác kỳ vọng
// → FAIL giả. Xóa sạch key provider trước khi require.
for (const k of [
  "AI_API_KEY",
  "AI_BASE_URL",
  "AI_MODEL",
  "GROQ_API_KEY",
  "DEEPSEEK_NIM_KEY",
  "NVIDIA_API_KEY",
  "SAMBANOVA_API_KEY",
  "KIRA_API_KEY",
  "OPENAI_API_KEY",
]) {
  delete process.env[k];
}

(async () => {
  // ---- Bộ đếm + store giả (mutation chỉ ghi nhận, không mạng) ----
  const calls = {
    recordEvent: [],
    raidSample: [],
    modAction: [],
    ban: [],
    kick: [],
    timeout: [],
    dm: [],
    logs: [],
    cases: [],
    lockdown: [],
    webhookDeleted: [],
    msgDeleted: [],
    ownerDms: [],
  };
  const mutatedEvents = () => calls.recordEvent;

  let config = baseConfig();
  const store = {
    client: {
      mutation: async (name, args) => {
        if (name === "bot_writes:botRecordAntinukeEvent") {
          calls.recordEvent.push(args);
          return { caseNumber: 1 };
        }
        if (name === "bot_writes:botRecordRaidSample") {
          calls.raidSample.push(args);
          return {};
        }
        if (name === "bot_writes:botRecordModAction") {
          calls.modAction.push(args);
          return { caseNumber: 77 };
        }
        return {};
      },
    },
    getConfig: async () => config,
  };

  function baseConfig(overrides = {}) {
    return {
      antinukeEnabled: true,
      lockdownEnabled: false,
      modules: [
        {
          module: "externalAppRaid",
          enabled: true,
          threshold: 2,
          windowSeconds: 15,
          punish: "kick",
          timeoutSeconds: 600,
          whitelistRoles: [],
          actions: ["kick"],
        },
      ],
      whitelistUsers: [],
      whitelistRoles: [],
      adminRoles: [],
      modRoles: [],
      ...overrides,
    };
  }

  // ---- Heat giả: trả kết quả cố định để đo được hình phạt ----
  const heat = {
    add: async () => ({ tier: "warn", escalated: false, score: 10 }),
    markPunished: () => {},
    resetGuild: () => {},
  };

  // ---- client giả: guilds cache + users fetch (cho check tick VerifiedBot) ----
  function makeClient() {
    return {
      user: { id: "bot-self" },
      guilds: { cache: new Map() },
      on: () => {},
      users: {
        // Owner: alertOwner DM được (kênh không xoá được từ trong server).
        // Mọi user khác vẫn throw để nhánh VerifiedBot giữ nguyên hành vi cũ.
        fetch: async (id) => {
          if (id !== "owner-1") throw new Error("unknown user");
          return {
            send: async (opts) => {
              calls.ownerDms.push(opts);
            },
          };
        },
      },
    };
  }

  // Truy cập 3 tầng qua các factory riêng (index không expose layer handles).
  const createState = require("../bot/src/handlers/antinuke/state");
  const createAi = require("../bot/src/handlers/antinuke/ai");
  const createRaidIntel = require("../bot/src/handlers/antinuke/raidIntel");
  const createEnforce = require("../bot/src/handlers/antinuke/enforce");
  const createExternalApp = require("../bot/src/handlers/antinuke/externalApp");
  const client = makeClient();
  const state = createState({ client, store });
  const ai = createAi({ state });
  const raidIntel = createRaidIntel({ client, store, ai });
  const core = createEnforce({ client, store, heat, state });
  const { handleExternalApp, handleExternalAppMessage, handleButtonRaid } = createExternalApp({
    client,
    store,
    heat,
    state,
    core,
    ai,
    raidIntel,
  });

  let pass = 0;
  let fail = 0;
  function check(cond, label) {
    if (cond) {
      pass++;
      console.log("PASS", label);
    } else {
      fail++;
      console.log("FAIL", label);
    }
  }
  const resetCalls = () => {
    calls.recordEvent.length = 0;
    calls.raidSample.length = 0;
    calls.modAction.length = 0;
    calls.ban.length = 0;
    calls.kick.length = 0;
    calls.timeout.length = 0;
    calls.dm.length = 0;
    calls.logs.length = 0;
    calls.cases.length = 0;
    calls.lockdown.length = 0;
    calls.webhookDeleted.length = 0;
    calls.msgDeleted.length = 0;
    calls.ownerDms.length = 0;
  };

  // ---- Mock member/guild ----
  function makeMember(
    id,
    { bot = false, admin = false, freshAcc = false, verifiedTick = false } = {},
  ) {
    const createdTs = freshAcc ? Date.now() - 2 * 86_400_000 : Date.now() - 3 * 365 * 86_400_000;
    const flags = { has: (f) => verifiedTick && String(f) === String(1n << 16n) };
    return {
      id,
      user: {
        id,
        bot,
        username: id + "-name",
        tag: id + "-name#0001",
        createdTimestamp: createdTs,
        flags,
      },
      permissions: { has: (p) => admin && String(p) === String(1n << 3n) },
      roles: { cache: new Set() },
      joinedTimestamp: Date.now() - (freshAcc ? 60_000 : 30 * 86_400_000),
      ban: async (opts) => {
        calls.ban.push({ id, reason: opts?.reason });
      },
      kick: async (reason) => {
        calls.kick.push({ id, reason });
      },
      timeout: async (ms, reason) => {
        calls.timeout.push({ id, ms, reason });
      },
      send: async (content) => {
        calls.dm.push({ id, content });
      },
      guild: null,
    };
  }

  function makeGuild({ membersMap = {}, ownerId = "owner-1", id = "g1" } = {}) {
    const members = {
      fetch: async (id) => membersMap[id] ?? null,
      cache: new Map(Object.entries(membersMap)),
    };
    const guild = {
      id,
      name: "Test Guild",
      available: true,
      ownerId,
      memberCount: 100,
      members,
      roles: { cache: new Map(), fetch: async () => null },
      channels: { cache: { filter: () => ({ first: () => [] }) } },
      client: makeClient(),
      fetchAuditLogs: async () => ({ entries: new Map() }),
    };
    for (const m of Object.values(membersMap)) m.guild = guild;
    return guild;
  }

  // ==== TẦNG 1: handleExternalApp (IntegrationCreate) ====
  console.log("\n===== TẦNG 1 — IntegrationCreate (audit) =====");

  {
    resetCalls();
    const raider = makeMember("raider-1", { freshAcc: true });
    const guild = makeGuild({ membersMap: { "raider-1": raider } });
    const entry = {
      executor: raider,
      target: { type: "discord", id: "app-9", name: "Free Nitro Generator" },
    };
    for (let i = 0; i < 3; i++) await handleExternalApp(entry, guild);
    const skip = mutatedEvents().find((e) => (e.action || "").includes("bỏ qua"));
    check(!skip, "T1: app scam + acc mới đủ nghi vấn — không bị bỏ qua là 'bình thường'");
    const punished = mutatedEvents().find((e) => e.punish && e.punish !== "none");
    check(!!punished, "T1: có ghi nhận xử phạt khi score >= 4 + đủ ngưỡng");
    check(
      calls.kick.length + calls.ban.length + calls.timeout.length > 0,
      "T1: thành viên bị áp hình phạt thật",
    );
    const before = mutatedEvents().length;
    await handleExternalApp(entry, guild);
    check(
      mutatedEvents().length === before,
      "T1: dedupe — IntegrationCreate kế tiếp trong window không log vụ mới",
    );
  }

  {
    resetCalls();
    const user = makeMember("user-1");
    const guild = makeGuild({ membersMap: { "user-1": user } });
    const entry = { executor: user, target: { type: "twitch", id: "tw-1", name: "My Twitch" } };
    for (let i = 0; i < 3; i++) await handleExternalApp(entry, guild);
    check(mutatedEvents().length === 0, "T1: kết nối twitch/youtube bị bỏ qua hoàn toàn");
  }

  {
    resetCalls();
    const user = makeMember("user-2");
    const botMember = makeMember("app-bot-1", { bot: true });
    const guild = makeGuild({ membersMap: { "user-2": user, "app-bot-1": botMember } });
    const entry = { executor: user, target: { type: "discord", id: "app-bot-1", name: "SomeApp" } };
    for (let i = 0; i < 3; i++) await handleExternalApp(entry, guild);
    check(
      mutatedEvents().length === 0,
      "T1: app có bot thành viên server → bỏ qua (thuộc massBotAdd)",
    );
  }

  {
    resetCalls();
    const user = makeMember("user-3");
    const client2 = makeClient();
    client2.users.fetch = async () => ({
      bot: true,
      flags: { has: (f) => String(f) === String(1n << 16n) },
    });
    const guild = makeGuild({ membersMap: { "user-3": user } });
    guild.client = client2;
    const entry = {
      executor: user,
      target: { type: "discord", id: "verified-app", name: "VerifiedApp" },
    };
    for (let i = 0; i < 3; i++) await handleExternalApp(entry, guild);
    check(mutatedEvents().length === 0, "T1: bot xác minh (tick) không bị coi là external app");
  }

  {
    resetCalls();
    const owner = makeMember("owner-1", { freshAcc: true });
    const guild = makeGuild({ membersMap: { "owner-1": owner } });
    const entry = {
      executor: owner,
      target: { type: "discord", id: "app-x", name: "Free Nitro Generator" },
    };
    for (let i = 0; i < 3; i++) await handleExternalApp(entry, guild);
    check(
      mutatedEvents().every((e) => e.punish === "none" || !e.punish),
      "T1: owner không bị phạt (exempt)",
    );
  }

  // ==== TẦNG 2: handleExternalAppMessage (spam qua webhook/bot) ====
  console.log("\n===== TẦNG 2 — tin nhắn spam của app =====");

  function makeMsg(guild, { webhookId = null, content = "hello", embeds = [] } = {}) {
    return {
      guild,
      channel: { id: "ch-1", isDMBased: () => false, fetchWebhooks: async () => new Map() },
      author: {
        id: "author-1",
        bot: !webhookId ? true : false,
        username: webhookId ? "EvilApp" : "BotName",
      },
      webhookId,
      applicationId: null,
      content,
      embeds,
      components: [],
      id: "m" + Math.random().toString(36).slice(2),
      deletable: true,
      delete: async () => {
        calls.msgDeleted.push(1);
      },
      member: null,
    };
  }

  {
    resetCalls();
    const guild = makeGuild({ membersMap: {} });
    for (let i = 0; i < 5; i++) {
      await handleExternalAppMessage(
        makeMsg(guild, { webhookId: "wh-1", content: "FREE NITRO CLAIM NOW discord.gg/xyz" }),
      );
    }
    const evt = mutatedEvents().find((e) => e.module === "externalAppRaid");
    check(!!evt, "T2: webhook spam lặp nội dung + link mời bị phát hiện");
    const punishEvt = mutatedEvents().find((e) => e.punish && e.punish !== "none");
    check(!!punishEvt, "T2: ghi nhận xử lý (không chỉ bỏ qua)");
  }

  {
    resetCalls();
    const guild = makeGuild({ membersMap: {} });
    for (let i = 0; i < 4; i++) {
      const msg = makeMsg(guild, { webhookId: "wh-carl", content: "log entry " + i });
      msg.author.username = "Carl-bot";
      await handleExternalAppMessage(msg);
    }
    check(mutatedEvents().length === 0, "T2: bot logging hợp pháp (Carl-bot) không bị xử lý");
  }

  {
    resetCalls();
    const guild = makeGuild({ membersMap: {} });
    config = baseConfig({ whitelistUsers: ["wh-ok"] });
    for (let i = 0; i < 6; i++) {
      await handleExternalAppMessage(
        makeMsg(guild, { webhookId: "wh-ok", content: "FREE NITRO discord.gg/x spam " + i }),
      );
    }
    check(mutatedEvents().length === 0, "T2: app trong whitelist không bị xử lý");
    config = baseConfig();
  }

  // ==== TẦNG 2b: người tạo webhook CÓ QUYỀN → không phạt, nhưng PHẢI báo owner ====
  // Kẻ có quyền tạo webhook rồi spam: bot dọn tin + xoá webhook (đúng), nhưng
  // cố ý KHÔNG phạt để tránh phạt oan ⇒ trước đây im lặng tuyệt đối, kể cả DM
  // owner. Kẻ này xoá được cả kênh log nên DM là kênh duy nhất còn lại.
  {
    resetCalls();
    const { _ownerAlertForTest } = require("../bot/src/handlers/antinuke/ownerAlert");
    _ownerAlertForTest();
    const mod = makeMember("mod-1", { admin: true });
    const guild = makeGuild({ membersMap: { "mod-1": mod }, id: "g-wh-creator" });
    guild.fetchAuditLogs = async () => ({
      entries: [{ target: { id: "wh-creator" }, executor: { id: "mod-1", username: "mod-name" } }],
    });
    for (let i = 0; i < 4; i++) {
      const msg = makeMsg(guild, {
        webhookId: "wh-creator",
        content: "FREE NITRO CLAIM NOW discord.gg/xyz",
      });
      msg.channel.fetchWebhooks = async () => [
        {
          id: "wh-creator",
          delete: async () => {
            calls.webhookDeleted.push(1);
          },
        },
      ];
      await handleExternalAppMessage(msg);
    }
    check(
      calls.kick.length + calls.ban.length + calls.timeout.length === 0,
      "T2b: mod tạo webhook spam → bot không phạt oan chủ/mod hợp pháp",
    );
    check(calls.webhookDeleted.length > 0, "T2b: webhook của app vẫn bị xoá");
    await new Promise((r) => setImmediate(r));
    const dmTexts = calls.ownerDms.map((d) => d?.embeds?.[0]?.d?.description ?? "");
    check(
      dmTexts.some((t) => t.includes("mod-1") && t.includes("không phạt")),
      `T2b: DM owner nói rõ mod là thủ phạm + bot không phạt (dm=${calls.ownerDms.length}) — ${JSON.stringify(dmTexts[0]?.slice(0, 90))}`,
    );
  }

  // Raid app đã được AI/tín hiệu nội dung xác nhận → DM owner (đường tầng 2).
  {
    resetCalls();
    const { _ownerAlertForTest } = require("../bot/src/handlers/antinuke/ownerAlert");
    _ownerAlertForTest();
    const guild = makeGuild({ membersMap: {}, id: "g-app-raid-dm" });
    for (let i = 0; i < 5; i++) {
      await handleExternalAppMessage(
        makeMsg(guild, { webhookId: "wh-raid", content: "FREE NITRO CLAIM NOW discord.gg/xyz" }),
      );
    }
    await new Promise((r) => setImmediate(r));
    check(
      calls.ownerDms.length === 1,
      `T2c: app raid (spam lặp + link mời) → DM owner (dm=${calls.ownerDms.length})`,
    );
  }

  // Cooldown RIÊNG: DM thủ phạm-có-quyền không được nuốt mất DM raid (và ngược lại).
  {
    resetCalls();
    const {
      _ownerAlertForTest,
      EXEMPT_COOLDOWN_MS,
    } = require("../bot/src/handlers/antinuke/ownerAlert");
    const { COOLDOWN_MS } = require("../bot/src/handlers/antinuke/ownerAlert");
    _ownerAlertForTest();
    check(
      EXEMPT_COOLDOWN_MS > COOLDOWN_MS,
      "Cooldown: DM thủ phạm-có-quyền dài hơn DM raid (tín hiệu khác hẳn)",
    );
    const mod = makeMember("mod-1", { admin: true });
    const guild = makeGuild({ membersMap: { "mod-1": mod }, id: "g-cd-priv" });
    guild.fetchAuditLogs = async () => ({
      entries: [{ target: { id: "wh-cd" }, executor: { id: "mod-1", username: "mod-name" } }],
    });
    // Vụ 1: mod tạo webhook spam → báo "không phạt" (chiếm cooldown privileged).
    // Nội dung chỉ LẶP, không đủ tín hiệu raid (contentScore < 6) → không DM raid.
    // 4 tin = 2 vụ trigger (mẫu bị xoá sau mỗi vụ) → đủ ngưỡng cảnh báo miễn trừ.
    for (let i = 0; i < 4; i++) {
      const msg = makeMsg(guild, { webhookId: "wh-cd", content: "ping ping ping" });
      msg.channel.fetchWebhooks = async () => [{ id: "wh-cd", delete: async () => {} }];
      await handleExternalAppMessage(msg);
    }
    await new Promise((r) => setImmediate(r));
    const privDm = calls.ownerDms[0]?.embeds?.[0]?.d?.description ?? "";
    check(
      calls.ownerDms.length === 1 && privDm.includes("không phạt"),
      `Cooldown: vụ thường chỉ gửi DM privileged, không tạo DM raid (dm=${calls.ownerDms.length}) — ${JSON.stringify(privDm.slice(0, 90))}`,
    );
    // Vụ 2: app raid khác webhook, CÙNG guild, ngay sau đó → DM raid vẫn phải qua.
    resetCalls();
    const guild2 = makeGuild({ membersMap: {}, id: "g-cd-priv" });
    for (let i = 0; i < 5; i++) {
      await handleExternalAppMessage(
        makeMsg(guild2, { webhookId: "wh-raid2", content: "FREE NITRO CLAIM NOW discord.gg/xyz" }),
      );
    }
    await new Promise((r) => setImmediate(r));
    const raidDm = calls.ownerDms[0]?.embeds?.[0]?.d?.description ?? "";
    check(
      calls.ownerDms.length === 1 &&
        (calls.ownerDms[0]?.embeds?.[0]?.d?.title ?? "").includes("đang bị tấn công"),
      `Cooldown: DM raid không bị DM privileged nuốt (dm=${calls.ownerDms.length}) — ${JSON.stringify(raidDm.slice(0, 100))}`,
    );
  }

  // ==== TẦNG 3: handleButtonRaid ====
  console.log("\n===== TẦNG 3 — bấm nút spam trên tin app =====");

  function makeInteraction(guild, { userId = "clicker-1", msgId = "m-1" } = {}) {
    return {
      isMessageComponent: () => true,
      inGuild: () => true,
      guild,
      user: { id: userId, username: userId + "-u" },
      message: {
        id: msgId,
        webhookId: "wh-bait",
        author: { username: "BaitApp" },
        components: [{ components: [{ type: 2, label: "Claim", customId: "c1" }] }],
        channel: { id: "ch-9" },
        deletable: true,
        delete: async () => {
          calls.msgDeleted.push(1);
        },
      },
    };
  }

  {
    resetCalls();
    const clicker = makeMember("clicker-1");
    const guild = makeGuild({ membersMap: { "clicker-1": clicker } });
    for (let i = 0; i < 4; i++) {
      await handleButtonRaid(makeInteraction(guild, { userId: "clicker-1", msgId: "m-spam" }));
    }
    const evt = mutatedEvents().find((e) => e.module === "externalAppRaid");
    check(!!evt, "T3: spam bấm nút (4 lượt cùng người) bị phát hiện");
    check(calls.msgDeleted.length >= 1, "T3: tin mồi bị xóa");
    check(
      calls.kick.length + calls.ban.length + calls.timeout.length > 0,
      "T3: kẻ spam bấm bị phạt",
    );
    check(
      !mutatedEvents().some((e) => (e.action || "").includes("làn sóng")),
      "T3: AI offline → không khóa kênh chỉ vì bấm nhiều",
    );
    const before = mutatedEvents().length;
    await handleButtonRaid(makeInteraction(guild, { userId: "clicker-2", msgId: "m-spam" }));
    check(
      mutatedEvents().length === before,
      "T3: debounce — vụ đã xử lý trong window không kích hoạt lại",
    );
  }

  {
    resetCalls();
    const guild = makeGuild({ membersMap: {} });
    const inter = makeInteraction(guild, { userId: "u-1", msgId: "m-clean" });
    inter.message.webhookId = null;
    for (let i = 0; i < 4; i++) await handleButtonRaid(inter);
    check(
      mutatedEvents().length === 0,
      "T3: nút bấm trên tin bot được mời (không phải webhook) không bị soi",
    );
  }

  {
    resetCalls();
    // Minigame: 8 người khác nhau bấm tin app — AI offline + không spamClicker → bỏ qua
    const guild = makeGuild({ membersMap: {} });
    for (let i = 0; i < 8; i++) {
      await handleButtonRaid(makeInteraction(guild, { userId: "user-" + i, msgId: "m-game" }));
    }
    const evt = mutatedEvents().find((e) => e.module === "externalAppRaid");
    check(
      !evt || evt.punish === "none",
      "T3: minigame đông người bấm — AI offline → không phạt/khóa kênh oan",
    );
  }

  // ==== TẦNG 3b: kẻ spam bấm nút CÓ QUYỀN → không phạt, nhưng PHẢI báo owner ====
  {
    resetCalls();
    const { _ownerAlertForTest } = require("../bot/src/handlers/antinuke/ownerAlert");
    _ownerAlertForTest();
    const mod = makeMember("mod-1", { admin: true });
    const guild = makeGuild({ membersMap: { "mod-1": mod }, id: "g-btn-mod" });
    // 2 tin mồi khác nhau × 4 lượt bấm = 2 vụ trigger (đủ ngưỡng exempt).
    for (const msgId of ["m-mod-1", "m-mod-2"]) {
      for (let i = 0; i < 4; i++) {
        await handleButtonRaid(makeInteraction(guild, { userId: "mod-1", msgId }));
      }
    }
    check(
      calls.kick.length + calls.ban.length + calls.timeout.length === 0,
      "T3b: mod spam bấm nút → bot không phạt oan",
    );
    await new Promise((r) => setImmediate(r));
    const dmTexts = calls.ownerDms.map((d) => d?.embeds?.[0]?.d?.description ?? "");
    check(
      dmTexts.some((t) => t.includes("mod-1") && t.includes("không phạt")),
      `T3b: DM owner nói rõ mod spam bấm + bot không phạt (dm=${calls.ownerDms.length}) — ${JSON.stringify(dmTexts[0]?.slice(0, 90))}`,
    );
  }

  // ==== TẦNG 1b: người có quyền nối loạt app → KHÔNG được im lặng ====
  // Trước đây `isExempt(em) → return` im lặng tuyệt đối: mod có quyền nối 20 app
  // trong cửa sổ thì không sự kiện, không log, không DM owner. Đây là vector nuke
  // không cần mời bot, và kẻ có quyền xoá được cả kênh log lẫn tự gỡ app —
  // owner chỉ có thể biết qua DM.
  {
    resetCalls();
    const { _ownerAlertForTest } = require("../bot/src/handlers/antinuke/ownerAlert");
    _ownerAlertForTest();
    const mod = makeMember("mod-1", { admin: true });
    // Guild RIÊNG: bucket đếm nhóm miễn trừ và cooldown DM đều khoá theo guildId.
    const guild = makeGuild({ membersMap: { "mod-1": mod }, id: "g-dm-alert" });
    // executor từ audit log là User thô (có .username), không phải GuildMember.
    const exec = { id: "mod-1", bot: false, username: "mod-name" };
    for (let i = 0; i < 3; i++) {
      await handleExternalApp(
        { executor: exec, target: { type: "discord", id: "app-" + i, name: "App " + i } },
        guild,
      );
    }
    await new Promise((r) => setImmediate(r));
    check(
      calls.kick.length + calls.ban.length + calls.timeout.length === 0,
      "T1b: mod được miễn — bot không phạt (không phạt oan chủ/mod hợp pháp)",
    );
    check(
      calls.ownerDms.length === 1,
      `T1b: mod nối loạt app vượt ngưỡng → DM owner (ownerDms=${calls.ownerDms.length})`,
    );
    const dmText = calls.ownerDms[0]?.embeds?.[0]?.d?.description ?? "";
    check(
      dmText.includes("mod-1") && dmText.includes("không phạt"),
      `T1b: DM ghi rõ thủ phạm + nói bot không phạt — ${JSON.stringify(dmText)}`,
    );
  }

  // Dưới ngưỡng thì chưa DM — tránh spam owner khi mod dùng app bình thường.
  {
    resetCalls();
    const { _ownerAlertForTest } = require("../bot/src/handlers/antinuke/ownerAlert");
    _ownerAlertForTest();
    const mod = makeMember("mod-1", { admin: true });
    const guild = makeGuild({ membersMap: { "mod-1": mod }, id: "g-dm-below" });
    const exec = { id: "mod-1", bot: false, username: "mod-name" };
    await handleExternalApp(
      { executor: exec, target: { type: "discord", id: "app-1", name: "App 1" } },
      guild,
    );
    await new Promise((r) => setImmediate(r));
    check(
      calls.ownerDms.length === 0,
      `T1b: dưới ngưỡng → không DM owner (ownerDms=${calls.ownerDms.length})`,
    );
  }

  // ==== TẦNG 1c: AI TRẢ LỜI — nhánh phạt theo cấu hình + debounce đặt TRƯỚC AI ====
  // Nhánh `else` (AI không khẳng định raid → phạt theo cấu hình) chưa hề chạy:
  // mọi case cũ đều rơi vào ban. Đồng thời kiểm tra debounce "1 làn sóng = 1 vụ"
  // có chặn AI hay không — đặt sau lệnh gọi AI thì mỗi IntegrationCreate trong
  // cùng cửa sổ vẫn tốn trọn 1 lượt gọi AI rồi mới bị bỏ.
  console.log("\n===== TẦNG 1c — AI trả lời (phạt theo cấu hình) =====");

  const aiProbe = { calls: 0 };
  let aiReply = { offline: false, isRaid: true, confidence: 0.9, reason: "phối hợp rõ ràng" };
  const state2 = createState({ client, store });
  const fakeAi = {
    ...createAi({ state: state2 }),
    aiAnalyzeExternalApp: async () => {
      aiProbe.calls += 1;
      return aiReply;
    },
  };
  const ext2 = createExternalApp({
    client,
    store,
    heat,
    state: state2,
    core: createEnforce({ client, store, heat, state: state2 }),
    ai: fakeAi,
    raidIntel: createRaidIntel({ client, store, ai: fakeAi }),
  });

  {
    resetCalls();
    aiProbe.calls = 0;
    aiReply = { offline: false, isRaid: true, confidence: 0.9, reason: "phối hợp rõ ràng" };
    const raider = makeMember("raider-ai", { freshAcc: true });
    const guild = makeGuild({ membersMap: { "raider-ai": raider }, id: "g-ai-raid" });
    const entry = {
      executor: raider,
      target: { type: "discord", id: "app-ai", name: "Free Nitro Generator" },
    };
    for (let i = 0; i < 3; i++) await ext2.handleExternalApp(entry, guild);
    check(calls.ban.length === 1, `T1c: AI khẳng định raid → ban 1 lần (ban=${calls.ban.length})`);
    check(
      mutatedEvents().some((e) => (e.action || "").includes("đã ban (AI: raid)")),
      "T1c: nhãn kết quả ghi rõ AI xác nhận raid",
    );
    check(
      aiProbe.calls === 1,
      `T1c: 3 kết nối app trong 1 cửa sổ chỉ gọi AI 1 lần (gọi=${aiProbe.calls})`,
    );
  }

  {
    // SONG SONG, không phải tuần tự. Case T1c trên dùng `await` từng lần nên
    // luôn kịp đánh dấu trước lần sau — còn raid thật thì Discord bắn hàng
    // chục IntegrationCreate gần như cùng lúc, và trong lúc bot đang CHỜ AI
    // (tới 6s) thì debounce chưa được đánh dấu → mỗi lần đều tốn 1 lượt AI.
    resetCalls();
    aiProbe.calls = 0;
    aiReply = { offline: false, isRaid: true, confidence: 0.9, reason: "phối hợp rõ ràng" };
    const raider = makeMember("raider-par", { freshAcc: true });
    const guild = makeGuild({ membersMap: { "raider-par": raider }, id: "g-par" });
    const entry = {
      executor: raider,
      target: { type: "discord", id: "app-par", name: "Free Nitro Generator" },
    };
    // Treo lời gọi AI để cả 3 lần kịp chạy tới chỗ gọi AI như raid thật.
    let release;
    const gate = new Promise((r) => (release = r));
    const savedAi = fakeAi.aiAnalyzeExternalApp;
    fakeAi.aiAnalyzeExternalApp = async () => {
      aiProbe.calls += 1;
      await gate;
      return aiReply;
    };
    const pending = [
      ext2.handleExternalApp(entry, guild),
      ext2.handleExternalApp(entry, guild),
      ext2.handleExternalApp(entry, guild),
    ];
    for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
    release();
    await Promise.all(pending);
    fakeAi.aiAnalyzeExternalApp = savedAi;
    check(
      aiProbe.calls === 1,
      `T1c-đồng thời: 3 kết nối SONG SONG chỉ gọi AI 1 lần (gọi=${aiProbe.calls})`,
    );
    check(
      calls.ban.length === 1,
      `T1c-đồng thời: chỉ ban 1 lần, không ban lặp (ban=${calls.ban.length})`,
    );
  }

  {
    // AI nghi raid nhưng TIN CẬY THẤP (0.4 < 0.6) → không được tự ý ban, chỉ
    // phạt theo cấu hình. Đây là ranh giới an toàn quan trọng: AI sai/kẻ độc
    // gắn nhãn raid thì người dùng vẫn chỉ bị kick theo đúng cấu hình server.
    resetCalls();
    aiProbe.calls = 0;
    aiReply = { offline: false, isRaid: true, confidence: 0.4, reason: "chưa đủ bằng chứng" };
    const u = makeMember("user-low", { freshAcc: true });
    const guild = makeGuild({ membersMap: { "user-low": u }, id: "g-ai-low" });
    const entry = {
      executor: u,
      target: { type: "discord", id: "app-low", name: "Free Nitro Generator" },
    };
    for (let i = 0; i < 2; i++) await ext2.handleExternalApp(entry, guild);
    check(calls.ban.length === 0, "T1c: AI nghi raid nhưng tin cậy thấp → KHÔNG ban");
    check(
      calls.kick.length === 1,
      `T1c: thay vào đó phạt đúng mức cấu hình (kick=${calls.kick.length})`,
    );
    const evt = mutatedEvents().find((e) => e.punish === "kick");
    check(
      !!evt && !(evt.action || "").includes("(raid)"),
      `T1c: sự kiện ghi punish=kick, không gắn nhãn raid — ${JSON.stringify(evt?.action?.slice(0, 60))}`,
    );
  }

  {
    // Ban thất bại (thiếu quyền Ban Members) → phải ghi rõ, không nuốt im lặng
    // và không làm hỏng cả vụ (case log/DM/log vẫn chạy tiếp).
    resetCalls();
    aiProbe.calls = 0;
    aiReply = { offline: false, isRaid: true, confidence: 0.9, reason: "phối hợp rõ ràng" };
    const u = makeMember("user-noban", { freshAcc: true });
    u.ban = async () => {
      throw new Error("Missing Permissions");
    };
    const guild = makeGuild({ membersMap: { "user-noban": u }, id: "g-ban-fail" });
    const entry = {
      executor: u,
      target: { type: "discord", id: "app-nb", name: "Free Nitro Generator" },
    };
    await ext2.handleExternalApp(entry, guild);
    check(
      mutatedEvents().some((e) => (e.action || "").includes("không thể ban")),
      "T1c: ban thất bại → sự kiện ghi 'không thể ban' thay vì im lặng",
    );
    check(calls.ban.length === 0, "T1c: ban thất bại không được tính là đã ban");
  }

  // ==== TẦNG 3c: nút bấm + AI khẳng định raid → MỚI khóa kênh ====
  // Ngược lại với TẦNG 3 (AI offline → không khóa), khi AI chắc chắn raid thì
  // làn sóng bấm nút phải khóa kênh + ghi sự kiện + DM owner.
  console.log("\n===== TẦNG 3c — nút bấm, AI xác nhận raid → khóa kênh =====");

  {
    resetCalls();
    aiProbe.calls = 0;
    aiReply = { offline: false, isRaid: true, confidence: 0.95, reason: "mồi raid rõ ràng" };
    const { _ownerAlertForTest } = require("../bot/src/handlers/antinuke/ownerAlert");
    _ownerAlertForTest();
    config = baseConfig({ lockdownEnabled: true, lockdownMinutes: 5 });
    const guild = makeGuild({ membersMap: {}, id: "g-btn-lock" });
    // Guild khóa được: bot có ManageChannels + có kênh text để edit overwrite.
    guild.members.fetchMe = async () => ({ permissions: { has: () => true } });
    guild.roles.everyone = { id: "@everyone" };
    guild.channels.cache = new Map([
      [
        "ch-lock",
        {
          id: "ch-lock",
          isTextBased: () => true,
          isThread: () => false,
          isVoiceBased: () => false,
          permissionOverwrites: {
            edit: async () => {
              calls.lockdown.push(1);
            },
          },
        },
      ],
    ]);
    for (let i = 0; i < 6; i++) {
      await ext2.handleButtonRaid(makeInteraction(guild, { userId: "u-" + i, msgId: "m-lock" }));
    }
    check(calls.msgDeleted.length >= 1, "T3c: AI xác nhận raid → xoá tin mồi chứa nút bấm");
    check(
      calls.lockdown.length > 0,
      `T3c: AI xác nhận raid + làn sóng bấm → KHOÁ KÊNH (số kênh=${calls.lockdown.length})`,
    );
    const evt = mutatedEvents().find((e) => (e.action || "").includes("làn sóng"));
    check(!!evt, "T3c: sự kiện ghi nhận làn sóng bấm nút");
    await new Promise((r) => setImmediate(r));
    check(
      calls.ownerDms.length === 1,
      `T3c: nút bấm raid → DM owner (dm=${calls.ownerDms.length})`,
    );
    config = baseConfig();
  }

  {
    // AI nói rõ KHÔNG phải raid (tin cậy >= 0.5) → kể cả kẻ spam bấm 4 lượt
    // cũng chỉ ghi nhận, không phạt — minigame/giveaway hợp pháp.
    resetCalls();
    aiProbe.calls = 0;
    aiReply = { offline: false, isRaid: false, confidence: 0.8, reason: "hoạt động bình thường" };
    const clicker = makeMember("clicker-safe", { freshAcc: true });
    const guild = makeGuild({ membersMap: { "clicker-safe": clicker }, id: "g-btn-notraid" });
    for (let i = 0; i < 4; i++) {
      await ext2.handleButtonRaid(
        makeInteraction(guild, { userId: "clicker-safe", msgId: "m-notraid" }),
      );
    }
    check(
      calls.kick.length + calls.ban.length + calls.timeout.length === 0,
      "T3c: AI nói không phải raid → không phạt kẻ bấm nút",
    );
    check(
      mutatedEvents().some((e) => (e.action || "").includes("bỏ qua")),
      "T3c: vụ bị bỏ qua vẫn được ghi nhận để chủ server thấy",
    );
  }

  console.log(`\nKết quả: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
