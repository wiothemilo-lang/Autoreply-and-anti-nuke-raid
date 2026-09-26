/**
 * Mô phỏng matching auto-reply trên web — PHẢI khớp 1:1 với logic bot thật
 * trong `bot/src/handlers/messageCreate.js` (handleAutoReply):
 *
 *  1. Rule tắt (`enabled === false`) bị bỏ qua.
 *  2. Lọc kênh: rule không chọn kênh nào → áp dụng mọi kênh; có chọn → tin
 *     nhắn phải nằm trong danh sách. `channelId = null` (chưa đánh giá được)
 *     coi như pass — UI hiển thị lưu ý riêng.
 *  3. mention: khớp khi tin nhắn tag bot; keyword: tin nhắn (lowercase)
 *     CHỨA một trong các từ khóa (substring, lowercase cả 2 phía).
 *  4. Bot chỉ trả lời RULE ĐẦU TIÊN khớp (return sau reply đầu) — phần tử
 *     đầu của mảng trả về là rule thắng, các phần tử sau chỉ "cũng khớp".
 *  5. Placeholder: bot `replaceAll("{user}", <@id>)` + `replaceAll("{username}",
 *     username)` — web thay {user} bằng `@tên` (không có id Discord) và
 *     {username} bằng tên giả lập; placeholder khác giữ nguyên như bot.
 *
 * Giãn cách (cooldown) là trạng thái in-memory theo process bot nên KHÔNG
 * mô phỏng được — UI phải nói rõ điều này thay vì giả vờ chính xác.
 */

export interface SimRule {
  _id: string;
  name: string;
  triggerType: "keyword" | "mention";
  keywords: string[];
  response: string;
  channels: string[];
  enabled?: boolean;
}

export interface SimInput {
  /** Nội dung tin nhắn mẫu (raw — hàm tự lowercase như bot). */
  content: string;
  /** true = giả lập tin nhắn có tag bot. */
  mentioned: boolean;
  /** Kênh giả lập; null = không đánh giá được lọc kênh. */
  channelId: string | null;
  /** Tên thành viên giả lập cho placeholder {user}/{username}. */
  username: string;
}

export interface SimMatch {
  rule: SimRule;
  /** Response đã thay placeholder — rule thắng mới được bot gửi thật. */
  response: string;
}

function fillPreview(response: string, username: string): string {
  return response.replaceAll("{user}", `@${username}`).replaceAll("{username}", username);
}

export function simulateAutoReply(rules: SimRule[], input: SimInput): SimMatch[] {
  const content = input.content.toLowerCase();
  const username = input.username.trim() || "Minh";
  const matches: SimMatch[] = [];

  for (const rule of rules) {
    if (rule.enabled === false) continue;
    const channelAllowed =
      input.channelId === null ||
      !rule.channels ||
      rule.channels.length === 0 ||
      rule.channels.includes(input.channelId);
    if (!channelAllowed) continue;

    const matched =
      rule.triggerType === "mention"
        ? input.mentioned
        : (rule.keywords || []).some((k) => k && content.includes(k.toLowerCase()));
    if (!matched) continue;

    matches.push({ rule, response: fillPreview(rule.response, username) });
  }
  return matches;
}
