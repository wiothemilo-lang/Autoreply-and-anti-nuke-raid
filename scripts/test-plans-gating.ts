// TEST: quyền lợi theo GÓI (convex/plans.ts) + 4 điểm chặn thật (08/10/2026).
// Chạy: bun scripts/test-plans-gating.ts
//
// VÌ SAO CẦN: trước đây /premium quảng cáo 6 tính năng mà KHÔNG có gì chặn —
// khách trả tiền xong không thấy khác gì (bán thứ không tồn tại). Bộ test này
// khoá đúng ba thứ dễ vỡ lại nhất:
//   1. BẢNG HẠN MỨC LÀ THẬT — mọi gói đều có trần cụ thể, gói cao nhất chạm
//      trần cứng (không có "vô hạn" ghi cho oai rồi chặn ở nơi khác).
//   2. LỖI NÓI RÕ ĐƯỜNG NÂNG CẤP — "Gói Miễn phí cho tối đa 5 rule… nâng lên
//      gói Đồng hành để dùng 30". Lỗi mơ hồ khiến khách tưởng bot hỏng.
//   3. ENFORCE Ở TẦNG GHI — gọi thẳng mutation phải bị chặn y như UI, và mua
//      gói xong (entitlement còn hạn của ĐÚNG server) là mở được ngay.
//   4. ĐẶC QUYỀN DỮ LIỆU (P1–P4, 10/10/2026) — xuất CSV (số dòng + cửa sổ ngày),
//      trần bảng nhiệt và trần log hành động đều đọc CÙNG bảng hạn mức và chặn
//      ở tầng ĐỌC (không phải ẩn nút), kèm cổng TĨNH chống revert 4 điểm chặn.
// Hermetic: không mạng, không DB thật — ctx giả trong bộ nhớ.
import { readFileSync } from "node:fs";
import {
  HARD_CAPS,
  PLAN_LIMITS,
  TERMS_VERSION,
  asPlanId,
  assertWithinLimit,
  catalog,
  nextPlan,
  planForGuild,
  planLimits,
} from "../convex/plans";
import { add as autoReplyAdd } from "../convex/autoreplies";
import { exportGuildCsv } from "../convex/dataExport";
import { heatLeaderboard } from "../convex/reports";
import { getGuild } from "../convex/guilds";
import { setRetention } from "../convex/backup";
import { importGuildConfigHandler } from "../convex/guilds/configPortability";
import { CURRENT_SESSION_AUTH_VERSION } from "../convex/auth";

type Row = Record<string, any>;

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "PASS" : "FAIL"} ${label}${ok || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`,
  );
  ok ? pass++ : fail++;
};

async function expectThrow(label: string, run: () => Promise<unknown>, match: RegExp) {
  let msg = "";
  try {
    await run();
  } catch (e) {
    msg = e instanceof Error ? e.message : String(e);
  }
  check(label, match.test(msg), msg || "(KHÔNG ném lỗi)");
  return msg;
}

const GUILD = "111111111111111111";
const OWNER = "222222222222222222";
const DAY = 24 * 60 * 60 * 1000;

/**
 * Field SỐ cuối cùng của index — Convex `.order("desc")` trên index sắp theo
 * field cuối đó (by_guildId_createdAt → createdAt). Suy từ TÊN index để ctx giả
 * trả đúng thứ tự code thật mong đợi; không có field số → giữ nguyên thứ tự chèn
 * (các assertion cũ ở đây dựa vào đó).
 */
function indexSortField(indexName: string, rows: Row[]): string | null {
  for (const field of indexName.replace(/^by_/, "").split("_").reverse()) {
    if (rows.some((r) => typeof r[field] === "number")) return field;
  }
  return null;
}

/** Ctx giả: bảng trên mảng, `withIndex` lọc theo eq/gte/lte được gọi. */
function makeCtx(tables: Record<string, Row[]>) {
  let idSeq = 0;
  const db = {
    query(table: string) {
      const rows = tables[table] ?? [];
      const view = (start: Row[], sortField: string | null = null): any => {
        let out = start;
        const api: any = {
          first: async () => out[0] ?? null,
          collect: async () => out,
          take: async (n: number) => out.slice(0, n),
          order: (dir: string = "asc") => {
            const sf = sortField;
            if (sf) {
              out = [...out].sort((a, b) =>
                dir === "desc" ? Number(b[sf]) - Number(a[sf]) : Number(a[sf]) - Number(b[sf]),
              );
            }
            return api;
          },
        };
        return api;
      };
      return {
        withIndex(indexName: string, build: (q: any) => any) {
          const conds: [string, unknown][] = [];
          const ranges: [string, "gte" | "lte", number][] = [];
          const q: any = {
            eq: (field: string, value: unknown) => {
              conds.push([field, value]);
              return q;
            },
            // Range theo createdAt (xuất dữ liệu lọc theo cửa sổ ngày của gói).
            gte: (field: string, value: number) => {
              ranges.push([field, "gte", value]);
              return q;
            },
            lte: (field: string, value: number) => {
              ranges.push([field, "lte", value]);
              return q;
            },
          };
          build(q);
          const matched = rows
            .filter((r) => conds.every(([f, v]) => r[f] === v))
            .filter((r) =>
              ranges.every(([f, op, v]) =>
                op === "gte" ? Number(r[f] ?? 0) >= v : Number(r[f] ?? 0) <= v,
              ),
            );
          return view(matched, indexSortField(indexName, rows));
        },
        ...view(rows),
      };
    },
    get: async (id: string) =>
      Object.values(tables)
        .flat()
        .find((r) => r._id === id) ?? null,
    insert: async (table: string, row: Row) => {
      const _id = `id${++idSeq}`;
      (tables[table] ??= []).push({ ...row, _id });
      return _id;
    },
    patch: async (id: string, patch: Row) => {
      const r = Object.values(tables)
        .flat()
        .find((x) => x._id === id);
      if (r) Object.assign(r, patch);
    },
  };
  return { db } as any;
}

/** Bảng tối thiểu: chủ server + phiên + server + entitlement (tuỳ chọn). */
function seed(opts: { entitlements?: Row[]; rules?: number } = {}) {
  const now = Date.now();
  const tables: Record<string, Row[]> = {
    users: [{ _id: "u1", discordId: OWNER, username: "owner", manageableGuildIds: [GUILD] }],
    sessions: [
      {
        _id: "s1",
        token: "tok",
        userId: "u1",
        createdAt: now,
        authVersion: CURRENT_SESSION_AUTH_VERSION,
      },
    ],
    guilds: [{ _id: "g1", discordId: GUILD, name: "Server test", botInGuild: true }],
    entitlements: opts.entitlements ?? [],
    autoReplies: Array.from({ length: opts.rules ?? 0 }, (_, i) => ({
      _id: `r${i}`,
      guildId: GUILD,
      name: `rule-${i}`,
      enabled: true,
    })),
  };
  return tables;
}

/** Entitlement còn hạn của server (gói đang mua). */
const activeEnt = (plan: string, days = 30): Row => ({
  _id: `e-${plan}`,
  userId: "u1",
  discordId: OWNER,
  guildId: GUILD,
  plan,
  startsAt: Date.now(),
  expiresAt: Date.now() + days * DAY,
});

const addH = (autoReplyAdd as any)._handler;
const retentionH = (setRetention as any)._handler;
const catalogH = (catalog as any)._handler;

const ruleArgs = (name: string) => ({
  token: "tok",
  guildId: GUILD,
  name,
  triggerType: "keyword" as const,
  keywords: ["hello"],
  response: "Xin chào!",
  channels: [],
  cooldownSeconds: 5,
});

async function run() {
  console.log("── 1. Bảng hạn mức (nguồn sự thật) ──");
  check(
    "gói lạ / dữ liệu bẩn → coi là Miễn phí (không thành quyền)",
    asPlanId("supporterX") === "free" &&
      asPlanId("") === "free" &&
      asPlanId(undefined) === "free" &&
      asPlanId("pioneer") === "pioneer",
  );
  const keys = Object.keys(HARD_CAPS) as (keyof typeof HARD_CAPS)[];
  check(
    "hạn mức TĂNG DẦN theo gói và gói cao nhất chạm trần cứng (không 'vô hạn' suông)",
    keys.every(
      (k) =>
        PLAN_LIMITS.free[k] < PLAN_LIMITS.supporter[k] &&
        PLAN_LIMITS.supporter[k] <= PLAN_LIMITS.pioneer[k] &&
        PLAN_LIMITS.pioneer[k] === HARD_CAPS[k],
    ),
    PLAN_LIMITS,
  );
  check(
    "planLimits(undefined) = gói Miễn phí (khách chưa mua không vượt trần)",
    planLimits(undefined).autoReplyRules === PLAN_LIMITS.free.autoReplyRules,
  );
  check(
    "nextPlan: miễn phí → đồng hành → tiên phong → null",
    nextPlan("free") === "supporter" &&
      nextPlan("supporter") === "pioneer" &&
      nextPlan("pioneer") === null,
  );
  check(
    "catalog() trả đúng bảng + phiên bản điều khoản (trang bán đọc cùng nguồn)",
    (() => {
      const c = catalogH({});
      return (
        c.termsVersion === TERMS_VERSION &&
        c.limits.pioneer.backupKeepCount === PLAN_LIMITS.pioneer.backupKeepCount &&
        c.labels.supporter === "Đồng hành"
      );
    })(),
    TERMS_VERSION,
  );
  check("TERMS_VERSION là số nguyên ≥ 1", Number.isInteger(TERMS_VERSION) && TERMS_VERSION >= 1);

  console.log("── 2. Lỗi vượt hạn mức nói rõ đường nâng cấp ──");
  check(
    "đúng trần thì cho qua",
    (() => {
      assertWithinLimit("free", "autoReplyRules", 5);
      return true;
    })(),
  );
  const msgFree = await expectThrow(
    "vượt trần gói Miễn phí → nêu trần + gói kế tiếp",
    async () => assertWithinLimit("free", "badWords", 21),
    /Gói Miễn phí cho tối đa 20 từ khoá cấm.*Đồng hành để dùng 60/,
  );
  void msgFree;
  await expectThrow(
    "ở gói cao nhất mà vẫn vượt → chỉ cách giảm xuống trần",
    async () => assertWithinLimit("pioneer", "backupKeepCount", 51),
    /đã ở gói cao nhất.*giảm xuống 50/,
  );

  console.log("── 3. planForGuild: gói của ĐÚNG server ──");
  check(
    "chưa mua gì → Miễn phí, không có hạn",
    JSON.stringify(await planForGuild(makeCtx(seed()), GUILD)) ===
      JSON.stringify({ plan: "free", expiresAt: null }),
  );
  check(
    "entitlement HẾT HẠN → về Miễn phí ngay (không quên kiểm hạn)",
    (await planForGuild(makeCtx(seed({ entitlements: [activeEnt("pioneer", -1)] })), GUILD))
      .plan === "free",
  );
  check(
    "nhiều dòng: lấy gói CAO NHẤT còn hạn (supporter còn hạn + pioneer hết hạn)",
    (
      await planForGuild(
        makeCtx(
          seed({
            entitlements: [
              activeEnt("supporter"),
              { ...activeEnt("pioneer"), _id: "e-old", expiresAt: Date.now() - DAY },
            ],
          }),
        ),
        GUILD,
      )
    ).plan === "supporter",
  );
  check(
    "entitlement của server KHÁC không mở quyền cho server này",
    (
      await planForGuild(
        makeCtx(seed({ entitlements: [{ ...activeEnt("pioneer"), guildId: "999" }] })),
        GUILD,
      )
    ).plan === "free",
  );

  console.log("── 4. Chặn thật: rule auto reply ──");
  await expectThrow(
    "server Miễn phí đã có 5 rule → thêm rule thứ 6 bị chặn kèm đường nâng gói",
    () => addH(makeCtx(seed({ rules: 5 })), ruleArgs("rule-moi")),
    /Gói Miễn phí cho tối đa 5 rule auto reply.*Đồng hành để dùng 30/,
  );
  {
    // Mua gói cho server → mở được ngay (không cần chờ gì khác).
    const tables = seed({ rules: 5, entitlements: [activeEnt("supporter")] });
    const res = await addH(makeCtx(tables), ruleArgs("rule-moi"));
    check(
      "server có gói Đồng hành → thêm được rule thứ 6 (mua là mở ngay)",
      res?.ok === true && tables.autoReplies.length === 6,
    );
  }

  console.log("── 5. Chặn thật: hạn mức backup ──");
  await expectThrow(
    "Miễn phí: giữ 10 bản backup bị chặn (trần 3)",
    () => retentionH(makeCtx(seed()), { token: "tok", guildId: GUILD, keepCount: 10, keepDays: 0 }),
    /Gói Miễn phí cho tối đa 3 bản backup giữ lại/,
  );
  await expectThrow(
    "Miễn phí: giữ backup 30 ngày bị chặn (trần 7)",
    () => retentionH(makeCtx(seed()), { token: "tok", guildId: GUILD, keepCount: 3, keepDays: 30 }),
    /Gói Miễn phí cho tối đa 7 ngày giữ backup.*Đồng hành để dùng 30/,
  );
  {
    const tables = seed({ entitlements: [activeEnt("supporter")] });
    const res = await retentionH(makeCtx(tables), {
      token: "tok",
      guildId: GUILD,
      keepCount: 10,
      keepDays: 30,
    });
    check(
      "Đồng hành: 10 bản / 30 ngày lưu được và ghi đúng vào guild",
      res?.ok === true &&
        tables.guilds[0].backupKeepCount === 10 &&
        tables.guilds[0].backupKeepDays === 30,
      res,
    );
  }
  {
    // Số vượt TRẦN CỨNG vẫn được KẸP về trần như hành vi cũ (999 → 50), không
    // ném lỗi: đây là chuẩn hoá dữ liệu vào, không phải khách xin thêm quyền lợi.
    const tables = seed({ entitlements: [activeEnt("pioneer")] });
    const res = await retentionH(makeCtx(tables), {
      token: "tok",
      guildId: GUILD,
      keepCount: 51,
      keepDays: 400,
    });
    check(
      "Tiên phong: 51/400 bị KẸP về trần cứng 50/365 (không ném lỗi)",
      res?.ok === true &&
        tables.guilds[0].backupKeepCount === 50 &&
        tables.guilds[0].backupKeepDays === 365,
      res,
    );
  }

  console.log("── 6. Quyền hạn vẫn là chốt đầu tiên ──");
  await expectThrow(
    "token sai → chặn trước khi xét gói (không lộ hạn mức)",
    () => addH(makeCtx(seed({ rules: 5 })), { ...ruleArgs("x"), token: "tok-sai" }),
    /Không có quyền quản lý|Phiên đăng nhập/,
  );

  console.log("── 7. Nhập file cấu hình không lọt hạn mức gói ──");
  {
    const words = (n: number) => Array.from({ length: n }, (_, i) => `từ ${i}`);
    const importCfg = (tables: Record<string, Row[]>, badWords: string[]) =>
      importGuildConfigHandler(makeCtx(tables) as any, {
        token: "tok",
        guildId: GUILD,
        config: { badWords },
      });

    const tFree = seed();
    await expectThrow(
      "Miễn phí nhập 30 từ qua file cấu hình → chặn theo gói (từng lọt trần cứng 100)",
      () => importCfg(tFree, words(30)),
      /Gói Miễn phí cho tối đa 20 từ khoá cấm/,
    );
    check(
      "chặn TRƯỚC khi ghi — badWords của guild không bị đụng",
      tFree.guilds[0].badWords === undefined,
    );

    const tSup = seed({ entitlements: [activeEnt("supporter")] });
    const ok = await importCfg(tSup, words(30));
    check(
      "Đồng hành nhập 30 từ (≤60) qua file cấu hình → ghi được",
      ok.ok === true && tSup.guilds[0].badWords?.length === 30,
      ok,
    );

    const tFreeOk = seed();
    const ok2 = await importCfg(tFreeOk, words(15));
    check(
      "Miễn phí 15 từ (≤20) vẫn qua — không chặn oan",
      ok2.ok === true && tFreeOk.guilds[0].badWords?.length === 15,
      ok2,
    );
  }

  console.log("── 8. Đặc quyền dữ liệu (P1–P4): trần + đường nâng gói ──");
  const DATA_KEYS = ["exportRows", "exportDays", "heatTopRows", "historyRows"] as const;
  check(
    "4 hạn mức dữ liệu đều tăng dần theo gói và gói cao nhất chạm trần cứng",
    DATA_KEYS.every(
      (k) =>
        PLAN_LIMITS.free[k] < PLAN_LIMITS.supporter[k] &&
        PLAN_LIMITS.supporter[k] <= PLAN_LIMITS.pioneer[k] &&
        PLAN_LIMITS.pioneer[k] === HARD_CAPS[k],
    ),
    DATA_KEYS.map((k) => [k, PLAN_LIMITS.free[k], PLAN_LIMITS.pioneer[k]]),
  );
  check(
    "gói Miễn phí VẪN xuất được dữ liệu (không khoá sau tường trả phí)",
    PLAN_LIMITS.free.exportRows > 0 && PLAN_LIMITS.free.exportDays > 0,
    PLAN_LIMITS.free,
  );
  check(
    "catalog() niêm yết đủ 4 hạn mức mới (trang bán không tự đặt số)",
    (() => {
      const c = catalogH({});
      return (
        c.limits.free.exportRows === PLAN_LIMITS.free.exportRows &&
        c.limits.supporter.exportDays === PLAN_LIMITS.supporter.exportDays &&
        c.limits.pioneer.heatTopRows === HARD_CAPS.heatTopRows &&
        c.limits.pioneer.historyRows === HARD_CAPS.historyRows
      );
    })(),
  );
  await expectThrow(
    "Miễn phí xin xuất 5.000 dòng → nêu trần 100 + gói kế tiếp cho 1000",
    async () => assertWithinLimit("free", "exportRows", 5_000),
    /Gói Miễn phí cho tối đa 100 dòng mỗi lượt xuất dữ liệu.*Đồng hành để dùng 1000 dòng mỗi lượt xuất dữ liệu/,
  );
  await expectThrow(
    "xuất lịch sử 2.000 ngày ở gói cao nhất → chỉ cách giảm xuống 1095",
    async () => assertWithinLimit("pioneer", "exportDays", 2_000),
    /đã ở gói cao nhất.*giảm xuống 1095 ngày lịch sử xuất được/,
  );

  console.log("── 9. Xuất CSV: chặn ở TẦNG ĐỌC theo gói (không phải ẩn nút) ──");
  const exportH = (exportGuildCsv as any)._handler;
  const exportVia = (t: Record<string, Row[]>, kind: string) =>
    exportH(makeCtx(t), { token: "tok", guildId: GUILD, kind }) as Promise<any>;
  const modActionRows = (n: number, createdAt = Date.now()): Row[] =>
    Array.from({ length: n }, (_, i) => ({
      _id: `ma${i}`,
      guildId: GUILD,
      action: "🛠️ Ban",
      caseNumber: i + 1,
      targetName: `Nguyễn Văn ${i}`,
      targetId: `900000000000000${i}`,
      executorName: "mod",
      executorId: "123456789012345678",
      reason: "spam",
      details: "",
      createdAt,
    }));
  const heatRows = (n: number): Row[] =>
    Array.from({ length: n }, (_, i) => ({
      _id: `h${i}`,
      guildId: GUILD,
      userId: `800000000000000${i}`,
      username: `user-${i}`,
      heat: n - i,
      warnStrikes: 0,
      updatedAt: Date.now(),
    }));
  {
    const tFree = seed();
    tFree.modActions = modActionRows(150);
    const res = await exportVia(tFree, "modActions");
    check(
      "Miễn phí: 150 hành động → file đúng 100 dòng + cờ 'còn nữa' (không im lặng trả thiếu)",
      res?.rows === 100 && res?.truncated === true && res?.exportRows === 100,
      res && { rows: res.rows, truncated: res.truncated, exportRows: res.exportRows },
    );

    // Bản ghi cũ hơn cửa sổ 90 ngày của gói Miễn phí phải KHÔNG lọt file.
    tFree.modActions.push({
      ...modActionRows(1, Date.now() - 200 * DAY)[0],
      _id: "ma-cu",
      reason: "RẤT-CŨ-KHÔNG-LỌT",
    });
    const resOld = await exportVia(tFree, "modActions");
    check(
      "Miễn phí: cửa sổ 90 ngày → bản ghi 200 ngày trước bị loại (exportDays chặn thật)",
      !resOld.csv.includes("RẤT-CŨ-KHÔNG-LỌT"),
    );

    const tSup = seed({ entitlements: [activeEnt("supporter")] });
    tSup.modActions = modActionRows(150);
    const resSup = await exportVia(tSup, "modActions");
    check(
      "Đồng hành: cùng 150 hành động → lấy đủ 150 (trần 1000), không cắt oan",
      resSup?.rows === 150 && resSup?.truncated === false && resSup?.exportRows === 1_000,
      resSup && { rows: resSup.rows, truncated: resSup.truncated },
    );

    const tHeat = seed();
    tHeat.heatStates = heatRows(15);
    const resHeat = await exportVia(tHeat, "heat");
    check(
      "bảng nhiệt: Miễn phí cắt ở top 10 dù có 15 người (trần riêng heatTopRows)",
      resHeat?.rows === 10 && resHeat?.truncated === true,
      resHeat && { rows: resHeat.rows, truncated: resHeat.truncated },
    );

    const tEvil = seed();
    tEvil.modActions = [{ ...modActionRows(1)[0], reason: '=HYPERLINK("http://x","bấm")' }];
    const resEvil = await exportVia(tEvil, "modActions");
    check(
      "CSV injection: lý do bắt đầu bằng '=' bị vô hiệu (Excel không thi hành công thức)",
      resEvil.csv.includes("'=HYPERLINK"),
      resEvil.csv.split("\r\n")[1],
    );

    const tStranger = seed();
    tStranger.users[0].manageableGuildIds = ["999999999999999999"];
    check(
      "người không quản lý được server → null (không lộ dữ liệu server khác)",
      (await exportVia(tStranger, "modActions")) === null,
    );
  }

  console.log("── 10. /stats: trần bảng nhiệt theo gói ──");
  const heatH = (heatLeaderboard as any)._handler;
  {
    const mk = (plan?: string) => {
      const t = seed(plan ? { entitlements: [activeEnt(plan)] } : {});
      t.heatStates = heatRows(40);
      return t;
    };
    const ask = (t: Record<string, Row[]>) =>
      heatH(makeCtx(t), { token: "tok", guildId: GUILD, limit: 50 });
    const freeTop = await ask(mk());
    check(
      "Miễn phí: xin limit=50 nhưng server trả 10 (gọi thẳng API cũng không vượt trần)",
      freeTop?.length === 10,
      freeTop?.length,
    );
    const supTop = await ask(mk("supporter"));
    check("Đồng hành: nhận 30 dòng", supTop?.length === 30, supTop?.length);
    const pioTop = await ask(mk("pioneer"));
    check(
      "Tiên phong: 40 người → 40 dòng, nhiệt cao nhất đứng đầu (sort thật)",
      pioTop?.length === 40 && pioTop?.[0]?.heat === 40 && pioTop?.[39]?.heat === 1,
      pioTop?.slice(0, 3).map((r: Row) => r.heat),
    );
  }

  console.log("── 11. Dashboard: log hành động cắt theo gói ──");
  const getGuildH = (getGuild as any)._handler;
  {
    const mk = (plan?: string) => {
      const t = seed(plan ? { entitlements: [activeEnt(plan)] } : {});
      t.modActions = modActionRows(40);
      return t;
    };
    const freeData = await getGuildH(makeCtx(mk()), { token: "tok", guildId: GUILD });
    check(
      "Miễn phí: 30 dòng log hành động (đúng mức cũ, không đổi hành vi cũ)",
      freeData?.modActions?.length === 30,
      freeData?.modActions?.length,
    );
    const supData = await getGuildH(makeCtx(mk("supporter")), {
      token: "tok",
      guildId: GUILD,
    });
    check(
      "Đồng hành: 40 dòng có sẵn → nhận đủ 40 (trần 100)",
      supData?.modActions?.length === 40,
      supData?.modActions?.length,
    );
  }

  console.log("── 12. Cổng tĩnh: 4 điểm chặn mới không revert lặng lẽ ──");
  const readSrc = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
  const gates: [string, string, RegExp][] = [
    ["convex/dataExport.ts", "exportRows", /limits\.exportRows/],
    ["convex/dataExport.ts", "exportDays", /limits\.exportDays/],
    ["convex/dataExport.ts", "heatTopRows", /limits\.heatTopRows/],
    ["convex/reports.ts", "heatTopRows", /planLimits\(plan\)\.heatTopRows/],
    ["convex/guilds.ts", "historyRows", /planLimits\(guildPlanId\)\.historyRows/],
  ];
  for (const [file, name, pattern] of gates) {
    check(`cổng tĩnh: ${file} còn chặn bằng ${name}`, pattern.test(readSrc(file)));
  }
  const plansSrc = readSrc("convex/plans.ts");
  check(
    "cổng tĩnh: 4 hạn mức vẫn nằm trong bảng nguồn sự thật PLAN_LIMITS",
    /export const PLAN_LIMITS: Record<PlanId, PlanLimits>/.test(plansSrc) &&
      DATA_KEYS.every((k) => plansSrc.includes(k)),
  );

  console.log(`\n${pass}/${pass + fail} assertion xanh`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
