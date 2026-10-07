// TEST: góp ý người dùng (convex/feedback.ts) — trang /feedback.
//
// Chạy: bun scripts/test-feedback.ts
//
// Vì sao cần test: đây là endpoint CÔNG KHAI duy nhất cho người lạ ghi vào DB
// mà không cần đăng nhập. Ba lớp rủi ro phải khoá:
//   1. NỘI DUNG RÁC: không giới hạn độ dài ⇒ một request có thể nhét hàng trăm
//      KB vào bảng; không chuẩn hoá email ⇒ ô "email" thành chỗ chứa rác.
//   2. ĐỐT HẠN MỨC: không có trần ⇒ script 3 dòng ghi vài nghìn dòng/phút vào
//      deployment free tier, làm cạn hạn mức của người dùng thật.
//   3. RÒ DỮ LIỆU: `list` phải CHỈ chủ bot đọc được — góp ý có thể chứa email
//      và mô tả lỗi kèm ID server của người gửi.
//
// Hermetic: không mạng, không DB thật — ctx giả trong bộ nhớ (cùng khuôn với
// scripts/test-presets-convex.ts).
import {
  FEEDBACK_KINDS,
  FEEDBACK_KEEP_MAX,
  FEEDBACK_TRIM_BATCH,
  MESSAGE_MAX,
  MESSAGE_MIN,
  SPAM_MAX_IN_WINDOW,
  SPAM_WINDOW_MS,
  list,
  submit,
  trimFeedback,
  validateFeedback,
} from "../convex/feedback";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail?: string) => {
  console.log(ok ? `  ✅ ${label}` : `  ❌ ${label}${ok ? "" : ` — ${detail ?? ""}`}`);
  if (ok) pass++;
  else fail++;
};

type Row = Record<string, any>;

function makeView(rows: Row[], desc = false) {
  const ordered = desc ? [...rows].reverse() : rows;
  const view: any = {
    collect: async () => ordered,
    take: async (n: number) => ordered.slice(0, n),
    first: async () => ordered[0] ?? null,
    order: (dir: string) => makeView(rows, dir === "desc"),
    filter: () => view,
  };
  return view;
}

/**
 * ctx giả: bảng trong bộ nhớ + ghi lại insert để assert.
 * Hỗ trợ đúng những gì convex/feedback.ts dùng: withIndex + eq/gt + take/order.
 */
function makeCtx(
  tables: Record<string, Row[]> = {},
  token = "",
  opts: { ownerDiscordId?: string } = {},
) {
  const writes = { insert: [] as any[], delete: [] as string[] };
  const db = {
    query(table: string) {
      const rows = tables[table] ?? [];
      const builder: any = {
        withIndex(_name: string, bound?: (q: any) => any) {
          const eq: Record<string, any> = {};
          const gt: Record<string, any> = {};
          const q: any = {
            eq: (f: string, v: any) => ((eq[f] = v), q),
            gt: (f: string, v: any) => ((gt[f] = v), q),
          };
          // `list` gọi withIndex không kèm bound (quét cả index) — đừng vỡ ở đó.
          if (typeof bound === "function") bound(q);
          const filtered = rows.filter(
            (r) =>
              Object.entries(eq).every(([k, v]) => r[k] === v) &&
              Object.entries(gt).every(([k, v]) => (r[k] ?? Number.NEGATIVE_INFINITY) > v),
          );
          return makeView(filtered);
        },
        ...makeView(rows),
      };
      return builder;
    },
    get: async (id: string) =>
      Object.values(tables)
        .flat()
        .find((r) => r._id === id) ?? null,
    insert: async (table: string, doc: any) => {
      writes.insert.push({ table, doc });
      const id = `new-${table}-${writes.insert.length}`;
      (tables[table] ||= []).push({ _id: id, ...doc });
      return id;
    },
    delete: async (id: string) => {
      writes.delete.push(id);
      for (const key of Object.keys(tables)) tables[key] = tables[key].filter((r) => r._id !== id);
    },
  };
  // Phiên đăng nhập: cần authVersion hiện hành (phiên cũ bị từ chối).
  tables.sessions ||= [];
  tables.users ||= [];
  tables.botStatus ||= [];
  if (token) {
    tables.sessions.push({ _id: "s1", token, userId: "u1", authVersion: 1, createdAt: Date.now() });
    // Discord ID THẬT là snowflake 15–21 chữ số: `canonicalBotOwnerId` loại id
    // rác trước khi so chủ sở hữu, nên fixture phải dùng id hợp lệ thì test chủ
    // bot mới thực sự chạy qua nhánh đúng (id "999" từng khiến test xanh oan).
    tables.users.push({
      _id: "u1",
      discordId: OWNER_ID,
      username: "someone",
      manageableGuildIds: [],
    });
  }
  if (opts.ownerDiscordId) {
    tables.botStatus.push({ _id: "b1", kind: "status", ownerDiscordId: opts.ownerDiscordId });
  }
  return { db, writes, tables } as any;
}

const submitHandler = (submit as any)._handler;
const listHandler = (list as any)._handler;
const TOKEN = "tok-1";
/** Snowflake 18 chữ số — đúng dạng Discord ID thật. */
const OWNER_ID = "123456789012345678";
const OTHER_ID = "987654321098765432";

// ─── 1. Luật nội dung (hàm thuần, dùng chung với mutation) ──────────────────
console.log("── #1 luật nội dung ──");
{
  check(
    "loại góp ý lạ bị từ chối",
    validateFeedback({ kind: "spam", message: "nội dung đủ dài để qua cửa" }).ok === false,
  );
  check(
    "cả 3 loại hợp lệ đều qua được (khớp FEEDBACK_KINDS)",
    FEEDBACK_KINDS.length === 3 &&
      FEEDBACK_KINDS.every(
        (k) => validateFeedback({ kind: k, message: "x".repeat(MESSAGE_MIN) }).ok,
      ),
  );

  const short = validateFeedback({ kind: "bug", message: "x".repeat(MESSAGE_MIN - 1) });
  check(
    `nội dung ngắn hơn ${MESSAGE_MIN} ký tự → từ chối kèm nói rõ thiếu gì`,
    short.ok === false &&
      !short.ok &&
      short.error.includes(String(MESSAGE_MIN)) &&
      short.error.includes("quá ngắn"),
  );

  const atMin = validateFeedback({ kind: "bug", message: "x".repeat(MESSAGE_MIN) });
  check(`đúng ${MESSAGE_MIN} ký tự là hợp lệ (biên mở về phía ngắn)`, atMin.ok === true);

  const atMax = validateFeedback({ kind: "idea", message: "x".repeat(MESSAGE_MAX) });
  check(`đúng ${MESSAGE_MAX} ký tự là hợp lệ (biên trên)`, atMax.ok === true);
  const overMax = validateFeedback({ kind: "idea", message: "x".repeat(MESSAGE_MAX + 1) });
  check(
    `vượt ${MESSAGE_MAX} ký tự → từ chối (không nhét được nội dung khổng lồ vào DB)`,
    overMax.ok === false && !overMax.ok && overMax.error.includes("quá dài"),
  );

  check(
    "nội dung được TRIM hai đầu (khoảng trắng không tính là nội dung)",
    (() => {
      const r = validateFeedback({ kind: "bug", message: `   ${"x".repeat(MESSAGE_MIN)}   ` });
      return r.ok === true && r.message.length === MESSAGE_MIN;
    })(),
  );
  check(
    "nội dung chỉ gồm khoảng trắng/enter bị từ chối",
    validateFeedback({ kind: "bug", message: "        \n   \t  " }).ok === false,
  );

  check(
    "email bỏ trống → hợp lệ và KHÔNG lưu field email",
    (() => {
      const r = validateFeedback({ kind: "bug", message: "x".repeat(MESSAGE_MIN) });
      return r.ok === true && r.email === undefined;
    })(),
  );
  check(
    "email đúng dạng → giữ nguyên (đã trim)",
    (() => {
      const r = validateFeedback({
        kind: "other",
        message: "x".repeat(20),
        email: "  a.b@example.com  ",
      });
      return r.ok === true && r.email === "a.b@example.com";
    })(),
  );
  const badEmail = validateFeedback({
    kind: "other",
    message: "x".repeat(20),
    email: "khong-phai-email",
  });
  check(
    "email sai dạng → từ chối kèm gợi ý bỏ trống",
    badEmail.ok === false && !badEmail.ok && badEmail.error.includes("bỏ trống"),
  );
  check(
    "email dài quá trần → từ chối",
    validateFeedback({ kind: "other", message: "x".repeat(20), email: `${"a".repeat(210)}@x.com` })
      .ok === false,
  );
}

// ─── 2. Mutation submit: ghi đúng dữ liệu, chặn spam ───────────────────────
console.log("\n── #2 submit: ghi gì vào bảng feedback ──");
{
  const ctx = makeCtx();
  const r = await submitHandler(ctx, {
    kind: "bug",
    message: "  Bot không trả lời khi bị tag  ",
    email: "user@example.com",
    lang: "vi",
    page: "/feedback",
  });
  const row = ctx.writes.insert[0];
  check("gửi hợp lệ → trả ok + stored", r.ok === true && r.stored === true);
  check("ghi vào đúng bảng feedback", ctx.writes.insert.length === 1 && row.table === "feedback");
  check("nội dung được trim trước khi lưu", row.doc.message === "Bot không trả lời khi bị tag");
  check(
    "lưu kind + email + lang + page",
    row.doc.kind === "bug" && row.doc.email === "user@example.com",
  );
  check(
    "lưu mốc thời gian (index by_createdAt dựa vào field này)",
    typeof row.doc.createdAt === "number" && row.doc.createdAt > 0,
  );
}
{
  const ctx = makeCtx();
  await submitHandler(ctx, { kind: "other", message: "x".repeat(MESSAGE_MIN) });
  check(
    "không có email → document KHÔNG có field email (không lưu chuỗi rỗng)",
    ctx.writes.insert[0].doc.email === undefined,
  );
}
{
  const ctx = makeCtx();
  await submitHandler(ctx, {
    kind: "idea",
    message: "x".repeat(20),
    lang: "a".repeat(60),
    page: "/".repeat(500),
  });
  const doc = ctx.writes.insert[0].doc;
  check("lang bị cắt còn 8 ký tự (ô rác không vào DB)", doc.lang.length === 8);
  check("page bị cắt còn 120 ký tự", doc.page.length === 120);
}

console.log("\n── #3 submit: chống spam + bẫy bot ──");
{
  const ctx = makeCtx();
  const r = await submitHandler(ctx, {
    kind: "bug",
    message: "x".repeat(MESSAGE_MIN),
    honeypot: "http://spam.example",
  });
  check(
    "bẫy bot có giá trị → trả ok nhưng KHÔNG ghi gì (đừng dạy script biết đã bị phát hiện)",
    r.ok === true && r.stored === false && ctx.writes.insert.length === 0,
  );
}
{
  const ctx = makeCtx();
  let threw = false;
  try {
    await submitHandler(ctx, { kind: "bug", message: "ngắn" });
  } catch {
    threw = true;
  }
  check("nội dung không hợp lệ → ném lỗi + không ghi", threw && ctx.writes.insert.length === 0);
}
{
  // Đầy cửa sổ chống spam: SPAM_MAX_IN_WINDOW dòng vừa mới gửi.
  const now = Date.now();
  const rows = Array.from({ length: SPAM_MAX_IN_WINDOW }, (_, i) => ({
    _id: `f${i}`,
    kind: "bug",
    message: "x".repeat(20),
    createdAt: now - 1000 - i,
  }));
  const ctx = makeCtx({ feedback: rows });
  let threw = false;
  let msg = "";
  try {
    await submitHandler(ctx, { kind: "bug", message: "x".repeat(20) });
  } catch (e) {
    threw = true;
    msg = String((e as Error).message);
  }
  check("chạm trần → từ chối thay vì ghi thêm", threw && ctx.writes.insert.length === 0);
  check("thông báo có đường lui (nhắn Discord)", msg.includes("Discord"));
}
{
  // Dòng CŨ hơn cửa sổ không được tính là spam — botnet để lại rác hôm qua
  // không được khoá form của người dùng thật hôm nay.
  const old = Date.now() - SPAM_WINDOW_MS - 60_000;
  const rows = Array.from({ length: SPAM_MAX_IN_WINDOW + 10 }, (_, i) => ({
    _id: `o${i}`,
    kind: "other",
    message: "x".repeat(20),
    createdAt: old - i * 1000,
  }));
  const ctx = makeCtx({ feedback: rows });
  const r = await submitHandler(ctx, { kind: "other", message: "x".repeat(20) });
  check(
    "góp ý cũ ngoài cửa sổ KHÔNG khoá form (trần là theo cửa sổ thời gian)",
    r.ok === true && ctx.writes.insert.length === 1,
  );
}
{
  // Đúng biên: SPAM_MAX-1 dòng trong cửa sổ vẫn gửi được (trần là >=, không phải >).
  const now = Date.now();
  const rows = Array.from({ length: SPAM_MAX_IN_WINDOW - 1 }, (_, i) => ({
    _id: `b${i}`,
    kind: "bug",
    message: "x".repeat(20),
    createdAt: now - 500 - i,
  }));
  const ctx = makeCtx({ feedback: rows });
  const r = await submitHandler(ctx, { kind: "bug", message: "x".repeat(20) });
  check(
    "dưới trần 1 dòng vẫn gửi được (biên đúng)",
    r.ok === true && ctx.writes.insert.length === 1,
  );
}

// ─── 4. Query list: chỉ chủ bot đọc được ───────────────────────────────────
console.log("\n── #4 list: cổng quyền ──");
{
  const rows = [
    {
      _id: "f1",
      kind: "bug",
      message: "cũ",
      createdAt: 1000,
      email: "a@x.com",
      lang: "vi",
      page: "/feedback",
    },
    { _id: "f2", kind: "idea", message: "mới", createdAt: 2000 },
  ];
  const anon = makeCtx({ feedback: rows }, "", { ownerDiscordId: OWNER_ID });
  check("không token → null (không có dữ liệu)", (await listHandler(anon, { token: "" })) === null);

  // Người dùng có phiên hợp lệ nhưng KHÔNG phải chủ bot (id snowflake khác).
  const notOwner = makeCtx({ feedback: rows }, TOKEN, { ownerDiscordId: OTHER_ID });
  check(
    "người dùng thường (không phải chủ bot) → null",
    (await listHandler(notOwner, { token: TOKEN })) === null,
  );

  const junkOwner = makeCtx({ feedback: rows }, TOKEN, { ownerDiscordId: "999" });
  check(
    "chủ sở hữu khai bằng id rác (không phải snowflake) → null",
    (await listHandler(junkOwner, { token: TOKEN })) === null,
  );

  const noOwnerInit = makeCtx({ feedback: rows }, TOKEN);
  check(
    "bot chưa bootstrap chủ sở hữu → null (không mở cửa cho tất cả)",
    (await listHandler(noOwnerInit, { token: TOKEN })) === null,
  );

  const owner = makeCtx({ feedback: rows }, TOKEN, { ownerDiscordId: OWNER_ID });
  const got = await listHandler(owner, { token: TOKEN });
  check("chủ bot → đọc được danh sách", Array.isArray(got) && got.length === 2);
  check("mới nhất trước (index by_createdAt desc)", got[0].id === "f2" && got[1].id === "f1");
  check("thiếu email → null (không trả undefined cho UI)", got[0].email === null);
  check("giữ nguyên nội dung + loại", got[1].message === "cũ" && got[1].kind === "bug");

  const capped = await listHandler(
    makeCtx({ feedback: rows }, TOKEN, { ownerDiscordId: OWNER_ID }),
    {
      token: TOKEN,
      limit: 1,
    },
  );
  check("limit được tôn trọng", capped.length === 1);
  const huge = await listHandler(makeCtx({ feedback: rows }, TOKEN, { ownerDiscordId: OWNER_ID }), {
    token: TOKEN,
    limit: 10_000,
  });
  check("limit khổng lồ bị kẹp về trần 200 (không kéo cả bảng qua dây)", huge.length === 2);
}

// ─── 5. Trần lưu trữ: giữ tối đa FEEDBACK_KEEP_MAX, xoá dòng CŨ NHẤT ───────
// Endpoint công khai không có trần tổng = một script có thể nhét ~4.300
// dòng/ngày (trần 30/10 phút vẫn cho qua) tới ~6 KB/dòng ⇒ cạn storage gói
// Free. Ba điều phải đúng: (a) vượt trần thì chỉ xoá CŨ NHẤT và chỉ một lô,
// (b) chưa vượt trần thì không xoá gì, (c) lỗi dọn không làm hỏng việc gửi.
console.log("\n── #5 trần lưu trữ: dọn dòng cũ ──");
{
  const rows = Array.from({ length: FEEDBACK_KEEP_MAX + FEEDBACK_TRIM_BATCH + 20 }, (_, i) => ({
    _id: `k${i}`,
    kind: "other",
    message: "x".repeat(20),
    createdAt: 1_000 + i,
  }));
  const ctx = makeCtx({ feedback: rows });
  const removed = await trimFeedback(ctx);
  check(
    `vượt trần → xoá đúng ${FEEDBACK_TRIM_BATCH} dòng cũ nhất (một lô)`,
    removed === FEEDBACK_TRIM_BATCH && ctx.writes.delete.length === FEEDBACK_TRIM_BATCH,
    `removed=${removed}`,
  );
  check(
    "chỉ xoá dòng CŨ NHẤT (giữ lại nguyên số mới nhất)",
    ctx.writes.delete[0] === "k0" && ctx.writes.delete.at(-1) === `k${FEEDBACK_TRIM_BATCH - 1}`,
    ctx.writes.delete.slice(0, 3).join(","),
  );
  check(
    "giữ lại đúng trần (không xoá quá tay)",
    ctx.tables.feedback.length === FEEDBACK_KEEP_MAX + 20,
    `còn ${ctx.tables.feedback.length}`,
  );
}
{
  const rows = Array.from({ length: FEEDBACK_KEEP_MAX }, (_, i) => ({
    _id: `e${i}`,
    kind: "other",
    message: "x".repeat(20),
    createdAt: 1_000 + i,
  }));
  const ctx = makeCtx({ feedback: rows });
  const removed = await trimFeedback(ctx);
  check(
    "đúng trần → KHÔNG xoá gì (không đọc/ghi thừa khi bình thường)",
    removed === 0 &&
      ctx.writes.delete.length === 0 &&
      ctx.tables.feedback.length === FEEDBACK_KEEP_MAX,
  );
}
{
  // Xác suất 1/25: phần lớn lượt gửi KHÔNG kéo theo việc dọn.
  const rows = Array.from({ length: FEEDBACK_KEEP_MAX + 5 }, (_, i) => ({
    _id: `p${i}`,
    kind: "bug",
    message: "x".repeat(20),
    createdAt: 1_000 + i,
  }));
  const realRandom = Math.random;
  try {
    Math.random = () => 0.99; // trượt xác suất
    const ctx = makeCtx({ feedback: rows });
    await submitHandler(ctx, { kind: "bug", message: "x".repeat(20) });
    check(
      "lượt gửi trượt xác suất → không dọn (không tốn thêm gì)",
      ctx.writes.delete.length === 0,
    );

    Math.random = () => 0; // trúng xác suất
    const ctx2 = makeCtx({ feedback: rows });
    await submitHandler(ctx2, { kind: "bug", message: "x".repeat(20) });
    check(
      "lượt gửi trúng xác suất → có dọn bớt dòng cũ",
      ctx2.writes.delete.length > 0 && ctx2.writes.insert.length === 1,
      `xoá ${ctx2.writes.delete.length}`,
    );
  } finally {
    Math.random = realRandom;
  }
}
{
  // BEST-EFFORT: dọn lỗi KHÔNG được biến thành lỗi gửi góp ý.
  const rows = Array.from({ length: FEEDBACK_KEEP_MAX + 5 }, (_, i) => ({
    _id: `f${i}`,
    kind: "idea",
    message: "x".repeat(20),
    createdAt: 1_000 + i,
  }));
  const realRandom = Math.random;
  try {
    Math.random = () => 0;
    const ctx = makeCtx({ feedback: rows });
    ctx.db.delete = async () => {
      throw new Error("Convex quá tải");
    };
    const r = await submitHandler(ctx, { kind: "idea", message: "x".repeat(20) });
    check(
      "dọn lỗi → người gửi VẪN nhận ok và góp ý đã được ghi",
      r.ok === true && r.stored === true && ctx.writes.insert.length === 1,
    );
  } finally {
    Math.random = realRandom;
  }
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
