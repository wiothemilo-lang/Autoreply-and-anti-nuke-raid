/**
 * verifyWeb.js — phía bot của luồng xác minh web kiểu Double Counter.
 *
 * Chia làm 3 việc, tất cả đều KHÔNG chứa logic quyết định (quyết định nằm ở
 * `convex/verifyPolicy.ts` — một nguồn sự thật duy nhất):
 *   1. Tạo phiên + gửi DM link `/verify/<token>`.
 *   2. Thi hành kết quả phiên đã có (cấp role / kick / ban / timeout).
 *   3. Đồng bộ danh sách ban của guild để phát hiện ban evasion.
 *
 * Vì sao bot phải làm bước 2 chứ không phải Convex: Convex không có Discord
 * client. Convex quyết định + ghi cờ `grantPending`; bot tick đọc cờ, thi hành
 * rồi đóng phiên (`botFinishGrant`). Cùng khuôn với backup/panel/ticket.
 */

const {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  Colors,
} = require("discord.js");

/**
 * Gốc dashboard để dựng link verify.
 *
 * Đặt qua `DASHBOARD_URL` trên VPS; mặc định là domain production để link trong
 * DM không bao giờ trỏ vào localhost khi quên cấu hình.
 */
const DASHBOARD_URL = String(process.env.DASHBOARD_URL || "https://protogon.freebuff.app").replace(
  /\/+$/,
  "",
);

/** Chống spam DM: 1 link / 60s / user (bấm nút 10 lần không nhận 10 DM). */
const DM_COOLDOWN_MS = 60_000;
const dmSentAt = new Map();

function sweepDmCooldown(now = Date.now()) {
  let removed = 0;
  for (const [userId, at] of dmSentAt) {
    if (now - at > DM_COOLDOWN_MS * 5) {
      dmSentAt.delete(userId);
      removed += 1;
    }
  }
  return removed;
}

/** Owner / admin / bot — không bao giờ bị auto-ban vì IP. */
function isPrivileged(member) {
  if (!member?.guild) return false;
  if (member.id === member.guild.ownerId) return true;
  if (member.user?.bot) return true;
  try {
    return Boolean(
      member.permissions?.has?.("Administrator") || member.permissions?.has?.("ManageGuild"),
    );
  } catch {
    return false;
  }
}

/** Dựng URL công khai từ token — token đã URL-safe nên chỉ cần encode phòng hờ. */
function verifyUrl(token) {
  return `${DASHBOARD_URL}/verify/${encodeURIComponent(token)}`;
}

/**
 * Tạo phiên verify mới cho một thành viên.
 *
 * Trả `null` (không ném) khi server chưa bật/tắt tính năng — caller chỉ cần
 * "không gửi DM" thay vì phải bọc try/catch ở mọi chỗ gọi.
 */
async function createSession(store, member) {
  if (!member?.guild) return null;
  try {
    const result = await store.client.mutation("verify:botCreateSession", {
      guildId: member.guild.id,
      userId: member.id,
      privileged: isPrivileged(member),
    });
    if (!result?.token) return null;
    return { token: result.token, url: verifyUrl(result.token), expiresAt: result.expiresAt };
  } catch (e) {
    // Lỗi thường gặp: server chưa bật verify web, chưa đồng bộ guild. Không phải
    // sự cố cần báo động — nhưng vẫn log để chẩn đoán khi người dùng thắc mắc.
    console.warn(`[verifyWeb] tạo phiên ${member.guild.id}/${member.id}:`, e?.message || e);
    return null;
  }
}

/** Gửi DM chứa link verify. Trả false khi người dùng chặn DM. */
async function sendVerifyDm(member, config, session) {
  if (!member || !session) return false;
  const last = dmSentAt.get(member.id) ?? 0;
  if (Date.now() - last < DM_COOLDOWN_MS) return false;
  dmSentAt.set(member.id, Date.now());

  const minutes = Math.max(1, Math.round((session.expiresAt - Date.now()) / 60_000));
  const embed = new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setTitle("🔐 Xác minh để vào server")
    .setDescription(
      `Chào **${member.user?.username ?? "bạn"}**! Nhấn nút bên dưới để xác minh và nhận quyền truy cập **${member.guild.name}**.\n\n` +
        "Trang xác minh sẽ tự kiểm tra kết nối và thiết bị của bạn để chặn tài khoản giả, VPN và các tài khoản phụ. " +
        "Chúng tôi **không lưu địa chỉ IP** — chỉ lưu giá trị băm một chiều.",
    )
    .setFooter({ text: `Link hết hạn sau ${minutes} phút · dùng một lần` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel("Xác minh ngay").setStyle(ButtonStyle.Link).setURL(session.url),
  );

  try {
    await member.send({ embeds: [embed], components: [row] });
    return true;
  } catch {
    return false;
  }
}

/** Tạo phiên + gửi DM trong một lần gọi (dùng ở joinGate và nút panel). */
async function startVerification(store, member, config) {
  const session = await createSession(store, member);
  if (!session) return { ok: false, reason: "session_failed" };
  const sent = await sendVerifyDm(member, config, session);
  return { ok: sent, reason: sent ? "sent" : "dm_blocked", url: session.url };
}

/**
 * Cấp role đã xác minh + gỡ role chưa xác minh + gửi DM chào mừng.
 * Không dùng `roles.set` — nó xoá sạch role khác của thành viên.
 */
async function grantVerified(member, config) {
  const unverifiedRoleId = config?.unverifiedRoleId;
  const verifiedRoleId = config?.verifiedRoleId;
  if (!verifiedRoleId) return { ok: false, note: "missing_verified_role" };
  if (unverifiedRoleId && member.roles.cache.has(unverifiedRoleId)) {
    await member.roles.remove(unverifiedRoleId, "Xác minh web thành công").catch(() => {});
  }
  if (!member.roles.cache.has(verifiedRoleId)) {
    await member.roles.add(verifiedRoleId, "Xác minh web thành công").catch(() => {});
  }
  if (config.verifyWelcomeEnabled) {
    try {
      const title = config.verifyWelcomeTitle || "🌸 Chào mừng bạn!";
      let description =
        config.verifyWelcomeDescription ||
        `Chào mừng bạn đến với **${member.guild.name}**! Bạn đã xác minh thành công.`;
      description = description
        .replace(/{user}/g, `<@${member.id}>`)
        .replace(/{server}/g, member.guild.name);
      const colorInt = parseInt(
        String(config.verifyWelcomeColor || "#f2629e").replace("#", ""),
        16,
      );
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(Number.isFinite(colorInt) ? colorInt : 0xf2629e)
        .setThumbnail(member.guild.iconURL({ size: 256 }) || null)
        .setFooter({ text: member.guild.name });
      await member.send({ embeds: [embed] }).catch(() => {});
    } catch {
      // Người dùng chặn DM — không phải lỗi.
    }
  }
  return { ok: true, note: "granted" };
}

/** Lý do ghi vào audit Discord — không chứa hash/IP, chỉ mã quyết định. */
function punishReason(grant) {
  const base = `[Protogon Verify] ${grant.reason || grant.decision}`;
  return grant.linkedUserId
    ? `${base} — trùng tín hiệu với tài khoản ${grant.linkedUserId} (${grant.riskScore}/100)`
    : `${base} — rủi ro ${grant.riskScore}/100`;
}

/**
 * Thi hành một grant đã claim.
 *
 * Trả `{ applied, note }` để `botFinishGrant` ghi audit. Mọi nhánh đều phải
 * trả về — nuốt im lặng làm phiên kẹt `grantPending=false` mà không ai biết.
 */
async function applyGrant(client, store, grant) {
  const guild = client.guilds.cache.get(grant.guildId);
  if (!guild) return { applied: false, note: "bot_not_in_guild" };
  const config = (await store.getConfig(grant.guildId).catch(() => null)) || {};
  const member = await guild.members.fetch(grant.userId).catch(() => null);
  const reason = punishReason(grant);

  const banById = async () => {
    await guild.bans.create(grant.userId, { reason, deleteMessageSeconds: 0 }).catch(() => {});
    return { applied: true, note: "banned" };
  };

  if (grant.decision === "ban" || grant.punish === "ban") return banById();

  if (grant.decision === "allow") {
    if (!member) return { applied: false, note: "left_before_grant" };
    const result = await grantVerified(member, config);
    return { applied: result.ok, note: result.note };
  }

  // deny
  if (!member) return { applied: false, note: "left_before_punish" };
  switch (grant.punish) {
    case "kick":
      await member.kick(reason).catch(() => {});
      return { applied: true, note: "kicked" };
    case "timeout": {
      const minutes = Math.max(1, Math.min(10080, config.altTimeoutMinutes ?? 60));
      await member.timeout(minutes * 60_000, reason).catch(() => {});
      return { applied: true, note: "timed_out" };
    }
    case "verify": {
      // Ép xác minh lại: gỡ role đã xác minh, gán lại role chưa xác minh.
      const unverified = config.unverifiedRoleId;
      if (unverified) await member.roles.add(unverified, reason).catch(() => {});
      if (config.verifiedRoleId)
        await member.roles.remove(config.verifiedRoleId, reason).catch(() => {});
      return { applied: true, note: "reverify" };
    }
    default:
      // Không cấu hình hình phạt → mặc định kick: thành viên chưa qua cổng mà
      // vẫn ở trong server là lỗ hổng của cả tính năng.
      await member.kick(reason).catch(() => {});
      return { applied: true, note: "kicked_default" };
  }
}

/** Vòng tick: claim → thi hành → đóng phiên. */
async function processVerifyGrants(client, store, grants) {
  if (!Array.isArray(grants) || grants.length === 0) return 0;
  let done = 0;
  for (const grant of grants) {
    try {
      const claim = await store.client.mutation("verify:botClaimGrant", { id: grant.id });
      if (!claim?.ok) continue;
      const result = await applyGrant(client, store, grant);
      await store.client.mutation("verify:botFinishGrant", {
        id: grant.id,
        applied: result.applied,
        note: result.note,
      });
      done += 1;
    } catch (e) {
      console.error(`[verifyWeb:grant] ${grant?.guildId}/${grant?.userId}:`, e?.message || e);
    }
  }
  return done;
}

/** Bot ghi nhận ban/unban của Discord vào `guildBans` (phát hiện ban evasion). */
async function syncGuildBan(store, guildId, userId, active, reason) {
  if (!guildId || !userId) return;
  try {
    await store.client.mutation("verifyBans:botSyncGuildBan", {
      guildId,
      userId,
      active,
      reason: reason ? String(reason).slice(0, 300) : undefined,
    });
  } catch (e) {
    console.warn(`[verifyWeb:banSync] ${guildId}:`, e?.message || e);
  }
}

/**
 * Quét bù toàn bộ danh sách ban của một guild (chạy 1 lần/ngày trong tick).
 * Bắt các ban được thực hiện tay trên UI Discord khi bot offline.
 */
async function resyncGuildBans(store, guild) {
  try {
    const bans = await guild.bans.fetch({ limit: 5000, cache: false });
    const ids = [...bans.keys()];
    await store.client.mutation("verifyBans:botReplaceGuildBans", {
      guildId: guild.id,
      userIds: ids,
    });
    return ids.length;
  } catch (e) {
    console.warn(`[verifyWeb:banResync] ${guild.id}:`, e?.message || e);
    return 0;
  }
}

module.exports = {
  DASHBOARD_URL,
  applyGrant,
  createSession,
  grantVerified,
  isPrivileged,
  processVerifyGrants,
  resyncGuildBans,
  sendVerifyDm,
  startVerification,
  syncGuildBan,
  verifyUrl,
  // Test hooks (convention _…ForTest)
  _sweepDmCooldownForTest: sweepDmCooldown,
  _punishReasonForTest: punishReason,
};
