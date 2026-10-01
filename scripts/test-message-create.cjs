// Test messageCreate.js — luồng tin nhắn:
//   - bỏ qua bot / DM / guild không available
//   - lệnh prefix: gọi handler đúng, bắt lỗi handler, lệnh lạ bị bỏ qua
//   - auto reply: khớp keyword/@mention, cooldown, giới hạn 1900 ký tự, lỗi reply
//   - captcha verify: đúng mã → gán role + DM chào mừng; sai/hết hạn/không mã
//   - alt gate khi verify: rủi ro cao → phạt + từ chối; phạt thất bại → fail-open
// Mock discord.js + ../commands/prefix + ../util + ../captchaStore + ../altDetection.
// Chạy: node scripts/test-message-create.cjs
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
  constructor(data = {}) { this.data = { ...data }; }
  setColor(c) { this.data.color = c; return this; }
  setTitle(t) { this.data.title = t; return this; }
  setDescription(t) { this.data.description = t; return this; }
  addFields(...f) { this.data.fields = [...(this.data.fields ?? []), ...f.flat(Infinity)]; return this; }
  setTimestamp() { return this; }
  setFooter(f) { this.data.footer = f; return this; }
  setThumbnail() { return this; }
}
module.exports = { Colors: { Blue: 1, Green: 2 }, EmbedBuilder };
`,
);

// ── Mocks ──
const prefixHandlers = {};
const prefixCalls = [];
const logCalls = [];
let verifyResult = { ok: false, reason: "no_code" };
let altAnalysis = null;
let punishResult = null;
let sendLogShouldThrow = false;

const origLoad = Module._load;
Module._load = function (request, parent) {
  const fromMsg = parent && /handlers[\\/]messageCreate\.js$/.test(parent.filename);
  if (fromMsg) {
    if (request === "../commands/prefix") return prefixHandlers;
    if (request === "../captchaStore") {
      return {
        verifyCode: () => verifyResult,
      };
    }
    if (request === "../altDetection") {
      return {
        analyzeNewMember: async () => altAnalysis,
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
    }
  }
  // ../util được require cả từ messageCreate (fillPlaceholders) lẫn lazy (sendLog).
  if (parent && /handlers[\\/]messageCreate\.js$/.test(parent.filename) && request === "../util") {
    return {
      fillPlaceholders: (text, author) =>
        text.replaceAll("{user}", `<@${author.id}>`).replaceAll("{username}", author.username),
      async sendLog(guild, config, embed) {
        if (sendLogShouldThrow) throw new Error("webhook sập");
        logCalls.push({ guild, config, embed });
      },
    };
  }
  return origLoad.apply(this, arguments);
};

(async () => {
  const onMessageCreate = require("../bot/src/handlers/messageCreate");

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
  const mutations = [];
  const configs = new Map();
  const replies = [];
  const roleOps = [];
  const dms = [];
  const clear = () => {
    prefixCalls.length = 0;
    logCalls.length = 0;
    replies.length = 0;
    roleOps.length = 0;
    dms.length = 0;
    mutations.length = 0;
    verifyResult = { ok: false, reason: "no_code" };
    altAnalysis = null;
    punishResult = null;
    sendLogShouldThrow = false;
  };

  const store = {
    getConfig: async (guildId) => configs.get(guildId) ?? null,
    isCooledDown: () => false,
    recordReply: () => {},
    client: {
      mutation: async (name, args) => {
        mutations.push({ name, args });
        return { ok: true };
      },
    },
  };

  function mkMessage(overrides = {}) {
    const msg = {
      author: { id: "u1", username: "nguoidung", bot: false, ...(overrides.author || {}) },
      guild: overrides.guild ?? { id: "g1", name: "G1", available: true },
      channel: {
        id: "c1",
        isDMBased: () => false,
        ...(overrides.channel || {}),
      },
      content: "",
      mentions: { users: { has: () => false } },
      member: {
        id: "u1",
        user: { id: "u1", username: "nguoidung" },
        roles: {
          cache: { has: () => true },
          add: async (id) => roleOps.push({ op: "add", id }),
          remove: async (id) => roleOps.push({ op: "remove", id }),
        },
        send: async (payload) => dms.push(payload),
      },
      reply: async (payload) => {
        replies.push(payload);
        return {};
      },
      delete: async () => {},
      ...overrides,
    };
    return msg;
  }
  const client = { user: { id: "bot-self" } };

  // ── 1. Bỏ qua bot / DM / guild không available / không config ──
  {
    clear();
    await onMessageCreate(client, mkMessage({ author: { bot: true } }), store, {});
    check("tin nhắn từ bot → bỏ qua", replies.length === 0);

    await onMessageCreate(client, mkMessage({ channel: { isDMBased: () => true } }), store, {});
    check("DM → bỏ qua", replies.length === 0);

    await onMessageCreate(client, mkMessage({ guild: null }), store, {});
    check("không guild → bỏ qua", replies.length === 0);

    await onMessageCreate(
      client,
      mkMessage({ guild: { id: "g-miss", available: true } }),
      store,
      {},
    );
    check("guild chưa có config → bỏ qua", replies.length === 0);
  }

  // ── 2. Lệnh prefix: gọi handler + bắt lỗi ──
  {
    clear();
    configs.set("g1", { prefix: "!" });
    prefixHandlers.hello = async (c, m, args) => {
      prefixCalls.push({ args });
    };
    await onMessageCreate(client, mkMessage({ content: "!hello a b" }), store, {});
    check(
      "lệnh prefix → gọi handler với args",
      prefixCalls.length === 1 && prefixCalls[0].args[0] === "a",
    );

    prefixHandlers.boom = async () => {
      throw new Error("handler sập");
    };
    await onMessageCreate(client, mkMessage({ content: "!boom" }), store, {});
    check(
      "handler lỗi → reply thông báo lỗi",
      replies.some((r) => String(r?.content ?? r).includes("Có lỗi")),
    );

    replies.length = 0;
    await onMessageCreate(client, mkMessage({ content: "!khongton_tai" }), store, {});
    check("lệnh prefix lạ → im lặng", replies.length === 0);
  }

  // ── 3. Auto reply: keyword + mention + cooldown + cắt 1900 ──
  {
    clear();
    configs.set("g2", {
      prefix: "!",
      autoReplies: [
        {
          _id: "r1",
          name: "chao",
          enabled: true,
          triggerType: "keyword",
          keywords: ["xin chào"],
          response: "Chào {user}!",
          cooldownSeconds: 0,
          channels: [],
        },
      ],
    });
    const m = mkMessage({
      guild: { id: "g2", name: "G2", available: true },
      content: "Xin chào bạn",
    });
    await onMessageCreate(client, m, store, {});
    check(
      "auto reply khớp keyword (không phân biệt hoa thường) → trả lời",
      replies.length === 1 && replies[0].content === "Chào <@u1>!",
    );

    // Mention trigger
    clear();
    configs.set("g2", {
      prefix: "!",
      autoReplies: [
        {
          _id: "r2",
          name: "mention",
          enabled: true,
          triggerType: "mention",
          keywords: [],
          response: "Dạ?",
          cooldownSeconds: 0,
          channels: [],
        },
      ],
    });
    const mm = mkMessage({
      guild: { id: "g2", name: "G2", available: true },
      content: "hey",
      mentions: { users: { has: (id) => id === "bot-self" } },
    });
    await onMessageCreate(client, mm, store, {});
    check("auto reply khớp @mention bot → trả lời", replies.length === 1);

    // Cooldown chặn
    clear();
    const cooledStore = { ...store, isCooledDown: () => true };
    configs.set("g2", {
      prefix: "!",
      autoReplies: [
        {
          _id: "r3",
          name: "cd",
          enabled: true,
          triggerType: "keyword",
          keywords: ["hi"],
          response: "x",
          cooldownSeconds: 30,
          channels: [],
        },
      ],
    });
    await onMessageCreate(
      client,
      mkMessage({ guild: { id: "g2", name: "G2", available: true }, content: "hi" }),
      cooledStore,
      {},
    );
    check("đang cooldown → không trả lời", replies.length === 0);

    // Giới hạn độ dài
    clear();
    configs.set("g2", {
      prefix: "!",
      autoReplies: [
        {
          _id: "r4",
          name: "long",
          enabled: true,
          triggerType: "keyword",
          keywords: ["long"],
          response: "x".repeat(2000),
          cooldownSeconds: 0,
          channels: [],
        },
      ],
    });
    await onMessageCreate(
      client,
      mkMessage({ guild: { id: "g2", name: "G2", available: true }, content: "long" }),
      store,
      {},
    );
    check(
      "response >1900 ký tự → cắt còn 1901",
      replies[0].content.length === 1901 && replies[0].content.endsWith("…"),
    );

    // Rule tắt / sai kênh
    clear();
    configs.set("g2", {
      prefix: "!",
      autoReplies: [
        {
          _id: "r5",
          name: "off",
          enabled: false,
          triggerType: "keyword",
          keywords: ["off"],
          response: "x",
          cooldownSeconds: 0,
          channels: [],
        },
        {
          _id: "r6",
          name: "chan",
          enabled: true,
          triggerType: "keyword",
          keywords: ["chan"],
          response: "x",
          cooldownSeconds: 0,
          channels: ["other"],
        },
      ],
    });
    await onMessageCreate(
      client,
      mkMessage({ guild: { id: "g2", name: "G2", available: true }, content: "off" }),
      store,
      {},
    );
    await onMessageCreate(
      client,
      mkMessage({ guild: { id: "g2", name: "G2", available: true }, content: "chan" }),
      store,
      {},
    );
    check("rule tắt / sai kênh → không trả lời", replies.length === 0);
  }

  // ── 4. Captcha: đúng mã → gán role + DM chào mừng ──
  {
    clear();
    configs.set("g3", {
      prefix: "!",
      verifyEnabled: true,
      verifyMethod: "captcha",
      verifyChannelId: "c1",
      unverifiedRoleId: "r-unv",
      verifiedRoleId: "r-ver",
      verifyWelcomeEnabled: true,
      verifyWelcomeTitle: "Chào {user}",
    });
    verifyResult = { ok: true };
    const m = mkMessage({
      guild: { id: "g3", name: "G3", available: true, iconURL: () => null },
      content: "123456",
    });
    await onMessageCreate(client, m, store, {});
    check(
      "captcha đúng → gỡ role chưa xác minh + thêm role xác minh",
      roleOps.some((o) => o.op === "remove" && o.id === "r-unv") &&
        roleOps.some((o) => o.op === "add" && o.id === "r-ver"),
    );
    check(
      "captcha đúng → reply thành công",
      replies.some((r) => String(r.content).includes("Mã chính xác")),
    );
    check("bật DM chào mừng → gửi DM", dms.length === 1);
  }

  // ── 5. Captcha: sai mã / hết hạn / không có mã ──
  {
    clear();
    const cfg = {
      prefix: "!",
      verifyEnabled: true,
      verifyMethod: "captcha",
      verifyChannelId: "c1",
      unverifiedRoleId: "r-unv",
      verifiedRoleId: "r-ver",
    };
    configs.set("g3", cfg);

    verifyResult = { ok: false, reason: "wrong" };
    await onMessageCreate(
      client,
      mkMessage({ guild: { id: "g3", name: "G3", available: true }, content: "000000" }),
      store,
      {},
    );
    check(
      "captcha sai → reply 'Mã không đúng'",
      replies.some((r) => String(r.content).includes("Mã không đúng")),
    );

    replies.length = 0;
    verifyResult = { ok: false, reason: "expired" };
    await onMessageCreate(
      client,
      mkMessage({ guild: { id: "g3", name: "G3", available: true }, content: "000000" }),
      store,
      {},
    );
    check(
      "captcha hết hạn → reply 'hết hạn'",
      replies.some((r) => String(r.content).includes("hết hạn")),
    );

    replies.length = 0;
    verifyResult = { ok: false, reason: "no_code" };
    await onMessageCreate(
      client,
      mkMessage({ guild: { id: "g3", name: "G3", available: true }, content: "000000" }),
      store,
      {},
    );
    check("không có mã → im lặng (rơi xuống auto reply)", replies.length === 0);
  }

  // ── 6. Captcha + alt gate: rủi ro cao → phạt + từ chối ──
  {
    clear();
    configs.set("g4", {
      prefix: "!",
      verifyEnabled: true,
      verifyMethod: "captcha",
      verifyChannelId: "c1",
      unverifiedRoleId: "r-unv",
      verifiedRoleId: "r-ver",
      altDetectionEnabled: true,
      altMaxRiskScore: 70,
    });
    verifyResult = { ok: true };
    altAnalysis = { riskScore: 95, action: "kick", riskFactors: ["acc mới"] };
    punishResult = { executed: true, action: "kick" };
    await onMessageCreate(
      client,
      mkMessage({
        guild: { id: "g4", name: "G4", available: true, iconURL: () => null },
        content: "123456",
      }),
      store,
      {},
    );
    check(
      "alt rủi ro cao khi verify → từ chối + đánh dấu đã phạt",
      replies.some((r) => String(r.content).includes("Xác minh bị từ chối")) &&
        mutations.some((m) => m.name === "altDetection:markJoinPunished"),
    );
    check(
      "alt rủi ro cao → KHÔNG gán role xác minh",
      !roleOps.some((o) => o.op === "add" && o.id === "r-ver"),
    );
    check(
      "alt rủi ro cao → ghi event antinuke altDetection",
      mutations.some(
        (m) => m.name === "bot_writes:botRecordAntinukeEvent" && m.args.module === "altDetection",
      ),
    );
  }

  // ── 7. Captcha + alt gate: phạt thất bại → fail-open, cho xác minh ──
  {
    clear();
    roleOps.length = 0;
    configs.set("g5", {
      prefix: "!",
      verifyEnabled: true,
      verifyMethod: "captcha",
      verifyChannelId: "c1",
      unverifiedRoleId: "r-unv",
      verifiedRoleId: "r-ver",
      altDetectionEnabled: true,
      altMaxRiskScore: 70,
    });
    verifyResult = { ok: true };
    altAnalysis = { riskScore: 95, action: "kick", riskFactors: ["acc mới"] };
    punishResult = { executed: false, reason: "thiếu quyền" };
    await onMessageCreate(
      client,
      mkMessage({
        guild: { id: "g5", name: "G5", available: true, iconURL: () => null },
        content: "123456",
      }),
      store,
      {},
    );
    check(
      "phạt thất bại → fail-open, vẫn gán role xác minh",
      roleOps.some((o) => o.op === "add" && o.id === "r-ver"),
    );
    check(
      "phạt thất bại → reply thành công",
      replies.some((r) => String(r.content).includes("Mã chính xác")),
    );
  }

  fs.unlinkSync(DJS_MOCK);
  console.log(`\nKết quả message create: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
