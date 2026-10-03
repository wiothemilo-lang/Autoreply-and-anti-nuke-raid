// TEST: convex/autoreplies.ts — tạo/sửa/xoá rule auto-reply từ dashboard.
// Chạy: bun scripts/test-autoreplies-convex.ts
//
// Vì sao cần test riêng: đây là nơi duy nhất CHẶN dữ liệu rác đi vào bot.
// Một rule ghi sai ở đây không chỉ là panel xấu — bot đọc thẳng bảng
// `autoReplies` qua cache getBotConfig rồi tự trả lời trong mọi kênh. Ba
// điều ở đây quyết định mức thiệt hại nên phải khoá bằng test:
//   1. QUYỀN — `assertManage` chạy trước mọi thứ khác; lọt là cả server
//      bị thêm/xoá rule bởi tài khoản không quản lý được.
//   2. CHUẨN HOÁ — keyword/response/channel bị cắt và lọc ở đây. Nếu lọc rò,
//      người dùng gõ kênh sai 1 ký tự là rule im lặng không bao giờ chạy.
//   3. TÍN HIỆU — mọi thay đổi đều patch `settingsChangedAt` để bot xoá
//      cache ngay vòng tick kế tiếp, không phải chờ 30 phút.
import { add, remove, update } from "../convex/autoreplies";

type Row = Record<string, any>;

const addH = (add as any)._handler;
const updateH = (update as any)._handler;
const removeH = (remove as any)._handler;

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "PASS" : "FAIL"} ${label}${ok || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`,
  );
  ok ? pass++ : fail++;
};

/** Chạy handler và đòi phải ném lỗi khớp mẫu — trả về message đã bắt. */
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

/**
 * Đồng hồ giả — mọi mutation đều đóng dấu thời gian bằng `Date.now()`.
 *
 * Vì sao phải giả: `add` và `update` chạy liền nhau trong cùng mili-giây thì
 * `settingsChangedAt` nhận CÙNG giá trị, nên test so "trước ≠ sau" sẽ đỏ
 * ngẫu nhiên theo tốc độ máy. Có đồng hồ thì khẳng định được chính xác:
 * tín hiệu ghi đúng bằng mốc lúc gọi, không phải "khác đi một chút".
 */
const CLOCK = { t: 1_700_000_000_000 };
const REAL_NOW = Date.now;
Date.now = () => CLOCK.t;
/** Tăng đồng hồ để lần gọi kế tiếp khác chắc chắn mốc trước đó. */
const tick = () => (CLOCK.t += 1000);

/**
 * Ctx giả: bảng trên mảng. `withIndex` chỉ cần `eq` — cả ba mutation ở đây
 * dùng index dạng phẳng (`by_guildId`, `by_guildId_name`, `by_discordId`,
 * `by_token`), không có range nên không cần mô phỏng thứ tự so sánh kiểu.
 */
function makeCtx(
  opts: {
    token?: string;
    userGuilds?: string[];
    /** Guild thêm vào bảng `guilds` (để test phạm vi theo server). */
    extraGuilds?: string[];
    now?: number;
  } = {},
) {
  const token = opts.token ?? "tok";
  const extra = opts.extraGuilds ?? [];
  const sessions: Row[] = [{ _id: "s1", token, userId: "u1", createdAt: CLOCK.t, authVersion: 1 }];
  const users: Row[] = [
    {
      _id: "u1",
      discordId: "owner-1",
      manageableGuildIds: opts.userGuilds ?? ["server-1", ...extra],
    },
  ];
  const guilds: Row[] = [
    { _id: "g1", discordId: "server-1" },
    ...extra.map((discordId, i) => ({ _id: `g${i + 2}`, discordId })),
  ];
  const autoReplies: Row[] = [];
  const tables: Record<string, Row[]> = { sessions, users, guilds, autoReplies };
  let seq = 0;
  const all = () => [...sessions, ...users, ...guilds, ...autoReplies];
  const ctx = {
    now: opts.now ?? 1_700_000_000_000,
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
        for (const t of Object.values(tables)) {
          const i = t.findIndex((r) => r._id === id);
          if (i >= 0) t.splice(i, 1);
        }
      },
      query: (table: string) => ({
        withIndex: (_name: string, bound: (q: any) => any) => {
          const capture: Record<string, unknown> = {};
          const q: any = {
            eq: (f: string, v: unknown) => ((capture[f] = v), q),
          };
          bound(q);
          const rows = (tables[table] ?? []).filter((r) =>
            Object.entries(capture).every(([f, v]) => r[f] === v),
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
  return { ctx, sessions, users, guilds, autoReplies };
}

const BASE = {
  token: "tok",
  guildId: "server-1",
  name: "chao",
  triggerType: "keyword" as const,
  keywords: ["xin"],
  response: "chào bạn",
  channels: [] as string[],
  cooldownSeconds: 5,
};

const CH = "123456789012345678"; // 18 chữ số — hợp lệ

(async () => {
  // ═══ 1. add: đường chính ═══
  console.log("\n── add: tạo rule ──");
  {
    const { ctx, autoReplies, guilds } = makeCtx();
    const r = await addH(ctx, BASE);
    check("trả về { ok: true }", r.ok === true, r);
    check("ghi đúng 1 dòng vào autoReplies", autoReplies.length === 1, autoReplies.length);
    const row = autoReplies[0];
    check("rule mới luôn bật", row.enabled === true, row.enabled);
    check("createdAt = updatedAt = lúc tạo", row.createdAt === row.updatedAt, row);
    check(
      "✅ báo tín hiệu cho bot (settingsChangedAt) — nếu thiếu, bot chờ cache 30 phút",
      typeof guilds[0].settingsChangedAt === "number",
      guilds[0].settingsChangedAt,
    );
  }

  // ═══ 2. add: chuẩn hoá đầu vào ═══
  console.log("\n── add: chuẩn hoá dữ liệu ──");
  {
    const { ctx, autoReplies } = makeCtx();
    await addH(ctx, {
      ...BASE,
      keywords: ["  xin  ", "xin", "", "chao", "a".repeat(80)],
      response: "   chào bạn   ",
      channels: [` ${CH} `, CH, "không-phải-số"],
      cooldownSeconds: -5,
    });
    const row = autoReplies[0];
    check(
      "keyword: trim + bỏ rỗng + bỏ trùng",
      JSON.stringify(row.keywords.slice(0, 3)) === JSON.stringify(["xin", "chao", "a".repeat(60)]),
      row.keywords,
    );
    check("keyword dài >60 bị cắt còn 60", row.keywords[2].length === 60, row.keywords[2]?.length);
    check("response được trim", row.response === "chào bạn", row.response);
    check(
      "channel: chỉ nhận 15-20 chữ số, bỏ trùng và bỏ rác",
      row.channels.length === 1 && row.channels[0] === CH,
      row.channels,
    );
    check("cooldown âm → 0", row.cooldownSeconds === 0, row.cooldownSeconds);
  }
  {
    const { ctx, autoReplies } = makeCtx();
    await addH(ctx, { ...BASE, keywords: Array.from({ length: 40 }, (_, i) => `k${i}`) });
    check(
      "tối đa 30 keyword",
      autoReplies[0].keywords.length === 30,
      autoReplies[0].keywords.length,
    );
  }
  {
    const { ctx, autoReplies } = makeCtx();
    await addH(ctx, { ...BASE, cooldownSeconds: 999_999 });
    check("cooldown trên 1 ngày → 86400", autoReplies[0].cooldownSeconds === 86400);
  }
  {
    const { ctx, autoReplies } = makeCtx();
    await addH(ctx, { ...BASE, cooldownSeconds: 7.9 });
    check("cooldown số thập phân → floor", autoReplies[0].cooldownSeconds === 7);
  }

  // ═══ 3. add: chặn dữ liệu rác ═══
  console.log("\n── add: chặn dữ liệu rác ──");
  {
    await expectThrow(
      "tên có khoảng trắng → chặn",
      () => addH(makeCtx().ctx, { ...BASE, name: "chao ban" }),
      /Tên rule/,
    );
    await expectThrow(
      "tên quá 32 ký tự → chặn",
      () => addH(makeCtx().ctx, { ...BASE, name: "x".repeat(33) }),
      /Tên rule/,
    );
    await expectThrow(
      "response toàn khoảng trắng → chặn",
      () => addH(makeCtx().ctx, { ...BASE, response: "   " }),
      /Nội dung trả lời/,
    );
    await expectThrow(
      "rule keyword mà không có từ khóa nào → chặn (rule im lặng mãi)",
      () => addH(makeCtx().ctx, { ...BASE, keywords: ["  ", ""] }),
      /Cần ít nhất một từ khóa/,
    );
  }
  {
    // Rule 'mention' không cần keyword — phải cho qua, nếu chặn thì tính
    // năng tag-bot không dùng được.
    const { ctx, autoReplies } = makeCtx();
    const r = await addH(ctx, { ...BASE, triggerType: "mention", keywords: [] });
    check("rule mention không cần từ khóa → tạo được", r.ok === true && autoReplies.length === 1);
  }
  {
    const { ctx } = makeCtx();
    await addH(ctx, BASE);
    await expectThrow(
      "tên trùng trong cùng server → chặn",
      () => addH(ctx, { ...BASE, response: "nội dung khác" }),
      /Đã có rule tên/,
    );
  }
  {
    // Tên trùng ở server KHÁC thì hợp lệ — index là (guildId, name), không
    // phải name đứng một mình.
    const { ctx, autoReplies } = makeCtx({ extraGuilds: ["server-2"] });
    await addH(ctx, BASE);
    const r = await addH(ctx, { ...BASE, guildId: "server-2" });
    check("tên trùng ở server khác vẫn tạo được", r.ok === true, r);
    check(
      "hai rule cùng tên nằm ở hai server khác nhau",
      autoReplies.length === 2 &&
        autoReplies[0].guildId === "server-1" &&
        autoReplies[1].guildId === "server-2",
      autoReplies.map((x) => `${x.guildId}/${x.name}`),
    );
  }
  {
    const { ctx, autoReplies } = makeCtx();
    for (let i = 0; i < 49; i++) {
      await addH(ctx, { ...BASE, name: `rule${i}` });
    }
    check("đủ 49 rule", autoReplies.length === 49, autoReplies.length);
    const r = await addH(ctx, { ...BASE, name: "rule49" });
    check("thêm rule thứ 50 → OK", r.ok === true && autoReplies.length === 50);
    await expectThrow(
      "vượt 50 rule → chặn (chống phình document)",
      () => addH(ctx, { ...BASE, name: "rule50" }),
      /Tối đa 50 rule/,
    );
  }

  // ═══ 4. add: quyền ═══
  console.log("\n── add: quyền ──");
  {
    await expectThrow(
      "token sai → không tạo được",
      () => addH(makeCtx({ token: "tok-khac" }).ctx, BASE),
      /Không có quyền quản lý server/,
    );
    await expectThrow(
      "user không có server trong manageableGuildIds → chặn",
      () => addH(makeCtx({ userGuilds: ["server-khac"] }).ctx, BASE),
      /Không có quyền quản lý server/,
    );
    const { ctx, autoReplies } = makeCtx({ userGuilds: [] });
    await expectThrow(
      "quyền lấy từ manageableGuildIds, KHÔNG tin guild.managers (có thể stale)",
      () => {
        ctx.db.patch("g1", { managers: ["owner-1"] });
        return addH(ctx, BASE);
      },
      /Không có quyền quản lý server/,
    );
    check("bị chặn thì KHÔNG ghi dòng nào", autoReplies.length === 0, autoReplies.length);
  }
  {
    const { ctx, sessions } = makeCtx();
    sessions[0].authVersion = 0;
    await expectThrow(
      "phiên cũ thiếu authVersion → chặn (không tin claim client)",
      () => addH(ctx, BASE),
      /Không có quyền quản lý server/,
    );
  }
  {
    const { ctx, sessions } = makeCtx();
    sessions[0].createdAt = CLOCK.t - 31 * 24 * 60 * 60 * 1000;
    await expectThrow(
      "phiên quá 30 ngày → chặn (token bị đánh cắp không dùng được vĩnh viễn)",
      () => addH(ctx, BASE),
      /Không có quyền quản lý server/,
    );
  }

  // ═══ 5. update ═══
  console.log("\n── update: sửa rule ──");
  {
    const { ctx, autoReplies, guilds } = makeCtx();
    await addH(ctx, BASE);
    const id = autoReplies[0]._id;
    tick();
    const r = await updateH(ctx, {
      token: "tok",
      id,
      name: "chao-moi",
      response: "  chào mới  ",
      enabled: false,
    });
    const row = autoReplies[0];
    check("trả về { ok: true }", r.ok === true, r);
    check(
      "đổi tên + trim response + tắt rule",
      row.name === "chao-moi" && row.response === "chào mới" && row.enabled === false,
      row,
    );
    check(
      "field KHÔNG truyền vào thì giữ nguyên (patch một phần)",
      JSON.stringify(row.keywords) === JSON.stringify(["xin"]) && row.triggerType === "keyword",
      row,
    );
    check(
      "✅ báo tín hiệu cho bot đúng mốc lần sửa (không phải mốc lúc tạo)",
      guilds[0].settingsChangedAt === CLOCK.t,
      guilds[0].settingsChangedAt,
    );
    check("updatedAt mới hơn createdAt", row.updatedAt > row.createdAt, [
      row.createdAt,
      row.updatedAt,
    ]);
  }
  {
    const { ctx, autoReplies } = makeCtx();
    await addH(ctx, BASE);
    await updateH(ctx, { token: "tok", id: autoReplies[0]._id, enabled: false });
    check(
      "chỉ tắt rule: không đụng tên/nội dung/keyword",
      autoReplies[0].name === "chao" &&
        autoReplies[0].response === "chào bạn" &&
        autoReplies[0].enabled === false,
      autoReplies[0],
    );
  }
  {
    const { ctx, autoReplies } = makeCtx();
    await addH(ctx, BASE);
    await updateH(ctx, {
      token: "tok",
      id: autoReplies[0]._id,
      keywords: ["  a  ", "a", "b"],
      channels: [` ${CH} `, "rac"],
      cooldownSeconds: 999_999,
    });
    const row = autoReplies[0];
    check(
      "update cũng chuẩn hoá keyword/channel/cooldown giống add",
      JSON.stringify(row.keywords) === JSON.stringify(["a", "b"]) &&
        row.channels.length === 1 &&
        row.channels[0] === CH &&
        row.cooldownSeconds === 86400,
      row,
    );
  }
  {
    const { ctx, autoReplies } = makeCtx();
    await addH(ctx, BASE);
    await expectThrow(
      "update: id không tồn tại → chặn",
      () => updateH(ctx, { token: "tok", id: "khong-ton-tai", enabled: false }),
      /Không tìm thấy rule/,
    );
    await expectThrow(
      "update: response toàn khoảng trắng → chặn",
      () => updateH(ctx, { token: "tok", id: autoReplies[0]._id, response: "  " }),
      /Nội dung trả lời/,
    );
    await expectThrow(
      "update: tên mới sai định dạng → chặn",
      () => updateH(ctx, { token: "tok", id: autoReplies[0]._id, name: "co khoang trang" }),
      /Tên rule/,
    );
  }
  {
    // Tên trùng với CHÍNH rule đang sửa phải cho qua — nếu chặn thì không bao
    // giờ đổi lại được tên cũ.
    const { ctx, autoReplies } = makeCtx();
    await addH(ctx, BASE);
    const r = await updateH(ctx, {
      token: "tok",
      id: autoReplies[0]._id,
      name: "chao",
      enabled: false,
    });
    check("update giữ nguyên tên của chính nó → OK", r.ok === true, r);
  }
  {
    const { ctx, autoReplies } = makeCtx();
    await addH(ctx, BASE);
    await addH(ctx, { ...BASE, name: "khac" });
    await expectThrow(
      "update sang tên của rule KHÁC → chặn",
      () => updateH(ctx, { token: "tok", id: autoReplies[1]._id, name: "chao" }),
      /Đã có rule tên/,
    );
    check("tên bị chặn thì giữ nguyên tên cũ", autoReplies[1].name === "khac", autoReplies[1].name);
  }
  {
    const { ctx, autoReplies, users } = makeCtx();
    await addH(ctx, BASE);
    users[0].manageableGuildIds = [];
    await expectThrow(
      "update: không có quyền → chặn",
      () => updateH(ctx, { token: "tok", id: autoReplies[0]._id, enabled: false }),
      /Không có quyền quản lý server/,
    );
    check("bị chặn thì rule KHÔNG bị sửa", autoReplies[0].enabled === true, autoReplies[0].enabled);
  }

  {
    // BẤT ĐỒNG BỘ ĐÃ BIẾT: `add` chặn rule keyword không có từ khóa, còn
    // `update` thì không. Đổi một rule mention sang keyword mà quên gõ từ
    // khóa sẽ tạo ra rule im lặng — bot không báo lỗi, chỉ không trả lời.
    // Test khoá lại HÀNH VI HIỆN TẠI (kèm chú thích) chứ không khoá ý kiến:
    // khi nào vá được thì sửa case này thành expectThrow.
    const { ctx, autoReplies } = makeCtx();
    await addH(ctx, { ...BASE, triggerType: "mention", keywords: [] });
    const r = await updateH(ctx, {
      token: "tok",
      id: autoReplies[0]._id,
      triggerType: "keyword",
      keywords: [],
    });
    check(
      "⚠️ HÀNH VI HIỆN TẠI: update cho phép keyword rỗng (khác add) — rule im lặng",
      r.ok === true && (autoReplies[0].keywords as string[]).length === 0,
      autoReplies[0],
    );
  }

  // ═══ 6. remove ═══
  console.log("\n── remove: xoá rule ──");
  {
    const { ctx, autoReplies, guilds } = makeCtx();
    await addH(ctx, BASE);
    await addH(ctx, { ...BASE, name: "khac" });
    tick();
    const r = await removeH(ctx, { token: "tok", id: autoReplies[0]._id });
    check("trả về { ok: true }", r.ok === true, r);
    check(
      "xoá đúng một dòng, còn lại rule kia",
      autoReplies.length === 1 && autoReplies[0].name === "khac",
      autoReplies.map((x) => x.name),
    );
    check(
      "✅ báo tín hiệu cho bot đúng mốc lúc xoá",
      guilds[0].settingsChangedAt === CLOCK.t,
      guilds[0].settingsChangedAt,
    );
  }
  {
    await expectThrow(
      "remove: id không tồn tại → chặn",
      () => removeH(makeCtx().ctx, { token: "tok", id: "khong-ton-tai" }),
      /Không tìm thấy rule/,
    );
  }
  {
    const { ctx, autoReplies, users } = makeCtx();
    await addH(ctx, BASE);
    users[0].manageableGuildIds = [];
    await expectThrow(
      "remove: không có quyền → chặn",
      () => removeH(ctx, { token: "tok", id: autoReplies[0]._id }),
      /Không có quyền quản lý server/,
    );
    check("bị chặn thì rule CÒN NGUYÊN", autoReplies.length === 1, autoReplies.length);
  }
  {
    // Vòng đời đầy đủ: tạo → sửa → xoá, đảm bảo ba mutation nói chuyện đúng
    // với nhau trên cùng bảng.
    const { ctx, autoReplies } = makeCtx();
    await addH(ctx, BASE);
    await updateH(ctx, {
      token: "tok",
      id: autoReplies[0]._id,
      triggerType: "mention",
      enabled: false,
    });
    check("đổi kiểu trigger sang mention", autoReplies[0].triggerType === "mention");
    await removeH(ctx, { token: "tok", id: autoReplies[0]._id });
    check("bảng rỗng trở lại sau khi xoá", autoReplies.length === 0);
  }

  console.log(`\nKết quả autoreplies-convex: ${pass} PASS, ${fail} FAIL`);
  Date.now = REAL_NOW;
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  Date.now = REAL_NOW;
  console.error("LỖI NGOÀI DỰ KIẾN:", e);
  process.exit(1);
});
