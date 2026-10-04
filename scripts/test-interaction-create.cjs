// Test interactionCreate.js — toàn bộ luồng tương tác:
//   - nút verify_request_captcha (captcha DM) + verify_confirm (xác minh + alt gate)
//   - lệnh slash: report, research, ping, help, prefix, autoreply, badword, heat,
//     antinuke, mod, giveaway, reactionrole, backup, verify, setup, alt
//   - phân quyền (needPerm) + bắt lỗi từng nhánh
// Mock discord.js + mọi module phụ thuộc; không mạng, không Discord thật.
// Chạy: node scripts/test-interaction-create.cjs
const path = require("path");
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
  constructor(data = {}) { this.data = { ...data }; this.d = this.data; }
  setColor(c) { this.data.color = c; return this; }
  setTitle(t) { this.data.title = t; return this; }
  setDescription(t) { this.data.description = t; return this; }
  addFields(...f) { this.data.fields = [...(this.data.fields ?? []), ...f.flat(Infinity)]; return this; }
  setTimestamp() { return this; }
  setFooter(f) { this.data.footer = f; return this; }
  setThumbnail() { return this; }
}
class ActionRowBuilder { constructor() { this.components = []; } addComponents(...c) { this.components.push(...c.flat(Infinity)); return this; } }
class ButtonBuilder { setCustomId(v){this.customId=v;return this;} setLabel(v){this.label=v;return this;} setStyle(v){this.style=v;return this;} }
class ModalBuilder {
  constructor() { this.components = []; }
  setCustomId(v){this.customId=v;return this;} setTitle(v){this.title=v;return this;}
  addComponents(...c){this.components.push(...c.flat(Infinity));return this;}
}
class TextInputBuilder {
  setCustomId(v){this.customId=v;return this;} setLabel(v){this.label=v;return this;}
  setStyle(v){this.style=v;return this;} setRequired(v){this.required=v;return this;}
  setMaxLength(v){this.maxLength=v;return this;} setPlaceholder(v){this.placeholder=v;return this;}
}
module.exports = {
  Colors: new Proxy({}, { get: () => 0x000000 }),
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ModalBuilder, TextInputBuilder,
  ButtonStyle: { Primary: 1, Success: 2, Danger: 3, Secondary: 4 },
  TextInputStyle: { Short: 1, Paragraph: 2 },
  ChannelType: { GuildText: 0, GuildCategory: 4 },
  PermissionFlagsBits: new Proxy({}, { get: () => 1n << 4n }),
  Partials: {},
  GatewayIntentBits: new Proxy({}, { get: () => 0 }),
};
`,
);

// ── Trạng thái điều khiển từ test ──
const ctl = {
  perms: { manage: true, admin: false, mod: true },
  isLocked: false,
  unlockGuildCalls: 0,
  parseDuration: (s) => (/^(\d+)m$/.test(s || "") ? parseInt(s, 10) : null),
  actionThrows: false,
  /** Kết quả mutation tuỳ chỉnh (mặc định { ok: true }) — vd botSetBackupRetention trả quy tắc đã chặn. */
  mutationResult: null,
  reportInteractive: null,
  handleResearch: null,
};
const calls = {
  mutations: [],
  queries: [],
  markLocked: [],
  captchaSet: [],
  dms: [],
};

const utilMock = {
  canManageGuild: () => ctl.perms.manage,
  isAdmin: () => ctl.perms.admin,
  canManageWithConfig: () => ctl.perms.manage,
  fillPlaceholders: (t, a) => t.replaceAll("{user}", `<@${a.id}>`),
  logEmbed: (o) => ({ data: o }),
  async sendLog() {},
  async sendModLog() {},
};
const lockdownMock = {
  isLocked: () => ctl.isLocked,
  markLocked: (id) => calls.markLocked.push(id),
  async unlockGuild() {
    ctl.unlockGuildCalls++;
    ctl.isLocked = false;
  },
};
const hiddenMock = { emojiKeyOf: (e) => String(e).trim() };
const modToolsMock = {
  parseDuration: (s) => ctl.parseDuration(s),
  canMod: () => ctl.perms.mod,
  async timeoutMember() {
    if (ctl.actionThrows) throw new Error("timeout fail");
    return "timeout OK";
  },
  async kickMember() {
    if (ctl.actionThrows) throw new Error("kick fail");
    return "kick OK";
  },
  async banMember() {
    if (ctl.actionThrows) throw new Error("ban fail");
    return "ban OK";
  },
  async purgeChannel() {
    if (ctl.actionThrows) throw new Error("purge fail");
    return "purge OK";
  },
  async untimeoutMember() {
    if (ctl.actionThrows) throw new Error("untimeout fail");
    return "untimeout OK";
  },
  async unbanMember() {
    if (ctl.actionThrows) throw new Error("unban fail");
    return "unban OK";
  },
  async unwarnMember() {
    if (ctl.actionThrows) throw new Error("unwarn fail");
    return "unwarn OK";
  },
};
const captchaMock = {
  genCaptcha: () => "123456",
  setCode: (g, u, c) => calls.captchaSet.push({ g, u, c }),
};
let altAnalysis = { riskScore: 0, action: "pass", riskFactors: [] };
let punishResult = { executed: false };
let altAnalysisCalls = 0;
const altMock = {
  analyzeNewMember: async () => {
    altAnalysisCalls++;
    if (ctl.altAnalysisThrows) throw new Error("AI analysis fail");
    return altAnalysis;
  },
  executePunishment: async () => punishResult,
  buildRiskEmbed: () => ({
    data: {},
    setTitle() {
      return this;
    },
    setDescription() {
      return this;
    },
  }),
};

const origLoad = Module._load;
Module._load = function (request, parent) {
  // Sau #5 tách monolith (03/10/2026), code của interactionCreate nằm trong
  // "họ" module interaction* (interactionCreate + interactionVerify /
  // TicketFlow / Cmd* / Common) — mock phủ cả họ, cùng ngữ nghĩa: mọi require
  // của code handler đều nhận mock như trước khi tách.
  const fromIC = parent && /handlers[\\/]interaction[A-Za-z]*\.js$/.test(parent.filename);
  if (fromIC) {
    if (request === "../util") return utilMock;
    if (request === "../lockdown") return lockdownMock;
    if (request === "./hidden") return hiddenMock;
    if (request === "./modTools") return modToolsMock;
    if (request === "../captchaStore") return captchaMock;
    if (request === "../altDetection") return altMock;
    if (request === "./incidentReport") {
      return { reportInteractive: (...a) => ctl.reportInteractive(...a) };
    }
    if (request === "./researchCommands") {
      return { handleResearch: (...a) => ctl.handleResearch(...a) };
    }
  }
  return origLoad.apply(this, arguments);
};

(async () => {
  const onInteractionCreate = require("../bot/src/handlers/interactionCreate");

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

  const configs = new Map();
  const store = {
    getConfig: async (guildId) => configs.get(guildId) ?? null,
    invalidate: () => {},
    client: {
      mutation: async (name, args) => {
        calls.mutations.push({ name, args });
        if (name === "hidden:botGiveawayEndNow") return { ok: ctl.giveawayEndOk !== false };
        if (ctl.mutationResult) return ctl.mutationResult;
        return { ok: true };
      },
      query: async (name) => {
        calls.queries.push(name);
        return ctl.queryResult ?? null;
      },
    },
  };
  const heat = {};
  const client = { ws: { ping: 42 }, query: async () => ctl.queryResult ?? null };

  const replies = [];
  const shownModals = [];
  const responses = [];
  function reset() {
    calls.mutations.length = 0;
    calls.queries.length = 0;
    calls.markLocked.length = 0;
    calls.captchaSet.length = 0;
    calls.dms.length = 0;
    shownModals.length = 0;
    replies.length = 0;
    responses.length = 0;
    ctl.perms = { manage: true, admin: false, mod: true };
    ctl.isLocked = false;
    ctl.unlockGuildCalls = 0;
    ctl.actionThrows = false;
    ctl.queryResult = null;
    ctl.mutationResult = null;
    ctl.giveawayEndOk = true;
    ctl.altAnalysisThrows = false;
    altAnalysis = { riskScore: 0, action: "pass", riskFactors: [] };
    punishResult = { executed: false };
    altAnalysisCalls = 0;
  }

  function mkMember(id = "u1", { hasUnverified = true } = {}) {
    return {
      id,
      user: { id, username: "nguoidung" },
      roles: {
        cache: { has: (rid) => (rid === "r-unv" ? hasUnverified : false) },
        add: async () => {},
        remove: async () => {},
      },
      send: async (p) => calls.dms.push(p),
    };
  }
  function mkGuild(id = "g1", member = mkMember()) {
    return {
      id,
      name: "Server " + id,
      iconURL: () => null,
      members: {
        cache: new Map([[member.id, member]]),
        fetch: async () => member,
      },
      channels: { cache: new Map() },
      roles: { cache: { find: () => null } },
    };
  }

  function mkInteraction(opts = {}) {
    const member = opts.member ?? mkMember();
    const guild = opts.guild ?? mkGuild(opts.guildId ?? "g1", member);
    const interaction = {
      user: opts.user ?? { id: member.id, username: "nguoidung" },
      member: opts.memberOverride ?? { permissions: { has: () => ctl.perms.manage } },
      guild: opts.noGuild ? null : guild,
      channel: opts.channel ?? { id: "c1", name: "chung", toString: () => "#chung" },
      isButton: () => !!opts.isButton,
      isChatInputCommand: () => !!opts.isChatInputCommand,
      // discord.js luôn có đủ các predicate này trên Interaction; mock thiếu
      // thì handler gọi tới sẽ ném TypeError và làm cả suite đỏ.
      isModalSubmit: () => !!opts.isModalSubmit,
      // discord.js luôn có predicate này; thiếu thì handler autocomplete gọi tới
      // sẽ ném TypeError và làm cả suite đỏ.
      isAutocomplete: () => !!opts.isAutocomplete,
      customId: opts.customId,
      commandName: opts.commandName,
      replied: false,
      reply: async (payload) => {
        replies.push(payload);
        interaction.replied = true;
        return {};
      },
      // discord.js cho phép 1 interaction chỉ hồi đáp 1 lần. Mock các hàm còn
      // lại để handler nào gọi tới cũng không ném TypeError (đã xảy ra).
      deferReply: async (payload) => {
        interaction.deferred = true;
        if (payload) replies.push({ ...payload, deferred: true });
        return {};
      },
      editReply: async (payload) => {
        replies.push({ ...payload, edited: true });
        return {};
      },
      showModal: async (modal) => {
        shownModals.push(modal);
        interaction.replied = true;
        return {};
      },
      // Autocomplete: `respond(choices)` là hàm ở CẤP interaction (không phải
      // trong options). Đặt nhầm trong options → handler gọi tới ném TypeError.
      respond: async (choices) => {
        responses.push(choices);
        interaction.replied = true;
        return {};
      },
      options: {
        getSubcommand: () => opts.subcommand,
        getString: (name, req) => {
          const v = opts.strings?.[name];
          if (v === undefined && req) throw new Error(`missing ${name}`);
          return v ?? null;
        },
        getInteger: (name) => opts.integers?.[name] ?? null,
        getBoolean: (name) => opts.booleans?.[name] ?? null,
        getMember: (name) => opts.members?.[name] ?? null,
        getUser: (name) => opts.users?.[name] ?? null,
        getRole: (name) => opts.roles?.[name] ?? null,
        getChannel: (name) => opts.channels?.[name] ?? null,
        // Autocomplete: `getFocused(true)` trả { name, value } (discord.js v14).
        getFocused: (full) =>
          full
            ? { name: opts.focusedName, value: opts.focusedValue ?? "" }
            : (opts.focusedValue ?? ""),
      },
    };
    return interaction;
  }

  const run = (opts) => onInteractionCreate(client, mkInteraction(opts), store, heat);

  // ══════════════════ NÚT BẤM ══════════════════

  // ── 1. verify_request_captcha ──
  {
    reset();
    await run({ isButton: true, customId: "verify_request_captcha", noGuild: true });
    check("captcha: không guild → im lặng", replies.length === 0);

    reset();
    configs.set("g1", { verifyEnabled: false });
    await run({ isButton: true, customId: "verify_request_captcha" });
    check("captcha: verify tắt → từ chối", replies[0].content.includes("đã bị tắt"));

    reset();
    configs.set("g1", { verifyEnabled: true });
    await run({ isButton: true, customId: "verify_request_captcha" });
    check("captcha: thiếu role → từ chối", replies[0].content.includes("Chưa cấu hình role"));

    reset();
    configs.set("g1", { verifyEnabled: true, unverifiedRoleId: "r-unv" });
    const noMemberGuild = mkGuild("g1", mkMember());
    noMemberGuild.members.cache = new Map();
    noMemberGuild.members.fetch = async () => null;
    await run({ isButton: true, customId: "verify_request_captcha", guild: noMemberGuild });
    check(
      "captcha: không tìm thấy member → từ chối",
      replies[0].content.includes("Không tìm thấy"),
    );

    reset();
    await run({
      isButton: true,
      customId: "verify_request_captcha",
      member: mkMember("u1", { hasUnverified: false }),
    });
    check("captcha: đã xác minh rồi → thông báo", replies[0].content.includes("đã xác minh rồi"));

    reset();
    await run({ isButton: true, customId: "verify_request_captcha" });
    check(
      "captcha: thành công → set mã + gửi DM",
      calls.captchaSet.length === 1 &&
        calls.dms.length === 1 &&
        replies[0].content.includes("Đã gửi mã"),
    );

    reset();
    const noDmMember = mkMember();
    noDmMember.send = async () => {
      throw new Error("DM đóng");
    };
    await run({ isButton: true, customId: "verify_request_captcha", member: noDmMember });
    check(
      "captcha: không gửi được DM → hướng dẫn bật DM",
      replies[0].content.includes("cho phép tin nhắn trực tiếp"),
    );

    // Rate-limit 3 lần/10 phút: lần thứ 4 phải chặn và KHÔNG gửi thêm DM —
    // thiếu chặn này bot thành "vòi" DM cho kẻ bấm nút liên tục.
    reset();
    const spamMember = mkMember("spam1");
    const spamUser = { id: "spam1", username: "spam" };
    for (let i = 0; i < 3; i++) {
      await run({
        isButton: true,
        customId: "verify_request_captcha",
        member: spamMember,
        user: spamUser,
      });
    }
    const dmsBefore = calls.dms.length;
    await run({
      isButton: true,
      customId: "verify_request_captcha",
      member: spamMember,
      user: spamUser,
    });
    check(
      "captcha: bấm quá 3 lần/10 phút → chặn, không gửi thêm DM",
      calls.dms.length === dmsBefore &&
        replies[replies.length - 1].content.includes("quá nhiều lần"),
    );
  }

  // ── 2. verify_confirm ──
  {
    reset();
    await run({ isButton: true, customId: "verify_confirm", noGuild: true });
    check("confirm: không guild → im lặng", replies.length === 0);

    reset();
    configs.set("g1", { verifyEnabled: false });
    await run({ isButton: true, customId: "verify_confirm" });
    check("confirm: verify tắt → từ chối", replies[0].content.includes("đã bị tắt"));

    reset();
    configs.set("g1", { verifyEnabled: true, unverifiedRoleId: "r-unv" });
    await run({ isButton: true, customId: "verify_confirm" });
    check(
      "confirm: thiếu verified role → từ chối",
      replies[0].content.includes("Chưa cấu hình role"),
    );

    reset();
    configs.set("g1", { verifyEnabled: true, unverifiedRoleId: "r-unv", verifiedRoleId: "r-ver" });
    const confirmNoMemberGuild = mkGuild("g1", mkMember());
    confirmNoMemberGuild.members.cache = new Map();
    confirmNoMemberGuild.members.fetch = async () => null;
    await run({ isButton: true, customId: "verify_confirm", guild: confirmNoMemberGuild });
    check(
      "confirm: không tìm thấy member → từ chối, không kẹt",
      replies[0].content.includes("Không tìm thấy"),
    );

    reset();
    configs.set("g1", {
      verifyEnabled: true,
      unverifiedRoleId: "r-unv",
      verifiedRoleId: "r-ver",
      altDetectionEnabled: true,
    });
    await run({
      isButton: true,
      customId: "verify_confirm",
      member: mkMember("u1", { hasUnverified: false }),
    });
    check(
      "confirm: thiếu role chưa xác minh → chặn trước analysis/grant",
      replies[0].content.includes("role chưa xác minh") &&
        altAnalysisCalls === 0 &&
        calls.mutations.length === 0,
    );

    reset();
    configs.set("g1", { verifyEnabled: true, unverifiedRoleId: "r-unv", verifiedRoleId: "r-ver" });
    await run({ isButton: true, customId: "verify_confirm" });
    check(
      "confirm: xác minh bình thường → thành công",
      replies[0].content.includes("Đã xác minh thành công"),
    );

    reset();
    configs.set("g1", {
      verifyEnabled: true,
      unverifiedRoleId: "r-unv",
      verifiedRoleId: "r-ver",
      verifyWelcomeEnabled: true,
      verifyWelcomeTitle: "Chào {user}",
    });
    await run({ isButton: true, customId: "verify_confirm" });
    check("confirm: bật DM chào mừng → gửi DM", calls.dms.length === 1);

    // Alt chặn
    reset();
    configs.set("g1", {
      verifyEnabled: true,
      unverifiedRoleId: "r-unv",
      verifiedRoleId: "r-ver",
      altDetectionEnabled: true,
      altMaxRiskScore: 70,
    });
    altAnalysis = { riskScore: 95, action: "ban", riskFactors: ["acc mới"] };
    punishResult = { executed: true, action: "ban" };
    await run({ isButton: true, customId: "verify_confirm" });
    check(
      "confirm: alt rủi ro cao → từ chối + đánh dấu",
      replies[0].content.includes("Xác minh bị từ chối") &&
        calls.mutations.some((m) => m.name === "altDetection:markJoinPunished"),
    );

    // Alt phạt thất bại → fail-open
    reset();
    configs.set("g1", {
      verifyEnabled: true,
      unverifiedRoleId: "r-unv",
      verifiedRoleId: "r-ver",
      altDetectionEnabled: true,
      altMaxRiskScore: 70,
    });
    altAnalysis = { riskScore: 95, action: "ban", riskFactors: ["acc mới"] };
    punishResult = { executed: false, reason: "thiếu quyền" };
    await run({ isButton: true, customId: "verify_confirm" });
    check(
      "confirm: phạt thất bại → fail-open cho xác minh",
      replies[0].content.includes("Đã xác minh thành công"),
    );

    // AI phân tích lỗi → fail-open: vẫn cho xác minh (không để người dùng kẹt)
    reset();
    ctl.altAnalysisThrows = true;
    configs.set("g1", {
      verifyEnabled: true,
      unverifiedRoleId: "r-unv",
      verifiedRoleId: "r-ver",
      altDetectionEnabled: true,
    });
    await run({ isButton: true, customId: "verify_confirm" });
    check(
      "confirm: AI phân tích lỗi → fail-open, vẫn xác minh",
      replies[0].content.includes("Đã xác minh thành công"),
    );

    // Nút lạ
    reset();
    await run({ isButton: true, customId: "khong-biet" });
    check("nút lạ → bỏ qua", replies.length === 0);
  }

  // ══════════════════ LỆNH SLASH ══════════════════

  // ── 3. Không phải chat input / không guild ──
  {
    reset();
    await run({});
    check("không phải chat input → bỏ qua", replies.length === 0);

    reset();
    await run({ isChatInputCommand: true, commandName: "ping", noGuild: true });
    check(
      "slash ngoài server → từ chối",
      replies[0].content.includes("chỉ hoạt động trong server"),
    );
  }

  // ── 4. report / research / ping / help / default ──
  {
    reset();
    ctl.reportInteractive = async () => {
      replies.push({ content: "report-called" });
    };
    await run({ isChatInputCommand: true, commandName: "report" });
    check(
      "report → uỷ quyền cho reportInteractive",
      replies.some((r) => r.content === "report-called"),
    );

    reset();
    ctl.handleResearch = async () => {
      replies.push({ content: "research-called" });
    };
    await run({ isChatInputCommand: true, commandName: "research" });
    check(
      "research → uỷ quyền cho handleResearch",
      replies.some((r) => r.content === "research-called"),
    );

    reset();
    await run({ isChatInputCommand: true, commandName: "ping" });
    check(
      "ping → pong kèm ms",
      replies[0].content.includes("Pong") && replies[0].content.includes("42"),
    );

    reset();
    await run({ isChatInputCommand: true, commandName: "help" });
    check("help → embed hướng dẫn", replies[0].embeds?.[0]?.data?.title?.includes("Lệnh"));

    reset();
    await run({ isChatInputCommand: true, commandName: "khong-co" });
    check("lệnh không hỗ trợ → thông báo", replies[0].content.includes("chưa được hỗ trợ"));
  }

  // ── 5. prefix ──
  {
    reset();
    configs.set("g1", { prefix: "!" });
    await run({ isChatInputCommand: true, commandName: "prefix" });
    check("prefix: xem hiện tại", replies[0].content.includes("Prefix hiện tại"));

    reset();
    ctl.perms.manage = false;
    await run({ isChatInputCommand: true, commandName: "prefix", strings: { set: "^" } });
    check("prefix: thiếu quyền → needPerm", replies[0].content.includes("không có quyền"));

    reset();
    await run({ isChatInputCommand: true, commandName: "prefix", strings: { set: "abc" } });
    check("prefix: ký tự không hợp lệ → từ chối", replies[0].content.includes("1-3 ký tự"));

    reset();
    await run({ isChatInputCommand: true, commandName: "prefix", strings: { set: "^" } });
    check(
      "prefix: hợp lệ → ghi mutation + đổi",
      calls.mutations.some((m) => m.name === "bot_writes:botUpdateSettings") &&
        replies[0].content.includes("Đã đổi prefix"),
    );
  }

  // ── 6. autoreply ──
  {
    reset();
    configs.set("g1", { autoReplies: [] });
    await run({ isChatInputCommand: true, commandName: "autoreply", subcommand: "list" });
    check("autoreply list rỗng → thông báo", replies[0].content.includes("Chưa có rule"));

    reset();
    configs.set("g1", {
      autoReplies: [{ name: "r1", triggerType: "keyword", keywords: ["hi"], enabled: true }],
    });
    await run({ isChatInputCommand: true, commandName: "autoreply", subcommand: "list" });
    check(
      "autoreply list có rule → embed",
      replies[0].embeds?.[0]?.data?.title?.includes("Auto reply"),
    );

    reset();
    ctl.perms.manage = false;
    await run({ isChatInputCommand: true, commandName: "autoreply", subcommand: "add" });
    check("autoreply add thiếu quyền → needPerm", replies[0].content.includes("không có quyền"));

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "autoreply",
      subcommand: "add",
      strings: { name: "r", trigger: "keyword", response: "x", keywords: "", cooldown: null },
    });
    check(
      "autoreply add keyword thiếu từ khóa → từ chối",
      replies[0].content.includes("cần nhập từ khóa"),
    );

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "autoreply",
      subcommand: "add",
      strings: {
        name: "r",
        trigger: "keyword",
        response: "xin chào",
        keywords: "hi,hello",
        cooldown: 10,
      },
    });
    check(
      "autoreply add hợp lệ → lưu mutation",
      calls.mutations.some((m) => m.name === "bot_writes:botAutoReplyUpsert"),
    );

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "autoreply",
      subcommand: "remove",
      strings: { name: "r" },
    });
    check(
      "autoreply remove → mutation xóa",
      calls.mutations.some((m) => m.name === "bot_writes:botAutoReplyRemove"),
    );

    reset();
    configs.set("g1", { autoReplies: [] });
    await run({
      isChatInputCommand: true,
      commandName: "autoreply",
      subcommand: "edit",
      strings: { name: "missing" },
      integers: { cooldown: null },
    });
    check(
      "autoreply edit rule không tồn tại → thông báo",
      replies[0].content.includes("Không tìm thấy rule"),
    );

    reset();
    configs.set("g1", {
      autoReplies: [
        {
          name: "r1",
          triggerType: "keyword",
          keywords: ["hi"],
          response: "cũ",
          enabled: true,
          channels: [],
        },
      ],
    });
    await run({
      isChatInputCommand: true,
      commandName: "autoreply",
      subcommand: "edit",
      strings: { name: "r1", response: "mới" },
      integers: { cooldown: null },
    });
    check(
      "autoreply edit hợp lệ → cập nhật",
      calls.mutations.some((m) => m.name === "bot_writes:botAutoReplyUpsert"),
    );
  }

  // ── 7. badword ──
  {
    reset();
    configs.set("g1", { badWords: [] });
    await run({ isChatInputCommand: true, commandName: "badword", subcommand: "list" });
    check("badword list rỗng → thông báo", replies[0].content.includes("đang trống"));

    reset();
    configs.set("g1", { badWords: ["xấu"] });
    await run({ isChatInputCommand: true, commandName: "badword", subcommand: "list" });
    check(
      "badword list có từ → embed",
      replies[0].embeds?.[0]?.data?.title?.includes("từ ngữ xấu"),
    );

    reset();
    ctl.perms.manage = false;
    await run({ isChatInputCommand: true, commandName: "badword", subcommand: "add" });
    check("badword add thiếu quyền → needPerm", replies[0].content.includes("không có quyền"));

    reset();
    configs.set("g1", { badWords: [] });
    await run({
      isChatInputCommand: true,
      commandName: "badword",
      subcommand: "add",
      strings: { word: "  " },
    });
    check("badword add từ trống → từ chối", replies[0].content.includes("không được để trống"));

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "badword",
      subcommand: "add",
      strings: { word: "a".repeat(41) },
    });
    check("badword add quá 40 ký tự → từ chối", replies[0].content.includes("tối đa 40"));

    reset();
    configs.set("g1", { badWords: ["xấu"] });
    await run({
      isChatInputCommand: true,
      commandName: "badword",
      subcommand: "add",
      strings: { word: "xấu" },
    });
    check("badword add từ đã có → thông báo", replies[0].content.includes("đã có"));

    reset();
    configs.set("g1", { badWords: Array.from({ length: 100 }, (_, i) => "w" + i) });
    await run({
      isChatInputCommand: true,
      commandName: "badword",
      subcommand: "add",
      strings: { word: "mới" },
    });
    check("badword add đủ 100 → từ chối", replies[0].content.includes("tối đa 100"));

    reset();
    configs.set("g1", { badWords: [] });
    await run({
      isChatInputCommand: true,
      commandName: "badword",
      subcommand: "add",
      strings: { word: "Xấu" },
    });
    check(
      "badword add hợp lệ → mutation",
      calls.mutations.some((m) => m.name === "bot_writes:botUpdateSettings"),
    );

    reset();
    configs.set("g1", { badWords: ["xấu"] });
    await run({
      isChatInputCommand: true,
      commandName: "badword",
      subcommand: "remove",
      strings: { word: "không-có" },
    });
    check("badword remove không thấy → thông báo", replies[0].content.includes("Không tìm thấy"));

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "badword",
      subcommand: "remove",
      strings: { word: "xấu" },
    });
    check(
      "badword remove hợp lệ → mutation",
      calls.mutations.some((m) => m.name === "bot_writes:botUpdateSettings"),
    );
  }

  // ── 8. heat ──
  {
    reset();
    configs.set("g1", { heatStates: [{ userId: "u1", heat: 50 }], safetyPercent: 80 });
    await run({ isChatInputCommand: true, commandName: "heat" });
    check(
      "heat có dữ liệu → embed nhiệt độ",
      replies[0].embeds?.[0]?.data?.title?.includes("Nhiệt độ"),
    );

    reset();
    configs.set("g1", { heatStates: [] });
    await run({ isChatInputCommand: true, commandName: "heat" });
    check(
      "heat không dữ liệu → thông báo an toàn",
      replies[0].embeds?.[0]?.data?.fields?.[0]?.value.includes("an toàn"),
    );
  }

  // ── 9. antinuke ──
  {
    reset();
    configs.set("g1", {
      antinukeEnabled: true,
      modules: [
        { module: "massBan", enabled: true, threshold: 3, windowSeconds: 10, punish: "ban" },
      ],
    });
    await run({ isChatInputCommand: true, commandName: "antinuke", subcommand: "status" });
    check(
      "antinuke status → embed trạng thái",
      replies[0].embeds?.[0]?.data?.title?.includes("Chống nuke"),
    );

    reset();
    ctl.perms.manage = false;
    await run({ isChatInputCommand: true, commandName: "antinuke", subcommand: "on" });
    check("antinuke on thiếu quyền → needPerm", replies[0].content.includes("không có quyền"));

    reset();
    await run({ isChatInputCommand: true, commandName: "antinuke", subcommand: "on" });
    check(
      "antinuke on → mutation botSetAntinuke",
      calls.mutations.some((m) => m.name === "bot_writes:botSetAntinuke"),
    );

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "antinuke",
      subcommand: "lockdown",
      strings: { value: "sai" },
    });
    check("antinuke lockdown giá trị sai → từ chối", replies[0].content.includes("on hoặc off"));

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "antinuke",
      subcommand: "lockdown",
      strings: { value: "on" },
    });
    check(
      "antinuke lockdown on → mutation",
      calls.mutations.some((m) => m.name === "bot_writes:botUpdateLockdown"),
    );

    reset();
    ctl.isLocked = false;
    configs.set("g1", {});
    await run({ isChatInputCommand: true, commandName: "antinuke", subcommand: "unlock" });
    check(
      "antinuke unlock khi không khóa → thông báo",
      replies[0].content.includes("không ở trạng thái khóa"),
    );

    reset();
    ctl.isLocked = true;
    configs.set("g1", {});
    await run({ isChatInputCommand: true, commandName: "antinuke", subcommand: "unlock" });
    check(
      "antinuke unlock khi đang khóa → mở khóa",
      ctl.unlockGuildCalls === 1 && replies[0].content.includes("Đã mở khóa"),
    );

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "antinuke",
      subcommand: "module",
      strings: { module: "sai-module", value: "on" },
    });
    check("antinuke module sai tên → từ chối", replies[0].content.includes("Module phải thuộc"));

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "antinuke",
      subcommand: "module",
      strings: { module: "massBan", value: "off" },
    });
    check(
      "antinuke module hợp lệ → mutation",
      calls.mutations.some((m) => m.name === "bot_writes:botModuleUpdate"),
    );

    // Regression: 12 module từng bị lệnh slash từ chối (danh sách cũ chỉ 18)
    // trong khi dashboard + `!antinuke module` vẫn bật/tắt được → nay phải khớp.
    reset();
    await run({
      isChatInputCommand: true,
      commandName: "antinuke",
      subcommand: "module",
      strings: { module: "massThreadDelete", value: "on" },
    });
    check(
      "antinuke module massThreadDelete (từng thiếu) → mutation",
      calls.mutations.some(
        (m) => m.name === "bot_writes:botModuleUpdate" && m.args.module === "massThreadDelete",
      ),
    );

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "antinuke",
      subcommand: "module",
      strings: { module: "externalAppRaid", value: "on" },
    });
    check(
      "antinuke module externalAppRaid (từng thiếu) → mutation",
      calls.mutations.some(
        (m) => m.name === "bot_writes:botModuleUpdate" && m.args.module === "externalAppRaid",
      ),
    );

    // Hợp đồng danh sách module: mọi module `convex/modules.ts` định nghĩa đều
    // phải bật/tắt được từ Discord (dashboard cũng dùng đúng danh sách đó).
    {
      const common = require("../bot/src/handlers/interactionCommon");
      const src = fs.readFileSync(path.join(__dirname, "..", "convex", "modules.ts"), "utf8");
      const convexModules = [
        ...src.slice(0, src.indexOf("MODERATION_MODULE_KEYS")).matchAll(/module:\s*"([^"]+)"/g),
      ].map((m) => m[1]);
      const missing = convexModules.filter((m) => !common.MODULES.includes(m));
      check(
        `MODULES của bot phủ đủ ${convexModules.length} module trong convex/modules.ts`,
        convexModules.length > 0 && missing.length === 0,
        missing,
      );
      const prefixSrc = fs.readFileSync(
        path.join(__dirname, "..", "bot", "src", "commands", "prefix.js"),
        "utf8",
      );
      check(
        "!antinuke module dùng chung MODULES (không tự khai báo lại)",
        prefixSrc.includes('require("../handlers/interactionCommon")') &&
          !/const MODULES = \[/.test(prefixSrc),
      );
    }
  }

  // ── 10. mod ──
  {
    const target = {
      id: "t1",
      user: { tag: "target#1", username: "target" },
      timeout: async () => {},
      kick: async () => {},
      ban: async () => {},
    };

    reset();
    ctl.perms.mod = false;
    await run({
      isChatInputCommand: true,
      commandName: "mod",
      subcommand: "kick",
      members: { user: target },
    });
    check("mod thiếu quyền → needPerm", replies[0].content.includes("không có quyền"));

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "mod",
      subcommand: "timeout",
      members: { user: null },
      strings: { duration: "10m" },
    });
    check("mod timeout không thấy member → từ chối", replies[0].content.includes("Không tìm thấy"));

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "mod",
      subcommand: "timeout",
      members: { user: target },
      strings: { duration: "sai" },
    });
    check(
      "mod timeout thời lượng sai → từ chối",
      replies[0].content.includes("Thời lượng không hợp lệ"),
    );

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "mod",
      subcommand: "timeout",
      members: { user: target },
      strings: { duration: "10m", reason: "spam" },
    });
    check("mod timeout hợp lệ → OK", replies[0].content.includes("timeout OK"));

    reset();
    ctl.actionThrows = true;
    await run({
      isChatInputCommand: true,
      commandName: "mod",
      subcommand: "timeout",
      members: { user: target },
      strings: { duration: "10m" },
    });
    check("mod timeout lỗi → thông báo lỗi", replies[0].content.includes("Không thể timeout"));

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "mod",
      subcommand: "kick",
      members: { user: target },
    });
    check("mod kick hợp lệ → OK", replies[0].content.includes("kick OK"));

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "mod",
      subcommand: "ban",
      members: { user: target },
      integers: { delete_days: 3 },
    });
    check("mod ban hợp lệ → OK", replies[0].content.includes("ban OK"));

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "mod",
      subcommand: "purge",
      integers: { count: 5 },
    });
    check("mod purge hợp lệ → OK", replies[0].content.includes("purge OK"));

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "mod",
      subcommand: "untimeout",
      members: { user: target },
    });
    check("mod untimeout hợp lệ → OK", replies[0].content.includes("untimeout OK"));

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "mod",
      subcommand: "unban",
      users: { user: { id: "t1" } },
    });
    check("mod unban hợp lệ → OK", replies[0].content.includes("unban OK"));

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "mod",
      subcommand: "unwarn",
      users: { user: { id: "t1" } },
    });
    check("mod unwarn hợp lệ → OK", replies[0].content.includes("unwarn OK"));
  }

  // ── 11. giveaway ──
  {
    reset();
    configs.set("g1", { giveaways: [] });
    await run({ isChatInputCommand: true, commandName: "giveaway", subcommand: "list" });
    check("giveaway list rỗng → thông báo", replies[0].content.includes("Chưa có giveaway"));

    reset();
    configs.set("g1", { giveaways: [{ title: "G", status: "active", entries: [1, 2] }] });
    await run({ isChatInputCommand: true, commandName: "giveaway", subcommand: "list" });
    check("giveaway list có → embed", replies[0].embeds?.[0]?.data?.title?.includes("Giveaway"));

    reset();
    ctl.perms.mod = false;
    await run({ isChatInputCommand: true, commandName: "giveaway", subcommand: "start" });
    check("giveaway start thiếu quyền → needPerm", replies[0].content.includes("không có quyền"));

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "giveaway",
      subcommand: "start",
      strings: { title: "G", prize: "P", duration: "sai" },
    });
    check(
      "giveaway start thời lượng sai → từ chối",
      replies[0].content.includes("Thời lượng không hợp lệ"),
    );

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "giveaway",
      subcommand: "start",
      strings: { title: "G", prize: "P", duration: "30m" },
      integers: { winners: 2 },
    });
    check(
      "giveaway start hợp lệ → mutation tạo",
      calls.mutations.some((m) => m.name === "hidden:botCreateGiveaway"),
    );

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "giveaway",
      subcommand: "end",
      strings: { title: "G" },
    });
    check("giveaway end tìm thấy → OK", replies[0].content.includes("Đã kết thúc"));

    reset();
    ctl.giveawayEndOk = false;
    await run({
      isChatInputCommand: true,
      commandName: "giveaway",
      subcommand: "end",
      strings: { title: "X" },
    });
    check(
      "giveaway end không thấy → thông báo",
      replies[0].content.includes("Không tìm thấy giveaway"),
    );
  }

  // ── 12. reactionrole ──
  {
    reset();
    ctl.queryResult = { panels: [] };
    await run({ isChatInputCommand: true, commandName: "reactionrole", subcommand: "list" });
    check("reactionrole list rỗng → thông báo", replies[0].content.includes("Chưa có bảng"));

    reset();
    ctl.queryResult = {
      panels: [
        {
          _id: "p1",
          label: "Bảng",
          channelId: "c1",
          entries: [{ emoji: "✅", roleId: "r1" }],
          enabled: true,
        },
      ],
    };
    await run({ isChatInputCommand: true, commandName: "reactionrole", subcommand: "list" });
    check(
      "reactionrole list có → embed",
      replies[0].embeds?.[0]?.data?.title?.includes("Reaction role"),
    );

    reset();
    ctl.perms.manage = false;
    ctl.queryResult = { panels: [] };
    await run({ isChatInputCommand: true, commandName: "reactionrole", subcommand: "create" });
    check(
      "reactionrole create thiếu quyền → needPerm",
      replies[0].content.includes("không có quyền"),
    );

    reset();
    ctl.queryResult = { panels: [] };
    const channel = { id: "c1", isTextBased: () => true, toString: () => "#chung" };
    await run({
      isChatInputCommand: true,
      commandName: "reactionrole",
      subcommand: "create",
      channels: { channel },
      strings: { label: "B", pairs: "✅:123456789012345" },
    });
    check(
      "reactionrole create hợp lệ → mutation tạo panel",
      calls.mutations.some((m) => m.name === "hidden:botCreatePanel"),
    );

    reset();
    ctl.queryResult = { panels: [] };
    await run({
      isChatInputCommand: true,
      commandName: "reactionrole",
      subcommand: "create",
      channels: { channel },
      strings: { label: "B", pairs: "sai" },
    });
    check("reactionrole create cặp sai → từ chối", replies[0].content.includes("ít nhất 1 cặp"));

    reset();
    ctl.queryResult = {
      panels: [{ _id: "p1", label: "Bảng", entries: [{ emoji: "✅", roleId: "r1" }] }],
    };
    await run({
      isChatInputCommand: true,
      commandName: "reactionrole",
      subcommand: "add",
      strings: { label: "Bảng", emoji: "✅" },
      roles: { role: { id: "r2" } },
    });
    check(
      "reactionrole add emoji trùng → từ chối",
      replies[0].content.includes("đã có trong bảng"),
    );

    reset();
    ctl.queryResult = {
      panels: [{ _id: "p1", label: "Bảng", entries: [{ emoji: "✅", roleId: "r1" }] }],
    };
    await run({
      isChatInputCommand: true,
      commandName: "reactionrole",
      subcommand: "add",
      strings: { label: "Bảng", emoji: "⭐" },
      roles: { role: { id: "r2" } },
    });
    check(
      "reactionrole add hợp lệ → mutation cập nhật",
      calls.mutations.some((m) => m.name === "hidden:botUpdatePanel"),
    );

    reset();
    ctl.queryResult = {
      panels: [{ _id: "p1", label: "Bảng", entries: [{ emoji: "✅", roleId: "r1" }] }],
    };
    await run({
      isChatInputCommand: true,
      commandName: "reactionrole",
      subcommand: "remove",
      strings: { label: "Bảng", emoji: "khong-co" },
    });
    check(
      "reactionrole remove emoji không thấy → từ chối",
      replies[0].content.includes("Không tìm thấy emoji"),
    );

    reset();
    ctl.queryResult = {
      panels: [{ _id: "p1", label: "Bảng", entries: [{ emoji: "✅", roleId: "r1" }] }],
    };
    await run({
      isChatInputCommand: true,
      commandName: "reactionrole",
      subcommand: "remove",
      strings: { label: "Bảng", emoji: "✅" },
    });
    check(
      "reactionrole remove hợp lệ → mutation cập nhật",
      calls.mutations.some((m) => m.name === "hidden:botUpdatePanel"),
    );

    reset();
    ctl.queryResult = {
      panels: [{ _id: "p1", label: "Bảng", entries: [{ emoji: "✅", roleId: "r1" }] }],
    };
    await run({
      isChatInputCommand: true,
      commandName: "reactionrole",
      subcommand: "edit",
      strings: { label: "Bảng" },
    });
    check(
      "reactionrole edit thiếu trường → từ chối",
      replies[0].content.includes("ít nhất một trường"),
    );

    reset();
    ctl.queryResult = {
      panels: [{ _id: "p1", label: "Bảng", entries: [{ emoji: "✅", roleId: "r1" }] }],
    };
    await run({
      isChatInputCommand: true,
      commandName: "reactionrole",
      subcommand: "edit",
      strings: { label: "Bảng", new_label: "Bảng mới" },
    });
    check(
      "reactionrole edit hợp lệ → mutation cập nhật",
      calls.mutations.some((m) => m.name === "hidden:botUpdatePanel"),
    );

    reset();
    ctl.queryResult = {
      panels: [{ _id: "p1", label: "Bảng", entries: [{ emoji: "✅", roleId: "r1" }] }],
    };
    await run({
      isChatInputCommand: true,
      commandName: "reactionrole",
      subcommand: "delete",
      strings: { label: "Bảng" },
    });
    check(
      "reactionrole delete → mutation xóa panel",
      calls.mutations.some((m) => m.name === "hidden:botDeletePanel"),
    );

    reset();
    ctl.queryResult = { panels: [] };
    await run({
      isChatInputCommand: true,
      commandName: "reactionrole",
      subcommand: "add",
      strings: { label: "Không có", emoji: "⭐" },
      roles: { role: { id: "r2" } },
    });
    check(
      "reactionrole add panel không thấy → thông báo",
      replies[0].content.includes("Không tìm thấy bảng"),
    );
  }

  // ── 13. backup ──
  {
    reset();
    ctl.queryResult = [];
    await run({ isChatInputCommand: true, commandName: "backup", subcommand: "list" });
    check("backup list rỗng → thông báo", replies[0].content.includes("Chưa có backup"));

    reset();
    ctl.queryResult = [
      {
        _id: "b1",
        guildName: "G",
        createdAt: Date.now(),
        roleCount: 1,
        channelCount: 2,
        pushedToGithub: true,
      },
    ];
    await run({ isChatInputCommand: true, commandName: "backup", subcommand: "list" });
    check("backup list có → embed", replies[0].embeds?.[0]?.data?.title?.includes("Backup"));

    reset();
    ctl.perms.manage = false;
    await run({
      isChatInputCommand: true,
      commandName: "backup",
      subcommand: "restore",
      integers: { index: 1 },
    });
    check("backup restore thiếu quyền → needPerm", replies[0].content.includes("không có quyền"));

    reset();
    ctl.queryResult = [];
    await run({
      isChatInputCommand: true,
      commandName: "backup",
      subcommand: "restore",
      integers: { index: 5 },
    });
    check(
      "backup restore index sai → từ chối",
      replies[0].content.includes("Không tìm thấy backup"),
    );

    reset();
    ctl.queryResult = [{ _id: "b1", guildName: "G", roleCount: 1, channelCount: 2 }];
    await run({
      isChatInputCommand: true,
      commandName: "backup",
      subcommand: "restore",
      integers: { index: 1 },
    });
    check(
      "backup restore hợp lệ → mutation yêu cầu",
      calls.mutations.some((m) => m.name === "bot_writes:botSetRestoreRequest"),
    );

    // ── /backup verify: CHỈ ĐỌC — bung, đếm, báo lệch; tuyệt đối không mutation ──
    reset();
    ctl.perms.manage = false;
    await run({
      isChatInputCommand: true,
      commandName: "backup",
      subcommand: "verify",
      integers: { index: 1 },
    });
    check("backup verify thiếu quyền → needPerm", replies[0].content.includes("không có quyền"));

    reset();
    ctl.queryResult = [];
    await run({
      isChatInputCommand: true,
      commandName: "backup",
      subcommand: "verify",
      integers: { index: 1 },
    });
    check(
      "backup verify chưa có bản nào → thông báo",
      replies[0].content.includes("Chưa có backup"),
    );

    reset();
    ctl.queryResult = [
      {
        _id: "b1",
        guildName: "G",
        roleCount: 1,
        channelCount: 1,
        backupJson: JSON.stringify({ guildId: "g1", roles: [{}], channels: [{}] }),
      },
    ];
    await run({
      isChatInputCommand: true,
      commandName: "backup",
      subcommand: "verify",
      integers: { index: 3 },
    });
    check(
      "backup verify index sai → từ chối",
      replies[0].content.includes("Không tìm thấy backup"),
    );

    reset();
    ctl.queryResult = [
      {
        _id: "b1",
        guildName: "G",
        roleCount: 1,
        channelCount: 1,
        emojiCount: 0,
        stickerCount: 0,
        messageCount: 0,
        backupJson: JSON.stringify({
          guildId: "g1",
          roles: [{}],
          channels: [{}],
          emojis: [],
          stickers: [],
        }),
      },
    ];
    await run({
      isChatInputCommand: true,
      commandName: "backup",
      subcommand: "verify",
      integers: { index: 1 },
    });
    check(
      "backup verify đọc nội dung bằng botAuditBackups (listGuild không có backupJson)",
      calls.queries.includes("backup:botAuditBackups"),
    );
    check(
      "backup verify → embed có số đếm THẬT (role/kênh), không chỉ số đã lưu",
      (replies[0].embeds?.[0]?.data?.description || "").includes("1 role") &&
        (replies[0].embeds?.[0]?.data?.description || "").includes("1 kênh"),
    );
    check("backup verify KHÔNG đụng guild (không gọi mutation nào)", calls.mutations.length === 0);

    reset();
    ctl.queryResult = [
      {
        _id: "b2",
        guildName: "G",
        backupChunkCount: 4,
        backupJson: null,
        roleCount: 1,
        channelCount: 1,
      },
    ];
    await run({
      isChatInputCommand: true,
      commandName: "backup",
      subcommand: "verify",
      integers: { index: 1 },
    });
    check(
      "backup verify thiếu chunk → nói RÕ 'thiếu chunk' (không báo chung là JSON hỏng)",
      (replies[0].embeds?.[0]?.data?.description || "").includes("thiếu chunk"),
    );

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "backup",
      subcommand: "auto",
      integers: { days: 1 },
    });
    check("backup auto ngày không hợp lệ → từ chối", replies[0].content.includes("2 đến 30"));

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "backup",
      subcommand: "auto",
      integers: { days: 7 },
    });
    check(
      "backup auto hợp lệ → mutation",
      calls.mutations.some((m) => m.name === "bot_writes:botSetAutoBackup"),
    );

    // /backup keep — quy tắc giữ bản (giống !backup keep trong prefix.js).
    reset();
    await run({
      isChatInputCommand: true,
      commandName: "backup",
      subcommand: "keep",
      integers: { count: 1 },
    });
    check(
      "backup keep số bản ngoài khoảng → từ chối",
      replies[0].content.includes("2 đến 50"),
      replies[0].content,
    );
    check(
      "backup keep số bản sai → KHÔNG gọi mutation",
      !calls.mutations.some((m) => m.name === "bot_writes:botSetBackupRetention"),
    );

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "backup",
      subcommand: "keep",
      integers: { count: 7, days: 400 },
    });
    check(
      "backup keep số ngày ngoài khoảng → từ chối",
      replies[0].content.includes("0 đến 365"),
      replies[0].content,
    );

    reset();
    ctl.mutationResult = { ok: true, keepCount: 7, keepDays: 30 };
    await run({
      isChatInputCommand: true,
      commandName: "backup",
      subcommand: "keep",
      integers: { count: 7, days: 30 },
    });
    const keepMut = calls.mutations.find((m) => m.name === "bot_writes:botSetBackupRetention");
    check(
      "backup keep hợp lệ → mutation giữ bản đúng tham số",
      !!keepMut && keepMut.args.keepCount === 7 && keepMut.args.keepDays === 30,
      JSON.stringify(keepMut?.args),
    );
    check(
      "backup keep phản hồi kết quả đã áp dụng",
      replies[0].content.includes("7 bản") && replies[0].content.includes("30 ngày"),
      replies[0].content,
    );

    // Bỏ trống `days` → giữ nguyên quy tắc tuổi đang có, KHÔNG tự đặt về 0
    // (người dùng chỉ muốn đổi số bản mà mất luôn giới hạn tuổi).
    reset();
    ctl.mutationResult = { ok: true, keepCount: 10, keepDays: 45 };
    await run({
      isChatInputCommand: true,
      commandName: "backup",
      subcommand: "keep",
      integers: { count: 10 },
    });
    const keepNoDays = calls.mutations.find((m) => m.name === "bot_writes:botSetBackupRetention");
    check(
      "backup keep bỏ trống ngày → gửi undefined (giữ quy tắc cũ)",
      !!keepNoDays && keepNoDays.args.keepDays === undefined,
      JSON.stringify(keepNoDays?.args),
    );
    check(
      "backup keep bỏ trống ngày → phản hồi theo giá trị server trả về",
      replies[0].content.includes("10 bản") && replies[0].content.includes("45 ngày"),
      replies[0].content,
    );

    // ok=false (server chưa đồng bộ) → phải báo lỗi, không báo thành công.
    reset();
    ctl.mutationResult = { ok: false, reason: "no_guild" };
    await run({
      isChatInputCommand: true,
      commandName: "backup",
      subcommand: "keep",
      integers: { count: 5 },
    });
    check(
      "backup keep server chưa đồng bộ → báo lỗi chứ không báo xong",
      replies[0].content.includes("❌") && !replies[0].content.includes("✅"),
      replies[0].content,
    );

    // ── /backup now: chỉ chạy ĐÚNG khi sub === "now" ──
    // Lỗi gốc: khối `now` không có nhánh `if (sub === "now")` nên mọi
    // subcommand lạ đều rơi xuống đây và tạo backup + đẩy server lên GitHub.
    // Đăng ký slash dùng PUT nên thay thế toàn bộ cây lệnh: hễ thêm
    // subcommand mới vào slash.js mà quên sửa handler, người dùng gõ đúng
    // lệnh đó lại nhận hành vi của `now` — ghi dữ liệu + đẩy ra ngoài mà
    // không hề được hỏi.
    {
      reset();
      await run({ isChatInputCommand: true, commandName: "backup", subcommand: "now" });
      const nowMut = calls.mutations.find((m) => m.name === "bot_writes:botSetBackupRequest");
      check(
        "backup now → mutation tạo backup (mặc định đẩy GitHub)",
        !!nowMut && nowMut.args.pushToGithub === true,
        JSON.stringify(nowMut?.args),
      );
      check("backup now → báo đã yêu cầu", (replies[0].content || "").includes("✅"));

      // Bỏ trống `github` → discord.js trả null → `?? true` phải ra true
      // (tắt default thành false sẽ lặng lẽ bỏ đẩy GitHub).
      reset();
      await run({ isChatInputCommand: true, commandName: "backup", subcommand: "now" });
      const nowDefault = calls.mutations.find((m) => m.name === "bot_writes:botSetBackupRequest");
      check(
        "backup now bỏ trống github → vẫn đẩy GitHub (null → true)",
        nowDefault?.args.pushToGithub === true,
        JSON.stringify(nowDefault?.args),
      );

      reset();
      await run({
        isChatInputCommand: true,
        commandName: "backup",
        subcommand: "now",
        booleans: { github: false },
      });
      const nowLocal = calls.mutations.find((m) => m.name === "bot_writes:botSetBackupRequest");
      check(
        "backup now github=false → chỉ lưu Convex",
        nowLocal?.args.pushToGithub === false,
        JSON.stringify(nowLocal?.args),
      );
    }

    // Subcommand KHÔNG khai báo (client cache cũ, hoặc sub vừa thêm vào
    // slash.js) → tuyệt đối không được tạo backup, phải báo lỗi rõ.
    {
      reset();
      await run({ isChatInputCommand: true, commandName: "backup", subcommand: "plan" });
      check(
        "backup sub lạ → KHÔNG tạo backup, KHÔNG đẩy GitHub",
        !calls.mutations.some((m) => m.name === "bot_writes:botSetBackupRequest"),
        JSON.stringify(calls.mutations.map((m) => m.name)),
      );
      check(
        "backup sub lạ → báo subcommand không hợp lệ + liệt kê cú pháp",
        (replies[0]?.content || "").includes("không hợp lệ") &&
          (replies[0]?.content || "").includes("keep"),
        replies[0]?.content,
      );

      // Kể cả người không có quyền quản lý: phải báo subcommand lạ, không
      // được rơi vào nhánh `now` rồi mới tới needPerm (đường chết im lặng).
      reset();
      ctl.perms.manage = false;
      await run({ isChatInputCommand: true, commandName: "backup", subcommand: "plan" });
      ctl.perms.manage = true;
      check(
        "backup sub lạ + thiếu quyền → vẫn KHÔNG tạo backup",
        !calls.mutations.some((m) => m.name === "bot_writes:botSetBackupRequest"),
        JSON.stringify(calls.mutations.map((m) => m.name)),
      );
    }

    // HỢP ĐỒNG giữa 2 file: handler đọc option nào thì lệnh PHẢI khai báo đúng
    // tên đó. Lệch 1 chữ là `/backup keep` không nhận được giá trị (getInteger
    // trả null) — chạy không lỗi nhưng cấu hình không bao giờ được đặt.
    {
      // Sau #5 tách monolith, thân `case "backup"` nằm ở interactionCmdBackup.js —
      // đọc đúng file mới, cùng ngữ nghĩa kiểm (hợp đồng option ↔ slash.js).
      const slashSrc = fs.readFileSync(
        path.join(__dirname, "..", "bot", "src", "handlers", "interactionCmdBackup.js"),
        "utf8",
      );
      const branch = slashSrc.slice(
        slashSrc.indexOf('if (sub === "keep")'),
        slashSrc.indexOf("// /backup now", slashSrc.indexOf('if (sub === "keep")')),
      );
      const readNames = [...branch.matchAll(/getInteger\("([a-z]+)"/g)].map((m) => m[1]);
      const { commands } = require("../bot/src/commands/slash.js");
      const defined =
        (commands.find((c) => c.name === "backup")?.options ?? [])
          .find((o) => o.name === "keep")
          ?.options?.map((o) => o.name) ?? [];
      const missing = readNames.filter((n) => !defined.includes(n));
      check(
        "/backup keep: handler đọc đúng option đã khai báo",
        readNames.length > 0 && missing.length === 0,
        `đọc=[${readNames}] khai báo=[${defined}] thiếu=[${missing}]`,
      );
    }

    // HỢP ĐỒNG /backup verify: handler đọc `index` thì slash PHẢI khai báo
    // `index`, và thông báo "subcommand không hợp lệ" PHẢI có `verify` — thiếu
    // thì người dùng gõ đúng lệnh đã đăng ký lại nhận "không hợp lệ" (lệch cây
    // lệnh giữa 2 file — đúng lớp lỗi đã có với /backup keep).
    {
      const src = fs.readFileSync(
        path.join(__dirname, "..", "bot", "src", "handlers", "interactionCmdBackup.js"),
        "utf8",
      );
      const verifyAt = src.indexOf('if (sub === "verify")');
      const verifyBranch = src.slice(verifyAt, src.indexOf('if (sub === "auto")', verifyAt));
      const { commands } = require("../bot/src/commands/slash.js");
      const declared =
        (commands.find((c) => c.name === "backup")?.options ?? [])
          .find((o) => o.name === "verify")
          ?.options?.map((o) => o.name) ?? [];
      const readNames = [...verifyBranch.matchAll(/getInteger\("([a-z]+)"/g)].map((m) => m[1]);
      check(
        "/backup verify: handler đọc đúng option `index` đã khai báo",
        verifyAt !== -1 && readNames.includes("index") && declared.includes("index"),
        `đọc=[${readNames}] khai báo=[${declared}]`,
      );
      // Soi ĐÚNG dòng thông báo, không lấy cửa sổ N ký tự: cửa sổ 320 ký tự
      // vô tình chứa `case "verify"` của lệnh xác minh thành viên nằm ngay sau
      // → guard luôn xanh dù thông báo thiếu `verify` (RED-PROOF đã bắt).
      const fallbackLine = src
        .split("\n")
        .find((l) => l.includes("Subcommand `/backup` không hợp lệ"));
      check(
        "/backup verify: thông báo subcommand hợp lệ có `verify`",
        !!fallbackLine && fallbackLine.includes("verify"),
        fallbackLine,
      );
    }

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "backup",
      subcommand: "now",
      booleans: { github: true },
    });
    check(
      "backup now → mutation yêu cầu backup",
      calls.mutations.some((m) => m.name === "bot_writes:botSetBackupRequest"),
    );
  }

  // ── 14. verify (setup/toggle/method) ──
  {
    reset();
    ctl.perms.manage = false;
    await run({
      isChatInputCommand: true,
      commandName: "verify",
      subcommand: "toggle",
      strings: { value: "on" },
    });
    check("verify thiếu quyền → needPerm", replies[0].content.includes("không có quyền"));

    reset();
    const vchannel = { id: "c-v", send: async () => {}, toString: () => "#verify" };
    await run({
      isChatInputCommand: true,
      commandName: "verify",
      subcommand: "setup",
      channels: { channel: vchannel },
      roles: { unverified_role: { id: "r-unv" }, verified_role: { id: "r-ver" } },
      strings: { method: "captcha" },
    });
    check(
      "verify setup captcha → mutation + gửi panel",
      calls.mutations.some((m) => m.name === "bot_writes:botUpdateSettings") &&
        replies[0].content.includes("Đã thiết lập"),
    );

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "verify",
      subcommand: "toggle",
      strings: { value: "sai" },
    });
    check("verify toggle giá trị sai → từ chối", replies[0].content.includes("on hoặc off"));

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "verify",
      subcommand: "toggle",
      strings: { value: "off" },
    });
    check(
      "verify toggle off → mutation",
      calls.mutations.some((m) => m.name === "bot_writes:botUpdateSettings"),
    );

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "verify",
      subcommand: "method",
      strings: { type: "sai" },
    });
    check("verify method sai → từ chối", replies[0].content.includes("button hoặc captcha"));

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "verify",
      subcommand: "method",
      strings: { type: "captcha" },
    });
    check(
      "verify method captcha → mutation",
      calls.mutations.some((m) => m.name === "bot_writes:botUpdateSettings"),
    );
  }

  // ── 15. setup ──
  {
    reset();
    ctl.perms.manage = false;
    await run({ isChatInputCommand: true, commandName: "setup", subcommand: "log-channel" });
    check("setup thiếu quyền → needPerm", replies[0].content.includes("không có quyền"));

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "setup",
      subcommand: "log-channel",
      channels: { channel: { id: "c-log", toString: () => "#log" } },
    });
    check(
      "setup log-channel → mutation",
      calls.mutations.some((m) => m.name === "bot_writes:botUpdateSettings"),
    );

    reset();
    configs.set("g1", { modRoles: ["r1"] });
    await run({
      isChatInputCommand: true,
      commandName: "setup",
      subcommand: "mod-role",
      roles: { role: { id: "r2", toString: () => "@Mod" } },
    });
    check(
      "setup mod-role → mutation gộp role",
      calls.mutations.some(
        (m) =>
          m.name === "bot_writes:botUpdateSettings" &&
          m.args.modRoles.includes("r1") &&
          m.args.modRoles.includes("r2"),
      ),
    );

    reset();
    configs.set("g1", { adminRoles: [] });
    await run({
      isChatInputCommand: true,
      commandName: "setup",
      subcommand: "admin-role",
      roles: { role: { id: "r3", toString: () => "@Admin" } },
    });
    check(
      "setup admin-role → mutation",
      calls.mutations.some((m) => m.name === "bot_writes:botUpdateSettings"),
    );
  }

  // ── 16. alt ──
  {
    reset();
    ctl.perms.manage = false;
    ctl.perms.admin = false;
    configs.set("g1", {});
    await run({ isChatInputCommand: true, commandName: "alt", subcommand: "status" });
    check("alt thiếu quyền → needPerm", replies[0].content.includes("không có quyền"));

    reset();
    configs.set("g1", { altDetectionEnabled: true, altVpnMode: "strict" });
    await run({ isChatInputCommand: true, commandName: "alt", subcommand: "status" });
    check("alt status → embed", replies[0].embeds?.[0]?.data?.title?.includes("Alt Detection"));

    reset();
    await run({ isChatInputCommand: true, commandName: "alt", subcommand: "on" });
    check(
      "alt on → mutation",
      calls.mutations.some((m) => m.name === "bot_writes:botUpdateSettings"),
    );

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "alt",
      subcommand: "punish",
      strings: { type: "sai" },
    });
    check("alt punish sai → từ chối", replies[0].content.includes("kick, ban, timeout"));

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "alt",
      subcommand: "punish",
      strings: { type: "ban" },
    });
    check(
      "alt punish hợp lệ → mutation",
      calls.mutations.some((m) => m.name === "bot_writes:botUpdateSettings"),
    );

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "alt",
      subcommand: "threshold",
      integers: { value: 5 },
    });
    check("alt threshold ngoài 10-100 → từ chối", replies[0].content.includes("10 đến 100"));

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "alt",
      subcommand: "threshold",
      integers: { value: 50 },
    });
    check(
      "alt threshold hợp lệ → mutation",
      calls.mutations.some((m) => m.name === "bot_writes:botUpdateSettings"),
    );

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "alt",
      subcommand: "vpn",
      strings: { mode: "sai" },
    });
    check("alt vpn sai → từ chối", replies[0].content.includes("strict, warn"));

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "alt",
      subcommand: "vpn",
      strings: { mode: "warn" },
    });
    check(
      "alt vpn hợp lệ → mutation",
      calls.mutations.some((m) => m.name === "bot_writes:botUpdateSettings"),
    );
  }

  // ══════════════════ NÚT TICKET: hợp đồng nút ↔ handler ══════════════════
  // Nút chết là kiểu chết âm thầm: handler nhận customId nhưng rơi xuống
  // nhánh cuối và báo sai (đã xảy ra với nút "Ghi chú AI" — cả pipeline AI
  // viết xong nhưng không nút nào mở được nó). Test này duyệt ĐÚNG danh sách
  // nút mà bot gửi đi, nên nút mới thêm mà quên handler là test đỏ.
  {
    const tickets = require("../bot/src/handlers/tickets.js");
    const lang = require("../bot/src/handlers/lang.js");
    const T = lang.ticketText("vi");
    const row = tickets.actionRow(T, "TID1");
    const orphan = [];
    for (const comp of row.components) {
      reset();
      configs.set("g1", { ticketStaffRoleId: "R_MOD", modRoles: ["R_MOD"] });
      ctl.queryResult = { openerId: "U9", openerName: "nguoi-bi-ban", status: "open" };
      await run({
        isButton: true,
        customId: comp.customId,
        memberOverride: { roles: { cache: { has: (r) => r === "R_MOD" } } },
        channel: {
          id: "c1",
          name: "ticket-x-1",
          messages: {
            // Collection thật của discord.js có `.last()`; Map thuần thì không.
            // Handler ghim tin gọi `messages.last()` → mock thiếu là test đỏ
            // giả (đã xảy ra).
            fetch: async () => ({ values: () => [][Symbol.iterator](), last: () => null }),
          },
          permissionOverwrites: { edit: async () => {} },
          setName: async () => {},
        },
      });
      const texts = replies.map((r) => String(r.content || ""));
      // Nhánh cuối của ticketActionButton = nút KHÔNG có handler.
      if (texts.some((t) => t.includes("không còn trong hệ thống"))) orphan.push(comp.customId);
    }
    check(
      `mọi ${row.components.length} nút ticket đều có handler (không nút chết)`,
      orphan.length === 0,
      orphan.join(", "),
    );
  }
  {
    reset();
    configs.set("g1", { ticketStaffRoleId: "R_MOD", modRoles: ["R_MOD"] });
    await run({
      isButton: true,
      customId: "ticket_ai:TID1",
      memberOverride: { roles: { cache: { has: (r) => r === "R_MOD" } } },
    });
    check(
      "nút Ghi chú AI mở modal (không phải báo ticket không còn)",
      shownModals.length === 1 && shownModals[0].customId === "ticket_ai_note",
      shownModals[0]?.customId,
    );
  }
  {
    // Nút AI vẫn phải qua kiểm tra quyền staff như mọi nút khác.
    reset();
    configs.set("g1", { ticketStaffRoleId: "R_MOD", modRoles: ["R_MOD"] });
    await run({
      isButton: true,
      customId: "ticket_ai:TID1",
      memberOverride: { roles: { cache: { has: () => false } } },
    });
    check("nút AI cũng chỉ staff được bấm", shownModals.length === 0);
  }

  // ── Nhánh LỖI của /mod: mọi subcommand đều phải báo lỗi rõ ràng thay vì
  // im lặng (đây là lớp chưa có test nào trước đây). ──
  const modTarget = {
    id: "t1",
    user: { tag: "target#1", username: "target" },
    timeout: async () => {},
    kick: async () => {},
    ban: async () => {},
  };
  {
    const modErr = async (subcommand, extra = {}) => {
      reset();
      ctl.actionThrows = true;
      await run({
        isChatInputCommand: true,
        commandName: "mod",
        subcommand,
        members: { user: modTarget },
        users: { user: { id: "t1" } },
        integers: { count: 5, delete_days: 1 },
        ...extra,
      });
      return replies[0]?.content ?? "";
    };
    check("mod ban lỗi → báo không thể ban", (await modErr("ban")).includes("Không thể ban"));
    check(
      "mod purge lỗi → báo không thể purge",
      (await modErr("purge")).includes("Không thể purge"),
    );
    check(
      "mod untimeout lỗi → báo không thể gỡ timeout",
      (await modErr("untimeout")).includes("Không thể gỡ timeout"),
    );
    check(
      "mod unban lỗi → báo không thể gỡ ban",
      (await modErr("unban")).includes("Không thể gỡ ban"),
    );
    check(
      "mod unwarn lỗi → báo không thể gỡ warn",
      (await modErr("unwarn")).includes("Không thể gỡ warn"),
    );

    // Không tìm thấy thành viên / người dùng → chặn TRƯỚC khi gọi hàm mod.
    reset();
    await run({
      isChatInputCommand: true,
      commandName: "mod",
      subcommand: "untimeout",
      members: { user: null },
    });
    check(
      "mod untimeout không thấy member → từ chối",
      (replies[0]?.content ?? "").includes("Không tìm thấy"),
    );

    reset();
    await run({
      isChatInputCommand: true,
      commandName: "mod",
      subcommand: "unwarn",
      users: { user: null },
    });
    check(
      "mod unwarn không thấy user → từ chối",
      (replies[0]?.content ?? "").includes("Không tìm thấy"),
    );
  }

  // ── Nhánh LỖI của /reactionrole: bảng không tồn tại + mutation hỏng ──
  {
    const panel = {
      _id: "p1",
      label: "Bảng",
      channelId: "c1",
      entries: [{ emoji: "✅", roleId: "r1" }],
    };

    reset();
    ctl.queryResult = { panels: [panel] };
    await run({
      isChatInputCommand: true,
      commandName: "reactionrole",
      subcommand: "remove",
      strings: { label: "Không có", emoji: "✅" },
    });
    check(
      "reactionrole remove bảng không tồn tại → chỉ đường dẫn đúng",
      replies[0].content.includes("Không tìm thấy bảng"),
    );

    reset();
    ctl.queryResult = { panels: [panel] };
    await run({
      isChatInputCommand: true,
      commandName: "reactionrole",
      subcommand: "delete",
      strings: { label: "Không có" },
    });
    check(
      "reactionrole delete bảng không tồn tại → chỉ đường dẫn đúng",
      replies[0].content.includes("Không tìm thấy bảng"),
    );

    reset();
    ctl.queryResult = { panels: [panel] };
    const origMutation = store.client.mutation;
    store.client.mutation = async (name, args) => {
      if (name === "hidden:botDeletePanel" || name === "hidden:botUpdatePanel")
        throw new Error("Convex down");
      return origMutation(name, args);
    };
    await run({
      isChatInputCommand: true,
      commandName: "reactionrole",
      subcommand: "delete",
      strings: { label: "Bảng" },
    });
    check(
      "reactionrole delete lỗi Convex → báo lỗi, không crash",
      replies[0].content.includes("Convex down"),
    );
    store.client.mutation = origMutation;
  }

  // ══════════════════ LỆNH /lock (khoá chat) ══════════════════
  // Ở đây kiểm LỚP DẪN: quyền, tham số, và — quan trọng nhất — các ca mà
  // handler phải TỪ CHỐI làm thay vì tự ý sửa quyền người dùng.
  console.log("\n── /lock ──");

  const EVERYONE = "EVERYONE";
  /** Guild đủ cấu trúc cho /lock (guild mặc định của suite thiếu roles.everyone). */
  function lockGuild({ canManage = true, channels = [], roles = [] } = {}) {
    const chMap = new Map(channels.map((c) => [c.id, c]));
    const roleMap = new Map(roles.map((r) => [r.id, r]));
    roleMap.set(EVERYONE, { id: EVERYONE, name: "@everyone", position: 0, managed: false });
    return {
      id: "g1",
      name: "Server",
      iconURL: () => null,
      members: {
        me: { permissions: { has: () => canManage } },
        cache: new Map(),
        fetch: async () => ({}),
      },
      channels: { cache: chMap },
      roles: { everyone: roleMap.get(EVERYONE), cache: roleMap },
    };
  }
  function lockChannel({
    id = "ch1",
    name = "general",
    voice = false,
    thread = false,
    editThrows = false,
  } = {}) {
    const ow = new Map();
    const ch = {
      id,
      name,
      isTextBased: () => !voice,
      isVoiceBased: () => voice,
      isThread: () => thread,
      permissionOverwrites: {
        cache: ow,
        edit: async (roleId, opts) => {
          if (editThrows) throw new Error("Missing Permissions");
          const o = ow.get(roleId) || { allow: new Set(), deny: new Set() };
          for (const [k, v] of Object.entries(opts)) {
            if (v === null || v === undefined) {
              o.allow.delete(k);
              o.deny.delete(k);
            } else if (v === true) {
              o.allow.add(k);
              o.deny.delete(k);
            } else {
              o.deny.add(k);
              o.allow.delete(k);
            }
          }
          ow.set(roleId, o);
          return ch.permissionOverwrites;
        },
      },
      denied: (roleId, key) => ow.get(roleId)?.deny.has(key) === true,
    };
    return ch;
  }
  const saveMuts = () =>
    calls.mutations.filter((m) => m.name === "channelLocks:botSaveChannelLock");
  const relMuts = () =>
    calls.mutations.filter((m) => m.name === "channelLocks:botReleaseChannelLock");

  {
    reset();
    await run({ isChatInputCommand: true, commandName: "lock", noGuild: true, subcommand: "add" });
    check(
      "/lock ngoài server → báo rõ",
      replies[0]?.content.includes("chỉ hoạt động trong server"),
      replies[0]?.content,
    );
  }
  {
    reset();
    ctl.perms.manage = false;
    await run({
      isChatInputCommand: true,
      commandName: "lock",
      subcommand: "add",
      channels: { kenh: lockChannel() },
      guild: lockGuild(),
    });
    ctl.perms.manage = true;
    check(
      "/lock không đủ quyền → từ chối, KHÔNG sửa quyền kênh",
      calls.mutations.length === 0,
      JSON.stringify(calls.mutations.map((m) => m.name)),
    );
  }
  {
    // Bot thiếu Manage Channels → nói rõ, không âm thầm thử rồi im lặng.
    reset();
    const ch = lockChannel();
    await run({
      isChatInputCommand: true,
      commandName: "lock",
      subcommand: "add",
      channels: { kenh: ch },
      guild: lockGuild({ canManage: false, channels: [ch] }),
    });
    check(
      "/lock bot thiếu quyền → báo lý do",
      /Quản lý kênh/.test(replies[0]?.content || ""),
      replies[0]?.content,
    );
    check("/lock bot thiếu quyền → không đụng kênh", calls.mutations.length === 0);
  }
  {
    // Ô thời lượng TRỐNG = vô hạn → mutation không được gửi 'until'.
    reset();
    const ch = lockChannel();
    await run({
      isChatInputCommand: true,
      commandName: "lock",
      subcommand: "add",
      channels: { kenh: ch },
      guild: lockGuild({ channels: [ch] }),
    });
    const m = saveMuts()[0];
    check("/lock add: ghi bản ghi", !!m, JSON.stringify(calls.mutations.map((x) => x.name)));
    check(
      "/lock add: trống thời lượng → VÔ HẠN (không có until)",
      m?.args.until === undefined,
      JSON.stringify(m?.args),
    );
    check("/lock add: khoá @everyone", m?.args.roleId === EVERYONE, m?.args?.roleId);
    check(
      "/lock add: lưu quyền cũ (null = kế thừa)",
      m?.args.prev === null,
      JSON.stringify(m?.args?.prev),
    );
    check("/lock add: thực sự chặn quyền trên kênh", ch.denied(EVERYONE, "SendMessages") === true);
  }
  {
    reset();
    const ch = lockChannel();
    await run({
      isChatInputCommand: true,
      commandName: "lock",
      subcommand: "add",
      strings: { phut: "2h" },
      channels: { kenh: ch },
      guild: lockGuild({ channels: [ch] }),
    });
    const until = saveMuts()[0]?.args.until;
    check(
      "/lock add 2h → đặt hạn ~2 giờ",
      typeof until === "number" &&
        until - Date.now() > 100 * 60_000 &&
        until - Date.now() < 125 * 60_000,
      String(until),
    );
  }
  {
    reset();
    await run({
      isChatInputCommand: true,
      commandName: "lock",
      subcommand: "add",
      strings: { phut: "abc" },
      channels: { kenh: lockChannel() },
      guild: lockGuild({ channels: [lockChannel()] }),
    });
    check(
      "/lock thời lượng rác → báo lỗi, KHÔNG khoá",
      saveMuts().length === 0,
      replies[0]?.content,
    );
  }
  {
    // Kênh không khoá được (thread) → nói rõ thay vì im lặng.
    reset();
    const th = lockChannel({ id: "t1", thread: true });
    await run({
      isChatInputCommand: true,
      commandName: "lock",
      subcommand: "add",
      channels: { kenh: th },
      guild: lockGuild({ channels: [th] }),
    });
    check(
      "/lock thread → báo không khoá được",
      /Không khoá được/.test(replies[0]?.content || ""),
      replies[0]?.content,
    );
    check("/lock thread → không ghi bản ghi", saveMuts().length === 0);
  }
  {
    // Đã khoá rồi → bỏ qua, KHÔNG ghi đè bản ghi (giữ prev gốc).
    reset();
    const ch = lockChannel();
    ctl.queryResult = [{ channelId: "ch1", roleId: EVERYONE, kind: "text", prev: true }];
    await run({
      isChatInputCommand: true,
      commandName: "lock",
      subcommand: "add",
      channels: { kenh: ch },
      guild: lockGuild({ channels: [ch] }),
    });
    check(
      "/lock kênh đã khoá → không ghi lại",
      saveMuts().length === 0,
      JSON.stringify(calls.mutations),
    );
  }
  {
    // Khoá lỗi quyền → KHÔNG ghi bản ghi (bản ghi mà chưa khoá được thì lúc
    // mở sẽ "khôi phục" một thứ chưa từng bị đổi).
    reset();
    const ch = lockChannel({ editThrows: true });
    await run({
      isChatInputCommand: true,
      commandName: "lock",
      subcommand: "add",
      channels: { kenh: ch },
      guild: lockGuild({ channels: [ch] }),
    });
    check(
      "/lock kênh không sửa được quyền → không ghi bản ghi",
      saveMuts().length === 0,
      JSON.stringify(calls.mutations),
    );
    check(
      "/lock kênh lỗi → báo lý do",
      /Missing Permissions/.test(replies[0]?.content || ""),
      replies[0]?.content,
    );
  }
  {
    // Theo ROLE: khoá đúng role được chọn, không đụng @everyone.
    reset();
    const ch = lockChannel();
    await run({
      isChatInputCommand: true,
      commandName: "lock",
      subcommand: "add",
      roles: { role: { id: "R1" } },
      channels: { kenh: ch },
      guild: lockGuild({
        channels: [ch],
        roles: [{ id: "R1", name: "Mod", position: 1, managed: false }],
      }),
    });
    const m = saveMuts()[0];
    check("/lock theo role: ghi đúng roleId", m?.args.roleId === "R1", m?.args?.roleId);
    check(
      "/lock theo role: @everyone KHÔNG bị đụng",
      ch.denied(EVERYONE, "SendMessages") === false,
    );
  }
  {
    // Role do bot quản lý → từ chối trước khi đụng kênh.
    reset();
    const ch = lockChannel();
    await run({
      isChatInputCommand: true,
      commandName: "lock",
      subcommand: "add",
      roles: { role: { id: "R2" } },
      channels: { kenh: ch },
      guild: lockGuild({
        channels: [ch],
        roles: [{ id: "R2", name: "BotRole", position: 1, managed: true }],
      }),
    });
    check(
      "/lock role do bot quản lý → từ chối",
      saveMuts().length === 0 && /quản lý/.test(replies[0]?.content || ""),
      replies[0]?.content,
    );
  }
  {
    // ⚠️ BẤT BIẾN AN TOÀN: kênh KHÔNG do bot khoá thì KHÔNG tự mở quyền —
    // mở bừa là xoá cấu hình riêng của chủ server.
    reset();
    const ch = lockChannel();
    ctl.queryResult = [];
    await run({
      isChatInputCommand: true,
      commandName: "lock",
      subcommand: "remove",
      channels: { kenh: ch },
      guild: lockGuild({ channels: [ch] }),
    });
    check(
      "/lock remove kênh chưa từng bị khoá → KHÔNG tự mở quyền",
      relMuts().length === 0,
      JSON.stringify(calls.mutations),
    );
  }
  {
    // Có bản ghi → mở khoá thật và xoá bản ghi.
    reset();
    const ch = lockChannel();
    await run({
      isChatInputCommand: true,
      commandName: "lock",
      subcommand: "add",
      channels: { kenh: ch },
      guild: lockGuild({ channels: [ch] }),
    });
    const before = saveMuts().length;
    reset();
    ctl.queryResult = [
      { guildId: "g1", channelId: "ch1", roleId: EVERYONE, kind: "text", prev: null },
    ];
    await run({
      isChatInputCommand: true,
      commandName: "lock",
      subcommand: "remove",
      channels: { kenh: ch },
      guild: lockGuild({ channels: [ch] }),
    });
    check(
      "/lock remove: gọi xoá bản ghi",
      relMuts().length === 1,
      JSON.stringify(calls.mutations.map((m) => m.name)),
    );
    check("/lock remove: mở lại quyền trên kênh", ch.denied(EVERYONE, "SendMessages") === false);
    check(
      "/lock remove: báo đã mở",
      /Đã mở khoá/.test(replies[0]?.content || ""),
      replies[0]?.content,
    );
    void before;
  }
  {
    // unlock-all mở mọi bản ghi của role đang chọn.
    reset();
    const a = lockChannel({ id: "a", name: "a" });
    const b = lockChannel({ id: "b", name: "b" });
    ctl.queryResult = [
      { guildId: "g1", channelId: "a", roleId: EVERYONE, kind: "text", prev: null },
      { guildId: "g1", channelId: "b", roleId: EVERYONE, kind: "text", prev: null },
    ];
    await run({
      isChatInputCommand: true,
      commandName: "lock",
      subcommand: "unlock-all",
      guild: lockGuild({ channels: [a, b] }),
    });
    check(
      "/lock unlock-all: mở cả 2 kênh",
      relMuts().length === 2,
      JSON.stringify(calls.mutations.map((m) => m.name)),
    );
  }
  {
    // /lock all: bỏ qua kênh đã khoá, chỉ khoá phần còn lại.
    reset();
    const a = lockChannel({ id: "a", name: "a" });
    const b = lockChannel({ id: "b", name: "b" });
    ctl.queryResult = [
      { guildId: "g1", channelId: "a", roleId: EVERYONE, kind: "text", prev: null },
    ];
    await run({
      isChatInputCommand: true,
      commandName: "lock",
      subcommand: "all",
      guild: lockGuild({ channels: [a, b] }),
    });
    const saved = saveMuts();
    check(
      "/lock all: chỉ khoá kênh CHƯA khoá",
      saved.length === 1 && saved[0].args.channelId === "b",
      JSON.stringify(saved.map((m) => m.args.channelId)),
    );
    check(
      "/lock all: báo số kênh đã bỏ qua",
      /bỏ qua/.test(replies[0]?.content || ""),
      replies[0]?.content,
    );
  }
  {
    reset();
    ctl.queryResult = [];
    await run({
      isChatInputCommand: true,
      commandName: "lock",
      subcommand: "list",
      guild: lockGuild(),
    });
    check(
      "/lock list rỗng → nói rõ không có gì",
      /Không có kênh nào/.test(replies[0]?.content || ""),
      replies[0]?.content,
    );
  }
  {
    reset();
    const ch = lockChannel();
    ctl.queryResult = [
      { guildId: "g1", channelId: "ch1", roleId: EVERYONE, kind: "text", prev: null, until: null },
    ];
    await run({
      isChatInputCommand: true,
      commandName: "lock",
      subcommand: "list",
      guild: lockGuild({ channels: [ch] }),
    });
    check(
      "/lock list: khoá vô hạn hiện 'vô hạn'",
      /vô hạn/.test(replies[0]?.content || ""),
      replies[0]?.content,
    );
  }
  {
    // Convex hỏng lúc đọc bản ghi → KHÔNG được báo "đã khoá" rồi im lặng.
    reset();
    const ch = lockChannel();
    ctl.queryResult = null;
    const origQ = store.client.query;
    store.client.query = async () => {
      throw new Error("Convex down");
    };
    await run({
      isChatInputCommand: true,
      commandName: "lock",
      subcommand: "add",
      channels: { kenh: ch },
      guild: lockGuild({ channels: [ch] }),
    });
    store.client.query = origQ;
  }

  {
    // BẤT BIẾN AN TOÀN: ghi bản ghi HỎNG sau khi đã ghi quyền khoá thì kênh
    // bị khoá mà không có dấu vết nào để mở lại — chủ server phải tự vào
    // Discord gỡ tay. Handler phải HOÀN TÁC quyền ngay.
    reset();
    const ch = lockChannel();
    const origMutation = store.client.mutation;
    store.client.mutation = async (name, args) => {
      calls.mutations.push({ name, args });
      if (name === "channelLocks:botSaveChannelLock") throw new Error("Convex down");
      return { ok: true };
    };
    await run({
      isChatInputCommand: true,
      commandName: "lock",
      subcommand: "add",
      channels: { kenh: ch },
      guild: lockGuild({ channels: [ch] }),
    });
    store.client.mutation = origMutation;
    check(
      "/lock lưu bản ghi hỏng → TRẢ LẠI quyền, không để kênh kẹt",
      ch.denied(EVERYONE, "SendMessages") === false,
    );
    check(
      "/lock lưu bản ghi hỏng → báo rõ đã hoàn tác",
      /trả lại quyền/i.test(replies[0]?.content || ""),
      replies[0]?.content,
    );
  }

  // ── 15. autocomplete (gợi ý khi người dùng gõ) ──
  {
    // Tên rule → gợi ý cho /autoreply edit|remove.
    reset();
    configs.set("g1", { autoReplies: [{ name: "rule-a" }, { name: "rule-b" }] });
    await run({
      isAutocomplete: true,
      commandName: "autoreply",
      subcommand: "remove",
      focusedName: "name",
      focusedValue: "",
    });
    check(
      "autocomplete /autoreply remove name → gợi ý tên rule",
      Array.isArray(responses[0]) &&
        responses[0].some((c) => c.value === "rule-a") &&
        responses[0].some((c) => c.value === "rule-b"),
      JSON.stringify(responses[0]),
    );

    reset();
    await run({
      isAutocomplete: true,
      commandName: "autoreply",
      subcommand: "remove",
      focusedName: "name",
      focusedValue: "b",
    });
    check(
      "autocomplete lọc theo phần đã gõ (b → chỉ rule-b)",
      responses[0]?.length === 1 && responses[0][0].value === "rule-b",
      JSON.stringify(responses[0]),
    );

    // Từ ngữ xấu → gợi ý cho /badword remove.
    reset();
    configs.set("g1", { badWords: ["xấu", "tệ"] });
    await run({
      isAutocomplete: true,
      commandName: "badword",
      subcommand: "remove",
      focusedName: "word",
      focusedValue: "",
    });
    check(
      "autocomplete /badword remove word → gợi ý từ ngữ xấu",
      responses[0]?.some((c) => c.value === "xấu") && responses[0]?.some((c) => c.value === "tệ"),
      JSON.stringify(responses[0]),
    );

    // Module antinuke → danh sách tĩnh.
    reset();
    configs.set("g1", {});
    await run({
      isAutocomplete: true,
      commandName: "antinuke",
      subcommand: "module",
      focusedName: "module",
      focusedValue: "mass",
    });
    check(
      "autocomplete /antinuke module → gợi ý module khớp 'mass'",
      responses[0]?.some((c) => c.value === "massBan") &&
        responses[0]?.every((c) => c.value.toLowerCase().includes("mass")),
      JSON.stringify(responses[0]),
    );

    // Lệnh/option không có nguồn gợi ý → trả rỗng, không ném.
    reset();
    await run({
      isAutocomplete: true,
      commandName: "ping",
      focusedName: "x",
      focusedValue: "y",
    });
    check(
      "autocomplete lệnh không hỗ trợ → rỗng",
      Array.isArray(responses[0]) && responses[0].length === 0,
    );

    // Không guild → rỗng (không đọc config).
    reset();
    await run({
      isAutocomplete: true,
      commandName: "autoreply",
      subcommand: "remove",
      focusedName: "name",
      noGuild: true,
    });
    check("autocomplete ngoài server → rỗng", responses[0]?.length === 0);

    // Đọc cấu hình lỗi → trả rỗng, KHÔNG để Discord treo.
    reset();
    const origGetConfig = store.getConfig;
    store.getConfig = async () => {
      throw new Error("Convex down");
    };
    await run({
      isAutocomplete: true,
      commandName: "badword",
      subcommand: "remove",
      focusedName: "word",
    });
    store.getConfig = origGetConfig;
    check("autocomplete đọc cấu hình lỗi → rỗng (không ném)", responses[0]?.length === 0);

    // Chặn trần 25 gợi ý của Discord.
    reset();
    configs.set("g1", { badWords: Array.from({ length: 40 }, (_, i) => "w" + i) });
    await run({
      isAutocomplete: true,
      commandName: "badword",
      subcommand: "remove",
      focusedName: "word",
      focusedValue: "w",
    });
    check("autocomplete cắt về tối đa 25 gợi ý", responses[0]?.length === 25);
  }

  fs.unlinkSync(DJS_MOCK);
  console.log(`\nKết quả interaction create: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
