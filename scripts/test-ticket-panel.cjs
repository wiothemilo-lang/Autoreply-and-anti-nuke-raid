// TEST: panel MỞ ticket — tin nhắn dán ở kênh công khai để THÀNH VIÊN tự
// mở ticket (không phải gõ lệnh /ticket), cộng nút "Tôi tự đóng" trong kênh.
//
// Vì sao tách suite: `test-ticket-interactions.cjs` MOCK `./tickets` để kiểm
// lớp dẫn kết của interactionCreate; suite này kiểm NGƯỢC lại — hàm dựng
// panel thật trong handlers/tickets.js và đường bot dán panel (gửi sai kênh
// là kiểu lỗi tệ nhất: panel nằm ở kênh riêng thì không ai thấy).
//
// Chạy: node scripts/test-ticket-panel.cjs
const path = require("path");
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
  constructor(data = {}) { this.d = { ...data }; this.data = this.d; }
  setColor(c) { this.d.color = c; return this; }
  setTitle(t) { this.d.title = t; return this; }
  setDescription(t) { this.d.description = t; return this; }
  addFields(f) { this.d.fields = [...(this.d.fields ?? []), ...(Array.isArray(f) ? f : [f])]; return this; }
  setTimestamp() { return this; }
  setFooter(f) { this.d.footer = f; return this; }
}
class ActionRowBuilder {
  constructor() { this.components = []; }
  addComponents(...c) { this.components.push(...c.flat(Infinity)); return this; }
}
class ButtonBuilder {
  constructor() { this.customId = null; this.label = null; this.style = null; }
  setCustomId(v) { this.customId = v; return this; }
  setLabel(v) { this.label = v; return this; }
  setStyle(v) { this.style = v; return this; }
  setEmoji(v) { this.emoji = v; return this; }
}
class ModalBuilder {
  constructor() { this.components = []; }
  setCustomId(v) { this.customId = v; return this; }
  setTitle(v) { this.title = v; return this; }
  addComponents(...c) { this.components.push(...c.flat(Infinity)); return this; }
}
class TextInputBuilder {
  constructor() { this.data = {}; }
  setCustomId(v) { this.customId = v; return this; }
  setLabel(v) { this.label = v; return this; }
  setPlaceholder(v) { this.placeholder = v; return this; }
  setStyle(v) { this.style = v; return this; }
  setRequired(v) { this.required = v; return this; }
  setMaxLength(v) { this.maxLength = v; return this; }
}
module.exports = {
  Colors: new Proxy({}, { get: () => 0x000000 }),
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ModalBuilder, TextInputBuilder,
  ButtonStyle: { Primary: 1, Secondary: 2, Success: 3, Danger: 4 },
  TextInputStyle: { Short: 1, Paragraph: 2 },
  ChannelType: { GuildText: 0 },
  PermissionFlagsBits: { ManageChannels: 1n << 4n },
};
`,
);

(async () => {
  const tickets = require("../bot/src/handlers/tickets.js");
  const lang = require("../bot/src/handlers/lang.js");
  const T = lang.ticketText("vi");

  let pass = 0;
  let fail = 0;
  const check = (label, cond, detail) => {
    console.log(`${cond ? "PASS" : "FAIL"} ${label}${cond || !detail ? "" : ` — ${detail}`}`);
    cond ? pass++ : fail++;
  };

  const guild = { id: "g1", name: "Server", locale: "vi" };

  function makeStore(config) {
    const calls = [];
    return {
      calls,
      _mutations: calls,
      getConfig: async () => config,
      client: {
        mutation: async (name, args) => {
          calls.push({ name, args });
          return { ok: true };
        },
        query: async () => null,
      },
    };
  }

  function makeClient({
    channelOk = true,
    sendThrows = false,
    hasGuild = true,
    summary = { openCount: 0 },
    dmFails = false,
  } = {}) {
    const sent = [];
    const fetchedOld = [];
    const dms = [];
    // Timeline thứ tự thật: gộp mọi hành động lên 1 mảng. Nếu chỉ đếm
    // "xoá được bao nhiêu" thì vẫn xanh khi code XOÁ TRƯỚC khi dán bản mới —
    // đúng thứ tự mới là thứ cần chặn (xoá trước, gửi hỏng ⇒ mất panel).
    const timeline = [];
    const deleted = [];
    // Tin đã xoá thì KHÔNG fetch lại được — mô phỏng đúng thật để bắt được
    // code gọi fetch/xoá hai lần.
    const alive = new Set();
    const channel = {
      id: "ch-panel",
      name: "ticket-panel",
      isTextBased: () => true,
      send: async (p) => {
        if (sendThrows) throw new Error("Missing Permissions");
        sent.push(p);
        timeline.push("send");
        return { id: "m-new" };
      },
      messages: {
        fetch: async (id) => {
          fetchedOld.push(id);
          timeline.push("fetch:" + id);
          if (!alive.has(id)) throw new Error("Unknown Message");
          return {
            id,
            deletable: true,
            delete: async () => {
              alive.delete(id);
              deleted.push(id);
              timeline.push("delete:" + id);
            },
          };
        },
      },
    };
    return {
      sent,
      fetchedOld,
      deleted,
      dms,
      timeline,
      /** Bản giả: tin nào còn "sống" trong kênh (mặc định mọi tin đều sống). */
      seedAlive: (ids) => ids.forEach((i) => alive.add(i)),
      guilds: {
        cache: hasGuild ? new Map([["g1", guild]]) : new Map(),
      },
      channels: {
        fetch: async () => (channelOk ? channel : null),
      },
      query: async (name) => (name === "tickets:botTicketSummary" ? summary : null),
      users: {
        fetch: async () => ({
          send: async (p) => {
            if (dmFails) throw new Error("Cannot send messages to this user");
            dms.push(p);
          },
        }),
      },
    };
  }

  const buttonIds = (panel) => panel.components[0].components.map((b) => b.customId);

  // ═════════ 1. Dựng panel mở ═════════
  {
    const panel = tickets.openPanel({ T, customText: "", showAppeal: true });
    check(
      "panel mở: 2 nút Hỗ trợ + Khiếu nại",
      JSON.stringify(buttonIds(panel)) ===
        JSON.stringify(["ticket_open:support", "ticket_open:appeal"]),
      JSON.stringify(buttonIds(panel)),
    );
    check(
      "panel mở: mô tả mặc định (không rơi về panelTitle của kênh ticket)",
      panel.embeds[0].d.description === T.openPanelBody,
      panel.embeds[0].d.description,
    );
    check(
      "panel mở: KHÔNG lộ nút Đóng của staff ra kênh công khai",
      !JSON.stringify(buttonIds(panel)).includes("ticket_close"),
      JSON.stringify(buttonIds(panel)),
    );
  }
  {
    const panel = tickets.openPanel({ T, customText: "", showAppeal: false });
    check("panel mở: ẩn nút khiếu nại → chỉ còn Hỗ trợ", buttonIds(panel).length === 1);
  }
  {
    // Nội dung do CHỦ SERVER soạn: dán @everyone không được thành ping cả server.
    const panel = tickets.openPanel({ T, customText: "Hỏi tại đây @everyone", showAppeal: true });
    const desc = panel.embeds[0].d.description;
    check("panel mở: escape mention trong nội dung chủ soạn", !desc.includes("@everyone"), desc);
  }

  // ═════════ 2. Modal hỏi trước khi tạo kênh ═════════
  {
    const m = tickets.openModal(T, "support");
    check("modal mở: customId theo loại", m.customId === "ticket_open_submit:support", m.customId);
    check(
      "modal mở: hỏi chủ đề (bắt buộc) + bằng chứng (tuỳ chọn)",
      m.components.length === 2 &&
        m.components[0].required === true &&
        m.components[1].required === false,
    );
    const a = tickets.openModal(T, "appeal");
    check(
      "modal mở: loại khiếu nại hỏi về hình phạt",
      a.customId === "ticket_open_submit:appeal" && a.title === T.openModalTitleAppeal,
      a.title,
    );
  }

  // ═════════ 2b. Loại ticket TUỲ CHỈNH (29/09/2026) ═════════
  {
    const KINDS = [
      { key: "billing", label: "Hoá đơn", emoji: "💳", question: "Bạn hỏi gì về hoá đơn?" },
      { key: "bug", label: "Báo lỗi game", emoji: "🐛" },
      {
        key: "appeal",
        label: "Khiếu nại hình phạt",
        question: "Bạn cho rằng mình bị phạt oan vì…",
      },
    ];
    const panel = tickets.openPanel({ T, customText: "", showAppeal: true, kinds: KINDS });
    const ids = panel.components[0].components.map((b) => b.customId);
    check(
      "panel: dựng nút theo danh sách loại của server",
      JSON.stringify(ids) ===
        JSON.stringify(["ticket_open:billing", "ticket_open:bug", "ticket_open:appeal"]),
      JSON.stringify(ids),
    );
    check(
      "panel: nhãn nút lấy từ cấu hình, không phải chuỗi dịch sẵn",
      panel.components[0].components[1].label === "Báo lỗi game",
      panel.components[0].components[1].label,
    );
    check(
      "panel: emoji hợp lệ được đưa vào nút",
      panel.components[0].components[0].emoji === "💳",
      String(panel.components[0].components[0].emoji),
    );
    check(
      "panel: emoji rác bị bỏ (setEmoji ném lỗi sẽ hỏng cả tin nhắn panel)",
      tickets.openPanel({
        T,
        customText: "",
        kinds: [{ key: "x", label: "X", emoji: "đá quý" }],
      }).components[0].components[0].emoji === undefined,
    );
    // showAppeal vẫn có tác dụng trên danh sách tuỳ chỉnh: khoá "appeal" là
    // loại khiếu nại mặc định, server đã tắt nút đó thì phải biến mất luôn.
    const noAppeal = tickets.openPanel({ T, customText: "", showAppeal: false, kinds: KINDS });
    check(
      "panel: tắt nút khiếu nại cũng ẩn loại tuỳ chỉnh có khoá 'appeal'",
      JSON.stringify(noAppeal.components[0].components.map((b) => b.customId)) ===
        JSON.stringify(["ticket_open:billing", "ticket_open:bug"]),
    );
    // Tràn số loại: bị cắt còn 10 (trần chung với Convex) RỒI chia hàng —
    // Discord tối đa 5 nút/hàng, để 12 nút 1 hàng là API từ chối cả tin nhắn.
    const nhieu = Array.from({ length: 12 }, (_, i) => ({ key: `k${i}`, label: `Loại ${i}` }));
    const panelNhieu = tickets.openPanel({ T, customText: "", kinds: nhieu });
    check(
      "panel: 12 loại → cắt còn 10 rồi chia 2 hàng, không hàng nào quá 5 nút",
      panelNhieu.components.length === 2 &&
        panelNhieu.components.every((r) => r.components.length <= 5) &&
        panelNhieu.components.reduce((n, r) => n + r.components.length, 0) === 10,
      panelNhieu.components.map((r) => r.components.length).join(","),
    );
    // Chỉ có loại "appeal" mà lại tắt nút khiếu nại → vẫn phải dán panel,
    // không thì server mất hoàn toàn đường mở ticket.
    const onlyAppeal = tickets.openPanel({
      T,
      customText: "",
      showAppeal: false,
      kinds: [{ key: "appeal", label: "Khiếu nại" }],
    });
    check(
      "panel: lọc hết nút vẫn dán panel (mất hàng đầu là mất đường mở ticket)",
      onlyAppeal.components.length === 1 && onlyAppeal.components[0].components.length === 1,
    );
    // Danh sách rác → rơi về 2 loại cứng, panel không hỏng.
    check(
      "panel: danh sách loại rác → vẫn ra 2 nút mặc định",
      tickets.openPanel({ T, customText: "", kinds: "rac" }).components[0].components.length === 2,
    );

    // Modal lấy câu hỏi riêng của từng loại.
    const kinds = require("../bot/src/ticketCore").normalizeKinds(KINDS, T);
    const mBilling = tickets.openModal(T, "billing", kinds);
    check(
      "modal: câu hỏi riêng của loại + customId theo key",
      mBilling.customId === "ticket_open_submit:billing" &&
        mBilling.components[0].label === "Bạn hỏi gì về hoá đơn?",
      mBilling.components[0].label,
    );
    const mAppeal = tickets.openModal(T, "appeal", kinds);
    check(
      "modal: loại khiếu nại giữ câu hỏi riêng của mình",
      mAppeal.components[0].label === "Bạn cho rằng mình bị phạt oan vì…",
      mAppeal.components[0].label,
    );
    const mBug = tickets.openModal(T, "bug", kinds);
    check(
      "modal: loại không có câu hỏi riêng → dùng chuỗi dịch sẵn",
      mBug.components[0].label === T.openBodyLabelSupport,
      mBug.components[0].label,
    );
  }

  // ═════════ 2c. Modal có ô nhập bổ sung (phương án B) ═════════
  {
    const core = require("../bot/src/ticketCore");
    const kinds = core.normalizeKinds(
      [
        {
          key: "billing",
          label: "Hoá đơn",
          fields: [
            { key: "amount", label: "Số tiền", required: true, long: true },
            { key: "order_id", label: "Mã đơn" },
          ],
        },
      ],
      T,
    );
    const m = tickets.openModal(T, "billing", kinds);
    check(
      "modal dựng 4 ô: nội dung + bằng chứng + 2 ô bổ sung",
      m.components.length === 4,
      String(m.components.length),
    );
    check(
      "ô bổ sung giữ customId riêng + nhãn cấu hình",
      m.components[2].customId === "xf_amount" && m.components[2].label === "Số tiền",
      m.components[2].customId,
    );
    check("ô bổ sung bắt buộc đi theo cấu hình", m.components[2].required === true);
    check(
      "ô ngắn dùng kiểu Short, ô dài dùng Paragraph",
      m.components[2].style === 2 && m.components[3].style === 1,
      m.components[2].style + "/" + m.components[3].style,
    );
    check(
      "loại không có ô bổ sung → modal vẫn đúng 2 ô như trước",
      tickets.openModal(
        T,
        "support",
        core.normalizeKinds(
          [
            { key: "support", label: "Hỗ trợ" },
            { key: "billing", label: "Hoá đơn" },
          ],
          T,
        ),
      ).components.length === 2,
    );
    check(
      "key không có trong danh sách → rơi về loại ĐẦU (billing) chứ không mất ô bổ sung",
      tickets.openModal(T, "khongco", kinds).components.length === 4,
    );
  }

  // ═════════ 3. Hàng nút trong kênh ticket: có nút tự đóng ═════════
  {
    const row = tickets.extraRow(T, "T1");
    const ids = row.components.map((b) => b.customId);
    check(
      "nút tự đóng có trong kênh ticket",
      ids.includes("ticket_close_own:T1"),
      JSON.stringify(ids),
    );
    check(
      "hàng nút phụ không vượt trần 5 nút của Discord",
      row.components.length <= 5,
      String(row.components.length),
    );
  }

  // ═════════ 4. Bot dán panel ═════════
  {
    const store = makeStore({
      ticketEnabled: true,
      ticketCategoryId: "cat1",
      ticketStaffRoleId: "r1",
      ticketPanelChannelId: "ch-panel",
    });
    const client = makeClient();
    await tickets.sendOpenPanel(client, store, { guildId: "g1", channelId: "ch-panel" });
    check(
      "dán panel: gửi 1 tin có 2 nút mở",
      client.sent.length === 1 && buttonIds(client.sent[0]).length === 2,
      JSON.stringify(client.sent.map((s) => s.embeds?.length)),
    );
    const clear = store._mutations.find((m) => m.name === "guilds:clearTicketPanel");
    check(
      "dán panel: xoá cờ + KHÔNG kèm lỗi",
      !!clear && clear.args.error === undefined,
      JSON.stringify(clear?.args),
    );
  }
  {
    const store = makeStore({
      ticketEnabled: true,
      ticketCategoryId: "cat1",
      ticketStaffRoleId: "r1",
      ticketPanelChannelId: "ch-panel",
    });
    await tickets.sendOpenPanel(makeClient({ hasGuild: false }), store, {
      guildId: "g1",
      channelId: "ch-panel",
    });
    check("dán panel: bot rời server → không mutation", store._mutations.length === 0);
  }
  {
    const store = makeStore({ ticketEnabled: true });
    await tickets.sendOpenPanel(makeClient(), store, { guildId: "g1", channelId: "ch-panel" });
    const clear = store._mutations[0];
    check(
      "dán panel: thiếu category → báo lý do cụ thể",
      clear?.name === "guilds:clearTicketPanel" && /category/i.test(clear.args.error),
      clear?.args.error,
    );
  }
  {
    const store = makeStore({
      ticketEnabled: true,
      ticketCategoryId: "cat1",
      ticketPanelChannelId: "ch-panel",
    });
    await tickets.sendOpenPanel(makeClient(), store, { guildId: "g1", channelId: "ch-panel" });
    check(
      "dán panel: chưa có role staff → báo lý do",
      /staff/i.test(store._mutations[0]?.args.error || ""),
      store._mutations[0]?.args.error,
    );
  }
  {
    const store = makeStore({
      ticketEnabled: true,
      ticketCategoryId: "cat1",
      ticketStaffRoleId: "r1",
      ticketPanelChannelId: "ch-panel",
    });
    await tickets.sendOpenPanel(makeClient({ channelOk: false }), store, {
      guildId: "g1",
      channelId: "ch-panel",
    });
    check(
      "dán panel: kênh không xem được → báo lý do (không im lặng)",
      /kênh/i.test(store._mutations[0]?.args.error || ""),
      store._mutations[0]?.args.error,
    );
  }
  {
    const store = makeStore({
      ticketEnabled: true,
      ticketCategoryId: "cat1",
      ticketStaffRoleId: "r1",
      ticketPanelChannelId: "ch-panel",
    });
    await tickets.sendOpenPanel(makeClient({ sendThrows: true }), store, {
      guildId: "g1",
      channelId: "ch-panel",
    });
    check(
      "dán panel: send lỗi → báo lý do, KHÔNG báo thành công",
      /Missing Permissions/.test(store._mutations[0]?.args.error || ""),
      store._mutations[0]?.args.error,
    );
  }
  {
    const store = makeStore({
      ticketEnabled: true,
      ticketCategoryId: "cat1",
      ticketStaffRoleId: "r1",
    });
    await tickets.processOpenPanelItems(makeClient(), store, []);
    check("dán panel: danh sách rỗng → không làm gì", store._mutations.length === 0);
  }
  {
    // 1 guild hỏng KHÔNG được làm hỏng các guild sau trong cùng lượt quét.
    const bad = makeStore({
      ticketEnabled: true,
      ticketCategoryId: "cat1",
      ticketStaffRoleId: "r1",
      ticketPanelChannelId: "ch-panel",
    });
    bad.getConfig = async () => {
      throw new Error("Convex down");
    };
    const good = makeStore({
      ticketEnabled: true,
      ticketCategoryId: "cat1",
      ticketStaffRoleId: "r1",
      ticketPanelChannelId: "ch-panel",
    });
    const client = makeClient();
    await tickets.processOpenPanelItems(client, bad, [{ guildId: "g1", channelId: "ch-panel" }]);
    await tickets.processOpenPanelItems(client, good, [{ guildId: "g1", channelId: "ch-panel" }]);
    check(
      "dán panel: lỗi của 1 guild không làm hỏng lượt quét",
      good._mutations.length === 1 && client.sent.length === 1,
      JSON.stringify({ sent: client.sent.length, calls: good._mutations.length }),
    );
  }

  // ═════════ 5. Tuỳ chỉnh panel mở (tiêu đề / màu / nội dung) ═════════
  {
    const panel = tickets.openPanel({
      T,
      customTitle: "  Trung tâm trợ giúp  ",
      customText: "{server} có {open} ticket chờ — bấm {support} nhé.",
      customColor: "ff0000",
      serverName: "Protogon",
      openCount: 3,
    });
    const e = panel.embeds[0].d;
    check(
      "panel tuỳ biến: dùng tiêu đề chủ soạn (đã trim)",
      e.title === "Trung tâm trợ giúp",
      e.title,
    );
    check("panel tuỳ biến: màu hex → số nguyên", e.color === 0xff0000, String(e.color));
    check(
      "panel tuỳ biến: điền {server} {open} {support}",
      e.description === "Protogon có 3 ticket chờ — bấm " + T.openSupport + " nhé.",
      e.description,
    );
  }
  {
    // setColor NÉM khi nhận chuỗi → chuỗi rác làm hỏng CẢ panel kèm nút mở.
    const panel = tickets.openPanel({ T, customText: "", customColor: "đỏ" });
    check(
      "panel tuỳ biến: màu rác → rơi về màu mặc định, KHÔNG ném",
      typeof panel.embeds[0].d.color === "number",
      String(panel.embeds[0].d.color),
    );
  }
  {
    // Nội dung chủ soạn có @everyone — escape trước khi điền placeholder.
    const panel = tickets.openPanel({
      T,
      customText: "@everyone {open}",
      serverName: "S",
      openCount: 1,
    });
    const desc = panel.embeds[0].d.description;
    check(
      "panel tuỳ biến: escape mention NGAY CẢ khi có placeholder",
      !desc.includes("@everyone") && desc.includes("1"),
      desc,
    );
  }

  // ═════════ 6. Bot dán bản MỚI rồi xoá bản CŨ ═════════
  {
    const store = makeStore({
      ticketEnabled: true,
      ticketCategoryId: "cat1",
      ticketStaffRoleId: "r1",
      ticketPanelChannelId: "ch-panel",
      ticketPanelMessageId: "m-old",
    });
    const client = makeClient({ summary: { openCount: 7 } });
    client.seedAlive(["m-old"]);
    await tickets.sendOpenPanel(client, store, { guildId: "g1", channelId: "ch-panel" });
    // THỨ TỰ là thứ cần chặn: xoá bản cũ trước, rồi tin mới gửi hỏng ⇒ server
    // mất hoàn toàn panel mở ticket. Timeline bắt đúng điều đó (đếm số lần xoá
    // thì vẫn xanh dù code xoá trước).
    check(
      "dán panel: dán bản MỚI TRƯỚC, rồi mới xoá bản CŨ",
      JSON.stringify(client.timeline) === JSON.stringify(["send", "fetch:m-old", "delete:m-old"]),
      JSON.stringify(client.timeline),
    );
    check(
      "dán panel: bản cũ bị xoá đúng 1 lần",
      client.deleted.length === 1 && client.deleted[0] === "m-old",
      JSON.stringify(client.deleted),
    );
    const clear = store._mutations.find((m) => m.name === "guilds:clearTicketPanel");
    check(
      "dán panel: lưu id tin nhắn MỚI để lần sau xoá đúng bản",
      clear?.args.panelMessageId === "m-new",
      JSON.stringify(clear?.args),
    );
  }
  {
    // Bản cũ đã bị xoá tay: KHÔNG được làm hỏng lượt dán panel mới.
    const store = makeStore({
      ticketEnabled: true,
      ticketCategoryId: "cat1",
      ticketStaffRoleId: "r1",
      ticketPanelChannelId: "ch-panel",
      ticketPanelMessageId: "m-gone",
    });
    const client = makeClient();
    client.channels.fetch = async () => ({
      id: "ch-panel",
      isTextBased: () => true,
      send: async (p) => {
        client.sent.push(p);
        return { id: "m-new" };
      },
      messages: {
        fetch: async () => {
          throw new Error("Unknown Message");
        },
      },
    });
    // `ticketPanelMessageId` trỏ tới tin không còn tồn tại (đã bị xoá tay).
    await tickets.sendOpenPanel(client, store, { guildId: "g1", channelId: "ch-panel" });
    const clear = store._mutations.find((m) => m.name === "guilds:clearTicketPanel");
    check(
      "dán panel: bản cũ đã xoá tay → vẫn dán được bản mới, không báo lỗi",
      client.sent.length === 1 && clear?.args.error === undefined,
      JSON.stringify(clear?.args),
    );
  }
  {
    // Cấu hình phải thực sự ĐI XUỐNG panel dán ra kênh — dashboard bật/tắt
    // một tuỳ chọn mà bot phớt lờ thì người dùng tưởng đã bật, thực tế
    // không có gì thay đổi. Test trên đường dán thật, không chỉ openPanel().
    const store = makeStore({
      ticketEnabled: true,
      ticketCategoryId: "cat1",
      ticketStaffRoleId: "r1",
      ticketPanelChannelId: "ch-panel",
      ticketShowAppealButton: false,
      ticketOpenPanelTitle: "Trung tâm trợ giúp",
      ticketOpenPanelColor: "ff0000",
    });
    const client = makeClient();
    await tickets.sendOpenPanel(client, store, { guildId: "g1", channelId: "ch-panel" });
    const e = client.sent[0]?.embeds?.[0]?.d;
    check(
      "cấu hình → panel: ẩn nút Khiếu nại thực sự có hiệu lực",
      buttonIds(client.sent[0]).length === 1,
      JSON.stringify(buttonIds(client.sent[0])),
    );
    check(
      "cấu hình → panel: tiêu đề + màu tuỳ chỉnh được dùng",
      e?.title === "Trung tâm trợ giúp" && e?.color === 0xff0000,
      JSON.stringify({ title: e?.title, color: e?.color }),
    );
  }
  {
    // Mặc định null (dữ liệu cũ chưa có field) → vẫn hiện CẢ 2 nút.
    const store = makeStore({
      ticketEnabled: true,
      ticketCategoryId: "cat1",
      ticketStaffRoleId: "r1",
      ticketPanelChannelId: "ch-panel",
      ticketShowAppealButton: null,
    });
    const client = makeClient();
    await tickets.sendOpenPanel(client, store, { guildId: "g1", channelId: "ch-panel" });
    check(
      "cấu hình → panel: chưa từng lưu tuỳ chọn → mặc định hiện cả 2 nút",
      buttonIds(client.sent[0]).length === 2,
      JSON.stringify(buttonIds(client.sent[0])),
    );
  }
  {
    const store = makeStore({
      ticketEnabled: true,
      ticketCategoryId: "cat1",
      ticketStaffRoleId: "r1",
      ticketPanelChannelId: "ch-panel",
      ticketOpenPanelText: "Đang có {open} ticket chờ.",
    });
    const client = makeClient({ summary: { openCount: 4 } });
    await tickets.sendOpenPanel(client, store, { guildId: "g1", channelId: "ch-panel" });
    check(
      "dán panel: {open} lấy số ticket đang mở từ botTicketSummary",
      client.sent[0].embeds[0].d.description === "Đang có 4 ticket chờ.",
      client.sent[0].embeds[0].d.description,
    );
  }
  {
    // Query hỏng KHÔNG được làm hỏng cả lượt dán panel — chỉ mất con số.
    const store = makeStore({
      ticketEnabled: true,
      ticketCategoryId: "cat1",
      ticketStaffRoleId: "r1",
      ticketPanelChannelId: "ch-panel",
      ticketOpenPanelText: "Đang có {open} ticket chờ.",
    });
    const client = makeClient();
    client.query = async () => {
      throw new Error("Convex down");
    };
    await tickets.sendOpenPanel(client, store, { guildId: "g1", channelId: "ch-panel" });
    check(
      "dán panel: không đọc được số ticket → vẫn dán, {open} = 0",
      client.sent.length === 1 && client.sent[0].embeds[0].d.description.includes("0"),
      client.sent[0]?.embeds?.[0]?.d?.description,
    );
  }

  // ═════════ 7. Lời dặn đầu kênh ticket ═════════
  {
    check(
      "lời dặn: rỗng → null (KHÔNG gửi embed trắng ra kênh)",
      tickets.openNoteEmbed({ T, customNote: "   " }) === null,
    );
    check(
      "lời dặn: undefined → null",
      tickets.openNoteEmbed({ T, customNote: undefined }) === null,
    );
    const note = tickets.openNoteEmbed({
      T,
      customNote: "Chào {user}! Ticket #{number} của {server}.",
      openerName: "ban",
      number: 7,
      serverName: "Protogon",
      customColor: "00FF00",
    }).d;
    check(
      "lời dặn: điền {user} {number} {server}",
      note.description === "Chào ban! Ticket #7 của Protogon.",
      note.description,
    );
    check("lời dặn: dùng màu tuỳ chỉnh", note.color === 0x00ff00, String(note.color));
    check(
      "lời dặn: có tiêu đề để thành viên biết đây là gì",
      note.title === T.openNoteTitle,
      note.title,
    );
  }
  {
    const note = tickets.openNoteEmbed({
      T,
      customNote: "@everyone phản hồi nhanh",
      openerName: "u",
      number: 1,
      serverName: "S",
    }).d;
    check(
      "lời dặn: escape mention trong nội dung chủ soạn",
      !note.description.includes("@everyone"),
      note.description,
    );
  }
  {
    const note = tickets.openNoteEmbed({ T, customNote: "abc", customColor: "#GGG" }).d;
    check(
      "lời dặn: màu rác → màu mặc định, KHÔNG ném",
      typeof note.color === "number",
      String(note.color),
    );
  }

  // ═════════ 8. DM khi mở ticket ═════════
  {
    const dm = tickets.openDmEmbed({
      T,
      guildId: "111",
      serverName: "Protogon",
      number: 7,
      channelId: "222",
    }).d;
    check(
      "DM mở: link phải có CẢ guildId lẫn channelId",
      dm.description.includes("https://discord.com/channels/111/222"),
      dm.description,
    );
    check("DM mở: điền số ticket", dm.description.includes("#7"), dm.description);
    check("DM mở: có tiêu đề", dm.title === T.openDmTitle, dm.title);
  }
  {
    const dm = tickets.openDmEmbed({
      T,
      guildId: "1",
      serverName: "S@everyone",
      number: 1,
      channelId: "2",
    }).d;
    check(
      "DM mở: escape tên server (tên server có thể chứa @everyone)",
      !dm.description.includes("@everyone"),
      dm.description,
    );
  }
  {
    const client = makeClient();
    const ok = await tickets.sendOpenDm(client, { id: "u1" }, { embeds: ["x"] });
    check("DM mở: gửi thành công → true", ok === true && client.dms.length === 1);
  }
  {
    // Người dùng tắt tin nhắn riêng: nuốt lỗi, KHÔNG ném ra ngoài.
    const client = makeClient({ dmFails: true });
    const ok = await tickets.sendOpenDm(client, { id: "u1" }, { embeds: ["x"] });
    check("DM mở: DM hỏng → false, KHÔNG ném (best-effort)", ok === false);
  }
  {
    const client = makeClient();
    client.users.fetch = async () => {
      throw new Error("Unknown User");
    };
    const ok = await tickets.sendOpenDm(client, { id: "u1" }, { embeds: ["x"] });
    check("DM mở: không fetch được user → false, KHÔNG ném", ok === false);
  }

  // ═════════ Ô CHỌN MÀU PHẢI PHẢN ÁNH TRẠNG THÁI ĐÃ LƯU ═════════
  // Ô màu + ô hex dùng defaultValue (đúng quy ước của file, tránh spam
  // mutation mỗi bước kéo chuột) — nhưng defaultValue KHÔNG tự cập nhật khi
  // giá trị đã lưu thay đổi. Không có `key` gắn với giá trị thì bấm "Mặc định"
  // hay gõ hex sai bị từ chối: DB đã xoá màu, màn hình vẫn hiện màu/mã cũ →
  // người dùng tưởng thay đổi chưa có hiệu lực rồi bấm lại.
  const panelSrc = fs.readFileSync(
    path.join(__dirname, "..", "src", "components", "dashboard", "TicketPanel.tsx"),
    "utf8",
  );
  check(
    "ô chọn màu có key theo giá trị đang lưu (remount khi đổi màu)",
    /key=\{`swatch-\$\{g\.ticketOpenPanelColor \?\? "none"\}`\}/.test(panelSrc),
  );
  check(
    "ô hex có key theo giá trị đang lưu",
    /key=\{`hex-\$\{g\.ticketOpenPanelColor \?\? "none"\}`\}/.test(panelSrc),
  );

  // ═════════ TRANSCRIPT PHẢI CÓ NƠI XEM ═════════
  // Bot lưu transcript vào storage rồi xoá kênh. Trước 28/09/2026 query
  // `ticketTranscriptUrl` tồn tại mà KHÔNG nơi nào gọi → staff thấy badge
  // "Transcript đã lưu" rồi không làm được gì, và bản ghi `locked` không có
  // tab nào liệt kê nên transcript biến mất khỏi dashboard.
  check(
    "panel có nút mở transcript (dùng action tải nội dung)",
    /onClick=\{\(\) => onViewTranscript\(t\)\}/.test(panelSrc) &&
      /api\.tickets\.ticketTranscript/.test(panelSrc),
  );
  check(
    "panel có tab `locked` (ticket đã lưu trữ)",
    /value="locked"/.test(panelSrc) && /\["open", "closed", "locked"\]/.test(panelSrc),
  );
  check(
    "panel tải link tải file JSON (dùng được ticketTranscriptUrl)",
    /api\.tickets\.ticketTranscriptUrl/.test(panelSrc),
  );
  check(
    "khung transcript chỉ gọi query khi ĐANG MỞ (id rác sẽ ném validator)",
    /\{ticket && <TranscriptBody/.test(panelSrc) && !/skip: !ticket/.test(panelSrc),
  );

  fs.unlinkSync(DJS_MOCK);
  console.log(`\nKết quả ticket panel: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("Suite crash:", e);
  process.exit(1);
});
