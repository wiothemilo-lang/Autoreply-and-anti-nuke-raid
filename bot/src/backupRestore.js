/**
 * backupRestore.js — kế hoạch khôi phục (dry-run) + khôi phục thật từ bản backup
 * Protogon (runRestorePlan / restoreCore / runRestore). Tách từ handlers/backup.js
 * (đợt #5) — code giữ nguyên hành vi.
 *
 * `planRestoreCore` CỐ Ý không gọi bất kỳ lệnh tạo nào (roles.create /
 * channels.create / webhook.send) — đây là hợp đồng của dry-run, test khẳng định
 * được "khôi phục thì có tạo, kế hoạch thì không".
 */
const { Colors, PermissionsBitField } = require("discord.js");
const { logEmbed } = require("./util");
const {
  decompressAndDecryptBackup,
  filterBackupComponents,
  computeChecksum,
} = require("./backupUtils");
const { countMessages } = require("./backupNormalize");
const {
  MAX_MEMBERS_PER_BACKUP,
  MAX_REPLAY_PER_CHANNEL,
  myPermissionBits,
  sendToLog,
} = require("./backupCommon");
const {
  applyBans,
  applyEveryonePermissions,
  applyMemberRoles,
  applyGuildMeta,
  applyInvites,
  createChannels,
  createRoles,
  createThreads,
  recreateEmojis,
  replayMessages,
  restoreStickers,
  sortedChannels,
  sortedRoles,
} = require("./backupRebuild");

/**
 * Xác minh tính toàn vẹn của backup TRƯỚC khi khôi phục.
 *
 * `expectedChecksum` là SHA-256 của JSON THÔ lúc lưu (bot ghi `backupChecksum`
 * trong guildBackups). Trước đây bot chỉ bung nén + JSON.parse rồi khôi phục,
 * KHÔNG so checksum — một bản bị cắt cụt/sửa tay vẫn "khôi phục thành công" và
 * tạo ra cấu trúc sai (mất role/kênh) mà dashboard báo xanh. Thiếu checksum
 * (bản cũ, file import) thì bỏ qua kiểm — không nghi oan.
 */
function verifyBackupChecksum(jsonString, expectedChecksum) {
  if (!expectedChecksum || typeof expectedChecksum !== "string") {
    return { checked: false, ok: true, actual: null, expected: null };
  }
  const actual = computeChecksum(jsonString);
  return { checked: true, ok: actual === expectedChecksum, actual, expected: expectedChecksum };
}

/**
 * Tính KẾ HOẠCH khôi phục mà KHÔNG đụng server (dry-run).
 *
 * Lý do có hàm này: khôi phục là hành động KHÔNG HOÀN TÁC được — bot tạo hàng
 * chục role/kênh và spam tin nhắn qua webhook; nếu thiếu quyền hoặc kênh trùng
 * tên thì chủ server chỉ biết sau khi đã làm. Dry-run đọc backup + cấu hình
 * rồi báo TRƯỚC: tạo bao nhiêu role/kênh/tin, thiếu quyền gì, cảnh báo nào.
 *
 * Cố ý KHÔNG gọi bất kỳ lệnh tạo nào (roles.create / channels.create /
 * webhook.send): đây là hợp đồng của dry-run.
 */
async function planRestoreCore(client, store, guildId, backup, { backupName } = {}) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild || guild.available === false) {
    throw new Error("Bot không còn trong server cần khôi phục");
  }
  const cfg = await store.getConfig(guildId).catch(() => null);
  const restoreRoles = cfg?.restoreRolesEnabled !== false;
  const restoreChannels = cfg?.restoreChannelsEnabled !== false;
  const restoreMessages = cfg?.restoreMessagesEnabled !== false;
  const restoreEmojis = cfg?.restoreEmojisEnabled !== false;
  // Phần "ngoài cấu trúc" — phải KHỚP với restoreCore, nếu không kế hoạch nói
  // một đằng, khôi phục thật làm một nẻo (lỗi tinh vi nhất của mọi bản thuyết phục).
  const restoreExtras = cfg?.restoreExtrasEnabled === true;

  const roles = sortedRoles(backup).filter((r) => r.name);
  const channels = sortedChannels(backup).filter((c) => c.name);
  const emojis = (backup.emojis || []).filter((e) => e && e.name);
  const stickers = (backup.stickers || []).filter((s) => s && s.name);
  const threadCount = restoreChannels
    ? channels.reduce((n, c) => n + (Array.isArray(c.threads) ? c.threads.length : 0), 0)
    : 0;
  const banCount = restoreExtras ? (backup.bans || []).filter((b) => b?.userId).length : 0;
  // Bản đồ thành viên ↔ vai trò (P2): chỉ có ý nghĩa khi role được tạo lại.
  const memberEntries = restoreRoles && Array.isArray(backup.members) ? backup.members : [];
  const memberCount = memberEntries.filter((m) => m?.userId).length;
  const memberRoleAssignments = memberEntries.reduce(
    (n, m) => n + (Array.isArray(m?.roles) ? m.roles.length : 0),
    0,
  );

  // replayMessages chỉ gửi tối đa MAX_REPLAY_PER_CHANNEL tin/kênh và chỉ kênh
  // có bản ghi mới được gửi → báo đúng số SẼ phục hồi, không phải số có trong
  // file (backup có thể chứa 50 tin × 60 kênh mà chỉ 50/kênh là phục hồi được).
  let messages = 0;
  let skippedMessages = 0;
  for (const c of channels) {
    const n = Array.isArray(c.messages) ? c.messages.length : 0;
    if (n === 0) continue;
    messages += Math.min(n, MAX_REPLAY_PER_CHANNEL);
    skippedMessages += Math.max(0, n - MAX_REPLAY_PER_CHANNEL);
  }

  // Cấu hình sẽ được áp lại: restoreCore chỉ ghi đè được field map trọn vẹn,
  // thiếu 1 role là GIỮ NGUYÊN cả danh sách — báo trước để chủ server biết.
  const s = backup.settings || {};
  const asArr = (v) => (Array.isArray(v) ? v : []);
  const settingRoleRefs = [
    ...new Set([...asArr(s.modRoles), ...asArr(s.adminRoles), ...asArr(s.whitelistRoles)]),
  ];
  const roleIds = new Set(roles.map((r) => r.id));
  const orphanRoleRefs = settingRoleRefs.filter((id) => !roleIds.has(id));
  const settingsCount =
    settingRoleRefs.length +
    (s.prefix ? 1 : 0) +
    (asArr(s.badWords).length > 0 ? 1 : 0) +
    (s.logChannelId ? 1 : 0) +
    (s.modLogChannelId ? 1 : 0);

  const warnings = [];
  const myBits = myPermissionBits(guild);
  const can = (flag) => {
    const bit = PermissionsBitField.Flags?.[flag];
    if (bit === undefined) return false; // không biết quyền → coi như thiếu, nói ra
    return (BigInt(myBits) & BigInt(bit)) === BigInt(bit);
  };
  if (restoreRoles && roles.length > 0 && !can("ManageRoles")) {
    warnings.push(
      `Bot thiếu quyền Manage Roles — ${roles.length} role trong backup sẽ KHÔNG tạo lại được.`,
    );
  }
  // Vai trò thành viên (P2): cùng nhu cầu quyền nhưng là hành động khác —
  // gán vai trò còn nhạy hơn tạo role, nên phải nói rõ khi bot không làm được.
  if (memberCount > 0 && !can("ManageRoles")) {
    warnings.push(
      `Bot thiếu quyền Manage Roles — ${memberRoleAssignments} vai trò của ${memberCount} thành viên sẽ KHÔNG gán lại được.`,
    );
  }
  if (backup.memberRolesUnavailable === true) {
    warnings.push(
      "Bản backup KHÔNG có bản đồ vai trò thành viên — lúc chụp, bot không đọc được danh sách thành viên (thiếu quyền hoặc thiếu intent Guild Members trong Developer Portal).",
    );
  }
  if (backup.memberRolesTruncated === true) {
    warnings.push(
      `Bản đồ vai trò bị cắt ở ${MAX_MEMBERS_PER_BACKUP} thành viên — các thành viên còn lại không có vai trò được khôi phục.`,
    );
  }
  if (restoreChannels && channels.length > 0 && !can("ManageChannels")) {
    warnings.push(
      `Bot thiếu quyền Manage Channels — ${channels.length} kênh trong backup sẽ KHÔNG tạo lại được.`,
    );
  }
  const existingNames = new Set([...(guild.channels?.cache?.values?.() ?? [])].map((c) => c.name));
  const dupChannels = restoreChannels
    ? channels.filter((c) => existingNames.has(c.name)).length
    : 0;
  if (dupChannels > 0) {
    warnings.push(
      `${dupChannels} kênh trùng tên với kênh đang có trong server — Discord sẽ tự đổi tên (general → general-2).`,
    );
  }
  // Trần role của server: Discord chặn ở 250 role (đã trừ @everyone).
  const existingRoles = guild.roles?.cache?.size ?? 0;
  if (restoreRoles && existingRoles + roles.length > 250) {
    warnings.push(
      `Server đã có ${existingRoles} role, backup thêm ${roles.length} — vượt trần 250 role, Discord sẽ từ chối phần dư.`,
    );
  }
  if (restoreRoles && orphanRoleRefs.length > 0) {
    warnings.push(
      `${orphanRoleRefs.length} role trong cấu hình (admin/mod/whitelist) không có trong backup → danh sách cũ sẽ được GIỮ NGUYÊN.`,
    );
  }
  if (skippedMessages > 0) {
    warnings.push(
      `${skippedMessages} tin nhắn vượt giới hạn ${MAX_REPLAY_PER_CHANNEL} tin/kênh sẽ không được phục hồi.`,
    );
  }
  const skipped = [];
  if (!restoreRoles) skipped.push("role");
  if (!restoreChannels) skipped.push("kênh");
  if (!restoreMessages) skipped.push("tin nhắn");
  if (!restoreEmojis) skipped.push("emoji/sticker");
  if (skipped.length > 0) {
    warnings.push(
      `Đang tắt khôi phục ${skipped.join(", ")} trong Tùy chỉnh khôi phục — phần này sẽ KHÔNG được tạo lại.`,
    );
  }
  if (threadCount > 0) {
    warnings.push(`${threadCount} thread sẽ được tạo lại trong các kênh đã dựng.`);
  }
  if (!restoreExtras && ((backup.bans || []).length > 0 || (backup.invites || []).length > 0)) {
    warnings.push(
      "Bản backup có danh sách ban và link mời nhưng bạn CHƯA bật “khôi phục ban/link mời” — phần này sẽ không được áp lại.",
    );
  }
  if (restoreExtras && banCount > 0) {
    warnings.push(
      `${banCount} thành viên bị ban sẽ được cấm lại — hành động này KHÔNG hoàn tác được.`,
    );
  }
  if (messages === 0 && countMessages(backup) > 0) {
    warnings.push(
      "Backup có tin nhắn nhưng chưa bật khôi phục tin nhắn (hoặc kênh chứa tin đã bị xóa) — sẽ không phục hồi tin nào.",
    );
  }
  const roleCount = restoreRoles ? roles.length : 0;
  const channelCount = restoreChannels ? channels.length : 0;
  if (roleCount === 0 && channelCount === 0) {
    warnings.push("Bản backup này không có role/kênh nào để tạo — khôi phục sẽ không tạo gì.");
  }

  return {
    guildName: backupName || backup.guildName || null,
    createdAt: backup.createdAt ?? null,
    roleCount,
    channelCount,
    messageCount: restoreMessages ? messages : 0,
    emojiCount: restoreEmojis ? emojis.length : 0,
    stickerCount: restoreEmojis ? stickers.length : 0,
    threadCount,
    banCount,
    memberCount,
    memberRoleAssignments,
    settingsCount: restoreRoles || restoreChannels ? settingsCount : 0,
    warnings,
    at: Date.now(),
  };
}

/**
 * Dry-run từ một bản backup trên cloud: bung nén → chuẩn hoá giống hệt
 * runRestore (kể cả bộ lọc thành phần) → tính kế hoạch → báo ngược lên
 * dashboard. Dùng CHUNG đường chuẩn hoá với restore thật, nếu không kế hoạch
 * nói "sẽ tạo 5 kênh" còn restore thật tạo 7 là bản thuyết phục sai.
 */
async function runRestorePlan(client, store, guildId, backupJson, backupName, options = {}) {
  let json = backupJson;
  try {
    json = decompressAndDecryptBackup(backupJson);
  } catch {}
  const integrity = verifyBackupChecksum(json, options.expectedChecksum);
  if (integrity.checked && !integrity.ok) {
    throw new Error(
      "Backup hỏng — checksum không khớp nội dung (dữ liệu đã bị thay đổi sau khi lưu). Dừng tạo kế hoạch để không báo sai.",
    );
  }
  let backup;
  try {
    backup = JSON.parse(json);
  } catch {
    throw new Error("Backup bi hong (khong doc duoc JSON)");
  }
  if (
    options.restoreRoles === false ||
    options.restoreChannels === false ||
    options.restoreMessages === false ||
    options.restoreEmojis === false
  ) {
    backup = filterBackupComponents(backup, {
      roles: options.restoreRoles !== false,
      channels: options.restoreChannels !== false,
      emojis: options.restoreEmojis !== false,
      stickers: options.restoreEmojis !== false,
      messages: options.restoreMessages !== false,
    });
  }
  const plan = await planRestoreCore(client, store, guildId, backup, { backupName });
  // Bản backup nhập từ file (.msc/.json) do `normalizeBackupFile` dựng nên KHÔNG
  // có `createdAt`, và `planRestoreCore` trả `null` cho field thiếu. Hợp đồng
  // Convex (`restorePlan.createdAt`/`guildName` = v.optional) chỉ nhận field
  // VẮNG MẶT, không nhận null ⇒ gửi thẳng null làm botReportRestorePlan ném
  // ArgumentValidationError: dashboard hiện lỗi kỹ thuật thay vì kế hoạch
  // (bug thật: bấm "Xem kế hoạch" trên bản backup import là luôn hỏng).
  const reported = await store.client.mutation("bot_writes:botReportRestorePlan", {
    guildId,
    plan: {
      ...plan,
      guildName: plan.guildName ?? undefined,
      createdAt: plan.createdAt ?? undefined,
      threadCount: plan.threadCount ?? undefined,
      banCount: plan.banCount ?? undefined,
    },
    claimAt: options.claimAt,
  });
  if (reported?.ok !== true) {
    throw new Error(
      reported?.reason === "stale_claim"
        ? "stale backup claim"
        : "không xác nhận được kế hoạch khôi phục",
    );
  }
  console.log(
    `[backup:plan] ${guildId}: ${plan.roleCount} roles, ${plan.channelCount} channels, ${plan.messageCount} messages, ${plan.warnings.length} cảnh báo`,
  );
  return plan;
}

async function restoreCore(
  client,
  store,
  guildId,
  backup,
  { backupName, source = "restore", claimAt },
) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild || guild.available === false) {
    throw new Error("Bot không còn trong server cần khôi phục");
  }
  // Tùy chỉnh khôi phục từ web (bật/tắt role + emoji/sticker) — áp dụng cho cả
  // backup Protogon lẫn file .msc/.json của bot nuke (cùng restoreCore này).
  const cfg = await store.getConfig(guildId).catch(() => null);
  const restoreRoles = cfg?.restoreRolesEnabled !== false;
  const restoreChannels = cfg?.restoreChannelsEnabled !== false;
  const restoreMessages = cfg?.restoreMessagesEnabled !== false;
  const restoreEmojis = cfg?.restoreEmojisEnabled !== false;
  // Phần "ngoài cấu trúc": tên/mô tả/icon server (mặc định bật — đây là thứ
  // người dùng nhận ra đầu tiên sau khi mở lại server bị nuke), ban list + link
  // mời (mặc định TẮT vì cấm người và mở link mời là hành động phá hủy, phải
  // chủ server bật mới chạy).
  const restoreMeta = cfg?.restoreMetaEnabled !== false;
  const restoreExtras = cfg?.restoreExtrasEnabled === true;
  const claimKind = source === "import" ? "import" : "restore";
  const ensureClaim = async () => {
    if (claimAt === undefined) return;
    const result = await store.client.mutation("bot_writes:botRenewBackupClaim", {
      guildId,
      kind: claimKind,
      claimAt,
    });
    if (result?.ok !== true) {
      throw new Error(
        result?.reason === "stale_claim"
          ? "stale backup claim"
          : "không xác nhận được claim restore",
      );
    }
  };

  await ensureClaim();
  if (!restoreRoles || !restoreChannels || !restoreMessages || !restoreEmojis) {
    console.log(
      `[backup:restore] ${guildId}: tùy chỉnh khôi phục — role=${restoreRoles ? "bật" : "TẮT"}, kênh=${restoreChannels ? "bật" : "TẮT"}, tin nhắn=${restoreMessages ? "bật" : "TẮT"}, emoji/sticker=${restoreEmojis ? "bật" : "TẮT"}`,
    );
  }
  const roleMap = restoreRoles ? await createRoles(guild, backup, ensureClaim) : new Map();
  await ensureClaim();
  const channelMap = restoreChannels
    ? await createChannels(guild, backup, roleMap, ensureClaim)
    : new Map();
  await ensureClaim();
  const replayed = restoreMessages
    ? await replayMessages(guild, backup, channelMap, ensureClaim)
    : 0;
  await ensureClaim();
  // Thread: tạo lại trong kênh vừa dựng + phục hồi tin trong thread.
  const threadResult = restoreChannels
    ? await createThreads(guild, backup, channelMap, ensureClaim, { restoreMessages })
    : { threadsCreated: 0, messages: 0 };
  await ensureClaim();
  // Emoji + sticker: tải ảnh/file về và tạo lại thật (best-effort, lỗi từng cái bỏ qua).
  const emojisCreated = restoreEmojis ? await recreateEmojis(guild, backup, ensureClaim) : 0;
  await ensureClaim();
  const stickersCreated = restoreEmojis ? await restoreStickers(guild, backup, ensureClaim) : 0;
  await ensureClaim();
  // Danh tính server: tên / mô tả / icon.
  const metaApplied = restoreMeta
    ? await applyGuildMeta(guild, backup.guildMeta || { name: backup.guildName }, channelMap)
    : { name: false, description: false, icon: false };
  const everyoneApplied = restoreMeta ? await applyEveryonePermissions(guild, backup) : false;
  await ensureClaim();
  // Vai trò thành viên (P2): chỉ chạy khi role THẬT SỰ được tạo lại — roleMap
  // rỗng thì bản đồ id cũ → id mới không có gì để tra, áp vào là vô nghĩa.
  const memberRoleStats =
    restoreRoles && roleMap.size > 0
      ? await applyMemberRoles(guild, backup, roleMap, ensureClaim)
      : { members: 0, assigned: 0, skipped: 0, missing: 0, noPermission: false };
  await ensureClaim();
  // Ban list + link mời (chỉ khi chủ server bật "khôi phục ban/link mời").
  const bansApplied = restoreExtras ? await applyBans(guild, backup.bans) : 0;
  const invitesCreated = restoreExtras ? await applyInvites(guild, backup, channelMap) : 0;
  await ensureClaim();

  // Áp lại cấu hình cơ bản với id mới (role/kênh đã được map sang server này).
  // File import có thể chứa settings sai kiểu (object/chuỗi thay vì mảng) —
  // ép về mảng trước khi map để không ném TypeError làm hỏng cả restore.
  const s = backup.settings || {};
  const asIdArray = (v) => (Array.isArray(v) ? v : []);
  const mapId = (id, m) => (id ? m.get(id) || undefined : undefined);
  // Chỉ ghi đè danh sách role/kênh khi bản khôi phục THỰC SỰ dựng lại chúng.
  // Nếu chủ server tắt "khôi phục role" thì roleMap rỗng → map ra [] → ghi đè
  // admin/mod/whitelist của server thành rỗng, tức mất luôn cấu hình "role nào là
  // admin/mod" ⇒ tê liệt heat + mất mọi miễn trừ anti-nuke, trong khi họ chỉ xin
  // ĐỪNG đụng role. Gửi undefined để Convex giữ nguyên field cũ (botRestoreSettings
  // chỉ patch field được truyền). Tương tự cho logChannelId/modLogChannelId.
  // Tệ hơn nữa: khi "khôi phục role" BẬT nhưng role đó tạo thất bại (thiếu quyền
  // Manage Roles, chạm trần 250 role, rate limit) thì .filter(Boolean) âm thầm
  // LOẠI id khỏi danh sách, Convex nhận mảng thiếu phần tử ⇒ chủ server mất luôn
  // role admin/mod/whitelist đó (tê liệt heat + mất miễn trừ anti-nuke) trong
  // khi báo cáo vẫn ghi "Role đã tạo: N". Danh sách không map trọn vẹn → gửi
  // undefined để Convex giữ nguyên cấu hình cũ, và nói rõ trong báo cáo.
  const droppedRoleRefs = [];
  const remapRoles = (v) => {
    if (!restoreRoles) return undefined;
    const ids = asIdArray(v);
    const mapped = ids.map((id) => roleMap.get(id));
    const missing = ids.filter((id, i) => !mapped[i]);
    if (missing.length > 0) {
      droppedRoleRefs.push(...missing);
      console.error(
        `[backup:restore] ${guildId}: ${missing.length} role trong cấu hình không tạo lại được (${missing.join(", ")}) — GIỮ NGUYÊN danh sách cũ`,
      );
      return undefined;
    }
    return mapped;
  };
  const remapChannel = (id) => (restoreChannels ? (mapId(id, channelMap) ?? null) : undefined);
  const settingsResult = await store.client.mutation("bot_writes:botRestoreSettings", {
    guildId,
    prefix: typeof s.prefix === "string" ? s.prefix : undefined,
    badWords: Array.isArray(s.badWords) ? s.badWords : undefined,
    whitelistRoles: remapRoles(s.whitelistRoles),
    whitelistUsers: Array.isArray(s.whitelistUsers) ? s.whitelistUsers : undefined,
    modRoles: remapRoles(s.modRoles),
    adminRoles: remapRoles(s.adminRoles),
    logChannelId: remapChannel(s.logChannelId),
    modLogChannelId: remapChannel(s.modLogChannelId),
    claimAt,
  });
  if (settingsResult?.ok === false) {
    throw new Error(
      settingsResult.reason === "stale_claim"
        ? "stale backup claim"
        : "restore settings bị từ chối",
    );
  }

  const cleared = await store.client.mutation("bot_writes:botClearBackup", {
    guildId,
    kind: source === "import" ? "import" : "restore",
    claimAt,
  });
  if (cleared?.ok !== true) {
    throw new Error(
      cleared?.reason === "stale_claim"
        ? "stale backup claim"
        : "không xác nhận được yêu cầu restore",
    );
  }

  const fields = [];
  if (restoreRoles) {
    fields.push({ name: "Role đã tạo", value: `${roleMap.size}`, inline: true });
  } else {
    fields.push({ name: "Role", value: "⏭️ bỏ qua (đã tắt)", inline: true });
  }
  if (restoreChannels) {
    fields.push({ name: "Kênh đã tạo", value: `${channelMap.size}`, inline: true });
  } else {
    fields.push({ name: "Kênh", value: "⏭️ bỏ qua (đã tắt)", inline: true });
  }
  if (restoreEmojis) {
    if (emojisCreated > 0) {
      fields.push({ name: "Emoji đã tạo", value: `${emojisCreated}`, inline: true });
    }
    if (stickersCreated > 0) {
      fields.push({ name: "Sticker đã tạo", value: `${stickersCreated}`, inline: true });
    }
  } else {
    fields.push({ name: "Emoji/Sticker", value: "⏭️ bỏ qua (đã tắt)", inline: true });
  }
  if (restoreMessages) {
    if (replayed > 0) {
      fields.push({ name: "Tin nhắn đã phục hồi", value: `${replayed}`, inline: true });
    }
  } else {
    fields.push({ name: "Tin nhắn", value: "⏭️ bỏ qua (đã tắt)", inline: true });
  }
  if (threadResult.threadsCreated > 0) {
    fields.push({
      name: "Thread đã tạo",
      value: `${threadResult.threadsCreated} (${threadResult.messages} tin nhắn trong thread)`,
      inline: true,
    });
  }
  if (restoreRoles) {
    const memberTotal = Array.isArray(backup.members) ? backup.members.length : 0;
    if (memberRoleStats.assigned > 0) {
      fields.push({
        name: "Vai trò thành viên",
        value: `${memberRoleStats.assigned} vai trò trên ${memberRoleStats.members} thành viên`,
        inline: true,
      });
    } else if (memberRoleStats.noPermission) {
      fields.push({
        name: "Vai trò thành viên",
        value: "⏭️ bỏ qua — bot thiếu quyền Manage Roles",
        inline: true,
      });
    } else if (memberTotal > 0) {
      // Có bản đồ nhưng không gán được gì: phải nói RÕ lý do, không im lặng —
      // nếu không chủ server tưởng vai trò đã về đúng chỗ.
      const why = [];
      if (memberRoleStats.missing > 0)
        why.push(`${memberRoleStats.missing} không còn trong server`);
      if (memberRoleStats.skipped > 0) why.push(`${memberRoleStats.skipped} lỗi khi gán`);
      if (why.length === 0) why.push("vai trò đã có sẵn hoặc bot không quản lý được role nào");
      fields.push({
        name: "Vai trò thành viên",
        value: `⏭️ chưa gán được (${why.join("; ")})`,
        inline: true,
      });
    }
  }
  if (restoreExtras) {
    if (bansApplied > 0) {
      fields.push({ name: "Thành viên đã cấm", value: `${bansApplied}`, inline: true });
    }
    if (invitesCreated > 0) {
      fields.push({ name: "Link mời đã tạo", value: `${invitesCreated}`, inline: true });
    }
  }
  if (restoreMeta) {
    const parts = [
      metaApplied.name ? "tên" : null,
      metaApplied.description ? "mô tả" : null,
      metaApplied.icon ? "icon" : null,
      metaApplied.banner ? "banner" : null,
      metaApplied.splash ? "splash" : null,
      metaApplied.settings ? "thiết lập server" : null,
      everyoneApplied ? "quyền @everyone" : null,
    ].filter(Boolean);
    if (parts.length > 0) {
      fields.push({
        name: "Thông tin server",
        value: `Đã áp lại ${parts.join(", ")}`,
        inline: true,
      });
    }
  }
  if (droppedRoleRefs.length > 0) {
    fields.push({
      name: "⚠️ Cấu hình role giữ nguyên",
      value: `${droppedRoleRefs.length} role trong cấu hình (admin/mod/whitelist) không tạo lại được nên danh sách cũ được GIỮ NGUYÊN, không bị ghi đè. Kiểm tra lại tab Nội dung & phạt sau khi restore.`,
      inline: false,
    });
  }
  fields.push({
    name: "Lưu ý",
    value:
      "Kênh đã được sắp xếp lại đúng thứ tự trong file backup; phần role, kênh, tin nhắn và emoji/sticker đã tắt trong Tùy chỉnh khôi phục sẽ không được tạo/phục hồi. Vai trò chỉ được gán cho thành viên đang có trong server, và chỉ gán vai trò mà bot có quyền quản lý. Các role/kênh có sẵn của server này được giữ nguyên. Danh sách ban và link mời chỉ được áp lại khi bật “khôi phục ban/link mời” (link mời cũ đã chết sau khi server bị xoá nên bot tạo link MỚI trỏ đúng kênh). Hãy kiểm tra lại quyền theo ý muốn.",
    inline: false,
  });

  const embed = logEmbed({
    title: "♻️ Đã khôi phục server từ backup",
    description: `Đã tạo lại cấu trúc của **${backupName || "server đã backup"}** trên **${guild.name}**${restoreRoles ? ` — **${roleMap.size} role**` : " (bỏ qua role — đã tắt)"}${restoreChannels ? ` — **${channelMap.size} kênh**` : " (bỏ qua kênh — đã tắt)"}${restoreMessages ? (replayed > 0 ? ` — phục hồi **${replayed} tin nhắn** theo đúng thứ tự thời gian` : "") : " (bỏ qua tin nhắn — đã tắt)"}${restoreEmojis && emojisCreated > 0 ? ` + **${emojisCreated} emoji**` : ""}${restoreEmojis && stickersCreated > 0 ? ` + **${stickersCreated} sticker**` : ""}${restoreEmojis ? "" : " (bỏ qua emoji/sticker — đã tắt)"}.`,
    color: Colors.Green,
    fields,
    footer: "Protogon · Backup",
  });
  await sendToLog(guild, embed, store);
  console.log(
    `[backup:restore] ${guildId}: ${roleMap.size} roles, ${channelMap.size} channels, ${threadResult.threadsCreated} threads, ${replayed} messages, ${emojisCreated} emojis, ${stickersCreated} stickers, ${memberRoleStats.assigned} member-roles/${memberRoleStats.members} members, ${bansApplied} bans, ${invitesCreated} invites (${source}, restoreRoles=${restoreRoles}, restoreChannels=${restoreChannels}, restoreMessages=${restoreMessages}, restoreEmojis=${restoreEmojis}, restoreMeta=${restoreMeta}, restoreExtras=${restoreExtras})`,
  );
  return {
    roleCount: roleMap.size,
    channelCount: channelMap.size,
    memberRoleCount: memberRoleStats.assigned,
    memberRoleMemberCount: memberRoleStats.members,
    memberRoleSkipped: memberRoleStats.skipped,
    memberRoleMissing: memberRoleStats.missing,
    threadCount: threadResult.threadsCreated,
    threadMessageCount: threadResult.messages,
    messageCount: replayed,
    emojiCount: emojisCreated,
    stickerCount: stickersCreated,
    banCount: bansApplied,
    inviteCount: invitesCreated,
    metaApplied,
  };
}

async function runRestore(client, store, guildId, backupJson, backupName, options = {}) {
  let json = backupJson;
  try {
    json = decompressAndDecryptBackup(backupJson);
  } catch {}
  // Xác minh toàn vẹn TRƯỚC khi tạo bất cứ thứ gì: khôi phục từ bản bị sửa/cắt
  // cụt sẽ tạo cấu trúc sai mà vẫn báo thành công.
  const integrity = verifyBackupChecksum(json, options.expectedChecksum);
  if (integrity.checked && !integrity.ok) {
    throw new Error(
      "Backup hỏng — checksum không khớp nội dung (dữ liệu đã bị thay đổi sau khi lưu). Dừng khôi phục để không tạo cấu trúc sai; hãy chọn bản backup khác.",
    );
  }
  let backup;
  try {
    backup = JSON.parse(json);
  } catch {
    throw new Error("Backup bi hong (khong doc duoc JSON)");
  }
  if (
    options.restoreRoles === false ||
    options.restoreChannels === false ||
    options.restoreMessages === false ||
    options.restoreEmojis === false
  ) {
    backup = filterBackupComponents(backup, {
      roles: options.restoreRoles !== false,
      channels: options.restoreChannels !== false,
      emojis: options.restoreEmojis !== false,
      stickers: options.restoreEmojis !== false,
      messages: options.restoreMessages !== false,
    });
  }
  return restoreCore(client, store, guildId, backup, {
    backupName,
    source: "restore",
    claimAt: options.claimAt,
  });
}

module.exports = {
  planRestoreCore,
  runRestorePlan,
  restoreCore,
  runRestore,
};
