/**
 * verifyBans.ts — quản lý ban theo hash IP + đồng bộ danh sách ban của guild.
 *
 * Vì sao là bảng riêng chứ không nhét vào `guilds`:
 *  - Mỗi IP có hạn riêng, lý do riêng, người tạo riêng.
 *  - Tick cần hỏi "ban nào hết hạn" theo index, không quét cả document guild.
 *
 * Bất biến: KHÔNG có IP thô ở bất kỳ đâu. `ipHash` là HMAC-SHA-256 của IP với
 * `IP_HASH_SECRET` và `guildId` (xem `convex/verifyCrypto.ts`) — cùng một IP ở
 * hai server cho hai hash khác nhau, nên lộ bảng của server A không đối chiếu
 * được sang server B.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { canManageGuild, getUserByToken } from "./auth";
import { requireBotKeyStrict } from "./botAuth";
import { IP_BAN_MAX_DAYS, clampBanDays } from "./verifyCrypto";

/** Trần số bản ghi trả về mỗi lần đọc — bảng này nhỏ nhưng vẫn phải có trần. */
const LIST_TAKE = 200;

function isHex64(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

/** Dashboard: danh sách IP đang bị ban của server (kèm trạng thái hết hạn). */
export const listIpBans = query({
  args: { token: v.string(), guildId: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.token);
    if (!user) return null;
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", args.guildId))
      .first();
    if (!guild || !canManageGuild(user, guild)) return null;
    const now = Date.now();
    const rows = await ctx.db
      .query("ipBans")
      .withIndex("by_guildId_expiresAt", (q) => q.eq("guildId", args.guildId))
      .order("desc")
      .take(LIST_TAKE);
    return rows.map((row) => ({
      id: row._id,
      ipHashShort: row.ipHash.slice(0, 12),
      ipHash: row.ipHash,
      scope: row.scope,
      reason: row.reason,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      evidenceUserId: row.evidenceUserId ?? null,
      source: row.source ?? "manual",
      active: row.active && row.expiresAt > now,
    }));
  },
});

/**
 * Dashboard: ban một hash IP.
 *
 * Hai đường vào, cùng một chốt:
 *  - `ipHash` trực tiếp (admin bấm từ danh sách phiên verify), hoặc
 *  - `sessionId` — server tự đọc hash từ phiên, KHÔNG tin hash client gửi.
 *
 * Luôn kẹp hạn 1..90 ngày: "ban vĩnh viễn theo IP" là án treo trên IP động và
 * CGNAT, không có đường gỡ khi người dùng đổi mạng.
 */
export const createIpBan = mutation({
  args: {
    token: v.string(),
    guildId: v.string(),
    ipHash: v.optional(v.string()),
    sessionId: v.optional(v.id("verifySessions")),
    scope: v.optional(v.union(v.literal("ip"), v.literal("prefix"))),
    days: v.optional(v.number()),
    reason: v.optional(v.string()),
    evidenceUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.token);
    if (!user) throw new Error("Chưa đăng nhập");
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", args.guildId))
      .first();
    if (!guild || !canManageGuild(user, guild)) throw new Error("Không có quyền");

    let hash = isHex64(args.ipHash) ? args.ipHash : "";
    let prefixHash: string | undefined;
    let evidenceUserId = args.evidenceUserId;
    let evidenceSessionId = args.sessionId;

    if (args.sessionId) {
      const session = await ctx.db.get(args.sessionId);
      if (!session || session.guildId !== args.guildId) throw new Error("Phiên không hợp lệ");
      // Chỉ phiên đã có kết quả mới có hash IP.
      if (!isHex64(session.ipHash)) throw new Error("Phiên này chưa thu được IP");
      hash = session.ipHash;
      prefixHash = session.ipPrefixHash;
      evidenceUserId = session.userId;
      evidenceSessionId = session._id;
    }
    if (!hash) throw new Error("Thiếu hash IP hợp lệ");

    const scope = args.scope ?? "ip";
    if (scope === "prefix" && !prefixHash) {
      throw new Error("Phiên này không có prefix IPv6 để ban theo dải");
    }

    const now = Date.now();
    const days = clampBanDays(args.days);
    const expiresAt = now + days * 24 * 3600_000;

    // Đã có ban còn hiệu lực cho cùng hash → gia hạn thay vì tạo bản ghi trùng.
    const existing = await ctx.db
      .query("ipBans")
      .withIndex("by_guildId_ipHash", (q) => q.eq("guildId", args.guildId).eq("ipHash", hash))
      .first();
    const actor = user.discordId ?? String(user._id);
    if (existing) {
      await ctx.db.patch(existing._id, {
        active: true,
        expiresAt: Math.max(existing.expiresAt, expiresAt),
        reason: args.reason?.trim().slice(0, 300) || existing.reason,
        scope,
        ipPrefixHash: prefixHash ?? existing.ipPrefixHash,
      });
      return { ok: true, id: existing._id, expiresAt: Math.max(existing.expiresAt, expiresAt) };
    }

    const id = await ctx.db.insert("ipBans", {
      guildId: args.guildId,
      ipHash: hash,
      ipPrefixHash: prefixHash,
      scope,
      reason: (args.reason?.trim() || "Ban IP từ dashboard").slice(0, 300),
      createdBy: actor,
      createdAt: now,
      expiresAt,
      evidenceUserId,
      evidenceSessionId,
      active: true,
      source: "manual",
    });
    await ctx.db.insert("verifyAudit", {
      guildId: args.guildId,
      userId: evidenceUserId,
      sessionId: evidenceSessionId,
      action: "ip_ban_created",
      actor,
      reason: args.reason?.slice(0, 300),
      details: JSON.stringify({ scope, days, ipHashShort: hash.slice(0, 12) }),
      createdAt: now,
    });
    return { ok: true, id, expiresAt };
  },
});

/** Dashboard: gỡ một lệnh ban IP (đặt active=false, giữ dấu vết). */
export const revokeIpBan = mutation({
  args: { token: v.string(), guildId: v.string(), id: v.id("ipBans") },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.token);
    if (!user) throw new Error("Chưa đăng nhập");
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", args.guildId))
      .first();
    if (!guild || !canManageGuild(user, guild)) throw new Error("Không có quyền");
    const row = await ctx.db.get(args.id);
    if (!row || row.guildId !== args.guildId) throw new Error("Không tìm thấy");
    await ctx.db.patch(args.id, { active: false });
    await ctx.db.insert("verifyAudit", {
      guildId: args.guildId,
      userId: row.evidenceUserId,
      action: "ip_ban_revoked",
      actor: user.discordId ?? String(user._id),
      details: JSON.stringify({ ipHashShort: row.ipHash.slice(0, 12) }),
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

/**
 * Bot đồng bộ sự kiện ban/unban của Discord vào `guildBans`.
 *
 * Vì sao cần bản sao: phát hiện ban evasion phải trả lời "tài khoản này đang bị
 * ban không?" trong lúc verify — gọi Discord API giữa action là không được, và
 * `modActions` chỉ có ban do bot thực hiện, bỏ sót ban thủ công từ UI Discord.
 */
export const botSyncGuildBan = mutation({
  args: {
    guildId: v.string(),
    userId: v.string(),
    active: v.boolean(),
    reason: v.optional(v.string()),
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    if (!/^\d{15,21}$/.test(args.userId)) throw new Error("userId không hợp lệ");
    const now = Date.now();
    const existing = await ctx.db
      .query("guildBans")
      .withIndex("by_guildId_userId", (q) =>
        q.eq("guildId", args.guildId).eq("userId", args.userId),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        active: args.active,
        reason: args.reason?.slice(0, 300) ?? existing.reason,
        syncedAt: now,
        source: "event",
      });
    } else {
      await ctx.db.insert("guildBans", {
        guildId: args.guildId,
        userId: args.userId,
        active: args.active,
        reason: args.reason?.slice(0, 300),
        bannedAt: now,
        syncedAt: now,
        source: "event",
      });
    }
    return { ok: true };
  },
});

/** Bot quét bù toàn bộ danh sách ban của guild (đồng bộ định kỳ / sau downtime). */
export const botReplaceGuildBans = mutation({
  args: {
    guildId: v.string(),
    userIds: v.array(v.string()),
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    const now = Date.now();
    const activeSet = new Set(args.userIds.filter((id) => /^\d{15,21}$/.test(id)).slice(0, 5000));
    const rows = await ctx.db
      .query("guildBans")
      .withIndex("by_guildId_active", (q) => q.eq("guildId", args.guildId).eq("active", true))
      .take(5000);
    let updated = 0;
    for (const row of rows) {
      if (activeSet.has(row.userId)) {
        activeSet.delete(row.userId);
        continue;
      }
      await ctx.db.patch(row._id, { active: false, syncedAt: now, source: "sync" });
      updated++;
    }
    for (const userId of activeSet) {
      await ctx.db.insert("guildBans", {
        guildId: args.guildId,
        userId,
        active: true,
        bannedAt: now,
        syncedAt: now,
        source: "sync",
      });
      updated++;
    }
    return { ok: true, updated };
  },
});

/** Dashboard: số liệu nhanh cho panel (không đọc cả bảng). */
export const ipBanSummary = query({
  args: { token: v.string(), guildId: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.token);
    if (!user) return null;
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", args.guildId))
      .first();
    if (!guild || !canManageGuild(user, guild)) return null;
    const now = Date.now();
    const rows = await ctx.db
      .query("ipBans")
      .withIndex("by_guildId_active", (q) => q.eq("guildId", args.guildId).eq("active", true))
      .take(500);
    return {
      active: rows.filter((row) => row.expiresAt > now).length,
      expiringSoon: rows.filter((row) => row.expiresAt > now && row.expiresAt < now + 24 * 3600_000)
        .length,
      maxDays: IP_BAN_MAX_DAYS,
    };
  },
});
