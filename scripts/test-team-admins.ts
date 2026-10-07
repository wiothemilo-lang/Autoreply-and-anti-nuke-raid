// TEST: quản trị viên nhóm — ai được vào cửa sổ Admin (07/10/2026).
// Chạy: bun scripts/test-team-admins.ts
//
// VÌ SAO CẦN: trước đây cửa sổ Admin chỉ mở cho DUY NHẤT `ownerDiscordId`.
// Yêu cầu mới: team vận hành bot cũng vào được (theo dõi lỗi, sức khoẻ máy
// chủ, AI, threat research). Đây là thay đổi QUYỀN, nên mọi đường đều phải
// khoá bằng test — sai một nhánh là hoặc lộ cửa sổ Admin cho người ngoài,
// hoặc team không vào được. Bốn điều được khoá:
//   1. CHUẨN HOÁ danh sách — dữ liệu bẩn trong DB không được thành quyền.
//   2. PHÂN BIỆT HAI MỨC QUYỀN — `isBotAdminUser` (vào cửa sổ Admin) KHÔNG
//      được kéo theo tính năng ẩn / mật khẩu / OWNER_SEED (`requireBotOwner`).
//   3. CHỈ CHỦ BOT SỬA DANH SÁCH — người trong danh sách không tự thêm người
//      khác (tự nâng quyền).
//   4. LỖI RÕ RÀNG khi ID sai — chủ bot phải biết mình gõ sai ID nào, không
//      được âm thầm bỏ qua rồi tưởng đã cấp quyền.
import {
  MAX_TEAM_ADMINS,
  canonicalTeamAdminIds,
  getTeamAdmins,
  isBotAdminUser,
  isBotOwnerUser,
  requireBotAdmin,
  requireBotOwner,
  setTeamAdmins,
} from "../convex/hidden";

type Row = Record<string, any>;

const setTeamAdminsH = (setTeamAdmins as any)._handler;
const getTeamAdminsH = (getTeamAdmins as any)._handler;

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

const OWNER = "111111111111111111";
const ADMIN_A = "222222222222222222";
const ADMIN_B = "333333333333333333";
const STRANGER = "444444444444444444";

/**
 * Ctx giả: bảng trên mảng. `withIndex` chỉ cần `eq` (mọi truy vấn ở đây dùng
 * index phẳng `by_kind` / `by_token` / `by_discordId`).
 */
function makeCtx(opts: { ownerId?: string | null; teamAdmins?: unknown; users?: Row[] } = {}) {
  // createdAt = hiện tại: getUserByToken loại phiên hết hạn (SESSION_TTL_MS),
  // dùng mốc cũ là mọi token rơi vào nhánh "không đăng nhập" và test sai chỗ.
  const now = Date.now();
  const sessions: Row[] = [
    { _id: "s_owner", token: "tok_owner", userId: "u_owner", createdAt: now, authVersion: 1 },
    { _id: "s_admin", token: "tok_admin", userId: "u_admin", createdAt: now, authVersion: 1 },
    {
      _id: "s_stranger",
      token: "tok_stranger",
      userId: "u_stranger",
      createdAt: now,
      authVersion: 1,
    },
  ];
  const users: Row[] = [
    { _id: "u_owner", discordId: OWNER, username: "owner" },
    { _id: "u_admin", discordId: ADMIN_A, username: "admin-a" },
    { _id: "u_stranger", discordId: STRANGER, username: "stranger" },
    ...(opts.users ?? []),
  ];
  const botStatus: Row[] =
    opts.ownerId === null
      ? []
      : [
          {
            _id: "bot1",
            kind: "status",
            online: true,
            guildCount: 1,
            memberCount: 1,
            lastHeartbeat: 1,
            startedAt: 1,
            version: "1",
            ownerDiscordId: opts.ownerId ?? OWNER,
            ...(opts.teamAdmins === undefined ? {} : { teamAdminDiscordIds: opts.teamAdmins }),
          },
        ];
  const tables: Record<string, Row[]> = { sessions, users, botStatus };
  const patches: { id: string; patch: Row }[] = [];

  const db = {
    query(table: string) {
      const rows = tables[table] ?? [];
      const api = {
        withIndex(_name: string, build: (q: any) => any) {
          const q = {
            eq: (field: string, value: unknown) => q,
          };
          // Lấy điều kiện eq bằng cách chạy builder 1 lần rồi tự lọc lại:
          // đủ cho các index phẳng dùng trong file này.
          const conds: [string, unknown][] = [];
          const q2 = {
            eq: (field: string, value: unknown) => {
              conds.push([field, value]);
              return q2;
            },
          };
          build(q2);
          const filtered = rows.filter((r) => conds.every(([f, v]) => r[f] === v));
          return {
            first: async () => filtered[0] ?? null,
            collect: async () => filtered,
          };
        },
        first: async () => rows[0] ?? null,
        collect: async () => rows,
      };
      void api;
      return {
        withIndex(name: string, build: (q: any) => any) {
          const conds: [string, unknown][] = [];
          const q = {
            eq: (field: string, value: unknown) => {
              conds.push([field, value]);
              return q;
            },
          };
          build(q);
          const filtered = rows.filter((r) => conds.every(([f, v]) => r[f] === v));
          void name;
          return {
            first: async () => filtered[0] ?? null,
            collect: async () => filtered,
          };
        },
      };
    },
    patch: async (id: string, patch: Row) => {
      patches.push({ id, patch });
      const row = Object.values(tables)
        .flat()
        .find((r) => r._id === id);
      if (row) Object.assign(row, patch);
    },
    // getUserByToken trả user bằng ctx.db.get(session.userId) — thiếu hàm này
    // là mọi token rơi về null và test quyền sẽ "đỏ vì mock", không vì code.
    get: async (id: string) =>
      Object.values(tables)
        .flat()
        .find((r) => r._id === id) ?? null,
    insert: async (table: string, doc: Row) => {
      tables[table] = tables[table] ?? [];
      tables[table].push({ _id: `new_${table}_${tables[table].length}`, ...doc });
      return `new_${table}`;
    },
  };

  return { ctx: { db }, patches, tables };
}

// ── 1. Chuẩn hoá danh sách ────────────────────────────────────────────────────
console.log("── 1. canonicalTeamAdminIds ──");
check(
  "danh sách trống (field chưa có) → rỗng",
  canonicalTeamAdminIds({ ownerDiscordId: OWNER }).length === 0,
);
check(
  "cắt khoảng trắng + bỏ giá trị không phải snowflake + bỏ trùng",
  JSON.stringify(
    canonicalTeamAdminIds({
      ownerDiscordId: OWNER,
      teamAdminDiscordIds: [` ${ADMIN_A} `, ADMIN_A, "không-phải-id", "", "123", ADMIN_B],
    }),
  ) === JSON.stringify([ADMIN_A, ADMIN_B]),
);
check(
  "loại chính chủ bot khỏi danh sách (quyền chủ bot không phụ thuộc danh sách)",
  JSON.stringify(
    canonicalTeamAdminIds({ ownerDiscordId: OWNER, teamAdminDiscordIds: [OWNER, ADMIN_A] }),
  ) === JSON.stringify([ADMIN_A]),
);
// Dùng BigInt để 25 ID THẬT SỰ KHÁC NHAU: Number vượt 2^53 nên
// `100000000000000000 + i` cho ra cùng một chuỗi và bị dedupe — test sẽ đỏ vì
// dữ liệu test, không vì code.
const many = Array.from({ length: MAX_TEAM_ADMINS + 5 }, (_, i) =>
  String(100000000000000000n + BigInt(i)),
);
check(
  `cắt còn tối đa ${MAX_TEAM_ADMINS} người`,
  canonicalTeamAdminIds({ ownerDiscordId: OWNER, teamAdminDiscordIds: many }).length ===
    MAX_TEAM_ADMINS,
);
check(
  "hàm chuẩn hoá vẫn trả ID hợp lệ khi chưa có chủ bot (nó là bộ lọc, không phải cổng quyền)",
  JSON.stringify(canonicalTeamAdminIds({ teamAdminDiscordIds: [ADMIN_A] })) ===
    JSON.stringify([ADMIN_A]),
);

// ── 2. Hai mức quyền KHÁC nhau ────────────────────────────────────────────────
console.log("── 2. isBotAdminUser ⇄ isBotOwnerUser ──");
const status = { ownerDiscordId: OWNER, teamAdminDiscordIds: [ADMIN_A] };
check(
  "chủ bot: admin = true và owner = true",
  isBotAdminUser({ discordId: OWNER }, status) && isBotOwnerUser({ discordId: OWNER }, status),
);
check("quản trị viên nhóm: admin = true", isBotAdminUser({ discordId: ADMIN_A }, status));
check(
  "quản trị viên nhóm: owner = FALSE (không kéo theo tính năng ẩn)",
  !isBotOwnerUser({ discordId: ADMIN_A }, status),
);
check("người lạ: admin = false", !isBotAdminUser({ discordId: STRANGER }, status));
check("chưa đăng nhập: admin = false", !isBotAdminUser(null, status));
check(
  "chủ bot chưa khởi tạo (owner trống) → KHÔNG ai là admin dù có trong danh sách",
  !isBotAdminUser({ discordId: ADMIN_A }, { teamAdminDiscordIds: [ADMIN_A] }) &&
    !isBotAdminUser({ discordId: ADMIN_A }, null),
);
check(
  "ID trong DB có khoảng trắng thừa → vẫn được cắt và cấp quyền đúng người",
  isBotAdminUser(
    { discordId: ADMIN_A },
    { ownerDiscordId: OWNER, teamAdminDiscordIds: [` ${ADMIN_A} `] },
  ),
);
check(
  "chuỗi rác trong DB không thành quyền cho bất kỳ ai",
  !isBotAdminUser(
    { discordId: "khong-phai-id" },
    { ownerDiscordId: OWNER, teamAdminDiscordIds: ["khong-phai-id"] },
  ),
);

// ── 3. requireBotAdmin / requireBotOwner ──────────────────────────────────────
console.log("── 3. requireBotAdmin / requireBotOwner ──");
{
  const { ctx } = makeCtx({ teamAdmins: [ADMIN_A] });
  const owner = await requireBotAdmin(ctx as any, { discordId: OWNER });
  check("requireBotAdmin: chủ bot qua", owner?.ownerDiscordId === OWNER);
  await requireBotAdmin(ctx as any, { discordId: ADMIN_A });
  check("requireBotAdmin: quản trị viên nhóm qua", true);
  await expectThrow(
    "requireBotAdmin: người lạ bị chặn",
    () => requireBotAdmin(ctx as any, { discordId: STRANGER }),
    /quản trị viên nhóm/,
  );
  await expectThrow(
    "requireBotAdmin: chưa đăng nhập bị chặn",
    () => requireBotAdmin(ctx as any, null),
    /đăng nhập/,
  );
  await expectThrow(
    "requireBotOwner: quản trị viên nhóm KHÔNG qua được cổng chủ bot",
    () => requireBotOwner(ctx as any, { discordId: ADMIN_A }),
    /Chỉ admin sở hữu bot/,
  );
}

// ── 4. setTeamAdmins: chỉ chủ bot, lỗi rõ ràng ────────────────────────────────
console.log("── 4. setTeamAdmins ──");
{
  const { ctx, patches } = makeCtx();
  const res = await setTeamAdminsH(ctx, {
    token: "tok_owner",
    discordIds: [ADMIN_A, ADMIN_A, OWNER],
  });
  check(
    "chủ bot lưu được, danh sách đã chuẩn hoá (bỏ trùng + bỏ chính chủ bot)",
    JSON.stringify(res?.discordIds) === JSON.stringify([ADMIN_A]),
  );
  check(
    "ghi đúng field teamAdminDiscordIds vào botStatus",
    patches.some(
      (p) =>
        p.id === "bot1" &&
        JSON.stringify(p.patch.teamAdminDiscordIds) === JSON.stringify([ADMIN_A]),
    ),
  );

  const clean = makeCtx({ teamAdmins: [ADMIN_A] });
  await expectThrow(
    "quản trị viên nhóm KHÔNG tự thêm/xoá người khác được",
    () => setTeamAdminsH(clean.ctx, { token: "tok_admin", discordIds: [ADMIN_B] }),
    /Chỉ admin sở hữu bot/,
  );
  check("bị từ chối ⇒ KHÔNG ghi gì", clean.patches.length === 0);

  await expectThrow(
    "ID sai bị TỪ CHỐI kèm chính ID đó (không âm thầm bỏ qua)",
    () => setTeamAdminsH(ctx, { token: "tok_owner", discordIds: ["abc123"] }),
    /abc123/,
  );
  await expectThrow(
    `quá ${MAX_TEAM_ADMINS} người thì báo lỗi`,
    () => setTeamAdminsH(ctx, { token: "tok_owner", discordIds: [...many] }),
    /Tối đa/,
  );
  const empty = await setTeamAdminsH(ctx, { token: "tok_owner", discordIds: [] });
  check(
    "xoá hết danh sách được (chỉ còn chủ bot)",
    JSON.stringify(empty?.discordIds) === JSON.stringify([]),
  );
}

// ── 5. getTeamAdmins: chỉ chủ bot, kèm hồ sơ nếu đã đăng nhập web ─────────────
console.log("── 5. getTeamAdmins ──");
{
  const { ctx } = makeCtx({ teamAdmins: [ADMIN_A, ADMIN_B] });
  const data = await getTeamAdminsH(ctx, { token: "tok_owner" });
  check(
    "chủ bot đọc được danh sách + trần",
    data?.max === MAX_TEAM_ADMINS && data.members.length === 2,
  );
  check("người đã đăng nhập web → có username", data.members[0].username === "admin-a");
  check(
    'người CHƯA từng đăng nhập → username null (UI hiện "chưa từng đăng nhập")',
    data.members[1].username === null && data.members[1].discordId === ADMIN_B,
  );
  const asAdmin = makeCtx({ teamAdmins: [ADMIN_A] });
  await expectThrow(
    "quản trị viên nhóm không đọc được danh sách",
    () => getTeamAdminsH(asAdmin.ctx, { token: "tok_admin" }),
    /Chỉ admin sở hữu bot/,
  );
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
