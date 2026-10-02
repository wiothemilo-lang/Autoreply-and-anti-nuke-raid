/**
 * backupAudit.js — PHÂN LOẠI BACKUP THẬT/FAKE + CHẤM SỨC KHỎE TỪNG CÔNG ĐOẠN.
 *
 * "Backup fake" là bản trong bảng guildBackups KHÔNG THỂ KHÔI PHỤC được:
 *   - JSON hỏng (không parse được, kể cả sau giải nén "z:" / giải mã "e:")
 *   - Thiếu cấu trúc bắt buộc (version, roles, channels, guildId)
 *   - Nén "z:" nhưng base64/zlib bung lỗi → dữ liệu đã hỏng từ lúc lưu
 *   - Checksum (SHA-256) không khớp nội dung → bị sửa/sao chép sai
 *   - Nguồn lạ (source không thuộc backup/import/clone)
 *
 * Module này thuần hàm, không gọi mạng/DB — bot (VPS) và script audit dùng chung.
 * Script audit trên VPS gọi cùng ConvexHttpClient của bot (có BOT_KEY) → quét
 * mọi guild, bung + kiểm tra từng bản, xóa bản fake khi chạy với cờ --fix.
 */

const zlib = require("zlib");
const crypto = require("crypto");

/** Nguồn backup hợp lệ mà bot ghi qua đường chuẩn. */
const VALID_SOURCES = new Set(["backup", "import", "clone"]);

/** Giải nén/giải mã chuỗi backupJson → JSON thô. Trả { json, error }. */
function unpackBackupJson(backupJson) {
  if (typeof backupJson !== "string" || backupJson.length === 0) {
    return { json: null, error: "backupJson rỗng" };
  }
  let data = backupJson;
  // Lớp 1: nén zlib ("z:" + base64) — tiêu chuẩn mọi bản mới.
  if (data.startsWith("z:")) {
    try {
      data = zlib.inflateSync(Buffer.from(data.slice(2), "base64")).toString("utf8");
    } catch {
      return { json: null, error: "zlib bung lỗi (bản nén hỏng)" };
    }
  }
  // Lớp 2: mã hóa AES-256-GCM ("e:" + base64) — chỉ khi VPS có BACKUP_ENCRYPT_KEY.
  if (data.startsWith("e:")) {
    const key = process.env.BACKUP_ENCRYPT_KEY || null;
    if (!key) return { json: null, error: "bản mã hóa nhưng VPS thiếu BACKUP_ENCRYPT_KEY" };
    try {
      const raw = Buffer.from(data.slice(2), "base64");
      const iv = raw.subarray(0, 12);
      const tag = raw.subarray(12, 28);
      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        crypto.createHash("sha256").update(key).digest(),
        iv,
      );
      decipher.setAuthTag(tag);
      data = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    } catch {
      return { json: null, error: "giải mã AES thất bại (key khác hoặc dữ liệu hỏng)" };
    }
  }
  try {
    return { json: JSON.parse(data), error: null };
  } catch {
    return { json: null, error: "JSON không parse được" };
  }
}

/**
 * Phân loại 1 dòng backup (row từ bảng guildBackups).
 * Trả { verdict: "real" | "fake" | "suspect", reasons: string[] }.
 *   - real   : bung được, đủ cấu trúc, checksum khớp (hoặc không có checksum để so).
 *   - fake   : chắc chắn không khôi phục được (hỏng JSON/nén/thiếu cấu trúc).
 *   - suspect: cấu trúc có nhưng checksum không khớp hoặc metadata lệch —
 *              cần xem thêm (không xóa tự động).
 */
function classifyBackup(row) {
  const reasons = [];
  if (!row?.backupJson) return { verdict: "fake", reasons: ["thiếu backupJson"] };
  if (row.source && !VALID_SOURCES.has(row.source)) {
    reasons.push(`nguồn lạ: "${row.source}"`);
  }

  const { json, error } = unpackBackupJson(row.backupJson);
  if (!json) {
    reasons.push(error ?? "không bung được");
    return { verdict: "fake", reasons };
  }
  if (typeof json !== "object") {
    return { verdict: "fake", reasons: ["nội dung không phải object"] };
  }

  // Cấu trúc tối thiểu để khôi phục được: roles + channels PHẢI là mảng.
  // Thiếu guildId KHÔNG đủ để xếp "fake": file import (.msc/.json) hợp lệ
  // thường không có guildId (chỉ mất overwrite @everyone, vẫn khôi phục được
  // role/kênh) — xếp fake sẽ khiến audit --fix XÓA NHẦM backup thật.
  const missingRoles = !Array.isArray(json.roles);
  const missingChannels = !Array.isArray(json.channels);
  if (!json.guildId) reasons.push("thiếu guildId trong snapshot");
  if (missingRoles) reasons.push("thiếu mảng roles");
  if (missingChannels) reasons.push("thiếu mảng channels");
  if (missingRoles || missingChannels) {
    return { verdict: "fake", reasons };
  }

  // Checksum: SHA-256 của JSON THÔ (trước nén/mã hóa — bot ghi checksum của
  // JSON.stringify(snapshot)). Có checksum mà lệch → dữ liệu bị thay đổi.
  if (row.backupChecksum) {
    const recomputed = computeChecksumFromUnpacked(unpackBackupJson(row.backupJson).json);
    if (recomputed && recomputed !== row.backupChecksum) {
      reasons.push("checksum không khớp nội dung");
      return { verdict: "suspect", reasons };
    }
  }

  // Metadata lệch (đếm role/kênh không khớp nội dung) — nghi vấn, không xóa.
  if (Array.isArray(json.roles) && row.roleCount !== json.roles.length) {
    reasons.push(`roleCount lệch (${row.roleCount} ≠ ${json.roles.length})`);
  }
  if (Array.isArray(json.channels) && row.channelCount !== json.channels.length) {
    reasons.push(`channelCount lệch (${row.channelCount} ≠ ${json.channels.length})`);
  }
  if (reasons.length > 0) return { verdict: "suspect", reasons };
  return { verdict: "real", reasons: [] };
}

/** SHA-256 hex của chuỗi (khớp backupUtils.computeChecksum). */
function computeChecksum(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

/** Checksum của snapshot đã bung: băm lại JSON.stringify với key ổn định. */
function computeChecksumFromUnpacked(json) {
  try {
    return computeChecksum(JSON.stringify(json));
  } catch {
    return null;
  }
}

/**
 * verifyBackup(row) — kiểm tra MỘT bản backup có KHÔI PHỤC ĐƯỢC không, và ĐẾM
 * thật số role/kênh/emoji/sticker/tin để so với metadata đã lưu.
 *
 * Khác `classifyBackup` (chỉ trả thật/fake/suspect để script audit tự động
 * dọn), hàm này trả BÁO CÁO CHI TIẾT cho người đọc — lệnh `/backup verify`:
 * bung được JSON chưa, chunk có đủ không, đếm thật từng loại, và liệt kê từng
 * độ lệch so với số đã ghi lúc lưu. THUẦN HÀM: không gọi mạng/DB, KHÔNG sửa gì
 * (đúng yêu cầu "verify không đụng guild").
 *
 * `ok` = khôi phục được (không có `problems`). `deviations` (số lưu ≠ nội dung)
 * chỉ là CẢNH BÁO: bản vẫn khôi phục được nhưng số hiển thị ở `/backup list` sai.
 *
 * `row.backupJson` phía bot đã được Convex ghép chunk sẵn; khi thiếu chunk thì
 * nó là null — phải báo RÕ "thiếu chunk" chứ đừng để người dùng tưởng bản hỏng.
 */
function verifyBackup(row) {
  const problems = [];
  const notes = [];
  const report = {
    ok: false,
    verdict: "fake",
    chunked: false,
    chunkCount: 0,
    checksumOk: null,
    counts: { roles: 0, channels: 0, emojis: 0, stickers: 0, messages: 0 },
    stored: { roles: 0, channels: 0, emojis: 0, stickers: 0, messages: 0 },
    deviations: [],
    problems,
    notes,
  };
  if (!row || typeof row !== "object") {
    problems.push("không tìm thấy bản backup");
    return report;
  }
  report.stored = {
    roles: Number(row.roleCount ?? 0),
    channels: Number(row.channelCount ?? 0),
    emojis: Number(row.emojiCount ?? 0),
    stickers: Number(row.stickerCount ?? 0),
    messages: Number(row.messageCount ?? 0),
  };

  report.chunkCount = Number(row.backupChunkCount ?? 0);
  report.chunked = report.chunkCount > 0;
  if (report.chunked) {
    if (!row.backupJson) {
      problems.push(`thiếu chunk — bản này gồm ${report.chunkCount} phần nhưng không ghép đủ`);
      return report;
    }
    notes.push(`đã ghép đủ ${report.chunkCount} chunk`);
  }

  const { json, error } = unpackBackupJson(row.backupJson);
  if (!json || typeof json !== "object") {
    problems.push(error ?? "nội dung không phải object");
    return report;
  }

  const arr = (v) => (Array.isArray(v) ? v : null);
  const roles = arr(json.roles);
  const channels = arr(json.channels);
  if (!roles) problems.push("thiếu mảng roles — không khôi phục được phân quyền role");
  if (!channels) problems.push("thiếu mảng channels — không khôi phục được kênh");
  if (!roles || !channels) return report;

  report.counts = {
    roles: roles.length,
    channels: channels.length,
    emojis: (arr(json.emojis) ?? []).length,
    stickers: (arr(json.stickers) ?? []).length,
    messages: channels.reduce(
      (n, c) => n + (Array.isArray(c?.messages) ? c.messages.length : 0),
      0,
    ),
  };

  if (row.backupChecksum) {
    report.checksumOk = computeChecksumFromUnpacked(json) === row.backupChecksum;
    if (!report.checksumOk) {
      problems.push("checksum không khớp nội dung (dữ liệu đã bị đổi sau khi lưu)");
    }
  }

  for (const [label, stored, actual] of [
    ["role", report.stored.roles, report.counts.roles],
    ["kênh", report.stored.channels, report.counts.channels],
    ["emoji", report.stored.emojis, report.counts.emojis],
    ["sticker", report.stored.stickers, report.counts.stickers],
    ["tin nhắn", report.stored.messages, report.counts.messages],
  ]) {
    if (stored !== actual)
      report.deviations.push(`${label}: đã lưu ${stored} ≠ nội dung ${actual}`);
  }

  // Thiếu guildId chỉ mất quyền @everyone — vẫn khôi phục được role/kênh, nên
  // là GHI CHÚ chứ không phải lỗi (khớp luật của classifyBackup).
  if (!json.guildId) notes.push("thiếu guildId — mất quyền @everyone khi khôi phục");

  report.verdict = problems.length > 0 || report.deviations.length > 0 ? "suspect" : "real";
  report.ok = problems.length === 0;
  return report;
}

/**
 * formatVerifyReport(report) — biến báo cáo của `verifyBackup` thành các DÒNG
 * chữ cho người đọc. THUẦN HÀM, không phụ thuộc discord.js: cả `/backup verify`
 * (slash) lẫn `!backup verify` (prefix) ghép cùng các dòng này vào embed → một
 * nguồn chữ duy nhất, không lệch nhau giữa hai lối vào.
 */
function formatVerifyReport(report) {
  const c = report.counts;
  const lines = [
    `**Đếm thật trong bản:** ${c.roles} role · ${c.channels} kênh · ${c.emojis} emoji · ${c.stickers} sticker · ${c.messages} tin nhắn`,
  ];
  if (report.chunked) lines.push(`🧩 Bản tách chunk: đã ghép đủ **${report.chunkCount}** phần`);
  if (report.checksumOk === true) lines.push("🔐 Checksum: khớp nội dung");
  else if (report.checksumOk === false) lines.push("🔐 Checksum: **KHÔNG khớp** nội dung");
  else lines.push("🔐 Checksum: bản cũ không có (bỏ qua)");
  for (const d of report.deviations) lines.push(`⚠️ Lệch số đã lưu — ${d}`);
  for (const p of report.problems) lines.push(`❌ ${p}`);
  for (const n of report.notes) lines.push(`ℹ️ ${n}`);
  lines.push(
    report.ok
      ? report.deviations.length > 0
        ? "✅ Khôi phục được, nhưng số hiển thị ở danh sách có thể sai."
        : "✅ Bản này khôi phục được."
      : "❌ KHÔNG khôi phục được (xem lỗi ở trên).",
  );
  return lines;
}

/**
 * Chấm sức khỏe 1 guild: { real, fake, suspect, total }.
 */
function summarize(rows) {
  const out = { real: 0, fake: 0, suspect: 0, total: rows.length };
  for (const row of rows) {
    const { verdict } = classifyBackup(row);
    out[verdict]++;
  }
  return out;
}

module.exports = {
  VALID_SOURCES,
  unpackBackupJson,
  classifyBackup,
  computeChecksum,
  verifyBackup,
  formatVerifyReport,
  summarize,
};
