// Đa ngôn ngữ cho NHÃN trong embed log phía bot.
//
// Vì sao cần (sự cố 05/10/2026): log moderation trộn lẫn hai ngôn ngữ —
// `CASE_LABEL` có "Ban"/"Timeout"/"Kick"/"Warn"/"Purge" (tiếng Anh) nhưng
// "Gỡ ban"/"Gỡ warn"/"Timeout hết hạn" (tiếng Việt); phần thân embed lại viết
// "Offender/Reason/Responsible moderator" và "không có lý do". Server dùng tiếng
// Anh hoặc Đức thì log vẫn ra tiếng Việt.
//
// PHẠM VI CỐ Ý HẸP: chỉ NHÃN do bot tự sinh (tên hành động, tên trường, câu
// fallback). KHÔNG dịch:
//   - `reason` / `extraDescription` — do người dùng/mod gõ, dịch là bịa.
//   - tên riêng (tên thành viên, tên bot).
// Muốn dịch những thứ này thì phải đổi hợp đồng sang key + tham số, không sửa ở đây.
//
// Nguồn chân lý: `convex/guilds/updateSettings.ts` khai LOG_LANGS — hai bên phải
// giống nhau, cổng `test-log-lang.cjs` chặn lệch.
const LANGS = ["vi", "en", "de"];

const DICT = {
  vi: {
    offender: "**Thành viên:**",
    reason: "**Lý do:**",
    responsible: "**Người xử lý:**",
    noReason: "không có lý do",
    case: "case",
    bot: "Bot",
    labels: {
      ban: "🚫 Cấm",
      timeout: "⏱️ Phạt đình chỉ",
      kick: "👢 Đuổi khỏi server",
      warn: "⚠️ Cảnh cáo",
      purge: "🧹 Dọn tin nhắn",
      untimeout: "🔓 Gỡ phạt đình chỉ",
      timeout_expired: "⏱️ Hết hạn phạt đình chỉ",
      unban: "🔓 Gỡ cấm",
      unwarn: "🧹 Gỡ cảnh cáo",
      delete: "🗑️ Xoá tin nhắn",
    },
  },
  en: {
    offender: "**Offender:**",
    reason: "**Reason:**",
    responsible: "**Responsible moderator:**",
    noReason: "no reason given",
    case: "case",
    bot: "Bot",
    labels: {
      ban: "🚫 Ban",
      timeout: "⏱️ Timeout",
      kick: "👢 Kick",
      warn: "⚠️ Warn",
      purge: "🧹 Purge",
      untimeout: "🔓 Timeout removed",
      timeout_expired: "⏱️ Timeout expired",
      unban: "🔓 Ban removed",
      unwarn: "🧹 Warn removed",
      delete: "🗑️ Message deleted",
    },
  },
  de: {
    offender: "**Betroffener:**",
    reason: "**Grund:**",
    responsible: "**Verantwortlicher Moderator:**",
    noReason: "kein Grund angegeben",
    case: "Fall",
    bot: "Bot",
    labels: {
      ban: "🚫 Bann",
      timeout: "⏱️ Stummschalten",
      kick: "👢 Kick",
      warn: "⚠️ Verwarnung",
      purge: "🧹 Nachrichten löschen",
      untimeout: "🔓 Stummschaltung aufgehoben",
      timeout_expired: "⏱️ Stummschaltung abgelaufen",
      unban: "🔓 Bann aufgehoben",
      unwarn: "🧹 Verwarnung aufgehoben",
      delete: "🗑️ Nachricht gelöscht",
    },
  },
};

/** Ngôn ngữ hợp lệ; rác/thiếu → "vi" (mặc định sản phẩm). */
function normLang(lang) {
  return LANGS.includes(lang) ? lang : "vi";
}

/** Dịch một khoá chuỗi ngắn của log. */
function logT(lang, key) {
  const table = DICT[normLang(lang)];
  return table[key] ?? DICT.vi[key] ?? key;
}

/** Nhãn hành động theo ngôn ngữ; hành động lạ → trả nguyên `fallback`. */
function logLabel(lang, action, fallback = action) {
  return DICT[normLang(lang)].labels[action] ?? fallback;
}

module.exports = { LANGS, logT, logLabel, normLang, DICT };
