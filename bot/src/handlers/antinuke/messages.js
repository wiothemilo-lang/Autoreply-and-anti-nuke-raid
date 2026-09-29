"use strict";
/**
 Lớp tin nhắn: spam flood + mẫu gây nhiễu (tin dài/lặp/blank); webhook → External App Guard. 
 */
const { sendCaseLog } = require("../../caseLog");
const { isLocked } = require("../../lockdown");
const { punishMember } = require("../../heat");
const { actionsOf, cleanupMessages } = require("../../moduleActions");
const { emergencyRaidAlert } = require("../incidentReport");
const {
  MODULE_LABELS,
  isExempt,
  automodEnabled,
  LONG_MSG_LEN,
  ZERO_WIDTH_RE,
} = require("./shared");
const relayClient = require("../../relayClient");

module.exports = function createAntiNukeLayer({
  client,
  store,
  state,
  core,
  ai,
  raidIntel,
  externalApp,
}) {
  const { recordEvent, markHandled, wasHandled } = state;
  const { spamBuckets, patternBuckets, recentMessages, lastConfigs } = state.state;
  const { punishWithHeat, maybeLockdown } = core;
  const { aiClassify } = ai;
  const { recordRaidSample } = raidIntel;
  const { handleExternalAppMessage } = externalApp;

  /**
   * Mẫu scam mạng bot đã học từ các vụ raid thật (threat intel) — đưa vào prompt
   * AI để đối chiếu (huấn luyện bằng dữ liệu thật, 0 token). Lazy-require để
   * không tạo vòng phụ thuộc module; lỗi → bỏ qua (AI chạy thiếu context).
   */
  function learnedThreatContext() {
    try {
      const getLearned = require("../filters").getLearnedThreats;
      if (typeof getLearned !== "function") return undefined;
      const t = getLearned() || {};
      const keywords = (t.keywords || []).filter(Boolean);
      const phrases = (t.phrases || []).filter(Boolean);
      if (keywords.length === 0 && phrases.length === 0) return undefined;
      return { keywords, phrases };
    } catch {
      return undefined;
    }
  }

  /**
   * Dựng BẰNG CHỨNG deterministic từ mẫu tin nhắn + dữ liệu engine — đưa vào
   * prompt để AI đối chiếu dữ liệu thật thay vì đoán chay ("huấn luyện" bằng
   * tín hiệu engine đã tính sẵn, 0 token thêm). Tất cả mục đều là số/boolean
   * đo được, không phải phán đoán chủ quan.
   */
  // Câu tóm tắt cho cảnh báo khẩn. PHẢI nêu đúng module đang bắn: trước đây
  // nhánh pattern hardcode "(spam)" cho mọi module, nên chủ server đọc cảnh báo
  // tin giả blank lại thấy ghi là spam. Dùng chung 1 hàm cho cả spam lẫn
  // pattern để 2 nhánh không trôi lệch nhau lần nữa.
  const raidAlertSummary = (moduleKey, count, windowSeconds) =>
    `AI xác nhận raid (${MODULE_LABELS[moduleKey] ?? moduleKey}) — ${count} tin trong ${windowSeconds}s`;

  function messageEvidence(samples, { recentJoins, memberCount } = {}) {
    const ev = [];
    const list = (samples || []).filter(Boolean).map((s) => String(s));
    if (list.length > 0) {
      const uniq = new Set(list.map((s) => s.trim())).size;
      if (list.length >= 3 && uniq === 1)
        ev.push(`Nội dung ${list.length} mẫu tin GIỐNG HỆT nhau (engine so khớp chuỗi)`);
      else if (uniq < list.length)
        ev.push(`Nội dung trùng lặp cao: ${uniq}/${list.length} mẫu khác nhau`);
      const linky = list.filter((s) => /https?:\/\/|discord\.gg\//i.test(s)).length;
      if (linky > 0) ev.push(`${linky}/${list.length} mẫu chứa link (discord.gg hoặc http)`);
      const shorteners = list.filter((s) =>
        /bit\.ly|t\.me|tinyurl|rb\.gy|cutt\.ly|is\.gd/i.test(s),
      ).length;
      if (shorteners > 0) ev.push(`${shorteners} mẫu chứa link rút gọn (mẫu scam phổ biến)`);
      const everyone = list.filter((s) => /@everyone|@here/i.test(s)).length;
      if (everyone > 0) ev.push(`${everyone} mẫu tag @everyone/@here`);
      const blank = list.filter((s) => s.replace(ZERO_WIDTH_RE, "").trim() === "").length;
      if (blank > 0) ev.push(`${blank} mẫu là tin giả blank / ký tự ẩn`);
      const long = list.filter((s) => s.length > LONG_MSG_LEN).length;
      if (long > 0) ev.push(`${long} mẫu là tin cực dài (> ${LONG_MSG_LEN} ký tự)`);
    }
    if (recentJoins != null && recentJoins > 0)
      ev.push(`Làn sóng thành viên mới: ${recentJoins} người vào gần đây (engine đếm)`);
    if (memberCount != null) ev.push(`Quy mô server: ${memberCount} thành viên`);
    return ev;
  }

  /**
   * Phát hiện các mẫu tin nhắn gây nhiễu: tin dài cực dài / lặp nội dung và
   * tin "giả blank" (chỉ khoảng trắng + ký tự ẩn). Dùng AI để phân biệt raid
   * (leo thang phạt trực tiếp + lockdown) với vi phạm cá nhân (nhiệt bình thường).
   */
  async function handleMessagePatterns(message) {
    if (!message.guild) return;
    // Tin qua WEBHOOK = EXTERNAL APP (app kết nối từ ngoài, KHÔNG phải thành viên
    // server) → xử lý riêng ở External App Guard. BOT ĐƯỢC MỜI vào server (author bot,
    // là thành viên) vẫn bị soi các module chống nuke như thành viên thường — bot mà
    // trigger module (spam dài/lặp, blank...) sẽ bị phạt THẲNG TAY theo cấu hình.
    if (message.webhookId) {
      await handleExternalAppMessage(message);
      return;
    }
    if (message.channel.isDMBased?.()) return;
    const content = message.content || "";
    const config = await store.getConfig(message.guild.id);
    if (!config || !automodEnabled(config)) return;
    lastConfigs.set(message.guild.id, config);
    const member = message.member;
    if (!member || isExempt(member, {}, config)) return;

    const userKey = `${message.guild.id}:${message.author.id}`;
    const recents = recentMessages.get(userKey) ?? [];
    recents.push({ content, ts: Date.now() });
    const freshRecents = recents.filter((m) => Date.now() - m.ts < 30_000).slice(-8);
    recentMessages.set(userKey, freshRecents);

    const modules = config.modules || [];
    const longCfg = modules.find((m) => m.module === "massMessage");
    const blankCfg = modules.find((m) => m.module === "blankNoise");

    const patterns = [];
    if (longCfg?.enabled) {
      // Tin dài cực dài hoặc lặp lại nội dung giống hệt nhiều lần.
      const isLong = content.length > LONG_MSG_LEN;
      const sameCount = freshRecents.filter((m) => m.content === content).length;
      if (isLong || sameCount >= 2) patterns.push({ cfg: longCfg, key: `${userKey}:long` });
    }
    if (blankCfg?.enabled) {
      const stripped = content.replace(ZERO_WIDTH_RE, "").trim();
      const isBlankNoise = content.length > 0 && stripped.length === 0;
      if (isBlankNoise) patterns.push({ cfg: blankCfg, key: `${userKey}:blank` });
    }

    for (const { cfg, key } of patterns) {
      const now = Date.now();
      const arr = patternBuckets.get(key) ?? [];
      arr.push(now);
      const cutoff = now - cfg.windowSeconds * 1000;
      const fresh = arr.filter((t) => t >= cutoff);
      patternBuckets.set(key, fresh);
      if (fresh.length < cfg.threshold) continue;

      // CHỐNG PHẠT LẶT 1 ĐỢT: đánh dấu NGAY, đồng bộ, TRƯỚC mọi await. Bucket bị
      // xoá ngay bên dưới còn lệnh gọi AI mất tới 6s — trong khoảng đó kẻ phát
      // lại lại đủ ngưỡng và chạy tiếp pipeline thứ 2 SONG SONG: cùng một đợt bị
      // phạt 2 lần, ghi 2 case log, cộng 2 lần nhiệt. Cùng nguyên tắc đã dùng ở
      // massJoin (join đầu chạm ngưỡng đánh dấu trước, không đợi AI).
      if (wasHandled(message.guild.id, cfg.module, member.id)) continue;
      markHandled(
        message.guild.id,
        cfg.module,
        member.id,
        Math.max(30_000, (cfg.windowSeconds || 10) * 2000),
      );

      patternBuckets.delete(key);
      const samples = freshRecents.map((m) => m.content.slice(0, 200));
      const ai = await aiClassify(
        message.guild,
        cfg.module,
        fresh.length,
        cfg.windowSeconds,
        cfg.threshold,
        samples,
        {
          knownThreats: learnedThreatContext(),
          store,
          evidence: messageEvidence(samples, {
            recentJoins: state.state.joiners.get(message.guild.id)?.length,
            memberCount: message.guild.memberCount ?? undefined,
          }),
        },
      );
      // Chỉ coi là raid/nuke khi AI phân loại là "raid" VÀ độ tin cậy đủ cao
      // (>= 0.6) — tránh nhận diện nhầm gây ban nhầm + khóa kênh oan.
      const isRaid = ai?.classification === "raid" && (ai?.confidence ?? 0) >= 0.6;
      // AI xác định là dương tính giả → không phạt, chỉ ghi nhận.
      const isBenign = ai?.classification === "benign";
      const reason = `[Protogon] ${MODULE_LABELS[cfg.module]}: ${fresh.length} lần trong ${cfg.windowSeconds}s (ngưỡng ${cfg.threshold})${isRaid ? ` — AI: raid (${ai.reason ?? ""})` : ""}`;
      const actions = actionsOf(cfg);

      let action;
      let chosen;
      let caseNumber;
      if (isRaid) {
        // Leo thang: phạt trực tiếp theo hình phạt nuke mặc định + lockdown.
        chosen = "ban";
        const res = await punishMember(message.guild, member, "ban", reason, 0, store);
        action = res.action;
        caseNumber = res.caseNumber;
        await maybeLockdown(message.guild, config);
        // AI xác nhận raid → cảnh báo khẩn cho server (fire-and-forget).
        emergencyRaidAlert(client, store, message.guild, {
          summary: raidAlertSummary(cfg.module, fresh.length, cfg.windowSeconds),
          reason,
          lockdownActive: isLocked(message.guild.id),
        }).catch(() => {});
        // Threat Relay (Đợt 6): đóng góp signature raid cho toàn mạng (fire-and-
        // forget; Convex kiểm guild có bật relayShare — không thì bỏ qua).
        // GỘP 1 LẦN: gọi 2 lần liên tiếp trước đây làm Convex dedupe tăng weight
        // +1 cho mỗi lượt → 1 server tự nâng weight 1→2, signature "xác nhận bởi
        // 1 server" được phân phối toàn mạng như 2 server cùng thấy (vỡ lỗ hổng
        // chống đầu độc relay MIN_WEIGHT_AGED = 2).
        relayClient.reportSignatureBatch(message.guild.id, "spam-text", samples);
      } else if (isBenign) {
        // Dương tính giả: chỉ xóa tin nhắn, không phạt, không cộng nhiệt.
        action = "bỏ qua (AI: benign)";
        chosen = "none";
      } else {
        const res = await punishWithHeat(message.guild, member, cfg, reason);
        action = res.action;
        caseNumber = res.caseNumber;
        chosen = res.chosen;
      }
      // Dương tính giả (benign): không dọn tin, không phạt.
      let cleanup = "";
      if (!isBenign) {
        cleanup = await cleanupMessages({
          guild: message.guild,
          channel: message.channel,
          userId: message.author.id,
          actions,
          triggerMessage: message,
        });
        if (cleanup) action = `${action} · ${cleanup}`;
      }

      await recordEvent(message.guild.id, {
        module: cfg.module,
        executorId: message.author.id,
        executorName: message.author.username,
        action: `${action}${isRaid ? " (AI: raid)" : ""}`,
        count: fresh.length,
        windowSeconds: cfg.windowSeconds,
        threshold: cfg.threshold,
        punish: chosen ?? "none",
      });

      const offender = { id: message.author.id, username: message.author.username };
      // Log xóa tin nhắn kiểu Carl-bot ("Message deleted") vào kênh log moderation.
      if (cleanup) {
        try {
          await sendCaseLog({
            guild: message.guild,
            guildConfig: config,
            action: "delete",
            offender,
            reason: `Bot tự động xóa tin nhắn vì ${MODULE_LABELS[cfg.module]} (${fresh.length} tin trong ${cfg.windowSeconds}s)`,
            executor: null,
          });
        } catch (e) {
          console.error("[antinuke:pattern:delLog]", e.message);
        }
      }
      // Embed case kiểu Carl-bot cho phạt tự động (responsible moderator = tên bot).
      if (!isBenign) {
        try {
          await sendCaseLog({
            guild: message.guild,
            guildConfig: config,
            action: chosen === "none" ? "warn" : chosen,
            caseNumber,
            offender,
            reason:
              `Tự động xử lý vì ${MODULE_LABELS[cfg.module]}: ${fresh.length} lần trong ${cfg.windowSeconds}s${isRaid ? ` — AI xác nhận raid (${ai?.reason ?? ""})` : ""}${cleanup ? ` · đã ${cleanup}` : ""}`.slice(
                0,
                1000,
              ),
            executor: null,
          });
        } catch (e) {
          console.error("[antinuke:pattern:case]", e.message);
        }
      }
      // Raid Intel: ghi mẫu huấn luyện kèm AI verdict (raid/individual/benign).
      if (!isBenign) {
        await recordRaidSample(message.guild, config, {
          module: cfg.module,
          count: fresh.length,
          windowSeconds: cfg.windowSeconds,
          threshold: cfg.threshold,
          action,
          punish: chosen ?? "none",
          aiClassification: ai?.classification,
          aiConfidence: ai?.confidence,
          aiReason: ai?.reason,
          lockdownTriggered: isLocked(message.guild.id),
        });
      }
      return; // chỉ xử lý 1 pattern/tin nhắn
    }
  }

  async function handleSpam(message) {
    if (!message.guild) return;
    // Bot ĐƯỢC MỜI vào server cũng bị soi chống spam như thành viên thường — bot mà
    // trigger module sẽ bị phạt thẳng tay theo cấu hình (webhook thì message.member
    // là null nên tự bỏ qua ở đây — webhook do External App Guard xử lý).
    if (message.channel.isDMBased?.()) return;
    const config = await store.getConfig(message.guild.id);
    if (!config || !automodEnabled(config)) return;
    lastConfigs.set(message.guild.id, config);
    const moduleCfg = config.modules.find((m) => m.module === "spam");
    if (!moduleCfg || !moduleCfg.enabled) return;
    const member = message.member;
    if (!member || isExempt(member, moduleCfg, config)) return;

    const key = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const arr = spamBuckets.get(key) ?? [];
    arr.push(now);
    const cutoff = now - moduleCfg.windowSeconds * 1000;
    const fresh = arr.filter((t) => t >= cutoff);
    spamBuckets.set(key, fresh);
    if (fresh.length < moduleCfg.threshold) return;

    // CHỐNG PHẠT LẶT 1 ĐỢT: đánh dấu NGAY, đồng bộ, TRƯỚC mọi await (xem giải
    // thích ở nhánh pattern phía trên). Nếu không, kẻ spam tiếp trong lúc bot
    // chờ AI (tới 6s) sẽ chạy cả pipeline thứ 2 cho cùng một đợt.
    if (wasHandled(message.guild.id, "spam", member.id)) return;
    markHandled(
      message.guild.id,
      "spam",
      member.id,
      Math.max(30_000, (moduleCfg.windowSeconds || 5) * 2000),
    );

    spamBuckets.delete(key); // reset after punishing
    // Ghi mẫu tin nhắn spam cho n-gram engine (threat intel cục bộ, 0 token).
    try {
      require("../../threatEngine").noteFlaggedMessage(message.content, message.guild.id, "spam");
    } catch {}
    const samples = (recentMessages.get(key) ?? []).map((m) => m.content.slice(0, 200));
    const ai = await aiClassify(
      message.guild,
      "spam",
      fresh.length,
      moduleCfg.windowSeconds,
      moduleCfg.threshold,
      samples,
      {
        knownThreats: learnedThreatContext(),
        store,
        evidence: messageEvidence(samples, {
          recentJoins: state.state.joiners.get(message.guild.id)?.length,
          memberCount: message.guild.memberCount ?? undefined,
        }),
      },
    );
    // Chỉ leo thang thành raid (ban + lockdown) khi AI tự tin >= 0.6.
    const isRaid = ai?.classification === "raid" && (ai?.confidence ?? 0) >= 0.6;
    const isBenign = ai?.classification === "benign";
    const reason = `[Protogon AntiNuke] Spam: ${fresh.length} tin nhắn trong ${moduleCfg.windowSeconds}s${isRaid ? ` — AI: raid (${ai.reason ?? ""})` : ""}`;

    const actions = actionsOf(moduleCfg);
    let action;
    let chosen;
    let caseNumber;
    if (isRaid) {
      chosen = "ban";
      const res = await punishMember(message.guild, member, "ban", reason, 0, store);
      action = res.action;
      caseNumber = res.caseNumber;
      await maybeLockdown(message.guild, config);
      // AI xác nhận raid → CẢNH BÁO KHẨN cho server (fire-and-forget), giống
      // nhánh pattern ở handleMessagePatterns. Trước đây chỉ nhánh pattern
      // gọi: spam là đường raid phổ biến nhất lại im lặng — server bị ban +
      // khoá kênh mà không ai trong đó được báo. Hàm tự chặn trùng 5 phút và
      // tôn trọng tắt `emergencyAlertEnabled`, nên gọi thêm ở đây không gây spam.
      emergencyRaidAlert(client, store, message.guild, {
        summary: raidAlertSummary(moduleCfg.module, fresh.length, moduleCfg.windowSeconds),
        reason,
        lockdownActive: isLocked(message.guild.id),
      }).catch(() => {});
      // Threat Relay (Đợt 6): đóng góp signature raid spam (fire-and-forget).
      relayClient.reportSignatureBatch(message.guild.id, "spam-text", samples);
    } else if (isBenign) {
      action = "bỏ qua (AI: benign)";
      chosen = "none";
    } else {
      const res = await punishWithHeat(message.guild, member, moduleCfg, reason);
      action = res.action;
      caseNumber = res.caseNumber;
      chosen = res.chosen;
    }

    // Dọn tin nhắn theo hành động đã chọn (deleteMessages / purgeMessages).
    let cleanup = "";
    if (!isBenign) {
      cleanup = await cleanupMessages({
        guild: message.guild,
        channel: message.channel,
        userId: message.author.id,
        actions,
        triggerMessage: message,
      });
      if (cleanup) action = `${action} · ${cleanup}`;
    }

    await recordEvent(message.guild.id, {
      module: "spam",
      executorId: message.author.id,
      executorName: message.author.username,
      action: `${action}${isRaid ? " (AI: raid)" : ""}`,
      count: fresh.length,
      windowSeconds: moduleCfg.windowSeconds,
      threshold: moduleCfg.threshold,
      punish: chosen ?? "none",
    });

    const offender = { id: message.author.id, username: message.author.username };
    // Log xóa tin nhắn kiểu Carl-bot ("Message deleted") vào kênh log moderation.
    if (cleanup) {
      try {
        await sendCaseLog({
          guild: message.guild,
          guildConfig: config,
          action: "delete",
          offender,
          reason: `Bot tự động xóa tin nhắn vì spam (${fresh.length} tin trong ${moduleCfg.windowSeconds}s)`,
          executor: null,
        });
      } catch (e) {
        console.error("[antinuke:spam:delLog]", e.message);
      }
    }
    // Embed case kiểu Carl-bot cho phạt tự động (responsible moderator = tên bot).
    if (!isBenign) {
      try {
        await sendCaseLog({
          guild: message.guild,
          guildConfig: config,
          action: chosen === "none" ? "warn" : chosen,
          caseNumber,
          offender,
          reason:
            `Tự động xử lý vì spam tin nhắn: ${fresh.length} tin trong ${moduleCfg.windowSeconds}s${isRaid ? ` — AI xác nhận raid (${ai?.reason ?? ""})` : ""}${cleanup ? ` · đã ${cleanup}` : ""}`.slice(
              0,
              1000,
            ),
          executor: null,
        });
      } catch (e) {
        console.error("[antinuke:spam:case]", e.message);
      }
    }
    // Raid Intel: ghi mẫu huấn luyện kèm AI verdict (raid/individual/benign).
    if (!isBenign) {
      await recordRaidSample(message.guild, config, {
        module: moduleCfg.module,
        count: fresh.length,
        windowSeconds: moduleCfg.windowSeconds,
        threshold: moduleCfg.threshold,
        action,
        punish: chosen ?? "none",
        aiClassification: ai?.classification,
        aiConfidence: ai?.confidence,
        aiReason: ai?.reason,
        lockdownTriggered: isLocked(message.guild.id),
      });
    }
  }

  return { handleMessagePatterns, handleSpam };
};
