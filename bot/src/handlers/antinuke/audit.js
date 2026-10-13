"use strict";
/**
 Lớp audit log: handleAttributeEvent + handleAuditEntry + afterStructuralEvent +
 * routeAuditEntry + tickUnlocks/tickHeatResets/handleMessageBulk.
 */
const { AuditLogEvent, Colors, PermissionFlagsBits } = require("discord.js");
const { logEmbed, sendLog } = require("../../util");
const { sendCaseLog } = require("../../caseLog");
const { isLocked, markLocked, unlockGuild } = require("../../lockdown");
const { actionsOf, cleanupMessages } = require("../../moduleActions");
const { emergencyRaidAlert } = require("../incidentReport");
const { alertOwner, createPrivilegedAlert } = require("./ownerAlert");
const {
  MODULE_LABELS,
  isKnownLoggingBot,
  IMMEDIATE_BOT_NUKE,
  BUDGET_MODULES,
  ROLLBACK_MODULES,
  isTrustedBotMember,
  isExempt,
  moduleCfgOf,
} = require("./shared");
const createVandalBudget = require("./vandalBudget");
const createNukeRollback = require("./nukeRollback");

module.exports = function createAntiNukeLayer({ client, store, heat, state, core, ai, raidIntel }) {
  // S4 — ngân sách phá hoại tích lũy per-executor + S3 — rollback từ snapshot.
  const vandalBudget = createVandalBudget();
  const nukeRollback = createNukeRollback({ client, store });

  /**
   * S4+S3 hook chung: ghi ngân sách phá hoại (cách ly khi vượt hạn mức tích lũy
   * trên cả module) và lên lịch rollback cấu trúc từ snapshot. Gọi SAU khi xử
   * phạt xong 1 vụ (fire-and-forget, không chặn pipeline).
   */
  async function afterPunishHooks(guild, config, executor, module) {
    try {
      if (BUDGET_MODULES.has(module) && executor?.id) {
        const count = vandalBudget.note(guild.id, executor.id);
        const member = await guild.members.fetch(executor.id).catch(() => null);
        if (member) {
          const iso = await vandalBudget.maybeIsolate(guild, member, count);
          if (iso.isolated) {
            console.log(`[vandalBudget] ${guild.id}: cách ly ${executor.id} (ngân sách ${count})`);
          }
        }
      }
      if (ROLLBACK_MODULES.has(module)) {
        nukeRollback.scheduleRollback(guild, module, executor?.id);
      }
    } catch (e) {
      console.error(`[antinuke:hooks:${module}]`, e.message);
    }
  }
  const { recordEvent, record, markHandled, wasHandled, auditLookup } = state;
  // Báo owner khi thủ phạm bị miễn (owner/whitelist/admin) — helper dùng chung
  // với các lớp khác để không lệch nhau. Xem ownerAlert.createPrivilegedAlert.
  const alertPrivilegedExecutor = createPrivilegedAlert({ client, store, state });
  const { joiners, lastConfigs, staleUnlockSwept } = state.state;
  const { punishWithHeat, maybeLockdown } = core;
  const { clusterStats } = ai;
  const { huntRaidSource, recordRaidSample } = raidIntel;

  /** Periodically unlock guilds whose lockdown expired or was requested. */
  async function tickUnlocks() {
    const now = Date.now();
    for (const guild of client.guilds.cache.values()) {
      try {
        const config = await store.getConfig(guild.id);
        if (!config) continue;
        const expired = config.lockdownUntil && config.lockdownUntil <= now;
        if (!isLocked(guild.id)) {
          if (expired) {
            // Hết hạn sau khi bot restart: overwrite vẫn còn trên Discord
            // nhưng bot không nhớ — phải markLocked rồi mở khóa để reset.
            // Chi xu ly 1 lan cho moi moc lockdownUntil: khong nho moc nay thi
            // vong quet 20s sau lai thay "expired" -> mo khoa + gui log
            // "Da mo khoa kenh" LAP LAI vo han (spam log o server tung bi khoa).
            const sweptKey = `${guild.id}:expired:${config.lockdownUntil}`;
            if (!staleUnlockSwept.has(sweptKey)) {
              staleUnlockSwept.add(sweptKey);
              markLocked(guild.id);
              await unlockGuild(client, guild, config, store);
            }
          } else if (config.lockdownUntil) {
            // Vẫn đang trong thời gian khóa (restart giữa chừng): nhớ lại trạng thái.
            markLocked(guild.id);
          }
          continue;
        }
        if (config.lockdownRequested || expired) {
          await unlockGuild(client, guild, config, store);
        }
      } catch (err) {
        console.error(`[antinuke:unlock] ${guild.id}:`, err.message);
      }
    }
  }

  /**
   * Dashboard bấm "Xóa nhiệt" → đặt cờ heatResetRequested. Bot xóa nhiệt trong
   * bộ nhớ (và bỏ cảnh báo DM đã gửi) rồi xóa cờ để không reset lại lần sau.
   */
  async function tickHeatResets() {
    for (const guild of client.guilds.cache.values()) {
      try {
        const config = await store.getConfig(guild.id);
        if (!config || !config.heatResetRequested) continue;
        heat.resetGuild(guild.id, config.heatResetUserId || undefined);
        await store.client.mutation("bot_writes:botClearHeatReset", { guildId: guild.id });
        console.log(
          `[heat:reset] ${guild.id} đã xóa nhiệt${config.heatResetUserId ? ` của ${config.heatResetUserId}` : " toàn bộ"}`,
        );
      } catch (err) {
        console.error(`[heat:reset] ${guild.id}:`, err.message);
      }
    }
  }

  async function handleMessageBulk(messages) {
    const guild = messages.first()?.guild;
    await handleAttributeEvent({
      guild,
      module: "massMessageDelete",
      eventType: AuditLogEvent.MessageBulkDelete,
      targetId: null,
      describeTarget: `Xóa ${messages.size} tin nhắn trong kênh <#${messages.first()?.channelId ?? "?"}>`,
    });
  }

  async function handleAttributeEvent({ guild, module, eventType, targetId, describeTarget }) {
    if (!guild || guild.available === false) return;
    const config = await store.getConfig(guild.id);
    if (!config || !config.antinukeEnabled) return;
    lastConfigs.set(guild.id, config);
    const moduleCfg = config.modules.find((m) => m.module === module);
    if (!moduleCfg || !moduleCfg.enabled) return;

    // `auditExecutor` = `auditLookup` + trả executor. Audit log Discord có thể
    // đến trễ vài trăm ms sau sự kiện (giống đường kick ở index.js). Thử lại
    // MỘT lần khi lần đầu chưa truy được thủ phạm nhưng cửa sổ chưa đầy — nếu
    // không, attribution hỏng vĩnh viễn cho sự kiện này và kẻ nuke thoát. Không
    // retry khi ambiguous (cửa sổ 50 entry đã đầy, retry không cải thiện).
    let auditRes = await auditLookup(guild, eventType, targetId);
    if (!auditRes.found && !auditRes.ambiguous) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      auditRes = await auditLookup(guild, eventType, targetId).catch(() => ({
        ok: false,
        found: false,
        ambiguous: true,
        executor: null,
      }));
    }
    const executor = auditRes.executor;
    // `entry.executor` từ audit log là User THÔ — không có roles/permissions,
    // nên isExempt(User) luôn false và admin/mod bị phạt oan ở đường này (đường
    // handleAuditEntry đã fetch member trước nên không dính lỗi tương tự).
    // Phải tra member TRƯỚC khi quyết định miễn trừ.
    const executorMember = executor
      ? await guild.members.fetch(executor.id).catch(() => null)
      : null;
    if (
      executor &&
      (executor.id === client.user.id || isExempt(executorMember ?? executor, moduleCfg, config))
    ) {
      // Owner/whitelist/admin vượt ngưỡng: bot cố ý KHÔNG phạt nhóm này, nhưng
      // hành vi nuke vẫn phải báo owner biết (kẻ có quyền quản lý phá server
      // là tình huống sống còn — owner là người duy nhất gỡ được quyền).
      await alertPrivilegedExecutor(guild, config, executor, module, moduleCfg);
      return; // whitelisted / self — fully ignore
    }
    // Owner + whitelist toàn cục: miễn NGAY CẢ KHI executor là User thô (không có
    // member để isExempt soi roles) — trước đây owner bị ghi sự kiện oan khi
    // fetch member thất bại (cache miss, bot vừa restart).
    if (
      executor &&
      (executor.id === guild.ownerId || (config?.whitelistUsers || []).includes(executor.id))
    ) {
      return;
    }
    // Bỏ qua bot logging/app hợp pháp (Carl-bot, MEE6, Dyno, Wick…): chúng tạo
    // webhook, ban bot spam, purge tin nhắn — công việc moderation/log bình thường,
    // áp dụng cho MỌI module nuke (trước đây chỉ miễn massWebhookCreate nên Carl-bot
    // ban bot raid bị massBan xử lý oan).
    if (isKnownLoggingBot(executor)) {
      return; // bot logging hợp pháp — không phải nuke
    }

    const count = record(guild.id, module, moduleCfg);
    // Bot gây hại: hạ ngưỡng xuống 1 — bot nuke bị xử lý NGAY ở lần đầu,
    // không chờ đủ ngưỡng như người dùng (audit vẫn cho biết thủ phạm là bot).
    // Bot tin cậy (xác minh / đã ở lại server >= 7 ngày — Carl-bot, Dyno, Wick…)
    // làm moderation bình thường → đi theo ngưỡng thường, không bị ban oan.
    // `executorMember` đã tra sẵn ở trên (cần cho quyết định miễn trừ).
    const executorIsHostileBot =
      executor?.bot === true && !isTrustedBotMember(executorMember ?? executor, guild);
    const effectiveThreshold =
      executorIsHostileBot && IMMEDIATE_BOT_NUKE.has(module) ? 1 : moduleCfg.threshold;
    if (executor && count < effectiveThreshold) return;
    if (!executor) return; // can't attribute, can't punish — stay quiet
    // Chong lap: thu pham do da bi xu ly cho cung module o vua roi (audit log
    // thuong fire 2 lan cho 1 hanh vi) -> bo qua, khong phat/log/case them lan nua.
    if (wasHandled(guild.id, module, executor.id)) return;
    markHandled(guild.id, module, executor.id, Math.max(2, moduleCfg.windowSeconds || 10) * 1000);

    let action = "đã ghi nhận";
    let punishCaseNumber;
    let punishChosen;
    const actions = actionsOf(moduleCfg);
    try {
      const member = executorMember;
      const reason = `[Protogon AntiNuke] ${MODULE_LABELS[module]}: ${count} lượt trong ${moduleCfg.windowSeconds}s (ngưỡng ${moduleCfg.threshold})`;
      if (member) {
        const res = await punishWithHeat(guild, member, moduleCfg, reason);
        action = res.action;
        punishCaseNumber = res.caseNumber;
        punishChosen = res.chosen;
      } else if (actions.includes("ban") && executorIsHostileBot) {
        // Chỉ ban executor ngoài server khi chắc chắn là bot gây hại — bot tin cậy
        // (xác minh / ở lại lâu) tạm không fetch được member thì bỏ qua, không ban oan.
        try {
          await guild.members.ban(executor.id, { reason });
          action = "đã ban";
        } catch {
          action = "không thể ban";
        }
      }
      await maybeLockdown(guild, config);
      // purgeMessages: xóa hàng loạt tin nhắn của thủ phạm trên toàn guild (giới hạn).
      // KHÔNG purge khi thủ phạm là bot tin cậy (bot log ghi log qua webhook — purge
      // sẽ xóa sạch log) và luôn bỏ qua tin nhắn của chính bot này.
      if (
        actions.includes("purgeMessages") &&
        !isTrustedBotMember(executorMember ?? executor, guild)
      ) {
        const cleanup = await cleanupMessages({
          guild,
          channel: null,
          userId: executor.id,
          actions: ["purgeMessages"],
          triggerMessage: null,
          skipUserIds: [client.user.id],
        });
        if (cleanup) action = `${action} · ${cleanup}`;
      }
    } catch {
      // KHÔNG ghi đè kết quả phạt đã có. Khóa kênh + dọn tin nằm trong cùng
      // try nên lỗi bước phụ (mất gateway giữa lúc raid) sẽ xoá mất "đã ban"
      // → chủ server đọc log tưởng bot chưa làm gì trong khi thủ phạm đã bị
      // ban. Chỉ khi bản thân bước phạt chưa cho ra kết quả nào mới ghi
      // "không thể xử lý".
      action = action === "đã ghi nhận" ? "không thể xử lý" : `${action} · bước phụ lỗi`;
    }

    await recordEvent(guild.id, {
      module,
      executorId: executor.id,
      executorName: executor.username ?? undefined,
      action,
      count,
      windowSeconds: moduleCfg.windowSeconds,
      threshold: moduleCfg.threshold,
      punish: moduleCfg.punish,
    });

    // S4 ngân sách phá hoại + S3 rollback từ snapshot (fire-and-forget).
    await afterPunishHooks(guild, config, executor, module);

    // Raid Intel: săn nguồn cơn (kẻ chủ mưu) + ghi mẫu dữ liệu huấn luyện.
    try {
      await afterStructuralEvent(guild, config, executor, moduleCfg, { count, action });
    } catch (e) {
      console.error(`[antinuke:${module}:sample]`, e.message);
    }

    const embed = logEmbed({
      title: `🚨 Anti Nuke/Raid: ${MODULE_LABELS[module]}`,
      description: `Đã phát hiện **${count} lượt** trong **${moduleCfg.windowSeconds} giây** (ngưỡng ${moduleCfg.threshold}).`,
      color: Colors.Red,
      fields: [
        { name: "Thủ phạm", value: `<@${executor.id}>`, inline: true },
        { name: "Xử lý", value: action.slice(0, 1000), inline: true },
        { name: "Nguồn", value: "🛡️ Bot tự động phát hiện (anti nuke/raid)", inline: true },
        { name: "Module", value: `\`${module}\``, inline: true },
        ...(describeTarget ? [{ name: "Đối tượng", value: describeTarget, inline: false }] : []),
      ],
      footer: "Protogon · Anti Nuke/Raid",
    });
    await sendLog(guild, config, embed);

    // Gửi embed case log kiểu Carl-bot tới kênh log moderation
    if (punishChosen) {
      try {
        await sendCaseLog({
          guild,
          guildConfig: config,
          action: punishChosen,
          caseNumber: punishCaseNumber,
          offender: { id: executor.id, username: executor.username || executor.id },
          reason: `[AntiNuke] ${MODULE_LABELS[module]}: ${count} lượt/${moduleCfg.windowSeconds}s`,
          executor: null,
        });
      } catch (e) {
        console.error(`[antinuke:${module}:caseLog]`, e.message);
      }
    }
  }

  /**
   * Bot hit-and-run: bot vừa được thêm (BotAdd) rồi TỰ RỜI trong cửa sổ —
   * không có audit kick (loại trường hợp mod/bot khác kick), không phải bot
   * logging hợp pháp, không tin cậy → xử lý qua pipeline chuẩn.
   */

  /** Xử lý sự kiện audit log: tạo webhook / thread hàng loạt (không cần fetch lại). */
  async function handleAuditEntry(entry, guild, module, describeTarget) {
    if (!guild || guild.available === false) return;
    const config = await store.getConfig(guild.id);
    if (!config || !config.antinukeEnabled) return;
    lastConfigs.set(guild.id, config);
    const moduleCfg = moduleCfgOf(config, module);
    if (!moduleCfg || !moduleCfg.enabled) return;
    const executor = entry.executor;
    // adminSelfGrant: chỉ owner / Administrator / adminRoles được miễn — kẻ leo
    // thang đặc quyền thường ĐANG là mod (có quyền Manage Roles) nên không cho
    // modRoles được miễn module này.
    let exempt = false;
    if (executor) {
      if (executor.id === client.user.id) {
        exempt = true;
      } else if (
        executor.id === guild.ownerId ||
        (config?.whitelistUsers || []).includes(executor.id)
      ) {
        // Owner / whitelist toàn cục: miễn ngay cả khi KHÔNG fetch được member
        // (cache miss sau restart, bot ngoài server…) — tránh xử lý oan chủ server
        // khi pipeline không tra được roles để isExempt.
        exempt = true;
      } else if (isKnownLoggingBot(executor)) {
        // Bot logging/app hợp pháp (Carl-bot, MEE6, Dyno, Wick…) làm moderation
        // qua audit entry — công việc bình thường, không phải nuke. KHÔNG free
        // (fetch member sẽ null với bot ngoài server) → guard này bắt tại đây.
        exempt = true;
      } else {
        const em = await guild.members.fetch(executor.id).catch(() => null);
        if (em) {
          if (module === "adminSelfGrant") {
            // Bot tự cấp/quyền admin là vector nuke — KHÔNG miễn cho bot.
            exempt =
              em.id === guild.ownerId ||
              (em.user?.bot !== true && em.permissions.has(PermissionFlagsBits.Administrator)) ||
              (em.user?.bot !== true &&
                (config?.adminRoles || []).some((id) => em.roles.cache.has(id)));
          } else {
            exempt = isExempt(em, moduleCfg, config);
          }
        }
      }
    }
    if (exempt) {
      // Owner/whitelist/admin vượt ngưỡng: bot KHÔNG phạt (tránh phạt oan), nhưng
      // hành vi nuke vẫn phải DM owner — cùng nguyên tắc với handleAttributeEvent.
      // Thiếu nhánh này thì mod có quyền xoá hàng loạt kênh/role sẽ KHÔNG để lại
      // dấu vết nào cho owner (massChannelDelete là vector nuke nghiêm trọng nhất
      // sau massBan và chỉ đi qua đường audit này).
      await alertPrivilegedExecutor(guild, config, executor, module, moduleCfg);
      return;
    }

    const count = record(guild.id, module, moduleCfg);
    // Bot gây hại: hạ ngưỡng xuống 1 — bot nuke bị xử lý NGAY ở lần đầu,
    // không chờ đủ ngưỡng như người dùng (audit vẫn cho biết thủ phạm là bot).
    // Bot gây hại (vừa được thêm vào server): xử lý NGAY ở lần đầu.
    // Bot tin cậy (xác minh / đã ở lại server >= 7 ngày — Carl-bot, Dyno, Wick…)
    // làm moderation bình thường → đi theo ngưỡng thường, không bị ban oan.
    const executorMember = executor
      ? await guild.members.fetch(executor.id).catch(() => null)
      : null;
    const executorIsHostileBot =
      executor?.bot === true && !isTrustedBotMember(executorMember ?? executor, guild);
    const effectiveThreshold =
      executorIsHostileBot && IMMEDIATE_BOT_NUKE.has(module) ? 1 : moduleCfg.threshold;
    if (executor && count < effectiveThreshold) return;
    if (!executor) return;
    // Chong lap (giong handleAttributeEvent): 1 hanh vi = 1 phat + 1 case log.
    if (wasHandled(guild.id, module, executor.id)) return;
    markHandled(guild.id, module, executor.id, Math.max(2, moduleCfg.windowSeconds || 10) * 1000);

    let action = "đã ghi nhận";
    let punishType = null;
    let punishCaseNum = undefined;
    const actions = actionsOf(moduleCfg);
    try {
      const member = executorMember;
      const reason = `[Protogon AntiNuke] ${MODULE_LABELS[module]}: ${count} lượt trong ${moduleCfg.windowSeconds}s (ngưỡng ${moduleCfg.threshold})`;
      if (member) {
        const res = await punishWithHeat(guild, member, moduleCfg, reason);
        action = res.action;
        punishType = res.chosen;
        punishCaseNum = res.caseNumber;
      } else if (actions.includes("ban") && executorIsHostileBot) {
        // Chỉ ban bot gây hại xác nhận — bot tin cậy không bị ban oan.
        try {
          await guild.members.ban(executor.id, { reason });
          action = "đã ban";
        } catch {
          action = "không thể ban";
        }
      }
      await maybeLockdown(guild, config);
      // KHÔNG purge khi thủ phạm là bot tin cậy (giữ nguyên log webhook) +
      // luôn bỏ qua tin nhắn của chính bot này.
      if (
        actions.includes("purgeMessages") &&
        !isTrustedBotMember(executorMember ?? executor, guild)
      ) {
        const cleanup = await cleanupMessages({
          guild,
          channel: null,
          userId: executor.id,
          actions: ["purgeMessages"],
          triggerMessage: null,
          skipUserIds: [client.user.id],
        });
        if (cleanup) action = `${action} · ${cleanup}`;
      }
    } catch {
      // KHÔNG ghi đè kết quả phạt đã có. Khóa kênh + dọn tin nằm trong cùng
      // try nên lỗi bước phụ (mất gateway giữa lúc raid) sẽ xoá mất "đã ban"
      // → chủ server đọc log tưởng bot chưa làm gì trong khi thủ phạm đã bị
      // ban. Chỉ khi bản thân bước phạt chưa cho ra kết quả nào mới ghi
      // "không thể xử lý".
      action = action === "đã ghi nhận" ? "không thể xử lý" : `${action} · bước phụ lỗi`;
    }

    await recordEvent(guild.id, {
      module,
      executorId: executor.id,
      executorName: executor.username ?? undefined,
      action,
      count,
      windowSeconds: moduleCfg.windowSeconds,
      threshold: moduleCfg.threshold,
      punish: moduleCfg.punish,
    });

    // S4 ngân sách phá hoại + S3 rollback từ snapshot (fire-and-forget).
    await afterPunishHooks(guild, config, executor, module);

    // Raid Intel: săn nguồn cơn (kẻ chủ mưu) + ghi mẫu dữ liệu huấn luyện.
    try {
      await afterStructuralEvent(guild, config, executor, moduleCfg, { count, action });
    } catch (e) {
      console.error(`[antinuke:${module}:sample]`, e.message);
    }

    const embed = logEmbed({
      title: `🚨 Anti Nuke/Raid: ${MODULE_LABELS[module]}`,
      description: `Đã phát hiện **${count} lượt** trong **${moduleCfg.windowSeconds} giây** (ngưỡng ${moduleCfg.threshold}).`,
      color: Colors.Red,
      fields: [
        { name: "Thủ phạm", value: `<@${executor.id}>`, inline: true },
        { name: "Xử lý", value: action.slice(0, 1000), inline: true },
        { name: "Nguồn", value: "🛡️ Bot tự động phát hiện (anti nuke/raid)", inline: true },
        { name: "Module", value: `\`${module}\``, inline: true },
        ...(describeTarget ? [{ name: "Đối tượng", value: describeTarget, inline: false }] : []),
      ],
      footer: "Protogon · Anti Nuke/Raid",
    });
    await sendLog(guild, config, embed);

    // BÁO CÁO KHẨN cho các module nuke cấu trúc (ban/kick/xóa kênh hàng loạt…).
    if (IMMEDIATE_BOT_NUKE.has(module) || module === "massJoin") {
      const alertSummary =
        MODULE_LABELS[module] + " — " + count + " lượt trong " + moduleCfg.windowSeconds + "s";
      // DM owner: kênh log kẻ nuke có quyền xoá được — DM thì không. Vụ nuke
      // lớn phải đánh thức chủ server kể cả khi kẻ phá đã dọn log.
      void alertOwner(client, store, {
        guild,
        module,
        summary: alertSummary,
        executorId: executor.id,
        executorName: executor.username,
      });
      emergencyRaidAlert(client, store, guild, {
        summary: alertSummary,
        reason: "[Protogon AntiNuke] " + MODULE_LABELS[module],
        lockdownActive: isLocked(guild.id),
      }).catch(() => {});
    }

    // Gửi embed case log kiểu Carl-bot tới kênh log moderation
    if (punishType) {
      try {
        await sendCaseLog({
          guild,
          guildConfig: config,
          action: punishType,
          caseNumber: punishCaseNum,
          offender: { id: executor.id, username: executor.username || executor.id },
          reason:
            "[AntiNuke] " +
            MODULE_LABELS[module] +
            ": " +
            count +
            " lượt/" +
            moduleCfg.windowSeconds +
            "s",
          executor: null,
        });
      } catch (e) {
        console.error("[antinuke:" + module + ":caseLog]", e.message);
      }
    }
  }

  /**
   * Raid Intel — ghi mẫu huấn luyện + săn nguồn cơn raid sau khi xử lý một vụ
   * phá hoại cấu trúc (audit log). Executor là nghi phạm hàng đầu, gộp cùng cụm
   * tài khoản vào gần đây để tìm acc chủ mưu có liên quan.
   */
  async function afterStructuralEvent(guild, config, executor, moduleCfg, payload) {
    const recentCluster = (joiners.get(guild.id) ?? [])
      .slice(-12)
      .map((j) => ({ id: j.id, joinedAt: j.ts }));
    const sourceHunt = await huntRaidSource(
      guild,
      config,
      recentCluster,
      executor ? [executor] : [],
    );
    await recordRaidSample(guild, config, {
      module: moduleCfg.module,
      count: payload.count,
      windowSeconds: moduleCfg.windowSeconds,
      threshold: moduleCfg.threshold,
      action: payload.action,
      punish: moduleCfg.punish,
      lockdownTriggered: isLocked(guild.id),
      ...clusterStats(recentCluster),
      sourceHunt,
    });
  }

  /**
   * Định tuyến sự kiện audit log mới → module chống nuke/raid. Trả về
   * { module, describeTarget } hoặc null nếu không phải sự kiện cần xử lý.
   */
  async function routeAuditEntry(entry, guild) {
    const t = entry.target;
    const changes = (entry.changes || []).map((c) => c.key);
    switch (entry.action) {
      case AuditLogEvent.WebhookCreate:
        return { module: "massWebhookCreate", describeTarget: `Webhook "${t?.name ?? "?"}"` };
      case AuditLogEvent.ThreadCreate:
        return { module: "massThreadCreate", describeTarget: `Thread "#${t?.name ?? "?"}"` };
      case AuditLogEvent.ThreadDelete:
        return { module: "massThreadDelete", describeTarget: `Xóa thread "#${t?.name ?? "?"}"` };
      case AuditLogEvent.ChannelUpdate: {
        if (changes.includes("permission_overwrites")) {
          return {
            module: "massChannelOverwrite",
            describeTarget: `#${t?.name ?? "?"} — quyền kênh bị thay đổi`,
          };
        }
        if (changes.some((k) => ["name", "position", "topic", "rate_limit_per_user"].includes(k))) {
          return { module: "massChannelRename", describeTarget: `#${t?.name ?? "?"} bị sửa` };
        }
        return null;
      }
      case AuditLogEvent.RoleUpdate:
        return { module: "massRoleEdit", describeTarget: `Role "${t?.name ?? "?"}" bị sửa` };
      case AuditLogEvent.MemberUpdate: {
        if (changes.includes("nick")) {
          return { module: "massNickname", describeTarget: `Biệt danh của <@${t?.id}> bị đổi` };
        }
        return null;
      }
      case AuditLogEvent.MemberRoleUpdate: {
        const addedRoles = (entry.changes || [])
          .filter((c) => c.key === "$add")
          .flatMap((c) => (Array.isArray(c.new) ? c.new.map((r) => r && r.id) : []))
          .filter(Boolean);
        let grantedAdmin = false;
        let adminRoleName = "";
        for (const rid of addedRoles) {
          const role =
            guild.roles.cache.get(rid) ?? (await guild.roles.fetch(rid).catch(() => null));
          if (
            role &&
            (role.permissions.has(PermissionFlagsBits.Administrator) ||
              role.permissions.has(PermissionFlagsBits.ManageGuild) ||
              role.permissions.has(PermissionFlagsBits.ManageRoles))
          ) {
            grantedAdmin = true;
            adminRoleName = role.name;
            break;
          }
        }
        if (grantedAdmin) {
          return {
            module: "adminSelfGrant",
            describeTarget: `Cấp quyền quản trị (role "${adminRoleName}") cho <@${t?.id}>`,
          };
        }
        return { module: "massRoleAssign", describeTarget: `Đổi role của <@${t?.id}>` };
      }
      case AuditLogEvent.EmojiCreate:
      case AuditLogEvent.StickerCreate:
        return {
          module: "massEmoji",
          describeTarget: `Tạo ${entry.action === AuditLogEvent.EmojiCreate ? "emoji" : "sticker"} "${t?.name ?? "?"}"`,
        };
      case AuditLogEvent.BotAdd:
        return { module: "massBotAdd", describeTarget: `Thêm bot ${t?.username ?? "?"}` };
      case AuditLogEvent.InviteCreate:
        return { module: "massInviteCreate", describeTarget: "Tạo link mời mới" };
      case AuditLogEvent.GuildUpdate: {
        // Danh sách key Discord phát khi GUILD_UPDATE. Bản cũ chỉ có key
        // "trang trí" (tên/icon/splash) + mfa/verification nên BỎ SÓT các bước
        // chiếm quyền server: chuyển owner_id (mất trọn server), trỏ
        // system/rules/AFK channel sang kênh của kẻ raid (mọi thành viên mới
        // phải đọc), tắt explicit_content_filter. Cùng hành vi "đổi cấu hình
        // server" mà module guildTamper cấu hình sẵn punish=ban.
        const tampered = changes.filter((k) =>
          [
            "name",
            "description",
            "icon_hash",
            "splash_hash",
            "discovery_splash_hash",
            "banner_hash",
            "mfa_level",
            "verification_level",
            "region",
            "preferred_locale",
            "owner_id",
            "system_channel_id",
            "system_channel_flags",
            "afk_channel_id",
            "afk_timeout",
            "rules_channel_id",
            "public_updates_channel_id",
            "safety_alerts_channel_id",
            "explicit_content_filter",
            "default_message_notifications",
          ].includes(k),
        );
        if (tampered.length > 0) {
          return {
            module: "guildTamper",
            describeTarget: `Đổi cấu hình server (${tampered.join(", ")})`,
          };
        }
        return null;
      }
      default:
        return null;
    }
  }

  /**
   * Vòng 20s: gỡ role cách ly hết hạn (S4). Gọi cạnh tickUnlocks trong attach().
   */
  async function tickVandalReleases() {
    return vandalBudget.tickReleases(client);
  }

  return {
    handleAttributeEvent,
    handleAuditEntry,
    afterStructuralEvent,
    routeAuditEntry,
    handleMessageBulk,
    tickUnlocks,
    tickHeatResets,
    tickVandalReleases,
    vandalBudget,
    nukeRollback,
  };
};
