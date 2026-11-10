import { CalendarClock, RefreshCw } from "lucide-react";
import { fmtVietnam, SYNC_INTERVAL_MS } from "../lib/useBotMonitor";

import { translate } from "../lib/i18n";
/**
 * Khung giờ cập nhật của bot — hiển thị theo giờ Việt Nam (UTC+7).
 * Dùng chung cho trang Giám sát bot và Cửa sổ Admin (liên kết với nhau);
 * Admin có thêm nút "Cập nhật ngay" để làm mới.
 */
export default function UpdateWindow({
  lastUpdate,
  nextUpdate,
  onRefresh,
}: {
  lastUpdate: number | null;
  nextUpdate: number | null;
  onRefresh?: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-secondary/40 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <CalendarClock className="h-4 w-4 text-primary" />
        {translate("Khung giờ cập nhật")}{" "}
        <span className="ml-auto rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
          {translate("GIỜ VIỆT NAM")}{" "}
        </span>
      </div>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-lg bg-background/60 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {translate("Cập nhật gần nhất")}{" "}
          </p>
          <p className="mt-0.5 font-mono text-sm font-bold text-foreground">
            {lastUpdate ? fmtVietnam(lastUpdate) : translate("chưa có dữ liệu")}
          </p>
        </div>
        <div className="rounded-lg bg-background/60 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {translate("Cập nhật tiếp theo")}{" "}
          </p>
          <p className="mt-0.5 font-mono text-sm font-bold text-foreground">
            {nextUpdate ? fmtVietnam(nextUpdate) : "—"}
          </p>
        </div>
      </div>
      <p className="mt-2.5 text-[11px] text-muted-foreground">
        {translate("Bot tự đồng bộ dữ liệu (trạng thái, số server, chủ sở hữu) lên máy chủ")}{" "}
        <b className="text-foreground">
          {translate("mỗi {p0} giây", { p0: SYNC_INTERVAL_MS / 1000 })}
        </b>
        .
      </p>
      {onRefresh && (
        <button
          onClick={onRefresh}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {translate("Cập nhật khung giờ ngay bây giờ")}{" "}
        </button>
      )}
    </div>
  );
}
