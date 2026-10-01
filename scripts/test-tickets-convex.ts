// TEST: convex/tickets.ts — lớp dữ liệu phía dashboard (list/summary/close)
// + 2 query bot đọc (botTicketState, botTicketById). Chạy: bun scripts/test-tickets-convex.ts
//
// Vì sao cần: đợt trước toàn bộ 5 function này có 0% coverage, mà chúng là
// nơi quyết định ba thứ bảo mật:
//   1. THỨ TỰ. `order("desc")` trên index chỉ đảo theo field CUỐI của index.
//      Index `by_guildId_status` / `by_guildId_openerId` có field cuối CỐ ĐỊNH
//      (status / openerId) → `order("desc")` KHÔNG bảo đảm "mới nhất trước".
//      Hậu quả thật: cooldown tính nhầm (phạt oan), "bạn đã có ticket mở" bị
//      bypass, danh sách dashboard lệch thứ tự.
//   2. QUYỀN: không manage guild thì không đọc/đóng được ticket của server đó.
//   3. BOT KEY: query bot từ chối khi thiếu/sai key (requireBotKeyStrict).
import {
  listTickets,
  ticketSummary,
  ticketStats,
  closeTicket,
  botTicketState,
  botTicketById,
  ticketTranscript,
  ticketTranscriptUrl,
} from "../convex/tickets";
import {
  botOpenTicket,
  botCloseTicket,
  botSetTicketChannel,
  botClaimTicket,
  botMarkTicketChannelClosed,
  botTouchTickets,
} from "../convex/bot_writes";
import { updateSettings } from "../convex/guilds";
import {
  listKinds,
  saveKind,
  removeKind,
  setKindEnabled,
  swapKindOrder,
  botKinds,
  MAX_KINDS,
  MAX_EXTRA_FIELDS,
} from "../convex/ticketKinds";
import { computeBotKey } from "../convex/botAuth";

const listH = (listTickets as any)._handler;
const summaryH = (ticketSummary as any)._handler;
const statsH = (ticketStats as any)._handler;
const closeH = (closeTicket as any)._handler;
const stateH = (botTicketState as any)._handler;
const byIdH = (botTicketById as any)._handler;
const openH = (botOpenTicket as any)._handler;
const botCloseH = (botCloseTicket as any)._handler;
const setChannelH = (botSetTicketChannel as any)._handler;
const claimH = (botClaimTicket as any)._handler;
const transcriptH = (ticketTranscript as any)._handler;
const transcriptUrlH = (ticketTranscriptUrl as any)._handler;
const markClosedH = (botMarkTicketChannelClosed as any)._handler;
const touchH = (botTouchTickets as any)._handler;
const updateH = (updateSettings as any)._handler;
const listKindsH = (listKinds as any)._handler;
const saveKindH = (saveKind as any)._handler;
const removeKindH = (removeKind as any)._handler;
const setKindEnabledH = (setKindEnabled as any)._handler;
const swapOrderH = (swapKindOrder as any)._handler;
const botKindsH = (botKinds as any)._handler;

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail?: string) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (ok) pass++;
  else fail++;
};

const BOT_KEY = "khoa-bot-that-giu-nguyen";
type Row = Record<string, any>;

/** Field CUỐI của từng index `tickets` — `order()` của Convex đảo theo nó. */
const INDEX_LAST_FIELD: Record<string, string> = {
  by_guildId: "guildId",
  by_guildId_status: "status",
  by_guildId_status_createdAt: "createdAt",
  by_guildId_createdAt: "createdAt",
  by_guildId_openerId: "openerId",
  by_guildId_channelId: "channelId",
};

// ─── Ctx giả: 5 bảng trên Map, withIndex mô phỏng đúng range của Convex ───
function makeCtx(opts: { seed?: string | null } = {}) {
  const tickets: Row[] = [];
  const guilds: Row[] = [];
  const sessions: Row[] = [];
  const users: Row[] = [];
  const statusRows: Row[] =
    opts.seed === null
      ? []
      : [{ _id: "st1", kind: "status", botKeySeed: computeBotKey(opts.seed ?? BOT_KEY) }];
  // `ticketKinds` dùng chung ctx vì các handler của nó đi qua đúng
  // insert/patch/delete/withIndex như mọi bảng khác — tách riêng sẽ tạo
  // thêm một bộ mock phải bảo trì song song.
  const ticketKinds: Row[] = [];
  const tables: Record<string, Row[]> = {
    tickets,
    guilds,
    sessions,
    users,
    botStatus: statusRows,
    ticketKinds,
  };

  let idSeq = 0;
  // Đếm số document ĐỌC ĐƯỢC (cách Convex tính I/O) — để test khẳng định được
  // "tra 1 ticket không collect() toàn bộ ticket của guild".
  const stats = { ticketDocs: 0, collects: 0 };
  const ctx = {
    now: 1_700_000_000_000,
    stats,
    db: {
      insert: async (table: string, doc: Row) => {
        const id = `${table}-${++idSeq}`;
        (tables[table] ?? (tables[table] = [])).push({ _id: id, ...doc });
        return id;
      },
      get: async (id: string) => {
        const found =
          [...users, ...guilds, ...tickets, ...sessions, ...ticketKinds].find(
            (r) => r._id === id,
          ) ?? null;
        if (found && tickets.includes(found)) stats.ticketDocs += 1;
        return found;
      },
      /** Convex: id hợp lệ của ĐÚNG bảng đó thì trả id, còn lại null. */
      normalizeId: (table: string, id: string) =>
        tables[table]?.some((r) => r._id === id) ? id : null,
      delete: async (id: string) => {
        const list = tables["ticketKinds"] ?? [];
        const i = list.findIndex((r) => r._id === id);
        if (i >= 0) list.splice(i, 1);
      },
      patch: async (id: string, patch: Row) => {
        // Phải vá CẢ `tickets`, `guilds` lẫn `ticketKinds`: `botOpenTicket` bump
        // bộ đếm modCaseCounter nằm ở bảng guilds, còn các mutation loại
        // ticket patch dòng của chính bảng `ticketKinds`. Bỏ bảng nào ở đây
        // thì test "sửa loại" xanh trong khi dữ liệu thật KHÔNG đổi.
        for (const table of ["tickets", "guilds", "ticketKinds"]) {
          const row = (tables[table] ?? []).find((r) => r._id === id);
          if (row) Object.assign(row, patch);
        }
      },
      query: (table: string) => ({
        withIndex: (name: string, bound: (q: any) => any) => {
          const capture: Record<string, string> = {};
          // Cận dưới (`gte`) tách riêng khỏi `eq` — cùng một field có thể vừa
          // bằng vừa lớn hơn một mốc (ticketStats quét createdAt >= since).
          const lower: Record<string, number> = {};
          const q: any = {
            eq: (f: string, v: string) => ((capture[f] = v), q),
            gte: (f: string, v: number) => ((lower[f] = v), q),
          };
          bound(q);
          const rows = tables[table] ?? [];
          // Chỉ lọc theo field đã ràng buộc — mô phỏng đúng index range.
          const matched = rows.filter(
            (r) =>
              Object.entries(capture).every(([f, v]) => r[f] === v) &&
              Object.entries(lower).every(([f, v]) => r[f] >= v),
          );
          // `order(dir)` của Convex đảo theo field CUỐI CỦA INDEX (không phải
          // field cuối vừa bị `eq` — sau `eq` thì field đó cố định, nên
          // `order("desc")` trên index 2 field là lời hứa rỗng). Bảng dưới
          // là bản sao nguyên văn field cuối của từng index; dùng sai thì test
          // "xanh" trong khi code thật vẫn trả 100 bản ghi cũ nhất.
          const lastField = INDEX_LAST_FIELD[name];
          const ordered = (dir: "asc" | "desc") => {
            if (!lastField) return [...matched];
            const f = lastField;
            return [...matched].sort((a, b) =>
              dir === "desc"
                ? String(b[f]).localeCompare(String(a[f]))
                : String(a[f]).localeCompare(String(b[f])),
            );
          };
          const read = (list: Row[]) => {
            if (table === "tickets") stats.ticketDocs += list.length;
            return list;
          };
          return {
            first: async () => read(matched.slice(0, 1))[0] ?? null,
            collect: async () => {
              if (table === "tickets") stats.collects += 1;
              return read([...matched]);
            },
            take: async (n: number) => read(matched.slice(0, n)),
            order: (dir: "asc" | "desc") => {
              const list = ordered(dir);
              return {
                take: async (n: number) => read(list.slice(0, n)),
                first: async () => read(list.slice(0, 1))[0] ?? null,
                collect: async () => {
                  if (table === "tickets") stats.collects += 1;
                  return read([...list]);
                },
              };
            },
          };
        },
      }),
    },
  };
  return { ctx, tickets, guilds, sessions, users, ticketKinds };
}

/** Một ticket với createdAt chỉ định (để kiểm thứ tự). */
function ticket(id: string, over: Row = {}) {
  return {
    _id: id,
    guildId: "g1",
    number: 1,
    channelId: `ch-${id}`,
    kind: "support",
    openerId: "u1",
    openerName: "Minh",
    body: "nội dung",
    evidence: "",
    source: "cmd",
    status: "open",
    createdAt: 1_000,
    ...over,
  };
}

/** Môi trường có chủ server đã đăng nhập + 1 server. */
function env(opts: { seed?: string | null; manageable?: boolean } = {}) {
  const e = makeCtx({ seed: opts.seed });
  e.guilds.push({ _id: "G", discordId: "g1", name: "Server", managers: ["owner"] });
  e.users.push({
    _id: "U",
    discordId: "owner",
    username: "Chủ",
    manageableGuildIds: opts.manageable === false ? [] : ["g1"],
  });
  e.sessions.push({ _id: "S", token: "tok", userId: "U", createdAt: Date.now(), authVersion: 1 });
  return e;
}

const throws = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
};

(async () => {
  // ═══ listTickets: quyền + thứ tự ═══
  console.log("\n── listTickets ──");
  {
    const e = env();
    e.tickets.push(ticket("t1", { createdAt: 100 }), ticket("t2", { createdAt: 300 }));
    const rows = await listH(e.ctx, { token: "tok", guildId: "g1" });
    check(
      "KHÔNG lọc status → mới nhất trước",
      rows.length === 2 && rows[0].channelId === "ch-t2",
      JSON.stringify(rows.map((r: Row) => r.channelId)),
    );
  }
  {
    // ⚠️ Lỗi thứ tự: lọc status thì index cuối là `status` (cố định) →
    // order("desc") không làm gì. Danh sách phải tự sắp theo createdAt.
    const e = env();
    e.tickets.push(
      ticket("t1", { createdAt: 100, status: "open" }),
      ticket("t2", { createdAt: 300, status: "open" }),
      ticket("t3", { createdAt: 200, status: "closed" }),
    );
    const rows = await listH(e.ctx, { token: "tok", guildId: "g1", status: "open" });
    check(
      "lọc 'open' → vẫn mới nhất trước",
      rows.length === 2 && rows[0].channelId === "ch-t2",
      JSON.stringify(rows.map((r: Row) => r.channelId)),
    );
    const closed = await listH(e.ctx, { token: "tok", guildId: "g1", status: "closed" });
    check("lọc 'closed' → chỉ ticket đã đóng", closed.length === 1 && closed[0].id === "t3");
  }
  {
    // status rác → phải lùi về "tất cả" chứ không trả danh sách rỗng.
    const e = env();
    e.tickets.push(
      ticket("t1", { createdAt: 100 }),
      ticket("t2", { createdAt: 200, status: "closed" }),
    );
    const rows = await listH(e.ctx, { token: "tok", guildId: "g1", status: "banana" });
    check("status lạ → lùi về danh sách tất cả (không trả rỗng)", rows.length === 2);
  }
  {
    // Trường thiếu phải có giá trị mặc định, không để dashboard vỡ `undefined`.
    const e = env();
    e.tickets.push({ _id: "t9", guildId: "g1", status: "open", createdAt: 50, kind: "support" });
    const row = (await listH(e.ctx, { token: "tok", guildId: "g1" }))[0];
    check("number thiếu → 0", row.number === 0);
    check("body thiếu → chuỗi rỗng", row.body === "");
    check("evidence thiếu → chuỗi rỗng", row.evidence === "");
    check("closedByName thiếu → null", row.closedByName === null);
    check("unbanned thiếu → false", row.unbanned === false);
    check("openError thiếu → null", row.openError === null);
  }
  check(
    "không manage guild → từ chối",
    await throws(async () => {
      const e = env({ manageable: false });
      await listH(e.ctx, { token: "tok", guildId: "g1" });
    }),
  );
  check(
    "token sai → từ chối",
    await throws(async () => {
      const e = env();
      await listH(e.ctx, { token: "token-sai", guildId: "g1" });
    }),
  );
  check(
    "server không tồn tại → từ chối",
    await throws(async () => {
      const e = env();
      await listH(e.ctx, { token: "tok", guildId: "khong-co" });
    }),
  );

  // ═══ ticketSummary ═══
  console.log("\n── ticketSummary ──");
  {
    const e = env();
    e.tickets.push(
      ticket("t1", { status: "open" }),
      ticket("t2", { status: "open" }),
      ticket("t3", { status: "closed" }),
    );
    const s = await summaryH(e.ctx, { token: "tok", guildId: "g1" });
    check("đếm đúng số ticket đang mở", s.openCount === 2, JSON.stringify(s));
    check("chưa cấu hình gì → enabled=false", s.enabled === false);
    check("chưa chọn category → missingCategory=true", s.missingCategory === true);
    check("chưa chọn role staff → null", s.staffRoleId === null);
    check("mặc định DM khi ban = bật", s.dmOnBan === true);
    check("mặc định maxOpen=20", s.maxOpen === 20);
    check("mặc định cooldown=24h", s.cooldownHours === 24);
    check("mặc định loại ticket = support", s.defaultKind === "support");
  }
  {
    const e = env();
    e.guilds[0].ticketCategoryId = "cat1";
    e.guilds[0].ticketEnabled = true;
    const s = await summaryH(e.ctx, { token: "tok", guildId: "g1" });
    check(
      "đã cấu hình → missingCategory=false, enabled=true",
      s.missingCategory === false && s.enabled === true,
    );
  }

  // ═══ listTickets: cắt SAU khi sắp, không cắt trước ═══
  // Bug thật 28/09/2026: `.take(100)` trên index 2 field trả 100 bản ghi CŨ
  // nhất, `newestFirst` sắp lại sau đó → ticket MỚI NHẤT không bao giờ hiện
  // trên dashboard của server đã có hơn 100 ticket cùng trạng thái.
  {
    const e = env();
    for (let i = 0; i < 150; i++) {
      e.tickets.push(ticket(`c${i}`, { status: "closed", createdAt: 1_000 + i * 10 }));
    }
    const r = await listH(e.ctx, { token: "tok", guildId: "g1", status: "closed" });
    check("dùng index có createdAt ở cuối để order desc", r.length === 100, String(r.length));
    check(
      "trả 100 ticket MỚI nhất, không phải 100 cái cũ nhất",
      r[0].id === "c149" && r[99].id === "c50",
      `${r[0]?.id} .. ${r[99]?.id}`,
    );
    check(
      "thứ tự giảm dần theo createdAt",
      r.every((x: Row, i: number) => i === 0 || r[i - 1].createdAt > x.createdAt),
    );
  }
  {
    // Không lọc trạng thái cũng phải mới trước — cùng lý do trên.
    const e = env();
    for (let i = 0; i < 150; i++) e.tickets.push(ticket(`m${i}`, { createdAt: 1_000 + i * 10 }));
    const r = await listH(e.ctx, { token: "tok", guildId: "g1" });
    check(
      "bỏ trống status → vẫn 100 ticket mới nhất",
      r[0].id === "m149" && r.length === 100,
      `${r[0]?.id}/${r.length}`,
    );
  }

  // ═══ ticketStats (SLA) ═══
  // Mốc thời gian thật: query dùng Date.now() nên bản ghi phải đặt quanh
  // "hiện tại" thì mới nằm trong cửa sổ.
  console.log("\n── ticketStats ──");
  {
    const NOW = Date.now();
    const H = 3_600_000;
    const e = env();
    e.tickets.push(
      // staff nhận sau 30 phút, đóng sau 3 giờ
      ticket("t1", {
        createdAt: NOW - 4 * H,
        status: "closed",
        claimedAt: NOW - 3.5 * H,
        closedAt: NOW - H,
      }),
      // không ai nhận nhưng vẫn đóng → đánh dấu dịch vụ kém
      ticket("t2", { createdAt: NOW - 2 * H, status: "closed", closedAt: NOW - 0.5 * H }),
      // nhận sau 2 giờ, vẫn đang mở
      ticket("t3", { createdAt: NOW - 3 * H, claimedAt: NOW - H }),
      // ngoài cửa sổ 30 ngày
      ticket("t4", { createdAt: NOW - 60 * 24 * H }),
    );
    const s = await statsH(e.ctx, { token: "tok", guildId: "g1" });
    check("chỉ tính ticket trong cửa sổ", s.total === 3, JSON.stringify(s));
    check("đếm đúng trạng thái", s.open === 1 && s.closed === 2, JSON.stringify(s));
    check(
      "trung bình phản hồi đầu = (30 phút + 2 giờ) / 2",
      s.avgFirstResponseMs === Math.round((0.5 * H + 2 * H) / 2),
      String(s.avgFirstResponseMs),
    );
    check(
      "trung bình thời gian xử lý chỉ tính ticket đã đóng",
      s.avgResolutionMs === Math.round((3 * H + 1.5 * H) / 2),
      String(s.avgResolutionMs),
    );
    check("đếm ticket đóng mà không ai nhận", s.unclaimedClosed === 1, String(s.unclaimedClosed));
  }
  {
    // Mẫu bằng 0 → null, KHÔNG phải 0 phút (đọc lên là "phản hồi tức thì").
    const e = env();
    const s = await statsH(e.ctx, { token: "tok", guildId: "g1" });
    check(
      "server chưa có ticket → trung bình null, unbanRate null",
      s.avgFirstResponseMs === null && s.avgResolutionMs === null && s.unbanRate === null,
      JSON.stringify(s),
    );
  }
  {
    const NOW = Date.now();
    const e = env();
    e.tickets.push(
      ticket("a1", { kind: "appeal", unbanned: true }),
      ticket("a2", { kind: "appeal", unbanned: false }),
      ticket("a3", { kind: "appeal" }),
      ticket("s1", { kind: "support", unbanned: true }),
    );
    for (const t of e.tickets) t.createdAt = NOW - 1000;
    const s = await statsH(e.ctx, { token: "tok", guildId: "g1" });
    check(
      "tỉ lệ gỡ ban chỉ tính trên khiếu nại, không lẫn ticket hỗ trợ",
      s.appeals === 3 && s.appealsUnbanned === 1 && s.unbanRate === 1 / 3,
      JSON.stringify(s),
    );
  }
  {
    // days rác (0, âm, quá lớn) phải bị kẹp về 1..90, không quét cả lịch sử.
    const e = env();
    const s0 = await statsH(e.ctx, { token: "tok", guildId: "g1", days: 0 });
    const sN = await statsH(e.ctx, { token: "tok", guildId: "g1", days: -5 });
    const sBig = await statsH(e.ctx, { token: "tok", guildId: "g1", days: 9999 });
    check(
      "days ngoài khoảng bị kẹp về 1..90",
      s0.days === 1 && sN.days === 1 && sBig.days === 90,
      `${s0.days}/${sN.days}/${sBig.days}`,
    );
    check(
      "sai token → từ chối (không đọc được số liệu của server khác)",
      await throws(() => statsH(e.ctx, { token: "sai", guildId: "g1" })),
    );
  }

  // ═══ closeTicket ═══
  console.log("\n── closeTicket ──");
  {
    const e = env();
    e.tickets.push(ticket("t1", { createdAt: 100 }));
    const r = await closeH(e.ctx, {
      token: "tok",
      guildId: "g1",
      ticketId: "t1",
      reason: "đã giải quyết",
    });
    check("đóng được → ok + not alreadyClosed", r.ok === true && r.alreadyClosed === false);
    check(
      "ghi người đóng",
      e.tickets[0].closedById === "owner" && e.tickets[0].closedByName === "Chủ",
    );
    check("ghi thời điểm đóng", typeof e.tickets[0].closedAt === "number");
    check("lưu lý do", e.tickets[0].closeReason === "đã giải quyết");
  }
  {
    // Lý do dài bị cắt — không ghi tràn cột.
    const e = env();
    e.tickets.push(ticket("t1"));
    await closeH(e.ctx, { token: "tok", guildId: "g1", ticketId: "t1", reason: "x".repeat(900) });
    check(
      "lý do dài bị cắt còn 300",
      e.tickets[0].closeReason.length === 300,
      String(e.tickets[0].closeReason.length),
    );
  }
  {
    // ⚠️ Chống đóng NHẦM ticket của server khác: staff A không được đóng ticket
    // của server B chỉ vì biết id.
    const e = env();
    e.tickets.push(ticket("t1", { guildId: "server-khac" }));
    check(
      "ticket thuộc guild khác → từ chối",
      await throws(async () => closeH(e.ctx, { token: "tok", guildId: "g1", ticketId: "t1" })),
    );
  }
  check(
    "ticket không tồn tại → từ chối",
    await throws(async () => closeH(env().ctx, { token: "tok", guildId: "g1", ticketId: "nope" })),
  );
  {
    // Đóng 2 lần: lần hai không ghi đè mốc lần đầu (dashboard hiển thị sai lịch sử).
    const e = env();
    e.tickets.push(ticket("t1", { createdAt: 100 }));
    await closeH(e.ctx, { token: "tok", guildId: "g1", ticketId: "t1" });
    const first = e.tickets[0].closedAt;
    const r = await closeH(e.ctx, { token: "tok", guildId: "g1", ticketId: "t1" });
    check("đóng lại → alreadyClosed=true", r.ok === true && r.alreadyClosed === true);
    check("không ghi đè mốc đóng cũ", e.tickets[0].closedAt === first);
  }
  check(
    "không manage guild → không đóng được",
    await throws(async () => {
      const e = env({ manageable: false });
      e.tickets.push(ticket("t1"));
      await closeH(e.ctx, { token: "tok", guildId: "g1", ticketId: "t1" });
    }),
  );

  // ═══ botTicketState: hàng rào chống spam ═══
  console.log("\n── botTicketState ──");
  {
    const e = env();
    e.tickets.push(ticket("t1", { createdAt: 100 }), ticket("t2", { createdAt: 200 }));
    const s = await stateH(e.ctx, { guildId: "g1", userId: "u1", botKey: BOT_KEY });
    check("đếm số ticket đang mở của server", s.openCount === 2, JSON.stringify(s));
    check(
      "botKey sai → từ chối",
      await throws(async () => stateH(e.ctx, { guildId: "g1", userId: "u1", botKey: "key-sai" })),
    );
    check(
      "thiếu botKey → từ chối",
      await throws(async () => stateH(e.ctx, { guildId: "g1", userId: "u1" })),
    );
    check(
      "chưa cấp phát key → từ chối (không có cửa hậu)",
      await throws(async () => {
        const e2 = env({ seed: null });
        await stateH(e2.ctx, { guildId: "g1", userId: "u1", botKey: BOT_KEY });
      }),
    );
  }
  {
    // ⚠️ Lỗi thứ tự — hàng rào cooldown: `lastOpenedAt` phải là lần mở MỚI NHẤT
    // của chính người đó. Index (guildId, openerId) đã cố định openerId nên
    // `order("desc").take(1)` không bảo đảm điều đó → lấy nhầm ticket cũ thì
    // người dùng bị phạt oan cooldown hoặc né cooldown.
    const e = env();
    e.tickets.push(
      ticket("cu", { createdAt: 100, status: "closed" }),
      ticket("moi", { createdAt: 900, status: "open" }),
    );
    const s = await stateH(e.ctx, { guildId: "g1", userId: "u1", botKey: BOT_KEY });
    check(
      "lastOpenedAt = lần mở MỚI NHẤT (không phải bản ghi cũ)",
      s.lastOpenedAt === 900,
      String(s.lastOpenedAt),
    );
    check(
      "openChannelId = kênh của ticket đang mở",
      s.openChannelId === "ch-moi",
      String(s.openChannelId),
    );
    check("openTicketId = id của ticket đang mở", s.openTicketId === "moi", String(s.openTicketId));
  }
  {
    // Bản ghi MỚI NHẤT đã đóng nhưng còn ticket cũ đang mở → phải trả kênh
    // đang mở, không được trả null (nếu null thì vòng chống mở trùng bị bypass).
    const e = env();
    e.tickets.push(
      ticket("dang-mo", { createdAt: 100, status: "open" }),
      ticket("moi-nhat", { createdAt: 900, status: "closed" }),
    );
    const s = await stateH(e.ctx, { guildId: "g1", userId: "u1", botKey: BOT_KEY });
    check(
      "ticket mới đã đóng → vẫn trả kênh ĐANG MỞ",
      s.openChannelId === "ch-dang-mo",
      String(s.openChannelId),
    );
  }
  {
    const e = env();
    e.tickets.push(ticket("khac", { createdAt: 900, openerId: "nguoi-khac" }));
    const s = await stateH(e.ctx, { guildId: "g1", userId: "u1", botKey: BOT_KEY });
    check("chưa từng mở → lastOpenedAt null", s.lastOpenedAt === null);
    check("chưa từng mở → không có kênh", s.openChannelId === null && s.openTicketId === null);
    check("ticket của người khác không tính vào trạng thái của tôi", s.openCount === 1);
  }

  // ═══ botTicketById: nút trong kênh — nguồn tin quyết định gỡ ban ═══
  console.log("\n── botTicketById ──");
  {
    const e = env();
    e.tickets.push(ticket("t1", { createdAt: 100, openerId: "nguoi-bi-ban" }));
    const t = await byIdH(e.ctx, { guildId: "g1", ticketId: "t1", botKey: BOT_KEY });
    check("đọc đúng người mở ticket", t.openerId === "nguoi-bi-ban", JSON.stringify(t));
    check("trả cả trạng thái + loại", t.status === "open" && t.kind === "support");
    check("KHÔNG trả nội dung khiếu nại (không cần, dễ rò)", t.body === undefined);
    check(
      "botKey sai → từ chối",
      await throws(async () => byIdH(e.ctx, { guildId: "g1", ticketId: "t1", botKey: "sai" })),
    );
    check(
      "id không tồn tại → null",
      (await byIdH(e.ctx, { guildId: "g1", ticketId: "nope", botKey: BOT_KEY })) === null,
    );
  }
  {
    // ⚠️ Bảo mật: nút bị dán lại sang kênh của server khác → không được đọc
    // được ticket (đọc được thì nút "Gỡ ban" sẽ gỡ ban nhầm người).
    const e = env();
    e.tickets.push(ticket("t1", { guildId: "server-khac" }));
    check(
      "ticket thuộc guild khác → null",
      (await byIdH(e.ctx, { guildId: "g1", ticketId: "t1", botKey: BOT_KEY })) === null,
    );
  }

  // ═══ Hiệu quả đọc: tra ticket bằng index/get, KHÔNG collect toàn guild ═══
  // Bối cảnh: các mutation ticket trước đây `collect()` toàn bộ ticket của guild
  // rồi tự `.find`. `botTouchTickets` chạy MỖI tin nhắn trong kênh ticket → server
  // 300 ticket tốn ~300 lượt đọc document (kèm `body` dài) cho mỗi tin nhắn, tức
  // I/O Convex phình theo bình phương số ticket (đốt hạn mức free tier).
  console.log("\n── Hiệu quả đọc: tra ticket theo index/get (chống đốt I/O Convex) ──");
  {
    const e = env();
    for (let i = 0; i < 50; i++) e.tickets.push(ticket(`t${i}`, { channelId: `ch-${i}` }));
    e.ctx.stats.ticketDocs = 0;
    e.ctx.stats.collects = 0;
    const r = await touchH(e.ctx, { guildId: "g1", channelIds: ["ch-7"], botKey: BOT_KEY });
    check("botTouchTickets: sửa đúng ticket của kênh", r.touched === 1, JSON.stringify(r));
    check(
      "botTouchTickets: chỉ đọc 1 document (bản cũ đọc cả 50) và KHÔNG collect",
      e.ctx.stats.ticketDocs === 1 && e.ctx.stats.collects === 0,
      JSON.stringify(e.ctx.stats),
    );
    check(
      "botTouchTickets: ghi đúng bộ đếm tin nhắn",
      e.tickets.find((t) => t._id === "t7")?.messageCount === 1,
      JSON.stringify(e.tickets.find((t) => t._id === "t7")),
    );
  }
  {
    const e = env();
    for (let i = 0; i < 50; i++) e.tickets.push(ticket(`t${i}`, { channelId: `ch-${i}` }));
    e.ctx.stats.ticketDocs = 0;
    e.ctx.stats.collects = 0;
    const t = await byIdH(e.ctx, { guildId: "g1", ticketId: "t7", botKey: BOT_KEY });
    check("botTicketById: đọc được ticket bằng id", t?.openerId === "u1", JSON.stringify(t));
    check(
      "botTicketById: đọc 1 document, không collect toàn guild",
      e.ctx.stats.ticketDocs === 1 && e.ctx.stats.collects === 0,
      JSON.stringify(e.ctx.stats),
    );
    check(
      "botTicketById: id của BẢNG KHÁC bị từ chối (normalizeId)",
      (await byIdH(e.ctx, { guildId: "g1", ticketId: "G", botKey: BOT_KEY })) === null,
    );
  }
  {
    const e = env();
    for (let i = 0; i < 50; i++) e.tickets.push(ticket(`t${i}`, { channelId: `ch-${i}` }));
    e.ctx.stats.ticketDocs = 0;
    e.ctx.stats.collects = 0;
    const r = await claimH(e.ctx, {
      guildId: "g1",
      ticketId: "t7",
      staffId: "s1",
      staffName: "Staff",
      botKey: BOT_KEY,
    });
    check(
      "botClaimTicket: nhận việc thành công",
      r.ok === true && r.taken === true,
      JSON.stringify(r),
    );
    check(
      "botClaimTicket: đọc 1 document, không collect toàn guild",
      e.ctx.stats.ticketDocs === 1 && e.ctx.stats.collects === 0,
      JSON.stringify(e.ctx.stats),
    );
  }

  // ═══ Mutation phía BOT — đường GHI dữ liệu ticket ═══
  // Ba mutation này chưa có test nào. Chúng là nơi dữ liệu dashboard đến từ,
  // nên ghi sai là dashboard hiện sai — và sai ở đây rất khó phát hiện thủ
  // công (vẫn "chạy được", chỉ sai âm thầm).
  console.log("\n── botOpenTicket / botCloseTicket / botSetTicketChannel ──");
  {
    const e = env();
    e.guilds[0].modCaseCounter = 11;
    const r = await openH(e.ctx, {
      guildId: "g1",
      channelId: "pending",
      kind: "appeal",
      openerId: "u1",
      openerName: "Minh",
      body: "khiếu nại",
      source: "dm",
      botKey: BOT_KEY,
    });
    check(
      "trả về id + số thứ tự",
      r.ok === true && !!r.ticketId && r.number === 12,
      JSON.stringify(r),
    );
    check(
      "bản ghi ghi đúng trạng thái mở",
      e.tickets[0].status === "open" && e.tickets[0].kind === "appeal",
    );
    // Số thứ tự dùng CHUNG bộ đếm mod case (một dãy số duy nhất trong kênh log).
    check("số thứ tự nối tiếp bộ đếm mod case", e.guilds[0].modCaseCounter === 12);
    check(
      "botKey sai → từ chối",
      await throws(async () =>
        openH(e.ctx, {
          guildId: "g1",
          channelId: "pending",
          kind: "appeal",
          openerId: "u1",
          openerName: "x",
          source: "dm",
          botKey: "sai",
        }),
      ),
    );
  }
  {
    // Độ dài phải bị kẹp ở tầng mutation: bot có thể lỗi, không được để
    // mutation làm vỡ schema (Convex từ chối field quá dài → ghi hỏng).
    const e = env();
    await openH(e.ctx, {
      guildId: "g1",
      channelId: "pending",
      kind: "support",
      openerId: "u1",
      openerName: "n".repeat(200),
      body: "b".repeat(5000),
      evidence: "c".repeat(2000),
      openError: "d".repeat(900),
      source: "cmd",
      botKey: BOT_KEY,
    });
    const t = e.tickets[0];
    check("tên người mở cắt 80", t.openerName.length === 80, String(t.openerName.length));
    check("nội dung cắt 1000", t.body.length === 1000, String(t.body.length));
    check("bằng chứng cắt 500", t.evidence.length === 500, String(t.evidence.length));
    check(
      "lỗi mở cắt 200 + có mốc thời gian",
      t.openError.length === 200 && typeof t.openErrorAt === "number",
    );
  }
  {
    const e = env();
    e.tickets.push(ticket("t1", { createdAt: 100 }));
    const r = await botCloseH(e.ctx, {
      guildId: "g1",
      ticketId: "t1",
      status: "closed",
      closedById: "M1",
      closedByName: "mod",
      closeReason: "x".repeat(900),
      unbanned: true,
      botKey: BOT_KEY,
    });
    check("đóng được", r.ok === true && r.found === true);
    check(
      "ghi người đóng + trạng thái",
      e.tickets[0].status === "closed" && e.tickets[0].closedById === "M1",
    );
    check(
      "lý do cắt 300",
      e.tickets[0].closeReason.length === 300,
      String(e.tickets[0].closeReason.length),
    );
    check("ghi cờ đã gỡ ban", e.tickets[0].unbanned === true);
    check(
      "ticket không tồn tại → ok (nút cũ không lỗi)",
      (
        await botCloseH(e.ctx, {
          guildId: "g1",
          ticketId: "khong-co",
          status: "closed",
          botKey: BOT_KEY,
        })
      ).found === false,
    );
  }
  {
    // Trạng thái rác không được đi thẳng vào DB — chỉ "closed"/"locked".
    const e = env();
    e.tickets.push(ticket("t1"));
    await botCloseH(e.ctx, { guildId: "g1", ticketId: "t1", status: "banana", botKey: BOT_KEY });
    check(
      "status lạ → đóng (không ghi giá trị rác)",
      e.tickets[0].status === "closed",
      e.tickets[0].status,
    );
  }
  {
    // Nút "Nhận việc" VẪN còn trong panel của kênh `closed-*` (bot đóng bằng
    // cách thu quyền + đổi tên, không xoá panel) → nếu không chặn status,
    // staff nhận việc cho ticket đã xong và dashboard hiện người nhận sai.
    const e = env();
    e.tickets.push(ticket("t1", { status: "closed" }));
    const r = await claimH(e.ctx, {
      guildId: "g1",
      ticketId: "t1",
      staffId: "M1",
      staffName: "mod",
      botKey: BOT_KEY,
    });
    check(
      "nhận việc ticket đã đóng → từ chối",
      r.ok === false && r.reason === "closed",
      JSON.stringify(r),
    );
    check(
      "từ chối thì KHÔNG ghi người nhận",
      e.tickets[0].claimedById === undefined,
      String(e.tickets[0].claimedById),
    );
    const e2 = env();
    e2.tickets.push(ticket("t1", { status: "open" }));
    const okRes = await claimH(e2.ctx, {
      guildId: "g1",
      ticketId: "t1",
      staffId: "M1",
      staffName: "mod",
      botKey: BOT_KEY,
    });
    check(
      "ticket đang mở → nhận được",
      okRes.ok === true && e2.tickets[0].claimedById === "M1",
      JSON.stringify(okRes),
    );
    const e3 = env();
    e3.tickets.push(ticket("t1", { status: "open", claimedById: "M1", claimedByName: "mod" }));
    const again = await claimH(e3.ctx, {
      guildId: "g1",
      ticketId: "t1",
      staffId: "M1",
      staffName: "mod",
      botKey: BOT_KEY,
    });
    check(
      "bấm lại nút của chính mình → idempotent",
      again.ok === true && again.alreadyMine === true,
      JSON.stringify(again),
    );
  }
  {
    const e = env();
    e.tickets.push(ticket("t1", { channelId: "pending" }));
    await setChannelH(e.ctx, { guildId: "g1", ticketId: "t1", channelId: "CH-1", botKey: BOT_KEY });
    check("điền channelId thật", e.tickets[0].channelId === "CH-1");
    await setChannelH(e.ctx, {
      guildId: "g1",
      ticketId: "t1",
      channelId: "pending",
      openError: "MISSING_PERM",
      botKey: BOT_KEY,
    });
    check(
      "ghi lỗi mở kênh",
      e.tickets[0].openError === "MISSING_PERM" && typeof e.tickets[0].openErrorAt === "number",
    );
    const missing = await setChannelH(e.ctx, {
      guildId: "g1",
      ticketId: "khong-co",
      channelId: "CH-x",
      botKey: BOT_KEY,
    });
    check("ticket không tồn tại → ok", missing.found === false);
  }
  {
    // ⚠️ Chống ghi nhầm ticket của server khác (nút có thể bị dán lại kênh khác).
    const e = env();
    e.tickets.push(ticket("t1", { guildId: "server-khac" }));
    const r = await setChannelH(e.ctx, {
      guildId: "g1",
      ticketId: "t1",
      channelId: "CH-x",
      botKey: BOT_KEY,
    });
    check(
      "ticket thuộc guild khác → không ghi",
      r.found === false && e.tickets[0].channelId === "ch-t1",
    );
  }

  // ═══ updateSettings: tự bật cờ dán lại panel khi sửa nội dung panel ═══
  // Lý do có test này: ô nhập đã LƯU nhưng kênh không đổi là kiểu lỗi khiến
  // phần lớn server kết luận "tính năng hỏng". Muốn chặn được thì phải test
  // cả chiều "KHÔNG bật cờ" — dán lên mọi lần lưu là spam, còn không bật
  // lúc sửa nội dung thì tuỳ chỉnh là vô hiệu.
  console.log("\n── updateSettings: tự dán lại panel khi sửa nội dung ──");

  /** Ctx giả cho updateSettings: chỉ cần sessions + users + guilds. */
  function settingsCtx(guild: Row): { ctx: any; guild: Row } {
    const guilds: Row[] = [{ _id: "g1", discordId: "server-1", ...guild }];
    const users: Row[] = [{ _id: "u1", discordId: "owner-1", manageableGuildIds: ["server-1"] }];
    const sessions: Row[] = [
      { _id: "s1", token: "tok", userId: "u1", createdAt: Date.now(), authVersion: 1 },
    ];
    const tables: Record<string, Row[]> = { guilds, users, sessions };
    const all = () => [...guilds, ...users, ...sessions];
    const ctx = {
      now: 1_700_000_000_000,
      db: {
        insert: async () => "x",
        get: async (id: string) => all().find((r) => r._id === id) ?? null,
        patch: async (id: string, patch: Row) => {
          const row = all().find((r) => r._id === id);
          if (row) Object.assign(row, patch);
        },
        query: (table: string) => ({
          withIndex: (_name: string, bound: (q: any) => any) => {
            const capture: Record<string, unknown> = {};
            const q: any = { eq: (f: string, v: unknown) => ((capture[f] = v), q) };
            bound(q);
            const rows = (tables[table] ?? []).filter((r) =>
              Object.entries(capture).every(([f, v]) => r[f] === v),
            );
            return {
              first: async () => rows[0] ?? null,
              collect: async () => [...rows],
              take: async (n: number) => rows.slice(0, n),
              order: () => ({
                take: async (n: number) => rows.slice(0, n),
                collect: async () => [...rows],
              }),
              unique: async () => rows[0] ?? null,
            };
          },
        }),
      },
    };
    return { ctx, guild: guilds[0] };
  }

  /** Chạy updateSettings rồi trả về patch đã ghi (để soi field cờ). */
  async function save(guild: Row, args: Row) {
    const { ctx, guild: row } = settingsCtx(guild);
    let written: Row = {};
    const spy = {
      ...ctx,
      db: {
        ...ctx.db,
        patch: async (id: string, p: Row) => {
          written = p;
          await ctx.db.patch(id, p);
        },
      },
    };
    await updateH(spy, { token: "tok", guildId: "server-1", ...args });
    return written;
  }

  const ON = { ticketEnabled: true, ticketPanelChannelId: "123456789012345678" };
  {
    const p = await save({ ...ON, ticketOpenPanelTitle: "Cũ" }, { ticketOpenPanelTitle: "Mới" });
    check("đổi tiêu đề panel → tự bật cờ dán lại", p.ticketSendPanel === true, JSON.stringify(p));
  }
  {
    const p = await save(
      { ...ON, ticketOpenPanelTitle: "Giữ nguyên" },
      { ticketOpenPanelTitle: "Giữ nguyên" },
    );
    check(
      "lưu lại y hệt (không đổi gì) → KHÔNG dán lại",
      p.ticketSendPanel === undefined,
      JSON.stringify(p),
    );
  }
  {
    const p = await save({ ...ON, ticketOpenPanelTitle: "Xoá đi" }, { ticketOpenPanelTitle: "  " });
    check(
      "xoá trắng tiêu đề (khác giá trị cũ) → dán lại",
      p.ticketSendPanel === true && p.ticketOpenPanelTitle === undefined,
      JSON.stringify(p),
    );
  }
  {
    const p = await save(
      { ...ON, ticketOpenPanelColor: "ff0000" },
      { ticketOpenPanelColor: "00FF00" },
    );
    check(
      "đổi màu → tự bật cờ dán lại",
      p.ticketSendPanel === true && p.ticketOpenPanelColor === "00ff00",
      JSON.stringify(p),
    );
  }
  {
    // CHỐNG HỒI QUY của chính cách so sánh: đổi màu NHƯNG màu không đổi,
    // trong khi tiêu đề đang có sẵn. So sánh kiểu "patch.X !== guild.X" mà
    // không xét "đối số có được truyền không" sẽ thấy undefined != "Tiêu đề"
    // và bật cờ oan → dán panel mới mỗi lần lưu cấu hình.
    const p = await save(
      { ...ON, ticketOpenPanelTitle: "Tiêu đề", ticketOpenPanelColor: "ff0000" },
      { ticketOpenPanelColor: "ff0000" },
    );
    check(
      "lưu màu Y HỆT (tiêu đề đang có sẵn) → KHÔNG dán lại oan",
      p.ticketSendPanel === undefined,
      JSON.stringify(p),
    );
  }
  {
    const p = await save(
      { ...ON, ticketShowAppealButton: true },
      { ticketShowAppealButton: false },
    );
    check("tắt nút Khiếu nại → tự bật cờ dán lại", p.ticketSendPanel === true, JSON.stringify(p));
  }
  {
    const p = await save(
      { ...ON, ticketShowAppealButton: false },
      { ticketShowAppealButton: false },
    );
    check(
      "lưu lại nút Khiếu nại y hệt → KHÔNG dán lại",
      p.ticketSendPanel === undefined,
      JSON.stringify(p),
    );
  }
  {
    // Chưa từng lưu (undefined = mặc định true) → đặt true là KHÔNG đổi.
    const p = await save(ON, { ticketShowAppealButton: true });
    check(
      "nút Khiếu nại chưa từng lưu, đặt true (= mặc định) → KHÔNG dán lại",
      p.ticketSendPanel === undefined,
      JSON.stringify(p),
    );
  }
  {
    // ticketOpenNote / ticketDmOnOpen KHÔNG nằm trong panel.
    const p = await save(ON, { ticketOpenNote: "Lời dặn mới" });
    check(
      "đổi lời dặn đầu kênh → KHÔNG dán lại panel",
      p.ticketSendPanel === undefined,
      JSON.stringify(p),
    );
  }
  {
    const p = await save(ON, { ticketDmOnOpen: false });
    check(
      "tắt DM khi mở → KHÔNG dán lại panel",
      p.ticketSendPanel === undefined,
      JSON.stringify(p),
    );
  }
  {
    // ⚠️ Phải bật ticket + BỎ kênh panel. Lần đầu viết case này quên bật
    // ticket nên nó "xanh" vì lý do SAI (do ticket tắt, không phải do thiếu
    // kênh) — mutation bỏ kiểm tra hasPanelChannel vẫn sống sót.
    const p = await save({ ticketEnabled: true }, { ticketOpenPanelTitle: "Mới" });
    check(
      "chưa chọn kênh panel → KHÔNG bật cờ (không có chỗ dán)",
      p.ticketSendPanel === undefined,
      JSON.stringify(p),
    );
  }
  {
    const p = await save(
      { ticketEnabled: true, ticketPanelChannelId: "" },
      { ticketOpenPanelTitle: "Mới" },
    );
    check(
      "kênh panel bị xoá trắng → KHÔNG bật cờ",
      p.ticketSendPanel === undefined,
      JSON.stringify(p),
    );
  }
  {
    const p = await save(
      { ticketEnabled: false, ticketPanelChannelId: "123456789012345678" },
      { ticketOpenPanelTitle: "Mới" },
    );
    check("ticket đang tắt → KHÔNG bật cờ", p.ticketSendPanel === undefined, JSON.stringify(p));
  }
  {
    const p = await save(
      { ...ON, ticketOpenPanelTitle: "Cũ" },
      {
        ticketOpenPanelTitle: "Mới",
        ticketSendPanel: false,
      },
    );
    check(
      "người dùng tự tắt cờ → không bật lại (ý chí họ được tôn trọng)",
      p.ticketSendPanel === false,
      JSON.stringify(p),
    );
  }
  {
    const p = await save(
      { ...ON, ticketPanelChannelId: "876543210987654321" },
      {
        ticketPanelChannelId: "111111111111111111",
      },
    );
    check(
      "đổi kênh dán panel → vẫn tự dán (hành vi có sẵn, không hồi quy)",
      p.ticketSendPanel === true && p.ticketPanelChannelId === "111111111111111111",
      JSON.stringify(p),
    );
  }

  // ═══ MỐC channelClosedAt — phân biệt "đã khoá kênh" với "chỉ đóng ở DB" ═══
  // Dashboard đóng ticket KHÔNG đụng kênh Discord. Job `closeChannel` trong
  // getPendingJobs thu quyền rồi ghi mốc này; bot đóng trong kênh thì ghi
  // luôn cùng lúc. Không có mốc thì tick không biết kênh nào còn cần khoá
  // (lỗi thật 28/09/2026: kênh còn mở tới 24h sau khi staff đóng ở web).
  console.log("\n── channelClosedAt ──");
  {
    const e = env();
    e.tickets.push(ticket("t1"));
    await botCloseH(e.ctx, {
      guildId: "g1",
      ticketId: "t1",
      status: "closed",
      closedById: "M1",
      closedByName: "mod",
      botKey: BOT_KEY,
    });
    check(
      "bot đóng trong kênh → ghi channelClosedAt ngay",
      typeof e.tickets[0].channelClosedAt === "number",
      String(e.tickets[0].channelClosedAt),
    );
  }
  {
    const e = env();
    e.tickets.push(ticket("t1"));
    await markClosedH(e.ctx, { guildId: "g1", ticketId: "t1", botKey: BOT_KEY });
    check(
      "job closeChannel đánh dấu được",
      typeof e.tickets[0].channelClosedAt === "number",
      String(e.tickets[0].channelClosedAt),
    );
    check(
      "đánh dấu KHÔNG đụng closedAt (không đẩy lùi lượt dọn kênh)",
      e.tickets[0].closedAt === undefined,
      String(e.tickets[0].closedAt),
    );
    check(
      "ticket không tồn tại → ok thay vì ném",
      (await markClosedH(e.ctx, { guildId: "g1", ticketId: "no", botKey: BOT_KEY })).found ===
        false,
    );
    check(
      "botKey sai → từ chối",
      await throws(async () =>
        markClosedH(e.ctx, { guildId: "g1", ticketId: "t1", botKey: "sai" }),
      ),
    );
  }
  {
    // Purge (kênh đã bị xoá) không được ghi mốc — nằm ở trạng thái locked.
    const e = env();
    e.tickets.push(ticket("t1"));
    await botCloseH(e.ctx, { guildId: "g1", ticketId: "t1", status: "locked", botKey: BOT_KEY });
    check(
      "purge (locked) → không ghi channelClosedAt",
      e.tickets[0].channelClosedAt === undefined,
      String(e.tickets[0].channelClosedAt),
    );
  }

  // ═══ XEM TRANSCRIPT — trước đây bot LƯU file xong không ai xem được ═══
  // `ticketTranscriptUrl` tồn tại từ lâu nhưng KHÔNG có nơi nào gọi: staff
  // thấy badge "Transcript đã lưu" rồi không làm được gì (lỗi 28/09/2026).
  console.log("\n── ticketTranscript / ticketTranscriptUrl ──");
  {
    const e = env();
    e.tickets.push(ticket("t1", { channelId: "CH-1" }));
    (e.ctx as any).storage = { getUrl: async () => "https://storage.example/f" };
    const noTranscript = await transcriptUrlH(e.ctx as any, {
      token: "tok",
      guildId: "g1",
      ticketId: "t1",
    });
    check(
      "ticket chưa lưu transcript → url null (không ném)",
      noTranscript.url === null,
      JSON.stringify(noTranscript),
    );

    e.tickets[0].transcriptStorageId = "f1";
    e.tickets[0].transcriptAt = 123;
    const withTranscript = await transcriptUrlH(e.ctx as any, {
      token: "tok",
      guildId: "g1",
      ticketId: "t1",
    });
    check(
      "ticket đã lưu → trả link + mốc thời gian",
      withTranscript.url === "https://storage.example/f" && withTranscript.at === 123,
      JSON.stringify(withTranscript),
    );
    // Không có quyền thì ném: transcript là dữ liệu khiếu nại của người khác.
    const other = env({ manageable: false });
    other.tickets.push(ticket("t1", { transcriptStorageId: "f1" }));
    (other.ctx as any).storage = { getUrl: async () => "https://storage.example/f" };
    check(
      "không có quyền → từ chối, không lộ link transcript",
      await throws(async () =>
        transcriptUrlH(other.ctx as any, { token: "tok", guildId: "g1", ticketId: "t1" }),
      ),
    );
  }
  {
    // Action tải file qua link rồi parse. `ctx.storage.get` CHỈ có trong
    // mutation → bắt buộc đi đường action; test sẽ hỏng nếu ai đó đổi lại.
    const realFetch = globalThis.fetch;
    let asked = "";
    globalThis.fetch = (async (url: string) => {
      asked = String(url);
      return {
        ok: true,
        json: async () => ({
          channelName: "ticket-7",
          savedAt: 999,
          messageCount: 2,
          messages: [
            { at: 1, author: "minh", content: "chào", attachments: ["u1"] },
            { at: 2, author: "mod" },
          ],
        }),
      };
    }) as unknown as typeof fetch;
    try {
      const out: any = await transcriptH(
        { runQuery: async () => ({ url: "https://storage.example/f", at: 999 }) } as any,
        { token: "t", guildId: "g1", ticketId: "t1" },
      );
      check("action tải đúng link của storage", asked === "https://storage.example/f", asked);
      check(
        "action chuẩn hoá tin thiếu field (không lỗi)",
        out.messages.length === 2 &&
          out.messages[0].attachments.length === 1 &&
          out.messages[1].content === "" &&
          out.messages[1].attachments.length === 0,
        JSON.stringify(out?.messages),
      );
      check(
        "action giữ tên kênh + số tin",
        out.channelName === "ticket-7" && out.messageCount === 2,
      );
      const noUrl = await transcriptH({ runQuery: async () => ({ url: null, at: null }) } as any, {
        token: "t",
        guildId: "g1",
        ticketId: "t1",
      });
      check("chưa có transcript → action trả null", noUrl === null, JSON.stringify(noUrl));
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  // ═══ LOẠI TICKET TUỲ CHỈNH (29/09/2026) — convex/ticketKinds.ts ═══
  console.log("\n── ticketKinds ──");
  {
    // Ràng buộc tương thích ngược: server chưa cấu hình gì → danh sách rỗng,
    // bot tự rơi về 2 loại cứng. Không có dòng nào KHÔNG được tự tạo.
    const e = env();
    const empty = await listKindsH(e.ctx, { token: "tok", guildId: "g1" });
    check("chưa cấu hình → danh sách rỗng (bot dùng 2 loại cứng)", empty.length === 0);
    check("chưa cấu hình → KHÔNG tự sinh dòng nào", e.ticketKinds.length === 0);
  }
  {
    const e = env();
    const out = await saveKindH(e.ctx, {
      token: "tok",
      guildId: "g1",
      key: "billing",
      label: "Hoá đơn",
      question: "Bạn hỏi gì về hoá đơn?",
      staffRoleIds: ["111111111111111111"],
    });
    check("saveKind tạo loại mới", out?.key === "billing" && e.ticketKinds.length === 1);
    check(
      "settingsChangedAt được bump (bot đọc qua cache 30 phút)",
      typeof e.guilds[0].settingsChangedAt === "number",
    );
    const rows = await listKindsH(e.ctx, { token: "tok", guildId: "g1" });
    check("listKinds trả về loại vừa tạo", rows[0]?.key === "billing");
    check("câu hỏi riêng được giữ", rows[0]?.question === "Bạn hỏi gì về hoá đơn?");
  }
  {
    // Upsert theo key: sửa nhãn thì KHÔNG tạo dòng thứ hai (ticket đã mở vẫn
    // tra được đúng loại đó).
    const e = env();
    await saveKindH(e.ctx, { token: "tok", guildId: "g1", key: "bug", label: "Lỗi" });
    await saveKindH(e.ctx, { token: "tok", guildId: "g1", key: "bug", label: "Báo lỗi" });
    check("saveKind lần 2 SỬA chứ không tạo dòng mới", e.ticketKinds.length === 1);
    check("nhãn đã cập nhật", e.ticketKinds[0].label === "Báo lỗi");
    check("loại mới chen XUÔNG CUỐI (order tăng dần)", e.ticketKinds[0].order === 1);
  }
  {
    // Chặn rác: mọi trường đều làm sạch ở tầng ghi, không để bot tự phòng thủ.
    const e = env();
    const bad = [
      [{ key: "CÓ DẤU", label: "x" }, "khoá có dấu"],
      [{ key: "", label: "x" }, "khoá rỗng"],
      [{ key: "ok", label: "   " }, "nhãn rỗng"],
      [{ key: "ok", label: "x", color: "đỏ" }, "màu sai định dạng"],
      [{ key: "ok", label: "x", emoji: "đá quý dài" }, "emoji sai định dạng"],
    ] as [Row, string][];
    for (const [args, label] of bad) {
      check(
        `saveKind chặn: ${label}`,
        await throws(() => saveKindH(e.ctx, { token: "tok", guildId: "g1", ...args })),
      );
    }
    check("loại sai KHÔNG được ghi", e.ticketKinds.length === 0);
    await saveKindH(e.ctx, {
      token: "tok",
      guildId: "g1",
      key: "ok",
      label: "x".repeat(200),
      question: "y".repeat(200),
    });
    check("nhãn bị cắt theo trần Discord", e.ticketKinds[0].label.length === 80);
    check("nhãn modal bị cắt theo trần Discord", e.ticketKinds[0].question.length === 45);
  }
  {
    // Trần số loại — chặn spam tài liệu.
    const e = env();
    for (let i = 0; i < MAX_KINDS; i++) {
      await saveKindH(e.ctx, { token: "tok", guildId: "g1", key: `k${i}`, label: `L${i}` });
    }
    check(
      `đủ ${MAX_KINDS} loại thì chặn loại thứ ${MAX_KINDS + 1}`,
      await throws(() =>
        saveKindH(e.ctx, { token: "tok", guildId: "g1", key: "over", label: "x" }),
      ),
    );
    check(
      "sửa loại đã có KHÔNG bị chặn bởi trần",
      (await saveKindH(e.ctx, { token: "tok", guildId: "g1", key: "k0", label: "đổi" })).key ===
        "k0",
    );
  }
  {
    // Thứ tự: index chỉ có guildId nên phải tự sắp theo `order`.
    const e = env();
    e.ticketKinds.push(
      { _id: "a", guildId: "g1", key: "a", label: "A", order: 3, enabled: true, createdAt: 1 },
      { _id: "b", guildId: "g1", key: "b", label: "B", order: 1, enabled: true, createdAt: 2 },
      { _id: "c", guildId: "g1", key: "c", label: "C", order: 2, enabled: false, createdAt: 3 },
    );
    const rows = await listKindsH(e.ctx, { token: "tok", guildId: "g1" });
    check(
      "listKinds sắp theo order (không theo thứ tự scan của index)",
      rows.map((r: Row) => r.key).join(",") === "b,c,a",
      rows.map((r: Row) => r.key).join(","),
    );
    const botRows = await botKindsH(e.ctx, { guildId: "g1", botKey: BOT_KEY });
    check(
      "botKinds CHỈ trả loại đang bật (loại tắt không dựng nút)",
      botRows.map((r: Row) => r.key).join(",") === "b,a",
      botRows.map((r: Row) => r.key).join(","),
    );
  }
  {
    // Bật/tắt là hành động thường ngày — phải giữ nguyên cấu hình câu hỏi.
    const e = env();
    e.ticketKinds.push({
      _id: "a",
      guildId: "g1",
      key: "a",
      label: "A",
      question: "Hỏi gì?",
      order: 1,
      enabled: true,
      createdAt: 1,
    });
    await setKindEnabledH(e.ctx, { token: "tok", guildId: "g1", key: "a", enabled: false });
    check(
      "tắt loại giữ nguyên câu hỏi (không mất cấu hình)",
      e.ticketKinds[0].question === "Hỏi gì?",
    );
    check("tắt loại → enabled = false", e.ticketKinds[0].enabled === false);
    check(
      "tắt loại cũng bump settingsChangedAt",
      typeof e.guilds[0].settingsChangedAt === "number",
    );
    check(
      "tắt loại KHÔNG tồn tại → báo lỗi",
      await throws(() =>
        setKindEnabledH(e.ctx, { token: "tok", guildId: "g1", key: "zzz", enabled: true }),
      ),
    );
  }
  {
    // Đổi thứ tự: đổi chỗ GIÁ TRỊ order, không cộng/trừ (trùng order thì nghẽn).
    const e = env();
    e.ticketKinds.push(
      { _id: "a", guildId: "g1", key: "a", label: "A", order: 5, enabled: true, createdAt: 1 },
      { _id: "b", guildId: "g1", key: "b", label: "B", order: 1, enabled: true, createdAt: 2 },
    );
    await swapOrderH(e.ctx, { token: "tok", guildId: "g1", keyA: "a", keyB: "b" });
    check(
      "swap đổi chỗ order của 2 loại",
      e.ticketKinds[0].order === 1 && e.ticketKinds[1].order === 5,
    );
    check(
      "swap cùng key là cấu hình vô nghĩa → không lỗi, không ghi",
      (await swapOrderH(e.ctx, { token: "tok", guildId: "g1", keyA: "a", keyB: "a" })).ok === true,
    );
    check(
      "swap loại không tồn tại → báo lỗi",
      await throws(() =>
        swapOrderH(e.ctx, { token: "tok", guildId: "g1", keyA: "a", keyB: "zzz" }),
      ),
    );
  }
  {
    // Trùng order (dữ liệu cũ) phải tách được, không để nghẽn hàng.
    const e = env();
    e.ticketKinds.push(
      { _id: "a", guildId: "g1", key: "a", label: "A", order: 2, enabled: true, createdAt: 1 },
      { _id: "b", guildId: "g1", key: "b", label: "B", order: 2, enabled: true, createdAt: 2 },
    );
    await swapOrderH(e.ctx, { token: "tok", guildId: "g1", keyA: "a", keyB: "b" });
    check("order trùng vẫn tách được sau swap", e.ticketKinds[0].order !== e.ticketKinds[1].order);
  }
  {
    // Xoá hẳn.
    const e = env();
    e.ticketKinds.push({
      _id: "a",
      guildId: "g1",
      key: "a",
      label: "A",
      order: 1,
      enabled: true,
      createdAt: 1,
    });
    await removeKindH(e.ctx, { token: "tok", guildId: "g1", key: "a" });
    check("removeKind xoá dòng", e.ticketKinds.length === 0);
    check("removeKind bump settingsChangedAt", typeof e.guilds[0].settingsChangedAt === "number");
    check(
      "xoá loại không tồn tại → không lỗi (idempotent)",
      (await removeKindH(e.ctx, { token: "tok", guildId: "g1", key: "zzz" })).ok === true,
    );
  }
  {
    // Quyền: KHÔNG ai đọc/ghi được loại ticket của server không manage.
    const e = env({ manageable: false });
    check(
      "không quyền → listKinds chặn",
      await throws(() => listKindsH(e.ctx, { token: "tok", guildId: "g1" })),
    );
    check(
      "không quyền → saveKind chặn",
      await throws(() => saveKindH(e.ctx, { token: "tok", guildId: "g1", key: "a", label: "A" })),
    );
    check(
      "không quyền → removeKind chặn",
      await throws(() => removeKindH(e.ctx, { token: "tok", guildId: "g1", key: "a" })),
    );
  }
  {
    // Bot key: không có nó thì bất kỳ ai cũng đọc được cấu hình mọi server.
    const e = env({ seed: null });
    e.ticketKinds.push({
      _id: "a",
      guildId: "g1",
      key: "a",
      label: "A",
      order: 1,
      enabled: true,
      createdAt: 1,
    });
    check("botKinds thiếu botKey → chặn", await throws(() => botKindsH(e.ctx, { guildId: "g1" })));
    check(
      "botKinds sai botKey → chặn",
      await throws(() => botKindsH(e.ctx, { guildId: "g1", botKey: "sai" })),
    );
  }

  // ═══ Ô NHẬP BỔ SUNG (phương án B — 29/09/2026) ═══
  console.log("\n── ticketKinds: ô nhập bổ sung ──");
  {
    const e = env();
    await saveKindH(e.ctx, {
      token: "tok",
      guildId: "g1",
      key: "billing",
      label: "Hoá đơn",
      fields: [
        { key: "amount", label: "Số tiền", required: true, long: true },
        { key: "order_id", label: "Mã đơn", placeholder: "AB-123" },
        // Trùng 2 ô cố định → phải bị bỏ, nếu không customId trùng là
        // Discord ném lỗi CẢ modal.
        { key: "ticket_body", label: "Trùng ô nội dung" },
        { key: "CÓ DẤU", label: "Khoá sai" },
        { key: "khongnhan", label: "   " },
      ],
    });
    const rows = await listKindsH(e.ctx, { token: "tok", guildId: "g1" });
    check(
      "chỉ giữ ô hợp lệ, bỏ ô trùng/khoá sai/không nhãn",
      (rows[0]?.fields ?? []).map((f: Row) => f.key).join(",") === "amount,order_id",
      JSON.stringify(rows[0]?.fields?.map((f: Row) => f.key)),
    );
    check(
      "bắt buộc + ô nhiều dòng được giữ",
      rows[0]?.fields?.[0]?.required === true && rows[0]?.fields?.[0]?.long === true,
    );
    check("placeholder được giữ", rows[0]?.fields?.[1]?.placeholder === "AB-123");
    check(
      "thiếu required/long → false (không phải undefined)",
      rows[0]?.fields?.[1]?.required === false && rows[0]?.fields?.[1]?.long === false,
    );
  }
  {
    // Trần 3 ô: Discord chỉ nhận 5 input 1 modal, 2 ô cố định đã chiếm 2 chỗ.
    const e = env();
    await saveKindH(e.ctx, {
      token: "tok",
      guildId: "g1",
      key: "a",
      label: "A",
      fields: Array.from({ length: 9 }, (_, i) => ({ key: `f${i}`, label: `F${i}` })),
    });
    const rows = await listKindsH(e.ctx, { token: "tok", guildId: "g1" });
    check(
      `cắt còn ${MAX_EXTRA_FIELDS} ô bổ sung`,
      rows[0]?.fields?.length === MAX_EXTRA_FIELDS,
      String(rows[0]?.fields?.length),
    );
  }
  {
    // Không khai ô bổ sung → mảng rỗng, modal vẫn đúng 2 ô như trước.
    const e = env();
    await saveKindH(e.ctx, { token: "tok", guildId: "g1", key: "a", label: "A" });
    const rows = await listKindsH(e.ctx, { token: "tok", guildId: "g1" });
    check(
      "loại không khai ô bổ sung → mảng rỗng",
      Array.isArray(rows[0]?.fields) && rows[0].fields.length === 0,
    );
  }

  console.log("\n── botOpenTicket: ghi ô bổ sung ──");
  {
    const e = env();
    await openH(e.ctx, {
      guildId: "g1",
      channelId: "c1",
      kind: "billing",
      openerId: "u1",
      openerName: "Minh",
      body: "nội dung",
      evidence: "",
      fields: [
        { label: "Số tiền", value: "250000" },
        { label: "Mã đơn", value: "   " },
        { label: "a".repeat(80), value: "b".repeat(900) },
      ],
      source: "panel",
      botKey: BOT_KEY,
    });
    const t = e.tickets[0];
    check(
      "ô rỗng bị lọc khỏi bản ghi",
      t.fields.length === 2,
      JSON.stringify(t.fields.map((x: Row) => x.label)),
    );
    check(
      "giá trị ô bị cắt 300 ký tự",
      t.fields[1].value.length === 300,
      String(t.fields[1].value.length),
    );
    check(
      "nhãn ô bị cắt 45 ký tự",
      t.fields[1].label.length === 45,
      String(t.fields[1].label.length),
    );
    check("không lưu khoá ô (chỉ cần nhãn + giá trị)", !("key" in t.fields[0]));
  }
  {
    // Không gửi ô bổ sung (ticket mở bằng lệnh /ticket hoặc từ DM) → không lỗi.
    const e = env();
    await openH(e.ctx, {
      guildId: "g1",
      channelId: "c1",
      kind: "support",
      openerId: "u1",
      openerName: "Minh",
      body: "b",
      source: "command",
      botKey: BOT_KEY,
    });
    check(
      "ticket không có ô bổ sung vẫn tạo được",
      e.tickets.length === 1 && e.tickets[0].fields === undefined,
    );
  }

  console.log(`\nKết quả tickets-convex: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
})();
