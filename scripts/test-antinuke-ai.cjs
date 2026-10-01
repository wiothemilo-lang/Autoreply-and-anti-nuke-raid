// Test tầng AI + Raid Intel của anti-nuke:
//   antinuke/ai.js     — gọi AI best-effort (offline/timeout/lỗi đều trả null),
//                        raidNote, clusterStats (thống kê cụm acc).
//   antinuke/raidIntel — chấm điểm nguồn cơn raid deterministic, AI boost/veto,
//                        chỉ ban nghi phạm >= 4 điểm, tôn trọng exempt + cờ tắt,
//                        recordRaidSample (fire-and-forget).
// Mock discord.js + bot/src/ai.js (không gọi mạng thật). Chạy: node scripts/test-antinuke-ai.cjs
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
  `module.exports = {
  AuditLogEvent: new Proxy({}, { get: (t, k) => (t[k] ??= Symbol(k)) }),
  PermissionFlagsBits: { ManageGuild: 1n << 5n, Administrator: 1n << 3n },
  UserFlags: { VerifiedBot: 1n << 16n },
};
`,
);

// ── Mock bot/src/ai.js: điều khiển aiAvailable + kết quả từng hàm ──
const mockAi = {
  available: false,
  classifyResult: null,
  classifyThrows: false,
  raidResult: null,
  raidThrows: false,
  externalResult: null,
  externalThrows: false,
  lastClassifyArgs: null,
  aiAvailable() {
    return mockAi.available;
  },
  async classifyViolation(args) {
    mockAi.lastClassifyArgs = args;
    if (mockAi.classifyThrows) throw new Error("provider sập");
    return mockAi.classifyResult;
  },
  async analyzeRaid() {
    if (mockAi.raidThrows) throw new Error("provider sập");
    return mockAi.raidResult;
  },
  async analyzeExternalApp() {
    if (mockAi.externalThrows) throw new Error("provider sập");
    return mockAi.externalResult;
  },
};
const origLoad = Module._load;
Module._load = function (request, parent) {
  if (
    parent &&
    /handlers[\\/]antinuke[\\/]ai\.js$/.test(parent.filename) &&
    /\.\.\/\.\.\/ai$/.test(request)
  ) {
    return mockAi;
  }
  return origLoad.apply(this, arguments);
};

(async () => {
  const createAi = require("../bot/src/handlers/antinuke/ai");
  const createRaidIntel = require("../bot/src/handlers/antinuke/raidIntel");

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

  const DAY = 86_400_000;

  // ───────────────────────── antinuke/ai.js ─────────────────────────

  // ── 1. clusterStats ──
  {
    const state = { state: { joiners: new Map() } };
    const { clusterStats } = createAi({ state });
    check("clusterStats rỗng → {}", JSON.stringify(clusterStats([])) === "{}");
    check("clusterStats null → {}", JSON.stringify(clusterStats(null)) === "{}");

    const now = Date.now();
    const cluster = [
      { createdAt: now - 2 * DAY, avatar: "same", joinedAt: now - 5_000 },
      { createdAt: now - 4 * DAY, avatar: "same", joinedAt: now - 4_000 },
      { createdAt: now - 6 * DAY, avatar: "other", joinedAt: now - 1_000 },
    ];
    const st = clusterStats(cluster);
    check("clusterStats đếm số acc", st.clusterMemberCount === 3);
    check("clusterStats tuổi acc trung bình", st.clusterAvgAccountAgeDays === 4);
    check("clusterStats đếm avatar trùng", st.clusterSharedAvatarCount === 1);
    check("clusterStats nhịp join (burst giây)", st.clusterJoinBurstSeconds === 4);
  }

  // ── 2. aiClassify: offline / lỗi / thành công ──
  {
    const state = { state: { joiners: new Map([["g1", [1, 2]]]) } };
    const { aiClassify } = createAi({ state });

    mockAi.available = false;
    check(
      "aiClassify AI tắt → null",
      (await aiClassify({ id: "g1" }, "massJoin", 5, 10, 5)) === null,
    );

    mockAi.available = true;
    mockAi.classifyResult = { offline: true };
    check(
      "aiClassify AI trả offline → null",
      (await aiClassify({ id: "g1" }, "m", 1, 1, 1)) === null,
    );

    mockAi.classifyResult = { classification: "raid", confidence: 0.9 };
    const res = await aiClassify({ id: "g1", memberCount: 42 }, "massJoin", 5, 10, 5, ["spam"]);
    check("aiClassify thành công → trả kết quả", res?.classification === "raid");
    check("aiClassify truyền recentJoins từ state", mockAi.lastClassifyArgs.recentJoins === 2);
    check("aiClassify truyền memberCount", mockAi.lastClassifyArgs.memberCount === 42);

    mockAi.classifyThrows = true;
    check(
      "aiClassify lỗi provider → null (không crash)",
      (await aiClassify({ id: "g1" }, "m", 1, 1, 1)) === null,
    );
    mockAi.classifyThrows = false;

    // knownThreats (mẫu scam bot tự học) được chuyển tiếp cho AI đối chiếu.
    mockAi.available = true;
    mockAi.classifyResult = { classification: "raid", confidence: 0.9 };
    mockAi.lastClassifyArgs = null;
    await aiClassify({ id: "g1" }, "spam", 6, 10, 5, ["free nitro"], {
      knownThreats: { keywords: ["free nitro"], phrases: [] },
    });
    check(
      "aiClassify chuyển tiếp knownThreats cho AI",
      mockAi.lastClassifyArgs?.knownThreats?.keywords?.includes("free nitro") === true,
    );
  }

  // ── 3. aiAnalyzeRaid / aiAnalyzeExternalApp ──
  {
    const { aiAnalyzeRaid, aiAnalyzeExternalApp } = createAi({ state: { state: {} } });
    mockAi.available = false;
    check("aiAnalyzeRaid AI tắt → null", (await aiAnalyzeRaid({ id: "g" }, "m", 1, 1, 1)) === null);
    check(
      "aiAnalyzeExternalApp AI tắt → null",
      (await aiAnalyzeExternalApp({ id: "g" }, 1, 1, 1)) === null,
    );

    mockAi.available = true;
    mockAi.raidResult = { coordinated: true };
    check(
      "aiAnalyzeRaid thành công → trả kết quả",
      (await aiAnalyzeRaid({ id: "g" }, "m", 1, 1, 1)).coordinated === true,
    );
    mockAi.externalResult = { raid: true };
    check(
      "aiAnalyzeExternalApp thành công → trả kết quả",
      (await aiAnalyzeExternalApp({ id: "g" }, 1, 1, 1)).raid === true,
    );

    mockAi.raidThrows = true;
    mockAi.externalThrows = true;
    check("aiAnalyzeRaid lỗi → null", (await aiAnalyzeRaid({ id: "g" }, "m", 1, 1, 1)) === null);
    check(
      "aiAnalyzeExternalApp lỗi → null",
      (await aiAnalyzeExternalApp({ id: "g" }, 1, 1, 1)) === null,
    );
    mockAi.raidThrows = false;
    mockAi.externalThrows = false;
  }

  // ── 4. raidNote ──
  {
    const { raidNote } = createAi({ state: { state: {} } });
    check("raidNote không phải raid → rỗng", raidNote(null, false) === "");
    check(
      "raidNote AI xác nhận → nhắc AI",
      raidNote({ reason: "phối hợp" }, true).includes("AI xác nhận RAID"),
    );
    check(
      "raidNote AI offline → ghi nghi vấn deterministic",
      raidNote({ offline: true }, true).includes("nghi vấn cao"),
    );
    check("raidNote không có AI → deterministic", raidNote(null, true).includes("nghi vấn cao"));
  }

  // ───────────────────────── raidIntel.js ─────────────────────────

  const mutations = [];
  const bans = [];
  const store = {
    client: {
      mutation: async (name, args) => {
        mutations.push({ name, args });
        return { ok: true };
      },
    },
  };
  const client = { user: { id: "bot-self" } };

  function makeGuild(overrides = {}) {
    return {
      id: "g-raid",
      name: "G-Raid",
      fetchAuditLogs: async () => ({ entries: { values: () => [][Symbol.iterator]() } }),
      members: {
        fetch: async () => null,
        ban: async (id) => bans.push(id),
      },
      ...overrides,
    };
  }

  // Cluster: 2 acc avatar trùng + acc mới <7 ngày → điểm 3 + 2 = 5 >= 4.
  function raidCluster(ids = ["s1", "s2"]) {
    const now = Date.now();
    return ids.map((id, i) => ({
      id,
      username: "acc" + id,
      avatar: "same-avatar",
      createdAt: now - 2 * DAY,
      joinedAt: now - (10 - i) * 1000,
    }));
  }

  // ── 5. huntRaidSource: các nhánh thoát sớm ──
  {
    const { huntRaidSource } = createRaidIntel({ client, store, ai: {} });
    check("không có guild → không ban", (await huntRaidSource(null)).banned === false);
    check(
      "raidHuntEnabled false → không ban",
      (await huntRaidSource(makeGuild(), { raidHuntEnabled: false })).banned === false,
    );
    const empty = await huntRaidSource(makeGuild(), {}, [], []);
    check(
      "không có dữ liệu → chưa đủ tín hiệu",
      empty.reason === "chưa đủ tín hiệu" && !empty.banned,
    );
  }

  // ── 6. huntRaidSource: cụm đáng ngờ → ban nghi phạm ──
  {
    bans.length = 0;
    const guild = makeGuild();
    const { huntRaidSource } = createRaidIntel({ client, store, ai: {} });
    const res = await huntRaidSource(guild, {}, raidCluster(), []);
    check("cụm đáng ngờ → có nghi phạm", !!res.suspectedSourceId);
    check("cụm đáng ngờ → ban nghi phạm", res.banned === true && bans.length >= 1);
    check("reason ghi điểm + dấu vết", res.reason.includes("avatar trùng nhau"));
    check("confidence trong khoảng hợp lệ", res.confidence > 0 && res.confidence <= 0.97);
  }

  // ── 7. raidHuntBanSuspects=false → ghi nhận nhưng KHÔNG ban ──
  {
    bans.length = 0;
    const { huntRaidSource } = createRaidIntel({ client, store, ai: {} });
    const res = await huntRaidSource(
      makeGuild(),
      { raidHuntBanSuspects: false },
      raidCluster(),
      [],
    );
    check(
      "tắt raidHuntBanSuspects → không ban ai",
      res.banned === false && bans.length === 0 && !!res.suspectedSourceId,
    );
  }

  // ── 8. Exempt (whitelist) → không ban ──
  {
    bans.length = 0;
    const cluster = raidCluster();
    const guild = makeGuild({
      members: {
        fetch: async (id) => ({
          id,
          user: { bot: false },
          permissions: { has: () => false },
          roles: { cache: new Set() },
        }),
        ban: async (id) => bans.push(id),
      },
    });
    const { huntRaidSource } = createRaidIntel({ client, store, ai: {} });
    const res = await huntRaidSource(
      guild,
      { whitelistUsers: cluster.map((c) => c.id) },
      cluster,
      [],
    );
    check("nghi phạm nằm whitelist → không ban", res.banned === false && bans.length === 0);
  }

  // ── 9. AI VETO: AI kết luận KHÔNG phối hợp → chỉ ghi nhận, không ban ──
  {
    bans.length = 0;
    const ai = {
      aiAnalyzeRaid: async () => ({
        coordinated: false,
        confidence: 0.8,
        reasoning: "giống người thật",
      }),
    };
    const { huntRaidSource } = createRaidIntel({ client, store, ai });
    const res = await huntRaidSource(makeGuild(), {}, raidCluster(), []);
    check("AI veto → không ban", res.banned === false && bans.length === 0);
    check("AI veto → reason ghi rõ", res.reason.includes("KHÔNG phối hợp"));
  }

  // ── 10. AI veto nhưng confidence thấp → vẫn ban ──
  {
    bans.length = 0;
    const ai = { aiAnalyzeRaid: async () => ({ coordinated: false, confidence: 0.2 }) };
    const { huntRaidSource } = createRaidIntel({ client, store, ai });
    const res = await huntRaidSource(makeGuild(), {}, raidCluster(), []);
    check("AI veto confidence thấp → vẫn ban theo điểm", res.banned === true && bans.length >= 1);
  }

  // ── 11. AI xác nhận phối hợp → boost điểm (reason có AI) ──
  {
    bans.length = 0;
    const ai = { aiAnalyzeRaid: async () => ({ coordinated: true, reasoning: "cùng script" }) };
    const { huntRaidSource } = createRaidIntel({ client, store, ai });
    const res = await huntRaidSource(makeGuild(), {}, raidCluster(), []);
    check("AI xác nhận → reason nhắc AI", res.reason.includes("AI: cùng script"));
  }

  // ── 12. audit executor (kẻ phá hoại) được +5 điểm → vào diện ban ──
  {
    bans.length = 0;
    const now = Date.now();
    // AuditLogEvent mock là Symbol nên action phải khớp chính các symbol đó.
    const { AuditLogEvent } = require(DJS_MOCK);
    const auditEntries = [
      {
        executor: { id: "raider-1", username: "ke-pha-hoai" },
        action: AuditLogEvent.ChannelDelete,
        createdTimestamp: now - 60_000,
      },
      {
        executor: { id: "bot-self", username: "bot" },
        action: AuditLogEvent.ChannelDelete,
        createdTimestamp: now,
      },
      {
        executor: { id: "old", username: "cu" },
        action: AuditLogEvent.ChannelDelete,
        createdTimestamp: now - 40 * 60_000,
      },
    ];
    const guild = makeGuild({
      fetchAuditLogs: async () => ({ entries: { values: () => auditEntries[Symbol.iterator]() } }),
    });
    // Cụm gồm 1 acc hồ sơ SẠCH (0 điểm) → chỉ audit executor mới đủ ngưỡng ban.
    const cleanCluster = [
      {
        id: "clean-1",
        username: "nguoidung",
        avatar: "unique-avatar",
        createdAt: now - 30 * DAY,
        joinedAt: now,
      },
    ];
    const { huntRaidSource } = createRaidIntel({ client, store, ai: {} });
    const res = await huntRaidSource(guild, {}, cleanCluster, []);
    check(
      "audit executor phá hoại gần đây → thành nghi phạm",
      res.suspectedSourceId === "raider-1" && res.banned === true,
    );
    check("executor cũ (>30 phút) bị loại", !res.reason.includes("cu"));
  }

  // ── 12b. audit executor LÀNH TÍNH (tạo invite/kênh) chỉ +2 → không đủ ngưỡng ban ──
  {
    bans.length = 0;
    const now = Date.now();
    const { AuditLogEvent } = require(DJS_MOCK);
    const auditEntries = [
      {
        executor: { id: "mod-lanh", username: "mod-tao-invite" },
        action: AuditLogEvent.InviteCreate,
        createdTimestamp: now - 60_000,
      },
    ];
    const guild = makeGuild({
      fetchAuditLogs: async () => ({ entries: { values: () => auditEntries[Symbol.iterator]() } }),
    });
    // Cụm gồm 1 acc hồ sơ SẠCH (0 điểm) + mod tạo invite (+2) = 2 < 4 → không ban oan.
    const cleanCluster = [
      {
        id: "clean-2",
        username: "nguoidung",
        avatar: "unique-avatar",
        createdAt: now - 30 * DAY,
        joinedAt: now,
      },
    ];
    const { huntRaidSource } = createRaidIntel({ client, store, ai: {} });
    const res = await huntRaidSource(guild, {}, cleanCluster, []);
    check(
      "mod tạo invite gần đây (+2) KHÔNG bị ban oan làm nguồn raid",
      res.banned === false && bans.length === 0,
    );
  }

  // ── 13. recordRaidSample: ghi mutation, nuốt lỗi ──
  {
    mutations.length = 0;
    const { recordRaidSample } = createRaidIntel({ client, store, ai: {} });
    await recordRaidSample({ id: "g1", name: "G1" }, {}, { module: "massJoin", confidence: 0.9 });
    check(
      "recordRaidSample ghi botRecordRaidSample kèm guildId/name",
      mutations.length === 1 &&
        mutations[0].name === "bot_writes:botRecordRaidSample" &&
        mutations[0].args.guildId === "g1" &&
        mutations[0].args.guildName === "G1",
    );

    const brokenStore = {
      client: {
        mutation: async () => {
          throw new Error("mạng lỗi");
        },
      },
    };
    const { recordRaidSample: record2 } = createRaidIntel({ client, store: brokenStore, ai: {} });
    await record2({ id: "g1", name: "G1" }, {}, {});
    check("recordRaidSample lỗi mạng → nuốt, không crash", true);
  }

  fs.unlinkSync(DJS_MOCK);
  console.log(`\nKết quả antinuke ai/raidIntel: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
