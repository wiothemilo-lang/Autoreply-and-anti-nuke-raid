import type { ReactNode } from "react";
import { MotionConfig } from "framer-motion";

/**
 * Cấu hình chuyển động cho MỘT trang — thay cho `MotionConfig` từng nằm ở
 * `App.tsx`.
 *
 * Vì sao phải chuyển xuống đây: `App.tsx` là entry của MỌI route, nên chỉ một
 * `import { MotionConfig } from "framer-motion"` ở đó kéo cả `vendor-motion`
 * (36,7 KB gzip) vào critical path của cả trang pháp lý / giám sát — những
 * trang không có một chuyển động nào. Đặt ở trang nào thật sự dùng `motion.*`
 * thì chunk motion chỉ tải cùng trang đó.
 *
 * `reducedMotion="user"` giữ nguyên hành vi cũ: người dùng bật giảm chuyển
 * động trong hệ điều hành thì framer-motion tự bỏ animation biến đổi, không
 * phải sửa từng `motion.div`.
 */
export default function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
