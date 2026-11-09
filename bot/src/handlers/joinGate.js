const { Colors } = require("discord.js");
const { logEmbed, sendLog } = require("../util");
const { isLocked } = require("../lockdown");
const {
  analyzeNewMember,
  executePunishment,
  buildRiskEmbed,
  trackJoinForBurst,
} = require("../altDetection");

const DAY_MS = 86_400_000;

/**
 * Cổng vào server (Join Gate): chặn selfbot / tài khoản nghi vấn khi tham gia.
 *
 * Các tiêu chí (bật tắt theo cấu hình guild):
 *  - joinGateMinAgeDays    tài khoản phải đủ X ngày tuổi
 *  - joinGateRequireAvatar phải có avatar riêng (không phải mặc định)
 *  - joinGateRequireFlag   phải có ít nhất 1 huy hiệu công khai (selfbot mới thường không có)
 *  - joinGateRaidKick      khi server đang khóa kênh (raid) thì xử lý mọi thành viên mới
 *  - joinGateWhitelist     danh sách ID luôn được vào
 *
 * Alt Detection (mới):
 *  - altDetectionEnabled   bật hệ thống phát hiện alt account
 *  - vpnBlockEnabled       chặn VPN/proxy
 *  - altMinAgeDays         tuổi tối thiểu
 *  - altMaxRiskScore       ngưỡng risk score
 *  - altPunish             hình phạt (kick/ban/timeout/verify)
 */
async function assignUnverifiedRole(client, member, store) {
  let config;
  try {
    config = await store.getConfig(member.guild.id);
  } catch (err) {
    console.error(`[assignUnverified] ${member.guild.id}:`, err.message);
    return;
  }
  // Chỉ gán role unverified khi verify đã được setup ĐẦY ĐỦ:
  // bật verify + có kênh verify + có cả role unverified lẫn role verified.
  // Thiếu bất kỳ thành phần nào → thành viên mới sẽ bị kẹt với role unverified
  // mà không có cách nào xác minh (panel chưa gửi, lệnh setup chưa chạy).
  if (
    !config?.verifyEnabled ||
    !config?.unverifiedRoleId ||
    !config?.verifiedRoleId ||
    !config?.verifyChannelId
  ) {
    return;
  }
  try {
    await member.roles.add(config.unverifiedRoleId, "Xác minh thành viên — role mặc định");
  } catch (err) {
    console.error(`[assignUnverified] ${member.guild.id}:`, err.message);
  }
}

module.exports = async function joinGate(client, member, store) {
  if (!member?.guild || member.user?.bot) return; // chỉ xét tài khoản người thật
  // Gán role unverified nếu verify đang bật
  assignUnverifiedRole(client, member, store).catch((e) =>
    console.error(`[assignUnverified]`, e.message),
  );
  let config;
  try {
    config = await store.getConfig(member.guild.id);
  } catch (err) {
    console.error(`[joinGate] ${member.guild.id}:`, err.message);
    return;
  }
  if (!config) return;

  // ==========================================
  // PART 1: Classic Join Gate (existing logic)
  // ==========================================
  if (config.joinGateEnabled) {
    const whitelist = config.joinGateWhitelist || [];
    if (!whitelist.includes(member.id)) {
      const failures = [];

      // 1) Tuổi tài khoản
      const minAge = config.joinGateMinAgeDays ?? 0;
      if (minAge > 0) {
        const ageDays = (Date.now() - member.user.createdTimestamp) / DAY_MS;
        if (ageDays < minAge) {
          failures.push(
            `tài khoản mới (**${Math.max(0, Math.floor(ageDays))} ngày** < yêu cầu ${minAge} ngày)`,
          );
        }
      }

      // 2) Avatar riêng
      if (config.joinGateRequireAvatar && !member.user.avatar) {
        failures.push("không có avatar riêng (đang dùng avatar mặc định)");
      }

      // 3) Huy hiệu công khai — selfbot thường là tài khoản mới không có bất kỳ flag nào
      if (config.joinGateRequireFlag) {
        const flags = member.user.flags;
        if (!flags || flags.bitfield === 0) {
          failures.push("không có huy hiệu tài khoản (flag = 0)");
        }
      }

      // 4) Đang bị raid → chặn mọi lượt vào
      if (config.joinGateRaidKick && isLocked(member.guild.id)) {
        failures.push("server đang khóa kênh do raid");
      }

      if (failures.length > 0) {
        const punish = config.joinGatePunish === "ban" ? "ban" : "kick";
        const reason = `[Protogon Join Gate] ${failures.join("; ")}`;
        let action;
        try {
          if (punish === "ban") {
            await member.ban({ reason, deleteMessageSeconds: 0 });
            action = "đã ban";
          } else {
            await member.kick(reason);
            action = "đã kick";
          }
        } catch (err) {
          action = `không thể ${punish} (thiếu quyền)`;
          console.error(`[joinGate] ${member.guild.id}:`, err.message);
        }

        // Ghi lại event antinuke
        try {
          await store.client.mutation("bot_writes:botRecordAntinukeEvent", {
            guildId: member.guild.id,
            module: "joinGate",
            executorId: member.id,
            executorName: member.user.username,
            action: `${action} — ${failures.join("; ")}`,
            count: 1,
            windowSeconds: 10,
            threshold: 1,
            punish,
          });
        } catch (err) {
          console.error("[joinGate:record]", err.message);
        }

        const embed = logEmbed({
          title: "🚪 Join Gate: đã chặn thành viên",
          description: `<@${member.id}> vừa tham gia nhưng **không vượt qua cổng vào** và đã bị xử lý.`,
          color: Colors.Red,
          fields: [
            {
              name: "Thành viên",
              value: `<@${member.id}> (${member.user.username})`,
              inline: true,
            },
            {
              name: "Lý do",
              value: failures
                .map((f) => `• ${f}`)
                .join("\n")
                .slice(0, 1000),
              inline: false,
            },
            { name: "Xử lý", value: action, inline: true },
          ],
          footer: "Protogon Join Gate",
        });
        await sendLog(member.guild, config, embed);
        return; // Đã bị chặn, không cần xét tiếp
      }
    }
  }

  // ==========================================
  // PART 2: Alt Account + VPN Detection
  // ==========================================
  if (!config.altDetectionEnabled) return;

  // Check whitelist — user IDs only (role IDs are checked separately below)
  const altWhitelistUsers = config.altWhitelistUsers || [];
  if (altWhitelistUsers.includes(member.id)) return;
  // Check role whitelist
  if (config.altWhitelistRoles?.length) {
    const hasWhitelistedRole = member.roles.cache.some((r) =>
      config.altWhitelistRoles.includes(r.id),
    );
    if (hasWhitelistedRole) return;
  }

  // Also check joinGate whitelist
  const gwWhitelist = config.joinGateWhitelist || [];
  if (gwWhitelist.includes(member.id)) return;

  // Run alt analysis — truyền store để đối chiếu lịch sử join (Convex).
  let analysis;
  try {
    analysis = await analyzeNewMember(member, config, (guildId) => store.getConfig(guildId), store);
  } catch (err) {
    console.error(`[altDetect] ${member.guild.id}/${member.id}:`, err.message);
    return;
  }

  // Record the join in Convex
  try {
    await store.client.mutation("altDetection:recordJoin", {
      guildId: member.guild.id,
      userId: member.id,
      username: member.user.username,
      avatar: member.user.avatar,
      createdAt: member.user.createdTimestamp,
      flags: member.user.flags?.bitfield,
      riskScore: analysis.riskScore,
      riskFactors: analysis.riskFactors,
      strongSignals: analysis.strongSignals?.length ?? 0,
      action: analysis.action,
      isVPN: analysis.isVPN,
      ipCountry: analysis.ipCountry,
      ipOrg: analysis.ipOrg,
    });
  } catch (err) {
    console.error(`[altDetect:record] ${member.guild.id}:`, err.message);
  }

  // Log all joins for monitoring (not just high-risk ones)
  if (analysis.riskScore > 0) {
    console.log(
      `[altDetect] ${member.guild.name}/${member.user.username} risk=${analysis.riskScore} factors=[${analysis.riskFactors.join(",")}] action=${analysis.action}`,
    );
  }

  // Upgrade D: Burst Detection
  try {
    const burst = trackJoinForBurst(member.guild.id, member.id, analysis.riskScore);
    if (burst.burstDetected) {
      console.log(
        `[burst] ${member.guild.name}: BURST DETECTED! ${burst.count} joins, avg risk ${burst.avgRisk}`,
      );
      // Auto-lockdown: dùng CHUNG lockGuild() để chụp quyền trước khi khoá.
      // Trước đây nhánh này tự sửa permissionOverwrites + markLocked() nên
      // không có lockPrev; unlockGuild() thấy thiếu ảnh chụp thì GIỮ NGUYÊN
      // overwrite (đúng nguyên tắc an toàn) ⇒ kênh bị mute vĩnh viễn dù đã
      // hết lockdownMinutes.
      try {
        const { lockGuild } = require("../lockdown");
        const applied = await lockGuild(store.client, member.guild, config, store);
        if (applied) {
          // Notify log channel — embed chi tiết burst (lockGuild đã gửi embed
          // khoá chung kèm số kênh).
          const config2 = await store.getConfig(member.guild.id).catch(() => null);
          if (config2) {
            const { logEmbed, sendLog } = require("../util");
            const { Colors } = require("discord.js");
            const burstEmbed = logEmbed({
              title: "🚨 AUTO-LOCKDOWN: Burst Alt Detection",
              description: `Phát hiện **${burst.count} tài khoản** join trong 10 phút với điểm rủi ro trung bình **${burst.avgRisk}/100**.`,
              color: Colors.DarkRed,
              fields: [
                { name: "Số lượng", value: `${burst.count} tài khoản`, inline: true },
                { name: "Rủi ro TB", value: `${burst.avgRisk}/100`, inline: true },
                {
                  name: "Tài khoản",
                  value: burst.userIds
                    .slice(0, 10)
                    .map((id) => `<@${id}>`)
                    .join(", ")
                    .slice(0, 1000),
                },
              ],
              footer: "Protogon Auto-Lockdown",
            });
            await sendLog(member.guild, config2, burstEmbed);
          }
        }
      } catch (e) {
        console.error(`[burst:lockdown]`, e.message);
      }
    }
  } catch {}

  // Execute punishment if risk exceeds threshold
  let punishResult = null;
  if (analysis.action !== "pass") {
    try {
      punishResult = await executePunishment(member, analysis, config);
    } catch (err) {
      console.error(`[altDetect:punish] ${member.guild.id}/${member.id}:`, err.message);
    }

    // Update the join record with action taken
    if (punishResult?.executed) {
      // Đánh dấu record join đã bị phạt → lần join sau với account khác có thể
      // đối chiếu (rejoin-evasion detection).
      try {
        await store.client.mutation("altDetection:markJoinPunished", {
          guildId: member.guild.id,
          userId: member.id,
          action: punishResult.action,
        });
      } catch (err) {
        console.error(`[altDetect:mark] ${member.guild.id}:`, err.message);
      }
      try {
        // Record as antinuke event for the log
        await store.client.mutation("bot_writes:botRecordAntinukeEvent", {
          guildId: member.guild.id,
          module: "altDetection",
          executorId: member.id,
          executorName: member.user.username,
          action: `${punishResult.action} — risk: ${analysis.riskScore}/100 — ${analysis.riskFactors.join("; ")}`,
          count: 1,
          windowSeconds: 60,
          threshold: 1,
          punish: analysis.action,
        });
      } catch (err) {
        console.error("[altDetect:event]", err.message);
      }

      // Send log embed
      const embed = buildRiskEmbed(member, analysis, punishResult);
      await sendLog(member.guild, config, embed).catch(() => {});
    }
  } else if (analysis.riskScore >= 20) {
    // Low-risk but notable — log it for analytics (don't punish)
    console.log(
      `[altDetect:monitor] ${member.guild.name}/${member.user.username} — risk=${analysis.riskScore}, monitoring only`,
    );
  }
};
