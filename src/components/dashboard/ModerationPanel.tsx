import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { toastConvexError } from "../../lib/toastError";
import { BellRing, Hash, Megaphone } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent } from "../ui/card";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  DEFAULT_PUNISH_NOTICE,
  PUNISH_NOTICE_ACTION_LABEL,
  PUNISH_NOTICE_ACTIONS,
  PUNISH_NOTICE_LEVELS,
} from "../../lib/constants";
import type { GuildData, PunishNoticeLevel } from "../../lib/types";
import { getSessionToken } from "../../lib/discord";
import { cn } from "../../lib/utils";

import { translate } from "../../lib/i18n";
const TOKEN = () => getSessionToken();

const LEVEL_BADGE: Record<string, string> = {
  none: "bg-secondary text-muted-foreground",
  action: "bg-foreground/10 text-foreground border border-foreground/20",
  reason: "bg-foreground/20 text-foreground border border-foreground/30",
  full: "bg-foreground text-primary-foreground",
};

/** Xem trước embed hình phạt bot sẽ gửi theo mức chi tiết đã chọn. */
function previewFor(action: string, level: PunishNoticeLevel): string {
  const label = translate(PUNISH_NOTICE_ACTION_LABEL[action] ?? action);
  switch (level) {
    case "none":
      return translate("Bot không gửi embed nào sau khi trừng phạt (dashboard vẫn ghi nhận case).");
    case "action":
      return translate("{p0} | case N — Offender: @thànhviên", { p0: label });
    case "reason":
      return translate("{p0} | case N — Offender: @thànhviên · Reason: <lý do vi phạm>", {
        p0: label,
      });
    case "full":
      return translate(
        "{p0} | case N — Offender: @thànhviên · Reason: <lý do> · Responsible moderator: @người áp dụng",
        { p0: label },
      );
  }
}

export default function ModerationPanel({ data }: { data: GuildData }) {
  const updateSettings = useMutation(api.guilds.updateSettings);
  const [saving, setSaving] = useState(false);
  // Kênh nhận thông báo KHÔNG chọn ở đây nữa — xem bảng "Kênh nhận thông báo".
  // Chỉ đọc để hiển thị tên kênh đang dùng theo thứ tự ưu tiên của bot.
  const noticeChannelId = data.guild.modLogChannelId ?? data.guild.logChannelId;
  const noticeChannelName =
    data.channels.find((c) => c.channelId === noticeChannelId)?.name ?? null;

  const notice = {
    ...DEFAULT_PUNISH_NOTICE,
    ...(data.guild.punishNotice ?? {}),
  };

  async function save(patch: {
    punishNotice?: { ban: string; timeout: string; kick: string; warn: string };
  }) {
    setSaving(true);
    try {
      // "" = xoá kênh hình phạt riêng (cấu hình cũ): từ nay đích thông báo lấy
      // DUY NHẤT từ Cài đặt → Kênh log, không còn hai nơi ghi đè nhau.
      await updateSettings({
        token: TOKEN(),
        guildId: data.guild.discordId,
        punishNoticeChannelId: "",
        ...patch,
      });
      toast.success(translate("Đã lưu — bot áp dụng trong vòng ~3 phút"));
    } catch (e) {
      toastConvexError(e, translate("Lưu thất bại"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <Megaphone className="h-5 w-5 text-primary" />{" "}
            {translate("Moderation — thông báo sau khi phạt")}{" "}
          </h2>
          <p className="text-sm text-muted-foreground">
            {translate("Tùy chỉnh")}{" "}
            <b className="text-foreground">{translate("embed hình phạt chi tiết")}</b>{" "}
            {translate(
              "bot gửi sau khi đã trừng phạt thành viên vi phạm — đồng bộ cả kênh lẫn mức chi tiết, theo từng hành động ban · timeout · warn · kick (cả tự động lẫn lệnh thủ công).",
            )}{" "}
          </p>
        </div>
        <Badge variant="secondary" className="gap-1.5 px-3 py-1.5">
          <BellRing className="h-3.5 w-3.5" />
          {Object.values(notice).filter((l) => l !== "none").length}/4{" "}
          {translate("đang bật thông báo")}
        </Badge>
      </div>

      {/* Kênh nhận thông báo — CHỈ ĐỌC: cấu hình ở Cài đặt → Kênh log để không
          còn hai nơi chọn kênh ghi đè nhau và log bị nhân đôi. */}
      <Card className={noticeChannelName ? "border-primary/25" : "border-warning/40"}>
        <CardContent className="space-y-2 p-4 sm:p-5">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Hash className="h-4 w-4 text-primary" /> {translate("Kênh nhận thông báo")}{" "}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {translate(
              "Bot gửi case vào kênh log hành động mod; chưa đặt thì dùng kênh log chung. Nơi cấu hình duy nhất là",
            )}{" "}
            <b className="text-foreground">{translate("Cài đặt → Kênh log")}</b>{" "}
            {translate(
              "— không chọn kênh lại ở đây để tránh hai nơi ghi đè nhau và log bị nhân đôi.",
            )}{" "}
          </p>
          {noticeChannelName ? (
            <p className="text-xs text-muted-foreground">
              {translate("Đang gửi tới:")} <b className="text-foreground">#{noticeChannelName}</b>
            </p>
          ) : (
            <p className="rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
              {translate(
                "Chưa chọn kênh log nào nên bot chưa gửi được thông báo hình phạt — vào Cài đặt → Kênh log để chọn.",
              )}{" "}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 4 hành động: ban / timeout / warn / kick */}
      <div className="grid gap-4 lg:grid-cols-2">
        {PUNISH_NOTICE_ACTIONS.map((action) => {
          const level = notice[action] ?? "none";
          return (
            <Card key={action}>
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-display font-semibold">
                    {translate(PUNISH_NOTICE_ACTION_LABEL[action])}
                  </p>
                  <Badge className={cn("gap-1 px-2.5 py-1", LEVEL_BADGE[level])}>
                    {translate(PUNISH_NOTICE_LEVELS.find((l) => l.value === level)?.label ?? "")}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">
                    {translate("Nội dung thông báo sau khi bot")}{" "}
                    {action === "warn" ? "warn" : action}
                  </Label>
                  <Select
                    value={level}
                    disabled={saving}
                    onValueChange={(v) =>
                      save({
                        punishNotice: {
                          ban:
                            action === "ban"
                              ? (v as PunishNoticeLevel)
                              : (notice.ban as PunishNoticeLevel),
                          timeout:
                            action === "timeout"
                              ? (v as PunishNoticeLevel)
                              : (notice.timeout as PunishNoticeLevel),
                          kick:
                            action === "kick"
                              ? (v as PunishNoticeLevel)
                              : (notice.kick as PunishNoticeLevel),
                          warn:
                            action === "warn"
                              ? (v as PunishNoticeLevel)
                              : (notice.warn as PunishNoticeLevel),
                        },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PUNISH_NOTICE_LEVELS.map((l) => (
                        <SelectItem key={l.value} value={l.value}>
                          {translate(l.label)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="mt-3 rounded-lg bg-secondary/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                  {translate(PUNISH_NOTICE_LEVELS.find((l) => l.value === level)?.hint ?? "")}
                  <span className="mt-1 block font-mono text-[10px] text-foreground/80">
                    {previewFor(action, level)}
                  </span>
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        {translate("💡 Đây chính là embed")}{" "}
        <b className="text-foreground">{translate("duy nhất")}</b>{" "}
        {translate("bot gửi sau khi phạt — kể cả")}{" "}
        <b className="text-foreground">{translate("tự động")}</b>{" "}
        {translate("(chống nuke / auto-mod — Responsible moderator hiển thị là “Bot tự động”) lẫn")}{" "}
        <b className="text-foreground">{translate("thủ công")}</b> {translate("từ lệnh")}{" "}
        <code className="font-mono">/mod</code>{" "}
        {translate("(hiển thị tên người thực hiện). Lý do để trống → ghi “không có lý do”. Chọn")}{" "}
        <b>{translate("Không gửi tin nhắn")}</b>{" "}
        {translate(
          "→ bot không gửi embed nhưng dashboard vẫn ghi nhận case. Embed xóa tin / purge luôn đầy đủ.",
        )}{" "}
      </p>
    </div>
  );
}
