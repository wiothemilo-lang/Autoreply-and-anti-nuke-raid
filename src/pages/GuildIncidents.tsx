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
import { ArrowLeft, Check, CircleDot, Loader2, ShieldAlert, Undo2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import PageReveal from "../components/PageReveal";
import PageSplash from "../components/PageSplash";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { discordGuildIconUrl, getSessionToken } from "../lib/discord";
import { ANTINUKE_MODULE_META, PUNISH_LABEL } from "../lib/constants";
import { cn } from "../lib/utils";
import type { GuildData } from "../lib/types";

import LangSwitch from "../components/LangSwitch";
import SkipLink from "../components/SkipLink";

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

export default function GuildIncidents() {
  const { guildId = "" } = useParams();
  const token = getSessionToken();
  const [pending, setPending] = useState<string | null>(null);

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
  const list = incidents ?? [];
  const open = list.filter((i) => !i.resolved).length;

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
      <SkipLink />
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
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {list.map((inc) => (
                <div
                  key={inc.key}
                  className={cn("flex items-start gap-4 px-5 py-4", inc.resolved && "opacity-60")}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                      inc.resolved ? "bg-muted text-muted-foreground" : "bg-danger/10 text-danger",
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
                  </div>
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
              ))}
            </CardContent>
          </Card>
        )}{" "}
      </PageReveal>
    </div>
  );
}
