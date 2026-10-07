import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useMutation } from "convex/react";
import {
  ArrowUp,
  Bug,
  CheckCircle2,
  Lightbulb,
  Loader2,
  MessageSquareHeart,
  Send,
} from "lucide-react";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import Footer from "../components/landing/Footer";
import LangSwitch from "../components/LangSwitch";
import { usePublicConfig } from "../lib/usePublicConfig";
import { currentLanguage, translate } from "../lib/i18n";
import { friendlyConvexError } from "../lib/convexError";
import { api } from "../../convex/_generated/api";

/**
 * Trang /feedback — người dùng gửi góp ý (báo lỗi / đề xuất / góp ý chung).
 *
 * Vì sao có trang này: trước đây kênh duy nhất để góp ý là vào Discord, mà
 * người gặp lỗi thì thường bỏ đi chứ không vào server để kể. Góp ý gửi được
 * KHÔNG cần đăng nhập (không có tài khoản Discord vẫn gửi được) và đi thẳng
 * vào bảng `feedback` của Convex — chỉ chủ bot đọc được.
 *
 * Phân chia trách nhiệm: server là nơi CHỐT luật (convex/feedback.ts —
 * độ dài, định dạng email, trần chống spam); ở đây chỉ kiểm tra nhẹ để người
 * dùng biết trước khi bấm. Hai con số MESSAGE_MIN/MESSAGE_MAX dưới đây phải
 * khớp convex/feedback.ts — scripts/test-web-contracts.cjs khoá việc đó.
 */
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 2000;

/** 3 loại góp ý. Nhãn/mô tả để nguyên tiếng Việt, dịch lúc render bằng translate(). */
const KINDS = [
  { id: "bug", icon: Bug, label: "Báo lỗi", hint: "Bot hoặc web làm sai điều gì đó" },
  {
    id: "idea",
    icon: Lightbulb,
    label: "Đề xuất tính năng",
    hint: "Bạn muốn bot làm được thêm gì",
  },
  {
    id: "other",
    icon: MessageSquareHeart,
    label: "Góp ý chung",
    hint: "Cảm nhận, câu hỏi, hoặc lời cảm ơn",
  },
] as const;

type KindId = (typeof KINDS)[number]["id"];

export default function FeedbackPage() {
  const { discordInvite, facebookUrl } = usePublicConfig();
  const submit = useMutation(api.feedback.submit);
  const [kind, setKind] = useState<KindId>("bug");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  // Bẫy bot: input ẩn, người thật không bao giờ thấy/điền. Có giá trị thì
  // server coi như bot và không ghi gì vào DB (convex/feedback.ts).
  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const length = message.trim().length;
  const tooShort = length < MESSAGE_MIN;
  const canSend = !tooShort && length <= MESSAGE_MAX && !busy;

  /** Gửi góp ý — lỗi backend đã viết sẵn tiếng Việt, bóc prefix Convex nếu có. */
  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    setError(null);
    try {
      await submit({
        kind,
        message,
        email: email.trim() || undefined,
        lang: currentLanguage(),
        page: typeof window === "undefined" ? undefined : window.location.pathname,
        honeypot: honeypot || undefined,
      });
      setSent(true);
    } catch (e) {
      setError(
        friendlyConvexError(e, translate("Không gửi được góp ý — thử lại sau ít phút nhé.")),
      );
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setSent(false);
    setMessage("");
    setEmail("");
    setKind("bug");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Thanh đầu trang — cùng khuôn với /donate và /features */}
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 pt-6">
        <Link
          to="/"
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowUp className="h-4 w-4 -rotate-90" />
          {translate("Về trang chủ")}
        </Link>
        <LangSwitch />
      </div>

      <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-6 pb-16 pt-12">
        <header className="text-center">
          <Badge variant="secondary" className="mb-5 gap-1.5">
            <MessageSquareHeart className="h-3.5 w-3.5" />
            {translate("Phản hồi của bạn")}
          </Badge>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {translate("Góp ý cho Protogon")}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">
            {translate(
              "Bạn gặp lỗi, thiếu tính năng, hay chỉ muốn góp ý? Gửi ở đây — góp ý đi thẳng tới người làm bot, không cần tài khoản Discord và không ai khác đọc được.",
            )}
          </p>
        </header>

        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="mt-10"
        >
          {sent ? (
            /* Đã gửi: nói rõ ĐÃ NHẬN, kèm đường lui nếu người dùng muốn trao đổi tiếp. */
            <div className="rounded-2xl border border-border bg-card p-8 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-foreground" />
              <h2 className="mt-4 font-display text-xl font-bold text-foreground">
                {translate("Đã nhận góp ý của bạn")}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                {translate(
                  "Cảm ơn bạn! Mình đọc hết góp ý và sẽ trả lời qua email nếu bạn có để lại địa chỉ.",
                )}
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Button variant="outline" onClick={reset}>
                  {translate("Gửi thêm góp ý")}
                </Button>
                <Button asChild>
                  <a href={discordInvite} target="_blank" rel="noreferrer">
                    {translate("Vào Discord để trao đổi trực tiếp")}
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
              {error && (
                <div
                  role="alert"
                  className="mb-6 rounded-xl border border-border bg-secondary/40 p-3 text-sm text-foreground"
                >
                  {error}
                </div>
              )}

              {/* Loại góp ý — 3 lựa chọn, mặc định Báo lỗi (đa số người gửi là báo lỗi). */}
              <fieldset>
                <legend className="text-sm font-semibold text-foreground">
                  {translate("Loại góp ý")}
                </legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {KINDS.map((k) => {
                    const Icon = k.icon;
                    const active = kind === k.id;
                    return (
                      <button
                        key={k.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setKind(k.id)}
                        className={`rounded-xl border p-3 text-left transition-colors ${
                          active
                            ? "border-foreground/40 bg-secondary/60"
                            : "border-border hover:border-foreground/25"
                        }`}
                      >
                        <Icon className="h-4 w-4 text-foreground" />
                        <span className="mt-2 block text-sm font-semibold text-foreground">
                          {translate(k.label)}
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                          {translate(k.hint)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {/* Nội dung — ô chính, có đếm ký tự để người dùng biết giới hạn. */}
              <div className="mt-6">
                <label htmlFor="feedback-message" className="text-sm font-semibold text-foreground">
                  {translate("Nội dung")}
                </label>
                <textarea
                  id="feedback-message"
                  rows={7}
                  maxLength={MESSAGE_MAX}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={translate(
                    "Mô tả càng rõ càng tốt: bạn đang làm gì, thấy gì, và mong đợi điều gì.",
                  )}
                  className="mt-3 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-primary/40"
                />
                <p className="mt-1.5 text-right text-xs text-muted-foreground">
                  {tooShort
                    ? translate("Cần ít nhất {p0} ký tự.", { p0: MESSAGE_MIN })
                    : translate("{p0}/{p1} ký tự", { p0: length, p1: MESSAGE_MAX })}
                </p>
              </div>

              {/* Email tùy chọn — chỉ để phản hồi, không bắt buộc. */}
              <div className="mt-4">
                <label htmlFor="feedback-email" className="text-sm font-semibold text-foreground">
                  {translate("Email (không bắt buộc)")}
                </label>
                <input
                  id="feedback-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ban@example.com"
                  className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {translate("Điền nếu bạn muốn mình phản hồi lại — bỏ trống vẫn gửi được.")}
                </p>
              </div>

              {/* Bẫy bot: ẩn khỏi người dùng thật (sr-only + không nhận tab). */}
              <div className="sr-only" aria-hidden>
                <label htmlFor="feedback-website">Website</label>
                <input
                  id="feedback-website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </div>

              <div className="mt-6 flex items-center gap-3">
                <Button disabled={!canSend} onClick={() => void send()}>
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {translate("Đang gửi…")}
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      {translate("Gửi góp ý")}
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {translate("Không cần đăng nhập. Mình không chia sẻ góp ý của bạn cho ai khác.")}
                </p>
              </div>
            </div>
          )}
        </motion.section>

        {/* Cách khác để nói chuyện — nhiều người muốn trao đổi tiếp trong Discord. */}
        <section className="mt-10 rounded-2xl border border-border bg-secondary/40 p-6 text-center">
          <h2 className="font-display text-base font-bold text-foreground">
            {translate("Muốn trao đổi trực tiếp?")}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {translate(
              "Nếu bạn cần trả lời gấp hoặc muốn cả cộng đồng cùng bàn, vào Discord — kênh hỗ trợ có người theo dõi.",
            )}
          </p>
          <Button asChild className="mt-4">
            <a href={discordInvite} target="_blank" rel="noreferrer">
              {translate("Vào Discord")}
            </a>
          </Button>
        </section>
      </main>

      <Footer discordInvite={discordInvite} facebookUrl={facebookUrl} />
    </div>
  );
}
