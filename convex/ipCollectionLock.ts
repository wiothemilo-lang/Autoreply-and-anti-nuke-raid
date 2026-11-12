/**
 * ipCollectionLock — công tắc TẠM KHOÁ toàn bộ đường thu thập IP (12/11/2026).
 *
 * Vì sao có file này: xác minh web gửi IP thô của thành viên tới Convex (Hoa Kỳ)
 * và ipapi.is (Đức/Hoa Kỳ/Singapore) — đó là chuyển dữ liệu cá nhân nhạy cảm
 * xuyên biên giới, phải có DPIA + CTIA và một bên kiểm soát đủ năng lực pháp lý.
 * Khi chưa có người đứng tên, đường thu IP phải đóng Ở TẦNG SERVER, không chỉ
 * ẩn nút trên giao diện: guild còn lưu `verifyMethod = "web"` thì một lượt
 * deploy cũ vẫn có thể mở lại luồng.
 *
 * Cách dùng:
 *  - `IP_COLLECTION_ENABLED = false` → HTTP `/verify/complete` từ chối TRƯỚC khi
 *    đọc IP, action không gọi ipapi.is, bot không tạo phiên, dashboard/bot đọc
 *    config thấy phương thức "button" và tự lùi về xác minh bằng nút.
 *  - Bật lại: đổi thành `true` **chỉ sau khi** DPIA/CTIA đã nộp và có người
 *    đứng tên bên kiểm soát. Đây là thay đổi có chủ đích — phải qua PR + review,
 *    không bật bằng biến môi trường để tránh mở nhầm lúc deploy.
 *
 * Không đặt trong `schema.ts`: đây là quyết định vận hành, không phải dữ liệu
 * của từng guild.
 */

export const IP_COLLECTION_ENABLED = false;

/**
 * Giá trị hiệu lực tại thời điểm gọi.
 *
 * Production luôn trả về hằng số ở trên. `scripts/test-verify-flow.ts` cần chạy
 * trọn luồng verify (23 call site) trong khi production đang khoá, nên đặt cờ
 * qua `globalThis` — cùng khuôn với `__resetGeoGuardForTest`. Đây KHÔNG phải
 * Convex function: client không có đường nào chạm tới biến này.
 */
export function isIpCollectionEnabled(): boolean {
  const override = (globalThis as { __PROTOGON_IP_COLLECTION_TEST__?: boolean })
    .__PROTOGON_IP_COLLECTION_TEST__;
  return typeof override === "boolean" ? override : IP_COLLECTION_ENABLED;
}

export const IP_COLLECTION_LOCK_REASON =
  "Xác minh web tạm khoá: hệ thống chưa hoàn tất hồ sơ bảo vệ dữ liệu cá nhân.";

/** Mã lỗi công khai — trang verify và bot cùng hiểu một mã. */
export const IP_COLLECTION_LOCK_CODE = "ip_collection_disabled";

/**
 * Phương thức xác minh TRẢ RA cho bot/dashboard khi đang khoá.
 *
 * Không ghi đè DB: guild vẫn giữ lựa chọn cũ để bật lại không phải cấu hình
 * lại từ đầu. Chỉ giá trị đọc ra bị hạ về "button" — luồng nút không thu IP.
 */
export function effectiveVerifyMethod(
  method: "button" | "captcha" | "web" | undefined,
): "button" | "captcha" | "web" {
  if (isIpCollectionEnabled()) return method ?? "button";
  return method === "web" ? "button" : (method ?? "button");
}

/** Cờ web luôn là false khi khoá, kể cả guild đã bật trước đó. */
export function effectiveVerifyWebEnabled(enabled: boolean | undefined): boolean {
  return isIpCollectionEnabled() ? enabled === true : false;
}
