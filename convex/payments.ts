/**
 * payments — đơn thanh toán ZaloPay cho /donate (ủng hộ) và /premium (gói tháng).
 *
 * Luồng tin cậy (KHÔNG bao giờ tin URL trả về hay client):
 *   1. Client gọi action `paymentsAction.startPayment` → server tạo đơn pending
 *      (createIntentInternal — CHẾT GIÁ TẠI ĐÂY: plan → amount, không nhận tiền
 *      từ client) rồi ký MAC + gọi ZaloPay create, trả paymentUrl.
 *   2. Trình duyệt redirect sang ZaloPay. Trả về trang /donate|/premium?order=
 *      → client gọi `paymentsAction.queryOrder` để TRUY VẤN lại trạng thái
 *      (không tin tham số URL). ZaloPay IPN cũng POST về
 *      `https://<site>.convex.site/zalopay/callback` (xem convex/http.ts).
 *   3. Cả hai đường (callback MAC key2 + query MAC key1) đều đã xác thực mới
 *      được markPaidInternal — CHỈ LÚC ĐÓ entitlement mới được ghi.
 *
 * Vì sao thuần TS phần MAC: Convex mặc định runtime không có node:crypto;
 * HMAC-SHA256 nằm ở convex/sha256.ts (đã có vector RFC 4231 trong test).
 *
 * Hết hạn tính LƯỜI: entitlement quá expiresAt là hết hạn ngay khi đọc —
 * không có cron (cron Convex repo này chỉ được đụng cờ trên guilds).
 */
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { getUserByToken } from "./auth";
import { hmacSha256Hex } from "./sha256";

// ── Bảng giá — SERVER chốt; client chỉ gửi plan, không gửi số tiền ──────────

/** Mức ủng hộ gợi ý (VND) — khớp các thẻ trên /donate. */
export const DONATE_TIERS_VND = [50_000, 100_000, 300_000] as const;
/** Giá gói tháng (VND) — khớp bảng giá trên /premium. */
export const PREMIUM_PLAN_VND: Record<string, number> = {
  supporter: 49_000,
  pioneer: 99_000,
};
/** Thứ bậc gói — mua gói thấp hơn khi gói cao đang chạy BỊ TỪ CHỐI. */
export const PLAN_RANK: Record<string, number> = { supporter: 1, pioneer: 2 };
export const DONATE_MIN_VND = 10_000;
export const DONATE_MAX_VND = 100_000_000;
/** Một kỳ Premium = 30 ngày. */
export const PREMIUM_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
/** Đơn quá tuổi này không gọi create nữa — ZaloPay bắt app_time không quá 15 phút. */
export const INTENT_TTL_MS = 14 * 60 * 1000;
/** Trần đơn pending trong 1 giờ mỗi người — chống spam tạo đơn tại ZaloPay. */
export const PENDING_CAP_PER_HOUR = 3;
const HOUR_MS = 60 * 60 * 1000;
/** Đơn pending quá tuổi này bị đóng thành expired khi người dùng tạo đơn mới. */
const INTENT_CLEAN_AFTER_MS = 24 * 60 * 60 * 1000;

export type PaymentKind = "donate" | "premium";

// ── Helper thuần (test hermetic không đụng DB/mạng) ────────────────────────

/**
 * Chốt số tiền theo plan — ném lỗi tiếng Việt thân thiện khi plan/amount sai.
 * Client KHÔNG BAO GIỜ gửi số tiền vào luồng này.
 */
export function resolveAmount(kind: PaymentKind, plan: string, customAmount?: number): number {
  if (kind === "premium") {
    const price = PREMIUM_PLAN_VND[plan];
    if (price === undefined) throw new Error(`Gói Premium không hợp lệ: ${plan}`);
    return price;
  }
  if (kind !== "donate") throw new Error(`Loại đơn không hợp lệ: ${kind}`);
  if (plan === "custom") {
    if (customAmount === undefined || !Number.isInteger(customAmount)) {
      throw new Error("Số tiền ủng hộ phải là số nguyên (VND).");
    }
    if (customAmount < DONATE_MIN_VND || customAmount > DONATE_MAX_VND) {
      throw new Error(
        `Số tiền phải từ ${DONATE_MIN_VND.toLocaleString("vi-VN")}đ đến ${DONATE_MAX_VND.toLocaleString("vi-VN")}đ.`,
      );
    }
    return customAmount;
  }
  const tier = Number(plan);
  if ((DONATE_TIERS_VND as readonly number[]).includes(tier)) return tier;
  throw new Error(`Mức ủng hộ không hợp lệ: ${plan}`);
}

/**
 * Mã đơn ZaloPay: tiền tố yymmdd theo GIỜ VIỆT NAM (GMT+7) — ZaloPay đối
 * soát theo ngày VN nên dùng UTC là lệch ngày vào 17h–24h.
 */
export function buildAppTransId(now: number, suffix: string): string {
  const vn = new Date(now + 7 * 3600_000);
  const yy = String(vn.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(vn.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(vn.getUTCDate()).padStart(2, "0");
  return `${yy}${mm}${dd}_${suffix}`.slice(0, 40);
}

/** Phần ngẫu nhiên sau ngày — Date.now().toString(36) + 3 ký tự base36. */
export function newIntentSuffix(now: number): string {
  const rand = Math.floor(Math.random() * 36 ** 3)
    .toString(36)
    .padStart(3, "0");
  return `${now.toString(36)}${rand}`;
}

/** hmac_input của create order (docs ZaloPay v2). */
export function createOrderMacInput(o: {
  appId: string | number;
  appTransId: string;
  appUser: string;
  amount: number;
  appTime: number;
  embedData: string;
  item: string;
}): string {
  return [o.appId, o.appTransId, o.appUser, o.amount, o.appTime, o.embedData, o.item].join("|");
}

export function createOrderMacHex(
  key1: string,
  o: Parameters<typeof createOrderMacInput>[0],
): string {
  return hmacSha256Hex(key1, createOrderMacInput(o));
}

/** hmac_input của query status = app_id|app_trans_id|key1 (docs ZaloPay). */
export function queryOrderMacHex(key1: string, appId: string | number, appTransId: string): string {
  return hmacSha256Hex(key1, `${appId}|${appTransId}|${key1}`);
}

/** So sánh tránh lộ thời gian — MAC sai 1 bit cũng phải trả false. */
function equalHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Kiểm MAC callback từ ZaloPay: HMAC-SHA256(key2, data) — key2 là "callback
 * key" (docs: key1 ký YÊU CẦU đi, key2 ký PHẢN HỒI về).
 */
export function verifyCallbackMacHex(data: string, mac: string, key2: string): boolean {
  if (!data || !mac || !key2) return false;
  return equalHex(hmacSha256Hex(key2, data), mac.toLowerCase());
}

/** Gốc dashboard (ví dụ https://protogon.freebuff.app) cho redirecturl. */
export function dashboardOrigin(dashboardUrl?: string, oauthRedirectUri?: string): string {
  for (const raw of [dashboardUrl, oauthRedirectUri]) {
    if (!raw) continue;
    try {
      return new URL(raw).origin;
    } catch {
      // nguồn tiếp theo
    }
  }
  return "";
}

/** Mô tả đơn hiển thị trong app ZaloPay (≤256 ký tự). */
export function paymentDescription(kind: PaymentKind, plan: string, appTransId: string): string {
  const label = kind === "premium" ? `Premium gói ${plan}` : "Ủng hộ nhà phát triển";
  return `Protogon - ${label} #${appTransId}`;
}

export type EntitlementSnapshot = { plan: string; expiresAt: number; startsAt?: number };

/**
 * Cộng dồn quyền lợi Premium khi một đơn premium được thanh toán:
 *  - Chưa có / đã hết hạn → bắt đầu kỳ 30 ngày mới.
 *  - Cùng gói → gia hạn: cộng 30 ngày từ max(now, hạn cũ).
 *  - Cao hơn gói hiện tại → đổi gói NGAY + cộng 30 ngày (trả thêm tiền cho
 *    gói cao hơn nên không có khe gian "mua rẻ gia hạn gói đắt").
 *  - Thấp hơn gói đang chạy → trả về null: KHÔNG đổi gì (bị chặn từ lúc tạo
 *    đơn; nếu đơn cũ vẫn kịp thanh toán thì quyền hiện tại không bị hạ).
 */
export function applyEntitlement(
  current: EntitlementSnapshot | null,
  plan: string,
  now: number,
): { plan: string; startsAt: number; expiresAt: number } | null {
  const rank = PLAN_RANK[plan];
  if (rank === undefined) return null;
  if (!current || current.expiresAt <= now) {
    return { plan, startsAt: now, expiresAt: now + PREMIUM_MONTH_MS };
  }
  const curRank = PLAN_RANK[current.plan] ?? 0;
  if (rank < curRank) return null;
  const upgraded = rank > curRank;
  return {
    plan: upgraded ? plan : current.plan,
    startsAt: upgraded ? now : (current.startsAt ?? now),
    expiresAt: Math.max(now, current.expiresAt) + PREMIUM_MONTH_MS,
  };
}

/** Quyền lợi còn hiệu lực tại `now` (hết hạn lười — không cần cron dọn). */
export function isEntitled(ent: { expiresAt: number } | null | undefined, now: number): boolean {
  return !!ent && ent.expiresAt > now;
}

// ── Mutations/queries nội bộ (action + httpAction gọi qua ctx.run*) ─────────

/**
 * Tạo đơn pending. Gọi MỘT LẦN từ paymentsAction.startPayment — validates
 * phiên, bảng giá, chặn mua gói thấp hơn, chặn spam pending, sinh appTransId.
 */
export const createIntentInternal = internalMutation({
  args: {
    token: v.string(),
    kind: v.union(v.literal("donate"), v.literal("premium")),
    plan: v.string(),
    customAmount: v.optional(v.number()),
  },
  handler: async (ctx, { token, kind, plan, customAmount }) => {
    const user = await getUserByToken(ctx, token);
    if (!user) throw new Error("Phiên đăng nhập không hợp lệ — hãy đăng nhập lại.");
    const amount = resolveAmount(kind, plan, customAmount);
    const now = Date.now();

    // Chống spam: tối đa 3 đơn chưa xong trong 1 giờ; đóng dọn đơn cũ treo.
    const recent = await ctx.db
      .query("payments")
      .withIndex("by_userId_createdAt", (q) =>
        q.eq("userId", user._id).gte("createdAt", now - HOUR_MS),
      )
      .collect();
    if (recent.filter((p) => p.status === "pending").length >= PENDING_CAP_PER_HOUR) {
      throw new Error("Bạn có quá nhiều đơn chưa thanh toán — thử lại sau ít phút nhé.");
    }
    const stale = await ctx.db
      .query("payments")
      .withIndex("by_userId_createdAt", (q) =>
        q.eq("userId", user._id).lt("createdAt", now - INTENT_CLEAN_AFTER_MS),
      )
      .take(20);
    for (const p of stale) {
      if (p.status === "pending") {
        await ctx.db.patch(p._id, { status: "expired", updatedAt: now });
      }
    }

    // Premium: từ chối mua gói thấp hơn quyền đang có TRƯỚC KHI tốn một đơn
    // ZaloPay nào (không thể "mua gói rẻ để kéo dài gói đắt").
    if (kind === "premium") {
      const ent = await ctx.db
        .query("entitlements")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .first();
      const active =
        isEntitled(ent, now) && ent ? { plan: ent.plan, expiresAt: ent.expiresAt } : null;
      if (active && applyEntitlement(active, plan, now) === null) {
        const days = Math.ceil((active.expiresAt - now) / (24 * 60 * 60 * 1000));
        throw new Error(
          `Bạn đang có gói ${active.plan} (còn ${days} ngày) — không thể mua gói thấp hơn.`,
        );
      }
    }

    // Sinh mã đơn duy nhất (tiền tố yymmdd GMT+7 theo yêu cầu ZaloPay).
    let appTransId = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      const candidate = buildAppTransId(now, newIntentSuffix(now));
      const dup = await ctx.db
        .query("payments")
        .withIndex("by_appTransId", (q) => q.eq("appTransId", candidate))
        .first();
      if (!dup) {
        appTransId = candidate;
        break;
      }
    }
    if (!appTransId) throw new Error("Không sinh được mã đơn — thử lại sau.");

    const paymentId = await ctx.db.insert("payments", {
      userId: user._id,
      discordId: user.discordId,
      kind,
      plan,
      amount,
      appTransId,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    return { paymentId, appTransId, amount, kind, plan, discordId: user.discordId, createdAt: now };
  },
});

/** Action đọc đơn của CHÍNH người đang gọi (queryOrder) — null nếu không thuộc về họ. */
export const getOwnedOrderByRef = internalQuery({
  args: { token: v.string(), appTransId: v.string() },
  handler: async (ctx, { token, appTransId }) => {
    const user = await getUserByToken(ctx, token);
    if (!user) return null;
    const row = await ctx.db
      .query("payments")
      .withIndex("by_appTransId", (q) => q.eq("appTransId", appTransId))
      .first();
    if (!row || row.userId !== user._id) return null;
    return {
      paymentId: row._id,
      appTransId: row.appTransId,
      amount: row.amount,
      kind: row.kind,
      plan: row.plan,
      status: row.status,
      createdAt: row.createdAt,
    };
  },
});

/**
 * Đánh dấu đã thanh toán — GỐC DUY NHẤT ghi entitlement. Idempotent: ZaloPay
 * gửi callback nhiều lần + queryPage vẫn kẹt một lần cũng chỉ ghi một lần.
 * Tiền lệch so với đơn vẫn ghi nhận (đã MAC-verify với ZaloPay là tiền THẬT)
 * nhưng lưu note vào error để đối soát.
 */
export const markPaidInternal = internalMutation({
  args: {
    appTransId: v.string(),
    amountPaid: v.number(),
    zpTransId: v.optional(v.string()),
    source: v.string(),
  },
  handler: async (ctx, { appTransId, amountPaid, zpTransId, source }) => {
    const row = await ctx.db
      .query("payments")
      .withIndex("by_appTransId", (q) => q.eq("appTransId", appTransId))
      .first();
    if (!row) return { ok: false as const, reason: "unknown_order" };
    if (row.status === "paid") return { ok: true as const, alreadyPaid: true as const };

    const now = Date.now();
    const mismatch = row.amount !== amountPaid;
    await ctx.db.patch(row._id, {
      status: "paid",
      paidAt: now,
      updatedAt: now,
      zpTransId: zpTransId || undefined,
      error: mismatch
        ? `Số tiền lệch: ZaloPay báo ${amountPaid}đ nhưng đơn là ${row.amount}đ [${source}]`
        : undefined,
    });

    if (row.kind === "premium") {
      const ent = await ctx.db
        .query("entitlements")
        .withIndex("by_userId", (q) => q.eq("userId", row.userId))
        .first();
      const active =
        isEntitled(ent, now) && ent
          ? { plan: ent.plan, expiresAt: ent.expiresAt, startsAt: ent.startsAt }
          : null;
      const next = applyEntitlement(active, row.plan, now);
      if (next) {
        if (ent) {
          await ctx.db.patch(ent._id, {
            plan: next.plan,
            startsAt: next.startsAt,
            expiresAt: next.expiresAt,
            lastPaymentId: row._id,
            updatedAt: now,
          });
        } else {
          await ctx.db.insert("entitlements", {
            userId: row.userId,
            discordId: row.discordId,
            plan: next.plan,
            startsAt: next.startsAt,
            expiresAt: next.expiresAt,
            lastPaymentId: row._id as Id<"payments">,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }
    return { ok: true as const };
  },
});

/** Ghi lỗi API (create/query fail) vào đơn — không đổi trạng thái, không lộ key. */
export const recordErrorInternal = internalMutation({
  args: { appTransId: v.string(), error: v.string() },
  handler: async (ctx, { appTransId, error }) => {
    const row = await ctx.db
      .query("payments")
      .withIndex("by_appTransId", (q) => q.eq("appTransId", appTransId))
      .first();
    if (!row) return;
    await ctx.db.patch(row._id, { error: error.slice(0, 300), updatedAt: Date.now() });
  },
});

// ── Queries công khai (client đã đăng nhập gọi qua token) ───────────────────

/** Trạng thái gói Premium của người gọi — trang /premium hiển thị. */
export const premiumStatus = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await getUserByToken(ctx, token);
    if (!user) return null;
    const ent = await ctx.db
      .query("entitlements")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();
    if (!ent) return null;
    return {
      plan: ent.plan,
      startsAt: ent.startsAt,
      expiresAt: ent.expiresAt,
      active: isEntitled(ent, Date.now()),
    };
  },
});

/** Trạng thái một đơn của người gọi — trang trả về vẽ trạng thái đầu tiên. */
export const getPaymentForReturn = query({
  args: { token: v.string(), appTransId: v.string() },
  handler: async (ctx, { token, appTransId }) => {
    const user = await getUserByToken(ctx, token);
    if (!user) return null;
    const row = await ctx.db
      .query("payments")
      .withIndex("by_appTransId", (q) => q.eq("appTransId", appTransId))
      .first();
    if (!row || row.userId !== user._id) return null;
    return { status: row.status, kind: row.kind, plan: row.plan, amount: row.amount };
  },
});

/** 10 đơn gần nhất của người gọi (lịch sử ủng hộ/mua Premium). */
export const history = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await getUserByToken(ctx, token);
    if (!user) return [];
    const rows = await ctx.db
      .query("payments")
      .withIndex("by_userId_createdAt", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(10);
    return rows.map((p) => ({
      appTransId: p.appTransId,
      kind: p.kind,
      plan: p.plan,
      amount: p.amount,
      status: p.status,
      createdAt: p.createdAt,
      paidAt: p.paidAt,
    }));
  },
});
