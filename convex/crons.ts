import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Lịch job định kỳ phía Convex (đợt #4 — thay các vòng `setInterval` mà TOÀN BỘ
 * logic chạy được trên server).
 *
 * Nguyên tắc: chỉ job không cần tiến trình bot mới đưa lên đây. Việc phải chạm
 * Discord/gateway, RAM hay đĩa VPS (presence, flush heat, quét alt, metrics,
 * snapshot cục bộ, dọn bộ nhớ…) vẫn thuộc tiến trình bot — Convex cron không
 * chạy được code trong tiến trình bot. Bảng phân loại đầy đủ từng setInterval:
 * `docs/cron-migration.md`.
 */
const crons = cronJobs();

/**
 * Tự động backup: mỗi giờ quét guild đến hạn (bật lịch 2–30 ngày, chưa backup
 * trong khoảng đó) rồi đặt cờ `backupRequested` — bot thực thi trong tick kế
 * tiếp. Thay vòng `autoBackupInterval` 1 giờ trong `bot/src/index.js`.
 *
 * Chọn mỗi giờ vì lịch tự động tính theo NGÀY: sweep trễ nhất 1 giờ không đổi
 * hành vi, chạy dày hơn chỉ tốn reads vô ích.
 */
crons.interval("auto-backup-sweep", { hours: 1 }, internal.backup.sweepDueAutoBackups, {});

/**
 * Báo cáo ngày: mỗi 30 phút đặt cờ `reportRequestedAt` cho guild đến hạn (quá
 * 20h kể từ lần gửi trước, hoặc chưa từng gửi). Bot gửi embed trong tick kế
 * tiếp rồi xoá cờ qua `botSetReportAt`. Thay vòng `reportInterval` 15 phút
 * trong `bot/src/index.js`: trễ thêm tối đa 30 phút nhưng vẫn trong ngày, đổi
 * lại bỏ hẳn một vòng quét phía bot và mốc chống trùng nằm ở server.
 */
crons.interval("daily-report-sweep", { minutes: 30 }, internal.reports.sweepDueDailyReports, {});

export default crons;
