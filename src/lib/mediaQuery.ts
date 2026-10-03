import { useEffect, useState } from "react";

/**
 * Ngưỡng DESKTOP — phải khớp đúng breakpoint `lg` của Tailwind (1024px).
 *
 * Vì sao để số trong một hằng số: GuildPage chuyển bố cục ở `lg`, nếu hook này
 * lệch 1px với class `lg:` thì một bề rộng nào đó sẽ rơi vào khoảng chết —
 * ví dụ hook báo "hẹp" nên mở sheet, nhưng CSS vẫn vẽ sidebar cột bên cạnh.
 */
export const DESKTOP_BREAKPOINT_PX = 1024;

/**
 * Media query tương đương "màn hình hẹp hơn `lg`".
 *
 * Dùng `1023.98px` chứ không phải `1023px` vì CSS width là số thực: một thiết
 * bị độ rộng lẻ (tablet 1023.5px) rơi xuống cả hai vế nếu lấy `max-width:
 * 1023px`. Giữ chừng 0.02px cho hai điều kiện loại trừ nhau dứt khoát.
 */
export const NARROW_MEDIA_QUERY = `(max-width: ${DESKTOP_BREAKPOINT_PX - 0.02}px)`;

/** Panel mặc định — mobile để panel này nằm trong trang, không bọc sheet. */
export const HOME_SECTION = "overview";

/**
 * Rộng bao nhiêu thì coi là hẹp.
 *
 * Vì sao là hàm thuần nhận số thay vì đọc `window` bên trong: quy tắc này
 * quyết định có bọc panel vào sheet hay không — sai một px là hiển thị sai
 * bố cục, nên phải test được bằng giá trị cụ thể thay vì phải mở trình duyệt.
 * `undefined`/NaN (SSR, test không có DOM) → coi như desktop: an toàn vì
 * desktop không có sheet, tức không mất gì.
 */
export function isNarrowViewport(width: number | undefined): boolean {
  if (typeof width !== "number" || !Number.isFinite(width)) return false;
  return width < DESKTOP_BREAKPOINT_PX;
}

/**
 * Có bọc panel vào sheet full-screen không?
 *
 * Quy tắc: hẹp + KHÔNG phải panel mặc định. Panel mặc định là trang chủ của
 * dashboard trên mobile — bọc nó vào sheet thì người dùng vào thẳng app là
 * gặp một lớp phủ che mất nội dung, phải đóng ra mới thấy dashboard.
 */
export function shouldUsePanelSheet(narrow: boolean, section: string): boolean {
  return narrow && section !== HOME_SECTION;
}

/**
 * Theo dõi bề rộng cửa sổ, trả về `true` khi màn hình hẹp hơn `lg`.
 *
 * Vì sao cần hook thay vì `matchMedia` rải rác trong component: dùng
 * `matchMedia` đúng là đủ, nhưng cần một nơi duy nhất quyết định bố cục để
 * sau này đổi ngưỡng chỉ sửa một chỗ (mọi class `lg:` trong template nằm rải
 * rác khắp app, không gom được).
 */
export function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(() =>
    typeof window === "undefined" ? false : isNarrowViewport(window.innerWidth),
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const sync = () => setNarrow(isNarrowViewport(window.innerWidth));
    // Lấy lại ngay khi gắn: giữa lúc mount và effect, người dùng có thể đã
    // xoay máy — đọc `innerWidth` mới thay vì tin giá trị khởi tạo cũ.
    sync();
    if (typeof window.matchMedia !== "function") {
      // Trình duyệt cũ không có matchMedia — rơi về nghe resize.
      window.addEventListener("resize", sync);
      return () => window.removeEventListener("resize", sync);
    }
    const mql = window.matchMedia(NARROW_MEDIA_QUERY);
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);

  return narrow;
}
