import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAction, useQuery } from "convex/react";
import { ArrowUp, Check, Crown, Heart, Loader2, Minus, ShieldCheck, Sparkles } from "lucide-react";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import PaymentReturn from "../components/PaymentReturn";
import Footer from "../components/landing/Footer";
import LangSwitch from "../components/LangSwitch";
import { usePublicConfig } from "../lib/usePublicConfig";
import { dateLocale, translate } from "../lib/i18n";
import { getSessionToken } from "../lib/discord";
import { friendlyConvexError } from "../lib/convexError";
import { api } from "../../convex/_generated/api";

/**
 * Trang /premium — gói Premium30 ngày thanh toán qua ZaloPay.
 *
 * Nút Mua gọi paymentsAction.startPayment (server chốt giá theo plan, ký MAC,
 * tạo đơn) rồi redirect sang ZaloPay; quay về ?order= trang này thì
 * PaymentReturn query lại trạng thái từ server (không tin tham số URL).
 * Không tự động gia hạn (không có recurring) — ghi rõ trên trang để không
 * hứa hẹn thứ không làm được. Chưa đăng nhập → đưa qua /auth rồi quay lại.
 */

interface Plan {
  id: string;
  name: string;
  price: string;
  period: string;
  tagline: string;
  features: { label: string; included: boolean }[];
  /** Gói được nhấn mạnh — trung tâm trang. */
  featured?: boolean;
}

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Miễn phí",
    price: "0đ",
    period: "vĩnh viễn",
    tagline: "Đủ dùng cho hầu hết server cộng đồng.",
    features: [
      { label: "Tự trả lời, chặn link độc hại, 32 module chống nuke", included: true },
      { label: "Không giới hạn số server", included: true },
      { label: "Backup & khôi phục cấu trúc server", included: true },
      { label: "Số kênh riêng của bot (ví dụ bảng điều khiển)", included: false },
      { label: "Báo cáo nâng cao & xuất dữ liệu", included: false },
      { label: "Hỗ trợ ưu tiên", included: false },
    ],
  },
  {
    id: "supporter",
    name: "Đồng hành",
    price: "49.000đ",
    period: "mỗi tháng",
    tagline: "Dành cho server muốn nhiều kênh riêng và báo cáo đẹp hơn.",
    featured: true,
    features: [
      { label: "Tất cả tính năng của gói Miễn phí", included: true },
      { label: "Tối đa 10 kênh riêng có thư mục riêng", included: true },
      { label: "Báo cáo nâng cao & xuất dữ liệu", included: true },
      { label: "Tên riêng cho bot (thay vì Protogon)", included: true },
      { label: "Hỗ trợ ưu tiên", included: false },
    ],
  },
  {
    id: "pioneer",
    name: "Tiên phong",
    price: "99.000đ",
    period: "mỗi tháng",
    tagline: "Cho người muốn bot bám sát server mình nhất.",
    features: [
      { label: "Tất cả tính năng của gói Đồng hành", included: true },
      { label: "Số kênh riêng không giới hạn", included: true },
      { label: "Hỗ trợ ưu tiên trong 24 giờ", included: true },
      { label: "Ý tưởng tính năng được xếp hạng đầu", included: true },
      { label: "Avatar & biểu tượng riêng cho bot", included: true },
    ],
  },
];

/** Thứ hạng gói — mua gói thấp hơn khi gói cao đang hoạt động bị chặn. */
const PREMIUM_PLAN_RANK: Record<string, number> = { supporter: 1, pioneer: 2 };

export default function PremiumPage() {
  const { discordInvite, facebookUrl } = usePublicConfig();
  const navigate = useNavigate();
  const token = getSessionToken();
  const startPayment = useAction(api.paymentsAction.startPayment);
  const premiumStatus = useQuery(api.payments.premiumStatus, token ? { token } : "skip");
  const [busy, setBusy] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  const planName = (id: string) => PLANS.find((p) => p.id === id)?.name ?? id;
  const formatDate = (ms: number) => new Date(ms).toLocaleDateString(dateLocale());
  const active = premiumStatus?.active ? premiumStatus : null;

  /** Trạng thái nút theo quyền hiện có: chặn mua gói thấp hơn khi gói cao đang chạy. */
  const buyState = (planId: string): { disabled: boolean; label: string } => {
    if (planId === "free") return { disabled: true, label: translate("Miễn phí vĩnh viễn") };
    const rank = PREMIUM_PLAN_RANK[planId] ?? 0;
    if (active && (PREMIUM_PLAN_RANK[active.plan] ?? 0) > rank) {
      return { disabled: true, label: translate("Bạn đang có gói cao hơn") };
    }
    if (active && active.plan === planId) {
      return { disabled: false, label: translate("Gia hạn thêm 30 ngày") };
    }
    return { disabled: false, label: translate("Mua bằng ZaloPay") };
  };

  /** Tạo đơn ZaloPay rồi redirect — chưa đăng nhập thì đưa qua /auth rồi quay lại đây. */
  const go = async (planId: string) => {
    if (!token) {
      navigate(`/auth?returnTo=${encodeURIComponent("/premium")}`);
      return;
    }
    setBusy(planId);
    setPayError(null);
    try {
      const r = await startPayment({ token, kind: "premium", plan: planId });
      window.location.assign(r.paymentUrl);
    } catch (e) {
      setPayError(
        friendlyConvexError(e, translate("Không tạo được đơn thanh toán — thử lại sau ít phút.")),
      );
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
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
        {/* Kết quả thanh toán ?order= + lỗi tạo đơn. */}
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
            <Crown className="h-3.5 w-3.5" />
            {translate("Gói Premium")}
          </Badge>
          <h1 className="mx-auto max-w-3xl font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
            {translate("Trả phí để bot có thêm sức làm việc")}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">
            {translate(
              "Gói Miễn phí luôn ở đó và không bao giờ bị cắt bớt. Premium chỉ mở thêm tiện ích cho server cần nhiều hơn — và là cách duy nhất để duy trì bot trong dài hạn.",
            )}
          </p>

          {/* Trạng thái gói: đã đăng nhập thì hiện hạn dùng thật; ngược lại nói thật về cách trả. */}
          {token && premiumStatus ? (
            <div className="mx-auto mt-7 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-4 py-2 text-xs font-medium text-muted-foreground">
              <Crown className="h-3.5 w-3.5 shrink-0" />
              {premiumStatus.active
                ? translate("Gói {goi} đang hoạt động — dùng tới {ngay}", {
                    goi: planName(premiumStatus.plan),
                    ngay: formatDate(premiumStatus.expiresAt),
                  })
                : translate("Gói {goi} đã hết hạn {ngay}", {
                    goi: planName(premiumStatus.plan),
                    ngay: formatDate(premiumStatus.expiresAt),
                  })}
            </div>
          ) : (
            <div className="mx-auto mt-7 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-4 py-2 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              {translate("Thanh toán một lần qua ZaloPay — không tự động gia hạn")}
            </div>
          )}
        </header>

        {/* 3 gói */}
        <section className="mt-14">
          <div className="grid gap-5 lg:grid-cols-3">
            {PLANS.map((plan, i) => (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.35, delay: i * 0.07 }}
                className={
                  plan.featured
                    ? "relative flex flex-col rounded-2xl border-2 border-foreground bg-card p-6 shadow-lg"
                    : "relative flex flex-col rounded-2xl border border-border bg-card p-6"
                }
              >
                {plan.featured && (
                  <span className="absolute -top-3 left-6 rounded-full bg-foreground px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-primary-foreground">
                    {translate("Được nhiều người chọn")}
                  </span>
                )}

                <h2 className="font-display text-lg font-bold text-foreground">{plan.name}</h2>
                <p className="mt-1.5 min-h-[2.5rem] text-sm leading-relaxed text-muted-foreground">
                  {plan.tagline}
                </p>

                <div className="mt-5 flex items-baseline gap-1.5 border-b border-border pb-5">
                  <span className="font-display text-3xl font-bold tracking-tight text-foreground">
                    {plan.price}
                  </span>
                  <span className="text-xs text-muted-foreground">/ {plan.period}</span>
                </div>

                <ul className="mt-5 flex-1 space-y-2.5">
                  {plan.features.map((f) => (
                    <li
                      key={f.label}
                      className={
                        f.included
                          ? "flex items-start gap-2.5 text-sm text-foreground"
                          : "flex items-start gap-2.5 text-sm text-muted-foreground/70"
                      }
                    >
                      {f.included ? (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                      ) : (
                        <Minus className="mt-0.5 h-4 w-4 shrink-0" />
                      )}
                      <span>{translate(f.label)}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  className="mt-6 w-full"
                  variant={plan.featured ? "default" : "outline"}
                  disabled={buyState(plan.id).disabled || busy !== null}
                  onClick={() => void go(plan.id)}
                >
                  {busy === plan.id ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {translate("Đang mở ZaloPay…")}
                    </>
                  ) : (
                    buyState(plan.id).label
                  )}
                </Button>
              </motion.div>
            ))}
          </div>

          <p className="mt-5 text-center text-xs text-muted-foreground">
            {translate(
              "Một lần thanh toán cho 30 ngày Premium — không tự động trừ tiền, hết hạn thì mua lại nếu muốn.",
            )}
          </p>
        </section>

        {/* Đăng ký quan tâm */}
        <section className="mt-14 rounded-2xl border border-border bg-secondary/40 p-8 text-center">
          <h2 className="font-display text-xl font-bold text-foreground">
            {translate("Cần giúp trước khi mua?")}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {translate(
              "Nhắn một câu trong Discord — mình trả lời trong 24 giờ, kể cả khi bạn chỉ muốn hỏi Premium làm gì.",
            )}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <a href={discordInvite} target="_blank" rel="noreferrer">
                <Sparkles className="h-4 w-4" />
                {translate("Đăng ký qua Discord")}
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/donate">
                <Heart className="h-4 w-4" />
                {translate("Ủng hộ nhà phát triển")}
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <Footer discordInvite={discordInvite} facebookUrl={facebookUrl} />
    </div>
  );
}
