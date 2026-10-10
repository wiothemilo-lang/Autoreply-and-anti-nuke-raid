import { Gavel, ShieldCheck } from "lucide-react";
import { Badge } from "../ui/badge";
import { Card, CardContent } from "../ui/card";
import ExportCsvButton from "./ExportCsvButton";
import type { GuildData } from "../../lib/types";

import { dateLocale, translate } from "../../lib/i18n";
const ACTION_STYLE: Record<string, string> = {
  "⏱️ Timeout": "bg-foreground/10 text-foreground border border-foreground/20",
  "👢 Kick": "bg-foreground/20 text-foreground border border-foreground/30",
  "🚫 Ban": "bg-danger text-danger-foreground",
  "🧹 Purge": "bg-secondary text-secondary-foreground border border-border",
};

function styleFor(action: string): string {
  if (action.includes("Timeout")) return ACTION_STYLE["⏱️ Timeout"];
  if (action.includes("Kick")) return ACTION_STYLE["👢 Kick"];
  if (action.includes("Ban")) return ACTION_STYLE["🚫 Ban"];
  if (action.includes("Purge")) return ACTION_STYLE["🧹 Purge"];
  return "bg-secondary text-secondary-foreground border border-border";
}

/** Nhãn hành động: dữ liệu do bot ghi nên phần chữ tiếng Việt (bản cũ) được dịch
 *  ngay tại đây — translate() trả về nguyên chuỗi nếu không có trong từ điển,
 *  nên dữ liệu kỹ thuật ("timeout · case 30") không bị đổi. */
function labelFor(action: string): string {
  if (action.includes("Tự động")) return `⚡ ${translate(action.replace("Tự động: ", ""))}`;
  return `🛠️ ${translate(action)}`;
}

/** Nguồn của hành động: "mod" = lệnh thủ công của mod, "bot" = bot tự động.
 *  Trả khóa ổn định (không phải chuỗi hiển thị) để nhãn dịch được theo ngôn ngữ. */
function sourceOf(a: { executorId: string | null; executorName: string | null }) {
  return a.executorId || a.executorName ? "mod" : "bot";
}

export default function ModActionsPanel({ data }: { data: GuildData }) {
  const actions = data.modActions ?? [];

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-display font-semibold">
              <Gavel className="h-4 w-4 text-primary" /> {translate("Bảng hình phạt")}{" "}
            </h3>
            <p className="text-sm text-muted-foreground">
              {translate("Timeout · kick · ban · warn · purge — ghi kèm")} <b>case N</b>{" "}
              {translate("(hình phạt, lý do, người xử lý) và tách rõ nguồn:")}{" "}
              <b className="text-foreground">{translate("🛠️ lệnh thủ công của mod")}</b> vs{""}
              <b className="text-foreground">{translate("⚡ bot tự động")}</b> (auto-mod / anti
              nuke).
            </p>
          </div>
          <Badge variant="secondary">
            {actions.length} {translate("hành động gần nhất")}
          </Badge>
        </div>
        {/* Xuất CSV: gói Miễn phí đã xuất được (100 dòng / 90 ngày), gói trả phí
            xuất nhiều hơn — con số trên nút lấy từ plans.guildPlan, cùng bảng mà
            query xuất dùng để cắt, nên nút không thể hứa quá file thật. */}
        <div className="mt-3">
          <ExportCsvButton guildId={data.guild.discordId} kind="modActions" />
        </div>

        {actions.length === 0 ? (
          <div className="mt-4 flex items-center gap-3 rounded-lg bg-secondary/40 px-3 py-3 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            {translate("Chưa có hình phạt nào — server đang yên bình 🎉")}{" "}
          </div>
        ) : (
          <div className="mt-4 -mx-1 overflow-x-auto px-1 [scrollbar-width:thin]">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">{translate("Thời gian")}</th>
                  <th className="py-2 pr-3 font-medium">{translate("Hình phạt")}</th>
                  <th className="py-2 pr-3 font-medium">{translate("Nguồn")}</th>
                  <th className="py-2 pr-3 font-medium">{translate("Thành viên")}</th>
                  <th className="py-2 pr-3 font-medium">{translate("Người thực hiện")}</th>
                  <th className="py-2 pr-3 font-medium">{translate("Lý do")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {actions.map((a) => (
                  <tr key={a._id} className="align-top">
                    <td className="py-2.5 pr-3 whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(a.createdAt).toLocaleString(dateLocale(), {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-2.5 pr-3">
                      <Badge className={styleFor(a.action)}>
                        {labelFor(a.action)}
                        {a.caseNumber ? ` · case ${a.caseNumber}` : ""}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-3">
                      <Badge
                        className={
                          sourceOf(a) === "mod"
                            ? "gap-1 bg-secondary text-secondary-foreground border border-border"
                            : "gap-1 bg-foreground/10 text-foreground border border-foreground/20"
                        }
                      >
                        {translate(sourceOf(a) === "mod" ? "🛠️ Lệnh mod" : "⚡ Bot tự động")}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-3">
                      <p className="font-medium">{a.targetName || a.targetId || "—"}</p>
                      {a.targetId && (
                        <p className="font-mono text-[10px] text-muted-foreground">{a.targetId}</p>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      <p className="text-muted-foreground">
                        {a.executorName || a.executorId || "—"}
                      </p>
                    </td>
                    <td className="py-2.5 pr-3 text-muted-foreground">
                      <p>{a.reason || a.details || translate("Không có")}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
