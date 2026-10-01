/**
 * useUnsavedChanges — cảnh báo trước khi MẤT thay đổi chưa lưu.
 *
 * Vì sao cần: nhiều panel dùng form rồi bấm "Lưu" (Settings, Welcome,
 * Moderation…). Trước đây không có gì chặn — người dùng sửa vài trường, bấm
 * nhầm tab khác hoặc tắt trình duyệt, **mất sạch không một dấu vết**. Đúng
 * lớp lỗi im lặng dự án này đang chặn ở tầng dữ liệu, nhưng ở tầng form thì
 * chưa ai canh.
 *
 * Vì sao là KHO DÙNG CHUNG chứ không phải state riêng mỗi panel: điều hướng
 * đổi tab nằm ở `GuildPage`, không nằm trong panel. Nếu mỗi panel giữ state
 * riêng thì trang cha không biết có gì chưa lưu để hỏi trước. Kho ở tầng
 * module giải quyết đúng chỗ đặt câu hỏi.
 */

import { useEffect } from "react";

/** panelId → có thay đổi chưa lưu hay không. */
const dirtyPanels = new Set<string>();

/** Đánh dấu panel có (hoặc hết) thay đổi chưa lưu. */
export function setPanelDirty(panelId: string, dirty: boolean): void {
  if (dirty) dirtyPanels.add(panelId);
  else dirtyPanels.delete(panelId);
}

/** Đang có panel nào chưa lưu không. */
export function hasUnsavedChanges(): boolean {
  return dirtyPanels.size > 0;
}

/** Danh sách panel đang chờ lưu (để hiện thông báo cho đúng tên). */
export function unsavedPanelIds(): string[] {
  return [...dirtyPanels];
}

/**
 * Chặn RỜI TRANG khi còn thay đổi chưa lưu.
 *
 * Chỉ canh `beforeunload` (đóng tab / đổi trang / nút Back của trình duyệt).
 * Việc bấm sang panel khác trong cùng trang do `GuildPage` gọi `confirmLeave()`
 * — trình duyệt không bắt được thao tác đó, và chỉ dùng `window.confirm` ở
 * đúng chỗ thì mới hỏi được (bấm nhầm tab là hành vi phổ biến hơn đóng tab).
 */
export function useUnsavedChanges(panelId: string, dirty: boolean): void {
  useEffect(() => {
    setPanelDirty(panelId, dirty);
    return () => setPanelDirty(panelId, false);
  }, [panelId, dirty]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome cần returnValue để hiện hộp thoại "Leave site?".
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}

/**
 * Hỏi xác nhận trước khi bỏ thay đổi. Trả `true` = được đi tiếp.
 *
 * Dùng `window.confirm` chứ không tự dựng dialog: đây là lúc người dùng cần
 * quyết định nhanh, trình duyệt hiện hộp thoại native sẵn có kèm nút "Ở lại"
 * an toàn hơn hộp tự viết (mất focus, bấm nhầm).
 */
export function confirmLeave(): boolean {
  if (!hasUnsavedChanges()) return true;
  // `globalThis` chứ không phải `window`: hàm này còn được gọi trong test
  // chạy ngoài trình duyệt (bun), nơi `window` không tồn tại.
  const ask = (globalThis as { confirm?: (m: string) => boolean }).confirm;
  if (typeof ask !== "function") return true;
  return ask("Bạn có thay đổi chưa lưu. Thay đổi sẽ mất nếu bạn rời đi. Vẫn đi tiếp?");
}
