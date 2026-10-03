#!/usr/bin/env node
// TEST: cổng "tín hiệu cấu hình" (scripts/check-settings-signal.cjs) — chạy:
// node scripts/test-settings-signal.cjs
//
// Bối cảnh: bot cache bundle cấu hình 30 phút; thay đổi từ dashboard chỉ tới bot
// ngay khi có `settingsChangedAt` (dashboard) hoặc proxy xoá cache (bot tự ghi).
// 6 chỗ sót cùng lớp đã được vá 23/09/2026 — suite này khoá lại bằng cách chạy
// bộ phân tích của CỔNG trên NGUỒN CONVEX THẬT, không chỉ snippet giả:
//
//   1. Cổng chạy trên repo hiện tại → phải sạch (0 vi phạm).
//   2. `--self-test` của cổng → mọi case phải đúng (cổng không mù, không báo nhầm).
//   3. Luật B: CONFIG_WRITE_MUTATIONS của bot khớp chính xác bot_writes (+ module con).
//   4. Hồi quy THẬT: gỡ `settingsChangedAt` khỏi updateLockdown / resetHeat /
//      requestUnlock / applyPreset trong file thật → cổng phải báo đúng field đó.
//      (Đây là bằng chứng cổng bắt được đúng lớp bug, không phải chỉ "chạy được".)
//   5. Hai mutation webhook dashboard phải ghi settingsChangedAt (cache webhook
//      phía bot TTL 5 phút → nay áp dụng trong ~1 tick).
//   6. Allowlist không có mục chết (mỗi mục phải ứng với mutation có thật).
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const guard = require("./check-settings-signal.cjs");

let pass = 0;
let fail = 0;
function check(label, cond) {
  if (cond) {
    pass++;
    console.log(`✅ ${label}`);
  } else {
    fail++;
    console.error(`❌ ${label}`);
  }
}

/** Tách khối `export const NAME = mutation({…});` từ nguồn thật. */
function extractMutation(src, name) {
  const at = src.indexOf(`export const ${name} = mutation({`);
  if (at < 0) return null;
  let depth = 0;
  let start = src.indexOf("{", at);
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(at, i + 1);
    }
  }
  return null;
}

const fields = guard.botFields();
const guildsSrc = fs.readFileSync(path.join(ROOT, "convex", "guilds.ts"), "utf8");
const presetsSrc = fs.readFileSync(path.join(ROOT, "convex", "presets.ts"), "utf8");
const webhooksSrc = fs.readFileSync(path.join(ROOT, "convex", "webhooks.ts"), "utf8");

// ── 1. Cổng chạy trên repo hiện tại ──
const run = spawnSync("node", [path.join(__dirname, "check-settings-signal.cjs")], {
  cwd: ROOT,
  encoding: "utf8",
});
check(
  "cổng chạy trên repo hiện tại → sạch (exit 0)",
  run.status === 0 && /settings-signal OK/.test(run.stdout || ""),
);

// ── 2. Self-test của cổng ──
const self = spawnSync("node", [path.join(__dirname, "check-settings-signal.cjs"), "--self-test"], {
  cwd: ROOT,
  encoding: "utf8",
});
const selfLines = (self.stdout || "").split("\n").filter((l) => l.includes("self-test:"));
check("self-test của cổng PASS (exit 0)", self.status === 0);
check(
  `self-test có ≥9 case và không case nào ❌ (nhận ${selfLines.length})`,
  selfLines.length >= 9 && !(self.stdout || "").includes("❌"),
);

// ── 3. Luật B trên nguồn thật ──
const botSet = guard.botConfigWriteSet();
// Đợt #5: suy tập bot-side từ wrapper ở bot_writes.ts → thân handler ở module con.
const derivedResult = guard.derivedBotWriteSet(path.join(ROOT, "convex"), fields);
const derived = derivedResult.derived;
check(
  `luật B: danh sách bot khớp bot_writes (+ module con) (${botSet.size} mutation)`,
  derivedResult.errors.length === 0 &&
    botSet.size === derived.size &&
    [...derived].every((n) => botSet.has(n)),
);
check(
  "luật B: checkBotSet() trên nguồn thật không báo lỗi",
  guard.checkBotSet(botSet, path.join(ROOT, "convex")).length === 0,
);

// ── 4. Hồi quy trên file THẬT: gỡ tín hiệu ⇒ cổng phải báo ──
const regressions = [
  { src: guildsSrc, name: "updateLockdown", expect: "lockdownEnabled" },
  { src: guildsSrc, name: "resetHeat", expect: "heatResetRequested" },
  { src: guildsSrc, name: "requestUnlock", expect: "lockdownRequested" },
  { src: presetsSrc, name: "applyPreset", expect: "*key-tính-toán*" },
];
for (const r of regressions) {
  const block = extractMutation(r.src, r.name);
  check(`tách được ${r.name} từ nguồn thật`, !!block);
  if (!block) continue;
  const now = guard.collectConfigWrites(block, fields);
  const nowViolations = now.filter((w) => !w.hasSignal);
  check(`${r.name}: bản hiện tại CÓ tín hiệu (không vi phạm)`, nowViolations.length === 0);

  const stripped = block.replace(/settingsChangedAt: Date\.now\(\),\s*/g, "");
  check(`${r.name}: gỡ tín hiệu làm thay đổi nguồn (test thật sự tác động)`, stripped !== block);
  const bad = guard.collectConfigWrites(stripped, fields).filter((w) => !w.hasSignal);
  const hitFields = bad.flatMap((w) => (w.computed ? [...w.fields, "*key-tính-toán*"] : w.fields));
  check(
    `${r.name}: gỡ tín hiệu → cổng báo đúng field (${r.expect})`,
    bad.length > 0 && hitFields.includes(r.expect),
  );
}

// ── 5. Webhook dashboard: bật/tắt + sửa lọc sự kiện phải ghi tín hiệu ──
for (const name of ["toggleDefaultWebhook", "updateDefaultWebhook"]) {
  const block = extractMutation(webhooksSrc, name);
  check(`${name}: có thật trong convex/webhooks.ts`, !!block);
  check(
    `${name}: ghi settingsChangedAt (cache webhook 5 phút → áp dụng trong ~1 tick)`,
    !!block && block.includes("settingsChangedAt"),
  );
}

// ── 6. Allowlist không có mục chết ──
const allConvexSrc = fs
  .readdirSync(path.join(ROOT, "convex"))
  .filter((f) => f.endsWith(".ts") && !f.startsWith("_"))
  .map((f) => fs.readFileSync(path.join(ROOT, "convex", f), "utf8"))
  .join("\n");
for (const key of Object.keys(guard.ALLOWLIST)) {
  const [file, name] = key.split("::");
  const keySrc = fs.readFileSync(path.join(ROOT, "convex", file), "utf8");
  check(`allowlist ${key}: mutation có thật + có lý do`, !!extractMutation(keySrc, name));
}
check(
  "allowlist: mọi mục có lý do (chuỗi giải thích)",
  Object.values(guard.ALLOWLIST).every((v) => typeof v === "string" && v.length > 20),
);
check("nguồn Convex quét được (không rỗng)", allConvexSrc.length > 1000);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
