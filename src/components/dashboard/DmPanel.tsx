import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { Mail, Send } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { getSessionToken } from "../../lib/discord";
import type { GuildData } from "../../lib/types";

import { dateLocale, translate } from "../../lib/i18n";
export default function DmPanel({ data }: { data: GuildData }) {
  const requestDm = useMutation(api.hidden.requestDm);
  const [userId, setUserId] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!/^\d{15,20}$/.test(userId.trim())) {
      return toast.error(translate("ID người dùng không hợp lệ (15–20 chữ số)"));
    }
    setSending(true);
    try {
      await requestDm({
        token: getSessionToken(),
        guildId: data.guild.discordId,
        userId: userId.trim(),
        message,
      });
      toast.success(translate("Đã gửi yêu cầu — bot gửi DM trong khoảng 1 phút 💌"));
      setUserId("");
      setMessage("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Gửi thất bại"));
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <h3 className="flex items-center gap-2 font-display font-semibold">
          <Mail className="h-4 w-4 text-primary" /> {translate("Gửi tin nhắn riêng (DM)")}{" "}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {translate(
            "Nhập ID người dùng Discord và nội dung, bot sẽ nhắn riêng cho họ. (Bật Chế độ nhà phát triển trong Discord → chuột phải tên người dùng → Sao chép ID người dùng)",
          )}{" "}
        </p>
        <div className="mt-4 grid gap-3">
          <div className="grid gap-1.5">
            <Label>{translate("ID người dùng")}</Label>
            <Input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="VD: 123456789012345678"
              maxLength={20}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>{translate("Nội dung tin nhắn")}</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={translate(
                "VD: Chào bạn, bạn đã thắng giải thưởng của server chúng mình 🎁",
              )}
              maxLength={2000}
              rows={3}
            />
          </div>
          <Button onClick={handleSend} disabled={sending || !userId.trim() || !message.trim()}>
            {sending ? (
              translate("Đang gửi…")
            ) : (
              <>
                <Send className="h-4 w-4" /> {translate("Gửi DM")}{" "}
              </>
            )}
          </Button>
          {/* Lỗi DM gần nhất — bot báo lại thay vì im lặng */}
          {data.guild.dmError && (
            <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              <p className="font-semibold">{translate("⚠️ DM gần nhất thất bại")}</p>
              {/* xem ReactionRolesPanel: translate() giữ nguyên lỗi lạ (Discord/
                  Convex), dịch lỗi do backend tự sinh. */}
              <p className="mt-0.5 opacity-90">{translate(data.guild.dmError)}</p>
              {data.guild.dmErrorAt ? (
                <p className="mt-0.5 opacity-70">
                  {new Date(data.guild.dmErrorAt).toLocaleString(dateLocale())}{" "}
                  {translate("— thường do người nhận tắt DM hoặc không dùng chung server với bot")}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
