"use strict";
/**
 * ownerAlert.js — DM KHẨN CHO OWNER khi server bị tấn công.
 *
 * Vì sao cần: emergencyRaidAlert (incidentReport.js) gửi cảnh báo vào KÊNH LOG
 * + @everyone — nhưng kẻ nuke có quyền quản lý thường XOÁ KÊNH LOG hoặc tự gỡ
 * webhook trước khi phá. Owner (người chịu trách nhiệm cuối cùng) có thể không
 * biết gì cho tới khi vào lại server. DM cho owner là kênh không thể bị xoá
 * từ bên trong server — kẻ tấn công không chặn được.
 *
 * Nguồn sự kiện (2 điểm nối, xem afterPunishHooks + handleAttributeEvent):
 *   1. Nuke/raid xác nhận (massBan, massChannelDelete, externalAppRaid…)
 *   2. Thủ phạm là OWNER/ADMIN/whitelist — bot cố tình KHÔNG phạt nhóm này
 *      (tránh phạt oan chủ server/mod hợp pháp) nhưng hành vi nuke vẫn phải
 *      báo: owner biết kẻ có quyền quản lý đang phá server là thông tin sống còn.
 *
 * Thiết kế:
 *   - Cooldown 5 phút/guild — 1 vụ raid kích nhiều module không spam DM.
 *   - Tôn trọng toggle emergencyAlertEnabled (web Settings đã có sẵn).
 *   - DM thất bại (owner tắt DM từ bot) → fallback gửi vào kênh log.
 *   - Fire-and-forget: không bao giờ chặn pipeline xử phạt.
 *   - 0 token AI (khác emergencyRaidAlert có AI tổng hợp) — DM là tín hiệu
 *     "dậy ngay", nội dung chi tiết đã ở kênh log + /report.
 */

const { Colors, PermissionFlagsBits } = require("discord.js");
const { logEmbed, sendLog } = require("../../util");
const { MODULE_LABELS } = require("./shared");

/** Chờ giữa 2 DM khẩn cùng guild — một vụ raid kích nhiều module chỉ DM 1 lần. */
const COOLDOWN_MS = 5 * 60_000;

/**
 * DM "NGƯỜI CÓ QUYỀN đang phá server" là tín hiệu KHÁC HẲN DM "server đang bị
 * raid": cả hai đều gọi alertOwner nhưng phải KHÔNG đá nhau. Trước đây cùng
 * một map cooldown 5 phút nên vụ raid thật có thể bị DM thủ phạm-có-quyền nuốt
 * mất (hoặc ngược lại) — mất đúng thứ chủ server cần nhất.
 */
const EXEMPT_COOLDOWN_MS = 15 * 60_000;

/** guildId -> timestamp DM gần nhất. */
const lastAlertAt = new Map();

/** Dọn guild đã rời (memGuard gọi) — trả về số entry đã xoá. */
function pruneCache(liveGuildIds) {
  let removed = 0;
  for (const key of [...lastAlertAt.keys()]) {
    // Key có thể kèm hậu tố (vd `123:privileged`) — lấy guildId phần trước dấu ":" đầu.
    const guildId = key.split(":")[0];
    if (!liveGuildIds.has(guildId)) {
      lastAlertAt.delete(key);
      removed++;
    }
  }
  return removed;
}

/** Test hook (convention _…ForTest): xoá sạch state giữa các case. */
function _ownerAlertForTest() {
  lastAlertAt.clear();
}

/**
 * DM khẩn cho owner. Trả về true khi gửi thành công (DM hoặc fallback log).
 * @param {object} opts { guild, module, summary, executorId?, executorName?, privileged? }
 */
async function alertOwner(client, store, opts = {}) {
  try {
    const { guild, module, summary, executorId, executorName, privileged } = opts;
    if (!guild || !store) return false;
    const cdKey = opts.cooldownKey ?? guild.id;
    const cdMs = opts.cooldownMs ?? COOLDOWN_MS;
    const config = await store.getConfig(guild.id);
    if (!config) return false;
    // Tôn trọng toggle — chủ server tắt cảnh báo khẩn thì cả DM cũng tắt.
    if (config.emergencyAlertEnabled === false) return false;
    // Đánh dấu cooldown SAU khi đã biết chắc sẽ gửi. Đánh dấu trước khi đọc
    // cấu hình nghĩa là 1 lần đọc lỗi (Convex quá tải đúng lúc raid) ăn mất
    // suất DM của cả đợt — mà DM là kênh DUY NHẤT còn lại khi kẻ nuke đã xoá
    // kênh log. Check + set dồn 1 chỗ sau await: vẫn chống trùng khi nhiều
    // module cùng cảnh báo (đoạn này chạy đồng bộ, không có await lần nào).
    const now = Date.now();
    if (now - (lastAlertAt.get(cdKey) ?? 0) < cdMs) return false;
    lastAlertAt.set(cdKey, now);

    const title = privileged
      ? "⚠️ Người có quyền quản lý đang phá server!"
      : "🚨 Server đang bị tấn công!";
    const lines = [
      `**Server:** ${guild.name} (${guild.memberCount ?? "?"} thành viên)`,
      `**Loại:** ${summary || module || "raid/nuke"}`,
    ];
    if (executorId) {
      lines.push(
        `**Thủ phạm:** ${executorName ? `${executorName} (` : ""}<@${executorId}>${executorName ? ")" : ""}`,
      );
    }
    if (privileged) {
      lines.push(
        "> Bot **không phạt** người này (owner/whitelist/admin bị miễn để tránh phạt oan hợp pháp). Nếu đây là tấn công thật, hãy gỡ quyền/whitelist ngay.",
      );
    } else {
      lines.push("> Bot đã xử lý tự động. Chi tiết + báo cáo AI: kênh log trong server.");
    }

    const embed = logEmbed({
      title,
      description: lines.join("\n"),
      color: privileged ? Colors.Orange : Colors.Red,
      fields: [{ name: "Thời điểm", value: `<t:${Math.floor(now / 1000)}:F>`, inline: false }],
      footer: "Protogon · Owner Alert",
    });

    // DM owner trước — kênh không bị xoá được từ trong server.
    const owner = await client.users.fetch(guild.ownerId).catch(() => null);
    if (owner) {
      const sent = await owner
        .send({ embeds: [embed] })
        .then(() => true)
        .catch(() => false);
      if (sent) {
        console.log(
          `[ownerAlert] ${guild.id}: đã DM owner${privileged ? " (privileged executor)" : ""}`,
        );
        return true;
      }
    }
    // Owner tắt DM từ bot → fallback kênh log (vẫn tốt hơn im lặng).
    await sendLog(guild, config, embed, "raid").catch(() => {});
    console.log(`[ownerAlert] ${guild.id}: DM thất bại — fallback kênh log`);
    return true;
  } catch (e) {
    console.error("[ownerAlert]", e.message);
    return false;
  }
}

/**
 * Cảnh báo owner cho hành vi nuke của người ĐƯỢC MIỄN (owner/whitelist/admin).
 *
 * Vì sao cần: bot cố ý không phạt nhóm này để tránh phạt oan chủ server/mod
 * hợp pháp — nhưng im lặng thì chủ server mất toàn bộ tín hiệu, mà kẻ có quyền
 * quản lý thì xoá được cả kênh log. Tách thành helper dùng chung để MỌI lớp
 * gặp "thủ phạm bị miễn" đều báo giống nhau, không tùy từng handler tự nhớ.
 *
 * Dùng `recordExempt` (bucket riêng theo executor) chứ không `record()`: bucket
 * của record() gộp mọi executor theo `guildId:module`, nên hành vi của người
 * được miễn sẽ vô tình đẩy ngưỡng phạt của người khác lên.
 */
function createPrivilegedAlert({ client, store, state }) {
  const { recordExempt } = state;
  return async function alertPrivilegedExecutor(guild, config, executor, module, moduleCfg) {
    if (!guild || !executor || executor.id === client.user.id) return;
    const count = recordExempt(guild.id, module, moduleCfg, executor.id);
    const em = await guild.members.fetch(executor.id).catch(() => null);
    const privileged =
      executor.id === guild.ownerId ||
      (config?.whitelistUsers || []).includes(executor.id) ||
      (em &&
        (em.permissions?.has?.(PermissionFlagsBits.Administrator) ||
          (config?.adminRoles || []).some((id) => em.roles?.cache.has(id))));
    if (privileged && count >= moduleCfg.threshold) {
      void alertOwner(client, store, {
        guild,
        module,
        summary: MODULE_LABELS[module] + " — " + count + " lượt (nhóm miễn trừ)",
        executorId: executor.id,
        executorName: executor.username ?? executor.user?.username,
        privileged: true,
        // Cooldown RIÊNG: tín hiệu "người có quyền" không được nuốt mất DM
        // "server đang bị raid" (và ngược lại).
        cooldownKey: `${guild.id}:privileged`,
        cooldownMs: EXEMPT_COOLDOWN_MS,
      });
    }
  };
}

module.exports = {
  alertOwner,
  createPrivilegedAlert,
  pruneCache,
  COOLDOWN_MS,
  EXEMPT_COOLDOWN_MS,
  _ownerAlertForTest,
};
