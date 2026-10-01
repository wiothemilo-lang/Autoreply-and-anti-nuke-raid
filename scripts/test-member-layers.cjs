// Test lớp thành viên (antinuke/members.js) — chỗ dễ ban oan nhất:
//   handleSuspiciousBotJoin — CHỈ cảnh báo bot lạ (không phạt), exempt + dedupe
//   handleHitAndRunLeave — bot tự rời ngay sau khi được thêm (bot nuke kinh điển);
//                          bỏ qua đúng: bot tin cậy, bot logging, bị kick (có audit)
//   handleRaidJoin — gate chống ban nhầm: hồ sơ bình thường → không phạt không khóa;
//                    cụm acc mới đáng ngờ → chỉ phạt acc ĐÁNG NGỜ, người thật bỏ qua
// Không mạng, không DB thật. Chạy: node scripts/test-member-layers.cjs
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
module.exports = {
  Colors: new Proxy({}, { get: () => 0x000000 }),
  EmbedBuilder,
  PermissionFlagsBits: { ManageGuild: 1n << 5n, Administrator: 1n << 3n, ManageRoles: 1n << 28n, ManageWebhooks: 1n << 29n, BanMembers: 1n << 2n },
  UserFlags: { VerifiedBot: 1n << 16n },
  AuditLogEvent: new Proxy({}, { get: (t, k) => (t[k] ??= Symbol(k)) }),
};
`,
);

(async () => {
  const calls = {
    events: [],
    raidSamples: [],
    memberBans: [],
    memberKicks: [],
    memberTimeouts: [],
    memberDms: [],
    mutations: [],
    purgeCalls: [],
    bulkDeleted: [],
  };

  function baseConfig(overrides = {}) {
    return {
      antinukeEnabled: true,
      lockdownEnabled: false,
      logChannelId: null,
      modLogChannelId: null,
      modules: [
        {
          module: "suspiciousBotAlert",
          enabled: true,
          threshold: 1,
          windowSeconds: 10,
          punish: "warn",
          timeoutSeconds: 600,
          whitelistRoles: [],
        },
        {
          module: "botHitAndRun",
          enabled: true,
          threshold: 1,
          windowSeconds: 10,
          punish: "ban",
          timeoutSeconds: 600,
          whitelistRoles: [],
        },
        {
          module: "massJoin",
          enabled: true,
          threshold: 5,
          windowSeconds: 10,
          punish: "kick",
          timeoutSeconds: 600,
          whitelistRoles: [],
        },
      ],
      whitelistUsers: [],
      whitelistRoles: [],
      adminRoles: [],
      modRoles: [],
      ...overrides,
    };
  }

  const configs = new Map();
  const store = {
    client: {
      mutation: async (name, args) => {
        calls.mutations.push({ name, args });
        if (name === "bot_writes:botRecordAntinukeEvent") {
          calls.events.push(args);
          return { caseNumber: 1 };
        }
        return {};
      },
    },
    getConfig: async (guildId) => configs.get(guildId) ?? null,
  };

  const heat = {
    add: async () => ({ tier: "warn", escalated: false, score: 10 }),
    markPunished: () => {},
    resetGuild: () => {},
  };

  // member acc MỚI đáng ngờ: acc < 7 ngày, không avatar, tên máy móc (user123456)
  function makeMember(id, { bot = false, fresh = true, avatar = null, username, joinedTs } = {}) {
    return {
      id,
      guild: null,
      user: {
        id,
        bot,
        username: username ?? (fresh ? "u" + id.slice(-6) : "nguoi-that-" + id.slice(-3)),
        tag: (username ?? id) + "#0001",
        createdTimestamp: fresh ? Date.now() - 2 * 86_400_000 : Date.now() - 400 * 86_400_000,
        avatar,
        flags: { has: () => false },
      },
      permissions: { has: () => false },
      roles: { cache: new Set() },
      joinedTimestamp: joinedTs ?? Date.now(),
      timeout: async () => calls.memberTimeouts.push(id),
      ban: async () => calls.memberBans.push(id),
      kick: async () => calls.memberKicks.push(id),
      send: async () => calls.memberDms.push(id),
    };
  }

  // Kênh văn bản giả — hỗ trợ purge tin của thủ phạm (cleanupMessages gọi
  // channel.messages.fetch + bulkDelete khi module bật purgeMessages).
  function makeTextChannel(id, messages = []) {
    const col = new Map(messages.map((m) => [m.id, m]));
    col.filter = (fn) => {
      const out = [...col.values()].filter(fn);
      out.first = (n) => (typeof n === "number" ? out.slice(0, n) : out[0]);
      out.sort = Array.prototype.sort.bind(out);
      return out;
    };
    return {
      id,
      type: 0,
      isTextBased: () => true,
      isDMBased: () => false,
      isThread: () => false,
      isVoiceBased: () => false,
      viewable: true,
      permissionOverwrites: { edit: async () => {} },
      messages: {
        cache: col,
        fetch: async () => col,
        filter: col.filter,
      },
      bulkDelete: async (targets) => {
        calls.bulkDeleted.push({ channelId: id, count: targets.length });
        return { size: targets.length };
      },
    };
  }

  function makeGuild(id, membersList = [], channels = [makeTextChannel("ch-1")]) {
    const membersMap = new Map(membersList.map((m) => [m.id, m]));
    const chanMap = new Map(channels.map((c) => [c.id, c]));
    chanMap.filter = (fn) => {
      const out = [...chanMap.values()].filter(fn);
      out.first = (n) => (typeof n === "number" ? out.slice(0, n) : out[0]);
      out.sort = Array.prototype.sort.bind(out);
      return out;
    };
    const guild = {
      id,
      available: true,
      ownerId: "owner-1",
      name: "G-" + id,
      roles: { cache: new Map(), everyone: { id } },
      members: {
        cache: membersMap,
        fetch: async (mid) => membersMap.get(mid) ?? null,
      },
      channels: { cache: chanMap },
      fetchAuditLogs: async () => ({ entries: { first: () => null, find: () => undefined } }),
    };
    for (const m of membersList) m.guild = guild;
    return guild;
  }

  const createState = require("../bot/src/handlers/antinuke/state");
  const createAi = require("../bot/src/handlers/antinuke/ai");
  const createEnforce = require("../bot/src/handlers/antinuke/enforce");
  const createMembers = require("../bot/src/handlers/antinuke/members");

  let client = { user: { id: "bot-self" }, guilds: { cache: new Map() }, on: () => {} };
  const state = createState({ client, store });
  const realAi = createAi({ state });
  const ai = {
    aiClassify: realAi.aiClassify,
    clusterStats: (profiles) => {
      // Dùng hàm thật từ shared để gate chống ban nhầm chạy đúng logic
      const { joinClusterSuspicion } = require("../bot/src/handlers/antinuke/shared");
      return joinClusterSuspicion(profiles);
    },
  };
  const raidIntel = {
    // Kết quả săn nguồn cơn do kịch bản điều khiển (mặc định: không tìm thấy).
    huntRaidSource: async () => huntResult,
    recordRaidSample: async (guild, config, sample) => calls.raidSamples.push(sample),
  };
  let huntResult = { banned: false };
  const core = createEnforce({ client, store, heat, state });
  const members = createMembers({ store, state, core, ai, raidIntel });

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
  const clear = () => {
    for (const k of Object.keys(calls)) calls[k].length = 0;
    huntResult = { banned: false };
  };

  // ── 1. Bot lạ được thêm → CHỈ cảnh báo, KHÔNG phạt ──
  {
    clear();
    const gid = "g-alert";
    const strangeBot = makeMember("strange-bot", { bot: true, fresh: true });
    const guild = makeGuild(gid, [strangeBot]);
    configs.set(gid, baseConfig());
    client.guilds.cache.set(gid, guild);
    await members.handleSuspiciousBotJoin(strangeBot);
    check(
      "bot lạ → cảnh báo + ghi sự kiện, KHÔNG phạt",
      calls.events.some((e) => e.module === "suspiciousBotAlert") &&
        calls.memberBans.length === 0 &&
        calls.memberKicks.length === 0 &&
        calls.memberTimeouts.length === 0,
    );
    // Dedupe: bot vào/ra liên tục trong 10 phút chỉ cảnh báo 1 lần
    await members.handleSuspiciousBotJoin(strangeBot);
    check(
      "cùng bot cảnh báo lại trong 10 phút → không lặp",
      calls.events.filter((e) => e.module === "suspiciousBotAlert").length === 1,
    );
  }

  // ── 2. Bot có tick VerifiedBot → không cảnh báo ──
  {
    clear();
    const gid = "g-verified";
    const verifiedBot = makeMember("verified-bot", { bot: true });
    verifiedBot.user.flags = { has: (f) => String(f) === String(1n << 16n) };
    const guild = makeGuild(gid, [verifiedBot]);
    configs.set(gid, baseConfig());
    client.guilds.cache.set(gid, guild);
    await members.handleSuspiciousBotJoin(verifiedBot);
    check("bot verified (tick Discord) → không cảnh báo", calls.events.length === 0);
  }

  // ── 3. Hit-and-run: bot vào rồi TỰ RỜI trong cửa sổ → xử lý ──
  {
    clear();
    const gid = "g-har";
    const nukeBot = makeMember("har-bot", { bot: true });
    const guild = makeGuild(gid, [nukeBot]);
    configs.set(gid, baseConfig());
    client.guilds.cache.set(gid, guild);
    // Giả lập bot được thêm 30s trước (state botAddTimes do orchestrator index.js ghi)
    state.state.botAddTimes.set(gid + ":har-bot", Date.now() - 30_000);
    await members.handleHitAndRunLeave(nukeBot, null); // null = TỰ RỜI (không có audit kick)
    check(
      "bot tự rời < 10 phút sau khi thêm → xử lý hit-and-run",
      calls.events.some((e) => e.module === "botHitAndRun"),
    );
    // Một lần rời là hết — entry cũ bị xóa, gọi lại không xử lý nữa
    await members.handleHitAndRunLeave(nukeBot, null);
    check(
      "entry cũ bị xóa → không xử lý lặp",
      calls.events.filter((e) => e.module === "botHitAndRun").length === 1,
    );
  }

  // ── 4. Hit-and-run bỏ qua đúng: bot tin cậy / bot logging / bị kick / rời muộn ──
  {
    // 4a. Bot tin cậy (đã ở lại 8 ngày)
    clear();
    const gid = "g-har-trusted";
    const trustedBot = makeMember("trusted-bot", {
      bot: true,
      joinedTs: Date.now() - 8 * 86_400_000,
    });
    const guild = makeGuild(gid, [trustedBot]);
    configs.set(gid, baseConfig());
    client.guilds.cache.set(gid, guild);
    state.state.botAddTimes.set(gid + ":trusted-bot", Date.now() - 30_000);
    await members.handleHitAndRunLeave(trustedBot, null);
    check("bot tin cậy rời (mod gỡ cấu hình) → không xử lý", calls.events.length === 0);

    // 4b. Bị kick (có executor) → mod kick, không phải tự rời
    clear();
    state.state.botAddTimes.set(gid + ":trusted-bot", Date.now() - 30_000);
    await members.handleHitAndRunLeave(trustedBot, { id: "mod-1" });
    check("bot bị kick bởi mod → không kết luận hit-and-run", calls.events.length === 0);

    // 4c. Bot logging (Carl-bot) tự gỡ
    clear();
    const carl = makeMember("carl-x", { bot: true, username: "Carl-bot" });
    state.state.botAddTimes.set(gid + ":carl-x", Date.now() - 30_000);
    await members.handleHitAndRunLeave(carl, null);
    check("bot logging tự rời (gỡ cấu hình bình thường) → không xử lý", calls.events.length === 0);

    // 4d. Rời SAU cửa sổ 10 phút → không kết luận
    clear();
    state.state.botAddTimes.set(gid + ":old-leave", Date.now() - 30 * 60_000);
    const lateBot = makeMember("old-leave", { bot: true });
    await members.handleHitAndRunLeave(lateBot, null);
    check("bot rời sau 30 phút → không phải hit-and-run", calls.events.length === 0);

    // 4f. Bot HỢP PHÁP do mod/owner thêm rồi tự rời → KHÔNG phạt oan.
    // Bug thật 29/09/2026: hit-and-run chạy lúc bot ĐÃ RỜI, roles.cache rỗng
    // ⇒ isExempt() luôn false ⇒ ban oan chính bot mà mod vừa chủ động thêm.
    clear();
    const gidModBot = "g-har-modbot";
    const modBot = makeMember("mod-bot", { bot: true });
    modBot.roles = { cache: new Set(["role-admin"]) };
    const guildModBot = makeGuild(gidModBot, [modBot]);
    configs.set(gidModBot, baseConfig({ adminRoles: ["role-admin"] }));
    client.guilds.cache.set(gidModBot, guildModBot);
    // Orchestrator ghi lúc bot JOIN (còn đầy đủ role).
    await members.markBotExemptOnJoin(modBot);
    state.state.botAddTimes.set(gidModBot + ":mod-bot", Date.now() - 30_000);
    // Bot rời khỏi server: role/quyền biến mất (đúng thực tế Discord).
    modBot.roles = { cache: new Set() };
    modBot.permissions = { has: () => false };
    await members.handleHitAndRunLeave(modBot, null);
    check(
      "bot do mod thêm, tự rời nhanh → KHÔNG bị ban oan",
      calls.events.length === 0 && calls.memberBans.length === 0,
    );

    // 4g. Ngược lại: bot lạ (không role quyền) tự rời → vẫn phải bị xử lý.
    clear();
    const gidStranger = "g-har-stranger";
    const strangerBot = makeMember("stranger-bot", { bot: true });
    const guildStranger = makeGuild(gidStranger, [strangerBot]);
    configs.set(gidStranger, baseConfig({ adminRoles: ["role-admin"] }));
    client.guilds.cache.set(gidStranger, guildStranger);
    await members.markBotExemptOnJoin(strangerBot);
    state.state.botAddTimes.set(gidStranger + ":stranger-bot", Date.now() - 30_000);
    await members.handleHitAndRunLeave(strangerBot, null);
    check(
      "bot lạ (không role quyền) tự rời nhanh → vẫn bị xử lý",
      calls.events.some((e) => e.module === "botHitAndRun"),
    );

    // 4e. Người thật rời → không liên quan
    clear();
    const human = makeMember("human-1", { bot: false });
    await members.handleHitAndRunLeave(human, null);
    check("người thật rời → không xử lý", calls.events.length === 0);
  }

  // ── 5. massJoin: làn sóng hồ sơ BÌNH THƯỜNG (tăng trưởng tự nhiên) → KHÔNG phạt ──
  {
    clear();
    const gid = "g-natural";
    const humans = [];
    for (let i = 0; i < 5; i++) {
      humans.push(makeMember("real-" + i, { fresh: false, avatar: "av" + i }));
    }
    const guild = makeGuild(gid, humans);
    configs.set(gid, baseConfig());
    client.guilds.cache.set(gid, guild);
    for (const h of humans) await members.handleRaidJoin(h);
    const ev = calls.events.find((e) => e.module === "massJoin");
    check(
      "5 người thật (acc cũ + avatar) vào cùng lúc → chỉ ghi nhận, không phạt ai",
      !!ev &&
        String(ev.action).includes("bỏ qua") &&
        calls.memberKicks.length === 0 &&
        calls.memberBans.length === 0,
    );
    check(
      "không khóa kênh oan",
      !calls.mutations.some(
        (m) =>
          m.name === "bot_writes:botLockState" &&
          m.args.until !== null &&
          m.args.until !== undefined,
      ),
    );
    check(
      "1 làn sóng = 1 sự kiện (không log trùng)",
      calls.events.filter((e) => e.module === "massJoin").length === 1,
    );
  }

  // ── 6. massJoin: làn sóng acc mới đáng ngờ → chỉ phạt acc ĐÁNG NGỜ, người thật đi kèm được bỏ qua ──
  // CHỐNG LOG TRÙNG: 1 làn sóng chỉ xử lý + ghi nhận 1 lần (join đầu chạm ngưỡng);
  // các join nối tiếp trong cùng đợt không bắn thêm sự kiện/phạt lặp.
  {
    clear();
    const gid = "g-raid";
    const bots = [];
    for (let i = 0; i < 6; i++) {
      // acc mới + không avatar + tên máy móc → suspicion 4 (>= 4: đủ 2 tín hiệu độc lập)
      bots.push(makeMember("alt" + String(100000 + i), { fresh: true, avatar: null }));
    }
    const realFriend = makeMember("guest-9", { fresh: false, avatar: "av" }); // hồ sơ bình thường lẫn trong sóng
    // Người thật lẫn trong 5 join ĐẦU (đợt xử lý duy nhất) để kiểm gate bỏ qua.
    const order = [...bots.slice(0, 4), realFriend, ...bots.slice(4)];
    const guild = makeGuild(gid, [...bots, realFriend]);
    configs.set(gid, baseConfig());
    client.guilds.cache.set(gid, guild);
    for (const m of order) await members.handleRaidJoin(m);
    const massEvs = calls.events.filter((e) => e.module === "massJoin");
    const ev = massEvs.at(-1);
    const punished = new Set([...calls.memberKicks, ...calls.memberBans, ...calls.memberTimeouts]);
    check(
      "cụm acc mới đáng ngờ → bị xử lý",
      calls.events.some((e) => e.module === "massJoin") && punished.size >= 3,
    );
    check(
      "người thật lẫn trong sóng được bỏ qua (không bị kick oan)",
      !punished.has("guest-9") && String(ev?.action ?? "").includes("bỏ qua"),
    );
    check("1 làn sóng = đúng 1 sự kiện (join nối tiếp không bắn thêm)", massEvs.length === 1);
    check("mỗi acc chỉ bị phạt 1 lần (không phạt lặp)", calls.memberKicks.length === punished.size);
    check(
      "ghi mẫu raid sample cho threat intel",
      calls.raidSamples.some((s) => s.module === "massJoin"),
    );
  }

  // ── 6b. massJoin: acc mới nhưng CHỈ 1 tín hiệu yếu (điểm 3) → không phạt cá nhân ──
  {
    clear();
    const gid = "g-weak";
    // acc mới (<7 ngày) + default avatar + tên người → điểm 3: nghi nhưng chưa
    // đủ 2 tín hiệu độc lập để kick. Gate cá nhân đã nâng lên >= 4.
    const weak = [];
    for (let i = 0; i < 5; i++) {
      weak.push(
        makeMember("newbie-" + i, { fresh: true, avatar: null, username: "nguoi-that-" + i }),
      );
    }
    const guild = makeGuild(gid, weak);
    configs.set(gid, baseConfig());
    client.guilds.cache.set(gid, guild);
    for (const m of weak) await members.handleRaidJoin(m);
    const punished = new Set([...calls.memberKicks, ...calls.memberBans, ...calls.memberTimeouts]);
    check("acc điểm 3 (1 tín hiệu) trong sóng → không ai bị phạt", punished.size === 0);
  }

  // ── 6c. massJoin: AI phủ quyết cụm nghi vấn → hạ cấp theo dõi, không phạt ──
  {
    clear();
    const gid = "g-ai-veto";
    const bots = [];
    for (let i = 0; i < 5; i++) {
      bots.push(makeMember("veto" + String(200000 + i), { fresh: true, avatar: null }));
    }
    const guild = makeGuild(gid, bots);
    configs.set(gid, baseConfig());
    client.guilds.cache.set(gid, guild);
    const aiVeto = {
      ...ai,
      aiAnalyzeRaid: async () => ({
        coordinated: false,
        confidence: 0.9,
        reasoning: "giống đợt mời bạn bè",
      }),
    };
    const membersVeto = createMembers({ store, state, core, ai: aiVeto, raidIntel });
    for (const m of bots) await membersVeto.handleRaidJoin(m);
    const punished = new Set([...calls.memberKicks, ...calls.memberBans, ...calls.memberTimeouts]);
    check("AI veto (không phối hợp, tin cậy cao) → không phạt ai", punished.size === 0);
    check(
      "AI veto → vẫn ghi nhận sự kiện",
      calls.events.some((e) => e.module === "massJoin"),
    );
  }

  // ── 7. massJoin dưới ngưỡng → hoàn toàn im lặng ──
  {
    clear();
    const gid = "g-quiet";
    const few = [makeMember("solo-1", { fresh: true }), makeMember("solo-2", { fresh: true })];
    const guild = makeGuild(gid, few);
    configs.set(gid, baseConfig());
    client.guilds.cache.set(gid, guild);
    for (const m of few) await members.handleRaidJoin(m);
    check(
      "2 người vào (dưới ngưỡng 5) → không ghi sự kiện",
      !calls.events.some((e) => e.module === "massJoin"),
    );
  }

  // ── 8. massJoin bật purgeMessages → dọn tin thủ phạm trên toàn server ──
  // Nhánh này chưa từng chạy: moduleActions.cleanupMessages quét
  // guild.channels.cache.filter(...).first(8) nên mock cũ (filter trả [])
  // không đủ đi vào. Không có test thì "dọn tin spam của kẻ raid" chỉ tồn tại
  // trên giấy — đây là bước giảm thiểu thiệt hại ngay sau khi ban.
  {
    clear();
    const gid = "g-purge";
    const bots = [];
    for (let i = 0; i < 5; i++) {
      bots.push(makeMember("purge" + String(700000 + i), { fresh: true, avatar: null }));
    }
    const msgs = bots.map((b) => ({
      id: "msg-" + b.id,
      author: { id: b.id },
      deletable: true,
      delete: async () => {
        calls.purgeCalls.push(b.id);
      },
    }));
    msgs.push({
      id: "msg-ngoai",
      author: { id: "nguoi-tot" },
      deletable: true,
      delete: async () => {
        calls.purgeCalls.push("nguoi-tot");
      },
    });
    const chan = makeTextChannel("ch-purge", msgs);
    const guild = makeGuild(gid, bots, [chan]);
    const cfg = baseConfig();
    cfg.modules = cfg.modules.map((m) =>
      m.module === "massJoin" ? { ...m, actions: ["kick", "purgeMessages"] } : m,
    );
    configs.set(gid, cfg);
    client.guilds.cache.set(gid, guild);
    for (const b of bots) await members.handleRaidJoin(b);
    check(
      `massJoin purgeMessages: xoá tin của acc raid, có trần 3 tài khoản/lượt (thực tế ${calls.purgeCalls.filter((x) => x !== "nguoi-tot").length})`,
      calls.purgeCalls.filter((x) => x !== "nguoi-tot").length === 3,
    );
    check(
      "massJoin purgeMessages: KHÔNG xoá tin của người khác",
      !calls.purgeCalls.includes("nguoi-tot"),
    );
    const ev = calls.events.find((e) => e.module === "massJoin");
    check(
      `massJoin purgeMessages: sự kiện ghi số tài khoản đã purge (${String(ev?.action ?? "").slice(0, 110)})`,
      String(ev?.action ?? "").includes("purge"),
    );
  }

  // ── 9. Raid Intel: ban được nguồn cơn → phải ghi sự kiện riêng + embed ──
  {
    clear();
    huntResult = {
      banned: true,
      suspectedSourceId: "chu-mua-01",
      suspectedSourceName: "acc-chu",
      reason: "điểm 7 (avatar trùng nhau)",
    };
    const gid = "g-hunt";
    const bots = [];
    for (let i = 0; i < 5; i++) {
      bots.push(makeMember("hunt" + String(800000 + i), { fresh: true, avatar: null }));
    }
    const guild = makeGuild(gid, bots);
    configs.set(gid, baseConfig({ logChannelId: "log-1" }));
    client.guilds.cache.set(gid, guild);
    for (const b of bots) await members.handleRaidJoin(b);
    const intel = calls.events.find((e) => e.module === "raidIntel");
    check("raid intel: ghi sự kiện module=raidIntel khi đã ban nguồn cơn", !!intel);
    check(
      `raid intel: sự kiện trỏ đúng thủ phạm nghi ngờ (${intel?.executorId})`,
      intel?.executorId === "chu-mua-01" && intel?.punish === "ban",
    );
    check(
      "raid intel: sự kiện nói rõ lý do ban",
      String(intel?.action ?? "").includes("avatar trùng nhau"),
    );
    check(
      "raid intel: mẫu huấn luyện lưu kết quả săn nguồn",
      calls.raidSamples.some((s) => s.sourceHunt?.banned === true),
    );
  }

  // ── 10. AI leo thang "theo dõi" → "raid" (nhánh chưa từng chạy) ──
  {
    clear();
    const gid = "g-escalate";
    // Cụm "theo dõi": 2 acc tên máy + avatar mặc định (đủ 4đ cá nhân),
    // 4 acc có avatar + tên người (2đ) → KHÔNG đủ cứng để kết luận raid,
    // nhưng tỉ lệ đáng ngờ = 100% → verdict "watch".
    const wave = [];
    for (let i = 0; i < 2; i++) {
      wave.push(makeMember("escM" + String(910000 + i), { fresh: true, avatar: null }));
    }
    for (let i = 0; i < 4; i++) {
      wave.push(
        makeMember("escA" + String(920000 + i), {
          fresh: true,
          avatar: "av-" + i,
          username: "Nguyen Van " + i,
          joinedTs: Date.now() - i * 120_000,
        }),
      );
    }
    const guild = makeGuild(gid, wave);
    configs.set(gid, baseConfig());
    client.guilds.cache.set(gid, guild);
    // Chỉ 2 acc tên máy đạt ngưỡng cá nhân — nếu AI KHÔNG leo thang,
    // verdict "watch" → return sớm, không ai bị phạt.
    const aiRaid = {
      ...ai,
      aiAnalyzeRaid: async () => ({
        coordinated: true,
        confidence: 0.9,
        reasoning: "cùng lúc, cùng mẫu",
      }),
    };
    const membersEsc = createMembers({ store, state, core, ai: aiRaid, raidIntel });
    for (const m of wave) await membersEsc.handleRaidJoin(m);
    const punished = new Set([...calls.memberKicks, ...calls.memberBans, ...calls.memberTimeouts]);
    check(
      `AI xác nhận phối hợp + tin cậy 0.9 → leo thang "theo dõi" thành "raid" (phạt ${punished.size})`,
      punished.size === 2,
    );
    check(
      "leo thang vẫn giữ gate cá nhân: acc chỉ 2đ không bị phạt oan",
      ![...punished].some((id) => id.startsWith("escA")),
    );
  }
  {
    // AI lỗi (provider chết) → giữ phán quyết deterministic, không vỡ.
    clear();
    const gid = "g-ai-throw";
    const bots = [];
    for (let i = 0; i < 5; i++) {
      bots.push(makeMember("thr" + String(930000 + i), { fresh: true, avatar: null }));
    }
    const guild = makeGuild(gid, bots);
    configs.set(gid, baseConfig());
    client.guilds.cache.set(gid, guild);
    const aiThrow = {
      ...ai,
      aiAnalyzeRaid: async () => {
        throw new Error("provider AI không phản hồi");
      },
    };
    const membersThr = createMembers({ store, state, core, ai: aiThrow, raidIntel });
    let ok = true;
    try {
      for (const m of bots) await membersThr.handleRaidJoin(m);
    } catch (e) {
      ok = false;
    }
    check("AI lỗi → bot không vỡ", ok);
    check(
      "AI lỗi → vẫn xử lý theo phán quyết deterministic",
      calls.memberKicks.length + calls.memberBans.length > 0,
    );
  }

  // ── 11. hit-and-run: bot thiếu quyền ban → ghi rõ lý do, không im lặng ──
  {
    clear();
    const gid = "g-hr-fail";
    const bot = makeMember("bot-dien-roi", { bot: true, fresh: true });
    bot.ban = async () => {
      throw new Error("Missing Permissions");
    };
    const guild = makeGuild(gid, [bot]);
    configs.set(gid, baseConfig());
    client.guilds.cache.set(gid, guild);
    state.state.botAddTimes.set(gid + ":bot-dien-roi", Date.now() - 30_000);
    members.markBotExemptOnJoin(bot);
    let ok = true;
    try {
      await members.handleHitAndRunLeave(bot, null);
    } catch (e) {
      ok = false;
    }
    check("hit-and-run: hình phạt lỗi không làm vỡ handler", ok);
    const ev = calls.events.find((e) => e.module === "botHitAndRun");
    check("hit-and-run: thiếu quyền ban vẫn ghi sự kiện", !!ev);
    check(
      `hit-and-run: sự kiện nói rõ không ban được (${String(ev?.action ?? "").slice(0, 60)})`,
      String(ev?.action ?? "").includes("không thể"),
    );
  }

  // ── 12. Cổng chống: tắt antinuke / tắt module / thiếu cấu hình → im lặng ──
  // Đây là bảo đảm "fail-open" quan trọng nhất của lớp nuke: bất kỳ lỗi cấu
  // hình nào cũng KHÔNG được biến thành phạt oai trên server đang chạy.
  {
    clear();
    const gid = "g-gates";
    const bot = makeMember("bot-co", { bot: true, fresh: true });
    const guild = makeGuild(gid, [bot]);
    client.guilds.cache.set(gid, guild);

    // Member không phải bot
    const human = makeMember("nguoi-1", { bot: false });
    guild.members.cache.set(human.id, human);
    await members.handleSuspiciousBotJoin(human);
    check("alert: member thường (không phải bot) → im lặng", calls.events.length === 0);

    // Bot vào nhưng server chưa bật antinuke
    configs.set(gid, baseConfig({ antinukeEnabled: false }));
    await members.handleSuspiciousBotJoin(bot);
    check("alert: antinuke tắt → im lặng", calls.events.length === 0);

    // Module chưa bật
    const off = baseConfig();
    off.modules = off.modules.map((m) =>
      m.module === "suspiciousBotAlert" ? { ...m, enabled: false } : m,
    );
    configs.set(gid, off);
    await members.handleSuspiciousBotJoin(bot);
    check("alert: module suspiciousBotAlert tắt → im lặng", calls.events.length === 0);

    // Không đọc được cấu hình
    configs.delete(gid);
    await members.handleSuspiciousBotJoin(bot);
    check("alert: không có cấu hình → im lặng, không vỡ", calls.events.length === 0);
  }
  {
    // markBotExemptOnJoin: getConfig lỗi → ghi false (fail-safe: coi như KHÔNG
    // được miễn) thay vì ném lỗi làm hỏng luồng guildMemberAdd.
    clear();
    const gid = "g-except-join";
    const bot = makeMember("bot-ex", { bot: true, fresh: true });
    const guild = makeGuild(gid, [bot]);
    client.guilds.cache.set(gid, guild);
    const brokenStore = {
      client: { mutation: async () => ({}) },
      getConfig: async () => {
        throw new Error("Convex timeout");
      },
    };
    const createMembers2 = require("../bot/src/handlers/antinuke/members");
    const membersBroken = createMembers2({
      store: brokenStore,
      state,
      core,
      ai,
      raidIntel,
    });
    let ok = true;
    try {
      await membersBroken.markBotExemptOnJoin(bot);
      await membersBroken.markBotExemptOnJoin({ user: { bot: false }, guild: null });
    } catch (e) {
      ok = false;
    }
    check("markBotExemptOnJoin: lỗi cấu hình + đầu vào rác → không vỡ", ok);
    check(
      "markBotExemptOnJoin: lỗi cấu hình → ghi false (không để bot hợp pháp bị ban)",
      state.state.botExemptAtJoin.get(gid + ":bot-ex") === false,
    );
  }
  {
    // hit-and-run: module tắt / antinuke tắt → không phạt bot.
    clear();
    const gid = "g-hr-gate";
    const bot = makeMember("bot-hr-gate", { bot: true, fresh: true });
    const guild = makeGuild(gid, [bot]);
    client.guilds.cache.set(gid, guild);
    const off = baseConfig({ antinukeEnabled: false });
    configs.set(gid, off);
    state.state.botAddTimes.set(gid + ":bot-hr-gate", Date.now() - 30_000);
    await members.handleHitAndRunLeave(bot, null);
    check("hit-and-run: antinuke tắt → không phạt", calls.memberBans.length === 0);
    const off2 = baseConfig();
    off2.modules = off2.modules.map((m) =>
      m.module === "botHitAndRun" ? { ...m, enabled: false } : m,
    );
    configs.set(gid, off2);
    state.state.botAddTimes.set(gid + ":bot-hr-gate", Date.now() - 30_000);
    await members.handleHitAndRunLeave(bot, null);
    check("hit-and-run: module tắt → không phạt", calls.memberBans.length === 0);
  }

  fs.unlinkSync(DJS_MOCK);
  console.log(`\nKết quả member layers: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
