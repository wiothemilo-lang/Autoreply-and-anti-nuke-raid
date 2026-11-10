/**
 * External App Guard — các hàm thuần (không phụ thuộc discord.js) dùng để phát
 * hiện RAID bằng ỨNG DỤNG NGOÀI (external app / integration) và các biến thể
 * tương tự. Tách riêng để dễ test (scripts/test-external-app-guard.cjs) và để
 * bot + AI dùng chung một bộ tín hiệu.
 */

// Từ khóa scam phổ biến trong các vụ raid bằng app ngoài (nitro/giveaway/boost/crypto...).
const SCAM_WORD_RE =
  /(nitro|giveaway|boost|free|claim|reward|prize|winner|crypto|bitcoin|airdrop|verify|earn|click|limited|exclusive|gift|hack)/i;
// Link mời Discord.
const INVITE_RE = /(discord\.(gg|com\/invite|app\.com\/invite)|discordapp\.com\/invite)/i;
// Link rút gọn / kênh ngoài thường dùng để dẫn lừa đảo.
const SHORTLINK_RE =
  /(bit\.ly|tinyurl\.com|rb\.gy|cutt\.ly|t\.me\/|rebrand\.ly|is\.gd|shorturl\.at|goo\.gl)/i;
// App nổi tiếng thường bị giả mạo tên (kèm từ phụ) để lừa chủ server cài app độc.
const IMPERSONATED_APPS = [
  "mee6",
  "dyno",
  "carl-bot",
  "carlbot",
  "carl bot",
  "tatsu",
  "mudae",
  "probot",
  "wumpus",
  "discord",
  "protection",
  "protector",
  "security",
  "antinuke",
  "anti-nuke",
  "guard",
  "moderation",
  "xenon",
  "statbot",
  "top.gg",
  "disboard",
  "arc",
  "reaction role",
  "leveling",
  "welcome",
  "captcha",
  "verify",
  "nitro",
  "giveaway",
];

// Loại component (discord.js ComponentType): Button=2, SelectMenu=3. Dùng số trực tiếp
// để giữ module thuần (không phụ thuộc discord.js).
const COMP_BUTTON = 2;
const COMP_SELECT = 3;

/**
 * Trích nội dung COMPONENT (nút bấm / menu) của tin nhắn app — nhãn nút, customId,
 * URL nút link, placeholder + option của menu. Dùng để đưa vào fingerprint (bắt flood
 * tin app có nút bấm) và vào tín hiệu AI.
 */
function componentText(components) {
  const parts = [];
  // Hardening: webhook/external app có thể đẩy payload dị dạng — property test
  // bắt được crash khi components không phải mảng hoặc chứa null. Không bao giờ
  // để hàm chấm điểm spam vỡ vì dữ liệu xấu.
  const rows = Array.isArray(components) ? components : [];
  for (const row of rows) {
    const comps = Array.isArray(row?.components) ? row.components : [];
    for (const comp of comps) {
      if (!comp || typeof comp !== "object") continue;
      if (comp.type === COMP_BUTTON) {
        parts.push(`[btn ${comp.label || ""} ${comp.customId || comp.url || ""}]`);
      } else if (comp.type === COMP_SELECT) {
        const opts = (comp.options || []).map((o) => o.label || o.value || "").join(",");
        parts.push(`[select ${comp.placeholder || ""} ${opts}]`);
      }
    }
  }
  return parts.join(" ");
}

/**
 * Dấu vân tay nội dung tin nhắn (text + embed: title/description/footer/fields +
 * component nút bấm/menu) — bắt cả spam chỉ gửi embed, kèm thay đổi nhỏ (vd timestamp),
 * hoặc flood tin app đăng nút bấm làm "mồi" (nhãn nút / customId đổi theo lần).
 */
function messageFingerprint(msg) {
  // Hardening: embeds/components có thể thiếu/không phải mảng (webhook payload,
  // tin nhắn hệ thống) — property test bắt được crash với embeds:[null].
  const embeds = Array.isArray(msg?.embeds) ? msg.embeds : [];
  return [
    msg?.content || "",
    ...embeds.map((e) => {
      if (!e || typeof e !== "object") return "";
      return [
        e.title,
        e.description,
        e.footer?.text,
        ...(Array.isArray(e.fields) ? e.fields : []).map((f) =>
          f && typeof f === "object" ? `${f.name}: ${f.value}` : "",
        ),
      ]
        .filter(Boolean)
        .join(" | ");
    }),
    componentText(msg?.components),
  ]
    .join("\n")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

/** Chuẩn hóa nội dung để so khớp "gần giống": lowercase, bỏ URL/mention/emoji/số/dấu câu. */
function normalizeFuzzy(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/<@[!&]?\d+>/g, " ")
    .replace(/<#\d+>/g, " ")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, " ")
    .replace(/[^a-z0-9à-ỹ\s]/gi, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Hai nội dung đã chuẩn hóa có phải "gần giống" không (lặp có biến thể nhỏ:
 * đổi số/emoji/URL mỗi tin để né filter)? Yêu cầu CHẶT để không phạt nhầm bot
 * quen thuộc (nhạc/leveling) — vd "now playing: song A" vs "now playing: song B":
 *   - cả 2 đều dài ít nhất 4 token (tin quá ngắn chỉ tính trùng giống hệt fp)
 *   - ít nhất 4 token chung
 *   - độ phủ token >= 0.8
 */
function isNearDuplicate(a, b) {
  if (!a || !b) return false;
  const sa = new Set(a.split(" ").filter(Boolean));
  const sb = new Set(b.split(" ").filter(Boolean));
  if (sa.size < 4 || sb.size < 4) return false;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const overlap = inter / (sa.size + sb.size - inter);
  return overlap >= 0.8 && inter >= 4;
}

/**
 * Tín hiệu raid bằng NÚT BẤM (button spam) của app ngoài: app được kết nối từ ngoài
 * (webhook/application) đăng tin có nút bấm làm "mồi"; kẻ raid spam bấm nút để kích
 * hoạt hành động của app (spam tin, gán role, mời, DM...), hoặc một làn sóng người
 * bấm cùng 1 tin app trong cửa sổ.
 *   - spamClicker: CÙNG 1 người bấm >= 4 lần trong cửa sổ → kẻ đang lạm dụng nút.
 *   - clickFlood: tổng lượt bấm >= max(ngưỡng, 6) trong cửa sổ → làn sóng bấm.
 */
function buttonRaidSignal({ totalClicks, sameUserClicks, threshold } = {}) {
  const flood = Math.max(threshold || 2, 6);
  const spamClicker = (sameUserClicks || 0) >= 4;
  const clickFlood = (totalClicks || 0) >= flood;
  return {
    triggered: spamClicker || clickFlood,
    spamClicker,
    clickFlood,
    totalClicks: totalClicks || 0,
    sameUserClicks: sameUserClicks || 0,
    flood,
  };
}

/**
 * Mức độ nghi vấn của TÊN app ngoài (chạy deterministic, không cần AI):
 *   +3 tên chứa từ khóa scam (nitro/giveaway/boost/free/verify/crypto...)
 *   +3 tên giả mạo app nổi tiếng (tên quen + từ phụ: "MEE6 Pro", "Dyno Premium", "Carl-Bot Hack"...)
 *   +1 tên dạng máy (chữ + đuôi số dài hoặc toàn số — app sinh hàng loạt)
 * Trả { score, parts }.
 */
function appNameSuspicion(appName) {
  const name = String(appName || "")
    .toLowerCase()
    .trim();
  if (!name) return { score: 0, parts: [] };
  const clean = name.replace(/[^a-z0-9]+/g, "");
  let score = 0;
  const parts = [];
  if (SCAM_WORD_RE.test(name)) {
    score += 3;
    parts.push("tên chứa từ khóa scam");
  }
  for (const known of IMPERSONATED_APPS) {
    const k = known.replace(/[^a-z0-9]+/g, "");
    if (!k || k.length < 3) continue;
    if (clean.includes(k)) {
      // Tên khớp 1:1 app nổi tiếng = app thật; chỉ nghi khi có thêm từ phụ (pro/premium/free/hack/beta...).
      const extra = clean.replace(k, "").replace(/[^a-z0-9]+/g, "");
      if (extra.length > 0) {
        score += 3;
        parts.push(`giả mạo app "${known}"`);
      }
      break;
    }
  }
  if (/^[a-z]+\d{4,}$/.test(clean) || /^\d{5,}$/.test(clean)) {
    score += 1;
    parts.push("tên dạng máy");
  }
  return { score, parts };
}

/**
 * Tín hiệu spam của ỨNG DỤNG NGOÀI trong cửa sổ module:
 *  1) Nội dung lặp giống hệt (kể cả embed) >= 2 lần → spam rõ ràng.
 *  2) Nội dung GẦN GIỐNG (chuẩn hóa, độ phủ >= 0.8 + >= 4 token chung + tin dài đủ)
 *     >= 2 lần → biến thể né filter (đổi số/emoji/URL mỗi tin) vẫn bị bắt.
 *  3) Vượt ngưỡng KÈM tín hiệu quảng cáo: link mời Discord, link rút gọn, @everyone/@here
 *     hoặc từ khóa scam → quảng cáo server kiểu raid.
 *  4) App gửi >= max(ngưỡng, 4) tin → flood, không cần nội dung trùng nhau.
 * Bot quen thuộc gửi vài tin khác nhau liên tiếp không bị phạt nhầm.
 */
function isExternalAppSpam({ samples, currentFingerprint, count, threshold, hay }) {
  const sameFingerprint = samples.filter((e) => e.fp && e.fp === currentFingerprint).length;
  const norm = normalizeFuzzy(currentFingerprint);
  const similar = norm
    ? samples.filter((e) => isNearDuplicate(e.norm || normalizeFuzzy(e.fp), norm)).length
    : 0;
  const hasInvite = INVITE_RE.test(hay);
  const hasShortlink = SHORTLINK_RE.test(hay);
  const hasEveryone = /(@everyone|@here)/i.test(hay);
  const scamHits = (hay.match(SCAM_WORD_RE) || []).length;
  const urlCount = (hay.match(/https?:\/\/\S+/gi) || []).length;
  const floodCount = Math.max(threshold, 4);
  return {
    triggered:
      sameFingerprint >= 2 ||
      similar >= 2 ||
      (count >= threshold && (hasInvite || hasShortlink || hasEveryone || scamHits >= 2)) ||
      count >= floodCount,
    sameFingerprint,
    similar,
    hasInvite,
    hasShortlink,
    hasEveryone,
    scamHits,
    urlCount,
    floodCount,
  };
}

/**
 * Phân biệt ỨNG DỤNG NGOÀI (external app — đường raid) với BOT ĐƯỢC MỜI CHÍNH THỨC.
 * Bot có tick xác minh (verified) hoặc là thành viên server = bot hợp lệ đã được mời
 * vào server → KHÔNG phải external app. External app = ứng dụng được kết nối từ ngoài
 * (IntegrationCreate) mà KHÔNG có bot user là thành viên, hoặc gửi tin qua WEBHOOK
 * (không cần mời bot vào server). Integration kiểu kết nối tài khoản (twitch/youtube)
 * cũng không phải đường raid app.
 * Trả true khi nên xử lý như external app.
 */
function isExternalAppTarget({
  isBot,
  isWebhook,
  isGuildMember,
  hasVerifiedTick,
  integrationType,
} = {}) {
  if (isWebhook) return true; // app gửi tin qua webhook — không cần bot thành viên
  if (isBot) return false; // bot user phải LÀ thành viên mới gửi được tin → đã được mời
  if (integrationType === "twitch" || integrationType === "youtube") return false; // kết nối tài khoản thường
  if (isGuildMember) return false; // bot có mặt trong server = được mời chính thức
  if (hasVerifiedTick) return false; // bot xác minh (tick) = bot hợp lệ của Discord
  return true; // IntegrationCreate Discord app không có bot thành viên → external app
}

module.exports = {
  componentText,
  messageFingerprint,
  normalizeFuzzy,
  isNearDuplicate,
  appNameSuspicion,
  isExternalAppSpam,
  isExternalAppTarget,
  buttonRaidSignal,
};
