import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getUserByToken } from "./auth";
import { getBotStatus, isBotAdminUser, requireBotAdmin } from "./hidden";
import { requireBotKeyStrict } from "./botAuth";

/**
 * Self-Diagnose — bot tự chẩn đoán lỗi runtime qua AI (chuỗi research:
 * Kira/Mimo V2.5 free 30M tokens/ngày) và đăng ĐỀ XUẤT vá (không tự áp,
 * không tự restart) vào kênh log. Owner bật/tắt trên Admin web.
 *
 * Chi phí: 0 khi không có lỗi (chỉ đọc flag từ batch tick sẵn có).
 * Có lỗi: ~2-5k tokens/lượt qua Kira (không đụng hạn mức Groq/NVIDIA của
 * chống raid). Chống lặp: cùng 1 lỗi (cùng fingerprint) chỉ chẩn đoán 1
 * lần/giờ — quyết định ở phía bot (memory), Convex chỉ lưu thống kê.
 */

/** Kiểm tra user token là chủ bot HOẶC quản trị viên nhóm — trả user hoặc throw. */
async function requireAdmin(ctx: Parameters<typeof getBotStatus>[0], token: string) {
  const user = await getUserByToken(ctx, token);
  const status = await requireBotAdmin(ctx, user);
  return { user, status };
}

/** Trạng thái self-diagnose — hiển thị trong panel Admin (chủ bot + quản trị viên nhóm). */
export const getSettings = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await getUserByToken(ctx, token);
    if (!user) return null;
    const status = await getBotStatus(ctx);
    if (!status || !isBotAdminUser(user, status)) return null;
    return {
      enabled: status.selfDiagnoseEnabled ?? false,
      lastAt: status.selfDiagnoseLastAt ?? null,
      runs: status.selfDiagnoseRuns ?? 0,
    };
  },
});

/** Bật/tắt self-diagnose — chủ bot + quản trị viên nhóm (đây là công tắc của cửa sổ Admin). */
export const setEnabled = mutation({
  args: { token: v.string(), enabled: v.boolean() },
  handler: async (ctx, { token, enabled }) => {
    await requireAdmin(ctx, token);
    const status = await getBotStatus(ctx);
    if (status) {
      await ctx.db.patch(status._id, { selfDiagnoseEnabled: enabled });
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
        selfDiagnoseEnabled: enabled,
      });
    }
    return { ok: true };
  },
});

/**
 * Bot ghi thống kê sau 1 lượt chẩn đoán (botKey). Gộp 1 patch rẻ — chạy tối đa
 * vài lượt/ngày (chống lặp ở phía bot), không ảnh hưởng hạn mức ghi.
 */
export const botRecordDiagnose = mutation({
  args: {
    botKey: v.optional(v.string()),
    /** Nhóm lỗi (fingerprint ngắn) — dùng để hiển thị + chống lặp sau này. */
    fingerprint: v.optional(v.string()),
    /** Mức kết luận AI: crash-lỗi logic / cảnh báo / không rõ. */
    severity: v.optional(v.union(v.literal("high"), v.literal("medium"), v.literal("low"))),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, fingerprint, severity, summary }) => {
    await requireBotKeyStrict(ctx, botKey);
    const status = await getBotStatus(ctx);
    if (!status) return { ok: false };
    const clean = (s: string | undefined, max: number) =>
      String(s ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim()
        .slice(0, max);
    await ctx.db.patch(status._id, {
      selfDiagnoseLastAt: Date.now(),
      selfDiagnoseRuns: (status.selfDiagnoseRuns ?? 0) + 1,
      ...(fingerprint ? { selfDiagnoseLastFingerprint: clean(fingerprint, 120) } : {}),
      ...(severity ? { selfDiagnoseLastSeverity: severity } : {}),
      ...(summary ? { selfDiagnoseLastSummary: clean(summary, 500) } : {}),
    });
    return { ok: true };
  },
});
