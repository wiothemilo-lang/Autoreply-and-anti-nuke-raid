/**
 * Captcha store for verify flow: guildId:userId -> { code, expiresAt }
 * Used by interactionCreate.js (send captcha) and messageCreate.js (verify code).
 */
const store = new Map();
const { registerSweep } = require("./sweeper");

function genCaptcha() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function setCode(guildId, userId, code) {
  store.set(`${guildId}:${userId}`, {
    code,
    expiresAt: Date.now() + 5 * 60_000,
    // Chống brute-force: sai quá MAX_WRONG_ATTEMPTS lần thì mã bị hủy — kẻ
    // đoán mã 6 chữ số trong cửa sổ 5 phút phải xin mã mới (mỗi lần xin mới
    // bị rate-limit 3 lần/10 phút ở nút "Nhận mã xác minh").
    wrongAttempts: 0,
  });
}

/** Sai quá số lần này mã bị hủy ngay (phải bấm nút xin mã mới). */
const MAX_WRONG_ATTEMPTS = 5;

function verifyCode(guildId, userId, input) {
  const key = `${guildId}:${userId}`;
  const entry = store.get(key);
  if (!entry) return { ok: false, reason: "no_code" };
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return { ok: false, reason: "expired" };
  }
  if (entry.code !== input.trim()) {
    entry.wrongAttempts += 1;
    if (entry.wrongAttempts >= MAX_WRONG_ATTEMPTS) {
      // Hủy mã — trả reason "wrong" (thông điệp UX đã hướng dẫn xin mã mới);
      // kẻ brute-force không phân biệt được lý do hủy.
      store.delete(key);
      return { ok: false, reason: "wrong" };
    }
    return { ok: false, reason: "wrong" };
  }
  store.delete(key);
  return { ok: true };
}

// Dọn entry hết hạn mỗi 5 phút — qua vòng sweep CHUNG (đợt #4): module này
// không tự dựng timer nữa.
const CAPTCHA_TTL_MS = 5 * 60_000;

function sweepExpiredCaptchas(now = Date.now()) {
  let removed = 0;
  for (const [k, v] of store) {
    if (now > v.expiresAt) {
      store.delete(k);
      removed += 1;
    }
  }
  return removed;
}
registerSweep("captchaStore", () => sweepExpiredCaptchas(), CAPTCHA_TTL_MS);

module.exports = {
  genCaptcha,
  setCode,
  verifyCode,
  MAX_WRONG_ATTEMPTS,
  sweepExpiredCaptchas,
  CAPTCHA_TTL_MS,
};
