/**
 * CommandPalette — tìm kiếm nhanh (⌘K / Ctrl+K) trong dashboard.
 *
 * Vì sao cần: dashboard có 15 panel. Tìm "cấu hình Join Gate" phải nhớ nó
 * nằm tab nào; người mới không biết cấu trúc sẽ bỏ dashboard rất nhanh.
 *
 * Vì sao dùng Dialog + lọc tay, không thêm `@radix-ui/react-command`: dự án
 * đã có sẵn `@radix-ui/react-dialog` (xem package.json) và AGENTS.md cấm
 * cài dependency mới khi chưa hỏi. Bộ lọc của ta chỉ vài chục dòng, tự viết
 * còn nhẹ hơn và không kéo thêm ~30KB vào bundle.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CornerDownLeft, Search } from "lucide-react";

import { translate } from "../lib/i18n";

import type { CommandItem } from "../lib/commandPalette";
import { filterCommands } from "../lib/commandPalette";

export type { CommandItem } from "../lib/commandPalette";
export { filterCommands, foldDiacritics, scoreCommand } from "../lib/commandPalette";

export default function CommandPalette({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: CommandItem[];
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => filterCommands(items, query).slice(0, 12), [items, query]);

  // Mở lại thì luôn bắt đầu từ trống — giữ chuỗi cũ gây rối mỗi lần gọi.
  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
    }
  }, [open]);

  useEffect(() => {
    if (cursor >= results.length) setCursor(0);
  }, [results.length, cursor]);

  function pick(item: CommandItem | undefined) {
    if (!item) return;
    onOpenChange(false);
    item.run();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (results.length ? (c + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (results.length ? (c - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(results[cursor]);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-[12vh] z-50 w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
          onKeyDown={onKeyDown}
        >
          <Dialog.Title className="sr-only">{translate("Tìm kiếm nhanh")}</Dialog.Title>
          <Dialog.Description className="sr-only">
            {translate("Gõ để tìm panel, sau đó Enter để mở.")}
          </Dialog.Description>
          <div className="flex items-center gap-2 border-b border-border px-3.5">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={translate("Tìm panel hoặc hành động…")}
              aria-label={translate("Tìm panel hoặc hành động")}
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {translate("Không có kết quả nào.")}
            </p>
          ) : (
            <ul ref={listRef} className="max-h-72 overflow-y-auto p-1.5" role="listbox">
              {results.map((item, i) => (
                <li key={item.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === cursor}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => pick(item)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${
                      i === cursor ? "bg-primary/10 text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {translate(item.label)}
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        {translate(item.group)}
                      </span>
                    </span>
                    {i === cursor ? <CornerDownLeft className="h-3.5 w-3.5 shrink-0" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
