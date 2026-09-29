// Test lớp tin nhắn (antinuke/messages.js) — phần auto-mod chống spam/nuke chat:
//   handleSpam            — spam flood: bucket reset sau phạt, AI raid → ban + lockdown,
//                           AI benign → bỏ qua hoàn toàn, AI null/offline → heat
//   handleMessagePatterns — tin dài/lặp (massMessage) + blank noise; webhook → External App
//   Chống ban oan: dương tính giả AI được tôn trọng; cleanup đúng cấu hình actions.
// Không mạng, không DB thật. Chạy: node scripts/test-message-layers.cjs
const path = require("path");

const Module = require("module");
const fs = require("fs");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "discord.js") return path.join(__dirname, "..", "bot", "test-djs-mock.cjs");
  return origResolve.call(this, request, ...args);
};
fs.writeFileSync(
  path.join(__dirname, "..", "bot", "test-djs-mock.cjs"),
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
    memberDms: [],
    heatAdds: [],
    msgDeleted: [],
    purged: [],
    bulkDeleted: [],
    caseLogs: [],
    mutations: [],
    threatNotes: [],
    emergencyAlerts: [],
  };

  function baseConfig(overrides = {}) {
    return {
      antinukeEnabled: true,
      lockdownEnabled: false,
      logChannelId: null,
      modLogChannelId: null,
      modules: [
        {
          module: "spam",
          enabled: true,
          threshold: 5,
          windowSeconds: 10,
          punish: "warn",
          timeoutSeconds: 600,
          whitelistRoles: [],
          actions: ["warn", "deleteMessages"],
        },
        {
          module: "massMessage",
          enabled: true,
          threshold: 3,
          windowSeconds: 10,
          punish: "warn",
          timeoutSeconds: 600,
          whitelistRoles: [],
          actions: ["warn", "deleteMessages"],
        },
        {
          module: "blankNoise",
          enabled: true,
          threshold: 3,
          windowSeconds: 10,
          punish: "warn",
          timeoutSeconds: 600,
          whitelistRoles: [],
          actions: ["warn", "deleteMessages"],
        },
      ],
      whitelistUsers: [],
      whitelistRoles: [],
      adminRoles: [],
      modRoles: [],
      ...overrides,
    };
  }

  const configs = new Map();
  const store = {
    client: {
      mutation: async (name, args) => {
        calls.mutations.push({ name, args });
        if (name === "bot_writes:botRecordAntinukeEvent") {
          calls.events.push(args);
          return { caseNumber: 1 };
        }
        if (name === "bot_writes:botRecordRaidSample") {
          calls.raidSamples.push(args);
          return {};
        }
        if (name === "bot_writes:botRecordModAction") {
          calls.modActions.push(args);
          return { caseNumber: 77 };
        }
        return {};
      },
      // webhookHub đọc danh sách webhook qua store.client.query — trả rỗng
      // (sendCaseLog → deliverViaWebhooks → matchFor sẽ không gửi đi đâu).
      query: async () => [],
    },
    getConfig: async (guildId) => configs.get(guildId) ?? null,
  };

  const heat = {
    add: async (guildId, userId, username, pts, _s) => {
      calls.heatAdds.push({ guildId, userId, pts });
      return { tier: "warn", escalated: false, score: pts };
    },
    markPunished: () => {},
    resetGuild: () => {},
  };

  let client = { user: { id: "bot-self" }, guilds: { cache: new Map() }, on: () => {} };
  const createState = require("../bot/src/handlers/antinuke/state");
  const createAi = require("../bot/src/handlers/antinuke/ai");
  const createEnforce = require("../bot/src/handlers/antinuke/enforce");

  // Bọc emergencyRaidAlert PHẢI TRƯỚC khi nạp messages.js: module đó giữ hàm
  // bằng destructuring lúc require, bọc sau thì nó đã giữ bản gốc rồi.
  // `clear()` xoá mảng nên mỗi kịch bản đếm độc lập.
  const incidentReport = require("../bot/src/handlers/incidentReport");
  const realEmergencyAlert = incidentReport.emergencyRaidAlert;
  incidentReport.emergencyRaidAlert = (client_, store_, guild_, info) => {
    calls.emergencyAlerts.push(info);
    return realEmergencyAlert(client_, store_, guild_, info);
  };

  const createMessages = require("../bot/src/handlers/antinuke/messages");

  const state = createState({ client, store });
  const realAi = createAi({ state });
  // Kích hoạt webhookHub với store giả để luồng log không crash trong test.
  require("../bot/src/webhookHub").init(client, store);
  const lockdownActive = () =>
    calls.mutations.some((m) => m.name === "bot_writes:botLockState" && m.args.until);
  // `maybeLockdown` bỏ qua nếu guild ĐÃ bị khoá (đúng hành vi thật — không khoá
  // 2 lần). Block 3 (spam) đã khoá "g-msg" nên block sau muốn kiểm nhánh khoá
  // kênh của module khác thì phải mở khoá trước, nếu không assert "không khoá"
  // là do trạng thái sót lại chứ không phải do pipeline.
  const lockdown = require("../bot/src/lockdown");
  async function resetLock() {
    const g = client.guilds.cache.get("g-msg");
    if (g && lockdown.isLocked(g.id)) await lockdown.unlockGuild(client, g, baseConfig(), store);
  }

  // AI giả: có thể bẻ verdict theo kịch bản qua biến `aiVerdict`.
  let aiVerdict = null; // null → AI offline (trả null)
  // Cổng treo: giả độ trễ mạng của lệnh gọi AI thật (1–5s trên VPS) để kiểm
  // tra kịch bản tin nhắn chồng lên lúc bot đang chờ AI.
  let aiGate = null;
  const ai = {
    aiClassify: async () => {
      if (aiGate) await aiGate;
      return aiVerdict;
    },
    clusterStats: realAi.clusterStats ?? (() => null),
  };
  const raidIntel = {
    huntRaidSource: async () => ({ banned: false }),
    recordRaidSample: async (guild, config, sample) => calls.raidSamples.push(sample),
  };
  const core = createEnforce({ client, store, heat, state });
  const externalApp = {
    handleExternalAppMessage: async (message) =>
      calls.events.push({ module: "EXTERNAL_APP:message", id: message.id }),
  };
  const messages = createMessages({ client, store, state, core, ai, raidIntel, externalApp });

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
    aiVerdict = null;
    // Xóa cả bucket RAM dùng chung giữa các kịch bản (nếu không, đếm của kịch bản
    // trước cộng dồn sang kịch bản sau và làm sai ngưỡng).
    state.state.spamBuckets.clear();
    state.state.patternBuckets.clear();
    state.state.recentMessages.clear();
    state.state.punishedRecently.clear();
    aiGate = null;
  };

  function makeGuild(id, opts = {}) {
    const me = {
      id: "bot-self-member",
      permissions: { has: () => true }, // bot có ManageChannels → lockGuild chạy thật
    };
    const channels = new Map(
      ["c1", "c2"].map((cid) => [
        cid,
        {
          id: cid,
          isTextBased: () => true,
          isThread: () => false,
          isVoiceBased: () => false,
          permissionOverwrites: { edit: async () => {} },
        },
      ]),
    );
    const guild = {
      id,
      available: true,
      ownerId: "owner-1",
      name: "G-" + id,
      memberCount: opts.memberCount ?? 500,
      roles: { cache: new Map(), everyone: { id } },
      members: {
        cache: new Map(),
        fetch: async () => null,
        fetchMe: async () => me,
      },
      channels: {
        cache: { values: () => channels.values(), filter: () => [], first: () => [] },
      },
      fetchAuditLogs: async () => ({ entries: { first: () => null, find: () => undefined } }),
    };
    return guild;
  }

  function makeMessage({
    id = "m1",
    content = "xin chào",
    webhookId = null,
    fresh = false,
    memberOpts = {},
  } = {}) {
    const gid = "g-msg";
    const guild = client.guilds.cache.get(gid);
    const member = {
      id: "spam-u1",
      guild,
      user: {
        id: "spam-u1",
        bot: false,
        username: memberOpts.username ?? "nguoi-chat",
        createdTimestamp: fresh ? Date.now() - 2 * 86_400_000 : Date.now() - 400 * 86_400_000,
        avatar: memberOpts.avatar ?? "av",
        flags: { has: () => false },
      },
      permissions: { has: () => false },
      roles: { cache: new Set() },
      timeout: async () => calls.memberTimeouts.push("spam-u1"),
      ban: async () => calls.memberBans.push("spam-u1"),
      kick: async () => calls.memberKicks.push("spam-u1"),
      send: async () => calls.memberDms.push("spam-u1"),
    };
    const channel = {
      id: "c1",
      isTextBased: () => true,
      isDMBased: () => false,
      viewable: true,
      messages: {
        fetch: async () => new Map(),
        bulkDelete: async (targets) => {
          calls.bulkDeleted.push(targets.length);
          return targets;
        },
      },
    };
    return {
      id,
      guild,
      channel,
      member,
      author: member.user,
      content,
      webhookId,
      deletable: true,
      delete: async () => calls.msgDeleted.push(id),
    };
  }

  configs.set("g-msg", baseConfig());
  client.guilds.cache.set("g-msg", makeGuild("g-msg"));

  // ── 1. Spam dưới ngưỡng → hoàn toàn im lặng ──
  {
    clear();
    for (let i = 0; i < 4; i++) await messages.handleSpam(makeMessage({ id: "s" + i }));
    check(
      "4 tin (dưới ngưỡng 5) → không ghi sự kiện, không phạt",
      calls.events.length === 0 &&
        calls.memberBans.length === 0 &&
        calls.memberTimeouts.length === 0,
    );
  }

  // ── 2. Spam chạm ngưỡng, AI offline → heat xử lý (không ban, không khóa) ──
  {
    clear();
    for (let i = 0; i < 5; i++) await messages.handleSpam(makeMessage({ id: "s" + i }));
    const ev = calls.events.find((e) => e.module === "spam");
    check("chạm ngưỡng → ghi sự kiện spam", !!ev);
    check("AI offline → KHÔNG ban", calls.memberBans.length === 0);
    check("AI offline → có cộng nhiệt", calls.heatAdds.length === 1);
    check(
      "bucket reset sau phạt → tin kế tiếp không phạt lại ngay",
      (await messages.handleSpam(makeMessage({ id: "s-x" }))) === undefined &&
        calls.events.filter((e) => e.module === "spam").length === 1,
    );
  }

  // ── 2b. Spam CHỒNG lúc bot đang chờ AI → 1 đợt chỉ được xử lý 1 vụ ──
  // Bucket bị xoá NGAY trước mọi await. Trên VPS lệnh gọi AI mất 1–5 giây; nếu
  // kẻ spam tiếp trong lúc đó thì lại đủ ngưỡng → chạy pipeline thứ 2 song song
  // → cùng 1 đợt spam bị phạt 2 lần, ghi 2 case log, cộng 2 lần nhiệt.
  {
    clear();
    let release;
    aiGate = new Promise((r) => (release = r));
    const first = [];
    for (let i = 0; i < 5; i++) first.push(messages.handleSpam(makeMessage({ id: "c" + i })));
    // Để cả 5 lượt đi hết phần đồng bộ và treo ở lời gọi AI.
    for (let k = 0; k < 5; k++) await new Promise((r) => setImmediate(r));
    const second = [];
    for (let i = 0; i < 5; i++) second.push(messages.handleSpam(makeMessage({ id: "d" + i })));
    release();
    await Promise.all([...first, ...second]);
    const spamEvents = calls.events.filter((e) => e.module === "spam");
    check(
      `spam chồng lúc chờ AI → vẫn chỉ 1 vụ sự kiện (thực tế ${spamEvents.length})`,
      spamEvents.length === 1,
    );
    check(
      `spam chồng lúc chờ AI → không cộng nhiệt 2 lần (thực tế ${calls.heatAdds.length})`,
      calls.heatAdds.length === 1,
    );
    aiGate = null;
  }

  // ── 3. AI xác nhận raid (conf >= 0.6) → ban + lockdown + cảnh báo khẩn ──
  {
    clear();
    configs.set("g-msg", baseConfig({ lockdownEnabled: true }));
    aiVerdict = { classification: "raid", confidence: 0.85, reason: "nội dung lặp + link mời" };
    for (let i = 0; i < 5; i++) await messages.handleSpam(makeMessage({ id: "r" + i }));
    check("AI raid → phạt BAN", calls.memberBans.length === 1);
    check("AI raid → khóa kênh (lockdown)", lockdownActive());
    check(
      "AI raid → ghi sự kiện với nhãn (AI: raid)",
      String(calls.events.find((e) => e.module === "spam")?.action ?? "").includes("(AI: raid)"),
    );
    check("AI raid → không cộng nhiệt", calls.heatAdds.length === 0);
    check(
      "AI raid → ghi mẫu huấn luyện kèm verdict",
      calls.raidSamples.some((s) => s.module === "spam" && s.aiClassification === "raid"),
    );
    // Spam là đường raid phổ biến nhất nên phải CÓ cảnh báo khẩn cho server
    // (nếu không: bị ban + khoá kênh mà không ai trong server được báo).
    check("AI raid → bot gọi cảnh báo khẩn cho server", calls.emergencyAlerts.length === 1);
    check(
      "AI raid → cảnh báo khẩn nêu đúng số tin + trạng thái khoá kênh",
      String(calls.emergencyAlerts[0]?.summary ?? "").includes("5 tin") &&
        calls.emergencyAlerts[0]?.lockdownActive === true,
    );
    configs.set("g-msg", baseConfig());
  }

  // ── 4. AI kết luận benign (dương tính giả) → bỏ qua hoàn toàn ──
  {
    clear();
    aiVerdict = {
      classification: "benign",
      confidence: 0.7,
      reason: "chat đa dạng của nhiều người",
    };
    for (let i = 0; i < 5; i++) await messages.handleSpam(makeMessage({ id: "b" + i }));
    check(
      "AI benign → KHÔNG phạt thành viên",
      calls.memberBans.length === 0 &&
        calls.memberKicks.length === 0 &&
        calls.memberTimeouts.length === 0,
    );
    check("AI benign → KHÔNG cộng nhiệt", calls.heatAdds.length === 0);
    check(
      "AI benign → không dọn tin nhắn",
      calls.msgDeleted.length === 0 && calls.bulkDeleted.length === 0,
    );
    check(
      "AI benign → vẫn ghi sự kiện bỏ qua",
      String(calls.events.find((e) => e.module === "spam")?.action ?? "").includes(
        "bỏ qua (AI: benign)",
      ),
    );
    check("AI benign → không ghi mẫu raid", calls.raidSamples.length === 0);
    check(
      "AI benign → KHÔNG gọi cảnh báo khẩn (im lặng vì dương tính giả)",
      calls.emergencyAlerts.length === 0,
    );
  }

  // ── 5. AI raid nhưng tin cậy thấp (< 0.6) → KHÔNG leo thang ban ──
  {
    clear();
    aiVerdict = { classification: "raid", confidence: 0.3, reason: "mơ hồ" };
    for (let i = 0; i < 5; i++) await messages.handleSpam(makeMessage({ id: "l" + i }));
    check(
      "AI raid confidence 0.3 → không ban (chỉ heat)",
      calls.memberBans.length === 0 && calls.heatAdds.length === 1,
    );
    for (let i = 0; i < 3; i++) await new Promise((r) => setImmediate(r));
    check(
      "AI raid conf thấp → KHÔNG gọi cảnh báo khẩn (chưa đủ tự tin)",
      calls.emergencyAlerts.length === 0,
    );
  }

  // ── 6. massMessage: tin dài cực dài lặp lại → trigger đúng module ──
  {
    clear();
    const long = "A".repeat(2200);
    for (let i = 0; i < 3; i++)
      await messages.handleMessagePatterns(makeMessage({ id: "L" + i, content: long }));
    const ev = calls.events.find((e) => e.module === "massMessage");
    check("tin 2200 ký tự lặp 3 lần → trigger massMessage", !!ev);
    check(
      "heat xử lý (AI offline) — không ban",
      calls.memberBans.length === 0 && calls.heatAdds.length === 1,
    );
    check("đã xóa tin phát hiện (deleteMessages)", calls.msgDeleted.length >= 1);
  }

  // ── 7. massMessage: lặp nội dung giống hệt (không dài) → cũng trigger ──
  {
    clear();
    const rep = "mua acc giá rẻ ib";
    // Lần 1 chưa có gì để so sánh (sameCount=1) → chỉ từ tin thứ 2 mới cộng vào bucket:
    // 4 tin lặp là đủ chạm ngưỡng 3 (đúng hành vi pipeline).
    for (let i = 0; i < 4; i++)
      await messages.handleMessagePatterns(makeMessage({ id: "R" + i, content: rep }));
    check(
      "nội dung lặp giống hệt 3 lần → trigger massMessage",
      calls.events.some((e) => e.module === "massMessage"),
    );
  }

  // ── 8. blankNoise: tin giả blank (zero-width + spaces) ──
  {
    clear();
    // Nội dung KHÁC NHAU từng tin (nếu giống hệt nhau, pattern lặp khớp trước vì
    // patterns[] xử lý massMessage trước blankNoise — đây là hành vi thật của pipeline).
    const blanks = ["\u0020", "\u200b", "\u0020\u200b\u0020"];
    for (let i = 0; i < 3; i++)
      await messages.handleMessagePatterns(makeMessage({ id: "Z" + i, content: blanks[i] }));
    check(
      "blankNoise → trigger đúng module (nội dung khác nhau)",
      calls.events.some((e) => e.module === "blankNoise"),
    );
    check(
      "blankNoise → không sinh vụ massMessage",
      calls.events.every((e) => e.module !== "massMessage"),
    );
  }

  // ── 8c. massMessage + AI xác nhận raid → leo thang ban + lockdown ──
  // Nhánh leo thang của pattern CHƯA TỪNG chạy: module spam có test từ block 3
  // nhưng massMessage/blankNoise thì không — cả đường ban + khóa kênh của chúng
  // chưa từng được kiểm đúng 1 lần nào.
  {
    await resetLock();
    clear();
    configs.set("g-msg", baseConfig({ lockdownEnabled: true }));
    aiVerdict = { classification: "raid", confidence: 0.85, reason: "lặp lại + link mời" };
    const long = "A".repeat(2200);
    for (let i = 0; i < 3; i++)
      await messages.handleMessagePatterns(makeMessage({ id: "P" + i, content: long }));
    check("massMessage AI raid → phạt BAN", calls.memberBans.length === 1);
    check("massMessage AI raid → khóa kênh (lockdown)", lockdownActive());
    check(
      "massMessage AI raid → sự kiện gắn nhãn (AI: raid)",
      String(calls.events.find((e) => e.module === "massMessage")?.action ?? "").includes(
        "(AI: raid)",
      ),
    );
    check("massMessage AI raid → không cộng nhiệt", calls.heatAdds.length === 0);
    check(
      "massMessage AI raid → ghi mẫu huấn luyện kèm verdict",
      calls.raidSamples.some((s) => s.module === "massMessage" && s.aiClassification === "raid"),
    );
    configs.set("g-msg", baseConfig());
  }

  // ── 8d. blankNoise + AI xác nhận raid → cũng leo thang ban + lockdown ──
  {
    await resetLock();
    clear();
    configs.set("g-msg", baseConfig({ lockdownEnabled: true }));
    aiVerdict = { classification: "raid", confidence: 0.9, reason: "zero-width hàng loạt" };
    const blanks = ["\u0020", "\u200b", "\u0020\u200b\u0020"];
    for (let i = 0; i < 3; i++)
      await messages.handleMessagePatterns(makeMessage({ id: "BW" + i, content: blanks[i] }));
    check("blankNoise AI raid → phạt BAN", calls.memberBans.length === 1);
    check("blankNoise AI raid → khóa kênh (lockdown)", lockdownActive());
    check(
      "blankNoise AI raid → sự kiện đúng module kèm nhãn raid",
      calls.events.some(
        (e) => e.module === "blankNoise" && String(e.action).includes("(AI: raid)"),
      ),
    );
    configs.set("g-msg", baseConfig());
  }

  // ── 8e. massMessage + AI benign (paste tài liệu dài) → bỏ qua, KHÔNG phạt ──
  {
    clear();
    aiVerdict = {
      classification: "benign",
      confidence: 0.8,
      reason: "một người dán tài liệu, không phải spam",
    };
    const long = "B".repeat(2200);
    for (let i = 0; i < 3; i++)
      await messages.handleMessagePatterns(makeMessage({ id: "PB" + i, content: long }));
    check(
      "massMessage AI benign → KHÔNG phạt thành viên",
      calls.memberBans.length === 0 &&
        calls.memberKicks.length === 0 &&
        calls.memberTimeouts.length === 0,
    );
    check("massMessage AI benign → KHÔNG cộng nhiệt", calls.heatAdds.length === 0);
    check(
      "massMessage AI benign → không dọn tin nhắn",
      calls.msgDeleted.length === 0 && calls.bulkDeleted.length === 0,
    );
    check(
      "massMessage AI benign → vẫn ghi sự kiện bỏ qua",
      String(calls.events.find((e) => e.module === "massMessage")?.action ?? "").includes(
        "bỏ qua (AI: benign)",
      ),
    );
    check("massMessage AI benign → không ghi mẫu raid", calls.raidSamples.length === 0);
  }

  // ── 8f. massMessage AI raid nhưng tin cậy thấp → không ban, chỉ cộng nhiệt ──
  {
    clear();
    aiVerdict = { classification: "raid", confidence: 0.3, reason: "mơ hồ" };
    const long = "C".repeat(2200);
    for (let i = 0; i < 3; i++)
      await messages.handleMessagePatterns(makeMessage({ id: "PL" + i, content: long }));
    check(
      "massMessage raid conf 0.3 → không ban (chỉ heat)",
      calls.memberBans.length === 0 && calls.heatAdds.length === 1,
    );
  }

  // ── 8b. blankNoise CHỒNG lúc chờ AI → 1 đợt chỉ 1 vụ ──
  {
    clear();
    let release;
    aiGate = new Promise((r) => (release = r));
    // Hai đợt dùng nội dung KHÁC NHAU hoàn toàn: nếu lặp lại, pattern massMessage
    // chạy trước và kịch bản đang kiểm (blankNoise) không được bắn.
    const round1 = ["\u0020", "\u200b", "\u0020\u200b\u0020"];
    const round2 = ["\u200c", "\u200d", "\u2060\u0020"];
    const first = [];
    for (let i = 0; i < 3; i++)
      first.push(messages.handleMessagePatterns(makeMessage({ id: "Y" + i, content: round1[i] })));
    for (let k = 0; k < 5; k++) await new Promise((r) => setImmediate(r));
    const second = [];
    for (let i = 0; i < 3; i++)
      second.push(messages.handleMessagePatterns(makeMessage({ id: "X" + i, content: round2[i] })));
    release();
    await Promise.all([...first, ...second]);
    const blankEvents = calls.events.filter((e) => e.module === "blankNoise");
    check(
      `blankNoise chồng lúc chờ AI → vẫn chỉ 1 vụ (thực tế ${blankEvents.length})`,
      blankEvents.length === 1,
    );
    check(
      `không phát sinh vụ massMessage ngoài ý muốn (thực tế ${calls.events.filter((e) => e.module === "massMessage").length})`,
      calls.events.filter((e) => e.module === "massMessage").length === 0,
    );
    aiGate = null;
  }

  // ── 9. Webhook → External App Guard, KHÔNG vào pipeline spam ──
  {
    clear();
    const wh = makeMessage({ id: "w1", webhookId: "wh-9" });
    wh.member = null; // webhook không có member
    await messages.handleSpam(wh);
    await messages.handleMessagePatterns(wh);
    // handleSpam KHÔNG route webhook — webhook không có member nên tự im lặng;
    // chỉ handleMessagePatterns chuyển sang External App Guard (đúng thiết kế).
    check(
      "webhook qua handleMessagePatterns → External App Guard",
      calls.events.filter((e) => e.module === "EXTERNAL_APP:message").length === 1,
    );
    check(
      "webhook qua handleSpam → im lặng (member null)",
      !calls.events.some((e) => e.module === "spam"),
    );
    check("webhook → không cộng heat", calls.heatAdds.length === 0);
  }

  // ── 10. Tin nhắn của BOT được mời (member có user.bot) → vẫn bị soi, phạt thẳng tay ──
  {
    clear();
    const botMsg = makeMessage({ id: "bm1", content: "x" });
    botMsg.member.user.bot = true;
    botMsg.author.bot = true;
    aiVerdict = { classification: "raid", confidence: 0.9, reason: "bot spam" };
    for (let i = 0; i < 5; i++) await messages.handleSpam(botMsg);
    check("bot được mời spam → bị soi + phạt ban trực tiếp", calls.memberBans.length === 1);
  }

  // ── 11. Tin nhắn DM → bỏ qua ──
  {
    clear();
    const dm = makeMessage({ id: "dm1" });
    dm.guild = null;
    await messages.handleSpam(dm);
    await messages.handleMessagePatterns(dm);
    check("DM → bỏ qua hoàn toàn", calls.events.length === 0);
  }

  // ── 12. Module tắt → pipeline không chạy ──
  {
    clear();
    configs.set(
      "g-msg",
      baseConfig({ modules: baseConfig().modules.map((m) => ({ ...m, enabled: false })) }),
    );
    for (let i = 0; i < 6; i++) await messages.handleSpam(makeMessage({ id: "off" + i }));
    for (let i = 0; i < 4; i++)
      await messages.handleMessagePatterns(
        makeMessage({ id: "offL" + i, content: "B".repeat(2200) }),
      );
    check(
      "tất cả module tắt → không sự kiện, không phạt",
      calls.events.length === 0 && calls.heatAdds.length === 0,
    );
    configs.set("g-msg", baseConfig());
  }

  // ── 13. antinukeEnabled=false → toàn bộ pipeline tắt ──
  {
    clear();
    configs.set("g-msg", baseConfig({ antinukeEnabled: false }));
    for (let i = 0; i < 6; i++) await messages.handleSpam(makeMessage({ id: "an" + i }));
    check("antinuke off → không sự kiện", calls.events.length === 0);
    configs.set("g-msg", baseConfig());
  }

  // ── 14. Cổng Auto-mod TÁCH khỏi chống nuke ──
  // Bug thật 29/09/2026: lớp tin nhắn dùng chung cổng tổng antinukeEnabled với
  // tab Chống nuke. Tắt chống nuke là mất luôn chống spam/massMessage/blankNoise.
  {
    clear();
    // Chống nuke TẮT nhưng cổng Auto-mod BẬT → spam vẫn phải bị chặn.
    configs.set("g-msg", baseConfig({ antinukeEnabled: false, automodEnabled: true }));
    for (let i = 0; i < 6; i++) await messages.handleSpam(makeMessage({ id: "am" + i }));
    check("tắt chống nuke + bật auto-mod → spam VẪN bị ghi nhận", calls.events.length > 0);

    // Ngược lại: bật chống nuke nhưng cổng Auto-mod TẮT → im lặng.
    clear();
    configs.set("g-msg", baseConfig({ antinukeEnabled: true, automodEnabled: false }));
    for (let i = 0; i < 6; i++) await messages.handleSpam(makeMessage({ id: "ma" + i }));
    check("bật chống nuke + tắt auto-mod → không sự kiện", calls.events.length === 0);

    // Guild cũ chưa có field → kế thừa antinukeEnabled (hành vi không đổi).
    clear();
    const legacy = baseConfig({ antinukeEnabled: false });
    configs.set("g-msg", legacy);
    for (let i = 0; i < 6; i++) await messages.handleSpam(makeMessage({ id: "lg" + i }));
    check(
      "guild cũ + antinuke tắt → auto-mod tắt theo (không đổi hành vi cũ)",
      calls.events.length === 0,
    );

    clear();
    const legacy2 = baseConfig({ antinukeEnabled: true });
    configs.set("g-msg", legacy2);
    for (let i = 0; i < 6; i++) await messages.handleSpam(makeMessage({ id: "lg2" + i }));
    check("guild cũ + antinuke bật → auto-mod kế thừa, vẫn chạy", calls.events.length > 0);
    configs.set("g-msg", baseConfig());
  }

  console.log(`\nKết quả message layers: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})();
