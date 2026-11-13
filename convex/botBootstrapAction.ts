"use node";

declare const process: {
  env: Record<string, string | undefined>;
};

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { computeBotKey } from "./botAuth";
import { BOT_SYNC_INTERVAL_MS } from "./heartbeat";
import { bytesToHex, sha256Hex } from "./sha256";

/**
 * TỰ CẤP PHÁT CHÌA KHÓA BOT (bootstrap) — đóng cửa hậu "botKeySeed chưa đặt
 * thì mọi function bot-side mở cho ai gọi được" (requireBotKey back-compat cũ).
 *
 * Luồng:
 *   1. Bot thật (có DISCORD_TOKEN trong .env trên VPS) gọi action PUBLIC này
 *      lúc khởi động. Phải là action public vì bot qua HTTP client không gọi
 *      được function internal (không có deploy key).
 *   2. Action xác minh token với Discord API GET /users/@me → KẺ NGOÀI KHÔNG
 *      CÓ TOKEN BOT → không bao giờ qua bước này. Đây là chốt chặn duy nhất
 *      cần thiết — action public vẫn an toàn.
 *   3. Sinh botKey = 32 bytes ngẫu nhiên (webcrypto) — KHÔNG dùng seed tĩnh,
 *      kẻ đọc được source cũng không tính được key.
 *   4. Lưu CHỈ BĂM SHA-256("protogon-bot-key::" + botKey) vào
 *      botStatus.botKeySeed (qua internal mutation botBootstrap:storeBotKeySeed),
 *      rồi trả botKey về cho bot. Server KHÔNG lưu key thô — chỉ bot giữ.
 *
 * Chống lạm dụng (relay spam Discord API): tối đa 1 lần THỬ/10 phút cho toàn
 * deployment — bot thật chỉ bootstrap khi mất key nên đủ dùng.
 */

async function fetchDiscord(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  // Không clear timer ngay khi headers về: body JSON phải được abort cùng hạn.
  const timer = setTimeout(() => controller.abort(), 8_000);
  (timer as unknown as { unref?: () => void }).unref?.();
  return fetch(url, { ...init, signal: controller.signal });
}

/** Xác minh Discord bot token — trả { id, username } hoặc null khi sai/mạng lỗi. */
async function verifyDiscordBotToken(botToken: string) {
  try {
    const res = await fetchDiscord("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${botToken.trim()}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: string; bot?: boolean; username?: string };
    if (!data.id || data.bot !== true) return null;
    return { id: data.id, username: data.username ?? "" };
  } catch {
    return null;
  }
}

function assertExpectedBotApplication(
  bot: { id: string },
  storedApplicationId?: string | null,
): string | null {
  const expected = [
    process.env.BOT_APPLICATION_ID,
    process.env.EXPECTED_BOT_APPLICATION_ID,
    process.env.DISCORD_CLIENT_ID,
    storedApplicationId,
  ]
    .map((value) => value?.trim())
    .find((value) => !!value && /^\d{15,21}$/.test(value));
  if (!expected) {
    return "Chưa cấu hình Application ID bot hợp lệ (BOT_APPLICATION_ID, EXPECTED_BOT_APPLICATION_ID hoặc DISCORD_CLIENT_ID)";
  }
  if (bot.id !== expected) {
    return "Token bot không khớp Application ID của deployment — kiểm tra lại token bot và Application ID";
  }
  return null;
}

type BootstrapResult =
  { ok: true; botKey: string; applicationId: string } | { ok: false; error: string };

const bootstrapCalls: number[] = [];
const BOOTSTRAP_WINDOW_MS = 60_000;
const BOOTSTRAP_MAX_PER_WINDOW = 30;
/** Token đã xác minh thành công được miễn trần trong 10 phút (xem handler). */
const KNOWN_GOOD_TOKEN_TTL_MS = 10 * 60_000;

/**
 * Token bot đã từng xác minh THÀNH CÔNG trong instance này.
 *
 * Vì sao cần: trần 30 lượt/phút là bucket TOÀN CỤC (action không có IP ổn
 * định). Kẻ gửi token rác có thể lấp đầy bucket, khiến bot thật không
 * bootstrap lại được khi self-heal — đúng kiểu DoS khả dụng. Token thật đã
 * qua Discord một lần thì được miễn trần; token lạ vẫn bị chặn trước khi gọi
 * Discord (không đốt quota API). Vẫn xác minh lại với Discord mỗi lần để
 * token bị thu hồi không được dùng tiếp.
 */
let knownGoodToken: { hash: string; at: number } | null = null;

function isKnownGoodToken(hash: string): boolean {
  return Boolean(
    knownGoodToken &&
    knownGoodToken.hash === hash &&
    Date.now() - knownGoodToken.at < KNOWN_GOOD_TOKEN_TTL_MS,
  );
}

/**
 * Guard chống xoay seed ngoài luồng — sự cố 06/10: một tiến trình khác có
 * DISCORD_TOKEN gọi bootstrap trong khi bot thật đang chạy, xoay seed làm bot
 * bị từ chối 22 giờ. Bot cập nhật heartbeat theo guild sync mỗi
 * `BOT_SYNC_INTERVAL_MS` (180 giây), KHÔNG phải 60 giây. Cửa sổ phải rộng hơn
 * một nhịp: nếu bằng đúng 180 giây, ngay trước mỗi nhịp heartbeatAge > 180s
 * và guard lại mở — đúng lúc cần chặn.
 *
 * Self-heal hợp lệ vẫn qua được: khi bot bị từ chối botKey, call heartbeat
 * cũng bị từ chối theo, nên `lastHeartbeat` đã cũ trước khi bot gọi bootstrap.
 */
const LIVE_HEARTBEAT_GUARD_MS = 2 * BOT_SYNC_INTERVAL_MS;

function allowBootstrapCall(): boolean {
  const now = Date.now();
  while (bootstrapCalls[0] && now - bootstrapCalls[0] >= BOOTSTRAP_WINDOW_MS) {
    bootstrapCalls.shift();
  }
  if (bootstrapCalls.length >= BOOTSTRAP_MAX_PER_WINDOW) return false;
  bootstrapCalls.push(now);
  return true;
}

/**
 * Hex ngẫu nhiên 32 bytes — dùng webcrypto global (có trong cả Node 18+ actions
 * "use node" lẫn V8 runtime) + `bytesToHex` dùng chung với sha256.ts.
 */
export const requestBotKey = action({
  args: { botToken: v.string() },
  handler: async (ctx, { botToken }): Promise<BootstrapResult> => {
    // Token Discord ~70 ký tự; cắt sớm để không băm chuỗi khổng lồ từ client.
    const token = botToken.trim();
    if (token.length > 200) {
      return { ok: false as const, error: "Token bot không hợp lệ (Discord từ chối)" };
    }
    const tokenHash = sha256Hex(token);
    // Token lạ mới tiêu bucket chung — token thật đã xác minh trước đó được
    // miễn để token rác không khoá đường self-heal của bot.
    if (!isKnownGoodToken(tokenHash) && !allowBootstrapCall()) {
      return { ok: false, error: "Quá nhiều lượt bootstrap; thử lại sau ít phút" };
    }
    const bot = await verifyDiscordBotToken(token);
    if (!bot) {
      return { ok: false as const, error: "Token bot không hợp lệ (Discord từ chối)" };
    }
    knownGoodToken = { hash: tokenHash, at: Date.now() };
    const status = await ctx.runQuery(internal.botAuth.getBotKeyStatusInternal);
    const applicationError = assertExpectedBotApplication(bot, status.botApplicationId);
    if (applicationError) return { ok: false as const, error: applicationError };
    // Bot thật còn sống (heartbeat mới) → không cho xoay seed ngoài luồng.
    // Đặt TRƯỚC markBootstrapAttempt để lượt bị chặn không đốt cooldown 10 phút
    // của lần self-heal hợp lệ kế tiếp.
    const heartbeatAge =
      status.lastHeartbeat === null ? Number.POSITIVE_INFINITY : Date.now() - status.lastHeartbeat;
    if (status.seeded && heartbeatAge < LIVE_HEARTBEAT_GUARD_MS) {
      return {
        ok: false as const,
        error:
          "Bot đang chạy và gửi heartbeat gần đây — từ chối xoay chìa khóa ngoài luồng. Dừng bot trước nếu thật sự cần bootstrap lại.",
      };
    }
    // Chỉ ghi cooldown sau khi token + Application ID đã hợp lệ; caller random
    // không thể khóa bot thật trong 10 phút chỉ bằng một request sai.
    const gate = await ctx.runMutation(internal.botBootstrap.markBootstrapAttempt);
    if (!gate.ok) return gate;
    const botKey = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
    // computeBotKey = SHA-256("protogon-bot-key::" + key) — thuần TS, khớp protocol botAuth.
    const seed = computeBotKey(botKey);
    const stored = await ctx.runMutation(internal.botBootstrap.storeBotKeySeed, {
      seed,
      botApplicationId: bot.id,
    });
    if (!stored.ok) return stored;
    // Bất biến protocol: botKey do bot giữ phải khớp seed vừa lưu.
    if (computeBotKey(botKey) !== seed) {
      return { ok: false as const, error: "Lỗi nội bộ: key và seed không khớp" };
    }
    return { ok: true as const, botKey, applicationId: bot.id };
  },
});

type KeyStatusResult =
  { ok: true; seeded: boolean; applicationId: string | null } | { ok: false; error: string };

const keyStatusCalls: number[] = [];
const KEY_STATUS_WINDOW_MS = 60_000;
const KEY_STATUS_MAX_PER_WINDOW = 6;

function allowKeyStatusCall(): boolean {
  const now = Date.now();
  while (keyStatusCalls[0] && now - keyStatusCalls[0] >= KEY_STATUS_WINDOW_MS) {
    keyStatusCalls.shift();
  }
  if (keyStatusCalls.length >= KEY_STATUS_MAX_PER_WINDOW) return false;
  keyStatusCalls.push(now);
  return true;
}

/** Bot hỏi trạng thái seed trước khi bootstrap (tránh xoay key vô ích). */
export const keyStatus = action({
  args: { botToken: v.string() },
  handler: async (ctx, { botToken }): Promise<KeyStatusResult> => {
    if (!allowKeyStatusCall()) {
      return { ok: false, error: "Quá nhiều lượt kiểm tra trạng thái; thử lại sau ít phút" };
    }
    const bot = await verifyDiscordBotToken(botToken);
    if (!bot) {
      return { ok: false as const, error: "Token bot không hợp lệ (Discord từ chối)" };
    }
    const status = await ctx.runQuery(internal.botAuth.getBotKeyStatusInternal);
    const applicationError = assertExpectedBotApplication(bot, status.botApplicationId);
    if (applicationError) return { ok: false as const, error: applicationError };
    return { ok: true as const, seeded: status.seeded, applicationId: status.botApplicationId };
  },
});
