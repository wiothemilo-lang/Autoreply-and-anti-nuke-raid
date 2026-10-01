import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ANTI_NUKE_MODULES, isAntiNukeModule } from "./modules";
import { requireBotKeyStrict } from "./botAuth";
import {
  CHUNK_CHARS,
  MAX_INLINE_CHARS,
  CHUNKED_PREFIX,
  deleteBackupChunks,
  splitBackupJson,
} from "./backupChunks";

const ALLOWED_ACTIONS = [
  "warn",
  "kick",
  "ban",
  "timeout",
  "deleteMessages",
  "purgeMessages",
] as const;
const ACTION_STRENGTH: Record<string, number> = { warn: 1, timeout: 2, kick: 3, ban: 4 };
const BACKUP_CLAIM_TTL_MS = 600_000;

/**
 * Chuẩn hoá nhiệt độ trước khi ghi vào bảng `heatStates`.
 *
 * Nhiệt là số lần vi phạm đã bị trừ dần theo thời gian, nên 0 là trạng thái hợp lệ:
 * người dùng hết nhiệt nhưng vẫn còn warn tích luỹ trong cửa sổ tái phạm (bot flush
 * gửi `heat: Math.max(0, heat)` + `warnStrikes` riêng → `0` kèm warn là tình huống thật).
 * Trước đây ta ép tối thiểu 1 (`Math.max(1, …)`) → bịa thêm 1 lần vi phạm cho hàng đó,
 * lệch với mọi nơi đọc: `reports.ts` đã lọc `heat > 0`, `guilds.ts` tính an toàn theo
 * `100 - heat`, lệnh `/heat top` xếp hạng theo nhiệt. Nay chỉ chặn trên [0, 100],
 * bot gửi 0 thì nhận đúng 0.
 */
function clampHeat(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

/**
 * Giữ các bảng log theo trần số dòng mỗi server (800 sự kiện / 100 case / 500
 * lượt join). Dọn theo XÁC SUẤT và theo LÔ: mỗi lượt ghi có 1/TRIM_ODDS khả năng
 * đọc (cap + TRIM_BATCH) dòng mới nhất rồi xoá phần vượt trần (tối đa TRIM_BATCH
 * dòng cũ nhất).
 *
 * Bản cũ cổng theo `Date.now() % 240_000 < 2000` (~0,8% lượt ghi) và mỗi lần chỉ
 * xoá tối đa 1 dòng → ~99% dòng ghi vào sống mãi, bảng phình vô hạn (không có
 * cron nào dọn thay). Nay xoá TRIM_BATCH dòng mỗi 1/TRIM_ODDS lượt ghi (2,5
 * dòng/lượt ≥ 1 dòng ghi vào) nên bảng hội tụ về trần cộng tối đa ~TRIM_ODDS
 * dòng, kể cả khi còn tồn đọng từ bản cũ (mỗi lần dọn 100 dòng).
 */
export const TRIM_ODDS = 40;
export const TRIM_BATCH = 100;

export function shouldTrim(): boolean {
  return Math.random() * TRIM_ODDS < 1;
}

/** Xoá các dòng vượt `cap` trong danh sách đã sắp MỚI NHẤT TRƯỚC; trả về số dòng đã xoá. */
export async function dropBeyondCap(
  ctx: { db: { delete: (id: any) => Promise<unknown> } },
  newestFirst: { _id: unknown }[],
  cap: number,
): Promise<number> {
  const extra = newestFirst.slice(cap);
  for (const row of extra) await ctx.db.delete(row._id);
  return extra.length;
}

function claimIsActive(claimedAt: number | undefined, leaseUntil?: number): boolean {
  if (claimedAt === undefined) return false;
  return leaseUntil !== undefined
    ? leaseUntil > Date.now()
    : Date.now() - claimedAt < BACKUP_CLAIM_TTL_MS;
}

function claimMatches(
  guild: {
    backupClaimedAt?: number;
    backupLeaseUntil?: number;
    restoreClaimedAt?: number;
    restoreLeaseUntil?: number;
  },
  kind: "backup" | "restore" | "import" | "plan",
  claimAt: number | undefined,
): boolean {
  if (claimAt === undefined) return true; // tương thích client cũ trong lúc rollout
  const current = kind === "backup" ? guild.backupClaimedAt : guild.restoreClaimedAt;
  const leaseUntil = kind === "backup" ? guild.backupLeaseUntil : guild.restoreLeaseUntil;
  return current === claimAt && claimIsActive(current, leaseUntil);
}

/** Lọc + chuẩn hóa danh sách hành động, trả về hình phạt mạnh nhất. */
function normalizeActions(raw: string[] | undefined): {
  actions: string[];
  strongest: "warn" | "kick" | "ban" | "timeout";
} {
  const actions = [
    ...new Set((raw ?? []).filter((a) => (ALLOWED_ACTIONS as readonly string[]).includes(a))),
  ].slice(0, 6);
  const member = actions
    .filter((a) => ACTION_STRENGTH[a] != null)
    .sort((a, b) => ACTION_STRENGTH[b] - ACTION_STRENGTH[a]);
  const strongest = (member[0] ?? "warn") as "warn" | "kick" | "ban" | "timeout";
  return { actions, strongest };
}

/** Chặn trên/dưới + làm tròn — người dùng gõ bừa số cũng không làm hỏng dữ liệu. */
function clampRetention(value: number | undefined, fallback: number, min: number, max: number) {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

/**
 * Tra 1 ticket theo id (chuỗi) mà bot gửi lên — CÓ kiểm guild.
 *
 * Vì sao cần: các mutation ticket trước đây `collect()` TOÀN BỘ ticket của guild
 * rồi tự `.find` chỉ để sửa 1 hàng. Với `botTouchTickets` (chạy MỖI tin nhắn
 * trong kênh ticket) là ~N lượt đọc document (kèm `body` dài) cho mỗi tin nhắn;
 * với các nút staff bấm là N lượt đọc cho mỗi cú bấm — I/O phình theo bình
 * phương số ticket của server. `normalizeId` xác nhận chuỗi đúng định dạng id
 * của bảng `tickets` (sai → null, KHÔNG ném lỗi) rồi `get` đọc đúng 1 document;
 * vẫn kiểm `guildId` nên guild này không đọc/ghi được ticket của guild khác.
 */
async function findGuildTicket(ctx: any, guildId: string, ticketId: string) {
  const id = ctx.db.normalizeId("tickets", ticketId);
  if (!id) return null;
  const ticket = await ctx.db.get(id);
  return ticket && ticket.guildId === guildId ? ticket : null;
}

/**
 * These mutations are called by the Discord bot process itself. The bot
 * validates the executor's Discord permissions before calling them, and only
 * the bot holds the Convex admin/deploy key, so no session token is checked.
 */

export const botUpdateSettings = mutation({
  args: {
    guildId: v.string(),
    prefix: v.optional(v.string()),
    logChannelId: v.optional(v.union(v.string(), v.null())),
    modRoles: v.optional(v.array(v.string())),
    adminRoles: v.optional(v.array(v.string())),
    badWords: v.optional(v.array(v.string())),
    // Verify system — bot commands `/verify` and `!verify` call this mutation
    verifyEnabled: v.optional(v.boolean()),
    verifyMethod: v.optional(v.union(v.literal("button"), v.literal("captcha"))),
    verifyChannelId: v.optional(v.union(v.string(), v.null())),
    unverifiedRoleId: v.optional(v.union(v.string(), v.null())),
    verifiedRoleId: v.optional(v.union(v.string(), v.null())),
    // Alt detection — các lệnh /alt on|off|punish|threshold|vpn gọi mutation này.
    // Thiếu các field dưới đây khiến validator từ chối (ArgumentValidationError)
    // và lệnh chạy thật hỏng câm — xem scripts/test-convex-arg-contract.cjs.
    altDetectionEnabled: v.optional(v.boolean()),
    vpnBlockEnabled: v.optional(v.boolean()),
    altMaxRiskScore: v.optional(v.number()),
    altPunish: v.optional(
      v.union(v.literal("kick"), v.literal("ban"), v.literal("timeout"), v.literal("verify")),
    ),
    altVpnMode: v.optional(v.union(v.literal("strict"), v.literal("warn"), v.literal("off"))),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", args.guildId))
      .first();
    if (!guild) throw new Error("Server chưa được đồng bộ");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.prefix !== undefined) {
      if (!/^[!^$#&%]{1,3}$/.test(args.prefix)) {
        throw new Error("Prefix phải là 1-3 ký tự đặc biệt");
      }
      patch.prefix = args.prefix;
    }
    if (args.logChannelId !== undefined) patch.logChannelId = args.logChannelId ?? undefined;
    if (args.modRoles !== undefined) patch.modRoles = args.modRoles;
    if (args.adminRoles !== undefined) patch.adminRoles = args.adminRoles;
    if (args.badWords !== undefined) {
      const words = args.badWords
        .map((w) => w.trim().toLowerCase())
        .filter((w) => w.length > 0 && w.length <= 40)
        .slice(0, 100);
      patch.badWords = [...new Set(words)];
    }
    if (args.verifyEnabled !== undefined) patch.verifyEnabled = args.verifyEnabled;
    if (args.verifyMethod !== undefined) patch.verifyMethod = args.verifyMethod;
    if (args.verifyChannelId !== undefined)
      patch.verifyChannelId = args.verifyChannelId ?? undefined;
    if (args.unverifiedRoleId !== undefined)
      patch.unverifiedRoleId = args.unverifiedRoleId ?? undefined;
    if (args.verifiedRoleId !== undefined) patch.verifiedRoleId = args.verifiedRoleId ?? undefined;
    if (args.altDetectionEnabled !== undefined)
      patch.altDetectionEnabled = args.altDetectionEnabled;
    if (args.vpnBlockEnabled !== undefined) patch.vpnBlockEnabled = args.vpnBlockEnabled;
    if (args.altMaxRiskScore !== undefined)
      patch.altMaxRiskScore = Math.max(10, Math.min(100, args.altMaxRiskScore));
    if (args.altPunish !== undefined) patch.altPunish = args.altPunish;
    if (args.altVpnMode !== undefined) patch.altVpnMode = args.altVpnMode;
    await ctx.db.patch(guild._id, patch);
    return { ok: true };
  },
});

export const botAutoReplyUpsert = mutation({
  args: {
    guildId: v.string(),
    name: v.string(),
    triggerType: v.union(v.literal("keyword"), v.literal("mention")),
    keywords: v.array(v.string()),
    response: v.string(),
    channels: v.array(v.string()),
    cooldownSeconds: v.number(),
    enabled: v.boolean(),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    if (!/^[a-z0-9_-]{1,32}$/i.test(args.name)) throw new Error("Tên rule không hợp lệ");
    const now = Date.now();
    const existing = await ctx.db
      .query("autoReplies")
      .withIndex("by_guildId_name", (q) => q.eq("guildId", args.guildId).eq("name", args.name))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        triggerType: args.triggerType,
        keywords: args.keywords,
        response: args.response,
        channels: args.channels,
        cooldownSeconds: args.cooldownSeconds,
        enabled: args.enabled,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("autoReplies", {
        guildId: args.guildId,
        name: args.name,
        triggerType: args.triggerType,
        keywords: args.keywords,
        response: args.response,
        channels: args.channels,
        cooldownSeconds: args.cooldownSeconds,
        enabled: args.enabled,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { ok: true };
  },
});

export const botAutoReplyRemove = mutation({
  args: {
    guildId: v.string(),
    name: v.string(),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, guildId, name }) => {
    await requireBotKeyStrict(ctx, botKey);
    const existing = await ctx.db
      .query("autoReplies")
      .withIndex("by_guildId_name", (q) => q.eq("guildId", guildId).eq("name", name))
      .first();
    if (existing) await ctx.db.delete(existing._id);
    return { ok: true };
  },
});

export const botModuleUpdate = mutation({
  args: {
    guildId: v.string(),
    module: v.string(),
    enabled: v.optional(v.boolean()),
    threshold: v.optional(v.number()),
    windowSeconds: v.optional(v.number()),
    punish: v.optional(
      v.union(v.literal("warn"), v.literal("kick"), v.literal("ban"), v.literal("timeout")),
    ),
    actions: v.optional(v.array(v.string())),
    timeoutSeconds: v.optional(v.number()),
    whitelistRoles: v.optional(v.array(v.string())),
    heat: v.optional(v.number()),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    if (!isAntiNukeModule(args.module)) throw new Error("Module không hợp lệ");
    const mod = await ctx.db
      .query("antinukeModules")
      .withIndex("by_guild_module", (q) => q.eq("guildId", args.guildId).eq("module", args.module))
      .first();
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.enabled !== undefined) patch.enabled = args.enabled;
    if (args.threshold !== undefined) patch.threshold = Math.max(1, args.threshold);
    if (args.windowSeconds !== undefined) patch.windowSeconds = Math.max(1, args.windowSeconds);
    if (args.actions !== undefined) {
      const { actions, strongest } = normalizeActions(args.actions);
      patch.actions = actions;
      patch.punish = strongest;
    } else if (args.punish !== undefined) {
      patch.punish = args.punish;
      patch.actions = [args.punish];
    }
    if (args.timeoutSeconds !== undefined) patch.timeoutSeconds = Math.max(1, args.timeoutSeconds);
    if (args.whitelistRoles !== undefined) patch.whitelistRoles = args.whitelistRoles;
    if (args.heat !== undefined) patch.heat = Math.max(1, Math.min(100, args.heat));
    if (mod) {
      await ctx.db.patch(mod._id, patch);
    } else {
      const { actions, strongest } = normalizeActions(args.actions);
      const punish = args.punish ?? strongest ?? "kick";
      await ctx.db.insert("antinukeModules", {
        guildId: args.guildId,
        module: args.module,
        enabled: args.enabled ?? true,
        threshold: args.threshold ?? 5,
        windowSeconds: args.windowSeconds ?? 10,
        punish,
        actions: actions.length > 0 ? actions : [punish],
        timeoutSeconds: args.timeoutSeconds ?? 300,
        whitelistRoles: args.whitelistRoles ?? [],
        heat: args.heat ?? 10,
        updatedAt: Date.now(),
      });
    }
    return { ok: true };
  },
});

export const botUpdateLockdown = mutation({
  args: {
    guildId: v.string(),
    enabled: v.optional(v.boolean()),
    minutes: v.optional(v.number()),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", args.guildId))
      .first();
    if (!guild) throw new Error("Server chưa được đồng bộ");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.enabled !== undefined) patch.lockdownEnabled = args.enabled;
    if (args.minutes !== undefined) {
      patch.lockdownMinutes = Math.max(1, Math.min(120, Math.floor(args.minutes)));
    }
    await ctx.db.patch(guild._id, patch);
    return { ok: true };
  },
});

/** Bot records the current lockdown state (until = unlock timestamp, requested = manual unlock flag). */
export const botLockState = mutation({
  args: {
    guildId: v.string(),
    until: v.optional(v.union(v.number(), v.null())),
    requested: v.optional(v.boolean()),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, guildId, until, requested }) => {
    await requireBotKeyStrict(ctx, botKey);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild) return { ok: true };
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (until !== undefined) patch.lockdownUntil = until ?? undefined;
    if (requested !== undefined) patch.lockdownRequested = requested;
    await ctx.db.patch(guild._id, patch);
    return { ok: true };
  },
});

/** Bot records a punished anti-nuke event for daily reports. */
export const botRecordAntinukeEvent = mutation({
  args: {
    guildId: v.string(),
    module: v.string(),
    executorId: v.optional(v.string()),
    executorName: v.optional(v.string()),
    action: v.string(),
    count: v.number(),
    windowSeconds: v.number(),
    threshold: v.number(),
    punish: v.string(),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    // Chống log "chồng chặp" trên dashboard: bot có thể kích hoạt 2 tầng cho cùng 1 vụ
    // (vd tầng audit IntegrationCreate + tầng tin nhắn app, hoặc pattern spam lặp lại trong
    // cửa sổ). Cùng guild + module + thủ phạm + count + ngưỡng ghi lại trong 5 giây
    // → coi là cùng 1 vụ, bỏ qua để feed "Hoạt động chống nuke" / "Lịch sử" không hiện trùng.
    const recent = await ctx.db
      .query("antinukeEvents")
      .withIndex("by_guildId_createdAt", (q) => q.eq("guildId", args.guildId))
      .order("desc")
      .take(10);
    const dup = recent.find(
      (r) =>
        Date.now() - r.createdAt < 5000 &&
        r.module === args.module &&
        r.executorId === args.executorId &&
        r.count === args.count &&
        r.threshold === args.threshold,
    );
    if (dup) return { ok: true, deduped: true };
    await ctx.db.insert("antinukeEvents", {
      guildId: args.guildId,
      module: args.module,
      executorId: args.executorId,
      executorName: args.executorName,
      executorNameLower: args.executorName ? args.executorName.toLowerCase() : undefined,
      action: args.action,
      count: args.count,
      windowSeconds: args.windowSeconds,
      threshold: args.threshold,
      punish: args.punish,
      createdAt: Date.now(),
    });
    // Chống phình DB: giữ tối đa 800 sự kiện/server. KHÔNG đọc toàn bộ mỗi lần ghi
    // (tốn ~800 reads/event) — dọn theo xác suất + lô, xem `shouldTrim`.
    if (shouldTrim()) {
      const newest = await ctx.db
        .query("antinukeEvents")
        .withIndex("by_guildId_createdAt", (q) => q.eq("guildId", args.guildId))
        .order("desc")
        .take(800 + TRIM_BATCH);
      await dropBeyondCap(ctx, newest, 800);
    }
    return { ok: true };
  },
});

/**
 * Batch upsert nhiệt độ + warn tích lũy cho NHIỀU thành viên trong 1 mutation.
 * Bot gom toàn bộ member đang nóng của 1 guild vào đây (thay vì N mutation
 * botRecordHeat riêng lẻ mỗi vòng flush) — cắt giảm operations đáng kể.
 */
export const botRecordHeatBatch = mutation({
  args: {
    guildId: v.string(),
    entries: v.array(
      v.object({
        userId: v.string(),
        username: v.optional(v.string()),
        heat: v.number(),
        updatedAt: v.number(),
        warnStrikes: v.optional(v.number()),
      }),
    ),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    for (const e of args.entries) {
      const existing = await ctx.db
        .query("heatStates")
        .withIndex("by_guildId_userId", (q) => q.eq("guildId", args.guildId).eq("userId", e.userId))
        .first();
      const strikes = Math.max(0, Math.floor(e.warnStrikes ?? 0));
      if (e.heat <= 0 && strikes <= 0) {
        if (existing) await ctx.db.delete(existing._id);
        continue;
      }
      if (existing) {
        await ctx.db.patch(existing._id, {
          username: e.username ?? existing.username,
          heat: clampHeat(e.heat),
          updatedAt: e.updatedAt,
          warnStrikes: strikes,
        });
      } else {
        await ctx.db.insert("heatStates", {
          guildId: args.guildId,
          userId: e.userId,
          username: e.username ?? "",
          heat: clampHeat(e.heat),
          updatedAt: e.updatedAt,
          warnStrikes: strikes,
        });
      }
    }
    return { ok: true, count: args.entries.length };
  },
});

/** Bot xóa cờ yêu cầu reset nhiệt sau khi đã dọn bộ nhớ. */
export const botClearHeatReset = mutation({
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
    if (!guild) return { ok: true };
    await ctx.db.patch(guild._id, {
      heatResetRequested: false,
      heatResetUserId: undefined,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Bot records when the daily report for a guild was sent. */
export const botSetReportAt = mutation({
  args: {
    guildId: v.string(),
    at: v.number(),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, guildId, at }) => {
    await requireBotKeyStrict(ctx, botKey);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild) return { ok: true };
    await ctx.db.patch(guild._id, { lastReportAt: at, updatedAt: Date.now() });
    return { ok: true };
  },
});

/** Bot đảm bảo mọi module mặc định tồn tại cho một guild (thêm các module còn thiếu). */
export const botEnsureModules = mutation({
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
    if (!guild) return { ok: true };
    const existing = await ctx.db
      .query("antinukeModules")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .collect();
    const have = new Set(existing.map((m) => m.module));
    const now = Date.now();
    for (const m of ANTI_NUKE_MODULES) {
      if (have.has(m.module)) continue;
      await ctx.db.insert("antinukeModules", {
        guildId,
        module: m.module,
        // MẶC ĐỊNH TẮT: chủ server tự bật từng module (hoặc nút "Bật toàn bộ")
        // trên web. Server ĐÃ có module không bị đụng tới (chỉ thêm module thiếu).
        enabled: false,
        threshold: m.threshold,
        windowSeconds: m.windowSeconds,
        punish: m.punish as "warn" | "kick" | "ban" | "timeout",
        whitelistRoles: [],
        timeoutSeconds: m.module === "spam" || m.module === "attachment" ? 300 : 600,
        heat: m.heat,
        updatedAt: now,
      });
    }
    return { ok: true };
  },
});

export const botSetAntinuke = mutation({
  args: {
    guildId: v.string(),
    enabled: v.boolean(),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, guildId, enabled }) => {
    await requireBotKeyStrict(ctx, botKey);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild) throw new Error("Server chưa được đồng bộ");
    await ctx.db.patch(guild._id, { antinukeEnabled: enabled, updatedAt: Date.now() });
    return { ok: true };
  },
});

/** Bot upserts the current heat level + warn strikes of one user in a guild. */
export const botRecordHeat = mutation({
  args: {
    guildId: v.string(),
    userId: v.string(),
    username: v.optional(v.string()),
    heat: v.number(),
    updatedAt: v.number(),
    warnStrikes: v.optional(v.number()),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    const existing = await ctx.db
      .query("heatStates")
      .withIndex("by_guildId_userId", (q) =>
        q.eq("guildId", args.guildId).eq("userId", args.userId),
      )
      .first();
    const strikes = Math.max(0, Math.floor(args.warnStrikes ?? 0));
    // Cả nhiệt lẫn warn đều bằng 0 → xóa hàng cũ (dọn dẹp)
    if (args.heat <= 0 && strikes <= 0) {
      if (existing) await ctx.db.delete(existing._id);
      return { ok: true };
    }
    if (existing) {
      await ctx.db.patch(existing._id, {
        username: args.username ?? existing.username,
        heat: clampHeat(args.heat),
        updatedAt: args.updatedAt,
        warnStrikes: strikes,
      });
    } else {
      await ctx.db.insert("heatStates", {
        guildId: args.guildId,
        userId: args.userId,
        username: args.username ?? "",
        heat: clampHeat(args.heat),
        updatedAt: args.updatedAt,
        warnStrikes: strikes,
      });
    }
    return { ok: true };
  },
});

/** Bot lưu một backup cấu trúc server vào bảng guildBackups (giữ tối đa 3 bản/server). */
export const botStoreBackup = mutation({
  args: {
    guildId: v.string(),
    guildName: v.string(),
    backupJson: v.string(),
    roleCount: v.number(),
    channelCount: v.number(),
    emojiCount: v.optional(v.number()),
    stickerCount: v.optional(v.number()),
    messageCount: v.optional(v.number()),
    source: v.optional(v.string()),
    /** SHA-256 checksum (nén + mã hóa) — bot gửi từ backupUtils. */
    backupChecksum: v.optional(v.string()),
    /** Backup có nén zlib không. */
    backupCompressed: v.optional(v.boolean()),
    /** Backup có mã hóa AES-256-GCM không. */
    backupEncrypted: v.optional(v.boolean()),
    /** Checksum "ổn định" của snapshot (so khớp incremental — bỏ qua khi không đổi). */
    backupSnapshotChecksum: v.optional(v.string()),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
    claimAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", args.guildId))
      .first();
    if (args.claimAt !== undefined && !guild) return { ok: false, reason: "no_guild" };
    const claimKind = args.source === "import" ? "import" : "backup";
    if (guild && !claimMatches(guild, claimKind, args.claimAt)) {
      return { ok: false, reason: "stale_claim" };
    }
    const now = Date.now();
    // Vượt trần 1 MB → tách chunk; document cha chỉ giữ ký hiệu + số chunk.
    const rawJson = args.backupJson;
    const chunked = rawJson.length > MAX_INLINE_CHARS;
    const chunkCount = chunked ? Math.ceil(rawJson.length / CHUNK_CHARS) : 0;
    const backupId = await ctx.db.insert("guildBackups", {
      guildId: args.guildId,
      guildName: args.guildName.slice(0, 120),
      backupJson: chunked ? `${CHUNKED_PREFIX}${chunkCount}` : rawJson,
      backupChunkCount: chunked ? chunkCount : undefined,
      roleCount: Math.max(0, Math.floor(args.roleCount)),
      channelCount: Math.max(0, Math.floor(args.channelCount)),
      emojiCount:
        args.emojiCount === undefined ? undefined : Math.max(0, Math.floor(args.emojiCount)),
      stickerCount:
        args.stickerCount === undefined ? undefined : Math.max(0, Math.floor(args.stickerCount)),
      messageCount:
        args.messageCount === undefined ? undefined : Math.max(0, Math.floor(args.messageCount)),
      source: args.source ?? undefined,
      backupChecksum: args.backupChecksum ?? undefined,
      backupCompressed: args.backupCompressed ?? undefined,
      backupEncrypted: args.backupEncrypted ?? undefined,
      backupSnapshotChecksum: args.backupSnapshotChecksum ?? undefined,
      pushedToGithub: false,
      createdAt: now,
    });
    // Ghi từng chunk sau khi đã có id bản cha (chunk tham chiếu backupId).
    if (chunked) {
      for (const [index, data] of splitBackupJson(rawJson).entries()) {
        await ctx.db.insert("backupChunks", {
          guildId: args.guildId,
          backupId,
          index,
          data,
          createdAt: now,
        });
      }
    }
    // Đánh dấu lần backup gần nhất — lịch tự động tính từ đây.
    if (guild) await ctx.db.patch(guild._id, { lastBackupAt: now, updatedAt: now });
    // Tự dọn dẹp backup tồn dư theo CẢ HAI quy tắc của server: giữ N bản mới
    // nhất + xoá mọi bản quá hạn (nếu bật). Trước đây `slice(3)` hard-code nên
    // không ai chỉnh được; server lớn mất dữ liệu, server nhỏ tốn chỗ vô ích.
    const all = await ctx.db
      .query("guildBackups")
      .withIndex("by_guildId", (q) => q.eq("guildId", args.guildId))
      .collect();
    const keepCount = clampRetention(guild?.backupKeepCount, 3, 2, 50);
    const keepDays = clampRetention(guild?.backupKeepDays, 0, 0, 365);
    // -Infinity = TẮT dọn theo tuổi. Dùng Infinity sẽ khiến mọi bản đều "quá hạn"
    // (createdAt < Infinity luôn đúng) và xoá sạch — đã dính lỗi này một lần.
    const cutoff = keepDays > 0 ? now - keepDays * 86_400_000 : -Infinity;
    const drop = all
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter((row, i) => i >= keepCount || row.createdAt < cutoff)
      .map((row) => row._id);
    for (const id of drop) {
      // Chunk là rác nếu bản cha biến mất — xoá kèm, không để lọt vào bảng.
      await deleteBackupChunks(ctx, id);
      await ctx.db.delete(id);
    }
    return { ok: true, backupId };
  },
});

/**
 * Bot (lệnh chat `!backup keep`) đổi quy tắc giữ bản: giữ N bản gần nhất và
 * dọn bản quá hạn. Bot TỰ ghi (nên không cần settingsChangedAt — không có
 * bundle cache nào đọc 2 field này; việc dọn chạy ngay trong botStoreBackup).
 */
export const botSetBackupRetention = mutation({
  args: {
    guildId: v.string(),
    keepCount: v.optional(v.number()),
    keepDays: v.optional(v.number()),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, guildId, keepCount, keepDays }) => {
    await requireBotKeyStrict(ctx, botKey);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild) return { ok: false, reason: "no_guild" };
    await ctx.db.patch(guild._id, {
      backupKeepCount:
        keepCount === undefined ? guild.backupKeepCount : clampRetention(keepCount, 3, 2, 50),
      backupKeepDays:
        keepDays === undefined ? guild.backupKeepDays : clampRetention(keepDays, 0, 0, 365),
      updatedAt: Date.now(),
    });
    return {
      ok: true,
      keepCount: clampRetention(keepCount ?? guild.backupKeepCount, 3, 2, 50),
      keepDays: clampRetention(keepDays ?? guild.backupKeepDays, 0, 0, 365),
    };
  },
});

/** Action backup:githubPush cập nhật URL gist sau khi đẩy thành công. */
export const botSetBackupGithub = mutation({
  args: {
    backupId: v.id("guildBackups"),
    url: v.string(),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, backupId, url }) => {
    await requireBotKeyStrict(ctx, botKey);
    const backup = await ctx.db.get(backupId);
    if (!backup) return { ok: true };
    await ctx.db.patch(backup._id, {
      githubUrl: url.slice(0, 500),
      pushedToGithub: true,
    });
    return { ok: true };
  },
});

/** Bot (lệnh !backup auto / /backup auto) bật/tắt tự động backup theo số ngày (2-30, 0 = tắt). */
export const botSetAutoBackup = mutation({
  args: {
    guildId: v.string(),
    days: v.number(),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, guildId, days }) => {
    await requireBotKeyStrict(ctx, botKey);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild) throw new Error("Server chưa được đồng bộ");
    const next = days <= 0 ? 0 : Math.max(2, Math.min(30, Math.floor(days)));
    await ctx.db.patch(guild._id, {
      backupAutoDays: next,
      updatedAt: Date.now(),
    });
    return { ok: true, days: next };
  },
});

/** Bot (lệnh !backup / /backup) đặt cờ yêu cầu tạo backup — vòng quét 20s sẽ thực hiện. */
export const botSetBackupRequest = mutation({
  args: {
    guildId: v.string(),
    pushToGithub: v.optional(v.boolean()),
    /** Kèm tin nhắn (tối đa 50 tin/kênh) khi chụp backup — auto sweep kế thừa
     * chế độ của bản gần nhất để checksum incremental không lệch. */
    includeMessages: v.optional(v.boolean()),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, guildId, pushToGithub, includeMessages }) => {
    await requireBotKeyStrict(ctx, botKey);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild) throw new Error("Server chưa được đồng bộ");
    if (!guild.botInGuild) throw new Error("Bot chưa có trong server này");
    if (
      claimIsActive(guild.backupClaimedAt, guild.backupLeaseUntil) ||
      claimIsActive(guild.restoreClaimedAt, guild.restoreLeaseUntil)
    ) {
      return { ok: false, reason: "in_flight" };
    }
    await ctx.db.patch(guild._id, {
      backupRequested: true,
      backupPushToGithub: !!pushToGithub,
      backupIncludeMessages: !!includeMessages,
      backupClaimedAt: undefined,
      backupLeaseUntil: undefined,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Bot (lệnh !backup restore / /backup restore) đặt cờ khôi phục cho một backup của đúng guild đó. */
export const botSetRestoreRequest = mutation({
  args: {
    guildId: v.string(),
    backupId: v.id("guildBackups"),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, guildId, backupId }) => {
    await requireBotKeyStrict(ctx, botKey);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild) throw new Error("Server chưa được đồng bộ");
    if (!guild.botInGuild) throw new Error("Bot chưa có trong server này");
    if (
      claimIsActive(guild.backupClaimedAt, guild.backupLeaseUntil) ||
      claimIsActive(guild.restoreClaimedAt, guild.restoreLeaseUntil)
    ) {
      return { ok: false, reason: "in_flight" };
    }
    const backup = await ctx.db.get(backupId);
    if (!backup || backup.guildId !== guildId) {
      throw new Error("Backup không tồn tại hoặc không thuộc server này");
    }
    await ctx.db.patch(guild._id, {
      restoreRequested: true,
      restoreBackupId: backupId,
      restoreClaimedAt: undefined,
      restoreLeaseUntil: undefined,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/**
 * Bot xóa 1 bản backup hỏng (audit từ scripts/audit-backups.cjs) — BẢO MẬT CAO.
 * Chỉ nhận id thuộc bảng guildBackups; botKey sai → từ chối tuyệt đối.
 * Bản "suspect" (checksum lệch) KHÔNG được xóa qua function này — giữ làm bằng chứng.
 */
export const botDeleteBackup = mutation({
  args: {
    backupId: v.id("guildBackups"),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, backupId }) => {
    await requireBotKeyStrict(ctx, botKey);
    const row = await ctx.db.get(backupId);
    if (!row) return { ok: true, alreadyGone: true };
    await deleteBackupChunks(ctx, backupId);
    await ctx.db.delete(backupId);
    return { ok: true, deleted: true, guildId: row.guildId };
  },
});

/**
 * Bot giành quyền xử lý một yêu cầu backup/khôi phục (chống lặp).
 * Chỉ bot claim THÀNH CÔNG mới được chạy; lượt quét khác/instance khác
 * gọi tới trong 10 phút sẽ bị từ chối và bỏ qua. Job còn sống có thể gia hạn lease
 * bằng `botRenewBackupClaim`; nếu bot chết, lease tự hết hạn để worker khác cứu.
 */
export const botClaimBackup = mutation({
  args: {
    guildId: v.string(),
    kind: v.union(
      v.literal("backup"),
      v.literal("restore"),
      v.literal("import"),
      v.literal("plan"),
    ),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, guildId, kind }) => {
    await requireBotKeyStrict(ctx, botKey);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild) return { ok: false, reason: "no_guild" };
    const now = Date.now();
    if (kind === "backup") {
      if (!guild.backupRequested) return { ok: false, reason: "no_request" };
      if (
        claimIsActive(guild.backupClaimedAt, guild.backupLeaseUntil) ||
        claimIsActive(guild.restoreClaimedAt, guild.restoreLeaseUntil)
      ) {
        return { ok: false, reason: "in_flight" };
      }
      await ctx.db.patch(guild._id, {
        backupClaimedAt: now,
        backupLeaseUntil: now + BACKUP_CLAIM_TTL_MS,
        updatedAt: now,
      });
      return { ok: true, claimAt: now };
    }
    if (kind === "import") {
      if (!guild.importRestoreRequested) return { ok: false, reason: "no_request" };
      if (
        claimIsActive(guild.backupClaimedAt, guild.backupLeaseUntil) ||
        claimIsActive(guild.restoreClaimedAt, guild.restoreLeaseUntil)
      ) {
        return { ok: false, reason: "in_flight" };
      }
      await ctx.db.patch(guild._id, {
        restoreClaimedAt: now,
        restoreLeaseUntil: now + BACKUP_CLAIM_TTL_MS,
        updatedAt: now,
      });
      return { ok: true, claimAt: now };
    }
    // Dry-run dùng CHUNG claim của restore: chủ server bấm "xem kế hoạch" rồi
    // bấm "khôi phục" ngay thì 2 việc phải loại trừ nhau, không được chạy chồng.
    if (kind === "plan") {
      if (!guild.restorePlanRequested) return { ok: false, reason: "no_request" };
      if (
        claimIsActive(guild.backupClaimedAt, guild.backupLeaseUntil) ||
        claimIsActive(guild.restoreClaimedAt, guild.restoreLeaseUntil)
      ) {
        return { ok: false, reason: "in_flight" };
      }
      await ctx.db.patch(guild._id, {
        restoreClaimedAt: now,
        restoreLeaseUntil: now + BACKUP_CLAIM_TTL_MS,
        updatedAt: now,
      });
      return { ok: true, claimAt: now };
    }
    if (!guild.restoreRequested) return { ok: false, reason: "no_request" };
    if (
      claimIsActive(guild.backupClaimedAt, guild.backupLeaseUntil) ||
      claimIsActive(guild.restoreClaimedAt, guild.restoreLeaseUntil)
    ) {
      return { ok: false, reason: "in_flight" };
    }
    await ctx.db.patch(guild._id, {
      restoreClaimedAt: now,
      restoreLeaseUntil: now + BACKUP_CLAIM_TTL_MS,
      updatedAt: now,
    });
    return { ok: true, claimAt: now };
  },
});

/** Bot gia hạn lease khi restore còn sống; claimAt giữ nguyên làm fencing token. */
export const botRenewBackupClaim = mutation({
  args: {
    guildId: v.string(),
    kind: v.union(
      v.literal("backup"),
      v.literal("restore"),
      v.literal("import"),
      v.literal("plan"),
    ),
    claimAt: v.number(),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, guildId, kind, claimAt }) => {
    await requireBotKeyStrict(ctx, botKey);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild) return { ok: false, reason: "no_guild" };
    if (!claimMatches(guild, kind, claimAt)) return { ok: false, reason: "stale_claim" };
    const leaseUntil = Date.now() + BACKUP_CLAIM_TTL_MS;
    if (kind === "backup") {
      await ctx.db.patch(guild._id, { backupLeaseUntil: leaseUntil, updatedAt: Date.now() });
    } else {
      await ctx.db.patch(guild._id, { restoreLeaseUntil: leaseUntil, updatedAt: Date.now() });
    }
    return { ok: true, leaseUntil };
  },
});

/**
 * Bot báo lỗi khôi phục — dashboard hiển thị lý do rõ ràng thay vì im lặng.
 * Xóa cờ restore (người dùng bấm lại sau khi khắc phục: bot online đủ quyền,
 * backup còn đọc được…).
 */
export const botReportRestoreError = mutation({
  args: {
    guildId: v.string(),
    error: v.string(),
    claimAt: v.optional(v.number()),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, guildId, error, claimAt }) => {
    await requireBotKeyStrict(ctx, botKey);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild) return { ok: true };
    if (!claimMatches(guild, "restore", claimAt)) return { ok: false, reason: "stale_claim" };
    await ctx.db.patch(guild._id, {
      restoreRequested: false,
      restoreBackupId: undefined,
      restoreClaimedAt: undefined,
      restoreLeaseUntil: undefined,
      restoreError: String(error || "Lỗi không xác định").slice(0, 300),
      restoreErrorAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Bot xóa cờ yêu cầu backup/khôi phục sau khi đã xử lý xong. */
export const botClearBackup = mutation({
  args: {
    guildId: v.string(),
    kind: v.union(
      v.literal("backup"),
      v.literal("restore"),
      v.literal("import"),
      v.literal("plan"),
    ),
    /** true khi backup đã lưu thành công (hoặc bỏ qua vì không đổi) — chỉ khi đó mới cập nhật lastBackupAt. */
    storeOk: v.optional(v.boolean()),
    /** Backup bị bỏ qua vì server không đổi (checksum trùng) — dashboard nói rõ lý do. */
    unchanged: v.optional(v.boolean()),
    claimAt: v.optional(v.number()),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, guildId, kind, storeOk, unchanged, claimAt }) => {
    await requireBotKeyStrict(ctx, botKey);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild) return { ok: true };
    if (!claimMatches(guild, kind, claimAt)) return { ok: false, reason: "stale_claim" };
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (kind === "backup") {
      patch.backupRequested = false;
      patch.backupPushToGithub = false;
      patch.backupClaimedAt = undefined;
      patch.backupLeaseUntil = undefined;
      patch.backupError = undefined;
      patch.backupErrorAt = undefined;
      // Backup đã xử lý xong (kể cả trường hợp bỏ qua vì checksum trùng) —
      // cập nhật mốc để botGetDueAuto không kích hoạt lại tức thì (chống lặp/spam).
      // Store thất bại → KHÔNG cập nhật, để bot thử lại ở vòng quét sau.
      if (storeOk !== false) patch.lastBackupAt = Date.now();
      // Mốc "xong" + lý do (không đổi) cho dashboard báo kết quả cho người dùng.
      // storeOk=false = lưu thất bại (bot còn thử lại) → KHÔNG đánh dấu xong, nếu
      // không dashboard sẽ đọc thành "vừa tạo xong một bản" trong khi thật ra lỗi.
      if (storeOk !== false) {
        patch.backupFinishedAt = Date.now();
        patch.backupUnchanged = !!unchanged;
      } else {
        // Lưu thất bại → xóa mốc: dashboard không được đọc thành "vừa tạo xong".
        patch.backupFinishedAt = undefined;
        patch.backupUnchanged = false;
      }
    } else if (kind === "import") {
      patch.importRestoreRequested = false;
      patch.importFileName = undefined;
      patch.importStorageId = undefined;
      patch.importError = undefined;
      patch.importErrorAt = undefined;
      patch.restoreClaimedAt = undefined;
      patch.restoreLeaseUntil = undefined;
      // Xóa luôn file backup đã tải lên (Convex file storage) — không để rác.
      if (guild.importStorageId) {
        try {
          await ctx.storage.delete(guild.importStorageId);
        } catch (e) {
          console.error(`[backup:clear:storage] ${guildId}:`, e instanceof Error ? e.message : e);
        }
      }
    } else if (kind === "plan") {
      // Dry-run KHÔNG đụng server nên không có "xong" để đánh dấu, và tuyệt đối
      // không đụng restoreFinishedAt — nếu không dashboard tưởng đã khôi phục xong.
      patch.restorePlanRequested = false;
      patch.restorePlanBackupId = undefined;
      patch.restoreClaimedAt = undefined;
      patch.restoreLeaseUntil = undefined;
    } else {
      patch.restoreRequested = false;
      patch.restoreBackupId = undefined;
      patch.restoreClaimedAt = undefined;
      patch.restoreLeaseUntil = undefined;
      patch.restoreError = undefined;
      patch.restoreErrorAt = undefined;
      patch.restoreFinishedAt = Date.now();
    }
    await ctx.db.patch(guild._id, patch);
    return { ok: true };
  },
});

/**
 * Bot báo KẾ HOẠCH khôi phục (dry-run) hoặc lỗi khi tính kế hoạch. Một mutation
 * duy nhất cho cả hai vì cả hai đều ghi kết quả vào CÙNG chỗ (trường hợp lỗi
 * thì `plan` rỗng) — tách làm hai sẽ dễ quên xóa cờ yêu cầu ở nhánh lỗi, và
 * dashboard mãi chờ một kế hoạch không bao giờ tới.
 */
export const botReportRestorePlan = mutation({
  args: {
    guildId: v.string(),
    /** Kế hoạch đã tính xong — bỏ trống khi tính lỗi. */
    plan: v.optional(
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
        settingsCount: v.number(),
        warnings: v.array(v.string()),
        at: v.number(),
      }),
    ),
    /** Lý do không tính được (backup hỏng, bot mất quyền…) — dashboard hiện ngay. */
    error: v.optional(v.string()),
    claimAt: v.optional(v.number()),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, guildId, plan, error, claimAt }) => {
    await requireBotKeyStrict(ctx, botKey);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild) return { ok: true };
    // Dry-run dùng chung claim với restore (xem botClaimBackup kind "plan").
    if (!claimMatches(guild, "plan", claimAt)) return { ok: false, reason: "stale_claim" };
    const failed = !!error;
    await ctx.db.patch(guild._id, {
      restorePlanRequested: false,
      restorePlanBackupId: undefined,
      restoreClaimedAt: undefined,
      restoreLeaseUntil: undefined,
      restorePlan: plan ?? undefined,
      restorePlanError: failed ? String(error || "Lỗi không xác định").slice(0, 300) : undefined,
      restorePlanErrorAt: failed ? Date.now() : undefined,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/**
 * Bot báo lỗi backup (chụp snapshot thất bại — bot thiếu quyền/không còn trong
 * server) — dashboard hiển thị lý do thay vì im lặng. Giữ `lastBackupAt` KHÔNG
 * đổi để lịch tự động có thể thử lại ở vòng sau.
 */
export const botReportBackupError = mutation({
  args: {
    guildId: v.string(),
    error: v.string(),
    claimAt: v.optional(v.number()),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, guildId, error, claimAt }) => {
    await requireBotKeyStrict(ctx, botKey);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild) return { ok: true };
    if (!claimMatches(guild, "backup", claimAt)) return { ok: false, reason: "stale_claim" };
    await ctx.db.patch(guild._id, {
      backupRequested: false,
      backupPushToGithub: false,
      backupClaimedAt: undefined,
      backupLeaseUntil: undefined,
      backupError: String(error || "Lỗi không xác định").slice(0, 300),
      backupErrorAt: Date.now(),
      // Xóa mốc "xong" cũ: lần này THẤT BẠI, giữ lại mốc cũ thì dashboard có thể
      // đọc nhầm thành vừa tạo xong một bản backup.
      backupFinishedAt: undefined,
      backupUnchanged: false,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/**
 * Bot báo lỗi xử lý file import (.msc/.json) — dashboard hiển thị lý do thay vì
 * im lặng. Xóa cờ + file (người dùng tải lại file khác), nhưng GIỮ lại lỗi để
 * web đọc qua backup:importStatus.
 */
export const botReportImportError = mutation({
  args: {
    guildId: v.string(),
    error: v.string(),
    claimAt: v.optional(v.number()),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, guildId, error, claimAt }) => {
    await requireBotKeyStrict(ctx, botKey);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild) return { ok: true };
    if (!claimMatches(guild, "import", claimAt)) return { ok: false, reason: "stale_claim" };
    await ctx.db.patch(guild._id, {
      importRestoreRequested: false,
      importFileName: undefined,
      importStorageId: undefined,
      importError: String(error || "Lỗi không xác định").slice(0, 300),
      importErrorAt: Date.now(),
      restoreClaimedAt: undefined,
      restoreLeaseUntil: undefined,
      updatedAt: Date.now(),
    });
    // Xóa file backup đã tải lên — không để rác storage (người dùng sẽ tải lại).
    if (guild.importStorageId) {
      try {
        await ctx.storage.delete(guild.importStorageId);
      } catch (e) {
        console.error(
          `[backup:import:error:storage] ${guildId}:`,
          e instanceof Error ? e.message : e,
        );
      }
    }
    return { ok: true };
  },
});

/** Bot ghi lại cấu hình cơ bản sau khi khôi phục backup (role/kênh đã map sang id mới). */
export const botRestoreSettings = mutation({
  args: {
    guildId: v.string(),
    prefix: v.optional(v.string()),
    badWords: v.optional(v.array(v.string())),
    whitelistRoles: v.optional(v.array(v.string())),
    whitelistUsers: v.optional(v.array(v.string())),
    modRoles: v.optional(v.array(v.string())),
    adminRoles: v.optional(v.array(v.string())),
    logChannelId: v.optional(v.union(v.string(), v.null())),
    modLogChannelId: v.optional(v.union(v.string(), v.null())),
    /** Claim timestamp để fence worker restore đã cũ. */
    claimAt: v.optional(v.number()),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", args.guildId))
      .first();
    if (!guild) throw new Error("Server chưa được đồng bộ");
    if (args.claimAt !== undefined && !claimMatches(guild, "restore", args.claimAt)) {
      return { ok: false, reason: "stale_claim" };
    }
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.prefix !== undefined) patch.prefix = args.prefix;
    if (args.badWords !== undefined) patch.badWords = args.badWords.slice(0, 100);
    if (args.whitelistRoles !== undefined) patch.whitelistRoles = args.whitelistRoles.slice(0, 100);
    if (args.whitelistUsers !== undefined) patch.whitelistUsers = args.whitelistUsers.slice(0, 100);
    if (args.modRoles !== undefined) patch.modRoles = args.modRoles.slice(0, 50);
    if (args.adminRoles !== undefined) patch.adminRoles = args.adminRoles.slice(0, 50);
    if (args.logChannelId !== undefined) patch.logChannelId = args.logChannelId ?? undefined;
    if (args.modLogChannelId !== undefined)
      patch.modLogChannelId = args.modLogChannelId ?? undefined;
    await ctx.db.patch(guild._id, patch);
    return { ok: true };
  },
});

export const botRecordModAction = mutation({
  args: {
    guildId: v.string(),
    action: v.string(),
    targetId: v.optional(v.string()),
    targetName: v.optional(v.string()),
    executorId: v.optional(v.string()),
    executorName: v.optional(v.string()),
    reason: v.optional(v.string()),
    details: v.optional(v.string()),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    const now = Date.now();
    // Số case tăng dần của server (kiểu Carl-bot): bắt đầu từ số case đã có nếu chưa ghi.
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", args.guildId))
      .first();
    let counter = guild?.modCaseCounter ?? 0;
    if (guild?.modCaseCounter === undefined) {
      const existing = await ctx.db
        .query("modActions")
        .withIndex("by_guildId", (q) => q.eq("guildId", args.guildId))
        .collect();
      counter = existing.length;
    }
    const caseNumber = counter + 1;
    if (guild) {
      await ctx.db.patch(guild._id, { modCaseCounter: caseNumber, updatedAt: now });
    }
    await ctx.db.insert("modActions", {
      guildId: args.guildId,
      action: args.action.slice(0, 30),
      targetId: args.targetId ?? undefined,
      targetName: args.targetName ? args.targetName.slice(0, 80) : undefined,
      executorId: args.executorId ?? undefined,
      executorName: args.executorName ? args.executorName.slice(0, 80) : undefined,
      reason: args.reason ? args.reason.slice(0, 500) : undefined,
      details: args.details ? args.details.slice(0, 200) : undefined,
      caseNumber,
      createdAt: now,
    });
    // Chống phình DB: giữ tối đa 100 bản/server — dọn theo xác suất + lô (xem `shouldTrim`).
    if (shouldTrim()) {
      const newest = await ctx.db
        .query("modActions")
        .withIndex("by_guildId_createdAt", (q) => q.eq("guildId", args.guildId))
        .order("desc")
        .take(100 + TRIM_BATCH);
      await dropBeyondCap(ctx, newest, 100);
    }
    return { ok: true, caseNumber };
  },
});

/** Bot ghi một mẫu dữ liệu raid/nuke (Raid Intel — dữ liệu huấn luyện). */
export const botRecordRaidSample = mutation({
  args: {
    guildId: v.string(),
    guildName: v.optional(v.string()),
    module: v.string(),
    count: v.number(),
    windowSeconds: v.number(),
    threshold: v.number(),
    action: v.optional(v.string()),
    punish: v.optional(v.string()),
    aiClassification: v.optional(v.string()),
    aiConfidence: v.optional(v.number()),
    aiReason: v.optional(v.string()),
    lockdownTriggered: v.optional(v.boolean()),
    punishedCount: v.optional(v.number()),
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
    sourceHunt: v.optional(
      v.object({
        suspectedSourceId: v.optional(v.string()),
        suspectedSourceName: v.optional(v.string()),
        reason: v.string(),
        banned: v.boolean(),
        confidence: v.number(),
      }),
    ),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    // Chống log "chồng chặp" trên tab Raid external app / Raid Intel: cùng guild + module +
    // count + ngưỡng ghi lại trong 5 giây → cùng 1 vụ (bot kích hoạt 2 tầng), bỏ qua.
    const recent = await ctx.db
      .query("raidSamples")
      .withIndex("by_guildId_createdAt", (q) => q.eq("guildId", args.guildId))
      .order("desc")
      .take(10);
    const dup = recent.find(
      (r) =>
        Date.now() - r.createdAt < 5000 &&
        r.module === args.module &&
        r.count === args.count &&
        r.threshold === args.threshold,
    );
    if (dup) return { ok: true, deduped: true };
    await ctx.db.insert("raidSamples", {
      guildId: args.guildId,
      guildName: args.guildName,
      module: args.module,
      count: args.count,
      windowSeconds: args.windowSeconds,
      threshold: args.threshold,
      action: args.action,
      punish: args.punish,
      aiClassification: args.aiClassification,
      aiConfidence: args.aiConfidence,
      aiReason: args.aiReason,
      lockdownTriggered: args.lockdownTriggered,
      punishedCount: args.punishedCount,
      clusterMemberCount: args.clusterMemberCount,
      clusterAvgAccountAgeDays: args.clusterAvgAccountAgeDays,
      clusterSharedAvatarCount: args.clusterSharedAvatarCount,
      clusterJoinBurstSeconds: args.clusterJoinBurstSeconds,
      apps: args.apps,
      punished: args.punished,
      sourceHunt: args.sourceHunt,
      createdAt: Date.now(),
    });
    // Chống phình DB: giữ tối đa 500 mẫu/server — đủ làm bộ dữ liệu huấn luyện
    // mà không làm chậm dashboard.
    const all = await ctx.db
      .query("raidSamples")
      .withIndex("by_guildId_createdAt", (q) => q.eq("guildId", args.guildId))
      .order("desc")
      .collect();
    if (all.length > 500) {
      const drop = all.slice(500).map((r) => r._id);
      for (const id of drop) await ctx.db.delete(id);
    }
    return { ok: true };
  },
});

/**
 * ═══ TICKET / KHIẾU NẠI (27/09/2026) ═══
 *
 * Hai mutation dưới đây là đường GHI duy nhất của ticket từ phía bot. Cùng
 * loại với `botRecordModAction`: cần `requireBotKeyStrict` (chỉ bot có
 * OWNER_SEED mới gọi được) và cắt mọi chuỗi theo giới hạn Discord.
 *
 * ⚠️ KHÔNG thêm `settingsChangedAt` ở đây: hai mutation này KHÔNG ghi field
 * cấu hình mà bot đọc (chúng ghi bảng `tickets`), nên không phải xoá cache
 * config. Cổng `check-settings-signal.cjs` miễn luật A cho mọi mutation
 * trong file này (luật B phủ) — thêm `settingsChangedAt` thừa sẽ chỉ làm
 * cache bị xoá vô nghĩa.
 */

/** Bot ghi bản ghi ticket lúc mở (điểm vào DM hoặc lệnh /ticket). */
export const botOpenTicket = mutation({
  args: {
    guildId: v.string(),
    channelId: v.string(),
    /** "appeal" | "support" — bot đã chuẩn hoá qua ticketCore.normalizeKind. */
    kind: v.string(),
    openerId: v.string(),
    openerName: v.string(),
    body: v.optional(v.string()),
    evidence: v.optional(v.string()),
    /**
     * Ô nhập bổ sung do chủ server thêm cho loại này (29/09/2026). Lưu kèm
     * nhãn để embed trong kênh + transcript hiện đúng tiêu đề ô.
     */
    fields: v.optional(
      v.array(
        v.object({
          label: v.string(),
          value: v.string(),
        }),
      ),
    ),
    /** "dm" | "command" */
    source: v.string(),
    /** Lỗi mở kênh (thiếu quyền, chạm trần 500 kênh…) — dashboard hiển thị. */
    openError: v.optional(v.string()),
    /** Chìa khóa bot (botAuth). */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    const now = Date.now();
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", args.guildId))
      .first();
    // Số thứ tự dùng CHUNG bộ đếm với mod case: một dãy số duy nhất trong
    // kênh log của server, đọc dễ hơn 2 dãy số lệch nhau.
    const number = (guild?.modCaseCounter ?? 0) + 1;
    if (guild) {
      await ctx.db.patch(guild._id, { modCaseCounter: number, updatedAt: now });
    }
    const id = await ctx.db.insert("tickets", {
      guildId: args.guildId,
      number,
      channelId: args.channelId,
      kind: args.kind,
      openerId: args.openerId,
      openerName: args.openerName.slice(0, 80),
      body: args.body ? args.body.slice(0, 1000) : undefined,
      evidence: args.evidence ? args.evidence.slice(0, 500) : undefined,
      // Cắt 3 ô × (nhãn 45 + giá trị 300) — chặn 1 modal gửi nội dung khổng lồ
      // làm phình document. Trần khớp MAX_EXTRA_FIELDS ở ticketKinds.ts.
      fields: args.fields
        ?.filter((f) => String(f?.value ?? "").trim())
        .slice(0, 3)
        .map((f) => ({
          label: String(f.label ?? "").slice(0, 45),
          value: String(f.value).slice(0, 300),
        })),
      source: args.source,
      status: "open",
      openError: args.openError ? args.openError.slice(0, 200) : undefined,
      openErrorAt: args.openError ? now : undefined,
      createdAt: now,
    });
    return { ok: true, ticketId: id, number };
  },
});

/**
 * Bot ghi trạng thái cuối của ticket khi staff bấm nút trong kênh.
 *
 * `status: "closed"` khi staff đóng; `"locked"` dành cho lượt tự dọn kênh ở
 * đợt sau (chưa dùng, nhưng đã khai trong schema để không phải migrate).
 */
export const botCloseTicket = mutation({
  args: {
    guildId: v.string(),
    /** id bản ghi lấy từ customId của nút (mã hoá sẵn). */
    ticketId: v.string(),
    /** "closed" | "locked" */
    status: v.string(),
    closedById: v.optional(v.string()),
    closedByName: v.optional(v.string()),
    closeReason: v.optional(v.string()),
    /** Staff bấm "Gỡ ban" trong ticket (thống kê dashboard; vòng đo đã chạy ở bot). */
    unbanned: v.optional(v.boolean()),
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    const row = await ctx.db
      .query("tickets")
      .withIndex("by_guildId", (q) => q.eq("guildId", args.guildId))
      .collect();
    const ticket = row.find((t) => t._id === args.ticketId);
    // Không tìm thấy = ticket đã bị dọn khỏi DB (giới hạn 200 bản/server).
    // Trả ok thay vì ném: người dùng bấm nút trên kênh cũ vẫn không nên thấy lỗi.
    if (!ticket) return { ok: true, found: false };
    const now = Date.now();
    await ctx.db.patch(ticket._id, {
      status: args.status === "locked" ? "locked" : "closed",
      closedById: args.closedById,
      closedByName: args.closedByName ? args.closedByName.slice(0, 80) : undefined,
      closeReason: args.closeReason ? args.closeReason.slice(0, 300) : undefined,
      unbanned: args.unbanned ?? ticket.unbanned,
      closedAt: now,
      // Bot gọi mutation này NGAY SAU khi đã thu quyền + đổi tên kênh →
      // đánh dấu để job tick không thu quyền lần hai. Job "closeChannel" chỉ
      // dành cho ticket đóng từ DASHBOARD (nơi chưa ai đụng kênh).
      ...(args.status === "locked" ? {} : { channelClosedAt: now }),
    });
    return { ok: true, found: true };
  },
});

/**
 * Bot ghi channelId thật + lỗi mở kênh vào bản ghi ticket.
 *
 * Vì sao tách khỏi `botOpenTicket`: số thứ tự ticket lấy từ bộ đếm chung với
 * mod case nên phải ghi bản ghi TRƯỚC khi tạo kênh (để lấy số đặt tên kênh).
 * Nhưng lúc đó chưa có channelId. Thay vì ghi 2 lần trong 1 mutation, tách
 * mutation này ra: `botOpenTicket` ghi với `channelId: "pending"`, xong tạo
 * kênh thì gọi `botSetTicketChannel` để điền lại.
 *
 * Nếu tiện thì có thể gộp — nhưng gộp sẽ mất thông tin "ticket đã mở nhưng
 * tạo kênh hỏng", vốn đúng thứ dashboard cần hiện cho staff.
 */
export const botSetTicketChannel = mutation({
  args: {
    guildId: v.string(),
    ticketId: v.string(),
    channelId: v.string(),
    /** Lỗi tạo kênh (thiếu quyền, chạm trần 500 kênh…) — dashboard hiển thị. */
    openError: v.optional(v.string()),
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    const ticket = await findGuildTicket(ctx, args.guildId, args.ticketId);
    if (!ticket) return { ok: true, found: false };
    await ctx.db.patch(ticket._id, {
      channelId: args.channelId,
      openError: args.openError ? args.openError.slice(0, 200) : undefined,
      openErrorAt: args.openError ? Date.now() : undefined,
    });
    return { ok: true, found: true };
  },
});

/**
 * Staff bấm "Nhận việc" — CHỈ 1 người nhận được.
 *
 * Vì sao phải chặn người sau: 3 mod cùng trả lời một khiếu nại là người mở
 * phải đọc 3 câu trả lời mâu thuẫn, và staff tốn thời gian viết lại. Trả về
 * `taken: true` + tên người đã nhận để bot báo lại cho người bấm sau.
 */
export const botClaimTicket = mutation({
  args: {
    guildId: v.string(),
    ticketId: v.string(),
    staffId: v.string(),
    staffName: v.optional(v.string()),
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    const ticket = await findGuildTicket(ctx, args.guildId, args.ticketId);
    if (!ticket) return { ok: false, reason: "not_found" };

    // Chặn ticket ĐÃ ĐÓNG: nút "Nhận việc" vẫn còn trong panel của kênh
    // `closed-*` (bot đóng bằng cách thu quyền + đổi tên, KHÔNG xoá panel)
    // nên staff bấm "Nhận việc" trên ticket đã xong sẽ ghi nhận việc lên
    // kênh chết, và dashboard hiện người nhận cho ticket đã đóng.
    if (ticket.status !== "open") return { ok: false, reason: "closed" };
    // Bấm lại nút của chính mình → idempotent, không báo "đã có người nhận".
    if (ticket.claimedById === args.staffId) {
      return { ok: true, taken: false, alreadyMine: true, byName: ticket.claimedByName ?? null };
    }
    if (ticket.claimedById) {
      return { ok: false, reason: "taken", byName: ticket.claimedByName ?? null };
    }
    await ctx.db.patch(ticket._id, {
      claimedById: args.staffId,
      claimedByName: args.staffName ? args.staffName.slice(0, 80) : undefined,
      claimedAt: Date.now(),
    });
    return { ok: true, taken: true, byName: args.staffName ?? null };
  },
});

/** Bỏ nhận (staff đổi ý / ticket chuyển người) — giải phóng cho người khác nhận. */
export const botUnclaimTicket = mutation({
  args: {
    guildId: v.string(),
    ticketId: v.string(),
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    const ticket = await findGuildTicket(ctx, args.guildId, args.ticketId);
    if (!ticket) return { ok: true, found: false };
    await ctx.db.patch(ticket._id, {
      claimedById: undefined,
      claimedByName: undefined,
      claimedAt: undefined,
    });
    return { ok: true, found: true };
  },
});

/**
 * Bot đã thu quyền + đổi tên kênh cho ticket đóng từ DASHBOARD.
 *
 * Job `closeChannel` trong `getPendingJobs` gọi mutation này sau khi
 * `closeTicketChannel` chạy xong. Không có mốc đó thì mỗi lượt tick lại
 * thu quyền một lần nữa (vô hại nhưng spam API Discord mỗi vòng).
 *
 * KHÔNG đụng `closedAt`: chạm vào nó là đẩy lùi thêm `closeGraceHours`
 * lượt dọn kênh, vài lượt là kênh ticket không bao giờ được dọn.
 */
export const botMarkTicketChannelClosed = mutation({
  args: {
    guildId: v.string(),
    ticketId: v.string(),
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    const ticket = await findGuildTicket(ctx, args.guildId, args.ticketId);
    if (!ticket) return { ok: true, found: false };
    await ctx.db.patch(ticket._id, { channelClosedAt: Date.now() });
    return { ok: true, found: true };
  },
});

/**
 * Có người chat trong kênh ticket → đẩy lùi đồng hồ tự đóng.
 *
 * Ghi theo lô (mảng userId) vì bot nhận event messageCreate cho TỪNG tin nhắn:
 * gọi 1 mutation/tin nhắn là đốt operations vô ích. `lastActivityAt` chỉ đưa
 * lùi, không bao giờ đi tới — nếu không, một tin nhắn cũ đọc lại từ backlog
 * Discord sẽ giữ ticket mở mãi.
 */
export const botTouchTickets = mutation({
  args: {
    guildId: v.string(),
    channelIds: v.array(v.string()),
    at: v.optional(v.number()),
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    const now = args.at ?? Date.now();
    let touched = 0;
    // Tra ĐÚNG kênh qua index (guildId, channelId). Hàm này chạy MỖI tin nhắn
    // trong kênh ticket; bản cũ `collect()` toàn bộ ticket của guild rồi tự
    // `.find` → server 300 ticket tốn ~300 lượt đọc document (kèm `body` dài)
    // cho mỗi tin nhắn chỉ để sửa 1 hàng. Giờ đúng 1 document/kênh.
    for (const channelId of args.channelIds) {
      const t = await ctx.db
        .query("tickets")
        .withIndex("by_guildId_channelId", (q) =>
          q.eq("guildId", args.guildId).eq("channelId", channelId),
        )
        .first();
      if (!t || t.status !== "open") continue;
      const forward = (t.lastActivityAt ?? t.createdAt) < now;
      // Bộ đếm tin nhắn tăng Ở MỌI lượt, kể cả lượt mà đồng hồ im lặng KHÔNG
      // lùi được (2 tin gửi trong cùng mili-giây). Gộp vào nhánh `continue`
      // cũ thì ngân sách tin nhắn đếm thiếu → người spam không bao giờ bị chặn.
      await ctx.db.patch(t._id, {
        ...(forward ? { lastActivityAt: now } : {}),
        messageCount: (t.messageCount ?? 0) + 1,
      });
      if (forward) touched++;
    }
    return { touched };
  },
});

/**
 * Lưu transcript vào storage + đánh dấu đã lưu — BẮT BUỘC trước khi xoá kênh.
 *
 * Vì sao tách 2 bước: xoá kênh Discord là không hoàn tác được. Nếu gộp "lưu +
 * xoá" thành 1 mutation mà storage ghi lỗi, bản ghi vẫn ghi `transcriptStorageId`
 * thành công trong khi file không tồn tại → staff thấy "đã lưu" rồi mở ra thì
 * 404. Tách ra, bot chỉ xoá kênh sau khi mutation này trả `ok: true`.
 */
export const botSaveTicketTranscript = mutation({
  args: {
    guildId: v.string(),
    ticketId: v.string(),
    storageId: v.string(),
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    const ticket = await findGuildTicket(ctx, args.guildId, args.ticketId);
    if (!ticket) return { ok: true, found: false };
    await ctx.db.patch(ticket._id, {
      transcriptStorageId: args.storageId,
      transcriptAt: Date.now(),
    });
    return { ok: true, found: true };
  },
});

/** Lưu ngôn ngữ người dùng chọn qua `/language`. */
export const botSetUserLang = mutation({
  args: {
    userId: v.string(),
    lang: v.string(),
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    // Chỉ nhận ngôn ngữ bot thực sự hỗ trợ — rác thì bỏ qua, không ghi.
    if (!["vi", "en", "de"].includes(args.lang)) return { ok: false };
    const row = await ctx.db
      .query("userLangs")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();
    const now = Date.now();
    if (row) await ctx.db.patch(row._id, { lang: args.lang, updatedAt: now });
    else await ctx.db.insert("userLangs", { userId: args.userId, lang: args.lang, updatedAt: now });
    return { ok: true };
  },
});

/** Đọc ngôn ngữ người dùng đã chọn; null = chưa chọn (bot tự nhận ra locale). */
export const botGetUserLang = query({
  args: {
    userId: v.string(),
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    const row = await ctx.db
      .query("userLangs")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();
    return { lang: row?.lang ?? null };
  },
});
