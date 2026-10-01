import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import {
  DoorClosed,
  Hash,
  IdCard,
  ImageIcon,
  ImagePlus,
  Link2,
  Mail,
  Save,
  Shuffle,
  Smile,
  Trash2,
  Upload,
  UserMinus,
  UserPlus,
  Wand2,
} from "lucide-react";
import type { GenericId } from "convex/values";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent } from "../ui/card";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import type { ChannelInfo, EmojiInfo, GuildData } from "../../lib/types";
import { getSessionToken } from "../../lib/discord";
import { useUnsavedChanges } from "../../lib/useUnsavedChanges";
import GreetingPreview, { CardPreview, unknownCustomEmojis } from "./GreetingPreview";

import { translate } from "../../lib/i18n";
const TOKEN = () => getSessionToken();

/**
 * WelcomePanel v3 — chào thành viên mới + tạm biệt thành viên rời server.
 *
 * v3 thêm ba thứ người dùng thật sự cần khi soạn tin:
 *   1. Chèn bằng nút: emoji tuỳ chỉnh của server (`<:ten:id>`), liên kết kênh
 *      (`<#id>`), biến placeholder — bấm là chèn tại vị trí con trỏ, không phải
 *      nhớ cú pháp rồi gõ tay.
 *   2. Xem trước trực tiếp: dựng lại đúng khung Discord (embed, thanh màu, ảnh,
 *      thumbnail, emoji CDN) nên biết ngay tin nhắn ra sao trước khi member join.
 *   3. Ảnh thật: tải ảnh banner/thumbnail lên thẳng từ dashboard (lưu trong
 *      Convex storage) hoặc dán URL ngoài — không cần host ảnh ở đâu khác.
 *
 * Bất biến giữ nguyên từ v1/v2: bot không chào bot, không ping @everyone từ nội
 * dung người dùng nhập, và tự im lặng khi server đang khoá chống raid.
 */

type Kind = "welcome" | "goodbye";

/** Sáu ô ảnh hợp lệ — khớp đúng union trong convex/guilds.ts (saveGreetingImage). */
type ImageSlot =
  | "welcomeEmbedImage"
  | "welcomeEmbedThumbnail"
  | "goodbyeEmbedImage"
  | "goodbyeEmbedThumbnail"
  | "welcomeCardBackground"
  | "goodbyeCardBackground";

const IMAGE_SLOT_FIELD: Record<ImageSlot, string> = {
  welcomeEmbedImage: "welcomeEmbedImage",
  welcomeEmbedThumbnail: "welcomeEmbedThumbnail",
  goodbyeEmbedImage: "goodbyeEmbedImage",
  goodbyeEmbedThumbnail: "goodbyeEmbedThumbnail",
  welcomeCardBackground: "welcomeCardBackground",
  goodbyeCardBackground: "goodbyeCardBackground",
};

const PLACEHOLDER_BADGE = "{user} {username} {server} {count} {created} {boost}";

/** Biến bot thay khi gửi — hiện dưới dạng chip bấm-là-chèn. */
const TOKENS: { token: string; hint: string }[] = [
  { token: "{user}", hint: "Nhắc tên thành viên kèm thông báo" },
  { token: "{username}", hint: "Tên người dùng (không thông báo)" },
  { token: "{server}", hint: "Tên server" },
  { token: "{count}", hint: "Số thành viên hiện tại" },
  { token: "{created}", hint: "Tài khoản đã tạo bao nhiêu ngày" },
  { token: "{boost}", hint: "Số lượt boost của server" },
];

/** Emoji Unicode hay dùng — gõ nhanh mà không cần mở bàn phím emoji của hệ điều hành. */
const UNICODE_EMOJIS = [
  "👋",
  "🎉",
  "🎊",
  "✨",
  "🥳",
  "💖",
  "🔥",
  "⭐",
  "🌟",
  "😄",
  "😎",
  "🙌",
  "💜",
  "🫶",
  "🎈",
  "🏆",
  "🎁",
  "👑",
  "🌈",
  "☀️",
  "🌙",
  "🍀",
  "🚀",
  "💫",
  "😊",
  "🤗",
  "📌",
  "✅",
  "❤️",
  "💚",
  "💙",
  "🤍",
];

const EMOJI_CDN = "https://cdn.discordapp.com/emojis";

/** Mã emoji Discord gửi đi: `<a:ten:id>` cho ảnh động, `<:ten:id>` cho ảnh tĩnh. */
function emojiCode(e: EmojiInfo) {
  return `<${e.animated ? "a" : ""}:${e.name}:${e.emojiId}>`;
}

/** Xem trước nhanh dạng chữ (dùng cho DM — DM là tin nhắn thường, không embed). */
function previewText(template: string, guildName: string, memberCount: number) {
  return (
    template.trim() ||
    translate("Chào mừng {user} đã đến {server}! Bạn là thành viên thứ {count} 🎉")
  )
    .replaceAll("{user}", "@ThànhViênMới")
    .replaceAll("{username}", translate("ThànhViênMới"))
    .replaceAll("{server}", guildName)
    .replaceAll("{count}", String(memberCount ?? 0))
    .replaceAll("{created}", "365")
    .replaceAll("{boost}", "7");
}

/** Ô soạn tin có thanh chèn emoji / kênh / biến, giữ con trỏ sau mỗi lần chèn. */
function TemplateField({
  label,
  value,
  onChange,
  rows,
  placeholder,
  channels,
  emojis,
  badge,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
  placeholder?: string;
  channels: ChannelInfo[];
  emojis: EmojiInfo[];
  badge?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const caret = useRef<number | null>(null);
  const [panel, setPanel] = useState<"emoji" | "channel" | "token" | null>(null);

  // Đóng bảng chèn khi bấm ra ngoài — không để nó che ô soạn tin bên dưới.
  useEffect(() => {
    if (!panel) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setPanel(null);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [panel]);

  // Trả con trỏ về sau token vừa chèn (effect không deps: chạy sau MỌI render).
  useEffect(() => {
    if (caret.current == null) return;
    const el = ref.current;
    if (el) {
      el.focus();
      el.setSelectionRange(caret.current, caret.current);
    }
    caret.current = null;
  });

  function insert(text: string) {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    caret.current = start + text.length;
    onChange(value.slice(0, start) + text + value.slice(end));
  }

  const textChannels = channels.filter((c) => c.type === 0 || c.type === 5);
  const tabs: { key: "emoji" | "channel" | "token"; label: string; icon: typeof Smile }[] = [
    { key: "emoji", label: translate("Emoji"), icon: Smile },
    { key: "channel", label: translate("Kênh"), icon: Hash },
    { key: "token", label: translate("Biến"), icon: Wand2 },
  ];

  return (
    <div ref={wrapRef} className={`space-y-2 ${className ?? ""}`}>
      <Label className="text-xs">
        {label}{" "}
        {badge && (
          <Badge variant="secondary" className="ml-1">
            {badge}
          </Badge>
        )}
      </Label>

      <div className="flex flex-wrap items-center gap-1">
        {tabs.map((t) => (
          <Button
            key={t.key}
            type="button"
            size="sm"
            variant={panel === t.key ? "default" : "secondary"}
            className="h-7 gap-1 px-2 text-[11px]"
            aria-label={translate("Chèn {p0}", { p0: translate(t.label).toLowerCase() })}
            onClick={() => setPanel(panel === t.key ? null : t.key)}
          >
            <t.icon className="h-3.5 w-3.5" />
            {translate(t.label)}
          </Button>
        ))}
        <span className="ml-1 text-[10px] text-muted-foreground">
          {translate("Bấm để chèn ngay tại vị trí con trỏ.")}
        </span>
      </div>

      {panel === "emoji" && (
        <div className="space-y-2 rounded-lg border border-border bg-secondary/30 p-2.5">
          <p className="text-[11px] font-medium">{translate("Emoji của server")}</p>
          {emojis.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              {translate("Chưa có emoji tuỳ chỉnh nào trong server này.")}
            </p>
          ) : (
            <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
              {emojis.map((e) => (
                <button
                  key={e.emojiId}
                  type="button"
                  title={`:${e.name}:`}
                  onClick={() => insert(emojiCode(e))}
                  className="rounded p-1 hover:bg-primary/20"
                >
                  <img
                    src={`${EMOJI_CDN}/${e.emojiId}.${e.animated ? "gif" : "png"}?size=44`}
                    alt={`:${e.name}:`}
                    className="h-6 w-6 object-contain"
                  />
                </button>
              ))}
            </div>
          )}
          <p className="text-[11px] font-medium">{translate("Emoji phổ biến")}</p>
          <div className="flex max-h-20 flex-wrap gap-0.5 overflow-y-auto">
            {UNICODE_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => insert(e)}
                className="rounded px-1 py-0.5 text-base leading-none hover:bg-primary/20"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      {panel === "channel" && (
        <div className="space-y-2 rounded-lg border border-border bg-secondary/30 p-2.5">
          <p className="text-[11px] text-muted-foreground">
            {translate("Chọn kênh để chèn liên kết <#kênh> vào tin nhắn.")}
          </p>
          <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
            {textChannels.length === 0 && (
              <p className="text-[11px] text-muted-foreground">
                {translate("Chưa đồng bộ được kênh nào của server.")}
              </p>
            )}
            {textChannels.map((c) => (
              <button
                key={c.channelId}
                type="button"
                onClick={() => insert(`<#${c.channelId}>`)}
                className="rounded bg-background/60 px-2 py-1 text-[11px] hover:bg-primary/20"
              >
                #{c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {panel === "token" && (
        <div className="space-y-2 rounded-lg border border-border bg-secondary/30 p-2.5">
          <div className="flex flex-wrap gap-1">
            {TOKENS.map((t) => (
              <button
                key={t.token}
                type="button"
                title={translate(t.hint)}
                onClick={() => insert(t.token)}
                className="rounded bg-background/60 px-2 py-1 font-mono text-[11px] hover:bg-primary/20"
              >
                {t.token}
              </button>
            ))}
          </div>
        </div>
      )}

      <Textarea
        ref={ref}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** Ô ảnh: tải lên từ máy / dán URL / xoá — lưu NGAY, không cần bấm Lưu cài đặt. */
function ImageSlot({
  slot,
  guildId,
  title,
  hint,
  value,
  previewClass,
}: {
  slot: ImageSlot;
  guildId: string;
  title: string;
  hint: string;
  value: string;
  previewClass: string;
}) {
  const generateUploadUrl = useMutation(api.guilds.generateGreetingImageUploadUrl);
  const saveImage = useMutation(api.guilds.saveGreetingImage);
  const removeImage = useMutation(api.guilds.removeGreetingImage);
  const updateSettings = useMutation(api.guilds.updateSettings);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 8_000_000) {
      toast.error(translate("Ảnh tối đa 8MB, vui lòng chọn ảnh nhỏ hơn."));
      return;
    }
    setBusy(true);
    try {
      const uploadUrl = await generateUploadUrl({ token: TOKEN(), guildId });
      // Convex storage nhận POST (không phải PUT) — PUT bị CORS preflight chặn.
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "image/png" },
        body: file,
      });
      if (!res.ok)
        throw new Error(translate("Tải ảnh lên máy chủ thất bại (HTTP {p0})", { p0: res.status }));
      let storageId = "";
      try {
        const data = (await res.json()) as { storageId?: string };
        storageId = data?.storageId ?? "";
      } catch {
        // phản hồi không phải JSON
      }
      if (!storageId)
        throw new Error(
          translate("Máy chủ không trả về ID ảnh — hãy thử dán đường dẫn ảnh thay thế"),
        );
      await saveImage({
        token: TOKEN(),
        guildId,
        storageId: storageId as GenericId<"_storage">,
        slot,
      });
      toast.success(translate("Đã lưu ảnh — bot dùng ảnh mới trong khoảng 1 phút"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : translate("Tải ảnh thất bại"));
    } finally {
      setBusy(false);
    }
  }

  async function applyUrl() {
    const url = urlDraft.trim();
    if (!/^https?:\/\//i.test(url)) {
      toast.error(translate("Dán đường dẫn ảnh hợp lệ (bắt đầu bằng http:// hoặc https://)"));
      return;
    }
    setBusy(true);
    try {
      // Ảnh ngoài (không qua storage) vẫn đi qua updateSettings — cùng validator
      // cleanGreetingField ở server nên URL rác không lọt vào cấu hình.
      await updateSettings({
        token: TOKEN(),
        guildId,
        [IMAGE_SLOT_FIELD[slot]]: url,
      });
      toast.success(translate("Đã lưu ảnh — bot dùng ảnh mới trong khoảng 1 phút"));
      setUrlDraft("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : translate("Lưu ảnh thất bại"));
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      await removeImage({ token: TOKEN(), guildId, slot });
      toast.success(translate("Đã xoá ảnh"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : translate("Xoá ảnh thất bại"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        {value ? (
          <img src={value} alt="" className={`${previewClass} shrink-0 rounded object-cover`} />
        ) : (
          <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded bg-secondary/50 text-muted-foreground">
            <ImagePlus className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">{title}</p>
          <p className="text-[11px] text-muted-foreground">{hint}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 gap-1 px-2 text-[11px]"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" />
          {translate(busy ? "Đang tải…" : "Tải ảnh lên")}
        </Button>
        {value && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 gap-1 px-2 text-[11px]"
            disabled={busy}
            onClick={clear}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {translate("Xoá ảnh")}
          </Button>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <Input
          value={urlDraft}
          placeholder={translate("Hoặc dán URL ảnh")}
          className="h-8 text-xs"
          onChange={(e) => setUrlDraft(e.target.value)}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8 gap-1 px-2 text-[11px]"
          disabled={busy || !urlDraft.trim()}
          onClick={applyUrl}
        >
          <Link2 className="h-3.5 w-3.5" />
          {translate("Dùng URL")}
        </Button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChosen}
      />
    </div>
  );
}

/** Card cấu hình welcome/goodbye: kênh, template, embed, ảnh, preview trực tiếp. */
function GreetingCard({
  kind,
  data,
  onSave,
}: {
  kind: Kind;
  data: GuildData;
  onSave: (patch: Record<string, unknown>, msg: string) => Promise<void>;
}) {
  const g = data.guild;
  const isWelcome = kind === "welcome";
  const enabled = isWelcome ? g.welcomeEnabled : g.goodbyeEnabled;
  const channelId = isWelcome ? g.welcomeChannelId : g.goodbyeChannelId;
  const message = isWelcome ? g.welcomeMessage : g.goodbyeMessage;
  const useEmbed = isWelcome ? g.welcomeUseEmbed : g.goodbyeUseEmbed;
  const random = isWelcome ? g.welcomeRandom : g.goodbyeRandom;
  const embedTitle = isWelcome ? g.welcomeEmbedTitle : g.goodbyeEmbedTitle;
  const embedColor = isWelcome ? g.welcomeEmbedColor : g.goodbyeEmbedColor;
  const embedImage = isWelcome ? g.welcomeEmbedImage : g.goodbyeEmbedImage;
  const embedThumbnail = isWelcome ? g.welcomeEmbedThumbnail : g.goodbyeEmbedThumbnail;
  const cardEnabled = isWelcome ? g.welcomeCardEnabled : g.goodbyeCardEnabled;
  const cardBackground = isWelcome ? g.welcomeCardBackground : g.goodbyeCardBackground;

  const [channel, setChannel] = useState(channelId ?? "none");
  const [msg, setMsg] = useState(message ?? "");
  const [randomMsg, setRandomMsg] = useState(random ?? "");
  const [title, setTitle] = useState(embedTitle ?? "");
  const [color, setColor] = useState(embedColor ?? "#57f287");

  /**
   * Đồng bộ bản nháp khi cấu hình trên server đổi.
   *
   * LUẬT QUAN TRỌNG: chỉ ghi lại field mà GIÁ TRỊ SERVER vừa đổi so với lần render
   * trước — không đặt lại toàn bộ theo server.
   * Vì sao: mỗi lần chọn kênh / gạt công tắc là một lượt `updateSettings` gửi NGAY,
   * nên `data` đổi và effect chạy. Nếu effect ghi đè mọi field thì chữ người dùng
   * đang gõ dở (chưa bấm "Lưu cài đặt") bị xoá sạch chỉ vì họ vừa chọn kênh.
   * Dùng ref so sánh giá trị server → bản nháp đang gõ được giữ nguyên, mà thay
   * đổi thật từ tab khác/bot vẫn được áp dụng.
   */
  const lastServer = useRef<{
    channelId?: string | null;
    message?: string | null;
    random?: string | null;
    title?: string | null;
    color?: string | null;
  }>({});
  useEffect(() => {
    const prev = lastServer.current;
    if (prev.channelId !== channelId) setChannel(channelId ?? "none");
    if (prev.message !== message) setMsg(message ?? "");
    if (prev.random !== random) setRandomMsg(random ?? "");
    if (prev.title !== embedTitle) setTitle(embedTitle ?? "");
    if (prev.color !== embedColor) setColor(embedColor ?? "#57f287");
    lastServer.current = { channelId, message, random, title: embedTitle, color: embedColor };
  }, [channelId, message, random, embedTitle, embedColor]);

  /**
   * 5 ô này là bản nháp chỉ lên server khi bấm "Lưu cài đặt" → bấm sang panel
   * khác phải hỏi trước, nếu không mất sạch. Xem lib/useUnsavedChanges.ts.
   */
  useUnsavedChanges(
    `welcome-embed-${kind}`,
    channel !== (channelId ?? "none") ||
      msg !== (message ?? "") ||
      randomMsg !== (random ?? "") ||
      title !== (embedTitle ?? "") ||
      color !== (embedColor ?? "#57f287"),
  );

  const emojis = data.emojis ?? [];
  const channels = data.channels ?? [];
  const textChannels = channels.filter((c) => c.type === 0 || c.type === 5);
  const randomLines = randomMsg
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  // Chuỗi fallback PHẢI khớp bot/src/handlers/welcome.js:buildPayload:
  //   câu ngẫu nhiên → nội dung gốc → mặc định theo ngôn ngữ server.
  // Lệch thứ tự này là preview hứa một đằng, bot gửi một nẻo.
  const defaultSample = isWelcome
    ? translate("Chào mừng {user} đã đến {server}! Bạn là thành viên thứ {count} 🎉")
    : translate("{user} đã rời {server}. Hẹn gặp lại!");
  const shown = (randomLines[0] ?? msg).trim() || defaultSample;
  const unknown = unknownCustomEmojis(shown, emojis);

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {isWelcome ? <UserPlus className="h-4 w-4" /> : <UserMinus className="h-4 w-4" />}
            </span>
            <div>
              <h3 className="font-display text-sm font-bold">
                {isWelcome
                  ? translate("Chào thành viên mới")
                  : translate("Tạm biệt thành viên rời server")}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                {isWelcome
                  ? translate("Gửi lời chào vào kênh bạn chọn mỗi khi có thành viên tham gia")
                  : translate("Gửi lời tạm biệt khi có thành viên rời server")}
              </p>
            </div>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => {
              // Bật mà chưa có kênh gửi = bot im lặng mãi (không có chỗ nào để gửi).
              // Chặn ngay tại đây kèm lý do rõ ràng thay vì lưu xong để người dùng
              // tưởng tính năng hỏng.
              if (v && channel === "none") {
                toast.error(translate("Chọn kênh gửi trước khi bật tính năng này."));
                return;
              }
              void onSave({ [`${kind}Enabled`]: v }, translate(v ? "Đã bật" : "Đã tắt"));
            }}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">{translate("Kênh gửi")}</Label>
          <Select
            value={channel}
            onValueChange={(v) => {
              setChannel(v);
              // Lưu NGAY khi chọn kênh: nếu chỉ giữ ở state rồi bật công tắc trước khi
              // bấm "Lưu cài đặt", cấu hình sẽ là "đang bật + chưa có kênh" → bot
              // không gửi gì và người dùng không hiểu vì sao.
              void onSave(
                { [`${kind}ChannelId`]: v === "none" ? "" : v },
                translate("Đã lưu kênh gửi"),
              );
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={translate("Chọn kênh")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{translate("— Không dùng —")}</SelectItem>
              {textChannels.map((c) => (
                <SelectItem key={c.channelId} value={c.channelId}>
                  #{c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            {/* Nội dung gốc v1 — giữ tương thích; template ngẫu nhiên nếu có sẽ thắng. */}
            <TemplateField
              label={translate("Nội dung")}
              badge={PLACEHOLDER_BADGE}
              value={msg}
              onChange={setMsg}
              rows={3}
              channels={channels}
              emojis={emojis}
              placeholder={
                isWelcome
                  ? translate("Chào mừng {user} đã đến {server}! Bạn là thành viên thứ {count} 🎉")
                  : translate("{user} đã rời {server}. Hẹn gặp lại!")
              }
            />

            {/* Template ngẫu nhiên: mỗi dòng 1 câu, bot chọn random mỗi lượt. */}
            <div className="space-y-2 rounded-lg border border-border bg-secondary/30 p-3">
              <div className="flex items-center gap-2">
                <Shuffle className="h-4 w-4 text-primary" />
                <p className="text-xs font-medium">{translate("Template ngẫu nhiên")}</p>
                <Badge variant="secondary">{translate("{n} câu", { n: randomLines.length })}</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {translate(
                  "Mỗi dòng là một câu — bot chọn ngẫu nhiên mỗi lượt vào/rời server để tin nhắn không bị nhàm. Điền vào đây thì phần này thay cho nội dung ở trên.",
                )}
              </p>
              <TemplateField
                label={translate("Danh sách câu")}
                value={randomMsg}
                onChange={setRandomMsg}
                rows={3}
                channels={channels}
                emojis={emojis}
                placeholder={translate(
                  "Chào mừng {user} đến {server}!\nRất vui có {username} trong nhà!\nNgười thứ {count} vừa xuất hiện 🎉",
                )}
              />
            </div>

            {/* Embed tùy chỉnh sâu. */}
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2.5">
              <div>
                <p className="text-xs font-medium">{translate("Gửi dạng embed")}</p>
                <p className="text-[11px] text-muted-foreground">
                  {translate("Tắt = gửi tin nhắn thường, không có khung embed.")}
                </p>
              </div>
              <Switch
                checked={useEmbed}
                onCheckedChange={(v) => onSave({ [`${kind}UseEmbed`]: v }, translate("Đã lưu"))}
              />
            </div>

            {useEmbed && (
              <div className="space-y-3 rounded-lg border border-border p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <TemplateField
                    label={translate("Tiêu đề embed")}
                    value={title}
                    onChange={setTitle}
                    rows={1}
                    channels={channels}
                    emojis={emojis}
                    placeholder={
                      isWelcome ? translate("🎉 Thành viên mới!") : translate("👋 Tạm biệt")
                    }
                  />
                  <div className="grid gap-1.5">
                    <Label className="text-xs">{translate("Màu (#hex)")}</Label>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-8 w-8 shrink-0 rounded border border-border"
                        style={{
                          backgroundColor: /^#[0-9a-fA-F]{6}$/.test(color.trim())
                            ? color.trim()
                            : "#5865f2",
                        }}
                      />
                      <Input
                        value={color}
                        placeholder="#57f287"
                        onChange={(e) => setColor(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <ImageSlot
                    slot={`${kind}EmbedImage`}
                    guildId={g.discordId}
                    title={translate("Ảnh banner")}
                    hint={translate("Ảnh lớn hiện dưới nội dung embed.")}
                    value={embedImage ?? ""}
                    previewClass="h-10 w-14"
                  />
                  <ImageSlot
                    slot={`${kind}EmbedThumbnail`}
                    guildId={g.discordId}
                    title={translate("Thumbnail")}
                    hint={translate("Ảnh nhỏ ở góc phải embed.")}
                    value={embedThumbnail ?? ""}
                    previewClass="h-10 w-10"
                  />
                </div>

                {/*
                  THẺ ẢNH — bot tự vẽ PNG riêng cho từng thành viên (nền ở dưới +
                  avatar tròn + tên + số thành viên). Chỉ nằm trong nhánh useEmbed
                  vì ảnh cần embed mới có chỗ hiển thị.
                */}
                <div className="space-y-3 rounded-lg border border-border bg-secondary/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <ImageIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div>
                        <p className="text-xs font-medium">{translate("Thẻ ảnh riêng")}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {translate(
                            "Bot tự vẽ một tấm ảnh cho riêng thành viên: nền của bạn + avatar tròn + tên + số thành viên.",
                          )}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={cardEnabled}
                      onCheckedChange={(v) =>
                        onSave({ [`${kind}CardEnabled`]: v }, translate("Đã lưu"))
                      }
                    />
                  </div>

                  {/* Bật thẻ mà máy chủ bot không vẽ được → người dùng phải biết NGAY,
                      nếu không họ chỉ thấy "đã bật" mà chẳng có ảnh nào. */}
                  {cardEnabled && data.botCardReady === false && (
                    <p className="text-[11px] text-amber-500">
                      ⚠{" "}
                      {translate(
                        "Máy chủ bot chưa vẽ được ảnh nên thẻ này chưa hoạt động — bot vẫn gửi tin nhắn thường. Lý do: {p0}",
                        { p0: data.botCardReason ?? translate("không xác định") },
                      )}
                    </p>
                  )}
                  {cardEnabled && data.botCardReady === null && (
                    <p className="text-[11px] text-muted-foreground">
                      {translate(
                        "Chưa nhận được báo cáo từ bot (bot đang chạy bản cũ hoặc chưa khởi động lại).",
                      )}
                    </p>
                  )}

                  {cardEnabled && (
                    <ImageSlot
                      slot={`${kind}CardBackground`}
                      guildId={g.discordId}
                      title={translate("Ảnh nền thẻ")}
                      hint={translate(
                        "Ảnh hiện phía sau avatar và tên (bỏ trống = nền màu chuyển sắc).",
                      )}
                      value={cardBackground ?? ""}
                      previewClass="h-10 w-16"
                    />
                  )}
                </div>
              </div>
            )}

            <Button
              className="w-full"
              onClick={async () => {
                if (channel === "none" && enabled) {
                  return toast.error(
                    translate("Đang bật thì phải chọn kênh gửi, hoặc tắt tính năng này."),
                  );
                }
                const colorTrim = color.trim();
                if (colorTrim && !/^#[0-9a-fA-F]{3,8}$/.test(colorTrim)) {
                  return toast.error(translate("Màu phải ở dạng #hex, ví dụ #57f287"));
                }
                await onSave(
                  {
                    [`${kind}ChannelId`]: channel === "none" ? "" : channel,
                    [`${kind}Message`]: msg,
                    [`${kind}Random`]: randomMsg,
                    [`${kind}EmbedTitle`]: title,
                    [`${kind}EmbedColor`]: colorTrim,
                  },
                  translate("Đã lưu — bot áp dụng trong khoảng 3 phút"),
                );
              }}
            >
              <Save className="h-4 w-4" /> {translate("Lưu cài đặt")}
            </Button>
          </div>

          {/* Cột phải: xem trước đúng như Discord sẽ hiển thị. */}
          <div className="space-y-2 xl:sticky xl:top-4 xl:self-start">
            <p className="text-xs font-medium">{translate("Xem trước trực tiếp")}</p>
            {useEmbed && cardEnabled && (
              <>
                <CardPreview
                  eyebrow={isWelcome ? translate("CHÀO MỪNG") : translate("TẠM BIỆT")}
                  name={translate("ThànhViênMới")}
                  meta={`${g.name} · ${translate("Thành viên thứ {count}", { count: g.memberCount ?? 0 })}`}
                  backgroundUrl={cardBackground ?? ""}
                  accent={color}
                />
                <p className="text-[11px] text-muted-foreground">
                  {translate(
                    "Thẻ ảnh dùng avatar của thành viên thật khi gửi; ở đây hiện vị trí giữ chỗ.",
                  )}
                </p>
              </>
            )}
            <GreetingPreview
              content={shown}
              useEmbed={useEmbed}
              embedTitle={title}
              embedColor={color}
              embedImage={embedImage ?? ""}
              embedThumbnail={embedThumbnail ?? ""}
              sample={{
                username: translate("ThànhViênMới"),
                server: g.name,
                count: g.memberCount ?? 0,
                created: 365,
                boost: 7,
              }}
              channels={channels}
              emojis={emojis}
              kindLabel={isWelcome ? translate("Chào") : translate("Tạm biệt")}
            />
            <p className="text-[11px] text-muted-foreground">
              {translate(
                "Bot chèn {user} ở dòng riêng khi gửi embed, còn nội dung nằm trong khung.",
              )}
            </p>
            {unknown.length > 0 && (
              <p className="text-[11px] text-amber-500">
                ⚠{" "}
                {translate(
                  "Emoji không còn trong server: {list} — Discord sẽ hiện dạng chữ. Hãy chèn lại từ danh sách emoji.",
                  { list: [...new Set(unknown)].join(", ") },
                )}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Welcome DM — tin nhắn riêng qua DM thành viên mới. */
function DmCard({
  data,
  onSave,
}: {
  data: GuildData;
  onSave: (patch: Record<string, unknown>, msg: string) => Promise<void>;
}) {
  const g = data.guild;
  const [msg, setMsg] = useState(g.welcomeDmMessage ?? "");
  useEffect(() => {
    setMsg(g.welcomeDmMessage ?? "");
  }, [g.welcomeDmMessage]);
  useUnsavedChanges("welcome-dm", msg !== (g.welcomeDmMessage ?? ""));

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Mail className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-display text-sm font-bold">{translate("Chào qua DM")}</h3>
              <p className="text-[11px] text-muted-foreground">
                {translate("Gửi lời chào riêng qua tin nhắn trực tiếp (DM) cho thành viên mới")}
              </p>
            </div>
          </div>
          <Switch
            checked={g.welcomeDmEnabled}
            onCheckedChange={(v) =>
              onSave({ welcomeDmEnabled: v }, translate(v ? "Đã bật" : "Đã tắt"))
            }
          />
        </div>

        <TemplateField
          label={translate("Nội dung DM")}
          badge={PLACEHOLDER_BADGE}
          value={msg}
          onChange={setMsg}
          rows={2}
          channels={data.channels ?? []}
          emojis={data.emojis ?? []}
          placeholder={translate(
            "Cảm ơn {username} đã tham gia {server}! Đọc #quy-tắc trước khi chat nhé.",
          )}
        />
        <p className="text-[11px] text-muted-foreground">
          {translate("Xem trước:")} {previewText(msg, g.name, g.memberCount ?? 0)}
        </p>

        <Button
          className="w-full"
          onClick={() =>
            onSave({ welcomeDmMessage: msg }, translate("Đã lưu — bot áp dụng trong khoảng 3 phút"))
          }
        >
          <Save className="h-4 w-4" /> {translate("Lưu cài đặt")}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Autorole — tự cấp role khi thành viên vào server. */
function AutoroleCard({
  data,
  onSave,
}: {
  data: GuildData;
  onSave: (patch: Record<string, unknown>, msg: string) => Promise<void>;
}) {
  const g = data.guild;
  const roleId = g.autoroleRoleId ?? "none";
  const [delay, setDelay] = useState(String(g.autoroleDelaySec ?? 0));
  useEffect(() => {
    setDelay(String(g.autoroleDelaySec ?? 0));
  }, [g.autoroleDelaySec]);
  useUnsavedChanges("welcome-autorole", delay !== String(g.autoroleDelaySec ?? 0));

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <IdCard className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-display text-sm font-bold">
                {translate("Autorole — tự cấp role")}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                {translate("Tự gán role cho thành viên mới ngay khi họ vào server")}
              </p>
            </div>
          </div>
          <Switch
            checked={g.autoroleEnabled}
            onCheckedChange={(v) =>
              onSave({ autoroleEnabled: v }, translate(v ? "Đã bật" : "Đã tắt"))
            }
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="text-xs">{translate("Role gán tự động")}</Label>
            <Select
              value={roleId}
              onValueChange={(v) =>
                onSave({ autoroleRoleId: v === "none" ? "" : v }, translate("Đã lưu"))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={translate("Chọn role")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{translate("— Không dùng —")}</SelectItem>
                {data.roles.map((r) => (
                  <SelectItem key={r.roleId} value={r.roleId}>
                    @{r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">{translate("Chờ trước khi gán (giây, 0–120)")}</Label>
            <Input
              type="number"
              min={0}
              max={120}
              value={delay}
              onChange={(e) => setDelay(e.target.value)}
              onBlur={() => {
                const n = Math.max(0, Math.min(120, Math.floor(Number(delay) || 0)));
                setDelay(String(n));
                void onSave({ autoroleDelaySec: n }, translate("Đã lưu"));
              }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2.5">
          <div>
            <p className="text-xs font-medium">{translate("Cấp role cho bot")}</p>
            <p className="text-[11px] text-muted-foreground">
              {translate("Mặc định tắt — bot mới vào server không nhận role tự động")}
            </p>
          </div>
          <Switch
            checked={g.autoroleIncludeBots}
            onCheckedChange={(v) => onSave({ autoroleIncludeBots: v }, translate("Đã lưu"))}
          />
        </div>

        <p className="text-[11px] text-muted-foreground">
          {translate(
            "Chống raid: khi server đang khóa vì raid, autorole tạm dừng để không gán role cho loạt tài khoản ập vào.",
          )}
        </p>
      </CardContent>
    </Card>
  );
}

export default function WelcomePanel({ data }: { data: GuildData }) {
  const updateSettings = useMutation(api.guilds.updateSettings);
  const g = data.guild;
  const activeCount = [
    g.welcomeEnabled,
    g.goodbyeEnabled,
    g.welcomeDmEnabled,
    g.autoroleEnabled,
  ].filter(Boolean).length;

  async function onSave(patch: Record<string, unknown>, msg: string) {
    try {
      await updateSettings({ token: TOKEN(), guildId: g.discordId, ...patch });
      toast.success(msg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Lưu thất bại"));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DoorClosed className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg font-bold">{translate("Welcome & Goodbye")}</h2>
          {activeCount > 0 && (
            <Badge variant="success">
              {activeCount} {translate("đang bật")}
            </Badge>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {translate(
          "Chào thành viên mới và tạm biệt người rời server: template ngẫu nhiên, embed tùy chỉnh, ảnh banner tự tải lên, emoji và kênh của server chèn thẳng vào tin nhắn, DM chào riêng và autorole. Xem trước ngay bên cạnh để biết tin nhắn ra sao trước khi thành viên thật vào.",
        )}{" "}
      </p>

      <GreetingCard kind="welcome" data={data} onSave={onSave} />
      <GreetingCard kind="goodbye" data={data} onSave={onSave} />
      <DmCard data={data} onSave={onSave} />
      <AutoroleCard data={data} onSave={onSave} />
    </div>
  );
}
