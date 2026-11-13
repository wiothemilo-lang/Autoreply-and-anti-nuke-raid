// TEST: convex/verify.ts — luồng xác minh web từ đầu đến cuối (mock ctx trong RAM).
// Chạy: bun scripts/test-verify-flow.ts
//
// VÌ SAO CẦN: đây là nơi DUY NHẤT biến tín hiệu trình duyệt thành quyết định
// cấp quyền / ban. Bốn bất biến phải khoá được ở đây, không phải ở UI:
//   1. Token chỉ lưu BĂM — DB bị lộ không dùng lại được link.
//   2. Link cũ bị vô hiệu khi tạo phiên mới (một link một lần, không song song).
//   3. IP ban + IP dùng chung → CHỈ từ chối, KHÔNG ban (chống ban oan CGNAT).
//   4. Bot claim grant đúng MỘT lần (deploy 2 tiến trình không cấp role 2 lần).
import {
  botClaimGrant,
  botCreateSession,
  botFinishGrant,
  botPendingGrants,
  botRunRetention,
  deleteUserVerifyData,
  finalize,
  getSession,
  listLinks,
  listSessions,
  markServed,
} from "../convex/verify";
import { complete as completeAction } from "../convex/verifyActions";
import { authorize as preflightAuthorize } from "../convex/verifyPreflightData";
import { ipapiLooksValid } from "../convex/verifyPreflight";
import { createIpBan, ipBanSummary, listIpBans } from "../convex/verifyBans";
import { effectiveVerifyMethod, effectiveVerifyWebEnabled } from "../convex/ipCollectionLock";
import { computeBotKey } from "../convex/botAuth";
import {
  VERIFY_CONSENT_VERSION,
  hashVerifyToken,
  ipHash,
  signalHash,
} from "../convex/verifyCrypto";

const BOT_KEY = "khoa-bot-cho-test-verify";
const SECRET = "secret-test-verify";
const GUILD = "123456789012345678";
const USER_A = "223456789012345678";
const USER_B = "323456789012345678";

type Row = Record<string, any>;

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "PASS" : "FAIL"} ${label}${ok || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`,
  );
  ok ? pass++ : fail++;
};

const typeRank = (x: unknown) => (x === undefined ? 0 : x === null ? 1 : 2);
const convexCmp = (a: unknown, b: unknown) =>
  typeRank(a) - typeRank(b) || (typeRank(a) === 2 ? (a as number) - (b as number) : 0);

/**
 * Ctx giả tối thiểu: `eq` theo index, `lt/lte/gt`, `order("desc")` trên field
 * cuối của index, `filter(q.eq(q.field(f), v))`, `take/collect/first`.
 *
 * Đủ để chạy ĐÚNG thân handler thật — không chép lại logic vào test.
 */
function makeCtx(guildOverrides: Row = {}) {
  const tables: Record<string, Row[]> = {
    guilds: [{ _id: "g1", discordId: GUILD, name: "Server Test", ...guildOverrides }],
    users: [],
    sessions: [],
    botStatus: [{ _id: "st1", kind: "status", botKeySeed: computeBotKey(BOT_KEY) }],
    verifySessions: [],
    verifySignals: [],
    verifyLinks: [],
    verifyAudit: [],
    ipBans: [],
    ipIntelCache: [],
    guildBans: [],
    memberJoins: [],
    modActions: [],
    antinukeEvents: [],
    raidSamples: [],
    tickets: [],
    feedback: [],
  };
  let seq = 0;
  const all = () => Object.values(tables).flat();
  const deletedStorage: string[] = [];
  const ctx: any = {
    storage: {
      delete: async (id: string) => {
        deletedStorage.push(id);
      },
    },
    db: {
      insert: async (table: string, doc: Row) => {
        const id = `${table}-${++seq}`;
        (tables[table] ??= []).push({ _id: id, _creationTime: seq, ...doc });
        return id;
      },
      get: async (id: string) => all().find((r) => r._id === id) ?? null,
      patch: async (id: string, p: Row) => {
        const row = all().find((r) => r._id === id);
        if (row) Object.assign(row, p);
      },
      delete: async (id: string) => {
        for (const rows of Object.values(tables)) {
          const i = rows.findIndex((r) => r._id === id);
          if (i >= 0) rows.splice(i, 1);
        }
      },
      query: (table: string) => {
        const build = (name: string, bound?: (q: any) => any) => {
          const eqs: Record<string, unknown> = {};
          const ranges: Array<["lt" | "lte" | "gt", string, unknown]> = [];
          const filters: Array<[string, unknown]> = [];
          const q: any = {
            eq: (f: string, v: unknown) => ((eqs[f] = v), q),
            lt: (f: string, v: unknown) => (ranges.push(["lt", f, v]), q),
            lte: (f: string, v: unknown) => (ranges.push(["lte", f, v]), q),
            gt: (f: string, v: unknown) => (ranges.push(["gt", f, v]), q),
          };
          bound?.(q);
          // Field cuối của index = field sắp xếp (Convex order theo field cuối).
          const orderField = name.split("_").pop() as string;
          let rows = (tables[table] ?? []).filter(
            (r) =>
              Object.entries(eqs).every(([f, v]) => r[f] === v) &&
              ranges.every(([op, f, v]) =>
                // Convex KHÔNG đưa document thiếu field vào index, nên một
                // range trên field optional không bao giờ khớp hàng undefined.
                r[f] === undefined
                  ? false
                  : op === "lt"
                    ? convexCmp(r[f], v) < 0
                    : op === "lte"
                      ? convexCmp(r[f], v) <= 0
                      : convexCmp(r[f], v) > 0,
              ) &&
              filters.every(([f, v]) => r[f] === v),
          );
          return {
            order: (dir: "asc" | "desc") => {
              rows = [...rows].sort(
                (a, b) => convexCmp(a[orderField], b[orderField]) * (dir === "desc" ? -1 : 1),
              );
              return api();
            },
            filter: (fn: (q: any) => any) => {
              const fq: any = {
                field: (f: string) => f,
                eq: (f: string, v: unknown) => {
                  filters.push([f, v]);
                  return true;
                },
              };
              fn(fq);
              rows = rows.filter((r) => filters.every(([f, v]) => r[f] === v));
              return api();
            },
            first: async () => rows[0] ?? null,
            collect: async () => [...rows],
            take: async (n: number) => rows.slice(0, n),
          };
          function api() {
            return {
              order: (dir: "asc" | "desc") => {
                rows = [...rows].sort(
                  (a, b) => convexCmp(a[orderField], b[orderField]) * (dir === "desc" ? -1 : 1),
                );
                return api();
              },
              filter: (fn: (q: any) => any) => {
                const fq: any = {
                  field: (f: string) => f,
                  eq: (f: string, v: unknown) => {
                    filters.push([f, v]);
                    return true;
                  },
                };
                fn(fq);
                rows = rows.filter((r) => filters.every(([f, v]) => r[f] === v));
                return api();
              },
              first: async () => rows[0] ?? null,
              collect: async () => [...rows],
              take: async (n: number) => rows.slice(0, n),
            };
          }
        };
        return {
          withIndex: (name: string, bound?: (q: any) => any) => build(name, bound),
        };
      },
    },
  };
  return { ctx, tables, deletedStorage };
}

const createH = (botCreateSession as any)._handler;
const finalizeH = (finalize as any)._handler;
const markServedH = (markServed as any)._handler;
const getSessionH = (getSession as any)._handler;
const claimH = (botClaimGrant as any)._handler;
const finishH = (botFinishGrant as any)._handler;
const pendingH = (botPendingGrants as any)._handler;
const linksH = (listLinks as any)._handler;
const sessionsH = (listSessions as any)._handler;
const deleteH = (deleteUserVerifyData as any)._handler;
const retentionH = (botRunRetention as any)._handler;
const completeH = (completeAction as any)._handler;
const preflightH = (preflightAuthorize as any)._handler;
const bansH = (listIpBans as any)._handler;
const banSummaryH = (ipBanSummary as any)._handler;
const createBanH = (createIpBan as any)._handler;

const DASH_TOKEN = "dashboard-token-test";

/** Dựng user + phiên dashboard hợp lệ để test các query cần quyền. */
function login(tables: Record<string, Row[]>, opts: { id?: string; guildIds?: string[] } = {}) {
  const id = opts.id ?? "user-dash";
  const token = id === "user-dash" ? DASH_TOKEN : `token-${id}`;
  tables.users.push({
    _id: id,
    discordId: id === "user-dash" ? "999999999999999999" : "888888888888888888",
    manageableGuildIds: opts.guildIds ?? [GUILD],
  });
  tables.sessions.push({
    _id: `sess-${id}`,
    token,
    userId: id,
    createdAt: Date.now(),
    authVersion: 1,
  });
  return token;
}

/** Tạo phiên rồi trả token thô (chỉ test mới có token thô). */
async function newSession(ctx: any, userId = USER_A, privileged = false) {
  return await createH(ctx, { guildId: GUILD, userId, privileged, botKey: BOT_KEY });
}

/** Băm bộ tín hiệu giả cho một "thiết bị". */
function signalsFor(ip: string, fp: string, cookie: string, ua = "UA-Test") {
  return {
    ipHash: ipHash(SECRET, GUILD, ip),
    fingerprintHash: signalHash(SECRET, "fp", fp),
    cookieHash: signalHash(SECRET, "cookie", cookie),
    uaHash: signalHash(SECRET, "ua", ua),
  };
}

async function runFinalize(ctx: any, token: string, signals: Row, extra: Row = {}) {
  // Trang verify luôn gọi markServed lúc mở; test mô phỏng người dùng đã ở
  // trang >1,5s bằng cách đẩy mốc về quá khứ (server đọc `session.servedAt`).
  await markServedH(ctx, { token });
  const session = await ctx.db
    .query("verifySessions")
    .withIndex("by_tokenHash", (q: any) => q.eq("tokenHash", hashVerifyToken(token)))
    .first();
  if (session) await ctx.db.patch(session._id, { servedAt: Date.now() - 5_000 });
  return await finalizeH(ctx, {
    tokenHash: hashVerifyToken(token),
    sharedIp: false,
    human: true,
    ...signals,
    ...extra,
  });
}

// Production đang TẠM KHOÁ thu thập IP (convex/ipCollectionLock.ts). Bộ test này
// kiểm tra toàn bộ luồng verify nên bật cờ test — cùng khuôn với
// `__resetHttpRateGuardForTest`. Cuối bộ test có một mục khoá lại để kiểm chính hàng rào.
(globalThis as { __PROTOGON_IP_COLLECTION_TEST__?: boolean }).__PROTOGON_IP_COLLECTION_TEST__ =
  true;

(async () => {
  // ═══ 1. Token chỉ lưu băm ═══
  console.log("\n── botCreateSession: token thô không nằm trong DB ──");
  {
    const { ctx, tables } = makeCtx({ verifyWebEnabled: true });
    const { token } = await newSession(ctx);
    check("trả token 43 ký tự", typeof token === "string" && token.length === 43);
    check(
      "DB chỉ có hash, KHÔNG có token thô",
      tables.verifySessions.length === 1 &&
        tables.verifySessions[0].tokenHash === hashVerifyToken(token) &&
        !JSON.stringify(tables.verifySessions[0]).includes(token),
    );
    check("phiên mới ở trạng thái pending", tables.verifySessions[0].status === "pending");
    check(
      "hạn 10 phút",
      tables.verifySessions[0].expiresAt - tables.verifySessions[0].createdAt === 10 * 60_000,
    );
  }

  // ═══ 2. Tạo phiên mới vô hiệu link cũ ═══
  console.log("\n── botCreateSession: link cũ bị vô hiệu ──");
  {
    const { ctx, tables } = makeCtx({ verifyWebEnabled: true });
    const first = await newSession(ctx);
    const second = await newSession(ctx);
    const oldRow = tables.verifySessions.find((r) => r.tokenHash === hashVerifyToken(first.token));
    check("phiên cũ chuyển expired", oldRow?.status === "expired", oldRow?.status);
    check(
      "chỉ còn 1 phiên pending",
      tables.verifySessions.filter((r) => r.status === "pending").length === 1,
    );
    check("token hai lần khác nhau", first.token !== second.token);
  }

  // ═══ 3. Chưa bật tính năng → từ chối tạo phiên ═══
  console.log("\n── botCreateSession: server chưa bật verify web ──");
  {
    const { ctx } = makeCtx({ verifyWebEnabled: false });
    let threw = false;
    try {
      await newSession(ctx);
    } catch {
      threw = true;
    }
    check("nép lỗi thay vì tạo phiên chết", threw);
  }

  // ═══ 4. getSession công khai không lộ hash ═══
  console.log("\n── getSession: metadata công khai ──");
  {
    const { ctx } = makeCtx({ verifyWebEnabled: true });
    const { token } = await newSession(ctx);
    const view = await getSessionH(ctx, { token });
    check("trả đúng guild + user", view?.guildId === GUILD && view?.userId === USER_A);
    check(
      "không trả tokenHash/ipHash",
      !("tokenHash" in (view ?? {})) && !("ipHash" in (view ?? {})),
    );
    check("token sai → null", (await getSessionH(ctx, { token: "x".repeat(43) })) === null);
    check("phiên pending chưa có grantState", view?.grantState === null);
  }

  // ═══ 5. Verify sạch → allow + grant pending ═══
  console.log("\n── finalize: tín hiệu sạch ──");
  {
    const { ctx, tables } = makeCtx({ verifyWebEnabled: true, verifiedRoleId: "999" });
    const { token } = await newSession(ctx);
    const res = await runFinalize(ctx, token, signalsFor("203.0.113.5", "fp-a", "ck-a"));
    const row = tables.verifySessions[0];
    check("decision allow", res.ok && res.decision === "allow", res);
    check("status verified", row.status === "verified");
    check("grantPending true cho bot", row.grantPending === true);
    check(
      "getSession báo đang chờ cấp role, KHÔNG phải đã cấp",
      (await getSessionH(ctx, { token }))?.grantState === "pending",
    );
    check("đã ghi ipHash (không phải IP thô)", /^[0-9a-f]{64}$/.test(row.ipHash));
    check(
      "KHÔNG ghi hash IP toàn cục (không nối được dữ liệu xuyên server)",
      !("globalIpHash" in row),
    );
    check(
      "ghi audit",
      tables.verifyAudit.some((r) => r.action === "verify_completed"),
    );
    check("ghi 4 tín hiệu", tables.verifySignals.length === 4, tables.verifySignals.length);
    check("server gán consentVersion", row.consentVersion === VERIFY_CONSENT_VERSION);
    check("server ghi consentAt", typeof row.consentAt === "number");
  }

  // ═══ 5b. Consent bắt buộc + kiểm tra TRƯỚC khi đọc DB ═══
  console.log("\n── verifyActions.complete: consent ──");
  {
    let touched = false;
    const fakeCtx = {
      runQuery: async () => {
        touched = true;
        return null;
      },
      runMutation: async () => {
        touched = true;
        return null;
      },
    };
    const res = await completeH(fakeCtx, {
      token: "x".repeat(43),
      ip: "203.0.113.5",
      userAgent: "UA",
      human: true,
      consent: false,
    });
    check(
      "consent=false → consent_required",
      res.ok === false && res.code === "consent_required",
      res,
    );
    check("consent=false → KHÔNG chạm DB", touched === false);
  }

  // ═══ 6. Dùng lại token → used ═══
  console.log("\n── finalize: token dùng một lần ──");
  {
    const { ctx } = makeCtx({ verifyWebEnabled: true });
    const { token } = await newSession(ctx);
    const sig = signalsFor("203.0.113.6", "fp-b", "ck-b");
    await runFinalize(ctx, token, sig);
    const again = await runFinalize(ctx, token, sig);
    check("lần 2 trả used", !again.ok && again.code === "used", again);
  }

  // ═══ 7. Honeypot/bẫy người-thật ═══
  console.log("\n── finalize: human=false ──");
  {
    const { ctx, tables } = makeCtx({ verifyWebEnabled: true });
    const { token } = await newSession(ctx);
    const res = await runFinalize(ctx, token, signalsFor("203.0.113.7", "fp-c", "ck-c"), {
      human: false,
    });
    check("KHÔNG allow dù tín hiệu sạch", res.ok && res.decision === "deny", res);
    check("lý do human_check_failed", tables.verifySessions[0].reason === "human_check_failed");
    check("KHÔNG tự kick vì bẫy người-thật", !tables.verifySessions[0].punish);
    check("vẫn xếp việc để bot đóng phiên", tables.verifySessions[0].grantPending === true);
  }

  // ═══ 7b. Dwell do SERVER quyết định (không tin body.human) ═══
  console.log("\n── finalize: dwell server-side ──");
  {
    const { ctx, tables } = makeCtx({ verifyWebEnabled: true });
    const { token } = await newSession(ctx);
    const res = await finalizeH(ctx, {
      tokenHash: hashVerifyToken(token),
      sharedIp: false,
      human: true,
      ...signalsFor("203.0.113.70", "fp-dwell-a", "ck-dwell-a"),
    });
    check(
      "chưa mở trang (không có servedAt) → KHÔNG allow",
      res.ok && res.decision === "deny",
      res,
    );
    check(
      "lý do human_check_failed khi thiếu servedAt",
      tables.verifySessions[0].reason === "human_check_failed",
    );
  }
  {
    const { ctx, tables } = makeCtx({ verifyWebEnabled: true });
    const { token } = await newSession(ctx);
    await markServedH(ctx, { token });
    const firstServedAt = tables.verifySessions[0].servedAt;
    await markServedH(ctx, { token });
    check(
      "markServed lần 2 KHÔNG đẩy mốc về hiện tại",
      tables.verifySessions[0].servedAt === firstServedAt,
    );
    const res = await finalizeH(ctx, {
      tokenHash: hashVerifyToken(token),
      sharedIp: false,
      human: true,
      ...signalsFor("203.0.113.71", "fp-dwell-b", "ck-dwell-b"),
    });
    check("mở trang rồi gửi ngay (<1,5s) → KHÔNG allow", res.ok && res.decision === "deny", res);
  }

  // ═══ 8. IP ban + action ban → ban ═══
  console.log("\n── finalize: IP ban, action=ban ──");
  {
    const { ctx, tables } = makeCtx({ verifyWebEnabled: true, ipBanAction: "ban" });
    const sig = signalsFor("198.51.100.9", "fp-d", "ck-d");
    await ctx.db.insert("ipBans", {
      guildId: GUILD,
      ipHash: sig.ipHash,
      scope: "ip",
      reason: "test",
      createdBy: "admin",
      createdAt: Date.now(),
      expiresAt: Date.now() + 86_400_000,
      active: true,
    });
    const { token } = await newSession(ctx);
    const res = await runFinalize(ctx, token, sig);
    check("decision ban", res.ok && res.decision === "ban", res);
    check("status banned", tables.verifySessions[0].status === "banned");
  }

  // ═══ 9. IP ban + IP dùng chung → CHỈ từ chối ═══
  console.log("\n── finalize: IP ban trên CGNAT ──");
  {
    const { ctx, tables } = makeCtx({ verifyWebEnabled: true, ipBanAction: "ban" });
    const sig = signalsFor("100.64.0.7", "fp-e", "ck-e");
    await ctx.db.insert("ipBans", {
      guildId: GUILD,
      ipHash: sig.ipHash,
      scope: "ip",
      reason: "test",
      createdBy: "admin",
      createdAt: Date.now(),
      expiresAt: Date.now() + 86_400_000,
      active: true,
    });
    const { token } = await newSession(ctx);
    const res = await runFinalize(ctx, token, sig, { sharedIp: true });
    check("decision deny (KHÔNG ban)", res.ok && res.decision === "deny", res);
    check("status denied", tables.verifySessions[0].status === "denied");
    check("CGNAT chỉ từ chối, KHÔNG kick", !tables.verifySessions[0].punish);
  }

  // ═══ 10. Ban evasion: trùng fingerprint với account đã bị ban ═══
  console.log("\n── finalize: ban evasion qua fingerprint ──");
  {
    const { ctx, tables } = makeCtx({ verifyWebEnabled: true, altPunish: "ban" });
    // USER_B verify trước (tạo tín hiệu), rồi bị ban.
    const bSession = await newSession(ctx, USER_B);
    await runFinalize(ctx, bSession.token, signalsFor("203.0.113.20", "fp-shared", "ck-b2"));
    await ctx.db.insert("guildBans", {
      guildId: GUILD,
      userId: USER_B,
      active: true,
      bannedAt: Date.now(),
      syncedAt: Date.now(),
      source: "event",
    });
    // USER_A vào từ máy khác nhưng cùng fingerprint.
    const aSession = await newSession(ctx, USER_A);
    const res = await runFinalize(
      ctx,
      aSession.token,
      signalsFor("203.0.113.21", "fp-shared", "ck-a2"),
    );
    check("decision ban", res.ok && res.decision === "ban", res);
    check(
      "ghi linkedUserId = account đã bị ban",
      tables.verifySessions.at(-1).linkedUserId === USER_B,
      tables.verifySessions.at(-1).linkedUserId,
    );
    check(
      "tạo cạnh verifyLinks",
      tables.verifyLinks.some(
        (r) =>
          (r.userId === USER_A && r.linkedUserId === USER_B) ||
          (r.userId === USER_B && r.linkedUserId === USER_A),
      ),
    );
    check(
      "link đủ điểm (fingerprint 70)",
      tables.verifyLinks[0].score >= 70,
      tables.verifyLinks[0]?.score,
    );
  }

  // ═══ 11. Không tự link với chính mình ═══
  console.log("\n── finalize: verify lại không tự gắn cờ ──");
  {
    const { ctx, tables } = makeCtx({ verifyWebEnabled: true });
    const sig = signalsFor("203.0.113.30", "fp-self", "ck-self");
    const first = await newSession(ctx, USER_A);
    await runFinalize(ctx, first.token, sig);
    const second = await newSession(ctx, USER_A);
    const res = await runFinalize(ctx, second.token, sig);
    check("vẫn allow", res.ok && res.decision === "allow", res);
    check("KHÔNG tạo link với chính mình", tables.verifyLinks.length === 0, tables.verifyLinks);
    check(
      "hits tăng trên tín hiệu cũ",
      tables.verifySignals.every((r) => r.hits === 2),
    );
  }

  // ═══ 11b. Không link xuyên guild ═══
  console.log("\n── finalize: cô lập tín hiệu theo guild ──");
  {
    const { ctx, tables } = makeCtx({ verifyWebEnabled: true });
    const otherGuild = "999999999999999999";
    tables.verifySignals.push({
      _id: "sig-other",
      kind: "fingerprint",
      valueHash: signalHash(SECRET, "fp", "fp-cross"),
      userId: USER_B,
      guildId: otherGuild,
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
      hits: 1,
    });
    const { token } = await newSession(ctx, USER_A);
    const res = await runFinalize(ctx, token, signalsFor("203.0.113.50", "fp-cross", "ck-cross"));
    check("vẫn allow", res.ok && res.decision === "allow", res);
    check(
      "KHÔNG gắn linkedUserId từ guild khác",
      tables.verifySessions[0].linkedUserId === undefined,
      tables.verifySessions[0].linkedUserId,
    );
    check("KHÔNG tạo verifyLinks xuyên guild", tables.verifyLinks.length === 0);
  }

  // ═══ 12. Bot claim grant đúng một lần ═══
  console.log("\n── botClaimGrant: fencing ──");
  {
    const { ctx, tables } = makeCtx({ verifyWebEnabled: true });
    const { token } = await newSession(ctx);
    await runFinalize(ctx, token, signalsFor("203.0.113.40", "fp-f", "ck-f"));
    const id = tables.verifySessions[0]._id;
    const pending = await pendingH(ctx, { botKey: BOT_KEY });
    check("botPendingGrants thấy phiên", pending.length === 1 && pending[0].id === id);
    const c1 = await claimH(ctx, { id, botKey: BOT_KEY });
    const c2 = await claimH(ctx, { id, botKey: BOT_KEY });
    check("claim lần 1 ok", c1.ok === true);
    check("claim lần 2 bị từ chối", c2.ok === false);
    await finishH(ctx, { id, applied: true, note: "granted", botKey: BOT_KEY });
    check("finish ghi grantAppliedAt", Boolean(tables.verifySessions[0].grantAppliedAt));
    check(
      "getSession chỉ báo applied sau khi bot xác nhận",
      (await getSessionH(ctx, { token }))?.grantState === "applied",
    );
    check("không còn trong hàng đợi", (await pendingH(ctx, { botKey: BOT_KEY })).length === 0);
  }

  // ═══ 12b. Lỗi cấp role tạm thời → retry, không báo thành công ═══
  console.log("\n── botFinishGrant: lỗi Discord tạm thời ──");
  {
    const { ctx, tables } = makeCtx({ verifyWebEnabled: true, verifiedRoleId: "999" });
    const { token } = await newSession(ctx);
    await runFinalize(ctx, token, signalsFor("203.0.113.41", "fp-g", "ck-g"));
    const id = tables.verifySessions[0]._id;
    await claimH(ctx, { id, botKey: BOT_KEY });
    await finishH(ctx, {
      id,
      applied: false,
      retryable: true,
      note: "role_add_failed",
      botKey: BOT_KEY,
    });
    check(
      "lỗi tạm thời giữ grantPending để thử lại",
      tables.verifySessions[0].grantPending === true,
    );
    check("lỗi tạm thời KHÔNG ghi grantAppliedAt", !tables.verifySessions[0].grantAppliedAt);
    check("lỗi tạm thời chưa đánh dấu hỏng hẳn", !tables.verifySessions[0].grantFailedAt);
    check(
      "getSession vẫn báo đang cấp, không báo lỗi",
      (await getSessionH(ctx, { token }))?.grantState === "pending",
    );
    check(
      "audit ghi retry",
      tables.verifyAudit.some((r) => r.action === "verify_grant_retry"),
    );
  }

  // ═══ 12c. Hết số lần thử → grantFailedAt, không treo vô hạn ═══
  console.log("\n── botFinishGrant: cạn lượt retry ──");
  {
    const { ctx, tables } = makeCtx({ verifyWebEnabled: true, verifiedRoleId: "999" });
    const { token } = await newSession(ctx);
    await runFinalize(ctx, token, signalsFor("203.0.113.42", "fp-h", "ck-h"));
    const id = tables.verifySessions[0]._id;
    for (let i = 0; i < 5; i++) {
      await claimH(ctx, { id, botKey: BOT_KEY });
      await finishH(ctx, {
        id,
        applied: false,
        retryable: true,
        note: "role_add_failed",
        botKey: BOT_KEY,
      });
    }
    check("cạn lượt → đóng hàng chờ", tables.verifySessions[0].grantPending === false);
    check("cạn lượt → ghi grantFailedAt", Boolean(tables.verifySessions[0].grantFailedAt));
    check(
      "getSession báo failed để web không treo",
      (await getSessionH(ctx, { token }))?.grantState === "failed",
    );
  }

  // ═══ 13. Bot key sai → từ chối ═══
  console.log("\n── botKey ──");
  {
    const { ctx } = makeCtx({ verifyWebEnabled: true });
    let threw = false;
    try {
      await createH(ctx, { guildId: GUILD, userId: USER_A, botKey: "sai" });
    } catch {
      threw = true;
    }
    check("botCreateSession từ chối botKey sai", threw);
  }

  // ═══ 13b. listSessions không trả hash đầy đủ ═══
  console.log("\n── listSessions: chỉ trả hash rút gọn + canBanIp ──");
  {
    const { ctx, tables } = makeCtx({ verifyWebEnabled: true });
    login(tables);
    const { token } = await newSession(ctx);
    await runFinalize(ctx, token, signalsFor("203.0.113.70", "fp-list", "ck-list"));
    const rows = await sessionsH(ctx, { token: DASH_TOKEN, guildId: GUILD });
    check("trả 1 phiên", Array.isArray(rows) && rows.length === 1);
    check("canBanIp=true", rows?.[0]?.canBanIp === true);
    check("KHÔNG có ipHash đầy đủ", rows?.[0] && !("ipHash" in rows[0]));
    check("vẫn có ipHashShort", typeof rows?.[0]?.ipHashShort === "string");
  }

  // ═══ 13c. Xoá dữ liệu verify theo thành viên ═══
  console.log("\n── deleteUserVerifyData ──");
  {
    const { ctx, tables } = makeCtx({ verifyWebEnabled: true });
    login(tables);
    const a = await newSession(ctx, USER_A);
    await runFinalize(ctx, a.token, signalsFor("203.0.113.71", "fp-del", "ck-del"));
    const b = await newSession(ctx, USER_B);
    await runFinalize(ctx, b.token, signalsFor("203.0.113.72", "fp-del", "ck-del"));
    await ctx.db.insert("ipBans", {
      guildId: GUILD,
      ipHash: "a".repeat(64),
      scope: "ip",
      reason: "test",
      createdBy: "admin",
      createdAt: Date.now(),
      expiresAt: Date.now() + 86_400_000,
      evidenceUserId: USER_A,
      active: true,
    });
    check("trước khi xoá có link A↔B", tables.verifyLinks.length === 1);

    const res = await deleteH(ctx, { token: DASH_TOKEN, guildId: GUILD, userId: USER_A });
    check("trả ok", res.ok === true, res);
    check("xoá phiên của A", !tables.verifySessions.some((r) => r.userId === USER_A));
    check(
      "giữ phiên của B",
      tables.verifySessions.some((r) => r.userId === USER_B),
    );
    check("xoá signal của A", !tables.verifySignals.some((r) => r.userId === USER_A));
    check(
      "xoá cạnh link liên quan A",
      !tables.verifyLinks.some((r) => r.userId === USER_A || r.linkedUserId === USER_A),
    );
    check(
      "audit cũ của A bị bỏ định danh",
      tables.verifyAudit
        .filter((r) => r.action === "verify_completed")
        .every((r) => r.userId !== USER_A),
    );
    check(
      "ipBan giữ hash nhưng bỏ evidenceUserId",
      tables.ipBans[0].evidenceUserId === undefined &&
        tables.ipBans[0].evidenceSessionId === undefined,
    );
    check(
      "có audit xoá dữ liệu",
      tables.verifyAudit.some((r) => r.action === "verify_user_data_deleted"),
    );
  }

  // ═══ 13d. Retention dọn link/audit/ipBan cũ ═══
  console.log("\n── botRunRetention: dọn bảng chưa có TTL ──");
  {
    const { ctx, tables, deletedStorage } = makeCtx({ verifyWebEnabled: true });
    const old = Date.now() - 800 * 24 * 3600_000;
    tables.verifySessions.push({
      _id: "old-s",
      tokenHash: "x",
      guildId: GUILD,
      userId: USER_A,
      createdAt: old,
      expiresAt: old + 600_000,
      status: "verified",
    });
    tables.verifyLinks.push({
      _id: "old-l",
      guildId: GUILD,
      userId: USER_A,
      linkedUserId: USER_B,
      score: 70,
      reasons: [],
      status: "candidate",
      createdAt: old,
      updatedAt: old,
      lastSignalAt: old,
    });
    tables.verifyAudit.push({
      _id: "old-a",
      guildId: GUILD,
      action: "verify_completed",
      actor: "system",
      createdAt: old,
    });
    tables.ipBans.push({
      _id: "old-b",
      guildId: GUILD,
      ipHash: "b".repeat(64),
      scope: "ip",
      reason: "x",
      createdBy: "admin",
      createdAt: old,
      expiresAt: old,
      active: true,
    });
    tables.ipIntelCache.push({
      _id: "old-i",
      ipHash: "e".repeat(64),
      provider: "ipapi.is",
      isVpn: false,
      checkedAt: old,
      expiresAt: Date.now() - 3600_000,
    });
    // Dữ liệu vận hành từng không có cơ chế dọn — chính sách lại công bố
    // thời hạn. Các hàng dưới phải bị xoá thật, không chỉ nằm trong docs.
    tables.memberJoins.push({
      _id: "old-j",
      guildId: GUILD,
      userId: USER_A,
      username: "nguoi-vao-cu",
      joinedAt: old,
      riskScore: 10,
      riskFactors: [],
    });
    tables.modActions.push({
      _id: "old-m",
      guildId: GUILD,
      action: "ban",
      createdAt: old,
    });
    tables.antinukeEvents.push({
      _id: "old-e",
      guildId: GUILD,
      module: "massBan",
      action: "ban",
      count: 10,
      windowSeconds: 10,
      threshold: 5,
      punish: "ban",
      createdAt: old,
    });
    tables.raidSamples.push({
      _id: "old-r",
      guildId: GUILD,
      module: "spam",
      count: 10,
      windowSeconds: 10,
      threshold: 5,
      createdAt: old,
    });
    tables.tickets.push({
      _id: "old-t",
      guildId: GUILD,
      channelId: "chan-cu",
      kind: "support",
      openerId: USER_A,
      openerName: "nguoi-mo-cu",
      body: "nội dung ticket cũ",
      createdAt: old,
      closedAt: old,
      transcriptStorageId: "storage-cu",
    });
    // Ticket còn mở (không có closedAt) và ticket mới đóng KHÔNG được xoá.
    tables.tickets.push({
      _id: "open-t",
      guildId: GUILD,
      channelId: "chan-mo",
      kind: "support",
      openerId: USER_A,
      openerName: "nguoi-mo",
      body: "đang chờ xử lý",
      createdAt: old,
    });
    tables.tickets.push({
      _id: "new-t",
      guildId: GUILD,
      channelId: "chan-moi",
      kind: "support",
      openerId: USER_A,
      openerName: "nguoi-mo-moi",
      body: "vừa đóng",
      createdAt: Date.now() - 3600_000,
      closedAt: Date.now() - 3600_000,
    });
    tables.sessions.push({
      _id: "old-dash",
      token: "token-cu",
      userId: "u1",
      createdAt: old,
      authVersion: 1,
    });
    tables.feedback.push({
      _id: "old-fb",
      kind: "other",
      message: "góp ý cũ",
      email: "cu@example.com",
      createdAt: old,
    });

    const res = await retentionH(ctx, { botKey: BOT_KEY });
    check("xoá phiên quá hạn 7 ngày", !tables.verifySessions.some((r) => r._id === "old-s"));
    check("xoá link quá 180 ngày", !tables.verifyLinks.some((r) => r._id === "old-l"));
    check("xoá audit quá 365 ngày", !tables.verifyAudit.some((r) => r._id === "old-a"));
    check("xoá ipBan hết hạn quá 90 ngày", !tables.ipBans.some((r) => r._id === "old-b"));
    check(
      "xoá cache ipapi.is NGAY khi hết hạn",
      !tables.ipIntelCache.some((r) => r._id === "old-i"),
    );
    check("xoá lượt join quá 90 ngày", !tables.memberJoins.some((r) => r._id === "old-j"));
    check("xoá hình phạt quá 365 ngày", !tables.modActions.some((r) => r._id === "old-m"));
    check(
      "xoá sự kiện antinuke quá 365 ngày",
      !tables.antinukeEvents.some((r) => r._id === "old-e"),
    );
    check("xoá mẫu raid quá 180 ngày", !tables.raidSamples.some((r) => r._id === "old-r"));
    check("xoá ticket đóng quá 180 ngày", !tables.tickets.some((r) => r._id === "old-t"));
    check("xoá file transcript trước khi xoá hàng ticket", deletedStorage.includes("storage-cu"));
    check(
      "GIỮ ticket còn mở",
      tables.tickets.some((r) => r._id === "open-t"),
    );
    check(
      "GIỮ ticket mới đóng",
      tables.tickets.some((r) => r._id === "new-t"),
    );
    check("xoá phiên dashboard quá 30 ngày", !tables.sessions.some((r) => r._id === "old-dash"));
    check("xoá góp ý quá 365 ngày", !tables.feedback.some((r) => r._id === "old-fb"));
    check("trả số đã xoá", res.deleted >= 12, res.deleted);
  }

  // ═══ 13e. Self-test đọc đúng cấu hình, không lộ secret ═══
  console.log("\n── verifyPreflightData.authorize ──");
  {
    const { ctx, tables } = makeCtx({
      verifyEnabled: true,
      verifyWebEnabled: true,
      verifyMethod: "web",
      verifyChannelId: "111",
      unverifiedRoleId: "222",
      verifiedRoleId: "333",
    });
    login(tables);
    tables.botStatus[0].online = true;
    tables.botStatus[0].lastHeartbeat = Date.now();
    const res = await preflightH(ctx, { token: DASH_TOKEN, guildId: GUILD });
    check("authorize ok", res.ok === true, res);
    check(
      "trả đủ cấu hình guild",
      res.ok && res.guild.verifyMethod === "web" && res.guild.unverifiedRoleId === "222",
    );
    check("trả bot online", res.ok && res.bot.online === true);
    check("không trả secret", res.ok && !JSON.stringify(res).toLowerCase().includes("secret"));
    const denied = await preflightH(ctx, { token: "sai", guildId: GUILD });
    check("token sai → unauthenticated", denied.ok === false && denied.code === "unauthenticated");
  }

  // ═══ 13f. ipapi.is: 200 OK nhưng sai hình dạng phải bị coi là lỗi ═══
  console.log("\n── verifyPreflight.ipapiLooksValid ──");
  {
    check("có ip → hợp lệ", ipapiLooksValid({ ip: "1.1.1.1" }) === true);
    check("có is_vpn → hợp lệ", ipapiLooksValid({ is_vpn: false }) === true);
    check("có asn object → hợp lệ", ipapiLooksValid({ asn: { asn: 13335 } }) === true);
    check(
      "object lỗi khóa sai → KHÔNG hợp lệ",
      ipapiLooksValid({ error: "invalid key" }) === false,
    );
    check("null → KHÔNG hợp lệ", ipapiLooksValid(null) === false);
    check("ip sai kiểu → KHÔNG hợp lệ", ipapiLooksValid({ ip: 123 }) === false);
    check("chuỗi → KHÔNG hợp lệ", ipapiLooksValid("ok") === false);
  }

  // ═══ 14. Dashboard links chỉ đọc khi có quyền ═══
  console.log("\n── listLinks: quyền ──");
  {
    const { ctx } = makeCtx({ verifyWebEnabled: true });
    const denied = await linksH(ctx, { token: "khong-co-phien", guildId: GUILD });
    check("không đăng nhập → null", denied === null);
  }

  // ═══ 15. Chỉ admin của CHÍNH server đó đọc được dữ liệu IP/PII ═══
  console.log("\n── phân quyền dữ liệu verify (IP hash, userId) ──");
  {
    const OTHER_GUILD = "987654321098765432";
    const { ctx, tables } = makeCtx({ verifyWebEnabled: true });
    login(tables);
    tables.guilds.push({
      _id: "g2",
      discordId: OTHER_GUILD,
      name: "Server Khác",
      managers: [],
    });
    // Người đã đăng nhập nhưng không có Manage Server ở đâu cả.
    const plainToken = login(tables, { id: "user-plain", guildIds: [] });

    const { token } = await newSession(ctx, USER_A);
    await runFinalize(ctx, token, signalsFor("203.0.113.80", "fp-acl", "ck-acl"));
    tables.verifyLinks.push({
      _id: "link-g1",
      guildId: GUILD,
      userId: USER_A,
      linkedUserId: USER_B,
      score: 70,
      reasons: [],
      status: "candidate",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastSignalAt: Date.now(),
    });
    tables.verifyLinks.push({
      _id: "link-g2",
      guildId: OTHER_GUILD,
      userId: USER_A,
      linkedUserId: USER_B,
      score: 70,
      reasons: [],
      status: "candidate",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastSignalAt: Date.now(),
    });
    tables.ipBans.push({
      _id: "ban-g1",
      guildId: GUILD,
      ipHash: "c".repeat(64),
      scope: "ip",
      reason: "test",
      createdBy: "admin",
      createdAt: Date.now(),
      expiresAt: Date.now() + 86_400_000,
      evidenceUserId: USER_A,
      active: true,
    });
    tables.ipBans.push({
      _id: "ban-g2",
      guildId: OTHER_GUILD,
      ipHash: "d".repeat(64),
      scope: "ip",
      reason: "test",
      createdBy: "admin",
      createdAt: Date.now(),
      expiresAt: Date.now() + 86_400_000,
      active: true,
    });
    tables.verifySessions.push({
      _id: "sess-other-guild",
      tokenHash: "y".repeat(64),
      guildId: OTHER_GUILD,
      userId: USER_B,
      createdAt: Date.now(),
      expiresAt: Date.now() + 600_000,
      status: "verified",
      ipHash: "e".repeat(64),
    });

    // (a) Người thường đã đăng nhập: không đọc/xoá được gì.
    check(
      "non-admin: listSessions → null",
      (await sessionsH(ctx, { token: plainToken, guildId: GUILD })) === null,
    );
    check(
      "non-admin: listLinks → null",
      (await linksH(ctx, { token: plainToken, guildId: GUILD })) === null,
    );
    check(
      "non-admin: listIpBans → null",
      (await bansH(ctx, { token: plainToken, guildId: GUILD })) === null,
    );
    check(
      "non-admin: ipBanSummary → null",
      (await banSummaryH(ctx, { token: plainToken, guildId: GUILD })) === null,
    );
    let deniedDelete = false;
    try {
      await deleteH(ctx, { token: plainToken, guildId: GUILD, userId: USER_A });
    } catch {
      deniedDelete = true;
    }
    check("non-admin: deleteUserVerifyData bị chặn", deniedDelete);

    // (b) Admin guild A KHÔNG đọc/xoá được dữ liệu guild B (IDOR).
    check(
      "admin A: listSessions guild B → null",
      (await sessionsH(ctx, { token: DASH_TOKEN, guildId: OTHER_GUILD })) === null,
    );
    check(
      "admin A: listLinks guild B → null",
      (await linksH(ctx, { token: DASH_TOKEN, guildId: OTHER_GUILD })) === null,
    );
    check(
      "admin A: listIpBans guild B → null",
      (await bansH(ctx, { token: DASH_TOKEN, guildId: OTHER_GUILD })) === null,
    );
    let deniedCrossDelete = false;
    try {
      await deleteH(ctx, { token: DASH_TOKEN, guildId: OTHER_GUILD, userId: USER_A });
    } catch {
      deniedCrossDelete = true;
    }
    check("admin A: xoá dữ liệu guild B bị chặn", deniedCrossDelete);

    // (c) Không được ban bằng phiên của guild khác.
    let deniedCrossBan = false;
    try {
      await createBanH(ctx, {
        token: DASH_TOKEN,
        guildId: GUILD,
        sessionId: "sess-other-guild",
      });
    } catch {
      deniedCrossBan = true;
    }
    check("admin A: ban bằng session guild B bị chặn", deniedCrossBan);

    // (d) Admin guild A chỉ thấy dữ liệu guild A, và payload đã tối giản.
    const mine = await bansH(ctx, { token: DASH_TOKEN, guildId: GUILD });
    check("admin A: chỉ thấy ban của guild A", Array.isArray(mine) && mine.length === 1);
    check("admin A: KHÔNG nhận ipHash đầy đủ", mine?.[0] && !("ipHash" in mine[0]));
    check("admin A: KHÔNG nhận evidenceUserId", mine?.[0] && !("evidenceUserId" in mine[0]));
    check("admin A: vẫn có ipHashShort", typeof mine?.[0]?.ipHashShort === "string");
    const summary = await banSummaryH(ctx, { token: DASH_TOKEN, guildId: GUILD });
    check("admin A: summary chỉ đếm guild A", summary?.active === 1, summary);
  }

  // ═══ 16. Tạm khoá thu thập IP: hàng rào phải đóng ở tầng hàm ═══
  console.log("\n── tạm khoá IP: botCreateSession từ chối ──");
  {
    const { ctx } = makeCtx({ verifyWebEnabled: true });
    (globalThis as { __PROTOGON_IP_COLLECTION_TEST__?: boolean }).__PROTOGON_IP_COLLECTION_TEST__ =
      false;
    let locked = false;
    try {
      await newSession(ctx);
    } catch (e: any) {
      locked = /tạm khoá/.test(String(e?.message ?? ""));
    }
    check("khoá → method web hạ về button", effectiveVerifyMethod("web") === "button");
    check("khoá → cờ verifyWebEnabled luôn false", effectiveVerifyWebEnabled(true) === false);
    (globalThis as { __PROTOGON_IP_COLLECTION_TEST__?: boolean }).__PROTOGON_IP_COLLECTION_TEST__ =
      true;
    check("khoá → botCreateSession ném lỗi có lý do", locked);
  }

  console.log(`\n${pass}/${pass + fail} assertion xanh`);
  if (fail > 0) process.exit(1);
})();
