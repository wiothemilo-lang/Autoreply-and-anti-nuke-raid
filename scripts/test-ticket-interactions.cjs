// TEST: interactionCreate.js — BỀ MẶT TƯƠNG TÁC TICKET + /ping + /health.
//
// Vì sao tách suite riêng: `scripts/test-interaction-create.cjs` nạp module
// THẬT của `./tickets` và `./lang` (nên coverage handlers/tickets.js tốt), còn
// suite này MOCK chúng để kiểm đúng LỚP DẮN KẾT của interactionCreate: rẫy
// customId, quyền staff, điều kiện lỗi, thứ tự mutation. Trước khi có suite này
// toàn bộ khoảng dòng 107-481 của interactionCreate.js chưa hề chạy — tức là
// mọi nút/modal ticket thêm ở đợt nâng cấp gần nhất chưa từng được test.
//
// Chạy: node scripts/test-ticket-interactions.cjs
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
  constructor(data = {}) { this.d = { ...data }; }
  setColor(c) { this.d.color = c; return this; }
  setTitle(t) { this.d.title = t; return this; }
  setDescription(t) { this.d.description = t; return this; }
  addFields(...f) { this.d.fields = [...(this.d.fields ?? []), ...f.flat(Infinity)]; return this; }
  setTimestamp() { return this; }
  setFooter(f) { this.d.footer = f; return this; }
  setThumbnail() { return this; }
  setImage() { return this; }
}
class ActionRowBuilder {
  constructor() { this.components = []; }
  addComponents(...c) { this.components.push(...c.flat(Infinity)); return this; }
}
class ButtonBuilder {
  setCustomId(v) { this.customId = v; return this; }
  setLabel(v) { this.label = v; return this; }
  setStyle(v) { this.style = v; return this; }
}
module.exports = {
  Colors: new Proxy({}, { get: () => 0x000000 }),
  EmbedBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle: { Primary: 1, Success: 2, Danger: 3, Secondary: 4 },
  ChannelType: { GuildText: 0, GuildCategory: 4 },
  PermissionFlagsBits: new Proxy({}, { get: () => 1n << 4n }),
  Partials: {},
  GatewayIntentBits: new Proxy({}, { get: () => 0 }),
};
`,
);

// Bảng chuỗi ticket giả — chỉ cần đủ các khoá interactionCreate.js dùng.
const T = {
  errDisabled: "TICKET_DISABLED",
  errNoStaff: "ERR_NO_STAFF",
  errBotAccount: "ERR_BOT_ACCOUNT",
  myTicket: "MY_TICKET {ch} {link}",
  myTicketNone: "MY_TICKET_NONE",
  myTicketGone: "MY_TICKET_GONE",
  errUnknown: "ERR_UNKNOWN",
  errNoPerm: "ERR_NO_PERM",
  errHierarchy: "ERR_HIERARCHY",
  errChannelsFull: "ERR_CHANNELS_FULL",
  errCooldown: "ERR_COOLDOWN_{h}h",
  errMaxOpen: "ERR_MAX_{n}/{max}",
  errAlreadyOpen: "ERR_ALREADY_{ch}",
  errRequiredFields: "ERR_REQUIRED_{fields}",
  unclaimDone: "UNCLAIM_DONE",
  claimMine: "CLAIM_MINE",
  claimTaken: "CLAIM_TAKEN_{staff}",
  claimDone: "CLAIM_DONE_{staff}",
  closedTitle: "CLOSED_TITLE",
  closedBy: "CLOSED_BY",
  notBanned: "NOT_BANNED_{user}",
  notStaff: "NOT_STAFF",
  reasonRequired: "REASON_REQUIRED",
  closedWithReason: "CLOSED_REASON_{reason}",
  aiEmpty: "AI_EMPTY",
  okSent: "OK_SENT",
  dmFailed: "DM_FAILED",
  okOpened: "OK_OPENED_{ch}",
  closeOwnDone: "CLOSE_OWN_DONE",
  closeOwnDenied: "CLOSE_OWN_DENIED",
  claimClosed: "CLAIM_CLOSED",
  errTicketGone: "ERR_TICKET_GONE",
};

const ctl = {
  modLogs: [],
  staff: true,
  manage: true,
  openResult: { ok: true, channelId: "ch-new" },
  closeResult: { closed: true },
  claimResult: { ok: true },
  claimThrows: false,
  unclaimThrows: false,
  closeMutThrows: false,
  unbanThrows: false,
  queryThrows: false,
  ticketRow: { status: "open", openerId: "u-opener" },
  aiAvailable: true,
  aiAnswer: "Tóm tắt ticket",
  aiThrows: false,
  aiStats: null,
  guildFetchOk: true,
  pinFirst: true,
  pinThrows: false,
  calls: [],
};

const ticketsMock = {
  langFor: () => "vi",
  staffRoleIds: (config) =>
    config?.ticketStaffRoleId
      ? [config.ticketStaffRoleId]
      : Array.isArray(config?.modRoles)
        ? config.modRoles
        : [],
  // Bản sao đúng logic `parseTicketId` thật (ID_SEP = ":").
  parseTicketId: (customId) => {
    const i = String(customId ?? "").indexOf(":");
    if (i < 0) return null;
    const action = String(customId).slice(0, i);
    const ticketId = String(customId).slice(i + 1);
    return ticketId ? { action, ticketId } : null;
  },
  appealModal: (t) => ({ kind: "appeal", t }),
  openModal: (t, kind) => ({ kind: `open:${kind}`, t }),
  aiModal: (t) => ({ kind: "ai", t }),
  closeReasonModal: (t, ticketId) => ({ kind: "closeReason", ticketId, t }),
  escapePayload: (s) => s,
  openTicket: async (o) => {
    ctl.calls.push({ fn: "openTicket", args: o });
    return ctl.openResult;
  },
  closeTicketWithReason: async (o) => {
    ctl.calls.push({ fn: "closeTicketWithReason", args: o });
    return ctl.closeResult;
  },
  closeTicketChannel: async (o) => {
    ctl.calls.push({ fn: "closeTicketChannel", args: o });
  },
};

const ticketCoreMock = {
  isStaff: (member, ids) => {
    if (!member) return false;
    const roles = member.roles?.cache || member.roles;
    if (roles && typeof roles.has === "function") return ids.some((id) => roles.has(id));
    return false;
  },
  sanitizeCloseReason: (raw) =>
    String(raw || "")
      .trim()
      .slice(0, 300),
  // Loại ticket tuỳ chỉnh (29/09/2026): interactionCreate gọi 2 hàm này để tra
  // key trên customId. Mock đúng hành vi của bản thật cho danh sách rỗng
  // (rơi về 2 loại cứng) — nếu mock trả `undefined` thì mọi nhánh nút "Mở
  // ticket" sẽ vỡ và suite báo lỗi KHÔNG LIÊN QUAN tới thay đổi này.
  normalizeKinds: (raw) => (Array.isArray(raw) && raw.length > 0 ? raw : DEFAULT_MOCK_KINDS),
  normalizeKind: (kind, kinds) => {
    const list = Array.isArray(kinds) && kinds.length > 0 ? kinds : DEFAULT_MOCK_KINDS;
    return list.some((k) => k.key === kind) ? kind : list[0].key;
  },
  findKind: (kinds, key) => (kinds || []).find((k) => k.key === key) ?? null,
  // Ô nhập bổ sung (phương án B): mock trả danh sách rỗng — đúng hành vi loại
  // cũ, và giữ suite này tập trung vào dẫn kết thay vì dựng modal.
  buildModalSpec: (kind) => ({
    customId: "ticket_open_submit:" + (kind?.key ?? "support"),
    extraFields: [],
  }),
  collectExtraValues: () => [],
};

/** 2 loại cứng — mirror `defaultTicketKinds()` của ticketCore.js. */
const DEFAULT_MOCK_KINDS = [
  { key: "support", label: "Hỗ trợ chung", staffRoleIds: [] },
  { key: "appeal", label: "Khiếu nại hình phạt", staffRoleIds: [] },
];

const aiMock = {
  researchAvailable: () => ctl.aiAvailable,
  researchChat: async (messages) => {
    ctl.calls.push({ fn: "researchChat", args: messages });
    if (ctl.aiThrows) throw new Error("provider 500");
    return ctl.aiAnswer;
  },
  aiStats: () => ctl.aiStats,
};

const utilMock = {
  canManageGuild: () => ctl.manage,
  isAdmin: () => false,
  canManageWithConfig: () => ctl.manage,
  async sendLog() {},
  async sendModLog(guild, config, embed) {
    ctl.modLogs.push(embed);
  },
};

const origLoad = Module._load;
Module._load = function (request, parent) {
  // Sau #5 tách monolith (03/10/2026), lớp dẫn ticket nằm ở
  // interactionTicketFlow.js (cùng "họ" interaction*) — mock phủ cả họ, cùng
  // ngữ nghĩa: mọi require của code handler đều nhận mock như trước khi tách.
  const fromIC = parent && /handlers[\\/]interaction[A-Za-z]*\.js$/.test(parent.filename);
  if (fromIC) {
    if (request === "../util") return utilMock;
    if (request === "../lockdown")
      return { isLocked: () => false, markLocked: () => {}, async unlockGuild() {} };
    if (request === "./hidden") return { emojiKeyOf: (e) => String(e).trim() };
    if (request === "./modTools") {
      return {
        parseDuration: () => null,
        canMod: () => true,
        async timeoutMember() {},
        async kickMember() {},
        async banMember() {},
        async purgeChannel() {},
        async untimeoutMember() {},
        async unwarnMember() {},
        async unbanMember(o) {
          ctl.calls.push({ fn: "unbanMember", args: o });
          if (ctl.unbanThrows) throw new Error("Unknown Ban");
          return { ok: true };
        },
      };
    }
    if (request === "../captchaStore") return { genCaptcha: () => "000000", setCode: () => {} };
    if (request === "../altDetection")
      return {
        analyzeNewMember: async () => ({ riskScore: 0, action: "pass", riskFactors: [] }),
        async executePunishment() {
          return { executed: false };
        },
        buildRiskEmbed: () => new (require(DJS_MOCK).EmbedBuilder)(),
      };
    if (request === "./incidentReport") return { reportInteractive: async () => {} };
    if (request === "./researchCommands") return { handleResearch: async () => {} };
    if (request === "./tickets") return ticketsMock;
    if (request === "./lang") return { ticketText: () => T, languageCommand: async () => {} };
    if (request === "../ticketCore") return ticketCoreMock;
    if (request === "../ai") return aiMock;
  }
  return origLoad.apply(this, arguments);
};

(async () => {
  const onInteractionCreate = require("../bot/src/handlers/interactionCreate");

  let pass = 0;
  let fail = 0;
  const check = (label, cond) => {
    console.log(`${cond ? "PASS" : "FAIL"} ${label}`);
    cond ? pass++ : fail++;
  };

  const configs = new Map();
  const store = {
    getConfig: async (id) => configs.get(id) ?? null,
    invalidate: () => {},
    client: {
      mutation: async (name, args) => {
        ctl.calls.push({ fn: "mutation", name, args });
        if (name === "bot_writes:botClaimTicket" && ctl.claimThrows) throw new Error("claim fail");
        if (name === "bot_writes:botUnclaimTicket" && ctl.unclaimThrows)
          throw new Error("unclaim fail");
        if (name === "bot_writes:botCloseTicket" && ctl.closeMutThrows)
          throw new Error("close fail");
        return ctl.claimResult;
      },
      query: async (name, args) => {
        ctl.calls.push({ fn: "query", name, args });
        if (name === "tickets:botTicketState") {
          if (ctl.stateThrows) throw new Error("Convex down");
          return ctl.myTicketState;
        }
        return null;
      },
    },
  };
  const heat = {};

  const replies = [];
  const shownModals = [];
  const guild = { id: "g1", name: "Server", channels: { cache: new Map() } };

  const client = {
    ws: { ping: 42.4 },
    guilds: {
      cache: new Map([["g1", guild]]),
      fetch: async () => (ctl.guildFetchOk ? guild : null),
    },
    query: async (name) => {
      ctl.calls.push({ fn: "clientQuery", name });
      if (ctl.queryThrows) throw new Error("Convex down");
      return ctl.ticketRow;
    },
  };

  function reset() {
    ctl.modLogs.length = 0;
    ctl.calls.length = 0;
    replies.length = 0;
    shownModals.length = 0;
    configs.clear();
    ctl.staff = true;
    ctl.manage = true;
    ctl.openResult = { ok: true, channelId: "ch-new" };
    ctl.closeResult = { closed: true };
    ctl.claimResult = { ok: true };
    ctl.claimThrows = false;
    ctl.unclaimThrows = false;
    ctl.closeMutThrows = false;
    ctl.unbanThrows = false;
    ctl.queryThrows = false;
    ctl.stateThrows = false;
    ctl.myTicketState = null;
    ctl.ticketRow = { status: "open", openerId: "u-opener" };
    ctl.aiAvailable = true;
    ctl.aiAnswer = "Tóm tắt ticket";
    ctl.aiThrows = false;
    ctl.aiStats = null;
    ctl.guildFetchOk = true;
    ctl.pinFirst = true;
    ctl.pinThrows = false;
  }

  function mkMember({ staff = true, id = "u-staff" } = {}) {
    const roles = new Map();
    if (staff) roles.set("r-staff", {});
    return { id, user: { id, username: "mod" }, roles: { cache: roles } };
  }

  function mkInteraction(opts = {}) {
    const member = opts.member ?? mkMember({ staff: ctl.staff });
    const i = {
      user: opts.user ?? { id: "u-staff", username: "mod", bot: false },
      member: opts.memberOverride ?? member,
      guild: opts.noGuild ? null : guild,
      channel: opts.channel ?? { id: "ch-ticket", name: "ticket-1" },
      isButton: () => !!opts.isButton,
      isChatInputCommand: () => !!opts.isChatInputCommand,
      isModalSubmit: () => !!opts.isModalSubmit,
      customId: opts.customId,
      commandName: opts.commandName,
      locale: "vi",
      fields: {
        getTextInputValue: (k) => opts.fields?.[k] ?? null,
      },
      reply: async (p) => {
        replies.push(p);
        return {};
      },
      deferReply: async (p) => {
        replies.push({ ...(p ?? {}), deferred: true });
        return {};
      },
      editReply: async (p) => {
        replies.push({ ...p, edited: true });
        return {};
      },
      showModal: async (m) => {
        shownModals.push(m);
        return {};
      },
      options: {
        getSubcommand: () => opts.subcommand,
        getString: (n) => opts.strings?.[n] ?? null,
      },
    };
    return i;
  }

  const run = (opts) => onInteractionCreate(client, mkInteraction(opts), store, heat);
  const lastReply = () => replies[replies.length - 1]?.content ?? "";
  const callsTo = (fn) => ctl.calls.filter((c) => c.fn === fn);
  const mutationNamed = (name) => ctl.calls.find((c) => c.fn === "mutation" && c.name === name);

  // ═════════ NÚT "Mở khiếu nại" TRONG DM (ticket_open_dm) ═════════
  {
    reset();
    ctl.guildFetchOk = false;
    await run({ isButton: true, customId: "ticket_open_dm", noGuild: true });
    check(
      "ticket_open_dm: không còn server → báo rõ",
      lastReply().includes("Không tìm thấy server"),
    );
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: false });
    await run({ isButton: true, customId: "ticket_open_dm" });
    check("ticket_open_dm: ticket tắt → báo tắt", lastReply() === T.errDisabled);
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    await run({ isButton: true, customId: "ticket_open_dm" });
    check(
      "ticket_open_dm: bật → mở modal khiếu nại",
      shownModals.length === 1 && shownModals[0].kind === "appeal",
    );
  }

  // ═════════ MODAL KHIẾU NẠI (ticket_appeal_dm) ═════════
  {
    reset();
    ctl.guildFetchOk = false;
    await run({
      isModalSubmit: true,
      customId: "ticket_appeal_dm",
      noGuild: true,
      fields: { ticket_body: "x", ticket_evidence: "y" },
    });
    check("appeal modal: không còn server → báo rõ", lastReply().includes("Không tìm thấy server"));
  }
  {
    reset();
    await run({
      isModalSubmit: true,
      customId: "ticket_appeal_dm",
      fields: { ticket_body: "   ", ticket_evidence: "" },
    });
    check("appeal modal: nội dung rỗng → yêu cầu nhập", lastReply() === T.aiEmpty);
  }
  {
    reset();
    await run({
      isModalSubmit: true,
      customId: "ticket_appeal_dm",
      fields: { ticket_body: "Bị ban oan", ticket_evidence: "https://x" },
    });
    const call = callsTo("openTicket")[0];
    check(
      "appeal modal: thành công → mở ticket staff-only (openerOnly false)",
      call &&
        call.args.kind === "appeal" &&
        call.args.source === "dm" &&
        call.args.openerOnly === false,
    );
    check("appeal modal: defer rồi sửa reply OK", lastReply() === T.okSent);
  }
  {
    reset();
    ctl.openResult = { ok: false, code: "errCooldown", waitHours: 5 };
    await run({
      isModalSubmit: true,
      customId: "ticket_appeal_dm",
      fields: { ticket_body: "Bị ban oan", ticket_evidence: "" },
    });
    check(
      "appeal modal: còn cooldown → báo số giờ còn lại",
      lastReply().includes("ERR_COOLDOWN_5h") && lastReply().includes(T.dmFailed),
    );
  }

  // ═════════ NÚT THAO TÁC TRONG KÊNH TICKET ═════════
  {
    reset();
    await run({ isButton: true, customId: "ticket_claim" });
    check("nút ticket không kèm id → im lặng (không reply)", replies.length === 0);
  }
  {
    reset();
    await run({ isButton: true, customId: "ticket_claim:t1", noGuild: true });
    check("nút ticket ngoài server → im lặng", replies.length === 0);
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    await run({
      isButton: true,
      customId: "ticket_claim:t1",
      member: mkMember({ staff: false }),
    });
    check("nút ticket: không phải staff → từ chối", lastReply() === T.errNoStaff);
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    const pinned = [];
    await run({
      isButton: true,
      customId: "ticket_pin:t1",
      channel: {
        id: "ch-ticket",
        messages: {
          fetch: async () => ({
            last: () => (ctl.pinFirst ? { pin: async () => pinned.push(1) } : null),
          }),
        },
      },
    });
    check(
      "nút ghim: có tin nhắn → ghim + báo",
      pinned.length === 1 && lastReply().includes("Đã ghim"),
    );
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    ctl.pinFirst = false;
    await run({
      isButton: true,
      customId: "ticket_pin:t1",
      channel: { id: "ch-ticket", messages: { fetch: async () => ({ last: () => null }) } },
    });
    check("nút ghim: kênh trống → báo chưa có tin nhắn", lastReply().includes("Chưa có tin nhắn"));
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    ctl.pinThrows = true;
    await run({
      isButton: true,
      customId: "ticket_pin:t1",
      channel: {
        id: "ch-ticket",
        messages: {
          fetch: async () => {
            throw new Error("Missing Permissions");
          },
        },
      },
    });
    check(
      "nút ghim: lỗi quyền → không crash, báo chưa ghim được",
      lastReply().includes("Chưa có tin nhắn"),
    );
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    await run({ isButton: true, customId: "ticket_ai:t1" });
    check("nút ghi chú AI → mở modal", shownModals.length === 1 && shownModals[0].kind === "ai");
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    ctl.claimResult = { ok: true };
    await run({ isButton: true, customId: "ticket_claim:t1" });
    const m = mutationNamed("bot_writes:botClaimTicket");
    check(
      "nút nhận việc: ghi staffId + staffName",
      m && m.args.staffId === "u-staff" && m.args.staffName === "mod",
    );
    check("nút nhận việc: thành công → báo tên mình", lastReply() === "CLAIM_DONE_mod");
    // Trước đây nhận việc không để lại dấu vết nào ngoài DB → không trả lời
    // được "ai đã nhận khiếu nại này" (28/09/2026).
    check(
      "nút nhận việc: ghi mod log",
      ctl.modLogs.length === 1 && String(ctl.modLogs[0].d?.title).includes("Nhận ticket"),
      JSON.stringify(ctl.modLogs.map((e) => e.d?.title)),
    );
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    ctl.claimResult = { ok: false, taken: false, alreadyMine: true };
    await run({ isButton: true, customId: "ticket_claim:t1" });
    check("nút nhận việc: đã là của mình → báo riêng", lastReply() === T.claimMine);
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    ctl.claimResult = { ok: false, taken: true, byName: "mod2" };
    await run({ isButton: true, customId: "ticket_claim:t1" });
    check(
      "nút nhận việc: mod khác đã nhận → nêu tên người nhận",
      lastReply() === "CLAIM_TAKEN_mod2",
    );
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    ctl.claimThrows = true;
    await run({ isButton: true, customId: "ticket_claim:t1" });
    check("nút nhận việc: mutation lỗi → báo lỗi chung", lastReply() === T.errUnknown);
  }
  {
    // Ticket ĐÃ ĐÓNG: panel vẫn còn nút "Nhận việc" trong kênh `closed-*`.
    // Không có nhánh này thì bot rơi xuống claimTaken với byName=null →
    // "đã có ? nhận từ trước" — vừa sai vừa rối.
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    ctl.claimResult = { ok: false, reason: "closed" };
    await run({ isButton: true, customId: "ticket_claim:t1" });
    check("nút nhận việc: ticket đã đóng → báo riêng", lastReply() === T.claimClosed);
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    await run({ isButton: true, customId: "ticket_unclaim:t1" });
    check(
      "nút bỏ nhận: gọi botUnclaimTicket",
      !!mutationNamed("bot_writes:botUnclaimTicket") && lastReply() === T.unclaimDone,
    );
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    ctl.unclaimThrows = true;
    await run({ isButton: true, customId: "ticket_unclaim:t1" });
    check("nút bỏ nhận: mutation lỗi → báo lỗi chung", lastReply() === T.errUnknown);
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    await run({ isButton: true, customId: "ticket_close_reason" });
    // Không có ":" → parseTicketId trả null → handler bỏ qua im lặng, không
    // mở modal sai (modal cần ticketId để biết đóng ticket nào).
    check(
      "nút đóng kèm lý do: thiếu id → im lặng, không mở modal",
      replies.length === 0 && shownModals.length === 0,
    );
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    await run({ isButton: true, customId: "ticket_close_reason:t1" });
    check(
      "nút đóng kèm lý do → mở modal kèm ticketId",
      shownModals.length === 1 &&
        shownModals[0].kind === "closeReason" &&
        shownModals[0].ticketId === "t1",
    );
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    await run({ isButton: true, customId: "ticket_close:t1" });
    check("nút đóng: đóng kênh", callsTo("closeTicketChannel").length === 1);
    const m = mutationNamed("bot_writes:botCloseTicket");
    check(
      "nút đóng: ghi trạng thái closed + người đóng",
      m &&
        m.args.status === "closed" &&
        m.args.closedById === "u-staff" &&
        m.args.unbanned === false,
    );
    check("nút đóng: báo đã đóng", lastReply().includes(T.closedBy));
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    ctl.ticketRow = null;
    await run({ isButton: true, customId: "ticket_close:t1" });
    check(
      "nút đóng: bản ghi không còn → từ chối, KHÔNG đóng kênh",
      lastReply() === T.errTicketGone && callsTo("closeTicketChannel").length === 0,
    );
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    ctl.queryThrows = true;
    await run({ isButton: true, customId: "ticket_close:t1" });
    check(
      "nút đóng: Convex lỗi → từ chối an toàn, không đóng kênh",
      lastReply() === T.errTicketGone && callsTo("closeTicketChannel").length === 0,
    );
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    await run({ isButton: true, customId: "ticket_unban:t1" });
    const unban = callsTo("unbanMember")[0];
    check(
      "nút gỡ ban: gọi unbanMember với openerId",
      unban && unban.args.userId === "u-opener" && unban.args.executor.id === "u-staff",
    );
    check(
      "nút gỡ ban: ghi unbanned = true",
      mutationNamed("bot_writes:botCloseTicket")?.args.unbanned === true,
    );
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    ctl.unbanThrows = true;
    await run({ isButton: true, customId: "ticket_unban:t1" });
    check(
      "nút gỡ ban: không có ban để gỡ → báo riêng, KHÔNG đóng ticket",
      lastReply() === "NOT_BANNED_<@u-opener>" && callsTo("closeTicketChannel").length === 0,
    );
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    ctl.closeMutThrows = true;
    await run({ isButton: true, customId: "ticket_close:t1" });
    check(
      "nút đóng: ghi trạng thái lỗi → vẫn đóng kênh và báo thành công (best-effort)",
      callsTo("closeTicketChannel").length === 1 && lastReply().includes(T.closedTitle),
    );
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    await run({ isButton: true, customId: "ticket_zzz:t1" });
    check(
      "nút lạ → báo ticket không còn trong hệ thống",
      lastReply().includes("không còn trong hệ thống"),
    );
  }

  // ═════════ MODAL ĐÓNG KÈM LÝ DO ═════════
  {
    reset();
    await run({
      isModalSubmit: true,
      customId: "ticket_close_reason_submit:t1",
      noGuild: true,
      fields: { ticket_close_reason_body: "x" },
    });
    check("modal đóng lý do: ngoài server → im lặng", replies.length === 0);
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    await run({
      isModalSubmit: true,
      customId: "ticket_close_reason_submit:t1",
      member: mkMember({ staff: false }),
      fields: { ticket_close_reason_body: "x" },
    });
    check("modal đóng lý do: không phải staff → từ chối", lastReply() === T.notStaff);
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    await run({
      isModalSubmit: true,
      customId: "ticket_close_reason_submit:t1",
      fields: { ticket_close_reason_body: "   " },
    });
    check("modal đóng lý do: lý do rỗng → bắt buộc nhập", lastReply() === T.reasonRequired);
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    ctl.ticketRow = { status: "closed", openerId: "u-opener" };
    await run({
      isModalSubmit: true,
      customId: "ticket_close_reason_submit:t1",
      fields: { ticket_close_reason_body: "Đã giải quyết" },
    });
    check(
      "modal đóng lý do: ticket đã đóng → từ chối",
      lastReply() === T.errUnknown && callsTo("closeTicketWithReason").length === 0,
    );
  }
  {
    reset();
    configs.set("g1", {
      ticketEnabled: true,
      ticketStaffRoleId: "r-staff",
      ticketCloseGraceHours: 12,
    });
    await run({
      isModalSubmit: true,
      customId: "ticket_close_reason_submit:t1",
      fields: { ticket_close_reason_body: "  Đã giải quyết  " },
    });
    const call = callsTo("closeTicketWithReason")[0];
    check(
      "modal đóng lý do: truyền lý do đã trim + graceHours",
      call && call.args.reason === "Đã giải quyết" && call.args.graceHours === 12,
    );
    check("modal đóng lý do: báo đã đóng kèm lý do", lastReply() === "CLOSED_REASON_Đã giải quyết");
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    ctl.closeResult = { closed: false };
    await run({
      isModalSubmit: true,
      customId: "ticket_close_reason_submit:t1",
      fields: { ticket_close_reason_body: "lý do" },
    });
    check("modal đóng lý do: đóng hỏng → báo lỗi chung", lastReply() === T.errUnknown);
  }

  // ═════════ MODAL GHI CHÚ AI ═════════
  {
    reset();
    await run({
      isModalSubmit: true,
      customId: "ticket_ai_note",
      noGuild: true,
      fields: { ticket_ai_body: "x" },
    });
    check("modal AI: ngoài server → im lặng", replies.length === 0);
  }
  {
    reset();
    await run({
      isModalSubmit: true,
      customId: "ticket_ai_note",
      fields: { ticket_ai_body: "  " },
    });
    check("modal AI: ghi chú rỗng → yêu cầu nhập", lastReply() === T.aiEmpty);
  }
  {
    reset();
    ctl.aiAvailable = false;
    await run({
      isModalSubmit: true,
      customId: "ticket_ai_note",
      fields: { ticket_ai_body: "tình hình" },
    });
    check("modal AI: chưa có key → báo chưa sẵn sàng", lastReply().includes("AI chưa sẵn sàng"));
  }
  {
    reset();
    await run({
      isModalSubmit: true,
      customId: "ticket_ai_note",
      fields: { ticket_ai_body: "tình hình" },
    });
    const call = callsTo("researchChat")[0];
    check(
      "modal AI: gửi prompt có system + escapePayload",
      call &&
        call.args.length === 2 &&
        call.args[0].role === "system" &&
        call.args[1].content === "tình hình",
    );
    check("modal AI: trả lời của AI", lastReply() === "Tóm tắt ticket");
  }
  {
    reset();
    ctl.aiThrows = true;
    await run({
      isModalSubmit: true,
      customId: "ticket_ai_note",
      fields: { ticket_ai_body: "tình hình" },
    });
    check(
      "modal AI: provider lỗi → báo lỗi, không crash",
      lastReply().includes("AI lỗi: provider 500"),
    );
  }

  // ═════════ PANEL MỞ TICKET: nút trong kênh công khai ═════════
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketCategoryId: "cat1" });
    await run({ isButton: true, customId: "ticket_open:support" });
    check(
      "nút mở ticket → mở modal hỏi trước (chưa tạo kênh)",
      shownModals.length === 1 &&
        shownModals[0].kind === "open:support" &&
        callsTo("openTicket").length === 0,
    );
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketCategoryId: "cat1" });
    await run({ isButton: true, customId: "ticket_open:appeal" });
    check(
      "nút khiếu nại → modal loại appeal",
      shownModals.length === 1 && shownModals[0].kind === "open:appeal",
    );
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: false });
    await run({ isButton: true, customId: "ticket_open:support" });
    check("nút mở: ticket tắt → báo tắt", lastReply() === T.errDisabled);
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true });
    await run({
      isButton: true,
      customId: "ticket_open:support",
      user: { id: "b1", username: "bot", bot: true },
    });
    check("nút mở: bot account → từ chối", lastReply() === T.errBotAccount);
  }
  {
    reset();
    await run({
      isButton: true,
      customId: "ticket_open:support",
      noGuild: true,
    });
    check("nút mở: ngoài server → báo chỉ dùng trong server", replies.length === 1);
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true });
    await run({
      isModalSubmit: true,
      customId: "ticket_open_submit:support",
      fields: { ticket_body: "Cần hỗ trợ", ticket_evidence: "link" },
    });
    const call = callsTo("openTicket")[0];
    check(
      "modal mở: tạo ticket source=panel, openerOnly=true (thành viên cần đọc trong kênh)",
      call &&
        call.args.source === "panel" &&
        call.args.kind === "support" &&
        call.args.openerOnly === true,
    );
    check("modal mở: báo đã mở kèm link kênh", lastReply() === "OK_OPENED_<#ch-new>");
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true });
    await run({
      isModalSubmit: true,
      customId: "ticket_open_submit:appeal",
      fields: { ticket_body: "Phạt oan", ticket_evidence: "" },
    });
    check("modal mở: loại appeal từ customId", callsTo("openTicket")[0]?.args.kind === "appeal");
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true });
    await run({
      isModalSubmit: true,
      customId: "ticket_open_submit:support",
      fields: { ticket_body: "  ", ticket_evidence: "" },
    });
    check("modal mở: nội dung rỗng → yêu cầu nhập", lastReply() === T.aiEmpty);
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true });
    ctl.openResult = { ok: false, code: "errCooldown", waitHours: 3 };
    await run({
      isModalSubmit: true,
      customId: "ticket_open_submit:support",
      fields: { ticket_body: "Cần hỗ trợ", ticket_evidence: "" },
    });
    check("modal mở: còn cooldown → báo số giờ", lastReply() === "ERR_COOLDOWN_3h");
  }

  // ═════════ NÚT "TÔI TỰ ĐÓNG" — chỉ người mở được bấm ═════════
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    ctl.ticketRow = { status: "open", openerId: "u-staff" };
    await run({ isButton: true, customId: "ticket_close_own:t1" });
    check("tự đóng: người mở bấm → đóng kênh", callsTo("closeTicketChannel").length === 1);
    check("tự đóng: báo cảm ơn", lastReply() === T.closeOwnDone);
  }
  {
    // Lỗi thật 28/09/2026: cổng staff đứng TRƯỚC mọi hành động nên thành viên
    // (đối tượng duy nhất của nút này) bấm "Tôi tự đóng" chỉ nhận được
    // "chủ server chưa cấu hình role staff" — tính năng chết im lặng.
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    ctl.ticketRow = { status: "open", openerId: "u-thanhvien" };
    await run({
      isButton: true,
      customId: "ticket_close_own:t1",
      member: mkMember({ staff: false, id: "u-thanhvien" }),
      user: { id: "u-thanhvien", username: "minh", bot: false },
    });
    check(
      "tự đóng: THÀNH VIÊN mở ticket tự đóng được (không bị cổng staff chặn)",
      callsTo("closeTicketChannel").length === 1 && lastReply() === T.closeOwnDone,
      String(lastReply()),
    );
  }
  {
    // ...nhưng người KHÔNG phải staff và KHÔNG phải người mở vẫn bị chặn đúng.
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    ctl.ticketRow = { status: "open", openerId: "u-KHAC" };
    await run({
      isButton: true,
      customId: "ticket_close_own:t1",
      member: mkMember({ staff: false, id: "u-thanhvien" }),
      user: { id: "u-thanhvien", username: "minh", bot: false },
    });
    check(
      "tự đóng: thành viên bấm nút của ticket NGƯỜI KHÁC → từ chối",
      lastReply() === T.closeOwnDenied && callsTo("closeTicketChannel").length === 0,
      String(lastReply()),
    );
  }
  {
    // Các nút staff KHÁC vẫn phải bị cổng chặn — nếu lỡ nới quá rộng thì đây
    // là chỗ bắt (đóng/gỡ ban/nhận việc tuyệt đối không dành cho thành viên).
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    ctl.ticketRow = { status: "open", openerId: "u-KHAC" };
    await run({
      isButton: true,
      customId: "ticket_close:t1",
      member: mkMember({ staff: false, id: "u-thanhvien" }),
      user: { id: "u-thanhvien", username: "minh", bot: false },
    });
    check(
      "nút Đóng của staff: thành viên bấm vẫn bị chặn",
      lastReply() === T.errNoStaff && callsTo("closeTicketChannel").length === 0,
      String(lastReply()),
    );
  }
  {
    // Dashboard đóng ticket chỉ đổi trạng thái trong DB — kênh Discord vẫn
    // còn tên cũ và quyền cũ. Chặn nút ở kênh lúc này là NGÕ CỤT: staff đóng
    // từ web rồi không bao giờ khoá được kênh, cũng không gỡ ban được.
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    ctl.ticketRow = { status: "closed", openerId: "u-staff" };
    await run({ isButton: true, customId: "ticket_close:t1" });
    check(
      "nút Đóng: ticket đã đóng từ DASHBOARD vẫn khoá được kênh",
      callsTo("closeTicketChannel").length === 1,
      String(lastReply()),
    );
    check(
      "bấm lại trên ticket đã đóng KHÔNG ghi đè closedAt (không đẩy lùi dọn kênh)",
      !mutationNamed("bot_writes:botCloseTicket"),
    );
  }
  {
    // Ngược lại: ticket đã bị dọn (kênh xoá sau khi lưu transcript) thì mọi
    // nút phải chết hẳn — bấm tiếp chỉ đổi vỏ quả.
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    ctl.ticketRow = { status: "locked", openerId: "u-staff" };
    await run({ isButton: true, customId: "ticket_close:t1" });
    check(
      "nút Đóng: ticket đã bị dọn (locked) → từ chối, báo đúng nguyên nhân",
      lastReply() === T.errTicketGone && callsTo("closeTicketChannel").length === 0,
      String(lastReply()),
    );
  }
  {
    // Lỗi thật 28/09: staff đóng ticket khiếu nại từ dashboard rồi muốn gỡ
    // ban qua nút trong kênh — trước đây bị chặn vì bản ghi không còn `open`.
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    ctl.ticketRow = { status: "closed", openerId: "u-opener" };
    await run({ isButton: true, customId: "ticket_unban:t1" });
    check(
      "nút Gỡ ban: ticket đã đóng từ dashboard vẫn gỡ ban được",
      callsTo("unbanMember").length === 1,
      String(lastReply()),
    );
  }
  {
    // Mod log: đóng / nhận / bỏ nhận — hành động ticket phải để lại dấu vết
    // trong kênh log mod, không chỉ nằm trong DB.
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    ctl.ticketRow = { status: "open", openerId: "u-opener", openerName: "minh" };
    await run({ isButton: true, customId: "ticket_close:t1" });
    check(
      "nút Đóng: ghi mod log kèm người đóng + người mở",
      ctl.modLogs.length === 1 &&
        String(ctl.modLogs[0].d?.description).includes("mod") &&
        String(ctl.modLogs[0].d?.description).includes("u-opener"),
      JSON.stringify(ctl.modLogs.map((e) => e.d?.description)),
    );
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketStaffRoleId: "r-staff" });
    ctl.ticketRow = { status: "open", openerId: "u-opener" };
    await run({ isButton: true, customId: "ticket_unclaim:t1" });
    check(
      "nút Bỏ nhận: ghi mod log",
      ctl.modLogs.length === 1 && String(ctl.modLogs[0].d?.title).includes("Bỏ nhận"),
      JSON.stringify(ctl.modLogs.map((e) => e.d?.title)),
    );
  }

  // ═════════ LỆNH /ticket ═════════
  {
    reset();
    configs.set("g1", { ticketEnabled: true });
    await run({
      isChatInputCommand: true,
      commandName: "ticket",
      user: { id: "b1", username: "bot", bot: true },
    });
    check("/ticket: bot account → từ chối", lastReply() === T.errBotAccount);
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: false });
    await run({ isChatInputCommand: true, commandName: "ticket" });
    check("/ticket: chưa bật → báo tắt", lastReply() === T.errDisabled);
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true });
    await run({ isChatInputCommand: true, commandName: "ticket", subcommand: "close" });
    check(
      "/ticket close: hướng dẫn dùng nút Đóng trong kênh (để giữ quyền + log)",
      lastReply().includes("nút **Đóng**"),
    );
  }
  {
    // Bug thật 28/09/2026: slash.js đăng ký subcommand `dong`/`khieunai` (VI)
    // nhưng handler so với `close`/`appeal` (EN) → `/ticket dong` rơi xuống
    // nhánh mở ticket và MỞ NHẦM một ticket thật.
    reset();
    configs.set("g1", { ticketEnabled: true });
    await run({ isChatInputCommand: true, commandName: "ticket", subcommand: "dong" });
    check(
      "/ticket dong: hướng dẫn đóng, KHÔNG mở nhầm ticket",
      lastReply().includes("nút **Đóng**") && callsTo("openTicket").length === 0,
      JSON.stringify(callsTo("openTicket").length),
    );
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true });
    await run({ isChatInputCommand: true, commandName: "ticket", subcommand: "khieunai" });
    check(
      "/ticket khieunai: mở loại khiếu nại, không phải hỗ trợ",
      callsTo("openTicket")[0]?.args?.kind === "appeal",
      JSON.stringify(callsTo("openTicket")[0]?.args?.kind),
    );
  }
  {
    // `/ticket cua-toi` — đường quay lại khi DM tắt.
    reset();
    configs.set("g1", { ticketEnabled: true });
    ctl.myTicketState = { openChannelId: "ch-77" };
    guild.channels.cache.set("ch-77", { id: "ch-77" });
    await run({ isChatInputCommand: true, commandName: "ticket", subcommand: "cua-toi" });
    check(
      "/ticket cua-toi: trả kênh đang mở kèm link",
      lastReply() === "MY_TICKET <#ch-77> https://discord.com/channels/g1/ch-77",
      lastReply(),
    );
    check(
      "/ticket cua-toi: hỏi đúng người gọi, không mở ticket",
      callsTo("query")[0]?.args?.userId === "u-staff" && callsTo("openTicket").length === 0,
    );
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true });
    ctl.myTicketState = null;
    await run({ isChatInputCommand: true, commandName: "ticket", subcommand: "cua-toi" });
    check("/ticket cua-toi: không có ticket → báo mở mới", lastReply() === T.myTicketNone);
  }
  {
    // Bản ghi còn `open` nhưng kênh đã bị xoá tay — link chết mở ra trang trắng.
    reset();
    configs.set("g1", { ticketEnabled: true });
    ctl.myTicketState = { openChannelId: "ch-gone" };
    await run({ isChatInputCommand: true, commandName: "ticket", subcommand: "cua-toi" });
    check(
      "/ticket cua-toi: kênh đã xoá → báo rõ, không đưa link chết",
      lastReply() === T.myTicketGone,
      lastReply(),
    );
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true });
    ctl.stateThrows = true;
    await run({ isChatInputCommand: true, commandName: "ticket", subcommand: "cua-toi" });
    check(
      "/ticket cua-toi: Convex lỗi → báo chung, không crash",
      lastReply() === T.errUnknown,
      lastReply(),
    );
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true });
    await run({
      isChatInputCommand: true,
      commandName: "ticket",
      subcommand: "open",
      strings: { chude: "Hỏi về ban" },
    });
    const call = callsTo("openTicket")[0];
    check(
      "/ticket open: kind mặc định support + openerOnly true",
      call &&
        call.args.kind === "support" &&
        call.args.source === "command" &&
        call.args.openerOnly === true,
    );
    check("/ticket open: báo kênh vừa tạo", lastReply() === "OK_OPENED_<#ch-new>");
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true, ticketDefaultKind: "appeal" });
    await run({
      isChatInputCommand: true,
      commandName: "ticket",
      subcommand: "open",
      strings: { chude: "Khiếu nại" },
    });
    check(
      "/ticket: chủ server đặt loại mặc định appeal → dùng appeal",
      callsTo("openTicket")[0]?.args.kind === "appeal",
    );
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true });
    ctl.openResult = { ok: false, code: "errMaxOpen", count: 3, max: 3 };
    await run({ isChatInputCommand: true, commandName: "ticket", subcommand: "open" });
    check("/ticket: quá số ticket mở tối đa → báo số liệu", lastReply() === "ERR_MAX_3/3");
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true });
    ctl.openResult = { ok: false, code: "errAlreadyOpen", channelId: "ch-old" };
    await run({ isChatInputCommand: true, commandName: "ticket", subcommand: "open" });
    check("/ticket: đã có ticket mở → trỏ kênh cũ", lastReply() === "ERR_ALREADY_<#ch-old>");
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true });
    ctl.openResult = { ok: false, code: "errHierarchy" };
    await run({ isChatInputCommand: true, commandName: "ticket", subcommand: "open" });
    check("/ticket: bot thấp hơn người mở → báo thứ bậc", lastReply() === T.errHierarchy);
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true });
    ctl.openResult = { ok: false, code: "MAX_CHANNELS" };
    await run({ isChatInputCommand: true, commandName: "ticket", subcommand: "open" });
    check("/ticket: server đủ 500 kênh → báo đầy", lastReply() === T.errChannelsFull);
  }
  {
    reset();
    configs.set("g1", { ticketEnabled: true });
    ctl.openResult = { ok: false, code: "khongRoi" };
    await run({ isChatInputCommand: true, commandName: "ticket", subcommand: "open" });
    check("/ticket: mã lỗi lạ → fallback về lỗi chung", lastReply() === T.errNoPerm);
  }

  // ═════════ /ping + /health ═════════
  {
    reset();
    await run({ isChatInputCommand: true, commandName: "ping" });
    check("/ping: báo độ trễ WebSocket làm tròn", lastReply().includes("Pong! **42ms**"));
  }
  {
    reset();
    ctl.manage = false;
    await run({ isChatInputCommand: true, commandName: "health" });
    check("/health: không phải mod → yêu cầu quyền", lastReply().includes("không có quyền"));
  }
  {
    reset();
    await run({ isChatInputCommand: true, commandName: "health" });
    const fields = replies.at(-1)?.embeds?.[0]?.d?.fields ?? [];
    check(
      "/health: bản bot cũ không có aiStats → nói rõ",
      fields.some((f) => String(f.value).includes("không có dữ liệu")),
    );
  }
  {
    reset();
    ctl.aiStats = { available: false };
    await run({ isChatInputCommand: true, commandName: "health" });
    const fields = replies.at(-1)?.embeds?.[0]?.d?.fields ?? [];
    check(
      "/health: chưa cấu hình key AI → cảnh báo",
      fields.some((f) => String(f.value).includes("Chưa cấu hình key")),
    );
  }
  {
    reset();
    ctl.aiStats = {
      available: true,
      providers: [
        { label: "Kira", model: "mimo-v2.5", inCooldown: true },
        { label: "Groq", model: "openai/gpt-oss-120b", inCooldown: false },
      ],
      verdictCacheSize: 12,
      callsLastMinute: 3,
      inFlight: 1,
      verdictsLastHour: { raid: 2, individual: 1, benign: 30, offline: 0, cache: 9 },
      misfire: { misfires7d: 7 },
    };
    await run({ isChatInputCommand: true, commandName: "health" });
    const fields = replies.at(-1)?.embeds?.[0]?.d?.fields ?? [];
    const names = fields.map((f) => f.name);
    check(
      "/health: liệt kê provider + đánh dấu đang cooldown",
      names.includes("Providers") && fields[0].value.includes("đang cooldown"),
    );
    check("/health: thống kê verdict 1 giờ", names.includes("Verdict 1 giờ qua"));
    check(
      "/health: cảnh báo AI đang tự siết khi phạt nhầm tăng",
      fields.some((f) => String(f.value).includes("AI đang tự siết")),
    );
  }

  console.log(`\nKết quả: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("Suite crash:", e);
  process.exit(1);
});
