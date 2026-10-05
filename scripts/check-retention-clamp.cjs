#!/usr/bin/env node
/**
 * scripts/check-retention-clamp.cjs — Trần lưu trữ backup phải GIỐNG NHAU ở
 * cả Convex lẫn dashboard.
 *
 * Vì sao trần này là hàng đầu với hạn mức Convex:
 *  - Gói Free của Convex chỉ có **0.5 GB storage** (tính cả rows và indexes;
 *    không tính file/backups của chính Convex). Xem docs.convex.dev
 *    → production/state/limits.
 *  - Bảng `guildBackups` + `backupChunks` giữ TOÀN BỘ cấu trúc server (roles +
 *    channels + tin nhắn) đã nén zlib. Đây là bảng to nhất trong hệ thống, và
 *    `backupKeepCount` là đòn bẩy duy nhất điều khiển nó.
 *  - Suy ra trần lớn nhất: guild × 50 bản. Với 11 server là 550 bản — mỗi bản
 *    vài MB ⇒ vượt 0.5 GB ⇒ chạm trần của Free. Còn mặc định (3 bản, tự động
 *    backup TẮT) thì rất thoải mái. Nói cách khác: trần quyết định tháng có
 *    đủ dùng hay không, nên nó phải MỘT con số duy nhất, không phải 5 bản sao.
 *
 * Vì sao cần cổng:
 *  - `backupKeepCount` bị clamp ở 5 chỗ / 3 file, và 2 chỗ nằm ở DASHBOARD
 *    (`BackupPanel.tsx`) — tức là HAI bên của một hợp đồng đang ghi magic number
 *    riêng. Chúng khớp hôm nay, nhưng không có gì chặn lần sửa tới chỉ một bên.
 *  - Kịch bản hỏng: dashboard cho nhập 50, Convex clamp 10 ⇒ chủ server tưởng
 *    giữ 50 bản, thực tế còn 10, và ngân sách storage âm thầm đổi. Đây đúng
 *    loại bug "im lặng" mà các cổng khác trong repo đã chặt.
 *
 * Chạy: node scripts/check-retention-clamp.cjs [--self-test]
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

/** Hợp đồng giữ bản — sửa ở ĐÂY thì sửa cả hai phía, cổng bắt phần còn sót. */
const KEEP_COUNT = { min: 2, max: 50, fallback: 3 };
const KEEP_DAYS = { min: 0, max: 365, fallback: 0 };

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/** Số trong `min={12}` / `max={50}` gần nhất phía trước `from` (trong `window` ký tự). */
function boundBefore(src, from, kind, window = 500) {
  const head = src.slice(Math.max(0, from - window), from);
  const hits = [...head.matchAll(new RegExp(`${kind}=\\{(\\d+)\\}`, "g"))];
  return hits.length ? Number(hits[hits.length - 1][1]) : null;
}

/** Mọi lời gọi `clampRetention(x, fallback, min, max)` kèm tên biến bên trái. */
function clampCalls(src, name) {
  const re = new RegExp(
    `(\\w+)\\s*=\\s*clampRetention\\(\\s*([^,]+),\\s*(-?\\d+),\\s*(-?\\d+),\\s*(-?\\d+)\\s*\\)`,
    "g",
  );
  return [...src.matchAll(re)]
    .filter((m) => m[1].includes(name))
    .map((m) => ({
      varName: m[1],
      fallback: Number(m[3]),
      min: Number(m[4]),
      max: Number(m[5]),
    }));
}

/**
 * Kiểm ba nguồn. Nhận nội dung qua tham số để `--self-test` nạp bản SAI vào và
 * chứng minh cổng đỏ — không thể tự chứng minh bằng bản đúng.
 */
function checkSources({ setRetention, botBackup, panel }) {
  const out = [];
  const add = (name, ok, detail) => out.push({ name, ok, detail });

  // ── 1. Convex: bot_writes/backup.ts (3 lời gọi cho mỗi setting) ──
  const cc = clampCalls(botBackup, "keepCount");
  const cd = clampCalls(botBackup, "keepDays");
  const badCC = cc.filter(
    (c) =>
      c.min !== KEEP_COUNT.min || c.max !== KEEP_COUNT.max || c.fallback !== KEEP_COUNT.fallback,
  );
  const badCD = cd.filter(
    (c) => c.min !== KEEP_DAYS.min || c.max !== KEEP_DAYS.max || c.fallback !== KEEP_DAYS.fallback,
  );
  add(
    badCC.length === 0 && cc.length > 0
      ? `Convex giữ bản: mọi clamp backupKeepCount đều ${KEEP_COUNT.min}..${KEEP_COUNT.max} (mặc định ${KEEP_COUNT.fallback})`
      : `Convex giữ bản: clamp backupKeepCount lệch hợp đồng ${KEEP_COUNT.min}..${KEEP_COUNT.max}/${KEEP_COUNT.fallback}`,
    badCC.length === 0 && cc.length > 0,
    `tìm thấy ${cc.length} clamp, lệch: ${badCC.map((c) => `${c.min}..${c.max}/mặc định ${c.fallback}`).join(", ")}`,
  );
  add(
    badCD.length === 0 && cd.length > 0
      ? `Convex giữ bản: mọi clamp backupKeepDays đều ${KEEP_DAYS.min}..${KEEP_DAYS.max}`
      : `Convex giữ bản: clamp backupKeepDays lệch hợp đồng ${KEEP_DAYS.min}..${KEEP_DAYS.max}`,
    badCD.length === 0 && cd.length > 0,
    `tìm thấy ${cd.length} clamp, lệch: ${badCD.map((c) => `${c.min}..${c.max}`).join(", ")}`,
  );

  // ── 2. Convex: backup.ts setRetention (đường ghi cấu hình từ dashboard) ──
  const clampRe = (min, max) => new RegExp(`Math\\.max\\(${min},\\s*Math\\.min\\(${max}`);
  const hasSetCC = clampRe(KEEP_COUNT.min, KEEP_COUNT.max).test(setRetention);
  const hasSetCD = clampRe(KEEP_DAYS.min, KEEP_DAYS.max).test(setRetention);
  add(
    hasSetCC
      ? "setRetention của dashboard clamp đúng 2..50"
      : "setRetention của dashboard KHÔNG clamp 2..50",
    hasSetCC,
  );
  add(
    hasSetCD
      ? "setRetention của dashboard clamp đúng 0..365"
      : "setRetention của dashboard KHÔNG clamp 0..365",
    hasSetCD,
  );

  // ── 3. Dashboard: ô nhập + clamp trong onChange ──
  const ccInput = panel.indexOf("value={keepCount}");
  const cdInput = panel.indexOf("value={keepDays}");
  const ccMin = boundBefore(panel, ccInput, "min");
  const ccMax = boundBefore(panel, ccInput, "max");
  const cdMin = boundBefore(panel, cdInput, "min");
  const cdMax = boundBefore(panel, cdInput, "max");
  add(
    ccMin === KEEP_COUNT.min && ccMax === KEEP_COUNT.max
      ? `Dashboard ô "Giữ N bản" có min/max ${ccMin}/${ccMax}`
      : `Dashboard ô "Giữ N bản" min/max = ${ccMin}/${ccMax}, cần ${KEEP_COUNT.min}/${KEEP_COUNT.max}`,
    ccMin === KEEP_COUNT.min && ccMax === KEEP_COUNT.max,
  );
  add(
    cdMin === KEEP_DAYS.min && cdMax === KEEP_DAYS.max
      ? `Dashboard ô "xoá bản cũ hơn" có min/max ${cdMin}/${cdMax}`
      : `Dashboard ô "xoá bản cũ hơn" min/max = ${cdMin}/${cdMax}, cần ${KEEP_DAYS.min}/${KEEP_DAYS.max}`,
    cdMin === KEEP_DAYS.min && cdMax === KEEP_DAYS.max,
  );
  const panelCC = /Math\.max\((\d+),\s*Math\.min\((\d+)/g;
  const clamps = [...panel.matchAll(panelCC)].map((m) => `${m[1]}..${m[2]}`);
  const wantCC = `${KEEP_COUNT.min}..${KEEP_COUNT.max}`;
  const wantCD = `${KEEP_DAYS.min}..${KEEP_DAYS.max}`;
  add(
    clamps.includes(wantCC) && clamps.includes(wantCD)
      ? "Dashboard clamp lúc gõ khớp hợp đồng (2..50 và 0..365)"
      : `Dashboard clamp lúc gõ lệch — thấy ${clamps.join(" / ")}, cần ${wantCC} và ${wantCD}`,
    clamps.includes(wantCC) && clamps.includes(wantCD),
  );

  // ── 4. Điểm mấu chốt: hai bên phải BẰNG NHAU ──
  add(
    ccMax === KEEP_COUNT.max
      ? "Hai phía cùng một trần lưu trữ (dashboard == Convex) nên ngân sách 0.5 GB xác định được"
      : "Trần lưu trữ LỆCH giữa dashboard và Convex",
    ccMax === KEEP_COUNT.max && ccInput > -1,
  );

  return out;
}

/** Tự kiểm: nạp nguồn CỐ TÌNH SAI và chứng minh cổng bắt được. */
function selfTest(real) {
  const results = [];
  // Làm lệch trần của ô nhập: đổi max={50} → max={10}
  const ccAt = real.panel.indexOf("value={keepCount}");
  const head = real.panel.slice(0, ccAt);
  const lastMax = head.lastIndexOf("max={50}");
  const broken =
    real.panel.slice(0, lastMax) + "max={10}" + real.panel.slice(lastMax + "max={50}".length);

  results.push({
    name: "self-test: cổng ĐỎ khi trần dashboard lệch (50 → 10)",
    ok: checkSources({ ...real, panel: broken }).some(
      (r) => r.name.includes("Dashboard ô") && !r.ok,
    ),
  });

  const brokenConvex = real.botBackup.replace(
    "clampRetention(guild?.backupKeepCount, 3, 2, 50)",
    "clampRetention(guild?.backupKeepCount, 3, 2, 10)",
  );
  results.push({
    name: "self-test: cổng ĐỎ khi clamp Convex lệch (max 50 → 10)",
    ok: checkSources({ ...real, botBackup: brokenConvex }).some(
      (r) => r.name.includes("backupKeepCount") && !r.ok,
    ),
  });

  const brokenDays = real.setRetention.replace(/Math\.min\(365,/, "Math.min(30,");
  results.push({
    name: "self-test: cổng ĐỎ khi trần tuổi lệch (365 → 30)",
    ok: checkSources({ ...real, setRetention: brokenDays }).some((r) => !r.ok),
  });

  results.push({
    name: "self-test: cổng XANH trên nguồn thật (không báo động giả)",
    ok: checkSources(real).every((r) => r.ok),
  });
  return results;
}

function print(results) {
  let fail = 0;
  for (const r of results) {
    if (r.ok) console.log(`PASS ${r.name}`);
    else {
      fail++;
      console.error(`FAIL ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
    }
  }
  console.log(`\nKết quả: ${results.length - fail} pass, ${fail} fail`);
  return fail;
}

if (require.main === module) {
  const real = {
    setRetention: read(path.join("convex", "backup.ts")),
    botBackup: read(path.join("convex", "bot_writes", "backup.ts")),
    panel: read(path.join("src", "components", "dashboard", "BackupPanel.tsx")),
  };
  const results = process.argv.includes("--self-test")
    ? [...selfTest(real), ...checkSources(real)]
    : checkSources(real);
  process.exit(print(results) ? 1 : 0);
}

module.exports = { checkSources, selfTest, KEEP_COUNT, KEEP_DAYS };
