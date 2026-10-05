import type { ModuleAction, PunishNoticeLevel } from "./types";

/**
 * Bản bot tối thiểu hỗ trợ khôi phục file backup + báo kết quả lên dashboard.
 * Bot heartbeat ghi version ("v47", "v48"…) — bản cũ ghi "1.0.0" → coi là cũ.
 */
export const MIN_IMPORT_BOT_VERSION = 47;

/**
 * Hình phạt thành viên — CHỌN 1 (bot dùng đúng hình phạt đã chọn).
 * Tách riêng khỏi nhóm dọn tin nhắn để tránh nhầm lẫn chọn ban + kick cùng lúc.
 */
export const MEMBER_PUNISH_OPTIONS: {
  value: ModuleAction;
  label: string;
  hint: string;
}[] = [
  { value: "warn", label: "Warn", hint: "Gửi cảnh báo riêng (DM) cho thành viên" },
  {
    value: "timeout",
    label: "Tạm khóa (timeout)",
    hint: "Khóa tạm thời (đặt thời lượng bên dưới)",
  },
  { value: "kick", label: "Kick", hint: "Đuổi thành viên khỏi server" },
  { value: "ban", label: "Ban", hint: "Cấm thành viên vĩnh viễn" },
];

/**
 * Hành động dọn tin nhắn — CHỌN NHIỀU (kết hợp được với nhau và với hình phạt).
 */
export const MESSAGE_CLEAN_OPTIONS: {
  value: ModuleAction;
  label: string;
  hint: string;
}[] = [
  {
    value: "deleteMessages",
    label: "Xóa tin phát hiện",
    hint: "Xóa ngay tin nhắn vi phạm tại thời điểm bot nhận ra vi phạm",
  },
  {
    value: "purgeMessages",
    label: "Purge toàn bộ tin liên quan",
    hint: "Xóa hàng loạt mọi tin nhắn liên quan đến vụ vi phạm (ví dụ: toàn bộ tin spam trong cửa sổ phát hiện)",
  },
];

/** Độ mạnh của hình phạt thành viên (ban > kick > timeout > warn). */
export const ACTION_STRENGTH: Record<string, number> = {
  warn: 1,
  timeout: 2,
  kick: 3,
  ban: 4,
};

/** Nhãn ngắn cho từng hành động. */
export const ACTION_LABEL: Record<string, string> = {
  warn: "Warn",
  timeout: "Tạm khóa",
  kick: "Kick",
  ban: "Ban",
  deleteMessages: "Xóa tin phát hiện",
  purgeMessages: "Purge tin liên quan",
};

/** Lấy hình phạt thành viên mạnh nhất trong danh sách hành động. */
export function strongestPunish(
  actions: readonly string[],
  fallback: "warn" | "kick" | "ban" | "timeout" = "warn",
): "warn" | "kick" | "ban" | "timeout" {
  const member = actions
    .filter((a): a is "warn" | "kick" | "ban" | "timeout" => ACTION_STRENGTH[a] != null)
    .sort((a, b) => ACTION_STRENGTH[b] - ACTION_STRENGTH[a]);
  return member[0] ?? fallback;
}

/** Hành động mặc định cho từng module — giữ nguyên hành vi hiện tại của bot. */
export const DEFAULT_MODULE_ACTIONS: Record<string, ModuleAction[]> = {
  massBan: ["ban"],
  massKick: ["kick"],
  massJoin: ["kick"],
  massChannelCreate: ["ban"],
  massChannelDelete: ["ban"],
  massRoleCreate: ["ban"],
  massRoleDelete: ["ban"],
  massMessageDelete: ["warn"],
  massWebhookCreate: ["ban"],
  massThreadCreate: ["ban"],
  massThreadDelete: ["ban"],
  massChannelRename: ["ban"],
  massChannelOverwrite: ["ban"],
  massRoleEdit: ["ban"],
  adminSelfGrant: ["ban"],
  massRoleAssign: ["kick"],
  massNickname: ["kick"],
  massEmoji: ["ban"],
  massBotAdd: ["kick"],
  botHitAndRun: ["ban"],
  suspiciousBotAlert: ["warn"],
  externalAppRaid: ["kick"],
  massInviteCreate: ["ban"],
  guildTamper: ["ban"],
  spam: ["timeout"],
  massMessage: ["timeout", "deleteMessages"],
  blankNoise: ["timeout", "deleteMessages"],
  mention: ["timeout", "deleteMessages"],
  badword: ["warn", "deleteMessages"],
  attachment: ["timeout", "deleteMessages"],
  invite: ["warn", "deleteMessages"],
  malware: ["warn", "deleteMessages"],
};

export interface ModuleMeta {
  label: string;
  description: string;
  /** Nhóm hiển thị trên web (Chống nuke / Auto-mod). */
  group: string;
  defaultThreshold: number;
  defaultWindowSeconds: number;
  defaultPunish: "warn" | "kick" | "ban" | "timeout";
  /** Điểm nhiệt mặc định mỗi lần vi phạm. */
  defaultHeat: number;
}

export const ANTINUKE_MODULE_META: Record<string, ModuleMeta> = {
  massBan: {
    label: "Ban hàng loạt",
    description: "Phát hiện nhiều lượt ban trong thời gian ngắn",
    group: "Thành viên & quyền",
    defaultThreshold: 5,
    defaultWindowSeconds: 10,
    defaultPunish: "ban",
    defaultHeat: 25,
  },
  massKick: {
    label: "Kick hàng loạt",
    description: "Phát hiện nhiều lượt kick thành viên",
    group: "Thành viên & quyền",
    defaultThreshold: 5,
    defaultWindowSeconds: 10,
    defaultPunish: "kick",
    defaultHeat: 20,
  },
  massJoin: {
    label: "Raid thành viên",
    description: "Phát hiện làn sóng thành viên giả mạo tham gia ồ ạt",
    group: "Thành viên & quyền",
    defaultThreshold: 8,
    defaultWindowSeconds: 10,
    defaultPunish: "kick",
    defaultHeat: 15,
  },
  massChannelCreate: {
    label: "Tạo kênh hàng loạt",
    description: "Phát hiện spam tạo kênh mới",
    group: "Kênh & thread",
    defaultThreshold: 3,
    defaultWindowSeconds: 10,
    defaultPunish: "ban",
    defaultHeat: 25,
  },
  massChannelDelete: {
    label: "Xóa kênh hàng loạt",
    description: "Phát hiện spam xóa kênh",
    group: "Kênh & thread",
    defaultThreshold: 3,
    defaultWindowSeconds: 10,
    defaultPunish: "ban",
    defaultHeat: 25,
  },
  massRoleCreate: {
    label: "Tạo role hàng loạt",
    description: "Phát hiện spam tạo role mới",
    group: "Role · Emoji · Server",
    defaultThreshold: 3,
    defaultWindowSeconds: 10,
    defaultPunish: "ban",
    defaultHeat: 25,
  },
  massRoleDelete: {
    label: "Xóa role hàng loạt",
    description: "Phát hiện spam xóa role",
    group: "Role · Emoji · Server",
    defaultThreshold: 3,
    defaultWindowSeconds: 10,
    defaultPunish: "ban",
    defaultHeat: 25,
  },
  massMessageDelete: {
    label: "Xóa tin nhắn hàng loạt",
    description: "Phát hiện quét sạch kênh (bulk delete / nuke channel)",
    group: "Kênh & thread",
    defaultThreshold: 3,
    defaultWindowSeconds: 10,
    defaultPunish: "warn",
    defaultHeat: 20,
  },
  massWebhookCreate: {
    label: "Tạo webhook hàng loạt",
    description: "Phát hiện spam tạo webhook (kênh đăng webhook giả để phá server)",
    group: "Kênh & thread",
    defaultThreshold: 3,
    defaultWindowSeconds: 10,
    defaultPunish: "ban",
    defaultHeat: 25,
  },
  massThreadCreate: {
    label: "Tạo thread hàng loạt",
    description: "Phát hiện spam tạo thread (forum/thread nhiễu loạn)",
    group: "Kênh & thread",
    defaultThreshold: 3,
    defaultWindowSeconds: 10,
    defaultPunish: "ban",
    defaultHeat: 25,
  },
  massThreadDelete: {
    label: "Xóa thread hàng loạt",
    description: "Phát hiện spam xóa thread (quét sạch diễn đàn/thread)",
    group: "Kênh & thread",
    defaultThreshold: 3,
    defaultWindowSeconds: 10,
    defaultPunish: "ban",
    defaultHeat: 25,
  },
  massChannelRename: {
    label: "Sửa/đổi tên kênh hàng loạt",
    description: "Phát hiện spam đổi tên/chủ đề/vị trí kênh (phá hoại giao diện)",
    group: "Kênh & thread",
    defaultThreshold: 3,
    defaultWindowSeconds: 10,
    defaultPunish: "ban",
    defaultHeat: 25,
  },
  massChannelOverwrite: {
    label: "Thay đổi quyền kênh hàng loạt",
    description: "Permission bombing — sửa overwrite nhiều kênh để khóa mọi người hoặc mở toang",
    group: "Kênh & thread",
    defaultThreshold: 3,
    defaultWindowSeconds: 10,
    defaultPunish: "ban",
    defaultHeat: 25,
  },
  massRoleEdit: {
    label: "Sửa role hàng loạt",
    description: "Phát hiện sửa tên/màu/quyền nhiều role (role tampering)",
    group: "Role · Emoji · Server",
    defaultThreshold: 3,
    defaultWindowSeconds: 10,
    defaultPunish: "ban",
    defaultHeat: 25,
  },
  adminSelfGrant: {
    label: "Tự cấp quyền quản trị",
    description: "Leo thang đặc quyền — ai đó tự gán role Admin/ManageGuild/ManageRoles",
    group: "Thành viên & quyền",
    defaultThreshold: 1,
    defaultWindowSeconds: 10,
    defaultPunish: "ban",
    defaultHeat: 30,
  },
  massRoleAssign: {
    label: "Gán/gỡ role hàng loạt",
    description: "Role bombing — gán/gỡ role cho nhiều thành viên cùng lúc",
    group: "Thành viên & quyền",
    defaultThreshold: 6,
    defaultWindowSeconds: 15,
    defaultPunish: "kick",
    defaultHeat: 20,
  },
  massNickname: {
    label: "Đổi biệt danh hàng loạt",
    description: "Rename raid — đổi nickname của nhiều thành viên",
    group: "Thành viên & quyền",
    defaultThreshold: 6,
    defaultWindowSeconds: 15,
    defaultPunish: "kick",
    defaultHeat: 15,
  },
  massEmoji: {
    label: "Tạo emoji/sticker hàng loạt",
    description: "Spam tạo emoji/sticker để lấp đầy slot hoặc chèn ảnh phá hoại",
    group: "Role · Emoji · Server",
    defaultThreshold: 3,
    defaultWindowSeconds: 10,
    defaultPunish: "ban",
    defaultHeat: 25,
  },
  massBotAdd: {
    label: "Thêm bot hàng loạt",
    description: "Bot raid — mời nhiều bot vào server cùng lúc",
    group: "Thành viên & quyền",
    defaultThreshold: 3,
    defaultWindowSeconds: 10,
    defaultPunish: "kick",
    defaultHeat: 20,
  },
  suspiciousBotAlert: {
    label: "Cảnh báo bot lạ",
    description:
      "Bot chưa biết được thêm vào server — bot đăng cảnh báo kèm chi tiết tài khoản (tuổi acc, tick xác minh, quyền, người thêm). CHỈ CẢNH BÁO, không phạt; kết hợp với module hit-and-run để bắt trọn vòng đời bot nuke",
    group: "Thành viên & quyền",
    defaultThreshold: 1,
    defaultWindowSeconds: 10,
    defaultPunish: "warn",
    defaultHeat: 0,
  },
  botHitAndRun: {
    label: "Bot vào-rồi-rời (hit-and-run)",
    description:
      "Bot lạ tự rời server ngay sau khi được thêm — dấu hiệu kinh điển của bot nuke (dọn dấu vết, né audit log). Chỉ bot KHÔNG xác minh và MỚI vào server mới bị phạt; bot xác minh/ở lại lâu/mod kick bình thường được bỏ qua",
    group: "Thành viên & quyền",
    defaultThreshold: 1,
    defaultWindowSeconds: 10,
    defaultPunish: "ban",
    defaultHeat: 30,
  },
  externalAppRaid: {
    label: "Raid bằng ứng dụng ngoài",
    description:
      "Chống raid bằng external app (ứng dụng mở rộng): AI học hỏi các dạng tấn công app ngoài (sockpuppet cài app ồ ạt, app giả mạo/tên scam, spam @everyone/link lừa đảo, webhook spam) và chặn cả biến thể tương tự — raid → ban + khóa kênh",
    group: "Thành viên & quyền",
    defaultThreshold: 2,
    defaultWindowSeconds: 15,
    defaultPunish: "kick",
    defaultHeat: 20,
  },
  massInviteCreate: {
    label: "Tạo link mời hàng loạt",
    description: "Chuẩn bị raid — tạo nhiều link mời trước khi tràn vào",
    group: "Role · Emoji · Server",
    defaultThreshold: 5,
    defaultWindowSeconds: 10,
    defaultPunish: "ban",
    defaultHeat: 25,
  },
  guildTamper: {
    label: "Đổi cấu hình server",
    description: "Phá hoại cấp server — đổi tên/icon/bật MFA/giảm verification…",
    group: "Role · Emoji · Server",
    defaultThreshold: 2,
    defaultWindowSeconds: 10,
    defaultPunish: "ban",
    defaultHeat: 25,
  },
  massMessage: {
    label: "Spam tin dài / lặp nội dung",
    description:
      "Phát hiện spam tin nhắn cực dài hoặc lặp lại nội dung giống hệt — AI phân biệt raid hay cá nhân",
    group: "Spam & nhiễu kênh",
    defaultThreshold: 4,
    defaultWindowSeconds: 15,
    defaultPunish: "timeout",
    defaultHeat: 15,
  },
  blankNoise: {
    label: "Tin giả blank gây nhiễu",
    description: "Phát hiện tin nhắn chỉ gồm khoảng trắng / ký tự ẩn (zero-width) gây nhiễu kênh",
    group: "Spam & nhiễu kênh",
    defaultThreshold: 3,
    defaultWindowSeconds: 10,
    defaultPunish: "timeout",
    defaultHeat: 15,
  },
  spam: {
    label: "Chống spam tin nhắn",
    description: "Phát hiện thành viên gửi quá nhiều tin nhắn trong thời gian ngắn",
    group: "Spam & nhiễu kênh",
    defaultThreshold: 6,
    defaultWindowSeconds: 10,
    defaultPunish: "timeout",
    defaultHeat: 10,
  },
  mention: {
    label: "Chống spam mention",
    description: "Phát hiện spam tag người/role/kênh liên tục trong thời gian ngắn",
    group: "Spam & nhiễu kênh",
    defaultThreshold: 10,
    defaultWindowSeconds: 10,
    defaultPunish: "timeout",
    defaultHeat: 15,
  },
  badword: {
    label: "Lọc từ ngữ xấu",
    description: "Tự động xóa tin nhắn chứa từ trong danh sách từ ngữ xấu của server",
    group: "Nội dung nguy hiểm",
    defaultThreshold: 1,
    defaultWindowSeconds: 10,
    defaultPunish: "warn",
    defaultHeat: 10,
  },
  attachment: {
    label: "Chống spam ảnh & file",
    description: "Phát hiện spam ảnh, file đính kèm liên tục trong thời gian ngắn",
    group: "Spam & nhiễu kênh",
    defaultThreshold: 5,
    defaultWindowSeconds: 10,
    defaultPunish: "timeout",
    defaultHeat: 15,
  },
  invite: {
    label: "Chặn link mời Discord",
    description: "Xóa tin nhắn chứa link mời discord.gg / discord.com/invite",
    group: "Nội dung nguy hiểm",
    defaultThreshold: 1,
    defaultWindowSeconds: 10,
    defaultPunish: "warn",
    defaultHeat: 20,
  },
  malware: {
    label: "Chống link độc hại & file nguy hiểm",
    description:
      "Chặn domain lừa đảo (nitro giả, gift giả…), link IP và file đuôi nguy hiểm (.exe, .scr, .bat…)",
    group: "Nội dung nguy hiểm",
    defaultThreshold: 1,
    defaultWindowSeconds: 10,
    defaultPunish: "warn",
    defaultHeat: 15,
  },
};

export const ANTINUKE_ORDER = [
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
  "suspiciousBotAlert",
  "externalAppRaid",
  "massInviteCreate",
  "guildTamper",
  "spam",
  "massMessage",
  "blankNoise",
  "mention",
  "badword",
  "attachment",
  "invite",
  "malware",
] as const;

/** Nhóm module chống nuke / raid (sự kiện cấu trúc server) — phạt trực tiếp, không nhiệt. */
export const NUKE_MODULES = [
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
  "suspiciousBotAlert",
  "externalAppRaid",
  "massInviteCreate",
  "guildTamper",
] as const;

/** Nhóm module moderation nội dung (tin nhắn & đính kèm) — có hệ thống nhiệt. */
export const MODERATION_MODULES = [
  "spam",
  "massMessage",
  "blankNoise",
  "mention",
  "badword",
  "attachment",
  "invite",
  "malware",
] as const;

/** Nhóm hiển thị cho phần Chống nuke / raid — thứ tự nhóm + module. */
export const NUKE_GROUPS: { label: string; modules: string[] }[] = [
  {
    label: "Thành viên & quyền",
    modules: [
      "massBan",
      "massKick",
      "massJoin",
      "adminSelfGrant",
      "massRoleAssign",
      "massNickname",
      "massBotAdd",
      "suspiciousBotAlert",
      "botHitAndRun",
      "externalAppRaid",
    ],
  },
  {
    label: "Kênh & thread",
    modules: [
      "massChannelCreate",
      "massChannelDelete",
      "massChannelRename",
      "massChannelOverwrite",
      "massThreadCreate",
      "massThreadDelete",
      "massWebhookCreate",
      "massMessageDelete",
    ],
  },
  {
    label: "Role · Emoji · Server",
    modules: [
      "massRoleCreate",
      "massRoleDelete",
      "massRoleEdit",
      "massEmoji",
      "massInviteCreate",
      "guildTamper",
    ],
  },
];

/** Nhóm hiển thị cho phần Auto-mod nội dung. */
export const MODERATION_GROUPS: { label: string; modules: string[] }[] = [
  {
    label: "Spam & nhiễu kênh",
    modules: ["spam", "massMessage", "blankNoise", "mention", "attachment"],
  },
  {
    label: "Nội dung nguy hiểm",
    modules: ["badword", "invite", "malware"],
  },
];

export const PUNISH_LABEL: Record<string, string> = {
  warn: "Warn",
  kick: "Kick",
  ban: "Ban",
  timeout: "Tạm khóa (timeout)",
};

/**
 * Mức chi tiết của embed moderation kiểu Carl-bot sau khi bot trừng phạt thành viên
 * (phần Moderation — áp dụng cho cả tự động lẫn lệnh thủ công):
 *  - none:   không gửi embed (dashboard vẫn ghi nhận)
 *  - action: Offender
 *  - reason: thêm Reason (trống → "không có lý do")
 *  - full:   thêm Responsible moderator (bot tự động = tên bot, mod lệnh = tên người dùng)
 */
export const PUNISH_NOTICE_LEVELS: {
  value: PunishNoticeLevel;
  label: string;
  hint: string;
}[] = [
  {
    value: "none",
    label: "Không gửi tin nhắn",
    hint: "Bot im lặng sau khi trừng phạt (dashboard vẫn ghi nhận case)",
  },
  { value: "action", label: "Offender", hint: "Embed chỉ hiển thị Offender + hành động" },
  {
    value: "reason",
    label: "Offender + lý do",
    hint: 'Thêm dòng Reason (để trống → ghi "không có lý do")',
  },
  {
    value: "full",
    label: "Offender + lý do + moderator",
    hint: "Thêm dòng Responsible moderator (bot tự động = tên bot · mod lệnh = tên người dùng)",
  },
];

/** Các hành động trừng phạt áp dụng cấu hình thông báo. */
export const PUNISH_NOTICE_ACTIONS = ["ban", "timeout", "kick", "warn"] as const;

export const PUNISH_NOTICE_ACTION_LABEL: Record<string, string> = {
  ban: "🚫 Ban",
  timeout: "⏱️ Timeout",
  kick: "👢 Kick",
  warn: "⚠️ Warn",
};

export const DEFAULT_PUNISH_NOTICE: Record<string, PunishNoticeLevel> = {
  ban: "full",
  timeout: "full",
  kick: "full",
  warn: "full",
};

/** Giá trị mặc định cho hệ thống nhiệt độ vi phạm. */
export const HEAT_DEFAULTS = {
  max: 100,
  enabled: true,
  decayPerMin: 3,
  warnAt: 25,
  timeoutAt: 40,
  kickAt: 70,
  banAt: 90,
  repeatMultiplier: 2,
  repeatWindowMin: 30,
} as const;

/** Giá trị mặc định cho warn tích lũy (tăng cấp sau N lần cảnh báo). */
export const WARN_STRIKE_DEFAULTS = {
  limit: 3,
  windowMin: 60,
  punish: "timeout" as const,
} as const;

export const HEAT_TIER_LABEL: Record<string, string> = {
  warn: "Theo dõi",
  timeout: "Tạm khóa",
  kick: "Kick",
  ban: "Ban",
};

export const CHANNEL_TYPE_LABEL: Record<number, string> = {
  0: "Văn bản",
  2: "Thoại",
  4: "Danh mục",
  5: "Thông báo",
  13: "Sân khấu",
  15: "Diễn đàn",
};

/** Chủ đề màu riêng cho web của từng server (chọn trong Cài đặt). */
export interface ServerTheme {
  label: string;
  desc: string;
  /** HSL triplet cho CSS var --primary */
  primary: string;
  /** HSL triplet cho --ring */
  ring: string;
  /** Màu hiển thị cho ô chọn */
  swatch: string;
  swatch2: string;
}

// Bảng xám dùng chung — thiết kế đen trắng thuần khiết, mọi "chủ đề" chỉ khác
// nhau về độ đậm nhạt (contrast) thay vì sắc màu. Điều này giữ `--primary`
// trung tính dù server cũ từng lưu theme màu nào trong DB.
const SHADES = {
  pure: { primary: "0 0% 9%", ring: "0 0% 9%", swatch: "#111111", swatch2: "#111111" },
  strong: { primary: "0 0% 18%", ring: "0 0% 18%", swatch: "#2e2e2e", swatch2: "#2e2e2e" },
  mid: { primary: "0 0% 32%", ring: "0 0% 32%", swatch: "#525252", swatch2: "#525252" },
  soft: { primary: "0 0% 45%", ring: "0 0% 45%", swatch: "#737373", swatch2: "#737373" },
  light: { primary: "0 0% 62%", ring: "0 0% 62%", swatch: "#9e9e9e", swatch2: "#9e9e9e" },
};

export const SERVER_THEMES: Record<string, ServerTheme> = {
  graphite: {
    label: "Graphite",
    desc: "Mặc định — đen thuần khiết",
    ...SHADES.pure,
  },
  slate: {
    label: "Slate",
    desc: "Xám đậm — dày dặn, trầm",
    ...SHADES.strong,
  },
  steel: {
    label: "Steel",
    desc: "Xám vừa — cân bằng, rõ ràng",
    ...SHADES.mid,
  },
  mist: {
    label: "Mist",
    desc: "Xám nhạt — nhẹ nhàng, mờ ảo",
    ...SHADES.soft,
  },
  fog: {
    label: "Fog",
    desc: "Xám rất nhạt — tối giản tuyệt đối",
    ...SHADES.light,
  },
};

export const DEFAULT_THEME = "graphite";
