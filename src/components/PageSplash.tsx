import { BotFaceIcon } from "./BotLogo";
import { cn } from "../lib/utils";
import { translate } from "../lib/i18n";
import { Skeleton } from "./ui/skeleton";

export interface PageSplashProps {
  className?: string;
  label?: string;
  minHeight?: string;
}

/**
 * Màn hình tải trang / route thống nhất:
 * - Logo bot vector mới (nền rounded-square đen, hình học rõ).
 * - Thanh tiến trình mảnh với chu kỳ 1.1s (≤ 1.2s).
 * - Không layout shift: kích thước cố định.
 * - Tôn trọng @media (prefers-reduced-motion: reduce): tắt animation.
 * - Dự phòng đầy đủ nội dung nếu CSS hoặc animation không hoạt động.
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
      className={cn(
        "flex flex-col items-center justify-center p-6 text-center select-none",
        minHeight,
        className,
      )}
    >
      <div className="relative mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-950 p-2 shadow-sm ring-1 ring-border/50 motion-reduce:animate-none">
        <BotFaceIcon className="h-full w-full" />
      </div>

      {/* Thanh tiến trình mảnh: chiều cao 2px, rộng 140px, vòng lặp 1.1s */}
      <div
        aria-hidden="true"
        className="relative mb-3 h-1 w-36 overflow-hidden rounded-full bg-secondary/80"
      >
        <div className="absolute inset-y-0 w-1/2 rounded-full bg-primary motion-safe:animate-route-progress motion-reduce:w-full motion-reduce:animate-none" />
      </div>

      <p className="text-xs font-medium tracking-wide text-muted-foreground">
        {label ?? translate("Đang tải…")}
      </p>
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
