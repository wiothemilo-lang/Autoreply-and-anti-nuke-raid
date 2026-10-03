import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useProductMotion } from "../lib/motion";
import { translate } from "../lib/i18n";

/**
 * SHEET PANEL TRÊN MOBILE — panel cấu hình trượt lên phủ gần hết màn hình.
 *
 * Vì sao cần (đợt #4): trước đây mobile đổ panel bằng cách cuộn xuống trang.
 * Hệ quả là (1) bấm xong phải cuộn, (2) thanh nav dính đè lên đầu panel nên
 * không biết đang ở panel nào, (3) panel dài hơn màn hình thì thoát ra cũng
 * phải cuộn ngược. Sheet biến "đổi panel" thành một thao tác: bấm mục → panel
 * hiện ngay trên mặt, có tên panel ở đầu, thoát bằng nút X hay Esc.
 *
 * Vì sao render qua PORTAL (`document.body`):
 * `PageReveal` bọc `<main>` trong `motion.main` có `transform` (chuyển cảnh
 * trượt 8px). Theo đặc tả CSS, một phần tử `transform` trở thành containing
 * block cho mọi `position: fixed` bên trong — `fixed inset-0` sẽ bám vào
 * `<main>` thay vì bám viewport, và sheet bị cắt/cách lệch. Portal ra body
 * là lối thoát chuẩn khỏi containing block đó.
 *
 * Lưu ý: chính GuildPage chỉ render sheet này khi màn hình hẹp — không phải
 * ẩn bằng class `lg:hidden`. Rút gọn: không ẩn bằng CSS thì panel bị mount
 * hai lần (một ẩn, một hiện), tức mỗi panel chạy đôi `useQuery` của Convex.
 */
export default function MobilePanelSheet({
  title,
  onClose,
  children,
}: {
  /** Tên panel hiện ở đầu sheet — lấy từ `NAV_ITEMS` đã qua `translate`. */
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const motionSet = useProductMotion();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Khoá cuộn trang nền: sheet phủ `inset-0` nhưng iOS vẫn cuộn được trang
    // bên dưới theo thói quen vuốt — người dùng tưởng sheet ngắn.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Đưa focus vào nút đóng: bàn phím không mất vị trí, và đọc bằng screen
    // reader vào thẳng tiêu đề panel thay vì đọc từ nav phía sau.
    closeRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      variants={motionSet.panel}
      initial="hidden"
      animate="show"
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-background/95 px-2 py-2 backdrop-blur">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={translate("Đóng")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="min-w-0 flex-1 truncate font-display text-sm font-bold">{title}</h2>
      </header>
      {/* min-h-0: con của flex phải cho phép co lại, nếu không vùng cuộn sẽ bị
          đẩy dài hơn khung và thanh đầu sheet trôi mất. overscroll-contain:
          cuộn hết trong sheet thì không kéo theo trang nền. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-10 pt-3">
        {children}
      </div>
    </motion.div>,
    document.body,
  );
}
