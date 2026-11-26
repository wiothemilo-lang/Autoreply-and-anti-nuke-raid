/**
 * threatEngine.js — Engine Threat Intel cục bộ (chạy TRÊN VPS, 0 token AI):
 *
 *  1. URLHAUS MONITOR — tải danh sách domain/URL độc của abuse.ch (URLhaus, free
 *     không key) mỗi giờ → bot biết TRƯỚC các link malware mới. Nạp vào filters.js
 *     (threatUrlhausDomains) → mọi link trong tin nhắn đối chiếu với danh sách.
 *     Fetch + parse JSON vài chục KB: tốn CPU vừa phải, đổi lại tăng năng lực chặn.
 *
 *  2. N-GRAM CLUSTERING — mỗi 30 phút quét tin nhắn đã bị flag (được antinuke +
 *     filters ghi qua noteFlaggedMessage) bằng trigram-shingles + Jaccard
 *     similarity: tìm cụm spam BIẾN THỂ (fr33 n1tro, chèn ký tự ẩn — né từ khóa
 *     thường). Cụm đủ lớn (≥ 3 thành viên, similarity ≥ 0.6) → sinh từ khóa
 *     wildcard mới (tần suất token đặc trưng của cụm) + lưu meta lên Convex.
 *     Đây là công việc CPU thật — dùng đúng "nhàn rỗi" của VPS thay vì idle.
 *
 *  3. SELF-TEST REGEX — mỗi 30 phút recompile từ khóa → wildcard regex và tự
 *     kiểm thử trên mẫu flagged gần nhất (bắt regex hỏng/hiệu năng kém).
 *
 *  4. BACKFILL — chạy 1 lần sau khi online 10 phút: quét lại toàn bộ raidSamples
 *     lịch sử để đào thêm từ khóa đã bỏ sót (ambient learning "tái chế").
 *
 * Tất cả vòng đều unref() — không giữ bot sống nếu process sập. Lỗi của 1 vòng
 * không ảnh hưởng vòng khác, không ảnh hưởng bot chính.
 */

const { noteFlaggedMessage, noteFlaggedMessages, sweepFlagged } = require("./flaggedMessages");

/** URLhaus — abuse.ch malware URL feed (CSV): id, url, url_status, threat, tags... */
const URLHAUS_URL = "https://urlhaus.abuse.ch/downloads/recent/";
const URLHAUS_INTERVAL_MS = 30 * 60 * 1000; // 30 phút (A1: gấp đôi nhịp cũ)
const URLHAUS_MAX_DOMAINS = 15000; // A1: x3 dung lượng (tiêu hao ~6MB RAM)
const URLHAUS_LINES = 3000; // A1: đọc 3000 dòng/lượt (~vài trăm KB)

/**
 * OpenPhish community feed (A2 — free, không key): mỗi dòng 1 URL phishing
 * đang hoạt động (Discord/Steam/ngân hàng/... — đúng đối tượng spam server).
 * Hợp nhất host vào CÙNG Set so khớp với URLhaus → filters.js không đổi gì.
 */
const OPENPHISH_URL = "https://openphish.com/feed.txt";
const OPENPHISH_INTERVAL_MS = 30 * 60 * 1000; // 30 phút
const OPENPHISH_MAX_DOMAINS = 5000;
const OPENPHISH_LINES = 2000; // feed mới nhất nằm cuối file → đọc từ đuôi

/** N-gram cluster: chu kỳ + tham số (B1: nhạy hơn — đốt CPU đổi tầm nhìn). */
const NGRAM_INTERVAL_MS = 10 * 60 * 1000; // 10 phút — từ khóa mới chậm nhất 10 phút sau tin đầu
const CLUSTER_MIN_MEMBERS = 2; // bắt cụm khi mới 2 tin nhắn biến thể
const CLUSTER_SIMILARITY = 0.6;
const CLUSTER_WINDOW_MS = 7 * 24 * 3600 * 1000; // cửa sổ học 7 ngày (đồng bộ flaggedMessages MAX_TTL)

/** Self-test regex: cùng chu kỳ n-gram (chạy lệch nhau vài giây). */
const SELFTEST_INTERVAL_MS = 30 * 60 * 1000;

/** Backfill: 1 lần sau 10 phút online. */
const BACKFILL_DELAY_MS = 10 * 60 * 1000;

let urlhausDomains = new Set();
let engineStats = {
  urlhausDomains: 0,
  openphishDomains: 0,
  ngramClusters: 0,
  lastSelfTestOk: null,
};

/**
 * Trích host từ feed văn bản thô (mỗi dòng 1 URL — dùng chung cho OpenPhish;
 * hàm thuần, không I/O — test được trực tiếp).
 */
function hostsFromFeed(
  text,
  { maxDomains = OPENPHISH_MAX_DOMAINS, maxLines = OPENPHISH_LINES } = {},
) {
  const lines = String(text || "")
    .split("\n")
    .filter((l) => l.trim());
  const hosts = new Set();
  for (const line of lines.slice(-maxLines)) {
    const host = hostOf(line.trim());
    if (host) hosts.add(host);
    if (hosts.size >= maxDomains) break;
  }
  return hosts;
}

/* ============================================================
 * 1. URLHAUS
 * ============================================================ */

/** Trích hostname từ URL. */
function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Tải + parse feed URLhaus "recent" (CSV: firstseen,url,id + header #).
 * Giữ tối đa URLHAUS_MAX_DOMAINS domain độc → filters.js so khớp link.
 */
/**
 * Hợp nhất URLhaus + OpenPhish vào Set dùng chung và đẩy sang filters.js ngay.
 * Giữ 2 nguồn tách riêng để lượt refresh URLhaus không xoá mất domain OpenPhish
 * và ngược lại, OpenPhish nạp xong là filters.js nhận được ngay.
 */
let urlhausFeedDomains = new Set();
let openphishFeedDomains = new Set();

function syncThreatDomainsToFilters() {
  const merged = new Set([...urlhausFeedDomains, ...openphishFeedDomains]);
  urlhausDomains = merged;
  try {
    const filters = require("./handlers/filters");
    if (typeof filters._setUrlhausDomainsForTest === "function") {
      filters._setUrlhausDomainsForTest([...merged]);
    }
  } catch {
    // filters chưa load — refreshThreatIntel tiếp theo sẽ nhận qua botGetIntel
  }
}

/** Tách URL từ một dòng CSV URLhaus (cột thật ở vị trí [2] và có dấu ngoặc kép). */
function extractUrlFromCsvLine(line) {
  const cols = line.split(",");
  for (const raw of cols) {
    const cell = raw.trim().replace(/^"|"$/g, "");
    if (/^https?:\/\//i.test(cell)) return cell;
  }
  return null;
}

async function refreshUrlhaus(store) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(URLHAUS_URL, {
      signal: ctrl.signal,
      headers: { "User-Agent": "ProtogonBot/1.0 (threat-intel; discord bot)" },
    });
    if (!res.ok) return false;
    const text = (await res.text()).slice(0, 400_000);
    const lines = text.split("\n").filter((l) => l && !l.startsWith("#"));
    const domains = new Set();
    for (const line of lines.slice(-URLHAUS_LINES)) {
      const url = extractUrlFromCsvLine(line);
      const host = hostOf(url);
      if (host) domains.add(host);
      if (domains.size >= URLHAUS_MAX_DOMAINS) break;
    }
    if (domains.size === 0) return false;
    urlhausFeedDomains = domains;
    engineStats.urlhausDomains = domains.size;
    syncThreatDomainsToFilters();
    // Ghi meta lên Convex (1 mutation/giờ — rẻ).
    await store?.client
      ?.mutation("threatIntel:botSetResearchMeta", { urlhausDomains: domains.size })
      .catch(() => null);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Link có trong danh sách domain độc URLhaus không? */
function isUrlhausDomain(urlOrHost) {
  if (urlhausDomains.size === 0) return false;
  const host = hostOf(
    String(urlOrHost).includes("://") ? String(urlOrHost) : `http://${urlOrHost}`,
  );
  return host ? urlhausDomains.has(host) : false;
}

/**
 * A2 — Tải + parse OpenPhish community feed (plain text, 1 URL/dòng).
 * Host hợp nhất vào cùng Set với URLhaus — so khớp 1 lần cho cả 2 nguồn.
 */
async function refreshOpenPhish(_store) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(OPENPHISH_URL, {
      signal: ctrl.signal,
      headers: { "User-Agent": "ProtogonBot/1.0 (threat-intel; discord bot)" },
    });
    if (!res.ok) return false;
    const text = (await res.text()).slice(0, 600_000);
    const hosts = hostsFromFeed(text);
    if (hosts.size === 0) return false;
    openphishFeedDomains = hosts;
    engineStats.openphishDomains = hosts.size;
    syncThreatDomainsToFilters();
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/* ============================================================
 * 2. N-GRAM CLUSTERING (trigram shingles + Jaccard)
 * ============================================================ */

/** Trigram shingles của 1 chuỗi. */
function shingles(text) {
  const t = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length < 6) return new Set();
  const s = new Set();
  for (let i = 0; i < t.length - 2; i++) s.add(t.slice(i, i + 3));
  return s;
}

/** Jaccard similarity giữa 2 shingle-set. */
function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Tìm cụm spam biến thể trong mẫu flagged: greedy clustering — mỗi tin so với
 * center của cụm có sẵn (similarity >= CLUSTER_SIMILARITY) hoặc lập cụm mới.
 * Chỉ chạy trên flagged store trong cửa sổ 48h.
 */
function clusterFlagged(now = Date.now()) {
  const cutoff = now - CLUSTER_WINDOW_MS;
  const items = noteFlaggedMessages(cutoff);
  if (items.length < CLUSTER_MIN_MEMBERS) return [];
  const shingled = items.map((it) => ({ it, s: shingles(it.content) }));
  const clusters = [];
  for (const { it, s } of shingled) {
    let best = null;
    let bestSim = 0;
    for (const c of clusters) {
      const sim = jaccard(s, c.shingles);
      if (sim > bestSim) {
        bestSim = sim;
        best = c;
      }
    }
    if (best && bestSim >= CLUSTER_SIMILARITY) {
      best.members.push(it);
      // center = trung bình shingles (tái tính từ thành viên cuối giữ đơn giản)
      best.shingles = shingles(best.members.map((m) => m.content).join(" "));
    } else {
      clusters.push({ members: [it], shingles: s });
    }
  }
  return clusters.filter((c) => c.members.length >= CLUSTER_MIN_MEMBERS);
}

/**
 * Sinh từ khóa wildcard từ 1 cụm: đếm tần suất token (≥5 ký tự, không noise),
 * lấy top token xuất hiện trong ≥ 2/3 thành viên → từ khóa đặc trưng của cụm.
 */
const NOISE = new Set([
  "discord",
  "server",
  "free",
  "nitro",
  "gift",
  "click",
  "link",
  "http",
  "https",
  "www",
  "com",
]);
function keywordsFromCluster(cluster, max = 3) {
  const n = cluster.members.length;
  const freq = new Map();
  for (const m of cluster.members) {
    const tokens = new Set(
      String(m.content)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 5 && t.length <= 20 && !NOISE.has(t) && !/^\d+$/.test(t)),
    );
    for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  const out = [];
  for (const [t, c] of [...freq.entries()].sort((a, b) => b[1] - a[1])) {
    if (c >= Math.ceil((n * 2) / 3)) out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** Một lượt n-gram: cluster → từ khóa mới → lưu meta + trả kết quả. */
async function runNgramCycle(store) {
  try {
    const clusters = clusterFlagged();
    engineStats.ngramClusters = clusters.length;
    if (clusters.length > 0) {
      const newKeywords = clusters.flatMap(keywordsFromCluster).filter(Boolean).slice(0, 10);
      if (newKeywords.length > 0) {
        // Ghi qua mutation research: hợp nhất keywords (botKey tự attach bởi store).
        await store?.client
          ?.mutation("threatIntel:botSetResearchRun", {
            sources: ["ngram-clusters"],
            keywords: newKeywords,
            scamPhrases: [],
            summary: `N-gram engine: ${clusters.length} cụm spam biến thể → ${newKeywords.length} từ khóa mới`,
            aiUsed: false,
            nextRunAt: Date.now() + 3600_000, // không đẩy lịch research — chỉ ghi intel
            trigger: "auto",
          })
          .catch(() => null);
      }
      return { clusters: clusters.length, keywords: newKeywords.length };
    }
    return { clusters: 0, keywords: 0 };
  } catch {
    return { clusters: 0, keywords: 0 };
  }
}

/* ============================================================
 * 3. SELF-TEST REGEX
 * ============================================================ */

/**
 * Tự kiểm thử: từ khóa → wildcard regex rồi test trên flagged gần nhất.
 * Trả { ok, tested, failed } — failed>0 nghĩa là có từ khóa tạo regex hỏng/ quá chậm.
 */
function selfTestKeywords() {
  let tested = 0;
  let failed = 0;
  try {
    const filters = require("./handlers/filters");
    // findLearnedThreat chạy với intel hiện tại; đo thời gian 1 đợt nhỏ.
    const samples = noteFlaggedMessages(Date.now() - 24 * 3600_000).slice(0, 50);
    const t0 = process.hrtime.bigint();
    for (const s of samples) {
      try {
        filters.findLearnedThreat(String(s.content || "").slice(0, 300));
        tested++;
      } catch {
        failed++;
      }
    }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (ms > 250) failed++; // quá chậm → coi như fail để cảnh báo

    // B3 — READING BENCHMARK chống ReDoS: nạp chuỗi độc vào path so khớp.
    // Regex catastrophic backtracking (nested quantifier do từ khóa học được
    // ghép) sẽ phình thời gian ở đây → cảnh báo thay vì treo bot khi raid.
    const evil = [
      "a".repeat(200) + "!".repeat(200) + "x", // lặp ký tự + ký tự biên
      "((((((((((a" + "+".repeat(50), // dấu + lặp bất thường
      "w".repeat(150) + " *".repeat(20), // wildcard có thể nhồi vào pattern
    ];
    const t1 = process.hrtime.bigint();
    for (const e of evil) {
      try {
        filters.findLearnedThreat(e);
      } catch {}
    }
    const evilMs = Number(process.hrtime.bigint() - t1) / 1e6;
    if (evilMs > 500) {
      failed++;
      engineStats.redosSuspect = true;
      console.error(
        `[threatEngine] ⚠️ soi ReDoS: path so khớp mất ${evilMs.toFixed(0)}ms cho chuỗi độc — kiểm tra wildcard regex!`,
      );
    } else {
      engineStats.redosSuspect = false;
    }

    engineStats.lastSelfTestOk = failed === 0;
  } catch {
    engineStats.lastSelfTestOk = null;
  }
  return { tested, failed };
}

/* ============================================================
 * 4. BACKFILL raidSamples
 * ============================================================ */

/** Quét lại raidSamples lịch sử (1 lần sau khi online) — đào từ khóa bỏ sót. */
async function backfillFromSamples(store) {
  try {
    const samples = await store.client
      .query("antinuke:recentRaidSamples", { limit: 200 })
      .catch(() => null);
    if (!Array.isArray(samples) || samples.length === 0) return { keywords: 0 };
    const { extractKeywordsFromText } = require("./research");
    const all = [];
    for (const s of samples) {
      const reason = String(s.aiReason || s.action || "");
      all.push(...extractKeywordsFromText(reason, 4));
    }
    const uniq = [...new Set(all)].slice(0, 12);
    if (uniq.length === 0) return { keywords: 0 };
    await store.client
      .mutation("threatIntel:botSetResearchRun", {
        sources: ["backfill-samples"],
        keywords: uniq,
        scamPhrases: [],
        summary: `Backfill: quét lại ${samples.length} mẫu raid lịch sử → ${uniq.length} từ khóa tái thu`,
        aiUsed: false,
        nextRunAt: Date.now() + 3600_000,
        trigger: "auto",
      })
      .catch(() => null);
    return { keywords: uniq.length };
  } catch {
    return { keywords: 0 };
  }
}

/* ============================================================
 * SETUP
 * ============================================================ */

function setupThreatEngine(store) {
  // URLhaus — ngay khi online + mỗi 30 phút (A1).
  setTimeout(() => refreshUrlhaus(store).catch(() => {}), 20_000).unref?.();
  const urlhausInt = setInterval(() => refreshUrlhaus(store).catch(() => {}), URLHAUS_INTERVAL_MS);
  urlhausInt.unref?.();

  // OpenPhish — ngay sau URLhaus đầu + mỗi 30 phút (A2).
  setTimeout(() => refreshOpenPhish(store).catch(() => {}), 45_000).unref?.();
  const openphishInt = setInterval(
    () => refreshOpenPhish(store).catch(() => {}),
    OPENPHISH_INTERVAL_MS,
  );
  openphishInt.unref?.();

  // N-gram + self-test — mỗi 30 phút (sweep flagged store chạy cùng nhịp).
  const ngramInt = setInterval(() => {
    try {
      sweepFlagged();
    } catch {}
    runNgramCycle(store).catch(() => {});
  }, NGRAM_INTERVAL_MS);
  ngramInt.unref?.();
  setTimeout(() => runNgramCycle(store).catch(() => {}), 45_000).unref?.();
  const stInt = setInterval(() => selfTestKeywords(), SELFTEST_INTERVAL_MS + 5_000);
  stInt.unref?.();

  // Backfill — 1 lần.
  setTimeout(() => backfillFromSamples(store).catch(() => {}), BACKFILL_DELAY_MS).unref?.();

  return engineStats;
}

/** Danh sách host độc đang nhớ (bản copy — dùng cho researchUrlhaus trích từ khóa). */
function getUrlhausHosts() {
  return [...urlhausDomains];
}

module.exports = {
  setupThreatEngine,
  refreshUrlhaus,
  refreshOpenPhish,
  hostsFromFeed,
  isUrlhausDomain,
  getUrlhausHosts,
  clusterFlagged,
  keywordsFromCluster,
  runNgramCycle,
  selfTestKeywords,
  backfillFromSamples,
  noteFlaggedMessage,
  noteFlaggedMessages,
};
