import {
  type QueryCtx,
  type MutationCtx,
  type ActionCtx,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { getBotStatus } from "./hidden";
import { sha256Hex } from "./sha256";
import { ConvexError } from "convex/values";

/**
 * Lỗi từ chối botKey — ném `ConvexError` chứ KHÔNG phải `Error thường`.
 *
 * Convex production CHE thông điệp của `Error` thường thành
 * "[Request ID: …] Server Error" (chi tiết chỉ nằm ở tab Logs). Bot bên kia vì
 * thế không phân biệt được "key bị từ chối" với 500 thông thường → không tự
 * xoay key được: bug thật 06/10/2026, 22 giờ prewarm 0/10 mới lộ.
 * `ConvexError` gửi kèm `data` về client DÙ message bị mask (browser.bundle:
 * forwardData → error.data) — đó là kênh máy đọc được. Thông điệp tiếng Việt
 * vẫn nằm trong data để người xem log đọc ra.
 */
/**
 * Dữ liệu lỗi botKey — client đọc `err.data.code` (xem `isBotKeyRejection`
 * trong bot/src/convex.js). `message` tiếng Việt chỉ để người đọc log.
 */
type BotKeyErrorData = {
  code: "BOT_KEY_INVALID" | "BOT_KEY_SEED_MISSING";
  message: string;
};

function botKeyRejected(code: BotKeyErrorData["code"], vi: string): ConvexError<BotKeyErrorData> {
  return new ConvexError({ code, message: vi });
}

/**
 * Chìa khóa dùng chung cho các function chỉ bot được gọi.
 *
 * Convex không có IP allowlist, và các function "bot*" hiện không có hàng rào
 * nào — bất kỳ ai cũng có thể ghi dữ liệu giả (heartbeat giả, backup giả,
 * schedule lockdown giả, nhiệt độ giả, cướp backup JSON…). Fix: mọi function
 * bot-side phải gửi đúng `botKey`, tạo từ OWNER_SEED (env trên Convex — điền
 * qua Keys/UI hoặc `npx convex env set OWNER_SEED ...`):
 *
 *   botKey = SHA-256("protogon-bot-key::" + OWNER_SEED)
 *
 * Bot tính cùng chuỗi này từ OWNER_SEED trong .env trên VPS. Kẻ tấn công không
 * có OWNER_SEED thì không tính được botKey, dù biết đầy đủ source code.
 *
 * Back-compat: nếu OWNER_SEED chưa đặt (bot cũ chưa update), check được bỏ qua
 * (chính xác như hành vi trước đây). Đặt OWNER_SEED để kích hoạt bảo vệ.
 */

const KEY_PREFIX = "protogon-bot-key::";

/** SHA-256 (chạy được cả trong mutation/query lẫn client) — tái dùng sha256 thuần TS. */

export function computeBotKey(ownerSeed: string): string {
  return sha256Hex(`${KEY_PREFIX}${ownerSeed}`);
}

/**
 * Đọc OWNER_SEED từ env của deployment. OWNER_SEED là biến "use node"-independent:
 * query/mutation của Convex đọc được env process thông qua V8 runtime env — thực tế
 * Convex chỉ expose process.env trong actions ("use node"). Do đó seed được lưu
 * trong bảng botStatus (do chủ bot đặt 1 lần qua admin web) thay vì env.
 */
export async function requireBotKey(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  botKey: string | undefined,
): Promise<void> {
  // Action không có db trực tiếp — đọc seed qua internal query.
  const status =
    "db" in ctx
      ? await getBotStatus(ctx)
      : await ctx.runQuery(internal.hidden.getBotStatusInternal);
  const seed = status?.botKeySeed;
  // Chưa cài seed → chưa kích hoạt (giữ back-compat với bot cũ).
  if (!seed) return;
  if (!botKey || computeBotKey(botKey) !== seed) {
    throw botKeyRejected("BOT_KEY_INVALID", "Chìa khóa bot không hợp lệ (botKey)");
  }
}

/**
 * BẢO MẬT CAO: giống requireBotKey nhưng KHÔNG có back-compat.
 * Dùng cho các function hủy diệt nếu bị giả mạo: lưu/xóa/claim backup, đồng bộ
 * guild/kênh/role, ghi nhận chủ sở hữu bot… Khi botKeySeed đã đặt mà caller
 * không có chìa khóa đúng → từ chối tuyệt đối (kể cả khi seed chưa đặt, function
 * này vẫn yêu cầu botKey khớp seed ngay khi seed xuất hiện — vì vậy bot phải chạy
 * bootstrap trước, xem botBootstrap.ts).
 */
export async function requireBotKeyStrict(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  botKey: string | undefined,
): Promise<void> {
  const status =
    "db" in ctx
      ? await getBotStatus(ctx)
      : await ctx.runQuery(internal.hidden.getBotStatusInternal);
  const seed = status?.botKeySeed;
  if (!seed) {
    // Seed chưa được cấp phát — bot thật phải chạy bootstrap (botBootstrap.ts)
    // trước khi dùng các function bảo mật cao. Từ chối để không có cửa hậu.
    throw botKeyRejected(
      "BOT_KEY_SEED_MISSING",
      "Chìa khóa bot chưa được cấp phát — bot cần kết nối bản mới để tự cấp phát (bootstrap)",
    );
  }
  if (!botKey || computeBotKey(botKey) !== seed) {
    throw botKeyRejected("BOT_KEY_INVALID", "Chìa khóa bot không hợp lệ (botKey)");
  }
}

/** Sinh chuỗi botKey từ OWNER_SEED — dùng ở Admin web (chỉ chủ bot) + trên VPS. */
export { KEY_PREFIX };

/** (internal) Bot hỏi: seed đã cấp phát chưa? Không lộ seed — chỉ trả cờ + applicationId. */
export const getBotKeyStatusInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const status = await getBotStatus(ctx);
    return {
      seeded: !!status?.botKeySeed,
      botApplicationId: status?.botApplicationId ?? null,
      lastBootstrapAt: status?.lastBootstrapAt ?? null,
    };
  },
});
