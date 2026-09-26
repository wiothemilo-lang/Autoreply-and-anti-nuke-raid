import { useMemo } from "react";
import { AtSign, Check, CloudUpload, DoorOpen, FileText, PartyPopper, Webhook } from "lucide-react";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import type { GuildData } from "../../lib/types";
import { translate } from "../../lib/i18n";

/**
 * Onboarding checklist (W1) — server mới thường "chết yểu" vì chủ server không
 * biết bắt đầu từ đâu. Checklist 5 bước derive TRỰC TIẾP từ GuildData đã có
 * (không mutation mới, không đụng schema): mỗi bước điều kiện hoàn thành là
 * một cấu hình thật sự hoạt động trên bot, không phải trạng thái tick tay —
 * người dùng bấm "Cấu hình" là tới đúng panel, làm xong bước tự chuyển xanh.
 *
 * Chỉ hiện khi chưa hoàn tất (tất cả xanh là ẩn luôn — đừng chiếm chỗ).
 */

type StepStatus = "done" | "todo";

interface Step {
  key: string;
  icon: typeof AtSign;
  label: string;
  hint: string;
  target: "overview" | "webhooks" | "welcome" | "hidden" | "joingate" | "backup" | "settings";
  status: StepStatus;
}

export function onboardingSteps(data: GuildData): Step[] {
  const g = data.guild;
  return [
    {
      key: "logchannel",
      icon: Webhook,
      label: translate("Chọn kênh nhận log sự kiện"),
      hint: translate(
        "Mọi cảnh báo nuke/raid, hình phạt và backup đều cần kênh log để bạn nhìn thấy.",
      ),
      target: "webhooks",
      status: g.logChannelId || g.modLogChannelId ? "done" : "todo",
    },
    {
      key: "welcome",
      icon: PartyPopper,
      label: translate("Bật lời chào thành viên mới"),
      hint: translate("Bot tự chào người vào server — làm server thân thiện ngay từ giây đầu."),
      target: "welcome",
      status: g.welcomeEnabled && g.welcomeChannelId ? "done" : "todo",
    },
    {
      key: "autoreply",
      icon: AtSign,
      label: translate("Tạo rule auto reply đầu tiên"),
      hint: translate(
        'Thử khối "Thử rule" ngay trong panel để xem bot sẽ trả lời gì trước khi lưu.',
      ),
      target: "hidden",
      status: data.autoReplies.some((r) => r.enabled) ? "done" : "todo",
    },
    {
      key: "joingate",
      icon: DoorOpen,
      label: translate("Bật Join Gate chống acc ảo"),
      hint: translate("Lọc acc mới lập bằng tuổi tài khoản / avatar trước khi vào được server."),
      target: "joingate",
      status: g.joinGateEnabled ? "done" : "todo",
    },
    {
      key: "backup",
      icon: CloudUpload,
      label: translate("Bật backup tự động để chống nuke"),
      hint: translate("Snapshot role/kênh định kỳ — bị nuke là khôi phục lại trong vài phút."),
      target: "backup",
      status: g.backupAutoDays > 0 ? "done" : "todo",
    },
  ];
}

export default function OnboardingChecklist({
  data,
  onOpenSection,
}: {
  data: GuildData;
  onOpenSection: (key: Step["target"]) => void;
}) {
  const steps = useMemo(() => onboardingSteps(data), [data]);
  const doneCount = steps.filter((s) => s.status === "done").length;
  const complete = doneCount === steps.length;

  if (complete) return null;

  const percent = Math.round((doneCount / steps.length) * 100);

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-base font-semibold">
                {translate("Thiết lập server trong 5 bước")}
              </h2>
              <Badge variant="secondary">
                {doneCount}/{steps.length}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {translate("Làm xong mỗi bước là tự chuyển xanh — bot sẵn sàng canh server.")}
            </p>
          </div>
        </div>

        {/* Thanh tiến trình — bám token thiết kế hiện có */}
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={translate("Tiến độ thiết lập")}
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>

        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {steps.map((step) => {
            const done = step.status === "done";
            const Icon = step.icon;
            return (
              <li key={step.key} className={cnCardItem(done)}>
                <span
                  className={
                    done
                      ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                      : "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground"
                  }
                >
                  {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={
                      done
                        ? "text-sm font-medium text-muted-foreground line-through"
                        : "text-sm font-medium text-foreground"
                    }
                  >
                    {translate(step.label)}
                  </p>
                  {!done && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{translate(step.hint)}</p>
                  )}
                </div>
                {!done && (
                  <Button variant="outline" size="sm" onClick={() => onOpenSection(step.target)}>
                    {translate("Cấu hình")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>

        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          {translate("Cấu hình mới tới bot sau khoảng 1 phút qua Convex.")}
        </p>
      </CardContent>
    </Card>
  );
}

/** item đang làm viền nổi nhẹ, item xong mờ đi — giúp mắt dừng ở việc cần làm. */
function cnCardItem(done: boolean): string {
  return done
    ? "flex items-start gap-3 rounded-xl border border-border/60 bg-secondary/20 p-3 opacity-60"
    : "flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-3";
}
