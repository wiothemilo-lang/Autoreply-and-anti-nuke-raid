/**
 * Chặn ĐỐT USAGE cho endpoint công khai `GET /geo_lang` (Convex HTTP action).
 *
 * Mô hình đe dọa: `/geo_lang` nằm trên miền công khai (`*.convex.site`), KHÔNG
 * auth, và mỗi lượt gọi bắt deployment chạy 1 HTTP action + 1 fetch ra ngoài
 * (api.country.is). Một `curl` loop hoặc botnet biến ta thành proxy geo-IP miễn
 * phí và đốt Function Calls + Action Compute + egress cho tới khi cạn hạn mức
 * của MỌI người dùng thật.
 *
 * 3 lớp, tất cả đều RẺ và không chạm DB:
 *  1. Chuẩn hoá `x-forwarded-for` (bỏ cổng/ngoặc/zone, cắt độ dài) — đầu vào rác
 *     bị loại TRƯỚC khi tốn bất cứ thứ gì.
 *  2. Chỉ nhận IP CÔNG CỘNG: loopback/riêng tư/link-local/multicast trả rỗng
 *     ngay, KHÔNG gọi upstream (bản cũ vẫn fetch vô ích cho những IP này).
 *  3. Trần sliding-window: mỗi IP 20 lượt/phút + trần toàn cục 300 lượt/phút mỗi
 *     instance (chống botnet phân tán, cùng approach với `rateGuard.ts`).
 *
 * LƯU Ý: bộ đếm là module state in-memory nên chỉ sống trong 1 instance — đủ
 * chặn scripted bursts, KHÔNG phải giải pháp distributed. Giống mức cam kết của
 * `rateGuard.ts` và các rate-limit khác trong repo.
 */

/** Cửa sổ trượt dùng chung cho cả 2 trần. */
export const GEO_WINDOW_MS = 60_000;
/** Trần mỗi IP / phút (web chỉ gọi endpoint này 1 lần mỗi phiên). */
export const GEO_MAX_PER_IP_PER_MIN = 20;
/** Trần tổng mọi IP / phút / instance — chặn botnet phân tán. */
export const GEO_MAX_GLOBAL_PER_MIN = 300;

const buckets = new Map<string, number[]>();
let globalHits: number[] = [];
let lastSweep = 0;

/** Dọn IP không còn hoạt động để Map không phình vô hạn (throttle 1 phút/lần). */
function sweep(now: number): void {
  if (now - lastSweep < GEO_WINDOW_MS) return;
  lastSweep = now;
  for (const [ip, hits] of buckets) {
    const last = hits[hits.length - 1] ?? 0;
    if (now - last > GEO_WINDOW_MS * 5) buckets.delete(ip);
  }
}

/**
 * Lấy IP client từ `x-forwarded-for` (Convex chạy sau proxy, IP thật là mục đầu).
 * Trả "" khi không có/đầu vào vô lý — caller coi như IP không hợp lệ.
 */
export function parseClientIp(raw: string | null | undefined): string {
  const first = String(raw ?? "")
    .split(",")[0]
    ?.trim();
  if (!first || first.length > 64) return "";
  let ip = first;
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

/**
 * Còn lượt gọi upstream cho IP này? Trả false nghĩa là caller phải trả đáp án
 * rỗng NGAY (không fetch) — chi phí còn lại của request ≈ 0.
 */
export function allowGeoRequest(ip: string, now: number = Date.now()): boolean {
  if (!ip) return false;
  // Trần toàn cục trước — rẻ nhất và chặn botnet phân tán từ cửa.
  globalHits = globalHits.filter((t) => now - t < GEO_WINDOW_MS);
  if (globalHits.length >= GEO_MAX_GLOBAL_PER_MIN) return false;

  const hits = (buckets.get(ip) ?? []).filter((t) => now - t < GEO_WINDOW_MS);
  if (hits.length >= GEO_MAX_PER_IP_PER_MIN) {
    buckets.set(ip, hits);
    return false; // lượt bị chặn KHÔNG tính vào trần toàn cục
  }
  hits.push(now);
  buckets.set(ip, hits);
  globalHits.push(now);
  sweep(now);
  return true;
}

/** Chỉ dùng trong test: xoá sạch bộ đếm. */
export function __resetGeoGuardForTest(): void {
  buckets.clear();
  globalHits = [];
  lastSweep = 0;
}
