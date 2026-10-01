// TEST: trần số dòng của 3 bảng log (antinukeEvents 800 · modActions 100 ·
// memberJoins 500 mỗi server) — `botRecordAntinukeEvent`, `botRecordModAction`,
// `recordJoin`.
//
// Chạy: bun scripts/test-retention-caps.ts
//
// Vì sao test: retention cũ cổng theo `Date.now() % 240_000 < 2000` (~0,8% lượt
// ghi) và mỗi lần chỉ xoá tối đa 1 dòng → ~99% dòng ghi vào sống mãi, không có
// cron nào dọn thay: bảng phình vô hạn, `getAltStats` (collect 7 ngày join) có
// thể vượt giới hạn đọc của Convex. Test khoá 3 tính chất:
//   1. BỊ CHẶN: ghi đều đặn hàng nghìn dòng thì bảng không vượt trần + ~TRIM_ODDS.
//   2. HỘI TỤ: bảng tồn đọng từ bản cũ (hàng nghìn dòng) co dần về trần.
//   3. AN TOÀN: chỉ xoá dòng CŨ NHẤT của ĐÚNG server đó, không đụng dòng mới.
import {
  botRecordAntinukeEvent,
  botRecordModAction,
  TRIM_BATCH,
  TRIM_ODDS,
} from "../convex/bot_writes";
import { recordJoin } from "../convex/altDetection";
import { computeBotKey } from "../convex/botAuth";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "  ✅" : "  ❌"} ${label}${ok || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`,
  );
  if (ok) pass++;
  else fail++;
};

type Row = Record<string, any>;
const BOT_KEY = "khoa-bot-32-bytes-toi-day";
// ID server giả, KHÔNG dùng chuỗi 18 chữ số kiểu snowflake: gitleaks (job security của CI)
// coi đó là Discord client id và làm đỏ cả commit (xem b84af3c).
const GUILD = "g-retention-main";
const OTHER = "g-retention-other";

/** ctx giả trong bộ nhớ: insert/delete/query(...).withIndex(eq).order().take()/collect()/first(). */
function makeCtx(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {
    antinukeEvents: [],
    modActions: [],
    memberJoins: [],
    guilds: [{ _id: "gd", discordId: GUILD, modCaseCounter: 0 }],
    botStatus: [{ _id: "st", kind: "status", botKeySeed: computeBotKey(BOT_KEY), online: true }],
    ...seed,
  };
  let seq = 0;
  const view = (rows: Row[], desc = false): any => {
    const ordered = () => (desc ? [...rows].reverse() : [...rows]);
    return {
      order: (dir: string) => view(rows, dir === "desc"),
      take: async (n: number) => ordered().slice(0, n),
      collect: async () => ordered(),
      first: async () => ordered()[0] ?? null,
    };
  };
  const db = {
    insert: async (table: string, doc: Row) => {
      const id = `${table}-${++seq}`;
      (tables[table] ||= []).push({ _id: id, ...doc });
      return id;
    },
    delete: async (id: string) => {
      for (const rows of Object.values(tables)) {
        const i = rows.findIndex((r) => r._id === id);
        if (i >= 0) rows.splice(i, 1);
      }
    },
    patch: async (id: string, p: Row) => {
      for (const rows of Object.values(tables)) {
        const r = rows.find((x) => x._id === id);
        if (r) Object.assign(r, p);
      }
    },
    query: (table: string) => ({
      withIndex: (_n: string, bound: (q: any) => any) => {
        const cap: Record<string, unknown> = {};
        const q: any = { eq: (f: string, v: unknown) => ((cap[f] = v), q) };
        bound(q);
        return view(
          (tables[table] ?? []).filter((r) => Object.entries(cap).every(([k, v]) => r[k] === v)),
        );
      },
      ...view(tables[table] ?? []),
    }),
  };
  return { ctx: { db } as any, tables };
}

const SITES = [
  {
    name: "antinukeEvents (trần 800)",
    cap: 800,
    table: "antinukeEvents",
    handler: (botRecordAntinukeEvent as any)._handler,
    // count khác nhau mỗi lượt để không dính dedupe 5 giây của mutation.
    args: (i: number, guildId = GUILD) => ({
      guildId,
      module: "massBan",
      executorId: "u",
      action: "x",
      count: i,
      windowSeconds: 10,
      threshold: 3,
      punish: "ban",
      botKey: BOT_KEY,
    }),
  },
  {
    name: "modActions (trần 100)",
    cap: 100,
    table: "modActions",
    handler: (botRecordModAction as any)._handler,
    args: (i: number, guildId = GUILD) => ({ guildId, action: `a${i}`, botKey: BOT_KEY }),
  },
  {
    name: "memberJoins (trần 500)",
    cap: 500,
    table: "memberJoins",
    handler: (recordJoin as any)._handler,
    args: (i: number, guildId = GUILD) => ({
      guildId,
      userId: `u${i}`,
      username: "n",
      createdAt: 1,
      riskScore: 0,
      riskFactors: [],
      botKey: BOT_KEY,
    }),
  },
];

const realRandom = Math.random;
/** Math.random giả: đúng 1 lượt trong mỗi TRIM_ODDS lượt rơi vào cổng dọn. */
const cadence = () => {
  let n = 0;
  return () => (n++ % TRIM_ODDS === 0 ? 0 : 0.5);
};
const seedRows = (table: string, n: number, guildId = GUILD): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    _id: `seed-${table}-${guildId}-${i}`,
    guildId,
    seq: i,
    createdAt: i,
    joinedAt: i,
  }));

for (const site of SITES) {
  console.log(`\n── ${site.name} ──`);

  // 1. BỊ CHẶN: ghi đều 4×cap dòng, cổng dọn đúng nhịp 1/TRIM_ODDS.
  {
    const { ctx, tables } = makeCtx();
    Math.random = cadence();
    let max = 0;
    const total = site.cap * 4;
    for (let i = 0; i < total; i++) {
      await site.handler(ctx, site.args(i));
      max = Math.max(max, tables[site.table].filter((r) => r.guildId === GUILD).length);
    }
    Math.random = realRandom;
    const final = tables[site.table].filter((r) => r.guildId === GUILD).length;
    check(
      `ghi ${total} dòng: bảng không bao giờ vượt trần + ${TRIM_ODDS} (đỉnh ${max})`,
      max <= site.cap + TRIM_ODDS,
      { max, cap: site.cap },
    );
    check(`cuối cùng ≥ trần (không xoá quá tay): ${final}`, final >= site.cap);
  }

  // 2. HỘI TỤ: tồn đọng từ bản cũ co dần về trần, mỗi lần dọn đúng 1 lô.
  {
    const backlog = site.cap + 1100;
    const { ctx, tables } = makeCtx({ [site.table]: seedRows(site.table, backlog) });
    Math.random = () => 0; // cổng dọn luôn mở
    await site.handler(ctx, site.args(0));
    const afterOne = tables[site.table].length;
    check(
      `tồn đọng ${backlog}: một lần dọn xoá đúng ${TRIM_BATCH} dòng cũ nhất`,
      afterOne === backlog + 1 - TRIM_BATCH,
      afterOne,
    );
    let calls = 1;
    while (tables[site.table].length > site.cap && calls < 100) {
      await site.handler(ctx, site.args(calls++));
    }
    Math.random = realRandom;
    check(`hội tụ về ≤ trần sau ${calls} lần dọn`, tables[site.table].length <= site.cap + 1, {
      len: tables[site.table].length,
      calls,
    });
  }

  // 3. AN TOÀN: chỉ xoá dòng cũ nhất của đúng server; dòng mới nhất giữ nguyên.
  {
    const { ctx, tables } = makeCtx({
      [site.table]: [
        ...seedRows(site.table, site.cap + 30, GUILD),
        ...seedRows(site.table, 50, OTHER),
      ],
    });
    Math.random = () => 0;
    await site.handler(ctx, site.args(0));
    Math.random = realRandom;
    const mine = tables[site.table].filter((r) => r.guildId === GUILD);
    const other = tables[site.table].filter((r) => r.guildId === OTHER);
    check("server khác giữ nguyên 100% dòng", other.length === 50, other.length);
    check("server này về đúng trần", mine.length === site.cap, mine.length);
    const seeded = mine.filter((r) => typeof r.seq === "number").map((r) => r.seq);
    // Tổng cap+31 dòng (cap+30 cũ + 1 mới) → xoá đúng 31 dòng cũ nhất: seq 0..30.
    check(
      "dòng bị xoá là đúng 31 dòng CŨ NHẤT (seq 0..30); dòng mới ghi vẫn còn",
      seeded.length === site.cap - 1 &&
        Math.min(...seeded) === 31 &&
        mine.some((r) => r.seq === undefined),
      { kept: seeded.length, minSeq: Math.min(...seeded) },
    );
  }

  // 4. Cổng đóng: không dọn gì, không đọc thêm.
  {
    const { ctx, tables } = makeCtx({ [site.table]: seedRows(site.table, site.cap + 30) });
    Math.random = () => 0.999;
    await site.handler(ctx, site.args(0));
    Math.random = realRandom;
    check(
      "cổng dọn đóng → không xoá dòng nào",
      tables[site.table].length === site.cap + 30 + 1,
      tables[site.table].length,
    );
  }
}

console.log(`\n${pass}/${pass + fail} ✅`);
process.exit(fail > 0 ? 1 : 0);
