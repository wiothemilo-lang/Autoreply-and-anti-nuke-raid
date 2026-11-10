/**
 * flaggedMessages.js — store cục bộ (in-memory) các tin nhắn ĐÃ BỊ FLAG
 * (spam/phishing/threat-intel khớp) để n-gram engine học cấu trúc spam biến thể.
 *
 * Chỉ giữ nội dung + guild + thời gian, giới hạn tổng 1200 mục — tự dọn cũ.
 * Riêng tư: KHÔNG bao giờ ghi nội dung tin nhắn thành viên lên Convex hay Discord
 * — chỉ dùng cục bộ trên VPS để phân tích cấu trúc.
 */

const MAX_TOTAL = 1200;
const MAX_TTL_MS = 7 * 24 * 3600 * 1000; // B1: 7 ngày (cửa sổ học n-gram dài hơn — đốt RAM đổi tầm nhìn)
const MIN_LEN = 12;
const MAX_LEN = 300;

let items = [];

/**
 * Ghi 1 tin nhắn bị flag (gọi từ antinuke.handleSpam + filters khi chặn).
 * Bỏ qua tin quá ngắn/quá dài — không có tín hiệu cấu trúc đáng học.
 */
function noteFlaggedMessage(content, guildId, reason, now = Date.now()) {
  try {
    const text = String(content ?? "");
    if (text.length < MIN_LEN || text.length > MAX_LEN) return false;
    // `shift()` là O(n) trên mảng 1200 phần tử (dịch toàn bộ index); splice
    // đúng phần vượt trần rẻ hơn và giữ nguyên thứ tự cũ → mới.
    if (items.length >= MAX_TOTAL) items.splice(0, items.length - MAX_TOTAL + 1);
    items.push({
      content: text,
      guildId: String(guildId ?? "unknown"),
      reason: String(reason ?? "").slice(0, 40),
      ts: now,
    });
    return true;
  } catch {
    return false;
  }
}

/** Lấy các mẫu flagged trong cửa sổ thời gian (mới nhất đầu). */
function noteFlaggedMessages(sinceMs = Date.now() - 24 * 3600_000) {
  return items
    .filter((it) => it.ts >= sinceMs)
    .sort((a, b) => b.ts - a.ts)
    .map(({ content, guildId, reason, ts }) => ({ content, guildId, reason, ts }));
}

/** Dọn mẫu quá 48h (gọi định kỳ từ engine). */
function sweepFlagged(now = Date.now()) {
  const before = items.length;
  items = items.filter((it) => now - it.ts <= MAX_TTL_MS);
  return before - items.length;
}

/** Chỉ dùng trong test. */
function _resetFlaggedForTest() {
  items = [];
}

module.exports = { noteFlaggedMessage, noteFlaggedMessages, sweepFlagged, _resetFlaggedForTest };
