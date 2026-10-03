// Nút xác minh thành viên (`verify_request_captcha` + `verify_confirm`) — tách
// từ handlers/interactionCreate.js (đợt #5 tách monolith — 03/10/2026). Chỉ
// CHUYỂN CHỖ code, không đổi hành vi.
//
// Vì sao tách riêng: đây là luồng nặng nhất về trạng thái (rate-limit DM theo
// user + cổng chống alt account trước khi cấp role) — gom một chỗ để đọc/sửa.
// `handlers/interactionCreate.js` chỉ còn định tuyến theo customId.

const { EmbedBuilder, Colors } = require("discord.js");
const { genCaptcha, setCode } = require("../captchaStore");
const { registerSweep } = require("../sweeper");
const { analyzeNewMember, executePunishment, buildRiskEmbed } = require("../altDetection");

// Rate limiting for verify attempts: Map<userId, { attempts: number, lastAttemptAt: number }>
// Trạng thái rate-limit xác minh (3 lần / 10 phút cho mỗi user). Hiện chưa có
// nơi gọi hàm kiểm tra — dọn dẹp định kỳ bên dưới giữ Map sạch cho tương lai.
const verifyAttempts = new Map();
const VERIFY_RATE_WINDOW_MS = 10 * 60 * 1000;

// Dọn entry quá hạn — qua vòng sweep CHUNG (đợt #4), không tự dựng timer.
function sweepVerifyAttempts(now = Date.now()) {
  const cutoff = now - VERIFY_RATE_WINDOW_MS;
  let removed = 0;
  for (const [userId, data] of verifyAttempts) {
    if (data.lastAttemptAt < cutoff) {
      verifyAttempts.delete(userId);
      removed += 1;
    }
  }
  return removed;
}
registerSweep("interactionVerify", () => sweepVerifyAttempts(), 5 * 60_000);

/**
 * Nút `verify_request_captcha` — gửi mã xác minh qua DM.
 * Rate-limit 3 lần/10 phút mỗi user để bot không thành "vòi" spam DM.
 */
async function handleVerifyRequestCaptcha(store, interaction) {
  const guild = interaction.guild;
  if (!guild) return;
  const config = await store.getConfig(guild.id);
  if (!config?.verifyEnabled) {
    return interaction.reply({ content: "❌ Xác minh đã bị tắt.", ephemeral: true });
  }
  const unverifiedRoleId = config.unverifiedRoleId;
  if (!unverifiedRoleId) {
    return interaction.reply({ content: "❌ Chưa cấu hình role xác minh.", ephemeral: true });
  }
  const member =
    guild.members.cache.get(interaction.user.id) ||
    (await guild.members.fetch(interaction.user.id).catch(() => null));
  if (!member) {
    return interaction.reply({ content: "❌ Không tìm thấy thành viên.", ephemeral: true });
  }
  if (!member.roles.cache.has(unverifiedRoleId)) {
    return interaction.reply({ content: "✅ Bạn đã xác minh rồi!", ephemeral: true });
  }
  // RATE-LIMIT 3 lần/10 phút/user (verifyAttempts): chặn spam bấm nút nhận
  // mã — bot gửi DM mã mỗi lần bấm, kẻ xấu dùng bot làm vòi DM phiền người.
  // Entry cũ của Map có vòng dọn 5 phút sẵn bên dưới; kiểm tra + ghi tại đây.
  {
    const attempts = verifyAttempts.get(interaction.user.id);
    if (attempts && Date.now() - attempts.lastAttemptAt < VERIFY_RATE_WINDOW_MS) {
      if (attempts.attempts >= 3) {
        return interaction.reply({
          content: "⏳ Bạn đã yêu cầu mã quá nhiều lần — thử lại sau khoảng 10 phút.",
          ephemeral: true,
        });
      }
      attempts.attempts += 1;
      attempts.lastAttemptAt = Date.now();
    } else {
      verifyAttempts.set(interaction.user.id, { attempts: 1, lastAttemptAt: Date.now() });
    }
  }
  // Tạo mã captcha và gửi DM
  const code = genCaptcha();
  setCode(guild.id, interaction.user.id, code);
  try {
    const dmEmbed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle("🔑 Mã xác minh")
      .setDescription(`Mã xác minh của bạn trong **${guild.name}** là:`)
      .addFields({ name: "Mã", value: `||${code}||`, inline: true })
      .setFooter({ text: "Mã hết hạn trong 5 phút. Nhập mã trong kênh xác minh để hoàn tất." });
    await member.send({ embeds: [dmEmbed] });
    return interaction.reply({
      content:
        "✅ Đã gửi mã xác minh qua DM! Hãy kiểm tra tin nhắn trực tiếp và nhập mã trong kênh xác minh.",
      ephemeral: true,
    });
  } catch {
    return interaction.reply({
      content:
        '❌ Không thể gửi DM — hãy bật "cho phép tin nhắn trực tiếp" từ thành viên server rồi thử lại.',
      ephemeral: true,
    });
  }
}

/**
 * Nút `verify_confirm` — xác minh + cổng chống alt account (fail-open khi AI lỗi).
 * Cấp role đã xác minh, gỡ role chưa xác minh, gửi DM chào mừng nếu bật.
 */
async function handleVerifyConfirm(store, interaction) {
  const guild = interaction.guild;
  if (!guild) return;
  const config = await store.getConfig(guild.id);
  if (!config?.verifyEnabled) {
    return interaction.reply({ content: "❌ Xác minh đã bị tắt.", ephemeral: true });
  }
  const unverifiedRoleId = config.unverifiedRoleId;
  const verifiedRoleId = config.verifiedRoleId;
  if (!unverifiedRoleId || !verifiedRoleId) {
    return interaction.reply({ content: "❌ Chưa cấu hình role xác minh.", ephemeral: true });
  }
  const member =
    guild.members.cache.get(interaction.user.id) ||
    (await guild.members.fetch(interaction.user.id).catch(() => null));
  if (!member) {
    return interaction.reply({ content: "❌ Không tìm thấy thành viên.", ephemeral: true });
  }
  if (!member.roles.cache.has(unverifiedRoleId)) {
    return interaction.reply({
      content: "❌ Bạn không có role chưa xác minh nên không thể xác minh.",
      ephemeral: true,
    });
  }
  try {
    // === ALT DETECTION AT VERIFY GATE (Double Counter style) ===
    if (config.altDetectionEnabled) {
      try {
        const analysis = await analyzeNewMember(
          member,
          config,
          (guildId) => store.getConfig(guildId),
          store,
        );
        const maxRisk = config.altMaxRiskScore ?? 70;
        if (analysis.riskScore >= maxRisk && analysis.action !== "pass") {
          // Execute punishment instead of verifying
          const punishResult = await executePunishment(member, analysis, config);

          // FIX: Fail-open — if punishment failed, allow verify anyway
          // instead of leaving user stuck (can't verify, can't be punished)
          if (!punishResult.executed) {
            console.log(
              `[verify:alt] ${guild.name}/${member.user.username} — punish FAILED (${punishResult.reason}), allowing verify (fail-open)`,
            );
            // Fall through to normal verify flow
          } else {
            // Đánh dấu đã bị phạt để lần join sau đối chiếu (evasion detect).
            await store.client
              .mutation("altDetection:markJoinPunished", {
                guildId: guild.id,
                userId: member.id,
                action: punishResult.action,
              })
              .catch(() => {});

            // Reply to user with reason
            await interaction
              .reply({
                content: `❌ **Xác minh bị từ chối.** Tài khoản của bạn được đánh giá là có rủi ro cao (**${analysis.riskScore}/100**). Đã xử lý: ${punishResult.action}`,
                ephemeral: true,
              })
              .catch(() => {});

            // Log to mod channel
            const { sendLog } = require("../util");
            const embed = buildRiskEmbed(member, analysis, punishResult);
            embed.setTitle("🚫 Alt Detected at Verify Gate");
            embed.setDescription(
              `<@${member.id}> tried to verify but was blocked as alt account.\n\n` +
                `**Risk Score:** ${analysis.riskScore}/100\n` +
                `**Factors:** ${analysis.riskFactors.join(", ")}`,
            );
            await sendLog(guild, config, embed).catch(() => {});

            // Record as antinuke event
            await store.client
              .mutation("bot_writes:botRecordAntinukeEvent", {
                guildId: guild.id,
                module: "altDetection",
                executorId: member.id,
                executorName: member.user.username,
                action: `${punishResult.action} at verify gate — risk: ${analysis.riskScore}/100 — ${analysis.riskFactors.join(", ")}`,
                count: 1,
                windowSeconds: 60,
                threshold: 1,
                punish: analysis.action,
              })
              .catch(() => {});

            console.log(
              `[verify:alt] ${guild.name}/${member.user.username} BLOCKED at verify — risk=${analysis.riskScore} action=${punishResult.action}`,
            );
            return;
          }
        }
      } catch (e) {
        console.error(`[verify:alt] ${guild.id}:`, e.message);
        // If alt detection fails, still allow verify (fail-open for UX)
      }
    }

    // Normal verify flow
    if (member.roles.cache.has(unverifiedRoleId)) {
      await member.roles.remove(unverifiedRoleId, "Xác minh thành công");
    }
    if (!member.roles.cache.has(verifiedRoleId)) {
      await member.roles.add(verifiedRoleId, "Xác minh thành công");
    }
    await interaction.reply({
      content: "✅ Đã xác minh thành công! Chào mừng bạn đến với server.",
      ephemeral: true,
    });
    // Gửi DM chào mừng nếu bật
    if (config.verifyWelcomeEnabled) {
      try {
        const title = config.verifyWelcomeTitle || "🌸 Chào mừng bạn!";
        let description =
          config.verifyWelcomeDescription ||
          `Chào mừng bạn đến với **${guild.name}**! Bạn đã xác minh thành công.`;
        description = description
          .replace(/{user}/g, `<@${member.id}>`)
          .replace(/{server}/g, guild.name);
        const colorHex = config.verifyWelcomeColor || "#f2629e";
        const colorInt = parseInt(colorHex.replace("#", ""), 16) || 0xf2629e;
        const welcomeEmbed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(description)
          .setColor(colorInt)
          .setThumbnail(guild.iconURL({ size: 256 }) || null)
          .setFooter({ text: guild.name, iconURL: guild.iconURL({ size: 64 }) || undefined });
        await member.send({ embeds: [welcomeEmbed] }).catch(() => {});
      } catch (e) {
        // member có thể tắt DM — bỏ qua im lặng
      }
    }
  } catch (e) {
    console.error(`[verify:button] ${guild.id}:`, e.message);
    if (!interaction.replied) {
      await interaction
        .reply({ content: `❌ Lỗi xác minh: ${e.message}`, ephemeral: true })
        .catch(() => {});
    }
  }
  return;
}

module.exports = { handleVerifyRequestCaptcha, handleVerifyConfirm };
