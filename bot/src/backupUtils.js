/**
 * Backup Enhancement Utilities
 * ─────────────────────────────
 * Compression, checksum verification, incremental detection, and encryption
 * for the Protogon backup system.
 *
 * - zlib compression: reduces backup JSON size by 60-80%
 * - SHA-256 checksum: integrity verification + incremental backup detection
 * - AES-256-GCM encryption: optional encryption for sensitive backup data
 */
const zlib = require("zlib");
const crypto = require("crypto");

// ─── Compression ──────────────────────────────────────────────────────────────

/** Compress a JSON string with zlib deflate. Returns base64 string prefixed with 'z:' */
function compressBackup(jsonString) {
  try {
    const compressed = zlib.deflateSync(Buffer.from(jsonString, "utf8"));
    return "z:" + compressed.toString("base64");
  } catch (e) {
    console.error("[backup:compress] failed:", e.message);
    return jsonString;
  }
}

/**
 * Trần output khi bung nén (chống decompression bomb). File backup nén có thể
 * nhỏ vài trăm KB nhưng zlib nở gấp ~1000 lần; không chặn thì VPS hết RAM khi
 * import file độc. 64 MB rộng rãi cho server lớn, chặn mọi payload bất thường.
 */
const MAX_DECOMPRESSED_BYTES = 64 * 1024 * 1024;

/** Decompress a backup string — handles both compressed (z:...) and plain JSON. */
function uncompressBackup(data) {
  if (typeof data === "string" && data.startsWith("z:")) {
    try {
      const buf = zlib.inflateSync(Buffer.from(data.slice(2), "base64"), {
        maxOutputLength: MAX_DECOMPRESSED_BYTES,
      });
      return buf.toString("utf8");
    } catch (e) {
      console.error("[backup:uncompress] failed:", e.message);
      return data;
    }
  }
  return data;
}

// ─── Checksum / Integrity ────────────────────────────────────────────────────

/** Compute SHA-256 checksum of a string for integrity verification. */
function computeChecksum(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

/**
 * Compute checksum from backup snapshot (without volatile fields like timestamps).
 * Used to detect whether a new backup is meaningfully different from the previous one.
 */
function computeSnapshotChecksum(snapshot) {
  const stable = JSON.stringify({
    roles: snapshot.roles,
    channels: snapshot.channels,
    emojis: snapshot.emojis,
    stickers: snapshot.stickers,
    settings: snapshot.settings,
    // Cấu hình server (tên/icon/banner/mức xác minh/kênh hệ thống…) + quyền
    // @everyone là phần khôi phục được, nên đổi chúng PHẢI làm checksum lệch
    // để incremental không bỏ qua nhầm một thay đổi thật.
    guildMeta: snapshot.guildMeta,
    everyonePermissions: snapshot.everyonePermissions,
    // Bản đồ thành viên ↔ vai trò (P2): đổi vai trò của một thành viên là thay
    // đổi THẬT trong backup → phải làm checksum lệch, nếu không incremental sẽ
    // bỏ qua và giữ bản cũ với vai trò đã lỗi thời.
    members: snapshot.members,
    // Danh sách ban + link mời: restoreCore CÓ khôi phục chúng (khi bật "khôi
    // phục ban/link mời"), nên chúng là phần khôi phục được → đổi chúng phải
    // làm checksum lệch. Trước đây bị bỏ sót: cấm người mới (nuke) không tạo
    // bản mới, bản cũ giữ danh sách ban cũ ⇒ kẻ nuke lọt ngay vào bản "khôi
    // phục xong" mà chủ server không hề biết.
    bans: snapshot.bans,
    invites: snapshot.invites,
  });
  return computeChecksum(stable);
}

// ─── Encryption (AES-256-GCM) ────────────────────────────────────────────────

/** AES-256-GCM encrypt a string. Returns base64 payload with IV + auth tag prepended. */
function encryptBackup(jsonString, secret) {
  if (!secret) return jsonString;
  try {
    const key = crypto.createHash("sha256").update(secret).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(jsonString, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return "e:" + Buffer.concat([iv, tag, encrypted]).toString("base64");
  } catch (e) {
    console.error("[backup:encrypt] failed:", e.message);
    return jsonString;
  }
}

/** AES-256-GCM decrypt a string encrypted by encryptBackup. */
function decryptBackup(data, secret) {
  if (!secret || typeof data !== "string" || !data.startsWith("e:")) return data;
  try {
    const key = crypto.createHash("sha256").update(secret).digest();
    const raw = Buffer.from(data.slice(2), "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch (e) {
    console.error("[backup:decrypt] failed:", e.message);
    return data;
  }
}

// ─── Combined Operations ─────────────────────────────────────────────────────

/** Read encryption key from environment. Set BACKUP_ENCRYPT_KEY in .env to enable. */
function getEncryptionKey() {
  return process.env.BACKUP_ENCRYPT_KEY || null;
}

/**
 * Compress + encrypt a backup JSON string for storage.
 * Returns { backupJson, compressed, checksum, encrypted }.
 */
function compressAndEncryptBackup(snapshot) {
  const json = JSON.stringify(snapshot);
  const checksum = computeChecksum(json);
  const snapshotChecksum = computeSnapshotChecksum(snapshot);
  const encKey = getEncryptionKey();
  let finalJson = json;
  let encrypted = false;
  if (encKey) {
    finalJson = encryptBackup(finalJson, encKey);
    encrypted = true;
  }
  finalJson = compressBackup(finalJson);
  return { backupJson: finalJson, compressed: true, checksum, snapshotChecksum, encrypted };
}

/**
 * Decompress + decrypt a backup JSON string read from storage.
 */
function decompressAndDecryptBackup(data) {
  let json = uncompressBackup(data);
  const encKey = getEncryptionKey();
  if (encKey) {
    json = decryptBackup(json, encKey);
  }
  return json;
}

// ─── Partial Restore Filter ──────────────────────────────────────────────────

/**
 * Filter a backup object to only include selected components.
 * @param {object} backup - The full backup object
 * @param {object} filter - { roles: bool, channels: bool, emojis: bool, stickers: bool, messages: bool }
 * @returns {object} Filtered backup
 */
function filterBackupComponents(backup, filter = {}) {
  const result = { ...backup };
  // Dữ liệu có thể sai kiểu (file import từ bot nuke khác) — ép mảng an toàn
  // trước khi map/reduce để không ném TypeError làm hỏng cả restore.
  const arr = (v) => (Array.isArray(v) ? v : []);
  result.roles = arr(result.roles);
  result.channels = arr(result.channels);
  result.emojis = arr(result.emojis);
  result.stickers = arr(result.stickers);
  result.members = arr(result.members);
  if (filter.roles === false) result.roles = [];
  // Bản đồ thành viên chỉ có nghĩa kèm vai trò: tắt "khôi phục role" thì phải
  // bỏ luôn bản đồ, nếu không báo cáo vẫn đếm "sẽ gán N vai trò" cho một
  // lượt khôi phục không hề tạo role nào.
  if (filter.roles === false) result.members = [];
  if (filter.channels === false) result.channels = [];
  if (filter.emojis === false) result.emojis = [];
  if (filter.stickers === false) result.stickers = [];
  if (filter.messages === false && result.channels) {
    result.channels = result.channels.map((ch) => ({
      ...(ch && typeof ch === "object" ? ch : {}),
      messages: [],
    }));
  }
  result.roleCount = result.roles.length;
  result.channelCount = result.channels.length;
  result.emojiCount = result.emojis.length;
  result.stickerCount = result.stickers.length;
  result.messageCount = result.channels.reduce(
    (n, c) => n + (Array.isArray(c?.messages) ? c.messages.length : 0),
    0,
  );
  return result;
}

module.exports = {
  compressBackup,
  uncompressBackup,
  computeChecksum,
  computeSnapshotChecksum,
  encryptBackup,
  decryptBackup,
  getEncryptionKey,
  compressAndEncryptBackup,
  decompressAndDecryptBackup,
  filterBackupComponents,
};
