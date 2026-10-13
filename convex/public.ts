"use node";

/// <reference types="node" />

/** Minimal env typing so this file also type-checks from the Vite app. */
declare const process: {
  env: Record<string, string | undefined>;
};

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { rateLimitPublicAction } from "./rateGuard";

const DISCORD_SNOWFLAKE_RE = /^\d{15,21}$/;

function validClientId(value: string | undefined | null): string {
  const candidate = String(value ?? "").trim();
  return DISCORD_SNOWFLAKE_RE.test(candidate) ? candidate : "";
}

/**
 * Reads non-secret public config from the environment. Only actions run on
 * Node.js, so this is an action rather than a query.
 *
 * FIX (15/09): web production Broken — DISCORD_CLIENT_ID chỉ được đặt trên
 * hosting tĩnh, KHÔNG có trên deployment Convex, nên clientId luôn trả "" →
 * nút đăng nhập Discord + chat Haimiya (đòi đăng nhập) chết theo.
 * Fallback: botStatus.botApplicationId — Application ID của bot do bootstrap
 * lưu khi bot online (chính là Client ID Discord; đây là thông tin công khai
 * của bot, không phải secret).
 *
 * ABUSE RESISTANCE (chống đốt usage): endpoint KHÔNG auth → guard 2 tầng
 * (xem rateGuard.ts). Khi bị rate-limit trả giá trị mặc định ngay (không chạm
 * DB) + cờ `rateLimited` — web dùng BAKED_CLIENT_ID nên không ảnh hưởng UX.
 */
export const publicConfig = action({
  args: {},
  handler: async (ctx) => {
    const guard = await rateLimitPublicAction(ctx, {
      name: "publicConfig",
      maxPerMin: 30,
      globalMaxPerMin: 600,
    });
    if (!guard.ok) {
      // Hợp đồng no-throw: trả mặc định, web tự dùng VITE_DISCORD_CLIENT_ID.
      return {
        clientId: validClientId(process.env.DISCORD_CLIENT_ID),
        discordInvite: "https://discord.gg/rftv",
        facebookUrl: "https://www.facebook.com/profile.php?id=61592820547312",
        rateLimited: true,
      };
    }

    let clientId = validClientId(process.env.DISCORD_CLIENT_ID);
    if (!clientId) {
      try {
        const status = await ctx.runQuery(internal.hidden.getBotStatusInternal);
        clientId = validClientId(status?.botApplicationId);
      } catch {
        // Deployment chưa bootstrap bot → giữ rỗng, web hiển thị hướng dẫn cấu hình.
      }
    }
    return {
      clientId,
      discordInvite: process.env.DISCORD_INVITE ?? "https://discord.gg/rftv",
      facebookUrl:
        process.env.FACEBOOK_URL ?? "https://www.facebook.com/profile.php?id=61592820547312",
      rateLimited: false,
    };
  },
});
