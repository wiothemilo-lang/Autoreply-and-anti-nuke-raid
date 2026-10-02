/**
 * handlers/backup.js — điểm vào hệ thống backup: chụp/khôi phục/import.
 *
 * Bot quét backup:botGetPending mỗi ~20 giây:
 *  - kind "backup": chụp role (tên/màu/quyền) + kênh (kênh/quyền truy cập) + cấu hình
 *    + TIN NHẮN (tối đa 50 tin/kênh, kèm thứ tự thời gian), lưu vào bảng guildBackups,
 *    đẩy lên GitHub Gist nếu được yêu cầu.
 *  - kind "restore": đọc JSON backup, tạo lại role, danh mục, kênh + overwrite,
 *    SẮP XẾP LẠI đúng thứ tự role/kênh như trong file, phục hồi tin nhắn qua webhook
 *    (đúng thứ tự thời gian) KÈM MEDIA (ảnh/video tải về đăng lại thật), rồi áp lại
 *    cấu hình với id mới.
 *  - kind "import": file backup .msc/.json (bot nuke khác) được tải lên dashboard →
 *    giữ trong Convex file storage (tối đa 8 MB) → bot tải về, nhận diện định dạng
 *    (JSON/base64/có wrapper), chuẩn hóa, rồi khôi phục đúng thứ tự role/kênh/tin
 *    nhắn + media có trong file.
 *
 * Đợt #5 đã tách ruột thành các module nhỏ trong bot/src/ (mỗi module một nhóm
 * chức năng, không đổi hành vi):
 *  - backupMedia.js     — tải media + chặn SSRF
 *  - backupCommon.js    — helper/trần dùng chung (sleep, icon, quyền bot, log)
 *  - backupNormalize.js — chuẩn hoá file .msc/.json + giải mã định dạng riêng
 *  - backupCapture.js   — chụp snapshot + runBackup
 *  - backupRebuild.js   — dựng lại role/kênh/tin/emoji/sticker/thread/meta/ban/invite
 *  - backupRestore.js   — dry-run + restoreCore + runRestore
 *  - backupImport.js    — import file .msc/.json từ dashboard
 *  - backupJobs.js      — vòng quét/claim/lịch tự động/clone
 *
 * File này giữ nguyên ĐƯỜNG DẪN require (./handlers/backup) và HÌNH DẠNG export
 * (callable + thuộc tính) để index.js, tick.js, localSnapshot.js và các test mock
 * theo chuỗi request cũ tiếp tục chạy y nguyên.
 */
const { pollBackups, autoBackupSweep, cloneToServer } = require("../backupJobs");
const {
  runBackup,
  snapshotWithSettings,
  captureThreads,
  captureBans,
  captureInvites,
} = require("../backupCapture");
const { runRestore, planRestoreCore, runRestorePlan } = require("../backupRestore");
const { runImportRestore, slimBackupForStore } = require("../backupImport");
const {
  normalizeBackupFile,
  countMessages,
  normalizeEmoji,
  normalizeSticker,
} = require("../backupNormalize");
const {
  sortedRoles,
  sortedChannels,
  createRoles,
  createChannels,
  createThreads,
  applyGuildMeta,
  applyBans,
  applyInvites,
  replayIntoChannel,
  sanitizeEmojiName,
} = require("../backupRebuild");
const {
  resolveAttachment,
  nameFromUrl,
  assertSafeRemoteUrl,
  isPrivateAddress,
} = require("../backupMedia");
const { MAX_MESSAGES_PER_THREAD, MAX_REPLAY_PER_CHANNEL } = require("../backupCommon");
const backupUtils = require("../backupUtils");

module.exports = pollBackups;
module.exports.runBackup = runBackup;
module.exports.runRestore = runRestore;
// Dry-run (kế hoạch khôi phục) — tách riêng khỏi runRestore để test khẳng định
// được "khôi phục có gọi tạo role/kênh, còn kế hoạch thì không".
module.exports.planRestoreCore = planRestoreCore;
module.exports.runRestorePlan = runRestorePlan;
module.exports.runImportRestore = runImportRestore;
module.exports.autoBackupSweep = autoBackupSweep;
// C1 localSnapshot.js tái dùng engine chụp có sẵn — PHẢI export, nếu không
// snapshotGuildLocal ném "backup.snapshotWithSettings is not a function".
module.exports.snapshotWithSettings = snapshotWithSettings;
module.exports.normalizeBackupFile = normalizeBackupFile;
module.exports.sortedRoles = sortedRoles;
module.exports.sortedChannels = sortedChannels;
// NukeRollback (S3) tái dùng 2 engine tạo lại role/kênh — không nhân bản logic.
module.exports.createRoles = createRoles;
module.exports.createChannels = createChannels;
module.exports.countMessages = countMessages;
// Nhánh mở rộng phạm vi chụp (ban list, link mời, thread, danh tính server) —
// export để test khẳng định được từng phần thay vì chỉ kiểm qua bản backup.
module.exports.createThreads = createThreads;
module.exports.applyGuildMeta = applyGuildMeta;
module.exports.applyBans = applyBans;
module.exports.applyInvites = applyInvites;
module.exports.captureThreads = captureThreads;
module.exports.captureBans = captureBans;
module.exports.captureInvites = captureInvites;
module.exports.replayIntoChannel = replayIntoChannel;
module.exports.MAX_MESSAGES_PER_THREAD = MAX_MESSAGES_PER_THREAD;
module.exports.resolveAttachment = resolveAttachment;
module.exports.nameFromUrl = nameFromUrl;
module.exports.assertSafeRemoteUrl = assertSafeRemoteUrl;
module.exports.isPrivateAddress = isPrivateAddress;
module.exports.normalizeEmoji = normalizeEmoji;
module.exports.normalizeSticker = normalizeSticker;
module.exports.sanitizeEmojiName = sanitizeEmojiName;
module.exports.slimBackupForStore = slimBackupForStore;
module.exports.MAX_REPLAY_PER_CHANNEL = MAX_REPLAY_PER_CHANNEL;
module.exports.cloneToServer = cloneToServer;
module.exports.compressAndEncryptBackup = backupUtils.compressAndEncryptBackup;
module.exports.decompressAndDecryptBackup = backupUtils.decompressAndDecryptBackup;
module.exports.filterBackupComponents = backupUtils.filterBackupComponents;
