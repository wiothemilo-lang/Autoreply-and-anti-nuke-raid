// TEST: lưu lượng trang tự host (convex/analytics.ts).
//
// Chạy: bun scripts/test-analytics.ts
//
// Vì sao test này tồn tại: `pageView` là endpoint CÔNG KHAI (không token) —
// sai một luật ở đây là hoặc rác khắp bảng, hoặc dấu vết người dùng lọt vào
// bảng dữ liệu:
//   1. Whitelist đường dẫn lỏng = /dashboard/<id server> đi thẳng vào bảng.
//   2. Thiếu trần đốt = một script thiêu hết storage/biểu đồ trong vài phút.
//   3. Thiếu trần ngày = bảng phình vô hạn (mỗi ngày × mỗi đường dẫn).
//   4. `stats` thiếu requireBotAdmin = khách thường đọc được lưu lượng.
//   5. Thiếu phép kiểm ngày VN = "7 ngày qua" lệch 7 tiếng với người dùng.
//
// Hermetic: không mạng, không DB thật — ctx giả trong nhớ, gọi thẳng `._handler`
// của Convex (cùng khuôn test-announcements / test-feedback).
import {
  KEEP_DAYS,
  PATH_MAX,
  RATE_MAX_IN_WINDOW,
  RATE_WINDOW_MS,
  STATS_DAYS,
  TOP_PATHS,
  TRIM_BATCH,
  dayKey,
  normalizePath,
  pageView,
  stats,
  trimAnalytics,
} from "../convex/analytics";
import { CURRENT_SESSION_AUTH_VERSION } from "../convex/auth";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(ok ? `  ✅ ${label}` : `  ❌ ${label}`);
  if (!ok) {
    fail++;
    if (detail !== undefined) console.log("     ", detail);
  } else pass++;
};

async function expectThrows(label: string, fn: () => Promise<unknown>, needle: string) {
  try {
    await fn();
    check(label, false, "không ném lỗi");
  } catch (e: any) {
    check(label, String(e?.message ?? e).includes(needle), e?.message ?? e);
  }
}

type Row = Record<string, any>;

/**
 * Ctx giả: query/withIndex/order/first/collect/take + get/insert/patch/delete.
 * `order("desc")` đảo mảng (dữ liệu test được đẩy theo thứ tự tạo mới → đúng
 * nghĩa "mới nhất trước" của index đơn).
 */
function makeCtx(tables: Record<string, Row[]>) {
  let idSeq = 0;
  const allRows = () => Object.values(tables).flat();
  const view = (out: Row[]): any => ({
    first: async () => out[0] ?? null,
    collect: async () => out,
    take: async (n: number) => out.slice(0, n),
    order: (dir?: string) => view(dir === "desc" ? [...out].reverse() : [...out]),
  });
  const db = {
    query: (table: string) => {
      const rows = tables[table] ?? [];
      return {
        withIndex: (_name: string, bound?: (q: any) => any) => {
          const caps: Array<{ f: string; op: string; v: any }> = [];
          const q: any = {
            eq: (f: string, v: any) => (caps.push({ f, op: "eq", v }), q),
            gte: (f: string, v: any) => (caps.push({ f, op: "gte", v }), q),
            lte: (f: string, v: any) => (caps.push({ f, op: "lte", v }), q),
            lt: (f: string, v: any) => (caps.push({ f, op: "lt", v }), q),
            field: (f: string) => f,
          };
          bound?.(q);
          const out = rows.filter((r) =>
            caps.every(({ f, op, v }) =>
              op === "eq"
                ? r[f] === v
                : op === "gte"
                  ? r[f] >= v
                  : op === "lte"
                    ? r[f] <= v
                    : r[f] < v,
            ),
          );
          return view(out);
        },
        ...view(rows),
      };
    },
    get: async (id: string) => allRows().find((r) => r._id === id) ?? null,
    insert: async (table: string, row: Row) => {
      const _id = `id${++idSeq}`;
      (tables[table] ??= []).push({ ...row, _id });
      return _id;
    },
    patch: async (id: string, patch: Row) => {
      const r = allRows().find((x) => x._id === id);
      if (r) Object.assign(r, patch);
    },
    delete: async (id: string) => {
      for (const arr of Object.values(tables)) {
        const i = arr.findIndex((r) => r._id === id);
        if (i >= 0) {
          arr.splice(i, 1);
          return;
        }
      }
    },
  };
  return { db } as any;
}

const OWNER = "123456789012345678";
const TEAM = "555555555555555555";
const STRANGER = "999999999999999999";

function seed() {
  const t = Date.now();
  return {
    users: [
      { _id: "u1", discordId: OWNER, username: "tester", globalName: "Tester" },
      { _id: "u_x", discordId: STRANGER, username: "stranger" },
    ],
    sessions: [
      {
        _id: "s1",
        token: "tok-good",
        userId: "u1",
        createdAt: t,
        authVersion: CURRENT_SESSION_AUTH_VERSION,
      },
      {
        _id: "s_x",
        token: "tok-x",
        userId: "u_x",
        createdAt: t,
        authVersion: CURRENT_SESSION_AUTH_VERSION,
      },
    ],
    botStatus: [
      {
        _id: "bot1",
        kind: "status",
        ownerDiscordId: OWNER,
        teamAdminDiscordIds: [TEAM],
      },
    ],
    pageViews: [],
    analyticsRate: [],
  } as Record<string, Row[]>;
}

const pageViewH = (pageView as any)._handler;
const statsH = (stats as any)._handler;
const DAY_MS = 86_400_000;

const run = async () => {
  console.log("── #1 normalizePath: whitelist đầu vào công khai ──");
  {
    check(
      "/ và các trang công khai hợp lệ",
      normalizePath("/") === "/" &&
        normalizePath("/features") === "/premium".replace("premium", "features"),
    );
    check(
      "bỏ gạch chéo cuối: /features/ === /features",
      normalizePath("/features/") === "/features",
    );
    check("thiếu gạch chéo đầu → null", normalizePath("features") === null);
    check(
      "/dashboard/<id server> → null (đường dẫn riêng tư không bao giờ được đếm)",
      normalizePath("/dashboard/123456789012345678") === null &&
        normalizePath("/dashboard") === null,
    );
    check("/admin → null (khu vực chỉ chủ bot)", normalizePath("/admin") === null);
    check(
      "query/hash → null (chỉ đếm phần đường dẫn, không nhận rác kèm)",
      normalizePath("/a?b=1") === null && normalizePath("/a#x") === null,
    );
    check(
      "gạch chéo đôi + ký tự lạ (unicode, dấu .) → null",
      normalizePath("/a//b") === null &&
        normalizePath("/khoá") === null &&
        normalizePath("/a..b") === null,
    );
    check(
      `dài hơn ${PATH_MAX} ký tự → null; đúng trần vẫn nhận`,
      normalizePath("/" + "a".repeat(PATH_MAX)) === null &&
        normalizePath("/" + "a".repeat(PATH_MAX - 1)) === "/" + "a".repeat(PATH_MAX - 1),
    );
  }

  console.log("\n── #2 dayKey: mốc ngày theo GIỜ VIỆT NAM (UTC+7) ──");
  {
    check(
      "18:00 UTC ngày 13 = 01:00 VN ngày 14 → khoá ngày 14",
      dayKey(Date.UTC(2026, 9, 13, 18, 0, 0)) === "2026-10-14",
    );
    check(
      "16:59 UTC ngày 13 = 23:59 VN ngày 13 → vẫn là ngày 13",
      dayKey(Date.UTC(2026, 9, 13, 16, 59, 0)) === "2026-10-13",
    );
  }

  console.log("\n── #3 pageView: ghi theo ngày, cộng dồn đúng ──");
  {
    const tables = { pageViews: [], analyticsRate: [] } as Record<string, Row[]>;
    const r1 = await pageViewH(makeCtx(tables), { path: "/features" });
    const row = tables.pageViews[0];
    check(
      "lượt đầu → counted:true, ghi đúng (ngày hôm nay VN, path, count 1)",
      r1.counted === true &&
        row.day === dayKey(Date.now()) &&
        row.path === "/features" &&
        row.count === 1,
      row,
    );
    const r2 = await pageViewH(makeCtx(tables), { path: "/features" });
    check(
      "lượt thứ hai cùng ngày → CỘNG DỒN vào đúng dòng cũ (không tạo dòng mới)",
      r2.counted === true && tables.pageViews.length === 1 && tables.pageViews[0].count === 2,
      tables.pageViews,
    );
    await pageViewH(makeCtx(tables), { path: "/premium" });
    check("đường dẫn khác → dòng riêng", tables.pageViews.length === 2);
    const bad = await pageViewH(makeCtx(tables), { path: "/dashboard/999" });
    check(
      "đường dẫn riêng tư → counted:false, KHÔNG ghi gì",
      bad.counted === false && tables.pageViews.length === 2,
    );
    check(
      "dòng khoá chống đốt được tạo kèm (count 1 của cửa sổ đầu)",
      tables.analyticsRate.length === 1 && tables.analyticsRate[0].count === 3,
      tables.analyticsRate,
    );
  }

  console.log("\n── #4 trần chống đốt theo cửa sổ ──");
  {
    const tables = {
      pageViews: [],
      analyticsRate: [
        { _id: "r1", kind: "analyticsRate", windowStart: Date.now(), count: RATE_MAX_IN_WINDOW },
      ],
    } as Record<string, Row[]>;
    const r = await pageViewH(makeCtx(tables), { path: "/" });
    check(
      "chạm trần trong cửa sổ → counted:false, không tạo dòng (script không đốt được)",
      r.counted === false && tables.pageViews.length === 0,
    );
  }
  {
    const tables = {
      pageViews: [],
      analyticsRate: [
        {
          _id: "r1",
          kind: "analyticsRate",
          windowStart: Date.now() - RATE_WINDOW_MS - 5_000,
          count: RATE_MAX_IN_WINDOW,
        },
      ],
    } as Record<string, Row[]>;
    const r = await pageViewH(makeCtx(tables), { path: "/" });
    check(
      "cửa sổ cũ đã hết → mở cửa sổ mới (count reset về 1) và đếm bình thường",
      r.counted === true && tables.analyticsRate[0].count === 1 && tables.pageViews.length === 1,
      tables.analyticsRate[0],
    );
  }

  console.log("\n── #5 trần lưu trữ: dọn ngày quá cũ ──");
  {
    const old = dayKey(Date.now() - (KEEP_DAYS + 1) * DAY_MS);
    const cutoff = dayKey(Date.now() - KEEP_DAYS * DAY_MS);
    const tables = {
      pageViews: [
        { _id: "a", day: old, path: "/", count: 1, updatedAt: 1 },
        { _id: "b", day: old, path: "/features", count: 1, updatedAt: 1 },
        { _id: "c", day: cutoff, path: "/", count: 1, updatedAt: 1 },
        { _id: "d", day: dayKey(Date.now()), path: "/", count: 1, updatedAt: 1 },
      ],
    } as Record<string, Row[]>;
    const removed = await trimAnalytics(makeCtx(tables));
    check(
      "chỉ xoá ngày CŨ HƠN ngày biên; ngày biên + hôm nay giữ nguyên",
      removed === 2 && tables.pageViews.map((r) => r._id).join(",") === "c,d",
      tables.pageViews.map((r) => r._id).join(","),
    );
  }
  {
    const old = dayKey(Date.now() - (KEEP_DAYS + 30) * DAY_MS);
    const rows = Array.from({ length: TRIM_BATCH + 15 }, (_, i) => ({
      _id: `o${i}`,
      day: old,
      path: "/",
      count: 1,
      updatedAt: 1,
    }));
    const tables = { pageViews: rows } as Record<string, Row[]>;
    const removed = await trimAnalytics(makeCtx(tables));
    check(
      `tồn đọng lớn → xoá đúng MỘT lô ${TRIM_BATCH} (không chạm cả bảng trong một lượt)`,
      removed === TRIM_BATCH && tables.pageViews.length === 15,
      `removed=${removed}`,
    );
  }

  console.log("\n── #6 stats: cổng quyền + tổng hợp ──");
  {
    const tables = seed();
    await expectThrows(
      "chưa đăng nhập (token rỗng) → bị chặn ngay",
      () => statsH(makeCtx(tables), { token: "" }),
      "Vui lòng đăng nhập",
    );
    await expectThrows(
      "người dùng thường → bị requireBotAdmin chặn",
      () => statsH(makeCtx(tables), { token: "tok-x" }),
      "Chỉ chủ sở hữu bot hoặc quản trị viên nhóm",
    );
  }
  {
    const tables = seed();
    const today = dayKey(Date.now());
    const d3 = dayKey(Date.now() - 3 * DAY_MS);
    const d10 = dayKey(Date.now() - 10 * DAY_MS);
    const d40 = dayKey(Date.now() - 40 * DAY_MS);
    tables.pageViews.push(
      { _id: "v1", day: today, path: "/features", count: 3, updatedAt: 1 },
      { _id: "v2", day: d3, path: "/", count: 5, updatedAt: 1 },
      { _id: "v3", day: d10, path: "/premium", count: 7, updatedAt: 1 },
      { _id: "v4", day: d40, path: "/old", count: 100, updatedAt: 1 },
      ...Array.from({ length: 12 }, (_, i) => ({
        _id: `x${i}`,
        day: today,
        path: `/p${i}`,
        count: 1,
        updatedAt: 1,
      })),
    );
    const res = await statsH(makeCtx(tables), { token: "tok-good" });
    check("chủ bot đọc được số liệu", !!res && typeof res.total30d === "number", res);
    check(
      "total7d = đúng các lượt trong 7 ngày (3+5+12 dòng thử topPaths)",
      res.total7d === 20,
      res.total7d,
    );
    check(
      "total30d gồm cả d10 nhưng KHÔNG gồm d40 (ngoài cửa sổ 30 ngày)",
      res.total30d === 27,
      res.total30d,
    );
    check(
      `topPaths xếp giảm dần và kẹp về ${TOP_PATHS} dòng`,
      res.topPaths.length === TOP_PATHS &&
        res.topPaths[0].path === "/premium" &&
        res.topPaths[0].count === 7 &&
        res.topPaths[1].path === "/" &&
        res.topPaths[1].count === 5 &&
        res.topPaths.every((r: any, i: number) => i === 0 || res.topPaths[i - 1].count >= r.count),
      res.topPaths.map((r: any) => `${r.path}:${r.count}`).join(" "),
    );
    check(
      "stats không trả field nào ngoài hợp đồng card Admin",
      Object.keys(res).join(",") === "total7d,total30d,topPaths",
    );
  }

  console.log("\n── #7 hợp đồng tham số: endpoint công khai KHÔNG nhận token ──");
  {
    // `exportArgs()` là JSON validator THẬT mà Convex dùng để chặn args trước
    // handler — đọc thẳng nó thay vì tin vào niềm tin "mình viết đúng".
    const pvArgs = String((pageView as any).exportArgs?.() ?? "");
    check(
      "pageView chỉ nhận path — không có token (không được có cổng quyền giả)",
      pvArgs.includes('"path"') && !pvArgs.includes('"token"'),
      pvArgs,
    );
    const stArgs = String((stats as any).exportArgs?.() ?? "");
    check(
      "stats chỉ nhận token (số liệu không lộ cho khách, không có tham số thừa)",
      stArgs.includes('"token"') && !stArgs.includes('"path"'),
      stArgs,
    );
    check(
      `trần ngày STATS_DAYS=${STATS_DAYS} nhỏ hơn trần lưu trữ KEEP_DAYS=${KEEP_DAYS} (thống kê luôn đủ dữ liệu)`,
      STATS_DAYS < KEEP_DAYS,
    );
  }

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
};

void run();
