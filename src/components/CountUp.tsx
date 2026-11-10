import { useCountUp } from "../lib/motion";

/**
 * Số đếm tăng khi vào màn hình — bọc `useCountUp` thành thẻ cho gọn ở JSX.
 *
 * `format` giữ đúng cách ghi số của từng trang (phân cách nghìn theo locale,
 * phần trăm, hậu tố) mà không phải rải `toLocaleString` ở mọi nơi.
 */
export default function CountUp({
  value,
  format,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const shown = useCountUp(value);
  return <span className={className}>{format ? format(shown) : shown}</span>;
}
