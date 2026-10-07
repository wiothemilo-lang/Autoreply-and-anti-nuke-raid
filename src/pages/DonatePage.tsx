import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAction } from "convex/react";
import {
  ArrowUp,
  Coffee,
  Facebook,
  Heart,
  Loader2,
  MessageCircle,
  QrCode,
  Sparkles,
  Star,
} from "lucide-react";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import PaymentReturn from "../components/PaymentReturn";
import Footer from "../components/landing/Footer";
import LangSwitch from "../components/LangSwitch";
import SkipLink from "../components/SkipLink";
import { usePublicConfig } from "../lib/usePublicConfig";
import { translate } from "../lib/i18n";
import { getSessionToken } from "../lib/discord";
import { api } from "../../convex/_generated/api";

/**
 * Trang /donate — ủng hộ nhà phát triển.
 *
 * Vì sao cần: Protogon do một người làm, miễn phí cho mọi server. Người dùng
 * muốn giúp thì cần một chỗ rõ ràng; không có nó thì chỉ có người đã biết mới
 * ủng hộ. Nút thanh toán ZaloPay chạy THẬT (tạo đơn + ký MAC ở Convex —
 * convex/payments.ts): trang chỉ nhận paymentUrl rồi redirect, giá do server
 * chốt theo plan, không bao giờ nhận số tiền từ client.
 *
 * Kèm khối QR ví cá nhân (public/payment.jpg): ZaloPay checkout bắt buộc đăng
 * nhập, mà người muốn ủng hộ 20k thì không đăng nhập chỉ để ủng hộ. QR ví là
 * kênh duy nhất khách VÃNG LAI dùng được — quét bằng app nào cũng xong, tiền
 * vào thẳng ví người nhận. Ảnh tĩnh phải tồn tại thật trong public/ (check
 * ở scripts/test-web-contracts.cjs) vì ảnh sai đường dẫn không làm build đỏ.
 */

/** Mức quyền góp gợi ý. Số tiền do người dùng chọn, không gắn gói dịch vụ. */
const TIERS = [
  { plan: "50000", amount: "50.000đ", blurb: "Một ly cà phê cho ngày thức khuya" },
  { plan: "100000", amount: "100.000đ", blurb: "Một giờ server không phải lo lỗi cấu hình" },
  { plan: "300000", amount: "300.000đ", blurb: "Một đêm deploy mà không sập giữa chừng" },
];

const PERKS = [
  "Bot luôn miễn phí, không giới hạn số server",
  "Không bán dữ liệu, không bán lịch sử tin nhắn của bạn",
  "Báo lỗi và yêu cầu tính năng được trả lời trong 24 giờ",
  "Ưu tiên hỗ trợ khi server của bạn gặp sự cố",
];

export default function DonatePage() {
  const { discordInvite, facebookUrl } = usePublicConfig();
  const navigate = useNavigate();
  const token = getSessionToken();
  const startPayment = useAction(api.paymentsAction.startPayment);
  const [busy, setBusy] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [customAmount, setCustomAmount] = useState("");

  /** Tạo đơn ZaloPay rồi redirect — chưa đăng nhập thì đưa qua /auth rồi quay lại đây. */
  const go = async (plan: string, custom?: number) => {
    if (!token) {
      navigate(`/auth?returnTo=${encodeURIComponent("/donate")}`);
      return;
    }
    setBusy(plan);
    setPayError(null);
    try {
      const r = await startPayment({ token, kind: "donate", plan, customAmount: custom });
      window.location.assign(r.paymentUrl);
    } catch (e) {
      // Lỗi backend đã viết sẵn tiếng Việt (thiếu key, spam đơn…) — bóc prefix Convex nếu có.
      const msg = e instanceof Error ? e.message.replace(/^Uncaught \w+:\s*/, "").trim() : "";
      setPayError(msg || translate("Không tạo được đơn thanh toán — thử lại sau ít phút."));
      setBusy(null);
    }
  };

  /** Số tiền khác: dọn ký tự không phải chữ số rồi kiểm hạn mức (server kiểm lại lần cuối). */
  const goCustom = () => {
    const n = Number(customAmount.replace(/[^\d]/g, ""));
    if (!Number.isInteger(n) || n < 10_000 || n > 100_000_000) {
      setPayError(translate("Số tiền phải từ 10.000đ đến 100.000.000đ."));
      return;
    }
    void go("custom", n);
  };

  return (
    <div className="min-h-screen bg-background">
      <SkipLink />

      {/* Thanh đầu trang — cùng khuôn với /features */}
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

      <main id="main" tabIndex={-1} className="mx-auto max-w-5xl px-6 pb-16 pt-12">
        {/* Kết quả thanh toán ?order= — hiện khi quay lại từ ZaloPay. */}
        <PaymentReturn token={token} />
        {payError && (
          <div
            role="alert"
            className="mt-6 rounded-2xl border border-border bg-card p-4 text-center text-sm text-foreground"
          >
            {payError}
          </div>
        )}

        {/* Hero */}
        <header className="text-center">
          <Badge variant="secondary" className="mb-5 gap-1.5">
            <Heart className="h-3.5 w-3.5" />
            {translate("Ủng hộ nhà phát triển")}
          </Badge>
          <h1 className="mx-auto max-w-3xl font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
            {translate("Giữ cho Protogon mở cửa miễn phí")}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">
            {translate(
              "Protogon được một người duy trì, chi phí máy chủ và thời gian đều tự bỏ ra. Mọi tính năng đều miễn phí và sẽ luôn miễn phí — quyền góp của bạn giúp bot có thêm tháng độ ổn định, không phải để mở khoá tính năng.",
            )}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <a href={discordInvite} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" />
                {translate("Ủng hộ qua Discord")}
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/premium">
                <Sparkles className="h-4 w-4" />
                {translate("Xem gói Premium")}
              </Link>
            </Button>
          </div>
        </header>

        {/* Mức quyền góp gợi ý */}
        <section className="mt-16">
          <h2 className="text-center font-display text-xl font-bold text-foreground">
            {translate("Chọn mức tùy khả năng")}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted-foreground">
            {translate("Đây chỉ là gợi ý. Mọi mức đều được chào đón, kể cả một lời cảm ơn.")}
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {TIERS.map((tier, i) => (
              <motion.div
                key={tier.amount}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.35, delay: i * 0.06 }}
                className="group flex flex-col items-center rounded-2xl border border-border bg-card p-6 text-center transition-colors hover:border-foreground/30"
              >
                <Coffee className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-foreground" />
                <p className="mt-3 font-display text-2xl font-bold text-foreground">
                  {tier.amount}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{tier.blurb}</p>
                <Button
                  className="mt-4 w-full"
                  disabled={busy !== null}
                  onClick={() => void go(tier.plan)}
                >
                  {busy === tier.plan ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {translate("Đang mở ZaloPay…")}
                    </>
                  ) : (
                    translate("Ủng hộ {so}", { so: tier.amount })
                  )}
                </Button>
              </motion.div>
            ))}
          </div>
          {/* Số tiền khác — plan "custom": server tự chốt hạn mức, không nhận số tiền từ client. */}
          <div className="mx-auto mt-8 flex max-w-md items-center gap-2">
            <label className="sr-only" htmlFor="donate-custom">
              {translate("Số tiền khác (VND)")}
            </label>
            <input
              id="donate-custom"
              type="number"
              inputMode="numeric"
              min={10000}
              max={100000000}
              step={1000}
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              placeholder={translate("Số tiền khác (VND)")}
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
            <Button variant="outline" disabled={busy !== null || !customAmount} onClick={goCustom}>
              {busy === "custom" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                translate("Ủng hộ số tiền này")
              )}
            </Button>
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            {translate(
              "Thanh toán một lần qua ZaloPay — không lưu thông tin thẻ, không tự động trừ tiền.",
            )}
          </p>
        </section>

        {/* QR ví cá nhân — kênh duy nhất người CHƯA đăng nhập dùng được. */}
        <section className="mt-16">
          <div className="grid items-center gap-8 rounded-2xl border border-border bg-card p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
            <div>
              <h2 className="flex items-center gap-2 font-display text-xl font-bold text-foreground">
                <QrCode className="h-5 w-5" />
                {translate("Ủng hộ trực tiếp bằng mã QR")}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {translate(
                  "Không cần đăng nhập, không qua cổng thanh toán: mở app ngân hàng hoặc ví điện tử của bạn, quét mã rồi chuyển số tiền bạn muốn. Tiền vào thẳng ví nhà phát triển.",
                )}
              </p>
              <ul className="mt-4 space-y-2 text-sm text-foreground">
                <li className="flex items-start gap-2.5">
                  <span
                    aria-hidden
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground"
                  />
                  {translate("Quét được bằng ZaloPay, MoMo, VietQR và app ngân hàng bất kỳ")}
                </li>
                <li className="flex items-start gap-2.5">
                  <span
                    aria-hidden
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground"
                  />
                  {translate("Chủ ví: NGUYEN DUY KHIEM — kiểm tra đúng tên trước khi chuyển")}
                </li>
              </ul>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                {translate(
                  "Ủng hộ qua QR là quà tặng cá nhân, không tự mở khoá Premium. Cần xác nhận thì nhắn trong Discord.",
                )}
              </p>
            </div>
            <figure className="mx-auto w-full max-w-xs">
              <img
                src="/payment.jpg"
                alt={translate("Mã QR nhận ủng hộ của NGUYEN DUY KHIEM")}
                width={720}
                height={960}
                loading="lazy"
                decoding="async"
                className="w-full rounded-2xl border border-border bg-white"
              />
              <figcaption className="mt-3 text-center text-xs text-muted-foreground">
                {translate("Quét mã bằng app chuyển tiền bất kỳ")}
              </figcaption>
            </figure>
          </div>
        </section>

        {/* Quyền góp mua được gì — nói thật, không hứa hẹn */}
        <section className="mt-16 rounded-2xl border border-border bg-secondary/40 p-8">
          <h2 className="flex items-center gap-2 font-display text-xl font-bold text-foreground">
            <Star className="h-5 w-5" />
            {translate("Quyền góp giúp được gì")}
          </h2>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {PERKS.map((perk) => (
              <li key={perk} className="flex items-start gap-2.5 text-sm text-foreground">
                <span
                  aria-hidden
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground"
                />
                {translate(perk)}
              </li>
            ))}
          </ul>
          <p className="mt-5 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
            {translate(
              "Nói thẳng: quyền góp KHÔNG tạo ra tính năng độc quyền và không xoá được quảng cáo. Nó giữ cho bot có máy chủ và có người trực sửa lỗi.",
            )}
          </p>
        </section>

        {/* Cách khác để giúp */}
        <section className="mt-16">
          <h2 className="text-center font-display text-xl font-bold text-foreground">
            {translate("Giúp theo cách khác")}
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <a
              href={discordInvite}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/30"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                <MessageCircle className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-foreground">
                  {translate("Tham gia cộng đồng Discord")}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {translate("Báo lỗi, xin tính năng, hoặc chỉ để chào")}
                </span>
              </span>
            </a>
            <a
              href={facebookUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/30"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                <Facebook className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-foreground">
                  {translate("Theo dõi trên Facebook")}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {translate("Cập nhật khi có phiên bản mới")}
                </span>
              </span>
            </a>
          </div>
        </section>
      </main>

      <Footer discordInvite={discordInvite} facebookUrl={facebookUrl} />
    </div>
  );
}
