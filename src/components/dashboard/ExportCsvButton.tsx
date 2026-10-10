import { useState } from "react";
import { useConvex, useQuery } from "convex/react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { api } from "../../../convex/_generated/api";
import { getSessionToken } from "../../lib/discord";
import { downloadTextFile } from "../../lib/utils";
import { friendlyConvexError } from "../../lib/convexError";
import { translate } from "../../lib/i18n";

/** Ba loại dữ liệu xuất được — khớp union trong convex/dataExport.ts. */
export type ExportKind = "modActions" | "events" | "heat";

const KIND_LABEL: Record<ExportKind, string> = {
  modActions: "Xuất log hành động (CSV)",
  events: "Xuất sự kiện chống nuke (CSV)",
  heat: "Xuất bảng nhiệt (CSV)",
};

/**
 * Nút TẢI DỮ LIỆU RA CSV (P2–P3, 10/10/2026).
 *
 * Vì sao là một component dùng chung thay vì ba nút viết tay: trần dòng/ngày
 * phải hiển thị ĐÚNG bằng con số server sẽ cắt — cả ba chỗ dùng cùng một nhãn
 * lấy từ `plans.guildPlan` (chính bảng mà query xuất dùng để chặn), nên nút
 * không thể hứa nhiều hơn file thật.
 *
 * Vì sao gọi `convex.query` theo yêu cầu (useConvex) chứ không `useQuery`:
 * subscription cho một file CSV là đốt reads liên tục để theo dõi dữ liệu chỉ
 * cần đúng một lần khi người dùng bấm. `useQuery` chỉ dùng cho hạn mức gói
 * (nhẹ, có cache của client).
 */
export default function ExportCsvButton({ guildId, kind }: { guildId: string; kind: ExportKind }) {
  const token = getSessionToken();
  const convex = useConvex();
  const plan = useQuery(api.plans.guildPlan, token ? { token, guildId } : "skip");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const limits = plan?.limits;
  const rows = kind === "heat" ? limits?.heatTopRows : limits?.exportRows;
  const days = limits?.exportDays;
  const label =
    rows && days
      ? translate("{ten} — tối đa {n} dòng · {d} ngày", {
          ten: KIND_LABEL[kind],
          n: rows,
          d: days,
        })
      : KIND_LABEL[kind];

  const run = async () => {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await convex.query(api.dataExport.exportGuildCsv, { token, guildId, kind });
      if (!res) {
        setError(translate("Không xuất được dữ liệu của server này."));
        return;
      }
      downloadTextFile(res.filename, res.csv);
    } catch (e) {
      setError(friendlyConvexError(e, translate("Không xuất được dữ liệu — thử lại sau ít phút.")));
    } finally {
      setBusy(false);
    }
  };

  return (
    // `mt-3` để nút tách khỏi hàng tiêu đề panel ở mọi nơi gắn vào.
    <div className="flex flex-col items-start gap-1.5">
      <Button variant="outline" size="sm" disabled={busy || !token} onClick={() => void run()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {label}
      </Button>
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
