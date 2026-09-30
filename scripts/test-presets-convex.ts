// TEST: presets (convex/presets.ts) — áp profile bảo mật 1 chạm.
//
// Chạy: bun scripts/test-presets-convex.ts
//
// Vì sao cần test: `applyPreset` là mutation ghi ĐỒNG LOẠT vào
// antinukeModules + các field global của guild, gọi bằng 1 cú bấm duy nhất
// của chủ server. Ba lớp rủi ro mà test này khoá:
//   1. THIẾU TÍN HIỆU: preset ghi thẳng field bot đọc. Không có
//      `settingsChangedAt` thì thay đổi không tới bot trong 30 phút —
//      đúng lớp bug 23/09/2026 đã xảy ra (dashboard đổi cấu hình, bot im).
//   2. MẤT DỮ LIỆU RIÊNG: preset không được đụng whitelist/adminRoles/
//      modRoles — đó là dữ liệu riêng của từng server.
//   3. ĐỔI HỆ SỐ NHẠY CẢM: ngưỡng phải theo preset (server nhỏ nới rộng để
//      giảm false positive), và module lạ trong preset cũ phải bị bỏ qua
//      chứ không làm crash giữa chừng lúc bật preset cho 30+ module.
//
// Hermetic: không mạng, không DB thật — ctx giả trong bộ nhớ.
import { applyPreset, SECURITY_PRESETS } from "../convex/presets";
import { ANTI_NUKE_MODULES } from "../convex/modules";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean) => {
  console.log(ok ? `  ✅ ${label}` : `  ❌ ${label}`);
  if (ok) pass++;
  else fail++;
};

type Row = Record<string, any>;

/** ctx giả: bảng trong bộ nhớ + ghi lại patch/insert để assert. */
function makeCtx(tables: Record<string, Row[]>, token: string) {
  const writes = { patch: [] as any[], insert: [] as any[] };
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
      writes.patch.push({ id, patch });
      const row = Object.values(tables)
        .flat()
        .find((r) => r._id === id);
      if (row) Object.assign(row, patch);
    },
    insert: async (table: string, doc: any) => {
      writes.insert.push({ table, doc });
      (tables[table] ||= []).push({ _id: `new-${table}-${writes.insert.length}`, ...doc });
      return `new-${table}-${writes.insert.length}`;
    },
  };
  // getUserByToken: cần session có `authVersion` (phiên mới do OAuth
  // server-side xác thực) — thiếu thì bị từ chối như phiên legacy.
  tables.sessions ||= [];
  tables.users ||= [];
  tables.sessions.push({
    _id: "s1",
    token,
    userId: "u1",
    createdAt: Date.now(),
    authVersion: 1,
  });
  tables.users.push({ _id: "u1", discordId: "d1", username: "owner", manageableGuildIds: [] });
  return { db, writes, tables, token } as any;
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

const handler = (applyPreset as any)._handler;
const TOKEN = "tok-1";

/** Guild mà user sở hữu (được thêm vào manageableGuildIds để qua quyền). */
function ownedGuild(id = "g1", extra: Row = {}) {
  return { _id: id, discordId: "111111111111111111", name: "Server", ...extra };
}

console.log("── Cổng quyền: không ai được áp preset lên server không mình ──");
{
  const ctx = makeCtx({ guilds: [ownedGuild()] }, TOKEN);
  // User KHÔNG nằm trong manageableGuildIds → phải từ chối.
  let threw = false;
  try {
    await handler(ctx, { token: TOKEN, guildId: "111111111111111111", preset: "small" });
  } catch {
    threw = true;
  }
  check("user không quản lý server → bị từ chối (không ghi gì)", threw);
  check("không ghi bất kỳ module nào khi bị từ chối", ctx.writes.insert.length === 0);

  const ctx2 = makeCtx({ guilds: [ownedGuild()] }, TOKEN);
  ctx2.tables.users[0].manageableGuildIds = ["111111111111111111"];
  const r = await handler(ctx2, {
    token: TOKEN,
    guildId: "111111111111111111",
    preset: "small",
  });
  check("user có quyền → áp được preset", r.ok === true && r.preset === "small");
}

console.log("\n── Tín hiệu cho bot: settingsChangedAt bắt buộc ──");
{
  const ctx = makeCtx({ guilds: [ownedGuild()] }, TOKEN);
  ctx.tables.users[0].manageableGuildIds = ["111111111111111111"];
  const before = Date.now();
  await handler(ctx, { token: TOKEN, guildId: "111111111111111111", preset: "community" });
  const guildPatch = ctx.writes.patch.find((p) => String(p.id).startsWith("g1"));
  check("ghi patch lên bảng guilds", !!guildPatch);
  check(
    "patch CÓ settingsChangedAt (thiếu là bot không thấy đổi trong 30 phút)",
    typeof guildPatch?.patch?.settingsChangedAt === "number" &&
      guildPatch.patch.settingsChangedAt >= before,
  );
  check("patch mang cấu hình global của preset", guildPatch?.patch?.antinukeEnabled === true);
  check(
    "preset community bật joinGate (small thì không)",
    SECURITY_PRESETS.community.global.joinGateEnabled === true &&
      SECURITY_PRESETS.small.global.joinGateEnabled === false,
  );
}

console.log("\n── Không đụng dữ liệu riêng của server (whitelist/role) ──");
{
  const guild = ownedGuild("g2", {
    whitelistUsers: ["u9", "u10"],
    whitelistRoles: ["r9"],
    adminRoles: ["ra"],
    modRoles: ["rm"],
  });
  const ctx = makeCtx({ guilds: [guild] }, TOKEN);
  ctx.tables.users[0].manageableGuildIds = ["111111111111111111"];
  await handler(ctx, { token: TOKEN, guildId: "111111111111111111", preset: "highrisk" });
  const patch = ctx.writes.patch.find((p) => String(p.id).startsWith("g2"))?.patch ?? {};
  for (const field of ["whitelistUsers", "whitelistRoles", "adminRoles", "modRoles"]) {
    check(`KHÔNG ghi đè ${field} (dữ liệu riêng của server)`, !(field in patch));
  }
  check("dữ liệu whitelist trong DB nguyên vẹn", guild.whitelistUsers.join() === "u9,u10");
}

console.log("\n── Module: bật đúng, chỉnh ngưỡng đúng, bỏ module lạ ──");
{
  const ctx = makeCtx({ guilds: [ownedGuild()] }, TOKEN);
  ctx.tables.users[0].manageableGuildIds = ["111111111111111111"];
  const r = await handler(ctx, { token: TOKEN, guildId: "111111111111111111", preset: "small" });
  const inserted = ctx.writes.insert.filter((w) => w.table === "antinukeModules");
  check("tạo module mới cho guild chưa có cấu hình", inserted.length > 0);
  check("số module tạo mới khớp danh sách enable của preset", inserted.length === r.modulesCreated);
  const massBan = inserted.find((w) => w.doc.module === "massBan");
  check(
    "massBan có tweak ngưỡng của preset small (6/15)",
    massBan?.doc.threshold === 6 && massBan?.doc.windowSeconds === 15,
  );
  const spam = inserted.find((w) => w.doc.module === "spam");
  check(
    "spam có tweak riêng của preset small (6/10)",
    spam?.doc.threshold === 6 && spam?.doc.windowSeconds === 10,
  );
  // Mọi module tạo ra phải là module hệ thống biết (không lọt tên rác).
  const known = new Set(ANTI_NUKE_MODULES.map((m) => m.module));
  check(
    "mọi module tạo ra đều là module hệ thống biết",
    inserted.every((w) => known.has(w.doc.module)),
  );
  check(
    "module tạo ra đều được bật",
    inserted.every((w) => w.doc.enabled === true),
  );
}

console.log("\n── Áp preset lần hai: cập nhật module đã có, không tạo trùng ──");
{
  const ctx = makeCtx(
    {
      guilds: [ownedGuild()],
      antinukeModules: [
        {
          _id: "m1",
          guildId: "111111111111111111",
          module: "massBan",
          enabled: false,
          threshold: 99,
          windowSeconds: 99,
        },
      ],
    },
    TOKEN,
  );
  ctx.tables.users[0].manageableGuildIds = ["111111111111111111"];
  const r = await handler(ctx, { token: TOKEN, guildId: "111111111111111111", preset: "small" });
  check("module đã có → update, không insert lại", r.modulesUpdated >= 1);
  const dup = ctx.writes.insert.filter(
    (w) => w.table === "antinukeModules" && w.doc.module === "massBan",
  );
  check("KHÔNG tạo bản ghi trùng cho module đã tồn tại", dup.length === 0);
  const upd = ctx.writes.patch.find((p) => p.id === "m1");
  check(
    "module cũ được chỉnh về ngưỡng preset",
    upd?.patch?.threshold === 6 && upd?.patch?.windowSeconds === 15,
  );
  check("module cũ được bật lên", upd?.patch?.enabled === true);
}

console.log(`\n${pass}/${pass + fail} ✅`);
process.exit(fail > 0 ? 1 : 0);
