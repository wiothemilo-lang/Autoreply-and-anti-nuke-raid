/**
 * Chặn ĐỐT USAGE cho các HTTP action công khai còn lại (`/verify/*`).
 *
 * Lịch sử: file này từng tên `geoGuard.ts` và gồm cả trần cho `/geo_lang` —
 * endpoint dò quốc gia theo IP. Endpoint đó đã bị BỎ (13/11/2026) vì gửi IP
 * người dùng sang api.country.is trước consent, không có trong chính sách
 * quyền riêng tư. Chỉ còn trần của verify/self-test.
 *
 * Mô hình đe dọa: `/verify/complete` nằm trên miền công khai (`*.convex.site`),
 * KHÔNG auth, và mỗi lượt gọi bắt deployment chạy 1 action + có thể 1 fetch
 * ipapi.is. `curl` loop hoặc botnet đốt Function Calls + Action Compute +
 * egress tới khi cạn hạn mức của MỌI người dùng thật.
 *
 * Hai limiter TÁCH RIÊNG (verify và self-test) để admin bấm kiểm tra liên tục
 * không khoá đường xác minh của người dùng thật — lỗi đã sửa ở PR #106.
 *
 * LƯU Ý: bộ đếm là module state in-memory nên chỉ sống trong 1 instance — đủ
 * chặn scripted bursts, KHÔNG phải giải pháp distributed. Giống mức cam kết của
 * `rateGuard.ts` và các rate-limit khác trong repo.
 */

/** Cửa sổ trượt dùng chung cho mọi trần. */
export const RATE_WINDOW_MS = 60_000;

/**
 * Trần `/verify/complete` — 10 lượt/phút/IP là đủ cho retry mạng + bấm lại;
 * trần toàn cục 300/phút vì mỗi lượt vượt qua đây mới tốn 1 action + có thể
 * tốn 1 fetch ipapi.is.
 */
export const VERIFY_MAX_PER_IP_PER_MIN = 10;
export const VERIFY_MAX_GLOBAL_PER_MIN = 300;

/**
 * Trần `/verify/self-test` — self-test là thao tác admin, mỗi lượt có thể gọi
 * ipapi.is; 5 lượt/phút/IP là đủ cho debug.
 */
export const SELFTEST_MAX_PER_IP_PER_MIN = 5;
export const SELFTEST_MAX_GLOBAL_PER_MIN = 30;

type Limiter = {
  allow: (ip: string, now?: number) => boolean;
  reset: () => void;
};

/**
 * Bộ đếm sliding-window in-memory. Mỗi limiter có Map + trần riêng nên hai
 * endpoint không bao giờ tiêu lượt của nhau.
 */
function createLimiter(maxPerIp: number, maxGlobal: number): Limiter {
  const buckets = new Map<string, number[]>();
  let globalHits: number[] = [];
  let lastSweep = 0;

  /** Dọn IP không còn hoạt động để Map không phình vô hạn (throttle 1 phút/lần). */
  function sweep(now: number): void {
    if (now - lastSweep < RATE_WINDOW_MS) return;
    lastSweep = now;
    for (const [ip, hits] of buckets) {
      const last = hits[hits.length - 1] ?? 0;
      if (now - last > RATE_WINDOW_MS * 5) buckets.delete(ip);
    }
  }

  function allow(ip: string, now: number = Date.now()): boolean {
    if (!ip) return false;
    // Trần toàn cục trước — rẻ nhất và chặn botnet phân tán từ cửa.
    globalHits = globalHits.filter((t) => now - t < RATE_WINDOW_MS);
    if (globalHits.length >= maxGlobal) return false;

    const hits = (buckets.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
    if (hits.length >= maxPerIp) {
      buckets.set(ip, hits);
      return false; // lượt bị chặn KHÔNG tính vào trần toàn cục
    }
    hits.push(now);
    buckets.set(ip, hits);
    globalHits.push(now);
    sweep(now);
    return true;
  }

  function reset(): void {
    buckets.clear();
    globalHits = [];
    lastSweep = 0;
  }

  return { allow, reset };
}

const verifyLimiter = createLimiter(VERIFY_MAX_PER_IP_PER_MIN, VERIFY_MAX_GLOBAL_PER_MIN);
const selfTestLimiter = createLimiter(SELFTEST_MAX_PER_IP_PER_MIN, SELFTEST_MAX_GLOBAL_PER_MIN);

/** Còn lượt xác minh cho IP này? */
export const allowVerifyRequest = verifyLimiter.allow;

/** Còn lượt chạy self-test? Bộ đếm tách riêng, không tiêu lượt verify. */
export const allowVerifySelfTest = selfTestLimiter.allow;

/** Chỉ dùng trong test: xoá sạch bộ đếm của cả hai limiter. */
export function __resetHttpRateGuardForTest(): void {
  verifyLimiter.reset();
  selfTestLimiter.reset();
}
