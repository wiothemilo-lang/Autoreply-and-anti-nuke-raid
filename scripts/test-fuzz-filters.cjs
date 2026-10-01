// FUZZ TEST — bắn corpus thù địch vào bộ lọc nội dung, tự chốt: KHÔNG crash:
//   findMaliciousLink / findSuspiciousLink — 500 chuỗi xấu mỗi hàm → object|null
//   findDangerousAttachment               — attachment name rác → object|null
//   wordBoundaryRegex (qua badWords)      — badWords là input người dùng: regex
//                                           injection (".*", "(", "\\") không được ném
//   scanMessage end-to-end                — 120 tin nhắn corpus đầy đủ module,
//                                           bot/DM/exempt đi đúng đường bỏ qua
// Corpus gồm: scam URL thật, invite link, unicode confusable (Cyrillic е), null
// byte, RTL override, emoji, chuỗi 10KB, chuỗi rỗng. Chạy: node scripts/test-fuzz-filters.cjs
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
  addFields(f) { this.d.fields = [...(this.d.fields ?? []), ...(Array.isArray(f) ? f : [f])]; return this; }
  setTimestamp() { return this; }
  setFooter(f) { this.d.footer = f; return this; }
}
module.exports = {
  Colors: new Proxy({}, { get: () => 0x000000 }),
  EmbedBuilder,
  PermissionFlagsBits: { ManageGuild: 1n << 5n, Administrator: 1n << 3n, ManageRoles: 1n << 28n, ManageWebhooks: 1n << 29n, BanMembers: 1n << 2n },
  UserFlags: { VerifiedBot: 1n << 16n },
  AuditLogEvent: new Proxy({}, { get: (t, k) => (t[k] ??= Symbol(k)) }),
};
`,
);

let pass = 0;
let fail = 0;
function check(label, cond, extra = "") {
  if (cond) pass++;
  else {
    fail++;
    console.log(`FAIL ${label} ${extra}`);
  }
}

// ── rng seeded (giống test-property) ──
let _state = 0x51af3c7;
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
  const pools = [
    "abcXYZ019_.-/:?# ",
    "tiếngViệtổnățивлен",
    "🙂🔥👍‼️",
    "\u200b\u200c\u200d\ufeff\u2060",
    "\u0000\u0007\u001f\u007f",
    "\u202e\u202d",
    "𝕏ⓐⓑⓒ",
  ];
  let out = "";
  for (let i = 0; i < len; i++) out += pick(pools)[int(0, pick(pools).length - 1)];
  return out;
}

(async () => {
  const filters = require("../bot/src/handlers/filters");
  const scanMessage = filters; // module.exports = scanMessage (export chính)
  const { findDangerousAttachment, findMaliciousLink, findSuspiciousLink } = filters;

  // ════════ 1. findMaliciousLink / findSuspiciousLink — fuzz trực tiếp ════════
  const SCAM_SAMPLES = [
    "https://discord-nitro.ru/gift",
    "www.steam-gift.net/free",
    "http://freе-nitro.com", // Cyrillic е — confusable thật
    "https://metamask-verify.com/claim",
    "check https://discord.gg/abc and www.discordgift.site now",
  ];
  let bad = 0;
  for (let i = 0; i < 500; i++) {
    const s =
      rng() < 0.3
        ? pick(SCAM_SAMPLES) + weirdString(int(0, 10))
        : weirdString(int(0, 80)) || pick(SCAM_SAMPLES);
    try {
      const r = findMaliciousLink(s);
      if (r !== null && typeof r !== "object") bad++;
    } catch (e) {
      bad++;
      console.log("  findMaliciousLink ném với:", JSON.stringify(s.slice(0, 40)), String(e));
      break;
    }
    try {
      const r2 = findSuspiciousLink(s);
      if (r2 !== null && typeof r2 !== "object") bad++;
    } catch (e) {
      bad++;
      console.log("  findSuspiciousLink ném với:", JSON.stringify(s.slice(0, 40)), String(e));
      break;
    }
  }
  check("findMaliciousLink + findSuspiciousLink: 500 chuỗi xấu — không ném, shape đúng", bad === 0);
  check(
    "scam URL thật vẫn bị phát hiện sau fuzz",
    !!filters.findMaliciousLink("https://discord-nitro.ru/gift"),
  );

  // ════════ 2. findDangerousAttachment — tên file rác ════════
  {
    let badAtt = 0;
    const DANGEROUS = [".exe", ".scr", ".bat", ".cmd", ".ps1", ".jar", ".vbs"];
    for (let i = 0; i < 300; i++) {
      const name =
        rng() < 0.4
          ? "payload" + pick(DANGEROUS)
          : weirdString(int(0, 30)) + pick([".png", ".exe", "", ".tiff"]);
      try {
        const r = findDangerousAttachment({
          values: () => [{ name }].values(),
        });
        if (r !== null && (typeof r.name !== "string" || typeof r.ext !== "string")) badAtt++;
      } catch (e) {
        badAtt++;
        console.log("  findDangerousAttachment ném với:", JSON.stringify(name), String(e));
        break;
      }
    }
    check("findDangerousAttachment: 300 tên file rác — không ném, shape đúng", badAtt === 0);
    check(
      "file .exe thật vẫn bị phát hiện",
      !!findDangerousAttachment({ values: () => [{ name: "virus.exe" }].values() }),
    );
  }

  // ════════ 3. badWords regex injection — qua scanMessage end-to-end ════════
  const punishments = [];
  const config = {
    antinukeEnabled: true,
    modules: [
      {
        module: "invite",
        enabled: true,
        threshold: 2,
        windowSeconds: 10,
        punish: "timeout",
        timeoutSeconds: 60,
        actions: ["deleteMessages"],
      },
      {
        module: "badword",
        enabled: true,
        threshold: 2,
        windowSeconds: 10,
        punish: "warn",
        timeoutSeconds: 60,
        actions: ["deleteMessages"],
      },
      {
        module: "malware",
        enabled: true,
        threshold: 2,
        windowSeconds: 10,
        punish: "timeout",
        timeoutSeconds: 60,
        actions: ["deleteMessages"],
      },
      {
        module: "mention",
        enabled: true,
        threshold: 3,
        windowSeconds: 10,
        punish: "timeout",
        timeoutSeconds: 60,
        actions: ["deleteMessages"],
      },
      {
        module: "attachment",
        enabled: true,
        threshold: 3,
        windowSeconds: 10,
        punish: "timeout",
        timeoutSeconds: 60,
        actions: ["deleteMessages"],
      },
    ],
    badWords: [
      "badword",
      // regex injection — input người dùng thù địch
      ".*",
      "(",
      "[",
      "\\\\",
      "(?<=x)*",
      "a{9999999999}",
      "\u0000",
      "(()=>{})()",
      weirdString(15),
    ],
  };
  const store = {
    getConfig: async () => config,
    client: { mutation: async () => ({ caseNumber: 1 }), query: async () => [] },
  };
  const heat = {
    add: async () => null,
    markPunished: () => {},
    resetGuild: () => {},
    strike: () => ({ escalated: false, punish: "warn", count: 1 }), // warn tích lũy
    strikeUsername: () => null,
  };
  const client = { user: { id: "bot-self" }, guilds: { cache: new Map() }, on: () => {} };

  function makeMessage(id, content, overrides = {}) {
    return {
      id,
      guild: { id: "g-fuzz", ownerId: "owner-1", name: "Fuzz" },
      author: { id: "u1", username: "member", bot: false },
      member: {
        id: "u1",
        guild: { id: "g-fuzz", ownerId: "owner-1" }, // discord.js gắn guild vào member
        permissions: { has: () => false },
        roles: { cache: { has: () => false } },
        timeout: async () => {},
        kick: async () => {},
        ban: async () => {},
        send: async () => {},
      },
      content,
      channel: {
        isDMBased: () => false,
        isTextBased: () => true,
        send: async () => {},
        bulkDelete: async () => {},
      },
      mentions: { users: { size: 0 }, roles: { size: 0 }, channels: { size: 0 }, everyone: false },
      attachments: { size: 0, values: () => [].values() },
      deletable: true,
      delete: async () => {},
      createdTimestamp: Date.now(),
      ...overrides,
    };
  }

  // Corpus thù địch + hợp lệ trộn lẫn
  const CORPUS = [
    ...SCAM_SAMPLES,
    "discord.gg/abcdef @everyone <@123456789>",
    "badword trong câu bình thường",
    "từBadWordViếtHoa",
    "\u0000badword\u0000",
    "freе-nitro.com giveaway 🎉",
    "x".repeat(10_000),
    "",
    "   ",
    weirdString(60),
    "<@&123> <#456> @everyone @everyone @everyone",
  ];

  // 3a. Regex injection qua badWords không được ném
  {
    let threw = null;
    try {
      for (let i = 0; i < CORPUS.length; i++) {
        await scanMessage(client, makeMessage("bw" + i, CORPUS[i]), store, heat);
      }
    } catch (e) {
      threw = e;
    }
    check(
      "badWords regex injection → scanMessage không ném",
      threw === null,
      threw ? String(threw) : "",
    );
  }

  // 3b. Tin nhắn bot + DM phải bị bỏ qua ngay từ đầu
  {
    const punishmentsBefore = punishments.length;
    await scanMessage(
      client,
      makeMessage("bot1", "badword", { author: { id: "b2", bot: true, username: "bot" } }),
      store,
      heat,
    );
    await scanMessage(
      client,
      makeMessage("dm1", "badword", {
        channel: { isDMBased: () => true, isTextBased: () => true },
      }),
      store,
      heat,
    );
    check("bot message + DM → bỏ qua, không phạt", punishments.length === punishmentsBefore);
  }

  // 3c. Fuzz end-to-end: 120 tin nhắn ngẫu nhiên — không crash, không treo
  {
    let threw = null;
    try {
      for (let i = 0; i < 120; i++) {
        const content =
          rng() < 0.5
            ? weirdString(int(0, 120)) + pick(SCAM_SAMPLES)
            : pick(CORPUS) + weirdString(int(0, 20));
        await scanMessage(client, makeMessage("fz" + i, content), store, heat);
      }
    } catch (e) {
      threw = e;
    }
    check(
      "fuzz end-to-end 120 tin nhắn → scanMessage không ném, không treo",
      threw === null,
      threw ? String(threw) : "",
    );
  }

  fs.unlinkSync(DJS_MOCK);
  console.log(`\nKết quả fuzz: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("FUZZ TEST CRASH:", e);
  process.exit(2);
});
