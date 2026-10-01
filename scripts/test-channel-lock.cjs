// TEST: bot/src/channelLock.js — lệnh `/lock` (khoá chat thủ công của chủ server).
// Chạy: node scripts/test-channel-lock.cjs
//
// Vì sao suite này tồn tại: khác `test-lockdown.cjs` (khoá toàn server khi
// raid), `/lock` là thao tác GHI ĐÈ quyền rồi cần KHÔI PHỤC đúng về sau.
// Ba thứ sai đều hậu quả nặng và đều im lặng:
//   1. Mở khoá bằng `null` (xoá sạch override) → phá cấu hình chủ server tự
//      đặt; đúng nhất là phải nhớ quyền CŨ rồi trả về.
//   2. Gộp `null` (kế thừa) với `false` (cấm) → mở nhầm kênh vốn đã bị cấm.
//   3. Khoá 2 lần → lần 2 lưu `prev = false` → mở ra thì kênh KẸT VĨNH VIỄN
//      và mất dấu vết để mở.
// Nên ở đây test theo BẤT BIẾN (lock → unlock trả về đúng trạng thái ban
// đầu), không test theo từng lệnh gọi.
const path = require("path");
const DJS_MOCK = require("./support/djs-mock-path.cjs");
const Module = require("module");
const fs = require("fs");

const MOCK = DJS_MOCK;
const UTIL_STUB = path.join(__dirname, "_channel-lock-util.cjs");

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "discord.js") return MOCK;
  // channelLock.js require("./util") — phải khớp đúng chuỗi này, nếu không
  // test sẽ nạp util thật và sendLog im lặng (nó tự return khi thiếu logChannel).
  if (request === "./util" || request === "../util" || request.endsWith(path.join("src", "util")))
    return UTIL_STUB;
  return origResolve.call(this, request, ...args);
};

fs.writeFileSync(
  MOCK,
  `module.exports = {
  PermissionFlagsBits: { ManageChannels: 1n << 4n, ManageGuild: 1n << 5n, Administrator: 1n << 3n },
  Colors: { Red: 0x992d22, Green: 0x57f287, Yellow: 0xfee75c },
  EmbedBuilder: class { constructor(d){this.d=d||{};} setColor(c){this.d.color=c;return this;} setTitle(t){this.d.title=t;return this;} setDescription(x){this.d.description=x;return this;} setTimestamp(){return this;} addFields(f){this.d.fields=[...(this.d.fields||[]),...(Array.isArray(f)?f:[f])];return this;} setFooter(f){this.d.footer=f;return this;} },
};
`,
);
fs.writeFileSync(
  UTIL_STUB,
  `const calls = [];
module.exports = {
  calls,
  logEmbed: (o) => o,
  sendLog: async (guild, cfg, embed) => { calls.push({ guildId: guild && guild.id, embed }); },
};
`,
);

const lock = require("../bot/src/channelLock.js");
const utilStub = require("./_channel-lock-util.cjs");

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  ok ? pass++ : fail++;
};

/**
 * Kênh giả mô ĐÚNG ngữ nghĩa discord.js:
 *   value === true  → thêm vào `allow`, bỏ khỏi `deny`
 *   value === false → thêm vào `deny`, bỏ khỏi `allow`
 *   value === null  → XOÁ khỏi cả hai (kế thừa từ role trên)
 * `overwrites` mô phỏng trạng thái sẵn có của server.
 */
function makeChannel({
  id = "c1",
  name = "general",
  text = true,
  voice = false,
  thread = false,
  overwrites = {},
  editThrows = false,
} = {}) {
  const ow = new Map(
    Object.entries(overwrites).map(([roleId, bits]) => [
      roleId,
      { allow: new Set(bits.allow || []), deny: new Set(bits.deny || []) },
    ]),
  );
  const channel = {
    id,
    name,
    isTextBased: () => text,
    isVoiceBased: () => voice,
    isThread: () => thread,
    edits: 0,
    permissionOverwrites: {
      cache: ow,
      edit: async (roleId, opts) => {
        if (editThrows) throw new Error("Missing Permissions");
        channel.edits++;
        const o = ow.get(roleId) || { allow: new Set(), deny: new Set() };
        for (const [k, v] of Object.entries(opts)) {
          if (v === null || v === undefined) {
            o.allow.delete(k);
            o.deny.delete(k);
          } else if (v === true) {
            o.allow.add(k);
            o.deny.delete(k);
          } else {
            o.deny.add(k);
            o.allow.delete(k);
          }
        }
        ow.set(roleId, o);
        return channel.permissionOverwrites;
      },
    },
    /** Đọc quyền hiện tại như Discord hiểu (true/false/kế thừa). */
    current(roleId, key) {
      const o = ow.get(roleId);
      if (!o) return null;
      if (o.allow.has(key)) return true;
      if (o.deny.has(key)) return false;
      return null;
    },
  };
  return channel;
}

const EVERYONE = "EVERYONE";
function makeGuild({ channels = [], roles = [], canManage = true, meHighest = 10 } = {}) {
  const roleMap = new Map(roles.map((r) => [r.id, r]));
  roleMap.set(EVERYONE, { id: EVERYONE, name: "@everyone", position: 0, managed: false });
  return {
    id: "g1",
    name: "Server",
    roles: { everyone: roleMap.get(EVERYONE), cache: roleMap },
    members: {
      me: {
        permissions: { has: (p) => (canManage ? String(p) === String(1n << 4n) : false) },
        roles: { highest: { position: meHighest } },
      },
    },
    channels: { cache: new Map(channels.map((c) => [c.id, c])) },
  };
}

(async () => {
  // ═════ 1. Thời lượng ═════
  console.log("\n── parseLockMinutes ──");
  {
    // Ô trống = VÔ HẠN — khác hẳn /mod timeout (bỏ trống ở đó là lỗi).
    const r = lock.parseLockMinutes("");
    check("ô trống → vô hạn", r.ok === true && r.minutes === null, JSON.stringify(r));
    const u = lock.parseLockMinutes(undefined);
    check("không truyền → vô hạn", u.ok === true && u.minutes === null, JSON.stringify(u));
    const w = lock.parseLockMinutes("   ");
    check("chỉ khoảng trắng → vô hạn", w.ok === true && w.minutes === null, JSON.stringify(w));
  }
  {
    const c = (input, want) => {
      const r = lock.parseLockMinutes(input);
      return r.ok === true && r.minutes === want;
    };
    check("'30' → 30 phút", c("30", 30));
    check("'30m' → 30 phút", c("30m", 30));
    check("'2h' → 120 phút", c("2h", 120));
    check("'1d' → 1440 phút", c("1d", 1440));
    check("'90S' → 2 phút (làm tròn lên)", c("90S", 2));
    check("' 45 m ' → 45 phút (khoảng trắng)", c(" 45 m ", 45));
    check("'1s' → tối thiểu 1 phút", c("1s", 1));
  }
  {
    const bad = (input) => lock.parseLockMinutes(input).ok === false;
    check("'abc' → lỗi", bad("abc"));
    check("'-5' → lỗi", bad("-5"));
    check("'0' → lỗi (0 phút không có nghĩa)", bad("0"));
    check("'30x' → lỗi (đơn vị lạ)", bad("30x"));
    check("'1.5h' → lỗi (thập phân)", bad("1.5h"));
    check(">30 ngày → lỗi", bad("31d"));
    const msg = lock.parseLockMinutes("abc").error;
    check("lỗi có hướng dẫn để trống = vô hạn", /trống/i.test(msg), msg);
  }
  {
    const f = (m, want) => lock.formatLockDuration(m) === want;
    check("format null → 'vô hạn'", f(null, "vô hạn"));
    check("format 30 → '30 phút'", f(30, "30 phút"));
    check("format 120 → '2 giờ'", f(120, "2 giờ"));
    check("format 1440 → '1 ngày'", f(1440, "1 ngày"));
    check("format 2880 → '2 ngày'", f(2880, "2 ngày"));
  }

  // ═════ 2. Chọn loại khoá ═════
  console.log("\n── channelLockKind ──");
  {
    const k = (o) => lock.channelLockKind(makeChannel(o));
    check("kênh text → 'text'", k({ text: true }) === "text");
    check("kênh voice → 'voice'", k({ text: false, voice: true }) === "voice");
    // Thread kế thừa quyền từ kênh cha — khoá riêng thì dễ để lại thread mồ côi.
    check("thread → null", k({ text: true, thread: true }) === null);
    check("danh mục → null", k({ text: false, voice: false }) === null);
    check("undefined → null", lock.channelLockKind(undefined) === null);
  }

  // ═════ 3. Đọc quyền — phân biệt 3 trạng thái ═════
  console.log("\n── readPermission (null ≠ false) ──");
  {
    const ch = makeChannel({ overwrites: {} });
    check(
      "chưa có override cho role → null (kế thừa)",
      lock.readPermission(ch, EVERYONE, "text") === null,
    );
    const allow = makeChannel({ overwrites: { [EVERYONE]: { allow: ["SendMessages"] } } });
    check("có trong allow → true", lock.readPermission(allow, EVERYONE, "text") === true);
    const deny = makeChannel({ overwrites: { [EVERYONE]: { deny: ["SendMessages"] } } });
    check("có trong deny → false", lock.readPermission(deny, EVERYONE, "text") === false);
    // Có override cho role nhưng KHÔNG đụng quyền này → vẫn kế thừa.
    const other = makeChannel({ overwrites: { [EVERYONE]: { allow: ["AddReactions"] } } });
    check(
      "override khác quyền này → null (vẫn kế thừa)",
      lock.readPermission(other, EVERYONE, "text") === null,
    );
    check("loại lạ → null", lock.readPermission(allow, EVERYONE, "wat") === null);
    check("kênh undefined → null", lock.readPermission(undefined, EVERYONE, "text") === null);
  }

  // ═════ 4. Chọn role đích ═════
  console.log("\n── resolveTargetRole ──");
  {
    const g = makeGuild({ roles: [{ id: "R1", name: "Thành viên", position: 1, managed: false }] });
    const none = lock.resolveTargetRole(g, null);
    check("không chọn role → @everyone", none.ok && none.roleId === EVERYONE && none.everyone);
    const r1 = lock.resolveTargetRole(g, { id: "R1" });
    check("chọn role hợp lệ", r1.ok && r1.roleId === "R1" && r1.everyone === false);
    const asString = lock.resolveTargetRole(g, "R1");
    check("chấp nhận cả string id", asString.ok && asString.roleId === "R1");
    check("role không tồn tại → lỗi", lock.resolveTargetRole(g, { id: "NOPE" }).ok === false);
    const managed = makeGuild({
      roles: [{ id: "R2", name: "Bot role", position: 1, managed: true }],
    });
    check("role do bot quản lý → lỗi", lock.resolveTargetRole(managed, { id: "R2" }).ok === false);
    const above = makeGuild({
      roles: [{ id: "R3", name: "Admin", position: 20, managed: false }],
      meHighest: 5,
    });
    const a = lock.resolveTargetRole(above, { id: "R3" });
    check(
      "role trên bot → lỗi kèm giải thích",
      a.ok === false && /trên role của bot/.test(a.error),
      a.error,
    );
    check("guild lỗi → lỗi", lock.resolveTargetRole({}, null).ok === false);
  }

  // ═════ 5. Chọn kênh hàng loạt ═════
  console.log("\n── collectChatChannels ──");
  {
    const a = makeChannel({ id: "a", text: true });
    const v = makeChannel({ id: "v", text: false, voice: true });
    const th = makeChannel({ id: "t", text: true, thread: true });
    const cat = makeChannel({ id: "cat", text: false, voice: false });
    const g = makeGuild({ channels: [a, v, th, cat] });
    const got = lock.collectChatChannels(g);
    check(
      "chỉ lấy kênh text + voice (bỏ thread và danh mục)",
      got.length === 2 && got[0].kind === "text" && got[1].kind === "voice",
      JSON.stringify(got.map((x) => `${x.channel.id}:${x.kind}`)),
    );
    check("guild không có cache → mảng rỗng", lock.collectChatChannels({}).length === 0);
  }

  // ═════ 6. BẤT BIẾN: khoá → mở trả về đúng trạng thái ban đầu ═════
  console.log("\n── vòng khoá → mở (3 trạng thái) ──");
  for (const start of [null, true, false]) {
    const label = start === null ? "kế thừa (null)" : start === true ? "cho phép" : "đã cấm";
    const bits = {};
    if (start !== null) {
      bits[EVERYONE] = start === true ? { allow: ["SendMessages"] } : { deny: ["SendMessages"] };
    }
    const ch = makeChannel({ overwrites: bits });
    const l = await lock.lockChannel({ channel: ch, roleId: EVERYONE, kind: "text" });
    check(
      `[${label}] khoá được + ghi đè thành false`,
      l.ok === true && ch.current(EVERYONE, "SendMessages") === false,
      JSON.stringify(l),
    );
    check(
      `[${label}] lưu đúng quyền cũ`,
      l.prev === start,
      JSON.stringify({ prev: l.prev, start }),
    );
    const u = await lock.unlockChannel({
      channel: ch,
      roleId: EVERYONE,
      kind: "text",
      prev: l.prev,
    });
    check(
      `[${label}] mở khoá trả về đúng trạng thái ban đầu`,
      u.ok === true && ch.current(EVERYONE, "SendMessages") === start,
      JSON.stringify(ch.current(EVERYONE, "SendMessages")),
    );
  }
  {
    // Khôi phục KHÔNG được xoá các quyền khác của cùng role đó.
    const ch = makeChannel({
      overwrites: { [EVERYONE]: { allow: ["SendMessages", "AddReactions"] } },
    });
    const l = await lock.lockChannel({ channel: ch, roleId: EVERYONE, kind: "text" });
    await lock.unlockChannel({ channel: ch, roleId: EVERYONE, kind: "text", prev: l.prev });
    check(
      "mở khoá giữ nguyên quyền KHÁC của role",
      ch.current(EVERYONE, "SendMessages") === true &&
        ch.current(EVERYONE, "AddReactions") === true,
      JSON.stringify([ch.current(EVERYONE, "SendMessages"), ch.current(EVERYONE, "AddReactions")]),
    );
  }
  {
    // Voice dùng quyền KHÁC — khoá bằng SendMessages là khoá hụt.
    const ch = makeChannel({ text: false, voice: true });
    const l = await lock.lockChannel({ channel: ch, roleId: EVERYONE, kind: "voice" });
    check(
      "kênh voice khoá bằng Connect (không phải SendMessages)",
      l.ok === true && ch.current(EVERYONE, "Connect") === false,
      JSON.stringify(ch.current(EVERYONE, "Connect")),
    );
  }
  {
    // Bất biến số 3: khoá 2 lần. Lần 2 dùng prevKnown = prev của lần 1.
    const ch = makeChannel({ overwrites: { [EVERYONE]: { allow: ["SendMessages"] } } });
    const l1 = await lock.lockChannel({ channel: ch, roleId: EVERYONE, kind: "text" });
    check("lần 1 lưu prev = true", l1.prev === true);
    const l2 = await lock.lockChannel({
      channel: ch,
      roleId: EVERYONE,
      kind: "text",
      prevKnown: l1.prev,
    });
    check(
      "khoá lần 2 GIỮ prev gốc (không đọc lại trạng thái đang khoá)",
      l2.prev === true,
      JSON.stringify(l2.prev),
    );
    const u = await lock.unlockChannel({
      channel: ch,
      roleId: EVERYONE,
      kind: "text",
      prev: l2.prev,
    });
    check(
      "mở sau 2 lần khoá vẫn về 'cho phép' (không kẹt vĩnh viễn)",
      u.ok && ch.current(EVERYONE, "SendMessages") === true,
      JSON.stringify(ch.current(EVERYONE, "SendMessages")),
    );
  }
  {
    const ch = makeChannel({ editThrows: true });
    const r = await lock.lockChannel({ channel: ch, roleId: EVERYONE, kind: "text" });
    check(
      "kênh không sửa được → báo lỗi, KHÔNG im lặng",
      r.ok === false && /Missing Permissions/.test(r.error),
      JSON.stringify(r),
    );
    const ch2 = makeChannel({ editThrows: true });
    const u = await lock.unlockChannel({
      channel: ch2,
      roleId: EVERYONE,
      kind: "text",
      prev: null,
    });
    check("mở khoá lỗi quyền → báo lỗi", u.ok === false && /Missing Permissions/.test(u.error));
  }
  {
    // prev = undefined (bản ghi cũ/không nhớ) → phải về kế thừa, không ném.
    const ch = makeChannel({ overwrites: { [EVERYONE]: { deny: ["SendMessages"] } } });
    await lock.unlockChannel({ channel: ch, roleId: EVERYONE, kind: "text" });
    check(
      "prev undefined → mở về kế thừa thay vì ném",
      ch.current(EVERYONE, "SendMessages") === null,
      JSON.stringify(ch.current(EVERYONE, "SendMessages")),
    );
  }

  // ═════ 7. Quyền bot ═════
  console.log("\n── botCanManageChannels ──");
  {
    check(
      "bot có ManageChannels → true",
      lock.botCanManageChannels(makeGuild({ canManage: true })) === true,
    );
    check(
      "bot thiếu quyền → false",
      lock.botCanManageChannels(makeGuild({ canManage: false })) === false,
    );
    check("guild undefined → false", lock.botCanManageChannels(undefined) === false);
  }

  // ═════ 8. releaseLocks ═════
  console.log("\n── releaseLocks ──");
  {
    const ch = makeChannel({ id: "c1", name: "general" });
    const g = makeGuild({ channels: [ch] });
    const released = [];
    const store = {
      client: {
        mutation: async (name, args) => {
          released.push({ name, args });
          return { ok: true };
        },
      },
    };
    const r = await lock.releaseLocks({
      client: { channels: { fetch: async () => null } },
      guild: g,
      records: [{ guildId: "g1", channelId: "c1", roleId: EVERYONE, kind: "text", prev: true }],
      store,
      botKey: "K",
    });
    check("mở lại 1 kênh", r.restored.length === 1, JSON.stringify(r));
    check(
      "trả về đúng quyền cũ",
      ch.current(EVERYONE, "SendMessages") === true,
      JSON.stringify(ch.current(EVERYONE, "SendMessages")),
    );
    check(
      "xoá bản ghi sau khi mở",
      released.length === 1 && released[0].name === "channelLocks:botReleaseChannelLock",
      JSON.stringify(released.map((x) => x.name)),
    );
  }
  {
    // Kênh đã bị xoá khỏi server: dọn bản ghi để tick khỏi quét lại mãi.
    const g = makeGuild({ channels: [] });
    const released = [];
    const store = { client: { mutation: async (n, a) => released.push(a) } };
    const r = await lock.releaseLocks({
      client: { channels: { fetch: async () => null } },
      guild: g,
      records: [{ guildId: "g1", channelId: "gone", roleId: EVERYONE, kind: "text", prev: null }],
      store,
      botKey: "K",
    });
    check(
      "kênh không còn → đếm missing",
      r.missing.length === 1 && r.restored.length === 0,
      JSON.stringify(r),
    );
    check("kênh không còn → vẫn dọn bản ghi", released.length === 1, JSON.stringify(released));
  }
  {
    // Mở lỗi (mất quyền) thì GIỮ bản ghi — còn hy vọng thử lại lượt sau.
    const ch = makeChannel({ id: "c1", editThrows: true });
    const g = makeGuild({ channels: [ch] });
    const released = [];
    const store = { client: { mutation: async (n, a) => released.push(a) } };
    const r = await lock.releaseLocks({
      client: { channels: { fetch: async () => null } },
      guild: g,
      records: [{ guildId: "g1", channelId: "c1", roleId: EVERYONE, kind: "text", prev: null }],
      store,
      botKey: "K",
    });
    check(
      "mở lỗi → báo lỗi kèm tên kênh",
      r.failed.length === 1 && r.failed[0].includes("c1"),
      JSON.stringify(r.failed),
    );
    check("mở lỗi → GIỮ bản ghi (thử lại được)", released.length === 0, JSON.stringify(released));
  }
  {
    // Bot restart → cache trống → phải fetch tươi chứ không bỏ sót.
    const ch = makeChannel({ id: "c1", name: "general" });
    const g = makeGuild({ channels: [] });
    const store = { client: { mutation: async () => ({}) } };
    const r = await lock.releaseLocks({
      client: { channels: { fetch: async (id) => (id === "c1" ? ch : null) } },
      guild: g,
      records: [{ guildId: "g1", channelId: "c1", roleId: EVERYONE, kind: "text", prev: null }],
      store,
      botKey: "K",
    });
    check("cache trống → fetch tươi rồi mở được", r.restored.length === 1, JSON.stringify(r));
  }
  {
    const r = await lock.releaseLocks({ guild: {}, records: [], store: { client: {} } });
    check("danh sách rỗng → không làm gì", r.restored.length === 0 && r.failed.length === 0);
    const u = await lock.releaseLocks({ guild: {}, records: undefined, store: { client: {} } });
    check("records undefined → không ném", u.restored.length === 0);
  }

  // ═════ 9. Tự mở khoá khi hết hạn ═════
  console.log("\n── processDueLocks ──");
  {
    const empty = await lock.processDueLocks({}, { client: {} }, []);
    check("không có khoá hết hạn → không làm gì", empty.restored === 0 && empty.guilds === 0);
    const none = await lock.processDueLocks({}, { client: {} }, undefined);
    check("undefined → không ném", none.restored === 0);
  }
  {
    const ch = makeChannel({ id: "c1", name: "general" });
    const g = makeGuild({ channels: [ch] });
    const client = { guilds: { cache: new Map([["g1", g]]) } };
    utilStub.calls.length = 0;
    const r = await lock.processDueLocks(
      client,
      {
        getConfig: async () => ({ logChannelId: "L" }),
        client: { mutation: async () => ({}) },
      },
      [{ guildId: "g1", channelId: "c1", roleId: EVERYONE, kind: "text", prev: null, until: 1 }],
    );
    check("hết hạn → mở khoá", r.restored === 1, JSON.stringify(r));
    check(
      "hết hạn → ghi log mở khoá tự động",
      utilStub.calls.length === 1 && /tự mở/i.test(utilStub.calls[0].embed.title),
      JSON.stringify(utilStub.calls.map((c) => c.embed.title)),
    );
  }
  {
    // Nhiều role trong cùng lượt → log phải nói "nhiều nhóm role", không gộp nhầm.
    const a = makeChannel({ id: "c1", name: "a" });
    const b = makeChannel({ id: "c2", name: "b" });
    const g = makeGuild({
      channels: [a, b],
      roles: [{ id: "R1", name: "Mod", position: 1, managed: false }],
    });
    const client = { guilds: { cache: new Map([["g1", g]]) } };
    utilStub.calls.length = 0;
    await lock.processDueLocks(
      client,
      {
        getConfig: async () => null,
        client: { mutation: async () => ({}) },
      },
      [
        { guildId: "g1", channelId: "c1", roleId: EVERYONE, kind: "text", prev: null, until: 1 },
        { guildId: "g1", channelId: "c2", roleId: "R1", kind: "text", prev: null, until: 1 },
      ],
    );
    check(
      "nhiều role cùng lượt → log ghi 'nhiều nhóm role'",
      /2 nhóm role/.test(utilStub.calls[0]?.embed?.description || ""),
      utilStub.calls[0]?.embed?.description,
    );
  }
  {
    // Bot đã rời server → bản ghi phải bị dọn, không giữ lại quét mãi.
    const removed = [];
    const r = await lock.processDueLocks(
      { guilds: { cache: new Map() } },
      { client: { mutation: async (n, a) => removed.push(a) } },
      [{ guildId: "gone", channelId: "c1", roleId: EVERYONE, kind: "text", prev: null, until: 1 }],
    );
    check("bot rời server → dọn bản ghi", removed.length === 1, JSON.stringify(removed));
    check("bot rời server → không tính vào restored", r.restored === 0);
  }
  {
    // getConfig hỏng KHÔNG được làm hỏng việc mở khoá.
    const ch = makeChannel({ id: "c1" });
    const g = makeGuild({ channels: [ch] });
    const r = await lock.processDueLocks(
      { guilds: { cache: new Map([["g1", g]]) } },
      {
        getConfig: async () => {
          throw new Error("Convex down");
        },
        client: { mutation: async () => ({}) },
      },
      [{ guildId: "g1", channelId: "c1", roleId: EVERYONE, kind: "text", prev: null, until: 1 }],
    );
    check("getConfig hỏng → vẫn mở khoá", r.restored === 1, JSON.stringify(r));
  }

  // ═════ 10. Nhãn + embed log ═════
  console.log("\n── nhãn & log ──");
  {
    check(
      "channelLabel có #",
      lock.channelLabel({ name: "general" }) === "`#general`",
      lock.channelLabel({ name: "general" }),
    );
    check(
      "channelLabel kênh không tên",
      lock.channelLabel({}) === "`#kênh`",
      lock.channelLabel({}),
    );
    const g = makeGuild({ roles: [{ id: "R1", name: "Mod", position: 1, managed: false }] });
    check("roleLabel @everyone", lock.roleLabel(g, EVERYONE) === "@everyone");
    check("roleLabel theo tên", lock.roleLabel(g, "R1") === "Mod");
    check("roleLabel lạ → có id", /R9/.test(lock.roleLabel(g, "R9")), lock.roleLabel(g, "R9"));
  }
  {
    const e = lock.lockLogEmbed({
      action: "lock",
      channelNames: ["`#general`"],
      roleLabel: "@everyone",
      duration: 120,
      reason: "đang xử lý sự cố",
      actor: "mod",
    });
    check(
      "log khoá: có số kênh + thời lượng + lý do",
      /1/.test(e.fields[0].value) && /2 giờ/.test(e.description) && /sự cố/.test(e.description),
      JSON.stringify(e),
    );
    const e2 = lock.lockLogEmbed({
      action: "unlock",
      channelNames: ["`#a`"],
      roleLabel: "@everyone",
      duration: null,
      auto: true,
    });
    check("log tự mở: tiêu đề nói rõ tự động", /tự mở/i.test(e2.title), e2.title);
    check("log mở: không nhắc thời lượng", !/Thời lượng/.test(e2.description), e2.description);
  }

  // ═════ 11. Khoá vô hạn KHÔNG tự mở ═════
  {
    // Bất biến dữ liệu: bản ghi vô hạn thiếu `until` → index by_due không
    // chứa nó → vòng tick không bao giờ thấy. Ở đây chốt phía bot: bản ghi
    // không có `until` thì coi như VÔ HẠN, không tự mở.
    const infinite = { guildId: "g1", channelId: "c1", roleId: EVERYONE, kind: "text", prev: null };
    check("bản ghi vô hạn không có `until`", infinite.until === undefined);
    const r = await lock.processDueLocks(
      { guilds: { cache: new Map() } },
      { client: { mutation: async () => ({}) } },
      [infinite],
    );
    check("vô hạn đi qua tick vẫn an toàn (không mở nhầm)", r.restored === 0);
  }

  fs.unlinkSync(MOCK);
  fs.unlinkSync(UTIL_STUB);
  console.log(`\nKết quả channel-lock: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("Suite crash:", e);
  try {
    fs.unlinkSync(MOCK);
  } catch {}
  try {
    fs.unlinkSync(UTIL_STUB);
  } catch {}
  process.exit(1);
});
