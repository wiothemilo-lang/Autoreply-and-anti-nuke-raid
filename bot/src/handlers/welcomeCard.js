"use strict";
/**
 * welcomeCard.js — vẽ THẺ PNG cho từng thành viên (ảnh nền + avatar + tên).
 *
 * Vì sao phải VẼ chứ không phải ảnh tĩnh: thẻ phải khác nhau mỗi lượt join
 * (avatar, tên, số thành viên). Người dùng chọn ẢNH NỀN của họ, bot ghép phần
 * động lên trên — cùng kiểu "ảnh chào" mà các bot lớn đang làm.
 *
 * RÀNG BUỘC (đọc trước khi sửa):
 *  1. KHÔNG được làm chết tính năng chào. Mọi lỗi ở module này trả `null` →
 *     `sendGreeting` gửi embed thường như trước. Thiếu thư viện native, thiếu
 *     font, ảnh nền tải hỏng… đều chỉ mất phần ảnh, không mất tin nhắn.
 *  2. Font được NHÚNG trong repo (`bot/assets/fonts/NotoSans-Regular.ttf`) và nạp
 *     TƯỜNG MINH. Đã kiểm chứng: nhiều container không có font hệ thống nào
 *     (`GlobalFonts.families === 0`) → dựa vào font hệ thống là im lặng mất chữ.
 *     Font nhúng cũng phải có dấu tiếng Việt (Noto Sans có đủ; KaTeX/CMU thì không).
 *  3. Nạp LƯỜI (`require` trong hàm): module native chỉ tồn tại trên máy có cài
 *     `@napi-rs/canvas` — test CJS và môi trường khác vẫn phải chạy được.
 *  4. Ký tự font không vẽ được (emoji, chữ Hán…) bị BỎ khỏi ảnh thay vì vẽ ô
 *     tofu. Emoji vẫn nằm nguyên trong nội dung embed.
 */

const fs = require("fs");
const path = require("path");

/** 3:1 — vừa khung ảnh embed của Discord và vẫn nét trên mobile. */
const CARD_W = 900;
const CARD_H = 300;
/** Ảnh nền/avatar tối đa 6 MB, chờ tối đa 6s: thẻ không được treo luồng chào. */
const MAX_IMAGE_BYTES = 6_000_000;
const FETCH_TIMEOUT_MS = 6_000;
/** Tên file gửi kèm — embed trỏ tới `attachment://protogon-card.png`. */
const CARD_FILE_NAME = "protogon-card.png";
const FONT_FAMILY = "ProtogonCard";
const FONT_PATH = path.join(__dirname, "..", "..", "assets", "fonts", "NotoSans-Regular.ttf");

/** Module canvas đã nạp thành công (null = không dùng được). */
let canvasMod = null;
/** Lý do không dùng được (native thiếu / font lỗi) — trả cho web hiển thị. */
let canvasErr = null;

/**
 * Nạp lười `@napi-rs/canvas` + font nhúng. Trả module khi dùng được, null khi không.
 * Chỉ thử MỘT lần cho mỗi tiến trình: lỗi native/font không tự khỏi giữa chừng,
 * thử lại mỗi lượt join chỉ làm chậm và spam log.
 */
function loadCanvas() {
  if (canvasMod || canvasErr) return canvasMod;
  try {
    const mod = require("@napi-rs/canvas");
    if (typeof mod?.createCanvas !== "function" || typeof mod?.loadImage !== "function") {
      throw new Error("@napi-rs/canvas thiếu createCanvas/loadImage");
    }
    if (!fs.existsSync(FONT_PATH)) throw new Error(`thiếu font nhúng: ${FONT_PATH}`);
    mod.GlobalFonts.registerFromPath(FONT_PATH, FONT_FAMILY);
    if (!mod.GlobalFonts.has(FONT_FAMILY)) throw new Error("không nạp được font nhúng");
    canvasMod = mod;
    canvasErr = null;
    console.log("[welcomeCard] sẵn sàng vẽ thẻ (Noto Sans nhúng)");
  } catch (e) {
    canvasErr = e instanceof Error ? e : new Error(String(e));
    canvasMod = null;
    // Một dòng, không stack: chạy trên VPS thì đây là thông tin chẩn đoán chính.
    console.warn(
      `[welcomeCard] không vẽ được thẻ chào (${canvasErr.message}) — bot vẫn gửi tin nhắn thường`,
    );
  }
  return canvasMod;
}

/** Có vẽ được thẻ không? (panel đọc để không hứa hão với người dùng). */
function cardAvailable() {
  return !!loadCanvas();
}

/** Lý do không vẽ được (null nếu vẽ được) — bot báo lên dashboard. */
function cardUnavailableReason() {
  loadCanvas();
  return canvasErr ? canvasErr.message : null;
}

/** #hex / số → chuỗi màu dùng được; rác → màu dự phòng. */
function toColor(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `#${(value & 0xffffff).toString(16).padStart(6, "0")}`;
  }
  let s = String(value ?? "")
    .trim()
    .replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(s)) s = s.replace(/./g, (c) => c + c);
  return /^[0-9a-fA-F]{6}$/.test(s) ? `#${s.toLowerCase()}` : fallback;
}

/** Làm tối màu theo tỉ lệ (0 = giữ nguyên, 1 = đen) — dùng cho gradient dự phòng. */
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.max(0, Math.round(v * (1 - amount))),
  );
  return `#${ch.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Tải ảnh từ URL cấu hình. Chặn SSRF bằng `assertSafeRemoteUrl` của backup.js
 * (dùng chung 1 chỗ, không nhân bản logic kiểm tra địa chỉ nội bộ).
 * Mọi thất bại → null; người gọi tự chọn đường dự phòng.
 */
/**
 * Cache buffer ảnh NỀN theo URL (avatar mỗi người chỉ join 1 lần nên không
 * cache). Trước đây mỗi join tải lại ảnh nền của server: DNS lookup + HTTP +
 * tới 6 MB — 100 join = 100 lượt tải cùng một file. Cache có trần byte để
 * không phình RAM; ảnh nền đổi thì URL mới (dashboard tạo storage URL mới).
 */
const IMAGE_CACHE_TTL_MS = 10 * 60_000;
const IMAGE_CACHE_MAX_BYTES = 32 * 1024 * 1024;
const imageCache = new Map(); // url -> { buf, at }
let imageCacheBytes = 0;

function cacheImage(url, buf) {
  if (buf.length > IMAGE_CACHE_MAX_BYTES) return;
  while (imageCache.size > 0 && imageCacheBytes + buf.length > IMAGE_CACHE_MAX_BYTES) {
    const [oldUrl, entry] = imageCache.entries().next().value;
    imageCache.delete(oldUrl);
    imageCacheBytes -= entry.buf.length;
  }
  const prev = imageCache.get(url);
  if (prev) imageCacheBytes -= prev.buf.length;
  imageCache.set(url, { buf, at: Date.now() });
  imageCacheBytes += buf.length;
}

async function fetchImage(url, opts = {}) {
  const raw = String(url || "").trim();
  if (!raw) return null;
  if (opts.cacheable) {
    const hit = imageCache.get(raw);
    if (hit && Date.now() - hit.at < IMAGE_CACHE_TTL_MS) return hit.buf;
  }
  let safe;
  try {
    safe = await require("./backup").assertSafeRemoteUrl(raw);
  } catch {
    return null; // URL rác / trỏ mạng nội bộ → bỏ, không tải
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(safe, { signal: ctl.signal });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "";
    if (!type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_IMAGE_BYTES) return null;
    if (opts.cacheable) cacheImage(raw, buf);
    return buf;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Vẽ ảnh phủ kín khung kiểu `object-fit: cover` (giữ tỉ lệ, cắt phần thừa). */
function drawCover(ctx, img, x, y, w, h) {
  const iw = img.width || 1;
  const ih = img.height || 1;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/** Ô thăm dò nhỏ để nhận diện glyph khuyết (ô tofu) — 48×48 là đủ cho một ký tự. */
const PROBE_W = 48;
const PROBE_H = 48;

/**
 * Chữ ký ĐIỂM ẢNH của một ký tự (chuỗi bit thô).
 *
 * Vì sao không so BỀ RỘNG: ký tự thật có thể có đúng bề rộng bằng glyph khuyết
 * (Noto Sans: chữ "V" rộng 14.4px = notdef) → bị xoá oan khỏi ảnh dù font có
 * glyph. So điểm ảnh là cách duy nhất đúng: glyph thật khác hẳn ô khuyết.
 */
function glyphSignature(pctx, ch) {
  pctx.clearRect(0, 0, PROBE_W, PROBE_H);
  pctx.fillStyle = "#000";
  pctx.fillText(ch, 2, PROBE_H - 14);
  const d = pctx.getImageData(0, 0, PROBE_W, PROBE_H).data;
  let sig = "";
  // Lấy mẫu thưa (mỗi 7 pixel) — đủ phân biệt glyph, rẻ hơn quét cả ảnh.
  for (let i = 3; i < d.length; i += 28) sig += d[i] > 12 ? "1" : "0";
  return sig;
}

/**
 * Bỏ ký tự font không vẽ được (emoji, chữ Hán…) — nếu không sẽ ra ô tofu.
 * Dấu cách và chữ rỗng luôn được giữ.
 */
function drawableText(font, text) {
  const mod = loadCanvas();
  if (!mod) return "";
  const probe = mod.createCanvas(PROBE_W, PROBE_H).getContext("2d");
  probe.font = font;
  const notdef = glyphSignature(probe, "\uE000");
  const out = [];
  for (const raw of String(text ?? "")) {
    const ch = raw === "\n" || raw === "\t" || raw === "\r" ? " " : raw;
    if (ch === " ") {
      out.push(ch);
      continue;
    }
    if (glyphSignature(probe, ch) !== notdef) out.push(ch);
  }
  return out.join("").replace(/\s+/g, " ").trim();
}

/** Đo bề rộng chữ bằng chính font sẽ vẽ (cùng ctx với lúc fillText). */
function textWidth(font, text) {
  const mod = loadCanvas();
  if (!mod) return 0;
  const ctx = mod.createCanvas(PROBE_W, PROBE_H).getContext("2d");
  ctx.font = font;
  return ctx.measureText(text).width;
}

/** Cắt chữ cho vừa bề rộng, thêm "…" — không để chữ tràn ra ngoài thẻ. */
function fitText(font, text, maxWidth) {
  const clean = drawableText(font, text);
  if (textWidth(font, clean) <= maxWidth) return clean;
  let lo = 0;
  let hi = clean.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (textWidth(font, `${clean.slice(0, mid)}…`) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${clean.slice(0, lo)}…`;
}

/** Ảnh tròn (avatar) với vòng viền màu nhấn. */
function drawAvatar(ctx, img, cx, cy, r, accent) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (img) {
    drawCover(ctx, img, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = "#2b2d31";
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = 6;
  ctx.strokeStyle = accent;
  ctx.stroke();
}

/**
 * Bồ ký tự điều khiển trước khi vẽ.
 *
 * ⚠️ Không phải chuyện hình thức: nickname và tên server do
 * con người đặt, nên chứa được ký tự điều khiển
 * (U+0000–U+001F, U+007F–U+009F). Khi đó `fillText` của
 * @napi-rs/canvas ném `Convert String to CString failed` →
 * `renderCard` trả null → **thành viên đó mất thẻ chào ảnh** vì
 * tự đặt tên khó chịiu (đã bắt được bằng
 * test-welcome-card-render).
 *
 * \n \t \r được đổi thành khoảng trắng (để nội dung nhiều
 * dòng vẫn hiển thị được), phần còn lại bị xoá hẳn.
 */
// eslint-disable-next-line no-control-regex -- đích đến LÀ ký tự điều khiển: lọc chúng khỏi nickname/tên server trước khi vẽ (xem giải thích trên).
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;

function stripControl(text) {
  return String(text ?? "")
    .replace(/[\n\t\r]/g, " ")
    .replace(CONTROL_CHARS, "");
}

/**
 * Vẽ thẻ chào/tạm biệt. Trả Buffer PNG, hoặc null khi không vẽ được
 * (thiếu thư viện/font, hoặc lỗi bất ngờ) — người gọi PHẢI chịu được null.
 *
 * @param {object} o
 * @param {string} o.eyebrow   nhãn nhỏ trên cùng ("CHÀO MỪNG" / "TẠM BIỆT")
 * @param {string} o.name      tên hiển thị của thành viên
 * @param {string} o.meta      dòng phụ (tên server · vị trí thành viên)
 * @param {string} [o.avatarUrl]
 * @param {string} [o.backgroundUrl]
 * @param {string|number} [o.accent]
 */
async function renderCard(o = {}) {
  const mod = loadCanvas();
  if (!mod) return null;
  const { createCanvas, loadImage } = mod;
  const accent = toColor(o.accent, "#57f287");

  try {
    // Tải ảnh SONG SONG: thẻ phải xong trong vài trăm ms, không xếp hàng 2 lượt chờ.
    const [bgBuf, avatarBuf] = await Promise.all([
      fetchImage(o.backgroundUrl, { cacheable: true }),
      fetchImage(o.avatarUrl),
    ]);
    const [bgImg, avatarImg] = await Promise.all([
      bgBuf ? loadImage(bgBuf).catch(() => null) : null,
      avatarBuf ? loadImage(avatarBuf).catch(() => null) : null,
    ]);

    const canvas = createCanvas(CARD_W, CARD_H);
    const ctx = canvas.getContext("2d");

    // ── Nền: ảnh người dùng tải lên, hoặc gradient từ màu nhấn ──
    if (bgImg) {
      drawCover(ctx, bgImg, 0, 0, CARD_W, CARD_H);
      // Phủ tối để chữ luôn đọc được, bất kể nền sáng hay rối.
      ctx.fillStyle = "rgba(12,14,18,0.62)";
      ctx.fillRect(0, 0, CARD_W, CARD_H);
    } else {
      const grad = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
      grad.addColorStop(0, shade(accent, 0.55));
      grad.addColorStop(1, shade(accent, 0.88));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CARD_W, CARD_H);
    }

    // Vạch màu nhấn bên trái — nhận diện thương hiệu, không phụ thuộc ảnh nền.
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, 10, CARD_H);

    const textX = 300;
    const maxTextWidth = CARD_W - textX - 48;

    // ── Avatar tròn ──
    drawAvatar(ctx, avatarImg, 160, CARD_H / 2, 96, accent);

    ctx.textBaseline = "alphabetic";
    const eyebrowFont = `600 24px ${FONT_FAMILY}`;
    const nameFont = `bold 54px ${FONT_FAMILY}`;
    const metaFont = `26px ${FONT_FAMILY}`;

    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = eyebrowFont;
    ctx.fillText(fitText(eyebrowFont, stripControl(o.eyebrow), maxTextWidth), textX, 104);

    ctx.fillStyle = "#ffffff";
    ctx.font = nameFont;
    ctx.fillText(fitText(nameFont, stripControl(o.name), maxTextWidth), textX, 172);

    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.font = metaFont;
    ctx.fillText(fitText(metaFont, stripControl(o.meta), maxTextWidth), textX, 220);

    return canvas.toBuffer("image/png");
  } catch (e) {
    console.error("[welcomeCard] vẽ thẻ thất bại:", e?.message || e);
    return null;
  }
}

module.exports = {
  renderCard,
  cardAvailable,
  cardUnavailableReason,
  CARD_FILE_NAME,
  CARD_W,
  CARD_H,
  // Test hook: buộc trạng thái "không vẽ được" mà không cần gỡ module native.
  _setCanvasUnavailableForTest(reason) {
    canvasMod = null;
    canvasErr = new Error(reason || "test");
  },
  _resetForTest() {
    canvasMod = null;
    canvasErr = null;
  },
  _drawableTextForTest: drawableText,
  _fitTextForTest: fitText,
  _toColorForTest: toColor,
};
