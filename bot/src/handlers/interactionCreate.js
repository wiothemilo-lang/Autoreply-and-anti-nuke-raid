const {
  EmbedBuilder,
  Colors,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { canManageGuild, isAdmin, canManageWithConfig, sendLog, sendModLog } = require("../util");
const { isLocked, markLocked, unlockGuild } = require("../lockdown");
const channelLock = require("../channelLock");
const { emojiKeyOf } = require("./hidden");
const {
  parseDuration,
  canMod,
  timeoutMember,
  kickMember,
  banMember,
  purgeChannel,
  untimeoutMember,
  unbanMember,
  unwarnMember,
} = require("./modTools");

const MODULES = [
  "massBan",
  "massKick",
  "massJoin",
  "massChannelCreate",
  "massChannelDelete",
  "massRoleCreate",
  "massRoleDelete",
  "massMessageDelete",
  "massWebhookCreate",
  "massThreadCreate",
  "spam",
  "massMessage",
  "blankNoise",
  "mention",
  "badword",
  "attachment",
  "invite",
  "malware",
];

function needPerm(interaction) {
  return interaction.reply({
    content:
      "❌ Bạn không có quyền dùng lệnh này — cần quyền **Quản lý server** hoặc role **Mod/Admin** được cấu hình qua `/setup`.",
    ephemeral: true,
  });
}

/** Phân tích chuỗi "emoji:role emoji:role" (role là ID hoặc <@&id> hoặc tên role). */
function parsePairs(pairsRaw, guild) {
  if (!pairsRaw) return [];
  const entries = [];
  const tokens = String(pairsRaw).split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const idx = token.lastIndexOf(":");
    if (idx <= 0 || idx === token.length - 1) continue;
    const emoji = token.slice(0, idx).trim();
    let roleId = token
      .slice(idx + 1)
      .trim()
      .replace(/^<@&(\d+)>$/, "$1");
    if (!emoji) continue;
    if (!/^\d{15,20}$/.test(roleId)) {
      const role = guild?.roles.cache.find((r) => r.name.toLowerCase() === roleId.toLowerCase());
      if (role) roleId = role.id;
    }
    if (!/^\d{15,20}$/.test(roleId)) continue;
    entries.push({ emoji, roleId });
  }
  return entries.slice(0, 20);
}

const { genCaptcha, setCode } = require("../captchaStore");
const { analyzeNewMember, executePunishment, buildRiskEmbed } = require("../altDetection");
const { reportInteractive } = require("./incidentReport");
const researchHandlers = require("./researchCommands");
const tickets = require("./tickets");
const ticketCore = require("../ticketCore");
const lang = require("./lang");

// Rate limiting for verify attempts: Map<userId, { attempts: number, lastAttemptAt: number }>
// Trạng thái rate-limit xác minh (3 lần / 10 phút cho mỗi user). Hiện chưa có
// nơi gọi hàm kiểm tra — dọn dẹp định kỳ bên dưới giữ Map sạch cho tương lai.
const verifyAttempts = new Map();
const VERIFY_RATE_WINDOW_MS = 10 * 60 * 1000;

// Cleanup old entries every 5 minutes
setInterval(
  () => {
    const cutoff = Date.now() - VERIFY_RATE_WINDOW_MS;
    for (const [userId, data] of verifyAttempts) {
      if (data.lastAttemptAt < cutoff) verifyAttempts.delete(userId);
    }
  },
  5 * 60 * 1000,
);

/**
 * `/lock` — khoá chat của chủ server (một kênh, tất cả, theo role, tự mở hạn).
 *
 * Lý do tách khỏi `lockdown.js`: đó là khoá TOÀN SERVER khi raid, chỉ
 * @everyone, do bot tự quyết. Lệnh này là thao tác chủ động của người quản
 * trị, nhận role và thời lượng — và phải KHÔI PHỤC ĐÚNG quyền cũ (xem
 * `channelLock.js`).
 */
async function lockCommand(client, store, interaction) {
  const guild = interaction.guild;
  if (!guild)
    return interaction.reply({ content: "Lệnh này chỉ hoạt động trong server.", ephemeral: true });
  if (!canManageGuild(interaction.member) && !isAdmin(interaction.member))
    return needPerm(interaction);
  if (!channelLock.botCanManageChannels(guild)) {
    return interaction.reply({
      content:
        "⚠️ Bot thiếu quyền **Quản lý kênh** (Manage Channels) nên không khoá/mở khoá được. Hãy cấp quyền cho bot.",
      ephemeral: true,
    });
  }

  const sub = interaction.options.getSubcommand();
  const config = await store.getConfig(guild.id);
  const botKey = process.env.PROTOGON_BOT_KEY || undefined;
  const target = channelLock.resolveTargetRole(guild, interaction.options.getRole("role", false));
  if (!target.ok) return interaction.reply({ content: `❌ ${target.error}`, ephemeral: true });
  const who = `${interaction.user.username}`;

  // ── /lock list ──
  if (sub === "list") {
    const rows = await store.client
      .query("channelLocks:botChannelLocks", { guildId: guild.id, botKey })
      .catch(() => []);
    if (!rows || rows.length === 0) {
      return interaction.reply({
        content: "✅ Không có kênh nào đang bị Protogon khoá.",
        ephemeral: true,
      });
    }
    const lines = rows.slice(0, 20).map((r) => {
      const ch = guild.channels.cache.get(r.channelId);
      const dur =
        r.until === null || r.until === undefined
          ? "vô hạn"
          : channelLock.formatLockDuration(Math.max(1, Math.round((r.until - Date.now()) / 60000)));
      return `🔒 ${channelLock.channelLabel(ch)} — ${channelLock.roleLabel(guild, r.roleId)} · ${dur}`;
    });
    if (rows.length > 20) lines.push(`… và ${rows.length - 20} kênh nữa.`);
    return interaction.reply({
      content: lines.join("\n").slice(0, 1900),
      ephemeral: true,
    });
  }

  // ── Thời lượng: rỗng = VÔ HẠN ──
  let minutes = null;
  if (sub === "add" || sub === "all") {
    const parsed = channelLock.parseLockMinutes(interaction.options.getString("phut", false));
    if (!parsed.ok) return interaction.reply({ content: `❌ ${parsed.error}`, ephemeral: true });
    minutes = parsed.minutes;
  }

  // ── Mở khoá ──
  if (sub === "remove" || sub === "unlock-all") {
    const existing =
      (await store.client
        .query("channelLocks:botChannelLocks", { guildId: guild.id, botKey })
        .catch(() => [])) || [];
    const wanted = new Set(
      existing.filter((r) => r.roleId === target.roleId).map((r) => r.channelId),
    );
    if (sub === "remove") {
      const channel = interaction.options.getChannel("kenh", true);
      // ⚠️ Chỉ mở khoá kênh MÌNH CÓ bản ghi khoá. Thêm vô điều kiện sẽ khiến
      // nhánh "không do Protogon khoá" bên dưới chết cụt — và đó chính là
      // chỗ ngăn bot xoá cấu hình riêng của chủ server.
      wanted.clear();
      if (existing.some((r) => r.channelId === channel.id && r.roleId === target.roleId)) {
        wanted.add(channel.id);
      }
    }
    if (wanted.size === 0) {
      return interaction.reply({
        content: `Kênh này không do Protogon khoá — mình KHÔNG tự mở quyền để tránh xoá nhầm cấu hình của bạn. Hãy mở trực tiếp trong Discord.`,
        ephemeral: true,
      });
    }
    const records = existing.filter((r) => wanted.has(r.channelId) && r.roleId === target.roleId);
    const out = await channelLock.releaseLocks({
      client,
      guild,
      records,
      store,
      botKey,
    });
    if (out.failed.length) {
      return interaction.reply({
        content: `⚠️ Mở được ${out.restored.length} kênh nhưng có lỗi: ${out.failed.join(" | ").slice(0, 800)}`,
        ephemeral: true,
      });
    }
    await sendLog(
      guild,
      config,
      channelLock.lockLogEmbed({
        action: "unlock",
        channelNames: out.restored,
        roleLabel: target.everyone ? "@everyone" : channelLock.roleLabel(guild, target.roleId),
        duration: null,
        actor: who,
      }),
    );
    return interaction.reply({
      content:
        `🔓 Đã mở khoá ${out.restored.length} kênh.` +
        (out.missing.length ? ` ${out.missing.length} kênh không còn tồn tại (đã dọn).` : ""),
      ephemeral: true,
    });
  }

  // ── Khoá ──
  const existing =
    (await store.client
      .query("channelLocks:botChannelLocks", { guildId: guild.id, botKey })
      .catch(() => [])) || [];
  const alreadyLocked = new Set(
    existing.filter((r) => r.roleId === target.roleId).map((r) => r.channelId),
  );
  const reason = (interaction.options.getString("lydo", false) || "").slice(0, 200);
  const until = minutes === null ? undefined : Date.now() + minutes * 60_000;

  const targets =
    sub === "add"
      ? (() => {
          const channel = interaction.options.getChannel("kenh", true);
          const kind = channelLock.channelLockKind(channel);
          return kind ? [{ channel, kind }] : [];
        })()
      : channelLock.collectChatChannels(guild);

  if (targets.length === 0) {
    return interaction.reply({
      content:
        sub === "add"
          ? "❌ Không khoá được kênh này (danh mục, thread, hoặc kênh bot không có quyền sửa)."
          : "❌ Server không có kênh chat nào để khoá.",
      ephemeral: true,
    });
  }

  const done = [];
  const skipped = [];
  const failed = [];
  for (const { channel, kind } of targets) {
    if (alreadyLocked.has(channel.id)) {
      skipped.push(channelLock.channelLabel(channel));
      continue;
    }
    const r = await channelLock.lockChannel({ channel, roleId: target.roleId, kind });
    if (!r.ok) {
      failed.push(`${channelLock.channelLabel(channel)}: ${r.error}`);
      continue;
    }
    // Chỉ ghi bản ghi SAU khi ghi quyền thành công — bản ghi mà không khoá
    // được thì lúc mở sẽ "khôi phục" một thứ chưa từng bị đổi.
    //
    // ⚠️ Ngược lại, ghi bản ghi HỎNG sau khi đã ghi quyền thì kênh bị khoá mà
    // không có dấu vết nào để mở lại — chủ server phải tự vào Discord gỡ tay.
    // Nên hoàn tác quyền ngay khi lưu thất bại, đừng để lệ ở trạng thái nửa vời.
    try {
      await store.client.mutation("channelLocks:botSaveChannelLock", {
        botKey,
        guildId: guild.id,
        channelId: channel.id,
        roleId: target.roleId,
        kind,
        prev: r.prev ?? null,
        until,
        reason: reason || undefined,
        lockedBy: interaction.user.id,
      });
    } catch (e) {
      await channelLock
        .unlockChannel({ channel, roleId: target.roleId, kind, prev: r.prev })
        .catch(() => {});
      failed.push(
        `${channelLock.channelLabel(channel)}: lưu thất bại, đã trả lại quyền (${e?.message || e})`,
      );
      continue;
    }
    done.push(channelLock.channelLabel(channel));
  }

  if (done.length === 0) {
    return interaction.reply({
      content:
        (skipped.length ? `Các kênh này đã bị khoá rồi: ${skipped.join(", ")}. ` : "") +
        (failed.length ? `Lỗi: ${failed.join(" | ").slice(0, 800)}` : ""),
      ephemeral: true,
    });
  }
  if (done.length) {
    await sendLog(
      guild,
      config,
      channelLock.lockLogEmbed({
        action: "lock",
        channelNames: done.slice(0, 20),
        roleLabel: target.everyone ? "@everyone" : channelLock.roleLabel(guild, target.roleId),
        duration: minutes,
        reason,
        actor: who,
      }),
    );
  }
  const notes = [];
  if (skipped.length) notes.push(`${skipped.length} kênh đã khoá sẵn (bỏ qua).`);
  if (failed.length) notes.push(`${failed.length} kênh lỗi: ${failed.join(" | ").slice(0, 600)}`);
  return interaction.reply({
    content:
      `🔒 Đã khoá ${done.length} kênh` +
      ` (${channelLock.formatLockDuration(minutes)}, ${target.everyone ? "@everyone" : channelLock.roleLabel(guild, target.roleId)}).` +
      (notes.length ? `\n` + notes.join("\n") : ""),
    ephemeral: true,
  });
}

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

module.exports = async function onInteractionCreate(client, interaction, store, heat) {
  // Handle button interactions (verify_confirm + verify_request_captcha)
  if (interaction.isButton()) {
    if (interaction.customId === "verify_request_captcha") {
      const guild = interaction.guild;
      if (!guild) return;
      const config = await store.getConfig(guild.id);
      if (!config?.verifyEnabled) {
        return interaction.reply({ content: "❌ Xác minh đã bị tắt.", ephemeral: true });
      }
      const unverifiedRoleId = config.unverifiedRoleId;
      if (!unverifiedRoleId) {
        return interaction.reply({ content: "❌ Chưa cấu hình role xác minh.", ephemeral: true });
      }
      const member =
        guild.members.cache.get(interaction.user.id) ||
        (await guild.members.fetch(interaction.user.id).catch(() => null));
      if (!member) {
        return interaction.reply({ content: "❌ Không tìm thấy thành viên.", ephemeral: true });
      }
      if (!member.roles.cache.has(unverifiedRoleId)) {
        return interaction.reply({ content: "✅ Bạn đã xác minh rồi!", ephemeral: true });
      }
      // RATE-LIMIT 3 lần/10 phút/user (verifyAttempts): chặn spam bấm nút nhận
      // mã — bot gửi DM mã mỗi lần bấm, kẻ xấu dùng bot làm vòi DM phiền người.
      // Entry cũ của Map có vòng dọn 5 phút sẵn bên dưới; kiểm tra + ghi tại đây.
      {
        const attempts = verifyAttempts.get(interaction.user.id);
        if (attempts && Date.now() - attempts.lastAttemptAt < VERIFY_RATE_WINDOW_MS) {
          if (attempts.attempts >= 3) {
            return interaction.reply({
              content: "⏳ Bạn đã yêu cầu mã quá nhiều lần — thử lại sau khoảng 10 phút.",
              ephemeral: true,
            });
          }
          attempts.attempts += 1;
          attempts.lastAttemptAt = Date.now();
        } else {
          verifyAttempts.set(interaction.user.id, { attempts: 1, lastAttemptAt: Date.now() });
        }
      }
      // Tạo mã captcha và gửi DM
      const code = genCaptcha();
      setCode(guild.id, interaction.user.id, code);
      try {
        const dmEmbed = new EmbedBuilder()
          .setColor(Colors.Blue)
          .setTitle("🔑 Mã xác minh")
          .setDescription(`Mã xác minh của bạn trong **${guild.name}** là:`)
          .addFields({ name: "Mã", value: `||${code}||`, inline: true })
          .setFooter({ text: "Mã hết hạn trong 5 phút. Nhập mã trong kênh xác minh để hoàn tất." });
        await member.send({ embeds: [dmEmbed] });
        return interaction.reply({
          content:
            "✅ Đã gửi mã xác minh qua DM! Hãy kiểm tra tin nhắn trực tiếp và nhập mã trong kênh xác minh.",
          ephemeral: true,
        });
      } catch {
        return interaction.reply({
          content:
            '❌ Không thể gửi DM — hãy bật "cho phép tin nhắn trực tiếp" từ thành viên server rồi thử lại.',
          ephemeral: true,
        });
      }
    }
    if (interaction.customId === "verify_confirm") {
      const guild = interaction.guild;
      if (!guild) return;
      const config = await store.getConfig(guild.id);
      if (!config?.verifyEnabled) {
        return interaction.reply({ content: "❌ Xác minh đã bị tắt.", ephemeral: true });
      }
      const unverifiedRoleId = config.unverifiedRoleId;
      const verifiedRoleId = config.verifiedRoleId;
      if (!unverifiedRoleId || !verifiedRoleId) {
        return interaction.reply({ content: "❌ Chưa cấu hình role xác minh.", ephemeral: true });
      }
      const member =
        guild.members.cache.get(interaction.user.id) ||
        (await guild.members.fetch(interaction.user.id).catch(() => null));
      if (!member) {
        return interaction.reply({ content: "❌ Không tìm thấy thành viên.", ephemeral: true });
      }
      if (!member.roles.cache.has(unverifiedRoleId)) {
        return interaction.reply({
          content: "❌ Bạn không có role chưa xác minh nên không thể xác minh.",
          ephemeral: true,
        });
      }
      try {
        // === ALT DETECTION AT VERIFY GATE (Double Counter style) ===
        if (config.altDetectionEnabled) {
          try {
            const analysis = await analyzeNewMember(
              member,
              config,
              (guildId) => store.getConfig(guildId),
              store,
            );
            const maxRisk = config.altMaxRiskScore ?? 70;
            if (analysis.riskScore >= maxRisk && analysis.action !== "pass") {
              // Execute punishment instead of verifying
              const punishResult = await executePunishment(member, analysis, config);

              // FIX: Fail-open — if punishment failed, allow verify anyway
              // instead of leaving user stuck (can't verify, can't be punished)
              if (!punishResult.executed) {
                console.log(
                  `[verify:alt] ${guild.name}/${member.user.username} — punish FAILED (${punishResult.reason}), allowing verify (fail-open)`,
                );
                // Fall through to normal verify flow
              } else {
                // Đánh dấu đã bị phạt để lần join sau đối chiếu (evasion detect).
                await store.client
                  .mutation("altDetection:markJoinPunished", {
                    guildId: guild.id,
                    userId: member.id,
                    action: punishResult.action,
                  })
                  .catch(() => {});

                // Reply to user with reason
                await interaction
                  .reply({
                    content: `❌ **Xác minh bị từ chối.** Tài khoản của bạn được đánh giá là có rủi ro cao (**${analysis.riskScore}/100**). Đã xử lý: ${punishResult.action}`,
                    ephemeral: true,
                  })
                  .catch(() => {});

                // Log to mod channel
                const { sendLog } = require("../util");
                const embed = buildRiskEmbed(member, analysis, punishResult);
                embed.setTitle("🚫 Alt Detected at Verify Gate");
                embed.setDescription(
                  `<@${member.id}> tried to verify but was blocked as alt account.\n\n` +
                    `**Risk Score:** ${analysis.riskScore}/100\n` +
                    `**Factors:** ${analysis.riskFactors.join(", ")}`,
                );
                await sendLog(guild, config, embed).catch(() => {});

                // Record as antinuke event
                await store.client
                  .mutation("bot_writes:botRecordAntinukeEvent", {
                    guildId: guild.id,
                    module: "altDetection",
                    executorId: member.id,
                    executorName: member.user.username,
                    action: `${punishResult.action} at verify gate — risk: ${analysis.riskScore}/100 — ${analysis.riskFactors.join(", ")}`,
                    count: 1,
                    windowSeconds: 60,
                    threshold: 1,
                    punish: analysis.action,
                  })
                  .catch(() => {});

                console.log(
                  `[verify:alt] ${guild.name}/${member.user.username} BLOCKED at verify — risk=${analysis.riskScore} action=${punishResult.action}`,
                );
                return;
              }
            }
          } catch (e) {
            console.error(`[verify:alt] ${guild.id}:`, e.message);
            // If alt detection fails, still allow verify (fail-open for UX)
          }
        }

        // Normal verify flow
        if (member.roles.cache.has(unverifiedRoleId)) {
          await member.roles.remove(unverifiedRoleId, "Xác minh thành công");
        }
        if (!member.roles.cache.has(verifiedRoleId)) {
          await member.roles.add(verifiedRoleId, "Xác minh thành công");
        }
        await interaction.reply({
          content: "✅ Đã xác minh thành công! Chào mừng bạn đến với server.",
          ephemeral: true,
        });
        // Gửi DM chào mừng nếu bật
        if (config.verifyWelcomeEnabled) {
          try {
            const title = config.verifyWelcomeTitle || "🌸 Chào mừng bạn!";
            let description =
              config.verifyWelcomeDescription ||
              `Chào mừng bạn đến với **${guild.name}**! Bạn đã xác minh thành công.`;
            description = description
              .replace(/{user}/g, `<@${member.id}>`)
              .replace(/{server}/g, guild.name);
            const colorHex = config.verifyWelcomeColor || "#f2629e";
            const colorInt = parseInt(colorHex.replace("#", ""), 16) || 0xf2629e;
            const welcomeEmbed = new EmbedBuilder()
              .setTitle(title)
              .setDescription(description)
              .setColor(colorInt)
              .setThumbnail(guild.iconURL({ size: 256 }) || null)
              .setFooter({ text: guild.name, iconURL: guild.iconURL({ size: 64 }) || undefined });
            await member.send({ embeds: [welcomeEmbed] }).catch(() => {});
          } catch (e) {
            // member có thể tắt DM — bỏ qua im lặng
          }
        }
      } catch (e) {
        console.error(`[verify:button] ${guild.id}:`, e.message);
        if (!interaction.replied) {
          await interaction
            .reply({ content: `❌ Lỗi xác minh: ${e.message}`, ephemeral: true })
            .catch(() => {});
        }
      }
      return;
    }
    // ─── TICKET: nút mở khiếu nại trong DM sau ban ───
    if (interaction.customId.startsWith("ticket_open:")) {
      return ticketOpenButton(client, store, interaction);
    }
    if (interaction.customId === "ticket_open_dm") {
      return ticketOpenDmButton(client, store, interaction);
    }
    if (interaction.customId.startsWith("ticket_")) {
      return ticketActionButton(client, store, interaction);
    }
    return;
  }

  // ─── TICKET: modal mở ticket từ panel kênh công khai ───
  if (interaction.isModalSubmit() && interaction.customId.startsWith("ticket_open_submit:")) {
    return ticketOpenSubmitModal(client, store, interaction);
  }
  // ─── TICKET: modal khiếu nại (sau nút trong DM) ───
  if (interaction.isModalSubmit() && interaction.customId === "ticket_appeal_dm") {
    return ticketAppealModal(client, store, interaction);
  }
  // ─── TICKET: modal ghi chú AI (nút trong kênh ticket) ───
  if (interaction.isModalSubmit() && interaction.customId === "ticket_ai_note") {
    return ticketAiModal(client, store, interaction);
  }
  // ─── TICKET: modal đóng kèm lý do ───
  if (
    interaction.isModalSubmit() &&
    interaction.customId.startsWith("ticket_close_reason_submit:")
  ) {
    return ticketCloseReasonModal(client, store, interaction);
  }

  if (!interaction.isChatInputCommand()) return;

  const name = interaction.commandName;
  const guild = interaction.guild;

  // `/language` là lệnh DUY NHẤT chạy được trong DM: người bị ban không vào
  // được kênh nào của server, nhưng họ vẫn cần đổi ngôn ngữ cho các lần
  // khiếu nại sau. Vì vậy nó được miễn qua chặn guild bên dưới.
  if (!guild && name !== "language") {
    return interaction.reply({ content: "Lệnh này chỉ hoạt động trong server.", ephemeral: true });
  }

  switch (name) {
    case "report": {
      // Báo cáo tình hình: AI quét hàng trăm tin nhắn + dữ liệu phạt 24h, công
      // bố kết quả cho server (mọi thành viên đều được dùng).
      return reportInteractive(client, store, interaction);
    }

    case "research": {
      return researchHandlers.handleResearch(client, store, interaction);
    }

    case "ticket": {
      // Điểm vào B: thành viên đang ở trong server mở ticket (hỏi đáp / báo cáo
      // chung, hoặc khiếu nại nếu chọn loại appeal).
      return ticketCommand(client, store, interaction, guild);
    }

    case "ping": {
      const ws = Math.round(client.ws.ping);
      return interaction.reply({ content: `🏓 Pong! **${ws}ms** (WebSocket)`, ephemeral: true });
    }

    // `/language` — miễn qua chặn guild ở trên nên chạy được cả trong DM.
    case "language": {
      return lang.languageCommand(store, interaction);
    }

    case "health": {
      // Sức khỏe AI (mod/admin): bức tranh trạng thái hệ AI chống raid — không
      // lộ key. aiStats() là hàm thuần đọc (0 token, 0 I/O) nên lệnh luôn trả
      // lời nhanh, kể cả khi mọi provider đang sập.
      if (!canManageWithConfig(interaction.member, await store.getConfig(guild.id)))
        return needPerm(interaction);
      const ai = require("../ai");
      const ws = Math.round(client.ws.ping);
      const stats = typeof ai.aiStats === "function" ? ai.aiStats() : null;
      const embed = new EmbedBuilder()
        .setColor(Colors.Aqua)
        .setTitle("🩺 Sức khỏe Protogon")
        .setDescription(`WebSocket: **${ws}ms**`);
      if (!stats) {
        embed.addFields({ name: "AI", value: "không có dữ liệu (bản bot cũ)", inline: false });
      } else if (!stats.available) {
        embed.addFields({
          name: "AI",
          value:
            "⚠️ Chưa cấu hình key nào — bot chạy theo điểm nghi vấn deterministic (an toàn, không AI)",
          inline: false,
        });
      } else {
        const providerLines = stats.providers.map((p) => {
          const cooldown = p.inCooldown ? " ⚠️ đang cooldown (fail liên tiếp)" : " ✅";
          return `• ${p.label} (${p.model})${cooldown}`;
        });
        embed.addFields(
          { name: "Providers", value: providerLines.join("\n").slice(0, 1024), inline: false },
          {
            name: "Hoạt động",
            value: `Cache verdict: **${stats.verdictCacheSize}** mục · Gọi/phút: **${stats.callsLastMinute}** · Đang chạy: **${stats.inFlight}**`,
            inline: false,
          },
        );
        if (stats.verdictsLastHour) {
          const v = stats.verdictsLastHour;
          embed.addFields({
            name: "Verdict 1 giờ qua",
            value: `Raid: **${v.raid ?? 0}** · Cá nhân: **${v.individual ?? 0}** · Benign: **${v.benign ?? 0}** · Lỗi/offline: **${v.offline ?? 0}** · Từ cache: **${v.cache ?? 0}**`,
            inline: false,
          });
        }
        if (stats.misfire) {
          const m = stats.misfire;
          const misfireLine = `Phạt nhầm 7 ngày (mod gỡ): **${m.misfires7d}**${m.misfires7d >= 5 ? " ⚠️ AI đang tự siết độ tin cậy" : ""}`;
          embed.addFields({ name: "Phạt nhầm đã xác nhận", value: misfireLine, inline: false });
        }
      }
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    case "help": {
      const embed = new EmbedBuilder()
        .setColor(Colors.Aqua)
        .setTitle("🧭 Lệnh của Protogon")
        .setDescription(
          [
            "**Auto Reply** — `/autoreply add` tạo rule từ khóa hoặc @mention, `/autoreply list`, `/autoreply remove`",
            "**Chống nuke** — `/antinuke status`, `/antinuke on|off`, `/antinuke module`, `/antinuke unlock`, `/antinuke lockdown`",
            "**Lọc nội dung** — module `badword`, `invite`, `attachment`, `mention` (bật tắt trong `/antinuke module`) · `/badword add|remove|list` · `/heat status`",
            "**Khoá kênh** — `/lock add #kênh [role] [30m|2h|1d]`, `/lock all [role] [thời lượng]`, `/lock remove #kênh`, `/lock unlock-all`, `/lock list` (bỏ trống thời lượng = khoá vô hạn, tự mở tay; có thời lượng thì tự mở)",
            "**Mod tools** — `/mod timeout @user 10m [lý do]`, `/mod untimeout`, `/mod kick`, `/mod ban`, `/mod unban`, `/mod unwarn`, `/mod purge` (ghi log lý do + người thực hiện)",
            "**Giveaway** — `/giveaway start <tên> <giải thưởng> <thời lượng>`, `/giveaway list`, `/giveaway end`",
            "**Reaction Role** — `/reactionrole create <kênh> <tên> <cặp emoji:role>`, `/reactionrole add`, `/reactionrole edit`, `/reactionrole remove`, `/reactionrole delete`",
            "**Backup server** — `/backup now` (tạo + đẩy GitHub chủ bot), `/backup list`, `/backup restore <số>`, `/backup auto <2-30>` (tự động định kỳ) — phòng khi server bị nuke phá sập",
            "**Báo cáo AI** — `/report [ghi chú]`: AI đọc hàng trăm tin nhắn gần đây + dữ liệu phạt 24h → báo cáo raid/nuke hoặc bot phạt nhầm, công bố cho server",
            "**Học tập** — `/research status` (tiến độ), `/research learn` (học ngay — mod/admin), `/research history` (10 lượt gần nhất)",
            "**Xác minh** — `/verify setup` (kênh + role), `/verify toggle`",
            "**Cấu hình** — `/setup log-channel`, `/setup mod-role`, `/setup admin-role`, `/prefix set`",
            "**Khác** — `/ping`, `/health` (sức khỏe AI — mod/admin)",
          ].join("\n"),
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    case "prefix": {
      const set = interaction.options.getString("set");
      const config = await store.getConfig(guild.id);
      const current = config?.prefix || "!";
      if (!set) {
        return interaction.reply({ content: `Prefix hiện tại: \`${current}\``, ephemeral: true });
      }
      if (!canManageGuild(interaction.member)) return needPerm(interaction);
      if (!/^[!^$#&%]{1,3}$/.test(set)) {
        return interaction.reply({
          content: "Prefix phải là 1-3 ký tự đặc biệt (ví dụ: `!`, `^`).",
          ephemeral: true,
        });
      }
      await store.client.mutation("bot_writes:botUpdateSettings", {
        guildId: guild.id,
        prefix: set,
      });
      store.invalidate(guild.id);
      return interaction.reply({
        content: `✅ Đã đổi prefix thành \`${set}\`. Lệnh text: \`${set}help\``,
        ephemeral: true,
      });
    }

    case "autoreply": {
      const sub = interaction.options.getSubcommand();
      const config = await store.getConfig(guild.id);

      if (sub === "list") {
        const rules = config?.autoReplies || [];
        if (rules.length === 0) {
          return interaction.reply({ content: "Chưa có rule auto reply nào.", ephemeral: true });
        }
        const lines = rules.map(
          (r) =>
            `• **${r.name}** — ${r.triggerType === "mention" ? "@mention" : r.keywords.join(", ")} — ${r.enabled ? "✅" : "⏸️"}`,
        );
        const embed = new EmbedBuilder()
          .setColor(Colors.Aqua)
          .setTitle(`📋 Auto reply (${rules.length})`)
          .setDescription(lines.join("\n").slice(0, 4000));
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // Mod/Admin (Manage Guild) hoặc role Mod/Admin được cấu hình qua /setup.
      if (!canManageWithConfig(interaction.member, config)) return needPerm(interaction);

      if (sub === "add") {
        const name = interaction.options.getString("name", true);
        const trigger = interaction.options.getString("trigger", true);
        const response = interaction.options.getString("response", true);
        const keywordsRaw = interaction.options.getString("keywords") ?? "";
        const cooldown = interaction.options.getInteger("cooldown") ?? 30;
        const payload = {
          guildId: guild.id,
          name,
          triggerType: trigger === "mention" ? "mention" : "keyword",
          keywords: keywordsRaw
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
          response,
          channels: [],
          cooldownSeconds: Math.max(0, cooldown),
          enabled: true,
        };
        if (payload.triggerType === "keyword" && payload.keywords.length === 0) {
          return interaction.reply({
            content: "Với loại `keyword` bạn cần nhập từ khóa (phân cách bằng dấu phẩy).",
            ephemeral: true,
          });
        }
        try {
          await store.client.mutation("bot_writes:botAutoReplyUpsert", payload);
        } catch (err) {
          return interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
        }
        store.invalidate(guild.id);
        return interaction.reply({
          content: `✅ Đã lưu rule \`${name}\` (thêm mới hoặc cập nhật) — bot trả lời: "${response.slice(0, 80)}${response.length > 80 ? "…" : ""}"`,
          ephemeral: true,
        });
      }

      if (sub === "remove") {
        const name = interaction.options.getString("name", true);
        await store.client.mutation("bot_writes:botAutoReplyRemove", {
          guildId: guild.id,
          name,
        });
        store.invalidate(guild.id);
        return interaction.reply({
          content: `✅ Đã xóa rule \`${name}\`.`,
          ephemeral: true,
        });
      }

      if (sub === "edit") {
        const name = interaction.options.getString("name", true);
        const response = interaction.options.getString("response");
        const cooldown = interaction.options.getInteger("cooldown");
        const rule = (config?.autoReplies || []).find((r) => r.name === name);
        if (!rule) {
          return interaction.reply({
            content: `Không tìm thấy rule \`${name}\`. Dùng \`/autoreply list\` để xem danh sách.`,
            ephemeral: true,
          });
        }
        await store.client.mutation("bot_writes:botAutoReplyUpsert", {
          guildId: guild.id,
          name,
          triggerType: rule.triggerType,
          keywords: rule.keywords,
          response: response ?? rule.response,
          channels: rule.channels || [],
          cooldownSeconds: cooldown !== null ? Math.max(0, cooldown) : rule.cooldownSeconds,
          enabled: rule.enabled,
        });
        store.invalidate(guild.id);
        return interaction.reply({
          content: `✅ Đã cập nhật rule \`${name}\`.`,
          ephemeral: true,
        });
      }
      return;
    }

    case "badword": {
      const sub = interaction.options.getSubcommand();
      const config = await store.getConfig(guild.id);
      const words = [...(config?.badWords || [])];

      if (sub === "list") {
        if (words.length === 0) {
          return interaction.reply({
            content:
              "Danh sách từ ngữ xấu đang trống — dùng `/badword add` hoặc dashboard để thêm.",
            ephemeral: true,
          });
        }
        const embed = new EmbedBuilder()
          .setColor(Colors.Aqua)
          .setTitle(`📋 Danh sách từ ngữ xấu (${words.length})`)
          .setDescription(
            words
              .map((w) => `\`${w}\``)
              .join(", ")
              .slice(0, 4000),
          );
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (!canManageGuild(interaction.member)) return needPerm(interaction);

      if (sub === "add") {
        const word = interaction.options.getString("word", true).trim().toLowerCase();
        if (!word)
          return interaction.reply({ content: "Từ ngữ không được để trống.", ephemeral: true });
        if (word.length > 40) {
          return interaction.reply({ content: "Từ ngữ tối đa 40 ký tự.", ephemeral: true });
        }
        if (words.includes(word)) {
          return interaction.reply({
            content: `\`${word}\` đã có trong danh sách.`,
            ephemeral: true,
          });
        }
        if (words.length >= 100) {
          return interaction.reply({ content: "Danh sách đã đạt tối đa 100 từ.", ephemeral: true });
        }
        words.push(word);
        await store.client.mutation("bot_writes:botUpdateSettings", {
          guildId: guild.id,
          badWords: words,
        });
        store.invalidate(guild.id);
        return interaction.reply({
          content: `✅ Đã thêm \`${word}\` vào danh sách từ ngữ xấu (${words.length} từ).`,
          ephemeral: true,
        });
      }

      if (sub === "remove") {
        const word = interaction.options.getString("word", true).trim().toLowerCase();
        const next = words.filter((w) => w !== word);
        if (next.length === words.length) {
          return interaction.reply({
            content: `Không tìm thấy \`${word}\` trong danh sách.`,
            ephemeral: true,
          });
        }
        await store.client.mutation("bot_writes:botUpdateSettings", {
          guildId: guild.id,
          badWords: next,
        });
        store.invalidate(guild.id);
        return interaction.reply({
          content: `✅ Đã xóa \`${word}\` khỏi danh sách từ ngữ xấu.`,
          ephemeral: true,
        });
      }
      return;
    }

    case "heat": {
      const config = await store.getConfig(guild.id);
      const s = {
        enabled: config?.heatEnabled !== false,
        decayPerMin: config?.heatDecayPerMin ?? 3,
        warnAt: config?.heatWarnAt ?? 25,
        timeoutAt: config?.heatTimeoutAt ?? 40,
        kickAt: config?.heatKickAt ?? 70,
        banAt: config?.heatBanAt ?? 90,
        repeatMultiplier: config?.heatRepeatMultiplier ?? 2,
        repeatWindowMin: config?.heatRepeatWindowMin ?? 30,
        warnStrikeLimit: config?.warnStrikeLimit ?? 3,
        warnStrikeWindowMin: config?.warnStrikeWindowMin ?? 60,
        warnStrikePunish: config?.warnStrikePunish ?? "timeout",
      };
      const top = config?.heatStates || [];
      const safety = config?.safetyPercent ?? 100;
      const tier = (heat) =>
        heat >= s.banAt
          ? "🚫 Ban"
          : heat >= s.kickAt
            ? "👢 Kick"
            : heat >= s.timeoutAt
              ? "⏸️ Tạm khóa"
              : "⚠️ Theo dõi";
      const embed = new EmbedBuilder()
        .setColor(safety >= 70 ? Colors.Green : safety >= 40 ? Colors.Yellow : Colors.Red)
        .setTitle(`🌡️ Nhiệt độ vi phạm: ${safety}% an toàn`)
        .setDescription(
          [
            s.enabled
              ? `Hệ thống nhiệt **đang bật** — giảm ${s.decayPerMin} điểm/phút, tái phạm tăng **x${s.repeatMultiplier}** trong ${s.repeatWindowMin} phút.`
              : `Hệ thống nhiệt **đang tắt**.`,
            `Ngưỡng: cảnh báo **${s.warnAt}** · tạm khóa **${s.timeoutAt}** · kick **${s.kickAt}** · ban **${s.banAt}** (tối đa 100).`,
            s.warnStrikeLimit
              ? `Warn tích lũy: **${s.warnStrikeLimit}** lần trong ${s.warnStrikeWindowMin} phút → **${s.warnStrikePunish}**.`
              : `Warn tích lũy: **đang tắt**.`,
          ].join("\n"),
        );
      if (top.length > 0) {
        embed.addFields({
          name: "Thành viên nóng nhất",
          value: top
            .slice(0, 10)
            .map((h) => `<@${h.userId}> — **${h.heat}/100** — ${tier(h.heat)}`)
            .join("\n")
            .slice(0, 1024),
        });
      } else {
        embed.addFields({
          name: "Thành viên nóng nhất",
          value: "Chưa có vi phạm nào — server rất an toàn 🎉",
        });
      }
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    case "lock": {
      return lockCommand(client, store, interaction);
    }
    case "antinuke": {
      const sub = interaction.options.getSubcommand();

      if (sub === "status") {
        const config = await store.getConfig(guild.id);
        const modules = config?.modules || [];
        const lines = modules.map(
          (m) =>
            `${m.enabled ? "✅" : "⏸️"} \`${m.module}\` — ${m.threshold} lần/${m.windowSeconds}s — ${m.punish}`,
        );
        const embed = new EmbedBuilder()
          .setColor(config?.antinukeEnabled ? Colors.Green : Colors.Red)
          .setTitle(`🛡️ Chống nuke: ${config?.antinukeEnabled ? "ĐANG BẬT" : "ĐÃ TẮT"}`)
          .setDescription(lines.join("\n") || "Chưa có module nào.");
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (!canManageGuild(interaction.member) && !isAdmin(interaction.member))
        return needPerm(interaction);

      if (sub === "unlock") {
        if (!isLocked(guild.id)) {
          const config = await store.getConfig(guild.id);
          if (!config?.lockdownUntil || config.lockdownUntil <= Date.now()) {
            return interaction.reply({
              content: "Server hiện không ở trạng thái khóa kênh.",
              ephemeral: true,
            });
          }
          markLocked(guild.id);
        }
        const config = await store.getConfig(guild.id);
        await unlockGuild(client, guild, config, store);
        return interaction.reply({
          content: "🔓 Đã mở khóa kênh.",
          ephemeral: true,
        });
      }

      if (sub === "lockdown") {
        const value = interaction.options.getString("value", true);
        if (!["on", "off"].includes(value)) {
          return interaction.reply({ content: "Giá trị phải là on hoặc off.", ephemeral: true });
        }
        await store.client.mutation("bot_writes:botUpdateLockdown", {
          guildId: guild.id,
          enabled: value === "on",
        });
        store.invalidate(guild.id);
        return interaction.reply({
          content:
            value === "on"
              ? "✅ Khóa kênh tự động khi raid đã bật."
              : "✅ Khóa kênh tự động khi raid đã tắt.",
          ephemeral: true,
        });
      }

      if (sub === "on" || sub === "off") {
        await store.client.mutation("bot_writes:botSetAntinuke", {
          guildId: guild.id,
          enabled: sub === "on",
        });
        store.invalidate(guild.id);
        return interaction.reply({
          content: `✅ Đã ${sub === "on" ? "bật" : "tắt"} chống nuke.`,
          ephemeral: true,
        });
      }

      if (sub === "module") {
        const moduleName = interaction.options.getString("module", true);
        const value = interaction.options.getString("value", true);
        if (!MODULES.includes(moduleName) || !["on", "off"].includes(value)) {
          return interaction.reply({
            content: `Module phải thuộc: ${MODULES.join(", ")} và giá trị là on|off.`,
            ephemeral: true,
          });
        }
        await store.client.mutation("bot_writes:botModuleUpdate", {
          guildId: guild.id,
          module: moduleName,
          enabled: value === "on",
        });
        store.invalidate(guild.id);
        return interaction.reply({
          content: `✅ Module \`${moduleName}\` đã ${value === "on" ? "bật" : "tắt"}.`,
          ephemeral: true,
        });
      }
      return;
    }

    case "mod": {
      const sub = interaction.options.getSubcommand();
      const config = await store.getConfig(guild.id);
      if (!canMod(interaction, config)) return needPerm(interaction);

      if (sub === "timeout") {
        const target = interaction.options.getMember("user");
        const minutes = parseDuration(interaction.options.getString("duration", true));
        const reason = interaction.options.getString("reason") || undefined;
        if (!target) {
          return interaction.reply({ content: "Không tìm thấy thành viên đó.", ephemeral: true });
        }
        if (!minutes) {
          return interaction.reply({
            content: "Thời lượng không hợp lệ (ví dụ: `10m`, `2h`, `1d`). Tối đa 7 ngày.",
            ephemeral: true,
          });
        }
        try {
          const out = await timeoutMember({
            guild,
            member: target,
            executor: interaction.user,
            minutes,
            reason,
            guildConfig: config,
            store,
          });
          return interaction.reply({ content: `✅ ${out}`, ephemeral: true });
        } catch (e) {
          return interaction.reply({
            content: `❌ Không thể timeout: ${e.message}`,
            ephemeral: true,
          });
        }
      }

      if (sub === "kick") {
        const target = interaction.options.getMember("user");
        const reason = interaction.options.getString("reason") || undefined;
        if (!target) {
          return interaction.reply({ content: "Không tìm thấy thành viên đó.", ephemeral: true });
        }
        try {
          const out = await kickMember({
            guild,
            member: target,
            executor: interaction.user,
            reason,
            guildConfig: config,
            store,
          });
          return interaction.reply({ content: `✅ ${out}`, ephemeral: true });
        } catch (e) {
          return interaction.reply({ content: `❌ Không thể kick: ${e.message}`, ephemeral: true });
        }
      }

      if (sub === "ban") {
        const target = interaction.options.getMember("user");
        const reason = interaction.options.getString("reason") || undefined;
        const deleteDays = Math.max(
          0,
          Math.min(7, interaction.options.getInteger("delete_days") ?? 0),
        );
        if (!target) {
          return interaction.reply({ content: "Không tìm thấy thành viên đó.", ephemeral: true });
        }
        try {
          const out = await banMember({
            guild,
            member: target,
            executor: interaction.user,
            reason,
            deleteDays,
            guildConfig: config,
            store,
          });
          return interaction.reply({ content: `✅ ${out}`, ephemeral: true });
        } catch (e) {
          return interaction.reply({ content: `❌ Không thể ban: ${e.message}`, ephemeral: true });
        }
      }

      if (sub === "purge") {
        const count = interaction.options.getInteger("count", true);
        try {
          const out = await purgeChannel(
            interaction.channel,
            count,
            interaction.user,
            config,
            store,
          );
          return interaction.reply({ content: `✅ ${out}`, ephemeral: true });
        } catch (e) {
          return interaction.reply({
            content: `❌ Không thể purge: ${e.message}`,
            ephemeral: true,
          });
        }
      }

      if (sub === "untimeout") {
        const target = interaction.options.getMember("user");
        const reason = interaction.options.getString("reason") || undefined;
        if (!target) {
          return interaction.reply({ content: "Không tìm thấy thành viên đó.", ephemeral: true });
        }
        try {
          const out = await untimeoutMember({
            guild,
            member: target,
            executor: interaction.user,
            reason,
            guildConfig: config,
            store,
          });
          return interaction.reply({ content: `✅ ${out}`, ephemeral: true });
        } catch (e) {
          return interaction.reply({
            content: `❌ Không thể gỡ timeout: ${e.message}`,
            ephemeral: true,
          });
        }
      }

      if (sub === "unban") {
        const target = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason") || undefined;
        if (!target) {
          return interaction.reply({ content: "Không tìm thấy người dùng đó.", ephemeral: true });
        }
        try {
          const out = await unbanMember({
            guild,
            userId: target.id,
            executor: interaction.user,
            reason,
            guildConfig: config,
            store,
          });
          return interaction.reply({ content: `✅ ${out}`, ephemeral: true });
        } catch (e) {
          return interaction.reply({
            content: `❌ Không thể gỡ ban: ${e.message}`,
            ephemeral: true,
          });
        }
      }

      if (sub === "unwarn") {
        const target = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason") || undefined;
        if (!target) {
          return interaction.reply({ content: "Không tìm thấy người dùng đó.", ephemeral: true });
        }
        try {
          const out = await unwarnMember({
            guild,
            userId: target.id,
            heat,
            executor: interaction.user,
            reason,
            guildConfig: config,
            store,
          });
          return interaction.reply({ content: `✅ ${out}`, ephemeral: true });
        } catch (e) {
          return interaction.reply({
            content: `❌ Không thể gỡ warn: ${e.message}`,
            ephemeral: true,
          });
        }
      }
      return;
    }

    case "giveaway": {
      const sub = interaction.options.getSubcommand();
      const config = await store.getConfig(guild.id);

      if (sub === "list") {
        const giveaways = config?.giveaways || [];
        if (giveaways.length === 0) {
          return interaction.reply({ content: "Chưa có giveaway nào.", ephemeral: true });
        }
        const lines = giveaways
          .slice(0, 20)
          .map(
            (g) =>
              `${g.status === "active" ? "🎉" : "🏁"} **${g.title}** — ${g.entries?.length || 0} lượt tham gia`,
          );
        const embed = new EmbedBuilder()
          .setColor(Colors.Aqua)
          .setTitle(`🎉 Giveaway (${giveaways.length})`)
          .setDescription(lines.join("\n").slice(0, 4000));
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (!canMod(interaction, config)) return needPerm(interaction);

      if (sub === "start") {
        const title = interaction.options.getString("title", true);
        const prize = interaction.options.getString("prize", true);
        const minutes = parseDuration(interaction.options.getString("duration", true));
        const winnerCount = Math.max(
          1,
          Math.min(20, interaction.options.getInteger("winners") ?? 1),
        );
        const prizeRole = interaction.options.getRole("prize_role");
        if (!minutes) {
          return interaction.reply({
            content: "Thời lượng không hợp lệ (ví dụ: `30m`, `2h`, `1d`).",
            ephemeral: true,
          });
        }
        try {
          await store.client.mutation("hidden:botCreateGiveaway", {
            guildId: guild.id,
            channelId: interaction.channel.id,
            title: title.slice(0, 100),
            prize: prize.slice(0, 2000),
            winnerCount,
            durationMinutes: minutes,
            dmWinners: true,
            prizeRoleId: prizeRole ? prizeRole.id : undefined,
          });
          store.invalidate(guild.id);
          return interaction.reply({
            content: `🎉 Đã tạo giveaway "${title}" tại ${interaction.channel} — bot gửi embed trong ~1 phút!`,
            ephemeral: true,
          });
        } catch (e) {
          return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
        }
      }

      if (sub === "end") {
        const title = interaction.options.getString("title", true);
        const res = await store.client.mutation("hidden:botGiveawayEndNow", {
          guildId: guild.id,
          title,
        });
        store.invalidate(guild.id);
        return interaction.reply({
          content: res.ok
            ? `✅ Đã kết thúc giveaway "${title}" — bot chốt người thắng trong ~1 phút.`
            : `Không tìm thấy giveaway đang chạy tên "${title}".`,
          ephemeral: true,
        });
      }
      return;
    }

    case "reactionrole": {
      const sub = interaction.options.getSubcommand();
      const hidden = await store.client
        .query("hidden:getBotHidden", { guildId: guild.id })
        .catch(() => null);
      const panels = hidden?.panels || [];
      const findPanel = (name) =>
        panels.find(
          (p) =>
            p.label.toLowerCase() ===
            String(name || "")
              .trim()
              .toLowerCase(),
        );

      if (sub === "list") {
        if (panels.length === 0) {
          return interaction.reply({
            content: "Chưa có bảng reaction role nào — dùng `/reactionrole create` hoặc dashboard.",
            ephemeral: true,
          });
        }
        const lines = panels.map((p) => {
          const ch = guild.channels.cache.get(p.channelId);
          return `• **${p.label}** — ${ch ? `#${ch.name}` : "kênh đã xóa"} — ${p.entries.length} cặp — ${p.enabled ? "✅" : "⏸️"}`;
        });
        const embed = new EmbedBuilder()
          .setColor(Colors.Aqua)
          .setTitle(`🎭 Reaction role (${panels.length})`)
          .setDescription(lines.join("\n").slice(0, 4000));
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (!canManageGuild(interaction.member)) return needPerm(interaction);

      if (sub === "create") {
        const channel = interaction.options.getChannel("channel", true);
        const label = interaction.options.getString("label", true);
        const description = interaction.options.getString("description") || undefined;
        const thumbnail = interaction.options.getString("thumbnail") || undefined;
        const entries = parsePairs(interaction.options.getString("pairs", true), guild);
        if (!channel.isTextBased()) {
          return interaction.reply({ content: "Kênh phải là kênh văn bản.", ephemeral: true });
        }
        if (entries.length === 0) {
          return interaction.reply({
            content: "Cần ít nhất 1 cặp emoji:role hợp lệ, VD: `✅:123456789 ⭐:987654321`.",
            ephemeral: true,
          });
        }
        try {
          await store.client.mutation("hidden:botCreatePanel", {
            guildId: guild.id,
            channelId: channel.id,
            label,
            description,
            thumbnailUrl: thumbnail,
            entries,
          });
          store.invalidate(guild.id);
          return interaction.reply({
            content: `✅ Đã tạo bảng "${label}" tại ${channel} — bot gửi tin nhắn trong ~1 phút.`,
            ephemeral: true,
          });
        } catch (e) {
          return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
        }
      }

      if (sub === "add") {
        const label = interaction.options.getString("label", true);
        const emoji = interaction.options.getString("emoji", true);
        const role = interaction.options.getRole("role", true);
        const panel = findPanel(label);
        if (!panel) {
          return interaction.reply({
            content: `Không tìm thấy bảng "${label}" — dùng \`/reactionrole list\`.`,
            ephemeral: true,
          });
        }
        if (panel.entries.some((e) => emojiKeyOf(e.emoji) === emojiKeyOf(emoji))) {
          return interaction.reply({ content: "Emoji này đã có trong bảng.", ephemeral: true });
        }
        try {
          await store.client.mutation("hidden:botUpdatePanel", {
            guildId: guild.id,
            panelId: panel._id,
            entries: [...panel.entries, { emoji, roleId: role.id }],
          });
          store.invalidate(guild.id);
          return interaction.reply({
            content: `✅ Đã thêm ${emoji} → ${role} vào bảng "${panel.label}" — bot gửi bảng mới trong ~1 phút.`,
            ephemeral: true,
          });
        } catch (e) {
          return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
        }
      }

      if (sub === "remove") {
        const label = interaction.options.getString("label", true);
        const emoji = interaction.options.getString("emoji", true);
        const panel = findPanel(label);
        if (!panel) {
          return interaction.reply({
            content: `Không tìm thấy bảng "${label}" — dùng \`/reactionrole list\`.`,
            ephemeral: true,
          });
        }
        const next = panel.entries.filter((e) => emojiKeyOf(e.emoji) !== emojiKeyOf(emoji));
        if (next.length === panel.entries.length) {
          return interaction.reply({
            content: "Không tìm thấy emoji này trong bảng.",
            ephemeral: true,
          });
        }
        try {
          await store.client.mutation("hidden:botUpdatePanel", {
            guildId: guild.id,
            panelId: panel._id,
            entries: next,
          });
          store.invalidate(guild.id);
          return interaction.reply({
            content: `✅ Đã gỡ ${emoji} khỏi bảng "${panel.label}" — bot gửi bảng mới trong ~1 phút.`,
            ephemeral: true,
          });
        } catch (e) {
          return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
        }
      }

      if (sub === "edit") {
        const label = interaction.options.getString("label", true);
        const panel = findPanel(label);
        if (!panel) {
          return interaction.reply({
            content: `Không tìm thấy bảng "${label}" — dùng \`/reactionrole list\`.`,
            ephemeral: true,
          });
        }
        const patch = { guildId: guild.id, panelId: panel._id };
        const newLabel = interaction.options.getString("new_label");
        if (newLabel) patch.label = newLabel;
        const description = interaction.options.getString("description");
        if (description !== null) patch.description = description === "-" ? null : description;
        const thumbnail = interaction.options.getString("thumbnail");
        if (thumbnail !== null) patch.thumbnailUrl = thumbnail === "-" ? null : thumbnail;
        if (!("label" in patch) && !("description" in patch) && !("thumbnailUrl" in patch)) {
          return interaction.reply({
            content: "Cần cung cấp ít nhất một trường: new_label / description / thumbnail.",
            ephemeral: true,
          });
        }
        try {
          await store.client.mutation("hidden:botUpdatePanel", patch);
          store.invalidate(guild.id);
          return interaction.reply({
            content: `✅ Đã cập nhật bảng "${panel.label}" — bot gửi bảng mới trong ~1 phút.`,
            ephemeral: true,
          });
        } catch (e) {
          return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
        }
      }

      if (sub === "delete") {
        const label = interaction.options.getString("label", true);
        const panel = findPanel(label);
        if (!panel) {
          return interaction.reply({
            content: `Không tìm thấy bảng "${label}" — dùng \`/reactionrole list\`.`,
            ephemeral: true,
          });
        }
        try {
          await store.client.mutation("hidden:botDeletePanel", {
            guildId: guild.id,
            panelId: panel._id,
          });
          store.invalidate(guild.id);
          return interaction.reply({
            content: `✅ Đã xóa bảng "${panel.label}" (tin nhắn cũ trong Discord vẫn còn).`,
            ephemeral: true,
          });
        } catch (e) {
          return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
        }
      }
      return;
    }

    case "backup": {
      const sub = interaction.options.getSubcommand();
      const guildId = guild.id;

      if (sub === "list") {
        const list = await store.client.query("backup:listGuild", { guildId }).catch(() => null);
        if (!list || list.length === 0) {
          return interaction.reply({
            content: "Chưa có backup nào của server này — dùng `/backup now` để tạo bản đầu tiên.",
            ephemeral: true,
          });
        }
        const lines = list.map(
          (b, i) =>
            `${i + 1}. **${b.guildName}** — ${new Date(b.createdAt).toLocaleString("vi-VN")} — ${b.roleCount} role · ${b.channelCount} kênh${b.pushedToGithub ? " · ☁️ GitHub" : ""}`,
        );
        // Danh sách có thể tới 50 bản (quy tắc "Giữ bản" 2-50) nhưng embed chỉ
        // chịu 4096 ký tự — in hết một lượt là Discord từ chối cả embed. In 20
        // bản mới nhất, phần còn lại chỉ sang dashboard.
        const shown = lines.slice(0, 20);
        if (lines.length > shown.length) {
          shown.push(
            `… và ${lines.length - shown.length} bản nữa — xem và khôi phục các bản cũ hơn trên dashboard.`,
          );
        }
        const embed = new EmbedBuilder()
          .setColor(Colors.Blurple)
          .setTitle(`💾 Backup của server (${list.length})`)
          .setDescription(shown.join("\n"))
          .setFooter({ text: "Khôi phục: /backup restore <số thứ tự>" });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (sub === "restore") {
        if (!canManageGuild(interaction.member)) return needPerm(interaction);
        const idx = interaction.options.getInteger("index", true);
        const list = await store.client.query("backup:listGuild", { guildId }).catch(() => null);
        const backup = list && list[idx - 1];
        if (!backup) {
          return interaction.reply({
            content: `Không tìm thấy backup số ${idx} — chạy /backup list để xem danh sách.`,
            ephemeral: true,
          });
        }
        try {
          await store.client.mutation("bot_writes:botSetRestoreRequest", {
            guildId,
            backupId: backup._id,
          });
          store.invalidate(guildId);
          return interaction.reply({
            content: `✅ Đã yêu cầu khôi phục backup của **${backup.guildName}** (${backup.roleCount} role · ${backup.channelCount} kênh) — bot tạo lại cấu trúc trong ~1 phút.`,
            ephemeral: true,
          });
        } catch (e) {
          return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
        }
      }

      if (sub === "auto") {
        if (!canManageGuild(interaction.member)) return needPerm(interaction);
        const days = interaction.options.getInteger("days", true);
        if (days !== 0 && (days < 2 || days > 30)) {
          return interaction.reply({
            content: "Số ngày phải từ 2 đến 30 (0 = tắt).",
            ephemeral: true,
          });
        }
        try {
          await store.client.mutation("bot_writes:botSetAutoBackup", { guildId, days });
          store.invalidate(guildId);
          return interaction.reply({
            content:
              days > 0
                ? `✅ Tự động backup mỗi **${days} ngày** — bot tự chụp + đẩy lên GitHub của chủ bot. Xem kết quả: /backup list`
                : "✅ Đã tắt tự động backup — bot chỉ backup khi bạn dùng lệnh hoặc trên dashboard.",
            ephemeral: true,
          });
        } catch (e) {
          return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
        }
      }

      // /backup keep <số bản> [số ngày] — quy tắc giữ bản (giống !backup keep).
      // `days` bỏ trống thì GIỮ NGUYÊN quy tắc tuổi đang có: người dùng chỉ
      // muốn đổi số bản không vô tình xoá luôn giới hạn tuổi họ đã đặt.
      if (sub === "keep") {
        if (!canManageGuild(interaction.member)) return needPerm(interaction);
        const count = interaction.options.getInteger("count", true);
        if (count < 2 || count > 50) {
          return interaction.reply({
            content: "Số bản phải từ **2 đến 50** (VD: `/backup keep count:7`).",
            ephemeral: true,
          });
        }
        // Discord trả NULL khi option bỏ trống — gửi null xuống Convex sẽ bị
        // validator v.optional(v.number()) từ chối, nên phải đổi thành undefined
        // (JSON.stringify bỏ field ⇒ server giữ nguyên quy tắc cũ).
        const days = interaction.options.getInteger("days") ?? undefined;
        if (days !== undefined && (days < 0 || days > 365)) {
          return interaction.reply({
            content: "Số ngày phải từ **0 đến 365** (0 = không xoá theo tuổi).",
            ephemeral: true,
          });
        }
        try {
          const res = await store.client.mutation("bot_writes:botSetBackupRetention", {
            guildId,
            keepCount: count,
            keepDays: days,
          });
          // ok=false (VD server chưa có trong DB vì bot vừa vào) KHÔNG được báo
          // thành công — người dùng tin là đã đặt xong nhưng không có gì lưu.
          if (res?.ok !== true) {
            throw new Error(
              res?.reason === "no_guild"
                ? "bot chưa đồng bộ server này — thử lại sau vài phút"
                : "không lưu được quy tắc giữ bản",
            );
          }
          return interaction.reply({
            content: `✅ Quy tắc giữ bản: giữ **${res?.keepCount ?? count} bản** gần nhất${
              res?.keepDays ? ` và xoá bản cũ hơn **${res.keepDays} ngày**` : ""
            }. Có hiệu lực từ lần backup kế tiếp (bản đang có không bị xoá ngay).`,
            ephemeral: true,
          });
        } catch (e) {
          return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
        }
      }

      // /backup now — mặc định đẩy lên GitHub (token của chủ bot, dùng chung mọi server)
      if (sub === "now") {
        if (!canManageGuild(interaction.member)) return needPerm(interaction);
        const github = interaction.options.getBoolean("github") ?? true;
        try {
          await store.client.mutation("bot_writes:botSetBackupRequest", {
            guildId,
            pushToGithub: github,
          });
          store.invalidate(guildId);
          return interaction.reply({
            content: github
              ? "✅ Đã yêu cầu tạo backup (đẩy lên GitHub của chủ bot) — bot thực hiện trong ~20 giây. Xem kết quả: `/backup list`"
              : "✅ Đã yêu cầu tạo backup (chỉ lưu trên Convex) — bot thực hiện trong ~20 giây. Xem kết quả: `/backup list`",
            ephemeral: true,
          });
        } catch (e) {
          return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
        }
      }

      // Subcommand lạ → KHÔNG được rơi xuống nhánh `now` và âm thầm tạo backup +
      // đẩy server lên GitHub. Đăng ký slash dùng PUT nên thay thế TOÀN BỘ cây
      // lệnh: hễ thêm subcommand mới vào slash.js mà handler chưa kịp sửa, người
      // dùng sẽ gõ đúng lệnh đó và nhận hành vi của `now` — một thao tác ghi dữ
      // liệu + đẩy ra ngoài mà họ không hề được hỏi.
      return interaction.reply({
        content:
          "Subcommand `/backup` không hợp lệ. Dùng: `now` · `list` · `restore <số>` · `auto <2-30|0>` · `keep <2-50> [ngày]`.",
        ephemeral: true,
      });
    }

    case "verify": {
      const sub = interaction.options.getSubcommand();
      if (!canManageGuild(interaction.member)) return needPerm(interaction);

      if (sub === "setup") {
        const channel = interaction.options.getChannel("channel", true);
        const unverifiedRole = interaction.options.getRole("unverified_role", true);
        const verifiedRole = interaction.options.getRole("verified_role", true);
        const method = interaction.options.getString("method") || "button";
        await store.client.mutation("bot_writes:botUpdateSettings", {
          guildId: guild.id,
          verifyEnabled: true,
          verifyMethod: method,
          verifyChannelId: channel.id,
          unverifiedRoleId: unverifiedRole.id,
          verifiedRoleId: verifiedRole.id,
        });
        store.invalidate(guild.id);
        try {
          const embed = new EmbedBuilder()
            .setColor(Colors.Blurple)
            .setTitle("✅ Xác minh thành viên")
            .setDescription(
              method === "captcha"
                ? "Nhấn nút bên dưới để nhận mã xác minh qua DM, sau đó nhập mã trong kênh này."
                : "Nhấn nút bên dưới để xác minh và vào server.",
            );
          const row = new ActionRowBuilder();
          if (method === "captcha") {
            row.addComponents(
              new ButtonBuilder()
                .setCustomId("verify_request_captcha")
                .setLabel("Nhận mã xác minh 🔑")
                .setStyle(ButtonStyle.Primary),
            );
          } else {
            row.addComponents(
              new ButtonBuilder()
                .setCustomId("verify_confirm")
                .setLabel("Xác minh ✅")
                .setStyle(ButtonStyle.Success),
            );
          }
          await channel.send({ embeds: [embed], components: [row] });
        } catch (e) {
          console.error(`[verify:setup:send] ${guild.id}:`, e.message);
        }
        return interaction.reply({
          content: `✅ Đã thiết lập xác minh (${method === "captcha" ? "captcha" : "button"}): kênh ${channel}, role chưa xác minh ${unverifiedRole}, role đã xác minh ${verifiedRole}.`,
          ephemeral: true,
        });
      }

      if (sub === "toggle") {
        const value = interaction.options.getString("value", true);
        if (!["on", "off"].includes(value)) {
          return interaction.reply({ content: "Giá trị phải là on hoặc off.", ephemeral: true });
        }
        await store.client.mutation("bot_writes:botUpdateSettings", {
          guildId: guild.id,
          verifyEnabled: value === "on",
        });
        store.invalidate(guild.id);
        return interaction.reply({
          content: `✅ Đã ${value === "on" ? "bật" : "tắt"} xác minh thành viên.`,
          ephemeral: true,
        });
      }

      if (sub === "method") {
        const type = interaction.options.getString("type", true);
        if (!["button", "captcha"].includes(type)) {
          return interaction.reply({
            content: "Phương thức phải là button hoặc captcha.",
            ephemeral: true,
          });
        }
        await store.client.mutation("bot_writes:botUpdateSettings", {
          guildId: guild.id,
          verifyMethod: type,
        });
        store.invalidate(guild.id);
        return interaction.reply({
          content: `✅ Đã đổi phương thức xác minh thành **${type === "captcha" ? "captcha — nhập mã DM" : "button — bấm nút"}**.`,
          ephemeral: true,
        });
      }
      return;
    }

    case "setup": {
      if (!canManageGuild(interaction.member)) return needPerm(interaction);
      const sub = interaction.options.getSubcommand();

      if (sub === "log-channel") {
        const channel = interaction.options.getChannel("channel", true);
        await store.client.mutation("bot_writes:botUpdateSettings", {
          guildId: guild.id,
          logChannelId: channel.id,
        });
        store.invalidate(guild.id);
        return interaction.reply({
          content: `✅ Kênh log đã đặt là ${channel}.`,
          ephemeral: true,
        });
      }

      if (sub === "mod-role") {
        const role = interaction.options.getRole("role", true);
        const config = await store.getConfig(guild.id);
        const modRoles = [...new Set([...(config?.modRoles || []), role.id])];
        await store.client.mutation("bot_writes:botUpdateSettings", {
          guildId: guild.id,
          modRoles,
        });
        store.invalidate(guild.id);
        return interaction.reply({
          content: `✅ Role Mod đã thêm ${role}.`,
          ephemeral: true,
        });
      }

      if (sub === "admin-role") {
        const role = interaction.options.getRole("role", true);
        const config = await store.getConfig(guild.id);
        const adminRoles = [...new Set([...(config?.adminRoles || []), role.id])];
        await store.client.mutation("bot_writes:botUpdateSettings", {
          guildId: guild.id,
          adminRoles,
        });
        store.invalidate(guild.id);
        return interaction.reply({
          content: `✅ Role Admin đã thêm ${role}.`,
          ephemeral: true,
        });
      }
      return;
    }

    case "alt": {
      const sub = interaction.options.getSubcommand();
      const config = await store.getConfig(guild.id);
      if (!canManageGuild(interaction.member) && !isAdmin(interaction.member))
        return needPerm(interaction);

      if (sub === "status") {
        const enabled = config?.altDetectionEnabled ?? false;
        const vpnMode = config?.altVpnMode ?? "off";
        const maxRisk = config?.altMaxRiskScore ?? 70;
        const minAge = config?.altMinAgeDays ?? 7;
        const punish = config?.altPunish ?? "kick";
        const embed = new EmbedBuilder()
          .setColor(enabled ? Colors.Green : Colors.Red)
          .setTitle("🔍 Alt Detection Status")
          .setDescription(
            [
              `**Phát hiện alt account:** ${enabled ? "✅ BẬT" : "⏸️ TẮT"}`,
              `**Chế độ VPN:** ${vpnMode === "strict" ? "🔒 Nghiêm ngặt" : vpnMode === "warn" ? "⚠️ Cảnh báo" : "⏸️ Tắt"}`,
              `**Ngưỡng rủi ro:** ${maxRisk}/100`,
              `**Tuổi tối thiểu:** ${minAge} ngày`,
              `**Hình phạt:** ${punish}`,
              `**Tương đồng username:** ≥${config?.altSimilarityThreshold ?? 70}%`,
              `**Cửa sổ join:** ${config?.altJoinWindowMinutes ?? 5} phút`,
            ].join("\n"),
          );
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (sub === "on" || sub === "off") {
        await store.client.mutation("bot_writes:botUpdateSettings", {
          guildId: guild.id,
          altDetectionEnabled: sub === "on",
        });
        store.invalidate(guild.id);
        return interaction.reply({
          content: `✅ Đã ${sub === "on" ? "bật" : "tắt"} phát hiện alt account.`,
          ephemeral: true,
        });
      }

      if (sub === "punish") {
        const type = interaction.options.getString("type", true);
        if (!["kick", "ban", "timeout", "verify"].includes(type)) {
          return interaction.reply({
            content: "Hình phạt phải là: kick, ban, timeout, hoặc verify.",
            ephemeral: true,
          });
        }
        await store.client.mutation("bot_writes:botUpdateSettings", {
          guildId: guild.id,
          altPunish: type,
        });
        store.invalidate(guild.id);
        return interaction.reply({
          content: `✅ Hình phạt alt account đã đổi thành **${type}**.`,
          ephemeral: true,
        });
      }

      if (sub === "threshold") {
        const value = interaction.options.getInteger("value", true);
        if (value < 10 || value > 100) {
          return interaction.reply({ content: "Ngưỡng phải từ 10 đến 100.", ephemeral: true });
        }
        await store.client.mutation("bot_writes:botUpdateSettings", {
          guildId: guild.id,
          altMaxRiskScore: value,
        });
        store.invalidate(guild.id);
        return interaction.reply({
          content: `✅ Ngưỡng rủi ro đã đổi thành **${value}/100**.`,
          ephemeral: true,
        });
      }

      if (sub === "vpn") {
        const mode = interaction.options.getString("mode", true);
        if (!["strict", "warn", "off"].includes(mode)) {
          return interaction.reply({
            content: "Chế độ VPN phải là: strict, warn, hoặc off.",
            ephemeral: true,
          });
        }
        await store.client.mutation("bot_writes:botUpdateSettings", {
          guildId: guild.id,
          altVpnMode: mode,
          vpnBlockEnabled: mode === "strict",
        });
        store.invalidate(guild.id);
        return interaction.reply({
          content: `✅ Chế độ VPN đã đổi thành **${mode === "strict" ? "nghiêm ngặt" : mode === "warn" ? "cảnh báo" : "tắt"}**.`,
          ephemeral: true,
        });
      }
      return;
    }

    default:
      return interaction.reply({ content: "Lệnh chưa được hỗ trợ.", ephemeral: true });
  }
};
