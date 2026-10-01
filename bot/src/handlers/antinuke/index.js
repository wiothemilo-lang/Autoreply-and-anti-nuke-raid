"use strict";
/**
 * Anti Nuke engine — orchestrator tách từ bản monolith 2,826 dòng.
 * Các lớp: shared (pure) → state → ai → raidIntel → enforce → externalApp →
 * members → messages → audit. Contract giữ nguyên: createAntiNuke(client, store, heat)
 * → { attach, sweepMemory } + các helper re-export cho test.
 */
const { AuditLogEvent } = require("discord.js");
const shared = require("./shared");
const createAntiNukeState = require("./state");
const createAntiNukeAi = require("./ai");
const createAntiNukeRaidIntel = require("./raidIntel");
const createAntiNukeEnforce = require("./enforce");
const createAntiNukeExternalApp = require("./externalApp");
const createAntiNukeMembers = require("./members");
const createAntiNukeMessages = require("./messages");
const createAntiNukeAudit = require("./audit");

module.exports = function createAntiNuke(client, store, heat) {
  const state = createAntiNukeState({ client, store });
  const ai = createAntiNukeAi({ state });
  const raidIntel = createAntiNukeRaidIntel({ client, store, ai });
  const core = createAntiNukeEnforce({ client, store, heat, state });
  const externalApp = createAntiNukeExternalApp({
    client,
    store,
    heat,
    state,
    core,
    ai,
    raidIntel,
  });
  const members = createAntiNukeMembers({ client, store, heat, state, core, ai, raidIntel });
  const messages = createAntiNukeMessages({
    client,
    store,
    heat,
    state,
    core,
    ai,
    raidIntel,
    externalApp,
  });
  const audit = createAntiNukeAudit({ client, store, heat, state, core, ai, raidIntel });

  const { auditLookup, sweepMemory } = state;
  const { botAddTimes } = state.state;
  const { handleExternalApp, handleButtonRaid } = externalApp;
  const { handleSuspiciousBotJoin, handleHitAndRunLeave, handleRaidJoin, markBotExemptOnJoin } =
    members;
  const { handleSpam, handleMessagePatterns } = messages;
  const {
    handleAttributeEvent,
    handleAuditEntry,
    routeAuditEntry,
    handleMessageBulk,
    tickUnlocks,
    tickHeatResets,
    tickVandalReleases,
  } = audit;

  function attach() {
    client.on("guildBanAdd", async (ban) => {
      await handleAttributeEvent({
        guild: ban.guild,
        module: "massBan",
        eventType: AuditLogEvent.MemberBanAdd,
        targetId: ban.user?.id,
        describeTarget: `<@${ban.user?.id}>`,
      }).catch((e) => console.error("[antinuke:ban]", e.message));
    });

    client.on("guildMemberRemove", async (member) => {
      // Only treat as a kick when the audit log shows a kick for this member.
      const lookup = () => auditLookup(member.guild, AuditLogEvent.MemberKick, member.id);
      let audit = await lookup().catch(() => ({
        ok: false,
        found: false,
        ambiguous: true,
        executor: null,
      }));
      if (!audit.ok) return; // audit API lỗi: không kết luận tự rời, tránh phạt oan
      if (audit.found) {
        if (!audit.executor) return;
        await handleAttributeEvent({
          guild: member.guild,
          module: "massKick",
          eventType: AuditLogEvent.MemberKick,
          targetId: member.id,
          describeTarget: `<@${member.id}>`,
        }).catch((e) => console.error("[antinuke:kick]", e.message));
        return; // bị mod/bot khác kick — không phải tự rời
      }
      // Audit log có thể đến trễ vài trăm ms sau guildMemberRemove. Thử lại một
      // lần trước khi kết luận tự rời; nếu cửa sổ đã đầy thì coi là UNKNOWN.
      if (!audit.ambiguous) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        audit = await lookup().catch(() => ({
          ok: false,
          found: false,
          ambiguous: true,
          executor: null,
        }));
      }
      if (!audit.ok || audit.ambiguous) return;
      if (audit.found) {
        if (!audit.executor) return;
        await handleAttributeEvent({
          guild: member.guild,
          module: "massKick",
          eventType: AuditLogEvent.MemberKick,
          targetId: member.id,
          describeTarget: `<@${member.id}>`,
        }).catch((e) => console.error("[antinuke:kick]", e.message));
        return;
      }
      // Không có audit kick sau grace period → có thể bot tự rời: kiểm hit-and-run.
      await handleHitAndRunLeave(member, null).catch((e) =>
        console.error("[antinuke:hitAndRun]", e.message),
      );
    });

    client.on("channelCreate", (channel) => {
      void handleAttributeEvent({
        guild: channel.guild,
        module: "massChannelCreate",
        eventType: AuditLogEvent.ChannelCreate,
        targetId: channel.id,
        describeTarget: `#${channel.name}`,
      }).catch((e) => console.error("[antinuke:channelCreate]", e.message));
    });

    client.on("channelDelete", (channel) => {
      void handleAttributeEvent({
        guild: channel.guild,
        module: "massChannelDelete",
        eventType: AuditLogEvent.ChannelDelete,
        targetId: channel.id,
        describeTarget: `#${channel.name}`,
      }).catch((e) => console.error("[antinuke:channelDelete]", e.message));
    });

    client.on("roleCreate", (role) => {
      void handleAttributeEvent({
        guild: role.guild,
        module: "massRoleCreate",
        eventType: AuditLogEvent.RoleCreate,
        targetId: role.id,
        describeTarget: `<@&${role.id}>`,
      }).catch((e) => console.error("[antinuke:roleCreate]", e.message));
    });

    client.on("roleDelete", (role) => {
      void handleAttributeEvent({
        guild: role.guild,
        module: "massRoleDelete",
        eventType: AuditLogEvent.RoleDelete,
        targetId: role.id,
        describeTarget: role.name,
      }).catch((e) => console.error("[antinuke:roleDelete]", e.message));
    });

    client.on("messageDeleteBulk", (messages) => {
      void handleMessageBulk(messages).catch((e) => console.error("[antinuke:bulk]", e.message));
    });

    client.on("guildMemberAdd", (member) => {
      void handleRaidJoin(member).catch((e) => console.error("[antinuke:join]", e.message));
      // Bot mới được thêm: ghi thời điểm cho module botHitAndRun (vào-rồi-rời).
      try {
        if ((member.user?.bot ?? member.bot) === true) {
          botAddTimes.set(`${member.guild.id}:${member.id}`, Date.now());
          // Nhớ luôn bot có được miễn trừ lúc thêm hay không — tới lúc bot rời
          // thì roles rỗng, hỏi lại được false và phạt oan bot hợp pháp.
          void Promise.resolve(markBotExemptOnJoin(member)).catch(() => {});
        }
      } catch {}
      // Cảnh báo bot lạ (suspiciousBotAlert) — chỉ cảnh báo, không phạt.
      void handleSuspiciousBotJoin(member).catch((e) =>
        console.error("[antinuke:botAlert]", e.message),
      );
    });

    client.on("messageCreate", (message) => {
      void handleSpam(message).catch((e) => console.error("[antinuke:spam]", e.message));
      void handleMessagePatterns(message).catch((e) =>
        console.error("[antinuke:pattern]", e.message),
      );
    });

    // Sự kiện audit log mới (discord.js >= 14.10) — định tuyến tất cả biến thể
    // nuke/raid: webhook/thread create+delete, sửa/đổi quyền kênh, sửa role,
    // tự cấp quyền quản trị, gán role/nickname hàng loạt, emoji/sticker, bot add,
    // invite create, đổi cấu hình server.
    if (typeof client.on === "function" && AuditLogEvent.WebhookCreate !== undefined) {
      client.on("guildAuditLogEntryCreate", (entry, guild) => {
        void (async () => {
          // Raid bằng ứng dụng ngoài (external app): xử lý riêng có AI nhận diện.
          if (entry.action === AuditLogEvent.IntegrationCreate) {
            await handleExternalApp(entry, guild);
            return;
          }
          const routed = await routeAuditEntry(entry, guild);
          if (!routed) return;
          await handleAuditEntry(entry, guild, routed.module, routed.describeTarget);
        })().catch((e) => console.error("[antinuke:auditEntry]", e.message));
      });
    }

    setInterval(() => {
      void tickUnlocks().catch((e) => console.error("[antinuke:tick]", e.message));
      void tickHeatResets().catch((e) => console.error("[heat:resetTick]", e.message));
      // S4: gỡ role cách ly hết hạn (vandalBudget).
      void tickVandalReleases().catch((e) => console.error("[vandalBudget:tick]", e.message));
      // Dọn RAM không bao giờ được làm sập bot: lỗi ném đồng bộ trong setInterval
      // đi thẳng tới uncaughtException → exit(1).
      try {
        sweepMemory();
      } catch (e) {
        console.error("[antinuke:sweep]", e.message);
      }
    }, 20_000);
  }

  // Raid bằng NÚT BẤM: kẻ raid spam bấm nút của app ngoài (tin mồi) để kích hoạt
  // hành động của app, hoặc làn sóng người bấm cùng 1 tin app. Đăng ký listener ngay
  // khi module khởi tạo (factory chạy 1 lần) — không cần sửa hàm attach().
  client.on("interactionCreate", (interaction) => {
    void handleButtonRaid(interaction).catch((e) =>
      console.error("[antinuke:buttonRaid]", e.message),
    );
  });

  return { attach, sweepMemory: state.sweepMemory };
};

// Re-export giữ contract cũ cho test + nơi khác sử dụng.
module.exports.MODULE_LABELS = shared.MODULE_LABELS;
module.exports.messageFingerprint = shared.messageFingerprint;
module.exports.isExternalAppSpam = shared.isExternalAppSpam;
module.exports.joinClusterSuspicion = shared.joinClusterSuspicion;
module.exports.joinWaveVerdict = shared.joinWaveVerdict;
module.exports.memberSuspicionScore = shared.memberSuspicionScore;
module.exports.isExempt = shared.isExempt;
module.exports.isTrustedBotMember = shared.isTrustedBotMember;
module.exports.isKnownLoggingBot = shared.isKnownLoggingBot;
module.exports.botHitAndRunVerdict = shared.botHitAndRunVerdict;
module.exports.strangeBotVerdict = shared.strangeBotVerdict;
