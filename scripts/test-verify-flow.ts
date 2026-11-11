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
  finalize,
  getSession,
  listLinks,
} from "../convex/verify";
import { computeBotKey } from "../convex/botAuth";
import { hashVerifyToken, ipHash, globalIpHash, signalHash } from "../convex/verifyCrypto";

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
  };
  let seq = 0;
  const all = () => Object.values(tables).flat();
  const ctx: any = {
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
                op === "lt"
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
  return { ctx, tables };
}

const createH = (botCreateSession as any)._handler;
const finalizeH = (finalize as any)._handler;
const getSessionH = (getSession as any)._handler;
const claimH = (botClaimGrant as any)._handler;
const finishH = (botFinishGrant as any)._handler;
const pendingH = (botPendingGrants as any)._handler;
const linksH = (listLinks as any)._handler;

/** Tạo phiên rồi trả token thô (chỉ test mới có token thô). */
async function newSession(ctx: any, userId = USER_A, privileged = false) {
  return await createH(ctx, { guildId: GUILD, userId, privileged, botKey: BOT_KEY });
}

/** Băm bộ tín hiệu giả cho một "thiết bị". */
function signalsFor(ip: string, fp: string, cookie: string, ua = "UA-Test") {
  return {
    ipHash: ipHash(SECRET, GUILD, ip),
    globalIpHash: globalIpHash(SECRET, ip),
    fingerprintHash: signalHash(SECRET, "fp", fp),
    cookieHash: signalHash(SECRET, "cookie", cookie),
    uaHash: signalHash(SECRET, "ua", ua),
  };
}

async function runFinalize(ctx: any, token: string, signals: Row, extra: Row = {}) {
  return await finalizeH(ctx, {
    tokenHash: hashVerifyToken(token),
    sharedIp: false,
    human: true,
    consentVersion: "2026-11-11",
    ...signals,
    ...extra,
  });
}

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
    check("đã ghi ipHash (không phải IP thô)", /^[0-9a-f]{64}$/.test(row.ipHash));
    check(
      "ghi audit",
      tables.verifyAudit.some((r) => r.action === "verify_completed"),
    );
    check("ghi 4 tín hiệu", tables.verifySignals.length === 4, tables.verifySignals.length);
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
    check("vẫn xếp việc cho bot (kick)", tables.verifySessions[0].grantPending === true);
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
    check("không còn trong hàng đợi", (await pendingH(ctx, { botKey: BOT_KEY })).length === 0);
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

  // ═══ 14. Dashboard links chỉ đọc khi có quyền ═══
  console.log("\n── listLinks: quyền ──");
  {
    const { ctx } = makeCtx({ verifyWebEnabled: true });
    const denied = await linksH(ctx, { token: "khong-co-phien", guildId: GUILD });
    check("không đăng nhập → null", denied === null);
  }

  console.log(`\n${pass}/${pass + fail} assertion xanh`);
  if (fail > 0) process.exit(1);
})();
