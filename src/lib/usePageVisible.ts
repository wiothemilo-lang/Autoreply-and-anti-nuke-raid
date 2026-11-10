import { useEffect, useState } from "react";

/**
 * `true` khi tab đang được hiển thị.
 *
 * Vì sao cần: query Convex là SUBSCRIPTION — mỗi lần bot ghi dữ liệu mới,
 * Convex đẩy về và tính một lượt đọc cho mỗi tab đang đăng ký, kể cả tab bị
 * ẩn/ngủ. Bảng xếp hạng heat cập nhật liên tục (mỗi tick bot), nên để một tab
 * /stats nằm trong tab ẩn cả buổi là đốt hạn mức đọc vô ích. Trang dùng hook
 * này để đặt query về `"skip"` khi ẩn — Convex huỷ subscription, hiện lại thì
 * đăng ký lại từ đầu.
 *
 * Trả `true` khi không có `document` (test/SSR) để không bao giờ tự khoá dữ
 * liệu ngoài trình duyệt.
 */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() =>
    typeof document === "undefined" ? true : !document.hidden,
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onChange = () => setVisible(!document.hidden);
    // Đồng bộ lại ngay khi mount: state khởi tạo có thể cũ nếu tab đổi trạng
    // thái giữa lúc render và lúc effect chạy.
    onChange();
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  return visible;
}
