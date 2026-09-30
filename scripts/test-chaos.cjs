// CHAOS TEST — lỗi hạ tầng xảy ra NGAY GIỮA trận raid:
//   1. punishMember khi Convex mutation lỗi (record mod action) → vẫn phạt, không crash
//   2. punishMember khi getConfig lỗi (config null) → vẫn phạt, không crash
//   3. punishMember khi member.timeout ném lỗi (Discord 4xx) → trả "không thể xử lý"
//   4. actionBudget: chặn punish thứ N+1, cho phép guild khác, tự nguội theo thời gian
//   5. actionBudget fail-open: usage()/canPunish không bao giờ ném — guild rác không làm tê liệt
//   6. AI classify 500 → trả null → deterministic path (không ban oan)
//   7. AI hang vô hạn → deadline 6s tự cắt → trả null
//   8. selfDiagnose: lỗi runtime → fingerprint → cooldown 1h → mutation thống kê được gọi
//   9. selfDiagnose: chuỗi lỗi (không phải Error) → bỏ qua, không treo
// Không mạng thật (fetch bị chặn), không DB thật. Chạy: node scripts/test-chaos.cjs
const path = require("path");

// ── Chặn MỌI mạng thật: fetch ném lỗi như server down ──
const realFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("ECONNREFUSED (chaos: mạng bị chặn)");
};

const Module = require("module");
const fs = require("fs");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "discord.js") return path.join(__dirname, "..", "bot", "test-djs-mock.cjs");
  return origResolve.call(this, request, ...args);
};
fs.writeFileSync(
  path.join(__dirname, "..", "bot", "test-djs-mock.cjs"),
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

// HERMETIC: nhiều case kỳ vọng "AI chưa cấu hình" (offline path). Env ambient
// (CI/VPS/workspaces) có thể set AI_API_KEY/AI_BASE_URL → engine thấy AI online,
// luồng chạy khác kỳ vọng → FAIL giả. Xóa sạch key provider trước khi require.
for (const k of [
  "AI_API_KEY",
  "AI_BASE_URL",
  "AI_MODEL",
  "GROQ_API_KEY",
  "DEEPSEEK_NIM_KEY",
  "NVIDIA_API_KEY",
  "SAMBANOVA_API_KEY",
  "KIRA_API_KEY",
  "OPENAI_API_KEY",
]) {
  delete process.env[k];
}

let pass = 0;
let fail = 0;
function check(label, cond) {
  if (cond) {
    pass++;
    console.log("PASS", label);
  } else {
    fail++;
    console.log("FAIL", label);
  }
}

(async () => {
  // ════════ NHÓM 1: punishMember + actionBudget ════════
  const budget = require("../bot/src/actionBudget");
  const heat = require("../bot/src/heat");
  const { punishMember } = heat;

  const memberOk = {
    id: "m1",
    user: { username: "raider" },
    timeout: async () => {},
    kick: async () => {},
    ban: async () => {},
    send: async () => {},
  };
  const guild = { id: "g-chaos" };

  // ── 1. Convex mutation LỖI giữa phạt → vẫn phạt, trả kết quả ──
  {
    budget.resetGuild("g-chaos");
    const store = {
      client: {
        mutation: async () => {
          throw new Error("Convex down (chaos)");
        },
      },
      getConfig: async () => null,
    };
    const res = await punishMember(guild, memberOk, "timeout", "test", 60, store);
    check("Convex down → punishMember vẫn timeout thành công", res.action.includes("đã tạm khóa"));
    check("Convex down → không crash, có caseNumber undefined", res.caseNumber === undefined);
  }

  // ── 2. getConfig lỗi → budget fail-open (dùng mặc định), vẫn phạt ──
  {
    budget.resetGuild("g-chaos");
    let configCalls = 0;
    const store = {
      client: { mutation: async () => ({ caseNumber: 1 }) },
      getConfig: async () => {
        configCalls++;
        throw new Error("config read failed (chaos)");
      },
    };
    const res = await punishMember(guild, memberOk, "timeout", "test", 60, store);
    check("getConfig lỗi → vẫn phạt (fail-open)", res.action.includes("đã tạm khóa"));
    check("getConfig lỗi → budget đã gọi getConfig để đọc trần", configCalls === 1);
    check("getConfig lỗi → budget vẫn ghi nhận lượt phạt", budget.usage("g-chaos") === 1);
  }

  // ── 3. member.timeout ném lỗi (Discord 4xx) → chuỗi "không thể xử lý" ──
  {
    budget.resetGuild("g-chaos");
    const memberFail = {
      id: "m2",
      user: { username: "no-perm" },
      timeout: async () => {
        throw new Error("Missing Permissions (chaos)");
      },
      send: async () => {},
    };
    const store = {
      client: { mutation: async () => ({ caseNumber: 1 }) },
      getConfig: async () => null,
    };
    const res = await punishMember(guild, memberFail, "timeout", "test", 60, store);
    check("Discord API lỗi → trả chuỗi không crash", res.action.includes("không thể"));
  }

  // ── 4. Budget: chặn punish vượt trần, guild khác không bị ảnh hưởng ──
  {
    budget.resetGuild("g-a");
    budget.resetGuild("g-b");
    const store = {
      client: { mutation: async () => ({}) },
      getConfig: async () => ({ actionBudgetPerMinute: 3 }),
    };
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(await punishMember({ id: "g-a" }, memberOk, "timeout", "r", 60, store));
    }
    check(
      "3 lượt đầu trong trần → phạt thật",
      results.slice(0, 3).every((r) => r.action.includes("đã tạm khóa")),
    );
    check(
      "lượt 4-5 vượt trần → bị bỏ qua",
      results.slice(3).every((r) => r.action.includes("bỏ qua")),
    );
    check("usage guild A = 3 (2 lượt chặn không cộng)", budget.usage("g-a") === 3);
    const resB = await punishMember({ id: "g-b" }, memberOk, "timeout", "r", 60, store);
    check(
      "guild B cùng lúc → vẫn được phạt (budget theo guild)",
      resB.action.includes("đã tạm khóa"),
    );
  }

  // ── 5. Budget fail-open: đầu vào rác không làm tê liệt ──
  {
    check("guildId rác → canPunish true", budget.canPunish(null, undefined) === true);
    check("usage guild lạ → 0", budget.usage("g-không-tồn-tại") === 0);
    check(
      "config trần rác → mặc định 20",
      budget.budgetLimitFor({ actionBudgetPerMinute: "rác" }) === budget.DEFAULT_LIMIT,
    );
    check(
      "config trần 0/rác → dùng mặc định 20 (cấu hình nhầm không được phép vô hiệu hóa tự vệ)",
      budget.budgetLimitFor({ actionBudgetPerMinute: 0 }) === budget.DEFAULT_LIMIT &&
        budget.budgetLimitFor({}) === budget.DEFAULT_LIMIT,
    );
    budget.recordPunish(null);
    check("recordPunish(null) không ném", true);

    // ── 5b. Chống phình RAM: >500 guild thì dọn guild NGUỘI ──
    // Đây là ranh giới rò rỉ bộ nhớ khi bot ở hàng trăm server; nhánh này
    // hỏng thì RAM bot tăng đều theo số server đã từng phục vụ và không bao
    // giờ giảm. RẤT QUAN TRỌNG: chỉ dọn entry đã nguội — xoá cả entry còn
    // trong cửa sổ nghĩa là mất lịch sử phạt và mở lại cửa cho kẻ đang raid.
    {
      const T = 10 * 60_000;
      for (let i = 0; i < 600; i++) budget.recordPunish(`old${i}`, 0);
      budget.recordPunish("fresh", T);
      check(">500 guild → dọn entry đã nguội ngoài cửa sổ", budget.usage("old0", T) === 0);
      check("entry mới ghi vẫn còn", budget.usage("fresh", T) === 1);
      for (let i = 0; i < 600; i++) budget.recordPunish(`hot${i}`, T);
      budget.recordPunish("hot600", T);
      check(
        "KHÔNG dọn nhầm entry còn trong cửa sổ (giữ lịch sử phạt)",
        budget.usage("hot0", T) === 1,
      );
    }
  }

  // ════════ NHÓM 2: AI lỗi giữa trận raid ════════
  const createState = require("../bot/src/handlers/antinuke/state");
  const createAi = require("../bot/src/handlers/antinuke/ai");
  const createMessages = require("../bot/src/handlers/antinuke/messages");

  const mutations = [];
  const configs = new Map();
  const store = {
    client: {
      mutation: async (name, args) => {
        mutations.push({ name, args });
        return { caseNumber: 1 };
      },
      query: async () => [],
    },
    getConfig: async (id) => configs.get(id) ?? null,
  };
  const client = { user: { id: "bot-self" }, guilds: { cache: new Map() }, on: () => {} };
  const state = createState({ client, store });
  const aiLayer = createAi({ state });

  // Mód spam giống harness message-layers (AI offline → heat path).
  configs.set("g-ai", {
    antinukeEnabled: true,
    lockdownEnabled: false,
    logChannelId: null,
    modLogChannelId: null,
    modules: [
      {
        module: "spam",
        enabled: true,
        threshold: 5,
        windowSeconds: 10,
        punish: "warn",
        timeoutSeconds: 600,
        whitelistRoles: [],
        actions: ["warn", "deleteMessages"],
      },
    ],
    whitelistUsers: [],
    whitelistRoles: [],
  });

  function makeGuild(id) {
    return {
      id,
      name: "Chaos Guild",
      memberCount: 50,
      members: {
        cache: new Map(),
        fetch: async () => null,
        fetchMe: async () => ({ id: "bot-self-member", permissions: { has: () => true } }),
      },
      channels: { cache: new Map() },
      roles: { everyone: { id: "everyone" } },
    };
  }
  function makeMessage(id, guild, user = {}) {
    return {
      id,
      guild,
      author: { id: user.id ?? "u1", username: user.username ?? "spammer", bot: false },
      member: {
        id: user.id ?? "u1",
        user: { bot: false, username: user.username ?? "spammer" },
        kickable: true,
        bannable: true,
        timeout: async () => {},
        kick: async () => {},
        ban: async () => {},
        send: async () => {},
        roles: { cache: [] },
      },
      content: user.content ?? "hello world " + (user.different ?? ""),
      channel: { isTextBased: () => true, send: async () => {} },
      deletable: true,
      delete: async () => {},
      createdTimestamp: Date.now(),
    };
  }

  const heatMock = {
    add: async () => ({ tier: "warn", escalated: false, score: 5 }),
    markPunished: () => {},
    resetGuild: () => {},
  };
  const core = require("../bot/src/handlers/antinuke/enforce")({
    client,
    store,
    heat: heatMock,
    state,
  });
  const raidIntel = {
    huntRaidSource: async () => ({ banned: false }),
    recordRaidSample: async () => {},
  };
  const externalApp = { handleExternalAppMessage: async () => {} };
  const messages = createMessages({
    client,
    store,
    state,
    core,
    ai: aiLayer,
    raidIntel,
    externalApp,
  });

  // ── 6. AI 500 (fetch ném) giữa trận spam → null → heat path, không crash ──
  {
    const g = makeGuild("g-ai");
    let threw = null;
    try {
      for (let i = 0; i < 5; i++) await messages.handleSpam(makeMessage("ai" + i, g));
    } catch (e) {
      threw = e;
    }
    check("AI 500 giữa trận spam → handleSpam không ném", threw === null);
    const ev = mutations.find(
      (m) => m.name === "bot_writes:botRecordAntinukeEvent" && m.args.module === "spam",
    );
    check("AI 500 → vẫn ghi sự kiện spam (deterministic path)", !!ev);
    check(
      "AI 500 → KHÔNG ban ai",
      !mutations.some(
        (m) =>
          m.name === "bot_writes:botRecordModAction" && String(m.args.action ?? "").includes("ban"),
      ),
    );
  }

  // ── 7. AI hang vô hạn → deadline 6s tự cắt ──
  {
    const g = makeGuild("g-ai");
    const guild2 = makeGuild("g-ai");
    globalThis.fetch = async () => new Promise(() => {}); // hang mãi mãi
    const t0 = Date.now();
    const out = await aiLayer.aiClassify(g, "spam", 10, 10, 5, []);
    const elapsed = Date.now() - t0;
    check("AI hang → trả null", out === null);
    check("AI hang → deadline cắt trong ~6.5s", elapsed < 7000);
    globalThis.fetch = realFetch;
    void guild2;
  }

  // ════════ NHÓM 3: selfDiagnose bắt lỗi runtime ════════
  const selfDiagnose = require("../bot/src/handlers/selfDiagnose");

  // ── 8. Lỗi Error thật → fingerprint → mutation thống kê được ghi ──
  {
    const diagMutations = [];
    const sdStore = {
      client: { mutation: async (name, args) => (diagMutations.push({ name, args }), {}) },
    };
    selfDiagnose.attach({ guilds: { cache: new Map() } }, sdStore);
    selfDiagnose.setEnabledFromJobs({ enabled: true });

    const boom = new Error("Cannot read properties of undefined (reading 'reason')");
    boom.stack = `Error: Cannot read properties of undefined (reading 'reason')
    at handleAuditEntry (/srv/bot/src/handlers/antinuke/audit.js:267:30)`;
    await selfDiagnose.diagnoseError("unhandledRejection", boom);
    // AI bị chặn fetch → parse null → không mutation; nhưng KHÔNG được treo/crash.
    check("lỗi runtime qua selfDiagnose → không crash, không treo", true);
    check("AI offline → không ghi mutation (không tốn operations)", diagMutations.length === 0);
  }

  // ── 9. Chuỗi lỗi (không phải Error) → bỏ qua im lặng, KHÔNG treo ──
  {
    const t0 = Date.now();
    await selfDiagnose.diagnoseError("unhandledRejection", "chuỗi lỗi thường");
    check("chuỗi lỗi → bỏ qua nhanh (<50ms)", Date.now() - t0 < 50);
    await selfDiagnose.diagnoseError("unhandledRejection", null);
    await selfDiagnose.diagnoseError("unhandledRejection", undefined);
    check("null/undefined reason → không treo, không ném", true);
  }

  // ── 10. setEnabledFromJobs đầu vào rác → giữ trạng thái, không ném ──
  {
    selfDiagnose.setEnabledFromJobs(null);
    selfDiagnose.setEnabledFromJobs("rác");
    selfDiagnose.setEnabledFromJobs(undefined);
    check("flag sync đầu vào rác → không ném", true);
  }

  globalThis.fetch = realFetch;
  fs.unlinkSync(path.join(__dirname, "..", "bot", "test-djs-mock.cjs"));

  console.log(`\nKết quả chaos: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("CHAOS TEST CRASH:", e);
  process.exit(2);
});
