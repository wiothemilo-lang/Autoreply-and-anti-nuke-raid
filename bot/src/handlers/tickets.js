const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
} = require("discord.js");
const lang = require("./lang");
const core = require("../ticketCore");
const { isLocked } = require("../lockdown");

/**
 * handlers/tickets.js — Kênh ticket cho 2 việc: KHIẾU NẠI hình phạt và
 * HỖ TRỢ CHUNG (thành viên hỏi đáp / báo cáo bất kỳ chuyện gì).
 *
 * Có 2 điểm vào, và sự khác biệt là do RÀNG BUỘC KỸ THUẬT chứ không phải
 * lựa chọn thiết kế:
 *   1. Nút trong DM gửi kèm sau khi ban (`banNoticeDm`) — dành cho người BỊ
 *      BAN. Họ không vào được kênh nào của server nên không thể gõ lệnh.
 *   2. Lệnh `/ticket` trong server (`ticketCommand`) — dành cho thành viên
 *      đang ở trong server (bị timeout, nghi ngờ alt, cần hỏi).
 *
 * Phần quyết định thuần (tên kênh, hàng rào chống spam, escape mention) nằm ở
 * `bot/src/ticketCore.js` và test hermetic trong `scripts/test-tickets.cjs`.
 * File này chỉ làm việc với Discord: tạo kênh, gắn quyền, gửi embed.
 */

/** Số ký tự Discord cho phép trong tên kênh. */
const CHANNEL_NAME_MAX = 100;

/** Trần kênh Discord (hard limit của nền tảng). */
const DISCORD_MAX_CHANNELS = 500;

/** customId: <hành động>:<ticketId>. ticketId là _id của Convex. */
const ID_SEP = ":";

/**
 * `reason` của `decideOpen` → mã lỗi đã có bản dịch trong TICKET_TEXT.
 *
 * ⚠️ Không tự viết `err${reason[0].toUpperCase()}${reason.slice(1)}`: `reason`
 * là snake_case (`no_category`) nên ra `errNo_category`, KHÔNG khớp key
 * `errNoCategory` → `renderError` rơi về fallback "bot thiếu quyền" và báo
 * SAI nguyên nhân (thực tế là chủ server chưa cấu hình category/role staff).
 * Bảng map tường minh: đổi tên `reason` ở ticketCore sẽ lộ ra ngay ở đây
 * (key lạ → `errUnknown` thay vì im lặng rơi vào nhánh sai).
 */
const DECIDE_CODE = {
  disabled: "errDisabled",
  no_category: "errNoCategory",
  no_staff: "errNoStaff",
};

/**
 * Lỗi khi TẠO KÊNH → mã chuỗi đã dịch. Cùng lý do với `DECIDE_CODE`:
 * mã lạ rơi về `errUnknown` ("chủ server kiểm tra lại cấu hình") chứ KHÔNG
 * rơi về `errNoPerm` — báo nhầm "bot thiếu quyền" khi thực ra category đã bị
 * xoá (10003) là thông tin sai dẫn chủ server tìm sai chỗ.
 */
const CHANNEL_ERR_CODE = {
  MAX_CHANNELS: "errChannelsFull",
  NO_CATEGORY: "errNoCategory",
  MISSING_PERM: "errNoPerm",
  UNKNOWN: "errUnknown",
};

function parseTicketId(customId) {
  const i = customId.indexOf(ID_SEP);
  if (i < 0) return null;
  const action = customId.slice(0, i);
  const ticketId = customId.slice(i + 1);
  return ticketId ? { action, ticketId } : null;
}

/**
 * Role nào được coi là staff xử lý ticket.
 *
 * Ưu tiên `ticketStaffRoleId` (chủ server tự chọn); rỗng thì lấy `modRoles` —
 * đó là cách mọi lệnh mod khác kiểm tra quyền, nên không phát minh bộ quyền
 * thứ ba. Mảng rỗng = không ai có quyền → `decideOpen` chặn ngay.
 */
function staffRoleIds(config) {
  const specific = config?.ticketStaffRoleId;
  if (specific) return [specific];
  return Array.isArray(config?.modRoles) ? config.modRoles : [];
}

/** Ngôn ngữ: ưu tiên NGƯỜI (interaction/user locale), rồi mới tới server. */
function langFor(interaction, guild) {
  return lang.langForUser(interaction, guild);
}

/**
 * Hàng nút thao tác trong kênh ticket (chỉ staff bấm được).
 *
 * `ticketId` nhét vào customId vì kênh Discord không có nguồn nào khác để bot
 * biết đây là ticket nào — không có state trong RAM, và người dùng có thể
 * dán lại embed vào kênh khác.
 */

/**
 * Lỗi Discord → câu báo tiếng Việt đọc được.
 *
 * Mục tiêu: KHÔNG BAO GIỜ để lỗi thô của Discord lọt ra cho người dùng
 * ("Cannot read properties of undefined") — cũng không để bot crash vì
 * thiếu quyền rồi im lặng (người dùng bấm nút mà không biết vì sao).
 */
function describeGuildError(e) {
  const code = e?.code ?? e?.rawError?.code;
  const msg = String(e?.message || "");
  if (code === 30003 || /MAX_CHANNELS/i.test(msg)) return "MAX_CHANNELS";
  if (code === 10003 || /Unknown Channel/i.test(msg)) return "NO_CATEGORY";
  if (code === 50013 || /missing permissions|not allowed to manage/i.test(msg)) {
    return "MISSING_PERM";
  }
  return "UNKNOWN";
}

/**
 * Tạo kênh ticket + gắn quyền.
 *
 * Quyền ghi: mở cho người gọi (điểm vào B) hoặc chỉ staff (điểm vào A — người
 * bị ban không thể vào kênh nào, mở cho họ là vô nghĩa và chỉ làm rò thông tin).
 * Luôn chặn `@everyone` ở cả 2 trường hợp: kênh mà `@everyone` nhìn thấy
 * thì khiếu nại của người đó là tin công khai.
 */
async function createTicketChannel({
  guild,
  category,
  channelName,
  openerId,
  staffIds,
  openerOnly,
  closeNote,
  slowmodeSec = 0,
  isPublic = false,
}) {
  const channel = await guild.channels.create({
    name: channelName.slice(0, CHANNEL_NAME_MAX),
    type: ChannelType.GuildText,
    parent: category,
    // Slowmode set NGAY LÚC TẠO: sửa sau cũng tốn 1 lượt API, mà bot có thể
    // không giữ quyền đặt slowmode trên kênh vừa tạo → cấu hình im lặng hỏng.
    rateLimitPerUser: Math.max(0, Math.min(21600, Math.floor(slowmodeSec) || 0)),
    // Topic = chỗ duy nhất luôn hiện khi ai đó mở kênh. `ticketCloseNote` là
    // ghi chú chủ server dán cho người gửi ("Ticket đã xử lý…") — không đổ
    // vào đây thì nó chỉ là ô text lưu vào DB rồi không ai đọc (đã tồn tại
    // như vậy ở bản đầu). Cắt 1024 vì đó là trần topic của Discord.
    topic:
      String(closeNote || "")
        .trim()
        .slice(0, 1024) || "Protogon ticket",
    reason: "Mở ticket",
  });

  // @everyone = guild.roles.everyone — phải CHẶN trước rồi mới mở cho từng
  // role, vì Discord tính quyền theo thứ tự deny ưu tiên.
  //
  // `isPublic`: chủ server CHỌN kênh ticket công khai (diễn đàn hỏi đáp).
  // Mặc định vẫn kín — ticket khiếu nại mà ai cũng đọc được thì người dùng
  // không dám kêu.
  await channel.permissionOverwrites.edit(guild.roles.everyone, {
    ViewChannel: isPublic ? true : false,
  });

  for (const roleId of staffIds) {
    const role = guild.roles.cache.get(roleId);
    if (!role) continue;
    try {
      await channel.permissionOverwrites.edit(role, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        // Staff cần ManageChannels mới dùng được nút Đóng (bot thu quyền).
        ManageChannels: true,
      });
    } catch {
      // Role nằm TRÊN bot (bot không gán được quyền cho role cao hơn nó) →
      // bỏ qua role đó, các role khác vẫn dùng được. Không ném để 1 role
      // lỗi không làm hỏng cả ticket.
    }
  }

  if (openerOnly && openerId) {
    try {
      await channel.permissionOverwrites.edit(openerId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });
    } catch {
      // Không mở được cho người gọi (bot thấp hơn họ) → kênh vẫn dùng được
      // cho staff, chỉ là họ không tự nhắn được. Báo lại qua kênh.
    }
  }
  return channel;
}

/**
 * LUỒNG CHÍNH: mở 1 ticket.
 *
 * @returns {{ok: true, channelId: string} | {ok: false, code: string, waitHours?: number, max?: number}}
 *   `code` là khoá chuỗi đã dịch — caller tự tra bảng `TICKET_TEXT`. Trả về
 *   mã chứ không trả chuỗi đã dịch vì mỗi người 1 ngôn ngữ.
 */
async function openTicket({
  client,
  store,
  guild,
  user,
  kind,
  source,
  body,
  evidence,
  extraValues = [],
  T,
  openerOnly,
}) {
  const config = await store.getConfig(guild.id);

  // Server đang bị khoá do raid → không mở ticket. Lý do: lúc khoá, mọi kênh
  // mới đều là điểm yếu (kẻ raid sẽ spam được nội dung tùy ý).
  if (isLocked(guild.id)) return { ok: false, code: "errLocked" };

  // Loại đã CHUẨN HOÁ: \`kind\` từ caller có thể là key lạ (nút cũ dán tay,
  // customId cũ sau khi chủ server đổi tên loại) → tra theo danh sách thật
  // của server, không giả định còn "support"/"appeal".
  const kinds = core.normalizeKinds(config?.ticketKinds, T);
  const kindKey = core.normalizeKind(kind, kinds);
  const staffIds = core.staffRoleIdsForKind(kinds, kindKey, staffRoleIds(config));
  const categoryId = config?.ticketCategoryId;
  const state = await client.query("tickets:botTicketState", {
    guildId: guild.id,
    userId: user.id,
    botKey: process.env.PROTOGON_BOT_KEY || undefined,
  });

  const decision = core.decideOpen({
    enabled: config?.ticketEnabled,
    category: categoryId,
    staffRoleIds: staffIds,
    openCount: state.openCount,
    lastOpenedAt: state.lastOpenedAt,
    maxOpen: config?.ticketMaxOpen,
    cooldownHours: config?.ticketCooldownHours,
  });
  if (!decision.ok) {
    // Lỗi CẤU HÌNH (chưa bật / chưa chọn category / chưa chọn role staff) phải
    // báo trước lỗi phía người dùng — giữ đúng thứ tự cố ý của decideOpen.
    if (decision.reason !== "cooldown" && decision.reason !== "max_open") {
      return { ok: false, code: DECIDE_CODE[decision.reason] || "errUnknown" };
    }
  }

  // Đã có ticket mở → trả về kênh cũ thay vì tạo kênh thứ hai.
  //
  // ⚠️ PHẢI kiểm TRƯỚC hàng rào cooldown/max_open: vừa mở xong là cooldown lập
  // tức (mặc định 24h), nên nếu kiểm sau thì người dùng bấm nút lần hai chỉ
  // nhận "hãy chờ 24 giờ" mà không thấy kênh của chính mình — nhánh
  // errAlreadyOpen không bao giờ chạy được (lỗi thật 28/09/2026).
  //
  // Bỏ qua `channelId: "pending"`: đó là bản ghi của ticket mở nhưng tạo
  // kênh hỏng (thiếu quyền / trần 500 kênh) — chưa có kênh thật nên
  // `<#pending>` là link chết hiện ra cho người dùng.
  if (state.openChannelId && state.openChannelId !== "pending") {
    return { ok: false, code: "errAlreadyOpen", channelId: state.openChannelId };
  }

  if (!decision.ok) {
    if (decision.reason === "cooldown") {
      return { ok: false, code: "errCooldown", waitHours: decision.waitHours };
    }
    return { ok: false, code: "errMaxOpen", max: decision.max, count: state.openCount };
  }

  if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return { ok: false, code: "errNoPerm" };
  }

  const rootCategory = guild.channels.cache.get(categoryId);
  if (!rootCategory) return { ok: false, code: "errNoCategory" };

  // Category CON theo loại (chủ server bật). Server nhiều loại không muốn tất
  // cả kênh dồn chung 1 chỗ.
  //
  // Lỗi tạo category → dùng luôn category cha thay vì hỏng cả lượt mở
  // ticket: người dùng đã bấm nút rồi, mất ticket tệ hơn là kênh nằm chỗ
  // kém đẹp.
  let category = rootCategory;
  if (config?.ticketCategoryPerKind === true) {
    try {
      category =
        (await guild.channels.create({
          name: core.sanitizeChannelName(
            `tk-${(kinds.find((k) => k.key === kindKey)?.label ?? kindKey).toLowerCase()}`,
          ),
          type: ChannelType.GuildCategory,
          parent: rootCategory,
          reason: `Phân loại ticket ${kindKey}`,
        })) ?? rootCategory;
    } catch (e) {
      console.error(`[tickets] tạo category con thất bại ${guild.id}:`, e.message);
      category = rootCategory;
    }
  }

  // Số thứ tự: dùng chung bộ đếm mod case (một dãy số duy nhất trong server).
  // Ghi bản ghi TRƯỚC khi tạo kênh để lấy số, rồi tạo kênh, rồi cập nhật
  // channelId — nếu tạo kênh lỗi thì bản ghi vẫn có (staff thấy lỗi trên web).
  const cleanBody = core.sanitizeBody(body);
  const cleanEvidence = evidence ? core.sanitizeBody(evidence, core.EVIDENCE_MAX) : "";

  let number = state.openCount;
  let ticketId;
  try {
    const rec = await store.client.mutation("bot_writes:botOpenTicket", {
      guildId: guild.id,
      // Chưa có kênh thật lúc này — ghi "pending" rồi điền lại bằng
      // botSetTicketChannel ngay dưới. Xem ghi chú ở mutation đó.
      channelId: "pending",
      kind: kindKey,
      openerId: user.id,
      openerName: user.username || user.id,
      body: cleanBody,
      evidence: cleanEvidence,
      // Ô bổ sung: chỉ ghi ô CÓ giá trị, giá trị đã escape + cắt sẵn ở
      // `collectExtraValues`. `key` bỏ hẳn vì không ai đọc lại nó.
      fields: extraValues.map((f) => ({ label: f.label, value: f.value })),
      source,
    });
    number = rec?.number ?? number;
    ticketId = rec?.ticketId;
  } catch (e) {
    // Không ghi được bản ghi = không dựng được ticket (mất dấu vết). Dừng.
    console.error(`[tickets] ghi bản ghi thất bại ${guild.id}:`, e.message);
    return { ok: false, code: "errNoPerm" };
  }

  // Tên kênh theo MẪU của chủ server ({number} {user} {kind}); không đặt
  // mẫu thì rơi về `ticket-<số>` như trước.
  const channelName = core.buildChannelNameFromTemplate({
    template: config?.ticketChannelTemplate,
    username: user.username,
    number,
    kind: kindKey,
  });
  let channel;
  try {
    channel = await createTicketChannel({
      guild,
      category,
      channelName,
      openerId: openerOnly ? user.id : null,
      staffIds,
      openerOnly: Boolean(openerOnly),
      closeNote: config?.ticketCloseNote,
      slowmodeSec: config?.ticketSlowmodeSec,
      isPublic: config?.ticketChannelPublic === true,
    });
  } catch (e) {
    const kindErr = describeGuildError(e);
    console.error(`[tickets] tạo kênh thất bại ${guild.id}:`, e.message);
    // KHÔNG đóng bản ghi ở đây: ticket đã "mở" trong hệ thống nhưng tạo kênh
    // hỏng thì staff cần THẤY nó trên dashboard kèm lý do (thiếu quyền, chạm
    // trần 500 kênh…). Xoá dấu vết ở đây là thông tin biến mất im lặng.
    try {
      await store.client.mutation("bot_writes:botSetTicketChannel", {
        guildId: guild.id,
        ticketId,
        channelId: "pending",
        openError: kindErr,
      });
    } catch {
      // không ghi được nữa thì bỏ — console đã có dòng lỗi ở trên
    }
    return { ok: false, code: CHANNEL_ERR_CODE[kindErr] || "errUnknown" };
  }

  // Lời dặn của chủ server dán ở ĐẦU kênh, TRÊN nội dung khiếu nại: staff
  // thấy ngay "cần gì / trễ bao lâu" thay vì phải cuộn, và thành viên biết
  // mình đang ở đâu. Rỗng thì KHÔNG gửi embed rỗng ra kênh ticket.
  const note = openNoteEmbed({
    T,
    customNote: config?.ticketOpenNote,
    openerName: user.username || user.id,
    number,
    serverName: guild.name,
    customColor: config?.ticketOpenPanelColor,
  });
  if (note) {
    try {
      await channel.send({ embeds: [note] });
    } catch (e) {
      console.error(`[tickets] gửi lời dặn thất bại ${channel.id}:`, e.message);
    }
  }

  const payload = core.buildOpenPayload({
    TICKET_TEXT: T,
    number,
    kind: kindKey,
    kindLabel: kinds.find((k) => k.key === kindKey)?.label,
    openerName: user.username || user.id,
    openedById: user.id,
    body: cleanBody,
    evidence: cleanEvidence,
    extraFields: extraValues,
  });
  const embed = new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle(payload.title)
    .addFields(payload.fields)
    .setFooter({ text: payload.footer })
    .setTimestamp();

  // Panel điều khiển (nút đóng / đóng kèm lý do / nhận việc) + tag role staff
  // tuỳ chọn của chủ server. Gửi thành 2 tin nhắn: tin đầu là nội dung khiếu
  // nại (staff đọc), tin sau là panel thao tác. Gộp 1 tin sẽ mất footer và
  // làm nội dung dài trôi khỏi màn hình.
  try {
    await channel.send({ embeds: [embed] });
  } catch (e) {
    console.error(`[tickets] gửi embed thất bại ${channel.id}:`, e.message);
  }

  const panel = buildPanel({
    T,
    ticketKindLabel: kinds.find((k) => k.key === kindKey)?.label ?? kindKey,
    openerName: core.escapeMentions(user.username || user.id),
    number,
    idleHours: config?.ticketIdleHours,
    pingRoles: core.buildRoleMentions(config?.ticketPingRoleIds),
    customText: config?.ticketPanelText,
  });
  try {
    await channel.send({ ...panel, components: panelRows(T, ticketId) });
  } catch (e) {
    console.error(`[tickets] gửi panel thất bại ${channel.id}:`, e.message);
  }

  // Cập nhật channelId thật vào bản ghi.
  try {
    await store.client.mutation("bot_writes:botSetTicketChannel", {
      guildId: guild.id,
      ticketId,
      channelId: channel.id,
    });
  } catch (e) {
    console.error(`[tickets] cập nhật channelId thất bại:`, e.message);
  }

  // DM cho người mở kèm link kênh. Lý do: họ bấm nút ở kênh công khai và
  // KHÔNG nhìn thấy tin nhắn ephemeral trả lời của bot — không có link trong
  // DM thì phải tự đi tìm kênh ticket vừa tạo.
  //
  // Best-effort: người dùng tắt tin nhắn riêng là chuyện của họ, KHÔNG được
  // để nó làm hỏng luồng mở ticket (kênh đã tạo xong, staff đã thấy rồi).
  if (config?.ticketDmOnOpen !== false) {
    await sendOpenDm(
      client,
      user,
      openDmEmbed({
        T,
        guildId: guild.id,
        serverName: guild.name,
        number,
        channelId: channel.id,
      }),
    );
  }

  return { ok: true, channelId: channel.id, number };
}

/**
 * Lời dặn của chủ server dán ở đầu kênh ticket.
 *
 * Rỗng → trả `null` để `openTicket` bỏ qua (KHÔNG gửi embed trắng).
 *
 * ⚠️ Nội dung do CHỦ SERVER soạn nên bắt buộc đi qua `core.fillPanelText` —
 * hàm đó escape mention. Không escape thì lời dặn gõ `@everyone` là bot ping
 * cả server ngay khi thành viên vừa mở ticket.
 */
function openNoteEmbed({ T, customNote, openerName, number, serverName, customColor }) {
  const raw = String(customNote ?? "").trim();
  if (!raw) return null;
  const text = core.fillPanelText(
    raw,
    {
      user: String(openerName ?? ""),
      number: String(number ?? ""),
      kind: core.normalizeKind("support"),
      server: String(serverName ?? ""),
    },
    T,
  );
  return new EmbedBuilder()
    .setColor(core.parsePanelColor(customColor, Colors.Blurple))
    .setTitle(T.openNoteTitle)
    .setDescription(text)
    .setFooter({ text: "Protogon · Ticket" })
    .setTimestamp();
}

/** Embed DM báo "ticket của bạn đã mở" kèm link tới kênh. */
function openDmEmbed({ T, guildId, serverName, number, channelId }) {
  const server = core.escapeMentions(String(serverName ?? "").slice(0, 100));
  return new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle(T.openDmTitle)
    .setDescription(
      T.openDmBody
        .replace("{n}", String(number ?? ""))
        .replace("{server}", server)
        // Link kênh Discord cần CẢ guildId lẫn channelId — thiếu guildId thì
        // link mở ra trang trắng thay vì kênh ticket vừa tạo.
        .replace("{link}", `https://discord.com/channels/${guildId}/${channelId}`),
    )
    .setFooter({ text: "Protogon · Ticket" })
    .setTimestamp();
}

/**
 * Gửi DM cho người mở ticket. Trả `true` nếu gửi được.
 *
 * Nuốt lỗi thay vì ném: DM là tiện ích, không phải điều kiện để mở ticket.
 * Người dùng tắt tin nhắn riêng là chuyện thường, không được ghi vào log
 * như lỗi hệ thống.
 */
async function sendOpenDm(client, user, embed) {
  try {
    const dmUser = await client.users.fetch(user.id);
    await dmUser.send({ embeds: [embed] });
    return true;
  } catch (e) {
    console.log(`[tickets] không gửi được DM cho ${user?.id || "?"}: ${e?.message || e}`);
    return false;
  }
}

/**
 * Đóng ticket: thu quyền người gọi, đổi tên kênh, chặn @everyone.
 *
 * KHÔNG xoá kênh — xoá là mất transcript, mà transcript mới là thứ staff cần
 * đọc lại khi có khiếu nại tiếp theo. Việc dọn kênh (status `locked`) để đợt
 * sau khi có job quét.
 */
async function closeTicketChannel({ guild, channel, openerId }) {
  if (openerId) {
    try {
      await channel.permissionOverwrites.edit(openerId, {
        ViewChannel: false,
        SendMessages: false,
      });
    } catch {
      // Kênh đã bị xoá hoặc bot thấp hơn — vẫn đóng tiếp.
    }
  }
  try {
    const base = channel.name.replace(/^closed-/, "");
    const closedName = `closed-${base}`.slice(0, CHANNEL_NAME_MAX);
    await channel.setName(closedName);
  } catch {
    // Tên đã đúng dạng hoặc thiếu quyền — không chặn việc đóng.
  }
  try {
    await channel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false });
  } catch {
    // bỏ qua
  }
}

/**
 * Embed kèm theo DM khi bị ban.
 *
 * ⚠️ `reason` do bot/mod tự soạn và có thể chứa `<@&id>` (mention role do
 * người khác gõ vào lý do). Không escape thì chính bot sẽ ping role đó khi
 * gửi DM — lỗi rò tin ngay trong tin nhắn riêng. Vì vậy escape.
 */
function banNoticeEmbed({ guild, reason, T }) {
  return new EmbedBuilder()
    .setColor(Colors.Red)
    .setTitle(T.openedTitle.replace("{n}", ""))
    .setDescription(
      [
        `Bạn đã bị ban khỏi **${guild.name}**.`,
        reason ? `\n**Lý do:** ${core.escapeMentions(String(reason).slice(0, 500))}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .setTimestamp();
}

/** Nút "Mở khiếu nại" trong DM. */
function dmButtonRow(T) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_open_dm")
      .setLabel(T.modalTitle)
      .setStyle(ButtonStyle.Primary),
  );
}

/** Modal hỏi nội dung khiếu nại (điểm vào A). */
function appealModal(T) {
  return new ModalBuilder()
    .setCustomId("ticket_appeal_dm")
    .setTitle(T.modalTitle)
    .addComponents(
      new TextInputBuilder()
        .setCustomId("ticket_body")
        .setLabel(T.modalAppealLabel)
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(core.BODY_MAX),
      new TextInputBuilder()
        .setCustomId("ticket_evidence")
        .setLabel(T.modalEvidenceLabel)
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(core.EVIDENCE_MAX),
    );
}

/** Modal ghi chú AI (nút trong kênh ticket). */
function aiModal(T) {
  return new ModalBuilder()
    .setCustomId("ticket_ai_note")
    .setTitle(T.btnAi)
    .addComponents(
      new TextInputBuilder()
        .setCustomId("ticket_ai_body")
        .setLabel(T.aiLabel)
        .setPlaceholder(T.aiPlaceholder)
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000),
    );
}

/** Dựng mã hoá chuỗi để dán vào embed (an toàn khi staff bấm nhầm payload). */
function escapePayload(text) {
  return core.sanitizeBody(text, 800);
}

/* ══════════════════════════════════════════════════════════════════════
   PANEL MỞ TICKET — nút cho THÀNH VIÊN tự mở ticket
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Panel dán vào kênh công khai: 2 nút (Hỗ trợ / Khiếu nại).
 *
 * Khác panel trong kênh ticket (`buildPanel`): panel này cho NGƯỜI DÙNG bấm,
 * và panel kia cho STAFF thao tác. Hai chiều không được lẫn — nhân viên mở
 * ticket hộ thành viên là mất dấu vết ai thực sự cần hỗ trợ.
 *
 * ⚠️ Mọi nội dung chủ server soạn (`customText`) đi qua core.fillPanelText
 * (escape mention) — nếu không, chủ server dán `@everyone` trong ô nội dung
 * là bot ping cả server từ tin nhắn của họ.
 */
function openPanel({
  T,
  customTitle,
  customText,
  customColor,
  showAppeal = true,
  kinds = null,
  serverName = "",
  openCount = 0,
}) {
  // fillPanelText("") trả về `T.panelTitle` đã bỏ placeholder — dành cho panel
  // TRONG KÊNH TICKET, không phải panel mở. Rỗng thì phải lấy openPanelBody.
  const custom = String(customText ?? "").trim();
  const values = {
    server: String(serverName || "").slice(0, 100),
    open: String(openCount ?? 0),
    support: T.openSupport,
  };
  const body = custom ? core.fillPanelText(custom, values, T) : T.openPanelBody;
  const color = core.parsePanelColor(customColor, Colors.Blurple);
  const title = String(customTitle ?? "").trim()
    ? core.escapeMentions(String(customTitle).trim().slice(0, 256))
    : T.openPanelTitle;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(body)
    .setFooter({ text: "Protogon · Ticket" })
    .setTimestamp();

  // Nút lấy từ DANH SÁCH LOẠI của server (rỗng → đúng 2 loại cũ).
  //
  // \`showAppeal\` vẫn có tác dụng với mọi danh sách: nó ẩn loại có khoá
  // "appeal" — khoá này là loại KHIẾU NẠI mặc định, nên server đã bỏ nút đó
  // không đợi loại tuỳ chỉnh mới thấy nút biến mất.
  const allKinds = core.normalizeKinds(kinds, T);
  const visible = showAppeal ? allKinds : allKinds.filter((k) => k.key !== "appeal");
  // Không còn loại nào sau khi lọc (server chỉ có "appeal" + tắt nút) → vẫn
  // dán panel kèm nút: tin nhắn không có components KHÔNG phải lỗi, nhưng
  // server mất hoàn toàn đường mở ticket.
  const specs = core.buildPanelButtons(visible.length > 0 ? visible : allKinds);

  // Discord: tối đa 5 nút 1 hàng, 5 hàng 1 tin. Chia hàng 5 — tràn sẽ bị API
  // từ chối và mất CẢ panel.
  const rows = [];
  for (let i = 0; i < specs.length; i += 5) {
    const buttons = specs.slice(i, i + 5).map((spec) => {
      const b = new ButtonBuilder()
        .setCustomId(spec.customId)
        .setLabel(spec.label)
        .setStyle(spec.style === 1 ? ButtonStyle.Primary : ButtonStyle.Secondary);
      if (spec.emoji) b.setEmoji(spec.emoji);
      return b;
    });
    rows.push(new ActionRowBuilder().addComponents(buttons));
  }
  return {
    embeds: [embed],
    components: rows,
  };
}

/**
 * Modal hỏi thông tin TRƯỚC khi tạo kênh (như Ticket Tool V2).
 *
 * Vì sao hỏi trước: tạo kênh xong rồi mới nhắn nội dung nghĩa là staff phải
 * chờ, còn người dùng thấy 1 kênh trống rỗng. Hỏi ở modal giúp kênh sinh ra
 * đã có đủ thông tin để trả lời ngay.
 *
 * `kind` = "support" | "appeal" — chỉ quyết định câu hỏi + tiêu đề, phần
 * kiểm tra quyền/giới hạn vẫn do openTicket lo (một nơi duy nhất).
 */
function openModal(T, kind, kinds = null) {
  const list = core.normalizeKinds(kinds, T);
  const spec = core.buildModalSpec(core.findKind(list, kind) ?? list[0], T);
  const rows = [
    new TextInputBuilder()
      .setCustomId("ticket_body")
      .setLabel(spec.bodyLabel)
      .setPlaceholder(spec.bodyPlaceholder)
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(core.BODY_MAX),
    new TextInputBuilder()
      .setCustomId("ticket_evidence")
      .setLabel(spec.evidenceLabel)
      .setPlaceholder(spec.evidencePlaceholder)
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(core.EVIDENCE_MAX),
  ];
  // Ô bổ sung do chủ server thêm. `long` → ô nhiều dòng; ô ngắn cắt 300 ký tự
  // (trần thực tế của ô Short trên Discord là 4000 nhưng ô 1 dòng hiển thị
  // vừa đủ, nhập dài không ai đọc nổi).
  for (const f of spec.extraFields) {
    const b = new TextInputBuilder()
      .setCustomId(f.customId)
      .setLabel(f.label)
      .setStyle(f.long ? TextInputStyle.Paragraph : TextInputStyle.Short);
    if (f.placeholder) b.setPlaceholder(f.placeholder);
    b.setRequired(f.required);
    b.setMaxLength(f.long ? core.BODY_MAX : core.EXTRA_VALUE_MAX);
    rows.push(b);
  }
  return new ModalBuilder().setCustomId(spec.customId).setTitle(spec.title).addComponents(rows);
}

/**
 * Dán panel mở ticket vào kênh chủ server chọn.
 *
 * ⚠️ CỐ TÌNH KHÔNG dùng `buildPanel` (panel trong kênh ticket): panel mở phải
 * là nút MỞ, không phải nút ĐÓNG. Dùng nhầm panel là nút "Đóng" lọt ra kênh
 * công khai — ai bấm cũng đóng được, kể cả người không liên quan.
 */
async function sendOpenPanel(client, store, item) {
  const guild = client.guilds.cache.get(item.guildId);
  if (!guild) {
    // Bot đã rời server → bỏ qua im lặng, KHÔNG spam báo lỗi lên dashboard
    // (người dùng bấm nút sẽ thấy "bot không còn trong server" ở chỗ khác).
    return;
  }
  const config = await store.getConfig(guild.id);
  if (!config?.ticketEnabled || !config.ticketCategoryId || !config.ticketPanelChannelId) {
    await reportPanel(
      store,
      item.guildId,
      "Chưa cấu hình đủ: cần bật ticket + chọn category + chọn kênh dán panel.",
    );
    return;
  }
  const staffIds = staffRoleIds(config);
  if (staffIds.length === 0) {
    await reportPanel(
      store,
      item.guildId,
      "Chưa chọn role staff xử lý ticket — không ai đọc được ticket thành viên mở.",
    );
    return;
  }
  const channel = await client.channels.fetch(item.channelId).catch(() => null);
  if (!channel?.isTextBased()) {
    await reportPanel(
      store,
      item.guildId,
      "Kênh dán panel không tồn tại hoặc bot không xem được — hãy chọn kênh khác.",
    );
    return;
  }
  const T = lang.ticketText(lang.langForGuild(guild));
  // Số ticket đang mở cho placeholder {open} — đọc 1 query, rẻ hơn việc bỏ
  // luôn tính năng (chủ server thích thấy "đang có 3 ticket chờ" trên panel).
  let openCount = 0;
  try {
    const state = await client.query("tickets:botTicketSummary", {
      guildId: guild.id,
      botKey: process.env.PROTOGON_BOT_KEY || undefined,
    });
    openCount = Number(state?.openCount ?? 0) || 0;
  } catch {
    // Không đọc được thì để 0 — panel vẫn dán, chỉ mất con số.
  }

  // Dán bản MỚI trước, xoá bản CŨ sau: nếu xoá trước mà tin mới gửi hỏng,
  // server mất panel hoàn toàn (thành viên không còn đường mở ticket).
  let sent;
  try {
    sent = await channel.send(
      openPanel({
        T,
        customTitle: config.ticketOpenPanelTitle,
        customText: config.ticketOpenPanelText,
        customColor: config.ticketOpenPanelColor,
        showAppeal: config.ticketShowAppealButton !== false,
        kinds: config.ticketKinds,
        serverName: guild.name,
        openCount,
      }),
    );
  } catch (e) {
    console.error(`[tickets] dán panel thất bại ${guild.id}:`, e.message);
    await reportPanel(store, item.guildId, `Không gửi được: ${e.message}`);
    return;
  }
  const oldId = config.ticketPanelMessageId;
  if (oldId && oldId !== sent?.id) {
    try {
      const old = await channel.messages.fetch(oldId);
      if (old?.deletable !== false) await old.delete();
    } catch {
      // Panel cũ đã bị xoá tay / không còn quyền — bỏ qua, không báo lỗi
      // (người dùng vẫn có panel MỚI nên không mất gì).
    }
  }
  await reportPanel(store, item.guildId, null, sent?.id);
}

/** Báo kết quả dán panel về dashboard (xoá cờ + lưu lỗi nếu có). */
async function reportPanel(store, guildId, error, panelMessageId) {
  try {
    await store.client.mutation("guilds:clearTicketPanel", {
      guildId,
      panelMessageId,
      error: error ? String(error).slice(0, 300) : undefined,
    });
  } catch (e) {
    console.error(`[tickets] ghi trạng thái panel thất bại ${guildId}:`, e.message);
  }
}

/** Xử lý danh sách panel mở ticket đã fetch — tách riêng để test được. */
async function processOpenPanelItems(client, store, items) {
  if (!items || items.length === 0) return;
  for (const item of items) {
    try {
      await sendOpenPanel(client, store, item);
    } catch (e) {
      console.error(`[tickets:openPanel] ${item.guildId}:`, e?.message || e);
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════
   PANEL + NHẬN VIỆC + TỰ ĐÓNG (đợt nâng cấp)
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Panel điều khiển ticket gửi vào kênh.
 *
 * Nội dung lấy từ cấu hình "ticketPanelText" của chủ server; rỗng thì dùng
 * mặc định theo ngôn ngữ NGƯỜI MỞ. Hỗ trợ {user} {number} {kind} {idle}.
 *
 * ⚠️ Mọi nội dung đi qua core.fillPanelText — hàm đó escape mention. Đây là
 * hàng rào chống ping cho nội dung do CHỦ SERVER soạn, không chỉ người dùng.
 */
function buildPanel({ T, ticketKindLabel, openerName, number, idleHours, pingRoles, customText }) {
  const hours = core.normalizeIdleHours(idleHours);
  const values = { user: openerName, number, kind: ticketKindLabel, idle: hours };
  const text = core.fillPanelText(customText, values, T);
  const embed = new EmbedBuilder().setColor(Colors.Blurple).setDescription(text).setTimestamp();

  const notes = [];
  if (pingRoles && pingRoles.length) {
    notes.push(String(T.panelPing).replace("{roles}", pingRoles.join(" ")));
  }
  if (hours > 0) {
    notes.push(String(T.panelIdle).replace("{h}", String(hours)));
  }
  if (notes.length) embed.addFields({ name: " ", value: notes.join("\n") });

  return { embeds: [embed], components: panelRows(T, null) };
}

/**
 * Hàng nút trong kênh ticket.
 *
 * ticketId = null → KHÔNG gắn customId, nút bấm không làm gì. Dùng cho hàng
 * hiển thị trong embed mở ticket; hàng có nút thật thì gắn id để bấm được.
 */
function actionRow(T, ticketId) {
  const suffix = ticketId ? ID_SEP + ticketId : "";
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_close" + suffix)
      .setLabel(T.btnClose)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ticket_close_reason" + suffix)
      .setLabel(T.btnCloseReason)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("ticket_claim" + suffix)
      .setLabel(T.btnClaim)
      .setStyle(ButtonStyle.Primary),
  );
}

/** Hàng nút phụ: gỡ ban / ghim / ghi chú AI / tự đóng (tách khỏi hàng chính). */
function extraRow(T, ticketId) {
  const suffix = ticketId ? ID_SEP + ticketId : "";
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_unban" + suffix)
      .setLabel(T.btnUnban)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("ticket_pin" + suffix)
      .setLabel(T.btnPin)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ticket_ai" + suffix)
      .setLabel(T.btnAi)
      .setStyle(ButtonStyle.Secondary),
    // Cho CHÍNH người mở tự đóng — không bắt họ chờ staff rảnh tay mới đóng
    // được. Handler chặn lại bằng `row.openerId` nên ai khác bấm cũng vô nghĩa.
    new ButtonBuilder()
      .setCustomId("ticket_close_own" + suffix)
      .setLabel(T.btnCloseOwn)
      .setStyle(ButtonStyle.Secondary),
  );
}

/**
 * TOÀN BỘ nút của panel.
 *
 * ⚠️ Discord chỉ cho tối đa 5 nút mỗi hàng, nên 6 nút phải chia 2 hàng.
 * Gom 6 nút vào 1 hàng sẽ khiến `send()` ném lỗi và panel KHÔNG hiện — mất
 * luôn cả nút Gỡ ban (hành động phạt nặng).
 */
function panelRows(T, ticketId) {
  return [actionRow(T, ticketId), extraRow(T, ticketId)];
}

/** Hàng nút cho người đã nhận (claim rồi) — cho nút "Bỏ nhận". */
function claimedRow(T, ticketId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_unclaim" + ID_SEP + ticketId)
      .setLabel(T.btnUnclaim)
      .setStyle(ButtonStyle.Secondary),
  );
}

/** Modal "Đóng kèm lý do" — lý do bắt buộc vì staff và người mở đều thấy. */
function closeReasonModal(T, ticketId) {
  return new ModalBuilder()
    .setCustomId("ticket_close_reason_submit:" + ticketId)
    .setTitle(T.reasonModalTitle)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("ticket_close_reason_body")
          .setLabel(T.reasonModalLabel)
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder(T.reasonModalPlaceholder)
          .setRequired(true)
          .setMaxLength(core.CLOSE_REASON_MAX),
      ),
    );
}

/**
 * Đóng ticket kèm lý do — dùng chung cho nút bấm tay và cho tự đóng.
 *
 * Không tự reply: hai đường gọi khác kiểu interaction (bấm tay vs job nền).
 */
async function closeTicketWithReason({
  guild,
  channel,
  store,
  ticketId,
  closedById,
  closedByName,
  reason,
  unbanned,
  graceHours,
  T,
}) {
  await closeTicketChannel({ guild, channel, openerId: null });
  let closed = false;
  try {
    await store.client.mutation("bot_writes:botCloseTicket", {
      guildId: guild.id,
      ticketId,
      status: "closed",
      closedById,
      closedByName,
      closeReason: reason,
      unbanned: !!unbanned,
    });
    closed = true;
  } catch (e) {
    console.error(`[tickets] ghi trạng thái đóng thất bại ${guild.id}:`, e.message);
  }
  const grace = core.normalizeGraceHours(graceHours);
  const embed = new EmbedBuilder()
    .setColor(Colors.Grey)
    .setTitle(T.closedTitle)
    .setDescription(
      reason ? String(T.closedWithReason).replace("{reason}", reason) : String(T.closeNote || ""),
    )
    .addFields(
      { name: T.closedBy, value: closedByName || "—", inline: true },
      { name: " ", value: `⏳ ${grace}h`, inline: true },
    )
    .setTimestamp(Date.now());
  try {
    await channel.send({ embeds: [embed] });
  } catch {
    // Kênh vừa bị thu quyền người mở — staff vẫn gửi được.
  }
  return { closed, graceHours: grace };
}

/**
 * Dựng transcript rồi lưu vào Convex storage.
 *
 * ⚠️ THỨ TỰ BẮT BUỘC: ghi file TRƯỚC, xác nhận thành công rồi mới cho phép
 * xoá kênh. Xoá kênh Discord là không hoàn tác — mất transcript là mất
 * bằng chứng khiếu nại, tệ hơn nhiều so với giữ kênh lâu hơn.
 *
 * Trả false khi KHÔNG lưu được — khi đó KHÔNG xoá kênh.
 */
async function saveTranscript({ store, guild, channel, ticketId, maxMessages }) {
  let messages;
  try {
    messages = await channel.messages.fetch({ limit: maxMessages || 200 });
  } catch (e) {
    console.error(`[tickets] đọc transcript thất bại ${guild.id}:`, e.message);
    return false;
  }
  const list = [...messages.values()]
    .sort((a, b) => (a.createdTimestamp || 0) - (b.createdTimestamp || 0))
    .map((m) => ({
      id: m.id,
      at: m.createdTimestamp || 0,
      author: m.author?.username || m.author?.id || "?",
      authorId: m.author?.id || "",
      content: core.sanitizeBody(m.content || "", 1500),
      attachments: (m.attachments || []).map((a) => a.url).slice(0, 5),
      embeds: (m.embeds || []).length,
    }));
  const payload = {
    guildId: guild.id,
    guildName: guild.name,
    channelId: channel.id,
    channelName: channel.name,
    ticketId,
    savedAt: Date.now(),
    messageCount: list.length,
    messages: list,
  };
  try {
    const storageId = await store.client.storage.store(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    );
    await store.client.mutation("bot_writes:botSaveTicketTranscript", {
      guildId: guild.id,
      ticketId,
      storageId,
    });
    return true;
  } catch (e) {
    console.error(`[tickets] lưu transcript thất bại ${guild.id}:`, e.message);
    return false;
  }
}

module.exports = {
  CHANNEL_NAME_MAX,
  DISCORD_MAX_CHANNELS,
  staffRoleIds,
  langFor,
  actionRow,
  parseTicketId,
  describeGuildError,
  createTicketChannel,
  openTicket,
  openNoteEmbed,
  openDmEmbed,
  sendOpenDm,
  closeTicketChannel,
  banNoticeEmbed,
  dmButtonRow,
  appealModal,
  aiModal,
  openPanel,
  openModal,
  sendOpenPanel,
  processOpenPanelItems,
  escapePayload,
  ID_SEP,
  buildPanel,
  extraRow,
  panelRows,
  claimedRow,
  closeReasonModal,
  closeTicketWithReason,
  saveTranscript,
};
