import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Fingerprint,
  Globe,
  ShieldAlert,
  ShieldCheck,
  Skull,
  UserX,
  Users,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Switch } from "../ui/switch";
import type { GuildData } from "../../lib/types";
import { getSessionToken } from "../../lib/discord";
import { explainPunishment, explainRiskFactor } from "../../lib/riskExplain";

import { translate } from "../../lib/i18n";
const TOKEN = () => getSessionToken();

const PUNISH_OPTIONS = [
  { value: "kick", label: "Kick", icon: UserX, color: "text-foreground" },
  { value: "ban", label: "Ban", icon: Skull, color: "text-danger" },
  { value: "timeout", label: "Timeout", icon: AlertTriangle, color: "text-foreground" },
  { value: "verify", label: "Re-verify", icon: ShieldCheck, color: "text-muted-foreground" },
] as const;

// Nhãn ở đây chuỗi tiếng Việt CÓ DẤU (trước đây viết không dấu: "Tat",
// "Canh bao"… trông như UI lỗi) và được dịch lúc render, không dịch lúc
// import — hằng số cấp module chỉ eval một lần.
const VPN_MODES = [
  { value: "off", label: "Tắt", desc: "Không kiểm tra VPN" },
  { value: "warn", label: "Cảnh báo", desc: "Ghi log VPN nhưng không chặn" },
  { value: "strict", label: "Nghiêm ngặt", desc: "Chặn VPN/Proxy ngay lập tức" },
] as const;

function riskColor(score: number) {
  if (score >= 70) return "bg-danger/10 text-danger border-danger/30";
  if (score >= 40) return "bg-foreground/10 text-foreground border-foreground/30";
  if (score >= 20) return "bg-secondary text-foreground border-border";
  return "bg-secondary text-muted-foreground border-border";
}

/** Nhãn mức rủi ro — gọi trong lúc render nên translate() luôn đúng ngôn ngữ. */
function riskLabel(score: number) {
  // Dùng key "Rủi ro …" thay vì "Cao/Trung bình/Thấp": "Trung bình" đã là key
  // của chỉ số thống kê khác (nghĩa "Average") nên không thể dùng lại.
  if (score >= 70) return translate("Rủi ro cao");
  if (score >= 40) return translate("Rủi ro trung bình");
  if (score >= 20) return translate("Rủi ro thấp");
  return translate("An toàn");
}

/** Tuổi tài khoản dạng người đọc được — placeholder {n} để dịch trọn câu. */
function formatAge(createdAt: number) {
  const days = Math.floor((Date.now() - createdAt) / 86_400_000);
  if (days < 1) return translate("hôm nay");
  if (days === 1) return translate("1 ngày");
  if (days < 30) return translate("{n} ngày", { n: days });
  if (days < 365) return translate("{n} tháng", { n: Math.floor(days / 30) });
  return translate("{n} năm", { n: Math.floor(days / 365) });
}

type AltConfigData = Record<string, any>;
type AltJoinData = Record<string, any>;
type AltStatsData = Record<string, any>;

/**
 * Lý do cụ thể vì sao bot xử lý tài khoản này.
 *
 * Trước đây cột "Xử lý" chỉ hiện mã hình phạt (`kick`, `ban`) — chủ server
 * không có cách nào biết vì sao người đó bị kick, nên chỉ còn cách tắt cả
 * module Alt Detection. Dữ liệu để giải thích thì bot đã ghi đủ
 * (`riskFactors`, `riskScore`), chỉ chưa ai hiện ra.
 */
function PunishmentReason({ join }: { join: AltJoinData }) {
  const reason = explainPunishment({
    action: join.action,
    riskScore: join.riskScore,
    riskFactors: join.riskFactors,
  });
  if (!reason) return null;
  return (
    <p className="max-w-[22rem] text-left text-[11px] leading-snug text-muted-foreground">
      {translate(reason)}
    </p>
  );
}

export default function AltDetectionPanel({ data }: { data: GuildData }) {
  const token = TOKEN();
  const guildId = data.guild.discordId;

  const altConfig = useQuery(api.altDetection.getAltConfig, { token, guildId }) as
    AltConfigData | null | undefined;
  const recentJoins = useQuery(api.altDetection.getRecentJoins, { token, guildId, limit: 50 }) as
    AltJoinData[] | null | undefined;
  const altStats = useQuery(api.altDetection.getAltStats, { token, guildId }) as
    AltStatsData | null | undefined;

  const updateConfig = useMutation(api.altDetection.updateAltConfig);

  const [saving, setSaving] = useState(false);

  const enabled = altConfig?.altDetectionEnabled ?? false;
  const currentPunish = altConfig?.altPunish ?? "kick";
  const maxRisk = altConfig?.altMaxRiskScore ?? 70;
  const currentVpnMode = altConfig?.altVpnMode ?? "off";
  const safeMode = altConfig?.altSafeMode ?? true;

  async function toggleEnabled() {
    setSaving(true);
    // Tính giá trị MỚI một lần: `enabled` trong closure là giá trị CŨ, dùng nó để
    // chọn thông báo sẽ hiện "Đã tắt" ngay khi người dùng vừa bật (và ngược lại).
    const next = !enabled;
    try {
      await updateConfig({ token, guildId, altDetectionEnabled: next });
      toast.success(next ? translate("Đã bật Alt Detection") : translate("Đã tắt Alt Detection"));
    } catch (e: unknown) {
      toast.error((e as Error).message);
    }
    setSaving(false);
  }

  async function setPunish(punish: string) {
    setSaving(true);
    try {
      await updateConfig({
        token,
        guildId,
        altPunish: punish as "kick" | "ban" | "timeout" | "verify",
      });
      toast.success(`Da doi hinh phat thanh ${punish}`);
    } catch (e: unknown) {
      toast.error((e as Error).message);
    }
    setSaving(false);
  }

  async function setThreshold(value: number) {
    setSaving(true);
    try {
      await updateConfig({ token, guildId, altMaxRiskScore: value });
      toast.success(`Nguong rui ro: ${value}/100`);
    } catch (e: unknown) {
      toast.error((e as Error).message);
    }
    setSaving(false);
  }

  async function setSafeMode(v: boolean) {
    setSaving(true);
    try {
      await updateConfig({ token, guildId, altSafeMode: v });
      toast.success(
        v
          ? translate("Đã bật chế độ an toàn — chỉ phạt khi có đủ bằng chứng")
          : translate("Đã tắt chế độ an toàn — phạt theo điểm rủi ro"),
      );
    } catch (e: unknown) {
      toast.error((e as Error).message);
    }
    setSaving(false);
  }

  async function setVpnMode(mode: string) {
    setSaving(true);
    try {
      await updateConfig({
        token,
        guildId,
        altVpnMode: mode as "strict" | "warn" | "off",
        vpnBlockEnabled: mode === "strict",
      });
      toast.success(`Che do VPN: ${mode}`);
    } catch (e: unknown) {
      toast.error((e as Error).message);
    }
    setSaving(false);
  }

  const joins = recentJoins ?? [];

  return (
    <div className="space-y-5">
      {/* Header + Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Fingerprint className="h-5 w-5 text-primary" />
            Alt Account + VPN Detection
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {translate(
              "Phát hiện và chặn alt account, VPN/Proxy khi thành viên mới tham gia server.",
            )}
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={toggleEnabled} disabled={saving} />
      </div>

      {/* Stats Cards */}
      {altStats && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3" /> {translate("Lượt join (7 ngày)")}
              </p>
              <p className="text-2xl font-bold mt-1">{altStats.totalJoins7d ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <ShieldAlert className="h-3 w-3 text-danger" /> {translate("Rủi ro cao")}
              </p>
              <p className="text-2xl font-bold mt-1 text-danger">{altStats.highRiskCount ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Globe className="h-3 w-3 text-muted-foreground" /> VPN/Proxy
              </p>
              <p className="text-2xl font-bold mt-1">{altStats.vpnCount ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-muted-foreground" />{" "}
                {translate("Tài khoản mới")}
              </p>
              <p className="text-2xl font-bold mt-1">{altStats.newAccountCount ?? 0}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Configuration */}
      <Card>
        <CardContent className="p-4 sm:p-5 space-y-5">
          <h4 className="font-semibold text-foreground">Cau hinh</h4>

          {/* Punish */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Hinh phat</label>
            <div className="flex flex-wrap gap-2">
              {PUNISH_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                return (
                  <Button
                    key={opt.value}
                    size="sm"
                    variant={currentPunish === opt.value ? "default" : "outline"}
                    onClick={() => setPunish(opt.value)}
                    disabled={saving}
                  >
                    <Icon className={`h-3.5 w-3.5 mr-1.5 ${opt.color}`} />
                    {translate(opt.label)}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Threshold */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              {translate("Ngưỡng rủi ro:")} {""}
              <span className="text-primary font-bold">{maxRisk}/100</span>
            </label>
            <input
              type="range"
              min={10}
              max={100}
              value={maxRisk}
              onChange={(e) => setThreshold(parseInt(e.target.value))}
              className="w-full accent-primary"
              disabled={saving}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>{translate("10 (nghiêm ngặt)")}</span>
              <span>{translate("100 (lỏng lẻo)")}</span>
            </div>
          </div>

          {/* VPN Mode */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              {translate("Chế độ VPN/Proxy")}
            </label>
            <div className="flex flex-wrap gap-2">
              {VPN_MODES.map((mode) => {
                return (
                  <Button
                    key={mode.value}
                    size="sm"
                    variant={currentVpnMode === mode.value ? "default" : "outline"}
                    onClick={() => setVpnMode(mode.value)}
                    disabled={saving}
                  >
                    {translate(mode.label)}
                    <span className="ml-1.5 hidden text-xs text-muted-foreground sm:inline">
                      -- {translate(mode.desc)}
                    </span>
                  </Button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {translate(
                "⚠️ Discord không cung cấp địa chỉ IP của thành viên cho bot, nên phát hiện VPN/Proxy trực tiếp là không khả thi với dữ liệu hiện có. Hệ thống tập trung vào phát hiện tài khoản phụ bằng bằng chứng hành vi (tuổi tài khoản, tên/avatar trùng, lịch sử bị phạt, cụm join) — cách chặn tài khoản lạm dụng VPN hiệu quả nhất mà Discord cho phép.",
              )}{" "}
            </p>
          </div>

          {/* Safe Mode */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background/50 px-4 py-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">
                  {translate("Chế độ an toàn (chống chặn nhầm)")}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {translate("Chỉ phạt khi có")} <b>{translate("đủ bằng chứng độc lập")}</b>
                  {translate(
                    ": từ 2 tín hiệu mạnh trở lên → phạt đúng cấu hình; 1 tín hiệu → hạ cấp nhẹ hơn (ban → kick, kick → timeout); không có tín hiệu → chỉ theo dõi. Tắt để phạt theo điểm rủi ro như trước (dễ chặn nhầm hơn).",
                  )}
                </p>
              </div>
            </div>
            <Switch checked={safeMode} onCheckedChange={setSafeMode} disabled={saving} />
          </div>
        </CardContent>
      </Card>

      {/* Recent Joins */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <h4 className="font-semibold text-foreground mb-4">
            {translate("Lượt join gần đây")} ({joins.length})
          </h4>
          {joins.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {translate("Chưa có dữ liệu join nào.")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4">{translate("Thành viên")}</th>
                    <th className="pb-2 pr-4 text-center">{translate("Rủi ro")}</th>
                    <th className="pb-2 pr-4 text-center">{translate("Bằng chứng")}</th>
                    <th className="pb-2 pr-4 text-center">{translate("Xử lý")}</th>
                    <th className="pb-2 pr-4 text-center">{translate("Tuổi")}</th>
                    <th className="pb-2 pr-4 text-center">VPN</th>
                    <th className="pb-2">{translate("Yếu tố")}</th>
                  </tr>
                </thead>
                <tbody>
                  {joins.map((j) => {
                    const riskScore = j.riskScore ?? 0;
                    return (
                      <tr key={j._id} className="border-b last:border-0">
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">{j.username}</span>
                            <code className="text-xs text-muted-foreground">
                              ({(j.userId ?? "").slice(0, 8)}...)
                            </code>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 text-center">
                          <span
                            className={`inline-block rounded-full border px-2 py-0.5 text-xs font-bold ${riskColor(riskScore)}`}
                          >
                            {riskScore} -- {riskLabel(riskScore)}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-center">
                          <span
                            className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold ${(j.strongSignals ?? 0) >= 2 ? "bg-danger/10 text-danger border border-danger/30" : (j.strongSignals ?? 0) === 1 ? "bg-foreground/10 text-foreground border border-foreground/30" : "bg-muted text-muted-foreground border border-border"}`}
                          >
                            {j.strongSignals ?? 0}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-center">
                          {j.action && j.action !== "pass" ? (
                            <div className="space-y-1">
                              <Badge
                                variant="outline"
                                className="text-[10px] text-danger border-danger/30"
                              >
                                {j.action}
                              </Badge>
                              <PunishmentReason join={j} />
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">--</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-center text-muted-foreground text-xs">
                          {formatAge(j.createdAt)}
                        </td>
                        <td className="py-2.5 pr-4 text-center">
                          {j.isVPN ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-danger border-danger/30"
                            >
                              VPN
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">--</span>
                          )}
                        </td>
                        <td className="py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {(j.riskFactors ?? []).map((f: string, i: number) => {
                              // Dịch mã thô (`❌ account_age_1day`) sang tiếng
                              // Việt đọc được — xem lib/riskExplain.ts. Giữ luôn
                              // mức mạnh/ yếu vì "2 bằng chứng mạnh" mới đủ để
                              // bot phạt: người đọc phải thấy được, không tự đếm.
                              const info = explainRiskFactor(f);
                              return (
                                <Badge
                                  key={i}
                                  variant="outline"
                                  title={info.code}
                                  className={`text-[10px] ${
                                    info.strength === "strong"
                                      ? "border-danger/30 text-danger"
                                      : info.strength === "weak"
                                        ? "border-border text-muted-foreground"
                                        : "border-border text-foreground"
                                  }`}
                                >
                                  {info.strength === "positive"
                                    ? "✓ "
                                    : info.strength === "weak"
                                      ? "⚠ "
                                      : ""}
                                  {translate(info.label, info.vars)}
                                </Badge>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Risk Factors */}
      {altStats?.topFactors && (
        <Card>
          <CardContent className="p-4 sm:p-5">
            <h4 className="font-semibold text-foreground mb-3">
              {translate("Yếu tố rủi ro phổ biến")}
            </h4>
            <div className="space-y-2">
              {(altStats.topFactors as Array<[string, number]>).map(([factor, count]) => (
                <div key={factor} className="flex items-center gap-3">
                  <span className="text-sm text-foreground min-w-[160px]">{factor}</span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${Math.min(100, count * 10)}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-8 text-right">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
