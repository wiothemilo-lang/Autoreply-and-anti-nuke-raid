const { EmbedBuilder, Colors } = require("discord.js");
const { sendModLog } = require("./util");
const { escapeMentions } = require("./ticketCore");
const { logT, logLabel } = require("./logI18n");

/** Các hành động có mức chi tiết cấu hình được trên web (phần Moderation). */
const NOTICE_ACTIONS = ["ban", "timeout", "kick", "warn"];
/** Thứ tự mức chi tiết: none (0) → action (1) → reason (2) → full (3). */
const LEVEL_ORDER = { none: 0, action: 1, reason: 2, full: 3 };

/** Màu của từng hành động (cũng là thanh accent bên trái embed, kiểu Carl-bot). */
const CASE_COLOR = {
  ban: Colors.Red,
  timeout: Colors.Orange,
  kick: Colors.Red,
  warn: Colors.Yellow,
  purge: Colors.Blue,
  untimeout: Colors.Green,
  timeout_expired: Colors.Green,
  unban: Colors.Green,
  unwarn: Colors.Green,
  delete: Colors.DarkerGrey,
};

/** Nhãn tiêu đề cho từng hành động. */
const CASE_LABEL = {
  ban: "🚫 Ban",
  timeout: "⏱️ Timeout",
  kick: "👢 Kick",
  warn: "⚠️ Warn",
  purge: "🧹 Purge",
  untimeout: "🔓 Gỡ timeout",
  timeout_expired: "⏱️ Timeout hết hạn",
  unban: "🔓 Gỡ ban",
  unwarn: "🧹 Gỡ warn",
  delete: "🗑️ Message deleted",
};

/** Format thời gian kiểu Carl-bot: "00:49 2/8/26". */
function fmtTimestamp(ts = Date.now()) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = String(d.getFullYear()).slice(2);
  return `${hh}:${mm} ${day}/${month}/${year}`;
}

/**
 * Gửi embed log moderation kiểu Carl-bot tới KÊNH LOG MODERATION (gộp chung
 * auto-mod + lệnh mod thủ công) — modLogChannelId, mặc định kênh log chung.
 *
 * - offender: { id, username } — thành viên bị xử lý (bỏ qua với purge).
 * - executor: người dùng lệnh thủ công; null/undefined = bot tự động → dòng
 *   "Responsible moderator" hiển thị tên bot.
 * - reason: lý do vi phạm (auto-mod) hoặc lý do mod ghi; để trống → "không có lý do".
 * - caseNumber: số case tăng dần của server ("warn | case 30"); bỏ qua khi không có.
 * - extraDescription: các dòng bổ sung phía dưới (vd thời lượng timeout, xóa N ngày…).
 */
async function sendCaseLog({
  guild,
  guildConfig,
  action,
  caseNumber,
  offender,
  reason,
  executor,
  color,
  extraDescription = [],
}) {
  if (!guild || !guildConfig) return null;
  // Nhãn theo ngôn ngữ CHỦ SERVER đặt (logLang, mặc định vi). CASE_LABEL giữ
  // lại làm fallback để hành động lạ không bị mất nhãn.
  const lang = guildConfig.logLang;
  const label = logLabel(lang, action, CASE_LABEL[action] || action);

  // ĐỒNG BỘ VỚI PHẦN MODERATION TRÊN WEB: mức chi tiết theo từng hành động
  // (none/action/reason/full) + kênh gửi (punishNoticeChannelId → mod log → log chung).
  //  - none   → không gửi embed (dashboard vẫn ghi nhận hình phạt)
  //  - action → Offender
  //  - reason → thêm Reason (trống → "không có lý do")
  //  - full   → thêm Responsible moderator (bot tự động = tên bot, mod lệnh = tên người dùng)
  // purge / delete (không nằm trong bảng cấu hình) luôn hiển thị đầy đủ.
  // "timeout_expired" là hậu quả của timeout → tôn trọng mức chi tiết timeout
  // (chủ server chọn none = không muốn thấy bất kỳ log timeout nào).
  const noticeKey = action === "timeout_expired" ? "timeout" : action;
  const level = NOTICE_ACTIONS.includes(noticeKey)
    ? guildConfig.punishNotice?.[noticeKey] || "full"
    : "full";
  if ((LEVEL_ORDER[level] ?? 3) === 0) return null;

  const botUser = guild.client?.user;
  const responsible = executor
    ? executor.username || executor.tag || "mod"
    : botUser
      ? botUser.username
      : logT(lang, "bot");
  const lines = [];
  if (offender && offender.id) {
    lines.push(`${logT(lang, "offender")} ${offender.username || offender.id} <@${offender.id}>`);
  }
  if ((LEVEL_ORDER[level] ?? 3) >= 2) {
    lines.push(`${logT(lang, "reason")} ${reason || logT(lang, "noReason")}`);
  }
  if ((LEVEL_ORDER[level] ?? 3) >= 3) {
    lines.push(`${logT(lang, "responsible")} ${responsible}`);
  }
  for (const line of extraDescription) lines.push(String(line));

  const embed = new EmbedBuilder()
    .setColor(color ?? CASE_COLOR[action] ?? Colors.Red)
    .setTitle(`${label}${caseNumber ? ` | ${logT(lang, "case")} ${caseNumber}` : ""}`)
    .setDescription(lines.join("\n"))
    .setTimestamp();
  embed.setFooter({
    text: offender && offender.id ? `ID: ${offender.id} • ${fmtTimestamp()}` : fmtTimestamp(),
  });

  // Hạng mục log chi tiết cho webhook (ban/kick/timeout/warn/purge/unban/untimeout…)
  // + meta để chèn {action} {reason} {user} {mod} vào nội dung kèm của webhook.
  const EVENT_TYPE_OF = {
    ban: "ban",
    timeout: "timeout",
    kick: "kick",
    warn: "warn",
    purge: "purge",
    untimeout: "untimeout",
    timeout_expired: "timeout",
    unban: "unban",
    unwarn: "warn",
    delete: "mod",
  };
  // Kênh gửi ưu tiên kênh thông báo hình phạt (Moderation trên web), rồi log mod, rồi log chung.
  await sendModLog(
    guild,
    guildConfig,
    embed,
    guildConfig.punishNoticeChannelId,
    EVENT_TYPE_OF[action] || "mod",
    {
      action: label,
      // Escape lý do: nó đi vào `content` của webhook — CHỈ content mới ping
      // được. Embed thì không ping, nên phần trong embed giữ nguyên để staff
      // đọc đúng những gì mod gõ.
      reason: escapeMentions(reason || ""),
      user: offender?.username ?? "",
      mod: responsible,
    },
  );
  return embed;
}

module.exports = { sendCaseLog, fmtTimestamp, CASE_COLOR, CASE_LABEL, NOTICE_ACTIONS, LEVEL_ORDER };
