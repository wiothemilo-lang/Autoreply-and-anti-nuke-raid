const { EmbedBuilder, Colors, PermissionFlagsBits } = require("discord.js");
const { isDuplicateDelivery } = require("./logDedupe");

function hasPermission(member, permission) {
  if (!member || !member.permissions) return false;
  return member.permissions.has(permission);
}

function canManageGuild(member) {
  return hasPermission(member, PermissionFlagsBits.ManageGuild);
}

function isAdmin(member) {
  return hasPermission(member, PermissionFlagsBits.Administrator);
}

/**
 * Diễn giải thời lượng phút cho người đọc ("90" → "1.5 giờ").
 * Một bản duy nhất cho modTools / channelLock / timeoutWatch.
 */
function formatDuration(minutes) {
  if (minutes >= 1440) return `${minutes / 1440} ngày`;
  if (minutes >= 60) return `${minutes / 60} giờ`;
  return `${minutes} phút`;
}

/**
 * Quản lý auto reply: quyền Manage Guild/Administrator, HOẶC có role Mod/Admin
 * đã được cấu hình qua /setup mod-role, /setup admin-role.
 */
function canManageWithConfig(member, config) {
  if (canManageGuild(member) || isAdmin(member)) return true;
  if (!config || !member) return false;
  const ids = [...(config.modRoles || []), ...(config.adminRoles || [])];
  return ids.some((id) => member.roles.cache.has(id));
}

/** Fill {user} / {username} placeholders in a response. */
function fillPlaceholders(text, author) {
  return text.replaceAll("{user}", `<@${author.id}>`).replaceAll("{username}", author.username);
}

function logEmbed({ title, description, color = Colors.Red, fields = [], footer }) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
  if (fields.length) embed.addFields(fields);
  if (footer) embed.setFooter({ text: footer });
  return embed;
}

/**
 * Gửi embed trực tiếp vào kênh text (fallback an toàn khi webhook không hoạt động).
 * Trả về true nếu gửi thành công.
 */
async function sendToChannel(guild, channelId, embed) {
  if (!guild || !channelId) return false;
  try {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (channel && channel.isTextBased()) {
      await channel.send({ embeds: [embed] });
      return true;
    }
  } catch {
    // kênh bị xóa / thiếu quyền Send Messages — bỏ qua
  }
  return false;
}

/**
 * Gửi embed qua webhook (nếu guild có webhook khớp hạng mục sự kiện).
 * Trả về true khi ÍT NHẤT 1 webhook nhận thành công — caller bỏ qua kênh thường.
 * Webhook PHẢI nằm đúng kênh đích (targetChannelId): webhook mặc định sống ở
 * kênh log chung nhưng log moderation cần sang kênh hình phạt riêng — gửi qua
 * webhook lạc kênh là "gửi sai kênh". Không có webhook đúng kênh → gửi trực
 * tiếp vào kênh đích (không tạo webhook mới ồ ạt, không dùng webhook kênh khác).
 * meta: { action, reason, user, mod } để chèn vào placeholder nội dung kèm.
 */
async function deliverViaWebhooks(guild, eventType, embed, meta = {}, targetChannelId) {
  if (!guild) return false;
  try {
    const hub = require("./webhookHub");
    const matched = await hub.matchFor(guild.id, eventType);

    // Ưu tiên webhook nằm ĐÚNG kênh đích; webhook kênh khác bị loại để log
    // không nhảy sang kênh sai (vd case ban vào kênh log chung thay vì kênh phạt).
    const sameChannel = targetChannelId
      ? matched.filter((w) => w.channelId === targetChannelId)
      : matched;

    // Chưa có webhook nào đúng kênh và chưa có webhook nào cả — thử tạo
    // on-the-fly "Protogon Log" trong kênh đích.
    if (sameChannel.length === 0 && matched.length === 0 && targetChannelId) {
      const created = await hub.ensureDefaultWebhook(guild, targetChannelId);
      if (created && (!created.channelId || created.channelId === targetChannelId)) {
        try {
          await hub.send(created, embed, { guildName: guild.name, ...meta });
          return true;
        } catch {
          // tạo được nhưng gửi lỗi → rơi xuống gửi kênh thường bên dưới
        }
      }
    }

    if (sameChannel.length === 0) {
      // Không có webhook đúng kênh — gửi trực tiếp vào kênh đích (khi webhook
      // không tạo được — thiếu quyền ManageWebhooks — hoặc webhook nằm kênh khác).
      return await sendToChannel(guild, targetChannelId, embed);
    }
    let sent = 0;
    for (const wh of sameChannel) {
      try {
        await hub.send(wh, embed, { guildName: guild.name, ...meta });
        sent++;
      } catch {
        // webhook hỏng (đã xóa / thiếu quyền) — thử webhook khác cùng kênh
      }
    }
    if (sent === 0 && targetChannelId) {
      // Tất cả webhook đều hỏng — fallback kênh thường
      return await sendToChannel(guild, targetChannelId, embed);
    }
    return sent > 0;
  } catch {
    // Lỗi không xác định — fallback kênh thường nếu có
    return await sendToChannel(guild, targetChannelId, embed);
  }
}

/**
 * Nhận diện hạng mục log chi tiết từ TIÊU ĐỀ embed khi caller không truyền rõ
 * (các module anti nuke/raid, join gate, lockdown vẫn gọi sendLog 3 tham số).
 * Nhờ vậy webhook chọn hạng mục "antinuke"/"raid"/"join" vẫn nhận đúng log
 * mà không cần sửa từng điểm gọi.
 */
function inferEventType(embed, fallback = "general") {
  const title = String(embed?.data?.title || embed?.title || "");
  if (/anti nuke\/raid/i.test(title)) {
    // CHỈ báo raid thật (làn sóng thành viên) mới là "raid"; các module nuke
    // cấu trúc (ban/kick/xóa kênh…) là "antinuke" — trước đây chữ "Raid" trong
    // cụm "Nuke/Raid" khiến MỌI log antinuke bị gắn nhãn raid, webhook lọc
    // riêng "antinuke" không bao giờ nhận được log.
    return /raid thành viên|massjoin/i.test(title) ? "raid" : "antinuke";
  }
  if (/join gate|alt detect|verify/i.test(title)) return "join";
  if (/lockdown|khóa kênh/i.test(title)) return "raid";
  return fallback;
}

/**
 * Log chung — cảnh báo ANTI NUKE / RAID và sự kiện quan trọng.
 * eventType: "antinuke" | "raid" | "join" | "leave" | "settings" | "general"…
 * Không truyền → tự nhận diện từ tiêu đề embed (vẫn fallback "general").
 * Ưu tiên webhook khớp hạng mục; không có thì gửi tới logChannelId.
 */
async function sendLog(guild, guildConfig, embed, eventType, meta = {}) {
  // Chỉ chạy khi guild ĐÃ bật log (kênh log chung hoặc kênh mod log) — đúng yêu
  // cầu: webhook mặc định chỉ hoạt động sau khi chủ server set kênh log.
  if (!guildConfig || (!guildConfig.logChannelId && !guildConfig.modLogChannelId)) return;
  const et = eventType || inferEventType(embed);
  // Log chung (anti nuke/raid, join, settings…) → KÊNH LOG CHUNG là đích chính.
  // Trước đây embed cảnh báo raid/nuke được đẩy qua webhook "Protogon Log" — do
  // webhook eventTypes "all" nên nó nhận MỌI hạng mục kể cả khi nằm ở kênh hình
  // phạt → log raid/nuke spam nhầm kênh phạt thay vì kênh log chung.
  const targetChannel = guildConfig.logChannelId ?? guildConfig.modLogChannelId;
  // Chốt chống gửi trùng: cùng một embed vào CÙNG kênh trong vài giây là lỗi
  // định tuyến (các nhánh log chồng kênh nhau), không phải hai sự kiện thật.
  if (isDuplicateDelivery(targetChannel, embed)) return;
  // Cảnh báo quan trọng (raid/nuke) luôn ưu tiên ĐÚNG kênh log chung: chỉ dùng
  // webhook nếu webhook đó nằm TRONG kênh log chung; nếu không gửi thẳng kênh.
  const critical = et === "raid" || et === "antinuke";
  if (critical) {
    const hub = require("./webhookHub");
    const matched = await hub.matchFor(guild.id, et).catch(() => []);
    const sameChannel = matched.filter((w) => w.channelId === targetChannel);
    if (sameChannel.length > 0) {
      let sent = 0;
      for (const wh of sameChannel) {
        try {
          await hub.send(wh, embed, { guildName: guild.name, ...meta });
          sent++;
        } catch {
          // webhook hỏng — thử webhook khác cùng kênh
        }
      }
      if (sent > 0) return;
    }
    // Webhook không nằm ở kênh log chung → gửi trực tiếp kênh log chung.
    return await sendToChannel(guild, targetChannel, embed);
  }
  // Hạng mục còn lại: giữ hành vi webhook cũ.
  await deliverViaWebhooks(guild, et, embed, meta, targetChannel);
}

/**
 * Log MODERATION (auto-mod + lệnh mod thủ công: ban/timeout/kick/warn + gỡ hình
 * phạt, purge, bot xóa tin nhắn) — GỘP CHUNG một kênh, kiểu Carl-bot. Gửi tới
 * punishNoticeChannelId (nếu có) → modLogChannelId → kênh log chung.
 * eventType: "ban" | "kick" | "timeout" | "warn" | "purge" | "unban" | "untimeout"…
 * Fallback qua từng kênh: nếu kênh ưu tiên đã bị xóa/hỏng thì vẫn ghi được
 * (không để mất log case).
 */
async function sendModLog(
  guild,
  guildConfig,
  embed,
  preferChannelId,
  eventType = "mod",
  meta = {},
) {
  if (!guildConfig) return false;
  const targetChannel = preferChannelId ?? guildConfig.modLogChannelId ?? guildConfig.logChannelId;
  // Chốt chống gửi trùng (xem logDedupe.js): chặn trường hợp kênh hình phạt và
  // kênh log mod chồng nhau khiến cùng một case bị đẩy hai lần.
  if (isDuplicateDelivery(targetChannel, embed)) return false;
  // Toàn bộ log gửi qua webhook — KHÔNG fallback kênh thường.
  return await deliverViaWebhooks(guild, eventType, embed, meta, targetChannel);
}

module.exports = {
  hasPermission,
  canManageGuild,
  isAdmin,
  canManageWithConfig,
  formatDuration,
  fillPlaceholders,
  logEmbed,
  sendLog,
  sendModLog,
  inferEventType,
  Colors,
};
