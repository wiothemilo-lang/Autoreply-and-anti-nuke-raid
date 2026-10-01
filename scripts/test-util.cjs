// TEST: util.js — lớp dẫn log dùng chung cho MỌI module (anti nuke, join gate,
// mod tools, lockdown…). Trước đây nó chỉ được chạm gián tiếp nên còn thiếu
// test cho: đường webhook của log critical, fallback khi webhook hỏng, và các
// hàm thuần (fillPlaceholders/mentionRoles/canManageWithConfig).
//
// Chạy: node scripts/test-util.cjs
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
  constructor(data = {}) { this.d = { ...data }; this.data = this.d; }
  setColor(c) { this.d.color = c; return this; }
  setTitle(t) { this.d.title = t; return this; }
  setDescription(t) { this.d.description = t; return this; }
  addFields(f) { this.d.fields = [...(this.d.fields ?? []), ...(Array.isArray(f) ? f : [f])]; return this; }
  setTimestamp() { return this; }
  setFooter(f) { this.d.footer = f; return this; }
}
module.exports = {
  Colors: new Proxy({}, { get: (_t, k) => (k === "Red" ? 0xff0000 : 0x000000) }),
  EmbedBuilder,
  PermissionFlagsBits: { ManageGuild: 1n << 4n, Administrator: 1n << 0n },
};
`,
);

const hub = {
  matched: [],
  matchThrows: false,
  sentOk: true,
  created: { id: "w1", channelId: "c-log" },
  _sent: [],
  _created: [],
};
const hubMock = {
  matchFor: async (_guildId, _et) => {
    if (hub.matchThrows) throw new Error("Convex down");
    return hub.matched;
  },
  send: async (wh, embed, meta) => {
    if (!hub.sentOk) throw new Error("webhook hỏng");
    hub._sent.push({ wh, meta });
    return true;
  },
  ensureDefaultWebhook: async (guild, channelId) => {
    hub._created.push(channelId);
    return hub.created;
  },
};

const origLoad = Module._load;
Module._load = function (request, parent) {
  const fromUtil = parent && /bot[\\/]src[\\/]util\.js$/.test(parent.filename);
  if (fromUtil && request === "./webhookHub") return hubMock;
  return origLoad.apply(this, arguments);
};

(async () => {
  const util = require("../bot/src/util");
  const { __resetLogDedupeForTest } = require("../bot/src/logDedupe");

  let pass = 0;
  let fail = 0;
  const check = (label, cond) => {
    console.log(`${cond ? "PASS" : "FAIL"} ${label}`);
    cond ? pass++ : fail++;
  };

  let sentToChannels = [];
  const mkGuild = (channels = {}) => ({
    id: "g1",
    name: "Server",
    channels: {
      fetch: async (id) => {
        if (!(id in channels)) throw new Error("Unknown Channel");
        return channels[id];
      },
    },
  });
  const mkChannel = (id, ok = true) => ({
    id,
    name: id,
    isTextBased: () => true,
    send: async (p) => {
      if (!ok) throw new Error("Missing Permissions");
      sentToChannels.push({ id, p });
    },
  });
  const embed = (title) => util.logEmbed({ title, description: "d" });

  function reset() {
    __resetLogDedupeForTest();
    sentToChannels = [];
    hub.matched = [];
    hub.matchThrows = false;
    hub.sentOk = true;
    hub.created = { id: "w1", channelId: "c-log" };
    hub._sent.length = 0;
    hub._created.length = 0;
  }

  // ═════════ HÀM THUẦN ═════════
  {
    check(
      "fillPlaceholders thay {user} + {username}",
      util.fillPlaceholders("{user} xin {username}", { id: "42", username: "nam" }) ===
        "<@42> xin nam",
    );
    check("mentionRoles rỗng → 'không có'", util.mentionRoles([]) === "không có");
    check("mentionRoles null → 'không có'", util.mentionRoles(null) === "không có");
    check(
      "mentionRoles nhiều role → nối bằng dấu phẩy",
      util.mentionRoles(["1", "2"]) === "<@&1>, <@&2>",
    );
    check("hasPermission: không có member → false", util.hasPermission(null, 1n) === false);
    check(
      "hasPermission: member không có permissions → false",
      util.hasPermission({ id: "u" }, 1n) === false,
    );
    check(
      "canManageWithConfig: role mod trong cấu hình → true",
      util.canManageWithConfig(
        { permissions: { has: () => false }, roles: { cache: { has: (id) => id === "r-mod" } } },
        { modRoles: ["r-mod"] },
      ) === true,
    );
    check(
      "canManageWithConfig: không cấu hình, không quyền → false",
      util.canManageWithConfig(
        { permissions: { has: () => false }, roles: { cache: { has: () => false } } },
        {},
      ) === false,
    );
  }

  // ═════════ LOG CRITICAL (raid/antinuke) ═════════
  {
    reset();
    await util.sendLog(mkGuild({ "c-log": mkChannel("c-log") }), null, embed("a"), "raid");
    check("sendLog: chưa bật kênh log → không gửi gì", sentToChannels.length === 0);
  }
  {
    reset();
    hub.matched = [{ id: "w1", channelId: "c-log" }];
    await util.sendLog(
      mkGuild({ "c-log": mkChannel("c-log") }),
      { logChannelId: "c-log" },
      embed("Raid"),
      "raid",
    );
    check(
      "log raid: webhook ĐÚNG kênh log → gửi qua webhook, không gửi kênh",
      hub._sent.length === 1 && sentToChannels.length === 0,
    );
  }
  {
    reset();
    hub.matched = [{ id: "w1", channelId: "c-log" }];
    hub.sentOk = false;
    await util.sendLog(
      mkGuild({ "c-log": mkChannel("c-log") }),
      { logChannelId: "c-log" },
      embed("Raid"),
      "raid",
    );
    check(
      "log raid: webhook hỏng → fallback kênh log chung (không mất log)",
      sentToChannels.length === 1 && sentToChannels[0].id === "c-log",
    );
  }
  {
    reset();
    hub.matched = [{ id: "w1", channelId: "c-khac" }];
    await util.sendLog(
      mkGuild({ "c-log": mkChannel("c-log") }),
      { logChannelId: "c-log" },
      embed("Nuke"),
      "antinuke",
    );
    check(
      "log antinuke: webhook nằm kênh KHÁC → không dùng, gửi thẳng kênh log",
      hub._sent.length === 0 && sentToChannels.length === 1,
    );
  }
  {
    reset();
    await util.sendLog(
      mkGuild({ "c-log": mkChannel("c-log") }),
      { logChannelId: "c-log" },
      embed("Raid"),
      "raid",
    );
    check("log raid: không có webhook nào → gửi thẳng kênh log", sentToChannels.length === 1);
  }
  {
    reset();
    hub.matchThrows = true;
    await util.sendLog(
      mkGuild({ "c-log": mkChannel("c-log") }),
      { logChannelId: "c-log" },
      embed("Raid"),
      "raid",
    );
    check("log raid: matchFor lỗi Convex → không crash, gửi kênh log", sentToChannels.length === 1);
  }

  // ═════════ LOG KHÔNG CRITICAL (đường deliverViaWebhooks) ═════════
  {
    reset();
    hub.matched = [{ id: "w1", channelId: "c-log" }];
    await util.sendLog(
      mkGuild({ "c-log": mkChannel("c-log") }),
      { logChannelId: "c-log" },
      embed("Thành viên vào"),
      "join",
    );
    check(
      "log join: webhook đúng kênh → gửi qua webhook",
      hub._sent.length === 1 && sentToChannels.length === 0,
    );
  }
  {
    reset();
    hub.matched = [];
    await util.sendLog(
      mkGuild({ "c-log": mkChannel("c-log") }),
      { logChannelId: "c-log" },
      embed("Cài đặt"),
      "settings",
    );
    check(
      "log settings: chưa có webhook → tự tạo webhook rồi gửi",
      hub._created.length === 1 && hub._sent.length === 1 && sentToChannels.length === 0,
    );
  }
  {
    reset();
    hub.matched = [];
    hub.created = null;
    await util.sendLog(
      mkGuild({ "c-log": mkChannel("c-log") }),
      { logChannelId: "c-log" },
      embed("Cài đặt"),
      "settings",
    );
    check(
      "log settings: không tạo được webhook (thiếu quyền) → gửi kênh thường",
      sentToChannels.length === 1 && sentToChannels[0].id === "c-log",
    );
  }
  {
    reset();
    hub.matched = [{ id: "w1", channelId: "c-log" }];
    hub.sentOk = false;
    await util.sendLog(
      mkGuild({ "c-log": mkChannel("c-log") }),
      { logChannelId: "c-log" },
      embed("Vào server"),
      "join",
    );
    check(
      "log join: webhook hỏng hết → fallback kênh thường",
      sentToChannels.length === 1 && sentToChannels[0].id === "c-log",
    );
  }
  {
    reset();
    hub.matched = [{ id: "w1", channelId: "c-khac" }];
    await util.sendLog(
      mkGuild({ "c-log": mkChannel("c-log") }),
      { logChannelId: "c-log" },
      embed("Vào server"),
      "join",
    );
    check(
      "log join: chỉ có webhook kênh KHÁC → không dùng, gửi kênh đích",
      hub._sent.length === 0 && sentToChannels.length === 1,
    );
  }
  {
    reset();
    hub.matched = [];
    hub.sentOk = false;
    await util.sendLog(
      mkGuild({ "c-log": mkChannel("c-log") }),
      { logChannelId: "c-log" },
      embed("Webhook chết ngay"),
      "join",
    );
    check(
      "log join: tạo webhook xong nhưng gửi hỏng → rơi xuống kênh thường",
      hub._created.length === 1 && sentToChannels.length === 1,
    );
  }
  {
    reset();
    hub.matchThrows = true;
    await util.sendLog(
      mkGuild({ "c-log": mkChannel("c-log") }),
      { logChannelId: "c-log" },
      embed("Vào server"),
      "join",
    );
    check("log join: matchFor lỗi → fallback kênh, không crash", sentToChannels.length === 1);
  }

  // ═════════ CHỐNG GỬI TRÙNG + FALLBACK KÊNH HỎNG ═════════
  {
    reset();
    const g = mkGuild({ "c-log": mkChannel("c-log") });
    const e = embed("Trùng");
    await util.sendLog(g, { logChannelId: "c-log" }, e, "raid");
    await util.sendLog(g, { logChannelId: "c-log" }, e, "raid");
    check("gửi trùng cùng kênh trong 3s → chỉ gửi 1 lần", sentToChannels.length === 1);
  }
  {
    reset();
    const e = embed("Khác kênh");
    const g1 = mkGuild({ "c-a": mkChannel("c-a") });
    const g2 = mkGuild({ "c-b": mkChannel("c-b") });
    await util.sendLog(g1, { logChannelId: "c-a" }, e, "raid");
    await util.sendLog(g2, { logChannelId: "c-b" }, e, "raid");
    check("cùng embed nhưng KHÁC kênh → vẫn gửi cả hai", sentToChannels.length === 2);
  }
  {
    reset();
    await util.sendLog(
      mkGuild({ "c-log": mkChannel("c-log", false) }),
      { logChannelId: "c-log" },
      embed("Không gửi được"),
      "raid",
    );
    check("kênh log thiếu quyền gửi → không crash, im lặng", sentToChannels.length === 0);
  }
  {
    reset();
    await util.sendLog(mkGuild({}), { logChannelId: "c-xoa" }, embed("Kênh đã xoá"), "raid");
    check("kênh log đã bị xoá → bỏ qua, không crash", sentToChannels.length === 0);
  }
  {
    reset();
    const ch = mkChannel("c-voice");
    ch.isTextBased = () => false;
    await util.sendLog(
      mkGuild({ "c-voice": ch }),
      { logChannelId: "c-voice" },
      embed("Voice"),
      "raid",
    );
    check("kênh log là voice → không gửi", sentToChannels.length === 0);
  }

  // ═════════ sendModLog ═════════
  {
    reset();
    const r = await util.sendModLog(mkGuild({}), null, embed("Ban"), "c-mod", "ban");
    check("sendModLog: chưa cấu hình → false", r === false);
  }
  {
    reset();
    const g = mkGuild({ "c-mod": mkChannel("c-mod") });
    const e = embed("Ban");
    await util.sendModLog(g, { modLogChannelId: "c-mod" }, e, "c-mod", "ban");
    const r2 = await util.sendModLog(g, { modLogChannelId: "c-mod" }, e, "c-mod", "ban");
    check("sendModLog: chống gửi trùng trả false lần hai", r2 === false);
  }
  {
    reset();
    hub.matched = [{ id: "w1", channelId: "c-mod" }];
    const r = await util.sendModLog(
      mkGuild({ "c-mod": mkChannel("c-mod") }),
      { modLogChannelId: "c-mod" },
      embed("Timeout"),
      "c-mod",
      "timeout",
    );
    check(
      "sendModLog: webhook đúng kênh → true, không gửi kênh thường",
      r === true && sentToChannels.length === 0,
    );
  }

  fs.unlinkSync(DJS_MOCK);
  console.log(`\nKết quả util: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("Suite crash:", e);
  process.exit(1);
});
