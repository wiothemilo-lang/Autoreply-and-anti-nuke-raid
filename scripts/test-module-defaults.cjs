// Test mặc định module + không reset setup server + cờ notify học tập.
// Chạy: node scripts/test-module-defaults.cjs
const path = require("path");
const DJS_MOCK = require("./support/djs-mock-path.cjs");

const Module = require("module");
const fs = require("fs");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "discord.js") return DJS_MOCK;
  return origResolve.call(this, request, ...args);
};
fs.writeFileSync(
  DJS_MOCK,
  `class EmbedBuilder {
  constructor(data = {}) { this.d = data; }
  setColor(c) { this.d.color = c; return this; }
  setTitle(t) { this.d.title = t; return this; }
  setDescription(t) { this.d.description = t; return this; }
  addFields(f) { this.d.fields = [...(this.d.fields ?? []), ...f]; return this; }
  setTimestamp() { return this; }
  setFooter(f) { this.d.footer = f; return this; }
}
module.exports = { Colors: new Proxy({}, { get: () => 0x000000 }), EmbedBuilder, PermissionFlagsBits: { ManageGuild: 1n << 5n, Administrator: 1n << 3n } };
`,
);

let pass = 0;
let fail = 0;
const check = (label, ok) => {
  console.log(ok ? `PASS ${label}` : `FAIL ${label}`);
  ok ? pass++ : fail++;
};

(async () => {
  // ---- 1. Convex source: botEnsureModules mặc định TẮT (server mới) ----
  // Đợt #5: thân hàm ở convex/bot_writes/antinuke.ts (wrapper giữ ở bot_writes.ts).
  const bw = fs.readFileSync(
    path.join(__dirname, "..", "convex", "bot_writes", "antinuke.ts"),
    "utf8",
  );
  const ensureBlock = bw.slice(
    bw.indexOf("export async function botEnsureModulesHandler("),
    bw.indexOf("export async function botRecordHeatHandler("),
  );
  check("botEnsureModules chèn module mới với enabled: false", /enabled: false/.test(ensureBlock));
  check(
    "botEnsureModules bỏ qua module đã có (không reset setup cũ)",
    /if \(have\.has\(m\.module\)\) continue;/.test(ensureBlock),
  );

  // ---- 2. setAntinukeGlobal: BẬT = bật cả module con; TẮT = giữ nguyên ----
  const gs = fs.readFileSync(path.join(__dirname, "..", "convex", "guilds.ts"), "utf8");
  const globalBlock = gs.slice(
    gs.indexOf("export const setAntinukeGlobal"),
    gs.indexOf("/* ------------------------- Bot-side sync"),
  );
  check(
    "setAntinukeGlobal: bật global → bật mọi module con",
    /if \(enabled\) \{[\s\S]*?antinukeModules[\s\S]*?enabled: true/.test(globalBlock),
  );
  check(
    "setAntinukeGlobal: chỉ patch module đang TẮT (giữ threshold/punish)",
    /if \(!m\.enabled\) await ctx\.db\.patch\(m\._id, \{ enabled: true/.test(globalBlock),
  );

  // ---- 2b. CỔNG AUTO-MOD TÁCH KHỎI CHỐNG NUKE ----
  // Bug thật 29/09/2026: tab Auto-mod nội dung dùng chung cổng tổng
  // antinukeEnabled với tab Chống nuke — tắt chống nuke là mất luôn bộ lọc
  // link mời/link độc hại, im lặng tuyệt đối. Nay có cờ automodEnabled riêng.
  const automodBlock = gs.slice(
    gs.indexOf("export const setAutomod"),
    gs.indexOf("export const setAntinukeGlobalBatch"),
  );
  check("có mutation setAutomod", automodBlock.length > 0);
  check(
    "setAutomod ghi cờ automodEnabled + settingsChangedAt (bot thấy ngay)",
    /automodEnabled: enabled,[\s\S]{0,80}settingsChangedAt: Date\.now\(\)/.test(automodBlock),
  );
  check(
    "setAutomod bật cổng chỉ bật module NỘI DUNG (isModerationModule)",
    /if \(isModerationModule\(m\.module\) && !m\.enabled\)/.test(automodBlock),
  );
  check(
    "guild mới: automodEnabled mặc định bật (module nội dung mặc định bật)",
    /antinukeEnabled: true,[\s\S]{0,400}?automodEnabled: true,/.test(gs),
  );

  // Danh sách module nội dung 2 bên phải KHỚP — lệch là bot cổng bỏ sót
  // module mới (hoặc bật nhầm module nuke) mà không ai thấy.
  const mods = fs.readFileSync(path.join(__dirname, "..", "convex", "modules.ts"), "utf8");
  const constants = fs.readFileSync(
    path.join(__dirname, "..", "src", "lib", "constants.ts"),
    "utf8",
  );
  const grab = (src, marker) => {
    const i = src.indexOf(marker);
    if (i < 0) return null;
    const body = src.slice(i, src.indexOf("] as const;", i));
    return [...body.matchAll(/"([a-zA-Z]+)"/g)].map((m) => m[1]);
  };
  const convexKeys = grab(mods, "export const MODERATION_MODULE_KEYS");
  const uiModules = grab(constants, "export const MODERATION_MODULES");
  check(
    "convex khai báo MODERATION_MODULE_KEYS",
    Array.isArray(convexKeys) && convexKeys.length > 0,
  );
  check("dashboard khai báo MODERATION_MODULES", Array.isArray(uiModules) && uiModules.length > 0);
  check(
    `danh sách module nội dung khớp 2 bên (${convexKeys?.length ?? 0} mục)`,
    JSON.stringify([...(convexKeys ?? [])].sort()) ===
      JSON.stringify([...(uiModules ?? [])].sort()),
  );

  // ---- 2c. MỌI MODULE PHẢI CÓ Ô BẬT/TẮT RIÊNG TRÊN DASHBOARD ----
  // Bug thật: NUKE_MODULES khai 24 module nhưng NUKE_GROUPS chỉ render 22 →
  // `botHitAndRun` và `suspiciousBotAlert` KHÔNG có ModuleCard, tức không có
  // công tắc nào để bật/tắt riêng. Marketing hứa "32 module bật/tắt riêng từng
  // module" mà chỉ 30 cái có toggle. Không ai thấy vì không có cổng nào đối
  // chiếu danh sách khai báo với danh sách được render theo nhóm.
  //
  // Cổng này so 3 tập: khai báo (NUKE/MODERATION_MODULES), nhóm hiển thị
  // (NUKE/MODERATION_GROUPS), và metadata (ANTINUKE_MODULE_META).
  const grabList = (src, name, endMarker) => {
    const start = src.indexOf(name);
    if (start < 0) return null;
    const end = src.indexOf(endMarker, start);
    if (end < 0) return null;
    return [...src.slice(start, end).matchAll(/"([a-zA-Z]+)"/g)].map((m) => m[1]);
  };
  /** Gộp mọi mảng `modules: [...]` trong khối nhóm (NUKE_GROUPS / MODERATION_GROUPS). */
  const grabGroupModules = (src, name) => {
    const start = src.indexOf(name);
    if (start < 0) return null;
    const end = src.indexOf("];", start);
    if (end < 0) return null;
    return [...src.slice(start, end).matchAll(/modules:\s*\[([\s\S]*?)\]/g)].flatMap((m) =>
      [...m[1].matchAll(/"([a-zA-Z]+)"/g)].map((x) => x[1]),
    );
  };
  /** Trả { missing, unknown, duplicates } giữa danh sách khai báo và danh sách nhóm. */
  const findGroupGaps = (declared, grouped) => {
    const declaredSet = new Set(declared);
    const groupedSet = new Set(grouped);
    const seen = new Set();
    const duplicates = [];
    for (const m of grouped) {
      if (seen.has(m)) duplicates.push(m);
      seen.add(m);
    }
    return {
      missing: declared.filter((m) => !groupedSet.has(m)),
      unknown: [...groupedSet].filter((m) => !declaredSet.has(m)),
      duplicates,
    };
  };
  const nukeDeclared = grabList(constants, "export const NUKE_MODULES", "] as const;");
  const modDeclared = grabList(constants, "export const MODERATION_MODULES", "] as const;");
  const nukeGrouped = grabGroupModules(constants, "export const NUKE_GROUPS");
  const modGrouped = grabGroupModules(constants, "export const MODERATION_GROUPS");
  const describeGaps = (g) =>
    [
      g.missing.length ? `thiếu: ${g.missing.join(", ")}` : "",
      g.unknown.length ? `lạ: ${g.unknown.join(", ")}` : "",
      g.duplicates.length ? `trùng: ${g.duplicates.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" | ");
  check(
    "đọc được NUKE_MODULES + NUKE_GROUPS",
    Array.isArray(nukeDeclared) && nukeDeclared.length > 0 && Array.isArray(nukeGrouped),
  );
  check(
    "đọc được MODERATION_MODULES + MODERATION_GROUPS",
    Array.isArray(modDeclared) && modDeclared.length > 0 && Array.isArray(modGrouped),
  );
  const nukeGaps = findGroupGaps(nukeDeclared ?? [], nukeGrouped ?? []);
  check(
    `mọi module chống nuke đều có nhóm hiển thị (${nukeDeclared?.length ?? 0} module)` +
      (describeGaps(nukeGaps) ? `\n     → ${describeGaps(nukeGaps)}` : ""),
    describeGaps(nukeGaps) === "",
  );
  const modGaps = findGroupGaps(modDeclared ?? [], modGrouped ?? []);
  check(
    `mọi module auto-mod đều có nhóm hiển thị (${modDeclared?.length ?? 0} module)` +
      (describeGaps(modGaps) ? `\n     → ${describeGaps(modGaps)}` : ""),
    describeGaps(modGaps) === "",
  );
  // Hợp của 2 danh sách khai báo phải phủ ĐÚNG bộ metadata — không thiếu cái
  // nào (ModuleCard đọc meta.label nên thiếu meta là crash panel) và không lặp
  // giữa 2 nhóm (cùng module hiện 2 nơi = 2 công tắc ghi đè nhau).
  const metaStart = constants.indexOf("export const ANTINUKE_MODULE_META");
  const metaEnd = constants.indexOf("\n};", metaStart);
  const metaBlock = constants.slice(metaStart, metaEnd);
  const metaKeys = [...metaBlock.matchAll(/^\s{2}([a-zA-Z]+):\s*\{/gm)].map((m) => m[1]);
  const declaredAll = [...(nukeDeclared ?? []), ...(modDeclared ?? [])];
  const metaSet = new Set(metaKeys);
  const declaredSet = new Set(declaredAll);
  check(
    `mọi module khai báo đều có metadata (ModuleCard đọc meta.label) — thừa: ${
      [...metaSet].filter((m) => !declaredSet.has(m)).join(",") || "không"
    }` + `, thiếu: ${[...declaredSet].filter((m) => !metaSet.has(m)).join(",") || "không"}`,
    declaredAll.every((m) => metaSet.has(m)) && metaKeys.every((m) => declaredSet.has(m)),
  );
  check(
    `2 nhóm khai báo không trùng module (nuke+auto-mod = ${declaredAll.length}, meta = ${metaKeys.length})`,
    declaredAll.length === declaredSet.size && declaredAll.length === metaKeys.length,
  );
  // Đối chiếu với danh sách module THẬT của bot (convex/modules.ts): module nào
  // bot có mà dashboard chưa khai thì module đó KHÔNG có công tắc nào — đúng
  // lớp lỗi vừa vá (thiếu nhóm hiển thị), chỉ khác tầng. Chốt cả 2 chiều.
  const cModuleStart = mods.indexOf("export const ANTI_NUKE_MODULES");
  const cModuleBlock = mods.slice(cModuleStart, mods.indexOf("] as const;", cModuleStart));
  const convexModuleKeys = [...cModuleBlock.matchAll(/module:\s*"([a-zA-Z]+)"/g)].map((m) => m[1]);
  const convexSet = new Set(convexModuleKeys);
  const notOnDashboard = [...convexSet].filter((m) => !declaredSet.has(m)).sort();
  const notInBot = [...declaredSet].filter((m) => !convexSet.has(m)).sort();
  check(
    `mọi module bot có đều có công tắc riêng trên dashboard (${convexModuleKeys.length} module)` +
      (notOnDashboard.length ? `\n     → thiếu toggle: ${notOnDashboard.join(", ")}` : "") +
      (notInBot.length ? `\n     → dashboard có mà bot không: ${notInBot.join(", ")}` : ""),
    convexModuleKeys.length > 0 && notOnDashboard.length === 0 && notInBot.length === 0,
  );
  check(
    "self-test: phát hiện module bot có mà dashboard chưa khai",
    (() => {
      const fakeBot = ["massBan", "massKick", "brandNewModule"];
      const fakeDash = new Set(["massBan", "massKick"]);
      return fakeBot.filter((m) => !fakeDash.has(m)).join(",") === "brandNewModule";
    })(),
  );
  // Self-test: cổng phải THẬT SỰ bắt lỗi thiếu module, không xanh giả.
  check(
    "self-test: findGroupGaps bắt module bị bỏ khỏi nhóm",
    findGroupGaps(["a", "b", "c"], ["a", "b"]).missing.join(",") === "c",
  );
  check(
    "self-test: findGroupGaps bắt module lạ + trùng trong nhóm",
    (() => {
      const g = findGroupGaps(["a", "b"], ["a", "a", "z"]);
      return g.unknown.join(",") === "z" && g.duplicates.join(",") === "a";
    })(),
  );
  check(
    "self-test: hồi quy đúng bug — NUKE_MODULES 24 nhưng nhóm chỉ 22 phải đỏ",
    (() => {
      const g = findGroupGaps(
        nukeDeclared ?? [],
        (nukeGrouped ?? []).filter((m) => !["botHitAndRun", "suspiciousBotAlert"].includes(m)),
      );
      return g.missing.length === 2 && g.missing.includes("botHitAndRun");
    })(),
  );

  // Bot phải đọc qua helper, không đọc thẳng cờ tổng nữa.
  const shared = fs.readFileSync(
    path.join(__dirname, "..", "bot", "src", "handlers", "antinuke", "shared.js"),
    "utf8",
  );
  const filters = fs.readFileSync(
    path.join(__dirname, "..", "bot", "src", "handlers", "filters.js"),
    "utf8",
  );
  const messages = fs.readFileSync(
    path.join(__dirname, "..", "bot", "src", "handlers", "antinuke", "messages.js"),
    "utf8",
  );
  check(
    "shared có helper automodEnabled (fallback về antinukeEnabled cho guild cũ)",
    /function automodEnabled\(config\)[\s\S]{0,160}automodEnabled \?\? config\?\.antinukeEnabled/.test(
      shared,
    ),
  );
  check(
    "filters.js dùng cổng automodEnabled, không còn đọc antinukeEnabled",
    filters.includes("automodEnabled(config)") && !filters.includes("config.antinukeEnabled"),
  );
  check(
    "messages.js dùng cổng automodEnabled, không còn đọc antinukeEnabled",
    messages.includes("automodEnabled(config)") && !messages.includes("config.antinukeEnabled"),
  );

  // Dashboard: toggle cổng riêng trong tab Auto-mod.
  const automodPanel = fs.readFileSync(
    path.join(__dirname, "..", "src", "components", "dashboard", "AutoModPanel.tsx"),
    "utf8",
  );
  check(
    "AutoModPanel có toggle cổng (setAutomod)",
    automodPanel.includes("api.guilds.setAutomod") &&
      automodPanel.includes("data.guild.automodEnabled"),
  );

  // ---- 3. notify flag: schema + threatIntel + research ----
  const schema = fs.readFileSync(path.join(__dirname, "..", "convex", "schema.ts"), "utf8");
  check("schema có researchNotifyEnabled", schema.includes("researchNotifyEnabled"));
  const ti = fs.readFileSync(path.join(__dirname, "..", "convex", "threatIntel.ts"), "utf8");
  check(
    "getSettings trả notifyEnabled",
    ti.includes("notifyEnabled: status?.researchNotifyEnabled ?? false"),
  );
  check(
    "setResearchSettings nhận notifyEnabled",
    /notifyEnabled: v\.optional\(v\.boolean\(\)\)/.test(ti),
  );
  check(
    "botGetIntel trả notifyEnabled cho bot",
    ti.includes("notifyEnabled: status?.researchNotifyEnabled ?? false,"),
  );

  const research = fs.readFileSync(path.join(__dirname, "..", "bot", "src", "research.js"), "utf8");
  check(
    "runResearch đọc cờ notifyEnabled",
    research.includes("notifyEnabled: intel?.notifyEnabled === true"),
  );
  check(
    "manual learn chỉ notify khi bật cờ",
    /if \(res\.notifyEnabled\) \{\s*\n\s*await notifyManualResult/.test(research),
  );
  check(
    "digest cũng tôn trọng cờ notify",
    /if \(intel\?\.notifyEnabled === true\) \{\s*\n\s*await postDigestToLog/.test(research),
  );

  // ---- 4. Admin UI: toggle thông báo học tập ----
  const admin = fs.readFileSync(path.join(__dirname, "..", "src", "pages", "Admin.tsx"), "utf8");
  check("Admin có onToggleNotify", admin.includes("onToggleNotify"));
  check(
    "Admin gọi setThreat với notifyEnabled",
    /setThreat\(\{ token, notifyEnabled \}\)/.test(admin),
  );

  // ---- 5. runResearch hoạt động đúng với notifyEnabled=false (mặc định) ----
  delete process.env.GROQ_API_KEY;
  delete process.env.NVIDIA_API_KEY;
  delete process.env.DEEPSEEK_NIM_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.SAMBANOVA_API_KEY;
  delete process.env.AI_API_KEY;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("reddit.com")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: {
              children: [
                {
                  data: { title: "new tokengrabber scam spreading - fake captcha steals password" },
                },
              ],
            },
          }),
      };
    }
    return { ok: false, status: 404, text: async () => "" };
  };
  const researchMod = require("../bot/src/research.js");
  const mutations = [];
  const store = {
    client: {
      query: async (name) => {
        if (name === "threatIntel:botGetIntel") {
          return {
            keywords: [],
            scamPhrases: [],
            researchEnabled: true,
            notifyEnabled: false,
            nextRunAt: 0,
          };
        }
        return null;
      },
      mutation: async (name, args) => {
        mutations.push({ name, args });
        return { ok: true };
      },
    },
    getConfig: async () => null,
  };
  const res = await researchMod.runResearch(store);
  check("runResearch chạy được với intel tối thiểu", typeof res.newKeywords === "number");
  check("res.notifyEnabled = false khi intel chưa bật", res.notifyEnabled === false);
  check(
    "đã ghi botSetResearchRun",
    mutations.some((m) => m.name === "threatIntel:botSetResearchRun"),
  );

  // notifyEnabled=true → cờ true
  store.client.query = async () => ({
    keywords: [],
    scamPhrases: [],
    researchEnabled: true,
    notifyEnabled: true,
    nextRunAt: 0,
  });
  const res2 = await researchMod.runResearch(store);
  check("res.notifyEnabled = true khi intel bật", res2.notifyEnabled === true);

  console.log(`\nKết quả module-defaults: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
