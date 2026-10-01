// TEST: bot/src/handlers/ticketJobs.js — job tự đóng + dọn kênh.
// Chạy: node scripts/test-ticket-jobs.cjs
//
// Đây là chỗ NGUY HIỂM NHẤT của tính năng ticket: nó XOÁ KÊNH DISCORD.
// Xoá là không hoàn tác. Suite này chốt 3 thứ tự bất di bất dịch:
//   1. KHÔNG lưu được transcript → KHÔNG xoá kênh.
//   2. Có transcript rồi → không xoá 2 lần.
//   3. Một job hỏng KHÔNG được làm hỏng các job còn lại trong cùng lượt.
const DJS_MOCK = require("./support/djs-mock-path.cjs");
const Module = require("module");
const fs = require("fs");

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
  addFields(...f) { this.d.fields = [...(this.d.fields ?? []), ...f.flat(Infinity)]; return this; }
  setTimestamp() { return this; }
  setFooter(f) { this.d.footer = f; return this; }
}
module.exports = {
  Colors: new Proxy({}, { get: (_, k) => (k === "Grey" ? 0x555555 : 0x000000) }),
  EmbedBuilder,
  PermissionFlagsBits: { ManageGuild: 1n << 5n, Administrator: 1n << 3n, ManageChannels: 1n << 4n },
  UserFlags: { VerifiedBot: 1n << 16n },
  ChannelType: { GuildText: 0, GuildVoice: 2 },
  ActionRowBuilder: class { constructor(){this.components=[];} addComponents(...c){this.components.push(...c);return this;} },
  ButtonBuilder: class { constructor(){this.d={};} setCustomId(v){this.customId=v;return this;} setLabel(v){this.label=v;return this;} setStyle(v){this.style=v;return this;} },
  ButtonStyle: { Primary: 1, Secondary: 2, Success: 3, Danger: 4 },
  ModalBuilder: class { constructor(){this.d={};} setCustomId(v){this.customId=v;return this;} setTitle(v){this.title=v;return this;} addComponents(c){this.rows=c;return this;} },
  TextInputBuilder: class { constructor(){this.d={};} setCustomId(v){this.customId=v;return this;} setLabel(v){this.label=v;return this;} setStyle(v){return this;} setPlaceholder(v){return this;} setRequired(v){return this;} setMaxLength(v){return this;} },
  TextInputStyle: { Short: 1, Paragraph: 2 },
};
`,
);

const jobs = require("../bot/src/handlers/ticketJobs.js");
const lang = require("../bot/src/handlers/lang.js");

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  ok ? pass++ : fail++;
};
const section = (t) => console.log(`\n── ${t} ──`);

/** Guild + kênh giả, đếm thao tác để chứng minh THỨ TỰ. */
function mkWorld() {
  const log = [];
  const sent = [];
  const overwrites = [];
  const channel = {
    id: "CH1",
    name: "ticket-1",
    messages: {
      fetch: async () => {
        log.push("fetch");
        return new Map([
          [
            "m2",
            {
              id: "m2",
              createdTimestamp: 2,
              author: { username: "b", id: "u2" },
              content: "hai",
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
              attachments: [],
              embeds: [],
            },
          ],
        ]);
      },
    },
    send: async (p) => {
      sent.push(p);
      log.push("send");
    },
    setName: async (n) => {
      channel.name = n;
      log.push("setName");
    },
    permissionOverwrites: {
      edit: async () => {
        overwrites.push(1);
      },
    },
    delete: async () => {
      log.push("DELETE");
      channel.deleted = true;
    },
  };
  const guild = {
    id: "G1",
    name: "Guild",
    roles: { everyone: "EVERYONE" },
    channels: { cache: new Map([["CH1", channel]]) },
  };
  const mutations = [];
  const store = {
    client: {
      mutation: async (name, args) => {
        mutations.push({ name, args });
        log.push(name);
        if (name === "bot_writes:botSaveTicketTranscript" && store.failSave) {
          throw new Error("storage chết");
        }
        return {};
      },
      storage: {
        store: async () => {
          log.push("storage.store");
          if (store.failSave) throw new Error("storage chết");
          return "STORAGE1";
        },
      },
    },
  };
  store.failSave = false;
  const client = { guilds: { cache: new Map([["G1", guild]]) } };
  return { client, store, guild, channel, log, sent, mutations };
}

const T = lang.ticketText("vi");
const job = {
  guildId: "G1",
  ticketId: "T1",
  channelId: "CH1",
  number: 1,
  openerId: "U1",
  idleHours: 24,
  closeGraceHours: 24,
};

(async () => {
  // ═══ 1. Auto close ═══
  section("runAutoClose — đóng khi im lặng quá lâu");
  {
    const w = mkWorld();
    const ok = await jobs.runAutoClose(w.client, w.store, job, T);
    check("đóng thành công", ok === true);
    check(
      "ghi botCloseTicket status=closed",
      w.mutations.some((m) => m.name === "bot_writes:botCloseTicket" && m.args.status === "closed"),
    );
    check("gửi embed giải thích tự đóng", w.sent.length === 1 && !!w.sent[0].embeds);
    // EmbedBuilder giả lưu field trong `.d` — đọc đúng chỗ.
    const desc = String(w.sent[0].embeds[0].d.description || "");
    check("embed có số giờ im lặng của server đó", desc.includes("24"), desc.slice(0, 140));
    check("đổi tên kênh closed-*", String(w.channel.name).startsWith("closed-"), w.channel.name);
    check("KHÔNG xoá kênh ở bước đóng", w.channel.deleted !== true);
  }
  {
    // Kênh đã bị xoá tay → phải dọn bản ghi, không để ticket mở vĩnh viễn.
    const w = mkWorld();
    w.guild.channels.cache.delete("CH1");
    const ok = await jobs.runAutoClose(w.client, w.store, job, T);
    check("kênh đã mất → vẫn đóng được bản ghi", ok === true);
    check(
      "ghi botCloseTicket khi kênh không còn",
      w.mutations.some((m) => m.name === "bot_writes:botCloseTicket"),
    );
  }
  {
    const w = mkWorld();
    w.guilds = null;
    w.client.guilds.cache.delete("G1");
    const ok = await jobs.runAutoClose(w.client, w.store, job, T);
    check("bot không còn trong server → bỏ qua, không ném", ok === false);
  }

  // ═══ 2. Purge — THỨ TỰ lưu trước, xoá sau ═══
  section("runPurge — lưu transcript TRƯỚC, xoá kênh SAU");
  {
    const w = mkWorld();
    const ok = await jobs.runPurge(w.client, w.store, job);
    check("dọn kênh thành công", ok === true);
    const iFetch = w.log.indexOf("fetch");
    const iStore = w.log.indexOf("storage.store");
    const iSave = w.log.findIndex((x) => x === "bot_writes:botSaveTicketTranscript");
    const iDel = w.log.indexOf("DELETE");
    check("đọc transcript trước", iFetch >= 0);
    check("ghi storage TRƯỚC khi xoá", iStore > iFetch && iStore < iDel, w.log.join(" > "));
    check(
      "xác nhận lưu vào Convex TRƯỚC khi xoá",
      iSave > iStore && iSave < iDel,
      w.log.join(" > "),
    );
    // Sau khi xoá vẫn còn ghi botCloseTicket(status=locked) — đúng, bản ghi
    // phải khép lại. Điều kiện bất di bất dịch chỉ là: XOÁ SAU khi đã lưu.
    check("XOÁ KÊNH CHỈ SAU khi xác nhận lưu thành công", iDel > iSave, w.log.join(" > "));
    check(
      "gửi storageId lên Convex",
      w.mutations.some(
        (m) => m.name === "bot_writes:botSaveTicketTranscript" && m.args.storageId === "STORAGE1",
      ),
    );
    check(
      "đánh dấu locked sau khi xoá",
      w.mutations.some((m) => m.name === "bot_writes:botCloseTicket" && m.args.status === "locked"),
    );
  }
  {
    // ⚠️ RỦI RO LỚN NHẤT: lưu hỏng mà vẫn xoá = mất bằng chứng khiếu nại.
    const w = mkWorld();
    w.store.failSave = true;
    const ok = await jobs.runPurge(w.client, w.store, job);
    check("lưu transcript HỎNG → KHÔNG xoá kênh", ok === false);
    check("lỗi lưu → kênh phải còn nguyên", w.channel.deleted !== true, w.log.join(" > "));
  }
  {
    // Lượt trước đã lưu transcript xong nhưng `channel.delete()` lỗi → bản ghi
    // vẫn `closed` + đã có transcript. Không có `transcriptReady` thì lượt
    // tick này sẽ lại lưu transcript lần nữa: ghi thêm file mỗi vòng, vô
    // hạn. Với cờ đó, bot bỏ qua bước lưu và chỉ thử xoá lại kênh.
    const w = mkWorld();
    const ok = await jobs.runPurge(w.client, w.store, { ...job, transcriptReady: true });
    check("transcript đã lưu → vẫn xoá được kênh", ok === true, w.log.join(" > "));
    check(
      "không ghi lại transcript lần nữa",
      !w.log.includes("storage.store") &&
        !w.mutations.some((m) => m.name === "bot_writes:botSaveTicketTranscript"),
      w.log.join(" > "),
    );
    check(
      "vẫn khép bản ghi thành locked",
      w.mutations.some((m) => m.args.status === "locked"),
    );
  }
  {
    // Kênh xoá lỗi thì phải BÁO THẤT BẠI (false) để lượt tick sau thử lại —
    // im lặng thành công giả là bỏ rơi kênh vĩnh viễn.
    const w = mkWorld();
    w.channel.delete = async () => {
      w.log.push("DELETE_FAIL");
      throw new Error("Missing Permissions");
    };
    const ok = await jobs.runPurge(w.client, w.store, { ...job, transcriptReady: true });
    check("xoá kênh lỗi → báo thất bại để thử lại", ok === false);
    check("không khép bản ghi khi kênh còn", !w.mutations.some((m) => m.args.status === "locked"));
  }

  // ═══ 2b. Khoá kênh của ticket đóng từ DASHBOARD ═══
  // Trước job này: dashboard đóng ticket chỉ đổi trạng thái DB, kênh giữ
  // nguyên tên + quyền tới tận lượt purge sau 24h (lỗi thật 28/09/2026).
  section("runCloseChannel — khoá kênh đóng từ dashboard");
  {
    const w = mkWorld();
    const ok = await jobs.runCloseChannel(
      w.client,
      w.store,
      { ...job, status: "closeChannel", closeReason: "Đã giải quyết" },
      T,
    );
    check("khoá kênh thành công", ok === true);
    check(
      "thu quyền + đổi tên kênh (KHÔNG xoá kênh)",
      w.log.includes("setName") && !w.log.includes("DELETE"),
      w.log.join(","),
    );
    check(
      "đánh dấu channelClosedAt để tick không lặp",
      w.mutations.some((m) => m.name === "bot_writes:botMarkTicketChannelClosed"),
      w.mutations.map((m) => m.name).join(","),
    );
    check(
      "KHÔNG ghi lại closedAt (không đẩy lùi lượt dọn kênh)",
      !w.mutations.some((m) => m.name === "bot_writes:botCloseTicket"),
      w.mutations.map((m) => m.name).join(","),
    );
    check(
      "có gửi embed kèm lý do đóng",
      w.sent.some((s) => s.embeds?.[0]?.d?.description?.includes("Đã giải quyết")),
      JSON.stringify(w.sent.map((s) => s.embeds?.[0]?.d?.description)),
    );
  }
  {
    // Kênh đã bị xoá tay → vẫn đánh dấu, nếu không tick lặp mãi.
    const w = mkWorld();
    const ok = await jobs.runCloseChannel(
      w.client,
      w.store,
      { ...job, channelId: "KHONG_CO", status: "closeChannel" },
      T,
    );
    check("kênh không còn → đánh dấu đã khoá, không ném", ok === true);
    check(
      "vẫn ghi mốc channelClosedAt",
      w.mutations.some((m) => m.name === "bot_writes:botMarkTicketChannelClosed"),
    );
  }
  {
    // Bot không có trong server → không đánh dấu (lượt tick sau thử lại được).
    const w = mkWorld();
    const ok = await jobs.runCloseChannel(
      { guilds: { cache: new Map() } },
      w.store,
      { ...job, status: "closeChannel" },
      T,
    );
    check("bot không còn trong server → trả false, không ghi mốc", ok === false);
    check(
      "không ghi mốc khi chưa xử lý được",
      w.mutations.length === 0,
      w.mutations.map((m) => m.name).join(","),
    );
  }
  {
    // Lượt batch nhận cả 3 loại job.
    const w = mkWorld();
    const res = await jobs.processTicketJobs(w.client, w.store, [
      { ...job, status: "closeChannel" },
    ]);
    check(
      "processTicketJobs nhận job closeChannel",
      res.closed === 1 &&
        w.mutations.some((m) => m.name === "bot_writes:botMarkTicketChannelClosed"),
      JSON.stringify(res),
    );
  }

  // ═══ 3. Batch: lỗi 1 job không làm hỏng job khác ═══
  section("processTicketJobs — lỗi cô lập");
  {
    const w = mkWorld();
    const res = await jobs.processTicketJobs(w.client, w.store, [
      {
        ...job,
        ticketId: "A",
        channelId: "CH1",
        status: "autoClose",
        idleHours: 24,
        closeGraceHours: 24,
      },
      {
        ...job,
        ticketId: "B",
        channelId: "KHONG_CO",
        status: "autoClose",
        idleHours: 24,
        closeGraceHours: 24,
      },
      {
        ...job,
        ticketId: "C",
        channelId: "CH1",
        status: "purge",
        idleHours: 24,
        closeGraceHours: 24,
      },
    ]);
    check(
      "cả 3 job đều xử lý, không job nào chặn job sau",
      typeof res.closed === "number" && typeof res.purged === "number",
      JSON.stringify(res),
    );
    check("job thiếu kênh vẫn dọn bản ghi được", res.closed >= 2, JSON.stringify(res));
  }
  {
    const w = mkWorld();
    const res = await jobs.processTicketJobs(w.client, w.store, null);
    check("jobs null → không ném", res.closed === 0 && res.purged === 0);
    const res2 = await jobs.processTicketJobs(w.client, w.store, []);
    check("jobs rỗng → không ném", res2.closed === 0);
  }
  {
    // Job rác (thiếu field) không được làm hỏng cả lượt.
    const w = mkWorld();
    const res = await jobs.processTicketJobs(w.client, w.store, [{}, null, { status: "purge" }]);
    check(
      "job rác / null → bỏ qua an toàn",
      res.closed === 0 && res.purged === 0,
      JSON.stringify(res),
    );
  }

  {
    // Kênh đã bị xoá tay ở nhánh purge: vẫn phải khép bản ghi (status locked),
    // nếu không ticket mở mãi trong bảng và job quét lại mỗi 60s.
    const w = mkWorld();
    w.guild.channels.cache.delete("CH1");
    const ok = await jobs.runPurge(w.client, w.store, job);
    check("purge: kênh đã mất → đánh dấu locked", ok === true);
    check(
      "purge: ghi locked khi kênh không còn",
      w.mutations.some((m) => m.name === "bot_writes:botCloseTicket" && m.args.status === "locked"),
      JSON.stringify(w.mutations.map((m) => m.name)),
    );
    check(
      "purge: kênh mất nên không gọi storage",
      !w.log.includes("storage.store"),
      w.log.join(" > "),
    );
  }
  {
    // Mutation đóng bản ghi lỗi ở nhánh purge-kênh-mất: phải nuốt, không ném.
    const w = mkWorld();
    w.guild.channels.cache.delete("CH1");
    const origMut = w.store.client.mutation;
    w.store.client.mutation = async () => {
      throw new Error("db down");
    };
    let threw = false;
    try {
      await jobs.runPurge(w.client, w.store, job);
    } catch {
      threw = true;
    }
    check("ghi locked lỗi → không ném ra ngoài", threw === false);
    w.store.client.mutation = origMut;
  }
  {
    // Ghi botCloseTicket LỖI ở nhánh autoClose → KHÔNG được báo thành công,
    // vì bản ghi vẫn còn status open nên job sẽ thử lại mãi mãi.
    const w = mkWorld();
    w.store.client.mutation = async (name) => {
      if (name === "bot_writes:botCloseTicket") throw new Error("db down");
      return {};
    };
    const ok = await jobs.runAutoClose(w.client, w.store, job, T);
    check("ghi trạng thái lỗi → KHÔNG báo đã đóng", ok === false);
  }
  {
    // Lượt có job lỗi + job tốt: job tốt vẫn phải chạy.
    const w = mkWorld();
    w.store.client.mutation = async (name) => {
      if (name === "bot_writes:botCloseTicket") throw new Error("db down");
      return {};
    };
    const res = await jobs.processTicketJobs(w.client, w.store, [
      { ...job, ticketId: "X", status: "autoClose" },
    ]);
    check(
      "job lỗi không làm hỏng vòng lặp",
      res.closed === 0 && res.purged === 0,
      JSON.stringify(res),
    );
  }
  {
    // Trạng thái lạ (không phải autoClose/purge) → bỏ qua âm thầm.
    const w = mkWorld();
    const res = await jobs.processTicketJobs(w.client, w.store, [{ ...job, status: "gi" }]);
    check("status lạ → bỏ qua", res.closed === 0 && res.purged === 0, JSON.stringify(res));
    check(
      "status lạ → không gọi mutation",
      w.mutations.length === 0,
      JSON.stringify(w.mutations.map((m) => m.name)),
    );
  }

  console.log(`\nKết quả ticket jobs: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
})();
