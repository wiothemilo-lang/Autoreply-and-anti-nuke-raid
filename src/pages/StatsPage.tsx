import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import PageReveal from "../components/PageReveal";
import PageSplash from "../components/PageSplash";
import {
  ArrowLeft,
  Flame,
  Loader2,
  ShieldAlert,
  Trophy,
  Users,
  UserX,
  ShieldCheck,
  Ban,
  type LucideIcon,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Badge } from "../components/ui/badge";
import { Card, CardContent } from "../components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { HEAT_DEFAULTS, HEAT_TIER_LABEL } from "../lib/constants";
import { effectiveHeat, tierOf } from "../components/dashboard/HeatBar";
import { discordGuildIconUrl, getSessionToken } from "../lib/discord";
import { explainRiskFactor } from "../lib/riskExplain";
import { timeAgo } from "../lib/utils";
import type { MeData } from "../lib/types";

import LangSwitch from "../components/LangSwitch";
import ExportCsvButton from "../components/dashboard/ExportCsvButton";

import { dateLocale, translate } from "../lib/i18n";
/** 1 dòng bảng xếp hạng trả về từ convex/reports.ts heatLeaderboard. */
interface HeatRow {
  userId: string;
  username: string;
  heat: number;
  warnStrikes: number | null;
  updatedAt: number;
  /** Decay/phút thật của guild (server trả kèm); thiếu thì dùng mặc định. */
  decayPerMin?: number;
}

/** 1 dòng số liệu từ convex/guildStats.ts (todaySummary). */
interface Summary {
  events: number;
  blocked: number;
  joins: number;
  punished: number;
  suspectedFalsePositives: number;
  threatsBlocked: number;
  topRiskFactors: [string, number][];
  dayStart: number;
  /** 24 ô giờ VN của hôm nay + 7 ngày VN gần nhất (A6). */
  hourly: { hour: number; joins: number; events: number; blocked: number }[];
  weekly: { dayStart: number; joins: number; blocked: number }[];
}

/**
 * Biểu đồ cột thuần CSS — KHÔNG kéo thêm thư viện chart cho hai bảng số nhỏ.
 *
 * Vì sao tự vẽ: thêm thư viện = thêm hàng trăm KB vào chunk Thống kê chỉ để vẽ
 * 24 thanh. Cột dùng `height` phần trăm nên tự co theo giá trị lớn nhất; nhỏ quá
 * thì đặt một vạch tối thiểu 2px để vẫn thấy "có gì đó vào khung giờ này".
 */
function BarRow({
  values,
  labels,
  ariaLabel,
}: {
  values: number[];
  labels: string[];
  ariaLabel: string;
}) {
  const max = Math.max(1, ...values);
  return (
    <div>
      <div
        className="flex h-24 items-end gap-[2px]"
        role="img"
        aria-label={ariaLabel}
        title={labels.map((l, i) => `${l}: ${values[i]}`).join(" · ")}
      >
        {values.map((v, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-primary/70 transition-all"
            style={{
              height: v === 0 ? "2px" : `${Math.max(4, (v / max) * 100)}%`,
              opacity: v === 0 ? 0.25 : 1,
            }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{labels[0]}</span>
        <span>{labels[1]}</span>
      </div>
    </div>
  );
}

/** Ô số: nhãn + giá trị + ghi chú nhỏ. Màu chỉ ở trường `danger`. */
function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  danger,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p
        className={`mt-1.5 font-display text-2xl font-bold tabular-nums ${danger ? "text-danger" : "text-foreground"}`}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/* Tier nhiệt theo bảng đen trắng: mức càng nặng → nền càng đậm. */
const TIER_STYLE: Record<string, string> = {
  warn: "bg-secondary text-secondary-foreground border border-border",
  timeout: "bg-foreground/10 text-foreground border border-foreground/20",
  kick: "bg-foreground/20 text-foreground border border-foreground/30",
  ban: "bg-danger text-danger-foreground border border-danger",
};

/* Hạng hiển thị kiểu typographic (không emoji màu) — đồng bộ bảng đen trắng. */
const MEDAL = ["1", "2", "3"];

export default function StatsPage() {
  const token = getSessionToken();
  const me = useQuery(api.sessions.me, token ? ({ token } as { token: string }) : "skip") as
    MeData | null | undefined;
  const [guildId, setGuildId] = useState("");
  const managed = me?.guilds ?? [];

  // Tự chọn server đầu tiên khi danh sách tải xong (người dùng vẫn đổi được).
  useEffect(() => {
    if (!guildId && managed.length > 0) setGuildId(managed[0].discordId);
  }, [guildId, managed]);

  // TRẦN theo gói (P4): `heatTopRows` = 10 (Miễn phí) / 30 / 50. Hỏi đúng bằng
  // hạn mức của gói đang áp cho server này — server cũng cắt đúng trần đó.
  const plan = useQuery(
    api.plans.guildPlan,
    token && guildId ? ({ token, guildId } as { token: string; guildId: string }) : "skip",
  ) as { limits: { heatTopRows: number } } | null | undefined;
  const topN = plan?.limits?.heatTopRows ?? 10;

  const rows = useQuery(
    api.reports.heatLeaderboard,
    token && guildId
      ? ({ token, guildId, limit: topN } as { token: string; guildId: string; limit: number })
      : "skip",
  ) as HeatRow[] | null | undefined;

  const summary = useQuery(
    api.guildStats.todaySummary,
    token && guildId ? ({ token, guildId } as { token: string; guildId: string }) : "skip",
  ) as Summary | null | undefined;

  const selected = managed.find((g) => g.discordId === guildId);

  // Áp decay theo thời gian trôi qua (giống HeatBar trong dashboard) rồi lọc > 0.
  const ranked = useMemo(() => {
    return (rows ?? [])
      .map((r) => ({
        ...r,
        heat: effectiveHeat(r.heat, r.updatedAt, r.decayPerMin ?? HEAT_DEFAULTS.decayPerMin),
      }))
      .filter((r) => r.heat > 0)
      .sort((a, b) => b.heat - a.heat)
      .slice(0, topN);
  }, [rows, topN]);

  if (me === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <PageSplash minHeight="min-h-screen" />
      </div>
    );
  }
  if (!me) return null;

  return (
    <div className="relative min-h-screen">
      <div className="relative z-10">
        <header className="border-b border-border/60 bg-background/70 backdrop-blur">
          <div className="container py-6">
            <div className="flex flex-wrap items-center gap-4">
              <Link
                to="/dashboard"
                aria-label={translate("← Về danh sách server")}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div>
                <h1 className="font-display text-xl font-bold tracking-tight">
                  {translate("Thống kê nhiệt độ 🔥")}{" "}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {translate("Top {n} thành viên bị cảnh báo nhiệt độ vi phạm", { n: topN })}{" "}
                </p>
              </div>
              <LangSwitch className="ml-auto" />
            </div>
          </div>
        </header>

        <PageReveal id="main" className="container py-8">
          <div className="grid gap-1.5 sm:max-w-xs">
            <p className="text-xs text-muted-foreground">{translate("Chọn server")}</p>
            <Select value={guildId} onValueChange={setGuildId}>
              <SelectTrigger>
                <SelectValue placeholder={translate("Chọn server…")} />
              </SelectTrigger>
              <SelectContent>
                {managed.map((g) => (
                  <SelectItem key={g.discordId} value={g.discordId}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {summary && (
            <section className="mt-6">
              <h2 className="font-display text-base font-bold">{translate("Tình hình hôm nay")}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {translate("Tính từ 00:00 hôm nay theo giờ Việt Nam.")}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile
                  icon={ShieldCheck}
                  label={translate("Đe doạ đã chặn")}
                  value={summary.threatsBlocked}
                  hint={`${summary.events} ${translate("sự kiện")} · ${summary.blocked} ${translate("lượt")}`}
                />
                <StatTile icon={Users} label={translate("Người mới vào")} value={summary.joins} />
                <StatTile
                  icon={UserX}
                  label={translate("Tài khoản bị xử lý")}
                  value={summary.punished}
                />
                <StatTile
                  icon={Ban}
                  label={translate("Nghi phạm phạt nhầm")}
                  value={summary.suspectedFalsePositives}
                  hint={translate("Điểm rủi ro dưới ngưỡng nhưng vẫn bị xử lý")}
                  danger={summary.suspectedFalsePositives > 0}
                />
              </div>

              {summary.hourly && summary.weekly && (
                <Card className="mt-3">
                  <CardContent className="space-y-5 p-4 sm:p-5">
                    <div>
                      <h3 className="font-semibold text-foreground">
                        {translate("Người vào theo giờ hôm nay")}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {translate("Giờ Việt Nam — bật chống nuke sớm ở khung giờ đông nhất")}
                      </p>
                      <div className="mt-3">
                        <BarRow
                          values={summary.hourly.map((h) => h.joins)}
                          labels={["00h", "23h"]}
                          ariaLabel={translate("Người vào theo giờ hôm nay")}
                        />
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">
                        {translate("Người vào 7 ngày gần nhất")}
                      </h3>
                      <div className="mt-3">
                        <BarRow
                          values={summary.weekly.map((d) => d.joins)}
                          labels={[
                            new Date(summary.weekly[0].dayStart).toLocaleDateString(dateLocale()),
                            translate("Hôm nay"),
                          ]}
                          ariaLabel={translate("Người vào 7 ngày gần nhất")}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {summary.topRiskFactors.length > 0 && (
                <Card className="mt-3">
                  <CardContent className="p-4 sm:p-5">
                    <h3 className="font-semibold text-foreground">
                      {translate("Yếu tố rủi ro hôm nay")}
                    </h3>
                    <div className="mt-3 space-y-2">
                      {summary.topRiskFactors.map(([factor, count]) => {
                        const info = explainRiskFactor(factor);
                        return (
                          <div key={factor} className="flex items-center gap-3">
                            <span className="min-w-[200px] text-sm text-foreground">
                              {translate(info.label, info.vars)}
                            </span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary transition-all"
                                style={{
                                  width: `${Math.min(100, (count / Math.max(1, summary.joins)) * 100)}%`,
                                }}
                              />
                            </div>
                            <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                              {count}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </section>
          )}

          {managed.length === 0 && (
            <Card className="mt-4 border-dashed">
              <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <ShieldAlert className="h-6 w-6" />
                </span>
                <p className="max-w-sm text-sm text-muted-foreground">
                  {translate(
                    "Bạn chưa quản lý server nào có bot — hãy mời bot vào server trước.",
                  )}{" "}
                </p>
              </CardContent>
            </Card>
          )}

          {guildId && rows === undefined && (
            <div className="mt-8 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          )}

          {guildId && rows === null && (
            <Card className="mt-4 border-dashed">
              <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/10 text-danger">
                  <ShieldAlert className="h-6 w-6" />
                </span>
                <p className="max-w-sm text-sm text-muted-foreground">
                  {translate("Không thể truy cập server này — bạn không có quyền quản lý.")}{" "}
                </p>
              </CardContent>
            </Card>
          )}

          {guildId && rows && (
            <Card className="mt-4">
              <CardContent className="p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Flame className="h-4 w-4 text-primary" />
                    <p className="font-display font-semibold">
                      {translate("Bảng xếp hạng nhiệt độ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selected?.icon && (
                      <img
                        src={
                          discordGuildIconUrl({ id: selected.discordId, icon: selected.icon }) ?? ""
                        }
                        alt=""
                        className="h-6 w-6 rounded-md"
                      />
                    )}
                    <Badge variant="secondary">{selected?.name ?? "—"}</Badge>
                  </div>
                </div>

                <div className="mb-4">
                  <ExportCsvButton guildId={guildId} kind="heat" />
                </div>

                <p className="mb-4 text-xs text-muted-foreground">
                  {translate(
                    "Nhiệt giảm {decay} điểm/phút — thành viên ngoan tự rời bảng sau một lúc im giọng. ▪ {warn} cảnh báo · ▪ {timeout} tạm khóa · ▪ {kick} kick · ■ {ban} ban",
                    {
                      decay: rows?.[0]?.decayPerMin ?? HEAT_DEFAULTS.decayPerMin,
                      warn: HEAT_DEFAULTS.warnAt,
                      timeout: HEAT_DEFAULTS.timeoutAt,
                      kick: HEAT_DEFAULTS.kickAt,
                      ban: HEAT_DEFAULTS.banAt,
                    },
                  )}
                </p>

                {ranked.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-foreground">
                      <Trophy className="h-6 w-6" />
                    </span>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      {translate("Không ai đang nóng đầu cả — server đang rất bình yên.")}{" "}
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {ranked.map((r, i) => {
                      const tier = tierOf(
                        r.heat,
                        HEAT_DEFAULTS.timeoutAt,
                        HEAT_DEFAULTS.kickAt,
                        HEAT_DEFAULTS.banAt,
                      );
                      return (
                        <li
                          key={r.userId}
                          className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
                        >
                          <span className="w-7 shrink-0 text-center font-mono text-sm font-bold tabular-nums text-foreground">
                            {MEDAL[i] ?? i + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate font-medium">{r.username}</p>
                              <Badge variant="outline" className={TIER_STYLE[tier]}>
                                {translate(HEAT_TIER_LABEL[tier] ?? tier)}
                              </Badge>
                              {(r.warnStrikes ?? 0) > 0 && (
                                <Badge variant="secondary" className="px-2 py-0.5 text-[10px]">
                                  {r.warnStrikes} {translate("lần cảnh báo")}
                                </Badge>
                              )}
                            </div>
                            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
                              <div
                                className="heat-swirl h-full rounded-full transition-all duration-500"
                                style={{ width: `${Math.max(2, Math.min(100, r.heat))}%` }}
                              />
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="font-mono text-sm font-semibold tabular-nums">
                              {r.heat}/100
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {timeAgo(r.updatedAt)}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </PageReveal>
      </div>
    </div>
  );
}
