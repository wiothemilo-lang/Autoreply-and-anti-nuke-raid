// TEST: convex/channelLocks.ts — lưu/đọc/xoá bản ghi khoá kênh của `/lock`.
// Chạy: bun scripts/test-channel-locks-convex.ts
//
// Vì sao cần test riêng cho tầng Convex: bất biến quan trọng nhất của cả
// tính năng — `prev` (quyền trước khi khoá) — được BẢO VỆ ở mutation, không
// chỉ ở bot. Lý do: bot chạy 2 tiến trình (hoặc người dùng bấm khoá 2 lần)
// thì handler bỏ qua kênh đã khoá chỉ là lớp phòng thủ đầu tiên; chỗ
// bảo đảm thật sự là mutation. Nếu mutation ghi đè `prev` thì mọi bản ghi sau
// đó đều mở sai — và hậu quả là kênh kẹt vĩnh viễn, không ai mở được.
import {
  botSaveChannelLock,
  botReleaseChannelLock,
  botDueChannelLocks,
  listChannelLocks,
  botChannelLocks,
} from "../convex/channelLocks";
import { computeBotKey } from "../convex/botAuth";

const BOT_KEY = "khoa-bot-that-giu-nguyen";
type Row = Record<string, any>;

const saveH = (botSaveChannelLock as any)._handler;
const releaseH = (botReleaseChannelLock as any)._handler;
const dueH = (botDueChannelLocks as any)._handler;
const listH = (listChannelLocks as any)._handler;
const forGuildH = (botChannelLocks as any)._handler;

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "PASS" : "FAIL"} ${label}${ok || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`,
  );
  ok ? pass++ : fail++;
};

/**
 * Ctx giả: bảng `channelLocks` trên mảng, `withIndex` mô phỏng đúng range
 * của Convex: `eq` + cận `gt`/`lte` theo THỨ TỰ KIỂU của Convex trong index
 * (undefined < null < số). Bản cũ chỉ khớp `typeof === "number"` nên che mất bug
 * thật: `lte("until", now)` một mình khớp cả khoá vô hạn (thiếu `until`).
 */
const typeRank = (x: unknown) => (x === undefined ? 0 : x === null ? 1 : 2);
const convexCmp = (a: unknown, b: unknown) =>
  typeRank(a) - typeRank(b) || (typeRank(a) === 2 ? (a as number) - (b as number) : 0);

function makeCtx(guildOverrides: Row = {}) {
  const locks: Row[] = [];
  const users: Row[] = [{ _id: "u1", discordId: "owner-1", manageableGuildIds: ["server-1"] }];
  const sessions: Row[] = [
    { _id: "s1", token: "tok", userId: "u1", createdAt: Date.now(), authVersion: 1 },
  ];
  const guilds: Row[] = [{ _id: "g1", discordId: "server-1", ...guildOverrides }];
  const botStatus: Row[] = [{ _id: "st1", kind: "status", botKeySeed: computeBotKey(BOT_KEY) }];
  const tables: Record<string, Row[]> = { channelLocks: locks, users, sessions, guilds, botStatus };
  let seq = 0;
  const all = () => [...locks, ...users, ...sessions, ...guilds, ...botStatus];
  const ctx = {
    now: 1_700_000_000_000,
    db: {
      insert: async (table: string, doc: Row) => {
        const id = `${table}-${++seq}`;
        (tables[table] ?? (tables[table] = [])).push({ _id: id, ...doc });
        return id;
      },
      get: async (id: string) => all().find((r) => r._id === id) ?? null,
      patch: async (id: string, p: Row) => {
        const row = all().find((r) => r._id === id);
        if (row) Object.assign(row, p);
      },
      delete: async (id: string) => {
        const t = tables.channelLocks;
        const i = t.findIndex((r) => r._id === id);
        if (i >= 0) t.splice(i, 1);
      },
      query: (table: string) => ({
        withIndex: (_name: string, bound: (q: any) => any) => {
          const capture: Record<string, unknown> = {};
          const ranges: Array<["lte" | "gt", string, unknown]> = [];
          const q: any = {
            eq: (f: string, v: unknown) => ((capture[f] = v), q),
            lte: (f: string, v: unknown) => (ranges.push(["lte", f, v]), q),
            gt: (f: string, v: unknown) => (ranges.push(["gt", f, v]), q),
          };
          bound(q);
          const rows = (tables[table] ?? []).filter(
            (r) =>
              Object.entries(capture).every(([f, v]) => r[f] === v) &&
              ranges.every(([op, f, v]) =>
                op === "lte" ? convexCmp(r[f], v) <= 0 : convexCmp(r[f], v) > 0,
              ),
          );
          return {
            first: async () => rows[0] ?? null,
            collect: async () => [...rows],
            take: async (n: number) => rows.slice(0, n),
          };
        },
      }),
    },
  };
  return { ctx, locks, guilds };
}

(async () => {
  const save = (ctx: any, args: Row) => saveH(ctx, { botKey: BOT_KEY, ...args });

  // ═══ 1. BẤT BIẾN: khoá 2 lần KHÔNG được ghi đè `prev` ═══
  console.log("\n── botSaveChannelLock: giữ prev qua lần khoá thứ hai ──");
  {
    const { ctx, locks } = makeCtx();
    const r1 = await save(ctx, {
      guildId: "server-1",
      channelId: "c1",
      roleId: "EVERYONE",
      kind: "text",
      prev: true,
    });
    check("lần 1: tạo mới", r1.ok === true && r1.alreadyLocked === false, r1);
    check("lần 1: lưu prev = true", locks[0].prev === true, locks[0]?.prev);

    // Lần 2: bot lỡ đọc quyền hiện tại (đang là false) rồi gửi lên.
    const r2 = await save(ctx, {
      guildId: "server-1",
      channelId: "c1",
      roleId: "EVERYONE",
      kind: "text",
      prev: false,
    });
    check("lần 2: báo đã khoá", r2.alreadyLocked === true, r2);
    check(
      "⚠️ lần 2 GIỮ prev gốc (không nhận false của lần đọc sai)",
      locks[0].prev === true,
      locks[0]?.prev,
    );
    check("lần 2: không tạo bản ghi thừa", locks.length === 1, locks.length);
  }
  {
    // prev = null (kế thừa) cũng phải giữ, không bị coi là "không có".
    const { ctx, locks } = makeCtx();
    await save(ctx, {
      guildId: "server-1",
      channelId: "c1",
      roleId: "E",
      kind: "text",
      prev: null,
    });
    await save(ctx, {
      guildId: "server-1",
      channelId: "c1",
      roleId: "E",
      kind: "text",
      prev: false,
    });
    check("prev = null cũng được giữ", locks[0].prev === null, locks[0]?.prev);
  }
  {
    // Cập nhật hạn/lý do vẫn phải chạy khi khoá lại (khoá vô hạn → có hạn).
    const { ctx, locks } = makeCtx();
    await save(ctx, {
      guildId: "server-1",
      channelId: "c1",
      roleId: "E",
      kind: "text",
      prev: true,
    });
    await save(ctx, {
      guildId: "server-1",
      channelId: "c1",
      roleId: "E",
      kind: "text",
      prev: true,
      until: 123,
      reason: "sự cố",
    });
    check("khoá lại vẫn cập nhật hạn", locks[0].until === 123, locks[0]?.until);
    check("khoá lại vẫn cập nhật lý do", locks[0].reason === "sự cố", locks[0]?.reason);
  }
  {
    // Chỉ có 1 bản ghi cho mỗi (guild, kênh, role) — 3 role khác nhau thì tách bản ghi.
    const { ctx, locks } = makeCtx();
    await save(ctx, {
      guildId: "server-1",
      channelId: "c1",
      roleId: "E",
      kind: "text",
      prev: null,
    });
    await save(ctx, {
      guildId: "server-1",
      channelId: "c1",
      roleId: "R1",
      kind: "text",
      prev: null,
    });
    await save(ctx, {
      guildId: "server-1",
      channelId: "c2",
      roleId: "E",
      kind: "text",
      prev: null,
    });
    check("mỗi (kênh, role) một bản ghi", locks.length === 3, locks.length);
  }
  {
    const { ctx, locks } = makeCtx();
    await save(ctx, {
      guildId: "server-1",
      channelId: "c1",
      roleId: "E",
      kind: "text",
      prev: null,
      reason: "x".repeat(500),
      lockedBy: "y".repeat(200),
    });
    check("cắt lý do ở 200 ký tự", locks[0].reason.length === 200, locks[0].reason.length);
    check("cắt người khoá ở 64 ký tự", locks[0].lockedBy.length === 64, locks[0].lockedBy.length);
  }

  // ═══ 2. Khoá VÔ HẠN không nằm trong index by_due ═══
  console.log("\n── botDueChannelLocks: vô hạn không bao giờ tự mở ──");
  {
    const { ctx, locks } = makeCtx();
    await save(ctx, {
      guildId: "server-1",
      channelId: "forever",
      roleId: "E",
      kind: "text",
      prev: null,
    });
    await save(ctx, {
      guildId: "server-1",
      channelId: "expired",
      roleId: "E",
      kind: "text",
      prev: null,
      until: Date.now() - 1000,
    });
    await save(ctx, {
      guildId: "server-1",
      channelId: "future",
      roleId: "E",
      kind: "text",
      prev: null,
      until: Date.now() + 3_600_000,
    });
    const due = await dueH(ctx, { botKey: BOT_KEY });
    const ids = due.map((r: Row) => r.channelId).sort();
    check("chỉ trả về khoá ĐÃ hết hạn", JSON.stringify(ids) === JSON.stringify(["expired"]), ids);
    check("khoá vô hạn không lọt vào", !ids.includes("forever"));
    check("khoá chưa hết hạn không lọt vào", !ids.includes("future"));
  }

  // ═══ 3. Mở khoá → xoá bản ghi ═══
  console.log("\n── botReleaseChannelLock ──");
  {
    const { ctx, locks } = makeCtx();
    await save(ctx, {
      guildId: "server-1",
      channelId: "c1",
      roleId: "E",
      kind: "text",
      prev: true,
    });
    await save(ctx, {
      guildId: "server-1",
      channelId: "c1",
      roleId: "R1",
      kind: "text",
      prev: true,
    });
    const r1 = await releaseH(ctx, {
      botKey: BOT_KEY,
      guildId: "server-1",
      channelId: "c1",
      roleId: "E",
    });
    check("xoá đúng 1 bản ghi", r1.removed === 1 && locks.length === 1, { r1, n: locks.length });
    check("không xoá nhầm role khác", locks[0].roleId === "R1", locks[0]?.roleId);
    const r2 = await releaseH(ctx, {
      botKey: BOT_KEY,
      guildId: "server-1",
      channelId: "c1",
      roleId: "E",
    });
    check("mở 2 lần vẫn ok, không lỗi", r2.ok === true && r2.removed === 0, r2);
  }
  {
    const { ctx, locks } = makeCtx();
    await save(ctx, {
      guildId: "server-1",
      channelId: "c1",
      roleId: "E",
      kind: "text",
      prev: true,
    });
    await releaseH(ctx, { botKey: BOT_KEY, guildId: "server-1", channelId: "c1", roleId: "KHAC" });
    check("mở sai role → KHÔNG xoá bản ghi nào", locks.length === 1, locks.length);
  }

  // ═══ 4. Đọc danh sách ═══
  console.log("\n── botChannelLocks / listChannelLocks ──");
  {
    const { ctx } = makeCtx();
    await save(ctx, {
      guildId: "server-1",
      channelId: "c1",
      roleId: "E",
      kind: "text",
      prev: null,
    });
    const rows = await forGuildH(ctx, { botKey: BOT_KEY, guildId: "server-1" });
    check(
      "bot đọc được bản ghi của server",
      rows.length === 1 && rows[0].channelId === "c1",
      rows.length,
    );
    check("bản ghi trả về có prev để khôi phục", "prev" in rows[0], Object.keys(rows[0]));
  }
  {
    const { ctx } = makeCtx();
    await save(ctx, {
      guildId: "server-1",
      channelId: "c1",
      roleId: "E",
      kind: "text",
      prev: null,
    });
    const rows = await listH(ctx, { token: "tok", guildId: "server-1" });
    check("chủ server đọc được", rows.length === 1, rows.length);
    check("`until` thiếu → null (để UI hiện 'vô hạn')", rows[0].until === null, rows[0]?.until);
    check("danh sách không lộ prev nội bộ", !("prev" in rows[0]), Object.keys(rows[0]));
  }
  {
    const { ctx } = makeCtx();
    await save(ctx, {
      guildId: "server-1",
      channelId: "c1",
      roleId: "E",
      kind: "text",
      prev: null,
    });
    let threw = false;
    try {
      await listH(ctx, { token: "sai-token", guildId: "server-1" });
    } catch {
      threw = true;
    }
    check("token sai → từ chối", threw);
  }
  {
    // Không manage guild → từ chối (bảng này là dữ liệu vận hành nội bộ).
    const { ctx } = makeCtx();
    ctx.db.patch("u1", { manageableGuildIds: ["server-khac"] });
    let threw = false;
    try {
      await listH(ctx, { token: "tok", guildId: "server-1" });
    } catch {
      threw = true;
    }
    check("không manage guild → từ chối", threw);
  }

  // ═══ 5. Bảo mật: thiếu botKey ═══
  console.log("\n── chặn ghi khi thiếu botKey ──");
  {
    const { ctx } = makeCtx();
    let threw = false;
    try {
      await saveH(ctx, {
        guildId: "server-1",
        channelId: "c1",
        roleId: "E",
        kind: "text",
        prev: null,
      });
    } catch {
      threw = true;
    }
    check("botSaveChannelLock thiếu botKey → từ chối", threw);
    threw = false;
    try {
      await releaseH(ctx, { guildId: "server-1", channelId: "c1", roleId: "E" });
    } catch {
      threw = true;
    }
    check("botReleaseChannelLock thiếu botKey → từ chối", threw);
  }

  console.log(`\nKết quả channel-locks-convex: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
})();
