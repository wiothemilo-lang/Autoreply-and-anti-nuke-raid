/**
 * Hành động kết hợp của module chống nuke / moderation (multi-select).
 *
 * Mỗi module có thể chọn NHIỀU hành động cùng lúc:
 *  - Hình phạt thành viên: warn / timeout / kick / ban (bot dùng hình phạt mạnh nhất).
 *  - Dọn tin nhắn: deleteMessages (xóa NGAY tin nhắn vi phạm tại thời điểm phát hiện)
 *    và purgeMessages (xóa HÀNG LOẠT mọi tin nhắn liên quan đến vụ vi phạm).
 */

const MEMBER_ACTIONS = ["warn", "kick", "ban", "timeout"];
const ACTION_STRENGTH = { warn: 1, timeout: 2, kick: 3, ban: 4 };

/** Lấy danh sách hành động hiệu lực của module (fallback về punish cũ). */
function actionsOf(moduleCfg) {
  if (Array.isArray(moduleCfg?.actions) && moduleCfg.actions.length > 0) {
    return [...new Set(moduleCfg.actions.filter((a) => typeof a === "string"))];
  }
  const p = moduleCfg?.punish;
  return MEMBER_ACTIONS.includes(p) ? [p] : [];
}

/** Hình phạt thành viên mạnh nhất trong danh sách hành động. */
function memberPunishOf(actions, fallback = "warn") {
  const member = actions.filter((a) => ACTION_STRENGTH[a] != null);
  member.sort((a, b) => ACTION_STRENGTH[b] - ACTION_STRENGTH[a]);
  return member[0] || fallback;
}

/** Xóa hàng loạt tin nhắn của một người trong một kênh (giới hạn 100 tin/lần). */
async function purgeChannelMessages(channel, userId, limit = 100, skipUserIds = []) {
  try {
    if (!channel || !channel.isTextBased || !channel.isTextBased() || channel.isDMBased?.())
      return 0;
    const fetched = await channel.messages.fetch({ limit });
    // ⚠️ `skipUserIds` KHÔNG phải "danh sách tin bot cần giữ". Tham số này chỉ
    // ăn khi `userId` (kẻ vi phạm) trùng một id trong danh sách — tức là khi
    // chính bot là nguồn vi phạm (bot spam/lỗi). Caller antinuke truyền
    // `[client.user.id]` đúng cho việc đó. Tin của bot vẫn an toàn trong mọi
    // trường hợp khác vì đã lọc `author === userId` từ đầu.
    const skip = new Set(skipUserIds);
    const targets = [...fetched.values()].filter(
      (m) => m.author?.id === userId && !skip.has(m.author.id) && m.deletable,
    );
    if (targets.length === 0) return 0;
    // ⚠️ KHÔNG nuốt lỗi rồi báo số như đã xoá. Số này đi vào mô tả case log
    // ("purge 100 tin liên quan") — thiếu quyền ManageMessages là hệ thống sẽ
    // ghi vào log là đã dọn 100 tin trong khi 0 tin nào bị xoá. Đếm theo kết
    // quả THẬT (`bulkDelete` trả về collection tin đã xoá).
    if (targets.length === 1) {
      const ok = await targets[0]
        .delete()
        .then(() => true)
        .catch(() => false);
      return ok ? 1 : 0;
    }
    const deleted = await channel.bulkDelete(targets, true).catch(() => null);
    return deleted?.size ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Thực thi phần dọn tin nhắn theo hành động đã chọn:
 *  - deleteMessages: xóa ngay tin nhắn vi phạm (triggerMessage).
 *  - purgeMessages:  xóa hàng loạt tin nhắn của người vi phạm trong kênh hiện tại
 *                    (nếu có channel) hoặc quét giới hạn các kênh văn bản của guild.
 * Trả về chuỗi mô tả (vd "xóa 1 tin phát hiện + purge 12 tin liên quan") hoặc "".
 */
async function cleanupMessages({
  guild,
  channel,
  userId,
  actions,
  triggerMessage,
  skipUserIds = [],
}) {
  const parts = [];
  if (actions.includes("deleteMessages") && triggerMessage?.deletable) {
    try {
      await triggerMessage.delete();
      parts.push("xóa 1 tin phát hiện");
    } catch {
      // kênh không cho xóa — bỏ qua
    }
  }
  if (actions.includes("purgeMessages") && userId) {
    let purged = 0;
    if (channel && channel.isTextBased && channel.isTextBased() && !channel.isDMBased?.()) {
      purged = await purgeChannelMessages(channel, userId, 100, skipUserIds);
    } else if (guild) {
      // Không có kênh cụ thể (sự kiện nuke/raid) → quét giới hạn các kênh văn bản.
      let total = 0;
      const textChannels =
        guild.channels.cache
          .filter((c) => c.isTextBased && c.isTextBased() && !c.isDMBased?.() && c.viewable)
          .first(8) || [];
      for (const c of textChannels) {
        total += await purgeChannelMessages(c, userId, 50, skipUserIds);
      }
      purged = total;
    }
    if (purged > 0) parts.push(`purge ${purged} tin liên quan`);
  }
  return parts.join(" + ");
}

module.exports = {
  actionsOf,
  memberPunishOf,
  cleanupMessages,
  purgeChannelMessages,
  MEMBER_ACTIONS,
  ACTION_STRENGTH,
};
