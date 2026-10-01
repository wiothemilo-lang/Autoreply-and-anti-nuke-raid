// TEST: S3 nukeRollback + S4 vandalBudget — khôi phục sau nuke + ngân sách phá hoại.
// Chạy: node scripts/test-rollback-budget.cjs
//
// Bug ở 2 nhánh này sẽ không bị test nào khác bắt:
//   - S3: đối chiếu snapshot sai (so tên role không lowercase, đếm sai thiếu hụt),
//     restore bật dù config tắt, cooldown không chặn, MIN_MISSING quá nhạy.
//   - S4: cửa sổ trượt không prune (ngân sách không bao giờ giảm), cách ly owner,
//     gỡ role hết hạn không chạy, role cache tạo lại role trùng.
// Không mạng, không DB thật, không đụng Convex. Snapshot ghi vào temp dir.
const fs = require("fs");
const os = require("os");
const path = require("path");
const DJS_MOCK = require("./support/djs-mock-path.cjs");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "proto-rollback-"));
process.env.PROTOGON_SNAPSHOT_DIR = path.join(tmp, "snapshots");
process.env.PROTOGON_LOG_DIR = path.join(tmp, "logs");

const Module = require("module");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "discord.js") return DJS_MOCK;
  return origResolve.call(this, request, ...args);
};
fs.writeFileSync(
  DJS_MOCK,
  `class EmbedBuilder {
  constructor(data = {}) { this.d = data; }
  setColor(c) { this.d.color = c; return this; }
  setTitle(t) { this.d.title = t; return this; }
  setDescription(t) { this.d.description = t; return this; }
  addFields(f) { this.d.fields = [...(this.d.fields ?? []), ...f]; return this; }
  setTimestamp() { return this; }
  setFooter(f) { this.d.footer = f; return this; }
}
module.exports = {
  Colors: new Proxy({}, { get: () => 0x000000 }),
  EmbedBuilder,
  PermissionFlagsBits: { ManageGuild: 1n << 5n, Administrator: 1n << 3n, ManageRoles: 1n << 28n, ManageWebhooks: 1n << 29n, BanMembers: 1n << 2n },
  UserFlags: { VerifiedBot: 1n << 16n },
  AuditLogEvent: new Proxy({}, { get: (t, k) => (t[k] ??= Symbol(k)) }),
  ChannelType: { GuildText: 0, GuildVoice: 2, GuildCategory: 4, GuildAnnouncement: 5, GuildForum: 15 },
};
`,
);

const localSnapshot = require("../bot/src/localSnapshot");
const createVandalBudget = require("../bot/src/handlers/antinuke/vandalBudget");
const createNukeRollback = require("../bot/src/handlers/antinuke/nukeRollback");
const shared = require("../bot/src/handlers/antinuke/shared");

(async () => {
  let pass = 0,
    fail = 0;
  function check(name, ok) {
    if (ok) pass++;
    else {
      fail++;
      console.error(`FAIL: ${name}`);
    }
  }

  // ── S4: vandalBudget ─────────────────────────────────────────────
  {
    const v = createVandalBudget();
    check("S4: hằng số — cửa sổ 15 phút", v.WINDOW_MS === 15 * 60_000);
    check("S4: hằng số — hạn mức 10", v.BUDGET_LIMIT === 10);
    check("S4: hằng số — cách ly 2 giờ", v.ISOLATE_MS === 2 * 60 * 60_000);

    // note/score: cộng dồn qua module
    let n = 0;
    for (let i = 0; i < 3; i++) n = v.note("g1", "u1", 1000 + i);
    check("S4: note cộng dồn 3 hành vi", n === 3 && v.score("g1", "u1", 1003) === 3);
    check("S4: score user khác = 0", v.score("g1", "u2", 1003) === 0);
    check("S4: note thiếu userId = 0", v.note("g1", null, 1004) === 0);

    // Cửa sổ trượt: hành vi cũ ngoài 15 phút bị prune
    check("S4: cửa sổ trượt — 16 phút sau = 0", v.score("g1", "u1", 1000 + 16 * 60_000) === 0);
    v.note("g1", "u3", 2000);
    v.note("g1", "u3", 2000 + 14 * 60_000);
    check("S4: hành vi trong 14 phút vẫn tính", v.score("g1", "u3", 2000 + 14 * 60_000) === 2);

    // maybeIsolate: dưới hạn mức → không cách ly
    const guild = {
      id: "g1",
      ownerId: "owner-1",
      roles: { cache: new Map() },
      members: { fetch: async () => null },
    };
    const mkMember = (id, opts = {}) => ({
      id,
      permissions: { has: () => !!opts.admin },
      roles: {
        add: async (roleId) => {
          calls.adds.push({ id, roleId });
        },
        remove: async (roleId) => {
          calls.removes.push({ id, roleId });
        },
        cache: new Set(),
      },
    });
    const calls = { adds: [], removes: [], created: [] };
    guild.roles.create = async (opts) => {
      calls.created.push(opts.name);
      return { id: "role-iso-1", name: opts.name };
    };
    guild.roles.cache.find = (fn) => [...guild.roles.cache.values()].find(fn);

    let res = await v.maybeIsolate(guild, mkMember("u9"), 5);
    check("S4: dưới hạn mức → không cách ly", res.isolated === false);
    res = await v.maybeIsolate(guild, mkMember("owner-1"), 50);
    check("S4: owner không bị cách ly", res.isolated === false && res.reason === "là owner");
    res = await v.maybeIsolate(guild, mkMember("admin1", { admin: true }), 50);
    check("S4: administrator không bị cách ly", res.isolated === false);

    // Vượt hạn mức → cách ly: role rỗng quyền được tạo + gắn
    res = await v.maybeIsolate(guild, mkMember("bad1"), 11);
    check("S4: vượt hạn mức → cách ly", res.isolated === true && res.until > Date.now());
    check("S4: role cách ly được tạo đúng tên", calls.created.includes("🔒 Protogon Cách Ly"));
    check(
      "S4: role gắn vào thủ phạm",
      calls.adds.some((a) => a.id === "bad1"),
    );
    check("S4: role được cache (lần sau không tạo lại)", v._roleCache.get("g1") === "role-iso-1");

    // tickReleases: chưa hết hạn → không gỡ; hết hạn → gỡ + dọn state
    const memberBad = mkMember("bad1");
    guild.members.fetch = async (id) => (id === "bad1" ? memberBad : null);
    let released = await v.tickReleases(
      { guilds: { cache: new Map([["g1", guild]]) } },
      Date.now(),
    );
    check("S4: chưa hết hạn → không gỡ", released === 0 && calls.removes.length === 0);
    const entry = v._budget.get("g1:bad1");
    entry.isolated.until = Date.now() - 1;
    released = await v.tickReleases({ guilds: { cache: new Map([["g1", guild]]) } }, Date.now());
    check("S4: hết hạn → gỡ role", released === 1 && calls.removes.some((r) => r.id === "bad1"));
    check("S4: sau khi gỡ, state sạch", v._budget.get("g1:bad1")?.isolated === undefined);

    // Role bị admin XOÁ sau khi đã cache: phải tạo lại, không gắn id chết.
    // (Nhánh này hỏng thì bot âm thầm gọi roles.add với id không tồn tại → mọi
    // lần cách ly sau đều vô hiệu mà không có log nào cảnh báo.)
    {
      const v2 = createVandalBudget();
      const g2 = {
        id: "g2",
        ownerId: "owner-1",
        roles: { cache: new Map() },
        members: { fetch: async () => null },
      };
      let created2 = 0;
      g2.roles.cache.find = (fn) => [...g2.roles.cache.values()].find(fn);
      g2.roles.create = async (o) => {
        created2++;
        return { id: `iso-${created2}`, name: o.name };
      };
      const mkM = (id) => ({
        id,
        permissions: { has: () => false },
        roles: { add: async () => {} },
      });
      // Hai member KHÁC id: cùng id thì nhánh "đang cách ly" chặn trước và
      // không tới đoạn cần kiểm.
      const a = await v2.maybeIsolate(g2, mkM("x1"), 11);
      g2.roles.cache = new Map(); // admin xoá role
      const b = await v2.maybeIsolate(g2, mkM("x2"), 11);
      check("S4: role bị xoá → tạo lại role mới", created2 === 2 && b.roleId === "iso-2");
      check("S4: roleId mới khác roleId cũ", a.roleId === "iso-1" && b.roleId !== a.roleId);

      // Guild ĐÃ có sẵn role cách ly từ trước khi bot restart (RAM mất cache):
      // phải dùng lại, không tạo role trùng — server này sẽ đầy role rác.
      const v3 = createVandalBudget();
      const g3 = {
        id: "g3",
        ownerId: "owner-1",
        roles: {
          cache: new Map([["pre", { id: "pre", name: "🔒 Protogon Cách Ly" }]]),
        },
        members: { fetch: async () => null },
      };
      g3.roles.cache.find = (fn) => [...g3.roles.cache.values()].find(fn);
      let created3 = 0;
      g3.roles.create = async (o) => {
        created3++;
        return { id: "dup", name: o.name };
      };
      const c = await v3.maybeIsolate(
        g3,
        { id: "x2", permissions: { has: () => false }, roles: { add: async () => {} } },
        11,
      );
      check(
        "S4: guild đã có role cách ly → dùng lại, không tạo trùng",
        created3 === 0 && c.roleId === "pre",
      );
    }

    v.reset();
    check("S4: reset dọn state", v._budget.size === 0 && v._roleCache.size === 0);
  }

  // ── S3: nukeRollback ─────────────────────────────────────────────
  {
    const snapshot = {
      version: 4,
      guildId: "g-s3",
      guildName: "G-S3",
      roles: [
        {
          id: "r-old-1",
          name: "Member",
          color: 0xff0000,
          hoist: false,
          mentionable: true,
          permissions: "1024",
          position: 1,
        },
        {
          id: "r-old-2",
          name: "VIP",
          color: 0x00ff00,
          hoist: true,
          mentionable: false,
          permissions: "8",
          position: 2,
        },
        {
          id: "r-live",
          name: "Còn Lại",
          color: 0,
          hoist: false,
          mentionable: false,
          permissions: "0",
          position: 3,
        },
      ],
      channels: [
        {
          id: "c-old-1",
          name: "general",
          type: 0,
          topic: "trò chuyện",
          nsfw: false,
          position: 1,
          parentId: null,
          overwrites: [],
        },
        {
          id: "c-old-2",
          name: "voice",
          type: 2,
          topic: null,
          nsfw: false,
          position: 2,
          parentId: null,
          bitrate: 64000,
          userLimit: 10,
          overwrites: [],
        },
        {
          id: "c-live",
          name: "chat",
          type: 0,
          topic: null,
          nsfw: false,
          position: 3,
          parentId: null,
          overwrites: [],
        },
      ],
    };
    const w = localSnapshot.writeLocalSnapshot("g-s3", {
      snapshotAt: 1690000000000,
      guild: snapshot,
    });
    check("S3: snapshot ghi được vào temp dir", !!w);

    const configs = new Map();
    const store = {
      getConfig: async (id) => configs.get(id) ?? null,
      client: { mutation: async () => ({}), action: async () => ({}) },
    };

    const createdRoles = [];
    const createdChannels = [];
    const guild = {
      id: "g-s3",
      available: true,
      name: "G-S3",
      ownerId: "o",
      roles: { cache: new Map([["r-live", { name: "còn lại" }]]) }, // so tên lowercase
      channels: { cache: new Map([["c-live", { type: 0, name: "chat" }]]) },
      members: { fetch: async () => null },
    };
    guild.roles.create = async (opts) => {
      createdRoles.push(opts.name);
      return {
        id: "nr" + createdRoles.length,
        setPosition: async () => {},
        setIcon: async () => {},
      };
    };
    guild.channels.create = async (opts) => {
      createdChannels.push(opts.name);
      return { id: "nc" + createdChannels.length, setPosition: async () => {} };
    };

    const rb = createNukeRollback({
      client: { guilds: { cache: new Map([["g-s3", guild]]) } },
      store,
    });

    // Config tắt → không chạy
    configs.set("g-s3", { antinukeEnabled: true, rollbackEnabled: false });
    let res = await rb.runRollback(guild, ["massChannelDelete"], "atk", { force: true });
    check("S3: config rollbackEnabled=false → không chạy", res.ran === false);

    // Không snapshot → bỏ qua im lặng (guild id ASCII thuần — khác snapshot đã ghi;
    // guild này chưa có config trong store → getConfig trả null → cũng không chạy)
    configs.set("g-no-snap", { antinukeEnabled: true, rollbackEnabled: true });
    res = await rb.runRollback({ ...guild, id: "g-no-snap" }, ["massChannelDelete"], "atk", {
      force: true,
    });
    check(
      "S3: không có snapshot → không chạy",
      res.ran === false && res.reason === "không có snapshot",
    );

    // Chạy thật: thiếu 2 role + 2 kênh → tạo lại đúng những gì thiếu
    configs.set("g-s3", { antinukeEnabled: true, rollbackEnabled: true });
    res = await rb.runRollback(guild, ["massChannelDelete", "massRoleDelete"], "atk", {
      force: true,
    });
    check("S3: rollback chạy", res.ran === true);
    check(
      "S3: thiếu hụt đúng 2 role / 2 kênh",
      res.missingRoles === 2 && res.missingChannels === 2,
    );
    check(
      "S3: tạo lại đúng role thiếu (không tạo role còn lại)",
      createdRoles.sort().join() === "Member,VIP",
    );
    check(
      "S3: tạo lại đúng kênh thiếu (không tạo kênh còn lại)",
      createdChannels.sort().join() === "general,voice",
    );
    check("S3: kết quả đếm đúng", res.restoredRoles === 2 && res.restoredChannels === 2);
    check("S3: ghi nhận mốc snapshot", res.snapshotTs === 1690000000000);

    // Cooldown: chạy lần 2 ngay → bị chặn
    res = await rb.runRollback(guild, ["massChannelDelete"], "atk", {});
    check(
      "S3: cooldown 10 phút chặn lần chạy ngay sau đó",
      res.ran === false && res.reason === "trong cooldown",
    );

    // Guild không sẵn sàng → bỏ qua
    res = await rb.runRollback({ ...guild, available: false }, ["massChannelDelete"], "atk", {
      force: true,
    });
    check("S3: guild unavailable → không chạy", res.ran === false);

    // scheduleRollback: trả lịch + grace
    rb.reset();
    const sch = rb.scheduleRollback(guild, "massRoleDelete", "atk");
    check(
      "S3: scheduleRollback trả lịch đúng grace",
      sch.scheduled === true && sch.graceMs === rb.GRACE_MS,
    );
    const sch2 = rb.scheduleRollback(guild, "massChannelDelete", "atk");
    check("S3: các vụ tiếp theo trong grace window gộp chung lịch", sch2.scheduled === false);

    // CÙNG module lặp lại trong grace window KHÔNG được lên lịch lần hai (trước
    // đây set.size vẫn = 1 → first=true → hẹn giờ trùng, chạy rollback 2 lần).
    rb.reset();
    const dup1 = rb.scheduleRollback(guild, "massRoleDelete", "atk");
    const dup2 = rb.scheduleRollback(guild, "massRoleDelete", "atk");
    check(
      "S3: cùng module lặp lại không hẹn giờ trùng",
      dup1.scheduled === true && dup2.scheduled === false,
    );

    // Chờ grace window (GRACE_MS 60s là quá lâu cho test → dùng guild khác coi như
    // hết cooldown nhưng pending của g-s3 vẫn chờ; chỉ verify pending gộp — rollback
    // thật đã test ở trên qua runRollback trực tiếp).
  }

  // ── Bảng module dùng chung ──────────────────────────────────────
  {
    check(
      "S4: BUDGET_MODULES chứa các module phá hoại chính",
      ["massBan", "massChannelDelete", "adminSelfGrant", "guildTamper"].every((m) =>
        shared.BUDGET_MODULES.has(m),
      ),
    );
    check(
      "S4: BUDGET_MODULES KHÔNG chứa module thường (spam/badword)",
      !shared.BUDGET_MODULES.has("spam") && !shared.BUDGET_MODULES.has("badword"),
    );
    check(
      "S3: ROLLBACK_MODULES chỉ chứa module gây mất mát",
      ["massChannelDelete", "massRoleDelete", "massBan", "massKick", "guildTamper"].every((m) =>
        shared.ROLLBACK_MODULES.has(m),
      ) && shared.ROLLBACK_MODULES.size === 5,
    );
    check(
      "S3: ROLLBACK_MODULES không chứa massCreate (thêm rác không rollback)",
      !shared.ROLLBACK_MODULES.has("massChannelCreate") &&
        !shared.ROLLBACK_MODULES.has("massRoleCreate"),
    );
  }

  console.log(`\n${pass}/${pass + fail} ✅`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(fail > 0 ? 1 : 0);
})();
