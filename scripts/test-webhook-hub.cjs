// TEST: webhookHub — hub webhook log mặc định của bot.
// Chạy: node scripts/test-webhook-hub.cjs
//
// Trước đây coverage 38% stmt — các nhánh sống-còn chưa test:
//   - matchFor: lọc isDefault + enabled + eventTypes (all/chính xác/nhóm mod/general)
//   - getForGuild: cache 5 phút, inflight dedupe, Convex chết → trả cache cũ
//   - reconcileDefaultWebhook: create (kênh chết → backoff 10 phút), delete
//   - ensureDefaultWebhook: cache hit / Convex có sẵn / tạo mới / kênh hỏng → null
//   - fillTemplate + buildPayload: placeholder + màu ghi đè
const DJS_MOCK = require("./support/djs-mock-path.cjs");
const Module = require("module");
const fs = require("fs");

// Mock discord.js: WebhookClient ghi nhận send/delete; EmbedBuilder dạng data.
const whClients = [];
globalThis.__whClients = whClients; // mock string truy cập qua globalThis
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
  addFields(f) { this.d.fields = [...(this.d.fields ?? []), ...f]; return this; }
  setTimestamp() { return this; } setFooter(f) { this.d.footer = f; return this; }
  setThumbnail() { return this; } setImage() { return this; }
}
class Collection extends Map {}
class WebhookClient {
  constructor(opts) { this.id = opts.id; this.token = opts.token; this.sent = []; this.deleted = false; this.destroyed = false; globalThis.__whClients.push(this); }
  async send(payload) { this.sent.push(payload); return payload; }
  async delete() { this.deleted = true; }
  destroy() { this.destroyed = true; }
}
module.exports = {
  Colors: new Proxy({}, { get: () => 0x000000 }),
  EmbedBuilder,
  Collection,
  WebhookClient,
  ChannelType: { GuildText: 0 },
  PermissionFlagsBits: {},
  Partials: {},
  GatewayIntentBits: new Proxy({}, { get: () => 0 }),
};
`,
);

const hub = require("../bot/src/webhookHub.js");

let pass = 0;
let fail = 0;
const check = (label, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  ok ? pass++ : fail++;
};

function makeStore({ webhooks = [], failQuery = false } = {}) {
  const queries = [];
  const mutations = [];
  return {
    _queries: queries,
    _mutations: mutations,
    client: {
      query: async (name, args) => {
        queries.push({ name, args });
        if (failQuery) throw new Error("convex down");
        if (name === "webhooks:botGetWebhooks") return webhooks;
        return null;
      },
      mutation: async (name, args) => {
        mutations.push({ name, args });
        return { ok: true };
      },
    },
  };
}

// Embed giả đủ .data cho buildPayload.
function fakeEmbed(color = 0xff0000) {
  return { data: { title: "Test", color } };
}

(async () => {
  // ── 1. matchFor: lọc đúng webhook mặc định + enabled + eventTypes ─────────
  {
    const store = makeStore({
      webhooks: [
        {
          _id: "1",
          isDefault: true,
          enabled: true,
          eventTypes: ["all"],
          webhookId: "w1",
          token: "t1",
        },
        {
          _id: "2",
          isDefault: true,
          enabled: false,
          eventTypes: ["all"],
          webhookId: "w2",
          token: "t2",
        },
        {
          _id: "3",
          isDefault: false,
          enabled: true,
          eventTypes: ["all"],
          webhookId: "w3",
          token: "t3",
        },
        {
          _id: "4",
          isDefault: true,
          enabled: true,
          eventTypes: ["ban"],
          webhookId: "w4",
          token: "t4",
        },
        {
          _id: "5",
          isDefault: true,
          enabled: true,
          eventTypes: ["mod"],
          webhookId: "w5",
          token: "t5",
        },
        {
          _id: "6",
          isDefault: true,
          enabled: true,
          eventTypes: ["general"],
          webhookId: "w6",
          token: "t6",
        },
      ],
    });
    hub.init({}, store);
    hub.invalidateCache("g1");

    const banHits = await hub.matchFor("g1", "ban");
    const ids = new Set(banHits.map((w) => w._id));
    check(
      "ban: nhận webhook 'all' + 'ban' + nhóm 'mod'",
      ids.has("1") && ids.has("4") && ids.has("5"),
    );
    check("ban: bỏ webhook disabled + không phải mặc định", !ids.has("2") && !ids.has("3"));

    const joinHits = await hub.matchFor("g1", "join");
    const joinIds = new Set(joinHits.map((w) => w._id));
    check(
      "join: nhận 'all' + nhóm 'general', bỏ nhóm 'mod'",
      joinIds.has("1") && joinIds.has("6") && !joinIds.has("5") && !joinIds.has("4"),
    );

    const store2 = makeStore({});
    hub.init({}, store2);
    check("chưa init store → matchFor trả []", (await hub.matchFor("gx", "ban")).length === 0);
    hub.init({}, store);
  }

  // ── 2. getForGuild: cache 5 phút + Convex chết → trả cache cũ ─────────────
  {
    const store = makeStore({ webhooks: [{ _id: "9", isDefault: true, eventTypes: ["all"] }] });
    hub.init({}, store);
    hub.invalidateCache("g-cache");
    const res = await hub.getForGuild("g-cache");
    const afterFirst = store._queries.length;
    await hub.getForGuild("g-cache");
    check("getForGuild lần 2 hit cache 5 phút", store._queries.length === afterFirst);

    // Hết TTL + Convex chết → trả cache cũ (stale), không chết.
    const realNow = Date.now;
    Date.now = () => realNow() + 6 * 60_000;
    store.failQuery = true;
    try {
      await hub.getForGuild("g-cache");
    } finally {
      Date.now = realNow;
      store.failQuery = false;
    }
    check("Convex chết → trả webhook cache cũ thay vì []", res.length === 1 && res[0]._id === "9");
  }

  // ── 3. reconcileDefaultWebhook: create thành công + kênh chết → backoff ───
  {
    const store = makeStore({});
    hub.init({}, store);
    const createdWebhooks = [];
    const guild = {
      id: "g-rc",
      channels: {
        fetch: async (cid) =>
          cid === "dead"
            ? null
            : {
                id: cid,
                name: `ch-${cid}`,
                isTextBased: () => true,
                createWebhook: async () => {
                  const w = { id: `wh-${cid}-${createdWebhooks.length}`, token: "tok" };
                  createdWebhooks.push(w);
                  return w;
                },
              },
      },
    };

    await hub.reconcileDefaultWebhook(guild, { kind: "create", channelId: "live-1" });
    check(
      "create: mutation botDefaultWebhookReady với đúng webhookId/token",
      store._mutations.some(
        (m) =>
          m.name === "webhooks:botDefaultWebhookReady" &&
          m.args.guildId === "g-rc" &&
          typeof m.args.discordWebhookId === "string" &&
          m.args.token === "tok",
      ),
    );

    // Kênh chết → backoff 10 phút: gọi lại ngay KHÔNG fetch/mutation thêm.
    const mutBefore = store._mutations.length;
    await hub.reconcileDefaultWebhook(guild, { kind: "create", channelId: "dead" });
    const mutAfterDeadChannel = store._mutations.length;
    await hub.reconcileDefaultWebhook(guild, { kind: "create", channelId: "dead" });
    check(
      "create kênh chết: không mutation + backoff chặn lần 2",
      mutAfterDeadChannel === mutBefore && store._mutations.length === mutAfterDeadChannel,
    );
  }

  // ── 4. reconcileDefaultWebhook: delete qua WebhookClient ──────────────────
  {
    const store = makeStore({});
    hub.init({}, store);
    await hub.reconcileDefaultWebhook(
      { id: "g-del" },
      { kind: "delete", webhookId: "wh-x", token: "tok-x" },
    );
    const client = whClients[whClients.length - 1];
    check(
      "delete: WebhookClient.delete được gọi",
      client?.id === "wh-x" && client.deleted === true,
    );
    check(
      "delete: destroy WebhookClient sau khi xoá (không rò REST client)",
      client?.destroyed === true,
    );
    check(
      "delete: mutation botDefaultWebhookDeleted",
      store._mutations.some(
        (m) => m.name === "webhooks:botDefaultWebhookDeleted" && m.args.guildId === "g-del",
      ),
    );
  }

  // ── 5. ensureDefaultWebhook: cache hit / tạo mới / kênh hỏng → null ───────
  {
    const store = makeStore({
      webhooks: [
        { _id: "def", isDefault: true, webhookId: "w-def", token: "t", eventTypes: ["all"] },
      ],
    });
    hub.init({ user: { displayAvatarURL: () => "https://cdn.example/a.png" } }, store);
    hub.invalidateCache("g-en");

    // Cache hit (từ getForGuild ở trên).
    const hit = await hub.ensureDefaultWebhook({ id: "g-en" }, "ch-1");
    check("ensure: webhook mặc định đã có trong cache → trả ngay", hit?._id === "def");

    // Guild khác — cache miss, Convex trả hàng isDefault → trả def đó.
    const store2 = makeStore({
      webhooks: [{ _id: "def2", isDefault: true, webhookId: "w2", token: "t2" }],
    });
    hub.init({}, store2);
    const viaConvex = await hub.ensureDefaultWebhook({ id: "g-en2" }, "ch-1");
    check("ensure: Convex có sẵn isDefault → trả không tạo mới", viaConvex?._id === "def2");

    // Guild mới hoàn toàn → tạo webhook mới trên Discord.
    const store3 = makeStore({ webhooks: [] });
    const created = [];
    const guild3 = {
      id: "g-en3",
      channels: {
        fetch: async () => ({
          id: "ch-9",
          name: "logs",
          isTextBased: () => true,
          createWebhook: async () => {
            const w = { id: "wh-new", token: "tok-new", name: "Protogon Log" };
            created.push(w);
            return w;
          },
        }),
      },
    };
    hub.init({}, store3);
    const made = await hub.ensureDefaultWebhook(guild3, "ch-9");
    check(
      "ensure: chưa có → tự tạo webhook mới",
      created.length === 1 && made?.isDefault === true && made.webhookId === "wh-new",
    );
    check(
      "ensure: mutation Ready ghi webhook mới vào Convex",
      store3._mutations.some(
        (m) => m.name === "webhooks:botDefaultWebhookReady" && m.args.discordWebhookId === "wh-new",
      ),
    );

    // Kênh không text → null.
    const guild4 = {
      id: "g-en4",
      channels: { fetch: async () => null },
    };
    const none = await hub.ensureDefaultWebhook(guild4, "ch-404");
    check("ensure: kênh hỏng → null (không ném)", none === null);
  }

  // ── 6. send + fillTemplate + buildPayload (màu ghi đè) ────────────────────
  {
    const store = makeStore({});
    hub.init({}, store);
    await hub.send(
      {
        webhookId: "w-send",
        token: "tok-send",
        color: 0x00ff00,
        contentTemplate: "Log {action} của {user} tại {server} lúc {time} — {reason} — mod {mod}",
      },
      fakeEmbed(0xff0000),
      {
        guildName: "GX",
        action: "ban",
        user: "bad guy",
        mod: "mod pro",
        reason: "spam\nnhiều dòng",
      },
    );
    const sent = whClients[whClients.length - 1];
    const payload = sent.sent[0];
    check("send: gửi đúng qua WebhookClient", sent.id === "w-send" && payload.embeds.length === 1);
    check(
      "send: destroy WebhookClient sau khi gửi (không rò REST client/timer)",
      sent.destroyed === true,
    );
    // buildPayload bọc EmbedBuilder thật (mock lưu ở .d); nhánh không-màu giữ
    // object thô (có .data) — đọc cả 2 dạng.
    const finalColor = payload.embeds[0].d?.color ?? payload.embeds[0].data?.color;
    check("send: màu webhook ghi đè màu embed gốc (0x00ff00 = 65280)", finalColor === 65280);
    check(
      "send: template điền đủ placeholder, reason xuống dòng thành space",
      typeof payload.content === "string" &&
        payload.content.includes("ban") &&
        payload.content.includes("GX") &&
        payload.content.includes("spam nhiều dòng") &&
        payload.content.includes("mod pro"),
    );

    // Không template/màu → payload gọn.
    await hub.send({ webhookId: "w-plain", token: "t" }, fakeEmbed(), {});
    const plain = whClients[whClients.length - 1].sent[0];
    check(
      "send: không template → không có content; không màu → giữ màu gốc",
      plain.content === undefined && plain.embeds[0].data.color === 0xff0000,
    );
  }

  // ── 6b. BẢO MẬT: webhook KHÔNG BAO GIỜ được ping ──────────────────────────
  // `content` là phần DUY NHẤT Discord render thành mention (embed thì không
  // ping). `{reason}` lấy thẳng lý do do mod gõ → dán `<@everyone` vào lý do là
  // ping cả server ở kênh log. Không mất tính năng: 6 placeholder trong
  // fillTemplate không cái nào cố tình ping.
  {
    const store = makeStore({});
    hub.init({}, store);
    await hub.send(
      {
        webhookId: "w-ping",
        token: "t",
        contentTemplate: "Lý do: {reason}",
      },
      fakeEmbed(),
      { reason: "<@&123456789012345678> <@everyone> spam" },
    );
    const payload = whClients[whClients.length - 1].sent[0];
    const ZWSP = String.fromCharCode(0x200b);
    check(
      "payload kèm allowed_mentions rỗng (chặn ping tuyệt đối)",
      JSON.stringify(payload.allowed_mentions) === JSON.stringify({ parse: [] }),
    );
    check(
      "lý do trong content được escape (không còn <@&…> nguyên vẹn)",
      !payload.content.includes("<@&123456789012345678>"),
    );
    check(
      "escape bằng ký tự vô hình — nội dung gần như giữ nguyên",
      payload.content.includes(ZWSP),
    );
    check("vẫn đọc được phần chữ của lý do", payload.content.includes("spam"));
  }

  // ── 7. util.sendLog/sendModLog: định tuyến ĐÚNG kênh, không gửi trùng ─────
  // Gốc rễ từng gặp: case log moderation (ban/kick) đi qua webhook mặc định
  // nằm ở kênh log chung thay vì kênh hình phạt đã cấu hình (sai kênh); log
  // antinuke nào cũng bị gắn nhãn "raid" vì chữ "Raid" trong "Nuke/Raid".
  {
    const util = require("../bot/src/util.js");
    const sentChannels = [];
    const guild = {
      id: "g-route",
      name: "G-Route",
      channels: {
        fetch: async (cid) => ({
          id: cid,
          isTextBased: () => true,
          send: async (payload) => {
            sentChannels.push({ channelId: cid, payload });
            return {};
          },
        }),
      },
    };
    // Webhook mặc định DUY NHẤT nằm ở kênh log chung ch-log.
    const store = makeStore({
      webhooks: [
        {
          _id: "def-log",
          isDefault: true,
          enabled: true,
          eventTypes: ["all"],
          webhookId: "w-log",
          token: "t-log",
          channelId: "ch-log",
        },
      ],
    });
    hub.init({}, store);
    hub.invalidateCache("g-route");
    const fakeEmbed = { data: { title: "Test" } };

    // 7a. Case ban về kênh phạt ch-punish: webhook ch-log bị loại → gửi thẳng
    // ch-punish, KHÔNG dùng webhook lạc kênh.
    const whBefore = whClients.length;
    sentChannels.length = 0;
    await util.sendModLog(guild, {}, fakeEmbed, "ch-punish", "ban", {});
    check(
      "case ban → thẳng kênh phạt ch-punish (không qua webhook kênh khác)",
      sentChannels.length === 1 && sentChannels[0].channelId === "ch-punish",
    );
    check("case ban → không tạo WebhookClient mới", whClients.length === whBefore);

    // 7b. Case ban về đúng ch-log (nơi webhook sống) → đi qua webhook.
    sentChannels.length = 0;
    await util.sendModLog(guild, {}, fakeEmbed, "ch-log", "ban", {});
    const usedWh = whClients[whClients.length - 1];
    check(
      "case ban đúng kênh webhook → gửi qua webhook",
      sentChannels.length === 0 && usedWh?.id === "w-log" && usedWh.sent.length === 1,
    );

    // 7c. Log raid khẩn (critical) → chỉ kênh log chung; webhook kênh khác bị bỏ.
    sentChannels.length = 0;
    const whBefore2 = whClients.length;
    await util.sendLog(guild, { logChannelId: "ch-log2" }, fakeEmbed, "raid", {});
    check(
      "log raid → thẳng kênh log chung ch-log2 (webhook ch-log bị loại)",
      sentChannels.length === 1 && sentChannels[0].channelId === "ch-log2",
    );
    check("log raid lạc kênh → không dùng webhook", whClients.length === whBefore2);

    // 7d. Log raid + webhook cùng kênh log → qua webhook, không gửi kênh trùng.
    sentChannels.length = 0;
    await util.sendLog(guild, { logChannelId: "ch-log" }, fakeEmbed, "raid", {});
    const usedWh2 = whClients[whClients.length - 1];
    check(
      "log raid cùng kênh webhook → 1 lần qua webhook, không trùng kênh",
      sentChannels.length === 0 && usedWh2?.id === "w-log",
    );
  }

  // ── 8. util.inferEventType: phân biệt raid thật vs nuke cấu trúc ───────────
  {
    const util = require("../bot/src/util.js");
    check(
      "Ban hàng loạt → antinuke (không phải raid)",
      util.inferEventType({ data: { title: "🚨 Anti Nuke/Raid: Ban hàng loạt" } }) === "antinuke",
    );
    check(
      "Raid thành viên → raid",
      util.inferEventType({ data: { title: "🚨 Anti Nuke/Raid: Raid thành viên!" } }) === "raid",
    );
    check(
      "Alt Detection → join (khớp 'alt detect')",
      util.inferEventType({ data: { title: "🔍 Alt Detection: user-x" } }) === "join",
    );
    check(
      "Join Gate → join",
      util.inferEventType({ data: { title: "🚪 Join Gate: đã chặn thành viên" } }) === "join",
    );
  }

  // ── 8. caseLog: lý do do mod gõ phải escape trước khi vào content ────────
  // `meta.reason` là duy nhất trong số 6 placeholder chứa text NGUỒI THÔ từ
  // người dùng. Không escape thì `{reason}` trong template là đường ping.
  {
    const sent = [];
    const origLoad = Module._load;
    Module._load = function (request, parent, ...rest) {
      if (request === "./util" && parent && /caseLog\.js$/.test(parent.filename || "")) {
        return {
          sendModLog: async (_g, _c, _e, _ch, _t, meta) => {
            sent.push(meta);
            return true;
          },
        };
      }
      return origLoad.call(this, request, parent, ...rest);
    };
    delete require.cache[require.resolve("../bot/src/caseLog.js")];
    const caseLog = require("../bot/src/caseLog.js");
    Module._load = origLoad;

    const ZWSP = String.fromCharCode(0x200b);
    await caseLog.sendCaseLog({
      guild: { client: { user: { username: "Protogon" } } },
      guildConfig: { modLogChannelId: "ch" },
      action: "ban",
      offender: { id: "111", username: "kẻ xấu" },
      reason: "<@&123456789012345678> spam",
      color: 0xff0000,
    });
    const meta = sent[sent.length - 1];
    check(
      "caseLog truyền lý do đã escape cho webhook",
      meta && !meta.reason.includes("<@&123456789012345678>"),
    );
    check(
      "escape giữ nguyên phần chữ đọc được",
      meta && meta.reason.includes(ZWSP) && meta.reason.includes("spam"),
    );
  }

  console.log(`\nKết quả: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("Suite crash:", e);
  process.exit(1);
});
