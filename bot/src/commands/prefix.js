const {
  EmbedBuilder,
  Colors,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { canManageGuild, isAdmin, canManageWithConfig } = require("../util");
const {
  parseDuration,
  canMod,
  needPerm,
  timeoutMember,
  kickMember,
  banMember,
  purgeChannel,
  untimeoutMember,
  unbanMember,
  unwarnMember,
} = require("../handlers/modTools");

const { isLocked, markLocked, unlockGuild } = require("../lockdown");
const { emojiKeyOf } = require("../handlers/hidden");
const { reportInteractive } = require("../handlers/incidentReport");
const researchHandlers = require("../handlers/researchCommands");

const MODULES = [
  "massBan",
  "massKick",
  "massJoin",
  "massChannelCreate",
  "massChannelDelete",
  "massRoleCreate",
  "massRoleDelete",
  "massMessageDelete",
  "massWebhookCreate",
  "massThreadCreate",
  "massThreadDelete",
  "massChannelRename",
  "massChannelOverwrite",
  "massRoleEdit",
  "adminSelfGrant",
  "massRoleAssign",
  "massNickname",
  "massEmoji",
  "massBotAdd",
  "externalAppRaid",
  "massInviteCreate",
  "guildTamper",
  "spam",
  "massMessage",
  "blankNoise",
  "mention",
  "badword",
  "attachment",
  "invite",
  "malware",
];

function noPerm(message) {
  return message.reply("❌ Bạn cần quyền **Quản lý server** (Manage Guild) để dùng lệnh này.");
}

/** !research — tiến độ học tập của bot + học thủ công + lịch sử. */
async function handleResearch(client, message, args, config, store) {
  return researchHandlers.handleResearch(client, store, {
    guild: message.guild,
    channel: message.channel,
    member: message.member,
    author: message.author,
    user: message.author,
    args,
    reply: (payload) => message.reply(typeof payload === "string" ? payload : payload),
  });
}

/** !report — AI đọc chat + dữ liệu phạt, công bố báo cáo tình hình server. */
async function handleReport(client, message, args, config, store) {
  return reportInteractive(client, store, {
    guild: message.guild,
    channel: message.channel,
    author: message.author,
    user: message.author,
    reply: (payload) => message.reply(typeof payload === "string" ? payload : payload),
    options: {
      getString: (name) => (name === "note" || name === "ghichu" ? args.join(" ") || null : null),
    },
  });
}

async function handleHelp(client, message) {
  const embed = new EmbedBuilder()
    .setColor(Colors.Aqua)
    .setTitle("🧭 Danh sách lệnh")
    .setDescription(
      [
        "**Prefix** `!` (đổi bằng `!prefix set <kí tự>`)",
        "",
        "```",
        "!help                  - danh sách lệnh",
        "!ping                  - kiểm tra độ trễ",
        "!health                - sức khỏe AI (mod/admin): provider, cache, giới hạn gọi",
        "!prefix                - xem prefix",
        "!prefix set ^          - đổi prefix thành ^",
        "!autoreply list        - danh sách rule",
        "!autoreply add <tên> keyword <từ khóa> | <nội dung>",
        "!autoreply add <tên> mention | <nội dung>",
        "!autoreply remove <tên>",
        "!antinuke on|off       - bật/tắt chống nuke",
        "!antinuke status       - trạng thái",
        "!antinuke module <tên> on|off",
        "!antinuke unlock       - mở khóa kênh ngay",
        "!lockdown on|off       - khóa kênh tự động khi raid",
        "!heat                  - xem nhiệt độ & warn tích lũy",
        "!badword add <từ>      - thêm từ ngữ xấu",
        "!badword remove <từ>   - xóa từ ngữ xấu",
        "!badword list          - danh sách từ ngữ xấu",
        "!heat                  - xem mức nhiệt độ vi phạm",
        "!timeout @user 10m [lý do] - tạm khóa thành viên",
        "!untimeout @user       - gỡ timeout",
        "!kick @user [lý do]    - kick thành viên",
        "!ban @user [lý do]     - ban thành viên (--days 7 xóa tin nhắn)",
        "!unban @user            - gỡ ban",
        "!unwarn @user           - gỡ toàn bộ warn tích lũy",
        "!purge <số>            - xóa hàng loạt tin nhắn",
        "!report [ghi chú]      - AI quét chat + phạt → báo cáo tình hình server",
        "!research              - tiến độ học tập của bot (status|learn|history)",
        "!giveaway start <Tên> | <Giải thưởng> | <thời lượng>",
        "!giveaway list | end <tên>",
        "!reactionrole list      - danh sách bảng reaction role",
        "!reactionrole create #kênh | Tên | Mô tả | emoji:role ... | thumbnail",
        "!reactionrole add <Tên> <emoji> <@role>",
        "!reactionrole edit <Tên> | Mô tả mới | Thumbnail mới (dùng - để xóa)",
        "!reactionrole remove <Tên> <emoji>",
        "!reactionrole delete <Tên>",
        "!setlog #kênh          - đặt kênh log",
        "!backup now            - tạo backup server (đẩy lên GitHub chủ bot)",
        "!backup list           - danh sách backup của server",
        "!backup restore <số>   - khôi phục cấu trúc server từ backup",
        "!backup auto <2-30|off> - tự động backup mỗi N ngày",
        "!backup keep <2-50> [ngày] - giữ N bản gần nhất, xoá bản cũ hơn N ngày",
        "```",
      ].join("\n"),
    )
    .setFooter({
      text: "Slash command tương đương: /help /prefix /autoreply /antinuke /badword /heat /mod /giveaway /setup",
    });
  await message.reply({ embeds: [embed] });
}

async function handlePing(client, message) {
  const sent = await message.reply("🏓 Đang đo độ trễ…");
  const ws = Math.round(client.ws.ping);
  await sent.edit(`🏓 Pong! **${ws}ms** (WebSocket)`);
}

/** !health — sức khỏe AI (mod/admin): provider, cooldown, cache, giới hạn gọi.
 * Dùng aiStats() thuần đọc (0 token/0 I/O) — luôn trả lời nhanh. */
async function handleHealth(client, message, _args, config) {
  const ai = require("../ai");
  const ws = Math.round(client.ws.ping);
  const { canManageWithConfig } = require("../util");
  if (!canManageWithConfig(message.member, config)) {
    return message.reply("⚠️ Lệnh này dành cho mod/admin.");
  }
  const stats = typeof ai.aiStats === "function" ? ai.aiStats() : null;
  const { EmbedBuilder, Colors } = require("discord.js");
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
    embed.addFields(
      {
        name: "Providers",
        value: stats.providers
          .map((p) => `• ${p.label} (${p.model})${p.inCooldown ? " ⚠️ cooldown" : " ✅"}`)
          .join("\n")
          .slice(0, 1024),
        inline: false,
      },
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
      embed.addFields({
        name: "Phạt nhầm đã xác nhận",
        value: `Phạt nhầm 7 ngày (mod gỡ): **${m.misfires7d}**${m.misfires7d >= 5 ? " ⚠️ AI đang tự siết độ tin cậy" : ""}`,
        inline: false,
      });
    }
  }
  return message.reply({ embeds: [embed] });
}

async function handlePrefix(client, message, args, config, store) {
  const prefix = config.prefix || "!";
  if (args[0] !== "set" || args.length < 2) {
    return message.reply(`Prefix hiện tại: \`${prefix}\``);
  }
  if (!canManageGuild(message.member)) return noPerm(message);
  const next = args[1];
  if (!/^[!^$#&%]{1,3}$/.test(next)) {
    return message.reply("Prefix phải là 1-3 ký tự đặc biệt (ví dụ: `!`, `^`, `!!`).");
  }
  await store.client.mutation("bot_writes:botUpdateSettings", {
    guildId: message.guild.id,
    prefix: next,
  });
  store.invalidate(message.guild.id);
  await message.reply(`✅ Đã đổi prefix thành \`${next}\`. Lệnh: \`${next}help\``);
}

async function handleAutoReply(client, message, args, config, store) {
  const sub = args[0]?.toLowerCase();

  if (sub === "list") {
    const rules = config.autoReplies || [];
    if (rules.length === 0) return message.reply("Chưa có rule auto reply nào.");
    const lines = rules.map(
      (r, i) =>
        `${i + 1}. **${r.name}** — ${r.triggerType === "mention" ? "@mention" : `từ khóa: ${r.keywords.join(", ")}`} — ${r.enabled ? "✅" : "⏸️"}`,
    );
    const embed = new EmbedBuilder()
      .setColor(Colors.Aqua)
      .setTitle(`📋 Auto reply (${rules.length})`)
      .setDescription(lines.join("\n").slice(0, 4000));
    return message.reply({ embeds: [embed] });
  }

  // Cho phép quyền Manage Guild/Administrator hoặc role Mod/Admin đã cấu hình.
  if (!canManageWithConfig(message.member, config)) {
    return message.reply(
      "❌ Bạn cần quyền **Quản lý server** hoặc role **Mod/Admin** của server để dùng lệnh này.",
    );
  }

  if (sub === "remove") {
    const name = args[1];
    if (!name) return message.reply("Cú pháp: `!autoreply remove <tên>`");
    await store.client.mutation("bot_writes:botAutoReplyRemove", {
      guildId: message.guild.id,
      name,
    });
    store.invalidate(message.guild.id);
    return message.reply(`✅ Đã xóa rule \`${name}\``);
  }

  if (sub === "add") {
    // !autoreply add <name> keyword <kw1,kw2> | <response>
    // !autoreply add <name> mention | <response>
    const name = args[1];
    const trigger = args[2]?.toLowerCase();
    if (!name || !trigger) {
      return message.reply(
        "Cú pháp:\n`!autoreply add <tên> keyword <từ khóa, cách nhau phẩy> | <nội dung trả lời>`\n`!autoreply add <tên> mention | <nội dung trả lời>`",
      );
    }
    const pipeIndex = args.indexOf("|");
    if (pipeIndex === -1) return message.reply("Thiếu phần `| <nội dung trả lời>`");
    const response = args.slice(pipeIndex + 1).join(" ");
    if (!response.trim()) return message.reply("Nội dung trả lời không được để trống.");
    const payload = {
      guildId: message.guild.id,
      name,
      triggerType: trigger === "mention" ? "mention" : "keyword",
      keywords:
        trigger === "mention"
          ? []
          : args
              .slice(3, pipeIndex)
              .join(" ")
              .split(",")
              .map((k) => k.trim())
              .filter(Boolean),
      response,
      channels: [],
      cooldownSeconds: 30,
      enabled: true,
    };
    if (payload.triggerType === "keyword" && payload.keywords.length === 0) {
      return message.reply("Cần ít nhất một từ khóa.");
    }
    try {
      await store.client.mutation("bot_writes:botAutoReplyUpsert", payload);
    } catch (err) {
      return message.reply(`❌ ${err.message}`);
    }
    store.invalidate(message.guild.id);
    return message.reply(`✅ Đã lưu rule \`${name}\` (thêm mới hoặc cập nhật)`);
  }

  return message.reply("Cú pháp: `!autoreply add/list/remove`");
}

async function handleAntinuke(client, message, args, config, store) {
  const sub = args[0]?.toLowerCase();

  if (sub === "status" || !sub) {
    const modules = config.modules || [];
    const lines = modules.map(
      (m) =>
        `${m.enabled ? "✅" : "⏸️"} \`${m.module}\` — ngưỡng ${m.threshold} lần/${m.windowSeconds}s — ${m.punish}`,
    );
    const embed = new EmbedBuilder()
      .setColor(config.antinukeEnabled ? Colors.Green : Colors.Red)
      .setTitle(`🛡️ Chống nuke: ${config.antinukeEnabled ? "ĐANG BẬT" : "ĐÃ TẮT"}`)
      .setDescription(lines.join("\n") || "Chưa có module nào.");
    return message.reply({ embeds: [embed] });
  }

  if (!canManageGuild(message.member) && !isAdmin(message.member)) return noPerm(message);

  if (sub === "unlock") {
    if (!isLocked(message.guild.id)) {
      const cfg = await store.getConfig(message.guild.id);
      if (!cfg?.lockdownUntil || cfg.lockdownUntil <= Date.now()) {
        return message.reply("Server hiện không ở trạng thái khóa kênh.");
      }
      markLocked(message.guild.id);
    }
    const cfg = await store.getConfig(message.guild.id);
    await unlockGuild(client, message.guild, cfg, store);
    return message.reply("🔓 Đã mở khóa kênh.");
  }

  if (sub === "on" || sub === "off") {
    await store.client.mutation("bot_writes:botSetAntinuke", {
      guildId: message.guild.id,
      enabled: sub === "on",
    });
    store.invalidate(message.guild.id);
    return message.reply(`✅ Đã ${sub === "on" ? "bật" : "tắt"} chống nuke.`);
  }

  if (sub === "module") {
    const name = args[1];
    const value = args[2]?.toLowerCase();
    if (!MODULES.includes(name) || !["on", "off"].includes(value)) {
      return message.reply(`Cú pháp: \`!antinuke module <${MODULES.join("|")}> <on|off>\``);
    }
    await store.client.mutation("bot_writes:botModuleUpdate", {
      guildId: message.guild.id,
      module: name,
      enabled: value === "on",
    });
    store.invalidate(message.guild.id);
    return message.reply(`✅ Module \`${name}\` đã ${value === "on" ? "bật" : "tắt"}.`);
  }

  return message.reply("Cú pháp: `!antinuke on|off|status|module <tên> <on|off>|unlock`");
}

async function handleLockdown(client, message, args, config, store) {
  if (!canManageGuild(message.member)) return noPerm(message);
  const sub = args[0]?.toLowerCase();
  if (sub !== "on" && sub !== "off") {
    return message.reply("Cú pháp: `!lockdown on|off`");
  }
  await store.client.mutation("bot_writes:botUpdateLockdown", {
    guildId: message.guild.id,
    enabled: sub === "on",
  });
  store.invalidate(message.guild.id);
  return message.reply(
    sub === "on"
      ? "✅ Khóa kênh tự động khi raid đã bật."
      : "✅ Khóa kênh tự động khi raid đã tắt.",
  );
}

async function handleBadword(client, message, args, config, store) {
  if (!canManageGuild(message.member)) return noPerm(message);
  const sub = args[0]?.toLowerCase();
  const words = [...(config.badWords || [])];

  if (sub === "list" || !sub) {
    if (words.length === 0) {
      return message.reply(
        "Danh sách từ ngữ xấu đang trống — dùng `!badword add <từ>` hoặc dashboard.",
      );
    }
    const embed = new EmbedBuilder()
      .setColor(Colors.Aqua)
      .setTitle(`📋 Từ ngữ xấu (${words.length})`)
      .setDescription(
        words
          .map((w) => `\`${w}\``)
          .join(", ")
          .slice(0, 4000),
      );
    return message.reply({ embeds: [embed] });
  }

  if (sub === "add") {
    const word = args.slice(1).join(" ").trim().toLowerCase();
    if (!word) return message.reply("Cú pháp: `!badword add <từ cần chặn>`");
    if (word.length > 40) return message.reply("Từ ngữ tối đa 40 ký tự.");
    if (words.includes(word)) return message.reply(`\`${word}\` đã có trong danh sách.`);
    if (words.length >= 100) return message.reply("Danh sách đã đạt tối đa 100 từ.");
    words.push(word);
    await store.client.mutation("bot_writes:botUpdateSettings", {
      guildId: message.guild.id,
      badWords: words,
    });
    store.invalidate(message.guild.id);
    return message.reply(`✅ Đã thêm \`${word}\` (${words.length} từ).`);
  }

  if (sub === "remove") {
    const word = args.slice(1).join(" ").trim().toLowerCase();
    const next = words.filter((w) => w !== word);
    if (next.length === words.length) {
      return message.reply(`Không tìm thấy \`${word}\` trong danh sách.`);
    }
    await store.client.mutation("bot_writes:botUpdateSettings", {
      guildId: message.guild.id,
      badWords: next,
    });
    store.invalidate(message.guild.id);
    return message.reply(`✅ Đã xóa \`${word}\` khỏi danh sách.`);
  }

  return message.reply("Cú pháp: `!badword add|remove|list`");
}

async function handleHeat(client, message, args, config, _store) {
  const s = {
    enabled: config.heatEnabled !== false,
    decayPerMin: config.heatDecayPerMin ?? 3,
    warnAt: config.heatWarnAt ?? 25,
    timeoutAt: config.heatTimeoutAt ?? 40,
    kickAt: config.heatKickAt ?? 70,
    banAt: config.heatBanAt ?? 90,
    repeatMultiplier: config.heatRepeatMultiplier ?? 2,
    repeatWindowMin: config.heatRepeatWindowMin ?? 30,
    warnStrikeLimit: config.warnStrikeLimit ?? 3,
    warnStrikeWindowMin: config.warnStrikeWindowMin ?? 60,
    warnStrikePunish: config.warnStrikePunish ?? "timeout",
  };
  const top = config.heatStates || [];
  const safety = config.safetyPercent ?? 100;
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
  return message.reply({ embeds: [embed] });
}

async function handleSetlog(client, message, args, config, store) {
  if (!canManageGuild(message.member)) return noPerm(message);
  const channel = message.mentions.channels.first();
  if (!channel) return message.reply("Hãy tag kênh log, ví dụ: `!setlog #logs`");
  await store.client.mutation("bot_writes:botUpdateSettings", {
    guildId: message.guild.id,
    logChannelId: channel.id,
  });
  store.invalidate(message.guild.id);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Mở kênh log")
      .setURL(`https://discord.com/channels/${message.guild.id}/${channel.id}`),
  );
  await message.reply({
    content: `✅ Kênh log đã đặt là ${channel}. Cảnh báo chống nuke sẽ được gửi tại đây.`,
    components: [row],
  });
}

async function handleTimeout(client, message, args, config, store) {
  if (!canMod(message, config)) return needPerm(message.channel);
  const member = message.mentions.members.first();
  const minutes = parseDuration(args[1]);
  if (!member) return message.reply("Tag thành viên cần timeout: `!timeout @user 10m [lý do]`");
  if (!minutes) {
    return message.reply(
      "Thời lượng không hợp lệ (ví dụ: `10m`, `2h`, `1d`, hoặc số phút). Tối đa 7 ngày.",
    );
  }
  const reason = args.slice(2).join(" ").trim() || undefined;
  try {
    const out = await timeoutMember({
      guild: message.guild,
      member,
      executor: message.author,
      minutes,
      reason,
      guildConfig: config,
      store,
    });
    return message.reply(`✅ ${out}`);
  } catch (e) {
    return message.reply(`❌ Không thể timeout: ${e.message}`);
  }
}

async function handlePurge(client, message, args, config, store) {
  if (!canMod(message, config)) return needPerm(message.channel);
  const count = parseInt(args[0], 10);
  if (!Number.isFinite(count) || count <= 0) {
    return message.reply("Cú pháp: `!purge <số tin nhắn tối đa 100>`");
  }
  try {
    const out = await purgeChannel(message.channel, count, message.author, config, store);
    const sent = await message.reply(`✅ ${out}`);
    setTimeout(() => sent.delete().catch(() => {}), 5000);
  } catch (e) {
    return message.reply(`❌ Không thể purge: ${e.message}`);
  }
}

async function handleKick(client, message, args, config, store) {
  if (!canMod(message, config)) return needPerm(message.channel);
  const member = message.mentions.members.first();
  if (!member) return message.reply("Tag thành viên cần kick: `!kick @user [lý do]`");
  const reason = args.slice(1).join(" ").trim() || undefined;
  try {
    const out = await kickMember({
      guild: message.guild,
      member,
      executor: message.author,
      reason,
      guildConfig: config,
      store,
    });
    return message.reply(`✅ ${out}`);
  } catch (e) {
    return message.reply(`❌ Không thể kick: ${e.message}`);
  }
}

async function handleBan(client, message, args, config, store) {
  if (!canMod(message, config)) return needPerm(message.channel);
  const member = message.mentions.members.first();
  if (!member) return message.reply("Tag thành viên cần ban: `!ban @user [lý do]`");
  const rest = args.slice(1).join(" ");
  const daysMatch = /--days (\d+)/.exec(rest);
  const deleteDays = daysMatch ? Math.max(0, Math.min(7, parseInt(daysMatch[1], 10))) : 0;
  const reason = rest.replace(/--days \d+/, "").trim() || undefined;
  try {
    const out = await banMember({
      guild: message.guild,
      member,
      executor: message.author,
      reason,
      deleteDays,
      guildConfig: config,
      store,
    });
    return message.reply(`✅ ${out}`);
  } catch (e) {
    return message.reply(`❌ Không thể ban: ${e.message}`);
  }
}

async function handleUntimeout(client, message, args, config, store) {
  if (!canMod(message, config)) return needPerm(message.channel);
  const member = message.mentions.members.first();
  if (!member) return message.reply("Tag thành viên cần gỡ timeout: `!untimeout @user [lý do]`");
  const reason = args.slice(1).join(" ").trim() || undefined;
  try {
    const out = await untimeoutMember({
      guild: message.guild,
      member,
      executor: message.author,
      reason,
      guildConfig: config,
      store,
    });
    return message.reply(`✅ ${out}`);
  } catch (e) {
    return message.reply(`❌ Không thể gỡ timeout: ${e.message}`);
  }
}

async function handleUnban(client, message, args, config, store) {
  if (!canMod(message, config)) return needPerm(message.channel);
  const user = message.mentions.users.first();
  if (!user) return message.reply("Tag thành viên cần gỡ ban: `!unban @user [lý do]`");
  const reason = args.slice(1).join(" ").trim() || undefined;
  try {
    const out = await unbanMember({
      guild: message.guild,
      userId: user.id,
      executor: message.author,
      reason,
      guildConfig: config,
      store,
    });
    return message.reply(`✅ ${out}`);
  } catch (e) {
    return message.reply(`❌ Không thể gỡ ban: ${e.message}`);
  }
}

async function handleUnwarn(client, message, args, config, store, heat) {
  if (!canMod(message, config)) return needPerm(message.channel);
  const user = message.mentions.users.first();
  if (!user) return message.reply("Tag thành viên cần gỡ warn: `!unwarn @user [lý do]`");
  const reason = args.slice(1).join(" ").trim() || undefined;
  try {
    const out = await unwarnMember({
      guild: message.guild,
      userId: user.id,
      heat,
      executor: message.author,
      reason,
      guildConfig: config,
      store,
    });
    return message.reply(`✅ ${out}`);
  } catch (e) {
    return message.reply(`❌ Không thể gỡ warn: ${e.message}`);
  }
}

async function handleGiveaway(client, message, args, config, store) {
  const sub = args[0]?.toLowerCase();

  if (sub === "list") {
    const giveaways = config.giveaways || [];
    if (giveaways.length === 0) {
      return message.reply(
        "Chưa có giveaway nào — tạo bằng `!giveaway start` hoặc trên dashboard.",
      );
    }
    const lines = giveaways
      .slice(0, 20)
      .map(
        (g) =>
          `${g.status === "active" ? "🎉" : g.status === "ended" ? "🏁" : "🚫"} **${g.title}** — ${g.entries?.length || 0} lượt tham gia — ${g.status}`,
      );
    const embed = new EmbedBuilder()
      .setColor(Colors.Aqua)
      .setTitle(`🎉 Giveaway (${giveaways.length})`)
      .setDescription(lines.join("\n").slice(0, 4000));
    return message.reply({ embeds: [embed] });
  }

  if (sub === "end") {
    if (!canMod(message, config)) return needPerm(message.channel);
    const name = args.slice(1).join(" ").trim();
    if (!name) return message.reply("Cú pháp: `!giveaway end <tên giveaway>`");
    const res = await store.client.mutation("hidden:botGiveawayEndNow", {
      guildId: message.guild.id,
      title: name,
    });
    store.invalidate(message.guild.id);
    return message.reply(
      res.ok
        ? `✅ Đã kết thúc giveaway "${name}" — bot sẽ chốt người thắng trong ~1 phút.`
        : `Không tìm thấy giveaway đang chạy tên "${name}".`,
    );
  }

  if (sub === "start") {
    if (!canMod(message, config)) return needPerm(message.channel);
    // !giveaway start <Tên> | <Giải thưởng> | <thời lượng> [số người thắng]
    const parts = args
      .slice(1)
      .join(" ")
      .split("|")
      .map((p) => p.trim());
    if (parts.length < 3) {
      return message.reply(
        "Cú pháp: `!giveaway start <Tên> | <Giải thưởng> | <thời lượng: 5p, 1h, 1d, 60> [số người thắng, mặc định 1]`",
      );
    }
    const title = parts[0];
    const prize = parts[1];
    const minutes = parseDuration(parts[2]);
    const winnerCount = parseInt(parts[3] || "1", 10) || 1;
    if (!minutes) return message.reply("Thời lượng không hợp lệ (ví dụ: `30m`, `2h`, `1d`).");
    try {
      await store.client.mutation("hidden:botCreateGiveaway", {
        guildId: message.guild.id,
        channelId: message.channel.id,
        title: title.slice(0, 100),
        prize: prize.slice(0, 2000),
        winnerCount: Math.max(1, Math.min(20, winnerCount)),
        durationMinutes: minutes,
        dmWinners: true,
      });
      store.invalidate(message.guild.id);
      return message.reply(
        `🎉 Đã tạo giveaway "${title}" ngay tại kênh này — bot gửi embed trong ~1 phút!`,
      );
    } catch (e) {
      return message.reply(`❌ ${e.message}`);
    }
  }

  return message.reply(
    "Cú pháp: `!giveaway start <Tên> | <Giải thưởng> | <thời lượng> [số người thắng]` · `!giveaway list` · `!giveaway end <tên>`",
  );
}

async function handleReactionRole(client, message, args, config, store) {
  const sub = args[0]?.toLowerCase();
  const hidden = await store.client
    .query("hidden:getBotHidden", { guildId: message.guild.id })
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

  if (sub === "list" || !sub) {
    if (panels.length === 0) {
      return message.reply(
        "Chưa có bảng reaction role nào — dùng `!reactionrole create` hoặc dashboard.",
      );
    }
    const lines = panels.map((p) => {
      const ch = message.guild.channels.cache.get(p.channelId);
      return `• **${p.label}** — ${ch ? `#${ch.name}` : "kênh đã xóa"} — ${p.entries.length} cặp — ${p.enabled ? "✅" : "⏸️"}`;
    });
    const embed = new EmbedBuilder()
      .setColor(Colors.Aqua)
      .setTitle(`🎭 Reaction role (${panels.length})`)
      .setDescription(lines.join("\n").slice(0, 4000));
    return message.reply({ embeds: [embed] });
  }

  if (!canManageGuild(message.member)) return noPerm(message);

  if (sub === "create") {
    // !reactionrole create #channel | Tên | Mô tả | emoji:role emoji:role | thumbnail
    const raw = args.slice(1).join(" ");
    const pipe = raw.indexOf("|");
    if (pipe === -1) return message.reply(REACTION_ROLE_HELP);
    const channelPart = raw.slice(0, pipe).trim();
    const channel =
      message.mentions.channels.first() || message.guild.channels.cache.get(channelPart) || null;
    if (!channel?.isTextBased()) {
      return message.reply("Cần tag kênh gửi bảng, VD: `!reactionrole create #channel | Tên | …`");
    }
    const parts = raw
      .slice(pipe + 1)
      .split("|")
      .map((s) => s.trim());
    const label = parts[0];
    const description = parts[1] || undefined;
    const pairsRaw = parts[2];
    const thumbnail = parts[3] || undefined;
    if (!label) return message.reply("Cần đặt tên cho bảng.");
    const entries = parseEmojiRolePairs(pairsRaw, message);
    if (entries.length === 0) {
      return message.reply(
        "Cần ít nhất 1 cặp emoji:role, VD: `!reactionrole create #channel | Tên | Mô tả | ✅:ROLEID ⭐:ROLEID`",
      );
    }
    try {
      await store.client.mutation("hidden:botCreatePanel", {
        guildId: message.guild.id,
        channelId: channel.id,
        label,
        description,
        thumbnailUrl: thumbnail || undefined,
        entries,
      });
      store.invalidate(message.guild.id);
      return message.reply(
        `✅ Đã tạo bảng "${label}" tại ${channel} — bot gửi tin nhắn trong ~1 phút.`,
      );
    } catch (e) {
      return message.reply(`❌ ${e.message}`);
    }
  }

  if (sub === "add") {
    const label = args[1];
    const emoji = args[2];
    const role =
      message.mentions.roles.first() || (args[3] ? message.guild.roles.cache.get(args[3]) : null);
    const panel = findPanel(label);
    if (!panel)
      return message.reply(`Không tìm thấy bảng "${label}" — dùng \`!reactionrole list\``);
    if (!emoji) return message.reply("Cú pháp: `!reactionrole add <Tên> <emoji> <@role>`");
    if (!role) return message.reply("Cần tag role cần gán, VD: `!reactionrole add Tên ✅ @role`");
    if (panel.entries.some((e) => emojiKeyOf(e.emoji) === emojiKeyOf(emoji))) {
      return message.reply("Emoji này đã có trong bảng.");
    }
    try {
      await store.client.mutation("hidden:botUpdatePanel", {
        guildId: message.guild.id,
        panelId: panel._id,
        entries: [...panel.entries, { emoji, roleId: role.id }],
      });
      store.invalidate(message.guild.id);
      return message.reply(
        `✅ Đã thêm ${emoji} → ${role} vào bảng "${panel.label}" — bot gửi bảng mới trong ~1 phút.`,
      );
    } catch (e) {
      return message.reply(`❌ ${e.message}`);
    }
  }

  if (sub === "remove") {
    const label = args[1];
    const emoji = args[2];
    const panel = findPanel(label);
    if (!panel)
      return message.reply(`Không tìm thấy bảng "${label}" — dùng \`!reactionrole list\``);
    if (!emoji) return message.reply("Cú pháp: `!reactionrole remove <Tên> <emoji>`");
    const next = panel.entries.filter((e) => emojiKeyOf(e.emoji) !== emojiKeyOf(emoji));
    if (next.length === panel.entries.length) {
      return message.reply("Không tìm thấy emoji này trong bảng.");
    }
    try {
      await store.client.mutation("hidden:botUpdatePanel", {
        guildId: message.guild.id,
        panelId: panel._id,
        entries: next,
      });
      store.invalidate(message.guild.id);
      return message.reply(
        `✅ Đã gỡ ${emoji} khỏi bảng "${panel.label}" — bot gửi bảng mới trong ~1 phút.`,
      );
    } catch (e) {
      return message.reply(`❌ ${e.message}`);
    }
  }

  if (sub === "edit") {
    // !reactionrole edit <Tên> | <Mô tả mới> | <Thumbnail mới>   (dùng "-" để xóa)
    const label = args[1];
    const panel = findPanel(label);
    if (!panel)
      return message.reply(`Không tìm thấy bảng "${label}" — dùng \`!reactionrole list\``);
    const parts = args
      .slice(2)
      .join(" ")
      .split("|")
      .map((s) => s.trim());
    const patch = { guildId: message.guild.id, panelId: panel._id };
    if (parts[0] !== undefined && parts[0] !== "" && parts[0] !== "-") patch.description = parts[0];
    else if (parts[0] === "-") patch.description = null;
    if (parts[1] !== undefined && parts[1] !== "" && parts[1] !== "-")
      patch.thumbnailUrl = parts[1];
    else if (parts[1] === "-") patch.thumbnailUrl = null;
    if (!("description" in patch) && !("thumbnailUrl" in patch)) {
      return message.reply(
        "Cú pháp: `!reactionrole edit <Tên> | <Mô tả mới> | <Thumbnail mới>` (dùng `-` để xóa trường)",
      );
    }
    try {
      await store.client.mutation("hidden:botUpdatePanel", patch);
      store.invalidate(message.guild.id);
      return message.reply(
        `✅ Đã cập nhật bảng "${panel.label}" — bot gửi bảng mới trong ~1 phút.`,
      );
    } catch (e) {
      return message.reply(`❌ ${e.message}`);
    }
  }

  if (sub === "delete") {
    const label = args.slice(1).join(" ").trim();
    const panel = findPanel(label);
    if (!panel)
      return message.reply(`Không tìm thấy bảng "${label}" — dùng \`!reactionrole list\``);
    try {
      await store.client.mutation("hidden:botDeletePanel", {
        guildId: message.guild.id,
        panelId: panel._id,
      });
      store.invalidate(message.guild.id);
      return message.reply(`✅ Đã xóa bảng "${panel.label}" (tin nhắn cũ trong Discord vẫn còn).`);
    } catch (e) {
      return message.reply(`❌ ${e.message}`);
    }
  }

  return message.reply(REACTION_ROLE_HELP);
}

/**
 * Số dòng backup tối đa in trong 1 embed chat. Danh sách có thể tới 50 bản
 * (quy tắc "Giữ bản" 2-50), nhưng embed chỉ chịu 4096 ký tự — in hết một lượt
 * là Discord từ chối CẢ embed, người dùng không thấy gì (kể cả các bản mới).
 * In 20 bản mới nhất, phần còn lại chỉ sang dashboard (nơi khôi phục được mọi bản).
 */
const BACKUP_LIST_MAX_LINES = 20;

async function handleBackup(client, message, args, config, store) {
  const sub = (args[0] || "").toLowerCase();
  const guildId = message.guild.id;

  // !backup list — danh sách backup của server này
  if (sub === "list") {
    const list = await store.client.query("backup:listGuild", { guildId }).catch(() => null);
    if (!list || list.length === 0) {
      return message.reply(
        "Chưa có backup nào của server này — dùng `!backup now` để tạo bản đầu tiên.",
      );
    }
    const lines = list.map(
      (b, i) =>
        `${i + 1}. **${b.guildName}** — ${new Date(b.createdAt).toLocaleString("vi-VN")} — ${b.roleCount} role · ${b.channelCount} kênh${(b.emojiCount ?? 0) > 0 ? ` · ${b.emojiCount} emoji` : ""}${(b.stickerCount ?? 0) > 0 ? ` · ${b.stickerCount} sticker` : ""}${b.pushedToGithub ? " · ☁️ GitHub" : ""}`,
    );
    const shown = lines.slice(0, BACKUP_LIST_MAX_LINES);
    if (lines.length > shown.length) {
      shown.push(
        `… và ${lines.length - shown.length} bản nữa — xem và khôi phục các bản cũ hơn trên dashboard.`,
      );
    }
    const embed = new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setTitle(`💾 Backup của server (${list.length})`)
      .setDescription(shown.join("\n"))
      .setFooter({ text: "Khôi phục: !backup restore <số thứ tự>" });
    return message.reply({ embeds: [embed] });
  }

  // !backup restore <số thứ tự trong list | id backup>
  if (sub === "restore") {
    if (!canManageGuild(message.member)) return noPerm(message);
    const target = (args[1] || "").trim();
    if (!target) {
      return message.reply(
        "Cú pháp: `!backup restore <số thứ tự trong !backup list>` (1 = bản mới nhất)",
      );
    }
    const list = await store.client.query("backup:listGuild", { guildId }).catch(() => null);
    if (!list || list.length === 0) {
      return message.reply("Chưa có backup nào của server này.");
    }
    let backup;
    if (/^\d+$/.test(target)) {
      backup = list[parseInt(target, 10) - 1];
    } else {
      backup = list.find((b) => String(b._id) === target);
    }
    if (!backup) {
      return message.reply(
        `Không tìm thấy backup \`${target}\` — xem danh sách bằng \`!backup list\`.`,
      );
    }
    try {
      await store.client.mutation("bot_writes:botSetRestoreRequest", {
        guildId,
        backupId: backup._id,
      });
      store.invalidate(guildId);
      return message.reply(
        `✅ Đã yêu cầu khôi phục backup của **${backup.guildName}** (${backup.roleCount} role · ${backup.channelCount} kênh) — bot tạo lại cấu trúc trong ~1 phút.`,
      );
    } catch (e) {
      return message.reply(`❌ ${e.message}`);
    }
  }

  // !backup auto <số ngày 2-30> | off — bật/tắt tự động backup định kỳ
  if (sub === "auto") {
    if (!canManageGuild(message.member)) return noPerm(message);
    const val = (args[1] || "").toLowerCase();
    const current = config.backupAutoDays ?? 0;
    if (!val) {
      return message.reply(
        current > 0
          ? `⏰ Tự động backup đang **bật** — mỗi **${current} ngày** (đẩy lên GitHub của chủ bot). Cú pháp đổi: \`!backup auto <2-30>\` · tắt: \`!backup auto off\``
          : "⏰ Tự động backup đang **tắt**. Cú pháp bật: `!backup auto <2-30>` (tối thiểu 2, tối đa 30 ngày).",
      );
    }
    let days;
    if (val === "off" || val === "0") {
      days = 0;
    } else {
      days = parseInt(val, 10);
      if (!Number.isFinite(days) || days < 2 || days > 30) {
        return message.reply("Số ngày phải từ **2 đến 30** (hoặc `off` để tắt).");
      }
    }
    try {
      await store.client.mutation("bot_writes:botSetAutoBackup", { guildId, days });
      store.invalidate(guildId);
      return message.reply(
        days > 0
          ? `✅ Tự động backup mỗi **${days} ngày** — bot tự chụp + đẩy lên GitHub của chủ bot. Xem danh sách: \`!backup list\``
          : "✅ Đã tắt tự động backup — bot chỉ backup khi bạn dùng lệnh hoặc trên dashboard.",
      );
    } catch (e) {
      return message.reply(`❌ ${e.message}`);
    }
  }

  // !backup keep <số bản> [số ngày] — quy tắc giữ bản (2-50 bản; ngày 0 = tắt).
  if (sub === "keep") {
    if (!canManageGuild(message.member)) return noPerm(message);
    const count = parseInt(args[1] || "", 10);
    if (!Number.isFinite(count) || count < 2 || count > 50) {
      return message.reply(
        "Số bản phải từ **2 đến 50**. Ví dụ: `!backup keep 7 30` (giữ 7 bản, xoá bản cũ hơn 30 ngày).",
      );
    }
    const daysRaw = args[2];
    const days = daysRaw === undefined || daysRaw === "" ? 0 : parseInt(daysRaw, 10);
    if (!Number.isFinite(days) || days < 0 || days > 365) {
      return message.reply("Số ngày phải từ **0 đến 365** (0 = không xoá theo tuổi).");
    }
    try {
      const res = await store.client.mutation("bot_writes:botSetBackupRetention", {
        guildId,
        keepCount: count,
        keepDays: days,
      });
      // ok=false (VD server chưa có trong DB vì bot vừa vào) → KHÔNG báo thành
      // công, người dùng sẽ tin là đã đặt xong nhưng không có gì lưu.
      if (res?.ok !== true) {
        return message.reply(
          `❌ ${
            res?.reason === "no_guild"
              ? "bot chưa đồng bộ server này — thử lại sau vài phút"
              : "không lưu được quy tắc giữ bản"
          }`,
        );
      }
      return message.reply(
        `✅ Quy tắc giữ bản: giữ **${count} bản** gần nhất${
          days > 0 ? ` và xoá bản cũ hơn **${days} ngày**` : ""
        }. Có hiệu lực từ lần backup kế tiếp (bản đang có không bị xoá ngay).`,
      );
    } catch (e) {
      return message.reply(`❌ ${e.message}`);
    }
  }

  // !backup / !backup now → tạo backup; !backup local → chỉ lưu Convex (không đẩy GitHub)
  if (sub !== "" && sub !== "now" && sub !== "local") {
    return message.reply(
      "Cú pháp: `!backup` (tạo ngay) · `!backup local` (không đẩy GitHub) · `!backup list` · `!backup restore <số>` · `!backup auto <2-30|off>` · `!backup keep <2-50> [ngày]`",
    );
  }
  if (!canManageGuild(message.member)) return noPerm(message);
  const push = sub !== "local";
  try {
    await store.client.mutation("bot_writes:botSetBackupRequest", {
      guildId,
      pushToGithub: push,
    });
    store.invalidate(guildId);
    return message.reply(
      push
        ? "✅ Đã yêu cầu tạo backup (đẩy lên GitHub của chủ bot) — bot thực hiện trong ~20 giây. Xem kết quả: `!backup list`"
        : "✅ Đã yêu cầu tạo backup (chỉ lưu trên Convex) — bot thực hiện trong ~20 giây. Xem kết quả: `!backup list`",
    );
  } catch (e) {
    return message.reply(`❌ ${e.message}`);
  }
}

const REACTION_ROLE_HELP =
  "Cú pháp reaction role:\n" +
  "`!reactionrole list`\n" +
  "`!reactionrole create #kênh | Tên | Mô tả | emoji:role emoji:role | thumbnail URL`\n" +
  "`!reactionrole add <Tên> <emoji> <@role>`\n" +
  "`!reactionrole edit <Tên> | Mô tả mới | Thumbnail mới` (dùng `-` để xóa)\n" +
  "`!reactionrole remove <Tên> <emoji>` · `!reactionrole delete <Tên>`";

/** Phân tích chuỗi "emoji:role emoji:role" (role có thể là ID hoặc <@&id>). */
function parseEmojiRolePairs(pairsRaw, message) {
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
    // Nếu role ghi bằng tên (không phải ID) thì thử tra trong cache.
    if (!/^\d{15,20}$/.test(roleId) && message) {
      const role = message.guild.roles.cache.find(
        (r) => r.name.toLowerCase() === roleId.toLowerCase(),
      );
      if (role) roleId = role.id;
    }
    if (!/^\d{15,20}$/.test(roleId)) continue;
    entries.push({ emoji, roleId });
  }
  return entries.slice(0, 20);
}

async function handleVerify(client, message, args, config, store) {
  const sub = (args[0] || "").toLowerCase();
  if (sub === "setup") {
    if (!canManageGuild(message.member)) {
      return message.reply("❌ Bạn không có quyền dùng lệnh này — cần quyền **Quản lý server**.");
    }
    const channelMention = args[1] || "";
    const unverifiedMention = args[2] || "";
    const verifiedMention = args[3] || "";
    const method = ["button", "captcha"].includes(args[4]) ? args[4] : "button";
    const channelId = channelMention.replace(/^<#(\d+)>$/, "$1");
    const unverifiedRoleId = unverifiedMention.replace(/^<@&?(\d+)>$/, "$1");
    const verifiedRoleId = verifiedMention.replace(/^<@&?(\d+)>$/, "$1");
    if (!/^\d{15,20}$/.test(channelId)) {
      return message.reply(
        "❌ Cú pháp: `!verify setup #kênh @role-chưa-xác-minh @role-đã-xác-minh [button|captcha]`",
      );
    }
    if (!/^\d{15,20}$/.test(unverifiedRoleId)) {
      return message.reply(
        "❌ Cú pháp: `!verify setup #kênh @role-chưa-xác-minh @role-đã-xác-minh [button|captcha]`",
      );
    }
    if (!/^\d{15,20}$/.test(verifiedRoleId)) {
      return message.reply(
        "❌ Cú pháp: `!verify setup #kênh @role-chưa-xác-minh @role-đã-xác-minh [button|captcha]`",
      );
    }
    await store.client.mutation("bot_writes:botUpdateSettings", {
      guildId: message.guild.id,
      verifyEnabled: true,
      verifyMethod: method,
      verifyChannelId: channelId,
      unverifiedRoleId,
      verifiedRoleId,
    });
    store.invalidate(message.guild.id);
    try {
      const verifyChannel = message.guild.channels.cache.get(channelId);
      if (verifyChannel) {
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
        await verifyChannel.send({ embeds: [embed], components: [row] });
      }
    } catch (e) {
      console.error(`[verify:setup:send] ${message.guild.id}:`, e.message);
    }
    return message.reply(
      `✅ Đã thiết lập xác minh (${method === "captcha" ? "captcha" : "button"}).`,
    );
  }
  if (sub === "on" || sub === "off") {
    if (!canManageGuild(message.member)) {
      return message.reply("❌ Bạn không có quyền dùng lệnh này — cần quyền **Quản lý server**.");
    }
    const enabled = sub === "on";
    await store.client.mutation("bot_writes:botUpdateSettings", {
      guildId: message.guild.id,
      verifyEnabled: enabled,
    });
    store.invalidate(message.guild.id);
    return message.reply(`✅ Đã ${enabled ? "bật" : "tắt"} xác minh thành viên.`);
  }
  if (sub === "method") {
    if (!canManageGuild(message.member)) {
      return message.reply("❌ Bạn không có quyền dùng lệnh này — cần quyền **Quản lý server**.");
    }
    const type = (args[1] || "").toLowerCase();
    if (!["button", "captcha"].includes(type)) {
      return message.reply("❌ Cú pháp: `!verify method button|captcha`");
    }
    await store.client.mutation("bot_writes:botUpdateSettings", {
      guildId: message.guild.id,
      verifyMethod: type,
    });
    store.invalidate(message.guild.id);
    return message.reply(
      `✅ Đã đổi phương thức xác minh thành **${type === "captcha" ? "captcha — nhập mã DM" : "button — bấm nút"}**.`,
    );
  }
  return message.reply(
    "**Cú pháp:**\n" +
      "`!verify setup #kênh @role-chưa-xác-minh @role-đã-xác-minh [button|captcha]` — thiết lập\n" +
      "`!verify on/off` — bật/tắt\n" +
      "`!verify method button|captcha` — đổi phương thức",
  );
}

module.exports = {
  help: handleHelp,
  ping: handlePing,
  health: handleHealth,
  report: handleReport,
  research: handleResearch,
  prefix: handlePrefix,
  autoreply: handleAutoReply,
  antinuke: handleAntinuke,
  lockdown: handleLockdown,
  badword: handleBadword,
  heat: handleHeat,
  setlog: handleSetlog,
  timeout: handleTimeout,
  untimeout: handleUntimeout,
  purge: handlePurge,
  kick: handleKick,
  ban: handleBan,
  unban: handleUnban,
  unwarn: handleUnwarn,
  giveaway: handleGiveaway,
  reactionrole: handleReactionRole,
  backup: handleBackup,
  backuplist: (client, message, args, config, store) =>
    handleBackup(client, message, ["list"], config, store),
  restore: (client, message, args, config, store) =>
    handleBackup(client, message, ["restore", ...args], config, store),
  verify: handleVerify,
};
