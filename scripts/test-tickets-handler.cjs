// TEST: handlers/tickets.js — phần làm việc với Discord (tạo kênh, gắn
// quyền, dựng embed/modal/nút). Phần quyết định thuần đã ở test-tickets.cjs.
//
// Vì sao cần suite riêng: lần đầu chạy coverage, `tickets.js` chỉ 27% st / 0%
// fn — toàn bộ đường tạo kênh và cấp quyền KHÔNG có test. Đây đúng là chỗ dễ
// vỡ: quyền gán sai là lộ khiếu nại ra công khai.
//
// Chạy: node scripts/test-tickets-handler.cjs
const DJS_MOCK = require("./support/djs-mock-path.cjs");
const Module = require("module");
const fs = require("fs");

// ── Mock discord.js: bám ĐÚNG API thật (xem ghi chú ở test-mod-tools về
// `guild.members.fetchBan` — mock sai bản thân nó là một loại bug).
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "discord.js") return DJS_MOCK;
  return origResolve.call(this, request, ...args);
};
fs.writeFileSync(
  DJS_MOCK,
  `class EmbedBuilder {
  constructor(data = {}) { this.d = { ...data }; }
  setColor(c) { this.d.color = c; return this; }
  setTitle(t) { this.d.title = t; return this; }
  setDescription(t) { this.d.description = t; return this; }
  addFields(f) { this.d.fields = [...(this.d.fields ?? []), ...(Array.isArray(f) ? f : [f])]; return this; }
  setTimestamp() { return this; } setFooter(f) { this.d.footer = f; return this; }
  setThumbnail() { return this; } setImage() { return this; }
}
class Collection extends Map {
  filter(fn) { const o = new Collection(); for (const [k, v] of this) if (fn(v, k)) o.set(k, v); return o; }
  last() { let l; for (const v of this.values()) l = v; return l; }
}
class ActionRowBuilder { constructor() { this.components = []; } addComponents(...c) { this.components.push(...c); return this; } }
class ButtonBuilder {
  setCustomId(v) { this.customId = v; return this; }
  setLabel(v) { this.label = v; return this; }
  setStyle(v) { this.style = v; return this; }
}
class ModalBuilder {
  constructor() { this.components = []; }
  setCustomId(v) { this.customId = v; return this; }
  setTitle(v) { this.title = v; return this; }
  addComponents(...c) { this.components.push(...c); return this; }
}
class TextInputBuilder {
  setCustomId(v) { this.customId = v; return this; }
  setLabel(v) { this.label = v; return this; }
  setStyle(v) { this.style = v; return this; }
  setRequired(v) { this.required = v; return this; }
  setMaxLength(v) { this.maxLength = v; return this; }
  setPlaceholder(v) { this.placeholder = v; return this; }
}
module.exports = {
  Colors: { Red: 0xff0000, Blue: 0x0000ff, Grey: 0x808080, DarkerGrey: 0x3a3a3a },
  EmbedBuilder, Collection, ActionRowBuilder, ButtonBuilder, ModalBuilder, TextInputBuilder,
  ButtonStyle: { Primary: 1, Secondary: 2, Success: 3, Danger: 4 },
  TextInputStyle: { Short: 1, Paragraph: 2 },
  ChannelType: { GuildText: 0, GuildCategory: 4 },
  PermissionFlagsBits: { ManageChannels: 1n << 4n },
  Partials: {},
  GatewayIntentBits: new Proxy({}, { get: () => 0 }),
};
`,
);

const tickets = require("../bot/src/handlers/tickets.js");
const lang = require("../bot/src/handlers/lang.js");
const core = require("../bot/src/ticketCore.js");
const lockdown = require("../bot/src/lockdown.js");

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  ok ? pass++ : fail++;
};

const ZWSP = String.fromCharCode(0x200b);
const T = lang.ticketText("vi");

// ═══ staffRoleIds: ưu tiên role riêng, rỗng thì lấy modRoles ═══
console.log("\n── staffRoleIds ──");
check(
  "có ticketStaffRoleId → dùng nó",
  core.isStaff(
    { roles: { cache: { has: (r) => r === "T" } } },
    tickets.staffRoleIds({ ticketStaffRoleId: "T", modRoles: ["M"] }),
  ),
);
check(
  "rỗng → lấy modRoles",
  core.isStaff(
    { roles: { cache: { has: (r) => r === "M" } } },
    tickets.staffRoleIds({ modRoles: ["M"] }),
  ),
);
check("không có cả hai → mảng rỗng (chặn)", tickets.staffRoleIds({}).length === 0);
check(
  "modRoles không phải mảng → không ném",
  Array.isArray(tickets.staffRoleIds({ modRoles: null })),
);
check("config null → không ném", tickets.staffRoleIds(null).length === 0);

// ═══ parseTicketId ═══
console.log("\n── parseTicketId ──");
check(
  "tách action:id",
  JSON.stringify(tickets.parseTicketId("ticket_close:abc")) ===
    JSON.stringify({ action: "ticket_close", ticketId: "abc" }),
);
check(
  "id chứa dấu : vẫn lấy hết phần sau",
  tickets.parseTicketId("ticket_close:a:b").ticketId === "a:b",
);
check("không có dấu : → null", tickets.parseTicketId("ticket_close") === null);
check("id rỗng → null", tickets.parseTicketId("ticket_close:") === null);
check("chuỗi rỗng → null", tickets.parseTicketId("") === null);

// ═══ describeGuildError: dịch lỗi Discord thành mã đã dịch sẵn ═══
console.log("\n── describeGuildError ──");
check("50013 → MISSING_PERM", tickets.describeGuildError({ code: 50013 }) === "MISSING_PERM");
check("30003 → MAX_CHANNELS", tickets.describeGuildError({ code: 30003 }) === "MAX_CHANNELS");
check("10003 → NO_CATEGORY", tickets.describeGuildError({ code: 10003 }) === "NO_CATEGORY");
check(
  "message tiếng Anh 'missing permissions' → MISSING_PERM",
  tickets.describeGuildError({ message: "Missing Permissions" }) === "MISSING_PERM",
);
check(
  "rawError.code được đọc",
  tickets.describeGuildError({ rawError: { code: 30003 } }) === "MAX_CHANNELS",
);
check("lỗi lạ → UNKNOWN", tickets.describeGuildError({ message: "wat" }) === "UNKNOWN");
check("không có lỗi → UNKNOWN", tickets.describeGuildError(null) === "UNKNOWN");
check(
  "MÃ LỖI CÓ CHUỖI DỊCH SẴN",
  ["MISSING_PERM", "MAX_CHANNELS", "NO_CATEGORY", "UNKNOWN"].every(
    (c) =>
      typeof T[
        `err${c === "MAX_CHANNELS" ? "ChannelsFull" : c === "MISSING_PERM" ? "NoPerm" : c === "NO_CATEGORY" ? "NoCategory" : "NoPerm"}`
      ] === "string",
  ),
);

// ═══ actionRow: nút mang ticketId + nhãn đúng ngôn ngữ ═══
console.log("\n── actionRow ──");
{
  // Panel nay có 7 nút → BẮT BUỘC 2 hàng (Discord tối đa 5 nút/hàng).
  // Gom 1 hàng là `send()` ném lỗi → mất cả nút Gỡ ban.
  const rows = tickets.panelRows(T, "TID123");
  const all = rows.flatMap((r) => r.components);
  const ids = all.map((c) => c.customId);
  check("panel chia 2 hàng", rows.length === 2);
  check("7 nút thao tác (6 staff + 1 tự đóng cho người mở)", all.length === 7);
  check(
    "mọi hàng không vượt 5 nút (giới hạn Discord)",
    rows.every((r) => r.components.length <= 5),
    rows.map((r) => r.components.length).join(","),
  );
  check(
    "mọi nút mang ticketId",
    ids.every((id) => id.endsWith(":TID123")),
    ids.join(","),
  );
  check("nút Đóng", ids.includes("ticket_close:TID123"));
  check("nút Đóng kèm lý do", ids.includes("ticket_close_reason:TID123"));
  check("nút Nhận việc", ids.includes("ticket_claim:TID123"));
  check("nút Gỡ ban", ids.includes("ticket_unban:TID123"));
  check("nút Ghim", ids.includes("ticket_pin:TID123"));
  check("nút Tôi tự đóng (chỉ người mở bấm được)", ids.includes("ticket_close_own:TID123"));
  check("nút AI", ids.includes("ticket_ai:TID123"));
  check("nhãn theo ngôn ngữ VI", all[0].label === T.btnClose);
  const rowsEn = tickets.panelRows(lang.ticketText("en"), "T1");
  check("nhãn đổi theo ngôn ngữ EN", rowsEn[0].components[0].label === "Close");
  const noId = tickets.actionRow(T, null);
  check("không có id thì nút vẫn dựng được", noId.components[0].customId === "ticket_close");
}

// ═══ createTicketChannel: gắn quyền, @everyone bị chặn ═══
console.log("\n── createTicketChannel (quyền) ──");
function makeGuild({ createThrows = null, overwritesFail = new Set() } = {}) {
  const overwrites = [];
  let created = null;
  const category = { id: "CAT", type: 4 };
  const staffRole = { id: "STAFF" };
  const everyone = { id: "EVERYONE" };
  const guild = {
    id: "g1",
    name: "Server",
    roles: { everyon: undefined, everyone, cache: new Map([["STAFF", staffRole]]) },
    channels: {
      create: async (opts) => {
        if (createThrows) throw createThrows;
        created = opts;
        const ch = {
          id: "CH1",
          name: opts.name,
          parent: opts.parent,
          topic: opts.topic,
          permissionOverwrites: {
            edit: async (target, perms) => {
              if (overwritesFail.has(String(target?.id ?? target))) {
                const e = new Error("Missing Permissions");
                e.code = 50013;
                throw e;
              }
              overwrites.push({ id: String(target?.id ?? target), perms });
              return ch;
            },
          },
          send: async () => {},
          setName: async (n) => {
            ch.name = n;
            return ch;
          },
        };
        return ch;
      },
    },
  };
  return { guild, category, overwrites, getCreated: () => created };
}

(async () => {
  {
    const { guild, category, overwrites, getCreated } = makeGuild();
    const ch = await tickets.createTicketChannel({
      guild,
      category,
      channelName: "ticket-minh-1",
      openerId: "U1",
      staffIds: ["STAFF"],
      openerOnly: true,
    });
    check("tạo kênh thành công", ch.id === "CH1");
    check("kênh nằm trong category", getCreated().parent === category);
    check("tên kênh dùng đúng", getCreated().name === "ticket-minh-1");
    const everyone = overwrites.find((o) => o.id === "EVERYONE");
    check("@everyone bị CHẶN xem kênh", everyone && everyone.perms.ViewChannel === false);
    const staff = overwrites.find((o) => o.id === "STAFF");
    check(
      "staff được mở quyền xem + gửi",
      staff && staff.perms.ViewChannel === true && staff.perms.SendMessages === true,
    );
    check(
      "staff cần ManageChannels để dùng nút Đóng",
      staff && staff.perms.ManageChannels === true,
    );
    const opener = overwrites.find((o) => o.id === "U1");
    check("người mở được mở quyền", opener && opener.perms.ViewChannel === true);
  }
  {
    // Người bị ban (điểm vào A): KHÔNG mở quyền cho họ — họ vào kênh nào cũng
    // không được, mở là vô nghĩa và chỉ làm rò thông tin.
    const { guild, category, overwrites } = makeGuild();
    await tickets.createTicketChannel({
      guild,
      category,
      channelName: "ticket-1",
      openerId: "BANNED",
      staffIds: ["STAFF"],
      openerOnly: false,
    });
    check(
      "điểm vào DM: KHÔNG cấp quyền cho người bị ban",
      !overwrites.some((o) => o.id === "BANNED"),
    );
  }
  {
    // Role staff nằm TRÊN bot → Discord từ chối ghi overwrite cho role đó.
    // Phải bỏ qua role đó, KHÔNG làm hỏng cả ticket.
    const { guild, category, overwrites } = makeGuild({ overwritesFail: new Set(["STAFF"]) });
    const ch = await tickets.createTicketChannel({
      guild,
      category,
      channelName: "ticket-1",
      openerId: "U1",
      staffIds: ["STAFF"],
      openerOnly: true,
    });
    check("role trên bot: vẫn tạo được kênh", ch.id === "CH1");
    check(
      "role lỗi bị bỏ qua, không ném",
      overwrites.every((o) => o.id !== "STAFF"),
    );
  }
  {
    // Lỗi tạo kênh phải BÁO LÊN (không nuốt) — openTicket dựa vào đó để ghi
    // openError cho dashboard.
    const boom = new Error("boom");
    boom.code = 30003;
    const { guild, category } = makeGuild({ createThrows: boom });
    let caught = null;
    try {
      await tickets.createTicketChannel({
        guild,
        category,
        channelName: "t-1",
        staffIds: [],
        openerOnly: false,
      });
    } catch (e) {
      caught = e;
    }
    check("lỗi tạo kênh được ném lên (để ghi openError)", caught === boom);
  }

  // ═══ Phương án D: kênh công khai + slowmode (29/09/2026) ═══
  // Hai tuỳ chọn này đổi quyền và gọi Discord API NGAY LÚC TẠO — sai thì
  // hậu quả nặng: kênh khiếu nại bị ai cũng đọc, hoặc cấu hình chết âm thầm
  // (slowmode hỏng mà không ai báo).
  console.log("\n── createTicketChannel (công khai + slowmode) ──");
  {
    // Mặc định PHẢI kín: ticket khiếu nại mà ai đọc được thì người dùng
    // không dám kêu.
    const { guild, category, overwrites } = makeGuild();
    await tickets.createTicketChannel({
      guild,
      category,
      channelName: "t-1",
      staffIds: ["STAFF"],
      openerOnly: false,
    });
    check(
      "không bật công khai → @everyone vẫn bị chặn xem",
      overwrites.find((o) => o.id === "EVERYONE")?.perms.ViewChannel === false,
    );
  }
  {
    const { guild, category, overwrites } = makeGuild();
    await tickets.createTicketChannel({
      guild,
      category,
      channelName: "t-1",
      staffIds: ["STAFF"],
      openerOnly: false,
      isPublic: true,
    });
    check(
      "bật công khai → @everyone ĐƯỢC xem kênh",
      overwrites.find((o) => o.id === "EVERYONE")?.perms.ViewChannel === true,
    );
    // Chủ server bật công khai KHÔNG có nghĩa bỏ luôn quyền của staff.
    check(
      "bật công khai → staff vẫn được mở quyền đầy đủ",
      overwrites.find((o) => o.id === "STAFF")?.perms.SendMessages === true,
    );
  }
  {
    const { guild, category, getCreated } = makeGuild();
    await tickets.createTicketChannel({
      guild,
      category,
      channelName: "t-1",
      staffIds: [],
      openerOnly: false,
      slowmodeSec: 45,
    });
    check("slowmode 45s → truyền xuống rateLimitPerUser", getCreated().rateLimitPerUser === 45);
  }
  {
    // Giá trị rác từ dashboard không được làm hỏng lượt mở ticket.
    const cases = [
      [999999, 21600, "vượt trần 21600"],
      [-5, 0, "âm → 0"],
      [30.7, 30, "thập phân → làm tròn xuống"],
      ["abc", 0, "chữ → 0"],
      [null, 0, "null → 0"],
    ];
    for (const [input, expected, label] of cases) {
      const { guild, category, getCreated } = makeGuild();
      await tickets.createTicketChannel({
        guild,
        category,
        channelName: "t-1",
        staffIds: [],
        openerOnly: false,
        slowmodeSec: input,
      });
      check(`slowmode ${label}`, getCreated().rateLimitPerUser === expected);
    }
  }
  {
    // Không đặt slowmode → KHÔNG gửi field (tránh ghi 0 lên mọi kênh cũ).
    const { guild, category, getCreated } = makeGuild();
    await tickets.createTicketChannel({
      guild,
      category,
      channelName: "t-1",
      staffIds: [],
      openerOnly: false,
    });
    check("không đặt slowmode → mặc định 0 (tắt)", getCreated().rateLimitPerUser === 0);
  }

  // ═══ closeTicketChannel: thu quyền + đổi tên, KHÔNG xoá kênh ═══
  console.log("\n── closeTicketChannel ──");
  {
    const overwrites = [];
    const channel = {
      id: "CH1",
      name: "ticket-minh-1",
      permissionOverwrites: {
        edit: async (t, p) => {
          overwrites.push({ id: String(t?.id ?? t), p });
          return channel;
        },
      },
      setName: async (n) => {
        channel.name = n;
        return channel;
      },
    };
    const guild = { roles: { everyone: { id: "EVERYONE" } } };
    await tickets.closeTicketChannel({ guild, channel, openerId: "U1" });
    check(
      "thu quyền người mở",
      overwrites.some(
        (o) => o.id === "U1" && o.p.ViewChannel === false && o.p.SendMessages === false,
      ),
    );
    check(
      "@everyone vẫn bị chặn",
      overwrites.some((o) => o.id === "EVERYONE" && o.p.ViewChannel === false),
    );
    check("tên kênh đổi sang closed-*", channel.name === "closed-ticket-minh-1");
  }
  {
    // Không có openerId (ticket mở qua DM) → bỏ qua bước thu quyền, vẫn đóng.
    const channel = {
      id: "CH1",
      name: "ticket-3",
      permissionOverwrites: { edit: async () => channel },
      setName: async (n) => {
        channel.name = n;
        return channel;
      },
    };
    await tickets.closeTicketChannel({
      guild: { roles: { everyone: { id: "EVERYONE" } } },
      channel,
      openerId: null,
    });
    check("ticket mở qua DM: đóng được dù không có openerId", channel.name === "closed-ticket-3");
  }
  {
    // Lỗi quyền khi đóng → vẫn đổi tên được, không ném.
    const channel = {
      id: "CH1",
      name: "ticket-4",
      permissionOverwrites: {
        edit: async () => {
          const e = new Error("no");
          e.code = 50013;
          throw e;
        },
      },
      setName: async (n) => {
        channel.name = n;
        return channel;
      },
    };
    let threw = false;
    try {
      await tickets.closeTicketChannel({
        guild: { roles: { everyone: { id: "E" } } },
        channel,
        openerId: "U1",
      });
    } catch {
      threw = true;
    }
    check("lỗi quyền khi đóng: không ném", threw === false);
  }

  // ═══ Embed/modal/nút ═══
  console.log("\n── embed / modal / nút ──");
  {
    const e = tickets.banNoticeEmbed({ guild: { name: "Server X" }, reason: "spam", T });
    check("embed DM có tên server", e.d.description.includes("Server X"));
    check("embed DM có lý do ban", e.d.description.includes("spam"));
    check("embed DM không có placeholder {n} thừa", !e.d.title.includes("{n}"));
  }
  {
    // ⚠️ BẢO MẬT: lý do ban do người khác gõ, có thể chứa <@&id>.
    // Gửi DM mà không escape thì chính bot ping role đó trong tin nhắn riêng.
    const e = tickets.banNoticeEmbed({ guild: { name: "S" }, reason: "bị <@&123456789> nhắc", T });
    check("lý do ban được escape (chặn ping role trong DM)", e.d.description.includes(ZWSP));
    check("lý do ban không còn mention nguyên vẹn", !e.d.description.includes("<@&123456789>"));
  }
  {
    const row = tickets.dmButtonRow(T);
    check("nút DM có 1 nút", row.components.length === 1);
    check("customId nút DM đúng", row.components[0].customId === "ticket_open_dm");
  }
  {
    const m = tickets.appealModal(T);
    check("modal có 2 ô", m.components.length === 2);
    check("ô nội dung bắt buộc", m.components[0].required === true);
    check("ô bằng chứng tuỳ chọn", m.components[1].required === false);
    check("ô nội dung giới hạn 1000 ký tự", m.components[0].maxLength === core.BODY_MAX);
    check("ô bằng chứng giới hạn 500 ký tự", m.components[1].maxLength === core.EVIDENCE_MAX);
  }
  {
    const m = tickets.aiModal(T);
    check("modal AI có 1 ô", m.components.length === 1);
    check("customId modal AI khớp handler", m.customId === "ticket_ai_note");
    const a = tickets.appealModal(T);
    check("customId modal khiếu nại khớp handler", a.customId === "ticket_appeal_dm");
  }

  // ═══ escapePayload: nội dung staff đưa vào prompt AI ═══
  console.log("\n── escapePayload ──");
  check("escape mention trong payload", tickets.escapePayload("@everyone xin chào").includes(ZWSP));
  check("cắt còn 800 ký tự", tickets.escapePayload("a".repeat(2000)).length === 800);

  // ═══ Hằng số Discord ═══
  console.log("\n── hằng số ──");
  check("trần kênh Discord = 500", tickets.DISCORD_MAX_CHANNELS === 500);
  check("tên kênh tối đa 100 ký tự", tickets.CHANNEL_NAME_MAX === 100);

  // ═══ openTicket: toàn bộ hàng rào + nhánh lỗi trước khi có kênh ═══
  // Trước đợt này `openTicket` có 0% coverage: đúng những nhánh quyết định
  // "có tạo ticket hay không" lại không được test. Test lại từng nhánh, và mỗi
  // mã trả về đều phải có bản dịch trong TICKET_TEXT — nếu không, `renderError`
  // im lặng rơi về "bot thiếu quyền" và báo sai nguyên nhân (đã xảy ra với
  // `errNo_category` / `errNo_staff`: reason snake_case ≠ key camelCase).
  console.log("\n── openTicket (hàng rào) ──");
  const goodConfig = {
    ticketEnabled: true,
    ticketCategoryId: "CAT",
    ticketStaffRoleId: "STAFF",
  };

  function openEnv(opts = {}) {
    const {
      config = goodConfig,
      state = { openCount: 0, lastOpenedAt: null, openChannelId: null },
      canManage = true,
      categoryInCache = true,
      createThrows = null,
      openFails = false,
      setFails = false,
      sendFails = false,
      rec = { ticketId: "TID1", number: 7 },
      guildId = "g1",
      // Chỉ cho lỗi ở MỘT loại tạo (vd category con) để kiểm đường lùi về
      // category cha mà không làm hỏng luôn lượt mở ticket.
      createFailsForType = null,
    } = opts;
    const calls = {
      queries: [],
      mutations: [],
      sent: null,
      sentList: [],
      dms: [],
      dmFails: false,
      createdName: null,
      createdTopic: null,
      // MỌI lần gọi channels.create — cần khi mở category con (gọi 2 lần:
      // category trước, rồi mới tới kênh tin).
      createdList: [],
    };
    const category = { id: "CAT", type: 4 };
    const guild = {
      id: guildId,
      name: "Server",
      members: { me: { permissions: { has: () => canManage } } },
      roles: { everyone: { id: "EVERYONE" }, cache: new Map([["STAFF", { id: "STAFF" }]]) },
      channels: {
        cache: new Map(categoryInCache ? [["CAT", category]] : []),
        create: async (o) => {
          if (createThrows) throw createThrows;
          if (createFailsForType !== null && o.type === createFailsForType) {
            throw new Error("không tạo được category con");
          }
          calls.createdName = o.name;
          calls.createdTopic = o.topic;
          calls.createdList.push({ name: o.name, type: o.type, parent: o.parent });
          const ch = {
            id: "CH-NEW",
            name: o.name,
            permissionOverwrites: { edit: async () => ch },
            send: async (payload) => {
              if (sendFails) throw new Error("không gửi được");
              calls.sent = payload;
              calls.sentList.push(payload);
            },
          };
          return ch;
        },
      },
    };
    const client = {
      query: async (name, args) => {
        calls.queries.push({ name, args });
        return state;
      },
      users: {
        fetch: async () => ({
          send: async (payload) => {
            if (calls.dmFails) throw new Error("Cannot send messages to this user");
            calls.dms.push(payload);
          },
        }),
      },
    };
    const store = {
      getConfig: async () => config,
      client: {
        mutation: async (name, args) => {
          calls.mutations.push({ name, args });
          if (name === "bot_writes:botOpenTicket" && openFails) {
            throw new Error("mất mạng");
          }
          if (name === "bot_writes:botSetTicketChannel" && setFails) {
            throw new Error("mất mạng");
          }
          return rec;
        },
      },
    };
    return { client, store, guild, user: { id: "U1", username: "minh" }, calls };
  }

  const run = (env, over = {}) =>
    tickets.openTicket({
      client: env.client,
      store: env.store,
      guild: env.guild,
      user: env.user,
      kind: "support",
      source: "cmd",
      body: "nội dung khiếu nại",
      T,
      ...over,
    });

  // ═══ openTicket: lời dặn đầu kênh + DM khi mở ═══
  console.log("\n── openTicket (lời dặn + DM) ──");
  {
    // THỨ TỰ quan trọng: lời dặn phải là tin ĐẦU, nội dung khiếu nại sau —
    // staff mở kênh thấy "cần gì / trễ bao lâu" trước khi đọc lời kêu.
    const env = openEnv({ config: { ...goodConfig, ticketOpenNote: "Chào {user}! #{number}" } });
    const r = await run(env);
    check("mở ticket thành công", r.ok === true && r.channelId === "CH-NEW", JSON.stringify(r));
    const first = env.calls.sentList[0];
    check(
      "lời dặn là tin ĐẦU TIÊN trong kênh",
      first?.embeds?.[0]?.d?.title === T.openNoteTitle,
      first?.embeds?.[0]?.d?.title,
    );
    check(
      "lời dặn điền {user} {number}",
      first?.embeds?.[0]?.d?.description === "Chào minh! #7",
      first?.embeds?.[0]?.d?.description,
    );
    check(
      "nội dung khiếu nại đứng SAU lời dặn",
      env.calls.sentList.length === 3 && !!env.calls.sentList[1]?.embeds?.[0]?.d?.fields,
      JSON.stringify(env.calls.sentList.map((s) => !!s.embeds?.[0]?.d?.fields)),
    );
  }
  {
    // Không cấu hình lời dặn → chỉ 2 tin (khiếu nại + panel), KHÔNG gửi embed rỗng.
    const env = openEnv();
    await run(env);
    check(
      "không cấu hình lời dặn → 2 tin, tin đầu là nội dung khiếu nại",
      env.calls.sentList.length === 2 && !!env.calls.sentList[0].embeds[0].d.fields,
      JSON.stringify(env.calls.sentList.map((s) => s.embeds?.[0]?.d?.title)),
    );
  }
  {
    // Lời dặn là nội dung CHỦ SERVER soạn → escape mention như mọi chỗ khác.
    const env = openEnv({ config: { ...goodConfig, ticketOpenNote: "@everyone {user}" } });
    await run(env);
    check(
      "lời dặn escape @everyone",
      !env.calls.sentList[0].embeds[0].d.description.includes("@everyone"),
      env.calls.sentList[0].embeds[0].d.description,
    );
  }
  {
    // Mặc định (undefined) = BẬT DM — dựa vào so sánh !== false nên dữ liệu
    // cũ (chưa có field) vẫn hành xử đúng.
    const env = openEnv();
    await run(env);
    check(
      "mặc định: DM cho người mở",
      env.calls.dms.length === 1,
      JSON.stringify(env.calls.dms.length),
    );
    check(
      "DM có link kênh ticket vừa tạo",
      env.calls.dms[0]?.embeds?.[0]?.d?.description?.includes("/channels/g1/CH-NEW"),
      env.calls.dms[0]?.embeds?.[0]?.d?.description,
    );
  }
  {
    const env = openEnv({ config: { ...goodConfig, ticketDmOnOpen: true } });
    await run(env);
    check("bật tường minh → có DM", env.calls.dms.length === 1);
  }
  {
    const env = openEnv({ config: { ...goodConfig, ticketDmOnOpen: false } });
    const r = await run(env);
    check(
      "tắt DM → không gửi, ticket VẪN mở bình thường",
      env.calls.dms.length === 0 && r.ok === true,
      JSON.stringify({ dms: env.calls.dms.length, ok: r.ok }),
    );
  }
  {
    // Người dùng tắt tin nhắn riêng là chuyện thường — KHÔNG được làm hỏng
    // luồng mở ticket (kênh đã tạo, staff đã thấy, bản ghi đã ghi).
    const env = openEnv();
    env.calls.dmFails = true;
    const r = await run(env);
    check(
      "DM hỏng (tắt tin nhắn riêng) → ticket vẫn mở, không ném lỗi",
      r.ok === true && r.channelId === "CH-NEW",
      JSON.stringify(r),
    );
    check(
      "DM hỏng vẫn ghi channelId vào bản ghi",
      env.calls.mutations.some(
        (m) => m.name === "bot_writes:botSetTicketChannel" && m.args.channelId === "CH-NEW",
      ),
      JSON.stringify(env.calls.mutations.map((m) => m.name)),
    );
  }

  // Mỗi mã lỗi phảI có bản dịch — hàm assert dùng chung cho các case dưới.
  const hasText = (code) => typeof T[code] === "string" && T[code].length > 0;

  {
    lockdown.markLocked("g-locked");
    const env = openEnv({ guildId: "g-locked" });
    const r = await run(env);
    check("server bị khoá raid → không mở ticket", r.code === "errLocked" && r.ok === false);
    check(
      "bị khoá thì KHÔNG đụng Convex",
      env.calls.queries.length === 0 && env.calls.mutations.length === 0,
    );
  }
  {
    const r = await run(openEnv({ config: { ...goodConfig, ticketEnabled: false } }));
    check("tính năng tắt → errDisabled", r.code === "errDisabled" && hasText(r.code));
  }
  {
    const r = await run(openEnv({ config: { ...goodConfig, ticketCategoryId: null } }));
    check("chưa cấu hình category → errNoCategory", r.code === "errNoCategory" && hasText(r.code));
  }
  {
    const r = await run(openEnv({ config: { ...goodConfig, ticketStaffRoleId: null } }));
    check("chưa cấu hình role staff → errNoStaff", r.code === "errNoStaff" && hasText(r.code));
  }
  {
    // Hồi quy: reason snake_case của decideOpen KHÔNG được ghép thẳng thành
    // tên key — `errNo_category` không tồn tại → báo sai nguyên nhân.
    const reasons = [
      [{ ...goodConfig, ticketEnabled: false }, "disabled", "errDisabled"],
      [{ ...goodConfig, ticketCategoryId: null }, "no_category", "errNoCategory"],
      [{ ...goodConfig, ticketStaffRoleId: null }, "no_staff", "errNoStaff"],
    ];
    let allOk = true;
    for (const langCode of ["vi", "en", "de"]) {
      const text = lang.ticketText(langCode);
      for (const [config, reason, expected] of reasons) {
        const got = core.decideOpen({
          enabled: config.ticketEnabled,
          category: config.ticketCategoryId,
          staffRoleIds: tickets.staffRoleIds(config),
        });
        if (got.reason !== reason) allOk = false;
        if (typeof text[expected] !== "string" || text[expected].length === 0) allOk = false;
        // Bản ghép thẳng từ snake_case phải KHÔNG tồn tại: nếu tồn tại thì
        // bảng map có thể bị xoá nhầm mà test vẫn xanh.
        if (reason.includes("_")) {
          const naive = `err${reason.charAt(0).toUpperCase()}${reason.slice(1)}`;
          if (typeof text[naive] === "string") allOk = false;
        }
      }
    }
    check("mọi reason của decideOpen → key dịch đúng (cả 3 ngôn ngữ)", allOk);
  }
  {
    const r = await run(
      openEnv({
        config: { ...goodConfig, ticketMaxOpen: 20 },
        state: { openCount: 20, lastOpenedAt: null, openChannelId: null },
      }),
    );
    check(
      "đạt trần ticket mở → errMaxOpen kèm số",
      r.code === "errMaxOpen" && r.max === 20 && r.count === 20,
      JSON.stringify(r),
    );
  }
  {
    const r = await run(
      openEnv({
        config: { ...goodConfig, ticketCooldownHours: 24 },
        state: { openCount: 0, lastOpenedAt: Date.now() - 3_600_000, openChannelId: null },
      }),
    );
    check(
      "còn trong thời gian chờ → errCooldown kèm số giờ",
      r.code === "errCooldown" && r.waitHours === 23,
      JSON.stringify(r),
    );
  }
  {
    const r = await run(
      openEnv({ state: { openCount: 1, lastOpenedAt: null, openChannelId: "CH-OLD" } }),
    );
    check(
      "đã có ticket mở → trả kênh cũ, KHÔNG tạo kênh thứ hai",
      r.code === "errAlreadyOpen" && r.channelId === "CH-OLD",
      JSON.stringify(r),
    );
  }
  {
    // Lỗi thật 28/09/2026: vừa mở ticket xong là cooldown lập tức (mặc định
    // 24h). Kiểm cooldown trước thì lần bấm thứ hai của người dùng chỉ nhận
    // "hãy chờ 24 giờ" — không thấy kênh của chính mình, nhánh errAlreadyOpen
    // không bao giờ chạy được.
    const r = await run(
      openEnv({
        state: { openCount: 1, lastOpenedAt: Date.now() - 60_000, openChannelId: "CH-OLD" },
      }),
    );
    check(
      "đã có ticket mở + đang trong cooldown → trả kênh cũ (không báo chờ)",
      r.code === "errAlreadyOpen" && r.channelId === "CH-OLD",
      JSON.stringify(r),
    );
  }
  {
    // Bản ghi mở nhưng tạo kênh hỏng có channelId "pending" — chưa có kênh
    // thật, nên trả `<#pending>` ra là link chết cho người dùng.
    const r = await run(
      openEnv({
        state: { openCount: 1, lastOpenedAt: Date.now() - 60_000, openChannelId: "pending" },
      }),
    );
    check(
      'ticket mở nhưng kênh "pending" → KHÔNG trả link chết',
      r.code !== "errAlreadyOpen",
      JSON.stringify(r),
    );
  }
  {
    // Category bị xoá giữa lúc đang mở (10003) → phải báo đúng nguyên nhân,
    // không báo nhầm "bot thiếu quyền" (đã từng rơi vào errNoPerm).
    const r = await run(
      openEnv({ createThrows: Object.assign(new Error("Unknown Channel"), { code: 10003 }) }),
    );
    check("tạo kênh lỗi 10003 → errNoCategory", r.code === "errNoCategory", JSON.stringify(r));
  }
  {
    const r = await run(openEnv({ createThrows: new Error("lỗi lạ không lường trước") }));
    check(
      "tạo kênh lỗi lạ → errUnknown (không đoán bừa)",
      r.code === "errUnknown",
      JSON.stringify(r),
    );
  }
  {
    const env = openEnv({ canManage: false });
    const r = await run(env);
    check("bot thiếu quyền Quản lý kênh → errNoPerm", r.code === "errNoPerm");
    check("thiếu quyền thì KHÔNG ghi bản ghi", env.calls.mutations.length === 0);
  }
  {
    const r = await run(openEnv({ categoryInCache: false }));
    check("category không còn trong cache → errNoCategory", r.code === "errNoCategory");
  }
  {
    // Ghi chú "khi đóng ticket" mà chủ server gõ ở dashboard phải xuất hiện ở
    // đâu đó trong kênh — topic là chỗ luôn hiện. Không nối thì ô cấu hình đó
    // là "ghi vào rồi không ai đọc" (đúng như đã xảy ra ở bản đầu).
    const note = "Ticket đã xử lý, cảm ơn bạn đã liên hệ.";
    const env = openEnv({ config: { ...goodConfig, ticketCloseNote: note } });
    await run(env);
    check(
      "ghi chú của chủ server thành topic kênh ticket",
      env.calls.createdTopic === note,
      String(env.calls.createdTopic),
    );
  }
  {
    const env = openEnv();
    await run(env);
    check(
      "không có ghi chú → topic mặc định",
      env.calls.createdTopic === "Protogon ticket",
      String(env.calls.createdTopic),
    );
  }
  {
    // Topic Discord tối đa 1024 ký tự — ghi chú dài phải bị cắt, nếu không
    // guild.channels.create ném và ticket không mở được.
    const env = openEnv({ config: { ...goodConfig, ticketCloseNote: "x".repeat(5000) } });
    await run(env);
    check(
      "ghi chú quá dài bị cắt theo trần topic Discord",
      String(env.calls.createdTopic).length === 1024,
      String(env.calls.createdTopic).length,
    );
  }
  {
    // Không ghi được bản ghi = không có dấu vết ticket → dừng, không tạo kênh.
    const env = openEnv({ openFails: true });
    const r = await run(env);
    check("lỗi ghi bản ghi → dừng", r.code === "errNoPerm" && r.ok === false);
    check("lỗi ghi bản ghi → không tạo kênh", env.calls.sent === null);
  }
  {
    // Chạm trần 500 kênh: bản ghi PHẢI được giữ lại kèm openError để staff
    // thấy trên dashboard — xoá dấu vết ở đây là thông tin biến mất im lặng.
    const boom = new Error("Maximum number of channels reached");
    boom.code = 30003;
    const env = openEnv({ createThrows: boom });
    const r = await run(env);
    const setCall = env.calls.mutations.find((m) => m.name === "bot_writes:botSetTicketChannel");
    check("chạm trần 500 kênh → errChannelsFull", r.code === "errChannelsFull", JSON.stringify(r));
    check(
      "bản ghi được giữ lại kèm openError=MAX_CHANNELS",
      setCall && setCall.args.openError === "MAX_CHANNELS" && setCall.args.ticketId === "TID1",
    );
  }
  {
    const boom = new Error("Missing Permissions");
    boom.code = 50013;
    const r = await run(openEnv({ createThrows: boom }));
    check("tạo kênh thiếu quyền → errNoPerm", r.code === "errNoPerm" && hasText(r.code));
  }
  {
    const env = openEnv();
    const r = await run(env, { body: "  xin   cho  em  lại  ", evidence: "bằng chứng" });
    check(
      "mở được ticket",
      r.ok === true && r.channelId === "CH-NEW" && r.number === 7,
      JSON.stringify(r),
    );
    check("số thứ tự lấy từ mutation", r.number === 7);
    check(
      "tên kênh = ticket-<user>-<số>",
      env.calls.createdName === "ticket-minh-7",
      env.calls.createdName,
    );
    const setCall = env.calls.mutations.find((m) => m.name === "bot_writes:botSetTicketChannel");
    check("ghi channelId thật vào bản ghi", setCall && setCall.args.channelId === "CH-NEW");
    check(
      "query state đúng guild + user",
      env.calls.queries[0].args.guildId === "g1" && env.calls.queries[0].args.userId === "U1",
    );
    check(
      "bản ghi mở được ghi trước khi tạo kênh",
      env.calls.mutations[0].name === "bot_writes:botOpenTicket",
    );
    check(
      "chưa có kênh thật thì ghi 'pending'",
      env.calls.mutations[0].args.channelId === "pending",
    );
  }
  {
    // rec thiếu number → lùi về số đếm sẵn có, tên kênh vẫn hợp lệ.
    const r = await run(openEnv({ rec: { ticketId: "TID2" }, state: { openCount: 3 } }));
    check(
      "mutation không trả number → lùi về số đếm",
      r.ok === true && r.number === 3,
      JSON.stringify(r),
    );
  }
  {
    // Gửi embed hỏng KHÔNG được làm mất ticket: kênh đã tạo, bản ghi đã có.
    const env = openEnv({ sendFails: true });
    const r = await run(env);
    check("gửi embed lỗi → ticket vẫn thành công", r.ok === true, JSON.stringify(r));
  }
  {
    const r = await run(openEnv({ setFails: true }));
    check("cập nhật channelId lỗi → vẫn trả kênh cho người dùng", r.ok === true);
  }
  {
    // Nội dung người dùng gửi phải đi qua sanitizeBody trước khi lưu.
    const env = openEnv();
    await run(env, { body: "@everyone  " + "a".repeat(2000) });
    const openCall = env.calls.mutations.find((m) => m.name === "bot_writes:botOpenTicket");
    check(
      "nội dung được cắt ngắn + escape mention trước khi ghi",
      openCall.args.body.length <= core.BODY_MAX &&
        !openCall.args.body.includes("@everyone") &&
        openCall.args.body.includes(ZWSP),
    );
  }

  // ═══ Phương án D: mẫu tên kênh + category con theo loại (29/09/2026) ═══
  console.log("\n── openTicket (mẫu tên + category con) ──");
  {
    // Không đặt mẫu → phải y hệt hành vi cũ, không đổi tên kênh nào đang có.
    // Kỳ vọng TÍNH TỪ core.buildChannelName chứ không hardcode: hợp đồng cần
    // kiểm là "giống hệt cách cũ", không phải một chuỗi tên cụ thể.
    const env = openEnv();
    await run(env);
    const legacy = core.buildChannelName({ username: "minh", number: 7 });
    check(
      "không đặt mẫu tên → y hệt hành vi cũ",
      env.calls.createdName === legacy,
      `${env.calls.createdName} ≠ ${legacy}`,
    );
  }
  {
    const env = openEnv({
      config: { ...goodConfig, ticketChannelTemplate: "tk-{number}-{kind}" },
    });
    await run(env);
    check(
      "mẫu tên được điền placeholder",
      env.calls.createdName === "tk-7-support",
      env.calls.createdName,
    );
  }
  {
    const env = openEnv({
      config: { ...goodConfig, ticketChannelTemplate: "{user}-{number}" },
    });
    await run(env);
    check("mẫu dùng được tên người mở", env.calls.createdName === "minh-7", env.calls.createdName);
  }
  {
    // Mẫu do CHỦ SERVER soạn — rác trong đó không được làm tạo kênh hỏng.
    const env = openEnv({
      config: { ...goodConfig, ticketChannelTemplate: "  ../../etc/passwd {number}  " },
    });
    await run(env);
    check(
      "mẫu chứa ký tự lạ → vẫn tạo được kênh",
      env.calls.createdName !== undefined && !env.calls.createdName.includes(".."),
      env.calls.createdName,
    );
  }
  {
    // Bật category con: tạo category TRƯỚC, kênh tin nằm trong đó.
    const env = openEnv({ config: { ...goodConfig, ticketCategoryPerKind: true } });
    const r = await run(env);
    check("bật category con → ticket vẫn mở được", r.ok === true, JSON.stringify(r));
    check(
      "tạo 2 lần: category con rồi mới tới kênh tin",
      env.calls.createdList.length === 2,
      String(env.calls.createdList.length),
    );
    check(
      "lần đầu tạo category (type 4) đặt trong category cha",
      env.calls.createdList[0]?.type === 4 && env.calls.createdList[0]?.parent?.id === "CAT",
      JSON.stringify(env.calls.createdList[0]),
    );
    check(
      "kênh tin nằm trong category CON, không phải category cha",
      env.calls.createdList[1]?.type === 0 && env.calls.createdList[1]?.parent?.id === "CH-NEW",
      JSON.stringify(env.calls.createdList[1]),
    );
  }
  {
    // Lỗi tạo category con → lùi về category cha. Người dùng đã bấm nút rồi,
    // mất ticket tệ hơn là kênh nằm chỗ kém đẹp.
    const env = openEnv({
      config: { ...goodConfig, ticketCategoryPerKind: true },
      createFailsForType: 4,
    });
    const r = await run(env);
    check("lỗi tạo category con → vẫn mở được ticket", r.ok === true, JSON.stringify(r));
    check(
      "lỗi category con → kênh tin lùi về category cha",
      env.calls.createdList.length === 1 && env.calls.createdList[0]?.parent?.id === "CAT",
      JSON.stringify(env.calls.createdList),
    );
  }
  {
    // Tắt (mặc định) → KHÔNG tạo category con, chỉ 1 lần create.
    const env = openEnv();
    await run(env);
    check(
      "tắt category con → chỉ tạo kênh tin, không tạo category",
      env.calls.createdList.length === 1 && env.calls.createdList[0]?.type === 0,
      JSON.stringify(env.calls.createdList),
    );
  }

  // ═══ Đợt nâng cấp: panel tuỳ chỉnh, claim, đóng kèm lý do, transcript ═══
  console.log("\n── buildPanel (panel tuỳ chỉnh) ──");
  {
    const base = {
      T,
      ticketKindLabel: "khiếu nại",
      openerName: "Minh",
      number: 7,
      idleHours: 24,
    };
    const def = tickets.buildPanel(base);
    check("panel có 2 hàng nút", def.components.length === 2, String(def.components.length));
    const desc = String(def.embeds[0].d.description || "");
    check("rỗng → dùng panelTitle mặc định", desc.length > 0, desc);
    const fields = JSON.stringify(def.embeds[0].d.fields || "");
    check(
      "báo số giờ tự đóng cho người mở thấy",
      desc.includes("24") || fields.includes("24"),
      desc + " | " + fields,
    );
    {
      const custom = tickets.buildPanel({
        ...base,
        customText: "Chào {user} — ticket #{number}, loại {kind}",
      });
      const d2 = String(custom.embeds[0].d.description || "");
      check(
        "thay placeholder tuỳ chỉnh",
        d2.includes("Minh") && d2.includes("#7") && d2.includes("khiếu nại"),
        d2,
      );
    }
    {
      const ping = tickets.buildPanel({ ...base, pingRoles: ["<@&111>"] });
      const d3 = JSON.stringify(ping.embeds[0].d.fields || "");
      check("có tag role khi mở ticket", d3.includes("<@&111>"), d3);
    }
    const off = tickets.buildPanel({ ...base, idleHours: 0 });
    check(
      "tắt tự đóng (0) → KHÔNG hứa sẽ tự đóng",
      !JSON.stringify(off.embeds[0].d.fields || "").includes("24"),
      JSON.stringify(off.embeds[0].d.fields || ""),
    );
  }

  console.log("\n── modal đóng kèm lý do ──");
  {
    const m = tickets.closeReasonModal(T, "TID1");
    check("modal mang đúng customId", m.customId === "ticket_close_reason_submit:TID1", m.customId);
    check("tiêu đề lấy từ bảng ngôn ngữ", m.title === T.reasonModalTitle, m.title);
    const field = m.components[0].components[0];
    check("1 ô nhập, bắt buộc có lý do", field.customId === "ticket_close_reason_body");
    const mEn = tickets.closeReasonModal(lang.ticketText("de"), "T2");
    check("modal đổi ngôn ngữ DE", mEn.title === lang.ticketText("de").reasonModalTitle, mEn.title);
  }

  console.log("\n── claimedRow ──");
  {
    const r = tickets.claimedRow(T, "TID9");
    check(
      "nút bỏ nhận mang ticketId",
      r.components[0].customId === "ticket_unclaim:TID9",
      r.components[0].customId,
    );
  }

  console.log("\n── closeTicketWithReason ──");
  {
    const sent = [];
    const mutations = [];
    const channel = {
      name: "ticket-1",
      send: async (p) => sent.push(p),
      setName: async () => {},
      permissionOverwrites: { edit: async () => {} },
    };
    const guild = { id: "G", roles: { everyone: "E" } };
    const store = {
      client: {
        mutation: async (n, a) => {
          mutations.push({ n, a });
          return {};
        },
      },
    };
    const res = await tickets.closeTicketWithReason({
      guild,
      channel,
      store,
      ticketId: "T1",
      closedByName: "Mod",
      reason: "Đã gỡ ban",
      graceHours: 24,
      T,
    });
    check("báo đã đóng", res.closed === true);
    check(
      "ghi closeReason xuống Convex",
      mutations[0]?.a?.closeReason === "Đã gỡ ban",
      JSON.stringify(mutations),
    );
    check("gửi embed kết quả trong kênh", sent.length === 1);
    check("grace hours chuẩn hoá 24", res.graceHours === 24);
  }
  {
    // Ghi trạng thái lỗi → báo KHÔNG đóng (ticket còn mở trong DB) nhưng vẫn
    // thu quyền kênh — người dùng nhìn thấy kênh đã đóng, staff thì không.
    const sent = [];
    const channel = {
      name: "ticket-2",
      send: async (p) => sent.push(p),
      setName: async () => {},
      permissionOverwrites: { edit: async () => {} },
    };
    const store = {
      client: {
        mutation: async () => {
          throw new Error("db down");
        },
      },
    };
    const res = await tickets.closeTicketWithReason({
      guild: { id: "G", roles: { everyone: "E" } },
      channel,
      store,
      ticketId: "T1",
      reason: "x",
      graceHours: 24,
      T,
    });
    check("ghi lỗi → KHÔNG báo đã đóng", res.closed === false);
  }
  {
    // Kênh không gửi được embed (đã bị thu quyền) → vẫn đóng được.
    const channel = {
      name: "ticket-3",
      send: async () => {
        throw new Error("Missing Access");
      },
      setName: async () => {},
      permissionOverwrites: { edit: async () => {} },
    };
    const store = { client: { mutation: async () => ({}) } };
    const res = await tickets.closeTicketWithReason({
      guild: { id: "G", roles: { everyone: "E" } },
      channel,
      store,
      ticketId: "T1",
      reason: "x",
      graceHours: 24,
      T,
    });
    check("gửi embed hỏng → vẫn đóng thành công", res.closed === true);
  }

  console.log("\n── saveTranscript ──");
  {
    const mutations = [];
    const channel = {
      id: "CH",
      name: "ticket-1",
      messages: {
        fetch: async () =>
          new Map([
            [
              "m2",
              {
                id: "m2",
                createdTimestamp: 2,
                author: { username: "b", id: "u2" },
                content: "@everyone hai",
                attachments: [],
                embeds: [],
              },
            ],
            [
              "m1",
              {
                id: "m1",
                createdTimestamp: 1,
                author: { username: "a", id: "u1" },
                content: "một",
                attachments: [{ url: "https://x/1.png" }],
                embeds: [],
              },
            ],
          ]),
      },
    };
    const store = {
      client: {
        mutation: async (n, a) => {
          mutations.push({ n, a });
          return {};
        },
        storage: { store: async () => "SID" },
      },
    };
    const okSave = await tickets.saveTranscript({
      store,
      guild: { id: "G", name: "Guild" },
      channel,
      ticketId: "T1",
    });
    check("lưu transcript thành công", okSave === true);
    check(
      "gửi storageId lên Convex",
      mutations[0]?.a?.storageId === "SID",
      JSON.stringify(mutations),
    );
  }
  {
    // Không đọc được tin nhắn → KHÔNG coi là lưu được (bot sẽ giữ kênh).
    const channel = {
      id: "CH",
      name: "x",
      messages: {
        fetch: async () => {
          throw new Error("Missing Access");
        },
      },
    };
    const store = { client: { mutation: async () => ({}), storage: { store: async () => "SID" } } };
    const r = await tickets.saveTranscript({
      store,
      guild: { id: "G", name: "G" },
      channel,
      ticketId: "T1",
    });
    check("đọc tin nhắn lỗi → KHÔNG lưu (giữ kênh)", r === false);
  }
  {
    // Storage lỗi → KHÔNG lưu.
    const channel = {
      id: "CH",
      name: "x",
      messages: { fetch: async () => new Map() },
    };
    const store = {
      client: {
        mutation: async () => ({}),
        storage: {
          store: async () => {
            throw new Error("storage full");
          },
        },
      },
    };
    const r = await tickets.saveTranscript({
      store,
      guild: { id: "G", name: "G" },
      channel,
      ticketId: "T1",
    });
    check("storage lỗi → KHÔNG lưu", r === false);
  }

  console.log(`\nKết quả tickets-handler: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
})();
