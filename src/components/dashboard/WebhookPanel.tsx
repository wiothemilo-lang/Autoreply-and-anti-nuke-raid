import { useState, useCallback } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  Send,
  Plus,
  Trash2,
  Palette,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Link,
  Image,
  Type,
  MessageSquare,
  User,
  Clock,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { toast } from "sonner";
import { friendlyConvexError } from "../../lib/convexError";
import { toastConvexError } from "../../lib/toastError";
import type { GuildData } from "../../lib/types";
import { getSessionToken } from "../../lib/discord";

import { dateLocale, translate } from "../../lib/i18n";
const TOKEN = () => getSessionToken();

/* ======================== Types ======================== */

interface EmbedField {
  name: string;
  value: string;
  inline: boolean;
}

interface EmbedData {
  title: string;
  description: string;
  color: string; // hex string like "#111111"
  authorName: string;
  authorIconUrl: string;
  authorUrl: string;
  fields: EmbedField[];
  imageUrl: string;
  thumbnailUrl: string;
  footerText: string;
  footerIconUrl: string;
  timestamp: boolean;
}

const EMPTY_EMBED: EmbedData = {
  title: "",
  description: "",
  color: "#111111",
  authorName: "",
  authorIconUrl: "",
  authorUrl: "",
  fields: [],
  imageUrl: "",
  thumbnailUrl: "",
  footerText: "",
  footerIconUrl: "",
  timestamp: false,
};

function hexToDecimal(hex: string): number {
  const clean = hex.replace("#", "");
  return parseInt(clean, 16) || 0;
}

function isValidUrl(url: string): boolean {
  if (!url) return true;
  return /^https?:\/\/.+/i.test(url);
}

function isValidWebhookUrl(url: string): boolean {
  return /^https:\/\/discord\.com\/api\/webhooks\/\d{17,20}\/[\w-]{60,68}(\?wait=\d+)?$/.test(url);
}

/* ======================== Discord Embed Preview ======================== */

function EmbedPreview({ embed }: { embed: EmbedData }) {
  const hasAnyContent =
    embed.title ||
    embed.description ||
    embed.authorName ||
    embed.footerText ||
    embed.fields.length > 0 ||
    embed.imageUrl ||
    embed.thumbnailUrl;

  if (!hasAnyContent) {
    return (
      <div className="rounded-lg border border-[#3f4147] bg-[#2b2d31] p-4 text-center text-xs text-[#b5bac1]">
        {translate("Chưa có nội dung embed — hãy soạn ở khung bên trái.")}{" "}
      </div>
    );
  }

  const colorHex = embed.color || "#111111";

  return (
    <div className="flex gap-2">
      {/* Author icon (left of embed) */}
      {embed.authorName && embed.authorIconUrl && isValidUrl(embed.authorIconUrl) && (
        <img
          src={embed.authorIconUrl}
          alt=""
          className="mt-1 h-8 w-8 rounded-full object-cover"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
      )}
      <div
        className="min-w-0 flex-1 overflow-hidden rounded-lg border-l-4 bg-[#2b2d31]"
        style={{ borderColor: colorHex }}
      >
        {/* Author */}
        {embed.authorName && (
          <div className="flex items-center gap-1.5 px-3 pt-2">
            {embed.authorIconUrl && isValidUrl(embed.authorIconUrl) && (
              <img
                src={embed.authorIconUrl}
                alt=""
                className="h-5 w-5 rounded-full object-cover"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
            )}
            <span className="text-xs font-semibold text-white">{embed.authorName}</span>
          </div>
        )}

        <div className="flex gap-2 p-3">
          <div className="min-w-0 flex-1">
            {/* Title */}
            {embed.title && <p className="mb-1 text-sm font-semibold text-white">{embed.title}</p>}
            {/* Description */}
            {embed.description && (
              <p className="whitespace-pre-wrap text-xs text-[#dcddde]">{embed.description}</p>
            )}

            {/* Fields */}
            {embed.fields.length > 0 && (
              <div
                className="mt-2 grid gap-2"
                style={{
                  gridTemplateColumns: embed.fields.some((f) => f.inline)
                    ? "repeat(auto-fill, minmax(120px, 1fr))"
                    : "1fr",
                }}
              >
                {embed.fields.map((f, i) => (
                  <div key={i} className={f.inline ? "" : "col-span-full"}>
                    <p className="text-xs font-semibold text-white">{f.name || "Field"}</p>
                    <p className="text-xs text-[#dcddde]">{f.value || "Value"}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Thumbnail */}
          {embed.thumbnailUrl && isValidUrl(embed.thumbnailUrl) && (
            <img
              src={embed.thumbnailUrl}
              alt=""
              className="h-20 w-20 shrink-0 rounded object-cover"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          )}
        </div>

        {/* Image */}
        {embed.imageUrl && isValidUrl(embed.imageUrl) && (
          <div className="px-3 pb-1">
            <img
              src={embed.imageUrl}
              alt=""
              className="max-h-40 w-full rounded object-cover"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          </div>
        )}

        {/* Footer */}
        {(embed.footerText || embed.timestamp) && (
          <div className="flex items-center gap-1.5 px-3 pb-2">
            {embed.footerIconUrl && isValidUrl(embed.footerIconUrl) && (
              <img
                src={embed.footerIconUrl}
                alt=""
                className="h-4 w-4 rounded-full object-cover"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
            )}
            <span className="text-[11px] text-[#b5bac1]">{embed.footerText}</span>
            {embed.timestamp && (
              <span className="text-[11px] text-[#b5bac1]">
                • {new Date().toLocaleString(dateLocale())}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ======================== Main Component ======================== */

export default function WebhookPanel({ data }: { data: GuildData }) {
  const token = TOKEN();
  const g = data.guild;
  const defaultWhQuery = useQuery(api.webhooks.getGuildWebhooks, { token, guildId: g.discordId });
  const toggleDefaultWebhook = useMutation(api.webhooks.toggleDefaultWebhook);
  const sendEmbed = useAction(api.webhooks.sendEmbed);

  /* --- Default webhook state --- */
  const defaultWh = defaultWhQuery?.find((w) => w.isDefault) ?? null;

  /* --- Embed builder state --- */
  const [webhookUrl, setWebhookUrl] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [content, setContent] = useState("");
  const [embed, setEmbed] = useState<EmbedData>({ ...EMPTY_EMBED });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const updateEmbed = useCallback((patch: Partial<EmbedData>) => {
    setEmbed((prev) => ({ ...prev, ...patch }));
  }, []);

  /* --- Send --- */
  async function handleSend() {
    if (!webhookUrl.trim()) {
      toast.error(translate("Nhập Discord Webhook URL"));
      return;
    }
    if (!isValidWebhookUrl(webhookUrl)) {
      toast.error(
        translate(
          "URL webhook không hợp lệ — phải đúng định dạng discord.com/api/webhooks/{id}/{token}",
        ),
      );
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const embedPayload: Record<string, unknown> = {};
      if (embed.title) embedPayload.title = embed.title;
      if (embed.description) embedPayload.description = embed.description;
      if (embed.color) embedPayload.color = hexToDecimal(embed.color);
      if (embed.authorName) {
        const author: Record<string, string> = { name: embed.authorName };
        if (embed.authorIconUrl && isValidUrl(embed.authorIconUrl))
          author.icon_url = embed.authorIconUrl;
        if (embed.authorUrl && isValidUrl(embed.authorUrl)) author.url = embed.authorUrl;
        embedPayload.author = author;
      }
      if (embed.fields.length > 0) {
        embedPayload.fields = embed.fields.map((f) => ({
          name: f.name,
          value: f.value,
          inline: f.inline,
        }));
      }
      if (embed.imageUrl && isValidUrl(embed.imageUrl))
        embedPayload.image = { url: embed.imageUrl };
      if (embed.thumbnailUrl && isValidUrl(embed.thumbnailUrl))
        embedPayload.thumbnail = { url: embed.thumbnailUrl };
      if (embed.footerText) {
        const footer: Record<string, string> = { text: embed.footerText };
        if (embed.footerIconUrl && isValidUrl(embed.footerIconUrl))
          footer.icon_url = embed.footerIconUrl;
        embedPayload.footer = footer;
      }
      if (embed.timestamp) embedPayload.timestamp = new Date().toISOString();

      const hasEmbed = Object.keys(embedPayload).length > 0;

      await sendEmbed({
        token,
        webhookUrl: webhookUrl.trim(),
        content: content.trim() || undefined,
        username: username.trim() || undefined,
        avatarUrl: avatarUrl.trim() || undefined,
        embeds: hasEmbed ? [embedPayload as any] : [],
      });

      setResult({ ok: true, msg: translate("Đã gửi thành công! Kiểm tra kênh Discord.") });
      toast.success(translate("Gửi thành công!"));
    } catch (e: unknown) {
      const msg = friendlyConvexError(e, translate("Gửi thất bại"));
      setResult({ ok: false, msg });
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ===== WEBHOOK MẶC ĐỊNH ===== */}
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Link className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              {translate("Webhook mặc định của bot")}{" "}
              <Badge variant="secondary" className="text-[10px]">
                {translate("MẶC ĐỊNH — tự động")}{" "}
              </Badge>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {defaultWh ? (
                <>
                  {translate("Tên")} <b className="text-foreground">{defaultWh.name}</b>{" "}
                  {translate("· kênh")}{" "}
                  <b className="text-foreground">
                    #{" "}
                    {data.channels?.find((c) => c.channelId === defaultWh.channelId)?.name ??
                      translate("kênh đã bị xóa")}
                  </b>{" "}
                  {translate(
                    "(theo Kênh log trong Cài đặt) · nhận mọi log hình phạt và anti nuke/raid.",
                  )}
                </>
              ) : (
                <>
                  {translate("Chưa có — bot sẽ")}{" "}
                  <b className="text-foreground">{translate("tự tạo trong khoảng 1 phút")}</b>{" "}
                  {translate("sau khi bạn")}{" "}
                  <b className="text-foreground">{translate("chọn Kênh log")}</b>{" "}
                  {translate("trong Cài đặt.")}{" "}
                </>
              )}
            </p>
          </div>
          {defaultWh && (
            <Switch
              checked={defaultWh.enabled}
              onCheckedChange={async (v) => {
                try {
                  await toggleDefaultWebhook({ token, guildId: g.discordId });
                  toast.success(
                    translate(v ? "Đã bật webhook mặc định" : "Đã tắt webhook mặc định"),
                  );
                } catch (e: unknown) {
                  toastConvexError(e, translate("Lưu thất bại"));
                }
              }}
            />
          )}
        </div>
        {defaultWh?.lastError && (
          <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-destructive">
            ⚠️ {defaultWh.lastError}
          </p>
        )}
      </div>

      {/* ===== EMBED BUILDER (discohook.org style) ===== */}
      <div className="space-y-4">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <MessageSquare className="h-4 w-4 text-primary" />
            Discord Webhook Sender
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {translate(
              "Dán webhook URL từ Discord (Kênh → Tích hợp → Webhook → Tạo webhook), soạn nội dung và embed rồi bấm gửi.",
            )}{" "}
          </p>
        </div>

        {/* Webhook URL */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <label className="text-xs font-medium text-muted-foreground">
            <Link className="mr-1 inline h-3 w-3" />
            Webhook URL
          </label>
          <input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/123456789/abc..."
            className="w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">
                {translate("Tên người gửi ghi đè (tùy chọn)")}{" "}
              </label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Protogon Bot"
                className="mt-1 w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">
                {translate("Avatar URL ghi đè (tùy chọn)")}{" "}
              </label>
              <input
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://..."
                className="mt-1 w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">
              {translate("Nội dung tin nhắn (tùy chọn — gửi cùng embed)")}{" "}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={translate("Nội dung tin nhắn Discord...")}
              rows={2}
              className="mt-1 w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none resize-none"
            />
          </div>
        </div>

        {/* Embed Builder + Preview side by side */}
        <div className="grid gap-4 xl:grid-cols-2">
          {/* --- Builder --- */}
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <h4 className="flex items-center gap-1.5 text-sm font-semibold">
              <Palette className="h-3.5 w-3.5" /> {translate("Soạn Embed")}{" "}
            </h4>

            {/* Author */}
            <fieldset className="rounded-lg border border-border/60 bg-secondary/30 p-3 space-y-2">
              <legend className="flex items-center gap-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <User className="h-3 w-3" /> Author
              </legend>
              <input
                value={embed.authorName}
                onChange={(e) => updateEmbed({ authorName: e.target.value })}
                placeholder={translate("Tên tác giả")}
                className="w-full rounded border border-border bg-background/70 px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={embed.authorIconUrl}
                  onChange={(e) => updateEmbed({ authorIconUrl: e.target.value })}
                  placeholder="Icon URL (avatar)"
                  className="w-full rounded border border-border bg-background/70 px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
                />
                <input
                  value={embed.authorUrl}
                  onChange={(e) => updateEmbed({ authorUrl: e.target.value })}
                  placeholder={translate("URL khi nhấn tên")}
                  className="w-full rounded border border-border bg-background/70 px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
                />
              </div>
            </fieldset>

            {/* Title + Description */}
            <input
              value={embed.title}
              onChange={(e) => updateEmbed({ title: e.target.value })}
              placeholder={translate("Tiêu đề embed")}
              className="w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-sm font-semibold text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
            />
            <textarea
              value={embed.description}
              onChange={(e) => updateEmbed({ description: e.target.value })}
              placeholder={translate("Mô tả / nội dung chính...")}
              rows={4}
              className="w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none resize-none"
            />

            {/* Color */}
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-medium text-muted-foreground shrink-0">
                <Palette className="mr-1 inline h-3 w-3" />
                {translate("Màu")}{" "}
              </label>
              <input
                type="color"
                value={embed.color}
                onChange={(e) => updateEmbed({ color: e.target.value })}
                className="h-8 w-8 cursor-pointer rounded border border-border"
              />
              <input
                value={embed.color}
                onChange={(e) => updateEmbed({ color: e.target.value })}
                placeholder="#111111"
                className="w-24 rounded border border-border bg-background/70 px-2 py-1.5 text-xs font-mono text-foreground focus:border-primary/50 focus:outline-none"
              />
            </div>

            {/* Fields */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Fields
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 gap-1 text-[11px]"
                  onClick={() =>
                    updateEmbed({
                      fields: [...embed.fields, { name: "", value: "", inline: false }],
                    })
                  }
                >
                  <Plus className="h-3 w-3" /> {translate("Thêm")}{" "}
                </Button>
              </div>
              {embed.fields.map((f, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border/60 bg-secondary/30 p-2 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Field {i + 1}</span>
                    <button
                      onClick={() => {
                        const next = [...embed.fields];
                        next.splice(i, 1);
                        updateEmbed({ fields: next });
                      }}
                      className="text-muted-foreground transition-colors hover:text-danger"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <input
                    value={f.name}
                    onChange={(e) => {
                      const next = [...embed.fields];
                      next[i] = { ...next[i], name: e.target.value };
                      updateEmbed({ fields: next });
                    }}
                    placeholder={translate("Tên field")}
                    className="w-full rounded border border-border bg-background/70 px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
                  />
                  <input
                    value={f.value}
                    onChange={(e) => {
                      const next = [...embed.fields];
                      next[i] = { ...next[i], value: e.target.value };
                      updateEmbed({ fields: next });
                    }}
                    placeholder={translate("Giá trị")}
                    className="w-full rounded border border-border bg-background/70 px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
                  />
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={f.inline}
                      onChange={(e) => {
                        const next = [...embed.fields];
                        next[i] = { ...next[i], inline: e.target.checked };
                        updateEmbed({ fields: next });
                      }}
                      className="accent-primary"
                    />
                    Inline
                  </label>
                </div>
              ))}
            </div>

            {/* Image / Thumbnail */}
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">
                  <Image className="mr-1 inline h-3 w-3" />
                  Image URL
                </label>
                <input
                  value={embed.imageUrl}
                  onChange={(e) => updateEmbed({ imageUrl: e.target.value })}
                  placeholder="https://..."
                  className="mt-1 w-full rounded border border-border bg-background/70 px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">
                  <Image className="mr-1 inline h-3 w-3" />
                  Thumbnail URL
                </label>
                <input
                  value={embed.thumbnailUrl}
                  onChange={(e) => updateEmbed({ thumbnailUrl: e.target.value })}
                  placeholder="https://..."
                  className="mt-1 w-full rounded border border-border bg-background/70 px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
                />
              </div>
            </div>

            {/* Footer + Timestamp */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[11px] font-medium text-muted-foreground">Footer text</label>
                <input
                  value={embed.footerText}
                  onChange={(e) => updateEmbed({ footerText: e.target.value })}
                  placeholder="Protogon · Log"
                  className="mt-1 w-full rounded border border-border bg-background/70 px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Footer icon URL
                </label>
                <input
                  value={embed.footerIconUrl}
                  onChange={(e) => updateEmbed({ footerIconUrl: e.target.value })}
                  placeholder="https://..."
                  className="mt-1 w-full rounded border border-border bg-background/70 px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={embed.timestamp}
                onChange={(e) => updateEmbed({ timestamp: e.target.checked })}
                className="accent-primary"
              />
              <Clock className="h-3 w-3" />
              {translate("Hiển thị thời gian hiện tại")}{" "}
            </label>
          </div>

          {/* --- Preview --- */}
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <h4 className="flex items-center gap-1.5 text-sm font-semibold">
              <Type className="h-3.5 w-3.5" /> {translate("Xem trước")}{" "}
            </h4>
            {/* Discord-like message container */}
            <div className="rounded-lg bg-[#313338] p-4 space-y-1">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 shrink-0 rounded-full bg-foreground" />
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-white">
                      {username || "Protogon Bot"}
                    </span>
                    <span className="text-[11px] text-[#b5bac1]">
                      {translate("Hôm nay lúc")}{" "}
                      {new Date().toLocaleTimeString(dateLocale(), {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {content && <p className="mt-0.5 text-sm text-[#dcddde]">{content}</p>}
                </div>
              </div>
              <div className="ml-[52px]">
                <EmbedPreview embed={embed} />
              </div>
            </div>
          </div>
        </div>

        {/* Send button + status */}
        <div className="flex items-center gap-3">
          <Button onClick={handleSend} disabled={sending || !webhookUrl.trim()} className="gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {translate(sending ? "Đang gửi..." : "Gửi embed")}
          </Button>
          {result && (
            <span
              className={`flex items-center gap-1.5 text-xs ${result.ok ? "text-foreground" : "text-danger"}`}
            >
              {result.ok ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              {result.msg}
            </span>
          )}
        </div>

        {/* Tips */}
        <div className="rounded-xl border border-border/50 bg-secondary/30 p-4 text-xs leading-relaxed text-muted-foreground">
          <p className="mb-1 font-semibold text-foreground">{translate("💡 Hướng dẫn nhanh:")}</p>
          <p>
            {translate("• Vào Discord → Kênh cần gửi →")}{" "}
            <b className="text-foreground">{translate("Tích hợp")}</b> →{" "}
            <b className="text-foreground">Webhook</b> →{" "}
            <b className="text-foreground">{translate("Tạo webhook")}</b> → Copy URL.
          </p>
          <p className="mt-1">
            {translate(
              "• Dán URL vào ô trên, soạn embed với tiêu đề, mô tả, màu sắc, field… rồi bấm",
            )}{" "}
            <b className="text-foreground">{translate("Gửi embed")}</b>.
          </p>
          <p className="mt-1">
            {translate(
              "• Webhook mặc định (Protogon Log) ở trên chỉ dùng để nhận log hình phạt và anti nuke từ bot — không liên quan tới trình gửi embed.",
            )}{" "}
          </p>
          <p className="mt-1">
            {translate(
              "• Hỗ trợ: author (tên + avatar + link), title, description, color hex, fields (tên + giá trị + inline), image, thumbnail, footer + icon, timestamp.",
            )}{" "}
          </p>
        </div>
      </div>
    </div>
  );
}
