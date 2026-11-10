import { useEffect, useRef } from "react";

/** 1 mục lệnh. `keywords` là từ khoá tìm thêm (tiếng Anh/ký hiệu). */
export interface CommandItem {
  id: string;
  label: string;
  /** Nhóm hiển thị phụ (vd "Điều hướng"). */
  group: string;
  keywords?: string;
  run: () => void;
}

/**
 * Bỏ dấu tiếng Việt để "gac hieu" khớp "Gác hiệu".
 *
 * Dùng `\p{Diacritic}` + cờ `u` thay vì gõ trực tiếp dải dấu tổ hợp
 * U+0300–U+036F: ký tự tổ hợp rất dễ bị trình soạn thảo hoặc Prettier nuốt,
 * biểu thức thành vô nghĩa mà KHÔNG báo lỗi — đúng loại lỗi im lặng mà dự án
 * này chặn.
 */
export function foldDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d");
}

/**
 * Chấm điểm tìm kiếm. HÀM THUẦN — test được, không cần DOM.
 *
 * Vì sao chấm điểm thay vì `includes`: người dùng gõ "joingate" (không có dấu
 * câu) hoặc "gac hieu" (không dấu) vẫn phải ra kết quả. Khớp tiền tố được
 * cộng điểm cao hơn khớp ở giữa, và giữ nguyên thứ tự danh sách khi hòa điểm
 * (người dùng đã quen vị trí panel).
 */
export function scoreCommand(item: Pick<CommandItem, "label" | "keywords">, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const label = item.label.toLowerCase();
  const kw = (item.keywords ?? "").toLowerCase();
  if (label.startsWith(q)) return 100;
  if (label.includes(q)) return 70;
  if (kw.includes(q)) return 50;
  const fl = foldDiacritics(label);
  if (fl.startsWith(q)) return 40;
  if (fl.includes(q)) return 30;
  if (foldDiacritics(kw).includes(q)) return 20;
  return 0;
}

/** Lọc + sắp xếp theo điểm, giữ thứ tự gốc khi hòa điểm. */
export function filterCommands<T extends Pick<CommandItem, "label" | "keywords">>(
  items: T[],
  query: string,
): T[] {
  return items
    .map((item, i) => ({ item, i, score: scoreCommand(item, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((r) => r.item);
}

/**
 * Hook mở palette bằng ⌘K / Ctrl+K.
 *
 * Nằm ở module RIÊNG (không phải `components/CommandPalette.tsx`) để
 * `GuildPage` dùng được phím tắt mà không kéo `@radix-ui/react-dialog` vào
 * chunk của trang — component palette chỉ tải khi người dùng thật sự mở.
 */
export function useCommandPaletteShortcut(onOpen: () => void): void {
  const ref = useRef(onOpen);
  ref.current = onOpen;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      ref.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
