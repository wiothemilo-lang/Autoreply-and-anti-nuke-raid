import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { useProductMotion } from "../lib/motion";
import {
  AppWindow,
  ArrowLeft,
  Bot,
  CloudUpload,
  DoorOpen,
  ExternalLink,
  Gavel,
  LayoutDashboard,
  LifeBuoy,
  Lock,
  Megaphone,
  PartyPopper,
  Settings,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  Webhook as WebhookIcon,
} from "lucide-react";
import { DEFAULT_THEME, SERVER_THEMES } from "../lib/constants";
import PanelErrorBoundary from "../components/PanelErrorBoundary";
import PageSplash, { PanelSkeleton } from "../components/PageSplash";
import BotLogo from "../components/BotLogo";
import HaimiyaChat from "../components/HaimiyaChat";
import UnlockPanel, { hiddenUnlockKey } from "../components/dashboard/UnlockPanel";
import { api } from "../../convex/_generated/api";
import { Badge } from "../components/ui/badge";
import { cn } from "../lib/utils";
import { buildBotInviteUrl, discordGuildIconUrl, getSessionToken } from "../lib/discord";
import { usePublicConfig } from "../lib/usePublicConfig";
import { isHeartbeatFresh, timeAgo } from "../lib/utils";
import type { GuildData } from "../lib/types";
import OverviewPanel from "../components/dashboard/OverviewPanel";
import OnboardingChecklist from "../components/dashboard/OnboardingChecklist";
import CommandPalette, {
  useCommandPaletteShortcut,
  type CommandItem,
} from "../components/CommandPalette";
import { confirmLeave } from "../lib/useUnsavedChanges";
import { syncState } from "../lib/syncState";
import MobilePanelSheet from "../components/MobilePanelSheet";
import { HOME_SECTION, shouldUsePanelSheet, useNarrowViewport } from "../lib/mediaQuery";

import LangSwitch from "../components/LangSwitch";
import SkipLink from "../components/SkipLink";

import { dateLocale, translate } from "../lib/i18n";
// Code-split theo panel: mở tab nào mới tải JS của tab đó. Chỉ OverviewPanel
// (panel mặc định) được nạp eager để tab đầu hiển thị tức thì.
const AntiNukePanel = lazy(() => import("../components/dashboard/AntiNukePanel"));
const ExternalAppRaidsPanel = lazy(() => import("../components/dashboard/ExternalAppRaidsPanel"));
const AutoModPanel = lazy(() => import("../components/dashboard/AutoModPanel"));
const ModerationPanel = lazy(() => import("../components/dashboard/ModerationPanel"));
const BackupPanel = lazy(() => import("../components/dashboard/BackupPanel"));
const ModActionsPanel = lazy(() => import("../components/dashboard/ModActionsPanel"));
const JoinGatePanel = lazy(() => import("../components/dashboard/JoinGatePanel"));
const WelcomePanel = lazy(() => import("../components/dashboard/WelcomePanel"));
const SettingsPanel = lazy(() => import("../components/dashboard/SettingsPanel"));
const WhitelistPanel = lazy(() => import("../components/dashboard/WhitelistPanel"));
const VerifyPanel = lazy(() => import("../components/dashboard/VerifyPanel"));
const AltDetectionPanel = lazy(() => import("../components/dashboard/AltDetectionPanel"));
const WebhookPanel = lazy(() => import("../components/dashboard/WebhookPanel"));
const HiddenPanel = lazy(() => import("../components/dashboard/HiddenPanel"));
const TicketPanel = lazy(() => import("../components/dashboard/TicketPanel"));

type SectionKey =
  | "overview"
  | "automod"
  | "moderation"
  | "joingate"
  | "welcome"
  | "altdetect"
  | "antinuke"
  | "externalapp"
  | "whitelist"
  | "backup"
  | "punishments"
  | "verify"
  | "webhooks"
  | "tickets"
  | "hidden"
  | "settings";

const NAV_ITEMS: { key: SectionKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: "overview", label: "Tổng quan", icon: LayoutDashboard },
  { key: "automod", label: "Auto-mod", icon: ShieldCheck },
  { key: "moderation", label: "Moderation", icon: Megaphone },
  { key: "joingate", label: "Join Gate", icon: DoorOpen },
  { key: "welcome", label: "Welcome & Goodbye", icon: PartyPopper },
  { key: "altdetect", label: "Alt Detection", icon: UserX },
  { key: "antinuke", label: "Chống nuke / raid", icon: ShieldAlert },
  { key: "externalapp", label: "Raid external app", icon: AppWindow },
  { key: "whitelist", label: "Whitelist", icon: UserCheck },
  { key: "backup", label: "Backup server", icon: CloudUpload },
  { key: "punishments", label: "Hình phạt", icon: Gavel },
  { key: "verify", label: "Xác minh (Verify)", icon: UserCheck },
  { key: "webhooks", label: "Webhook & Log", icon: WebhookIcon },
  { key: "tickets", label: "Ticket & Khiếu nại", icon: LifeBuoy },
  { key: "hidden", label: "Tính năng ẩn 🔒", icon: Lock },
  { key: "settings", label: "Cài đặt", icon: Settings },
];

/**
 * Gom 15 mục thành 4 nhóm.
 *
 * Vì sao: trước đây là 15 nút dọc phẳng, dài và không có mốc nào cho người
 * dùng đoán "mục này thuộc chuyện gì". 15 mục không phải con số nhỏ — mắt
 * người quét ~5–7 mục rồi bắt đầu dò la. Nhóm + tiêu đề rút gọn scan xuống
 * còn 4 lần "tìm trong nhóm", phần còn lại là quét trong một khối ngắn.
 *
 * Mobile KHÔNG dùng nhóm: ở đó nav là hàng cuộn ngang, tiêu đề nhóm sẽ
 * chen ngang làm rối. Vì vậy tiêu đề `hidden lg:block` và nhóm bọc `contents`
 * (thẻ biến mất khỏi layout, con vẫn xếp trực tiếp trong nav cha).
 */
const NAV_GROUPS: { key: string; label: string; items: SectionKey[] }[] = [
  {
    key: "protect",
    label: "Bảo vệ",
    items: ["automod", "moderation", "joingate", "altdetect", "antinuke", "externalapp"],
  },
  { key: "content", label: "Nội dung & phạt", items: ["welcome", "punishments", "verify"] },
  {
    key: "ops",
    label: "Vận hành",
    items: ["whitelist", "backup", "webhooks", "tickets", "settings", "hidden"],
  },
];

/** Loader nhỏ giữ bố cục khi chunk panel đang tải (lần đầu mở tab). */
function PanelFallback() {
  return <PanelSkeleton />;
}

/**
 * Nhớ panel đang mở, RIÊNG theo từng server.
 *
 * Vì sao: trước đây `section` luôn khởi tạo `"overview"` → quay lại server
 * thứ hai là mất chỗ đang làm việc. Người dùng quản nhiều server hay đi
 * qua lại, mỗi lần phải bấm lại menu là một lần thất lạc thông tin.
 */
function sectionMemoryKey(guildId: string) {
  return `protogon:section:${guildId}`;
}

function readRememberedSection(guildId: string): SectionKey {
  if (!guildId) return "overview";
  const saved = sessionStorage.getItem(sectionMemoryKey(guildId));
  return (NAV_ITEMS.some((i) => i.key === saved) ? saved : "overview") as SectionKey;
}

export default function GuildPage() {
  const { guildId = "" } = useParams();
  const navigate = useNavigate();
  const [section, setSection] = useState<SectionKey>(() => readRememberedSection(guildId));
  const motionSet = useProductMotion();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [hiddenUnlocked, setHiddenUnlocked] = useState(
    () => sessionStorage.getItem(hiddenUnlockKey()) === "1",
  );
  const token = getSessionToken();
  const data = useQuery(api.guilds.getGuild, { token, guildId }) as GuildData | null | undefined;
  const { clientId } = usePublicConfig();

  /**
   * Đổi panel: hỏi trước nếu đang có thay đổi chưa lưu.
   *
   * Vì sao phải hỏi ở ĐÂY chứ không chỉ `beforeunload`: bấm nhầm tab là hành
   * vi xảy ra hằng ngày, còn đóng trình duyệt thì hiếm. Không có bước hỏi này
   * thì người dùng mất sạch cấu hình không hiểu vì sao.
   */
  const goToSection = useCallback((key: SectionKey) => {
    if (!confirmLeave()) return;
    setSection(key);
    // Mobile: cuộn lên đầu nội dung khi đổi panel — người dùng luôn thấy đầu
    // panel mới thay vì đứng ở vị trí cuộn cũ.
    if (window.innerWidth < 1024) window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // ── Sheet panel trên mobile (đợt #4) ──
  // Màn hình hẹp thì panel cấu hình nằm trong sheet full-screen thay vì cuộn
  // trong trang; desktop giữ nguyên bố cục cột bên cạnh.
  const narrow = useNarrowViewport();
  const sheetOpen = shouldUsePanelSheet(narrow, section);
  // `useCallback` BẮT BUỘC: MobilePanelSheet dùng `onClose` làm dep của effect
  // khoá cuộn nền — nếu callback đổi mỗi lần render thì effect chạy lại
  // liên tục, khoá/hoá cuộn nền và giành focus nút đóng liên tục.
  const closeSheet = useCallback(() => goToSection(HOME_SECTION as SectionKey), [goToSection]);

  // Ghi lại panel đang mở. Đồng thời nạp lại khi đổi server: `useState` chỉ
  // khởi tạo MỘT lần nên điều hướng /dashboard/A → /dashboard/B sẽ mang theo
  // section của server A — sai.
  const lastGuildId = useRef(guildId);
  useEffect(() => {
    if (lastGuildId.current === guildId) return;
    lastGuildId.current = guildId;
    setSection(readRememberedSection(guildId));
  }, [guildId]);
  useEffect(() => {
    if (!guildId) return;
    sessionStorage.setItem(sectionMemoryKey(guildId), section);
  }, [guildId, section]);

  useCommandPaletteShortcut(useCallback(() => setPaletteOpen(true), []));

  // Palette: 15 panel + vài lối tắt tới trang khác.
  const commands = useMemo<CommandItem[]>(() => {
    const nav = NAV_ITEMS.map((item) => ({
      id: `nav:${item.key}`,
      label: item.label,
      group: "Điều hướng",
      keywords: item.key,
      run: () => goToSection(item.key),
    }));
    const pages: CommandItem[] = [
      {
        id: "page:history",
        label: "Lịch sử chống nuke",
        group: "Trang khác",
        keywords: "history log su kien",
        run: () => navigate(`/dashboard/${guildId}/history`),
      },
      {
        id: "page:incidents",
        label: "Sự cố",
        group: "Trang khác",
        keywords: "incident su co",
        run: () => navigate(`/dashboard/${guildId}/incidents`),
      },
      {
        id: "page:servers",
        label: "Danh sách server",
        group: "Trang khác",
        keywords: "dashboard servers",
        run: () => navigate("/dashboard"),
      },
      {
        id: "page:monitor",
        label: "Giám sát bot",
        group: "Trang khác",
        keywords: "monitor status trang thai",
        run: () => navigate("/monitor"),
      },
    ];
    return [...nav, ...pages];
  }, [goToSection, navigate, guildId]);

  if (data === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <PageSplash minHeight="min-h-screen" />
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p className="font-display text-lg font-semibold">
          {translate("Không thể truy cập server này")}
        </p>
        <p className="text-sm text-muted-foreground">
          {translate("Bạn không có quyền quản lý, hoặc bot chưa đồng bộ server này.")}{" "}
        </p>
        <Link to="/dashboard" className="text-sm text-primary hover:underline">
          {translate("← Về danh sách server")}{" "}
        </Link>
      </div>
    );
  }

  const icon = discordGuildIconUrl({ id: data.guild.discordId, icon: data.guild.icon });
  const online = data.guild.botInGuild && isHeartbeatFresh(data.guild.lastHeartbeat);
  const sync = syncState({
    settingsChangedAt: data.guild.settingsChangedAt,
    botOnline: online,
    lastHeartbeat: data.guild.lastHeartbeat,
  });

  // Badge trạng thái server — khai báo 1 lần, dùng lại ở hàng desktop (dưới
  // tên) và dải cuộn ngang ở mobile, tránh 2 bản JSX lệch nhau.
  const badges = (
    <>
      <Badge variant="outline" className="shrink-0 font-mono">
        {data.guild.prefix} prefix
      </Badge>
      <Badge variant="secondary" className="shrink-0">
        {data.guild.memberCount?.toLocaleString(dateLocale()) ?? "?"} {translate("thành viên")}
      </Badge>
      <Badge variant={data.guild.antinukeEnabled ? "default" : "secondary"} className="shrink-0">
        <ShieldAlert className="h-3 w-3" />
        {data.guild.antinukeEnabled ? translate("Chống nuke bật") : translate("Chống nuke tắt")}
      </Badge>
      <Badge variant={online ? "success" : "secondary"} className="shrink-0">
        <span
          className={`h-1.5 w-1.5 rounded-full ${online ? "bg-foreground" : "bg-muted-foreground"}`}
        />
        Bot {online ? "online" : "offline"} · {timeAgo(data.guild.lastHeartbeat)}
      </Badge>
      {/* Trạng thái đồng bộ: web đã lưu ≠ bot đang chạy. Xem lib/syncState.ts
          — chỉ nói điều CHỨNG MINH ĐƯỢC, không báo "đã áp dụng" khi chưa có
          tín hiệu xác nhận từ bot. */}
      {sync !== "in-sync" ? (
        <Badge
          variant={sync === "bot-offline" ? "danger" : "outline"}
          className="shrink-0"
          title={translate(
            "Dashboard và bot dùng chung cấu hình nhưng cập nhật không cùng lúc. Lúc này bot có thể vẫn chạy cấu hình cũ.",
          )}
        >
          {sync === "just-saved"
            ? translate("Đang gửi cấu hình cho bot…")
            : sync === "sent"
              ? translate("Đã gửi cấu hình cho bot")
              : translate("Bot offline — cấu hình chưa được áp dụng")}
        </Badge>
      ) : null}
    </>
  );

  // Chủ đề màu riêng của server — ghi đè CSS var trong phạm vi trang này.
  const theme = SERVER_THEMES[data.guild.theme] ?? SERVER_THEMES[DEFAULT_THEME];
  const themeVars = {
    "--primary": theme.primary,
    "--ring": theme.ring,
  } as React.CSSProperties;

  // Thân panel — TẠO MỘT LẦN rồi chọn chỗ hiển thị (trong trang ở desktop,
  // trong sheet ở mobile). Tách ra biến vì nếu viết cùng một khối JSX ở cả hai
  // nhánh thì React sẽ mount panel HAI lần: mỗi panel chạy `useQuery` của
  // Convex riêng ⇒ hai lần đọc dữ liệu, hai lần subscribe, hai bộ id trùng.
  const panelNode = (
    <PanelErrorBoundary key={`${section}:${data.guild.discordId}`}>
      <Suspense fallback={<PanelFallback />}>
        {/* key theo section: đổi panel = phần tử mới, AnimatePresence
            nhận ra là chuyển cảnh thật. Chỉ trượt 8px + mờ trong
            0.2s — đủ để mắt bám theo, không đủ để cảm như chờ. */}
        <motion.div key={section} variants={motionSet.panel} initial="hidden" animate="show">
          {section === "overview" && (
            <OverviewPanel data={data} onNavigate={(target) => goToSection(target as SectionKey)} />
          )}
          {section === "automod" && <AutoModPanel data={data} />}
          {section === "moderation" && <ModerationPanel data={data} />}
          {section === "joingate" && <JoinGatePanel data={data} />}
          {section === "welcome" && <WelcomePanel data={data} />}
          {section === "altdetect" && <AltDetectionPanel data={data} />}
          {section === "antinuke" && <AntiNukePanel data={data} />}
          {section === "externalapp" && <ExternalAppRaidsPanel data={data} />}
          {section === "whitelist" && <WhitelistPanel data={data} />}
          {section === "backup" && <BackupPanel data={data} />}
          {section === "punishments" && <ModActionsPanel data={data} />}
          {section === "verify" && <VerifyPanel data={data} />}
          {section === "webhooks" && <WebhookPanel data={data} />}
          {section === "tickets" && <TicketPanel data={data} />}
          {section === "settings" && <SettingsPanel data={data} />}
          {section === "hidden" &&
            (!data.guild.isBotOwner || (data.guild.hiddenPasswordSet && !hiddenUnlocked) ? (
              <UnlockPanel data={data} onUnlocked={() => setHiddenUnlocked(true)} />
            ) : (
              <>
                {data.guild.hiddenPasswordSet && (
                  <div className="mb-4 flex justify-end">
                    <button
                      onClick={() => {
                        sessionStorage.removeItem(hiddenUnlockKey());
                        setHiddenUnlocked(false);
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Lock className="h-3.5 w-3.5" /> {translate("Khóa lại")}{" "}
                    </button>
                  </div>
                )}
                <HiddenPanel data={data} />
              </>
            ))}
        </motion.div>
      </Suspense>
    </PanelErrorBoundary>
  );

  return (
    <div className="relative min-h-screen overflow-x-clip" style={themeVars}>
      <HaimiyaChat position="dashboard" />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} items={commands} />
      <SkipLink />
      <div className="relative z-10">
        <header className="border-b border-border/60 bg-background/70 backdrop-blur">
          {/* Header 2 hàng cho điện thoại: hàng 1 là điều hướng + nhận diện
              server + hành động (mời bot, đổi ngôn ngữ); hàng 2 là dải badge
              cuộn ngang. Trước đây tất cả nằm trong 1 hàng flex-wrap nên
              badge đội chiều cao và hàng hành động bị đẩy xuống, tràn khỏi
              mép phải (trang bị overflow-x-clip nên phần tràn không xem được). */}
          <div className="container py-3 max-sm:px-3 sm:py-5">
            <div className="flex items-center gap-2.5 sm:gap-4">
              <Link
                to="/dashboard"
                aria-label={translate("← Về danh sách server")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              {icon ? (
                <img
                  src={icon}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-xl sm:h-12 sm:w-12 sm:rounded-2xl"
                />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary font-display text-base font-bold text-muted-foreground sm:h-12 sm:w-12 sm:rounded-2xl sm:text-lg">
                  {data.guild.name.slice(0, 2).toUpperCase()}
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex min-w-0 items-center gap-2.5">
                  <BotLogo
                    className="hidden h-10 w-10 shrink-0 ring-2 ring-primary/25 sm:block"
                    fallbackClassName="h-6 w-6"
                  />
                  <h1 className="min-w-0 truncate font-display text-lg font-bold tracking-tight sm:text-2xl">
                    {data.guild.name}
                  </h1>
                </div>
                <div className="mt-1.5 hidden flex-wrap items-center gap-1.5 sm:flex">{badges}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                <LangSwitch />
                {clientId && (
                  <a
                    href={buildBotInviteUrl(clientId)}
                    target="_blank"
                    rel="noreferrer"
                    title={translate("Mời thêm")}
                  >
                    <Badge variant="secondary" className="cursor-pointer px-2 py-1.5 sm:px-3">
                      <Bot className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{translate("Mời thêm")}</span>
                    </Badge>
                  </a>
                )}
              </div>
            </div>

            {/* Mobile: badge thành dải cuộn ngang, -mx-3/px-3 khớp đúng padding
                container ở mobile nên dải chạm mép màn hình mà KHÔNG vượt quá. */}
            <div className="-mx-3 mt-2.5 flex items-center gap-1.5 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:hidden">
              {badges}
            </div>
          </div>
        </header>

        <main
          id="main"
          tabIndex={-1}
          className="container w-full max-w-full py-4 max-sm:px-3 max-sm:pb-32 sm:py-8"
        >
          <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-[230px_1fr]">
            {/* Sidebar — min-w-0: nếu thiếu, nội dung panel rộng (bảng hình
                phạt 720px…) sẽ kéo cả track grid rộng hơn màn hình và bị
                overflow-x-clip cắt mất mép phải (không cuộn xem được). */}
            <aside className="h-fit min-w-0 max-lg:sticky max-lg:top-0 max-lg:z-20 lg:sticky lg:top-6">
              {/* Mobile: nav là app tab bar dính trên đầu (sticky) — đổi mục cấu
                hình không phải cuộn ngược lên tìm. Cuộn ngang 1 hàng, ẩn thanh
                cuộn; pr-3 để mục cuối không dính sát mép khi quét tay. */}
              <nav
                className="flex min-w-0 gap-1 overflow-x-auto rounded-xl border border-border bg-card/50 p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-lg:-mx-3 max-lg:rounded-none max-lg:border-x-0 max-lg:border-t-0 max-lg:bg-background/95 max-lg:px-3 max-lg:pr-4 max-lg:backdrop-blur lg:flex-col lg:overflow-visible lg:px-1.5"
                aria-label={translate("Điều hướng bảng điều khiển")}
              >
                {(() => {
                  const renderItem = (item: (typeof NAV_ITEMS)[number]) => {
                    const Icon = item.icon;
                    const active = section === item.key;
                    return (
                      <button
                        key={item.key}
                        onClick={() => goToSection(item.key)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                          // Touch target ≥ 44px trên mobile (max-sm:py-2.5).
                          "max-sm:gap-1.5 max-sm:px-2.5 max-sm:py-2",
                          active
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {translate(item.label)}
                      </button>
                    );
                  };
                  const overview = NAV_ITEMS.filter((i) => i.key === "overview");
                  const byKey = new Map(NAV_ITEMS.map((i) => [i.key, i]));
                  return (
                    <>
                      {overview.map(renderItem)}
                      {NAV_GROUPS.map((group) => (
                        <div
                          key={group.key}
                          // `contents`: ở mobile nhóm biến mất khỏi layout nên
                          // các nút vẫn xếp liền nhau trong hàng cuộn ngang;
                          // ở desktop trở lại thành khối dọc có tiêu đề.
                          className="contents lg:mt-4 lg:block"
                        >
                          <p className="hidden px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground lg:block">
                            {translate(group.label)}
                          </p>
                          <div className="contents lg:flex lg:flex-col lg:gap-0.5">
                            {group.items.map((key) => {
                              const item = byKey.get(key);
                              return item ? renderItem(item) : null;
                            })}
                          </div>
                        </div>
                      ))}
                    </>
                  );
                })()}
              </nav>
              <div className="mt-4 hidden rounded-xl border border-border bg-secondary/50 p-4 text-xs text-muted-foreground lg:block">
                <p className="mb-2 font-medium text-foreground">{translate("Haimiya gợi ý")}</p>
                <p>
                  {translate(
                    "• Auto-mod = spam tin, mention, từ xấu, ảnh/file, link mời + link độc hại.",
                  )}
                </p>
                <p className="mt-1">
                  {translate(
                    "• Moderation = thông báo sau khi bot phạt (ban · timeout · warn · kick) — chọn mức chi tiết riêng cho từng hành động.",
                  )}
                </p>
                <p className="mt-1">{translate("• Join Gate = chặn selfbot khi vào server.")}</p>
                <p className="mt-1">{translate("• Nuke/raid phạt trực tiếp, không cộng nhiệt.")}</p>
                <p className="mt-1">
                  {translate(
                    "• ⭐ Whitelist = chọn người dùng/role miễn trừ moderation, anti-raid và nuke.",
                  )}
                </p>
                <p className="mt-1">
                  {translate(
                    "• 💾 Backup server = chụp role + kênh lên đám mây riêng; khôi phục lại khi server bị nuke phá sập.",
                  )}
                </p>
                <p className="mt-1">
                  {translate(
                    "• 🛠️ Lệnh mod: /mod timeout · kick · ban · purge + !timeout !kick !ban !purge — mọi hình phạt hiện trong mục Hình phạt.",
                  )}{" "}
                </p>
                <p className="mt-1">
                  {translate(
                    "• 🔒 Tính năng ẩn — khu vực riêng tư, chỉ chủ sở hữu bot mở khóa bằng mật khẩu.",
                  )}{" "}
                </p>
                <p className="mt-1">
                  {translate("• Mỗi server có độ tương phản riêng trong Cài đặt.")}
                </p>
                <p className="mt-1">
                  {translate(
                    "• 🔗 Webhook & Log = bot tự tạo webhook tên/avatar/màu tùy chỉnh để nhận log.",
                  )}
                </p>
                <p className="mt-1">{translate("• Thay đổi áp dụng trong ~3 phút.")}</p>
              </div>
            </aside>

            {/* Content — bọc trong error boundary để một panel lỗi không làm trắng cả trang.
                Mỗi panel là lazy chunk: mở tab nào mới tải JS tab đó. Suspense nằm
                Ở ĐÂY (không để bubble lên App) để fallback chỉ thay vùng panel,
                header/sidebar giữ nguyên khi đang tải chunk. */}
            <div className="min-w-0">
              {/* Onboarding: chỉ ở tab Tổng quan — người mới vào thấy ngay cần làm gì. */}
              {section === "overview" && (
                <div className="mb-4">
                  <OnboardingChecklist
                    data={data}
                    onOpenSection={(key) => setSection(key as SectionKey)}
                  />
                </div>
              )}
              {sheetOpen ? (
                <MobilePanelSheet
                  title={translate(NAV_ITEMS.find((i) => i.key === section)?.label ?? "")}
                  onClose={closeSheet}
                >
                  {panelNode}
                </MobilePanelSheet>
              ) : (
                panelNode
              )}

              <div className="mt-10 flex justify-center">
                <a
                  href={`https://discord.com/channels/${data.guild.discordId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> {translate("Mở Discord server")}{" "}
                </a>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
