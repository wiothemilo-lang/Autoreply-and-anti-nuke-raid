import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    discordId: v.string(),
    username: v.string(),
    globalName: v.optional(v.string()),
    avatar: v.optional(v.string()),
    manageableGuildIds: v.array(v.string()),
    lastLoginAt: v.number(),
  }).index("by_discordId", ["discordId"]),

  sessions: defineTable({
    token: v.string(),
    userId: v.id("users"),
    createdAt: v.number(),
    /** Phiên mới phải do OAuth server-side xác thực; undefined = legacy bị từ chối. */
    authVersion: v.optional(v.number()),
  })
    .index("by_token", ["token"])
    .index("by_userId", ["userId"]),

  /**
   * Ngôn ngữ được đểt bằng `/language`. Để được chưa dùng của mình
   * (locale client Discord) thì Bot nhền ra được dùng gì.
   *
   * Không gối từ user đúng đển ố để quán lợ server (bảng users
   * là tài khoản đã đăng nhập web) — bảng này là định danh sách
   * Discord mà bot nhịiét.
   */
  userLangs: defineTable({
    userId: v.string(),
    /** "vi" | "en" | "de" — null/ở khi ngưỗi dùng lựa chọn để xoá. */
    lang: v.string(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  guilds: defineTable({
    discordId: v.string(),
    name: v.string(),
    icon: v.optional(v.string()),
    memberCount: v.optional(v.number()),
    prefix: v.string(),
    logChannelId: v.optional(v.string()),
    /**
     * Ngôn ngữ cho NHÃN trong log: "vi" | "en" | "de" (thiếu = "vi").
     * Tách riêng khỏi `userLangs` (ngôn ngữ người dùng) vì đây là lựa chọn của
     * CHỦ SERVER cho cả kênh log — người dùng tự đổi ngôn ngữ của riêng họ
     * không nên đổi ngôn ngữ log chung của server.
     */
    logLang: v.optional(v.string()),
    /** Kênh log moderation: auto-mod + lệnh mod thủ công (ban/timeout/kick/warn + ngược lại, purge) kiểu Carl-bot. */
    modLogChannelId: v.optional(v.string()),
    /** Số case moderation đã tăng dần của server (hiển thị "case N" trong log kiểu Carl-bot). */
    modCaseCounter: v.optional(v.number()),
    /** Kênh gửi thông báo sau khi bot trừng phạt thành viên (Moderation). */
    punishNoticeChannelId: v.optional(v.string()),
    /** Mức chi tiết thông báo theo từng hành động ban/timeout/kick/warn. */
    punishNotice: v.optional(
      v.object({
        ban: v.string(),
        timeout: v.string(),
        kick: v.string(),
        warn: v.string(),
      }),
    ),
    /** Backup server: cờ bot cần tạo backup. */
    backupRequested: v.optional(v.boolean()),
    backupPushToGithub: v.optional(v.boolean()),
    /** Backup server: có kèm tin nhắn hay không (tối đa 50 tin/kênh). */
    backupIncludeMessages: v.optional(v.boolean()),
    /** Lỗi backup gần nhất (bot báo lại — dashboard hiển thị thay vì im lặng). */
    backupError: v.optional(v.string()),
    backupErrorAt: v.optional(v.number()),
    /** Khôi phục từ file backup .msc/.json tải lên web (bot nuke khác). */
    importRestoreRequested: v.optional(v.boolean()),
    importFileName: v.optional(v.string()),
    /** File backup tải lên được giữ trong Convex file storage (tối đa 8 MB — chấp nhận cả media). */
    importStorageId: v.optional(v.id("_storage")),
    /** Lỗi xử lý file import gần nhất (bot báo lại — dashboard hiển thị thay vì im lặng). */
    importError: v.optional(v.string()),
    importErrorAt: v.optional(v.number()),
    /** Khóa chống lặp: bot nào claim được thì mới được chạy; lease được gia hạn khi job còn sống. */
    backupClaimedAt: v.optional(v.number()),
    backupLeaseUntil: v.optional(v.number()),
    /** Backup server: cờ bot cần khôi phục + id backup dùng để khôi phục. */
    restoreRequested: v.optional(v.boolean()),
    restoreBackupId: v.optional(v.id("guildBackups")),
    restoreClaimedAt: v.optional(v.number()),
    restoreLeaseUntil: v.optional(v.number()),
    /** Lỗi khôi phục gần nhất (bot báo lại — dashboard hiển thị thay vì im lặng). */
    restoreError: v.optional(v.string()),
    restoreErrorAt: v.optional(v.number()),
    /**
     * Kế hoạch khôi phục (dry-run): dashboard xin xem TRƯỚC sẽ tạo gì, bot chỉ
     * đọc backup + cấu hình rồi báo số liệu — KHÔNG tạo role/kênh/tin nào.
     * Khôi phục thật là việc phá hủy (tạo hàng chục role/kênh), không có đường
     * lùi nên chủ server cần biết trước còn thiếu quyền, đủ quyền, số lượng.
     */
    restorePlanRequested: v.optional(v.boolean()),
    restorePlanBackupId: v.optional(v.id("guildBackups")),
    /** Kết quả dry-run gần nhất — dashboard hiển thị trước khi bấm khôi phục. */
    restorePlan: v.optional(
      v.object({
        guildName: v.optional(v.string()),
        createdAt: v.optional(v.number()),
        roleCount: v.number(),
        channelCount: v.number(),
        messageCount: v.number(),
        emojiCount: v.number(),
        stickerCount: v.number(),
        threadCount: v.optional(v.number()),
        banCount: v.optional(v.number()),
        /** Số mục cấu hình (admin/mod/whitelist/kênh log) sẽ được áp lại. */
        settingsCount: v.number(),
        /** Cảnh báo tiếng Việt — bot so sánh backup với quyền và server hiện tại. */
        warnings: v.array(v.string()),
        at: v.number(),
      }),
    ),
    restorePlanError: v.optional(v.string()),
    restorePlanErrorAt: v.optional(v.number()),
    /** Lỗi gửi panel xác minh gần nhất (bot báo lại — dashboard hiển thị). */
    verifyPanelError: v.optional(v.string()),
    verifyPanelErrorAt: v.optional(v.number()),
    /** Lỗi gửi DM trực tiếp gần nhất (bot báo lại — dashboard hiển thị). */
    dmError: v.optional(v.string()),
    dmErrorAt: v.optional(v.number()),
    /** Mốc khôi phục hoàn tất gần nhất — dashboard hiển thị kết quả thay vì người dùng tự đoán. */
    restoreFinishedAt: v.optional(v.number()),
    /**
     * Mốc bot xử lý XONG yêu cầu backup chủ động (lưu xong hoặc bỏ qua vì server
     * không đổi). Dashboard so với thời điểm người dùng bấm "Backup ngay" để báo
     * kết quả — trước đây cờ backupRequested xoá im lặng nên người dùng chỉ thấy
     * "bấm xong không có bản backup nào, cũng không báo gì" (bug thật 23/09).
     */
    backupFinishedAt: v.optional(v.number()),
    /** Yêu cầu backup vừa rồi bị BỎ QUA vì server không đổi (checksum trùng bản gần nhất). */
    backupUnchanged: v.optional(v.boolean()),
    /** Web bật/tắt khôi phục role khi restore (áp dụng cho backup Protogon lẫn file bot nuke). */
    restoreRolesEnabled: v.optional(v.boolean()),
    /** Web bật/tắt khôi phục emoji/sticker khi restore (áp dụng cho backup Protogon lẫn file bot nuke). */
    restoreEmojisEnabled: v.optional(v.boolean()),
    /** Web bật/tắt khôi phục kênh khi restore. */
    restoreChannelsEnabled: v.optional(v.boolean()),
    /** Web bật/tắt khôi phục tin nhắn khi restore. */
    restoreMessagesEnabled: v.optional(v.boolean()),
    /**
     * Web bật/tắt áp lại tên / mô tả / icon của server khi restore (mặc định bật).
     * Server bị nuke thường mất đúng những thứ này và người dùng nhận ra đầu tiên.
     */
    restoreMetaEnabled: v.optional(v.boolean()),
    /**
     * Web bật/tắt áp lại DANH SÁCH BAN + link mời khi restore (mặc định TẮT).
     * Cấm người và mở link mời là hành động phá hủy, không thể hoàn tác → phải
     * chủ server bật mới chạy.
     */
    restoreExtrasEnabled: v.optional(v.boolean()),
    /** Tự động backup: số ngày giữa 2 lần (2-30, 0 = tắt). */
    backupAutoDays: v.optional(v.number()),
    /**
     * Giữ bao nhiêu bản backup gần nhất mỗi server (2-50, mặc định 3). Trước
     * đây con số 3 hard-code trong botStoreBackup nên không ai chỉnh được: server
     * lớn cần nhiều bản hơn thì mất dữ liệu, server nhỏ thì tốn chỗ vô ích.
     */
    backupKeepCount: v.optional(v.number()),
    /**
     * Dọn bản backup cũ hơn N ngày (0 = tắt, mặc định). Chạy cùng lúc với
     * backupKeepCount: bản quá hạn bị xoá dù còn nằm trong N bản gần nhất.
     */
    backupKeepDays: v.optional(v.number()),
    /** Lần backup thành công gần nhất (dùng cho lịch tự động). */
    lastBackupAt: v.optional(v.number()),
    /** Raid Intel: bật săn lùng nguồn cơn raid (phân tích cụm tài khoản + audit log). */
    raidHuntEnabled: v.optional(v.boolean()),
    /** Raid Intel: tự ban tài khoản nghi là nguồn cơn raid khi đủ tín hiệu. */
    raidHuntBanSuspects: v.optional(v.boolean()),
    /**
     * Khôi phục role/kênh sau vụ nuke (nukeRollback). Mặc định BẬT.
     *
     * Vì sao cần cờ tắt: rollback dựa trên snapshot, nên sau khi chủ server
     * đã dọn và tạo lại kênh có chủ đích, lượt rollback sau có thể hồi lại
     * những thứ chủ không muốn. Không có đường tắt thì lỗi đó không sửa được
     * ngoài cách gỡ bot.
     */
    rollbackEnabled: v.optional(v.boolean()),
    /** Whitelist toàn cục: user/role được miễn trừ khỏi moderation, anti-raid và nuke. */
    whitelistUsers: v.optional(v.array(v.string())),
    whitelistRoles: v.optional(v.array(v.string())),
    modRoles: v.array(v.string()),
    adminRoles: v.array(v.string()),
    antinukeEnabled: v.boolean(),
    /**
     * CỔNG RIÊNG của tab "Auto-mod nội dung" (spam/massMessage/blankNoise/
     * mention/badword/attachment/invite/malware). Trước đây các module này
     * dùng chung cổng `antinukeEnabled` với tab Chống nuke/raid — chủ server
     * tắt chống nuke là mất luôn lọc link mời/link độc hại mà không ai báo.
     * `optional` + fallback `antinukeEnabled` (xem bot/src/handlers/antinuke/
     * shared.js: automodEnabled) để server cũ giữ nguyên hành vi hiện tại
     * cho tới khi chủ server tự chốt trên dashboard.
     */
    automodEnabled: v.optional(v.boolean()),
    managers: v.array(v.string()),
    botInGuild: v.boolean(),
    lastHeartbeat: v.optional(v.number()),
    lockdownEnabled: v.optional(v.boolean()),
    lockdownMinutes: v.optional(v.number()),
    lockdownUntil: v.optional(v.number()),
    lockdownRequested: v.optional(v.boolean()),
    dailyReportEnabled: v.optional(v.boolean()),
    lastReportAt: v.optional(v.number()),
    /**
     * Cờ "đến hạn báo cáo ngày" do cron Convex đặt (đợt #4 — thay vòng
     * `reportInterval` 15 phút của bot). Bot đọc cờ qua batch tick
     * (`bot_tick.getPendingJobs.reports` — TƯƠI, KHÔNG đi qua bundle cache
     * `getBotConfig`) rồi gửi báo cáo và gọi `botSetReportAt` để xoá cờ.
     */
    reportRequestedAt: v.optional(v.number()),
    /** AI Incident Report: bật/tắt cảnh báo khẩn khi raid/nuke được xác nhận. */
    emergencyAlertEnabled: v.optional(v.boolean()),
    /** AI Incident Report: cảnh báo khẩn có ping @everyone không. */
    logPingEveryone: v.optional(v.boolean()),
    /** Welcome/Goodbye: chào thành viên mới + tạm biệt thành viên rời server. */
    welcomeEnabled: v.optional(v.boolean()),
    welcomeChannelId: v.optional(v.string()),
    welcomeMessage: v.optional(v.string()),
    welcomeUseEmbed: v.optional(v.boolean()),
    goodbyeEnabled: v.optional(v.boolean()),
    goodbyeChannelId: v.optional(v.string()),
    goodbyeMessage: v.optional(v.string()),
    goodbyeUseEmbed: v.optional(v.boolean()),
    /**
     * Welcome/Goodbye v2 (học Carl-bot/Welcomer/ProBot): template ngẫu nhiên
     * (1 dòng = 1 câu, bot chọn ngẫu nhiên mỗi lượt join/leave), welcome DM,
     * embed tùy chỉnh (tiêu đề/màu/ảnh banner/thumbnail), autorole.
     */
    welcomeRandom: v.optional(v.string()),
    goodbyeRandom: v.optional(v.string()),
    welcomeDmEnabled: v.optional(v.boolean()),
    welcomeDmMessage: v.optional(v.string()),
    welcomeEmbedTitle: v.optional(v.string()),
    welcomeEmbedColor: v.optional(v.string()),
    welcomeEmbedImage: v.optional(v.string()),
    welcomeEmbedThumbnail: v.optional(v.string()),
    goodbyeEmbedTitle: v.optional(v.string()),
    goodbyeEmbedColor: v.optional(v.string()),
    goodbyeEmbedImage: v.optional(v.string()),
    goodbyeEmbedThumbnail: v.optional(v.string()),
    autoroleEnabled: v.optional(v.boolean()),
    autoroleRoleId: v.optional(v.string()),
    autoroleDelaySec: v.optional(v.number()),
    autoroleIncludeBots: v.optional(v.boolean()),
    /**
     * THẺ ẢNH (v3): bot tự vẽ PNG riêng cho từng thành viên (nền dưới đây +
     * avatar + tên) rồi gửi kèm embed. Chỉ áp dụng khi `welcome/goodbyeUseEmbed`
     * bật — ảnh cần embed mới có chỗ hiển thị. Màu nhấn dùng chung
     * `welcome/goodbyeEmbedColor` (không thêm cột màu trùng nghĩa).
     */
    welcomeCardEnabled: v.optional(v.boolean()),
    welcomeCardBackground: v.optional(v.string()),
    goodbyeCardEnabled: v.optional(v.boolean()),
    goodbyeCardBackground: v.optional(v.string()),
    badWords: v.optional(v.array(v.string())),
    heatEnabled: v.optional(v.boolean()),
    heatDecayPerMin: v.optional(v.number()),
    heatWarnAt: v.optional(v.number()),
    heatTimeoutAt: v.optional(v.number()),
    heatKickAt: v.optional(v.number()),
    heatBanAt: v.optional(v.number()),
    heatResetRequested: v.optional(v.boolean()),
    heatResetUserId: v.optional(v.string()),
    joinGateEnabled: v.optional(v.boolean()),
    joinGateMinAgeDays: v.optional(v.number()),
    joinGateRequireAvatar: v.optional(v.boolean()),
    joinGateRequireFlag: v.optional(v.boolean()),
    joinGateRaidKick: v.optional(v.boolean()),
    joinGatePunish: v.optional(v.union(v.literal("kick"), v.literal("ban"))),
    joinGateWhitelist: v.optional(v.array(v.string())),
    heatRepeatMultiplier: v.optional(v.number()),
    heatRepeatWindowMin: v.optional(v.number()),
    warnStrikeLimit: v.optional(v.number()),
    warnStrikeWindowMin: v.optional(v.number()),
    warnStrikePunish: v.optional(
      v.union(v.literal("timeout"), v.literal("kick"), v.literal("ban")),
    ),
    /** Trần tổng punish tự động/phút/guild (actionBudget) — 0/undefined = mặc định 20. */
    actionBudgetPerMinute: v.optional(v.number()),
    /**
     * Threat relay — chia sẻ chữ ký raid GIỮA CÁC SERVER dùng chung bot (opt-in).
     * Khi server A bị raid, pattern (nội dung spam/tên bot nuke/invite) được bắn
     * lên relay (ẩn danh, không kèm userId) — server B có relayShare=true sẽ tải
     * về và chặn sớm hơn. TẤT CẢ mặc định TẮT: không server nào nhận dữ liệu từ
     * server khác nếu chủ server không bật.
     */
    relayShare: v.optional(v.boolean()),
    relayReceive: v.optional(v.boolean()),
    /** DI SẢN: hash mật khẩu tính năng ẩn theo từng server (salt = guildId). Mật
     *  khẩu giờ nằm toàn cục ở botStatus; field này chỉ được đọc để nâng cấp một
     *  lần rồi xoá — đừng ghi mới vào đây. */
    hiddenPasswordHash: v.optional(v.string()),
    /** DI SẢN: bộ đếm chống dò theo server (giờ đếm toàn cục ở botStatus). */
    hiddenVerifyLastAt: v.optional(v.number()),
    hiddenVerifyFails: v.optional(v.number()),
    /** Chủ đề màu riêng cho web của server (key trong SERVER_THEMES). */
    theme: v.optional(v.string()),
    dmTargetUserId: v.optional(v.string()),
    dmTargetUsername: v.optional(v.string()),
    dmMessage: v.optional(v.string()),
    dmRequested: v.optional(v.boolean()),
    /** Verify system: bật xác minh thành viên khi vào server. */
    verifyEnabled: v.optional(v.boolean()),
    /** Phương thức xác minh: "button" (bấm nút) hoặc "captcha" (nhập mã DM). */
    verifyMethod: v.optional(v.union(v.literal("button"), v.literal("captcha"))),
    verifyChannelId: v.optional(v.string()),
    unverifiedRoleId: v.optional(v.string()),
    verifiedRoleId: v.optional(v.string()),
    /** Verify welcome DM: gửi embed chào mừng qua DM sau khi verify thành công. */
    verifyWelcomeEnabled: v.optional(v.boolean()),
    verifyWelcomeTitle: v.optional(v.string()),
    verifyWelcomeDescription: v.optional(v.string()),
    verifyWelcomeColor: v.optional(v.string()),
    verifySendPanel: v.optional(v.boolean()),
    /** Alt account + VPN detection system. */
    altDetectionEnabled: v.optional(v.boolean()),
    vpnBlockEnabled: v.optional(v.boolean()),
    /** Tuổi tối thiểu (ngày) khi xét alt — tài khoản dưới ngưỡng này bị tăng riskScore. */
    altMinAgeDays: v.optional(v.number()),
    /** Ngưỡng riskScore tối đa được chấp nhận (vượt thì bị kick/ban). */
    altMaxRiskScore: v.optional(v.number()),
    /** Hình phạt cho alt account: kick | ban | timeout | verify (gán lại unverified role). */
    altPunish: v.optional(
      v.union(v.literal("kick"), v.literal("ban"), v.literal("timeout"), v.literal("verify")),
    ),
    /** Timeout duration (phút) khi altPunish = timeout. */
    altTimeoutMinutes: v.optional(v.number()),
    /** Roles được miễn khỏi alt detection. */
    altWhitelistRoles: v.optional(v.array(v.string())),
    /** Users được miễn khỏi alt detection. */
    altWhitelistUsers: v.optional(v.array(v.string())),
    /** Phân tích tương đồng username: ngưỡng similarity (0-100) để link accounts. */
    altSimilarityThreshold: v.optional(v.number()),
    /** Thời gian cửa sổ (phút) — 2 account join trong khoảng này + similarity cao = alt suspects. */
    altJoinWindowMinutes: v.optional(v.number()),
    /** Chế độ kiểm tra VPN: strict (block) | warn (log only) | off. */
    altVpnMode: v.optional(v.union(v.literal("strict"), v.literal("warn"), v.literal("off"))),
    /** Chế độ an toàn: chỉ phạt khi có >= 2 bằng chứng độc lập (chống chặn nhầm). */
    altSafeMode: v.optional(v.boolean()),
    /**
     * ═══ TICKET / KHIẾU NẠI (27/09/2026) ═══
     *
     * Vì sao có: Protogon phạt TỰ ĐỘNG ở 7 nơi (heat, altDetection, joinGate,
     * antinuke audit/externalApp/raidIntel, lệnh mod tay). Trước tính năng này
     * người bị ban không có đường nào tiếp cận lệnh `/mod unban` đã tồn tại.
     *
     * Tất cả mặc định là TẮT / rỗng: server nào chưa bật thì hành vi y như cũ.
     */
    /** Bật tính năng ticket. Mặc định false — không đụng server đang chạy. */
    ticketEnabled: v.optional(v.boolean()),
    /** Category chứa kênh ticket (dùng chung cho cả 2 loại). */
    ticketCategoryId: v.optional(v.string()),
    /** Role được coi là staff xử lý ticket. Rỗng → lấy `modRoles`. */
    ticketStaffRoleId: v.optional(v.string()),
    /** Tối đa số ticket `open` cùng lúc (chống spam kênh). */
    ticketMaxOpen: v.optional(v.number()),
    /** Giữa 2 lần mở của cùng một người (giờ). */
    ticketCooldownHours: v.optional(v.number()),
    /** Gửi DM kèm nút "Mở khiếu nại" sau khi bot/ mod ban. */
    ticketDmOnBan: v.optional(v.boolean()),
    /** Loại ticket mặc định khi gọi `/ticket` không kèm lựa chọn: support | appeal. */
    ticketDefaultKind: v.optional(v.string()),
    /**
     * Kênh dán PANEL "Mở ticket" — tin nhắn có nút để thành viên TỰ MỞ ticket
     * (không cần gõ lệnh `/ticket` và nhớ cú pháp). Rỗng = chưa chọn kênh.
     * Khác `ticketCategoryId`: đây là kênh CÔNG KHAI trước khi mở ticket.
     */
    ticketPanelChannelId: v.optional(v.string()),
    /**
     * Cờ yêu cầu bot dán panel. Dashboard bấm nút "Gửi panel" (hoặc tự đặt
     * khi bật ticket lần đầu) → bot dán xong tự xoá cờ + báo lỗi nếu hỏng.
     * Cùng khuôn với `verifySendPanel`.
     */
    ticketSendPanel: v.optional(v.boolean()),
    /** Lý do bot không dán được panel (hiện trên dashboard thay vì im lặng). */
    ticketPanelError: v.optional(v.string()),
    ticketPanelErrorAt: v.optional(v.number()),
    /**
     * Message id của panel MỞ ticket đang dán. Lần dán sau bot xoá bản cũ
     * trước — không có id này thì mỗi lần bấm "Gửi lại" lại dán thêm 1 bản,
     * kênh đầy panel trùng và người dùng bấm nhầm phiên bản cũ.
     */
    ticketPanelMessageId: v.optional(v.string()),
    // ═══ TUỲ CHỈNH trải nghiệm thành viên (tất cả rỗng = mặc định đa ngôn ngữ) ═══
    /** Tiêu đề panel mở ticket (thay cho "Cần trợ giúp?"). */
    ticketOpenPanelTitle: v.optional(v.string()),
    /**
     * Nội dung panel mở ticket — hỗ trợ placeholder {server} {open} {support}.
     * ⚠️ Tách khỏi `ticketPanelText` (dành cho panel TRONG kênh ticket): dùng
     * chung một ô khiến chủ server nhập lời dặn trong kênh ticket lại thấy nó
     * hiện ở kênh công khai cho cả server đọc.
     */
    ticketOpenPanelText: v.optional(v.string()),
    /** Màu embed panel mở, hex 6 chữ số không có # (vd 5865f2). Rỗng = mặc định. */
    ticketOpenPanelColor: v.optional(v.string()),
    /** Hiện nút "Khiếu nại" trên panel mở không (mặc định có). */
    ticketShowAppealButton: v.optional(v.boolean()),
    /** DM cho thành viên ngay khi ticket mở (kèm link kênh để quay lại). */
    ticketDmOnOpen: v.optional(v.boolean()),
    /** Lời dặn của chủ server dán ở đầu kênh ticket (tách khỏi `ticketCloseNote`). */
    ticketOpenNote: v.optional(v.string()),
    /** Lời nhắc dán trong kênh ticket (chủ server tuỳ biến). */
    ticketCloseNote: v.optional(v.string()),
    /**
     * Giờ không ai chat trong kênh ticket thì bot tự đóng. Chủ server chọn;
     * mặc định 24, trần 720 (30 ngày). 0 = tắt hẳn (không tự đóng).
     */
    ticketIdleHours: v.optional(v.number()),
    /**
     * Sau khi đóng tay, giữ kênh thêm bao nhiêu giờ rồi mới xoá.
     * Mặc định 24. Transcript được lưu vào storage TRƯỚC khi xoá kênh.
     */
    ticketCloseGraceHours: v.optional(v.number()),
    /**
     * Nội dung panel gửi vào kênh ticket (chủ server tuỳ biến). Hỗ trợ
     * placeholder {user}, {number}, {kind}. Rỗng → dùng bản mặc định theo
     * ngôn ngữ của người mở.
     */
    ticketPanelText: v.optional(v.string()),
    /**
     * Role được tag trong panel khi mở ticket (rỗng = không tag ai).
     * Danh sách id, tối đa 3 — tag nhiều làm loạn kênh khác.
     */
    ticketPingRoleIds: v.optional(v.array(v.string())),

    /* ═══ MẪU KÊNH TICKET (29/09/2026) ═══
     *
     * Trước đây mọi kênh ticket sinh ra GIỐNG NHAU: tên `ticket-<tên>-<số>`,
     * chỉ staff + người mở nhìn thấy, không slowmode, không giới hạn tin. Chủ
     * server lớn không có cách nào vừa cho thành viên tự xem vừa vẫn giữ
     * kín đáo — 5 field dưới đây mở ra đúng chỗ đó. */
    /**
     * Mẫu tên kênh. Hỗ trợ {number} {user} {kind}. Rỗng → `ticket-<tên>-<số>`
     * (đúng hành vi cũ). Chủ server soạn text này nên nó phải đi qua
     * `ticketCore.buildChannelNameFromTemplate` — hàm đó bỏ dấu + chống ký tự lạ.
     */
    ticketChannelTemplate: v.optional(v.string()),
    /**
     * Kênh có cho @everyone nhìn thấy không.
     *
     * `false` (mặc định) = chỉ staff + người mở. Ticket khiếu nại nhạy cảm,
     * ai cũng đọc được thì người dùng không dám kêu. `true` dành cho server
     * muốn ticket công khai kiểu diễn đàn hỏi đáp.
     */
    ticketChannelPublic: v.optional(v.boolean()),
    /** Slowmode kênh ticket (giây, 0–21600). 0 = tắt. */
    ticketSlowmodeSec: v.optional(v.number()),
    /**
     * Ngân sách tin nhắn mỗi kênh ticket; vượt thì bot tự đóng — chặn 1
     * thành viên spam 1 kênh rồi bỏ mặc. 0 = không giới hạn (mặc định).
     */
    ticketMessageBudget: v.optional(v.number()),
    /**
     * Tạo category CON theo từng loại ticket, đặt trong category cha
     * `ticketCategoryId`. Tắt (mặc định) thì tạo kênh thẳng dưới category
     * cha như trước.
     */
    ticketCategoryPerKind: v.optional(v.boolean()),
    /**
     * Mốc LẦN CUỐI dashboard ghi cấu hình (updateSettings). Khác `updatedAt` —
     * `updatedAt` bị chính bot bump mỗi lượt sync/heartbeat nên không dùng làm tín
     * hiệu "cấu hình vừa đổi" được. Vòng tick của bot đọc field này để xoá cache
     * config của đúng guild vừa sửa: không có nó thì thay đổi từ dashboard phải
     * chờ hết TTL cache (30 phút) mới tới bot, trong khi giao diện hứa "khoảng 3
     * phút" — người dùng tưởng tính năng hỏng (bug thật 23/09, welcome/goodbye).
     */
    settingsChangedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_discordId", ["discordId"])
    .index("by_botInGuild", ["botInGuild"]),

  reactionRolePanels: defineTable({
    guildId: v.string(),
    channelId: v.string(),
    label: v.string(),
    /** Nội dung / mô tả hiển thị trong embed (mặc định nếu bỏ trống). */
    description: v.optional(v.string()),
    /** Ảnh thumbnail hiển thị góc phải embed. */
    thumbnailUrl: v.optional(v.string()),
    entries: v.array(v.object({ emoji: v.string(), roleId: v.string() })),
    messageId: v.optional(v.string()),
    /** Lỗi gửi panel gần nhất (bot báo lại — web hiển thị thay vì im lặng). */
    postError: v.optional(v.string()),
    postErrorAt: v.optional(v.number()),
    enabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_guildId", ["guildId"])
    .index("by_guildId_posted", ["guildId", "messageId"])
    .index("by_enabled", ["enabled"]),

  giveaways: defineTable({
    guildId: v.string(),
    channelId: v.string(),
    title: v.string(),
    prize: v.string(),
    winnerCount: v.number(),
    durationMinutes: v.number(),
    endsAt: v.number(),
    dmWinners: v.boolean(),
    requiredRoleId: v.optional(v.string()),
    /** Role tự cấp cho người thắng khi giveaway kết thúc. */
    prizeRoleId: v.optional(v.string()),
    /** Mẫu tin nhắn: default | luxury | vip | simple. */
    template: v.optional(v.string()),
    /** Lời dẫn / nội dung tùy chỉnh thay cho mẫu. */
    message: v.optional(v.string()),
    /** Ảnh nền chèn vào embed. */
    imageUrl: v.optional(v.string()),
    /** Lời chúc mừng tùy chỉnh khi kết thúc. */
    endMessage: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("ended"), v.literal("cancelled")),
    messageId: v.optional(v.string()),
    /** Lỗi gửi/kết thúc giveaway gần nhất (bot báo lại — web hiển thị thay vì im lặng). */
    postError: v.optional(v.string()),
    postErrorAt: v.optional(v.number()),
    endError: v.optional(v.string()),
    endErrorAt: v.optional(v.number()),
    entries: v.array(v.object({ userId: v.string(), username: v.string() })),
    winners: v.array(v.object({ userId: v.string(), username: v.string() })),
    createdAt: v.number(),
  })
    .index("by_guildId", ["guildId"])
    .index("by_guildId_endsAt", ["guildId", "endsAt"])
    .index("by_status", ["status"]),

  autoReplies: defineTable({
    guildId: v.string(),
    name: v.string(),
    triggerType: v.union(v.literal("keyword"), v.literal("mention")),
    keywords: v.array(v.string()),
    response: v.string(),
    channels: v.array(v.string()),
    cooldownSeconds: v.number(),
    enabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_guildId", ["guildId"])
    .index("by_guildId_name", ["guildId", "name"]),

  antinukeModules: defineTable({
    guildId: v.string(),
    module: v.string(),
    enabled: v.boolean(),
    threshold: v.number(),
    windowSeconds: v.number(),
    punish: v.union(v.literal("warn"), v.literal("kick"), v.literal("ban"), v.literal("timeout")),
    /** Hành động kết hợp: warn/kick/ban/timeout + deleteMessages/purgeMessages. */
    actions: v.optional(v.array(v.string())),
    timeoutSeconds: v.optional(v.number()),
    whitelistRoles: v.array(v.string()),
    heat: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_guildId", ["guildId"])
    .index("by_guild_module", ["guildId", "module"]),

  heatStates: defineTable({
    guildId: v.string(),
    userId: v.string(),
    username: v.string(),
    heat: v.number(),
    updatedAt: v.number(),
    warnStrikes: v.optional(v.number()),
  })
    .index("by_guildId", ["guildId"])
    .index("by_guildId_userId", ["guildId", "userId"])
    .index("by_guildId_heat", ["guildId", "heat"]),

  /**
   * Lệnh `/lock` của chủ server — kênh đang bị khoá chat.
   *
   * Vì sao bảng này tồn tại (và không chỉ set quyền rồi quên): khoá là
   * thao tác GHI ĐÈ quyền của role trên kênh. Nếu không lưu quyền CŨ thì lúc
   * mở khoá chỉ có 2 lựa chọn — reset về `null` (xoá sạch override chủ server
   * tự đặt) hoặc giữ nguyên (kênh kẹt vĩnh viễn). Lưu `prev` là cách duy
   * nhất mở khoá mà KHÔNG phá cấu hình người dùng.
   *
   * `roleId`: snowflake của role bị khoá; với @everyone thì lưu chính id
   * @everyone của server — để một bản ghi luôn tự mô tả trọn vẹn, không
   * phải suy ra từ "roleId rỗng".
   *
   * `by_due` chỉ chứa bản ghi CÓ `until` (khoá có hạn) → truy vấn kênh đã
   * hết hạn là `lte("until", now)`, và khoá vô hạn (thiếu `until`) không
   * bao giờ lọt vào — đúng ý nghĩa "không tự mở".
   */
  channelLocks: defineTable({
    guildId: v.string(),
    channelId: v.string(),
    roleId: v.string(),
    /** "text" = chặn SendMessages · "voice" = chặn Connect. */
    kind: v.union(v.literal("text"), v.literal("voice")),
    /**
     * Quyền TRƯỚC khi khoá. `null` = role chưa có override này (kế thừa từ
     * trên) — phải phân biệt `null` với `false`, nếu không mở khoá sẽ mở
     * nhầm kênh vốn đã bị chủ server cấm.
     */
    prev: v.union(v.boolean(), v.null()),
    /** ms. THIẾU = khoá vô hạn (tự mở tay bằng `/lock remove`). */
    until: v.optional(v.number()),
    reason: v.optional(v.string()),
    lockedBy: v.optional(v.string()),
    lockedAt: v.number(),
  })
    .index("by_guildId", ["guildId"])
    .index("by_guildId_channelId_roleId", ["guildId", "channelId", "roleId"])
    .index("by_due", ["until"]),

  guildChannels: defineTable({
    guildId: v.string(),
    channelId: v.string(),
    name: v.string(),
    type: v.number(),
  })
    .index("by_guildId", ["guildId"])
    .index("by_guildId_channelId", ["guildId", "channelId"]),

  guildRoles: defineTable({
    guildId: v.string(),
    roleId: v.string(),
    name: v.string(),
    color: v.number(),
    position: v.number(),
  })
    .index("by_guildId", ["guildId"])
    .index("by_guildId_roleId", ["guildId", "roleId"]),

  /**
   * Emoji tuỳ chỉnh của server (bot đồng bộ định kỳ) — dashboard hiển thị picker
   * để chèn thẳng `<:ten:id>` / `<a:ten:id>` vào tin nhắn welcome/goodbye.
   * Chỉ là bản sao để hiển thị: bot luôn gửi MÃ emoji, không phải ảnh, nên emoji
   * xoá sau đó chỉ khiến tin nhắn hiện `:ten:` — không vỡ gì.
   */
  guildEmojis: defineTable({
    guildId: v.string(),
    emojiId: v.string(),
    name: v.string(),
    animated: v.boolean(),
  })
    .index("by_guildId", ["guildId"])
    .index("by_guildId_emojiId", ["guildId", "emojiId"]),

  modActions: defineTable({
    guildId: v.string(),
    action: v.string(),
    targetId: v.optional(v.string()),
    targetName: v.optional(v.string()),
    executorId: v.optional(v.string()),
    executorName: v.optional(v.string()),
    reason: v.optional(v.string()),
    details: v.optional(v.string()),
    /** Số case tăng dần của server (kiểu Carl-bot). */
    caseNumber: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_guildId", ["guildId"])
    .index("by_guildId_createdAt", ["guildId", "createdAt"]),

  guildBackups: defineTable({
    guildId: v.string(),
    guildName: v.string(),
    /** JSON cấu trúc server: roles (tên/màu/quyền) + channels (kênh/quyền kênh) + tin nhắn. */
    backupJson: v.string(),
    roleCount: v.number(),
    channelCount: v.number(),
    /** Số emoji đã backup (khôi phục lại được khi restore). */
    emojiCount: v.optional(v.number()),
    /** Số sticker đã backup (khôi phục lại được khi restore). */
    stickerCount: v.optional(v.number()),
    /** Số tin nhắn đã backup (0 = không kèm tin). */
    messageCount: v.optional(v.number()),
    /**
     * Số dòng bản đồ thành viên ↔ vai trò đã backup (P2). 0 = bản backup cũ,
     * hoặc lúc chụp bot không đọc được danh sách thành viên — phải phân biệt
     * hai trường hợp nên thêm `memberRolesTruncated` bên dưới.
     */
    memberCount: v.optional(v.number()),
    /**
     * true = bản đồ vai trò bị CẮT vì vượt trần số thành viên. Cắt bớt mà
     * không có cờ này thì chủ server tưởng đã lưu đủ vai trò.
     */
    memberRolesTruncated: v.optional(v.boolean()),
    /** Nguồn backup: "backup" (bot tự chụp) | "import" (tải file .msc/.json lên) | "clone" (sao chép từ server khác). */
    source: v.optional(v.string()),
    /** SHA-256 checksum của backup JSON (dùng cho incremental backup + xác minh). */
    backupChecksum: v.optional(v.string()),
    /** Checksum "ổn định" của snapshot (không gồm timestamps/media) — so khớp incremental để bỏ qua backup không đổi. */
    backupSnapshotChecksum: v.optional(v.string()),
    /** Có nén zlib không (true = compressed JSON). */
    backupCompressed: v.optional(v.boolean()),
    /** Có mã hóa AES-256-GCM không. */
    backupEncrypted: v.optional(v.boolean()),
    /**
     * Số CHUNK của backupJson khi nó quá trần 1 MB của Convex. Khi > 0 thì
     * backupJson chỉ chứa ký hiệu `chunked:<số>`, phần thật nằm ở bảng
     * backupChunks — mỗi chunk một document riêng nên không vượt trần.
     */
    backupChunkCount: v.optional(v.number()),
    /** ID backup trước đó (dùng cho diff). */
    previousBackupId: v.optional(v.string()),
    /**
     * Mã khôi phục (capability) của RIÊNG bản backup này — 130 bit ngẫu nhiên,
     * sinh 1 lần lúc lưu. Đây là đường cứu hộ khi chủ server ĐÃ MẤT quyền với
     * server gốc (server bị nuke/kick, hoặc xoá server cũ dựng server mới):
     * chỉ cần dán mã này vào trang "Tra cứu backup" là khôi phục được vào bất kỳ
     * server nào mình quản lý.
     *
     * Vì sao KHÔNG dùng luôn `_id` của Convex làm mã: tra cứu theo id nội bộ
     * buộc phải phát tán id (ảnh chụp màn hình, log, lỗi) và id đó là thứ ta
     * không muốn lộ. Mã riêng 130 bit không đoán được, chủ server xoay được
     * bằng cách xoá bản backup cũ, và tra cứu KHÔNG trả về `guildId` nên biết
     * mã cũng không lộ id server gốc.
     */
    restoreKey: v.optional(v.string()),
    /** URL gist GitHub nếu backup đã được đẩy lên đám mây. */
    githubUrl: v.optional(v.string()),
    pushedToGithub: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_guildId", ["guildId"])
    .index("by_guildId_createdAt", ["guildId", "createdAt"])
    .index("by_restoreKey", ["restoreKey"]),

  /**
   * Backup quá trần 1 MB/doc của Convex được tách nhiều document. Payload đã
   * nén zlib + base64 nên thuần ASCII → cắt theo ký tự là an toàn (không có
   * nguy cơ cắt giữa ký tự UTF-8 như JSON thô).
   */
  backupChunks: defineTable({
    guildId: v.string(),
    /** Bản backup cha — xoá bản cha thì phải xoá luôn chunk của nó. */
    backupId: v.id("guildBackups"),
    /** Thứ tự 0..total-1; ghép lại bằng cách sắp theo index. */
    index: v.number(),
    data: v.string(),
    createdAt: v.number(),
  })
    .index("by_backupId", ["backupId"])
    .index("by_guildId", ["guildId"]),

  antinukeEvents: defineTable({
    guildId: v.string(),
    module: v.string(),
    executorId: v.optional(v.string()),
    executorName: v.optional(v.string()),
    executorNameLower: v.optional(v.string()),
    action: v.string(),
    count: v.number(),
    windowSeconds: v.number(),
    threshold: v.number(),
    punish: v.string(),
    createdAt: v.number(),
  })
    .index("by_guildId", ["guildId"])
    .index("by_guildId_createdAt", ["guildId", "createdAt"])
    .index("by_createdAt", ["createdAt"]),

  /**
   * Raid Intel — dữ liệu huấn luyện bot + AI: mỗi vụ raid/nuke được xử lý
   * ghi lại một mẫu có cấu trúc (module, ngưỡng, cụm tài khoản, AI verdict,
   * kết quả săn nguồn cơn raid). Bot dùng để tự học nhận diện biến thể mới.
   */
  /**
   * Threat Relay — chữ ký raid chia sẻ GIỮA CÁC SERVER (opt-in, ẩn danh).
   * Xem convex/relay.ts — TTL 24h, rate-limit 10/guild nguồn/phút, weight chống
   * đầu độc, KHÔNG lưu guildId gốc (chỉ hash 1 chiều).
   */
  relaySignatures: defineTable({
    /** Loại: spam-text | bot-name | invite-code | app-name. */
    kind: v.string(),
    /** Nội dung đã chuẩn hóa (≤60 ký tự, không mention/điều khiển). */
    value: v.string(),
    /** Số lần thấy (tăng khi dedupe) — ≥2 = ít nhất 2 nguồn cùng xác nhận. */
    weight: v.optional(v.number()),
    /** Hash 1 chiều của guild nguồn (không truy ngược được). */
    sourceHash: v.string(),
    sourceHashes: v.optional(v.array(v.string())),
    createdAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_kind_value", ["kind", "value"])
    .index("by_source_createdAt", ["sourceHash", "createdAt"])
    // Dùng cho lọc TTL (relayStatus / botGetRelaySignatures / botCleanupRelay đều
    // chỉ cần signature còn hạn theo createdAt) — trước đây 3 đường này full scan
    // toàn bảng, bảng càng đông server (mỗi nguồn ≤10 signature/phút) càng đắt.
    .index("by_createdAt", ["createdAt"]),

  raidSamples: defineTable({
    guildId: v.string(),
    guildName: v.optional(v.string()),
    /** Module chính kích hoạt (massJoin, massBan, spam…). */
    module: v.string(),
    count: v.number(),
    windowSeconds: v.number(),
    threshold: v.number(),
    action: v.optional(v.string()),
    punish: v.optional(v.string()),
    /** AI Guard: classification (raid/individual/benign) + độ tin cậy + lý do. */
    aiClassification: v.optional(v.string()),
    aiConfidence: v.optional(v.number()),
    aiReason: v.optional(v.string()),
    lockdownTriggered: v.optional(v.boolean()),
    punishedCount: v.optional(v.number()),
    /** Hồ sơ cụm tài khoản trong vụ raid (dùng để huấn luyện nhận diện nguồn cơn). */
    clusterMemberCount: v.optional(v.number()),
    clusterAvgAccountAgeDays: v.optional(v.number()),
    clusterSharedAvatarCount: v.optional(v.number()),
    clusterJoinBurstSeconds: v.optional(v.number()),
    /** External App Guard: danh sách app được kết nối trong vụ (tên app + người kết nối). */
    apps: v.optional(
      v.array(
        v.object({
          appName: v.optional(v.string()),
          executorName: v.optional(v.string()),
          executorId: v.optional(v.string()),
        }),
      ),
    ),
    /** External App Guard: người dùng đã bị xử lý trong vụ (ban/kick/warn…). */
    punished: v.optional(
      v.array(
        v.object({
          userId: v.optional(v.string()),
          username: v.optional(v.string()),
          action: v.optional(v.string()),
        }),
      ),
    ),
    /** Kết quả săn lùng nguồn cơn raid. */
    sourceHunt: v.optional(
      v.object({
        suspectedSourceId: v.optional(v.string()),
        suspectedSourceName: v.optional(v.string()),
        reason: v.string(),
        banned: v.boolean(),
        confidence: v.number(),
      }),
    ),
    createdAt: v.number(),
  })
    .index("by_guildId", ["guildId"])
    .index("by_guildId_createdAt", ["guildId", "createdAt"])
    .index("by_createdAt", ["createdAt"]),

  botStatus: defineTable({
    kind: v.literal("status"),
    online: v.boolean(),
    guildCount: v.number(),
    memberCount: v.number(),
    lastHeartbeat: v.number(),
    startedAt: v.number(),
    version: v.string(),
    /** Discord ID của admin sở hữu bot (người duy nhất được phép mở khóa tính năng ẩn). */
    ownerDiscordId: v.optional(v.string()),
    /** Avatar bot hiển thị trên web (logo, quản lý…). */
    botAvatarUrl: v.optional(v.string()),
    /** Avatar trợ lý AI Haimiya-senpai hiển thị trên web. */
    haimiyaAvatarUrl: v.optional(v.string()),
    /** Mật khẩu mở khóa TÍNH NĂNG ẨN — TOÀN CỤC (một mật khẩu cho mọi server),
     *  salt không kèm guildId: cổng phải giống nhau ở mọi dashboard, không chỉ
     *  ở server nơi chủ bot đặt mật khẩu. */
    hiddenPasswordHash: v.optional(v.string()),
    /** Chống dò mật khẩu ẩn — bộ đếm toàn cục (5 lần sai / 10 phút). */
    hiddenVerifyFails: v.optional(v.number()),
    hiddenVerifyLastAt: v.optional(v.number()),
    /** Tên chủ bot (bot tự lấy từ Discord mỗi lần sync — cập nhật 24/7). */
    ownerName: v.optional(v.string()),
    /** Avatar chủ bot (bot tự lấy từ Discord mỗi lần sync — cập nhật 24/7). */
    ownerAvatarUrl: v.optional(v.string()),
    /**
     * Khả năng VẼ THẺ ảnh chào của máy chủ bot (v3): thư viện canvas + font nhúng.
     * Bot báo 1 lần lúc khởi động qua `status:reportCardCapability`.
     * `undefined` = bot chưa báo (bản cũ) — dashboard KHÔNG được coi là hỏng.
     */
    cardReady: v.optional(v.boolean()),
    /**
     * Canh sức khoẻ MÁY CHỦ bot (đĩa/bộ nhớ) — bot tự đo mỗi 5 phút.
     * Vì sao có: sự cố 25/09/2026 đĩa đầu làm hệ thống file rơi
     * `emergency_ro`, bot chết cả buổi mà KHÔNG có tín hiệu nào trước đó.
     * `undefined` = bot bản cũ chưa báo — KHÔNG được coi là hỏng.
     */
    hostHealth: v.optional(
      v.object({
        level: v.union(v.literal("ok"), v.literal("warn"), v.literal("critical")),
        /** % đĩa đã dùng; undefined = không đo được (đừng coi là 0). */
        diskUsedPct: v.optional(v.number()),
        diskFreeGb: v.optional(v.number()),
        rssMb: v.number(),
        uptimeHours: v.number(),
        /**
         * Vòng đời gateway Discord (bot → Discord). Tiến trình còn sống nhưng
         * gateway rớt = bot không nhận sự kiện nào — `false` mới là bất thường,
         * `undefined` = bot bản cũ chưa báo (đừng coi là mất kết nối).
         */
        gatewayConnected: v.optional(v.boolean()),
        gatewayDisconnectedMs: v.optional(v.number()),
        gatewayDisconnects: v.optional(v.number()),
        reportedAt: v.number(),
      }),
    ),
    cardUnavailableReason: v.optional(v.string()),
    /** Threat Intel: bật hệ thống tự nghiên cứu raid/nuke từ nguồn mở (owner bật/tắt). */
    threatResearchEnabled: v.optional(v.boolean()),
    /** Threat Intel: cho phép AI tổng hợp MỖI TUẦN 1 lần (~8-15k tokens/tháng) hay không. */
    threatResearchAiWeekly: v.optional(v.boolean()),
    /** Threat Intel: thời điểm chạy nghiên cứu gần nhất + lần kế tiếp (ms epoch). */
    threatResearchLastRunAt: v.optional(v.number()),
    threatResearchNextRunAt: v.optional(v.number()),
    /** Threat Intel: tổng số lượt chạy nghiên cứu. */
    threatResearchRuns: v.optional(v.number()),
    /** Threat Intel: nguồn đã tải ở lượt gần nhất (tên nguồn, tối đa 8). */
    threatResearchLastSources: v.optional(v.array(v.string())),
    /** Threat Intel: tóm tắt AI gần nhất (lý do học được gì — hiển thị web Admin). */
    threatResearchLastSummary: v.optional(v.string()),
    /** Threat Intel: lượt gần nhất có dùng AI hay chỉ heuristics (0 token). */
    threatResearchLastAiUsed: v.optional(v.boolean()),
    /** Threat Intel: từ khóa scam MỚI học được (hợp nhất vào wildcard regex — miễn phí dùng vĩnh viễn). */
    threatKeywords: v.optional(v.array(v.string())),
    /** Threat Intel: cụm từ scam nhiều từ học được (vd "free gift redeem"). */
    threatScamPhrases: v.optional(v.array(v.string())),
    /** Tiến độ học của lượt gần nhất: số từ khóa/cụm từ mới + nguồn tải được. */
    threatResearchLastNewKeywords: v.optional(v.number()),
    threatResearchLastNewPhrases: v.optional(v.number()),
    threatResearchLastSourceCount: v.optional(v.number()),
    /** Lỗi lượt nghiên cứu gần nhất (bot báo lại — Admin hiển thị thay vì im lặng). */
    threatResearchLastError: v.optional(v.string()),
    threatResearchLastErrorAt: v.optional(v.number()),
    /** Học thủ công: cờ yêu cầu (/research learn hoặc nút web) + thời điểm + người yêu cầu. */
    threatManualLearnRequested: v.optional(v.boolean()),
    threatManualLearnAt: v.optional(v.number()),
    threatManualLearnBy: v.optional(v.string()),
    /** Self-Diagnose: bot tự chẩn đoán lỗi runtime qua AI (Mimo/Kira) + đăng đề xuất vá vào kênh log. Owner bật/tắt trên Admin web. */
    // Threat Intel: bật/tắt GỬI THÔNG BÁO học tập vào kênh log các server.
    researchNotifyEnabled: v.optional(v.boolean()),
    // Threat Intel mở rộng: digest tuần + AI review từ khóa + thống kê engine cục bộ.
    threatDigestLast: v.optional(v.string()),
    threatDigestLastAt: v.optional(v.number()),
    threatKeywordReviewSuspects: v.optional(
      v.array(v.object({ keyword: v.string(), benignHits: v.number() })),
    ),
    threatKeywordReviewAt: v.optional(v.number()),
    threatAiReviewRequested: v.optional(v.boolean()),
    threatUrlhausDomains: v.optional(v.number()),
    threatNgramClusters: v.optional(v.number()),
    selfDiagnoseEnabled: v.optional(v.boolean()),
    /** Self-Diagnose: thời điểm chẩn đoán gần nhất (để hiển thị trên web + chống lặp). */
    selfDiagnoseLastAt: v.optional(v.number()),
    selfDiagnoseLastFingerprint: v.optional(v.string()),
    selfDiagnoseLastSeverity: v.optional(
      v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
    ),
    selfDiagnoseLastSummary: v.optional(v.string()),
    /** Self-Diagnose: số lượt chẩn đoán đã chạy (hiển thị thống kê trên web). */
    selfDiagnoseRuns: v.optional(v.number()),
    /** Chìa khóa bot (botAuth): SHA-256("protogon-bot-key::" + OWNER_SEED) — chủ bot đặt 1 lần qua Admin web. Khi có giá trị, mọi function bot-side yêu cầu botKey khớp. */
    botKeySeed: v.optional(v.string()),
    /** Lần bootstrap (tự cấp phát botKey) thành công gần nhất — chống xoay key dồn dập. */
    lastBootstrapAt: v.optional(v.number()),
    /** Lần bot gọi bootstrap gần nhất (kể cả thất bại) — chống dùng action làm relay spam Discord API. */
    lastBootstrapAttemptAt: v.optional(v.number()),
    /** Application ID của bot thật (xác minh qua Discord API lúc bootstrap). */
    botApplicationId: v.optional(v.string()),
    /** Seed cho chìa khóa chức năng (botFunc): các action nguy hiểm (OAuth exchange, AI chat) yêu cầu funcKey. */
    funcSeed: v.optional(v.string()),
    /** Sức khỏe AI (đợt 12): tổng hợp từ aiStats() của bot — gộp vào vòng sync 60s sẵn có (0 function call thêm). Chỉ owner xem qua Admin. */
    aiHealth: v.optional(
      v.object({
        available: v.boolean(),
        providers: v.array(
          v.object({
            label: v.string(),
            model: v.optional(v.string()),
            inCooldown: v.boolean(),
          }),
        ),
        verdictCacheSize: v.number(),
        callsLastMinute: v.number(),
        inFlight: v.number(),
        verdictsLastHour: v.object({
          raid: v.number(),
          individual: v.number(),
          benign: v.number(),
          offline: v.number(),
          cache: v.number(),
        }),
        misfire: v.object({
          misfires7d: v.number(),
          pending: v.number(),
        }),
        /**
         * Tiền + hạn mức ngày (đợt #2, bot/src/aiPricing.js).
         *
         * `spentUsd` CHỈ tính phần giá ĐÃ BIẾT — provider không có trong bảng
         * giá trả `known:false` và KHÔNG được gộp vào tổng (xem nguyên tắc 1
         * trong aiPricing.js). `byProvider` giữ chi tiết để chủ bot thấy tiền
         * đi đâu, không chỉ thấy một con số.
         *
         * `optional` vì bot bản cũ không có trường này — KHÔNG được coi là 0
         * (0 nghĩa là "miễn phí" và sẽ khiến chủ bot tin nhầm).
         */
        budget: v.optional(
          v.object({
            day: v.string(),
            spentUsd: v.number(),
            /** 0 = không đặt hạn mức. */
            budgetUsd: v.number(),
            overBudget: v.boolean(),
            byProvider: v.array(
              v.object({
                label: v.string(),
                calls: v.number(),
                promptTokens: v.number(),
                completionTokens: v.number(),
                usd: v.number(),
              }),
            ),
            /** Số ngày bảng giá đã cũ; null = chưa có ngày kiểm tra. */
            // null là TRẠNG THÁI HỢP LỆ (chưa nạp được bảng giá) — bot/src/aiPricing.js
            // trả null đúng lúc đó. v.optional() chỉ cho `undefined`, KHÔNG cho
            // `null` → ArgumentValidationError, botSyncGuilds chết mỗi 180s.
            // Ghi chú ngay trên nói "null = chưa có ngày kiểm tra" nhưng validator
            // lại cấm null: validator trái với tài liệu của chính nó (05/10/2026).
            pricingStaleDays: v.optional(v.nullable(v.number())),
            pricingChecked: v.optional(v.nullable(v.string())),
          }),
        ),
        reportedAt: v.number(),
      }),
    ),
  }).index("by_kind", ["kind"]),

  /**
   * Số đo toàn hệ thống bot (đẩy lên từ `bot/src/metrics.js` mỗi 5 phút).
   *
   * Vì sao có: trước đây bot không đo gì cả — không biết module nào chậm,
   * không biết AI tốn bao nhiêu tiền, không biết RAM tăng hay không. Mọi lần
   * chẩn đoán phải đoán. Bảng này là nơi DUY NHẤT giữ số đo đó phía server.
   *
   * Hai chế độ trong cùng bảng, phân biệt bằng `kind`:
   *  - "latest": đúng MỘT dòng, upsert mỗi lần đẩy → dashboard đọc nhanh,
   *    không tốn query dài.
   *  - "sample": lịch sử để VẼ ĐƯỜNG. Giữ có trần (METRICS_HISTORY_CAP) để bảng
   *    không phình vô hạn — bảng này ghi mỗi 5 phút, không dọn thì 100k dòng/năm.
   *
   * Khoá đếm được ghi sẵn theo định dạng Prometheus (`tên{nhãn="giá trị"}`) để
   * dashboard không phải hiểu cấu trúc từng loại metric — chỉ cần biết tên là
   * đủ để vẽ. Xem `snapshot()` ở bot/src/metrics.js.
   */
  botMetrics: defineTable({
    kind: v.union(v.literal("latest"), v.literal("sample")),
    /** Thời điểm bot đo (ms). Dùng làm trục thời gian và để dọn cũ. */
    at: v.number(),
    /** Counter tích luỹ từ đầu tiến trình, khoá = nhãn Prometheus đầy đủ. */
    counters: v.record(v.string(), v.number()),
    /** Gauge tại thời điểm đo (RSS, số server…). */
    gauges: v.record(v.string(), v.number()),
    /** Histogram đã gộp: chỉ count + sum cho mỗi cặp nhãn. */
    histograms: v.record(v.string(), v.number()),
  })
    .index("by_kind_at", ["kind", "at"])
    .index("by_at", ["at"]),

  /**
   * Dấu "đã xử lý" cho 1 sự cố (gom từ antinukeEvents + modActions).
   * KHÔNG lưu bản ghi sự kiện ở đây — nguồn sự thật vẫn là 2 bảng đó; bảng này
   * chỉ giữ khoá tất định của cụm + ai đã xử lý, nên bấm hai lần vẫn một dòng.
   */
  incidentMarks: defineTable({
    guildId: v.string(),
    /** `${kind}:${module}:${firstAt}` — xem convex/incidents.ts (groupIntoIncidents). */
    incidentKey: v.string(),
    resolvedAt: v.number(),
    executorId: v.optional(v.string()),
    executorName: v.optional(v.string()),
  })
    .index("by_guildId", ["guildId"])
    .index("by_guildId_key", ["guildId", "incidentKey"]),

  /** Audit log — ghi lại mọi thay đổi settings trên web. */
  auditLog: defineTable({
    guildId: v.string(),
    executorId: v.string(),
    executorName: v.optional(v.string()),
    action: v.string(),
    field: v.string(),
    oldValue: v.optional(v.string()),
    newValue: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_guildId", ["guildId"])
    .index("by_guildId_createdAt", ["guildId", "createdAt"]),

  /**
   * Webhook tùy chỉnh do bot tạo theo yêu cầu (log qua webhook): người dùng
   * chọn kênh, tên (kèm emoji động/tĩnh), avatar, màu embed, nội dung kèm và
   * loại sự kiện log. Bot thực hiện tạo/sửa/xóa trên Discord rồi báo lại.
   */
  guildWebhooks: defineTable({
    guildId: v.string(),
    /** Tên webhook (1-80 ký tự) — hỗ trợ emoji tĩnh lẫn động (<a:name:id>). */
    name: v.string(),
    channelId: v.string(),
    /** URL ảnh đại diện webhook (https). */
    avatarUrl: v.optional(v.string()),
    /** Màu embed ghi đè khi gửi log qua webhook (số 0-16777215). */
    color: v.optional(v.number()),
    /** Nội dung gửi kèm trước embed — placeholder {server} {time} {action}. */
    contentTemplate: v.optional(v.string()),
    /** Loại sự kiện nhận: "mod" (case log ban/kick/timeout/warn/purge…) | "general" (anti nuke/raid + log chung). */
    eventTypes: v.array(v.string()),
    enabled: v.boolean(),
    /** pending_create → ready → pending_update/pending_delete/error (bot xử lý). */
    status: v.union(
      v.literal("pending_create"),
      v.literal("ready"),
      v.literal("pending_update"),
      v.literal("pending_delete"),
      v.literal("error"),
    ),
    /** Web bấm "Gửi thử" → bot gửi 1 embed test rồi xóa cờ. */
    testRequested: v.optional(v.boolean()),
    /** Webhook MẶC ĐỊNH của bot (tự tạo khi set kênh log, nhận mọi log chưa có webhook tùy chỉnh khớp). */
    isDefault: v.optional(v.boolean()),
    webhookId: v.optional(v.string()),
    token: v.optional(v.string()),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_guildId", ["guildId"]),

  /** Member join records for alt detection — lưu lịch sử join + risk analysis. */
  memberJoins: defineTable({
    guildId: v.string(),
    userId: v.string(),
    username: v.string(),
    avatar: v.optional(v.string()),
    /** Discord account creation timestamp. */
    createdAt: v.number(),
    /** Discord public flags (USER_FLAGS). */
    flags: v.optional(v.number()),
    /** Thời gian bot ghi nhận join vào server. */
    joinedAt: v.number(),
    /** Điểm rủi ro tổng hợp (0-100). */
    riskScore: v.number(),
    /** Danh sách yếu tố rủi ro chi tiết. */
    riskFactors: v.array(v.string()),
    /** Số nhóm bằng chứng độc lập (0-7) — quyết định mức phạt, chống chặn nhầm. */
    strongSignals: v.optional(v.number()),
    /** IP có phải VPN/Proxy không. */
    isVPN: v.optional(v.boolean()),
    /** Quốc gia từ IP (nếu detect được). */
    ipCountry: v.optional(v.string()),
    /** Tổ chức/TISP từ IP. */
    ipOrg: v.optional(v.string()),
    /** Kết quả xử lý: kick/ban/timeout/verify/pass/warn. */
    action: v.optional(v.string()),
    /** Lý do xử lý chi tiết. */
    actionReason: v.optional(v.string()),
    /** ID account bị nghi là alt (nếu link được). */
    linkedUserId: v.optional(v.string()),
    /** Điểm tương đồng với account đã link (0-100). */
    similarityScore: v.optional(v.number()),
    /** Lần cập nhật cuối (vd: đánh dấu đã bị phạt). */
    updatedAt: v.optional(v.number()),
  })
    .index("by_guildId", ["guildId"])
    .index("by_guildId_joinedAt", ["guildId", "joinedAt"])
    .index("by_guildId_riskScore", ["guildId", "riskScore"]),

  /**
   * researchRuns — lịch sử học tập của bot (Threat Intel). 1 row = 1 lượt nghiên
   * cứu (tự động mỗi 4h HOẶC thủ công từ lệnh /research learn / web Admin).
   * Giữ tối đa ~50 row mới nhất (mutation tự dọn cũ) — bảng luôn nhỏ, reads rẻ.
   */
  researchRuns: defineTable({
    /** "auto" (định kỳ 4h) | "manual" (/research learn hoặc nút web). */
    trigger: v.string(),
    /** Nguồn đã tải thành công (reddit-*, cisa-kev, raid-incidents…). */
    sources: v.array(v.string()),
    /** Số từ khóa / cụm từ MỚI học được trong lượt này. */
    newKeywords: v.number(),
    newPhrases: v.number(),
    /** AI có tổng hợp trong lượt này không (tốn token Kira/Mimo). */
    aiUsed: v.boolean(),
    /** Tóm tắt xu hướng AI (nếu có). */
    summary: v.optional(v.string()),
    /** Tổng số từ khóa bot đang nhớ sau lượt này (tiến độ ghi nhớ). */
    totalKeywords: v.number(),
    totalPhrases: v.number(),
    /** Số từ khóa học từ raid thật (ambient learning). */
    learnedFromIncidents: v.optional(v.number()),
    /** Người yêu cầu học thủ công (username Discord) — null khi tự động. */
    requestedBy: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"]),

  /**
   * ═══ TICKET / KHIẾU NẠI (27/09/2026) ═══
   *
   * Mỗi hàng = 1 kênh ticket Discord. Cả 2 loại (khiếu nại hình phạt và hỗ trợ
   * chung) dùng chung bảng này, phân biệt bằng `kind`.
   *
   * ⚠️ KHÔNG lưu transcript tin nhắn ở MVP. Mỗi kênh có thể vài trăm tin,
   * vài trăm ticket là vài MB không cần thiết; `bot/src/backupUtils.js` đã có
   * kinh nghiệm xử lý khối tin lớn. Nếu sau này cần thì lưu vào storage
   * (xem `guildBackups.importStorageId`).
   */
  tickets: defineTable({
    guildId: v.string(),
    /** Số thứ tự tăng dần của server (dùng chung bộ đếm với mod case). */
    number: v.optional(v.number()),
    /** Kênh ticket trên Discord — luôn có, kể cả khi mở từ điểm vào DM. */
    channelId: v.string(),
    /** "appeal" (khiếu nại hình phạt) | "support" (hỏi đáp / báo cáo chung). */
    kind: v.string(),
    openerId: v.string(),
    /** Username tại lúc mở — hiển thị được sau khi người đó rời server. */
    openerName: v.string(),
    /** Nội dung người dùng viết (đã escape mention, đã cắt 1000 ký tự). */
    body: v.optional(v.string()),
    /** Bằng chứng / tên người bị cho là có (tùy chọn, đã cắt 500 ký tự). */
    evidence: v.optional(v.string()),
    /**
     * Ô nhập BỔ SUNG do chủ server tự thêm cho loại ticket này (29/09/2026).
     *
     * Vì sao lưu kèm nhãn chứ không chỉ giá trị: embed trong kênh ticket và
     * transcript sau này phải hiện đúng tiêu đề ô ("Số tiền: 250.000đ").
     * Chỉ lưu giá trị thì 3 tháng sau không ai nhớ ô đó hỏi cái gì.
     */
    fields: v.optional(
      v.array(
        v.object({
          label: v.string(),
          value: v.string(),
        }),
      ),
    ),
    /** "dm" (nút trong DM sau ban) | "command" (lệnh /ticket trong server). */
    source: v.string(),
    /** open → closed (staff bấm Đóng) → locked (tự động, đợt sau). */
    status: v.union(v.literal("open"), v.literal("closed"), v.literal("locked")),
    /**
     * Staff đã nhận ticket (nút "Nhận việc"). CHỈ 1 người: người sau bấm bị từ
     * chối. Tránh 3 mod trả lời trùng nội dung.
     */
    claimedById: v.optional(v.string()),
    claimedByName: v.optional(v.string()),
    claimedAt: v.optional(v.number()),
    /**
     * Số tin nhắn của thành viên đã gửi trong kênh này.
     *
     * Cơ sở cho `ticketMessageBudget`: vượt ngân sách thì bot tự đóng —
     * đây là cách chặn 1 người spam 1 kênh rồi bỏ mặc, đối lập với
     * `ticketIdleHours` (đồng hồ im lặng, không có người thì kênh vẫn treo).
     * Tin của bot không tính.
     */
    messageCount: v.optional(v.number()),
    /**
     * Lần cuối có ai chat trong kênh (mọi tin nhắn, kể cả của bot trừ chính
     * nó). Bot tự đóng khi `now - lastActivityAt > idleHours`. null = chưa
     * có hoạt động nào (mới mở → coi như vừa hoạt động ở createdAt).
     */
    lastActivityAt: v.optional(v.number()),
    /** Số giờ còn lại được báo cho người mở khi ticket đóng tay. */
    deleteAfter: v.optional(v.number()),
    /**
     * id file transcript trong Convex storage — bot lưu TRƯỚC khi xoá kênh.
     * Không có id này thì không xoá (mất transcript là mất bằng chứng).
     */
    transcriptStorageId: v.optional(v.string()),
    /** Transcript đã lưu thành công trước khi kênh bị xoá. */
    transcriptAt: v.optional(v.number()),
    closedById: v.optional(v.string()),
    closedByName: v.optional(v.string()),
    closeReason: v.optional(v.string()),
    /**
     * true nếu staff bấm "Gỡ ban" ngay trong ticket. Đây là đầu vào cho vòng
     * đo phạt nhầm `bot/src/misfire.js` — hành động gỡ đi qua `unbanMember`
     * nên vòng đo đã tự chạy; field này chỉ để dashboard thống kê.
     */
    unbanned: v.optional(v.boolean()),
    /**
     * Đã THU QUYỀN kênh Discord (thu quyền người mở + đổi tên `closed-*`).
     *
     * Vì sao cần: ticket đóng từ DASHBOARD chỉ đổi trạng thái trong DB, kênh
     * Discord vẫn còn tên cũ và quyền cũ. Không có mốc này thì bot không
     * biết kênh nào còn cần khoá, và job dọn (purge) chỉ chạy sau
     * closeGraceHours (mặc định 24h) rồi XOÁ thẳng — staff 24 giờ mới thấy
     * hệ quả. undefined = chưa thu quyền.
     */
    channelClosedAt: v.optional(v.number()),
    /**
     * Bot không gửi được DM khi mở ticket từ điểm vào DM (user tắt DM).
     * Dashboard hiển thị để staff gọi tay qua panel DM.
     */
    openError: v.optional(v.string()),
    openErrorAt: v.optional(v.number()),
    createdAt: v.number(),
    closedAt: v.optional(v.number()),
  })
    .index("by_guildId", ["guildId"])
    .index("by_guildId_status", ["guildId", "status"])
    // Field CUỐI là `createdAt` → `order("desc")` ở đây là lời hứa có thật,
    // khác với `by_guildId_status` (cuối là `status`, cố định sau `eq`).
    // Không có index này thì tab "Đã đóng"/"Đã lưu trữ" phải cắt 100 bản
    // ghi theo thứ tự index RỒI mới sắp xếp → ra 100 ticket CŨ nhất, ticket
    // mới biến mất khỏi dashboard (28/09/2026).
    .index("by_guildId_status_createdAt", ["guildId", "status", "createdAt"])
    .index("by_guildId_createdAt", ["guildId", "createdAt"])
    .index("by_guildId_openerId", ["guildId", "openerId"])
    /**
     * Tra ticket theo ĐÚNG kênh (mỗi kênh chỉ thuộc 1 ticket).
     *
     * Vì sao cần: `botTouchTickets` chạy MỖI tin nhắn trong kênh ticket và
     * trước đây `collect()` TOÀN BỘ ticket của guild rồi tự `.find` — server
     * 300 ticket thì mỗi tin nhắn tốn ~300 lượt đọc document (kèm `body` dài)
     * chỉ để cập nhật 1 hàng, tức I/O Convex phình theo bình phương số ticket.
     * Cùng index này còn dùng cho các lượt tra 1 ticket khi staff bấm nút.
     */
    .index("by_guildId_channelId", ["guildId", "channelId"]),

  /**
   * ═══ LOẠI TICKET TUỲ CHỈNH (29/09/2026) ═══
   *
   * Trước đây bot chỉ có ĐÚNG 2 loại cứng `support` | `appeal` (ràng buộc ở
   * `bot/src/ticketCore.js:normalizeKind`). Bảng này thay 2 giá trị cứng đó
   * bằng danh sách chủ server tự định nghĩa — mỗi loại có nhãn, emoji, màu
   * nút, câu hỏi riêng trong modal và role xử lý riêng.
   *
   * ⚠️ TƯƠNG THÍCH NGƯỢC: server CHƯA có dòng nào thì bot dùng đúng 2 loại cũ
   * (xem `DEFAULT_TICKET_KINDS` trong ticketCore.js) — không migration, không
   * đụng hành vi server đang chạy. `kind` trong bảng `tickets` giờ mang giá
   * trị `key` của bảng này (vẫn nhận `support`/`appeal` như cũ).
   */
  ticketKinds: defineTable({
    guildId: v.string(),
    /** Khoá ngắn, duy nhất trong server — nằm trong customId nút. */
    key: v.string(),
    /** Chữ trên nút (tối đa 80 ký tự — trần của Discord). */
    label: v.string(),
    /** Mô tả ngắn dưới nút / trong modal. */
    description: v.optional(v.string()),
    /** Emoji: ký tự Unicode hoặc `<:ten:id>` / `<a:ten:id>`. */
    emoji: v.optional(v.string()),
    /** Màu nút dạng `#rrggbb` — rác thì bot dùng màu mặc định. */
    color: v.optional(v.string()),
    /** Nhãn ô "nội dung" trong modal (tối đa 45 ký tự — trần Discord). */
    question: v.optional(v.string()),
    questionPlaceholder: v.optional(v.string()),
    /** Nhãn ô "bằng chứng" trong modal. */
    evidenceQuestion: v.optional(v.string()),
    /**
     * Ô nhập BỔ SUNG của riêng loại này (phương án B — 29/09/2026).
     *
     * Ô "nội dung" và "bằng chứng" đã có sẵn ở 2 field phẳng nên không khai
     * ở đây; mảng này chỉ chứa phần RIÊNG của từng loại — "số tiền", "link
     * đơn hàng", "bạn đã thử gì".
     *
     * Trần 3 ô: Discord chỉ nhận tối đa 5 input 1 modal, 2 ô cố định đã
     * chiếm 2 chỗ. Vượt trần là API từ chối → mất CẢ modal → mất đường mở
     * ticket cho cả server.
     */
    fields: v.optional(
      v.array(
        v.object({
          /** Khoá ô: dùng làm customId nên phải ngắn + ký tự an toàn. */
          key: v.string(),
          label: v.string(),
          placeholder: v.optional(v.string()),
          /** true = bắt buộc nhập. Mặc định false. */
          required: v.optional(v.boolean()),
          /** true = ô nhiều dòng (Paragraph) thay vì 1 dòng. */
          long: v.optional(v.boolean()),
        }),
      ),
    ),
    /**
     * Role xử lý RIÊNG cho loại này. Rỗng → dùng `ticketStaffRoleId` chung.
     * Ghi vậy để phân loại việc (kế toán riêng khác CS hỗ trợ).
     */
    staffRoleIds: v.optional(v.array(v.string())),
    /** Thứ tự hiển thị trên panel (nhỏ trước). */
    order: v.optional(v.number()),
    /** Tạm ẩn khỏi panel mà không xoá (ticket cũ vẫn tra được). */
    enabled: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_guildId", ["guildId"])
    .index("by_guildId_key", ["guildId", "key"]),
});
