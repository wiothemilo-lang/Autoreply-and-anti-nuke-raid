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
 * Ba mảnh của điều hướng trang, cố ý tách nhau:
 *
 *   · `SiteNav`    — dải header dính trên đỉnh (mọi trang trừ landing, vì
 *                    landing có header riêng to hơn — xem components/landing/Nav).
 *   · `PagesMenu`  — nút mở ĐẶT TRONG header + bảng chọn. Landing cắm lại đúng
 *                    component này vào header riêng ⇒ danh sách trang chỉ có
 *                    MỘT nguồn, không nhân bản thành hai bản lệch nhau.
 *   · `PagesDock`  — pill nổi góc dưới bên trái, mở CÙNG bảng chọn đó.
 *
 * VÌ SAO CÓ CẢ HAI LỐI VÀO (07/10/2026): lần đầu bộ chọn trang nằm trong một
 * dock nổi góc dưới; khi chuyển lên header thì dock bị gỡ, nhưng nó là lối vào
 * quen tay — đặc biệt trên điện thoại, góc dưới trái nằm trong tầm ngón tay cái
 * còn nút ở header thì phải với tay. Nay header là điều hướng chính (luôn cùng
 * chỗ, nói rõ đang ở trang nào) và dock là lối tắt phụ. Hai lối KHÔNG được mở
 * cùng lúc (sự kiện `protogon:pages-menu-open` bên dưới).
 *
 * BÀI HỌC ĐỊNH VỊ (đừng lặp lại): bản dock cũ biến mất trên desktop vì lớp neo
 * dọc chỉ có nhánh `max-md:*` — `position: fixed` mà cả `top` lẫn `bottom` đều
 * auto thì trình duyệt đặt phần tử tại VỊ TRÍ TĨNH, tức sau toàn bộ nội dung
 * trang (đo được: top 5589px trong khung 800px). Vì vậy dock nay neo đáy cho
 * MỌI bề mặt: `bottom-4` + `md:bottom-6` + biến thể safe-area cho mobile, và
 * test trình duyệt J3 khoá lại.
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

/**
 * Hai lối mở cùng một bảng chọn (header + dock) nên phải loại trừ nhau: mở cái
 * này thì cái kia tự đóng, nếu không người dùng thấy HAI bảng cùng nội dung ở
 * hai góc màn hình. Dùng sự kiện window thay vì state chung trong React vì hai
 * nút nằm ở hai nhánh cây khác nhau (header và sau nội dung trang).
 */
const MENU_OPEN_EVENT = "protogon:pages-menu-open";

/** Trạng thái + dữ liệu dùng chung cho cả hai lối mở bảng chọn. */
function usePagesMenu(instanceId: string) {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const token = getSessionToken();
  // Chưa đăng nhập → skip subscription (tiết kiệm hạn mức). Cửa sổ Admin chỉ
  // hiện với chủ bot HOẶC quản trị viên nhóm do chủ bot thêm.
  const isAdmin = useQuery(api.status.isAdmin, token ? { token } : "skip");

  const setOpenBoth = useCallback((next: boolean) => {
    openRef.current = next;
    setOpen(next);
  }, []);

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

  const toggle = useCallback(() => {
    const next = !openRef.current;
    setOpenBoth(next);
    if (next) {
      window.dispatchEvent(new CustomEvent(MENU_OPEN_EVENT, { detail: instanceId }));
    }
  }, [instanceId, setOpenBoth]);

  const close = useCallback(() => setOpenBoth(false), [setOpenBoth]);

  // Lối mở KHÁC vừa mở bảng của nó → đóng bảng này (không bao giờ 2 bảng).
  useEffect(() => {
    function onOtherOpen(e: Event) {
      if ((e as CustomEvent<string>).detail !== instanceId) setOpenBoth(false);
    }
    window.addEventListener(MENU_OPEN_EVENT, onOtherOpen);
    return () => window.removeEventListener(MENU_OPEN_EVENT, onOtherOpen);
  }, [instanceId, setOpenBoth]);

  // Escape đóng bảng; đưa focus về nút mở (bàn phím dùng được như menu thật).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenBoth(false);
        triggerRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpenBoth]);

  // Đổi trang thì tự đóng — bảng là lớp phủ, để lại là che nội dung mới.
  useEffect(() => {
    setOpenBoth(false);
  }, [location.pathname, setOpenBoth]);

  return {
    open,
    toggle,
    close,
    triggerRef,
    theme,
    setTheme,
    groups: visibleNavGroups({ isAdmin: isAdmin === true }),
    current: navLabelFor(location.pathname),
  };
}

/** Nút mở nằm trong header — nói rõ ĐANG Ở TRANG NÀO thay vì chỉ ghi "Menu". */
export function PagesMenu() {
  const menu = usePagesMenu("header");
  return (
    <div className="relative">
      <button
        ref={menu.triggerRef}
        onClick={menu.toggle}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-label={translate("Chuyển trang")}
        data-testid="pages-menu"
        className={cn(
          "flex max-w-[9.5rem] items-center gap-1.5 rounded-full border border-border bg-card py-1.5 pl-2 pr-2 text-xs font-semibold text-foreground transition-colors sm:max-w-[13rem] sm:pl-2.5 sm:pr-2.5",
          "hover:border-foreground/30 hover:bg-accent",
          menu.open && "border-foreground/30 bg-accent",
        )}
      >
        <Grid2x2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="hidden truncate sm:inline">
          {menu.current ? translate(menu.current) : translate("Trang")}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            menu.open && "rotate-180",
          )}
        />
      </button>
      {menu.open && (
        <PagesPanel
          placement="top-right"
          onClose={menu.close}
          theme={menu.theme}
          setTheme={menu.setTheme}
          groups={menu.groups}
        />
      )}
    </div>
  );
}

/**
 * Pill nổi góc DƯỚI BÊN TRÁI — lối tắt quen tay, mở cùng bảng chọn với header.
 *
 * Neo đáy tường minh cho MỌI bề mặt (xem bài học định vị ở đầu file): `bottom-4`
 * cho desktop, biến thể safe-area cho mobile (iPhone có thanh home), `top-auto`
 * để không bao giờ rơi về vị trí tĩnh của dòng chảy nội dung.
 */
export function PagesDock() {
  const menu = usePagesMenu("dock");
  const status = useBotStatus();
  const online = status?.online ?? false;
  const label = menu.current ? translate(menu.current) : translate("Menu");
  return (
    <div
      className={cn(
        "fixed left-4 z-50 md:left-6",
        "bottom-4 md:bottom-6",
        "max-md:bottom-[max(1rem,env(safe-area-inset-bottom))]",
        "top-auto",
      )}
    >
      <button
        ref={menu.triggerRef}
        onClick={menu.toggle}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-label={translate("Mở bảng chọn trang")}
        data-testid="pages-dock"
        title={label}
        className={cn(
          "group flex max-w-[min(60vw,14rem)] items-center gap-2.5 rounded-full border border-border bg-card/95 py-2 pl-2 pr-3.5 backdrop-blur-md",
          "shadow-lg shadow-black/10 transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-xl",
          menu.open && "border-foreground/30 bg-card",
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-primary-foreground">
          <Grid2x2 className="h-4 w-4" />
        </span>
        <span className="flex min-w-0 flex-col items-start leading-none">
          <span className="w-full truncate text-[13px] font-semibold text-foreground">{label}</span>
          {/* Chấm trạng thái bot — xám/đen khi online, đỏ khi mất kết nối. */}
          <span className="mt-1 flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
            <span className="relative flex h-1.5 w-1.5">
              {online ? (
                <>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-foreground opacity-50" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-foreground" />
                </>
              ) : (
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-danger" />
              )}
            </span>
            {online ? translate("đang chạy") : translate("mất kết nối")}
          </span>
        </span>
      </button>
      {menu.open && (
        <PagesPanel
          placement="bottom-left"
          onClose={menu.close}
          theme={menu.theme}
          setTheme={menu.setTheme}
          groups={menu.groups}
        />
      )}
    </div>
  );
}

/**
 * Bảng chọn trang + điều khiển nhanh — dùng CHUNG cho cả hai lối mở.
 * `placement` chỉ đổi hướng neo và hướng trượt vào, nội dung giống hệt nhau.
 */
function PagesPanel({
  placement,
  onClose,
  theme,
  setTheme,
  groups,
}: {
  placement: "top-right" | "bottom-left";
  onClose: () => void;
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  groups: ReturnType<typeof visibleNavGroups>;
}) {
  const location = useLocation();
  return (
    <>
      {/* Bắt click ra ngoài — chỉ trên cùng lớp, không che trang. */}
      <button
        aria-label={translate("Đóng bảng chọn trang")}
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default"
        tabIndex={-1}
      />
      <div
        role="dialog"
        aria-label={translate("Bảng chọn trang")}
        data-testid="pages-menu-panel"
        className={cn(
          "absolute z-50 flex w-[min(92vw,19rem)] flex-col overflow-hidden",
          "rounded-xl border border-border bg-card shadow-2xl",
          "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150",
          placement === "top-right"
            ? "right-0 top-full mt-2 motion-safe:slide-in-from-top-2"
            : "bottom-[calc(100%+0.5rem)] left-0 motion-safe:slide-in-from-bottom-2",
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
                      onClick={onClose}
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
