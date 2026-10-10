/**
 * Đợt #5 tách `convex/bot_writes.ts` (75KB) — nhóm SỐ ĐO HỆ THỐNG: bot đẩy
 * snapshot metrics định kỳ (bảng `botMetrics`, đợt #1 observability).
 *
 * Wrapper `export const X = mutation({…})` giữ NGUYÊN trong `convex/bot_writes.ts`
 * để tên function + validator không đổi (hợp đồng bot ⇄ Convex). Thân hàm nằm ở
 * đây — chỉ tách file, không đổi hành vi.
 */
import { v } from "convex/values";
import type { ObjectType } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import { requireBotKeyStrict } from "../botAuth";

/**
 * Trần số mẫu lịch sử số đo. Bot đẩy mỗi 5 phút → 288 mẫu/ngày. Giữ 2 ngày
 * (576 mẫu) là đủ vẽ xu hướng và tìm lúc hệ thống chậm, mà bảng không phình.
 * Dọn khi ghi nên không cần một cron riêng (bot không đẩy = có gì cần dọn?).
 */
const METRICS_HISTORY_CAP = 576;
/**
 * Đếm lại toàn lịch sử (≤ CAP+1 dòng) mỗi 24h để tự chữa sai số do push trùng
 * lặp/giao tranh làm lệch ±1 mẫu. Bình quân chi phí rải ~2 dòng/lượt đẩy, so
 * với việc collect() ~576 dòng MỖI lượt như trước (1.61GB I/O / 9 ngày).
 */
const METRICS_RECOUNT_INTERVAL_MS = 24 * 60 * 60_000;
/** Trần số khoá trong mỗi nhóm số đo — bot tự giới hạn 500, đây là lưới an toàn
 *  phía server (bot bị sửa cấu hình/đẩy rác thì bảng không phình vô hạn). */
const METRICS_KEY_CAP = 600;
/** Một con số số đo hợp lệ: hữu hạn và không quá khổng lồ (chặn 1e308/infinity). */
function finiteOrNull(n: number): number | undefined {
  return Number.isFinite(n) ? (Math.abs(n) < 1e15 ? n : undefined) : undefined;
}
function sanitizeRecord(input: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  let count = 0;
  for (const [key, value] of Object.entries(input ?? {})) {
    if (count >= METRICS_KEY_CAP) break;
    const clean = finiteOrNull(Number(value));
    // Khoá rác (quá dài) bỏ — dashboard chỉ hiển thị, không cần dữ liệu hỏng.
    if (clean === undefined || key.length > 200) continue;
    out[key] = clean;
    count++;
  }
  return out;
}

/**
 * Bot đẩy số liệu đo lường (bot/src/metrics.js → metricsRuntime.startMetrics).
 *
 * Ghi HAI dòng: `latest` (upsert, dashboard đọc) và `sample` (lịch sử để vẽ
 * đường). Số đo là việc thừa theo định kỳ, nên mutation này phải rẻ: không
 * `await` tuần tự từng bản ghi, chỉ ghi 2 dòng rồi dọn cũ O(1) — số mẫu lịch
 * sử được ĐẾM sẵn trên row `latest` (`sampleCount`) nên mỗi lượt đẩy chỉ đọc
 * phần vượt trần (thường 1 dòng), không collect() toàn bảng như trước.
 */
export const botRecordMetricsArgs = {
  at: v.number(),
  counters: v.record(v.string(), v.number()),
  gauges: v.record(v.string(), v.number()),
  histograms: v.record(v.string(), v.number()),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type BotRecordMetricsArgs = ObjectType<typeof botRecordMetricsArgs>;

export async function botRecordMetricsHandler(ctx: MutationCtx, args: BotRecordMetricsArgs) {
  await requireBotKeyStrict(ctx, args.botKey);
  const at = Number.isFinite(args.at) ? args.at : Date.now();
  const payload = {
    counters: sanitizeRecord(args.counters),
    gauges: sanitizeRecord(args.gauges),
    histograms: sanitizeRecord(args.histograms),
  };

  // 1 dòng `latest` — vừa upsert, vừa là nơi ĐẾM số mẫu lịch sử (không collect).
  const latest = await ctx.db
    .query("botMetrics")
    .withIndex("by_kind_at", (q) => q.eq("kind", "latest"))
    .first();

  // Số mẫu: đọc từ count đã lưu; đếm lại toàn lịch sử mỗi 24h (hoặc khi chưa
  // từng đếm — row cũ từ trước khi có field) để tự chữa sai số.
  const storedCount = typeof latest?.sampleCount === "number" ? latest.sampleCount : -1;
  const storedRecountAt = typeof latest?.sampleCountAt === "number" ? latest.sampleCountAt : 0;
  const needRecount = storedCount < 0 || at - storedRecountAt >= METRICS_RECOUNT_INTERVAL_MS;
  let sampleCount = needRecount
    ? (
        await ctx.db
          .query("botMetrics")
          .withIndex("by_kind_at", (q) => q.eq("kind", "sample"))
          .order("desc")
          .take(METRICS_HISTORY_CAP + 1)
      ).length
    : storedCount;

  // Trần lịch sử TRƯỚC khi chèn: chỉ đọc đúng phần vượt (0 dòng khi chưa vượt)
  // — mỗi lượt đẩy O(1) dòng thay vì quét toàn ~576 dòng như code cũ.
  if (sampleCount + 1 > METRICS_HISTORY_CAP) {
    const excess = sampleCount + 1 - METRICS_HISTORY_CAP;
    const oldest = await ctx.db
      .query("botMetrics")
      .withIndex("by_kind_at", (q) => q.eq("kind", "sample"))
      .order("asc")
      .take(excess);
    for (const row of oldest) await ctx.db.delete(row._id);
    sampleCount -= oldest.length;
  }
  sampleCount += 1;

  const countPatch = { sampleCount, ...(needRecount ? { sampleCountAt: at } : {}) };
  if (latest) {
    await ctx.db.patch(latest._id, { at, ...payload, ...countPatch });
  } else {
    await ctx.db.insert("botMetrics", {
      kind: "latest" as const,
      at,
      ...payload,
      ...countPatch,
    });
  }

  await ctx.db.insert("botMetrics", { kind: "sample" as const, at, ...payload });

  return { ok: true, at };
}
