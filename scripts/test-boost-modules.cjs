// TEST: gói tăng cường A1+A2 (threat intel), C1 (snapshot cục bộ), D1 (preload config).
// Chạy: node scripts/test-boost-modules.cjs
//
// Chặn tái diễn cho 3 module đốt tài nguyên VPS đổi sức mạnh:
//   - A1: URLhaus 30 phút / 3000 dòng / cap 15000 domain
//   - A2: OpenPhish feed hợp nhất vào cùng Set với URLhaus
//   - C1: snapshot nén zlib + rotate 48 điểm + đọc lại nguyên vẹn
//   - D1: prewarmConfigs làm ấm cache; TTL 1800s

const path = require("path");
const Module = require("module");
const fs = require("fs");
const os = require("os");

let pass = 0,
  fail = 0;
function check(name, cond) {
  if (cond) {
    pass++;
    console.log(`PASS ${name}`);
  } else {
    fail++;
    console.error(`FAIL ${name}`);
  }
}

// — Mock discord.js + fetch cho threatEngine (giống test-threat-engine.cjs) ——
const root = path.join(__dirname, "..");
// Mock ghi vào tmpdir thay vì thư mục repo — tránh làm bẩn `git status` trên
// máy khác (file cũ từng bị commit kèm đường dẫn tuyệt đối của máy build, chạy test
// trên VPS là git báo "modified" ảo). Xem commit vá kèm test này.
const TMP_MOCK = path.join(os.tmpdir(), "protogon-djs-mock-boost-" + process.pid + ".cjs");
const mockSrc = `
class Collection extends Map {}
module.exports = {
  Colors: new Proxy({}, { get: () => 0x000000 }),
  AuditLogEvent: new Proxy({}, { get: () => 1 }),
  EmbedBuilder: class { constructor(d = {}) { this.d = { ...d }; } setColor(c) { this.d.color = c; return this; } setTitle(t) { this.d.title = t; return this; } setDescription(x) { this.d.description = x; return this; } addFields(f) { this.d.fields = (this.d.fields || []).concat(f); return this; } setFooter(f) { this.d.footer = f; return this; } setTimestamp() { return this; } },
  AttachmentBuilder: class {},
  PermissionFlagsBits: new Proxy({}, { get: () => 1n }),
  ChannelType: { GuildText: 0, GuildAnnouncement: 5, GuildVoice: 2, GuildCategory: 4, GuildStageVoice: 13, GuildForum: 15 },
  Collection,
};
`;
fs.writeFileSync(TMP_MOCK, mockSrc);
process.on("exit", () => {
  try {
    fs.unlinkSync(TMP_MOCK);
  } catch {
    // đã xoá
  }
});
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "discord.js") return require(TMP_MOCK);
  return origLoad.call(this, request, parent, isMain);
};

const engine = require("../bot/src/threatEngine.js");
const snap = require("../bot/src/localSnapshot.js");

(async () => {
  /* ── A1 — tham số URLhaus nâng cấp ─────────────────────────────────────── */
  {
    const src = fs.readFileSync(path.join(root, "bot", "src", "threatEngine.js"), "utf8");
    check("A1: chu kỳ URLhaus 30 phút", src.includes("URLHAUS_INTERVAL_MS = 30 * 60 * 1000"));
    check("A1: cap 15000 domain", src.includes("URLHAUS_MAX_DOMAINS = 15000"));
    check("A1: đọc 3000 dòng/lượt", src.includes("URLHAUS_LINES = 3000"));
    check(
      "A2: có nguồn OpenPhish",
      src.includes("OPENPHISH_URL") && src.includes("refreshOpenPhish"),
    );
  }

  /* ── A2 — hostsFromFeed (thuần) + refreshOpenPhish (fetch mock) ─────────── */
  {
    const hosts = engine.hostsFromFeed(
      [
        "https://evil-one.example/payload",
        "https://sub.evil-two.example/login",
        "",
        "not a url",
      ].join("\n"),
    );
    check(
      "A2: hostsFromFeed trích đúng host",
      hosts.size === 2 && hosts.has("evil-one.example") && hosts.has("sub.evil-two.example"),
    );
    check("A2: dòng rác bị bỏ", !hosts.has("not a url"));

    check(
      "A2: host trước feed không khớp",
      !engine.isUrlhausDomain("http://phish-discord-verify.example/x"),
    );

    const origFetch = globalThis.fetch;
    let feedCalled = 0;
    globalThis.fetch = async (url) => {
      feedCalled++;
      if (String(url).includes("openphish")) {
        return {
          ok: true,
          text: async () =>
            "https://phish-discord-verify.example/gift\nhttps://steam-gift-vn.example/topup",
        };
      }
      return { ok: false, text: async () => "" };
    };
    let ok;
    try {
      ok = await engine.refreshOpenPhish({});
    } finally {
      globalThis.fetch = origFetch;
    }
    check("A2: refreshOpenPhish thành công", ok === true && feedCalled === 1);
    check(
      "A2: host OpenPhish khớp qua isUrlhausDomain (Set dùng chung)",
      engine.isUrlhausDomain("https://phish-discord-verify.example/gift") === true,
    );
    check(
      "A2: feed chết/JSON rác → false, không ném",
      await (async () => {
        globalThis.fetch = async () => ({ ok: false, text: async () => "" });
        try {
          return (await engine.refreshOpenPhish({})) === false;
        } finally {
          globalThis.fetch = origFetch;
        }
      })(),
    );
  }

  /* ── C1 — snapshot cục bộ: ghi → rotate → đọc lại ──────────────────────── */
  {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "snap-boost-"));
    process.env.PROTOGON_SNAPSHOT_DIR = tmpDir;
    try {
      const payload = {
        snapshotAt: 1,
        guild: { id: "g1", name: "Test", roles: [{ id: "r1" }], channels: "x".repeat(200) },
      };
      const w = snap.writeLocalSnapshot("g1", payload, 1000);
      check("C1: ghi snapshot nén thành công", !!w && w.bytes > 0 && w.file.endsWith("1000.z"));
      // File nén zlib bắt đầu bằng magic byte 0x78 (deflate) — bằng chứng là nén thật.
      const raw = fs.readFileSync(w.file);
      check("C1: file thực sự nén zlib (magic byte 0x78)", raw.length > 0 && raw[0] === 0x78);

      // Đọc lại NGAY (trước khi rotate) → nguyên vẹn.
      const back = snap.readLocalSnapshot("g1", 1000);
      check(
        "C1: đọc lại snapshot guild nguyên vẹn",
        back?.guild?.id === "g1" && back?.guild?.roles?.[0]?.id === "r1",
      );

      // Thêm 50 điểm → rotate còn đúng 48 (payload phải > 10 ký tự để được ghi).
      for (let i = 2; i <= 50; i++)
        snap.writeLocalSnapshot("g1", { i, pad: "p".repeat(20) }, i * 1000);
      const list = snap.listLocalSnapshots("g1");
      check(
        "C1: rotate giữ đúng 48 điểm",
        list.length === snap.SNAPSHOT_KEEP && list.length === 48,
      );
      check("C1: điểm mới nhất đứng đầu", list[0].ts === 50000);

      // Điểm ts=1000 đã bị rotate (chỉ giữ 48 mới nhất) → kiểm tra điểm 3000 cũ nhất còn sống.
      const oldest = snap.readLocalSnapshot("g1", 3000);
      check("C1: điểm cũ nhất còn sống sau rotate", oldest?.i === 3);
      const newest = snap.readLocalSnapshot("g1");
      check("C1: đọc mới nhất = điểm 50", newest?.i === 50);
      const at = snap.readLocalSnapshot("g1", 25000);
      check("C1: đọc đúng mốc ts cũ", at?.i === 25);

      check("C1: guild chưa có → null không ném", snap.readLocalSnapshot("g-404") === null);
      check(
        "C1: payload rác → null không ghi",
        snap.writeLocalSnapshot("g1", null, 99999) === null,
      );
      // guildId ký tự lạ (path traversal) được vệ sinh thành tên thư mục an toàn.
      const weird = snap.writeLocalSnapshot("../x/?.z", { pad: "q".repeat(20) }, 111);
      check("C1: guildId ký tự lạ được vệ sinh", !!weird && !weird.file.includes(".."));

      // Danh sách snapshot của guild nhiều file — hiển thị bytes hợp lệ.
      check(
        "C1: list có bytes > 0",
        snap.listLocalSnapshots("g1").every((s) => s.bytes > 0),
      );
    } finally {
      delete process.env.PROTOGON_SNAPSHOT_DIR;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  /* ── C1b — localSnapshot gọi được engine backup (chặn tái diễn bug export) ─
   * localSnapshot.snapshotGuildLocal gọi backup.snapshotWithSettings, nhưng hàm
   * này từng KHÔNG được export khỏi handlers/backup.js → mọi vòng chụp cục bộ
   * ném "backup.snapshotWithSettings is not a function" (357 lần trên VPS,
   * 19/09/2026) và tính năng cứu hộ C1 hỏng 100%. Test này khoá hợp đồng export
   * và chạy thật snapshotGuildLocal trên guild giả để bắt lỗi hồi quy. */
  {
    const backup = require("../bot/src/handlers/backup.js");
    check(
      "C1b: backup.snapshotWithSettings là function (đã export)",
      typeof backup.snapshotWithSettings === "function",
    );

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "snap-c1b-"));
    process.env.PROTOGON_SNAPSHOT_DIR = tmpDir;
    try {
      const textChannel = {
        id: "ch-1",
        name: "chung",
        type: 0,
        topic: null,
        nsfw: false,
        bitrate: null,
        userLimit: null,
        position: 0,
        parentId: null,
        permissionOverwrites: { cache: new Map() },
      };
      const guild = {
        id: "g-c1b",
        name: "Server C1b",
        available: true,
        members: { me: { permissions: { bitfield: 0n } } },
        roles: { cache: new Map() },
        emojis: { cache: new Map() },
        stickers: { cache: new Map() },
        channels: { cache: new Map([["ch-1", textChannel]]) },
      };
      const client = { guilds: { cache: new Map([["g-c1b", guild]]) } };
      const store = { getConfig: async () => null };

      const res = await snap.snapshotGuildLocal(client, store, "g-c1b", 4242);
      check(
        "C1b: snapshotGuildLocal chụp thành công qua engine backup",
        !!res && res.bytes > 0 && res.file.endsWith("4242.z"),
      );
      const back = snap.readLocalSnapshot("g-c1b", 4242);
      check(
        "C1b: snapshot cục bộ đọc lại đúng guildId",
        back?.guild?.guildId === "g-c1b" && back?.snapshotAt === 4242,
      );
    } finally {
      delete process.env.PROTOGON_SNAPSHOT_DIR;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  /* ── D1 — prewarmConfigs làm ấm cache + TTL 1800s ──────────────────────── */
  {
    // ConvexStore yêu cầu CONVEX_URL lúc khởi tạo — dùng URL giả của test.
    process.env.CONVEX_URL = process.env.CONVEX_URL || "https://test-boost.convex.cloud";
    const ConvexStore = require("../bot/src/convex.js");
    const real = new ConvexStore();
    real.client = {
      query: async (name, args) => {
        real.client.queries.push(args);
        return { guildId: args.guildId, ok: true };
      },
      queries: [],
    };
    const ok = await real.prewarmConfigs(["a", "b", "a"]);
    check("D1: prewarm dedupe + gọi đủ", ok === 2 && real.client.queries.length === 2);
    const before = real.client.queries.length;
    await real.getConfig("a");
    check(
      "D1: sau prewarm getConfig hit cache (0 query mới)",
      real.client.queries.length === before,
    );
    check(
      "D1: TTL 1800s trong source",
      fs
        .readFileSync(path.join(root, "bot", "src", "convex.js"), "utf8")
        .includes("CONFIG_TTL_MS = 1_800_000"),
    );
  }
  /* ── B1 — n-gram nhạy hơn + cửa sổ 7 ngày ─────────────────────────────── */
  {
    const src = fs.readFileSync(path.join(root, "bot", "src", "threatEngine.js"), "utf8");
    check("B1: chu kỳ n-gram 10 phút", src.includes("NGRAM_INTERVAL_MS = 10 * 60 * 1000"));
    check("B1: cụm tối thiểu 2 thành viên", src.includes("CLUSTER_MIN_MEMBERS = 2"));
    check("B1: cửa sổ học 7 ngày", src.includes("CLUSTER_WINDOW_MS = 7 * 24 * 3600 * 1000"));
    const flaggedSrc = fs.readFileSync(path.join(root, "bot", "src", "flaggedMessages.js"), "utf8");
    check(
      "B1: flaggedMessages TTL 7 ngày (đồng bộ)",
      flaggedSrc.includes("MAX_TTL_MS = 7 * 24 * 3600 * 1000"),
    );
  }

  /* ── B3 — ReDoS benchmark trong selfTestKeywords ──────────────────────── */
  {
    const src = fs.readFileSync(path.join(root, "bot", "src", "threatEngine.js"), "utf8");
    check("B3: có benchmark chuỗi độc", src.includes("redosSuspect") && src.includes("evilMs"));
    check("B3: ngưỡng cảnh báo 500ms", src.includes("evilMs > 500"));
    // Chuỗi độc không được làm crash path so khớp thật.
    const filters = require("../bot/src/handlers/filters.js");
    filters._setThreatIntelForTest(["aaaaaa", "a+]"], ["free gift redeem"]);
    let noCrash = true;
    try {
      filters.findLearnedThreat("a".repeat(300));
      filters.findLearnedThreat("(((a" + "+".repeat(60));
      filters.findLearnedThreat("w".repeat(150));
    } catch {
      noCrash = false;
    }
    check("B3: chuỗi độc không crash findLearnedThreat", noCrash);
  }

  /* ── C2 — file log theo ngày + rotate ─────────────────────────────────── */
  {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "log-boost-"));
    process.env.PROTOGON_LOG_DIR = tmpDir;
    try {
      snap.appendLog("dòng log thử nghiệm", new Date("2026-09-17T10:00:00Z"));
      snap.appendLog("dòng thứ hai", new Date("2026-09-17T10:01:00Z"));
      const file = snap.logFileFor(new Date("2026-09-17T10:00:00Z"));
      check("C2: tên file log đúng định dạng ngày", path.basename(file) === "bot-2026-09-17.log");
      const content = fs.readFileSync(file, "utf8");
      check(
        "C2: 2 dòng được ghi kèm timestamp",
        content.includes("dòng log thử nghiệm") &&
          content.includes("dòng thứ hai") &&
          content.startsWith("[2026-09-17T10:00:00"),
      );
      check(
        "C2: tailLog đọc được",
        snap.tailLog(5, new Date("2026-09-17T10:05:00Z")).includes("dòng thứ hai"),
      );

      // Rotate: tạo file giả 10 ngày trước → bị xoá; file hôm nay → giữ.
      const todayFile = snap.logFileFor(new Date());
      fs.mkdirSync(path.dirname(todayFile), { recursive: true });
      fs.writeFileSync(todayFile, "hôm nay\n");
      const old = new Date(Date.now() - 10 * 24 * 3600 * 1000);
      const oldFile = snap.logFileFor(old);
      fs.mkdirSync(path.dirname(oldFile), { recursive: true });
      fs.writeFileSync(oldFile, "cũ\n");
      const removed = snap.rotateLogs(new Date());
      check("C2: rotate xoá file quá 7 ngày", removed >= 1 && !fs.existsSync(oldFile));
      check("C2: file hôm nay còn sống", fs.existsSync(todayFile));
    } finally {
      delete process.env.PROTOGON_LOG_DIR;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  /* ── D2 — member prefetch gate theo MEMBER_PREFETCH_MAX ───────────────── */
  {
    const src = fs.readFileSync(path.join(root, "bot", "src", "index.js"), "utf8");
    check("D2: prefetch giới hạn MEMBER_PREFETCH_MAX", src.includes("MEMBER_PREFETCH_MAX"));
    check("D2: mặc định 5000 người", src.includes("process.env.MEMBER_PREFETCH_MAX || 5000"));
    check(
      "D2: guild lớn hơn skip",
      src.includes("guild.memberCount > MEMBER_PREFETCH_MAX) continue"),
    );
  }

  console.log(`\nKết quả: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
