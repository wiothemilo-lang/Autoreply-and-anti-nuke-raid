export interface GuildSummary {
  discordId: string;
  name: string;
  icon: string | null;
  memberCount: number | null;
  prefix: string;
  antinukeEnabled: boolean;
  botInGuild: boolean;
  lastHeartbeat: number | null;
}

export interface MeData {
  user: {
    discordId: string;
    username: string;
    globalName: string | null;
    avatar: string | null;
  };
  guilds: GuildSummary[];
  botOnline: boolean;
  botGuildCount: number;
  botMemberCount: number;
}

import type { GenericId } from "convex/values";

export interface AutoReply {
  _id: GenericId<"autoReplies">;
  name: string;
  triggerType: "keyword" | "mention";
  keywords: string[];
  response: string;
  channels: string[];
  cooldownSeconds: number;
  enabled: boolean;
  createdAt: number;
}

/** Hành động bot có thể thực thi khi một module phát hiện vi phạm (chọn nhiều). */
export type ModuleAction = "warn" | "kick" | "ban" | "timeout" | "deleteMessages" | "purgeMessages";

/** Mức chi tiết thông báo sau khi bot trừng phạt thành viên (Moderation). */
export type PunishNoticeLevel = "none" | "action" | "reason" | "full";

export interface ModuleConfig {
  module: string;
  enabled: boolean;
  threshold: number;
  windowSeconds: number;
  /** Hình thức xử lý chính (mạnh nhất trong actions) — giữ tương thích dữ liệu cũ. */
  punish: "warn" | "kick" | "ban" | "timeout";
  /**
   * Danh sách hành động kết hợp: hình phạt thành viên (warn/kick/ban/timeout)
   * + dọn tin nhắn (deleteMessages = xóa ngay tin phát hiện, purgeMessages =
   * xóa hàng loạt mọi tin liên quan vụ vi phạm).
   */
  actions?: ModuleAction[];
  timeoutSeconds?: number;
  whitelistRoles: string[];
  /** Điểm nhiệt cộng mỗi lần vi phạm (hệ thống nhiệt độ). */
  heat: number;
}

export interface HeatState {
  userId: string;
  username: string;
  heat: number;
  updatedAt: number;
  /** Warn tích lũy hiện tại (0 nếu không có). */
  warnStrikes: number;
}

export interface ChannelInfo {
  channelId: string;
  name: string;
  type: number;
}

export interface AntiNukeEvent {
  module: string;
  executorId: string | null;
  executorName: string | null;
  action: string;
  count: number;
  threshold: number;
  windowSeconds: number;
  punish: string;
  createdAt: number;
}

export interface RoleInfo {
  roleId: string;
  name: string;
  color: number;
  position: number;
}

/** Emoji tuỳ chỉnh của server — dashboard dùng để chèn `<:name:id>` vào tin nhắn. */
export interface EmojiInfo {
  emojiId: string;
  name: string;
  animated: boolean;
}

export interface GuildData {
  guild: {
    discordId: string;
    name: string;
    icon: string | null;
    memberCount: number | null;
    prefix: string;
    logChannelId: string | null;
    /** Ngôn ngữ nhãn log do chủ server chọn (vi | en | de). */
    logLang: string | null;
    /** Kênh log moderation — GỘP CHUNG auto-mod + lệnh mod thủ công (kiểu Carl-bot: Offender / Reason / Responsible moderator). */
    modLogChannelId: string | null;
    /** Kênh gửi thông báo sau khi bot trừng phạt thành viên (Moderation). */
    punishNoticeChannelId: string | null;
    /** Mức chi tiết thông báo theo từng hành động ban/timeout/kick/warn. */
    punishNotice: Record<string, PunishNoticeLevel>;
    /** Whitelist của riêng server này — người dùng được miễn trừ moderation / anti-raid / nuke (không chia sẻ sang server khác). */
    whitelistUsers: string[];
    /** Whitelist của riêng server này — role được miễn trừ moderation / anti-raid / nuke (không chia sẻ sang server khác). */
    whitelistRoles: string[];
    modRoles: string[];
    adminRoles: string[];
    antinukeEnabled: boolean;
    /** Cổng RIÊNG của tab Auto-mod nội dung (server cũ chưa có cờ thì kế thừa antinukeEnabled). */
    automodEnabled: boolean;
    botInGuild: boolean;
    lastHeartbeat: number | null;
    /** Lúc dashboard ghi cấu hình — dùng cho badge trạng thái đồng bộ (lib/syncState.ts). */
    settingsChangedAt: number | null;
    lockdownEnabled: boolean;
    lockdownMinutes: number;
    lockdownUntil: number | null;
    lockdownRequested: boolean;
    dailyReportEnabled: boolean;
    lastReportAt: number | null;
    emergencyAlertEnabled: boolean;
    logPingEveryone: boolean;
    welcomeEnabled: boolean;
    welcomeChannelId: string | null;
    welcomeMessage: string | null;
    welcomeUseEmbed: boolean;
    goodbyeEnabled: boolean;
    goodbyeChannelId: string | null;
    goodbyeMessage: string | null;
    goodbyeUseEmbed: boolean;
    // Welcome/Goodbye v2 — template ngẫu nhiên, DM, embed tùy chỉnh, autorole.
    welcomeRandom: string | null;
    goodbyeRandom: string | null;
    welcomeDmEnabled: boolean;
    welcomeDmMessage: string | null;
    welcomeEmbedTitle: string | null;
    welcomeEmbedColor: string | null;
    welcomeEmbedImage: string | null;
    welcomeEmbedThumbnail: string | null;
    goodbyeEmbedTitle: string | null;
    goodbyeEmbedColor: string | null;
    goodbyeEmbedImage: string | null;
    goodbyeEmbedThumbnail: string | null;
    autoroleEnabled: boolean;
    autoroleRoleId: string | null;
    autoroleDelaySec: number;
    autoroleIncludeBots: boolean;
    /** Thẻ ảnh riêng cho từng thành viên (bot tự vẽ PNG) — chỉ dùng khi bật embed. */
    welcomeCardEnabled: boolean;
    /** Ảnh nền của thẻ chào (URL Convex storage hoặc URL ngoài). */
    welcomeCardBackground: string | null;
    goodbyeCardEnabled: boolean;
    goodbyeCardBackground: string | null;
    badWords: string[];
    heatEnabled: boolean;
    heatDecayPerMin: number;
    heatWarnAt: number;
    heatTimeoutAt: number;
    heatKickAt: number;
    heatBanAt: number;
    joinGateEnabled: boolean;
    joinGateMinAgeDays: number;
    joinGateRequireAvatar: boolean;
    joinGateRequireFlag: boolean;
    joinGateRaidKick: boolean;
    joinGatePunish: "kick" | "ban";
    joinGateWhitelist: string[];
    heatRepeatMultiplier: number;
    heatRepeatWindowMin: number;
    warnStrikeLimit: number;
    warnStrikeWindowMin: number;
    warnStrikePunish: "timeout" | "kick" | "ban";
    safetyPercent: number;
    hiddenPasswordSet: boolean;
    /** Người đang đăng nhập có phải admin sở hữu bot không (quyền tính năng ẩn). */
    isBotOwner: boolean;
    /** Đã xác định được chủ sở hữu bot chưa. */
    botOwnerSet: boolean;
    /** Chủ đề màu riêng của server (key trong SERVER_THEMES). */
    theme: string;
    /** Tự động backup: số ngày giữa 2 lần (0 = tắt, 2-30 = bật). */
    backupAutoDays: number;
    /** Lần backup thành công gần nhất (ms epoch) hoặc null. */
    lastBackupAt: number | null;
    /** Khôi phục role khi restore backup (áp dụng cho backup Protogon lẫn file bot nuke). */
    restoreRolesEnabled: boolean;
    /** Khôi phục emoji/sticker khi restore backup (áp dụng cho backup Protogon lẫn file bot nuke). */
    restoreEmojisEnabled: boolean;
    /** Giữ bao nhiêu bản backup gần nhất (2-50, mặc định 3). */
    backupKeepCount?: number;
    /** Dọn bản backup cũ hơn N ngày (0 = tắt, mặc định). */
    backupKeepDays?: number;
    /** Khôi phục tên / mô tả / icon server khi restore (mặc định bật). */
    restoreMetaEnabled?: boolean;
    /** Khôi phục danh sách ban + link mời khi restore (mặc định TẮT — không hoàn tác được). */
    restoreExtrasEnabled?: boolean;
    /** Khôi phục kênh khi restore backup. */
    restoreChannelsEnabled?: boolean;
    /** Khôi phục tin nhắn khi restore backup. */
    restoreMessagesEnabled?: boolean;
    /** Raid Intel: bật săn lùng nguồn cơn raid (phân tích cụm + audit log). */
    raidHuntEnabled: boolean;
    /** Raid Intel: tự ban tài khoản nghi là nguồn cơn raid khi đủ tín hiệu. */
    raidHuntBanSuspects: boolean;
    /** Khôi phục role/kênh sau vụ nuke. Mặc định bật. */
    rollbackEnabled: boolean;
    /** Verify system: bật xác minh thành viên khi vào server. */
    verifyEnabled: boolean;
    verifyMethod: "button" | "captcha";
    verifyChannelId: string | null;
    unverifiedRoleId: string | null;
    verifiedRoleId: string | null;
    /** Verify welcome DM: gửi embed chào mừng qua DM sau khi verify thành công. */
    verifyWelcomeEnabled: boolean;
    verifyWelcomeTitle: string | null;
    verifyWelcomeDescription: string | null;
    verifyWelcomeColor: string | null;
    verifySendPanel: boolean;
    /** Lỗi gửi panel xác minh gần nhất (bot báo lại — hiển thị thay vì im lặng). */
    verifyPanelError: string | null;
    verifyPanelErrorAt: number | null;
    /** Lỗi gửi DM trực tiếp gần nhất (bot báo lại — hiển thị thay vì im lặng). */
    dmError: string | null;
    dmErrorAt: number | null;
    // ═══ TICKET / KHIẾU NẠI ═══
    ticketEnabled: boolean;
    ticketCategoryId: string | null;
    /** Rỗng = dùng `modRoles` làm staff. */
    ticketStaffRoleId: string | null;
    ticketMaxOpen: number;
    ticketCooldownHours: number;
    ticketDmOnBan: boolean;
    /** Loại ticket khi gọi `/ticket mo` không chọn: "support" | "appeal". */
    ticketDefaultKind: string;
    ticketCloseNote: string | null;
    /** Không ai chat trong kênh ticket bấy nhiêu giờ thì bot tự đóng. 0 = tắt. */
    ticketIdleHours: number;
    /** Đóng đủ bấy nhiêu giờ thì bot lưu transcript rồi xoá kênh. */
    ticketCloseGraceHours: number;
    /** Nội dung panel tuỳ biến ({user} {number} {kind} {idle}); rỗng = mặc định. */
    ticketPanelText: string | null;
    /** Role được tag khi mở ticket (tối đa 3). */
    ticketPingRoleIds: string[];
    /** Kênh công khai dán panel "Mở ticket" (nút cho thành viên tự mở). */
    ticketPanelChannelId: string | null;
    /** Cờ chờ bot dán panel (dashboard bấm nút / tự bật khi vừa chọn kênh). */
    ticketSendPanel: boolean;
    /** Lý do bot không dán được panel (hiện trên web thay vì im lặng). */
    ticketPanelError: string | null;
    ticketPanelErrorAt: number | null;
    /** Tiêu đề panel mở tuỳ chỉnh; rỗng = dùng mặc định theo ngôn ngữ. */
    ticketOpenPanelTitle: string | null;
    /** Nội dung panel mở tuỳ chỉnh ({server} {open} {support}); rỗng = mặc định. */
    ticketOpenPanelText: string | null;
    /** Màu panel mở dạng hex 6 chữ số (không có `#`); rỗng = màu mặc định. */
    ticketOpenPanelColor: string | null;
    /** Hiện thêm nút "Khiếu nại" bên cạnh nút Hỗ trợ. Mặc định = true. */
    ticketShowAppealButton: boolean;
    /** DM cho người mở kèm link kênh ticket. Mặc định = true. */
    ticketDmOnOpen: boolean;
    /** Lời dặn dán ở đầu kênh ticket ({user} {number} {server}); rỗng = không dán. */
    ticketOpenNote: string | null;

    /* ═══ Mẫu kênh ticket (29/09/2026) ═══ */
    /** Mẫu tên kênh: {number} {user} {kind}. Rỗng = "ticket-{number}" như cũ. */
    ticketChannelTemplate: string;
    /** true = @everyone nhìn thấy kênh ticket (mặc định false = chỉ staff + người mở). */
    ticketChannelPublic: boolean;
    /** Slowmode kênh ticket (giây). 0 = tắt. */
    ticketSlowmodeSec: number;
    /** Ngân sách tin nhắn mỗi kênh; vượt thì bot tự đóng. 0 = không giới hạn. */
    ticketMessageBudget: number;
    /** Tạo danh mục con theo từng loại ticket thay vì dồn vào danh mục cha. */
    ticketCategoryPerKind: boolean;
  };
  heatStates: HeatState[];
  autoReplies: AutoReply[];
  modules: ModuleConfig[];
  channels: ChannelInfo[];
  roles: RoleInfo[];
  /** Emoji tuỳ chỉnh của server (bot đồng bộ) — picker chèn emoji cho welcome/goodbye. */
  emojis: EmojiInfo[];
  /**
   * Máy chủ bot có vẽ được thẻ ảnh chào không (thư viện canvas + font nhúng).
   * `null` = bot chưa báo (bản cũ/chưa khởi động lại) — KHÔNG được coi là hỏng.
   */
  botCardReady: boolean | null;
  /** Lý do không vẽ được (chỉ có nghĩa khi botCardReady === false). */
  botCardReason: string | null;
  panels: ReactionRolePanel[];
  giveaways: Giveaway[];
  modActions: ModAction[];
}

/** 1 ticket trong bảng `tickets` (mảng trả về từ `convex/tickets.ts`). */
export interface TicketRow {
  id: string;
  number: number;
  channelId: string;
  /**
   * Khoá loại ticket — khớp `key` của bảng `ticketKinds`. Server chưa cấu
   * hình loại tuỳ chỉnh thì chỉ có 2 giá trị cũ: "support" | "appeal".
   */
  kind: string;
  openerId: string;
  openerName: string;
  body: string;
  evidence: string;
  /** Ô nhập bổ sung do chủ server thêm cho loại này (lưu kèm nhãn ô). */
  fields: { label: string; value: string }[];
  /** "dm" (nút trong DM sau ban) | "command" (lệnh /ticket). */
  source: string;
  status: "open" | "closed" | "locked";
  closedByName: string | null;
  closeReason: string | null;
  unbanned: boolean;
  openError: string | null;
  createdAt: number;
  closedAt: number | null;
  /** Staff đã nhận việc (nút "Nhận việc"). */
  claimedById: string | null;
  claimedByName: string | null;
  /** Lần cuối có ai chat — cơ sở để tính "tự đóng sau bao lâu". */
  lastActivityAt: number;
  /** Transcript đã lưu vào storage (kênh sắp bị dọn). */
  hasTranscript: boolean;
  transcriptAt: number | null;
}

export interface ReactionRolePanel {
  _id: GenericId<"reactionRolePanels">;
  channelId: string;
  label: string;
  /** Nội dung / mô tả hiển thị trong embed (null = dùng mặc định). */
  description: string | null;
  /** Ảnh thumbnail hiển thị góc phải embed. */
  thumbnailUrl: string | null;
  entries: { emoji: string; roleId: string }[];
  messageId: string;
  /** Lỗi gửi panel gần nhất (bot báo lại — hiển thị thay vì treo "đang gửi"). */
  postError?: string | null;
  postErrorAt?: number | null;
  enabled: boolean;
  createdAt: number;
}

export interface ModAction {
  _id: GenericId<"modActions">;
  action: string;
  targetId: string | null;
  targetName: string | null;
  executorId: string | null;
  executorName: string | null;
  reason: string | null;
  details: string | null;
  /** Số case tăng dần của server (kiểu Carl-bot, ví dụ "warn | case 30"). */
  caseNumber: number | null;
  createdAt: number;
}

export interface BackupInfo {
  _id: GenericId<"guildBackups">;
  /** Discord ID của server gốc đã được backup. */
  guildId: string;
  guildName: string;
  createdAt: number;
  roleCount: number;
  channelCount: number;
  /** Số emoji đã backup (khôi phục lại được khi restore). */
  emojiCount?: number;
  /** Số sticker đã backup (khôi phục lại được khi restore). */
  stickerCount?: number;
  /** Số tin nhắn đã backup (0 = không kèm tin). */
  messageCount?: number;
  /** Nguồn backup: "backup" (bot tự chụp) | "import" (tải file .msc/.json lên) | "clone" (sao chép từ server khác). */
  source?: string;
  githubUrl: string | null;
  pushedToGithub: boolean;
  /** SHA-256 checksum của backup JSON (dùng cho incremental backup + xác minh). */
  backupChecksum?: string;
  /** Có nén zlib không (true = compressed JSON). */
  backupCompressed?: boolean;
  /** Có mã hóa AES-256-GCM không. */
  backupEncrypted?: boolean;
}

/** Raid Intel — dữ liệu thu thập + kết quả săn nguồn cơn raid của một server. */
export interface RaidIntel {
  huntEnabled: boolean;
  banSuspects: boolean;
  /** Tổng số mẫu raid/nuke đã thu thập (dữ liệu huấn luyện). */
  count: number;
  recent: {
    module: string;
    createdAt: number;
    count: number;
    action: string | null;
    aiClassification: string | null;
    aiConfidence: number | null;
    aiReason: string | null;
    punishedCount: number | null;
    lockdownTriggered: boolean;
    clusterMemberCount: number | null;
    suspectedSourceName: string | null;
    banned: boolean;
    reason: string | null;
  }[];
}

/** Một vụ raid bằng ứng dụng ngoài (External App Guard) đã bị bot chặn. */
export interface ExternalAppRaidIncident {
  createdAt: number;
  count: number;
  windowSeconds: number;
  threshold: number;
  action: string | null;
  punish: string | null;
  aiClassification: string | null;
  aiConfidence: number | null;
  aiReason: string | null;
  lockdownTriggered: boolean;
  /** Các app ngoài được kết nối trong vụ (app gì + ai kết nối). */
  apps: { appName: string | null; executorName: string | null; executorId: string | null }[];
  /** Người dùng đã bị xử lý trong vụ (ai + hình thức xử lý). */
  punished: { userId: string | null; username: string | null; action: string | null }[];
  suspectedSourceName: string | null;
  banned: boolean;
  reason: string | null;
}

export interface Giveaway {
  _id: GenericId<"giveaways">;
  channelId: string;
  title: string;
  prize: string;
  winnerCount: number;
  durationMinutes: number;
  endsAt: number;
  dmWinners: boolean;
  requiredRoleId: string | null;
  prizeRoleId: string | null;
  template: string;
  message: string | null;
  imageUrl: string | null;
  endMessage: string | null;
  status: "active" | "ended" | "cancelled";
  messageId: string;
  /** Lỗi gửi bảng giveaway gần nhất (bot báo lại — hiển thị thay vì treo "đang gửi"). */
  postError?: string | null;
  postErrorAt?: number | null;
  /** Lỗi khi kết thúc giveaway (cập nhật bảng/trao thưởng) — winners vẫn được chốt. */
  endError?: string | null;
  endErrorAt?: number | null;
  entriesCount: number;
  winners: { userId: string; username: string }[];
  createdAt: number;
}
