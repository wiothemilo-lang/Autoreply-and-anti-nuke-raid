/**
 * resilience.js — trần thời gian + backoff có jitter cho MỌI lời gọi ra ngoài.
 *
 * Vì sao có: sự cố CI vừa rồi (02/10) treo vì `Cdp.send()` chờ browser trả lời
 * MÃI — không timeout, không dọn entry. Cùng MẪU BỆNH đó còn nằm ở đường sống
 * còn của bot: `ConvexHttpClient` không có trần, nên một lượt gọi Convex treo sẽ
 * **treo luôn luồng chống raid** đang chờ nó. Trần của tầng trên (nếu có) chỉ
 * che lỗi, không sửa được.
 *
 * Ba thứ ở đây, đủ để không phải tự chế lại ở từng chỗ gọi:
 *  1. `withTimeout` — chốt thời gian cho một promise bất kỳ.
 *  2. `fetchWithTimeout` / `wrapFetch` — cùng chốt đó, nhưng dùng
 *     `AbortController` để NGẮT KẾT NỐI thật (không chỉ bỏ chờ, để socket không
 *     bị rò và upstream biết ta đã đi).
 *  3. `backoffDelayMs` — exponential **full jitter**. Backoff không jitter khiến
 *     mọi client cùng nhịp thử lại (thundering herd) — đúng lúc hệ thống đích
 *     đang yếu nhất.
 *
 * ĐIỂM NỐI QUAN TRỌNG: lỗi quá hạn được gán `code = "ETIMEDOUT"` — chính mã mà
 * `withRetry()` trong `bot/src/convex.js` đã coi là **đáng thử lại**. Nhờ vậy
 * một lượt Convex treo trở thành "chậm rồi thử lại" thay vì "treo vĩnh viễn",
 * mà không phải sửa gì thêm ở chỗ gọi.
 *
 * KHÔNG phải viên đạn bạc — cái giá phải nói rõ: mutation Convex KHÔNG idempotent,
 * nên thử lại sau khi quá hạn có thể ghi hai lần. Thà thế còn hơn treo mãi, vì
 * rủi ro ghi lặp vốn đã tồn tại (withRetry đã thử lại khi lỗi mạng) và cửa sổ
 * quá hạn được đặt rộng (15s) để chỉ bắt được treo THẬT.
 */

/** Trần mặc định cho một lời gọi Convex — rộng rãi để chỉ bắt treo thật. */
const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

/**
 * Lỗi quá hạn. `code = "ETIMEDOUT"` là CHỦ Ý: khớp đúng mã mà `withRetry` đã
 * coi là đáng thử lại, và khớp quy ước lỗi socket của Node.
 */
class TimeoutError extends Error {
  constructor(label, ms) {
    super(`Quá hạn ${ms}ms: ${label}`);
    this.name = "TimeoutError";
    this.code = "ETIMEDOUT";
    this.label = label;
    this.timeoutMs = ms;
  }
}

/**
 * Chuẩn hoá trần thời gian: `ms` rác (0, âm, NaN, chuỗi) → trần mặc định.
 *
 * Tách thành hàm riêng vì đây là QUY TẮC, không phải chi tiết cài đặt: "ms rác
 * nghĩa là chờ vô hạn" từng là lỗi thật ở nhiều hệ thống, và nó cũng cho phép
 * test kiểm quy tắc này mà không phải chờ đủ 15 giây.
 */
function resolveTimeoutMs(ms) {
  const n = Number(ms);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_FETCH_TIMEOUT_MS;
}

/**
 * Signal có trần thời gian, GỘP với signal của caller.
 *
 * CỐ Ý không dùng `AbortSignal.timeout()`: hàm đó của Node dùng timer **unref**,
 * nên khi event loop rảnh (đúng cảnh treo: không còn việc nào khác) Node thoát
 * trước khi signal cháy — biến "treo có báo lỗi" thành "chết không dấu vết".
 * Đây chính là lỗi mà test bắt được ở `withTimeout`, và `AbortSignal.timeout()`
 * mắc y hệt. Tự dựng controller để timer KHÔNG bị unref.
 *
 * Trả kèm `clear()` để nơi gọi xoá timer khi xong việc — nếu không, timer giữ
 * event loop sống tới hết trần dù lời gọi đã xong từ lâu.
 */
function timeoutSignal(timeoutMs, outerSignal, label = "fetch") {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new TimeoutError(label, timeoutMs)), timeoutMs);
  if (outerSignal) {
    if (outerSignal.aborted) ctrl.abort(outerSignal.reason);
    else
      outerSignal.addEventListener("abort", () => ctrl.abort(outerSignal.reason), { once: true });
  }
  return { signal: ctrl.signal, clear: () => clearTimeout(timer) };
}

/**
 * `fetch` có trần thời gian. Giữ nguyên mọi option của caller (method/body/…),
 * chỉ thay `signal` bằng signal gộp.
 *
 * Lỗi abort được CHUYỂN thành `TimeoutError` khi nguyên nhân là hết giờ — nếu
 * không thì nơi gọi chỉ thấy `AbortError` chung chung và không phân biệt được
 * "ta chủ động cắt" với "bên kia cắt".
 */
async function fetchWithTimeout(fetchImpl, url, init = {}, { ms, label = String(url) } = {}) {
  const limit = resolveTimeoutMs(ms);
  const { signal, clear } = timeoutSignal(limit, init?.signal, label);
  try {
    return await fetchImpl(url, { ...init, signal });
  } catch (err) {
    // Hết giờ: `abort(reason)` khiến caught value là TimeoutError, nhưng một số
    // runtime chỉ đưa ra AbortError trống — nhận cả hai, vì nơi gọi cần biết
    // "bị ta cắt" khác với "bên kia cắt".
    if (err instanceof TimeoutError) throw err;
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      throw new TimeoutError(label, limit);
    }
    throw err;
  } finally {
    // Xong việc thì bỏ timer, đừng giữ event loop thêm.
    clear();
  }
}

/**
 * Bọc một `fetch` để MỌI lời gọi qua nó đều có trần. Dùng cho
 * `new ConvexHttpClient(url, { fetch: wrapFetch(globalThis.fetch, {...}) })` —
 * nhờ vậy phủ hết đường Convex chỉ bằng một dòng, không phải sửa từng chỗ gọi.
 */
function wrapFetch(fetchImpl, { ms = DEFAULT_FETCH_TIMEOUT_MS, label = "fetch" } = {}) {
  return (url, init) => fetchWithTimeout(fetchImpl, url, init, { ms, label });
}

/**
 * Thời gian chờ trước lần thử lại thứ `attempt` (1 = lần đầu).
 *
 * **Full jitter**: lấy ngẫu nhiên trong [0, trần]. Cách này tốt hơn "trần/2 +
 * ngẫu nhiên nửa" ở chỗ nó tán đều toàn bộ khoảng, nên khi 20 lượt gọi cùng
 * hỏng thì chúng không dồn lại thành một đợt.
 *
 * `minMs` cố ý có: chờ 0ms thì thử lại ngay lập tức, cũng là dồn cục.
 */
function backoffDelayMs(
  attempt,
  { baseMs = 500, maxMs = 30_000, jitter = true, minMs = 100, random = Math.random } = {},
) {
  const n = Math.max(1, Math.floor(Number(attempt) || 1));
  const ceiling = Math.min(maxMs, baseMs * Math.pow(2, n - 1));
  if (!jitter) return ceiling;
  return Math.max(minMs, Math.floor(random() * ceiling));
}

module.exports = {
  TimeoutError,
  fetchWithTimeout,
  wrapFetch,
  backoffDelayMs,
  resolveTimeoutMs,
  DEFAULT_FETCH_TIMEOUT_MS,
};
