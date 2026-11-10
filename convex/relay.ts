import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireBotKeyStrict } from "./botAuth";
import { getUserByToken, canManageGuild } from "./auth";

/**
 * Threat Relay — chia sẻ chữ ký raid GIỮA CÁC SERVER dùng chung bot (Đợt 6).
 *
 * Server A bị raid → bot bắn signature (nội dung spam đã chuẩn hóa, tên bot nuke,
 * pattern invite) lên relay. Server B bật relayReceive → bot tải về và dùng sớm
 * trong filters (trước cả AI classify).
 *
 * ANONYMIZATION: KHÔNG lưu userId của ai; guildId nguồn bị băm 1 chiều (SHA-256
 * + salt deployment) chỉ để rate-limit/bao cáo đếm — không thể truy ngược server.
 *
 * ABUSE RESISTANCE (nếu 1 server bị chiếm):
 *  - 10 signature/phút/guild nguồn (rate-limit sliding window).
 *  - Prefix 60 ký tự, content đã chuẩn hóa, không chứa mention/URL dài.
 *  - Mỗi signature có "weight" = số lần thấy — phải >= 2 (2 server khác nhau cùng
 *    thấy) hoặc age < 2h mới được phân phối: chống đầu độc 1 server đơn lẻ.
 *  - Tự hết hạn sau 24 giờ (dọn khi đọc).
 *
 * OPT-IN: cả share lẫn receive đều TẮT mặc định, per-guild, chủ server bật trên web.
 */

/** Tối đa signature còn hạn đọc 1 lần (giới hạn payload của botGetRelaySignatures). */
const MAX_FETCH = 50;
/** Signature tự hết hạn (ms). */
const TTL_MS = 24 * 60 * 60 * 1000;
/** Rate-limit: tối đa signature mới mỗi guild nguồn trong 60s. */
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
/** Trọng số tối thiểu để được phân phối khi signature đã quá 2 giờ. */
const MIN_WEIGHT_AGED = 2;
const MAX_SOURCE_HASHES = 100;
const MAX_STATUS_SCAN = 10_000;
const MAX_DISTRIBUTABLE_SCAN = MAX_FETCH * 8;
const MAX_CLEANUP_BATCH = 500;

/**
 * Băm 1 chiều guildId nguồn — không truy ngược được server gốc. FNV-1a thuần JS
 * (Convex mutation không có Node crypto, không có process) + salt = _id của dòng
 * botStatus (ổn định theo deployment, không lộ gì): kẻ ngoài biết guildId cũng
 * không tính được hash vì thiếu salt deployment.
 */
let saltCache: string | null = null;
async function sourceSalt(ctx: MutationCtx): Promise<string> {
  if (saltCache) return saltCache;
  const status = await ctx.db.query("botStatus").first();
  saltCache = String(status?._id ?? "no-status");
  return saltCache;
}
function hashSource(guildId: string, salt: string): string {
  const input = `${guildId}:${salt}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    h1 ^= input.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= input.charCodeAt(input.length - 1 - i);
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 16);
}

type RelaySignature = {
  _id?: string;
  kind: string;
  value: string;
  createdAt: number;
  sourceHash: string;
  sourceHashes?: string[];
  weight?: number;
};

/** Dữ liệu legacy chỉ có sourceHash/weight; không được tin weight cũ. */
function distinctSourceCount(signature: RelaySignature): number {
  return Math.max(
    1,
    Math.min(
      MAX_SOURCE_HASHES,
      new Set(signature.sourceHashes?.length ? signature.sourceHashes : [signature.sourceHash])
        .size,
    ),
  );
}

function effectiveWeight(signature: RelaySignature): number {
  return distinctSourceCount(signature);
}

/** Chuẩn hóa + ràng buộc nội dung signature trước khi lưu. */
function sanitize(kind: string, value: string): { kind: string; value: string } | null {
  const k = String(kind ?? "");
  if (!["spam-text", "bot-name", "invite-code", "app-name"].includes(k)) return null;
  const v = String(value ?? "")
    // Bỏ ký tự điều khiển + mention markup (không cho relay thành kênh quảng cáo).
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/<@[^>]*>|<@&[^>]*>|<#[^>]*>/g, "")
    .trim()
    .slice(0, 60);
  if (v.length < 3) return null;
  return { kind: k, value: v };
}

/**
 * Bot bắn signature từ 1 vụ raid lên relay. Rate-limit theo guild nguồn (băm),
 * dedupe theo (kind, value) — trùng thì tăng weight thay vì thêm hàng.
 */
export const botReportSignature = mutation({
  args: {
    botKey: v.optional(v.string()),
    guildId: v.string(),
    kind: v.string(),
    value: v.string(),
  },
  handler: async (ctx, { botKey, guildId, kind, value }) => {
    await requireBotKeyStrict(ctx, botKey);
    // Chỉ server ĐÃ bật share mới được đóng góp (opt-in thật, không ngầm định).
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild || guild.relayShare !== true) return { ok: false, reason: "share-off" };

    const sig = sanitize(kind, value);
    if (!sig) return { ok: false, reason: "invalid" };

    // Rate-limit sliding window theo guild nguồn.
    const now = Date.now();
    const sourceHash = hashSource(guildId, await sourceSalt(ctx));
    const recent = await ctx.db
      .query("relaySignatures")
      .withIndex("by_source_createdAt", (q) =>
        q.eq("sourceHash", sourceHash).gt("createdAt", now - RATE_WINDOW_MS),
      )
      .collect();
    if (recent.length >= RATE_LIMIT) return { ok: false, reason: "rate-limited" };

    // Dedupe: cùng (kind, value) còn hạn → tăng weight.
    const existing = await ctx.db
      .query("relaySignatures")
      .withIndex("by_kind_value", (q) => q.eq("kind", sig.kind).eq("value", sig.value))
      .first();
    if (existing && now - existing.createdAt < TTL_MS) {
      const sourceHashes =
        existing.sourceHashes ?? (existing.sourceHash ? [existing.sourceHash] : []);
      const boundedSourceHashes = [...new Set([...sourceHashes, sourceHash])].slice(
        -MAX_SOURCE_HASHES,
      );
      await ctx.db.patch(existing._id, {
        weight: effectiveWeight({ ...existing, sourceHashes: boundedSourceHashes }),
        sourceHashes: boundedSourceHashes,
        lastSeenAt: now,
      });
      return { ok: true, deduped: true };
    }
    await ctx.db.insert("relaySignatures", {
      kind: sig.kind,
      value: sig.value,
      weight: 1,
      sourceHash,
      sourceHashes: [sourceHash],
      createdAt: now,
      lastSeenAt: now,
    });
    return { ok: true };
  },
});

/** Web — chủ server bật/tắt chia sẻ/nhận (2 cờ độc lập). */
export const setRelaySettings = mutation({
  args: {
    token: v.string(),
    guildId: v.string(),
    relayShare: v.optional(v.boolean()),
    relayReceive: v.optional(v.boolean()),
  },
  handler: async (ctx, { token, guildId, relayShare, relayReceive }) => {
    const user = await getUserByToken(ctx, token);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild || !canManageGuild(user, guild))
      throw new Error("Không có quyền quản lý server này");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (relayShare !== undefined) patch.relayShare = relayShare;
    if (relayReceive !== undefined) patch.relayReceive = relayReceive;
    await ctx.db.patch(guild._id, patch);
    return { ok: true };
  },
});

/** Web — đọc trạng thái relay + thống kê ẩn danh (không lộ guild nguồn). */
export const relayStatus = query({
  args: { token: v.string(), guildId: v.string() },
  handler: async (ctx, { token, guildId }) => {
    const user = await getUserByToken(ctx, token);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild || !canManageGuild(user, guild)) return null;
    const now = Date.now();
    // Lọc TTL bằng index by_createdAt (createdAt > now - TTL) thay vì full scan:
    // mọi đường đọc relay đều cần "signature còn hạn" và bảng tăng theo số server.
    const all = await ctx.db
      .query("relaySignatures")
      .withIndex("by_createdAt", (q) => q.gt("createdAt", now - TTL_MS))
      .order("desc")
      .take(MAX_STATUS_SCAN);
    return {
      relayShare: guild.relayShare ?? false,
      relayReceive: guild.relayReceive ?? false,
      activeSignatures: all.length,
      distinctSources: new Set(
        all.flatMap((signature) =>
          signature.sourceHashes?.length ? signature.sourceHashes : [signature.sourceHash],
        ),
      ).size,
      byKind: all.reduce<Record<string, number>>((acc, s) => {
        acc[s.kind] = (acc[s.kind] ?? 0) + 1;
        return acc;
      }, {}),
    };
  },
});

/**
 * Bot tải signature về để chặn sớm — CHỈ guild ĐÃ bật relayReceive.
 * Chất lượng: signature < 2h tuổi lấy hết; cũ hơn phải weight >= 2 (ít nhất 2
 * nguồn thấy) — chống 1 server bị chiếm đầu độc relay.
 */
export const botGetRelaySignatures = query({
  args: {
    botKey: v.optional(v.string()),
    guildId: v.string(),
  },
  handler: async (ctx, { botKey, guildId }) => {
    await requireBotKeyStrict(ctx, botKey);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild || guild.relayReceive !== true) return { signatures: [] };

    const now = Date.now();
    // Index by_createdAt: chỉ đọc signature còn hạn (xem relayStatus). Quét theo
    // page thay vì `.take()` trước rồi lọc: nếu hàng trăm signature mới nhất đều
    // loại (một burst spam), signature cũ nhưng có weight >= 2 sẽ bị bỏ qua oan.
    // Vẫn có trần scan để một guild không thể khiến query này đọc toàn bảng.
    const active: RelaySignature[] = [];
    let cursor: string | null = null;
    let scanned = 0;
    while (scanned < MAX_DISTRIBUTABLE_SCAN) {
      const page = await ctx.db
        .query("relaySignatures")
        .withIndex("by_createdAt", (q) => q.gt("createdAt", now - TTL_MS))
        .order("desc")
        .paginate({ cursor, numItems: Math.min(100, MAX_DISTRIBUTABLE_SCAN - scanned) });
      active.push(...page.page);
      scanned += page.page.length;
      const enough = active.filter(
        (s) => now - s.createdAt < 2 * 60 * 60 * 1000 || effectiveWeight(s) >= MIN_WEIGHT_AGED,
      ).length;
      if (page.isDone || !page.continueCursor || enough >= MAX_FETCH) break;
      cursor = page.continueCursor;
    }
    const distributable = active.filter(
      (s) => now - s.createdAt < 2 * 60 * 60 * 1000 || effectiveWeight(s) >= MIN_WEIGHT_AGED,
    );
    return {
      signatures: distributable
        .sort((a, b) => effectiveWeight(b) - effectiveWeight(a))
        .slice(0, MAX_FETCH)
        .map((s) => ({ kind: s.kind, value: s.value, weight: effectiveWeight(s) })),
    };
  },
});

/** Dọn signature hết hạn — bot gọi định kỳ cùng nhịp tick (mutation riêng vì query không xóa được). */
export const botCleanupRelay = mutation({
  args: { botKey: v.optional(v.string()) },
  handler: async (ctx, { botKey }) => {
    await requireBotKeyStrict(ctx, botKey);
    const now = Date.now();
    // Chỉ quét signature HẾT hạn (createdAt <= now - TTL) qua index — không đọc
    // phần còn hạn của bảng; mỗi lượt cleanup là 0 đọc khi không có gì hết hạn.
    const stale = await ctx.db
      .query("relaySignatures")
      .withIndex("by_createdAt", (q) => q.lte("createdAt", now - TTL_MS))
      .take(MAX_CLEANUP_BATCH);
    let deleted = 0;
    for (const s of stale) {
      await ctx.db.delete(s._id);
      deleted++;
    }
    return { ok: true, deleted };
  },
});
