import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { translate } from "./i18n";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * NHỊP TIM CỦA BOT — phía web. Ba con số dưới đây phải khớp với thế giới thật,
 * nếu không web sẽ báo bot "mất kết nối" trong lúc bot đang chạy bình thường:
 *
 *   · Nhịp thật của bot: `bot/src/index.js` — `setTimeout(runSyncLoop, 180_000)`,
 *     hẹn nhịp KẾ TIẾP sau khi lượt sync trước chạy xong ⇒ chu kỳ ≥ 180s.
 *     Heartbeat toàn cục được ghi trong chính lượt sync đó
 *     (`guilds:botSyncGuilds` → `botStatus.lastHeartbeat`).
 *   · Ngưỡng phía Convex: `convex/heartbeat.ts` (`BOT_ONLINE_WINDOW_MS`).
 *   · Ngưỡng phía web: chính file này. Lệch nhau = hai màn hình trả lời hai
 *     đáp án khác nhau về cùng một con bot.
 *
 * Bất biến được khoá bằng test: scripts/test-web-contracts.cjs (so khớp giữa
 * các file) + scripts/test-web-ux-upgrades.ts (hành vi: heartbeat 200s — giữa
 * chu kỳ bình thường — KHÔNG được coi là offline).
 */
export const BOT_SYNC_INTERVAL_MS = 180_000;

/**
 * Cửa sổ "bot còn online" = 2 nhịp. Rộng 2 nhịp để bỏ qua được 1 nhịp lỡ
 * (sync chậm, mạng chớp) mà vẫn phát hiện bot chết trong ~6 phút. Lấy đúng 1
 * nhịp (180s) thì ngay trước mỗi nhịp, tuổi heartbeat đã > 180s ⇒ huy hiệu
 * nhấp nháy offline vài giây mỗi 3 phút — đúng lỗi "web báo bot mất kết nối".
 */
export const BOT_ONLINE_WINDOW_MS = 2 * BOT_SYNC_INTERVAL_MS;

/** Tên cũ (đã dùng ở nhiều chỗ) — giữ để không phải sửa hàng loạt, nay đúng bằng ngưỡng toàn cục. */
export const HEARTBEAT_FRESH_MS = BOT_ONLINE_WINDOW_MS;

/**
 * Nhịp refresh `lastHeartbeat` RIÊNG của từng guild: bot chỉ ghi lại field này
 * mỗi 5 lượt sync (`runCounter % 5 === 0` trong bot/src/handlers/guildSync.js)
 * ≈ 900s, vì ghi lại toàn row guild mỗi vòng là nguồn I/O lớn nhất của bảng.
 * Vì vậy KHÔNG được dùng ngưỡng 180s cho heartbeat của guild: làm vậy thì
 * ~12/15 phút mỗi server đều hiện "Bot offline" dù bot đang chạy.
 */
export const GUILD_HEARTBEAT_REFRESH_MS = 5 * BOT_SYNC_INTERVAL_MS;

/** Cửa sổ tươi của heartbeat TỪNG GUILD = 1 chu kỳ refresh + biên 5 phút (lỡ 1 nhịp sync vẫn xanh). */
export const GUILD_HEARTBEAT_FRESH_MS = GUILD_HEARTBEAT_REFRESH_MS + 5 * 60_000;

/** Một heartbeat cũ không còn chứng minh bot đang online (ngưỡng mặc định = toàn cục). */
export function isHeartbeatFresh(
  ts: number | null | undefined,
  now = Date.now(),
  windowMs = BOT_ONLINE_WINDOW_MS,
): boolean {
  return typeof ts === "number" && Number.isFinite(ts) && now - ts < windowMs;
}

/** Như trên nhưng cho `lastHeartbeat` của TỪNG guild (nhịp refresh thưa hơn 5 lần). */
export function isGuildHeartbeatFresh(ts: number | null | undefined, now = Date.now()): boolean {
  return isHeartbeatFresh(ts, now, GUILD_HEARTBEAT_FRESH_MS);
}

export function timeAgo(ts: number | null | undefined): string {
  if (!ts) return translate("chưa rõ");
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return translate("{p}s trước", { p: s });
  const m = Math.floor(s / 60);
  if (m < 60) return translate("{p}p trước", { p: m });
  const h = Math.floor(m / 60);
  if (h < 24) return translate("{p} giờ trước", { p: h });
  return translate("{p} ngày trước", { p: Math.floor(h / 24) });
}
