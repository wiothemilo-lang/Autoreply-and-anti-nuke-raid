"use strict";
/**
 External App Guard — chống raid bằng ỨNG DỤNG NGOÀI 3 tầng:
 *   1. handleExternalApp: audit log IntegrationCreate (loạt kết nối app).
 *   2. handleExternalAppMessage: spam do chính app gửi (bot lạ/webhook).
 *   3. handleButtonRaid: spam bấm nút trên tin mồi của app.
 */
const { Colors, UserFlags } = require("discord.js");
const { logEmbed, sendLog } = require("../../util");
const { sendCaseLog, CASE_LABEL } = require("../../caseLog");
const { isLocked } = require("../../lockdown");
const { cleanupMessages } = require("../../moduleActions");
const { emergencyRaidAlert } = require("../incidentReport");
const { alertOwner, createPrivilegedAlert } = require("./ownerAlert");
// Threat intel đã học (đợt 7): mẫu scam mạng bot tự ghi nhận — nạp cho AI xác
// định app raid đối chiếu mẫu đã xác nhận thay vì chỉ đoán trên tín hiệu lẻ.
const { getLearnedThreats } = require("../filters");

function learnedThreatContext() {
  try {
    const t = typeof getLearnedThreats === "function" ? getLearnedThreats() || {} : {};
    const keywords = (t.keywords || []).filter(Boolean);
    const phrases = (t.phrases || []).filter(Boolean);
    if (keywords.length === 0 && phrases.length === 0) return undefined;
    return { keywords, phrases };
  } catch {
    return undefined;
  }
}
const {
  appNameSuspicion,
  normalizeFuzzy,
  isExternalAppTarget,
  componentText,
  buttonRaidSignal,
} = require("../../externalAppGuard");
const {
  MODULE_LABELS,
  KNOWN_LOGGING_BOTS,
  isExempt,
  moduleCfgOf,
  messageFingerprint,
  isExternalAppSpam,
} = require("./shared");

module.exports = function createAntiNukeLayer({ client, store, state, core, ai, raidIntel }) {
  const {
    recordEvent,
    appUserHandledRecently,
    markAppUserHandled,
    recentJoinCount,
    webhookCreator,
  } = state;
  const {
    joiners,
    appEvents,
    appMsgSamples,
    buttonClickEvents,
    lastConfigs,
    lastExtAppProcessedAt,
    buttonRaidHandledAt,
  } = state.state;
  const { punishWithHeat, maybeLockdown } = core;
  const alertPrivilegedExecutor = createPrivilegedAlert({ client, store, state });
  const { aiAnalyzeExternalApp, raidNote } = ai;
  const { huntRaidSource, recordRaidSample } = raidIntel;

  /**
   * Raid bằng ỨNG DỤNG NGOÀI (External App) — phát hiện loạt kết nối integration
   * (external app) trong cửa sổ thời gian. AI nhận diện xem NGƯỜI DÙNG của các
   * app đó có đang raid không: AI khẳng định raid (độ tin cậy >= 0.6) → ban + khóa
   * kênh; còn lại → phạt theo cấu hình (mặc định kick).
   */
  async function handleExternalApp(entry, guild) {
    if (!guild || guild.available === false) return;
    const config = await store.getConfig(guild.id);
    if (!config || !config.antinukeEnabled) return;
    lastConfigs.set(guild.id, config);
    const moduleCfg = moduleCfgOf(config, "externalAppRaid");
    if (!moduleCfg || !moduleCfg.enabled) return;

    const executor = entry.executor;
    let executorFresh = false;
    if (executor) {
      if (executor.id === client.user.id) return;
      const em = await guild.members.fetch(executor.id).catch(() => null);
      if (em) {
        if (isExempt(em, moduleCfg, config)) {
          // Mod/owner nối loạt app: bot không phạt (tránh phạt oan) nhưng KHÔNG
          // được im lặng — externalAppRaid là vector nuke không cần mời bot, và
          // kẻ có quyền xoá được cả kênh log lẫn tự gỡ app. Cùng nguyên tắc với
          // handleAuditEntry/handleAttributeEvent.
          await alertPrivilegedExecutor(guild, config, executor, "externalAppRaid", moduleCfg);
          return;
        }
        // Acc mới < 7 ngày kết nối app = sockpuppet nghi vấn cao (đội quân cài app).
        if (em.user?.createdTimestamp && Date.now() - em.user.createdTimestamp < 7 * 86_400_000) {
          executorFresh = true;
        }
      }
    }
    const target = entry.target;
    // Phân biệt BOT ĐƯỢC MỜI CHÍNH THỨC với EXTERNAL APP: bỏ qua nếu đây là
    //   - kết nối tài khoản thường (twitch/youtube) — không phải đường raid app;
    //   - app có bot user LÀ thành viên server (đã được mời chính thức, kể cả qua
    //     App Directory) — vụ này thuộc module massBotAdd, không phải external app;
    //   - bot xác minh (có tick) — bot hợp lệ của Discord.
    // External app = ứng dụng Discord được kết nối từ ngoài mà KHÔNG có bot user
    // trong server (chỉ có webhook/command) — đúng đường raid "cài app không cần mời bot".
    if (target) {
      const integrationType = target.type;
      const appId = target.application?.id || (target.type === "discord" ? target.id : null);
      let isGuildMember = false;
      let hasVerifiedTick = false;
      if (appId) {
        const m = await guild.members.fetch(appId).catch(() => null);
        isGuildMember = !!m;
        if (!isGuildMember) {
          const u = await guild.client?.users?.fetch(appId).catch(() => null);
          hasVerifiedTick = !!u && u.bot === true && u.flags?.has(UserFlags.VerifiedBot) === true;
        }
      }
      if (!isExternalAppTarget({ integrationType, isGuildMember, hasVerifiedTick })) return;
    }
    const appName =
      (target && (target.name || target.id)) ||
      (entry.changes || []).find((c) => c.key === "name")?.new ||
      "ứng dụng ngoài";

    // Điểm nghi vấn deterministic (chạy ngay cả khi AI offline): tên app đáng ngờ
    // (giả mạo app nổi tiếng / từ khóa scam) + acc kết nối mới + làn sóng thành viên.
    const appSus = appNameSuspicion(appName);
    const joins5m = recentJoinCount(guild.id, 5 * 60_000);
    let suspectScore = appSus.score + (executorFresh ? 3 : 0);
    if (joins5m >= 5) suspectScore += 2;

    const arr = appEvents.get(guild.id) ?? [];
    arr.push({
      ts: Date.now(),
      appName: String(appName).slice(0, 60),
      executorId: executor?.id,
      executorName: executor?.username,
    });
    const cutoff = Date.now() - moduleCfg.windowSeconds * 1000;
    const fresh = arr.filter((e) => e.ts >= cutoff);
    appEvents.set(guild.id, fresh);
    const count = fresh.length;
    // Xử lý khi: vượt ngưỡng kết nối HOẶC 1 kết nối đủ nghi vấn
    // (vd acc mới cài app giả mạo — biến thể raid "1 app độc cài rải rác").
    if (count < moduleCfg.threshold && suspectScore < 4) return;

    // Chống log chồng chặp: đợt kết nối app vừa được xử lý trong cùng cửa sổ →
    // bỏ qua (1 làn sóng kết nối app = 1 vụ; IntegrationCreate kế tiếp không
    // ghi vụ mới). PHẢI đặt TRƯỚC lệnh gọi AI: đặt sau thì mỗi
    // IntegrationCreate tiếp theo trong làn sóng vẫn tốn trọn 1 lượt gọi AI
    // rồi mới bị bỏ — raid thật (kẻ nối hàng chục app trong vài giây) tạo ra
    // hàng chục lượt gọi AI/giây mà kết quả chỉ dùng 1 vụ đầu.
    const lastProc = lastExtAppProcessedAt.get(guild.id);
    if (lastProc && Date.now() - lastProc < moduleCfg.windowSeconds * 1000) return;
    // Đánh dấu NGAY, đồng bộ, TRƯỚC lệch gọi AI. Chỉ đặt sau thì trong lúc bot
    // chờ AI (tới 6s) map vẫn trống: mọi IntegrationCreate đến trong khoảng đó
    // lọt qua check ở trên và mỗi cái đều tốn trọn 1 lượt gọi AI. Raid thật
    // bắn event SONG SONG, không phải tuần tự — đo thật 3 kết nối cùng lúc
    // thì 3 lượt AI cho 1 vụ. Cửa sổ tính từ đầu làn sóng cho đúng nghĩa.
    lastExtAppProcessedAt.set(guild.id, Date.now());

    // AI nhận diện: người dùng app ngoài có đang raid không? (kèm tín hiệu deterministic)
    const profile = `${fresh
      .map(
        (e, i) =>
          `${i + 1}. ${e.appName}${e.executorName ? ` — bởi ${e.executorName}` : " — không xác định được người dùng"}`,
      )
      .join(
        "\n",
      )}\nTín hiệu: tên app đáng ngờ=${appSus.score} (${appSus.parts.join(", ") || "không"}), acc kết nối mới <7 ngày=${executorFresh ? "có" : "không"}, thành viên mới 5 phút gần nhất=${joins5m}, nghi vấn tổng=${suspectScore}`;
    const recentJoins = joiners.get(guild.id)?.length ?? 0;
    const ai = await aiAnalyzeExternalApp(
      guild,
      count,
      moduleCfg.windowSeconds,
      moduleCfg.threshold,
      profile,
      recentJoins,
      {
        knownThreats: learnedThreatContext(),
        evidence: [
          appSus.score > 0
            ? `Tên app đáng ngờ (điểm ${appSus.score}): ${appSus.parts.join(", ") || "không rõ lý do"}`
            : null,
          executorFresh ? "Acc kết nối app mới tạo (< 7 ngày)" : null,
          joins5m >= 5
            ? `Làn sóng thành viên mới: ${joins5m} người vào trong 5 phút gần nhất`
            : null,
          count >= moduleCfg.threshold
            ? `${count} kết nối app trong ${moduleCfg.windowSeconds}s (vượt ngưỡng ${moduleCfg.threshold})`
            : `Chỉ ${count} kết nối (dưới ngưỡng — xử lý vì nghi vấn điểm ${suspectScore})`,
        ],
      },
    );
    // AI khẳng định raid (tin cậy >= 0.6) → ban + khóa. AI kết luận KHÔNG raid
    // (tin cậy >= 0.5) → CHỈ GHI NHẬN, không phạt ai — trước đây ý kiến AI bị bỏ
    // qua khiến người dùng cài app bình thường vẫn bị kick oan. AI offline → chỉ
    // xử lý khi nghi vấn rất cao (>= 6); 2 kết nối app bình thường (không có tín
    // hiệu) đủ ngưỡng thì không phạt ai.
    const aiOffline = !ai || ai.offline === true;
    const aiSaysRaid = ai?.isRaid === true && (ai?.confidence ?? 0) >= 0.6;
    const aiSaysNotRaid =
      ai && ai.offline !== true && ai?.isRaid === false && (ai?.confidence ?? 0) >= 0.5;
    const aiUnknown = ai && ai.offline !== true && ai?.isRaid === null;
    const isRaid = aiSaysRaid || (aiOffline && suspectScore >= 6);
    if (
      aiSaysNotRaid ||
      (aiOffline && suspectScore < 4 && count <= moduleCfg.threshold) ||
      (aiUnknown && suspectScore < 4)
    ) {
      await recordEvent(guild.id, {
        module: "externalAppRaid",
        action: aiSaysNotRaid
          ? `bỏ qua — AI: không raid (${ai?.reason ?? "không đủ tín hiệu"})`
          : "bỏ qua — kết nối app bình thường, không có tín hiệu raid",
        count,
        windowSeconds: moduleCfg.windowSeconds,
        threshold: moduleCfg.threshold,
        punish: "none",
      });
      return;
    }
    const reason = `[Protogon AntiNuke] ${MODULE_LABELS.externalAppRaid}: ${count} app được kết nối trong ${moduleCfg.windowSeconds}s (ngưỡng ${moduleCfg.threshold})${raidNote(ai, isRaid)}`;

    // Những người dùng đã kết nối app trong cửa sổ (bỏ trùng, giới hạn 5).
    const targets = [
      ...new Map(fresh.filter((e) => e.executorId).map((e) => [e.executorId, e])).values(),
    ].slice(0, 5);
    // Bỏ người dùng đã bị tầng khác (audit / tin nhắn app) xử lý trong cửa sổ → không
    // phạt + log trùng; đánh dấu NGAY để tầng còn lại không xử lý tiếp cùng người này.
    const freshTargets = targets.filter(
      (t) => !appUserHandledRecently(guild.id, t.executorId, moduleCfg.windowSeconds * 1000),
    );
    if (freshTargets.length === 0) return;
    for (const t of freshTargets) markAppUserHandled(guild.id, t.executorId);

    // Danh sách app được kết nối trong cửa sổ (bỏ trùng, giới hạn 10) — hiển thị trên dashboard.
    const apps = [];
    for (const e of fresh) {
      if (apps.some((a) => a.appName.toLowerCase() === e.appName.toLowerCase())) continue;
      apps.push({
        appName: e.appName,
        executorName: e.executorName ?? undefined,
        executorId: e.executorId ?? undefined,
      });
      if (apps.length >= 10) break;
    }

    const punished = [];
    const punishedUsers = [];
    let firstPunishedUserId = null;
    let firstPunishedUsername = null;
    for (const t of freshTargets) {
      const member = await guild.members.fetch(t.executorId).catch(() => null);
      if (!member || isExempt(member, moduleCfg, config)) continue;
      let outcome;
      let actionLabel;
      if (isRaid) {
        try {
          await member.ban({ reason });
          outcome =
            ai && ai.offline !== true ? "🚫 đã ban (AI: raid)" : "🚫 đã ban (nghi vấn raid)";
          actionLabel = "ban";
        } catch {
          outcome = "không thể ban";
          actionLabel = "ban thất bại";
        }
      } else {
        const res = await punishWithHeat(guild, member, moduleCfg, reason);
        outcome = res.action;
        actionLabel = res.chosen ?? "xử lý";
      }
      if (!firstPunishedUserId) {
        firstPunishedUserId = t.executorId;
        firstPunishedUsername = t.executorName;
      }
      punished.push(`<@${t.executorId}>: ${outcome}`);
      punishedUsers.push({
        userId: t.executorId,
        username: t.executorName ?? undefined,
        action: String(actionLabel).slice(0, 40),
      });
    }
    const action =
      punished.length > 0
        ? punished.slice(0, 6).join("\n")
        : "chưa xác định được người dùng — chỉ ghi nhận";
    if (isRaid) await maybeLockdown(guild, config);

    await recordEvent(guild.id, {
      module: "externalAppRaid",
      executorId: freshTargets[0]?.executorId ?? targets[0]?.executorId ?? undefined,
      executorName: freshTargets[0]?.executorName ?? targets[0]?.executorName ?? undefined,
      action: `${action}${isRaid ? " (raid)" : ""}`,
      count,
      windowSeconds: moduleCfg.windowSeconds,
      threshold: moduleCfg.threshold,
      punish: isRaid ? "ban" : moduleCfg.punish,
    });

    // Raid Intel: mẫu huấn luyện kèm AI verdict + săn nguồn cơn.
    try {
      const sourceHunt = await huntRaidSource(
        guild,
        config,
        [],
        // Chỉ săn nguồn cơn khi AI xác nhận raid — tránh ban nhầm người dùng
        // kết nối app bình thường khi AI kết luận "individual".
        isRaid
          ? freshTargets
              .filter((t) => t.executorId)
              .map((t) => ({ id: t.executorId, username: t.executorName }))
          : [],
      );
      await recordRaidSample(guild, config, {
        module: "externalAppRaid",
        count,
        windowSeconds: moduleCfg.windowSeconds,
        threshold: moduleCfg.threshold,
        action,
        punish: isRaid ? "ban" : moduleCfg.punish,
        aiClassification: ai ? (isRaid ? "raid" : "individual") : undefined,
        aiConfidence: ai?.confidence,
        aiReason: ai?.reason,
        lockdownTriggered: isLocked(guild.id),
        sourceHunt,
        apps,
        punished: punishedUsers,
      });
    } catch (e) {
      console.error("[antinuke:externalAppRaid:sample]", e.message);
    }

    const embed = logEmbed({
      title: `🚨 Anti Nuke/Raid: ${MODULE_LABELS.externalAppRaid}`,
      description: `**${count}** ứng dụng ngoài được kết nối trong **${moduleCfg.windowSeconds} giây** (ngưỡng ${moduleCfg.threshold}).${raidNote(ai, isRaid)}`,
      color: Colors.Red,
      fields: [
        {
          name: "Kết quả xử lý",
          value: action.slice(0, 1000),
          inline: true,
        },
        { name: "Ứng dụng", value: profile.slice(0, 1000), inline: true },
        { name: "Nguồn", value: "🛡️ Bot tự động phát hiện (anti nuke/raid)", inline: true },
        { name: "Module", value: "`externalAppRaid`", inline: true },
      ],
      footer: "Protogon · Anti Nuke/Raid",
    });
    await sendLog(guild, config, embed, "raid");

    // BÁO CÁO KHẨN: AI quét chat + tổng hợp tình hình → cảnh báo mọi người
    // (chống spam bằng khoảng cách + số sự kiện tối thiểu cấu hình trên web,
    // fire-and-forget). DM owner kèm theo —
    // app raid giả MEE6/Nitro là kỹ thuật tinh vi nhất, chủ server cần biết ngay.
    void alertOwner(client, store, {
      guild,
      module: "externalAppRaid",
      summary: `External app raid — ${count} app trong ${moduleCfg.windowSeconds}s`,
      executorId: executor?.id,
      executorName: executor?.username,
    });
    emergencyRaidAlert(client, store, guild, {
      summary: `External app raid — ${count} app trong ${moduleCfg.windowSeconds}s`,
      reason: reason,
      lockdownActive: isLocked(guild.id),
    }).catch(() => {});

    // Gửi embed case log kiểu Carl-bot tới kênh log moderation (dùng đúng biến local)
    if (firstPunishedUserId) {
      try {
        const caseAction = isRaid ? "ban" : moduleCfg.punish || "kick";
        const caseRec = await store.client
          .mutation("bot_writes:botRecordModAction", {
            guildId: guild.id,
            action:
              (CASE_LABEL[caseAction] || caseAction)
                .replace(/[^\p{L}\p{N}\s]/gu, "")
                .trim()
                .slice(0, 20) || caseAction,
            targetId: firstPunishedUserId,
            targetName: firstPunishedUsername,
            reason:
              "[AntiNuke] " +
              MODULE_LABELS.externalAppRaid +
              ": " +
              count +
              " app/" +
              moduleCfg.windowSeconds +
              "s",
          })
          .catch(() => null);
        await sendCaseLog({
          guild,
          guildConfig: config,
          action: caseAction,
          caseNumber: caseRec?.caseNumber,
          offender: {
            id: firstPunishedUserId,
            username: firstPunishedUsername || firstPunishedUserId,
          },
          reason:
            "[AntiNuke] " +
            MODULE_LABELS.externalAppRaid +
            ": " +
            count +
            " app trong " +
            moduleCfg.windowSeconds +
            "s" +
            (punished.length > 1 ? " (+" + (punished.length - 1) + " người khác)" : ""),
          executor: null,
        });
      } catch (e) {
        console.error("[antinuke:externalAppRaid:caseLog]", e.message);
      }
    }
  }

  /**
   * External App Guard (tầng tin nhắn) — bắt SPAM do chính ứng dụng ngoài gửi vào
   * server (bot lạ / app qua webhook), không cần chờ audit log IntegrationCreate.
   * Phát hiện theo 3 tín hiệu: nội dung lặp giống hệt (kể cả chỉ gửi embed), số tin
   * vượt ngưỡng KÈM link mời Discord, hoặc app gửi quá nhiều tin trong cửa sổ (flood).
   * Xử lý: xóa tin + phạt bot user theo cấu hình / xóa webhook + truy tìm người tạo
   * webhook (audit log) để phạt đúng người dùng đang raid + AI nhận diện raid (ban + lockdown).
   */
  async function handleExternalAppMessage(message) {
    if (!message.guild || message.guild.available === false) return;
    if (message.channel.isDMBased?.()) return;
    const me = client.user?.id;
    if (!me || message.author?.id === me) return;
    // Chỉ xử lý tin đến từ ỨNG DỤNG ngoài: bot khác / webhook. Lệnh app do người
    // dùng bấm có author là người thật → bỏ qua (module spam dành cho người dùng lo).
    const isBot = message.author?.bot === true;
    const isWebhook = !!message.webhookId;
    if (!isBot && !isWebhook) return;
    // BOT USER = bot đã được mời vào server (phải là thành viên mới gửi được tin, kể cả
    // bot có tick xác minh, slash-command response, bot nhạc/leveling...). External app
    // KHÔNG phải thành viên — nó gửi tin qua WEBHOOK. Bỏ qua bot user để không phạt nhầm
    // bot quen thuộc; tầng audit (IntegrationCreate) đã xử lý app kết nối ngoài.
    if (!isExternalAppTarget({ isBot, isWebhook })) return;

    // Whitelist known logging bots (Carl-bot, MEE6, Dyno...) — tạo webhook hợp pháp
    // để ghi log, KHÔNG phải external app raid.
    const webhookName = (message.author?.username || "").toLowerCase();
    if (webhookName && KNOWN_LOGGING_BOTS.some((b) => webhookName.includes(b))) return;

    const config = await store.getConfig(message.guild.id);
    if (!config || !config.antinukeEnabled) return;
    lastConfigs.set(message.guild.id, config);
    const moduleCfg = moduleCfgOf(config, "externalAppRaid");
    if (!moduleCfg || !moduleCfg.enabled) return;

    // Định danh app: ưu tiên applicationId (app) > webhookId (webhook) > bot user id.
    const appId = message.applicationId || message.webhookId || message.author.id;
    if ((config?.whitelistUsers || []).includes(appId)) return;
    if ((config?.whitelistUsers || []).includes(message.author.id)) return;
    const appName = message.author?.username || (message.webhookId ? "webhook" : null) || appId;

    const now = Date.now();
    const key = `${message.guild.id}:${appId}`;
    const arr = appMsgSamples.get(key) ?? [];
    const fp = messageFingerprint(message);
    arr.push({
      fp,
      norm: normalizeFuzzy(fp),
      content: message.content || "",
      ts: now,
      id: message.id,
      channelId: message.channel.id,
    });
    const cutoff = now - moduleCfg.windowSeconds * 1000;
    const fresh = arr.filter((e) => e.ts >= cutoff);
    appMsgSamples.set(key, fresh);
    const count = fresh.length;

    const hay = `${message.content || ""} ${(message.embeds || []).map((e) => e.title || e.description || "").join(" ")} ${componentText(message.components)}`;
    const {
      triggered,
      sameFingerprint,
      similar,
      hasInvite,
      hasShortlink,
      hasEveryone,
      scamHits,
      urlCount,
    } = isExternalAppSpam({
      samples: fresh,
      currentFingerprint: fp,
      count: fresh.length,
      threshold: moduleCfg.threshold,
      hay,
    });
    if (!triggered) return;

    appMsgSamples.delete(key); // reset sau khi xử lý
    const samples = fresh.slice(-8).map((e) => (e.fp || e.content || "").slice(0, 200));
    // Đưa cả tín hiệu nội dung cho AI học hỏi: lặp gần giống, @everyone, link mời,
    // link rút gọn, từ khóa scam, số URL — để AI nhận diện đúng biến thể raid app.
    const hasButtons = (message.components || []).some((row) => (row.components || []).length > 0);
    const signalLine =
      `Tín hiệu nội dung: lặp giống hệt=${sameFingerprint}, lặp gần giống=${similar}, ` +
      `@everyone/@here=${hasEveryone ? "có" : "không"}, link mời Discord=${hasInvite ? "có" : "không"}, ` +
      `link rút gọn=${hasShortlink ? "có" : "không"}, từ khóa scam=${scamHits}, số URL=${urlCount}, ` +
      `nút bấm/menu=${hasButtons ? "có" : "không"}`;
    const profile = `${appName}${isWebhook ? " (webhook)" : " (bot)"}:\n${samples.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n${signalLine}`;
    const ai = await aiAnalyzeExternalApp(
      message.guild,
      count,
      moduleCfg.windowSeconds,
      moduleCfg.threshold,
      profile,
      joiners.get(message.guild.id)?.length ?? 0,
      {
        evidence: [
          sameFingerprint ? `${sameFingerprint} tin giống hệt nhau (engine so fingerprint)` : null,
          similar >= 2 ? `${similar} tin gần giống (fingerprint mờ)` : null,
          hasEveryone ? "Có @everyone/@here" : null,
          hasInvite ? "Có link mời Discord" : null,
          hasShortlink ? "Có link rút gọn (mẫu scam phổ biến)" : null,
          scamHits >= 2 ? `${scamHits} từ khóa scam trong nội dung` : null,
          urlCount >= 3 ? `${urlCount} URL khác nhau (tràn link)` : null,
          hasButtons ? "Tin có nút bấm/menu (mồi tương tác)" : null,
        ],
      },
    );
    // AI khẳng định raid (confidence >= 0.6) HOẶC AI offline mà tín hiệu nội dung quá rõ → raid.
    const aiOffline = !ai || ai.offline === true;
    let contentScore = 0;
    if (similar >= 2) contentScore += 3;
    if (hasEveryone) contentScore += 2;
    if (scamHits >= 2) contentScore += 2;
    if (hasInvite || hasShortlink) contentScore += 2;
    if (urlCount >= 3) contentScore += 1;
    // Tin app đăng kèm NÚT BẤM = "mồi" raid (lừa bấm) — tăng nghi vấn.
    if (hasButtons) contentScore += 2;
    const isRaid =
      (ai?.isRaid === true && (ai?.confidence ?? 0) >= 0.6) || (aiOffline && contentScore >= 6);
    const reason = `[Protogon AntiNuke] ${MODULE_LABELS.externalAppRaid}: app "${appName}" gửi ${count} tin (${sameFingerprint} tin lặp nội dung) trong ${moduleCfg.windowSeconds}s (ngưỡng ${moduleCfg.threshold})${raidNote(ai, isRaid)}`;

    let action = "đã ghi nhận";
    const punished = [];
    const punishedUsers = [];
    const apps = [
      { appName: String(appName).slice(0, 60), executorName: undefined, executorId: appId },
    ];

    // 1) Dọn tin nhắn của app trong kênh này (xóa tin phát hiện + purge theo author).
    const cleanup = await cleanupMessages({
      guild: message.guild,
      channel: message.channel,
      userId: message.author.id,
      actions: ["deleteMessages", "purgeMessages"],
      triggerMessage: message,
    });
    if (cleanup) action = cleanup;

    let responsibleId;
    let responsibleName;
    // Chống log chồng chặp: người dùng app vừa bị tầng audit (IntegrationCreate) xử lý trong
    // cửa sổ → tầng tin nhắn chỉ dọn tin/webhook, không phạt + ghi sự kiện/embed trùng.
    const userHandledWindow = moduleCfg.windowSeconds * 1000;
    // 2) Nếu app là BOT user trong server → phạt theo cấu hình (kick mặc định; AI raid → ban).
    const member = isBot
      ? await message.guild.members.fetch(message.author.id).catch(() => null)
      : null;
    const memberAlreadyHandled = appUserHandledRecently(
      message.guild.id,
      member?.id,
      userHandledWindow,
    );
    if (member && !isExempt(member, moduleCfg, config) && !memberAlreadyHandled) {
      markAppUserHandled(message.guild.id, member.id);
      let outcome;
      let actionLabel;
      if (isRaid) {
        try {
          await member.ban({ reason });
          outcome =
            ai && ai.offline !== true ? "🚫 đã ban (AI: raid)" : "🚫 đã ban (nghi vấn raid)";
          actionLabel = "ban";
        } catch {
          outcome = "không thể ban";
          actionLabel = "ban thất bại";
        }
      } else {
        const res = await punishWithHeat(message.guild, member, moduleCfg, reason);
        outcome = res.action;
        actionLabel = res.chosen ?? "xử lý";
      }
      punished.push(`<@${member.id}>: ${outcome}`);
      punishedUsers.push({
        userId: member.id,
        username: member.user?.username ?? undefined,
        action: String(actionLabel).slice(0, 40),
      });
      action = punished.join("\n");
    } else if (isWebhook) {
      // 3) App chỉ qua webhook (không có bot user) → xóa webhook để chặn app, rồi
      //    truy tìm người tạo webhook (audit log) để phạt đúng người dùng đang raid.
      try {
        const wh = await message.channel.fetchWebhooks();
        const target = wh.find((w) => w.id === message.webhookId);
        if (target) {
          await target.delete(reason);
          action = `${action} · đã xóa webhook của app`;
        }
        const creator = await webhookCreator(message.guild, message.webhookId);
        if (creator && creator.id !== me) {
          responsibleId = creator.id;
          responsibleName = creator.username;
          const cm = await message.guild.members.fetch(creator.id).catch(() => null);
          if (
            cm &&
            !isExempt(cm, moduleCfg, config) &&
            !appUserHandledRecently(message.guild.id, cm.id, userHandledWindow)
          ) {
            markAppUserHandled(message.guild.id, cm.id);
            let outcome;
            let actionLabel;
            if (isRaid) {
              try {
                await cm.ban({ reason });
                outcome =
                  ai && ai.offline !== true
                    ? "🚫 đã ban người dùng kết nối app (AI: raid)"
                    : "🚫 đã ban người dùng kết nối app (nghi vấn raid)";
                actionLabel = "ban";
              } catch {
                outcome = "không thể ban người dùng kết nối app";
                actionLabel = "ban thất bại";
              }
            } else {
              const res = await punishWithHeat(message.guild, cm, moduleCfg, reason);
              outcome = res.action;
              actionLabel = res.chosen ?? "xử lý";
            }
            punished.push(`<@${cm.id}> (người dùng app): ${outcome}`);
            punishedUsers.push({
              userId: cm.id,
              username: cm.user?.username ?? undefined,
              action: String(actionLabel).slice(0, 40),
            });
            action = punished.join("\n");
          } else if (cm && isExempt(cm, moduleCfg, config)) {
            // Người tạo webhook CÓ QUYỀN (owner/admin/whitelist): bot cố ý không
            // phạt để tránh phạt oan, nhưng im lặng thì chủ server mất toàn bộ
            // tín hiệu — kẻ có quyền xoá được cả kênh log. Phải báo owner.
            await alertPrivilegedExecutor(message.guild, config, cm, "externalAppRaid", moduleCfg);
          }
        }
      } catch {
        // thiếu quyền Manage Webhooks — bỏ qua
      }
    }
    if (isRaid) await maybeLockdown(message.guild, config);

    // Người dùng app đã bị tầng kia xử lý trong cửa sổ → tầng này chỉ dọn tin/webhook,
    // không ghi sự kiện + embed trùng (vụ đã được log ở tầng trước).
    const alreadyHandled =
      (member && appUserHandledRecently(message.guild.id, member.id, userHandledWindow)) ||
      (responsibleId && appUserHandledRecently(message.guild.id, responsibleId, userHandledWindow));
    if (punished.length === 0 && alreadyHandled) return;

    await recordEvent(message.guild.id, {
      module: "externalAppRaid",
      executorId: responsibleId ?? appId,
      executorName: responsibleName ?? appName,
      action: `${action}${isRaid ? " (raid)" : ""}`.slice(0, 900),
      count,
      windowSeconds: moduleCfg.windowSeconds,
      threshold: moduleCfg.threshold,
      punish: isRaid ? "ban" : moduleCfg.punish,
    });

    // Raid Intel: mẫu huấn luyện kèm AI verdict + săn nguồn cơn.
    try {
      const sourceHunt = await huntRaidSource(
        message.guild,
        config,
        [],
        // Chỉ săn nguồn cơn khi AI xác nhận raid — tránh ban nhầm người dùng
        // app bình thường khi AI kết luận "individual".
        isRaid && responsibleId
          ? [{ id: responsibleId, username: responsibleName }]
          : isRaid && isBot && member
            ? [{ id: member.id, username: member.user?.username }]
            : [],
      );
      await recordRaidSample(message.guild, config, {
        module: "externalAppRaid",
        count,
        windowSeconds: moduleCfg.windowSeconds,
        threshold: moduleCfg.threshold,
        action,
        punish: isRaid ? "ban" : moduleCfg.punish,
        aiClassification: ai ? (isRaid ? "raid" : "individual") : undefined,
        aiConfidence: ai?.confidence,
        aiReason: ai?.reason,
        lockdownTriggered: isLocked(message.guild.id),
        sourceHunt,
        apps,
        punished: punishedUsers,
      });
    } catch (e) {
      console.error("[antinuke:externalAppRaid:msg:sample]", e.message);
    }

    const embed = logEmbed({
      title: `🚨 Anti Nuke/Raid: ${MODULE_LABELS.externalAppRaid}`,
      description: `Ứng dụng ngoài **${appName}** gửi **${count} tin** (${sameFingerprint} tin lặp nội dung) trong **${moduleCfg.windowSeconds} giây** (ngưỡng ${moduleCfg.threshold}).${raidNote(ai, isRaid)}`,
      color: Colors.Red,
      fields: [
        {
          name: "Kết quả xử lý",
          value: (action || "đã ghi nhận").slice(0, 1000),
          inline: true,
        },
        { name: "Ứng dụng", value: `${appName} (\`${appId}\`)`, inline: true },
        { name: "Kênh", value: `<#${message.channel.id}>`, inline: true },
        { name: "Nguồn", value: "🛡️ Bot tự động phát hiện (anti nuke/raid)", inline: true },
        { name: "Module", value: "`externalAppRaid`", inline: true },
      ],
      footer: "Protogon · Anti Nuke/Raid",
    });
    await sendLog(message.guild, config, embed, "raid");

    // BÁO CÁO KHẨN CHO OWNER: đường raid "cài app không cần mời bot" hay đi qua
    // TẦNG NÀY (app spam tin) chứ không qua tầng IntegrationCreate. Không DM thì
    // kẻ xoá được kênh log là chủ server không biết gì — đúng lớp lỗi đã vá ở
    // audit.js/externalApp tầng trên.
    if (isRaid) {
      void alertOwner(client, store, {
        guild: message.guild,
        module: "externalAppRaid",
        summary: `App "${appName}" gửi ${count} tin lặp trong ${moduleCfg.windowSeconds}s (đã dọn tin)`,
        executorId: responsibleId ?? member?.id,
        executorName: responsibleName ?? appName,
      });
    }
    // Thủ phạm là owner/admin/whitelist mà bot CỐ Ý không phạt (tránh phạt oan)
    // → phải báo, im lặng là mất toàn bộ tín hiệu.
    if (member && isExempt(member, moduleCfg, config)) {
      await alertPrivilegedExecutor(message.guild, config, member, "externalAppRaid", moduleCfg);
    }
  }

  /**
   * Chống raid bằng NÚT BẤM (button spam) của app ngoài: app được kết nối từ ngoài
   * (gửi tin qua WEBHOOK, không cần mời bot vào server) đăng tin có nút bấm làm
   * "mồi"; kẻ raid spam bấm nút để kích hoạt hành động của app (spam tin, gán role,
   * mời, DM...), hoặc một làn sóng người bấm cùng 1 tin app trong cửa sổ. Phát hiện:
   *   - spamClicker: CÙNG 1 người bấm >= 4 lần trong cửa sổ → phạt kẻ spam bấm;
   *   - clickFlood: tổng lượt bấm >= ngưỡng trong cửa sổ → xóa tin mồi + khóa kênh.
   * Mọi trường hợp đều xóa tin mồi chứa nút bấm + ghi sự kiện externalAppRaid.
   */
  async function handleButtonRaid(interaction) {
    if (!interaction.isMessageComponent?.()) return;
    if (!interaction.inGuild?.() || !interaction.guild || interaction.guild.available === false)
      return;
    const msg = interaction.message;
    if (!msg || !msg.components || msg.components.length === 0) return;
    // Chỉ quan tâm tin của APP NGOÀI thực sự: tin qua WEBHOOK (app kết nối từ ngoài,
    // KHÔNG có bot user là thành viên — đúng đường raid "cài app không cần mời bot").
    // Nút bấm của BOT đã được mời vào server (role picker, mini-game...) là hợp lệ,
    // không soi — tránh phạt nhầm như fix phân biệt bot mời chính thức trước đó.
    if (!msg.webhookId) return;

    const config = await store.getConfig(interaction.guild.id);
    if (!config || !config.antinukeEnabled) return;
    lastConfigs.set(interaction.guild.id, config);
    const moduleCfg = moduleCfgOf(config, "externalAppRaid");
    if (!moduleCfg || !moduleCfg.enabled) return;

    const appId = msg.webhookId;
    if ((config?.whitelistUsers || []).includes(appId)) return;

    const now = Date.now();
    const key = `${interaction.guild.id}:${msg.id}`;
    const bucket = buttonClickEvents.get(key) ?? {
      appId,
      channelId: msg.channel?.id,
      clicks: [],
    };
    bucket.clicks.push({ userId: interaction.user.id, ts: now });
    const cutoff = now - moduleCfg.windowSeconds * 1000;
    const fresh = bucket.clicks.filter((c) => c.ts >= cutoff);
    bucket.clicks = fresh;
    buttonClickEvents.set(key, bucket);

    const totalClicks = fresh.length;
    const sameUserClicks = fresh.filter((c) => c.userId === interaction.user.id).length;
    const signal = buttonRaidSignal({
      totalClicks,
      sameUserClicks,
      threshold: moduleCfg.threshold,
    });
    if (!signal.triggered) return;
    buttonClickEvents.delete(key); // reset sau khi xử lý

    // Debounce: vụ bấm nút trên tin này đã được xử lý trong cửa sổ → bỏ qua hẳn
    // (minigame đông người sẽ kích hoạt lại bucket liên tục — tránh gọi AI + ghi
    // event lặp mỗi lượt bấm).
    const lastBtnHandled = buttonRaidHandledAt.get(key);
    if (lastBtnHandled && Date.now() - lastBtnHandled < moduleCfg.windowSeconds * 1000) return;
    buttonRaidHandledAt.set(key, Date.now());

    const appName = msg.author?.username || (msg.webhookId ? "webhook" : null) || appId;

    // CHỐNG KHÓA KÊNH NGẤY: làn sóng bấm nút còn phải qua AI. Minigame/giveaway
    // thật (nhiều user bấm nút vui) là hiện tượng bình thường — chỉ xử lý khi AI
    // xác nhận đây là mồi raid (tin cậy >= 0.6). AI offline/không rõ → chỉ xử lý
    // kẻ spam bấm lặp lại (>= 4 lượt cùng 1 người), KHÔNG khóa kênh chỉ vì đông người bấm.
    const clickProfile = `App "${appName}" (webhook ${appId}) — tin có nút bấm được ${totalClicks} lượt bấm trong ${moduleCfg.windowSeconds}s (${sameUserClicks} lượt cùng 1 người, ${new Set(fresh.map((c) => c.userId)).size} người khác nhau).`;
    const clickAi = await aiAnalyzeExternalApp(
      interaction.guild,
      totalClicks,
      moduleCfg.windowSeconds,
      moduleCfg.threshold,
      clickProfile,
      joiners.get(interaction.guild.id)?.length ?? 0,
      {
        evidence: [
          `${totalClicks} lượt bấm trong ${moduleCfg.windowSeconds}s`,
          `${new Set(fresh.map((c) => c.userId)).size} người dùng khác nhau bấm cùng tin`,
          sameUserClicks >= 4 ? `1 người bấm lặp ${sameUserClicks} lần (spam bấm)` : null,
        ],
      },
    );
    const clickAiRaid = clickAi?.isRaid === true && (clickAi?.confidence ?? 0) >= 0.6;
    const clickAiNotRaid =
      clickAi &&
      clickAi.offline !== true &&
      clickAi.isRaid === false &&
      (clickAi?.confidence ?? 0) >= 0.5;
    if (clickAiNotRaid || (clickAiRaid === false && !clickAiNotRaid && !signal.spamClicker)) {
      // AI không xác nhận raid → chỉ ghi nhận, không phạt, không khóa kênh.
      await recordEvent(interaction.guild.id, {
        module: "externalAppRaid",
        action: `bỏ qua — bấm nút bình thường (${totalClicks} lượt trên tin app)${clickAi?.reason ? ` · AI: ${clickAi.reason}` : ""}`,
        count: totalClicks,
        windowSeconds: moduleCfg.windowSeconds,
        threshold: moduleCfg.threshold,
        punish: "none",
      });
      return;
    }

    const reason = `[Protogon AntiNuke] ${MODULE_LABELS.externalAppRaid}: nút bấm spam trên tin app "${appName}" (${totalClicks} lượt bấm trong ${moduleCfg.windowSeconds}s, ${sameUserClicks} lượt cùng người)${raidNote(clickAi, clickAiRaid)}`;

    let action = "đã ghi nhận";
    // 1) Xóa tin mồi chứa nút bấm — chặn làn sóng bấm tiếp.
    if (msg.deletable) {
      try {
        await msg.delete(reason);
        action = "đã xóa tin mồi (nút bấm)";
      } catch {
        action = "không xóa được tin mồi";
      }
    }

    const punished = [];
    const punishedUsers = [];
    // 2) Kẻ spam bấm (cùng 1 người bấm liên tục) → phạt theo cấu hình (kick mặc định).
    if (signal.spamClicker) {
      const clicker = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (
        clicker &&
        !isExempt(clicker, moduleCfg, config) &&
        !appUserHandledRecently(interaction.guild.id, clicker.id, moduleCfg.windowSeconds * 1000)
      ) {
        markAppUserHandled(interaction.guild.id, clicker.id);
        const res = await punishWithHeat(interaction.guild, clicker, moduleCfg, reason);
        punished.push(`<@${clicker.id}> (spam bấm nút): ${res.action}`);
        punishedUsers.push({
          userId: clicker.id,
          username: clicker.user?.username ?? undefined,
          action: String(res.chosen ?? "xử lý").slice(0, 40),
        });
        action = punished.join("\n");
      } else if (clicker && isExempt(clicker, moduleCfg, config)) {
        // Kẻ spam bấm CÓ QUYỀN (owner/admin/whitelist): bot cố ý không phạt để
        // tránh phạt oan — im lặng thì chủ server mất toàn bộ tín hiệu (kẻ này
        // xoá được cả kênh log). Báo owner TRƯỚC khi return sớm bên dưới.
        await alertPrivilegedExecutor(
          interaction.guild,
          config,
          clicker,
          "externalAppRaid",
          moduleCfg,
        );
      }
    }
    // 3) Làn sóng bấm (nhiều người bấm cùng 1 tin app) → khóa kênh CHỈ khi AI
    //    xác nhận raid (tránh khóa kênh oan minigame/giveaway khi AI offline).
    if (signal.clickFlood && clickAiRaid) {
      await maybeLockdown(interaction.guild, config);
      action = `${action} · làn sóng bấm nút (${totalClicks} lượt)`;
    }
    if (punished.length === 0 && !signal.clickFlood) return;

    await recordEvent(interaction.guild.id, {
      module: "externalAppRaid",
      executorId: signal.spamClicker ? interaction.user.id : undefined,
      executorName: signal.spamClicker ? interaction.user.username : undefined,
      action: action.slice(0, 900),
      count: totalClicks,
      windowSeconds: moduleCfg.windowSeconds,
      threshold: moduleCfg.threshold,
      punish: signal.spamClicker ? moduleCfg.punish : "none",
    });

    // Raid Intel: ghi mẫu huấn luyện (raider = người spam bấm, nếu xác định được).
    try {
      await recordRaidSample(interaction.guild, config, {
        module: "externalAppRaid",
        count: totalClicks,
        windowSeconds: moduleCfg.windowSeconds,
        threshold: moduleCfg.threshold,
        action,
        punish: signal.spamClicker ? moduleCfg.punish : "none",
        aiClassification: clickAiRaid ? "raid" : undefined,
        lockdownTriggered: isLocked(interaction.guild.id),
        apps: [
          { appName: String(appName).slice(0, 60), executorName: undefined, executorId: appId },
        ],
        punished: punishedUsers,
      });
    } catch (e) {
      console.error("[antinuke:externalAppRaid:btn:sample]", e.message);
    }

    const embed = logEmbed({
      title: `🚨 Anti Nuke/Raid: ${MODULE_LABELS.externalAppRaid}`,
      description: `Phát hiện **nút bấm spam** trên tin của ứng dụng ngoài **${appName}**: **${totalClicks} lượt bấm** (${sameUserClicks} lượt cùng người) trong **${moduleCfg.windowSeconds} giây**.`,
      color: Colors.Red,
      fields: [
        {
          name: "Kết quả xử lý",
          value: action.slice(0, 1000),
          inline: true,
        },
        { name: "Ứng dụng", value: `${appName} (\`${appId}\`)`, inline: true },
        { name: "Kênh", value: `<#${msg.channel?.id ?? "?"}>`, inline: true },
        { name: "Nguồn", value: "🛡️ Bot tự động phát hiện (anti nuke/raid)", inline: true },
        { name: "Module", value: "`externalAppRaid`", inline: true },
      ],
      footer: "Protogon · Anti Nuke/Raid",
    });
    await sendLog(interaction.guild, config, embed);
    // Raid nút bấm đã bị AI khẳng định → DM owner. Chỉ báo khi AI chắc chắn
    // (không phải mọi làn sóng bấm) để không spam DM mỗi lượt bấm.
    if (clickAiRaid) {
      void alertOwner(client, store, {
        guild: interaction.guild,
        module: "externalAppRaid",
        summary: `Nút bấm raid trên tin app "${appName}" — ${totalClicks} lượt bấm trong ${moduleCfg.windowSeconds}s`,
        executorId: signal.spamClicker ? interaction.user.id : undefined,
        executorName: signal.spamClicker ? interaction.user.username : undefined,
      });
    }
  }

  return { handleExternalApp, handleExternalAppMessage, handleButtonRaid };
};
