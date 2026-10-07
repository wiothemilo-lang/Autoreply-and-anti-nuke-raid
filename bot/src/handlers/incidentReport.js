/**
 * incidentReport.js — BÁO CÁO KHẨN + /report (AI đọc chat).
 *
 * Hai tính năng dùng chung một bộ máy AI:
 *  1. reportInteractive(client, store, source) — lệnh /report và !report:
 *     quét hàng trăm tin nhắn gần đây của server (nhiều kênh), gom sự kiện
 *     chống nuke + phạt gần nhất từ Convex, rồi nhờ Mimo V2.5 (Kira AI, free
 *     30M tokens/ngày — chain ưu tiên research của bot/src/ai.js) đọc toàn bộ
 *     và viết báo cáo tình huống: raid/nuke có đang diễn ra không, bot có phạt
 *     nhầm ai không, khuyến nghị cho mod. Kết quả gửi lên server + log.
 *  2. emergencyRaidAlert(client, store, guild, info) — khi anti-nuke XÁC NHẬN
 *     raid/nuke: quét chat mới nhất rồi gửi một tin CẢNH BÁO KHẨN (mention
 *     @everyone khi server bật) tóm tắt tình huống cho mọi người. Chống spam
 *     bằng 2 knob cấu hình: khoảng cách tối thiểu giữa 2 báo cáo và số sự
 *     kiện nuke tối thiểu (xem khối hằng số bên dưới).
 *
 * AI offline (không có key) → vẫn hoạt động: báo cáo d determinstic từ dữ liệu
 * audit/phạt + tin nhắn, không AI. Không bao giờ throw về caller.
 */

const { Colors, ChannelType } = require("discord.js");
const { logEmbed, sendLog } = require("../util");
const ai = require("../ai");
const lang = require("./lang");

/** Nhãn ngôn ngữ để nhét vào prompt AI — chỉ 3 giá trị, ngôn ngữ khác đã quy về EN. */
const LANG_NAME = { vi: "tiếng Việt", en: "English", de: "Deutsch (tiếng Đức)" };

/** Giới hạn quét chat — chốt trần để không chậm bot trên server lớn. */
const MAX_MESSAGES = 400;
const MAX_CHANNELS = 12;
const FETCH_PER_CHANNEL = 60;

/** Giới hạn văn bản đưa vào prompt AI (token control — Mimo free quota). */
const PROMPT_CHAR_BUDGET = 14000;

/** Cooldown report per-guild (chống spam lệnh + đốt token AI vô ích). */
const REPORT_COOLDOWN_MS = 60_000;
const lastReportAt = new Map();

/**
 * ── Chính sách báo cáo khẩn (raid/nuke) — HAI knob chống spam ──────────────
 *
 * PHẢI khớp `convex/reports.ts` (nguồn số phía Convex, cũng là nơi
 * `updateSettings` kẹp giá trị). Bot chạy CommonJS nên không import được TS;
 * `scripts/test-web-contracts.cjs` đọc số THẬT từ cả hai file nên lệch là đỏ.
 *
 * Vì sao cần: cửa sổ cũ cứng 5 phút nghĩa là một vụ raid kéo dài (hoặc một
 * false positive lặp lại) làm bot đăng lại "CẢNH BÁO KHẨN" + @everyone mỗi 5
 * phút, suốt nhiều giờ — đúng kiểu "bot spam báo cáo nuke" người dùng báo.
 *
 *   · reportMinIntervalMin — khoảng cách TỐI THIỂU giữa 2 báo cáo. Sự kiện
 *     xảy ra trong lúc bị chặn KHÔNG bị mất: chúng được dồn lại, hết khoảng
 *     cách là báo một lần gộp.
 *   · reportMinEvents — số sự kiện nuke TỐI THIỂU để đủ điều kiện báo, chặn
 *     "báo vì một sự kiện lẻ" (false positive đơn lẻ, AI run tay).
 *
 * Cả hai đều do chủ server chỉnh trên dashboard → tab Cài đặt.
 */
const DEFAULT_REPORT_MIN_INTERVAL_MIN = 15;
const REPORT_MIN_INTERVAL_MIN = 1;
const REPORT_MIN_INTERVAL_MAX = 360;
const DEFAULT_REPORT_MIN_EVENTS = 1;
const REPORT_MIN_EVENTS_MIN = 1;
const REPORT_MIN_EVENTS_MAX = 50;
/** Sự kiện cách nhau quá lâu KHÔNG phải một vụ: ngoài cửa sổ này thì đếm lại
 * từ đầu, nếu không một sự kiện lẻ hôm nay + một sự kiện lẻ tháng sau sẽ ghép
 * thành "vụ raid" và bắn báo cáo sai. */
const REPORT_EVENT_WINDOW_MS = 60 * 60_000;

/** Số phút tối thiểu giữa 2 báo cáo — giá trị rác về mặc định, không về biên. */
function clampReportMinIntervalMin(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_REPORT_MIN_INTERVAL_MIN;
  return Math.max(REPORT_MIN_INTERVAL_MIN, Math.min(REPORT_MIN_INTERVAL_MAX, Math.round(n)));
}

/** Số sự kiện nuke tối thiểu để gửi báo cáo khẩn. */
function clampReportMinEvents(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_REPORT_MIN_EVENTS;
  return Math.max(REPORT_MIN_EVENTS_MIN, Math.min(REPORT_MIN_EVENTS_MAX, Math.round(n)));
}

/** Trạng thái chống spam theo guild: mốc gửi gần nhất + số sự kiện đang dồn. */
const emergencyState = new Map();
function emergencyStateFor(guildId) {
  let s = emergencyState.get(guildId);
  if (!s) {
    s = { lastAt: 0, count: 0, lastEventAt: 0 };
    emergencyState.set(guildId, s);
  }
  return s;
}

/** Đang chạy — chặn 2 lệnh song song trong cùng server. */
const running = new Set();

/** Cắt dài nhưng giữ nguyên từ (đẹp hơn khi dán vào prompt). */
function clip(text, max) {
  const s = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/** Định dạng tin nhắn thành dòng gọn cho AI. */
function fmtMsg(m, idx) {
  const time = new Date(m.createdTimestamp).toISOString().slice(11, 16);
  const content = m.content
    ? clip(m.content, 200)
    : m.embeds?.length
      ? "(embed)"
      : "(sticker/media)";
  return `${idx}. [${time}] ${m.author?.username ?? "?"}: ${content}`;
}

/**
 * Thu thập tin nhắn gần đây của server: ưu tiên kênh text đang hoạt động
 * (mới nhất theo lastMessageId), đọc tối đa MAX_MESSAGES tin.
 */
async function collectRecentMessages(guild, focusChannelId) {
  const textChannels = guild.channels.cache
    .filter((c) => c.type === ChannelType.GuildText && c.viewable)
    .sort((a, b) => (b.lastMessageId ?? 0) - (a.lastMessageId ?? 0))
    .first(MAX_CHANNELS);

  const lines = [];
  let total = 0;
  for (const ch of textChannels ?? []) {
    if (total >= MAX_MESSAGES) break;
    if (ch.id === focusChannelId && lines.length > 0) continue; // focus đã ưu tiên bên dưới
    try {
      const msgs = await ch.messages.fetch({ limit: FETCH_PER_CHANNEL }).catch(() => null);
      if (!msgs || msgs.size === 0) continue;
      const arr = [...msgs.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      for (const m of arr) {
        if (total >= MAX_MESSAGES) break;
        if (m.author?.bot && m.author?.id !== guild.members.me?.id) continue; // bỏ bot khác
        lines.push(`#${ch.name} · ${fmtMsg(m, lines.length + 1)}`);
        total++;
      }
    } catch {
      // thiếu quyền Read History — bỏ qua kênh này
    }
  }
  return lines;
}

/** Đọc kênh nơi lệnh được gõ — đặt lên ĐẦU danh sách prompt (liên quan nhất). */
async function collectFocusChannel(channel, maxLines = 120) {
  if (!channel?.isTextBased?.()) return [];
  try {
    const msgs = await channel.messages.fetch({ limit: maxLines }).catch(() => null);
    if (!msgs || msgs.size === 0) return [];
    const arr = [...msgs.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    return arr.map((m, i) => fmtMsg(m, i + 1));
  } catch {
    return [];
  }
}

/** Nạp sự kiện anti-nuke + phạt gần nhất của guild từ Convex (botKey tự gửi). */
async function loadAuditData(store, guildId) {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const [events, modActions] = await Promise.all([
    store.client.query("reports:getGuildEvents", { guildId, since, limit: 60 }).catch(() => []),
    store.client.query("reports:getGuildModActions", { guildId, since, limit: 50 }).catch(() => []),
  ]);
  return { events: events ?? [], modActions: modActions ?? [] };
}

/** Gom dữ liệu anti-nuke/phạt thành đoạn text ngắn cho prompt. */
function auditSummary(events, modActions) {
  const evLines = events
    .slice(0, 30)
    .map(
      (e) =>
        `- ${new Date(e.createdAt).toISOString().slice(11, 16)} ${e.module} ×${e.count} — ${clip(e.executorName ?? e.executorId ?? "?", 40)} → ${clip(e.action, 80)} (punish: ${e.punish})`,
    );
  const actLines = modActions
    .slice(0, 30)
    .map(
      (a) =>
        `- ${new Date(a.createdAt).toISOString().slice(11, 16)} ${a.action}${a.caseNumber ? ` (case ${a.caseNumber})` : ""} → ${clip(a.targetName ?? a.targetId ?? "?", 40)} · ${clip(a.reason ?? "", 90)}`,
    );
  return {
    eventsText: evLines.length ? evLines.join("\n") : "(không có sự kiện nào trong 24 giờ)",
    actionsText: actLines.length ? actLines.join("\n") : "(không có phạt nào trong 24 giờ)",
  };
}

/**
 * Prompt AI — Mimo V2.5 (Kira) đọc tình huống và viết báo cáo THEO NGÔN NGỮ
 * SERVER (locale quốc gia chủ server chọn; quốc gia không hỗ trợ → EN).
 */
function buildPrompt({
  guildName,
  memberCount,
  focusLines,
  chatLines,
  eventsText,
  actionsText,
  userNote,
  lockdownActive,
  reportLang = "vi",
}) {
  const langName = LANG_NAME[reportLang] || "tiếng Việt";
  const system = `Bạn là Trợ lý bảo mật của bot Protogon trong server Discord "${guildName}". Nhiệm vụ: đọc tình huống server và viết BÁO CÁO NGẮN bằng ${langName} cho mọi thành viên.

Bối cảnh: có thể đang có raid/nuke, hoặc thành viên khiếu nại rằng bot phạt nhầm. Hãy đối chiếu:
1) Tình trạng an ninh: có tín hiệu raid/nuke/spam không? Mức độ nghiêm trọng?
2) Xét phạt gần nhất: có phạt NHẦM (dương tính giả) không — ví dụ phạt người chỉ chat bình thường, phạt bot hợp pháp? Ghi rõ "CÓ KHẢ NĂNG PHẠT NHẦM" và chỉ tên khi thấy bằng chứng trong chat.
3) Khuyến nghị: mod nên làm gì tiếp (giữ nguyên phạt / gỡ phạt cho ai / khóa kênh / tăng ngưỡng…).

QUY TẮC VIẾT: đúng 3 mục "🛡️ An ninh", "⚖️ Đánh giá phạt", "💡 Khuyến nghị"; mỗi mục ≤ 4 dòng; nêu tên người cụ thể bằng @username khi có bằng chứng; không bịa sự kiện không có trong dữ liệu; giọng trung lập, không chỉ trích cá nhân.`;

  const chatBlock = [...focusLines, ...chatLines]
    .slice(0, MAX_MESSAGES)
    .join("\n")
    .slice(0, PROMPT_CHAR_BUDGET);
  const user = `Trạng thái: ${memberCount ?? "?"} thành viên${lockdownActive ? " · 🔒 ĐANG KHÓA KÊNH (lockdown)" : ""}${userNote ? `\nGhi chú người báo cáo: ${clip(userNote, 300)}` : ""}
=== SỰ KIỆN ANTI-NUKE 24H ===
${eventsText}
=== PHẠT GẦN NHẤT 24H ===
${actionsText}
=== CHAT GẦN ĐÂY (mới nhất cuối) ===
${chatBlock || "(không đọc được tin nhắn nào — kênh thiếu quyền)"}

Viết báo cáo theo đúng 3 mục yêu cầu.`;
  return { system, user };
}

/** Gọi AI (chain research: Kira/Mimo trước) — trả null khi offline/lỗi. */
async function askAI(prompt, maxTokens = 700) {
  if (!ai.researchAvailable()) return null;
  return Promise.race([
    ai.researchChat(
      [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      { maxTokens, temperature: 0.2, timeoutMs: 40_000 },
    ),
    new Promise((r) => setTimeout(() => r(null), 45_000)),
  ]);
}

/** Màu nhãn mức độ. */
function levelColor(level) {
  if (level === "raid") return Colors.Red;
  if (level === "suspicious") return Colors.Orange;
  if (level === "misfire") return Colors.Yellow;
  return Colors.Green;
}

/** Ghép báo cáo thành embed gửi server. */
function buildReportEmbed({
  analysis,
  events,
  modActions,
  msgCount,
  aiUsed,
  userNote,
  requester,
  emergency,
  lockdownActive,
}) {
  const level = analysis?.level ?? "calm";
  const color = levelColor(level);
  const title = emergency ? "🚨 CẢNH BÁO KHẨN — Tình hình server" : "📋 Báo cáo tình hình server";

  const evCount = events.length;
  const actCount = modActions.length;
  const fields = [
    {
      name: "🛡️ An ninh",
      value: clip(analysis?.security ?? "Không thấy tín hiệu raid/nuke trong 24 giờ qua.", 1000),
    },
    {
      name: "⚖️ Đánh giá phạt",
      value: clip(
        analysis?.punishmentReview ??
          (actCount
            ? `${actCount} phạt gần nhất — không phát hiện bất thường rõ rệt.`
            : "Chưa có phạt nào trong 24 giờ."),
        1000,
      ),
    },
    {
      name: "💡 Khuyến nghị",
      value: clip(
        analysis?.recommendation ?? "Tiếp tục quan sát; bật chống nuke và giữ log.",
        1000,
      ),
    },
    {
      name: "Dữ liệu",
      value: `💬 ${msgCount} tin nhắn đã đọc · 🛡️ ${evCount} sự kiện · ⚖️ ${actCount} phạt (24h)${lockdownActive ? " · 🔒 lockdown" : ""}${aiUsed ? "" : " · ⚙️ chế độ offline"}`,
    },
  ];
  if (userNote) {
    fields.push({ name: "Ghi chú từ người báo cáo", value: clip(userNote, 500) });
  }

  return logEmbed({
    title,
    description: `${emergency ? "Phát hiện **raid/nuke được xác nhận** — bot đã quét chat và tổng hợp tình hình:" : "Quét tự động theo yêu cầu."}`,
    color,
    fields,
    footer: emergency
      ? `Protogon · Emergency Alert${requester ? "" : ""}`
      : `Protogon · Report${requester ? ` · yêu cầu bởi ${requester.username ?? requester.id}` : ""}`,
  });
}

/**
 * Báo cáo khẩn khi anti-nuke xác nhận raid/nuke. Được gọi từ antinuke.js.
 * Fire-and-forget: không chặn luồng xử lý phạt.
 *
 * Chống spam bằng 2 knob cấu hình được (xem khối hằng số ở đầu file):
 * đủ số sự kiện dồn + đủ khoảng cách từ báo cáo trước mới gửi.
 */
async function emergencyRaidAlert(client, store, guild, info = {}) {
  try {
    if (!guild || !store) return;
    // Đọc cấu hình TRƯỚC khi ghi nhận sự kiện: đọc lỗi (Convex quá tải đúng
    // lúc raid) không được ăn mất suất cảnh báo của cả đợt, cũng không được
    // cộng dồn sự kiện vào một lượt không thực sự xử lý.
    const config = await store.getConfig(guild.id);
    if (!config) return;
    // Tôn trọng toggle: chủ server tắt cảnh báo khẩn trên web → không gửi.
    if (config.emergencyAlertEnabled === false) return;
    const now = Date.now();
    const state = emergencyStateFor(guild.id);
    // Sự kiện ngoài cửa sổ dồn → bắt đầu vụ mới, không cộng dồn xuyên tháng.
    if (now - state.lastEventAt > REPORT_EVENT_WINDOW_MS) state.count = 0;
    state.count += 1;
    state.lastEventAt = now;

    const minEvents = clampReportMinEvents(config.reportMinEvents);
    const minIntervalMs = clampReportMinIntervalMin(config.reportMinIntervalMin) * 60_000;
    // Chưa đủ số sự kiện → chưa báo (để dành cho lượt sau).
    if (state.count < minEvents) return;
    // Quá sát báo cáo trước → hoãn, sự kiện vẫn nằm trong state.count.
    if (now - state.lastAt < minIntervalMs) return;
    // Đủ điều kiện: khoá khoảng cách + xoá bộ đếm (vụ sau đếm lại từ đầu).
    state.lastAt = now;
    state.count = 0;

    const [chatLines, audit] = await Promise.all([
      collectRecentMessages(guild, null),
      loadAuditData(store, guild.id),
    ]);

    const prompt = buildPrompt({
      guildName: guild.name,
      memberCount: guild.memberCount,
      focusLines: [],
      chatLines,
      ...auditSummary(audit.events, audit.modActions),
      userNote: info.reason ? `Bot vừa xử lý: ${info.reason}` : "",
      lockdownActive: info.lockdownActive === true,
      reportLang: lang.langForGuild(guild),
    });
    const raw = await askAI(prompt);
    const analysis = parseAnalysis(raw);

    const embed = buildReportEmbed({
      guild,
      analysis,
      events: audit.events,
      modActions: audit.modActions,
      msgCount: chatLines.length,
      aiUsed: Boolean(raw),
      userNote: info.reason ? `Bot vừa xử lý: ${clip(info.reason, 300)}` : "",
      requester: null,
      emergency: true,
      lockdownActive: info.lockdownActive === true,
    });

    // Gửi thẳng kênh log chung (kèm @everyone tùy cấu hình). Gửi thành công thì
    // KHÔNG gửi lại qua sendLog — tránh log trùng 2 lần trong cùng kênh.
    const targetChannelId = config.logChannelId ?? config.modLogChannelId;
    let delivered = false;
    if (targetChannelId) {
      const ch = await guild.channels.fetch(targetChannelId).catch(() => null);
      if (ch?.isTextBased()) {
        delivered = await ch
          .send({
            content: `🚨 **CẢNH BÁO KHẨN** — ${clip(info.summary ?? "phát hiện raid/nuke", 120)}${config.logPingEveryone !== false ? " @everyone" : ""}`,
            embeds: [embed],
            allowedMentions:
              config.logPingEveryone !== false ? { parse: ["everyone"] } : { parse: [] },
          })
          .then(() => true)
          .catch(() => false);
      }
    }
    // Chưa gửi được (không có kênh / gửi lỗi) → fallback webhook log.
    if (!delivered) await sendLog(guild, config, embed, "raid").catch(() => {});
  } catch (e) {
    console.error("[report:emergency]", e.message);
  }
}

/**
 * Lệnh /report + !report — AI đọc chat + dữ liệu phạt rồi công bố báo cáo.
 * Quyền: mọi thành viên (đúng yêu cầu "báo các tình huống bot phạt sai"), có
 * cooldown 60s/server + chống chạy song song.
 */
async function reportInteractive(client, store, source) {
  const guild = source.guild;
  if (!guild) return;
  const user = source.user ?? source.author;
  const userNote =
    typeof source.options?.getString === "function"
      ? (source.options.getString("ghichu") ?? source.options.getString("note") ?? undefined)
      : undefined;

  // Cooldown per-guild.
  const last = lastReportAt.get(guild.id) ?? 0;
  const waitMs = REPORT_COOLDOWN_MS - (Date.now() - last);
  if (waitMs > 0) {
    const reply = `⏳ Server vừa có báo cáo — thử lại sau **${Math.ceil(waitMs / 1000)}s**.`;
    if (source.deferred || source.replied) return;
    return source.reply?.({ content: reply, ephemeral: true });
  }
  if (running.has(guild.id)) {
    return source.reply?.({
      content: "⏳ Một báo cáo khác đang chạy — chờ chút nhé.",
      ephemeral: true,
    });
  }
  running.add(guild.id);
  lastReportAt.set(guild.id, Date.now());

  const isSlash = typeof source.deferReply === "function";
  try {
    // Slash: defer ngay (AI có thể mất 30-45s); prefix: reply "đang quét".
    if (isSlash) {
      await source.deferReply().catch(() => {});
    } else {
      await source
        .reply?.("🔍 **Đang quét** hàng trăm tin nhắn gần đây + dữ liệu phạt 24h…")
        .catch(() => {});
    }

    const config = await store.getConfig(guild.id);
    const lockdownActive = isLockedActive(guild);
    const [focusLines, chatLines, audit] = await Promise.all([
      collectFocusChannel(source.channel),
      collectRecentMessages(guild, source.channel?.id),
      loadAuditData(store, guild.id),
    ]);

    const prompt = buildPrompt({
      guildName: guild.name,
      memberCount: guild.memberCount,
      focusLines,
      chatLines,
      ...auditSummary(audit.events, audit.modActions),
      userNote,
      lockdownActive,
      reportLang: lang.langForGuild(guild),
    });
    const raw = await askAI(prompt);
    const analysis = parseAnalysis(raw);

    const embed = buildReportEmbed({
      guild,
      analysis,
      events: audit.events,
      modActions: audit.modActions,
      msgCount: focusLines.length + chatLines.length,
      aiUsed: Boolean(raw),
      userNote,
      requester: user,
      emergency: false,
      lockdownActive,
    });

    const payload = { embeds: [embed] };
    if (isSlash) await source.editReply?.(payload).catch(() => {});
    else await source.channel?.send?.(payload).catch(() => {});

    // Log kèm hạng mục general.
    if (config) await sendLog(guild, config, embed, "general").catch(() => {});
  } catch (e) {
    console.error("[report]", e.message);
    const msg = "❌ Không tạo được báo cáo — thử lại sau.";
    if (isSlash) await source.editReply?.({ content: msg, embeds: [] }).catch(() => {});
    else await source.reply?.(msg).catch(() => {});
  } finally {
    running.delete(guild.id);
  }
}

/** Lockdown có đang hiệu lực không (đọc từ module lockdown của bot). */
function isLockedActive(guild) {
  try {
    const { isLocked } = require("../lockdown");
    return isLocked(guild.id);
  } catch {
    return false;
  }
}

/**
 * Phân tích output AI thành { level, security, punishmentReview, recommendation }.
 * AI trả tự do text 3 mục → parse; thất bại → null (embed dùng fallback text).
 */
function parseAnalysis(raw) {
  if (!raw) return null;
  const text = String(raw).trim();
  const pick = (re) => {
    const m = text.match(re);
    return m?.[1]?.trim() || undefined;
  };
  const security =
    pick(/🛡️?\s*An ninh[\s:]*\n?([\s\S]*?)(?=\n⚖️|\n💡|$)/i) ??
    pick(/An ninh[\s:]*\n?([\s\S]*?)(?=\n⚖️|\n💡|$)/i);
  const punishmentReview =
    pick(/⚖️?\s*Đánh giá phạt[\s:]*\n?([\s\S]*?)(?=\n💡|$)/i) ??
    pick(/Đánh giá phạt[\s:]*\n?([\s\S]*?)(?=\n💡|$)/i);
  const recommendation =
    pick(/💡?\s*Khuyến nghị[\s:]*\n?([\s\S]*)$/i) ?? pick(/Khuyến nghị[\s:]*\n?([\s\S]*)$/i);
  const lower = text.toLowerCase();
  // Kiểm tra theo TỪNG câu: câu chứa từ khóa phải KHÔNG bị phủ định trong chính
  // nó ("không thấy phạt nhầm" ≠ misfire, "không có raid" ≠ raid).
  const sentences = lower.split(/[.!?\n]+/).filter((s) => s.trim().length > 0);
  const misfireRe = /phạt nhầm|phạt oan|bị phạt oan|nhầm lẫn|dương tính giả|misfire|gỡ phạt/;
  const raidRe = /raid|nuke|đang bị tấn công|tấn công có tổ chức|làn sóng/;
  const negRe =
    /không (có|thấy|phát hiện|đánh giá|nhận thấy)|chưa có|ổn định|yên bình|đã (qua|dập tắt|kiểm soát|hạ nhiệt)/;
  const hit = (re) => sentences.some((s) => re.test(s) && !negRe.test(s));
  const raidHit = hit(raidRe);
  const misfireHit = hit(misfireRe);
  // Raid xác nhận quan trọng hơn misfire → ưu tiên raid khi cả hai cùng xuất hiện.
  const level = raidHit ? "raid" : misfireHit ? "misfire" : "calm";
  return { level, security, punishmentReview, recommendation };
}

module.exports = {
  reportInteractive,
  emergencyRaidAlert,
  // Xuất cho test hermetic: luật kẹp phải khớp convex/reports.ts.
  clampReportMinIntervalMin,
  clampReportMinEvents,
};
