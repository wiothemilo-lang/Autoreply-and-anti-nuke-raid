// scripts/security-headers.cjs — NGUỒN DUY NHẤT của header bảo mật cho web.
//
// CommonJS (không phải .mjs) vì `scripts/build.mjs` (ESM) nạp qua createRequire
// và bộ test web (`scripts/test-web-contracts.cjs`) require trực tiếp — một
// nguồn duy nhất cho cả hai, không phải chép CSP ra hai bản.
//
// ── Vì sao có file này ────────────────────────────────────────────────────────
// CSP + các header bảo mật đã có ở `vercel.json` (Vercel) và `Dockerfile.web`
// (nginx/Dokploy), nhưng hosting tĩnh đang phát production là **Freebuff
// hosting** — nơi KHÔNG cấu hình được header HTTP. Không có gì chặn thì bản
// deploy thật chạy với CSP rỗng: XSS chỉ cần một chỗ lọt là có hiệu lực, và
// trước đây đã có bug thảm hoạ đúng lớp này (inline script bị CSP chặn ở
// Vercel nhưng không ai kiểm bản Freebuff).
//
// Hai đường bù cho hosting tĩnh, đều sinh từ file này:
//   1. `<meta http-equiv="Content-Security-Policy">` chèn vào `dist/index.html`
//      lúc BUILD (xem scripts/build.mjs) — meta CSP do trình duyệt THI HÀNH
//      thật; chỉ `frame-ancestors`/`report-uri` bị bỏ qua nên bản meta cắt
//      riêng directive đó (header HTTP vẫn giữ đủ).
//   2. `dist/_headers` (định dạng Netlify/Cloudflare Pages) cho hosting có đọc
//      file: không ảnh hưởng gì trên hosting không dùng.
//
// KHÔNG chèn meta khi dev/preview: `bun run dev` không đi qua build nên
// index.html nguồn giữ nguyên (Vite chèn inline script cho react-refresh —
// `script-src 'self'` sẽ chặn và làm hỏng preview).
//
// Test khớp giữa 3 nơi nằm ở `scripts/test-web-contracts.cjs` (mục CSP contract):
// đổi CSP ở đây mà quên vercel.json/nginx là CI đỏ, và ngược lại.

/** CSP dưới dạng directive → nguồn. Thứ tự/quy tắc phải KHỚP vercel.json + nginx. */
const CSP_DIRECTIVES = [
  ["default-src", ["'self'"]],
  ["script-src", ["'self'"]],
  ["style-src", ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"]],
  ["font-src", ["'self'", "https://fonts.gstatic.com"]],
  ["img-src", ["'self'", "data:", "blob:", "https:"]],
  [
    "connect-src",
    [
      "'self'",
      "https://*.convex.cloud",
      "https://*.convex.site",
      "wss://*.convex.cloud",
      "wss://*.convex.site",
      "https://discord.com",
    ],
  ],
  ["object-src", ["'none'"]],
  ["base-uri", ["'self'"]],
  ["form-action", ["'self'", "https://discord.com"]],
  ["frame-ancestors", ["'none'"]],
  ["worker-src", ["'self'", "blob:"]],
  ["manifest-src", ["'self'"]],
];

/** Ghép directive thành chuỗi CSP. */
function renderCsp(directives = CSP_DIRECTIVES) {
  return directives.map(([name, sources]) => `${name} ${sources.join(" ")}`).join("; ");
}

/** CSP đầy đủ — dùng cho header HTTP (`vercel.json`, nginx, `_headers`). */
const CSP = renderCsp();

/**
 * CSP cho thẻ `<meta>`: bỏ `frame-ancestors` vì meta KHÔNG hỗ trợ directive này
 * (trình duyệt in warning và bỏ qua; giữ lại chỉ gây nhiễu log bảo mật).
 * Chống clickjacking ở đường tĩnh dựa vào `X-Frame-Options` của hosting + CSP
 * của Vercel/nginx khi có.
 */
const CSP_META = renderCsp(CSP_DIRECTIVES.filter(([name]) => name !== "frame-ancestors"));

/** Header bảo mật đầy đủ — cùng thứ tự/giá trị với vercel.json + Dockerfile.web. */
const SECURITY_HEADERS = [
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=()"],
  ["Strict-Transport-Security", "max-age=31536000; includeSubDomains"],
  ["Content-Security-Policy", CSP],
];

/** Dấu nhận biết meta đã chèn — chèn lần hai phải là no-op (idempotent). */
const META_MARK = 'data-protogon-security="1"';

/** Thẻ meta CSP (không phụ thuộc hosting). */
function cspMetaTag() {
  return `<meta ${META_MARK} http-equiv="Content-Security-Policy" content="${CSP_META}" />`;
}

/**
 * Chèn meta CSP ngay sau thẻ `<head>` (trước mọi <script> để có hiệu lực sớm).
 * Hàm THUẦN: nhận html vào, trả html ra — test hermetic được trên index.html
 * THẬT và trên html tổng hợp. Không có `<head>` thì trả nguyên bản (best-effort,
 * không tự bịa cấu trúc HTML cho một file không phải trang).
 */
function injectSecurityMeta(html) {
  if (html.includes(META_MARK)) return html;
  const open = html.search(/<head[^>]*>/i);
  if (open < 0) return html;
  const end = html.indexOf(">", open) + 1;
  return `${html.slice(0, end)}\n    ${cspMetaTag()}${html.slice(end)}`;
}

/** Nội dung `dist/_headers` (Netlify/Cloudflare Pages): áp cho mọi đường dẫn. */
function securityHeadersFile() {
  const lines = SECURITY_HEADERS.map(([name, value]) => `  ${name}: ${value}`);
  return ["/*", ...lines, ""].join("\n");
}

module.exports = {
  CSP_DIRECTIVES,
  CSP,
  CSP_META,
  SECURITY_HEADERS,
  renderCsp,
  cspMetaTag,
  injectSecurityMeta,
  securityHeadersFile,
};
