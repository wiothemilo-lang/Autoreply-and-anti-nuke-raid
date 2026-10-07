import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getUserByToken, canManageGuild, guildAccessibleBy } from "./auth";
import { requireBotKeyStrict } from "./botAuth";
import { hiddenPasswordIsSet, isBotOwnerUser } from "./hidden";
import { clampReportMinEvents, clampReportMinIntervalMinutes } from "./reports";
import {
  ANTI_NUKE_MODULES,
  HEAT_DEFAULTS,
  LOCKDOWN_DEFAULTS,
  MODULE_HEAT_DEFAULTS,
  WARN_STRIKE_DEFAULTS,
  isModerationModule,
} from "./modules";
// —— Đợt #5 tách file 99KB: thân hàm các nhóm dưới nằm ở `convex/guilds/*`,
// wrapper + validator giữ nguyên tại đây để hợp đồng tên không đổi. ——
import { updateSettingsArgs, updateSettingsHandler } from "./guilds/updateSettings";
import {
  exportGuildConfigArgs,
  exportGuildConfigHandler,
  importGuildConfigArgs,
  importGuildConfigHandler,
} from "./guilds/configPortability";
import {
  generateGreetingImageUploadUrlArgs,
  generateGreetingImageUploadUrlHandler,
  saveGreetingImageArgs,
  saveGreetingImageHandler,
  removeGreetingImageArgs,
  removeGreetingImageHandler,
} from "./guilds/greetingImages";
import {
  botListGuildIdsArgs,
  botListGuildIdsHandler,
  botGuildGoneArgs,
  botGuildGoneHandler,
  botGuildStatsArgs,
  botGuildStatsHandler,
  botHeartbeatArgs,
  botHeartbeatHandler,
  syncChannelsArgs,
  syncChannelsHandler,
  syncRolesArgs,
  syncRolesHandler,
  syncEmojisArgs,
  syncEmojisHandler,
} from "./guilds/botGuilds";

/** Decay a stored heat value by the guild's per-minute decay rate. */
function decayHeat(heat: number, updatedAt: number, decayPerMin: number, now = Date.now()) {
  const elapsedMin = (now - updatedAt) / 60000;
  return Math.max(0, Math.round(heat - elapsedMin * decayPerMin));
}

/**
 * Top nhiệt của guild, đã trừ decay tới bây giờ. Mỗi dòng trả về là cặp nhất
 * quán (heat, updatedAt): `heat` đúng TẠI `updatedAt` = thời điểm query chạy.
 * Dashboard (HeatBar) trừ decay tiếp theo mốc này để số nhiệt giảm sống khi
 * đang mở trang — nếu trả lại `updatedAt` gốc của hàng thì cùng một đoạn thời
 * gian bị trừ decay HAI lần (server rồi client).
 */
async function loadHeatStates(
  ctx: { db: import("./_generated/server").DatabaseReader },
  guildId: string,
  decayPerMin: number,
) {
  const now = Date.now();
  const raw = await ctx.db
    .query("heatStates")
    .withIndex("by_guildId_heat", (q) => q.eq("guildId", guildId))
    .order("desc")
    .take(15);
  return raw
    .map((h) => ({
      userId: h.userId,
      username: h.username,
      heat: decayHeat(h.heat, h.updatedAt, decayPerMin, now),
      updatedAt: now,
      warnStrikes: h.warnStrikes ?? 0,
    }))
    .filter((h) => h.heat > 0 || h.warnStrikes > 0);
}

export const listMine = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await getUserByToken(ctx, token);
    if (!user) return null;
    // TỐI ƯU (audit Convex): index by_botInGuild — hot-path mở dashboard.
    const all = await ctx.db
      .query("guilds")
      .withIndex("by_botInGuild", (q) => q.eq("botInGuild", true))
      .collect();
    // Chỉ hiện server bot đang đứng trong (server đã xóa/kick bot sẽ tự biến mất).
    return all
      .filter((g) => guildAccessibleBy(user, g))
      .map((g) => ({
        discordId: g.discordId,
        name: g.name,
        icon: g.icon ?? null,
        memberCount: g.memberCount ?? null,
        prefix: g.prefix,
        antinukeEnabled: g.antinukeEnabled,
        botInGuild: g.botInGuild,
        lastHeartbeat: g.lastHeartbeat ?? null,
      }));
  },
});

export const getGuild = query({
  args: { token: v.string(), guildId: v.string() },
  handler: async (ctx, { token, guildId }) => {
    const user = await getUserByToken(ctx, token);
    if (!user) return null;
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild || !canManageGuild(user, guild)) return null;
    const autoReplies = await ctx.db
      .query("autoReplies")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .collect();
    const modules = await ctx.db
      .query("antinukeModules")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .collect();
    const channels = await ctx.db
      .query("guildChannels")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .collect();
    const roles = await ctx.db
      .query("guildRoles")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .collect();
    // Emoji tuỳ chỉnh của server — panel welcome/goodbye dùng làm picker chèn emoji.
    const emojis = await ctx.db
      .query("guildEmojis")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .collect();
    const decayPerMin = guild.heatDecayPerMin ?? HEAT_DEFAULTS.decayPerMin;
    const heatStates = await loadHeatStates(ctx, guildId, decayPerMin);
    const safetyPercent = Math.max(0, Math.min(100, 100 - (heatStates[0]?.heat ?? 0)));
    const botStatus = await ctx.db
      .query("botStatus")
      .withIndex("by_kind", (q) => q.eq("kind", "status"))
      .first();
    const ownerDiscordId = botStatus?.ownerDiscordId;
    const isBotOwner = isBotOwnerUser(user, botStatus);
    const panels = (
      await ctx.db
        .query("reactionRolePanels")
        .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
        .collect()
    ).sort((a, b) => b.createdAt - a.createdAt);
    const giveaways = (
      await ctx.db
        .query("giveaways")
        .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
        .collect()
    )
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 30);
    const modActions = await ctx.db
      .query("modActions")
      .withIndex("by_guildId_createdAt", (q) => q.eq("guildId", guildId))
      .order("desc")
      .take(30);
    return {
      guild: {
        discordId: guild.discordId,
        name: guild.name,
        icon: guild.icon ?? null,
        memberCount: guild.memberCount ?? null,
        prefix: guild.prefix,
        logChannelId: guild.logChannelId ?? null,
        logLang: guild.logLang ?? "vi",
        modLogChannelId: guild.modLogChannelId ?? null,
        punishNoticeChannelId: guild.punishNoticeChannelId ?? null,
        punishNotice: {
          ban: guild.punishNotice?.ban ?? "full",
          timeout: guild.punishNotice?.timeout ?? "full",
          kick: guild.punishNotice?.kick ?? "full",
          warn: guild.punishNotice?.warn ?? "full",
        },
        whitelistUsers: guild.whitelistUsers ?? [],
        whitelistRoles: guild.whitelistRoles ?? [],
        // Cổng mật khẩu ẩn là TOÀN CỤC (thuộc chủ bot, không thuộc server này) →
        // mọi server đều báo cùng trạng thái, không còn cảnh server có mật khẩu
        // thì khoá còn server khác thì mở toang.
        hiddenPasswordSet: await hiddenPasswordIsSet(ctx),
        isBotOwner,
        botOwnerSet: !!ownerDiscordId,
        theme: guild.theme ?? "graphite",
        backupAutoDays: guild.backupAutoDays ?? 0,
        // Quy tắc giữ bản: panel Backup đọc 2 field này để hiện đúng cài đặt đang
        // áp dụng (mặc định 3 bản, không dọn theo tuổi).
        backupKeepCount: guild.backupKeepCount ?? 3,
        backupKeepDays: guild.backupKeepDays ?? 0,
        lastBackupAt: guild.lastBackupAt ?? null,
        restoreRolesEnabled: guild.restoreRolesEnabled ?? true,
        restoreChannelsEnabled: guild.restoreChannelsEnabled ?? true,
        restoreMessagesEnabled: guild.restoreMessagesEnabled ?? true,
        restoreEmojisEnabled: guild.restoreEmojisEnabled ?? true,
        restoreMetaEnabled: guild.restoreMetaEnabled ?? true,
        // Mặc định TẮT: cấm người + mở link mời là hành động không hoàn tác được.
        restoreExtrasEnabled: guild.restoreExtrasEnabled ?? false,
        // Mặc định TẮT: xoá kênh sẵn có cũng không hoàn tác được.
        restoreClearChannelsEnabled: guild.restoreClearChannelsEnabled ?? false,
        raidHuntEnabled: guild.raidHuntEnabled ?? true,
        raidHuntBanSuspects: guild.raidHuntBanSuspects ?? true,
        rollbackEnabled: guild.rollbackEnabled ?? true,
        modRoles: guild.modRoles,
        adminRoles: guild.adminRoles,
        antinukeEnabled: guild.antinukeEnabled,
        automodEnabled: guild.automodEnabled ?? guild.antinukeEnabled,
        botInGuild: guild.botInGuild,
        lastHeartbeat: guild.lastHeartbeat ?? null,
        // Lúc dashboard ghi cấu hình — web dùng để báo "đang gửi/đã gửi cho
        // bot" thay vì im lặng (xem src/lib/syncState.ts). Không phải mốc bot
        // đã áp dụng: phía bot chưa ghi tín hiệu ngược lại.
        settingsChangedAt: guild.settingsChangedAt ?? null,
        // Đọc từ LOCKDOWN_DEFAULTS thay vì gõ lại `true`/`5`: bản trước gõ
        // lại nên hằng số trong modules.ts không ai dùng (dead) và sửa default
        // ở một chỗ là lệch ngay chỗ kia.
        lockdownEnabled: guild.lockdownEnabled ?? LOCKDOWN_DEFAULTS.enabled,
        lockdownMinutes: guild.lockdownMinutes ?? LOCKDOWN_DEFAULTS.minutes,
        lockdownUntil: guild.lockdownUntil ?? null,
        lockdownRequested: guild.lockdownRequested ?? false,
        dailyReportEnabled: guild.dailyReportEnabled ?? true,
        lastReportAt: guild.lastReportAt ?? null,
        emergencyAlertEnabled: guild.emergencyAlertEnabled ?? true,
        // Chính sách báo cáo khẩn — kẹp về biên như `updateSettings`, không trả
        // giá trị thô: document sửa tay hay dữ liệu cũ cũng không làm web hiển
        // thị số vô lý (0 phút = báo liên tục) rồi người dùng tưởng bot hỏng.
        reportMinIntervalMin: clampReportMinIntervalMinutes(guild.reportMinIntervalMin),
        reportMinEvents: clampReportMinEvents(guild.reportMinEvents),
        logPingEveryone: guild.logPingEveryone ?? true,
        badWords: guild.badWords ?? [],
        // Welcome/Goodbye + Autorole — panel WelcomePanel đọc TRỰC TIẾP các field này
        // từ `data.guild`. Thiếu ở đây (bug thật 23/09) thì dashboard luôn hiển thị
        // trạng thái rỗng: công tắc trông như không bật được, kênh/nội dung đã lưu
        // không hiện ra, và mỗi lượt bấm "Lưu cài đặt" lại ghi đè bằng chuỗi rỗng →
        // bot không bao giờ gửi lời chào. Danh sách này PHẢI khớp `GuildData.guild`
        // trong src/lib/types.ts — test-guild-panel-contract.cjs chốt hạ.
        welcomeEnabled: guild.welcomeEnabled ?? false,
        welcomeChannelId: guild.welcomeChannelId ?? null,
        welcomeMessage: guild.welcomeMessage ?? null,
        welcomeUseEmbed: guild.welcomeUseEmbed ?? true,
        goodbyeEnabled: guild.goodbyeEnabled ?? false,
        goodbyeChannelId: guild.goodbyeChannelId ?? null,
        goodbyeMessage: guild.goodbyeMessage ?? null,
        goodbyeUseEmbed: guild.goodbyeUseEmbed ?? true,
        welcomeRandom: guild.welcomeRandom ?? null,
        goodbyeRandom: guild.goodbyeRandom ?? null,
        welcomeDmEnabled: guild.welcomeDmEnabled ?? false,
        welcomeDmMessage: guild.welcomeDmMessage ?? null,
        welcomeEmbedTitle: guild.welcomeEmbedTitle ?? null,
        welcomeEmbedColor: guild.welcomeEmbedColor ?? null,
        welcomeEmbedImage: guild.welcomeEmbedImage ?? null,
        welcomeEmbedThumbnail: guild.welcomeEmbedThumbnail ?? null,
        goodbyeEmbedTitle: guild.goodbyeEmbedTitle ?? null,
        goodbyeEmbedColor: guild.goodbyeEmbedColor ?? null,
        goodbyeEmbedImage: guild.goodbyeEmbedImage ?? null,
        goodbyeEmbedThumbnail: guild.goodbyeEmbedThumbnail ?? null,
        autoroleEnabled: guild.autoroleEnabled ?? false,
        autoroleRoleId: guild.autoroleRoleId ?? null,
        autoroleDelaySec: guild.autoroleDelaySec ?? 0,
        autoroleIncludeBots: guild.autoroleIncludeBots ?? false,
        // Thẻ ảnh v3 — panel đọc trực tiếp từ `data.guild` (xem test-guild-panel-contract).
        welcomeCardEnabled: guild.welcomeCardEnabled ?? false,
        welcomeCardBackground: guild.welcomeCardBackground ?? null,
        goodbyeCardEnabled: guild.goodbyeCardEnabled ?? false,
        goodbyeCardBackground: guild.goodbyeCardBackground ?? null,
        heatEnabled: guild.heatEnabled ?? HEAT_DEFAULTS.enabled,
        heatDecayPerMin: decayPerMin,
        heatWarnAt: guild.heatWarnAt ?? HEAT_DEFAULTS.warnAt,
        heatTimeoutAt: guild.heatTimeoutAt ?? HEAT_DEFAULTS.timeoutAt,
        heatKickAt: guild.heatKickAt ?? HEAT_DEFAULTS.kickAt,
        heatBanAt: guild.heatBanAt ?? HEAT_DEFAULTS.banAt,
        joinGateEnabled: guild.joinGateEnabled ?? false,
        joinGateMinAgeDays: guild.joinGateMinAgeDays ?? 0,
        joinGateRequireAvatar: guild.joinGateRequireAvatar ?? false,
        joinGateRequireFlag: guild.joinGateRequireFlag ?? false,
        joinGateRaidKick: guild.joinGateRaidKick ?? false,
        joinGatePunish: guild.joinGatePunish ?? "kick",
        joinGateWhitelist: guild.joinGateWhitelist ?? [],
        heatRepeatMultiplier: guild.heatRepeatMultiplier ?? HEAT_DEFAULTS.repeatMultiplier,
        heatRepeatWindowMin: guild.heatRepeatWindowMin ?? HEAT_DEFAULTS.repeatWindowMin,
        warnStrikeLimit: guild.warnStrikeLimit ?? WARN_STRIKE_DEFAULTS.limit,
        warnStrikeWindowMin: guild.warnStrikeWindowMin ?? WARN_STRIKE_DEFAULTS.windowMin,
        warnStrikePunish: guild.warnStrikePunish ?? WARN_STRIKE_DEFAULTS.punish,
        safetyPercent,
        verifyEnabled: guild.verifyEnabled ?? false,
        verifyMethod: guild.verifyMethod ?? "button",
        verifyChannelId: guild.verifyChannelId ?? null,
        unverifiedRoleId: guild.unverifiedRoleId ?? null,
        verifiedRoleId: guild.verifiedRoleId ?? null,
        verifyWelcomeEnabled: guild.verifyWelcomeEnabled ?? false,
        verifyWelcomeTitle: guild.verifyWelcomeTitle ?? null,
        verifyWelcomeDescription: guild.verifyWelcomeDescription ?? null,
        verifyWelcomeColor: guild.verifyWelcomeColor ?? null,
        verifySendPanel: guild.verifySendPanel ?? false,
        /** Lỗi gửi panel xác minh gần nhất (bot báo lại — web hiển thị thay vì im lặng). */
        verifyPanelError: guild.verifyPanelError ?? null,
        verifyPanelErrorAt: guild.verifyPanelErrorAt ?? null,
        /** Lỗi gửi DM trực tiếp gần nhất (bot báo lại — web hiển thị thay vì im lặng). */
        dmError: guild.dmError ?? null,
        dmErrorAt: guild.dmErrorAt ?? null,
        // ═══ TICKET / KHIẾU NẠI ═══ (panel TicketPanel đọc 8 field này)
        ticketEnabled: guild.ticketEnabled ?? false,
        ticketCategoryId: guild.ticketCategoryId ?? null,
        ticketStaffRoleId: guild.ticketStaffRoleId ?? null,
        ticketMaxOpen: guild.ticketMaxOpen ?? 20,
        ticketCooldownHours: guild.ticketCooldownHours ?? 24,
        ticketDmOnBan: guild.ticketDmOnBan ?? true,
        ticketDefaultKind: guild.ticketDefaultKind ?? "support",
        ticketPanelChannelId: guild.ticketPanelChannelId ?? null,
        ticketSendPanel: guild.ticketSendPanel ?? false,
        ticketPanelError: guild.ticketPanelError ?? null,
        ticketPanelErrorAt: guild.ticketPanelErrorAt ?? null,
        ticketOpenPanelTitle: guild.ticketOpenPanelTitle ?? null,
        ticketOpenPanelText: guild.ticketOpenPanelText ?? null,
        ticketOpenPanelColor: guild.ticketOpenPanelColor ?? null,
        ticketShowAppealButton: guild.ticketShowAppealButton ?? true,
        ticketDmOnOpen: guild.ticketDmOnOpen ?? true,
        ticketOpenNote: guild.ticketOpenNote ?? null,
        ticketCloseNote: guild.ticketCloseNote ?? null,
        ticketIdleHours: guild.ticketIdleHours ?? 24,
        ticketCloseGraceHours: guild.ticketCloseGraceHours ?? 24,
        ticketPanelText: guild.ticketPanelText ?? "",
        ticketPingRoleIds: guild.ticketPingRoleIds ?? [],
        ticketChannelTemplate: guild.ticketChannelTemplate ?? "",
        ticketChannelPublic: guild.ticketChannelPublic ?? false,
        ticketSlowmodeSec: guild.ticketSlowmodeSec ?? 0,
        ticketMessageBudget: guild.ticketMessageBudget ?? 0,
        ticketCategoryPerKind: guild.ticketCategoryPerKind ?? false,
      },
      heatStates,
      modules: modules.map((m) => ({
        module: m.module,
        enabled: m.enabled,
        threshold: m.threshold,
        windowSeconds: m.windowSeconds,
        punish: m.punish,
        actions: m.actions && m.actions.length > 0 ? m.actions : [m.punish],
        whitelistRoles: m.whitelistRoles,
        heat: m.heat ?? MODULE_HEAT_DEFAULTS[m.module] ?? 10,
      })),
      channels: channels.map((c) => ({
        channelId: c.channelId,
        name: c.name,
        type: c.type,
      })),
      roles: roles.map((r) => ({
        roleId: r.roleId,
        name: r.name,
        color: r.color,
        position: r.position,
      })),
      // Emoji tuỳ chỉnh — panel tự dựng mã `<:name:id>` / `<a:name:id>` khi chèn.
      emojis: emojis
        .map((e) => ({ emojiId: e.emojiId, name: e.name, animated: e.animated }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      /**
       * Khả năng vẽ thẻ ảnh chào của MÁY CHỦ BOT (không thuộc server nào) — bot tự
       * báo qua `status:reportCardCapability`. `null` = chưa báo (bản cũ/chưa khởi
       * động lại) → panel KHÔNG được kết luận là hỏng.
       */
      botCardReady: botStatus?.cardReady ?? null,
      botCardReason: botStatus?.cardUnavailableReason ?? null,
      // TÍNH NĂNG ẨN — chỉ trả cho CHỦ BOT (lỗ hổng cũ: mọi manager xem được,
      // trong khi API tạo/xóa lại chỉ cho owner → dữ liệu lệch trạng thái + lộ nội dung).
      panels: isBotOwner
        ? panels.map((p) => ({
            _id: p._id,
            channelId: p.channelId,
            label: p.label,
            description: p.description ?? null,
            thumbnailUrl: p.thumbnailUrl ?? null,
            entries: p.entries,
            messageId: p.messageId ?? "",
            postError: p.postError ?? null,
            postErrorAt: p.postErrorAt ?? null,
            enabled: p.enabled,
            createdAt: p.createdAt,
          }))
        : [],
      modActions: modActions.map((m) => ({
        _id: m._id,
        action: m.action,
        targetId: m.targetId ?? null,
        targetName: m.targetName ?? null,
        executorId: m.executorId ?? null,
        executorName: m.executorName ?? null,
        reason: m.reason ?? null,
        details: m.details ?? null,
        caseNumber: m.caseNumber ?? null,
        createdAt: m.createdAt,
      })),
      giveaways: isBotOwner
        ? giveaways.map((g) => ({
            _id: g._id,
            channelId: g.channelId,
            title: g.title,
            prize: g.prize,
            winnerCount: g.winnerCount,
            durationMinutes: g.durationMinutes,
            endsAt: g.endsAt,
            dmWinners: g.dmWinners,
            requiredRoleId: g.requiredRoleId ?? null,
            prizeRoleId: g.prizeRoleId ?? null,
            template: g.template ?? "default",
            message: g.message ?? null,
            imageUrl: g.imageUrl ?? null,
            endMessage: g.endMessage ?? null,
            status: g.status,
            messageId: g.messageId ?? "",
            postError: g.postError ?? null,
            postErrorAt: g.postErrorAt ?? null,
            endError: g.endError ?? null,
            endErrorAt: g.endErrorAt ?? null,
            entriesCount: g.entries.length,
            winners: g.winners,
            createdAt: g.createdAt,
          }))
        : [],
      // Auto-reply là tính năng ẩn (botCreate khi setup) → chỉ owner xem được.
      autoReplies: isBotOwner
        ? autoReplies.map((r) => ({
            _id: r._id,
            name: r.name,
            triggerType: r.triggerType,
            keywords: r.keywords,
            response: r.response,
            channels: r.channels,
            cooldownSeconds: r.cooldownSeconds,
            enabled: r.enabled,
            createdAt: r.createdAt,
          }))
        : [],
    };
  },
});

/** Lightweight config bundle that the Discord bot fetches per guild. */
export const getBotConfig = query({
  args: {
    guildId: v.string(),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, guildId }) => {
    await requireBotKeyStrict(ctx, botKey);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild) return null;
    const autoReplies = (
      await ctx.db
        .query("autoReplies")
        .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
        .collect()
    ).filter((a) => a.enabled);
    const modules = await ctx.db
      .query("antinukeModules")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .collect();
    const decayPerMin = guild.heatDecayPerMin ?? HEAT_DEFAULTS.decayPerMin;
    const heatStates = await loadHeatStates(ctx, guildId, decayPerMin);
    const safetyPercent = Math.max(0, Math.min(100, 100 - (heatStates[0]?.heat ?? 0)));
    const giveaways = await ctx.db
      .query("giveaways")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .order("desc")
      .take(20);
    // Loại ticket: chỉ lấy loại ĐANG BẬT, đã sắp theo `order` chủ server chọn.
    // Sắp tay vì index `by_guildId` chỉ có `guildId` → `order()` của Convex là
    // thứ tự scan, không phải thứ tự hiển thị (panel nhảy loạn).
    const kinds = (
      await ctx.db
        .query("ticketKinds")
        .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
        .collect()
    )
      .filter((k) => k.enabled !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt)
      .map((k) => ({
        key: k.key,
        label: k.label,
        description: k.description ?? null,
        emoji: k.emoji ?? null,
        color: k.color ?? null,
        question: k.question ?? null,
        questionPlaceholder: k.questionPlaceholder ?? null,
        evidenceQuestion: k.evidenceQuestion ?? null,
        staffRoleIds: k.staffRoleIds ?? [],
        fields: k.fields ?? [],
      }));
    return {
      prefix: guild.prefix,
      logChannelId: guild.logChannelId ?? null,
      modLogChannelId: guild.modLogChannelId ?? null,
      punishNoticeChannelId: guild.punishNoticeChannelId ?? null,
      punishNotice: {
        ban: guild.punishNotice?.ban ?? "full",
        timeout: guild.punishNotice?.timeout ?? "full",
        kick: guild.punishNotice?.kick ?? "full",
        warn: guild.punishNotice?.warn ?? "full",
      },
      whitelistUsers: guild.whitelistUsers ?? [],
      whitelistRoles: guild.whitelistRoles ?? [],
      modRoles: guild.modRoles,
      adminRoles: guild.adminRoles,
      antinukeEnabled: guild.antinukeEnabled,
      // Fallback về antinukeEnabled cho guild chưa có field: hành vi bot giữ
      // nguyên, UI hiển thị đúng trạng thái đang chạy cho tới khi chủ server
      // bật/tắt cổng Auto-mod riêng.
      automodEnabled: guild.automodEnabled ?? guild.antinukeEnabled,
      lockdownEnabled: guild.lockdownEnabled ?? true,
      lockdownMinutes: guild.lockdownMinutes ?? 5,
      lockdownUntil: guild.lockdownUntil ?? null,
      lockdownRequested: guild.lockdownRequested ?? false,
      dailyReportEnabled: guild.dailyReportEnabled ?? true,
      emergencyAlertEnabled: guild.emergencyAlertEnabled ?? true,
      // Bot đọc qua getBotConfig (TTL cache 30 phút) — thiếu ở đây thì hai knob
      // trên dashboard báo "đã lưu" mà bot vẫn chạy mặc định (bug thật 23/09).
      reportMinIntervalMin: clampReportMinIntervalMinutes(guild.reportMinIntervalMin),
      reportMinEvents: clampReportMinEvents(guild.reportMinEvents),
      logPingEveryone: guild.logPingEveryone ?? true,
      // Welcome/Goodbye — bot gửi chào/tạm biệt theo config dashboard.
      welcomeEnabled: guild.welcomeEnabled ?? false,
      welcomeChannelId: guild.welcomeChannelId ?? null,
      welcomeMessage: guild.welcomeMessage ?? null,
      welcomeUseEmbed: guild.welcomeUseEmbed ?? true,
      goodbyeEnabled: guild.goodbyeEnabled ?? false,
      goodbyeChannelId: guild.goodbyeChannelId ?? null,
      goodbyeMessage: guild.goodbyeMessage ?? null,
      goodbyeUseEmbed: guild.goodbyeUseEmbed ?? true,
      // Welcome/Goodbye v2 — bot đọc từ getConfig (guilds:botGetConfig đọc raw doc).
      welcomeRandom: guild.welcomeRandom ?? null,
      goodbyeRandom: guild.goodbyeRandom ?? null,
      welcomeDmEnabled: guild.welcomeDmEnabled ?? false,
      welcomeDmMessage: guild.welcomeDmMessage ?? null,
      welcomeEmbedTitle: guild.welcomeEmbedTitle ?? null,
      welcomeEmbedColor: guild.welcomeEmbedColor ?? null,
      welcomeEmbedImage: guild.welcomeEmbedImage ?? null,
      welcomeEmbedThumbnail: guild.welcomeEmbedThumbnail ?? null,
      goodbyeEmbedTitle: guild.goodbyeEmbedTitle ?? null,
      goodbyeEmbedColor: guild.goodbyeEmbedColor ?? null,
      goodbyeEmbedImage: guild.goodbyeEmbedImage ?? null,
      goodbyeEmbedThumbnail: guild.goodbyeEmbedThumbnail ?? null,
      autoroleEnabled: guild.autoroleEnabled ?? false,
      autoroleRoleId: guild.autoroleRoleId ?? null,
      autoroleDelaySec: guild.autoroleDelaySec ?? 0,
      autoroleIncludeBots: guild.autoroleIncludeBots ?? false,
      // Thẻ ảnh v3 — bot đọc từ getBotConfig để tự vẽ PNG.
      welcomeCardEnabled: guild.welcomeCardEnabled ?? false,
      welcomeCardBackground: guild.welcomeCardBackground ?? null,
      goodbyeCardEnabled: guild.goodbyeCardEnabled ?? false,
      goodbyeCardBackground: guild.goodbyeCardBackground ?? null,
      restoreRolesEnabled: guild.restoreRolesEnabled ?? true,
      restoreChannelsEnabled: guild.restoreChannelsEnabled ?? true,
      restoreMessagesEnabled: guild.restoreMessagesEnabled ?? true,
      restoreEmojisEnabled: guild.restoreEmojisEnabled ?? true,
      // BUG THẬT: hai cờ này bot ĐỌC (backupRestore.js: cfg?.restoreMetaEnabled
      // !== false, cfg?.restoreExtrasEnabled === true) nhưng getBotConfig KHÔNG
      // trả ⇒ bot luôn dùng mặc định. Hệ quả người dùng thấy: tắt "khôi phục
      // tên/mô tả/icon" mà bot vẫn đổi tên + icon server; bật "khôi phục ban +
      // link mời" mà bot không cấm ai (và bật xong vẫn KHÔNG có tác dụng cho
      // tới khi query này trả đúng field).
      restoreMetaEnabled: guild.restoreMetaEnabled ?? true,
      restoreExtrasEnabled: guild.restoreExtrasEnabled ?? false,
      // Cờ mới: xoá kênh sẵn có trước khi khôi phục (mặc định TẮT).
      restoreClearChannelsEnabled: guild.restoreClearChannelsEnabled ?? false,
      lastReportAt: guild.lastReportAt ?? null,
      raidHuntEnabled: guild.raidHuntEnabled ?? true,
      raidHuntBanSuspects: guild.raidHuntBanSuspects ?? true,
      rollbackEnabled: guild.rollbackEnabled ?? true,
      badWords: guild.badWords ?? [],
      // Trần punish tự động/phút — actionBudget.js đọc field này; preset ghi vào
      // DB nhưng nếu query không trả về thì bot luôn dùng mặc định (20).
      actionBudgetPerMinute: guild.actionBudgetPerMinute ?? 20,
      heatEnabled: guild.heatEnabled ?? HEAT_DEFAULTS.enabled,
      heatDecayPerMin: decayPerMin,
      heatWarnAt: guild.heatWarnAt ?? HEAT_DEFAULTS.warnAt,
      heatTimeoutAt: guild.heatTimeoutAt ?? HEAT_DEFAULTS.timeoutAt,
      heatKickAt: guild.heatKickAt ?? HEAT_DEFAULTS.kickAt,
      heatBanAt: guild.heatBanAt ?? HEAT_DEFAULTS.banAt,
      safetyPercent,
      heatResetRequested: guild.heatResetRequested ?? false,
      heatResetUserId: guild.heatResetUserId ?? null,
      joinGateEnabled: guild.joinGateEnabled ?? false,
      joinGateMinAgeDays: guild.joinGateMinAgeDays ?? 0,
      joinGateRequireAvatar: guild.joinGateRequireAvatar ?? false,
      joinGateRequireFlag: guild.joinGateRequireFlag ?? false,
      joinGateRaidKick: guild.joinGateRaidKick ?? false,
      joinGatePunish: guild.joinGatePunish ?? "kick",
      joinGateWhitelist: guild.joinGateWhitelist ?? [],
      heatRepeatMultiplier: guild.heatRepeatMultiplier ?? HEAT_DEFAULTS.repeatMultiplier,
      heatRepeatWindowMin: guild.heatRepeatWindowMin ?? HEAT_DEFAULTS.repeatWindowMin,
      warnStrikeLimit: guild.warnStrikeLimit ?? WARN_STRIKE_DEFAULTS.limit,
      warnStrikeWindowMin: guild.warnStrikeWindowMin ?? WARN_STRIKE_DEFAULTS.windowMin,
      warnStrikePunish: guild.warnStrikePunish ?? WARN_STRIKE_DEFAULTS.punish,
      dmRequested: guild.dmRequested ?? false,
      dmTargetUserId: guild.dmTargetUserId ?? null,
      dmTargetUsername: guild.dmTargetUsername ?? null,
      dmMessage: guild.dmMessage ?? null,
      backupAutoDays: guild.backupAutoDays ?? 0,
      verifyEnabled: guild.verifyEnabled ?? false,
      verifyMethod: guild.verifyMethod ?? "button",
      verifyChannelId: guild.verifyChannelId ?? null,
      unverifiedRoleId: guild.unverifiedRoleId ?? null,
      verifiedRoleId: guild.verifiedRoleId ?? null,
      verifyWelcomeEnabled: guild.verifyWelcomeEnabled ?? false,
      verifyWelcomeTitle: guild.verifyWelcomeTitle ?? null,
      verifyWelcomeDescription: guild.verifyWelcomeDescription ?? null,
      verifyWelcomeColor: guild.verifyWelcomeColor ?? null,
      verifySendPanel: guild.verifySendPanel ?? false,
      // Alt account + VPN detection — bot cần đủ các field này để joinGate chạy
      altDetectionEnabled: guild.altDetectionEnabled ?? false,
      vpnBlockEnabled: guild.vpnBlockEnabled ?? false,
      altMinAgeDays: guild.altMinAgeDays ?? 7,
      altMaxRiskScore: guild.altMaxRiskScore ?? 70,
      altPunish: guild.altPunish ?? "kick",
      altTimeoutMinutes: guild.altTimeoutMinutes ?? 60,
      altWhitelistRoles: guild.altWhitelistRoles ?? [],
      altWhitelistUsers: guild.altWhitelistUsers ?? [],
      altSimilarityThreshold: guild.altSimilarityThreshold ?? 70,
      altJoinWindowMinutes: guild.altJoinWindowMinutes ?? 5,
      altVpnMode: guild.altVpnMode ?? "off",
      altSafeMode: guild.altSafeMode ?? true,
      // ═══ TICKET ═══ (bot đọc từ bundle cache → bắt buộc có đường tín hiệu)
      ticketEnabled: guild.ticketEnabled ?? false,
      ticketCategoryId: guild.ticketCategoryId ?? null,
      ticketStaffRoleId: guild.ticketStaffRoleId ?? null,
      ticketMaxOpen: guild.ticketMaxOpen ?? 20,
      ticketCooldownHours: guild.ticketCooldownHours ?? 24,
      ticketDmOnBan: guild.ticketDmOnBan ?? true,
      ticketDefaultKind: guild.ticketDefaultKind ?? "support",
      // Kênh dán panel + cờ chờ dán: bot đọc để dựng panel, và cache config phải
      // rút TTL ngắn khi cờ đang chờ (xem hasPending trong bot/src/convex.js) —
      // nếu không, bấm "Gửi panel" xong phải đợi tới 30 phút mới thấy.
      ticketPanelChannelId: guild.ticketPanelChannelId ?? null,
      ticketSendPanel: guild.ticketSendPanel ?? false,
      ticketPanelMessageId: guild.ticketPanelMessageId ?? null,
      ticketOpenPanelTitle: guild.ticketOpenPanelTitle ?? null,
      ticketOpenPanelText: guild.ticketOpenPanelText ?? null,
      ticketOpenPanelColor: guild.ticketOpenPanelColor ?? null,
      ticketShowAppealButton: guild.ticketShowAppealButton ?? true,
      ticketDmOnOpen: guild.ticketDmOnOpen ?? true,
      ticketOpenNote: guild.ticketOpenNote ?? null,
      ticketCloseNote: guild.ticketCloseNote ?? "",
      ticketIdleHours: guild.ticketIdleHours ?? 24,
      ticketCloseGraceHours: guild.ticketCloseGraceHours ?? 24,
      ticketPanelText: guild.ticketPanelText ?? "",
      ticketPingRoleIds: guild.ticketPingRoleIds ?? [],
      heatStates,
      autoReplies,
      giveaways: giveaways.map((g) => ({
        title: g.title,
        status: g.status,
        endsAt: g.endsAt,
        entries: g.entries,
      })),
      /**
       * Loại ticket tuỳ chỉnh (29/09/2026). Rỗng → bot dùng 2 loại cứng cũ
       * (`defaultTicketKinds` trong ticketCore.js), nên server chưa cấu hình
       * gì thì hành vi y như trước.
       *
       * ⚠️ PHẢI viết dạng `ticketKinds: …`, không dùng shorthand `ticketKinds,`:
       * `scripts/test-convex-arg-contract.cjs` quét field bot đọc bằng regex
       * `^\s*(ten):` nên shorthand không lọt vào tập `returned` → hồi quy "bot
       * đọc field không có trong getBotConfig" sẽ báo nhầm mỗi lần chạy.
       * Vị trí cũng phải TRƯỚC khối `modules:` (script cắt tới đó).
       */
      ticketKinds: kinds,
      ticketChannelTemplate: guild.ticketChannelTemplate ?? "",
      ticketChannelPublic: guild.ticketChannelPublic ?? false,
      ticketSlowmodeSec: guild.ticketSlowmodeSec ?? 0,
      ticketMessageBudget: guild.ticketMessageBudget ?? 0,
      ticketCategoryPerKind: guild.ticketCategoryPerKind ?? false,
      modules: modules.map((m) => ({
        module: m.module,
        enabled: m.enabled,
        threshold: m.threshold,
        windowSeconds: m.windowSeconds,
        punish: m.punish,
        actions: m.actions && m.actions.length > 0 ? m.actions : [m.punish],
        whitelistRoles: m.whitelistRoles,
        heat: m.heat ?? MODULE_HEAT_DEFAULTS[m.module] ?? 10,
      })),
    };
  },
});

/**
 * Cấu hình server từ dashboard → patch + tín hiệu settingsChangedAt.
 * Thân hàm ở `guilds/updateSettings.ts` (đợt #5 tách file 99KB); tên function
 * + validator giữ nguyên để hợp đồng bot ⇄ Convex không đổi. Cổng
 * `check-settings-signal.cjs` vẫn kiểm tín hiệu trong thân helper (quét đệ quy).
 */
export const updateSettings = mutation({
  args: updateSettingsArgs,
  handler: updateSettingsHandler,
});

/**
 * Xuất/nạp cấu hình server (JSON) — thân hàm ở `guilds/configPortability.ts`
 * (đợt #5 tách file). Tên + validator giữ nguyên cho dashboard/bot.
 */
export const exportGuildConfig = query({
  args: exportGuildConfigArgs,
  handler: exportGuildConfigHandler,
});

export const importGuildConfig = mutation({
  args: importGuildConfigArgs,
  handler: importGuildConfigHandler,
});

/** Ảnh thẻ chào welcome/goodbye — thân hàm ở `guilds/greetingImages.ts` (đợt #5). */
export const generateGreetingImageUploadUrl = mutation({
  args: generateGreetingImageUploadUrlArgs,
  handler: generateGreetingImageUploadUrlHandler,
});

/** Lưu ảnh vào ô banner/thumbnail — thân hàm ở `guilds/greetingImages.ts`. */
export const saveGreetingImage = mutation({
  args: saveGreetingImageArgs,
  handler: saveGreetingImageHandler,
});

/** Xoá ảnh khỏi một ô + dọn storage — thân hàm ở `guilds/greetingImages.ts`. */
export const removeGreetingImage = mutation({
  args: removeGreetingImageArgs,
  handler: removeGreetingImageHandler,
});

export const updateLockdown = mutation({
  args: {
    token: v.string(),
    guildId: v.string(),
    enabled: v.optional(v.boolean()),
    minutes: v.optional(v.number()),
  },
  handler: async (ctx, { token, guildId, enabled, minutes }) => {
    const user = await getUserByToken(ctx, token);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild || !canManageGuild(user, guild))
      throw new Error("Không có quyền quản lý server này");
    // settingsChangedAt: bot đọc lockdownEnabled/lockdownMinutes từ bundle cache
    // (TTL 30 phút) — thiếu tín hiệu thì bật/tắt "khóa kênh khi raid" phải chờ
    // tới 30 phút mới có tác dụng (cùng lớp bug welcome/goodbye 23/09).
    const patch: Record<string, unknown> = {
      updatedAt: Date.now(),
      settingsChangedAt: Date.now(),
    };
    if (enabled !== undefined) patch.lockdownEnabled = enabled;
    if (minutes !== undefined) {
      patch.lockdownMinutes = Math.max(1, Math.min(120, Math.floor(minutes)));
    }
    await ctx.db.patch(guild._id, patch);
    return { ok: true };
  },
});

/** Dashboard xóa nhiệt độ của một (hoặc toàn bộ) thành viên. */
export const resetHeat = mutation({
  args: { token: v.string(), guildId: v.string(), userId: v.optional(v.string()) },
  handler: async (ctx, { token, guildId, userId }) => {
    const user = await getUserByToken(ctx, token);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild || !canManageGuild(user, guild)) {
      throw new Error("Không có quyền quản lý server này");
    }
    const states = await ctx.db
      .query("heatStates")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .collect();
    for (const s of states) {
      if (userId && s.userId !== userId) continue;
      await ctx.db.delete(s._id);
    }
    // Báo bot xóa nhiệt trong bộ nhớ (bot kiểm tra cờ này định kỳ).
    // settingsChangedAt là BẮT BUỘC ở đây: cờ heatResetRequested được bot đọc
    // qua bundle cache, mà `hasPending` phía bot chỉ rút ngắn TTL khi bản cache
    // ĐÃ có cờ — lần yêu cầu đầu tiên (false → true) không được rút ngắn, nên
    // nút "Xóa nhiệt" sẽ đứng im tới 30 phút nếu thiếu tín hiệu này.
    await ctx.db.patch(guild._id, {
      heatResetRequested: true,
      heatResetUserId: userId ?? undefined,
      updatedAt: Date.now(),
      settingsChangedAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Dashboard asks the bot to unlock the guild immediately. */
export const requestUnlock = mutation({
  args: { token: v.string(), guildId: v.string() },
  handler: async (ctx, { token, guildId }) => {
    const user = await getUserByToken(ctx, token);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild || !canManageGuild(user, guild))
      throw new Error("Không có quyền quản lý server này");
    // settingsChangedAt: bot chỉ thấy lockdownRequested qua bundle cache. Khi
    // đang khóa thì TTL tự ngắn (lockdownUntil tương lai), nhưng ca "khóa đã hết
    // hạn mà kênh chưa mở" lại rơi vào TTL 30 phút → nút Mở khóa đứng im.
    await ctx.db.patch(guild._id, {
      lockdownRequested: true,
      updatedAt: Date.now(),
      settingsChangedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const setAntinukeGlobal = mutation({
  args: { token: v.string(), guildId: v.string(), enabled: v.boolean() },
  handler: async (ctx, { token, guildId, enabled }) => {
    const user = await getUserByToken(ctx, token);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild || !canManageGuild(user, guild))
      throw new Error("Không có quyền quản lý server này");
    await ctx.db.patch(guild._id, {
      antinukeEnabled: enabled,
      updatedAt: Date.now(),
      settingsChangedAt: Date.now(),
    });
    // BẬT TOÀN BỘ = bật luôn mọi module con (ngưỡng/cấu hình từng module giữ
    // nguyên). TẮT TOÀN BỘ = chỉ tắt tổng (antinukeEnabled=false) — giữ nguyên
    // enabled từng module, bật lại tổng là mọi module sẵn sàng ngay.
    if (enabled) {
      const mods = await ctx.db
        .query("antinukeModules")
        .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
        .collect();
      const now = Date.now();
      for (const m of mods) {
        if (!m.enabled) await ctx.db.patch(m._id, { enabled: true, updatedAt: now });
      }
    }
    return { ok: true };
  },
});

/**
 * Bật/tắt CỔNG Auto-mod nội dung (tách riêng khỏi chống nuke).
 *
 * Vì sao cần: trước đây các module nội dung (spam/mention/badword/invite/
 * malware/attachment/massMessage/blankNoise) dùng CHUNG cổng
 * `antinukeEnabled` với tab Chống nuke. Chủ server tắt chống nuke (hợp lý —
 * không muốn bot tự kick/ban hàng loạt) là mất LUÔN bộ lọc link mời, link
 * độc hại, file nguy hiểm, từ ngữ xấu, spam mention: không log, không cảnh
 * báo, im lặng tuyệt đối. Nay tab Auto-mod có cổng riêng.
 *
 * `settingsChangedAt` là BẮT BUỘC: bot đọc cấu hình qua TTL cache và chỉ làm
 * mới khi thấy mốc này đổi — thiếu nó thì toggle này tới bot muộn tới hết
 * TTL (đúng lớp lỗi 23/09).
 *
 * BẬT cổng = bật luôn module nội dung đang tắt (khớp hành vi cổng chống
 * nuke: bật tổng thì sẵn sàng ngay, không phải bật lại từng module). TẮT cổng
 * = chỉ tắt tổng, giữ nguyên cấu hình từng module.
 */
export const setAutomod = mutation({
  args: { token: v.string(), guildId: v.string(), enabled: v.boolean() },
  handler: async (ctx, { token, guildId, enabled }) => {
    const user = await getUserByToken(ctx, token);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild || !canManageGuild(user, guild))
      throw new Error("Không có quyền quản lý server này");
    await ctx.db.patch(guild._id, {
      automodEnabled: enabled,
      updatedAt: Date.now(),
      settingsChangedAt: Date.now(),
    });
    if (enabled) {
      const mods = await ctx.db
        .query("antinukeModules")
        .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
        .collect();
      const now = Date.now();
      for (const m of mods) {
        if (isModerationModule(m.module) && !m.enabled)
          await ctx.db.patch(m._id, { enabled: true, updatedAt: now });
      }
    }
    return { ok: true };
  },
});

/**
 * Bật/tắt chống nuke cho NHIỀU server cùng lúc.
 *
 * Vì sao cần: người quản trị 5–10 server phải mở từng server, bật từng module.
 * Mỗi lần bot thêm tính năng mới là thêm hàng giờ nhấp tay — nên họ bỏ luôn.
 *
 * Vì sao có mutation riêng thay vì gọi `setAntinukeGlobal` N lần từ web: mỗi
 * lần gọi là 1 round-trip + 1 kiểm tra quyền riêng; chủn 20 server là 20 vòng
 * chờ. Ở đây quyền được kiểm cho TỪNG guild trong cùng lượt (không tin bừa
 * danh sách client gửi lên — client luôn có thể tự bịa guildId).
 *
 * `settingsChangedAt` được set cho từng guild để bot nhận ngay qua
 * `bot_tick:getPendingJobs` (xem bot/src/tick.js) — thiếu nó thì đổi cấu
 * hình sẽ chờ tới hết TTL cache 30 phút, đúng lớp lỗi 23/09.
 */
export const setAntinukeGlobalBatch = mutation({
  args: {
    token: v.string(),
    guildIds: v.array(v.string()),
    enabled: v.boolean(),
  },
  handler: async (ctx, { token, guildIds, enabled }) => {
    const user = await getUserByToken(ctx, token);
    if (!user) return { ok: false, done: 0, skipped: guildIds.length };
    // Chặn 1 lệnh bấm sai là khóa/xoá cấu hình cả 50 server: giới hạn trần.
    const ids = [...new Set(guildIds)].slice(0, 50);
    const now = Date.now();
    let done = 0;
    let skipped = 0;
    for (const guildId of ids) {
      const guild = await ctx.db
        .query("guilds")
        .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
        .first();
      if (!guild || !canManageGuild(user, guild)) {
        skipped++;
        continue;
      }
      await ctx.db.patch(guild._id, {
        antinukeEnabled: enabled,
        updatedAt: now,
        settingsChangedAt: now,
      });
      if (enabled) {
        const mods = await ctx.db
          .query("antinukeModules")
          .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
          .collect();
        for (const m of mods) {
          if (!m.enabled) await ctx.db.patch(m._id, { enabled: true, updatedAt: now });
        }
      }
      done++;
    }
    return { ok: true, done, skipped };
  },
});

/* ------------------------- Bot-side sync ------------------------- */

/** Query: find guilds where verifySendPanel is true (bot polls this). */
export const getVerifySendPanelGuilds = query({
  args: { botKey: v.optional(v.string()) },
  handler: async (ctx, { botKey }) => {
    await requireBotKeyStrict(ctx, botKey);
    const guilds = await ctx.db.query("guilds").collect();
    return guilds
      .filter((g) => g.verifySendPanel === true && g.verifyEnabled && g.verifyChannelId)
      .map((g) => ({
        guildId: g.discordId,
        verifyChannelId: g.verifyChannelId!,
        unverifiedRoleId: g.unverifiedRoleId ?? null,
        verifiedRoleId: g.verifiedRoleId ?? null,
        verifyMethod: g.verifyMethod ?? "button",
      }));
  },
});

/**
 * Mutation: clear ticketSendPanel flag sau khi bot dán panel mở ticket.
 * Cùng khuôn với `clearVerifySendPanel` — có `error` thì lưu lại để dashboard
 * hiện lý do (im lặng là kiểu lỗi tệ nhất: chủ server bấm xong không hiểu vì
 * sao không có panel).
 */
export const clearTicketPanel = mutation({
  args: {
    guildId: v.string(),
    error: v.optional(v.string()),
    /** Id tin nhắn panel vừa dán — bot dùng để XOÁ bản cũ ở lần dán sau. */
    panelMessageId: v.optional(v.string()),
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, guildId, error, panelMessageId }) => {
    await requireBotKeyStrict(ctx, botKey);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild) return;
    await ctx.db.patch(
      guild._id,
      error
        ? {
            ticketSendPanel: false,
            ticketPanelError: String(error || "Lỗi không xác định").slice(0, 300),
            ticketPanelErrorAt: Date.now(),
            updatedAt: Date.now(),
          }
        : {
            ticketSendPanel: false,
            ticketPanelError: undefined,
            ticketPanelErrorAt: undefined,
            ticketPanelMessageId: panelMessageId ?? guild.ticketPanelMessageId,
            updatedAt: Date.now(),
          },
    );
  },
});

/**
 * Mutation: clear verifySendPanel flag after bot sends the panel.
 * Có `error` → lỗi gửi panel (bot không gửi được — web hiển thị lý do thay vì im lặng);
 * không `error` → gửi thành công, xóa lỗi cũ (nếu có).
 */
export const clearVerifySendPanel = mutation({
  args: {
    guildId: v.string(),
    error: v.optional(v.string()),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, guildId, error }) => {
    await requireBotKeyStrict(ctx, botKey);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild) return;
    await ctx.db.patch(
      guild._id,
      error
        ? {
            verifySendPanel: false,
            verifyPanelError: String(error || "Lỗi không xác định").slice(0, 300),
            verifyPanelErrorAt: Date.now(),
            updatedAt: Date.now(),
          }
        : {
            verifySendPanel: false,
            verifyPanelError: undefined,
            verifyPanelErrorAt: undefined,
            updatedAt: Date.now(),
          },
    );
  },
});

/** Danh sách guild bot đang ở — thân hàm ở `guilds/botGuilds.ts` (đợt #5). */
export const botListGuildIds = query({
  args: botListGuildIdsArgs,
  handler: botListGuildIdsHandler,
});

export const botSyncGuilds = mutation({
  args: {
    guilds: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        icon: v.optional(v.string()),
        memberCount: v.optional(v.number()),
      }),
    ),
    /**
     * Chỉ sweep (đánh dấu botInGuild=false) khi bot XÁC NHẬN danh sách guild đầy đủ.
     * Mặc định false: nếu cache guild bị thiếu (restart, gateway lấp dần, reconnect)
     * mà vẫn sweep thì hàng nghìn server bị đánh dấu "bot đã rời" và biến mất khỏi
     * dashboard — đã từng xảy ra với bot 2k+ server. Sweep thêm điều kiện guild vắng
     * mặt quá 10 phút (không phải lỗi thoáng qua).
     */
    trustedFullList: v.optional(v.boolean()),
    /**
     * TỐI ƯU USAGE: trạng thái toàn cục bot (heartbeat) gộp vào mutation này —
     * bot chỉ cần 1 call/phút thay vì 2 (botSyncGuilds + botHeartbeat riêng).
     */
    globalStatus: v.optional(
      v.object({
        guildCount: v.number(),
        memberCount: v.number(),
        version: v.string(),
        ownerName: v.optional(v.string()),
        ownerAvatarUrl: v.optional(v.string()),
        /** Sức khỏe AI (đợt 12) — đi nhờ vòng sync 60s, không tốn function call thêm. */
        aiHealth: v.optional(
          v.object({
            available: v.boolean(),
            providers: v.array(
              v.object({
                label: v.string(),
                model: v.optional(v.string()),
                inCooldown: v.boolean(),
              }),
            ),
            verdictCacheSize: v.number(),
            callsLastMinute: v.number(),
            inFlight: v.number(),
            verdictsLastHour: v.object({
              raid: v.number(),
              individual: v.number(),
              benign: v.number(),
              offline: v.number(),
              cache: v.number(),
            }),
            misfire: v.object({
              misfires7d: v.number(),
              pending: v.number(),
            }),
            /**
             * Tiền + hạn mức ngày (đợt #2). PHẢI khai giống hệt convex/schema.ts
             * — validator của mutation nghiêm hơn validator của bảng: thừa field
             * là ArgumentValidationError, thiếu field cũng vậy. Trước đây
             * schema.ts có `budget` (87e62b3 / PR #33) nhưng bản sao ở đây
             * bị bỏ sót → botSyncGuilds fail MÃI với
             * "extra field `budget`" và AI health không lên dashboard
             * (sự cố 05/10/2026, tra Convex logs theo Request ID).
             */
            budget: v.optional(
              v.object({
                day: v.string(),
                spentUsd: v.number(),
                budgetUsd: v.number(),
                overBudget: v.boolean(),
                byProvider: v.array(
                  v.object({
                    label: v.string(),
                    calls: v.number(),
                    promptTokens: v.number(),
                    completionTokens: v.number(),
                    usd: v.number(),
                  }),
                ),
                // Phải giống hệt convex/schema.ts — null là hợp lệ (chưa nạp được
                // bảng giá), xem giải thích ở schema.ts.
                pricingStaleDays: v.optional(v.nullable(v.number())),
                pricingChecked: v.optional(v.nullable(v.string())),
              }),
            ),
            /**
             * KHÔNG khai bắt buộc ở đây. `reportedAt` là cột phía SERVER tự ghi
             * (`statusPatch.aiHealth = { ...aiHealth, reportedAt: now }` ở thân
             * hàm) để bot không thể giả mạo mốc thời gian — nên `aiStats()`
             * (bot/src/ai.js) cố tình KHÔNG gửi field này.
             *
             * Args ≠ schema: schema.ts khai `reportedAt` bắt buộc là ĐÚNG (server
             * luôn ghi), nhưng args ở đây phải khớp đúng thứ bot GỬI. Convex
             * validate args TRƯỚC khi chạy handler, nên một field bắt buộc mà bot
             * không gửi giết mutation ngay lập tức.
             *
             * Sự cố 05/10/2026 (sau ee36db1): bản vá trước chép nguyên khối
             * aiHealth từ schema.ts sang args, kéo cả `reportedAt: v.number()`
             * vào → botSyncGuilds trả 500 ArgumentValidationError mỗi 180s,
             * AI health không bao giờ lên dashboard. Bắt buộc cũng sai theo
             * hướng ngược lại (bot gửi mà validator đòi thừa): giữ optional.
             */
            reportedAt: v.optional(v.number()),
          }),
        ),
      }),
    ),
    /**
     * TỐI ƯU I/O: khi false (mặc định), guild row CHỈ được patch khi dữ liệu thật
     * sự khác bản đang lưu (name/icon/memberCount) — bỏ ghi lặp mỗi phút của
     * guild row ~90 fields (nguồn Database I/O lớn nhất, ~60 MB/ngày trước vá).
     * lastHeartbeat per-guild chỉ refresh theo chu kỳ refreshHeartbeat của bot.
     */
    refreshHeartbeat: v.optional(v.boolean()),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, guilds, trustedFullList, globalStatus, refreshHeartbeat }) => {
    await requireBotKeyStrict(ctx, botKey);
    const now = Date.now();
    const present = new Set(guilds.map((g) => g.id));
    for (const g of guilds) {
      const existing = await ctx.db
        .query("guilds")
        .withIndex("by_discordId", (q) => q.eq("discordId", g.id))
        .first();
      if (existing) {
        // Patch CHỈ khi có khác biệt thật (hoặc đến chu kỳ refresh heartbeat) —
        // bỏ ghi lặp 1-2KB/guild/phút khi mọi thứ y nguyên.
        const changed =
          existing.name !== g.name ||
          existing.icon !== g.icon ||
          existing.memberCount !== g.memberCount ||
          !existing.botInGuild;
        if (changed || refreshHeartbeat === true) {
          await ctx.db.patch(existing._id, {
            name: g.name,
            icon: g.icon,
            memberCount: g.memberCount,
            botInGuild: true,
            lastHeartbeat: now,
            updatedAt: now,
          });
        }
      } else {
        const id = await ctx.db.insert("guilds", {
          discordId: g.id,
          name: g.name,
          icon: g.icon,
          memberCount: g.memberCount,
          prefix: "!",
          logChannelId: undefined,
          modLogChannelId: undefined,
          whitelistUsers: [],
          whitelistRoles: [],
          modRoles: [],
          adminRoles: [],
          antinukeEnabled: true,
          // Module nội dung mặc định bật (vòng for ANTI_NUKE_MODULES ngay dưới)
          // ⇒ cổng Auto-mod cũng mặc định bật. Tách khỏi antinukeEnabled để chủ
          // server tắt chống nuke không mất bộ lọc link mời/link độc hại.
          automodEnabled: true,
          lockdownEnabled: true,
          lockdownMinutes: 5,
          lockdownUntil: undefined,
          lockdownRequested: false,
          dailyReportEnabled: true,
          lastReportAt: undefined,
          badWords: [],
          heatEnabled: HEAT_DEFAULTS.enabled,
          heatDecayPerMin: HEAT_DEFAULTS.decayPerMin,
          heatWarnAt: HEAT_DEFAULTS.warnAt,
          heatTimeoutAt: HEAT_DEFAULTS.timeoutAt,
          heatKickAt: HEAT_DEFAULTS.kickAt,
          heatBanAt: HEAT_DEFAULTS.banAt,
          joinGateEnabled: false,
          joinGateMinAgeDays: 0,
          joinGateRequireAvatar: false,
          joinGateRequireFlag: false,
          joinGateRaidKick: false,
          joinGatePunish: "kick" as const,
          joinGateWhitelist: [],
          heatRepeatMultiplier: HEAT_DEFAULTS.repeatMultiplier,
          heatRepeatWindowMin: HEAT_DEFAULTS.repeatWindowMin,
          warnStrikeLimit: WARN_STRIKE_DEFAULTS.limit,
          warnStrikeWindowMin: WARN_STRIKE_DEFAULTS.windowMin,
          warnStrikePunish: WARN_STRIKE_DEFAULTS.punish as "timeout" | "kick" | "ban",
          managers: [],
          // Tự động backup mặc định mỗi 7 ngày (0 = tắt — chỉnh trong Backup server).
          backupAutoDays: 7,
          // Khôi phục role + kênh + tin nhắn + emoji/sticker bật theo mặc định (web có thể tắt).
          restoreRolesEnabled: true,
          restoreChannelsEnabled: true,
          restoreMessagesEnabled: true,
          restoreEmojisEnabled: true,
          // Raid Intel: bật săn nguồn cơn raid + tự ban nghi phạm theo mặc định.
          raidHuntEnabled: true,
          raidHuntBanSuspects: true,
          botInGuild: true,
          lastHeartbeat: now,
          createdAt: now,
          updatedAt: now,
        });
        for (const m of ANTI_NUKE_MODULES) {
          await ctx.db.insert("antinukeModules", {
            guildId: g.id,
            module: m.module,
            enabled: true,
            threshold: m.threshold,
            windowSeconds: m.windowSeconds,
            punish: m.punish as "warn" | "kick" | "ban" | "timeout",
            whitelistRoles: [],
            timeoutSeconds: m.module === "spam" || m.module === "attachment" ? 300 : 600,
            heat: m.heat,
            updatedAt: now,
          });
        }
        void id;
      }
    }
    // Guilds the bot left are no longer synced — CHỈ khi danh sách được xác nhận đầy
    // đủ (trustedFullList === true) và guild vắng mặt quá 10 phút.
    // TỐI ƯU (audit Convex): sweep chỉ chạy mỗi 10 phút (refreshHeartbeat đã là
    // chu kỳ 5 sync ≈ 10 phút — đi nhờ cùng cờ) thay vì mỗi phút; các guild rời
    // đã có sự kiện guildDelete xử lý real-time (botGuildGone) nên sweep này chỉ
    // là lưới an toàn cho trường hợp event sót. Index by_botInGuild thay collect()
    // toàn bảng (trước đây đọc ~90 fields × mọi guild mỗi phút).
    if (trustedFullList === true && refreshHeartbeat === true) {
      const inGuild = await ctx.db
        .query("guilds")
        .withIndex("by_botInGuild", (q) => q.eq("botInGuild", true))
        .collect();
      for (const guild of inGuild) {
        if (present.has(guild.discordId)) continue;
        if (now - (guild.lastHeartbeat ?? 0) < 10 * 60_000) continue;
        await ctx.db.patch(guild._id, { botInGuild: false, updatedAt: now });
      }
    }
    // Heartbeat toàn cục gộp chung (TỐI ƯU USAGE): cùng logic guilds:botHeartbeat
    // nhưng không tốn thêm 1 function call/phút riêng biệt nữa.
    if (globalStatus) {
      const status = await ctx.db
        .query("botStatus")
        .withIndex("by_kind", (q) => q.eq("kind", "status"))
        .first();
      const statusPatch: Record<string, unknown> = {
        online: true,
        guildCount: globalStatus.guildCount,
        memberCount: globalStatus.memberCount,
        lastHeartbeat: now,
        version: globalStatus.version,
      };
      if (globalStatus.ownerName !== undefined)
        statusPatch.ownerName = globalStatus.ownerName.slice(0, 120);
      if (globalStatus.ownerAvatarUrl !== undefined)
        statusPatch.ownerAvatarUrl = globalStatus.ownerAvatarUrl.slice(0, 2000);
      // Sức khỏe AI (đợt 12): tổng hợp aiStats() — chỉ owner đọc được qua
      // status:getAiHealth (guard isOwner). reportedAt ghi phía server để bot
      // không thể giả mạo thời điểm (dù bot đáng tin theo botKey).
      if (globalStatus.aiHealth !== undefined)
        statusPatch.aiHealth = { ...globalStatus.aiHealth, reportedAt: now };
      if (status) {
        await ctx.db.patch(status._id, statusPatch);
      } else {
        await ctx.db.insert("botStatus", {
          kind: "status",
          online: true,
          guildCount: globalStatus.guildCount,
          memberCount: globalStatus.memberCount,
          lastHeartbeat: now,
          startedAt: now,
          version: globalStatus.version,
          ownerName: globalStatus.ownerName?.slice(0, 120),
          ownerAvatarUrl: globalStatus.ownerAvatarUrl?.slice(0, 2000),
        });
      }
    }
    return { ok: true };
  },
});

/**
 * Nhóm function phía bot (heartbeat, sync kênh/role/emoji, guild rời, chẩn
 * đoán) — thân hàm ở `guilds/botGuilds.ts` (đợt #5). `botSyncGuilds` ở trên
 * vẫn giữ nguyên tại file này (có allowlist riêng của cổng tín hiệu).
 */
export const botGuildGone = mutation({
  args: botGuildGoneArgs,
  handler: botGuildGoneHandler,
});

export const botGuildStats = query({
  args: botGuildStatsArgs,
  handler: botGuildStatsHandler,
});

export const botHeartbeat = mutation({
  args: botHeartbeatArgs,
  handler: botHeartbeatHandler,
});

export const syncChannels = mutation({
  args: syncChannelsArgs,
  handler: syncChannelsHandler,
});

export const syncRoles = mutation({
  args: syncRolesArgs,
  handler: syncRolesHandler,
});

export const syncEmojis = mutation({
  args: syncEmojisArgs,
  handler: syncEmojisHandler,
});
