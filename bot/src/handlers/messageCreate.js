const prefixCommands = require("../commands/prefix");
const { fillPlaceholders } = require("../util");
const { verifyCode } = require("../captchaStore");

function channelAllowed(rule, message) {
  if (!rule.channels || rule.channels.length === 0) return true;
  return rule.channels.includes(message.channel.id);
}

/**
 * Cache keyword đã lowercase theo identity của rule (Convex trả rule mới khi
 * cấu hình đổi → WeakMap tự nhả). Trước đây mỗi tin nhắn `toLowerCase()` lại
 * toàn bộ keyword của mọi rule — cấp phát chuỗi mới cho từng từ mỗi message.
 */
const keywordLowerCache = new WeakMap();
function lowerKeywords(rule) {
  const cached = keywordLowerCache.get(rule);
  if (cached) return cached;
  const out = (rule.keywords || []).filter(Boolean).map((k) => k.toLowerCase());
  keywordLowerCache.set(rule, out);
  return out;
}

async function handleAutoReply(client, message, config, store) {
  const rules = config.autoReplies || [];
  // Server không bật auto-reply: thoát TRƯỚC khi lowercase nội dung tin nhắn.
  if (rules.length === 0) return;
  const mentioned = message.mentions.users.has(client.user.id);
  const content = message.content.toLowerCase();

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!channelAllowed(rule, message)) continue;

    const matched =
      rule.triggerType === "mention"
        ? mentioned
        : lowerKeywords(rule).some((k) => content.includes(k));
    if (!matched) continue;

    if (store.isCooledDown(message.guild.id, rule._id, rule.cooldownSeconds || 0)) continue;

    store.recordReply(message.guild.id, rule._id);
    try {
      let text = fillPlaceholders(rule.response, message.author);
      if (text.length > 1900) text = text.slice(0, 1900) + "…";
      await message.reply({ content: text, allowedMentions: { parse: ["users"] } });
    } catch (err) {
      console.error(`[autoreply] ${message.guild.id}/${rule.name}:`, err.message);
    }
    return; // reply once per message
  }
}

module.exports = async function onMessageCreate(client, message, store, heat) {
  if (message.author.bot) return;
  if (!message.guild || message.guild.available === false) return;
  if (message.channel.isDMBased?.()) return;

  const config = await store.getConfig(message.guild.id);
  if (!config) return;

  const prefix = config.prefix || "!";
  if (message.content.startsWith(prefix)) {
    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const cmd = args.shift()?.toLowerCase() ?? "";
    const handler = prefixCommands[cmd];
    if (handler) {
      try {
        await handler(client, message, args, config, store, heat);
      } catch (err) {
        console.error(`[cmd:${cmd}]`, err);
        message.reply("❌ Có lỗi khi thực hiện lệnh.").catch(() => {});
      }
      return;
    }
    // Lệnh prefix không nhận diện được — bỏ qua (không auto-reply).
    return;
  }

  // Captcha verify: nếu message là mã 6 chữ số trong kênh verify → kiểm tra
  if (
    config.verifyEnabled &&
    config.verifyMethod === "captcha" &&
    config.verifyChannelId === message.channel.id
  ) {
    const content = message.content.trim();
    if (/^\d{6}$/.test(content)) {
      const member = message.member;
      if (member && config.unverifiedRoleId && member.roles.cache.has(config.unverifiedRoleId)) {
        const result = verifyCode(message.guild.id, member.id, content);
        if (result.ok) {
          // === ALT DETECTION AT VERIFY GATE (Double Counter style) ===
          // FIX: Fail-open if punishment fails (same fix as button verify)
          if (config.altDetectionEnabled) {
            try {
              const {
                analyzeNewMember,
                executePunishment,
                buildRiskEmbed,
              } = require("../altDetection");
              const analysis = await analyzeNewMember(member, config, store);
              const maxRisk = config.altMaxRiskScore ?? 70;
              if (analysis.riskScore >= maxRisk && analysis.action !== "pass") {
                const punishResult = await executePunishment(member, analysis, config);
                // FIX: Fail-open — if punishment failed, allow verify
                if (punishResult.executed) {
                  // Đánh dấu đã bị phạt để lần join sau đối chiếu (evasion detect).
                  await store.client
                    .mutation("altDetection:markJoinPunished", {
                      guildId: message.guild.id,
                      userId: member.id,
                      action: punishResult.action,
                    })
                    .catch(() => {});
                  await message
                    .reply({
                      content: `❌ **Xác minh bị từ chối.** Tài khoản có rủi ro cao (**${analysis.riskScore}/100**). Đã xử lý: ${punishResult.action}`,
                      failIfNotExists: false,
                    })
                    .catch(() => {});
                  const { sendLog } = require("../util");
                  const embed = buildRiskEmbed(member, analysis, punishResult);
                  embed.setTitle("🚫 Alt Detected at Verify Gate (Captcha)");
                  await sendLog(message.guild, config, embed).catch(() => {});
                  await store.client
                    .mutation("bot_writes:botRecordAntinukeEvent", {
                      guildId: message.guild.id,
                      module: "altDetection",
                      executorId: member.id,
                      executorName: member.user.username,
                      action: `${punishResult.action} at verify gate (captcha) — risk: ${analysis.riskScore}/100 — ${analysis.riskFactors.join(", ")}`,
                      count: 1,
                      windowSeconds: 60,
                      threshold: 1,
                      punish: analysis.action,
                    })
                    .catch(() => {});
                  console.log(
                    `[verify:alt:captcha] ${message.guild.name}/${member.user.username} BLOCKED — risk=${analysis.riskScore}`,
                  );
                  setTimeout(() => message.delete().catch(() => {}), 3000);
                  return;
                } else {
                  console.log(
                    `[verify:alt:captcha] ${message.guild.name}/${member.user.username} — punish FAILED (${punishResult.reason}), allowing verify (fail-open)`,
                  );
                }
              }
            } catch (e) {
              console.error(`[verify:alt:captcha] ${message.guild.id}:`, e.message);
            }
          }
          // Normal verify
          try {
            if (config.unverifiedRoleId)
              await member.roles.remove(config.unverifiedRoleId, "Xác minh thành công (captcha)");
            if (config.verifiedRoleId)
              await member.roles.add(config.verifiedRoleId, "Xác minh thành công (captcha)");
            await message
              .reply({
                content: "✅ Mã chính xác! Bạn đã xác minh thành công.",
                failIfNotExists: false,
              })
              .catch(() => {});
            // DM chào mừng
            if (config.verifyWelcomeEnabled) {
              try {
                const { EmbedBuilder } = require("discord.js");
                const title = config.verifyWelcomeTitle || "🌸 Chào mừng bạn!";
                let description =
                  config.verifyWelcomeDescription ||
                  `Chào mừng bạn đến với **${message.guild.name}**! Bạn đã xác minh thành công.`;
                description = description
                  .replace(/{user}/g, `<@${member.id}>`)
                  .replace(/{server}/g, message.guild.name);
                const colorHex = config.verifyWelcomeColor || "#f2629e";
                const colorInt = parseInt(colorHex.replace("#", ""), 16) || 0xf2629e;
                const welcomeEmbed = new EmbedBuilder()
                  .setTitle(title)
                  .setDescription(description)
                  .setColor(colorInt)
                  .setThumbnail(message.guild.iconURL({ size: 256 }) || null)
                  .setFooter({
                    text: message.guild.name,
                    iconURL: message.guild.iconURL({ size: 64 }) || undefined,
                  });
                await member.send({ embeds: [welcomeEmbed] }).catch(() => {});
              } catch {}
            }
          } catch (e) {
            console.error(`[verify:captcha] ${message.guild.id}:`, e.message);
          }
          // Xóa tin nhắn mã sau 3 giây
          setTimeout(() => message.delete().catch(() => {}), 3000);
          return;
        }
        if (result.reason === "wrong") {
          await message
            .reply({
              content: "❌ Mã không đúng. Hãy bấm nút nhận mã mới và thử lại.",
              failIfNotExists: false,
            })
            .catch(() => {});
          setTimeout(() => message.delete().catch(() => {}), 3000);
          return;
        }
        if (result.reason === "expired") {
          await message
            .reply({
              content: "⏰ Mã đã hết hạn. Hãy bấm nút nhận mã mới.",
              failIfNotExists: false,
            })
            .catch(() => {});
          setTimeout(() => message.delete().catch(() => {}), 3000);
          return;
        }
      }
    }
  }

  await handleAutoReply(client, message, config, store);
};
