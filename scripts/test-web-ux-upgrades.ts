// TEST: 4 nâng cấp UX web — cảnh báo chưa lưu, command palette, trạng thái
// đồng bộ, bật chống nuke hàng loạt.
// Chạy: bun scripts/test-web-ux-upgrades.ts
//
// Vì sao test: đây đều là lớp "người dùng hiểu sai" — chạy không lỗi gì nhưng
// dẫn tới mất cấu hình, tìm không ra panel, hoặc tưởng bot đã chạy cấu hình
// mới. Biên sai 1 phút / sai thứ tự tìm kiếm là hỏng mục đích.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  confirmLeave,
  hasUnsavedChanges,
  setPanelDirty,
  unsavedPanelIds,
} from "../src/lib/useUnsavedChanges";
import { filterCommands, foldDiacritics, scoreCommand } from "../src/components/CommandPalette";
import { navLabelFor, navPaths, visibleNavGroups } from "../src/lib/navItems";
import { syncState, SETTINGS_APPLY_WINDOW_MS, STALE_HEARTBEAT_MS } from "../src/lib/syncState";
import {
  BOT_ONLINE_WINDOW_MS,
  BOT_SYNC_INTERVAL_MS,
  GUILD_HEARTBEAT_FRESH_MS,
  GUILD_HEARTBEAT_REFRESH_MS,
  HEARTBEAT_FRESH_MS,
  isGuildHeartbeatFresh,
  isHeartbeatFresh,
} from "../src/lib/utils";
import { ensureDictionary, lookupTranslation, translate } from "../src/lib/i18n";
import { safeRedirectPath } from "../src/lib/discord";
import { friendlyConvexError } from "../src/lib/convexError";
import { AVATAR_MAX_DIM, planAvatarResize } from "../src/lib/avatarImage";
import { CHUNK_RELOAD_COOLDOWN_MS, installStaleChunkRecovery } from "../src/lib/staleChunk";
import { evaluateConfigHealth, healthGrade, HEALTH_TARGETS } from "../src/lib/configHealth";
import {
  compareIncidentPeriods,
  groupIncidentsByDay,
  summarizeByModule,
  type IncidentLike,
} from "../src/lib/incidentStats";
import {
  DESKTOP_BREAKPOINT_PX,
  HOME_SECTION,
  NARROW_MEDIA_QUERY,
  isNarrowViewport,
  shouldUsePanelSheet,
} from "../src/lib/mediaQuery";
import { simulateAutoReply, type SimInput, type SimRule } from "../src/lib/autoreplySim";
import { toBranding } from "../src/lib/useBranding";
import { judgeJobWatch, type JobWatch } from "../src/lib/backupWatch";
import { isAuthLoopTarget, resolveAuthPageState } from "../src/lib/authRoute";
import {
  INCIDENT_SLOW,
  LATENCY_FAST,
  LATENCY_SLOW,
  SYNC_INTERVAL_MS,
  fmtVietnam,
  latencyLabel,
} from "../src/lib/useBotMonitor";
import { EN } from "../src/lib/i18n.en";
import { EN_PANELS } from "../src/lib/i18n.en.panels";
import { EN_LABELS } from "../src/lib/i18n.en.labels";
import { DE } from "../src/lib/i18n.de";
import { DE_PANELS } from "../src/lib/i18n.de.panels";
import { DE_LABELS } from "../src/lib/i18n.de.labels";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean) => {
  console.log(ok ? `  ✅ ${label}` : `  ❌ ${label}`);
  if (ok) pass++;
  else fail++;
};

const T = 1_700_000_000_000;

console.log("── #1 cảnh báo chưa lưu ──");

// 1. Panel bẩn → có thay đổi chưa lưu; bỏ bẩn → sạch.
setPanelDirty("t1", true);
check("đánh dấu bẩn → có thay đổi", hasUnsavedChanges());
check("lưu danh sách panel bẩn", unsavedPanelIds().includes("t1"));
setPanelDirty("t1", false);
check("bỏ bẩn → sạch", !hasUnsavedChanges());

// 2. NHIỀU panel cùng lúc bẩn → phải giữ hết, xoá 1 không xoá nhầm cái khác.
setPanelDirty("a", true);
setPanelDirty("b", true);
setPanelDirty("a", false);
check("xoá 1 panel không xoá panel khác", hasUnsavedChanges());
check("còn đúng panel b", unsavedPanelIds().length === 1 && unsavedPanelIds()[0] === "b");
setPanelDirty("b", false);
check("xoá hết → sạch", !hasUnsavedChanges());

// 3. Đánh dấu lặp (React render nhiều lần) không nhân bản.
setPanelDirty("c", true);
setPanelDirty("c", true);
check("đánh dấu lặp không nhân bản", unsavedPanelIds().filter((x) => x === "c").length === 1);
setPanelDirty("c", false);

// 4. confirmLeave: chưa lặp gì thì đi tiếp, KHÔNG hỏi (hỏi oan mệt).
// Bịa window.confirm vì test chạy ngoài trình duyệt.
{
  const g = globalThis as unknown as { confirm: (m: string) => boolean };
  const orig = g.confirm;
  let asked = 0;
  g.confirm = () => {
    asked++;
    return true;
  };
  check("chưa có gì bẩn → đi tiếp, KHÔNG hỏi", confirmLeave() === true && asked === 0);

  setPanelDirty("d", true);
  check("có thay đổi → hỏi trước", confirmLeave() === true && asked === 1);
  g.confirm = () => false;
  check("người dùng bấm Ở LẠI → chặn rời đi", confirmLeave() === false);
  g.confirm = orig;
  setPanelDirty("d", false);
}

console.log("── #2 command palette ──");

// 5. Rỗng → trả về tất cả, giữ thứ tự.
{
  const items = [
    { label: "Chống nuke / raid", keywords: "antinuke" },
    { label: "Auto-mod", keywords: "automod spam" },
  ];
  const out = filterCommands(items, "");
  check("gõ rỗng → thấy tất cả", out.length === 2);
  check("giữ thứ tự gốc", out[0].label === "Chống nuke / raid");
}

// 6. Khớp tiền tố phải đứng trước khớp ở giữa.
{
  const items = [
    { label: "Backup server", keywords: "cloudupload" },
    { label: "Cài đặt chống nuke", keywords: "anti" },
  ];
  const out = filterCommands(items, "c");
  check("tiền tố 'Cài' đứng trước 'Backup'", out[0].label === "Cài đặt chống nuke");
  check("tiền tố có điểm cao hơn", scoreCommand(items[1], "c") > scoreCommand(items[0], "c"));
}

// 7. KHÔNG DẤU vẫn ra kết quả — người dùng Việt gõ rất nhanh, không bấm dấu.
// `foldDiacritics` cố ý KHÔNG đổi hoa/thường (chuyện của người gọi).
check("bỏ dấu tiếng Việt", foldDiacritics("Chống nuke") === "Chong nuke");
check("bỏ dấu cả chữ đ", foldDiacritics("Gác hiệu") === "Gac hieu");
{
  const out = filterCommands([{ label: "Gác hiệu", keywords: "" }], "gac hieu");
  check("tìm bằng chuỗi không dấu", out.length === 1);
  check("gõ có dấu cũng khớp", filterCommands([{ label: "Gác hiệu" }], "gác hiệu").length === 1);
}

// 8. Tìm bằng từ khoá tiếng Anh trong `keywords`.
{
  const out = filterCommands(
    [
      { label: "Chống nuke / raid", keywords: "antinuke raid" },
      { label: "Auto-mod", keywords: "automod spam" },
    ],
    "raid",
  );
  check(
    "tìm được qua keywords tiếng Anh",
    out.length === 1 && out[0].label === "Chống nuke / raid",
  );
}

// 9. Không có kết quả → mảng rỗng (UI hiện "không có kết quả nào", không crash).
check(
  "từ bùa nhau → rỗng",
  filterCommands([{ label: "Auto-mod", keywords: "" }], "zzz").length === 0,
);

// 10. Không phân biệt hoa thường.
check(
  "gõ HOA vẫn khớp",
  filterCommands([{ label: "Auto-mod", keywords: "" }], "AUTO").length === 1,
);
check(
  "khoảng trắng thừa không làm hỏng",
  filterCommands([{ label: "Auto-mod", keywords: "" }], "  auto  ").length === 1,
);

// 11. Hòa điểm → giữ thứ tự gốc (người dùng đã quen vị trí panel).
{
  const out = filterCommands(
    [
      { label: "Alpha", keywords: "" },
      { label: "Beta", keywords: "" },
    ],
    "",
  );
  check("hòa điểm giữ thứ tự gốc", out[0].label === "Alpha" && out[1].label === "Beta");
}

console.log("── #4 trạng thái đồng bộ ──");

// 12. Bot offline → nói thẳng, KHÔNG báo "đồng bộ".
check(
  "bot offline → bot-offline",
  syncState({ settingsChangedAt: T, botOnline: false, now: T }) === "bot-offline",
);

// 13. Chưa từng sửa + bot sống → im lặng (không badge rác).
check("chưa sửa gì → in-sync", syncState({ botOnline: true, now: T }) === "in-sync");
check(
  "settingsChangedAt undefined → in-sync",
  syncState({ settingsChangedAt: undefined, botOnline: true, now: T }) === "in-sync",
);

// 14. Vừa lưu (< 3 phút) → "đang gửi", KHÔNG báo xong.
check(
  "vừa lưu → just-saved",
  syncState({ settingsChangedAt: T, botOnline: true, now: T + 60_000 }) === "just-saved",
);

// 15. Biên đúng 3 phút → sang "đã gửi" (không phải just-saved).
check(
  "đúng 3 phút → đã gửi",
  syncState({ settingsChangedAt: T, botOnline: true, now: T + SETTINGS_APPLY_WINDOW_MS }) ===
    "sent",
);

// 16. QUAN TRỌNG: không bao giờ báo "đã áp dụng" — không có tín hiệu đó.
{
  const s = syncState({ settingsChangedAt: T, botOnline: true, now: T + 86_400_000 });
  check("một ngày sau vẫn KHÔNG báo đã áp dụng", s === "sent");
  check("không có trạng thái 'đã áp dụng' nào", !["applied", "done"].includes(s));
}

// 17. Có cấu hình mới nhưng heartbeat quá cũ → coi như bot chết, nói thật.
// Phải để `now` đã qua mốc 3 phút, nếu không thì nhánh "just-saved" chạy trước.
check(
  "heartbeat cũ + có cấu hình mới → bot-offline",
  syncState({
    settingsChangedAt: T,
    botOnline: true,
    lastHeartbeat: T - STALE_HEARTBEAT_MS - 1,
    now: T + SETTINGS_APPLY_WINDOW_MS + 1,
  }) === "bot-offline",
);
// 17b. Heartbeat còn tươi thì vẫn là "đã gửi", không phải offline.
check(
  "heartbeat còn tươi → đã gửi",
  syncState({
    settingsChangedAt: T,
    botOnline: true,
    lastHeartbeat: T + SETTINGS_APPLY_WINDOW_MS,
    now: T + SETTINGS_APPLY_WINDOW_MS + 1,
  }) === "sent",
);

// ─────────────────────────────────────────────────────────────
console.log("\n── #5 từ điển i18n nạp lười (EN/DE tách chunk, VI không cần gì) ──");
// Đo 30/09/2026: hai từ điển chiếm ~404 KB / 509 KB chunk entry. Nạp lười chỉ
// an toàn nếu tra cứu vẫn ĐÚNG từng key sau khi nạp và không bao giờ ném.
{
  const enKey = Object.keys(EN)[0];
  const panelKey = Object.keys(EN_PANELS)[0];
  const labelKey = Object.keys(EN_LABELS)[0];
  check(
    "chưa nạp → chưa có bản dịch EN (null, để caller rơi về chuỗi VI)",
    lookupTranslation("en", enKey) === null,
  );
  check(
    "tiếng Việt là key nên không bao giờ cần từ điển",
    lookupTranslation("vi", enKey) === null && (await ensureDictionary("vi")) === true,
  );
  const first = ensureDictionary("en");
  check("hai lần gọi đồng thời dùng chung MỘT lượt nạp", first === ensureDictionary("en"));
  check("nạp xong trả true", (await first) === true);

  const mergedEn: Record<string, string> = { ...EN, ...EN_PANELS, ...EN_LABELS };
  check(
    "EN: mọi key của cả 3 file đều tra ra đúng bản dịch (file sau đè file trước)",
    Object.entries(mergedEn).every(([k, v]) => lookupTranslation("en", k) === v),
  );
  check(
    "EN: có mặt key từ đợt 1, panel và nhãn dữ liệu",
    [enKey, panelKey, labelKey].every((k) => lookupTranslation("en", k) !== null),
  );
  check("nạp EN không kéo theo DE", lookupTranslation("de", enKey) === null);

  check("DE nạp xong trả true", (await ensureDictionary("de")) === true);
  const mergedDe: Record<string, string> = { ...DE, ...DE_PANELS, ...DE_LABELS };
  check(
    "DE: mọi key của cả 3 file đều tra ra đúng bản dịch",
    Object.entries(mergedDe).every(([k, v]) => lookupTranslation("de", k) === v),
  );
  check("key lạ → null (không ném)", lookupTranslation("en", "khóa-không-tồn-tại-xyz") === null);
  check(
    "translate() ở tiếng Việt trả nguyên chuỗi và thay biến",
    translate("Đã lưu {n} rule", { n: 3 }) === "Đã lưu 3 rule",
  );
  check("nạp lại khi đã nạp → true ngay", (await ensureDictionary("en")) === true);
}

console.log("\n── #6 safeRedirectPath (hàm THẬT, không tái tạo) ──");
// Hồi quy: hàm tự nhận "không chứa ký tự điều khiển" nhưng "/\t/evil.com" lọt qua,
// mà bộ phân tích URL của trình duyệt bỏ tab → thành "//evil.com" (protocol-relative).
{
  const FALLBACK = "/dashboard";
  check("đường dẫn nội bộ giữ nguyên", safeRedirectPath("/dashboard/g/123") === "/dashboard/g/123");
  check(
    "query string nội bộ giữ nguyên",
    safeRedirectPath("/dashboard?tab=heat") === "/dashboard?tab=heat",
  );
  check("gốc '/' hợp lệ", safeRedirectPath("/") === "/");
  check("khoảng trắng hai đầu được cắt", safeRedirectPath("  /ok ") === "/ok");
  const evil = [
    "//evil.com",
    "/\\evil.com",
    "/a\\b",
    "/\t/evil.com",
    "/\n/evil.com",
    "/\r/evil.com",
    "/\u0000/evil.com",
    "/\u007f",
    "https://evil.com",
    "http://evil.com",
    "javascript:alert(1)",
    "evil.com",
    "",
  ];
  for (const raw of evil) {
    check(`từ chối ${JSON.stringify(raw)}`, safeRedirectPath(raw) === FALLBACK);
  }
  check(
    "null/undefined/không phải chuỗi → fallback",
    safeRedirectPath(null) === FALLBACK &&
      safeRedirectPath(undefined) === FALLBACK &&
      safeRedirectPath(42 as unknown as string) === FALLBACK,
  );
  check("fallback tuỳ chỉnh được dùng", safeRedirectPath("//evil.com", "/home") === "/home");
}

console.log("\n── #7 tự tải lại khi chunk bị xoá sau deploy (vite:preloadError) ──");
{
  const mk = (opts: { now?: () => number; storage?: any } = {}) => {
    const target = new EventTarget();
    const mem = new Map<string, string>();
    const storage = opts.storage ?? {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    };
    let reloads = 0;
    let t = 1_700_000_000_000;
    const dispose = installStaleChunkRecovery({
      target,
      storage,
      now: opts.now ?? (() => t),
      reload: () => void reloads++,
    });
    const fire = () => {
      const ev = new Event("vite:preloadError", { cancelable: true });
      target.dispatchEvent(ev);
      return ev;
    };
    return { fire, dispose, reloads: () => reloads, advance: (ms: number) => void (t += ms) };
  };

  const a = mk();
  const ev1 = a.fire();
  check("lỗi chunk đầu tiên → tải lại đúng 1 lần", a.reloads() === 1);
  check("lỗi gốc bị chặn (không nháy màn lỗi lúc đang tải lại)", ev1.defaultPrevented);
  a.advance(CHUNK_RELOAD_COOLDOWN_MS - 1);
  const ev2 = a.fire();
  check("vừa tải lại mà vẫn lỗi (trong cooldown) → KHÔNG tải lại nữa", a.reloads() === 1);
  check("...và để lỗi nổi lên cho error boundary (không chặn)", !ev2.defaultPrevented);
  a.advance(1);
  a.fire();
  check("hết cooldown → được tải lại lần nữa", a.reloads() === 2);
  a.dispose();
  a.fire();
  check("đã gỡ listener → không phản ứng", a.reloads() === 2);

  const b = mk({
    storage: {
      getItem: () => {
        throw new Error("sessionStorage bị chặn");
      },
      setItem: () => {},
    },
  });
  const evB = b.fire();
  check("sessionStorage bị chặn → không có chống lặp nên KHÔNG tải lại", b.reloads() === 0);
  check("...và không nuốt lỗi gốc", !evB.defaultPrevented);
}

// ── #5 điểm cấu hình (đợt #4) ──
console.log("── #8 điểm cấu hình (đợt #4) ──");
{
  const full = {
    botInGuild: true,
    logChannelId: "1",
    modLogChannelId: "2",
    antinukeEnabled: true,
    automodEnabled: true,
    joinGateEnabled: true,
    verifyEnabled: true,
    backupAutoDays: 7,
  };
  const off = { ...full, antinukeEnabled: false, logChannelId: null, modLogChannelId: null };

  check(
    "bật đủ → 100 điểm, không còn vấn đề",
    (() => {
      const r = evaluateConfigHealth(full);
      return r.score === 100 && r.issues.length === 0;
    })(),
  );

  const onlyBackup = evaluateConfigHealth({ ...full, backupAutoDays: 0 });
  check(
    "tắt backup → trừ đúng 15 điểm",
    onlyBackup.score === 85 && onlyBackup.issues[0].points === 15,
  );

  const r = evaluateConfigHealth(off);
  check("tắt antinuke + kênh log → trừ 55 điểm", r.score === 45);
  check("vấn đề nghiêm trọng đứng đầu (30 điểm trước 25)", r.issues[0].key === "noAntiNuke");
  check(
    "mọi vấn đề đều có target để mở panel",
    r.issues.every((i) => Boolean(i.target)),
  );
  check(
    "target chỉ trong danh sách khoá hợp lệ",
    r.issues.every((i) => HEALTH_TARGETS.includes(i.target)),
  );

  // Chỉ có modLogChannel cũng đủ — bot ghi log chính và log mod là hai chỗ.
  check(
    "chỉ có kênh log mod → coi như đã có log",
    evaluateConfigHealth({ ...full, logChannelId: null }).score === 100,
  );

  // Bot chưa ở trong server: cấu hình chưa có ý nghĩa, KHÔNG được chấm rủi ro.
  const notIn = evaluateConfigHealth({
    ...full,
    botInGuild: false,
    antinukeEnabled: false,
    logChannelId: null,
    modLogChannelId: null,
    backupAutoDays: 0,
  });
  check(
    "bot chưa ở trong server → không chấm điểm rủi ro",
    notIn.score === 100 && notIn.issues.length === 0,
  );

  // Tắt HẾT: tổng điểm trừ = 100 ⇒ điểm không âm.
  const none = evaluateConfigHealth({
    botInGuild: true,
    logChannelId: null,
    modLogChannelId: null,
    antinukeEnabled: false,
    automodEnabled: false,
    joinGateEnabled: false,
    verifyEnabled: false,
    backupAutoDays: 0,
  });
  check("tắt hết → 0 điểm, KHÔNG âm", none.score === 0);
  check("tắt hết → 6 vấn đề", none.issues.length === 6);

  check("ngưỡng nhãn: 100 = Tốt", healthGrade(100).tone === "ok" && healthGrade(80).tone === "ok");
  check(
    "ngưỡng nhãn: 50 = Cần xem lại",
    healthGrade(79).tone === "warn" && healthGrade(50).tone === "warn",
  );
  check(
    "ngưỡng nhãn: dưới 50 = Rủi ro cao",
    healthGrade(49).tone === "bad" && healthGrade(0).tone === "bad",
  );

  // Khoá `target` phải tồn tại trong NAV_ITEMS của GuildPage — nếu gõ sai,
  // bấm "Mở panel" sẽ mở panel không có. Kiểm tra trực tiếp trên nguồn.
  const guildPage = readFileSync(
    fileURLToPath(new URL("../src/pages/GuildPage.tsx", import.meta.url)),
    "utf8",
  );
  check(
    "mọi target của điểm cấu hình đều có panel thật trong NAV_ITEMS",
    HEALTH_TARGETS.every((t) => new RegExp(`key: "${t}"`).test(guildPage)),
  );
}

// ── #9 dò thời gian + so sánh kỳ cho trang Sự cố (đợt #4) ──
console.log("── #9 thống kê sự cố ──");
{
  const DAY = 86_400_000;
  const now = Date.UTC(2026, 9, 3, 12, 0, 0);
  const mk = (key: string, agoDays: number, over: Partial<IncidentLike> = {}): IncidentLike => ({
    key,
    module: "massBan",
    kind: "antinuke",
    action: "mass ban",
    punish: null,
    executors: [],
    targets: [],
    firstAt: now - agoDays * DAY,
    lastAt: now - agoDays * DAY,
    events: 1,
    blocked: 1,
    resolved: false,
    ...over,
  });

  // So kỳ: 14 ngày gần nhất vs 14 ngày trước.
  const list = [
    mk("a", 1, { events: 3, blocked: 3 }),
    mk("b", 5, { events: 2, blocked: 2, resolved: true }),
    mk("c", 10, { events: 4, blocked: 4 }),
    mk("d", 20), // kỳ trước
    mk("e", 25), // kỳ trước
  ];
  const cmp = compareIncidentPeriods(list, now);
  check(
    "kỳ này đếm 3 sự cố / 9 lượt chặn / 9 sự kiện",
    cmp.current.incidents === 3 && cmp.current.blocked === 9 && cmp.current.events === 9,
  );
  check(
    "kỳ trước đếm 2 sự cố / 2 lượt chặn",
    cmp.previous.incidents === 2 && cmp.previous.blocked === 2,
  );
  check("chênh lệch = hiện tại − trước", cmp.delta.incidents === 1 && cmp.delta.blocked === 7);
  check("đếm cả sự cố đã xử lý trong kỳ", cmp.current.resolved === 1);
  check(
    "sự cố ngoài 28 ngày không vào kỳ nào",
    compareIncidentPeriods([mk("old", 40)], now).current.incidents === 0 &&
      compareIncidentPeriods([mk("old", 40)], now).previous.incidents === 0,
  );

  // Mốc chốt theo lastAt (sự cố kéo dài qua đêm tính vào ngày kết thúc).
  const crossMidnight = [
    mk("s", 1, { firstAt: now - DAY - 3600_000, lastAt: now - DAY + 3600_000 }),
  ];
  check(
    "sự cố qua đêm vẫn tính vào kỳ gần nhất",
    compareIncidentPeriods(crossMidnight, now).current.incidents === 1,
  );

  // Gom theo ngày: mọi sự cố phải xuất hiện đúng một lần, ngày mới trước.
  const spread = [mk("x", 0.2), mk("y", 1.5), mk("z", 0.3), mk("w", 3)];
  const days = groupIncidentsByDay(spread, "vi-VN", now);
  check("gom ra nhiều nhóm ngày", days.length >= 2, String(days.length));
  check("mọi sự cố xuất hiện đúng một lần", days.flatMap((d) => d.items).length === spread.length);
  check("ngày mới nhất đứng trước", days[0].key > days[days.length - 1].key);
  check(
    "trong nhóm, sự cố mới hơn đứng trước",
    (() => {
      const first = days[0].items;
      return first.length < 2 || first[0].lastAt >= first[first.length - 1].lastAt;
    })(),
  );
  check(
    "ngày của hôm nay được gắn nhãn riêng",
    groupIncidentsByDay([mk("t", 0.1)], "vi-VN", now)[0].label === "Hôm nay",
  );
  check("danh sách rỗng → không có nhóm nào", groupIncidentsByDay([]).length === 0);

  // Tổng hợp theo module.
  const byMod = summarizeByModule([
    mk("1", 1, { module: "massKick", blocked: 5 }),
    mk("2", 2, { module: "massBan", blocked: 9 }),
  ]);
  check(
    "module nhiều sự cố nhất đứng đầu",
    byMod[0].module === "massBan" && byMod[0].incidents === 1 && byMod[0].blocked === 9,
  );
  check(
    "tổng hợp khớp số sự cố đưa vào",
    summarizeByModule(list).reduce((n, m) => n + m.incidents, 0) === list.length,
  );
}

// ── #10 hàng đợi việc ở trang Admin (đợt #4) ──
console.log("── #10 hàng đợi việc (Admin) ──");
{
  const statusSrc = readFileSync(
    fileURLToPath(new URL("../convex/status.ts", import.meta.url)),
    "utf8",
  );
  const adminSrc = readFileSync(
    fileURLToPath(new URL("../src/pages/Admin.tsx", import.meta.url)),
    "utf8",
  );

  // getJobBacklog phải là QUERY (chỉ đọc) và tự guard owner — trả null thay vì
  // lộ hàng đợi của mọi server cho tài khoản thường.
  const backlogBody = statusSrc.slice(
    statusSrc.indexOf("export const getJobBacklog"),
    statusSrc.indexOf("export const getHostHealth"),
  );
  check("getJobBacklog là query", /export const getJobBacklog = query\(/.test(statusSrc));
  // 07/10/2026 — YÊU CẦU ĐỔI: cửa sổ Admin mở cho cả QUẢN TRỊ VIÊN NHÓM (do
  // chủ bot đặt trong `hidden.setTeamAdmins`), nên guard đúng là isBotAdminUser
  // (= chủ bot HOẶC quản trị viên nhóm). Vẫn phải trả null cho tài khoản
  // thường — đó là điều check này bảo vệ.
  check(
    "getJobBacklog guard admin (isBotAdminUser) → null cho tài khoản thường",
    /isBotAdminUser\(user, status\)\) return null/.test(backlogBody),
  );
  check("getJobBacklog nhận token qua args", /args: \{ token: v\.string\(\) \}/.test(backlogBody));
  check(
    "ngưỡng kẹt nằm ở hằng số STUCK_AFTER_MS = 15 phút",
    /const STUCK_AFTER_MS = 15 \* 60_000;/.test(statusSrc),
  );
  check("danh sách kẹt cắt còn tối đa 20 dòng", /stuck: stuck\.slice\(0, 20\)/.test(backlogBody));

  // Thẻ trên UI phải gọi đúng query (có token, không owner thì skip).
  check(
    "thẻ hàng đợi gọi api.status.getJobBacklog kèm token",
    /useQuery\(api\.status\.getJobBacklog, token \? \{ token \} : "skip"\)/.test(adminSrc),
  );
  check("thẻ hàng đợi được render trong trang Admin", /<JobBacklogCard \/>/.test(adminSrc));
}

// ── #11 sheet panel trên mobile (đợt #4) ──
console.log("── #11 sheet panel mobile ──");
{
  check("ngưỡng desktop khớp Tailwind lg (1024px)", DESKTOP_BREAKPOINT_PX === 1024);
  check(
    "media query loại trừ chắc với lg (1023.98px)",
    NARROW_MEDIA_QUERY === "(max-width: 1023.98px)" && isNarrowViewport(1023.98),
  );
  check(
    "rộng < lg → hẹp",
    isNarrowViewport(375) && isNarrowViewport(768) && isNarrowViewport(1023),
  );
  check("rộng >= lg → không hẹp", !isNarrowViewport(1024) && !isNarrowViewport(1440));
  check(
    "không đo được bề rộng (SSR/test) → coi như desktop, KHÔNG mở sheet",
    !isNarrowViewport(undefined) && !isNarrowViewport(NaN),
  );

  check("panel mặc định là overview", HOME_SECTION === "overview");
  check(
    "mở sheet: hẹp + panel khác overview",
    shouldUsePanelSheet(true, "antinuke") && shouldUsePanelSheet(true, "settings"),
  );
  check(
    "KHÔNG mở sheet: panel mặc định (vào app là phải thấy dashboard)",
    !shouldUsePanelSheet(true, HOME_SECTION),
  );
  check("KHÔNG mở sheet: màn hình rộng", !shouldUsePanelSheet(false, "antinuke"));

  const sheetSrc = readFileSync(
    fileURLToPath(new URL("../src/components/MobilePanelSheet.tsx", import.meta.url)),
    "utf8",
  );
  const guildPageSrc = readFileSync(
    fileURLToPath(new URL("../src/pages/GuildPage.tsx", import.meta.url)),
    "utf8",
  );

  // Portal là bắt buộc: PageReveal đặt `transform` trên <main>, theo đặc tả CSS
  // thì `fixed` bên trong sẽ bám vào <main> thay vì viewport → sheet cắt/kệch.
  check(
    "sheet render qua portal ra document.body (nép transform của PageReveal)",
    /createPortal\(/.test(sheetSrc) && /document\.body/.test(sheetSrc),
  );
  check("sheet phủ kín màn hình", /fixed inset-0 z-50/.test(sheetSrc));
  check(
    "sheet khoá cuộn trang nền khi mở",
    /document\.body\.style\.overflow = "hidden"/.test(sheetSrc),
  );
  check("Esc đóng được sheet", /e\.key === "Escape"/.test(sheetSrc));
  check(
    "sheet khai báo role/aria-modal + nhãn tên panel",
    /role="dialog"/.test(sheetSrc) &&
      /aria-modal="true"/.test(sheetSrc) &&
      /aria-label=\{title\}/.test(sheetSrc),
  );
  check(
    "vùng cuộn của sheet không kéo theo trang nền",
    /overscroll-contain/.test(sheetSrc) && /min-h-0 flex-1 overflow-y-auto/.test(sheetSrc),
  );

  // Panel chỉ được mount MỘT lần — vẽ cùng khối ở cả hai nhánh sẽ khiến mỗi
  // panel chạy đôi useQuery của Convex.
  const panelNodeUses = guildPageSrc.match(/panelNode/g)?.length ?? 0;
  check(
    "thân panel tạo một lần và dùng ở cả hai nhánh",
    panelNodeUses === 3 && /const panelNode = \(/.test(guildPageSrc),
  );
  check(
    "đóng sheet đi qua goToSection (không bỏ qua hỏi 'còn thay đổi chưa lưu')",
    /goToSection\(HOME_SECTION as SectionKey\)/.test(guildPageSrc) &&
      /const closeSheet = useCallback\(/.test(guildPageSrc),
  );
  check(
    "GuildPage bám breakpoint: bố cục desktop 2 cột vẫn còn",
    /lg:grid-cols-\[230px_1fr\]/.test(guildPageSrc),
  );
  check(
    "tiêu đề nhóm vẫn ẩn ở mobile (nav là hàng cuộn ngang)",
    /hidden px-3 pb-1 pt-2[^"]*lg:block/.test(guildPageSrc),
  );
}

// ── #12 mô phỏng auto-reply trên web (đợt #15) ──
console.log("── #12 mô phỏng auto-reply ──");
{
  const rule = (over: Partial<SimRule> = {}): SimRule => ({
    _id: "r1",
    name: "Rule",
    triggerType: "keyword",
    keywords: ["xin"],
    response: "chào",
    channels: [],
    ...over,
  });
  const msg = (over: Partial<SimInput> = {}): SimInput => ({
    content: "cho mình xin file",
    mentioned: false,
    channelId: "c1",
    username: "An",
    ...over,
  });

  // Khớp keyword: substring, KHÔNG phân biệt hoa thường (bot cũng lowercase cả 2 phía).
  check(
    "keyword khớp theo substring và không phân biệt hoa thường",
    simulateAutoReply([rule()], msg({ content: "CHO MÌNH XIN FILE" })).length === 1 &&
      simulateAutoReply([rule({ keywords: ["XIN"] })], msg()).length === 1,
  );
  check(
    "nội dung không chứa keyword → không khớp",
    simulateAutoReply([rule({ keywords: ["bánh"] })], msg()).length === 0,
  );
  // Guard: keyword rỗng phải bị bỏ, nếu không thì MỌI tin nhắn đều khớp.
  check(
    "keyword rỗng trong danh sách không làm mọi tin nhắn khớp",
    simulateAutoReply([rule({ keywords: [""] })], msg({ content: "xyz" })).length === 0,
  );
  check(
    "trigger mention chỉ khớp khi tin nhắn có tag bot",
    simulateAutoReply([rule({ triggerType: "mention" })], msg({ mentioned: true })).length === 1 &&
      simulateAutoReply([rule({ triggerType: "mention" })], msg({ mentioned: false })).length === 0,
  );
  check(
    "rule mention KHÔNG khớp chỉ vì có chứa keyword của rule khác",
    simulateAutoReply([rule({ triggerType: "mention", keywords: ["xin"] })], msg()).length === 0,
  );
  check("rule tắt bị bỏ qua", simulateAutoReply([rule({ enabled: false })], msg()).length === 0);

  // Lọc kênh.
  check(
    "rule không chọn kênh nào → áp dụng mọi kênh",
    simulateAutoReply([rule({ channels: [] })], msg({ channelId: "bat-ky" })).length === 1,
  );
  check(
    "rule có chọn kênh: khớp khi đúng kênh, không khớp khi khác kênh",
    simulateAutoReply([rule({ channels: ["c1", "c2"] })], msg({ channelId: "c2" })).length === 1 &&
      simulateAutoReply([rule({ channels: ["c9"] })], msg({ channelId: "c1" })).length === 0,
  );
  check(
    "channelId = null (chưa đánh giá được) → bỏ qua lọc kênh",
    simulateAutoReply([rule({ channels: ["c9"] })], msg({ channelId: null })).length === 1,
  );

  // Bot chỉ gửi rule ĐẦU TIÊN khớp (return sau reply đầu) — phần tử đầu là rule thắng.
  const twoMatches = simulateAutoReply(
    [rule({ _id: "thang", name: "Thắng" }), rule({ _id: "thua", name: "Thua" })],
    msg(),
  );
  check("nhiều rule khớp → trả về tất cả", twoMatches.length === 2);
  check(
    "rule thắng (khớp trước) đứng đầu danh sách",
    twoMatches[0].rule._id === "thang" && twoMatches[1].rule._id === "thua",
  );

  // Placeholder: web thay {user} bằng @tên (không có id Discord), {username} bằng tên.
  check(
    "{user} → @tên và {username} → tên",
    simulateAutoReply([rule({ response: "{user} / {username}" })], msg({ username: "An" }))[0]
      .response === "@An / An",
  );
  check(
    "placeholder lạ giữ nguyên (không nuốt mất chữ)",
    simulateAutoReply([rule({ response: "giữ {unknown} nhé" })], msg())[0].response ===
      "giữ {unknown} nhé",
  );
  check(
    "username rỗng/toàn khoảng trắng → tên dự phòng",
    simulateAutoReply([rule({ response: "{user}" })], msg({ username: "   " }))[0].response ===
      "@Minh",
  );
  check(
    "không rule nào khớp → mảng rỗng",
    simulateAutoReply([rule({ keywords: ["z"] })], msg()).length === 0,
  );
  check("danh sách rule rỗng → mảng rỗng", simulateAutoReply([], msg()).length === 0);

  // HỢP ĐỒNG 1:1 với bot: đổi logic bot mà quên sửa bản web thì mô phỏng bịa
  // ra kết quả sai. TS không bắt được, nên khóa bằng đọc nguồn bot.
  const botMsg = readFileSync(
    fileURLToPath(new URL("../bot/src/handlers/messageCreate.js", import.meta.url)),
    "utf8",
  );
  const botUtil = readFileSync(
    fileURLToPath(new URL("../bot/src/util.js", import.meta.url)),
    "utf8",
  );
  check(
    "bot vẫn bỏ qua rule tắt + lọc kênh (khớp `enabled === false` vì schema bắt buộc)",
    /if \(!rule\.enabled\) continue;/.test(botMsg) &&
      /if \(!channelAllowed\(rule, message\)\) continue;/.test(botMsg),
  );
  check(
    "bot lọc kênh: rỗng = áp dụng mọi kênh",
    /if \(!rule\.channels \|\| rule\.channels\.length === 0\) return true;/.test(botMsg),
  );
  check(
    "bot khớp keyword giống hệt (bỏ keyword rỗng, lowercase 2 phía)",
    /\(rule\.keywords \|\| \[\]\)\.some\(\(k\) => k && content\.includes\(k\.toLowerCase\(\)\)\)/.test(
      botMsg,
    ),
  );
  check("bot chỉ trả lời rule ĐẦU TIÊN khớp", /return; \/\/ reply once per message/.test(botMsg));
  check(
    "bot thay placeholder {user}/{username} bằng replaceAll",
    /replaceAll\("\{user\}"/.test(botUtil) && /replaceAll\("\{username\}"/.test(botUtil),
  );
}

// ── #13 nhãn độ trễ + giờ Việt Nam (đợt #15) ──
console.log("── #13 độ trễ và giờ Việt Nam ──");
{
  check(
    "ngưỡng tăng dần: nhanh < trung bình < sự cố",
    LATENCY_FAST < LATENCY_SLOW && LATENCY_SLOW < INCIDENT_SLOW,
  );
  // Nhịp THẬT của bot là 180s (`setTimeout(runSyncLoop, 180_000)` trong
  // bot/src/index.js, heartbeat gộp vào chính lượt sync đó). Trước đây test
  // này khoá 60_000 — một kỳ vọng SAI được ghi vào test, nên đúng lúc code
  // hiển thị sai (khung "Cập nhật tiếp theo" và dòng "mỗi 60 giây") thì
  // không có gì đỏ. Nay khoá theo hằng số dùng chung.
  check(
    "nhịp sync của bot = 180s, đúng nhịp thật trong bot/src/index.js",
    SYNC_INTERVAL_MS === 180_000,
  );
  check("nhịp web dùng chung hằng số với nhịp bot", SYNC_INTERVAL_MS === BOT_SYNC_INTERVAL_MS);

  // Biên đúng bằng số phải rơi vào nhóm kế tiếp — `<` chứ không phải `<=`.
  check(
    `dưới ${LATENCY_FAST}ms → Nhanh`,
    latencyLabel(LATENCY_FAST - 1).label === "Nhanh" && latencyLabel(0).label === "Nhanh",
  );
  check(
    `từ ${LATENCY_FAST}ms → Trung bình (biên kín)`,
    latencyLabel(LATENCY_FAST).label === "Trung bình" &&
      latencyLabel(LATENCY_SLOW - 1).label === "Trung bình",
  );
  check(
    `từ ${LATENCY_SLOW}ms → Chậm (biên kín)`,
    latencyLabel(LATENCY_SLOW).label === "Chậm" && latencyLabel(9999).label === "Chậm",
  );
  check(
    "ba mức có ba nhãn khác nhau",
    new Set([0, LATENCY_FAST, LATENCY_SLOW].map((ms) => latencyLabel(ms).label)).size === 3,
  );
  check(
    "mức Chậm dùng màu lỗi, mức Nhanh không",
    latencyLabel(LATENCY_SLOW).cls.includes("destructive") &&
      !latencyLabel(0).cls.includes("destructive"),
  );
  check("độ trễ âm không làm vỡ (coi như nhanh)", latencyLabel(-5).label === "Nhanh");

  // Giờ Việt Nam = UTC+7: mốc UTC 20:00 là 03:00 NGÀY HÔM SAU ở VN. Nếu mất
  // phép +7 thì chuỗi sẽ chứa "20:00" chứ không "03:00".
  const lateUtc = Date.UTC(2026, 9, 3, 20, 0, 0); // VN: 04/10 03:00
  check(
    "fmtVietnam cộng đúng 7 giờ (20:00Z → 03:00 hôm sau)",
    fmtVietnam(lateUtc).includes("03:00") && fmtVietnam(lateUtc).includes("04"),
  );
  const midnightUtc = Date.UTC(2026, 9, 3, 17, 30, 0); // VN: 04/10 00:30
  check(
    "fmtVietnam xử lý đúng mốc nửa đêm ở VN",
    fmtVietnam(midnightUtc).includes("00:30") && fmtVietnam(midnightUtc).includes("04"),
  );
  check(
    "fmtVietnam tất định (cùng mốc ra cùng chuỗi)",
    fmtVietnam(lateUtc) === fmtVietnam(lateUtc),
  );
  check(
    "fmtVietnam không ném với mốc 0",
    typeof fmtVietnam(0) === "string" && fmtVietnam(0).length > 0,
  );
}

// ── #14 branding (avatar bot + Haimiya) ──
console.log("── #14 branding ──");
{
  check("chưa có dữ liệu (đang tải) → null", toBranding(undefined) === null);

  const full = toBranding({
    botAvatarUrl: "https://x/bot.png",
    haimiyaAvatarUrl: "https://x/h.png",
  });
  check(
    "giữ nguyên cả hai avatar khi có đủ",
    full?.botAvatarUrl === "https://x/bot.png" && full?.haimiyaAvatarUrl === "https://x/h.png",
    full,
  );
  check(
    "rỗng object vẫn ra Branding đầy đủ (không undefined lọt vào JSX)",
    full !== null && "botAvatarUrl" in full && "haimiyaAvatarUrl" in full,
  );

  // Schema khai `v.optional(v.string())` ⇒ `undefined` là giá trị thật.
  // Nếu lọt xuống JSX thì `src` của <img> thành chuỗi "undefined".
  const partial = toBranding({ botAvatarUrl: "https://x/bot.png" });
  check(
    "thiếu haimiyaAvatarUrl → null (KHÔNG undefined)",
    partial?.haimiyaAvatarUrl === null,
    partial,
  );
  const onlyH = toBranding({ haimiyaAvatarUrl: "https://x/h.png" });
  check("thiếu botAvatarUrl → null (KHÔNG undefined)", onlyH?.botAvatarUrl === null, onlyH);
  check(
    "cả hai đều undefined → cả hai null",
    toBranding({})?.botAvatarUrl === null && toBranding({})?.haimiyaAvatarUrl === null,
  );
  check(
    "null sẵn từ query → giữ null",
    toBranding({ botAvatarUrl: null, haimiyaAvatarUrl: null })?.botAvatarUrl === null,
  );
  check(
    "chuỗi rỗng là giá trị hợp lệ, KHÔNG bị đổi thành null",
    toBranding({ botAvatarUrl: "" })?.botAvatarUrl === "",
  );
  check(
    "mỗi lần gọi trả về object MỚI (không dùng chung tham chiếu)",
    toBranding({ botAvatarUrl: "a" }) !== toBranding({ botAvatarUrl: "a" }),
  );

  // Hook phải bám đúng query và gọi qua hàm thuần — không test được trong
  // script (useQuery của Convex cần ConvexProvider), nên khoá bằng đọc nguồn.
  const brandingSrc = readFileSync(
    fileURLToPath(new URL("../src/lib/useBranding.ts", import.meta.url)),
    "utf8",
  );
  check(
    "hook đọc đúng query hidden.getBotBranding",
    /useQuery\(api\.hidden\.getBotBranding\)/.test(brandingSrc),
  );
  check("hook đi qua hàm thuần toBranding", /return toBranding\(useQuery\(/.test(brandingSrc));

  // ── Chuẩn hoá avatar trước upload (bug 07/10/2026) ──────────────────────
  // Avatar Haimiya đang lưu là ảnh 3600×2025 ~1.1MB cho khung 192px: điện
  // thoại decode chậm, bitmap ~29MB, trang chủ hiện sọc nhăng. Contract:
  // BrandingPanel PHẢI đi qua normalizeAvatarFile (co ≤512px + chặn file hỏng).
  check("planAvatarResize: ảnh 3600×2025 → 512×288 (không giữ 7MP)", () => {
    const r = planAvatarResize(3600, 2025);
    return r.width === 512 && r.height === 288 && r.scale < 1;
  });
  check("planAvatarResize: ảnh đã nhỏ KHÔNG bị phóng to", () => {
    const r = planAvatarResize(192, 192);
    return r.width === 192 && r.height === 192 && r.scale === 1;
  });
  check("planAvatarResize: ảnh dọc vẫn co theo cạnh dài nhất", () => {
    const r = planAvatarResize(800, 2400);
    return r.width === 171 && r.height === AVATAR_MAX_DIM;
  });
  check("planAvatarResize: kích thước rỗng/âm bị từ chối", () => {
    try {
      planAvatarResize(0, 100);
      return false;
    } catch {
      try {
        planAvatarResize(-1, 100);
        return false;
      } catch {
        return true;
      }
    }
  });
  const brandPanelSrc = readFileSync(
    fileURLToPath(new URL("../src/components/dashboard/BrandingPanel.tsx", import.meta.url)),
    "utf8",
  );
  check(
    "BrandingPanel upload ĐÃ qua normalizeAvatarFile (file thô không được lên storage)",
    /const \{ blob \} = await normalizeAvatarFile\(file\)/.test(brandPanelSrc) &&
      /headers: \{ "Content-Type": blob\.type/.test(brandPanelSrc) &&
      /body: blob[,}]/.test(brandPanelSrc),
    "BrandingPanel lại upload file thô — ảnh 3600px/file hỏng sẽ lên production",
  );
  check("BrandingPanel vẫn chặn file >2MB trước khi decode", brandPanelSrc.includes("2_000_000"));
}

console.log("── #15 theo dõi kết quả backup/khôi phục (chống báo sai kết quả) ──");
{
  // Bug thật: sau khi bấm, trạng thái Convex trong React còn là bản CŨ của lượt
  // trước (kết quả mutation về trước, kết quả query tới sau một nhịp). Đọc thẳng
  // bản cũ ⇒ vừa bấm "Khôi phục" đã toast "Bot đã khôi phục xong", và lượt theo
  // dõi bị khoá nên lỗi thật không bao giờ hiện. judgeJobWatch chỉ cho kết luận
  // khi có bằng chứng của CHÍNH lượt này.
  const startedAt = T;

  // 1) Lượt vừa bấm, số liệu còn của lượt TRƯỚC (không cờ, không lỗi, mốc xong cũ).
  const staleDone = judgeJobWatch(
    { startedAt },
    { requested: false, error: null, errorAt: null, finishedAt: startedAt - 60_000 },
    { hasFinishMarker: true },
  );
  check(
    "trạng thái CŨ (mốc xong của lượt trước) → vẫn CHỜ, không báo xong",
    staleDone.outcome === "waiting",
  );

  const staleError = judgeJobWatch(
    { startedAt },
    { requested: false, error: "lỗi lượt trước", errorAt: startedAt - 60_000 },
    { hasFinishMarker: true },
  );
  check("lỗi của lượt TRƯỚC → vẫn CHỜ, không báo lỗi oan", staleError.outcome === "waiting");

  // 2) Đang chạy: ghi nhớ đã thấy cờ bật, và KHÔNG tạo object mới ở nhịp sau
  //    (object mới mỗi nhịp ⇒ setState vô hạn ⇒ render loop).
  const running = judgeJobWatch(
    { startedAt },
    { requested: true, error: null, errorAt: null, finishedAt: null },
    { hasFinishMarker: true },
  );
  check(
    "cờ yêu cầu đang bật → chờ + đánh dấu đã thấy cờ",
    running.outcome === "waiting" && running.watch.sawPending === true,
  );
  const armed: JobWatch = { startedAt, sawPending: true };
  const runningAgain = judgeJobWatch(
    armed,
    { requested: true, error: null, errorAt: null, finishedAt: null },
    { hasFinishMarker: true },
  );
  check(
    "đang chờ ở nhịp sau → giữ nguyên object watch (không render loop)",
    runningAgain.outcome === "waiting" && runningAgain.watch === armed,
  );

  // 3) Kết quả THẬT của lượt này.
  const freshError = judgeJobWatch(
    armed,
    { requested: false, error: "bot thiếu quyền", errorAt: startedAt + 1_000 },
    { hasFinishMarker: true },
  );
  check("lỗi MỚI (sau lúc bấm) → báo lỗi", freshError.outcome === "error");
  const freshDone = judgeJobWatch(
    armed,
    { requested: false, error: null, errorAt: null, finishedAt: startedAt + 1_000 },
    { hasFinishMarker: true },
  );
  check("mốc xong MỚI hơn lúc bấm → báo xong", freshDone.outcome === "done");
  const sameMs = judgeJobWatch(
    armed,
    { requested: false, error: null, errorAt: null, finishedAt: startedAt },
    { hasFinishMarker: true },
  );
  check(
    "mốc xong đúng bằng lúc bấm → CHỜ (biên: mốc này là của lượt trước)",
    sameMs.outcome === "waiting",
  );

  // 4) Luồng KHÔNG có mốc "xong" (import — server chỉ xoá cờ yêu cầu): biết chắc
  //    xong chỉ khi đã TỪNG thấy cờ bật lên.
  const importStale = judgeJobWatch(
    { startedAt },
    { requested: false, error: null, errorAt: null },
    { hasFinishMarker: false },
  );
  check(
    "import: chưa từng thấy cờ bật → CHỜ (không báo 'khôi phục xong' ngay khi vừa bấm)",
    importStale.outcome === "waiting",
  );
  const importDone = judgeJobWatch(
    { startedAt, sawPending: true },
    { requested: false, error: null, errorAt: null },
    { hasFinishMarker: false },
  );
  check("import: cờ bật rồi tắt → báo xong", importDone.outcome === "done");

  // 5) Neo nguồn: panel phải đi qua hàm thuần và truyền đúng mốc của từng lượt
  //    (thiếu mốc ⇒ rơi vào luật "đã thấy cờ bật", tức lại chờ nhịp cập nhật).
  const panelSrc = readFileSync(
    fileURLToPath(new URL("../src/components/dashboard/BackupPanel.tsx", import.meta.url)),
    "utf8",
  );
  check("panel dùng chung judgeJobWatch", (panelSrc.match(/judgeJobWatch\(/g)?.length ?? 0) >= 3);
  check(
    "lượt restore so mốc restoreFinishedAt, lượt backup so backupFinishedAt",
    /finishedAt: importStatus\.restoreFinishedAt/.test(panelSrc) &&
      /finishedAt: importStatus\.backupFinishedAt/.test(panelSrc),
  );
  check(
    "lượt import khai báo KHÔNG có mốc xong (hasFinishMarker: false)",
    /hasFinishMarker: false/.test(panelSrc),
  );
}

console.log("── #16 vòng lặp đăng nhập: mô phỏng điều hướng + luật của /auth ──");
{
  // Người dùng báo "đăng nhập vô rồi mà cứ duplicate nhảy đăng nhập và yêu cầu
  // đăng nhập lại" HAI lần. Hai bản vá trước chỉ chỉnh KHOÁ chống lặp (sessionStorage
  // → localStorage), mà gốc rễ là hai chỗ khác:
  //   (a) Dashboard TỰ chuyển trang sang Discord khi effect mount chạy lại — mà
  //       `me` đổi object mỗi lần Convex cập nhật (heartbeat ~60 giây) ⇒ cứ ~10
  //       phút (hết cooldown) là cả trang bị nhảy sang Discord một lần nữa.
  //   (b) `/auth` LUÔN hiện form đăng nhập, kể cả khi phiên còn sống ⇒ bấm Back
  //       sau khi đăng nhập, hoặc mở lại bookmark /auth, là thấy "yêu cầu đăng
  //       nhập lại"; `returnTo` trỏ về chính /auth thì vòng lặp không lối ra.
  //
  // Test này mô phỏng ĐIỀU HƯỚNG thật bằng chính hàm thuần của app
  // (`resolveAuthPageState`, `safeRedirectPath`) + luật chuyển hướng của
  // RequireAuth (có neo nguồn ngay bên dưới để bản mô phỏng không trôi lệch).
  const requireAuthRoute = (hasToken: boolean, me: unknown, path: string): string => {
    if (!hasToken) return "/auth";
    if (me === undefined) return path; // đang tải → ở lại chờ splash
    if (me === null) return "/auth";
    return path;
  };

  type WalkResult = { visited: string[]; stopped: string; loops: boolean };
  const walk = (
    start: string,
    state: { hasToken: boolean; me: unknown; returnTo: string | null },
    maxSteps = 12,
  ): WalkResult => {
    const visited: string[] = [];
    let current = start;
    for (let i = 0; i < maxSteps; i++) {
      visited.push(current);
      if (current.startsWith("/auth")) {
        const decision = resolveAuthPageState({
          hasToken: state.hasToken,
          me: state.me,
          returnTo: state.returnTo,
        });
        if (decision.kind !== "app") return { visited, stopped: decision.kind, loops: false };
        current = decision.to;
        continue;
      }
      const next = requireAuthRoute(state.hasToken, state.me, current);
      if (next === current) return { visited, stopped: "stay", loops: false };
      current = next;
    }
    return { visited, stopped: "max", loops: true };
  };

  const authed = { hasToken: true, me: { user: { discordId: "1" }, guilds: [] } };
  const authVisits = (r: WalkResult) => r.visited.filter((p) => p.startsWith("/auth")).length;

  // (b) Quyết định của /auth — bảng sự thật.
  check(
    "chưa có token → hiện form đăng nhập",
    resolveAuthPageState({ hasToken: false, me: null, returnTo: "/dashboard" }).kind === "login",
  );
  check(
    "đang tải phiên (me undefined) → splash, KHÔNG hiện form đăng nhập",
    resolveAuthPageState({ hasToken: true, me: undefined, returnTo: null }).kind === "splash",
  );
  check(
    "token + phiên hợp lệ → vào thẳng app (không hỏi lại)",
    resolveAuthPageState({ hasToken: true, me: authed.me, returnTo: "/dashboard/9" }).kind ===
      "app",
  );
  check(
    "token nhưng phiên đã hết hạn (me null) → hiện form (đúng: phải đăng nhập lại thật)",
    resolveAuthPageState({ hasToken: true, me: null, returnTo: "/dashboard" }).kind === "login",
  );
  check(
    "đích đến chặn vòng lặp: returnTo=/auth → đưa về /dashboard",
    (() => {
      const r = resolveAuthPageState({
        hasToken: true,
        me: authed.me,
        returnTo: "/auth?returnTo=%2Fauth",
      });
      return r.kind === "app" && r.to === "/dashboard";
    })(),
  );
  check(
    "đích đến chặn vòng lặp: returnTo=/discord/callback → đưa về /dashboard",
    (() => {
      const r = resolveAuthPageState({
        hasToken: true,
        me: authed.me,
        returnTo: "/discord/callback?code=x",
      });
      return r.kind === "app" && r.to === "/dashboard";
    })(),
  );
  check(
    "isAuthLoopTarget: nhận đúng /auth và /discord/callback (kể cả kèm query/slash thừa)",
    isAuthLoopTarget("/auth") &&
      isAuthLoopTarget("/auth?returnTo=x") &&
      isAuthLoopTarget("/auth/") &&
      isAuthLoopTarget("/discord/callback") &&
      !isAuthLoopTarget("/dashboard") &&
      !isAuthLoopTarget("/dashboard/auth") &&
      !isAuthLoopTarget("/authorize"),
  );
  check(
    "returnTo ngoài origin (https://evil.com) → fallback /dashboard",
    (() => {
      const r = resolveAuthPageState({
        hasToken: true,
        me: authed.me,
        returnTo: "https://evil.com",
      });
      return r.kind === "app" && r.to === "/dashboard";
    })(),
  );

  // (a) Mô phỏng điều hướng: KHÔNG kịch bản nào được lặp, và mỗi lần đi qua
  // /auth tối đa 1 lượt (nhiều hơn = người dùng bị hỏi đăng nhập lặp).
  const scenarios: { name: string; start: string; state: Parameters<typeof walk>[1] }[] = [
    {
      name: "khách chưa đăng nhập mở /dashboard/123 → sang /auth đúng 1 lần rồi dừng",
      start: "/dashboard/123",
      state: { hasToken: false, me: null, returnTo: null },
    },
    {
      name: "đã đăng nhập mở /dashboard → Ở LẠI, không đi đâu cả",
      start: "/dashboard",
      state: { hasToken: true, me: authed.me, returnTo: null },
    },
    {
      name: "BẤM BACK sau khi đăng nhập (vào /auth?returnTo=/dashboard/123) → quay lại dashboard, KHÔNG hỏi lại",
      start: "/auth?returnTo=%2Fdashboard%2F123",
      state: { hasToken: true, me: authed.me, returnTo: "/dashboard/123" },
    },
    {
      name: "bookmark /auth khi phiên còn sống → vào dashboard, không thấy form đăng nhập",
      start: "/auth",
      state: { hasToken: true, me: authed.me, returnTo: null },
    },
    {
      name: "returnTo là chính /auth (URL mã hoá hai lần) → KHÔNG lặp vô hạn",
      start: "/auth",
      state: {
        hasToken: true,
        me: authed.me,
        returnTo: "/auth?returnTo=%252Fauth%253FreturnTo%253D%25252Fauth",
      },
    },
    {
      name: "phiên hết hạn thật → về /auth và DỪNG ở form đăng nhập (không vòng)",
      start: "/dashboard",
      state: { hasToken: true, me: null, returnTo: null },
    },
    {
      name: "đang tải phiên (me undefined) → chờ tại chỗ, không đá sang /auth",
      start: "/dashboard",
      state: { hasToken: true, me: undefined, returnTo: null },
    },
  ];
  for (const s of scenarios) {
    const r = walk(s.start, s.state);
    check(`${s.name}`, !r.loops && authVisits(r) <= 1, JSON.stringify(r.visited));
  }

  // (a) Neo nguồn: bản mô phỏng phải khớp ĐÚNG luật trong RequireAuth.tsx và
  // Dashboard phải không còn đường tự chuyển trang nào.
  const requireAuthSrc = readFileSync(
    fileURLToPath(new URL("../src/components/RequireAuth.tsx", import.meta.url)),
    "utf8",
  );
  check(
    "RequireAuth giữ đúng 2 điều kiện chuyển hướng mà bản mô phỏng dựa vào",
    /if \(!token\)/.test(requireAuthSrc) &&
      /if \(me === null\)/.test(requireAuthSrc) &&
      (requireAuthSrc.match(/Navigate to=\{`\/auth\?returnTo=/g) || []).length === 2,
  );
  const dashboardSrc = readFileSync(
    fileURLToPath(new URL("../src/pages/Dashboard.tsx", import.meta.url)),
    "utf8",
  );
  check(
    "Dashboard: 0 đường tự động sang Discord (assign nằm trong refreshServerList, gọi từ nút Tải lại)",
    (dashboardSrc.match(/window\.location\.(assign|replace)\(/g) || []).length === 1 &&
      /async function refreshServerList\(\)[\s\S]{0,700}?window\.location\.assign\(buildSilentAuthorizeUrl/.test(
        dashboardSrc,
      ) &&
      /onClick=\{handleRefresh\}/.test(dashboardSrc),
  );
  check(
    "Dashboard: effect mount không gọi làm mới (nguồn gốc vòng lặp cũ)",
    !/useEffect\([\s\S]{0,300}?refreshServerList\(/.test(dashboardSrc),
  );
}

// ── #16 nhịp tim bot ⇄ ngưỡng hiển thị trạng thái (bản vá "web báo bot mất kết nối") ──
// Gốc rễ: heartbeat toàn cục của bot được ghi mỗi 180s
// (`setTimeout(runSyncLoop, 180_000)` — hẹn nhịp KẾ TIẾP sau khi lượt trước chạy
// xong, nên chu kỳ ≥ 180s), còn web lấy ĐÚNG 180s làm ngưỡng "còn tươi" ⇒ cứ
// vài phút lại có một quãng web hiện "mất kết nối" trong khi bot đang chạy.
// Riêng heartbeat của TỪNG guild còn thưa hơn 5 lần (~15 phút/lần vì bot chỉ
// ghi lại field đó mỗi `runCounter % 5 === 0`), nên dùng chung ngưỡng 180s thì
// gần như mọi server đều hiện "Bot offline".
console.log("── #16 nhịp tim bot ⇄ ngưỡng hiển thị ──");
{
  const now = T;

  check(
    "ngưỡng online rộng ít nhất 2 nhịp sync (bỏ qua được 1 nhịp lỡ)",
    BOT_ONLINE_WINDOW_MS >= 2 * BOT_SYNC_INTERVAL_MS,
  );
  check(
    "ngưỡng online phải RỘNG HƠN 1 nhịp (đúng lỗi cũ: bằng 1 nhịp là nhấp nháy offline)",
    BOT_ONLINE_WINDOW_MS > BOT_SYNC_INTERVAL_MS,
  );
  check(
    "HEARTBEAT_FRESH_MS (tên cũ) nay trỏ đúng ngưỡng toàn cục",
    HEARTBEAT_FRESH_MS === BOT_ONLINE_WINDOW_MS,
  );

  // Ca chính của bản vá: heartbeat 200s tuổi là TRẠNG THÁI BÌNH THƯỜNG giữa
  // chu kỳ 180s — tuyệt đối không được coi là mất kết nối.
  check(
    "heartbeat 200s tuổi (giữa chu kỳ bình thường) vẫn TƯƠI",
    isHeartbeatFresh(now - 200_000, now) === true,
  );
  check(
    "isHeartbeatFresh tất định + biên kín (đúng ngưỡng là hết tươi)",
    isHeartbeatFresh(now - BOT_ONLINE_WINDOW_MS + 1, now) === true &&
      isHeartbeatFresh(now - BOT_ONLINE_WINDOW_MS, now) === false,
  );
  check(
    "heartbeat 10 phút tuổi → mất kết nối (bot chết thật)",
    isHeartbeatFresh(now - 600_000, now) === false,
  );
  check(
    "giá trị rác (null / NaN) không được coi là online",
    isHeartbeatFresh(null, now) === false && isHeartbeatFresh(Number.NaN, now) === false,
  );

  check(
    "nhịp refresh heartbeat của guild = 5 nhịp sync (đúng guildSync.js)",
    GUILD_HEARTBEAT_REFRESH_MS === 5 * BOT_SYNC_INTERVAL_MS,
  );
  check(
    "ngưỡng tươi của guild rộng hơn 1 chu kỳ refresh",
    GUILD_HEARTBEAT_FRESH_MS > GUILD_HEARTBEAT_REFRESH_MS,
  );
  // Ca chính thứ hai: 14 phút là tuổi heartbeat BÌNH THƯỜNG của một guild.
  check(
    "heartbeat guild 14 phút tuổi vẫn TƯƠI",
    isGuildHeartbeatFresh(now - 14 * 60_000, now) === true,
  );
  check(
    "heartbeat guild quá ngưỡng → hết tươi",
    isGuildHeartbeatFresh(now - GUILD_HEARTBEAT_FRESH_MS, now) === false,
  );
  check(
    "isGuildHeartbeatFresh ≠ isHeartbeatFresh (không dùng lẫn ngưỡng)",
    isHeartbeatFresh(now - 14 * 60_000, now) === false &&
      isGuildHeartbeatFresh(now - 14 * 60_000, now) === true,
  );

  // Trang server dùng CẢ HAI: badge "Bot online" (theo guild) + dải trạng thái
  // đồng bộ (syncState). Hai ngưỡng lệch nhau là tự mâu thuẫn ngay trên một
  // màn hình: badge nói online, dải nói "bot-offline".
  const settingsAt = now - SETTINGS_APPLY_WINDOW_MS - 1;
  const guildHeartbeat = now - 14 * 60_000;
  check(
    "syncState mặc định (heartbeat toàn cục) vẫn báo offline khi 14 phút im lặng",
    syncState({
      settingsChangedAt: settingsAt,
      botOnline: true,
      lastHeartbeat: guildHeartbeat,
      now,
    }) === "bot-offline",
  );
  check(
    "syncState với ngưỡng theo-guild → không báo offline oan",
    syncState({
      settingsChangedAt: settingsAt,
      botOnline: true,
      lastHeartbeat: guildHeartbeat,
      staleHeartbeatMs: GUILD_HEARTBEAT_FRESH_MS,
      now,
    }) === "sent",
  );
  check(
    "ngưỡng theo-guild không che bot chết thật (30 phút im lặng vẫn offline)",
    syncState({
      settingsChangedAt: settingsAt,
      botOnline: true,
      lastHeartbeat: now - 30 * 60_000,
      staleHeartbeatMs: GUILD_HEARTBEAT_FRESH_MS,
      now,
    }) === "bot-offline",
  );
}

// ── Bộ chọn trang trong HEADER: vai trò + nhãn "đang ở trang nào" ─────────────
// (07/10/2026) Hai hàm thuần này quyết định ai thấy mục "Cửa sổ Admin" và nút
// ở header ghi gì. Kiểm bằng cách GỌI THẬT — sai luật lọc ở đây là lỗi quyền
// (lộ cửa sổ Admin cho người thường) hoặc lỗi điều hướng (trang không có
// đường vào), cả hai đều im lặng nếu chỉ so chuỗi nguồn.
console.log("── #11 bộ chọn trang ở header: vai trò + nhãn ──");
{
  const asUser = visibleNavGroups({ isAdmin: false });
  const asAdmin = visibleNavGroups({ isAdmin: true });
  const flat = (groups: typeof asUser) => groups.flatMap((g) => g.items.map((i) => i.to));

  check("người dùng thường KHÔNG thấy mục /admin", !flat(asUser).includes("/admin"));
  check("admin (chủ bot hoặc quản trị viên nhóm) THẤY /admin", flat(asAdmin).includes("/admin"));
  check(
    "hai vai trò chỉ khác NHAU đúng mục /admin (không ẩn/lộ nhầm mục khác)",
    JSON.stringify(flat(asUser)) === JSON.stringify(flat(asAdmin).filter((p) => p !== "/admin")),
  );
  check(
    "không nhóm nào rỗng sau khi lọc (tiêu đề trống không được vẽ)",
    asUser.every((g) => g.items.length > 0) && asAdmin.every((g) => g.items.length > 0),
  );
  check(
    "lọc theo vai trò KHÔNG đụng dữ liệu gốc (navPaths vẫn đủ mọi trang)",
    navPaths().includes("/admin") && navPaths().length >= 8,
  );

  check(
    "nhãn trang hiện tại: trang con dùng nhãn mục cha",
    navLabelFor("/dashboard/42") === "Bảng điều khiển",
  );
  check(
    "nhãn trang hiện tại: khớp sâu hơn thắng",
    navLabelFor("/dashboard/42/history") === "Bảng điều khiển",
  );
  check(
    "nhãn trang hiện tại: /monitor → đúng nhãn mục",
    navLabelFor("/monitor") === "Giám sát bot",
  );
  // /status là ALIAS của /monitor (hosting 301 về /monitor, xem routes.json)
  // nên nó cố ý không nằm trong bảng chọn: gặp trực tiếp trong dev thì nút
  // ghi chữ mặc định chứ không hiện hai mục cùng trỏ một trang.
  check("alias /status không phải mục riêng trong bảng chọn", navLabelFor("/status") === null);
  check(
    "trang ngoài bảng chọn (pháp lý/404) trả null để nơi gọi tự đặt chữ",
    navLabelFor("/terms") === null && navLabelFor("/khong-ton-tai") === null,
  );
}

// ── #17 bóc lỗi Convex cho người dùng (bug /donate 07/10/2026) ─────────────
// Convex production mask message của Error thường thành
// "[Request ID: …] Server Error Called by client" — trang /donate từng in
// nguyên khối đó cho khách. friendlyConvexError phải luôn trả text đọc được.
console.log("── #17 friendlyConvexError ──");
{
  const fb = "Không tạo được đơn thanh toán — thử lại sau ít phút.";
  check(
    "đúng hình mask production → trả fallback, KHÔNG trả envelope Convex",
    friendlyConvexError(
      new Error(
        "[CONVEX A(paymentsAction:startPayment)] [Request ID: 096091acd38ce4ee] Server Error Called by client",
      ),
      fb,
    ) === fb,
  );
  check(
    "ConvexError data.message thắng mọi thứ (kênh không bị mask)",
    friendlyConvexError(
      Object.assign(new Error("[CONVEX A(x)] Server Error"), {
        data: {
          code: "ZALOPAY_UNAVAILABLE",
          message: "Không kết nối được ZaloPay — thử lại sau ít phút nhé.",
        },
      }),
      fb,
    ) === "Không kết nối được ZaloPay — thử lại sau ít phút nhé.",
  );
  check(
    "dev gửi 'Uncaught Error: …' → giữ nguyên lý do tiếng Việt",
    friendlyConvexError(
      new Error(
        "[CONVEX A(x)] [Request ID: abc] Server Error Uncaught Error: Cổng thanh toán chưa được cấu hình.",
      ),
      fb,
    ) === "Cổng thanh toán chưa được cấu hình.",
  );
  check(
    "message JSON của ConvexError khi data không tới tay → bóc được",
    friendlyConvexError(
      new Error(
        '[CONVEX A(x)] ConvexError {\n  "message": "Đơn bị từ chối (spam)."\n}\nCalled by client',
      ),
      fb,
    ) === "Đơn bị từ chối (spam).",
  );
  check(
    "lỗi thuần của server (không envelope) → giữ nguyên",
    friendlyConvexError(new Error("ZaloPay từ chối tạo đơn (đã trừ phí)."), fb) ===
      "ZaloPay từ chối tạo đơn (đã trừ phí).",
  );
  check("không phải Error / rỗng → fallback", friendlyConvexError(undefined, fb) === fb);
  check(
    "message chỉ toàn 'Server Error' → fallback",
    friendlyConvexError(new Error("Server Error"), fb) === fb,
  );

  // Trang /donate còn lại cũng phải dùng helper (không còn regex cũ).
  for (const rel of ["pages/DonatePage.tsx", "pages/PremiumPage.tsx", "pages/FeedbackPage.tsx"]) {
    const src = readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");
    check(
      `${rel} bóc lỗi qua friendlyConvexError (không còn regex Uncaught riêng lẻ)`,
      src.includes("friendlyConvexError(") && !src.includes("replace(/^Uncaught"),
    );
  }
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
