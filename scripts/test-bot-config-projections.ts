// TEST projection cấu hình guild → bot/dashboard — chặn 2 bug "cấu hình chết":
//   1. `timeoutSeconds` admin đặt trên dashboard bị bỏ khỏi CẢ HAI map `modules`
//      ⇒ bot luôn timeout 300 giây, dashboard reload lại về 300.
//   2. `logLang` lưu được nhưng `getBotConfig` không trả ⇒ log moderation luôn
//      ra tiếng Việt dù chọn EN/DE.
//
// Chạy: bun scripts/test-bot-config-projections.ts
// Hermetic: ctx giả trong bộ nhớ, không mạng, không Convex thật.
import { computeBotKey } from "../convex/botAuth";
import { getBotConfig, getGuild } from "../convex/guilds";

const BOT_KEY = "khoa-bot-32-bytes-cho-test-projection";
const GUILD = "111111111111111111";
const USER_DISCORD = "222222222222222222";
const now = Date.now();

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, extra?: unknown) => {
  console.log(
    ok
      ? `  ✅ ${label}`
      : `  ❌ ${label}${extra === undefined ? "" : ` — ${JSON.stringify(extra)}`}`,
  );
  if (ok) pass++;
  else fail++;
};

type Row = Record<string, any>;

function makeCtx() {
  const rows: Record<string, Row[]> = {
    botStatus: [{ _id: "status", kind: "status", botKeySeed: computeBotKey(BOT_KEY) }],
    guilds: [
      {
        _id: "g1",
        discordId: GUILD,
        name: "G",
        prefix: "?",
        logLang: "en",
        antinukeEnabled: true,
        botInGuild: true,
        managers: [],
        adminRoles: [],
        modRoles: [],
        whitelistUsers: [],
        whitelistRoles: [],
        heatDecayPerMin: 3,
        updatedAt: now,
      },
    ],
    antinukeModules: [
      {
        _id: "m1",
        guildId: GUILD,
        module: "massBan",
        enabled: true,
        threshold: 3,
        windowSeconds: 10,
        punish: "ban",
        actions: ["ban"],
        whitelistRoles: [],
        timeoutSeconds: 600,
        heat: 10,
      },
      {
        _id: "m2",
        guildId: GUILD,
        module: "massChannelDelete",
        enabled: true,
        threshold: 2,
        windowSeconds: 10,
        punish: "kick",
        actions: ["kick"],
        whitelistRoles: [],
        // Không đặt timeoutSeconds → projection phải điền mặc định 300.
        heat: 10,
      },
    ],
    sessions: [{ _id: "s1", token: "tok", userId: "u1", createdAt: now, authVersion: 1 }],
    users: [
      {
        _id: "u1",
        discordId: USER_DISCORD,
        manageableGuildIds: [GUILD],
      },
    ],
  };
  const db = {
    get: async (id: string) =>
      Object.values(rows)
        .flat()
        .find((r) => r._id === id) ?? null,
    query: (table: string) => ({
      withIndex: (_name: string, bound: (q: any) => any) => {
        const capture: Record<string, unknown> = {};
        const q = {
          eq: (field: string, value: unknown) => {
            capture[field] = value;
            return q;
          },
        };
        bound(q);
        const list = (rows[table] ?? []).filter((r) =>
          Object.entries(capture).every(([field, value]) => r[field] === value),
        );
        return {
          first: async () => list[0] ?? null,
          collect: async () => list,
          order: () => ({
            take: async (n: number) => list.slice(0, n),
            first: async () => list[0] ?? null,
          }),
        };
      },
      collect: async () => rows[table] ?? [],
    }),
    insert: async () => "new-id",
    patch: async () => {},
    delete: async () => {},
    normalizeId: (_table: string, id: string) => id,
  };
  return { db };
}

(async () => {
  const ctx = makeCtx();
  const botCfgHandler = (getBotConfig as any)._handler;
  const getGuildHandler = (getGuild as any)._handler;

  const cfg = await botCfgHandler(ctx, { botKey: BOT_KEY, guildId: GUILD });
  const massBan = cfg?.modules?.find((m: any) => m.module === "massBan");
  const massChannelDelete = cfg?.modules?.find((m: any) => m.module === "massChannelDelete");
  check("getBotConfig trả logLang đã lưu (en)", cfg?.logLang === "en", cfg?.logLang);
  check(
    "getBotConfig trả timeoutSeconds admin đặt (600)",
    massBan?.timeoutSeconds === 600,
    massBan?.timeoutSeconds,
  );
  check(
    "getBotConfig điền mặc định 300 khi module chưa đặt timeoutSeconds",
    massChannelDelete?.timeoutSeconds === 300,
    massChannelDelete?.timeoutSeconds,
  );

  const res = await getGuildHandler(ctx, { token: "tok", guildId: GUILD });
  const dashMassBan = res?.modules?.find((m: any) => m.module === "massBan");
  check(
    "getGuild (dashboard) trả timeoutSeconds admin đặt (600)",
    dashMassBan?.timeoutSeconds === 600,
    dashMassBan?.timeoutSeconds,
  );
  check(
    "getGuild (dashboard) trả logLang đã lưu (en)",
    res?.guild?.logLang === "en",
    res?.guild?.logLang,
  );

  console.log(`\nKết quả config projections: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
