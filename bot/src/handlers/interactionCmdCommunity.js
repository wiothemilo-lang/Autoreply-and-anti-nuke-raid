// Nhóm lệnh slash "cộng đồng" — tách từ handlers/interactionCreate.js (đợt #5
// tách monolith — 03/10/2026). Chỉ CHUYỂN CHỖ code, không đổi hành vi.
//
// Gồm: /giveaway · /reactionrole (kèm helper `parsePairs`). Mỗi hàm lệnh dưới
// đây CHÍNH LÀ thân `case "..."` cũ, chỉ đổi vỏ thành hàm nhận tham số —
// interactionCreate.js gọi theo tên lệnh.

const { EmbedBuilder, Colors } = require("discord.js");
const { canManageGuild } = require("../util");
const { emojiKeyOf } = require("./hidden");
const { parseDuration, canMod } = require("./modTools");
const { needPerm } = require("./interactionCommon");

/** Phân tích chuỗi "emoji:role emoji:role" (role là ID hoặc <@&id> hoặc tên role). */
function parsePairs(pairsRaw, guild) {
  if (!pairsRaw) return [];
  const entries = [];
  const tokens = String(pairsRaw).split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const idx = token.lastIndexOf(":");
    if (idx <= 0 || idx === token.length - 1) continue;
    const emoji = token.slice(0, idx).trim();
    let roleId = token
      .slice(idx + 1)
      .trim()
      .replace(/^<@&(\d+)>$/, "$1");
    if (!emoji) continue;
    if (!/^\d{15,20}$/.test(roleId)) {
      const role = guild?.roles.cache.find((r) => r.name.toLowerCase() === roleId.toLowerCase());
      if (role) roleId = role.id;
    }
    if (!/^\d{15,20}$/.test(roleId)) continue;
    entries.push({ emoji, roleId });
  }
  return entries.slice(0, 20);
}

/** `/giveaway` — tạo/danh sách/kết thúc giveaway. */
async function giveaway(store, interaction, guild) {
  const sub = interaction.options.getSubcommand();
  const config = await store.getConfig(guild.id);

  if (sub === "list") {
    const giveaways = config?.giveaways || [];
    if (giveaways.length === 0) {
      return interaction.reply({ content: "Chưa có giveaway nào.", ephemeral: true });
    }
    const lines = giveaways
      .slice(0, 20)
      .map(
        (g) =>
          `${g.status === "active" ? "🎉" : "🏁"} **${g.title}** — ${g.entries?.length || 0} lượt tham gia`,
      );
    const embed = new EmbedBuilder()
      .setColor(Colors.Aqua)
      .setTitle(`🎉 Giveaway (${giveaways.length})`)
      .setDescription(lines.join("\n").slice(0, 4000));
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (!canMod(interaction, config)) return needPerm(interaction);

  if (sub === "start") {
    const title = interaction.options.getString("title", true);
    const prize = interaction.options.getString("prize", true);
    const minutes = parseDuration(interaction.options.getString("duration", true));
    const winnerCount = Math.max(1, Math.min(20, interaction.options.getInteger("winners") ?? 1));
    const prizeRole = interaction.options.getRole("prize_role");
    if (!minutes) {
      return interaction.reply({
        content: "Thời lượng không hợp lệ (ví dụ: `30m`, `2h`, `1d`).",
        ephemeral: true,
      });
    }
    try {
      await store.client.mutation("hidden:botCreateGiveaway", {
        guildId: guild.id,
        channelId: interaction.channel.id,
        title: title.slice(0, 100),
        prize: prize.slice(0, 2000),
        winnerCount,
        durationMinutes: minutes,
        dmWinners: true,
        prizeRoleId: prizeRole ? prizeRole.id : undefined,
      });
      store.invalidate(guild.id);
      return interaction.reply({
        content: `🎉 Đã tạo giveaway "${title}" tại ${interaction.channel} — bot gửi embed trong ~1 phút!`,
        ephemeral: true,
      });
    } catch (e) {
      return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
    }
  }

  if (sub === "end") {
    const title = interaction.options.getString("title", true);
    const res = await store.client.mutation("hidden:botGiveawayEndNow", {
      guildId: guild.id,
      title,
    });
    store.invalidate(guild.id);
    return interaction.reply({
      content: res.ok
        ? `✅ Đã kết thúc giveaway "${title}" — bot chốt người thắng trong ~1 phút.`
        : `Không tìm thấy giveaway đang chạy tên "${title}".`,
      ephemeral: true,
    });
  }
  return;
}

/** `/reactionrole` — bảng reaction role: create/add/remove/edit/delete/list. */
async function reactionrole(store, interaction, guild) {
  const sub = interaction.options.getSubcommand();
  const hidden = await store.client
    .query("hidden:getBotHidden", { guildId: guild.id })
    .catch(() => null);
  const panels = hidden?.panels || [];
  const findPanel = (name) =>
    panels.find(
      (p) =>
        p.label.toLowerCase() ===
        String(name || "")
          .trim()
          .toLowerCase(),
    );

  if (sub === "list") {
    if (panels.length === 0) {
      return interaction.reply({
        content: "Chưa có bảng reaction role nào — dùng `/reactionrole create` hoặc dashboard.",
        ephemeral: true,
      });
    }
    const lines = panels.map((p) => {
      const ch = guild.channels.cache.get(p.channelId);
      return `• **${p.label}** — ${ch ? `#${ch.name}` : "kênh đã xóa"} — ${p.entries.length} cặp — ${p.enabled ? "✅" : "⏸️"}`;
    });
    const embed = new EmbedBuilder()
      .setColor(Colors.Aqua)
      .setTitle(`🎭 Reaction role (${panels.length})`)
      .setDescription(lines.join("\n").slice(0, 4000));
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (!canManageGuild(interaction.member)) return needPerm(interaction);

  if (sub === "create") {
    const channel = interaction.options.getChannel("channel", true);
    const label = interaction.options.getString("label", true);
    const description = interaction.options.getString("description") || undefined;
    const thumbnail = interaction.options.getString("thumbnail") || undefined;
    const entries = parsePairs(interaction.options.getString("pairs", true), guild);
    if (!channel.isTextBased()) {
      return interaction.reply({ content: "Kênh phải là kênh văn bản.", ephemeral: true });
    }
    if (entries.length === 0) {
      return interaction.reply({
        content: "Cần ít nhất 1 cặp emoji:role hợp lệ, VD: `✅:123456789 ⭐:987654321`.",
        ephemeral: true,
      });
    }
    try {
      await store.client.mutation("hidden:botCreatePanel", {
        guildId: guild.id,
        channelId: channel.id,
        label,
        description,
        thumbnailUrl: thumbnail,
        entries,
      });
      store.invalidate(guild.id);
      return interaction.reply({
        content: `✅ Đã tạo bảng "${label}" tại ${channel} — bot gửi tin nhắn trong ~1 phút.`,
        ephemeral: true,
      });
    } catch (e) {
      return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
    }
  }

  if (sub === "add") {
    const label = interaction.options.getString("label", true);
    const emoji = interaction.options.getString("emoji", true);
    const role = interaction.options.getRole("role", true);
    const panel = findPanel(label);
    if (!panel) {
      return interaction.reply({
        content: `Không tìm thấy bảng "${label}" — dùng \`/reactionrole list\`.`,
        ephemeral: true,
      });
    }
    if (panel.entries.some((e) => emojiKeyOf(e.emoji) === emojiKeyOf(emoji))) {
      return interaction.reply({ content: "Emoji này đã có trong bảng.", ephemeral: true });
    }

    try {
      await store.client.mutation("hidden:botUpdatePanel", {
        guildId: guild.id,
        panelId: panel._id,
        entries: [...panel.entries, { emoji, roleId: role.id }],
      });
      store.invalidate(guild.id);
      return interaction.reply({
        content: `✅ Đã thêm ${emoji} → ${role} vào bảng "${panel.label}" — bot gửi bảng mới trong ~1 phút.`,
        ephemeral: true,
      });
    } catch (e) {
      return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
    }
  }

  if (sub === "remove") {
    const label = interaction.options.getString("label", true);
    const emoji = interaction.options.getString("emoji", true);
    const panel = findPanel(label);
    if (!panel) {
      return interaction.reply({
        content: `Không tìm thấy bảng "${label}" — dùng \`/reactionrole list\`.`,
        ephemeral: true,
      });
    }
    const next = panel.entries.filter((e) => emojiKeyOf(e.emoji) !== emojiKeyOf(emoji));
    if (next.length === panel.entries.length) {
      return interaction.reply({
        content: "Không tìm thấy emoji này trong bảng.",
        ephemeral: true,
      });
    }
    try {
      await store.client.mutation("hidden:botUpdatePanel", {
        guildId: guild.id,
        panelId: panel._id,
        entries: next,
      });
      store.invalidate(guild.id);
      return interaction.reply({
        content: `✅ Đã gỡ ${emoji} khỏi bảng "${panel.label}" — bot gửi bảng mới trong ~1 phút.`,
        ephemeral: true,
      });
    } catch (e) {
      return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
    }
  }

  if (sub === "edit") {
    const label = interaction.options.getString("label", true);
    const panel = findPanel(label);
    if (!panel) {
      return interaction.reply({
        content: `Không tìm thấy bảng "${label}" — dùng \`/reactionrole list\`.`,
        ephemeral: true,
      });
    }
    const patch = { guildId: guild.id, panelId: panel._id };
    const newLabel = interaction.options.getString("new_label");
    if (newLabel) patch.label = newLabel;
    const description = interaction.options.getString("description");
    if (description !== null) patch.description = description === "-" ? null : description;
    const thumbnail = interaction.options.getString("thumbnail");
    if (thumbnail !== null) patch.thumbnailUrl = thumbnail === "-" ? null : thumbnail;
    if (!("label" in patch) && !("description" in patch) && !("thumbnailUrl" in patch)) {
      return interaction.reply({
        content: "Cần cung cấp ít nhất một trường: new_label / description / thumbnail.",
        ephemeral: true,
      });
    }
    try {
      await store.client.mutation("hidden:botUpdatePanel", patch);
      store.invalidate(guild.id);
      return interaction.reply({
        content: `✅ Đã cập nhật bảng "${panel.label}" — bot gửi bảng mới trong ~1 phút.`,
        ephemeral: true,
      });
    } catch (e) {
      return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
    }
  }

  if (sub === "delete") {
    const label = interaction.options.getString("label", true);
    const panel = findPanel(label);
    if (!panel) {
      return interaction.reply({
        content: `Không tìm thấy bảng "${label}" — dùng \`/reactionrole list\`.`,
        ephemeral: true,
      });
    }
    try {
      await store.client.mutation("hidden:botDeletePanel", {
        guildId: guild.id,
        panelId: panel._id,
      });
      store.invalidate(guild.id);
      return interaction.reply({
        content: `✅ Đã xóa bảng "${panel.label}" (tin nhắn cũ trong Discord vẫn còn).`,
        ephemeral: true,
      });
    } catch (e) {
      return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
    }
  }
  return;
}

module.exports = { giveaway, reactionrole };
