/**
 * Đợt #5 tách `convex/guilds.ts` (99KB) — thân mutation `updateSettings` (nhóm
 * cấu hình lớn nhất: theme, welcome/goodbye, ticket, heat, join gate, verify…).
 *
 * Wrapper `export const updateSettings = mutation({…})` giữ NGUYÊN trong
 * `convex/guilds.ts` để tên function + validator không đổi (hợp đồng bot ⇄
 * Convex). Thân hàm nằm ở đây — chỉ tách file, không đổi hành vi.
 */
import { v } from "convex/values";
import type { ObjectType } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { clampReportMinEvents, clampReportMinIntervalMinutes } from "../reports";
import { getUserByToken, canManageGuild } from "../auth";
import { HEAT_DEFAULTS } from "../modules";
import { GREETING_IMAGE_SLOTS, storageIdFromUrl } from "./greetingImages";
import { assertWithinLimit, planForGuild } from "../plans";

/**
 * Ngôn ngữ nhãn log bot thật sự có bản dịch. Thêm ngôn ngữ ở đây thì PHẢI thêm
 * cùng lúc vào `bot/src/logI18n.js` — cổng tĩnh chặn lệch.
 */
export const LOG_LANGS = ["vi", "en", "de"] as const;

/**
 * Làm sạch field embed welcome/goodbye v2: màu phải #hex (3/4/6 ký tự), ảnh
 * phải URL http(s) hợp lệ. Giá trị rác từ dashboard bị NUÔT thay vì lưu dơ —
 * bot gửi embed sẽ lỗi nếu màu không parse được.
 */
function cleanGreetingField(field: string, val: string): string | undefined {
  const s = val.trim();
  if (!s) return undefined;
  if (field.endsWith("Color")) return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s.toLowerCase() : undefined;
  return /^https?:\/\/\S+$/.test(s) && s.length <= 2000 ? s : undefined;
}

export const updateSettingsArgs = {
  token: v.string(),
  guildId: v.string(),
  prefix: v.optional(v.string()),
  logChannelId: v.optional(v.string()),
  modLogChannelId: v.optional(v.string()),
  punishNoticeChannelId: v.optional(v.string()),
  /** Ngôn ngữ nhãn log: vi | en | de. Giá trị khác bị từ chối (xem handler). */
  logLang: v.optional(v.string()),
  punishNotice: v.optional(
    v.object({
      ban: v.string(),
      timeout: v.string(),
      kick: v.string(),
      warn: v.string(),
    }),
  ),
  whitelistUsers: v.optional(v.array(v.string())),
  whitelistRoles: v.optional(v.array(v.string())),
  modRoles: v.optional(v.array(v.string())),
  adminRoles: v.optional(v.array(v.string())),
  dailyReportEnabled: v.optional(v.boolean()),
  emergencyAlertEnabled: v.optional(v.boolean()),
  /** Phút tối thiểu giữa 2 báo cáo khẩn (1..360) — chống spam báo cáo raid. */
  reportMinIntervalMin: v.optional(v.number()),
  /** Số sự kiện nuke tối thiểu mới gửi báo cáo khẩn (1..50). */
  reportMinEvents: v.optional(v.number()),
  logPingEveryone: v.optional(v.boolean()),
  // Welcome/Goodbye — dashboard cấu hình chào thành viên mới / tạm biệt.
  welcomeEnabled: v.optional(v.boolean()),
  welcomeChannelId: v.optional(v.union(v.string(), v.null())),
  welcomeMessage: v.optional(v.union(v.string(), v.null())),
  welcomeUseEmbed: v.optional(v.boolean()),
  goodbyeEnabled: v.optional(v.boolean()),
  goodbyeChannelId: v.optional(v.union(v.string(), v.null())),
  goodbyeMessage: v.optional(v.union(v.string(), v.null())),
  goodbyeUseEmbed: v.optional(v.boolean()),
  // Welcome/Goodbye v2 — template ngẫu nhiên, DM, embed tùy chỉnh, autorole.
  welcomeRandom: v.optional(v.union(v.string(), v.null())),
  goodbyeRandom: v.optional(v.union(v.string(), v.null())),
  welcomeDmEnabled: v.optional(v.boolean()),
  welcomeDmMessage: v.optional(v.union(v.string(), v.null())),
  welcomeEmbedTitle: v.optional(v.union(v.string(), v.null())),
  welcomeEmbedColor: v.optional(v.union(v.string(), v.null())),
  welcomeEmbedImage: v.optional(v.union(v.string(), v.null())),
  welcomeEmbedThumbnail: v.optional(v.union(v.string(), v.null())),
  goodbyeEmbedTitle: v.optional(v.union(v.string(), v.null())),
  goodbyeEmbedColor: v.optional(v.union(v.string(), v.null())),
  goodbyeEmbedImage: v.optional(v.union(v.string(), v.null())),
  goodbyeEmbedThumbnail: v.optional(v.union(v.string(), v.null())),
  autoroleEnabled: v.optional(v.boolean()),
  autoroleRoleId: v.optional(v.union(v.string(), v.null())),
  autoroleDelaySec: v.optional(v.number()),
  autoroleIncludeBots: v.optional(v.boolean()),
  // Thẻ ảnh v3 — bot tự vẽ PNG theo từng thành viên.
  welcomeCardEnabled: v.optional(v.boolean()),
  welcomeCardBackground: v.optional(v.union(v.string(), v.null())),
  goodbyeCardEnabled: v.optional(v.boolean()),
  goodbyeCardBackground: v.optional(v.union(v.string(), v.null())),
  badWords: v.optional(v.array(v.string())),
  heatEnabled: v.optional(v.boolean()),
  heatDecayPerMin: v.optional(v.number()),
  heatWarnAt: v.optional(v.number()),
  heatTimeoutAt: v.optional(v.number()),
  heatKickAt: v.optional(v.number()),
  heatBanAt: v.optional(v.number()),
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
  warnStrikePunish: v.optional(v.union(v.literal("timeout"), v.literal("kick"), v.literal("ban"))),
  raidHuntEnabled: v.optional(v.boolean()),
  raidHuntBanSuspects: v.optional(v.boolean()),
  rollbackEnabled: v.optional(v.boolean()),
  theme: v.optional(v.string()),
  verifyEnabled: v.optional(v.boolean()),
  verifyMethod: v.optional(v.union(v.literal("button"), v.literal("captcha"))),
  verifyChannelId: v.optional(v.union(v.string(), v.null())),
  unverifiedRoleId: v.optional(v.union(v.string(), v.null())),
  verifiedRoleId: v.optional(v.union(v.string(), v.null())),
  verifyWelcomeEnabled: v.optional(v.boolean()),
  verifyWelcomeTitle: v.optional(v.union(v.string(), v.null())),
  verifyWelcomeDescription: v.optional(v.union(v.string(), v.null())),
  verifyWelcomeColor: v.optional(v.union(v.string(), v.null())),
  verifySendPanel: v.optional(v.boolean()),
  // ═══ TICKET / KHIẾU NẠI ═══
  ticketEnabled: v.optional(v.boolean()),
  ticketCategoryId: v.optional(v.string()),
  ticketStaffRoleId: v.optional(v.string()),
  ticketMaxOpen: v.optional(v.number()),
  ticketCooldownHours: v.optional(v.number()),
  ticketDmOnBan: v.optional(v.boolean()),
  ticketDefaultKind: v.optional(v.string()),
  ticketPanelChannelId: v.optional(v.string()),
  ticketSendPanel: v.optional(v.boolean()),
  ticketOpenPanelTitle: v.optional(v.string()),
  ticketOpenPanelText: v.optional(v.string()),
  ticketOpenPanelColor: v.optional(v.string()),
  ticketShowAppealButton: v.optional(v.boolean()),
  ticketDmOnOpen: v.optional(v.boolean()),
  ticketOpenNote: v.optional(v.string()),
  ticketCloseNote: v.optional(v.string()),
  ticketIdleHours: v.optional(v.number()),
  ticketCloseGraceHours: v.optional(v.number()),
  ticketPanelText: v.optional(v.string()),
  ticketPingRoleIds: v.optional(v.array(v.string())),
  // ── Mẫu kênh ticket (29/09/2026) ──
  ticketChannelTemplate: v.optional(v.string()),
  ticketChannelPublic: v.optional(v.boolean()),
  ticketSlowmodeSec: v.optional(v.number()),
  ticketMessageBudget: v.optional(v.number()),
  ticketCategoryPerKind: v.optional(v.boolean()),
};
export type UpdateSettingsArgs = ObjectType<typeof updateSettingsArgs>;

export async function updateSettingsHandler(ctx: MutationCtx, args: UpdateSettingsArgs) {
  const user = await getUserByToken(ctx, args.token);
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", args.guildId))
    .first();
  if (!guild || !canManageGuild(user, guild)) throw new Error("Không có quyền quản lý server này");
  // settingsChangedAt = tín hiệu riêng cho bot biết "cấu hình vừa đổi" (xem
  // schema.ts). `updatedAt` không dùng được vì chính bot bump nó mỗi lượt sync.
  const patch: Record<string, unknown> = { updatedAt: Date.now(), settingsChangedAt: Date.now() };
  if (args.theme !== undefined) {
    // Five grayscale keys are the current dashboard contract. Legacy color keys
    // remain accepted during deployment skew; the UI maps them to Graphite.
    const THEME_KEYS = [
      "graphite",
      "slate",
      "steel",
      "mist",
      "fog",
      "pink",
      "rose",
      "orange",
      "amber",
      "green",
      "teal",
      "sky",
      "violet",
    ];
    if (!THEME_KEYS.includes(args.theme)) throw new Error("Chủ đề màu không hợp lệ");
    patch.theme = args.theme;
  }
  if (args.dailyReportEnabled !== undefined) patch.dailyReportEnabled = args.dailyReportEnabled;
  if (args.emergencyAlertEnabled !== undefined)
    patch.emergencyAlertEnabled = args.emergencyAlertEnabled;
  // Hai knob chống spam báo cáo khẩn: KẸP ở server (không tin client) — số
  // ngoài biên về biên, giá trị rác (Number không hợp lệ) về mặc định.
  if (args.reportMinIntervalMin !== undefined)
    patch.reportMinIntervalMin = clampReportMinIntervalMinutes(args.reportMinIntervalMin);
  if (args.reportMinEvents !== undefined)
    patch.reportMinEvents = clampReportMinEvents(args.reportMinEvents);
  if (args.logPingEveryone !== undefined) patch.logPingEveryone = args.logPingEveryone;
  // Welcome/Goodbye: message cắt 1000 ký tự + nullable cho phép xoá nội dung.
  if (args.welcomeEnabled !== undefined) patch.welcomeEnabled = args.welcomeEnabled;
  if (args.welcomeChannelId !== undefined)
    patch.welcomeChannelId = args.welcomeChannelId ?? undefined;
  if (args.welcomeMessage !== undefined)
    patch.welcomeMessage = args.welcomeMessage ? args.welcomeMessage.slice(0, 1000) : undefined;
  if (args.welcomeUseEmbed !== undefined) patch.welcomeUseEmbed = args.welcomeUseEmbed;
  if (args.goodbyeEnabled !== undefined) patch.goodbyeEnabled = args.goodbyeEnabled;
  if (args.goodbyeChannelId !== undefined)
    patch.goodbyeChannelId = args.goodbyeChannelId ?? undefined;
  if (args.goodbyeMessage !== undefined)
    patch.goodbyeMessage = args.goodbyeMessage ? args.goodbyeMessage.slice(0, 1000) : undefined;
  if (args.goodbyeUseEmbed !== undefined) patch.goodbyeUseEmbed = args.goodbyeUseEmbed;
  // Welcome/Goodbye v2 — validate theo từng field (URL hợp lệ, màu #hex, trần 1000).
  if (args.welcomeRandom !== undefined)
    patch.welcomeRandom = args.welcomeRandom ? args.welcomeRandom.slice(0, 4000) : undefined;
  if (args.goodbyeRandom !== undefined)
    patch.goodbyeRandom = args.goodbyeRandom ? args.goodbyeRandom.slice(0, 4000) : undefined;
  if (args.welcomeDmEnabled !== undefined) patch.welcomeDmEnabled = args.welcomeDmEnabled;
  if (args.welcomeDmMessage !== undefined)
    patch.welcomeDmMessage = args.welcomeDmMessage
      ? args.welcomeDmMessage.slice(0, 1000)
      : undefined;
  if (args.welcomeEmbedTitle !== undefined)
    patch.welcomeEmbedTitle = args.welcomeEmbedTitle
      ? args.welcomeEmbedTitle.slice(0, 256)
      : undefined;
  if (args.goodbyeEmbedTitle !== undefined)
    patch.goodbyeEmbedTitle = args.goodbyeEmbedTitle
      ? args.goodbyeEmbedTitle.slice(0, 256)
      : undefined;
  for (const f of [
    "welcomeEmbedColor",
    "goodbyeEmbedColor",
    "welcomeEmbedImage",
    "goodbyeEmbedImage",
    "welcomeEmbedThumbnail",
    "goodbyeEmbedThumbnail",
  ] as const) {
    const val = args[f];
    if (val === undefined) continue;
    patch[f] = val ? cleanGreetingField(f, val) : undefined;
  }
  if (args.autoroleEnabled !== undefined) patch.autoroleEnabled = args.autoroleEnabled;
  if (args.autoroleRoleId !== undefined)
    patch.autoroleRoleId =
      args.autoroleRoleId && /^\d{15,20}$/.test(args.autoroleRoleId)
        ? args.autoroleRoleId
        : undefined;
  if (args.autoroleDelaySec !== undefined)
    patch.autoroleDelaySec = Math.max(0, Math.min(120, Math.floor(args.autoroleDelaySec || 0)));
  if (args.autoroleIncludeBots !== undefined) patch.autoroleIncludeBots = args.autoroleIncludeBots;
  // Thẻ ảnh v3: công tắc + nền (nền đi qua cùng validator URL như ảnh embed,
  // và cũng được dọn file cũ ở vòng lặp GREETING_IMAGE_SLOTS phía dưới).
  if (args.welcomeCardEnabled !== undefined) patch.welcomeCardEnabled = args.welcomeCardEnabled;
  if (args.goodbyeCardEnabled !== undefined) patch.goodbyeCardEnabled = args.goodbyeCardEnabled;
  if (args.welcomeCardBackground !== undefined)
    patch.welcomeCardBackground = args.welcomeCardBackground
      ? cleanGreetingField("welcomeCardBackground", args.welcomeCardBackground)
      : undefined;
  if (args.goodbyeCardBackground !== undefined)
    patch.goodbyeCardBackground = args.goodbyeCardBackground
      ? cleanGreetingField("goodbyeCardBackground", args.goodbyeCardBackground)
      : undefined;
  if (args.raidHuntEnabled !== undefined) patch.raidHuntEnabled = args.raidHuntEnabled;
  // ═══ TICKET ═══
  // Số cấu hình bị KẸP khoảng ở đây (giống luật của các ô số khác): giá trị
  // rác từ client không được ghi thẳng xuống DB rồi làm decideOpen rơi vào
  // NaN. `ticketCore.normalizeLimit` là lá chắn thứ hai phía bot.
  if (args.ticketEnabled !== undefined) patch.ticketEnabled = args.ticketEnabled;
  if (args.ticketCategoryId !== undefined)
    patch.ticketCategoryId = /^\d{15,20}$/.test(args.ticketCategoryId)
      ? args.ticketCategoryId
      : undefined;
  if (args.ticketStaffRoleId !== undefined)
    patch.ticketStaffRoleId = /^\d{15,20}$/.test(args.ticketStaffRoleId)
      ? args.ticketStaffRoleId
      : undefined;
  if (args.ticketMaxOpen !== undefined)
    patch.ticketMaxOpen = Math.max(1, Math.min(100, Math.floor(args.ticketMaxOpen || 0) || 20));
  if (args.ticketCooldownHours !== undefined)
    patch.ticketCooldownHours = Math.max(
      0,
      Math.min(720, Math.floor(args.ticketCooldownHours || 0) || 0),
    );
  if (args.ticketDmOnBan !== undefined) patch.ticketDmOnBan = args.ticketDmOnBan;
  if (args.ticketDefaultKind !== undefined)
    patch.ticketDefaultKind = args.ticketDefaultKind === "appeal" ? "appeal" : "support";
  // Kênh dán panel "Mở ticket" — chỉ nhận snowflake, rác thì xoá (undefined)
  // để chủ server thấy ô trống thay vì bot cố gửi vào một id không tồn tại.
  if (args.ticketPanelChannelId !== undefined)
    patch.ticketPanelChannelId = /^\d{15,20}$/.test(args.ticketPanelChannelId)
      ? args.ticketPanelChannelId
      : undefined;
  if (args.ticketSendPanel !== undefined) patch.ticketSendPanel = args.ticketSendPanel;
  // ── Tuỳ chỉnh trải nghiệm thành viên ──
  // Ô nào bị xoá trắng thì set undefined (xoá hẳn khỏi doc) để sau này bật
  // lại tính năng là mặc định mới có hiệu lực, chứ không dính giá trị cũ.
  if (args.ticketOpenPanelTitle !== undefined)
    patch.ticketOpenPanelTitle = args.ticketOpenPanelTitle.trim().slice(0, 256) || undefined;
  if (args.ticketOpenPanelText !== undefined)
    patch.ticketOpenPanelText = args.ticketOpenPanelText.trim().slice(0, 2000) || undefined;
  // Chỉ nhận hex 6 chữ số — Color cần số nguyên, chuỗi rác làm `setColor`
  // ném và cả panel không hiện (mất luôn nút mở ticket cho thành viên).
  if (args.ticketOpenPanelColor !== undefined)
    patch.ticketOpenPanelColor = /^[0-9a-fA-F]{6}$/.test(
      args.ticketOpenPanelColor.trim().replace(/^#/, ""),
    )
      ? args.ticketOpenPanelColor.trim().replace(/^#/, "").toLowerCase()
      : undefined;
  if (args.ticketShowAppealButton !== undefined)
    patch.ticketShowAppealButton = args.ticketShowAppealButton;
  if (args.ticketDmOnOpen !== undefined) patch.ticketDmOnOpen = args.ticketDmOnOpen;
  if (args.ticketOpenNote !== undefined)
    patch.ticketOpenNote = args.ticketOpenNote.trim().slice(0, 1000) || undefined;
  // Yêu cầu dán panel mới → xoá lỗi cũ (đây là lần thử lại của người dùng).
  if (args.ticketSendPanel === true) {
    patch.ticketPanelError = undefined;
    patch.ticketPanelErrorAt = undefined;
  }
  // Tự đặt cờ dán khi chủ server VỪA chọn kênh panel (và ticket đang bật):
  // đây là khoảnh khắc họ "setup xong" — bắt họ đi tìm nút bấm thứ hai thì
  // phần lớn server sẽ cứ tưởng tính năng không hoạt động. Chỉ khi giá trị
  // THỰC SỰ đổi, nếu không mỗi lần lưu cấu hình khác lại dán panel mới.
  if (
    args.ticketPanelChannelId !== undefined &&
    /^\d{15,20}$/.test(args.ticketPanelChannelId) &&
    guild.ticketPanelChannelId !== args.ticketPanelChannelId &&
    args.ticketSendPanel === undefined
  ) {
    const ticketOn = args.ticketEnabled ?? guild.ticketEnabled ?? false;
    if (ticketOn) patch.ticketSendPanel = true;
  }
  // Tự đặt cờ dán lại khi chủ server SỬA NỘI DUNG panel. Cùng lý do như chọn
  // kênh ở trên: đổi tiêu đề rồi phải tự bấm "Gửi lại panel" thì phần lớn
  // server sẽ kết luận tính năng hỏng — ô nhập đã lưu, kênh thì không đổi.
  // Đây là chi tiết của lỗi đó, nên đóng mặc định.
  //
  // Chỉ 4 field quyết định NỘI DUNG panel. ticketOpenNote và ticketDmOnOpen
  // không nằm trong panel nên không dán lại (tránh lãng phí mỗi lần sửa lỗi).
  //
  // patch.X chỉ CÓ khi đối số tương ứng được truyền vào, nên phải so đè
  // điều kiện "được truyền" — không thì sửa màu sẽ không phải là sửa tiêu đề.
  if (args.ticketSendPanel === undefined) {
    const touched = (provided: boolean, next: unknown, prev: unknown) =>
      provided && (next ?? null) !== (prev ?? null);
    const panelContentChanged =
      touched(
        args.ticketOpenPanelTitle !== undefined,
        patch.ticketOpenPanelTitle,
        guild.ticketOpenPanelTitle,
      ) ||
      touched(
        args.ticketOpenPanelText !== undefined,
        patch.ticketOpenPanelText,
        guild.ticketOpenPanelText,
      ) ||
      touched(
        args.ticketOpenPanelColor !== undefined,
        patch.ticketOpenPanelColor,
        guild.ticketOpenPanelColor,
      ) ||
      (args.ticketShowAppealButton !== undefined &&
        args.ticketShowAppealButton !== (guild.ticketShowAppealButton ?? true));
    const ticketOn = args.ticketEnabled ?? guild.ticketEnabled ?? false;
    // Chỉ dán lại khi đã có kênh panel: không có chỗ nào dán thì bật cờ là
    // vô nghĩa, bot sẽ báo lỗi cấu hình rồi xoá cờ ngay.
    const hasPanelChannel = Boolean(patch.ticketPanelChannelId ?? guild.ticketPanelChannelId);
    if (ticketOn && hasPanelChannel && panelContentChanged) patch.ticketSendPanel = true;
  }

  if (args.ticketCloseNote !== undefined)
    patch.ticketCloseNote = args.ticketCloseNote.trim().slice(0, 300) || undefined;
  // 0 = tát hấn. Trần 720 giờ (30 ngày) — quá dài thì tửn để kênh đển vứ.
  if (args.ticketIdleHours !== undefined)
    patch.ticketIdleHours = Math.max(0, Math.min(720, Math.floor(args.ticketIdleHours) || 0));
  if (args.ticketCloseGraceHours !== undefined)
    patch.ticketCloseGraceHours = Math.max(
      1,
      Math.min(720, Math.floor(args.ticketCloseGraceHours) || 24),
    );
  if (args.ticketPanelText !== undefined)
    patch.ticketPanelText = args.ticketPanelText.trim().slice(0, 1000) || undefined;
  if (args.ticketPingRoleIds !== undefined)
    // Tối đa 3 role: tag nhiều làm loạn kênh ticket khác.
    patch.ticketPingRoleIds = (args.ticketPingRoleIds ?? [])
      .filter((r) => /^\d{15,22}$/.test(String(r ?? "")))
      .slice(0, 3);

  // ── Mẫu kênh ticket (29/09/2026) ──
  // Mẫu tên do chủ server soạn → cắt theo trần tên kênh Discord (100) và
  // bỏ khoảng trắng thừa. Placeholder thiếu thì `buildChannelName` bỏ
  // qua, không ném lỗi — lỗi cấu hình không được chặn mở ticket.
  if (args.ticketChannelTemplate !== undefined)
    patch.ticketChannelTemplate = args.ticketChannelTemplate.trim().slice(0, 100) || "";
  if (args.ticketChannelPublic !== undefined)
    patch.ticketChannelPublic = !!args.ticketChannelPublic;
  // Slowmode của Discord tối đa 21600 giây (6 giờ) — vượt là API từ chối
  // lúc tạo kênh, tức mất luôn kênh ticket.
  if (args.ticketSlowmodeSec !== undefined)
    patch.ticketSlowmodeSec = Math.max(0, Math.min(21600, Math.floor(args.ticketSlowmodeSec) || 0));
  if (args.ticketMessageBudget !== undefined)
    patch.ticketMessageBudget = Math.max(
      0,
      Math.min(1000, Math.floor(args.ticketMessageBudget) || 0),
    );
  if (args.ticketCategoryPerKind !== undefined)
    patch.ticketCategoryPerKind = !!args.ticketCategoryPerKind;
  if (args.raidHuntBanSuspects !== undefined) patch.raidHuntBanSuspects = args.raidHuntBanSuspects;
  if (args.rollbackEnabled !== undefined) patch.rollbackEnabled = !!args.rollbackEnabled;
  if (args.prefix !== undefined) {
    if (!/^[!^$#&%]{1,3}$/.test(args.prefix)) {
      throw new Error("Prefix phải là 1-3 ký tự đặc biệt (ví dụ: !, ^, !! )");
    }
    patch.prefix = args.prefix;
  }
  if (args.logChannelId !== undefined) patch.logChannelId = args.logChannelId || undefined;
  if (args.modLogChannelId !== undefined) patch.modLogChannelId = args.modLogChannelId || undefined;
  if (args.punishNoticeChannelId !== undefined) {
    patch.punishNoticeChannelId = args.punishNoticeChannelId || undefined;
  }
  if (args.logLang !== undefined) {
    // Chỉ nhận ngôn ngữ bot thật sự có bản dịch cho NHÃN log. Giá trị rác thì
    // ném lỗi thay vì nuốt — nếu nuốt, dashboard hiển thị "đã lưu" nhưng log
    // vẫn tiếng Việt, tức báo sai cho người dùng.
    // Mở rộng sang string[]: đây là phép thành viên, `args.logLang` kiểu string
    // nên kiểu literal của `as const` sẽ từ chối hợp lệ.
    if (!(LOG_LANGS as readonly string[]).includes(args.logLang)) {
      throw new Error("Ngôn ngữ log không hợp lệ");
    }
    patch.logLang = args.logLang;
  }
  if (args.punishNotice !== undefined) {
    const VALID = ["none", "action", "reason", "full"];
    const next: Record<string, unknown> = {};
    for (const k of ["ban", "timeout", "kick", "warn"] as const) {
      const level = args.punishNotice[k];
      if (!VALID.includes(level)) throw new Error(`Mức thông báo không hợp lệ (${k})`);
      next[k] = level;
    }
    patch.punishNotice = next;
  }
  if (args.whitelistUsers !== undefined) {
    const ids = args.whitelistUsers
      .map((id) => id.trim())
      .filter((id) => /^\d{15,20}$/.test(id))
      .slice(0, 100);
    patch.whitelistUsers = [...new Set(ids)];
  }
  if (args.whitelistRoles !== undefined) {
    const ids = args.whitelistRoles
      .map((id) => id.trim())
      .filter((id) => /^\d{15,20}$/.test(id))
      .slice(0, 100);
    patch.whitelistRoles = [...new Set(ids)];
  }
  if (args.modRoles !== undefined) {
    // Validate: chỉ Discord snowflake ID hợp lệ, tối đa 50 — mod/admin role là
    // dữ liệu quyết định AI được miễn trừ phạt chống nuke nên phải sạch.
    patch.modRoles = [
      ...new Set(
        args.modRoles
          .map((id) => id.trim())
          .filter((id) => /^\d{15,20}$/.test(id))
          .slice(0, 50),
      ),
    ];
  }
  if (args.adminRoles !== undefined) {
    patch.adminRoles = [
      ...new Set(
        args.adminRoles
          .map((id) => id.trim())
          .filter((id) => /^\d{15,20}$/.test(id))
          .slice(0, 50),
      ),
    ];
  }
  if (args.badWords !== undefined) {
    // Hạn mức theo GÓI của server: danh sách từ khoá cấm là thứ khách cảm nhận
    // rõ nhất khi nâng gói (automod chặn được nhiều hơn hẳn).
    const { plan } = await planForGuild(ctx, args.guildId);
    assertWithinLimit(plan, "badWords", args.badWords.length);
    if (args.badWords.length > 100) throw new Error("Tối đa 100 từ ngữ xấu");
    const words = args.badWords
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length > 0 && w.length <= 40);
    patch.badWords = [...new Set(words)];
  }
  if (args.heatEnabled !== undefined) patch.heatEnabled = args.heatEnabled;
  if (args.heatDecayPerMin !== undefined) {
    patch.heatDecayPerMin = Math.max(0, Math.min(60, Math.floor(args.heatDecayPerMin)));
  }
  if (args.heatWarnAt !== undefined) {
    const w = Math.max(1, Math.min(99, Math.floor(args.heatWarnAt)));
    const t = args.heatTimeoutAt ?? guild.heatTimeoutAt ?? HEAT_DEFAULTS.timeoutAt;
    if (w >= t) throw new Error("Ngưỡng cảnh báo phải nhỏ hơn ngưỡng tạm khóa");
    patch.heatWarnAt = w;
  }
  if (
    args.heatTimeoutAt !== undefined ||
    args.heatKickAt !== undefined ||
    args.heatBanAt !== undefined
  ) {
    const t = args.heatTimeoutAt ?? guild.heatTimeoutAt ?? HEAT_DEFAULTS.timeoutAt;
    const k = args.heatKickAt ?? guild.heatKickAt ?? HEAT_DEFAULTS.kickAt;
    const b = args.heatBanAt ?? guild.heatBanAt ?? HEAT_DEFAULTS.banAt;
    const tC = Math.max(1, Math.min(100, t));
    const kC = Math.max(1, Math.min(100, k));
    const bC = Math.max(1, Math.min(100, b));
    if (!(tC < kC && kC < bC)) {
      throw new Error("Ngưỡng nhiệt phải tăng dần: tạm khóa < kick < ban");
    }
    patch.heatTimeoutAt = tC;
    patch.heatKickAt = kC;
    patch.heatBanAt = bC;
  }
  if (args.joinGateEnabled !== undefined) patch.joinGateEnabled = args.joinGateEnabled;
  if (args.joinGateMinAgeDays !== undefined) {
    patch.joinGateMinAgeDays = Math.max(0, Math.min(3650, Math.floor(args.joinGateMinAgeDays)));
  }
  if (args.joinGateRequireAvatar !== undefined)
    patch.joinGateRequireAvatar = args.joinGateRequireAvatar;
  if (args.joinGateRequireFlag !== undefined) patch.joinGateRequireFlag = args.joinGateRequireFlag;
  if (args.joinGateRaidKick !== undefined) patch.joinGateRaidKick = args.joinGateRaidKick;
  if (args.joinGatePunish !== undefined) patch.joinGatePunish = args.joinGatePunish;
  if (args.joinGateWhitelist !== undefined) {
    const ids = args.joinGateWhitelist
      .map((id) => id.trim())
      .filter((id) => /^\d{15,20}$/.test(id))
      .slice(0, 100);
    patch.joinGateWhitelist = [...new Set(ids)];
  }
  if (args.heatRepeatMultiplier !== undefined) {
    patch.heatRepeatMultiplier = Math.max(1, Math.min(10, Math.floor(args.heatRepeatMultiplier)));
  }
  if (args.heatRepeatWindowMin !== undefined) {
    patch.heatRepeatWindowMin = Math.max(1, Math.min(1440, Math.floor(args.heatRepeatWindowMin)));
  }
  if (args.warnStrikeLimit !== undefined) {
    patch.warnStrikeLimit = Math.max(0, Math.min(20, Math.floor(args.warnStrikeLimit)));
  }
  if (args.warnStrikeWindowMin !== undefined) {
    patch.warnStrikeWindowMin = Math.max(1, Math.min(1440, Math.floor(args.warnStrikeWindowMin)));
  }
  if (args.warnStrikePunish !== undefined) patch.warnStrikePunish = args.warnStrikePunish;
  if (args.verifyEnabled !== undefined) patch.verifyEnabled = args.verifyEnabled;
  if (args.verifyMethod !== undefined) patch.verifyMethod = args.verifyMethod;
  if (args.verifyChannelId !== undefined) patch.verifyChannelId = args.verifyChannelId || undefined;
  if (args.unverifiedRoleId !== undefined)
    patch.unverifiedRoleId = args.unverifiedRoleId || undefined;
  if (args.verifiedRoleId !== undefined) patch.verifiedRoleId = args.verifiedRoleId || undefined;
  if (args.verifyWelcomeEnabled !== undefined)
    patch.verifyWelcomeEnabled = args.verifyWelcomeEnabled;
  // Trần độ dài + định dạng TRÙNG luật import cấu hình (guildConfig.ts):
  // title 256 / description 1000, màu phải #hex 3–8 ký tự. Thiếu trần thì
  // client gửi chuỗi lớn làm doc phình (trần 1 MiB/document) và tick đọc lặp;
  // màu rác làm `parseInt` ra 0 — embed mất màu.
  if (args.verifyWelcomeTitle !== undefined)
    patch.verifyWelcomeTitle = args.verifyWelcomeTitle
      ? args.verifyWelcomeTitle.slice(0, 256)
      : undefined;
  if (args.verifyWelcomeDescription !== undefined)
    patch.verifyWelcomeDescription = args.verifyWelcomeDescription
      ? args.verifyWelcomeDescription.slice(0, 1000)
      : undefined;
  if (args.verifyWelcomeColor !== undefined) {
    const color = args.verifyWelcomeColor ?? "";
    patch.verifyWelcomeColor = /^#[0-9a-fA-F]{3,8}$/.test(color) ? color.toLowerCase() : undefined;
  }
  if (args.verifySendPanel !== undefined) patch.verifySendPanel = args.verifySendPanel;
  // Yêu cầu gửi panel mới → xóa lỗi cũ (đây là lần thử lại của người dùng).
  if (args.verifySendPanel === true) {
    patch.verifyPanelError = undefined;
    patch.verifyPanelErrorAt = undefined;
  }
  // Dọn ảnh Convex của các ô ảnh vừa bị XOÁ (dashboard xoá chữ trong ô) — nếu
  // không, mỗi lần đổi ảnh để lại một file rác vĩnh viễn trong storage.
  for (const f of GREETING_IMAGE_SLOTS) {
    if (!(f in patch) || patch[f]) continue;
    // Ô đang bị xoá (f) phải loại khỏi phép kiểm tra — giá trị cũ của nó vẫn
    // còn trong guild lúc này (patch chạy sau) nên every() bao gồm f sẽ luôn
    // thấy file "còn dùng" → file rác vĩnh viễn (bug thật luồng 7e).
    const otherSlots = GREETING_IMAGE_SLOTS.filter((k) => k !== f);
    const oldId = storageIdFromUrl(guild[f]);
    if (oldId && otherSlots.every((k) => storageIdFromUrl(guild[k]) !== oldId)) {
      try {
        await ctx.storage.delete(oldId as Id<"_storage">);
      } catch {
        // file đã bị xoá / không còn — bỏ qua
      }
    }
  }
  await ctx.db.patch(guild._id, patch);
  return { ok: true };
}
