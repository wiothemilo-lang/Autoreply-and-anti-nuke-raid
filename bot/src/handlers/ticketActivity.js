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
 * KHÔNG dùng API bịa (`channel.isTicket()` — discord.js không có). Cách thật
 * duy nhất đáng tin là so với category mà chủ server đã cấu hình: đây cũng
 * chính là điều kiện bot dùng khi TẠO kênh ticket.
 *
 * `store.getConfig` có cache 30 phút nên lời gọi này gần như miễn phí — tin
 * nhắn thường thoát ngay ở bước ticket bật/tắt, chỉ kênh trong category
 * ticket mới đi tiếp.
 */
async function isTicketChannel(message, store) {
  if (!message?.guild?.id || !message.channel?.id) return false;
  let config;
  try {
    config = await store.getConfig(message.guild.id);
  } catch {
    return false;
  }
  if (!config?.ticketEnabled || !config?.ticketCategoryId) return false;
  return message.channel.parentId === config.ticketCategoryId;
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
