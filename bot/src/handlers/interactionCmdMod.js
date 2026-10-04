// Nhóm lệnh slash "moderation" — tách từ handlers/interactionCreate.js (đợt #5
// tách monolith — 03/10/2026). Chỉ CHUYỂN CHỖ code, không đổi hành vi.
//
// Gồm: /lock (kèm `lockCommand` + danh sách MODULES antinuke) · /antinuke ·
// /mod. Mỗi hàm lệnh dưới đây CHÍNH LÀ thân `case "..."` cũ, chỉ đổi vỏ thành
// hàm nhận tham số — interactionCreate.js gọi theo tên lệnh.

const { EmbedBuilder, Colors } = require("discord.js");
const { canManageGuild, isAdmin, sendLog } = require("../util");
const { isLocked, markLocked, unlockGuild } = require("../lockdown");
const channelLock = require("../channelLock");
const {
  parseDuration,
  canMod,
  timeoutMember,
  kickMember,
  banMember,
  purgeChannel,
  untimeoutMember,
  unbanMember,
  unwarnMember,
} = require("./modTools");
// `MODULES` chuyển sang interactionCommon để `/antinuke module` (kiểm hợp lệ)
// và gợi ý autocomplete dùng CHUNG một danh sách — tránh hai bản lệch nhau.
const { needPerm, MODULES } = require("./interactionCommon");

/**
 * `/lock` — khoá chat của chủ server (một kênh, tất cả, theo role, tự mở hạn).
 *
 * Lý do tách khỏi `lockdown.js`: đó là khoá TOÀN SERVER khi raid, chỉ
 * @everyone, do bot tự quyết. Lệnh này là thao tác chủ động của người quản
 * trị, nhận role và thời lượng — và phải KHÔI PHỤC ĐÚNG quyền cũ (xem
 * `channelLock.js`).
 */
async function lockCommand(client, store, interaction) {
  const guild = interaction.guild;
  if (!guild)
    return interaction.reply({ content: "Lệnh này chỉ hoạt động trong server.", ephemeral: true });
  if (!canManageGuild(interaction.member) && !isAdmin(interaction.member))
    return needPerm(interaction);
  if (!channelLock.botCanManageChannels(guild)) {
    return interaction.reply({
      content:
        "⚠️ Bot thiếu quyền **Quản lý kênh** (Manage Channels) nên không khoá/mở khoá được. Hãy cấp quyền cho bot.",
      ephemeral: true,
    });
  }

  const sub = interaction.options.getSubcommand();
  const config = await store.getConfig(guild.id);
  const botKey = process.env.PROTOGON_BOT_KEY || undefined;
  const target = channelLock.resolveTargetRole(guild, interaction.options.getRole("role", false));
  if (!target.ok) return interaction.reply({ content: `❌ ${target.error}`, ephemeral: true });
  const who = `${interaction.user.username}`;

  // ── /lock list ──
  if (sub === "list") {
    const rows = await store.client
      .query("channelLocks:botChannelLocks", { guildId: guild.id, botKey })
      .catch(() => []);
    if (!rows || rows.length === 0) {
      return interaction.reply({
        content: "✅ Không có kênh nào đang bị Protogon khoá.",
        ephemeral: true,
      });
    }
    const lines = rows.slice(0, 20).map((r) => {
      const ch = guild.channels.cache.get(r.channelId);
      const dur =
        r.until === null || r.until === undefined
          ? "vô hạn"
          : channelLock.formatLockDuration(Math.max(1, Math.round((r.until - Date.now()) / 60000)));
      return `🔒 ${channelLock.channelLabel(ch)} — ${channelLock.roleLabel(guild, r.roleId)} · ${dur}`;
    });
    if (rows.length > 20) lines.push(`… và ${rows.length - 20} kênh nữa.`);
    return interaction.reply({
      content: lines.join("\n").slice(0, 1900),
      ephemeral: true,
    });
  }

  // ── Thời lượng: rỗng = VÔ HẠN ──
  let minutes = null;
  if (sub === "add" || sub === "all") {
    const parsed = channelLock.parseLockMinutes(interaction.options.getString("phut", false));
    if (!parsed.ok) return interaction.reply({ content: `❌ ${parsed.error}`, ephemeral: true });
    minutes = parsed.minutes;
  }

  // ── Mở khoá ──
  if (sub === "remove" || sub === "unlock-all") {
    const existing =
      (await store.client
        .query("channelLocks:botChannelLocks", { guildId: guild.id, botKey })
        .catch(() => [])) || [];
    const wanted = new Set(
      existing.filter((r) => r.roleId === target.roleId).map((r) => r.channelId),
    );
    if (sub === "remove") {
      const channel = interaction.options.getChannel("kenh", true);
      // ⚠️ Chỉ mở khoá kênh MÌNH CÓ bản ghi khoá. Thêm vô điều kiện sẽ khiến
      // nhánh "không do Protogon khoá" bên dưới chết cụt — và đó chính là
      // chỗ ngăn bot xoá cấu hình riêng của chủ server.
      wanted.clear();
      if (existing.some((r) => r.channelId === channel.id && r.roleId === target.roleId)) {
        wanted.add(channel.id);
      }
    }
    if (wanted.size === 0) {
      return interaction.reply({
        content: `Kênh này không do Protogon khoá — mình KHÔNG tự mở quyền để tránh xoá nhầm cấu hình của bạn. Hãy mở trực tiếp trong Discord.`,
        ephemeral: true,
      });
    }
    const records = existing.filter((r) => wanted.has(r.channelId) && r.roleId === target.roleId);
    const out = await channelLock.releaseLocks({
      client,
      guild,
      records,
      store,
      botKey,
    });
    if (out.failed.length) {
      return interaction.reply({
        content: `⚠️ Mở được ${out.restored.length} kênh nhưng có lỗi: ${out.failed.join(" | ").slice(0, 800)}`,
        ephemeral: true,
      });
    }
    await sendLog(
      guild,
      config,
      channelLock.lockLogEmbed({
        action: "unlock",
        channelNames: out.restored,
        roleLabel: target.everyone ? "@everyone" : channelLock.roleLabel(guild, target.roleId),
        duration: null,
        actor: who,
      }),
    );
    return interaction.reply({
      content:
        `🔓 Đã mở khoá ${out.restored.length} kênh.` +
        (out.missing.length ? ` ${out.missing.length} kênh không còn tồn tại (đã dọn).` : ""),
      ephemeral: true,
    });
  }

  // ── Khoá ──
  const existing =
    (await store.client
      .query("channelLocks:botChannelLocks", { guildId: guild.id, botKey })
      .catch(() => [])) || [];
  const alreadyLocked = new Set(
    existing.filter((r) => r.roleId === target.roleId).map((r) => r.channelId),
  );
  const reason = (interaction.options.getString("lydo", false) || "").slice(0, 200);
  const until = minutes === null ? undefined : Date.now() + minutes * 60_000;

  const targets =
    sub === "add"
      ? (() => {
          const channel = interaction.options.getChannel("kenh", true);
          const kind = channelLock.channelLockKind(channel);
          return kind ? [{ channel, kind }] : [];
        })()
      : channelLock.collectChatChannels(guild);

  if (targets.length === 0) {
    return interaction.reply({
      content:
        sub === "add"
          ? "❌ Không khoá được kênh này (danh mục, thread, hoặc kênh bot không có quyền sửa)."
          : "❌ Server không có kênh chat nào để khoá.",
      ephemeral: true,
    });
  }

  const done = [];
  const skipped = [];
  const failed = [];
  for (const { channel, kind } of targets) {
    if (alreadyLocked.has(channel.id)) {
      skipped.push(channelLock.channelLabel(channel));
      continue;
    }
    const r = await channelLock.lockChannel({ channel, roleId: target.roleId, kind });
    if (!r.ok) {
      failed.push(`${channelLock.channelLabel(channel)}: ${r.error}`);
      continue;
    }
    // Chỉ ghi bản ghi SAU khi ghi quyền thành công — bản ghi mà không khoá
    // được thì lúc mở sẽ "khôi phục" một thứ chưa từng bị đổi.
    //
    // ⚠️ Ngược lại, ghi bản ghi HỎNG sau khi đã ghi quyền thì kênh bị khoá mà
    // không có dấu vết nào để mở lại — chủ server phải tự vào Discord gỡ tay.
    // Nên hoàn tác quyền ngay khi lưu thất bại, đừng để lệ ở trạng thái nửa vời.
    try {
      await store.client.mutation("channelLocks:botSaveChannelLock", {
        botKey,
        guildId: guild.id,
        channelId: channel.id,
        roleId: target.roleId,
        kind,
        prev: r.prev ?? null,
        until,
        reason: reason || undefined,
        lockedBy: interaction.user.id,
      });
    } catch (e) {
      await channelLock
        .unlockChannel({ channel, roleId: target.roleId, kind, prev: r.prev })
        .catch(() => {});
      failed.push(
        `${channelLock.channelLabel(channel)}: lưu thất bại, đã trả lại quyền (${e?.message || e})`,
      );
      continue;
    }
    done.push(channelLock.channelLabel(channel));
  }

  if (done.length === 0) {
    return interaction.reply({
      content:
        (skipped.length ? `Các kênh này đã bị khoá rồi: ${skipped.join(", ")}. ` : "") +
        (failed.length ? `Lỗi: ${failed.join(" | ").slice(0, 800)}` : ""),
      ephemeral: true,
    });
  }
  if (done.length) {
    await sendLog(
      guild,
      config,
      channelLock.lockLogEmbed({
        action: "lock",
        channelNames: done.slice(0, 20),
        roleLabel: target.everyone ? "@everyone" : channelLock.roleLabel(guild, target.roleId),
        duration: minutes,
        reason,
        actor: who,
      }),
    );
  }
  const notes = [];
  if (skipped.length) notes.push(`${skipped.length} kênh đã khoá sẵn (bỏ qua).`);
  if (failed.length) notes.push(`${failed.length} kênh lỗi: ${failed.join(" | ").slice(0, 600)}`);
  return interaction.reply({
    content:
      `🔒 Đã khoá ${done.length} kênh` +
      ` (${channelLock.formatLockDuration(minutes)}, ${target.everyone ? "@everyone" : channelLock.roleLabel(guild, target.roleId)}).` +
      (notes.length ? `\n` + notes.join("\n") : ""),
    ephemeral: true,
  });
}

/** `/lock` — điểm vào lệnh. */
async function lock(client, store, interaction) {
  return lockCommand(client, store, interaction);
}

/** `/antinuke` — trạng thái, bật/tắt, module, unlock, lockdown. */
async function antinuke(client, store, interaction, guild) {
  const sub = interaction.options.getSubcommand();

  if (sub === "status") {
    const config = await store.getConfig(guild.id);
    const modules = config?.modules || [];
    const lines = modules.map(
      (m) =>
        `${m.enabled ? "✅" : "⏸️"} \`${m.module}\` — ${m.threshold} lần/${m.windowSeconds}s — ${m.punish}`,
    );
    const embed = new EmbedBuilder()
      .setColor(config?.antinukeEnabled ? Colors.Green : Colors.Red)
      .setTitle(`🛡️ Chống nuke: ${config?.antinukeEnabled ? "ĐANG BẬT" : "ĐÃ TẮT"}`)
      .setDescription(lines.join("\n") || "Chưa có module nào.");
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (!canManageGuild(interaction.member) && !isAdmin(interaction.member))
    return needPerm(interaction);

  if (sub === "unlock") {
    if (!isLocked(guild.id)) {
      const config = await store.getConfig(guild.id);
      if (!config?.lockdownUntil || config.lockdownUntil <= Date.now()) {
        return interaction.reply({
          content: "Server hiện không ở trạng thái khóa kênh.",
          ephemeral: true,
        });
      }
      markLocked(guild.id);
    }
    const config = await store.getConfig(guild.id);
    await unlockGuild(client, guild, config, store);
    return interaction.reply({
      content: "🔓 Đã mở khóa kênh.",
      ephemeral: true,
    });
  }

  if (sub === "lockdown") {
    const value = interaction.options.getString("value", true);
    if (!["on", "off"].includes(value)) {
      return interaction.reply({ content: "Giá trị phải là on hoặc off.", ephemeral: true });
    }
    await store.client.mutation("bot_writes:botUpdateLockdown", {
      guildId: guild.id,
      enabled: value === "on",
    });
    store.invalidate(guild.id);
    return interaction.reply({
      content:
        value === "on"
          ? "✅ Khóa kênh tự động khi raid đã bật."
          : "✅ Khóa kênh tự động khi raid đã tắt.",
      ephemeral: true,
    });
  }

  if (sub === "on" || sub === "off") {
    await store.client.mutation("bot_writes:botSetAntinuke", {
      guildId: guild.id,
      enabled: sub === "on",
    });
    store.invalidate(guild.id);
    return interaction.reply({
      content: `✅ Đã ${sub === "on" ? "bật" : "tắt"} chống nuke.`,
      ephemeral: true,
    });
  }

  if (sub === "module") {
    const moduleName = interaction.options.getString("module", true);
    const value = interaction.options.getString("value", true);
    if (!MODULES.includes(moduleName) || !["on", "off"].includes(value)) {
      return interaction.reply({
        content: `Module phải thuộc: ${MODULES.join(", ")} và giá trị là on|off.`,
        ephemeral: true,
      });
    }
    await store.client.mutation("bot_writes:botModuleUpdate", {
      guildId: guild.id,
      module: moduleName,
      enabled: value === "on",
    });
    store.invalidate(guild.id);
    return interaction.reply({
      content: `✅ Module \`${moduleName}\` đã ${value === "on" ? "bật" : "tắt"}.`,
      ephemeral: true,
    });
  }
  return;
}

/** `/mod` — timeout/kick/ban/purge/untimeout/unban/unwarn. */
async function mod(store, interaction, guild, heat) {
  const sub = interaction.options.getSubcommand();
  const config = await store.getConfig(guild.id);
  if (!canMod(interaction, config)) return needPerm(interaction);

  if (sub === "timeout") {
    const target = interaction.options.getMember("user");
    const minutes = parseDuration(interaction.options.getString("duration", true));
    const reason = interaction.options.getString("reason") || undefined;
    if (!target) {
      return interaction.reply({ content: "Không tìm thấy thành viên đó.", ephemeral: true });
    }
    if (!minutes) {
      return interaction.reply({
        content: "Thời lượng không hợp lệ (ví dụ: `10m`, `2h`, `1d`). Tối đa 7 ngày.",
        ephemeral: true,
      });
    }
    try {
      const out = await timeoutMember({
        guild,
        member: target,
        executor: interaction.user,
        minutes,
        reason,
        guildConfig: config,
        store,
      });
      return interaction.reply({ content: `✅ ${out}`, ephemeral: true });
    } catch (e) {
      return interaction.reply({
        content: `❌ Không thể timeout: ${e.message}`,
        ephemeral: true,
      });
    }
  }

  if (sub === "kick") {
    const target = interaction.options.getMember("user");
    const reason = interaction.options.getString("reason") || undefined;
    if (!target) {
      return interaction.reply({ content: "Không tìm thấy thành viên đó.", ephemeral: true });
    }
    try {
      const out = await kickMember({
        guild,
        member: target,
        executor: interaction.user,
        reason,
        guildConfig: config,
        store,
      });
      return interaction.reply({ content: `✅ ${out}`, ephemeral: true });
    } catch (e) {
      return interaction.reply({ content: `❌ Không thể kick: ${e.message}`, ephemeral: true });
    }
  }

  if (sub === "ban") {
    const target = interaction.options.getMember("user");
    const reason = interaction.options.getString("reason") || undefined;
    const deleteDays = Math.max(0, Math.min(7, interaction.options.getInteger("delete_days") ?? 0));
    if (!target) {
      return interaction.reply({ content: "Không tìm thấy thành viên đó.", ephemeral: true });
    }
    try {
      const out = await banMember({
        guild,
        member: target,
        executor: interaction.user,
        reason,
        deleteDays,
        guildConfig: config,
        store,
      });
      return interaction.reply({ content: `✅ ${out}`, ephemeral: true });
    } catch (e) {
      return interaction.reply({ content: `❌ Không thể ban: ${e.message}`, ephemeral: true });
    }
  }

  if (sub === "purge") {
    const count = interaction.options.getInteger("count", true);
    try {
      const out = await purgeChannel(interaction.channel, count, interaction.user, config, store);
      return interaction.reply({ content: `✅ ${out}`, ephemeral: true });
    } catch (e) {
      return interaction.reply({
        content: `❌ Không thể purge: ${e.message}`,
        ephemeral: true,
      });
    }
  }

  if (sub === "untimeout") {
    const target = interaction.options.getMember("user");
    const reason = interaction.options.getString("reason") || undefined;
    if (!target) {
      return interaction.reply({ content: "Không tìm thấy thành viên đó.", ephemeral: true });
    }
    try {
      const out = await untimeoutMember({
        guild,
        member: target,
        executor: interaction.user,
        reason,
        guildConfig: config,
        store,
      });
      return interaction.reply({ content: `✅ ${out}`, ephemeral: true });
    } catch (e) {
      return interaction.reply({
        content: `❌ Không thể gỡ timeout: ${e.message}`,
        ephemeral: true,
      });
    }
  }

  if (sub === "unban") {
    const target = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") || undefined;
    if (!target) {
      return interaction.reply({ content: "Không tìm thấy người dùng đó.", ephemeral: true });
    }
    try {
      const out = await unbanMember({
        guild,
        userId: target.id,
        executor: interaction.user,
        reason,
        guildConfig: config,
        store,
      });
      return interaction.reply({ content: `✅ ${out}`, ephemeral: true });
    } catch (e) {
      return interaction.reply({
        content: `❌ Không thể gỡ ban: ${e.message}`,
        ephemeral: true,
      });
    }
  }

  if (sub === "unwarn") {
    const target = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") || undefined;
    if (!target) {
      return interaction.reply({ content: "Không tìm thấy người dùng đó.", ephemeral: true });
    }
    try {
      const out = await unwarnMember({
        guild,
        userId: target.id,
        heat,
        executor: interaction.user,
        reason,
        guildConfig: config,
        store,
      });
      return interaction.reply({ content: `✅ ${out}`, ephemeral: true });
    } catch (e) {
      return interaction.reply({
        content: `❌ Không thể gỡ warn: ${e.message}`,
        ephemeral: true,
      });
    }
  }
  return;
}

module.exports = { lock, antinuke, mod };
