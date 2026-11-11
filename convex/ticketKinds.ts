/**
 * convex/ticketKinds.ts — LOẠI TICKET TUỲ CHỈNH (29/09/2026).
 *
 * Vì sao có: trước đây bot chỉ có 2 loại CỨNG `support` | `appeal` nằm thẳng
 * trong `bot/src/ticketCore.js:normalizeKind`. Chủ server muốn có nút "Báo lỗi
 * game", "Hỏi về nạp thẻ", "Khiếu nại ngoài server" thì không thể — sửa code bot
 * là cách duy nhất. Đổi sang bảng dữ liệu: chủ server tự thêm/sửa/xoá trên
 * dashboard, không cần deploy lại bot.
 *
 * ⚠️ TƯƠNG THÍCH NGƯỢC — điểm quan trọng nhất của file này:
 *   Server CHƯA tạo loại nào → `listKinds` trả rỗng → bot dùng đúng 2 loại cũ
 *   (`DEFAULT_TICKET_KINDS` trong `bot/src/ticketCore.js`). Không migration, không
 *   đụng hành vi của bất kỳ server nào đang chạy. Ticket cũ vẫn mang
 *   `kind = "support" | "appeal"` và tra được như trước.
 *
 * ⚠️ LUẬT CHUNG: mọi mutation ở đây đều `canManageGuild` + ghi
 * `settingsChangedAt` vì bot đọc danh sách loại qua `guilds:getBotConfig`
 * (bundle cache 90 phút). Bỏ `settingsChangedAt` là bot chạy bản cũ tới 90
 * phút — đúng lớp bug mà `scripts/check-settings-signal.cjs` chặn.
 */

import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { canManageGuild, getUserByToken } from "./auth";

/** Trần số loại mỗi server (Discord tối đa 5 nút/hàng; 10 loại = 2 hàng). */
export const MAX_KINDS = 10;

/** Khoá hợp lệ — nằm trong customId nút nên phải ngắn và ký tự an toàn. */
const KEY_RE = /^[a-z0-9_-]{1,32}$/;

/** Màu hợp lệ `#rrggbb` (rơi về mặc định của bot nếu rác). */
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** Bỏ khoảng trắng thừa + cắt theo trần; rỗng → undefined. */
function clipField(value: unknown, max: number): string | undefined {
  const out = String(value ?? "")
    .trim()
    .slice(0, max);
  return out || undefined;
}

/** Emoji Discord: ký tự Unicode, hoặc `<:ten:id>` / `<a:ten:id>`. */
const CUSTOM_EMOJI_RE = /^<a?:\w{2,32}:\d{15,25}>$/;

/** Trần của Discord — vượt thì API ném lỗi làm HỎNG CẢ PANEL. */
const LABEL_MAX = 80;
const MODAL_LABEL_MAX = 45;
const PLACEHOLDER_MAX = 100;
const DESC_MAX = 120;

/**
 * Trần ô nhập BỔ SUNG mỗi loại.
 *
 * 3 chứ không phải 5: Discord chỉ nhận 5 input 1 modal, và 2 ô cố định
 * (nội dung + bằng chứng) đã chiếm 2 chỗ. Cho phép 5 ô bổ sung tức modal
 * có 7 input → API TỪ CHỐI toàn bộ modal, người dùng bấm nút xong không
 * thấy gì cả.
 */
export const MAX_EXTRA_FIELDS = 3;

/**
 * Chuẩn hoá 1 loại trước khi ghi.
 *
 * Mọi trường đều CẮT + LÀM SẠCH ở đây, không để bot phải tự phòng thủ: dữ liệu
 * rác từ dashboard mà lọc ở tầng bot thì mỗi chỗ lọc một kiểu, dễ sót.
 * Chỉ `key`/`label` là bắt buộc — còn lại rỗng thì bot rơi về mặc định.
 */
function cleanKind(input: {
  key: string;
  label: string;
  description?: string;
  emoji?: string;
  color?: string;
  question?: string;
  questionPlaceholder?: string;
  evidenceQuestion?: string;
  staffRoleIds?: string[];
  fields?: {
    key: string;
    label: string;
    placeholder?: string;
    required?: boolean;
    long?: boolean;
  }[];
}) {
  const key = String(input.key ?? "")
    .trim()
    .toLowerCase();
  if (!KEY_RE.test(key)) {
    throw new Error("Mã loại chỉ gồm chữ thường, số, _ hoặc - (tối đa 32 ký tự)");
  }
  const label = String(input.label ?? "")
    .trim()
    .slice(0, LABEL_MAX);
  if (!label) throw new Error("Cần có tên hiển thị trên nút");

  const emoji = String(input.emoji ?? "").trim();
  // Emoji Unicode 1–2 code point (vd 💬, ⚖️) hoặc emoji tuỳ chỉnh dạng <a:t:1>.
  const isUnicodeEmoji = [...emoji].length > 0 && [...emoji].length <= 2;
  if (emoji && !CUSTOM_EMOJI_RE.test(emoji) && !isUnicodeEmoji) {
    throw new Error("Emoji không hợp lệ — dùng ký tự emoji hoặc <:ten:id>");
  }
  const color = String(input.color ?? "").trim();
  if (color && !COLOR_RE.test(color)) throw new Error("Màu phải ở dạng #rrggbb");

  const staffRoleIds = [
    ...new Set(
      (Array.isArray(input.staffRoleIds) ? input.staffRoleIds : [])
        .map((r) => String(r ?? "").trim())
        .filter((r) => /^\d{15,22}$/.test(r))
        .slice(0, 5),
    ),
  ];

  // Ô bổ sung: khoá phải khớp regex vì nó ĐI THẲNG vào customId của
  // TextInputBuilder. Khoá trùng nhau (hoặc trùng 2 ô cố định) → 2 ô cùng
  // customId → Discord ném lỗi cả modal.
  const seenKeys = new Set(["ticket_body", "ticket_evidence"]);
  const fields: {
    key: string;
    label: string;
    placeholder?: string;
    required: boolean;
    long: boolean;
  }[] = [];
  for (const f of Array.isArray(input.fields) ? input.fields : []) {
    if (fields.length >= MAX_EXTRA_FIELDS) break;
    const key = String(f?.key ?? "")
      .trim()
      .toLowerCase();
    const label = clipField(f?.label, MODAL_LABEL_MAX);
    if (!KEY_RE.test(key) || !label || seenKeys.has(key)) continue;
    seenKeys.add(key);
    fields.push({
      key,
      label,
      placeholder: clipField(f?.placeholder, PLACEHOLDER_MAX),
      required: f?.required === true,
      long: f?.long === true,
    });
  }

  return {
    key,
    label,
    description: clipField(input.description, DESC_MAX),
    emoji: emoji || undefined,
    color: color || undefined,
    question: clipField(input.question, MODAL_LABEL_MAX),
    questionPlaceholder: clipField(input.questionPlaceholder, PLACEHOLDER_MAX),
    evidenceQuestion: clipField(input.evidenceQuestion, MODAL_LABEL_MAX),
    staffRoleIds,
    fields,
  };
}

/**
 * Đọc danh sách loại của 1 server, đã sắp và đã lọc.
 *
 * Sắp ở đây (không dựa `order()` của Convex) vì index `by_guildId` chỉ có
 * `guildId` → thứ tự trả về là thứ tự scan, không phải thứ tự chủ server chọn.
 * Panel hiển thị sai thứ tự thì chủ server tưởng tính năng hỏng.
 */
async function loadKinds(ctx: QueryCtx, guildId: string, includeDisabled: boolean) {
  const rows = await ctx.db
    .query("ticketKinds")
    .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
    .collect();
  return rows
    .filter((r) => includeDisabled || r.enabled !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt)
    .map((r) => ({
      key: r.key,
      label: r.label,
      description: r.description ?? null,
      emoji: r.emoji ?? null,
      color: r.color ?? null,
      question: r.question ?? null,
      questionPlaceholder: r.questionPlaceholder ?? null,
      evidenceQuestion: r.evidenceQuestion ?? null,
      staffRoleIds: r.staffRoleIds ?? [],
      fields: r.fields ?? [],
      order: r.order ?? 0,
      enabled: r.enabled !== false,
    }));
}

async function assertManage(ctx: MutationCtx, token: string, guildId: string) {
  const user = await getUserByToken(ctx, token);
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
    .first();
  if (!user || !guild || !canManageGuild(user, guild)) {
    throw new Error("Không có quyền quản lý server này");
  }
  return guild;
}

/** Danh sách loại cho dashboard (kèm cả loại đang tắt, để sửa được). */
export const listKinds = query({
  args: { token: v.string(), guildId: v.string() },
  handler: async (ctx, { token, guildId }) => {
    const user = await getUserByToken(ctx, token);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!user || !guild || !canManageGuild(user, guild)) {
      throw new Error("Không có quyền quản lý server này");
    }
    return loadKinds(ctx, guildId, true);
  },
});

/**
 * Thêm hoặc sửa một loại (upsert theo `key`).
 *
 * Upsert chứ không tách add/update: chủ server đổi tên nút thì `key` giữ nguyên
 * → ticket đã mở vẫn tra được đúng loại đó.
 */
export const saveKind = mutation({
  args: {
    token: v.string(),
    guildId: v.string(),
    key: v.string(),
    label: v.string(),
    description: v.optional(v.string()),
    emoji: v.optional(v.string()),
    color: v.optional(v.string()),
    question: v.optional(v.string()),
    questionPlaceholder: v.optional(v.string()),
    evidenceQuestion: v.optional(v.string()),
    staffRoleIds: v.optional(v.array(v.string())),
    fields: v.optional(
      v.array(
        v.object({
          key: v.string(),
          label: v.string(),
          placeholder: v.optional(v.string()),
          required: v.optional(v.boolean()),
          long: v.optional(v.boolean()),
        }),
      ),
    ),
    order: v.optional(v.number()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const guild = await assertManage(ctx, args.token, args.guildId);
    const clean = cleanKind(args);
    const existing = await ctx.db
      .query("ticketKinds")
      .withIndex("by_guildId_key", (q) => q.eq("guildId", args.guildId).eq("key", clean.key))
      .first();
    if (!existing) {
      const total = await ctx.db
        .query("ticketKinds")
        .withIndex("by_guildId", (q) => q.eq("guildId", args.guildId))
        .collect();
      if (total.length >= MAX_KINDS) {
        throw new Error(`Tối đa ${MAX_KINDS} loại ticket mỗi server`);
      }
    }
    const now = Date.now();
    // Thứ tự: sửa loại đang có thì GIỮ NGUYÊN order của nó. Trước đây dùng
    // chung `maxOrder + 1` cho cả hai nhánh → mỗi lần chủ server đổi nhãn,
    // loại đó bay xuống cuối danh sách (lỗi do test phát hiện 29/09/2026).
    // Chỉ loại MỚI mới chen cuối: order lớn nhất + 1. Dùng `createdAt` làm
    // order thì 2 loại tạo trong cùng 1 ms (bấm lưu liên tiền) sẽ trùng nhau
    // và thứ tự panel nhảy loạn.
    let order: number;
    if (Number.isFinite(args.order)) {
      order = Number(args.order);
    } else if (existing) {
      order = existing.order ?? 0;
    } else {
      const rows = await ctx.db
        .query("ticketKinds")
        .withIndex("by_guildId", (q) => q.eq("guildId", args.guildId))
        .collect();
      order = rows.reduce((max, r) => Math.max(max, r.order ?? 0), 0) + 1;
    }
    const patch = {
      ...clean,
      order,
      enabled: args.enabled !== false,
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("ticketKinds", {
        guildId: args.guildId,
        ...patch,
        createdAt: now,
      });
    }
    // Bot đọc loại qua `guilds:getBotConfig` (cache 90 phút) → bắt buộc báo
    // cấu hình vừa đổi, nếu không panel cũ mãi tới tick xoá cache.
    await ctx.db.patch(guild._id, { settingsChangedAt: now });
    return { ok: true, key: clean.key };
  },
});

/** Xoá hẳn một loại. */
export const removeKind = mutation({
  args: { token: v.string(), guildId: v.string(), key: v.string() },
  handler: async (ctx, { token, guildId, key }) => {
    const guild = await assertManage(ctx, token, guildId);
    const row = await ctx.db
      .query("ticketKinds")
      .withIndex("by_guildId_key", (q) => q.eq("guildId", guildId).eq("key", key))
      .first();
    if (row) await ctx.db.delete(row._id);
    await ctx.db.patch(guild._id, { settingsChangedAt: Date.now() });
    return { ok: true };
  },
});

/**
 * Bật/tắt một loại mà không xoá.
 *
 * Tách khỏi `removeKind` vì tắt là hành động thường ngày (mùa bảo trì, loại
 * tạm không ai dùng) — xoá nhầm thì mất luôn cấu hình câu hỏi riêng.
 */
export const setKindEnabled = mutation({
  args: {
    token: v.string(),
    guildId: v.string(),
    key: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, { token, guildId, key, enabled }) => {
    const guild = await assertManage(ctx, token, guildId);
    const row = await ctx.db
      .query("ticketKinds")
      .withIndex("by_guildId_key", (q) => q.eq("guildId", guildId).eq("key", key))
      .first();
    if (!row) throw new Error("Không tìm thấy loại ticket này");
    await ctx.db.patch(row._id, { enabled });
    await ctx.db.patch(guild._id, { settingsChangedAt: Date.now() });
    return { ok: true };
  },
});

/** Đảo thứ tự hai loại liền nhau (nút lên/xuống trên dashboard). */
export const swapKindOrder = mutation({
  args: {
    token: v.string(),
    guildId: v.string(),
    keyA: v.string(),
    keyB: v.string(),
  },
  handler: async (ctx, { token, guildId, keyA, keyB }) => {
    const guild = await assertManage(ctx, token, guildId);
    if (keyA === keyB) return { ok: true };
    const rows = await ctx.db
      .query("ticketKinds")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .collect();
    const a = rows.find((r) => r.key === keyA);
    const b = rows.find((r) => r.key === keyB);
    if (!a || !b) throw new Error("Không tìm thấy loại ticket này");
    // Đổi chỗ GIÁ TRỊ order chứ không cộng/trừ: hai loại có thể trùng order
    // (dữ liệu cũ, hoặc thêm nhanh 2 loại) → cộng/trừ có thể làm nghẽn hàng
    // và thứ tự panel nhảy loạn.
    const orderA = a.order ?? 0;
    const orderB = b.order ?? 0;
    if (orderA === orderB) {
      // Trùng → đánh số lại cả cặp theo vị trí scan để tách được ngay.
      const idxA = rows.findIndex((r) => r._id === a._id);
      const idxB = rows.findIndex((r) => r._id === b._id);
      await ctx.db.patch(a._id, { order: Math.min(idxA, idxB) });
      await ctx.db.patch(b._id, { order: Math.max(idxA, idxB) });
    } else {
      await ctx.db.patch(a._id, { order: orderB });
      await ctx.db.patch(b._id, { order: orderA });
    }
    await ctx.db.patch(guild._id, { settingsChangedAt: Date.now() });
    return { ok: true };
  },
});
