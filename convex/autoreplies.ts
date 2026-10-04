import { mutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { getUserByToken, canManageGuild } from "./auth";

async function assertManage(ctx: MutationCtx, token: string, guildId: string) {
  const user = await getUserByToken(ctx, token);
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
    .first();
  if (!canManageGuild(user, guild)) throw new Error("Không có quyền quản lý server này");
  return guild!;
}

/** Giới hạn dữ liệu rule auto reply: chống phình document + spam lưu trữ. */
const MAX_RULES_PER_GUILD = 50;

function cleanRuleInput(input: {
  keywords: string[];
  response: string;
  channels: string[];
  cooldownSeconds: number;
}) {
  const keywords = [
    ...new Set(
      input.keywords
        .map((k) => k.trim().slice(0, 60))
        .filter(Boolean)
        .slice(0, 30),
    ),
  ];
  const response = input.response.trim().slice(0, 2000);
  const channels = [
    ...new Set(
      input.channels
        .map((c) => c.trim())
        .filter((c) => /^\d{15,20}$/.test(c))
        .slice(0, 100),
    ),
  ];
  if (!response) throw new Error("Nội dung trả lời không được để trống");
  return {
    keywords,
    response,
    channels,
    cooldownSeconds: Math.max(0, Math.min(86400, Math.floor(input.cooldownSeconds))),
  };
}

export const add = mutation({
  args: {
    token: v.string(),
    guildId: v.string(),
    name: v.string(),
    triggerType: v.union(v.literal("keyword"), v.literal("mention")),
    keywords: v.array(v.string()),
    response: v.string(),
    channels: v.array(v.string()),
    cooldownSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const guild = await assertManage(ctx, args.token, args.guildId);
    // Rule auto reply được bot đọc qua cache getBotConfig → báo cấu hình vừa đổi
    // (xem schema.ts) để bot xoá cache ở vòng tick kế tiếp thay vì chờ 30 phút.
    await ctx.db.patch(guild._id, { settingsChangedAt: Date.now() });
    if (!/^[a-z0-9_-]{1,32}$/i.test(args.name)) {
      throw new Error("Tên rule chỉ gồm chữ, số, _ hoặc - (tối đa 32 ký tự)");
    }
    const clean = cleanRuleInput(args);
    if (args.triggerType === "keyword" && clean.keywords.length === 0) {
      throw new Error("Cần ít nhất một từ khóa");
    }
    const total = await ctx.db
      .query("autoReplies")
      .withIndex("by_guildId", (q) => q.eq("guildId", args.guildId))
      .collect();
    if (total.length >= MAX_RULES_PER_GUILD) {
      throw new Error(`Tối đa ${MAX_RULES_PER_GUILD} rule auto reply mỗi server`);
    }
    const dup = await ctx.db
      .query("autoReplies")
      .withIndex("by_guildId_name", (q) => q.eq("guildId", args.guildId).eq("name", args.name))
      .first();
    if (dup) throw new Error(`Đã có rule tên "${args.name}"`);
    const now = Date.now();
    await ctx.db.insert("autoReplies", {
      guildId: args.guildId,
      name: args.name,
      triggerType: args.triggerType,
      keywords: clean.keywords,
      response: clean.response,
      channels: clean.channels,
      cooldownSeconds: clean.cooldownSeconds,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true };
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("autoReplies"),
    name: v.optional(v.string()),
    triggerType: v.optional(v.union(v.literal("keyword"), v.literal("mention"))),
    keywords: v.optional(v.array(v.string())),
    response: v.optional(v.string()),
    channels: v.optional(v.array(v.string())),
    cooldownSeconds: v.optional(v.number()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const rule = await ctx.db.get(args.id);
    if (!rule) throw new Error("Không tìm thấy rule");
    const guild = await assertManage(ctx, args.token, rule.guildId);
    await ctx.db.patch(guild._id, { settingsChangedAt: Date.now() });
    if (args.name !== undefined && args.name !== rule.name) {
      if (!/^[a-z0-9_-]{1,32}$/i.test(args.name)) {
        throw new Error("Tên rule không hợp lệ");
      }
      const dup = await ctx.db
        .query("autoReplies")
        .withIndex("by_guildId_name", (q) => q.eq("guildId", rule.guildId).eq("name", args.name!))
        .first();
      if (dup && dup._id !== rule._id) throw new Error(`Đã có rule tên "${args.name}"`);
    }
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name;
    if (args.triggerType !== undefined) patch.triggerType = args.triggerType;
    if (args.keywords !== undefined) {
      patch.keywords = [
        ...new Set(
          args.keywords
            .map((k) => k.trim().slice(0, 60))
            .filter(Boolean)
            .slice(0, 30),
        ),
      ];
    }
    if (args.response !== undefined) {
      if (!args.response.trim()) throw new Error("Nội dung trả lời không được để trống");
      patch.response = args.response.trim().slice(0, 2000);
    }
    if (args.channels !== undefined) {
      patch.channels = [
        ...new Set(
          args.channels
            .map((c) => c.trim())
            .filter((c) => /^\d{15,20}$/.test(c))
            .slice(0, 100),
        ),
      ];
    }
    if (args.cooldownSeconds !== undefined) {
      patch.cooldownSeconds = Math.max(0, Math.min(86400, args.cooldownSeconds));
    }
    if (args.enabled !== undefined) patch.enabled = args.enabled;
    // ĐỐI XỨNG VỚI `add`: rule kiểu keyword PHẢI có ít nhất một từ khóa. Trước
    // đây `update` không kiểm tra → đổi rule mention sang keyword (hoặc xoá sạch
    // keyword) là tạo rule IM LẶNG: bot không báo lỗi, chỉ đơn giản không bao
    // giờ trả lời, chủ server tưởng bot hỏng. Kiểm trên giá trị HIỆU LỰC (sau
    // patch) để bắt cả trường hợp chỉ đổi triggerType mà không gửi keywords.
    const effectiveTrigger = args.triggerType !== undefined ? args.triggerType : rule.triggerType;
    const effectiveKeywords =
      args.keywords !== undefined ? (patch.keywords as string[]) : rule.keywords;
    if (effectiveTrigger === "keyword" && effectiveKeywords.length === 0) {
      throw new Error("Cần ít nhất một từ khóa");
    }
    await ctx.db.patch(rule._id, patch);
    return { ok: true };
  },
});

export const remove = mutation({
  args: { token: v.string(), id: v.id("autoReplies") },
  handler: async (ctx, { token, id }) => {
    const rule = await ctx.db.get(id);
    if (!rule) throw new Error("Không tìm thấy rule");
    const guild = await assertManage(ctx, token, rule.guildId);
    await ctx.db.patch(guild._id, { settingsChangedAt: Date.now() });
    await ctx.db.delete(id);
    return { ok: true };
  },
});
