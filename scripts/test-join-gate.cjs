// Test Join Gate (bot/src/handlers/joinGate.js) — cổng vào server + Alt pipeline:
//   - bot → bỏ qua; verify đầy đủ → gán role unverified
//   - joinGate: tuổi acc / avatar / flag / raid-kick + whitelist + punish
//   - alt whitelist (user + role) → bỏ qua hoàn toàn
//   - analysis pass → chỉ ghi join history (recordJoin), không phạt
//   - analysis punish → executePunishment + markJoinPunished + event antinuke
// Không mạng, không DB thật. Chạy: node scripts/test-join-gate.cjs
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
  addFields(...f) { this.d.fields = [...(this.d.fields ?? []), ...f.flat(Infinity)]; return this; }
  setTimestamp() { return this; }
  setFooter(f) { this.d.footer = f; return this; }
}
module.exports = {
  Colors: new Proxy({}, { get: () => 0x000000 }),
  EmbedBuilder,
  PermissionFlagsBits: { ManageGuild: 1n << 5n, Administrator: 1n << 3n, ManageChannels: 1n << 4n },
  UserFlags: { VerifiedBot: 1n << 16n },
  ChannelType: { GuildText: 0, GuildVoice: 2 },
};
`,
);

(async () => {
  const DAY = 86_400_000;
  const joinGate = require("../bot/src/handlers/joinGate");

  const calls = {
    kicks: [],
    bans: [],
    timeouts: [],
    roleAdds: [],
    mutations: [],
    queries: [],
  };
  let config = {};
  const configs = new Map();

  const store = {
    client: {
      query: async (name) => {
        calls.queries.push(name);
        return name === "altDetection:botGetJoinHistory" ? [] : [];
      },
      mutation: async (name, args) => {
        calls.mutations.push({ name, args });
        return {};
      },
    },
    getConfig: async (guildId) => configs.get(guildId) ?? config,
  };

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
  };

  function mkMember(
    id,
    username,
    { bot = false, avatar = "av", createdDaysAgo = 400, flagsBitfield = 128 } = {},
  ) {
    return {
      id,
      guild: null,
      user: {
        id,
        bot,
        username,
        avatar,
        createdTimestamp: Date.now() - createdDaysAgo * DAY,
        flags: { bitfield: flagsBitfield },
      },
      joinedTimestamp: Date.now(),
      roles: {
        cache: new Set(),
        add: async () => calls.roleAdds.push(id),
        some: () => false,
      },
      permissions: { has: () => false },
      kick: async () => calls.kicks.push(id),
      ban: async () => calls.bans.push(id),
      timeout: async () => calls.timeouts.push(id),
      send: async () => {},
    };
  }
  function mkGuild(id, members = []) {
    const cache = new Map(members.map((m) => [m.id, m]));
    const guild = {
      id,
      name: "G-" + id,
      ownerId: "owner-1",
      members: {
        cache,
        fetch: async (mid) => cache.get(mid) ?? null,
        ban: async () => {},
      },
      roles: { cache: new Map(), everyone: { id } },
      channels: { cache: { filter: () => [], values: () => [].values() } },
      bans: { fetch: async () => new Map() },
      fetchAuditLogs: async () => ({ entries: { first: () => null } }),
    };
    for (const m of members) m.guild = guild;
    // joinGate nhận member RỜI guild (member.guild phải tồn tại trước khi gọi) —
    // hàm này không tự gán guild như Discord runtime.
    guild.addMember = (m) => {
      m.guild = guild;
      cache.set(m.id, m);
      return m;
    };
    return guild;
  }

  const client = { user: { id: "bot-self" }, guilds: { cache: new Map() } };

  // ── 1. Bot join → bỏ qua hoàn toàn ──
  {
    clear();
    const g = mkGuild("g-1");
    configs.set("g-1", {});
    client.guilds.cache.set("g-1", g);
    await joinGate(client, mkMember("bot-1", "somebot", { bot: true }), store);
    check(
      "bot join → không kick/ban/timeout, không mutation",
      calls.kicks.length + calls.bans.length + calls.timeouts.length === 0 &&
        calls.mutations.length === 0,
    );
  }

  // ── 2. Verify đầy đủ → gán role unverified ──
  {
    clear();
    const g = mkGuild("g-verify");
    configs.set("g-verify", {
      verifyEnabled: true,
      unverifiedRoleId: "r-unv",
      verifiedRoleId: "r-ver",
      verifyChannelId: "c-verify",
    });
    client.guilds.cache.set("g-verify", g);
    const m = g.addMember(mkMember("new-1", "thanhvienmoi"));
    await joinGate(client, m, store);
    check("verify setup đủ → role unverified được gán", calls.roleAdds.includes("new-1"));
    check(
      "người thường hồ sơ sạch → không bị phạt",
      calls.kicks.length === 0 && calls.bans.length === 0,
    );
  }

  // ── 3. joinGate: acc quá trẻ → bị kick + ghi event ──
  {
    clear();
    const g = mkGuild("g-gate");
    configs.set("g-gate", {
      joinGateEnabled: true,
      joinGateMinAgeDays: 7,
      joinGatePunish: "kick",
      logChannelId: null,
    });
    client.guilds.cache.set("g-gate", g);
    await joinGate(
      client,
      g.addMember(mkMember("fresh-1", "accmoi", { createdDaysAgo: 2, flagsBitfield: 128 })),
      store,
    );
    check("acc 2 ngày (yêu cầu 7) → bị kick", calls.kicks.includes("fresh-1"));
    check(
      "ghi event antinuke module joinGate",
      calls.mutations.some(
        (mm) => mm.name === "bot_writes:botRecordAntinukeEvent" && mm.args.module === "joinGate",
      ),
    );
  }

  // ── 4. joinGate: whitelist → vào tự do ──
  {
    clear();
    const g = mkGuild("g-wl");
    configs.set("g-wl", {
      joinGateEnabled: true,
      joinGateMinAgeDays: 7,
      joinGateWhitelist: ["trusted-1"],
    });
    client.guilds.cache.set("g-wl", g);
    await joinGate(
      client,
      g.addMember(mkMember("trusted-1", "accmoi", { createdDaysAgo: 1 })),
      store,
    );
    check(
      "whitelist joinGate → không bị chặn dù acc mới",
      calls.kicks.length === 0 && calls.bans.length === 0,
    );
  }

  // ── 5. joinGate: thiếu avatar → chặn ──
  {
    clear();
    const g = mkGuild("g-av");
    configs.set("g-av", {
      joinGateEnabled: true,
      joinGateRequireAvatar: true,
      joinGatePunish: "kick",
    });
    client.guilds.cache.set("g-av", g);
    await joinGate(client, g.addMember(mkMember("noav-1", "khongavatar", { avatar: null })), store);
    check("không avatar riêng → bị kick", calls.kicks.includes("noav-1"));
  }

  // ── 6. alt whitelist (user + role) → bỏ qua alt pipeline ──
  {
    clear();
    const g = mkGuild("g-altwl");
    configs.set("g-altwl", {
      altDetectionEnabled: true,
      altMaxRiskScore: 10,
      altWhitelistUsers: ["trusted-alt"],
      logChannelId: null,
    });
    client.guilds.cache.set("g-altwl", g);
    await joinGate(
      client,
      g.addMember(mkMember("trusted-alt", "xkqe8291", { createdDaysAgo: 0.5 })),
      store,
    );
    check(
      "alt whitelist user → không phạt, không ghi recordJoin",
      calls.kicks.length === 0 &&
        !calls.mutations.some((mm) => mm.name === "altDetection:recordJoin"),
    );
  }

  // ── 7. Người thật sạch → chỉ ghi join history, không phạt ──
  {
    clear();
    const g = mkGuild("g-clean");
    configs.set("g-clean", { altDetectionEnabled: true, altMaxRiskScore: 70 });
    client.guilds.cache.set("g-clean", g);
    await joinGate(client, g.addMember(mkMember("good-1", "thanhlaphe", { avatar: "gav" })), store);
    check(
      "hồ sơ sạch → recordJoin được ghi (lịch sử phục vụ rejoin-evasion)",
      calls.mutations.some((mm) => mm.name === "altDetection:recordJoin"),
    );
    check(
      "hồ sơ sạch → không phạt",
      calls.kicks.length === 0 && calls.bans.length === 0 && calls.timeouts.length === 0,
    );
  }

  // ── 8. Alt chắc chắn (acc <1 ngày + tên trùng hệt member khác) → bị kick ──
  // Điểm: age<1d (+30) + sim 100 (+25) − hypesquad (+15) − avatar (+5) − tên thường (+5) = 30.
  // maxRisk 30 → chạm ngưỡng; strong = [age<3d, name_sim_85+] = 2 → kick thẳng.
  {
    clear();
    const origin = mkMember("origin-1", "vanghinhano", { avatar: "av-o" });
    const g = mkGuild("g-alt", [origin]);
    configs.set("g-alt", { altDetectionEnabled: true, altMaxRiskScore: 30, altPunish: "kick" });
    client.guilds.cache.set("g-alt", g);
    await joinGate(
      client,
      g.addMember(mkMember("alt-1", "vanghinhano", { avatar: "av-a", createdDaysAgo: 0.5 })),
      store,
    );
    check("alt chắc chắn → bị kick theo cấu hình", calls.kicks.includes("alt-1"));
    check(
      "bị phạt → markJoinPunished ghi nhận (phục vụ phát hiện rejoin)",
      calls.mutations.some((mm) => mm.name === "altDetection:markJoinPunished"),
    );
    check(
      "bị phạt → ghi event antinuke module altDetection",
      calls.mutations.some(
        (mm) =>
          mm.name === "bot_writes:botRecordAntinukeEvent" && mm.args.module === "altDetection",
      ),
    );
  }

  // ── 9. store.getConfig lỗi → không crash ──
  {
    clear();
    const brokenStore = {
      ...store,
      getConfig: async () => {
        throw new Error("db down");
      },
    };
    const g = mkGuild("g-err");
    client.guilds.cache.set("g-err", g);
    await joinGate(client, g.addMember(mkMember("m-err", "test")), brokenStore);
    check("getConfig lỗi → joinGate im lặng, không crash", calls.kicks.length === 0);
  }

  // ── 10. joinGate punish=ban → ban thay vì kick ──
  {
    clear();
    const g = mkGuild("g-ban");
    configs.set("g-ban", {
      joinGateEnabled: true,
      joinGateMinAgeDays: 7,
      joinGatePunish: "ban",
    });
    client.guilds.cache.set("g-ban", g);
    await joinGate(
      client,
      g.addMember(mkMember("fresh-ban", "accmoi", { createdDaysAgo: 1 })),
      store,
    );
    check(
      "joinGate punish=ban → ban (không kick)",
      calls.bans.includes("fresh-ban") && !calls.kicks.includes("fresh-ban"),
    );
  }

  // ── 11. joinGate yêu cầu huy hiệu + flag=0 → chặn ──
  {
    clear();
    const g = mkGuild("g-flag");
    configs.set("g-flag", {
      joinGateEnabled: true,
      joinGateRequireFlag: true,
      joinGatePunish: "kick",
    });
    client.guilds.cache.set("g-flag", g);
    await joinGate(
      client,
      g.addMember(mkMember("noflag-1", "khonghuyhieu", { flagsBitfield: 0 })),
      store,
    );
    check("flag = 0 → bị chặn", calls.kicks.includes("noflag-1"));

    clear();
    const g2 = mkGuild("g-flag-ok");
    configs.set("g-flag-ok", { joinGateEnabled: true, joinGateRequireFlag: true });
    client.guilds.cache.set("g-flag-ok", g2);
    await joinGate(
      client,
      g2.addMember(mkMember("hasflag-1", "cohuyhieu", { flagsBitfield: 128 })),
      store,
    );
    check("có huy hiệu → không bị chặn", calls.kicks.length === 0);
  }

  // ── 12. joinGate bị thiếu quyền (kick throw) → ghi event "không thể kick" ──
  {
    clear();
    const g = mkGuild("g-noperm");
    configs.set("g-noperm", {
      joinGateEnabled: true,
      joinGateMinAgeDays: 7,
      joinGatePunish: "kick",
    });
    client.guilds.cache.set("g-noperm", g);
    const m = g.addMember(mkMember("weak-1", "accmoi", { createdDaysAgo: 1 }));
    m.kick = async () => {
      throw new Error("Missing Permissions");
    };
    await joinGate(client, m, store);
    check(
      "kick thất bại → ghi event với 'không thể kick'",
      calls.mutations.some(
        (mm) =>
          mm.name === "bot_writes:botRecordAntinukeEvent" &&
          String(mm.args.action).includes("không thể kick"),
      ),
    );
  }

  // ── 13. alt whitelist ROLE → bỏ qua alt pipeline ──
  {
    clear();
    const g = mkGuild("g-altwl-role");
    configs.set("g-altwl-role", {
      altDetectionEnabled: true,
      altMaxRiskScore: 10,
      altWhitelistRoles: ["r-trusted"],
      logChannelId: null,
    });
    client.guilds.cache.set("g-altwl-role", g);
    const m = g.addMember(mkMember("role-user", "xkqe8291", { createdDaysAgo: 0.5 }));
    // discord.js Collection có .some/.has — mock Set không có, nên thay cache.
    m.roles.cache = {
      some: (fn) => fn({ id: "r-trusted" }),
      has: () => false,
    };
    await joinGate(client, m, store);
    check(
      "alt whitelist role → không phạt, không recordJoin",
      calls.kicks.length === 0 &&
        !calls.mutations.some((mm) => mm.name === "altDetection:recordJoin"),
    );
  }

  // ── 14. verify thiếu thành phần → KHÔNG gán role unverified ──
  {
    clear();
    const g = mkGuild("g-verify-partial");
    configs.set("g-verify-partial", {
      verifyEnabled: true,
      unverifiedRoleId: "r-unv",
      // thiếu verifiedRoleId + verifyChannelId
    });
    client.guilds.cache.set("g-verify-partial", g);
    await joinGate(client, g.addMember(mkMember("p-1", "thanhvienmoi")), store);
    check("verify thiếu thành phần → không gán role unverified", calls.roleAdds.length === 0);
  }

  // ── 15. member không có guild / là bot → bỏ qua hoàn toàn ──
  {
    clear();
    await joinGate(client, { user: { bot: false } }, store);
    check("member không guild → bỏ qua (không crash)", calls.kicks.length === 0);
  }

  // ── 16. Rủi ro trung bình → CHỈ quan sát, tuyệt đối không phạt ──
  // Đây là hàng rào chống phạt oan quan trọng nhất: riskScore từ 20 trở lên
  // nhưng dưới ngưỡng cấu hình thì chỉ ghi log phân tích, không kick/ban/timeout.
  {
    clear();
    // Hồ sơ giống case 8 (risk=30: acc <1 ngày + tên trùng 100%), nhưng ngưỡng
    // đặt cao → action = "pass" → rơi vào nhánh "chỉ quan sát".
    const origin = mkMember("o-watch", "vanghinhano", { avatar: "av-o" });
    const g = mkGuild("g-watch", [origin]);
    configs.set("g-watch", {
      altDetectionEnabled: true,
      altMaxRiskScore: 100,
      altPunish: "kick",
      logChannelId: null,
    });
    client.guilds.cache.set("g-watch", g);
    const logs = [];
    const realLog = console.log;
    console.log = (...a) => logs.push(a.join(" "));
    try {
      await joinGate(
        client,
        g.addMember(mkMember("watch-1", "vanghinhano", { avatar: "av-a", createdDaysAgo: 0.5 })),
        store,
      );
    } finally {
      console.log = realLog;
    }
    check(
      "rủi ro trung bình → không kick/ban/timeout",
      calls.kicks.length === 0 && calls.bans.length === 0 && calls.timeouts.length === 0,
    );
    check(
      "rủi ro trung bình → KHÔNG ghi markJoinPunished",
      !calls.mutations.some((mm) => mm.name === "altDetection:markJoinPunished"),
    );
    check(
      "rủi ro trung bình → có dòng log 'monitoring only'",
      logs.some((l) => l.includes("monitoring only")),
      JSON.stringify(logs.slice(0, 2)),
    );
  }

  // ── 17. Lỗi ghi DB giữa chừng KHÔNG được làm hỏng phần còn lại ──
  // markJoinPunished / botRecordAntinukeEvent là dữ liệu phụ (phục vụ đối chiếu
  // rejoin + log). Mất nó không được phép làm mất luôn cả bằng chứng phạt.
  {
    clear();
    const origin = mkMember("o-1", "vanghinhano", { avatar: "av-o" });
    const g = mkGuild("g-db1", [origin]);
    configs.set("g-db1", {
      altDetectionEnabled: true,
      altMaxRiskScore: 30,
      altPunish: "kick",
      logChannelId: null,
    });
    client.guilds.cache.set("g-db1", g);
    const flakyStore = {
      ...store,
      client: {
        ...store.client,
        mutation: async (name, args) => {
          calls.mutations.push({ name, args });
          if (name === "altDetection:markJoinPunished") throw new Error("db down");
          return {};
        },
      },
    };
    let threw1 = false;
    try {
      await joinGate(
        client,
        g.addMember(mkMember("alt-d1", "vanghinhano", { avatar: "av-a", createdDaysAgo: 0.5 })),
        flakyStore,
      );
    } catch {
      threw1 = true;
    }
    check(
      "markJoinPunished lỗi → vẫn ghi event antinuke, không ném ra ngoài",
      calls.mutations.some((m) => m.name === "bot_writes:botRecordAntinukeEvent") && !threw1,
    );
  }
  {
    clear();
    const origin = mkMember("o-2", "vanghinhano2", { avatar: "av-o" });
    const g = mkGuild("g-db2", [origin]);
    configs.set("g-db2", {
      altDetectionEnabled: true,
      altMaxRiskScore: 30,
      altPunish: "kick",
      logChannelId: null,
    });
    client.guilds.cache.set("g-db2", g);
    const flakyStore = {
      ...store,
      client: {
        ...store.client,
        mutation: async (name, args) => {
          calls.mutations.push({ name, args });
          if (name === "bot_writes:botRecordAntinukeEvent") throw new Error("db down");
          return {};
        },
      },
    };
    let threw = false;
    try {
      await joinGate(
        client,
        g.addMember(mkMember("alt-d2", "vanghinhano2", { avatar: "av-a", createdDaysAgo: 0.5 })),
        flakyStore,
      );
    } catch {
      threw = true;
    }
    check(
      "ghi event lỗi → vẫn đã kick, không ném ra ngoài",
      calls.kicks.includes("alt-d2") && !threw,
    );
  }

  // ── 18. Burst 5 acc rủi ro cao → AUTO-LOCKDOWN toàn server ──
  // Đây là đường nguy hiểm nhất của Join Gate: burst KHÔNG chỉ phạt từng
  // người mà còn khoá KÊNH của cả server. Trước đây không test nào chạm nhánh
  // này nên một lỗi ở đây = bot khoá nhầm server người hàng xóm khi 5 acc
  // bình thường vào cùng lúc.
  {
    clear();
    const g = mkGuild("g-burst", [mkMember("burst-origin", "nguoi_that_ken", { avatar: "av-o" })]);
    // channels.cache phải ITERABLE (Map) — code duyệt `for (const [, ch] of ...)`.
    // Guild mặc định trong test dùng object nên sẽ ném TypeError, che mất phần
    // đặt hạn mở khóa trên Convex.
    const lockedChannels = [];
    g.channels = {
      cache: new Map([
        [
          "c1",
          {
            id: "c1",
            isTextBased: () => true,
            isThread: () => false,
            permissionOverwrites: {
              edit: async () => {
                lockedChannels.push("c1");
              },
            },
          },
        ],
        [
          "c2",
          {
            id: "c2",
            isTextBased: () => true,
            isThread: () => false,
            permissionOverwrites: {
              edit: async () => {
                lockedChannels.push("c2");
              },
            },
          },
        ],
        [
          "th",
          {
            id: "th",
            isTextBased: () => true,
            isThread: () => true,
            permissionOverwrites: {
              edit: async () => {
                lockedChannels.push("th");
              },
            },
          },
        ],
        [
          "vc",
          {
            id: "vc",
            isTextBased: () => false,
            isThread: () => false,
            permissionOverwrites: {
              edit: async () => {
                lockedChannels.push("vc");
              },
            },
          },
        ],
      ]),
    };
    configs.set("g-burst", {
      altDetectionEnabled: true,
      altMaxRiskScore: 100, // không phạt từng người — chỉ muốn kiểm tra lockdown
      altPunish: "kick",
      logChannelId: null,
      lockdownMinutes: 7,
    });
    client.guilds.cache.set("g-burst", g);

    // 5 acc mới + tên trùng 100% với acc gốc → risk 55 mỗi acc (≥40 trung bình).
    for (let i = 0; i < 5; i++) {
      await joinGate(
        client,
        g.addMember(
          mkMember(`burst-${i}`, "nguoi_that_ken", { avatar: "av-a", createdDaysAgo: 0.5 }),
        ),
        store,
      );
    }
    check(
      "burst đủ 5 acc rủi ro cao → khoá kênh text",
      lockedChannels.includes("c1") && lockedChannels.includes("c2"),
      JSON.stringify(lockedChannels),
    );
    check(
      "burst KHÔNG khoá thread / kênh phiên nói",
      !lockedChannels.includes("th") && !lockedChannels.includes("vc"),
      JSON.stringify(lockedChannels),
    );
    const lockState = calls.mutations.find((m) => m.name === "bot_writes:botLockState");
    check(
      "đặt hạn mở khóa trên Convex (lockdownMinutes)",
      !!lockState,
      JSON.stringify(calls.mutations.map((m) => m.name)),
    );
    const wantUntil = Date.now() + 7 * 60_000;
    check(
      "hạn mở khóa = lockdownMinutes (7 phút)",
      !!lockState && Math.abs(lockState.args.until - wantUntil) < 5_000,
      String(lockState?.args.until),
    );
    check(
      "bật cờ lockdown để tickUnlocks mở đúng hạn",
      calls.mutations.some(
        (m) => m.name === "bot_writes:botUpdateLockdown" && m.args.enabled === true,
      ),
    );
    // Cooldown 15 phút: burst thứ 2 trong cửa sổ phải KHÔNG khoá lại.
    lockedChannels.length = 0;
    clear();
    for (let i = 0; i < 5; i++) {
      await joinGate(
        client,
        g.addMember(
          mkMember(`burst2-${i}`, "nguoi_that_ken", { avatar: "av-a", createdDaysAgo: 0.5 }),
        ),
        store,
      );
    }
    check(
      "cooldown 15 phút → burst lần sau KHÔNG khoá lại",
      lockedChannels.length === 0 &&
        !calls.mutations.some((m) => m.name === "bot_writes:botLockState"),
      JSON.stringify(lockedChannels),
    );
  }
  {
    // isLocked đã đúng: server đang khoá thì không khoá lần hai (tránh spam mutation).
    clear();
    const g = mkGuild("g-burst2", [mkMember("b2-origin", "nguoi_khong_rang", { avatar: "av-o" })]);
    const locked = [];
    g.channels = {
      cache: new Map([
        [
          "c",
          {
            id: "c",
            isTextBased: () => true,
            isThread: () => false,
            permissionOverwrites: { edit: async () => locked.push("c") },
          },
        ],
      ]),
    };
    configs.set("g-burst2", {
      altDetectionEnabled: true,
      altMaxRiskScore: 100,
      altPunish: "kick",
      logChannelId: null,
    });
    client.guilds.cache.set("g-burst2", g);
    for (let i = 0; i < 5; i++) {
      await joinGate(
        client,
        g.addMember(
          mkMember(`b2-${i}`, "nguoi_khong_rang", { avatar: "av-a", createdDaysAgo: 0.5 }),
        ),
        store,
      );
    }
    const { markLocked } = require("../bot/src/lockdown");
    markLocked("g-burst2"); // giả lập đã khoá từ lần trước
    locked.length = 0;
    clear();
    for (let i = 0; i < 5; i++) {
      await joinGate(
        client,
        g.addMember(
          mkMember(`b2b-${i}`, "nguoi_khong_rang", { avatar: "av-a", createdDaysAgo: 0.5 }),
        ),
        store,
      );
    }
    check(
      "server đã khoá → không ghi đè permissionOverwrites",
      locked.length === 0,
      JSON.stringify(locked),
    );
  }

  console.log(`\nKết quả join gate: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})();
