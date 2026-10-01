// Test threatEngine.js + flaggedMessages.js + research mở rộng (URLhaus/digest/AI review).
// Chạy: node scripts/test-threat-engine.cjs — không mạng thật, không Convex thật.
const path = require("path");
const DJS_MOCK = require("./support/djs-mock-path.cjs");

// Mock discord.js (giống các test khác).
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
  addFields(f) { this.d.fields = [...(this.d.fields ?? []), ...f]; return this; }
  setTimestamp() { return this; }
  setFooter(f) { this.d.footer = f; return this; }
}
module.exports = { Colors: new Proxy({}, { get: () => 0x000000 }), EmbedBuilder, PermissionFlagsBits: { ManageGuild: 1n << 5n, Administrator: 1n << 3n } };
`,
);

const mutations = [];
let urlhausServed = false;

globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes("urlhaus.abuse.ch")) {
    urlhausServed = true;
    const csv = [
      "# firstseen,url,id",
      "2026-09-01 00:00:00 UTC,http://verifypage-completed.info/login.php,101",
      "2026-09-01 00:01:00 UTC,http://secure-login-appleid.appleid-account-verify.ru/auth,102",
      "2026-09-01 00:02:00 UTC,http://dropbox-shared-files.casa/get,103",
    ].join("\n");
    return { ok: true, status: 200, text: async () => csv };
  }
  if (u.includes("reddit.com") || u.includes("cisa.gov")) {
    return { ok: false, status: 404, text: async () => "" };
  }
  return { ok: false, status: 404, text: async () => "" };
};

const engine = require("../bot/src/threatEngine.js");
const flagged = require("../bot/src/flaggedMessages.js");

const store = {
  client: {
    mutation: async (name, args) => {
      mutations.push({ name, args });
      return { ok: true };
    },
    query: async (name) => {
      if (name === "antinuke:recentRaidSamples") {
        return [
          { module: "massBan", action: "đã ban", aiReason: "sockpuppet tokenfarm v0lt ring" },
          { module: "spam", action: "timeout", aiReason: "lootguard phishing payload" },
        ];
      }
      return null;
    },
  },
  getConfig: async () => null,
};

(async () => {
  let pass = 0;
  let fail = 0;
  const check = (label, ok) => {
    console.log(ok ? `PASS ${label}` : `FAIL ${label}`);
    ok ? pass++ : fail++;
  };

  // ---- 1. flaggedMessages: ghi + lọc theo cửa sổ + sweep ----
  const now = Date.now();
  check(
    "ghi mẫu hợp lệ",
    flagged.noteFlaggedMessage(
      "fr33 n1tr0 gift redeem now claim your reward here",
      "g1",
      "spam",
      now,
    ),
  );
  check("bỏ tin quá ngắn", !flagged.noteFlaggedMessage("ngắn", "g1", "spam", now));
  check("bỏ tin quá dài", !flagged.noteFlaggedMessage("x".repeat(400), "g1", "spam", now));
  flagged.noteFlaggedMessage(
    "fr33 n1tr0 gift redeem now claim your reward here 2",
    "g1",
    "spam",
    now - 1000,
  );
  flagged.noteFlaggedMessage(
    "completely different content about cooking pasta",
    "g1",
    "filter",
    now - 2000,
  );
  const recent = flagged.noteFlaggedMessages(now - 5000);
  check("lấy theo cửa sổ", recent.length === 3);
  check("mới nhất đầu", recent[0].ts >= recent[1].ts);
  check("sweep giữ lại hết (mới)", flagged.sweepFlagged(now) === 0);
  check("sweep dọn mẫu cũ (TTL 7 ngày)", flagged.sweepFlagged(now + 8 * 24 * 3600_000) >= 3);

  // Nạp lại mẫu cho test clustering
  flagged._resetFlaggedForTest();
  const spamA = "fr33 n1tr0 gift redeem now claim your reward here fast";
  const spamB = "fr33 n1tr0 gift redeem now claim your reward today fast";
  const spamC = "fr33 n1tr0 gift redeem now claim your reward right now fast";
  flagged.noteFlaggedMessage(spamA, "g1", "spam", now);
  flagged.noteFlaggedMessage(spamB, "g1", "spam", now);
  flagged.noteFlaggedMessage(spamC, "g1", "spam", now);
  flagged.noteFlaggedMessage(
    "completely different topic about cooking pasta today",
    "g1",
    "filter",
    now,
  );

  // ---- 2. N-gram clustering ----
  const clusters = engine.clusterFlagged(now);
  check("tìm được cụm spam biến thể (>=1)", clusters.length >= 1);
  check(
    "cụm có >= 2 thành viên (B1)",
    clusters.every((c) => c.members.length >= 2),
  );
  const kws = clusters.flatMap((c) => engine.keywordsFromCluster(c));
  check("sinh từ khóa wildcard", kws.length > 0 && kws.every((k) => k.length >= 5));

  // ---- 3. runNgramCycle ghi mutation research ----
  mutations.length = 0;
  const cycleRes = await engine.runNgramCycle(store);
  check("n-gram cycle chạy", typeof cycleRes.clusters === "number");
  check(
    "ghi botSetResearchRun khi có từ khóa mới",
    mutations.some(
      (m) =>
        m.name === "threatIntel:botSetResearchRun" && m.args.sources.includes("ngram-clusters"),
    ),
  );

  // ---- 4. URLhaus: fetch + parse + nạp filters + isUrlhausDomain ----
  mutations.length = 0;
  const okUrlhaus = await engine.refreshUrlhaus(store);
  check("URLhaus fetch thành công", okUrlhaus === true && urlhausServed);
  check("trích đúng hostname", engine.isUrlhausDomain("http://verifypage-completed.info/x"));
  check("host lành không khớp", !engine.isUrlhausDomain("https://discord.com/invite/x"));
  check(
    "ghi meta urlhausDomains",
    mutations.some((m) => m.name === "threatIntel:botSetResearchMeta" && m.args.urlhausDomains > 0),
  );
  const filters = require("../bot/src/handlers/filters.js");
  filters._setUrlhausDomainsForTest(engine.getUrlhausHosts());
  const hit = filters.findMaliciousLink("vào http://dropbox-shared-files.casa/get lấy file nhé");
  check("filters chặn domain URLhaus", hit && hit.kind === "urlhaus-domain");
  const hitSafe = filters.findMaliciousLink("xem docs tại https://discord.com/developers/docs");
  check("link discord thường không bị chặn", !hitSafe || hitSafe.kind !== "urlhaus-domain");

  // ---- 5. Backfill raidSamples ----
  mutations.length = 0;
  const bf = await engine.backfillFromSamples(store);
  check("backfill chạy", typeof bf.keywords === "number");
  check(
    "backfill ghi botSetResearchRun nguồn backfill-samples",
    mutations.some(
      (m) =>
        m.name === "threatIntel:botSetResearchRun" && m.args.sources.includes("backfill-samples"),
    ),
  );

  // ---- 6. Self-test keywords không vỡ ----
  const st = engine.selfTestKeywords();
  check(
    "self-test chạy không crash",
    typeof st.tested === "number" && typeof st.failed === "number",
  );

  // ---- 7. research.js: chu kỳ env override + nguồn urlhaus trong OPEN_SOURCES ----
  process.env.RESEARCH_INTERVAL_MS = "7200000";
  delete require.cache[require.resolve("../bot/src/research.js")];
  require("../bot/src/research.js");
  const srcResearch = fs.readFileSync(
    path.join(__dirname, "..", "bot", "src", "research.js"),
    "utf8",
  );
  check("research có nguồn urlhaus", srcResearch.includes('"urlhaus"'));
  check("research có digest", srcResearch.includes("buildWeeklyDigest"));
  check("research có AI review", srcResearch.includes("aiReviewKeywords"));

  console.log(`\nKết quả threat engine: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
