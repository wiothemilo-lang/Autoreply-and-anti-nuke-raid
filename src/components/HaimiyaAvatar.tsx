import { useState } from "react";

/**
 * Avatar chibi Haimiya-senpai — vẽ lại theo concept ảnh gốc (mèo đen + tóc bạc xanh)
 * bằng SVG thuần, không dùng ảnh ngoài. Gồm: beanie tai mèo đen có miếng vá mặt mèo,
 * tóc bạc xanh, mắt xanh sáng, má hồng, răng nanh, choker đen.
 * Nếu truyền `src` (ảnh tùy chỉnh do admin sở hữu bot đặt) sẽ hiển thị ảnh đó thay SVG.
 *
 * Vì sao tách khỏi `HaimiyaChat.tsx`: Footer, landing và vài panel chỉ cần vẽ
 * avatar 24–192px, nhưng import từ module chat kéo theo toàn bộ widget (action
 * Convex, sha256, xử lý ảnh/video). Tách ra thì các trang công khai không phải
 * tải ~12 KB gzip chat chỉ để có một vòng tròn avatar.
 */
export function HaimiyaAvatar({
  className,
  src,
  decorative = false,
}: {
  className?: string;
  src?: string | null;
  decorative?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <img
        src={src}
        alt={decorative ? "" : "Haimiya"}
        onError={() => setFailed(true)}
        className={`rounded-full object-cover ${className ?? ""}`}
        draggable={false}
      />
    );
  }
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      {/* thân áo đen + vai */}
      <path d="M12 64v-9c0-7 9-11 20-11s20 4 20 11v9z" fill="#23222e" />
      {/* cổ */}
      <rect x="27" y="42" width="10" height="9" rx="2.5" fill="#ffeaf2" />
      {/* tóc sau — bạc xanh */}
      <path
        d="M18 32c0-11 6-19 14-19s14 8 14 19v5c-4-2-9-3.5-14-3.5s-10 1.5-14 3.5z"
        fill="#c6daf4"
      />
      {/* mặt */}
      <circle cx="32" cy="34" r="13.5" fill="#ffeaf2" />
      {/* mái tóc — bạc xanh sáng */}
      <path
        d="M18.5 33c.5-7.5 6.5-12 13.5-12s13 4.5 13.5 12c-3.5-3-8-4.5-13.5-4.5s-10 1.5-13.5 4.5z"
        fill="#dbe9fa"
      />
      {/* lọn tóc hai bên */}
      <path
        d="M20 38q-2.5 7 1 12"
        stroke="#c6daf4"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M44 38q2.5 7-1 12"
        stroke="#c6daf4"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      {/* beanie đen + tai mèo */}
      <path
        d="M18.5 31v-4.5c0-5.5 5.5-8.5 13.5-8.5s13.5 3 13.5 8.5V31c-3.5-2.5-8-4-13.5-4s-10 1.5-13.5 4z"
        fill="#2b2b38"
      />
      {/* tai mèo trái */}
      <path d="M19 21l-5-10 11 4z" fill="#2b2b38" />
      <path d="M20.5 21.5l-3.5-6.5 7 2.5z" fill="#ff9dbb" />
      {/* tai mèo phải */}
      <path d="M45 21l5-10-11 4z" fill="#2b2b38" />
      <path d="M43.5 21.5l3.5-6.5-7 2.5z" fill="#ff9dbb" />
      {/* miếng vá mặt mèo trên beanie */}
      <rect x="26" y="20" width="12" height="10" rx="3" fill="#fdfdfd" />
      <circle cx="30" cy="24.5" r="1.2" fill="#333" />
      <circle cx="34" cy="24.5" r="1.2" fill="#333" />
      <path
        d="M29.5 27.5q2 2.1 4 0"
        stroke="#333"
        strokeWidth="0.9"
        fill="none"
        strokeLinecap="round"
      />
      {/* mắt xanh sáng, đồng tử hẹp */}
      <path
        d="M21.5 34.5q4-4.5 8 0q-4 4.5-8 0z"
        fill="#4aa5ff"
        stroke="#12355e"
        strokeWidth="0.8"
      />
      <path
        d="M34.5 34.5q4-4.5 8 0q-4 4.5-8 0z"
        fill="#4aa5ff"
        stroke="#12355e"
        strokeWidth="0.8"
      />
      <ellipse cx="25.5" cy="34.8" rx="1" ry="2.2" fill="#12355e" />
      <ellipse cx="38.5" cy="34.8" rx="1" ry="2.2" fill="#12355e" />
      <circle cx="24" cy="33.6" r="0.9" fill="#fff" opacity="0.9" />
      <circle cx="37" cy="33.6" r="0.9" fill="#fff" opacity="0.9" />
      {/* má hồng */}
      <ellipse cx="21" cy="38.5" rx="3" ry="1.8" fill="#ff9dbb" opacity="0.75" />
      <ellipse cx="43" cy="38.5" rx="3" ry="1.8" fill="#ff9dbb" opacity="0.75" />
      {/* miệng cười hở răng nanh */}
      <path
        d="M28.5 40.5q3.5 3.5 7 0"
        stroke="#c26a85"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M35 41.3l1.3 2.7 1.5-2.5z"
        fill="#fff"
        stroke="#c26a85"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      {/* choker đen + vòng kim loại */}
      <path d="M26.5 48h11" stroke="#2b2b38" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="48" r="1.7" fill="none" stroke="#cfd6e4" strokeWidth="1.3" />
    </svg>
  );
}
