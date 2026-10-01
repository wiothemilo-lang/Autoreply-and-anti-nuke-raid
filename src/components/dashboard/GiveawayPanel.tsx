import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { Gift, Plus, Timer, Trash2, Trophy, Users } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Switch } from "../ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { getSessionToken } from "../../lib/discord";
import type { Giveaway, GuildData } from "../../lib/types";

import { dateLocale, translate } from "../../lib/i18n";
const DURATION_PRESETS = [
  { label: "5 phút", minutes: 5 },
  { label: "30 phút", minutes: 30 },
  { label: "1 giờ", minutes: 60 },
  { label: "1 ngày", minutes: 1440 },
  { label: "3 ngày", minutes: 4320 },
  { label: "7 ngày", minutes: 10080 },
];

const TEMPLATE_PRESETS = [
  { value: "default", label: "🎉 Mặc định", desc: "Hồng anh đào, lời chào cơ bản" },
  { value: "luxury", label: "✨ Sang trọng", desc: "Vàng, chữ GIVEAWAY SANG TRỌNG" },
  { value: "vip", label: "💎 VIP", desc: "Tím, chữ GIVEAWAY VIP" },
  { value: "simple", label: "🎁 Nhanh gọn", desc: "Xanh lá, chữ QUÀ TẶNG" },
];

export default function GiveawayPanel({ data }: { data: GuildData }) {
  const createGiveaway = useMutation(api.hidden.createGiveaway);
  const cancelGiveaway = useMutation(api.hidden.cancelGiveaway);

  const textChannels = data.channels.filter((c) => c.type === 0 || c.type === 5);
  const roleOptions = data.roles.filter((r) => r.name !== "@everyone");
  const token = getSessionToken();
  const guildId = data.guild.discordId;

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [prize, setPrize] = useState("");
  const [winnerCount, setWinnerCount] = useState(1);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [dmWinners, setDmWinners] = useState(true);
  const [requiredRoleId, setRequiredRoleId] = useState("none");
  const [prizeRoleId, setPrizeRoleId] = useState("none");
  const [template, setTemplate] = useState("default");
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [endMessage, setEndMessage] = useState("");
  const [channelId, setChannelId] = useState("");
  const [saving, setSaving] = useState(false);

  const active = data.giveaways.filter((g) => g.status === "active");
  const past = data.giveaways.filter((g) => g.status !== "active").slice(0, 10);

  function channelName(id: string) {
    return textChannels.find((c) => c.channelId === id)?.name ?? translate("kênh đã xóa");
  }

  async function handleCreate() {
    setSaving(true);
    try {
      await createGiveaway({
        token,
        guildId,
        channelId,
        title,
        prize,
        winnerCount,
        durationMinutes,
        dmWinners,
        requiredRoleId: requiredRoleId === "none" ? undefined : requiredRoleId,
        prizeRoleId: prizeRoleId === "none" ? undefined : prizeRoleId,
        template,
        message: message.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        endMessage: endMessage.trim() || undefined,
      });
      toast.success(translate("Đã tạo giveaway — bot gửi trong khoảng 1 phút 🎉"));
      setOpen(false);
      setTitle("");
      setPrize("");
      setChannelId("");
      setWinnerCount(1);
      setDurationMinutes(60);
      setMessage("");
      setImageUrl("");
      setEndMessage("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Tạo thất bại"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-display font-semibold">
              <Gift className="h-4 w-4 text-primary" /> Giveaway 🎉
            </h3>
            <p className="text-sm text-muted-foreground">
              {translate(
                "Chọn mẫu tin nhắn, thêm ảnh, viết lời dẫn và cấp role thưởng tự động — bot chọn người thắng rồi thông báo.",
              )}{" "}
            </p>
          </div>
          <Button onClick={() => setOpen(true)} disabled={active.length >= 5}>
            <Plus className="h-4 w-4" /> {translate("Tạo giveaway")}{" "}
          </Button>
        </div>

        {active.length > 0 && (
          <ul className="mt-4 space-y-2">
            {active.map((g: Giveaway) => (
              <li
                key={g._id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    🎉 {g.title}
                    {!g.messageId ? (
                      g.postError ? (
                        <Badge className="border-danger/40 bg-danger/10 text-danger">
                          {translate("⚠️ lỗi gửi")}{" "}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">{translate("⏳ chờ bot gửi")}</Badge>
                      )
                    ) : (
                      <Badge variant="success">{translate("đang chạy")}</Badge>
                    )}
                  </p>
                  {g.postError && (
                    <p className="mt-1 rounded-md border border-danger/30 bg-danger/10 px-2 py-1 text-xs text-danger">
                      {/* xem ReactionRolesPanel: translate() giữ nguyên lỗi lạ,
                          dịch lỗi do backend tự sinh. */}
                      {translate("⚠️ Bot không gửi được giveaway:")} {translate(g.postError)}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <Timer className="mr-1 inline h-3 w-3" />
                    {translate("kết thúc")}{" "}
                    {g.endsAt <= Date.now()
                      ? translate("bất cứ lúc nào")
                      : new Date(g.endsAt).toLocaleString(dateLocale())}
                    {" · "}
                    <Users className="mr-1 inline h-3 w-3" />
                    {g.entriesCount} {translate("người tham gia")} · {g.winnerCount}{" "}
                    {translate("người thắng")}
                    {g.prizeRoleId ? translate(" · 🎖️ cấp role thưởng") : ""}
                    {g.dmWinners ? translate(" · DM người thắng") : ""}
                    {g.imageUrl ? translate(" · 🖼️ có ảnh") : ""}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (!confirm(translate('Hủy giveaway "{p0}"?', { p0: g.title }))) return;
                    try {
                      await cancelGiveaway({ token, guildId, giveawayId: g._id });
                      toast.success(translate("Đã hủy giveaway"));
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : translate("Hủy thất bại"));
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" /> {translate("Hủy")}{" "}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {past.length > 0 && (
          <ul className="mt-4 space-y-2">
            {past.map((g) => (
              <li
                key={g._id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {g.title}
                    <Badge variant={g.status === "ended" ? "success" : "secondary"}>
                      {translate(g.status === "ended" ? "đã kết thúc" : "đã hủy")}
                    </Badge>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    #{channelName(g.channelId)} · {g.entriesCount} {translate("lượt tham gia")}
                    {g.winners.length > 0 && (
                      <>
                        {" · "}
                        <Trophy className="mr-1 inline h-3 w-3" />
                        {g.winners.map((w) => w.username).join(", ")}
                      </>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {data.giveaways.length === 0 && (
          <p className="mt-4 rounded-lg bg-secondary/40 px-3 py-3 text-sm text-muted-foreground">
            {translate("Chưa có giveaway nào. Tạo cái đầu tiên để chúc mừng thành viên 🎀")}{" "}
          </p>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{translate("Tạo giveaway mới")}</DialogTitle>
              <DialogDescription>
                {translate(
                  "Bot gửi embed giveaway kèm phản ứng 🎉 theo mẫu bạn chọn (thêm ảnh nếu muốn). Hết giờ, bot tự chọn người thắng, cấp role thưởng (nếu có) và thông báo.",
                )}{" "}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>{translate("Tên giveaway")}</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={translate("VD: Nitro 1 tháng")}
                  maxLength={100}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{translate("Giải thưởng (hiển thị trong embed)")}</Label>
                <Textarea
                  value={prize}
                  onChange={(e) => setPrize(e.target.value)}
                  placeholder={translate("VD: 1 tháng Nitro Boost 🚀")}
                  maxLength={2000}
                  rows={2}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{translate("Kênh gửi giveaway")}</Label>
                <Select value={channelId} onValueChange={setChannelId}>
                  <SelectTrigger>
                    <SelectValue placeholder={translate("Chọn kênh…")} />
                  </SelectTrigger>
                  <SelectContent>
                    {textChannels.map((c) => (
                      <SelectItem key={c.channelId} value={c.channelId}>
                        #{c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>{translate("Số người thắng")}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={winnerCount}
                    onChange={(e) =>
                      setWinnerCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>{translate("Thời lượng")}</Label>
                  <Select
                    value={String(durationMinutes)}
                    onValueChange={(v) => setDurationMinutes(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATION_PRESETS.map((d) => (
                        <SelectItem key={d.minutes} value={String(d.minutes)}>
                          {translate(d.label)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>{translate("Yêu cầu role để tham gia (tùy chọn)")}</Label>
                <Select value={requiredRoleId} onValueChange={setRequiredRoleId}>
                  <SelectTrigger>
                    <SelectValue placeholder={translate("Mọi thành viên")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{translate("— Mọi thành viên —")}</SelectItem>
                    {roleOptions.map((r) => (
                      <SelectItem key={r.roleId} value={r.roleId}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>{translate("🎖️ Role tự cấp cho người thắng (tùy chọn)")}</Label>
                <Select value={prizeRoleId} onValueChange={setPrizeRoleId}>
                  <SelectTrigger>
                    <SelectValue placeholder={translate("Không cấp role")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{translate("— Không cấp role —")}</SelectItem>
                    {roleOptions.map((r) => (
                      <SelectItem key={r.roleId} value={r.roleId}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>{translate("Mẫu tin nhắn giveaway")}</Label>
                <Select value={template} onValueChange={setTemplate}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_PRESETS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {translate(t.label)} — {translate(t.desc)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>
                  {translate("Lời dẫn tùy chỉnh (hiện ở đầu embed, để trống = dùng giải thưởng)")}
                </Label>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={translate(
                    "VD: Chào mừng đến với server! Tham gia ngay để có cơ hội nhận…",
                  )}
                  maxLength={2000}
                  rows={2}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{translate("Ảnh nền embed (tùy chọn)")}</Label>
                <Input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder={translate("https://… (đường dẫn ảnh)")}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{translate("Lời chúc mừng riêng khi gửi DM người thắng (tùy chọn)")}</Label>
                <Textarea
                  value={endMessage}
                  onChange={(e) => setEndMessage(e.target.value)}
                  placeholder={translate("VD: Xin chúc mừng! Bạn là người may mắn nhất…")}
                  maxLength={1000}
                  rows={2}
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2.5">
                <div className="text-sm">
                  <p className="font-medium">{translate("💌 DM người thắng")}</p>
                  <p className="text-xs text-muted-foreground">
                    {translate("Bot nhắn riêng kèm giải thưởng cho từng người thắng")}{" "}
                  </p>
                </div>
                <Switch checked={dmWinners} onCheckedChange={setDmWinners} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={saving || !title || !prize || !channelId}>
                {translate(saving ? "Đang tạo…" : "Tạo giveaway 🎉")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
