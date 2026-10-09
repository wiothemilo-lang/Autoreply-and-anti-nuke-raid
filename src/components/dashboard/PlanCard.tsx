import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { Crown, Sparkles } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { api } from "../../../convex/_generated/api";
import { getSessionToken } from "../../lib/discord";
import { dateLocale, translate } from "../../lib/i18n";

/**
 * Thẻ "Gói của server" — trả lời ngay câu hỏi mà trước đây dashboard không trả
 * lời được: server này đang ở gói nào, còn bao nhiêu ngày, và hạn mức thật là gì.
 *
 * Vì sao cần: gói được bán ở /premium nhưng KHÔNG hiện ở nơi người ta làm việc
 * hằng ngày. Khách trả tiền xong không thấy khác biệt (đúng lỗi 08/10: 6 tính
 * năng quảng cáo mà không ai enforce), và gói hết hạn thì âm thầm mất quyền.
 *
 * Nguồn số liệu: `api.plans.guildPlan` — CÙNG bảng hạn mức mà mutation dùng để
 * chặn vượt (convex/plans.ts), nên thẻ này không thể hiển thị sai quyền lợi.
 */
export default function PlanCard({ guildId }: { guildId: string }) {
  const token = getSessionToken();
  const plan = useQuery(api.plans.guildPlan, token ? { token, guildId } : "skip");
  if (!plan) return null;

  const daysLeft = plan.expiresAt
    ? Math.max(0, Math.ceil((plan.expiresAt - Date.now()) / 86_400_000))
    : 0;
  const isPaid = plan.plan !== "free";
  // Nhắc trước ≤3 ngày: hết hạn là hạn mức tụt về gói Miễn phí ngay, nếu khách
  // không biết trước thì đó là mất mát âm thầm chứ không phải chính sách.
  const endingSoon = isPaid && daysLeft <= 3;

  // Nhãn giữ nguyên tiếng Việt (khoá dịch) — dịch lúc render để đổi ngôn ngữ
  // là đổi ngay; khớp quy ước chung của repo (tránh "mảng VI render thẳng").
  const limits: { label: string; value: string }[] = [
    { label: "Rule auto reply", value: String(plan.limits.autoReplyRules) },
    { label: "Từ khoá cấm", value: String(plan.limits.badWords) },
    { label: "Bản backup giữ", value: String(plan.limits.backupKeepCount) },
    { label: "Ngày giữ backup", value: String(plan.limits.backupKeepDays) },
  ];

  return (
    <Card className="card-hover">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground text-primary-foreground">
            <Crown className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-display text-base font-bold">
              {translate("Gói {goi}", { goi: plan.labels[plan.plan] })}
              {isPaid && (
                <Badge variant="secondary" className="text-[10px]">
                  {translate("còn {n} ngày", { n: daysLeft })}
                </Badge>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {isPaid && plan.expiresAt
                ? translate("Đang áp dụng cho server này — hạn tới {ngay}.", {
                    ngay: new Date(plan.expiresAt).toLocaleDateString(dateLocale()),
                  })
                : translate("Server đang dùng gói Miễn phí — mọi hạn mức ở mức cơ bản.")}
            </p>
          </div>
          <Link
            to="/premium"
            className="ml-auto shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
          >
            {isPaid ? translate("Gia hạn") : translate("Nâng gói")}
          </Link>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {limits.map((l) => (
            <div
              key={l.label}
              className="rounded-lg border border-border bg-secondary/40 px-3 py-2"
            >
              <dt className="text-[11px] text-muted-foreground">{translate(l.label)}</dt>
              <dd className="font-display text-lg font-bold leading-tight">{l.value}</dd>
            </div>
          ))}
        </dl>

        {endingSoon && (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-warn/50 bg-warn/10 px-3 py-2 text-xs font-medium text-foreground">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {translate(
              "Gói sắp hết hạn — hết hạn là hạn mức trở về mức Miễn phí ngay. Gia hạn để giữ nguyên.",
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
