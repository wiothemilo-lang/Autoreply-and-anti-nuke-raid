/**
 * backupCapture.js — chụp cấu trúc server (role/kênh/tin/thread/ban/invite) và
 * tạo bản backup lên cloud (`runBackup`). Tách từ handlers/backup.js (đợt #5) —
 * code giữ nguyên hành vi.
 *
 * Luồng: snapshotGuild → snapshotWithSettings (kèm cấu hình bot) → nén + lưu
 * Convex (`botStoreBackup`, có checksum để incremental skip) → tùy chọn đẩy
 * GitHub Gist → báo log/dashboard.
 */
const { Colors, ChannelType } = require("discord.js");
const { logEmbed } = require("./util");
const { compressAndEncryptBackup, computeSnapshotChecksum } = require("./backupUtils");
const {
  MAX_MESSAGES_PER_THREAD,
  MAX_THREADS_PER_CHANNEL,
  MAX_MEMBERS_PER_BACKUP,
  MAX_ROLES_PER_MEMBER,
  myPermissionBits,
  safeGuildIconUrl,
  sendToLog,
} = require("./backupCommon");

/**
 * Gọi một phương thức trả URL của guild (bannerURL/splashURL…) một cách an toàn:
 * mock hoặc phiên bản client cũ có thể thiếu hàm / ném — đây chỉ là ảnh trang
 * trí, KHÔNG được làm hỏng cả lần chụp backup.
 */
function safeGuildUrl(guild, method, size) {
  try {
    const fn = guild?.[method];
    return typeof fn === "function" ? (fn.call(guild, { size }) ?? null) : null;
  } catch (e) {
    console.error(`[backup:${method}] ${guild?.name ?? "?"}:`, e.message);
    return null;
  }
}

const CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildVoice,
  ChannelType.GuildCategory,
  ChannelType.GuildStageVoice,
  ChannelType.GuildForum,
];

/** Số tin nhắn tối đa chụp mỗi kênh văn bản khi backup kèm tin nhắn. */
const MAX_MESSAGES_PER_CHANNEL = 50;
/** Tổng tin nhắn tối đa của một backup (chống phình JSON). */
const TOTAL_MESSAGE_CAP = 3000;

/** Đọc tin nhắn của một kênh văn bản (mới nhất, sắp tăng dần theo thời gian). */
async function captureChannelMessages(channel, limit) {
  const out = [];
  try {
    const fetched = await channel.messages.fetch({ limit });
    const list = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    for (const m of list) {
      const attachments =
        (m.attachments?.size ?? 0) > 0 ? m.attachments.map((a) => a.url).slice(0, 3) : [];
      out.push({
        id: m.id,
        authorId: m.author?.id ?? null,
        authorName: m.author?.username ?? "?",
        timestamp: m.createdTimestamp,
        content: (m.content || "").slice(0, 2000),
        attachments,
      });
    }
  } catch (e) {
    console.error(`[backup:messages] #${channel.name}:`, e.message);
  }
  return out;
}

/**
 * Chụp các THREAD đang hoạt động của một kênh (text/announcement/forum).
 * Thread là nơi cộng đồng thật sự dùng — server bị nuke thường mất trọn thread
 * cùng lịch sử trò chuyện trong đó. `threads` cache có sẵn với kênh forum,
 * còn kênh văn bản phải gọi fetchActive().
 */
async function captureThreads(channel, messageLimit, threadCap) {
  const out = [];
  try {
    let active = null;
    if (typeof channel.threads?.fetchActive === "function") {
      active = await channel.threads.fetchActive();
    } else if (channel.threads?.cache) {
      active = channel.threads.cache;
    }
    // PHẢI lấy .values(): spread Collection/Map ra là CẶP [key, value], không
    // phải thread — lặp như vậy sẽ bỏ sạch thread mà không báo lỗi gì.
    const list = active ? [...(active.values?.() ?? active)] : [];
    for (const t of list.slice(0, threadCap)) {
      if (!t?.name) continue;
      const entry = {
        id: t.id,
        name: String(t.name).slice(0, 100),
        archived: !!t.archived,
        autoArchiveDuration: t.autoArchiveDuration ?? 1440,
        messageCount: t.messageCount ?? 0,
      };
      if (messageLimit > 0 && typeof t.messages?.fetch === "function") {
        const msgs = await captureChannelMessages(t, messageLimit);
        // Cắt lần nữa sau khi fetch: `limit` chỉ là ý định, Discord/Collection
        // mới là nơi thực sự tôn trọng nó — không cắt thì JSON phình ra mất kiểm soát.
        const capped = msgs.slice(-messageLimit);
        if (capped.length > 0) entry.messages = capped;
      }
      out.push(entry);
    }
  } catch (e) {
    console.error(`[backup:threads] #${channel.name}:`, e.message);
  }
  return out;
}

/** Chụp danh sách thành viên bị ban (cần quyền Ban Members — thiếu thì bỏ trống). */
async function captureBans(guild) {
  const out = [];
  try {
    const fetched = await guild.bans.fetch();
    for (const ban of fetched.values()) {
      const userId = ban.user?.id ?? ban.id;
      if (!userId) continue;
      out.push({
        userId,
        username: ban.user?.username ?? "?",
        reason: ban.reason ?? null,
      });
    }
  } catch (e) {
    // Thiếu quyền Ban Members là chuyện thường — chỉ ghi log, KHÔNG làm hỏng backup.
    console.error(`[backup:bans] ${guild.name}:`, e.message);
  }
  return out;
}

/**
 * Chụp bản đồ THÀNH VIÊN ↔ VAI TRÒ (P2).
 *
 * Vì sao cần: backup trước đây chỉ lưu role và kênh — khôi phục xong thì mọi
 * thành viên quay về quyền mặc định, mất hết mod/admin, mất luôn cấu hình
 * "ai là mod" vốn gắn với id role. Bản đồ này là thứ biến "server trống có
 * cấu trúc" thành "server có người và đúng vai trò".
 *
 * Chỉ giữ vai trò THUỘC `restorableRoleIds` (role thật trong danh sách `roles`):
 * @everyone và role của tích hợp (managed) không tạo lại được, giữ vào bản đồ
 * chỉ là rác. Thành viên KHÔNG có role nào trong danh sách thì không ghi — bản đồ
 * toàn những dòng rỗng chỉ phình dung lượng.
 *
 * `guild.members.fetch()` cần intent Guild Members; thiếu quyền/intent thì
 * hàm ném — bắt và đánh dấu `unavailable` để báo cáo nói rõ "không đọc được"
 * thay vì kệ, để chủ server tưởng đã lưu đủ vai trò.
 */
async function captureMemberRoles(guild, restorableRoleIds) {
  const out = { members: [], truncated: false, unavailable: false };
  if (!restorableRoleIds || restorableRoleIds.size === 0) return out;
  let list;
  try {
    if (typeof guild.members?.fetch === "function") {
      list = await guild.members.fetch();
    } else if (guild.members?.cache) {
      list = guild.members.cache;
    } else {
      out.unavailable = true;
      return out;
    }
  } catch (e) {
    console.error(`[backup:members] ${guild?.name ?? "?"}:`, e.message);
    out.unavailable = true;
    return out;
  }
  // PHẢI lấy .values(): spread Collection/Map ra là CẶP [key, value] chứ không
  // phải member — lặp như vậy sẽ ra danh sách rỗng mà không báo lỗi gì.
  const all = [...(list?.values?.() ?? list ?? [])];
  if (all.length > MAX_MEMBERS_PER_BACKUP) out.truncated = true;
  for (const m of all) {
    if (out.members.length >= MAX_MEMBERS_PER_BACKUP) break;
    const userId = m?.user?.id ?? m?.id;
    if (!userId) continue;
    const roleIds = [...(m.roles?.cache?.keys?.() ?? [])]
      .filter((id) => restorableRoleIds.has(id))
      .slice(0, MAX_ROLES_PER_MEMBER);
    if (roleIds.length === 0) continue;
    out.members.push({ userId, roles: roleIds });
  }
  return out;
}

/**
 * Chụp link mời đang mở (cần quyền Manage Guild). Mã invite cũ KHÔNG dùng lại
 * được sau khi server bị xoá, nên chỉ giữ để dựng lại link mới trỏ đúng kênh.
 */
async function captureInvites(guild) {
  const out = [];
  try {
    const fetched = await guild.invites.fetch();
    for (const inv of fetched.values()) {
      out.push({
        code: inv.code,
        channelName: inv.channel?.name ?? null,
        uses: inv.uses ?? 0,
        maxUses: inv.maxUses ?? 0,
        maxAge: inv.maxAge ?? 0,
        temporary: !!inv.temporary,
      });
    }
  } catch (e) {
    console.error(`[backup:invites] ${guild.name}:`, e.message);
  }
  return out;
}

/** Chụp toàn bộ cấu trúc server thành object JSON (kèm tin nhắn nếu được yêu cầu). */
async function snapshotGuild(guild, { includeMessages = false } = {}) {
  const myBits = myPermissionBits(guild);
  const roles = [...guild.roles.cache.values()]
    .filter((r) => r.name !== "@everyone" && !r.managed)
    .sort((a, b) => a.position - b.position)
    .map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      hoist: r.hoist,
      mentionable: r.mentionable,
      permissions: (BigInt(r.permissions.bitfield) & myBits).toString(),
      position: r.position,
      icon: r.iconURL({ size: 64 }) ?? null,
      unicodeEmoji: r.unicodeEmoji ?? null,
    }));

  const emojis = [...guild.emojis.cache.values()]
    .filter((e) => e.name && e.available !== false)
    .map((e) => ({
      id: e.id,
      name: e.name,
      animated: !!e.animated,
      url: e.imageURL({ size: 128, extension: e.animated ? "gif" : "png" }) ?? null,
    }));
  const stickers = [...guild.stickers.cache.values()]
    .map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description ?? null,
      tags: s.tags ?? null,
      formatType: s.format ?? null,
      url: s.url ?? null,
    }))
    .filter((s) => s.name && s.url);

  const channels = [];
  let messageTotal = 0;
  for (const c of [...guild.channels.cache.values()].sort((a, b) => a.position - b.position)) {
    if (!CHANNEL_TYPES.includes(c.type)) continue;
    const entry = {
      id: c.id,
      name: c.name,
      type: c.type,
      topic: c.topic ?? null,
      nsfw: c.nsfw ?? false,
      bitrate: c.bitrate ?? null,
      userLimit: c.userLimit ?? null,
      // Cấu hình kênh chi tiết (trước đây bị bỏ → khôi phục xong kênh mất
      // slowmode/region/chất lượng video/auto-archive/tag forum).
      rateLimitPerUser: typeof c.rateLimitPerUser === "number" ? c.rateLimitPerUser : null,
      rtcRegion: c.rtcRegion ?? null,
      videoQualityMode: c.videoQualityMode ?? null,
      defaultAutoArchiveDuration: c.defaultAutoArchiveDuration ?? null,
      defaultThreadRateLimitPerUser:
        typeof c.defaultThreadRateLimitPerUser === "number"
          ? c.defaultThreadRateLimitPerUser
          : null,
      defaultSortOrder: c.defaultSortOrder ?? null,
      defaultForumLayout: c.defaultForumLayout ?? null,
      availableTags: Array.isArray(c.availableTags)
        ? c.availableTags
            .slice(0, 20)
            .map((t) => ({ name: String(t?.name ?? "").slice(0, 20), moderated: !!t?.moderated }))
            .filter((t) => t.name)
        : [],
      position: c.position ?? 0,
      parentId: c.parentId ?? null,
      overwrites: [...c.permissionOverwrites.cache.values()].map((o) => ({
        id: o.id,
        type: o.type,
        allow: (BigInt(o.allow.bitfield) & myBits).toString(),
        deny: o.deny.bitfield.toString(),
      })),
    };
    if (
      includeMessages &&
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      typeof c.messages?.fetch === "function"
    ) {
      const left = TOTAL_MESSAGE_CAP - messageTotal;
      if (left > 0) {
        const msgs = await captureChannelMessages(c, Math.min(MAX_MESSAGES_PER_CHANNEL, left));
        if (msgs.length > 0) {
          entry.messages = msgs;
          messageTotal += msgs.length;
        }
      }
    }
    // Thread: luôn chụp kèm "kèm tin nhắn" (thread mà không có tin thì vô nghĩa).
    if (includeMessages) {
      const left = TOTAL_MESSAGE_CAP - messageTotal;
      if (left > 0) {
        const threads = await captureThreads(
          c,
          Math.min(MAX_MESSAGES_PER_THREAD, left),
          MAX_THREADS_PER_CHANNEL,
        );
        if (threads.length > 0) {
          entry.threads = threads;
          messageTotal += threads.reduce((n, t) => n + (t.messages?.length ?? 0), 0);
        }
      }
    }
    channels.push(entry);
  }

  // Quyền mặc định của server (role @everyone). Role @everyone bị loại khỏi danh
  // sách role (không tạo lại được) NHƯNG quyền của nó là "cấu hình server" thật:
  // mất nó là mọi thành viên mất quyền cơ bản sau khi khôi phục. Che theo quyền
  // của bot (myBits) để không bao giờ ghi quyền mà bot không có.
  let everyonePermissions = null;
  try {
    const everyone = guild.roles?.everyone;
    if (everyone?.permissions?.bitfield !== undefined) {
      everyonePermissions = (BigInt(everyone.permissions.bitfield) & myBits).toString();
    }
  } catch (e) {
    console.error(`[backup:everyone] ${guild.name}:`, e.message);
  }

  // Danh tính + cấu hình server: server bị nuke thường mất cả tên/icon/mô tả và
  // các thiết lập an toàn (mức xác minh, lọc nội dung, kênh hệ thống/AFK…) — đây
  // là thứ người dùng nhận ra đầu tiên khi mở lại server.
  // Bản đồ thành viên ↔ vai trò (P2): chỉ giữ vai trò thật trong `roles`.
  const memberRoles = await captureMemberRoles(guild, new Set(roles.map((r) => r.id)));

  return {
    version: 6,
    guildId: guild.id,
    guildName: guild.name,
    createdAt: Date.now(),
    guildMeta: {
      name: guild.name ?? null,
      description: guild.description ?? null,
      iconUrl: safeGuildIconUrl(guild, 256),
      bannerUrl: safeGuildUrl(guild, "bannerURL", 1024),
      splashUrl: safeGuildUrl(guild, "splashURL", 1024),
      verificationLevel: guild.verificationLevel ?? null,
      explicitContentFilter: guild.explicitContentFilter ?? null,
      defaultMessageNotifications: guild.defaultMessageNotifications ?? null,
      systemChannelId: guild.systemChannelId ?? null,
      afkChannelId: guild.afkChannelId ?? null,
      afkTimeout: guild.afkTimeout ?? null,
      preferredLocale: guild.preferredLocale ?? null,
    },
    everyonePermissions,
    roles,
    channels,
    emojis,
    stickers,
    members: memberRoles.members,
    // `memberRolesUnavailable` khác `truncated`: unavailable = không ĐỌC được
    // danh sách thành viên (thiếu intent/quyền), truncated = đọc được nhưng
    // bị cắt do vượt MAX_MEMBERS_PER_BACKUP. Hai lỗi khác nhau, hai lời báo
    // khác nhau.
    memberCount: memberRoles.members.length,
    memberRolesTruncated: memberRoles.truncated,
    memberRolesUnavailable: memberRoles.unavailable,
    bans: await captureBans(guild),
    invites: await captureInvites(guild),
    emojiCount: emojis.length,
    stickerCount: stickers.length,
    messageCount: messageTotal,
  };
}

async function snapshotWithSettings(client, store, guildId, includeMessages) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild || guild.available === false) {
    throw new Error("Bot không còn trong server hoặc server không sẵn sàng");
  }
  const snapshot = await snapshotGuild(guild, { includeMessages });
  const cfg = await store.getConfig(guildId).catch(() => null);
  if (cfg) {
    snapshot.settings = {
      prefix: cfg.prefix ?? "!",
      badWords: cfg.badWords ?? [],
      modRoles: cfg.modRoles ?? [],
      adminRoles: cfg.adminRoles ?? [],
      whitelistRoles: cfg.whitelistRoles ?? [],
      whitelistUsers: cfg.whitelistUsers ?? [],
      logChannelId: cfg.logChannelId ?? null,
      modLogChannelId: cfg.modLogChannelId ?? null,
    };
  }
  return { snapshot, guild };
}

/**
 * Đẩy backup lên GitHub Gist thông qua action Convex (cần GITHUB_TOKEN).
 * backupJson PHẢI là bản ĐÃ NÉN (compressAndEncryptBackup) — Gist giới hạn
 * file 900 KB, JSON backup server lớn vượt xa con số đó và bị GitHub từ chối
 * (HTTP 413) → chủ server tưởng backup xong mà trên Gist không có gì. Bản nén
 * zlib ("z:...") giảm 60-80% và được restore/import nhận diện ngược lại được.
 */
async function pushBackupToGithub(store, { guildId, backupId, backupJson, guildName }) {
  try {
    const res = await store.client.action("backup_github:githubPush", {
      guildId,
      backupId,
      backupJson,
      guildName,
    });
    return res;
  } catch (e) {
    return { ok: false, error: e?.message || "lỗi gọi action GitHub" };
  }
}

/**
 * Thông điệp lỗi lưu backup dễ hành động (hiện cả trên dashboard lẫn kênh log).
 * Mỗi document của Convex tối đa 1 MB — payload lớn đã được botStoreBackup tách
 * chunk, nên gặp lỗi này nghĩa là CHÍNH CÁC CHUNK cũng quá lớn (bản cực lớn /
 * nhiều media). Lúc đó việc cần làm vẫn là giảm khối lượng, và phải nói rõ là
 * đã thử tách rồi — nếu không người dùng tưởng bot còn chưa biết cách.
 */
function describeStoreFailure(err, { includeMessages, messageCount } = {}) {
  const raw = String(err?.message || err || "Lỗi không xác định").slice(0, 200);
  if (/too large|1 ?MB|document.*size|maximum size|vượt quá/i.test(raw)) {
    const extra =
      includeMessages && messageCount > 0 ? ` (lần này kèm ${messageCount} tin nhắn)` : "";
    return `Bản backup quá lớn cho giới hạn 1 MB mỗi document của Convex${extra}, kể cả sau khi tách chunk. Hãy tắt "Kèm tin nhắn" rồi bấm Backup ngay lại.`;
  }
  return `Không lưu được bản backup lên cloud: ${raw}`;
}

async function runBackup(client, store, guildId, opts = {}) {
  // LƯU Ý: option "pushToGithub" (boolean) TRÙNG TÊN với hàm pushBackupToGithub —
  // trước đây const { pushToGithub = false } đã che khuất hàm cùng tên khiến lệnh
  // gọi pushToGithub(store, …) ném TypeError (gọi boolean). Đã đổi tên option.
  const {
    pushToGithub: pushToGithubOpt = false,
    includeMessages = false,
    skipNotice = false,
    claimAt,
  } = opts;
  const { snapshot, guild } = await snapshotWithSettings(client, store, guildId, includeMessages);

  // ─── Incremental backup: skip if unchanged ─────────────────────────────
  // So khớp checksum "ổn định" (không gồm timestamps/media): server không đổi
  // → bỏ qua, không gửi log spam. Lỗi (query chưa deploy, v.v.) → backup đầy đủ.
  const currentChecksum = computeSnapshotChecksum(snapshot);
  try {
    const lastBackup = await store.client
      .query("backup:botGetLastChecksum", { guildId })
      .catch(() => null);
    const lastChecksum = lastBackup?.backupSnapshotChecksum;
    if (lastChecksum && lastChecksum === currentChecksum) {
      console.log(`[backup] ${guildId}: unchanged (checksum match) — skipping`);
      // unchanged: true → dashboard biết lý do "không có bản mới" và báo cho người
      // dùng thay vì để họ tưởng bot bỏ qua yêu cầu.
      const cleared = await store.client
        .mutation("bot_writes:botClearBackup", {
          guildId,
          kind: "backup",
          storeOk: true,
          unchanged: true,
          claimAt,
        })
        .catch(() => null);
      if (cleared?.ok !== true) {
        console.error(`[backup:clear] ${guildId}: không xác nhận được yêu cầu đã xong`);
        return;
      }
      // Người dùng bấm "Backup ngay" chủ động → phải có thông báo, không im lặng
      // (im lặng khiến họ tưởng backup không hoạt động). Backup tự động theo lịch
      // vẫn im lặng như cũ để không spam kênh log.
      if (skipNotice) {
        try {
          const g = client.guilds.cache.get(guildId);
          if (g) {
            await sendToLog(
              g,
              logEmbed({
                title: "💾 Backup bỏ qua — server không có thay đổi",
                description:
                  "Cấu trúc server **hoàn toàn giống** bản backup gần nhất (role, kênh, emoji, sticker, cấu hình đều không đổi) nên không tạo bản trùng lặp. Bật **Kèm tin nhắn** để backup tính cả nội dung tin nhắn (nội dung tin mới được so sánh khi đã bật).",
                color: Colors.Yellow,
                footer: "Protogon · Backup",
              }),
              store,
            );
          }
        } catch {
          // không gửi được log — bỏ qua
        }
      }
      return;
    }
  } catch {
    // Query not available yet — proceed with full backup
  }

  // ─── Compress + encrypt backup ──────────────────────────────────────────
  const { backupJson, compressed, checksum, encrypted } = compressAndEncryptBackup(snapshot);

  let backupId;
  try {
    const stored = await store.client.mutation("bot_writes:botStoreBackup", {
      guildId,
      guildName: snapshot.guildName,
      backupJson,
      roleCount: snapshot.roles.length,
      channelCount: snapshot.channels.length,
      emojiCount: snapshot.emojis?.length ?? 0,
      stickerCount: snapshot.stickers?.length ?? 0,
      messageCount: snapshot.messageCount ?? 0,
      memberCount: snapshot.memberCount ?? 0,
      memberRolesTruncated: snapshot.memberRolesTruncated || undefined,
      source: "backup",
      backupChecksum: checksum,
      backupSnapshotChecksum: currentChecksum,
      backupCompressed: compressed || undefined,
      backupEncrypted: encrypted || undefined,
      claimAt,
    });
    backupId = stored?.backupId;
    if (!backupId) throw new Error("Convex không trả về id bản backup vừa lưu");
  } catch (e) {
    // KHÔNG được nuốt lỗi: trước đây chỉ console.error rồi vẫn xóa cờ + ghi log
    // "Đã tạo backup server" → dashboard im lặng hoàn toàn, người dùng bấm "Backup
    // ngay" xong không thấy bản backup nào cũng không thấy báo lỗi (bug thật 23/09).
    const reason = describeStoreFailure(e, {
      includeMessages,
      messageCount: snapshot.messageCount,
    });
    console.error(`[backup:store] ${guildId}:`, e?.message || e);
    await store.client
      .mutation("bot_writes:botReportBackupError", { guildId, error: reason, claimAt })
      .catch((err) => console.error(`[backup:store:report] ${guildId}:`, err?.message || err));
    try {
      await sendToLog(
        guild,
        logEmbed({
          title: "❌ Backup thất bại — chưa lưu được lên cloud",
          description: reason,
          color: Colors.Red,
          footer: "Protogon · Backup",
        }),
        store,
      );
    } catch {
      // không gửi được log (chưa cấu hình kênh log) — lỗi đã báo lên dashboard rồi
    }
    return;
  }

  let githubLine = "không đẩy GitHub";
  if (pushToGithubOpt && backupId) {
    const res = await pushBackupToGithub(store, {
      guildId,
      backupId,
      // Gửi bản ĐÃ NÉN — Gist giới hạn 900 KB, JSON thô của server lớn bị từ chối.
      backupJson,
      guildName: snapshot.guildName,
    });
    githubLine = res?.ok
      ? `đã đẩy GitHub${res.compressed ? " (bản nén zlib — nạp lại bằng bot Protogon)" : ""}: ${res.url || "xem dashboard"}`
      : `GitHub thất bại: ${res?.error || "lỗi"}`;
  } else if (pushToGithubOpt && !backupId) {
    githubLine = "lưu Convex thất bại → bỏ qua GitHub";
  }

  // Clear pending flag + cập nhật lastBackupAt (khi store thành công) để
  // botGetDueAuto không kích hoạt lại tức thì sau khi backup xong.
  const cleared = await store.client
    .mutation("bot_writes:botClearBackup", {
      guildId,
      kind: "backup",
      storeOk: !!backupId,
      unchanged: false,
      claimAt,
    })
    .catch((e) => {
      console.error("[backup:clear]", e.message);
      return null;
    });
  if (cleared?.ok !== true) {
    console.error(`[backup:clear] ${guildId}: không xác nhận được yêu cầu đã xong`);
    return;
  }

  const fields = [
    { name: "Role", value: `${snapshot.roles.length}`, inline: true },
    { name: "Kênh", value: `${snapshot.channels.length}`, inline: true },
  ];
  if ((snapshot.emojis?.length ?? 0) > 0) {
    fields.push({ name: "Emoji", value: `${snapshot.emojis.length}`, inline: true });
  }
  if ((snapshot.stickers?.length ?? 0) > 0) {
    fields.push({ name: "Sticker", value: `${snapshot.stickers.length}`, inline: true });
  }
  if ((snapshot.messageCount ?? 0) > 0) {
    fields.push({ name: "Tin nhắn", value: `${snapshot.messageCount}`, inline: true });
  }
  if ((snapshot.memberCount ?? 0) > 0) {
    fields.push({
      name: "Thành viên",
      value:
        `${snapshot.memberCount}` +
        (snapshot.memberRolesTruncated ? ` (đã cắt ở ${MAX_MEMBERS_PER_BACKUP})` : ""),
      inline: true,
    });
  }
  fields.push({ name: "GitHub", value: githubLine.slice(0, 200), inline: false });

  const embed = logEmbed({
    title: "💾 Đã tạo backup server",
    description: `Đã chụp **${snapshot.roles.length} role** + **${snapshot.channels.length} kênh**${(snapshot.emojis?.length ?? 0) > 0 ? ` + **${snapshot.emojis.length} emoji**` : ""}${(snapshot.stickers?.length ?? 0) > 0 ? ` + **${snapshot.stickers.length} sticker**` : ""}${(snapshot.messageCount ?? 0) > 0 ? ` + **${snapshot.messageCount} tin nhắn**` : ""} của **${snapshot.guildName}** và lưu lên cloud.`,
    color: Colors.Blurple,
    fields,
    footer: "Protogon · Backup",
  });
  await sendToLog(guild, embed, store);
  console.log(
    `[backup] ${guildId}: xong (${snapshot.roles.length} roles, ${snapshot.channels.length} channels, ${snapshot.emojis?.length ?? 0} emojis, ${snapshot.stickers?.length ?? 0} stickers, ${snapshot.messageCount ?? 0} messages) — ${githubLine}`,
  );
}

module.exports = {
  snapshotGuild,
  snapshotWithSettings,
  runBackup,
  captureChannelMessages,
  captureThreads,
  captureBans,
  captureInvites,
  captureMemberRoles,
  pushBackupToGithub,
  describeStoreFailure,
};
