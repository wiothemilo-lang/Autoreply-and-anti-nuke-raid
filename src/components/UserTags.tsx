import { Crown, ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "../lib/utils";
import { translate } from "../lib/i18n";

/**
 * Nhãn cạnh logo người dùng: **Owner** (chủ sở hữu bot), **Admin** (quản trị
 * viên nhóm do chủ bot thêm) và nhãn **gói premium** đang hiệu lực.
 *
 * Một component dùng ở nhiều chỗ (header Dashboard, danh sách quản trị viên
 * trong cửa sổ Admin) để ba chỗ này không thể vẽ sai ý nghĩa của nhau: chủ bot
 * LUÔN là admin (isBotAdminUser trả true cho owner) nên chỉ hiện Owner — tránh
 * hai nhãn trùng cho cùng một người.
 *
 * `plan` nhận thẳng chuỗi gói từ server (`payments.premiumStatus` /
 * `hidden.getTeamAdmins`) — nhãn dịch lúc render theo khoá tiếng Việt, đúng
 * quy ước của repo.
 */
export default function UserTags({
  isOwner,
  isAdmin,
  plan,
  className,
}: {
  isOwner?: boolean;
  isAdmin?: boolean;
  /** "supporter" | "pioneer" — null/undefined = không có gói hiệu lực. */
  plan?: string | null;
  className?: string;
}) {
  const planLabel =
    plan === "supporter"
      ? translate("Đồng hành")
      : plan === "pioneer"
        ? translate("Tiên phong")
        : null;
  if (!isOwner && !isAdmin && !planLabel) return null;

  return (
    <span className={cn("flex flex-wrap items-center gap-1", className)}>
      {isOwner ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
          <Crown className="h-3 w-3" aria-hidden />
          {translate("Owner")}
        </span>
      ) : (
        isAdmin && (
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-secondary-foreground">
            <ShieldCheck className="h-3 w-3" aria-hidden />
            {translate("Admin")}
          </span>
        )
      )}
      {planLabel && (
        <span className="inline-flex items-center gap-1 rounded-full border border-warn/40 bg-warn/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warn">
          <Sparkles className="h-3 w-3" aria-hidden />
          {planLabel}
        </span>
      )}
    </span>
  );
}
