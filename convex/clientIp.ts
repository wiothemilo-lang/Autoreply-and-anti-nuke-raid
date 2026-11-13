/**
 * Chuẩn hoá IP client từ header proxy — dùng chung cho `/verify/complete`
 * và `/verify/self-test`.
 *
 * Vì sao tách khỏi `httpRateGuard.ts`: file đó chỉ lo trần tần suất; quy tắc
 * "tin mục nào của X-Forwarded-For" là ranh giới bảo mật của verify, phải
 * test được độc lập và chỉ có MỘT bản trong toàn repo.
 *
 * Quy tắc chọn: lấy mục CUỐI (phải) của `X-Forwarded-For`.
 *  - Header này client tự đặt được (fetch/curl đều gửi được). Proxy chuẩn
 *    APPEND địa chỉ peer vào cuối chuỗi, nên mục cuối là giá trị do hạ tầng
 *    tin cậy thêm vào.
 *  - Lấy mục đầu là lỗ hổng thật: `X-Forwarded-For: <IP nạn nhân>` khiến hệ
 *    thống gắn cờ/ban nhầm người khác, hoặc né IP ban bằng IP sạch.
 *  - Nếu có nhiều proxy, mục cuối là IP của proxy gần nhất (thường private) →
 *    `isPublicIp` từ chối và verify fail-closed, KHÔNG âm thầm tin dữ liệu
 *    client. Đổi `TRUSTED_PROXY_HOPS` chỉ khi biết chắc số hop của hạ tầng.
 */
export const TRUSTED_PROXY_HOPS = 1;
/** Trần số mục đọc từ header — chặn header rác dài hàng chục KB. */
export const MAX_XFF_ENTRIES = 8;

/** Chuẩn hoá MỘT mục: bỏ khoảng trắng, ngoặc IPv6, cổng và zone id. */
export function normalizeIpToken(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim();
  if (!value || value.length > 64) return "";
  let ip = value;
  if (ip.startsWith("[")) {
    // IPv6 trong ngoặc, thường kèm cổng: "[2001:db8::1]:443"
    const end = ip.indexOf("]");
    if (end < 0) return "";
    ip = ip.slice(1, end);
  } else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) {
    ip = ip.slice(0, ip.indexOf(":")); // IPv4 kèm cổng: "1.2.3.4:5678"
  }
  const zone = ip.indexOf("%"); // IPv6 zone id: "fe80::1%eth0"
  if (zone >= 0) ip = ip.slice(0, zone);
  return ip.trim();
}

/** Tách `X-Forwarded-For` thành các mục đã chuẩn hoá, giữ tối đa 8 mục cuối. */
export function splitXff(raw: string | null | undefined): string[] {
  return String(raw ?? "")
    .split(",")
    .map(normalizeIpToken)
    .filter(Boolean)
    .slice(-MAX_XFF_ENTRIES);
}

/**
 * Lấy IP client từ `X-Forwarded-For`.
 *
 * `hops` = số proxy tin cậy tính từ phải sang. Mặc định 1 = mục cuối.
 * Trả "" khi không có/đầu vào vô lý — caller coi như IP không hợp lệ.
 */
export function parseClientIp(
  raw: string | null | undefined,
  hops: number = TRUSTED_PROXY_HOPS,
): string {
  const list = splitXff(raw);
  if (!list.length) return "";
  const hop = Math.max(1, Math.min(Math.trunc(hops) || 1, list.length));
  return list[list.length - hop] ?? "";
}

export type ClientIpResolution = {
  /** IP đã chọn (có thể private nếu mọi nguồn đều private — caller tự fail-closed). */
  ip: string;
  source: "xff" | "meta" | "none";
  chain: string[];
  /**
   * `metaIp` trùng mục ĐẦU của chuỗi >1 mục → nền tảng cũng đang đọc phần
   * client tự đặt. Chỉ báo cho self-test, không tự đổi lựa chọn.
   */
  spoofRisk: boolean;
};

/**
 * Chọn IP cho verify: ưu tiên mục cuối XFF, lùi về metadata của Convex khi
 * mục cuối không phải IP công cộng (nhiều proxy/header rác).
 */
export function resolveClientIp(input: {
  metaIp?: string | null;
  forwardedFor?: string | null;
  hops?: number;
}): ClientIpResolution {
  const chain = splitXff(input.forwardedFor);
  const xffIp = parseClientIp(input.forwardedFor, input.hops);
  const metaIp = normalizeIpToken(input.metaIp);
  const ip = isPublicIp(xffIp) ? xffIp : isPublicIp(metaIp) ? metaIp : xffIp || metaIp;
  const source = ip && ip === xffIp ? "xff" : ip && ip === metaIp ? "meta" : "none";
  const spoofRisk = chain.length > 1 && metaIp !== "" && metaIp === chain[0] && metaIp !== xffIp;
  return { ip, source, chain, spoofRisk };
}

/** Parse IPv4 → 4 số; null nếu không đúng dạng. */
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

/** Dải KHÔNG công cộng của IPv4 (loopback/riêng tư/CGNAT/link-local/multicast…). */
function isNonPublicIpv4(quad: number[]): boolean {
  const [a, b, c] = quad;
  if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

/** IPv6 công cộng? (chỉ loại các dải rõ ràng không định tuyến ra Internet). */
function isPublicIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (!lower.includes(":")) return false;
  if (!/^[0-9a-f:.]+$/.test(lower)) return false;
  if (lower === "::" || lower === "::1") return false;
  if (/^f[cd]/.test(lower)) return false; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(lower)) return false; // fe80::/10 link-local
  if (lower.startsWith("ff")) return false; // multicast
  // IPv4-mapped (::ffff:1.2.3.4) → áp đúng luật IPv4.
  if (lower.startsWith("::ffff:")) {
    const v4 = parseIpv4(lower.slice(7));
    return v4 !== null && !isNonPublicIpv4(v4);
  }
  return true;
}

/** IP công cộng hợp lệ (đủ để gọi upstream)? */
export function isPublicIp(ip: string): boolean {
  if (!ip || ip.length > 64) return false;
  if (ip.includes(":")) return isPublicIpv6(ip);
  const quad = parseIpv4(ip);
  return quad !== null && !isNonPublicIpv4(quad);
}
