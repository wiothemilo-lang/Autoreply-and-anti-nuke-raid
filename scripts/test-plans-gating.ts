// TEST: trần kỹ thuật DÙNG CHUNG (convex/limits.ts) — bản miễn phí hoàn toàn.
// Chạy: bun scripts/test-plans-gating.ts
//
// VÌ SAO CẦN: Protogon đã gỡ toàn bộ gói trả phí. Hạn mức còn lại là TRẦN KỸ
// THUẬT (storage/CPU Convex), không phải ranh giới bán gói. Bộ test này khoá:
//   1. BẢNG TRẦN LÀ THẬT — đúng 8 khoá, đúng con số, mọi nơi đọc cùng bảng.
//   2. CHẶN Ở TẦNG GHI — assertWithinLimit cho qua đúng trần, chặn trần + 1,
//      lỗi nói rõ trần và phải giảm về đâu (không mơ hồ).
//   3. KHÔNG CÒN KHÁI NIỆM GÓI — không file convex/src nào đọc plan/entitlement
//      để cấp quyền; 4 điểm đọc (export, heat, history) dùng LIMITS.
// Hermetic: chỉ đọc file + gọi hàm thuần, không mạng, không DB.
import { readFileSync } from "node:fs";
import { LIMITS, LIMIT_LABELS, assertWithinLimit, type LimitKey } from "../convex/limits";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    (ok ? "PASS " : "FAIL ") +
      label +
      (ok || detail === undefined ? "" : " — " + JSON.stringify(detail)),
  );
  ok ? pass++ : fail++;
};
const readSrc = (rel: string) => readFileSync(new URL("../" + rel, import.meta.url), "utf8");

const EXPECTED: Record<LimitKey, number> = {
  autoReplyRules: 50,
  badWords: 100,
  backupKeepCount: 50,
  backupKeepDays: 365,
  exportRows: 2000,
  exportDays: 1095,
  heatTopRows: 50,
  historyRows: 200,
};

console.log("── 1. Bảng trần dùng chung ──");
{
  check("đúng 8 khoá hạn mức", Object.keys(LIMITS).length === 8, Object.keys(LIMITS));
  for (const key of Object.keys(EXPECTED) as LimitKey[]) {
    check("LIMITS." + key + " = " + EXPECTED[key], LIMITS[key] === EXPECTED[key], LIMITS[key]);
  }
  check(
    "mọi khoá đều có nhãn tiếng Việt",
    (Object.keys(LIMITS) as LimitKey[]).every((k) => (LIMIT_LABELS[k] ?? "").trim().length > 0),
    LIMIT_LABELS,
  );
}

console.log("\n── 2. assertWithinLimit: đúng trần cho qua, vượt thì chặn rõ ──");
{
  for (const key of Object.keys(LIMITS) as LimitKey[]) {
    let threwAtCap = "";
    try {
      assertWithinLimit(key, LIMITS[key]);
    } catch (e) {
      threwAtCap = e instanceof Error ? e.message : String(e);
    }
    check("cho qua đúng trần " + key, threwAtCap === "", threwAtCap);

    let msg = "";
    try {
      assertWithinLimit(key, LIMITS[key] + 1);
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    check(
      "chặn " + key + " khi vượt 1, nói rõ trần + cách giảm",
      msg ===
        "Tối đa " + LIMITS[key] + " " + LIMIT_LABELS[key] + ". Hãy giảm xuống " + LIMITS[key] + ".",
      msg,
    );
  }
}

console.log("\n── 3. Ghi phải đi qua cùng bảng trần ──");
{
  const gates: [string, string, RegExp][] = [
    ["convex/autoreplies.ts", "autoReplyRules", /assertWithinLimit\("autoReplyRules"/],
    ["convex/guilds/updateSettings.ts", "badWords", /assertWithinLimit\("badWords"/],
    ["convex/guilds/configPortability.ts", "badWords", /assertWithinLimit\("badWords"/],
    ["convex/dataExport.ts", "exportRows", /LIMITS\.exportRows/],
    ["convex/dataExport.ts", "exportDays", /LIMITS\.exportDays/],
    ["convex/dataExport.ts", "heatTopRows", /LIMITS\.heatTopRows/],
    ["convex/reports.ts", "heatTopRows", /LIMITS\.heatTopRows/],
    ["convex/guilds.ts", "historyRows", /LIMITS\.historyRows/],
  ];
  for (const [file, name, pattern] of gates) {
    check("cổng ghi: " + file + " dùng " + name, pattern.test(readSrc(file)));
  }
  const backup = readSrc("convex/backup.ts");
  const botBackup = readSrc("convex/bot_writes/backup.ts");
  check(
    "backup web kẹp 2..50 bản / 0..365 ngày",
    /Math\.max\(2, Math\.min\(50/.test(backup) && /Math\.max\(0, Math\.min\(365/.test(backup),
  );
  check(
    "backup bot kẹp 2..50 bản / 0..365 ngày",
    /clampRetention\([^)]*2,\s*50\)/.test(botBackup) &&
      /clampRetention\([^)]*0,\s*365\)/.test(botBackup),
  );
}

console.log("\n── 4. Không còn khái niệm gói/quyền lợi ──");
{
  const paidSymbols =
    /planForGuild|planLimits|PLAN_LIMITS|bestEntitlementForUser|entitlementSnapshotForUser|HARD_CAPS|SALES_ENABLED/;
  const files = [
    "convex/autoreplies.ts",
    "convex/backup.ts",
    "convex/bot_writes/backup.ts",
    "convex/dataExport.ts",
    "convex/reports.ts",
    "convex/guilds.ts",
    "convex/guilds/updateSettings.ts",
    "convex/hidden.ts",
    "src/pages/StatsPage.tsx",
    "src/components/dashboard/ExportCsvButton.tsx",
  ];
  for (const file of files) {
    check("không còn ký hiệu gói trong " + file, !paidSymbols.test(readSrc(file)));
  }
  const schema = readSrc("convex/schema.ts");
  check(
    "schema đã purge hẳn bảng payments/entitlements",
    !/payments: defineTable/.test(schema) && !/entitlements: defineTable/.test(schema),
  );
}

console.log("\n" + pass + "/" + (pass + fail) + " assertion xanh");
if (fail > 0) process.exit(1);
