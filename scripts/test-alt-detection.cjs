// Test Alt Detection (bot/src/altDetection.js — 930 dòng, module chống tài khoản phụ):
//   - Pure functions: usernameSimilarity (chống false positive tên thật VN),
//     isGeneratedUsername, trackVoiceIp/getIpLinkedAccounts, trackJoinForBurst,
//     scanGuildForAlts
//   - analyzeNewMember: các lớp điểm rủi ro + strong signals + chống phạt oan
//     (safeMode, hạ cấp khi chỉ 1 bằng chứng, monitor_only khi 0 bằng chứng)
//   - executePunishment: ban/kick/timeout/verify (kèm fallback verify)
//   - joinGate: whitelist, alt whitelist, burst auto-lockdown, ghi join history
// Không mạng (checkVPN không gọi — không IP), không DB thật. Chạy:
//   node scripts/test-alt-detection.cjs
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
  constructor(data = {}) { this.d = data; }
  setColor(c) { this.d.color = c; return this; }
  setTitle(t) { this.d.title = t; return this; }
  setDescription(t) { this.d.description = t; return this; }
  addFields(...f) { this.d.fields = [...(this.d.fields ?? []), ...f.flat(Infinity)]; return this; }
  setTimestamp() { return this; }
  setFooter(f) { this.d.footer = f; return this; }
}
module.exports = {
  Colors: new Proxy({}, { get: () => 0x000000 }),
  EmbedBuilder,
  PermissionFlagsBits: { ManageGuild: 1n << 5n, Administrator: 1n << 3n, ManageChannels: 1n << 4n },
  UserFlags: { VerifiedBot: 1n << 16n },
  ChannelType: { GuildText: 0, GuildVoice: 2 },
};
`,
);

(async () => {
  const DAY = 86_400_000;
  const alt = require("../bot/src/altDetection");

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

  // ══════════ 1. usernameSimilarity — chống false positive ══════════
  check("tên giống hệt → 100", alt.usernameSimilarity("nguyenvana", "nguyenvana") === 100);
  check(
    "tên < 5 ký tự → 0 (tránh trùng tên phổ biến)",
    alt.usernameSimilarity("linh", "linh") === 0,
  );
  check(
    "Discord default 'user123456' → 0",
    alt.usernameSimilarity("User123456", "user654321") === 0,
  );
  check(
    "tên thật VN chênh 1-3 ký tự cuối (nguyenvana/nguyenvanb) → bị HẠ xuống ≤ 80 (không đủ bằng chứng mạnh)",
    alt.usernameSimilarity("nguyenvana", "nguyenvanb") <= 80,
  );
  check(
    "hậu tố SỐ (linh12345/linh12346) → điểm CAO (pattern alt thật)",
    alt.usernameSimilarity("linh12345", "linh12346") >= 85,
  );
  check("tên hoàn toàn khác → điểm thấp", alt.usernameSimilarity("minhtuan", "xukabulla") < 50);

  // ══════════ 2. isGeneratedUsername ══════════
  check(
    "random letters+digits (xkqe8291) → generated",
    alt.isGeneratedUsername("xkqe8291").generated === true,
  );
  check(
    "chỉ số (8491723) → generated (numeric_only)",
    alt.isGeneratedUsername("8491723").pattern === "numeric_only",
  );
  check(
    "tên người thật (minhtuan) → không generated",
    alt.isGeneratedUsername("minhtuan").generated === false,
  );

  // ══════════ 3. Voice IP linking ══════════
  alt.trackVoiceIp("g1", "u1", "1.2.3.4", "VN");
  alt.trackVoiceIp("g1", "u2", "1.2.3.4", "VN");
  alt.trackVoiceIp("g1", "u3", "5.6.7.8", "VN");
  check(
    "2 user cùng IP → link với nhau",
    alt.getIpLinkedAccounts("g1", "u1").some((l) => l.userId === "u2"),
  );
  check("user khác IP → không link", alt.getIpLinkedAccounts("g1", "u3").length === 0);
  alt.trackVoiceIp("g1", "u2", "9.9.9.9", "VN"); // đổi IP
  check(
    "user đổi IP → link cũ bị gỡ",
    !alt.getIpLinkedAccounts("g1", "u1").some((l) => l.userId === "u2"),
  );
  check("getUserVoiceIp trả IP hiện tại", alt.getUserVoiceIp("g1", "u2")?.ip === "9.9.9.9");
  check(
    "getGuildVoiceIps thống kê theo IP",
    alt.getGuildVoiceIps("g1").some((s) => s.ip === "1.2.3.4" && s.userCount === 1),
  );

  // ══════════ 4. Burst detection ══════════
  let burst = null;
  for (let i = 0; i < 5; i++) burst = alt.trackJoinForBurst("g-burst", "bu" + i, 60);
  check(
    "5 join rủi ro cao trong cửa sổ → BURST",
    burst.burstDetected === true && burst.count === 5,
  );
  check(
    "burst có cooldown — join tiếp không bắn lại",
    alt.trackJoinForBurst("g-burst", "bu5", 60).burstDetected === false,
  );
  const quiet = [];
  for (let i = 0; i < 6; i++) quiet.push(alt.trackJoinForBurst("g-calm", "ca" + i, 5));
  check(
    "join rủi ro thấp → không burst dù đủ số lượng",
    quiet.every((b) => !b.burstDetected),
  );

  // ══════════ 5. scanGuildForAlts ══════════
  function mkUser(id, username, { bot = false, avatar = null, createdDaysAgo = 400 } = {}) {
    return {
      id,
      bot,
      username,
      avatar,
      createdTimestamp: Date.now() - createdDaysAgo * DAY,
      flags: { bitfield: 0 },
    };
  }
  function mkMember(id, username, opts = {}) {
    return {
      id,
      user: mkUser(id, username, opts),
      nickname: opts.nickname ?? null,
      joinedTimestamp: Date.now() - 1000,
      roles: { cache: new Set(), add: async () => {}, some: () => false },
      kick: async () => calls.kicks.push(id),
      ban: async () => calls.bans.push(id),
      timeout: async () => calls.timeouts.push(id),
      send: async () => {},
      guild: null,
      permissions: { has: () => false },
    };
  }
  const calls = { kicks: [], bans: [], timeouts: [], mutations: [], queries: [] };
  function mkGuild(id, members) {
    const cache = new Map(members.map((m) => [m.id, m]));
    const guild = {
      id,
      name: "G-" + id,
      ownerId: "owner-1",
      members: { cache, fetch: async (mid) => cache.get(mid) ?? null, ban: async () => {} },
      roles: { cache: new Map(), everyone: { id } },
      channels: { cache: { filter: () => [], values: () => [].values() } },
      bans: { fetch: async () => new Map() },
      fetchAuditLogs: async () => ({ entries: { first: () => null } }),
    };
    for (const m of members) m.guild = guild;
    return guild;
  }

  const scanGuild = mkGuild("g-scan", [
    mkMember("a1", "raidboss99", { avatar: "av1" }),
    mkMember("a2", "raidboss98", { avatar: "av2" }),
    mkMember("a3", "totally-different", { avatar: "av3" }),
  ]);
  const scanResults = alt.scanGuildForAlts(scanGuild, { altSimilarityThreshold: 70 });
  check(
    "scan tìm ra cặp tên gần giống (raidboss99/98)",
    scanResults.some((r) => [r.userId1, r.userId2].sort().join() === ["a1", "a2"].sort().join()),
  );
  check(
    "scan không ghép người lạ",
    !scanResults.some((r) => r.userId1 === "a3" || r.userId2 === "a3"),
  );

  // ══════════ 6. analyzeNewMember — alt chắc chắn (2+ strong signals) ══════════
  // Điểm: age<1d (+30) + sim 100 (+25) − positive (avatar 5 + tên thường 5 = 10) = 45.
  // maxRisk 40 → đủ phạt; strong signals = [age<3d, name_sim_85+] = 2 → kick thẳng.
  const storeOk = {
    client: {
      query: async (name) => {
        calls.queries.push(name);
        return name === "altDetection:botGetJoinHistory" ? [] : [];
      },
      mutation: async (name, args) => {
        calls.mutations.push({ name, args });
        return {};
      },
    },
  };
  const raidGuild = mkGuild("g-alt", [
    mkMember("old-friend", "nguoiban", { avatar: "av-old" }),
    mkMember("alt-new", "nguoiban", { avatar: "av-old", createdDaysAgo: 0.5 }),
  ]);
  const altMember = raidGuild.members.cache.get("alt-new");
  const analysis = await alt.analyzeNewMember(
    altMember,
    { altMaxRiskScore: 40, altPunish: "kick" },
    async () => null,
    storeOk,
  );
  check("alt (acc <1 ngày + tên trùng hệt member khác) → risk ≥ 40", analysis.riskScore >= 40);
  check("alt chắc chắn → action = kick (đúng cấu hình)", analysis.action === "kick");
  check("có ≥ 2 strong signals", analysis.strongSignals.length >= 2);
  check("ghi nhận linkedUserId đúng acc bị liên kết", analysis.linkedUserId === "old-friend");

  // ══════════ 7. Người thật lâu năm, hồ sơ đầy đủ → pass ══════════
  const humanGuild = mkGuild("g-human", [
    mkMember("human-1", "thanhviencam", { avatar: "real-av", createdDaysAgo: 800 }),
  ]);
  const analysisHuman = await alt.analyzeNewMember(
    humanGuild.members.cache.get("human-1"),
    { altMaxRiskScore: 70 },
    async () => null,
    storeOk,
  );
  check(
    "người thật acc 2 năm + avatar → risk thấp, pass",
    analysisHuman.riskScore < 40 && analysisHuman.action === "pass",
  );

  // ══════════ 8. Chống phạt oan: điểm chạm ngưỡng nhưng 0 bằng chứng độc lập → chỉ theo dõi ══════════
  // Điểm: age 5 ngày < minAge 30 (+10, KHÔNG phải <3d nên không strong) + sim 83
  // (+10, < 85 nên KHÔNG strong) − positive 10 (avatar + tên thường) = 10.
  // maxRisk 10 → chạm ngưỡng nhưng 0 strong signal → monitor_only.
  const weakGuild = mkGuild("g-weak", [
    mkMember("wk-origin", "tranvanphuoc", { avatar: "wk-av" }),
    mkMember("weak-1", "tranvanphu", { avatar: "wk-av2", createdDaysAgo: 5 }),
  ]);
  const analysisWeak = await alt.analyzeNewMember(
    weakGuild.members.cache.get("weak-1"),
    { altMaxRiskScore: 10, altPunish: "kick", altMinAgeDays: 30 },
    async () => null,
    storeOk,
  );
  check("chỉ tín hiệu yếu cộng dồn → KHÔNG phạt (monitor_only)", analysisWeak.action === "pass");
  check(
    "ghi yếu tố monitor_only_insufficient_evidence",
    analysisWeak.riskFactors.some((f) => f.includes("monitor_only_insufficient_evidence")),
  );

  // ══════════ 9. Chỉ 1 bằng chứng độc lập → HẠ CẤP 1 bậc phạt ══════════
  // Điểm: sim 100 (+25) − positive 10 = 15 (acc 10 ngày > minAge 7 → không penalty tuổi).
  // maxRisk 15 → chạm ngưỡng; strong = [name_sim_85+] duy nhất → ban bị HẠ thành kick.
  const singleSigGuild = mkGuild("g-single", [
    mkMember("origin", "vanghinhano", { avatar: "av-o" }),
    mkMember("sus-1", "vanghinhano", { avatar: "av-s", createdDaysAgo: 10 }),
  ]);
  const analysisSingle = await alt.analyzeNewMember(
    singleSigGuild.members.cache.get("sus-1"),
    { altMaxRiskScore: 15, altPunish: "ban" },
    async () => null,
    storeOk,
  );
  check("1 bằng chứng → ban bị HẠ thành kick", analysisSingle.action === "kick");
  check(
    "1 bằng chứng → kick bị HẠ thành timeout",
    await (async () => {
      const g = mkGuild("g-single2", [
        mkMember("origin2", "vanghinhano", { avatar: "av-o2" }),
        mkMember("sus-2", "vanghinhano", { avatar: "av-s2", createdDaysAgo: 10 }),
      ]);
      const a = await alt.analyzeNewMember(
        g.members.cache.get("sus-2"),
        { altMaxRiskScore: 15, altPunish: "kick" },
        async () => null,
        storeOk,
      );
      return a.action === "timeout";
    })(),
  );

  // ══════════ 10. SafeMode tắt → phạt thẳng theo cấu hình ══════════
  // Điểm: age<1d (+30) + generated_username (+15) − 0 positive = 45 ≥ maxRisk 30 →
  // không qua safeMode ladder, phạt thẳng kick.
  const unsafeGuild = mkGuild("g-unsafe", [mkMember("w1", "xkqe8292", { createdDaysAgo: 0.5 })]);
  const unsafe = await alt.analyzeNewMember(
    unsafeGuild.members.cache.get("w1"),
    { altMaxRiskScore: 30, altPunish: "kick", altSafeMode: false },
    async () => null,
    storeOk,
  );
  check("safeMode=false → hành vi cũ: phạt thẳng", unsafe.action === "kick");

  // ══════════ 11. Khớp account TỪNG BỊ PHẠT (join history từ Convex) ══════════
  const storeHistory = {
    client: {
      query: async (name, _args) =>
        name === "altDetection:botGetJoinHistory"
          ? [
              {
                userId: "punished-1",
                username: "nguoibiduoi",
                avatar: "pav",
                action: "kick",
                createdAt: Date.now() - 5 * DAY,
                joinedAt: Date.now() - 5 * DAY,
              },
            ]
          : [],
      mutation: async () => ({}),
    },
  };
  const rejoinGuild = mkGuild("g-rejoin", [
    mkMember("rejoin-1", "nguoibiduoi", { avatar: "pav", createdDaysAgo: 2 }),
  ]);
  const analysisRejoin = await alt.analyzeNewMember(
    rejoinGuild.members.cache.get("rejoin-1"),
    { altMaxRiskScore: 40, altPunish: "kick" },
    async () => null,
    storeHistory,
  );
  check(
    "bị phạt rồi quay lại cùng tên+avatar → matches_previously_punished_account",
    analysisRejoin.riskFactors.some((f) => f.includes("matches_previously_punished_account")),
  );
  check("rejoin evasion → bị phạt", analysisRejoin.action === "kick");

  // ══════════ 12. executePunishment ══════════
  const punGuild = mkGuild("g-pun", []);
  const punMember = mkMember("p1", "test");
  punMember.guild = punGuild;
  const rPass = await alt.executePunishment(
    punMember,
    { action: "pass", riskScore: 0, riskFactors: [] },
    {},
  );
  check("action pass → không phạt", rPass.executed === false);
  await alt.executePunishment(punMember, { action: "kick", riskScore: 80, riskFactors: ["x"] }, {});
  check("action kick → member.kick được gọi", calls.kicks.includes("p1"));
  await alt.executePunishment(punMember, { action: "ban", riskScore: 90, riskFactors: ["x"] }, {});
  check("action ban → member.ban được gọi", calls.bans.includes("p1"));
  await alt.executePunishment(
    punMember,
    { action: "timeout", riskScore: 75, riskFactors: ["x"] },
    { altTimeoutMinutes: 30 },
  );
  check("action timeout → member.timeout được gọi", calls.timeouts.includes("p1"));

  // verify khi chưa setup đầy đủ → fallback kick
  const punMember2 = mkMember("p2", "test2");
  punMember2.guild = punGuild;
  const rVerifyFallback = await alt.executePunishment(
    punMember2,
    { action: "verify", riskScore: 70, riskFactors: [] },
    {},
  );
  check(
    "verify nhưng chưa setup → fallback kick",
    rVerifyFallback.action === "kick" && calls.kicks.includes("p2"),
  );
  // verify khi setup đầy đủ → thêm role unverified
  let roleAdded = false;
  const punMember3 = mkMember("p3", "test3");
  punMember3.guild = punGuild;
  punMember3.roles.add = async () => {
    roleAdded = true;
  };
  await alt.executePunishment(
    punMember3,
    { action: "verify", riskScore: 70, riskFactors: [] },
    {
      verifyEnabled: true,
      unverifiedRoleId: "r-unv",
      verifiedRoleId: "r-ver",
      verifyChannelId: "c-verify",
    },
  );
  check("verify setup đầy đủ → gán role unverified (KHÔNG roles.set)", roleAdded === true);

  // ══════════ 13. buildRiskEmbed ══════════
  const embed = alt.buildRiskEmbed(
    punMember,
    { riskScore: 85, riskFactors: ["❌ test"], action: "kick" },
    { executed: true, action: "kick" },
  );
  check(
    "embed rủi ro cao tạo được (title + fields)",
    embed?.d?.title?.includes("Alt Detection") === true,
  );

  console.log("\n=== 5. Quét alt định kỳ KHÔNG CHẶN BOT ===");
  // Bug thật 29/09/2026: scanGuildForAlts (đồng bộ, O(n²)) chạy tuần tự cho MỌI
  // guild mỗi 6 giờ. Đo thật: 1000 tv ~1,0s · 2000 ~4,5s · 3000 ~12,9s ·
  // 5000 ~36s — đó là thời gian bot ĐỨNG HÌNH: không nhận tin, không chạy
  // anti-nuke. Bản async nhường event loop + chặn trần quy mô/deadline.
  {
    const WORDS = [
      "nguyen",
      "tran",
      "le",
      "pham",
      "hoang",
      "vu",
      "dang",
      "bui",
      "do",
      "ho",
      "phuong",
      "thao",
      "linh",
      "mai",
      "nam",
      "son",
      "hue",
      "lan",
      "my",
      "ngan",
    ];
    const mkGuild = (n) => {
      const m = new Map();
      for (let i = 0; i < n; i++) {
        const w = WORDS[i % WORDS.length];
        const name = w + (100 + (i % 97)) + (i % 3 === 0 ? "x" : "y") + (i % 7);
        m.set("u" + i, {
          id: "u" + i,
          nickname: null,
          user: { id: "u" + i, bot: false, username: name },
        });
      }
      return { id: "g-perf", members: { cache: m } };
    };
    const guild = mkGuild(1200);

    // 1) Bản sync: event loop KHÔNG chạy được trong lúc quét (chứng cứ bug).
    let syncTicks = 0;
    const syncTimer = setInterval(() => syncTicks++, 1);
    const syncRes = alt.scanGuildForAlts(guild, {});
    clearInterval(syncTimer);
    check(`bản sync chặy trọn event loop (ticks=${syncTicks}) — đây chính là lỗi`, syncTicks === 0);

    // 2) Bản async: event loop VẪN chạy trong lúc quét.
    let ticks = 0;
    const timer = setInterval(() => ticks++, 1);
    const pending = alt.scanGuildForAltsAsync(guild, {});
    await new Promise((r) => setTimeout(r, 20));
    const ticksWhileRunning = ticks;
    const res = await pending;
    clearInterval(timer);
    check(
      `bản async nhường event loop (ticks=${ticksWhileRunning} trong lúc quét)`,
      ticksWhileRunning > 0,
    );
    check(
      `bản async cho KẾT QUẢ GIỐNG HỆT bản sync (${res.links.length} vs ${syncRes.length})`,
      res.links.length === syncRes.length,
    );
    check(
      `1200 thành viên: quét trọn, không cắt (truncated=${res.truncated})`,
      !res.truncated && res.total === 1200,
    );

    // 3) Trần quy mô: server lớn phải báo cắt, KHÔNG im lặng bỏ sót.
    const big = mkGuild(300);
    const capped = await alt.scanGuildForAltsAsync(big, {}, { maxMembers: 50 });
    check(
      `vượt trần → báo cắt rõ ràng (${capped.scanned}/${capped.total}, truncated=${capped.truncated})`,
      capped.truncated && capped.total === 300 && capped.scanned <= 50,
    );

    // 4) Deadline: máy yếu thì trần này mới là chốt chặn, cũng phải báo.
    const deadline = await alt.scanGuildForAltsAsync(mkGuild(400), {}, { deadlineMs: 0 });
    check(
      `chạm deadline → báo cắt (hitDeadline=${deadline.hitDeadline})`,
      deadline.hitDeadline === true && deadline.truncated === true,
    );
    // 4b) `scanned` phải là SỐ THẬT đã quét, không phải tổng của tập đang xét.
    // Bug 30/09: dòng return viết
    //   scanned: hitDeadline ? members.length : members.length
    // — hai nhánh giống hệt → khi chạm deadline bot log "quét 400/400" dù
    // chỉ mới đi tới vài chục thành viên, chủ server tưởng đã quét trọn.
    check(
      `scanned phản ánh thật khi chạm deadline (${deadline.scanned}/${deadline.total})`,
      deadline.hitDeadline === true && deadline.scanned < deadline.total,
    );
    // Không chạm deadline thì scanned == tổng của tập đang xét (không cắt quy mô).
    const fullScan = await alt.scanGuildForAltsAsync(mkGuild(40), {}, { deadlineMs: 60_000 });
    check(
      `quét trọn thì scanned == tổng (${fullScan.scanned}/${fullScan.total})`,
      fullScan.scanned === 40 && fullScan.total === 40 && fullScan.hitDeadline === false,
    );
    // Chạm trần quy mô (không phải deadline): scanned = số trong trần, total = thật.
    const cappedScan = await alt.scanGuildForAltsAsync(mkGuild(300), {}, { maxMembers: 50 });
    check(
      `chạm trần quy mô: scanned = số trong trần (${cappedScan.scanned}/${cappedScan.total})`,
      cappedScan.scanned === 50 && cappedScan.total === 300 && cappedScan.hitDeadline === false,
    );
  }

  {
    // index.js là nơi quét chạy thật (mỗi 6 giờ, mọi guild) — dùng nhầm bản
    // sync là bot lại đứng hình. Khoá bằng check tĩnh cho chắc.
    const idxSrc = require("fs").readFileSync(
      require("path").join(__dirname, "..", "bot", "src", "index.js"),
      "utf8",
    );
    check(
      "index.js gọi bản quét async (không chặn event loop)",
      /scanGuildForAltsAsync\(guild, config\)/.test(idxSrc) &&
        !/await scanGuildForAlts\(|= scanGuildForAlts\(/.test(idxSrc),
    );
  }

  console.log(`\nKết quả alt detection: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})();
