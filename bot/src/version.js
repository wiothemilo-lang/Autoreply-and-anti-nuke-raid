/**
 * version.js — phiên bản bot dùng CHUNG cho heartbeat và guild sync.
 *
 * Trước đây hai nơi ghi hai chuỗi khác nhau ("3.0.0" ở heartbeat fallback,
 * "v60" ở sync). Dashboard so `parseBotVersion(botVersion) >= 47`, nên bản
 * heartbeat "3.0.0" bị coi là bot cũ và chặn import backup oan. Một hằng,
 * một nguồn sự thật.
 */
const BOT_VERSION = "v60";

module.exports = { BOT_VERSION };
