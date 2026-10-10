import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePaginatedQuery, useQuery } from "convex/react";
import PageReveal from "../components/PageReveal";
import PageSplash from "../components/PageSplash";
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  Filter,
  Loader2,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { discordGuildIconUrl, getSessionToken } from "../lib/discord";
import { ANTINUKE_MODULE_META, ANTINUKE_ORDER, PUNISH_LABEL } from "../lib/constants";
import type { GuildData } from "../lib/types";

import LangSwitch from "../components/LangSwitch";
import ExportCsvButton from "../components/dashboard/ExportCsvButton";

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

/** Chuyển ngày đầu/cuối theo múi giờ của người dùng, tránh lệch ngày ở Việt Nam. */
function dateToTs(d: string, endOfDay: boolean): number | undefined {
  if (!d) return undefined;
  const [y, m, day] = d.split("-").map(Number);
  const date = new Date(y, m - 1, day, 0, 0, 0, 0);
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date.getTime();
}

export default function GuildHistory() {
  const { guildId = "" } = useParams();
  const token = getSessionToken();

  const [filterModule, setFilterModule] = useState<string>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const guild = useQuery(api.guilds.getGuild, { token, guildId }) as GuildData | null | undefined;
  const { results, status, loadMore } = usePaginatedQuery(
    api.reports.historyForGuild,
    {
      token,
      guildId,
      module: filterModule === "all" ? undefined : filterModule,
      from: dateToTs(fromDate, false),
      to: dateToTs(toDate, true),
      search: debouncedSearch.trim() || undefined,
    },
    { initialNumItems: 20 },
  );

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
  const loading = status === "LoadingFirstPage" || status === "LoadingMore";
  const hasActiveFilter =
    filterModule !== "all" || fromDate !== "" || toDate !== "" || debouncedSearch.trim() !== "";

  function clearFilters() {
    setFilterModule("all");
    setFromDate("");
    setToDate("");
    setSearch("");
    setDebouncedSearch("");
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
                {translate("Lịch sử chống nuke")}
              </h1>
              <p className="text-sm text-muted-foreground">{guild.guild.name}</p>
            </div>
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              <Link
                to={`/dashboard/${guild.guild.discordId}/incidents`}
                className="rounded-full border border-border px-2.5 py-1 hover:bg-accent"
              >
                {translate("Xem theo sự cố")}
              </Link>
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" />
                {results.length} {translate("sự kiện đã hiển thị")}
              </span>
            </div>
            <LangSwitch />
          </div>
          {/* Xuất sự kiện chống nuke ra CSV — cùng trần dòng/ngày với gói đang áp
              cho server (P3). Nguồn số trên nút: plans.guildPlan. */}
          <div className="mt-3">
            <ExportCsvButton guildId={guild.guild.discordId} kind="events" />
          </div>
        </div>
      </header>

      <PageReveal id="main" className="container py-8">
        <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Module</Label>
            <Select value={filterModule} onValueChange={setFilterModule}>
              <SelectTrigger>
                <SelectValue placeholder={translate("Tất cả module")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{translate("Tất cả module")}</SelectItem>
                {ANTINUKE_ORDER.map((m) => (
                  <SelectItem key={m} value={m}>
                    {translate(ANTINUKE_MODULE_META[m].label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">{translate("Từ ngày")}</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">{translate("Đến ngày")}</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">
              {translate("Tìm theo tên thủ phạm")}
            </Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder={translate("Tên Discord…")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
        {hasActiveFilter && (
          <div className="mt-3 flex items-center justify-between">
            <Badge variant="secondary" className="gap-1">
              <Filter className="h-3 w-3" /> {translate("Đang lọc kết quả")}{" "}
            </Badge>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" /> {translate("Xóa bộ lọc")}{" "}
            </Button>
          </div>
        )}
        {results.length === 0 && status !== "LoadingFirstPage" ? (
          <Card className="mt-4 border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <ShieldAlert className="h-6 w-6" />
              </span>
              <p className="max-w-sm text-sm text-muted-foreground">
                {translate(
                  hasActiveFilter
                    ? "Không có sự kiện nào khớp với bộ lọc hiện tại."
                    : "Chưa có sự kiện chống nuke nào được ghi nhận.",
                )}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="mt-4">
            <CardContent className="divide-y divide-border p-0">
              {results.map((e) => (
                <div
                  key={`${e.createdAt}-${e.module}`}
                  className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-accent/40"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger/10 text-danger">
                    <ShieldAlert className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">
                        {translate(ANTINUKE_MODULE_META[e.module]?.label ?? e.module)}
                      </p>
                      <Badge variant="outline">
                        {e.count} {translate("lượt")} · {translate("ngưỡng")} {e.threshold}{" "}
                        {translate("trong")} {e.windowSeconds}s
                      </Badge>
                      <Badge variant="secondary">
                        {translate(PUNISH_LABEL[e.punish] ?? e.punish)}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {e.action}
                      {e.executorName
                        ? ` · ${translate("thủ phạm")} ${e.executorName}`
                        : e.executorId
                          ? ` · ${translate("thủ phạm")} <@${e.executorId}>`
                          : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatDateTime(e.createdAt)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        <div className="mt-6 flex flex-col items-center gap-3">
          {status === "CanLoadMore" && (
            <Button variant="secondary" onClick={() => loadMore(20)} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              {translate("Tải thêm sự kiện")}
            </Button>
          )}
          {status === "Exhausted" && results.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {translate("— Đã hiển thị toàn bộ")} {results.length} {translate("sự kiện")} —
            </p>
          )}
        </div>{" "}
      </PageReveal>
    </div>
  );
}
