/**
 * handlers/ticketActivity.js — đẩy lùi đồng hồ tự đóng khi kênh ticket còn
 * hoạt động.
 *
 * Vì sao cần: job `autoClose` chạy mỗi 60s và đóng mọi ticket `open` quá
 * `idleHours`. Nếu không có đường đẩy lùi ở đây thì một ticket đang thảo luận
 * sôi nổi vẫn bị đóng chỉ vì không ai chat đúng khoảnh khắc bot quét.
 *
 * ⚠️ CHỈ ghi lùi, không bao giờ ghi tới trước: nếu không, một tin nhắn CŨ đọc
 * lại từ backlog Discord sẽ giữ ticket mở mãi. Phía Convex (`botTouchTickets`)
 * cũng chặn `lastActivityAt >= at` cho cùng lý do.
 */

/**
 * Tin nhắn có nằm trong kênh ticket không?
 *
 * Danh mục mặc định là đường nhanh. Với kênh đã chuyển danh mục, tra ID
 * trong cache ticket mở. Convex kiểm tra lại guild, ID và trạng thái khi ghi.
 */
async function isTicketChannel(message, store) {
  if (!message?.guild?.id || !message.channel?.id) return false;
  let config;
  try {
    config = await store.getConfig(message.guild.id);
  } catch {
    return false;
  }
  if (!config?.ticketEnabled) return false;
  if (config.ticketCategoryId && message.channel.parentId === config.ticketCategoryId) return true;
  const openChannels = await store.getOpenTicketChannels(message.guild.id);
  return openChannels.has(message.channel.id);
}

/**
 * Ghi hoạt động nếu `message` nằm trong kênh ticket.
 *
 * @returns {Promise<boolean>} true nếu đã ghi, false nếu không phải kênh
 *   ticket (đường nhanh nhất: đa số tin nhắn thoát ở đây).
 */
async function noteActivity(message, store) {
  if (!message || message.author?.bot) return false;
  if (!(await isTicketChannel(message, store))) return false;
  try {
    await store.client.mutation("bot_writes:botTouchTickets", {
      guildId: message.guild.id,
      channelIds: [message.channel.id],
    });
    return true;
  } catch (e) {
    // Mất mạng lúc này không được làm rơi tin nhắn của người dùng.
    console.error(`[ticketActivity] ${message.guild.id}/${message.channel.id}:`, e.message);
    return false;
  }
}

module.exports = { noteActivity, isTicketChannel };
