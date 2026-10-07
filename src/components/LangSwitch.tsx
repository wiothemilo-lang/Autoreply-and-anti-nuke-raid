import { Globe } from "lucide-react";
import { useT } from "../lib/i18n";
import { cn } from "../lib/utils";

const OPTIONS = [
  ["vi", "VI"],
  ["en", "EN"],
  ["de", "DE"],
] as const;

/**
 * Công tắc ngôn ngữ VI ⇄ EN ⇄ DE — nhúng vào chrome của mọi trang (nav landing,
 * header chung, header dashboard). Lựa chọn được lưu ở localStorage và đổi ngay,
 * không cần tải lại trang.
 *
 * Dùng hook useT() (không phải translate() toàn cục) để component này là
 * consumer của LangContext: khi đổi ngôn ngữ, LangProvider re-render → App
 * (cũng là consumer) vẽ lại toàn bộ cây UI với chuỗi đã dịch.
 */
export default function LangSwitch({
  className,
  showIcon = false,
}: {
  className?: string;
  /** Hiện icon quả địa cầu phía trước — dùng ở nơi thoáng (header/nav). */
  showIcon?: boolean;
}) {
  const { lang, setLang, t } = useT();

  return (
    <nav
      aria-label={t("Ngôn ngữ")}
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-secondary/50 p-0.5",
        className,
      )}
    >
      {showIcon && <Globe aria-hidden className="ml-1 h-3.5 w-3.5 text-muted-foreground" />}
      {OPTIONS.map(([code, label]) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
          title={code === "vi" ? t("Tiếng Việt") : code === "de" ? t("Tiếng Đức") : t("English")}
          className={cn(
            "rounded-md px-2 py-1 text-[11px] font-bold tracking-wide transition-colors",
            lang === code
              ? "bg-card text-foreground shadow-sm ring-1 ring-border"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
