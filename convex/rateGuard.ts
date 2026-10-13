"use node";

/**
 * Rate-guard dùng chung chống ĐỐT USAGE cho các action public KHÔNG auth.
 *
 * Mô hình đe dọa: kẻ xấu spam endpoint public (curl loop / botnet) để đốt
 * Function Calls + Action Compute + I/O của deployment free tier → làm cạn
 * hạn mức cho mọi người dùng thật trước khi hết tháng.
 *
 * 2 tầng (best-effort in-memory, cùng approach với login/haimiya rate-limit):
 *  - Per-identity: sliding window theo identity của người gọi (user identity
 *    khi đăng nhập, hash IP khi ẩn danh).
 *  - Toàn cục: trần tổng cộng mọi identity trong 1 phút — chống botnet phân tán.
 *
 * Khi vượt trần: handler trả giá trị fallback NHẸ (không chạm DB, không gọi
 * Discord) — chi phí còn lại của request ≈ 0, và hợp đồng no-throw được giữ
 * nguyên (Convex production mask error message của action).
 *
 * LƯU Ý: in-memory chỉ sống trong 1 instance action — đủ chặn scripted bursts,
 * không phải giải pháp distributed. Chấp nhận như các rate-limit khác trong repo.
 */

const buckets = new Map<string, { calls: number[] }>();

/** Dọn bucket rác định kỳ để Map không phình vô hạn. */
let lastSweep = 0;
function sweep(now: number, windowMs: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, entry] of buckets) {
    if (entry.calls.length === 0 || now - entry.calls[entry.calls.length - 1] > windowMs * 5) {
      buckets.delete(key);
    }
  }
}

function record(key: string, now: number, windowMs: number, max: number): boolean {
  sweep(now, windowMs);
  const entry = buckets.get(key) ?? { calls: [] };
  entry.calls = entry.calls.filter((t) => now - t < windowMs);
  if (entry.calls.length >= max) {
    buckets.set(key, entry);
    return false;
  }
  entry.calls.push(now);
  buckets.set(key, entry);
  return true;
}

export interface PublicActionGuardOptions {
  /** Tên endpoint (dùng làm khóa riêng để bucket không trộn lẫn). */
  name: string;
  /** Số lần tối đa mỗi identity ĐÃ ĐĂNG NHẬP trong 1 phút. */
  maxPerMin: number;
  /** Trần toàn cục mỗi phút — cũng là trần gộp cho khách ẩn danh (chống botnet). */
  globalMaxPerMin: number;
}

export interface PublicActionGuardResult {
  ok: boolean;
}

/**
 * Kiểm tra rate-limit cho 1 action public. Gọi ĐẦU handler; khi `ok === false`
 * handler phải trả fallback nhẹ ngay (không chạm DB).
 */
export async function rateLimitPublicAction(
  ctx: any,
  { name, maxPerMin, globalMaxPerMin }: PublicActionGuardOptions,
): Promise<PublicActionGuardResult> {
  const now = Date.now();
  const windowMs = 60_000;

  // Trần toàn cục trước — rẻ nhất và chặn botnet ngay từ cửa. Bucket này cũng
  // chính là trần cho MỌI khách ẩn danh gộp lại (Convex không expose IP/header
  // cho function nên không tách được theo IP): fallback trả ngay khi vượt nên
  // người ẩn danh thật vẫn nhận config mặc định, không có gì vỡ.
  if (!record(`__global__:${name}`, now, windowMs, globalMaxPerMin)) return { ok: false };

  // Identity: chỉ per-identity khi ĐÃ đăng nhập. Ẩn danh dùng chung trần toàn cục.
  // Convex Auth interface CHỈ có getUserIdentity() (trả Promise<UserIdentity|null>)
  // — KHÔNG có getIdentity(). Bản cũ gọi getIdentity (undefined) nên per-identity
  // bucket là CODE CHẾT, chỉ còn bucket toàn cục (bug thật, subagent audit bắt).
  let identity: any = null;
  try {
    identity = (await ctx?.auth?.getUserIdentity?.()) ?? null;
  } catch {
    identity = null;
  }
  const raw =
    typeof identity === "string"
      ? identity
      : [identity?.subject, identity?.tokenIdentifier].find(
          (value) => typeof value === "string" && value.trim().length > 0,
        );
  const subject = typeof raw === "string" ? raw.trim().slice(0, 256) : "";
  if (!subject) return { ok: true };
  return { ok: record(`${name}:${subject}`, now, windowMs, maxPerMin) };
}

/** Chỉ dùng trong test: xóa sạch bucket. */
export function __resetRateGuardForTest(): void {
  buckets.clear();
  lastSweep = 0;
}
