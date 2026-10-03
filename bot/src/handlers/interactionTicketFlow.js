// Lớp DẪN KẾT ticket của bot — tách từ handlers/interactionCreate.js (đợt #5 tách
// monolith — 03/10/2026). Chỉ CHUYỂN CHỖ code, không đổi hành vi.
//
// Gồm: nút mở trên panel, modal nội dung, nút trong DM sau ban, modal khiếu nại,
// nút thao tác trong kênh ticket (nhận/đóng/gỡ ban/ghi chú AI), lệnh `/ticket`
// và `/ticket cua-toi`, kèm helper `renderError`/`core_isStaff`/`logTicketAction`.
//
// `handlers/interactionCreate.js` chỉ còn định tuyến customId sang các hàm dưới
// đây; logic ticket nằm trọn ở module này để dễ đọc/sửa.

const { EmbedBuilder, Colors } = require("discord.js");
const { sendModLog } = require("../util");
const { unbanMember } = require("./modTools");
const tickets = require("./tickets");
const ticketCore = require("../ticketCore");
const lang = require("./lang");

/**
 * TICKET — nút MỞ trên panel dán ở kênh công khai.
 *
 * Bấm nút chỉ mở modal hỏi, KHÔNG tạo kênh ngay: tạo kênh rồi mới nhắn nội
 * dung nghĩa là staff phải chờ, còn thành viên thấy một kênh trống rỗng.
 * (Cùng cách Ticket Tool V2 làm, nhưng ở đây modal hỏi sẵn nên không cần chủ
 * server tự tạo câu hỏi.)
 */
async function ticketOpenButton(client, store, interaction) {
  const guild = interaction.guild;
  if (!guild)
    return interaction.reply({ content: "Lệnh này chỉ hoạt động trong server.", ephemeral: true });
  const config = await store.getConfig(guild.id);
  const T = lang.ticketText(tickets.langFor(interaction, guild));
  if (!config?.ticketEnabled) {
    return interaction.reply({ content: T.errDisabled, ephemeral: true });
  }
  if (interaction.user.bot) {
    return interaction.reply({ content: T.errBotAccount, ephemeral: true });
  }
  // Key lấy NGUYÊN VẸN từ customId (không ép về 2 giá trị cứng) rồi mới tra
  // danh sách loại của server. Nút cũ dán tay từ trước khi có loại tuỳ chỉnh
  // vẫn phải mở được — `normalizeKind` lo phần "key không còn tồn tại".
  const kinds = ticketCore.normalizeKinds(config?.ticketKinds, T);
  const kind = ticketCore.normalizeKind(interaction.customId.slice("ticket_open:".length), kinds);
  return interaction.showModal(tickets.openModal(T, kind, kinds));
}

/** TICKET — modal nội dung sau khi bấm nút trên panel: mở ticket cho thành viên. */
async function ticketOpenSubmitModal(client, store, interaction) {
  const guild = interaction.guild;
  if (!guild)
    return interaction.reply({ content: "Lệnh này chỉ hoạt động trong server.", ephemeral: true });
  const body = interaction.fields.getTextInputValue("ticket_body");
  const evidence = interaction.fields.getTextInputValue("ticket_evidence");
  const T = lang.ticketText(tickets.langFor(interaction, guild));
  const config = await store.getConfig(guild.id);
  // Tra lại danh sách loại: giữa lúc mở nút và lúc bấm "Gửi", chủ server có
  // thể đã đổi tên/xoá loại đó. Không tra thì `openTicket` tự rơi về loại đầu
  // tiên — người dùng bấm "Khiếu nại" lại nhận ticket "Hỗ trợ".
  const kinds = ticketCore.normalizeKinds(config?.ticketKinds, T);
  const kind = ticketCore.normalizeKind(
    interaction.customId.slice("ticket_open_submit:".length),
    kinds,
  );
  if (!body || !body.trim()) {
    return interaction.reply({ content: T.aiEmpty, ephemeral: true });
  }
  // Ô bổ sung: đọc theo đúng danh sách loại (KHÔNG đọc hết interaction.fields —
  // customId do chủ server soạn qua bảng loại, đọc mù là tin vào dữ liệu rác).
  // Ô bắt buộc mà bỏ trống thì chặn ngay, không tạo kênh rỗng rồi mới báo lỗi.
  const spec = ticketCore.buildModalSpec(ticketCore.findKind(kinds, kind), T);
  const extraInput = {};
  const missingRequired = [];
  for (const f of spec.extraFields) {
    const raw = interaction.fields.getTextInputValue(f.customId);
    extraInput[f.key] = raw;
    if (f.required && !String(raw ?? "").trim()) missingRequired.push(f.label);
  }
  if (missingRequired.length > 0) {
    return interaction.reply({
      content: T.errRequiredFields.replace("{fields}", missingRequired.join(", ")),
      ephemeral: true,
    });
  }
  const extraValues = ticketCore.collectExtraValues(extraInput, spec);
  await interaction.deferReply({ ephemeral: true });
  const res = await tickets.openTicket({
    client,
    store,
    guild,
    user: interaction.user,
    kind,
    source: "panel",
    body,
    evidence,
    extraValues,
    T,
    // Mở từ trong server → người mở CẦN vào được kênh ticket của mình để đọc
    // trả lời. Khác điểm vào DM (người bị ban) vốn không vào được kênh nào.
    openerOnly: true,
  });
  if (!res.ok) {
    return interaction.editReply({ content: renderError(res, T) });
  }
  return interaction.editReply({ content: T.okOpened.replace("{ch}", `<#${res.channelId}>`) });
}

/**
 * TICKET — nút "Mở khiếu nại" trong DM sau khi bị ban.
 *
 * Modal KHÔNG có `guild` (nút nằm trong DM) → phải tự tra guild qua
 * `interaction.client.guilds.cache`. Đây là lý do hàm này không dùng
 * `interaction.guild` như các nhánh còn lại.
 */
async function ticketOpenDmButton(client, store, interaction) {
  // Cache có thể lỗi thời (bot vừa restart) → fetch tươi.
  const guild = interaction.guild
    ? interaction.guild
    : await client.guilds
        .fetch(interaction.channel?.guildId || interaction.guildId)
        .catch(() => null);
  // Nút này nằm trong DM → không có guild nào hợp lệ. Trả lời rõ thay vì
  // crash im lặng.
  if (!guild) {
    return interaction.reply({ content: "❌ Không tìm thấy server.", ephemeral: true });
  }
  const T = lang.ticketText(tickets.langFor(interaction, guild));
  const config = await store.getConfig(guild.id);
  if (!config?.ticketEnabled) {
    return interaction.reply({ content: T.errDisabled, ephemeral: true });
  }
  return interaction.showModal(tickets.appealModal(T));
}

/** TICKET — modal khiếu nại: ghi bản ghi + mở kênh staff-only. */
async function ticketAppealModal(client, store, interaction) {
  const body = interaction.fields.getTextInputValue("ticket_body");
  const evidence = interaction.fields.getTextInputValue("ticket_evidence");
  const guild = interaction.guild
    ? interaction.guild
    : await client.guilds
        .fetch(interaction.channel?.guildId || interaction.guildId)
        .catch(() => null);
  if (!guild) {
    return interaction.reply({ content: "❌ Không tìm thấy server.", ephemeral: true });
  }
  const T = lang.ticketText(tickets.langFor(interaction, guild));
  if (!body || !body.trim()) {
    return interaction.reply({ content: T.aiEmpty, ephemeral: true });
  }
  await interaction.deferReply({ ephemeral: true });

  const res = await tickets.openTicket({
    client,
    store,
    guild,
    user: interaction.user,
    kind: "appeal",
    source: "dm",
    body,
    evidence,
    T,
    // Người bị ban không vào được kênh nào → kênh ticket chỉ mở cho staff.
    openerOnly: false,
  });
  if (!res.ok) {
    const msg = renderError(res, T);
    await interaction.editReply({ content: `${msg}\n\n${T.dmFailed}` });
    return;
  }
  await interaction.editReply({ content: T.okSent });
}

/** TICKET — các nút thao tác trong kênh ticket (chỉ staff). */
async function ticketActionButton(client, store, interaction) {
  const parsed = tickets.parseTicketId(interaction.customId);
  if (!parsed) return;
  const guild = interaction.guild;
  if (!guild) return;
  const config = await store.getConfig(guild.id);
  const T = lang.ticketText(tickets.langFor(interaction, guild));

  // Quyền staff: ưu tiên role ticket, không có thì modRoles — cùng nguồn với
  // `canMod` đang dùng cho lệnh mod.
  //
  // ⚠️ NGOẠI LỆ: `ticket_close_own` là nút dành cho CHÍNH người mở ticket, và
  // phần lớn ticket hỗ trợ do thành viên (không phải staff) mở. Chặn staff ở
  // đây thì tính năng này chết với đúng đối tượng nó phục vụ, và họ nhận câu
  // "chủ server chưa cấu hình role staff" — hoàn toàn không liên quan (lỗi
  // thật 28/09/2026). Quyền của nút này do `row.openerId` quyết định, kiểm ở
  // nhánh đóng bên dưới.
  if (
    parsed.action !== "ticket_close_own" &&
    !core_isStaff(interaction.member, tickets.staffRoleIds(config))
  ) {
    return interaction.reply({ content: T.errNoStaff, ephemeral: true });
  }

  if (parsed.action === "ticket_pin") {
    try {
      const messages = await interaction.channel.messages.fetch({ limit: 50 });
      const first = messages.last();
      if (first) {
        await first.pin();
        return interaction.reply({ content: "📌 Đã ghim.", ephemeral: true });
      }
    } catch (e) {
      console.error(`[tickets] ghim thất bại:`, e.message);
    }
    return interaction.reply({ content: "❌ Chưa có tin nhắn để ghim.", ephemeral: true });
  }

  // Mở modal ghi chú AI. THIẾU nhánh này thì nút "Ghi chú AI" rơi xuống
  // nhánh cuối và báo "Ticket không còn trong hệ thống." — sai hoàn toàn, và
  // cả pipeline ghi chú AI (modal + prompt + escape) thành code chết.
  if (parsed.action === "ticket_ai") {
    return interaction.showModal(tickets.aiModal(T));
  }

  // ── Nhận việc / bỏ nhận ──
  // CHỈ 1 người nhận: 3 mod trả lời cùng một khiếu nại là người mở phải đọc
  // 3 câu mâu thuẫn. Người bấm sau bị từ chối kèm tên người đã nhận.
  if (parsed.action === "ticket_claim" || parsed.action === "ticket_unclaim") {
    if (!parsed.ticketId) return interaction.reply({ content: T.errNoStaff, ephemeral: true });
    if (parsed.action === "ticket_unclaim") {
      try {
        await store.client.mutation("bot_writes:botUnclaimTicket", {
          guildId: guild.id,
          ticketId: parsed.ticketId,
        });
      } catch (e) {
        console.error(`[tickets] bỏ nhận thất bại:`, e.message);
        return interaction.reply({ content: T.errUnknown, ephemeral: true });
      }
      await logTicketAction(guild, config, {
        title: "🎫 Bỏ nhận ticket",
        description: `${interaction.user.username} bỏ nhận ticket trong kênh này.`,
        color: Colors.Grey,
      });
      return interaction.reply({ content: T.unclaimDone, ephemeral: true });
    }
    let res;
    try {
      res = await store.client.mutation("bot_writes:botClaimTicket", {
        guildId: guild.id,
        ticketId: parsed.ticketId,
        staffId: interaction.user.id,
        staffName: interaction.user.username,
      });
    } catch (e) {
      console.error(`[tickets] nhận việc thất bại:`, e.message);
      return interaction.reply({ content: T.errUnknown, ephemeral: true });
    }
    if (res?.taken === false && res.alreadyMine) {
      return interaction.reply({ content: T.claimMine, ephemeral: true });
    }
    // Ticket đã đóng → nói đúng nguyên nhân. Rơi xuống nhánh dưới sẽ báo
    // "đã có {staff} nhận từ trước" với byName = null → "…có ? nhận…".
    if (res?.reason === "closed") {
      return interaction.reply({ content: T.claimClosed, ephemeral: true });
    }
    if (!res?.ok) {
      return interaction.reply({
        content: String(T.claimTaken).replace("{staff}", res?.byName || "?"),
        ephemeral: true,
      });
    }
    await logTicketAction(guild, config, {
      title: "🎫 Nhận ticket",
      description: `${interaction.user.username} nhận xử lý ticket trong kênh này.`,
      color: Colors.Green,
    });
    return interaction.reply({
      content: String(T.claimDone).replace("{staff}", interaction.user.username),
      ephemeral: true,
    });
  }

  // ── Đóng kèm lý do: mở modal, lý do bắt buộc ──
  if (parsed.action === "ticket_close_reason") {
    if (!parsed.ticketId) return interaction.reply({ content: T.errNoStaff, ephemeral: true });
    return interaction.showModal(tickets.closeReasonModal(T, parsed.ticketId));
  }

  // ── Đóng ticket / Gỡ ban / Tự đóng: cần biết AI mở ticket ──
  // Đọc bản ghi thật thay vì suy từ tên kênh hay topic: đây là dữ liệu duy
  // nhất, và tên kênh có thể do staff đổi tay.
  if (
    parsed.action === "ticket_close" ||
    parsed.action === "ticket_unban" ||
    parsed.action === "ticket_close_own"
  ) {
    if (!parsed.ticketId) {
      return interaction.reply({ content: T.errNoStaff, ephemeral: true });
    }
    let row;
    try {
      row = await client.query("tickets:botTicketById", {
        guildId: guild.id,
        ticketId: parsed.ticketId,
        botKey: process.env.PROTOGON_BOT_KEY || undefined,
      });
    } catch (e) {
      console.error(`[tickets] đọc bản ghi thất bại:`, e.message);
    }
    if (!row || row.status === "locked") {
      // KHÔNG dùng `errNoStaff` ở đây: đó là câu "chủ server chưa cấu hình
      // role staff" — hoàn toàn không liên quan tới việc bản ghi đã đóng,
      // và người mở bấm "Tôi tự đóng" cũng dính câu này.
      return interaction.reply({ content: T.errTicketGone, ephemeral: true });
    }
    //
    // ⚠️ `status: "closed"` VẪN cho thao tác. Lý do: dashboard đóng ticket chỉ
    // đổi trạng thái trong DB — kênh Discord giữ nguyên tên và quyền, chưa ai
    // thu quyền, chưa đổi tên. Nếu chặn ở đây thì staff đóng từ web rồi không
    // bao giờ khoá được kênh, không gỡ ban được qua nút "Gỡ ban" của ticket —
    // ngõ cụt do chính dashboard tạo ra (lỗi thật 28/09/2026).
    // `locked` = đã lưu transcript + xoá kênh → mọi nút chết hẳn, chặn.
    const wasOpen = row.status === "open";

    // Nút "Tôi tự đóng": chỉ CHÍNH người mở được bấm. Không kiểm tra thì bất
    // kỳ ai đọc được link kênh (staff paste vào kênh khác…) cũng đóng được
    // ticket của người khác — mất khiếu nại đang chờ trả lời.
    if (parsed.action === "ticket_close_own" && row.openerId !== interaction.user.id) {
      return interaction.reply({ content: T.closeOwnDenied, ephemeral: true });
    }

    let unbanned = false;
    if (parsed.action === "ticket_unban") {
      try {
        // GỌI `unbanMember`, KHÔNG gọi `guild.members.unban` trực tiếp: bên
        // trong nó gọi `misfire.noteRepealed` → vòng đo phạt nhầm chỉ chạy khi
        // đi đúng đường này.
        await unbanMember({
          guild,
          userId: row.openerId,
          executor: interaction.user,
          reason: "Gỡ ban qua ticket",
          guildConfig: config,
          store,
        });
        unbanned = true;
      } catch (e) {
        return interaction.reply({
          content: T.notBanned.replace("{user}", `<@${row.openerId}>`),
          ephemeral: true,
        });
      }
    }

    await tickets.closeTicketChannel({
      guild,
      channel: interaction.channel,
      openerId: row.openerId,
    });
    // CHỈ ghi lại khi ticket vốn còn `open`. Bấm Đóng lần nữa trên ticket đã
    // đóng (kể cả ticket dashboard đóng trước) sẽ ghi đè `closedAt` → đẩy lùi
    // thêm `closeGraceHours` lượt dọn kênh; bấm vài lần là kênh ticket không
    // bao giờ được dọn. Thao tác trên kênh (thu quyền + đổi tên) vẫn chạy, nó
    // idempotent và không phụ thuộc mốc thời gian.
    if (wasOpen) {
      await logTicketAction(guild, config, {
        title: "🔒 Đóng ticket",
        description: [
          `Đóng bởi: ${interaction.user.username}`,
          row.openerName ? `Người mở: ${row.openerName} (${row.openerId})` : "",
          unbanned ? "✅ Đã gỡ ban cho người mở" : "",
        ]
          .filter(Boolean)
          .join("\n"),
        color: Colors.Grey,
      });
      try {
        await store.client.mutation("bot_writes:botCloseTicket", {
          guildId: guild.id,
          ticketId: parsed.ticketId,
          status: "closed",
          closedById: interaction.user.id,
          closedByName: interaction.user.username,
          unbanned,
        });
      } catch (e) {
        console.error(`[tickets] ghi trạng thái thất bại:`, e.message);
      }
    }
    return interaction.reply({
      content:
        parsed.action === "ticket_close_own"
          ? T.closeOwnDone
          : `🔒 ${T.closedTitle} — ${T.closedBy} ${interaction.user.username}.`,
      ephemeral: true,
    });
  }

  return interaction.reply({ content: "⚠️ Ticket không còn trong hệ thống.", ephemeral: true });
}

/**
 * Ghi mod log cho hành động trên ticket.
 *
 * Vì sao cần: hành động ticket trước đây KHÔNG để lại dấu vết ngoài bản ghi
 * Convex — riêng "Gỡ ban" có log vì nó đi qua `unbanMember`. Khiếu nại bị bỏ
 * quên thì không có cách trả lời "ai đã đóng, đóng vì lý do gì" (28/09/2026).
 *
 * Nuốt lỗi: mod log là thông tin phụ, không được làm hỏng việc đóng ticket.
 */
async function logTicketAction(guild, config, { title, description, color }) {
  if (!guild || !config) return;
  try {
    await sendModLog(
      guild,
      config,
      new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setTimestamp(),
      undefined,
      "mod",
    );
  } catch (e) {
    console.error("[tickets] ghi mod log thất bại:", e.message);
  }
}

/** TICKET — modal ghi chú AI: gửi prompt cho model đọc tình hình ticket. */
/**
 * Modal "Đóng ticket kèm lý do".
 *
 * Lý do BẮT BUỘC (setRequired trong modal) vì nó hiện cho cả staff lẫn người
 * mở — đóng im lặng khiến người bị khiếu nại không biết kết quả là gì, và
 * chủ server mất dữ liệu để đánh giá người xử lý có đàng hoàng không.
 */
async function ticketCloseReasonModal(client, store, interaction) {
  const ticketId = interaction.customId.slice("ticket_close_reason_submit:".length);
  const guild = interaction.guild;
  if (!guild || !ticketId) return;
  const config = await store.getConfig(guild.id);
  const T = lang.ticketText(tickets.langFor(interaction, guild));
  if (!core_isStaff(interaction.member, tickets.staffRoleIds(config))) {
    return interaction.reply({ content: T.notStaff, ephemeral: true });
  }
  const raw = interaction.fields.getTextInputValue("ticket_close_reason_body");
  const reason = require("../ticketCore").sanitizeCloseReason(raw);
  if (!reason) {
    return interaction.reply({ content: T.reasonRequired, ephemeral: true });
  }
  let row;
  try {
    row = await client.query("tickets:botTicketById", {
      guildId: guild.id,
      ticketId,
      botKey: process.env.PROTOGON_BOT_KEY || undefined,
    });
  } catch (e) {
    console.error(`[tickets] đọc bản ghi thất bại:`, e.message);
  }
  if (!row || row.status !== "open") {
    return interaction.reply({ content: T.errUnknown, ephemeral: true });
  }
  await interaction.deferReply({ ephemeral: true });
  const res = await tickets.closeTicketWithReason({
    guild,
    channel: interaction.channel,
    store,
    ticketId,
    closedById: interaction.user.id,
    closedByName: interaction.user.username,
    reason,
    graceHours: config?.ticketCloseGraceHours,
    T,
  });
  return interaction.editReply({
    content: res.closed ? String(T.closedWithReason).replace("{reason}", reason) : T.errUnknown,
  });
}

async function ticketAiModal(client, store, interaction) {
  const note = interaction.fields.getTextInputValue("ticket_ai_body");
  const guild = interaction.guild;
  if (!guild) return;
  const T = lang.ticketText(tickets.langFor(interaction, guild));
  if (!note || !note.trim()) {
    return interaction.reply({ content: T.aiEmpty, ephemeral: true });
  }
  await interaction.deferReply({ ephemeral: true });
  try {
    // Dùng lại đúng đường AI sẵn có (`researchChat` + `researchAvailable`) —
    // không tạo client AI mới, không tự gọi provider. Cùng cơ chế giới hạn
    // tần suất và fallback mà incidentReport đang dùng.
    const ai = require("../ai");
    if (!ai.researchAvailable()) {
      return interaction.editReply({ content: "⚠️ AI chưa sẵn sàng." });
    }
    const answer = await ai.researchChat(
      [
        {
          role: "system",
          content:
            "Bạn trợ lý cho mod Discord. Tóm tắt ngắn gọn tình huống trong ghi chú ticket dưới đây, nêu rõ cần hỏi lại họ điều gì. Trả lời đúng ngôn ngữ của ghi chú.",
        },
        { role: "user", content: tickets.escapePayload(note) },
      ],
      { maxTokens: 400, temperature: 0.2, timeoutMs: 30_000 },
    );
    return interaction.editReply({ content: answer || T.aiEmpty });
  } catch (e) {
    console.error(`[tickets] AI note lỗi:`, e.message);
    return interaction.editReply({ content: "❌ AI lỗi: " + e.message });
  }
}

/** Bọc `core.isStaff` — import lazy để tránh vòng require. */
function core_isStaff(member, staffIds) {
  return require("../ticketCore").isStaff(member, staffIds);
}

/**
 * Lệnh `/ticket` — ĐIỂM VÀO B (thành viên đang ở trong server).
 *
 * Không mở được cho người đã bị ban: họ không vào được kênh nào của server, kể
 * cả kênh ticket. Đường cho nhóm đó là nút trong DM mà bot gửi kèm khi ban —
 * vì vậy thông báo ở đây trỏ thẳng về hướng đó thay vì chỉ chặn bằng ❌.
 */
async function ticketCommand(client, store, interaction, guild) {
  const T = lang.ticketText(tickets.langFor(interaction, guild));
  const config = await store.getConfig(guild.id);

  // KHÔNG gọi `guild.bans.fetch()` ở đây: Discord đã chặn sẵn — người bị ban
  // không gọi được slash command trong server, interaction không tới được bot.
  // Hỏi ban tốn 1 HTTP call mỗi lượt gọi lệnh để rồi luôn nhận false.
  if (interaction.user.bot) {
    return interaction.reply({ content: T.errBotAccount, ephemeral: true });
  }
  if (!config?.ticketEnabled) {
    return interaction.reply({ content: T.errDisabled, ephemeral: true });
  }

  const sub = interaction.options.getSubcommand();
  // Tên subcommand đăng ký trong slash.js là tiếng Việt không dấu: `dong`,
  // `khieunai`, `cua-toi`. Trước đây handler so với `close`/`appeal` (tên EN)
  // → `/ticket dong` rơi xuống nhánh mở ticket và MỞ NHẦM một ticket thật,
  // còn `/ticket khieunai` mở ticket hỗ trợ thay vì khiếu nại (28/09/2026).
  // Nhận cả hai bộ tên để không vỡ nếu server đã đăng ký bản cũ.
  if (sub === "dong" || sub === "close") {
    return interaction.reply({
      content:
        "Đóng ticket bằng nút **Đóng** trong chính kênh ticket — nút đó còn thu quyền người mở và ghi log.",
      ephemeral: true,
    });
  }
  if (sub === "cua-toi") {
    return myTicketReply(store, interaction, guild);
  }

  const kind =
    sub === "khieunai" || sub === "appeal"
      ? "appeal"
      : config.ticketDefaultKind === "appeal"
        ? "appeal"
        : "support";
  const res = await tickets.openTicket({
    client,
    store,
    guild,
    user: interaction.user,
    kind,
    source: "command",
    body: interaction.options.getString("chude") || "",
    T,
    openerOnly: true,
  });

  if (!res.ok) {
    return interaction.reply({ content: renderError(res, T), ephemeral: true });
  }
  return interaction.reply({
    content: T.okOpened.replace("{ch}", `<#${res.channelId}>`),
    ephemeral: true,
  });
}

/**
 * `/ticket cua-toi` — trả lại ticket đang mở của chính người gọi.
 *
 * Vì sao cần: lệnh `/ticket mo` gửi link kênh qua DM. Người dùng tắt DM
 * (rất phổ biến) hoặc xoá tin nhắn là mất đường quay lại kênh của mình —
 * không có lệnh nào chỉ ra kênh đó (28/09/2026). Nay `/ticket cua-toi` hỏi
 * thẳng DB nên không phụ thuộc DM.
 *
 * Trả về kênh + link. Cố tình ephemeral: người gọi tự thấy kênh của mình,
 * không cần quyền xem kênh người khác.
 */
async function myTicketReply(store, interaction, guild) {
  const T = lang.ticketText(tickets.langFor(interaction, guild));
  let state;
  try {
    state = await store.client.query("tickets:botTicketState", {
      guildId: guild.id,
      userId: interaction.user.id,
      botKey: process.env.PROTOGON_BOT_KEY || undefined,
    });
  } catch (e) {
    console.error("[tickets] xem ticket của mình lỗi:", e.message);
    return interaction.reply({ content: T.errUnknown, ephemeral: true });
  }
  const channelId = state?.openChannelId;
  if (!channelId) {
    return interaction.reply({ content: T.myTicketNone, ephemeral: true });
  }
  // Bản ghi còn `open` nhưng kênh đã bị xoá tay: báo đúng sự thật thay vì đưa
  // link chết (link tới kênh không tồn tại mở ra trang trắng).
  const ch = guild.channels?.cache?.get(channelId);
  if (!ch) {
    return interaction.reply({ content: T.myTicketGone, ephemeral: true });
  }
  return interaction.reply({
    content: T.myTicket
      .replace("{ch}", `<#${channelId}>`)
      .replace("{link}", `https://discord.com/channels/${guild.id}/${channelId}`),
    ephemeral: true,
  });
}

/** Dựng câu báo lỗi từ mã của `openTicket` + bảng chuỗi đã dịch. */
function renderError(res, T) {
  if (res.code === "errCooldown") return T.errCooldown.replace("{h}", String(res.waitHours ?? 1));
  if (res.code === "errMaxOpen") {
    return T.errMaxOpen
      .replace("{n}", String(res.count ?? 0))
      .replace("{max}", String(res.max ?? 0));
  }
  if (res.code === "errAlreadyOpen" && res.channelId) {
    return T.errAlreadyOpen.replace("{ch}", `<#${res.channelId}>`);
  }
  if (res.code === "errHierarchy") return T.errHierarchy;
  if (res.code === "MAX_CHANNELS") return T.errChannelsFull;
  return T[res.code] || T.errNoPerm;
}

module.exports = {
  ticketOpenButton,
  ticketOpenSubmitModal,
  ticketOpenDmButton,
  ticketAppealModal,
  ticketActionButton,
  ticketCloseReasonModal,
  ticketAiModal,
  ticketCommand,
};
