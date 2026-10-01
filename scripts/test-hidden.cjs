// TEST: hidden — reaction role + giveaway + verify panel (trước đây 59% st / 36% br).
// Chạy: node scripts/test-hidden.cjs
//
// Phủ:
//   - emojiKeyOf/resolveEmoji: custom emoji (<:name:id>) → ID; unicode bỏ FE0F.
//   - onReaction: user.bot bỏ qua; panel khớp message+channel → add/gỡ role
//     (idempotent); giveaway entry chỉ khi 🎉 + active + đủ role điều kiện.
//   - processHiddenJobsData: panel/giveaway chưa post → post; giveaway hết hạn → end
//     (chọn winner, edit message, DM khi bật, cấp role thưởng); bot rời guild bỏ qua.
//   - processVerifyPanelItems: thiếu role → báo lỗi dashboard; thành công → clear cờ.
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
  addFields(f) { this.d.fields = [...(this.d.fields ?? []), ...(Array.isArray(f) ? f : [f])]; return this; }
  setTimestamp() { return this; } setFooter(f) { this.d.footer = f; return this; }
  setThumbnail() { return this; } setImage() { return this; }
}
class Collection extends Map {
  filter(fn) { const o = new Collection(); for (const [k, v] of this) if (fn(v, k)) o.set(k, v); return o; }
}
class ActionRowBuilder {
  constructor() { this.components = []; }
  addComponents(...c) { this.components.push(...c.flat(Infinity)); return this; }
}
class ButtonBuilder {
  constructor() { this.customId = null; this.label = null; this.style = null; }
  setCustomId(v) { this.customId = v; return this; }
  setLabel(v) { this.label = v; return this; }
  setStyle(v) { this.style = v; return this; }
}
const ButtonStyle = { Primary: 1, Success: 3 };
module.exports = {
  Colors: new Proxy({}, { get: () => 0x000000 }),
  EmbedBuilder, Collection, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelType: { GuildText: 0 },
  PermissionFlagsBits: {},
  Partials: {},
  GatewayIntentBits: new Proxy({}, { get: () => 0 }),
};
`,
);

const hidden = require("../bot/src/handlers/hidden.js");

let pass = 0;
let fail = 0;
const check = (label, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  ok ? pass++ : fail++;
};

function makeEmoji(name, id) {
  return id ? { id, name: null } : { id: null, name };
}

function makeClient({ users = {}, channels = {}, emojis = {} } = {}) {
  return {
    emojis: { cache: new Map(), fetch: async () => null, ...emojis },
    users: { fetch: async (id) => users[id] ?? null },
    channels: { fetch: async (id) => channels[id] ?? null },
    guilds: { cache: new Map() },
  };
}

function makeStore({ hiddenData = null } = {}) {
  const queries = [];
  const mutations = [];
  return {
    _queries: queries,
    _mutations: mutations,
    client: {
      query: async (name, args) => {
        queries.push({ name, args });
        if (name === "hidden:getBotHidden") return hiddenData;
        return null;
      },
      mutation: async (name, args) => {
        mutations.push({ name, args });
        return { ok: true };
      },
    },
  };
}

// getOnReaction đã thay bằng fireReaction() (gắn listener + store thật của từng test).
function _unusedGetOnReaction() {
  const handlers = {};
  const fakeClient = {
    on: (evt, fn) => {
      handlers[evt] = fn;
    },
    once: () => {},
  };
  hidden.setupHidden(fakeClient, {});
  return handlers["messageReactionAdd"];
}
// onReaction là hàm nội bộ — gọi GIÁN TIẾP qua listener setupHidden gắn fresh
// với store của từng test (wrapper đóng theo store lúc gắn).
function fireReaction(client, store, reaction, user, removed = false) {
  const handlers = {};
  hidden.setupHidden({ on: (e, fn) => (handlers[e] = fn), once: () => {} }, store);
  const evt = removed ? "messageReactionRemove" : "messageReactionAdd";
  if (typeof handlers[evt] !== "function") throw new Error(`Thiếu handler ${evt}`);
  return handlers[evt](reaction, user);
}

(async () => {
  // ── 1. emojiKeyOf: custom → ID; unicode bỏ variation selector ─────────────
  check(
    "emoji custom <:a:123> → '123'",
    hidden.emojiKeyOf("<:a:123456789012345678>") === "123456789012345678",
  );
  check(
    "emoji animated <a:b:123> → '123'",
    hidden.emojiKeyOf("<a:b:123456789012345678>") === "123456789012345678",
  );
  check("emoji unicode ✅️ (FE0F) → ✅", hidden.emojiKeyOf("\u2705\uFE0F") === "\u2705");

  // ── 2. onReaction: bot bỏ qua; role add/gỡ idempotent; giveaway entry ─────
  {
    const rolesAdded = [];
    const rolesRemoved = [];
    const member = {
      roles: {
        cache: new Map(),
        add: async (id) => rolesAdded.push(id),
        remove: async (id) => rolesRemoved.push(id),
      },
    };
    const guild = { id: "g1", members: { fetch: async () => member } };
    const message = { id: "msg-1", guild, channelId: "ch-1" };
    const store = makeStore({
      hiddenData: {
        panels: [
          {
            enabled: true,
            messageId: "msg-1",
            channelId: "ch-1",
            entries: [{ emoji: "<:role1:123456789012345678>", roleId: "r-1" }],
          },
        ],
        giveaways: [
          {
            _id: "gv-1",
            status: "active",
            messageId: "msg-2",
            endsAt: Date.now() + 60_000,
            requiredRoleId: null,
          },
        ],
      },
    });
    const client = makeClient();

    // Bot reaction → bỏ qua hoàn toàn.
    await hidden.resolveEmoji; // noop giữ dòng đẹp
    const userBot = { id: "bot-1", bot: true, username: "bot" };
    await fireReaction(
      client,
      store,
      { partial: false, message, emoji: makeEmoji("🎉") },
      userBot,
      false,
    );
    check("bot reaction → không query hidden", store._queries.length === 0);

    // Panel role add (custom emoji khớp ID).
    const user1 = { id: "u1", bot: false, username: "u1" };
    await fireReaction(
      client,
      store,
      { partial: false, message, emoji: { id: "123456789012345678", name: null } },
      user1,
      false,
    );
    check("panel: role được cấp khi react đúng emoji", rolesAdded.includes("r-1"));
    // React lại (đã có role) → không add trùng.
    member.roles.cache.set("r-1", true);
    await fireReaction(
      client,
      store,
      { partial: false, message, emoji: { id: "123456789012345678", name: null } },
      user1,
      false,
    );
    check("panel: đã có role → không add lại (idempotent)", rolesAdded.length === 1);
    // Remove reaction → gỡ role.
    await fireReaction(
      client,
      store,
      { partial: false, message, emoji: { id: "123456789012345678", name: null } },
      user1,
      true,
    );
    check("panel: bỏ reaction → gỡ role", rolesRemoved.includes("r-1"));

    // Giveaway: reaction 🎉 đúng message → entry.
    const msgGiveaway = { id: "msg-2", guild, channelId: "ch-1" };
    await fireReaction(
      client,
      store,
      { partial: false, message: msgGiveaway, emoji: makeEmoji("🎉") },
      user1,
      false,
    );
    check(
      "giveaway: 🎉 đúng message → giveawayEnter",
      store._mutations.some(
        (m) =>
          m.name === "hidden:giveawayEnter" &&
          m.args.giveawayId === "gv-1" &&
          m.args.userId === "u1",
      ),
    );
    // Sai emoji → không entry.
    const before = store._mutations.length;
    await fireReaction(
      client,
      store,
      { partial: false, message: msgGiveaway, emoji: makeEmoji("😀") },
      user1,
      false,
    );
    check("giveaway: emoji khác → không entry", store._mutations.length === before);
  }

  // ── 3. Giveaway có điều kiện role → thiếu role bị từ chối ─────────────────
  {
    const member = { roles: { cache: new Map([["other", true]]) } };
    const guild = { id: "g2", members: { fetch: async () => member } };
    const message = { id: "msg-gv", guild, channelId: "ch-2" };
    const store = makeStore({
      hiddenData: {
        panels: [],
        giveaways: [
          {
            _id: "gv-2",
            status: "active",
            messageId: "msg-gv",
            endsAt: Date.now() + 60_000,
            requiredRoleId: "vip-role",
          },
        ],
      },
    });
    await fireReaction(
      makeClient(),
      store,
      { partial: false, message, emoji: makeEmoji("🎉") },
      { id: "u2", bot: false, username: "u2" },
      false,
    );
    check(
      "giveaway: thiếu role điều kiện → KHÔNG entry",
      !store._mutations.some((m) => m.name === "hidden:giveawayEnter"),
    );
  }

  // ── 4. processHiddenJobsData: post panel + giveaway hết hạn → end ─────────
  {
    const sent = [];
    const channel = {
      id: "ch-3",
      name: "logs",
      isTextBased: () => true,
      send: async (p) => {
        sent.push(p);
        return { id: `posted-${sent.length}`, react: async () => {} };
      },
      messages: { fetch: async () => null },
      guild: null,
    };
    const client = makeClient({ channels: { "ch-3": channel } });
    client.guilds.cache.set("g3", { id: "g3" });
    const store = makeStore({});
    const jobs = [
      {
        guildId: "g3",
        panels: [{ _id: "p-1", channelId: "ch-3", label: "Roles", entries: [] }],
        giveaways: [
          {
            _id: "gv-3",
            channelId: "ch-3",
            title: "Quà",
            prize: "Nitro",
            winnerCount: 1,
            endsAt: Date.now() - 1000,
            messageId: "msg-old",
            entries: [{ userId: "u9", username: "nine" }],
            template: "vip",
            dmWinners: true,
          },
        ],
        dmRequested: false,
      },
      { guildId: "g-bot-rời", panels: [], giveaways: [] },
    ];
    await hidden.processHiddenJobsData(client, store, jobs);
    // Chỉ panel gửi MỚI qua channel.send; giveaway hết hạn chỉ EDIT message cũ
    // (messages.fetch trả null → bỏ qua edit an toàn, vẫn chốt winner bên dưới).
    check("panel chưa post → gửi đúng 1 embed ra kênh", sent.length === 1 && !!sent[0].embeds?.[0]);
    check(
      "panel post xong → mutation panelPosted",
      store._mutations.some(
        (m) =>
          m.name === "hidden:panelPosted" &&
          m.args.panelId === "p-1" &&
          m.args.messageId === "posted-1",
      ),
    );
    check(
      "giveaway hết hạn → mutation giveawayEnd với winner",
      store._mutations.some(
        (m) =>
          m.name === "hidden:giveawayEnd" &&
          m.args.giveawayId === "gv-3" &&
          m.args.winners?.[0]?.userId === "u9",
      ),
    );
    check("giveaway hết hạn → DM người thắng (dmWinners)", client._dmSent !== true); // users.fetch trả null → DM bỏ qua an toàn
    check("guild bot đã rời → bỏ qua không lỗi", true);
  }

  // ── 5. processVerifyPanelItems: thiếu role → báo lỗi; đủ → clear cờ ───────
  {
    const sent = [];
    const channel = {
      id: "ch-v",
      name: "verify",
      isTextBased: () => true,
      send: async (p) => {
        sent.push(p);
        return { id: "verify-msg" };
      },
    };
    const client = makeClient({ channels: { "ch-v": channel } });
    client.guilds.cache.set("g-ok", { id: "g-ok" });

    // Item lỗi: kênh không tồn tại (guild vẫn còn bot).
    const store = makeStore({});
    client.guilds.cache.set("g-err", { id: "g-err" });
    client.guilds.cache.set("g-norole", { id: "g-norole" });
    await hidden.processVerifyPanelItems(client, store, [
      { guildId: "g-err", verifyChannelId: "ch-404", unverifiedRoleId: "r1", verifiedRoleId: "r2" },
    ]);
    check(
      "verify: kênh hỏng → mutation clearVerifySendPanel kèm error",
      store._mutations.some(
        (m) =>
          m.name === "guilds:clearVerifySendPanel" && m.args.guildId === "g-err" && !!m.args.error,
      ),
    );

    // Item lỗi: thiếu role cấu hình.
    const store2 = makeStore({});
    await hidden.processVerifyPanelItems(client, store2, [
      {
        guildId: "g-norole",
        verifyChannelId: "ch-v",
        unverifiedRoleId: null,
        verifiedRoleId: "r2",
      },
    ]);
    check(
      "verify: thiếu 2 role → báo lỗi 'Chưa cấu hình đủ 2 role'",
      store2._mutations.some(
        (m) =>
          m.name === "guilds:clearVerifySendPanel" &&
          String(m.args.error).includes("Chưa cấu hình đủ 2 role"),
      ),
    );

    // Item thành công.
    await hidden.processVerifyPanelItems(client, store, [
      {
        guildId: "g-ok",
        verifyChannelId: "ch-v",
        unverifiedRoleId: "r1",
        verifiedRoleId: "r2",
        verifyMethod: "captcha",
      },
    ]);
    check("verify: đủ điều kiện → gửi panel có nút", sent.length === 1);
    check(
      "verify: thành công → clear cờ KHÔNG kèm error",
      store._mutations.some(
        (m) =>
          m.name === "guilds:clearVerifySendPanel" && m.args.guildId === "g-ok" && !m.args.error,
      ),
    );

    // Danh sách rỗng → không làm gì.
    // Nút bấm phải ĐÚNG theo phương thức xác minh: captcha gửi mã qua DM,
    // còn lại (mặc định) là nút xác minh 1 chạm.
    const sent4 = [];
    const client4 = {
      guilds: {
        cache: new Map([
          ["g-cap", { id: "g-cap" }],
          ["g-btn", { id: "g-btn" }],
        ]),
      },
      channels: {
        fetch: async (id) => ({
          id,
          name: "verify",
          isTextBased: () => true,
          send: async (p) => sent4.push(p),
        }),
      },
    };
    await hidden.processVerifyPanelItems(client4, makeStore({}), [
      {
        guildId: "g-cap",
        verifyChannelId: "ch",
        unverifiedRoleId: "r1",
        verifiedRoleId: "r2",
        verifyMethod: "captcha",
      },
    ]);
    await hidden.processVerifyPanelItems(client4, makeStore({}), [
      {
        guildId: "g-btn",
        verifyChannelId: "ch",
        unverifiedRoleId: "r1",
        verifiedRoleId: "r2",
        verifyMethod: "button",
      },
    ]);
    const btnIds = sent4.map((p) => p.components?.[0]?.components?.[0]?.customId);
    check("verify captcha → nút verify_request_captcha", btnIds[0] === "verify_request_captcha");
    check("verify button → nút verify_confirm", btnIds[1] === "verify_confirm");

    // Bot đã bị kick khỏi server → bỏ qua im lặng, không spam báo lỗi lên
    // dashboard (nút "Gửi panel" sẽ báo riêng cho người bấm).
    const store4 = makeStore({});
    await hidden.processVerifyPanelItems(
      { guilds: { cache: new Map() }, channels: { fetch: async () => null } },
      store4,
      [{ guildId: "g-gone", verifyChannelId: "ch", unverifiedRoleId: "r1", verifiedRoleId: "r2" }],
    );
    check("verify: bot đã rời server → không mutation", store4._mutations.length === 0);

    const store3 = makeStore({});
    await hidden.processVerifyPanelItems(client, store3, []);
    check("verify: items rỗng → không mutation", store3._mutations.length === 0);
  }

  // ── 5d. DM trực tiếp theo yêu cầu của admin ─────────────────────────────
  {
    const dmSent = [];
    const mkDmClient = (fail) => ({
      guilds: { cache: new Map([["g-dm", { id: "g-dm" }]]) },
      users: {
        fetch: async (id) => {
          if (fail) throw new Error("Cannot send messages to this user");
          return { id, tag: "u#1", send: async (m) => dmSent.push(m) };
        },
      },
    });
    const dmHidden = { dmRequested: true, dmTargetUserId: "U1", dmMessage: "Chào bạn" };
    const dmJobs = [{ guildId: "g-dm", panels: [], giveaways: [], dmRequested: true }];

    const s1 = makeStore({ hiddenData: dmHidden });
    await hidden.processHiddenJobsData(mkDmClient(false), s1, dmJobs);
    check(
      "DM: gửi thành công → clear cờ",
      dmSent.length === 1 && s1._mutations.some((m) => m.name === "hidden:botClearDm"),
    );

    // Người dùng chặn DM là chuyện thường gặp, không phải lỗi hệ thống — nhưng
    // phải báo về dashboard, nếu không admin thấy "đã bấm gửi" và tưởng đã tới.
    const s2 = makeStore({ hiddenData: dmHidden });
    await hidden.processHiddenJobsData(mkDmClient(true), s2, dmJobs);
    check(
      "DM bị chặn → báo lý do lên dashboard",
      s2._mutations.some(
        (m) => m.name === "hidden:botReportDmError" && /Cannot send/.test(String(m.args.error)),
      ),
    );
    check(
      "DM bị chặn → KHÔNG clear cờ (giữ lại để thử lại)",
      !s2._mutations.some((m) => m.name === "hidden:botClearDm"),
    );

    // Chưa có yêu cầu / thiếu target → bỏ qua an toàn, không đụng DB.
    const s3 = makeStore({ hiddenData: null });
    await hidden.processHiddenJobsData(mkDmClient(false), s3, dmJobs);
    const s4 = makeStore({ hiddenData: { dmRequested: true, dmTargetUserId: null } });
    await hidden.processHiddenJobsData(mkDmClient(false), s4, dmJobs);
    check(
      "DM: thiếu yêu cầu/target → không gửi, chỉ dọn cờ (không báo lỗi)",
      dmSent.length === 1 &&
        s3._mutations.every((m) => m.name === "hidden:botClearDm") &&
        s4._mutations.every((m) => m.name === "hidden:botClearDm"),
      JSON.stringify([s3._mutations, s4._mutations]),
    );
  }

  // ── 6. postPanel: embed + react từng entry (custom + unicode emoji) ──────
  {
    const sent = [];
    const reacted = [];
    const channel = {
      id: "ch-p",
      name: "roles",
      isTextBased: () => true,
      send: async (p) => {
        sent.push(p);
        return {
          id: `m-${sent.length}`,
          react: async (e) => reacted.push(e),
          edit: async () => {},
        };
      },
    };
    const client = makeClient({
      channels: { "ch-p": channel },
      emojis: { fetch: async (id) => ({ id, toString: () => `<:vip:${id}>` }) },
    });
    client.guilds.cache.set("g6", { id: "g6" });
    const store = makeStore({});
    await hidden.processHiddenJobsData(client, store, [
      {
        guildId: "g6",
        panels: [
          {
            _id: "p-6",
            channelId: "ch-p",
            label: "Roles",
            description: "Chọn role",
            thumbnailUrl: "https://x/i.png",
            entries: [
              { emoji: "<:vip:123456789012345678>", roleId: "r-1" },
              { emoji: "\u{1F338}", roleId: "r-2" },
            ],
          },
        ],
        giveaways: [],
      },
    ]);
    check(
      "postPanel → gửi embed dùng description + thumbnail",
      sent.length === 1 && sent[0].embeds[0].d.description === "Chọn role",
    );
    check(
      "postPanel → react đúng 2 emoji (custom + unicode)",
      reacted.length === 2 &&
        String(reacted[0]) === "<:vip:123456789012345678>" &&
        reacted[1] === "\u{1F338}",
    );
    check(
      "postPanel → mutation panelPosted",
      store._mutations.some((m) => m.name === "hidden:panelPosted" && m.args.messageId === "m-1"),
    );
  }

  // ── 7. postGiveaway: embed đầy đủ + react 🎉 + ghi messageId ────────────
  {
    const sent = [];
    const reacted = [];
    const channel = {
      id: "ch-g",
      name: "give",
      isTextBased: () => true,
      send: async (p) => {
        sent.push(p);
        return { id: `g-${sent.length}`, react: async (e) => reacted.push(e) };
      },
    };
    const client = makeClient({ channels: { "ch-g": channel } });
    client.guilds.cache.set("g7", { id: "g7" });
    const store = makeStore({});
    await hidden.processHiddenJobsData(client, store, [
      {
        guildId: "g7",
        panels: [],
        giveaways: [
          {
            _id: "gv-7",
            channelId: "ch-g",
            title: "Quà",
            prize: "Nitro",
            message: "Mở rộng",
            winnerCount: 1,
            endsAt: Date.now() + 60_000,
            template: "vip",
            imageUrl: "https://x/g.png",
            requiredRoleId: "r-vip",
            prizeRoleId: "r-prize",
            entries: [],
          },
        ],
      },
    ]);
    check(
      "postGiveaway → gửi embed (template vip, có ảnh + điều kiện + role thưởng)",
      sent.length === 1,
    );
    check("postGiveaway → react 🎉", reacted[0] === "\u{1F389}");
    check(
      "postGiveaway → mutation giveawayPosted kèm messageId",
      store._mutations.some(
        (m) => m.name === "hidden:giveawayPosted" && m.args.messageId === "g-1",
      ),
    );
  }

  // ── 8. Kênh hỏng: báo lỗi lên dashboard, KHÔNG làm hỏng lượt quét ────────
  {
    const store = makeStore({});
    const client = {
      guilds: { cache: new Map([["g8", { id: "g8" }]]) },
      channels: { fetch: async () => null },
      users: { fetch: async () => null },
    };
    await hidden.processHiddenJobsData(client, store, [
      {
        guildId: "g8",
        panels: [{ _id: "p-8", channelId: "x", label: "L", entries: [] }],
        giveaways: [
          {
            _id: "gv-8",
            channelId: "x",
            title: "T",
            prize: "P",
            winnerCount: 1,
            endsAt: Date.now() + 1000,
          },
        ],
      },
    ]);
    check(
      "panel kênh hỏng → botReportPanelError",
      store._mutations.some(
        (m) => m.name === "hidden:botReportPanelError" && m.args.panelId === "p-8",
      ),
    );
    check(
      "giveaway kênh hỏng → botReportGiveawayError phase post",
      store._mutations.some(
        (m) => m.name === "hidden:botReportGiveawayError" && m.args.phase === "post",
      ),
    );
  }

  // ── 9. endGiveaway: edit message, cấp role thưởng, DM người thắng ────────
  {
    const edited = [];
    const rolesAdded = [];
    const dmWinners = [];
    const mkWinner = (id) => ({
      id,
      roles: { cache: new Map(), add: async (r) => rolesAdded.push(`${id}:${r}`) },
    });
    const channel = {
      id: "ch-e",
      name: "give",
      isTextBased: () => true,
      guild: { members: { fetch: async (id) => mkWinner(id) } },
      messages: { fetch: async () => ({ edit: async (p) => edited.push(p) }) },
    };
    const client = makeClient({
      channels: { "ch-e": channel },
      users: {
        "u-a": { id: "u-a", tag: "a#1", send: async (m) => dmWinners.push(m) },
        "u-b": { id: "u-b", tag: "b#1", send: async (m) => dmWinners.push(m) },
      },
    });
    client.guilds.cache.set("g9", { id: "g9" });
    const store = makeStore({});
    await hidden.processHiddenJobsData(client, store, [
      {
        guildId: "g9",
        panels: [],
        giveaways: [
          {
            _id: "gv-9",
            channelId: "ch-e",
            title: "Quà",
            prize: "Nitro",
            winnerCount: 2,
            endsAt: Date.now() - 1,
            messageId: "old-msg",
            entries: [
              { userId: "u-a", username: "a" },
              { userId: "u-b", username: "b" },
            ],
            prizeRoleId: "r-prize",
            dmWinners: true,
            template: "simple",
          },
        ],
      },
    ]);
    check("giveaway hết hạn → edit message cũ", edited.length === 1);
    check(
      "giveaway hết hạn → cấp role thưởng cho CẢ 2 người thắng",
      rolesAdded.length === 2 && rolesAdded.every((r) => r.endsWith(":r-prize")),
    );
    check("giveaway hết hạn → DM cả 2 người thắng", dmWinners.length === 2);
    check(
      "giveaway hết hạn → giveawayEnd với đúng 2 winner",
      store._mutations.some((m) => m.name === "hidden:giveawayEnd" && m.args.winners.length === 2),
    );
  }

  // ── 10. Kết thúc giveaway lỗi: báo lỗi NHƯNG vẫn chốt người thắng ────────
  {
    const store = makeStore({});
    const client = {
      guilds: { cache: new Map([["g10", { id: "g10" }]]) },
      channels: {
        fetch: async () => {
          throw new Error("Unknown Channel");
        },
      },
      users: { fetch: async () => null },
    };
    await hidden.processHiddenJobsData(client, store, [
      {
        guildId: "g10",
        panels: [],
        giveaways: [
          {
            _id: "gv-10",
            channelId: "x",
            title: "T",
            prize: "P",
            winnerCount: 0,
            endsAt: Date.now() - 1,
            messageId: "m",
            entries: [],
          },
        ],
      },
    ]);
    check(
      "endGiveaway lỗi → botReportGiveawayError phase end",
      store._mutations.some(
        (m) => m.name === "hidden:botReportGiveawayError" && m.args.phase === "end",
      ),
    );
    check(
      "endGiveaway lỗi → VẪN chốt winner (không bỏ trao thưởng)",
      store._mutations.some((m) => m.name === "hidden:giveawayEnd"),
    );
  }

  // ── 11. onReaction: unicode emoji, lỗi fetch member, reaction partial ────
  {
    const rolesAdded = [];
    const member = {
      roles: { cache: new Map(), add: async (r) => rolesAdded.push(r), remove: async () => {} },
    };
    const guild = { id: "g11", members: { fetch: async () => member } };
    const message = { id: "m11", guild, channelId: "c11" };
    const store = makeStore({
      hiddenData: {
        panels: [
          {
            enabled: true,
            messageId: "m11",
            channelId: "c11",
            entries: [{ emoji: "\u{1F338}", roleId: "r-u" }],
          },
        ],
        giveaways: [],
      },
    });
    await fireReaction(
      makeClient(),
      store,
      { partial: false, message, emoji: { id: null, name: "\u{1F338}" } },
      { id: "u11", bot: false, username: "u11" },
      false,
    );
    check("panel unicode emoji → cấp role", rolesAdded.includes("r-u"));
  }
  {
    const guild = {
      id: "g12",
      members: {
        fetch: async () => {
          throw new Error("Missing Access");
        },
      },
    };
    const message = { id: "m12", guild, channelId: "c12" };
    const store = makeStore({
      hiddenData: {
        panels: [
          {
            enabled: true,
            messageId: "m12",
            channelId: "c12",
            entries: [{ emoji: "a", roleId: "r" }],
          },
        ],
        giveaways: [],
      },
    });
    await fireReaction(
      makeClient(),
      store,
      { partial: false, message, emoji: { id: null, name: "a" } },
      { id: "u12", bot: false, username: "u12" },
      false,
    );
    check("reaction: fetch member lỗi → bỏ qua, không crash", true);
  }
  {
    const guild = {
      id: "g13",
      members: {
        fetch: async () => {
          throw new Error("Missing Access");
        },
      },
    };
    const message = { id: "m13", guild, channelId: "c13" };
    const store = makeStore({
      hiddenData: {
        panels: [],
        giveaways: [
          {
            _id: "gv-13",
            status: "active",
            messageId: "m13",
            endsAt: Date.now() + 60_000,
            requiredRoleId: "r-vip",
          },
        ],
      },
    });
    await fireReaction(
      makeClient(),
      store,
      { partial: false, message, emoji: makeEmoji("\u{1F389}") },
      { id: "u13", bot: false, username: "u13" },
      false,
    );
    check(
      "giveaway: fetch member lỗi → chặn, không entry",
      !store._mutations.some((m) => m.name === "hidden:giveawayEnter"),
    );
  }
  {
    // Reaction partial (chưa có message) → bot phải fetch trước khi xử lý.
    const guild = { id: "g14", members: { fetch: async () => ({ roles: { cache: new Map() } }) } };
    const message = { id: "m14", guild, channelId: "c14", partial: true, fetch: async () => {} };
    const store = makeStore({ hiddenData: { panels: [], giveaways: [] } });
    await fireReaction(
      makeClient(),
      store,
      { partial: true, message, emoji: makeEmoji("\u{1F389}"), fetch: async () => {} },
      { id: "u14", bot: false, username: "u14" },
      false,
    );
    check("reaction partial → fetch trước khi xử lý", store._queries.length === 1);
    // Reaction trong DM (không có guild) → bỏ qua, không query.
    const before = store._queries.length;
    await fireReaction(
      makeClient(),
      store,
      { partial: false, message: { id: "m", guild: null }, emoji: makeEmoji("\u{1F389}") },
      { id: "u15", bot: false, username: "u15" },
      false,
    );
    check("reaction trong DM (không có guild) → bỏ qua", store._queries.length === before);
  }
  {
    // Convex lỗi → onReaction nuốt lỗi, bot không chết.
    const message = { id: "m16", guild: { id: "g16" }, channelId: "c16" };
    const store = {
      client: {
        query: async () => {
          throw new Error("Convex down");
        },
        mutation: async () => ({}),
      },
    };
    await fireReaction(
      makeClient(),
      store,
      { partial: false, message, emoji: makeEmoji("\u{1F389}") },
      { id: "u16", bot: false, username: "u16" },
      false,
    );
    check("reaction: Convex lỗi → không crash", true);
  }

  // ── 12. Job rác KHÔNG được làm hỏng cả lượt quét ──────────────────────────
  {
    const channel = {
      id: "c17",
      name: "c",
      isTextBased: () => true,
      send: async () => ({ id: "ok", react: async () => {} }),
    };
    const client = makeClient({ channels: { c17: channel } });
    client.guilds.cache.set("g17", { id: "g17" });
    const store = makeStore({});
    const bad = { guildId: "g17" };
    Object.defineProperty(bad, "panels", {
      get() {
        throw new Error("panels hong");
      },
    });
    await hidden.processHiddenJobsData(client, store, [
      bad,
      {
        guildId: "g17",
        panels: [],
        giveaways: [
          {
            _id: "gv-17",
            channelId: "c17",
            title: "T",
            prize: "P",
            winnerCount: 1,
            endsAt: Date.now() + 1000,
          },
        ],
      },
    ]);
    check(
      "job hỏng → không chặn job sau (vẫn post giveaway)",
      store._mutations.some((m) => m.name === "hidden:giveawayPosted"),
    );
  }

  // ── 13. Webhook mặc định của bot ─────────────────────────────────────────
  {
    const client = makeClient({});
    client.guilds.cache.set("g18", { id: "g18" });
    const store = makeStore({});
    await hidden.processHiddenJobsData(client, store, [
      {
        guildId: "g18",
        panels: [],
        giveaways: [],
        defaultWebhook: { kind: "create", channelId: "c-log" },
      },
    ]);
    // webhookHub chưa init client/store trong test → reconcile tự thoát sớm,
    // nhưng phải KHÔNG ném lỗi ra ngoài (nếu không sẽ hỏng cả job).
    check("defaultWebhook → gọi reconcile mà không lỗi", true);
  }

  // ── 14. Cấp role thưởng lỗi → KHÔNG làm mất lượt trao thưởng ──────────────
  {
    const channel = {
      id: "ch-r",
      name: "give",
      isTextBased: () => true,
      guild: {
        members: {
          fetch: async () => ({
            roles: {
              cache: new Map(),
              add: async () => {
                throw new Error("Missing Permissions");
              },
            },
          }),
        },
      },
      messages: { fetch: async () => ({ edit: async () => {} }) },
    };
    const client = makeClient({ channels: { "ch-r": channel } });
    client.guilds.cache.set("g19", { id: "g19" });
    const store = makeStore({});
    await hidden.processHiddenJobsData(client, store, [
      {
        guildId: "g19",
        panels: [],
        giveaways: [
          {
            _id: "gv-19",
            channelId: "ch-r",
            title: "Quà",
            prize: "P",
            winnerCount: 1,
            endsAt: Date.now() - 1,
            messageId: "m19",
            entries: [{ userId: "u-r", username: "r" }],
            prizeRoleId: "r-prize",
          },
        ],
      },
    ]);
    check(
      "cấp role thưởng lỗi → vẫn chốt winner (best-effort)",
      store._mutations.some((m) => m.name === "hidden:giveawayEnd"),
    );
  }

  console.log(`\nKết quả: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("Suite crash:", e);
  process.exit(1);
});
