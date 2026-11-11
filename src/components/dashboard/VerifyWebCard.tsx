import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Ban, Fingerprint, Globe2, Link2, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";

import { api } from "../../../convex/_generated/api";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import type { GuildData } from "../../lib/types";
import { getSessionToken } from "../../lib/discord";
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
  ipHash: string | null;
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

  return (
    <div className="space-y-4">
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
                    {row.ipHash && (
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
