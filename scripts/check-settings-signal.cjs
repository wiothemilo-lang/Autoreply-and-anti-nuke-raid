#!/usr/bin/env node
/**
 * scripts/check-settings-signal.cjs — Chặn lớp lỗi "sửa cấu hình xong bot vẫn
 * chạy bản cũ".
 *
 * Bối cảnh (bug thật 23/09/2026 + 6 chỗ sót cùng lớp):
 *   Bot cache bundle cấu hình của guild qua `guilds:getBotConfig` với TTL **30
 *   phút** (cố ý — cắt reads cho Convex free tier). Có đúng 2 đường để thay đổi
 *   tới bot NGAY thay vì chờ hết TTL:
 *     1. Dashboard sửa → ghi `settingsChangedAt` trên document guild →
 *        `bot_tick:getPendingJobs` trả `settingsChanges` → tick xoá cache.
 *     2. Chính bot sửa (bot_writes) → proxy trong `bot/src/convex.js` xoá cache
 *        ngay sau lượt ghi (CONFIG_WRITE_MUTATIONS).
 *   Thiếu cả 2 thì người dùng phải chờ tới 30 phút mới thấy tác dụng trong khi
 *   giao diện hứa "khoảng 3 phút" — bug im lặng: không có lỗi ở đâu cả.
 *
 *   Bug đầu tiên (welcome/goodbye) đã vá riêng lẻ; script này chặn CẢ LỚP.
 *
 * ── LUẬT A (phía Convex) ────────────────────────────────────────────────────
 *   Mutation nào ghi một field mà `getBotConfig` trả về (⇒ bot đọc từ bundle
 *   cache) thì phải có một trong hai:
 *     • `settingsChangedAt` trong thân hàm, hoặc
 *     • là mutation bot-side nằm trong CONFIG_WRITE_MUTATIONS của bot (proxy tự
 *       xoá cache — luật B bảo đảm danh sách đó đúng và đủ).
 *   Ngoại lệ còn lại phải nằm trong ALLOWLIST kèm LÝ DO kiểm chứng được.
 *
 * ── LUẬT B (bot ⇄ Convex) ───────────────────────────────────────────────────
 *   Tập `CONFIG_WRITE_MUTATIONS` trong `bot/src/convex.js` phải khớp CHÍNH XÁC
 *   tập mutation trong `convex/bot_writes.ts` ghi field bot đọc. Thêm mutation
 *   cấu hình mới ở bot mà quên thêm vào danh sách → cache không được xoá → lỗi
 *   im lặng quay lại. Hai chiều đều bị kiểm (thừa và thiếu).
 *
 * Hợp đồng SUY RA TỪ CODE: `BOT_FIELDS` = key trong object `return` của
 * `getBotConfig` ∩ field khai báo của bảng `guilds` trong `convex/schema.ts`.
 * Thêm field vào getBotConfig là tự động vào phạm vi kiểm — không phải sửa script.
 *
 * Chạy `--self-test` để chứng minh cổng không mù và không báo nhầm.
 *
 * Giới hạn có chủ đích: phân tích tĩnh theo văn bản (brace-matching), không
 * phải compiler. Từ đợt #5 (tách `convex/guilds.ts` thành `convex/guilds/*`),
 * script quét ĐỆ QUY và nhận cả helper dạng `export (async) function` — nhưng
 * chỉ với helper THẬT SỰ gọi `ctx.db.patch/insert/replace` (helper thuần dựng
 * object patch không tính: tín hiệu settingsChangedAt thuộc unit thực hiện
 * ghi). Hàm dùng chung nằm ngoài convex/ (ví dụ bot/) vẫn ngoài phạm vi.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CONVEX_DIR = path.join(ROOT, "convex");
const BOT_CONVEX = path.join(ROOT, "bot", "src", "convex.js");
/** File chứa mutation bot-side (tập được miễn luật A vì luật B phủ). */
const BOT_WRITES_FILE = "bot_writes.ts";

/** Ngoại lệ của luật A — mỗi mục BẮT BUỘC kèm lý do kiểm chứng được. */
const ALLOWLIST = {
  // ── Bot-side nhưng KHÔNG đi qua cache (batch tick đọc tươi) ──
  "hidden.ts::requestDm":
    "yêu cầu DM đi qua batch tick đọc TƯƠI (buildHiddenJobs đọc g.dmRequested từ DB) → tới bot trong 1 tick, không phụ thuộc bundle cache",
  "hidden.ts::botClearDm":
    "bot xoá cờ sau khi gửi DM; cờ được batch tick đọc tươi, không qua cache",
  "hidden.ts::botReportDmError": "bot báo lỗi gửi DM; web đọc — bot không đọc lại field này",
  "guilds.ts::clearVerifySendPanel":
    "bot xoá cờ sau khi gửi panel; verifySendPanel được batch tick đọc TƯƠI (bot_tick.getPendingJobs.verifyPanels)",
  "guilds.ts::clearTicketPanel":
    "bot xoá cờ sau khi dán panel mở ticket; ticketSendPanel được batch tick đọc TƯƠI (bot_tick.getPendingJobs.ticketPanels) — không đi qua bundle cache nên không cần settingsChangedAt",
  "guilds.ts::botSyncGuilds":
    "vòng sync metadata 5 phút của bot (tên/icon/số thành viên + seed mặc định cho guild MỚI). Cố ý KHÔNG invalidate: mỗi 5 phút một lần thì cache config vô nghĩa; guild mới chưa có cache",
};

/**
 * ĐÃ KIỂM CHỨNG là KHÔNG thuộc lớp lỗi này (không cần mục allowlist vì chúng
 * không ghi field bot đọc vào document guild):
 *  - `relay.ts::setRelaySettings` — relayShare được Convex kiểm lại ở MỌI lượt
 *    bot báo signature, relayReceive làm mới theo nhịp 10 phút của relayClient
 *    (RELAY_REFRESH_MS): trễ tối đa 10 phút, không phải lớp 30 phút; cả 2 field
 *    cũng KHÔNG có trong getBotConfig.
 *  - `threatIntel.ts` — cấu hình ghi vào `botStatus` (toàn cục, không phải
 *    document guild); batch tick đọc tươi.
 *  - `hidden.ts` panel/giveaway — ghi bảng `reactionPanels`/`giveaways`, batch
 *    tick (`buildHiddenJobs`) đọc tươi từ DB.
 */

/**
 * Bỏ comment trước khi phân tích — BẮT BUỘC: comment giải thích tín hiệu (ví dụ
 * "// settingsChangedAt: bot đọc field này từ cache") mà không có code ghi tín
 * hiệu vẫn làm cổng tưởng mutation đã an toàn. Đã bị đúng lỗi này khi viết test
 * (gỡ code ghi nhưng comment còn nguyên → cổng báo SẠCH sai).
 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/** Tách khối `{...}` khớp ngoặc kể từ vị trí `open` (đã trỏ vào dấu `{`). */
function matchBlock(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Các field mà bot đọc từ bundle cache: key của getBotConfig ∩ schema guilds. */
function botFields() {
  const guilds = fs.readFileSync(path.join(CONVEX_DIR, "guilds.ts"), "utf8");
  const gStart = guilds.indexOf("export const getBotConfig");
  if (gStart < 0) throw new Error("không tìm thấy getBotConfig trong convex/guilds.ts");
  const retAt = guilds.indexOf("return {", gStart);
  const retEnd = matchBlock(guilds, guilds.indexOf("{", retAt));
  const returned = new Set(
    [...guilds.slice(retAt, retEnd + 1).matchAll(/^\s{6}([A-Za-z][A-Za-z0-9_]*):/gm)].map(
      (m) => m[1],
    ),
  );

  const schema = fs.readFileSync(path.join(CONVEX_DIR, "schema.ts"), "utf8");
  const tStart = schema.indexOf("guilds: defineTable({");
  if (tStart < 0) throw new Error("không tìm thấy bảng guilds trong convex/schema.ts");
  const tEnd = matchBlock(schema, schema.indexOf("{", tStart));
  const declared = new Set(
    [...schema.slice(tStart, tEnd + 1).matchAll(/^\s{4}([A-Za-z][A-Za-z0-9_]*):/gm)].map(
      (m) => m[1],
    ),
  );

  return [...returned].filter((k) => declared.has(k)).sort();
}

/** Tập mutation bot-side tự xoá cache (nguồn: proxy trong bot/src/convex.js). */
function botConfigWriteSet() {
  const src = fs.readFileSync(BOT_CONVEX, "utf8");
  const at = src.indexOf("const CONFIG_WRITE_MUTATIONS = new Set([");
  if (at < 0) throw new Error("không tìm thấy CONFIG_WRITE_MUTATIONS trong bot/src/convex.js");
  const end = src.indexOf("]);", at);
  if (end < 0) throw new Error("CONFIG_WRITE_MUTATIONS thiếu dấu kết thúc ]);");
  const names = [...src.slice(at, end).matchAll(/"(bot_writes:[A-Za-z_][A-Za-z0-9_]*)"/g)].map(
    (m) => m[1],
  );
  if (names.length === 0)
    throw new Error("CONFIG_WRITE_MUTATIONS rỗng — kiểm lại cú pháp trong bot/src/convex.js");
  return new Set(names);
}

/**
 * Liệt kê mọi mutation export ghi field bot đọc trong một nguồn Convex.
 * Trả [{name, line, fields, hasSignal, hasComputedKeys}].
 */
function collectConfigWrites(src, fields) {
  const fieldSet = new Set(fields);
  const out = [];
  // Hai dạng khai báo:
  //  - mutation đăng ký với Convex: `export const X = mutation({` — kiểm như cũ.
  //  - helper đã TÁCH FILE (đợt #5): `export (async) function X(` — chỉ kiểm khi
  //    thân hàm THẬT SỰ ghi db; helper thuần dựng object patch không thuộc cổng.
  const exportRe =
    /export const ([A-Za-z0-9_]+) = (?:internalMutation|mutation)\(\{|export (?:async )?function ([A-Za-z0-9_]+)\(/g;
  let m;
  while ((m = exportRe.exec(src))) {
    const name = m[1] ?? m[2];
    const isHelper = m[1] === undefined;
    const braceAt = src.indexOf("{", m.index + m[0].length - 1);
    const end = matchBlock(src, braceAt);
    if (end < 0) continue;
    const body = stripComments(src.slice(braceAt, end + 1));
    if (isHelper && !/ctx\.db\.(?:patch|insert|replace)\(/.test(body)) continue;
    const line = src.slice(0, m.index).split("\n").length;

    const written = new Set();
    let computed = false;
    // (a) object literal trong ctx.db.patch/insert/replace
    const writeRe =
      /ctx\.db\.(?:patch|insert|replace)\(\s*(?:"guilds"\s*,\s*|[A-Za-z_$][A-Za-z0-9_$.]*\s*,\s*)/g;
    let wm;
    while ((wm = writeRe.exec(body))) {
      const openRel = body.indexOf("{", wm.index + wm[0].length - 1);
      if (openRel < 0 || openRel - (wm.index + wm[0].length) > 40) continue;
      const close = matchBlock(body, openRel);
      if (close < 0) continue;
      const lit = body.slice(openRel, close + 1);
      for (const km of lit.matchAll(/(?:^|[\s,{])([A-Za-z][A-Za-z0-9_]*)\s*:/g)) {
        if (fieldSet.has(km[1])) written.add(km[1]);
      }
      // Key tính toán `[k]:` — không biết chắc ghi field nào. CHỈ tính khi thân
      // hàm thật sự đụng bảng guilds (nếu không thì đó là bảng khác, ví dụ
      // botStatus, và báo vào sẽ là báo nhầm).
      if (body.includes('"guilds"') && /(?:^|[\s,{])\[[^\]]+\]\s*:/.test(lit)) computed = true;
    }
    // (b)/(c) gán vào biến dạng patch/update: patch.x = … hoặc patch[k] = …
    const assignRe =
      /\b(patch|globalPatch|updates?|changes|fields)\s*(?:\.\s*([A-Za-z][A-Za-z0-9_]*)|\[)/g;
    let am;
    while ((am = assignRe.exec(body))) {
      if (am[2]) {
        if (fieldSet.has(am[2])) written.add(am[2]);
      } else if (
        body.slice(am.index + am[0].length - 1, am.index + am[0].length + 40).includes("=")
      ) {
        computed = true;
      }
    }

    if (written.size === 0 && !computed) continue;
    out.push({
      name,
      line,
      fields: [...written].sort(),
      computed,
      // Đòi đúng cú pháp GHI (key trong object hoặc phép gán), không chỉ nhắc tên.
      hasSignal: /settingsChangedAt\s*:/.test(body) || /settingsChangedAt\s*=/.test(body),
    });
  }
  return out;
}

/** LUẬT B — tập bot-side phải khớp chính xác tập suy ra từ convex/bot_writes.ts. */
function checkBotSet(botSet, convexDir) {
  const src = fs.readFileSync(path.join(convexDir, BOT_WRITES_FILE), "utf8");
  const derived = new Set(collectConfigWrites(src, botFields()).map((w) => `bot_writes:${w.name}`));
  const errors = [];
  for (const name of [...derived].sort()) {
    if (!botSet.has(name))
      errors.push(
        `thiếu trong CONFIG_WRITE_MUTATIONS của bot: ${name} (ghi cấu hình bot đọc → phải xoá cache)`,
      );
  }
  for (const name of [...botSet].sort()) {
    if (!derived.has(name))
      errors.push(
        `thừa trong CONFIG_WRITE_MUTATIONS của bot: ${name} (không ghi cấu hình bot đọc)`,
      );
  }
  return errors;
}

// ── Self-test: cổng phải bắt đúng bug thật, và không báo nhầm chỗ sạch ──
const SELF_TEST = [
  {
    desc: "updateLockdown cũ (gán động patch.lockdownEnabled, thiếu tín hiệu)",
    src: `export const updateLockdown = mutation({
  args: { token: v.string(), enabled: v.optional(v.boolean()) },
  handler: async (ctx, { token, enabled }) => {
    const guild = await ctx.db.query("guilds").first();
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (enabled !== undefined) patch.lockdownEnabled = enabled;
    await ctx.db.patch(guild._id, patch);
  },
});`,
    expect: 1,
  },
  {
    desc: "updateLockdown đã vá (có settingsChangedAt)",
    src: `export const updateLockdown = mutation({
  args: { token: v.string(), enabled: v.optional(v.boolean()) },
  handler: async (ctx, { token, enabled }) => {
    const guild = await ctx.db.query("guilds").first();
    const patch: Record<string, unknown> = { updatedAt: Date.now(), settingsChangedAt: Date.now() };
    if (enabled !== undefined) patch.lockdownEnabled = enabled;
    await ctx.db.patch(guild._id, patch);
  },
});`,
    expect: 0,
  },
  {
    desc: "applyPreset cũ (ghi cả cục global qua key tính toán)",
    src: `export const applyPreset = mutation({
  args: { token: v.string() },
  handler: async (ctx) => {
    const guild = await ctx.db.query("guilds").first();
    const globalPatch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, v] of Object.entries(def.global)) globalPatch[k] = v;
    await ctx.db.patch(guild._id, globalPatch);
  },
});`,
    expect: 1,
  },
  {
    desc: "requestDm (ghi dmRequested…, tín hiệu đi đường batch tick đọc tươi)",
    src: `export const requestDm = mutation({
  args: { token: v.string() },
  handler: async (ctx) => {
    const guild = await ctx.db.query("guilds").first();
    await ctx.db.patch(guild._id, { dmRequested: true, dmMessage: "x", updatedAt: Date.now() });
  },
});`,
    expect: 1,
  },
  {
    desc: "mutation KHÔNG đụng field bot đọc (đổi mật khẩu ẩn) — không được báo",
    src: `export const setHiddenPassword = mutation({
  args: { token: v.string() },
  handler: async (ctx) => {
    const guild = await ctx.db.query("guilds").first();
    await ctx.db.patch(guild._id, { hiddenPasswordHash: undefined, updatedAt: Date.now() });
  },
});`,
    expect: 0,
  },
  {
    desc: "mutation không liên quan guild (ghi bảng giveaways) — không được báo",
    src: `export const createGiveaway = mutation({
  args: { token: v.string() },
  handler: async (ctx) => {
    await ctx.db.insert("giveaways", { guildId: "1", title: "x", status: "open" });
  },
});`,
    expect: 0,
  },
  {
    desc: "key tính toán nhưng KHÔNG đụng bảng guilds (botStatus) — không được báo nhầm",
    src: `export const saveBrandingUpload = mutation({
  args: { token: v.string(), slot: v.union(v.literal("bot")) },
  handler: async (ctx, { slot }) => {
    const status = await ctx.db.query("botStatus").first();
    const field = slot === "bot" ? "botAvatarUrl" : "haimiyaAvatarUrl";
    await ctx.db.patch(status._id, { [field]: "url" });
  },
});`,
    expect: 0,
  },
  // ── Đợt #5 tách convex/guilds.ts: helper tách file — cổng phải VẪN bắt ──
  {
    desc: "helper tách file ghi cấu hình thiếu tín hiệu → cổng báo (đợt #5)",
    src: `export async function updateSettingsCore(ctx, args) {
  const guild = await ctx.db.query("guilds").first();
  await ctx.db.patch(guild._id, { welcomeEnabled: args.welcomeEnabled, updatedAt: Date.now() });
}`,
    expect: 1,
  },
  {
    desc: "helper tách file có settingsChangedAt → không báo",
    src: `export async function updateSettingsCore(ctx, args) {
  const guild = await ctx.db.query("guilds").first();
  await ctx.db.patch(guild._id, {
    welcomeEnabled: args.welcomeEnabled,
    updatedAt: Date.now(),
    settingsChangedAt: Date.now(),
  });
}`,
    expect: 0,
  },
  {
    desc: "helper THUẦN dựng patch (không gọi ctx.db) → không báo, tín hiệu ở unit ghi",
    src: `export function buildUpdateSettingsPatch(args, patch) {
  patch.welcomeEnabled = args.welcomeEnabled;
}`,
    expect: 0,
  },
];

function runSelfTest(fields) {
  let failed = 0;
  for (const c of SELF_TEST) {
    const found = collectConfigWrites(c.src, fields);
    const got = found.filter((w) => !w.hasSignal).length;
    const ok = got === c.expect;
    if (!ok) failed++;
    console.log(`${ok ? "✅" : "❌"} self-test: ${c.desc} — mong ${c.expect}, nhận ${got}`);
  }
  // Luật B: lệch 2 chiều đều phải bị bắt.
  const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "settings-signal-"));
  const cases = [
    {
      desc: "luật B bắt mutation mới chưa thêm vào danh sách bot",
      body: "botNewThing",
      inSet: false,
      expect: 1,
    },
    { desc: "luật B bắt tên thừa trong danh sách bot", body: "botGhost", inSet: true, expect: 1 },
  ];
  for (const c of cases) {
    const dir = fs.mkdtempSync(path.join(tmp, "case-"));
    fs.writeFileSync(
      path.join(dir, BOT_WRITES_FILE),
      `export const ${c.body} = mutation({
  args: { guildId: v.string() },
  handler: async (ctx, { guildId }) => {
    const guild = await ctx.db.query("guilds").first();
    await ctx.db.patch(guild._id, { logChannelId: "1", updatedAt: Date.now() });
  },
});`,
    );
    const botSet = new Set(
      c.inSet ? [`bot_writes:botOther`, `bot_writes:${c.body}`] : [`bot_writes:botOther`],
    );
    const errs = checkBotSet(botSet, dir);
    const ok = errs.length >= c.expect;
    if (!ok) failed++;
    console.log(
      `${ok ? "✅" : "❌"} self-test: ${c.desc} — mong ≥${c.expect} lỗi, nhận ${errs.length}`,
    );
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  return failed;
}

/**
 * Liệt kê .ts dưới convex/ (ĐỆ QUY — từ đợt #5, `convex/guilds/*` là helper ghi
 * cấu hình): bỏ `_generated` + tsconfig, trả path TƯƠNG ĐỐI so với convex/ để
 * khoá allowlist vẫn đọc được (`guilds.ts::x` giữ nguyên, `guilds/y.ts::z` mới).
 */
function listConvexFiles(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "_generated") continue;
      out.push(...listConvexFiles(p, base));
      continue;
    }
    if (!e.name.endsWith(".ts") || e.name === "tsconfig.ts") continue;
    out.push(path.relative(base, p));
  }
  return out;
}

function main() {
  const fields = botFields();
  const botSet = botConfigWriteSet();

  if (process.argv.includes("--self-test")) {
    console.log(`# self-test cổng tín hiệu cấu hình (${fields.length} field bot đọc)`);
    const failed = runSelfTest(fields);
    if (failed > 0) {
      console.error(`\n❌ self-test FAIL — ${failed} case sai (cổng mù hoặc báo nhầm)`);
      process.exit(1);
    }
    console.log("✅ self-test PASS — cổng bắt đúng bug thật, không báo nhầm chỗ sạch");
  }

  const files = listConvexFiles(CONVEX_DIR).sort();

  // LUẬT B
  const botSetErrors = checkBotSet(botSet, CONVEX_DIR);

  // LUẬT A
  const violations = [];
  let exemptByBotSet = 0;
  let exemptByAllowlist = 0;
  for (const f of files) {
    const writes = collectConfigWrites(fs.readFileSync(path.join(CONVEX_DIR, f), "utf8"), fields);
    for (const w of writes) {
      if (w.hasSignal) continue;
      if (f === BOT_WRITES_FILE && botSet.has(`bot_writes:${w.name}`)) {
        exemptByBotSet++;
        continue;
      }
      if (ALLOWLIST[`${f}::${w.name}`]) {
        exemptByAllowlist++;
        continue;
      }
      violations.push({
        file: f,
        line: w.line,
        name: w.name,
        fields: w.computed ? [...w.fields, "*key-tính-toán*"] : w.fields,
      });
    }
  }

  if (violations.length === 0 && botSetErrors.length === 0) {
    console.log(
      `settings-signal OK — ${fields.length} field bot đọc; ${exemptByBotSet} mutation bot-side tự xoá cache, ${exemptByAllowlist} miễn trừ có lý do; danh sách CONFIG_WRITE_MUTATIONS khớp bot_writes.ts`,
    );
    process.exit(0);
  }

  if (violations.length) {
    console.error(
      `settings-signal LỆCH — ${violations.length} mutation ghi field bot đọc mà KHÔNG có đường nào tới bot ngay:\n`,
    );
    for (const v of violations) {
      console.error(`  - ${v.file}:${v.line} :: ${v.name}  → ${v.fields.join(", ")}`);
    }
    console.error(
      [
        "",
        "Hệ quả: thay đổi chậm tới 30 phút (TTL cache getConfig của bot) trong khi giao diện",
        "hứa ~3 phút — người dùng tưởng tính năng hỏng (bug thật 23/09/2026).",
        "",
        "Sửa: thêm `settingsChangedAt: Date.now()` vào patch ghi cấu hình. Nếu thay đổi KHÔNG đi",
        "qua cache (batch tick đọc tươi, hoặc bot tự ghi rồi proxy convex.js xoá cache), thêm mục",
        "vào ALLOWLIST trong script này KÈM LÝ DO kiểm chứng được.",
      ].join("\n"),
    );
  }

  if (botSetErrors.length) {
    console.error(
      `\nsettings-signal LỆCH — CONFIG_WRITE_MUTATIONS (bot/src/convex.js) không khớp thực tế:\n`,
    );
    for (const e of botSetErrors) console.error(`  - ${e}`);
    console.error(
      [
        "",
        "Danh sách này là đường DUY NHẤT để bot tự xoá cache sau khi chính nó ghi cấu hình —",
        "lệch nghĩa là cache cũ được dùng tiếp (server khoá kênh lâu hơn cấu hình, mất bảo vệ sau",
        "khi mở khoá, restore xong vẫn chạy cấu hình cũ…).",
      ].join("\n"),
    );
  }

  process.exit(1);
}

/**
 * Xuất các hàm phân tích để `scripts/test-settings-signal.cjs` kiểm trực tiếp
 * trên nguồn Convex THẬT (không chỉ snippet giả) — bộ tự kiểm trong file này
 * chỉ chạy ở chế độ CLI.
 */
module.exports = { botFields, collectConfigWrites, botConfigWriteSet, checkBotSet, ALLOWLIST };

// Chỉ chạy khi gọi trực tiếp (`node scripts/check-settings-signal.cjs`) — để
// `require()` từ test không kích hoạt kiểm tra + process.exit.
if (require.main === module) main();
