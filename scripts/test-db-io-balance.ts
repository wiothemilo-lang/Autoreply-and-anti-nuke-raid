// TEST: cân bằng Database I/O cho 2 function nóng nhất của project (Convex
// Usage 10/10/2026: bot_writes.botRecordMetrics 1.61GB + guilds.getBotConfig
// 968MB trong 9 ngày — tổng ~94% Database I/O).
//
// Chạy: bun scripts/test-db-io-balance.ts
//
//   1. botRecordMetrics — mỗi lượt đẩy 5 phút từng collect() TOÀN bộ ~576 dòng
//      sample chỉ để đếm và dọn >576 (288 lượt/ngày ≈ 165K dòng đọc ≈ 179MB/ngày).
//      Fix: đếm sẵn `sampleCount` trên row `latest`, dọn O(1) — mỗi lượt đọc
//      đúng phần vượt trần (thường 1 dòng) + đếm lại toàn bảng mỗi 24h.
//   2. botReportDmError — ghi lỗi DM nhưng GIỮ cờ dmRequested → guild bị lỗi
//      DM vĩnh viễn (user tắt DM) kẹt nhánh TTL 30s trong getConfig mãi mãi
//      + bot gửi lại mỗi tick (≈968MB/9 ngày). Fix: ghi lỗi = trạng thái kết
//      thúc, TẮT cờ; admin gửi lại qua requestDm.
//
// Cổng chống tái diễn chính: ĐẾM số dòng trả về trong 1 lượt steady-state và
// chặn trần — code cũ (collect ~576 dòng) FAIL cổng này ngay.
import { botRecordMetricsHandler } from "../convex/bot_writes/metrics";
import { botReportDmError } from "../convex/hidden";
import { computeBotKey } from "../convex/botAuth";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean) => {
  console.log(ok ? `  ✅ ${label}` : `  ❌ ${label}`);
  if (ok) pass++;
  else fail++;
};

type Row = Record<string, any>;

const BOT_KEY = "khoa-bot-32-bytes-toi-day";
const GUILD = "111111111111111111";
const CAP = 576;
const dmReport = (botReportDmError as any)._handler;

/** Sắp theo `at` — mô phỏng thứ tự của index by_kind_at (kind, at). */
function sorted(rows: Row[], dir?: "asc" | "desc"): Row[] {
  const out = [...rows].sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0));
  return dir === "desc" ? out.reverse() : out;
}

/** View kết quả truy vấn — ĐẾM số dòng trả về (onRead) làm cổng I/O. */
function makeView(rows: Row[], onRead: (n: number) => void) {
  const v: any = {
    order: (dir: "asc" | "desc") => makeView(sorted(rows, dir), onRead),
    collect: async () => {
      onRead(rows.length);
      return [...rows];
    },
    first: async () => {
      onRead(rows.length ? 1 : 0);
      return rows[0] ?? null;
    },
    take: async (n: number) => {
      const out = rows.slice(0, n);
      onRead(out.length);
      return out;
    },
    unique: async () => {
      onRead(rows.length);
      if (rows.length > 1) throw new Error("duplicate rows");
      return rows[0] ?? null;
    },
    filter: () => v,
  };
  return v;
}

/**
 * ctx giả trong bộ nhớ: query/insert/patch/delete chạy thật trên mảng row,
 * kèm bộ đếm `reads.rows` = tổng số dòng TRẢ VỀ cho caller (tương đương số dòng
 * Convex phải đọc qua index).
 */
function makeCtx(tables: Record<string, Row[]> = {}) {
  const t: Record<string, Row[]> = {
    botStatus: [{ _id: "st", kind: "status", botKeySeed: computeBotKey(BOT_KEY), online: true }],
    guilds: [],
    botMetrics: [],
    ...tables,
  };
  const reads = { rows: 0 };
  const onRead = (n: number) => {
    reads.rows += n;
  };
  let seq = 0;
  const db = {
    query: (table: string) => {
      const rows = t[table] ?? [];
      const builder: any = {
        withIndex: (_name: string, bound: (q: any) => any) => {
          const cap: Record<string, any> = {};
          const q: any = {
            eq: (f: string, val: any) => ((cap[f] = val), q),
            gte: (f: string, val: any) => ((cap[f] = val), q),
            lt: (f: string, _val: any) => q,
            field: (f: string) => f,
          };
          bound(q);
          const filtered = rows.filter((r) => Object.entries(cap).every(([k, v]) => r[k] === v));
          return makeView(filtered, onRead);
        },
        filter: () => makeView(rows, onRead),
        order: (dir: "asc" | "desc") => makeView(sorted(rows, dir), onRead),
        ...makeView(rows, onRead),
      };
      return builder;
    },
    get: async (id: string) =>
      Object.values(t)
        .flat()
        .find((r) => r._id === id) ?? null,
    insert: async (table: string, doc: Row) => {
      seq += 1;
      const id = `${table}-${seq}`;
      (t[table] ||= []).push({ _id: id, ...doc });
      return id;
    },
    patch: async (id: string, patch: Row) => {
      const row = Object.values(t)
        .flat()
        .find((r) => r._id === id);
      if (row) for (const [k, val] of Object.entries(patch)) row[k] = val;
    },
    delete: async (id: string) => {
      for (const rows of Object.values(t)) {
        const i = rows.findIndex((r) => r._id === id);
        if (i >= 0) rows.splice(i, 1);
      }
    },
  };
  return { ctx: { db } as any, tables: t, reads };
}

const samples = (n: number, startAt = 1_700_000_000_000): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    _id: `s${i}`,
    kind: "sample",
    at: startAt + i,
    counters: {},
    gauges: { rss: 100 + i },
    histograms: {},
  }));

const payload = (at: number) => ({ at, counters: {}, gauges: { rss: 1 }, histograms: {} });
const METRICS = botRecordMetricsHandler as any as (
  ctx: any,
  args: any,
) => Promise<{ ok: boolean; at: number }>;

// ─────────────────────────────────────────────────────────────
console.log("── botRecordMetrics: cổng botKey ──");
{
  const { ctx, tables } = makeCtx();
  let threw = false;
  try {
    await METRICS(ctx, { ...payload(Date.now()), botKey: "key-sai" });
  } catch {
    threw = true;
  }
  check("botKey sai → từ chối", threw);
  check("từ chối TRƯỚC khi ghi (botMetrics rỗng)", tables.botMetrics.length === 0);
}

console.log("── botRecordMetrics: bảng mới → đếm 1 mẫu ──");
{
  const { ctx, tables } = makeCtx();
  const at = Date.now();
  await METRICS(ctx, { ...payload(at), botKey: BOT_KEY });
  const latest = tables.botMetrics.find((r) => r.kind === "latest");
  const sampleRows = tables.botMetrics.filter((r) => r.kind === "sample");
  check("tạo đúng 1 latest + 1 sample", !!latest && sampleRows.length === 1);
  check(
    "sampleCount = 1 và ghi thời điểm đếm lại",
    latest?.sampleCount === 1 && latest?.sampleCountAt === at,
  );
}

console.log("── botRecordMetrics: steady-state TRÊN trần → O(1) đọc, giữ đúng 576 ──");
{
  const at = 1_800_000_000_000;
  const { ctx, tables, reads } = makeCtx({
    botMetrics: [
      ...samples(CAP, at - CAP * 5 * 60_000),
      {
        _id: "latest",
        kind: "latest",
        at: at - 5 * 60_000,
        counters: {},
        gauges: {},
        histograms: {},
        sampleCount: CAP,
        sampleCountAt: at - 60_000,
      },
    ],
  });
  await METRICS(ctx, { ...payload(at), botKey: BOT_KEY });
  const latest = tables.botMetrics.find((r) => r.kind === "latest");
  const sampleRows = tables.botMetrics.filter((r) => r.kind === "sample");
  check(`1 lượt đẩy đọc ≤ 12 dòng (đo được ${reads.rows}) — code cũ đọc ≥ 577`, reads.rows <= 12);
  check("lịch sử bị trần đúng 576 (xoá mẫu cũ nhất)", sampleRows.length === CAP);
  check("sampleCount trên latest = 576", latest?.sampleCount === CAP);
  check(
    "mẫu mới nhất chính là lượt vừa đẩy",
    sampleRows.some((r) => r.at === at),
  );
  check(
    "không đếm lại khi còn trong 24h (sampleCountAt giữ nguyên)",
    latest?.sampleCountAt === at - 60_000,
  );
}

console.log("── botRecordMetrics: đếm lại tự chữa sai số (24h một lần) ──");
{
  const at = 1_800_000_000_000;
  const { ctx, tables } = makeCtx({
    botMetrics: [
      // count lưu = 0 (lệch nặng) trong khi lịch sử THẬT đầy 576 dòng.
      ...samples(CAP, at - CAP * 5 * 60_000),
      {
        _id: "latest",
        kind: "latest",
        at: at - 5 * 60_000,
        counters: {},
        gauges: {},
        histograms: {},
        sampleCount: 0,
        sampleCountAt: at - 25 * 60 * 60_000,
      },
    ],
  });
  await METRICS(ctx, { ...payload(at), botKey: BOT_KEY });
  const latest = tables.botMetrics.find((r) => r.kind === "latest");
  const sampleRows = tables.botMetrics.filter((r) => r.kind === "sample");
  check("count lệch 0 → đếm lại ra đúng trần 576", latest?.sampleCount === CAP);
  check("lịch sử thật sau push = 576 (không phình, không sập)", sampleRows.length === CAP);
  check("thời điểm đếm lại được làm mới", latest?.sampleCountAt === at);
}

// ─────────────────────────────────────────────────────────────
console.log("── botReportDmError: cổng botKey ──");
{
  const { ctx, tables } = makeCtx({
    guilds: [{ _id: "g1", discordId: GUILD, dmRequested: true, dmMessage: "xin chào" }],
  });
  let threw = false;
  try {
    await dmReport(ctx, { guildId: GUILD, error: "Cannot send", botKey: "key-sai" });
  } catch {
    threw = true;
  }
  const g = tables.guilds[0];
  check("botKey sai → từ chối", threw);
  check("guild không bị đụng tới", g.dmRequested === true && g.dmError === undefined);
}

console.log("── botReportDmError: ghi lỗi = tắt cờ (hết vòng retry 30s) ──");
{
  const { ctx, tables } = makeCtx({
    guilds: [
      {
        _id: "g1",
        discordId: GUILD,
        dmRequested: true,
        dmTargetUserId: "U1",
        dmTargetUsername: "user",
        dmMessage: "xin chào",
        updatedAt: 1,
      },
    ],
  });
  const res = await dmReport(ctx, {
    guildId: GUILD,
    error: "Cannot send messages",
    botKey: BOT_KEY,
  });
  const g = tables.guilds[0];
  check("trả { ok: true }", res?.ok === true);
  check(
    "dmRequested bị TẮT (guild thoát nhánh TTL 30s, bot hết gửi lại mỗi tick)",
    g.dmRequested === false,
  );
  check(
    "dmError + dmErrorAt được ghi cho dashboard",
    g.dmError === "Cannot send messages" && typeof g.dmErrorAt === "number",
  );
  check(
    "giữ target/message làm bối cảnh lỗi (admin gửi lại qua requestDm)",
    g.dmTargetUserId === "U1" && g.dmMessage === "xin chào",
  );
}

console.log("── botReportDmError: guild không tồn tại → không ném ──");
{
  const { ctx } = makeCtx();
  const res = await dmReport(ctx, { guildId: "9999", error: "x", botKey: BOT_KEY });
  check("guild lạ → { ok: true }", res?.ok === true);
}

console.log(`\n${pass}/${pass + fail} ✅`);
process.exit(fail > 0 ? 1 : 0);
