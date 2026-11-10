/**
 * bootOverlay.ts — cổng "fail-open" cho lớp phủ preloader (#boot).
 *
 * BỐI CẢNH (bug thảm hoạ, đo bằng trình duyệt thật 28/09/2026):
 *   · Lần 1 — script preloader viết INLINE trong index.html trong khi CSP
 *     production đặt `script-src 'self'` → bị chặn im lặng → #boot phủ kín app
 *     mãi mãi.
 *   · PR #15 sửa bằng cách chuyển script sang `public/boot.js` — đúng, nhưng
 *     CHƯA ĐỦ: nếu /boot.js không tải được (404, bị chặn, tải dở, throw trước
 *     khi gán `window.__bootDone`) thì `BootSignal` và `RootErrorBoundary` gọi
 *     `window.__bootDone?.()` đều thành no-op → app render phía dưới nhưng
 *     người dùng vẫn nhìn màn "Protogon. 0%" vĩnh viễn. Trạng thái kẹt lại
 *     PHỤ THUỘC vào một file ngoài.
 *
 * NGUYÊN TẮC: điều kiện đóng preloader không được phụ thuộc vào file ngoài
 * đang bị nghi ngờ. `finishBootOverlay()` là đường ra THỨ HAI, độc lập:
 *   · boot.js chạy được → dùng `window.__bootDone()` (chuỗi animation gốc,
 *     thanh chạy tới 100% rồi mờ — đúng thiết kế).
 *   · boot.js hỏng/thất bại → tự gỡ lớp phủ bằng DOM (thêm class `is-done`
 *     mà CSS sẵn có, rồi gỡ khỏi DOM sau khi hết transition).
 *
 * Hàm này cố ý KHÔNG import gì và không cần React: chạy được cả trong catch
 * của bootstrap (main.tsx) khi React chưa mount kịp.
 */

/** id phần tử overlay trong index.html. */
export const BOOT_OVERLAY_ID = "boot";

/** Thời gian khớp transition 0.45s trong index.html (+ biên độ an toàn). */
const OVERLAY_REMOVE_DELAY_MS = 700;

/**
 * Đóng preloader, bất kể /boot.js có sống hay không.
 *
 * Idempotent: gọi nhiều lần (BootSignal + RootErrorBoundary + catch bootstrap)
 * không gây lỗi — `classList.add` và `remove()` đều im lặng khi đã xong.
 */
export function finishBootOverlay(): void {
  if (typeof window === "undefined") return;

  // Đường 1 — boot.js còn sống: chạy đúng chuỗi kết thúc của nó (thanh lên
  // 100% rồi fade). Không làm gì khác để không phá animation.
  const bootDone = window.__bootDone;
  if (typeof bootDone === "function") {
    bootDone();
    return;
  }

  // Đường 2 — boot.js không tồn tại (không tải được / throw / bị CSP chặn).
  // Tự gỡ lớp phủ: đây là lý do duy nhất hàm này tồn tại.
  const overlay = document.getElementById(BOOT_OVERLAY_ID);
  if (!overlay) return; // đã gỡ rồi (boot.js kịp chạy trước đó)
  dismissOverlayElement(overlay);
}

/**
 * Gỡ một phần tử overlay cụ thể — tách riêng để test browser có gọi trực tiếp
 * mà không cần dựng lại toàn bộ khung preloader.
 */
function dismissOverlayElement(overlay: Element): void {
  if (overlay.classList.contains("is-done")) return;
  // CSS index.html: #boot.is-done { opacity: 0; visibility: hidden; }
  overlay.classList.add("is-done");
  // Chặn tương tác NGAY (không đợi transition): nút dưới lớp phủ phải bấm
  // được ngay, kể cả khi transition opacity chưa chạy xong.
  overlay.setAttribute("aria-hidden", "true");
  overlay.setAttribute("inert", "");
  window.setTimeout(() => {
    overlay.remove();
  }, OVERLAY_REMOVE_DELAY_MS);
}
