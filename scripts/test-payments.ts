// TEST: thanh toán ZaloPay (convex/payments.ts) — tiền THẬT đi qua code này.
//
// Chạy: bun scripts/test-payments.ts
//
// Vì sao test này tồn tại: mọi sai ở đây là mất tiền hoặc mất quyền lợi thật:
//   1. SAI MAC → ZaloPay từ chối create (không bán được) hoặc callback bị bỏ
//      (đã trừ tiền nhưng không kích hoạt Premium) — khoá bằng vector RFC 4231
//      và so sánh đối chiếu node:crypto (test chạy dưới bun, KHÔNG phải runtime
//      Convex nên dùng được crypto; bản production thuần TS vì Convex mặc định
//      runtime không có node:crypto).
//   2. SAI NGÀY appTransId (dùng UTC thay vì GMT+7) → đơn lệch ngày đối soát
//      từ 17h–24h → không dính đơn khi tra trên portal ZaloPay.
//   3. markPaid KHÔNG idempotent → callback lặp cộng dồn hạn Premium (mua 1
//      tháng được 6 tháng) hoặc entitlement bị hạ gói khi đơn cũ kịp thanh toán.
//   4. Thiếu chặn spam → một tài khoản đốt hàng trăm đơn rác tại ZaloPay.
//
// Hermetic: không mạng, không DB thật — ctx giả trong bộ nhớ, __handler của
// Convex mutation gọi thẳng như hàm.
import { createHmac } from "node:crypto";

import {
  DONATE_TIERS_VND,
  PREMIUM_MONTH_MS,
  PREMIUM_PLAN_VND,
  applyEntitlement,
  buildAppTransId,
  createIntentInternal,
  createOrderMacHex,
  createOrderMacInput,
  dashboardOrigin,
  isEntitled,
  markPaidInternal,
  paymentDescription,
  queryOrderMacHex,
  resolveAmount,
  verifyCallbackMacHex,
} from "../convex/payments";
import { hmacSha256Hex, sha256Hex } from "../convex/sha256";
import { ConvexError } from "convex/values";
import { startPayment } from "../convex/paymentsAction";
import { CURRENT_SESSION_AUTH_VERSION } from "../convex/auth";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean) => {
  console.log(ok ? `  ✅ ${label}` : `  ❌ ${label}`);
  if (ok) pass++;
  else fail++;
};

const refHmac = (key: string, msg: string) =>
  createHmac("sha256", key).update(msg, "utf8").digest("hex");

// ── 1. HMAC-SHA256 — vector cố định + đối chiếu node:crypto ────────────────
console.log("── HMAC (ký MAC ZaloPay) ──");
check(
  "RFC 4231 case: Jefe/what do ya want…",
  hmacSha256Hex("Jefe", "what do ya want for nothing?") ===
    "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
);
check(
  "khớp node:crypto — key ngắn",
  hmacSha256Hex("key", "The quick brown fox jumps over the lazy dog") ===
    refHmac("key", "The quick brown fox jumps over the lazy dog"),
);
check(
  "khớp node:crypto — key > 64 byte (đi nhánh băm key)",
  hmacSha256Hex("k".repeat(100), "payload") === refHmac("k".repeat(100), "payload"),
);
check(
  "khớp node:crypto — key rỗng + chuỗi tiếng Việt",
  hmacSha256Hex("", "ủng hộ Protogon ✅") === refHmac("", "ủng hộ Protogon ✅"),
);
check(
  'sha256("") là chuẩn FIPS',
  sha256Hex("") === "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
);

// ── 2. MAC create/query/callback ────────────────────────────────────────────
console.log("── MAC create / query / callback ──");
const orderInput = {
  appId: "2553",
  appTransId: "261006_abc123",
  appUser: "123456789012345678",
  amount: 49_000,
  appTime: 1_770_000_000_000,
  embedData: '{"redirecturl":"https://protogon.freebuff.app/premium"}',
  item: "[]",
};
check(
  "createOrderMacInput ghép đúng thứ tự | theo docs",
  createOrderMacInput(orderInput) ===
    [
      "2553",
      "261006_abc123",
      "123456789012345678",
      49_000,
      1_770_000_000_000,
      orderInput.embedData,
      "[]",
    ].join("|"),
);
check(
  "createOrderMacHex = HMAC(key1, hmac_input) đối chiếu node:crypto",
  createOrderMacHex("key1-secret", orderInput) ===
    refHmac("key1-secret", createOrderMacInput(orderInput)),
);
check(
  "queryOrderMacHex = HMAC(key1, app_id|trans_id|key1) đối chiếu node:crypto",
  queryOrderMacHex("key1-secret", "2553", "261006_abc") ===
    refHmac("key1-secret", "2553|261006_abc|key1-secret"),
);

const cbData = JSON.stringify({ app_trans_id: "261006_abc", amount: 49_000, zp_trans_id: 1 });
const cbMac = refHmac("key2-secret", cbData);
check("callback MAC đúng → chấp nhận", verifyCallbackMacHex(cbData, cbMac, "key2-secret"));
check(
  "callback MAC đúng nhưng IN HOA → vẫn chấp nhận",
  verifyCallbackMacHex(cbData, cbMac.toUpperCase(), "key2-secret"),
);
check("sai key2 → từ chối", !verifyCallbackMacHex(cbData, cbMac, "key2-wrong"));
check("data bị sửa 1 ký tự → từ chối", !verifyCallbackMacHex(cbData + "x", cbMac, "key2-secret"));
check("data hoặc mac rỗng → từ chối", !verifyCallbackMacHex("", "", "key2-secret"));
check("thiếu key2 → từ chối", !verifyCallbackMacHex(cbData, cbMac, ""));

// ── 3. appTransId theo giờ GMT+7 ───────────────────────────────────────────
console.log("── appTransId (tiền tố yymmdd GMT+7) ──");
const eveningUtc = Date.UTC(2026, 9, 6, 18, 0, 0); // 18:00 UTC = 01:00 07/10 giờ VN
check(
  "18h UTC đã là ngày hôm sau theo giờ VN",
  buildAppTransId(eveningUtc, "x").startsWith("261007_"),
);
const lateUtc = Date.UTC(2026, 9, 6, 16, 59, 0); // 16:59 UTC = 23:59 06/10 giờ VN
check(
  "16:59 UTC vẫn là cùng ngày theo giờ VN",
  buildAppTransId(lateUtc, "x").startsWith("261006_"),
);
check("suffix được giữ nguyên", buildAppTransId(eveningUtc, "abc") === "261007_abc");
check(
  "không vượt 40 ký tự (giới hạn ZaloPay)",
  buildAppTransId(eveningUtc, "a".repeat(60)).length === 40,
);
const suffix = buildAppTransId(Date.now(), "dummy");
check("mã đơn khớp regex yymmdd_suffix", /^\d{6}_[a-z0-9]+$/.test(suffix));

// ── 4. Bảng giá — server chốt, không nhận tiền từ client ───────────────────
console.log("── resolveAmount (chết giá tại server) ──");
check("donate 50k theo tier", resolveAmount("donate", "50000") === 50_000);
check(
  "donate đủ 3 tier",
  DONATE_TIERS_VND.every((t) => resolveAmount("donate", String(t)) === t),
);
check("donate custom hợp lệ", resolveAmount("donate", "custom", 25_000) === 25_000);
check(
  "premium supporter = 49.000",
  resolveAmount("premium", "supporter") === PREMIUM_PLAN_VND.supporter,
);
check("premium pioneer = 99.000", resolveAmount("premium", "pioneer") === 99_000);
const throws = (fn: () => unknown) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};
check(
  "tier lạ bị chặn",
  throws(() => resolveAmount("donate", "99999")),
);
check(
  "custom thiếu số bị chặn",
  throws(() => resolveAmount("donate", "custom")),
);
check(
  "custom không nguyên bị chặn",
  throws(() => resolveAmount("donate", "custom", 1.5)),
);
check(
  "custom dưới 10k bị chặn",
  throws(() => resolveAmount("donate", "custom", 9_999)),
);
check(
  "custom trên 100 triệu bị chặn",
  throws(() => resolveAmount("donate", "custom", 100_000_001)),
);
check(
  "gói premium lạ bị chặn",
  throws(() => resolveAmount("premium", "vip")),
);
check(
  "loại đơn lạ bị chặn",
  throws(() => resolveAmount("weird" as never, "x")),
);

// ── 5. Entitlement: gia hạn / nâng gói / chặn hạ gói ───────────────────────
console.log("── applyEntitlement (quyền lợi Premium) ──");
const now = Date.now();
const fresh = applyEntitlement(null, "supporter", now);
check(
  "chưa có quyền → kỳ 30 ngày mới",
  fresh?.plan === "supporter" &&
    fresh.startsAt === now &&
    fresh.expiresAt === now + PREMIUM_MONTH_MS,
);
const expired = applyEntitlement({ plan: "pioneer", expiresAt: now - 1 }, "pioneer", now);
check("hết hạn → bắt đầu kỳ mới theo gói mua", expired?.expiresAt === now + PREMIUM_MONTH_MS);
const renew = applyEntitlement(
  { plan: "supporter", expiresAt: now + 10 * 86_400_000, startsAt: now - 20 * 86_400_000 },
  "supporter",
  now,
);
check(
  "cùng gói → cộng thêm 30 ngày từ hạn cũ (không tính lại từ now)",
  renew?.expiresAt === now + 10 * 86_400_000 + PREMIUM_MONTH_MS &&
    renew.startsAt === now - 20 * 86_400_000,
);
const upgrade = applyEntitlement(
  { plan: "supporter", expiresAt: now + 10 * 86_400_000 },
  "pioneer",
  now,
);
check(
  "nâng gói → đổi sang pioneer ngay + giữ thời gian còn lại + 30 ngày",
  upgrade?.plan === "pioneer" && upgrade.expiresAt === now + 10 * 86_400_000 + PREMIUM_MONTH_MS,
);
check(
  "hạ gói khi pioneer đang chạy → null (không đổi, không cộng)",
  applyEntitlement({ plan: "pioneer", expiresAt: now + 5 * 86_400_000 }, "supporter", now) === null,
);
check("gói lạ → null", applyEntitlement(null, "nonsense", now) === null);
check(
  "isEntitled đúng ranh giới hết hạn",
  !isEntitled({ expiresAt: now }, now) && isEntitled({ expiresAt: now + 1 }, now),
);
check("isEntitled(null) = false", !isEntitled(null, now));

check(
  "dashboardOrigin lấy từ DASHBOARD_URL",
  dashboardOrigin("https://protogon.freebuff.app/", undefined) === "https://protogon.freebuff.app",
);
check(
  "dashboardOrigin fallback từ OAUTH_REDIRECT_URI",
  dashboardOrigin("not-a-url", "https://protogon.freebuff.app/discord/callback") ===
    "https://protogon.freebuff.app",
);
check("dashboardOrigin rỗng khi thiếu hết", dashboardOrigin(undefined, undefined) === "");
const desc = paymentDescription("premium", "pioneer", "261006_abc");
check("mô tả đơn ≤256 ký tự và chứa mã đơn", desc.length <= 256 && desc.includes("261006_abc"));

// ── 6. Handler Convex với ctx giả (createIntent / markPaid) ─────────────────
console.log("── createIntentInternal / markPaidInternal (ctx giả) ──");

type Row = Record<string, any>;

function makeCtx(tables: Record<string, Row[]>) {
  let idSeq = 0;
  const allRows = () => Object.values(tables).flat();
  const view = (out: Row[]): any => ({
    first: async () => out[0] ?? null,
    collect: async () => out,
    take: async (n: number) => out.slice(0, n),
    order: () => view(out),
  });
  const db = {
    query: (table: string) => {
      const rows = tables[table] ?? [];
      return {
        withIndex: (_name: string, bound: (q: any) => any) => {
          const caps: Array<{ f: string; op: string; v: any }> = [];
          const q: any = {
            eq: (f: string, v: any) => (caps.push({ f, op: "eq", v }), q),
            gte: (f: string, v: any) => (caps.push({ f, op: "gte", v }), q),
            lte: (f: string, v: any) => (caps.push({ f, op: "lte", v }), q),
            lt: (f: string, v: any) => (caps.push({ f, op: "lt", v }), q),
            field: (f: string) => f,
          };
          bound(q);
          const out = rows.filter((r) =>
            caps.every(({ f, op, v }) =>
              op === "eq"
                ? r[f] === v
                : op === "gte"
                  ? r[f] >= v
                  : op === "lte"
                    ? r[f] <= v
                    : r[f] < v,
            ),
          );
          return view(out);
        },
        ...view(rows),
      };
    },
    get: async (id: string) => allRows().find((r) => r._id === id) ?? null,
    insert: async (table: string, row: Row) => {
      const _id = `id${++idSeq}`;
      (tables[table] ??= []).push({ ...row, _id });
      return _id;
    },
    patch: async (id: string, patch: Row) => {
      const r = allRows().find((x) => x._id === id);
      if (r) Object.assign(r, patch);
    },
  };
  return { db } as any;
}

function seed() {
  const t = Date.now();
  const tables: Record<string, Row[]> = {
    users: [
      {
        _id: "u1",
        discordId: "123456789012345678",
        username: "tester",
        manageableGuildIds: [],
        lastLoginAt: t,
      },
    ],
    sessions: [
      {
        _id: "s1",
        token: "tok-good",
        userId: "u1",
        createdAt: t,
        authVersion: CURRENT_SESSION_AUTH_VERSION,
      },
    ],
    payments: [],
    entitlements: [],
  };
  return tables;
}

const createHandler = (createIntentInternal as any)._handler;
const markHandler = (markPaidInternal as any)._handler;
check(
  "lấy được handler từ mutation Convex",
  typeof createHandler === "function" && typeof markHandler === "function",
);

async function expectThrows(label: string, fn: () => Promise<unknown>, needle: string) {
  try {
    await fn();
    check(label, false);
  } catch (e: any) {
    check(label, String(e?.message ?? e).includes(needle));
  }
}

const run = async () => {
  // Happy path donate
  {
    const tables = seed();
    const ctx = makeCtx(tables);
    const out = await createHandler(ctx, { token: "tok-good", kind: "donate", plan: "50000" });
    const row = tables.payments[0];
    check(
      "donate tạo được đơn pending với giá server chốt",
      row?.status === "pending" && row.amount === 50_000,
    );
    check(
      "appTransId tiền tố yymmdd GMT+7 của HÔM NAY",
      out.appTransId.startsWith(buildAppTransId(Date.now(), "").slice(0, 7)),
    );
    check(
      "đơn ghi đúng chủ sở hữu",
      row?.userId === "u1" && row.discordId === "123456789012345678",
    );
    check("kind/plan được giữ nguyên", row?.kind === "donate" && row.plan === "50000");
  }

  // Premium price + invalid session + bad plan
  {
    const tables = seed();
    const ctx = makeCtx(tables);
    const out = await createHandler(ctx, { token: "tok-good", kind: "premium", plan: "pioneer" });
    check("premium pioneer = 99.000", out.amount === 99_000);
    await expectThrows(
      "phiên sai bị chặn",
      () => createHandler(makeCtx(seed()), { token: "tok-sai", kind: "donate", plan: "50000" }),
      "Phiên đăng nhập không hợp lệ",
    );
    await expectThrows(
      "plan lạ bị chặn trước khi tạo đơn ZaloPay",
      () => createHandler(makeCtx(seed()), { token: "tok-good", kind: "donate", plan: "12345" }),
      "không hợp lệ",
    );
  }

  // Chặn mua gói thấp hơn khi gói cao đang chạy
  {
    const tables = seed();
    tables.entitlements.push({
      _id: "e1",
      userId: "u1",
      discordId: "123456789012345678",
      plan: "pioneer",
      startsAt: Date.now() - 86_400_000,
      expiresAt: Date.now() + 20 * 86_400_000,
      lastPaymentId: "p0",
      createdAt: Date.now() - 86_400_000,
      updatedAt: Date.now() - 86_400_000,
    });
    await expectThrows(
      "mua supporter khi đang có pioneer → chặn (không thể mua rẻ gia hạn gói đắt)",
      () =>
        createHandler(makeCtx(tables), { token: "tok-good", kind: "premium", plan: "supporter" }),
      "không thể mua gói thấp hơn",
    );
    const allowed = await createHandler(makeCtx(tables), {
      token: "tok-good",
      kind: "premium",
      plan: "pioneer",
    });
    check("mua lại chính gói đang chạy (gia hạn) vẫn được", allowed.amount === 99_000);
  }

  // Chặn spam: 3 đơn pending trong 1 giờ
  {
    const tables = seed();
    const t = Date.now();
    for (let i = 0; i < 3; i++) {
      tables.payments.push({
        _id: `old${i}`,
        userId: "u1",
        discordId: "123456789012345678",
        kind: "donate",
        plan: "50000",
        amount: 50_000,
        appTransId: `261006_old${i}`,
        status: "pending",
        createdAt: t - 60_000,
      });
    }
    await expectThrows(
      "đơn thứ 4 trong giờ → chặn spam",
      () => createHandler(makeCtx(tables), { token: "tok-good", kind: "donate", plan: "50000" }),
      "quá nhiều đơn",
    );
  }

  // markPaid: donate idempotent
  {
    const tables = seed();
    tables.payments.push({
      _id: "p1",
      userId: "u1",
      discordId: "123456789012345678",
      kind: "donate",
      plan: "100000",
      amount: 100_000,
      appTransId: "261006_don",
      status: "pending",
      createdAt: Date.now(),
    });
    const ctx = makeCtx(tables);
    const first = await markHandler(ctx, {
      appTransId: "261006_don",
      amountPaid: 100_000,
      zpTransId: "111",
      source: "callback",
    });
    check(
      "lần 1: paid + có zp_trans_id",
      first.ok === true &&
        tables.payments[0].status === "paid" &&
        tables.payments[0].zpTransId === "111",
    );
    const second = await markHandler(ctx, {
      appTransId: "261006_don",
      amountPaid: 100_000,
      zpTransId: "111",
      source: "query",
    });
    check("lần 2 (callback lặp): alreadyPaid, không đổi gì", second.alreadyPaid === true);
    check("donate không sinh entitlement", tables.entitlements.length === 0);
    const unknown = await markHandler(ctx, {
      appTransId: "khong-ton-tai",
      amountPaid: 1,
      source: "callback",
    });
    check("đơn lạ bị từ chối", unknown.ok === false && unknown.reason === "unknown_order");
  }

  // markPaid: premium tạo entitlement + idempotent + renewal
  {
    const tables = seed();
    tables.payments.push({
      _id: "p2",
      userId: "u1",
      discordId: "123456789012345678",
      kind: "premium",
      plan: "supporter",
      amount: 49_000,
      appTransId: "261006_prem",
      status: "pending",
      createdAt: Date.now(),
    });
    const ctx = makeCtx(tables);
    await markHandler(ctx, {
      appTransId: "261006_prem",
      amountPaid: 49_000,
      zpTransId: "222",
      source: "callback",
    });
    const ent = tables.entitlements[0];
    check(
      "premium tạo entitlement đúng hạn 30 ngày",
      ent?.plan === "supporter" &&
        Math.abs(ent.expiresAt - (Date.now() + PREMIUM_MONTH_MS)) < 5_000,
    );
    const expAfterFirst = ent.expiresAt;
    await markHandler(ctx, {
      appTransId: "261006_prem",
      amountPaid: 49_000,
      zpTransId: "222",
      source: "query",
    });
    check(
      "callback lặp KHÔNG cộng thêm hạn (idempotent)",
      tables.entitlements[0].expiresAt === expAfterFirst,
    );
    check("chỉ 1 dòng entitlement", tables.entitlements.length === 1);
  }

  // markPaid: lệch số tiền → vẫn paid (đã MAC-verify) nhưng ghi note đối soát
  {
    const tables = seed();
    tables.payments.push({
      _id: "p3",
      userId: "u1",
      discordId: "123456789012345678",
      kind: "donate",
      plan: "custom",
      amount: 30_000,
      appTransId: "261006_lech",
      status: "pending",
      createdAt: Date.now(),
    });
    const ctx = makeCtx(tables);
    await markHandler(ctx, { appTransId: "261006_lech", amountPaid: 30_001, source: "query" });
    check("lệch tiền vẫn paid (tiền thật đã vào)", tables.payments[0].status === "paid");
    check("lệch tiền được ghi chú đối soát", String(tables.payments[0].error).includes("lệch"));
  }

  // markPaid: đơn cũ hạ gói không hạ được entitlement đang chạy
  {
    const tables = seed();
    const t = Date.now();
    tables.payments.push({
      _id: "p4",
      userId: "u1",
      discordId: "123456789012345678",
      kind: "premium",
      plan: "supporter",
      amount: 49_000,
      appTransId: "261006_cu",
      status: "pending",
      createdAt: t - 86_400_000,
    });
    tables.entitlements.push({
      _id: "e2",
      userId: "u1",
      discordId: "123456789012345678",
      plan: "pioneer",
      startsAt: t - 86_400_000,
      expiresAt: t + 20 * 86_400_000,
      lastPaymentId: "px",
      createdAt: t - 86_400_000,
      updatedAt: t - 86_400_000,
    });
    const ctx = makeCtx(tables);
    await markHandler(ctx, { appTransId: "261006_cu", amountPaid: 49_000, source: "callback" });
    check(
      "đơn cũ trả tiền KHÔNG hạ gói pioneer đang chạy",
      tables.entitlements[0].plan === "pioneer",
    );
    check("hạn pioneer không bị đụng", tables.entitlements[0].expiresAt === t + 20 * 86_400_000);
  }

  // ── startPayment: MỌI nhánh lỗi phải về client bằng ConvexError ────────────
  // Bug thật 07/10/2026: khách bấm "Ủng hộ" trên /donate thấy nguyên
  // "[CONVEX A(paymentsAction:startPayment)] [Request ID: …] Server Error
  // Called by client" — Convex production mask message của Error THƯỜNG.
  // ConvexError vẫn forward data (err.data.message) → web đọc được lý do thật.
  console.log("── startPayment ném ConvexError (không bị mask) ──");
  {
    const startHandler = (startPayment as any)._handler;
    check("lấy được handler của action startPayment", typeof startHandler === "function");

    const args = { token: "tok-good", kind: "donate" as const, plan: "50000" };
    const savedAppId = process.env.ZALOPAY_APP_ID;
    const savedKey1 = process.env.ZALOPAY_KEY1;
    const restoreEnv = () => {
      if (savedAppId === undefined) delete process.env.ZALOPAY_APP_ID;
      else process.env.ZALOPAY_APP_ID = savedAppId;
      if (savedKey1 === undefined) delete process.env.ZALOPAY_KEY1;
      else process.env.ZALOPAY_KEY1 = savedKey1;
    };

    try {
      // (a) thiếu cấu hình ZaloPay
      delete process.env.ZALOPAY_APP_ID;
      delete process.env.ZALOPAY_KEY1;
      const ctxNoCfg: any = { runMutation: async () => null, runQuery: async () => null };
      try {
        await startHandler(ctxNoCfg, args);
        check("thiếu key ZaloPay → bắt buộc ném lỗi", false);
      } catch (e: any) {
        check(
          "thiếu key ZaloPay → ConvexError PAYMENT_NOT_CONFIGURED + message VI",
          e instanceof ConvexError &&
            e.data?.code === "PAYMENT_NOT_CONFIGURED" &&
            String(e.data?.message ?? "").includes("Cổng thanh toán"),
          e?.data ?? String(e),
        );
      }

      // (b) intent thất bại (spam đơn / plan sai…) — lý do tiếng Việt phải giữ nguyên
      process.env.ZALOPAY_APP_ID = "2553";
      process.env.ZALOPAY_KEY1 = "k1-test";
      const ctxIntentFail: any = {
        runMutation: async () => {
          throw new Error("Mức ủng hộ không hợp lệ: 999");
        },
      };
      try {
        await startHandler(ctxIntentFail, args);
        check("intent thất bại → bắt buộc ném lỗi", false);
      } catch (e: any) {
        check(
          "intent thất bại → ConvexError PAYMENT_INTENT_FAILED giữ đúng lý do tiếng Việt",
          e instanceof ConvexError &&
            e.data?.code === "PAYMENT_INTENT_FAILED" &&
            e.data?.message === "Mức ủng hộ không hợp lệ: 999",
          e?.data ?? String(e),
        );
      }

      // (c) ZaloPay không gọi được → ZALOPAY_UNAVAILABLE + ghi payments.error
      const intent = {
        paymentId: "p1",
        appTransId: "261007_x",
        amount: 50_000,
        kind: "donate" as const,
        plan: "50000",
        discordId: "123456789012345678",
        createdAt: Date.now(),
      };
      let recorded: any = null;
      const ctxNet: any = {
        runMutation: async (_fn: any, a: any) => {
          // Phân biệt theo shape args: createIntentInternal nhận token phiên,
          // recordErrorInternal chỉ nhận { appTransId, error }.
          if (a && "token" in a) return intent;
          recorded = a;
          return null;
        },
      };
      const realFetch = globalThis.fetch;
      globalThis.fetch = (async () => {
        throw new Error("ECONNRESET");
      }) as any;
      try {
        await startHandler(ctxNet, args);
        check("mạng chết → bắt buộc ném lỗi", false);
      } catch (e: any) {
        check(
          "mạng chết → ConvexError ZALOPAY_UNAVAILABLE + đã ghi payments.error",
          e instanceof ConvexError &&
            e.data?.code === "ZALOPAY_UNAVAILABLE" &&
            !!recorded &&
            String(recorded.error ?? "").includes("create:"),
          e?.data ?? String(e),
        );
      } finally {
        globalThis.fetch = realFetch;
      }
    } finally {
      restoreEnv();
    }
  }

  console.log(`\n${pass}/${pass + fail} assertion xanh`);
  if (fail > 0) process.exit(1);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
