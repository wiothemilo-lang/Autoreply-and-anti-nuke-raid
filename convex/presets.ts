import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { getUserByToken, canManageGuild } from "./auth";
import { ANTI_NUKE_MODULES } from "./modules";

/**
 * Config Presets — profile bảo mật 1 chạm (Đợt 6).
 *
 * Vấn đề: server mới cài bot phải bật/tắt + chỉnh ngưỡng từng module (30+ module)
 * — mất thời gian và dễ cấu hình thiếu. Preset giải quyết: chủ server chọn 1
 * trong 3 profile, mutation áp hàng loạt lên antinukeModules + các field global.
 *
 * Nguyên tắc QUAN TRỌNG (giống botEnsureModules):
 *  - Không đụng whitelist (whitelistUsers/Roles/adminRoles/modRoles) — dữ liệu
 *    riêng của server, preset không có quyền xóa.
 *  - Ghi log rõ vào response số module đã đổi để dashboard hiển thị.
 */

/** 3 profile — giá trị theo kinh nghiệm vận hành: */
export const SECURITY_PRESETS = {
  /** Server nhỏ (<500 member): nhẹ tay, ưu tiên không phiền người thật. */
  small: {
    label: "Server nhỏ",
    description: "Bảo vệ nhẹ — ngưỡng thoải mái, ít phạt mạnh, phù hợp server < 500 thành viên.",
    global: { antinukeEnabled: true, joinGateEnabled: false, actionBudgetPerMinute: 15 },
    moduleTweaks: {
      // Ngưỡng nới rộng hơn mặc định: server nhỏ ít khi bị nhắm, giảm false positive.
      massBan: { threshold: 6, windowSeconds: 15 },
      massKick: { threshold: 6, windowSeconds: 15 },
      massJoin: { threshold: 12, windowSeconds: 20 },
      spam: { threshold: 6, windowSeconds: 10 },
      massMessage: { threshold: 4, windowSeconds: 15 },
    },
    enable: [
      "massBan",
      "massKick",
      "massChannelDelete",
      "massRoleDelete",
      "adminSelfGrant",
      "spam",
      "invite",
      "malware",
      "suspiciousBotAlert",
      "botHitAndRun",
    ],
  },
  /** Cộng đồng lớn (500-10k): cân bằng — đủ ngưỡng mặc định, bật thêm gate. */
  community: {
    label: "Cộng đồng lớn",
    description: "Cân bằng cho server lớn — full nuke guard + join gate + heat leo thang.",
    global: {
      antinukeEnabled: true,
      joinGateEnabled: true,
      joinGateMinAgeDays: 7,
      actionBudgetPerMinute: 20,
    },
    moduleTweaks: {},
    enable: [
      "massBan",
      "massKick",
      "massJoin",
      "massChannelCreate",
      "massChannelDelete",
      "massRoleCreate",
      "massRoleDelete",
      "massMessageDelete",
      "massWebhookCreate",
      "massBotAdd",
      "adminSelfGrant",
      "externalAppRaid",
      "suspiciousBotAlert",
      "botHitAndRun",
      "spam",
      "massMessage",
      "blankNoise",
      "invite",
      "malware",
    ],
  },
  /** Trading/tài sản cao (gọi tên cả server NFT/crypto): nghiêm ngặt nhất. */
  highrisk: {
    label: "Trading / rủi ro cao",
    description:
      "Nghiêm ngặt nhất — ngưỡng thấp, ban nhanh, phù hợp server tài sản/game có giá trị.",
    global: {
      antinukeEnabled: true,
      joinGateEnabled: true,
      joinGateMinAgeDays: 14,
      joinGateRequireAvatar: true,
      actionBudgetPerMinute: 30,
    },
    moduleTweaks: {
      massBan: { threshold: 3, windowSeconds: 10 },
      massKick: { threshold: 3, windowSeconds: 10 },
      massJoin: { threshold: 5, windowSeconds: 10 },
      massBotAdd: { threshold: 1, windowSeconds: 60 },
      spam: { threshold: 4, windowSeconds: 10 },
    },
    enable: [
      "massBan",
      "massKick",
      "massJoin",
      "massChannelCreate",
      "massChannelDelete",
      "massRoleCreate",
      "massRoleDelete",
      "massMessageDelete",
      "massWebhookCreate",
      "massThreadCreate",
      "massThreadDelete",
      "massChannelRename",
      "massChannelOverwrite",
      "massRoleEdit",
      "massRoleAssign",
      "massNickname",
      "massEmoji",
      "massBotAdd",
      "massInviteCreate",
      "guildTamper",
      "adminSelfGrant",
      "externalAppRaid",
      "suspiciousBotAlert",
      "botHitAndRun",
      "spam",
      "massMessage",
      "blankNoise",
      "invite",
      "malware",
      "mention",
      "attachment",
    ],
  },
} as const;

export type PresetKey = keyof typeof SECURITY_PRESETS;

/** Áp 1 preset cho guild — chỉ đụng antinukeModules + global an toàn (không whitelist). */
export const applyPreset = mutation({
  args: {
    token: v.string(),
    guildId: v.string(),
    preset: v.union(v.literal("small"), v.literal("community"), v.literal("highrisk")),
  },
  handler: async (ctx, { token, guildId, preset }) => {
    const user = await getUserByToken(ctx, token);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild || !canManageGuild(user, guild))
      throw new Error("Không có quyền quản lý server này");

    const def = SECURITY_PRESETS[preset];
    const now = Date.now();
    let updated = 0;
    let enabled = 0;

    // 1) Cập nhật/thêm từng module trong danh sách enable.
    const existing = await ctx.db
      .query("antinukeModules")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .collect();
    const byModule = new Map(existing.map((m) => [m.module, m]));
    const known = new Set(ANTI_NUKE_MODULES.map((m) => m.module));

    for (const moduleName of def.enable) {
      // Chỉ áp module hệ thống biết — danh sách preset lỗi thời không làm crash.
      if (!known.has(moduleName)) continue;
      const tweak =
        (def.moduleTweaks as Record<string, { threshold?: number; windowSeconds?: number }>)[
          moduleName
        ] ?? {};
      const base = ANTI_NUKE_MODULES.find((m) => m.module === moduleName)!;
      const row = byModule.get(moduleName);
      const patch = {
        enabled: true,
        threshold: tweak.threshold ?? base.threshold,
        windowSeconds: tweak.windowSeconds ?? base.windowSeconds,
        updatedAt: now,
      };
      if (row) {
        await ctx.db.patch(row._id, patch);
        updated++;
      } else {
        await ctx.db.insert("antinukeModules", {
          guildId,
          module: moduleName,
          enabled: true,
          threshold: patch.threshold,
          windowSeconds: patch.windowSeconds,
          punish: base.punish as "warn" | "kick" | "ban" | "timeout",
          whitelistRoles: [],
          timeoutSeconds: moduleName === "spam" || moduleName === "attachment" ? 300 : 600,
          heat: base.heat,
          updatedAt: now,
        });
        enabled++;
      }
    }

    // 2) Global: antinuke tổng + joinGate + actionBudget (không đụng whitelist).
    // settingsChangedAt BẮT BUỘC: preset ghi thẳng cấu hình bot đọc
    // (antinukeEnabled, joinGate*, actionBudgetPerMinute…) và cả bảng
    // antinukeModules mà getBotConfig trả về — thiếu tín hiệu thì "Áp preset"
    // không có tác dụng với bot tới 30 phút (cùng lớp bug 23/09).
    const globalPatch: Record<string, unknown> = {
      updatedAt: now,
      settingsChangedAt: Date.now(),
    };
    // TÊN BIẾN CỐ Ý KHÁC `v`: ở đây khai báo `v` sẽ CHE MẤT `v` validator của
    // convex/values trong phạm vi toàn thân hàm. Hiện tại vẫn chạy (không có
    // `v.xxx()` nào sau đó), nhưng chỉ cần ai thêm một dòng validator là nổ
    // TypeError lúc runtime — lỗi chỉ lộ trên production.
    for (const [key, value] of Object.entries(def.global)) {
      globalPatch[key] = value;
    }
    await ctx.db.patch(guild._id, globalPatch);

    return {
      ok: true,
      preset,
      label: def.label,
      modulesUpdated: updated,
      modulesCreated: enabled,
    };
  },
});
