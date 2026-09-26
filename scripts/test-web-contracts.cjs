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
check(
  "Docker noindex chỉ áp route private và có branded 404",
  /auth\|discord\/callback\|admin\|stats/.test(dockerfile) &&
    !/terms\|privacy\|data-deletion\|monitor/.test(dockerfile) &&
    /error_page 404 \/404\.html/.test(dockerfile),
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
check(
  "useBotStatus tự tạo lại trạng thái khi heartbeat cũ",
  /setInterval[\s\S]{0,180}setNow/.test(files.get("lib/useBotStatus.ts") ?? ""),
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
// Route phải được đăng ký đúng method — codegenConvex không chặn việc quên route.
check(
  "/geo_lang đăng ký đủ GET + OPTIONS",
  /path: "\/geo_lang", method: "GET"/.test(httpSrc) &&
    /path: "\/geo_lang", method: "OPTIONS"/.test(httpSrc),
);

// ─── N. Endpoint chẩn đoán OAuth (tạm, cho bug đăng nhập 24/09) ──────
// Endpoint chẩn đoán được phép đọc env OAuth NHƯNG TUYỆT ĐỐI không được trả
// giá trị gốc ra ngoài (chỉ boolean + URI đã chuẩn hoá) — nếu ai đó vô tình
// trả thẳng process.env.* thì phải bị test chặn ngay.
check(
  "/oauth_env_check chỉ trả boolean env + URI chuẩn hoá, không lộ giá trị env gốc",
  /hasOauthRedirectUri: !!process\.env\.OAUTH_REDIRECT_URI/.test(httpSrc) &&
    /hasDashboardUrl: !!process\.env\.DASHBOARD_URL/.test(httpSrc) &&
    /allowedUris: allowed,/.test(httpSrc) &&
    !/OAUTH_REDIRECT_URI:\s*process/.test(httpSrc) &&
    !/DASHBOARD_URL:\s*process/.test(httpSrc),
);
check(
  "/oauth_env_check dựng ALLOWED y hệt sessionAuth (OAUTH_REDIRECT_URI + DASHBOARD_URL/discord/callback)",
  httpSrc.includes("process.env.OAUTH_REDIRECT_URI,") &&
    httpSrc.includes('`${process.env.DASHBOARD_URL.replace(/\\/+$/, "")}/discord/callback`'),
);
check(
  "/oauth_env_check hỗ trợ ?uri= ứng viên + đăng ký đủ GET + OPTIONS",
  /searchParams\.get\("uri"\)/.test(httpSrc) &&
    /recognized: candidate !== null && allowed\.includes\(candidate\)/.test(httpSrc) &&
    /path: "\/oauth_env_check", method: "GET"/.test(httpSrc) &&
    /path: "\/oauth_env_check", method: "OPTIONS"/.test(httpSrc),
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
  "/features được index: seo.ts có kind features + sitemap + meta robots",
  /"features"/.test(seo) &&
    /path === "\/features"/.test(seo) &&
    fs.readFileSync(path.join(ROOT, "public", "sitemap.xml"), "utf8").includes("/features"),
);
check(
  "/features render nhãn đa ngữ qua translate() (không render trực tiếp từ doc)",
  /translate\(doc\.hero\.title\)/.test(featuresPageSrc) &&
    /translate\(block\.description\)/.test(featuresPageSrc) &&
    /translate\(step\)/.test(featuresPageSrc),
);

console.log(`\nKết quả web contracts: ${pass} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
