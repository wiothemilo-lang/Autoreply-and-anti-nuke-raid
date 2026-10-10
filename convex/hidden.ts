import {
  mutation,
  query,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { getUserByToken, canManageGuild } from "./auth";
import { computeBotKey, requireBotKeyStrict } from "./botAuth";
import { hashHiddenPassword, hashHiddenPasswordGlobal } from "./sha256";

async function requireGuild(ctx: QueryCtx | MutationCtx, token: string, guildId: string) {
  const user = await getUserByToken(ctx, token);
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
    .first();
  if (!guild || !canManageGuild(user, guild)) throw new Error("Không có quyền quản lý server này");
  return guild;
}

/** Bot status row duy nhất (chứa ownerDiscordId + avatar tùy chỉnh). */
export async function getBotStatus(ctx: QueryCtx | MutationCtx) {
  return await ctx.db
    .query("botStatus")
    .withIndex("by_kind", (q) => q.eq("kind", "status"))
    .first();
}

/** (internal) Đọc botStatus từ action (actions không có db trực tiếp). */
export const getBotStatusInternal = internalQuery({
  args: {},
  handler: async (ctx) => getBotStatus(ctx),
});

const DISCORD_SNOWFLAKE_RE = /^\d{15,21}$/;

function canonicalBotOwnerId(
  status: { ownerDiscordId?: string } | null | undefined,
): string | null {
  const ownerDiscordId = status?.ownerDiscordId?.trim();
  return ownerDiscordId && DISCORD_SNOWFLAKE_RE.test(ownerDiscordId) ? ownerDiscordId : null;
}

export function isBotOwnerUser(
  user: { discordId: string } | null,
  status: { ownerDiscordId?: string } | null | undefined,
): boolean {
  const ownerDiscordId = canonicalBotOwnerId(status);
  return !!ownerDiscordId && ownerDiscordId === user?.discordId;
}

/** Trần số quản trị viên nhóm — đủ cho một team nhỏ, chặn danh sách phình vô hạn. */
export const MAX_TEAM_ADMINS = 20;

/**
 * Danh sách Discord ID quản trị viên nhóm đã CHUẨN HOÁ.
 *
 * Vì sao phải chuẩn hoá ở tầng đọc thay vì tin dữ liệu trong DB: đây là dữ
 * liệu quyết định AI ĐƯỢC VÀO cửa sổ Admin, nên mọi giá trị lạ (khoảng trắng,
 * chuỗi rác, ID trùng, chính chủ bot) phải bị loại ngay tại chỗ dùng — không
 * có đường nào để một dòng bẩn trong DB biến thành quyền.
 * Chủ bot luôn có quyền nên ID của chủ bot bị loại khỏi danh sách (tránh hiểu
 * nhầm rằng quyền của chủ bot phụ thuộc danh sách này).
 */
export function canonicalTeamAdminIds(
  status: { ownerDiscordId?: string; teamAdminDiscordIds?: string[] } | null | undefined,
): string[] {
  const owner = canonicalBotOwnerId(status);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of status?.teamAdminDiscordIds ?? []) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!DISCORD_SNOWFLAKE_RE.test(id) || id === owner || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_TEAM_ADMINS) break;
  }
  return out;
}

/**
 * Chủ bot HOẶC quản trị viên nhóm.
 *
 * Cổng vào CỬA SỔ ADMIN (theo dõi lỗi, sức khoẻ máy chủ, AI, threat research,
 * self-diagnose) và mặt hàng nav "Cửa sổ Admin". KHÔNG dùng cho tính năng ẩn,
 * mật khẩu ẩn hay OWNER_SEED — những thứ đó vẫn `requireBotOwner`.
 * Chưa có chủ bot (owner trống/không hợp lệ) ⇒ không ai là admin: giữ nguyên
 * tính chất "chưa khởi tạo thì cửa đóng" của requireBotOwner.
 */
export function isBotAdminUser(
  user: { discordId: string } | null,
  status: { ownerDiscordId?: string; teamAdminDiscordIds?: string[] } | null | undefined,
): boolean {
  if (!user) return false;
  if (isBotOwnerUser(user, status)) return true;
  // Chưa có chủ bot (chưa bootstrap) ⇒ cửa VẪN ĐÓNG: quyền quản trị viên nhóm
  // là quyền ĐƯỢC CHỦ BOT CẤP, không thể tồn tại trước chủ bot. Bỏ nhánh này
  // là mở cửa sổ Admin cho một danh sách mồ côi khi dữ liệu botStatus bị xoá.
  if (!canonicalBotOwnerId(status)) return false;
  return canonicalTeamAdminIds(status).includes(user.discordId);
}

/**
 * Chỉ admin SỞ HỮU bot mới được tương tác mật khẩu / tính năng ẩn.
 * (Panel reaction role, giveaway, DM, auto-reply ẩn, branding…)
 */
export async function requireBotOwner(
  ctx: QueryCtx | MutationCtx,
  user: { discordId: string } | null,
) {
  if (!user) throw new Error("Vui lòng đăng nhập");
  const status = await getBotStatus(ctx);
  if (!canonicalBotOwnerId(status)) {
    throw new Error("Chủ sở hữu bot chưa được khởi tạo hoặc không hợp lệ");
  }
  if (!isBotOwnerUser(user, status)) {
    throw new Error("Chỉ admin sở hữu bot mới được phép tương tác tính năng ẩn 🔒");
  }
  return status;
}

/**
 * Như `requireBotOwner` nhưng cho cả QUẢN TRỊ VIÊN NHÓM — dùng cho cửa sổ
 * Admin. Không dùng cho tính năng ẩn / mật khẩu / bot secret.
 */
export async function requireBotAdmin(
  ctx: QueryCtx | MutationCtx,
  user: { discordId: string } | null,
) {
  if (!user) throw new Error("Vui lòng đăng nhập");
  const status = await getBotStatus(ctx);
  if (!canonicalBotOwnerId(status)) {
    throw new Error("Chủ sở hữu bot chưa được khởi tạo hoặc không hợp lệ");
  }
  if (!isBotAdminUser(user, status)) {
    throw new Error("Chỉ chủ sở hữu bot hoặc quản trị viên nhóm mới được phép 🔒");
  }
  return status;
}

/**
 * Danh sách quản trị viên nhóm cho chủ bot quản lý (CHỈ chủ bot đọc được —
 * danh sách này nói ai đang có quyền vào cửa sổ Admin).
 *
 * Trả kèm hồ sơ từ bảng `users` khi người đó đã từng đăng nhập web; chưa
 * đăng nhập thì chỉ có ID — hiển thị "chưa từng đăng nhập" thay vì im lặng
 * (chủ bot cần biết ID đó có thật sự hoạt động không).
 */
export const getTeamAdmins = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await getUserByToken(ctx, token);
    const status = await requireBotOwner(ctx, user);
    const ids = canonicalTeamAdminIds(status);
    const members = [];
    for (const discordId of ids) {
      const row = await ctx.db
        .query("users")
        .withIndex("by_discordId", (q) => q.eq("discordId", discordId))
        .first();
      members.push({
        discordId,
        username: row?.username ?? null,
        globalName: row?.globalName ?? null,
        avatar: row?.avatar ?? null,
        lastLoginAt: row?.lastLoginAt ?? null,
      });
    }
    return { max: MAX_TEAM_ADMINS, members };
  },
});

/**
 * Đặt lại danh sách quản trị viên nhóm (CHỈ chủ bot).
 *
 * Vì sao chỉ chủ bot: đây là quyền tự nâng cấp quyền — người trong danh sách
 * không được phép thêm người khác, nếu không một tài khoản bị lộ là cả team
 * mất kiểm soát. Danh sách gửi lên được chuẩn hoá + chặn trần; giá trị không
 * phải snowflake bị TỪ CHỐI kèm lý do (không âm thầm bỏ — chủ bot phải biết
 * mình gõ sai ID nào).
 */
export const setTeamAdmins = mutation({
  args: { token: v.string(), discordIds: v.array(v.string()) },
  handler: async (ctx, { token, discordIds }) => {
    const user = await getUserByToken(ctx, token);
    const status = await requireBotOwner(ctx, user);
    const owner = canonicalBotOwnerId(status);
    const cleaned: string[] = [];
    const bad: string[] = [];
    for (const raw of discordIds) {
      const id = typeof raw === "string" ? raw.trim() : "";
      // Bỏ qua chính chủ bot: quyền của chủ bot không nằm trong danh sách này.
      if (id === owner) continue;
      if (!DISCORD_SNOWFLAKE_RE.test(id)) {
        bad.push(id || "(trống)");
        continue;
      }
      if (!cleaned.includes(id)) cleaned.push(id);
    }
    if (bad.length > 0) {
      throw new Error(
        `Discord ID không hợp lệ (phải là 15-21 chữ số): ${bad.slice(0, 5).join(", ")}`,
      );
    }
    if (cleaned.length > MAX_TEAM_ADMINS) {
      throw new Error(`Tối đa ${MAX_TEAM_ADMINS} quản trị viên nhóm`);
    }
    const statusRow = await getBotStatus(ctx);
    if (!statusRow) throw new Error("Chưa có bản ghi trạng thái bot");
    await ctx.db.patch(statusRow._id, { teamAdminDiscordIds: cleaned });
    return { ok: true, discordIds: cleaned };
  },
});

/**
 * Kết hợp: quản lý server + LÀ CHỦ SỞ HỮU BOT.
 * Tính năng ẩn (panel/giveaway/DM) phải qua cổng này — lỗ hổng cũ chỉ kiểm
 * "quản lý server" nên mod của server tự tạo được panel/giveaway/DM mà không
 * cần mở khóa tính năng ẩn.
 */
async function requireHiddenManage(ctx: QueryCtx | MutationCtx, token: string, guildId: string) {
  const user = await getUserByToken(ctx, token);
  const guild = await requireGuild(ctx, token, guildId);
  await requireBotOwner(ctx, user);
  return guild;
}

/**
 * Tạo danh sách "việc cần làm" của hidden system cho MỌI guild trong 1 lần đọc
 * (panel chưa gửi, giveaway active/chưa kết thúc, DM chờ, webhook mặc định).
 * Helper dùng chung cho getBotHiddenJobs và bot_tick:getPendingJobs — bot chỉ cần
 * 1 query duy nhất mỗi vòng quét thay vì 2 (tiết kiệm function calls free tier).
 * Bot tự lọc guild mình đang ở.
 */
export async function buildHiddenJobs(ctx: QueryCtx) {
  // TỐI ƯU (audit Convex): chỉ duyệt guild ĐANG có bot (index by_botInGuild)
  // thay vì collect() toàn bảng — guild đã rời không bao giờ có việc chờ mới.
  const guilds = await ctx.db
    .query("guilds")
    .withIndex("by_botInGuild", (q) => q.eq("botInGuild", true))
    .collect();
  const panels = await ctx.db
    .query("reactionRolePanels")
    .withIndex("by_enabled", (q) => q.eq("enabled", true))
    .collect();
  const giveaways = await ctx.db
    .query("giveaways")
    .withIndex("by_status", (q) => q.eq("status", "active"))
    .collect();
  // Gộp luôn việc webhook (tạo/sửa/xóa/test) vào batch này để bot chỉ cần
  // 1 query mỗi vòng quét thay vì 2 (tiết kiệm function calls cho free tier).
  // Webhook mặc định: query riêng bên dưới (chỉ cần tìm 1 row isDefault per guild).
  const jobs = [];
  for (const g of guilds) {
    const gPanels = panels.filter((p) => p.guildId === g.discordId && p.enabled && !p.messageId);
    const gGws = giveaways.filter((gw) => gw.guildId === g.discordId && gw.status === "active");

    // Webhook MẶC ĐỊNH của bot: tự tạo khi đã set kênh log (modLog ?? log),
    // tự gỡ khi bỏ set kênh hoặc kênh đổi sang chỗ khác.
    const gDefault = await ctx.db
      .query("guildWebhooks")
      .withIndex("by_guildId", (q) => q.eq("guildId", g.discordId))
      .filter((q) => q.eq(q.field("isDefault"), true))
      .first();
    const targetChannel = g.modLogChannelId ?? g.logChannelId;
    let defaultWebhook: {
      kind: "create" | "delete";
      channelId: string | null;
      webhookId: string | null;
      token: string | null;
    } | null = null;
    if (gDefault) {
      if (!targetChannel || gDefault.channelId !== targetChannel) {
        defaultWebhook = {
          kind: "delete",
          channelId: targetChannel ?? null,
          webhookId: gDefault.webhookId ?? null,
          token: gDefault.token ?? null,
        };
      }
    } else if (targetChannel) {
      defaultWebhook = {
        kind: "create",
        channelId: targetChannel,
        webhookId: null,
        token: null,
      };
    }
    const dm = !!g.dmRequested && !!g.dmTargetUserId && !!g.dmMessage;
    if (gPanels.length === 0 && gGws.length === 0 && !dm && !defaultWebhook) continue;
    jobs.push({
      guildId: g.discordId,
      panels: gPanels.map((p) => ({
        _id: p._id,
        channelId: p.channelId,
        label: p.label,
        description: p.description ?? null,
        thumbnailUrl: p.thumbnailUrl ?? null,
        entries: p.entries,
        messageId: p.messageId ?? "",
      })),
      giveaways: gGws.map((gw) => ({
        _id: gw._id,
        channelId: gw.channelId,
        title: gw.title,
        prize: gw.prize,
        winnerCount: gw.winnerCount,
        endsAt: gw.endsAt,
        dmWinners: gw.dmWinners,
        requiredRoleId: gw.requiredRoleId ?? null,
        prizeRoleId: gw.prizeRoleId ?? null,
        template: gw.template ?? "default",
        message: gw.message ?? null,
        imageUrl: gw.imageUrl ?? null,
        endMessage: gw.endMessage ?? null,
        messageId: gw.messageId ?? "",
        entries: gw.entries,
      })),
      defaultWebhook,
      dmRequested: dm,
      dmTargetUserId: dm ? (g.dmTargetUserId ?? null) : null,
      dmTargetUsername: dm ? (g.dmTargetUsername ?? null) : null,
      dmMessage: dm ? (g.dmMessage ?? null) : null,
    });
  }
  return jobs;
}

/**
 * Batch: trả toàn bộ "việc cần làm" của hidden system cho MỌI guild trong 1 query.
 * Bot tự lọc guild mình đang ở.
 */
export const getBotHiddenJobs = query({
  args: { botKey: v.optional(v.string()) },
  handler: async (ctx, { botKey }) => {
    await requireBotKeyStrict(ctx, botKey);
    return await buildHiddenJobs(ctx);
  },
});

export const getBotHidden = query({
  args: {
    guildId: v.string(),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, guildId }) => {
    await requireBotKeyStrict(ctx, botKey);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild) return null;
    const panels = await ctx.db
      .query("reactionRolePanels")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .collect();
    const giveaways = await ctx.db
      .query("giveaways")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .collect();
    return {
      dmRequested: guild.dmRequested ?? false,
      dmTargetUserId: guild.dmTargetUserId ?? null,
      dmTargetUsername: guild.dmTargetUsername ?? null,
      dmMessage: guild.dmMessage ?? null,
      panels: panels.map((p) => ({
        _id: p._id,
        channelId: p.channelId,
        label: p.label,
        description: p.description ?? null,
        thumbnailUrl: p.thumbnailUrl ?? null,
        entries: p.entries,
        messageId: p.messageId ?? "",
        enabled: p.enabled,
      })),
      giveaways: giveaways.map((g) => ({
        _id: g._id,
        channelId: g.channelId,
        title: g.title,
        prize: g.prize,
        winnerCount: g.winnerCount,
        endsAt: g.endsAt,
        dmWinners: g.dmWinners,
        requiredRoleId: g.requiredRoleId ?? null,
        prizeRoleId: g.prizeRoleId ?? null,
        template: g.template ?? "default",
        message: g.message ?? null,
        imageUrl: g.imageUrl ?? null,
        endMessage: g.endMessage ?? null,
        status: g.status,
        messageId: g.messageId ?? "",
        entries: g.entries,
      })),
    };
  },
});

/** Trả về avatar tùy chỉnh của bot & Haimiya (công khai, dùng cho web). */
export const getBotBranding = query({
  args: {},
  handler: async (ctx) => {
    const status = await getBotStatus(ctx);
    return {
      botAvatarUrl: status?.botAvatarUrl ?? null,
      haimiyaAvatarUrl: status?.haimiyaAvatarUrl ?? null,
      ownerSet: canonicalBotOwnerId(status) !== null,
    };
  },
});

/** Bot báo chủ sở hữu (best-effort từ ứng dụng Discord) — ghi khi chưa có hoặc owner cũ sai. */
export const botSetOwner = mutation({
  args: {
    ownerId: v.string(),
    ownerName: v.optional(v.string()),
    ownerAvatarUrl: v.optional(v.string()),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, ownerId, ownerName, ownerAvatarUrl }) => {
    await requireBotKeyStrict(ctx, botKey);
    if (!DISCORD_SNOWFLAKE_RE.test(ownerId)) return { ok: false };
    const status = await getBotStatus(ctx);
    const patch: Record<string, unknown> = { ownerDiscordId: ownerId };
    if (ownerName !== undefined) patch.ownerName = ownerName ? ownerName.slice(0, 120) : undefined;
    if (ownerAvatarUrl !== undefined)
      patch.ownerAvatarUrl = ownerAvatarUrl ? ownerAvatarUrl.slice(0, 2000) : undefined;
    if (status) {
      await ctx.db.patch(status._id, patch);
    } else {
      const now = Date.now();
      await ctx.db.insert("botStatus", {
        kind: "status",
        online: false,
        guildCount: 0,
        memberCount: 0,
        lastHeartbeat: now,
        startedAt: now,
        version: "",
        ...patch,
      });
    }
    return { ok: true };
  },
});

/** Đổi avatar bot / Haimiya trên web (chỉ chủ sở hữu bot). */
export const setBotBranding = mutation({
  args: {
    token: v.string(),
    guildId: v.string(),
    botAvatarUrl: v.optional(v.union(v.string(), v.null())),
    haimiyaAvatarUrl: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { token, guildId, botAvatarUrl, haimiyaAvatarUrl }) => {
    const user = await getUserByToken(ctx, token);
    await requireGuild(ctx, token, guildId);
    await requireBotOwner(ctx, user);
    const status = await getBotStatus(ctx);
    // Chỉ nhận URL http(s) (hoặc Convex storage) — chặn javascript:/data:/vbscript:
    // bị render vào <img> công khai trên landing + dashboard.
    const clean = (u: string | null | undefined) => {
      if (!u) return undefined;
      const s = u.trim().slice(0, 2000);
      if (!s) return undefined;
      if (!/^https:\/\//i.test(s) && !s.startsWith("blob:")) return undefined;
      return s;
    };
    const patch: Record<string, unknown> = {};
    if (botAvatarUrl !== undefined) patch.botAvatarUrl = clean(botAvatarUrl);
    if (haimiyaAvatarUrl !== undefined) patch.haimiyaAvatarUrl = clean(haimiyaAvatarUrl);
    if (status) {
      await ctx.db.patch(status._id, patch);
    } else {
      const now = Date.now();
      await ctx.db.insert("botStatus", {
        kind: "status",
        online: false,
        guildCount: 0,
        memberCount: 0,
        lastHeartbeat: now,
        startedAt: now,
        version: "",
        ...patch,
      });
    }
    return { ok: true };
  },
});

/** Tạo URL upload ảnh avatar lên Convex storage (chỉ chủ sở hữu bot). */
export const generateUploadUrl = mutation({
  args: { token: v.string(), guildId: v.string() },
  handler: async (ctx, { token, guildId }) => {
    const user = await getUserByToken(ctx, token);
    await requireGuild(ctx, token, guildId);
    await requireBotOwner(ctx, user);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Lưu ảnh đã upload thành avatar bot / Haimiya (chỉ chủ sở hữu bot). */
export const saveBrandingUpload = mutation({
  args: {
    token: v.string(),
    guildId: v.string(),
    storageId: v.id("_storage"),
    slot: v.union(v.literal("bot"), v.literal("haimiya")),
  },
  handler: async (ctx, { token, guildId, storageId, slot }) => {
    const user = await getUserByToken(ctx, token);
    await requireGuild(ctx, token, guildId);
    await requireBotOwner(ctx, user);
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("Không tìm thấy file đã upload");
    const status = await getBotStatus(ctx);
    const field = slot === "bot" ? "botAvatarUrl" : "haimiyaAvatarUrl";
    if (status) {
      await ctx.db.patch(status._id, { [field]: url });
    } else {
      const now = Date.now();
      await ctx.db.insert("botStatus", {
        kind: "status",
        online: false,
        guildCount: 0,
        memberCount: 0,
        lastHeartbeat: now,
        startedAt: now,
        version: "",
        [field]: url,
      });
    }
    return { ok: true, url };
  },
});

/**
 * Ghi (hoặc xoá khi hash = undefined) mật khẩu tính năng ẩn vào botStatus —
 * MỘT bản duy nhất cho toàn bộ dashboard, không theo từng server.
 * Đổi mật khẩu cũng reset bộ đếm chống dò.
 */
async function patchHiddenPassword(ctx: MutationCtx, hash: string | undefined) {
  const status = await getBotStatus(ctx);
  if (!status) {
    // Bot chưa heartbeat lần nào → chưa có dòng botStatus. Tạo tối thiểu để mật
    // khẩu vừa đặt không bị mất (bot sync sau sẽ bổ sung các field còn lại).
    const now = Date.now();
    await ctx.db.insert("botStatus", {
      kind: "status",
      online: false,
      guildCount: 0,
      memberCount: 0,
      lastHeartbeat: now,
      startedAt: now,
      version: "",
      hiddenPasswordHash: hash,
    });
    return;
  }
  await ctx.db.patch(status._id, {
    hiddenPasswordHash: hash,
    hiddenVerifyFails: undefined,
    hiddenVerifyLastAt: undefined,
  });
}

/**
 * Các guild còn giữ hash mật khẩu ẩn DI SẢN (bản cũ lưu theo từng server).
 * Chỉ dùng trong giai đoạn chuyển tiếp và chỉ duyệt guild CÓ BOT (index
 * by_botInGuild) nên luôn nhỏ; sau lần mở khóa đầu tiên danh sách này rỗng và
 * code đi thẳng nhánh mật khẩu toàn cục.
 */
async function legacyHiddenPasswordGuilds(ctx: QueryCtx | MutationCtx) {
  const guilds = await ctx.db
    .query("guilds")
    .withIndex("by_botInGuild", (q) => q.eq("botInGuild", true))
    .collect();
  return guilds.filter((g) => !!g.hiddenPasswordHash);
}

/**
 * Cổng mật khẩu ẩn có đang BẬT không — dùng cho payload dashboard.
 * Đúng ở MỌI server (không phụ thuộc guild nào): bật khi có mật khẩu toàn cục,
 * hoặc khi còn hash di sản ở bất kỳ server nào (lúc đó mật khẩu cũ vẫn phải
 * được nhập, để không có server nào mở toang trong lúc chuyển tiếp).
 */
export async function hiddenPasswordIsSet(ctx: QueryCtx | MutationCtx): Promise<boolean> {
  const status = await getBotStatus(ctx);
  if (status?.hiddenPasswordHash) return true;
  return (await legacyHiddenPasswordGuilds(ctx)).length > 0;
}

/** Xoá mật khẩu tính năng ẩn ở MỌI nơi: bản toàn cục + các hash di sản theo server. */
async function clearHiddenPasswordEverywhere(ctx: MutationCtx) {
  await patchHiddenPassword(ctx, undefined);
  const guilds = await ctx.db.query("guilds").collect();
  for (const g of guilds) {
    if (g.hiddenPasswordHash || g.hiddenVerifyFails || g.hiddenVerifyLastAt) {
      await ctx.db.patch(g._id, {
        hiddenPasswordHash: undefined,
        hiddenVerifyFails: undefined,
        hiddenVerifyLastAt: undefined,
      });
    }
  }
}

/**
 * Đặt hoặc xóa mật khẩu mở khóa tính năng ẩn (chuỗi rỗng = xóa). CHỈ chủ sở hữu bot.
 *
 * Mật khẩu thuộc về CHỦ BOT chứ không thuộc về một server: lưu một bản trên
 * botStatus nên mọi server trong dashboard đều hỏi đúng mật khẩu đó. Bản cũ lưu
 * hash theo từng guild (salt = guildId) nên tính năng ẩn chỉ bị khoá ở đúng
 * server đã đặt mật khẩu, các server khác vào thẳng — đúng lỗi đã sửa.
 */
export const setHiddenPassword = mutation({
  args: {
    token: v.string(),
    guildId: v.string(),
    password: v.string(),
  },
  handler: async (ctx, { token, guildId, password }) => {
    const user = await getUserByToken(ctx, token);
    await requireGuild(ctx, token, guildId);
    await requireBotOwner(ctx, user);
    if (!password) {
      await clearHiddenPasswordEverywhere(ctx);
      return { ok: true, cleared: true };
    }
    if (password.length < 4 || password.length > 64) {
      throw new Error("Mật khẩu phải từ 4 đến 64 ký tự");
    }
    await patchHiddenPassword(ctx, hashHiddenPasswordGlobal(password));
    // Đổi mật khẩu → xoá luôn hash di sản theo server của guild đang mở.
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (guild?.hiddenPasswordHash) {
      await ctx.db.patch(guild._id, { hiddenPasswordHash: undefined, updatedAt: Date.now() });
    }
    return { ok: true, cleared: false };
  },
});

/** Kiểm tra mật khẩu mở khóa tính năng ẩn — CHỈ chủ sở hữu bot + chống dò (5 lần sai / 10 phút). */
const HIDDEN_VERIFY_MAX_FAILS = 5;
const HIDDEN_VERIFY_WINDOW_MS = 10 * 60_000;
export const verifyHiddenPassword = mutation({
  args: { token: v.string(), guildId: v.string(), password: v.string() },
  handler: async (ctx, { token, guildId, password }) => {
    const user = await getUserByToken(ctx, token);
    await requireGuild(ctx, token, guildId);
    // Người không phải chủ bot → coi như sai (không tiết lộ sự tồn tại của mật khẩu).
    try {
      await requireBotOwner(ctx, user);
    } catch {
      return false;
    }
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    const status = await getBotStatus(ctx);
    const globalHash = status?.hiddenPasswordHash;
    // Trong giai đoạn chuyển tiếp, mật khẩu cũ có thể gắn với server KHÁC server
    // đang mở → phải thử cả các hash di sản, nếu không chủ bot bị khoá ngoài
    // chính khu vực của mình ở mọi server trừ server đầu tiên.
    const legacyGuilds = globalHash ? [] : await legacyHiddenPasswordGuilds(ctx);
    const legacyCandidates = guild?.hiddenPasswordHash
      ? [guild, ...legacyGuilds.filter((g) => g._id !== guild._id)]
      : legacyGuilds;
    if (!globalHash && legacyCandidates.length === 0) return false;
    // Rate-limit dò mật khẩu: quá 5 lần SAI trong 10 phút → khóa thử trong đủ 10
    // phút. Bộ đếm toàn cục (gắn với chủ bot) vì mật khẩu cũng toàn cục — nếu
    // đếm theo từng server thì kẻ dò chỉ cần đổi server là được thêm 5 lượt.
    const now = Date.now();
    const fails = status?.hiddenVerifyFails ?? 0;
    const lastAt = status?.hiddenVerifyLastAt ?? 0;
    const windowExpired = now - lastAt >= HIDDEN_VERIFY_WINDOW_MS;
    if (!windowExpired && fails >= HIDDEN_VERIFY_MAX_FAILS) {
      const waitSec = Math.ceil((HIDDEN_VERIFY_WINDOW_MS - (now - lastAt)) / 1000);
      throw new Error(`Đã thử sai quá nhiều lần — thử lại sau ${waitSec} giây`);
    }
    const okGlobal = !!globalHash && hashHiddenPasswordGlobal(password) === globalHash;
    // Mật khẩu DI SẢN (đặt hồi còn lưu theo server): chấp nhận đúng một lần để
    // chủ bot không bị khoá ngoài khu vực của mình — đồng thời nâng luôn thành
    // mật khẩu TOÀN CỤC (và xoá hash di sản), nhờ vậy mọi server được bảo vệ ngay.
    const okLegacy =
      !okGlobal &&
      legacyCandidates.some(
        (g) => hashHiddenPassword(password, g.discordId) === g.hiddenPasswordHash,
      );
    if (okGlobal || okLegacy) {
      if (okLegacy) {
        await patchHiddenPassword(ctx, hashHiddenPasswordGlobal(password));
        for (const g of legacyCandidates) {
          await ctx.db.patch(g._id, {
            hiddenPasswordHash: undefined,
            hiddenVerifyFails: undefined,
            hiddenVerifyLastAt: undefined,
          });
        }
      } else if (status && (fails > 0 || lastAt > 0)) {
        await ctx.db.patch(status._id, {
          hiddenVerifyFails: undefined,
          hiddenVerifyLastAt: undefined,
        });
      }
      return true;
    }
    if (status) {
      await ctx.db.patch(status._id, {
        hiddenVerifyFails: windowExpired ? 1 : fails + 1,
        hiddenVerifyLastAt: now,
      });
    }
    return false;
  },
});

/** Rút gọn emoji về dạng chuẩn: custom emoji → ID số; unicode → bỏ variation selector. */
function normalizeEmoji(emoji: string): string {
  const s = emoji.trim();
  const custom = /^<a?:[^:]+:(\d{15,20})>$/.exec(s) ?? /^[^:]+:(\d{15,20})$/.exec(s);
  if (custom) return custom[1];
  return s.replace(/\uFE0F/g, "").slice(0, 32);
}

function cleanPanelInput(input: {
  label: string;
  description?: string;
  thumbnailUrl?: string;
  entries: { emoji: string; roleId: string }[];
}) {
  const cleanLabel = input.label.trim().slice(0, 100);
  if (!cleanLabel) throw new Error("Cần đặt tên cho bảng reaction role");
  const cleanDescription = input.description ? input.description.trim().slice(0, 2000) : undefined;
  const cleanThumb = input.thumbnailUrl ? input.thumbnailUrl.trim().slice(0, 2000) : undefined;
  const cleanEntries = input.entries
    .map((e) => ({
      emoji: normalizeEmoji(e.emoji),
      roleId: e.roleId.trim(),
    }))
    .filter((e) => e.emoji && /^\d{15,20}$/.test(e.roleId))
    .slice(0, 20);
  if (cleanEntries.length === 0) throw new Error("Cần ít nhất 1 cặp emoji + role");
  return {
    label: cleanLabel,
    description: cleanDescription,
    thumbnailUrl: cleanThumb,
    entries: cleanEntries,
  };
}

/** Tạo bảng reaction role (bot sẽ gửi tin nhắn + gắn emoji). */
export const createPanel = mutation({
  args: {
    token: v.string(),
    guildId: v.string(),
    channelId: v.string(),
    label: v.string(),
    description: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    entries: v.array(v.object({ emoji: v.string(), roleId: v.string() })),
  },
  handler: async (
    ctx,
    { token, guildId, channelId, label, description, thumbnailUrl, entries },
  ) => {
    await requireHiddenManage(ctx, token, guildId);
    const clean = cleanPanelInput({ label, description, thumbnailUrl, entries });
    const existing = await ctx.db
      .query("reactionRolePanels")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .collect();
    if (existing.length >= 10) throw new Error("Tối đa 10 bảng reaction role");
    const now = Date.now();
    await ctx.db.insert("reactionRolePanels", {
      guildId,
      channelId,
      ...clean,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true };
  },
});

/** Bot tạo bảng reaction role từ lệnh (đã kiểm tra quyền ở phía bot). */
export const botCreatePanel = mutation({
  args: {
    guildId: v.string(),
    channelId: v.string(),
    label: v.string(),
    description: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    entries: v.array(v.object({ emoji: v.string(), roleId: v.string() })),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { botKey, guildId, channelId, label, description, thumbnailUrl, entries },
  ) => {
    await requireBotKeyStrict(ctx, botKey);
    const clean = cleanPanelInput({ label, description, thumbnailUrl, entries });
    const existing = await ctx.db
      .query("reactionRolePanels")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .collect();
    if (existing.length >= 10) throw new Error("Tối đa 10 bảng reaction role");
    const now = Date.now();
    await ctx.db.insert("reactionRolePanels", {
      guildId,
      channelId,
      ...clean,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true };
  },
});

/**
 * Cập nhật bảng reaction role (tên, mô tả, thumbnail, cặp emoji/role).
 * Nội dung thay đổi → xóa messageId để bot gửi bảng mới ở vòng quét kế tiếp.
 */
export const updatePanel = mutation({
  args: {
    token: v.string(),
    guildId: v.string(),
    panelId: v.id("reactionRolePanels"),
    label: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    thumbnailUrl: v.optional(v.union(v.string(), v.null())),
    entries: v.optional(v.array(v.object({ emoji: v.string(), roleId: v.string() }))),
  },
  handler: async (ctx, { token, guildId, panelId, label, description, thumbnailUrl, entries }) => {
    await requireHiddenManage(ctx, token, guildId);
    const panel = await ctx.db.get(panelId);
    if (!panel || panel.guildId !== guildId) throw new Error("Không tìm thấy bảng reaction role");
    const patch: Record<string, unknown> = { updatedAt: Date.now(), messageId: undefined };
    if (label !== undefined) {
      const clean = label.trim().slice(0, 100);
      if (!clean) throw new Error("Cần đặt tên cho bảng reaction role");
      patch.label = clean;
    }
    if (description !== undefined) {
      patch.description = description ? description.trim().slice(0, 2000) : undefined;
    }
    if (thumbnailUrl !== undefined) {
      patch.thumbnailUrl = thumbnailUrl ? thumbnailUrl.trim().slice(0, 2000) : undefined;
    }
    if (entries !== undefined) {
      const cleanEntries = entries
        .map((e) => ({ emoji: normalizeEmoji(e.emoji), roleId: e.roleId.trim() }))
        .filter((e) => e.emoji && /^\d{15,20}$/.test(e.roleId))
        .slice(0, 20);
      if (cleanEntries.length === 0) throw new Error("Cần ít nhất 1 cặp emoji + role");
      patch.entries = cleanEntries;
    }
    await ctx.db.patch(panelId, patch);
    return { ok: true };
  },
});

/** Bot cập nhật bảng reaction role từ lệnh (đã kiểm tra quyền ở phía bot). */
export const botUpdatePanel = mutation({
  args: {
    guildId: v.string(),
    panelId: v.id("reactionRolePanels"),
    label: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    thumbnailUrl: v.optional(v.union(v.string(), v.null())),
    entries: v.optional(v.array(v.object({ emoji: v.string(), roleId: v.string() }))),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, guildId, panelId, label, description, thumbnailUrl, entries }) => {
    await requireBotKeyStrict(ctx, botKey);
    const panel = await ctx.db.get(panelId);
    if (!panel || panel.guildId !== guildId) throw new Error("Không tìm thấy bảng reaction role");
    const patch: Record<string, unknown> = { updatedAt: Date.now(), messageId: undefined };
    if (label !== undefined) {
      const clean = label.trim().slice(0, 100);
      if (!clean) throw new Error("Cần đặt tên cho bảng reaction role");
      patch.label = clean;
    }
    if (description !== undefined) {
      patch.description = description ? description.trim().slice(0, 2000) : undefined;
    }
    if (thumbnailUrl !== undefined) {
      patch.thumbnailUrl = thumbnailUrl ? thumbnailUrl.trim().slice(0, 2000) : undefined;
    }
    if (entries !== undefined) {
      const cleanEntries = entries
        .map((e) => ({ emoji: normalizeEmoji(e.emoji), roleId: e.roleId.trim() }))
        .filter((e) => e.emoji && /^\d{15,20}$/.test(e.roleId))
        .slice(0, 20);
      if (cleanEntries.length === 0) throw new Error("Cần ít nhất 1 cặp emoji + role");
      patch.entries = cleanEntries;
    }
    await ctx.db.patch(panelId, patch);
    return { ok: true };
  },
});

export const deletePanel = mutation({
  args: { token: v.string(), guildId: v.string(), panelId: v.id("reactionRolePanels") },
  handler: async (ctx, { token, guildId, panelId }) => {
    await requireHiddenManage(ctx, token, guildId);
    const panel = await ctx.db.get(panelId);
    if (!panel || panel.guildId !== guildId) throw new Error("Không tìm thấy bảng reaction role");
    await ctx.db.delete(panelId);
    return { ok: true };
  },
});

/** Bot xóa bảng reaction role từ lệnh (đã kiểm tra quyền ở phía bot). */
export const botDeletePanel = mutation({
  args: {
    guildId: v.string(),
    panelId: v.id("reactionRolePanels"),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, guildId, panelId }) => {
    await requireBotKeyStrict(ctx, botKey);
    const panel = await ctx.db.get(panelId);
    if (!panel || panel.guildId !== guildId) throw new Error("Không tìm thấy bảng reaction role");
    await ctx.db.delete(panelId);
    return { ok: true };
  },
});

export const togglePanel = mutation({
  args: { token: v.string(), guildId: v.string(), panelId: v.id("reactionRolePanels") },
  handler: async (ctx, { token, guildId, panelId }) => {
    await requireHiddenManage(ctx, token, guildId);
    const panel = await ctx.db.get(panelId);
    if (!panel || panel.guildId !== guildId) throw new Error("Không tìm thấy bảng reaction role");
    await ctx.db.patch(panelId, { enabled: !panel.enabled, updatedAt: Date.now() });
    return { ok: true };
  },
});

/** Bot báo đã gửi tin nhắn bảng reaction role. */
export const panelPosted = mutation({
  args: {
    panelId: v.id("reactionRolePanels"),
    messageId: v.string(),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, panelId, messageId }) => {
    await requireBotKeyStrict(ctx, botKey);
    const panel = await ctx.db.get(panelId);
    if (!panel) return;
    await ctx.db.patch(panelId, {
      messageId,
      postError: undefined,
      postErrorAt: undefined,
      updatedAt: Date.now(),
    });
  },
});

/** Bot báo lỗi gửi panel reaction role (kênh đã xóa / thiếu quyền…) — web hiển thị thay vì im lặng. */
export const botReportPanelError = mutation({
  args: {
    panelId: v.id("reactionRolePanels"),
    error: v.string(),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, panelId, error }) => {
    await requireBotKeyStrict(ctx, botKey);
    const panel = await ctx.db.get(panelId);
    if (!panel) return { ok: true };
    await ctx.db.patch(panelId, {
      postError: String(error || "Lỗi không xác định").slice(0, 300),
      postErrorAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/**
 * Đặt seed chìa khóa bot (chỉ chủ sở hữu bot).
 * Lưu SHA-256(botKey) vào botStatus.botKeySeed: từ đó MỌI function bot-side yêu
 * cầu botKey khớp — bot tính từ BOT_KEY trong .env trên VPS (botAuth.ts).
 * Chỉ lưu BĂM — không lưu seed thô, không trả về giá trị nào.
 * (Chìa khóa action — FUNC_SEED — cấu hình qua env của deployment, xem botFunc.ts.)
 */
export const setBotSecrets = mutation({
  args: {
    token: v.string(),
    guildId: v.string(),
    ownerSeed: v.optional(v.string()),
  },
  handler: async (ctx, { token, ownerSeed }) => {
    const user = await getUserByToken(ctx, token);
    await requireBotOwner(ctx, user);
    if (ownerSeed === undefined) return { ok: true };
    const seed = ownerSeed.trim();
    if (seed.length < 8 || seed.length > 200) {
      throw new Error("Seed chìa khóa bot phải từ 8 đến 200 ký tự");
    }
    const status = await getBotStatus(ctx);
    const patch: Record<string, unknown> = { botKeySeed: computeBotKey(seed) };
    if (status) {
      await ctx.db.patch(status._id, patch);
    } else {
      const now = Date.now();
      await ctx.db.insert("botStatus", {
        kind: "status",
        online: false,
        guildCount: 0,
        memberCount: 0,
        lastHeartbeat: now,
        startedAt: now,
        version: "",
        ...patch,
      });
    }
    return { ok: true };
  },
});

const GIVEAWAY_TEMPLATES = ["default", "luxury", "vip", "simple"] as const;

function cleanGiveawayInput({
  title,
  prize,
  winnerCount,
  durationMinutes,
  requiredRoleId,
  prizeRoleId,
  template,
  message,
  imageUrl,
  endMessage,
}: {
  title: string;
  prize: string;
  winnerCount: number;
  durationMinutes: number;
  requiredRoleId?: string;
  prizeRoleId?: string;
  template?: string;
  message?: string;
  imageUrl?: string;
  endMessage?: string;
}) {
  const cleanTitle = title.trim().slice(0, 100);
  const cleanPrize = prize.trim().slice(0, 2000);
  if (!cleanTitle) throw new Error("Cần đặt tên giveaway");
  if (!cleanPrize) throw new Error("Cần nhập giải thưởng");
  const count = Math.max(1, Math.min(20, Math.floor(winnerCount)));
  const minutes = Math.max(1, Math.min(10080, Math.floor(durationMinutes)));
  const cleanRole =
    requiredRoleId && /^\d{15,20}$/.test(requiredRoleId.trim()) ? requiredRoleId.trim() : undefined;
  const cleanPrizeRole =
    prizeRoleId && /^\d{15,20}$/.test(prizeRoleId.trim()) ? prizeRoleId.trim() : undefined;
  const cleanTemplate =
    template && (GIVEAWAY_TEMPLATES as readonly string[]).includes(template) ? template : "default";
  const cleanMessage = message ? message.trim().slice(0, 2000) : undefined;
  const cleanImage = imageUrl ? imageUrl.trim().slice(0, 2000) : undefined;
  const cleanEnd = endMessage ? endMessage.trim().slice(0, 1000) : undefined;
  return {
    title: cleanTitle,
    prize: cleanPrize,
    winnerCount: count,
    durationMinutes: minutes,
    requiredRoleId: cleanRole,
    prizeRoleId: cleanPrizeRole,
    template: cleanTemplate,
    message: cleanMessage,
    imageUrl: cleanImage,
    endMessage: cleanEnd,
  };
}

/** Tạo giveaway mới (bot sẽ gửi embed + phản ứng 🎉). */
export const createGiveaway = mutation({
  args: {
    token: v.string(),
    guildId: v.string(),
    channelId: v.string(),
    title: v.string(),
    prize: v.string(),
    winnerCount: v.number(),
    durationMinutes: v.number(),
    dmWinners: v.boolean(),
    requiredRoleId: v.optional(v.string()),
    prizeRoleId: v.optional(v.string()),
    template: v.optional(v.string()),
    message: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    endMessage: v.optional(v.string()),
  },
  handler: async (ctx, { token, guildId, channelId, ...rest }) => {
    await requireHiddenManage(ctx, token, guildId);
    const clean = cleanGiveawayInput(rest);
    const active = await ctx.db
      .query("giveaways")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
    if (active.length >= 5) throw new Error("Tối đa 5 giveaway đang chạy cùng lúc");
    await ctx.db.insert("giveaways", {
      guildId,
      channelId,
      ...clean,
      endsAt: Date.now() + clean.durationMinutes * 60_000,
      dmWinners: rest.dmWinners,
      status: "active",
      entries: [],
      winners: [],
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Bot tạo giveaway từ lệnh slash / prefix (đã kiểm tra quyền ở phía bot). */
export const botCreateGiveaway = mutation({
  args: {
    guildId: v.string(),
    channelId: v.string(),
    title: v.string(),
    prize: v.string(),
    winnerCount: v.number(),
    durationMinutes: v.number(),
    dmWinners: v.boolean(),
    requiredRoleId: v.optional(v.string()),
    prizeRoleId: v.optional(v.string()),
    template: v.optional(v.string()),
    message: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    endMessage: v.optional(v.string()),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, guildId, channelId, ...rest }) => {
    await requireBotKeyStrict(ctx, botKey);
    const clean = cleanGiveawayInput(rest);
    const active = await ctx.db
      .query("giveaways")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
    if (active.length >= 5) throw new Error("Tối đa 5 giveaway đang chạy cùng lúc");
    await ctx.db.insert("giveaways", {
      guildId,
      channelId,
      ...clean,
      endsAt: Date.now() + clean.durationMinutes * 60_000,
      dmWinners: rest.dmWinners,
      status: "active",
      entries: [],
      winners: [],
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Bot kết thúc giveaway sớm (đặt endsAt về hiện tại — poll sẽ chốt người thắng). */
export const botGiveawayEndNow = mutation({
  args: {
    guildId: v.string(),
    title: v.string(),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, guildId, title }) => {
    await requireBotKeyStrict(ctx, botKey);
    const giveaway = await ctx.db
      .query("giveaways")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .filter((q) => q.and(q.eq(q.field("status"), "active"), q.eq(q.field("title"), title)))
      .first();
    if (!giveaway) return { ok: false };
    await ctx.db.patch(giveaway._id, { endsAt: Date.now() });
    return { ok: true };
  },
});

export const cancelGiveaway = mutation({
  args: { token: v.string(), guildId: v.string(), giveawayId: v.id("giveaways") },
  handler: async (ctx, { token, guildId, giveawayId }) => {
    await requireHiddenManage(ctx, token, guildId);
    const giveaway = await ctx.db.get(giveawayId);
    if (!giveaway || giveaway.guildId !== guildId) throw new Error("Không tìm thấy giveaway");
    if (giveaway.status === "active") {
      await ctx.db.patch(giveawayId, { status: "cancelled" });
    }
    return { ok: true };
  },
});

/** Bot báo đã gửi tin nhắn giveaway. */
export const giveawayPosted = mutation({
  args: {
    giveawayId: v.id("giveaways"),
    messageId: v.string(),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, giveawayId, messageId }) => {
    await requireBotKeyStrict(ctx, botKey);
    const giveaway = await ctx.db.get(giveawayId);
    if (!giveaway) return;
    await ctx.db.patch(giveawayId, { messageId, postError: undefined, postErrorAt: undefined });
  },
});

/** Bot báo lỗi giveaway: phase "post" (gửi bảng) hoặc "end" (kết thúc + trao thưởng). */
export const botReportGiveawayError = mutation({
  args: {
    giveawayId: v.id("giveaways"),
    phase: v.union(v.literal("post"), v.literal("end")),
    error: v.string(),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, giveawayId, phase, error }) => {
    await requireBotKeyStrict(ctx, botKey);
    const giveaway = await ctx.db.get(giveawayId);
    if (!giveaway) return { ok: true };
    const msg = String(error || "Lỗi không xác định").slice(0, 300);
    await ctx.db.patch(
      giveawayId,
      phase === "post"
        ? { postError: msg, postErrorAt: Date.now() }
        : { endError: msg, endErrorAt: Date.now() },
    );
    return { ok: true };
  },
});

/** Bot ghi nhận 1 lượt tham gia giveaway (từ reaction 🎉). */
export const giveawayEnter = mutation({
  args: {
    giveawayId: v.id("giveaways"),
    userId: v.string(),
    username: v.string(),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, giveawayId, userId, username }) => {
    await requireBotKeyStrict(ctx, botKey);
    const giveaway = await ctx.db.get(giveawayId);
    if (!giveaway || giveaway.status !== "active" || !giveaway.messageId) return { ok: false };
    if (giveaway.entries.some((e) => e.userId === userId)) return { ok: false };
    await ctx.db.patch(giveawayId, {
      entries: [...giveaway.entries, { userId, username: username || userId }],
    });
    return { ok: true };
  },
});

/** Bot kết thúc giveaway: chốt người thắng. */
export const giveawayEnd = mutation({
  args: {
    giveawayId: v.id("giveaways"),
    winners: v.array(v.object({ userId: v.string(), username: v.string() })),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, giveawayId, winners }) => {
    await requireBotKeyStrict(ctx, botKey);
    const giveaway = await ctx.db.get(giveawayId);
    if (!giveaway || giveaway.status !== "active") return;
    await ctx.db.patch(giveawayId, {
      status: "ended",
      winners,
      endError: undefined,
      endErrorAt: undefined,
    });
  },
});

/** Gửi tin nhắn DM trực tiếp cho người dùng (bot sẽ gửi). */
export const requestDm = mutation({
  args: {
    token: v.string(),
    guildId: v.string(),
    userId: v.string(),
    username: v.optional(v.string()),
    message: v.string(),
  },
  handler: async (ctx, { token, guildId, userId, username, message }) => {
    const guild = await requireHiddenManage(ctx, token, guildId);
    if (!/^\d{15,20}$/.test(userId)) throw new Error("ID người dùng không hợp lệ");
    const clean = message.trim().slice(0, 2000);
    if (!clean) throw new Error("Cần nhập nội dung tin nhắn");
    await ctx.db.patch(guild._id, {
      dmTargetUserId: userId,
      dmTargetUsername: username ? username.slice(0, 60) : undefined,
      dmMessage: clean,
      dmRequested: true,
      dmError: undefined,
      dmErrorAt: undefined,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Bot báo lỗi gửi DM (user tắt DM / không dùng chung server…) — web hiển thị. */
export const botReportDmError = mutation({
  args: {
    guildId: v.string(),
    error: v.string(),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, guildId, error }) => {
    await requireBotKeyStrict(ctx, botKey);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild) return { ok: true };
    await ctx.db.patch(guild._id, {
      dmError: String(error || "Lỗi không xác định").slice(0, 300),
      dmErrorAt: Date.now(),
      updatedAt: Date.now(),
      // Ghi lỗi = trạng thái KẾT THÚC, phải tắt luôn cờ dmRequested: nếu giữ
      // cờ, guild bị lỗi DM vĩnh viễn (user tắt DM) kẹt nhánh TTL 30s trong
      // getConfig mãi mãi + bot gửi lại mỗi tick — một trong 2 nguyên nhân
      // thật gây 968MB Database I/O / 9 ngày ở getBotConfig. Admin gửi lại
      // được qua requestDm (bật cờ + xoá lỗi cũ); giữ target/message để hiển
      // thị bối cảnh lỗi.
      dmRequested: false,
    });
    return { ok: true };
  },
});

/** Bot báo đã gửi xong DM. */
export const botClearDm = mutation({
  args: {
    guildId: v.string(),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, guildId }) => {
    await requireBotKeyStrict(ctx, botKey);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild) return;
    await ctx.db.patch(guild._id, {
      dmRequested: false,
      dmTargetUserId: undefined,
      dmTargetUsername: undefined,
      dmMessage: undefined,
      dmError: undefined,
      dmErrorAt: undefined,
      updatedAt: Date.now(),
    });
  },
});
