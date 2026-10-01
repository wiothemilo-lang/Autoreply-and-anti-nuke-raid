import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireBotKeyStrict } from "./botAuth";
import { getUserByToken, guildAccessibleBy } from "./auth";

/**
 * channelLocks.ts — dữ liệu lệnh `/lock` (khoá chat thủ công của chủ server).
 *
 * Vì sao cần bảng riêng, không nhét vào `guilds`: một server có thể khoá
 * NHIỀU kênh, mỗi kênh một quyền cần khôi phục riêng, và mỗi bản ghi có hạn
 * riêng. Nhét vào doc `guilds` sẽ phải dựng mảng JSON phẳng rồi sửa từng phần
 * tử — dễ lỗi và không index được (tick cần hỏi "kênh nào hết hạn").
 *
 * ⚠️ BẤT BIẾN CỦA CẢ MODULE: `prev` (quyền trước khi khoá) là thứ DUY NHẤT
 * cho phép mở khoá mà không phá cấu hình của chủ server. Mọi đường ghi đều
 * phải giữ nó: xem `botSaveChannelLock`.
 */

/** Số bản ghi hết hạn lấy mỗi lượt tick — trần để một server lỗi không nuốt
 *  cả lượt quét. */
const DUE_TAKE = 200;

/**
 * Bot đọc các khoá ĐÃ HẾT HẠN để tự mở. Khoá vô hạn không có `until`, nhưng
 * Convex xếp `undefined`/`null` TRƯỚC mọi số trong index nên `lte("until", now)`
 * một mình vẫn khớp chúng — khoá vô hạn sẽ bị tự mở trong vòng 3 phút. Cận dưới
 * `gt("until", 0)` cắt đúng phần đó (xác nhận ở cộng đồng Convex, 10/2025).
 */
export const botDueChannelLocks = query({
  args: { botKey: v.optional(v.string()) },
  handler: async (ctx, { botKey }) => {
    await requireBotKeyStrict(ctx, botKey);
    const now = Date.now();
    return await ctx.db
      .query("channelLocks")
      .withIndex("by_due", (q) => q.gt("until", 0).lte("until", now))
      .take(DUE_TAKE);
  },
});

/**
 * Lệnh `/lock list` — chủ server xem đang khoá gì.
 *
 * Chỉ chủ server có quyền quản lý mới xem được: `until` của từng kênh là thông
 * tin vận hành nội bộ, và bảng này là bản ghi ai đã khoá việc gì.
 */
export const listChannelLocks = query({
  args: { token: v.string(), guildId: v.string() },
  handler: async (ctx, { token, guildId }) => {
    const user = await getUserByToken(ctx, token);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!user || !guild || !guildAccessibleBy(user, guild))
      throw new Error("Không có quyền quản lý server này");
    const rows = await ctx.db
      .query("channelLocks")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .collect();
    return rows.map((r) => ({
      channelId: r.channelId,
      roleId: r.roleId,
      kind: r.kind,
      until: r.until ?? null,
      reason: r.reason ?? null,
      lockedBy: r.lockedBy ?? null,
      lockedAt: r.lockedAt,
    }));
  },
});

/** Bot đọc toàn bộ khoá của một server (dùng trước khi khoá để bỏ qua kênh đã khoá). */
export const botChannelLocks = query({
  args: { guildId: v.string(), botKey: v.optional(v.string()) },
  handler: async (ctx, { guildId, botKey }) => {
    await requireBotKeyStrict(ctx, botKey);
    return await ctx.db
      .query("channelLocks")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .collect();
  },
});

/**
 * Ghi bản ghi khoá.
 *
 * ⚠️ CHỐT CHẶN TÁI LẶP — trường hợp nguy hiểm nhất của cả tính năng:
 * khoá kênh đã khoá thì lần 2 sẽ đọc quyền hiện tại (`false` — trạng thái
 * do chính lần khoá trước tạo ra) rồi lưu làm `prev`. Mở khoá sau đó khôi
 * phục về `false` → **kênh kẹt vĩnh viễn và mất dấu vết để mở**. Vì vậy bản
 * ghi đã tồn tại thì GIỮ NGUYÊN `prev` cũ, chỉ cập nhật hạn/lý do/người thao.
 *
 * Hàm này là nguồn sự thật cho bất biến đó — handler phía bot cũng bỏ qua
 * kênh đã có bản ghi, nhưng bot chạy 2 tiến trình thì chỉ chỗ này đáng tin.
 */
export const botSaveChannelLock = mutation({
  args: {
    guildId: v.string(),
    channelId: v.string(),
    roleId: v.string(),
    kind: v.union(v.literal("text"), v.literal("voice")),
    prev: v.union(v.boolean(), v.null()),
    /** Thiếu = vô hạn. */
    until: v.optional(v.number()),
    reason: v.optional(v.string()),
    lockedBy: v.optional(v.string()),
    botKey: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { botKey, guildId, channelId, roleId, kind, prev, until, reason, lockedBy },
  ) => {
    await requireBotKeyStrict(ctx, botKey);
    const existing = await ctx.db
      .query("channelLocks")
      .withIndex("by_guildId_channelId_roleId", (q) =>
        q.eq("guildId", guildId).eq("channelId", channelId).eq("roleId", roleId),
      )
      .first();
    const doc = {
      kind,
      until,
      reason: reason?.slice(0, 200) || undefined,
      lockedBy: lockedBy?.slice(0, 64) || undefined,
    };
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...doc,
        // GIỮ `prev` của lần khoá đầu tiên — xem ghi chú hàm.
        lockedAt: existing.lockedAt,
      });
      return { ok: true, alreadyLocked: true };
    }
    await ctx.db.insert("channelLocks", {
      guildId,
      channelId,
      roleId,
      prev,
      lockedAt: Date.now(),
      ...doc,
    });
    return { ok: true, alreadyLocked: false };
  },
});

/** Mở khoá → xoá bản ghi. Không tồn tại thì vẫn ok (mở 2 lần là vô hại). */
export const botReleaseChannelLock = mutation({
  args: {
    guildId: v.string(),
    channelId: v.string(),
    roleId: v.string(),
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, guildId, channelId, roleId }) => {
    await requireBotKeyStrict(ctx, botKey);
    const existing = await ctx.db
      .query("channelLocks")
      .withIndex("by_guildId_channelId_roleId", (q) =>
        q.eq("guildId", guildId).eq("channelId", channelId).eq("roleId", roleId),
      )
      .first();
    if (!existing) return { ok: true, removed: 0 };
    await ctx.db.delete(existing._id);
    return { ok: true, removed: 1 };
  },
});
