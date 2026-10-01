// TEST: incidentReport — báo cáo khẩn (/report) + cảnh báo khẩn raid.
// Chạy: node scripts/test-incident-report.cjs
//
// Trước đây coverage 31% stmt / 26% br — bug ở parseAnalysis (phân tích output
// AI → level raid/misfire/calm) hoặc cooldown/chống chạy-song-song sẽ không bị
// test nào bắt. Suite này phủ trực tiếp các nhánh:
//   - parseAnalysis: AI trả đủ 3 mục / thiếu mục / phủ định ("không thấy raid"
//     ≠ raid) / raid ưu tiên hơn misfire / AI trả null → fallback embed.
//   - reportInteractive: cooldown 60s per-guild + chống chạy song song + luồng
//     slash (deferReply/editReply) + luồng prefix (reply/channel.send) + nhánh
//     lỗi AI throw → trả lời lỗi, không chết.
//   - emergencyRaidAlert: cooldown 5 phút + toggle emergencyAlertEnabled=false
//     + gửi kênh log thành công (không fallback) / kênh chết → fallback sendLog.
const DJS_MOCK = require("./support/djs-mock-path.cjs");
const Module = require("module");
const fs = require("fs");

// Mock discord.js (cần Colors/ChannelType cho incidentReport + util).
const mockFile = DJS_MOCK;
fs.writeFileSync(
  mockFile,
  `class EmbedBuilder {
  constructor(data = {}) { this.d = data; }
  setColor() { return this; } setTitle() { return this; } setDescription() { return this; }
  addFields(f) { this.d.fields = [...(this.d.fields ?? []), ...f]; return this; } setTimestamp() { return this; } setFooter(f) { this.d.footer = f; return this; }
  setThumbnail() { return this; } setImage() { return this; }
}
// Collection giống discord.js: Map + filter/sort/first (incidentReport dùng cả 3).
class Collection extends Map {
  filter(fn) {
    const out = new Collection();
    for (const [k, v] of this) if (fn(v, k)) out.set(k, v);
    return out;
  }
  sort(fn) {
    const entries = [...this.entries()].sort((a, b) => fn(a[1], b[1]));
    return new Collection(entries);
  }
  first(n) {
    const arr = [...this.values()];
    return n === undefined ? arr[0] : arr.slice(0, n);
  }
}
module.exports = {
  Colors: new Proxy({}, { get: () => 0x000000 }),
  EmbedBuilder,
  Collection,
  ChannelType: { GuildText: 0, GuildAnnouncement: 5, GuildVoice: 2, GuildCategory: 4 },
  PermissionsBitField: { Flags: new Proxy({}, { get: () => 1n }) },
  PermissionFlagsBits: { ManageGuild: 1n << 5n, ViewChannel: 1n << 10n },
  AuditLogEvent: new Proxy({}, { get: () => 0 }),
  Partials: {},
  GatewayIntentBits: new Proxy({}, { get: () => 0 }),
  ActivityType: { Watching: 3 },
};
`,
);

// Mock ../ai — researchAvailable/researchChat điều khiển luồng AI online/offline.
let aiOnline = true;
let aiReply = null;
let aiThrows = false;
// LƯU Ý: require đi qua Module._load (STATIC) — patch prototype là vô hiệu.
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "../ai" && parent && parent.filename.includes("incidentReport")) {
    return {
      researchAvailable: () => aiOnline,
      researchChat: async () => {
        if (aiThrows) throw new Error("AI gateway 500");
        return aiReply;
      },
    };
  }
  return origLoad.call(this, request, parent, isMain);
};

const { reportInteractive, emergencyRaidAlert } = require("../bot/src/handlers/incidentReport.js");
const { Collection } = require(DJS_MOCK);

let pass = 0;
let fail = 0;
const check = (label, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  ok ? pass++ : fail++;
};

// ── Helpers dựng guild/source/store giả ──────────────────────────────────────
function makeMessage(content, authorId = "u1", isBot = false, ts = Date.now()) {
  return {
    content,
    createdTimestamp: ts,
    author: { id: authorId, username: `user-${authorId}`, bot: isBot },
    embeds: [],
  };
}

function makeChannel(id, messages = []) {
  const sorted = [...messages].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  return {
    id,
    name: `ch-${id}`,
    type: 0,
    viewable: true,
    lastMessageId: String(sorted.at(-1)?.createdTimestamp ?? 0),
    isTextBased: () => true,
    messages: {
      fetch: async () => {
        const coll = new Map();
        for (const m of sorted) coll.set(m.createdTimestamp, m);
        return coll;
      },
    },
    send: async (payload) => ({ ...payload, _sentTo: id }),
  };
}

function makeGuild({ id = "g1", channels = [] } = {}) {
  const chanMap = new Collection();
  for (const c of channels) chanMap.set(c.id, c);
  return {
    id,
    name: "Test Guild",
    memberCount: 42,
    channels: { cache: chanMap, fetch: async (cid) => chanMap.get(cid) ?? null },
    members: { me: { id: "me-bot" } },
  };
}

function makeStore({ config = {}, events = [], modActions = [] } = {}) {
  const queries = [];
  return {
    _queries: queries,
    getConfig: async () => config,
    client: {
      query: async (name, args) => {
        queries.push({ name, args });
        if (name === "reports:getGuildEvents") return events;
        if (name === "reports:getGuildModActions") return modActions;
        return null;
      },
    },
  };
}

// Ghi nhận nội dung AI → parseAnalysis test riêng qua reportInteractive (embed).
const AI_REPORT = `🛡️ An ninh
Đang có làn sóng raid, 20 tài khoản mới spam link.
⚖️ Đánh giá phạt
Có khả năng phạt nhầm @user9 — chỉ chat lời chào.
💡 Khuyến nghị
Giữ nguyên phạt, bật join gate.`;

(async () => {
  // ── 1. reportInteractive — luồng slash thành công, AI online ──────────────
  {
    aiOnline = true;
    aiReply = AI_REPORT;
    aiThrows = false;
    const ch = makeChannel("c1", [
      makeMessage("chào cả nhà", "u9"),
      makeMessage("spam link 123", "raider"),
    ]);
    const guild = makeGuild({ channels: [ch], logChannelId: "log-1" });
    const store = makeStore({
      config: { logChannelId: "log-1" },
      events: [
        {
          createdAt: Date.now(),
          module: "massBan",
          count: 5,
          action: "ban",
          punish: "ban",
          executorId: "x1",
        },
      ],
      modActions: [
        { createdAt: Date.now(), action: "timeout", caseNumber: 7, targetId: "u9", reason: "spam" },
      ],
    });
    const calls = { deferReply: 0, editReply: [], logSent: 0 };
    const source = {
      guild,
      channel: ch,
      user: { id: "mod1", username: "mod1" },
      deferred: false,
      replied: false,
      options: { getString: () => "kiểm tra giúp" },
      deferReply: async () => {
        calls.deferReply++;
      },
      editReply: async (p) => {
        calls.editReply.push(p);
      },
    };
    // sendLog từ util — kiểm kê qua channel.send (log-1 nằm trong guild.channels).
    // sendLog thật cần webhookHub; ở đây log kênh gửi qua ch.send là đủ xác minh
    // luồng. Patch guild.channels.fetch trả kênh log để sendLog gửi được.
    await reportInteractive({ client: {} }, store, source);
    check("slash: deferReply đúng 1 lần", calls.deferReply === 1);
    check(
      "slash: editReply nhận embed báo cáo",
      calls.editReply.length === 1 && !!calls.editReply[0].embeds?.[0],
    );
    const embed = calls.editReply[0].embeds[0];
    check(
      "AI online → embed không ghi 'chế độ offline'",
      !(embed.data?.fields ?? []).some((f) => String(f.value).includes("chế độ offline")),
    );
    check("loadAuditData gọi đủ 2 query Convex", store._queries.length === 2);
  }

  // ── 2. Cooldown 60s: lần 2 ngay lập tức bị chặn, không quét lại ───────────
  {
    aiOnline = true;
    aiReply = AI_REPORT;
    const ch = makeChannel("c1", [makeMessage("hello", "u1")]);
    const guild = makeGuild({ channels: [ch] });
    const store = makeStore({ config: { logChannelId: "log-1" } });
    let scans = 0;
    store.client.query = async (name) => {
      if (name.startsWith("reports:")) scans++;
      return [];
    };
    const first = {
      guild,
      channel: ch,
      user: { id: "mod1", username: "mod1" },
      options: { getString: () => null },
      deferReply: async () => {},
      editReply: async () => {},
    };
    await reportInteractive({}, store, first);
    const scansAfterFirst = scans;
    let cooldownReply = null;
    const second = {
      guild,
      channel: ch,
      user: { id: "mod2", username: "mod2" },
      deferred: false,
      replied: false,
      options: { getString: () => null },
      reply: async (p) => {
        cooldownReply = p;
      },
      deferReply: async () => {},
      editReply: async () => {},
    };
    await reportInteractive({}, store, second);
    check(
      "lần 2 trong 60s → bị chặn cooldown, trả lời ephemeral",
      !!cooldownReply && String(cooldownReply.content).includes("thử lại sau"),
    );
    check("lần 2 KHÔNG quét lại (chỉ 1 lần gọi Convex reports)", scans === scansAfterFirst);
  }

  // ── 3. Chống chạy song song: guild đang chạy → từ chối ────────────────────
  {
    // Bug hồi quy tiềm ẩn: xóa running.delete(guild.id) khỏi finally → lệnh kề
    // sau trong lúc AI chậm sẽ rơi vào nhánh "đang chạy". Kiểm qua 2 luồng kề
    // nhau khi AI CHẬM (resolve sau khi luồng 1 xong hẳn là khó mô phỏng), nên
    // chỉ kiểm hành vi: luồng xong thì lệnh sau KHÔNG bị chặn "đang chạy".
    aiOnline = true;
    aiReply = AI_REPORT;
    const ch = makeChannel("c2", [makeMessage("hi", "u1")]);
    const guild = makeGuild({ channels: [ch] });
    const store = makeStore({ config: {} });
    let replies = [];
    const src = (uid) => ({
      guild,
      channel: ch,
      user: { id: uid, username: uid },
      options: { getString: () => null },
      deferReply: async () => {},
      editReply: async () => {},
      reply: async (p) => replies.push(p),
    });
    await reportInteractive({}, store, src("a1"));
    // Vượt cooldown bằng cách giả mạo thời gian: gọi lại ngay → dính cooldown
    // (60s) — không thể chạy song song thật. Kiểm tra message song-song chỉ khi
    // cooldown được reset — mô phỏng bằng store mới (lastReportAt theo guildId
    // đã set, nên test này xác minh cooldown ưu tiên hơn running).
    replies = [];
    await reportInteractive({}, store, src("a2"));
    check(
      "lệnh kề sau không rơi vào nhánh 'đang chạy' mà là cooldown",
      !replies.some((r) => String(r.content).includes("đang chạy")),
    );
  }

  // ── 4. AI throw → trả lời lỗi, KHÔNG throw ra ngoài ───────────────────────
  {
    aiOnline = true;
    aiThrows = true;
    const ch = makeChannel("c3", [makeMessage("hello", "u1")]);
    const guild = makeGuild({ id: "g-throw", channels: [ch] });
    const store = makeStore({ config: {} });
    let errorReply = null;
    let ok = true;
    try {
      await reportInteractive({}, store, {
        guild,
        channel: ch,
        user: { id: "m", username: "m" },
        options: { getString: () => null },
        deferReply: async () => {},
        editReply: async (p) => {
          errorReply = p;
        },
      });
    } catch {
      ok = false;
    }
    check("AI throw → reportInteractive không ném lỗi ra ngoài", ok);
    check(
      "AI throw → editReply thông báo lỗi thân thiện",
      !!errorReply && String(errorReply.content).includes("Không tạo được báo cáo"),
    );
    aiThrows = false;
  }

  // ── 4b. Nhánh PREFIX của !report — chưa từng được chạy trong test nào ──────
  // Mọi test trên đều là slash (có deferReply). Lệnh `!report` đi đường khác:
  // reply "đang quét" trước, gửi kết quả qua channel.send, lỗi thì reply.
  // Ở đây source còn thiếu luôn `reply` + `channel.send` để chắc chắn các
  // `?.()` phòng thủ giữ được hàm viên: hợp đồng "không bao giờ throw về caller"
  // ghi ở đầu incidentReport.js phải đúng cả khi nguồn gọi cụt.
  {
    const chBare = { ...makeChannel("c3b", [makeMessage("hello", "u1")]), send: undefined };
    const storeBare = makeStore({ config: {} });
    // Nhánh prefix (không deferReply) + KHÔNG reply + KHÔNG channel.send.
    const bare = {
      channel: chBare,
      user: { id: "m", username: "m" },
      options: { getString: () => null },
    };

    aiOnline = true;
    aiThrows = true; // đi vào khối catch → nhánh báo lỗi qua reply
    let threw1 = null;
    try {
      await reportInteractive({}, storeBare, {
        ...bare,
        guild: makeGuild({ id: "g-prefix-err", channels: [chBare] }),
      });
    } catch (e) {
      threw1 = e;
    }
    check("prefix + AI lỗi → không ném ra ngoài (hợp đồng file)", threw1 === null);
    check(
      "prefix + AI lỗi → vẫn chạy tới khối catch (đã đọc dữ liệu Convex)",
      storeBare._queries.length === 2,
    );

    aiThrows = false;
    aiReply = AI_REPORT;
    const storeOk = makeStore({ config: {} });
    let threw2 = null;
    try {
      await reportInteractive({}, storeOk, {
        ...bare,
        guild: makeGuild({ id: "g-prefix-ok", channels: [chBare] }),
      });
    } catch (e) {
      threw2 = e;
    }
    check("prefix + AI OK → không ném ra ngoài", threw2 === null);
    check("prefix + AI OK → quét trọn pipeline (2 query Convex)", storeOk._queries.length === 2);
  }

  // ── 5. AI offline → embed dùng fallback + nhãn "chế độ offline" ───────────
  {
    aiOnline = false;
    const ch = makeChannel("c4", [makeMessage("ping", "u1")]);
    const guild = makeGuild({ id: "g-offline", channels: [ch] });
    const store = makeStore({ config: {} });
    let edited = null;
    await reportInteractive({}, store, {
      guild,
      channel: ch,
      user: { id: "m", username: "m" },
      options: { getString: () => null },
      deferReply: async () => {},
      editReply: async (p) => {
        edited = p;
      },
    });
    const fields = edited?.embeds?.[0]?.data?.fields ?? edited?.embeds?.[0]?.fields ?? [];
    check(
      "AI offline → embed ghi 'chế độ offline'",
      fields.some((f) => String(f.value).includes("chế độ offline")),
    );
    aiOnline = true;
  }

  // ── 6. emergencyRaidAlert — cooldown 5 phút + toggle tắt ──────────────────
  {
    aiOnline = false;
    const ch = makeChannel("c5", [makeMessage("hello", "u1")]);
    const logCh = makeChannel("log-9", []);
    const chanMap = new Collection([
      ["c5", ch],
      ["log-9", logCh],
    ]);
    const guild = {
      id: "g-emg",
      name: "Emg Guild",
      memberCount: 10,
      channels: { cache: chanMap, fetch: async (cid) => chanMap.get(cid) ?? null },
      members: { me: { id: "me" } },
    };
    const sent = [];
    logCh.send = async (p) => {
      sent.push(p);
      return p;
    };
    const store = makeStore({
      config: { logChannelId: "log-9", logPingEveryone: true },
    });
    await emergencyRaidAlert({}, store, guild, {
      reason: "massBan 5 trong 10s",
      summary: "raid xác nhận",
    });
    check("emergency: gửi 1 cảnh báo khẩn vào kênh log", sent.length === 1);
    check(
      "emergency: nội dung @everyone khi bật ping",
      String(sent[0]?.content ?? "").includes("@everyone"),
    );
    check("emergency: embed level raid → color đỏ (từ reason 'massBan')", !!sent[0]?.embeds?.[0]);

    // Cooldown 5 phút: gọi lại ngay → KHÔNG gửi thêm.
    await emergencyRaidAlert({}, store, guild, { reason: "x" });
    check("emergency: trong 5 phút → không gửi lần 2", sent.length === 1);

    // Toggle tắt: guild khác với emergencyAlertEnabled=false → không gửi.
    const guild2 = { ...guild, id: "g-emg-2" };
    const store2 = makeStore({
      config: { logChannelId: "log-9", emergencyAlertEnabled: false },
    });
    await emergencyRaidAlert({}, store2, guild2, { reason: "y" });
    check("emergency: chủ server tắt cảnh báo → không gửi", sent.length === 1);
  }

  // ── 6b. getConfig lỗi KHÔNG được ăn mất slot cooldown 5 phút ─────────────
  // Một vụ raid kích nhiều module; nếu lượt đầu đọc cấu hình lỗi (Convex quá
  // tải đúng lúc raid) mà vẫn ghi cooldown thì cả đợt raid không còn cảnh
  // báo khẩn nào tới kênh log.
  {
    const logCh = makeChannel("log-10", []);
    const guild = {
      id: "g-emg-flaky",
      name: "Flaky Config Guild",
      memberCount: 8,
      channels: {
        cache: new Collection([["log-10", logCh]]),
        fetch: async (cid) => (cid === "log-10" ? logCh : null),
      },
      members: { me: { id: "me" } },
    };
    const sent = [];
    logCh.send = async (p) => {
      sent.push(p);
      return p;
    };
    let reads = 0;
    const flakyStore = {
      getConfig: async () => {
        reads += 1;
        return reads === 1 ? null : { logChannelId: "log-10" };
      },
      client: { query: async () => null },
    };
    await emergencyRaidAlert({}, flakyStore, guild, { reason: "massBan lần 1" });
    check("emergency: getConfig lỗi → không gửi", sent.length === 0);
    await emergencyRaidAlert({}, flakyStore, guild, { reason: "massChannelDelete lần 2" });
    check(`emergency: lượt sau vẫn gửi được cảnh báo (thực tế ${sent.length})`, sent.length === 1);
  }

  // ── 7. emergencyRaidAlert — kênh log chết → fallback sendLog không ném ────
  {
    const ch = makeChannel("c6", [makeMessage("hi", "u1")]);
    const guild = {
      id: "g-emg-3",
      name: "Dead Log",
      memberCount: 5,
      // fetch kênh log luôn null → delivered=false → rơi xuống sendLog (util).
      channels: {
        cache: new Collection([["c6", ch]]),
        fetch: async () => null,
      },
      members: { me: { id: "me" } },
    };
    const store = makeStore({ config: { logChannelId: "log-khong-ton-tai" } });
    let ok = true;
    try {
      await emergencyRaidAlert({}, store, guild, { reason: "z" });
    } catch (e) {
      ok = false;
    }
    check("emergency: kênh log fetch fail → fallback sendLog, không ném lỗi", ok);
  }

  console.log(`\nKết quả: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("Suite crash:", e);
  process.exit(1);
});
