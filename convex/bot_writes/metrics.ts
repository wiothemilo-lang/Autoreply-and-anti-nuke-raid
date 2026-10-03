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
 * `await` tuần tự từng bản ghi, chỉ ghi 2 dòng rồi dọn cũ khi vượt trần.
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

  const latest = await ctx.db
    .query("botMetrics")
    .withIndex("by_kind_at", (q) => q.eq("kind", "latest"))
    .first();
  if (latest) {
    await ctx.db.patch(latest._id, { at, ...payload });
  } else {
    await ctx.db.insert("botMetrics", { kind: "latest" as const, at, ...payload });
  }

  await ctx.db.insert("botMetrics", { kind: "sample" as const, at, ...payload });

  // Dọn lịch sử cũ — chỉ khi vượt trần, và giới hạn số lần dọn mỗi lượt để
  // không phình chính mutation này khi bot chạy lâu.
  const samples = await ctx.db
    .query("botMetrics")
    .withIndex("by_kind_at", (q) => q.eq("kind", "sample"))
    .collect();
  if (samples.length > METRICS_HISTORY_CAP) {
    const excess = samples
      .sort((a, b) => a.at - b.at)
      .slice(0, samples.length - METRICS_HISTORY_CAP);
    await Promise.all(excess.slice(0, 200).map((row) => ctx.db.delete(row._id)));
  }

  return { ok: true, at };
}
