// PROPERTY-BASED TEST — kiểm BẤT BIẾN trên hàng trăm input ngẫu nhiên (seeded,
// chạy lại ra đúng kết quả cũ — fail luôn tái hiện được), thay vì test ví dụ đơn lẻ:
//   usernameSimilarity   — luôn 0..100, đối xứng, không NaN/throw kể cả unicode
//   memberSuspicionScore — luôn ≥0 nguyên, không throw khi thiếu field
//   botHitAndRunVerdict  — khớp 100% predicate tham chiếu (mirror testing)
//   strangeBotVerdict    — alert ⇒ chắc chắn là bot lạ thật (không cảnh báo người thường)
//   normalizeFuzzy       — idempotent, không ném với ký tự điều khiển
//   budgetLimitFor       — mọi Number → 1..200
//   actionBudget usage   — record N lần → usage ≤ N, usage guild khác = 0
// Mini property-runner tự viết (seeded RNG) — KHÔNG thêm dependency.
// Chạy: node scripts/test-property.cjs

// rng seeded — cùng seed = cùng chuỗi input = fail tái hiện 100%
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
/** Chuỗi "xấu" ngẫu nhiên: unicode, emoji, điều khiển, RTL, RTL override, zero-width… */
function weirdString(len) {
  const pools = [
    "abcXYZ019_ ",
    "tiếngViệtổnățивлен",
    "🙂🔥👍🔴‼️",
    "\u200b\u200c\u200d\ufeff\u2060",
    "\u0000\u0007\u001f\u007f",
    "\u202e\u202d",
    "𝕏ⓐⓑⓒ🅰🅱",
  ];
  let out = "";
  for (let i = 0; i < len; i++) out += pick(pools)[int(0, pick(pools).length - 1)];
  return out;
}

let pass = 0;
let fail = 0;
function check(label, cond, extra = "") {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL ${label} ${extra}`);
  }
}

(async () => {
  // ════════ usernameSimilarity ════════
  const { usernameSimilarity, isGeneratedUsername } = require("../bot/src/altDetection");
  const CHARSETS = [
    "abc",
    "Thang",
    "Nguyễn Văn A",
    "user123",
    "🎉🎈",
    "\u202ehax",
    "a".repeat(40),
    "",
  ];
  const N1 = 300;
  let badSim = 0;
  let firstSimErr = "";
  for (let i = 0; i < N1; i++) {
    const a = weirdString(int(0, 30)) || pick(CHARSETS);
    const b = weirdString(int(0, 30)) || pick(CHARSETS);
    let s1, s2;
    try {
      s1 = usernameSimilarity(a, b);
      s2 = usernameSimilarity(b, a);
    } catch (e) {
      badSim++;
      firstSimErr ||= `ném với ${JSON.stringify([a, b])}: ${String(e)}`;
      continue;
    }
    if (!Number.isFinite(s1) || s1 < 0 || s1 > 100) {
      badSim++;
      firstSimErr ||= `got ${s1} cho ${JSON.stringify([a, b])}`;
      continue;
    }
    if (s1 !== s2) {
      badSim++;
      firstSimErr ||= `không đối xứng ${JSON.stringify([a, b])} → ${s1} vs ${s2}`;
    }
  }
  check(`usernameSimilarity: ${N1} cặp ngẫu nhiên đạt mọi bất biến`, badSim === 0, firstSimErr);
  // Đặc điểm định hướng (corner cases có chủ đích):
  check("giống hệt nhau ≥ 90", usernameSimilarity("nguyenvana_2009", "nguyenvana_2009") >= 90);
  check("khác hoàn toàn = 0", usernameSimilarity("abcdef", "xyzuvw") === 0);

  // ════════ isGeneratedUsername ════════
  // Trả object { generated, pattern } — bất biến: không ném, field generated là boolean.
  {
    let bad = 0;
    for (let i = 0; i < 100; i++) {
      const s = weirdString(int(0, 25)) || pick(CHARSETS);
      try {
        const r = isGeneratedUsername(s);
        if (typeof r?.generated !== "boolean") bad++;
      } catch (e) {
        bad++;
        console.log("  isGeneratedUsername ném với:", JSON.stringify(s), String(e));
        break;
      }
    }
    check("isGeneratedUsername: 100 chuỗi xấu — không ném, generated là boolean", bad === 0);
  }

  // ════════ shared.js — chấm điểm member/cluster ════════
  const shared = require("../bot/src/handlers/antinuke/shared");
  const N2 = 300;
  let badScore = 0;
  let firstScoreErr = "";
  for (let i = 0; i < N2; i++) {
    const p = {
      id: "u" + i,
      // 30%:null 70%:ngẫu nhiên
      createdAt: rng() < 0.3 ? undefined : Date.now() - int(0, 3_000) * 86_400_000,
      avatar: rng() < 0.5 ? "hash" + i : null,
      username:
        rng() < 0.3 ? weirdString(int(0, 20)) : pick(["user" + int(100, 9999), "Thang", "a_1", ""]),
      bot: rng() < 0.3,
    };
    let score;
    try {
      score = shared.memberSuspicionScore(p);
    } catch (e) {
      badScore++;
      firstScoreErr ||= `ném với ${JSON.stringify(p)}: ${String(e)}`;
      continue;
    }
    if (!Number.isInteger(score) || score < 0) {
      badScore++;
      firstScoreErr ||= `got ${score} cho ${JSON.stringify(p)}`;
    }
  }
  check(
    `memberSuspicionScore: ${N2} hồ sơ ngẫu nhiên đạt mọi bất biến`,
    badScore === 0,
    firstScoreErr,
  );

  // botHitAndRunVerdict — MIRROR testing: khớp predicate tham chiếu 100%
  {
    const WINDOW_MS = 10 * 60_000; // ghi đúng hằng số trong shared.js (10 phút)
    let mismatch = 0;
    const N3 = 400;
    for (let i = 0; i < N3; i++) {
      const addedAt = int(0, 1_700_000_000_000);
      const leftAt = addedAt + int(-60_000, 30 * 60_000);
      const trusted = rng() < 0.3;
      const isBot = rng() < 0.5;
      const got = shared.botHitAndRunVerdict({ addedAt, leftAt, trusted, isBot });
      // Predicate tham chiếu: hit-and-run = bot + có addedAt + rời trong cửa sổ + không tin cậy.
      // leftAt < addedAt (thời gian âm) không phải hit-and-run — verdict thật phải false.
      const expectedRef =
        isBot === true &&
        addedAt > 0 &&
        leftAt - addedAt >= 0 &&
        leftAt - addedAt <= WINDOW_MS &&
        trusted === false;
      if (got !== expectedRef) mismatch++;
    }
    check(`botHitAndRunVerdict khớp predicate tham chiếu ${N3 - mismatch}/${N3}`, mismatch === 0);
  }

  // strangeBotVerdict — alert ⇒ chắc chắn bot + không phải logging/verified + acc trẻ
  {
    const now = Date.now();
    const N4 = 200;
    let bad = 0;
    for (let i = 0; i < N4; i++) {
      const u = {
        id: "b" + i,
        bot: rng() < 0.5 ? true : rng() < 0.5 ? false : undefined,
        createdAt: now - int(0, 200) * 86_400_000,
        username: pick(["Logger", "Carl Bot", "wick", "x" + i]),
        flags: rng() < 0.3 ? { has: () => true } : { has: () => false },
      };
      const v = shared.strangeBotVerdict({ user: u, now });
      if (v.alert === true) {
        // Bất biến thực: alert ⇔ (bot + không logging + không verified). Acc trẻ
        // chỉ đổi mức độ (kind "unknown-young") chứ không điều kiện alert.
        const isLogging = shared.isKnownLoggingBot(u);
        const verified = typeof u.flags?.has === "function" && u.flags.has(4);
        if (!(u.bot === true && !isLogging && !verified)) bad++;
      }
      if (typeof v.alert !== "boolean") bad++;
    }
    check(`strangeBotVerdict: ${N4} hồ sơ — alert chỉ khi bot lạ thật`, bad === 0);
    check(
      "strangeBotVerdict: người thường → không cảnh báo",
      shared.strangeBotVerdict({ user: { bot: false } }).alert === false,
    );
  }

  // ════════ externalAppGuard — normalizeFuzzy idempotent + fingerprint shape ════════
  const guard = require("../bot/src/externalAppGuard");
  {
    let bad = 0;
    for (let i = 0; i < 200; i++) {
      const s = weirdString(int(0, 40)) || pick(CHARSETS);
      try {
        const n1 = guard.normalizeFuzzy(s);
        const n2 = guard.normalizeFuzzy(n1);
        if (n1 !== n2) bad++; // idempotent: normalize(normalize(x)) === normalize(x)
        if (typeof n1 !== "string") bad++;
      } catch (e) {
        bad++;
        console.log("  normalizeFuzzy ném với:", JSON.stringify(s), String(e));
        break;
      }
    }
    check("normalizeFuzzy: 200 chuỗi xấu — string + idempotent", bad === 0);
  }
  {
    let bad = 0;
    for (let i = 0; i < 150; i++) {
      const msg = {
        content: weirdString(int(0, 50)),
        embeds: rng() < 0.5 ? [] : [{ title: weirdString(10), description: weirdString(20) }],
      };
      try {
        const fp = guard.messageFingerprint(msg);
        if (typeof fp !== "string") bad++; // trả string đã normalize, không phải mảng
      } catch (e) {
        bad++;
        break;
      }
    }
    check("messageFingerprint: 150 tin nhắn xấu — luôn trả string", bad === 0);
  }

  // ════════ actionBudget — mọi Number → 1..200; usage nhất quán ════════
  const budget = require("../bot/src/actionBudget");
  {
    let bad = 0;
    for (let i = 0; i < 200; i++) {
      const cfg = {
        actionBudgetPerMinute: pick([int(-50, 300), 0, NaN, Infinity, -Infinity, "50", null]),
      };
      const lim = budget.budgetLimitFor(cfg);
      if (!(lim >= 1 && lim <= 200 && Number.isInteger(lim))) bad++;
    }
    check("budgetLimitFor: 200 config rác → luôn 1..200 nguyên", bad === 0);
  }
  {
    budget.resetGuild("g-prop");
    let bad = 0;
    const N = int(5, 40);
    for (let i = 0; i < N; i++) {
      budget.recordPunish("g-prop");
      if (budget.usage("g-prop") > N) bad++;
    }
    if (budget.usage("g-prop") !== N) bad++;
    if (budget.usage("g-khác") !== 0) bad++;
    check(`actionBudget: record ${N} → usage đúng, guild khác 0`, bad === 0);
  }

  console.log(`\nKết quả property: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("PROPERTY TEST CRASH:", e);
  process.exit(2);
});
