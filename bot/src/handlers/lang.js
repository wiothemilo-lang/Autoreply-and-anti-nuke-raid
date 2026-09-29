"use strict";
/**
 * lang.js — Tự động chọn ngôn ngữ theo QUỐC GIA của server (guild locale).
 *
 * Discord cung cấp `guild.preferredLocale` (locale người chủ server chọn —
 * thực chất phản ánh quốc gia/ngôn ngữ cộng đồng). Bot không cần hỏi ai:
 *   - Locale thuộc ngôn ngữ bot hỗ trợ (vi, en, de) → dùng ngay.
 *   - Quốc gia KHÁC (ja, ko, ru, fr, es-BR…) → mặc định EN (tiếng Anh là
 *     lingua franca — đúng yêu cầu "các nước chưa có ngôn ngữ riêng → EN").
 *
 * Ứng dụng:
 *   - welcome/goodbye: tin nhắn chào/tạm biệt đúng ngôn ngữ cộng đồng.
 *   - incidentReport (AI): báo cáo tình hình server viết theo ngôn ngữ server.
 *
 * Thiết kế lá (0 I/O, 0 token): map thuần, không phụ thuộc Discord SDK,
 * test được hermetic hoàn toàn.
 */

/** Ngôn ngữ bot hỗ trợ bản dịch UI + template đi kèm. */
const SUPPORTED = new Set(["vi", "en", "de"]);

/**
 * Map locale Discord → ngôn ngữ.
 * Discord locale gồm cả nhóm ngôn ngữ (vi, ja, ko, zh-CN…) và biến thể vùng
 * (en-US, pt-BR, es-ES…). Ta chỉ quan tâm PHẦN NGÔN NGỮ (trước gạch nối).
 */
function langForLocale(locale) {
  const raw = String(locale || "").trim();
  if (!raw) return "vi"; // server không đặt locale → sản phẩm gốc tiếng Việt
  // Chuẩn hoá: "en-US" → "en", "pt-BR" → "pt" (locale Discord dùng "-" hoặc "_").
  const base = raw.toLowerCase().split(/[-_]/)[0];
  if (SUPPORTED.has(base)) return base;
  // en-* (en-GB, en-AU…) đã gộp ở base === "en" phía trên.
  // Mọi quốc gia chưa được hỗ trợ bản dịch riêng → EN mặc định.
  return "en";
}

/**
 * Ngôn ngữ cho một guild — biến locale tùy chọn (guild thật hay test mock).
 * guild.preferredLocale có thể là string hoặc object { code } (tùy phiên bản
 * discord.js) → đọc cả hai dạng, không crash với dữ liệu lạ.
 */
function langForGuild(guildLike) {
  const raw = guildLike?.preferredLocale;
  const code = typeof raw === "string" ? raw : typeof raw?.code === "string" ? raw.code : "";
  return langForLocale(code);
}

/**
 * Template welcome/goodbye theo ngôn ngữ. VI giữ nguyên bản gốc (sản phẩm);
 * DE + EN là bản dịch; ngôn ngữ khác không xảy ra ở đây (đã quy về EN/DE/VI).
 */
const WELCOME_TEMPLATES = {
  vi: "Chào mừng {user} đã đến **{server}**! Bạn là thành viên thứ {count} 🎉",
  en: "Welcome {user} to **{server}**! You are member #{count} 🎉",
  de: "Willkommen {user} auf **{server}**! Du bist Mitglied #{count} 🎉",
};
const GOODBYE_TEMPLATES = {
  vi: "{user} đã rời **{server}**. Hẹn gặp lại!",
  en: "{user} has left **{server}**. See you again!",
  de: "{user} hat **{server}** verlassen. Bis bald!",
};

/** Template mặc định welcome theo ngôn ngữ server. */
function welcomeDefault(lang) {
  return WELCOME_TEMPLATES[lang] || WELCOME_TEMPLATES.en;
}
/** Template mặc định goodbye theo ngôn ngữ server. */
function goodbyeDefault(lang) {
  return GOODBYE_TEMPLATES[lang] || GOODBYE_TEMPLATES.en;
}

/**
 * Nhãn in lên THẺ ẢNH chào/tạm biệt theo ngôn ngữ server.
 * Font nhúng chỉ có chữ Latin + dấu tiếng Việt (không có emoji/kana) nên nhãn ở
 * đây phải thuần chữ — emoji sẽ bị welcomeCard bỏ khỏi ảnh.
 */
const CARD_LABELS = {
  vi: { welcome: "CHÀO MỪNG", goodbye: "TẠM BIỆT", member: "Thành viên thứ {count}" },
  en: { welcome: "WELCOME", goodbye: "GOODBYE", member: "Member #{count}" },
  de: { welcome: "WILLKOMMEN", goodbye: "AUF WIEDERSEHEN", member: "Mitglied #{count}" },
};

/** Nhãn thẻ theo ngôn ngữ server (lạ → EN). */
function cardLabels(lang) {
  return CARD_LABELS[lang] || CARD_LABELS.en;
}

/**
 * NGÔN NGỮ THEO TỪNG NGƯỜI DÙNG (dùng cho ticket) — ưu tiên NGƯỜI hơn SERVER.
 *
 * Vì sao không dùng IP: Discord KHÔNG BAO GIỜ cấp IP người dùng cho bot
 * (chính vì vậy tầng "VPN detection" ở altDetection.js đã bị gỡ — dòng
 * "Discord does NOT expose real IPs"). Tín hiệu per-user Discord CẤP cho
 * bot là locale client của người đó:
 *   - `interaction.locale` — ngôn ngữ client khi bấm nút (chính xác nhất).
 *   - `user.locale` — ngôn ngữ tài khoản Discord (đọc được khi chỉ có user).
 * Thứ tự: interaction → user → guild → VI.
 *
 * `guild` là tuỳ chọn: nơi gọi chỉ có user (DM cho người bị ban) vẫn chạy
 * được, chỉ mất tầng dự phòng guild.
 */
function langForUser(interactionOrUser, guildLike = null) {
  const i = interactionOrUser;
  // Interaction: locale (người bấm) được ưu tiên tuyệt đối.
  if (i && typeof i.locale === "string" && i.locale) return langForLocale(i.locale);
  const user = i && i.user ? i.user : i;
  if (user && typeof user.locale === "string" && user.locale) return langForLocale(user.locale);
  if (guildLike) return langForGuild(guildLike);
  return "vi";
}

/** Nhãn 2 loại ticket theo ngôn ngữ (ticket "khiếu nại" vs "hỗ trợ chung"). */
const TICKET_KINDS = {
  vi: {
    appeal: "Khiếu nại",
    support: "Hỗ trợ chung",
  },
  en: { appeal: "Appeal", support: "General support" },
  de: { appeal: "Beschwerde", support: "Allgemeiner Support" },
};

/** Nhãn loại ticket (lạ → EN). */
function ticketKind(lang, kind) {
  const table = TICKET_KINDS[lang] || TICKET_KINDS.en;
  return table[kind] || TICKET_KINDS.en[kind] || kind;
}

/**
 * Chuỗi ticket theo ngôn ngữ NGƯỜI DÙNG.
 *
 * Ghi chú bảo mật: chuỗi nào dán vào embed KÊNH đều đã escape mention ở
 * `ticketCore.js` (`escapeMentions`) — bảng này chỉ chứa phần cứng.
 */
const TICKET_TEXT = {
  vi: {
    openedTitle: "Khiếu nại #{n}",
    supportTitle: "Hỗ trợ #{n}",
    openedBy: "Người mở",
    type: "Loại",
    status: "Trạng thái",
    body: "Nội dung",
    evidence: "Bằng chứng",
    noEvidence: "—",
    staffOnboard:
      "Staff: hãy phản hồi trực tiếp trong kênh này. Người dùng cần giải đáp hoặc muốn báo cáo chuyện gì — kể cả báo cáo về chính bot.",
    // Nút
    btnClose: "Đóng",
    btnUnban: "Gỡ ban",
    btnPin: "Ghim",
    btnAi: "Ghi chú AI",
    // Modal
    modalTitle: "Mở khiếu nại",
    modalAppealLabel: "Bạn cho rằng mình bị phạt oan vì…",
    modalEvidenceLabel: "Bằng chứng hoặc tên người bị cho là có (tuỳ chọn)",
    // Lỗi / phản hồi
    errDisabled: "❌ Tính năng ticket đang tắt trên server này.",
    errNoCategory: "❌ Chủ server chưa cấu hình nơi chứa ticket.",
    errNoPerm: "❌ Bot cần quyền **Quản lý kênh** để mở ticket.",
    errBotAccount: "❌ Tài khoản bot không thể mở ticket.",
    errNoGuild: "❌ Lệnh này chỉ hoạt động trong server.",
    errBanned:
      "❌ Bạn đang bị ban nên không thể dùng lệnh này. Nếu đã nhận DM từ bot, hãy bấm nút **Mở khiếu nại** trong đó.",
    errCooldown: "⏳ Bạn vừa mở ticket. Hãy chờ khoảng {h} giờ rồi thử lại.",
    errMaxOpen:
      "❌ Server hiện đang có {n} ticket mở — vượt giới hạn ({max}). Vui lòng chờ staff xử lý.",
    errAlreadyOpen: "ℹ️ Bạn đã có một ticket đang mở: {ch}.",
    errRequiredFields: "❌ Bạn cần điền: {fields}",
    errHierarchy: "❌ Bot cần role cao hơn bạn để cấp quyền xem kênh ticket.",
    errChannelsFull: "❌ Server đã đạt giới hạn 500 kênh của Discord — không thể tạo ticket mới.",
    errNoStaff: "❌ Chủ server chưa cấu hình role staff xử lý ticket.",
    /** Bản ghi không còn / đã đóng — KHÔNG phải lỗi quyền. */
    errTicketGone: "⚠️ Ticket này không còn mở (đã đóng hoặc không còn trong hệ thống).",
    errLocked: "🔒 Server đang bị khoá do raid — không thể mở ticket lúc này.",
    errUnknown: "❌ Không mở được ticket — chủ server hãy kiểm tra lại cấu hình.",
    okOpened: "✅ Đã mở ticket: {ch}",
    myTicket: "🎫 Ticket của bạn đang mở: {ch}\\n[Mở kênh ticket]({link})",
    myTicketNone: "ℹ️ Bạn không có ticket nào đang mở. Dùng `/ticket mo` để mở mới.",
    myTicketGone:
      "⚠️ Hệ thống còn ticket đang mở của bạn nhưng kênh đã bị xoá. Hãy dùng `/ticket mo` để mở ticket mới.",
    okSent: "✅ Đã gửi khiếu nại. Ban quản trị sẽ xem và phản hồi.",
    dmFailed: "⚠️ Không gửi được DM (bạn có thể đã tắt tin nhắn riêng từ server).",
    closedTitle: "Đã đóng",
    closedBy: "Đóng bởi",
    closeNote: "Ghi chú khi đóng",
    unbannedNote: "✅ Đã gỡ ban cho {user}.",
    notBanned: "ℹ️ {user} hiện không bị ban trong server này.",
    aiLabel: "Ghi chú của staff",
    aiPlaceholder: "Tóm tắt ngắn tình hình (tiếng Việt hoặc ngôn ngữ bạn muốn)…",
    aiThinking: "🧠 AI đang đọc ticket…",
    aiEmpty: "Cần nội dung để AI đọc.",
    closedNotice: "🔒 Ticket đã đóng. Bạn không thể gửi tin nhắn nữa.",
    btnCloseReason: "Đóng kèm lý do",
    btnClaim: "Nhận việc",
    btnUnclaim: "Bỏ nhận",
    panelTitle: "Hỗ trợ #{n} · {user}",
    panelPing: "Đã gọi {roles} — vui lòng phản hồi.",
    panelIdle: "Kênh này tự đóng sau {h} giờ không ai trả lời.",
    claimDone: "✅ {staff} đã nhận ticket này.",
    claimTaken: "🔒 Ticket đã có {staff} nhận từ trước.",
    claimMine: "✅ Bạn đã nhận ticket này.",
    claimClosed: "🔒 Ticket này đã đóng — không cần nhận việc nữa.",
    unclaimDone: "✅ Đã bỏ nhận — ai cũng có thể nhận lại.",
    reasonModalTitle: "Đóng ticket kèm lý do",
    reasonModalLabel: "Lý do đóng (staff và người mở đều thấy)",
    reasonModalPlaceholder: "Ví dụ: đã gỡ ban, giải quyết xong.",
    reasonRequired: "Bạn cần nhập lý do để đóng ticket.",
    closedWithReason: "🔒 Đã đóng: {reason}",
    notStaff: "Chỉ staff mới được dùng các nút này.",
    autoClosedTitle: "Đã tự đóng",
    budgetClosedTitle: "Đã đóng vì quá nhiều tin",
    budgetClosedBody:
      "Kênh này đã chạm giới hạn tin nhắn nên bot đóng lại. Nội dung đã được lưu đầy đủ.",
    autoClosedBody:
      "Kênh không có hoạt động nào trong {h} giờ nên bot tự đóng. Kênh sẽ bị xoá sau {g} giờ — nội dung được lưu lại để staff tra cứu.",
    deletedTitle: "Đã lưu và xoá kênh",
    deletedBody: "Kênh đã bị xoá. Toàn bộ nội dung đã được lưu lại cho ban quản trị.",
    langSet: "✅ Đã đặt ngôn ngữ sang **{name}**.",
    langCurrent: "Ngôn ngữ hiện tại của bạn: **{name}**.",
    langDetected: "(tự nhận ra: {name})",
    langAutoNotice: "Mình chưa biết bạn dùng ngôn ngữ nào — nhập `/language` để chọn.",
    // ── Panel MỞ ticket (nút trong kênh công khai) ──
    openPanelTitle: "Cần trợ giúp?",
    openPanelBody:
      "Bấm nút bên dưới, kể lại vấn đề của bạn — bot sẽ mở một **kênh riêng** chỉ bạn và ban quản trị nhìn thấy.\n\n• Cần hỏi hoặc báo cáo chuyện gì → **Hỗ trợ**\n• Bạn bị phạt oan → **Khiếu nại**\n\nBạn chỉ mở được **1 ticket mở tại một thời điểm**; cần thêm thì cứ hỏi tiếp trong kênh đó nhé.",
    openSupport: "💬 Hỗ trợ chung",
    openAppeal: "⚖️ Khiếu nại hình phạt",
    openModalTitleSupport: "Mở ticket hỗ trợ",
    openModalTitleAppeal: "Mở ticket khiếu nại",
    openBodyLabelSupport: "Bạn cần hỗ trợ chuyện gì?",
    openBodyPlaceholderSupport: "Mô tả ngắn gọn vấn đề của bạn…",
    openEvidenceLabel: "Bằng chứng (ảnh chụp, link, tên người) — tuỳ chọn",
    openEvidencePlaceholder: "Dán link ảnh/tin nhắn, hoặc bỏ trống nếu chưa có…",
    openHint: "💡 Trả lời ngay trong kênh ticket vẫn được nhé — nhân viên sẽ thấy và phản hồi bạn.",
    // Nút cho CHÍNH người mở đóng ticket (thân thiện hơn: không bắt phải chờ staff).
    btnCloseOwn: "Tôi tự đóng",
    closeOwnDone: "✅ Đã đóng ticket. Cảm ơn bạn đã báo lại!",
    closeOwnDenied: "Chỉ người mở ticket mới tự đóng được. Bạn có thể nhắn staff trong kênh này.",
    // Lời dặn đầu kênh ticket + DM báo "đã mở" (tuỳ chỉnh của chủ server).
    openNoteTitle: "📌 Trước khi bắt đầu",
    openDmTitle: "✅ Ticket của bạn đã mở",
    openDmBody:
      "Ticket **#{n}** của bạn trong **{server}** đã được mở.\n\nHãy nhắn tin trong [kênh ticket]({link}) để được hỗ trợ — đội ngũ ở đó sẽ phản hồi bạn.",
  },
  en: {
    openedTitle: "Appeal #{n}",
    supportTitle: "Support #{n}",
    openedBy: "Opened by",
    type: "Type",
    status: "Status",
    body: "Message",
    evidence: "Evidence",
    noEvidence: "—",
    staffOnboard:
      "Staff: reply here. The member needs an answer or wants to report something — including the bot itself.",
    btnClose: "Close",
    btnUnban: "Unban",
    btnPin: "Pin",
    btnAi: "AI note",
    modalTitle: "Open an appeal",
    modalAppealLabel: "Why do you think this punishment was a mistake?",
    modalEvidenceLabel: "Evidence or the name you were accused of (optional)",
    errDisabled: "❌ Tickets are turned off on this server.",
    errNoCategory: "❌ The server owner has not set a ticket category yet.",
    errNoPerm: "❌ The bot needs **Manage Channels** to open tickets.",
    errBotAccount: "❌ Bot accounts cannot open tickets.",
    errNoGuild: "❌ This command only works inside a server.",
    errBanned:
      "❌ You are banned from this server, so you cannot use this command. If the bot sent you a DM, press **Open appeal** there.",
    errCooldown: "⏳ You opened a ticket recently. Please try again in about {h} hour(s).",
    errMaxOpen:
      "❌ This server has {n} open ticket(s) — over the limit ({max}). Please wait for staff.",
    errAlreadyOpen: "ℹ️ You already have an open ticket: {ch}.",
    errRequiredFields: "❌ You need to fill in: {fields}",
    errHierarchy: "❌ The bot needs a higher role than you to grant channel access.",
    errChannelsFull: "❌ This server hit Discord's 500 channel limit — cannot create a ticket.",
    errNoStaff: "❌ The server owner has not set a staff role for tickets.",
    errTicketGone: "⚠️ This ticket is no longer open (already closed or no longer tracked).",
    errLocked: "🔒 The server is locked during a raid — tickets cannot be opened right now.",
    errUnknown: "❌ Could not open a ticket — the server owner should double-check the settings.",
    okOpened: "✅ Ticket opened: {ch}",
    myTicket: "🎫 Your open ticket: {ch}\\n[Open the ticket channel]({link})",
    myTicketNone: "ℹ️ You have no open ticket. Use `/ticket mo` to open one.",
    myTicketGone:
      "⚠️ Your ticket is still marked open but its channel was deleted. Use `/ticket mo` to open a new one.",
    okSent: "✅ Appeal sent. The moderators will review and reply.",
    dmFailed: "⚠️ Could not send a DM (you may have server DMs turned off).",
    closedTitle: "Closed",
    closedBy: "Closed by",
    closeNote: "Closing note",
    unbannedNote: "✅ Unbanned {user}.",
    notBanned: "ℹ️ {user} is not currently banned in this server.",
    aiLabel: "Staff note",
    aiPlaceholder: "Short summary of the situation (any language)…",
    aiThinking: "🧠 AI is reading the ticket…",
    aiEmpty: "Nothing for the AI to read.",
    closedNotice: "🔒 This ticket is closed. You can no longer send messages here.",
    btnCloseReason: "Close with reason",
    btnClaim: "Claim",
    btnUnclaim: "Unclaim",
    panelTitle: "Support #{n} · {user}",
    panelPing: "{roles} has been notified — please respond.",
    panelIdle: "This channel closes automatically after {h} hours without a reply.",
    claimDone: "✅ {staff} claimed this ticket.",
    claimTaken: "🔒 This ticket was already claimed by {staff}.",
    claimMine: "✅ You claimed this ticket.",
    claimClosed: "🔒 This ticket is already closed — nothing left to claim.",
    unclaimDone: "✅ Unclaimed — anyone can claim it again.",
    reasonModalTitle: "Close ticket with a reason",
    reasonModalLabel: "Reason for closing (staff and the opener both see it)",
    reasonModalPlaceholder: "Example: unbanned, everything resolved.",
    reasonRequired: "You need a reason to close this ticket.",
    closedWithReason: "🔒 Closed: {reason}",
    notStaff: "Only staff can use these buttons.",
    autoClosedTitle: "Closed automatically",
    budgetClosedTitle: "Closed — message limit reached",
    budgetClosedBody:
      "This channel hit the message limit, so the bot closed it. Everything has been saved.",
    autoClosedBody:
      "No activity for {h} hours, so the bot closed this channel. It will be deleted after {g} hours — the conversation is saved for staff.",
    deletedTitle: "Saved and deleted",
    deletedBody: "This channel was deleted. The full conversation is saved for the moderators.",
    langSet: "✅ Language set to **{name}**.",
    langCurrent: "Your current language: **{name}**.",
    langDetected: "(detected: {name})",
    langAutoNotice: "I don't know your language yet — type `/language` to pick one.",
    openPanelTitle: "Need help?",
    openPanelBody:
      "Tap a button below and tell us what happened — the bot will open a **private channel** only you and the staff can see.\n\n• A question or something to report → **Support**\n• You think a punishment was a mistake → **Appeal**\n\nYou can only have **one open ticket at a time**; just keep talking in that channel if you need more.",
    openSupport: "💬 General support",
    openAppeal: "⚖️ Appeal a punishment",
    openModalTitleSupport: "Open a support ticket",
    openModalTitleAppeal: "Open an appeal ticket",
    openBodyLabelSupport: "What do you need help with?",
    openBodyPlaceholderSupport: "Describe your issue in a few words…",
    openEvidenceLabel: "Evidence (screenshots, links, names) — optional",
    openEvidencePlaceholder: "Paste image/message links, or leave empty if you don't have any…",
    openHint:
      "💡 You can reply right in the ticket channel too — staff will see it and get back to you.",
    btnCloseOwn: "Close it myself",
    closeOwnDone: "✅ Ticket closed. Thanks for letting us know!",
    closeOwnDenied:
      "Only the person who opened this ticket can close it. Just message staff in this channel.",
    openNoteTitle: "📌 Before you start",
    openDmTitle: "✅ Your ticket is open",
    openDmBody:
      "Your ticket **#{n}** in **{server}** is now open.\n\nReply in [your ticket channel]({link}) to get help — the team there will get back to you.",
  },
  de: {
    openedTitle: "Beschwerde #{n}",
    supportTitle: "Support #{n}",
    openedBy: "Eröffnet von",
    type: "Typ",
    status: "Status",
    body: "Nachricht",
    evidence: "Beweis",
    noEvidence: "—",
    staffOnboard:
      "Staff: hier antworten. Das Mitglied braucht eine Antwort oder möchte etwas melden — auch den Bot selbst.",
    btnClose: "Schließen",
    btnUnban: "Entbannen",
    btnPin: "Anheften",
    btnAi: "KI-Notiz",
    modalTitle: "Beschwerde eröffnen",
    modalAppealLabel: "Warum war diese Bestrafung Ihrer Meinung nach ein Fehler?",
    modalEvidenceLabel: "Beweis oder der Name, dem Sie vorgeworfen wurden (optional)",
    errDisabled: "❌ Tickets sind auf diesem Server deaktiviert.",
    errNoCategory: "❌ Der Serverbesitzer hat noch keine Ticket-Kategorie festgelegt.",
    errNoPerm: "❌ Der Bot braucht **Kanäle verwalten**, um Tickets zu eröffnen.",
    errBotAccount: "❌ Bot-Konten können keine Tickets eröffnen.",
    errNoGuild: "❌ Dieser Befehl funktioniert nur auf einem Server.",
    errBanned:
      "❌ Du bist auf diesem Server gesperrt und kannst den Befehl nicht nutzen. Falls der Bot dir eine DM geschickt hat, drücke dort auf **Beschwerde eröffnen**.",
    errCooldown:
      "⏳ Du hast kürzlich ein Ticket eröffnet. Bitte versuche es in etwa {h} Stunde(n) erneut.",
    errMaxOpen:
      "❌ Auf diesem Server sind {n} Ticket(s) offen — über dem Limit ({max}). Bitte warte auf das Team.",
    errAlreadyOpen: "ℹ️ Du hast bereits ein offenes Ticket: {ch}.",
    errRequiredFields: "❌ Du musst ausfüllen: {fields}",
    errHierarchy: "❌ Der Bot braucht eine höhere Rolle als du, um Kanalzugriff zu geben.",
    errChannelsFull: "❌ Dieser Server hat das Discord-Limit von 500 Kanälen erreicht.",
    errNoStaff: "❌ Der Serverbesitzer hat noch keine Staff-Rolle für Tickets festgelegt.",
    errTicketGone:
      "⚠️ Dieses Ticket ist nicht mehr offen (bereits geschlossen oder nicht mehr erfasst).",
    errUnknown:
      "❌ Ticket konnte nicht eröffnet werden — der Serverbesitzer sollte die Einstellungen prüfen.",
    errLocked:
      "🔒 Der Server ist wegen eines Raids gesperrt — Tickets können gerade nicht eröffnet werden.",
    okOpened: "✅ Ticket eröffnet: {ch}",
    myTicket: "🎫 Dein offenes Ticket: {ch}\\n[Ticket-Kanal öffnen]({link})",
    myTicketNone: "ℹ️ Du hast kein offenes Ticket. Nutze `/ticket mo` um eines zu eröffnen.",
    myTicketGone:
      "⚠️ Dein Ticket ist noch als offen markiert, der Kanal wurde aber gelöscht. Nutze `/ticket mo` für ein neues Ticket.",
    okSent: "✅ Beschwerde gesendet. Die Moderation prüft sie und antwortet.",
    dmFailed: "⚠️ DM konnte nicht gesendet werden (Server-DMs sind evtl. deaktiviert).",
    closedTitle: "Geschlossen",
    closedBy: "Geschlossen von",
    closeNote: "Abschlussnotiz",
    unbannedNote: "✅ {user} wurde entbannt.",
    notBanned: "ℹ️ {user} ist derzeit nicht auf diesem Server gesperrt.",
    aiLabel: "Team-Notiz",
    aiPlaceholder: "Kurze Zusammenfassung der Lage (beliebige Sprache)…",
    aiThinking: "🧠 Die KI liest das Ticket…",
    aiEmpty: "Nichts für die KI zum Lesen.",
    closedNotice: "🔒 Dieses Ticket ist geschlossen. Du kannst hier keine Nachrichten mehr senden.",
    btnCloseReason: "Mit Grund schließen",
    btnClaim: "Übernehmen",
    btnUnclaim: "Freigeben",
    panelTitle: "Support #{n} · {user}",
    panelPing: "{roles} wurde benachrichtigt — bitte antworte zeitnah.",
    panelIdle: "Dieser Kanal schließt sich automatisch nach {h} Stunden ohne Antwort.",
    claimDone: "✅ {staff} hat dieses Ticket übernommen.",
    claimTaken: "🔒 Dieses Ticket wurde bereits von {staff} übernommen.",
    claimMine: "✅ Du hast dieses Ticket übernommen.",
    claimClosed: "🔒 Dieses Ticket ist bereits geschlossen — nichts mehr zu übernehmen.",
    unclaimDone: "✅ Freigegeben — es kann wieder übernommen werden.",
    reasonModalTitle: "Ticket mit Grund schließen",
    reasonModalLabel: "Grund für das Schließen (für Team und Ersteller sichtbar)",
    reasonModalPlaceholder: "Beispiel: entbannt, alles geklärt.",
    reasonRequired: "Zum Schließen wird ein Grund benötigt.",
    closedWithReason: "🔒 Geschlossen: {reason}",
    notStaff: "Nur das Team darf diese Schaltflächen nutzen.",
    autoClosedTitle: "Automatisch geschlossen",
    budgetClosedTitle: "Geschlossen — Nachrichtenlimit erreicht",
    budgetClosedBody:
      "Dieser Kanal hat das Nachrichtenlimit erreicht, daher wurde er geschlossen. Alles wurde gespeichert.",
    autoClosedBody:
      "{h} Stunden ohne Aktivität, deshalb hat der Bot den Kanal geschlossen. Er wird nach {g} Stunden gelöscht — das Gespräch bleibt für das Team gespeichert.",
    deletedTitle: "Gesichert und gelöscht",
    deletedBody:
      "Dieser Kanal wurde gelöscht. Das gesamte Gespräch ist für die Moderation gespeichert.",
    langSet: "✅ Sprache auf **{name}** gesetzt.",
    langCurrent: "Deine aktuelle Sprache: **{name}**.",
    langDetected: "(erkannt: {name})",
    langAutoNotice: "Ich kenne deine Sprache noch nicht — tippe `/language`, um eine zu wählen.",
    openPanelTitle: "Hilfe gebraucht?",
    openPanelBody:
      "Klick unten auf eine Schaltfläche und schilder dein Anliegen — der Bot öffnet einen **privaten Kanal**, den nur du und das Team sehen.\n\n• Frage oder etwas zu melden → **Support**\n• Eine Strafe war zu Unrecht → **Anfechten**\n\nDu kannst nur **ein offenes Ticket** haben; schreib einfach im selben Kanal weiter.",
    openSupport: "💬 Allgemeiner Support",
    openAppeal: "⚖️ Strafe anfechten",
    openModalTitleSupport: "Support-Ticket öffnen",
    openModalTitleAppeal: "Beschwerde-Ticket öffnen",
    openBodyLabelSupport: "Wobei brauchst du Hilfe?",
    openBodyPlaceholderSupport: "Beschreib dein Anliegen kurz…",
    openEvidenceLabel: "Beweise (Screenshots, Links, Namen) — optional",
    openEvidencePlaceholder: "Bild-/Nachrichtenlinks einfügen oder leer lassen…",
    openHint: "💡 Du kannst direkt im Ticket-Kanal antworten — das Team sieht es und meldet sich.",
    btnCloseOwn: "Selbst schließen",
    closeOwnDone: "✅ Ticket geschlossen. Danke für deine Meldung!",
    closeOwnDenied:
      "Nur wer das Ticket eröffnet hat, kann es schließen. Schreib dem Team einfach im Kanal.",
    openNoteTitle: "📌 Bevor es losgeht",
    openDmTitle: "✅ Dein Ticket ist offen",
    openDmBody:
      "Dein Ticket **#{n}** in **{server}** ist jetzt offen.\n\nSchreib in [deinem Ticketkanal]({link}), um Hilfe zu bekommen — das Team antwortet dir dort.",
  },
};

/**
 * Chuỗi ticket theo ngôn ngữ (lạ → EN).
 *
 * Hàm thuần trả OBJECT MỚI mỗi lần? Không — trả chính object trong bảng.
 * Vì sao an toàn: các chỗ dùng đều chỉ ĐỌC, không ghi. Nếu sau này có chỗ nào
 * ghi vào, phải `Object.freeze` hoặc copy — ghi chú này để không ai patch bằng
 * cách mutate thầm lặng.
 */
function ticketText(lang) {
  return TICKET_TEXT[lang] || TICKET_TEXT.en;
}

/**
 * Tên ngôn ngữ hiển thị thếb cho `/language` và tin nhắn xác nhận.
 * Tách riêng từ mã ngôn ngữ (ánh hành / từ đề quốc tế) để tránh
 * nhãn đẻ không cửa đẻ dối với chương trình chèa.
 */
const LANG_NAMES = {
  vi: "Tiếng Việt",
  en: "English",
  de: "Deutsch",
};

/** Tên ngôn ngữ (lạ → EN). */
function langName(lang) {
  return LANG_NAMES[lang] || LANG_NAMES.en;
}

/**
 * Đọc ngôn ngữ người dùng ĐÃ CHỌN trước đó.
 *
 * Thứ tự: lựa chọn đã lưu > locale client hiện tại > locale guild > vi.
 * Vì sao lựa chọn đã lưu được ưu tiên tuyệt đối: người dùng đã nói rõ
 * "tôi muốn tiếng Việt" thì việc họ đổi client sang English không được phép
 * lật ngược lại.
 */
async function resolveUserLang(store, interaction, guild) {
  try {
    const row = await store.client.query("bot_writes:botGetUserLang", {
      userId: interaction.user.id,
      botKey: process.env.PROTOGON_BOT_KEY || undefined,
    });
    if (row?.lang && SUPPORTED.has(row.lang)) return row.lang;
  } catch {
    // Chưa có bảng / mất mạng → rơi xuống tự nhận ra locale.
  }
  return langForUser(interaction, guild);
}

/**
 * `/language` — xem hoặc đổi ngôn ngữ của chính mình.
 *
 * Chạy được cả trong server lẫn trong DM: người bị ban không vào được kênh
 * nào nhưng vẫn phải đổi được ngôn ngữ cho các lần khiếu nại sau.
 */
async function languageCommand(store, interaction) {
  const guild = interaction.guild || null;
  const detected = langForUser(interaction, guild);
  const current = await resolveUserLang(store, interaction, guild);
  const T = ticketText(current);

  const option = interaction.options?.getString?.("ngon_ngu");
  if (option) {
    if (!SUPPORTED.has(option)) {
      return interaction.reply({
        content: T.langCurrent.replace("{name}", langName(current)),
        ephemeral: true,
      });
    }
    try {
      await store.client.mutation("bot_writes:botSetUserLang", {
        userId: interaction.user.id,
        lang: option,
        botKey: process.env.PROTOGON_BOT_KEY || undefined,
      });
    } catch (e) {
      // Không lưu được vẫn báo đã đặt: người dùng không nên phải biết kỹ thuật.
      console.error(`[lang] lưu ngôn ngữ thất bại ${interaction.user.id}:`, e.message);
    }
    // Trả lời BẰNG ngôn ngữ mới — đây là bằng chứng nó có tác dụng ngay.
    return interaction.reply({
      content: ticketText(option).langSet.replace("{name}", langName(option)),
      ephemeral: true,
    });
  }

  const suffix =
    current === detected ? "" : " " + T.langDetected.replace("{name}", langName(detected));
  return interaction.reply({
    content: T.langCurrent.replace("{name}", langName(current)) + suffix,
    ephemeral: true,
  });
}

module.exports = {
  SUPPORTED,
  resolveUserLang,
  languageCommand,
  langForLocale,
  langForGuild,
  langForUser,
  welcomeDefault,
  goodbyeDefault,
  cardLabels,
  ticketKind,
  ticketText,
  TICKET_KINDS,
  TICKET_TEXT,
  LANG_NAMES,
  langName,
};
