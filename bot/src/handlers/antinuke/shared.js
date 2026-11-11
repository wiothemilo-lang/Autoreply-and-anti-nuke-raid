"use strict";
/**
 * Pure functions + constants của Anti Nuke — không phụ thuộc runtime Discord,
 * test trực tiếp được. (Giữ nguyên từ đầu bản monolith, path require đã sửa.)
 */
const { PermissionFlagsBits, UserFlags } = require("discord.js");
const { messageFingerprint, isExternalAppSpam } = require("../../externalAppGuard");

const MODULE_LABELS = {
  massBan: "Ban hàng loạt",
  massKick: "Kick hàng loạt",
  massJoin: "Raid thành viên",
  massChannelCreate: "Tạo kênh hàng loạt",
  massChannelDelete: "Xóa kênh hàng loạt",
  massRoleCreate: "Tạo role hàng loạt",
  massRoleDelete: "Xóa role hàng loạt",
  massMessageDelete: "Xóa tin hàng loạt",
  massWebhookCreate: "Tạo webhook hàng loạt",
  massThreadCreate: "Tạo thread hàng loạt",
  massThreadDelete: "Xóa thread hàng loạt",
  massChannelRename: "Sửa/đổi tên kênh hàng loạt",
  massChannelOverwrite: "Thay đổi quyền kênh hàng loạt",
  massRoleEdit: "Sửa role hàng loạt",
  adminSelfGrant: "Tự cấp quyền quản trị",
  massRoleAssign: "Gán/gỡ role hàng loạt",
  massNickname: "Đổi biệt danh hàng loạt",
  massEmoji: "Tạo emoji/sticker hàng loạt",
  massBotAdd: "Thêm bot hàng loạt",
  botHitAndRun: "Bot vào-rồi-rời (hit-and-run)",
  suspiciousBotAlert: "Bot lạ mới vào server",
  mention: "Spam mention",
  externalAppRaid: "Raid bằng ứng dụng ngoài (External App)",
  massInviteCreate: "Tạo link mời hàng loạt",
  guildTamper: "Đổi cấu hình server",
  raidIntel: "Raid Intel — ban nguồn cơn",
  spam: "Chống spam tin nhắn",
  massMessage: "Spam tin dài / lặp nội dung",
  blankNoise: "Tin giả blank gây nhiễu",
  badword: "Từ ngữ xấu",
  attachment: "Spam ảnh/file đính kèm",
  invite: "Link mời Discord",
  malware: "Link độc hại & file nguy hiểm",
};

// Các bot logging/app phổ biến tạo webhook hợp pháp → bỏ qua massWebhookCreate
const KNOWN_LOGGING_BOTS = [
  "carl-bot",
  "carlbot",
  "carl bot",
  "mee6",
  "dyno",
  "tatsu",
  "probot",
  "wumpus bot",
  "wick",
  "security bot",
  "auto moderador",
  "statbot",
  "arcane",
  "top.gg bot",
  "disboard",
  "xenon",
  "sapphire",
];

const normalizeBotName = (s) => (s || "").toLowerCase().replace(/[-_\s]+/g, "");
const KNOWN_LOGGING_BOT_KEYS = new Set(KNOWN_LOGGING_BOTS.map(normalizeBotName));

function isKnownLoggingBot(executor) {
  // CHỈ miễn trừ BOT thật. Trước đây chỉ so tên nên người dùng đổi username
  // thành "Carl-bot"/"Wick" là được bỏ qua TOÀN BỘ module nuke (mass ban,
  // mass channel delete…). Audit log trả executor là User có cờ `bot`.
  if (executor?.bot !== true) return false;
  // Chuẩn hóa: lowercase + bỏ dấu ngăn cách (-, _, space) rồi so CHÍNH XÁC —
  // so khớp includes trước đây bị lách bằng tên giả "carlbotfan"/"freecarlbot"
  // (bot nuke mượn tên bot logging để được bỏ qua toàn bộ anti-nuke).
  return (
    KNOWN_LOGGING_BOT_KEYS.has(normalizeBotName(executor?.username)) ||
    KNOWN_LOGGING_BOT_KEYS.has(normalizeBotName(executor?.tag))
  );
}

// Module nuke/raid: phạt trực tiếp, KHÔNG cộng nhiệt (chỉ có hình phạt gốc).
const NUKE_MODULES = new Set([
  "massBan",
  "massKick",
  "massJoin",
  "massChannelCreate",
  "massChannelDelete",
  "massRoleCreate",
  "massRoleDelete",
  "massMessageDelete",
  "massWebhookCreate",
  "massThreadCreate",
  "massThreadDelete",
  "massChannelRename",
  "massChannelOverwrite",
  "massRoleEdit",
  "adminSelfGrant",
  "massRoleAssign",
  "massNickname",
  "massEmoji",
  "massBotAdd",
  "botHitAndRun",
  "externalAppRaid",
  "massInviteCreate",
  "guildTamper",
]);

// Bot gây hại: các module phá hủy cấu trúc này KHÔNG cần chờ đủ ngưỡng khi thủ
// phạm là bot — bot làm 1 lần đã là nuke (khác người dùng có thể thao tác nhầm).
// Bot logging hợp pháp (Carl-bot, MEE6...) vẫn được lọc riêng ở massWebhookCreate.
const IMMEDIATE_BOT_NUKE = new Set([
  "massBan",
  "massKick",
  "massChannelDelete",
  "massChannelCreate",
  "massRoleDelete",
  "massRoleCreate",
  "massMessageDelete",
  "massThreadDelete",
  "massThreadCreate",
  "massWebhookCreate",
  "adminSelfGrant",
  "massBotAdd",
  "botHitAndRun",
  "externalAppRaid",
]);

// S4 — module phá hoại cấu trúc ĐƯỢC ĐẾM VÀO NGÂN SÁCH PHÁ HOẠI tích lũy
// per-executor (vandalBudget): kẻ rải đều chậm qua NHIỀU module (mỗi module
// dưới ngưỡng) vẫn bị cách ly khi tổng hành vi vượt hạn mức.
const BUDGET_MODULES = new Set([
  "massBan",
  "massKick",
  "massChannelDelete",
  "massChannelCreate",
  "massRoleDelete",
  "massRoleCreate",
  "massMessageDelete",
  "massThreadDelete",
  "massThreadCreate",
  "massWebhookCreate",
  "massChannelRename",
  "massChannelOverwrite",
  "massRoleEdit",
  "massRoleAssign",
  "massNickname",
  "massEmoji",
  "massBotAdd",
  "adminSelfGrant",
  "massInviteCreate",
  "guildTamper",
  "externalAppRaid",
]);

// S3 — module nuke cấu trúc ĐÁNG rollback (gây mất mát role/kênh thật sự;
// massCreate thêm rác thì chủ server xoá tay — rollback chỉ hồi phục mất mát).
const ROLLBACK_MODULES = new Set([
  "massChannelDelete",
  "massRoleDelete",
  "massBan",
  "massKick",
  "guildTamper",
]);

/**
 * Bot hit-and-run: bot MỚI được thêm vào server rồi TỰ RỜI ngay — dấu hiệu
 * kinh điển của bot nuke (thực hiện phá hoại rồi rời để dọn dấu vết, né audit
 * log và né lệnh phạt). Pure function, test được.
 * CHỈ tính là hit-and-run khi: rời đúng là bot, khoảng thêm→rời trong cửa sổ,
 * và bot KHÔNG tin cậy (không tick xác minh). Mod/bot khác kick (có audit
 * MemberKick) và bot logging hợp pháp được loại ở tầng gọi.
 */
const HIT_AND_RUN_WINDOW_MS = 10 * 60_000; // 10 phút

/**
 * Phân loại bot MỚI ĐƯỢC THÊM vào server (pure function, test được):
 * - "logging"  : bot logging hợp pháp theo tên (Carl-bot, MEE6…) → bỏ qua.
 * - "verified" : có tick VerifiedBot của Discord → bỏ qua.
 * - "unknown"  : bot lạ — đáng cảnh báo. Kèm cờ youngAcc (acc < 30 ngày)
 *   để cảnh báo mạnh hơn (bot nuke thường dùng acc/bot application mới tạo).
 */
function strangeBotVerdict({ user, now = Date.now() }) {
  if (!user || user.bot !== true) return { alert: false, kind: "not-bot" };
  if (isKnownLoggingBot(user)) return { alert: false, kind: "logging" };
  const verified = typeof user.flags?.has === "function" && user.flags.has(UserFlags.VerifiedBot);
  if (verified) return { alert: false, kind: "verified" };
  const ageDays = user.createdAt ? (now - user.createdAt) / 86_400_000 : NaN;
  const youngAcc = Number.isFinite(ageDays) && ageDays < 30;
  return { alert: true, kind: youngAcc ? "unknown-young" : "unknown", youngAcc };
}
function botHitAndRunVerdict({ addedAt, leftAt, trusted, isBot }) {
  if (!isBot) return false;
  if (!addedAt) return false;
  // Hardening: leftAt < addedAt (dữ liệu hỏng / clock skew — bot "rời" trước khi
  // "được thêm") không phải hit-and-run — property test bắt được ca phạt oan này.
  if (leftAt - addedAt <= 0) return false;
  if (leftAt - addedAt > HIT_AND_RUN_WINDOW_MS) return false;
  if (trusted) return false;
  return true;
}

/**
 * Bot THÀNH VIÊN LÂU NĂM / XÁC MINH — coi như bot hợp lệ được mời chính thức.
 * Bot hợp lệ (Carl-bot, Dyno, MEE6, Wick, Security bot…) cũng BAN bot spam,
 * PURGE tin nhắn, TẠO/XÓA webhook — đây là công việc logging/moderation bình
 * thường, KHÔNG phải nuke. Trước đây mọi bot trigger module trong
 * IMMEDIATE_BOT_NUKE bị ban ngay ở lần đầu (ngưỡng 1) → ban oan bot xác minh.
 * Quy tắc mới: bot chỉ bị xử lý NGAY khi nó MỚI vào server (một trong các dấu
 * hiệu bot nuke: vừa được thêm + hành vi phá hủy tức thì). Bot đã ở lại server
 * lâu (>= 7 ngày) hoặc có tick VerifiedBot → đi theo NGƯỠNG BÌNH THƯỜNG của
 * module như người dùng (thủ phạm thật vẫn bị phạt, không còn ban oan).
 */
const TRUSTED_BOT_MIN_AGE_MS = 7 * 86_400_000;

/** Bot thành viên được coi là tin cậy: tick xác minh hoặc đã ở lại server >= 7 ngày. */
function isTrustedBotMember(member, guild) {
  if (!member) return false;
  const user = member.user ?? member;
  if (user?.bot !== true) return false;
  // Bot xác minh bởi Discord (tick) — luôn tin cậy.
  if (typeof user.flags?.has === "function" && user.flags.has(UserFlags.VerifiedBot)) return true;
  // Bot đã ở lại server đủ lâu = được mời từ trước, không phải bot nuke vừa được thêm.
  const joinedAt = member.joinedTimestamp;
  if (typeof joinedAt === "number" && Date.now() - joinedAt >= TRUSTED_BOT_MIN_AGE_MS) return true;
  // Fallback: guild.members.cache có sẵn thông tin join time đầy đủ hơn.
  const cached = guild?.members?.cache?.get(member.id);
  if (
    cached &&
    typeof cached.joinedTimestamp === "number" &&
    Date.now() - cached.joinedTimestamp >= TRUSTED_BOT_MIN_AGE_MS
  ) {
    return true;
  }
  return false;
}

/**
 * Người DÙNG được miễn xử lý cho 1 module? (pure function, test được)
 * Người admin thật được miễn thao tác quản trị thường ngày; còn BOT có quyền
 * Administrator thì KHÔNG được miễn — bot nuke được mời với quyền admin
 * chính là đối tượng cần cấm, không phải "quản trị viên tin cậy".
 * Whitelist role/người dùng (toàn cục hoặc theo module) vẫn được tôn trọng
 * kể cả với bot — owner chủ động whitelist là quyết định cuối cùng.
 */
function isExempt(member, moduleCfg, guildConfig) {
  if (!member) return false;
  // An toàn kiểu: executor từ audit log là User (không có .guild/.roles) —
  // truy cập liều lĩnh trước đây làm crash cả handler → mất luôn lệnh phạt.
  const isBotMember = member.user?.bot === true || member.bot === true;
  if (member.guild?.ownerId && member.id === member.guild.ownerId) return true;
  if (!isBotMember && member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  if ((guildConfig?.adminRoles || []).some((id) => member.roles?.cache.has(id))) return true;
  if ((guildConfig?.modRoles || []).some((id) => member.roles?.cache.has(id))) return true;
  // Whitelist toàn cục: role/người dùng được miễn trừ khỏi mọi module nuke/raid/moderation.
  if ((guildConfig?.whitelistRoles || []).some((id) => member.roles?.cache.has(id))) return true;
  if ((guildConfig?.whitelistUsers || []).includes(member.id)) return true;
  if ((moduleCfg?.whitelistRoles || []).some((id) => member.roles?.cache.has(id))) return true;
  return false;
}

// Ký tự ẩn thường dùng để gây nhiễu.
const ZERO_WIDTH_RE = /[\u200b-\u200d\u2060\ufeff]/g;
// Ngưỡng độ dài coi là "tin dài cực dài" (Discord giới hạn 2000 ký tự).
const LONG_MSG_LEN = 300;
// Kích thước tối đa của các bucket trong bộ nhớ (chống rò rỉ RAM).
const BUCKET_MAX = 200;

/**
 * Ngưỡng mặc định cho các module MỚI — server cũ chưa có dòng antinukeModules
 * (chưa được seed) thì bot KHÔNG tự phạt ai: `moduleCfgOf` trả về
 * `enabled: false` đúng như `botEnsureModules` vừa ghi vào DB, và đúng nguyên tắc
 * "update không đổi setup cũ" (chủ server tự bật từng module trên web).
 *
 * Vì sao KHÔNG mặc định bật (đã từng là `enabled: true` — bug 28/09/2026): cache
 * config của bot giữ tới 90 phút, seed chạy muộn hơn, và nếu `botEnsureModules` lỗi
 * thì dòng module vĩnh viễn thiếu — lúc đó module chưa bật sẽ phạt thật (mặc định
 * `ban`) đúng người vô tội. Hướng lỗi nguy hiểm; thiếu cấu hình thì phải im.
 * Ngưỡng vẫn trả về để web hiển thị/đề xuất; chỉ `enabled` là TẮT.
 */
const DEFAULT_MODULE_CFG = {
  massThreadDelete: { threshold: 3, windowSeconds: 10, punish: "ban", timeoutSeconds: 600 },
  massChannelRename: { threshold: 3, windowSeconds: 10, punish: "ban", timeoutSeconds: 600 },
  massChannelOverwrite: { threshold: 3, windowSeconds: 10, punish: "ban", timeoutSeconds: 600 },
  massRoleEdit: { threshold: 3, windowSeconds: 10, punish: "ban", timeoutSeconds: 600 },
  adminSelfGrant: { threshold: 1, windowSeconds: 10, punish: "ban", timeoutSeconds: 600 },
  massRoleAssign: { threshold: 6, windowSeconds: 15, punish: "kick", timeoutSeconds: 600 },
  massNickname: { threshold: 6, windowSeconds: 15, punish: "kick", timeoutSeconds: 600 },
  massEmoji: { threshold: 3, windowSeconds: 10, punish: "ban", timeoutSeconds: 600 },
  massBotAdd: { threshold: 3, windowSeconds: 10, punish: "kick", timeoutSeconds: 600 },
  // botHitAndRun CỐ Ý không có fallback mặc định — module mới phải qua botEnsureModules
  // (mặc định TẮT) và chủ server tự bật, đúng nguyên tắc "update không đổi setup cũ".
  externalAppRaid: { threshold: 2, windowSeconds: 15, punish: "kick", timeoutSeconds: 600 },
  massInviteCreate: { threshold: 5, windowSeconds: 10, punish: "ban", timeoutSeconds: 600 },
  guildTamper: { threshold: 2, windowSeconds: 10, punish: "ban", timeoutSeconds: 600 },
};

/**
 * CỔNG của tab "Auto-mod nội dung" (spam/massMessage/blankNoise/mention/
 * badword/attachment/invite/malware) — TÁCH RIÊNG khỏi cổng chống nuke.
 *
 * Vì sao phải tách: trước đây cả tab Auto-mod lẫn tab Chống nuke cùng đọc
 * `antinukeEnabled`. Chủ server tắt chống nuke (hợp lý — không muốn bot tự
 * kick/ban hàng loạt) là mất LUÔN lọc link mời, link độc hại, file .exe, từ
 * ngữ xấu, spam mention: không log, không cảnh báo, im lặng tuyệt đối.
 *
 * Fallback về `antinukeEnabled` khi server chưa có field (guild tạo trước khi
 * tách) ⇒ hành vi của mọi server cũ giữ nguyên, chỉ khi chủ server tự bật/tắt
 * ở dashboard thì `automodEnabled` mới chi phối.
 */
function automodEnabled(config) {
  return (config?.automodEnabled ?? config?.antinukeEnabled) === true;
}

/** Lấy cấu hình module (đã seed) hoặc mặc định TẮT cho module mới chưa được seed. */
function moduleCfgOf(config, module) {
  const found = (config?.modules || []).find((m) => m.module === module);
  if (found) return found;
  const d = DEFAULT_MODULE_CFG[module];
  if (!d) return null;
  return { module, enabled: false, ...d, whitelistRoles: [], actions: [d.punish] };
}

/**
 * Điểm nghi vấn của MỘT tài khoản trong cụm raid (pure function, test được):
 * acc mới <7 ngày (+2), avatar mặc định (+1), username dạng máy "tên + số cuối" (+1).
 * Mức CỤM (joinClusterSuspicion): điểm >= 2 = đáng ngờ (đủ acc mới là đủ tín hiệu cụm).
 * Mức CÁ NHÂN (kick từng người trong cụm hỗn hợp): điểm >= 4 — tức acc mới PHẢI
 * kèm thêm ÍT NHẤT 2 tín hiệu độc lập nữa (avatar mặc định + tên máy, hoặc các
 * tổ hợp tương đương). Ngưỡng 3 cũ vẫn kick oan người thật mới lập acc (mới +
 * default avatar) đi kèm sóng đông → nâng lên 4.
 */
function memberSuspicionScore(p, now = Date.now()) {
  if (!p || !p.id) return 0;
  let score = 0;
  const ageDays = p.createdAt ? (now - p.createdAt) / 86_400_000 : NaN;
  if (Number.isFinite(ageDays) && ageDays < 7) score += 2;
  if (!p.avatar) score += 1;
  if (/^[A-Za-z][A-Za-z0-9_]*\d{3,}$/.test(p.username || "")) score += 1;
  return score;
}

/**
 * Heuristic chống ban nhầm làn sóng thành viên THẬT (pure function, test được):
 * raid thật dùng tài khoản mới (< 7 ngày), avatar mặc định, username dạng máy.
 * Cụm tăng trưởng tự nhiên (server viral, được quảng bá) có hồ sơ bình thường
 * → ratio đáng ngờ thấp → bot bỏ qua thay vì kick cả server oan.
 * Tài khoản đáng ngờ = điểm >= 2 (xem memberSuspicionScore).
 *
 * NÂNG CẤP PHÂN BIỆT RAID (chống "báo raid tào lao"): acc mới một mình CHƯA
 * ĐỦ kết luận raid — cụm acc mới có avatar + tên người (bạn bè rủ nhau vào)
 * rất hay gặp ở server thật. Trường `raidLikely` chỉ true khi có thêm ÍT
 * NHẤT 1 tín hiệu PHỐI HỢP độc lập: avatar mặc định ồ ạt / tên dạng máy ồ ạt
 * / avatar dùng chung / acc mới ồ ạt / vào dồn dập cùng nhịp. Không có tín
 * hiệu phối hợp → chỉ là tăng trưởng tự nhiên lẫn vài acc mới, KHÔNG raid.
 */
function joinClusterSuspicion(profiles, now = Date.now()) {
  const list = (profiles || []).filter((p) => p && p.id);
  let freshAccounts = 0;
  let defaultAvatars = 0;
  let machineNames = 0;
  let suspicious = 0;
  const avatarCounts = new Map();
  const burstBuckets = new Map();
  for (const p of list) {
    const score = memberSuspicionScore(p, now);
    const ageDays = p.createdAt ? (now - p.createdAt) / 86_400_000 : NaN;
    if (Number.isFinite(ageDays) && ageDays < 7) freshAccounts += 1;
    if (!p.avatar) defaultAvatars += 1;
    else avatarCounts.set(p.avatar, (avatarCounts.get(p.avatar) ?? 0) + 1);
    if (/^[A-Za-z][A-Za-z0-9_]*\d{3,}$/.test(p.username || "")) machineNames += 1;
    if (score >= 2) suspicious += 1;
    const bucket = Math.round((p.joinedAt || now) / 3000);
    burstBuckets.set(bucket, (burstBuckets.get(bucket) ?? 0) + 1);
  }
  const sharedAvatarGroups = [...avatarCounts.values()].filter((c) => c >= 2).length;
  const sharedAvatarMembers = [...avatarCounts.values()]
    .filter((c) => c >= 2)
    .reduce((a, b) => a + b, 0);
  const maxBurst = burstBuckets.size > 0 ? Math.max(...burstBuckets.values()) : 0;
  // Tín hiệu phối hợp: mỗi tín hiệu là một DẠNG bằng chứng độc lập. Chia 2 tầng:
  //  - CỨNG (hard): tên dạng máy ồ ạt / avatar dùng chung / avatar mặc định áp
  //    đảo (≥2/3 cụm) — người thật đi lẻ hiếm khi trùng nhau kiểu này.
  //  - MỀM (soft): acc mới ồ ạt / vào dồn dập cùng nhịp — sóng viral thật cũng
  //    có thể như vậy nên MỘT tín hiệu mềm đơn lẻ KHÔNG đủ kết luận raid.
  // raidLikely = đáng ngờ ≥50% VÀ (≥1 cứng HOẶC ≥2 mềm). Quy tắc này chặn báo
  // raid oan cho "nhóm bạn acc mới rủ nhau vào" (chỉ có mềm) mà vẫn bắt raid
  // tool (luôn dính ít nhất 1 cứng: tên máy / avatar mặc định / avatar trùng).
  const half = Math.ceil(list.length / 2);
  const hardSignals = [];
  if (machineNames >= Math.max(2, half)) hardSignals.push("tên dạng máy ồ ạt");
  if (sharedAvatarGroups >= 1) hardSignals.push("avatar dùng chung");
  if (defaultAvatars >= Math.max(3, Math.ceil((list.length * 2) / 3)))
    hardSignals.push("avatar mặc định ồ ạt");
  const softSignals = [];
  if (freshAccounts >= Math.max(3, half)) softSignals.push("acc mới ồ ạt");
  if (maxBurst >= Math.max(3, half)) softSignals.push("vào dồn dập cùng nhịp");
  const strongSignals = [...hardSignals, ...softSignals];
  return {
    total: list.length,
    suspicious,
    ratio: list.length > 0 ? suspicious / list.length : 0,
    freshAccounts,
    defaultAvatars,
    machineNames,
    sharedAvatarGroups,
    sharedAvatarMembers,
    maxBurst,
    strongSignals,
    raidLikely:
      list.length > 0 &&
      suspicious / list.length >= 0.5 &&
      (hardSignals.length >= 1 || softSignals.length >= 2),
  };
}

/**
 * Phán quyết 3 mức cho một làn sóng join (pure function, test được):
 *  - "raid"   : cụm đáng ngờ + có tín hiệu phối hợp → xử lý + báo động.
 *  - "watch"  : có dấu hiệu nhưng chưa đủ chắc → ghi nhận + theo dõi, KHÔNG
 *    phạt, KHÔNG báo động raid (chống báo raid tào lao).
 *  - "calm"   : hồ sơ bình thường → chỉ ghi nhận cho dashboard, KHÔNG gửi
 *    thông báo ra kênh log.
 */
function joinWaveVerdict(sus) {
  const total = sus?.total ?? 0;
  const suspicious = sus?.suspicious ?? 0;
  if (total === 0) return { level: "calm", reason: "không có dữ liệu" };
  if (sus?.raidLikely === true) {
    return {
      level: "raid",
      reason: `tín hiệu phối hợp: ${(sus.strongSignals || []).join(", ")}`,
    };
  }
  if (sus && (sus.ratio >= 0.3 || suspicious >= 2)) {
    return {
      level: "watch",
      reason: `có dấu hiệu nhưng chưa đủ chắc (${suspicious}/${total} đáng ngờ)`,
    };
  }
  return { level: "calm", reason: `hồ sơ bình thường (${suspicious}/${total} đáng ngờ)` };
}

// Các hàm thuần (messageFingerprint, isExternalAppSpam, appNameSuspicion, normalizeFuzzy)
// được tách sang ../externalAppGuard để test trực tiếp — xem require ở đầu file.

module.exports = {
  MODULE_LABELS,
  KNOWN_LOGGING_BOTS,
  isKnownLoggingBot,
  NUKE_MODULES,
  IMMEDIATE_BOT_NUKE,
  BUDGET_MODULES,
  ROLLBACK_MODULES,
  strangeBotVerdict,
  botHitAndRunVerdict,
  isTrustedBotMember,
  isExempt,
  automodEnabled,
  moduleCfgOf,
  memberSuspicionScore,
  joinClusterSuspicion,
  joinWaveVerdict,
  messageFingerprint,
  isExternalAppSpam,
  BUCKET_MAX,
  LONG_MSG_LEN,
  ZERO_WIDTH_RE,
};
