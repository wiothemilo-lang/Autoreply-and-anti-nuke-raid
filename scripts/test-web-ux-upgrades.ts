// TEST: 4 nâng cấp UX web — cảnh báo chưa lưu, command palette, trạng thái
// đồng bộ, bật chống nuke hàng loạt.
// Chạy: bun scripts/test-web-ux-upgrades.ts
//
// Vì sao test: đây đều là lớp "người dùng hiểu sai" — chạy không lỗi gì nhưng
// dẫn tới mất cấu hình, tìm không ra panel, hoặc tưởng bot đã chạy cấu hình
// mới. Biên sai 1 phút / sai thứ tự tìm kiếm là hỏng mục đích.
import {
  confirmLeave,
  hasUnsavedChanges,
  setPanelDirty,
  unsavedPanelIds,
} from "../src/lib/useUnsavedChanges";
import { filterCommands, foldDiacritics, scoreCommand } from "../src/components/CommandPalette";
import { syncState, SETTINGS_APPLY_WINDOW_MS, STALE_HEARTBEAT_MS } from "../src/lib/syncState";
import { ensureDictionary, lookupTranslation, translate } from "../src/lib/i18n";
import { safeRedirectPath } from "../src/lib/discord";
import { CHUNK_RELOAD_COOLDOWN_MS, installStaleChunkRecovery } from "../src/lib/staleChunk";
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

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
