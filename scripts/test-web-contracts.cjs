#!/usr/bin/env node
/**
 * test-web-contracts.cjs — lá chắn hợp đồng dashboard web (20/09/2026).
 *
 * Chặn tái diễn 3 bug thật tìm thấy khi scan src/:
 *  1. OverviewPanel đọc token thô từ localStorage thay vì getSessionToken()
 *     → remember-mode gửi blob JSON {"t","e"} làm token (backend từ chối),
 *     session-mode gửi "" → khối "Hoạt động chống nuke gần đây" luôn trắng.
 *     Quy tắc: CHỈ src/lib/discord.ts được chạm storage thô của token.
 *  2. Nút "Hỏi Haimiya" ở Landing dispatch event "haimiya-open" nhưng Landing
 *     không mount <HaimiyaChat/> → bấm không có gì xảy ra (nút chết).
 *     Quy tắc: trang nào có chỗ dispatch thì phải mount HaimiyaChat.
 *  3. AnalyticsPanel + AuditLogPanel chết (không ai import) mà vẫn nằm trong
 *     repo, gây hiểu nhầm còn dùng được.
 *     Quy tắc: mọi panel trong components/dashboard/ phải được import ở đâu đó.
 *
 * Hermetic: chỉ đọc source bằng regex/fs, không cần bundler hay browser.
 * Chạy: node scripts/test-web-contracts.cjs
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src");

let pass = 0;
let fail = 0;
function check(label, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    fail++;
    console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Đọc mọi file .tsx/.ts trong src/, trả về Map<đường dẫn tương đối, nội dung>. */
function readSrc() {
  const out = new Map();
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name)) {
        out.set(path.relative(SRC, full).replace(/\\/g, "/"), fs.readFileSync(full, "utf8"));
      }
    }
  })(SRC);
  return out;
}

const files = readSrc();

// ─── 1. Kỷ luật token phiên ────────────────────────────────────────────────
// Token lưu 2 dạng (discord.ts:setSessionToken): sessionStorage = token thô
// (không "Lưu đăng nhập"), localStorage = JSON {"t","e"} (có lưu, hết hạn 7
// ngày). Chỉ getSessionToken() biết bóc 2 dạng này — đọc thô ở nơi khác là bug.
const RAW_TOKEN_RE = /getItem\(\s*(SESSION_TOKEN_KEY|"wio_session_token")\s*\)/;
const rawReaders = [...files.entries()]
  .filter(([rel, src]) => rel !== "lib/discord.ts" && RAW_TOKEN_RE.test(src))
  .map(([rel]) => rel);
check(
  "chỉ src/lib/discord.ts được đọc storage thô của token phiên",
  rawReaders.length === 0,
  rawReaders.length ? `vi phạm: ${rawReaders.join(", ")}` : "",
);

const overview = files.get("components/dashboard/OverviewPanel.tsx") ?? "";
check(
  "OverviewPanel lấy token qua getSessionToken()",
  /getSessionToken\(\)/.test(overview) && !RAW_TOKEN_RE.test(overview),
  "phải import { getSessionToken } từ ../../lib/discord, không localStorage.getItem thô",
);

// ─── 2. Nút Haimiya không được chết ─────────────────────────────────────────
// Mọi chỗ dispatch "haimiya-open" đều nằm trên cây render của Landing
// (Landing.tsx + sections.tsx chỉ Landing dùng) → Landing phải mount chat.
const dispatchers = [...files.entries()]
  .filter(([, src]) => src.includes('"haimiya-open"'))
  .map(([rel]) => rel);
const sectionUsers = [...files.entries()]
  .filter(([, src]) => /from\s+["']\.\.\/components\/landing\/sections["']/.test(src))
  .map(([rel]) => rel);
check(
  "sections.tsx (chứa nút Haimiya) chỉ dùng ở Landing",
  sectionUsers.length === 1 && sectionUsers[0] === "pages/Landing.tsx",
  `đang dùng ở: ${sectionUsers.join(", ") || "(không đâu)"}`,
);
const landing = files.get("pages/Landing.tsx") ?? "";
check(
  "Landing mount <HaimiyaChat/> để hứng event haimiya-open",
  /<HaimiyaChat[\s/>]/.test(landing),
  `dispatch ở: ${dispatchers.join(", ")}`,
);

// ─── 3. Không panel chết ────────────────────────────────────────────────────
// Mọi file trong components/dashboard/ phải được import bởi ≥1 file khác
// trong src/ (trực tiếp từ page hay gián tiếp qua panel khác như HiddenPanel).
const panels = [...files.keys()].filter((rel) => rel.startsWith("components/dashboard/"));
const dead = panels.filter((panel) => {
  const base = path.basename(panel, ".tsx");
  // Chấp nhận cả import tĩnh (from "...") lẫn lazy (import("...")).
  const re = new RegExp(`(?:from\\s+|import\\()\\s*["'][^"']*${base}\\.?["']`);
  return ![...files.entries()].some(([rel, src]) => rel !== panel && re.test(src));
});
check(
  "mọi dashboard panel đều được import ở đâu đó (không panel chết)",
  dead.length === 0,
  dead.length ? `chết: ${dead.join(", ")}` : "",
);

// ─── 4. Khu vực riêng của chủ bot KHÔNG được rò rỉ ra trang công khai ──────
// Bug thật (22/09): trang chủ có khối "Khu vực riêng tư · chỉ chủ sở hữu bot" +
// "Một số khả năng đặc biệt…" quảng cáo sự tồn tại/phạm vi của tính năng ẩn,
// còn Haimiya thì để sẵn gợi ý "Cách đặt mật khẩu tính năng ẩn" và trả lời
// liệt kê tính năng ẩn (reaction role, giveaway, DM, branding) cho MỌI người.
const sections = files.get("components/landing/sections.tsx") ?? "";
check(
  "trang chủ không còn khối quảng cáo khu vực riêng của chủ bot",
  !/HiddenFeatures/.test(sections) && !/Khu vực riêng tư/.test(sections),
  "sections.tsx vẫn còn khối Khu vực riêng tư/HiddenFeatures",
);
check("Landing không import/render khối khu vực riêng nữa", !/HiddenFeatures/.test(landing));

const haimiya = fs.readFileSync(path.join(SRC, "lib/haimiya.ts"), "utf8");
const ownerAnswer = haimiya.match(/const OWNER_ONLY_ANSWER =\s*\n?\s*"([\s\S]*?)";/);
check("Haimiya có MỘT câu trả lời dùng chung cho khu vực riêng của chủ bot", !!ownerAnswer);
check(
  "câu trả lời đó không liệt kê tính năng ẩn (reaction role/giveaway/DM/giao diện)",
  !!ownerAnswer && !/(reaction|giveaway|\bDM\b|giao diện|tùy chỉnh|branding)/i.test(ownerAnswer[1]),
  ownerAnswer ? ownerAnswer[1].slice(0, 120) : "",
);
check(
  "5 topic thuộc khu vực riêng đều trả về OWNER_ONLY_ANSWER",
  (haimiya.match(/answer: OWNER_ONLY_ANSWER,/g) ?? []).length === 5,
  `đang có ${(haimiya.match(/answer: OWNER_ONLY_ANSWER,/g) ?? []).length}/5`,
);
check(
  "gợi ý/kho kiến thức không còn hướng dẫn mật khẩu tính năng ẩn",
  !haimiya.includes("Cách đặt mật khẩu tính năng ẩn"),
);

// ─── 5. Cấu hình kênh log chỉ có MỘT nơi ────────────────────────────────────
// Bug thiết kế (22/09): 3 chỗ chọn kênh log (kênh log chung, kênh log mod,
// kênh hình phạt) ghi đè nhau → cùng một case có thể bị đẩy vào hai kênh.
// Quy tắc: Settings là nơi chọn kênh duy nhất; Moderation chỉ ĐỌC lại.
const settings = files.get("components/dashboard/SettingsPanel.tsx") ?? "";
const moderation = files.get("components/dashboard/ModerationPanel.tsx") ?? "";
check(
  "Moderation không tự chọn kênh log nữa (chỉ đọc lại từ Cài đặt)",
  /Cài đặt → Kênh log/.test(moderation) &&
    !/punishNoticeChannelId:\s*channelId\s*===/.test(moderation),
);
check(
  "Moderation dọn kênh hình phạt riêng kiểu cũ khi lưu (một nguồn duy nhất)",
  /punishNoticeChannelId: ""/.test(moderation),
);
check(
  "Settings có đủ 2 lựa chọn kênh log (chung + hành động mod, tùy chọn)",
  /"Kênh log chung"/.test(settings) && /"Kênh log hành động mod \(tùy chọn\)"/.test(settings),
);
check("cấu hình kênh log nói rõ không nhân đôi log", /không nhân đôi log/.test(settings));
check(
  "không còn nhãn UI nhắc thương hiệu bot khác trong panel mod",
  !/kiểu Carl-bot/.test(files.get("components/dashboard/ModerationPanel.tsx") ?? "") &&
    !/kiểu Carl-bot/.test(files.get("components/dashboard/ModActionsPanel.tsx") ?? ""),
);

// ─── 6. Trang pháp lý (Terms / Privacy / Data deletion) ────────────────────
// Discord chỉ xác minh bot khi có URL RIÊNG, công khai, không cần đăng nhập cho
// Terms of Service và Privacy Policy. Ba luật dưới đây giữ chúng luôn tồn tại,
// luôn công khai và luôn tới được từ footer.
const appSrc = fs.readFileSync(path.join(SRC, "App.tsx"), "utf8");
const LEGAL_SLUGS = ["terms", "privacy", "data-deletion"];
check(
  "App.tsx lazy-import LegalPage (trang pháp lý dùng chung 1 component)",
  /const LegalPage = lazy\(\(\) => import\("\.\/pages\/LegalPage"\)\)/.test(appSrc),
);
for (const slug of LEGAL_SLUGS) {
  check(
    `Route /${slug} tồn tại và KHÔNG bọc RequireAuth (khách vẫn đọc được)`,
    new RegExp(`path="/${slug}"[^>]*<LegalPage slug="${slug}" />`).test(appSrc),
  );
}
check(
  '3 route pháp lý đứng trước catch-all path="*" (không bị 404 nuốt)',
  appSrc.indexOf('path="*"') > appSrc.indexOf('path="/data-deletion"'),
);

const footerSrc = fs.readFileSync(path.join(SRC, "components/landing/Footer.tsx"), "utf8");
for (const slug of LEGAL_SLUGS) {
  check(`Footer có liên kết tới /${slug}`, new RegExp(`to="/${slug}"`).test(footerSrc));
}

// Nội dung 3 văn bản × 3 ngôn ngữ: cấu trúc phải đủ (cổng 3f của
// check-i18n.cjs kiểm sâu theo từng đường dẫn; ở đây khoá mức thô để tránh
// trường hợp ai đó xoá nguyên một ngôn ngữ khỏi module).
const legalContent = fs.readFileSync(path.join(SRC, "lib/legalContent.ts"), "utf8");
check(
  "legalContent.ts có marker @i18n-content (điều kiện để cổng 3f kiểm cấu trúc)",
  legalContent.includes("@i18n-content"),
);
for (const lang of ["vi", "en", "de"]) {
  const blocks = legalContent.match(new RegExp(`const ${lang.toUpperCase()}: LegalDoc\\[\\]`, "g"));
  check(`legalContent.ts có bộ văn bản ${lang.toUpperCase()}`, !!blocks && blocks.length === 1);
}
for (const slug of LEGAL_SLUGS) {
  const hits = legalContent.split(`slug: "${slug}"`).length - 1;
  check(`văn bản "${slug}" có đủ 3 bản ngôn ngữ`, hits === 3, `đang có ${hits}/3`);
}

// Sitemap: URL pháp lý phải công khai cho công cụ tìm kiếm + trình xác minh.
const sitemap = fs.readFileSync(path.join(ROOT, "public/sitemap.xml"), "utf8");
for (const slug of LEGAL_SLUGS) {
  check(`sitemap.xml có ${slug}`, sitemap.includes(`/${slug}<`));
}

// ─── 7. Không quảng cáo thương hiệu bot khác trong chuỗi người dùng thấy ───
// Bug copy (22/09): 4 chuỗi UI gọi tên một bot đối thủ ("kiểu Carl-bot") — vừa
// hạ uy tín sản phẩm vừa nhập nhằng nguồn gốc. Đổi sang mô tả bằng chính tính
// năng. Luật: chuỗi hiển thị (translate("…") trong src/) không nhắc thương hiệu
// bot khác; từ điển là dữ liệu nên chỉ kiểm phần CODE.
const BOT_BRANDS = /Carl-?bot|MEE6|Dyno|ProBot/i;
const brandHits = [...files.entries()]
  .filter(([rel]) => rel !== "lib/i18n.en.ts" && rel !== "lib/i18n.de.ts")
  .flatMap(([rel, src]) =>
    [...src.matchAll(/translate\(\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g)]
      .filter((m) => BOT_BRANDS.test(m[1]))
      .map((m) => `${rel} — ${m[1].slice(0, 50)}`),
  );
check(
  "không còn chuỗi UI gọi tên bot khác (Carl-bot/MEE6/Dyno/ProBot)",
  brandHits.length === 0,
  brandHits.join(" | "),
);

// ─── 8. Tương phản: không dùng chữ trắng trên nền sáng ─────────────────────
// Bug thật (22/09): khối "Khóa kênh khi raid" ở trang chủ dùng text-white /
// bg-white/5 trong theme SÁNG → chữ trắng trên nền trắng, đọc không ra gì.
// Luật: trong sections.tsx, chữ phải dùng token theme (text-foreground /
// text-muted-foreground), không hardcode text-white.
check(
  "sections.tsx không hardcode text-white (chữ trắng trên nền sáng = vô hình)",
  !/(?<![:\w-])text-white(?![\w/])/.test(sections),
  "dùng text-foreground / text-muted-foreground theo token theme",
);

// ─── 9. Hợp đồng UI/production mới: không để regression âm thầm quay lại ─────
const requireAuth = files.get("components/RequireAuth.tsx") ?? "";
check(
  "RequireAuth chuyển hướng ngay khi chưa có token (không kẹt loading vô hạn)",
  /if \(!token\)[\s\S]*<Navigate/.test(requireAuth),
);
check(
  "App lazy-load Landing như các route nặng khác",
  /const Landing = lazy\(\(\) => import\("\.\/pages\/Landing"\)\)/.test(appSrc),
);
const seo = files.get("lib/seo.ts") ?? "";
check(
  "App có đồng bộ metadata/canonical/noindex theo route",
  /sync(Route|Document)Metadata/.test(appSrc) && /noindex/.test(seo),
);
check(
  "SEO dùng origin domain đang phục vụ sau hydration",
  /activeSiteUrl/.test(seo) && /window\.location\.origin/.test(seo),
);
const moduleCard = files.get("components/dashboard/ModuleCard.tsx") ?? "";
check("ModuleCard không dùng div role=button thiếu keyboard", !/role="button"/.test(moduleCard));
const multiSelect = files.get("components/ui/multi-select.tsx") ?? "";
check(
  "MultiSelect không nest button trong button",
  !/<button[\s\S]{0,450}<button/.test(multiSelect),
);
const haimiyaChat = files.get("components/HaimiyaChat.tsx") ?? "";
check(
  "Haimiya có semantics dialog + focus/Escape contract",
  /role="dialog"/.test(haimiyaChat) && /aria-modal/.test(haimiyaChat) && /Escape/.test(haimiyaChat),
);
check(
  "Haimiya message ID không reset mỗi render",
  /msgSeqRef = useRef\(0\)/.test(haimiyaChat) && /msgSeqRef\.current\+\+/.test(haimiyaChat),
);
const rootBoundary = files.get("components/RootErrorBoundary.tsx") ?? "";
const panelBoundary = files.get("components/PanelErrorBoundary.tsx") ?? "";
check(
  "error boundary không render raw backend exception cho người dùng",
  !/msg\.slice\(/.test(rootBoundary) && !/msg\.slice\(/.test(panelBoundary),
);
const welcomePanel = files.get("components/dashboard/WelcomePanel.tsx") ?? "";
check(
  "Welcome image URL mapping đủ card background slots",
  /welcomeCardBackground[\s\S]{0,700}goodbyeCardBackground/.test(welcomePanel),
);
const verifyPanel = files.get("components/dashboard/VerifyPanel.tsx") ?? "";
check(
  "Verify dùng timer độc lập cho từng field",
  /timers?Ref|fieldTimers|Record<string,.*setTimeout/.test(verifyPanel),
);
const settingsPanel = files.get("components/dashboard/SettingsPanel.tsx") ?? "";
check(
  "DiscordCallback không phụ thuộc public-config để xử lý code",
  !/usePublicConfig|configLoading|configError/.test(files.get("pages/DiscordCallback.tsx") ?? ""),
);
check(
  "MultiSelect có combobox/listbox semantics và input ngoài listbox",
  /aria-haspopup="listbox"/.test(multiSelect) &&
    /role="listbox"/.test(multiSelect) &&
    /aria-multiselectable="true"/.test(multiSelect) &&
    /role="listbox"[\s\S]{0,500}<input/.test(multiSelect) === false,
);
check(
  "Settings remount theo guild trước khi đổi state cục bộ",
  /PanelErrorBoundary key=\{`\$\{section\}:\$\{data\.guild\.discordId\}`\}/.test(
    files.get("pages/GuildPage.tsx") ?? "",
  ) && /useEffect[\s\S]{0,900}setWebhookEventTypes/.test(settingsPanel),
);
check(
  "Webhook eventTypes=[] được giữ nguyên khi hydrate",
  /current\.eventTypes\s*\?\?\s*DEFAULT_WEBHOOK_EVENT_TYPES/.test(settingsPanel) &&
    !/current\.eventTypes\?\.length\s*\?/.test(settingsPanel),
);
check(
  "AuthPage đọc lựa chọn nhớ đăng nhập đã lưu",
  /REMEMBER_LOGIN_KEY/.test(files.get("pages/AuthPage.tsx") ?? ""),
);
const historyPage = files.get("pages/GuildHistory.tsx") ?? "";
check("date filter dùng local day boundary, không UTC cứng", !/Date\.UTC\(/.test(historyPage));
const convexUrl = files.get("lib/convexUrl.ts") ?? "";
check(
  "Convex URL fail-closed khi env sai, không fallback im lặng",
  /throw new Error\("CONVEX_URL không hợp lệ/.test(convexUrl) &&
    /!configured\) throw new Error/.test(convexUrl),
);
check(
  "Convex validator nhận regional .convex.cloud cho API client",
  convexUrl.includes("convex") && convexUrl.includes(".cloud") && convexUrl.includes("[a-z0-9-]+"),
);
// Convex phục vụ HTTP actions (httpRouter) ở .convex.site — helper đổi suffix
// đúng chỗ, không đụng URL API .convex.cloud của ConvexReactClient.
// convex dev tách cổng (API 3210 / site 3211) nên chỉ đổi hậu tố là chưa đủ:
// fetch vẫn 404 rồi catch → null, geo chết âm thầm (28/09/2026). Phải ưu tiên
// origin khai báo sẵn trong môi trường, và origin đó chỉ được nhận đúng
// https *.convex.site hoặc localhost — không mở vô điều kiện.
check(
  "convexSiteUrl ưu tiên VITE_CONVEX_SITE_URL (convex dev tách cổng 3210/3211)",
  /VITE_CONVEX_SITE_URL/.test(convexUrl) &&
    /CONVEX_SITE_HOST_RE/.test(convexUrl) &&
    /if \(explicit\) return explicit;/.test(convexUrl),
);
check(
  "origin HTTP actions chỉ nhận https *.convex.site hoặc localhost",
  convexUrl.includes("https:") &&
    convexUrl.includes("convex.site") &&
    convexUrl.includes("LOCAL_CONVEX_HOST_RE"),
);
check(
  "convexSiteUrl đổi suffix .convex.cloud → .convex.site cho HTTP actions",
  /replace\(\/\\.convex\\.cloud\$\/i, ".convex.site"\)/.test(convexUrl),
);
const buildShim = fs.readFileSync(path.join(ROOT, "scripts", "build.mjs"), "utf8");
const dockerfile = fs.readFileSync(path.join(ROOT, "Dockerfile.web"), "utf8");
check(
  "build shim: env hợp lệ thắng, không có env thì dùng đáy an toàn TƯỜNG MINH (không âm thầm, không chết máy)",
  /for \(const name of CONVEX_URL_VARS\)/.test(buildShim) &&
    /PROTOGON_DEFAULT_CONVEX_URL\s*=\s*"https:\/\/[a-z0-9-]+\.convex\.cloud"/.test(buildShim) &&
    /trimmedConvexUrl\s*=\s*PROTOGON_DEFAULT_CONVEX_URL/.test(buildShim) &&
    !/VITE_CONVEX_URL\s*=\s*trimmedConvexUrl\s*\|\|/.test(buildShim),
);
check(
  "build shim chọn biến URL Convex HỢP LỆ đầu tiên (blob rác không che biến đúng — bug 26/09)",
  /for \(const name of CONVEX_URL_VARS\)/.test(buildShim) &&
    /CONVEX_URL_VARS\s*=\s*\["CONVEX_URL", "VITE_CONVEX_URL"/.test(buildShim),
);
// Hai nhãn location phải TÁCH CRÔI: private (có X-Robots-Tag noindex) và
// public (SPA fallback, KHÔNG noindex). Bug thật 28/09/2026: cả hai dùng chung
// MỘT location → nginx phát noindex lên đúng /terms /privacy /data-deletion
// /monitor /status — năm trang đang nằm trong sitemap và cần index. Lỗi im
// lặng: không crash, không log, chỉ mất khả năng xếp hạng tìm kiếm.
// Cách kiểm: cắt nội dung từng block rồi bắt điều kiện trên ĐÚNG block đó, không
// đoán bằng substring trên cả file (thứ tự liệt kê khác đi là test cũ vượt ải).
function nginxBlock(source, marker) {
  const at = source.indexOf(marker);
  if (at === -1) return "";
  const next = source.indexOf("location", at + marker.length);
  return next === -1 ? source.slice(at) : source.slice(at, next);
}
const dockerPrivateBlock = nginxBlock(dockerfile, "auth|discord/callback|admin|stats|dashboard");
const dockerPublicBlock = nginxBlock(dockerfile, "features|monitor|terms|privacy|data-deletion");
check(
  "Docker: route private có noindex + SPA fallback",
  dockerPrivateBlock.length > 0 &&
    /X-Robots-Tag \\?"noindex, nofollow\\?"/.test(dockerPrivateBlock) &&
    /try_files \/index\.html =404/.test(dockerPrivateBlock),
  "block private phải có X-Robots-Tag + try_files /index.html",
);
check(
  "Docker: route công khai (gồm /features) có SPA fallback VÀ KHÔNG bị noindex",
  dockerPublicBlock.length > 0 &&
    /try_files \/index\.html =404/.test(dockerPublicBlock) &&
    !/X-Robots-Tag/.test(dockerPublicBlock) &&
    /features\\|monitor\\|terms\\|privacy\\|data-deletion/.test(dockerPublicBlock),
  "block public thiếu /features hoặc đang bị gắn noindex",
);
// Alias /status: redirect 301 bằng location DÚNG (=) — thắng mọi regex location,
// không còn là route SPA tự phục vụ (đã bỏ khỏi block public ở trên).
check(
  "Docker: /status redirect 301 về /monitor (alias không tự phục vụ trang)",
  /location = \/status \{[\s\S]{0,240}?return 301 \/monitor;/.test(dockerfile) &&
    dockerfile.includes("location = /status {") &&
    !/features\|monitor\|status\|/.test(dockerfile),
);
const notFoundPage = fs.readFileSync(path.join(ROOT, "public", "404.html"), "utf8");
const notFoundScript = fs.readFileSync(path.join(ROOT, "public", "404.js"), "utf8");
check(
  "404 static hỗ trợ VI/EN/DE qua script external",
  /404\.js/.test(notFoundPage) &&
    /navigator\.language/.test(notFoundScript) &&
    /protogon-lang/.test(notFoundScript),
);
check(
  "session token mới xóa storage cũ để không bị token cũ ghi đè",
  /sessionStorage\.removeItem\(SESSION_TOKEN_KEY\)/.test(files.get("lib/discord.ts") ?? "") &&
    /localStorage\.removeItem\(SESSION_TOKEN_KEY\)/.test(files.get("lib/discord.ts") ?? ""),
);
const utils = files.get("lib/utils.ts") ?? "";
const overviewPanel = files.get("components/dashboard/OverviewPanel.tsx") ?? "";
check(
  "online status dùng chung helper tươi — tách ngưỡng toàn cục vs theo-guild",
  /export function isHeartbeatFresh/.test(utils) &&
    /export function isGuildHeartbeatFresh/.test(utils) &&
    /isGuildHeartbeatFresh/.test(overviewPanel),
);

// ─── N-bis. Nhịp tim bot ⇄ ngưỡng hiển thị trạng thái ───────────────────────
// Bản vá bug thật: web báo "bot mất kết nối" trong khi bot đang chạy.
//
// Ngưỡng "còn tươi" nằm ở 4 file khác ngôn ngữ/tiến trình (bot CommonJS, hằng
// số dùng chung của Convex, web TS) — lệch một nơi là có màn hình hiển thị sai.
// Test này đọc SỐ THẬT trong từng file rồi so khớp với nhịp thật của bot, thay
// vì tin vào comment: comment nói "180s" mà code ghi 60s là đúng lỗi đã xảy ra
// (useBotMonitor khai SYNC_INTERVAL_MS = 60_000 và test cũ khoá luôn con số
// sai đó).
//
// Vì sao không `eval`: ESLint cấm no-new-func, và test chỉ cần số học +, *,
// ngoặc — evaluator 20 dòng dưới đây đủ và chạy được cả khi chuỗi không hợp lệ
// (trả NaN ⇒ check đỏ, không ném).
function evalArith(raw, scope) {
  const tokens = String(raw).match(/\d[\d_]*|[A-Za-z_][A-Za-z0-9_]*|[+*()]/g) || [];
  let i = 0;
  const eat = (t) => (tokens[i] === t ? (i++, true) : false);
  function primary() {
    const t = tokens[i];
    if (t === undefined) return NaN;
    if (/^\d/.test(t)) {
      i++;
      return Number(t.replace(/_/g, ""));
    }
    if (t === "(") {
      i++;
      const v = expr();
      eat(")");
      return v;
    }
    i++;
    return typeof scope[t] === "number" ? scope[t] : NaN;
  }
  function term() {
    let v = primary();
    while (eat("*")) v *= primary();
    return v;
  }
  function expr() {
    let v = term();
    while (eat("+")) v += term();
    return v;
  }
  const value = expr();
  return Number.isFinite(value) ? value : NaN;
}

/** Các hằng số `export const TÊN = <số học>;` trong một file nguồn. */
function readConsts(src) {
  const scope = {};
  for (const m of src.matchAll(/export const ([A-Z][A-Z0-9_]*)\s*=\s*([^;]+);/g)) {
    scope[m[1]] = evalArith(m[2], scope);
  }
  return scope;
}

// Tiền tố hb* để không đụng tên đã dùng ở mục R bên dưới (botIndexSrc…).
const hbBotIndexSrc = fs.readFileSync(path.join(ROOT, "bot", "src", "index.js"), "utf8");
const hbGuildSyncSrc = fs.readFileSync(
  path.join(ROOT, "bot", "src", "handlers", "guildSync.js"),
  "utf8",
);
const convexHeartbeatSrc = fs.readFileSync(path.join(ROOT, "convex", "heartbeat.ts"), "utf8");
const statusSrc = fs.readFileSync(path.join(ROOT, "convex", "status.ts"), "utf8");
const backupSrc = fs.readFileSync(path.join(ROOT, "convex", "backup.ts"), "utf8");
const monitorSrc = files.get("lib/useBotMonitor.ts") ?? "";
const webConsts = readConsts(utils);
const convexConsts = readConsts(convexHeartbeatSrc);

const botCadenceMs = (() => {
  const m = hbBotIndexSrc.match(/setTimeout\(runSyncLoop,\s*([\d_]+)\)/);
  return m ? Number(m[1].replace(/_/g, "")) : NaN;
})();
const guildRefreshEvery = (() => {
  const m = hbGuildSyncSrc.match(/const refreshHeartbeat = runCounter % (\d+) === 0/);
  return m ? Number(m[1]) : NaN;
})();

check(
  "đọc được nhịp sync thật của bot (bot/src/index.js)",
  Number.isFinite(botCadenceMs) && botCadenceMs > 0,
  `nhận ${botCadenceMs}`,
);
check(
  "đọc được chu kỳ refresh heartbeat của guild (guildSync.js)",
  Number.isFinite(guildRefreshEvery) && guildRefreshEvery > 1,
  `nhận ${guildRefreshEvery}`,
);
check(
  "nhịp sync web = nhịp sync thật của bot",
  webConsts.BOT_SYNC_INTERVAL_MS === botCadenceMs,
  `web ${webConsts.BOT_SYNC_INTERVAL_MS} vs bot ${botCadenceMs}`,
);
check(
  "nhịp sync khai ở hai phía (Convex ⇄ web) phải bằng nhau",
  convexConsts.BOT_SYNC_INTERVAL_MS === webConsts.BOT_SYNC_INTERVAL_MS,
  `convex ${convexConsts.BOT_SYNC_INTERVAL_MS} vs web ${webConsts.BOT_SYNC_INTERVAL_MS}`,
);
check(
  "ngưỡng online hai phía bằng nhau (Convex ⇄ web — không màn hình nào trả lời khác)",
  convexConsts.BOT_ONLINE_WINDOW_MS === webConsts.BOT_ONLINE_WINDOW_MS,
  `convex ${convexConsts.BOT_ONLINE_WINDOW_MS} vs web ${webConsts.BOT_ONLINE_WINDOW_MS}`,
);
check(
  "ngưỡng online RỘNG HƠN một nhịp sync (bằng 1 nhịp = nhấp nháy offline mỗi chu kỳ)",
  convexConsts.BOT_ONLINE_WINDOW_MS > botCadenceMs,
  `ngưỡng ${convexConsts.BOT_ONLINE_WINDOW_MS} vs nhịp ${botCadenceMs}`,
);
check(
  "ngưỡng tươi của guild = chu kỳ refresh + biên (dùng ngưỡng toàn cục cho guild là báo offline oan ~12/15 phút)",
  webConsts.GUILD_HEARTBEAT_REFRESH_MS === guildRefreshEvery * botCadenceMs &&
    webConsts.GUILD_HEARTBEAT_FRESH_MS > webConsts.GUILD_HEARTBEAT_REFRESH_MS,
  `refresh ${webConsts.GUILD_HEARTBEAT_REFRESH_MS} (bot: ${guildRefreshEvery} × ${botCadenceMs}) · fresh ${webConsts.GUILD_HEARTBEAT_FRESH_MS}`,
);
check(
  "useBotMonitor lấy nhịp sync từ hằng số dùng chung (không tự khai số khác)",
  /export const SYNC_INTERVAL_MS = BOT_SYNC_INTERVAL_MS/.test(monitorSrc),
);
check(
  "convex/status.ts dùng hằng số nhịp dùng chung, không tự khai lại ngưỡng",
  /import \{ BOT_ONLINE_WINDOW_MS \} from "\.\/heartbeat"/.test(statusSrc) &&
    !/const BOT_ONLINE_WINDOW_MS/.test(statusSrc),
);
check(
  "convex/backup.ts không tự khai 180s cho trạng thái bot",
  /BOT_ONLINE_WINDOW_MS/.test(backupSrc) && !/< 180_000/.test(backupSrc),
);
const useBotStatusSrc = files.get("lib/useBotStatus.ts") ?? "";
check(
  "useBotStatus có đồng hồ cập nhật + đồng bộ lại ngay khi tab hiện (heartbeat có thể vừa hết hạn lúc tab ẩn)",
  /setInterval[\s\S]{0,220}broadcastNow/.test(useBotStatusSrc) &&
    /visibilitychange[\s\S]{0,220}broadcastNow/.test(useBotStatusSrc),
);
check(
  "useBotStatus dùng CHUNG một ticker cho mọi consumer (nhiều nơi cùng đọc trạng thái bot — không mỗi đứa một interval, tab ẩn thì im)",
  /nowListeners/.test(useBotStatusSrc) && /document\.hidden/.test(useBotStatusSrc),
);

// ─── N-ter. Chính sách báo cáo khẩn (raid/nuke) ⇄ bot ⇄ dashboard ───────────
// Bug thật: bot SPAM báo cáo khẩn. Cửa sổ cũ cứng 5 phút/guild, nên một vụ
// raid kéo dài (hoặc một false positive lặp lại) làm bot đăng lại "CẢNH BÁO
// KHẨN" + @everyone mỗi 5 phút suốt nhiều giờ.
//
// Nay có 2 knob cấu hình được (khoảng cách tối thiểu + số sự kiện tối thiểu),
// và số canonical nằm ở `convex/reports.ts`. Bot chạy CommonJS nên KHÔNG import
// được TS → phải đọc SỐ THẬT từ cả hai file rồi so; lệch là ví dụ đúng kiểu
// "dashboard hứa 15 phút, bot vẫn 5 phút" mà không gì báo sai.
const rpReportsSrc = fs.readFileSync(path.join(ROOT, "convex", "reports.ts"), "utf8");
const rpIncidentSrc = fs.readFileSync(
  path.join(ROOT, "bot", "src", "handlers", "incidentReport.js"),
  "utf8",
);
const rpUpdateSrc = fs.readFileSync(
  path.join(ROOT, "convex", "guilds", "updateSettings.ts"),
  "utf8",
);
const rpGuildsSrc = fs.readFileSync(path.join(ROOT, "convex", "guilds.ts"), "utf8");
const rpTypesSrc = fs.readFileSync(path.join(ROOT, "src", "lib", "types.ts"), "utf8");
const rpConvexConsts = readConsts(rpReportsSrc);
/** Hằng số `const TÊN = <số học>` trong file bot (CommonJS, không export). */
const rpBotConsts = (() => {
  const scope = {};
  for (const m of rpIncidentSrc.matchAll(/const ([A-Z][A-Z0-9_]*)\s*=\s*([^;\n]+);/g)) {
    const v = evalArith(m[2], scope);
    if (Number.isFinite(v)) scope[m[1]] = v;
  }
  return scope;
})();

check(
  "đọc được hằng số chính sách báo cáo ở CẢ hai phía (convex/reports.ts ⇄ incidentReport.js)",
  Number.isFinite(rpConvexConsts.REPORT_MIN_INTERVAL_MINUTES) &&
    Number.isFinite(rpBotConsts.DEFAULT_REPORT_MIN_INTERVAL_MIN),
  `convex ${rpConvexConsts.REPORT_MIN_INTERVAL_MINUTES} · bot ${rpBotConsts.DEFAULT_REPORT_MIN_INTERVAL_MIN}`,
);
check(
  "khoảng cách tối thiểu mặc định: Convex = bot",
  rpConvexConsts.REPORT_MIN_INTERVAL_MINUTES === rpBotConsts.DEFAULT_REPORT_MIN_INTERVAL_MIN,
  `convex ${rpConvexConsts.REPORT_MIN_INTERVAL_MINUTES} vs bot ${rpBotConsts.DEFAULT_REPORT_MIN_INTERVAL_MIN}`,
);
check(
  "biên khoảng cách tối thiểu: Convex = bot",
  rpConvexConsts.REPORT_MIN_INTERVAL_MINUTES_MIN === rpBotConsts.REPORT_MIN_INTERVAL_MIN &&
    rpConvexConsts.REPORT_MIN_INTERVAL_MINUTES_MAX === rpBotConsts.REPORT_MIN_INTERVAL_MAX,
  `convex ${rpConvexConsts.REPORT_MIN_INTERVAL_MINUTES_MIN}..${rpConvexConsts.REPORT_MIN_INTERVAL_MINUTES_MAX} vs bot ${rpBotConsts.REPORT_MIN_INTERVAL_MIN}..${rpBotConsts.REPORT_MIN_INTERVAL_MAX}`,
);
check(
  "số sự kiện nuke tối thiểu: mặc định + biên đều khớp giữa Convex và bot",
  rpConvexConsts.REPORT_MIN_EVENTS === rpBotConsts.DEFAULT_REPORT_MIN_EVENTS &&
    rpConvexConsts.REPORT_MIN_EVENTS_MIN === rpBotConsts.REPORT_MIN_EVENTS_MIN &&
    rpConvexConsts.REPORT_MIN_EVENTS_MAX === rpBotConsts.REPORT_MIN_EVENTS_MAX,
  `convex ${rpConvexConsts.REPORT_MIN_EVENTS} (${rpConvexConsts.REPORT_MIN_EVENTS_MIN}..${rpConvexConsts.REPORT_MIN_EVENTS_MAX}) vs bot ${rpBotConsts.DEFAULT_REPORT_MIN_EVENTS}`,
);
// Biên phải CHẶN ĐƯỢC spam thật: mặc định mới rộng hơn hẳn cửa sổ cứng 5 phút
// cũ, nếu không thì "vá" chỉ là đổi tên biến.
check(
  "mặc định mới rộng hơn cửa sổ 5 phút cũ (bug spam 5 phút/lần)",
  rpConvexConsts.REPORT_MIN_INTERVAL_MINUTES >= 10,
  `mặc định ${rpConvexConsts.REPORT_MIN_INTERVAL_MINUTES} phút`,
);
check(
  "bot dùng clamp của mình cho cấu hình đọc từ guild (không tin số thô)",
  /clampReportMinIntervalMin\(config\.reportMinIntervalMin\)/.test(rpIncidentSrc) &&
    /clampReportMinEvents\(config\.reportMinEvents\)/.test(rpIncidentSrc),
);
check(
  "bot DỒN sự kiện thay vì bỏ mất: đếm lại sau khi gửi + hết cửa sổ 60 phút mới reset",
  /state\.count \+= 1/.test(rpIncidentSrc) &&
    /if \(state\.count < minEvents\) return;/.test(rpIncidentSrc) &&
    /REPORT_EVENT_WINDOW_MS/.test(rpIncidentSrc),
);
check(
  "Convex kẹp khi LƯU (updateSettings) và trả mặc định khi ĐỌC (getBotConfig/getGuild)",
  /clampReportMinIntervalMinutes\(args\.reportMinIntervalMin\)/.test(rpUpdateSrc) &&
    /clampReportMinEvents\(args\.reportMinEvents\)/.test(rpUpdateSrc) &&
    (rpGuildsSrc.match(/clampReportMinIntervalMinutes\(guild\.reportMinIntervalMin\)/g) || [])
      .length === 2,
  "getGuild + getBotConfig đều phải trả 2 field mới",
);
check(
  "dashboard nhập số trong ĐÚNG biên Convex (1..360 phút · 1..50 sự kiện)",
  new RegExp(`min=\\{${rpConvexConsts.REPORT_MIN_INTERVAL_MINUTES_MIN}\\}`).test(settings) &&
    new RegExp(`max=\\{${rpConvexConsts.REPORT_MIN_INTERVAL_MINUTES_MAX}\\}`).test(settings) &&
    new RegExp(`max=\\{${rpConvexConsts.REPORT_MIN_EVENTS_MAX}\\}`).test(settings),
);
check(
  "web khai đủ 2 field mới trong GuildData.guild (thiếu → panel hiển thị undefined)",
  /reportMinIntervalMin: number;/.test(rpTypesSrc) && /reportMinEvents: number;/.test(rpTypesSrc),
);
check(
  "config xuất/nhập mang theo 2 field mới (đổi host không mất chính sách chống spam)",
  /"reportMinIntervalMin",/.test(
    fs.readFileSync(path.join(ROOT, "convex", "guildConfig.ts"), "utf8"),
  ),
);

// ─── N. IP-detect ngôn ngữ ban đầu (không persist) ─────────────────────────
// Bug thực tế: người quốc tế mở landing lần đầu vẫn đọc tiếng Việt vì web chỉ
// theo navigator.language. Dò theo IP qua endpoint Convex /geo_lang (CSP chỉ
// cho *.convex.cloud) — chỉ khi CHƯA có lựa chọn lưu, và KHÔNG ghi
// localStorage (người dùng chưa từng chọn thì lần sau vẫn dò lại).
const i18nSrc = files.get("lib/i18n.tsx") ?? "";
check(
  "i18n.tsx có detectLangByIp gọi /geo_lang qua Convex (không fetch API ngoài trực tiếp)",
  /export async function detectLangByIp/.test(i18nSrc) &&
    /\/geo_lang/.test(i18nSrc) &&
    /convexSiteUrl\(\)/.test(i18nSrc) &&
    !/fetch\("https:\/\/api\.country/.test(i18nSrc),
);
// Bug thật 26/09: HTTP actions của Convex phục vụ ở .convex.site — fetch nhầm
// .convex.cloud → 404 âm thầm (catch → null) → geo-detect chết dù test xanh.
check(
  "detectLangByIp gọi qua helper convexSiteUrl (không fetch .cloud trực tiếp)",
  /convexSiteUrl\(\)/.test(i18nSrc) &&
    !/resolveConvexUrl\(\)\s*;[\s\S]{0,120}\/geo_lang/.test(i18nSrc),
);
check(
  "IP-detect chỉ áp dụng khi CHƯA có lựa chọn lưu, không ghi localStorage",
  /if \(saved\) return;/.test(i18nSrc) &&
    /setLangState\(detected\)/.test(i18nSrc) &&
    !/localStorage\.setItem\(LANG_KEY, detected\)/.test(i18nSrc),
);
check(
  "IP-detect chỉ ảnh hưởng ngôn ngữ hỗ trợ (VN→vi, DE/AT/CH/LI→de), còn lại giữ nguyên",
  /country === "VN"/.test(i18nSrc) &&
    /"AT"/.test(i18nSrc) &&
    /"CH"/.test(i18nSrc) &&
    /return null;/.test(i18nSrc),
);
const httpSrc = fs.readFileSync(path.join(ROOT, "convex", "http.ts"), "utf8");
check(
  "convex/http.ts route /geo_lang: đọc x-forwarded-for, fail-open về country rỗng",
  /x-forwarded-for/.test(httpSrc) &&
    /api\.country\.is/.test(httpSrc) &&
    /httpRouter\(\)/.test(httpSrc) &&
    /country: ""/.test(httpSrc),
);
check(
  "/geo_lang không lưu DB hay IP (chỉ pass-through), có CORS + cache",
  !/ctx\.db/.test(httpSrc) &&
    /access-control-allow-origin/.test(httpSrc) &&
    /cache-control/.test(httpSrc),
);
// Bug thật 28/09/2026: đáp án theo IP từng người gọi nhưng gửi kèm
// `Cache-Control: public, max-age=86400` — cache dùng chung (CDN/proxy) được
// phép đưa đáp án của người A cho người B. Phải `private`.
check(
  "cache /geo_lang là PRIVATE (đáp án theo IP từng người, không cho cache dùng chung)",
  /const CACHE_OK = "private, max-age=/.test(httpSrc) &&
    /const CACHE_MISS = "private, max-age=/.test(httpSrc) &&
    !/cache-control[^"]*public|public, max-age/.test(httpSrc),
);
// Route phải được đăng ký đúng method — codegenConvex không chặn việc quên route.
check(
  "/geo_lang đăng ký đủ GET + OPTIONS",
  /path: "\/geo_lang", method: "GET"/.test(httpSrc) &&
    /path: "\/geo_lang", method: "OPTIONS"/.test(httpSrc),
);

// ─── O. Trang /features — SEO quốc tế ────────────────────────────────
// Bug lớp cần chặn: thêm trang công khai mà quên meta/sitemap/link thì trang
// "tồn tại" nhưng không ai tìm thấy — chết y nhánh SEO im lặng.
const featuresPageSrc = fs.readFileSync(
  path.join(ROOT, "src", "pages", "FeaturesPage.tsx"),
  "utf8",
);
const featuresContentSrc = fs.readFileSync(
  path.join(ROOT, "src", "lib", "featuresContent.ts"),
  "utf8",
);
check(
  "/features có route công khai + nội dung 3 thứ tiếng tự chứa (@i18n-content)",
  /path="\/features"/.test(appSrc) &&
    /@i18n-content/.test(featuresContentSrc) &&
    /\bvi:\s*\{/.test(featuresContentSrc) &&
    /\ben:\s*\{/.test(featuresContentSrc) &&
    /\bde:\s*\{/.test(featuresContentSrc),
);
check(
  "/features được index: seo.ts láy route từ routes.json + sitemap có /features",
  /routeForPath/.test(seo) &&
    /canonicalPathFor/.test(seo) &&
    fs.readFileSync(path.join(ROOT, "public", "sitemap.xml"), "utf8").includes("/features"),
);
check(
  "/features render nhãn đa ngữ qua translate() (không render trực tiếp từ doc)",
  /translate\(doc\.hero\.title\)/.test(featuresPageSrc) &&
    /translate\(block\.description\)/.test(featuresPageSrc) &&
    /translate\(step\)/.test(featuresPageSrc),
);

// ─── O2. Cửa trước production: SPA fallback / redirect / canonical ───────────
// Bug thật 28/09/2026: /features có route React nhưng KHÔNG có trong
// vercel.json rewrites lẫn nginx SPA fallback → mở trực tiếp/tải lại trang bị
// 404 ở production trong khi dev chạy ngon. Cùng lớp bug: /status vừa là alias
// vừa tự khai canonical → 2 URL cùng nội dung tranh nhau index.
//
// BẢNG TUYẾN ĐƯỜNG (src/lib/routes.json) LÀ NGUỒN DUY NHẤT: mọi kỳ vọng dưới
// đây SUY RA từ đó, không có mảng gõ tay thứ hai. Thêm route public mà quên
// sửa vercel.json hoặc Dockerfile.web = CI đỏ, không thể "quên cả hai".
const routeManifest = require("../src/lib/routes.json");
const ROUTES = routeManifest.routes;
const byVisibility = (v) => ROUTES.filter((r) => r.visibility === v);
const SPA_FALLBACK_ROUTES = ROUTES.filter((r) => r.spaFallback);
const REDIRECT_ROUTES = ROUTES.filter((r) => r.redirect);
const SITEMAP_ROUTES = ROUTES.filter((r) => r.index && !r.redirect && r.visibility === "public");

// ── O2a. Bảng tuyến đường phải nhất quán với code ──
check(
  "bảng tuyến đường có đủ các trường bắt buộc (path/seoKind/visibility/index/sitemap/spaFallback/redirect)",
  ROUTES.length > 0 &&
    ROUTES.every(
      (r) =>
        typeof r.path === "string" &&
        r.path.startsWith("/") &&
        typeof r.seoKind === "string" &&
        ["public", "private"].includes(r.visibility) &&
        typeof r.index === "boolean" &&
        typeof r.sitemap === "boolean" &&
        typeof r.spaFallback === "boolean" &&
        (r.redirect === null || typeof r.redirect === "string"),
    ),
);
check(
  "bảng tuyến đường: alias KHÔNG index, KHÔNG sitemap, KHÔNG tự phục vụ (chỉ redirect)",
  REDIRECT_ROUTES.every((r) => !r.index && !r.sitemap && !r.spaFallback),
);
check(
  "bảng tuyến đường: private luôn noindex + không sitemap",
  byVisibility("private").every((r) => !r.index && !r.sitemap),
);
check(
  "bảng tuyến đường: redirect phải trỏ tới một route TỒN TẠI và khác chính nó",
  REDIRECT_ROUTES.every(
    (r) => r.redirect !== r.path && ROUTES.some((t) => t.path === r.redirect && !t.redirect),
  ),
);
// MỌI route trong App.tsx phải có trong bảng — route "vô danh" là route không
// ai (test/hosting/SEO) biết tới, đúng lớp bug của /features và /status.
{
  const appRoutes = [...appSrc.matchAll(/path="(\/[^"]*)"/g)].map((m) => m[1]);
  const unregistered = appRoutes.filter((p) => {
    const norm = p.replace(/\/+$/, "") || "/";
    return !ROUTES.some(
      (r) =>
        r.path === norm ||
        (r.match === "prefix" && norm.startsWith(`${r.path}/`)) ||
        // ":param" trong App.tsx thuộc route prefix của bảng
        norm.startsWith("/dashboard/"),
    );
  });
  check(
    `mọi route trong App.tsx đều khai báo trong routes.json (${appRoutes.length} path)`,
    unregistered.length === 0,
    `chưa khai báo: ${unregistered.join(", ")}`,
  );
}
// Và ngược lại: route nào bảng yêu cầu SPA fallback thì phải có mặt trong
// App.tsx (bảng không được mô tả một trang không tồn tại).
{
  const appSrcPaths = [...appSrc.matchAll(/path="(\/[^"]*)"/g)].map((m) => m[1]);
  const missingInApp = SPA_FALLBACK_ROUTES.filter((r) =>
    r.match === "exact"
      ? !appSrcPaths.includes(r.path)
      : !appSrcPaths.some((p) => p.startsWith("/dashboard")),
  );
  check(
    "mọi route cần SPA fallback đều có trong App.tsx",
    missingInApp.length === 0,
    `thiếu: ${missingInApp.map((r) => r.path).join(", ")}`,
  );
}

// ── O2b. Vercel: rewrite phủ mọi route cần SPA fallback + redirect cho alias ──
const vercelJson = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
const vercelRewrites = vercelJson.rewrites ?? [];
const vercelRedirects = vercelJson.redirects ?? [];
for (const route of SPA_FALLBACK_ROUTES) {
  const expected = route.match === "prefix" ? `${route.path}/:path*` : route.path;
  check(
    `vercel.json rewrites phủ ${route.path} (mở trực tiếp không bị 404)`,
    vercelRewrites.some((r) => r.source === expected),
  );
}
for (const route of REDIRECT_ROUTES) {
  check(
    `vercel.json redirect VĨNH VIỄN ${route.path} → ${route.redirect} (một canonical duy nhất)`,
    vercelRedirects.some(
      (r) => r.source === route.path && r.destination === route.redirect && r.permanent === true,
    ),
  );
}
check(
  "vercel.json KHÔNG tự phục vụ alias /status bằng rewrite (redirect đã lo, rewrite sẽ cướp precedence)",
  !vercelRewrites.some((r) => r.source === "/status"),
);
// Private routes phải có X-Robots-Tag noindex; public KHÔNG được có.
// Pattern kiểu "/(auth|dashboard)(/.*)?" không chứa chuỗi "/auth" — phải tách
// alternation ra rồi so, không so substring (sai cả hai chiều).
{
  const noindexSources = (vercelJson.headers ?? [])
    .filter((h) => (h.headers ?? []).some((x) => /noindex/.test(x.value ?? "")))
    .map((h) => h.source);
  /** Các path alternative trong pattern Vercel: /(auth|dashboard)(/.*)? → ["auth","dashboard"] */
  const alternativesOf = (pattern) =>
    [...pattern.matchAll(/[A-Za-z0-9_/-]+/g)]
      .map((m) => m[0])
      .filter((t) => t !== "path" && !t.startsWith("http"));
  const noindexed = new Set(noindexSources.flatMap(alternativesOf));
  for (const route of byVisibility("private")) {
    const name = route.path.replace(/^\//, "");
    check(
      `vercel.json gắn X-Robots-Tag noindex cho ${route.path}`,
      noindexed.has(name) ||
        noindexSources.some(
          (src) => src.includes(`${route.path}`) || src.includes(`${route.path}(`),
        ),
    );
  }
  for (const route of ROUTES) {
    if (route.visibility !== "public" || !route.index || route.redirect) continue;
    if (route.path === "/") continue; // index.html: không có pattern noindex nào khớp được "/"
    const name = route.path.replace(/^\//, "");
    check(
      `vercel.json KHÔNG gắn noindex cho ${route.path} (trang public cần index)`,
      !noindexed.has(name) && !noindexSources.some((src) => src.includes(`${route.path}`)),
    );
  }
}

// ── O2c. robots.txt chỉ chặn private; public KHÔNG bị chặn ──
const robotsTxt = fs.readFileSync(path.join(ROOT, "public", "robots.txt"), "utf8");
const robotsDisallows = [...robotsTxt.matchAll(/^Disallow:\s*(\S+)$/gm)].map((m) => m[1]);
for (const route of byVisibility("private")) {
  check(
    `robots.txt chặn /${route.path.replace(/^\//, "")}`,
    robotsDisallows.some((d) => route.path.startsWith(d.replace(/\/+$/, ""))),
  );
}
for (const route of ROUTES) {
  if (route.visibility !== "public" || !route.index || route.redirect) continue;
  check(
    `robots.txt KHÔNG chặn ${route.path} (trang public cần index)`,
    !robotsDisallows.some((d) => route.path.startsWith(d.replace(/\/+$/, ""))),
  );
}

// ── O2d. Sitemap: đúng bộ URL canonical, không alias, không private ──
const sitemapSrc = fs.readFileSync(path.join(ROOT, "public", "sitemap.xml"), "utf8");
const sitemapLocs = [...sitemapSrc.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const expectedSitemapLocs = SITEMAP_ROUTES.map((r) => `https://protogon.freebuff.app${r.path}`);
check(
  "sitemap.xml chứa ĐÚNG bộ URL canonical từ routes.json (không thiếu, không thừa)",
  sitemapLocs.length === expectedSitemapLocs.length &&
    expectedSitemapLocs.every((loc) => sitemapLocs.includes(loc)),
  `sitemap: [${sitemapLocs.join(", ")}] — kỳ vọng: [${expectedSitemapLocs.join(", ")}]`,
);
check(
  "sitemap.xml KHÔNG chứa /auth và KHÔNG chứa alias /status",
  !sitemapLocs.some((loc) => loc.endsWith("/auth")) &&
    !sitemapLocs.some((loc) => loc.endsWith("/status")),
);
// lastmod: chỉ được có ở trang có NGUỒN NGÀY THẬT (3 văn bản pháp lý — ngày
// LEGAL_UPDATED trong legalContent.ts). Không có nguồn thì bỏ hẳn, không bịa.
{
  const legalSrc = fs.readFileSync(path.join(ROOT, "src", "lib", "legalContent.ts"), "utf8");
  const legalUpdated = legalSrc.match(/LEGAL_UPDATED\s*=\s*"(\d{2})\/(\d{2})\/(\d{4})"/);
  const iso = legalUpdated ? `${legalUpdated[3]}-${legalUpdated[2]}-${legalUpdated[1]}` : null;
  const urls = [...sitemapSrc.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
  const legalPaths = ["/terms", "/privacy", "/data-deletion"];
  const legalDates = new Set();
  const nonLegalWithLastmod = [];
  for (const url of urls) {
    const loc = url.match(/<loc>([^<]+)<\/loc>/)?.[1] ?? "";
    const lastmod = url.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
    if (!lastmod) continue;
    const path = loc.replace("https://protogon.freebuff.app", "") || "/";
    if (legalPaths.includes(path)) legalDates.add(lastmod);
    else nonLegalWithLastmod.push(path);
  }
  check(
    "sitemap: lastmod chỉ ở 3 trang pháp lý (trang không có nguồn ngày thì bỏ hẳn, không bịa ngày build)",
    nonLegalWithLastmod.length === 0,
    `có lastmod không có nguồn: ${nonLegalWithLastmod.join(", ")}`,
  );
  check(
    "sitemap: lastmod pháp lý khớp LEGAL_UPDATED trong legalContent.ts",
    legalDates.size === 1 && (iso === null || legalDates.has(iso)),
    `các lastmod: [${[...legalDates].join(", ")}] — kỳ vọng ${iso}`,
  );
  // Ngày đồng loạt cho MỌI url (kể cả trang không có nguồn) là dấu hiệu ngày bịa.
  check(
    "sitemap: không gắn lastmod đồng loạt cho mọi trang (dấu hiệu ngày bịa)",
    urls.every((u) => /<lastmod>/.test(u)) === false || legalPaths.length === urls.length,
  );
}

// ── O2e. seo.ts: alias canonicalize về đích, không tự khai canonical ──
check(
  "seo.ts lấy canonical từ routes.ts (alias → đích redirect, route private → không canonical)",
  /canonicalPathFor/.test(seo) && /routeForPath/.test(seo) && /isIndexableRoute/.test(seo),
);
check("seo.ts dựng og:url từ canonical (không từ URL đang mở)", /og:url", canonicalUrl/.test(seo));
check(
  "seo.ts không còn bảng route/indexed viết tay (nguồn duy nhất là routes.json)",
  !/INDEXED_KINDS/.test(seo) && !/path === "\/monitor" /.test(seo),
);

check(
  "seo.ts tiêm JSON-LD theo route (WebPage + BreadcrumbList), route ẩn thì gỡ",
  /WebPage/.test(seo) &&
    /BreadcrumbList/.test(seo) &&
    /itemListElement/.test(seo) &&
    /existing\?\.remove\(\)/.test(seo) &&
    /syncRouteJsonLd\(route, canonicalPath, lang\)/.test(seo) &&
    /isIndexableRoute\(route\).*route\.redirect/.test(seo),
);
check(
  "llms.txt niêm yết /features (trang public SEO quốc tế)",
  fs.readFileSync(path.join(ROOT, "public", "llms.txt"), "utf8").includes("/features"),
);

// ─── 10. TicketPanel: số liệu + link + cấu hình phải thật sự có tác dụng ───
// Cả 3 lỗi dưới đây đều từng xảy ra và đều im lặng — không crash, không log:
//   1. `openCount` đếm trên `tickets`, mà `tickets` chỉ chứa đúng tab đang xem
//      → bấm tab "Đã đóng" là badge báo "0 đang mở" dù server đang có.
//   2. Link kênh `/channels/@me/<id>` không có guildId → bấm ra trang trắng.
//   3. `ticketCloseNote` (ghi chú khi đóng ticket) được lưu vào DB và không
//      dùng ở bất kỳ đâu → chủ server gõ xong không thấy tác dụng.
const ticketPanel = files.get("components/dashboard/TicketPanel.tsx") ?? "";
check(
  "số ticket đang mở lấy từ ticketSummary (không đếm trên tab đang xem)",
  /useQuery\(\s*api\.tickets\.ticketSummary/.test(ticketPanel) &&
    /const openCount = summary\?\.openCount/.test(ticketPanel) &&
    !/tickets\?\.filter\(/.test(ticketPanel),
);
check(
  "link mở kênh có guildId, không dùng dạng @me",
  /discord\.com\/channels\/\$\{guildId\}\/\$\{t\.channelId\}/.test(ticketPanel) &&
    !/channels\/@me\//.test(ticketPanel),
);
check(
  "đóng ticket từ web dùng ghi chú đã cấu hình làm lý do",
  /reason: g\.ticketCloseNote/.test(ticketPanel),
);
// Số liệu SLA phải đến từ query riêng `ticketStats`, KHÔNG tính lại trên
// `tickets`: `tickets` chỉ chứa đúng tab đang xem và bị cắt còn 100 bản ghi
// → mọi trung bình tính từ đó là số bịa, mà lúc nào cũng hiện ra rất thuyết phục.
const ticketsSrc = fs.readFileSync(path.join(ROOT, "convex", "tickets.ts"), "utf8");
check(
  "số liệu SLA lấy từ query ticketStats (không tính lại trên tab đang xem)",
  /useQuery\(\s*api\.tickets\.ticketStats/.test(ticketPanel) &&
    /days: statsDays/.test(ticketPanel) &&
    !/tickets\?\.filter\(/.test(ticketPanel),
);
check(
  "ticketStats quét theo cửa sổ thời gian + trần bản ghi (không kéo cả lịch sử)",
  /by_guildId_createdAt", \(q\) => q\.eq\("guildId", guildId\)\.gte\("createdAt", since\)/.test(
    ticketsSrc,
  ) && /const STAT_LIMIT/.test(ticketsSrc),
);
check(
  "trung bình rỗng trả null, không trả 0 (0 phút đọc ra là 'phản hồi tức thì')",
  /xs\.length \? Math\.round/.test(ticketsSrc) && /: null;/.test(ticketsSrc),
);
check(
  "ticketStats cùng cổng quyền như phần còn lại của panel",
  /const statsH = \(ticketStats as any\)\._handler/.test(
    fs.readFileSync(path.join(ROOT, "scripts", "test-tickets-convex.ts"), "utf8"),
  ) &&
    /getUserByToken\(ctx, token\)/.test(ticketsSrc) &&
    /canManageGuild\(user, guild\)\)/.test(ticketsSrc),
);
const guildsSrc = fs.readFileSync(path.join(ROOT, "convex", "guilds.ts"), "utf8");
// Cắt từ `getBotConfig` tới export kế tiếp — `handler: async` nằm ở ngay sau
// args nên regex non-greedy sẽ cắt cụt, không chứa được phần field trả về.
const gi = guildsSrc.indexOf("export const getBotConfig");
const gNext = guildsSrc.indexOf("export const", gi + 10);
const botConfig = gi < 0 ? "" : guildsSrc.slice(gi, gNext > 0 ? gNext : undefined);
check(
  "bundle bot (getBotConfig) có ticketCloseNote — bot dựng topic từ đó",
  /ticketCloseNote: guild\.ticketCloseNote/.test(botConfig),
);
const ticketsHandler = fs.readFileSync(
  path.join(ROOT, "bot", "src", "handlers", "tickets.js"),
  "utf8",
);
check(
  "tạo kênh ticket dùng closeNote làm topic",
  // Prettier có thể tách chuỗi .trim().slice() ra nhiều dòng → bỏ khoảng trắng
  // và newline trước khi so khớp, nếu không test này sẽ đỏ vì lý do hình thức.
  /topic:\s*String\(closeNote\s*\|\|\s*""\)\s*\.trim\(\)\s*\.slice\(0,\s*1024\)/.test(
    ticketsHandler,
  ),
);

// ─── 11. Cờ cấu hình bot đọc thì phải có thật (schema + bundle + UI) ──────────
// `nukeRollback` đọc `config.rollbackEnabled === false` để cho phép chủ server
// tắt, nhưng field KHÔNG tồn tại ở đâu cả → nhánh "tắt" không bao giờ chạy và
// không ai có đường tắt. Lớp lỗi "hứa có, không có", chặn bằng cách bắt buộc
// đủ 3 tầng mỗi khi thêm cờ mới.
const antiNuke = files.get("components/dashboard/AntiNukePanel.tsx") ?? "";
const guildsSrc2 = fs.readFileSync(path.join(ROOT, "convex", "guilds.ts"), "utf8");
const schemaSrc = fs.readFileSync(path.join(ROOT, "convex", "schema.ts"), "utf8");
const gi2 = guildsSrc2.indexOf("export const getBotConfig");
const gn2 = guildsSrc2.indexOf("export const", gi2 + 10);
const botConfig2 = guildsSrc2.slice(gi2, gn2 > 0 ? gn2 : undefined);
for (const flag of ["rollbackEnabled"]) {
  check(
    `cờ ${flag} có trong schema`,
    new RegExp(`${flag}: v\\.optional\\(v\\.boolean\\(\\)\\)`).test(schemaSrc),
  );
  check(
    `cờ ${flag} có trong bundle bot (getBotConfig)`,
    new RegExp(`${flag}: guild\\.${flag}`).test(botConfig2),
  );
  check(`UI có nút bật/tắt cho ${flag}`, new RegExp(`${flag}`).test(antiNuke));
}

// ─── 12. Preloader: không bao giờ kẹt người dùng ở màn loading ────────────────
// Preloader: CSS inline trong index.html (chống màn trắng) + script ở FILE
// NGOÀI public/boot.js (CSP script-src 'self' chặn inline — xem 12d). Tự fade
// khi window.__bootDone() được gọi. Ba đường kẹt người dùng đều phải chặn:
//   1. Không có JS → không ai gọi __bootDone → kẹt vĩnh viễn (phải có noscript).
//   2. Bundle lỗi / app crash → phải có chốt an toàn theo thời gian.
//   3. React ném lỗi toàn trang → RootErrorBoundary phải mở preloader ra,
//      nếu không người dùng thấy loading mãi dù app đã có màn báo lỗi.
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const bootAppSrc = files.get("App.tsx") ?? "";
const bootJs = fs.readFileSync(path.join(ROOT, "public", "boot.js"), "utf8");

// ─── 12b. Cửa trước HTML: manifest, icon, dữ liệu có cấu trúc ────────────────
// Web app thiếu manifest = không cài được lên màn hình chính, thiếu
// favicon.ico = trình duyệt tự hỏi và ăn 404 vào log mỗi lượt tải trang.
check(
  "index.html khai báo manifest + favicon.ico dự phòng",
  /rel="manifest" href="\/site\.webmanifest"/.test(html) &&
    /rel="icon"[^>]*favicon\.ico/.test(html),
);
check(
  "public/site.webmanifest tồn tại, parse được, đủ icon 192/512 + start_url",
  (() => {
    try {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(ROOT, "public", "site.webmanifest"), "utf8"),
      );
      const sizes = (manifest.icons ?? []).map((i) => i.sizes);
      return (
        typeof manifest.name === "string" &&
        manifest.name.length > 0 &&
        typeof manifest.start_url === "string" &&
        typeof manifest.display === "string" &&
        sizes.includes("192x192") &&
        sizes.includes("512x512")
        // "orientation" CỐ Ý KHÔNG kiểm ở đây — xem check riêng bên dưới.
      );
    } catch {
      return false;
    }
  })(),
);
// Dashboard responsive — khoá portrait là khoá cả tablet/laptop xoay ngang.
// (Bug láº1i: manifest cĂ³ "orientation": "portrait-primary".)
check(
  "site.webmanifest KHÔNG khoá hÆ°á»ng portrait (dashboard dĂ¹ng ÄÆ°á»£c trĂªn m»)",
  (() => {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "site.webmanifest"), "utf8"));
      return !("orientation" in m) || !/portrait|landscape/.test(String(m.orientation));
    } catch {
      return false;
    }
  })(),
);
check(
  "favicon.ico tồn tại và là ICO chứa PNG (magic bytes)",
  (() => {
    try {
      const ico = fs.readFileSync(path.join(ROOT, "public", "favicon.ico"));
      return (
        ico.readUInt16LE(2) === 1 && ico.readUInt16LE(4) >= 1 && ico.readUInt32BE(22) === 0x89504e47 // PNG magic ngay sau ICONDIR+ENTRY
      );
    } catch {
      return false;
    }
  })(),
);
// Dữ liệu có cấu trúc: SoftwareApplication PHẢI gắn publisher vào Organization
// qua @id — hai khối rời rạc không liên kết thì Google chỉ hiểu nửa.
check(
  "index.html có JSON-LD SoftwareApplication + Organization liên kết qua @id",
  /"@type": "SoftwareApplication"/.test(html) &&
    /"@type": "Organization"/.test(html) &&
    /"@id": "https:\/\/protogon\.freebuff\.app\/#organization"/.test(html) &&
    /publisher/.test(html),
);
check(
  "theme-color nhất quán giữa index.html và 404.html (tab không đổi màu khi lạc trang)",
  /theme-color" content="#171717"/.test(html) &&
    /theme-color" content="#171717"/.test(
      fs.readFileSync(path.join(ROOT, "public", "404.html"), "utf8"),
    ),
);
// security.txt (RFC 9116): sản phẩm bảo mật phải có kênh báo lỗi công khai.
// Expires quá hạn = công cụ quét BỎ QUA im lặng toàn bộ tệp — phải chặn.
check(
  "security.txt hợp lệ: có Contact + Expires chưa quá hạn",
  (() => {
    try {
      const txt = fs.readFileSync(path.join(ROOT, "public", ".well-known", "security.txt"), "utf8");
      const expires = txt.match(/^Expires:\s*(.+)$/m)?.[1];
      const contacts = [...txt.matchAll(/^Contact:\s*(.+)$/gm)];
      return (
        contacts.length > 0 &&
        contacts.every((c) => /^https?:\/\//.test(c[1].trim())) &&
        !!expires &&
        Number.isFinite(Date.parse(expires)) &&
        Date.parse(expires) > Date.now()
      );
    } catch {
      return false;
    }
  })(),
);

// ─── 12d. CSP: KHÔNG có inline <script> trong index.html ─────────────────────
// Bug thảm hoạng, đo bằng trình duyệt thật 28/09/2026: CSP production
// (vercel.json + Dockerfile.web) đặt `script-src 'self'` — inline script
// KHÔNG có nonce/hash bị chặn IM LẶNG. Script preloader lúc đó nằm inline →
// không chạy → #boot không bao giờ nhận class `is-done` → lớp phủ preloader
// phủ kín TOÀN BỘ app ở MỌI trang, kẹt ở 0% vĩnh viễn. App render bình
// thường phía dưới, không ai thấy được.
// Cách chống: mọi script phải là file ngoài cùng origin; kiểm ở đây để không
// ai thêm lại inline script (hoặc đổi boot.js về inline) mà không thấy.
const inlineExecutableScripts = [
  ...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g),
].filter((m) => !/application\/ld\+json/.test(m[1]) && m[2].trim().length > 0);
check(
  "index.html KHÔNG có inline <script> thực thi (CSP script-src 'self' chặn → preloader kẹt)",
  inlineExecutableScripts.length === 0,
  `đang có ${inlineExecutableScripts.length} script inline — chuyển sang file ngoài cùng origin`,
);
check(
  "index.html nạp preloader từ /boot.js (file ngoài)",
  /<script src="\/boot\.js"><\/script>/.test(html),
);
check(
  "boot.js là file ngoài hợp lệ: __bootDone + chốt 7s + requestAnimationFrame",
  /window\.__bootDone/.test(bootJs) &&
    /7_?000\s*\)/.test(bootJs) &&
    /requestAnimationFrame/.test(bootJs),
);

// ─── 12c. Skip-to-content: mọi trang có một nút "Bỏ qua tới nội dung" ─────────
// WCAG 2.4.1: header cố định + điều hướng dài buộc người dùng bàn phím phải
// Tab qua toàn bộ chrome mỗi lần mở trang. Trang thiếu SkipLink hoặc thiếu
// <main id="main"> là nút bấm chết (nhảy không tới đâu).
// MỌI trang .tsx trong src/pages — danh sách phải khớp thư mục thật, không
// gõ tay từng trang: thêm trang mới mà quên skip link = CI đỏ.
// 07/10/2026 — ĐỔI CHỖ ĐẶT SKIP LINK: trước đây MỖI trang tự render <SkipLink/>,
// nhưng từ khi bộ chọn trang nằm trong header CHUNG (App.tsx render SiteNav
// trước nội dung trang) thì skip link trong trang bị đẩy ra SAU header → Tab
// đầu tiên dừng ở logo/menu thay vì ở lối tắt. Nay chỉ có MỘT skip link ở
// App.tsx, đứng trước cả header; mỗi trang chỉ còn phải giữ ĐÍCH nhảy.
const appSrcForSkip = files.get("App.tsx") ?? "";
check(
  "App.tsx render đúng MỘT SkipLink và nó đứng trước SiteNav (Tab đầu tiên là lối tắt)",
  (appSrcForSkip.match(/<SkipLink \/>/g) ?? []).length === 1 &&
    appSrcForSkip.indexOf("<SkipLink />") < appSrcForSkip.indexOf("<SiteNav />"),
);
const SKIP_LINK_PAGES = fs
  .readdirSync(path.join(ROOT, "src", "pages"))
  .filter((f) => f.endsWith(".tsx"))
  .sort();
for (const page of SKIP_LINK_PAGES) {
  const src = files.get(`pages/${page}`) ?? "";
  // Hai hình thức hợp lệ: trang tự render <main id="main" tabIndex={-1}>,
  // hoặc giao cho <PageReveal id="main"> (PageReveal đã có tabIndex — kiểm
  // riêng ở dưới). Cả hai đều cho skip link một đích nhảy CÓ THỂ NHẬN FOCUS.
  const hasOwnMain = /<main[^>]*id="main"[^>]*tabIndex=\{-1\}/.test(src);
  const usesPageReveal = /<PageReveal id="main"/.test(src);
  check(
    `${page} có đích nhảy nhận được focus (<main tabIndex={-1}> hoặc PageReveal)`,
    hasOwnMain || usesPageReveal,
  );
  check(
    `${page} KHÔNG tự render SkipLink nữa (tránh 2 lối tắt trùng trong tab order)`,
    !/<SkipLink/.test(src),
  );
}
const bootBoundary = files.get("components/RootErrorBoundary.tsx") ?? "";
// ── Fail-open: preloader KHÔNG được phụ thuộc vào /boot.js ──
// Bug lớp: PR #15 chuyển script preloader sang /boot.js cho khỏi CSP, nhưng
// chốt an toàn (window.__bootDone) vẫn nằm TRONG boot.js. Nếu file đó 404, bị
// chặn, tải dở, hoặc throw trước khi gán window.__bootDone thì BootSignal và
// RootErrorBoundary chỉ gọi window.__bootDone?.() → no-op → lớp phủ #boot
// phủ kín app vĩnh viễn. Fix: finishBootOverlay() là đường ra THỨ HAI, độc
// lập — boot.js còn sống thì dùng nó, hỏng thì tự gỡ DOM. Hành vi thực tế do
// scripts/test-browser-contracts.cjs chặn request /boot.js rồi kiểm tra app
// hiện được + lớp phủ biến mất.
check(
  "BootSignal gọi finishBootOverlay (đường ra thứ hai khi /boot.js hỏng)",
  /import \{ finishBootOverlay \} from ".\/lib\/bootOverlay"/.test(bootAppSrc) &&
    /finishBootOverlay\(\)/.test(bootAppSrc) &&
    /BOOT_SIGNAL_CAP_MS/.test(bootAppSrc),
);
check(
  "RootErrorBoundary gọi finishBootOverlay (lỗi toàn trang cũng phải hiện app)",
  /finishBootOverlay\(\)/.test(bootBoundary) && !/window\.__bootDone/.test(bootBoundary),
);
{
  const mainSrc = files.get("pages/Main.tsx") ?? "";
  const mainReal = mainSrc || fs.readFileSync(path.join(ROOT, "src", "main.tsx"), "utf8");
  check(
    "Bootstrap lỗi (trước khi React mount) cũng gọi finishBootOverlay",
    /finishBootOverlay\(\)/.test(mainReal) && /catch \(error\)/.test(mainReal),
  );
  const helper = files.get("lib/bootOverlay.ts") ?? "";
  check(
    "bootOverlay.ts đủ 2 đường: boot.js sống thì dùng __bootDone, hỏng thì tự gỡ DOM",
    /window\.__bootDone/.test(helper) &&
      /getElementById\(BOOT_OVERLAY_ID\)/.test(helper) &&
      /classList\.add\("is-done"\)/.test(helper) &&
      /overlay\.remove\(\)/.test(helper),
  );
}

check(
  "PageReveal (5 trang dùng) cũng cho <main> nhận focus (tabIndex={-1})",
  [files.get("components/PageReveal.tsx") ?? ""].some((src) => /tabIndex=\{-1\}/.test(src)),
);
check(
  "preloader có markup + role progressbar",
  /id="boot"/.test(html) && /role="progressbar"/.test(html),
);
check(
  "preloader có noscript ẩn (không JS không kẹt)",
  /<noscript>[\s\S]*?#boot[\s\S]*?<\/noscript>/.test(html),
);
check(
  "preloader có chốt an toàn theo thời gian",
  /setTimeout\(function \(\) \{\s*done = true;/.test(bootJs),
);
check("preloader tôn trọng prefers-reduced-motion", /prefers-reduced-motion: reduce/.test(html));
check(
  "preloader bám chủ đề app (không lóe trắng trên máy chủ đề tối)",
  /protogon-theme/.test(bootJs) && /prefers-color-scheme: dark/.test(bootJs),
);
check("App gọi __bootDone khi đã vẽ xong", /window\.__bootDone/.test(bootAppSrc));
check(
  "Tín hiệu __bootDone nằm BÊN TRONG <Suspense> (không nhảy qua RouteFallback)",
  /<Suspense[^]*?\n\s*<BootSignal \/>/.test(bootAppSrc),
);
check(
  "App lỗi toàn trang cũng mở preloader (fail-open, không phụ thuộc /boot.js)",
  /finishBootOverlay/.test(bootBoundary),
);
check("App khai báo kiểu __bootDone cho TypeScript", /__bootDone\?: \(\) => void/.test(bootAppSrc));
// Đừng thêm transition width cho thanh: JS đã easing và đặt % mỗi frame, bộ
// easing thứ hai của CSS làm đầu thanh trễ ~150ms so với số % bên dưới — hai
// thứ trượt lệch nhau.
// Bỏ comment CSS trước khi kiểm — rule .boot-fill có giải thích bằng chữ
// "transition" ngay trong đó, đọc thẳng sẽ ra kết quả sai.
const bootFillRule = (html.match(/\.boot-fill \{[^}]*\}/) || [""])[0].replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);
// Nhân vật pixel chạy trên thanh đã BỎ hẳn (28/09/2026): ở cỡ vẽ được trên
// thanh nó không đọc ra hình người, chỉ tốn 60 lần dựng lại lưới mỗi giây để
// nhấp nháy. Luật này giữ cho nó không bị dựng lại.
check(
  "preloader KHÔNG còn canvas/nhân vật (chỉ thanh + %, không vẽ gì mỗi frame)",
  !/boot-run/.test(html) &&
    !/drawRunner/.test(html) &&
    !/getContext\("2d"\)/.test(html) &&
    !/<canvas/.test(html),
);
check(
  "preloader chỉ còn MỘT nguồn đặt tiến trình (paint), không còn run.style.left",
  /fill\.style\.width = v \+ "%";/.test(bootJs) && !/run\.style\.left/.test(bootJs),
);
check(
  "KHÔNG transition width trên .boot-fill (JS đã easing — transition làm lệch)",
  !/transition/.test(bootFillRule),
  bootFillRule.replace(/\s+/g, " ").slice(0, 90),
);
check(
  "Bật giảm chuyển động: giá trị % chặn trên 100 (làm tròn bậc 8 → 104 là tràn thanh)",
  /Math\.min\(100, Math\.round\(p \/ 8\) \* 8\)/.test(bootJs),
);

// Ba thứ "làm đẹp" của preloader (logo, thanh mảnh, vệt sáng) là chủ đích của
// thiết kế 28/09/2026 — không có luật thì lần sau ai gỡ mất cũng không ai biết.
const bootTrackRule = (html.match(/\.boot-track \{[^}]*\}/) || [""])[0].replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);
const bootTrackHeightPx = Number((bootTrackRule.match(/height:\s*(\d+(?:\.\d+)?)px/) || [])[1]);
check(
  "preloader: thanh tiến trình mảnh (≤ 4px, không phình lại)",
  Number.isFinite(bootTrackHeightPx) && bootTrackHeightPx > 0 && bootTrackHeightPx <= 4,
  `height=${Number.isFinite(bootTrackHeightPx) ? bootTrackHeightPx : "?"}px`,
);
// Logo cá voi: MỘT ảnh (public/logo-mark.png) dùng chung ở MỌI chỗ. Logo cũ
// vẽ tay bằng path SVG đã bỏ (28/09/2026) vì hình không đọc ra cá voi — luật
// này chốt cả sự tồn tại/kích thước ảnh lẫn việc không ai vẽ lại path cũ, kèm
// chiều ngược lại: không sót tham chiếu tới asset đã xoá.
function pngInfo(rel) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return null;
  const buf = fs.readFileSync(file);
  const isPng = buf
    .slice(0, 8)
    .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return { buf, isPng, w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
const logoMark = pngInfo("public/logo-mark.png");
const faviconPng = pngInfo("public/favicon.png");
const touchPng = pngInfo("public/apple-touch-icon.png");
const botLogoSrc = files.get("components/BotLogo.tsx") ?? "";
const legalSrc = files.get("pages/LegalPage.tsx") ?? "";
check(
  "logo mark là PNG vuông 256×256 (nguồn duy nhất cho mọi chỗ)",
  !!logoMark && logoMark.isPng && logoMark.w === 256 && logoMark.h === 256,
  logoMark ? `${logoMark.w}×${logoMark.h}` : "thiếu public/logo-mark.png",
);
check(
  "logo mark có nội dung thật (không phải file rỗng hay ký tự lạc)",
  !!logoMark && logoMark.buf.length > 4096,
  logoMark ? `${(logoMark.buf.length / 1024).toFixed(1)}KB` : "thiếu file",
);
check(
  "favicon.png + apple-touch-icon.png là PNG vuông đúng cỡ",
  !!faviconPng &&
    faviconPng.isPng &&
    faviconPng.w === 64 &&
    faviconPng.h === 64 &&
    !!touchPng &&
    touchPng.isPng &&
    touchPng.w === 180 &&
    touchPng.h === 180,
);
check(
  "preloader dùng ảnh logo (/logo-mark.png) thay SVG vẽ tay",
  /class="boot-logo"/.test(html) && /logo-mark\.png/.test(html),
);
check("logo cá voi có trong BotLogo.tsx (web)", botLogoSrc.includes("/logo-mark.png"));
// ── MÀN CHỜ CHUYỂN TRANG (RouteLoader) ──
// Nó hiện ở MỌI lần chuyển route lazy. Nếu dựng y hệt preloader #boot
// (logo + chữ + thanh %) thì người dùng thấy đúng cái màn vừa xong lặp lại
// và tưởng web bị nhân bản (báo cáo 30/09/2026). Luật ở đây chốt ranh giới
// giữa "màn khởi động" và "màn chuyển trang".
const routeLoaderPath = path.join(SRC, "components", "RouteLoader.tsx");
check("có component RouteLoader riêng", fs.existsSync(routeLoaderPath));
const loaderSrc = fs.existsSync(routeLoaderPath) ? fs.readFileSync(routeLoaderPath, "utf8") : "";

// ── MỘT NGÔN NGỮ HÌNH ẢNH DUY NHẤT CHO MỌI MÀN CHỜ ──
// Preloader #boot giữ quyền độc quyền về logo + thanh tiến trình + số %. Trước
// đây PageSplash dựng y hệt preloader (logo cá voi + thanh 140px) nên người
// dùng thấy màn đó lặp lại ngay sau khi thoát màn khởi động → tưởng "load 2
// lần" (báo cáo 30/09/2026). Nay cả RouteLoader lẫn PageSplash cùng dùng
// LoadingRipple; luật ở đây chốt: không component nào khác được dựng lại
// danh tính preloader, và không tự vẽ vòng sóng riêng.
const ripplePath = path.join(SRC, "components", "LoadingRipple.tsx");
check("có component LoadingRipple dùng chung", fs.existsSync(ripplePath));
const rippleSrc = fs.existsSync(ripplePath) ? fs.readFileSync(ripplePath, "utf8") : "";
const pageSplashPath = path.join(SRC, "components", "PageSplash.tsx");
check("có component PageSplash", fs.existsSync(pageSplashPath));
const pageSplashSrc = fs.existsSync(pageSplashPath) ? fs.readFileSync(pageSplashPath, "utf8") : "";
check(
  "PageSplash dùng chung LoadingRipple (không tự vẽ màn chờ riêng)",
  /import LoadingRipple from "\.\/LoadingRipple"/.test(pageSplashSrc) &&
    /<LoadingRipple/.test(pageSplashSrc) &&
    !/animate-route-progress/.test(pageSplashSrc),
);
check(
  "RouteLoader dùng chung LoadingRipple (một ngôn ngữ hình ảnh)",
  /import LoadingRipple from "\.\/LoadingRipple"/.test(loaderSrc) &&
    /<LoadingRipple/.test(loaderSrc),
);
check(
  "PageSplash KHÔNG mạo danh preloader (logo / thanh tiến trình)",
  // Chỉ soi code thật, KHÔNG soi chữ trong ghi chú — file này cố tình giải
  // thích "vì sao bỏ logo" nên tên ảnh có thể xuất hiện trong comment.
  !/import\s*\{\s*WhaleIcon/.test(pageSplashSrc) &&
    !/<WhaleIcon/.test(pageSplashSrc) &&
    !/src="\/logo-mark\.png"/.test(pageSplashSrc) &&
    !/id="boot"/.test(pageSplashSrc) &&
    !/boot-fill|boot-pct|boot-track/.test(pageSplashSrc),
);
check(
  "PageSplash thông báo cho trình đọc màn hình (sr-only + translate)",
  /role="status"/.test(pageSplashSrc) &&
    /aria-live="polite"/.test(pageSplashSrc) &&
    /sr-only/.test(pageSplashSrc) &&
    /translate\("Đang tải…"\)/.test(pageSplashSrc),
);
check(
  "LoadingRipple tôn trọng prefers-reduced-motion (motion-safe:)",
  /motion-safe:animate-/.test(rippleSrc) && /motion-safe:animate-pulse-fade/.test(rippleSrc),
);
check(
  "KHÔNG component nào khác dựng lại vòng sóng (chỉ LoadingRipple được vẽ)",
  // Soi thuộc tính JSX thật, KHÔNG soi chữ trong ghi chú.
  (() => {
    const compDir = path.join(SRC, "components");
    const offenders = [];
    for (const f of fs.readdirSync(compDir)) {
      if (!f.endsWith(".tsx") || f === "LoadingRipple.tsx") continue;
      const s = fs.readFileSync(path.join(compDir, f), "utf8");
      if (/animate-pulse-ring|animate-pulse-fade/.test(s)) offenders.push(f);
    }
    return offenders.length === 0;
  })(),
);
check(
  "MỌI màn chờ toàn trang dùng PageSplash, không tự vẽ Loader2",
  // Mẫu cấm: thẻ `min-h-screen` (màn chờ phủ trang) đi cùng `animate-spin`.
  // Loại trừ các spinner NHỎ nằm trong nút/panel (h-3.5/h-4/w-4…) — đó là
  // trạng thái nút, không phải màn chờ.
  (() => {
    const roots = [path.join(SRC, "components"), path.join(SRC, "pages")];
    const offenders = [];
    for (const dir of roots) {
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith(".tsx")) continue;
        const p = path.join(dir, f);
        const s = fs.readFileSync(p, "utf8");
        if (!/min-h-screen/.test(s)) continue;
        // Chỉ soi JSX thật: bỏ qua phần comment.
        const code = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        for (const m of code.matchAll(/animate-spin[^"]*/g)) {
          const frag = code.slice(Math.max(0, m.index - 260), m.index);
          if (/min-h-screen/.test(frag)) offenders.push(`${f}: ${m[0]}`);
        }
      }
    }
    return offenders.length === 0 ? true : false;
  })(),
);
check(
  "RouteLoader được dùng làm fallback của <Suspense> trong App.tsx",
  /import RouteLoader from "\.\/components\/RouteLoader"/.test(appSrc) &&
    /fallback=\{<RouteFallback\s*\/>\}/.test(appSrc) &&
    /RouteFallback = RouteLoader/.test(appSrc),
);
check(
  "RouteLoader KHÔNG lazy() — fallback phải nằm sẵn trong bundle chính",
  !/lazy\(\(\)\s*=>\s*import\([^)]*RouteLoader/.test(appSrc + loaderSrc),
);
check(
  'RouteLoader giữ role="status" + aria-live cho trình đọc màn hình',
  /role="status"/.test(loaderSrc) && /aria-live="polite"/.test(loaderSrc),
);
check(
  "RouteLoader thông báo cho trình đọc màn hình bằng sr-only",
  /sr-only/.test(loaderSrc) && /translate\("Đang tải…"\)/.test(loaderSrc),
);
check(
  "RouteLoader phủ toàn màn hình",
  /fixed inset-0/.test(loaderSrc) && /z-\[60\]/.test(loaderSrc),
);
check(
  "RouteLoader KHÔNG dựng lại danh tính preloader (logo / id=boot / số %)",
  // Chỉ soi thuộc tính JSX thật, KHÔNG soi chữ trong ghi chú — file này cố tình
  // giải thích "vì sao không dùng logo" nên tên ảnh có thể xuất hiện trong
  // comment mà vẫn đúng.
  !/src="\/logo-mark\.png"/.test(loaderSrc) &&
    !/id="boot"/.test(loaderSrc) &&
    !/boot-fill|boot-pct|boot-track/.test(loaderSrc),
);
check(
  "RouteLoader tôn trọng prefers-reduced-motion (motion-safe: qua LoadingRipple)",
  /motion-safe:animate-/.test(loaderSrc) || /<LoadingRipple/.test(loaderSrc),
);
check(
  "RouteLoader KHÔNG tự khai báo lớp phủ preloader thứ hai",
  (loaderSrc.match(/id="boot"/g) || []).length === 0 &&
    !/window\.__bootDone/.test(loaderSrc) &&
    !/finishBootOverlay/.test(loaderSrc),
);
check(
  "KHÔNG còn path cá voi vẽ tay và không còn public/favicon.svg",
  !/M59 11 C55 12/.test(`${html}${botLogoSrc}`) &&
    !fs.existsSync(path.join(ROOT, "public", "favicon.svg")),
);
check(
  "KHÔNG sót tham chiếu /favicon.svg (asset đã xoá)",
  !/favicon\.svg/.test(`${html}${botLogoSrc}${appSrc}${legalSrc}`),
);
check(
  "preloader đảo màu logo ở chủ đề tối (ảnh chỉ có trắng + alpha)",
  /#boot\[data-boot="dark"\]\s*\.boot-logo[^{]*\{[^}]*invert\(1\)/.test(html),
);

// Ảnh chia sẻ (Open Graph): sinh từ scripts/build-og-image.cjs. Trước đây nó
// vẫn giữ logo MẶT BOT vẽ tay vì máy build không có font — canvas không có
// font thì vẽ chữ ra trang trắng im lặng. Luật này chặn quay lại logo cũ.
const ogPng = pngInfo("public/og-image.png");
const ogSvg = fs.readFileSync(path.join(ROOT, "public", "og-image.svg"), "utf8");
check(
  "og-image.png là PNG đúng khung 1200×630 (tỉ lệ Open Graph)",
  !!ogPng && ogPng.isPng && ogPng.w === 1200 && ogPng.h === 630,
  ogPng ? `${ogPng.w}×${ogPng.h}` : "thiếu public/og-image.png",
);
check(
  "og-image KHÔNG còn logo mặt bot vẽ tay (đã đổi sang cá voi)",
  !/C27 13C16 13/.test(ogSvg) && !/cx="29" cy="38"/.test(ogSvg),
);
check(
  "og-image dùng CHUNG asset cá voi với web (không tự vẽ lại)",
  ogSvg.includes("logo-mark.png") && ogSvg.includes("brand-whale.png"),
);
check(
  "og:image trong index.html + seo.ts vẫn trỏ og-image.png",
  /og:image[\s\S]{0,120}og-image\.png/.test(html) &&
    (files.get("lib/seo.ts") ?? "").includes("og-image.png"),
);

// ─── Chuỗi tiếng Việt render thẳng ra UI ────────────────────────────────────
// check-i18n.cjs chỉ canh key ĐÃ bọc translate() có bản EN/DE. Chuỗi viết thẳng
// trong JSX (quên bọc) thì người chọn EN/DE vẫn thấy tiếng Việt — đã xảy ra ở
// panel Alt Detection (28/09/2026): 5 dòng nguyên văn. Luật này bắt cả chuỗi
// CÓ dấu lẫn KHÔNG dấu ("Nguong rui ro"), bỏ qua dòng đánh dấu `i18n-ok`.
const VI_DIACRITIC = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđĐ]/;
// Từ tiếng Việt hay viết không dấu trong UI; cả danh sách đều KHÔNG trùng từ
// tiếng Anh nên báo động sai gần như bằng 0.
const VI_NO_DIACRITIC = ["nguong", "nghiem", "ngat", "chua", "khong", "duoc", "hien"];
const DISPLAY_ATTR = /\b(alt|placeholder|title|aria-label)\s*=\s*"([^"]{2,})"/g;

/** Dòng có nguyên văn tiếng Việt lọt ra UI (text node hoặc thuộc tính hiển thị). */
function rawVietnameseLines(src) {
  // Xoá span nhưng GIỆN SỐ DÒNG (đổi mọi ký tự trong span thành khoảng trắng).
  const blank = (m) => m.replace(/[^\n]/g, " ");
  const stripped = src
    .replace(/(?:translate|\bt)\([\s\S]*?\)/g, blank)
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/^\s*\/\/.*$/gm, blank)
    .replace(/\s\/\/.*$/gm, blank);
  const srcLines = src.split("\n");
  const hits = [];
  stripped.split("\n").forEach((line, i) => {
    const original = srcLines[i] ?? "";
    if (/^\s*(\*|\/\/|\/\*)/.test(original) || /i18n-ok/.test(original)) return;
    const check = (value) => {
      const v = value.trim();
      if (!v) return;
      const words = v
        .toLowerCase()
        .split(/[^a-zà-ỹ]+/)
        .filter(Boolean);
      if (VI_DIACRITIC.test(v) || words.some((w) => VI_NO_DIACRITIC.includes(w))) {
        hits.push(`dòng ${i + 1}: "${v.slice(0, 60)}"`);
      }
    };
    for (const m of line.matchAll(DISPLAY_ATTR)) check(m[2]);
    // text node trần: bỏ thẻ + biểu thức, còn lại mới là chữ người dùng thấy.
    const residue = line
      .replace(/<[^>]*>/g, " ")
      .replace(/[{}]/g, " ")
      .trim();
    if (/^[A-Za-zÀ-ỹ0-9][A-Za-zÀ-ỹ0-9 ,.'!?:%()/–—-]*$/.test(residue)) check(residue);
  });
  return hits;
}

const untranslatedUi = [];
for (const [rel, content] of files) {
  if (!rel.endsWith(".tsx")) continue;
  for (const hit of rawVietnameseLines(content)) untranslatedUi.push(`${rel} ${hit}`);
}
check(
  "JSX không render thẳng chuỗi tiếng Việt (marker `i18n-ok` để miễn trừ)",
  untranslatedUi.length === 0,
  untranslatedUi.slice(0, 6).join(" | "),
);

// Ảnh thương hiệu đầu trang chủ: bản KHỔ RỘNG (cá voi + sóng + vệt nước), khác
// hẳn logo vuông 256. Bị kéo méo hoặc dùng nhầm bản vuông là tranh hỏng — chặn
// bằng chính tỉ lệ + kích thước khai báo trong markup (không dịch layout).
const brandWhale = pngInfo("public/brand-whale.png");
const landingSrc = files.get("pages/Landing.tsx") ?? "";
check(
  "ảnh thương hiệu đầu trang chủ là PNG khổ rộng (tỉ lệ 1.4–1.7)",
  !!brandWhale &&
    brandWhale.isPng &&
    brandWhale.w / brandWhale.h > 1.4 &&
    brandWhale.w / brandWhale.h < 1.7,
  brandWhale ? `${brandWhale.w}×${brandWhale.h}` : "thiếu public/brand-whale.png",
);
check(
  "trang chủ dùng ảnh thương hiệu ở đầu hero + khai báo kích thước",
  /src="\/brand-whale\.png"/.test(landingSrc) &&
    /width=\{1024\}/.test(landingSrc) &&
    /height=\{652\}/.test(landingSrc),
);
check(
  "preloader có vệt ánh sáng chạy trên thanh (animation CSS)",
  /\.boot-fill::after\s*\{/.test(html) && /@keyframes boot-sheen/.test(html),
);
check(
  "preloader tắt vệt sáng khi bật giảm chuyển động",
  /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,600}animation:\s*none/.test(html),
);

// ── BỘ CHỌN TRANG: mọi trang phải CÓ ĐƯỜNG VÀO từ giao diện ──
// Lỗi thật 30/09/2026: bảng chọn trang (dock nổi) chỉ liệt kê 3 mục trong khi
// web có 12 route, và nó chỉ được mount trên Landing — nên 9 trang không có
// đường vào nào mà không ai báo lỗi. Hai luật bên dưới chặn tái diễn:
//   (1) mọi route công khai phải xuất hiện trong bảng chọn trang,
//   (2) bảng chọn trang phải mount ở App.tsx (mọi trang), không riêng 1 trang.
const navSrc = fs.readFileSync(path.join(SRC, "lib", "navItems.ts"), "utf8");
const appFileSrc = fs.readFileSync(path.join(SRC, "App.tsx"), "utf8");
const navPaths = [...new Set([...navSrc.matchAll(/to:\s*"([^"]+)"/g)].map((m) => m[1]))];
// Alias (có `redirect`) không phải trang riêng — hosting tự chuyển hướng.
// Trang pháp lý KHÔNG đòi có trong bảng chọn trang: chúng nằm ở Footer, đó là
// đường vào đúng của loại văn bản này. Đòi nhồi vào menu chính chỉ làm rối.
const LEGAL = new Set(["/terms", "/privacy", "/data-deletion"]);
const primaryRoutes = ROUTES.filter(
  (r) => r.visibility === "public" && !r.redirect && !LEGAL.has(r.path),
).map((r) => r.path);
const unreachable = primaryRoutes.filter((p) => !navPaths.includes(p));
check(
  "mọi trang công khai đều có mặt trong bảng chọn trang",
  unreachable.length === 0,
  unreachable.join(", "),
);
// Trang pháp lý phải tới được từ Footer (nơi đúng của nó).
const legalMissing = [...LEGAL].filter((p) => !footerSrc.includes(`to="${p}"`));
check("trang pháp lý có link ở Footer", legalMissing.length === 0, legalMissing.join(", "));
// Mục trong bảng chọn trang mà routes.json không có → link chết (404).
// Được phép trỏ tới route private (/dashboard…) — đó là khu vực đăng nhập.
const allRoutePaths = new Set(ROUTES.map((r) => r.path));
const ghostNav = navPaths.filter((p) => !allRoutePaths.has(p));
check(
  "bảng chọn trang không trỏ tới trang không tồn tại",
  ghostNav.length === 0,
  ghostNav.join(", "),
);
check(
  "bảng chọn trang mount ở App.tsx (mọi trang đều có, không riêng Landing)",
  /\{!transient && !isLanding && <SiteNav \/>\}/.test(appFileSrc),
);
check(
  "không trang nào tự mount SiteNav thêm lần nữa (tránh render trùng)",
  ![...files.values()].some(
    (src) => /import SiteNav from/.test(src) && !src.includes("routes.json"),
  ),
);
// Landing KHÔNG có SiteNav (header riêng to hơn) — nếu thiếu luật này, bỏ
// `PagesMenu` khỏi header landing là trang chủ mất luôn đường vào 8 trang kia
// mà không có gì báo sai.
const landingNavSrc = fs.readFileSync(path.join(SRC, "components", "landing", "Nav.tsx"), "utf8");
check(
  "landing cắm PagesMenu vào header riêng (đường vào các trang khác từ trang chủ)",
  /<PagesMenu \/>/.test(landingNavSrc) && /import \{[^}]*PagesMenu[^}]*\} from/.test(landingNavSrc),
);
// Bộ chọn trang nằm trong HEADER, không còn dock nổi — dock nổi là thứ từng
// "mất" vì thiếu neo dọc ở desktop.
const siteNavSrc = fs.readFileSync(path.join(SRC, "components", "SiteNav.tsx"), "utf8");
check(
  "SiteNav là dải header dính trên đỉnh (không phải dock nổi góc dưới)",
  /<header className="sticky top-0 /.test(siteNavSrc),
);
check(
  "mọi mục chỉ dành cho admin dùng `adminOnly` (không còn `ownerOnly` sót lại)",
  /adminOnly\?: boolean/.test(navSrc) &&
    // Chỉ chặn MÃ còn dùng `ownerOnly`; nhắc lại trong comment lịch sử thì được.
    !/ownerOnly[?:]/.test(navSrc),
);
// ── DOCK GÓC DƯỚI TRÁI (khôi phục 07/10/2026 theo yêu cầu) ──
// Dock là lối tắt thứ hai mở CÙNG bảng chọn với header. Hai luật:
//   (1) nó phải mount ở App.tsx cho mọi trang không tạm (không nhét vào 1 trang),
//   (2) nó phải có NEO DỌC cho MỌI bề mặt. Đây đúng là lỗi làm bản dock cũ
//       "biến mất" trên desktop: chỉ có nhánh `max-md:*` ⇒ position:fixed với
//       top/bottom đều auto ⇒ phần tử rơi về vị trí tĩnh sau nội dung trang.
check(
  "dock góc dưới trái mount ở App.tsx cho mọi trang (không phải chỉ 1 trang)",
  /\{!transient && <PagesDock \/>\}/.test(appFileSrc),
);
check(
  "dock nằm SAU nội dung trang trong cây DOM (thứ tự tab: nội dung trước, phụ kiện nổi sau)",
  appFileSrc.indexOf("<PagesDock />") > appFileSrc.indexOf("</Suspense>"),
);
const dockSrc = siteNavSrc.slice(
  siteNavSrc.indexOf("export function PagesDock"),
  siteNavSrc.indexOf("function PagesPanel"),
);
check(
  "dock neo đáy cho MỌI bề mặt + top-auto (không rơi về vị trí tĩnh)",
  /bottom-4/.test(dockSrc) && /md:bottom-6/.test(dockSrc) && /top-auto/.test(dockSrc),
  "thiếu một nhánh là dock trôi khỏi khung nhìn ở đúng breakpoint đó",
);
check(
  "mobile dùng safe-area ở đáy (không bị thanh home che)",
  /max-md:bottom-\[max\(1rem,env\(safe-area-inset-bottom\)\)\]/.test(dockSrc),
);
check(
  "hai lối mở dùng CHUNG một bảng chọn (không nhân bản danh sách trang)",
  (siteNavSrc.match(/<PagesPanel/g) ?? []).length === 2 &&
    (siteNavSrc.match(/data-testid="pages-menu-panel"/g) ?? []).length === 1,
);
check(
  "hai lối mở loại trừ nhau (mở cái này thì cái kia đóng — không 2 bảng cùng lúc)",
  /protogon:pages-menu-open/.test(siteNavSrc) && /detail !== instanceId/.test(siteNavSrc),
);
// ── AVATAR NGƯỜI DÙNG KHÔNG ĐƯỢC BÓP TRÊN MOBILE (bug 08/10/2026) ──
// Đo bằng Chromium thật: header mobile (logo + bảng chọn + 3 nút ngôn ngữ +
// avatar) vượt container → flex bóp img avatar 32px xuống 22–25px (elip) và
// tràn mép phải @320–360px. Hai luật chặn tái diễn:
//   (1) img avatar + ô chữ cái PHẢI `shrink-0` (không cho flex co),
//   (2) LangSwitch ẩn dưới sm ở header — vẫn đổi được ngôn ngữ vì PagesPanel
//       của SiteNav có LangSwitch đầy đủ.
const dashboardSrc = files.get("pages/Dashboard.tsx") ?? "";
check(
  "avatar header landing có shrink-0 (không bị bóp thành elip khi hàng chật)",
  /h-8 w-8 shrink-0 rounded-full ring-2 ring-primary\/40/.test(landingNavSrc),
);
check(
  "ô chữ cái thay avatar (landing) cũng shrink-0",
  /flex h-8 w-8 shrink-0 items-center/.test(landingNavSrc),
);
check(
  "avatar Dashboard có shrink-0",
  /h-8 w-8 shrink-0 rounded-full ring-2 ring-primary\/50/.test(dashboardSrc) &&
    /flex h-8 w-8 shrink-0 items-center/.test(dashboardSrc),
);
check(
  "LangSwitch ẩn dưới sm ở header landing (giải phóng chỗ cho avatar @320–390px)",
  /<div className="hidden sm:block">\s*<LangSwitch \/>/.test(landingNavSrc),
);
check(
  "LangSwitch ẩn dưới sm ở header Dashboard (cùng lý do như landing)",
  /<div className="hidden sm:block">\s*<LangSwitch \/>/.test(dashboardSrc),
);
check(
  "PagesPanel vẫn có LangSwitch (mobile ẩn hẳn ngôn ngữ khỏi header nhưng vẫn đổi được)",
  /<LangSwitch showIcon/.test(siteNavSrc),
);
// Trang đang mở phải tô đậm được: isNavItemActive phân biệt "/" (chỉ khớp
// chính nó) với "/dashboard" (khớp cả "/dashboard/:guildId").
const activeFn = navSrc.slice(navSrc.indexOf("export function isNavItemActive"));
check(
  "isNavItemActive: '/' chỉ khớp chính nó, trang con khớp theo tiền tố",
  /if \(to === "\/"\) return path === "\/"/.test(activeFn) &&
    /path\.startsWith\(`\$\{to\}\/`\)/.test(activeFn),
);

// Luật lọc theo vai trò + nhãn "đang ở trang nào" được kiểm bằng cách GỌI
// THẬT hàm (không so chuỗi nguồn) ở scripts/test-web-ux-upgrades.ts — nơi bun
// nạp được module TS. Ở đây chỉ chốt thứ đọc được từ văn bản nguồn.

// Thông báo sau khi bật/tắt phải dựa trên giá trị MỚI. `enabled` trong closure là
// giá trị CŨ: dùng nó chọn thông báo thì bật xong hiện "Đã tắt" (bug thật ở
// AltDetectionPanel.toggleEnabled).
const altPanelSrc = files.get("components/dashboard/AltDetectionPanel.tsx") ?? "";
const toggleFn = altPanelSrc.slice(
  altPanelSrc.indexOf("async function toggleEnabled"),
  altPanelSrc.indexOf("async function setPunish"),
);
check(
  "AltDetectionPanel.toggleEnabled: thông báo và giá trị ghi cùng dùng `next` (không dùng closure cũ)",
  /const next = !enabled;/.test(toggleFn) &&
    /altDetectionEnabled: next/.test(toggleFn) &&
    /next \? translate\("Đã bật Alt Detection"\)/.test(toggleFn) &&
    !/\benabled \? translate\(/.test(toggleFn),
);

// Chunk bị xoá sau deploy: main.tsx phải gắn bộ tự tải lại (lib/staleChunk.ts).
const mainSrc = files.get("main.tsx") ?? "";
check(
  "main.tsx gắn installStaleChunkRecovery (tab cũ sau deploy tự tải lại thay vì màn lỗi)",
  /import \{ installStaleChunkRecovery \} from "\.\/lib\/staleChunk"/.test(mainSrc) &&
    /installStaleChunkRecovery\(\);/.test(mainSrc),
);

// ─── P. Bản nháp chưa lưu: mọi panel có nút "Lưu" phải ĐĂNG KÝ bẩn ──────────
// Bug thật 01/10/2026: GuildPage.goToSection gọi confirmLeave() trước khi đổi
// panel, nhưng CHỈ SettingsPanel gọi useUnsavedChanges → dirtyPanels luôn rỗng
// với mọi panel khác → confirmLeave() trả true ngay → người dùng soạn tin
// chào mừng/whitelist rồi bấm sang tab khác là MẤT SẠCH, không hề được hỏi.
// Đúng lớp lỗi mà lib/useUnsavedChanges.ts sinh ra để chặn, nhưng chỉ nối
// được một nút thay vì mọi panel.
// Quy tắc: panel nào giữ bản nháp cục bộ (useState từ data.guild) + có nút
// "Lưu" thì bắt buộc gọi useUnsavedChanges.
const unsavedPanels = [
  "components/dashboard/SettingsPanel.tsx",
  "components/dashboard/WhitelistPanel.tsx",
  "components/dashboard/WelcomePanel.tsx",
];
for (const rel of unsavedPanels) {
  const src = files.get(rel) ?? "";
  check(
    `${rel} đăng ký useUnsavedChanges (đổi panel không mất thay đổi chưa lưu)`,
    /useUnsavedChanges\(/.test(src) && /from "\.\.\/\.\.\/lib\/useUnsavedChanges"/.test(src),
  );
}

// WelcomePanel có 3 ô nháp riêng (embed chào/tạm biệt, DM, autorole) → cả 3
// phải bẩn, không chỉ một.
const welcomeSrc = files.get("components/dashboard/WelcomePanel.tsx") ?? "";
check(
  "WelcomePanel đánh dấu bẩn cả 3 nhóm nháp (embed, DM, autorole)",
  (welcomeSrc.match(/useUnsavedChanges\(/g) ?? []).length >= 3,
);

// Ô nhập số của AutoModPanel: thuộc tính max của <input> KHÔNG chặn gõ tay
// (999 vẫn qua), và backend clamp về 99 → UI hiện 99 trong khi server lưu 99,
// hai bên lệch nhau mà người dùng không có cách nào biết. Bắt buộc kiểm cả
// trần khi commit chứ không chỉ kiểm min.
const automodSrc = files.get("components/dashboard/AutoModPanel.tsx") ?? "";
const numberInputFn = automodSrc.slice(
  automodSrc.indexOf("onBlur={() => {"),
  automodSrc.indexOf('e.key === "Enter"'),
);
check(
  "AutoModPanel NumberInput kiểm cả trần `max` khi commit (không chỉ kiểm min)",
  /max !== undefined && n > max/.test(numberInputFn),
);

// Cùng file: setTiers/setRepeat/setStrikes ghi TRƯỚC khi mutation xong và
// nuốt lỗi trong patchHeatSettings → lưu hỏng thì ô nhập mãi hiện giá trị mà
// server chưa nhận, người dùng tin là đã lưu trong khi bot vẫn chạy ngưỡng cũ.
check(
  "AutoModPanel hoàn nguyên ngưỡng khi lưu hỏng (setTiers/setRepeat/setStrikes có nhánh !ok)",
  /const ok = await patchHeatSettings\(next\);\s*if \(!ok\) setTiers\(prev\);/.test(automodSrc) &&
    /const ok = await patchHeatSettings\(\{[\s\S]*?if \(!ok\) setRepeat\(prev\);/.test(
      automodSrc,
    ) &&
    /catch \(e\) \{\s*setStrikes\(prev\);/.test(automodSrc) &&
    /patchHeatSettings\([\s\S]*?\): Promise<boolean>/.test(automodSrc),
);

// useCountUp: durationMs <= 0 làm (now - started) / 0 ra NaN khi hai lần gọi
// trùng mili-giây → setValue(NaN) → màn hình hiện chữ "NaN" và vòng đếm không
// bao giờ dừng (from === target không bao giờ đúng).
const motionSrc = files.get("lib/motion.ts") ?? "";
check(
  "useCountUp không bao giờ set NaN khi durationMs <= 0 (chia cho 0 khi trùng ms)",
  /const t = durationMs > 0 \? Math\.min\(1, \(now - started\) \/ durationMs\) : 1;/.test(
    motionSrc,
  ),
);

// Lỗi từ backend được GHI VÀO DB (convex/hidden.ts: postError/dmError) rồi
// dashboard hiện ra. Trước đây 3 panel render giá trị thô → khi backend rơi
// về fallback "Lỗi không xác định", người dùng EN/DE đọc tiếng Việt giữa
// giao diện đã dịch. Nay bọc translate() — an toàn với mọi chuỗi vì không có
// key thì trả nguyên bản.
for (const rel of [
  "components/dashboard/ReactionRolesPanel.tsx",
  "components/dashboard/GiveawayPanel.tsx",
  "components/dashboard/DmPanel.tsx",
]) {
  const src = files.get(rel) ?? "";
  check(
    `${rel} render lỗi backend qua translate() (không lọt tiếng Việt cho EN/DE)`,
    /translate\(\s*(?:p\.postError|g\.postError|data\.guild\.dmError)\s*\)/.test(src),
  );
}

// Key fallback mà backend ghi vào DB phải có mặt trong từ điển — xoá nhầm là
// mất bản dịch mà không có gì báo.
for (const rel of ["lib/i18n.en.labels.ts", "lib/i18n.de.labels.ts"]) {
  const src = files.get(rel) ?? "";
  check(
    `${rel} còn key "Lỗi không xác định" (backend ghi vào DB)`,
    src.includes("Lỗi không xác định"),
  );
}

// ─── Q. Cổng gitleaks + trần timeout CI: chặn việc "vô hiệu hoá" âm thầm ───
//
// (1) `useDefault = true` là BẮT BUỘC trong .gitleaks.toml. Đã thử bỏ: gitleaks
// hiểu config là bộ rule HOÀN CHỈNH mới → chạy 0 rule → "no leaks found" dù có
// secret thật trong repo. Chính vì vậy mọi lần gitleaks báo "sạch" phải kèm
// check này, không tin mắt thường.
const gitleaksPath = path.join(ROOT, ".gitleaks.toml");
const gitleaksSrc = fs.existsSync(gitleaksPath) ? fs.readFileSync(gitleaksPath, "utf8") : "";
check(
  ".gitleaks.toml tồn tại và giữ useDefault = true (bỏ là mất SẠT mọi rule)",
  /\[extend\]/.test(gitleaksSrc) && /useDefault\s*=\s*true/.test(gitleaksSrc),
);
// Allowlist theo đường dẫn phải HẸP: chỉ được phép trỏ tới tệp cụ thể đã
// xác minh, không được phủ `scripts/` hay `src/` — nếu không thì lỡ dán
// token thật vào file test thì gitleaks im lặng, đúng lỗi ta muốn chặn.
const pathRules = [...gitleaksSrc.matchAll(/^\s*'''([^']+)''',?\s*$/gm)]
  .map((m) => m[1])
  .filter(
    (p) => !p.includes("123456789012345678") && !p.includes("Zx7pQ2vL9nM4kR8wT1yH3uB6cD5aF0eG"),
  );
check(
  ".gitleaks.toml KHÔNG allowlist rộng theo đường dẫn (không phủ scripts/ hay src/)",
  pathRules.every((p) => /[.^$*+?()[\]{}|\\]/.test(p) || p.includes("flow-field")),
);

// (2) Trần timeout/suite mặc định là 120s nhưng test-browser-contracts điều
// khiển Chromium thật nên phụ thuộc tốc độ runner: đo được 87–100,5s (xanh)
// và 2 lần vượt 120s (đỏ). Job `test` phải nâng trần, nếu không thì CI đỏ theo
// vận may và mỗi lần đỏ lại chặn luôn job deploy.
const ciSrc = fs.readFileSync(path.join(ROOT, ".github", "workflows", "ci.yml"), "utf8");
const timeoutMatches = [...ciSrc.matchAll(/TEST_SUITE_TIMEOUT_MS:\s*"?(\d+)"?/g)].map((m) =>
  Number(m[1]),
);
check(
  "ci.yml đặt TEST_SUITE_TIMEOUT_MS cho job test (Chromium thật cần biên an toàn)",
  timeoutMatches.length > 0 && timeoutMatches.every((ms) => ms >= 240_000),
);

// Ghi chú thay đổi: test-browser-contracts vẫn phải FAIL (không im lặng xanh)
// khi thiếu Chromium — nâng trần không được biến lỗi môi trường thành xanh.
const browserSrc = fs.readFileSync(
  path.join(ROOT, "scripts", "test-browser-contracts.cjs"),
  "utf8",
);
check(
  "test-browser-contracts vẫn báo lỗi khi thiếu Chromium (nâng trần không được che lỗi)",
  /Chromium/.test(browserSrc) && /process\.exit|throw/.test(browserSrc),
);

// (2b) dist phải MỚI HƠN nguồn, không chỉ "tồn tại". 07/10/2026: điều kiện cũ
// là existsSync(dist/index.html) → dist để lại từ 05/10 nên suite kiểm tra
// bundle 2 ngày trước;4 test mới đi tìm data-testid="pages-menu" trong bundle
// vẫn còn "taskbar-dock" ⇒4 đỏ oan, còn các test khác có thể XANH GIẢ trên
// code đã bị thay. Không được quay lại kiểm tra thuần tồn tại.
check(
  "test-browser-contracts build lại khi dist CŨ hơn nguồn (không chỉ khi thiếu)",
  /function distNeedsBuild\(\)/.test(browserSrc) &&
    /stat\.mtimeMs < newestSourceMtime\(\)/.test(browserSrc) &&
    !/if \(!fs\.existsSync\(path\.join\(DIST, "index\.html"\)\)\)/.test(browserSrc),
);
// Build xong mà dist vẫn cũ thì môi trường bất thường — chạy tiếp = test đỏ mơ
// hồ không rõ lý do. Cổng này giữ nhánh chặn đứng thay vì im lặng.
check(
  "test-browser-contracts chặn đứng khi build xong mà dist vẫn cũ",
  /vẫn không mới hơn nguồn sau khi build/.test(browserSrc),
);

// (3) test-browser-contracts KHÔNG ĐƯỢC treo. Trần 120s của runner từng che
// một lỗi thật: `Cdp.send()` lưu promise vào `pending` rồi chờ browser trả
// lời mãi — renderer treo là CẢ SUITE đứng, không test nào báo kết quả. Đã
// xảy ra 2 lần (đỏ ở 120s, rồi đỏ ở 300s khi nâng trần) và cả hai lần đều
// dừng im ở test E, không báo test nào hỏng. Nay mỗi lệnh CDP có trần riêng
// nên treo sẽ báo ĐÚNG TÊN lệnh thay vì im lặng.
const browserSuiteSrc = fs.readFileSync(
  path.join(ROOT, "scripts", "test-browser-contracts.cjs"),
  "utf8",
);
const cdpSendFn = browserSuiteSrc.slice(
  browserSuiteSrc.indexOf("  send(method, params = {}"),
  browserSuiteSrc.indexOf("  once(method)"),
);
check(
  "Cdp.send() có trần thời gian (không chờ browser vô hạn)",
  /setTimeout\(/.test(cdpSendFn) && /reject\(/.test(cdpSendFn),
);
check(
  "Cdp.send() dọn entry pending khi hết trần (không phình vô hạn)",
  /this\.pending\.delete\(id\)/.test(cdpSendFn),
);
const pageCloseStart = browserSuiteSrc.indexOf(
  "  async close() {",
  browserSuiteSrc.indexOf("class Page"),
);
const pageCloseFn = browserSuiteSrc.slice(
  pageCloseStart,
  browserSuiteSrc.indexOf("\n}", pageCloseStart),
);
check(
  "Page.close() có trần ngắn (t.after không treo cả suite)",
  // `Page.close", {}, 5000` — số phải đứng SAU object rỗng, nên không neo
  // `\s*\d+` ngay sau dấu phẩy (bản đầu neo sai chỗ nên báo FAIL giả).
  /Page\.close"[\s\S]*?\b\d{3,}\b/.test(pageCloseFn) || /setTimeout/.test(pageCloseFn),
);
// Assert lặp NGUYÊN DÒNG là code chết: chạy hai lần cũng cho cùng kết quả,
// chỉ làm chậm và gây hiểu nhầm là còn ca kiểm thứ hai. Chỉ xét assert viết
// trọn một dòng (kết thúc bằng `);`) — assert xuống dòng có mỗi dòng mở đầu
// giống nhau nên đếm theo dòng sẽ báo động giả.
const assertCounts = new Map();
for (const raw of browserSuiteSrc.split("\n")) {
  const line = raw.trim();
  if (!line.startsWith("t.assert.") || !line.endsWith(");")) continue;
  assertCounts.set(line, (assertCounts.get(line) ?? 0) + 1);
}
const dupAsserts = [...assertCounts.entries()]
  .filter(([, n]) => n > 1)
  .map(([line, n]) => `${n}x ${line}`);
check(
  "test-browser-contracts không có assert lặp lặp nguyên dòng",
  dupAsserts.length === 0,
  dupAsserts.slice(0, 2).join(" | "),
);
// Tài liệu KHÔNG được chứa giá trị hình dạng credential. Job `security` đã
// bắt đúng trường hợp này (17s, rule `discord-client-id` bám vào
// docs/agent-journal.md vì tôi dán giá trị giả khi viết RED-PROOF), nhưng chờ
// CI thì chậm — check này bắt ngay ở `bun run test`. Cố tình KHÔNG allowlist:
// vá bằng allowlist sẽ làm mờ đúng cái cổng gác đang cố giữ.
const CREDENTIAL_SHAPED =
  /(?:discord[-_ ]?client[-_ ]?id|client[-_ ]?secret|api[-_ ]?key|access[-_ ]?token)["'\s:=]{1,6}[0-9A-Za-z_-]{18,}/i;
const docLeaks = fs
  .readdirSync(path.join(ROOT, "docs"))
  .filter((f) => f.endsWith(".md"))
  .flatMap((f) =>
    fs
      .readFileSync(path.join(ROOT, "docs", f), "utf8")
      .split("\n")
      .map((text, i) => ({ text, at: i + 1 }))
      .filter(({ text }) => CREDENTIAL_SHAPED.test(text))
      .map(({ at }) => `${f}:${at}`),
  );
check(
  "docs/*.md không dán giá trị hình dạng credential (job security sẽ đỏ)",
  docLeaks.length === 0,
  docLeaks.slice(0, 3).join(" | "),
);

// ══ R. Đồng hồ hệ thống (đợt #1 observability) ══
// Cái bẫy đã dính khi viết metrics.js: `registry.getMetricsAsJSON()` trả
// histogram THEO TỪNG BUCKET (mỗi bucket một dòng, có `value` chứ không có
// `count`/`sum`), và counter đặt nhãn ở tầng MetricObject chứ không ở từng
// value. Đọc sai chỗ đó cho ra snapshot RỖNG mà không báo lỗi — số đo rỗng
// nhìn y hệt "bot chưa làm gì", tức là im lặng đúng kiểu nguy hiểm nhất.
// Nay module tự tích luỹ (agg), chỉ dùng prom-client cho đầu ra `/metrics`.
const metricsSrc = fs.readFileSync(path.join(ROOT, "bot", "src", "metrics.js"), "utf8");
const runtimeSrc = fs.readFileSync(path.join(ROOT, "bot", "src", "metricsRuntime.js"), "utf8");
const logIdSrc = fs.readFileSync(path.join(ROOT, "bot", "src", "logId.js"), "utf8");
const convexClientSrc = fs.readFileSync(path.join(ROOT, "bot", "src", "convex.js"), "utf8");
const aiSrc = fs.readFileSync(path.join(ROOT, "bot", "src", "ai.js"), "utf8");
const botIndexSrc = fs.readFileSync(path.join(ROOT, "bot", "src", "index.js"), "utf8");
const botWritesSrc = fs.readFileSync(path.join(ROOT, "convex", "bot_writes.ts"), "utf8");
// Đợt #5: thân hàm tách sang convex/bot_writes/metrics.ts (wrapper giữ nguyên).
const botMetricsSrc = fs.readFileSync(
  path.join(ROOT, "convex", "bot_writes", "metrics.ts"),
  "utf8",
);
const botPkg = JSON.parse(fs.readFileSync(path.join(ROOT, "bot", "package.json"), "utf8"));

check(
  "bot/package.json khai báo prom-client (thiếu thì require() ném lúc khởi động)",
  typeof botPkg.dependencies?.["prom-client"] === "string",
);
// Bỏ comment (dòng `//` và khối) trước khi kiểm tra mã — nếu không, chính dòng
// comment giải thích "vì sao KHÔNG dùng X" sẽ làm check đỏ.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
check(
  "metrics.js KHÔNG parse getMetricsAsJSON (trả số đo rỗng im lặng)",
  !/getMetricsAsJSON/.test(stripComments(metricsSrc)),
);
check(
  "metrics.js tự tích luỹ snapshot (có agg + đếm/sum)",
  /\bagg\b/.test(metricsSrc) && /sumSec/.test(metricsSrc),
);
check(
  "metrics.js có trần cardinality (nhãn động không phình RAM)",
  /MAX_AGG_KEYS/.test(metricsSrc),
);
check(
  "metricsRuntime in /metrics ra stdout và có nút tắt METRICS=0",
  /render\(\)/.test(runtimeSrc) && /METRICS/.test(runtimeSrc),
);
check(
  "logId.js dual-write (dòng text + dòng JSON có tiền tố lọc được)",
  /AsyncLocalStorage/.test(logIdSrc) && /JSON_PREFIX/.test(logIdSrc),
);
check(
  "withRetry đo TẬP TRUNG mọi lời gọi Convex (không rải từng chỗ gọi)",
  /metrics\.count\("convex", label/.test(convexClientSrc),
);
check(
  "AI đo từng lượt gọi provider (token + độ trễ + lỗi)",
  /observeAiCall/.test(aiSrc) && /observeAiFailure/.test(aiSrc),
);
check(
  "index.js bật metrics khi sẵn sàng và dừng (đẩy mẫu cuối) lúc thoát",
  /startMetrics\(\{ client, store \}\)/.test(botIndexSrc) &&
    /stopMetrics\?\.\(\)/.test(botIndexSrc),
);
check(
  "schema.ts có bảng botMetrics (nơi DUY NHẤT giữ số đo phía server)",
  /botMetrics: defineTable\(/.test(schemaSrc),
);
check(
  "mutation botRecordMetrics có khoá botKey (không ai cũng ghi được số đo)",
  /export const botRecordMetrics = mutation\(/.test(botWritesSrc) &&
    /requireBotKeyStrict\(ctx, args\.botKey\)/.test(
      botMetricsSrc.slice(botMetricsSrc.indexOf("export async function botRecordMetricsHandler")),
    ),
);
check(
  "mutation botRecordMetrics tự dọn lịch sử (bảng không phình vô hạn)",
  /METRICS_HISTORY_CAP/.test(botMetricsSrc),
);

// ══ S. Tiền AI + hạn mức ngân sách (đợt #2) ══
// Điều kiện mà cổng này canh là điều kiện làm MẤT TIỀN MÀ KHÔNG BIẾT:
//  1. provider chưa có trong bảng giá phải trả `known:false` chứ KHÔNG phải 0
//     (0 trông y hệt "miễn phí" và làm hạn mức không bao giờ kích hoạt);
//  2. vượt hạn mức chỉ được HẠ provider trả phí, tuyệt đối không chặn gọi —
//     chặn cứng biến "hết tiền" thành "mất chống raid".
const pricingSrc = fs.readFileSync(path.join(ROOT, "bot", "src", "aiPricing.js"), "utf8");
const evalSrc = fs.readFileSync(path.join(ROOT, "scripts", "test-ai-raid-eval.mjs"), "utf8");
check(
  "aiPricing: gateway tùy chỉnh để giá NULL (không bị điền 0)",
  /"custom-gateway":\s*\{\s*prompt:\s*null/.test(pricingSrc),
);
check(
  "aiPricing: estimateCost trả known=false khi thiếu usage (không bịa 0)",
  /known:\s*false/.test(pricingSrc) && /gateway không trả usage/.test(stripComments(pricingSrc)),
);
check(
  "aiPricing: có hạn mức ngày + cờ overBudget",
  /AI_DAILY_BUDGET_USD/.test(pricingSrc) && /overBudget/.test(pricingSrc),
);
check(
  "ai.js chỉ HẠ provider trả phí khi vượt hạn mức, KHÔNG chặn lời gọi",
  /shouldDeprioritizeForBudget/.test(aiSrc) && !/if \(overBudget\(\)\) return null/.test(aiSrc),
);
check("ai.js đưa tiền vào metrics (costUsd) chứ không chỉ đo thời gian", /costUsd/.test(aiSrc));
check("aiStats() trả budget cho dashboard", /budget: aiPricing\(\)\.budgetSummary\(\)/.test(aiSrc));
check(
  "schema khai báo budget (số tiền có chỗ lưu, không bị chặn validator)",
  /budget: v\.optional\(/.test(schemaSrc),
);
check(
  "Cổng độ chính xác tách OFFLINE (hạ tầng) khỏi SAI (độ chính xác)",
  /offlineCount/.test(evalSrc) && /AI_EVAL_GATE/.test(evalSrc),
);
check(
  "test-ai-accuracy có ngân sách prompt (chặn prompt phình làm tăng hoá đơn)",
  /PROMPT_BUDGET_CHARS/.test(
    fs.readFileSync(path.join(ROOT, "scripts", "test-ai-accuracy.cjs"), "utf8"),
  ),
);
check(
  "ci.yml chạy đánh giá AI live (bỏ qua khi thiếu key)",
  /test-ai-raid-eval\.mjs/.test(
    fs.readFileSync(path.join(ROOT, ".github", "workflows", "ci.yml"), "utf8"),
  ),
);

// ══ T. Trần thời gian cho mọi lời gọi ra ngoài (đợt #3) ══
// Sự cố CI 02/10 treo vì `Cdp.send()` chờ browser MÃI. Cùng mẫu bệnh đó nằm ở
// `ConvexHttpClient` (không có trần mặc định) và ở hai chỗ `fetch` phía Convex.
// Cổng này quét MỌI `fetch(` trong `bot/src` + `convex/` và đòi option `signal`
// trong cùng lời gọi — vì `fetch` không có signal là treo vô hạn, và treo ở
// luồng chống raid nghĩa là mất chống raid.
const resilienceSrc = fs.readFileSync(path.join(ROOT, "bot", "src", "resilience.js"), "utf8");
const fetchSites = [];
for (const dir of [path.join(ROOT, "bot", "src"), path.join(ROOT, "convex")]) {
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "_generated" || entry.name === "node_modules") continue;
        walk(full);
        continue;
      }
      if (!/\.(c|m)?[jt]s$/.test(entry.name)) continue;
      const lines = fs.readFileSync(full, "utf8").split("\n");
      lines.forEach((line, i) => {
        // Chỉ lời gọi `fetch(` thật, không phải `guild.members.fetch(` của
        // discord.js (thư viện đó đã tự có trần + retry riêng).
        const m = /(?:^|[^\w.])fetch\(/.exec(line);
        if (!m) return;
        if (/^\s*(\/\/|\*)/.test(line)) return;
        // KHỚP NGOẶC, không đếm dòng: lời gọi fetch thật trải 20+ dòng
        // (headers + body + signal), cửa sổ N dòng sẽ báo nhầm. Từ dấu `(` của
        // chính lời gọi này, đếm cho tới ngoặc đóng cân bằng → lấy đúng toàn
        // bộ lời gọi rồi mới tìm `signal`.
        const rest = lines.slice(i).join("\n");
        const openAt = rest.indexOf("(", (m.index ?? 0) + m[0].indexOf("fetch"));
        let depth = 0;
        let endAt = -1;
        for (let k = openAt; k < rest.length; k++) {
          if (rest[k] === "(") depth++;
          else if (rest[k] === ")") {
            depth--;
            if (depth === 0) {
              endAt = k;
              break;
            }
          }
        }
        const call = endAt > openAt ? rest.slice(openAt, endAt + 1) : rest.slice(0, 400);
        if (/signal|Signal/.test(call)) return;
        fetchSites.push(`${path.relative(ROOT, full)}:${i + 1}`);
      });
    }
  };
  walk(dir);
}
check(
  "mọi `fetch(` trong bot/src + convex/ đều có trần thời gian (signal)",
  fetchSites.length === 0,
  fetchSites.slice(0, 4).join(" | "),
);
check(
  "resilience.js không dùng AbortSignal.timeout (timer unref → chết im lặng)",
  !/AbortSignal\.timeout/.test(stripComments(resilienceSrc)),
);
check(
  "resilience.js có backoff có jitter (chống dồn cục khi thử lại)",
  /backoffDelayMs/.test(resilienceSrc) && /jitter/.test(resilienceSrc),
);
check(
  "lỗi quá hạn mang code ETIMEDOUT (khớp withRetry coi là đáng thử lại)",
  /code = "ETIMEDOUT"|"ETIMEDOUT"/.test(resilienceSrc),
);
check(
  "ConvexStore bọc fetch có trần cho ConvexHttpClient",
  /new ConvexHttpClient\(url, \{/.test(convexClientSrc) && /wrapFetch/.test(convexClientSrc),
);

// ══ U. Suite trình duyệt: MỌI lời chờ ngoài phải có trần (tiếp mục Q.3) ══
// Sự cố CI 02/10: `test-browser-contracts` đỏ ở 300s, output dừng ở `ok 13`,
// KHÔNG nói test nào treo. Mục Q.3 đã bọc trần `Cdp.send()` (sự cố 01/10) nhưng
// suite vẫn treo lại được vì các lời chờ khác chưa có trần: mở WebSocket
// DevTools, `fetch` tới `/json/new` + `/json/list`, và `listen` cổng server tĩnh.
// Một trong số đó không bao giờ trả lời = cả suite đứng im; trần suite của runner
// chỉ CHE lỗi. Cổng này canh từng chỗ, cộng trần riêng cho mỗi test để treo được
// báo ĐÚNG TÊN test thay vì im lặng.
const browserSuiteSrc2 = browserSuiteSrc; // đọc ở mục Q.3, dùng lại
const sliceAt = (startMarker, endMarker) => {
  const a = browserSuiteSrc2.indexOf(startMarker);
  if (a === -1) return "";
  const b = browserSuiteSrc2.indexOf(endMarker, a + startMarker.length);
  return browserSuiteSrc2.slice(a, b === -1 ? a + 700 : b);
};
const withCeilingFn = sliceAt("function withCeiling", "\n}");
check(
  "withCeiling() dùng timer THẬT (không AbortSignal.timeout — timer unref → trần không cháy)",
  /setTimeout\(/.test(withCeilingFn) &&
    /clearTimeout\(timer\)/.test(withCeilingFn) &&
    !/AbortSignal\.timeout/.test(withCeilingFn),
);
check(
  "Cdp.connect() có trần khi mở WebSocket DevTools (không chờ vô hạn)",
  /withCeiling\(/.test(sliceAt("static async connect", "_onMessage")) &&
    /CDP_CONNECT_TIMEOUT_MS/.test(sliceAt("static async connect", "_onMessage")),
);
// Neo vào URL thật của lời gọi, không phải " /json/new" trong comment phía trên
// (bản đầu neo vào lần xuất hiện ĐẦU TIÊN — câu comment — nên báo FAIL giả).
const jsonNewAt = browserSuiteSrc2.indexOf("/json/new?about:blank");
const jsonListAt = browserSuiteSrc2.indexOf("/json/list`");
check(
  "fetch /json/new (openPage) và /json/list (tìm cổng debug) đều có trần",
  jsonNewAt > 0 &&
    jsonListAt > 0 &&
    browserSuiteSrc2.slice(jsonNewAt - 260, jsonNewAt).includes("withCeiling(") &&
    browserSuiteSrc2.slice(jsonListAt - 260, jsonListAt).includes("withCeiling("),
);
check(
  "listen cổng server tĩnh có trần (không treo ở setup)",
  /withCeiling\(startServer\(port\)/.test(browserSuiteSrc2),
);
check(
  "mỗi test trình duyệt có trần RIÊNG (treo báo đúng tên, không giết cả suite im lặng)",
  /rawBrowserTest\(name,\s*\{\s*timeout:\s*BROWSER_TEST_TIMEOUT_MS/.test(browserSuiteSrc2),
);
const gotoFn = sliceAt("async goto(url)", "async tab()");
check(
  "goto() dọn timer 20s (không giữ event loop sau mỗi lần mở trang)",
  /clearTimeout\(timer\)/.test(gotoFn) && /unref/.test(gotoFn),
);
const closeFn = browserSuiteSrc2.slice(
  browserSuiteSrc2.indexOf("  async close() {"),
  browserSuiteSrc2.indexOf("  async close() {") + 700,
);
check(
  "Cdp.close() đóng WebSocket trong finally (socket mở giữ event loop sống)",
  /finally\s*\{[\s\S]*this\.dispose\(\)/.test(closeFn),
);
const teardownFn = sliceAt("function teardown()", "\nconst OVERLAY_STATE");
check(
  "teardown đóng WebSocket CDP cấp trình duyệt + keep-alive (suite thoát, không treo phút cuối)",
  /\.dispose\(\)/.test(teardownFn) && /closeAllConnections/.test(teardownFn),
);

// ── Danh sách placeholder phải KHỚP bot, không được trôi lệch âm thầm ──
//
// Lý do: `fillPreviewSample` (preview) và `fillTemplate` (bot) là hai bản sao
// cùng một danh sách. Lệch một bên thì preview hứa một đằng, bot gửi một nẻo —
// người dùng tin preview, bấm lưu, rồi ra server thấy chữ `{joined}` hiện
// nguyên. Đây là lỗi âm thầm đúng kiểu repo này cấm.
{
  // Nguồn bot nằm NGOÀI src/ nên phải đọc thẳng — `files` chỉ khoá theo đường dẫn
  // tương đối tới src/, tra "bot/..." sẽ ra chuỗi rỗng và biến assert thành no-op.
  const botSrc = fs.readFileSync(
    path.join(__dirname, "..", "bot", "src", "handlers", "welcome.js"),
    "utf8",
  );
  const panelSrc = files.get("components/dashboard/WelcomePanel.tsx") ?? "";
  const previewSrc = files.get("components/dashboard/GreetingPreview.tsx") ?? "";
  const grab = (src, re) => [...new Set(src.match(re) ?? [])].sort();
  const botTokens = grab(botSrc, /"\{[a-z]+\}"/g);
  const panelTokens = grab(panelSrc, /"\{[a-z]+\}"/g);
  const previewTokens = grab(previewSrc, /"\{[a-z]+\}"/g);
  // So SẴNG BẰNG, không phải ⊆: thiếu một chiều cũng là lỗi.
  //  - panel có biến bot không thay → preview HỨA SAI, ra server thấy chữ thô.
  //  - bot có biến panel chưa có → người dùng không chèn được biến đó.
  check(
    "placeholder panel khớp CHÍNH XÁC danh sách bot hỗ trợ (chip bấm-chèn không trôi lệch)",
    JSON.stringify(panelTokens) === JSON.stringify(botTokens),
    `panel=${JSON.stringify(panelTokens)} bot=${JSON.stringify(botTokens)}`,
  );
  check(
    "placeholder preview khớp CHÍNH XÁC danh sách bot hỗ trợ (preview không hứa sai)",
    JSON.stringify(previewTokens) === JSON.stringify(botTokens),
    `preview=${JSON.stringify(previewTokens)} bot=${JSON.stringify(botTokens)}`,
  );
}

// ─── 13. CSP / header bảo mật: MỘT nguồn duy nhất + có hiệu lực cả bản tĩnh ───
// Vì sao test: header bảo mật từng chỉ có ở vercel.json + Dockerfile.web, còn
// đường phát production thật (hosting tĩnh) KHÔNG cấu hình được header HTTP →
// bản deploy chạy với CSP rỗng. Ba lớp bị kiểm ở đây:
//   a. `scripts/security-headers.cjs` là nguồn duy nhất; CSP ở vercel.json và
//      Dockerfile.web phải khớp CHÍNH XÁC nó (đổi một nơi mà quên nơi khác =
//      CI đỏ, không thể âm thầm nới lỏng CSP ở nơi duy nhất ai đó nhớ).
//   b. `injectSecurityMeta` (dùng ở `scripts/build.mjs`) phải chèn được meta CSP
//      vào index.html THẬT: idempotent, nằm trong <head>, TRƯỚC mọi <script>.
//   c. CSP không được nới: không `unsafe-inline`/`unsafe-eval`/`*` cho script,
//      `connect-src` phải phủ Convex (https + wss) và Discord OAuth.
{
  const sec = require(path.join(ROOT, "scripts", "security-headers.cjs"));
  const buildShim = fs.readFileSync(path.join(ROOT, "scripts", "build.mjs"), "utf8");
  const dockerText = fs.readFileSync(path.join(ROOT, "Dockerfile.web"), "utf8");

  const vercelCsp =
    (vercelJson.headers ?? [])
      .find((group) => (group.headers ?? []).some((h) => h.key === "Content-Security-Policy"))
      ?.headers.find((h) => h.key === "Content-Security-Policy")?.value ?? "";
  const nginxCsp =
    (dockerText.match(/add_header Content-Security-Policy \\"([^"]+)\\"/) || [])[1] ?? "";

  check(
    "CSP ở vercel.json khớp CHÍNH XÁC nguồn duy nhất (scripts/security-headers.cjs)",
    vercelCsp.trim() === sec.CSP.trim(),
    `vercel=${vercelCsp.slice(0, 60)}… nguồn=${sec.CSP.slice(0, 60)}…`,
  );
  check(
    "CSP ở Dockerfile.web (nginx) khớp CHÍNH XÁC nguồn duy nhất",
    nginxCsp.trim() === sec.CSP.trim(),
    `nginx=${nginxCsp.slice(0, 60)}… nguồn=${sec.CSP.slice(0, 60)}…`,
  );

  // (c) CSP không được nới — kiểm trên chính nguồn duy nhất.
  const scriptSrc = sec.CSP_DIRECTIVES.find(([d]) => d === "script-src")?.[1] ?? [];
  const connectSrc = sec.CSP_DIRECTIVES.find(([d]) => d === "connect-src")?.[1] ?? [];
  const imgSrc = sec.CSP_DIRECTIVES.find(([d]) => d === "img-src")?.[1] ?? [];
  check(
    "script-src chỉ 'self' (không unsafe-inline/unsafe-eval/wildcard)",
    scriptSrc.length === 1 && scriptSrc[0] === "'self'",
    JSON.stringify(scriptSrc),
  );
  check(
    "connect-src phủ Convex (https + wss) và Discord OAuth",
    [
      "https://*.convex.cloud",
      "https://*.convex.site",
      "wss://*.convex.cloud",
      "wss://*.convex.site",
      "https://discord.com",
    ].every((origin) => connectSrc.includes(origin)),
    JSON.stringify(connectSrc),
  );
  check("img-src cho phép ảnh Discord CDN qua https:", imgSrc.includes("https:"));
  check(
    "object-src 'none' + base-uri 'self' (chặn plugin & base-tag injection)",
    sec.CSP.includes("object-src 'none'") && sec.CSP.includes("base-uri 'self'"),
  );
  check(
    "CSP meta BỎ frame-ancestors (meta không hỗ trợ directive này)",
    !sec.CSP_META.includes("frame-ancestors") && sec.CSP.includes("frame-ancestors 'none'"),
  );

  // (b) Chèn meta vào index.html THẬT — đúng đường build production đi qua.
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const injected = sec.injectSecurityMeta(indexHtml);
  const again = sec.injectSecurityMeta(injected);
  check("chèn meta CSP: idempotent (chạy 2 lần cho cùng kết quả)", injected === again);
  check("chèn meta CSP: có thẻ meta trong <head>", injected.includes(sec.cspMetaTag()));
  const headEnd = injected.toLowerCase().indexOf("</head>");
  const firstScript = injected.search(/<script/i);
  check(
    "chèn meta CSP: nằm trong <head> và TRƯỚC mọi <script>",
    injected.indexOf(sec.cspMetaTag()) < headEnd &&
      (firstScript === -1 || injected.indexOf(sec.cspMetaTag()) < firstScript),
  );
  check(
    "chèn meta CSP: html không có <head> → trả nguyên bản (không phá file)",
    sec.injectSecurityMeta("<div>x</div>") === "<div>x</div>",
  );

  // (a-bis) build.mjs phải THẬT SỰ gọi hai bước trên, nếu không artifact vẫn
  // không có header dù hàm đúng.
  check(
    "build.mjs gọi injectSecurityMeta + ghi dist/_headers",
    /injectSecurityMeta\(html\)/.test(buildShim) &&
      /writeFileSync\(path\.join\("dist", "_headers"\)/.test(buildShim),
  );
  const headersFile = sec.securityHeadersFile();
  check(
    "dist/_headers chứa đủ header bảo mật (CSP + nosniff + frame + referrer + HSTS)",
    sec.SECURITY_HEADERS.every(([name]) => headersFile.includes(`${name}:`)) &&
      /^\/\*\n/.test(headersFile),
  );
  check(
    "_headers + vercel.json + nginx dùng CÙNG danh sách giá trị header",
    sec.SECURITY_HEADERS.every(([name, value]) =>
      name === "Content-Security-Policy"
        ? true
        : dockerText.includes(value) &&
          (vercelJson.headers ?? []).some((g) =>
            (g.headers ?? []).some((h) => h.key === name && h.value === value),
          ),
    ),
  );
}

// ─── N. Ảnh tĩnh trỏ từ src/ phải tồn tại THẬT trong public/ ────────────────
// Bug câm: `src="/ten-sai.png"` vẫn bundle sạch, không làm build đỏ — chỉ hiện
// icon ảnh vỡ trên production. Với ảnh QR ủng hộ thì đó là lúc khách bấm vào để
// chuyển tiền. Mọi đường dẫn tĩnh trong src bị đối chiếu với đĩa.
const ASSET_RE = /(?:src|href)="(\/[^"]+\.(?:png|jpe?g|webp|svg|ico|gif))"/g;
const missingAssets = [];
for (const [rel, src] of files) {
  for (const m of src.matchAll(ASSET_RE)) {
    if (!fs.existsSync(path.join(ROOT, "public", m[1].replace(/^\//, "")))) {
      missingAssets.push(`${rel} → ${m[1]}`);
    }
  }
}
check(
  "mọi ảnh tĩnh trỏ từ src/ đều có file thật trong public/",
  missingAssets.length === 0,
  missingAssets.join(", "),
);

// Trang /donate: khối QR ví cá nhân là kênh duy nhất người CHƯA đăng nhập dùng
// được (ZaloPay checkout bắt buộc đăng nhập). Mất khối hoặc mất ảnh = mất đường
// ủng hộ đó mà không có gì báo, nên khoá cả hai phía: ảnh được render trong
// DonatePage kèm nhãn đã qua translate(), và file JPEG thật trên đĩa.
const donateSrc = files.get("pages/DonatePage.tsx") ?? "";
check(
  "trang /donate render mã QR ví cá nhân (/payment.jpg) trong khối đã dịch",
  donateSrc.includes('src="/payment.jpg"') &&
    donateSrc.includes('translate("Ủng hộ trực tiếp bằng mã QR")'),
  "ảnh /payment.jpg hoặc khối QR đã bị gỡ khỏi DonatePage.tsx",
);
check(
  "public/payment.jpg là ảnh JPEG thật (không rỗng, không hỏng)",
  (() => {
    const p = path.join(ROOT, "public", "payment.jpg");
    if (!fs.existsSync(p)) return false;
    const buf = fs.readFileSync(p);
    return buf.length > 1000 && buf[0] === 0xff && buf[1] === 0xd8;
  })(),
  "thiếu file hoặc không phải ảnh JPEG",
);

// ─── V. Lỗi 07/10/2026: avatar upload + lỗi thanh toán + luồng ZaloPay ─────
// 1) Avatar: file thô KHÔNG được lên Convex storage — BrandingPanel phải đi
//    qua normalizeAvatarFile (co ≤512px, chặn file không decode được). Bug:
//    avatar Haimiya 3600×2025 ~1.1MB cho khung 192px → điện thoại hiện sọc nhăng.
const brandPanelSrc = files.get("components/dashboard/BrandingPanel.tsx") ?? "";
check(
  "upload avatar đã qua normalizeAvatarFile (chuẩn hoá ≤512px, chặn file hỏng)",
  brandPanelSrc.includes("await normalizeAvatarFile(file)") && brandPanelSrc.includes("body: blob"),
  "BrandingPanel upload file thô — ảnh to/vỡ sẽ lên production rồi vỡ ở trang chủ",
);

// 2) Lỗi Convex phải bóc qua friendlyConvexError — không trang nào còn in
//    envelope "[Request ID: …] Server Error" hay regex Uncaught riêng lẻ.
const uncaughtLeftovers = [...files.entries()]
  .filter(([, src]) => src.includes("replace(/^Uncaught"))
  .map(([rel]) => rel);
check(
  "không trang nào còn tự bóc lỗi Convex bằng regex Uncaught cũ",
  uncaughtLeftovers.length === 0,
  uncaughtLeftovers.join(", "),
);
for (const rel of ["pages/DonatePage.tsx", "pages/PremiumPage.tsx", "pages/FeedbackPage.tsx"]) {
  check(
    `${rel} hiện lỗi qua friendlyConvexError (fallback đã dịch)`,
    (files.get(rel) ?? "").includes("friendlyConvexError("),
  );
}

// 3) Luồng ZaloPay yêu cầu đăng nhập, QR tĩnh thì công khai CÓ NGHĨA — khoá
//    ranh giới bảo mật này: QR là ảnh tĩnh gửi tiền thẳng vào ví chủ, không qua
//    server; còn tạo đơn ZaloPay (gọi API, rate-limit tại ZaloPay) phải qua phiên.
const premiumSrc = files.get("pages/PremiumPage.tsx") ?? "";
check(
  "tạo đơn ZaloPay trên /donate bắt buộc có token phiên (chưa đăng nhập → /auth)",
  donateSrc.includes("if (!token)") && donateSrc.includes("/auth?returnTo="),
  "DonatePage cho phép gọi startPayment không cần đăng nhập",
);
check(
  "tạo đơn ZaloPay trên /premium cũng bắt buộc token phiên",
  premiumSrc.includes("if (!token)") && premiumSrc.includes("/auth?returnTo="),
  "PremiumPage cho phép gọi startPayment không cần đăng nhập",
);
check(
  "khối QR công khai vẫn còn chú thích 'không cần đăng nhập' + tên chủ ví (cân bằng minh bạch)",
  donateSrc.includes("Không cần đăng nhập, không qua cổng thanh toán"),
  "chuỗi minh bạch khối QR bị xoá — khách không biết tiền đi đâu",
);

// ─── W. Plan A — mua bằng chuyển khoản ngân hàng (08/10/2026) ───────────────
// Tiền về ví cá nhân, KHÔNG có webhook: quyền lợi chỉ được ghi khi chủ bot so
// sao kê rồi bấm xác nhận. Cổng này khoá hai điều dễ vỡ nhất: (1) client không
// bao giờ được tự cấp Premium, và (2) trang mua phải nói rõ cam kết ≤24h, nơi
// báo khi chậm, hoàn tiền và căn cứ pháp lý — thiếu một mục là khách không có
// cơ sở khiếu nại.
check(
  "PremiumPage tạo mã CK riêng từng đơn (createTransferIntent)",
  premiumSrc.includes("api.payments.createTransferIntent"),
  "PremiumPage không tạo được mã chuyển khoản",
);
check(
  "PremiumPage khách tự báo đã CK (reportTransfer)",
  premiumSrc.includes("api.payments.reportTransfer"),
  "thiếu nút/luồng báo đã chuyển khoản",
);
// Liệt kê CHÍNH XÁC mọi hàm payments trang này gọi — chỉ được là các hàm của
// luồng CK (tạo mã, báo, đọc trạng thái). Một hàm ghi quyền lợi lọt vào danh
// sách này là client tự cấp Premium (đã từng là rủi ro thật).
const premiumApiCalls = [...premiumSrc.matchAll(/api\.payments\.(\w+)/g)].map((m) => m[1]);
const PREMIUM_ALLOWED_API = new Set([
  "createTransferIntent",
  "reportTransfer",
  "orderStatus",
  "premiumStatus",
]);
check(
  "PremiumPage theo dõi trạng thái ĐƠN CỦA CHÍNH MÌNH (orderStatus) + chỉ gọi API luồng CK",
  premiumSrc.includes("api.payments.orderStatus") &&
    premiumApiCalls.length > 0 &&
    premiumApiCalls.every((n) => PREMIUM_ALLOWED_API.has(n)),
  `lời gọi lạ: ${premiumApiCalls.filter((n) => !PREMIUM_ALLOWED_API.has(n)).join(", ")}`,
);
check(
  "PremiumPage KHÔNG còn gọi API ZaloPay (startPayment) — đã chuyển hẳn sang CK",
  !premiumSrc.includes("startPayment") && !premiumSrc.includes("api.paymentsAction"),
  "PremiumPage còn sót luồng ZaloPay",
);
check(
  "chính sách cam kết kích hoạt CHẬM NHẤT 24 giờ sau khi xác nhận tiền",
  premiumSrc.includes("chậm nhất 24 giờ") && premiumSrc.includes("xác nhận đã nhận tiền"),
  "mất cam kết 24h — khách không biết thời hạn nhận gói",
);
check(
  "chính sách chỉ rõ nơi báo khi quá 24h (Discord chủ bot + MÃ ĐƠN)",
  premiumSrc.includes("Báo tại Discord kèm mã đơn") && premiumSrc.includes("{ma}"),
  "mất đường khiếu nại kèm mã đơn",
);
check(
  "chính sách có mục hoàn tiền 100% khi lỗi từ phía dịch vụ",
  premiumSrc.includes("Hoàn tiền:") && premiumSrc.includes("HOÀN 100%"),
  "mất cam kết hoàn tiền",
);
check(
  "chính sách có mục thanh toán an toàn (không xin mật khẩu ví/OTP/thẻ)",
  premiumSrc.includes("Thanh toán an toàn:") && premiumSrc.includes("mật khẩu ví"),
  "mất cảnh báo chống lừa đảo",
);
check(
  "chính sách nêu căn cứ pháp lý VN (BLDS 2015 Điều 119 · Luật BVNTD 19/2023/QH15 · TMĐT 51/2005/QH11)",
  premiumSrc.includes("Bộ luật Dân sự 2015 (Điều 119)") &&
    premiumSrc.includes("19/2023/QH15") &&
    premiumSrc.includes("51/2005/QH11"),
  "thiếu căn cứ pháp lý",
);

// ─── X. Admin: đơn chờ xác nhận + tổng doanh thu + quản trị viên nhóm ───────
const adminSrc = files.get("pages/Admin.tsx") ?? "";
check(
  "Admin có hàng chờ đơn CK + tổng doanh thu theo tháng/năm",
  adminSrc.includes("api.payments.listReportedOrders") &&
    adminSrc.includes("api.payments.revenueStats") &&
    adminSrc.includes('translate("Theo tháng")') &&
    adminSrc.includes('translate("Theo năm")'),
  "Admin thiếu bảng doanh thu / hàng chờ đơn",
);
check(
  "xác nhận tiền đi qua confirmTransfer (backend mới ghi entitlement)",
  adminSrc.includes("api.payments.confirmTransfer"),
  "Admin tự kích hoạt gói thay vì xác nhận qua backend",
);
check(
  "đơn chờ + doanh thu chỉ truy vấn khi là chủ sở hữu (skip nếu không)",
  (adminSrc.match(/isOwner \? \{ token \} : "skip"/g) ?? []).length >= 3,
  "có query doanh thu/đơn chờ chạy cả khi không phải chủ bot",
);
check(
  "card Quản trị viên nhóm lưu qua convex hidden.setTeamAdmins",
  adminSrc.includes("api.hidden.setTeamAdmins") && adminSrc.includes("<TeamAdminsCard"),
  "card thêm thành viên team admin không còn nối vào backend",
);
check(
  "danh sách team admin chỉ đọc khi là chủ bot (thành viên khác thấy thông báo, không lỗi)",
  adminSrc.includes('useQuery(api.hidden.getTeamAdmins, isOwner ? { token } : "skip")') &&
    adminSrc.includes("Bạn là quản trị viên nhóm"),
  "thành viên team admin có thể gặp bảng trắng/lỗi",
);
check(
  "thêm/xoá thành viên có trạng thái bận + hiện lỗi server (không im lặng)",
  adminSrc.includes("Không lưu được.") &&
    adminSrc.includes("const [busy, setBusy] = useState(false)"),
  "lỗi lưu im lặng — chủ bot tưởng đã cấp quyền",
);

// ─── Y. Đồng ý điều khoản + hạn mức theo GÓI (08/10/2026) ───────────────────
// Khách phải TỰ TAY tick đồng ý (không tick sẵn), và cảnh báo "không nhận ngay"
// phải xuất hiện trước khi trả tiền. Server vẫn là chốt cuối (xem
// scripts/test-payments.ts), nhưng cổng này khoá phần UI khỏi bị tháo mất.
const planCard = files.get("components/dashboard/PlanCard.tsx") ?? "";
check(
  "PremiumPage có ô tick đồng ý KHÔNG tick sẵn (checked={agreed} + disabled tới khi tick)",
  premiumSrc.includes("checked={agreed}") && premiumSrc.includes("disabled={!agreed"),
  "ô đồng ý bị tick sẵn hoặc nút mua bật khi chưa đồng ý",
);
check(
  "đơn mua gửi kèm server + consent + phiên bản điều khoản (server kiểm lại)",
  premiumSrc.includes("guildId: effectiveServer") &&
    premiumSrc.includes("consent: true") &&
    premiumSrc.includes("termsVersion: catalog?.termsVersion"),
  "thiếu dữ liệu đồng ý/chọn server khi tạo đơn",
);
check(
  "cảnh báo 'không được cấp tự động' có TRƯỚC khi trả tiền (dưới nút mua + trong hộp xác nhận)",
  premiumSrc.includes(
    'translate(\n                      "Gói không được cấp tự động: sau khi chuyển khoản, admin đối soát rồi kích hoạt — chậm nhất 24 giờ.",',
  ) || (premiumSrc.match(/Gói không được cấp tự động/g) ?? []).length >= 2,
  "cảnh báo nhận hàng chậm bị thiếu ở bước mua",
);
check(
  "có đếm ngược tới mốc cam kết 24h + lối báo chậm kèm mã đơn khi quá hạn",
  premiumSrc.includes("Còn khoảng {gio} giờ trước mốc cam kết 24 giờ.") &&
    premiumSrc.includes("Đã quá cam kết 24 giờ"),
  "mất đếm ngược/đường báo chậm — cam kết 24h không có gì đỡ",
);
check(
  "quyền lợi trên trang bán lấy từ catalog (không tự viết tay danh sách tính năng)",
  premiumSrc.includes("api.plans.catalog") &&
    premiumSrc.includes("planBullets(plan.id)") &&
    !premiumSrc.includes("plan.features"),
  "trang bán còn tự quảng cáo danh sách không gắn với hạn mức thật",
);
check(
  "chọn server khi mua là bắt buộc và hiện gói hiện tại của server đó",
  premiumSrc.includes("api.guilds.listMine") &&
    premiumSrc.includes("api.plans.guildPlan") &&
    premiumSrc.includes('id="buy-server"'),
  "thiếu bước chọn server — không biết gói áp cho server nào",
);
check(
  "gói áp dụng theo TỪNG server được nói rõ cho khách",
  premiumSrc.includes("Gói áp dụng theo TỪNG SERVER"),
  "khách không biết phạm vi gói",
);
check(
  "dashboard có thẻ gói + hạn mức thật của server (PlanCard dùng plans.guildPlan)",
  planCard.includes("api.plans.guildPlan") &&
    planCard.includes("plan.limits.autoReplyRules") &&
    planCard.includes("plan.limits.backupKeepCount") &&
    (files.get("components/dashboard/OverviewPanel.tsx") ?? "").includes("<PlanCard"),
  "thẻ gói không nối vào dashboard",
);
check(
  "thẻ gói nhắc trước khi hết hạn (≤3 ngày) — không để tụt hạn mức âm thầm",
  planCard.includes("endingSoon") && planCard.includes("daysLeft <= 3"),
  "thiếu nhắc hết hạn",
);
check(
  "Admin tô đỏ đơn đã báo quá 12 giờ chưa xác nhận (giữ cam kết 24h)",
  adminSrc.includes("Quá 12 giờ chưa xác nhận") && adminSrc.includes("12 * 3600_000"),
  "đơn tồn không cảnh báo — cam kết 24h dễ vỡ",
);
check(
  "trang bán KHÔNG còn liệt kê tính năng không có gì chặn (tên riêng bot, xuất dữ liệu…)",
  !/Tên riêng cho bot|Báo cáo nâng cao & xuất dữ liệu|Số kênh riêng/.test(premiumSrc),
  "còn quảng cáo thứ code không enforce",
);

console.log(`\nKết quả web contracts: ${pass} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
