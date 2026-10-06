import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAction } from "convex/react";
import { AlertTriangle, CheckCircle2, Loader2, LogIn, XCircle } from "lucide-react";

import { Button } from "./ui/button";
import { api } from "../../convex/_generated/api";
import { dateLocale, translate } from "../lib/i18n";

/**
 * Banner kết quả thanh toán ZaloPay — dùng chung cho /donate và /premium.
 *
 * Vì sao PHẢI query lại thay vì tin `?order=`: tham số URL đổi được dễ như
 * gõ địa chỉ — chỉ trạng thái server (đã verify MAC key2/key1 ở backend) mới
 * nói được tiền đã về chưa. Trang trả về gọi `paymentsAction.queryOrder`,
 * nếu callback IPN bị lỡ thì query này vẫn chốt tiền (khuyến nghị Option 2
 * trong docs ZaloPay). Sau khi "Hoàn tất", param bị xoá để quay về trạng thái
 * thường — reload trang không hiện lại banner cũ.
 */
type Status = "idle" | "checking" | "paid" | "pending" | "failed" | "error" | "need-login";

interface PayResult {
  kind: "donate" | "premium";
  plan: string;
  amount: number;
}

export default function PaymentReturn({ token }: { token: string | null }) {
  const [params, setParams] = useSearchParams();
  const order = params.get("order");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<PayResult | null>(null);
  const queryOrder = useAction(api.paymentsAction.queryOrder);

  useEffect(() => {
    if (!order) {
      setStatus("idle");
      setResult(null);
      return;
    }
    if (!token) {
      setStatus("need-login");
      return;
    }
    let cancelled = false;
    setStatus("checking");
    const run = async () => {
      // Tối đa 4 lượt cách nhau 2.5s — callback tới chậm thì polling vẫn bắt kịp.
      for (let attempt = 0; attempt < 4; attempt++) {
        if (cancelled) return;
        try {
          const r = await queryOrder({ token, appTransId: order });
          if (cancelled) return;
          setResult({ kind: r.kind, plan: r.plan, amount: r.amount });
          if (r.status === "paid") {
            setStatus("paid");
            return;
          }
          if (r.status === "failed" || r.status === "expired") {
            setStatus("failed");
            return;
          }
          setStatus("pending");
        } catch {
          if (!cancelled) setStatus("error");
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [order, token, queryOrder]);

  if (status === "idle") return null;

  const done = () => {
    setParams({}, { replace: true });
    setStatus("idle");
    setResult(null);
  };

  const box =
    "mt-8 flex flex-col items-center gap-3 rounded-2xl border border-border bg-secondary/60 p-6 text-center";
  // Theo ngôn ngữ người dùng (dateLocale) — hardcode locale ngày là bug test-i18n chặn.
  const amountText = result ? result.amount.toLocaleString(dateLocale()) : "";

  if (status === "checking") {
    return (
      <div className={box} role="status">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{translate("Đang xác nhận thanh toán…")}</p>
        <p className="text-xs text-muted-foreground/70">
          {translate("Mã đơn")}: <span className="font-mono">{order}</span>
        </p>
      </div>
    );
  }

  if (status === "paid") {
    const body =
      result?.kind === "premium"
        ? translate("Đã thanh toán {so}đ qua ZaloPay — gói {goi} đã kích hoạt.", {
            so: amountText,
            goi: result?.plan ?? "",
          })
        : translate(
            "Đã thanh toán {so}đ qua ZaloPay. Cảm ơn bạn đã giữ Protogon mở cửa miễn phí.",
            {
              so: amountText,
            },
          );
    return (
      <div className={box} role="status">
        <CheckCircle2 className="h-6 w-6 text-foreground" />
        <p className="font-display text-lg font-bold text-foreground">
          {translate("Thanh toán thành công — cảm ơn bạn!")}
        </p>
        <p className="max-w-xl text-sm text-muted-foreground">{body}</p>
        <Button onClick={done} className="mt-1">
          {translate("Hoàn tất")}
        </Button>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className={box} role="status">
        <AlertTriangle className="h-6 w-6 text-foreground" />
        <p className="font-display text-lg font-bold text-foreground">
          {translate("Chưa nhận được xác nhận")}
        </p>
        <p className="max-w-xl text-sm text-muted-foreground">
          {translate(
            "ZaloPay chưa báo giao dịch thành công. Nếu bạn ĐÃ thanh toán, quay lại trang này sau vài phút — tiền không bị mất.",
          )}
        </p>
        <p className="text-xs text-muted-foreground/70">
          {translate("Mã đơn")}: <span className="font-mono">{order}</span>
        </p>
        <Button onClick={done} variant="outline" className="mt-1">
          {translate("Hoàn tất")}
        </Button>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className={box} role="status">
        <XCircle className="h-6 w-6 text-foreground" />
        <p className="font-display text-lg font-bold text-foreground">
          {translate("Thanh toán thất bại")}
        </p>
        <p className="max-w-xl text-sm text-muted-foreground">
          {translate("Giao dịch bị huỷ hoặc không thành công — chưa có khoản tiền nào bị trừ.")}
        </p>
        <Button onClick={done} variant="outline" className="mt-1">
          {translate("Hoàn tất")}
        </Button>
      </div>
    );
  }

  if (status === "need-login") {
    return (
      <div className={box} role="status">
        <LogIn className="h-6 w-6 text-foreground" />
        <p className="font-display text-lg font-bold text-foreground">
          {translate("Đăng nhập lại để kiểm tra đơn")}
        </p>
        <p className="max-w-xl text-sm text-muted-foreground">
          {translate("Phiên đăng nhập cần thiết để xem trạng thái đơn thanh toán này.")}
        </p>
        <Button asChild className="mt-1">
          <Link to="/auth">{translate("Đăng nhập")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className={box} role="status">
      <XCircle className="h-6 w-6 text-foreground" />
      <p className="font-display text-lg font-bold text-foreground">
        {translate("Không kiểm tra được trạng thái")}
      </p>
      <p className="max-w-xl text-sm text-muted-foreground">
        {translate("Lỗi kết nối — thử lại sau ít phút.")}
      </p>
      <Button onClick={done} variant="outline" className="mt-1">
        {translate("Hoàn tất")}
      </Button>
    </div>
  );
}
