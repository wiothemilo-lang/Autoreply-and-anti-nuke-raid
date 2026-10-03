/**
 * Điểm cấu hình (config health) — biến "cấu hình thiếu gì" thành MỘT con số
 * kèm link mở thẳng panel cần sửa (đợt #4, nâng cấp UI phần A).
 *
 * Vì sao cần:
 *  - Chủ server mới không biết mình đã bật đủ chưa. Checklist onboarding chỉ
 *    hiện lúc làm mới và là danh sách việc cần làm, không phải trạng thái
 *    an ninh đang thế nào sau 3 tháng dùng.
 *  - "Thiếu kênh log" và "chưa bật chống nuke" là hai việc khác nhau về mức
 *    độ nguy hiểm. Một số con số gộp sẽ không phản ánh đúng; ở đây mỗi vấn đề
 *    có trọng số riêng và nhãn mức (critical / warning).
 *
 * Ranh giới: đây là HÀM THUẦN — không React, không query, không translate (chuỗi
 * trả về là tiếng Việt, tầng render bọc `translate`). Nhờ vậy test gọi thẳng
 * được không cần dựng DOM, và cùng một hàm dùng cho badge + danh sách chi tiết.
 *
 * `target` là khoá panel trong `NAV_ITEMS` của GuildPage — có test chặn nếu
 * gõ sai khoá thì link sẽ mở panel không tồn tại.
 */
import type { GuildData } from "./types";

export type HealthLevel = "critical" | "warning";

/** Khoá panel đích — PHẢI khớp `NAV_ITEMS` của `GuildPage` (có test chặn). */
export type HealthTarget =
  "antinuke" | "webhooks" | "automod" | "joingate" | "altdetect" | "verify" | "backup";

export interface HealthIssue {
  /** Khoá ổn định để test khẳng định (đừng đổi vì đổi câu chữ). */
  key: string;
  level: HealthLevel;
  /** Điểm bị trừ khi vấn đề này xảy ra. Tổng các mục = 100. */
  points: number;
  label: string;
  hint: string;
  target: HealthTarget;
}

export interface HealthReport {
  /** 0–100. 100 = không thiếu gì. */
  score: number;
  /** Sắp theo điểm trừ giảm dần (critical trước). */
  issues: HealthIssue[];
}

/** Chỉ phần `guild` là đủ để chấm điểm — cố tình không phụ thuộc query khác. */
type GuildHealthFields = Pick<
  GuildData["guild"],
  | "botInGuild"
  | "logChannelId"
  | "modLogChannelId"
  | "antinukeEnabled"
  | "automodEnabled"
  | "joinGateEnabled"
  | "verifyEnabled"
  | "backupAutoDays"
>;

/**
 * Luật chấm điểm. Thứ tự trong mảng KHÔNG quan trọng (kết quả được sắp theo
 * điểm), nhưng tổng điểm trừ = 100 để "tắt hết" không bao giờ ra điểm âm.
 */
const RULES: {
  key: string;
  level: HealthLevel;
  points: number;
  label: string;
  hint: string;
  target: HealthTarget;
  broken: (g: GuildHealthFields) => boolean;
}[] = [
  {
    key: "noAntiNuke",
    level: "critical",
    points: 30,
    label: "Chưa bật chống nuke",
    hint: "Không có lớp phòng thủ đầu tiên khi bị raid: bot sẽ không chặn mass ban, mass role hay xoá kênh hàng loạt.",
    target: "antinuke",
    broken: (g) => !g.antinukeEnabled,
  },
  {
    key: "noLogChannel",
    level: "critical",
    points: 25,
    label: "Chưa chọn kênh nhận log",
    hint: "Mọi cảnh báo nuke, hình phạt và kết quả backup đều cần kênh log — không có kênh log thì bot xử lý xong mà bạn không thấy gì.",
    target: "webhooks",
    // Cả hai kênh đều rỗng mới tính là thiếu: bot ghi log chính và log mod
    // là hai chỗ khác nhau, chỉ cần có một chỗ là đủ thấy.
    broken: (g) => !g.logChannelId && !g.modLogChannelId,
  },
  {
    key: "noAutoBackup",
    level: "warning",
    points: 15,
    label: "Chưa bật backup tự động",
    hint: "Bị nuke hoặc xoá nhầm mà không có bản backup gần nhất thì khôi phục gần như không thể.",
    target: "backup",
    broken: (g) => !g.backupAutoDays || g.backupAutoDays <= 0,
  },
  {
    key: "noAutoMod",
    level: "warning",
    points: 10,
    label: "Chưa bật auto-mod nội dung",
    hint: "Link độc, spam và từ cấm sẽ tới tận người dùng trước khi mod kịp xử lý.",
    target: "automod",
    broken: (g) => !g.automodEnabled,
  },
  {
    key: "noJoinGate",
    level: "warning",
    points: 10,
    label: "Chưa bật Join Gate",
    hint: "Tài khoản ảo mới lập lọt vào được server, làm loãng thành viên thật và tốn công xử lý.",
    target: "joingate",
    broken: (g) => !g.joinGateEnabled,
  },
  {
    key: "noVerify",
    level: "warning",
    points: 10,
    label: "Chưa bật xác minh thành viên",
    hint: "Acc ảo vào là có role ngay, không cần đợi con người duyệt.",
    target: "verify",
    broken: (g) => !g.verifyEnabled,
  },
];

/** Nhãn mức để hiển thị cạnh con số. */
export function healthGrade(score: number): { label: string; tone: "ok" | "warn" | "bad" } {
  if (score >= 80) return { label: "Tốt", tone: "ok" };
  if (score >= 50) return { label: "Cần xem lại", tone: "warn" };
  return { label: "Rủi ro cao", tone: "bad" };
}

/**
 * Chấm điểm cấu hình của một server.
 *
 * Server mà bot CHƯA ở trong không được chấm: cấu hình đó chưa có ý nghĩa (bot
 * chưa đọc), tính điểm sẽ khiến chủ server thấy "Rủi ro cao" một cách vô lý.
 */
export function evaluateConfigHealth(guild: GuildHealthFields): HealthReport {
  if (guild.botInGuild === false) return { score: 100, issues: [] };
  const issues = RULES.filter((r) => r.broken(guild)).map(({ broken, ...rest }) => {
    void broken;
    return rest;
  });
  const lost = issues.reduce((sum, i) => sum + i.points, 0);
  return {
    score: Math.max(0, Math.min(100, 100 - lost)),
    issues: issues.sort((a, b) => b.points - a.points || a.key.localeCompare(b.key)),
  };
}

/** Danh sách khoá panel mà mọi `target` phải khớp — dùng cho test chặn. */
export const HEALTH_TARGETS = RULES.map((r) => r.target);
