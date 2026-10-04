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

  // ---- 0. isUrlhausDomain khi CHƯA nạp feed nào → luôn false ----
  check("isUrlhausDomain khi chưa có feed → false", engine.isUrlhausDomain("x.com") === false);

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

  // ════════════════════════════════════════════════════════════════════════
  // Phần dưới phủ các nhánh TRƯỚC ĐÂY KHÔNG test nào chạm: setupThreatEngine
  // (hàm duy nhất 0% functions), các nhánh lỗi feed (ok=false/rỗng/mạng chết),
  // biên hostsFromFeed (maxDomains/maxLines), ReDoS self-test và catch nuốt lỗi
  // của runNgramCycle/backfillFromSamples.
  // ════════════════════════════════════════════════════════════════════════
  {
    // ---- 8. setupThreatEngine: hẹn giờ + mọi callback chạy không crash ----
    const savedST = global.setTimeout;
    const savedSI = global.setInterval;
    const timeouts = [];
    const intervals = [];
    global.setTimeout = (fn, ms) => {
      timeouts.push({ fn, ms });
      return { unref() {} };
    };
    global.setInterval = (fn, ms) => {
      intervals.push({ fn, ms });
      return { unref() {} };
    };
    let setupStats;
    try {
      setupStats = engine.setupThreatEngine(store);
    } finally {
      global.setTimeout = savedST;
      global.setInterval = savedSI;
    }
    check(
      "setupThreatEngine trả engineStats",
      setupStats && typeof setupStats.urlhausDomains === "number",
    );
    check(
      "đặt 4 timeout (urlhaus/openphish/ngram/backfill)",
      timeouts.length === 4,
      String(timeouts.length),
    );
    check("đặt 4 interval còn lại", intervals.length === 4, String(intervals.length));
    mutations.length = 0;
    for (const t of timeouts) await t.fn();
    for (const i of intervals) {
      const r = i.fn();
      if (r && typeof r.then === "function") await r;
    }
    check("callback timeout + interval chạy không crash", true);

    // ---- 9. hostsFromFeed: biên maxDomains/maxLines + dòng hỏng ----
    const feed = [
      "http://a-ok.example/x",
      "không phải url",
      "http://b-ok.example/y",
      "http://c-ok.example/z",
    ].join("\n");
    const all = engine.hostsFromFeed(feed);
    check(
      "hostsFromFeed bỏ dòng không phải URL",
      all.has("a-ok.example") && all.has("c-ok.example") && ![...all].some((h) => h.includes(" ")),
    );
    check(
      "hostsFromFeed tôn trọng maxDomains",
      engine.hostsFromFeed(feed, { maxDomains: 1 }).size === 1,
    );
    const tail = engine.hostsFromFeed(feed, { maxLines: 1 });
    check("hostsFromFeed chỉ đọc maxLines dòng cuối", tail.size === 1 && tail.has("c-ok.example"));
    check("hostsFromFeed văn bản rỗng → set rỗng", engine.hostsFromFeed("").size === 0);

    // ---- 10. isUrlhausDomain: host không scheme + chuỗi không phải URL ----
    check(
      "isUrlhausDomain: URL không scheme vẫn khớp",
      engine.isUrlhausDomain("verifypage-completed.info/x") === true,
    );
    check(
      "isUrlhausDomain: host lạ → false",
      engine.isUrlhausDomain("unknown-host.example") === false,
    );
    check("isUrlhausDomain: chuỗi rác → false", engine.isUrlhausDomain(":::") === false);

    // ---- 11. refreshOpenPhish: tải + hợp nhất host; feed lỗi/mạng chết ----
    {
      const keepFetch = globalThis.fetch;
      globalThis.fetch = async (url) => {
        if (String(url).includes("openphish.com")) {
          return {
            ok: true,
            status: 200,
            text: async () => "http://phish-a.example/login\nhttp://phish-b.example/verify\n",
          };
        }
        return { ok: false, status: 500, text: async () => "" };
      };
      const ok = await engine.refreshOpenPhish(store);
      check(
        "refreshOpenPhish tải + hợp nhất host vào set",
        ok === true && engine.isUrlhausDomain("phish-a.example"),
      );
      globalThis.fetch = async () => ({ ok: false, status: 503, text: async () => "" });
      check(
        "refreshOpenPhish feed lỗi (ok=false) → false",
        (await engine.refreshOpenPhish(store)) === false,
      );
      globalThis.fetch = async () => {
        throw new Error("mạng chết");
      };
      check("refreshOpenPhish fetch ném → false", (await engine.refreshOpenPhish(store)) === false);
      globalThis.fetch = keepFetch;
    }

    // ---- 12. refreshUrlhaus: feed lỗi / rỗng / mạng chết ----
    {
      const keepFetch = globalThis.fetch;
      globalThis.fetch = async () => ({ ok: false, status: 503, text: async () => "" });
      check(
        "refreshUrlhaus feed lỗi (ok=false) → false",
        (await engine.refreshUrlhaus(store)) === false,
      );
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        text: async () => "# chỉ header\n",
      });
      check(
        "refreshUrlhaus không có dòng dữ liệu → false",
        (await engine.refreshUrlhaus(store)) === false,
      );
      globalThis.fetch = async () => {
        throw new Error("mạng chết");
      };
      check("refreshUrlhaus fetch ném → false", (await engine.refreshUrlhaus(store)) === false);
      globalThis.fetch = keepFetch;
    }

    // ---- 13. runNgramCycle: mutation ném → nuốt, trả 0 (không làm chết vòng) ----
    {
      flagged._resetFlaggedForTest();
      flagged.noteFlaggedMessage(
        "fr33 n1tr0 gift redeem now claim your reward here fast",
        "g1",
        "spam",
        now,
      );
      flagged.noteFlaggedMessage(
        "fr33 n1tr0 gift redeem now claim your reward today fast",
        "g1",
        "spam",
        now,
      );
      const badStore = {
        client: {
          mutation: () => {
            throw new Error("Convex sập");
          },
        },
      };
      const r = await engine.runNgramCycle(badStore);
      check(
        "runNgramCycle: mutation ném → không crash, trả 0",
        r.clusters === 0 && r.keywords === 0,
      );
    }

    // ---- 14. backfillFromSamples: query ném → nuốt, trả 0 ----
    {
      const badStore = {
        client: {
          query: () => {
            throw new Error("Convex chết");
          },
        },
      };
      const r = await engine.backfillFromSamples(badStore);
      check("backfillFromSamples: query ném → không crash, trả 0", r.keywords === 0);
    }

    // ---- 15. selfTestKeywords: path so khớp chậm → cảnh báo ReDoS ----
    {
      const filtersPath = require.resolve("../bot/src/handlers/filters.js");
      const realFilters = require.cache[filtersPath];
      require.cache[filtersPath] = {
        id: filtersPath,
        filename: filtersPath,
        loaded: true,
        exports: {
          findLearnedThreat: (text) => {
            const s = String(text);
            // Chỉ chuỗi "độc" mới gây chậm; mẫu flagged thường trả nhanh.
            if (s.includes("+".repeat(20)) || s.includes("*")) {
              const end = Date.now() + 300;
              while (Date.now() < end) {
                /* busy-wait mô phỏng regex backtracking */
              }
            }
            return null;
          },
        },
      };
      flagged._resetFlaggedForTest();
      flagged.noteFlaggedMessage(
        "fr33 n1tr0 gift redeem now claim your reward here fast",
        "g1",
        "spam",
        now,
      );
      const r = engine.selfTestKeywords();
      check("selfTestKeywords chạy qua mẫu flagged", r.tested >= 1, JSON.stringify(r));
      check("selfTestKeywords phát hiện ReDoS (failed>0)", r.failed > 0, JSON.stringify(r));
      check("engineStats.redosSuspect được bật", setupStats.redosSuspect === true);
      if (realFilters) require.cache[filtersPath] = realFilters;
      else delete require.cache[filtersPath];
    }

    // ---- 16. selfTestKeywords: filter ném → đếm failed, không crash ----
    {
      const filtersPath = require.resolve("../bot/src/handlers/filters.js");
      const realFilters = require.cache[filtersPath];
      require.cache[filtersPath] = {
        id: filtersPath,
        filename: filtersPath,
        loaded: true,
        exports: {
          findLearnedThreat: () => {
            throw new Error("regex hỏng");
          },
        },
      };
      flagged._resetFlaggedForTest();
      flagged.noteFlaggedMessage(
        "fr33 n1tr0 gift redeem now claim your reward here fast",
        "g1",
        "spam",
        now,
      );
      const r = engine.selfTestKeywords();
      check(
        "selfTestKeywords: filter ném → đếm failed, không crash",
        r.tested === 0 && r.failed >= 1,
        JSON.stringify(r),
      );
      if (realFilters) require.cache[filtersPath] = realFilters;
      else delete require.cache[filtersPath];
    }

    // ---- 17. refreshUrlhaus: filters nạp lỗi → vẫn cập nhật + trả true ----
    {
      const filtersPath = require.resolve("../bot/src/handlers/filters.js");
      const realFilters = require.cache[filtersPath];
      require.cache[filtersPath] = {
        id: filtersPath,
        filename: filtersPath,
        loaded: true,
        exports: new Proxy(
          {},
          {
            get() {
              throw new Error("filters chưa load");
            },
          },
        ),
      };
      const keepFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        text: async () => "2026-09-01 00:00:00 UTC,http://filtcatch.example/x,999\n",
      });
      const ok = await engine.refreshUrlhaus(store);
      check(
        "refreshUrlhaus: filters lỗi → vẫn cập nhật + trả true",
        ok === true && engine.isUrlhausDomain("filtcatch.example"),
      );
      globalThis.fetch = keepFetch;
      if (realFilters) require.cache[filtersPath] = realFilters;
      else delete require.cache[filtersPath];
    }
  }

  console.log(`\nKết quả threat engine: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
