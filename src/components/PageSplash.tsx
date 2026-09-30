import { cn } from "../lib/utils";
import { translate } from "../lib/i18n";
import { Skeleton } from "./ui/skeleton";
import LoadingRipple from "./LoadingRipple";

export interface PageSplashProps {
  className?: string;
  label?: string;
  minHeight?: string;
}

/**
 * Màn chờ dùng trong bố cục trang (dashboard chưa có dữ liệu, đổi server…).
 *
 * ── VÌ SAO KHÔNG CÓ LOGO VÀ KHÔNG CÓ THANH TIẾN TRÌNH ─────────────────────
 * Bản trước dựng logo cá voi + thanh tiến trình 140px — y hệt preloader #boot
 * trong `index.html`. Hệ quả thật: người dùng vừa thoát màn khởi động thấy
 * đúng cái màn đó lần nữa khi mở dashboard, nên kết luận "web load 2 lần"
 * (báo cáo 30/09/2026). Logo + thanh + số % là dấu hiệu nhận diện của preloader
 * → giờ CHỈ preloader được dùng, mọi màn chờ trong React dùng chung vòng sóng
 * `LoadingRipple` với `RouteLoader`.
 *
 * Vì vậy ở đây:
 *   · không logo      → không dùng lại /logo-mark.png
 *   · không thanh/%   → preloader đã chiếm hình thức "tiến trình có số"
 *   · vòng sóng lan   → đúng ngôn ngữ hình ảnh của RouteLoader
 *
 * Khác RouteLoader ở chỗ KHÔNG phủ toàn màn: đây là màn chờ trong bố cục trang
 * (bám theo `minHeight` mà trang truyền vào), nên người dùng vẫn thấy bố cục
 * quen thuộc thay vì bị màn đen phủ kín.
 *
 * ── ACCESSIBILITY ──────────────────────────────────────────────────────────
 * `role="status"` + `aria-live="polite"`: trình đọc màn hình đọc thông điệp
 * một lần khi nó xuất hiện, không chen ngang nội dung đang đọc. Nhãn nhìn
 * thấy được dùng `aria-hidden` để không đọc trùng với `<span class="sr-only">`
 * bên dưới — cùng một thông điệp chỉ nói MỘT lần.
 */
export default function PageSplash({
  className,
  label,
  minHeight = "min-h-[60vh]",
}: PageSplashProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="page-splash"
      className={cn(
        "flex flex-col items-center justify-center gap-4 p-6 text-center select-none",
        minHeight,
        className,
      )}
    >
      <LoadingRipple className="h-28 w-28" />

      <p aria-hidden className="text-xs font-medium tracking-wide text-muted-foreground">
        {label ?? translate("Đang tải…")}
      </p>

      {/* Thông báo cho trình đọc màn hình: ẩn với mắt, đọc được bằng trình
          đọc. Nhãn trên đã aria-hidden nên không bị đọc hai lần. Truyền
          `label` thì đọc đúng nội dung nhãn đó — ví dụ "Đang kiểm tra phiên
          đăng nhập…" thay vì chung chung "Đang tải…". */}
      <span className="sr-only">{label ?? translate("Đang tải…")}</span>
    </div>
  );
}

/**
 * Skeleton tải panel trong tab dashboard (tránh giật layout khi tải chunk):
 */
export function PanelSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-44 w-full rounded-xl" />
      </div>
      <span className="sr-only">{translate("Đang tải…")}</span>
    </div>
  );
}
