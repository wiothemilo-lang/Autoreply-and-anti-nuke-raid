// Quyền lợi theo gói — MỘT nguồn sự thật duy nhất (08/10/2026).
//
// Vì sao file này tồn tại: trước đây /premium quảng cáo 6 tính năng nhưng CODE
// không enforce gì cả (bot không đọc entitlement, chỉ trang bán tự khoe) →
// khách trả tiền xong không thấy khác gì, tức là "bán thứ không tồn tại". Từ
// nay MỌI hạn mức nằm ở đây; trang bán đọc CHÍNH bảng này qua `catalog()` nên
// marketing và hành vi thật không thể lệch nhau nữa.
//
// PHẠM VI GÓI: theo SERVER (không theo người). Lý do: tính năng của bot là
// per-server (một server có nhiều quản trị viên), và khách trả tiền cho server
// họ vận hành. Vì vậy `entitlements.guildId` là khoá quyền lợi, còn
// `entitlements.userId` chỉ để biết ai đã trả.
//
// Mọi hạn mức đều được enforce ở TẦNG GHI (mutation) — ẩn nút trên web không
// phải là bảo vệ: gọi API trực tiếp phải bị chặn như nhau.
import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { canManageGuild, getUserByToken } from "./auth";

/**
 * Phiên bản điều khoản mua bán. TĂNG số này mỗi khi đổi nội dung chính sách ở
 * `src/lib/legalContent.ts` / mục chính sách của /premium: đơn cũ giữ phiên bản
 * cũ (đúng nguyên tắc điều khoản tại thời điểm giao kết), khách phải đồng ý lại
 * trước khi tạo đơn mới. Server trả số này qua `catalog()` để web gửi lại —
 * nhờ vậy web không thể "quên" cập nhật.
 */
export const TERMS_VERSION = 1;

export type PlanId = "free" | "supporter" | "pioneer";

/** Thứ tự gói — dùng để so gói nào cao hơn (nâng/hạ). */
export const PLAN_ORDER: PlanId[] = ["free", "supporter", "pioneer"];

export const PLAN_LABELS: Record<PlanId, string> = {
  free: "Miễn phí",
  supporter: "Đồng hành",
  pioneer: "Tiên phong",
};

/**
 * Hạn mức tính bằng SỐ (càng lớn càng rộng) — khớp trần cứng của hệ thống.
 *
 * Nhóm ĐẶC QUYỀN DỮ LIỆU (P1–P4, 10/10/2026): bốn hạn mức cuối là thứ gói trả
 * phí mua thêm — xuất dữ liệu nhiều hơn, xuất được lịch sử xa hơn, xem nhiều
 * dòng hơn ở hai chỗ đọc nặng nhất. Tất cả đều là số ĐO ĐƯỢC và chặn ở tầng
 * đọc (`.take(min(..., limit))`), không phải ẩn nút trên web.
 */
export type PlanLimits = {
  /** Số rule auto reply mỗi server. */
  autoReplyRules: number;
  /** Số từ khoá cấm (automod) mỗi server. */
  badWords: number;
  /** Số bản backup giữ lại (bản mới nhất). */
  backupKeepCount: number;
  /** Số ngày giữ backup (0 = tắt dọn theo ngày). */
  backupKeepDays: number;
  /** Số dòng tối đa MỘT lượt xuất CSV (báo cáo/lịch sử) — 0 = không cho xuất. */
  exportRows: number;
  /** Cửa sổ ngày lịch sử mà lượt xuất CSV đọc tới. */
  exportDays: number;
  /** Số dòng bảng nhiệt trả về cho /stats (top thành viên nhiệt cao nhất). */
  heatTopRows: number;
  /** Số dòng log hành động mod hiện trên dashboard (panel Log hành động). */
  historyRows: number;
};

/**
 * Bảng hạn mức. Gói Tiên phong chạm TRẦN CỨNG của hệ thống (50 rule / 100 từ
 * khoá / 50 bản / 365 ngày) chứ không phải "vô hạn" — ghi vô hạn rồi chặn ở
 * nơi khác là kiểu hứa suông mà file này sinh ra để chấm dứt.
 */
export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    autoReplyRules: 5,
    badWords: 20,
    backupKeepCount: 3,
    backupKeepDays: 7,
    // Miễn phí VẪN xuất được dữ liệu (không phải tính năng khoá sau tường):
    // 100 dòng và 90 ngày là đủ cho một server cộng đồng soi lại sự cố.
    exportRows: 100,
    exportDays: 90,
    heatTopRows: 10,
    historyRows: 30,
  },
  supporter: {
    autoReplyRules: 30,
    badWords: 60,
    backupKeepCount: 10,
    backupKeepDays: 30,
    exportRows: 1_000,
    exportDays: 365,
    heatTopRows: 30,
    historyRows: 100,
  },
  pioneer: {
    autoReplyRules: 50,
    badWords: 100,
    backupKeepCount: 50,
    backupKeepDays: 365,
    exportRows: 2_000,
    exportDays: 1_095,
    heatTopRows: 50,
    historyRows: 200,
  },
};

/** Trần cứng toàn hệ thống — không gói nào (kể cả tương lai) vượt được. */
export const HARD_CAPS: Record<keyof PlanLimits, number> = {
  autoReplyRules: 50,
  badWords: 100,
  backupKeepCount: 50,
  backupKeepDays: 365,
  exportRows: 2_000,
  exportDays: 1_095,
  heatTopRows: 50,
  historyRows: 200,
};

/** Nhãn tiếng Việt của từng hạn mức — dùng trong thông báo lỗi. */
export const LIMIT_LABELS: Record<keyof PlanLimits, string> = {
  autoReplyRules: "rule auto reply",
  badWords: "từ khoá cấm",
  backupKeepCount: "bản backup giữ lại",
  backupKeepDays: "ngày giữ backup",
  exportRows: "dòng mỗi lượt xuất dữ liệu",
  exportDays: "ngày lịch sử xuất được",
  heatTopRows: "dòng bảng nhiệt",
  historyRows: "dòng log hành động",
};

/** Chuẩn hoá chuỗi gói bất kỳ về PlanId (dữ liệu bẩn trong DB không thành quyền). */
export function asPlanId(plan: string | null | undefined): PlanId {
  return plan === "supporter" || plan === "pioneer" ? plan : "free";
}

export function planLimits(plan: string | null | undefined): PlanLimits {
  return PLAN_LIMITS[asPlanId(plan)];
}

/** Gói kế tiếp để gợi ý nâng cấp (pioneer là cao nhất → null). */
export function nextPlan(plan: string | null | undefined): PlanId | null {
  const id = asPlanId(plan);
  return id === "free" ? "supporter" : id === "supporter" ? "pioneer" : null;
}

/**
 * Chặn vượt hạn mức — ném lỗi NÓI RÕ đang ở gói nào, trần bao nhiêu và gói kế
 * tiếp cho bao nhiêu. Lỗi mơ hồ ("không hợp lệ") khiến khách tưởng bot lỗi và
 * bỏ luôn việc nâng gói.
 */
export function assertWithinLimit(
  plan: string | null | undefined,
  key: keyof PlanLimits,
  next: number,
): void {
  const id = asPlanId(plan);
  const cap = PLAN_LIMITS[id][key];
  if (next <= cap) return;
  const up = nextPlan(id);
  const hint =
    up === null
      ? ` Bạn đã ở gói cao nhất — hãy giảm xuống ${cap} ${LIMIT_LABELS[key]}.`
      : ` Nâng lên gói ${PLAN_LABELS[up]} để dùng ${PLAN_LIMITS[up][key]} ${LIMIT_LABELS[key]}.`;
  throw new Error(`Gói ${PLAN_LABELS[id]} cho tối đa ${cap} ${LIMIT_LABELS[key]}.${hint}`);
}

/**
 * Quyền lợi CỦA MỘT NGƯỜI — entitlement đang hiệu lực và CAO NHẤT (null = chưa
 * mua / đã hết hạn).
 *
 * Vì sao không lấy `.first()`: một người có thể có nhiều dòng (mua cho nhiều
 * server, đơn cũ hết hạn) — tin dòng đầu là có thể gắn nhãn "gói Tiên phong"
 * cho một đơn đã chết trong khi đơn còn hạn nằm ngay sau đó.
 *
 * Dòng có `plan` lạ/rác bị LOẠI (asPlanId → free → bỏ qua) — dữ liệu bẩn không
 * bao giờ thành quyền lợi hiển thị.
 */
export async function bestEntitlementForUser(
  ctx: QueryCtx,
  userId: Id<"users"> | null | undefined,
): Promise<{ plan: string; startsAt: number; expiresAt: number } | null> {
  if (!userId) return null;
  const rows = await ctx.db
    .query("entitlements")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  const now = Date.now();
  let best: { plan: string; startsAt: number; expiresAt: number } | null = null;
  let bestRank = -1;
  for (const r of rows) {
    if (r.expiresAt <= now) continue;
    const plan = asPlanId(r.plan);
    if (plan === "free") continue;
    const rank = PLAN_ORDER.indexOf(plan);
    if (rank > bestRank) {
      best = { plan, startsAt: r.startsAt, expiresAt: r.expiresAt };
      bestRank = rank;
    }
  }
  return best;
}

/** Kết quả tra gói của một server. */
export type GuildPlan = { plan: PlanId; expiresAt: number | null };

/**
 * Gói đang có hiệu lực của MỘT server: lấy dòng entitlement còn hạn cao nhất.
 * Hết hạn = về gói Miễn phí ngay (không grace ở tầng dữ liệu; grace nếu cần sẽ
 * là chính sách riêng, không phải "quên kiểm tra hạn").
 */
export async function planForGuild(ctx: any, guildId: string): Promise<GuildPlan> {
  const now = Date.now();
  const rows = await ctx.db
    .query("entitlements")
    .withIndex("by_guildId", (q: any) => q.eq("guildId", guildId))
    .collect();
  let best: GuildPlan = { plan: "free", expiresAt: null };
  for (const r of rows as Array<{ plan?: string; expiresAt?: number }>) {
    if (!r.expiresAt || r.expiresAt <= now) continue;
    const id = asPlanId(r.plan);
    if (id === "free") continue;
    const better =
      best.expiresAt === null ||
      PLAN_ORDER.indexOf(id) > PLAN_ORDER.indexOf(best.plan) ||
      (id === best.plan && r.expiresAt > best.expiresAt);
    if (better) best = { plan: id, expiresAt: r.expiresAt };
  }
  return best;
}

/**
 * Bảng quyền lợi CÔNG KHAI cho trang bán + hộp thoại đồng ý điều khoản đọc
 * (không cần token: đây là thông tin niêm yết, phải xem được trước khi đăng nhập).
 */
export const catalog = query({
  args: {},
  handler: () => ({
    termsVersion: TERMS_VERSION,
    limits: PLAN_LIMITS,
    labels: PLAN_LABELS,
    hardCaps: HARD_CAPS,
  }),
});

/**
 * Gói của một server cho dashboard: badge "đang dùng gói nào, còn mấy ngày",
 * hạn mức để hiện trong panel, và mốc hết hạn để nhắc gia hạn. Trả null khi
 * người gọi không quản lý được server đó.
 */
export const guildPlan = query({
  args: { token: v.string(), guildId: v.string() },
  handler: async (ctx, { token, guildId }) => {
    const user = await getUserByToken(ctx, token);
    if (!user) return null;
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild || !canManageGuild(user, guild)) return null;
    const { plan, expiresAt } = await planForGuild(ctx, guildId);
    return { guildId, plan, expiresAt, limits: planLimits(plan), labels: PLAN_LABELS };
  },
});
