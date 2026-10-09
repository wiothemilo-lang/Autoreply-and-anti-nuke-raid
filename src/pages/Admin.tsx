import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import PageReveal from "../components/PageReveal";
import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Banknote,
  BrainCircuit,
  Bug,
  Gauge,
  GraduationCap,
  ListChecks,
  Loader2,
  Play,
  Receipt,
  Server,
  ShieldCheck,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import RequireAuth from "../components/RequireAuth";
import UpdateWindow from "../components/UpdateWindow";
import { discordAvatarUrl, getSessionToken } from "../lib/discord";
import { latencyLabel, useBotMonitor } from "../lib/useBotMonitor";
import { cn } from "../lib/utils";

import LangSwitch from "../components/LangSwitch";
import PageSplash from "../components/PageSplash";

import { dateLocale, translate } from "../lib/i18n";
function AdminContent() {
  const token = getSessionToken();
  // Hai vai trò KHÁC nhau, cố ý tách: `isAdmin` = vào được cửa sổ này (chủ bot
  // hoặc quản trị viên nhóm do chủ bot thêm); `isOwner` = còn được đụng những
  // thứ chỉ chủ bot (mật khẩu ẩn, tính năng ẩn, seed chìa khoá bot).
  const isOwner = useQuery(api.status.isOwner, token ? { token } : "skip");
  const isAdmin = useQuery(api.status.isAdmin, token ? { token } : "skip");
  // Danh sách quản trị viên nhóm chỉ chủ bot đọc được (query tự guard).
  const teamAdmins = useQuery(api.hidden.getTeamAdmins, isOwner ? { token } : "skip");
  const saveTeamAdmins = useMutation(api.hidden.setTeamAdmins);

  // Plan A — chuyển khoản thủ công: danh sách đơn chờ xác nhận + tổng doanh
  // thu theo tháng/năm. Cả hai query đều SKIP khi chưa phải chủ sở hữu.
  const reportedOrders = useQuery(api.payments.listReportedOrders, isOwner ? { token } : "skip");
  const revenue = useQuery(api.payments.revenueStats, isOwner ? { token } : "skip");
  const confirmTransfer = useMutation(api.payments.confirmTransfer);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [transferMsg, setTransferMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const { status, latency, avg, incidents, lastUpdate, nextUpdate, refresh } = useBotMonitor(60000);
  const threat = useQuery(api.threatIntel.getSettings, { token });
  const researchHistory = useQuery(api.threatIntel.getResearchHistory, { token });
  const setThreat = useMutation(api.threatIntel.setResearchSettings);
  const diag = useQuery(api.selfDiagnose.getSettings, { token });
  const setDiag = useMutation(api.selfDiagnose.setEnabled);
  const removeThreatKw = useMutation(api.threatIntel.removeKeyword);
  const requestLearn = useMutation(api.threatIntel.requestManualLearn);
  const setSecrets = useMutation(api.hidden.setBotSecrets);
  const [ownerSeedInput, setOwnerSeedInput] = useState("");
  const [secretMsg, setSecretMsg] = useState<string | null>(null);

  if (isAdmin === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <PageSplash minHeight="min-h-screen" />
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <Bug className="h-10 w-10 text-muted-foreground" />
        <p className="font-display text-lg font-semibold">{translate("Không có quyền truy cập")}</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {translate(
            "Cửa sổ Admin là khu vực riêng tư của chủ sở hữu bot và quản trị viên nhóm — người dùng khác không nhìn thấy và không vào được.",
          )}{" "}
        </p>
        <Link to="/" className="text-sm text-primary hover:underline">
          {translate("← Về trang chủ")}{" "}
        </Link>
      </div>
    );
  }

  const lat = latency ?? avg;
  const rate = lat !== null ? latencyLabel(lat) : null;

  return (
    <div className="relative min-h-screen">
      <div className="relative z-10">
        <header className="border-b border-border/60 bg-background/70 backdrop-blur">
          <div className="container flex items-center gap-3 py-5">
            <Link
              to="/"
              aria-label={translate("← Về trang chủ")}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger/15 text-danger">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <h1 className="font-display text-xl font-bold">{translate("Cửa sổ Admin")}</h1>
                <p className="text-xs text-muted-foreground">
                  {translate(
                    "Chủ sở hữu bot & quản trị viên nhóm · theo dõi lỗi & dữ liệu bot",
                  )}{" "}
                </p>
              </div>
            </div>
            <LangSwitch className="ml-auto" />
          </div>
        </header>

        <PageReveal id="main" className="container space-y-4 py-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-danger/25 bg-danger/5 p-4">
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5 text-danger" />{" "}
                {translate("Sự cố / lỗi")}{" "}
              </p>
              <p className="mt-1.5 font-display text-lg font-bold">
                {incidents.length}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  {translate("trong phiên này")}{" "}
                </span>
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                <Gauge className="h-3.5 w-3.5" /> {translate("Độ trễ hiện tại")}{" "}
              </p>
              <p className="mt-1.5 font-mono text-lg font-bold">
                {lat !== null ? `${lat} ms` : "—"}
              </p>
              {rate && (
                <span className={cn("text-xs font-semibold", rate.cls)}>
                  {translate(rate.label)}
                </span>
              )}
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                <Server className="h-3.5 w-3.5" /> {translate("Bot đang phục vụ")}{" "}
              </p>
              <p className="mt-1.5 font-display text-lg font-bold">
                {status
                  ? translate("{p0} server · {p1} thành viên", {
                      p0: status.guildCount,
                      p1: status.memberCount.toLocaleString(dateLocale()),
                    })
                  : translate("đang tải…")}
              </p>
              <p
                className={cn(
                  "mt-1 text-xs font-semibold",
                  status?.online ? "text-foreground" : "text-danger",
                )}
              >
                {status ? (status.online ? "● Bot online" : "● Bot offline") : ""}
              </p>
            </div>
          </div>

          {/* min-w-0 trên con grid: nếu thiếu, nội dung rộng (log dài, ID mono)
              kéo cả track rộng hơn màn hình → #root overflow-x:clip cắt mất
              mép phải mà người dùng không cuộn xem được. */}
          <div className="grid min-w-0 gap-4 lg:grid-cols-[1fr_20rem]">
            <div className="min-w-0 rounded-xl border border-border bg-card p-4">
              <h2 className="flex items-center gap-2 font-display text-base font-bold">
                <Activity className="h-4 w-4 text-primary" />
                {translate("Nhật ký sự cố chi tiết")}{" "}
              </h2>
              {incidents.length === 0 ? (
                <p className="mt-2 text-sm text-foreground">
                  {translate("Không phát hiện lỗi nào — bot hoạt động bình thường ✅")}{" "}
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {incidents.map((inc, i) => (
                    <li
                      key={`${inc.time}-${i}`}
                      className="flex items-start gap-2 rounded-lg bg-danger/5 px-3 py-2 text-sm text-danger"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
                      <span>
                        {inc.text}{" "}
                        <span className="text-muted-foreground">
                          ·{" "}
                          {new Date(inc.time).toLocaleTimeString(dateLocale(), {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                {translate(
                  "Lưu ý: bản ghi sự cố được ghi nhận trong phiên xem này (mất kết nối máy chủ, độ trễ quá cao). Để theo dõi xuyên suốt, hãy giữ trang này mở hoặc kiểm tra kênh log trong Discord.",
                )}{" "}
              </p>
            </div>

            <div className="space-y-4">
              <UpdateWindow
                lastUpdate={lastUpdate}
                nextUpdate={nextUpdate}
                onRefresh={refresh}
                showRefresh
              />
              <SelfDiagnoseCard
                diag={diag}
                onToggle={(enabled) => setDiag({ token, enabled }).catch(() => {})}
              />
              <HostHealthCard />
              <JobBacklogCard />
              <AiHealthCard />
              <MetricsCard />
              <ThreatIntelCard
                threat={threat}
                history={researchHistory}
                onToggle={(enabled) => setThreat({ token, enabled }).catch(() => {})}
                onToggleAi={(aiWeeklyEnabled) =>
                  setThreat({ token, aiWeeklyEnabled }).catch(() => {})
                }
                onToggleNotify={(notifyEnabled) =>
                  setThreat({ token, notifyEnabled }).catch(() => {})
                }
                onRemove={(keyword, kind) =>
                  removeThreatKw({ token, keyword, kind }).catch(() => {})
                }
                onLearnNow={async () => {
                  try {
                    const res = await requestLearn({ token, requestedBy: "web-admin" });
                    return res;
                  } catch (e) {
                    return {
                      ok: false,
                      error: e instanceof Error ? e.message : translate("Lỗi kết nối"),
                    };
                  }
                }}
              />
              <TeamAdminsCard
                isOwner={isOwner === true}
                data={teamAdmins}
                onSave={async (discordIds) => {
                  try {
                    await saveTeamAdmins({ token, discordIds });
                    return { ok: true };
                  } catch (e) {
                    return {
                      ok: false,
                      error: e instanceof Error ? e.message : translate("Lỗi kết nối"),
                    };
                  }
                }}
              />
              {isOwner === true && (
                <>
                  <TransferOrdersCard
                    orders={reportedOrders}
                    confirming={confirming}
                    msg={transferMsg}
                    onConfirm={async (appTransId) => {
                      setTransferMsg(null);
                      setConfirming(appTransId);
                      try {
                        await confirmTransfer({ token, appTransId });
                        setTransferMsg({
                          kind: "ok",
                          text: translate("Đã nhận tiền và kích hoạt gói."),
                        });
                      } catch (e) {
                        setTransferMsg({
                          kind: "err",
                          text: e instanceof Error ? e.message : translate("Lỗi kết nối"),
                        });
                      }
                      setConfirming(null);
                    }}
                  />
                  <RevenueCard revenue={revenue} />
                </>
              )}
              {isOwner === true && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="flex items-center gap-1.5 font-display text-sm font-bold">
                    <ShieldCheck className="h-4 w-4" /> {translate("Chìa khóa bảo mật API")}{" "}
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {translate(
                      "Khi đã đặt seed, MỌI lệnh của bot yêu cầu chìa khóa khớp — kẻ ngoài không thể giả mạo heartbeat/backup/lockdown. Trên VPS dán giá trị seed VỪA NHẬP vào biến",
                    )}{" "}
                    <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[11px]">BOT_KEY</code>{" "}
                    {translate("trong bot/.env rồi")}{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                      pm2 restart protogon-bot
                    </code>
                    {translate(". Bot chưa có BOT_KEY sẽ")}{" "}
                    <b>{translate("tự cấp phát chìa khóa an toàn")}</b>{" "}
                    {translate(
                      "khi khởi động (xác minh token Discord thật) — không cần thao tác gì thêm.",
                    )}{" "}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <input
                      type="password"
                      value={ownerSeedInput}
                      onChange={(e) => setOwnerSeedInput(e.target.value)}
                      placeholder={translate("Seed bí mật (dòng bất kỳ, ví dụ: chuỗi ngẫu nhiên)")}
                      className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <button
                      type="button"
                      disabled={ownerSeedInput.trim().length < 8}
                      onClick={async () => {
                        setSecretMsg(null);
                        try {
                          // Server tự băm seed và lưu bản băm — client không tính gì cả,
                          // và chính seed vừa nhập chính là giá trị BOT_KEY cần dán ở VPS.
                          await setSecrets({
                            token,
                            guildId: "__admin__",
                            ownerSeed: ownerSeedInput.trim(),
                          });
                          setSecretMsg(
                            translate(
                              "Đã bật bảo vệ ✅ — dán giá trị seed VỪA NHẬP vào BOT_KEY trên VPS (không hiện lại ở đây).",
                            ),
                          );
                          setOwnerSeedInput("");
                        } catch {
                          setSecretMsg(translate("Lỗi khi đặt seed — thử lại."));
                        }
                      }}
                      className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                      {translate("Bật bảo vệ")}{" "}
                    </button>
                  </div>
                  {secretMsg && (
                    <pre className="mt-2 whitespace-pre-wrap break-all rounded-lg bg-muted/60 p-2 text-[11px] text-foreground">
                      {secretMsg}
                    </pre>
                  )}
                </div>
              )}
              <div className="rounded-xl border border-border bg-secondary/30 p-4 text-xs leading-relaxed text-muted-foreground">
                <p className="mb-1 font-semibold text-foreground">
                  {translate("🔒 Quyền riêng tư")}
                </p>
                <p>
                  {translate("Cửa sổ Admin chỉ hiển thị với")}{" "}
                  <b className="text-foreground">{translate("chủ sở hữu bot")}</b>{" "}
                  {translate("và những người trong")}{" "}
                  <b className="text-foreground">{translate("danh sách quản trị viên nhóm")}</b>{" "}
                  {translate(
                    "(do chủ bot đặt). Người dùng khác không thấy nút này và không truy cập được trang này.",
                  )}{" "}
                </p>
              </div>
            </div>
          </div>
        </PageReveal>
      </div>
    </div>
  );
}

export default function Admin() {
  return (
    <RequireAuth>
      <AdminContent />
    </RequireAuth>
  );
}

/**
 * Self-Diagnose — bot tự chẩn đoán lỗi runtime qua AI (Kira/Mimo V2.5) và đăng
 * ĐỀ XUẤT vá (không tự áp, không tự restart) vào kênh log Discord. Bật/tắt tại đây.
 */
/**
 * AI Health — sức khỏe hệ AI của bot (đợt 12): provider, verdict 1 giờ, phạt
 * nhầm 7 ngày. Dữ liệu bot đẩy lên Convex mỗi 60s (đi nhờ vòng sync sẵn có).
 * Query status:getAiHealth tự guard owner — trả null cho người dùng thường,
 * nên card chỉ hiện khi đúng chủ bot mở cửa sổ Admin.
 */
/**
 * Sức khoẻ MÁY CHỦ — % đĩa, dung lượng trống, RAM, uptime (chỉ chủ bot xem
 * được: status:getHostHealth tự guard owner). Đây là số liệu bắt được sự cố
 * 25/09 (đĩa đầu → emergency_ro) TRƯỚC khi nó xảy ra.
 */
function HostHealthCard() {
  const token = getSessionToken();
  const health = useQuery(api.status.getHostHealth, token ? { token } : "skip");

  if (health === undefined || health === null) return null;

  const level = health.stale ? "unknown" : health.level;
  const cls =
    level === "critical"
      ? "bg-danger/15 text-danger"
      : level === "warn"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        : level === "ok"
          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          : "bg-muted text-muted-foreground";
  const diskCls =
    level === "critical"
      ? "text-danger"
      : level === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : undefined;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Server className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-display text-sm font-bold">{translate("Sức khoẻ máy chủ")}</h3>
            <p className="text-[11px] text-muted-foreground">
              {translate("Bot đo mỗi 5 phút · chỉ chủ bot nhìn thấy")}{" "}
            </p>
          </div>
        </div>
        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", cls)}>
          {level === "unknown"
            ? translate("chưa có dữ liệu")
            : level === "critical"
              ? translate("Nghiêm trọng")
              : level === "warn"
                ? translate("Cần chú ý")
                : translate("Bình thường")}
        </span>
      </div>

      {health.stale ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          {translate(
            "Bot đang offline hoặc mất kết nối Convex — số liệu máy chủ tạm dừng cập nhật.",
          )}{" "}
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-lg bg-secondary/40 px-2.5 py-1.5">
            <span className="text-muted-foreground">{translate("Đĩa đã dùng:")}</span>{" "}
            <b className={cn("tabular-nums", diskCls)}>
              {typeof health.diskUsedPct === "number" ? `${health.diskUsedPct}%` : "—"}
            </b>
          </div>
          <div className="rounded-lg bg-secondary/40 px-2.5 py-1.5">
            <span className="text-muted-foreground">{translate("Còn trống:")}</span>{" "}
            <b className="tabular-nums">
              {typeof health.diskFreeGb === "number" ? `${health.diskFreeGb} GB` : "—"}
            </b>
          </div>
          <div className="rounded-lg bg-secondary/40 px-2.5 py-1.5">
            <span className="text-muted-foreground">{translate("RAM bot:")}</span>{" "}
            <b className="tabular-nums">{health.rssMb} MB</b>
          </div>
          <div className="rounded-lg bg-secondary/40 px-2.5 py-1.5">
            <span className="text-muted-foreground">{translate("Đã chạy:")}</span>{" "}
            <b className="tabular-nums">{health.uptimeHours} h</b>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * HÀNG ĐỢI VIỆC — bao nhiêu việc bot chưa xử lý, và việc nào BỊ KẸT quá lâu
 * (chỉ chủ bot xem được: `status:getJobBacklog` tự guard owner).
 *
 * Vì sao cần (đợt #4): từ khi việc quét chuyển sang Convex cron, phần lớn việc
 * đi theo mẫu "cron đặt cờ → bot xử lý ở tick". Hỏng âm thầm đúng kiểu này: bot
 * offline hoặc cấu hình sai ⇒ cờ nằm im, không tiếng kêu, không log. Thẻ này biến
 * "đang chờ" thành "3 server kẹt việc, lâu nhất 47 phút".
 *
 * Ngưỡng 15 phút = 5 nhịp tick (tick mỗi 3 phút) — quá ngưỡng thì coi là kẹt
 * chứ không phải nhiễu. Cũng là lý do không hiện danh sách dài: 20 dòng là đủ
 * để biết cần đi sửa cái gì.
 */
function JobBacklogCard() {
  const token = getSessionToken();
  const backlog = useQuery(api.status.getJobBacklog, token ? { token } : "skip");

  if (backlog === undefined || backlog === null) return null;

  const kinds: { key: keyof typeof backlog.totals; label: string }[] = [
    { key: "backup", label: "Backup" },
    { key: "report", label: "Báo cáo" },
    { key: "verifyPanel", label: "Panel xác minh" },
    { key: "ticketPanel", label: "Panel ticket" },
    { key: "dm", label: "DM" },
  ];
  const stuckCount = backlog.stuck.length;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <ListChecks className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-display text-sm font-bold">{translate("Hàng đợi việc")}</h3>
            <p className="text-[11px] text-muted-foreground">
              {translate("Việc bot được giao · chỉ chủ bot nhìn thấy")}{" "}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-bold",
            stuckCount > 0
              ? "bg-danger/15 text-danger"
              : backlog.total > 0
                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
          )}
        >
          {stuckCount > 0
            ? `${stuckCount} ${translate("server kẹt")}`
            : backlog.total > 0
              ? translate("Đang chờ")
              : translate("Sạch")}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] sm:grid-cols-5">
        {kinds.map((k) => (
          <div key={k.key} className="rounded-lg bg-secondary/40 px-2.5 py-1.5">
            <span className="block text-muted-foreground">{translate(k.label)}</span>
            <b className="tabular-nums">{backlog.totals[k.key]}</b>
          </div>
        ))}
      </div>

      {stuckCount > 0 ? (
        <>
          <p className="mt-3 text-[11px] font-semibold text-foreground">
            {translate("Server đang kẹt việc (lâu nhất trước)")}{" "}
          </p>
          <ul className="mt-1.5 space-y-1 text-[11px]">
            {backlog.stuck.map((s) => (
              <li
                key={s.guildId}
                className="flex items-center justify-between gap-2 rounded-lg bg-secondary/40 px-2.5 py-1.5"
              >
                <span className="min-w-0 truncate">{s.name}</span>
                <span className="shrink-0 tabular-nums text-danger">
                  {s.jobs} {translate("việc")} · {s.ageMin} {translate("phút")}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-3 text-[11px] text-muted-foreground">
          {translate("Không có việc nào bị kẹt.")}{" "}
        </p>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        {translate(
          "Chỉ tính việc chờ quá 15 phút — tick bot chạy mỗi 3 phút, quá ngưỡng là đứt mắt xích.",
        )}{" "}
      </p>
    </div>
  );
}

/**
 * ĐỒNG HỒ HỆ THỐNG — bảng số đo bot tự đo (bot/src/metrics.js đẩy lên mỗi
 * 5 phút qua `botRecordMetrics`).
 *
 * Không lặp lại `HostHealthCard` (đã hiện RAM/uptime): card này trả lời câu
 * hỏi khác — THAO TÁC NÀO CHẬM, THAO TÁC NÀO ĐANG LỖI, AI TỐN BAO NHIÊU.
 * Trước đợt này bot không đo gì nên ba câu hỏi đó không có cách nào trả lời
 * ngoài việc đọc log thủ công.
 *
 * Cố ý rút gọn: lấy độ trễ TRUNG BÌNH (sum/count) thay vì phân vị. p95 chính
 * xác là thứ quyết định "cảm giác chậm" của người dùng, nhưng sum/count đã đủ
 * để phát hiện module nào CHẬM DẦN — còn p95 sẽ cần giữ toàn bộ bucket, tức
 * vài chục lần khoá hơn mà bảng `botMetrics` hiện cố tình gộp phẳng. Nếu sau
 * này cần p95 thì nâng schema, đừng ước lượng từ trung bình.
 */
function MetricsCard() {
  const token = getSessionToken();
  const metrics = useQuery(api.status.getMetrics, token ? { token } : "skip");

  if (metrics === undefined) return null;

  const counters = metrics?.counters ?? {};
  const gauges = metrics?.gauges ?? {};
  const histograms = metrics?.histograms ?? {};

  // Khoá histogram có dạng …_count{subsystem="…",op="…"} và …_sum{cùng nhãn}.
  // Gộp lại theo nhãn để tính độ trễ trung bình mỗi thao tác.
  const ops = new Map<string, { count: number; sum: number }>();
  for (const [key, value] of Object.entries(histograms)) {
    const isCount = key.includes("_count{");
    const label = key.replace(/_count\{/, "{").replace(/_sum\{/, "{");
    const entry = ops.get(label) ?? { count: 0, sum: 0 };
    if (isCount) entry.count = value;
    else entry.sum = value;
    ops.set(label, entry);
  }

  const slowest = [...ops.entries()]
    .filter(([, v]) => v.count > 0)
    .map(([label, v]) => {
      // Tên thao tác nằm trong nhãn, ví dụ
      // bot_operation_duration_seconds{subsystem="convex",op="botSyncGuilds"}
      const subsystem = /subsystem="([^"]*)"/.exec(label)?.[1] ?? "";
      const op = /op="([^"]*)"/.exec(label)?.[1] ?? label;
      return {
        // Tên thao tác là MÃ MÁY (`convex/botSyncGuilds`), không phải chữ
        // hiển thị — nên đặt tên `display` chứ không phải `label`: gate i18n
        // bắt mọi `{x.label}`, và bọc translate() cho một mã kỹ thuật là nói dối.
        display: `${subsystem}/${op}`,
        avgMs: (v.sum / v.count) * 1000,
        calls: v.count,
        errors:
          counters[
            `bot_operations_total{subsystem=${JSON.stringify(subsystem)},op=${JSON.stringify(op)},outcome="error"}`
          ] ?? 0,
      };
    })
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, 5);

  const aiCalls = Object.entries(counters)
    .filter(([k]) => k.startsWith("bot_ai_calls_total"))
    .reduce((sum, [, v]) => sum + v, 0);
  const aiCost = Object.entries(counters)
    .filter(([k]) => k.startsWith("bot_ai_cost_usd_total"))
    .reduce((sum, [, v]) => sum + v, 0);
  const rssMb = Math.round((gauges.bot_memory_rss_bytes ?? 0) / 1024 / 1024);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Gauge className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-display text-sm font-bold">{translate("Đồng hồ hệ thống")}</h3>
            <p className="text-[11px] text-muted-foreground">
              {translate("Bot tự đo mỗi 5 phút · chỉ chủ bot nhìn thấy")}{" "}
            </p>
          </div>
        </div>
      </div>

      {!metrics ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          {translate("Bot chưa đẩy số đo nào — thường chỉ xảy ra ngay sau khi deploy.")}{" "}
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
            <div className="rounded-lg bg-secondary/40 px-2.5 py-1.5">
              <span className="text-muted-foreground">{translate("RAM tiến trình:")}</span>{" "}
              <b className="tabular-nums">{rssMb} MB</b>
            </div>
            <div className="rounded-lg bg-secondary/40 px-2.5 py-1.5">
              <span className="text-muted-foreground">{translate("Số server:")}</span>{" "}
              <b className="tabular-nums">{gauges.bot_guilds ?? "—"}</b>
            </div>
            <div className="rounded-lg bg-secondary/40 px-2.5 py-1.5">
              <span className="text-muted-foreground">{translate("Lượt gọi AI:")}</span>{" "}
              <b className="tabular-nums">{aiCalls}</b>
            </div>
            <div className="rounded-lg bg-secondary/40 px-2.5 py-1.5">
              <span className="text-muted-foreground">{translate("Chi phí AI:")}</span>{" "}
              <b className="tabular-nums">${aiCost.toFixed(4)}</b>
            </div>
          </div>

          {slowest.length > 0 ? (
            <table className="mt-3 w-full text-[11px]">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="font-medium pb-1">{translate("Thao tác")}</th>
                  <th className="font-medium pb-1 text-right">{translate("Độ trễ TB")}</th>
                  <th className="font-medium pb-1 text-right">{translate("Số lần")}</th>
                  <th className="font-medium pb-1 text-right">{translate("Lỗi")}</th>
                </tr>
              </thead>
              <tbody>
                {slowest.map((op) => (
                  <tr key={op.display} className="border-t border-border/60">
                    <td className="py-1 font-mono text-[10px] text-muted-foreground">
                      {op.display}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {op.avgMs < 1000
                        ? `${Math.round(op.avgMs)} ms`
                        : `${(op.avgMs / 1000).toFixed(2)} s`}
                    </td>
                    <td className="py-1 text-right tabular-nums">{op.calls}</td>
                    <td
                      className={cn("py-1 text-right tabular-nums", op.errors > 0 && "text-danger")}
                    >
                      {op.errors}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 text-[11px] text-muted-foreground">
              {translate("Chưa có thao tác nào được đo — bot vừa khởi động.")}{" "}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function AiHealthCard() {
  const token = getSessionToken();
  const ai = useQuery(api.status.getAiHealth, token ? { token } : "skip");

  if (ai === undefined || ai === null) return null;

  const v = ai.verdictsLastHour;
  const decided = v.raid + v.individual + v.benign;
  const cooldowns = ai.providers.filter((p) => p.inCooldown);
  const mf = ai.misfire?.misfires7d ?? 0;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <BrainCircuit className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-display text-sm font-bold">{translate("Sức khỏe AI")}</h3>
            <p className="text-[11px] text-muted-foreground">
              {translate("Bot tổng hợp mỗi phút · chỉ chủ bot nhìn thấy")}{" "}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-bold",
            ai.stale
              ? "bg-danger/15 text-danger"
              : ai.available
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
          )}
        >
          {ai.stale
            ? translate("mất kết nối")
            : ai.available
              ? translate("Hoạt động")
              : translate("Không khả dụng")}
        </span>
      </div>

      {ai.stale ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          {translate(
            "Bot đang offline hoặc mất kết nối Convex — số liệu AI tạm dừng cập nhật.",
          )}{" "}
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-lg bg-secondary/40 px-2.5 py-1.5">
              <span className="text-muted-foreground">{translate("Provider:")}</span>{" "}
              <b>{ai.providers.length}</b>
              {cooldowns.length > 0 && (
                <span className="ml-1 text-danger">
                  ({cooldowns.length} {translate("nghỉ")})
                </span>
              )}
            </div>
            <div className="rounded-lg bg-secondary/40 px-2.5 py-1.5">
              <span className="text-muted-foreground">{translate("Gọi AI/phút:")}</span>{" "}
              <b>{ai.callsLastMinute}</b>
            </div>
            <div className="rounded-lg bg-secondary/40 px-2.5 py-1.5">
              <span className="text-muted-foreground">{translate("Verdict 1 giờ:")}</span>{" "}
              <b>{decided}</b>
              {v.cache > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  +{v.cache} {translate("từ cache")}
                </span>
              )}
            </div>
            <div className="rounded-lg bg-secondary/40 px-2.5 py-1.5">
              <span className="text-muted-foreground">{translate("Phạt nhầm 7 ngày:")}</span>{" "}
              <b className={mf >= 5 ? "text-danger" : undefined}>{mf}</b>
            </div>
            <div className="rounded-lg bg-secondary/40 px-2.5 py-1.5">
              <span className="text-muted-foreground">{translate("Chi AI hôm nay:")}</span>{" "}
              <b className={cn("tabular-nums", ai.budget?.overBudget && "text-danger")}>
                {ai.budget ? `$${ai.budget.spentUsd.toFixed(4)}` : translate("chưa có dữ liệu")}
              </b>
              {ai.budget && ai.budget.budgetUsd > 0 && (
                <span className="text-muted-foreground"> / ${ai.budget.budgetUsd.toFixed(2)}</span>
              )}
            </div>
          </div>
          {/* Chi tiết tiền theo từng provider + cảnh báo bảng giá đã cũ.
              `spentUsd` CHỈ gồm phần giá đã biết (xem bot/src/aiPricing.js), nên
              dòng này ghi rõ "chưa biết giá" thay vì im lặng coi như 0 USD. */}
          {ai.budget && ai.budget.byProvider.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
              {ai.budget.byProvider.map((p) => (
                <span
                  key={p.label}
                  className="rounded-full bg-secondary px-2 py-0.5 text-muted-foreground"
                >
                  {p.label}: {p.calls} {translate("lượt")} · {p.promptTokens + p.completionTokens}{" "}
                  tok
                  {p.usd > 0 ? ` · $${p.usd.toFixed(4)}` : ` · ${translate("chưa biết giá")}`}
                </span>
              ))}
            </div>
          )}
          {ai.budget?.overBudget && (
            <p className="mt-2 text-[11px] text-danger">
              {translate(
                "Đã vượt hạn mức tiền AI hôm nay — provider trả phí đã bị hạ xuống cuối danh sách, bot vẫn chống raid bằng provider miễn phí.",
              )}{" "}
            </p>
          )}
          {ai.budget &&
            ai.budget.pricingStaleDays !== null &&
            ai.budget.pricingStaleDays !== undefined && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {translate("Bảng giá AI lần rà gần nhất:")} {ai.budget.pricingChecked}
                {ai.budget.pricingStaleDays > 90 ? ` (${translate("đã cũ")})` : ""}{" "}
              </p>
            )}
          {decided > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
              <span className="rounded-full bg-danger/10 px-2 py-0.5 text-danger">
                {translate("raid")}: {v.raid}
              </span>
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-600 dark:text-amber-400">
                {translate("cá biệt")}: {v.individual}
              </span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-600 dark:text-emerald-400">
                {translate("lành tính")}: {v.benign}
              </span>
              {v.offline > 0 && (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">
                  {translate("offline")}: {v.offline}
                </span>
              )}
            </div>
          )}
          {cooldowns.length > 0 && (
            <p className="mt-2 text-[11px] text-danger">
              {translate("Đang nghỉ tạm:")} {cooldowns.map((p) => p.label).join(", ")}
            </p>
          )}
          {mf >= 5 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {translate(
                "≥5 phạt nhầm đã xác nhận — AI đang tự siết độ tin cậy (bias giảm nhẹ + nhắc thận trọng trong prompt).",
              )}{" "}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function SelfDiagnoseCard({
  diag,
  onToggle,
}: {
  diag: { enabled: boolean; lastAt: number | null; runs: number } | undefined | null;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-danger/15 text-danger">
            <Bug className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-display text-sm font-bold">
              {translate("Self-Diagnose — bot tự dò lỗi")}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {translate("AI chẩn đoán lỗi runtime · đề xuất vá vào kênh log (không tự sửa)")}{" "}
            </p>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[hsl(var(--primary))]"
            checked={!!diag?.enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span className="text-xs font-semibold">
            {translate(diag?.enabled ? "Đang bật" : "Đang tắt")}
          </span>
        </label>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        {translate(
          "Khi bật, mỗi khi bot gặp lỗi runtime (unhandled rejection / uncaught exception), lỗi + đoạn code liên quan được gửi cho AI (Mimo V2.5 qua Kira — free 30M tokens/ngày riêng cho việc học) để chẩn đoán nguyên nhân và đề xuất bản vá dạng diff. KẾT QUẢ CHỈ LÀ ĐỀ XUẤT đăng vào kênh log — bot không tự sửa code, không tự restart. Cùng 1 lỗi chỉ chẩn đoán 1 lần/giờ.",
        )}{" "}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg bg-secondary/40 px-2.5 py-1.5">
          <span className="text-muted-foreground">{translate("Lượt chẩn đoán gần nhất:")}</span>{" "}
          <b>
            {diag?.lastAt
              ? new Date(diag.lastAt).toLocaleString(dateLocale(), {
                  hour: "2-digit",
                  minute: "2-digit",
                  day: "2-digit",
                  month: "2-digit",
                })
              : translate("chưa có")}
          </b>
        </div>
        <div className="rounded-lg bg-secondary/40 px-2.5 py-1.5">
          <span className="text-muted-foreground">{translate("Tổng lượt:")}</span>{" "}
          <b>{diag?.runs ?? 0}</b>
        </div>
      </div>
    </div>
  );
}

/**
 * Threat Intel — hệ thống bot TỰ NGHIÊN CỨU raid/nuke/scam từ nguồn mở
 * (Reddit security subs + CISA KEV, 0 token) + AI tổng hợp ≤ 1 lần/tuần.
 * Từ khóa học được hợp nhất vào bộ lọc malware trên VPS — miễn phí vĩnh viễn.
 */
function ThreatIntelCard({
  threat,
  history,
  onToggle,
  onToggleAi,
  onToggleNotify,
  onRemove,
  onLearnNow,
}: {
  threat:
    | {
        researchEnabled: boolean;
        aiWeeklyEnabled: boolean;
        notifyEnabled?: boolean;
        lastRunAt: number | null;
        keywords: string[];
        scamPhrases: string[];
        lastSources: string[];
        totalRuns: number;
        lastSummary?: string | null;
        lastNewKeywords?: number | null;
        lastNewPhrases?: number | null;
        lastSourceCount?: number | null;
        manualPending?: boolean;
        manualLastAt?: number | null;
        manualLastBy?: string | null;
        lastError?: string | null;
        lastErrorAt?: number | null;
      }
    | undefined
    | null;
  onToggleNotify: (notifyEnabled: boolean) => void;
  history:
    | Array<{
        trigger: string;
        sources: string[];
        newKeywords: number;
        newPhrases: number;
        aiUsed: boolean;
        summary: string | null;
        totalKeywords: number;
        totalPhrases: number;
        requestedBy: string | null;
        createdAt: number;
      }>
    | undefined;
  onToggle: (enabled: boolean) => void;
  onToggleAi: (aiWeeklyEnabled: boolean) => void;
  onRemove: (keyword: string, kind: "keyword" | "phrase") => void;
  onLearnNow: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const [learning, setLearning] = useState(false);
  const [learnMsg, setLearnMsg] = useState<string | null>(null);

  async function handleLearnNow() {
    setLearning(true);
    setLearnMsg(null);
    try {
      const res = await onLearnNow();
      setLearnMsg(
        res.ok
          ? translate(
              "✅ Đã gửi yêu cầu — bot sẽ học ngay (xem kết quả trong lịch sử bên dưới, tối đa ~10 phút)",
            )
          : `⚠️ ${res.error ?? translate("Không gửi được yêu cầu")}`,
      );
    } finally {
      setLearning(false);
    }
  }
  const lastRun = threat?.lastRunAt
    ? new Date(threat.lastRunAt).toLocaleString(dateLocale(), {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      })
    : null;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <GraduationCap className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-display text-sm font-bold">
              {translate("Threat Intel — bot tự học")}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {translate("Tải nguồn mở mỗi giờ (0 token) · AI ≤ 1 lần/tuần")}{" "}
            </p>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[hsl(var(--primary))]"
            checked={!!threat?.researchEnabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span className="text-xs font-semibold">
            {translate(threat?.researchEnabled ? "Đang bật" : "Đang tắt")}
          </span>
        </label>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        {translate(
          "Khi bật, bot tải tin an ninh công khai (Reddit security, CISA KEV) mỗi giờ, học từ khóa scam mới và dùng MIỄN PHÍ vĩnh viễn trong bộ lọc link độc hại. Từ khóa sai có thể bấm xóa bên dưới. Chi phí: gần như 0 — không cần key thêm.",
        )}{" "}
      </p>

      {/* Lỗi lượt học gần nhất — bot báo lại thay vì treo "Bot đang học…" vĩnh viễn */}
      {threat?.lastError && (
        <div className="mt-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          <p className="font-semibold">{translate("⚠️ Lượt học gần nhất thất bại")}</p>
          <p className="mt-0.5 opacity-90">{threat.lastError}</p>
          {threat.lastErrorAt ? (
            <p className="mt-0.5 opacity-70">
              {new Date(threat.lastErrorAt).toLocaleString(dateLocale())}{" "}
              {translate('— bấm "Học ngay" để thử lại')}
            </p>
          ) : null}
        </div>
      )}

      <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
          checked={threat?.aiWeeklyEnabled ?? true}
          onChange={(e) => onToggleAi(e.target.checked)}
        />
        {translate(
          "Cho phép AI tổng hợp (Mimo V2.5 qua Kira AI — free 30M tokens/ngày riêng cho việc học; tổng hợp mỗi lượt khi có dữ liệu mới, không đụng hạn mức Groq/NVIDIA)",
        )}
      </label>

      <label className="mt-1.5 flex cursor-pointer items-start gap-2 text-[11px] leading-relaxed">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
          checked={!!threat?.notifyEnabled}
          onChange={(e) => onToggleNotify(e.target.checked)}
        />
        {translate(
          "Gửi thông báo học tập vào kênh log các server (kết quả lượt học thủ công + digest tuần). MẶC ĐỊNH TẮT — bật khi muốn admin theo dõi bot học được gì ngay trên Discord thay vì mở web.",
        )}{" "}
      </label>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg bg-secondary/40 px-2.5 py-1.5">
          <span className="text-muted-foreground">{translate("Lượt chạy gần nhất:")}</span>{" "}
          <b>{lastRun ?? translate("chưa có")}</b>
        </div>
        <div className="rounded-lg bg-secondary/40 px-2.5 py-1.5">
          <span className="text-muted-foreground">{translate("Tổng lượt:")}</span>{" "}
          <b>{threat?.totalRuns ?? 0}</b>
        </div>
        <div className="rounded-lg bg-secondary px-2.5 py-1.5">
          <span className="text-muted-foreground">{translate("Từ khóa mới lượt trước:")}</span>{" "}
          <b className="text-foreground">+{threat?.lastNewKeywords ?? 0}</b>
        </div>
        <div className="rounded-lg bg-secondary px-2.5 py-1.5">
          <span className="text-muted-foreground">{translate("Cụm từ mới:")}</span>{" "}
          <b className="text-foreground">+{threat?.lastNewPhrases ?? 0}</b>
        </div>
        <div className="col-span-2 rounded-lg bg-secondary/40 px-2.5 py-1.5">
          <span className="text-muted-foreground">
            {translate("Nguồn lượt trước")} ({threat?.lastSourceCount ?? 0}):
          </span>{" "}
          <b>{threat?.lastSources?.length ? threat.lastSources.join(", ") : "—"}</b>
        </div>
        {threat?.lastSummary && (
          <div className="col-span-2 rounded-lg bg-primary/5 px-2.5 py-1.5 text-foreground">
            🧠 <b>AI:</b> {threat.lastSummary}
          </div>
        )}
      </div>

      {/* Học thủ công */}
      <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-foreground">{translate("🖐️ Học thủ công")}</p>
            <p className="text-[11px] text-muted-foreground">
              {translate("Kích hoạt bot học NGAY từ nguồn mở + AI tổng hợp. Lần cuối:")}{" "}
              {threat?.manualLastAt
                ? new Date(threat.manualLastAt).toLocaleString(dateLocale())
                : translate("chưa có")}
              {threat?.manualLastBy ? ` · ${translate("bởi")} ${threat.manualLastBy}` : ""}
            </p>
          </div>
          <button
            type="button"
            disabled={learning || threat?.manualPending}
            onClick={handleLearnNow}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {learning || threat?.manualPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {translate(
              threat?.manualPending ? "Bot đang học…" : learning ? "Đang gửi…" : "Học ngay",
            )}
          </button>
        </div>
        {learnMsg && <p className="mt-2 text-[11px] text-muted-foreground">{learnMsg}</p>}
      </div>

      {/* Lịch sử học tập */}
      {history && history.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-semibold text-foreground">
            {translate("Lịch sử học")} ({history.length} {translate("lượt gần nhất")})
          </p>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-secondary/30 p-2">
            {history.map((r) => (
              <div
                key={r.createdAt}
                className="flex items-center justify-between gap-2 text-[11px]"
              >
                <span className="text-muted-foreground">
                  {new Date(r.createdAt).toLocaleString(dateLocale(), {
                    hour: "2-digit",
                    minute: "2-digit",
                    day: "2-digit",
                    month: "2-digit",
                  })}{" "}
                  · {r.trigger === "manual" ? "🖐️" : "⏱️"}
                  {r.requestedBy ? ` ${r.requestedBy}` : ""}
                </span>
                <span className="font-medium">
                  {" "}
                  <b className="text-foreground">+{r.newKeywords}</b> {translate("từ khóa")}{" "}
                  {r.aiUsed && <span title={translate("AI tổng hợp (Mimo V2.5)")}>🧠</span>}{" "}
                  {translate("· nhớ")} {r.totalKeywords}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3">
        <p className="mb-1.5 text-[11px] font-semibold text-foreground">
          {translate("Từ khóa đã học")} (
          {(threat?.keywords?.length ?? 0) + (threat?.scamPhrases?.length ?? 0)})
        </p>
        <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
          {threat && (threat.keywords?.length ?? 0) + (threat.scamPhrases?.length ?? 0) === 0 && (
            <span className="text-[11px] text-muted-foreground">
              {translate(
                "Chưa học được từ khóa nào — bật research và chờ lượt chạy đầu tiên (5 phút sau khi bot online).",
              )}{" "}
            </span>
          )}
          {(threat?.keywords ?? []).map((k) => (
            <span
              key={`kw-${k}`}
              className="inline-flex items-center gap-1 rounded-full bg-secondary/50 px-2 py-0.5 text-[10px] font-medium"
            >
              {k}
              <button
                type="button"
                onClick={() => onRemove(k, "keyword")}
                className="text-muted-foreground transition-colors hover:text-danger"
                title={translate("Xóa từ khóa học sai")}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          {(threat?.scamPhrases ?? []).map((p) => (
            <span
              key={`ph-${p}`}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
            >
              {p}
              <button
                type="button"
                onClick={() => onRemove(p, "phrase")}
                className="opacity-60 transition-opacity hover:opacity-100"
                title={translate("Xóa cụm từ học sai")}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Quản trị viên nhóm — danh sách Discord ID được vào cửa sổ Admin như chủ bot.
 *
 * VÌ SAO CẦN: trước đây cửa sổ Admin chỉ mở cho DUY NHẤT tài khoản owner
 * (`botStatus.ownerDiscordId`). Team vận hành bot có nhiều người: một người
 * giữ bot, người khác trực sự cố — trước đây họ phải dùng chung tài khoản owner
 * (mất dấu ai làm gì) hoặc không vào được.
 *
 * RANH GIỚI QUYỀN (cố ý giữ hẹp): quản trị viên nhóm vào cửa sổ Admin + bật/tắt
 * self-diagnose, threat research; KHÔNG đụng mật khẩu ẩn, tính năng ẩn hay
 * seed chìa khoá bot (những thứ đó = chiếm được bot). Vì vậy danh sách này CHỈ
 * chủ bot sửa được: người trong danh sách không tự thêm người khác.
 */
/** Hồ sơ hiển thị của một quản trị viên nhóm (khớp `hidden.getTeamAdmins`). */
type TeamAdminMember = {
  discordId: string;
  username: string | null;
  globalName: string | null;
  avatar: string | null;
  lastLoginAt: number | null;
};

function TeamAdminsCard({
  isOwner,
  data,
  onSave,
}: {
  isOwner: boolean;
  data: { max: number; members: TeamAdminMember[] } | undefined;
  onSave: (discordIds: string[]) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const ids = (data?.members ?? []).map((m) => m.discordId);
  const max = data?.max ?? 20;

  async function save(next: string[]) {
    setBusy(true);
    setMsg(null);
    const res = await onSave(next);
    setBusy(false);
    if (res.ok) {
      setMsg({ kind: "ok", text: translate("Đã lưu danh sách quản trị viên nhóm.") });
    } else {
      setMsg({ kind: "err", text: res.error ?? translate("Không lưu được.") });
    }
    return res.ok;
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="flex items-center gap-1.5 font-display text-sm font-bold">
        <UserPlus className="h-4 w-4" /> {translate("Quản trị viên nhóm")}{" "}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
        {translate(
          "Thêm thành viên trong team để họ cũng vào được cửa sổ Admin (theo dõi lỗi, sức khoẻ máy chủ, AI, threat research). Họ KHÔNG đụng được mật khẩu ẩn hay chìa khoá bảo mật API.",
        )}{" "}
      </p>

      {!isOwner ? (
        <p className="mt-3 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          {translate(
            "Bạn là quản trị viên nhóm — danh sách này do chủ bot quản lý. Cần thêm hoặc bớt người, hãy báo chủ bot.",
          )}{" "}
        </p>
      ) : data === undefined ? (
        <p className="mt-3 text-xs text-muted-foreground">{translate("đang tải…")}</p>
      ) : (
        <>
          {data.members.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              {translate("Chưa có ai — hiện chỉ chủ bot vào được cửa sổ này.")}{" "}
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {data.members.map((m) => {
                const name = m.globalName ?? m.username;
                const avatar = discordAvatarUrl({ id: m.discordId, avatar: m.avatar });
                return (
                  <li
                    key={m.discordId}
                    className="flex items-center gap-2.5 rounded-lg border border-border bg-secondary/30 px-2.5 py-2"
                  >
                    {avatar ? (
                      <img src={avatar} alt="" className="h-8 w-8 rounded-full" />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-bold">
                        {(name ?? "?").slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {name ?? translate("Chưa từng đăng nhập web")}{" "}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-muted-foreground">
                        {m.discordId}
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void save(ids.filter((id) => id !== m.discordId))}
                      aria-label={translate("Bỏ quyền quản trị viên nhóm")}
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-3 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              inputMode="numeric"
              placeholder={translate("Discord ID (15-21 chữ số)")}
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              type="button"
              disabled={busy || input.trim().length === 0 || ids.length >= max}
              onClick={async () => {
                const added = input.trim();
                if (await save([...ids, added])) setInput("");
              }}
              className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {translate("Thêm")}{" "}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {translate("Tối đa")} {max} {translate("người.")}{" "}
            {translate(
              "Cách lấy ID: bật Chế độ nhà phát triển trong Discord → chuột phải vào người dùng → Sao chép ID.",
            )}{" "}
          </p>
        </>
      )}

      {msg && (
        <p
          className={cn(
            "mt-2 text-[11px] font-medium",
            msg.kind === "ok" ? "text-foreground" : "text-danger",
          )}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}

/* ── Plan A — chuyển khoản ngân hàng ──────────────────────────────────── */

interface ReportedOrderRow {
  appTransId: string;
  kind: "donate" | "premium";
  plan: string;
  amount: number;
  discordId: string;
  createdAt: number;
  reportedAt?: number;
}

interface RevenueStatsData {
  total: number;
  count: number;
  donateTotal: number;
  premiumTotal: number;
  months: { key: string; total: number; count: number }[];
  years: { year: number; total: number; count: number }[];
}

/**
 * 1234567 → "1.234.567 ₫". Đi qua `dateLocale()` chứ không khoá cứng locale:
 * UI đổi ngôn ngữ là số cũng đổi định dạng nhóm nghìn — test-i18n chặn hardcode.
 */
const fmtVnd = (n: number) => `${n.toLocaleString(dateLocale())} ₫`;

/**
 * Đơn khách ĐÃ chuyển khoản nhưng CHƯA báo — chủ sở hữu bấm xác nhận để
 * kích hoạt gói ngay (thường là xử lý thủ công trong lúc Nạp chưa kịp
 * hiện trạng thái). Mỗi dòng có nút bận riêng, không khoá cả bảng.
 */
function TransferOrdersCard({
  orders,
  confirming,
  msg,
  onConfirm,
}: {
  orders: ReportedOrderRow[] | undefined;
  confirming: string | null;
  msg: { kind: "ok" | "err"; text: string } | null;
  onConfirm: (appTransId: string) => Promise<void>;
}) {
  const list = orders ?? [];
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="flex items-center gap-1.5 font-display text-sm font-bold">
        <Receipt className="h-4 w-4" /> {translate("Đơn chuyển khoản chờ xác nhận")}
        {list.length > 0 && (
          <span className="ml-auto rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-bold text-warn">
            {list.length}
          </span>
        )}
      </p>
      {list.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {translate("Hiện không có đơn nào chờ xác nhận.")}
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {" "}
          {list.map((o) => {
            // Cam kết công khai với khách là kích hoạt CHẬM NHẤT 24 giờ. Đơn đã
            // báo quá 12 giờ chưa xác nhận được tô đỏ để không tự phá cam kết đó.
            const slow = Date.now() - (o.reportedAt ?? o.createdAt) > 12 * 3600_000;
            return (
              <li
                key={o.appTransId}
                className={cn(
                  "rounded-lg border bg-background/50 p-2.5",
                  slow ? "border-danger/60 bg-danger/5" : "border-border",
                )}
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <code className="font-mono text-[11px] font-bold">#{o.appTransId}</code>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase">
                    {o.kind === "premium" ? translate("Mua premium") : translate("Ủng hộ")}
                  </span>
                  {o.kind === "premium" && (
                    <span className="text-muted-foreground">
                      {translate("Gói")} {o.plan}
                    </span>
                  )}
                  <span className="font-bold">{fmtVnd(o.amount)}</span>
                  <span className="ml-auto text-muted-foreground">
                    {`ID ${o.discordId} · `}
                    {translate("báo lúc")}{" "}
                    {new Date(o.reportedAt ?? o.createdAt).toLocaleString(dateLocale())}
                  </span>
                  {slow && (
                    <span className="rounded bg-danger/15 px-1.5 py-0.5 text-[10px] font-bold text-danger">
                      {translate("Quá 12 giờ chưa xác nhận")}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  disabled={confirming !== null}
                  onClick={() => void onConfirm(o.appTransId)}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {confirming === o.appTransId && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {translate("Đã nhận tiền → kích hoạt")}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {msg && (
        <p
          className={cn(
            "mt-2 text-[11px] font-medium",
            msg.kind === "ok" ? "text-foreground" : "text-danger",
          )}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}

/**
 * Tổng doanh thu cho chủ sở hữu: tổng + tách mua premium / ủng hộ, kèm bảng
 * theo tháng (12 dòng gần nhất, cuộn) và theo năm — dùng để báo cáo doanh
 * thu mà không phải xuất spreadsheet tay.
 */
function RevenueCard({ revenue }: { revenue: RevenueStatsData | undefined }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="flex items-center gap-1.5 font-display text-sm font-bold">
        <Banknote className="h-4 w-4" /> {translate("Tổng doanh thu theo tháng / năm")}
      </p>
      {!revenue ? (
        <p className="mt-2 text-xs text-muted-foreground">{translate("Đang tải…")}</p>
      ) : (
        <>
          <p className="mt-2 text-xs text-muted-foreground">
            <b className="font-display text-base text-foreground">{fmtVnd(revenue.total)}</b>
            {" — "}
            {translate("tổng cộng")}
            {` (${revenue.count} ${translate("giao dịch")})`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {translate("Mua premium")}:{" "}
            <b className="text-foreground">{fmtVnd(revenue.premiumTotal)}</b>
            {" · "}
            {translate("Ủng hộ")}: <b className="text-foreground">{fmtVnd(revenue.donateTotal)}</b>
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {translate("Theo tháng")}
              </p>
              <div className="max-h-44 overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-muted text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1 text-left font-bold">{translate("Tháng")}</th>
                      <th className="px-2 py-1 text-right font-bold">{translate("Số GD")}</th>
                      <th className="px-2 py-1 text-right font-bold">{translate("Doanh thu")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenue.months.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-2 py-2 text-center text-muted-foreground">
                          {translate("Chưa có giao dịch.")}
                        </td>
                      </tr>
                    )}
                    {revenue.months.map((m) => (
                      <tr key={m.key} className="border-t border-border">
                        <td className="px-2 py-1 font-mono">{m.key}</td>
                        <td className="px-2 py-1 text-right">{m.count}</td>
                        <td className="px-2 py-1 text-right font-bold">{fmtVnd(m.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {translate("Theo năm")}
              </p>
              <ul className="space-y-1 text-[11px]">
                {revenue.years.length === 0 && (
                  <li className="text-muted-foreground">{translate("Chưa có giao dịch.")}</li>
                )}
                {revenue.years.map((y) => (
                  <li
                    key={y.year}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background/50 px-2 py-1.5"
                  >
                    <span className="font-bold">{y.year}</span>
                    <span className="text-muted-foreground">
                      {y.count} {translate("giao dịch")}
                    </span>
                    <span className="font-bold">{fmtVnd(y.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
