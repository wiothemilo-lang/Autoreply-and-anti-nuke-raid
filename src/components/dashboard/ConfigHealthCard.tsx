import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, ShieldAlert, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { evaluateConfigHealth, healthGrade, type HealthTarget } from "../../lib/configHealth";
import type { GuildData } from "../../lib/types";
import { translate } from "../../lib/i18n";

/**
 * Thẻ "Điểm cấu hình" — con số 0–100 kèm danh sách việc còn thiếu, bấm là mở
 * thẳng panel cần sửa (đợt #4, nâng cấp UI phần A).
 *
 * Vì sao tách riêng khỏi OverviewPanel: phần chấm điểm nằm ở `lib/configHealth`
 * (hàm thuần, test được không cần DOM), phần hiển thị nằm ở đây. Test không
 * cần dựng React, còn UI vẫn đổi tự do.
 *
 * `onNavigate` do GuildPage truyền vào: bấm phải mở ĐÚNG panel đang cần sửa,
 * không phải chỉ bảo "hãy tự tìm" — đó là toàn bộ giá trị của việc chấm điểm.
 */
export default function ConfigHealthCard({
  data,
  onNavigate,
}: {
  data: GuildData;
  onNavigate?: (target: HealthTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  const { score, issues } = evaluateConfigHealth(data.guild);
  const grade = healthGrade(score);

  // Bot chưa ở trong server thì không chấm (xem lib/configHealth.ts).
  if (data.guild.botInGuild === false) return null;

  // Badge chỉ có success/danger trong bộ hiện tại → mức "cần xem lại" dùng
  // danger cho thẳng tính mạo hiểm thay vì tạo màu mới chỉ dùng ở đúng 1 chỗ.
  const tone = grade.tone === "ok" ? "success" : "danger";
  const barColor = score >= 80 ? "bg-success" : score >= 50 ? "bg-warning" : "bg-danger";

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-foreground">
              {score >= 80 ? (
                <ShieldCheck className="h-5 w-5" />
              ) : (
                <ShieldAlert className="h-5 w-5" />
              )}
            </span>
            <div>
              <p className="font-display font-semibold">
                {translate("Điểm cấu hình")}{" "}
                <Badge variant={tone} className="ml-2">
                  {translate(grade.label)}
                </Badge>
              </p>
              <p className="text-xs text-muted-foreground">
                {issues.length === 0
                  ? translate("Đã bật đủ các lớp bảo vệ chính.")
                  : `${issues.length} ${translate("lớp bảo vệ chưa bật")}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-display text-2xl font-bold tabular-nums">{score}</span>
            {issues.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {translate(open ? "Thu gọn" : "Xem chi tiết")}
              </Button>
            )}
          </div>
        </div>

        {/* Thanh điểm: nhìn bằng mắt nhanh hơn đọc con số trần. */}
        <div
          className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-secondary"
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={translate("Điểm cấu hình")}
        >
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${score}%` }} />
        </div>

        {open && issues.length > 0 && (
          <ul className="mt-4 space-y-2">
            {issues.map((issue) => (
              <li
                key={issue.key}
                className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <AlertTriangle
                      className={
                        issue.level === "critical"
                          ? "h-4 w-4 shrink-0 text-danger"
                          : "h-4 w-4 shrink-0 text-warning"
                      }
                    />
                    {translate(issue.label)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{translate(issue.hint)}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => onNavigate?.(issue.target)}
                >
                  {translate("Mở panel")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
