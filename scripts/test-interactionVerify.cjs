// Test handlers/interactionVerify.js — luồng xác minh thành viên.
// Chạy: node scripts/test-interactionVerify.cjs — không mạng, không Discord thật.
//
// Vì sao tách suite riêng (trước đây chỉ test GIÁN TIẾP qua test-interaction-create):
//   - `sweepVerifyAttempts` (dọn Map rate-limit) chưa từng được gọi → hàm 0%.
//   - Nhánh DM chào mừng (title/description/color mặc định + fallback) và nhánh
//     catch ngoài cùng (interaction.reply ném) chưa chạm.
// Suite này gọi THẲNG hai handler với mọi phụ thuộc được mock, và lấy callback
// dọn dẹp qua registerSweep để kiểm `sweepVerifyAttempts` ở đúng biên 10 phút.
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
  constructor(data = {}) { this.data = { ...data }; }
  setColor(c) { this.data.color = c; return this; }
  setTitle(t) { this.data.title = t; return this; }
  setDescription(t) { this.data.description = t; return this; }
  addFields(...f) { this.data.fields = [...(this.data.fields ?? []), ...f.flat(Infinity)]; return this; }
  setTimestamp() { return this; }
  setFooter(f) { this.data.footer = f; return this; }
  setThumbnail(u) { this.data.thumbnail = u; return this; }
}
module.exports = { Colors: new Proxy({}, { get: () => 0 }), EmbedBuilder };
`,
);

// ── Trạng thái điều khiển từ test ──
const ctl = {
  analysis: { riskScore: 0, action: "pass", riskFactors: [] },
  analysisThrows: false,
  punish: { executed: false },
};
const calls = {
  captchaSet: [],
  dms: [],
  mutations: [],
  logs: [],
  sweeps: new Map(), // tên → { fn, everyMs } (bắt qua registerSweep)
};

const sweeperMock = {
  registerSweep: (name, fn, everyMs) => {
    calls.sweeps.set(name, { fn, everyMs });
    return name;
  },
};
const captchaMock = {
  genCaptcha: () => "123456",
  setCode: (g, u, c) => calls.captchaSet.push({ g, u, c }),
};
const utilMock = {
  sendLog: async (guild, config, embed) => calls.logs.push({ guildId: guild?.id, embed }),
};
const altMock = {
  analyzeNewMember: async () => {
    if (ctl.analysisThrows) throw new Error("AI analysis fail");
    return ctl.analysis;
  },
  executePunishment: async () => ctl.punish,
  buildRiskEmbed: () => ({
    setTitle() {
      return this;
    },
    setDescription() {
      return this;
    },
  }),
};

const origLoad = Module._load;
Module._load = function (request, parent) {
  const fromVerify = parent && /handlers[\\/]interactionVerify\.js$/.test(parent.filename);
  if (fromVerify) {
    if (request === "../sweeper") return sweeperMock;
    if (request === "../captchaStore") return captchaMock;
    if (request === "../altDetection") return altMock;
    if (request === "../util") return utilMock;
  }
  return origLoad.apply(this, arguments);
};

const verify = require("../bot/src/handlers/interactionVerify.js");

// ── Helpers ──
let pass = 0;
let fail = 0;
function check(label, cond) {
  if (cond) {
    pass++;
    console.log(`PASS ${label}`);
  } else {
    fail++;
    console.log(`FAIL ${label}`);
  }
}

function mkMember(id, { hasUnverified = true, hasVerified = false } = {}) {
  const roles = new Set();
  if (hasUnverified) roles.add("r-unv");
  if (hasVerified) roles.add("r-ver");
  const added = [];
  const removed = [];
  return {
    id,
    user: { id, username: `user-${id}` },
    roles: {
      cache: { has: (r) => roles.has(r) },
      add: async (r) => {
        added.push(r);
        roles.add(r);
      },
      remove: async (r) => {
        removed.push(r);
        roles.delete(r);
      },
    },
    send: async (payload) => calls.dms.push({ id, payload }),
    _added: added,
    _removed: removed,
  };
}

function mkGuild(id, member, { name = "Guild One" } = {}) {
  const cache = new Map();
  if (member) cache.set(member.id, member);
  return {
    id,
    name,
    iconURL: () => null,
    members: {
      cache,
      fetch: async (uid) => (member && member.id === uid ? member : null),
    },
  };
}

function mkInteraction({ guild = null, userId = "u1", replyImpl } = {}) {
  const replies = [];
  const interaction = {
    guild,
    user: { id: userId },
    replied: false,
    _replies: replies,
    reply: async (payload) => {
      if (replyImpl) return replyImpl(payload);
      replies.push(payload);
      interaction.replied = true;
      return payload;
    },
  };
  return interaction;
}

function mkStore(config, { mutations = calls.mutations } = {}) {
  return {
    getConfig: async () => config,
    client: {
      mutation: async (name, args) => {
        mutations.push({ name, args });
        return { ok: true };
      },
    },
  };
}

// Điều khiển "đồng hồ" cho sweepVerifyAttempts (nó đọc Date.now()).
function withNow(t, fn) {
  const real = Date.now;
  Date.now = () => t;
  try {
    return fn();
  } finally {
    Date.now = real;
  }
}
async function withNowAsync(t, fn) {
  const real = Date.now;
  Date.now = () => t;
  try {
    return await fn();
  } finally {
    Date.now = real;
  }
}

const FIXED = 1_700_000_000_000;
const WINDOW = 10 * 60 * 1000;
const sweepFn = () => calls.sweeps.get("interactionVerify").fn();

(async () => {
  // ── 0. Hợp đồng đăng ký dọn dẹp ──
  check("đăng ký sweep tên interactionVerify", calls.sweeps.has("interactionVerify"));
  check("chu kỳ sweep 5 phút", calls.sweeps.get("interactionVerify")?.everyMs === 300_000);

  // ══════════════════ 1. sweepVerifyAttempts (trọng tâm) ══════════════════
  {
    // Xoá sạch trước khi đo (mọi entry hiện có đều cũ so với mốc tương lai xa).
    withNow(FIXED + 100 * WINDOW, () => sweepFn());

    const seedStore = mkStore({ verifyEnabled: true, unverifiedRoleId: "r-unv" });
    const seed = (uid, t) =>
      withNowAsync(t, () =>
        verify.handleVerifyRequestCaptcha(
          seedStore,
          mkInteraction({ guild: mkGuild("gs", mkMember(uid)), userId: uid }),
        ),
      );

    await seed("sweepA", FIXED);
    await seed("sweepB", FIXED);

    check("sweep khi chưa tới hạn → không xoá", withNow(FIXED + 5 * 60_000, () => sweepFn()) === 0);
    check(
      "sweep tại ĐÚNG mốc 10 phút → chưa xoá (dùng < chứ không <=)",
      withNow(FIXED + WINDOW, () => sweepFn()) === 0,
    );
    check("sweep quá hạn 1ms → xoá cả 2 entry", withNow(FIXED + WINDOW + 1, () => sweepFn()) === 2);
    check("sweep lần hai khi đã sạch → 0", withNow(FIXED + WINDOW + 1, () => sweepFn()) === 0);

    // Entry FRESH phải sống sót qua một lượt quét có entry cũ lẫn mới.
    await seed("keepFresh", FIXED + WINDOW); // mốc mới
    await seed("dropStale", FIXED); // mốc cũ
    const removed = withNow(FIXED + WINDOW + 1, () => sweepFn());
    check("chỉ xoá entry cũ, giữ entry mới (removed=1)", removed === 1, `removed=${removed}`);
    check(
      "entry mới vẫn còn sau sweep (rate-limit vẫn tính) — quét lại không xoá thêm",
      withNow(FIXED + WINDOW + 1, () => sweepFn()) === 0,
    );
  }

  // ══════════════════ 2. handleVerifyRequestCaptcha ══════════════════
  {
    // Không guild → im lặng
    let inter = mkInteraction({ guild: null });
    await verify.handleVerifyRequestCaptcha(mkStore({}), inter);
    check("captcha: không guild → không reply", inter._replies.length === 0);

    // verify tắt
    inter = mkInteraction({ guild: mkGuild("g1", mkMember("u1")) });
    await verify.handleVerifyRequestCaptcha(mkStore({ verifyEnabled: false }), inter);
    check("captcha: verify tắt → từ chối", /đã bị tắt/.test(inter._replies[0].content));

    // thiếu role
    inter = mkInteraction({ guild: mkGuild("g1", mkMember("u1")) });
    await verify.handleVerifyRequestCaptcha(mkStore({ verifyEnabled: true }), inter);
    check("captcha: thiếu role → từ chối", /Chưa cấu hình role/.test(inter._replies[0].content));

    // không tìm thấy member
    {
      const g = mkGuild("g1", mkMember("who"));
      g.members.cache = new Map();
      g.members.fetch = async () => null;
      inter = mkInteraction({ guild: g, userId: "ghost" });
      await verify.handleVerifyRequestCaptcha(
        mkStore({ verifyEnabled: true, unverifiedRoleId: "r-unv" }),
        inter,
      );
      check(
        "captcha: không tìm thấy member → từ chối",
        /Không tìm thấy/.test(inter._replies[0].content),
      );
    }

    // đã xác minh rồi
    inter = mkInteraction({ guild: mkGuild("g1", mkMember("u1", { hasUnverified: false })) });
    await verify.handleVerifyRequestCaptcha(
      mkStore({ verifyEnabled: true, unverifiedRoleId: "r-unv" }),
      inter,
    );
    check(
      "captcha: đã xác minh rồi → thông báo",
      /đã xác minh rồi/.test(inter._replies[0].content),
    );

    // thành công → setCode + DM
    calls.captchaSet.length = 0;
    calls.dms.length = 0;
    inter = mkInteraction({ guild: mkGuild("g1", mkMember("ok1")), userId: "ok1" });
    await verify.handleVerifyRequestCaptcha(
      mkStore({ verifyEnabled: true, unverifiedRoleId: "r-unv" }),
      inter,
    );
    check(
      "captcha: thành công → set mã + gửi DM",
      calls.captchaSet.length === 1 &&
        calls.captchaSet[0].c === "123456" &&
        calls.dms.length === 1 &&
        /Đã gửi mã/.test(inter._replies[0].content),
    );

    // gửi DM lỗi → hướng dẫn bật DM
    {
      const m = mkMember("nodm");
      m.send = async () => {
        throw new Error("DM đóng");
      };
      inter = mkInteraction({ guild: mkGuild("g1", m), userId: "nodm" });
      await verify.handleVerifyRequestCaptcha(
        mkStore({ verifyEnabled: true, unverifiedRoleId: "r-unv" }),
        inter,
      );
      check(
        "captcha: DM lỗi → hướng dẫn bật tin nhắn trực tiếp",
        /cho phép tin nhắn trực tiếp/.test(inter._replies[0].content),
      );
    }

    // rate-limit: bấm lần 4 trong cửa sổ → chặn (không set mã, không DM)
    {
      const uid = "spammer";
      const m = mkMember(uid);
      const cfg = { verifyEnabled: true, unverifiedRoleId: "r-unv" };
      const st = mkStore(cfg);
      await withNowAsync(FIXED, async () => {
        for (let i = 0; i < 3; i++) {
          await verify.handleVerifyRequestCaptcha(
            st,
            mkInteraction({ guild: mkGuild("g1", m), userId: uid }),
          );
        }
      });
      calls.captchaSet.length = 0;
      calls.dms.length = 0;
      const blocked = mkInteraction({ guild: mkGuild("g1", m), userId: uid });
      await withNowAsync(FIXED + 1000, () => verify.handleVerifyRequestCaptcha(st, blocked));
      check(
        "captcha: bấm quá 3 lần/10 phút → chặn, không gửi thêm mã",
        calls.captchaSet.length === 0 &&
          calls.dms.length === 0 &&
          /quá nhiều lần/.test(blocked._replies[0].content),
      );
    }
  }

  // ══════════════════ 3. handleVerifyConfirm ══════════════════
  {
    // không guild
    let inter = mkInteraction({ guild: null });
    await verify.handleVerifyConfirm(mkStore({}), inter);
    check("confirm: không guild → không reply", inter._replies.length === 0);

    // verify tắt
    inter = mkInteraction({ guild: mkGuild("g1", mkMember("u1")) });
    await verify.handleVerifyConfirm(mkStore({ verifyEnabled: false }), inter);
    check("confirm: verify tắt → từ chối", /đã bị tắt/.test(inter._replies[0].content));

    // thiếu role
    inter = mkInteraction({ guild: mkGuild("g1", mkMember("u1")) });
    await verify.handleVerifyConfirm(
      mkStore({ verifyEnabled: true, unverifiedRoleId: "r-unv" }),
      inter,
    );
    check(
      "confirm: thiếu verified role → từ chối",
      /Chưa cấu hình role/.test(inter._replies[0].content),
    );

    // không tìm thấy member
    {
      const g = mkGuild("g1", mkMember("who"));
      g.members.cache = new Map();
      g.members.fetch = async () => null;
      inter = mkInteraction({ guild: g, userId: "ghost" });
      await verify.handleVerifyConfirm(
        mkStore({ verifyEnabled: true, unverifiedRoleId: "r-unv", verifiedRoleId: "r-ver" }),
        inter,
      );
      check(
        "confirm: không tìm thấy member → từ chối",
        /Không tìm thấy/.test(inter._replies[0].content),
      );
    }

    // thiếu role chưa xác minh
    inter = mkInteraction({
      guild: mkGuild("g1", mkMember("u1", { hasUnverified: false })),
    });
    await verify.handleVerifyConfirm(
      mkStore({ verifyEnabled: true, unverifiedRoleId: "r-unv", verifiedRoleId: "r-ver" }),
      inter,
    );
    check(
      "confirm: thiếu role chưa xác minh → chặn",
      /role chưa xác minh/.test(inter._replies[0].content),
    );

    // xác minh bình thường (đổi role) — không bật DM chào
    {
      const m = mkMember("normal1");
      inter = mkInteraction({ guild: mkGuild("g1", m), userId: "normal1" });
      await verify.handleVerifyConfirm(
        mkStore({ verifyEnabled: true, unverifiedRoleId: "r-unv", verifiedRoleId: "r-ver" }),
        inter,
      );
      check(
        "confirm: xác minh thường → gỡ role chưa xác minh + cấp role đã xác minh",
        m._removed.includes("r-unv") &&
          m._added.includes("r-ver") &&
          /Đã xác minh thành công/.test(inter._replies[0].content),
      );
    }

    // DM chào mừng: MẶC ĐỊNH (không title/desc/color) — phủ nhánh || và fallback màu
    {
      calls.dms.length = 0;
      const m = mkMember("wel1");
      inter = mkInteraction({ guild: mkGuild("g1", m), userId: "wel1" });
      await verify.handleVerifyConfirm(
        mkStore({
          verifyEnabled: true,
          unverifiedRoleId: "r-unv",
          verifiedRoleId: "r-ver",
          verifyWelcomeEnabled: true,
        }),
        inter,
      );
      const sent = calls.dms[calls.dms.length - 1]?.payload;
      const embed = sent?.embeds?.[0]?.data;
      check(
        "confirm: DM chào mừng mặc định → title/desc/màu fallback",
        sent &&
          /Chào mừng bạn!/.test(embed?.title || "") &&
          /Guild One/.test(embed?.description || "") &&
          embed?.color === 0xf2629e,
      );
    }

    // DM chào mừng: TUỲ CHỈNH + thay {user}/{server} + màu hợp lệ
    {
      calls.dms.length = 0;
      const m = mkMember("wel2");
      inter = mkInteraction({ guild: mkGuild("g1", m), userId: "wel2" });
      await verify.handleVerifyConfirm(
        mkStore({
          verifyEnabled: true,
          unverifiedRoleId: "r-unv",
          verifiedRoleId: "r-ver",
          verifyWelcomeEnabled: true,
          verifyWelcomeTitle: "Chào {user}",
          verifyWelcomeDescription: "{user} đã vào {server}",
          verifyWelcomeColor: "#00ff00",
        }),
        inter,
      );
      const embed = calls.dms[calls.dms.length - 1]?.payload?.embeds?.[0]?.data;
      // Chỉ DESCRIPTION thay placeholder {user}/{server}; title giữ nguyên (đặc tính cũ).
      check(
        "confirm: DM chào mừng tuỳ chỉnh → thay {user}/{server} trong desc + màu parse",
        embed?.title === "Chào {user}" &&
          embed?.description === "<@wel2> đã vào Guild One" &&
          embed?.color === 0x00ff00,
      );
    }

    // DM chào mừng: màu KHÔNG hợp lệ → fallback parseInt
    {
      calls.dms.length = 0;
      const m = mkMember("wel3");
      inter = mkInteraction({ guild: mkGuild("g1", m), userId: "wel3" });
      await verify.handleVerifyConfirm(
        mkStore({
          verifyEnabled: true,
          unverifiedRoleId: "r-unv",
          verifiedRoleId: "r-ver",
          verifyWelcomeEnabled: true,
          verifyWelcomeColor: "khong-phai-mau",
        }),
        inter,
      );
      const embed = calls.dms[calls.dms.length - 1]?.payload?.embeds?.[0]?.data;
      check("confirm: màu chào mừng không hợp lệ → fallback", embed?.color === 0xf2629e);
    }

    // DM chào mừng: dựng embed NÉM (iconURL hỏng) → bỏ qua im lặng, không làm hỏng luồng
    {
      calls.dms.length = 0;
      const m = mkMember("wel4");
      const g = mkGuild("g1", m);
      g.iconURL = () => {
        throw new Error("icon boom");
      };
      inter = mkInteraction({ guild: g, userId: "wel4" });
      let threw = false;
      try {
        await verify.handleVerifyConfirm(
          mkStore({
            verifyEnabled: true,
            unverifiedRoleId: "r-unv",
            verifiedRoleId: "r-ver",
            verifyWelcomeEnabled: true,
          }),
          inter,
        );
      } catch {
        threw = true;
      }
      check(
        "confirm: dựng embed chào mừng lỗi → nuốt, không ném ra ngoài",
        !threw && calls.dms.length === 0,
      );
    }

    // Catch NGOÀI CÙNG: reply thành công ném → ghi log + thử reply lại báo lỗi
    {
      const m = mkMember("outer");
      const inter2 = mkInteraction({ guild: mkGuild("g1", m), userId: "outer" });
      // Lượt reply ĐẦU ném (mô phỏng tương tác hết hạn); lượt sau mới thành công.
      inter2.reply = async (payload) => {
        inter2._n = (inter2._n ?? 0) + 1;
        if (inter2._n === 1) throw new Error("tương tác hết hạn");
        inter2.replied = true;
        inter2._lastReply = payload;
        return payload;
      };
      let threw = false;
      try {
        await verify.handleVerifyConfirm(
          mkStore({ verifyEnabled: true, unverifiedRoleId: "r-unv", verifiedRoleId: "r-ver" }),
          inter2,
        );
      } catch {
        threw = true;
      }
      check(
        "confirm: reply ném → catch ngoài bắt, thử reply lỗi lại (không ném ra)",
        !threw && inter2._n === 2 && /Lỗi xác minh/.test(inter2._lastReply?.content || ""),
      );
    }

    // ── Alt gate ──
    // Không có altMaxRiskScore → mặc định 70 vẫn chặn rủi ro cao
    {
      calls.mutations.length = 0;
      ctl.analysis = { riskScore: 95, action: "ban", riskFactors: ["acc mới"] };
      ctl.punish = { executed: true, action: "ban" };
      const m = mkMember("alt1");
      inter = mkInteraction({ guild: mkGuild("g1", m), userId: "alt1" });
      await verify.handleVerifyConfirm(
        mkStore({
          verifyEnabled: true,
          unverifiedRoleId: "r-unv",
          verifiedRoleId: "r-ver",
          altDetectionEnabled: true,
          // KHÔNG đặt altMaxRiskScore → dùng ?? 70
        }),
        inter,
      );
      check(
        "confirm: alt rủi ro cao (không đặt ngưỡng) → chặn bằng mặc định 70",
        /Xác minh bị từ chối/.test(inter._replies[0].content) &&
          calls.mutations.some((x) => x.name === "altDetection:markJoinPunished"),
      );
    }

    // action "pass" → KHÔNG phạt, cho xác minh dù rủi ro cao
    {
      ctl.analysis = { riskScore: 95, action: "pass", riskFactors: [] };
      ctl.punish = { executed: true, action: "ban" };
      const m = mkMember("alt2");
      inter = mkInteraction({ guild: mkGuild("g1", m), userId: "alt2" });
      await verify.handleVerifyConfirm(
        mkStore({
          verifyEnabled: true,
          unverifiedRoleId: "r-unv",
          verifiedRoleId: "r-ver",
          altDetectionEnabled: true,
          altMaxRiskScore: 70,
        }),
        inter,
      );
      check(
        "confirm: alt action=pass → bỏ phạt, xác minh bình thường",
        /Đã xác minh thành công/.test(inter._replies[0].content) && m._added.includes("r-ver"),
      );
    }

    // Phạt thất bại → fail-open
    {
      ctl.analysis = { riskScore: 95, action: "ban", riskFactors: ["x"] };
      ctl.punish = { executed: false, reason: "thiếu quyền" };
      const m = mkMember("alt3");
      inter = mkInteraction({ guild: mkGuild("g1", m), userId: "alt3" });
      await verify.handleVerifyConfirm(
        mkStore({
          verifyEnabled: true,
          unverifiedRoleId: "r-unv",
          verifiedRoleId: "r-ver",
          altDetectionEnabled: true,
          altMaxRiskScore: 70,
        }),
        inter,
      );
      check(
        "confirm: phạt thất bại → fail-open cho xác minh",
        /Đã xác minh thành công/.test(inter._replies[0].content),
      );
    }

    // AI phân tích ném → fail-open
    {
      ctl.analysisThrows = true;
      const m = mkMember("alt4");
      inter = mkInteraction({ guild: mkGuild("g1", m), userId: "alt4" });
      await verify.handleVerifyConfirm(
        mkStore({
          verifyEnabled: true,
          unverifiedRoleId: "r-unv",
          verifiedRoleId: "r-ver",
          altDetectionEnabled: true,
        }),
        inter,
      );
      check(
        "confirm: AI phân tích lỗi → fail-open, vẫn xác minh",
        /Đã xác minh thành công/.test(inter._replies[0].content),
      );
      ctl.analysisThrows = false;
    }
  }

  console.log(`\nKết quả interactionVerify: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
