import { useState } from "react";
import { useBranding } from "../lib/useBranding";
import { cn } from "../lib/utils";

/**
 * Biểu tượng mặt bot vector tối giản đồng bộ với favicon.svg:
 * - Hình học sắc nét, nét dày đều 4px trên canvas 64x64.
 * - Nền rounded-square đen với điểm nhấn từ token primary.
 */
export function BotFaceIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      className={cn("h-full w-full shrink-0", className)}
      aria-hidden="true"
    >
      <rect width="64" height="64" rx="16" fill="#09090b" />
      {/* Ăng-ten */}
      <line
        x1="32"
        y1="11"
        x2="32"
        y2="18"
        stroke="#ffffff"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="32" cy="9" r="3.5" fill="#ffffff" />
      {/* Khớp tai hai bên */}
      <rect x="7" y="27" width="5" height="12" rx="2.5" fill="#ffffff" />
      <rect x="52" y="27" width="5" height="12" rx="2.5" fill="#ffffff" />
      {/* Khung đầu mặt bot */}
      <rect
        x="12"
        y="18"
        width="40"
        height="32"
        rx="9"
        fill="#18181b"
        stroke="#ffffff"
        strokeWidth="4"
      />
      {/* Mắt hình học */}
      <rect x="20" y="27" width="8" height="8" rx="4" fill="#ffffff" />
      <rect x="36" y="27" width="8" height="8" rx="4" fill="#ffffff" />
      {/* Vạch tín hiệu / miệng */}
      <line
        x1="24"
        y1="41"
        x2="40"
        y2="41"
        stroke="#ffffff"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Khung logo vuông bo góc dùng cho nav/footer/auth — MỘT nguồn duy nhất thay cho
 * các bản wrapper gradient+glow trước đây từng chép lệch nhau ở 5 nơi.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-neutral-950 p-0.5 shadow-sm",
        className,
      )}
    >
      <BotLogo className="h-full w-full" />
    </span>
  );
}

/**
 * Logo / avatar bot trên web. Hiển thị ảnh bot do admin sở hữu bot đặt
 * (Tính năng ẩn → Tùy chỉnh giao diện); chưa đặt thì dùng ảnh bot mặc định.
 */
export default function BotLogo({
  className,
  fallbackClassName,
}: {
  className?: string;
  fallbackClassName?: string;
}) {
  const branding = useBranding();
  const [failed, setFailed] = useState(false);
  const src = branding?.botAvatarUrl ?? branding?.haimiyaAvatarUrl ?? null;
  if (src && !failed) {
    return (
      <img
        src={src}
        alt="Protogon"
        onError={() => setFailed(true)}
        className={cn("rounded-full object-cover", className)}
        draggable={false}
      />
    );
  }
  return (
    <span
      className={cn(
        "flex items-center justify-center overflow-hidden rounded-full bg-neutral-950 text-white",
        className,
      )}
    >
      <BotFaceIcon className={cn("h-full w-full", fallbackClassName)} />
    </span>
  );
}
