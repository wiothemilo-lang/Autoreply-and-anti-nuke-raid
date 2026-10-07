/**
 * friendlyConvexError — biến lỗi Convex client hiểu được thành thông điệp
 * người dùng ĐỌC ĐƯỢC, kèm fallback đã dịch.
 *
 * Vì sao cần (bug thật 07/10/2026, trang /donate): Convex production CHE
 * message của `Error` thường thành "[Request ID: …] Server Error Called by
 * client" — DonatePage chỉ bóc được mỗi regex `Uncaught \w+:` nên khách bấm
 * "Ủng hộ" thấy nguyên khối chữ kỹ thuật Convex thay vì lý do thật. Ba đường
 * xử lý, theo thứ tự tin cậy giảm dần:
 *
 *   1. `err.data` của ConvexError — KÊN CHẶT: Convex vẫn forward `data` sang
 *      client dù mask message (xem convex/botAuth.ts). Backend
 *      paymentsAction ném ConvexError({ code, message }).
 *   2. Message đã bóc envelope Convex (dev gửi "Uncaught Error: …") — giữ
 *      nguyên lý do tiếng Việt server ném ra.
 *   3. Không còn gì đọc được (đúng hình mask "Server Error") → `fallback`
 *      đã qua translate() — KHÔNG BAO GIỜ trả envelope kỹ thuật cho người dùng.
 *
 * Hàm thuần (không đụng React/DOM) để test hermetic trong
 * scripts/test-web-ux-upgrades.ts.
 */

/** Shape `data` của ConvexError do paymentsAction ném (đọc được là mừng). */
type ConvexErrorLike = { code?: unknown; message?: unknown };

/** Bóc dữ liệu JSON nhúng trong message dạng `ConvexError { "message": "…" }`. */
function messageFromErrorJson(raw: string): string {
  const m = raw.match(/ConvexError\s*\{[\s\S]*?"message"\s*:\s*"((?:[^"\\]|\\.)*)"[\s\S]*\}/);
  if (!m) return "";
  try {
    const parsed = JSON.parse(`"${m[1]}"`);
    return typeof parsed === "string" ? parsed.trim() : "";
  } catch {
    return "";
  }
}

/** Bóc phần message thật khỏi envelope Convex/Node. */
function stripConvexEnvelope(raw: string): string {
  return raw
    .replace(/\[CONVEX[^\]]*\]/g, "")
    .replace(/\[Request ID:[^\]]*\]/g, "")
    .replace(/Uncaught \w+:/g, "")
    .replace(/Called by client/g, "")
    .replace(/Server Error/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Trả message người dùng thấy khi action/query Convex throw.
 *
 * @param e      lỗi bắt được từ useAction/useMutation
 * @param fallback thông điệp đã đi qua translate() — dùng khi không đọc
 *                 được lý do thật (hoặc lý do chỉ là "Server Error")
 */
export function friendlyConvexError(e: unknown, fallback: string): string {
  // 1) ConvexError data — kênh không bị mask.
  const data = (e as { data?: unknown } | null | undefined)?.data;
  if (data && typeof data === "object") {
    const msg = (data as ConvexErrorLike).message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }

  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (!raw.trim()) return fallback;

  // 2) Message JSON của ConvexError khi data không tới tay.
  const fromJson = messageFromErrorJson(raw);
  if (fromJson) return fromJson;

  // 3) Envelope còn lại — ví dụ mask của production.
  const stripped = stripConvexEnvelope(raw);
  if (!stripped || stripped === "Server Error") return fallback;
  return stripped;
}
