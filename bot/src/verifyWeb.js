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

/**
 * Payload hiển thị chung cho DM và tin nhắn ephemeral trong kênh.
 *
 * Vì sao tách: cùng một nội dung nhưng kênh hiển thị cần ghi rõ "link riêng
 * chỉ bạn thấy" — người dùng phải biết token không công khai. Nội dung nêu
 * đúng dữ liệu được xử lý (IP thô không lưu, IP gửi một lần tới ipapi.is) để
 * consent trên trang web không phải lần đầu họ nghe về việc này.
 */
function buildVerifyMessage(member, session, { ephemeral = false } = {}) {
  const minutes = Math.max(1, Math.round((session.expiresAt - Date.now()) / 60_000));
  const embed = new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setTitle("🔐 Xác minh để vào server")
    .setDescription(
      `Chào **${member.user?.username ?? "bạn"}**! Nhấn nút bên dưới để xác minh và nhận quyền truy cập **${member.guild.name}**.\n\n` +
        "Trang xác minh sẽ kiểm tra kết nối và thiết bị để chặn tài khoản giả, VPN và tài khoản phụ. " +
        "IP thô **không được lưu** — chỉ lưu giá trị băm một chiều tách theo server. " +
        "IP được gửi **một lần** tới ipapi.is để tra VPN/proxy/Tor.",
    )
    .setFooter({
      text: ephemeral
        ? `Link riêng chỉ bạn thấy · hết hạn sau ${minutes} phút · dùng một lần`
        : `Link hết hạn sau ${minutes} phút · dùng một lần`,
    });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel("Xác minh ngay").setStyle(ButtonStyle.Link).setURL(session.url),
  );

  return { embeds: [embed], components: [row] };
}

/** Gửi DM chứa link verify. Trả false khi người dùng chặn DM. */
async function sendVerifyDm(member, config, session) {
  if (!member || !session) return false;
  const last = dmSentAt.get(member.id) ?? 0;
  if (Date.now() - last < DM_COOLDOWN_MS) return false;
  dmSentAt.set(member.id, Date.now());

  try {
    await member.send(buildVerifyMessage(member, session));
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
 * Nhắc thành viên nhận link khi bot không gửi được DM.
 *
 * KHÔNG đăng link/token vào kênh công khai — làm vậy bất kỳ ai đọc kênh cũng
 * xác minh thay được. Chỉ gửi mention + nút `verify_web_start`; khi bấm, bot
 * trả link trong tin nhắn ephemeral (chỉ người bấm thấy), không phụ thuộc DM.
 * Đây là đường thoát cho người chặn DM — trước đây họ bị kẹt vì nút cũ vẫn đòi
 * mở DM.
 */
async function notifyOpenDm(member, config) {
  const channelId = config?.verifyChannelId;
  if (!member?.guild || !channelId) return false;
  try {
    const guild = member.guild;
    const cached = guild.channels?.cache?.get?.(channelId);
    const channel =
      cached ||
      (guild.channels?.fetch ? await guild.channels.fetch(channelId).catch(() => null) : null);
    if (!channel?.send) return false;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("verify_web_start")
        .setLabel("Nhận link xác minh")
        .setStyle(ButtonStyle.Primary),
    );
    await channel.send({
      content:
        `<@${member.id}> Bot chưa gửi được link xác minh qua tin nhắn trực tiếp. ` +
        "Bấm nút bên dưới để nhận link **riêng trong kênh này** — chỉ bạn nhìn thấy.",
      components: [row],
      allowedMentions: { users: [member.id] },
    });
    return true;
  } catch (e) {
    console.warn(`[verifyWeb:dmNotice] ${member.guild.id}/${member.id}:`, e?.message || e);
    return false;
  }
}

/**
 * Cấp role đã xác minh + gỡ role chưa xác minh + gửi DM chào mừng.
 * Không dùng `roles.set` — nó xoá sạch role khác của thành viên.
 *
 * Trả `ok:false` khi Discord API thực sự từ chối cấp role. Bản cũ `.catch(() => {})`
 * rồi vẫn trả ok:true khiến dashboard/web báo thành công trong khi người dùng
 * không có quyền — đúng lỗi "nuốt lỗi Discord" cần chặn.
 */
async function grantVerified(member, config) {
  const unverifiedRoleId = config?.unverifiedRoleId;
  const verifiedRoleId = config?.verifiedRoleId;
  if (!verifiedRoleId) return { ok: false, note: "missing_verified_role", retryable: false };
  let note = "granted";
  if (unverifiedRoleId && member.roles.cache.has(unverifiedRoleId)) {
    try {
      await member.roles.remove(unverifiedRoleId, "Xác minh web thành công");
    } catch (e) {
      // Role verified vẫn có thể cấp được; giữ unverified là lỗi cấu hình cần
      // admin thấy nhưng không biến một lượt verify thành công thành thất bại.
      note = "granted_unverified_remove_failed";
      console.warn(`[verifyWeb:grant] gỡ unverified ${member.guild.id}/${member.id}:`, e?.message);
    }
  }
  if (!member.roles.cache.has(verifiedRoleId)) {
    try {
      await member.roles.add(verifiedRoleId, "Xác minh web thành công");
    } catch (e) {
      console.error(`[verifyWeb:grant] cấp role ${member.guild.id}/${member.id}:`, e?.message);
      return { ok: false, note: "role_add_failed", retryable: true };
    }
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
  return { ok: true, note };
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
 * Trả `{ applied, note, retryable? }` để `botFinishGrant` ghi audit. Mọi nhánh
 * đều phải trả về — nuốt im lặng làm phiên kẹt `grantPending=false` mà không
 * ai biết. `applied` chỉ true khi Discord API đã xác nhận thành công.
 */
async function applyGrant(client, store, grant) {
  const guild = client.guilds.cache.get(grant.guildId);
  if (!guild) return { applied: false, note: "bot_not_in_guild" };
  const config = (await store.getConfig(grant.guildId).catch(() => null)) || {};
  const member = await guild.members.fetch(grant.userId).catch(() => null);
  const reason = punishReason(grant);

  const banById = async () => {
    try {
      await guild.bans.create(grant.userId, { reason, deleteMessageSeconds: 0 });
      return { applied: true, note: "banned" };
    } catch (e) {
      console.error(`[verifyWeb:ban] ${grant.guildId}/${grant.userId}:`, e?.message);
      return { applied: false, note: "ban_failed", retryable: true };
    }
  };

  if (grant.decision === "ban" || grant.punish === "ban") return banById();

  if (grant.decision === "allow") {
    if (!member) return { applied: false, note: "left_before_grant", retryable: false };
    const result = await grantVerified(member, config);
    return {
      applied: result.ok,
      note: result.note,
      retryable: result.retryable === true,
    };
  }

  // Deny không kèm hình phạt = chỉ chặn xác minh, KHÔNG kick. Đây là nhánh
  // dùng cho IP dùng chung/CGNAT, IP ban chế độ "chỉ từ chối" và bẫy người
  // thật — những trường hợp không đủ bằng chứng để phạt tài khoản.
  if (!grant.punish) return { applied: true, note: "denied_no_action" };
  if (!member) return { applied: false, note: "left_before_punish", retryable: false };
  switch (grant.punish) {
    case "kick":
      try {
        await member.kick(reason);
        return { applied: true, note: "kicked" };
      } catch (e) {
        console.error(`[verifyWeb:kick] ${grant.guildId}/${grant.userId}:`, e?.message);
        return { applied: false, note: "kick_failed", retryable: true };
      }
    case "timeout": {
      const minutes = Math.max(1, Math.min(10080, config.altTimeoutMinutes ?? 60));
      try {
        await member.timeout(minutes * 60_000, reason);
        return { applied: true, note: "timed_out" };
      } catch (e) {
        console.error(`[verifyWeb:timeout] ${grant.guildId}/${grant.userId}:`, e?.message);
        return { applied: false, note: "timeout_failed", retryable: true };
      }
    }
    case "verify": {
      // Ép xác minh lại: gỡ role đã xác minh, gán lại role chưa xác minh.
      const unverified = config.unverifiedRoleId;
      let failed = false;
      if (unverified) {
        try {
          await member.roles.add(unverified, reason);
        } catch (e) {
          failed = true;
          console.error(`[verifyWeb:reverify] ${grant.guildId}/${grant.userId}:`, e?.message);
        }
      }
      if (config.verifiedRoleId) {
        try {
          await member.roles.remove(config.verifiedRoleId, reason);
        } catch (e) {
          failed = true;
          console.error(`[verifyWeb:reverify] ${grant.guildId}/${grant.userId}:`, e?.message);
        }
      }
      return failed
        ? { applied: false, note: "reverify_failed", retryable: true }
        : { applied: true, note: "reverify" };
    }
    default:
      // Giá trị lạ không được biến thành kick: chỉ hành động khi admin đã chọn
      // hình phạt cụ thể. Deny trần trụi là "không cho verify", không phải "kick".
      return { applied: true, note: "denied_no_action" };
  }
}

/**
 * Vòng tick: claim → thi hành → đóng phiên.
 *
 * Lỗi bất ngờ trong `applyGrant` vẫn phải gọi `botFinishGrant` với
 * `retryable=true`; nếu chỉ log rồi bỏ qua, phiên đã bị claim sẽ nằm chết
 * (`grantPending=false`) và người dùng không bao giờ nhận được role.
 */
async function processVerifyGrants(client, store, grants) {
  if (!Array.isArray(grants) || grants.length === 0) return 0;
  let done = 0;
  for (const grant of grants) {
    try {
      const claim = await store.client.mutation("verify:botClaimGrant", { id: grant.id });
      if (!claim?.ok) continue;
      let result;
      try {
        result = await applyGrant(client, store, grant);
      } catch (e) {
        console.error(`[verifyWeb:grant] ${grant?.guildId}/${grant?.userId}:`, e?.message || e);
        result = { applied: false, note: "grant_exception", retryable: true };
      }
      await store.client.mutation("verify:botFinishGrant", {
        id: grant.id,
        applied: result.applied,
        retryable: result.retryable === true,
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
  buildVerifyMessage,
  createSession,
  grantVerified,
  isPrivileged,
  notifyOpenDm,
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
