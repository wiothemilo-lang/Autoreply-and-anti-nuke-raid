/**
 * backupRebuild.js — các hàm DỰNG LẠI cấu trúc server từ backup: role, danh mục,
 * kênh + overwrite, emoji/sticker, tin nhắn (webhook), thread, danh tính server,
 * ban list, link mời. Tách từ handlers/backup.js (đợt #5) — code giữ nguyên
 * hành vi.
 *
 * Đây là các "viên gạch" được backupRestore (restoreCore) gọi theo thứ tự; mỗi
 * bước best-effort (lỗi từng mục chỉ bỏ qua mục đó) và đều nhận `onProgress` để
 * gia hạn claim trong lúc chạy lâu.
 */
const { ChannelType } = require("discord.js");
const { resolveAttachment } = require("./backupMedia");
const {
  MAX_MESSAGES_PER_THREAD,
  MAX_REPLAY_PER_CHANNEL,
  MAX_THREADS_PER_CHANNEL,
  MAX_MEMBERS_PER_BACKUP,
  MAX_ROLES_PER_MEMBER,
  safeGuildIconUrl,
  sleep,
} = require("./backupCommon");

/** Chờ giữa 2 tin phục hồi (ms) — dưới giới hạn rate limit webhook (~30/phút). */
const REPLAY_DELAY_MS = 1_100;

/** Role theo đúng thứ tự vị trí trong backup (ổn định với role thiếu position). */
function sortedRoles(backup) {
  return (backup.roles || [])
    .map((r, i) => ({ ...r, _i: i }))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a._i - b._i);
}

/** Kênh theo đúng thứ tự vị trí trong backup (ổn định với kênh thiếu position). */
function sortedChannels(backup) {
  return (backup.channels || [])
    .map((c, i) => ({ ...c, _i: i }))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a._i - b._i);
}

/** Tạo lại role từ backup theo đúng thứ tự; trả về Map oldId -> newId. */
async function createRoles(guild, backup, onProgress) {
  const map = new Map();
  const sorted = sortedRoles(backup);
  let processed = 0;
  for (const r of sorted) {
    if (onProgress && processed++ % 10 === 0) await onProgress();
    if (!r.name) continue;
    try {
      const opts = {
        name: String(r.name).slice(0, 100),
        color: r.color ?? 0,
        hoist: !!r.hoist,
        mentionable: !!r.mentionable,
        permissions: BigInt(r.permissions || "0"),
      };
      if (r.unicodeEmoji) opts.unicodeEmoji = String(r.unicodeEmoji).slice(0, 2);
      const created = await guild.roles.create(opts);
      // Icon là URL CDN — set SAU khi tạo role để lỗi icon không làm mất cả role.
      if (r.icon) {
        try {
          await created.setIcon(String(r.icon));
        } catch (e) {
          console.error(`[backup:role:icon] ${r.name}:`, e.message);
        }
      }
      map.set(r.id, created.id);
    } catch (e) {
      console.error(`[backup:role] ${r.name}:`, e.message);
    }
  }
  // Sắp xếp lại vị trí role đúng như thứ tự trong file (best-effort — cao hơn = trên).
  try {
    const createdSorted = sorted.map((r) => map.get(r.id)).filter(Boolean);
    for (let i = 0; i < createdSorted.length; i++) {
      if (onProgress && i % 10 === 0) await onProgress();
      try {
        await createdSorted[i].setPosition(i);
      } catch {
        // thiếu quyền / giới hạn — bỏ qua role này
      }
    }
  } catch (e) {
    console.error(`[backup:role:positions] ${guild.id}:`, e.message);
  }
  return map;
}

/**
 * XOÁ các kênh ĐANG CÓ của server đích trước khi dựng lại kênh theo backup.
 *
 * Vì sao cần: khôi phục vào server đã có sẵn kênh rác (server phụ, server dựng
 * lại sau nuke còn sót kênh mặc định) thì bản khôi phục KHÔNG trùng với server
 * gốc — mọi kênh trùng tên bị Discord đổi thành `ten-2`, rác cũ nằm lẫn giữa
 * cấu trúc mới. Chủ server muốn "dựng lại y như bản gốc" phải xoá tay trước.
 *
 * Vì sao TẮT mặc định (cờ `restoreClearChannelsEnabled`): đây là hành động
 * KHÔNG HOÀN TÁC được — xoá kênh là xoá luôn tin nhắn trong đó, và server phụ
 * thường có kênh mặc định chủ server muốn giữ.
 *
 * Ba lớp an toàn:
 *  1. Bot PHẢI có quyền ManageChannels — không có quyền TẠO kênh thì tuyệt đối
 *     không được xoá (xoá xong là server trắng trơn, không dựng lại được).
 *  2. Chỉ xoá kênh mà discord.js coi là `deletable` — đã tính sẵn quyền của bot
 *     VÀ vị trí role (kênh nằm trên role bot thì không xoá được), đồng thời tự
 *     loại kênh quy tắc/ thông báo cập nhật của server.
 *  3. Best-effort từng kênh: lỗi một kênh chỉ bỏ qua kênh đó và ĐẾM LẠI, không
 *     ném ra làm hỏng cả lượt khôi phục (kênh không xoá được vẫn nằm nguyên).
 *
 * Thread không xoá riêng: xoá kênh cha là chúng đi theo, và xoá từng thread
 * chỉ tốn rate limit vô ích.
 */
async function clearExistingChannels(guild, onProgress) {
  const me = guild.members?.me ?? null;
  if (!me || !me.permissions?.has?.("ManageChannels")) {
    return { deleted: 0, kept: guild.channels?.cache?.size ?? 0, skippedReason: "no_permission" };
  }
  const all = [...(guild.channels?.cache?.values?.() ?? [])].filter((c) => !c.isThread?.());
  // Xoá kênh CHA trước kênh danh mục: kênh con của danh mục bị xoá sẽ mất
  // parentId tạm thời, nếu chưa xoá thì chúng nhảy ra ngoài danh mục một lúc.
  const doomed = all
    .filter((c) => c.deletable !== false)
    .sort(
      (a, b) =>
        (a.type === ChannelType.GuildCategory ? 1 : 0) -
        (b.type === ChannelType.GuildCategory ? 1 : 0),
    );
  let deleted = 0;
  let processed = 0;
  for (const c of doomed) {
    if (onProgress && processed++ % 5 === 0) await onProgress();
    try {
      await c.delete("Protogon: xoá kênh sẵn có trước khi khôi phục backup");
      deleted++;
    } catch (e) {
      console.error(`[backup:clear-channels] ${c.name}:`, e.message);
    }
  }
  return { deleted, kept: all.length - deleted, skippedReason: null };
}

/** Tạo lại kênh từ backup theo đúng thứ tự + vị trí; trả về Map oldId -> newId. */
async function createChannels(guild, backup, roleMap, onProgress) {
  const map = new Map();
  const sorted = sortedChannels(backup);
  let processed = 0;

  const buildOpts = (ch) => {
    const overwrites = (ch.overwrites || [])
      .map((o) => {
        if (o.type === 0) {
          const newId = o.id === backup.guildId ? guild.id : roleMap.get(o.id);
          if (!newId) return null;
          return { id: newId, type: 0, allow: BigInt(o.allow || "0"), deny: BigInt(o.deny || "0") };
        }
        return { id: o.id, type: 1, allow: BigInt(o.allow || "0"), deny: BigInt(o.deny || "0") };
      })
      .filter(Boolean);
    const opts = {
      name: String(ch.name || "channel").slice(0, 100),
      type: ch.type,
      topic: ch.topic ?? undefined,
      nsfw: !!ch.nsfw,
      permissionOverwrites: overwrites,
    };
    if (ch.parentId && map.has(ch.parentId)) opts.parent = map.get(ch.parentId);
    const isVoiceLike =
      ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice;
    if (isVoiceLike) {
      if (ch.bitrate) opts.bitrate = Math.min(384000, Math.max(8000, ch.bitrate));
      if (ch.userLimit) opts.userLimit = Math.min(99, Math.max(0, ch.userLimit));
      if (ch.rtcRegion) opts.rtcRegion = ch.rtcRegion;
      if (Number.isFinite(ch.videoQualityMode)) opts.videoQualityMode = ch.videoQualityMode;
    }
    // Kênh văn bản/thông báo/diễn đàn: slowmode + auto-archive + rate-limit thread.
    // Discord TỪ CHỐI các option này trên kênh thoại nên phải tách theo loại.
    const isTextLike =
      ch.type === ChannelType.GuildText ||
      ch.type === ChannelType.GuildAnnouncement ||
      ch.type === ChannelType.GuildForum;
    if (isTextLike) {
      if (Number.isFinite(ch.rateLimitPerUser)) {
        opts.rateLimitPerUser = Math.max(0, Math.min(21600, ch.rateLimitPerUser));
      }
      if (Number.isFinite(ch.defaultThreadRateLimitPerUser)) {
        opts.defaultThreadRateLimitPerUser = Math.max(
          0,
          Math.min(21600, ch.defaultThreadRateLimitPerUser),
        );
      }
      if (Number.isFinite(ch.defaultAutoArchiveDuration)) {
        opts.defaultAutoArchiveDuration = ch.defaultAutoArchiveDuration;
      }
    }
    if (ch.type === ChannelType.GuildCategory && Number.isFinite(ch.defaultSortOrder)) {
      opts.defaultSortOrder = ch.defaultSortOrder;
    }
    if (ch.type === ChannelType.GuildForum) {
      if (Number.isFinite(ch.defaultForumLayout)) opts.defaultForumLayout = ch.defaultForumLayout;
      if (Array.isArray(ch.availableTags) && ch.availableTags.length > 0) {
        opts.availableTags = ch.availableTags
          .slice(0, 20)
          .map((t) => ({ name: String(t?.name ?? "").slice(0, 20), moderated: !!t?.moderated }))
          .filter((t) => t.name);
      }
    }
    return opts;
  };

  const setPosition = async (ch, newId) => {
    try {
      const created =
        guild.channels.cache.get(newId) ?? (await guild.channels.fetch(newId).catch(() => null));
      if (created && Number.isFinite(ch.position)) {
        await created.setPosition(Math.max(0, Math.min(250, ch.position)));
      }
    } catch {
      // best-effort — thứ tự tạo đã gần đúng thứ tự file
    }
  };

  // Tạo danh mục trước (theo thứ tự vị trí), rồi kênh con.
  for (const ch of sorted) {
    if (onProgress && processed++ % 10 === 0) await onProgress();
    if (ch.type !== ChannelType.GuildCategory) continue;
    if (map.has(ch.id)) continue;
    try {
      const c = await guild.channels.create(buildOpts(ch));
      map.set(ch.id, c.id);
      await setPosition(ch, c.id);
    } catch (e) {
      console.error(`[backup:category] ${ch.name}:`, e.message);
    }
  }
  for (const ch of sorted) {
    if (onProgress && processed++ % 10 === 0) await onProgress();
    if (ch.type === ChannelType.GuildCategory) continue;
    if (map.has(ch.id)) continue;
    try {
      const c = await guild.channels.create(buildOpts(ch));
      map.set(ch.id, c.id);
      await setPosition(ch, c.id);
    } catch (e) {
      console.error(`[backup:channel] ${ch.name}:`, e.message);
    }
  }
  return map;
}

/** Chuẩn hóa tên emoji (Discord: 2-32 ký tự, chữ thường + số + gạch dưới). */
function sanitizeEmojiName(name) {
  let n = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (n.length < 2) n = `${n}emj`.slice(0, 32);
  return n.slice(0, 32) || "emoji";
}

/**
 * Tạo lại emoji từ backup (URL CDN hoặc raw base64 nhúng trong file bot nuke).
 * Tên được chuẩn hóa theo quy tắc Discord; mỗi emoji lỗi chỉ bỏ qua riêng lẻ.
 * Tên hàm là recreateEmojis (KHÔNG phải restoreEmojis) — trước đây trùng với
 * hằng boolean restoreEmojis trong restoreCore làm CRASH mọi restore mặc định
 * (TypeError: restoreEmojis is not a function) ngay sau khi phát lại tin nhắn:
 * không tạo emoji/sticker, không áp settings, không gửi embed hoàn tất.
 */
async function recreateEmojis(guild, backup, onProgress) {
  let created = 0;
  const list = backup.emojis || [];
  for (let i = 0; i < list.length; i++) {
    if (onProgress && i % 5 === 0) await onProgress();
    const e = list[i];
    if (!e || !e.name) continue;
    const name = sanitizeEmojiName(e.name);
    try {
      const source = e.raw || e.url;
      const f = source ? await resolveAttachment(source, i) : null;
      if (!f) {
        console.error(`[backup:emoji] ${e.name}: không tải được ảnh`);
        continue;
      }
      await guild.emojis.create({ attachment: f.attachment, name });
      created++;
    } catch (err) {
      console.error(`[backup:emoji] ${e.name}:`, err.message);
    }
  }
  return created;
}

/** Tên sticker: 2-30 ký tự (Discord). */
function sanitizeStickerName(name) {
  const n = String(name || "")
    .trim()
    .slice(0, 30);
  // Discord chỉ nhận tên sticker TỪ 2 ký tự: tên 1 ký tự (khoảng trắng,
  // ký tự lạ bị trim) làm guild.stickers.create ném lỗi ⇒ mất sticker âm thầm.
  if (n.length < 2) return `${n}_`.slice(0, 30).padEnd(2, "_");
  return n;
}

/** Sticker PNG/APNG/Lottie ≤ 512 KB — lớn hơn là Discord từ chối, bỏ qua sớm. */
const MAX_STICKER_BYTES = 512 * 1024;

/**
 * Tạo lại sticker từ backup (URL CDN hoặc raw base64 nhúng trong file bot nuke).
 * tags là emoji unicode đại diện (Discord bắt buộc với PNG/APNG) — mặc định 😀.
 */
async function restoreStickers(guild, backup, onProgress) {
  let created = 0;
  const list = backup.stickers || [];
  for (let i = 0; i < list.length; i++) {
    if (onProgress && i % 5 === 0) await onProgress();
    const s = list[i];
    if (!s || !s.name) continue;
    const name = sanitizeStickerName(s.name);
    try {
      const source = s.raw || s.url;
      const f = source ? await resolveAttachment(source, i) : null;
      if (!f || f.attachment.length > MAX_STICKER_BYTES) {
        console.error(`[backup:sticker] ${s.name}: không tải được file (hoặc quá 512 KB)`);
        continue;
      }
      const tags = String(s.tags || "😀").slice(0, 8) || "😀";
      try {
        await guild.stickers.create({
          file: f.attachment,
          name,
          tags,
          description: s.description ? String(s.description).slice(0, 100) : undefined,
        });
      } catch (err) {
        // Lottie đôi khi không nhận tags → thử lại không tags.
        await guild.stickers.create({
          file: f.attachment,
          name,
          description: s.description ? String(s.description).slice(0, 100) : undefined,
        });
      }
      created++;
    } catch (err) {
      console.error(`[backup:sticker] ${s.name}:`, err.message);
    }
  }
  return created;
}

/**
 * Phục hồi tin nhắn đã backup vào kênh mới — qua WEBHOOK (giữ tên người gửi),
 * gửi theo đúng THỨ TỰ THỜI GIAN trong file (tăng dần), tối đa
 * MAX_REPLAY_PER_CHANNEL tin/kênh. Media (ảnh/video…) của từng tin được tải về
 * (URL hoặc data URI base64 trong file bot nuke) và đăng LẠI THẬT vào tin khôi
 * phục — chỉ những file không tải được mới hiện dạng link 📎. Trả số tin đã phục hồi.
 */
/**
 * Gửi lại một loạt tin nhắn vào MỘT kênh hoặc thread qua webhook (giữ tên tác
 * giả + media). Tách riêng vì cả kênh và thread đều cần đúng logic này — trước
 * đây logic nằm trong vòng for của replayMessages, thêm thread sẽ bắt buộc
 * nhân bản (và hai bản chắc chắn lệch nhau sau này).
 */
async function replayIntoChannel(channel, msgs, webhookName, avatarUrl, onProgress) {
  let sent = 0;
  let processed = 0;
  let webhook = null;
  try {
    webhook = await channel.createWebhook({
      name: String(webhookName || "Protogon Restore").slice(0, 30) || "Protogon Restore",
      avatar: avatarUrl ?? undefined,
    });
  } catch (e) {
    console.error(`[backup:replay:webhook] #${channel.name ?? ""}:`, e.message);
  }

  for (const m of msgs) {
    if (onProgress && processed++ % 10 === 0) await onProgress();
    // Tải media (tối đa 3 file/tin, mỗi file ≤ 8 MB) — file lỗi thì hiện link.
    const files = [];
    const failedLines = [];
    const atts = (m.attachments || []).slice(0, 3);
    for (let i = 0; i < atts.length; i++) {
      const f = await resolveAttachment(atts[i], i);
      if (f) files.push(f);
      else failedLines.push(String(atts[i]));
    }
    const attachLine = failedLines.map((u) => `\n📎 ${u}`).join("");
    const content = m.content || "";
    // Nội dung CHỈ KHOẢNG TRẮNG cũng phải coi như rỗng: Discord từ chối tin
    // không có gì để gửi ("Cannot send an empty message"), nên đẩy payload rỗng
    // là tin bị nuốt im lặng — số "đã phục hồi" lệch mà không có cảnh báo.
    // Trước đây chỉ kiểm content falsy nên tin toàn khoảng trắng rơi thẳng
    // vào payload {}. Nhờ vậy payload luôn có content hoặc files.
    const hasText = !!content.trim();
    const body = hasText
      ? `${content}${attachLine}`
      : attachLine || (files.length > 0 ? "" : "(tin không có nội dung)");
    try {
      if (webhook) {
        const payload = { username: String(m.authorName || "?").slice(0, 32) || "?" };
        if (body.trim()) payload.content = body.slice(0, 2000);
        if (files.length > 0) payload.files = files;
        await webhook.send(payload);
      } else {
        const payload = {};
        if (body.trim()) payload.content = `**${m.authorName || "?"}:** ${body.slice(0, 1900)}`;
        if (files.length > 0) payload.files = files;
        await channel.send(payload);
      }
      sent++;
    } catch {
      // bỏ qua tin lỗi (vd media vượt giới hạn server), tiếp tục
    }
    await sleep(REPLAY_DELAY_MS);
  }

  if (webhook) webhook.delete().catch(() => {});
  return sent;
}

async function replayMessages(guild, backup, channelMap, onProgress) {
  let sent = 0;
  for (const ch of backup.channels || []) {
    const msgs = (Array.isArray(ch.messages) ? ch.messages : [])
      .slice()
      .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
      .slice(-MAX_REPLAY_PER_CHANNEL);
    if (msgs.length === 0) continue;
    const newId = channelMap.get(ch.id);
    if (!newId) continue;
    const channel =
      guild.channels.cache.get(newId) ?? (await guild.channels.fetch(newId).catch(() => null));
    if (!channel || !channel.isTextBased?.()) continue;
    sent += await replayIntoChannel(
      channel,
      msgs,
      backup.guildName,
      safeGuildIconUrl(guild),
      onProgress,
    );
  }
  return sent;
}

/** Thời gian tự lưu trữ thread — Discord chỉ nhận đúng 4 giá trị này. */
const AUTO_ARCHIVE_CHOICES = [60, 1440, 4320, 10080];
function pickAutoArchive(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1440;
  return AUTO_ARCHIVE_CHOICES.find((x) => x >= n) ?? 10080;
}

/**
 * Tạo lại THREAD của các kênh đã dựng, kèm tin nhắn gần nhất trong thread.
 * Thread thuộc về kênh nên chỉ chạy khi "khôi phục kênh" bật; tin trong thread
 * chỉ phục hồi khi "khôi phục tin nhắn" bật (cùng luật với tin của kênh).
 */
async function createThreads(guild, backup, channelMap, onProgress, { restoreMessages }) {
  let threadsCreated = 0;
  let messages = 0;
  let processed = 0;
  const avatar = safeGuildIconUrl(guild);
  for (const ch of backup.channels || []) {
    const wanted = Array.isArray(ch.threads) ? ch.threads.slice(0, MAX_THREADS_PER_CHANNEL) : [];
    if (wanted.length === 0) continue;
    const newId = channelMap.get(ch.id);
    if (!newId) continue;
    const parent =
      guild.channels.cache.get(newId) ?? (await guild.channels.fetch(newId).catch(() => null));
    if (!parent || typeof parent.threads?.create !== "function") continue;
    for (const t of wanted) {
      if (onProgress && processed++ % 5 === 0) await onProgress();
      if (!t?.name) continue;
      try {
        const thread = await parent.threads.create({
          name: String(t.name).slice(0, 100),
          autoArchiveDuration: pickAutoArchive(t.autoArchiveDuration),
        });
        threadsCreated++;
        const msgs = (Array.isArray(t.messages) ? t.messages : [])
          .slice()
          .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
          .slice(-MAX_MESSAGES_PER_THREAD);
        if (restoreMessages && msgs.length > 0 && thread.isTextBased?.()) {
          messages += await replayIntoChannel(thread, msgs, backup.guildName, avatar, onProgress);
        }
      } catch (e) {
        console.error(`[backup:thread] ${t.name}:`, e.message);
      }
    }
  }
  return { threadsCreated, messages };
}

/**
 * Áp lại danh tính server (tên / mô tả / icon) — thứ người dùng nhận ra đầu
 * tiên sau khi mở lại server bị nuke. Best-effort từng bước: thiếu quyền
 * Manage Guild thì bỏ qua chứ không làm hỏng cả lần khôi phục.
 */
async function applyGuildMeta(guild, meta, channelMap) {
  const done = {
    name: false,
    description: false,
    icon: false,
    banner: false,
    splash: false,
    settings: false,
  };
  if (!meta) return done;
  // Gọi phương thức chỉ khi có giá trị + client hỗ trợ; mỗi field độc lập nên
  // một field thiếu quyền (banner cần boost, locale cần Community…) không làm
  // mất các field còn lại.
  const apply = async (label, method, value) => {
    if (value === null || value === undefined) return false;
    if (typeof guild[method] !== "function") return false;
    try {
      await guild[method](value);
      return true;
    } catch (e) {
      console.error(`[backup:meta:${label}]:`, e.message);
      return false;
    }
  };
  if (await apply("name", "setName", meta.name ? String(meta.name).slice(0, 100) : null)) {
    done.name = true;
  }
  if (await apply("description", "setDescription", meta.description ?? null))
    done.description = true;
  if (await apply("icon", "setIcon", meta.iconUrl ?? null)) done.icon = true;
  if (await apply("banner", "setBanner", meta.bannerUrl ?? null)) done.banner = true;
  if (await apply("splash", "setSplash", meta.splashUrl ?? null)) done.splash = true;

  // Thiết lập an toàn/thông báo của server. Kênh hệ thống/AFK lưu bằng id CŨ →
  // phải tra qua channelMap (id đã tạo lại) trước khi gán.
  let settingsApplied = 0;
  if (await apply("verifyLevel", "setVerificationLevel", meta.verificationLevel ?? null)) {
    settingsApplied++;
  }
  if (
    await apply("contentFilter", "setExplicitContentFilter", meta.explicitContentFilter ?? null)
  ) {
    settingsApplied++;
  }
  if (
    await apply(
      "notifications",
      "setDefaultMessageNotifications",
      meta.defaultMessageNotifications ?? null,
    )
  ) {
    settingsApplied++;
  }
  if (await apply("afkTimeout", "setAFKTimeout", meta.afkTimeout ?? null)) settingsApplied++;
  const systemChannelId = meta.systemChannelId ? channelMap?.get(meta.systemChannelId) : null;
  if (systemChannelId && (await apply("systemChannel", "setSystemChannel", systemChannelId))) {
    settingsApplied++;
  }
  const afkChannelId = meta.afkChannelId ? channelMap?.get(meta.afkChannelId) : null;
  if (afkChannelId && (await apply("afkChannel", "setAFKChannel", afkChannelId))) {
    settingsApplied++;
  }
  if (await apply("locale", "setPreferredLocale", meta.preferredLocale ?? null)) {
    settingsApplied++;
  }
  done.settings = settingsApplied > 0;
  return done;
}

/**
 * Áp lại quyền mặc định của server (role @everyone) đã chụp. Đây là "cấu hình
 * server" thật — không có nó thì sau khôi phục mọi thành viên mất quyền cơ bản.
 * Trả về true khi ghi thành công.
 */
async function applyEveryonePermissions(guild, backup) {
  const perms = backup?.everyonePermissions;
  if (typeof perms !== "string" || perms.length === 0) return false;
  const everyone = guild?.roles?.everyone;
  if (!everyone || typeof everyone.setPermissions !== "function") return false;
  try {
    await everyone.setPermissions(BigInt(perms));
    return true;
  } catch (e) {
    console.error(`[backup:meta:everyone] ${guild?.id ?? "?"}:`, e.message);
    return false;
  }
}

/**
 * Áp lại VAI TRÒ cho THÀNH VIÊN ĐANG CÓ trong server (P2).
 *
 * Khôi phục cấu trúc mà không khôi phục vai trò thì vô dùng: server có đủ
 * role/kênh nhưng không ai mod, mọi miễn trừ anti-nuke theo role cũng rơi.
 * Bản đồ `backup.members` lưu vai trò theo id CŨ, nên phải tra qua `roleMap`
 * (role tạo lại có id MỚI) trước khi gán.
 *
 * Bốn lớp chặn, xếp rẻ → đắt:
 *  1. Role @everyone (id = guild.id) — Discord không cho gán tay, và mạo danh
 *     nó là đường leo thang quyền kinh điển.
 *  2. Role `managed` (tích hợp: Nitro/Booster/bot khác) — không gán tay được.
 *  3. Role có `position` ≥ cao nhất của bot — Discord từ chối, và đây cũng là
 *     ranh giới "bot không được vươn tay lên trên chính mình".
 *  4. Role mang bất kỳ quyền nào mà BOT KHÔNG CÓ (`bitfield & ~myBits` ≠ 0).
 *     Đây là chốt chặn chính: kể cả khi role tạo được (bot đủ quyền để tạo),
 *     gán nó lên thành viên — đặc biệt lên chính bot — là đường nâng quyền.
 *
 * Chỉ gán cho thành viên đang có trong cache; thành viên đã rời thì bỏ qua
 * (không fetch hàng loạt để tránh chạm rate limit). Trả số liệu để báo cáo.
 */
async function applyMemberRoles(guild, backup, roleMap, onProgress) {
  const stats = { members: 0, assigned: 0, skipped: 0, missing: 0, noPermission: false };
  const list = Array.isArray(backup?.members) ? backup.members : [];
  if (list.length === 0 || !roleMap || roleMap.size === 0) return stats;

  const me = guild.members?.me;
  if (!me || !me.permissions?.has?.("ManageRoles")) {
    stats.noPermission = true;
    console.error(
      `[backup:members] ${guild.id}: bot thiếu quyền Manage Roles — bỏ qua vai trò thành viên`,
    );
    return stats;
  }
  const myBits = BigInt(me.permissions.bitfield ?? 0n);
  const myTop = me.roles?.highest?.position ?? Infinity;
  const everyoneId = guild.roles?.everyone?.id ?? backup.guildId;

  // Lọc trước toàn bộ danh sách role (rẻ) rồi mới lặp thành viên (đắt).
  const assignable = new Map(); // roleIdCũ -> role mới đã qua 4 lớp chặn
  for (const [oldId, newId] of roleMap) {
    if (!newId) continue;
    const role = guild.roles.cache.get(newId);
    if (!role) {
      stats.missing++;
      continue;
    }
    if (role.id === everyoneId || role.managed) continue;
    if (role.position >= myTop) continue;
    if ((BigInt(role.permissions?.bitfield ?? 0n) & ~myBits) !== 0n) continue;
    assignable.set(oldId, role);
  }
  if (assignable.size === 0) return stats;

  let processed = 0;
  for (const entry of list.slice(0, MAX_MEMBERS_PER_BACKUP)) {
    if (onProgress && processed++ % 10 === 0) await onProgress();
    const userId = entry?.userId;
    if (!userId) continue;
    // Không tự gán vai trò cho chính bot.
    if (userId === me.user?.id) continue;
    const member = guild.members.cache.get(userId);
    if (!member) {
      stats.missing++;
      continue;
    }
    const wanted = (Array.isArray(entry.roles) ? entry.roles : [])
      .map((id) => assignable.get(id))
      .filter(Boolean)
      .filter((r) => !member.roles?.cache?.has?.(r.id))
      .slice(0, MAX_ROLES_PER_MEMBER);
    if (wanted.length === 0) continue;
    try {
      if (typeof member.roles?.add !== "function") {
        stats.skipped++;
        continue;
      }
      await member.roles.add(wanted, "Khôi phục vai trò từ backup");
      stats.members++;
      stats.assigned += wanted.length;
    } catch (e) {
      stats.skipped++;
      console.error(`[backup:members] ${userId}:`, e.message);
    }
  }
  return stats;
}

/** Cấm lại danh tiếp ủy quyền (có bật riêng trong Tùy chỉnh khôi phục). */
async function applyBans(guild, bans) {
  let banned = 0;
  for (const ban of bans || []) {
    const userId = ban?.userId;
    if (!userId) continue;
    if (guild.bans?.cache?.has?.(userId)) {
      banned++;
      continue;
    }
    try {
      await guild.members.ban(userId, {
        reason: `Khôi phục từ backup${ban.reason ? `: ${String(ban.reason).slice(0, 200)}` : ""}`,
      });
      banned++;
    } catch (e) {
      console.error(`[backup:ban] ${userId}:`, e.message);
    }
  }
  return banned;
}

/**
 * Dựng lại link mời TRỎ ĐÚNG KÊNH (mã invite cũ chết sạch sau khi server bị xoá
 * nên chỉ lấy lại thiết lập, không lấy lại mã). Tìm kênh theo TÊN vì kênh mới
 * đã có id khác.
 */
async function applyInvites(guild, backup, channelMap) {
  let created = 0;
  const byName = new Map();
  for (const ch of backup.channels || []) {
    const newId = channelMap.get(ch.id);
    const channel = newId ? guild.channels.cache.get(newId) : null;
    if (channel?.name) byName.set(String(channel.name).toLowerCase(), channel);
  }
  for (const inv of backup.invites || []) {
    const channel = byName.get(String(inv?.channelName || "").toLowerCase());
    if (!channel || typeof channel.createInvite !== "function") continue;
    try {
      await channel.createInvite({
        maxAge: Number.isFinite(inv.maxAge) ? inv.maxAge : 0,
        maxUses: Number.isFinite(inv.maxUses) ? inv.maxUses : 0,
        temporary: !!inv.temporary,
        unique: true,
      });
      created++;
    } catch (e) {
      console.error(`[backup:invite] ${inv.channelName}:`, e.message);
    }
  }
  return created;
}

module.exports = {
  sortedRoles,
  sortedChannels,
  createRoles,
  clearExistingChannels,
  createChannels,
  sanitizeEmojiName,
  recreateEmojis,
  sanitizeStickerName,
  restoreStickers,
  replayIntoChannel,
  replayMessages,
  createThreads,
  applyGuildMeta,
  applyEveryonePermissions,
  applyMemberRoles,
  applyBans,
  applyInvites,
};
