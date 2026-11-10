import { useState } from "react";
import { useBranding } from "../lib/useBranding";
import { cn } from "../lib/utils";

/**
 * Logo mặc định của Protogon: ẢNH cá voi (người dùng tạo bằng Gemini) đã tách
 * khỏi nền tối và bỏ dải chữ, đóng thành khối bo góc tối + cá voi trắng.
 * - Giữ NGUYÊN tỉ lệ ảnh (object-contain) — không kéo giãn cho vừa khung, chỉ
 *   thu nhỏ cho khớp khung là đủ.
 * - CÙNG MỘT ảnh public/logo-mark.png với favicon.png, apple-touch-icon.png và
 *   preloader trong index.html. Muốn đổi khung cắt/độ đậm: sửa hằng số rồi
 *   chạy lại `node scripts/build-logo-assets.cjs` — đừng sửa tay file PNG.
 */
function WhaleIcon({ className }: { className?: string }) {
  return (
    <img
      src="/logo-mark.png"
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn("h-full w-full shrink-0 object-contain", className)}
    />
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
      <WhaleIcon className={cn("h-full w-full", fallbackClassName)} />
    </span>
  );
}
