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
const { computeChecksum } = require("./backupUtils");

/** Tải nội dung file import từ Convex file storage (URL botGetPending trả về). */
async function readImportContent(item) {
  if (item.importFileUrl) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    try {
      const res = await fetch(item.importFileUrl, { signal: ctrl.signal });
      if (res.ok) return await res.text();
      throw new Error(
        `Không tải được file backup từ đám mây (HTTP ${res.status}) — hãy thử tải lại file`,
      );
    } catch (e) {
      if (e?.name === "AbortError" || e?.code === "ABORT_ERR") {
        throw new Error("Tải file backup từ đám mây quá lâu (> 60 giây) — hãy thử lại", {
          cause: e,
        });
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  if (item.fileContent) return item.fileContent; // fallback yêu cầu cũ lưu nội dung trực tiếp
  throw new Error("Không lấy được file backup từ đám mây — hãy thử tải lại file");
}

/**
 * Làm gọn bản backup lưu lại trong guildBackups: bỏ blob base64 nặng (media
 * trong tin nhắn + raw emoji/sticker) — chỉ giữ URL/link. Bản lưu này chỉ để
 * xem lại / khôi phục lần sau, còn việc đăng lại media thật dùng bản đầy đủ
 * trong bộ nhớ. Chống vượt giới hạn 1 MB của document Convex (file import lên
 * tới 8 MB có thể nhét nhiều base64).
 */
function slimBackupForStore(backup) {
  const clone = JSON.parse(JSON.stringify(backup));
  const slimMessages = (list) => {
    for (const m of list || []) {
      if (Array.isArray(m.attachments)) {
        m.attachments = m.attachments
          .map((a) => (typeof a === "string" && a.startsWith("data:") ? null : a))
          .filter(Boolean);
      }
    }
  };
  for (const ch of clone.channels || []) {
    slimMessages(ch.messages);
    // Thread mang theo tin nhắn riêng — sót chỗ này là media base64 nằm lọt
    // vào bản lưu trên cloud (và phình JSON vượt trần 1 MB của Convex).
    for (const t of ch.threads || []) slimMessages(t.messages);
  }
  for (const e of clone.emojis || []) delete e.raw;
  for (const s of clone.stickers || []) delete s.raw;
  return clone;
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
    // Lưu kèm checksum của bản đã gọn: lần khôi phục sau (từ cloud) sẽ xác minh
    // được toàn vẹn — file import gốc không có checksum để so.
    const storedJson = JSON.stringify(slimBackupForStore(backup));
    const stored = await store.client.mutation("bot_writes:botStoreBackup", {
      guildId,
      guildName: backup.guildName,
      backupJson: storedJson,
      backupChecksum: computeChecksum(storedJson),
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
  readImportContent,
  slimBackupForStore,
  runImportRestore,
};
