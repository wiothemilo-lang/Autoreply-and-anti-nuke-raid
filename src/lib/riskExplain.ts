/**
 * riskExplain — dịch mã yếu tố rủi ro của Alt Detection sang tiếng Việt.
 *
 * Vì sao cần: bot lưu `riskFactors` dạng MÃ THÔ (`❌ account_age_1day`,
 * `⚠️ generated_username_digits_but_old`) để ổn định về sau. Nhưng dashboard
 * in thẳng mã đó cho chủ server đọc — họ không hiểu `account_age_1day` nghĩa
 * là gì, nên không biết vì sao người bị kick. Đó là lớp lỗi im lặng: bot
 * quyết định hành động nhưng không giải thích được, chủ server mất lòng tin
 * rồi tắt module.
 *
 * Hàm ở đây là THUẦN (không Convex, không DB) để test khoá đúng hành vi:
 *  - mã lạ (bot mới thêm yếu tố) KHÔNG được biến mất — hiện nguyên mã.
 *  - phân loại tín hiệu: ❌ mạnh / ⚠️ yếu / ✅ dấu hiệu tốt.
 */

/** Nhãn tiếng Việt cho mã yếu tố rủi ro. Mã KHÔNG có ở đây → hiện nguyên mã. */
export const RISK_FACTOR_LABEL: Record<string, string> = {
  account_age_1day: "Tài khoản mới tạo dưới 1 ngày",
  account_age_3days: "Tài khoản mới tạo dưới 3 ngày",
  account_30d: "Tài khoản đã trên 30 ngày",
  account_6mo: "Tài khoản đã trên 6 tháng",
  account_1yr: "Tài khoản đã trên 1 năm",
  hypesquad_badge: "Có huy hiệu HypeSquad",
  verified_dev_badge: "Có huy hiệu Early Verified Bot Developer",
  early_supporter: "Có huy hiệu Early Supporter",
  is_bot_account: "Tài khoản được Discord gắn nhãn bot",
  matches_previously_punished_account: "Trùng với tài khoản trước đó đã bị phạt",
  shared_avatar_with_recent_account: "Dùng chung avatar với tài khoản vừa vào",
  monitor_only_insufficient_evidence: "Chỉ theo dõi — chưa đủ bằng chứng để phạt",
};

/**
 * Mã có tiền tố số động, ví dụ `account_age_under_5d` / `high_risk_join_burst_12+`.
 * Dùng placeholder `{p0}` kiểu gettext để `translate()` thay được (xem
 * lib/i18n.tsx) — nếu nội suy thẳng số vào chuỗi thì mỗi giá trị là một key
 * riêng, không dịch được và làm từ điển phình to vô hạn.
 */
const PREFIX_LABEL: Array<[RegExp, string]> = [
  [/^account_age_under_(\d+)d$/, "Tài khoản mới tạo dưới {p0} ngày"],
  [
    /^generated_username_(.+?)_but_old$/,
    "Tên tài khoản giống mẫu tạo hàng loạt, nhưng tài khoản đã cũ",
  ],
  [/^username_similarity_(\d+)%$/, "Tên giống tài khoản đã gặp {p0}%"],
  [/^high_risk_join_burst_(\d+)\+$/, "Cùng lúc {p0} người rủi ro cao vào server"],
  [/^matches_banned_user_(\d+)%$/, "Giống người dùng đã bị ban {p0}%"],
];

/** Mức mạnh của một tín hiệu, suy ra từ tiền tố ký hiệu bot ghi. */
export type SignalStrength = "strong" | "weak" | "positive";

/**
 * Bỏ tiền tố ký hiệu (❌ / ⚠️ / ✅) khỏi mã.
 *
 * `\ufe0f?` là BẮT BUỘC: `⚠️` gồm HAI codepoint (U+26A0 + U+FE0F). Regex
 * `[❌⚠️✅]` bỏ mất U+FE0F, còn lại ký tự vô hình dính vào mã → tra bảng dịch
 * trượt, mọi tín hiệu yếu rơi vào nhánh "mã lạ" và hiện nguyên mã. Bug này
 * đã xảy ra thật, có test khoá lại.
 */
const PREFIX_STRIP_RE = /^[❌⚠✅]\ufe0f?\s*/;

/**
 * Tách tín hiệu thành `{ mã, nhãn, mức }`.
 *
 * Vì sao tách mức thay vì chỉ dịch: chủ server cần biết cái nào GỢI Ý mạnh
 * (❌) và cái nào chỉ gợi ý yếu (⚠️). Hiện tại "2 bằng chứng" mới đủ để bot
 * phạt — người đọc phải tự đếm mấy cái ❌.
 */
export function explainRiskFactor(raw: string): {
  code: string;
  label: string;
  /** Biến cho placeholder `{p0}` — UI truyền vào `translate(label, vars)`. */
  vars?: Record<string, string | number>;
  strength: SignalStrength;
} {
  const code = raw.replace(PREFIX_STRIP_RE, "").trim();
  // So sánh theo KÍ TỰ ĐẦU (U+26A0, U+274C, U+2705) chứ không theo chuỗi
  // emoji đầy đủ — lý do ở chú thích PREFIX_STRIP_RE.
  const mark = raw.codePointAt(0);
  const strength: SignalStrength =
    mark === 0x274c ? "strong" : mark === 0x26a0 ? "weak" : "positive";

  const exact = RISK_FACTOR_LABEL[code];
  if (exact) return { code, label: exact, strength };
  for (const [re, tpl] of PREFIX_LABEL) {
    const m = code.match(re);
    if (m) return { code, label: tpl, vars: { p0: m[1] }, strength };
  }
  // Mã lạ (bot mới thêm yếu tố, bản cũ chưa có bản dịch) → hiện NGUYÊN MÃ chứ
  // bỏ trắng. Mất thông tin còn tệ hơn chưa dịch.
  return { code, label: code, strength };
}

/** Thay placeholder `{p0}` — cùng cú pháp với `translate()` (lib/i18n.tsx). */
export function formatLabel(label: string, vars?: Record<string, string | number>): string {
  if (!vars) return label;
  return label.replace(/\{(\w+)\}/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m,
  );
}

/** Hình phạt → nhãn tiếng Việt (khớp `PUNISH_LABEL` ở panel chính). */
export const ACTION_LABEL: Record<string, string> = {
  ban: "Ban",
  kick: "Kick",
  timeout: "Tạm khóa (timeout)",
  verify: "Yêu cầu xác minh",
  warn: "Cảnh cáo",
  pass: "Không xử lý",
};

/**
 * Câu giải thích 1 dòng: "Vì sao bot phạt tài khoản này."
 *
 * `null` = không có lý do (chưa bị phạt) — UI hiện trạng thái thường, KHÔNG
 * hiện câu giải thích rỗng (đúng lớp lỗi im lặng dự án đang chặn).
 */
export function explainPunishment(input: {
  action?: string | null;
  riskScore?: number | null;
  riskFactors?: string[] | null;
}): string | null {
  const action = input.action ?? "";
  if (!action || action === "pass") return null;
  const actionName = ACTION_LABEL[action] ?? action;
  const score = typeof input.riskScore === "number" ? input.riskScore : 0;

  const parts = (input.riskFactors ?? []).map((f) => explainRiskFactor(f));
  const strong = parts.filter((p) => p.strength === "strong");
  const weak = parts.filter((p) => p.strength === "weak");

  // Câu giải thích ghép nhiều yếu tố. Vì mỗi yếu tố có thể mang placeholder
  // riêng, ta thay biến TRƯỚC rồi mới ghép — nếu không, `translate()` sẽ không
  // thay được vì câu ghép không còn khớp key nào trong từ điển.
  const render = (p: (typeof parts)[number]) => formatLabel(p.label, p.vars);
  const why =
    strong.length > 0
      ? strong.map(render).join("; ")
      : weak.length > 0
        ? weak.map(render).join("; ")
        : "điểm rủi ro tích luỹ cao";
  return `${actionName} — điểm rủi ro ${score}/100. Lý do: ${why}.`;
}
