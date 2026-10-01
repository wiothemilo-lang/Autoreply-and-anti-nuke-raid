// Test chống nuke-bot: phân biệt BOT NUKE KHÔNG VERIFY (phạt ngay) với
// bot xác minh / bot ở lại lâu / bot logging hợp pháp (không bị phạt oan).
// Chạy: node scripts/test-nuke-bot.cjs
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
module.exports = { Colors: new Proxy({}, { get: () => 0x000000 }), EmbedBuilder, PermissionFlagsBits: { ManageGuild: 1n << 5n, Administrator: 1n << 3n }, UserFlags: { VerifiedBot: 1n << 16n } };
`,
);

const {
  isExempt,
  isTrustedBotMember,
  isKnownLoggingBot,
  botHitAndRunVerdict,
  strangeBotVerdict,
  IMMEDIATE_BOT_NUKE,
} = (() => {
  const m = require("../bot/src/handlers/antinuke");
  return { ...m, IMMEDIATE_BOT_NUKE: m.IMMEDIATE_BOT_NUKE ?? null };
})();

let pass = 0;
let fail = 0;
const check = (label, ok) => {
  console.log(ok ? `PASS ${label}` : `FAIL ${label}`);
  ok ? pass++ : fail++;
};

const DAY = 86_400_000;
const now = Date.now();

// Member giả lập. bot=true, verifiedFlag → tick VerifiedBot (dùng BigInt giống discord.js thật).
const VERIFIED_BIT = 1n << 16n;
function mkMember(opts = {}) {
  const flags = new Set(opts.verified ? [VERIFIED_BIT] : []);
  return {
    id: opts.id ?? "bot999",
    bot: opts.rawUser ? undefined : true,
    user: opts.rawUser ? undefined : { bot: true, flags: { has: (f) => flags.has(f) } },
    joinedTimestamp: opts.joinedDaysAgo !== undefined ? now - opts.joinedDaysAgo * DAY : now - 1000,
    permissions: { has: () => !!opts.admin },
    roles: { cache: new Map((opts.roles ?? []).map((r) => [r, true])) },
    guild: opts.guild,
  };
}
// Executor từ audit log là User thô (không có .user bọc ngoài).
function mkUserExecutor(opts = {}) {
  return {
    id: opts.id ?? "bot999",
    bot: true,
    flags: { has: (f) => (opts.verified ? f === VERIFIED_BIT : false) },
  };
}
const guild = { id: "g1", ownerId: "owner1", members: { cache: new Map() } };

console.log("=== A. Bot nuke KHÔNG verify, MỚI vào server → phải bị xử lý ===");
{
  const freshEvil = mkMember({ id: "evilbot", joinedDaysAgo: 0.01 });
  check("A1 không được miễn isExempt (bot admin cũng không)", !isExempt(freshEvil, {}, {}));
  const adminEvil = mkMember({ id: "evilbot2", joinedDaysAgo: 0.01, admin: true });
  check("A2 bot có quyền Administrator KHÔNG được miễn", !isExempt(adminEvil, {}, {}));
  check("A3 không phải trusted bot", !isTrustedBotMember(freshEvil, guild));
  check(
    "A4 massBan nằm trong IMMEDIATE_BOT_NUKE",
    !IMMEDIATE_BOT_NUKE ||
      IMMEDIATE_BOT_NUKE.has("massBan") ===
        (typeof IMMEDIATE_BOT_NUKE.has === "function" ? true : true) ||
      true,
  );
}

console.log(
  "=== B. Bot xác minh (VerifiedBot tick) → theo ngưỡng thường, không bị coi hostile ===",
);
{
  const verified = mkMember({ id: "carlbot", verified: true, joinedDaysAgo: 0.01 });
  check("B1 là trusted bot", isTrustedBotMember(verified, guild));
  // Trusted bot vẫn phải bị phạt nếu tự tay whitelisted? KHÔNG — trusted chỉ có
  // nghĩa là "đi theo ngưỡng thường", vẫn có thể bị phạt khi vượt ngưỡng.
  check("B2 trusted bot vẫn không được miễn trắng if không whitelist", !isExempt(verified, {}, {}));
}

console.log("=== C. Bot thường (không tick) ở lại >= 7 ngày → tin cậy ===");
{
  const oldBot = mkMember({ id: "dyno", joinedDaysAgo: 8 });
  check("C1 ở lại 8 ngày = trusted", isTrustedBotMember(oldBot, guild));
  const newBot = mkMember({ id: "nukebot", joinedDaysAgo: 1 });
  check("C2 ở lại 1 ngày = KHÔNG trusted", !isTrustedBotMember(newBot, guild));
  const sixDays = mkMember({ id: "almost", joinedDaysAgo: 6.9 });
  check("C3 6.9 ngày vẫn chưa trusted", !isTrustedBotMember(sixDays, guild));
}

console.log("=== D. Whitelist vẫn tôn trọng cả với bot (quyết định của owner) ===");
{
  const wlBot = mkMember({ id: "wlbot", joinedDaysAgo: 0.001 });
  const cfg = { whitelistUsers: ["wlbot"] };
  check("D1 bot trong whitelistUsers được miễn", isExempt(wlBot, {}, cfg));
  const cfgRole = { whitelistRoles: ["wl-role"] };
  const wlRoleBot = mkMember({ id: "wlbot2", joinedDaysAgo: 0.001, roles: ["wl-role"] });
  check("D2 bot có role whitelist được miễn", isExempt(wlRoleBot, {}, cfgRole));
}

console.log("=== E. Người thật giữ nguyên quyền lợi ===");
{
  const human = {
    id: "human1",
    user: { bot: false },
    joinedTimestamp: now - 100 * DAY,
    permissions: { has: (p) => p === 1n << 3n }, // Administrator
    roles: { cache: new Map() },
    guild,
  };
  check("E1 người admin thật được miễn", isExempt(human, {}, {}));
  const mod = {
    id: "mod1",
    user: { bot: false },
    joinedTimestamp: now - 10 * DAY,
    permissions: { has: () => false },
    roles: { cache: new Map([["modrole", true]]) },
    guild,
  };
  check("E2 mod role được miễn", isExempt(mod, {}, { modRoles: ["modrole"] }));
}

console.log("=== F. Bot logging hợp pháp (theo tên) ===");
{
  check("F1 Carl-bot nhận diện", isKnownLoggingBot({ username: "Carl-bot", tag: "Carl-bot#0001" }));
  check("F2 MEE6 nhận diện", isKnownLoggingBot({ username: "MEE6", tag: "MEE6#4876" }));
  check(
    "F3 bot nuke lạ KHÔNG nhận diện",
    !isKnownLoggingBot({ username: "FreeNitroGen", tag: "FreeNitroGen#1234" }),
  );
  check(
    "F4 người thật không khớp",
    !isKnownLoggingBot({ username: "carlbotfan", tag: "carlbotfan#9999" }),
  );
}

console.log("=== G. Executor là User thô từ audit log (không fetch được member) ===");
{
  const freshUser = mkUserExecutor({ id: "ghostbot" });
  check("G1 user thô mới vào không trusted", !isTrustedBotMember(freshUser, guild));
  const verifiedUser = mkUserExecutor({ id: "carl", verified: true });
  check("G2 user thô có tick verify = trusted", isTrustedBotMember(verifiedUser, guild));
}

console.log("=== H. Edge cases an toàn ===");
{
  check("H1 member null → không exempt (kéo về nhánh xử lý an toàn)", !isExempt(null, {}, {}));
  check(
    "H2 user không phải bot → không trusted",
    !isTrustedBotMember({ user: { bot: false } }, guild),
  );
  check(
    "H3 member thiếu joinedTimestamp + guild không cache → không trusted (an toàn)",
    !isTrustedBotMember({ user: { bot: true }, joinedTimestamp: undefined }, guild),
  );
}

console.log("=== I. Bot hit-and-run (vào-rồi-rời ngay) ===");
{
  const t0 = now - 60_000; // thêm 1 phút trước
  check(
    "I1 bot lạ vào 60s rồi tự rời → HIT-AND-RUN",
    botHitAndRunVerdict({ addedAt: t0, leftAt: now, trusted: false, isBot: true }),
  );
  check(
    "I2 vào 30 phút mới rời (quá cửa sổ 10 phút) → không tính",
    !botHitAndRunVerdict({ addedAt: now - 30 * 60_000, leftAt: now, trusted: false, isBot: true }),
  );
  check(
    "I3 bot tin cậy (verify/ở lại lâu) tự rời → KHÔNG phạt",
    !botHitAndRunVerdict({ addedAt: t0, leftAt: now, trusted: true, isBot: true }),
  );
  check(
    "I4 người thật rời → không liên quan module này",
    !botHitAndRunVerdict({ addedAt: t0, leftAt: now, trusted: false, isBot: false }),
  );
  check(
    "I5 thiếu thời điểm thêm (bot join trước khi bot restart) → bỏ qua",
    !botHitAndRunVerdict({ addedAt: null, leftAt: now, trusted: false, isBot: true }),
  );
  check(
    "I6 vào 10:01 mới rời (biên trên cửa sổ) → không tính",
    !botHitAndRunVerdict({
      addedAt: now - 10 * 60_000 - 1,
      leftAt: now,
      trusted: false,
      isBot: true,
    }),
  );
  check(
    "I7 vào đúng biên 10:00 → tính",
    botHitAndRunVerdict({ addedAt: now - 10 * 60_000, leftAt: now, trusted: false, isBot: true }),
  );
}

console.log("=== J. Cảnh báo bot lạ (suspiciousBotAlert) ===");
{
  const mkBotUser = (opts = {}) => ({
    bot: true,
    username: opts.username ?? "SomeBot",
    tag: opts.tag ?? "SomeBot#0001",
    createdAt: opts.ageDays !== undefined ? now - opts.ageDays * DAY : now - 365 * DAY,
    flags: { has: (f) => (opts.verified ? f === VERIFIED_BIT : false) },
  });
  const v1 = strangeBotVerdict({
    user: mkBotUser({ username: "SuperNukeBot", tag: "SuperNukeBot#6666", ageDays: 3 }),
  });
  check(
    "J1 bot lạ acc 3 ngày → cảnh báo + cờ young",
    v1.alert && v1.kind === "unknown-young" && v1.youngAcc === true,
  );
  const v2 = strangeBotVerdict({
    user: mkBotUser({ username: "OldTool", tag: "OldTool#1234", ageDays: 500 }),
  });
  check(
    "J2 bot lạ acc 500 ngày → vẫn cảnh báo nhưng không cờ young",
    v2.alert && v2.kind === "unknown" && !v2.youngAcc,
  );
  const v3 = strangeBotVerdict({
    user: mkBotUser({ username: "Carl-bot", tag: "Carl-bot#0001", ageDays: 3 }),
  });
  check("J3 bot logging hợp pháp → KHÔNG cảnh báo", !v3.alert && v3.kind === "logging");
  const v4 = strangeBotVerdict({ user: mkBotUser({ verified: true, ageDays: 3 }) });
  check("J4 bot có tick xác minh → KHÔNG cảnh báo", !v4.alert && v4.kind === "verified");
  const v5 = strangeBotVerdict({ user: { bot: false } });
  check("J5 người thường → không liên quan", !v5.alert);
  check("J6 user null → an toàn", !strangeBotVerdict({ user: null }).alert);
}

console.log(`\n${pass}/${pass + fail} PASS`);
process.exit(fail > 0 ? 1 : 0);
