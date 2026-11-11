/**
 * verify.ts — lõi luồng xác minh web kiểu Double Counter.
 *
 * Luồng đầy đủ:
 *  1. Bot gọi `botCreateSession` khi thành viên vào server (hoặc bấm nút trên
 *     panel) → nhận token 256-bit, DM link `/verify/<token>`.
 *  2. Trình duyệt mở link → `getSession` (công khai, chỉ đọc metadata).
 *  3. Trang thu tín hiệu ẩn rồi POST `/verify/complete` → `verifyActions.collect`
 *     (Node runtime, đọc env + gọi ipapi.is) → `finalize` (dưới đây) quyết định
 *     và ghi DB.
 *  4. Bot tick đọc `botPendingGrants` → cấp role / kick / ban → `botFinishGrant`.
 *
 * Nguyên tắc bảo mật (xem docs/verify-ip-architecture.md):
 *  - KHÔNG lưu IP thô. Mọi giá trị nhận dạng là HMAC-SHA-256 với `IP_HASH_SECRET`.
 *  - Token chỉ lưu SHA-256(token) — lộ DB không dùng lại được link.
 *  - Mọi function bot dùng `requireBotKeyStrict`; mọi function dashboard dùng
 *    `canManageGuild`.
 */

import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { canManageGuild, getUserByToken } from "./auth";
import { requireBotKeyStrict } from "./botAuth";
import {
  VERIFY_SESSION_TTL_MS,
  clampBanDays,
  generateVerifyToken,
  hashVerifyToken,
} from "./verifyCrypto";
import { decideVerify, type VerifyLink, type VpnMode, type AltPunish } from "./verifyPolicy";

/** Số phiên bot nhận mỗi lượt tick — trần để một server lỗi không nuốt cả lượt. */
const GRANT_TAKE = 60;
/** Trần phiên hiển thị trên dashboard mỗi lần đọc. */
const LIST_TAKE = 100;

/**
 * Trọng số từng tín hiệu khi tính độ mạnh của một link.
 *
 * Vì sao fingerprint nặng nhất: IP đổi khi đổi mạng, cookie bị xoá thường
 * xuyên, còn tổ hợp canvas/WebGL/font/screen/hardware gần như bất biến trên
 * cùng một máy. UA một mình quá phổ biến nên gần như chỉ dùng để cộng nhẹ.
 * Tổng tối đa 100 (cộng rồi kẹp) — khớp thang riskScore của toàn repo.
 */
export const SIGNAL_WEIGHT = {
  fingerprint: 70,
  cookie: 55,
  ip: 45,
  userAgent: 15,
} as const;

export type SignalKind = keyof typeof SIGNAL_WEIGHT;

/** Một tín hiệu đã băm, kèm loại — dùng chung cho ghi DB và chấm điểm link. */
type HashedSignal = { kind: SignalKind; valueHash: string };

const SIGNAL_LABEL: Record<SignalKind, string> = {
  fingerprint: "fingerprint_match",
  cookie: "cookie_match",
  ip: "ip_match",
  userAgent: "ua_match",
};

/** Chuẩn hoá đầu vào hex 64 — chặn rác chèn vào index trước khi tốn read. */
function isHex64(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

/** So khớp hash trong whitelist mà không lộ thời gian (constant-time-ish). */
function hashInList(list: string[] | undefined, hash: string | undefined): boolean {
  if (!list?.length || !hash) return false;
  let hit = 0;
  for (const item of list) {
    if (item.length !== hash.length) continue;
    let diff = 0;
    for (let i = 0; i < item.length; i++) diff |= item.charCodeAt(i) ^ hash.charCodeAt(i);
    if (diff === 0) hit = 1;
  }
  return hit === 1;
}

async function guildByDiscordId(ctx: QueryCtx | MutationCtx, guildId: string) {
  return await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
    .first();
}

/**
 * Cộng điểm các tín hiệu trùng với tài khoản KHÁC.
 *
 * Trả về tối đa 6 link mạnh nhất (mỗi user một link). Không bao giờ trả chính
 * người đang verify — nếu không mọi lượt verify lại đều tự khớp với bản ghi cũ
 * của chính họ và mọi người bị gắn cờ "có alt".
 */
async function computeLinks(
  ctx: MutationCtx,
  guildId: string,
  userId: string,
  signals: HashedSignal[],
): Promise<VerifyLink[]> {
  const scores = new Map<string, { score: number; reasons: Set<string> }>();
  for (const signal of signals) {
    const rows = await ctx.db
      .query("verifySignals")
      .withIndex("by_kind_valueHash", (q) =>
        q.eq("kind", signal.kind).eq("valueHash", signal.valueHash),
      )
      .take(40);
    for (const row of rows) {
      if (row.userId === userId) continue;
      const entry = scores.get(row.userId) ?? { score: 0, reasons: new Set<string>() };
      entry.score += SIGNAL_WEIGHT[signal.kind];
      entry.reasons.add(SIGNAL_LABEL[signal.kind]);
      scores.set(row.userId, entry);
    }
  }
  if (scores.size === 0) return [];

  // Tra trạng thái ban của các ứng viên — chỉ cần cho người có điểm cao nhất.
  const candidates = [...scores.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, 6);

  const out: VerifyLink[] = [];
  for (const [linkedUserId, entry] of candidates) {
    const ban = await ctx.db
      .query("guildBans")
      .withIndex("by_guildId_userId", (q) => q.eq("guildId", guildId).eq("userId", linkedUserId))
      .first();
    out.push({
      userId: linkedUserId,
      score: Math.min(100, entry.score),
      reasons: [...entry.reasons],
      banned: Boolean(ban?.active),
    });
  }
  return out;
}

/** Upsert một dòng đồ thị identity cho mỗi (kind, hash, user). */
async function recordSignals(
  ctx: MutationCtx,
  guildId: string,
  userId: string,
  signals: HashedSignal[],
  sessionId: Id<"verifySessions">,
): Promise<void> {
  const now = Date.now();
  for (const signal of signals) {
    const existing = await ctx.db
      .query("verifySignals")
      .withIndex("by_kind_valueHash_userId", (q) =>
        q.eq("kind", signal.kind).eq("valueHash", signal.valueHash).eq("userId", userId),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        lastSeenAt: now,
        hits: existing.hits + 1,
        lastSessionId: sessionId,
      });
    } else {
      await ctx.db.insert("verifySignals", {
        kind: signal.kind,
        valueHash: signal.valueHash,
        userId,
        guildId,
        firstSeenAt: now,
        lastSeenAt: now,
        hits: 1,
        lastSessionId: sessionId,
      });
    }
  }
}

/** Upsert cạnh giữa hai account — luôn lưu cặp đã sắp xếp để không nhân đôi. */
async function upsertLink(
  ctx: MutationCtx,
  guildId: string,
  a: string,
  b: string,
  score: number,
  reasons: string[],
): Promise<void> {
  const [userId, linkedUserId] = a < b ? [a, b] : [b, a];
  const existing = await ctx.db
    .query("verifyLinks")
    .withIndex("by_guildId_userId", (q) => q.eq("guildId", guildId).eq("userId", userId))
    .filter((q) => q.eq(q.field("linkedUserId"), linkedUserId))
    .first();
  const now = Date.now();
  if (existing) {
    // Không hạ điểm cũ: một lần trùng yếu hơn không xoá bằng chứng mạnh trước đó.
    await ctx.db.patch(existing._id, {
      score: Math.max(existing.score, score),
      reasons: [...new Set([...existing.reasons, ...reasons])].slice(0, 12),
      updatedAt: now,
      lastSignalAt: now,
      status: existing.status === "dismissed" ? "dismissed" : existing.status,
    });
    return;
  }
  await ctx.db.insert("verifyLinks", {
    guildId,
    userId,
    linkedUserId,
    score,
    reasons: reasons.slice(0, 12),
    status: "candidate",
    createdAt: now,
    updatedAt: now,
    lastSignalAt: now,
  });
}

/** Ghi audit — mọi quyết định verify đều truy vết được về sau. */
async function audit(
  ctx: MutationCtx,
  entry: {
    guildId: string;
    userId?: string;
    sessionId?: Id<"verifySessions">;
    action: string;
    actor: string;
    reason?: string;
    details?: string;
  },
): Promise<void> {
  await ctx.db.insert("verifyAudit", { ...entry, createdAt: Date.now() });
}

/**
 * Trang verify đọc metadata phiên. Công khai nhưng KHÔNG trả gì nhạy cảm:
 * token 256-bit là capability duy nhất; đoán được là bất khả thi.
 */
export const getSession = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const token = args.token.trim();
    if (!token || token.length > 128) return null;
    const session = await ctx.db
      .query("verifySessions")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", hashVerifyToken(token)))
      .first();
    if (!session) return null;
    const guild = await guildByDiscordId(ctx, session.guildId);
    const now = Date.now();
    // Phiên chưa dùng nhưng quá hạn → trả trạng thái "expired" thay vì lỗi mơ hồ.
    const status =
      session.status === "pending" && session.expiresAt < now ? "expired" : session.status;
    return {
      status,
      guildId: session.guildId,
      guildName: guild?.name ?? "",
      guildIcon: guild?.icon ?? null,
      userId: session.userId,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      decision: session.decision ?? null,
      reason: session.reason ?? null,
    };
  },
});

/**
 * Bot tạo phiên verify cho một thành viên.
 *
 * Bất biến: mỗi lượt tạo mới đánh dấu các phiên pending cũ của CÙNG user/guild
 * là "expired". Không dọn thì bấm nút 5 lần tạo 5 link cùng sống — link cũ vẫn
 * dùng được sau khi đã verify, phá tính "một link một lần".
 */
export const botCreateSession = mutation({
  args: {
    guildId: v.string(),
    userId: v.string(),
    /** Owner/admin/bot — bot tự xác định từ role, không bao giờ auto-ban. */
    privileged: v.optional(v.boolean()),
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    const guild = await guildByDiscordId(ctx, args.guildId);
    if (!guild) throw new Error("Server chưa được đồng bộ");
    if (!guild.verifyWebEnabled) throw new Error("Server chưa bật xác minh web");
    if (!/^\d{15,21}$/.test(args.userId)) throw new Error("userId không hợp lệ");

    const now = Date.now();
    const stale = await ctx.db
      .query("verifySessions")
      .withIndex("by_guildId_userId_createdAt", (q) =>
        q.eq("guildId", args.guildId).eq("userId", args.userId),
      )
      .order("desc")
      .take(10);
    for (const row of stale) {
      if (row.status === "pending") await ctx.db.patch(row._id, { status: "expired" });
    }

    const token = generateVerifyToken();
    const expiresAt = now + VERIFY_SESSION_TTL_MS;
    await ctx.db.insert("verifySessions", {
      tokenHash: hashVerifyToken(token),
      guildId: args.guildId,
      userId: args.userId,
      privileged: args.privileged === true,
      createdAt: now,
      expiresAt,
      status: "pending",
    });
    return { token, expiresAt };
  },
});

/** Action Node đọc phiên trước khi xử lý (không trả tokenHash ra ngoài phạm vi nội bộ). */
export const getSessionForAction = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("verifySessions")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
  },
});

/** Cache kết quả ipapi.is theo hash global — không bao giờ theo IP thô. */
export const getIntelCache = internalQuery({
  args: { ipHash: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("ipIntelCache")
      .withIndex("by_ipHash", (q) => q.eq("ipHash", args.ipHash))
      .first();
    if (!row || row.expiresAt < Date.now()) return null;
    return row;
  },
});

export const putIntelCache = internalMutation({
  args: {
    ipHash: v.string(),
    country: v.optional(v.string()),
    asn: v.optional(v.number()),
    org: v.optional(v.string()),
    isVpn: v.boolean(),
    isProxy: v.optional(v.boolean()),
    isTor: v.optional(v.boolean()),
    isHosting: v.optional(v.boolean()),
    isMobile: v.optional(v.boolean()),
    isAbuser: v.optional(v.boolean()),
    ttlMs: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("ipIntelCache")
      .withIndex("by_ipHash", (q) => q.eq("ipHash", args.ipHash))
      .first();
    const row = {
      provider: "ipapi.is",
      country: args.country,
      asn: args.asn,
      org: args.org,
      isVpn: args.isVpn,
      isProxy: args.isProxy,
      isTor: args.isTor,
      isHosting: args.isHosting,
      isMobile: args.isMobile,
      isAbuser: args.isAbuser,
      checkedAt: now,
      expiresAt: now + Math.max(60_000, Math.min(7 * 24 * 3600_000, args.ttlMs)),
    };
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("ipIntelCache", { ipHash: args.ipHash, ...row });
  },
});

/** Đánh dấu phiên hỏng vì lý do kỹ thuật (thiếu secret, mạng lỗi…). */
export const markFailed = internalMutation({
  args: { tokenHash: v.string(), failureCode: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("verifySessions")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
    if (!session || session.status !== "pending") return { ok: false };
    await ctx.db.patch(session._id, { status: "failed", failureCode: args.failureCode });
    return { ok: true };
  },
});

/**
 * Quyết định cuối cùng + ghi toàn bộ dữ liệu của một lượt verify.
 *
 * Chạy trong mutation (default runtime) vì cần đọc/ghi DB; mọi thứ cần env
 * hoặc mạng đã làm xong ở `verifyActions.collect`.
 */
export const finalize = internalMutation({
  args: {
    tokenHash: v.string(),
    ipHash: v.string(),
    ipPrefixHash: v.optional(v.string()),
    globalIpHash: v.string(),
    fingerprintHash: v.optional(v.string()),
    cookieHash: v.optional(v.string()),
    uaHash: v.optional(v.string()),
    sharedIp: v.boolean(),
    human: v.boolean(),
    consentVersion: v.optional(v.string()),
    intel: v.optional(
      v.object({
        country: v.optional(v.string()),
        asn: v.optional(v.number()),
        org: v.optional(v.string()),
        isVpn: v.optional(v.boolean()),
        isProxy: v.optional(v.boolean()),
        isTor: v.optional(v.boolean()),
        isHosting: v.optional(v.boolean()),
        isMobile: v.optional(v.boolean()),
        isAbuser: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("verifySessions")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
    if (!session) return { ok: false as const, code: "not_found" };
    if (session.status !== "pending") return { ok: false as const, code: "used" };
    if (session.expiresAt < Date.now()) {
      await ctx.db.patch(session._id, { status: "expired" });
      return { ok: false as const, code: "expired" };
    }
    const guild = await guildByDiscordId(ctx, session.guildId);
    if (!guild) return { ok: false as const, code: "guild_missing" };

    const signals: HashedSignal[] = [];
    if (isHex64(args.ipHash)) signals.push({ kind: "ip", valueHash: args.ipHash });
    if (isHex64(args.fingerprintHash))
      signals.push({ kind: "fingerprint", valueHash: args.fingerprintHash });
    if (isHex64(args.cookieHash)) signals.push({ kind: "cookie", valueHash: args.cookieHash });
    if (isHex64(args.uaHash)) signals.push({ kind: "userAgent", valueHash: args.uaHash });

    const links = await computeLinks(ctx, session.guildId, session.userId, signals);

    // IP ban: khớp chính xác, hoặc khớp prefix /64 (chỉ khi admin bật scope prefix).
    let ipBanned = false;
    if (isHex64(args.ipHash)) {
      const exact = await ctx.db
        .query("ipBans")
        .withIndex("by_guildId_ipHash", (q) =>
          q.eq("guildId", session.guildId).eq("ipHash", args.ipHash),
        )
        .first();
      ipBanned = Boolean(exact && exact.active && exact.expiresAt > Date.now());
    }
    if (!ipBanned && args.ipPrefixHash) {
      const prefix = await ctx.db
        .query("ipBans")
        .withIndex("by_guildId_ipPrefixHash", (q) =>
          q.eq("guildId", session.guildId).eq("ipPrefixHash", args.ipPrefixHash),
        )
        .first();
      ipBanned = Boolean(prefix && prefix.active && prefix.expiresAt > Date.now());
    }

    const userWhitelisted =
      (guild.altWhitelistUsers ?? []).includes(session.userId) ||
      (guild.whitelistUsers ?? []).includes(session.userId);

    const result = decideVerify({
      ipBanned,
      ipBanAction: (guild.ipBanAction ?? "deny") as "deny" | "ban",
      ipBanWhitelisted: hashInList(guild.ipBanWhitelistHashes, args.ipHash),
      userWhitelisted,
      privileged: session.privileged === true,
      sharedIp: args.sharedIp,
      intel: args.intel ?? null,
      vpnMode: (guild.altVpnMode ?? "off") as VpnMode,
      altPunish: (guild.altPunish ?? "kick") as AltPunish,
      links,
    });

    // Chốt chống lách: honeypot/bẫy người-thật không đạt thì KHÔNG BAO GIỜ allow,
    // kể cả khi mọi tín hiệu sạch. Đây là thứ thay captcha hình ảnh.
    const humanFailed = !args.human && result.decision === "allow";

    const decision = humanFailed ? "deny" : result.decision;
    const reason = humanFailed ? "human_check_failed" : (result.reasons[0] ?? "allow");
    const punish = humanFailed ? "kick" : result.punish;

    const topLink = links[0];
    const status = decision === "allow" ? "verified" : decision === "ban" ? "banned" : "denied";

    await ctx.db.patch(session._id, {
      consumedAt: Date.now(),
      status,
      decision,
      reason,
      punish: punish ?? undefined,
      riskScore: result.riskScore,
      ipHash: args.ipHash,
      ipPrefixHash: args.ipPrefixHash,
      globalIpHash: args.globalIpHash,
      fingerprintHash: args.fingerprintHash,
      cookieHash: args.cookieHash,
      uaHash: args.uaHash,
      country: args.intel?.country,
      asn: args.intel?.asn,
      org: args.intel?.org,
      isVpn: args.intel?.isVpn,
      isProxy: args.intel?.isProxy,
      isTor: args.intel?.isTor,
      isHosting: args.intel?.isHosting,
      isMobile: args.intel?.isMobile,
      isAbuser: args.intel?.isAbuser,
      sharedIp: args.sharedIp,
      linkedUserId: topLink?.userId,
      linkScore: topLink?.score,
      linkReasons: topLink?.reasons.slice(0, 8),
      consentVersion: args.consentVersion,
      grantPending: true,
      grantAttempts: 0,
    });

    if (signals.length > 0) {
      await recordSignals(ctx, session.guildId, session.userId, signals, session._id);
      for (const link of links) {
        await upsertLink(
          ctx,
          session.guildId,
          session.userId,
          link.userId,
          link.score,
          link.reasons,
        );
      }
    }

    await audit(ctx, {
      guildId: session.guildId,
      userId: session.userId,
      sessionId: session._id,
      action: "verify_completed",
      actor: "web",
      reason,
      details: JSON.stringify({
        decision,
        riskScore: result.riskScore,
        flagged: result.flagged,
        reasons: result.reasons.slice(0, 8),
        linkScore: topLink?.score ?? 0,
      }),
    });

    return {
      ok: true as const,
      decision,
      reason,
      punish: punish ?? null,
      riskScore: result.riskScore,
      flagged: result.flagged || humanFailed,
      // Web chỉ cần biết "qua hay không"; chi tiết (VPN/alt) ở lại phía server.
      country: args.intel?.country ?? null,
    };
  },
});

/**
 * Bot đọc các phiên đã có kết quả nhưng chưa được thi hành.
 *
 * Dùng index boolean `grantPending` thay vì quét `status`: quét theo status
 * phải đọc mọi phiên "verified" từ trước tới nay mỗi lượt tick.
 */
export const botPendingGrants = query({
  args: { botKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    const rows = await ctx.db
      .query("verifySessions")
      .withIndex("by_grantPending", (q) => q.eq("grantPending", true))
      .take(GRANT_TAKE);
    return rows.map((row) => ({
      id: row._id,
      guildId: row.guildId,
      userId: row.userId,
      decision: row.decision ?? "deny",
      reason: row.reason ?? "",
      punish: row.punish ?? null,
      riskScore: row.riskScore ?? 0,
      linkedUserId: row.linkedUserId ?? null,
      createdAt: row.createdAt,
      grantAttempts: row.grantAttempts ?? 0,
    }));
  },
});

/**
 * Bot nhận việc trước khi thi hành (fencing).
 *
 * Vì sao cần: bot có thể chạy 2 tiến trình trong lúc deploy; không có bước này
 * cả hai cùng cấp role / cùng ban một người, và audit sẽ ghi 2 lần.
 */
export const botClaimGrant = mutation({
  args: { id: v.id("verifySessions"), botKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    const row = await ctx.db.get(args.id);
    if (!row || !row.grantPending) return { ok: false as const };
    await ctx.db.patch(args.id, {
      grantPending: false,
      grantAttempts: (row.grantAttempts ?? 0) + 1,
    });
    return { ok: true as const, guildId: row.guildId, userId: row.userId };
  },
});

/** Bot báo đã thi hành xong (hoặc bỏ qua có lý do) → đóng phiên. */
export const botFinishGrant = mutation({
  args: {
    id: v.id("verifySessions"),
    applied: v.boolean(),
    note: v.optional(v.string()),
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    const row = await ctx.db.get(args.id);
    if (!row) return { ok: false as const };
    await ctx.db.patch(args.id, {
      grantAppliedAt: Date.now(),
      grantPending: false,
    });
    await audit(ctx, {
      guildId: row.guildId,
      userId: row.userId,
      sessionId: row._id,
      action: args.applied ? "verify_grant_applied" : "verify_grant_skipped",
      actor: "bot",
      reason: row.reason,
      details: args.note,
    });
    return { ok: true as const };
  },
});

/**
 * Dashboard: danh sách phiên verify gần nhất của server + thống kê nhanh.
 * Chỉ trả hash đã cắt ngắn để admin đối chiếu, KHÔNG trả IP thô (không có).
 */
export const listSessions = query({
  args: { token: v.string(), guildId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.token);
    if (!user) return null;
    const guild = await guildByDiscordId(ctx, args.guildId);
    if (!guild || !canManageGuild(user, guild)) return null;
    const take = Math.max(1, Math.min(LIST_TAKE, args.limit ?? 50));
    const rows = await ctx.db
      .query("verifySessions")
      .withIndex("by_guildId_createdAt", (q) => q.eq("guildId", args.guildId))
      .order("desc")
      .take(take);
    return rows.map((row) => ({
      id: row._id,
      userId: row.userId,
      status: row.status,
      decision: row.decision ?? null,
      reason: row.reason ?? null,
      riskScore: row.riskScore ?? null,
      country: row.country ?? null,
      asn: row.asn ?? null,
      org: row.org ?? null,
      isVpn: row.isVpn ?? null,
      isProxy: row.isProxy ?? null,
      isTor: row.isTor ?? null,
      isHosting: row.isHosting ?? null,
      sharedIp: row.sharedIp ?? null,
      linkedUserId: row.linkedUserId ?? null,
      linkScore: row.linkScore ?? null,
      linkReasons: row.linkReasons ?? [],
      createdAt: row.createdAt,
      /** 12 ký tự đầu của hash IP — đủ để admin nhận diện, không đủ để đối chiếu ngược. */
      ipHashShort: row.ipHash ? row.ipHash.slice(0, 12) : null,
      /** Hash đầy đủ chỉ dùng để đưa vào whitelist/ban qua UI. */
      ipHash: row.ipHash ?? null,
    }));
  },
});

/** Dashboard: các cặp account bị gắn cờ trong server. */
export const listLinks = query({
  args: { token: v.string(), guildId: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.token);
    if (!user) return null;
    const guild = await guildByDiscordId(ctx, args.guildId);
    if (!guild || !canManageGuild(user, guild)) return null;
    const rows = await ctx.db
      .query("verifyLinks")
      .withIndex("by_guildId_score", (q) => q.eq("guildId", args.guildId))
      .order("desc")
      .take(LIST_TAKE);
    return rows
      .filter((row) => row.status !== "dismissed")
      .map((row) => ({
        id: row._id,
        userId: row.userId,
        linkedUserId: row.linkedUserId,
        score: row.score,
        reasons: row.reasons,
        status: row.status,
        updatedAt: row.updatedAt,
      }));
  },
});

/** Dashboard: bỏ qua một cặp link (admin xác nhận không phải alt). */
export const dismissLink = mutation({
  args: { token: v.string(), guildId: v.string(), id: v.id("verifyLinks") },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.token);
    if (!user) throw new Error("Chưa đăng nhập");
    const guild = await guildByDiscordId(ctx, args.guildId);
    if (!guild || !canManageGuild(user, guild)) throw new Error("Không có quyền");
    const row = await ctx.db.get(args.id);
    if (!row || row.guildId !== args.guildId) throw new Error("Không tìm thấy");
    await ctx.db.patch(args.id, { status: "dismissed", updatedAt: Date.now() });
    await audit(ctx, {
      guildId: args.guildId,
      action: "verify_link_dismissed",
      actor: user.discordId ?? String(user._id),
      details: JSON.stringify({ userId: row.userId, linkedUserId: row.linkedUserId }),
    });
    return { ok: true };
  },
});

/**
 * Dọn dữ liệu quá hạn — bot gọi 1 lần/ngày từ tick (xem `botRunRetention`).
 *
 * Trần lưu giữ: 24 tháng cho đồ thị identity (bằng Double Counter), 7 ngày cho
 * phiên đã xong. Xoá cả `ipIntelCache` hết hạn để bảng không phình.
 */

/** Nhãn hạn ban mặc định cho UI (tránh hardcode 2 nơi). */
export const banDefaults = query({
  args: {},
  handler: async () => ({ defaultDays: clampBanDays(undefined), maxDays: 90 }),
});

/**
 * Bot chạy dọn dẹp định kỳ (1 lần/ngày, gọi từ tick).
 *
 * Vì sao bot gọi chứ không phải cron Convex: cron chỉ được TÍNH + ĐẶT CỜ
 * (docs/cron-migration.md). Xoá dữ liệu là side effect thật, phải nằm ở tiến
 * trình bot để còn quan sát/rollback được.
 */
export const botRunRetention = mutation({
  args: { botKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    const now = Date.now();
    const DAY = 24 * 3600_000;
    let deleted = 0;

    const oldSessions = await ctx.db
      .query("verifySessions")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now - 7 * DAY))
      .take(200);
    for (const row of oldSessions) {
      await ctx.db.delete(row._id);
      deleted++;
    }

    const staleSignals = await ctx.db
      .query("verifySignals")
      .withIndex("by_lastSeenAt", (q) => q.lt("lastSeenAt", now - 730 * DAY))
      .take(300);
    for (const row of staleSignals) {
      await ctx.db.delete(row._id);
      deleted++;
    }

    const expiredIntel = await ctx.db
      .query("ipIntelCache")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now - 30 * DAY))
      .take(200);
    for (const row of expiredIntel) {
      await ctx.db.delete(row._id);
      deleted++;
    }

    const expiredBans = await ctx.db
      .query("ipBans")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .take(100);
    for (const row of expiredBans) {
      if (row.active) await ctx.db.patch(row._id, { active: false });
    }

    return { deleted };
  },
});
