import type { ReactNode } from "react";
import { UserRound } from "lucide-react";
import type { ChannelInfo, EmojiInfo } from "../../lib/types";
import { translate } from "../../lib/i18n";

/**
 * GreetingPreview — dựng lại tin nhắn chào/tạm biệt ĐÚNG như Discord sẽ hiện.
 *
 * Vì sao cần: trước đây người dùng chỉ thấy một dòng chữ thô "Xem trước: …" nên
 * không biết embed trông thế nào, emoji tuỳ chỉnh có hiện không, kênh `<#…>` có
 * ra link không. Sai một ly là phải chờ member thật join mới biết — quá muộn.
 *
 * Cách render (không có dependency nào, không gọi Discord API):
 *   - `<:ten:id>` / `<a:ten:id>` → ảnh emoji từ CDN Discord (gif nếu animated).
 *   - `<#id>`                   → chip #tên-kênh (tra từ danh sách kênh của server).
 *   - `<@id>` / `{user}`        → chip người dùng.
 *   - `@everyone` / `@here`     → chip mờ + cảnh báo (bot luôn chặn ping này).
 */

export interface GreetingSample {
  /** Tên hiển thị của thành viên mẫu. */
  username: string;
  /** Tên server thật của guild đang cấu hình. */
  server: string;
  /** Số thành viên thật của guild. */
  count: number;
  /** Tuổi account mẫu (ngày). */
  created: number;
  /** Số ngày mẫu đã ở trong server — khớp `{joined}` của bot. */
  joined: number;
  /** Số boost mẫu. */
  boost: number;
}

/** Thay placeholder mở rộng đúng như bot/src/handlers/welcome.js:fillTemplate. */
export function fillPreviewSample(template: string, s: GreetingSample): string {
  return String(template || "")
    .replaceAll("{user}", `<@${SAMPLE_USER_ID}>`)
    .replaceAll("{username}", s.username)
    .replaceAll("{server}", s.server)
    .replaceAll("{count}", String(s.count))
    .replaceAll("{created}", String(s.created))
    .replaceAll("{joined}", String(s.joined))
    .replaceAll("{boost}", String(s.boost));
}

/** ID mẫu — chỉ để tokenizer nhận ra là mention, không bao giờ gửi lên Discord. */
const SAMPLE_USER_ID = "000000000000000000";

const EMOJI_CDN = "https://cdn.discordapp.com/emojis";

type Token =
  | { t: "text"; v: string }
  | { t: "emoji"; name: string; id: string; animated: boolean }
  | { t: "channel"; id: string }
  /** Mention người dùng — giữ id để ghép lại chuỗi gốc được nguyên vẹn. */
  | { t: "user"; id: string }
  | { t: "broadcast"; v: string };

/**
 * Cắt chuỗi thành token. Thứ tự nhánh quan trọng: `<a:…>` phải đứng trước `<:…>`
 * nếu không emoji động bị nuốt thành text.
 */
export function tokenizeGreeting(raw: string): Token[] {
  const re =
    /<a:(\w{2,32}):(\d{15,21})>|<:(\w{2,32}):(\d{15,21})>|<#(\d{15,21})>|<@!?(\d{15,21})>|@(everyone|here)/g;
  const out: Token[] = [];
  let last = 0;
  for (let m = re.exec(raw); m; m = re.exec(raw)) {
    if (m.index > last) out.push({ t: "text", v: raw.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: "emoji", name: m[1], id: m[2], animated: true });
    else if (m[3] !== undefined) out.push({ t: "emoji", name: m[3], id: m[4], animated: false });
    else if (m[5] !== undefined) out.push({ t: "channel", id: m[5] });
    else if (m[6] !== undefined) out.push({ t: "user", id: m[6] });
    else out.push({ t: "broadcast", v: `@${m[7]}` });
    last = m.index + m[0].length;
  }
  if (last < raw.length) out.push({ t: "text", v: raw.slice(last) });
  return out;
}

/**
 * Tên emoji tuỳ chỉnh có trong nội dung nhưng KHÔNG còn trong server (owner đã
 * xoá emoji, hoặc id copy từ server khác). Discord vẽ những emoji này thành chữ
 * thô — panel cảnh báo trước thay vì để người dùng phát hiện lúc member join.
 */
export function unknownCustomEmojis(text: string, emojis: EmojiInfo[]): string[] {
  const known = new Set(emojis.map((e) => e.emojiId));
  return tokenizeGreeting(text)
    .filter((t): t is Extract<Token, { t: "emoji" }> => t.t === "emoji" && !known.has(t.id))
    .map((t) => `:${t.name}:`);
}

const chipClass =
  "rounded bg-primary/20 px-1 py-0.5 text-[0.85em] font-medium text-primary-foreground/90";

/** Tên thành viên mẫu trong preview — dịch được, luôn đi kèm dấu @. */
function sampleMention() {
  return `@${translate("ThànhViênMới")}`;
}

/** Render token thành node React — text thuần được React escape, không có HTML thô. */
function renderTokens(text: string, channels: ChannelInfo[], emojis: EmojiInfo[]): ReactNode[] {
  return tokenizeGreeting(text).map((tk, i) => {
    if (tk.t === "text") return <span key={i}>{tk.v}</span>;
    if (tk.t === "broadcast")
      return (
        <span
          key={i}
          className="rounded bg-amber-500/20 px-1 py-0.5 text-[0.85em] font-medium text-amber-300/80 line-through"
          title={translate("Bot luôn chặn ping @everyone/@here từ nội dung bạn nhập.")}
        >
          {tk.v}
        </span>
      );
    // Mention: luôn hiện dưới dạng chip tên mẫu (Discord cũng chỉ hiện tên, không
    // hiện id) — id được token giữ lại chỉ để ghép/so khớp chuỗi gốc.
    if (tk.t === "user")
      return (
        <span key={i} className={chipClass} title={`<@${tk.id}>`}>
          {sampleMention()}
        </span>
      );
    if (tk.t === "channel") {
      const c = channels.find((x) => x.channelId === tk.id);
      return (
        <span key={i} className={chipClass}>
          #{c?.name ?? translate("kênh không có trong server")}
        </span>
      );
    }
    // Emoji: nếu id không có trong danh sách server → vẫn vẽ (Discord cũng vẽ nếu
    // emoji còn tồn tại); chỉ khác là nếu sai id thì Discord hiện chữ thô.
    const known = emojis.some((e) => e.emojiId === tk.id);
    return (
      <img
        key={i}
        src={`${EMOJI_CDN}/${tk.id}.${tk.animated ? "gif" : "png"}?size=44`}
        alt={`:${tk.name}:`}
        title={known ? `:${tk.name}:` : translate("Emoji này không có trong server")}
        className={`mx-px inline-block h-[1.375em] w-[1.375em] translate-y-[0.24em] object-contain ${
          known ? "" : "opacity-60 ring-1 ring-amber-400/70"
        }`}
      />
    );
  });
}

/**
 * Bố cục THẺ ẢNH (bot tự vẽ PNG) — mô phỏng bằng CSS, KHÔNG dùng canvas.
 * Tỉ lệ ở đây bám đúng toạ độ trong bot/src/handlers/welcomeCard.js (900×300,
 * avatar tròn ở 160,150 bán kính 96, chữ bắt đầu ở x=300) để preview không hứa
 * một bố cục khác với ảnh thật.
 */
export function CardPreview({
  eyebrow,
  name,
  meta,
  backgroundUrl,
  accent,
}: {
  eyebrow: string;
  name: string;
  meta: string;
  backgroundUrl: string;
  accent: string;
}) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-border bg-[#0c0e12]"
      style={{ aspectRatio: "3 / 1" }}
    >
      {backgroundUrl.trim() ? (
        <>
          <img
            src={backgroundUrl.trim()}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <span className="absolute inset-0 bg-black/60" />
        </>
      ) : (
        <span
          className="absolute inset-0"
          style={{ backgroundImage: `linear-gradient(135deg, ${accent} 0%, #0c0e12 100%)` }}
        />
      )}
      <span className="absolute inset-y-0 left-0 w-[1.1%]" style={{ backgroundColor: accent }} />
      <span className="absolute left-[7.1%] top-1/2 flex aspect-square w-[21.3%] -translate-y-1/2 items-center justify-center rounded-full border-4 border-white/70 bg-[#2b2d31] text-white/50">
        <UserRound className="h-2/5 w-2/5" />
      </span>
      <div className="absolute left-[33.3%] top-0 flex h-full w-[62%] flex-col justify-center gap-1 text-white">
        <p className="truncate text-[0.55rem] tracking-[0.18em] text-white/70">{eyebrow}</p>
        <p className="truncate text-lg font-bold leading-tight">{name}</p>
        <p className="truncate text-[0.68rem] text-white/75">{meta}</p>
      </div>
    </div>
  );
}

/** Đổi #hex → rgba sẵn dùng cho thanh màu embed (Discord dùng màu thô). */
function embedBarColor(color: string | undefined): string {
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(String(color || "").trim());
  if (!m) return "#5865f2";
  let hex = m[1];
  if (hex.length === 3)
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  return `#${hex.slice(0, 6)}`;
}

export interface GreetingPreviewProps {
  /** Nội dung đã chọn gửi (template ngẫu nhiên hoặc nội dung gốc). */
  content: string;
  useEmbed: boolean;
  embedTitle?: string;
  embedColor?: string;
  embedImage?: string;
  embedThumbnail?: string;
  sample: GreetingSample;
  channels: ChannelInfo[];
  emojis: EmojiInfo[];
  /** Nhãn loại tin nhắn (Chào mừng / Tạm biệt) — hiện ở tiêu đề khung. */
  kindLabel: string;
}

/** Khung tin nhắn Discord: header server + bot, nội dung, embed tuỳ chọn. */
export default function GreetingPreview({
  content,
  useEmbed,
  embedTitle,
  embedColor,
  embedImage,
  embedThumbnail,
  sample,
  channels,
  emojis,
  kindLabel,
}: GreetingPreviewProps) {
  const filled = fillPreviewSample(content || "", sample);
  const filledTitle = fillPreviewSample(embedTitle || "", sample);
  const body = renderTokens(filled, channels, emojis);
  const barColor = embedBarColor(embedColor);
  // Cảnh báo ping ảo: nội dung có @everyone/@here → bot chặn, nhưng người dùng
  // nên biết là nó vô tác dụng chứ không tưởng mình đã ping cả server.
  const showWarning = tokenizeGreeting(filled).some((t) => t.t === "broadcast");

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-[#313338] text-[13px] shadow-sm">
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
          P
        </span>
        <span className="font-semibold text-white/90">Protogon</span>
        <span className="rounded bg-[#5865f2] px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white">
          BOT
        </span>
        <span className="ml-auto text-[10px] text-white/40">{kindLabel}</span>
      </div>

      <div className="space-y-2 px-3 py-3">
        {/*
          Chế độ embed: bot gửi mention thành viên ở DÒNG RIÊNG (payload.content)
          rồi mới tới khung embed — preview phải giống hệt, nếu không người dùng
          tưởng mention nằm trong embed và bỏ trống phần nội dung.
        */}
        {!useEmbed ? (
          <p className="whitespace-pre-wrap break-words leading-[1.4] text-white/90">{body}</p>
        ) : (
          <>
            <p className="text-white/90">
              <span className={chipClass}>{sampleMention()}</span>
            </p>
            <div className="flex gap-2">
              <span className="w-1 shrink-0 rounded-sm" style={{ backgroundColor: barColor }} />
              <div className="min-w-0 flex-1 space-y-1.5 rounded bg-[#2b2d31] px-3 py-2">
                {filledTitle.trim() && (
                  <p className="break-words font-semibold text-white">
                    {renderTokens(filledTitle, channels, emojis)}
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words leading-[1.4] text-white/80">
                  {body}
                </p>
                {embedImage?.trim() && (
                  <img
                    src={embedImage.trim()}
                    alt=""
                    className="max-h-64 w-full rounded object-cover"
                  />
                )}
              </div>
              {embedThumbnail?.trim() && (
                <img
                  src={embedThumbnail.trim()}
                  alt=""
                  className="h-20 w-20 shrink-0 rounded object-cover"
                />
              )}
            </div>
          </>
        )}

        {showWarning && (
          <p className="text-[10px] text-amber-400/90">
            ⚠ {translate("Nội dung có @everyone/@here — bot luôn chặn, không ai bị ping.")}
          </p>
        )}
      </div>
    </div>
  );
}
