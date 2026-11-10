import { toast } from "sonner";
import { friendlyConvexError } from "./convexError";

/**
 * Báo lỗi Convex theo MỘT chuẩn cho toàn dashboard.
 *
 * Vì sao cần: production CHE message `Error` của Convex thành
 * "[Request ID: …] Server Error Called by client". 70+ chỗ trong panel đang
 * làm `toast.error(e instanceof Error ? e.message : …)` hoặc tệ hơn
 * `String(e)` → người dùng nhận khối chữ kỹ thuật thay vì lý do thật/`fallback`.
 * Hàm này đi qua `friendlyConvexError` (đã có test hermetic) rồi mới toast.
 *
 * @param e        lỗi bắt từ useMutation/useAction
 * @param fallback câu ĐÃ qua `translate()` — dùng khi không đọc được lý do thật
 */
export function toastConvexError(e: unknown, fallback: string): void {
  toast.error(friendlyConvexError(e, fallback));
}
