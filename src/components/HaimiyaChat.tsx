import { useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { ImagePlus, Send, Sparkles, X } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { api } from "../../convex/_generated/api";
import { getSessionToken } from "../lib/discord";
import { askHaimiya, buildAskHistory, GREETING, QUICK_QUESTIONS } from "../lib/haimiya";
import { useBranding } from "../lib/useBranding";
import { cn } from "../lib/utils";
import { sha256Hex } from "../../convex/sha256";

import { currentLanguage, translate } from "../lib/i18n";
interface ChatMessage {
  /** Định danh ổn định cho React key — KHÔNG dùng index (danh sách có append
   *  và cuộn; index key làm reconcile sai khi mảng thay đổi). */
  id: string;
  role: "user" | "haimiya";
  text: string;
  suggestions?: string[];
  /** Ảnh xem trước trong bong bóng chat (data URL đã nén). */
  thumbs?: string[];
}

/* ── VISION helpers: nén ảnh + trích khung hình video ─────────────────── */

/** Tối đa 3 ảnh / lượt gửi; web nén xuống ≤ 1024px, JPEG q0.82 (≤ ~400KB). */
const MAX_IMAGES = 3;

/** Đọc File ảnh/video → nén/extract thành tối đa MAX_IMAGES data URL. */
async function fileToDataUrls(file: File): Promise<string[]> {
  // Ảnh: vẽ qua canvas resize (dài nhất ≤ 1024px) → JPEG nén.
  if (file.type.startsWith("image/")) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error(translate("Ảnh không đọc được")));
        el.src = url;
      });
      const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      return [canvas.toDataURL("image/jpeg", 0.82)];
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  // Video: chỉ nhận ≤ 50MB; trích tối đa 3 khung hình (10%/50%/90% thời lượng)
  // và gửi NHƯ ẢNH — model vision hiểu nội dung video qua khung đại diện.
  if (file.type.startsWith("video/")) {
    if (file.size > 50 * 1024 * 1024) throw new Error(translate("Video quá lớn (tối đa 50MB)"));
    const url = URL.createObjectURL(file);
    try {
      const video = await new Promise<HTMLVideoElement>((resolve, reject) => {
        const el = document.createElement("video");
        el.muted = true;
        el.preload = "auto";
        el.onloadeddata = () => resolve(el);
        el.onerror = () => reject(new Error(translate("Video không đọc được")));
        el.src = url;
      });
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
      const stops = [0.1, 0.5, 0.9].map((f) => Math.min(duration - 0.05, duration * f));
      const frames: string[] = [];
      for (const t of stops) {
        const shot = await new Promise<string | null>((resolve) => {
          const onSeeked = () => {
            video.removeEventListener("seeked", onSeeked);
            try {
              const canvas = document.createElement("canvas");
              const scale = Math.min(1, 1024 / Math.max(video.videoWidth, video.videoHeight));
              canvas.width = Math.round(video.videoWidth * scale);
              canvas.height = Math.round(video.videoHeight * scale);
              canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
              resolve(canvas.toDataURL("image/jpeg", 0.8));
            } catch {
              resolve(null);
            }
          };
          video.addEventListener("seeked", onSeeked);
          video.currentTime = t;
        });
        if (shot) frames.push(shot);
        if (frames.length >= MAX_IMAGES) break;
      }
      if (frames.length === 0) throw new Error(translate("Không trích được khung hình từ video"));
      return frames;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  throw new Error(translate("Chỉ hỗ trợ ảnh (jpg/png/webp) hoặc video (mp4/webm)"));
}

/**
 * Avatar chibi Haimiya-senpai — vẽ lại theo concept ảnh gốc (mèo đen + tóc bạc xanh)
 * bằng SVG thuần, không dùng ảnh ngoài. Gồm: beanie tai mèo đen có miếng vá mặt mèo,
 * tóc bạc xanh, mắt xanh sáng, má hồng, răng nanh, choker đen.
 * Nếu truyền `src` (ảnh tùy chỉnh do admin sở hữu bot đặt) sẽ hiển thị ảnh đó thay SVG.
 */
export function HaimiyaAvatar({
  className,
  src,
  decorative = false,
}: {
  className?: string;
  src?: string | null;
  decorative?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <img
        src={src}
        alt={decorative ? "" : "Haimiya"}
        onError={() => setFailed(true)}
        className={`rounded-full object-cover ${className ?? ""}`}
        draggable={false}
      />
    );
  }
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      {/* thân áo đen + vai */}
      <path d="M12 64v-9c0-7 9-11 20-11s20 4 20 11v9z" fill="#23222e" />
      {/* cổ */}
      <rect x="27" y="42" width="10" height="9" rx="2.5" fill="#ffeaf2" />
      {/* tóc sau — bạc xanh */}
      <path
        d="M18 32c0-11 6-19 14-19s14 8 14 19v5c-4-2-9-3.5-14-3.5s-10 1.5-14 3.5z"
        fill="#c6daf4"
      />
      {/* mặt */}
      <circle cx="32" cy="34" r="13.5" fill="#ffeaf2" />
      {/* mái tóc — bạc xanh sáng */}
      <path
        d="M18.5 33c.5-7.5 6.5-12 13.5-12s13 4.5 13.5 12c-3.5-3-8-4.5-13.5-4.5s-10 1.5-13.5 4.5z"
        fill="#dbe9fa"
      />
      {/* lọn tóc hai bên */}
      <path
        d="M20 38q-2.5 7 1 12"
        stroke="#c6daf4"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M44 38q2.5 7-1 12"
        stroke="#c6daf4"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      {/* beanie đen + tai mèo */}
      <path
        d="M18.5 31v-4.5c0-5.5 5.5-8.5 13.5-8.5s13.5 3 13.5 8.5V31c-3.5-2.5-8-4-13.5-4s-10 1.5-13.5 4z"
        fill="#2b2b38"
      />
      {/* tai mèo trái */}
      <path d="M19 21l-5-10 11 4z" fill="#2b2b38" />
      <path d="M20.5 21.5l-3.5-6.5 7 2.5z" fill="#ff9dbb" />
      {/* tai mèo phải */}
      <path d="M45 21l5-10-11 4z" fill="#2b2b38" />
      <path d="M43.5 21.5l3.5-6.5-7 2.5z" fill="#ff9dbb" />
      {/* miếng vá mặt mèo trên beanie */}
      <rect x="26" y="20" width="12" height="10" rx="3" fill="#fdfdfd" />
      <circle cx="30" cy="24.5" r="1.2" fill="#333" />
      <circle cx="34" cy="24.5" r="1.2" fill="#333" />
      <path
        d="M29.5 27.5q2 2.1 4 0"
        stroke="#333"
        strokeWidth="0.9"
        fill="none"
        strokeLinecap="round"
      />
      {/* mắt xanh sáng, đồng tử hẹp */}
      <path
        d="M21.5 34.5q4-4.5 8 0q-4 4.5-8 0z"
        fill="#4aa5ff"
        stroke="#12355e"
        strokeWidth="0.8"
      />
      <path
        d="M34.5 34.5q4-4.5 8 0q-4 4.5-8 0z"
        fill="#4aa5ff"
        stroke="#12355e"
        strokeWidth="0.8"
      />
      <ellipse cx="25.5" cy="34.8" rx="1" ry="2.2" fill="#12355e" />
      <ellipse cx="38.5" cy="34.8" rx="1" ry="2.2" fill="#12355e" />
      <circle cx="24" cy="33.6" r="0.9" fill="#fff" opacity="0.9" />
      <circle cx="37" cy="33.6" r="0.9" fill="#fff" opacity="0.9" />
      {/* má hồng */}
      <ellipse cx="21" cy="38.5" rx="3" ry="1.8" fill="#ff9dbb" opacity="0.75" />
      <ellipse cx="43" cy="38.5" rx="3" ry="1.8" fill="#ff9dbb" opacity="0.75" />
      {/* miệng cười hở răng nanh */}
      <path
        d="M28.5 40.5q3.5 3.5 7 0"
        stroke="#c26a85"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M35 41.3l1.3 2.7 1.5-2.5z"
        fill="#fff"
        stroke="#c26a85"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      {/* choker đen + vòng kim loại */}
      <path d="M26.5 48h11" stroke="#2b2b38" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="48" r="1.7" fill="none" stroke="#cfd6e4" strokeWidth="1.3" />
    </svg>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/70"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

export default function HaimiyaChat({
  position = "landing",
}: {
  position?: "landing" | "dashboard";
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [pending, setPending] = useState<string[]>([]); // ảnh đang đợi gửi (data URL đã nén)
  const fileRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "greeting", role: "haimiya", text: GREETING, suggestions: QUICK_QUESTIONS },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number>(0);
  const branding = useBranding();
  const avatarSrc = branding?.haimiyaAvatarUrl ?? null;
  const askAI = useAction(api.haimiya.ask);
  const reduceMotion = useReducedMotion();

  const closeChat = () => {
    setOpen(false);
    openerRef.current?.focus();
  };

  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("haimiya-open", onOpen);
    return () => window.removeEventListener("haimiya-open", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusableSelector =
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    const focusFirst = window.setTimeout(() => {
      panel.querySelector<HTMLElement>(focusableSelector)?.focus();
    }, 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeChat();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(focusableSelector)].filter(
        (element) => element.offsetParent !== null,
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusFirst);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "end",
    });
  }, [messages, typing, open, reduceMotion]);

  async function getAIResponse(
    history: Array<{ role: "user" | "assistant"; content: string }>,
    images?: Array<{ dataUrl: string }>,
  ): Promise<string | null> {
    // Convex action — chạy qua Groq / NVIDIA NIM / SambaNova / OpenAI (key ở Keys tab).
    // funcKey: chìa khóa chống lạm dụng (SHA-256("protogon-func-key::" + FUNC_SEED)) —
    // chỉ gửi khi người dùng đã cấu hình FUNC_SEED trong localStorage.
    let funcKey: string | undefined;
    try {
      const seed = localStorage.getItem("protogon_func_seed");
      if (seed) {
        funcKey = await sha256Hex(`protogon-func-key::${seed}`);
      }
    } catch {
      // ignore — gửi không funcKey (server miễn check khi chưa đặt FUNC_SEED).
    }
    try {
      // Token phiên (nếu đã đăng nhập) — backend yêu cầu khi chưa cấu hình FUNC_SEED.
      let token: string | undefined;
      try {
        token = getSessionToken() || undefined;
      } catch {
        token = undefined;
      }
      // lang: để Haimiya trả lời đúng ngôn ngữ người dùng chọn trên web.
      const res = await askAI({
        messages: history,
        images,
        funcKey,
        token,
        lang: currentLanguage(),
      });
      if (res && !res.offline && res.reply) return res.reply;
      // AI chưa cấu hình / dịch vụ lỗi / chưa đăng nhập → marker + lý do thật
      // từ server (action trả offline thay vì throw — Convex prod mask message
      // action thành "Server Error", không thể phân biệt qua exception).
      if (res && res.offline) {
        if ((res as { needLogin?: boolean }).needLogin)
          return `[đăng-nhập] ${res.reason ?? ""}`.trim();
        return `[offline] ${res.reason ?? ""}`.trim();
      }
    } catch {
      // Lỗi transport thật (mạng / Server Error) → offline chung.
      return `[offline] ${translate("Máy chủ AI đang lỗi tạm thời")}`;
    }
    return null;
  }

  /** ID tăng dần — ổn định cho React key của tin nhắn. */
  const msgSeqRef = useRef(0);
  const nextMsgId = () => `m${Date.now().toString(36)}-${msgSeqRef.current++}`;

  function send(text: string, withImages?: string[]) {
    const q = text.trim();
    const imgs = (withImages ?? pending).slice(0, 3);
    if ((!q && imgs.length === 0) || typing) return;
    setMessages((m) => [
      ...m,
      {
        id: nextMsgId(),
        role: "user",
        text: q || translate("(xem ảnh)"),
        thumbs: imgs.length ? imgs : undefined,
      },
    ]);
    setInput("");
    setPending([]);
    setTyping(true);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(
      async () => {
        // Lượt cuối phải CÓ nội dung: gửi ảnh mà không gõ chữ thì `q` rỗng,
        // mà action haimiya.ask từ chối `content` rỗng → panel báo "AI chưa
        // phản hồi" và ảnh bị bỏ rơi (bug 27/09/2026). buildAskHistory thay
        // lượt rỗng bằng chỉ dẫn mặc định, nên ảnh luôn được hỏi thật.
        const history = buildAskHistory(
          messages.concat([{ id: "_h", role: "user" as const, text: q }]),
          translate("Hãy mô tả ảnh này."),
        );

        const aiReply = await getAIResponse(
          history,
          imgs.length ? imgs.map((dataUrl) => ({ dataUrl })) : undefined,
        );
        if (aiReply?.startsWith("[giới-hạn]")) {
          setMessages((m) => [
            ...m,
            {
              id: nextMsgId(),
              role: "haimiya",
              text: aiReply.replace("[giới-hạn] ", "⏳ "),
            },
          ]);
        } else if (aiReply?.startsWith("[đăng-nhập]")) {
          setMessages((m) => [
            ...m,
            {
              id: nextMsgId(),
              role: "haimiya",
              text: "🔐 " + translate(aiReply.replace("[đăng-nhập] ", "")),
            },
          ]);
        } else if (aiReply?.startsWith("[offline]")) {
          // Thông báo minh bạch với lý do thật từ server + vẫn trả lời bằng
          // kiến thức cục bộ bên dưới (người dùng hiểu chính xác vì sao offline).
          const serverReason = translate(aiReply.replace("[offline]", "").trim());
          const ans = askHaimiya(q);
          setMessages((m) => [
            ...m,
            {
              id: nextMsgId(),
              role: "haimiya",
              text: serverReason
                ? translate(
                    "⚠️ AI trên máy chủ chưa phản hồi — {reason}. Tạm trả lời bằng kiến thức cục bộ.",
                    { reason: serverReason },
                  )
                : translate("⚠️ AI trên máy chủ chưa phản hồi. Tạm trả lời bằng kiến thức cục bộ."),
            },
            { id: nextMsgId(), role: "haimiya", text: ans.text, suggestions: ans.suggestions },
          ]);
        } else if (aiReply) {
          setMessages((m) => [...m, { id: nextMsgId(), role: "haimiya", text: aiReply }]);
        } else {
          // Fallback: bộ kiến thức cục bộ.
          const ans = askHaimiya(q);
          setMessages((m) => [
            ...m,
            { id: nextMsgId(), role: "haimiya", text: ans.text, suggestions: ans.suggestions },
          ]);
        }
        setTyping(false);
      },
      650 + Math.random() * 500,
    );
  }

  return (
    <>
      {/* Nút mở chat — z-30 để KHÔNG che dropdown/portal (z-40/z-50) và các
          nút save của panel; trên mobile đặt cao hơn để không đè nút cuối panel.
         Khi một dropdown (radix portal) mở, nút tự hạ xuống dưới dropdown. */}
      <button
        ref={openerRef}
        onClick={() => setOpen(true)}
        aria-label={translate("Trò chuyện với Haimiya")}
        className={cn(
          "group fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full",
          "border border-border bg-primary p-0.5 pr-1",
          "shadow-lg transition-transform hover:scale-105",
          // Mobile: nút nhỏ hơn + cao hơn để không che nút save cuối panel
          // + né vùng pin/tay cầm (safe-area cho máy tai thỏ).
          "max-sm:bottom-20 max-sm:right-4 max-sm:[right:max(1rem,env(safe-area-inset-right))]",
          open && "pointer-events-none opacity-0",
        )}
      >
        <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/95 ring-2 ring-white/60 shadow-inner max-sm:h-12 max-sm:w-12">
          <HaimiyaAvatar decorative className="h-12 w-12 max-sm:h-10 max-sm:w-10" src={avatarSrc} />
          <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
            <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-primary bg-white" />
          </span>
        </span>
        <span className="hidden pr-2 text-sm font-bold text-primary-foreground sm:block">
          Haimiya
        </span>
      </button>

      {/* Cửa sổ chat */}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="haimiya-chat-title"
          className={cn(
            "fixed bottom-5 right-5 z-50 flex w-[min(94vw,24rem)] flex-col overflow-hidden rounded-2xl",
            "border border-primary/30 bg-card/95 shadow-lg backdrop-blur",
            "animate-in fade-in-0 zoom-in-95 duration-200",
            // Mobile: chiếm gần hết màn hình, tự co khi bàn phím mở (dvh) và
            // né vùng pin/tay cầm (env safe-area).
            "max-h-[min(80dvh,34rem)] h-[min(80dvh,34rem)]",
            "max-[400px]:bottom-2 max-[400px]:right-2",
          )}
        >
          {/* Header */}
          <div className="relative flex items-center gap-3 border-b border-border bg-secondary px-4 py-3">
            <div className="relative">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/95 ring-2 ring-white/50">
                <HaimiyaAvatar decorative className="h-11 w-11" src={avatarSrc} />
              </span>
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-secondary bg-foreground" />
            </div>
            <div className="flex-1">
              <p
                id="haimiya-chat-title"
                className="font-display text-sm font-bold leading-tight text-foreground"
              >
                Haimiya
              </p>
              <p className="text-[11px] font-medium text-[#5c1533]">
                {translate("Trợ lý ảo của Protogon — giải đáp về bot, nhiệt độ, tính năng ẩn")}{" "}
              </p>
            </div>
            <button
              onClick={closeChat}
              aria-label={translate("Đóng")}
              className="rounded-lg p-1.5 text-[#5c1533] transition-colors hover:bg-white/20"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Tin nhắn */}
          <div
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
            className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4"
          >
            {messages.map((m, i) => (
              <div
                key={m.id}
                className={cn("flex items-end gap-2", m.role === "user" && "justify-end")}
              >
                {m.role === "haimiya" && (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/95 ring-1 ring-border">
                    <HaimiyaAvatar decorative className="h-8 w-8" src={avatarSrc} />
                  </span>
                )}
                <div
                  className={cn(
                    "chat-bubble-tail max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                    m.role === "haimiya"
                      ? "haimiya rounded-bl-sm border border-border bg-secondary/80 text-foreground/95"
                      : "user rounded-br-sm bg-primary text-primary-foreground",
                  )}
                >
                  {m.thumbs && m.thumbs.length > 0 && (
                    <div className="mb-1.5 flex flex-wrap gap-1.5">
                      {m.thumbs.map((t, ti) => (
                        <img
                          key={ti}
                          src={t}
                          alt=""
                          className="h-20 w-20 rounded-lg border border-white/40 object-cover"
                        />
                      ))}
                    </div>
                  )}
                  {translate(m.text)}
                  {m.suggestions && i === messages.length - 1 && !typing && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {m.suggestions.map((s) => (
                        <button
                          key={s}
                          onClick={() => send(s)}
                          className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
                        >
                          {translate(s)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex items-end gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/95 ring-1 ring-border">
                  <HaimiyaAvatar className="h-8 w-8" src={avatarSrc} />
                </span>
                <div className="chat-bubble-tail haimiya rounded-2xl rounded-bl-sm border border-border bg-secondary/80 px-3.5">
                  <TypingDots />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div
            className="border-t border-border/70 p-3"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (!f || typing) return;
              fileToDataUrls(f)
                .then((urls) => setPending((p) => [...p, ...urls].slice(0, 3)))
                .catch((err) =>
                  setMessages((m) => [
                    ...m,
                    {
                      id: nextMsgId(),
                      role: "haimiya",
                      text: `⚠️ ${err?.message ?? translate("Không đọc được file")}`,
                    },
                  ]),
                );
            }}
          >
            {pending.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {pending.map((p, i) => (
                  <div key={i} className="relative">
                    <img
                      src={p}
                      alt=""
                      className="h-16 w-16 rounded-lg border border-border object-cover"
                    />
                    <button
                      onClick={() => setPending((arr) => arr.filter((_, j) => j !== i))}
                      aria-label={translate("Bỏ ảnh")}
                      className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-foreground/80 text-[10px] text-background"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
              multiple
              hidden
              onChange={(e) => {
                const files = [...(e.target.files ?? [])].slice(0, 3);
                e.target.value = "";
                if (files.length === 0 || typing) return;
                Promise.allSettled(files.map(fileToDataUrls)).then((results) => {
                  const urls = results
                    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
                    .slice(0, 3);
                  const errors = results.filter((r) => r.status === "rejected");
                  setPending((p) => [...p, ...urls].slice(0, 3));
                  if (errors.length)
                    setMessages((m) => [
                      ...m,
                      {
                        id: nextMsgId(),
                        role: "haimiya",
                        text: `⚠️ ${(errors[0] as PromiseRejectedResult).reason?.message ?? translate("Không đọc được file")}`,
                      },
                    ]);
                });
              }}
            />
            <div className="flex items-center gap-2 rounded-xl border border-border bg-background/70 px-3 py-2 focus-within:border-primary/50">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={typing || pending.length >= 3}
                aria-label={translate("Gửi ảnh hoặc video")}
                title={translate(
                  "Gửi ảnh (jpg/png/webp) hoặc video ≤50MB — Haimiya sẽ xem giúp bạn",
                )}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-40"
              >
                <ImagePlus className="h-4 w-4" />
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") send(input);
                }}
                onPaste={(e) => {
                  const f = [...e.clipboardData.items]
                    .find((it) => it.type.startsWith("image/"))
                    ?.getAsFile();
                  if (f) {
                    e.preventDefault();
                    fileToDataUrls(f)
                      .then((urls) => setPending((p) => [...p, ...urls].slice(0, 3)))
                      .catch(() => {});
                  }
                }}
                placeholder={
                  pending.length ? translate("Mô tả về ảnh…") : translate("Hỏi tôi điều gì đó…")
                }
                aria-label={translate("Hỏi tôi điều gì đó…")}
                className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <button
                onClick={() => send(input)}
                disabled={typing || (!input.trim() && pending.length === 0)}
                aria-label={translate("Gửi")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
              <Sparkles className="h-3 w-3 text-primary" />
              {position === "dashboard"
                ? translate(
                    "Haimiya sẵn sàng giải đáp — hỏi về Protogon hay bất cứ điều gì ngoài lề.",
                  )
                : translate(
                    "Haimiya trò chuyện thoải mái — hỏi về Protogon hoặc bất cứ điều gì bạn muốn.",
                  )}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
