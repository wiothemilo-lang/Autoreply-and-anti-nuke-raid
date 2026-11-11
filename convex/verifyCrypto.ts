/**
 * verifyCrypto — chuẩn hoá IP + băm HMAC cho hệ thống xác minh web.
 *
 * Nguyên tắc bảo mật (xem docs/verify-ip-architecture.md):
 *  - KHÔNG BAO GIỜ lưu IP thô. Mọi thứ đi vào DB đều là HMAC-SHA-256 với
 *    `IP_HASH_SECRET` nằm trong Convex env.
 *  - Hash theo `guildId` cho dữ liệu hiển thị/quản trị của từng server; hash
 *    "global" riêng cho đồ thị identity xuyên server (kiểu Double Counter).
 *    Tách miền như vậy để lộ hash của server A không cho phép đối chiếu sang
 *    server B nếu chỉ có secret.
 *  - Token verify là bí mật 256-bit; DB chỉ lưu SHA-256(token) — lộ DB không
 *    dùng lại được token.
 *
 * File này THUẦN TypeScript (không đọc env, không gọi mạng) để dùng được ở
 * default runtime, Node action và test. Caller truyền secret vào.
 */

import { hmacSha256Hex, sha256Hex } from "./sha256";

/** Số byte token verify — 256 bit, đủ chống đoán. */
export const VERIFY_TOKEN_BYTES = 32;

/** TTL mặc định của một phiên verify (10 phút). */
export const VERIFY_SESSION_TTL_MS = 10 * 60_000;

/** Trần cứng của một lệnh ban IP (ngày) — không cho ban vĩnh viễn. */
export const IP_BAN_MAX_DAYS = 90;

/** Hạn mặc định của một lệnh ban IP (ngày). */
export const IP_BAN_DEFAULT_DAYS = 7;

/** Phiên bản consent hiển thị trên trang verify — tăng khi đổi nội dung. */
export const VERIFY_CONSENT_VERSION = "2026-11-11";

const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Mã hoá base64url không padding (token trong URL không cần escape). */
export function base64UrlEncode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += BASE64URL[(n >> 18) & 63];
    out += BASE64URL[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += BASE64URL[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += BASE64URL[n & 63];
  }
  return out;
}

/**
 * Sinh token verify 256-bit.
 *
 * `crypto.getRandomValues` có ở Convex default runtime, Node 18+ và Bun. Không
 * dùng Math.random: token là capability duy nhất bảo vệ phiên.
 */
export function generateVerifyToken(): string {
  const bytes = new Uint8Array(VERIFY_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/** Hash token để lưu DB. Token đã đủ entropy nên SHA-256 thuần là đủ. */
export function hashVerifyToken(token: string): string {
  return sha256Hex(`protogon-verify-token::${token}`);
}

/**
 * Chuẩn hoá một IP đơn lẻ (đã tách khỏi X-Forwarded-For):
 *  - bỏ ngoặc IPv6 + cổng, zone id;
 *  - lowercase (IPv6 không phân biệt hoa thường);
 *  - cắt khoảng trắng.
 * Trả "" nếu rỗng/quá dài — caller coi là IP không hợp lệ.
 */
export function normalizeIp(raw: string | null | undefined): string {
  let ip = String(raw ?? "").trim();
  if (!ip || ip.length > 64) return "";
  if (ip.startsWith("[")) {
    const end = ip.indexOf("]");
    if (end < 0) return "";
    ip = ip.slice(1, end);
  } else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) {
    ip = ip.slice(0, ip.indexOf(":"));
  }
  const zone = ip.indexOf("%");
  if (zone >= 0) ip = ip.slice(0, zone);
  return ip.trim().toLowerCase();
}

/** Hash IP theo từng guild — dùng cho ipBans và hiển thị quản trị. */
export function ipHash(secret: string, guildId: string, ip: string): string {
  const normalized = normalizeIp(ip);
  if (!secret) throw new Error("Thiếu IP_HASH_SECRET");
  if (!normalized) throw new Error("IP không hợp lệ");
  return hmacSha256Hex(secret, `guild-ip::${guildId}::${normalized}`);
}

/** Hash IP miền toàn cục — chỉ dùng cho đồ thị identity xuyên server. */
export function globalIpHash(secret: string, ip: string): string {
  const normalized = normalizeIp(ip);
  if (!secret) throw new Error("Thiếu IP_HASH_SECRET");
  if (!normalized) throw new Error("IP không hợp lệ");
  return hmacSha256Hex(secret, `global-ip::${normalized}`);
}

/**
 * Hash một tín hiệu identity (fingerprint/cookie/user-agent) trong miền toàn
 * cục. `kind` tách miền để cùng một chuỗi ở 2 loại tín hiệu không va nhau.
 */
export function signalHash(secret: string, kind: string, value: string): string {
  if (!secret) throw new Error("Thiếu IP_HASH_SECRET");
  const v = String(value ?? "").trim();
  if (!v) throw new Error("Tín hiệu rỗng");
  return hmacSha256Hex(secret, `signal::${kind}::${v}`);
}

/** Parse IPv4 → 4 số; null nếu sai dạng. */
function parseIpv4(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

/** IPv4 thuộc CGNAT 100.64.0.0/10 — hàng nghìn người dùng chung một IP. */
export function isSharedIpv4(ip: string): boolean {
  const quad = parseIpv4(normalizeIp(ip));
  if (!quad) return false;
  return quad[0] === 100 && quad[1] >= 64 && quad[1] <= 127;
}

/**
 * Có phải dải IP dùng chung/hosting dễ ban nhầm? Ngoài CGNAT, ipapi.is còn trả
 * `is_mobile` — caller cộng thêm cờ đó. Hàm này chỉ xét phần suy ra từ địa chỉ.
 */
export function isSharedIp(ip: string): boolean {
  return isSharedIpv4(ip);
}

/**
 * Ghép 4 nhóm đầu (64 bit) của IPv6 thành prefix /64 chuẩn hoá.
 *
 * Vì sao cần: IPv6 privacy address đổi mỗi phiên; ban một địa chỉ gần như vô
 * dụng, còn ban /64 trúng cả mạng hộ gia đình — nên prefix là TUỲ CHỌN, không
 * bật mặc định. Trả null cho IPv4/không hợp lệ.
 */
export function ipv6Prefix64(ip: string): string | null {
  const normalized = normalizeIp(ip);
  if (!normalized.includes(":")) return null;
  const [head] = normalized.split("%");
  const halves = head.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (halves.length === 1 && missing !== 0) return null;
  if (missing < 0) return null;
  const groups = [...left, ...Array(missing).fill("0"), ...right];
  if (groups.length !== 8) return null;
  // Validate MỌI nhóm, không chỉ 4 nhóm đầu — chuỗi rác ở nửa sau vẫn phải bị
  // từ chối thay vì lặng lẽ tạo prefix từ nửa hợp lệ.
  const normalizedGroups: string[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
    normalizedGroups.push(g.replace(/^0+/, "") || "0");
  }
  return `${normalizedGroups.slice(0, 4).join(":")}::/64`;
}

/** Hash prefix IPv6 /64 theo guild — chỉ dùng khi admin chủ động bật scope prefix. */
export function ipPrefixHash(secret: string, guildId: string, prefix: string): string {
  if (!secret) throw new Error("Thiếu IP_HASH_SECRET");
  return hmacSha256Hex(secret, `guild-ip-prefix::${guildId}::${prefix}`);
}

/** Kẹp số ngày ban về biên an toàn (1..90). */
export function clampBanDays(days: unknown, fallback = IP_BAN_DEFAULT_DAYS): number {
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(1, Math.min(IP_BAN_MAX_DAYS, Math.floor(n)));
}

/** Hex ngẫu nhiên dùng cho whitelist hash hiển thị/so khớp — 128 bit. */
export function randomHex(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let s = "";
  for (const b of buf) s += b.toString(16).padStart(2, "0");
  return s;
}
