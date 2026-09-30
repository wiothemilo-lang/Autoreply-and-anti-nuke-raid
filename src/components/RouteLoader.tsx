import { translate } from "../lib/i18n";
import LoadingRipple from "./LoadingRipple";

/**
 * RouteLoader — màn chờ toàn màn hình khi React đang tải chunk của route mới.
 *
 * ── VÌ SAO NÓ PHẢI KHÁC HẲN PRELOADER #boot ──────────────────────────────
 * Preloader trong index.html giữ vai trò "app đang khởi động": logo cá voi 56px
 * ở giữa, chữ "Protogon.", thanh tiến trình và số phần trăm. Ở lần tải đầu nó
 * phủ kín (z-9999) nên RouteLoader nằm im bên dưới, không ai thấy.
 *
 * Nhưng MỌI route đều lazy() → mỗi lần chuyển trang, <Suspense> treo lại và
 * màn này mới lộ ra. Nếu nó dựng y hệt preloader thì người dùng vừa thấy xong
 * màn "Protogon. 42%" lại thấy đúng màn đó lần nữa → tưởng web bị nhân bản,
 * tưởng load 2 lần (báo cáo 30/09/2026). Vì vậy bố cục ở đây CỐ TÌNH khác:
 *   · không logo      → không dùng lại /logo-mark.png (logo là dấu hiệu nhận
 *                      diện của preloader)
 *   · không % / thanh  → preloader đã chiếm hình thức "tiến trình có số"
 *   · vòng sóng lan   → chuyển trong, khác hẳn màn tĩnh ở giữa của preloader
 *   · chữ ở ĐÁY màn   → preloader đặt chữ ngay dưới logo ở giữa
 *
 * ── VÌ SAO KHÔNG DÙNG LẠI PageSplash ──────────────────────────────────────
 * PageSplash (dùng khi dashboard đổi server) trước đây là logo cá voi + thanh
 * tiến trình — cùng hệ với preloader, nên tái dùng nó sẽ tái tạo đúng cảm
 * giác "load lần nữa" mà ở trên đã cố tránh. Nay cả hai cùng dùng chung
 * `LoadingRipple`: RouteLoader phủ toàn màn, PageSplash nằm trong bố cục
 * trang, nhưng hình ảnh là MỘT — không còn màn nào trùng preloader.
 *
 * ── ACCESSIBILITY ──────────────────────────────────────────────────────────
 * `role="status"` + `aria-live="polite"`: trình đọc màn hình đọc "Đang tải…"
 * một lần khi nó xuất hiện, không chen ngang nội dung đang đọc (polite, không
 * phải assertive). Phần chữ nhìn thấy bị ẩn khỏi cây trợ năng bằng `aria-hidden`
 * để không đọc trùng với `<span class="sr-only">` bên dưới — cùng một thông
 * điệp chỉ nói MỘT lần.
 *
 * ── MOTION ─────────────────────────────────────────────────────────────────
 * Tôn trọng `prefers-reduced-motion`: vòng sóng và vòng xoay tắt hẳn, thay
 * bằng một vòng tròn tĩnh + chấm ở giữa. Vẫn đọc được "đang tải", nhưng không
 * có chuyển động nào trước mặt người dợi hệ tiền đình — vẫn phải BÁO trạng
 * thái, chỉ là báo bằng hình thức tĩnh.
 */
export default function RouteLoader() {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="route-loader"
      className="fixed inset-0 z-[60] grid select-none place-items-center overflow-hidden bg-background"
    >
      {/* Vệt sáng rất nhạt ở giữa — tạo chiều sâu mà không cần ảnh nền. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--foreground)/0.05),transparent_58%)]"
      />

      {/* Vòng sóng: 2 vòng nở ra lệch pha nhau quanh một chấm ở giữa. */}
      <LoadingRipple className="h-44 w-44" />

      {/* Chữ đặt ở ĐÁY màn, tracking rộng, chữ nhỏ — khác hẳn preloader đặt
          chữ ngay dưới logo ở giữa màn. */}
      <div aria-hidden className="absolute inset-x-0 bottom-[12vh] text-center">
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.42em] text-muted-foreground">
          Protogon
        </p>
        <span className="mx-auto mt-3 block h-px w-10 bg-foreground/20" />
      </div>

      {/* Thông báo cho trình đọc màn hình. sr-only = ẩn với mắt, đọc được
          bằng trình đọc. */}
      <span className="sr-only">{translate("Đang tải…")}</span>
    </div>
  );
}
