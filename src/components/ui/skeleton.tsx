import { cn } from "../../lib/utils";

/**
 * Skeleton loader cho UI và panel:
 * - Chu kỳ pulse mượt mà.
 * - Tắt hoàn toàn chuyển động khi prefers-reduced-motion: reduce.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted/70 motion-reduce:animate-none", className)}
      {...props}
    />
  );
}
