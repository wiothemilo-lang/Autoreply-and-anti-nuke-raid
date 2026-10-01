// TEST: ConvexStore (bot/src/convex.js) — đường máu giữa bot và backend.
// Chạy: node scripts/test-convex-client.cjs
//
// Trước đây coverage 41% stmt / 15% funcs — các nhánh sống-còn khi Convex sự cố
// chưa từng được test:
//   - withRetry: lỗi 5xx/429/mạng được retry exponential; 4xx fail NGAY;
//     hết MAX_RETRIES thì ném lỗi.
//   - getConfig: TTL cache 600s (pending 30s); opts.force bỏ cache; lỗi mạng
//     trả cache cũ (stale) thay vì chết; không có cache thì ném.
//   - invalidate + pruneCache: dọn cache guild rời (memGuard).
//   - ruleCooldowns: isCooledDown/recordReply + chống phình Map > 500.
//   - sendHeartbeat: Convex chết → _heartbeatOk=false, không ném.
const Module = require("module");
const fs = require("fs");
const path = require("path");

// Mock convex/browser — ConvexHttpClient ghi nhận call, lỗi theo kịch bản.
const calls = [];
let failMode = null; // null | { statusCode } | { code } | "network"
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "convex/browser") {
    return {
      ConvexHttpClient: class {
        constructor() {}
        async query(name, args) {
          calls.push({ kind: "query", name, args });
          if (failMode) {
            const e = new Error("boom");
            if (failMode !== "network") Object.assign(e, failMode);
            throw e;
          }
          return { guildId: args?.guildId, config: true, lockdownUntil: undefined };
        }
        async mutation(name, args) {
          calls.push({ kind: "mutation", name, args });
          if (failMode) {
            const e = new Error("boom");
            if (failMode !== "network") Object.assign(e, failMode);
            throw e;
          }
          return { ok: true };
        }
        async action(name, args) {
          calls.push({ kind: "action", name, args });
          if (failMode) {
            const e = new Error("boom");
            if (failMode !== "network") Object.assign(e, failMode);
            throw e;
          }
          return { ok: true };
        }
      },
    };
  }
  return origLoad.call(this, request, ...rest);
};

const ConvexStore = require("../bot/src/convex.js");

let pass = 0;
let fail = 0;
const check = (label, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  ok ? pass++ : fail++;
};

function freshStore() {
  process.env.CONVEX_URL = "https://test.convex.cloud";
  delete process.env.CONVEX_DEPLOY_KEY;
  delete process.env.BOT_KEY;
  calls.length = 0;
  return new ConvexStore();
}

(async () => {
  // ── 1. withRetry: 4xx (trừ 429) fail NGAY — không retry ───────────────────
  {
    const store = freshStore();
    failMode = { statusCode: 403 };
    const t0 = Date.now();
    let threw = false;
    try {
      await store.query("x:y", {});
    } catch {
      threw = true;
    }
    const attempts = calls.length;
    failMode = null;
    check("4xx → ném lỗi ngay sau 1 lần gọi (không retry)", threw && attempts === 1);
    check("4xx → không chờ backoff (<300ms)", Date.now() - t0 < 300);
  }

  // ── 2. withRetry: 5xx được retry rồi thành công (hồi phục) ────────────────
  {
    const store = freshStore();
    let n = 0;
    const origQuery = store._rawClient.query.bind(store._rawClient);
    store._rawClient.query = async (...a) => {
      n++;
      if (n < 3) {
        const e = new Error("500");
        e.statusCode = 500;
        throw e;
      }
      return origQuery(...a);
    };
    const res = await store.query("guilds:getBotConfig", { guildId: "g" });
    check("5xx ×2 rồi thành công → retry về đích", res?.config === true && n === 3);
  }

  // ── 3. withRetry: hết 3 lần → ném lỗi (caller nhận error) ─────────────────
  {
    const store = freshStore();
    failMode = { code: "ECONNRESET" };
    let threw = false;
    try {
      await store.query("x:y", {});
    } catch {
      threw = true;
    }
    failMode = null;
    check("ECONNRESET → retry đủ 3 lần rồi ném", threw && calls.length === 3);
  }

  // ── 4. getConfig: TTL cache — lần 2 trong 600s KHÔNG gọi Convex ───────────
  {
    const store = freshStore();
    await store.getConfig("g-cache");
    const afterFirst = calls.length;
    const again = await store.getConfig("g-cache");
    check("getConfig lần 2 hit cache → không gọi Convex thêm", calls.length === afterFirst);
    check("getConfig trả config từ cache", again?.config === true);
  }

  // ── 5. getConfig: guild có cờ pending → TTL 30s (hết 30s gọi lại) ─────────
  {
    const store = freshStore();
    // Patch query trả config có lockdownRequested (cờ chờ xử lý). Tự ghi nhận
    // call vì patch thay thế mock ghi `calls` mặc định.
    let pendingCalls = 0;
    store._rawClient.query = async (name, args) => {
      pendingCalls++;
      calls.push({ kind: "query", name, args });
      return { guildId: args?.guildId, lockdownRequested: true };
    };
    await store.getConfig("g-pending");
    const afterFirst = pendingCalls;
    // Trong TTL 30s: hit cache.
    await store.getConfig("g-pending");
    check("pending-flag: lần 2 trong 30s → hit cache", pendingCalls === afterFirst);
    // Quá 30s: mock Date.now để nhảy 31s — fetch lại.
    const realNow = Date.now;
    Date.now = () => realNow() + 31_000;
    try {
      await store.getConfig("g-pending");
    } finally {
      Date.now = realNow;
    }
    check("pending-flag: qua 30s → gọi lại Convex", pendingCalls > afterFirst);
  }

  // ── 6. getConfig: force → bỏ cache ────────────────────────────────────────
  {
    const store = freshStore();
    await store.getConfig("g-force");
    const afterFirst = calls.length;
    await store.getConfig("g-force", { force: true });
    check("opts.force → luôn đọc mới dù cache còn", calls.length === afterFirst + 1);
  }

  // ── 7. getConfig: Convex chết → trả cache STALE thay vì chết ──────────────
  {
    const store = freshStore();
    await store.getConfig("g-stale");
    const afterFirst = calls.length;
    failMode = "network";
    let res = null;
    let threw = false;
    try {
      // Vượt TTL bằng mock Date +601s (TTL config là 600s).
      const realNow = Date.now;
      Date.now = () => realNow() + 1_801_000;
      try {
        res = await store.getConfig("g-stale");
      } finally {
        Date.now = realNow;
      }
    } catch {
      threw = true;
    }
    failMode = null;
    check(
      "Convex chết + có cache cũ → trả stale config (không chết)",
      !threw && res?.config === true,
    );
    check("Convex chết → vẫn đã thử gọi lại", calls.length > afterFirst);

    // Không có cache → ném lỗi cho caller tự xử lý.
    failMode = "network";
    threw = false;
    try {
      await store.getConfig("g-chua-co");
    } catch {
      threw = true;
    }
    failMode = null;
    check("Convex chết + KHÔNG cache → ném lỗi", threw);
  }

  // ── 8. invalidate + pruneCache ────────────────────────────────────────────
  {
    const store = freshStore();
    await store.getConfig("g-1");
    await store.getConfig("g-2");
    store.invalidate("g-1");
    await store.getConfig("g-1");
    check(
      "invalidate → guild đó đọc lại Convex",
      calls.filter((c) => c.name === "guilds:getBotConfig" && c.args?.guildId === "g-1").length ===
        2,
    );
    const removed = store.pruneCache(new Set(["g-1"]));
    check("pruneCache dọn guild không còn live", removed === 1);
    check("pruneCache giữ guild live", store.cache.has("g-1") && !store.cache.has("g-2"));
  }

  // ── 8b. RACE: invalidate trong lúc fetch đang bay ─────────────────────────
  // Bot tự ghi cấu hình (proxy gọi invalidate) ĐÚNG lúc một getConfig khác
  // đang chờ mạng: nếu kết quả fetch cũ vẫn được ghi cache thì cấu hình trước
  // khi ghi bị giữ tới 30 phút (bug thật đã gặp ở luồng khoá/ticket).
  {
    const store = freshStore();
    const origQuery = store._rawClient.query.bind(store._rawClient);
    let release = null;
    store._rawClient.query = () =>
      new Promise((resolve) => {
        // Kết quả "CŨ" — trả về SAU khi invalidate đã chạy.
        release = () => resolve({ guildId: "g-race", config: "CU", lockdownUntil: undefined });
      });
    const p = store.getConfig("g-race");
    for (let i = 0; i < 40 && !release; i++) await new Promise((r) => setTimeout(r, 5));
    check("race: fetch đã bắt đầu", typeof release === "function");
    store.invalidate("g-race");
    release();
    await p;
    check(
      "race: invalidate khi fetch đang bay → kết quả cũ KHÔNG ghi vào cache",
      !store.cache.has("g-race"),
    );
    // Đọc lại phải đi Convex lần nữa và nhận bản MỚI, không phải "CU".
    store._rawClient.query = origQuery;
    calls.length = 0;
    const after = await store.getConfig("g-race");
    check(
      "race: lượt đọc sau gọi lại Convex (không phục vụ cache cũ)",
      calls.filter((c) => c.name === "guilds:getBotConfig" && c.args?.guildId === "g-race")
        .length === 1,
    );
    check("race: lượt đọc sau nhận cấu hình mới", after?.config === true, JSON.stringify(after));
  }

  // ── 9. ruleCooldowns: isCooledDown/recordReply + cap 500 ──────────────────
  {
    const store = freshStore();
    check("chưa record → không cooldown", store.isCooledDown("g", "r", 60) === false);
    store.recordReply("g", "r");
    check("vừa record → cooldown hiệu lực", store.isCooledDown("g", "r", 60) === true);
    check("cooldownSeconds=0 → không bao giờ cooldown", store.isCooledDown("g", "r2", 0) === false);
    // Phình Map: ghi 510 rule cũ (quá 24h) → record thứ 511 dọn rác.
    const realNow = Date.now;
    for (let i = 0; i < 505; i++) {
      Date.now = () => realNow() - 25 * 3600 * 1000; // 25h trước
      store.recordReply("g-old", `rule-${i}`);
    }
    Date.now = realNow;
    store.recordReply("g-new", "rule-moi");
    check("Map > 500 → dọn rule quá 24h", store.ruleCooldowns.size < 505);
  }

  // ── 10. sendHeartbeat: lỗi → _heartbeatOk=false, không ném ────────────────
  {
    const store = freshStore();
    failMode = { statusCode: 500 };
    let threw = false;
    try {
      await store.sendHeartbeat(2, 20);
    } catch {
      threw = true;
    }
    failMode = null;
    check("heartbeat Convex chết → không ném ra ngoài", !threw);
    check("heartbeat lỗi → _heartbeatOk=false", store._heartbeatOk === false);
    await store.sendHeartbeat(2, 20);
    check("heartbeat thành công → _heartbeatOk=true", store._heartbeatOk === true);
  }

  // ── 11. Proxy tự chèn botKey vào mọi call ─────────────────────────────────
  {
    process.env.CONVEX_URL = "https://test.convex.cloud";
    process.env.BOT_KEY = "a".repeat(64);
    calls.length = 0;
    const store = new ConvexStore();
    await store.query("some:query", { guildId: "g" });
    const sent = calls[0]?.args ?? {};
    check(
      "có BOT_KEY → tự chèn botKey vào args",
      typeof sent.botKey === "string" && sent.botKey.length === 64,
    );
    check(
      "không đè botKey caller đã gửi",
      await (async () => {
        await store.query("some:query", { guildId: "g", botKey: "caller-key" });
        return calls[1].args.botKey === "caller-key";
      })(),
    );
    delete process.env.BOT_KEY;
  }

  // ── 12. Key cache LỆCH → tự xoay key (bootstrap lại) + retry call ─────────
  // Sự cố thật 20/09/2026: bot chạy từ /protogon/bot nạp key cache cũ bị Convex
  // từ chối ("Chìa khóa bot không hợp lệ") — ensureBotKey() chỉ bootstrap khi
  // CHƯA có key nên bot kẹt vĩnh viễn, phải nhờ người xóa tay .bot-key.
  // Hợp đồng mới: call bị từ chối botKey → xoay key (bỏ cache file + bootstrap
  // qua DISCORD_TOKEN) → retry đúng call đó 1 lần; xoay lại dồn dập bị chặn.
  {
    process.env.CONVEX_URL = "https://test.convex.cloud";
    delete process.env.BOT_KEY;
    // Bootstrap cần DISCORD_TOKEN — test mock action nên token là chuỗi giả.
    process.env.DISCORD_TOKEN = "test-token-for-bootstrap";
    calls.length = 0;
    const store = new ConvexStore();
    // Giả lập key cache lệch: bot "vừa nạp" một key server không nhận.
    store.botKey = "stale-key-from-cache";
    // Giả lập bootstrap: cấp key MỚI hợp lệ, ghi file (temp dir — không đụng .env).
    const os = require("os");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "convex-test-"));
    const realCwd = process.cwd();
    let rotations = 0;
    const rawQuery = store._rawClient.query.bind(store._rawClient);
    store._rawClient.query = async (name, args) => {
      // Call dùng key STALE → Convex từ chối; call sau khi xoay → OK.
      if (args?.botKey === "stale-key-from-cache") {
        const e = new Error("Uncaught Error: Chìa khóa bot không hợp lệ (botKey)");
        e.statusCode = 500;
        throw e;
      }
      return rawQuery(name, args);
    };
    store._rawClient.action = async (name) => {
      if (name === "botBootstrapAction:requestBotKey") {
        rotations++;
        calls.push({ kind: "action", name, args: { botToken: "***" } });
        return { ok: true, botKey: `fresh-key-${rotations}` };
      }
      return { ok: true };
    };
    // Chạy bootstrap trong temp dir để file .bot-key ghi vào đó (bền với test).
    process.chdir(tmpDir);
    let res = null;
    let threw = false;
    try {
      res = await store.getConfig("g-key-rotate");
    } catch {
      threw = true;
    }
    process.chdir(realCwd);
    check(
      "call bị từ chối botKey → tự xoay key (bootstrap lại) rồi thành công",
      !threw && res?.config === true && rotations === 1,
      `rotations=${rotations}, threw=${threw}`,
    );
    check("sau xoay, call dùng key MỚI (không phải key stale)", store.botKey === "fresh-key-1");
    check(
      "file cache .bot-key được ghi lại với key mới",
      fs.existsSync(path.join(tmpDir, ".bot-key")),
    );
    // Lỗi KHÔNG phải botKey (mạng/5xx thường) → KHÔNG xoay key.
    rotations = 0;
    const store2 = freshStore();
    store2.botKey = "some-key";
    store2._rawClient.action = async () => {
      rotations++;
      return { ok: true, botKey: "x" };
    };
    failMode = { code: "ECONNRESET" };
    threw = false;
    try {
      await store2.query("x:y", {});
    } catch {
      threw = true;
    }
    failMode = null;
    check("lỗi mạng thường → KHÔNG xoay key (chỉ retry thường)", rotations === 0 && threw);
    delete process.env.DISCORD_TOKEN;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // ── Tự xoá cache sau khi CHÍNH BOT ghi cấu hình (proxy CONFIG_WRITE_MUTATIONS) ──
  // Bug thật 23/09/2026: 7/35 chỗ gọi bot_writes quên store.invalidate() → bot
  // chạy cấu hình CŨ tới 30 phút. Hệ quả đo được: server bị khoá kênh lâu hơn
  // cấu hình (tickUnlocks đọc `lockdownUntil` cũ), mở khoá xong bot tưởng còn
  // đang khoá nên BỎ QUA raid sau, báo cáo ngày gửi lặp, restore xong vẫn chạy
  // cấu hình cũ. Nay proxy trong convex.js tự xoá — không thể quên ở call site.
  {
    const store = freshStore();
    store.botKey = "k";
    await store.getConfig("g-cfg");
    check("trước khi bot ghi: cache có entry của guild", store.cache.has("g-cfg"));

    await store.client.mutation("bot_writes:botLockState", { guildId: "g-cfg", until: 1 });
    check("botLockState (đổi hạn khoá) → tự xoá cache config", !store.cache.has("g-cfg"));

    await store.getConfig("g-cfg2");
    await store.client.mutation("bot_writes:botSyncGuilds", { guildId: "g-cfg2" });
    check(
      "botSyncGuilds (vòng sync 5 phút) → KHÔNG xoá cache (giữ cache có ích)",
      store.cache.has("g-cfg2"),
    );

    await store.getConfig("g-cfg3");
    await store.client.mutation("bot_writes:botSetAutoBackup", { days: 3 });
    check("thiếu guildId → không crash, cache giữ nguyên", store.cache.has("g-cfg3"));

    await store.getConfig("g-cfg4");
    failMode = { statusCode: 500 };
    let cfgThrew = false;
    try {
      await store.client.mutation("bot_writes:botUpdateSettings", {
        guildId: "g-cfg4",
        prefix: "!",
      });
    } catch {
      cfgThrew = true;
    }
    failMode = null;
    check(
      "ghi THẤT BẠI → không xoá cache (không có gì mới để đọc)",
      cfgThrew && store.cache.has("g-cfg4"),
    );

    // Nhánh XOAY KEY: lượt đầu bị từ chối botKey → xoay → gọi lại → vẫn xoá cache.
    const storeRot = freshStore();
    storeRot.botKey = "stale";
    await storeRot.getConfig("g-cfg5");
    let attempts = 0;
    storeRot._rawClient.mutation = async (name, args) => {
      attempts++;
      if (attempts === 1) throw new Error("Chìa khóa bot không hợp lệ (botKey)");
      calls.push({ kind: "mutation", name, args });
      return { ok: true };
    };
    storeRot._rawClient.action = async () => ({ ok: true, botKey: "fresh-key-9" });
    const rotDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "convex-cfg-"));
    const rotCwd = process.cwd();
    process.chdir(rotDir);
    let rotThrew = false;
    try {
      await storeRot.client.mutation("bot_writes:botLockState", { guildId: "g-cfg5", until: 2 });
    } catch {
      rotThrew = true;
    }
    process.chdir(rotCwd);
    fs.rmSync(rotDir, { recursive: true, force: true });
    check(
      "xoay botKey rồi gọi lại thành công → vẫn xoá cache config",
      !rotThrew && attempts === 2 && !storeRot.cache.has("g-cfg5"),
      `attempts=${attempts}, threw=${rotThrew}`,
    );
  }

  console.log(`\nKết quả: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("Suite crash:", e);
  process.exit(1);
});
