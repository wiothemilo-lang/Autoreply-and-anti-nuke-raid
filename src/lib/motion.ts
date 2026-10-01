import { useEffect, useRef, useState } from "react";
import { useReducedMotion, type Variants } from "framer-motion";

/**
 * Chuyển động cho phần SẢN PHẨM (sau khi đăng nhập).
 *
 * Vì sao tách khỏi motion của landing: landing là trang tĩnh, người dùng đọc
 * nên chuyển động chậm 0.6–0.8s vẫn thấy "cao cấp". Còn trong app người dùng
 * bấm liên tục — 0.7s mỗi lần đổi panel là tay bị chờ, cảm giác lag chứ
 * không phải mượt. Ở đây mọi thứ nằm trong 0.14–0.28s.
 *
 * Nguyên tắc chung: chỉ animate `opacity` + `transform` (compositor-friendly,
 * không ép layout), và tôn trọng `prefers-reduced-motion` — người dùng giảm
 * chuyển động thì được thấy đúng nội dung, chỉ mất phần mỹ.
 */

/** cubic-bezier ra, cùng cảm giác với các `transition` trong `index.css`. */
const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Thời lượng (giây) — ngắn, vì app là nơi thao tác liên tục. */
export const DUR = {
  fast: 0.14,
  base: 0.2,
  slow: 0.28,
} as const;

/** Bước dịch giữa các phần tử trong một danh sách (giây). */
const STAGGER = 0.03;

/**
 * Trả về bộ biến thể an toàn với `prefers-reduced-motion`.
 *
 * `index.css` đã tắt animation/transition bằng CSS, nhưng framer-motion là
 * JS nên không dính luật đó — phải tự kiểm. Khi bật reduced motion, trả về
 * `hidden === show` để không có gì chuyển cả mà nội dung vẫn hiện.
 */
export function useProductMotion() {
  const reduced = useReducedMotion();

  if (reduced) {
    const still = { opacity: 1, y: 0, scale: 1 } as const;
    return {
      panel: { hidden: still, show: still } satisfies Variants,
      list: {
        hidden: still,
        show: { ...still, transition: { staggerChildren: 0 } },
      } satisfies Variants,
      item: { hidden: still, show: still } satisfies Variants,
      reduced: true as const,
    };
  }

  return {
    /** Đổi panel: trượt nhẹ 8px + mờ dần. */
    panel: {
      hidden: { opacity: 0, y: 8 },
      show: { opacity: 1, y: 0, transition: { duration: DUR.base, ease: EASE_OUT } },
    } satisfies Variants,
    /** Danh sách: mỗi phần tử trễ hơn phần trước STAGGER. */
    list: {
      hidden: {},
      show: { transition: { staggerChildren: STAGGER, delayChildren: 0.02 } },
    } satisfies Variants,
    item: {
      hidden: { opacity: 0, y: 6 },
      show: { opacity: 1, y: 0, transition: { duration: DUR.fast, ease: EASE_OUT } },
    } satisfies Variants,
    reduced: false as const,
  };
}

/**
 * Đếm số tăng lên khi vào màn hình — stat card đang là số tĩnh nên nhìn như
 * ảnh chụp, không biết con số vừa thay đổi hay không.
 *
 * Vì sao tự làm thay vì thư viện: chỉ cần một phép nội suy, thêm thư viện
 * cho 20 dòng là không đáng.
 */
export function useCountUp(target: number, durationMs = 520) {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);
  // Giá trị ĐANG HIỆN phải nằm trong ref, không đọc từ state: effect chỉ chạy
  // khi `target` đổi, nên nếu lấy `value` trong closure thì nó là số của
  // lần render trước — mục tiêu đổi hai lần liên tiếp sẽ đếm từ số cũ và
  // nhảy ngược. Ref luôn là số mới nhất.
  const shown = useRef(reduced ? target : 0);
  const frame = useRef(0);

  useEffect(() => {
    if (reduced || !Number.isFinite(target)) {
      shown.current = target;
      setValue(target);
      return undefined;
    }
    const from = shown.current;
    if (from === target) return undefined;

    const started = performance.now();
    const tick = (now: number) => {
      // durationMs <= 0 (hoặc rỗng) → bỏ qua nội suy, về thẳng giá trị đích.
      // Trước đây (now - started) / 0 cho NaN khi hai lần gọi cùng mili-giây
      // → setValue(NaN) → màn hình hiện chữ "NaN" và from === target không bao
      // giờ đúng nên vòng đếm không bao giờ dừng.
      const t = durationMs > 0 ? Math.min(1, (now - started) / durationMs) : 1;
      // easeOutCubic — chậm ở đầu, nhanh về cuối, đọc số dễ hơn ease-in.
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (target - from) * eased);
      shown.current = next;
      setValue(next);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, durationMs, reduced]);

  return value;
}
