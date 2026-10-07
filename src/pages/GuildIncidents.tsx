/**
 * GuildIncidents — SỰ CỐ (gom cụm) của 1 server.
 *
 * Khác GuildHistory (lịch sử THÔ từng dòng): ở đây mỗi cụm sự kiện trong
 * 15 phút gộp thành MỘT sự cố kèm số lần bị chặn, thành viên liên quan và
 * cờ "đã xử lý" — để chủ server không phải tự đếm rồi tự nhớ.
 *
 * Nguồn sự thật vẫn là antinukeEvents + modActions (xem convex/incidents.ts);
 * trang này chỉ hiển thị + ghi cờ đã xử lý.
 */

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleDot,
  ListTree,
  Loader2,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Undo2,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import PageReveal from "../components/PageReveal";
import PageSplash from "../components/PageSplash";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { discordGuildIconUrl, getSessionToken } from "../lib/discord";
import {
  compareIncidentPeriods,
  groupIncidentsByDay,
  type IncidentLike,
  type PeriodComparison,
} from "../lib/incidentStats";
import { ANTINUKE_MODULE_META, PUNISH_LABEL } from "../lib/constants";
import { cn } from "../lib/utils";
import type { GuildData } from "../lib/types";

import LangSwitch from "../components/LangSwitch";

import { dateLocale, translate } from "../lib/i18n";

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString(dateLocale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * So sánh kỳ này với kỳ trước (A4). Nói rõ là số liệu ƯỚC LƯỢNG trên dữ liệu
 * bot còn giữ — `listForGuild` chỉ lấy tối đa 500 sự kiện mỗi nguồn, nên kỳ
 * cũ hơn sẽ thiếu dần. Không nói ra điều đó thì chủ server tưởng server sạch
 * hơn thật vì dữ liệu bị cắt.
 */
function PeriodComparisonCard({ cmp }: { cmp: PeriodComparison }) {
  const rows: { label: string; now: number; before: number; invert?: boolean }[] = [
    { label: "Sự cố", now: cmp.current.incidents, before: cmp.previous.incidents },
    { label: "Lượt bị chặn", now: cmp.current.blocked, before: cmp.previous.blocked },
    { label: "Sự kiện", now: cmp.current.events, before: cmp.previous.events },
  ];
  return (
    <Card className="mb-6">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-sm font-bold">
            {`${cmp.days} ${translate("ngày gần nhất so với")} ${cmp.days} ${translate("ngày trước")}`}
          </h2>
          <p className="text-xs text-muted-foreground">
            {translate("Ước lượng trên dữ liệu bot còn lưu (tối đa 500 sự kiện mỗi nguồn)")}
          </p>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {rows.map((r) => {
            const diff = r.now - r.before;
            const worse = diff > 0;
            const same = diff === 0;
            return (
              <div key={r.label} className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">{translate(r.label)}</p>
                <p className="mt-1 font-display text-xl font-bold tabular-nums">{r.now}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  {same ? null : worse ? (
                    <TrendingUp className="h-3.5 w-3.5 text-danger" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 text-success" />
                  )}
                  {same
                    ? translate("không đổi")
                    : `${worse ? "+" : ""}${diff} ${translate("so với kỳ trước")}`}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function GuildIncidents() {
  const { guildId = "" } = useParams();
  const token = getSessionToken();
  const [pending, setPending] = useState<string | null>(null);
  /** Khoá sự cố đang mở chi tiết (drill-down). `null` = không mở cái nào. */
  const [expanded, setExpanded] = useState<string | null>(null);

  const guild = useQuery(api.guilds.getGuild, { token, guildId }) as GuildData | null | undefined;
  const incidents = useQuery(api.incidents.listForGuild, { token, guildId });
  const setResolved = useMutation(api.incidents.setResolved);

  if (guild === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <PageSplash minHeight="min-h-screen" />
      </div>
    );
  }
  if (guild === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p className="font-display text-lg font-semibold">
          {translate("Không thể truy cập server này")}
        </p>
        <Link to="/dashboard" className="text-sm text-primary hover:underline">
          {translate("← Về danh sách server")}{" "}
        </Link>
      </div>
    );
  }

  const icon = discordGuildIconUrl({ id: guild.guild.discordId, icon: guild.guild.icon });
  const list = (incidents ?? []) as unknown as IncidentLike[];
  const open = list.filter((i) => !i.resolved).length;
  const cmp = compareIncidentPeriods(list);
  const days = groupIncidentsByDay(list, dateLocale());

  async function toggle(key: string, resolved: boolean) {
    setPending(key);
    try {
      await setResolved({ token, guildId, incidentKey: key, resolved });
    } catch {
      /* Convex báo lỗi qua optimistic update — lần render sau sẽ tự đúng lại */
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 bg-background/70 backdrop-blur">
        <div className="container py-6">
          <div className="flex flex-wrap items-center gap-4">
            <Link
              to={`/dashboard/${guild.guild.discordId}`}
              aria-label={translate("← Về danh sách server")}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            {icon ? (
              <img src={icon} alt="" className="h-11 w-11 rounded-xl" />
            ) : (
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary font-display font-bold text-muted-foreground">
                {guild.guild.name.slice(0, 2).toUpperCase()}
              </span>
            )}
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight">
                {translate("Sự cố")}
              </h1>
              <p className="text-sm text-muted-foreground">{guild.guild.name}</p>
            </div>
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              {open > 0 ? (
                <Badge variant="outline" className="gap-1">
                  <CircleDot className="h-3 w-3" /> {open} {translate("chưa xử lý")}
                </Badge>
              ) : null}
              <Link
                to={`/dashboard/${guild.guild.discordId}/history`}
                className="rounded-full border border-border px-2.5 py-1 hover:bg-accent"
              >
                {translate("Xem lịch sử thô")}
              </Link>
              <LangSwitch />
            </div>
          </div>
        </div>
      </header>

      <PageReveal id="main" className="container py-8">
        <p className="mb-4 text-xs text-muted-foreground">
          {translate(
            "Các sự kiện cùng loại của cùng một người trong 15 phút được gom thành một sự cố.",
          )}{" "}
        </p>
        {incidents === undefined ? (
          <PageSplash className="py-16" minHeight="min-h-0" />
        ) : list.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <ShieldAlert className="h-6 w-6" />
              </span>
              <p className="max-w-sm text-sm text-muted-foreground">
                {translate("Chưa có sự cố nào trong 14 ngày gần nhất — server đang yên ổn.")}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <PeriodComparisonCard cmp={cmp} />
            {days.map((bucket) => (
              <section key={bucket.key} className="mb-6">
                <h2 className="mb-2 flex items-center gap-2 font-display text-sm font-bold text-muted-foreground">
                  <ListTree className="h-4 w-4" />
                  {translate(bucket.label)} · {bucket.items.length} {translate("sự cố")}
                </h2>
                <Card>
                  <CardContent className="divide-y divide-border p-0">
                    {bucket.items.map((inc) => (
                      <div
                        key={inc.key}
                        className={cn(
                          "flex items-start gap-4 px-5 py-4",
                          inc.resolved && "opacity-60",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                            inc.resolved
                              ? "bg-muted text-muted-foreground"
                              : "bg-danger/10 text-danger",
                          )}
                        >
                          {inc.resolved ? (
                            <Check className="h-5 w-5" />
                          ) : (
                            <ShieldAlert className="h-5 w-5" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">
                              {inc.kind === "antinuke"
                                ? translate(ANTINUKE_MODULE_META[inc.module]?.label ?? inc.module)
                                : translate("Hành động kiểm duyệt")}
                            </p>
                            {inc.events > 1 ? (
                              <Badge variant="outline">
                                {inc.events} {translate("sự kiện")}
                              </Badge>
                            ) : null}
                            <Badge variant={inc.blocked > 10 ? "danger" : "secondary"}>
                              {translate("chặn")} {inc.blocked}
                            </Badge>
                            {inc.punish ? (
                              <Badge variant="outline">
                                {translate(PUNISH_LABEL[inc.punish] ?? inc.punish)}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-0.5 truncate text-sm text-muted-foreground">
                            {inc.executors[0]?.id ? (
                              <>
                                {translate("thủ phạm")}{" "}
                                <span className="break-all text-foreground">
                                  {inc.executors[0].name ?? `<@${inc.executors[0].id}>`}
                                </span>
                              </>
                            ) : (
                              inc.action
                            )}
                            {inc.targets.length > 0
                              ? ` · ${inc.targets.length} ${translate("đối tượng bị tác động")}`
                              : ""}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {formatDateTime(inc.firstAt)}
                            {inc.lastAt !== inc.firstAt ? ` → ${formatDateTime(inc.lastAt)}` : ""}
                          </p>
                          {/* Drill-down: mở rộng để thấy AI, đối tượng, hành động. */}
                          {expanded === inc.key && (
                            <div className="mt-3 space-y-2 rounded-lg border border-border bg-secondary/40 p-3 text-xs">
                              <p>
                                <span className="text-muted-foreground">
                                  {translate("Hành động")}:{" "}
                                </span>
                                {inc.action}
                              </p>
                              <p>
                                <span className="text-muted-foreground">
                                  {translate("Khoảng thời gian")}:{" "}
                                </span>
                                {Math.max(1, Math.round((inc.lastAt - inc.firstAt) / 60000))}{" "}
                                {translate("phút")}
                              </p>
                              <p>
                                <span className="text-muted-foreground">
                                  {translate("Thủ phạm")} ({inc.executors.length}):
                                </span>{" "}
                                {inc.executors.length === 0
                                  ? translate("Không rõ (sự kiện tự động)")
                                  : inc.executors
                                      .slice(0, 8)
                                      .map(
                                        (e: { id: string; name?: string | null }) =>
                                          e.name ?? `<@${e.id}>`,
                                      )
                                      .join(", ")}
                              </p>
                              {inc.targets.length > 0 && (
                                <p>
                                  <span className="text-muted-foreground">
                                    {translate("Đối tượng bị tác động")} ({inc.targets.length}):
                                  </span>{" "}
                                  {inc.targets
                                    .slice(0, 8)
                                    .map(
                                      (t: { id?: string; name?: string | null }) =>
                                        t.name ?? (t.id ? `<@${t.id}>` : "—"),
                                    )
                                    .join(", ")}
                                  {inc.targets.length > 8 ? ` +${inc.targets.length - 8}` : ""}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-expanded={expanded === inc.key}
                            onClick={() => setExpanded(expanded === inc.key ? null : inc.key)}
                          >
                            <ChevronDown
                              className={cn(
                                "h-3.5 w-3.5 transition-transform",
                                expanded === inc.key && "rotate-180",
                              )}
                            />
                            {translate("Chi tiết")}
                          </Button>
                          <Button
                            variant={inc.resolved ? "ghost" : "secondary"}
                            size="sm"
                            className="shrink-0"
                            disabled={pending === inc.key}
                            onClick={() => void toggle(inc.key, !inc.resolved)}
                          >
                            {pending === inc.key ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : inc.resolved ? (
                              <>
                                <Undo2 className="h-3.5 w-3.5" /> {translate("Mở lại")}
                              </>
                            ) : (
                              <>
                                <Check className="h-3.5 w-3.5" /> {translate("Đã xử lý")}
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </section>
            ))}
          </>
        )}{" "}
      </PageReveal>
    </div>
  );
}
