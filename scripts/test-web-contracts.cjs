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
  "online status dùng chung heartbeat freshness helper",
  /isHeartbeatFresh/.test(utils) && /isHeartbeatFresh/.test(overviewPanel),
);
const useBotStatusSrc = files.get("lib/useBotStatus.ts") ?? "";
check(
  "useBotStatus có đồng hồ cập nhật + đồng bộ lại ngay khi tab hiện (heartbeat có thể vừa hết hạn lúc tab ẩn)",
  /setInterval[\s\S]{0,220}broadcastNow/.test(useBotStatusSrc) &&
    /visibilitychange[\s\S]{0,220}broadcastNow/.test(useBotStatusSrc),
);
check(
  "useBotStatus dùng CHUNG một ticker cho mọi consumer (Footer + Taskbar cùng mount trên Landing — không mỗi đứa một interval, tab ẩn thì im)",
  /nowListeners/.test(useBotStatusSrc) && /document\.hidden/.test(useBotStatusSrc),
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
    `${page} có SkipLink + đích nhảy nhận được focus (<main tabIndex={-1}> hoặc PageReveal)`,
    /<SkipLink/.test(src) && (hasOwnMain || usesPageReveal),
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
// Lỗi thật 30/09/2026: bảng chọn trang (Taskbar) chỉ liệt kê 3 mục trong khi
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
  /\{!transient && <Taskbar \/>\}/.test(appFileSrc),
);
check(
  "không trang nào tự mount Taskbar thêm lần nữa (tránh render trùng)",
  ![...files.values()].some(
    (src) => /import Taskbar from/.test(src) && !src.includes("routes.json"),
  ),
);
// Trang đang mở phải tô đậm được: isNavItemActive phân biệt "/" (chỉ khớp
// chính nó) với "/dashboard" (khớp cả "/dashboard/:guildId").
const activeFn = navSrc.slice(navSrc.indexOf("export function isNavItemActive"));
check(
  "isNavItemActive: '/' chỉ khớp chính nó, trang con khớp theo tiền tố",
  /if \(to === "\/"\) return path === "\/"/.test(activeFn) &&
    /path\.startsWith\(`\$\{to\}\/`\)/.test(activeFn),
);

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

console.log(`\nKết quả web contracts: ${pass} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
