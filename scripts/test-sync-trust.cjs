/**
 * Kiểm tra logic tin cậy danh sách guild (trustedFullList) của syncAll:
 *  1) Bot nhỏ (5 server): tin ngay từ lượt đầu → không bao giờ "cache thiếu".
 *  2) Bot nhỏ restart với 1 server bị kick lúc offline → lượt đầu sweep đúng.
 *  3) Bot lớn boot: lượt đầu chưa tin → lượt 2 tin.
 *  4) Bot lớn sụt thật 2000→1700: kẹt 2 lượt, lượt 3 (ổn định) chấp nhận sweep.
 *  5) Bot lớn cache blip thoáng qua: không bao giờ sweep nhầm.
 */
const path = require("path");
const MOD = path.join(__dirname, "..", "bot", "src", "handlers", "guildSync.js");

function fresh() {
  delete require.cache[require.resolve(MOD)];
  return require(MOD);
}

function makeClient(count) {
  const vals = Array.from({ length: count }, (_, i) => ({
    id: `g${i}`,
    name: `server-${i}`,
    icon: null,
    memberCount: 3,
    channels: { cache: { filter: () => [] } },
    roles: { cache: { filter: () => [] } },
  }));
  return {
    guilds: { cache: { values: () => vals } },
    application: { fetch: async () => ({ owner: null }) },
  };
}

function makeStore() {
  return { client: { mutation: async () => {} } };
}

let pass = 0;
let fail = 0;
function check(label, actual, expected) {
  if (actual === expected) {
    pass++;
    console.log(`  ✅ ${label} → ${actual}`);
  } else {
    fail++;
    console.log(`  ❌ ${label} → ${actual} (mong đợi ${expected})`);
  }
}

(async () => {
  // 1) Bot nhỏ 5 server: cả 3 lượt đều tin (không "cache thiếu")
  {
    const m = fresh();
    const c = makeClient(5);
    const s = makeStore();
    console.log("\n1) Bot nhỏ 5 server:");
    const r1 = await m.syncAll(c, s);
    check("lượt 1", r1.trustedFullList, true);
    const r2 = await m.syncAll(c, s);
    check("lượt 2", r2.trustedFullList, true);
  }

  // 2) Bot nhỏ restart, bị kick 1 server lúc offline: lượt đầu sweep (tin)
  {
    const m = fresh();
    const s = makeStore();
    console.log("\n2) Bot nhỏ restart với 4/5 server (kick lúc offline):");
    const r1 = await m.syncAll(makeClient(4), s);
    check("lượt 1 (4 server)", r1.trustedFullList, true);
  }

  // 3) Bot lớn boot: lượt 1 chưa tin, lượt 2 tin
  {
    const m = fresh();
    const s = makeStore();
    console.log("\n3) Bot lớn 2000 server boot:");
    const r1 = await m.syncAll(makeClient(1500), s); // cache đang lấp dần
    check("lượt 1 (cache 1500/2000)", r1.trustedFullList, false);
    const r2 = await m.syncAll(makeClient(2000), s);
    check("lượt 2 (đủ 2000)", r2.trustedFullList, true);
  }

  // 4) Bot lớn sụt THẬT 2000→1700: 2 lượt đầu chưa tin, lượt 3 ổn định thì tin
  {
    const m = fresh();
    const s = makeStore();
    await m.syncAll(makeClient(2000), s); // boot lượt 1 (chưa tin)
    await m.syncAll(makeClient(2000), s); // lượt 2: tin → lastTrustedCount = 2000
    console.log("\n4) Bot lớn sụt thật 2000→1700 (bị kick hàng loạt):");
    const r1 = await m.syncAll(makeClient(1700), s);
    check("lượt 1 (1700)", r1.trustedFullList, false);
    const r2 = await m.syncAll(makeClient(1700), s);
    check("lượt 2 (1700)", r2.trustedFullList, false);
    const r3 = await m.syncAll(makeClient(1700), s);
    check("lượt 3 (1700, ổn định)", r3.trustedFullList, true);
  }

  // 5) Bot lớn cache blip thoáng qua: chưa bao giờ sweep nhầm
  {
    const m = fresh();
    const s = makeStore();
    await m.syncAll(makeClient(2000), s); // boot lượt 1
    await m.syncAll(makeClient(2000), s); // lượt 2: tin → baseline 2000
    console.log("\n5) Bot lớn cache blip thoáng qua (gateway lag):");
    const r1 = await m.syncAll(makeClient(1400), s);
    check("blip lượt 1 (1400)", r1.trustedFullList, false);
    const r2 = await m.syncAll(makeClient(1900), s);
    check("hồi phục (1900)", r2.trustedFullList, true);
    const r3 = await m.syncAll(makeClient(2000), s);
    check("đủ 2000 trở lại", r3.trustedFullList, true);
  }

  console.log(`\nKết quả: ${pass} đúng / ${fail} sai`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
