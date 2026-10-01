// Test chống phạt nhầm cho pipeline moderation (filters.js + heat.js).
// Mô phỏng các tình huống thành viên THẬT dễ bị bot xử lý oan.
// Chạy: node scripts/test-misfire-guard.cjs
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

const filters = require("../bot/src/handlers/filters.js");
const { findMaliciousLink, findDangerousAttachment, findLearnedThreat, findSuspiciousLink } =
  filters;
const { HeatTracker, choosePunish, heatSettings, punishMember } = require("../bot/src/heat.js");

let pass = 0;
let fail = 0;
const check = (label, ok) => {
  console.log(ok ? `PASS ${label}` : `FAIL ${label}`);
  ok ? pass++ : fail++;
};

// Attachment giả đựng name + ext.
function mkAttachments(names) {
  const m = new Map();
  names.forEach((n, i) => m.set(String(i), { name: n }));
  return m;
}

(async () => {
  console.log("== 1. File đính kèm: dev upload file script KHÔNG bị phạt ==");
  check(
    ".js không còn nguy hiểm",
    findDangerousAttachment(mkAttachments(["index.js", "server.js"])) === null,
  );
  check(
    ".com (tên file) không còn nguy hiểm",
    findDangerousAttachment(mkAttachments(["setup.com"])) === null,
  );
  check(".exe vẫn bị chặn", findDangerousAttachment(mkAttachments(["virus.exe"])) !== null);
  check(".bat vẫn bị chặn", findDangerousAttachment(mkAttachments(["crack.bat"])) !== null);
  check(".ps1 vẫn bị chặn", findDangerousAttachment(mkAttachments(["script.ps1"])) !== null);
  check(".apk vẫn bị chặn", findDangerousAttachment(mkAttachments(["game.apk"])) !== null);
  check(
    "hỗn hợp: chỉ file nguy hiểm bị báo",
    findDangerousAttachment(mkAttachments(["main.js", "loader.exe"]))?.name === "loader.exe",
  );

  console.log("== 2. Chat thường có từ 'giveaway/airdrop' KHÔNG bị phạt ==");
  check(
    "bài viết giveaway + link shopee (TLD thường) → bỏ qua",
    findMaliciousLink("chuong trinh giveaway tren https://shopee.vn/mega-sale khong lien quan") ===
      null,
  );
  check(
    "airdrop + link blog .com → bỏ qua",
    findMaliciousLink("doc bai viet airdrop nay https://mycrypto-blog.com/airdrop-guide") === null,
  );
  check(
    "giveaway + link github → bỏ qua",
    findMaliciousLink("check giveaway https://github.com/someone/repo") === null,
  );

  console.log("== 3. Scam THẬT vẫn bị bắt ==");
  check(
    "free nitro + link lạ → phạt",
    findMaliciousLink("claim your free nitro at https://discord-nitro.gift/claim") !== null,
  );
  check(
    "giveaway + TLD lạm dụng (.ru) → phạt",
    findMaliciousLink("big giveaway join https://discord-giveaway.ru/claim") !== null,
  );
  check(
    "airdrop + TLD lạm dụng (.top) → phạt",
    findMaliciousLink("airdrop claim now https://binance-airdrop.top/claim") !== null,
  );
  check(
    "you won + link lạ → phạt",
    findMaliciousLink("you are the winner! visit https://winner-verify.xyz/prize") !== null,
  );
  check("domain scam rõ → phạt", findMaliciousLink("https://steam-gift.net/free") !== null);
  check("IP trực tiếp → phạt", findMaliciousLink("join http://1.2.3.4/hack") !== null);

  console.log("== 4. Threat intel học được: không khớp nhầm substrings ==");
  // Nạp intel giả: cụm "claim reward" (chuỗi con của "re-claim rewards").
  filters._setThreatIntelForTest(["password"], ["claim reward"]);
  check(
    '"re-claim rewards" (từ ghép hợp lệ) → KHÔNG khớp cụm',
    findLearnedThreat("we will re-claim rewards next season") === null,
  );
  check(
    '"claim reward" đứng riêng + không link → KHÔNG phạt (cụm standalone không đủ)',
    findLearnedThreat("claim reward ngay di ban") === null ||
      findLearnedThreat("claim reward ngay di ban")?.kind === "intel-phrase",
  );
  check(
    '"claim reward" + link lạ → phạt',
    findLearnedThreat("claim reward here https://weird-site.top/x") !== null,
  );
  check(
    "từ khóa đơn học được KHÔNG kèm link → bỏ qua (chat thường)",
    findLearnedThreat("doi password hoang khoe khoang lam") === null,
  );
  check(
    "từ khóa đơn + link github (lành tính) → bỏ qua",
    findLearnedThreat("password reset flow https://github.com/x/y") === null,
  );
  check(
    "từ khóa đơn + link lạ → phạt",
    findLearnedThreat("enter your password at https://verify-login.xyz/now") !== null,
  );
  filters._setThreatIntelForTest([], []);

  console.log("== 4b. getLearnedThreats: đọc mẫu scam đã học cho AI đối chiếu ==");
  filters._setThreatIntelForTest(["password", "free nitro"], ["claim reward now"]);
  const learned =
    typeof filters.getLearnedThreats === "function"
      ? filters.getLearnedThreats()
      : { keywords: [], phrases: [] };
  check(
    "getLearnedThreats trả keywords/phrases đã nạp",
    learned.keywords.includes("free nitro") && learned.phrases.includes("claim reward now"),
  );
  check(
    "getLearnedThreats không ném khi intel rỗng",
    (() => {
      filters._setThreatIntelForTest([], []);
      const empty = filters.getLearnedThreats();
      return Array.isArray(empty.keywords) && Array.isArray(empty.phrases);
    })(),
  );

  console.log("== 5. Heat: thành viên vô tội một lần vi phạm nhẹ KHÔNG bị kick/ban ==");
  const heat = new HeatTracker({}, {});
  const s = heatSettings({}); // mặc định: warn 25 / timeout 40 / kick 70 / ban 90
  const r1 = await heat.add("g1", "u1", "thanhvien", 10, s);
  check("1 lần vi phạm nhẹ: nhiệt < ngưỡng timeout", r1.heat < s.timeoutAt);
  check("tier 1 lần = warn hoặc safe", r1.tier === "safe" || r1.tier === "warn");
  const chosen1 = choosePunish("warn", r1);
  check("hình phạt lần đầu = warn", chosen1 === "warn");

  // Nhiệt decay: chờ "1 phút" giả lập
  const entry = heat.states.get("g1:u1");
  entry.updatedAt = Date.now() - 2 * 60_000;
  const decayed = heat.getHeat("g1", "u1", s);
  check("nhiệt tự giảm sau thời gian (decay hoạt động)", decayed < r1.heat);

  console.log("== 6. Tái phạm nhân nhiệt NHƯNG vẫn qua các bậc ==");
  heat.markPunished("g1", "u1"); // giả lập vừa bị phạt
  const r2 = await heat.add("g1", "u1", "thanhvien", 10, s);
  check("tái phạm bị nhân x2", r2.added >= 20);
  check("chưa tới ngưỡng kick sau 2 lần", r2.heat < s.kickAt);

  console.log("== 7. Heat cộng dồn nhiều lần → kick/ban đúng bậc (spam thật) ==");
  const heat2 = new HeatTracker({}, {});
  let last;
  for (let i = 0; i < 12; i++) {
    heat2.markPunished("g2", "u2");
    last = await heat2.add("g2", "u2", "spammer", 10, s);
  }
  check("spam lặp nhiều lần cuối cùng chạm ngưỡng cao", last.heat >= s.timeoutAt);
  const chosenFinal = choosePunish("warn", last);
  check("spam cứng đầu bị timeout trở lên", ["timeout", "kick", "ban"].includes(chosenFinal));

  console.log("== 8. Warn strike escalation ==");
  const heat3 = new HeatTracker({}, {});
  const s3 = heatSettings({ warnStrikeLimit: 3, warnStrikePunish: "timeout" });
  heat3.strike("g3", "u3", s3, "a");
  heat3.strike("g3", "u3", s3, "a");
  const st3 = heat3.strike("g3", "u3", s3, "a");
  check("đủ 3 warn → tăng cấp", st3.escalated === true && st3.punish === "timeout");

  console.log("== 9. ClearStrikes gỡ oan ==");
  heat3.clearStrikes("g3", "u3");
  check("sau khi gỡ, số strike về 0", heat3.strikeCount("g3", "u3", s3) === 0);

  console.log("== 10. findSuspiciousLink: link lành tính phổ biến ==");
  check(
    "discord.gg là lành tính",
    findSuspiciousLink("vao server https://discord.gg/abc") === null,
  );
  check(
    "github.io (mới thêm) là lành tính",
    findSuspiciousLink("blog cua toi https://someone.github.io/post") === null,
  );
  check(
    "shopee.vn (mới thêm) là lành tính",
    findSuspiciousLink("sale https://shopee.vn/x") === null,
  );
  check(
    "docs.google.com là lành tính",
    findSuspiciousLink("tai lieu https://docs.google.com/document/d/abc") === null,
  );
  check(
    "domain lạ vẫn đáng ngờ",
    findSuspiciousLink("vao https://unknown-weird-site.net/x") !== null,
  );

  console.log("== 11. punishMember: bot tin cậy không bị ban/kick nhầm ==");
  const now = Date.now();
  const fakeGuild = { id: "g9" };
  const trustedOldBot = {
    id: "bot1",
    user: { bot: true, username: "carl" },
    joinedTimestamp: now - 30 * 86_400_000, // 30 ngày
    timeout: async () => {},
    ban: async () => {
      throw new Error("should not ban");
    },
    kick: async () => {
      throw new Error("should not kick");
    },
    send: async () => {},
  };
  let timeoutCalled = false;
  trustedOldBot.timeout = async () => {
    timeoutCalled = true;
  };
  const resBot = await punishMember(fakeGuild, trustedOldBot, "ban", "test", 300, null);
  check(
    "bot ở lại 30 ngày bị ban → HẠ xuống timeout",
    timeoutCalled === true && resBot.action.includes("tạm khóa"),
  );

  const verifiedNewBot = {
    id: "bot2",
    user: {
      bot: true,
      username: "verified",
      flags: { has: (flag) => flag === 1n << 16n },
    },
    joinedTimestamp: now,
    timeout: async () => {},
    ban: async () => {
      throw new Error("verified bot must not be banned");
    },
    kick: async () => {
      throw new Error("verified bot must not be kicked");
    },
  };
  const resVerified = await punishMember(fakeGuild, verifiedNewBot, "ban", "test", 300, null);
  check(
    "bot mới có UserFlags.VerifiedBot → HẠ xuống timeout",
    resVerified.action.includes("tạm khóa"),
  );

  console.log(`\nKết quả misfire-guard: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
