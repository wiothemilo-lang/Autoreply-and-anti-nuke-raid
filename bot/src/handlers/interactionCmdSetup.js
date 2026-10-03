// Nhóm lệnh slash "cấu hình" — tách từ handlers/interactionCreate.js (đợt #5
// tách monolith — 03/10/2026). Chỉ CHUYỂN CHỖ code, không đổi hành vi.
//
// Gồm: /verify (thiết lập xác minh) · /setup (log/mod/admin role) · /alt
// (alt detection). Mỗi hàm lệnh dưới đây CHÍNH LÀ thân `case "..."` cũ, chỉ
// đổi vỏ thành hàm nhận tham số — interactionCreate.js gọi theo tên lệnh.

const {
  EmbedBuilder,
  Colors,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { canManageGuild, isAdmin } = require("../util");
const { needPerm } = require("./interactionCommon");

/** `/verify` — setup/toggle/method cho xác minh thành viên. */
async function verify(store, interaction, guild) {
  const sub = interaction.options.getSubcommand();
  if (!canManageGuild(interaction.member)) return needPerm(interaction);

  if (sub === "setup") {
    const channel = interaction.options.getChannel("channel", true);
    const unverifiedRole = interaction.options.getRole("unverified_role", true);
    const verifiedRole = interaction.options.getRole("verified_role", true);
    const method = interaction.options.getString("method") || "button";
    await store.client.mutation("bot_writes:botUpdateSettings", {
      guildId: guild.id,
      verifyEnabled: true,
      verifyMethod: method,
      verifyChannelId: channel.id,
      unverifiedRoleId: unverifiedRole.id,
      verifiedRoleId: verifiedRole.id,
    });
    store.invalidate(guild.id);
    try {
      const embed = new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setTitle("✅ Xác minh thành viên")
        .setDescription(
          method === "captcha"
            ? "Nhấn nút bên dưới để nhận mã xác minh qua DM, sau đó nhập mã trong kênh này."
            : "Nhấn nút bên dưới để xác minh và vào server.",
        );
      const row = new ActionRowBuilder();
      if (method === "captcha") {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId("verify_request_captcha")
            .setLabel("Nhận mã xác minh 🔑")
            .setStyle(ButtonStyle.Primary),
        );
      } else {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId("verify_confirm")
            .setLabel("Xác minh ✅")
            .setStyle(ButtonStyle.Success),
        );
      }
      await channel.send({ embeds: [embed], components: [row] });
    } catch (e) {
      console.error(`[verify:setup:send] ${guild.id}:`, e.message);
    }
    return interaction.reply({
      content: `✅ Đã thiết lập xác minh (${method === "captcha" ? "captcha" : "button"}): kênh ${channel}, role chưa xác minh ${unverifiedRole}, role đã xác minh ${verifiedRole}.`,
      ephemeral: true,
    });
  }

  if (sub === "toggle") {
    const value = interaction.options.getString("value", true);
    if (!["on", "off"].includes(value)) {
      return interaction.reply({ content: "Giá trị phải là on hoặc off.", ephemeral: true });
    }
    await store.client.mutation("bot_writes:botUpdateSettings", {
      guildId: guild.id,
      verifyEnabled: value === "on",
    });
    store.invalidate(guild.id);
    return interaction.reply({
      content: `✅ Đã ${value === "on" ? "bật" : "tắt"} xác minh thành viên.`,
      ephemeral: true,
    });
  }

  if (sub === "method") {
    const type = interaction.options.getString("type", true);
    if (!["button", "captcha"].includes(type)) {
      return interaction.reply({
        content: "Phương thức phải là button hoặc captcha.",
        ephemeral: true,
      });
    }
    await store.client.mutation("bot_writes:botUpdateSettings", {
      guildId: guild.id,
      verifyMethod: type,
    });
    store.invalidate(guild.id);
    return interaction.reply({
      content: `✅ Đã đổi phương thức xác minh thành **${type === "captcha" ? "captcha — nhập mã DM" : "button — bấm nút"}**.`,
      ephemeral: true,
    });
  }
  return;
}

/** `/setup` — kênh log, role mod, role admin. */
async function setup(store, interaction, guild) {
  if (!canManageGuild(interaction.member)) return needPerm(interaction);
  const sub = interaction.options.getSubcommand();

  if (sub === "log-channel") {
    const channel = interaction.options.getChannel("channel", true);
    await store.client.mutation("bot_writes:botUpdateSettings", {
      guildId: guild.id,
      logChannelId: channel.id,
    });
    store.invalidate(guild.id);
    return interaction.reply({
      content: `✅ Kênh log đã đặt là ${channel}.`,
      ephemeral: true,
    });
  }

  if (sub === "mod-role") {
    const role = interaction.options.getRole("role", true);
    const config = await store.getConfig(guild.id);
    const modRoles = [...new Set([...(config?.modRoles || []), role.id])];
    await store.client.mutation("bot_writes:botUpdateSettings", {
      guildId: guild.id,
      modRoles,
    });
    store.invalidate(guild.id);
    return interaction.reply({
      content: `✅ Role Mod đã thêm ${role}.`,
      ephemeral: true,
    });
  }

  if (sub === "admin-role") {
    const role = interaction.options.getRole("role", true);
    const config = await store.getConfig(guild.id);
    const adminRoles = [...new Set([...(config?.adminRoles || []), role.id])];
    await store.client.mutation("bot_writes:botUpdateSettings", {
      guildId: guild.id,
      adminRoles,
    });
    store.invalidate(guild.id);
    return interaction.reply({
      content: `✅ Role Admin đã thêm ${role}.`,
      ephemeral: true,
    });
  }
  return;
}

/** `/alt` — alt detection: status/on/off/punish/threshold/vpn. */
async function alt(store, interaction, guild) {
  const sub = interaction.options.getSubcommand();
  const config = await store.getConfig(guild.id);
  if (!canManageGuild(interaction.member) && !isAdmin(interaction.member))
    return needPerm(interaction);

  if (sub === "status") {
    const enabled = config?.altDetectionEnabled ?? false;
    const vpnMode = config?.altVpnMode ?? "off";
    const maxRisk = config?.altMaxRiskScore ?? 70;
    const minAge = config?.altMinAgeDays ?? 7;
    const punish = config?.altPunish ?? "kick";
    const embed = new EmbedBuilder()
      .setColor(enabled ? Colors.Green : Colors.Red)
      .setTitle("🔍 Alt Detection Status")
      .setDescription(
        [
          `**Phát hiện alt account:** ${enabled ? "✅ BẬT" : "⏸️ TẮT"}`,
          `**Chế độ VPN:** ${vpnMode === "strict" ? "🔒 Nghiêm ngặt" : vpnMode === "warn" ? "⚠️ Cảnh báo" : "⏸️ Tắt"}`,
          `**Ngưỡng rủi ro:** ${maxRisk}/100`,
          `**Tuổi tối thiểu:** ${minAge} ngày`,
          `**Hình phạt:** ${punish}`,
          `**Tương đồng username:** ≥${config?.altSimilarityThreshold ?? 70}%`,
          `**Cửa sổ join:** ${config?.altJoinWindowMinutes ?? 5} phút`,
        ].join("\n"),
      );
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (sub === "on" || sub === "off") {
    await store.client.mutation("bot_writes:botUpdateSettings", {
      guildId: guild.id,
      altDetectionEnabled: sub === "on",
    });
    store.invalidate(guild.id);
    return interaction.reply({
      content: `✅ Đã ${sub === "on" ? "bật" : "tắt"} phát hiện alt account.`,
      ephemeral: true,
    });
  }

  if (sub === "punish") {
    const type = interaction.options.getString("type", true);
    if (!["kick", "ban", "timeout", "verify"].includes(type)) {
      return interaction.reply({
        content: "Hình phạt phải là: kick, ban, timeout, hoặc verify.",
        ephemeral: true,
      });
    }
    await store.client.mutation("bot_writes:botUpdateSettings", {
      guildId: guild.id,
      altPunish: type,
    });
    store.invalidate(guild.id);
    return interaction.reply({
      content: `✅ Hình phạt alt account đã đổi thành **${type}**.`,
      ephemeral: true,
    });
  }

  if (sub === "threshold") {
    const value = interaction.options.getInteger("value", true);
    if (value < 10 || value > 100) {
      return interaction.reply({ content: "Ngưỡng phải từ 10 đến 100.", ephemeral: true });
    }
    await store.client.mutation("bot_writes:botUpdateSettings", {
      guildId: guild.id,
      altMaxRiskScore: value,
    });
    store.invalidate(guild.id);
    return interaction.reply({
      content: `✅ Ngưỡng rủi ro đã đổi thành **${value}/100**.`,
      ephemeral: true,
    });
  }

  if (sub === "vpn") {
    const mode = interaction.options.getString("mode", true);
    if (!["strict", "warn", "off"].includes(mode)) {
      return interaction.reply({
        content: "Chế độ VPN phải là: strict, warn, hoặc off.",
        ephemeral: true,
      });
    }
    await store.client.mutation("bot_writes:botUpdateSettings", {
      guildId: guild.id,
      altVpnMode: mode,
      vpnBlockEnabled: mode === "strict",
    });
    store.invalidate(guild.id);
    return interaction.reply({
      content: `✅ Chế độ VPN đã đổi thành **${mode === "strict" ? "nghiêm ngặt" : mode === "warn" ? "cảnh báo" : "tắt"}**.`,
      ephemeral: true,
    });
  }
  return;
}

module.exports = { verify, setup, alt };
