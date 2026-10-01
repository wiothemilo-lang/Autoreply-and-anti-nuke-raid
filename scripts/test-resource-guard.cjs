/**
 * TEST RESOURCE GUARD (Đợt 7 — tối ưu tài nguyên):
 * memGuard phải dọn đúng, fail-open, và các sweeper mới phải xóa đúng vùng
 * bộ nhớ bị lỡ trước đây (heat nguội, guild đã rời, cache cũ) mà KHÔNG xóa
 * nhầm dữ liệu còn nóng.
 */
const DJS_MOCK = require("./support/djs-mock-path.cjs");
const Module = require("module");

// Mock discord.js cho các module bot import (heat → timeoutWatch → discord.js).
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "discord.js") return DJS_MOCK;
  return origResolve.call(this, request, ...args);
};
require("fs").writeFileSync(
  DJS_MOCK,
  `class EmbedBuilder { setColor(){return this} setTitle(){return this} setDescription(){return this} addFields(){return this} setTimestamp(){return this} setFooter(){return this} }
class Collection extends Map {}
module.exports = { EmbedBuilder, Collection, Colors: new Proxy({}, { get: () => 0x000000 }), PermissionFlagsBits: new Proxy({}, { get: () => 0n }), AuditLogEvent: new Proxy({}, { get: () => 0 }), Partials: {}, GatewayIntentBits: new Proxy({}, { get: () => 0 }) };`,
);

let pass = 0;
let fail = 0;
const check = (label, ok) => {
  console.log(ok ? `PASS ${label}` : `FAIL ${label}`);
  ok ? pass++ : fail++;
};

/* ── 1. memGuard: đăng ký, tổng hợp, fail-open ── */
const { registerSweeper, sweepAll, startMemGuard } = require("../bot/src/memGuard");

registerSweeper("test-ok", () => 3);
registerSweeper("test-zero", () => 0);
registerSweeper("test-throw", () => {
  throw new Error("dọn lỗi giả lập");
});
registerSweeper("test-after-throw", () => 2);

const total = sweepAll();
check("sweepAll tổng đúng các sweeper (bỏ qua 0)", total === 5);
check("sweeper lỗi không giết sweeper sau nó", true); // đến được đây = fail-open

/* ── 2. heat.sweepCold: giữ nóng, xóa nguội ── */
const { HeatTracker } = require("../bot/src/heat");
const heat = new HeatTracker({}, {});
const NOW = Date.now();
const MIN = 60_000;

heat.states.set("g1:hot", { heat: 50, updatedAt: NOW - MIN, username: "hot" }); // còn nóng
heat.states.set("g1:cold", { heat: 2, updatedAt: NOW - 3 * 60 * MIN, username: "cold" }); // nguội lâu
heat.states.set("g1:fresh-punished", { heat: 0, updatedAt: NOW, lastPunishedAt: NOW - MIN }); // vừa bị phạt
heat.states.set("g1:old-punished", {
  heat: 0,
  updatedAt: NOW - 2000 * MIN,
  lastPunishedAt: NOW - 2000 * MIN,
});
heat.strikes.set("g1:fresh-strike", { count: 1, firstAt: NOW - 5 * MIN });
heat.strikes.set("g1:max-window-strike", { count: 2, firstAt: NOW - 120 * MIN });
heat.strikes.set("g1:old-strike", { count: 2, firstAt: NOW - 1441 * MIN });

const removed = heat.sweepCold();
check("xóa entry nguội", heat.states.get("g1:cold") === undefined);
check("giữ entry còn nóng", heat.states.get("g1:hot") !== undefined);
check(
  "giữ entry vừa bị phạt (cửa sổ tái phạm)",
  heat.states.get("g1:fresh-punished") !== undefined,
);
check("xóa entry bị phạt đã quá 24h", heat.states.get("g1:old-punished") === undefined);
check("giữ strike còn trong cửa sổ", heat.strikes.get("g1:fresh-strike") !== undefined);
check(
  "giữ strike trong cửa sổ cấu hình tối đa 24h",
  heat.strikes.get("g1:max-window-strike") !== undefined,
);
check("xóa strike quá cửa sổ tối đa 24h", heat.strikes.get("g1:old-strike") === undefined);
check("trả về đúng số entry đã dọn", removed === 3);

// Idempotent: sweep lần 2 không xóa thêm gì
check("sweep lần 2 idempotent", heat.sweepCold() === 0);

/* ── 3. altDetection.sweepStaleGuilds: guild đã rời ── */
const alt = require("../bot/src/altDetection");
alt.trackJoinForBurst("guildAlive", "u1", 10);
alt.trackJoinForBurst("guildDead", "u2", 10);
const removedAlt = alt.sweepStaleGuilds(new Set(["guildAlive"]));
check("dọn burstTracker guild đã rời", removedAlt >= 1);
check("giữ guild còn sống", alt.sweepStaleGuilds(new Set(["guildAlive"])) === 0);

// Idempotent: guild chết đã dọn thì sweep tiếp không báo thêm
alt.sweepStaleGuilds(new Set(["guildAlive"]));
check("sweep alt idempotent", true);

/* ── 4. ConvexStore.pruneCache: cache guild đã rời ── */
process.env.CONVEX_URL = process.env.CONVEX_URL || "https://test-dummy.convex.cloud";
const ConvexStore = require("../bot/src/convex");
const store = new ConvexStore();
store.cache.set("guildKeep", { config: { a: 1 }, fetchedAt: NOW });
store.cache.set("guildGone", { config: { b: 2 }, fetchedAt: NOW });
const pruned = store.pruneCache(new Set(["guildKeep"]));
check("xóa cache guild đã rời", store.cache.get("guildGone") === undefined);
check("giữ cache guild còn sống", store.cache.get("guildKeep") !== undefined);
check("pruneCache trả đúng số", pruned === 1);
check("pruneCache idempotent", store.pruneCache(new Set(["guildKeep"])) === 0);

/* ── 5. startMemGuard: timer chạy + dừng sạch ── */
(async () => {
  let fired = false;
  registerSweeper("test-timer", () => {
    fired = true;
    return 0;
  });
  const stop = startMemGuard(30);
  await new Promise((r) => setTimeout(r, 120));
  check("startMemGuard chạy định kỳ", fired);
  stop();
  const firedBefore = fired;
  await new Promise((r) => setTimeout(r, 120));
  check("stop() dừng vòng lặp", fired === firedBefore);

  console.log(`\nKết quả resource guard: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})();
