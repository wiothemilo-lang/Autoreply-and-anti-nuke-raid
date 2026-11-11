/**
 * Chặn ĐỐT USAGE cho các HTTP action công khai (`/geo_lang`, `/verify/complete`).
 *
 * Mô hình đe dọa: `/geo_lang` nằm trên miền công khai (`*.convex.site`), KHÔNG
 * auth, và mỗi lượt gọi bắt deployment chạy 1 HTTP action + 1 fetch ra ngoài
 * (api.country.is). Một `curl` loop hoặc botnet biến ta thành proxy geo-IP miễn
 * phí và đốt Function Calls + Action Compute + egress cho tới khi cạn hạn mức
 * của MỌI người dùng thật.
 *
 * 3 lớp, tất cả đều RẺ và không chạm DB:
 *  1. Chuẩn hoá `x-forwarded-for` — nằm ở `clientIp.ts` (dùng chung với verify,
 *     lấy mục CUỐI thay vì mục đầu; xem chú thích ở đó).
 *  2. Chỉ nhận IP CÔNG CỘNG: loopback/riêng tư/link-local/multicast trả rỗng
 *     ngay, KHÔNG gọi upstream (bản cũ vẫn fetch vô ích cho những IP này).
 *  3. Trần sliding-window: mỗi IP 20 lượt/phút + trần toàn cục 300 lượt/phút mỗi
 *     instance (chống botnet phân tán, cùng approach với `rateGuard.ts`).
 *
 * `/verify/complete` dùng limiter RIÊNG (`allowVerifyRequest`) để flood
 * `/geo_lang` không khoá được đường xác minh — xem chú thích hằng số bên dưới.
 *
 * LƯU Ý: bộ đếm là module state in-memory nên chỉ sống trong 1 instance — đủ
 * chặn scripted bursts, KHÔNG phải giải pháp distributed. Giống mức cam kết của
 * `rateGuard.ts` và các rate-limit khác trong repo.
 */

/** Cửa sổ trượt dùng chung cho mọi trần. */
export const GEO_WINDOW_MS = 60_000;
/** Trần /geo_lang: mỗi IP / phút (web chỉ gọi endpoint này 1 lần mỗi phiên). */
export const GEO_MAX_PER_IP_PER_MIN = 20;
/** Trần /geo_lang tổng mọi IP / phút / instance — chặn botnet phân tán. */
export const GEO_MAX_GLOBAL_PER_MIN = 300;

/**
 * Trần RIÊNG của `/verify/complete` — KHÔNG dùng chung bộ đếm với `/geo_lang`.
 *
 * Vì sao phải tách: `/geo_lang` công khai, CORS mở, ai cũng gọi được. Nếu dùng
 * chung trần toàn cục thì một đợt flood `/geo_lang` (300 lượt/phút, chỉ cần
 * ~15 IP) khoá luôn đường xác minh của MỌI người trên instance đó — người thật
 * bị join gate đá ra vì một endpoint không liên quan. Test chặn tái diễn:
 * `scripts/test-rate-guard.ts` mục "hai bộ đếm độc lập".
 *
 * 10 lượt/phút/IP là đủ cho retry mạng + bấm lại; trần toàn cục giữ 300/phút
 * vì mỗi lượt vượt qua đây mới tốn 1 action + có thể tốn 1 fetch ipapi.is.
 */
export const VERIFY_MAX_PER_IP_PER_MIN = 10;
export const VERIFY_MAX_GLOBAL_PER_MIN = 300;

/**
 * Trần RIÊNG của `/verify/self-test`.
 *
 * Vì sao không dùng chung với `/verify/complete`: self-test là thao tác admin,
 * mỗi lượt có thể gọi ipapi.is; nếu dùng chung bucket thì một admin bấm kiểm
 * tra liên tục sẽ khoá đường xác minh của người dùng thật — đúng lỗi đã tách
 * ở PR #106. 5 lượt/phút/IP là đủ cho debug.
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
    if (now - lastSweep < GEO_WINDOW_MS) return;
    lastSweep = now;
    for (const [ip, hits] of buckets) {
      const last = hits[hits.length - 1] ?? 0;
      if (now - last > GEO_WINDOW_MS * 5) buckets.delete(ip);
    }
  }

  function allow(ip: string, now: number = Date.now()): boolean {
    if (!ip) return false;
    // Trần toàn cục trước — rẻ nhất và chặn botnet phân tán từ cửa.
    globalHits = globalHits.filter((t) => now - t < GEO_WINDOW_MS);
    if (globalHits.length >= maxGlobal) return false;

    const hits = (buckets.get(ip) ?? []).filter((t) => now - t < GEO_WINDOW_MS);
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

const geoLimiter = createLimiter(GEO_MAX_PER_IP_PER_MIN, GEO_MAX_GLOBAL_PER_MIN);
const verifyLimiter = createLimiter(VERIFY_MAX_PER_IP_PER_MIN, VERIFY_MAX_GLOBAL_PER_MIN);
const selfTestLimiter = createLimiter(SELFTEST_MAX_PER_IP_PER_MIN, SELFTEST_MAX_GLOBAL_PER_MIN);

/**
 * Còn lượt gọi upstream cho `/geo_lang`? Trả false nghĩa là caller phải trả đáp
 * án rỗng NGAY (không fetch) — chi phí còn lại của request ≈ 0.
 */
export const allowGeoRequest = geoLimiter.allow;

/**
 * Còn lượt xác minh cho IP này? Bộ đếm TÁCH BIỆT với `/geo_lang` (xem
 * `VERIFY_MAX_PER_IP_PER_MIN`) — flood endpoint geo không được khoá verify.
 */
export const allowVerifyRequest = verifyLimiter.allow;

/** Còn lượt chạy self-test? Bộ đếm tách riêng, không tiêu lượt verify. */
export const allowVerifySelfTest = selfTestLimiter.allow;

/** Chỉ dùng trong test: xoá sạch bộ đếm của CẢ BA limiter. */
export function __resetGeoGuardForTest(): void {
  geoLimiter.reset();
  verifyLimiter.reset();
  selfTestLimiter.reset();
}
