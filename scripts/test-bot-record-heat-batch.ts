// TEST: bot_writes:botRecordHeatBatch — ghi nhiệt độ + warn tích luỹ HÀNG LOẠT.
//
// Chạy: bun scripts/test-bot-record-heat-batch.ts
//
// Vì sao cần test: đây là ĐƯỜNG GHI NHIỆT CHÍNH của bot (mọi lượt flush
// 15 giây gom toàn bộ thành viên đang nóng của 1 guild vào đây thay vì N
// mutation riêng lẻ). Sai ở đây thì hệ quả nặng theo hai chiều:
//   · BỎ SÓT → dashboard hiển thị nhiệt sai, ngưỡng phạt tính sai.
//   · BỊA SỐ → ghi nhiệt cho người KHÔNG có vi phạm, tức phạt oang.
//
// Ba lớp rủi ro test này khoá:
//   1. Cổng quyền: mutation bảo mật cao, thiếu/sai botKey thì phải từ chối
//      TRƯỚC khi ghi bất kỳ dòng nào.
//   2. upsert: có bản ghi thì patch, chưa có thì insert, và KHÔNG tạo trùng.
//   3. Biên số: heat âm/0/lớn vô hạn và warnStrikes âm — mọi giá trị rác từ
//      bot phải bị chặn lại ở đây vì bảng này quyết định ai bị phạt.
//
// LƯU Ý: hàm này nằm trong convex/bot_writes.ts (không có file
// convex/bot_record_heat.ts riêng) — test import từ đúng nơi thật.
import { botRecordHeatBatch } from "../convex/bot_writes";
import { computeBotKey } from "../convex/botAuth";
import { getBotConfig } from "../convex/guilds";
import { heatLeaderboard } from "../convex/reports";

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
const handler = (botRecordHeatBatch as any)._handler;

/** ctx giả trong bộ nhớ: query/patch/insert/delete có đủ để upsert chạy. */
function makeCtx(heatRows: Row[] = [], extra: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = { heatStates: heatRows, botStatus: [], ...extra };
  tables.botStatus.push({
    _id: "st",
    kind: "status",
    botKeySeed: computeBotKey(BOT_KEY),
    online: true,
  });
  let seq = 0;
  const db = {
    query: (table: string) => {
      const rows = tables[table] ?? [];
      const builder: any = {
        withIndex: (_n: string, bound: (q: any) => any) => {
          const cap: Record<string, any> = {};
          const q = { eq: (f: string, v: any) => ((cap[f] = v), q), field: (f: string) => f };
          bound(q);
          return makeView(rows.filter((r) => Object.entries(cap).every(([k, v]) => r[k] === v)));
        },
        ...makeView(rows),
      };
      return builder;
    },
    get: async (id: string) =>
      Object.values(tables)
        .flat()
        .find((r) => r._id === id) ?? null,
    patch: async (id: string, patch: any) => {
      const row = tables.heatStates.find((r) => r._id === id);
      if (row) Object.assign(row, patch);
    },
    insert: async (table: string, doc: any) => {
      seq += 1;
      const id = `${table}-${seq}`;
      (tables[table] ||= []).push({ _id: id, ...doc });
      return id;
    },
    delete: async (id: string) => {
      const i = tables.heatStates.findIndex((r) => r._id === id);
      if (i >= 0) tables.heatStates.splice(i, 1);
    },
  };
  return { ctx: { db } as any, tables };
}

function makeView(rows: Row[]) {
  const view: any = {
    collect: async () => rows,
    take: async (n: number) => rows.slice(0, n),
    first: async () => rows[0] ?? null,
    order: () => view,
    filter: () => view,
  };
  return view;
}

const entry = (o: Partial<Row> = {}) => ({
  userId: "u1",
  username: "raider",
  heat: 50,
  updatedAt: 1_700_000_000_000,
  ...o,
});

// ─────────────────────────────────────────────────────────────
console.log("── Cổng quyền: bảo mật cao, phải chặn trước khi ghi ──");
{
  const { ctx, tables } = makeCtx();
  let threw = false;
  try {
    await handler(ctx, { guildId: GUILD, entries: [entry()], botKey: "key-sai" });
  } catch {
    threw = true;
  }
  check("botKey sai → bị từ chối", threw);
  check("bị từ chối thì KHÔNG ghi dòng nào", tables.heatStates.length === 0);

  const t2 = makeCtx();
  let threw2 = false;
  try {
    await handler(t2.ctx, { guildId: GUILD, entries: [entry()] });
  } catch {
    threw2 = true;
  }
  check("thiếu botKey hoàn toàn → bị từ chối", threw2);
  check("không ghi gì khi thiếu botKey", t2.tables.heatStates.length === 0);
}

// ─────────────────────────────────────────────────────────────
console.log("\n── Ghi mới (chưa có bản ghi) ──");
{
  const { ctx, tables } = makeCtx();
  const r = await handler(ctx, {
    guildId: GUILD,
    entries: [entry({ userId: "u1", username: "a", heat: 30, warnStrikes: 1 })],
    botKey: BOT_KEY,
  });
  check("trả ok + count = số entry nhận", r.ok === true && r.count === 1);
  check("tạo đúng 1 dòng heatStates", tables.heatStates.length === 1);
  const row = tables.heatStates[0];
  check("dòng mới mang guildId/userId đúng", row.guildId === GUILD && row.userId === "u1");
  check("ghi nhiệt và warnStrikes", row.heat === 30 && row.warnStrikes === 1);
  check("giữ tên người dùng", row.username === "a");
}

console.log("\n── Batch nhiều người trong 1 lần gọi ──");
{
  const { ctx, tables } = makeCtx();
  const r = await handler(ctx, {
    guildId: GUILD,
    entries: [
      entry({ userId: "u1", username: "a", heat: 10, warnStrikes: 0 }),
      entry({ userId: "u2", username: "b", heat: 20, warnStrikes: 2 }),
      entry({ userId: "u3", username: "c", heat: 99, warnStrikes: 5 }),
    ],
    botKey: BOT_KEY,
  });
  check("trả count = 3", r.count === 3);
  check("tạo đủ 3 dòng", tables.heatStates.length === 3);
  check(
    "mỗi dòng đúng nhiệt của riêng nó (không trộn lẫn)",
    tables.heatStates
      .map((x) => x.userId + ":" + x.heat)
      .sort()
      .join(",") === "u1:10,u2:20,u3:99",
  );
}

console.log("\n── Có bản ghi sẵn: patch, KHÔNG tạo dòng thứ hai ──");
{
  const { ctx, tables } = makeCtx([
    {
      _id: "h1",
      guildId: GUILD,
      userId: "u1",
      username: "tên-cũ",
      heat: 10,
      updatedAt: 1,
      warnStrikes: 0,
    },
  ]);
  await handler(ctx, {
    guildId: GUILD,
    entries: [entry({ userId: "u1", username: "tên-mới", heat: 80, warnStrikes: 3 })],
    botKey: BOT_KEY,
  });
  check("vẫn chỉ có 1 dòng (không tạo trùng)", tables.heatStates.length === 1);
  check(
    "cập nhật nhiệt + warnStrikes",
    tables.heatStates[0].heat === 80 && tables.heatStates[0].warnStrikes === 3,
  );
  check("đổi tên khi có tên mới", tables.heatStates[0].username === "tên-mới");

  // Không gửi tên → phải GIỮ tên cũ, không ghi đè bằng chuỗi rỗng.
  await handler(ctx, {
    guildId: GUILD,
    entries: [entry({ userId: "u1", username: undefined, heat: 85 })],
    botKey: BOT_KEY,
  });
  check(
    "không gửi username → giữ tên cũ (không mất danh tính)",
    tables.heatStates[0].username === "tên-mới",
  );
}

console.log("\n── Dọn hàng: nhiệt 0 VÀ không còn warn → xoá ──");
{
  const { ctx, tables } = makeCtx([
    {
      _id: "h1",
      guildId: GUILD,
      userId: "u1",
      username: "a",
      heat: 5,
      updatedAt: 1,
      warnStrikes: 0,
    },
  ]);
  await handler(ctx, {
    guildId: GUILD,
    entries: [entry({ userId: "u1", heat: 0, warnStrikes: 0 })],
    botKey: BOT_KEY,
  });
  check("nhiệt về 0 + hết warn → xoá hàng (bảng không phình)", tables.heatStates.length === 0);

  // Chưa có bản ghi mà gửi 0/0 → không được tạo hàng rác.
  const t2 = makeCtx();
  await handler(t2.ctx, {
    guildId: GUILD,
    entries: [entry({ userId: "u9", heat: 0, warnStrikes: 0 })],
    botKey: BOT_KEY,
  });
  check("gửi 0/0 cho người chưa có hàng → KHÔNG tạo hàng rác", t2.tables.heatStates.length === 0);
}

console.log("\n── BUG: nhiệt 0 nhưng còn warn tích luỹ ──");
// Người dùng bị warn 3 lần nhưng nhiệt đã tụt về 0. Bản ghi phải GIỮ NHIỆT 0
// và chỉ giữ warnStrikes — vì nhiệt là thước đo VI PHẠM, warn tích luỹ là thước
// đo LỊCH SỬ. Ghi nhiệt giả (kể cả chỉ bằng 1) thì:
//   · dashboard hiện thành viên "đang nóng" dù họ không vi phạm;
//   · tierFor() xếp họ vào bậc cao hơn mức thật;
//   · chính bot đọc lại giá trị đó lúc restart → phạt nhầm.
{
  const { ctx, tables } = makeCtx();
  await handler(ctx, {
    guildId: GUILD,
    entries: [entry({ userId: "u1", heat: 0, warnStrikes: 3 })],
    botKey: BOT_KEY,
  });
  const row = tables.heatStates[0];
  check("hàng được tạo (vì còn warn tích luỹ)", !!row);
  check("warnStrikes được giữ", row?.warnStrikes === 3);
  check("nhiệt phải là 0 — KHÔNG bị làm thành 1 (bịa số vi phạm)", row?.heat === 0);

  // Cùng trường hợp nhưng đã có hàng sẵn (đường patch) — cũng phải giữ 0.
  const t2 = makeCtx([
    {
      _id: "h1",
      guildId: GUILD,
      userId: "u1",
      username: "a",
      heat: 0,
      updatedAt: 1,
      warnStrikes: 1,
    },
  ]);
  await handler(t2.ctx, {
    guildId: GUILD,
    entries: [entry({ userId: "u1", heat: 0, warnStrikes: 4 })],
    botKey: BOT_KEY,
  });
  check("đường patch: nhiệt 0 vẫn là 0", t2.tables.heatStates[0].heat === 0);
  check("đường patch: warnStrikes cập nhật", t2.tables.heatStates[0].warnStrikes === 4);
}

console.log("\n── Chặn giá trị rác từ bot ──");
{
  const { ctx, tables } = makeCtx();
  await handler(ctx, {
    guildId: GUILD,
    entries: [
      entry({ userId: "neg", heat: -50, warnStrikes: 0 }), // nhiệt âm + không warn → xoá/không tạo
      entry({ userId: "bignum", heat: 9_999, warnStrikes: 0 }),
      entry({ userId: "frac", heat: 42.6, warnStrikes: 0 }),
      entry({ userId: "tiny", heat: 0.4, warnStrikes: 2 }),
      entry({ userId: "negstrike", heat: 55, warnStrikes: -3 }),
    ],
    botKey: BOT_KEY,
  });
  const get = (id: string) => tables.heatStates.find((r) => r.userId === id);
  check("nhiệt âm + không warn → KHÔNG tạo hàng", get("neg") === undefined);
  check("nhiệt trên trần 100 → chặn về 100", get("bignum")?.heat === 100);
  check("nhiệt phân thập → làm tròn", get("frac")?.heat === 43);
  check("nhiệt 0.4 có warn → giữ 0, không nhảy lên 1", get("tiny")?.heat === 0);
  check("warnStrikes âm → chặn về 0", get("negstrike")?.warnStrikes === 0);
  check(
    "mọi nhiệt ghi ra đều nằm trong [0, 100]",
    tables.heatStates.every((r) => r.heat >= 0 && r.heat <= 100),
  );
  check(
    "mọi warnStrikes ghi ra đều >= 0",
    tables.heatStates.every((r) => (r.warnStrikes ?? 0) >= 0),
  );
}

console.log("\n── Cùng userId lặp trong một batch ──");
{
  const { ctx, tables } = makeCtx();
  await handler(ctx, {
    guildId: GUILD,
    entries: [
      entry({ userId: "u1", heat: 20, warnStrikes: 0 }),
      entry({ userId: "u1", heat: 70, warnStrikes: 2 }),
    ],
    botKey: BOT_KEY,
  });
  const rows = tables.heatStates.filter((r) => r.userId === "u1");
  check("KHÔNG tạo 2 hàng cho cùng một userId", rows.length === 1);
  check("entry CUỐI thắng (nhiệt mới nhất)", rows[0]?.heat === 70 && rows[0]?.warnStrikes === 2);
}

console.log("\n── Batch rỗng ──");
{
  const { ctx, tables } = makeCtx();
  const r = await handler(ctx, { guildId: GUILD, entries: [], botKey: BOT_KEY });
  check(
    "batch rỗng → ok, count 0, không ghi gì",
    r.ok === true && r.count === 0 && tables.heatStates.length === 0,
  );
}

console.log("\n── Tách guild: nhiệt không lẫn sang server khác ──");
{
  const { ctx, tables } = makeCtx([
    {
      _id: "h1",
      guildId: "222222222222222222",
      userId: "u1",
      username: "x",
      heat: 70,
      updatedAt: 1,
      warnStrikes: 0,
    },
  ]);
  await handler(ctx, {
    guildId: GUILD,
    entries: [entry({ userId: "u1", heat: 10 })],
    botKey: BOT_KEY,
  });
  const other = tables.heatStates.find((r) => r.guildId === "222222222222222222");
  const mine = tables.heatStates.find((r) => r.guildId === GUILD);
  check("cùng userId ở guild khác vẫn giữ nguyên nhiệt", other?.heat === 70);
  check("guild của ta tạo hàng riêng", mine?.heat === 10);
  check("tổng 2 hàng, không ghi đè chéo", tables.heatStates.length === 2);
}

console.log("\n── Hợp đồng ĐỌC: heat + updatedAt luôn là một cặp nhất quán ──");
// Bug thật: bot ghi heat đã trừ decay + updatedAt cũ; loadHeatStates lại trừ decay
// lần nữa rồi trả updatedAt gốc, HeatBar (client) trừ lần thứ ba. Người đang nóng
// 30 hiện 0 và biến khỏi /heat top. Công thức client bên dưới phản chiếu
// HeatBar.effectiveHeat.
{
  const clientHeat = (h: { heat: number; updatedAt: number }, decay: number) =>
    Math.max(0, Math.round(h.heat - ((Date.now() - h.updatedAt) / 60000) * decay));
  const guildDoc = (o: Row = {}) => ({
    _id: "g-doc",
    discordId: GUILD,
    managers: [],
    heatDecayPerMin: 3,
    ...o,
  });
  const row = (o: Row = {}) => ({
    _id: "h1",
    guildId: GUILD,
    userId: "u1",
    username: "Alice",
    heat: 60,
    updatedAt: Date.now() - 10 * 60_000,
    warnStrikes: 0,
    ...o,
  });
  const botCfg = (getBotConfig as any)._handler;

  const a = makeCtx([row()], { guilds: [guildDoc()] });
  const cfg = await botCfg(a.ctx, { guildId: GUILD, botKey: BOT_KEY });
  const top = cfg.heatStates[0];
  check("hàng 60 nhiệt từ 10 phút trước, decay 3 → server trả 30", top?.heat === 30);
  check(
    "updatedAt trả về là mốc query (heat đúng TẠI mốc này), không phải mốc gốc của hàng",
    Math.abs(Date.now() - top.updatedAt) < 5_000,
  );
  check(
    "client trừ decay tiếp từ mốc trả về → vẫn 30, KHÔNG bị trừ lần nữa",
    clientHeat(top, 3) === 30,
  );
  check("safetyPercent tính từ nhiệt đã decay (100 - 30)", cfg.safetyPercent === 70);

  const cold = makeCtx([row({ heat: 20, updatedAt: Date.now() - 60 * 60_000 })], {
    guilds: [guildDoc()],
  });
  const coldCfg = await botCfg(cold.ctx, { guildId: GUILD, botKey: BOT_KEY });
  check("hàng đã nguội hẳn bị lọc khỏi danh sách", coldCfg.heatStates.length === 0);

  const slow = makeCtx([row()], { guilds: [guildDoc({ heatDecayPerMin: 0 })] });
  const slowCfg = await botCfg(slow.ctx, { guildId: GUILD, botKey: BOT_KEY });
  check("guild decay 0: nhiệt không tự giảm (vẫn 60)", slowCfg.heatStates[0]?.heat === 60);

  const lb = (heatLeaderboard as any)._handler;
  const dash = (decay: number | undefined) =>
    makeCtx([row({ heat: 40 })], {
      guilds: [
        guildDoc(decay === undefined ? { heatDecayPerMin: undefined } : { heatDecayPerMin: decay }),
      ],
      sessions: [{ token: "tok", createdAt: Date.now(), authVersion: 1, userId: "u1" }],
      users: [{ _id: "u1", discordId: "d1", manageableGuildIds: [GUILD] }],
    });
  const rows0 = await lb(dash(0).ctx, { token: "tok", guildId: GUILD });
  check("bảng xếp hạng trả kèm decay thật của guild (0)", rows0?.[0]?.decayPerMin === 0);
  const rowsDef = await lb(dash(undefined).ctx, { token: "tok", guildId: GUILD });
  check("guild chưa cấu hình decay → trả mặc định 3", rowsDef?.[0]?.decayPerMin === 3);
  const denied = await lb(dash(3).ctx, { token: "sai", guildId: GUILD });
  check("token sai → null, không lộ dữ liệu", denied === null);
}

console.log(`\n${pass}/${pass + fail} ✅`);
process.exit(fail > 0 ? 1 : 0);
