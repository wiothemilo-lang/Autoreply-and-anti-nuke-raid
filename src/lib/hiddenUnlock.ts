/**
 * Khoá đánh dấu "đã mở khóa tính năng ẩn" trong sessionStorage.
 *
 * TOÀN CỤC, không kèm guildId: mật khẩu thuộc CHỦ BOT nên mở khóa ở server nào
 * cũng có hiệu lực ở mọi server. Bản cũ gắn theo từng server nên chủ bot phải
 * nhập lại mật khẩu ở từng dashboard — và ở server chưa từng đặt mật khẩu thì
 * cổng mở toang (đúng lỗi đã sửa).
 *
 * Nằm ở `lib/` (không phải trong `UnlockPanel.tsx`) để `GuildPage` đọc/ghi khoá
 * này mà không kéo cả form mật khẩu + mutation Convex vào chunk của trang.
 */
export function hiddenUnlockKey(): string {
  return "protogon_hidden_unlocked";
}
