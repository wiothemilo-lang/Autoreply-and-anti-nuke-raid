import { lazy, Suspense, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "convex/react";
import {
  AppWindow,
  ArrowLeft,
  Bot,
  CloudUpload,
  DoorOpen,
  ExternalLink,
  Gavel,
  LayoutDashboard,
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

import LangSwitch from "../components/LangSwitch";

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
  { key: "hidden", label: "Tính năng ẩn 🔒", icon: Lock },
  { key: "settings", label: "Cài đặt", icon: Settings },
];

/** Loader nhỏ giữ bố cục khi chunk panel đang tải (lần đầu mở tab). */
function PanelFallback() {
  return <PanelSkeleton />;
}

export default function GuildPage() {
  const { guildId = "" } = useParams();
  const [section, setSection] = useState<SectionKey>("overview");
  const [hiddenUnlocked, setHiddenUnlocked] = useState(
    () => sessionStorage.getItem(hiddenUnlockKey()) === "1",
  );
  const token = getSessionToken();
  const data = useQuery(api.guilds.getGuild, { token, guildId }) as GuildData | null | undefined;
  const { clientId } = usePublicConfig();

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
    </>
  );

  // Chủ đề màu riêng của server — ghi đè CSS var trong phạm vi trang này.
  const theme = SERVER_THEMES[data.guild.theme] ?? SERVER_THEMES[DEFAULT_THEME];
  const themeVars = {
    "--primary": theme.primary,
    "--ring": theme.ring,
  } as React.CSSProperties;

  return (
    <div className="relative min-h-screen overflow-x-clip" style={themeVars}>
      <HaimiyaChat position="dashboard" />
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

        <main className="container w-full max-w-full py-4 max-sm:px-3 max-sm:pb-32 sm:py-8">
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
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = section === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => {
                        setSection(item.key);
                        // Mobile: cuộn lên đầu nội dung khi đổi panel — người dùng
                        // luôn thấy đầu panel mới thay vì đứng ở vị trí cuộn cũ.
                        if (window.innerWidth < 1024)
                          window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className={cn(
                        "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
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
                })}
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
              <PanelErrorBoundary key={`${section}:${data.guild.discordId}`}>
                <Suspense fallback={<PanelFallback />}>
                  {section === "overview" && <OverviewPanel data={data} />}
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
                </Suspense>
              </PanelErrorBoundary>

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
