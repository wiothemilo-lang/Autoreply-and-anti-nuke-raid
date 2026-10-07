import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, Grid2x2, MessageCircle, Moon, Sun, Wifi, WifiOff } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useBotStatus } from "../lib/useBotStatus";
import { usePublicConfig } from "../lib/usePublicConfig";
import { getSessionToken } from "../lib/discord";
import { cn } from "../lib/utils";
import LangSwitch from "./LangSwitch";
import BotLogo from "./BotLogo";
import { isNavItemActive, navLabelFor, visibleNavGroups } from "../lib/navItems";

import { translate } from "../lib/i18n";

type ThemeMode = "light" | "dark";

/**
 * SiteNav — bộ chọn trang nằm TRONG header (thay dock nổi góc dưới trái).
 *
 * VÌ SAO ĐỔI CHỖ (07/10/2026): bộ chọn trang nằm ở góc dưới trái màn hình nên
 * bị đọc như quảng cáo/phụ kiện treo lơ lửng, và trên desktop nó từng mất hẳn
 * (thiếu neo dọc ⇒ trôi xuống dưới đáy khung nhìn). Đưa lên header biến nó
 * thành điều hướng CHUẨN của web: luôn ở cùng một chỗ, cùng hàng với nhận diện
 * thương hiệu, và nút mở NÓI RÕ ĐANG Ở TRANG NÀO ("Bảng điều khiển ▾") thay vì
 * chỉ ghi "Menu" — người dùng không phải bấm để biết mình đang ở đâu.
 *
 * Hai mảnh, cố ý tách:
 *   · `SiteNav`  — dải header dính trên đỉnh, dùng cho mọi trang trừ landing
 *                 (landing có header riêng to hơn, xem components/landing/Nav).
 *   · `PagesMenu` — nút + bảng chọn, dùng LẠI được ở header landing để không
 *                 nhân bản danh sách trang thành 2 bản lệch nhau.
 */
export default function SiteNav() {
  return (
    <header className="sticky top-0 z-[60] border-b border-border/60 bg-background/85 backdrop-blur-xl">
      <div className="container flex h-12 items-center gap-3">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2"
          aria-label={translate("Về trang chủ Protogon")}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-primary p-0.5">
            <BotLogo className="h-full w-full" />
          </span>
          <span className="font-display text-sm font-bold tracking-tight">
            Protogon<span className="text-primary">.</span>
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-1.5">
          <BotStatusChip />
          <PagesMenu />
        </div>
      </div>
    </header>
  );
}

/** Chấm + chữ trạng thái bot — gọn, chỉ là chỉ báo. */
function BotStatusChip() {
  const status = useBotStatus();
  const online = status?.online ?? false;
  return (
    <span
      className="hidden items-center gap-1.5 rounded-full border border-border bg-card/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground sm:flex"
      title={online ? translate("Bot đang chạy") : translate("Bot mất kết nối")}
    >
      {online ? (
        <Wifi className="h-3.5 w-3.5 text-foreground" />
      ) : (
        <WifiOff className="h-3.5 w-3.5 text-danger" />
      )}
      {online ? translate("đang chạy") : translate("mất kết nối")}
      {status ? (
        <span className="font-mono text-[10px] opacity-70">{status.guildCount} sv</span>
      ) : null}
    </span>
  );
}

export function PagesMenu() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const token = getSessionToken();
  // Chưa đăng nhập → skip subscription (tiết kiệm hạn mức). Cửa sổ Admin chỉ
  // hiện với chủ bot HOẶC quản trị viên nhóm do chủ bot thêm.
  const isAdmin = useQuery(api.status.isAdmin, token ? { token } : "skip");

  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "light";
    const saved = window.localStorage.getItem("protogon-theme");
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("protogon-theme", theme);
  }, [theme]);

  const close = useCallback(() => setOpen(false), []);

  // Escape đóng bảng; đưa focus về nút mở (bàn phím dùng được như menu thật).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Đổi trang thì tự đóng — bảng là lớp phủ, để lại là che nội dung mới.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const groups = visibleNavGroups({ isAdmin: isAdmin === true });
  const current = navLabelFor(location.pathname);

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={translate("Chuyển trang")}
        data-testid="pages-menu"
        className={cn(
          "flex max-w-[9.5rem] items-center gap-1.5 rounded-full border border-border bg-card py-1.5 pl-2 pr-2 text-xs font-semibold text-foreground transition-colors sm:max-w-[13rem] sm:pl-2.5 sm:pr-2.5",
          "hover:border-foreground/30 hover:bg-accent",
          open && "border-foreground/30 bg-accent",
        )}
      >
        <Grid2x2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="hidden truncate sm:inline">
          {current ? translate(current) : translate("Trang")}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <>
          {/* Bắt click ra ngoài — chỉ trên cùng lớp, không che trang. */}
          <button
            aria-label={translate("Đóng bảng chọn trang")}
            onClick={close}
            className="fixed inset-0 z-40 cursor-default"
            tabIndex={-1}
          />
          <div
            role="dialog"
            aria-label={translate("Bảng chọn trang")}
            data-testid="pages-menu-panel"
            className={cn(
              "absolute right-0 top-full z-50 mt-2 flex w-[min(92vw,19rem)] flex-col overflow-hidden",
              "rounded-xl border border-border bg-card shadow-2xl",
              "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-150",
            )}
          >
            <nav
              aria-label={translate("Điều hướng")}
              className="max-h-[70vh] space-y-3 overflow-y-auto px-2 py-3"
            >
              {groups.map((group) => (
                <div key={group.title}>
                  <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {translate(group.title)}
                  </p>
                  <ul className="space-y-0.5">
                    {group.items.map((item) => (
                      <li key={item.to}>
                        <PageLink
                          to={item.to}
                          icon={item.icon}
                          label={item.label}
                          hint={item.hint}
                          accent={item.accent}
                          active={isNavItemActive(location.pathname, item.to)}
                          onClick={close}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>

            <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
              <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/50 p-0.5">
                {(
                  [
                    // i18n-ok: nhãn được dịch lúc render bằng translate(label)
                    ["light", "Sáng", Sun],
                    ["dark", "Tối", Moon],
                  ] as const
                ).map(([mode, label, Icon]) => (
                  <button
                    key={mode}
                    onClick={() => setTheme(mode)}
                    aria-pressed={theme === mode}
                    aria-label={translate(label)}
                    title={translate(label)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors",
                      theme === mode
                        ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
              <LangSwitch showIcon className="ml-auto" />
              <CommunityLinks />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Liên kết cộng đồng — chỉ Discord (Facebook đã có ở footer landing). */
function CommunityLinks() {
  const { discordInvite } = usePublicConfig();
  if (!discordInvite) return null;
  return (
    <a
      href={discordInvite}
      target="_blank"
      rel="noreferrer"
      aria-label="Discord"
      title="Discord"
      className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-secondary/50 text-muted-foreground transition-colors hover:text-foreground"
    >
      <MessageCircle className="h-3.5 w-3.5" />
    </a>
  );
}

/**
 * Một mục trang trong bảng chọn. Trang đang mở = nền đậm + thanh nhấn bên trái
 * (không chỉ dựa vào màu chữ — người mắt kém màu vẫn phân biệt được).
 */
function PageLink({
  to,
  icon: Icon,
  label,
  hint,
  active,
  accent,
  onClick,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  active?: boolean;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-2.5 rounded-lg py-2 pl-2.5 pr-2 text-sm font-medium transition-colors",
        active
          ? "bg-foreground text-primary-foreground"
          : accent
            ? "text-foreground hover:bg-secondary/70"
            : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
      )}
    >
      {/* Thanh nhấn trang đang mở — dấu hiệu thị giác không phụ thuộc màu */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full transition-opacity",
          active ? "bg-primary-foreground opacity-100" : "opacity-0",
        )}
      />
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{translate(label)}</span>
      {accent && !active && (
        <span className="shrink-0 rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
          {translate("Mới")}
        </span>
      )}
      {hint && (
        <span
          className={cn(
            "ml-auto shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold",
            active
              ? "border-primary-foreground/40 text-primary-foreground"
              : "border-border bg-secondary text-foreground",
          )}
        >
          {hint}
        </span>
      )}
    </Link>
  );
}
