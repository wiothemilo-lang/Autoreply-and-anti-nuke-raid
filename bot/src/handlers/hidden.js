const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const webhookHub = require("../webhookHub");

const GIVEAWAY_EMOJI = "🎉";
const HIDDEN_COLOR = 0xf48fb1;

/**
 * Chuẩn hóa emoji về dạng khớp: custom emoji (<:name:id>, <a:name:id>, name:id)
 * → ID số; emoji unicode → bỏ variation selector (U+FE0F) để không lệch nhau.
 */
function emojiKeyOf(value) {
  const s = String(value || "").trim();
  const custom = /^<a?:[^:]+:(\d{15,20})>$/.exec(s) || /^[^:]+:(\d{15,20})$/.exec(s);
  if (custom) return custom[1];
  return s.replace(/\uFE0F/g, "");
}

function emojiMatches(entryEmoji, emoji) {
  const key = emojiKeyOf(entryEmoji);
  if (/^\d{15,20}$/.test(key)) return emoji.id === key;
  return emojiKeyOf(emoji.name) === key;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function resolveEmoji(client, emojiStr) {
  const key = emojiKeyOf(emojiStr);
  if (/^\d{15,20}$/.test(key)) {
    return (
      client.emojis.cache.get(key) ?? (await client.emojis.fetch(key).catch(() => null)) ?? null
    );
  }
  return key;
}

/** Xử lý reaction: cấp/gỡ role theo bảng reaction role + ghi nhận tham gia giveaway. */
async function onReaction(client, store, reaction, user, removed) {
  if (user.bot) return;
  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
    const guild = reaction.message.guild;
    if (!guild) return;
    const hidden = await store.client.query("hidden:getBotHidden", {
      guildId: guild.id,
    });
    if (!hidden) return;

    // Reaction role panel
    const panel = hidden.panels.find(
      (p) =>
        p.enabled &&
        p.messageId &&
        p.messageId === reaction.message.id &&
        p.channelId === reaction.message.channelId,
    );
    if (panel) {
      const entry = panel.entries.find((e) => emojiMatches(e.emoji, reaction.emoji));
      if (entry) {
        try {
          const member = await guild.members.fetch(user.id);
          if (!removed) {
            if (!member.roles.cache.has(entry.roleId)) await member.roles.add(entry.roleId);
          } else if (member.roles.cache.has(entry.roleId)) {
            await member.roles.remove(entry.roleId);
          }
        } catch (e) {
          console.error(`[hidden:panel] ${guild.id}:`, e.message);
        }
      }
    }

    // Giveaway entry (chỉ khi reaction 🎉 và đang active)
    if (!removed && reaction.emoji.name === GIVEAWAY_EMOJI) {
      const giveaway = hidden.giveaways.find(
        (g) => g.status === "active" && g.messageId && g.messageId === reaction.message.id,
      );
      if (giveaway && Date.now() < giveaway.endsAt) {
        let allowed = true;
        if (giveaway.requiredRoleId) {
          try {
            const member = await guild.members.fetch(user.id);
            allowed = member.roles.cache.has(giveaway.requiredRoleId);
          } catch {
            allowed = false;
          }
        }
        if (allowed) {
          await store.client.mutation("hidden:giveawayEnter", {
            giveawayId: giveaway._id,
            userId: user.id,
            username: user.username,
          });
        }
      }
    }
  } catch (e) {
    console.error("[hidden:reaction]", e?.message || e);
  }
}

/** Gửi bảng reaction role ra kênh. */
async function postPanel(client, store, panel) {
  try {
    const channel = await client.channels.fetch(panel.channelId);
    if (!channel?.isTextBased()) {
      throw new Error(
        `Kênh <#${panel.channelId}> không tồn tại hoặc bot không xem được — hãy chọn kênh khác trên dashboard`,
      );
    }
    const embed = new EmbedBuilder()
      .setColor(HIDDEN_COLOR)
      .setTitle(panel.label)
      .setDescription(
        panel.description || "Chọn emoji bên dưới để nhận role 🌸\nBấm lại lần nữa để gỡ role.",
      )
      .setFooter({ text: "Protogon · Reaction Role" });
    if (panel.thumbnailUrl) embed.setThumbnail(panel.thumbnailUrl);
    for (const e of panel.entries) {
      const emoji = await resolveEmoji(client, e.emoji);
      if (emoji) {
        embed.addFields({
          name: typeof emoji === "string" ? emoji : emoji.toString(),
          value: `<@&${e.roleId}>`,
          inline: true,
        });
      }
    }
    const msg = await channel.send({ embeds: [embed] });
    for (const e of panel.entries) {
      const emoji = await resolveEmoji(client, e.emoji);
      if (emoji) await msg.react(emoji).catch(() => {});
    }
    await store.client.mutation("hidden:panelPosted", {
      panelId: panel._id,
      messageId: msg.id,
    });
  } catch (e) {
    // Báo lỗi về dashboard (trừ lỗi mutation thông báo chính nó) — người dùng
    // thấy lý do thay vì panel treo "đang gửi" mãi không rõ.
    if (!/hidden:panelPosted/.test(String(e?.message))) {
      await store.client
        .mutation("hidden:botReportPanelError", {
          panelId: panel._id,
          error: String(e?.message || "Lỗi không xác định").slice(0, 300),
        })
        .catch(() => {});
    }
    throw e;
  }
}

/** Mẫu tin nhắn giveaway — đổi lời chào, màu, footer theo lựa chọn. */
const GIVEAWAY_TEMPLATES = {
  default: {
    color: 0xf48fb1,
    emoji: "🎉",
    header: "GIVEAWAY",
    footer: "Bấm 🎉 để tham gia!",
    endFooter: "Protogon · Giveaway",
  },
  luxury: {
    color: 0xf1c40f,
    emoji: "✨",
    header: "GIVEAWAY SANG TRỌNG",
    footer: "✨ Chỉ dành cho người may mắn ✨",
    endFooter: "✨ Protogon · Giveaway cao cấp",
  },
  vip: {
    color: 0x9b59b6,
    emoji: "💎",
    header: "GIVEAWAY VIP",
    footer: "💎 Vận may đang chờ bạn 💎",
    endFooter: "💎 Protogon · Giveaway VIP",
  },
  simple: {
    color: 0x2ecc71,
    emoji: "🎁",
    header: "QUÀ TẶNG",
    footer: "🎁 Tham gia ngay nhé!",
    endFooter: "🎁 Protogon · Giveaway",
  },
};

function templateOf(giveaway) {
  return GIVEAWAY_TEMPLATES[giveaway.template] || GIVEAWAY_TEMPLATES.default;
}

/** Gửi giveaway ra kênh. */
async function postGiveaway(client, store, giveaway) {
  try {
    const channel = await client.channels.fetch(giveaway.channelId);
    if (!channel?.isTextBased()) {
      throw new Error(
        `Kênh <#${giveaway.channelId}> không tồn tại hoặc bot không xem được — hãy chọn kênh khác trên dashboard`,
      );
    }
    const t = templateOf(giveaway);
    const embed = new EmbedBuilder()
      .setColor(t.color)
      .setTitle(`${t.emoji} ${t.header} — ${giveaway.title}`)
      .setDescription(giveaway.message || giveaway.prize)
      .addFields(
        { name: "🏆 Giải thưởng", value: giveaway.prize, inline: false },
        { name: "👥 Người thắng", value: `${giveaway.winnerCount}`, inline: true },
        {
          name: "⏰ Kết thúc",
          value: `<t:${Math.floor(giveaway.endsAt / 1000)}:R>`,
          inline: true,
        },
      )
      .setFooter({ text: t.footer });
    if (giveaway.imageUrl) embed.setImage(giveaway.imageUrl);
    if (giveaway.requiredRoleId) {
      embed.addFields({
        name: "Điều kiện",
        value: `Chỉ dành cho <@&${giveaway.requiredRoleId}>`,
        inline: true,
      });
    }
    if (giveaway.prizeRoleId) {
      embed.addFields({
        name: "🎖️ Giải thưởng đặc biệt",
        value: `Người thắng được cấp role <@&${giveaway.prizeRoleId}>`,
        inline: true,
      });
    }
    const msg = await channel.send({ embeds: [embed] });
    await msg.react(GIVEAWAY_EMOJI).catch(() => {});
    await store.client.mutation("hidden:giveawayPosted", {
      giveawayId: giveaway._id,
      messageId: msg.id,
    });
  } catch (e) {
    if (!/hidden:giveawayPosted/.test(String(e?.message))) {
      await store.client
        .mutation("hidden:botReportGiveawayError", {
          giveawayId: giveaway._id,
          phase: "post",
          error: String(e?.message || "Lỗi không xác định").slice(0, 300),
        })
        .catch(() => {});
    }
    throw e;
  }
}

/** Kết thúc giveaway hết hạn: chọn người thắng, thông báo, cấp role, DM nếu bật. */
async function endGiveaway(client, store, giveaway) {
  const winners = shuffle(giveaway.entries)
    .slice(0, giveaway.winnerCount)
    .map((e) => ({ userId: e.userId, username: e.username }));
  const t = templateOf(giveaway);
  try {
    const channel = await client.channels.fetch(giveaway.channelId);
    if (channel?.isTextBased() && giveaway.messageId) {
      const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
      if (msg) {
        const embed = new EmbedBuilder()
          .setColor(0x23a55a)
          .setTitle(`🏁 ${t.emoji} KẾT THÚC — ${giveaway.title}`)
          .setDescription(giveaway.message || giveaway.prize)
          .addFields(
            { name: "🏆 Giải thưởng", value: giveaway.prize, inline: false },
            {
              name: "🎉 Người thắng",
              value:
                winners.length > 0
                  ? winners.map((w) => `<@${w.userId}>`).join("\n")
                  : "Không có ai tham gia 😢",
              inline: false,
            },
          )
          .setFooter({ text: t.endFooter });
        if (giveaway.prizeRoleId) {
          embed.addFields({
            name: "🎖️ Role đã cấp",
            value: `<@&${giveaway.prizeRoleId}>`,
            inline: false,
          });
        }
        await msg.edit({ embeds: [embed] });
      }
    }
  } catch (e) {
    // Báo lỗi kết thúc lên dashboard (webhook/bảng tin có thể đã bị xóa) nhưng
    // VẪN chốt người thắng bên dưới — không bỏ trao thưởng vì lỗi hiển thị.
    await store.client
      .mutation("hidden:botReportGiveawayError", {
        giveawayId: giveaway._id,
        phase: "end",
        error: String(e?.message || "Lỗi không xác định").slice(0, 300),
      })
      .catch(() => {});
    console.error(`[hidden:giveaway end ${giveaway._id}]`, e.message);
  }

  // Tự cấp role thưởng cho người thắng (best-effort).
  if (giveaway.prizeRoleId) {
    for (const w of winners) {
      try {
        const member = await client.channels
          .fetch(giveaway.channelId)
          .then((c) => c?.guild?.members.fetch(w.userId).catch(() => null))
          .catch(() => null);
        if (member && !member.roles.cache.has(giveaway.prizeRoleId)) {
          await member.roles.add(giveaway.prizeRoleId);
        }
      } catch (e) {
        console.error(`[hidden:giveaway role ${w.userId}]`, e.message);
      }
    }
  }

  if (giveaway.dmWinners) {
    const roleLine = giveaway.prizeRoleId
      ? `\n🎖️ Bạn đã được cấp role **<@&${giveaway.prizeRoleId}>** trên server!`
      : "";
    for (const w of winners) {
      try {
        const user = await client.users.fetch(w.userId);
        await user.send(
          `${giveaway.endMessage || "🎉 Chúc mừng! Bạn đã thắng giveaway!"}\n\n🏆 **${giveaway.title}** — ${giveaway.prize}${roleLine}\n\nHãy liên hệ admin để nhận thưởng nhé 🌸`,
        );
      } catch (e) {
        console.error(`[hidden:giveaway dm ${w.userId}]`, e.message);
      }
    }
  }
  await store.client.mutation("hidden:giveawayEnd", {
    giveawayId: giveaway._id,
    winners,
  });
}

/** Gửi DM trực tiếp theo yêu cầu của admin — dùng `hidden` đã fetch sẵn. */
async function sendDirectDm(client, store, guildId, hidden) {
  let dmFailed = null;
  try {
    if (!hidden || !hidden.dmRequested || !hidden.dmTargetUserId || !hidden.dmMessage) return;
    const user = await client.users.fetch(hidden.dmTargetUserId);
    await user.send(hidden.dmMessage);
    console.log(`✅ Đã gửi DM tới ${user.tag}`);
  } catch (e) {
    // Lưu lý do để báo về dashboard trong finally (người dùng thấy vì sao
    // "đã bấm gửi DM" nhưng người nhận không có gì).
    dmFailed = String(e?.message || "Lỗi không xác định");
    console.error(`[hidden:dm ${guildId}]`, e.message);
  } finally {
    try {
      if (dmFailed) {
        await store.client.mutation("hidden:botReportDmError", {
          guildId,
          error: dmFailed.slice(0, 300),
        });
      } else {
        await store.client.mutation("hidden:botClearDm", { guildId });
      }
    } catch {}
  }
}

/**
 * Xử lý items verify panel đã fetch (từ guilds:getVerifySendPanelGuilds hoặc
 * batch gộp bot_tick:getPendingJobs) — KHÔNG tự query. Tách riêng để tái sử dụng.
 */
async function processVerifyPanelItems(client, store, items) {
  if (!items || items.length === 0) return;
  for (const item of items) {
    try {
      const guild = client.guilds.cache.get(item.guildId);
      if (!guild) {
        console.warn(`[hidden:verifyPanel] ${item.guildId}: bot không còn trong server — bỏ qua`);
        continue;
      }
      const channel = await client.channels.fetch(item.verifyChannelId).catch(() => null);
      if (!channel?.isTextBased()) {
        throw new Error(
          "Kênh xác minh không tồn tại hoặc bot không xem được — hãy chọn kênh khác trên dashboard",
        );
      }
      // Panel chỉ hữu ích khi đã setup đủ 2 role — thiếu thì bỏ qua (không gửi
      // nút bấm sẽ báo lỗi "Chưa cấu hình role xác minh" cho thành viên).
      if (!item.unverifiedRoleId || !item.verifiedRoleId) {
        throw new Error(
          "Chưa cấu hình đủ 2 role xác minh (chưa xác minh/đã xác minh) — hãy chọn role trong phần Xác minh trước",
        );
      }
      const method = item.verifyMethod === "captcha" ? "captcha" : "button";
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("✅ Xác minh thành viên")
        .setDescription(
          method === "captcha"
            ? "Nhấn nút bên dưới để nhận mã xác minh qua DM, sau đó nhập mã trong kênh này."
            : "Nhấn nút bên dưới để xác minh và vào server.",
        )
        .setFooter({ text: "Protogon · Verify" });
      const row = new ActionRowBuilder().addComponents(
        method === "captcha"
          ? new ButtonBuilder()
              .setCustomId("verify_request_captcha")
              .setLabel("Nhận mã xác minh 🔑")
              .setStyle(ButtonStyle.Primary)
          : new ButtonBuilder()
              .setCustomId("verify_confirm")
              .setLabel("Xác minh ✅")
              .setStyle(ButtonStyle.Success),
      );
      await channel.send({ embeds: [embed], components: [row] });
      console.log(
        `[hidden:verifyPanel] ${item.guildId}: đã gửi panel xác minh (${method}) tới #${channel.name}`,
      );
    } catch (e) {
      console.error(`[hidden:verifyPanel] ${item.guildId}:`, e.message);
      // Báo lý do lên dashboard — người dùng bấm "Gửi panel" xong sẽ thấy lỗi
      // cụ thể thay vì im lặng (kênh xóa, thiếu role…).
      await store.client
        .mutation("guilds:clearVerifySendPanel", {
          guildId: item.guildId,
          error: String(e?.message || "Lỗi không xác định").slice(0, 300),
        })
        .catch(() => {});
      continue;
    }
    // Thành công: xóa cờ + xóa lỗi cũ.
    await store.client
      .mutation("guilds:clearVerifySendPanel", { guildId: item.guildId })
      .catch(() => {});
  }
}

/**
 * Xử lý dữ liệu jobs hidden đã fetch (từ hidden:getBotHiddenJobs hoặc batch gộp
 * bot_tick:getPendingJobs) — KHÔNG tự query. Tách riêng để tái sử dụng.
 */
async function processHiddenJobsData(client, store, jobs) {
  for (const hidden of jobs) {
    const guild = client.guilds.cache.get(hidden.guildId);
    if (!guild) continue;
    try {
      for (const panel of hidden.panels || []) {
        if (!panel.messageId) {
          await postPanel(client, store, panel).catch((e) =>
            console.error(`[hidden:panel ${guild.id}]`, e.message),
          );
        }
      }

      for (const giveaway of hidden.giveaways || []) {
        if (!giveaway.messageId) {
          await postGiveaway(client, store, giveaway).catch((e) =>
            console.error(`[hidden:giveaway ${guild.id}]`, e.message),
          );
        } else if (Date.now() >= giveaway.endsAt) {
          await endGiveaway(client, store, giveaway).catch((e) =>
            console.error(`[hidden:giveaway end ${guild.id}]`, e.message),
          );
        }
      }

      if (hidden.dmRequested) {
        await sendDirectDm(client, store, guild.id, hidden);
      }

      // Webhook MẶC ĐỊNH của bot: tự tạo "Protogon Log" khi đã set kênh log,
      // tự gỡ khi bỏ set kênh hoặc kênh đổi chỗ (xem getBotHiddenJobs).
      if (hidden.defaultWebhook) {
        await webhookHub.reconcileDefaultWebhook(guild, hidden.defaultWebhook);
      }
    } catch (e) {
      console.error(`[hidden:poll ${guild.id}]`, e?.message || e);
    }
  }
}

/** Gắn listener reaction + lịch quét. */
function setupHidden(client, store) {
  client.on("messageReactionAdd", (reaction, user) =>
    onReaction(client, store, reaction, user, false).catch((e) =>
      console.error("[hidden:reactionAdd]", e.message),
    ),
  );
  client.on("messageReactionRemove", (reaction, user) =>
    onReaction(client, store, reaction, user, true).catch((e) =>
      console.error("[hidden:reactionRemove]", e.message),
    ),
  );
  // Vòng quét định kỳ đã gộp vào tick.js (bot_tick:getPendingJobs — 1 query
  // cho hidden + verify panel + backup). setupHidden chỉ gắn listener reaction.
}

module.exports = {
  setupHidden,
  processHiddenJobsData,
  processVerifyPanelItems,
  emojiKeyOf,
};
