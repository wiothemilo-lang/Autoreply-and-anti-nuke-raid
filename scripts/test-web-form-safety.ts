/**
 * test-web-form-safety.ts — chặn tái diễn 3 lớp bug form dashboard đã sửa 13/11/2026.
 *
 * Vì sao có suite này: cả 3 bug đều "im lặng" — người dùng không thấy lỗi, chỉ
 * thấy cấu hình tự quay về giá trị cũ / mất bản nháp / mất màu panel:
 *   1. `defaultValue` + `onBlur` so với giá trị server HIỆN TẠI → chỉ focus rồi
 *      rời ô là ghi lại chữ cũ, revert thay đổi vừa lưu từ tab/admin khác.
 *   2. Kẹp số ngay trong `onChange` → muốn nhập "15" thì gõ 1 bị kẹp thành 2,
 *      gõ tiếp 5 thành 25.
 *   3. `Number("") === 0` → xoá trắng ô số rồi rời ô là ghi 0 (tắt tự đóng
 *      ticket / mất rate limit).
 *
 * Phần logic kiểm bằng hàm THUẦN (src/lib/useDraft.ts). Phần JSX không render
 * được nếu không có DOM nên kiểm bằng phân tích nguồn — đúng cách repo này
 * đang canh các hợp đồng tĩnh khác (check-convex-contract, guild-panel-contract).
 *
 * Chạy: bun scripts/test-web-form-safety.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { clampNumber, parseNumberInput, resyncDraft } from "../src/lib/useDraft";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean) => {
  console.log(ok ? `  ✅ ${label}` : `  ❌ ${label}`);
  if (ok) pass++;
  else fail++;
};

const root = join(import.meta.dir, "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

console.log("resyncDraft — nạp lại bản nháp khi server đổi");
check("server không đổi → GIỮ chữ đang gõ", resyncDraft(5, 5, 7) === 7);
check("server đổi → lấy giá trị server", resyncDraft(6, 5, 7) === 6);
check("null → null không xoá bản nháp", resyncDraft(null, null, "a") === "a");
check("null → giá trị mới thì nạp", resyncDraft("x", null, "a") === "x");
check("NaN so sánh đúng (Object.is)", resyncDraft(Number.NaN, Number.NaN, 3) === 3);
check("chuỗi rỗng là giá trị hợp lệ", resyncDraft("", "", "abc") === "abc");

console.log("parseNumberInput — gõ số nhiều chữ số không bị kẹp giữa đường");
check("gõ '1' → 1 (KHÔNG kẹp thành 2)", parseNumberInput("1", 7) === 1);
check("gõ tiếp '5' thành '15' → 15", parseNumberInput("15", 1) === 15);
check("xoá trắng → giữ giá trị trước đó", parseNumberInput("", 7) === 7);
check("xoá trắng không biến thành 0", parseNumberInput("   ", 24) === 24);
check("chữ rác → giữ giá trị trước đó", parseNumberInput("abc", 3) === 3);
check("số âm vẫn đọc được (kẹp lúc blur)", parseNumberInput("-2", 3) === -2);
check("số thập phân đọc được", parseNumberInput("3.9", 0) === 3.9);

console.log("clampNumber — kẹp một lần khi blur/lưu");
check("25 trong [2,30] giữ nguyên", clampNumber(25, 2, 30) === 25);
check("dưới sàn → sàn", clampNumber(0, 2, 30) === 2);
check("trên trần → trần", clampNumber(999, 2, 30) === 30);
check("làm tròn xuống", clampNumber(3.9, 2, 30) === 3);
check("NaN → sàn", clampNumber(Number.NaN, 2, 30) === 2);
check("0 là giá trị hợp lệ khi sàn = 0", clampNumber(0, 0, 365) === 0);

console.log("Nguồn: TicketPanel — không còn defaultValue + so giá trị server hiện tại");
const ticket = read("src/components/dashboard/TicketPanel.tsx");
check("không còn `defaultValue={g.ticket…`", !/defaultValue=\{g\.ticket/.test(ticket));
check("có dùng useDraft cho các ô ghi khi blur", /useDraft\(g\.ticketMaxOpen\)/.test(ticket));
check(
  "effect transcript có cleanup tắt alive",
  /return \(\) => \{\s*alive\.current = false;/.test(ticket),
);
check("chặn chọn role thứ 4 (không patch im lặng)", /cur\.length >= 3/.test(ticket));
check("hex sai không ghi rỗng: có nhánh báo lỗi", /Mã màu không hợp lệ/.test(ticket));

console.log("Nguồn: BackupPanel — resync + dirty + không kẹp trong onChange");
const backup = read("src/components/dashboard/BackupPanel.tsx");
check("đăng ký useUnsavedChanges", /useUnsavedChanges\("backup", dirty\)/.test(backup));
check("có effect nạp lại khi server đổi", /lastServer\.current = now;/.test(backup));
check(
  "resync cả cờ nguy hiểm restoreClearChannels",
  /setRestoreClearChannels\(now\.restoreClearChannels\)/.test(backup),
);
check(
  "không kẹp số trong onChange",
  !/setAutoDays\(Math\.max\(2, Math\.min\(30, parseInt/.test(backup) &&
    !/setKeepCount\(Math\.max\(2, Math\.min\(50, parseInt/.test(backup) &&
    !/setKeepDays\(Math\.max\(0, Math\.min\(365, parseInt/.test(backup),
);
check("kẹp khi blur", /setAutoDays\(\(v\) => clampNumber\(v, 2, 30\)\)/.test(backup));
check("kẹp lần nữa lúc lưu", /const days = clampNumber\(autoDays, 2, 30\)/.test(backup));
check(
  "giá trị khởi tạo ô số trùng serverAutoDaysShown (không dirty oan khi mở)",
  /backupAutoDays \?\? 0\) > 0[\s\S]{0,120}?: 7,/.test(backup),
);
check(
  "tắt tự động thì ô số về 7 (không kẹt dirty sau khi lưu)",
  /setAutoDays\(clampNumber\(now\.autoDays > 0 \? now\.autoDays : 7, 2, 30\)\)/.test(backup),
);

console.log("Nguồn: Admin — nút xác nhận + số ngày cấp gói");
const admin = read("src/pages/Admin.tsx");
check(
  "nút đơn đang xác nhận bị khoá đúng chiều",
  /disabled=\{confirming === o\.appTransId\}/.test(admin),
);
check(
  "không còn chiều ngược",
  !/disabled=\{confirming !== null && confirming !== o\.appTransId\}/.test(admin),
);
check("không còn `days: Number(days) || 30`", !/days: Number\(days\) \|\| 30/.test(admin));
check("từ chối số ngày ngoài 1..365", /dayCount < 1 \|\| dayCount > 365/.test(admin));

console.log("Nguồn: GuildPage — onboarding phải đi qua goToSection");
const guildPage = read("src/pages/GuildPage.tsx");
check(
  "onOpenSection gọi goToSection (hỏi trước khi mất bản nháp)",
  /onOpenSection=\{\(key\) => goToSection\(key as SectionKey\)\}/.test(guildPage),
);

console.log("Nguồn: token màu ngữ nghĩa phải có thật trong Tailwind");
const tw = read("tailwind.config.ts");
const css = read("src/index.css");
check("tailwind.config.ts khai báo success", /success:\s*\{/.test(tw));
check("tailwind.config.ts khai báo warning", /warning:\s*\{/.test(tw));
check("index.css có biến --success", /--success:/.test(css));
check("index.css có biến --warning", /--warning:/.test(css));
check(
  "UserTags không dùng token warn không tồn tại",
  !/\b(?:border|bg|text)-warn\b/.test(read("src/components/UserTags.tsx")),
);

console.log("Nguồn: nhật ký sự cố phải dịch LÚC RENDER, không phải lúc ghi");
const monitorHook = read("src/lib/useBotMonitor.ts");
check(
  "useBotMonitor phát kind thay vì câu tiếng Việt",
  /kind:\s*"latency"\s*\|\s*"down"/.test(monitorHook),
);
check("useBotMonitor có incidentLabel", /export function incidentLabel/.test(monitorHook));
check("Monitor không render inc.text thô", !/inc\.text/.test(read("src/pages/Monitor.tsx")));
check("Admin không render inc.text thô", !/inc\.text/.test(admin));
check(
  "Monitor lấy sampleIntervalMs cho nhãn",
  /sampleIntervalMs/.test(read("src/pages/Monitor.tsx")),
);

console.log("Nguồn: nút cập nhật khung giờ không được hứa suông");
check(
  "UpdateWindow không còn onRefresh",
  !/onRefresh/.test(read("src/components/UpdateWindow.tsx")),
);

console.log("Nguồn: công tắc webhook gửi trạng thái TƯỜNG MINH");
check(
  "WebhookPanel gửi enabled: v",
  /enabled:\s*v\b/.test(read("src/components/dashboard/WebhookPanel.tsx")),
);
const webhooks = read("convex/webhooks.ts");
check("mutation nhận enabled optional", /enabled:\s*v\.optional\(v\.boolean\(\)\)/.test(webhooks));
check("mutation dùng giá trị tường minh trước", /enabled \?\? !wh\.enabled/.test(webhooks));

console.log("Nguồn: WelcomePanel chặn cắt chuỗi + token {joined}");
const welcome = read("src/components/dashboard/WelcomePanel.tsx");
check("preview thay {joined}", /replaceAll\("\{joined\}"/.test(welcome));
check("ô nội dung có maxLength 1000", /maxLength=\{1000\}/.test(welcome));
check("ô danh sách câu có maxLength 4000", /maxLength=\{4000\}/.test(welcome));
check("ô tiêu đề embed có maxLength 256", /maxLength=\{256\}/.test(welcome));
check("chọn “Không dùng” thì tắt tính năng luôn", /\$\{kind\}Enabled`\]: false/.test(welcome));

console.log("Nguồn: onboarding trỏ đúng panel có ô chọn kênh log");
check(
  "bước kênh log nhắm SettingsPanel",
  /target: "settings"/.test(read("src/components/dashboard/OnboardingChecklist.tsx")),
);

console.log("Nguồn: module lạ không làm sập panel");
const constants = read("src/lib/constants.ts");
check("constants có moduleMeta fallback", /export function moduleMeta/.test(constants));
for (const file of [
  "src/components/dashboard/ModuleCard.tsx",
  "src/components/dashboard/AntiNukePanel.tsx",
  "src/components/dashboard/AutoModPanel.tsx",
  "src/pages/GuildHistory.tsx",
]) {
  check(`${file} dùng moduleMeta`, /moduleMeta\(/.test(read(file)));
}
check("constants có planDisplayName", /export function planDisplayName/.test(constants));
check("Admin không in enum gói thô", !/\{translate\("Gói"\)\} \{o\.plan\}/.test(admin));

console.log("Nguồn: các lỗi im lặng còn lại");
const backupSrc = read("src/components/dashboard/BackupPanel.tsx");
check(
  "JoinGate giữ whitelistRef (chống ghi đè)",
  /whitelistRef/.test(read("src/components/dashboard/JoinGatePanel.tsx")),
);
check(
  "Dashboard mở tab mới có noopener",
  /"noopener,noreferrer"/.test(read("src/pages/Dashboard.tsx")),
);
check(
  "StatsPage guard weekly rỗng",
  /summary\.weekly\[0\]\s*\?/.test(read("src/pages/StatsPage.tsx")),
);
check(
  "DiscordCallback dựng URL bằng searchParams",
  /searchParams\.set\("silent"/.test(read("src/pages/DiscordCallback.tsx")),
);
check(
  "BackupPanel watchdog dùng dep nguyên thuỷ",
  /[importWatch, importRequested, importError, importBotOnline]/.test(backupSrc),
);
check("BackupPanel dọn timer refresh khi đóng", /refreshTimer/.test(backupSrc));
check(
  "ModerationPanel dịch preview embed",
  /translate\("\{p0\} \| case N/.test(read("src/components/dashboard/ModerationPanel.tsx")),
);
check(
  "VerifyPage có đồng hồ hết hạn",
  /setInterval\(\(\) => setNow\(Date\.now\(\)\)/.test(read("src/pages/VerifyPage.tsx")),
);
check(
  "PaymentReturn chỉ xoá param order",
  /next\.delete\("order"\)/.test(read("src/components/PaymentReturn.tsx")),
);

// ===== Lô 3: lỗi mức thấp còn lại =====
const siteNavSrc = read("src/components/SiteNav.tsx");
check("SiteNav chia sẻ theme qua store ngoài React", /useSyncExternalStore\(/.test(siteNavSrc));
check("SiteNav không còn theme useState riêng", !/useState<ThemeMode>/.test(siteNavSrc));
check("SiteNav ghi theme qua một hàm duy nhất", /setTheme: setThemeGlobal/.test(siteNavSrc));

const adminSrc2 = read("src/pages/Admin.tsx");
check(
  "Admin giữ thông điệp lỗi thật khi đặt seed",
  /friendlyConvexError\(e, translate\("Lỗi khi đặt seed/.test(adminSrc2),
);
check(
  "Admin không bật AI weekly khi chưa tải xong",
  !/threat\?\.aiWeeklyEnabled \?\? true/.test(adminSrc2),
);
check(
  "Admin ghi danh sách team từ ref mới nhất",
  /idsRef\.current\.filter/.test(adminSrc2) &&
    /save\(\[\.\.\.idsRef\.current, added\]\)/.test(adminSrc2),
);
check(
  "Admin không đè chữ đang gõ ở ô phiên bản",
  /current === lastVersion\.current \? next : current/.test(adminSrc2),
);
check(
  "TicketPanel không còn ô defaultValue",
  !/defaultValue=/.test(read("src/components/dashboard/TicketPanel.tsx")),
);

console.log("");
if (fail) {
  console.error(`❌ ${fail} lỗi, ${pass} đạt`);
  process.exit(1);
}
console.log(`✅ ${pass} kiểm tra đạt`);
