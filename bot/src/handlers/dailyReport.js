const { EmbedBuilder, Colors } = require("discord.js");
const { sendLog } = require("../util");
const { MODULE_LABELS } = require("./antinuke");
const { heatSettings } = require("../heat");

const MIN_INTERVAL_MS = 20 * 60 * 60 * 1000; // don't report more than once per ~20h
const WINDOW_MS = 24 * 60 * 60 * 1000;
const TIER_EMOJI = { warn: "⚠️", timeout: "⏸️", kick: "👢", ban: "🚫" };

/**
 * Gửi báo cáo cho MỘT guild nếu đến hạn (đọc cache config như cũ). Tách khỏi
 * vòng lặp để HAI đường gọi dùng chung logic:
 *   1. Lượt khởi động 15s sau ready (giữ nguyên hành vi cũ).
 *   2. Cờ `reportRequestedAt` do cron Convex đặt (đợt #4) — xử lý trong tick.
 * Trả về true nếu đã gửi thật (đã ghi `botSetReportAt` — nơi xoá cờ cron).
 */
async function runDailyReportForGuild(client, store, heat, guildId) {
  const now = Date.now();
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return false; // bot đã rời server — không còn gì để báo

  const config = await store.getConfig(guildId);
  if (!config || !config.logChannelId || config.dailyReportEnabled === false) return false;

  const lastAt = config.lastReportAt || now - WINDOW_MS;
  if (now - lastAt < MIN_INTERVAL_MS) return false; // not due yet

  // Chỉ query sự kiện cho guild ĐẾN HẠN (per-guild, không query global
  // cho mọi guild mỗi 10 phút — tiết kiệm hàng triệu operations/tháng).
  const events = await store.client
    .query("reports:getGuildEvents", {
      guildId,
      since: now - 48 * 60 * 60 * 1000,
      limit: 500,
    })
    .catch(() => []);
  const list = (events || []).filter((e) => e.createdAt >= lastAt);
  await sendReport(guild, config, list, lastAt, now, heat);
  await store.client.mutation("bot_writes:botSetReportAt", { guildId, at: now });
  return true;
}

async function runDailyReports(client, store, heat) {
  for (const guild of client.guilds.cache.values()) {
    try {
      await runDailyReportForGuild(client, store, heat, guild.id);
    } catch (err) {
      console.error(`[report] ${guild.id}:`, err.message);
    }
  }
}

/**
 * Xử lý cờ báo cáo do cron Convex đặt (`bot_tick.getPendingJobs.reports`).
 * Lỗi một guild không chặn các guild còn lại; guild bot đã rời thì bỏ qua.
 * Cờ CHỈ được xoá khi gửi thành công (bên trong `botSetReportAt`) — gửi hỏng
 * hay đang tắt báo cáo thì cờ còn nguyên để lượt sau thử lại, không im lặng
 * bỏ mất báo cáo còn nợ.
 */
async function processReportJobs(client, store, heat, items) {
  for (const item of items || []) {
    const guildId = item?.guildId;
    if (!guildId) continue;
    try {
      const sent = await runDailyReportForGuild(client, store, heat, guildId);
      if (sent) console.log(`[report] đã gửi theo cờ cron: ${guildId}`);
    } catch (err) {
      console.error(`[report] ${guildId}:`, err?.message || err);
    }
  }
}

async function sendReport(guild, config, list, from, to, heat) {
  const embed = new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setTitle("📊 Báo cáo Anti-Nuke hằng ngày")
    .setDescription(`**${guild.name}** — ${formatDate(to)}`);

  // Nhiệt độ + warn tích lũy của từng thành viên (đọc trực tiếp từ tracker)
  const s = heatSettings(config);
  const heatRows = heat ? heat.heatSnapshot(guild.id, s) : [];
  const strikeRows = heat ? heat.strikeSnapshot(guild.id, s) : [];
  if (heatRows.length > 0 || strikeRows.length > 0) {
    const byId = new Map(heatRows.map((h) => [h.userId, h]));
    for (const st of strikeRows) {
      if (!byId.has(st.userId)) byId.set(st.userId, { userId: st.userId, heat: 0 });
    }
    const merged = [...byId.values()]
      .map((h) => {
        const st = strikeRows.find((x) => x.userId === h.userId);
        const heatPart =
          h.heat > 0
            ? `${TIER_EMOJI[h.tier] || "🔥"} Nhiệt **${h.heat}/100**${h.tier ? ` (${h.tier})` : ""}`
            : "🔥 Nhiệt **0/100**";
        const strikePart = st && st.count > 0 ? ` ⚠️ Warn **${st.count}/${st.limit}**` : "";
        return {
          userId: h.userId,
          heat: h.heat,
          line: `<@${h.userId}> — ${heatPart}${strikePart}`,
        };
      })
      .sort((a, b) => b.heat - a.heat)
      .slice(0, 15)
      .map((x) => x.line)
      .join("\n")
      .slice(0, 1024);
    if (merged) {
      embed.addFields({ name: "🔥 Nhiệt độ & warn tích lũy", value: merged });
    }
  }

  if (list.length === 0) {
    embed
      .setColor(Colors.Green)
      .setDescription(
        `${embed.data.description}\n\n🎉 **Server bình yên!** Không có sự kiện chống nuke nào trong kỳ báo cáo.`,
      );
  } else {
    const byModule = new Map();
    for (const e of list) {
      if (!byModule.has(e.module)) byModule.set(e.module, { total: 0, actions: {} });
      const m = byModule.get(e.module);
      m.total += 1;
      m.actions[e.action] = (m.actions[e.action] || 0) + 1;
    }
    const moduleLines = [...byModule.entries()].map(([key, m]) => {
      const actions = Object.entries(m.actions)
        .map(([a, n]) => `${a} (${n})`)
        .join(", ");
      return `🛡️ **${MODULE_LABELS[key] || key}** — ${m.total} sự kiện — ${actions}`;
    });

    const offenders = new Map();
    for (const e of list) {
      if (!e.executorId) continue;
      offenders.set(e.executorId, (offenders.get(e.executorId) || 0) + 1);
    }
    const top = [...offenders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    embed.addFields(
      { name: "Tổng sự kiện", value: `${list.length}`, inline: true },
      { name: "Module kích hoạt", value: `${byModule.size}`, inline: true },
      { name: "Khóa kênh khi raid", value: config.lockdownEnabled ? "Bật" : "Tắt", inline: true },
      { name: "Chi tiết theo module", value: moduleLines.join("\n").slice(0, 1024) || "—" },
      ...(top.length
        ? [
            {
              name: "Thủ phạm thường xuyên",
              value: top
                .map(([id, n]) => `<@${id}> — ${n} sự kiện`)
                .join("\n")
                .slice(0, 1024),
            },
          ]
        : []),
    );
  }

  embed.setFooter({ text: "Báo cáo tự động từ Protogon" });
  await sendLog(guild, config, embed);
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString("vi-VN", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

module.exports = { runDailyReports, runDailyReportForGuild, processReportJobs };
