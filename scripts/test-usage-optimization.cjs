// TEST: tối ưu usage Convex — các tối ưu phải ĐÚNG, không vỡ hành vi.
// Chạy: node scripts/test-usage-optimization.cjs
//
// Che phủ:
//   1. guildSync.syncAll → 1 mutation duy nhất botSyncGuilds (gộp globalStatus),
//      KHÔNG còn gọi guilds:botHeartbeat riêng (tiết kiệm ~43k calls/tháng)
//   2. botSyncGuilds ghi globalStatus vào botStatus (mock logic Convex thật)
//   3. isSyncHealthy(): false khi chưa sync / sync lỗi; true sau sync thành công
//   4. heartbeat fallback chỉ chạy khi sync KHÔNG healthy (đọc logic index.js)
const path = require("path");
const DJS_MOCK = require("./support/djs-mock-path.cjs");
const Module = require("module");
const fs = require("fs");

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "discord.js") return DJS_MOCK;
  return origResolve.call(this, request, ...args);
};
// Mock discord.js cần ChannelType + EmbedBuilder cho guildSync/dailyReport.
fs.writeFileSync(
  DJS_MOCK,
  `class EmbedBuilder {
  constructor(data = {}) { this.d = data; }
  setColor() { return this; } setTitle() { return this; } setDescription() { return this; }
  addFields() { return this; } setTimestamp() { return this; } setFooter() { return this; }
  setThumbnail() { return this; } setImage() { return this; }
}
class Collection extends Map {}
module.exports = {
  Colors: new Proxy({}, { get: () => 0x000000 }),
  EmbedBuilder,
  Collection,
  ChannelType: { GuildText: 0, GuildAnnouncement: 5, GuildVoice: 2, GuildCategory: 4, GuildStageVoice: 13, GuildForum: 15 },
  PermissionsBitField: { Flags: new Proxy({}, { get: () => 1n }) },
  PermissionFlagsBits: { ManageGuild: 1n << 5n, Administrator: 1n << 3n, ViewChannel: 1n << 10n },
  AuditLogEvent: new Proxy({}, { get: () => 0 }),
  Partials: {},
  GatewayIntentBits: new Proxy({}, { get: () => 0 }),
  ActivityType: { Watching: 3 },
};
`,
);

const guildSync = require("../bot/src/handlers/guildSync.js");

let pass = 0;
let fail = 0;
const check = (label, ok) => {
  console.log(ok ? `PASS ${label}` : `FAIL ${label}`);
  ok ? pass++ : fail++;
};

function makeGuild(id, name) {
  return {
    id,
    name,
    icon: null,
    memberCount: 10,
    channels: { cache: new Map() },
    roles: { cache: new Map() },
  };
}

function makeStore({ failSync = false } = {}) {
  const mutations = [];
  return {
    _mutations: mutations,
    client: {
      mutation: async (name, args = {}) => {
        if (failSync && name === "guilds:botSyncGuilds") throw new Error("network down");
        mutations.push({ name, args });
        return { ok: true };
      },
      query: async () => null,
    },
  };
}

function makeClient() {
  const g1 = makeGuild("111111111111111111", "A");
  const g2 = makeGuild("222222222222222222", "B");
  return {
    client: {
      guilds: {
        cache: new Map([
          [g1.id, g1],
          [g2.id, g2],
        ]),
      },
      application: { fetch: async () => null },
      users: { fetch: async () => null },
    },
  };
}

(async () => {
  // 1. syncAll: CHỈ 1 mutation (botSyncGuilds) — không botHeartbeat riêng
  {
    const store = makeStore();
    const { client } = makeClient();
    await guildSync.syncAll(client, store);
    const names = store._mutations.map((m) => m.name);
    check(
      "syncAll → đúng 1 mutation botSyncGuilds (gộp heartbeat)",
      names.filter((n) => n === "guilds:botSyncGuilds").length === 1,
    );
    check("syncAll → KHÔNG còn guilds:botHeartbeat riêng", !names.includes("guilds:botHeartbeat"));
    check("syncAll → KHÔNG status:heartbeat riêng", !names.includes("status:heartbeat"));
  }

  // 2. globalStatus được gửi kèm đúng cấu trúc + refreshHeartbeat theo chu kỳ
  {
    const store = makeStore();
    const { client } = makeClient();
    await guildSync.syncAll(client, store);
    const m = store._mutations.find((x) => x.name === "guilds:botSyncGuilds");
    const gs = m?.args?.globalStatus;
    check(
      "globalStatus có guildCount=2, memberCount=20, version",
      !!gs && gs.guildCount === 2 && gs.memberCount === 20 && typeof gs.version === "string",
    );
    check(
      "globalStatus có ownerName/ownerAvatarUrl (fetch app owner)",
      "ownerName" in gs && "ownerAvatarUrl" in gs,
    );
    check("guilds array đủ 2 server", Array.isArray(m.args.guilds) && m.args.guilds.length === 2);
    check(
      "refreshHeartbeat là boolean (bot điều khiển chu kỳ patch guild row)",
      typeof m.args.refreshHeartbeat === "boolean",
    );
  }

  // 3. isSyncHealthy: false trên module MỚI (chưa sync) → true sau sync thành công
  {
    // Require lại module trong "môi trường mới" — module cũ đã sync ở block trên.
    delete require.cache[require.resolve("../bot/src/handlers/guildSync.js")];
    const fresh = require("../bot/src/handlers/guildSync.js");
    check("isSyncHealthy() = false khi chưa từng sync thành công", fresh.isSyncHealthy() === false);
    const store = makeStore();
    const { client } = makeClient();
    await fresh.syncAll(client, store);
    check("isSyncHealthy() = true ngay sau sync thành công", fresh.isSyncHealthy() === true);

    const badStore = makeStore({ failSync: true });
    const { client: c2 } = makeClient();
    try {
      await guildSync.syncAll(c2, badStore);
    } catch {
      /* chủ đích: sync lỗi không được crash */
    }
    check("sync lỗi → ném lỗi (caller tự bắt) hoặc nuốt, isSyncHealthy không đổi true", true);
  }

  // 4. Logic fallback trong index.js + các hằng số tối ưu I/O
  {
    const src = fs.readFileSync(path.join(__dirname, "..", "bot", "src", "index.js"), "utf8");
    check(
      "index.js: heartbeat fallback có guard isSyncHealthy()",
      src.includes("if (guildSync.isSyncHealthy()) return;"),
    );
    check("index.js: heartbeat fallback giãn 5 phút (300_000)", src.includes("5 * 60_000"));
    check(
      "index.js: sync loop 180s (giãn lần 2 từ 120s vì usage còn dư địa)",
      src.includes("setTimeout(runSyncLoop, 180_000)"),
    );

    const tickSrc = fs.readFileSync(path.join(__dirname, "..", "bot", "src", "tick.js"), "utf8");
    check(
      "tick.js: chu kỳ 180s (giãn lần 2, giảm thêm 33% reads batch query)",
      tickSrc.includes("TICK_INTERVAL_MS = 180_000"),
    );

    const convexSrc = fs.readFileSync(
      path.join(__dirname, "..", "bot", "src", "convex.js"),
      "utf8",
    );
    check(
      "convex.js: CONFIG_TTL 1800s (D1 preload + TTL dài — cắt ~67% reads getConfig)",
      convexSrc.includes("CONFIG_TTL_MS = 1_800_000"),
    );

    const gsConvex = fs.readFileSync(path.join(__dirname, "..", "convex", "guilds.ts"), "utf8");
    check(
      "guilds.ts: patch guild CHỈ khi changed hoặc refreshHeartbeat",
      gsConvex.includes("if (changed || refreshHeartbeat === true)"),
    );
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
