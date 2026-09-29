import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  FileText,
  LifeBuoy,
  MessageSquareWarning,
  Send,
  ShieldQuestion,
  Users,
  X,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Switch } from "../ui/switch";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import type { GuildData, TicketRow } from "../../lib/types";
import { getSessionToken } from "../../lib/discord";
import { dateLocale, translate } from "../../lib/i18n";
import PanelErrorBoundary from "../PanelErrorBoundary";
import TicketKindsCard from "./TicketKindsCard";

const TOKEN = () => getSessionToken();

/** Loại ticket — nhãn đi qua translate() nên không hardcode ở JSX. */
const KIND_LABEL: Record<string, string> = {
  appeal: "Khiếu nại",
  support: "Hỗ trợ chung",
};

/**
 * 3 tab: `open` (đang mở) · `closed` (đã đóng) · `locked` (đã lưu trữ).
 *
 * ⚠️ Thiếu tab `locked` thì transcript lưu xong là BIẾN MẤT khỏi dashboard:
 * bot lưu file rồi xoá kênh, bản ghi chuyển `locked` mà không nơi nào liệt kê
 * → staff mất đúng thứ họ cần đọc lại (28/09/2026).
 */
type Tab = "open" | "closed" | "locked";

/** Nội dung 1 transcript sau khi action đã tải + parse. */
type TranscriptData = {
  channelName: string;
  savedAt: number;
  messageCount: number;
  messages: { at: number; author: string; content: string; attachments: string[] }[];
};

export default function TicketPanel({ data }: { data: GuildData }) {
  const updateSettings = useMutation(api.guilds.updateSettings);
  const closeTicket = useMutation(api.tickets.closeTicket);
  const g = data.guild;

  const [tab, setTab] = useState<Tab>("open");
  // Nhãn loại tuỳ chỉnh do `TicketKindsCard` báo lên. Rỗng = card lỗi (chưa
  // deploy hàm mới) hoặc ticket cũ → rơi về `KIND_LABEL`, rồi tới mã khoá.
  const [kindLabels, setKindLabels] = useState<Record<string, string>>({});
  const kindLabelOf = (k: string) => kindLabels[k] ?? translate(KIND_LABEL[k] ?? k);
  // Ticket đang mở khung transcript (null = đóng). Chỉ chọn MỘT cái: transcript
  // có tới 200 tin, tải cả danh sách sẽ nhét vào RAM dashboard.
  const [transcriptOf, setTranscriptOf] = useState<TicketRow | null>(null);
  const tickets = useQuery(api.tickets.listTickets, {
    token: TOKEN(),
    guildId: g.discordId,
    status: tab,
  });
  // Số ticket đang mở phải lấy từ query TÓM TẮT, không đếm trên `tickets`:
  // `tickets` chỉ chứa đúng tab đang xem, nên đổi sang tab "Đã đóng" sẽ ra 0
  // ticket đang mở dù server đang có (đã từng hiện sai như vậy).
  const summary = useQuery(api.tickets.ticketSummary, {
    token: TOKEN(),
    guildId: g.discordId,
  });
  // Số liệu SLA — cửa sổ do người dùng chọn (7/30 ngày). Query riêng chứ
  // không tính lại từ `tickets`: `tickets` chỉ chứa đúng tab đang xem và bị
  // cắt còn LIST_LIMIT bản ghi → mọi trung bình tính từ đó là bịa.
  const [statsDays, setStatsDays] = useState(30);
  const stats = useQuery(api.tickets.ticketStats, {
    token: TOKEN(),
    guildId: g.discordId,
    days: statsDays,
  });

  // Category: Discord type 4 = danh mục. Chỉ danh mục mới chứa được kênh con.
  const categories = data.channels.filter((c) => c.type === 4);
  // Kênh CÔNG KHAI dán panel "Mở ticket" — loại 0 (text) và 5 (announcement).
  // Chọn nhầm danh mục (type 4) là cách quen thuộc nhất khiến bot dán panel
  // hỏng, nên danh mục không bao giờ xuất hiện trong danh sách này.
  const panelChannels = data.channels.filter((c) => c.type === 0 || c.type === 5);
  const staffRoles = data.roles.filter((r) => r.name !== "@everyone");
  const modRoleNames = g.modRoles
    .map((id) => data.roles.find((r) => r.roleId === id)?.name)
    .filter(Boolean)
    .join(", ");

  const staffRoleName = g.ticketStaffRoleId
    ? (data.roles.find((r) => r.roleId === g.ticketStaffRoleId)?.name ?? "?")
    : null;

  async function patch(p: Record<string, unknown>, msg?: string) {
    try {
      await updateSettings({ token: TOKEN(), guildId: g.discordId, ...p });
      if (msg) toast.success(msg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Lưu thất bại"));
    }
  }

  const openCount = summary?.openCount ?? 0;

  /** Màu lưu trong Convex phải là hex 6 chữ số (không `#`) — bot parse thẳng. */
  const validColor = (v: string | null | undefined) => /^[0-9a-fA-F]{6}$/.test(v ?? "");

  /** Lưu màu: bỏ `#`, chấp nhận cả dạng ngắn 3 ký tự. Rác → rỗng (màu mặc định). */
  function saveColor(raw: string) {
    const v = raw.trim().replace(/^#/, "");
    const next = /^[0-9a-fA-F]{6}$/.test(v)
      ? v.toLowerCase()
      : /^[0-9a-fA-F]{3}$/.test(v)
        ? v
            .split("")
            .map((c) => c + c)
            .join("")
            .toLowerCase()
        : "";
    if ((g.ticketOpenPanelColor ?? "") === next) return;
    patch({ ticketOpenPanelColor: next }, translate("Đã lưu màu panel"));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">
            {translate("Ticket — kênh riêng cho thành viên và ban quản trị")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {translate(
              "Mỗi lượt mở tạo một kênh riêng để thành viên hỏi đáp, báo cáo chuyện gì, hoặc khiếu nại khi bị phạt oan.",
            )}{" "}
          </p>
        </div>
        <Badge variant={g.ticketEnabled ? "default" : "secondary"} className="gap-1.5 px-3 py-1.5">
          <ShieldQuestion className="h-3.5 w-3.5" />
          {g.ticketEnabled
            ? translate("Đang bật · {p0} đang mở", { p0: openCount })
            : translate("Đang tắt")}
        </Badge>
      </div>

      <Card className={g.ticketEnabled ? "border-primary/30 bg-primary/5" : ""}>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <LifeBuoy className="h-5 w-5" />
            </span>
            <div>
              <p className="font-display font-semibold">{translate("Bật tính năng ticket")}</p>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                {translate(
                  "Thành viên dùng lệnh /ticket trong server, hoặc bấm nút trong tin nhắn riêng nếu đã bị ban. Bot cần quyền Quản lý kênh.",
                )}{" "}
              </p>
            </div>
          </div>
          <Switch
            checked={g.ticketEnabled}
            onCheckedChange={(v) =>
              patch({ ticketEnabled: v }, translate(v ? "Đã bật ticket" : "Đã tắt ticket"))
            }
          />
        </CardContent>
      </Card>

      {g.ticketEnabled && !g.ticketCategoryId && (
        <div className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground">
          {translate(
            "⚠️ Chưa chọn danh mục chứa ticket — thành viên sẽ không mở được ticket cho tới khi bạn chọn bên dưới.",
          )}{" "}
        </div>
      )}

      {g.ticketEnabled && (
        <>
          <Card>
            <CardContent className="grid gap-4 p-4 sm:p-5">
              <div className="grid gap-1.5">
                <Label>{translate("Danh mục chứa kênh ticket")}</Label>
                <Select
                  value={g.ticketCategoryId ?? "none"}
                  onValueChange={(v) =>
                    patch(
                      { ticketCategoryId: v === "none" ? "" : v },
                      translate("Đã cập nhật danh mục ticket"),
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={translate("Chọn danh mục…")}
                      className="text-foreground"
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{translate("— Chưa chọn —")}</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.channelId} value={c.channelId}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {categories.length === 0
                    ? translate(
                        "Server chưa có danh mục nào — tạo một danh mục trong Discord trước.",
                      )
                    : translate("Kênh ticket sẽ được tạo tự động bên trong danh mục này.")}
                </p>
              </div>

              <div className="grid gap-1.5">
                <Label className="flex items-center gap-1.5">
                  <MessageSquareWarning className="h-4 w-4 text-primary" />
                  {translate("Kênh dán panel mở ticket")}
                </Label>
                <Select
                  value={g.ticketPanelChannelId ?? "none"}
                  onValueChange={(v) =>
                    patch(
                      { ticketPanelChannelId: v === "none" ? "" : v },
                      translate("Đã chọn kênh dán panel — bot sẽ gửi trong ~2 phút"),
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={translate("Chọn kênh công khai…")}
                      className="text-foreground"
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{translate("— Chưa chọn —")}</SelectItem>
                    {panelChannels.map((c) => (
                      <SelectItem key={c.channelId} value={c.channelId}>
                        #{c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {translate(
                    "Thành viên bấm nút trong kênh này để tự mở ticket — không cần gõ lệnh /ticket. Chọn kênh xong bot tự dán trong ~2 phút.",
                  )}
                </p>

                {g.ticketPanelError && (
                  <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
                    <p className="font-semibold">
                      {translate("⚠️ Bot không dán được panel mở ticket")}
                    </p>
                    <p className="mt-0.5 text-xs opacity-90">{g.ticketPanelError}</p>
                    <p className="mt-1 text-[11px] opacity-70">
                      {g.ticketPanelErrorAt
                        ? new Date(g.ticketPanelErrorAt).toLocaleString(dateLocale())
                        : ""}{" "}
                      {translate('— hãy sửa lỗi rồi bấm "Gửi lại panel"')}
                    </p>
                  </div>
                )}

                {g.ticketPanelChannelId && (
                  <button
                    onClick={() =>
                      patch(
                        { ticketSendPanel: true },
                        translate("Đã yêu cầu bot dán panel mở ticket!"),
                      )
                    }
                    className="flex items-center gap-2 self-start rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <Send className="h-4 w-4" />
                    {translate("Gửi lại panel mở ticket vào kênh")}{" "}
                  </button>
                )}
              </div>

              <div className="grid gap-1.5">
                <Label className="flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-primary" />
                  {translate("Role xử lý ticket")}
                </Label>
                <Select
                  value={g.ticketStaffRoleId ?? "none"}
                  onValueChange={(v) =>
                    patch(
                      { ticketStaffRoleId: v === "none" ? "" : v },
                      translate("Đã cập nhật role xử lý ticket"),
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={translate("Chọn role…")}
                      className="text-foreground"
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{translate("— Dùng role mod —")}</SelectItem>
                    {staffRoles.map((r) => (
                      <SelectItem key={r.roleId} value={r.roleId}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {staffRoleName
                    ? translate("Hiện tại: {p0}", { p0: staffRoleName })
                    : translate(
                        "Chưa chọn — bot dùng role mod của server ({p0}). Chọn riêng khi người xử lý ticket khác người làm mod.",
                        { p0: modRoleNames || translate("chưa có role mod nào") },
                      )}
                </p>
              </div>

              <div className="grid gap-1.5">
                <Label>{translate("Loại ticket mặc định")}</Label>
                <Select
                  value={g.ticketDefaultKind === "appeal" ? "appeal" : "support"}
                  onValueChange={(v) =>
                    patch({ ticketDefaultKind: v }, translate("Đã đổi loại ticket mặc định"))
                  }
                >
                  <SelectTrigger>
                    <SelectValue className="text-foreground" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="support">
                      {translate("Hỗ trợ chung — hỏi đáp, báo cáo bất kỳ chuyện gì")}
                    </SelectItem>
                    <SelectItem value="appeal">
                      {translate("Khiếu nại — dành cho người bị phạt oan")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {translate(
                    "Thành viên vẫn chọn được loại khác khi gõ lệnh. Loại này chỉ là mặc định khi họ không chọn.",
                  )}{" "}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid gap-4 p-4 sm:p-5">
              <p className="font-display text-sm font-semibold">
                {translate("Giới hạn chống spam")}
              </p>
              <p className="text-sm text-muted-foreground">
                {translate(
                  "Không có giới hạn thì 1 người có thể spam hàng trăm kênh trong một đêm và làm chạm trần 500 kênh của Discord.",
                )}{" "}
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="ticket-max-open">
                    {translate("Tối đa ticket đang mở ({p0})", { p0: g.ticketMaxOpen })}
                  </Label>
                  <Input
                    id="ticket-max-open"
                    type="number"
                    min={1}
                    max={100}
                    defaultValue={g.ticketMaxOpen}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isNaN(n) && n >= 1 && n <= 100 && n !== g.ticketMaxOpen) {
                        patch({ ticketMaxOpen: n }, translate("Đã cập nhật giới hạn"));
                      }
                    }}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ticket-cooldown">
                    {translate("Chờ giữa 2 lượt mở ({p0} giờ)", { p0: g.ticketCooldownHours })}
                  </Label>
                  <Input
                    id="ticket-cooldown"
                    type="number"
                    min={0}
                    max={720}
                    defaultValue={g.ticketCooldownHours}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isNaN(n) && n >= 0 && n <= 720 && n !== g.ticketCooldownHours) {
                        patch({ ticketCooldownHours: n }, translate("Đã cập nhật thời gian chờ"));
                      }
                    }}
                  />
                </div>
              </div>

              <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-secondary/50 px-4 py-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <MessageSquareWarning className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">
                      {translate("Gửi tin nhắn riêng cho người bị ban")}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {translate(
                        "Kèm lý do ban và nút mở khiếu nại. Không có bước này, người bị ban không biết bot có lệnh gỡ ban.",
                      )}{" "}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={g.ticketDmOnBan}
                  onCheckedChange={(v) =>
                    patch(
                      { ticketDmOnBan: v },
                      translate(v ? "Sẽ gửi DM sau khi ban" : "Không gửi DM sau khi ban"),
                    )
                  }
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="ticket-close-note">
                  {translate("Ghi chú khi đóng ticket (tuỳ chọn)")}
                </Label>
                <Textarea
                  id="ticket-close-note"
                  rows={2}
                  defaultValue={g.ticketCloseNote ?? ""}
                  placeholder={translate("VD: Ticket đã được xử lý, cảm ơn bạn đã liên hệ.")}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if ((g.ticketCloseNote ?? "") !== v) {
                      patch({ ticketCloseNote: v }, translate("Đã lưu ghi chú"));
                    }
                  }}
                />
              </div>
            </CardContent>
          </Card>

          {/* ═══ Tuỳ chỉnh panel mở + lời dặn đầu kênh + DM khi mở ═══ */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{translate("Tuỳ chỉnh panel mở ticket")}</CardTitle>
              <CardDescription>
                {translate(
                  "Sửa tiêu đề, màu và nội dung panel thành viên thấy trước khi bấm nút. Bot tự dán lại trong khoảng 2 phút và xoá bản cũ — không cần bấm gì thêm.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-1.5 sm:grid-cols-[1fr_9rem]">
                <div className="grid gap-1.5">
                  <Label htmlFor="ticket-open-panel-title">
                    {translate("Tiêu đề panel (tuỳ chọn)")}
                  </Label>
                  <Input
                    id="ticket-open-panel-title"
                    maxLength={256}
                    defaultValue={g.ticketOpenPanelTitle ?? ""}
                    placeholder={translate("Cần trợ giúp?")}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if ((g.ticketOpenPanelTitle ?? "") !== v) {
                        patch({ ticketOpenPanelTitle: v }, translate("Đã lưu tiêu đề panel"));
                      }
                    }}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ticket-open-panel-color">{translate("Màu panel")}</Label>
                  <div className="flex items-center gap-2">
                    {/* Ô chọn màu ghi khi BLUR, không ghi khi kéo: onChange của
                        input[type=color] bắn liên tục mỗi bước kéo chuột, gọi
                        mutation mỗi bước là spam Convex vô ích. Cùng quy ước
                        defaultValue + onBlur như các ô khác trong file này. */}
                    <input
                      type="color"
                      aria-label={translate("Chọn màu panel")}
                      // `key` = giá trị đang lưu: ô này dùng defaultValue (không
                      // phản ánh state), nên bấm "Mặc định" hay gõ hex sai bị
                      // từ chối sẽ để màn hình vẫn hiện màu/mã CŨ → người dùng
                      // tưởng chưa đổi. Đổi key = remount = hiện đúng trạng thái.
                      key={`swatch-${g.ticketOpenPanelColor ?? "none"}`}
                      className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-1"
                      defaultValue={
                        validColor(g.ticketOpenPanelColor) ? g.ticketOpenPanelColor! : "#5865f2"
                      }
                      onBlur={(e) => saveColor(e.target.value)}
                    />
                    <Input
                      id="ticket-open-panel-color"
                      key={`hex-${g.ticketOpenPanelColor ?? "none"}`}
                      className="w-28 font-mono text-xs uppercase"
                      maxLength={7}
                      defaultValue={g.ticketOpenPanelColor ?? ""}
                      placeholder="#5865f2"
                      onBlur={(e) => saveColor(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        patch({ ticketOpenPanelColor: "" }, translate("Đã về màu mặc định"))
                      }
                    >
                      {translate("Mặc định")}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {translate("Mã hex 6 chữ số, ví dụ #5865f2. Ô trống = màu mặc định của bot.")}
                  </p>
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="ticket-open-panel-text">
                  {translate("Nội dung panel mở (tuỳ chọn)")}
                </Label>
                <Textarea
                  id="ticket-open-panel-text"
                  rows={3}
                  defaultValue={g.ticketOpenPanelText ?? ""}
                  placeholder={translate(
                    "Bấm nút bên dưới, kể lại vấn đề của bạn. {server} đang có {open} ticket chờ.",
                  )}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if ((g.ticketOpenPanelText ?? "") !== v) {
                      patch({ ticketOpenPanelText: v }, translate("Đã lưu nội dung panel mở"));
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  {translate(
                    "Dùng được: {server} tên server, {open} số ticket đang mở, {support} tên nút Hỗ trợ. Bỏ trống thì dùng nội dung mặc định.",
                  )}
                </p>
              </div>

              <div className="flex items-start justify-between gap-4 rounded-xl border border-border px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {translate('Hiện nút "Khiếu nại hình phạt"')}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {translate(
                      "Tắt nếu server bạn không dùng hình phạt — thành viên chỉ thấy một nút Hỗ trợ.",
                    )}
                  </p>
                </div>
                <Switch
                  checked={g.ticketShowAppealButton !== false}
                  onCheckedChange={(v) =>
                    patch(
                      { ticketShowAppealButton: v },
                      translate(v ? "Đã hiện nút Khiếu nại" : "Đã ẩn nút Khiếu nại"),
                    )
                  }
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="ticket-open-note">
                  {translate("Lời dặn dán ở đầu kênh ticket (tuỳ chọn)")}
                </Label>
                <Textarea
                  id="ticket-open-note"
                  rows={3}
                  defaultValue={g.ticketOpenNote ?? ""}
                  placeholder={translate(
                    "Chào {user}! Bạn đang ở ticket #{number} của {server}. Staff phản hồi trong 24 giờ.",
                  )}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if ((g.ticketOpenNote ?? "") !== v) {
                      patch({ ticketOpenNote: v }, translate("Đã lưu lời dặn đầu kênh"));
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  {translate(
                    "Dán TRƯỚC nội dung khiếu nại, cho cả người mở lẫn staff đọc. Dùng được: {user} tên người mở, {number} số ticket, {server} tên server.",
                  )}
                </p>
              </div>

              <div className="flex items-start justify-between gap-4 rounded-xl border border-border px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{translate("Gửi DM cho người mở ticket")}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {translate(
                      "DM kèm link thẳng tới kênh ticket vừa tạo. Người đã tắt tin nhắn riêng sẽ không nhận được — ticket vẫn mở bình thường.",
                    )}
                  </p>
                </div>
                <Switch
                  checked={g.ticketDmOnOpen !== false}
                  onCheckedChange={(v) =>
                    patch(
                      { ticketDmOnOpen: v },
                      translate(v ? "Sẽ DM khi mở ticket" : "Không DM khi mở ticket"),
                    )
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* ═══ Tự đóng + panel + role tag ═══ */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{translate("Tự động dọn & phân công")}</CardTitle>
              <CardDescription>
                {translate(
                  "Kênh ticket không ai trả lời sẽ tự đóng. Khi đóng đủ lâu, bot lưu toàn bộ nội dung rồi mới xoá kênh — không bao giờ xoá trước khi lưu.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-1.5 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="ticket-idle-hours">
                    {translate("Tự đóng sau (giờ không ai chat)")}
                  </Label>
                  <Input
                    id="ticket-idle-hours"
                    type="number"
                    min={0}
                    max={720}
                    defaultValue={g.ticketIdleHours ?? 24}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n)) return;
                      if ((g.ticketIdleHours ?? 24) === n) return;
                      patch(
                        { ticketIdleHours: Math.max(0, Math.min(720, Math.floor(n))) },
                        n > 0 ? translate("Đã lưu thời gian tự đóng") : translate("Đã tắt tự đóng"),
                      );
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    {translate("0 = tắt. Tối đa 720 giờ (30 ngày). Mặc định 24 giờ.")}
                  </p>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ticket-grace-hours">
                    {translate("Giữ kênh sau khi đóng (giờ)")}
                  </Label>
                  <Input
                    id="ticket-grace-hours"
                    type="number"
                    min={1}
                    max={720}
                    defaultValue={g.ticketCloseGraceHours ?? 24}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n)) return;
                      const v = Math.max(1, Math.min(720, Math.floor(n)));
                      if ((g.ticketCloseGraceHours ?? 24) === v) return;
                      patch({ ticketCloseGraceHours: v }, translate("Đã lưu thời gian giữ kênh"));
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    {translate("Sau khoảng này bot lưu transcript rồi xoá kênh. Tối thiểu 1 giờ.")}
                  </p>
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="ticket-panel-text">
                  {translate("Nội dung panel trong kênh ticket (tuỳ chọn)")}
                </Label>
                <Textarea
                  id="ticket-panel-text"
                  rows={2}
                  defaultValue={g.ticketPanelText ?? ""}
                  placeholder={translate(
                    "Chào {user}! Kênh này dành riêng cho bạn — staff sẽ phản hồi sớm.",
                  )}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if ((g.ticketPanelText ?? "") !== v) {
                      patch({ ticketPanelText: v }, translate("Đã lưu nội dung panel"));
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  {translate(
                    "Có thể dùng: {user} tên người mở, {number} số ticket, {kind} loại, {idle} giờ tự đóng. Bỏ trống thì dùng mặc định.",
                  )}
                </p>
              </div>

              <div className="grid gap-1.5">
                <Label>{translate("Tag role khi mở ticket (tối đa 3)")}</Label>
                <p className="text-xs text-muted-foreground">
                  {translate(
                    "Role này được nhắc mỗi khi có ticket mới. Để trống nếu không muốn ai bị tag.",
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  {staffRoles.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {translate("Chưa có role nào trong server.")}
                    </p>
                  ) : (
                    staffRoles.map((r) => {
                      const picked = (g.ticketPingRoleIds ?? []).includes(r.roleId);
                      return (
                        <Button
                          key={r.roleId}
                          type="button"
                          size="sm"
                          variant={picked ? "default" : "outline"}
                          onClick={() => {
                            const cur = g.ticketPingRoleIds ?? [];
                            const next = picked
                              ? cur.filter((x: string) => x !== r.roleId)
                              : [...cur, r.roleId].slice(0, 3);
                            patch({ ticketPingRoleIds: next }, translate("Đã lưu role được tag"));
                          }}
                        >
                          {r.name}
                        </Button>
                      );
                    })
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          {/* ═══ Mẫu kênh ticket (29/09/2026) ═══ */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{translate("Mẫu kênh ticket")}</CardTitle>
              <CardDescription>
                {translate(
                  "Mỗi kênh ticket mở ra sẽ theo mẫu này. Bỏ trống mọi ô thì bot dùng cách cũ: tên ticket-<số>, chỉ staff và người mở nhìn thấy.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="ticket-channel-template">{translate("Mẫu tên kênh")}</Label>
                <Input
                  id="ticket-channel-template"
                  placeholder="{kind}-{number}"
                  defaultValue={g.ticketChannelTemplate ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value.trim().slice(0, 100);
                    if (v === (g.ticketChannelTemplate ?? "")) return;
                    patch({ ticketChannelTemplate: v }, translate("Đã lưu mẫu tên kênh"));
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  {translate("Dùng được:")} <code className="font-mono">{"{number}"}</code>{" "}
                  {translate("số ticket,")} <code className="font-mono">{"{user}"}</code>{" "}
                  {translate("tên người mở,")} <code className="font-mono">{"{kind}"}</code>{" "}
                  {translate("loại. Tự động bỏ dấu và ký tự lạ.")}
                </p>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="ticket-slowmode">
                  {translate("Slowmode trong kênh ticket (giây)")}
                </Label>
                <Input
                  id="ticket-slowmode"
                  type="number"
                  min={0}
                  max={21600}
                  defaultValue={g.ticketSlowmodeSec ?? 0}
                  onBlur={(e) => {
                    const n = Math.max(0, Math.min(21600, Math.floor(Number(e.target.value)) || 0));
                    if (n === (g.ticketSlowmodeSec ?? 0)) return;
                    patch({ ticketSlowmodeSec: n }, translate("Đã lưu slowmode"));
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  {translate("0 = không có. Tối đa 21600 giây (6 giờ).")}
                </p>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="ticket-budget">{translate("Ngân sách tin nhắn mỗi kênh")}</Label>
                <Input
                  id="ticket-budget"
                  type="number"
                  min={0}
                  max={1000}
                  defaultValue={g.ticketMessageBudget ?? 0}
                  onBlur={(e) => {
                    const n = Math.max(0, Math.min(1000, Math.floor(Number(e.target.value)) || 0));
                    if (n === (g.ticketMessageBudget ?? 0)) return;
                    patch({ ticketMessageBudget: n }, translate("Đã lưu ngân sách tin nhắn"));
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  {translate(
                    "Vượt thì bot tự đóng kênh (nội dung đã lưu trước). 0 = không giới hạn. Dùng để chặn 1 người spam rồi bỏ mặc.",
                  )}
                </p>
              </div>

              <label className="flex items-start gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={g.ticketChannelPublic === true}
                  onChange={(e) =>
                    patch(
                      { ticketChannelPublic: e.target.checked },
                      translate("Đã lưu quyền xem kênh ticket"),
                    )
                  }
                />
                <span>
                  {translate("Cho @everyone nhìn thấy kênh ticket")}
                  <span className="block text-xs text-muted-foreground">
                    {translate(
                      "Tắt (mặc định) là chỉ staff và người mở thấy — khiếu nại mà ai đọc được thì người dùng không dám kêu. Bật nếu server muốn ticket công khai kiểu diễn đàn.",
                    )}
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={g.ticketCategoryPerKind === true}
                  onChange={(e) =>
                    patch(
                      { ticketCategoryPerKind: e.target.checked },
                      translate("Đã lưu cách chia danh mục"),
                    )
                  }
                />
                <span>
                  {translate("Tạo danh mục con riêng cho từng loại ticket")}
                  <span className="block text-xs text-muted-foreground">
                    {translate(
                      "Kênh ticket sẽ nằm trong danh mục con theo loại, thay vì dồn thẳng vào danh mục đã chọn.",
                    )}
                  </span>
                </span>
              </label>
            </CardContent>
          </Card>
        </>
      )}

      {/* ═══ DANH SÁCH LOẠI TICKET TUỲ CHỈNH (29/09/2026) ═══
          Bọc `PanelErrorBoundary` RIÊNG cho card này: `api.ticketKinds.*` là
          hàm mới, nếu backend chưa deploy kịp thì query ném lỗi — không có
          boundary riêng thì lỗi đó lan ra cả tab và mất luôn danh sách ticket
          + số liệu, tức 1 hàm chưa deploy làm mất cả tính năng cũ. */}
      {g.ticketEnabled ? (
        <PanelErrorBoundary>
          <TicketKindsCard
            data={data}
            onKindsLoaded={(list) =>
              setKindLabels(Object.fromEntries(list.map((k) => [k.key, k.label])))
            }
          />
        </PanelErrorBoundary>
      ) : null}

      <TicketStatsCard stats={stats} days={statsDays} onDays={setStatsDays} />

      <Card>
        <CardContent className="p-4 sm:p-5">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList>
              <TabsTrigger value="open">{translate("Đang mở")}</TabsTrigger>
              <TabsTrigger value="closed">{translate("Đã đóng")}</TabsTrigger>
              <TabsTrigger value="locked">{translate("Đã lưu trữ")}</TabsTrigger>
            </TabsList>

            {(["open", "closed", "locked"] as const).map((t) => (
              <TabsContent key={t} value={t} className="mt-4">
                <TicketList
                  rows={tickets}
                  statusFilter={t}
                  guildId={g.discordId}
                  kindLabelOf={kindLabelOf}
                  onViewTranscript={setTranscriptOf}
                  onClose={async (row) => {
                    try {
                      await closeTicket({
                        token: TOKEN(),
                        guildId: g.discordId,
                        ticketId: row.id as never,
                        // Ghi chú "khi đóng ticket" đã cấu hình ở trên — dùng làm
                        // lý do mặc định. Không có nó thì cấu hình đó chỉ là
                        // một ô text lưu vào DB rồi không ai đọc.
                        reason: g.ticketCloseNote || undefined,
                      });
                      toast.success(translate("Đã đóng ticket #{p0}", { p0: row.number }));
                    } catch (e) {
                      toast.error(
                        e instanceof Error ? e.message : translate("Đóng ticket thất bại"),
                      );
                    }
                  }}
                />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <TranscriptDialog
        ticket={transcriptOf}
        guildId={g.discordId}
        onClose={() => setTranscriptOf(null)}
      />
    </div>
  );
}

/** Dữ liệu `ticketStats` trả về (null = query chưa xong). */
type TicketStats =
  | {
      days: number;
      total: number;
      open: number;
      closed: number;
      avgFirstResponseMs: number | null;
      firstResponseCount: number;
      avgResolutionMs: number | null;
      resolutionCount: number;
      unclaimedClosed: number;
      appeals: number;
      appealsUnbanned: number;
      unbanRate: number | null;
    }
  | null
  | undefined;

/** ms → câu chữ ngắn nhất đọc được (≤ 1 phút vẫn hiện phút, tránh "0 giờ"). */
function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return translate("{p0} phút", { p0: minutes });
  const hours = Math.round(minutes / 6) / 10;
  return translate("{p0} giờ", { p0: hours });
}

/**
 * Số liệu SLA — câu trả lời cho "nhân viên có phản hồi kịp không?".
 *
 * Trước đây panel chỉ liệt kê từng ticket, chủ server phải tự đếm tay và
 * không ai phát hiện được việc ticket đóng mà không ai nhận (28/09/2026).
 *
 * Mẫu bằng 0 hiện "chưa đủ dữ liệu" chứ không phải 0 phút: trung bình của
 * không có mẫu là 0 phút theo quy ước toán, nhưng đọc lên là "phản hồi ngay
 * lập tức" — một lời nói dối.
 */
function TicketStatsCard({
  stats,
  days,
  onDays,
}: {
  stats: TicketStats;
  days: number;
  onDays: (d: number) => void;
}) {
  const tiles: { label: string; value: string }[] = [
    { label: "Ticket trong kỳ", value: stats ? String(stats.total) : "—" },
    { label: "Đang mở", value: stats ? String(stats.open) : "—" },
    {
      label: "Chờ phản hồi đầu",
      value: stats?.avgFirstResponseMs != null ? formatDuration(stats.avgFirstResponseMs) : "—",
    },
    {
      label: "Thời gian xử lý",
      value: stats?.avgResolutionMs != null ? formatDuration(stats.avgResolutionMs) : "—",
    },
    {
      label: "Đóng mà không ai nhận",
      value: stats ? String(stats.unclaimedClosed) : "—",
    },
    {
      label: "Khiếu nại được gỡ ban",
      value:
        stats?.unbanRate != null
          ? translate("{p0}%", { p0: Math.round(stats.unbanRate * 100) })
          : "—",
    },
  ];
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">{translate("Số liệu xử lý ticket")}</CardTitle>
          <CardDescription>
            {translate(
              "Chỉ tính ticket đã có người nhận hoặc đã đóng. Phản hồi đầu tính từ lúc mở tới lúc staff bấm “Nhận việc”.",
            )}
          </CardDescription>
        </div>
        <Select value={String(days)} onValueChange={(v) => onDays(Number(v))}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">{translate("7 ngày")}</SelectItem>
            <SelectItem value="30">{translate("30 ngày")}</SelectItem>
            <SelectItem value="90">{translate("90 ngày")}</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-xl border border-border px-3 py-2">
              <p className="truncate text-xs text-muted-foreground">{translate(t.label)}</p>
              <p className="font-display text-lg font-semibold">{t.value}</p>
            </div>
          ))}
        </div>
        {stats && stats.total > 0 && stats.closed > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            {translate("{p0} khiếu nại trong kỳ, {p1} kết thúc bằng gỡ ban.", {
              p0: stats.appeals,
              p1: stats.appealsUnbanned,
            })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Khung xem transcript — nơi DUY NHẤT đọc lại được nội dung ticket sau khi bot
 * đã lưu rồi xoá kênh.
 *
 * Query CHỈ chạy khi đang mở khung (con bên trong được mount có điều kiện):
 * truyền `ticketId: ""` sẽ ném lỗi validator của Convex và làm hỏng cả
 * panel, chứ không chỉ khung này.
 */
function TranscriptDialog({
  ticket,
  guildId,
  onClose,
}: {
  ticket: TicketRow | null;
  guildId: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!ticket} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {translate("Transcript ticket #{p0}", { p0: ticket?.number ?? 0 })}
          </DialogTitle>
        </DialogHeader>
        {ticket && <TranscriptBody ticket={ticket} guildId={guildId} />}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {translate("Đóng")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Nội dung khung: tải transcript (action) + nút tải file JSON gốc. */
function TranscriptBody({ ticket, guildId }: { ticket: TicketRow; guildId: string }) {
  const runTranscript = useAction(api.tickets.ticketTranscript);
  const runLink = useQuery(api.tickets.ticketTranscriptUrl, {
    token: TOKEN(),
    guildId,
    ticketId: ticket.id,
  });
  const [transcript, setTranscript] = useState<TranscriptData | null | undefined>(undefined);
  useEffect(() => {
    const alive = { current: true };
    setTranscript(undefined);
    runTranscript({ token: TOKEN(), guildId, ticketId: ticket.id })
      .then((r) => {
        if (alive.current) setTranscript(r);
      })
      .catch((e) => {
        if (alive.current) {
          toast.error(e instanceof Error ? e.message : translate("Không đọc được transcript"));
          setTranscript(null);
        }
      });
  }, [ticket.id, guildId]);
  return (
    <>
      <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
        {transcript === undefined ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {translate("Đang tải transcript…")}
          </p>
        ) : transcript === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {translate("Chưa có transcript cho ticket này.")}
          </p>
        ) : transcript.messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {translate("Transcript rỗng — kênh không có tin nhắn nào.")}
          </p>
        ) : (
          transcript.messages.map((m, i) => (
            <div key={i} className="rounded-lg border border-border bg-secondary/40 p-2">
              <p className="text-[11px] text-muted-foreground">
                {m.author} · {new Date(m.at).toLocaleString(dateLocale())}
                {m.attachments.length > 0
                  ? ` · ${translate("{p0} tệp đính kèm", { p0: m.attachments.length })}`
                  : ""}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{m.content || "—"}</p>
            </div>
          ))
        )}
      </div>
      {runLink?.url && (
        <Button asChild variant="outline" size="sm" className="self-end">
          <a href={runLink.url} target="_blank" rel="noreferrer">
            {translate("Tải file JSON")}
          </a>
        </Button>
      )}
    </>
  );
}

/** Danh sách ticket + nút đóng từ web. */
function TicketList({
  rows,
  statusFilter,
  guildId,
  kindLabelOf,
  onClose,
  onViewTranscript,
}: {
  rows: TicketRow[] | undefined;
  statusFilter: Tab;
  guildId: string;
  /**
   * Hàm tra nhãn loại, đóng bên trong TicketPanel vì nhãn tuỳ chỉnh do
   * `TicketKindsCard` nạp. Rơi về 2 nhãn cứng rồi tới mã khoá nếu chưa nạp
   * được (card lỗi, hoặc ticket của loại đã bị xoá).
   */
  kindLabelOf: (kind: string) => string;
  onClose: (row: TicketRow) => void;
  onViewTranscript: (row: TicketRow) => void;
}) {
  if (rows === undefined) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">{translate("Đang tải…")}</p>
    );
  }
  const list = rows.filter((r) => r.status === statusFilter);
  if (list.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {statusFilter === "open"
          ? translate("Không có ticket nào đang mở.")
          : statusFilter === "closed"
            ? translate("Chưa có ticket nào đã đóng.")
            : translate("Chưa có ticket nào đã lưu trữ.")}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {list.map((t) => (
        <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">#{t.number}</span>
              <Badge variant="outline" className="gap-1">
                <ShieldQuestion className="h-3 w-3" />
                {kindLabelOf(t.kind)}
              </Badge>
              {t.claimedByName ? (
                <Badge className="gap-1">
                  <Users className="h-3 w-3" />
                  {translate("Đã có người nhận")} · {t.claimedByName}
                </Badge>
              ) : statusFilter === "open" ? (
                <Badge variant="secondary" className="gap-1">
                  <Users className="h-3 w-3" />
                  {translate("Chờ nhận")}
                </Badge>
              ) : null}
              {t.hasTranscript ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-2 text-xs"
                  onClick={() => onViewTranscript(t)}
                >
                  <FileText className="h-3 w-3" />
                  {translate("Xem transcript")}
                </Button>
              ) : null}
              <span className="truncate text-sm font-medium">
                {t.openerName} ·{" "}
                <span className="text-xs text-muted-foreground">
                  {new Date(t.createdAt).toLocaleString(dateLocale())}
                </span>
              </span>
            </div>
            {t.body && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.body}</p>}
            {t.fields.length > 0 && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {t.fields.map((f) => f.label + ": " + f.value).join(" · ")}
              </p>
            )}
            {t.openError && (
              <p className="mt-1 text-xs text-destructive">
                {translate("Lỗi mở kênh: {p0}", { p0: t.openError })}
              </p>
            )}
            {t.closedByName && (
              <p className="mt-1 text-xs text-muted-foreground">
                {translate("Đóng bởi {p0}", { p0: t.closedByName })}
                {t.unbanned ? translate(" · đã gỡ ban") : ""}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {t.channelId !== "pending" && (
              <Button asChild variant="outline" size="sm">
                {/* Link phải kèm guildId. Dạng link dùng `@me` chỉ dành cho
                    lúc không biết server nào; ở đây biết rõ → bấm ra trang
                    trắng. (test-web-contracts chặn hồi quy dạng link cũ) */}
                <a
                  href={`https://discord.com/channels/${guildId}/${t.channelId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {translate("Mở kênh")}
                </a>
              </Button>
            )}
            {t.status === "open" && (
              <Button variant="ghost" size="sm" onClick={() => onClose(t)}>
                <X className="h-3.5 w-3.5" />
                {translate("Đóng")}
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
