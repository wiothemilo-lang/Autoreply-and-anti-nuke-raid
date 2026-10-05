const { ChannelType } = require("discord.js");

const SYNC_CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildVoice,
  ChannelType.GuildCategory,
  ChannelType.GuildStageVoice,
  ChannelType.GuildForum,
];

// State variables for guild sync optimization
let firstRun = true;
let lastTrustedCount = 0;
let lowCountStreak = 0;
let runCounter = 0;
let lastSyncOkAt = 0; // mốc lần sync thành công gần nhất (isSyncHealthy)

/** Sync loop còn sống không (thành công trong 10 phút)? — heartbeat fallback chỉ chạy khi FALSE. */
function isSyncHealthy() {
  return Date.now() - lastSyncOkAt < 10 * 60_000;
}

// Cache for change detection — avoids redundant mutations
const prevGuildData = new Map(); // guildId -> { name, icon, memberCount, channelHash, roleHash }

/** Simple string hash for change detection (not cryptographic, just fast). */
function quickHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash;
}

const SMALL_BOT_LIMIT = 50;

/**
 * Emoji tuỳ chỉnh của guild (KHÔNG gồm emoji mặc định Unicode — dashboard dùng
 * picker Unicode riêng). Chỉ lấy dữ liệu hiển thị: id, tên, animated.
 */
function collectEmojis(g) {
  return [...(g.emojis?.cache?.values?.() ?? [])]
    .map((e) => ({ emojiId: e.id, name: e.name ?? "emoji", animated: !!e.animated }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function syncAll(client, store) {
  const guilds = [];
  let memberCount = 0;
  runCounter++;

  for (const g of client.guilds.cache.values()) {
    guilds.push({
      id: g.id,
      name: g.name,
      icon: g.icon ?? undefined,
      memberCount: g.memberCount ?? undefined,
    });
    memberCount += g.memberCount ?? 0;

    // Only sync channels/roles/emojis every 5 runs (~5 minutes) AND only if changed
    const doChannelRole = runCounter % 5 === 0;
    if (!doChannelRole) continue;

    const channels = g.channels.cache
      .filter((c) => SYNC_CHANNEL_TYPES.includes(c.type))
      .map((c) => ({ channelId: c.id, name: c.name, type: c.type }));
    const roles = g.roles.cache
      .filter((r) => r.name !== "@everyone")
      .map((r) => ({ roleId: r.id, name: r.name, color: r.color, position: r.position }));
    const emojis = collectEmojis(g);

    const channelHash = quickHash(JSON.stringify(channels));
    const roleHash = quickHash(JSON.stringify(roles));
    const emojiHash = quickHash(JSON.stringify(emojis));
    const prev = prevGuildData.get(g.id);

    // Skip if nothing changed
    if (
      prev &&
      prev.channelHash === channelHash &&
      prev.roleHash === roleHash &&
      prev.emojiHash === emojiHash
    )
      continue;

    try {
      await store.client.mutation("guilds:syncChannels", { guildId: g.id, channels });
      await store.client.mutation("guilds:syncRoles", { guildId: g.id, roles });
      await store.client.mutation("guilds:syncEmojis", { guildId: g.id, emojis });
      prevGuildData.set(g.id, {
        name: g.name,
        icon: g.icon,
        memberCount: g.memberCount,
        channelHash,
        roleHash,
        emojiHash,
      });
    } catch (err) {
      console.error(`[sync] ${g.id}:`, err.message);
    }
  }

  const count = guilds.length;
  let trustedFullList;
  if (count <= SMALL_BOT_LIMIT) {
    trustedFullList = true;
    lowCountStreak = 0;
  } else {
    const droppedSharply =
      lastTrustedCount > 0 &&
      count < lastTrustedCount - Math.max(50, Math.round(lastTrustedCount * 0.1));
    lowCountStreak = droppedSharply ? lowCountStreak + 1 : 0;
    trustedFullList = !firstRun && !(droppedSharply && lowCountStreak < 3);
  }
  firstRun = false;
  if (trustedFullList) lastTrustedCount = count;

  // Owner info — fetch once per sync cycle
  let ownerName;
  let ownerAvatarUrl;
  try {
    const app = await client.application.fetch();
    const owner = app?.owner;
    const ownerId = owner?.ownerId || (/^\d{15,20}$/.test(owner?.id || "") ? owner.id : null);
    if (ownerId) {
      const ownerUser = await client.users.fetch(ownerId).catch(() => null);
      if (ownerUser) {
        ownerName = ownerUser.username;
        ownerAvatarUrl = ownerUser.displayAvatarURL({ size: 256, extension: "png" });
      }
    }
  } catch (e) {
    console.error("[owner:sync]", e.message);
  }

  // Verify panel KHÔNG xử lý ở đây — đã có vòng tick riêng trong tick.js
  // (bot_tick:getPendingJobs, gửi + luôn clear cờ kể cả khi kênh hỏng).
  // Tránh query trùng lặp mỗi vòng sync (tiết kiệm operations).

  // TỐI ƯU USAGE: gộp heartbeat botStatus vào CHÍNH mutation botSyncGuilds
  // (trước đây 2 mutation riêng mỗi phút = 2x calls). botHeartbeat mutation
  // vẫn giữ trên Convex để backward-compat nhưng bot không gọi nữa.
  // TỐI ƯU I/O: patch guild row chỉ khi dữ liệu ĐỔI (name/icon/memberCount) —
  // lastHeartbeat per-guild refresh theo chu kỳ dài (mỗi 5 sync ≈ 10 phút) thay
  // vì ghi lại toàn row mỗi phút (guild row ~90 fields → nguồn I/O lớn nhất).
  const refreshHeartbeat = runCounter % 5 === 0;
  // Sức khỏe AI (đợt 12): gộp aiStats() vào mutation sync 60s sẵn có — 0
  // function call thêm. Dashboard Admin (chỉ owner) đọc qua status:getAiHealth.
  let aiHealth;
  try {
    aiHealth = require("../ai").aiStats();
  } catch {
    aiHealth = undefined; // không bao giờ để lỗi AI làm hỏng sync guild
  }
  // Gắn TÊN mutation vào lỗi: Convex trả "Server Error" kèm Request ID mà
  // không nêu function nào hỏng, log ở index.js không có cách biết (sự cố
  // 05/10/2026 phải tra dashboard mới lộ ra guilds:botSyncGuilds).
  try {
    await store.client.mutation("guilds:botSyncGuilds", {
      guilds,
      trustedFullList,
      refreshHeartbeat,
      globalStatus: {
        guildCount: count,
        memberCount,
        version: "v60",
        ownerName,
        ownerAvatarUrl,
        aiHealth,
      },
    });
  } catch (e) {
    if (e && typeof e === "object" && !e.convexFunction) e.convexFunction = "guilds:botSyncGuilds";
    throw e;
  }
  lastSyncOkAt = Date.now();
  return { count, trustedFullList };
}

module.exports = { syncAll, syncOne, markGone, ensureModules, isSyncHealthy };

/** Upsert nhanh 1 guild vừa mời bot — sync NGAY tên/icon/thành viên + channels + roles.
 *  Previously only synced basic info, causing empty dropdowns on web dashboard
 *  until the next syncAll cycle (~5 min). Now syncs everything immediately.
 */
async function syncOne(client, store, guildId) {
  const g = client.guilds.cache.get(guildId);
  if (!g) return;
  try {
    await store.client.mutation("guilds:botSyncGuilds", {
      guilds: [
        {
          id: g.id,
          name: g.name,
          icon: g.icon ?? undefined,
          memberCount: g.memberCount ?? undefined,
        },
      ],
      trustedFullList: false,
    });
  } catch (err) {
    console.error(`[sync:one] ${guildId}:`, err.message);
  }

  // Sync channels + roles NGAY LẬP TỨC để web dashboard hiển thị dropdown.
  try {
    const channels = g.channels.cache
      .filter((c) => SYNC_CHANNEL_TYPES.includes(c.type))
      .map((c) => ({ channelId: c.id, name: c.name, type: c.type }));
    const roles = g.roles.cache
      .filter((r) => r.name !== "@everyone")
      .map((r) => ({ roleId: r.id, name: r.name, color: r.color, position: r.position }));

    const emojis = collectEmojis(g);

    if (channels.length > 0) {
      await store.client.mutation("guilds:syncChannels", { guildId, channels });
    }
    if (roles.length > 0) {
      await store.client.mutation("guilds:syncRoles", { guildId, roles });
    }
    // Emoji có thể là danh sách RỖNG hợp lệ (server chưa tạo emoji) — vẫn phải gọi
    // để xoá bản ghi cũ khi owner xoá hết emoji, không thì picker còn emoji ma.
    await store.client.mutation("guilds:syncEmojis", { guildId, emojis });
    prevGuildData.set(guildId, {
      name: g.name,
      icon: g.icon,
      memberCount: g.memberCount,
      channelHash: quickHash(JSON.stringify(channels)),
      roleHash: quickHash(JSON.stringify(roles)),
      emojiHash: quickHash(JSON.stringify(emojis)),
    });
  } catch (err) {
    console.error(`[sync:one:channels] ${guildId}:`, err.message);
  }
}

/** Bot bị kick khỏi guild */
async function markGone(client, store, guildId) {
  try {
    await store.client.mutation("guilds:botGuildGone", { guildId });
  } catch (err) {
    console.error(`[sync:gone] ${guildId}:`, err.message);
  }
}

/** Đảm bảo mọi guild đều có đủ các module mặc định */
async function ensureModules(client, store) {
  for (const g of client.guilds.cache.values()) {
    try {
      await store.client.mutation("bot_writes:botEnsureModules", { guildId: g.id });
      // Mutation vừa THÊM dòng module vào DB, nhưng cache config của bot đang giữ
      // payload cũ tới 30 phút (CONFIG_TTL_MS) — bot sẽ tiếp tục rơi vào fallback
      // moduleCfgOf cho module chưa có dòng. Xoá cache ngay để lần đọc kế tiếp lấy
      // cấu hình thật (đúng contract "invalidate sau khi bot tự ghi" của convex.js).
      store.invalidate(g.id);
    } catch (err) {
      console.error(`[sync:ensure] ${g.id}:`, err.message);
    }
  }
}
