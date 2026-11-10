import * as React from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "../../lib/utils";

import { translate } from "../../lib/i18n";
interface MultiSelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  emptyLabel?: string;
  /** Nhãn cho ô tìm kiếm (vd: "Tìm role…"). Ẩn ô tìm nếu không truyền. */
  searchPlaceholder?: string;
  className?: string;
}

/**
 * MultiSelect có ô tra cứu và nhãn đã chọn.
 *
 * Trigger chỉ là một button; chip xoá nằm ngoài trigger để không tạo nested
 * interactive elements (trình duyệt sửa DOM và screen reader thường bỏ sót một
 * phần của control khi hai button lồng nhau). Danh sách dùng contract
 * listbox/option rõ ràng và hỗ trợ Escape + Arrow/Home/End.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  // Default PHẢI dịch: nơi gọi có thể quên truyền prop → nếu để chuỗi VI
  // thặt, người dùng EN/DE thấy tiếng Việt. (Đánh dấu dịch lúc render, không
  // dịch ở cấp module vì default param tính mỗi lần render.)
  placeholder = translate("Chọn…"),
  emptyLabel = translate("Không có lựa chọn"),
  searchPlaceholder,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [inputEl, setInputEl] = React.useState<HTMLInputElement | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = React.useId();

  React.useEffect(() => {
    function outside(e: Event) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", outside);
    document.addEventListener("touchstart", outside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("touchstart", outside);
    };
  }, []);

  React.useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputEl?.focus(), 10);
      return () => clearTimeout(t);
    }
    setQuery("");
  }, [open, inputEl]);

  const toggle = (v: string) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d");

  const q = norm(query.trim());
  const selectedSet = new Set(value);
  const filtered = options
    .filter((o) => q === "" || norm(o.label).includes(q) || norm(o.sublabel ?? "").includes(q))
    .sort((a, b) => {
      const sa = selectedSet.has(a.value) ? 0 : 1;
      const sb = selectedSet.has(b.value) ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return a.label.localeCompare(b.label, "vi");
    });

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const moveFocus = (from: number, delta: number) => {
    if (filtered.length === 0) return;
    const next = Math.max(0, Math.min(filtered.length - 1, from + delta));
    optionRefs.current[next]?.focus();
  };

  const selectedOptions = value
    .map((v) => options.find((o) => o.value === v))
    .filter((o): o is MultiSelectOption => !!o);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={translate(placeholder)}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-secondary/40 px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <span className="min-w-0 truncate">
          {value.length === 0
            ? translate(placeholder)
            : selectedOptions.length > 0
              ? selectedOptions
                  .slice(0, 3)
                  .map((option) => translate(option.label))
                  .join(", ")
              : value.length}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 opacity-50 transition-transform", open && "rotate-180")}
        />
      </button>

      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1" aria-label={translate("Chọn…")}>
          {value.map((v) => {
            const option = options.find((o) => o.value === v);
            const label = option?.label ?? v;
            return (
              <span
                key={v}
                className="inline-flex max-w-full items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs text-primary"
              >
                <span className="max-w-40 truncate">{translate(label)}</span>
                <button
                  type="button"
                  onClick={() => toggle(v)}
                  aria-label={`${translate("Xóa")} ${translate(label)}`}
                  className="rounded p-0.5 hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {open && (
        <div className="absolute z-[60] mt-1 w-full rounded-xl border border-border bg-popover p-1 shadow-xl">
          {searchPlaceholder && options.length > 6 && (
            <div className="sticky top-0 flex items-center gap-2 rounded-t-lg border-b border-border bg-popover p-2">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={setInputEl}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    close();
                  } else if (e.key === "ArrowDown" && filtered.length > 0) {
                    e.preventDefault();
                    optionRefs.current[0]?.focus();
                  } else if (e.key === "ArrowUp" && filtered.length > 0) {
                    e.preventDefault();
                    optionRefs.current[filtered.length - 1]?.focus();
                  }
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={translate("Xóa tìm kiếm")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          <div
            id={listboxId}
            role="listbox"
            aria-multiselectable="true"
            aria-label={searchPlaceholder ?? placeholder}
            className="max-h-60 max-sm:max-h-[min(45dvh,16rem)] overflow-y-auto"
          >
            {options.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground">{translate(emptyLabel)}</div>
            )}
            {options.length > 0 && filtered.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                {translate("Không khớp")} "{query}"
              </div>
            )}
            {filtered.map((opt, index) => {
              const selected = value.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  ref={(element) => {
                    optionRefs.current[index] = element;
                  }}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  tabIndex={index === 0 ? 0 : -1}
                  onClick={() => toggle(opt.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      close();
                    } else if (e.key === "ArrowDown") {
                      e.preventDefault();
                      moveFocus(index, 1);
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      moveFocus(index, -1);
                    } else if (e.key === "Home") {
                      e.preventDefault();
                      moveFocus(0, 0);
                    } else if (e.key === "End") {
                      e.preventDefault();
                      moveFocus(0, filtered.length - 1);
                    }
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                    selected && "text-primary",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input",
                    )}
                  >
                    {selected && <Check className="h-3 w-3" />}
                  </span>
                  <span className="flex-1 truncate">{translate(opt.label)}</span>
                  {opt.sublabel && (
                    <span className="text-xs text-muted-foreground">{opt.sublabel}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
