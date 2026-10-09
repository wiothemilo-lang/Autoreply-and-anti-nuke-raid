import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowUp,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Crown,
  Heart,
  Loader2,
  QrCode,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
} from "lucide-react";

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
 * Trang /premium — mua gói Premium 30 ngày qua CHUYỂN KHOẢN QR (Plan A).
 *
 * Vì sao không còn redirect ZaloPay: ZaloPay checkout cần appid/key1/key2
 * (chỉ tổ chức cấp được); QR ví cá nhân không có webhook nên "tiền về chưa"
 * do chủ bot xác nhận. Luồng: bấm Mua → server tạo đơn (createTransferIntent
 * — giá CHẾT tại server) → hiện QR + mã đơn làm NỘI DUNG CHUYỂN KHOẢN riêng
 * từng đơn → khách bấm "Tôi đã chuyển khoản" (reportTransfer — CHỈ báo, chưa
 * có quyền lợi) → chủ bot so sao kê bấm xác nhận (confirmTransfer →
 * markPaidInternal) → GÓC DUY NHẤT ghi entitlement → trang này tự hiện banner
 * "Thanh toán thành công" nhờ subscription Convex real-time.
 * Không tự động gia hạn; chưa đăng nhập → /auth rồi quay lại đây.
 * Chính sách mua bán (kích hoạt ≤24h, hoàn tiền) ở cuối trang.
 */

/**
 * SĐT nhận tiền ZaloPay của chủ bot — điền vào để hiển thị dưới mã QR.
 * Để trống thì dòng SĐT bị ẨN (không bao giờ lộ số sai cho khách mua).
 */
const TRANSFER_PHONE = "";

/** Mã QR nhận tiền (cùng ảnh với /donate — ví cá nhân, quét được mọi app). */
const QR_SRC = "/payment.jpg";

/** Đơn chuyển khoản — mã appTransId chính là nội dung CK đặc thù mỗi đơn. */
type TransferOrder = { appTransId: string; amount: number; plan: string };

interface Plan {
  id: string;
  name: string;
  price: string;
  period: string;
  tagline: string;
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
  },
  {
    id: "supporter",
    name: "Đồng hành",
    price: "49.000đ",
    period: "mỗi tháng",
    tagline: "Dành cho server muốn giữ nhiều dữ liệu và chặn nhiều hơn.",
    featured: true,
  },
  {
    id: "pioneer",
    name: "Tiên phong",
    price: "99.000đ",
    period: "mỗi tháng",
    tagline: "Cho server lớn cần trần dữ liệu cao nhất và chặn tối đa.",
  },
];

/** Thứ hạng gói — mua gói thấp hơn khi gói cao đang hoạt động bị chặn. */
const PREMIUM_PLAN_RANK: Record<string, number> = { supporter: 1, pioneer: 2 };

export default function PremiumPage() {
  const { discordInvite, facebookUrl } = usePublicConfig();
  const navigate = useNavigate();
  const token = getSessionToken();
  const createTransferIntent = useMutation(api.payments.createTransferIntent);
  const reportTransfer = useMutation(api.payments.reportTransfer);
  const premiumStatus = useQuery(api.payments.premiumStatus, token ? { token } : "skip");
  const [busy, setBusy] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  /** Đơn QR ĐANG mở trên trang — null = chưa bấm Mua (hoặc vừa đóng). */
  const [order, setOrder] = useState<TransferOrder | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** Server được mở gói — GÓI THEO SERVER: đơn ghi guildId, hạn mức áp cho server đó. */
  const [server, setServer] = useState("");
  /** Gói đang chờ khách đọc điều khoản + tick đồng ý (null = chưa mở). */
  const [confirmPlan, setConfirmPlan] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  // Subscription real-time: chủ bot xác nhận ở Admin → banner "thành công"
  // tự hiện mà người mua không cần F5 (không poll thủ công).
  const orderStatus = useQuery(
    api.payments.orderStatus,
    token && order ? { token, appTransId: order.appTransId } : "skip",
  );

  // Bảng quyền lợi + phiên bản điều khoản lấy từ MỘT nguồn: convex/plans.ts.
  // Trang bán đọc chính bảng đó nên không thể hứa thứ code không enforce.
  const mine = useQuery(api.guilds.listMine, token ? { token } : "skip");
  const catalog = useQuery(api.plans.catalog, {});
  const serverPlan = useQuery(
    api.plans.guildPlan,
    token && server ? { token, guildId: server } : "skip",
  );
  const servers = mine ?? [];
  /** Server đang chọn — chỉ có 1 server thì mặc định chọn luôn cho đỡ phải bấm. */
  const effectiveServer = server || (servers.length === 1 ? servers[0].discordId : "");
  /**
   * Quyền lợi hiển thị lấy THẲNG từ `catalog` (convex/plans.ts) — cũng chính là
   * bảng server dùng để chặn vượt hạn mức. Nhờ vậy trang bán không thể quảng
   * cáo thứ code không enforce (đúng lỗi cũ: 6 mục "hứa suông" không ai chặn).
   */
  const planBullets = (planId: string): string[] => {
    const lim = catalog?.limits?.[planId as "free" | "supporter" | "pioneer"];
    if (!lim) return [];
    const bullets = [
      translate("Tối đa {n} rule auto reply mỗi server", { n: lim.autoReplyRules }),
      translate("Tối đa {n} từ khoá cấm cho automod", { n: lim.badWords }),
      translate("Giữ {n} bản backup gần nhất", { n: lim.backupKeepCount }),
      translate("Giữ backup trong {n} ngày", { n: lim.backupKeepDays }),
    ];
    if (planId !== "free") {
      bullets.unshift(translate("Giữ nguyên toàn bộ tính năng bảo vệ của gói Miễn phí"));
    }
    return bullets;
  };

  /**
   * Số giờ còn lại tới mốc cam kết 24h của đơn đang mở (âm → đã quá hạn).
   * Tính từ createdAt của ĐƠN trên server, không tin đồng hồ trang.
   */
  const waitHours = (() => {
    const created = orderStatus?.createdAt;
    if (created === undefined) return null;
    return Math.max(0, 24 - (Date.now() - created) / 3_600_000);
  })();

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
    return { disabled: false, label: translate("Chuyển khoản để mua") };
  };

  /**
   * Bước 1 của mua hàng: chọn server + mở hộp XÁC NHẬN ĐIỀU KHOẢN.
   *
   * Vì sao tách khỏi lúc gọi API: khách phải ĐỌC cảnh báo "không nhận ngay" và
   * tự tay tick đồng ý trước khi có mã chuyển khoản. Bấm Mua mà tạo đơn luôn là
   * bán hàng không minh bạch (Luật BVNTD 19/2023/QH15 đòi thông tin TRƯỚC khi
   * giao kết). Chưa đăng nhập → /auth rồi quay lại đây.
   */
  const openConfirm = (planId: string) => {
    if (!token) {
      navigate(`/auth?returnTo=${encodeURIComponent("/premium")}`);
      return;
    }
    if (planId === "free") return;
    if (!effectiveServer) {
      setPayError(translate("Hãy chọn server cần mở gói trước khi mua."));
      return;
    }
    setPayError(null);
    setReportError(null);
    setAgreed(false);
    setConfirmPlan(planId);
  };

  /**
   * Bước 2: khách đã tick đồng ý → tạo mã chuyển khoản (giá chết tại server).
   * Server kiểm LẠI cả ba thứ: server có thuộc quyền khách, đã đồng ý, đúng
   * phiên bản điều khoản — UI không thể "quên".
   */
  const confirmBuy = async () => {
    if (!token || !confirmPlan || !agreed) return;
    const planId = confirmPlan;
    setBusy(planId);
    setPayError(null);
    setReportError(null);
    setCopied(false);
    try {
      const r = await createTransferIntent({
        token,
        kind: "premium",
        plan: planId,
        guildId: effectiveServer,
        consent: true,
        termsVersion: catalog?.termsVersion ?? 0,
      });
      setConfirmPlan(null);
      setOrder({ appTransId: r.appTransId, amount: r.amount, plan: r.plan });
      // Kéo panel vào giữa khung nhìn — khách không phải cuộn tìm.
      requestAnimationFrame(() =>
        document
          .getElementById("transfer-panel")
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      );
    } catch (e) {
      setPayError(
        friendlyConvexError(e, translate("Không tạo được mã chuyển khoản — thử lại sau ít phút.")),
      );
    }
    setBusy(null);
  };

  /** Bấm "Tôi đã chuyển khoản" — CHỈ báo, quyền lợi chờ chủ bot xác nhận. */
  const report = async () => {
    if (!token || !order) return;
    setReporting(true);
    setReportError(null);
    try {
      await reportTransfer({ token, appTransId: order.appTransId });
    } catch (e) {
      setReportError(friendlyConvexError(e, translate("Không báo được trạng thái — thử lại sau.")));
    }
    setReporting(false);
  };

  /** Sao chép mã đơn (nội dung chuyển khoản) — nút hiện "Đã sao chép"2s. */
  const copyCode = async () => {
    if (!order) return;
    try {
      await navigator.clipboard.writeText(order.appTransId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard bị chặn (http/preview) → khách gõ tay, mã vẫn thấy rõ.
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
              {translate("Thanh toán một lần qua chuyển khoản — không tự động gia hạn")}
            </div>
          )}
        </header>

        {/* ── PANEL QR CHUYỂN KHOẢN (Plan A) — hiện khi đã bấm Mua ──────── */}
        {order && (
          <section
            id="transfer-panel"
            aria-label={translate("Chuyển khoản mua gói Premium")}
            className="mt-10 rounded-2xl border-2 border-foreground bg-card p-5 shadow-lg sm:p-7"
          >
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 font-display text-xl font-bold text-foreground">
                  <QrCode className="h-5 w-5" />
                  {translate("Quét mã QR để chuyển khoản")}
                </h2>

                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/50 px-3.5 py-2.5">
                    <dt className="text-muted-foreground">{translate("Số tiền")}</dt>
                    <dd className="font-display text-lg font-bold text-foreground">
                      {`${order.amount.toLocaleString(dateLocale())} ₫`}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-border bg-secondary/50 px-3.5 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">
                        {translate("Nội dung chuyển khoản (bắt buộc)")}
                      </dt>
                      <button
                        type="button"
                        onClick={() => void copyCode()}
                        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
                      >
                        {copied ? (
                          <Check className="h-3.5 w-3.5 text-foreground" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        {copied ? translate("Đã sao chép") : translate("Sao chép")}
                      </button>
                    </div>
                    <dd className="mt-1 break-all font-mono text-base font-bold tracking-tight text-foreground">
                      {order.appTransId}
                    </dd>
                  </div>
                </dl>

                <ol className="mt-4 space-y-2 text-sm leading-relaxed text-foreground">
                  <li className="flex items-start gap-2.5">
                    <span
                      aria-hidden
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground"
                    />
                    {translate("Bước 1: Mở app ngân hàng hoặc ví điện tử, quét mã QR bên phải.")}
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span
                      aria-hidden
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground"
                    />
                    {translate("Bước 2: Chuyển đúng SỐ TIỀN và gõ đúng NỘI DUNG ở trên.")}
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span
                      aria-hidden
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground"
                    />
                    {translate('Bước 3: Bấm nút "Tôi đã chuyển khoản" và chờ xác nhận.')}
                  </li>
                </ol>

                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  {translate("Chủ ví: NGUYEN DUY KHIEM — kiểm tra đúng tên trước khi chuyển")}
                </p>
                {TRANSFER_PHONE && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {translate("SĐT nhận tiền")}: <b className="font-mono">{TRANSFER_PHONE}</b>
                  </p>
                )}
              </div>

              <figure className="mx-auto w-full max-w-xs">
                <img
                  src={QR_SRC}
                  alt={translate("Mã QR nhận chuyển khoản của NGUYEN DUY KHIEM")}
                  width={720}
                  height={960}
                  decoding="async"
                  className="w-full rounded-2xl border border-border bg-white"
                />
                <figcaption className="mt-2 text-center text-xs text-muted-foreground">
                  {translate("Quét được bằng ZaloPay, MoMo, VietQR và app ngân hàng bất kỳ")}
                </figcaption>
              </figure>
            </div>

            {/* Trạng thái đơn — subscription real-time, không cần F5. */}
            <div className="mt-5 border-t border-border pt-4">
              {!orderStatus && (
                <p className="text-sm text-muted-foreground">{translate("đang tải trạng thái…")}</p>
              )}

              {orderStatus?.status === "pending" && (
                <div>
                  {reportError && (
                    <p role="alert" className="mb-2 text-sm font-medium text-danger">
                      {reportError}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={() => void report()} disabled={reporting}>
                      {reporting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      {translate("Tôi đã chuyển khoản")}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setOrder(null)}
                      className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      {translate("Đóng hướng dẫn")}
                    </button>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {translate(
                      "Bấm sau khi bạn ĐÃ chuyển xong — chủ bot so sao kê rồi kích hoạt gói.",
                    )}
                  </p>
                </div>
              )}

              {orderStatus?.status === "reported" && (
                <div
                  role="status"
                  className="flex items-start gap-3 rounded-xl border border-border bg-secondary/50 px-4 py-3"
                >
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold text-foreground">
                      {translate("Đã báo chuyển khoản — chờ chủ bot xác nhận")}
                    </p>
                    <p className="mt-1 leading-relaxed text-muted-foreground">
                      {translate(
                        "Gói được kích hoạt chậm nhất 24 giờ sau khi xác nhận đã nhận tiền (thường là ngay lập tức).",
                      )}
                    </p>
                    {/* Đếm ngược theo cam kết đã công bố — đến hạn là chỉ thẳng
                        chỗ báo chậm, không để khách tự đoán phải làm gì. */}
                    {waitHours !== null && waitHours > 0 && (
                      <p className="mt-1 text-xs font-medium text-foreground">
                        {translate("Còn khoảng {gio} giờ trước mốc cam kết 24 giờ.", {
                          gio: Math.ceil(waitHours),
                        })}
                      </p>
                    )}
                    {waitHours !== null && waitHours <= 0 && (
                      <p className="mt-1 text-xs font-medium text-danger">
                        {translate(
                          "Đã quá cam kết 24 giờ — báo ngay tại Discord kèm mã đơn để được xử lý.",
                        )}{" "}
                        <a
                          href={discordInvite}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-4"
                        >
                          Discord
                        </a>
                      </p>
                    )}
                    <p className="mt-1 leading-relaxed text-muted-foreground">
                      {translate("Quá 24 giờ chưa kích hoạt? Báo tại Discord kèm mã đơn {ma}.", {
                        ma: order.appTransId,
                      })}{" "}
                      <a
                        href={discordInvite}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-foreground underline underline-offset-4"
                      >
                        Discord
                      </a>
                    </p>
                  </div>
                </div>
              )}

              {orderStatus?.status === "paid" && (
                <div
                  role="status"
                  className="flex items-start gap-3 rounded-xl border border-foreground bg-foreground px-4 py-3 text-primary-foreground"
                >
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold">{translate("Thanh toán thành công")}</p>
                    <p className="mt-1 leading-relaxed opacity-90">
                      {premiumStatus?.active
                        ? translate("Gói {goi} đã được kích hoạt — dùng tới {ngay}", {
                            goi: planName(premiumStatus.plan),
                            ngay: formatDate(premiumStatus.expiresAt),
                          })
                        : translate("Gói của bạn đã được kích hoạt. Cảm ơn bạn đã ủng hộ!")}
                    </p>
                  </div>
                </div>
              )}

              {(orderStatus?.status === "expired" || orderStatus?.status === "failed") && (
                <div className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/5 px-4 py-3 text-sm">
                  <p className="min-w-0 leading-relaxed text-foreground">
                    {translate("Đơn này đã hết hạn hoặc bị đóng — hãy tạo mã chuyển khoản mới.")}
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── CHỌN SERVER (gói theo server) + HỘP XÁC NHẬN ĐIỀU KHOẢN ──────── */}
        {token && (
          <section className="mt-10 rounded-2xl border border-border bg-card p-5">
            <label
              htmlFor="buy-server"
              className="flex items-center gap-1.5 font-display text-sm font-bold text-foreground"
            >
              <Server className="h-4 w-4" /> {translate("Server được mở gói")}
            </label>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {translate(
                "Gói áp dụng theo TỪNG SERVER: hạn mức nâng lên chỉ có hiệu lực ở server bạn chọn tại đây.",
              )}{" "}
            </p>
            {servers.length === 0 ? (
              <p className="mt-3 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
                {translate(
                  "Bạn chưa quản lý server nào có bot Protogon — hãy mời bot vào server trước.",
                )}{" "}
              </p>
            ) : (
              <>
                <select
                  id="buy-server"
                  value={effectiveServer}
                  onChange={(e) => setServer(e.target.value)}
                  className="mt-3 w-full max-w-md rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {servers.map((g) => (
                    <option key={g.discordId} value={g.discordId}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-muted-foreground">
                  {serverPlan && serverPlan.plan !== "free" && serverPlan.expiresAt
                    ? translate("Server này đang dùng gói {goi} — hạn tới {ngay}.", {
                        goi: planName(serverPlan.plan),
                        ngay: formatDate(serverPlan.expiresAt),
                      })
                    : translate("Server này đang dùng gói Miễn phí.")}{" "}
                </p>
              </>
            )}
          </section>
        )}

        {confirmPlan && (
          <section
            role="dialog"
            aria-label={translate("Xác nhận mua gói")}
            className="mt-6 rounded-2xl border-2 border-foreground bg-card p-5 shadow-lg"
          >
            <h2 className="font-display text-lg font-bold text-foreground">
              {translate("Xác nhận mua gói {goi}", { goi: planName(confirmPlan) })}
            </h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
              <li className="flex items-start gap-2">
                <Terminal className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                {translate(
                  "Gói KHÔNG được cấp tự động — bạn chỉ nhận được sau khi admin kiểm tra và kích hoạt.",
                )}{" "}
              </li>
              <li className="flex items-start gap-2">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                {translate(
                  "Thời gian kích hoạt chậm nhất 24 giờ kể từ khi xác nhận đã nhận tiền; nhanh hơn thì thường là ngay.",
                )}{" "}
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                {translate(
                  'Sau khi chuyển khoản, bấm "Tôi đã chuyển khoản" để admin đối soát đúng đơn của bạn.',
                )}{" "}
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                {translate(
                  "Quá 24 giờ chưa kích hoạt thì báo tại Discord chủ bot kèm mã đơn — hoàn 100% nếu lỗi từ phía dịch vụ.",
                )}{" "}
              </li>
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              {translate("Server được mở:")}{" "}
              <b className="text-foreground">
                {servers.find((g) => g.discordId === effectiveServer)?.name ?? effectiveServer}
              </b>
            </p>
            <label className="mt-4 flex items-start gap-2.5 text-sm text-foreground">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span>
                {translate(
                  "Tôi đã đọc và đồng ý Điều khoản dịch vụ cùng Chính sách mua bán — hiểu rằng gói không được cấp tự động và chỉ được kích hoạt sau khi admin xác nhận, chậm nhất 24 giờ.",
                )}{" "}
              </span>
            </label>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button disabled={!agreed || busy !== null} onClick={() => void confirmBuy()}>
                {busy !== null ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {translate("Tôi đồng ý và tạo mã chuyển khoản")}
              </Button>
              <button
                type="button"
                onClick={() => setConfirmPlan(null)}
                className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {translate("Đóng")}
              </button>
            </div>
            {payError && (
              <p role="alert" className="mt-3 text-sm font-medium text-danger">
                {payError}
              </p>
            )}
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {translate("Điều khoản phiên bản {v}.", { v: catalog?.termsVersion ?? 1 })}{" "}
              <Link
                to="/terms"
                className="font-medium text-foreground underline underline-offset-4"
              >
                {translate("Điều khoản dịch vụ")}
              </Link>
              {" · "}
              <a
                href="#chinh-sach-mua-ban"
                className="font-medium text-foreground underline underline-offset-4"
              >
                {translate("Chính sách mua bán")}
              </a>
            </p>
          </section>
        )}

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
                  {planBullets(plan.id).map((label) => (
                    <li key={label} className="flex items-start gap-2.5 text-sm text-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                      <span>{label}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  className="mt-6 w-full"
                  variant={plan.featured ? "default" : "outline"}
                  disabled={buyState(plan.id).disabled || busy !== null}
                  onClick={() => openConfirm(plan.id)}
                >
                  {busy === plan.id ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {translate("Đang tạo mã chuyển khoản…")}
                    </>
                  ) : (
                    buyState(plan.id).label
                  )}
                </Button>
                {plan.id !== "free" && (
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    {translate(
                      "Gói không được cấp tự động: sau khi chuyển khoản, admin đối soát rồi kích hoạt — chậm nhất 24 giờ.",
                    )}{" "}
                  </p>
                )}
              </motion.div>
            ))}
          </div>

          <p className="mt-5 text-center text-xs text-muted-foreground">
            {translate(
              "Một lần thanh toán cho 30 ngày Premium — không tự động trừ tiền, hết hạn thì mua lại nếu muốn.",
            )}
          </p>
        </section>

        {/* ── CHÍNH SÁCH MUA BÁN — ghi rõ cam kết pháp lý & bù đắp khi chậm ── */}
        <section
          id="chinh-sach-mua-ban"
          aria-label={translate("Chính sách mua bán & cam kết dịch vụ")}
          style={{ scrollMarginTop: "5rem" }}
          className="mt-14 rounded-2xl border border-border bg-card p-6 sm:p-8"
        >
          <h2 className="flex items-center gap-2 font-display text-xl font-bold text-foreground">
            <ShieldCheck className="h-5 w-5" />
            {translate("Chính sách mua bán & cam kết dịch vụ")}
          </h2>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              {translate(
                "Gói Premium có hiệu lực 30 ngày kể từ khi thanh toán được xác nhận. Mỗi lần mua là một giao dịch riêng, không tự động gia hạn và không lưu thông tin thẻ hay tài khoản ngân hàng của bạn.",
              )}
            </p>
            <p>
              <b className="text-foreground">
                {translate("Thời gian kích hoạt — chậm nhất 24 giờ:")}
              </b>{" "}
              {translate(
                "thường là ngay sau khi chủ bot xác nhận đã nhận tiền; trong mọi trường hợp gói được kích hoạt chậm nhất 24 giờ kể từ thời điểm đó.",
              )}
            </p>
            <p>
              <b className="text-foreground">{translate("Quá 24 giờ thì sao:")}</b>{" "}
              {translate(
                "nếu quá 24 giờ chưa được kích hoạt, hãy báo tại Discord của chủ bot kèm MÃ ĐƠN (nội dung chuyển khoản). Khiếu nại được xử lý trong 24 giờ tiếp theo; nếu vẫn không kích hoạt được vì lỗi từ phía dịch vụ, bạn được HOÀN 100% số tiền đã chuyển.",
              )}
            </p>
            <p>
              <b className="text-foreground">{translate("Hoàn tiền:")}</b>{" "}
              {translate(
                "hoàn 100% trong 7 ngày kể từ khi xác nhận nếu lỗi phát sinh từ phía dịch vụ khiến bạn không dùng được gói (không kích hoạt, lỗi kéo dài không khắc phục được). Dịch vụ là phần mềm phi vật thể nên không áp dụng đổi trả hàng hóa; khiếu nại xử lý theo hướng hoàn tiền hoặc kích hoạt lại, do bạn chọn.",
              )}
            </p>
            <p>
              <b className="text-foreground">{translate("Thanh toán an toàn:")}</b>{" "}
              {translate(
                "chỉ quét mã QR do trang này hiển thị và kiểm tra đúng chủ ví NGUYEN DUY KHIEM trước khi chuyển. Chủ bot KHÔNG BAO GIỜ yêu cầu bạn cung cấp mật khẩu ví, mã OTP hay thông tin thẻ.",
              )}
            </p>
            <p>
              <b className="text-foreground">{translate("Cơ sở pháp lý:")}</b>{" "}
              {translate(
                "giao dịch được lập bằng hình thức điện tử theo Bộ luật Dân sự 2015 (Điều 119); quyền lợi người tiêu dùng theo Luật Bảo vệ quyền lợi người tiêu dùng số 19/2023/QH15; mua bán qua trang mạng theo Luật Thương mại điện tử số 51/2005/QH11 (sửa đổi, bổ sung). Khiếu nại gửi qua Discord của chủ bot và được phản hồi trong 48 giờ.",
              )}
            </p>
            <p className="text-xs">
              {translate(
                "Bằng việc bấm mua, bạn xác nhận đã đọc chính sách này. Thanh toán là giao dịch giữa bạn và chủ ví được nêu trên — Protogon chỉ lưu mã đơn và trạng thái để kích hoạt gói.",
              )}
            </p>
          </div>
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
