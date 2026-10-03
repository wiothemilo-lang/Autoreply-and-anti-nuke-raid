// Nhóm lệnh slash "chung" của bot — tách từ handlers/interactionCreate.js (đợt
// #5 tách monolith — 03/10/2026). Chỉ CHUYỂN CHỖ code, không đổi hành vi.
//
// Gồm: /report · /research · /ticket · /ping · /language · /health · /help ·
// /prefix · /autoreply · /badword · /heat.
//
// Mỗi hàm dưới đây CHÍNH LÀ thân `case "..."` cũ, chỉ đổi vỏ thành hàm nhận
// tham số — interactionCreate.js gọi theo tên lệnh. Comment giữ nguyên.

const { EmbedBuilder, Colors } = require("discord.js");
const { canManageGuild, canManageWithConfig } = require("../util");
const { needPerm } = require("./interactionCommon");
const { reportInteractive } = require("./incidentReport");
const researchHandlers = require("./researchCommands");
const { ticketCommand } = require("./interactionTicketFlow");
const lang = require("./lang");

/** `/report` — AI đọc tin nhắn gần đây + dữ liệu phạt 24h, công bố cho server. */
async function report(client, store, interaction) {
  // Báo cáo tình hình: AI quét hàng trăm tin nhắn + dữ liệu phạt 24h, công
  // bố kết quả cho server (mọi thành viên đều được dùng).
  return reportInteractive(client, store, interaction);
}

/** `/research` — tra cứu/học tập (learn cần mod/admin). */
async function research(client, store, interaction) {
  return researchHandlers.handleResearch(client, store, interaction);
}

/** `/ticket` — điểm vào B: thành viên trong server mở ticket. */
async function ticket(client, store, interaction, guild) {
  // Điểm vào B: thành viên đang ở trong server mở ticket (hỏi đáp / báo cáo
  // chung, hoặc khiếu nại nếu chọn loại appeal).
  return ticketCommand(client, store, interaction, guild);
}

/** `/ping` — độ trễ WebSocket. */
async function ping(client, interaction) {
  const ws = Math.round(client.ws.ping);
  return interaction.reply({ content: `🏓 Pong! **${ws}ms** (WebSocket)`, ephemeral: true });
}

// `/language` — miễn qua chặn guild ở trên nên chạy được cả trong DM.
/** `/language` — đổi ngôn ngữ trả lời của bot cho người dùng. */
async function language(store, interaction) {
  return lang.languageCommand(store, interaction);
}

/** `/health` — sức khỏe AI (mod/admin): trạng thái provider, cache, misfire. */
async function health(client, store, interaction, guild) {
  // Sức khỏe AI (mod/admin): bức tranh trạng thái hệ AI chống raid — không
  // lộ key. aiStats() là hàm thuần đọc (0 token, 0 I/O) nên lệnh luôn trả
  // lời nhanh, kể cả khi mọi provider đang sập.
  if (!canManageWithConfig(interaction.member, await store.getConfig(guild.id)))
    return needPerm(interaction);
  const ai = require("../ai");
  const ws = Math.round(client.ws.ping);
  const stats = typeof ai.aiStats === "function" ? ai.aiStats() : null;
  const embed = new EmbedBuilder()
    .setColor(Colors.Aqua)
    .setTitle("🩺 Sức khỏe Protogon")
    .setDescription(`WebSocket: **${ws}ms**`);
  if (!stats) {
    embed.addFields({ name: "AI", value: "không có dữ liệu (bản bot cũ)", inline: false });
  } else if (!stats.available) {
    embed.addFields({
      name: "AI",
      value:
        "⚠️ Chưa cấu hình key nào — bot chạy theo điểm nghi vấn deterministic (an toàn, không AI)",
      inline: false,
    });
  } else {
    const providerLines = stats.providers.map((p) => {
      const cooldown = p.inCooldown ? " ⚠️ đang cooldown (fail liên tiếp)" : " ✅";
      return `• ${p.label} (${p.model})${cooldown}`;
    });
    embed.addFields(
      { name: "Providers", value: providerLines.join("\n").slice(0, 1024), inline: false },
      {
        name: "Hoạt động",
        value: `Cache verdict: **${stats.verdictCacheSize}** mục · Gọi/phút: **${stats.callsLastMinute}** · Đang chạy: **${stats.inFlight}**`,
        inline: false,
      },
    );
    if (stats.verdictsLastHour) {
      const v = stats.verdictsLastHour;
      embed.addFields({
        name: "Verdict 1 giờ qua",
        value: `Raid: **${v.raid ?? 0}** · Cá nhân: **${v.individual ?? 0}** · Benign: **${v.benign ?? 0}** · Lỗi/offline: **${v.offline ?? 0}** · Từ cache: **${v.cache ?? 0}**`,
        inline: false,
      });
    }
    if (stats.misfire) {
      const m = stats.misfire;
      const misfireLine = `Phạt nhầm 7 ngày (mod gỡ): **${m.misfires7d}**${m.misfires7d >= 5 ? " ⚠️ AI đang tự siết độ tin cậy" : ""}`;
      embed.addFields({ name: "Phạt nhầm đã xác nhận", value: misfireLine, inline: false });
    }
  }
  return interaction.reply({ embeds: [embed], ephemeral: true });
}

/** `/help` — bảng cú pháp mọi nhóm lệnh. */
async function help(interaction) {
  const embed = new EmbedBuilder()
    .setColor(Colors.Aqua)
    .setTitle("🧭 Lệnh của Protogon")
    .setDescription(
      [
        "**Auto Reply** — `/autoreply add` tạo rule từ khóa hoặc @mention, `/autoreply list`, `/autoreply remove`",
        "**Chống nuke** — `/antinuke status`, `/antinuke on|off`, `/antinuke module`, `/antinuke unlock`, `/antinuke lockdown`",
        "**Lọc nội dung** — module `badword`, `invite`, `attachment`, `mention` (bật tắt trong `/antinuke module`) · `/badword add|remove|list` · `/heat status`",
        "**Khoá kênh** — `/lock add #kênh [role] [30m|2h|1d]`, `/lock all [role] [thời lượng]`, `/lock remove #kênh`, `/lock unlock-all`, `/lock list` (bỏ trống thời lượng = khoá vô hạn, tự mở tay; có thời lượng thì tự mở)",
        "**Mod tools** — `/mod timeout @user 10m [lý do]`, `/mod untimeout`, `/mod kick`, `/mod ban`, `/mod unban`, `/mod unwarn`, `/mod purge` (ghi log lý do + người thực hiện)",
        "**Giveaway** — `/giveaway start <tên> <giải thưởng> <thời lượng>`, `/giveaway list`, `/giveaway end`",
        "**Reaction Role** — `/reactionrole create <kênh> <tên> <cặp emoji:role>`, `/reactionrole add`, `/reactionrole edit`, `/reactionrole remove`, `/reactionrole delete`",
        "**Backup server** — `/backup now` (tạo + đẩy GitHub chủ bot), `/backup list`, `/backup restore <số>`, `/backup auto <2-30>` (tự động định kỳ) — phòng khi server bị nuke phá sập",
        "**Báo cáo AI** — `/report [ghi chú]`: AI đọc hàng trăm tin nhắn gần đây + dữ liệu phạt 24h → báo cáo raid/nuke hoặc bot phạt nhầm, công bố cho server",
        "**Học tập** — `/research status` (tiến độ), `/research learn` (học ngay — mod/admin), `/research history` (10 lượt gần nhất)",
        "**Xác minh** — `/verify setup` (kênh + role), `/verify toggle`",
        "**Cấu hình** — `/setup log-channel`, `/setup mod-role`, `/setup admin-role`, `/prefix set`",
        "**Khác** — `/ping`, `/health` (sức khỏe AI — mod/admin)",
      ].join("\n"),
    );
  return interaction.reply({ embeds: [embed], ephemeral: true });
}

/** `/prefix` — xem/đổi prefix lệnh text. */
async function prefix(store, interaction, guild) {
  const set = interaction.options.getString("set");
  const config = await store.getConfig(guild.id);
  const current = config?.prefix || "!";
  if (!set) {
    return interaction.reply({ content: `Prefix hiện tại: \`${current}\``, ephemeral: true });
  }
  if (!canManageGuild(interaction.member)) return needPerm(interaction);
  if (!/^[!^$#&%]{1,3}$/.test(set)) {
    return interaction.reply({
      content: "Prefix phải là 1-3 ký tự đặc biệt (ví dụ: `!`, `^`).",
      ephemeral: true,
    });
  }
  await store.client.mutation("bot_writes:botUpdateSettings", {
    guildId: guild.id,
    prefix: set,
  });
  store.invalidate(guild.id);
  return interaction.reply({
    content: `✅ Đã đổi prefix thành \`${set}\`. Lệnh text: \`${set}help\``,
    ephemeral: true,
  });
}

/** `/autoreply` — rule trả lời tự động theo từ khóa/@mention. */
async function autoreply(store, interaction, guild) {
  const sub = interaction.options.getSubcommand();
  const config = await store.getConfig(guild.id);

  if (sub === "list") {
    const rules = config?.autoReplies || [];
    if (rules.length === 0) {
      return interaction.reply({ content: "Chưa có rule auto reply nào.", ephemeral: true });
    }
    const lines = rules.map(
      (r) =>
        `• **${r.name}** — ${r.triggerType === "mention" ? "@mention" : r.keywords.join(", ")} — ${r.enabled ? "✅" : "⏸️"}`,
    );
    const embed = new EmbedBuilder()
      .setColor(Colors.Aqua)
      .setTitle(`📋 Auto reply (${rules.length})`)
      .setDescription(lines.join("\n").slice(0, 4000));
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // Mod/Admin (Manage Guild) hoặc role Mod/Admin được cấu hình qua /setup.
  if (!canManageWithConfig(interaction.member, config)) return needPerm(interaction);

  if (sub === "add") {
    const name = interaction.options.getString("name", true);
    const trigger = interaction.options.getString("trigger", true);
    const response = interaction.options.getString("response", true);
    const keywordsRaw = interaction.options.getString("keywords") ?? "";
    const cooldown = interaction.options.getInteger("cooldown") ?? 30;
    const payload = {
      guildId: guild.id,
      name,
      triggerType: trigger === "mention" ? "mention" : "keyword",
      keywords: keywordsRaw
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
      response,
      channels: [],
      cooldownSeconds: Math.max(0, cooldown),
      enabled: true,
    };
    if (payload.triggerType === "keyword" && payload.keywords.length === 0) {
      return interaction.reply({
        content: "Với loại `keyword` bạn cần nhập từ khóa (phân cách bằng dấu phẩy).",
        ephemeral: true,
      });
    }
    try {
      await store.client.mutation("bot_writes:botAutoReplyUpsert", payload);
    } catch (err) {
      return interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
    }
    store.invalidate(guild.id);
    return interaction.reply({
      content: `✅ Đã lưu rule \`${name}\` (thêm mới hoặc cập nhật) — bot trả lời: "${response.slice(0, 80)}${response.length > 80 ? "…" : ""}"`,
      ephemeral: true,
    });
  }

  if (sub === "remove") {
    const name = interaction.options.getString("name", true);
    await store.client.mutation("bot_writes:botAutoReplyRemove", {
      guildId: guild.id,
      name,
    });
    store.invalidate(guild.id);
    return interaction.reply({
      content: `✅ Đã xóa rule \`${name}\`.`,
      ephemeral: true,
    });
  }

  if (sub === "edit") {
    const name = interaction.options.getString("name", true);
    const response = interaction.options.getString("response");
    const cooldown = interaction.options.getInteger("cooldown");
    const rule = (config?.autoReplies || []).find((r) => r.name === name);
    if (!rule) {
      return interaction.reply({
        content: `Không tìm thấy rule \`${name}\`. Dùng \`/autoreply list\` để xem danh sách.`,
        ephemeral: true,
      });
    }
    await store.client.mutation("bot_writes:botAutoReplyUpsert", {
      guildId: guild.id,
      name,
      triggerType: rule.triggerType,
      keywords: rule.keywords,
      response: response ?? rule.response,
      channels: rule.channels || [],
      cooldownSeconds: cooldown !== null ? Math.max(0, cooldown) : rule.cooldownSeconds,
      enabled: rule.enabled,
    });
    store.invalidate(guild.id);
    return interaction.reply({
      content: `✅ Đã cập nhật rule \`${name}\`.`,
      ephemeral: true,
    });
  }
  return;
}

/** `/badword` — danh sách từ ngữ xấu của server. */
async function badword(store, interaction, guild) {
  const sub = interaction.options.getSubcommand();
  const config = await store.getConfig(guild.id);
  const words = [...(config?.badWords || [])];

  if (sub === "list") {
    if (words.length === 0) {
      return interaction.reply({
        content: "Danh sách từ ngữ xấu đang trống — dùng `/badword add` hoặc dashboard để thêm.",
        ephemeral: true,
      });
    }
    const embed = new EmbedBuilder()
      .setColor(Colors.Aqua)
      .setTitle(`📋 Danh sách từ ngữ xấu (${words.length})`)
      .setDescription(
        words
          .map((w) => `\`${w}\``)
          .join(", ")
          .slice(0, 4000),
      );
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (!canManageGuild(interaction.member)) return needPerm(interaction);

  if (sub === "add") {
    const word = interaction.options.getString("word", true).trim().toLowerCase();
    if (!word)
      return interaction.reply({ content: "Từ ngữ không được để trống.", ephemeral: true });
    if (word.length > 40) {
      return interaction.reply({ content: "Từ ngữ tối đa 40 ký tự.", ephemeral: true });
    }
    if (words.includes(word)) {
      return interaction.reply({
        content: `\`${word}\` đã có trong danh sách.`,
        ephemeral: true,
      });
    }
    if (words.length >= 100) {
      return interaction.reply({ content: "Danh sách đã đạt tối đa 100 từ.", ephemeral: true });
    }
    words.push(word);
    await store.client.mutation("bot_writes:botUpdateSettings", {
      guildId: guild.id,
      badWords: words,
    });
    store.invalidate(guild.id);
    return interaction.reply({
      content: `✅ Đã thêm \`${word}\` vào danh sách từ ngữ xấu (${words.length} từ).`,
      ephemeral: true,
    });
  }

  if (sub === "remove") {
    const word = interaction.options.getString("word", true).trim().toLowerCase();
    const next = words.filter((w) => w !== word);
    if (next.length === words.length) {
      return interaction.reply({
        content: `Không tìm thấy \`${word}\` trong danh sách.`,
        ephemeral: true,
      });
    }
    await store.client.mutation("bot_writes:botUpdateSettings", {
      guildId: guild.id,
      badWords: next,
    });
    store.invalidate(guild.id);
    return interaction.reply({
      content: `✅ Đã xóa \`${word}\` khỏi danh sách từ ngữ xấu.`,
      ephemeral: true,
    });
  }
  return;
}

/** `/heat` — nhiệt độ vi phạm + top thành viên nóng nhất. */
async function heat(store, interaction, guild) {
  const config = await store.getConfig(guild.id);
  const s = {
    enabled: config?.heatEnabled !== false,
    decayPerMin: config?.heatDecayPerMin ?? 3,
    warnAt: config?.heatWarnAt ?? 25,
    timeoutAt: config?.heatTimeoutAt ?? 40,
    kickAt: config?.heatKickAt ?? 70,
    banAt: config?.heatBanAt ?? 90,
    repeatMultiplier: config?.heatRepeatMultiplier ?? 2,
    repeatWindowMin: config?.heatRepeatWindowMin ?? 30,
    warnStrikeLimit: config?.warnStrikeLimit ?? 3,
    warnStrikeWindowMin: config?.warnStrikeWindowMin ?? 60,
    warnStrikePunish: config?.warnStrikePunish ?? "timeout",
  };
  const top = config?.heatStates || [];
  const safety = config?.safetyPercent ?? 100;
  const tier = (heat) =>
    heat >= s.banAt
      ? "🚫 Ban"
      : heat >= s.kickAt
        ? "👢 Kick"
        : heat >= s.timeoutAt
          ? "⏸️ Tạm khóa"
          : "⚠️ Theo dõi";
  const embed = new EmbedBuilder()
    .setColor(safety >= 70 ? Colors.Green : safety >= 40 ? Colors.Yellow : Colors.Red)
    .setTitle(`🌡️ Nhiệt độ vi phạm: ${safety}% an toàn`)
    .setDescription(
      [
        s.enabled
          ? `Hệ thống nhiệt **đang bật** — giảm ${s.decayPerMin} điểm/phút, tái phạm tăng **x${s.repeatMultiplier}** trong ${s.repeatWindowMin} phút.`
          : `Hệ thống nhiệt **đang tắt**.`,
        `Ngưỡng: cảnh báo **${s.warnAt}** · tạm khóa **${s.timeoutAt}** · kick **${s.kickAt}** · ban **${s.banAt}** (tối đa 100).`,
        s.warnStrikeLimit
          ? `Warn tích lũy: **${s.warnStrikeLimit}** lần trong ${s.warnStrikeWindowMin} phút → **${s.warnStrikePunish}**.`
          : `Warn tích lũy: **đang tắt**.`,
      ].join("\n"),
    );
  if (top.length > 0) {
    embed.addFields({
      name: "Thành viên nóng nhất",
      value: top
        .slice(0, 10)
        .map((h) => `<@${h.userId}> — **${h.heat}/100** — ${tier(h.heat)}`)
        .join("\n")
        .slice(0, 1024),
    });
  } else {
    embed.addFields({
      name: "Thành viên nóng nhất",
      value: "Chưa có vi phạm nào — server rất an toàn 🎉",
    });
  }
  return interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = {
  report,
  research,
  ticket,
  ping,
  language,
  health,
  help,
  prefix,
  autoreply,
  badword,
  heat,
};
