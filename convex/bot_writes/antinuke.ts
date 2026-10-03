/**
 * Đợt #5 tách `convex/bot_writes.ts` (75KB) — nhóm CHỐNG NUKE & RAID: module
 * antinuke, nhiệt độ (heatStates), sự kiện antinuke và mẫu raid (Raid Intel).
 *
 * Wrapper `export const X = mutation({…})` giữ NGUYÊN trong `convex/bot_writes.ts`
 * để tên function + validator không đổi (hợp đồng bot ⇄ Convex). Thân hàm nằm ở
 * đây — chỉ tách file, không đổi hành vi.
 */
import { v } from "convex/values";
import type { ObjectType } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import { ANTI_NUKE_MODULES, isAntiNukeModule } from "../modules";
import { requireBotKeyStrict } from "../botAuth";
import { TRIM_BATCH, dropBeyondCap, shouldTrim } from "./shared";

const ALLOWED_ACTIONS = [
  "warn",
  "kick",
  "ban",
  "timeout",
  "deleteMessages",
  "purgeMessages",
] as const;
const ACTION_STRENGTH: Record<string, number> = { warn: 1, timeout: 2, kick: 3, ban: 4 };

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

export const botModuleUpdateArgs = {
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
};
export type BotModuleUpdateArgs = ObjectType<typeof botModuleUpdateArgs>;

export async function botModuleUpdateHandler(ctx: MutationCtx, args: BotModuleUpdateArgs) {
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
}

/** Bot records a punished anti-nuke event for daily reports. */
export const botRecordAntinukeEventArgs = {
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
};
export type BotRecordAntinukeEventArgs = ObjectType<typeof botRecordAntinukeEventArgs>;

export async function botRecordAntinukeEventHandler(
  ctx: MutationCtx,
  args: BotRecordAntinukeEventArgs,
) {
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
}

/**
 * Batch upsert nhiệt độ + warn tích lũy cho NHIỀU thành viên trong 1 mutation.
 * Bot gom toàn bộ member đang nóng của 1 guild vào đây (thay vì N mutation
 * botRecordHeat riêng lẻ mỗi vòng flush) — cắt giảm operations đáng kể.
 */
export const botRecordHeatBatchArgs = {
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
};
export type BotRecordHeatBatchArgs = ObjectType<typeof botRecordHeatBatchArgs>;

export async function botRecordHeatBatchHandler(ctx: MutationCtx, args: BotRecordHeatBatchArgs) {
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
}

/** Bot đảm bảo mọi module mặc định tồn tại cho một guild (thêm các module còn thiếu). */
export const botEnsureModulesArgs = {
  guildId: v.string(),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type BotEnsureModulesArgs = ObjectType<typeof botEnsureModulesArgs>;

export async function botEnsureModulesHandler(
  ctx: MutationCtx,
  { botKey, guildId }: BotEnsureModulesArgs,
) {
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
}

/** Bot upserts the current heat level + warn strikes of one user in a guild. */
export const botRecordHeatArgs = {
  guildId: v.string(),
  userId: v.string(),
  username: v.optional(v.string()),
  heat: v.number(),
  updatedAt: v.number(),
  warnStrikes: v.optional(v.number()),
  /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
  botKey: v.optional(v.string()),
};
export type BotRecordHeatArgs = ObjectType<typeof botRecordHeatArgs>;

export async function botRecordHeatHandler(ctx: MutationCtx, args: BotRecordHeatArgs) {
  await requireBotKeyStrict(ctx, args.botKey);
  const existing = await ctx.db
    .query("heatStates")
    .withIndex("by_guildId_userId", (q) => q.eq("guildId", args.guildId).eq("userId", args.userId))
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
}

/** Bot ghi một mẫu dữ liệu raid/nuke (Raid Intel — dữ liệu huấn luyện). */
export const botRecordRaidSampleArgs = {
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
};
export type BotRecordRaidSampleArgs = ObjectType<typeof botRecordRaidSampleArgs>;

export async function botRecordRaidSampleHandler(ctx: MutationCtx, args: BotRecordRaidSampleArgs) {
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
}
