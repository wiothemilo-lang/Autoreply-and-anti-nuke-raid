import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getUserByToken } from "./auth";
import { getBotStatus, isBotOwnerUser } from "./hidden";

/**
 * Góp ý người dùng (trang /feedback) — kênh duy nhất để người dùng gửi lỗi/
 * đề xuất mà không phải vào Discord.
 *
 * Vì sao có cổng kiểm định ở SERVER (không tin client):
 * form là endpoint CÔNG KHAI, ai cũng gọi được bằng HTTP, không cần đăng nhập.
 * Client chỉ lo hiển thị; mọi giới hạn phải nằm ở đây, nếu không một script
 * 3 dòng có thể nhét rác 1 MB hoặc spam vài nghìn dòng vào DB.
 *
 * Vì sao KHÔNG dùng rateGuard.ts: file đó dành cho action "use node" (bucket
 * in-memory theo identity). Ở đây là mutation thuần Convex, không có identity
 * ẩn danh (Convex không đưa IP/header vào function) — nên cổng chống spam là
 * TRẦN TOÀN CỤC theo cửa sổ thời gian, đọc bằng index sẵn có, chi phí 1 query.
 * Chủ bot vẫn nhận được góp ý thật; kịch bản botnet cũng chỉ đốt được ~30 lượt
 * mỗi 10 phút thay vì không giới hạn.
 */

/** Giới hạn nội dung — khớp với `maxLength` của textarea trên web. */
export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 2000;
export const EMAIL_MAX = 200;
/** Trần chống spam: tối đa 30 góp ý trong 10 phút (mọi người gộp lại). */
export const SPAM_WINDOW_MS = 10 * 60_000;
export const SPAM_MAX_IN_WINDOW = 30;

/** Loại góp ý — nguồn duy nhất cho cả validator Convex lẫn UI/test. */
export const FEEDBACK_KINDS = ["bug", "idea", "other"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

/** Email chỉ cần "có dạng" — không phải cổng gửi thư, đừng chặt quá mà chặn oan. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface FeedbackInput {
  kind: string;
  message: string;
  email?: string;
}

export type ValidationResult =
  { ok: true; message: string; email?: string } | { ok: false; error: string };

/**
 * Kiểm định dùng CHUNG cho mutation và test hermetic (export để test gọi thẳng,
 * không phải chép lại luật — chép lại là hai bản luật lệch nhau lúc nào không biết).
 *
 * Lỗi trả về là chuỗi tiếng Việt hiển thị thẳng cho người dùng: nói rõ SAI GÌ
 * và LÀM GÌ (dài bao nhiêu, sửa ở đâu), không chỉ "invalid input".
 */
export function validateFeedback(input: FeedbackInput): ValidationResult {
  if (!FEEDBACK_KINDS.includes(input.kind as FeedbackKind)) {
    return { ok: false, error: "Loại góp ý không hợp lệ." };
  }
  const message = String(input.message ?? "").trim();
  if (message.length < MESSAGE_MIN) {
    return {
      ok: false,
      error: `Nội dung quá ngắn — cần ít nhất ${MESSAGE_MIN} ký tự để mình hiểu bạn gặp gì.`,
    };
  }
  if (message.length > MESSAGE_MAX) {
    return { ok: false, error: `Nội dung quá dài — tối đa ${MESSAGE_MAX} ký tự.` };
  }
  const rawEmail = String(input.email ?? "").trim();
  if (rawEmail) {
    if (rawEmail.length > EMAIL_MAX) {
      return { ok: false, error: `Email quá dài — tối đa ${EMAIL_MAX} ký tự.` };
    }
    if (!EMAIL_RE.test(rawEmail)) {
      return {
        ok: false,
        error: "Email chưa đúng dạng — bỏ trống cũng được nếu bạn không cần phản hồi.",
      };
    }
  }
  return { ok: true, message, email: rawEmail || undefined };
}

/**
 * Người dùng gửi góp ý.
 *
 * Trả `{ ok: true, stored: false }` (im lặng) khi trường honeypot có giá trị:
 * đó là bot điền form, không phải người. Đừng báo lỗi — báo lỗi chỉ dạy cho
 * kẻ viết script biết cần sửa gì; hiện đúng màn "đã gửi" và không ghi gì vào DB.
 */
export const submit = mutation({
  args: {
    kind: v.union(v.literal("bug"), v.literal("idea"), v.literal("other")),
    message: v.string(),
    email: v.optional(v.string()),
    /** Ngôn ngữ đang xem (vi/en/de) — đọc góp ý không cần hỏi lại người gửi. */
    lang: v.optional(v.string()),
    /** Trang đang mở lúc gửi (đường dẫn) — cùng lý do. */
    page: v.optional(v.string()),
    /** Bẫy bot: input ẩn, người thật không bao giờ điền. */
    honeypot: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (String(args.honeypot ?? "").trim()) return { ok: true as const, stored: false as const };

    const check = validateFeedback(args);
    if (!check.ok) throw new Error(check.error);

    const now = Date.now();
    // Đọc tối đa SPAM_MAX_IN_WINDOW dòng gần nhất: chỉ cần biết "đã chạm trần
    // chưa", không cần đếm chính xác — take() rẻ hơn collect().
    const recent = await ctx.db
      .query("feedback")
      .withIndex("by_createdAt", (q) => q.gt("createdAt", now - SPAM_WINDOW_MS))
      .take(SPAM_MAX_IN_WINDOW);
    if (recent.length >= SPAM_MAX_IN_WINDOW) {
      throw new Error(
        "Hệ thống vừa nhận quá nhiều góp ý — bạn thử lại sau ít phút nhé, hoặc nhắn trực tiếp trong Discord.",
      );
    }

    const id = await ctx.db.insert("feedback", {
      kind: args.kind,
      message: check.message,
      email: check.email,
      lang: args.lang?.slice(0, 8),
      page: args.page?.slice(0, 120),
      createdAt: now,
    });
    return { ok: true as const, stored: true as const, id };
  },
});

/**
 * Danh sách góp ý — CHỈ chủ bot (cùng guard với getHostHealth/getJobBacklog).
 *
 * Vì sao không công khai: nội dung do người ngoài nhập, có thể chứa thông tin
 * riêng của họ (email, mô tả lỗi kèm ID server). Trả `null` khi không phải chủ
 * bot — dashboard hiển thị "không có quyền", không lộ dữ liệu.
 */
export const list = query({
  args: { token: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { token, limit }) => {
    const user = await getUserByToken(ctx, token);
    if (!user) return null;
    const status = await getBotStatus(ctx);
    if (!isBotOwnerUser(user, status)) return null;
    const take = Math.min(Math.max(limit ?? 50, 1), 200);
    const rows = await ctx.db.query("feedback").withIndex("by_createdAt").order("desc").take(take);
    return rows.map((r) => ({
      id: r._id,
      kind: r.kind,
      message: r.message,
      email: r.email ?? null,
      lang: r.lang ?? null,
      page: r.page ?? null,
      createdAt: r.createdAt,
    }));
  },
});
