import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { Bot, LogOut, Plus, RefreshCw, Server, ShieldAlert, Users } from "lucide-react";
import PageSplash from "../components/PageSplash";
import { LogoMark } from "../components/BotLogo";
import { api } from "../../convex/_generated/api";
import HaimiyaChat from "../components/HaimiyaChat";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card, CardContent } from "../components/ui/card";
import {
  SILENT_ATTEMPT_KEY,
  SILENT_STATE_KEY,
  SILENT_VERIFIER_KEY,
  buildBotInviteUrl,
  buildSilentAuthorizeUrl,
  clearLegacyDiscordAccess,
  clearSessionToken,
  discordAvatarUrl,
  discordGuildIconUrl,
  generateChallenge,
  generateVerifier,
  getSessionToken,
  randomState,
} from "../lib/discord";
import { usePublicConfig } from "../lib/usePublicConfig";
import type { MeData } from "../lib/types";
import { toast } from "sonner";

import LangSwitch from "../components/LangSwitch";

import { dateLocale, translate } from "../lib/i18n";
import { isHeartbeatFresh } from "../lib/utils";
export default function Dashboard() {
  const navigate = useNavigate();
  const token = getSessionToken();
  const me = useQuery(api.sessions.me, token ? ({ token } as { token: string }) : "skip") as
    MeData | null | undefined;
  const logout = useMutation(api.sessions.logout);
  const { clientId } = usePublicConfig();
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Làm mới im lặng qua authorization code mới (prompt=none). Convex trao đổi
   * code + PKCE verifier và tự cập nhật quyền server; browser không giữ access token.
   */
  async function startSilentRefresh(force: boolean) {
    if (!clientId || !token) return;
    const lastAttempt = Number(sessionStorage.getItem(SILENT_ATTEMPT_KEY) ?? 0);
    if (!force && Date.now() - lastAttempt < 10 * 60_000) return;
    sessionStorage.setItem(SILENT_ATTEMPT_KEY, String(Date.now()));
    const verifier = generateVerifier();
    const challenge = await generateChallenge(verifier);
    const silentState = randomState();
    sessionStorage.setItem(SILENT_VERIFIER_KEY, verifier);
    sessionStorage.setItem(SILENT_STATE_KEY, silentState);
    sessionStorage.setItem("wio_silent_return", window.location.pathname);
    window.location.assign(buildSilentAuthorizeUrl(clientId, silentState, challenge));
  }

  // Khi mở dashboard: tự làm mới một lần để server mới mời bot hiện ra ngay.
  useEffect(() => {
    void startSilentRefresh(false);
    // Lưu ý: chỉ chạy 1 lần khi mở dashboard — startSilentRefresh đọc state hiện tại.
  }, [clientId, token]);

  // Xử lý kết quả quay về sau luồng làm mới im lặng.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const silent = params.get("silent");
    if (silent) {
      if (silent === "ok") {
        toast.success(translate("Đã làm mới danh sách server"));
      } else {
        toast.error(
          translate("Không thể làm mới tự động — hãy thử nút Tải lại hoặc Đăng nhập lại."),
        );
      }
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  if (me === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <PageSplash minHeight="min-h-screen" />
      </div>
    );
  }
  if (!me) return null;

  async function handleLogout() {
    await logout({ token });
    clearSessionToken();
    clearLegacyDiscordAccess();
    navigate("/");
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await startSilentRefresh(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : translate("Không thể làm mới danh sách server"),
      );
    } finally {
      setRefreshing(false);
    }
  }

  const avatar = discordAvatarUrl({ id: me.user.discordId, avatar: me.user.avatar });
  const managed = me.guilds;
  const onlineCount = managed.filter(
    (g) => g.botInGuild && isHeartbeatFresh(g.lastHeartbeat),
  ).length;
  const totalMembers = managed.reduce((a, g) => a + (g.memberCount ?? 0), 0);

  return (
    <div className="relative min-h-screen">
      <HaimiyaChat position="dashboard" />
      <div className="relative z-10">
        <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
          <div className="container flex h-16 items-center justify-between">
            <button onClick={() => navigate("/")} className="flex items-center gap-2.5">
              <LogoMark className="h-9 w-9" />
              <span className="font-display text-lg font-bold">
                Protogon<span className="text-primary">.</span>
              </span>
            </button>
            <div className="flex items-center gap-3">
              <LangSwitch />
              {avatar ? (
                <img
                  src={avatar}
                  alt={me.user.username}
                  className="h-8 w-8 rounded-full ring-2 ring-primary/50"
                />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
                  {me.user.username.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="hidden text-sm text-muted-foreground sm:block">
                {me.user.globalName ?? me.user.username}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleLogout}
                title={translate("Đăng xuất")}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        <main className="container py-10">
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold tracking-tight">
              {translate("Bảng điều khiển")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {translate(
                "Chọn server để cấu hình auto reply, nhiệt độ, Join Gate, chống nuke và các module bảo vệ.",
              )}{" "}
            </p>
          </div>

          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            <Card className="card-hover">
              <CardContent className="flex items-center gap-4 p-4 sm:p-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Server className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-2xl font-bold font-display">{managed.length}</p>
                  <p className="text-xs text-muted-foreground">{translate("Server quản lý")}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="card-hover">
              <CardContent className="flex items-center gap-4 p-4 sm:p-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-foreground">
                  <Bot className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-2xl font-bold font-display">
                    {onlineCount}/{managed.length}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {translate("Bot đang trực tuyến")}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="card-hover">
              <CardContent className="flex items-center gap-4 p-4 sm:p-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-foreground">
                  <Users className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-2xl font-bold font-display">
                    {totalMembers.toLocaleString(dateLocale())}
                  </p>
                  <p className="text-xs text-muted-foreground">{translate("Tổng thành viên")}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {managed.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Plus className="h-7 w-7" />
                </span>
                <div>
                  <h2 className="font-display text-xl font-semibold">
                    {translate("Chưa có server nào")}
                  </h2>
                  <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                    {translate("Mời Protogon vào server của bạn rồi quay lại đây. Cần quyền")}{" "}
                    <b className="text-foreground">{translate("Quản lý server")}</b>{" "}
                    {translate("để chỉnh cấu hình.")}{" "}
                  </p>
                </div>
                {clientId && (
                  <Button asChild size="lg">
                    <a href={buildBotInviteUrl(clientId)} target="_blank" rel="noreferrer">
                      {translate("Mời bot vào server")}
                    </a>
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold">
                  {translate("Server của bạn")}
                </h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={refreshing}
                    title={translate("Tải lại danh sách server (server mới mời bot sẽ hiện ra)")}
                  >
                    <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                    {translate("Tải lại")}{" "}
                  </Button>
                  {clientId && (
                    <Button asChild variant="secondary" size="sm">
                      <a href={buildBotInviteUrl(clientId)} target="_blank" rel="noreferrer">
                        <Plus className="h-4 w-4" /> {translate("Thêm server")}{" "}
                      </a>
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {managed.map((guild) => {
                  const icon = discordGuildIconUrl({ id: guild.discordId, icon: guild.icon });
                  const online = guild.botInGuild && isHeartbeatFresh(guild.lastHeartbeat);
                  return (
                    <Card key={guild.discordId} className="card-hover overflow-hidden">
                      <div className="h-1 w-full bg-foreground/80" />
                      <CardContent className="p-4 sm:p-5">
                        <div className="flex items-start gap-3">
                          {icon ? (
                            <img src={icon} alt="" className="h-12 w-12 rounded-xl" />
                          ) : (
                            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary font-display text-lg font-bold text-muted-foreground">
                              {guild.name.slice(0, 2).toUpperCase()}
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-display font-semibold">{guild.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {guild.memberCount?.toLocaleString(dateLocale()) ?? "?"}{" "}
                              {translate("thành viên · prefix")}{" "}
                              <code className="font-mono text-primary">{guild.prefix}</code>
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          {guild.botInGuild ? (
                            <Badge variant={online ? "success" : "secondary"}>
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${online ? "bg-foreground" : "bg-muted-foreground"}`}
                              />
                              Bot {online ? "online" : "offline"}
                            </Badge>
                          ) : (
                            <Badge variant="danger">{translate("Chưa thêm bot")}</Badge>
                          )}
                          <Badge variant={guild.antinukeEnabled ? "default" : "secondary"}>
                            <ShieldAlert className="h-3 w-3" />
                            {translate(guild.antinukeEnabled ? "Chống nuke bật" : "Chống nuke tắt")}
                          </Badge>
                        </div>
                        <div className="mt-4">
                          <Button
                            className="w-full"
                            variant={guild.botInGuild ? "default" : "secondary"}
                            onClick={() => {
                              if (!guild.botInGuild && clientId) {
                                toast(translate("Mời bot vào server trước khi quản lý"), {
                                  description: translate("Bạn sẽ được chuyển tới trang mời bot."),
                                });
                                window.open(buildBotInviteUrl(clientId), "_blank");
                                return;
                              }
                              navigate(`/dashboard/${guild.discordId}`);
                            }}
                          >
                            {translate(guild.botInGuild ? "Quản lý" : "Mời bot")}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
