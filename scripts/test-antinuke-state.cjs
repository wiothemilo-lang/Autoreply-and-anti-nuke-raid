// Test state.js của anti-nuke — tầng nền chống phạt/case TRÙNG và chống rò rỉ RAM:
//   - record(): đếm sự kiện trong cửa sổ, cắt timestamp cũ
//   - markHandled/wasHandled: chặn log/case lặp cho cùng module + thủ phạm
//   - appUserHandledRecently/markAppUserHandled: dedupe 2 tầng app
//   - recentJoinCount: đo làn sóng join
//   - auditExecutor/webhookCreator: đọc audit log, nuốt lỗi khi thiếu quyền
//   - sweepMemory: xóa guild đã rời + entry cũ của guild đang sống + cap BUCKET_MAX
//   - recordEvent: ghi Convex, nuốt lỗi mạng
// Không mạng, không DB thật. Chạy: node scripts/test-antinuke-state.cjs
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
};
`,
);

(async () => {
  const createState = require("../bot/src/handlers/antinuke/state");
  const { BUCKET_MAX } = require("../bot/src/handlers/antinuke/shared");

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

  const mutations = [];
  let mutationShouldThrow = false;
  const store = {
    client: {
      mutation: async (name, args) => {
        if (mutationShouldThrow) throw new Error("mạng lỗi");
        mutations.push({ name, args });
        return { ok: true };
      },
    },
  };

  const guilds = new Map();
  const client = { guilds: { cache: guilds }, user: { id: "bot-self" } };
  const state = createState({ client, store });

  // ── 1. record(): đếm trong cửa sổ, cắt mốc cũ ──
  {
    const n1 = state.record("g1", "massJoin", { windowSeconds: 60 });
    const n2 = state.record("g1", "massJoin", { windowSeconds: 60 });
    const n3 = state.record("g1", "massJoin", { windowSeconds: 60 });
    check("record cùng module → cộng dồn đúng", n1 === 1 && n2 === 2 && n3 === 3);

    const arr = state.state.buckets.get("g1:massJoin");
    arr.unshift(Date.now() - 120_000); // chèn mốc quá cửa sổ
    const n4 = state.record("g1", "massJoin", { windowSeconds: 60 });
    check("record cắt timestamp ngoài cửa sổ", n4 === 4);
  }

  // ── 2. markHandled/wasHandled: chặn phạt lặp ──
  {
    check("chưa đánh dấu → wasHandled false", state.wasHandled("g2", "massBan", "u1") === false);
    state.markHandled("g2", "massBan", "u1", 60_000);
    check("vừa đánh dấu → wasHandled true", state.wasHandled("g2", "massBan", "u1") === true);
    check("khác module → không dính", state.wasHandled("g2", "massKick", "u1") === false);
    check("khác user → không dính", state.wasHandled("g2", "massBan", "u2") === false);
    check("userId rỗng → luôn false", state.wasHandled("g2", "massBan", "") === false);
    check("markHandled userId rỗng → không ghi", state.state.punishedRecently.size === 1);

    // Hết hạn window → không còn chặn
    state.markHandled("g2", "massBan", "u3", -1);
    check(
      "window âm (đã hết hạn) → wasHandled false",
      state.wasHandled("g2", "massBan", "u3") === false,
    );
  }

  // ── 3. markHandled dọn entry hết hạn khi vượt 2000 (chống phình) ──
  {
    state.state.punishedRecently.clear();
    for (let i = 0; i < 2001; i++) state.markHandled("g-big", "m", "u" + i, 60_000);
    check("vượt 2000 → tự dọn entry hết hạn", state.state.punishedRecently.size <= 2001);
    state.state.punishedRecently.clear();
  }

  // ── 4. appUserHandledRecently / markAppUserHandled ──
  {
    check(
      "chưa mark → appUserHandledRecently false",
      state.appUserHandledRecently("g3", "u1", 60_000) === false,
    );
    state.markAppUserHandled("g3", "u1");
    check(
      "đã mark → appUserHandledRecently true",
      state.appUserHandledRecently("g3", "u1", 60_000) === true,
    );
    check("window 0 → coi như hết hạn", state.appUserHandledRecently("g3", "u1", 0) === false);
    check(
      "userId rỗng → false, mark rỗng không ghi",
      state.appUserHandledRecently("g3", "", 60_000) === false,
    );
    const before = state.state.appUserHandledAt.size;
    state.markAppUserHandled("g3", "");
    check(
      "markAppUserHandled userId rỗng → không thêm",
      state.state.appUserHandledAt.size === before,
    );
  }

  // ── 5. recentJoinCount ──
  {
    state.state.joiners.set("g4", [
      { id: "a", ts: Date.now() - 5_000 },
      { id: "b", ts: Date.now() - 30_000 },
      { id: "c", ts: Date.now() - 120_000 },
    ]);
    check("đếm join trong 60s → 2", state.recentJoinCount("g4", 60_000) === 2);
    check("guild chưa có → 0", state.recentJoinCount("g-none", 60_000) === 0);
  }

  // ── 6. auditExecutor: target bắt buộc phải khớp chính xác ──
  {
    const g = {
      fetchAuditLogs: async () => ({
        entries: {
          find: (fn) => [{ target: { id: "t1" }, executor: { id: "ex1" } }].find(fn),
          first: () => ({ executor: { id: "ex-fallback" } }),
        },
      }),
    };
    const ex = await state.auditExecutor(g, Symbol("MemberBanAdd"), "t1");
    check("auditExecutor khớp target → trả executor đúng", ex.id === "ex1");

    const fallback = await state.auditExecutor(g, Symbol("MemberBanAdd"));
    check("không có targetId → mới fallback entry đầu", fallback.id === "ex-fallback");

    const ex2 = await state.auditExecutor(g, Symbol("MemberBanAdd"), "khong-co");
    check("có targetId nhưng không khớp → null", ex2 === null);

    const gErr = {
      fetchAuditLogs: async () => {
        throw new Error("thiếu quyền");
      },
    };
    check(
      "auditExecutor lỗi → null (không crash)",
      (await state.auditExecutor(gErr, 1, "x")) === null,
    );
    const noMatch = await state.auditLookup(g, 1, "khong-co");
    const lookupError = await state.auditLookup(gErr, 1, "x");
    check(
      "auditLookup phân biệt miss và lỗi audit",
      noMatch.ok && !noMatch.found && !noMatch.ambiguous && lookupError.ok === false,
    );
    const crowded = {
      fetchAuditLogs: async () => ({
        entries: Array.from({ length: 50 }, (_, i) => ({ target: { id: `other-${i}` } })),
      }),
    };
    const crowdedMiss = await state.auditLookup(crowded, 1, "target-bi-an");
    check(
      "audit đầy cửa sổ mà chưa thấy target → ambiguous, không kết luận tự rời",
      crowdedMiss.ok && !crowdedMiss.found && crowdedMiss.ambiguous,
    );
  }

  // ── 7. webhookCreator ──
  {
    const g = {
      fetchAuditLogs: async () => ({
        entries: {
          find: (fn) => [{ target: { id: "wh1" }, executor: { id: "creator-1" } }].find(fn),
        },
      }),
    };
    const c = await state.webhookCreator(g, "wh1");
    check("webhookCreator khớp webhook → executor", c.id === "creator-1");
    const c2 = await state.webhookCreator(g, "wh-x");
    check("webhookCreator không khớp → null", c2 === null);
    const gErr = {
      fetchAuditLogs: async () => {
        throw new Error("boom");
      },
    };
    check("webhookCreator lỗi → null", (await state.webhookCreator(gErr, "x")) === null);
  }

  // ── 8. recordEvent: ghi Convex, nuốt lỗi ──
  {
    mutations.length = 0;
    await state.recordEvent("g9", { module: "massJoin", action: "test" });
    check(
      "recordEvent ghi mutation botRecordAntinukeEvent",
      mutations.length === 1 &&
        mutations[0].name === "bot_writes:botRecordAntinukeEvent" &&
        mutations[0].args.guildId === "g9",
    );
    mutationShouldThrow = true;
    await state.recordEvent("g9", { module: "x" });
    check("recordEvent lỗi mạng → nuốt, không crash", true);
    mutationShouldThrow = false;
  }

  // ── 9. sweepMemory: xóa guild đã rời + entry cũ của guild sống ──
  {
    guilds.clear();
    guilds.set("live", {});
    const now = Date.now();
    const S = state.state;

    S.buckets.clear();
    S.buckets.set("live:massJoin", [now]);
    S.buckets.set("dead:massJoin", [now]);

    S.joiners.clear();
    S.joiners.set("live", [{ id: "a", ts: now }]);
    S.joiners.set("live-old", []); // dead guild
    S.joiners.set("live2", [{ id: "b", ts: now - 700_000 }]); // toàn bộ stale
    guilds.set("live2", {});

    S.botAddTimes.clear();
    S.botAddTimes.set("live:bot1", now - 1_000_000); // > 15 phút
    S.botAddTimes.set("live:bot2", now - 1_000);

    S.spamBuckets.clear();
    S.spamBuckets.set("live:u1", [now - 700_000]); // stale → xóa
    S.spamBuckets.set("live:u2", [now]);
    S.spamBuckets.set("dead:u3", [now]);

    S.patternBuckets.clear();
    S.patternBuckets.set("live:u1:long", [now - 700_000]);
    S.patternBuckets.set("live:u2:long", [now]);

    S.recentMessages.clear();
    S.recentMessages.set("live:u1", [{ content: "x", ts: now - 120_000 }]);
    S.recentMessages.set("live:u2", [{ content: "y", ts: now }]);

    S.appEvents.clear();
    S.appEvents.set("live", [{ ts: now - 700_000 }]);
    S.appEvents.set("dead", [{ ts: now }]);

    S.appMsgSamples.clear();
    S.appMsgSamples.set("live:app1", [{ ts: now }]);

    S.buttonClickEvents.clear();
    S.buttonClickEvents.set("live:m1", {
      appId: "a",
      clicks: [{ userId: "u", ts: now - 700_000 }],
    });
    S.buttonClickEvents.set("live:m2", { appId: "a", clicks: [{ userId: "u", ts: now }] });

    S.lastConfigs.clear();
    S.lastConfigs.set("live", {});
    S.lastConfigs.set("dead", {});

    S.appUserHandledAt.clear();
    S.appUserHandledAt.set("live:u1", now);
    S.appUserHandledAt.set("live:u2", now - 700_000);

    S.lastExtAppProcessedAt.clear();
    S.lastExtAppProcessedAt.set("live", now);
    S.lastExtAppProcessedAt.set("dead", now);

    S.buttonRaidHandledAt.clear();
    S.buttonRaidHandledAt.set("live:m1", now);
    S.buttonRaidHandledAt.set("dead:m2", now);

    state.sweepMemory();

    check("sweep xóa bucket của guild đã rời", !S.buckets.has("dead:massJoin"));
    check("sweep giữ bucket guild đang sống", S.buckets.has("live:massJoin"));
    check("sweep xóa joiners guild đã rời", !S.joiners.has("live-old"));
    check("sweep xóa joiners toàn stale", !S.joiners.has("live2"));
    check("sweep xóa botAddTimes quá 15 phút", !S.botAddTimes.has("live:bot1"));
    check("sweep giữ botAddTimes mới", S.botAddTimes.has("live:bot2"));
    check("sweep xóa spamBuckets stale", !S.spamBuckets.has("live:u1"));
    check("sweep xóa spamBuckets guild chết", !S.spamBuckets.has("dead:u3"));
    check("sweep xóa patternBuckets stale", !S.patternBuckets.has("live:u1:long"));
    check("sweep xóa recentMessages quá 60s", !S.recentMessages.has("live:u1"));
    check("sweep xóa appEvents stale", !S.appEvents.has("live"));
    check("sweep xóa appMsgSamples guild chết", S.appMsgSamples.has("live:app1"));
    check("sweep xóa buttonClickEvents toàn stale", !S.buttonClickEvents.has("live:m1"));
    check("sweep xóa lastConfigs guild chết", !S.lastConfigs.has("dead"));
    check("sweep xóa appUserHandledAt stale", !S.appUserHandledAt.has("live:u2"));
    check("sweep giữ appUserHandledAt mới", S.appUserHandledAt.has("live:u1"));
    check("sweep xóa lastExtAppProcessedAt guild chết", !S.lastExtAppProcessedAt.has("dead"));
    check("sweep xóa buttonRaidHandledAt guild chết", !S.buttonRaidHandledAt.has("dead:m2"));
  }

  // ── 9b. sweepMemory: entry exempt (owner/admin/whitelist) — hồi quy TDZ ──
  {
    // Hồi quy (28/09): `const stale` khai báo SAU vòng exemptBuckets → lần quét đầu
    // tiên có entry exempt của guild sống ném ReferenceError (TDZ), sập bot qua
    // uncaughtException. Phần §9 trên không bao giờ gieo exemptBuckets nên không bắt.
    guilds.clear();
    guilds.set("live", {});
    const S = state.state;
    const now = Date.now();
    S.exemptBuckets.clear();
    S.exemptBuckets.set("live:antiBan:owner1", [now]); // còn mới → giữ
    S.exemptBuckets.set("live:antiBan:admin2", [now - 700_000]); // stale → xoá
    S.exemptBuckets.set("dead:antiBan:owner3", [now]); // guild đã rời → xoá
    let threw = null;
    try {
      state.sweepMemory();
    } catch (e) {
      threw = e;
    }
    check(
      "sweepMemory KHÔNG ném khi có entry exempt của guild sống",
      threw === null,
      threw && threw.message,
    );
    check("exempt còn mới của guild sống được giữ", S.exemptBuckets.has("live:antiBan:owner1"));
    check("exempt stale (>10 phút) bị xoá", !S.exemptBuckets.has("live:antiBan:admin2"));
    check("exempt của guild đã rời bị xoá", !S.exemptBuckets.has("dead:antiBan:owner3"));
    // Đường thật: recordExempt gieo entry, rồi sweep không ném.
    S.exemptBuckets.clear();
    state.recordExempt("live", "antiBan", { windowSeconds: 10 }, "owner9");
    let threw2 = null;
    try {
      state.sweepMemory();
    } catch (e) {
      threw2 = e;
    }
    check("sweep sau recordExempt thật không ném", threw2 === null, threw2 && threw2.message);
    check("entry vừa ghi bởi recordExempt vẫn còn", S.exemptBuckets.has("live:antiBan:owner9"));
    S.exemptBuckets.clear();
  }

  // ── 10. sweepMemory cap BUCKET_MAX ──
  {
    guilds.clear();
    guilds.set("live", {});
    const S = state.state;
    S.buckets.clear();
    for (let i = 0; i < BUCKET_MAX + 50; i++) S.buckets.set(`live:m${i}`, [Date.now()]);
    state.sweepMemory();
    check(`buckets vượt ${BUCKET_MAX} → cắt về sàn`, S.buckets.size === BUCKET_MAX);
  }

  // ── 11. moduleCfgOf: module CHƯA có dòng → TẮT (fail-open) ───────────────
  // Bug 28/09/2026: fallback từng trả `enabled: true` + punish mặc định (ban).
  // Cache config giữ 30 phút và seed chạy muộn/lỗi → module chưa bật phạt thật
  // người vô tội. Thiếu cấu hình thì phải im; ngưỡng vẫn trả về cho web hiển thị.
  {
    const { moduleCfgOf } = require("../bot/src/handlers/antinuke/shared");
    const missing = moduleCfgOf({ modules: [] }, "massRoleEdit");
    check(
      "module chưa có dòng antinukeModules → enabled=false (không tự phạt)",
      !!missing && missing.enabled === false,
    );
    check(
      "vẫn trả ngưỡng mặc định để web hiển thị/đề xuất",
      !!missing &&
        missing.threshold === 3 &&
        missing.windowSeconds === 10 &&
        missing.punish === "ban",
    );
    const seeded = moduleCfgOf(
      { modules: [{ module: "massRoleEdit", enabled: true, threshold: 7, windowSeconds: 30 }] },
      "massRoleEdit",
    );
    check(
      "đã có dòng → trả nguyên cấu hình của chủ (không ghi đè)",
      !!seeded && seeded.enabled === true && seeded.threshold === 7 && seeded.windowSeconds === 30,
    );
    check(
      "module cố ý không có fallback (botHitAndRun) → null, handler tự bỏ qua",
      moduleCfgOf({ modules: [] }, "botHitAndRun") === null,
    );
    check(
      "config rỗng / không có mảng modules → vẫn fail-open, không ném lỗi",
      moduleCfgOf({}, "externalAppRaid")?.enabled === false,
    );
  }

  fs.unlinkSync(DJS_MOCK);
  console.log(`\nKết quả antinuke state: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
