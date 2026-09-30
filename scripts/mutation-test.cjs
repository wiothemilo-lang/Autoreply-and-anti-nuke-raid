#!/usr/bin/env node
/**
 * mutation-test.cjs — Mutation testing NHẸ tự viết (Đợt 6), không dependency.
 *
 * Ý tưởng: thay đổi có chủ đích 1 phép so sánh/hằng số trong hàm thuần quan
 * trọng (mutant) → chạy lại bộ assertion từ test-property → mutant nào VẪN
 * pass hết (mutant SỐNG SÓT) nghĩa là test chưa soi kỹ chỗ đó — điểm cần thêm
 * test. Mutant bị giết (ít nhất 1 assert fail) = test phủ tốt phép tính đó.
 *
 * Cách làm: KHÔNG sửa file nguồn. Mỗi mutant là 1 bản rewrite chữ ký hàm qua
 * Module wrapper: nạp module từ source, monkey-patch exports với phiên bản
 * mutant của hàm THUẦN (dùng lại code thật bằng cách đọc text source và replace
 * đúng 1 token), rồi chạy assertions của test-property trỏ vào bản mutant.
 *
 * Chạy: node scripts/mutation-test.cjs           (mặc định: nhanh, 12 mutant)
 *       node scripts/mutation-test.cjs --full    (13 mutant — bộ đầy đủ)
 *
 * Chống "điểm xanh giả": anchor của mutant không còn khớp source (source đã
 * refactor) KHÔNG được đếm là "mutant bị giết" — script kiểm anchor trước khi
 * chạy và fail cứng kèm tên mutant cần cập nhật.
 */
const fs = require("fs");
const path = require("path");
const Module = require("module");

// shared.js require discord.js — cần mock như test-property để mutant nạp được.
// KHÔNG có mock thì mutant "crash lúc import" bị đếm nhầm là bị giết (kill giả).
const MOCK_PATH = path.join(__dirname, "..", "bot", "test-djs-mock.cjs");
/** Dọn file mock — gọi trước MỌI đường thoát để không để rác lại repo. */
function cleanupMock() {
  try {
    fs.unlinkSync(MOCK_PATH);
  } catch {
    /* chưa tạo thì thôi */
  }
}
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "discord.js") return MOCK_PATH;
  return origResolve.call(this, request, ...args);
};
fs.writeFileSync(
  MOCK_PATH,
  `class EmbedBuilder { constructor(d = {}) { this.d = d; } setColor() { return this; } setTitle() { return this; } setDescription() { return this; } addFields() { return this; } setTimestamp() { return this; } setFooter() { return this; } }
module.exports = { Colors: new Proxy({}, { get: () => 0x000000 }), EmbedBuilder, PermissionFlagsBits: new Proxy({}, { get: () => 1n }), UserFlags: { VerifiedBot: 1n << 16n }, AuditLogEvent: new Proxy({}, { get: (t, k) => (t[k] ??= Symbol(k)) }) };
`,
);

// ── rng seeded (giống test-property) ──
let _state = 0x2f6e2b1;
function rng() {
  _state ^= _state << 13;
  _state ^= _state >>> 17;
  _state ^= _state << 5;
  _state |= 0;
  return (_state >>> 0) / 0x100000000;
}
function int(min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}
function pick(arr) {
  return arr[int(0, arr.length - 1)];
}
function weirdString(len) {
  const pools = ["abcXYZ019_ ", "tiếngViệtổnățivlen", "🙂🔥👍", "\u200b\u0000\u202e", "𝕏ⓐⓑ"];
  let out = "";
  for (let i = 0; i < len; i++) out += pick(pools)[int(0, pick(pools).length - 1)];
  return out;
}

/** Nạp 1 module với source đã replace (không đụng đĩa) — qua require cache riêng. */
function loadMutant(relPath, from, to) {
  const abs = path.join(__dirname, "..", relPath);
  const src = fs.readFileSync(abs, "utf8");
  if (!src.includes(from)) {
    // Lỗi anchor KHÁC hẳn "mutant crash khi chạy" — phải fail cứng, xem khối
    // kiểm anchor trước vòng lặp bên dưới.
    const err = new Error(`mutant anchor không tìm thấy trong ${relPath}: ${from}`);
    err.name = "AnchorError";
    throw err;
  }
  const mutated = src.replace(from, to);
  const m = new Module(abs, null);
  m.filename = abs; // relative require giải từ đây (không set → resolve từ CWD → fail)
  m.paths = Module._nodeModulePaths(path.dirname(abs));
  m._compile(mutated, abs);
  return m.exports;
}

// ── Bộ assertion rút từ test-property (trả true nếu TẤT CẢ pass) ──
function assertSimilarity(mod) {
  const { usernameSimilarity } = mod;
  const CASES = [
    ["nguyenvana_2009", "nguyenvana_2009", (s) => s >= 90],
    ["abcdef", "xyzuvw", (s) => s === 0],
    ["mai", "mai", (s) => s === 0], // tên ngắn trùng hoàn toàn → 0 (guard <5 ký tự)
    ["Thang", "thang", (s) => s === 0],
    ["tranvanphuoc", "tranvanphu", (s) => s > 0 && s <= 100],
  ];
  for (const [a, b, ok] of CASES) if (!ok(usernameSimilarity(a, b))) return false;
  for (let i = 0; i < 150; i++) {
    const x = weirdString(int(0, 30)) || "abc12";
    const y = weirdString(int(0, 30)) || "def34";
    const s = usernameSimilarity(x, y);
    if (!Number.isFinite(s) || s < 0 || s > 100) return false;
    if (s !== usernameSimilarity(y, x)) return false;
  }
  return true;
}

function assertHitAndRun(mod) {
  const { botHitAndRunVerdict } = mod;
  const W = 10 * 60_000;
  const CASES = [
    [{ isBot: true, addedAt: 1000, leftAt: 1000 + W / 2, trusted: false }, true],
    [{ isBot: true, addedAt: 1000, leftAt: 1000 + W + 1, trusted: false }, false],
    [{ isBot: true, addedAt: 1000, leftAt: 900, trusted: false }, false], // timestamp âm
    [{ isBot: true, addedAt: 1000, leftAt: 1000, trusted: false }, false], // duration 0 — bot rời NGAY GIÂY được thêm
    [{ isBot: true, addedAt: 1000, leftAt: 1000 + W / 2, trusted: true }, false],
    [{ isBot: false, addedAt: 1000, leftAt: 1000 + W / 2, trusted: false }, false],
    [{ isBot: true, addedAt: 0, leftAt: 1000, trusted: false }, false],
  ];
  for (const [input, want] of CASES) if (botHitAndRunVerdict(input) !== want) return false;
  return true;
}

function assertSuspicion(mod) {
  const { memberSuspicionScore } = mod;
  const now = Date.now();
  if (memberSuspicionScore(null) !== 0) return false;
  if (memberSuspicionScore({ id: null }) !== 0) return false; // thiếu id → 0 (không crash)
  if (
    memberSuspicionScore({
      id: "u",
      createdAt: now - 2 * 86_400_000,
      avatar: null,
      username: "user123",
    }) !== 4
  )
    return false; // acc mới (2) + no avatar (1) + machine name (1)
  // acc 20 ngày: SỐNG SÓT mutant "acc mới < 70 ngày" nhưng KHÔNG sống sót "< 7 ngày" —
  // cố định ranh giới mutant-kill quanh 7 ngày đúng nơi nó nằm.
  if (
    memberSuspicionScore({
      id: "u",
      createdAt: now - 20 * 86_400_000,
      avatar: null,
      username: "Thang",
    }) !== 1
  )
    return false;
  if (
    memberSuspicionScore({
      id: "u",
      createdAt: now - 100 * 86_400_000,
      avatar: "h",
      username: "Thang",
    }) !== 0
  )
    return false;
  return true;
}

function assertBudgetGate(mod) {
  // Guild CHƯA từng ghi hành động phải được phép chạy — mutant đổi nhánh
  // `if (!list) return true` thành `return false` chết ngay tại đây.
  const { canPunish } = mod;
  return canPunish(`mut-guild-${int(1, 1e9)}`, { actionBudgetPerMinute: 5 }) === true;
}

function assertBudget(mod) {
  const { budgetLimitFor, DEFAULT_LIMIT } = mod;
  if (budgetLimitFor({}) !== DEFAULT_LIMIT) return false;
  if (budgetLimitFor({ actionBudgetPerMinute: 5 }) !== 5) return false;
  if (budgetLimitFor({ actionBudgetPerMinute: 0 }) !== DEFAULT_LIMIT) return false;
  if (budgetLimitFor({ actionBudgetPerMinute: 999 }) !== 200) return false;
  if (budgetLimitFor({ actionBudgetPerMinute: -3 }) !== DEFAULT_LIMIT) return false;
  return true;
}

/**
 * backupAudit.classifyBackup — quyết định bản backup bị XOÁ (--fix) hay giữ.
 * Mutant sống sót ở đây = có thể xoá nhầm backup thật của khách server, nên
 * assertion soi CẢ hai chiều: bản hỏng phải "fake", bản tốt phải "real".
 */
function assertClassifyBackup(mod) {
  const { classifyBackup, computeChecksum, unpackBackupJson } = mod;
  const zlib = require("node:zlib");
  const pack = (obj) =>
    "z:" + zlib.deflateSync(Buffer.from(JSON.stringify(obj))).toString("base64");
  const good = { version: 4, guildId: "g1", roles: [{ id: "r1" }], channels: [{ id: "c1" }] };

  // Bản tốt, checksum khớp → real
  if (
    classifyBackup({
      backupJson: pack(good),
      source: "backup",
      roleCount: 1,
      channelCount: 1,
      backupChecksum: computeChecksum(JSON.stringify(good)),
    }).verdict !== "real"
  )
    return false;
  // Bản tốt KHÔNG có checksum → vẫn real (bản cũ)
  if (
    classifyBackup({ backupJson: pack(good), source: "backup", roleCount: 1, channelCount: 1 })
      .verdict !== "real"
  )
    return false;
  // JSON hỏng → fake
  if (classifyBackup({ backupJson: "z:không-phải-zlib" }).verdict !== "fake") return false;
  // Rỗng → fake
  if (classifyBackup({ backupJson: "" }).verdict !== "fake") return false;
  if (classifyBackup({}).verdict !== "fake") return false;
  // Thiếu mảng roles/channels → fake (không khôi phục được)
  if (
    classifyBackup({
      backupJson: pack({ version: 4, guildId: "g1", channels: [] }),
      roleCount: 0,
      channelCount: 0,
    }).verdict !== "fake"
  )
    return false;
  if (
    classifyBackup({
      backupJson: pack({ version: 4, guildId: "g1", roles: [] }),
      roleCount: 0,
      channelCount: 0,
    }).verdict !== "fake"
  )
    return false;
  // Checksum LỆCH → suspect (không xoá tự động — cần xem tay)
  if (
    classifyBackup({
      backupJson: pack(good),
      roleCount: 1,
      channelCount: 1,
      backupChecksum: "sai-ham",
    }).verdict !== "suspect"
  )
    return false;
  // roleCount lệch → suspect
  if (
    classifyBackup({ backupJson: pack(good), roleCount: 99, channelCount: 1 }).verdict !== "suspect"
  )
    return false;
  // channelCount lệch → suspect (mutant đảo phép so số metadata chết ở đây)
  if (
    classifyBackup({ backupJson: pack(good), roleCount: 1, channelCount: 99 }).verdict !== "suspect"
  )
    return false;
  // Thiếu guildId trong snapshot → suspect, KHÔNG phải fake (file import .msc
  // hợp lệ thường không có guildId; xếp fake sẽ khiến --fix XOÁ NHẦM)
  const noGuildId = classifyBackup({
    backupJson: pack({ version: 4, roles: [{ id: "r1" }], channels: [{ id: "c1" }] }),
    roleCount: 1,
    channelCount: 1,
  });
  if (noGuildId.verdict === "fake") return false;
  if (!noGuildId.reasons.some((r) => r.includes("guildId"))) return false;
  // Nguồn lạ → suspect, KHÔNG phải fake
  if (
    classifyBackup({ backupJson: pack(good), source: "kẻ-lạ", roleCount: 1, channelCount: 1 })
      .verdict === "fake"
  )
    return false;
  // unpackBackupJson: rỗng / hỏng / hợp lệ
  if (unpackBackupJson("").json !== null) return false;
  if (unpackBackupJson("z:xx").json !== null) return false;
  if (JSON.stringify(unpackBackupJson(pack({ a: 1 })).json) !== JSON.stringify({ a: 1 }))
    return false;
  return true;
}

/**
 * util.canManageWithConfig — CỔNG QUYỀN. Cho qua = thành viên thường điều
 * khiển được bot; chặn nhầm = chủ server mất toàn bộ lệnh. Phải kiểm tra
 * đủ 4 đường: quyền thật, admin, role đã cấu hình, và mặc định là KHÔNG.
 */
function assertManageWithConfig(mod) {
  const { canManageWithConfig, canManageGuild, isAdmin } = mod;
  const perms = (...has) => ({ permissions: { has: () => has } });
  const roles = (...ids) => ({ roles: { cache: new Set(ids) } });
  const withPerms = { ...perms(true), roles: { cache: new Set() } };

  if (canManageWithConfig(null, {}) !== false) return false; // không có member → KHÔNG
  if (canManageWithConfig(withPerms, null) !== true) return false; // quyền thật, không cần config
  if (canManageWithConfig({ ...perms(false, true), roles: { cache: new Set() } }, {}) !== true)
    return false; // administrator
  if (canManageWithConfig(roles("mod-1"), { modRoles: ["mod-1"] }) !== true) return false;
  if (canManageWithConfig(roles("mod-1"), { adminRoles: ["mod-1"] }) !== true) return false;
  // Role KHÔNG nằm trong cấu hình → phải chặn (mutant "bỏ check config" sống ở đây)
  if (canManageWithConfig(roles("mod-1"), { modRoles: ["khác"] }) !== false) return false;
  if (canManageWithConfig(roles("mod-1"), { modRoles: [] }) !== false) return false;
  if (canManageWithConfig(roles("mod-1"), {}) !== false) return false;
  // Hàm gốc phải nhất quán với hàm cấp quyền
  if (canManageGuild(withPerms) !== true) return false;
  if (canManageGuild(null) !== false) return false;
  if (isAdmin({ ...perms(false, true), roles: { cache: new Set() } }) !== true) return false;
  return true;
}

/** Danh sách mutant: [file, from, to, assertFn, mô tả]. */
const MUTANTS = [
  // usernameSimilarity (altDetection.js)
  [
    "bot/src/altDetection.js",
    "if (a.length < 5 || b.length < 5) return 0;",
    "if (a.length < 5 || b.length < 5) return 0;\n  return 100;",
    "sim-guard-vô-hiệu",
    assertSimilarity,
  ],
  [
    "bot/src/altDetection.js",
    "if (a === b) return 100;",
    "if (a === b) return 50;",
    "sim-trùng-hoàn-toàn=50",
    assertSimilarity,
  ],
  [
    "bot/src/altDetection.js",
    "if (a === b) return 100;",
    "if (a === b) return 100; return 99;",
    "sim-mọi-cặp=99",
    assertSimilarity,
  ],
  // botHitAndRunVerdict (shared.js)
  [
    "bot/src/handlers/antinuke/shared.js",
    "if (leftAt - addedAt <= 0) return false;",
    "if (leftAt - addedAt < 0) return false;",
    "htr-cho-phép-0",
    assertHitAndRun,
  ],
  [
    "bot/src/handlers/antinuke/shared.js",
    "if (leftAt - addedAt > HIT_AND_RUN_WINDOW_MS) return false;",
    "if (leftAt - addedAt > HIT_AND_RUN_WINDOW_MS * 2) return false;",
    "htr-cửa-sổ-x2",
    assertHitAndRun,
  ],
  [
    "bot/src/handlers/antinuke/shared.js",
    "if (trusted) return false;",
    "if (false) return false;",
    "htr-bỏ-quan-tâm-trusted",
    assertHitAndRun,
  ],
  [
    "bot/src/handlers/antinuke/shared.js",
    "if (!isBot) return false;",
    "// mutant: bỏ check bot",
    "htr-bỏ-check-bot",
    assertHitAndRun,
  ],
  // memberSuspicionScore (shared.js)
  [
    "bot/src/handlers/antinuke/shared.js",
    "if (Number.isFinite(ageDays) && ageDays < 7) score += 2;",
    "if (Number.isFinite(ageDays) && ageDays < 70) score += 2;",
    "susp-acc-mới<70d",
    assertSuspicion,
  ],
  [
    "bot/src/handlers/antinuke/shared.js",
    "if (!p.avatar) score += 1;",
    "if (!p.avatar) score += 0;",
    "susp-avatar-bỏ-điểm",
    assertSuspicion,
  ],
  [
    "bot/src/handlers/antinuke/shared.js",
    "if (!p || !p.id) return 0;",
    "if (!p) return 0;",
    "susp-thiếu-id-crash",
    assertSuspicion,
  ],
  // budgetLimitFor (actionBudget.js)
  [
    "bot/src/actionBudget.js",
    "if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;",
    "if (!Number.isFinite(n) || n < 0) return DEFAULT_LIMIT;",
    "budget-nhận-0",
    assertBudget,
  ],
  [
    "bot/src/actionBudget.js",
    "return Math.min(200, Math.max(1, Math.floor(n)));",
    "return Math.min(200, Math.max(1, Math.floor(n * 2)));",
    "budget-trần-x2",
    assertBudget,
  ],
];

const FULL = [
  ...MUTANTS,
  // backupAudit.classifyBackup — quyết định xoá bản backup. Chặn nhầm ở đây
  // là mất dữ liệu thật của khách server, nên bộ mutant soi cả 2 chiều.
  [
    "bot/src/backupAudit.js",
    "if (missingRoles || missingChannels) {",
    "if (missingRoles) {",
    "audit-chỉ-so-roles",
    assertClassifyBackup,
  ],
  [
    "bot/src/backupAudit.js",
    'if (row.source && !VALID_SOURCES.has(row.source)) {\n    reasons.push(`nguồn lạ: "${row.source}"`);\n  }',
    'if (row.source && !VALID_SOURCES.has(row.source)) {\n    return { verdict: "fake", reasons: [`nguồn lạ: "${row.source}"`] };\n  }',
    "audit-nguồn-lạ-xoá-hẳn",
    assertClassifyBackup,
  ],
  [
    "bot/src/backupAudit.js",
    "if (recomputed && recomputed !== row.backupChecksum) {",
    "if (recomputed && recomputed === row.backupChecksum) {",
    "audit-checksum-đảo",
    assertClassifyBackup,
  ],
  [
    "bot/src/backupAudit.js",
    "if (Array.isArray(json.roles) && row.roleCount !== json.roles.length) {",
    "if (Array.isArray(json.roles) && row.roleCount === json.roles.length) {",
    "audit-đảo-so-roleCount",
    assertClassifyBackup,
  ],
  [
    "bot/src/backupAudit.js",
    'if (!json.guildId) reasons.push("thiếu guildId trong snapshot");',
    "// mutant: bỏ cảnh báo thiếu guildId",
    "audit-bỏ-cảnh-báo-thiếu-guildId",
    assertClassifyBackup,
  ],
  // util.canManageWithConfig — cổng quyền.
  [
    "bot/src/util.js",
    "if (!config || !member) return false;\n  const ids = [...(config.modRoles || []), ...(config.adminRoles || [])];",
    "if (!config || !member) return true;\n  const ids = [...(config.modRoles || []), ...(config.adminRoles || [])];",
    "quyền-không-có-config-vẫn-cho",
    assertManageWithConfig,
  ],
  [
    "bot/src/util.js",
    "return ids.some((id) => member.roles.cache.has(id));",
    "return ids.length > 0;",
    "quyền-role-sai-vẫn-cho",
    assertManageWithConfig,
  ],
  [
    "bot/src/actionBudget.js",
    "const list = hits.get(guildId);\n    if (!list) return true;",
    "const list = hits.get(guildId);\n    if (!list) return false;",
    "budget-guild-mới-bị-chặn",
    assertBudgetGate,
  ],
];

const only = process.argv.includes("--full") ? FULL : MUTANTS;

// ── Kiểm TRƯỚC khi chạy: anchor còn khớp source, mutant có assert ──
// Bản cũ để lỗi anchor rơi vào catch() và đếm là "mutant bị giết": chỉ cần
// refactor source một dòng là điểm mutation hiện 100% GIẢ (thực tế không
// mutant nào chạy). Mutant thiếu assert cũng từng bị "bỏ qua" im lặng, vẫn
// tính vào mẫu số thành công.
const staleAnchors = [];
const unasserted = [];
for (const [file, from, , name, assertFn] of only) {
  if (!assertFn) unasserted.push(name);
  else if (!fs.readFileSync(path.join(__dirname, "..", file), "utf8").includes(from))
    staleAnchors.push(`${name} — ${file}`);
}
if (staleAnchors.length || unasserted.length) {
  if (staleAnchors.length)
    console.error(
      `❌ ${staleAnchors.length} mutant có anchor KHÔNG còn khớp source — cập nhật lại MUTANTS:\n` +
        staleAnchors.map((s) => `   - ${s}`).join("\n"),
    );
  if (unasserted.length)
    console.error(
      `❌ ${unasserted.length} mutant chưa có assert — không được coi là "đã bị giết":\n` +
        unasserted.map((s) => `   - ${s}`).join("\n"),
    );
  cleanupMock();
  process.exit(1);
}

let killed = 0;
let survived = 0;
const survivors = [];
for (const [file, from, to, name, assertFn] of only) {
  try {
    const mod = loadMutant(file, from, to);
    const alive = assertFn(mod);
    if (alive) {
      survived++;
      survivors.push(name);
      console.log(`🟡 SỐNG SÓT  ${name}`);
    } else {
      killed++;
      console.log(`🟢 bị giết  ${name}`);
    }
  } catch (e) {
    if (e && e.name === "AnchorError") throw e; // đã kiểm trước — không nuốt thành "bị giết"
    // Mutant crash khi chạy = bị giết (test bắt được hành vi sai)
    killed++;
    console.log(`🟢 bị giết (crash)  ${name}`);
  }
}

cleanupMock();
console.log(
  `\n════ Mutation score: ${killed}/${killed + survived} mutants bị giết (${((killed / Math.max(1, killed + survived)) * 100).toFixed(0)}%) ════`,
);
if (survivors.length > 0) {
  console.log("Mutant sống sót — test cần thêm assertion cho:");
  for (const s of survivors) console.log(`  - ${s}`);
  process.exit(1);
}
// QUAN TRỌNG: altDetection nạp setInterval ở module-level — không exit tường minh
// process sẽ sống mãi → CI treo đến job timeout.
process.exit(0);
