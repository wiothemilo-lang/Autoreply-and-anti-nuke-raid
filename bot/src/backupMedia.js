/**
 * backupMedia.js — tải media (ảnh/video/emoji/sticker) cho khôi phục + chặn SSRF.
 *
 * Tách từ handlers/backup.js (đợt #5) — code giữ nguyên hành vi. File backup nhập
 * từ bot nuke khác chứa URL media do kẻ tấn công kiểm soát, nên MỌI URL tải từ xa
 * đều phải qua `assertSafeRemoteUrl` (allowlist giao thức + chặn mạng nội bộ /
 * cloud metadata) trước khi fetch. Đây là module lá — không phụ thuộc module
 * backup nào khác.
 */
const net = require("net");
const dns = require("dns").promises;

/** Mỗi file media phục hồi tối đa 8 MB (an toàn dưới giới hạn upload của Discord). */
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
/** Chờ tối đa khi tải 1 file media từ URL (ms). */
const MEDIA_FETCH_TIMEOUT_MS = 15_000;

/** Đuôi file theo MIME — dùng khi giải mã data URI trong file backup bot nuke. */
const MIME_EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "text/plain": "txt",
  "text/html": "html",
  "application/json": "json",
  "application/pdf": "pdf",
  "application/zip": "zip",
};

function extFromMime(mime) {
  const key = String(mime || "")
    .toLowerCase()
    .split(";")[0]
    .trim();
  return MIME_EXT[key] || "bin";
}

/** Lấy tên file từ URL (bỏ query ?ex=... của CDN Discord), null nếu không có. */
function nameFromUrl(url) {
  try {
    const u = new URL(String(url));
    const base = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "");
    const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    return cleaned || null;
  } catch {
    return null;
  }
}

/** Các dải địa chỉ KHÔNG được phép chạm tới (mạng nội bộ / metadata / loopback). */
const BLOCKED_V4 = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local + cloud metadata (169.254.169.254)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved
];
const BLOCKED_V6 = [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
  ["::ffff:0:0", 96], // IPv4-mapped (soi tiếp phần v4 bên dưới)
  ["64:ff9b::", 96], // IPv4/IPv6 translation
];

/** IPv4-mapped IPv6 (::ffff:a.b.c.d) → trả về phần IPv4 để soi cùng luật v4. */
function unwrapMappedV6(ip) {
  const m = String(ip)
    .toLowerCase()
    .match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return m ? m[1] : null;
}

/** Địa chỉ có nằm trong dải nội bộ/đặc biệt không? (thuần, test được) */
function isPrivateAddress(ip) {
  if (!ip) return false;
  const s = String(ip).trim();
  const mapped = unwrapMappedV6(s);
  if (mapped) return isPrivateAddress(mapped);
  const family = net.isIP(s);
  if (family === 0) return false;
  const list = family === 4 ? BLOCKED_V4 : BLOCKED_V6;
  for (const [addr, bits] of list) {
    try {
      const block = new net.BlockList();
      block.addSubnet(addr, bits, family === 4 ? "ipv4" : "ipv6");
      if (block.check(s, family === 4 ? "ipv4" : "ipv6")) return true;
    } catch {
      // dải không hợp lệ với runtime — bỏ qua, không chặn nhầm
    }
  }
  return false;
}

/**
 * Kiểm tra URL tải media từ xa có an toàn không (chống SSRF).
 *
 * File backup nhập từ bot nuke khác chứa URL media do kẻ tấn công kiểm soát;
 * bot tải chúng từ VPS nên có thể bị dụ chạm cloud metadata (169.254.169.254),
 * localhost hay mạng nội bộ. Chỉ cho https/http, và phân giải DNS: nếu BẤT KỲ
 * địa chỉ nào là nội bộ → từ chối. Ném lỗi khi không an toàn, trả URL khi hợp lệ.
 *
 * Hạn chế còn lại (TOCTOU): fetch phân giải DNS lần nữa sau bước kiểm tra, nên
 * kẻ kiểm soát DNS TTL ngắn có thể tráo sang IP nội bộ giữa hai lần. Đủ cho mối
 * đe phổ biến (IP literal, redirect); chống rebinding triệt để cần pin IP khi
 * kết nối — ngoài phạm vi module này.
 */
async function assertSafeRemoteUrl(raw) {
  let u;
  try {
    u = new URL(String(raw));
  } catch {
    throw new Error("URL không hợp lệ");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("Chỉ cho phép URL http/https");
  }
  const host = u.hostname.replace(/^\[|\]$/g, "");
  // Host là IP literal → soi trực tiếp, không cần DNS.
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("URL trỏ tới địa chỉ nội bộ");
    return u;
  }
  let addrs;
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    throw new Error("Không phân giải được host");
  }
  if (!addrs.length) throw new Error("Không phân giải được host");
  if (addrs.some((a) => isPrivateAddress(a.address))) {
    throw new Error("URL trỏ tới địa chỉ nội bộ");
  }
  return u;
}

/**
 * Tải 1 attachment (URL Discord CDN / URL bất kỳ hoặc data URI base64 nhúng
 * trong file backup của bot nuke) về buffer để đính trực tiếp vào tin khôi phục.
 * Trả { attachment: Buffer, name } hoặc null nếu không tải được / quá nặng.
 */
async function resolveAttachment(att, index) {
  const s = String(att || "").trim();
  if (!s) return null;
  try {
    if (s.startsWith("data:")) {
      const m = s.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
      if (!m) return null;
      const mime = m[1] || "";
      const isBase64 = !!m[2];
      // data URI KHÔNG có ";base64" chứa dữ liệu đã URL-encode (vd
      // "data:text/plain,Hello%20World"). Trước đây luôn giải mã base64 → ra
      // buffer rác (media phục hồi hỏng). Giải mã percent-encoding cho đúng.
      let buf;
      if (isBase64) {
        buf = Buffer.from((m[3] || "").replace(/\s+/g, ""), "base64");
      } else {
        let text = m[3] || "";
        try {
          text = decodeURIComponent(text);
        } catch {
          // % không hợp lệ — giữ nguyên thay vì ném lỗi
        }
        buf = Buffer.from(text, "utf8");
      }
      if (!buf.length || buf.length > MAX_MEDIA_BYTES) return null;
      return { attachment: buf, name: `media-${index}.${extFromMime(mime)}` };
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), MEDIA_FETCH_TIMEOUT_MS);
    try {
      // Chống SSRF: mỗi chặng (kể cả redirect) đều phải qua allowlist. Dùng
      // redirect "manual" để không bị Location header dụ sang IP nội bộ.
      let target = await assertSafeRemoteUrl(s);
      let res;
      for (let hop = 0; hop < 4; hop++) {
        res = await fetch(target, { signal: ctrl.signal, redirect: "manual" });
        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers.get("location");
          if (!loc) return null;
          target = await assertSafeRemoteUrl(new URL(loc, target).href);
          continue;
        }
        break;
      }
      if (!res || !res.ok) return null;
      const len = Number(res.headers.get("content-length") || 0);
      if (len > MAX_MEDIA_BYTES) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length || buf.length > MAX_MEDIA_BYTES) return null;
      return { attachment: buf, name: nameFromUrl(s) || `media-${index}.bin` };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

module.exports = {
  MAX_MEDIA_BYTES,
  MEDIA_FETCH_TIMEOUT_MS,
  extFromMime,
  nameFromUrl,
  isPrivateAddress,
  assertSafeRemoteUrl,
  resolveAttachment,
};
