import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  Bot,
  ExternalLink,
  Flame,
  Hash,
  History,
  MessageSquareReply,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { buildBotInviteUrl, getSessionToken } from "../../lib/discord";
import { usePublicConfig } from "../../lib/usePublicConfig";
import { isGuildHeartbeatFresh, timeAgo } from "../../lib/utils";
import { ANTINUKE_MODULE_META } from "../../lib/constants";
import { SafetyBar, TopOffenders } from "./HeatBar";
import ConfigHealthCard from "./ConfigHealthCard";
import type { HealthTarget } from "../../lib/configHealth";
import type { AntiNukeEvent, GuildData } from "../../lib/types";

import { dateLocale, translate } from "../../lib/i18n";
function RecentEvents({ data }: { data: GuildData }) {
  // Token qua getSessionToken(): bóc đúng cả 2 dạng lưu (sessionStorage thô
  // khi không "Lưu đăng nhập", localStorage JSON {"t","e"} khi có lưu) —
  // đọc thô ở đây làm khối "hoạt động gần đây" luôn trắng ở chế độ lưu.
  const token = getSessionToken();
  const recent = useQuery(api.reports.recentForGuild, {
    token,
    guildId: data.guild.discordId,
    limit: 8,
  }) as AntiNukeEvent[] | null | undefined;

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-display font-semibold">
            <ShieldAlert className="h-4 w-4 text-primary" />{" "}
            {translate("Hoạt động chống nuke gần đây")}{" "}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {translate("Báo cáo hàng ngày:")}{" "}
              {translate(data.guild.dailyReportEnabled ? "Bật" : "Tắt")}
              {data.guild.lastReportAt
                ? ` · ${translate("lần cuối")} ${timeAgo(data.guild.lastReportAt)}`
                : ""}
            </Badge>
            <Link to={`/dashboard/${data.guild.discordId}/history`}>
              <Button variant="outline" size="sm">
                <History className="h-3.5 w-3.5" /> {translate("Xem lịch sử")}{" "}
              </Button>
            </Link>
          </div>
        </div>
        {recent === undefined ? (
          <div className="mt-4 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-secondary/50" />
            ))}
          </div>
        ) : !recent || recent.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {translate(
              "Chưa ghi nhận sự kiện nào — bot chưa xử lý vi phạm chống nuke ở server này.",
            )}{" "}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {recent.map((e) => (
              <li key={`${e.createdAt}-${e.module}`} className="flex items-center gap-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-danger/10 text-danger">
                  <ShieldAlert className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {translate(ANTINUKE_MODULE_META[e.module]?.label ?? e.module)}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {e.count} {translate("lượt")} · {e.windowSeconds}s
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {translate(e.action)}
                    {e.executorName
                      ? ` · ${translate("thủ phạm")} ${e.executorName}`
                      : e.executorId
                        ? ` · ${translate("thủ phạm")} <@${e.executorId}>`
                        : ""}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {timeAgo(e.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function OverviewPanel({
  data,
  onNavigate,
}: {
  data: GuildData;
  /** GuildPage truyền vào để bấm lỗi cấu hình là mở thẳng panel cần sửa. */
  onNavigate?: (target: HealthTarget) => void;
}) {
  const { clientId } = usePublicConfig();
  const enabledModules = data.modules.filter((m) => m.enabled).length;
  // Heartbeat của guild thưa hơn heartbeat toàn cục 5 lần (bot chỉ refresh
  // mỗi 5 nhịp sync) — phải dùng đúng ngưỡng theo-guild, xem lib/utils.ts.
  const botOnline = data.guild.botInGuild && isGuildHeartbeatFresh(data.guild.lastHeartbeat);
  const logChannel = data.channels.find((c) => c.channelId === data.guild.logChannelId);

  const stats = [
    {
      icon: MessageSquareReply,
      label: "Rule auto reply",
      value: data.autoReplies.length,
      sub: translate("{p0} đang bật", {
        p0: data.autoReplies.filter((r) => r.enabled).length,
      }),
      tone: "bg-foreground text-primary-foreground",
    },
    {
      icon: ShieldCheck,
      label: "Module chống nuke",
      value: `${enabledModules}/${data.modules.length}`,
      sub: data.guild.antinukeEnabled ? translate("Đang bảo vệ") : translate("Đã tắt toàn bộ"),
      tone: "bg-foreground/80 text-primary-foreground",
    },
    {
      icon: Users,
      label: "Thành viên",
      value: data.guild.memberCount?.toLocaleString(dateLocale()) ?? "?",
      sub: translate("đồng bộ qua bot"),
      tone: "bg-foreground/60 text-primary-foreground",
    },
    {
      icon: Hash,
      label: "Kênh log",
      value: logChannel ? `#${logChannel.name}` : translate("Chưa đặt"),
      sub: logChannel ? translate("cảnh báo & sự kiện") : translate("đặt trong Cài đặt"),
      tone: "bg-secondary text-secondary-foreground border border-border",
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Điểm cấu hình đứng ĐẦU: người mới vào server thấy ngay còn thiếu gì. */}
      <ConfigHealthCard data={data} onNavigate={onNavigate} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="card-hover">
            <CardContent className="p-4 sm:p-5">
              <span
                className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${s.tone}`}
              >
                <s.icon className="h-5 w-5" />
              </span>
              <p className="font-display text-2xl font-bold">{translate(String(s.value))}</p>
              <p className="mt-0.5 text-xs font-medium text-foreground/80">{translate(s.label)}</p>
              <p className="text-xs text-muted-foreground">{translate(s.sub)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="grid gap-6 p-4 sm:p-5 lg:grid-cols-2">
          <div className="flex flex-col justify-center gap-3">
            <h3 className="flex items-center gap-2 font-display font-semibold">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-foreground">
                <Flame className="h-4 w-4" />
              </span>
              {translate("Mức an toàn của server")}{" "}
            </h3>
            <p className="text-sm text-muted-foreground">
              {translate(
                "Tính từ tổng nhiệt độ và warn tích lũy của thành viên. Vi phạm càng nhiều thì nhiệt càng cao và mức an toàn càng giảm; khi chạm ngưỡng, hình phạt tự tăng cấp (cảnh báo → tạm khóa → kick → ban) và tái phạm bị nhân đôi nhiệt.",
              )}{" "}
            </p>
            <SafetyBar data={data} />
          </div>
          <div>
            <h4 className="mb-3 text-sm font-medium text-muted-foreground">
              {translate("🔥 Thành viên có nhiệt độ cao nhất")}{" "}
            </h4>
            <TopOffenders data={data} limit={6} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 p-4 sm:p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`relative flex h-10 w-10 items-center justify-center rounded-lg ${
                botOnline ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"
              }`}
            >
              <Bot className="h-5 w-5" />
              {botOnline && (
                <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-card bg-foreground" />
              )}
            </span>
            <div>
              <p className="font-display font-semibold">
                {translate("Trạng thái bot")}{" "}
                <Badge variant={botOnline ? "success" : "danger"} className="ml-2">
                  {translate(botOnline ? "Trực tuyến" : "Không hoạt động")}
                </Badge>
              </p>
              <p className="text-xs text-muted-foreground">
                {translate("Lần cuối đồng bộ:")} {timeAgo(data.guild.lastHeartbeat)} · prefix{" "}
                <code className="font-mono text-primary">{data.guild.prefix}</code>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {clientId && (
              <Button asChild variant="secondary" size="sm">
                <a href={buildBotInviteUrl(clientId)} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" /> {translate("Mời bot")}{" "}
                </a>
              </Button>
            )}
            <Button asChild variant="secondary" size="sm">
              <a
                href={`https://discord.com/channels/${data.guild.discordId}`}
                target="_blank"
                rel="noreferrer"
              >
                <ArrowLeft className="h-4 w-4 rotate-180" /> {translate("Mở Discord")}{" "}
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <RecentEvents data={data} />

      <Card>
        <CardContent className="p-4 sm:p-5">
          <h3 className="font-display font-semibold">{translate("Ghi chú nhanh")}</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span className="text-primary">•</span>
              {translate("Rule auto reply hỗ trợ placeholder:")}{" "}
              <code className="font-mono text-xs">{"{user}"}</code>{" "}
              {translate("để tag người nhắn và")}{" "}
              <code className="font-mono text-xs">{"{username}"}</code>{" "}
              {translate("để lấy tên hiển thị.")}{" "}
            </li>
            <li className="flex gap-2">
              <span className="text-primary">•</span>
              {translate(
                "Bảng nhiệt & warn trong Moderation có nút xóa nhiệt cho từng người hoặc toàn bộ.",
              )}{" "}
            </li>
            <li className="flex gap-2">
              <span className="text-primary">•</span>
              {translate(
                "Join Gate chặn selfbot ngay khi vào server: tài khoản quá mới, thiếu avatar hoặc huy hiệu.",
              )}{" "}
            </li>
            <li className="flex gap-2">
              <span className="text-primary">•</span>
              {translate(
                "Module “Chống link độc hại & file nguy hiểm” quét domain lừa đảo và tệp đuôi .exe/.scr…",
              )}{" "}
            </li>
            <li className="flex gap-2">
              <span className="text-primary">•</span>
              {translate(
                "Mọi thay đổi cấu hình được bot đồng bộ tự động trong khoảng 3 phút.",
              )}{" "}
            </li>
            <li className="flex gap-2">
              <span className="text-primary">•</span>
              {translate(
                "Mod/Admin có tên trong Cài đặt được miễn trừ khỏi toàn bộ hệ thống chống nuke.",
              )}{" "}
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
