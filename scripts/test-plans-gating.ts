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
// Hermetic: không mạng, không DB thật — ctx giả trong bộ nhớ.
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

/** Ctx giả: bảng trên mảng, `withIndex` lọc theo các điều kiện eq được gọi. */
function makeCtx(tables: Record<string, Row[]>) {
  let idSeq = 0;
  const db = {
    query(table: string) {
      const rows = tables[table] ?? [];
      const view = (out: Row[]): any => ({
        first: async () => out[0] ?? null,
        collect: async () => out,
        take: async (n: number) => out.slice(0, n),
        order: () => view(out),
      });
      return {
        withIndex(_name: string, build: (q: any) => any) {
          const conds: [string, unknown][] = [];
          const q: any = {
            eq: (field: string, value: unknown) => {
              conds.push([field, value]);
              return q;
            },
          };
          build(q);
          return view(rows.filter((r) => conds.every(([f, v]) => r[f] === v)));
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

  console.log(`\n${pass}/${pass + fail} assertion xanh`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
