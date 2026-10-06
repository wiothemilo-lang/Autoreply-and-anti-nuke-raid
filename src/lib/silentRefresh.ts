/**
 * silentRefresh.ts — cổng quyết định "có được tự đẩy người dùng sang Discord
 * để làm mới danh sách server hay không".
 *
 * ── Vì sao có file này (bug thật: "cứ mở dashboard là nhảy đăng nhập") ───────
 * `Dashboard` gọi `startSilentRefresh()` mỗi lần mount để server mới mời bot
 * hiện ra ngay. Việc "làm mới" đó là một lần CHUYỂN TRANG THẬT sang Discord
 * (`prompt=none`) rồi quay về — người dùng thấy y như bị bắt đăng nhập lại.
 *
 * Trước đây 2 khoá chống lặp (`thử gần nhất`, `đã hỏng`) nằm ở **sessionStorage**.
 * sessionStorage là RIÊNG TỪNG TAB, nên: mở tab mới → không có khoá nào → lại bị
 * đẩy sang Discord; Discord từ chối `prompt=none` → quay về → tab khác lại lặp.
 * Cảm giác đúng như mô tả: "đăng nhập vô rồi mà nó cứ duplicate nhảy đăng nhập".
 *
 * Hai sửa đổi cốt lõi:
 *  1. Khoá nằm ở **localStorage** (phạm vi TRÌNH DUYỆT, giống token phiên) →
 *     tối đa MỘT lần tự chuyển trang cho cả trình duyệt, không phải một lần mỗi
 *     tab. Vẫn đọc sessionStorage làm dự phòng (dữ liệu cũ + trình duyệt chặn
 *     localStorage) nên không có tab nào "mất trí nhớ".
 *  2. Kết quả hỏng được ghi nhớ VĨNH VIỄN cho tới khi người dùng tự bấm "Tải
 *     lại", đăng nhập lại, hoặc một lượt làm mới thành công — không có vòng lặp
 *     tự động nào sau khi Discord đã từ chối.
 *
 * `judgeSilentRefresh` là hàm THUẦN (không đụng window) để test hermetic được:
 * đây là logic quyết định chuyển trang, sai một nhánh là người dùng bị đá ra
 * khỏi dashboard giữa lúc làm việc.
 */

/** Mốc thời gian (ms) của lượt làm mới im lặng gần nhất. */
export const SILENT_ATTEMPT_KEY = "wio_silent_last_attempt";
/** Lượt làm mới im lặng trước đã HỎNG (Discord từ chối prompt=none). */
export const SILENT_FAILED_KEY = "wio_silent_failed";
/** Khoảng cách tối thiểu giữa 2 lượt TỰ ĐỘNG (người dùng bấm thì bỏ qua). */
export const SILENT_COOLDOWN_MS = 10 * 60_000;

export interface SilentRefreshLock {
  /** Lượt tự động trước đã hỏng → khoá hẳn cho tới khi người dùng chủ động thử lại. */
  failed: boolean;
  /** Mốc (ms) lượt thử gần nhất; 0 = chưa từng thử. */
  lastAttempt: number;
}

/** Lý do lượt tự động bị chặn; `null` = được phép chuyển trang. */
export type SilentRefreshBlock = "no_session" | "locked" | "cooldown" | null;

/**
 * Quyết định có được tự chuyển trang sang Discord hay không.
 *
 * Thứ tự kiểm là HỢP ĐỒNG:
 *  - `hasSession` trước tiên: không có token/clientId thì phải ở lại dashboard
 *    (RequireAuth tự chuyển sang /auth) — nhảy sang Discord lúc này là hai lần
 *    điều hướng tranh nhau.
 *  - `force` (người dùng bấm "Tải lại") bỏ qua MỌI khoá: họ vừa chủ động yêu cầu.
 *  - `locked` trước `cooldown`: đã hỏng thì chờ hết 10 phút vẫn hỏng.
 */
export function judgeSilentRefresh(
  lock: SilentRefreshLock,
  now: number,
  { force = false, hasSession = true }: { force?: boolean; hasSession?: boolean } = {},
): SilentRefreshBlock {
  if (!hasSession) return "no_session";
  if (force) return null;
  if (lock.failed) return "locked";
  if (now - lock.lastAttempt < SILENT_COOLDOWN_MS) return "cooldown";
  return null;
}

/**
 * Đọc khoá an toàn: localStorage trước (phạm vi trình duyệt), rồi sessionStorage
 * (dữ liệu của bản cũ + trình duyệt chặn localStorage kiểu "chỉ trong tab").
 * Mọi truy cập đều bọc try/catch: chế độ riêng tư / cookie bị chặn làm
 * `localStorage` NÉM lỗi — ném ở đây là trắng trang dashboard.
 */
function readRaw(key: string): string {
  try {
    const v = localStorage.getItem(key);
    if (v !== null && v !== "") return v;
  } catch {
    // localStorage không dùng được — thử sessionStorage bên dưới.
  }
  try {
    return sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

/** Ghi vào localStorage và xoá bản sessionStorage để không có 2 nguồn lệch nhau. */
function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Không ghi được localStorage → ghi tạm sessionStorage cho tab này.
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // Không lưu được ở đâu cả (chế độ riêng tư) — chấp nhận mất khoá.
    }
    return;
  }
  try {
    sessionStorage.removeItem(key);
  } catch {
    // không quan trọng
  }
}

function removeRaw(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // không quan trọng
  }
  try {
    sessionStorage.removeItem(key);
  } catch {
    // không quan trọng
  }
}

export function readSilentLock(): SilentRefreshLock {
  const failed = readRaw(SILENT_FAILED_KEY) === "1";
  const lastAttempt = Number(readRaw(SILENT_ATTEMPT_KEY));
  return {
    failed,
    lastAttempt: Number.isFinite(lastAttempt) && lastAttempt > 0 ? lastAttempt : 0,
  };
}

/** Ghi mốc lượt thử NGAY TRƯỚC khi chuyển trang (nếu không, quay về là thử lại). */
export function markSilentAttempt(at: number = Date.now()): void {
  writeRaw(SILENT_ATTEMPT_KEY, String(at));
}

export function markSilentFailed(): void {
  writeRaw(SILENT_FAILED_KEY, "1");
}

export function clearSilentFailed(): void {
  removeRaw(SILENT_FAILED_KEY);
}
