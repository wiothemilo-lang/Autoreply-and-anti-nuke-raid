// Hạn mức CỨNG của hệ thống — Protogon miễn phí hoàn toàn cho cộng đồng.
//
// Vì sao vẫn còn hạn mức: đây là TRẦN KỸ THUẬT (ngân sách storage/CPU của
// Convex và độ nặng payload dashboard), không phải ranh giới bán gói. Mọi
// server dùng CHUNG một bảng, không phân biệt chủ sở hữu hay ngày tham gia.
//
// File này thay `plans.ts` cũ (đã gỡ cùng toàn bộ thanh toán/gói trả phí):
// vẫn là nguồn sự thật DUY NHẤT cho cả đường ĐỌC (xuất CSV, bảng nhiệt, log)
// lẫn đường GHI (rule auto reply, từ khoá cấm, retention backup) — trước đây
// hai bên đọc `planLimits()` nên marketing và hành vi thật không thể lệch.

/** Tên hạn mức — dùng làm khoá trong `LIMITS` lẫn thông báo lỗi. */
export type LimitKey =
  | "autoReplyRules"
  | "badWords"
  | "backupKeepCount"
  | "backupKeepDays"
  | "exportRows"
  | "exportDays"
  | "heatTopRows"
  | "historyRows";

/**
 * Trần cứng toàn hệ thống. Số càng lớn càng rộng; mọi đường đọc/ghi phải
 * dùng ĐÚNG bảng này, không hardcode con số ở call site.
 */
export const LIMITS: Record<LimitKey, number> = {
  autoReplyRules: 50,
  badWords: 100,
  backupKeepCount: 50,
  backupKeepDays: 365,
  exportRows: 2_000,
  exportDays: 1_095,
  heatTopRows: 50,
  historyRows: 200,
};

/** Nhãn tiếng Việt của từng hạn mức — dùng trong thông báo lỗi. */
export const LIMIT_LABELS: Record<LimitKey, string> = {
  autoReplyRules: "rule auto reply",
  badWords: "từ khoá cấm",
  backupKeepCount: "bản backup giữ lại",
  backupKeepDays: "ngày giữ backup",
  exportRows: "dòng mỗi lượt xuất dữ liệu",
  exportDays: "ngày lịch sử xuất được",
  heatTopRows: "dòng bảng nhiệt",
  historyRows: "dòng log hành động",
};

/**
 * Chặn vượt trần — ném lỗi NÓI RÕ trần bao nhiêu và phải giảm về đâu.
 *
 * Chặn ở TẦNG GHI (mutation) chứ không chỉ ẩn nút trên web: gọi API trực
 * tiếp phải bị chặn như nhau. Đây là lý do hàm nằm ở đây thay vì mỗi nơi
 * tự so sánh một con số.
 */
export function assertWithinLimit(key: LimitKey, next: number): void {
  const cap = LIMITS[key];
  if (next <= cap) return;
  throw new Error(`Tối đa ${cap} ${LIMIT_LABELS[key]}. Hãy giảm xuống ${cap}.`);
}
