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

import { TERMS_VERSION } from "../convex/plans";
import {
  DONATE_TIERS_VND,
  PREMIUM_MONTH_MS,
  PREMIUM_PLAN_VND,
  TRANSFER_ORDER_TTL_MS,
  applyEntitlement,
  buildAppTransId,
  confirmTransfer,
  createIntentInternal,
  createOrderMacHex,
  createOrderMacInput,
  createTransferIntent,
  dashboardOrigin,
  grantPlan,
  isEntitled,
  listReportedOrders,
  markPaidInternal,
  orderStatus,
  paymentDescription,
  premiumStatus,
  queryOrderMacHex,
  reportTransfer,
  resolveAmount,
  revenueStats,
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

/**
 * Ctx cho mutation gọi `ctx.runMutation(internal.payments.*)` — định tuyến
 * thẳng về handler thật trên CÙNG db giả, đúng như Convex chạy nội bộ. Thiếu
 * `runMutation` thì `createTransferIntent`/`confirmTransfer` chết ngay.
 */
function makeCtxWithRun(tables: Record<string, Row[]>) {
  const base: any = makeCtx(tables);
  return {
    db: base.db,
    // Convex thật định tuyến theo FunctionReference; ở ctx giả reference là
    // proxy rỗng (`_handler` không gọi được), nên phân biệt theo SHAPE args —
    // đúng cách bộ test này đã làm cho recordErrorInternal. Shape lạ thì NÉM
    // LỖI: một internal call mới không được âm thầm thành no-op rồi test xanh.
    runMutation: async (_fn: any, args: any) => {
      if (args && "token" in args) return createHandler(base, args);
      if (args && "amountPaid" in args) return markHandler(base, args);
      throw new Error(
        `ctx giả chưa hỗ trợ runMutation với args: ${JSON.stringify(Object.keys(args ?? {}))}`,
      );
    },
  } as any;
}

const TEST_GUILD = "777777777777777777";

/**
 * Bảng đủ cho luồng CK: server + quyền quản lý (đơn mua gói BẮT BUỘC có cả
 * hai — gói áp theo server) + `botStatus` để `requireBotOwner` chạy được.
 */
function seedTransfer() {
  const tables = seed();
  tables.users[0].manageableGuildIds = [TEST_GUILD];
  tables.guilds = [{ _id: "g1", discordId: TEST_GUILD, name: "Server test", botInGuild: true }];
  tables.botStatus = [
    { _id: "bot1", kind: "status", ownerDiscordId: "123456789012345678", teamAdminDiscordIds: [] },
  ];
  return tables;
}

/** Điều kiện hợp lệ tối thiểu của một đơn mua gói (đồng ý + chọn server). */
const buyFields = () => ({
  guildId: TEST_GUILD,
  termsVersion: TERMS_VERSION,
  consentedAt: Date.now(),
});

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

  // Premium price + invalid session + bad plan (mua gói cần server + đồng ý)
  {
    const tables = seedTransfer();
    const ctx = makeCtx(tables);
    const out = await createHandler(ctx, {
      token: "tok-good",
      kind: "premium",
      plan: "pioneer",
      ...buyFields(),
    });
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

  // Chặn mua gói thấp hơn khi gói cao đang chạy — so theo ĐÚNG server đó
  {
    const tables = seedTransfer();
    tables.entitlements.push({
      _id: "e1",
      userId: "u1",
      discordId: "123456789012345678",
      guildId: TEST_GUILD,
      plan: "pioneer",
      startsAt: Date.now() - 86_400_000,
      expiresAt: Date.now() + 20 * 86_400_000,
      lastPaymentId: "p0",
      createdAt: Date.now() - 86_400_000,
      updatedAt: Date.now() - 86_400_000,
    });
    await expectThrows(
      "mua supporter khi server đang có pioneer → chặn (không thể mua rẻ gia hạn gói đắt)",
      () =>
        createHandler(makeCtx(tables), {
          token: "tok-good",
          kind: "premium",
          plan: "supporter",
          ...buyFields(),
        }),
      "không thể mua gói thấp hơn",
    );
    const allowed = await createHandler(makeCtx(tables), {
      token: "tok-good",
      kind: "premium",
      plan: "pioneer",
      ...buyFields(),
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

  // ── 7. Plan A — chuyển khoản ngân hàng ───────────────────────────────────
  // Tiền về ví cá nhân, KHÔNG có webhook: quyền lợi chỉ được ghi khi chủ bot
  // so sao kê rồi xác nhận. Vì vậy mọi nhánh ở đây đều là "ai được cấp quyền":
  //   · khách tự báo (reportTransfer) TUYỆT ĐỐI không được cấp quyền;
  //   · chủ bot xác nhận (confirmTransfer) phải đi qua markPaidInternal — gốc
  //     duy nhất, idempotent — và chỉ đơn đã `reported` mới xác nhận được.
  console.log("── Plan A: chuyển khoản ngân hàng (ctx giả) ──");
  const createTransferH = (createTransferIntent as any)._handler;
  const reportH = (reportTransfer as any)._handler;
  const confirmH = (confirmTransfer as any)._handler;
  const statusH = (orderStatus as any)._handler;
  const listReportedH = (listReportedOrders as any)._handler;
  const revenueH = (revenueStats as any)._handler;
  check(
    "lấy được handler Plan A từ mutation/query Convex",
    [createTransferH, reportH, confirmH, statusH, listReportedH, revenueH].every(
      (h) => typeof h === "function",
    ),
  );

  /** Đơn CK giả đã nằm trong bảng payments. */
  const transferRow = (over: Row = {}): Row => ({
    _id: "p_ck",
    userId: "u1",
    discordId: "123456789012345678",
    guildId: TEST_GUILD,
    kind: "premium",
    plan: "supporter",
    amount: 49_000,
    appTransId: "261008_ck1",
    status: "pending",
    createdAt: Date.now(),
    ...over,
  });

  // Tạo đơn CK: giá server chốt, KHÔNG cấp quyền lợi
  {
    const tables = seedTransfer();
    const intent = await createTransferH(makeCtxWithRun(tables), {
      token: "tok-good",
      kind: "premium",
      plan: "supporter",
      ...buyFields(),
      consent: true,
    });
    const row = tables.payments[0];
    check(
      "đơn CK: pending + giá server chốt + mã đơn có tiền tố ngày GMT+7",
      row?.status === "pending" &&
        row.amount === PREMIUM_PLAN_VND.supporter &&
        /^\d{6}_/.test(String(row.appTransId)),
      { row, intent },
    );
    check("đơn CK chưa sinh quyền lợi nào", tables.entitlements.length === 0);
    check("trả mã đơn cho khách (nội dung chuyển khoản)", intent.appTransId === row.appTransId);
    check(
      "đơn lưu BẰNG CHỨNG đồng ý + server (đối chiếu khi có tranh chấp)",
      row?.guildId === TEST_GUILD &&
        row?.termsVersion === TERMS_VERSION &&
        typeof row?.consentedAt === "number",
      row,
    );
    await expectThrows(
      "phiên sai → không tạo được đơn CK",
      () =>
        createTransferH(makeCtxWithRun(seedTransfer()), {
          token: "tok-sai",
          kind: "premium",
          plan: "supporter",
          ...buyFields(),
          consent: true,
        }),
      "Phiên đăng nhập không hợp lệ",
    );
    // Cổng đồng ý điều khoản + chọn server: 4 nhánh đều chặn Ở SERVER (gọi
    // thẳng API cũng không lách được — UI chỉ là lớp nhắc).
    await expectThrows(
      "không tick đồng ý điều khoản → không tạo được đơn",
      () =>
        createTransferH(makeCtxWithRun(seedTransfer()), {
          token: "tok-good",
          kind: "premium",
          plan: "supporter",
          guildId: TEST_GUILD,
          termsVersion: TERMS_VERSION,
        }),
      "đồng ý điều khoản",
    );
    await expectThrows(
      "đồng ý nhưng SAI phiên bản điều khoản (vừa cập nhật) → chặn",
      () =>
        createTransferH(makeCtxWithRun(seedTransfer()), {
          token: "tok-good",
          kind: "premium",
          plan: "supporter",
          guildId: TEST_GUILD,
          termsVersion: TERMS_VERSION - 1,
          consent: true,
        }),
      "đồng ý điều khoản",
    );
    await expectThrows(
      "không chọn server → chặn (gói áp dụng theo server)",
      () =>
        createTransferH(makeCtxWithRun(seedTransfer()), {
          token: "tok-good",
          kind: "premium",
          plan: "supporter",
          termsVersion: TERMS_VERSION,
          consent: true,
        }),
      "chọn server",
    );
    await expectThrows(
      "server không thuộc quyền quản lý → chặn",
      () =>
        createTransferH(makeCtxWithRun(seedTransfer()), {
          token: "tok-good",
          kind: "premium",
          plan: "supporter",
          guildId: "888888888888888888",
          termsVersion: TERMS_VERSION,
          consent: true,
        }),
      "không quản lý server này",
    );
    await expectThrows(
      "mệnh giá client gửi bị chặn (giá chết tại server)",
      () =>
        createTransferH(makeCtxWithRun(seedTransfer()), {
          token: "tok-good",
          kind: "donate",
          plan: "12345",
        }),
      "không hợp lệ",
    );
  }

  // reportTransfer: chỉ BÁO, không cấp quyền + idempotent + hết hạn 24h
  {
    const tables = seedTransfer();
    tables.payments.push(transferRow());
    const ctx = makeCtxWithRun(tables);
    const res = await reportH(ctx, { token: "tok-good", appTransId: "261008_ck1" });
    check(
      "khách báo CK → reported + có mốc reportedAt",
      res.ok === true &&
        tables.payments[0].status === "reported" &&
        typeof tables.payments[0].reportedAt === "number",
      tables.payments[0],
    );
    check("báo CK KHÔNG cấp quyền lợi (chờ chủ bot so sao kê)", tables.entitlements.length === 0);
    const again = await reportH(ctx, { token: "tok-good", appTransId: "261008_ck1" });
    check(
      "báo lần 2 khi đang reported: idempotent, giữ nguyên mốc cũ",
      again.ok === true && again.status === "reported",
      again,
    );
    await expectThrows(
      "đơn của người khác → không báo được",
      () => reportH(ctx, { token: "tok-sai", appTransId: "261008_ck1" }),
      "không hợp lệ",
    );
    await expectThrows(
      "đơn không tồn tại → báo lỗi rõ ràng",
      () => reportH(ctx, { token: "tok-good", appTransId: "khong-co" }),
      "Không tìm thấy",
    );

    const stale = seedTransfer();
    stale.payments.push(transferRow({ createdAt: Date.now() - TRANSFER_ORDER_TTL_MS - 1000 }));
    await expectThrows(
      "quá 24h chưa chuyển → đơn đóng thành expired + báo tạo đơn mới",
      () => reportH(makeCtxWithRun(stale), { token: "tok-good", appTransId: "261008_ck1" }),
      "quá hạn 24 giờ",
    );
    check(
      "đơn quá hạn được đóng (expired), không nằm chờ xác nhận",
      stale.payments[0].status === "expired",
    );

    const paidRow = seedTransfer();
    paidRow.payments.push(transferRow({ status: "paid" }));
    const onPaid = await reportH(makeCtxWithRun(paidRow), {
      token: "tok-good",
      appTransId: "261008_ck1",
    });
    check("đơn đã paid: báo lại vẫn ok, không hạ trạng thái", onPaid.status === "paid");
  }

  // confirmTransfer: CHỦ BOT + QUẢN TRỊ VIÊN NHÓM, chỉ đơn đã reported, đi qua markPaidInternal
  {
    const tables = seedTransfer();
    tables.payments.push(transferRow({ status: "reported", reportedAt: Date.now() }));
    const ctx = makeCtxWithRun(tables);
    const res = await confirmH(ctx, { token: "tok-good", appTransId: "261008_ck1" });
    const ent = tables.entitlements[0];
    check(
      "chủ bot xác nhận → paid + ghi entitlement đúng gói/hạn + đúng SERVER",
      res.ok === true &&
        res.alreadyPaid === false &&
        tables.payments[0].status === "paid" &&
        ent?.plan === "supporter" &&
        ent?.guildId === TEST_GUILD &&
        Math.abs(ent.expiresAt - (Date.now() + PREMIUM_MONTH_MS)) < 5_000,
      { res, ent },
    );
    const expAfter = tables.entitlements[0].expiresAt;
    const again = await confirmH(ctx, { token: "tok-good", appTransId: "261008_ck1" });
    check(
      "xác nhận lần 2: alreadyPaid, KHÔNG cộng dồn thêm hạn",
      again.alreadyPaid === true && tables.entitlements[0].expiresAt === expAfter,
      again,
    );

    const pending = seedTransfer();
    pending.payments.push(transferRow());
    await expectThrows(
      "đơn CHƯA được khách báo → chủ bot cũng không xác nhận được (chống nhảy cóc)",
      () => confirmH(makeCtxWithRun(pending), { token: "tok-good", appTransId: "261008_ck1" }),
      "chưa được khách báo",
    );

    const stranger = seedTransfer();
    stranger.payments.push(transferRow({ status: "reported", reportedAt: Date.now() }));
    stranger.users.push({ _id: "u2", discordId: "999999999999999999", username: "stranger" });
    stranger.sessions.push({
      _id: "s2",
      token: "tok-stranger",
      userId: "u2",
      createdAt: Date.now(),
      authVersion: CURRENT_SESSION_AUTH_VERSION,
    });
    await expectThrows(
      "người khác (không phải admin) → không xác nhận được",
      () => confirmH(makeCtxWithRun(stranger), { token: "tok-stranger", appTransId: "261008_ck1" }),
      "Chỉ chủ sở hữu bot hoặc quản trị viên nhóm",
    );
    check("người ngoài không đổi được trạng thái đơn", stranger.payments[0].status === "reported");

    // 10/10/2026 — quản trị viên nhóm có TOÀN BỘ trong Admin panel: được xác
    // nhận tiền như chủ bot (requireBotAdmin). Người lạ vẫn bị chặn ở trên.
    const team = seedTransfer();
    team.botStatus[0].teamAdminDiscordIds = ["555555555555555555"];
    team.users.push({ _id: "u_team", discordId: "555555555555555555", username: "team" });
    team.sessions.push({
      _id: "s_team",
      token: "tok-team",
      userId: "u_team",
      createdAt: Date.now(),
      authVersion: CURRENT_SESSION_AUTH_VERSION,
    });
    team.payments.push(transferRow({ status: "reported", reportedAt: Date.now() }));
    const teamRes = await confirmH(makeCtxWithRun(team), {
      token: "tok-team",
      appTransId: "261008_ck1",
    });
    check(
      "quản trị viên nhóm xác nhận được đơn chuyển khoản (toàn quyền Admin)",
      teamRes.ok === true && team.payments[0].status === "paid",
      teamRes,
    );
  }

  // listReportedOrders: chỉ chủ bot, chỉ đơn reported, không rò field nội bộ
  {
    const tables = seedTransfer();
    tables.payments.push(
      transferRow({ _id: "p_a", appTransId: "261008_a", status: "reported", reportedAt: 1 }),
      transferRow({ _id: "p_b", appTransId: "261008_b", status: "pending" }),
      transferRow({ _id: "p_c", appTransId: "261008_c", status: "paid", paidAt: 2 }),
      transferRow({
        _id: "p_d",
        appTransId: "261008_d",
        status: "reported",
        reportedAt: 3,
        error: "zp create: timeout",
        zpTransId: "999",
      }),
    );
    const rows = await listReportedH(makeCtxWithRun(tables), { token: "tok-good" });
    check(
      "chỉ trả đơn đã báo — pending/paid không lọt vào hàng chờ",
      Array.isArray(rows) &&
        rows.length === 2 &&
        rows.every((r: any) => r.appTransId === "261008_a" || r.appTransId === "261008_d"),
      rows,
    );
    const leaked = JSON.stringify(rows).match(/error|zpTransId|userId|"token"/);
    check("không rò field nội bộ (error/zpTransId/userId/token)", leaked === null, leaked?.[0]);
    check(
      "đơn chờ có đủ dữ liệu để so sao kê (kind/plan/amount/discordId/reportedAt)",
      ["kind", "plan", "amount", "discordId", "reportedAt"].every((f) => f in (rows[0] as any)),
      rows[0],
    );
    check("đơn báo sau được xếp trước (mới nhất lên đầu)", rows[1].appTransId === "261008_d");
    await expectThrows(
      "không phải chủ bot → không đọc được hàng chờ",
      () => listReportedH(makeCtxWithRun(seedTransfer()), { token: "tok-sai" }),
      "Vui lòng đăng nhập",
    );
  }

  // revenueStats: chỉ tính tiền ĐÃ xác nhận, tách donate/premium, mốc GMT+7
  {
    const tables = seedTransfer();
    const now = Date.now();
    const vn = new Date(now + 7 * 3600_000);
    const ym = `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, "0")}`;
    tables.payments.push(
      transferRow({
        _id: "r1",
        kind: "donate",
        plan: "100000",
        amount: 100_000,
        status: "paid",
        paidAt: now,
      }),
      transferRow({
        _id: "r2",
        kind: "premium",
        plan: "supporter",
        amount: 49_000,
        status: "paid",
        paidAt: now,
      }),
      transferRow({ _id: "r3", kind: "donate", plan: "50000", amount: 50_000, status: "pending" }),
      transferRow({
        _id: "r4",
        kind: "donate",
        plan: "300000",
        amount: 300_000,
        status: "reported",
        reportedAt: now,
      }),
      transferRow({
        _id: "r5",
        kind: "donate",
        plan: "100000",
        amount: 100_000,
        status: "paid",
        paidAt: Date.UTC(2024, 0, 15),
      }),
    );
    const stats = await revenueH(makeCtxWithRun(tables), { token: "tok-good" });
    check(
      "tổng doanh thu chỉ đếm đơn ĐÃ xác nhận (pending/reported KHÔNG tính)",
      stats.total === 249_000 && stats.count === 3,
      stats,
    );
    check(
      "tách đúng mua premium / ủng hộ",
      stats.donateTotal === 200_000 && stats.premiumTotal === 49_000,
      stats,
    );
    check(
      "12 ô tháng liên tiếp, tháng hiện tại đúng số của tháng này",
      stats.months.length === 12 &&
        stats.months[11].key === ym &&
        stats.months[11].total === 149_000 &&
        stats.months[11].count === 2,
      stats.months,
    );
    check(
      "ô tháng TRỐNG vẫn hiện với 0 (bảng không nhảy cột)",
      stats.months.slice(0, 11).every((m: any) => m.total === 0 && m.count === 0),
      stats.months,
    );
    check(
      "doanh thu theo năm: 2024 + năm nay, đơn cũ vào đúng năm",
      stats.years.length === 2 &&
        stats.years[1].year === 2024 &&
        stats.years[1].total === 100_000 &&
        stats.years[0].total === 149_000,
      stats.years,
    );
    await expectThrows(
      "không phải chủ bot → không đọc được doanh thu",
      () => revenueH(makeCtxWithRun(seedTransfer()), { token: "tok-sai" }),
      "Vui lòng đăng nhập",
    );
  }

  // orderStatus: khách tự theo dõi đơn của MÌNH (poll sau khi báo CK)
  {
    const tables = seedTransfer();
    tables.payments.push(transferRow({ status: "reported", reportedAt: 12345 }));
    const mine = await statusH(makeCtxWithRun(tables), {
      token: "tok-good",
      appTransId: "261008_ck1",
    });
    check(
      "chủ đơn đọc được trạng thái + mốc báo (để poll)",
      mine?.status === "reported" && mine?.reportedAt === 12345 && mine?.amount === 49_000,
      mine,
    );
    const guest = await statusH(makeCtxWithRun(tables), {
      token: "tok-sai",
      appTransId: "261008_ck1",
    });
    check("chưa đăng nhập → null (không lộ đơn)", guest === null);
    const other = seedTransfer();
    other.payments.push(transferRow({ status: "reported", reportedAt: 1 }));
    other.users.push({ _id: "u3", discordId: "888888888888888888", username: "other" });
    other.sessions.push({
      _id: "s3",
      token: "tok-other",
      userId: "u3",
      createdAt: Date.now(),
      authVersion: CURRENT_SESSION_AUTH_VERSION,
    });
    const notMine = await statusH(makeCtxWithRun(other), {
      token: "tok-other",
      appTransId: "261008_ck1",
    });
    check("người khác đọc cùng mã đơn → null", notMine === null);
  }

  // ── 8. Cấp gói thủ công ở Admin (grantPlan) + nhãn premium (premiumStatus) ──
  {
    const grantH = (grantPlan as any)._handler;
    const premH = (premiumStatus as any)._handler;
    check(
      "lấy được handler grantPlan / premiumStatus",
      typeof grantH === "function" && typeof premH === "function",
    );

    // (a) chủ bot cấp cho người đã đăng nhập web → entitlement + nhãn bật
    const tables = seedTransfer();
    const res = await grantH(makeCtx(tables), {
      token: "tok-good",
      discordId: "123456789012345678",
      plan: "supporter",
      days: 30,
    });
    const ent = tables.entitlements[0];
    check(
      "chủ bot cấp gói → đúng gói + đúng kỳ 30 ngày",
      res.ok === true &&
        res.plan === "supporter" &&
        res.days === 30 &&
        ent?.plan === "supporter" &&
        ent.expiresAt - ent.startsAt === 30 * 86_400_000,
      res,
    );
    const st = await premH(makeCtx(tables), { token: "tok-good" });
    check(
      "premiumStatus bật nhãn sau khi cấp (active: true)",
      st?.plan === "supporter" && st.active === true,
      st,
    );

    // (b) quản trị viên nhóm cũng cấp được — toàn quyền Admin 10/10/2026
    const team = seedTransfer();
    team.botStatus[0].teamAdminDiscordIds = ["555555555555555555"];
    team.users.push({
      _id: "u_team",
      discordId: "555555555555555555",
      username: "team",
      manageableGuildIds: [],
      lastLoginAt: Date.now(),
    });
    team.sessions.push({
      _id: "s_team",
      token: "tok-team",
      userId: "u_team",
      createdAt: Date.now(),
      authVersion: CURRENT_SESSION_AUTH_VERSION,
    });
    const teamRes = await grantH(makeCtx(team), {
      token: "tok-team",
      discordId: "123456789012345678",
      plan: "pioneer",
      days: 7,
    });
    check(
      "quản trị viên nhóm cấp được gói như chủ bot",
      teamRes.ok === true && teamRes.plan === "pioneer" && teamRes.days === 7,
      teamRes,
    );

    // (c) người lạ → bị chặn, KHÔNG làm biến động dữ liệu
    const stranger = seedTransfer();
    stranger.users.push({
      _id: "u_x",
      discordId: "999999999999999999",
      username: "x",
      manageableGuildIds: [],
      lastLoginAt: Date.now(),
    });
    stranger.sessions.push({
      _id: "s_x",
      token: "tok-x",
      userId: "u_x",
      createdAt: Date.now(),
      authVersion: CURRENT_SESSION_AUTH_VERSION,
    });
    await expectThrows(
      "người lạ không cấp được gói",
      () =>
        grantH(makeCtx(stranger), {
          token: "tok-x",
          discordId: "123456789012345678",
          plan: "supporter",
          days: 30,
        }),
      "Chỉ chủ sở hữu bot hoặc quản trị viên nhóm",
    );
    check("người lạ không để lại entitlement nào", stranger.entitlements.length === 0);

    // (d) input rác bị chặn TRƯỚC khi chạm dữ liệu
    await expectThrows(
      "Discord ID không hợp lệ → chặn",
      () =>
        grantH(makeCtx(seedTransfer()), {
          token: "tok-good",
          discordId: "abc",
          plan: "supporter",
          days: 30,
        }),
      "Discord ID không hợp lệ",
    );
    await expectThrows(
      "Server ID không hợp lệ → chặn",
      () =>
        grantH(makeCtx(seedTransfer()), {
          token: "tok-good",
          discordId: "123456789012345678",
          guildId: "xyz",
          plan: "supporter",
          days: 30,
        }),
      "Server ID không hợp lệ",
    );
    await expectThrows(
      "người CHƯA từng đăng nhập web → chặn rõ (không tạo tài khoản ngầm)",
      () =>
        grantH(makeCtx(seedTransfer()), {
          token: "tok-good",
          discordId: "111111111111111111",
          plan: "supporter",
          days: 30,
        }),
      "chưa từng đăng nhập web",
    );

    // (e) không bao giờ hạ gói / cộng dồn đúng chỗ
    const downgrade = seedTransfer();
    downgrade.entitlements.push({
      _id: "e_h",
      userId: "u1",
      discordId: "123456789012345678",
      guildId: TEST_GUILD,
      plan: "pioneer",
      startsAt: Date.now() - 86_400_000,
      expiresAt: Date.now() + 20 * 86_400_000,
      createdAt: Date.now() - 86_400_000,
      updatedAt: Date.now() - 86_400_000,
    });
    await expectThrows(
      "cấp gói thấp hơn gói đang chạy → chặn rõ",
      () =>
        grantH(makeCtx(downgrade), {
          token: "tok-good",
          discordId: "123456789012345678",
          plan: "supporter",
          days: 30,
        }),
      "không thể cấp gói thấp hơn",
    );

    const renew = seedTransfer();
    renew.entitlements.push({
      _id: "e_g",
      userId: "u1",
      discordId: "123456789012345678",
      guildId: TEST_GUILD,
      plan: "supporter",
      startsAt: Date.now() - 20 * 86_400_000,
      expiresAt: Date.now() + 10 * 86_400_000,
      createdAt: Date.now() - 20 * 86_400_000,
      updatedAt: Date.now() - 20 * 86_400_000,
    });
    const expBefore = renew.entitlements[0].expiresAt;
    const renewRes = await grantH(makeCtx(renew), {
      token: "tok-good",
      discordId: "123456789012345678",
      plan: "supporter",
      days: 30,
    });
    check(
      "gia hạn cộng thêm 30 ngày TỪ HẠN CŨ — không tính lại từ now, không tạo dòng song song",
      renewRes.ok === true &&
        renew.entitlements.length === 1 &&
        renew.entitlements[0].expiresAt === expBefore + 30 * 86_400_000,
      renew.entitlements[0],
    );

    // (f) truyền guildId → quyền lợi gắn theo SERVER (planForGuild đọc được ngay)
    const withGuild = seedTransfer();
    await grantH(makeCtx(withGuild), {
      token: "tok-good",
      discordId: "123456789012345678",
      guildId: TEST_GUILD,
      plan: "supporter",
      days: 30,
    });
    check(
      "truyền guildId → entitlement gắn đúng server đó",
      withGuild.entitlements[0]?.guildId === TEST_GUILD,
      withGuild.entitlements[0],
    );

    // (g)days bị kẹp trong [1, 365] — không ai cộng được nghìn năm một lệnh
    const clamp = seedTransfer();
    const big = await grantH(makeCtx(clamp), {
      token: "tok-good",
      discordId: "123456789012345678",
      plan: "supporter",
      days: 999,
    });
    check("days > 365 bị kẹp trần 365", big.days === 365, big);
    const tiny = await grantH(makeCtx(seedTransfer()), {
      token: "tok-good",
      discordId: "123456789012345678",
      plan: "supporter",
      days: 0,
    });
    check("days < 1 bị kẹp sàn 1", tiny.days === 1, tiny);

    // (h)premiumStatus: đơn đầu index HẾT HẠN nhưng đơn sau CÒN HẠN → lấy đơn sau
    const multi = seedTransfer();
    multi.entitlements.push(
      {
        _id: "e_x1",
        userId: "u1",
        discordId: "123456789012345678",
        plan: "pioneer",
        startsAt: Date.now() - 40 * 86_400_000,
        expiresAt: Date.now() - 10 * 86_400_000,
        createdAt: Date.now() - 40 * 86_400_000,
        updatedAt: Date.now() - 40 * 86_400_000,
      },
      {
        _id: "e_x2",
        userId: "u1",
        discordId: "123456789012345678",
        guildId: TEST_GUILD,
        plan: "supporter",
        startsAt: Date.now() - 5 * 86_400_000,
        expiresAt: Date.now() + 25 * 86_400_000,
        createdAt: Date.now() - 5 * 86_400_000,
        updatedAt: Date.now() - 5 * 86_400_000,
      },
    );
    const best = await premH(makeCtx(multi), { token: "tok-good" });
    check(
      "premiumStatus chọn đơn ĐANG còn hạn, không phải đơn đầu index",
      best?.plan === "supporter" && best.active === true,
      best,
    );

    const dead = seedTransfer();
    dead.entitlements.push({
      _id: "e_d",
      userId: "u1",
      discordId: "123456789012345678",
      plan: "pioneer",
      startsAt: Date.now() - 40 * 86_400_000,
      expiresAt: Date.now() - 10 * 86_400_000,
      createdAt: Date.now() - 40 * 86_400_000,
      updatedAt: Date.now() - 40 * 86_400_000,
    });
    const deadSt = await premH(makeCtx(dead), { token: "tok-good" });
    check(
      "từng mua nhưng hết hạn → active: false (UI nói rõ đã hết hạn)",
      deadSt?.plan === "pioneer" && deadSt.active === false,
      deadSt,
    );

    const freshUser = seed();
    const none = await premH(makeCtx(freshUser), { token: "tok-good" });
    check("chưa từng mua → null (trang giữ nguyên lời mời mua)", none === null, none);
  }

  console.log(`\n${pass}/${pass + fail} assertion xanh`);
  if (fail > 0) process.exit(1);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
