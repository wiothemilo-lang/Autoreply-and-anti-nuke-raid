/**
 * backupImport.js — khôi phục từ file backup .msc/.json tải lên dashboard (bot
 * nuke khác). Tách từ handlers/backup.js (đợt #5) — code giữ nguyên hành vi.
 *
 * Luồng: tải nội dung file từ Convex storage → chuẩn hoá (backupNormalize) →
 * lưu bản gọn (bỏ blob base64) vào guildBackups → chạy restoreCore với
 * source "import" (claim kind riêng).
 */
const { normalizeBackupFile } = require("./backupNormalize");
const { restoreCore } = require("./backupRestore");
const { packBackupJson } = require("./backupUtils");

/**
 * Làm gọn bản backup lưu lại trong guildBackups: bỏ blob base64 nặng (media
 * trong tin nhắn + raw emoji/sticker) — chỉ giữ URL/link. Bản lưu này chỉ để
 * xem lại / khôi phục lần sau, còn việc đăng lại media thật dùng bản đầy đủ
 * trong bộ nhớ. Chống vượt giới hạn 1 MB của document Convex (file import lên
 * tới 8 MB có thể nhét nhiều base64).
 */
function slimBackupForStore(backup) {
  const slimMessages = (messages) =>
    messages?.map((m) =>
      Array.isArray(m.attachments)
        ? {
            ...m,
            attachments: m.attachments.filter(
              (a) => a && !(typeof a === "string" && a.startsWith("data:")),
            ),
          }
        : m,
    );
  const withoutRaw = ({ raw: _raw, ...media }) => media;
  return {
    ...backup,
    channels: backup.channels?.map((ch) => ({
      ...ch,
      messages: slimMessages(ch.messages),
      threads: ch.threads?.map((thread) => ({
        ...thread,
        messages: slimMessages(thread.messages),
      })),
    })),
    emojis: backup.emojis?.map(withoutRaw),
    stickers: backup.stickers?.map(withoutRaw),
  };
}

/** Khôi phục từ file backup .msc/.json tải lên (bot nuke khác). */
async function runImportRestore(client, store, guildId, fileContent, fileName, { claimAt } = {}) {
  const backup = normalizeBackupFile(fileContent);
  if (!backup.guildName || backup.guildName === "server từ file backup") {
    backup.guildName =
      String(fileName || "backup.msc")
        .replace(/\.(msc|json)$/i, "")
        .slice(0, 100) || "server từ file backup";
  }
  // Lưu bản đã chuẩn hóa (đã làm gọn blob base64) vào guildBackups để xem lại /
  // không mất dữ liệu — không nhét media nặng vào document (giới hạn 1 MB).
  try {
    const { backupJson, checksum, compressed, encrypted } = packBackupJson(
      JSON.stringify(slimBackupForStore(backup)),
    );
    const stored = await store.client.mutation("bot_writes:botStoreBackup", {
      guildId,
      guildName: backup.guildName,
      backupJson,
      backupChecksum: checksum,
      backupCompressed: compressed || undefined,
      backupEncrypted: encrypted || undefined,
      roleCount: backup.roles.length,
      channelCount: backup.channels.length,
      emojiCount: backup.emojis?.length ?? 0,
      stickerCount: backup.stickers?.length ?? 0,
      messageCount: backup.messageCount ?? 0,
      memberCount: Array.isArray(backup.members) ? backup.members.length : 0,
      source: "import",
      claimAt,
    });
    if (stored?.ok === false) {
      throw new Error(
        stored.reason === "stale_claim"
          ? "stale backup claim"
          : stored.reason || "không lưu được bản backup import",
      );
    }
  } catch (e) {
    console.error(`[backup:import:store] ${guildId}:`, e.message);
    // Không được bỏ qua lỗi/fencing: nếu claim đã stale mà vẫn gọi restoreCore,
    // bot có thể tạo role/kênh rồi mới phát hiện quyền đã chuyển sang worker khác.
    throw e;
  }
  return restoreCore(client, store, guildId, backup, {
    backupName: backup.guildName,
    source: "import",
    claimAt,
  });
}

module.exports = {
  slimBackupForStore,
  runImportRestore,
};
