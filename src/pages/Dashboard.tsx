import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { useProductMotion } from "../lib/motion";
import CountUp from "../components/CountUp";
import {
  Bot,
  LogOut,
  Plus,
  RefreshCw,
  Server,
  ShieldAlert,
  Users,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import PageSplash from "../components/PageSplash";
import { LogoMark } from "../components/BotLogo";
import UserTags from "../components/UserTags";
import { api } from "../../convex/_generated/api";
import HaimiyaChat from "../components/HaimiyaChat";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card, CardContent } from "../components/ui/card";
import {
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
import { isGuildHeartbeatFresh } from "../lib/utils";
export default function Dashboard() {
  const navigate = useNavigate();
  const motionSet = useProductMotion();
  const token = getSessionToken();
  const me = useQuery(api.sessions.me, token ? ({ token } as { token: string }) : "skip") as
    MeData | null | undefined;
  const logout = useMutation(api.sessions.logout);
  // Nhãn cạnh logo người dùng: Owner / Admin / gói premium (xem UserTags).
  // Cả ba đều đọc index đơn ở server và Convex dedupe theo client — người chưa
  // đăng nhập / không có vai trò nào thì trả false/null và không hiện gì.
  const isOwner = useQuery(api.status.isOwner, token ? { token } : "skip");
  const isAdmin = useQuery(api.status.isAdmin, token ? { token } : "skip");
  const premium = useQuery(api.payments.premiumStatus, token ? { token } : "skip");
  const { clientId } = usePublicConfig();
  const [refreshing, setRefreshing] = useState(false);
  /**
   * Chọn nhiều server để bật/tắt chống nuke một lượt (xem
   * `guilds.setAntinukeGlobalBatch`). Người quản trị nhiều server bật cố ý để
   * tránh cấu hình lệch nhau giữa các server.
   */
  const [selected, setSelected] = useState<string[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const setAntinukeBatch = useMutation(api.guilds.setAntinukeGlobalBatch);

  function toggleSelect(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function applyBatch(enabled: boolean) {
    if (selected.length === 0) return;
    setBatchBusy(true);
    try {
      const res = await setAntinukeBatch({ token, guildIds: selected, enabled });
      const done = res?.done ?? 0;
      const skipped = res?.skipped ?? 0;
      toast.success(
        enabled
          ? translate("Đã bật chống nuke cho {p0} server", { p0: done })
          : translate("Đã tắt chống nuke ở {p0} server", { p0: done }),
      );
      // Nói rõ phần bị bỏ qua: im lặng làm người dùng tưởng đã xong hết.
      if (skipped > 0) {
        toast.error(
          translate("{p0} server bị bỏ qua — bạn không có quyền quản lý", { p0: skipped }),
        );
      }
      setSelected([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Thất bại"));
    } finally {
      setBatchBusy(false);
    }
  }

  /**
   * Làm mới danh sách server qua prompt=none — CHỈ khi người dùng bấm "Tải lại".
   *
   * ── Vì sao KHÔNG được tự chạy khi mở trang (bug thật, người dùng báo 2 lần) ──
   * Bản cũ tự chuyển trang sang Discord mỗi khi effect mount chạy lại, và effect
   * có deps `me` — mà `me` là giá trị reactive của Convex, ĐỔI OBJECT MỖI LẦN
   * server cập nhật (trạng thái bot được heartbeat ghi mỗi ~60 giây). Nghĩa là
   * cứ ~1 phút effect chạy lại; khoá chống lặp chỉ là bộ đếm 10 phút nên hết
   * 10 phút là cả trang bị nhảy sang Discord một lần nữa — lặp vô hạn trong một
   * tab đang mở. Đó là cảm giác "cứ duplicate nhảy đăng nhập": mỗi lần nhảy là
   * một lần tải lại trang thật, mất vị trí đang làm, rồi quay về kèm toast lỗi
   * (đọc như đòi đăng nhập lại).
   *
   * Bỏ hẳn đường TỰ ĐỘNG: không có khoá nào chống lặp đủ tốt cho một điều hướng
   * phá huỷ ngữ cảnh trang, và tính năng không mất gì — `me` vẫn reactive (server
   * mới mời bot tự hiện ra), còn quyền Discord thì làm mới bằng nút "Tải lại"
   * (người dùng chủ động, thấy ngay toast kết quả).
   */
  async function refreshServerList() {
    if (!clientId || !token) return;
    const verifier = generateVerifier();
    const challenge = await generateChallenge(verifier);
    const silentState = randomState();
    sessionStorage.setItem(SILENT_VERIFIER_KEY, verifier);
    sessionStorage.setItem(SILENT_STATE_KEY, silentState);
    sessionStorage.setItem("wio_silent_return", window.location.pathname);
    window.location.assign(buildSilentAuthorizeUrl(clientId, silentState, challenge));
  }

  // Xử lý kết quả quay về sau lượt làm mới do người dùng bấm "Tải lại".
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const silent = params.get("silent");
    if (silent) {
      if (silent === "ok") {
        toast.success(translate("Đã làm mới danh sách server"));
      } else {
        toast.error(
          translate(
            "Không làm mới được danh sách server (Discord từ chối làm mới im lặng). Bạn vẫn dùng bình thường — chỉ bấm “Tải lại” khi cần.",
          ),
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
      await refreshServerList();
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
    // Heartbeat của TỪNG guild được bot refresh mỗi 5 nhịp sync (~15 phút) —
    // dùng ngưỡng toàn cục 6 phút ở đây là báo "offline" gần như mọi lúc.
    (g) => g.botInGuild && isGuildHeartbeatFresh(g.lastHeartbeat),
  ).length;
  const totalMembers = managed.reduce((a, g) => a + (g.memberCount ?? 0), 0);

  return (
    <div className="relative min-h-screen">
      <HaimiyaChat position="dashboard" />
      <div className="relative z-10">
        {/* top-12 = h-12 của SiteNav: header này dính NGAY DƯỚI thanh điều hướng
            chung, không chồng lên nó (cả hai đều sticky top-0 thì cái sau che cái trước). */}
        <header className="sticky top-12 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
          <div className="container flex h-16 items-center justify-between">
            <button onClick={() => navigate("/")} className="flex items-center gap-2.5">
              <LogoMark className="h-9 w-9" />
              <span className="font-display text-lg font-bold">
                Protogon<span className="text-primary">.</span>
              </span>
            </button>
            <div className="flex items-center gap-3">
              {/* Ẩn dưới sm giống Nav landing: giữ đủ chỗ cho avatar — khi container
                  chật, flex bóp img thành elip (bug 08/10). Vẫn đổi ngôn ngữ được
                  trong PagesPanel của SiteNav (nút lưới trên header chung). */}
              <div className="hidden sm:block">
                <LangSwitch />
              </div>
              {avatar ? (
                <img
                  src={avatar}
                  alt={me.user.username}
                  // shrink-0: không cho flex bóp avatar khi hàng chật.
                  className="h-8 w-8 shrink-0 rounded-full ring-2 ring-primary/50"
                />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
                  {me.user.username.slice(0, 1).toUpperCase()}
                </span>
              )}
              {/* Tag NGAY BÊN CẠNH logo: chủ bot → Owner, thành viên team → Admin,
                  có gói trả phí → nhãn gói. Ẩn dưới sm để hàng header không chật. */}
              <UserTags
                isOwner={isOwner === true}
                isAdmin={isAdmin === true}
                plan={premium?.active ? premium.plan : null}
                className="hidden sm:flex"
              />
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

        <main id="main" tabIndex={-1} className="container py-10">
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

          <motion.div
            className="mb-8 grid gap-4 sm:grid-cols-3"
            variants={motionSet.list}
            initial="hidden"
            animate="show"
          >
            <motion.div variants={motionSet.item}>
              <Card className="card-hover h-full">
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
            </motion.div>
            <motion.div variants={motionSet.item}>
              <Card className="card-hover h-full">
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
            </motion.div>
            <motion.div variants={motionSet.item}>
              <Card className="card-hover h-full">
                <CardContent className="flex items-center gap-4 p-4 sm:p-5">
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-foreground">
                    <Users className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-2xl font-bold font-display">
                      <CountUp
                        value={totalMembers}
                        format={(n) => n.toLocaleString(dateLocale())}
                      />
                    </p>
                    <p className="text-xs text-muted-foreground">{translate("Tổng thành viên")}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>

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
                  {selected.length > 0 && (
                    <>
                      <Badge variant="outline" className="shrink-0">
                        {selected.length} {translate("server đã chọn")}
                      </Badge>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={batchBusy}
                        onClick={() => void applyBatch(true)}
                      >
                        {batchBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ShieldCheck className="h-4 w-4" />
                        )}
                        {translate("Bật chống nuke")}{" "}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={batchBusy}
                        onClick={() => void applyBatch(false)}
                      >
                        {translate("Tắt")}
                      </Button>
                    </>
                  )}
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
              <motion.div
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                variants={motionSet.list}
                initial="hidden"
                animate="show"
              >
                {managed.map((guild) => {
                  const icon = discordGuildIconUrl({ id: guild.discordId, icon: guild.icon });
                  const online = guild.botInGuild && isGuildHeartbeatFresh(guild.lastHeartbeat);
                  return (
                    <motion.div
                      key={guild.discordId}
                      variants={motionSet.item}
                      // h-full: trong grid, ô cao bằng ô cao nhất — không có nó
                      // thì phần tử motion co lại và card méo.
                      className="h-full"
                    >
                      <Card className="card-hover h-full overflow-hidden">
                        <div className="h-1 w-full bg-foreground/80" />
                        <CardContent className="p-4 sm:p-5">
                          <div className="flex items-start gap-3">
                            <label
                              className="mt-1 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center"
                              title={translate("Chọn server để bật/tắt chống nuke hàng loạt")}
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-current"
                                checked={selected.includes(guild.discordId)}
                                onChange={() => toggleSelect(guild.discordId)}
                                aria-label={translate("Chọn server {p0}", { p0: guild.name })}
                              />
                            </label>
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
                              {translate(
                                guild.antinukeEnabled ? "Chống nuke bật" : "Chống nuke tắt",
                              )}
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
                    </motion.div>
                  );
                })}
              </motion.div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
