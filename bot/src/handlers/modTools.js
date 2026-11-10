const { canManageWithConfig } = require("../util");
const { sendCaseLog, CASE_LABEL } = require("../caseLog");
const timeoutWatch = require("../timeoutWatch");
// MISFIRE FEEDBACK (vòng 11): mod gỡ phạt tự động của bot = phạt nhầm đã xác
// nhận — nạp vào feedback loop của AI (đợt 11).
const misfire = require("../misfire");
const { heatSettings } = require("../heat");

/** Phân tích chuỗi thời lượng: "10m", "2h", "1d", "30" (mặc định = phút). */
function parseDuration(input) {
  const m = /^(\d+)\s*([smhd]?)$/i.exec((input || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = (m[2] || "m").toLowerCase();
  const minutes =
    unit === "s" ? Math.ceil(n / 60) : unit === "h" ? n * 60 : unit === "d" ? n * 1440 : n;
  if (minutes > 10080) return null; // tối đa 7 ngày
  return Math.max(1, minutes);
}

function formatDuration(minutes) {
  if (minutes >= 1440) return `${minutes / 1440} ngày`;
  if (minutes >= 60) return `${minutes / 60} giờ`;
  return `${minutes} phút`;
}

/** Kiểm tra quyền mod: Manage Guild / Administrator / role Mod-Admin đã cấu hình. */
function canMod(messageOrInteraction, config) {
  return canManageWithConfig(messageOrInteraction.member, config);
}

function needPerm(channel) {
  return channel.send(
    "❌ Bạn cần quyền **Quản lý server** hoặc role **Mod/Admin** được cấu hình để dùng lệnh này.",
  );
}

/**
 * Ghi log hành động mod THỦ CÔNG (ban/timeout/kick/warn + gỡ hình phạt) kiểu
 * Carl-bot vào kênh log moderation (modLogChannelId, mặc định kênh log chung):
 * ghi bảng hình phạt TRƯỚC để lấy số case, rồi gửi embed
 * "⏱️ Timeout | case N" với Offender / Reason / Responsible moderator.
 */
async function logModAction(
  guild,
  guildConfig,
  { actionKey, target, executor, reason, extra = [] },
  store,
) {
  // Ghi vào bảng hình phạt trên dashboard (nếu có store) → lấy số case.
  let caseNumber;
  if (store) {
    try {
      const rec = await store.client.mutation("bot_writes:botRecordModAction", {
        guildId: guild.id,
        action:
          (CASE_LABEL[actionKey] || actionKey)
            .replace(/[^\p{L}\p{N}\s]/gu, "")
            .trim()
            .slice(0, 20) || actionKey,
        targetId: target?.id ?? undefined,
        targetName: target?.username ?? undefined,
        executorId: executor?.id ?? undefined,
        executorName: executor?.username ?? undefined,
        reason: reason || undefined,
        details:
          extra
            .map((f) => `${f.name}: ${f.value}`)
            .join(" · ")
            .slice(0, 200) || undefined,
      });
      caseNumber = rec?.caseNumber;
    } catch (e) {
      console.error(`[modTools:record] ${guild.id}:`, e.message);
    }
  }
  try {
    await sendCaseLog({
      guild,
      guildConfig,
      action: actionKey,
      caseNumber,
      offender: target,
      reason,
      executor,
      extraDescription: extra.map((f) => `**${f.name}:** ${f.value}`),
    });
  } catch (e) {
    console.error(`[modTools:log] ${guild.id}:`, e.message);
  }
}

async function timeoutMember({ guild, member, executor, minutes, reason, guildConfig, store }) {
  await member.timeout(minutes * 60_000, reason || undefined);
  // Ghi nhận để log khi timeout hết hạn tự nhiên.
  timeoutWatch.track(guild.id, member.id, Date.now() + minutes * 60_000);
  // Thông báo Moderation thủ công đã gộp vào embed case kiểu Carl-bot (sendCaseLog bên dưới) — không gửi embed thứ hai.
  await logModAction(
    guild,
    guildConfig,
    {
      actionKey: "timeout",
      target: member.user,
      executor,
      reason,
      extra: [{ name: "Thời lượng", value: formatDuration(minutes) }],
    },
    store,
  );
  return `Đã timeout **${member.user.tag}** trong ${formatDuration(minutes)}${reason ? ` — Lý do: ${reason}` : ""}`;
}

async function kickMember({ guild, member, executor, reason, guildConfig, store }) {
  await member.kick(reason || undefined);
  // Thông báo Moderation thủ công đã gộp vào embed case kiểu Carl-bot (sendCaseLog bên dưới) — không gửi embed thứ hai.
  await logModAction(
    guild,
    guildConfig,
    {
      actionKey: "kick",
      target: member.user,
      executor,
      reason,
    },
    store,
  );
  return `Đã kick **${member.user.tag}**${reason ? ` — Lý do: ${reason}` : ""}`;
}

async function banMember({ guild, member, executor, reason, deleteDays, guildConfig, store }) {
  await member.ban({
    reason: reason || undefined,
    deleteMessageSeconds: (deleteDays || 0) * 86_400,
  });
  // Thông báo Moderation thủ công đã gộp vào embed case kiểu Carl-bot (sendCaseLog bên dưới) — không gửi embed thứ hai.
  await logModAction(
    guild,
    guildConfig,
    {
      actionKey: "ban",
      target: member.user,
      executor,
      reason,
      extra: [{ name: "Xóa tin nhắn", value: deleteDays ? `${deleteDays} ngày` : "Không" }],
    },
    store,
  );
  // Đường thoát cho người bị ban: DM kèm nút "Mở khiếu nại". Không có bước này
  // thì họ không có cách nào biết tồn tại lệnh `/mod unban`.
  // TUYỆT ĐỐI không để lỗi ở đây làm hỏng lệnh ban: ban đã xong rồi, người dùng
  // đã bị ban — ném lỗi ra chỉ khiến mod tưởng ban thất bại.
  await sendBanNoticeDm(guild, member.user, reason, guildConfig);
  return `Đã ban **${member.user.tag}**${reason ? ` — Lý do: ${reason}` : ""}`;
}

/**
 * Gửi DM cho người vừa bị ban, kèm nút mở khiếu nại.
 *
 * Tự bật/tắt theo `ticketDmOnBan` (mặc định BẬT) — chủ server không muốn thì
 * tắt được mà không phải sửa code.
 *
 * Ngôn ngữ theo NGƯỜI BỊ BAN (`user.locale`), không theo server: người bị ban
 * thường ở nước khác, nói tiếng khác cộng đồng. Không dùng IP — Discord không
 * cấp IP cho bot (xem `handlers/lang.js`).
 */
async function sendBanNoticeDm(guild, user, reason, guildConfig) {
  try {
    if (guildConfig?.ticketEnabled !== true) return false;
    if (guildConfig?.ticketDmOnBan === false) return false;
    const tickets = require("./tickets");
    const lang = require("./lang");
    // Ưu tiên locale tài khoản Discord của họ; không có thì rơi về locale server.
    const L = lang.langForUser({ user }, guild);
    const T = lang.ticketText(L);
    await user.send({
      embeds: [tickets.banNoticeEmbed({ guild, reason, T })],
      components: [tickets.dmButtonRow(T)],
    });
    return true;
  } catch {
    // User tắt DM / chặn bot → im lặng, đây là trường hợp phổ biến nhất.
    return false;
  }
}

async function untimeoutMember({ guild, member, executor, reason, guildConfig, store }) {
  // Kiểm tra member có đang bị timeout không
  if (!member.isCommunicationDisabled()) {
    throw new Error(`**${member.user.tag}** hiện không bị timeout.`);
  }
  await member.timeout(null, reason || undefined);
  // Gỡ chủ động → bỏ theo dõi để không log nhầm "timeout hết hạn" sau này.
  timeoutWatch.forget(guild.id, member.id);
  // Mod gỡ timeout tự động của bot → nếu đúng là bot phạt thì đếm misfire AI.
  misfire.noteRepealed(guild.id, member.id);
  await logModAction(
    guild,
    guildConfig,
    {
      actionKey: "untimeout",
      target: member.user,
      executor,
      reason,
    },
    store,
  );
  return `Đã gỡ timeout cho **${member.user.tag}**${reason ? ` — Lý do: ${reason}` : ""}`;
}

async function unbanMember({ guild, userId, executor, reason, guildConfig, store }) {
  // Kiểm tra member có đang bị ban không.
  //
  // ⚠️ BUG THẬT ĐÃ SỬA (27/09/2026): gọi `guild.members.fetchBan(...)` — hàm này
  // KHÔNG tồn tại trong discord.js v14 (đã bị gỡ từ v14). Nó ném TypeError
  // ĐỒNG BỘ, nên `.catch()` không bắt được → mọi lượt `/mod unban` đều chết
  // với "Không thể gỡ ban: guild.members.fetchBan is not a function". Đúng API
  // là `guild.bans.fetch(userId)` (trả Promise, từ chối nếu không bị ban).
  const ban = await guild.bans.fetch(userId).catch(() => null);
  if (!ban) {
    throw new Error(`**<@${userId}>** hiện không bị ban trong server này.`);
  }
  await guild.members.unban(userId, reason || undefined);
  // Mod gỡ ban tự động của bot → nếu đúng là bot phạt thì đếm misfire AI.
  misfire.noteRepealed(guild.id, userId);
  // Dùng username thật từ bản ghi ban (ban.user) thay vì hiển thị ID làm tên.
  await logModAction(
    guild,
    guildConfig,
    {
      actionKey: "unban",
      target: { id: ban.user.id, username: ban.user.username },
      executor,
      reason,
    },
    store,
  );
  return `Đã gỡ ban cho **<@${userId}>**${reason ? ` — Lý do: ${reason}` : ""}`;
}

async function unwarnMember({ guild, userId, heat, executor, reason, guildConfig, store }) {
  // Kiểm tra member có warn tích lũy không. strikeCount cần settings (cửa sổ warn)
  // — truyền heatSettings(guildConfig) nếu có, tránh TypeError khi heat là tracker thật.
  const s = heatSettings(guildConfig);
  const strikeCount = heat.strikeCount?.(guild.id, userId, s);
  if (!strikeCount || strikeCount === 0) {
    throw new Error(`**<@${userId}>** hiện không có warn tích lũy nào.`);
  }
  heat.clearStrikes(guild.id, userId);
  // Lấy username thật từ tracker (nếu có) thay vì hiển thị ID làm tên.
  const username = heat.strikeUsername?.(guild.id, userId) || userId;
  await logModAction(
    guild,
    guildConfig,
    {
      actionKey: "unwarn",
      target: { id: userId, username },
      executor,
      reason,
    },
    store,
  );
  return `Đã gỡ toàn bộ warn tích lũy (${strikeCount} warn) của **<@${userId}>**${reason ? ` — Lý do: ${reason}` : ""}`;
}

async function purgeChannel(channel, count, executor, guildConfig, store) {
  const n = Math.max(1, Math.min(100, Math.floor(count)));
  const deleted = await channel.bulkDelete(n, true);
  // Ghi bảng hình phạt trước để lấy số case.
  let caseNumber;
  if (store) {
    try {
      const rec = await store.client.mutation("bot_writes:botRecordModAction", {
        guildId: channel.guild.id,
        action: "Purge",
        executorId: executor.id,
        executorName: executor.username,
        reason: undefined,
        details: `Xóa ${deleted.size} tin nhắn tại #${channel.name}`,
      });
      caseNumber = rec?.caseNumber;
    } catch (e) {
      console.error(`[modTools:record] ${channel.guild.id}:`, e.message);
    }
  }
  try {
    await sendCaseLog({
      guild: channel.guild,
      guildConfig,
      action: "purge",
      caseNumber,
      offender: null,
      reason: `Xóa ${deleted.size} tin nhắn tại ${channel} (\`${channel.id}\`)`,
      executor,
    });
  } catch (e) {
    console.error(`[modTools:purge:log] ${channel.guild.id}:`, e.message);
  }
  return `Đã xóa **${deleted.size}** tin nhắn trong ${channel}`;
}

module.exports = {
  parseDuration,
  formatDuration,
  canMod,
  needPerm,
  timeoutMember,
  kickMember,
  banMember,
  purgeChannel,
  untimeoutMember,
  unbanMember,
  unwarnMember,
  logModAction,
};
