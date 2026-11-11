import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  Ban,
  CheckCircle2,
  Fingerprint,
  Globe2,
  Link2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";

import { api } from "../../../convex/_generated/api";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import type { GuildData } from "../../lib/types";
import { getSessionToken } from "../../lib/discord";
import { convexSiteUrl } from "../../lib/convexUrl";
import { toastConvexError } from "../../lib/toastError";
import { dateLocale, translate } from "../../lib/i18n";

/**
 * VerifyWebCard — phần cấu hình + nhật ký của xác minh web (Double Counter style).
 *
 * Vì sao tách khỏi VerifyPanel: panel chính đã dài và chỉ nói về "cổng vào";
 * phần này nói về "mạng và thiết bị" — hai chủ đề khác nhau, và toàn bộ khối
 * này chỉ hiện khi server chọn phương thức `web`.
 *
 * Nguyên tắc hiển thị: KHÔNG có IP thô ở bất kỳ đâu (server không lưu). Admin
 * chỉ thấy 12 ký tự đầu của hash để đối chiếu, và nút "Ban IP" gửi `sessionId`
 * — server tự đọc hash, không tin giá trị client gửi lên.
 */

const TOKEN = () => getSessionToken();

type SessionRow = {
  id: string;
  userId: string;
  status: string;
  grantState: "pending" | "applied" | "failed" | null;
  decision: string | null;
  reason: string | null;
  riskScore: number | null;
  country: string | null;
  isVpn: boolean | null;
  isTor: boolean | null;
  isHosting: boolean | null;
  sharedIp: boolean | null;
  linkedUserId: string | null;
  linkScore: number | null;
  linkReasons: string[];
  createdAt: number;
  ipHashShort: string | null;
  /** Server không trả hash đầy đủ — chỉ cho biết nút "Ban IP" có dùng được. */
  canBanIp: boolean;
};

type PreflightCheck = { id: string; ok: boolean; detail: string; advisory?: boolean };

type PreflightResult = {
  ok: boolean;
  checks: PreflightCheck[];
  stats: {
    total: number;
    verified: number;
    denied: number;
    banned: number;
    failed: number;
    pending: number;
    grantPending: number;
  };
  ip: { source: string; public: boolean; chainLength: number; spoofRisk: boolean };
};

/** Nhãn + màu cho từng kết quả — một nguồn duy nhất cho cả bảng lẫn badge. */
function statusBadge(status: string, grantState: SessionRow["grantState"]) {
  if (status === "verified" && grantState === "pending")
    return { label: "Đang cấp quyền", className: "bg-amber-500/10 text-amber-600" };
  if (status === "verified" && grantState === "failed")
    return { label: "Cấp quyền lỗi", className: "bg-destructive/10 text-destructive" };
  if (status === "verified")
    return { label: "Đã xác minh", className: "bg-emerald-500/10 text-emerald-600" };
  if (status === "banned")
    return { label: "Đã ban", className: "bg-destructive/10 text-destructive" };
  if (status === "denied") return { label: "Từ chối", className: "bg-amber-500/10 text-amber-600" };
  if (status === "expired")
    return { label: "Hết hạn", className: "bg-secondary text-muted-foreground" };
  if (status === "failed") return { label: "Lỗi", className: "bg-secondary text-muted-foreground" };
  return { label: "Đang chờ", className: "bg-secondary text-muted-foreground" };
}

export default function VerifyWebCard({ data }: { data: GuildData }) {
  const g = data.guild;
  const [busy, setBusy] = useState(false);
  const updateSettings = useMutation(api.guilds.updateSettings);
  const createIpBan = useMutation(api.verifyBans.createIpBan);
  const revokeIpBan = useMutation(api.verifyBans.revokeIpBan);
  const deleteUserData = useMutation(api.verify.deleteUserVerifyData);

  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [preflightError, setPreflightError] = useState("");

  const sessions = useQuery(api.verify.listSessions, {
    token: TOKEN(),
    guildId: g.discordId,
    limit: 20,
  }) as SessionRow[] | null | undefined;
  const bans = useQuery(api.verifyBans.listIpBans, { token: TOKEN(), guildId: g.discordId });
  const summary = useQuery(api.verifyBans.ipBanSummary, { token: TOKEN(), guildId: g.discordId });
  const links = useQuery(api.verify.listLinks, { token: TOKEN(), guildId: g.discordId });

  const activeBans = useMemo(() => (bans ?? []).filter((b) => b.active), [bans]);
  const rows = sessions ?? [];

  async function setIpBanAction(next: "deny" | "ban") {
    if (next === "ban" && !g.ipBanAcknowledgedAt) {
      // Cảnh báo phải đọc TRƯỚC khi bật: ban theo IP có thể trúng người dùng
      // chung mạng (CGNAT, wifi công cộng). Server vẫn kiểm tra lại lần nữa.
      const ok = window.confirm(
        translate(
          "Tự động ban khi IP đã bị chặn có thể ban nhầm người dùng chung mạng (CGNAT, wifi công cộng, mạng di động). Bot đã bỏ qua các trường hợp này, nhưng rủi ro vẫn còn. Bạn hiểu và muốn bật?",
        ),
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      await updateSettings({
        token: TOKEN(),
        guildId: g.discordId,
        ipBanAction: next,
        ipBanAcknowledged: next === "ban" ? true : undefined,
      });
      toast.success(
        next === "ban"
          ? translate("Đã bật: ban tài khoản khi IP bị chặn")
          : translate("Đã đổi: chỉ từ chối xác minh"),
      );
    } catch (e: unknown) {
      toastConvexError(e, translate("Lưu thất bại"));
    } finally {
      setBusy(false);
    }
  }

  async function banSession(session: SessionRow) {
    setBusy(true);
    try {
      await createIpBan({
        token: TOKEN(),
        guildId: g.discordId,
        sessionId: session.id as never,
        days: 7,
        reason: translate("Ban từ nhật ký xác minh"),
      });
      toast.success(translate("Đã ban IP của lượt xác minh này (7 ngày)"));
    } catch (e: unknown) {
      toastConvexError(e, translate("Ban thất bại"));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    try {
      await revokeIpBan({ token: TOKEN(), guildId: g.discordId, id: id as never });
      toast.success(translate("Đã gỡ lệnh ban IP"));
    } catch (e: unknown) {
      toastConvexError(e, translate("Gỡ thất bại"));
    } finally {
      setBusy(false);
    }
  }

  async function runPreflight() {
    setBusy(true);
    setPreflightError("");
    try {
      const res = await fetch(`${convexSiteUrl()}/verify/self-test`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${TOKEN()}`,
          // IP TEST-NET-3: nếu hạ tầng để nguyên giá trị này ở mục cuối của
          // X-Forwarded-For thì header đang bị client điều khiển.
          "x-forwarded-for": "203.0.113.9",
          "x-protogon-probe-ip": "203.0.113.9",
        },
        body: JSON.stringify({ guildId: g.discordId }),
      });
      const data = (await res.json()) as PreflightResult | { ok: false; code: string };
      if (!("checks" in data)) {
        setPreflightError(translate("Không chạy được kiểm tra — thử lại sau."));
        return;
      }
      setPreflight(data);
    } catch {
      setPreflightError(translate("Không kết nối được máy chủ — kiểm tra mạng rồi thử lại."));
    } finally {
      setBusy(false);
    }
  }

  async function purgeUser(userId: string) {
    const ok = window.confirm(
      translate(
        "Xoá toàn bộ dữ liệu xác minh của thành viên này trong server này? Hành động không hoàn tác. Hồ sơ an ninh (audit/IP ban) chỉ được bỏ định danh, không xoá.",
      ),
    );
    if (!ok) return;
    setBusy(true);
    try {
      await deleteUserData({ token: TOKEN(), guildId: g.discordId, userId });
      toast.success(translate("Đã xoá dữ liệu xác minh của thành viên."));
    } catch (e: unknown) {
      toastConvexError(e, translate("Xoá thất bại"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Kiểm tra sẵn sàng trước khi bật */}
      <Card>
        <CardContent className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{translate("Kiểm tra sẵn sàng")}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {translate(
                    "Chạy trước khi bật xác minh web để phát hiện thiếu cấu hình, bot offline hoặc header IP bị giả mạo.",
                  )}
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" disabled={busy} onClick={runPreflight}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
              {translate("Chạy kiểm tra")}
            </Button>
          </div>

          {preflightError && <p className="text-xs text-destructive">{preflightError}</p>}

          {preflight && (
            <div className="space-y-2">
              <div
                className={`rounded-lg px-3 py-2 text-xs ${
                  !preflight.ok
                    ? "bg-destructive/10 text-destructive"
                    : preflight.checks.some((c) => c.advisory && !c.ok)
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {!preflight.ok
                  ? translate("Còn mục chưa đạt — xem chi tiết bên dưới.")
                  : preflight.checks.some((c) => c.advisory && !c.ok)
                    ? translate("Đủ điều kiện, nhưng còn mục cần kiểm tra thêm.")
                    : translate("Đủ điều kiện bật xác minh web.")}
              </div>
              {preflight.checks.map((check) => (
                <div key={check.id} className="flex items-start gap-2 text-xs">
                  {check.ok ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  ) : check.advisory ? (
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                  )}
                  <span className="min-w-0">
                    <span className="font-medium">{preflightLabel(check.id)}</span>
                    <span className="text-muted-foreground">
                      {" — "}
                      {preflightDetail(check.id, check.detail)}
                    </span>
                  </span>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">
                {translate("24 giờ qua")}: {preflight.stats.total} · {translate("Đã xác minh")}:{" "}
                {preflight.stats.verified} · {translate("Từ chối")}: {preflight.stats.denied} ·{" "}
                {translate("Lỗi")}: {preflight.stats.failed}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cấu hình hành động khi IP bị chặn */}
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
              <ShieldAlert className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {translate("Khi IP đã bị chặn cố xác minh lại")}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {translate(
                  "Bot bỏ qua owner, admin và bot. IP dùng chung (CGNAT/mạng di động) chỉ bị từ chối, không bao giờ tự ban.",
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={g.ipBanAction === "deny" ? "default" : "outline"}
              disabled={busy}
              onClick={() => setIpBanAction("deny")}
            >
              {translate("Chỉ từ chối")}
            </Button>
            <Button
              size="sm"
              variant={g.ipBanAction === "ban" ? "danger" : "outline"}
              disabled={busy}
              onClick={() => setIpBanAction("ban")}
            >
              <Ban className="mr-1.5 h-3.5 w-3.5" />
              {translate("Ban tài khoản")}
            </Button>
          </div>
          {g.ipBanAcknowledgedAt && (
            <p className="text-[11px] text-muted-foreground">
              {translate("Bạn đã xác nhận rủi ro ban nhầm")} ·{" "}
              {new Date(g.ipBanAcknowledgedAt).toLocaleDateString(dateLocale())}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border border-border bg-background/50 px-3 py-2">
              <p className="text-muted-foreground">{translate("IP đang bị chặn")}</p>
              <p className="text-base font-semibold">{summary?.active ?? activeBans.length}</p>
            </div>
            <div className="rounded-lg border border-border bg-background/50 px-3 py-2">
              <p className="text-muted-foreground">{translate("Hết hạn trong 24 giờ")}</p>
              <p className="text-base font-semibold">{summary?.expiringSoon ?? 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Nhật ký xác minh */}
      <Card>
        <CardContent className="space-y-3 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Fingerprint className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold">{translate("Nhật ký xác minh gần nhất")}</p>
          </div>
          {sessions === undefined && (
            <p className="text-xs text-muted-foreground">{translate("Đang tải…")}</p>
          )}
          {sessions !== undefined && rows.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {translate(
                "Chưa có lượt xác minh nào. Link sẽ được gửi qua DM khi thành viên vào server.",
              )}
            </p>
          )}
          {rows.length > 0 && (
            <div className="space-y-2">
              {rows.map((row) => {
                const badge = statusBadge(row.status, row.grantState);
                return (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-xs"
                  >
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {row.userId}
                    </span>
                    <Badge className={badge.className}>{translate(badge.label)}</Badge>
                    {row.riskScore !== null && (
                      <span className="text-muted-foreground">{row.riskScore}/100</span>
                    )}
                    {row.country && (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Globe2 className="h-3 w-3" />
                        {row.country}
                      </span>
                    )}
                    {row.isVpn && <Badge className="bg-amber-500/10 text-amber-600">VPN</Badge>}
                    {row.isTor && <Badge className="bg-destructive/10 text-destructive">Tor</Badge>}
                    {row.isHosting && (
                      <Badge className="bg-secondary text-muted-foreground">
                        {translate("Datacenter")}
                      </Badge>
                    )}
                    {row.sharedIp && (
                      <Badge className="bg-secondary text-muted-foreground">
                        {translate("IP dùng chung")}
                      </Badge>
                    )}
                    {row.linkedUserId && (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Link2 className="h-3 w-3" />
                        {row.linkedUserId} · {row.linkScore ?? 0}/100
                      </span>
                    )}
                    {row.ipHashShort && (
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                        {row.ipHashShort}…
                      </span>
                    )}
                    {row.canBanIp && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        disabled={busy}
                        onClick={() => banSession(row)}
                      >
                        <Ban className="mr-1 h-3 w-3" />
                        {translate("Ban IP")}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px] text-muted-foreground"
                      disabled={busy}
                      title={translate("Xoá dữ liệu xác minh của thành viên")}
                      onClick={() => purgeUser(row.userId)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cặp tài khoản bị gắn cờ */}
      <Card>
        <CardContent className="space-y-3 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold">{translate("Tài khoản liên quan (alt)")}</p>
          </div>
          {(links ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {translate("Chưa phát hiện cặp tài khoản nào trùng tín hiệu.")}
            </p>
          ) : (
            <div className="space-y-2">
              {(links ?? []).slice(0, 10).map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-xs"
                >
                  <span className="font-mono text-[11px]">{row.userId}</span>
                  <Link2 className="h-3 w-3 text-muted-foreground" />
                  <span className="font-mono text-[11px]">{row.linkedUserId}</span>
                  <Badge
                    className={
                      row.score >= 70
                        ? "bg-destructive/10 text-destructive"
                        : "bg-amber-500/10 text-amber-600"
                    }
                  >
                    {row.score}/100
                  </Badge>
                  <span className="text-muted-foreground">
                    {row.reasons.map((r) => reasonLabel(r)).join(" · ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Danh sách ban IP */}
      <Card>
        <CardContent className="space-y-3 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold">{translate("IP đang bị chặn")}</p>
          </div>
          {activeBans.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {translate("Chưa có IP nào bị chặn. Bạn có thể ban từ nhật ký phía trên.")}
            </p>
          ) : (
            <div className="space-y-2">
              {activeBans.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-xs"
                >
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {row.ipHashShort}…
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {row.reason}
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(row.expiresAt).toLocaleDateString(dateLocale())}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    disabled={busy}
                    onClick={() => revoke(row.id)}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    {translate("Gỡ")}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Mã check self-test → nhãn hiển thị. */
function preflightLabel(id: string): string {
  switch (id) {
    case "ip_hash_secret":
      return translate("Khóa băm IP (IP_HASH_SECRET)");
    case "ipintel_key":
      return translate("Khóa ipapi.is (IPINTEL_API_KEY)");
    case "ipapi":
      return translate("Kết nối ipapi.is");
    case "xff_spoof":
      return translate("Chống giả mạo IP");
    case "guild_verify":
      return translate("Cấu hình xác minh");
    case "guild_roles":
      return translate("Role xác minh");
    case "guild_channel":
      return translate("Kênh xác minh");
    case "bot_online":
      return translate("Bot trực tuyến");
    case "recent_failures":
      return translate("Lỗi cấp quyền 24 giờ");
    default:
      return id;
  }
}

/** Mã chi tiết self-test → câu người đọc được. */
function preflightDetail(id: string, detail: string): string {
  switch (detail) {
    case "ok":
      return translate("Đạt");
    case "missing":
      return id === "guild_channel" ? translate("Chưa chọn kênh") : translate("Chưa cấu hình");
    case "too_short":
      return translate("Quá ngắn (cần ít nhất 32 ký tự)");
    case "timeout":
      return translate("Quá thời gian chờ");
    case "network":
      return translate("Không kết nối được");
    case "skipped_no_key":
      return translate("Bỏ qua vì thiếu khóa");
    case "bad_response":
      return translate("Phản hồi không hợp lệ (kiểm tra lại khóa)");
    case "spoof_accepted":
      return translate("Header bị tin trực tiếp — NGUY HIỂM");
    case "probe_missing":
      return translate("Không gửi được header kiểm tra — hãy kiểm tra thủ công bằng curl");
    case "verify_off":
      return translate("Chưa bật xác minh");
    case "web_off":
      return translate("Chưa bật xác minh web");
    case "method_not_web":
      return translate("Phương thức không phải web");
    case "missing_unverified":
      return translate("Thiếu role chưa xác minh");
    case "missing_verified":
      return translate("Thiếu role đã xác minh");
    case "offline":
      return translate("Bot offline");
    case "stale":
      return translate("Heartbeat quá cũ");
    case "has_failures":
      return translate("Có lỗi trong 24 giờ");
    case "none":
      return translate("Không có");
    default:
      return detail.startsWith("http_") ? detail.toUpperCase() : detail;
  }
}

/** Mã lý do (server trả) → câu người đọc được. */
function reasonLabel(code: string): string {
  switch (code) {
    case "fingerprint_match":
      return translate("trùng dấu vết thiết bị");
    case "cookie_match":
      return translate("trùng cookie");
    case "ip_match":
      return translate("trùng IP");
    case "ua_match":
      return translate("trùng trình duyệt");
    case "vpn_detected":
      return "VPN";
    case "proxy_detected":
      return translate("proxy");
    case "tor_detected":
      return "Tor";
    case "datacenter_detected":
      return translate("datacenter");
    case "linked_banned_account":
      return translate("trùng tài khoản đã bị ban");
    case "ip_ban_match":
      return translate("IP đã bị chặn");
    default:
      return code;
  }
}
