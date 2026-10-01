const { PermissionFlagsBits, Colors } = require("discord.js");
const { logEmbed, sendLog } = require("./util");

/** guildId -> true (locked by this bot process). */
const locked = new Set();

/**
 * guildId -> Map(channelId -> { flag, value }) — overwrite @everyone TRƯỚC khi
 * khoá từng kênh, để mở khoá TRẢ LẠI đúng cấu hình cũ thay vì xoá trắng
 * (kênh chủ server cố ý chặn SendMessages sẽ bị mở toang nếu set null).
 * Không có mục nào (markLocked từ tick sau restart) → mở khoá theo hành vi cũ.
 */
const lockPrev = new Map();

/** Guild đang trong một lượt khoá/mở khoá — chặn 2 trigger đồng thời sửa quyền 2 lần. */
const lockPending = new Set();

function isLocked(guildId) {
  return locked.has(guildId);
}

function markLocked(guildId) {
  locked.add(guildId);
}

/**
 * Giá trị overwrite @everyone của 1 quyền TRƯỚC khi khoá (3 trạng thái):
 * true = allow, false = deny, null = không đặt. Không đọc được cache overwrite
 * (mock thô / kênh lạ) → null — đúng hành vi xoá trắng trước đây.
 */
function prevOverwrite(channel, everyoneId, flag) {
  try {
    const ow = channel.permissionOverwrites?.cache?.get?.(everyoneId);
    if (!ow) return null;
    if (ow.allow?.has?.(flag)) return true;
    if (ow.deny?.has?.(flag)) return false;
    return null;
  } catch {
    return null;
  }
}

/**
 * Disable @everyone from sending messages / connecting to voice for a while.
 * Returns true when the lockdown was applied.
 */
async function lockGuild(client, guild, config, store) {
  // Giữ chỗ TRƯỚC mọi await: 2 trigger đồng thời (raid + nút bấm) cùng lọt qua
  // một phép kiểm là 2 vòng sửa quyền + 2 log — cổng phải đóng từ đầu.
  if (locked.has(guild.id) || lockPending.has(guild.id)) return false;
  lockPending.add(guild.id);
  try {
    const me = await guild.members.fetchMe().catch(() => null);
    if (!me || !me.permissions.has(PermissionFlagsBits.ManageChannels)) {
      const embed = logEmbed({
        title: "⚠️ Không thể khóa kênh",
        description:
          "Bot thiếu quyền **Quản lý kênh** (Manage Channels) nên không thể tự động khóa kênh khi raid. Hãy cấp quyền này cho bot.",
        color: Colors.Yellow,
        footer: "Protogon Anti Nuke",
      });
      await sendLog(guild, config, embed);
      return false;
    }

    const everyone = guild.roles.everyone;
    const minutes = config.lockdownMinutes || 5;
    let count = 0;
    const prev = new Map();
    for (const channel of guild.channels.cache.values()) {
      try {
        if (channel.isThread && channel.isThread()) continue; // thread nằm trong kênh cha
        // VOICE phải kiểm TRƯỚC text: discord.js v14 voice channel cũng có
        // `.messages` → isTextBased() trả true, nên bản cũ rơi vào nhánh text
        // và chặn SendMessages (chat trong voice) trong khi nhánh Connect
        // KHÔNG BAO GIỜ chạy — raid vẫn vào voice bình thường.
        if (channel.isVoiceBased && channel.isVoiceBased()) {
          const before = prevOverwrite(channel, everyone?.id, PermissionFlagsBits.Connect);
          await channel.permissionOverwrites.edit(everyone, { Connect: false });
          prev.set(channel.id, { flag: "Connect", value: before });
          count++;
        } else if (channel.isTextBased && channel.isTextBased()) {
          const before = prevOverwrite(channel, everyone?.id, PermissionFlagsBits.SendMessages);
          await channel.permissionOverwrites.edit(everyone, { SendMessages: false });
          prev.set(channel.id, { flag: "SendMessages", value: before });
          count++;
        }
      } catch {
        // channel without overwrite support (e.g. category edge cases) — skip
      }
    }

    locked.add(guild.id);
    lockPrev.set(guild.id, prev);

    const until = Date.now() + minutes * 60_000;
    // Cache config được xóa TỰ ĐỘNG sau lượt ghi này (proxy trong convex.js — xem
    // CONFIG_WRITE_MUTATIONS). Bắt buộc với tính đúng ở đây: `tickUnlocks` đọc
    // `lockdownUntil` từ cache để biết lúc nào mở khóa, nên cache cũ (until = null)
    // làm kênh bị khóa lâu hơn cấu hình (tới hết TTL 30 phút).
    await store.client.mutation("bot_writes:botLockState", { guildId: guild.id, until });

    const embed = logEmbed({
      title: "🔒 Đã khóa kênh do raid",
      description: `Server đã bị **khóa ${minutes} phút** — thành viên không gửi được tin nhắn/voice cho tới khi hết hạn hoặc mod dùng \`/antinuke unlock\`.`,
      color: Colors.Red,
      fields: [{ name: "Kênh bị khóa", value: `${count} kênh`, inline: true }],
      footer: "Protogon Anti Nuke",
    });
    await sendLog(guild, config, embed);
    return true;
  } finally {
    // Giải phóng cổng chống chồng lượt dù có lỗi giữa chừng.
    lockPending.delete(guild.id);
  }
}

/** Reset @everyone overwrites so members can chat again. Returns true when unlocked. */
async function unlockGuild(client, guild, config, store) {
  if (!locked.has(guild.id) || lockPending.has(guild.id)) return false;
  lockPending.add(guild.id);
  try {
    const everyone = guild.roles.everyone;
    const prev = lockPrev.get(guild.id);
    let count = 0;
    for (const channel of guild.channels.cache.values()) {
      try {
        const saved = prev?.get(channel.id);
        if (saved) {
          // Trả lại ĐÚNG giá trị trước khi khoá (allow/deny chủ đích của chủ
          // server không bị biến thành "không đặt").
          await channel.permissionOverwrites.edit(everyone, { [saved.flag]: saved.value });
          count++;
        } else if (
          (channel.isVoiceBased && channel.isVoiceBased()) ||
          (channel.isTextBased &&
            channel.isTextBased() &&
            !(channel.isThread && channel.isThread()))
        ) {
          // Không có ảnh chụp (markLocked từ tick sau restart) → hành vi cũ.
          await channel.permissionOverwrites.edit(everyone, {
            SendMessages: null,
            Connect: null,
          });
          count++;
        }
      } catch {
        // ignore channels that can't be edited
      }
    }
    locked.delete(guild.id);
    lockPrev.delete(guild.id);

    // Cache được xóa tự động sau lượt ghi (convex.js). Không xóa thì bản cache cũ
    // vẫn giữ `lockdownUntil` ở tương lai → `tickUnlocks` tưởng server còn đang khóa
    // (đánh dấu lại vào `locked`) → lần raid sau bị bỏ qua → server mất bảo vệ.
    await store.client.mutation("bot_writes:botLockState", {
      guildId: guild.id,
      until: null,
      requested: false,
    });
    const embed = logEmbed({
      title: "🔓 Đã mở khóa kênh",
      description: `Đã mở lại **${count} kênh** — thành viên có thể giao tiếp bình thường.`,
      color: Colors.Green,
      footer: "Protogon Anti Nuke",
    });
    await sendLog(guild, config, embed);
    return true;
  } finally {
    lockPending.delete(guild.id);
  }
}

module.exports = { isLocked, markLocked, lockGuild, unlockGuild };
