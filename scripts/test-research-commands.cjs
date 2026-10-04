// Test researchCommands.js — /research + !research flows với store + source GIẢ.
// Chạy: node scripts/test-research-commands.cjs
//
// Mock discord.js bằng đường dẫn trỏ sang module giả (Colors chỉ là object).
const Module = require("module");
const DJS_MOCK = require("./support/djs-mock-path.cjs");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "discord.js") {
    // Trả về util.js cũng đủ — nó re-export Colors từ discord.js... không được.
    // Thay vào đó tạo module giả trong tmp.
    return DJS_MOCK;
  }
  return origResolve.call(this, request, ...args);
};
// Tạo mock discord.js (Colors + EmbedBuilder builder chain).
const fs = require("fs");
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
module.exports = { Colors: new Proxy({}, { get: () => 0x000000 }), EmbedBuilder, PermissionFlagsBits: { ManageGuild: 1n << 5n, Administrator: 1n << 3n } };
`,
);

// ── fetch GIẢ ─────────────────────────────────────────────────────────────
// Các case `learn` / `learnNow` ở dưới gọi runResearch THẬT → research.js,
// threatEngine và ai.js đều đi qua globalThis.fetch. Không chặn network thì
// test gọi Reddit/CISA/URLhaus thật: chậm và tuỳ hạ tầng (mạng yếu là fail
// ngẫu nhiên), còn từ khoá lấy từ feed thật thì đổi mỗi ngày → assert lung
// lay. Fixture cố định + bộ đếm lời gọi để chứng minh không lọt mạng.
const realFetch = globalThis.fetch;
let fetchCalls = 0;
// Bật lên để ép nhánh "feed trả rác (không phải JSON)". Trước đợt mock này, nhánh
// parse lỗi chỉ được phủ TÌNH CỜ vì Reddit trả 403 dạng HTML — tức là đường bảo vệ
// quan trọng lại phụ thuộc mạng. Giờ ép tường minh.
let garbledFeed = false;
const REDDIT_FIXTURE = {
  data: {
    children: [
      {
        data: {
          title: "Warning: fake nitro scam hitting servers — v0lt-stealer wave again",
          selftext: "attackers mass-mention and dm fake captcha links",
        },
      },
    ],
  },
};
// Feed URLhaus là CSV (dòng `#` là comment) — threatEngine.parse cần đúng
// hình dạng này, nếu trả 503 thì nhánh researchUrlhaus không bao giờ chạy tới.
const URLHAUS_CSV = [
  "# firstseen, url, url_status",
  "2026-10-01 10:00:00, http://malware-c2-9x.top/a.exe, offline",
  "2026-10-01 11:00:00, http://phishing-login.xyz/b.bin, offline",
  "",
].join("\n");

globalThis.fetch = async (url) => {
  fetchCalls++;
  const u = String(url);
  const junk = { ok: true, status: 200, text: async () => "<html>403 Forbidden</html>" };
  if (u.includes("reddit.com")) {
    return garbledFeed
      ? junk
      : { ok: true, status: 200, text: async () => JSON.stringify(REDDIT_FIXTURE) };
  }
  if (u.includes("abuse.ch")) {
    return { ok: true, status: 200, text: async () => URLHAUS_CSV };
  }
  if (u.includes("cisa.gov")) {
    return garbledFeed ? junk : { ok: false, status: 503, text: async () => "" };
  }
  // Mọi provider AI: cố tình trả lỗi để lượt học đi tiếp được nhánh "AI chết"
  // (aiUsed=false) — đúng hành vi khi provider thật hạ.
  return { ok: false, status: 503, text: async () => "" };
};

const { handleResearch } = require("../bot/src/handlers/researchCommands.js");
const research = require("../bot/src/research.js");

const mutations = [];
// "ok" | "null" (query lỗi → bot dùng fallback botGetIntel) | "empty"
let historyMode = "ok";
const store = {
  client: {
    query: async (name) => {
      if (name === "threatIntel:getResearchHistory") {
        if (historyMode === "null") return null;
        if (historyMode === "empty") return [];
      }
      if (name === "threatIntel:botGetIntel") {
        return {
          researchEnabled: true,
          keywords: ["tokengrabber", "fakecaptcha"],
          scamPhrases: ["free nitro redeem"],
          runs: 5,
          lastRunAt: Date.now() - 3600_000,
          sources: ["reddit-modsupport", "cisa-kev"],
          summary: "Xu hướng: token stealer giả captcha đang nổi.",
        };
      }
      if (name === "threatIntel:getResearchHistory") {
        return [
          {
            trigger: "manual",
            sources: ["reddit-scams"],
            newKeywords: 4,
            newPhrases: 1,
            aiUsed: true,
            summary: null,
            totalKeywords: 18,
            totalPhrases: 6,
            requestedBy: "wio",
            createdAt: Date.now() - 60_000,
          },
          {
            trigger: "auto",
            sources: ["reddit-modsupport"],
            newKeywords: 2,
            newPhrases: 0,
            aiUsed: false,
            summary: null,
            totalKeywords: 14,
            totalPhrases: 5,
            requestedBy: null,
            createdAt: Date.now() - 4 * 3600_000,
          },
        ];
      }
      return null;
    },
    mutation: async (name, args) => {
      mutations.push({ name, args });
      return { ok: true };
    },
  },
  getConfig: async () => ({ modRoles: [], adminRoles: [] }),
};

function makeSource({ canManage = true, sub = "status", isSlash = true, args = [] } = {}) {
  const replies = [];
  const src = {
    guild: { id: "g1" },
    member: { permissions: { has: () => canManage }, roles: { cache: new Map() } }, // has() trả canManage cho mọi permission
    user: { username: "wio" },
    options: { getSubcommand: () => sub },
    args,
    replies,
    deferReply: async () => {},
    editReply: async (payload) => replies.push(payload),
    reply: async (payload) => replies.push(payload),
    channel: { send: async (p) => replies.push(p) },
    _replies: replies,
    _isSlash: isSlash,
  };
  // Prefix `!research` KHÔNG có deferReply/editReply/options — bot phải tự rơi
  // về nhánh message. Xoá hẳn các method slash để không thể đi nhầm nhánh.
  if (!isSlash) {
    delete src.deferReply;
    delete src.editReply;
    delete src.options;
  }
  return src;
}

(async () => {
  let pass = 0;
  let fail = 0;
  const check = (label, ok) => {
    console.log(ok ? `PASS ${label}` : `FAIL ${label}`);
    ok ? pass++ : fail++;
  };

  // 1. status — ai cũng xem được
  const s1 = makeSource({ sub: "status" });
  await handleResearch({}, store, s1);
  const st = JSON.stringify(s1._replies);
  check("status: trả embed", s1._replies.length > 0 && st.includes("embeds"));
  check(
    "status: hiện số từ khóa",
    st.includes("Từ khóa đang nhớ") || st.includes("tokengrabber") === false,
  );

  // 2. learn — mod được học
  const s2 = makeSource({ sub: "learn", canManage: true });
  await handleResearch({}, store, s2);
  check("learn: mod gọi được", s2._replies.length > 0);
  check(
    "learn: mutation botSetResearchRun đã ghi (qua learnNow → runResearch)",
    mutations.some((m) => m.name === "threatIntel:requestManualLearn") ||
      mutations.some((m) => m.name === "threatIntel:botSetResearchRun"),
  );

  // 3. learn — thường bị chặn
  const s3 = makeSource({ sub: "learn", canManage: false });
  await handleResearch({}, store, s3);
  const s3t = JSON.stringify(s3._replies);
  check("learn: thường bị chặn (🔒)", s3t.includes("mod/admin"));

  // 4. history
  const s4 = makeSource({ sub: "history" });
  await handleResearch({}, store, s4);
  check("history: hiển thị lượt học", JSON.stringify(s4._replies).includes("thủ công"));

  // 5. learnNow chạy đúng pipeline và ghi trigger=manual
  mutations.length = 0;
  const res = await research.learnNow(store, "wio");
  check("learnNow: trả kết quả", typeof res.newKeywords === "number");
  check(
    "learnNow: trigger=manual + requestedBy",
    mutations.some(
      (m) =>
        m.name === "threatIntel:botSetResearchRun" &&
        m.args.trigger === "manual" &&
        m.args.requestedBy === "wio",
    ),
  );

  // 6. Đường PREFIX `!research` — trước đây KHÔNG có test nào chạy tới nhánh
  //    này: bot gửi lệnh tiếp trong kênh mà lỗi im lặng (chỉ slash mới chạy).
  {
    const p1 = makeSource({ sub: "learn", isSlash: false, args: ["learn"] });
    await handleResearch({}, store, p1);
    const t1 = JSON.stringify(p1._replies);
    check(
      "prefix learn: báo 'Đang kích hoạt' trước khi chạy",
      t1.includes("Đang kích hoạt lượt học"),
    );
    check(
      "prefix learn: kết quả đăng qua channel.send (không dùng editReply)",
      p1._replies.some((r) => r && r.embeds) && !p1._replies.some((r) => r === undefined),
    );
  }
  {
    // Không truyền args → mặc định "status" (không được lỗi vì thiếu options).
    const p2 = makeSource({ isSlash: false, args: [] });
    await handleResearch({}, store, p2);
    check(
      "prefix không args → chạy status",
      JSON.stringify(p2._replies).includes("Tiến độ học tập"),
    );
  }

  // 7. history khi query lỗi (bot thiếu token) → rơi về botGetIntel thay vì im
  historyMode = "null";
  {
    const h1 = makeSource({ sub: "history" });
    await handleResearch({}, store, h1);
    check(
      "history: query lỗi → rơi về botGetIntel, vẫn trả lời được",
      JSON.stringify(h1._replies).includes("Lượt học gần nhất"),
    );
  }
  historyMode = "empty";
  {
    const h2 = makeSource({ sub: "history" });
    await handleResearch({}, store, h2);
    check(
      "history: rỗng → báo chưa có lượt học nào",
      JSON.stringify(h2._replies).includes("Chưa có lượt học nào"),
    );
  }
  historyMode = "ok";

  // 8. learnNow ném lỗi (provider AI chết) → phải báo lỗi, không im lặng
  {
    const realLearnNow = research.learnNow;
    research.learnNow = async () => {
      throw new Error("provider AI không phản hồi");
    };
    const f1 = makeSource({ sub: "learn" });
    await handleResearch({}, store, f1);
    check(
      "learn lỗi (slash): trả lời lỗi thay vì im lặng",
      JSON.stringify(f1._replies).includes("Lượt học thất bại"),
    );
    const f2 = makeSource({ isSlash: false, args: ["learn"] });
    await handleResearch({}, store, f2);
    check(
      "learn lỗi (prefix): trả lời lỗi thay vì im lặng",
      JSON.stringify(f2._replies).includes("Lượt học thất bại"),
    );
    research.learnNow = realLearnNow;
  }

  // 9. Nhánh PREFIX của !research learn khi source cụt hàm trả lời
  // Block 8 mới phủ lệnh lỗi nhưng source luôn có `reply`. Ở đây bỏ hẳn
  // `reply` / `channel` để chắc chắn các `?.()` phòng thủ giữ được: lệnh
  // không được ném lỗi ra ngoài dù không gửi được tin nhắn nào.
  {
    const realLearnNow = research.learnNow;
    research.learnNow = async () => {
      throw new Error("provider AI không phản hồi");
    };
    const bare = makeSource({ isSlash: false, args: ["learn"] });
    delete bare.reply;
    let threw1 = null;
    try {
      await handleResearch({}, store, bare);
    } catch (e) {
      threw1 = e;
    }
    check("learn lỗi + source không có reply → không ném ra ngoài", threw1 === null);

    // Nhánh thành công của prefix gửi embed qua channel.send — cũng phải chịu
    // được khi channel vắng.
    research.learnNow = async () => ({
      sources: ["a"],
      newKeywords: 1,
      newPhrases: 0,
      totalKeywords: 5,
      aiUsed: false,
    });
    const bare2 = makeSource({ isSlash: false, args: ["learn"] });
    delete bare2.reply;
    delete bare2.channel;
    let threw2 = null;
    try {
      await handleResearch({}, store, bare2);
    } catch (e) {
      threw2 = e;
    }
    check("learn OK + source không có channel → không ném ra ngoài", threw2 === null);
    research.learnNow = realLearnNow;
  }

  // 10. learnNow chạy offline: đủ dữ liệu trong fixture, không lọt mạng.
  {
    const callsBefore = fetchCalls;
    const off = await research.learnNow(store, "wio");
    console.log("[result]", JSON.stringify(off));
    check("offline: đã gọi fetch (tức đi qua mock, không lọt mạng)", fetchCalls > callsBefore);
    check("offline: đọc được nguồn reddit từ fixture", off.sources.includes("reddit-modsupport"));
    check("offline: đọc được nguồn urlhaus từ fixture", off.sources.includes("urlhaus"));
    check(
      "offline: trích được từ khoá + cụm từ từ fixture",
      // newKeywords/newPhrases là SỐ ĐẾM (xem notifyManualResult). Bằng 0 nghĩa
      // là researchReddit hoặc extractKeywords đã hỏng âm thầm — đúng lỗi cần chặn.
      off.newKeywords > 0 && off.newPhrases > 0,
    );
  }

  // 11. Feed JSON hỏng → bỏ riêng nguồn lỗi, KHÔNG làm hỏng cả lượt học.
  {
    garbledFeed = true;
    let garbled = null;
    let threw = null;
    try {
      garbled = await research.learnNow(store, "wio");
    } catch (e) {
      threw = e;
    }
    check("feed JSON hỏng: không ném lỗi ra ngoài", threw === null);
    check(
      "feed JSON hỏng: bỏ riêng nguồn reddit/cisa lỗi, giữ nguồn còn tốt",
      garbled &&
        !garbled.sources.includes("reddit-modsupport") &&
        !garbled.sources.includes("cisa-kev") &&
        garbled.sources.includes("urlhaus"),
    );
    garbledFeed = false;
  }

  console.log(`\nKết quả research commands: ${pass} PASS, ${fail} FAIL`);
  globalThis.fetch = realFetch;
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("CRASH:", e);
  globalThis.fetch = realFetch;
  process.exit(1);
});
