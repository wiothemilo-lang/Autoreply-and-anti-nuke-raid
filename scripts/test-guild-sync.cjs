// TEST: guildSync — đồng bộ guild lên Convex (nhánh chưa phủ trước đây 49%).
// Chạy: node scripts/test-guild-sync.cjs
//
// Phủ:
//   - syncAll: trustedFullList (bot nhỏ ≤50 → luôn tin); bot lớn sụt đột ngột
//     → nghi nhận số liệu (trustedFullList=false) 3 vòng; syncChannels/Roles chỉ
//     chạy mỗi vòng thứ 5 và CHỈ khi hash đổi; owner fetch lỗi không chết.
//   - syncOne: upsert ngay 1 guild mới (kể cả channels/roles rỗng).
//   - markGone / ensureModules / isSyncHealthy.
// LƯU Ý: module có state (firstRun/runCounter...) — require mới mỗi kịch bản
// bằng cách xóa cache.
const DJS_MOCK = require("./support/djs-mock-path.cjs");
const Module = require("module");
const fs = require("fs");

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "discord.js") return DJS_MOCK;
  return origResolve.call(this, request, ...args);
};
// Mock đủ ChannelType cho guildSync + EmbedBuilder cho các require dây chuyền.
fs.writeFileSync(
  DJS_MOCK,
  `class EmbedBuilder {
  constructor(data = {}) { this.d = { ...data }; }
  setColor() { return this; } setTitle() { return this; } setDescription() { return this; }
  addFields() { return this; } setTimestamp() { return this; } setFooter() { return this; }
  setThumbnail() { return this; } setImage() { return this; }
}
class Collection extends Map {
  filter(fn) { const out = new Collection(); for (const [k, v] of this) if (fn(v, k)) out.set(k, v); return out; }
  map(fn) { const out = []; for (const [k, v] of this) out.push(fn(v, k)); return out; }
  sort(fn) { return new Collection([...this.entries()].sort((a, b) => fn(a[1], b[1]))); }
  first(n) { const arr = [...this.values()]; return n === undefined ? arr[0] : arr.slice(0, n); }
}
module.exports = {
  Colors: new Proxy({}, { get: () => 0x000000 }),
  EmbedBuilder,
  Collection,
  ChannelType: { GuildText: 0, GuildAnnouncement: 5, GuildVoice: 2, GuildCategory: 4, GuildStageVoice: 13, GuildForum: 15 },
  PermissionFlagsBits: { ManageGuild: 1n << 5n },
  Partials: {},
  GatewayIntentBits: new Proxy({}, { get: () => 0 }),
};
`,
);

function freshModule() {
  delete require.cache[require.resolve("../bot/src/handlers/guildSync.js")];
  return require("../bot/src/handlers/guildSync.js");
}

let pass = 0;
let fail = 0;
const check = (label, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  ok ? pass++ : fail++;
};

function makeChannel(id, type, name = `ch-${id}`) {
  return { id, type, name };
}
function makeRole(id, name, color = 0, position = 0) {
  return { id, name, color, position };
}

const { Collection } = require(DJS_MOCK);

function makeGuild(id, name, { withChannels = false } = {}) {
  const channels = new Collection();
  const roles = new Collection();
  if (withChannels) {
    channels.set("c1", makeChannel("c1", 0));
    channels.set("c2", makeChannel("c2", 2));
    roles.set("r1", makeRole("r1", "@everyone"));
    roles.set("r2", makeRole("r2", "Mod", 0xff0000, 1));
  }
  return {
    id,
    name,
    icon: null,
    memberCount: 10,
    channels: { cache: channels },
    roles: { cache: roles },
  };
}

function makeStore({ failNames = [] } = {}) {
  const mutations = [];
  const invalidated = [];
  return {
    _mutations: mutations,
    _invalidated: invalidated,
    /** Bot tự ghi DB thì phải xoá cache config (TTL 30 phút) — xem ensureModules. */
    invalidate: (guildId) => invalidated.push(guildId),
    client: {
      mutation: async (name, args) => {
        if (failNames.includes(name)) throw new Error(`lỗi ${name}`);
        mutations.push({ name, args });
        return { ok: true };
      },
      query: async () => null,
    },
  };
}

function makeClient(guilds) {
  const cache = new Map(guilds.map((g) => [g.id, g]));
  return {
    guilds: { cache },
    application: { fetch: async () => ({ owner: { ownerId: "owner-1" } }) },
    users: {
      fetch: async (id) => ({
        id,
        username: `owner-${id}`,
        displayAvatarURL: () => "https://x/a.png",
      }),
    },
  };
}

(async () => {
  // ── 1. Bot nhỏ (≤50 guild): trustedFullList luôn true ─────────────────────
  {
    const gs = freshModule();
    const store = makeStore();
    const res = await gs.syncAll(makeClient([makeGuild("g1", "A", { withChannels: true })]), store);
    check("bot 1 guild → trustedFullList=true", res.trustedFullList === true && res.count === 1);
    const sync = store._mutations.find((m) => m.name === "guilds:botSyncGuilds");
    check(
      "botSyncGuilds gửi guilds + globalStatus đầy đủ",
      sync?.args?.guilds?.length === 1 &&
        sync.args.globalStatus?.guildCount === 1 &&
        typeof sync.args.globalStatus.version === "string" &&
        typeof sync.args.globalStatus.ownerName === "string",
    );
    check("isSyncHealthy=true ngay sau sync thành công", gs.isSyncHealthy() === true);
    // Vòng 1 chưa phải vòng thứ 5 → không gọi syncChannels/Roles.
    check(
      "vòng thường (không phải %5) → KHÔNG syncChannels/Roles",
      !store._mutations.some((m) => m.name === "guilds:syncChannels"),
    );
  }

  // ── 2. Vòng thứ 5: syncChannels/Roles + chỉ khi hash đổi ──────────────────
  {
    const gs = freshModule();
    const store = makeStore();
    const g = makeGuild("g1", "A", { withChannels: true });
    const client = makeClient([g]);
    // Chạy 5 vòng — vòng 5 có syncChannels/Roles lần đầu.
    for (let i = 0; i < 5; i++) await gs.syncAll(client, store);
    const chCalls = store._mutations.filter((m) => m.name === "guilds:syncChannels").length;
    check("5 vòng → đúng 1 lần syncChannels (vòng %5 đầu)", chCalls === 1);
    // Vòng 6..10: dữ liệu KHÔNG đổi → không sync lại.
    for (let i = 0; i < 5; i++) await gs.syncAll(client, store);
    const chCalls2 = store._mutations.filter((m) => m.name === "guilds:syncChannels").length;
    check("5 vòng kế với dữ liệu nguyên → KHÔNG sync lại (hash trùng)", chCalls2 === 1);
    // Đổi kênh → hash đổi → vòng %5 kế sync lại.
    g.channels.cache.set("c3", makeChannel("c3", 0, "moi"));
    for (let i = 0; i < 5; i++) await gs.syncAll(client, store);
    const chCalls3 = store._mutations.filter((m) => m.name === "guilds:syncChannels").length;
    check("kênh mới → vòng %5 kế sync lại đúng 1 lần", chCalls3 === 2);
    check(
      "syncRoles loại @everyone (giữ đúng role Mod)",
      (() => {
        const r = store._mutations.find((m) => m.name === "guilds:syncRoles");
        return r?.args?.roles?.length === 1 && r.args.roles[0].roleId === "r2";
      })(),
    );
  }

  // ── 3. Bot lớn sụt đột ngột → nghi nhận 3 vòng (trustedFullList=false) ────
  {
    const gs = freshModule();
    const store = makeStore();
    // Mốc trusted: vòng 1 (firstRun) chưa tin; vòng 2 tin → lastTrustedCount=200.
    // CHÚ Ý ngưỡng: bot ≤ SMALL_BOT_LIMIT(50) guild luôn tin — kịch bản sụt phải
    // giữ count > 50 để vào nhánh else. 200→80: 80 > 50 (vào else) và
    // 80 < 200 - max(50, 20) = 150 → droppedSharply.
    const many = Array.from({ length: 200 }, (_, i) => makeGuild(`g${i}`, `G${i}`));
    let res = await gs.syncAll(makeClient(many), store);
    check("vòng 1 (firstRun) với 200 guild → chưa tin danh sách", res.trustedFullList === false);
    res = await gs.syncAll(makeClient(many), store);
    check("vòng 2 ổn định → tin danh sách (lastTrusted=200)", res.trustedFullList === true);
    // Sụt còn 80 guild → droppedSharply → nghi 3 vòng.
    const few = many.slice(0, 80);
    res = await gs.syncAll(makeClient(few), store);
    check("200→80 guild sụt đột ngột → trustedFullList=false", res.trustedFullList === false);
    res = await gs.syncAll(makeClient(few), store);
    check("sụt lần 2 liên tiếp → vẫn nghi (streak<3)", res.trustedFullList === false);
    res = await gs.syncAll(makeClient(few), store);
    check("sụt lần 3 → chấp nhận số liệu mới (streak đủ)", res.trustedFullList === true);
    // Hồi phục 200 guild → tin ngay.
    res = await gs.syncAll(makeClient(many), store);
    check("quay lại 200 guild → trusted ngay (không sụt)", res.trustedFullList === true);
  }

  // ── 4. Owner fetch lỗi → không chết, globalStatus thiếu owner ─────────────
  {
    const gs = freshModule();
    const store = makeStore();
    const client = makeClient([makeGuild("g1", "A")]);
    client.application.fetch = async () => {
      throw new Error("Discord API 500");
    };
    let ok = true;
    let res = null;
    try {
      res = await gs.syncAll(client, store);
    } catch {
      ok = false;
    }
    check("owner fetch lỗi → syncAll vẫn hoàn tất", ok && res?.count === 1);
    const gs2 = store._mutations.find((m) => m.name === "guilds:botSyncGuilds");
    check(
      "owner lỗi → globalStatus không có ownerName",
      gs2?.args?.globalStatus?.ownerName === undefined,
    );
  }

  // ── 5. syncOne: guild mới — sync ngay cả channels/roles ───────────────────
  {
    const gs = freshModule();
    const store = makeStore();
    const g = makeGuild("g-new", "Mới", { withChannels: true });
    await gs.syncOne(makeClient([g]), store, "g-new");
    const names = store._mutations.map((m) => m.name);
    check(
      "syncOne gọi đủ botSyncGuilds + syncChannels + syncRoles",
      names.includes("guilds:botSyncGuilds") &&
        names.includes("guilds:syncChannels") &&
        names.includes("guilds:syncRoles"),
    );
    const sync = store._mutations.find((m) => m.name === "guilds:botSyncGuilds");
    check(
      "syncOne trustedFullList=false (không đụng danh sách toàn cục)",
      sync?.args?.trustedFullList === false,
    );

    // Guild không tồn tại → im lặng không chết.
    let ok = true;
    try {
      await gs.syncOne(makeClient([]), store, "g-khong-co");
    } catch {
      ok = false;
    }
    check("syncOne guild không tồn tại → bỏ qua an toàn", ok);

    // Mutation lỗi → bắt lỗi, không ném.
    const storeFail = makeStore({ failNames: ["guilds:syncChannels"] });
    let ok2 = true;
    try {
      await gs.syncOne(makeClient([g]), storeFail, "g-new");
    } catch {
      ok2 = false;
    }
    check("syncOne mutation lỗi → log, không ném", ok2);
  }

  // ── 6. markGone + ensureModules ───────────────────────────────────────────
  {
    const gs = freshModule();
    const store = makeStore();
    await gs.markGone(makeClient([]), store, "g-out");
    check(
      "markGone gọi guilds:botGuildGone",
      store._mutations.some((m) => m.name === "guilds:botGuildGone" && m.args.guildId === "g-out"),
    );

    const client = makeClient([makeGuild("g1", "A"), makeGuild("g2", "B")]);
    await gs.ensureModules(client, store);
    const ensures = store._mutations.filter((m) => m.name === "bot_writes:botEnsureModules");
    check("ensureModules gọi cho từng guild", ensures.length === 2);
    // Regression 28/09/2026: seed thêm dòng module vào DB nhưng cache config vẫn
    // giữ payload cũ 30 phút → moduleCfgOf rơi vào fallback. Phải invalidate.
    check(
      "ensureModules xoá cache config từng guild sau khi seed",
      store._invalidated.length === 2 &&
        store._invalidated.includes("g1") &&
        store._invalidated.includes("g2"),
    );

    const storeFail = makeStore({ failNames: ["bot_writes:botEnsureModules"] });
    let ok = true;
    try {
      await gs.ensureModules(client, storeFail);
    } catch {
      ok = false;
    }
    check("ensureModules lỗi 1 guild → tiếp tục, không ném", ok);
    check(
      "ensureModules lỗi → KHÔNG invalidate (cache cũ vẫn hợp lệ)",
      storeFail._invalidated.length === 0,
    );
  }

  // ── 7. isSyncHealthy: sync lỗi gần nhất → false ───────────────────────────
  {
    const gs = freshModule();
    check("chưa từng sync → isSyncHealthy=false", gs.isSyncHealthy() === false);
    const store = makeStore({ failNames: ["guilds:botSyncGuilds"] });
    let ok = true;
    try {
      await gs.syncAll(makeClient([makeGuild("g1", "A")]), store);
    } catch {
      ok = false;
    }
    check("syncAll mutation lỗi → ném cho caller (heartbeat fallback bắt)", !ok);
    check("sync lỗi → isSyncHealthy=false (fallback heartbeat chạy)", gs.isSyncHealthy() === false);
  }

  console.log(`\nKết quả: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("Suite crash:", e);
  process.exit(1);
});
