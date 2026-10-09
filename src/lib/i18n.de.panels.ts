/**
 * i18n.de.panels.ts — Bản dịch DE đợt 2, song song với src/lib/i18n.en.panels.ts.
 * Gồm các mảnh câu bị JSX cắt (dịch từng mảnh sao cho ghép lại đọc tự nhiên),
 * nhãn điều kiện trong {} và nhãn dữ liệu dịch lúc render.
 */
export const DE_PANELS: Record<string, string> = {
  "chưa có dữ liệu": "noch keine Daten",
  "Bot tự đồng bộ dữ liệu (trạng thái, số server, chủ sở hữu) lên máy chủ":
    "Der Bot synchronisiert Daten (Status, Serverzahl, Eigner) zum Backend",
  "mỗi {p0} giây": "alle {p0} Sekunden",
  Tắt: "Aus",
  "module chống nuke bật": "Anti-Nuke-Module an",
  "Hiện có": "Aktuell",
  "signature từ": "Signaturen von",
  nguồn: "Quellen",
  "{p0} mẫu": "{p0} Muster",
  "đang tải…": "wird geladen…",
  "Vụ gần đây": "Neue Fälle",
  lượt: "Treffer",
  "đã ban nguồn cơn": "Quelle gebannt",
  nghi: "Verdächtiger",
  bật: "an",
  "vi phạm": "Verstöße",
  "module đang bật": "Module aktiv",
  "thành viên nhận cảnh báo riêng, rồi tự tăng cấp hình phạt:":
    "erreicht, erhält das Mitglied eine private Verwarnung, dann eskalieren die Strafen:",
  "tái phạm trong {p0} phút": "wiederholt sich innerhalb von {p0} Minuten",
  "sẽ nhận": "erhält es",
  "điểm nhiệt": "Heat-Punkte",
  "Số warn để tăng cấp (0 = tắt)": "Verwarnungen bis zur Eskalation (0 = aus)",
  "Đang bật:": "Aktiv:",
  "trong {p0} phút → tự": "innerhalb von {p0} Minuten → automatisch",
  "(mặc định: {limit} warn / {window} phút).":
    "(Standard: {limit} Verwarnungen / {window} Minuten).",
  "Xóa {p0}": "{p0} entfernen",
  "Áp dụng mọi kênh": "Gilt für alle Kanäle",
  "{p0} kênh được chọn": "{p0} Kanäle ausgewählt",
  "Thêm rule auto reply": "Auto-Reply-Regel hinzufügen",
  "tag người nhắn,": "taggt den Absender,",
  "Chỉ áp dụng cho kênh (bỏ trống = mọi kênh)": "Nur diese Kanäle (leer = alle Kanäle)",
  "Chưa có kênh nào được đồng bộ": "Noch keine Kanäle synchronisiert",
  "Gõ tên kênh để tìm nhanh…": "Kanalnamen zum Filtern tippen…",
  "— khắc phục rồi bấm Backup ngay lại.": "— behebe es und klicke erneut auf Jetzt sichern.",
  "— khắc phục (bot còn trong server, đủ quyền Administrator) rồi bấm Khôi phục lại.":
    "— behebe es (der Bot muss noch im Server mit Administrator sein) und klicke erneut auf Wiederherstellen.",
  "Tạo backup cho": "Backup erstellen für",
  "(danh mục, văn bản, thoại…) kèm quyền truy cập từng kênh, cùng":
    "(Kategorien, Text, Voice…) mit Zugriffsrechten je Kanal, dazu",
  "Backup luôn được lưu trong Convex; đẩy lên GitHub giúp bạn còn giữ được dữ liệu ngay cả khi Convex bị xóa. Mọi server đều dùng chung":
    "Backups liegen immer in Convex; der GitHub-Schiebeweg sichert deine Daten, selbst wenn Convex gelöscht wird. Alle Server teilen sich",
  của: "von",
  hoặc: "oder",
  "), tải file lên đây — bot sẽ": "), lade die Datei hier hoch — der Bot wird",
  "(ảnh/video…) và": "(Bilder/Videos…) und",
  "Bot đang chạy bản cũ ({version}) — cần cập nhật bot lên bản mới nhất (v{min}+) để khôi phục và báo kết quả chính xác.":
    "Der Bot läuft auf einer alten Version ({version}) — aktualisiere ihn auf die neueste (v{min}+), damit Wiederherstellung und Berichte korrekt sind.",
  "không rõ": "unbekannt",
  "— kiểm tra lại file rồi tải lên.": "— prüfe die Datei und lade sie erneut hoch.",
  mỗi: "alle",
  ", tối đa": ", max",
  "Backup gần nhất:": "Neuestes Backup:",
  "· lần tới:": "· nächstes:",
  "Đang tắt — bot chỉ backup khi bạn bấm “Backup ngay” hoặc dùng lệnh.":
    "Aus — der Bot sichert nur, wenn du auf „Jetzt sichern“ klickst oder den Befehl nutzt.",
  "Lưu lịch tự động": "Zeitplan speichern",
  "Bật/tắt từng phần khi bot khôi phục — áp dụng cho":
    "Teile der Wiederherstellung einzeln schalten — gilt für",
  lẫn: "und",
  "Lưu tùy chỉnh khôi phục": "Wiederherstellungsoptionen speichern",
  "(quyền": "(Umfang",
  ") của": ") von",
  "💡 Ngoài dashboard, bạn cũng có thể dùng lệnh trong Discord:":
    "💡 Neben dem Dashboard kannst du auch Discord-Befehle nutzen:",
  "!backup restore <số>": "!backup restore <Nummer>",
  bản: "Backups",
  "Khôi phục vào server này": "In diesen Server wiederherstellen",
  "Đang gửi…": "Wird gesendet…",
  "— thường do người nhận tắt DM hoặc không dùng chung server với bot":
    "— meist weil der Empfänger DMs ausgeschaltet hat oder keinen Server mit dem Bot teilt",
  "Khi bot phát hiện loạt kết nối ứng dụng ngoài vượt ngưỡng module":
    "Erkennt der Bot eine Welle externer App-Verbindungen über den Modulschwellenwert",
  người: "Personen",
  "kết nối": "Verbindungen",
  bởi: "durch",
  "app khác…": "weitere Apps…",
  "Chưa xác định được người dùng — chỉ ghi nhận": "Kein Nutzer identifiziert — nur protokolliert",
  "Không có": "Keine",
  "(ứng dụng mở rộng) được kết nối ồ ạt hoặc app spam vào server — kèm":
    "(Erweiterungs-Apps) werden massenhaft verbunden oder spammen in den Server — mit",
  "đang tắt — bật lại trong mục": "ist aus — wieder einschalten unter",
  "kết thúc": "endet",
  "bất cứ lúc nào": "jederzeit",
  "người tham gia": "Teilnahmen",
  "người thắng": "Gewinner",
  " · 🎖️ cấp role thưởng": " · 🎖️ vergibt eine Preisrolle",
  " · DM người thắng": " · DM an die Gewinner",
  " · 🖼️ có ảnh": " · 🖼️ mit Bild",
  "Hủy thất bại": "Abbrechen fehlgeschlagen",
  "lượt tham gia": "Teilnahmen",
  "Nhiệt giảm {p0} điểm/phút": "Heat sinkt {p0} Punkte/Minute",
  "= tạm khóa": "= Timeout",
  "= cảnh báo": "= Verwarnung",
  "0 = an toàn": "0 = sicher",
  "Xóa nhiệt của {p0}": "Heat von {p0} löschen",
  "Đang bật · {p0} tiêu chí": "An · {p0} Kriterien",
  "Đang tắt": "Aus",
  "hành động gần nhất": "neueste Aktionen",
  "đang bật thông báo": "Hinweise an",
  "Nội dung thông báo sau khi bot": "Hinweisinhalt, nachdem der Bot",
  từ: "von",
  "từ lệnh": "aus dem Befehl",
  Ngưỡng: "Schwelle",
  "= xóa ngay tin vi phạm ·": "= löscht die Verstoß-Nachricht sofort ·",
  "Chưa có role được đồng bộ": "Noch keine Rollen synchronisiert",
  "Gõ tên role để tìm nhanh…": "Rollenname zum Filtern tippen…",
  "Báo cáo hàng ngày:": "Tagesbericht:",
  "lần cuối": "zuletzt",
  "thủ phạm": "Täter",
  "{p0} đang bật": "{p0} aktiviert",
  "Đang bảo vệ": "Geschützt",
  "Đã tắt toàn bộ": "Vollständig deaktiviert",
  "đồng bộ qua bot": "per Bot synchronisiert",
  "Chưa đặt": "Nicht gesetzt",
  "cảnh báo & sự kiện": "Alarme & Ereignisse",
  "đặt trong Cài đặt": "in den Einstellungen gesetzt",
  "Lần cuối đồng bộ:": "Zuletzt synchronisiert:",
  "Chọn từ gợi ý bên dưới hoặc dán emoji tùy chỉnh: emoji unicode, custom emoji":
    "Aus den Vorschlägen unten wählen oder eigenes Emoji einfügen: Unicode-Emoji, Custom-Emoji",
  "chưa có": "nicht gesetzt",
  "🖼️ có thumbnail ·": "🖼️ hat ein Vorschaubild ·",
  "Thất bại": "Fehlgeschlagen",
  "Xóa thất bại": "Löschen fehlgeschlagen",
  "Màu embed (hex, để trống = mặc định)": "Embed-Farbe (hex, leer = Standard)",
  "Lỗi lưu webhook": "Webhook konnte nicht gespeichert werden",
  "Nhập mật khẩu mới để thay đổi…": "Neues Passwort zum Ändern eingeben…",
  "Nhập mật khẩu (4–64 ký tự)…": "Passwort eingeben (4–64 Zeichen)…",
  "Lưu thất bại": "Speichern fehlgeschlagen",
  "Trạng thái:": "Status:",
  Webhook: "Webhook",
  "Đang kiểm tra…": "Wird geprüft…",
  "Đã đổi phương thức xác minh": "Verifizierungsmethode aktualisiert",
  "để tag,": "zum Taggen,",
  "để tên server": "für den Servernamen",
  "để trống = màu mặc định": "leer = Standardfarbe",
  "Đã cập nhật kênh xác minh": "Verifizierungskanal aktualisiert",
  "Đã cập nhật role chưa xác minh": "Unverifiziert-Rolle aktualisiert",
  "Đã cập nhật role đã xác minh": "Verifiziert-Rolle aktualisiert",
  "Đã yêu cầu bot gửi panel xác minh!": "Den Bot gebeten, das Verifizierungspanel zu posten!",
  "Chưa chọn kênh": "Kein Kanal gewählt",
  "Chưa chọn role": "Keine Rolle gewählt",
  "Webhook mặc định của bot": "Standard-Webhook des Bots",
  "· kênh": "· Kanal",
  "kênh đã bị xóa": "Kanal gelöscht",
  "Hôm nay lúc": "Heute um",
  "moderation, anti-raid và anti-nuke xử lý —":
    "von Moderation, Anti-Raid und Anti-Nuke behandelt —",
  "chỉ áp dụng cho": "gilt nur für",
  "của người dùng (bật Chế độ nhà phát triển trong Discord → chuột phải tên người dùng → Sao chép ID người dùng) để họ không bị hệ thống xử lý":
    "des Nutzers (Entwicklermodus in Discord aktivieren → Rechtsklick auf den Namen → Nutzer-ID kopieren), damit das System ihn überspringt",
  "người dùng": "Nutzer",
  "Danh sách áp dụng cho": "Die Liste gilt für",
  "toàn bộ module của server": "alle Module des Servers",
  "đang dùng bot.": "den Bot nutzen.",
  "Protogon Bot · Tự trả lời theo từ khóa, nhiệt độ vi phạm, Join Gate và phòng thủ chống raid cho cộng đồng Discord":
    "Protogon Bot · Keyword-Auto-Reply, Verstoß-Heat, Join Gate und Raid-Schutz für die Discord-Community",
  "bị chặn: tài khoản": "blockiert: das Konto ist",
  "Bảo vệ vững chắc, giao tiếp mượt mà cho server của bạn":
    "Solider Schutz und reibungslose Kommunikation für deinen Server",
  "(24 module) bám sát cấu trúc server (ban/kick hàng loạt, phá kênh, phá role…); còn":
    "(24 Module) überwachen die Serverstruktur (Massen-Bans/Kicks, Kanal- und Rollen-Vandalismus…), während",
  "Không khớp": "Keine Treffer für",
  "{p0} server · {p1} thành viên": "{p0} Server · {p1} Mitglieder",
  "Lỗi kết nối": "Verbindungsfehler",
  "Khi đã đặt seed, MỌI lệnh của bot yêu cầu chìa khóa khớp — kẻ ngoài không thể giả mạo heartbeat/backup/lockdown. Trên VPS dán giá trị seed VỪA NHẬP vào biến":
    "Ist ein Seed gesetzt, braucht JEDER Bot-Befehl den passenden Schlüssel — Außenstehende können Heartbeat/Backup/Lockdown nicht fälschen. Auf dem VPS den SOEBEN EINGEGEBENEN Seed in die Variable",
  "trong bot/.env rồi": "in bot/.env eintragen und",
  "Đã bật bảo vệ ✅ — dán giá trị seed VỪA NHẬP vào BOT_KEY trên VPS (không hiện lại ở đây).":
    "Schutz aktiviert ✅ — trage den SOEBEN EINGEGEBENEN Seed in BOT_KEY auf dem VPS ein (er wird hier nicht noch einmal gezeigt).",
  "Lỗi khi đặt seed — thử lại.": "Seed konnte nicht gesetzt werden — erneut versuchen.",
  "Cho phép AI tổng hợp (Mimo V2.5 qua Kira AI — free 30M tokens/ngày riêng cho việc học; tổng hợp mỗi lượt khi có dữ liệu mới, không đụng hạn mức Groq/NVIDIA)":
    "KI-Synthese erlauben (Mimo V2.5 über Kira AI — 30 Mio. Gratis-Tokens/Tag nur fürs Lernen; synthetisiert bei jedem Lauf mit neuen Daten, ohne das Groq/NVIDIA-Kontingent anzutasten)",
  "Nguồn lượt trước": "Quellen des letzten Laufs",
  "Kích hoạt bot học NGAY từ nguồn mở + AI tổng hợp. Lần cuối:":
    "Bringt den Bot JETZT zum Lernen aus offenen Quellen + KI-Synthese. Letztes Mal:",
  "Lịch sử học": "Lernverlauf",
  "lượt gần nhất": "neueste Läufe",
  "· nhớ": "· merkt sich",
  "Từ khóa đã học": "Gelernte Schlüsselwörter",
  "Máy chủ backend của Protogon hiện không truy cập được từ trang web này (lỗi kết nối Convex). Nếu bạn là quản trị viên, hãy kiểm tra cấu hình":
    "Protogons Backend ist von dieser Website gerade nicht erreichbar (Convex-Verbindungsfehler). Als Administrator prüfe die Konfiguration",
  "và thử lại sau ít phút.": "und versuche es in ein paar Minuten erneut.",
  "Để đăng nhập, bạn cần tạo ứng dụng Discord và điền":
    "Für die Anmeldung musst du eine Discord-Anwendung erstellen und",
  "vào mục API Keys. Cách làm:": "unter API-Schlüssel eintragen. So gehts:",
  "Thêm redirect URI": "Redirect-URI hinzufügen",
  vào: "zu",
  và: "und",
  "Mời Protogon vào server của bạn rồi quay lại đây. Cần quyền":
    "Lade Protogon auf deinen Server ein und komm zurück. Du brauchst die Berechtigung",
  "thành viên · prefix": "Mitglieder · Präfix",
  "Mời bot vào server trước khi quản lý":
    "Lade den Bot auf den Server ein, bevor du ihn verwaltest",
  "Bạn sẽ được chuyển tới trang mời bot.": "Du wirst zur Bot-Einladungsseite weitergeleitet.",
  ngưỡng: "Schwelle",
  trong: "in",
  "Tải thêm sự kiện": "Mehr Ereignisse laden",
  "— Đã hiển thị toàn bộ": "— Alle angezeigt",
  "sự kiện": "Ereignisse",
  "• Auto-mod = spam tin, mention, từ xấu, ảnh/file, link mời + link độc hại.":
    "• Auto-Mod = Nachrichten-Spam, Mentions, Schimpfwörter, Bilder/Dateien, Einladungs- + bösartige Links.",
  "• Moderation = thông báo sau khi bot phạt (ban · timeout · warn · kick) — chọn mức chi tiết riêng cho từng hành động.":
    "• Moderation = Hinweise nach der Strafe des Bots (Ban · Timeout · Warn · Kick) — Detailgrad je Aktion wählbar.",
  "• Join Gate = chặn selfbot khi vào server.": "• Join Gate = blockt Selfbots beim Beitritt.",
  "• ⭐ Whitelist = chọn người dùng/role miễn trừ moderation, anti-raid và nuke.":
    "• ⭐ Whitelist = Nutzer/Rollen wählen, die von Moderation, Anti-Raid und Nuke ausgenommen sind.",
  "• 💾 Backup server = chụp role + kênh lên đám mây riêng; khôi phục lại khi server bị nuke phá sập.":
    "• 💾 Server-Backup = sichert Rollen + Kanäle in deine eigene Cloud; stellt wieder her, wenn ein Nuke den Server zerlegt.",
  "• 🔗 Webhook & Log = bot tự tạo webhook tên/avatar/màu tùy chỉnh để nhận log.":
    "• 🔗 Webhook & Log = der Bot erstellt einen Webhook mit eigenem Namen/Avatar/Farbe für Logs.",
  "tự trả lời & chống raid": "Auto-Reply & Anti-Raid",
  "cùng warn tích lũy": "plus kumulierte Verwarnungen",
  "giám sát server 24/7.": "überwacht deinen Server 24/7.",
  "Trung bình:": "Durchschnitt:",
  "Tối đa:": "Spitze:",
  "đang đo": "wird gemessen",
  "Đánh giá:": "Bewertung:",
  Nhanh: "Schnell",
  "Nhiệt giảm {decay} điểm/phút — thành viên ngoan tự rời bảng sau một lúc im giọng. ▪ {warn} cảnh báo · ▪ {timeout} tạm khóa · ▪ {kick} kick · ■ {ban} ban":
    "Heat sinkt {decay} Punkte/Minute — brave Mitglieder verschwinden nach einer Weile Funkstille von der Tafel. ▪ {warn} Verwarnung · ▪ {timeout} Timeout · ▪ {kick} Kick · ■ {ban} Ban",
  "lần cảnh báo": "Verwarnungen",
  'Chỉnh sửa "{p0}"': "„{p0}“ bearbeiten",
  'Hủy giveaway "{p0}"?': "Giveaway „{p0}“ abbrechen?",
  'Xóa bảng "{p0}"?': "Panel „{p0}“ löschen?",
  '— bấm "Học ngay" để thử lại': "— klicke auf „Jetzt lernen“, um es erneut zu versuchen",
  '— hãy sửa lỗi rồi bấm "Gửi panel xác minh vào kênh" lại':
    "— behebe den Fehler und klicke erneut auf „Verifizierungspanel in den Kanal posten“",
  "—": "—",
  "Chào thành viên mới": "Neue Mitglieder begrüßen",
  "Tạm biệt thành viên rời server": "Verabschiedung für gehende Mitglieder",
  "Kênh gửi": "Zielkanal",
  "Nội dung": "Nachricht",
  "Xem trước:": "Vorschau:",
  "Gửi dạng embed": "Als Embed senden",
  "Welcome & Goodbye": "Welcome & Goodbye",
  "đang bật": "aktiv",
  "Đã bật": "Aktiviert",
  "Đã tắt": "Deaktiviert",
  "Đã lưu": "Gespeichert",
  "Đã lưu — bot áp dụng trong vòng ~3 phút":
    "Gespeichert — der Bot wendet es innerhalb von ~3 Minuten an",
  "Chào mừng {user} đã đến {server}! Bạn là thành viên thứ {count} 🎉":
    "Willkommen {user} auf {server}! Du bist Mitglied #{count} 🎉",
  "{user} đã rời {server}. Hẹn gặp lại!": "{user} hat {server} verlassen. Bis bald!",
  "Bot Discord · Nhiệt độ · Join Gate · Chào thành viên · Trợ lý AI":
    "Discord-Bot · Heat · Join Gate · Begrüßungen · KI-Assistent",
  "Chào thành viên mới và tạm biệt người rời đi bằng kênh riêng, nội dung tùy chỉnh với placeholder ({user}, {server}, {count}…), gửi dạng embed hoặc tin nhắn thường.":
    "Begrüße neue Mitglieder und verabschiede gehende — eigene Kanäle, eigener Text mit Platzhaltern ({user}, {server}, {count}…), als Embed oder normale Nachricht.",
  /* ==== Welcome & Goodbye v2 — template ngẫu nhiên, embed tùy chỉnh, DM, autorole ==== */
  "Template ngẫu nhiên": "Zufällige Vorlagen",
  "{n} câu": "{n} Zeilen",
  "🎉 Thành viên mới!": "🎉 Neues Mitglied!",
  "👋 Tạm biệt": "👋 Tschüss",
  "Màu (#hex)": "Farbe (#hex)",
  ThànhViênMới: "NeuesMitglied",
  "Chào qua DM": "Begrüßung per DM",
  "Nội dung DM": "DM-Text",
  "Cảm ơn {username} đã tham gia {server}! Đọc #quy-tắc trước khi chat nhé.":
    "Danke fürs Beitreten zu {server}, {username}! Lies erst die #regeln, bevor du chattest.",
  "Autorole — tự cấp role": "Autorole — Rolle automatisch zuweisen",
  "Chọn role": "Rolle wählen",
  "Cấp role cho bot": "Rolle auch an Bots vergeben",

  /* ==== Welcome & Goodbye v3 — Emoji/Kanal/Variable einfügen, Live-Vorschau, Bild-Upload ==== */
  Emoji: "Emoji",
  Kênh: "Kanal",
  Biến: "Variable",
  "Chèn {p0}": "{p0} einfügen",
  "Bấm để chèn ngay tại vị trí con trỏ.": "Klicken fügt an der Cursorposition ein.",
  "Emoji của server": "Server-Emoji",
  "Chưa có emoji tuỳ chỉnh nào trong server này.": "Dieser Server hat noch keine eigenen Emoji.",
  "Emoji phổ biến": "Häufige Emoji",
  "Chọn kênh để chèn liên kết <#kênh> vào tin nhắn.":
    "Kanal wählen, um ihn als Link in die Nachricht einzufügen.",
  "Chưa đồng bộ được kênh nào của server.":
    "Für diesen Server wurden noch keine Kanäle synchronisiert.",
  "Danh sách câu": "Nachrichtenliste",
  "Xem trước trực tiếp": "Live-Vorschau",
  "Tạm biệt": "Abschied",
  "Bot chèn {user} ở dòng riêng khi gửi embed, còn nội dung nằm trong khung.":
    "Bei Embeds setzt der Bot {user} in eine eigene Zeile, dein Text steht im Rahmen.",
  "Emoji không còn trong server: {list} — Discord sẽ hiện dạng chữ. Hãy chèn lại từ danh sách emoji.":
    "Emoji nicht mehr auf dem Server: {list} — Discord zeigt sie als Klartext. Bitte erneut aus der Emoji-Liste einfügen.",
  "Chào thành viên mới và tạm biệt người rời server: template ngẫu nhiên, embed tùy chỉnh, ảnh banner tự tải lên, emoji và kênh của server chèn thẳng vào tin nhắn, DM chào riêng và autorole. Xem trước ngay bên cạnh để biết tin nhắn ra sao trước khi thành viên thật vào.":
    "Neue Mitglieder begrüßen und Verabschiedungen für alle, die gehen: zufällige Vorlagen, eigene Embeds, selbst hochgeladene Bannerbilder sowie Emoji und Kanäle des Servers direkt in der Nachricht — dazu eine separate Willkommens-DM und Autorole. Die Live-Vorschau neben jeder Karte zeigt, was Mitglieder wirklich sehen.",
  "Bot luôn chặn ping @everyone/@here từ nội dung bạn nhập.":
    "Der Bot blockiert @everyone/@here-Pings aus deinem Text grundsätzlich.",
  "kênh không có trong server": "Kanal nicht auf diesem Server",
  "Emoji này không có trong server": "Dieses Emoji gibt es auf dem Server nicht",
  "Nội dung có @everyone/@here — bot luôn chặn, không ai bị ping.":
    "Dein Text enthält @everyone/@here — der Bot blockiert das, niemand wird benachrichtigt.",
  "Ảnh banner": "Bannerbild",
  "Ảnh lớn hiện dưới nội dung embed.": "Großes Bild unter dem Embed-Text.",
  Thumbnail: "Vorschaubild",
  "Ảnh nhỏ ở góc phải embed.": "Kleines Bild oben rechts im Embed.",
  "Xoá ảnh": "Bild entfernen",
  "Hoặc dán URL ảnh": "Oder Bild-URL einfügen",
  "Dùng URL": "URL verwenden",
  "Ảnh tối đa 8MB, vui lòng chọn ảnh nhỏ hơn.":
    "Bilder sind auf 8 MB begrenzt — bitte ein kleineres wählen.",
  "Đã lưu ảnh — bot dùng ảnh mới trong khoảng 1 phút":
    "Bild gespeichert — der Bot nutzt es in etwa einer Minute",
  "Đã xoá ảnh": "Bild entfernt",
  "Lưu ảnh thất bại": "Bild konnte nicht gespeichert werden",
  "Xoá ảnh thất bại": "Bild konnte nicht entfernt werden",
  /* Thẻ ảnh v3 — der Bot zeichnet ein eigenes PNG pro Mitglied */
  "Thẻ ảnh riêng": "Persönliche Bildkarte",
  "Bot tự vẽ một tấm ảnh cho riêng thành viên: nền của bạn + avatar tròn + tên + số thành viên.":
    "Der Bot zeichnet ein eigenes Bild für dieses Mitglied: dein Hintergrund, runder Avatar, Name und Mitgliedsnummer.",
  "Ảnh nền thẻ": "Kartenhintergrund",
  "Ảnh hiện phía sau avatar và tên (bỏ trống = nền màu chuyển sắc).":
    "Liegt hinter Avatar und Name (leer lassen für einen Farbverlauf).",
  "Máy chủ bot chưa vẽ được ảnh nên thẻ này chưa hoạt động — bot vẫn gửi tin nhắn thường. Lý do: {p0}":
    "Der Bot-Server kann noch keine Bilder zeichnen, diese Karte ist inaktiv — der Bot sendet weiterhin die normale Nachricht. Grund: {p0}",
  "không xác định": "unbekannt",
  "Chưa nhận được báo cáo từ bot (bot đang chạy bản cũ hoặc chưa khởi động lại).":
    "Noch keine Meldung vom Bot (er läuft auf einer älteren Version oder wurde nicht neu gestartet).",
  "Thẻ ảnh dùng avatar của thành viên thật khi gửi; ở đây hiện vị trí giữ chỗ.":
    "Die echte Karte nutzt den Avatar des Mitglieds — hier steht nur die Platzhalterposition.",
  "CHÀO MỪNG": "WILLKOMMEN",
  "TẠM BIỆT": "AUF WIEDERSEHEN",
  "Thành viên thứ {count}": "Mitglied #{count}",
  "Nhắc tên thành viên kèm thông báo": "Erwähnt das Mitglied und benachrichtigt es",
  "Tên người dùng (không thông báo)": "Benutzername, ohne zu benachrichtigen",
  "Số thành viên hiện tại": "Aktuelle Mitgliederzahl",
  "Tài khoản đã tạo bao nhiêu ngày": "Wie viele Tage das Konto alt ist",
  "Đã ở trong server bao nhiêu ngày": "Wie viele Tage sie schon auf dem Server sind",
  "Số lượt boost của server": "Anzahl der Server-Boosts",

  /* ==== Landing — đợt viết lại copy (Lô 1). Bản DE của các key còn entry cũ
     nằm ở section theo alphabet trong i18n.de.ts (trùng, không còn dùng). */
  "bảo vệ server toàn diện": "umfassender Serverschutz",
  "hoặc gọi từ khóa để bot phản hồi tức thì. Đi kèm":
    "oder ruf ein Schlüsselwort auf und der Bot antwortet sofort. Dazu",
  "· hoạt động 24/7": "· rund um die Uhr im Einsatz",
  "Tái phạm trong 30 phút, nhiệt sẽ nhân":
    "Wiederholung in 30 Minuten — die Heat wird multipliziert",
  "Protogon gom hệ thống tự trả lời và 32 module bảo vệ (24 chống nuke + 8 auto-mod) vào một chỗ: cấu hình trực quan trên dashboard, giám sát server 24/7, có trợ lý Haimiya đồng hành khi bạn cần.":
    "Protogon vereint Auto-Reply und 32 Schutzmodule (24 Anti-Nuke + 8 Auto-Mod) an einem Ort: alles im übersichtlichen Dashboard konfigurieren, den Server 24/7 im Blick — mit Assistentin Haimiya an deiner Seite.",
  "Nhiệt tăng dần, hình phạt leo thang theo ngưỡng":
    "Heat steigt, Strafen eskalieren nach Schwellenwert",
  "Vừa bị phạt mà tái phạm, nhiệt sẽ nhân":
    "Direkt nach einer Strafe wiederholt → Heat wird multipliziert",
  "trong 30 phút. Warn tích lũy chạy song song: đủ 3 lần là tự tăng cấp.":
    "innerhalb von 30 Minuten. Kumulierte Verwarnungen laufen parallel: 3 Verwarnungen lösen die Eskalation aus.",
  "khi bất kỳ module nào vượt ngưỡng, bot sẽ chặn toàn bộ thành viên gửi tin trong server, tự mở lại sau vài phút hoặc khi mod dùng":
    "sobald ein Modul seinen Schwellenwert überschreitet, sperrt der Bot serverweit das Senden — Freigabe nach einigen Minuten oder per Mod-Befehl",
  "Đăng nhập bằng Discord, mời Protogon vào server để bật nhiệt độ, Join Gate, lọc nội dung và 32 module chống nuke ngay trên dashboard — cùng trợ lý ảo Haimiya đồng hành. Miễn phí cho mọi server.":
    "Mit Discord anmelden und Protogon einladen, um Heat, Join Gate, Inhaltsfilter und 32 Anti-Nuke-Module direkt im Dashboard zu aktivieren — mit Assistentin Haimiya an deiner Seite. Kostenlos für jeden Server.",

  /* ==== Lô 2 — viết lại copy panel Overview / Settings / Branding / ModuleCard. */
  "Chưa ghi nhận sự kiện nào — bot chưa xử lý vi phạm chống nuke ở server này.":
    "Noch keine Ereignisse — der Bot hat auf diesem Server noch keinen Anti-Nuke-Verstoß bearbeitet.",
  "Tính từ tổng nhiệt độ và warn tích lũy của thành viên. Vi phạm càng nhiều thì nhiệt càng cao và mức an toàn càng giảm; khi chạm ngưỡng, hình phạt tự tăng cấp (cảnh báo → tạm khóa → kick → ban) và tái phạm bị nhân đôi nhiệt.":
    "Berechnet aus Gesamt-Heat und kumulierten Verwarnungen der Mitglieder. Mehr Verstöße → mehr Heat und niedrigere Sicherheitsstufe; ab der Schwelle eskaliert die Strafe automatisch (Verwarnung → Timeout → Kick → Ban), Wiederholung verdoppelt die Heat.",
  "Rule auto reply hỗ trợ placeholder:": "Auto-Reply-Regeln unterstützen Platzhalter:",
  "để tag người nhắn và": "um die schreibende Person zu erwähnen, und",
  "để lấy tên hiển thị.": "für den Anzeigenamen.",
  "Mọi thay đổi cấu hình được bot đồng bộ tự động trong khoảng 3 phút.":
    "Jede Konfigurationsänderung wird in etwa 3 Minuten automatisch zum Bot synchronisiert.",
  "Bảng nhiệt & warn trong Moderation có nút xóa nhiệt cho từng người hoặc toàn bộ.":
    "Die Heat- & Verwarnungstabelle in Moderation kann Heat für einzelne Mitglieder oder alle löschen.",
  "Join Gate chặn selfbot ngay khi vào server: tài khoản quá mới, thiếu avatar hoặc huy hiệu.":
    "Join Gate blockt Selfbots direkt beim Beitritt: zu neue Konten sowie Konten ohne Avatar oder Abzeichen.",
  "Module “Chống link độc hại & file nguy hiểm” quét domain lừa đảo và tệp đuôi .exe/.scr…":
    "Das Modul „Schädliche Links & gefährliche Dateien“ prüft Scam-Domains und Dateien mit Endungen wie .exe/.scr…",
  "Mod/Admin có tên trong Cài đặt được miễn trừ khỏi toàn bộ hệ thống chống nuke.":
    "In den Einstellungen eingetragene Mods/Admins sind vom gesamten Anti-Nuke-System ausgenommen.",
  "Nhiệt tự giảm dần theo phút; đủ ngưỡng là hình phạt tự tăng cấp.":
    "Heat sinkt pro Minute; ab dem Schwellenwert eskaliert die Strafe automatisch.",
  "⚡ Phạt thẳng theo hành động đã chọn, không cộng nhiệt.":
    "⚡ Straft direkt mit der gewählten Aktion und addiert keine Heat.",
  "Không có — mọi role đều bị kiểm tra": "Keine — jede Rolle wird geprüft",
  "Chưa có role nào được đồng bộ": "Noch keine Rollen synchronisiert",
  "= xóa toàn bộ tin liên quan đến vụ vi phạm.": "= löscht alle Nachrichten zum Verstoß.",
  "🔥 Nhiệt mỗi vi phạm": "🔥 Heat pro Verstoß",
  "Logo bot xuất hiện trên trang chủ, trang quản lý và toàn bộ website.":
    "Das Bot-Logo erscheint auf der Startseite, den Verwaltungsseiten und der ganzen Website.",
  "Ảnh đại diện của Haimiya trong cửa sổ trò chuyện trợ giúp.":
    "Haimiyas Avatar im Hilfe-Chatfenster.",
  "Đổi avatar bot và trợ lý AI ngay trên web — chỉ admin sở hữu bot được phép.":
    "Bot- und KI-Assistenten-Avatar direkt im Web ändern — nur für den Bot-Besitzer.",
  "Ảnh tải lên được lưu trên bộ nhớ đám mây của bot và áp dụng ngay toàn web (trang chủ, đăng nhập, dashboard, chat AI).":
    "Hochgeladene Bilder liegen im Cloud-Speicher des Bots und gelten sofort websiteweit (Startseite, Anmeldung, Dashboard, KI-Chat).",
  "Ảnh tối đa 2MB, vui lòng chọn ảnh nhỏ hơn.":
    "Bilder max. 2MB — bitte ein kleineres Bild wählen.",
  "Tải ảnh lên máy chủ thất bại (HTTP {p0})": "Bild-Upload zum Server fehlgeschlagen (HTTP {p0})",
  "Máy chủ không trả về ID ảnh — hãy thử dán đường dẫn ảnh thay thế":
    "Der Server hat keine Bild-ID zurückgegeben — füge stattdessen eine Bild-URL ein",
  "Đã đổi avatar bot, áp dụng ngay toàn web": "Bot-Avatar geändert — sofort websiteweit aktiv",
  "Đã đổi avatar Haimiya, áp dụng ngay toàn web 🎀":
    "Haimiyas Avatar geändert — sofort websiteweit aktiv 🎀",
  "Tải ảnh thất bại": "Bild-Upload fehlgeschlagen",
  "Đã lưu ảnh mới, áp dụng ngay toàn web": "Neues Bild gespeichert — sofort websiteweit aktiv",
  "Đã xóa ảnh tùy chỉnh, trở về mặc định": "Eigenes Bild entfernt — zurück zum Standard",
  "Tóm tắt sự kiện chống nuke gửi vào kênh log vào khoảng 00:00 UTC mỗi ngày":
    "Sendet täglich gegen 00:00 UTC eine Anti-Nuke-Zusammenfassung in den Log-Kanal",
  "Khi bot xác nhận raid/nuke: gửi DM khẩn cho chủ server (kẻ nuke không xóa được), AI quét chat và báo cáo vào kênh log, kèm lệnh":
    "Wenn der Bot Raid/Nuke bestätigt: dringende DM an den Serverinhaber (ein Nuker kann sie nicht löschen), die KI liest den Chat und berichtet in den Log-Kanal, samt Befehl",
  "Tắt nếu không muốn cảnh báo làm phiền cả server — mod vẫn thấy log":
    "Ausschalten, wenn die Warnung nicht den ganzen Server stören soll — Mods sehen den Log weiterhin",
  "tự gửi log khi có sự kiện; tùy chỉnh loại sự kiện, màu embed và nội dung kèm.":
    "sendet Logs automatisch bei Ereignissen; Ereignistypen, Embed-Farbe und Zusatzinhalt anpassbar.",
  "Được miễn trừ chống nuke và có quyền quản lý rule auto reply trong Discord.":
    "Vom Anti-Nuke ausgenommen und darf Auto-Reply-Regeln in Discord verwalten.",
  "🔒 Bạn không phải admin sở hữu bot — chỉ chủ sở hữu bot mới được đặt, đổi hoặc xóa mật khẩu này.":
    "🔒 Du bist nicht der Bot-besitzende Admin — nur der Bot-Besitzer darf dieses Passwort setzen, ändern oder löschen.",
  "Chọn sắc độ xám áp dụng cho toàn bộ trang quản lý của server (nút, thẻ, sidebar).":
    "Graustufe für den gesamten Verwaltungsbereich dieses Servers wählen (Buttons, Karten, Sidebar).",
  "Đã lưu cài đặt, bot áp dụng trong khoảng 3 phút":
    "Einstellungen gespeichert — der Bot übernimmt sie in etwa 3 Minuten",
  "Prefix gồm 1–3 ký tự đặc biệt, ví dụ: !, ^, !!":
    "Das Präfix besteht aus 1–3 Sonderzeichen, z. B. !, ^, !!",
  "1–3 ký tự đặc biệt, dùng cho lệnh text như": "1–3 Sonderzeichen, für Textbefehle wie",
  ", kể cả người có quyền phá server.": ", auch für alle mit Rechten, den Server zu zerstören.",

  /* ==== Lô 3a — viết lại copy panel AntiNuke / AutoMod / AltDetection. */
  "Bảo vệ cấu trúc server khỏi các đợt tấn công hàng loạt: ban, kick, tạo/xóa kênh và role…":
    "Schützt die Serverstruktur vor Massenangriffen: Bans, Kicks, Kanal- und Rollen-Erstellung/-Löschung…",
  "⚠️ Chống nuke đang tắt toàn bộ — server chưa được bảo vệ khỏi raid.":
    "⚠️ Anti-Nuke ist vollständig aus — dein Server ist vor Raids ungeschützt.",
  "Áp cấu hình tối ưu theo quy mô server; danh sách trắng của bạn giữ nguyên.":
    "Wendet eine optimale Konfiguration für deine Servergröße an; deine Whitelist bleibt unverändert.",
  "Chia sẻ chữ ký raid ẩn danh với các server khác dùng Protogon — server của bạn được bảo vệ bằng kinh nghiệm toàn mạng.":
    "Teilt anonymisierte Raid-Signaturen mit anderen Servern, die Protogon nutzen — dein Server profitiert von serverweiter Erfahrung.",
  "Tự chặn gửi tin nhắn và voice khi phát hiện raid; mở lại khi hết giờ hoặc bằng":
    "Blockiert bei erkanntem Raid automatisch Nachrichten und Voice; Freigabe nach Ablauf der Zeit oder per",
  "(tài khoản trùng avatar/username, người tạo invite, audit log) rồi tự ban.":
    "(Konten mit gleichem Avatar/Namen, Ersteller der Einladung, Audit-Log) und bannt sie automatisch.",
  "Đã lưu cài đặt Raid Intel — bot áp dụng trong khoảng 3 phút":
    "Raid-Intel-Einstellungen gespeichert — der Bot übernimmt sie in etwa 3 Minuten",
  "Thu thập mẫu raid và dùng AI phân tích để tìm":
    "Sammelt Raid-Muster und lässt die KI nachspüren",
  "Phân tích cụm tài khoản và audit log sau mỗi vụ.":
    "Analysiert nach jedem Fall das Konten-Cluster und das Audit-Log.",
  "Đang khóa — tự mở sau khoảng {p0} phút": "Gesperrt — öffnet sich in etwa {p0} Minuten",
  "Hiện không có kênh nào bị khóa": "Aktuell ist kein Kanal gesperrt",
  "Tự động kiểm duyệt nội dung: chống spam tin nhắn, mention, từ ngữ thô tục, ảnh/file và link mời Discord":
    "Automatische Inhaltsmoderation: Nachrichten-Spam, Mentions, Schimpfwörter, Bild-/Datei-Spam und Discord-Einladungen",
  "Mỗi vi phạm cộng điểm nhiệt theo cài đặt của module. Nhiệt tăng dần rồi tự giảm theo thời gian; khi chạm ngưỡng":
    "Jede Übertretung addiert Heat nach den Moduleinstellungen. Die Heat steigt und sinkt mit der Zeit; ab der Schwelle",
  "Ngưỡng phải tăng dần: cảnh báo < tạm khóa < kick < ban (tối đa 100 điểm). Thành viên vừa bị phạt mà":
    "Schwellen müssen steigen: Verwarnung < Timeout < Kick < Ban (max. 100 Punkte). Wer bestraft wird und",
  "bật, mọi tin nhắn chứa từ trong danh sách dưới đây sẽ bị xóa và xử lý tự động. Xóa hết từ để tắt bộ lọc từ ngữ xấu.":
    "aktiv, wird jede Nachricht mit einem Wort aus der Liste unten gelöscht und automatisch behandelt. Alle Wörter entfernen, um den Schimpfwortfilter auszuschalten.",
  "Chưa có từ nào — bộ lọc từ ngữ xấu chỉ hoạt động sau khi bạn thêm từ.":
    "Noch keine Wörter — der Schimpfwortfilter greift erst, wenn du welche hinzufügst.",
  "mỗi lần vi phạm, thanh nhiệt đầy nhanh hơn.":
    "pro Verstoß, der Heat-Balken füllt sich also schneller.",
  "🔥 Bảng nhiệt và warn tích lũy của từng thành viên":
    "🔥 Heat und kumulierte Verwarnungen je Mitglied",
  "⚠️ Discord không cung cấp địa chỉ IP của thành viên cho bot, nên phát hiện VPN/Proxy trực tiếp là không khả thi với dữ liệu hiện có. Hệ thống tập trung vào phát hiện tài khoản phụ bằng bằng chứng hành vi (tuổi tài khoản, tên/avatar trùng, lịch sử bị phạt, cụm join) — cách chặn tài khoản lạm dụng VPN hiệu quả nhất mà Discord cho phép.":
    "⚠️ Discord gibt Bots keine IP-Adressen der Mitglieder preis, daher ist eine direkte VPN/Proxy-Erkennung mit den vorhandenen Daten nicht möglich. Das System erkennt Zweitkonten anhand von Verhaltensbelegen (Kontoalter, gleiche Namen/Avatare, Strafhistorie, Join-Cluster) — der wirksamste von Discord erlaubte Weg gegen Konten mit VPN-Missbrauch.",
  ": từ 2 tín hiệu mạnh trở lên → phạt đúng cấu hình; 1 tín hiệu → hạ cấp nhẹ hơn (ban → kick, kick → timeout); không có tín hiệu → chỉ theo dõi. Tắt để phạt theo điểm rủi ro như trước (dễ chặn nhầm hơn).":
    ": ab zwei starken Signalen → Strafe nach Konfiguration; ein Signal → mildere Strafe (Ban → Kick, Kick → Timeout); keine Signale → nur beobachten. Ausschalten, um wie zuvor nach Risikopunkten zu strafen (anfälliger für Fehlalarme).",
  "(8 module) sàng lọc nội dung độc hại mỗi ngày. Vượt ngưỡng, bot truy ra thủ phạm qua audit log, phạt đúng cài đặt và báo real-time về kênh log.":
    "(8 Module) filtern täglich schädliche Inhalte. Bei Schwellenwertüberschreitung ermittelt der Bot den Täter über das Audit-Log, straft nach deinen Einstellungen und alarmiert den Log-Kanal in Echtzeit.",
  "Trọn bộ trong một bot": "Das komplette Paket in einem Bot",

  /* ==== Lô 3b — viết lại copy panel JoinGate / Verify / Webhook / Backup. */
  "Đã thêm {p0} vào danh sách trắng": "{p0} zur Whitelist hinzugefügt",
  "Đã xóa {p0} khỏi danh sách trắng": "{p0} aus der Whitelist entfernt",
  "Kiểm tra mọi thành viên mới ngay khi vào server và tự động chặn tài khoản nghi selfbot":
    "Prüft jedes neue Mitglied beim Beitritt und blockiert verdächtige Selfbot-Konten automatisch",
  "Khi bật, mọi thành viên mới đều phải vượt qua các tiêu chí bên dưới mới được ở lại server. Ai không đạt sẽ bị":
    "Wenn aktiv, muss jedes neue Mitglied die Prüfungen unten bestehen, um im Server zu bleiben. Wer sie nicht besteht, wird",
  "⚠️ Join Gate đang tắt — mọi tài khoản đều vào được, kể cả selfbot.":
    "⚠️ Join Gate ist aus — jedes Konto darf beitreten, Selfbots inklusive.",
  "Tài khoản mới hơn số ngày dưới đây sẽ bị chặn (0 = tắt). Selfbot thường đăng ký tài khoản mới hàng loạt.":
    "Konten, die jünger sind als die unten angegebenen Tage, werden blockiert (0 = aus). Selfbots registrieren meist massenhaft frische Konten.",
  "Khuyến nghị 7–14 ngày để chặn tài khoản dùng một lần.":
    "Empfohlen sind 7–14 Tage, um Wegwerf-Konten zu blockieren.",
  "Tài khoản còn dùng ảnh đại diện mặc định sẽ bị chặn.":
    "Konten, die noch das Standard-Avatar nutzen, werden blockiert.",
  "Tài khoản không có huy hiệu công khai nào (flag = 0) sẽ bị chặn — selfbot mới gần như không bao giờ có huy hiệu.":
    "Konten ganz ohne öffentliches Abzeichen (flag = 0) werden blockiert — frische Selfbots haben fast nie eines.",
  "Chặn người vào khi server đang bị raid":
    "Beitritte blockieren, während der Server geraidet wird",
  "Khi server đang khóa kênh vì raid, mọi thành viên mới đều bị xử lý — cắt đợt tấn công thứ hai.":
    "Solange der Server wegen eines Raids gesperrt ist, wird jedes neue Mitglied bestraft — das stoppt die zweite Welle.",
  "— bật tiêu chí trên thì mọi thành viên mới sẽ bị xử lý ngay lúc này.":
    "— mit der Prüfung oben wird jetzt jedes neue Mitglied bestraft.",
  "Kick = có thể quay lại; Ban = chặn vĩnh viễn (hiệu quả hơn với selfbot).":
    "Kick = sie können zurückkommen; Ban = dauerhaft gesperrt (wirksamer gegen Selfbots).",
  "— tài khoản vi phạm bị chặn vĩnh viễn. Chọn Kick nếu bạn muốn nhẹ tay hơn.":
    "— verstoßende Konten werden dauerhaft gesperrt. Wähle Kick, wenn du milder sein willst.",
  ", bỏ qua mọi tiêu chí — dành cho tài khoản phụ hoặc người bạn tin tưởng.":
    ", überspringen jede Prüfung — für Zweitkonten oder Personen, denen du vertraust.",
  "trạng thái email/số điện thoại đã xác thực, nên Join Gate chỉ dựa vào tín hiệu công khai (tuổi tài khoản, avatar, huy hiệu, trạng thái raid) để nhận diện selfbot.":
    "ob eine E-Mail-Adresse oder Telefonnummer verifiziert ist, daher nutzt Join Gate nur öffentliche Signale (Kontoalter, Avatar, Abzeichen, Raid-Status), um Selfbots zu erkennen.",
  "để xử lý. Muốn một người luôn được vào, hãy thêm ID của họ vào danh sách trắng phía trên.":
    "um zu handeln. Damit jemand immer hineinkommt, füge seine ID oben zur Whitelist hinzu.",
  "Thành viên mới nhận role Unverified và phải xác minh trước khi vào server.":
    "Neue Mitglieder erhalten die Rolle Unverified und müssen sich verifizieren, bevor sie den Server sehen.",
  "Khi bật, thành viên mới nhận role chưa xác minh và phải verify mới vào được server.":
    "Wenn aktiv, erhalten neue Mitglieder die unverifizierte Rolle und müssen sich verifizieren, um den Server zu betreten.",
  "— thành viên bấm nút là xác minh xong ngay.":
    "— Mitglieder klicken einen Button und sind sofort verifiziert.",
  "— bot gửi mã qua DM, thành viên nhập lại mã trong kênh.":
    "— der Bot sendet einen Code per DM und das Mitglied tippt ihn im Kanal ein.",
  "Bot gửi embed chào mừng qua DM ngay khi thành viên xác minh thành công.":
    "Der Bot sendet das Willkommens-Embed per DM, sobald ein Mitglied erfolgreich verifiziert ist.",
  "Role tự gán cho thành viên mới ngay khi vừa vào server.":
    "Rolle wird automatisch vergeben, sobald ein neues Mitglied beitritt.",
  "Role gán sau khi xác minh thành công; role chưa xác minh được gỡ ra.":
    "Rolle wird nach erfolgreicher Verifizierung vergeben; die unverifizierte Rolle wird entfernt.",
  "— thiết lập xác minh ngay trong Discord.": "— richte die Verifizierung direkt in Discord ein.",
  "Chưa có nội dung embed — hãy soạn ở khung bên trái.":
    "Noch kein Embed-Inhalt — schreibe etwas im linken Bereich.",
  "Đã gửi thành công! Kiểm tra kênh Discord.": "Erfolgreich gesendet! Prüfe den Discord-Kanal.",
  "(theo Kênh log trong Cài đặt) · nhận mọi log hình phạt và anti nuke/raid.":
    "(folgt dem Log-Kanal in den Einstellungen) · erhält jeden Straf- und Anti-Nuke/Raid-Log.",
  "tự tạo trong khoảng 1 phút": "erstellt ihn in etwa 1 Minute",
  "chọn Kênh log": "Log-Kanal festlegen",
  "Dán webhook URL từ Discord (Kênh → Tích hợp → Webhook → Tạo webhook), soạn nội dung và embed rồi bấm gửi.":
    "Füge eine Webhook-URL aus Discord ein (Kanal → Integrationen → Webhooks → Neuer Webhook), schreibe Nachricht und Embed und drücke Senden.",
  "Tên người gửi ghi đè (tùy chọn)": "Anzeigename überschreiben (optional)",
  "Hiển thị thời gian hiện tại": "Aktuelle Uhrzeit anzeigen",
  "• Dán URL vào ô trên, soạn embed với tiêu đề, mô tả, màu sắc, field… rồi bấm":
    "• Füge die URL oben ein, erstelle ein Embed mit Titel, Beschreibung, Farbe und Feldern… und drücke",
  "• Webhook mặc định (Protogon Log) ở trên chỉ dùng để nhận log hình phạt và anti nuke từ bot — không liên quan tới trình gửi embed.":
    "• Der Standard-Webhook (Protogon Log) oben empfängt nur Straf- und Anti-Nuke-Logs vom Bot — er hat nichts mit dem Embed-Sender zu tun.",
  "Hãy kiểm tra lại file backup hoặc tải lại file khác.":
    "Prüfe die Backup-Datei erneut oder lade eine andere hoch.",
  "Bot đã dừng giữa chừng. Kiểm tra bot còn trong server và đủ quyền Administrator rồi thử khôi phục lại.":
    "Der Bot hat mittendrin abgebrochen. Prüfe, ob er noch im Server ist und Administratorrechte hat, und starte die Wiederherstellung erneut.",
  "Bot không gửi heartbeat (offline hơn 3 phút). Hãy khởi động bot trên host (pm2 start protogon-bot / bật lại service) rồi bấm Backup ngay sau khi bot online.":
    "Der Bot sendet keine Heartbeats (länger als 3 Minuten offline). Starte ihn auf deinem Host (pm2 start protogon-bot / Dienst neu starten) und klicke dann auf Jetzt sichern.",
  "Bot không gửi heartbeat. Hãy khởi động bot trên host rồi thử khôi phục lại sau khi bot online.":
    "Der Bot sendet keine Heartbeats. Starte ihn auf deinem Host und versuche die Wiederherstellung danach erneut.",
  "Role, quyền role và kênh sẽ được tạo lại theo backup. Kết quả sẽ hiện ở đây.":
    "Rollen, Rollenrechte und Kanäle werden aus dem Backup neu erstellt. Das Ergebnis erscheint hier.",
  "Sao lưu cấu trúc server (role, quyền role, kênh và quyền kênh) lên":
    "Sichert deine Serverstruktur (Rollen, Rollenrechte, Kanäle und Kanalrechte) in",
  ". Khi server bị nuke/raid phá sập hoàn toàn, hãy mời bot vào":
    ". Wird dein Server durch Nuke oder Raid ausgelöscht, lade den Bot in einen",
  "Đang khôi phục vào server này… server lớn kèm tin nhắn có thể mất vài phút. Kết quả hiện ở đây và trong kênh log.":
    "Wiederherstellung läuft… ein großer Server mit Nachrichten kann einige Minuten brauchen. Das Ergebnis erscheint hier und im Log-Kanal.",
  "Bot sao lưu toàn bộ": "Der Bot sichert alle",
  "Kèm tin nhắn và media (tối đa 50 tin/kênh)":
    "Nachrichten und Medien einschließen (bis zu 50 pro Kanal)",
  "Nếu server bị": "Wenn dein Server von",
  "phá sập mà bạn còn giữ được file backup của nó (định dạng":
    "zerstört wurde und du noch die Backup-Datei hast (Format",
  "(gồm cả media — file lưu trên đám mây, không nhét vào bộ nhớ bot). Bot giữ nguyên role/kênh có sẵn của server hiện tại, chỉ thêm mới theo file chứ không xóa gì.":
    "(inklusive Medien — die Datei bleibt in der Cloud und wird nicht in den Bot-Speicher geladen). Der Bot behält die vorhandenen Rollen und Kanäle des aktuellen Servers und fügt nur hinzu, was in der Datei steht — gelöscht wird nichts.",
  "Bot tự sao lưu và đẩy lên": "Der Bot sichert und lädt hoch zu",
  "). Bot chỉ giữ": "). Der Bot behält nur",
  "trong bot — bản cũ hơn tự bị xóa, còn GitHub giữ bản lưu vĩnh viễn.":
    "im Bot — ältere werden automatisch gelöscht, GitHub behält sie dauerhaft.",
  "Bật lên là bot sao lưu bản đầu tiên trong khoảng 1 phút, sau đó lặp lại theo chu kỳ bạn chọn.":
    "Beim Einschalten erstellt der Bot in etwa einer Minute das erste Backup und wiederholt das im gewählten Zyklus.",
  "(.msc/.json tải lên). Phần tắt sẽ được bỏ qua khi khôi phục (kênh, tin nhắn và media vẫn xử lý bình thường).":
    "(.msc/.json-Uploads). Deaktivierte Teile werden bei der Wiederherstellung übersprungen (Kanäle, Nachrichten und Medien werden weiterhin verarbeitet).",
  "Đã gửi yêu cầu tạo backup — bot xử lý trong khoảng 3 phút":
    "Backup angefordert — der Bot führt es in etwa 3 Minuten aus",
  "Đang tạo backup — bot quét yêu cầu mỗi khoảng 3 phút. Kết quả hiện ngay tại đây.":
    "Backup läuft — der Bot holt Anfragen etwa alle 3 Minuten ab. Das Ergebnis erscheint genau hier.",
  "Bot đã tạo xong bản backup mới": "Der Bot hat ein neues Backup erstellt",
  "Bản backup mới đã có trong danh sách bên dưới và được lưu trên cloud.":
    "Das neue Backup steht in der Liste unten und ist in der Cloud gespeichert.",
  "Server không có thay đổi kể từ bản backup gần nhất":
    "Der Server hat sich seit dem letzten Backup nicht verändert",
  'Bot không tạo bản trùng lặp. Bật "Kèm tin nhắn" hoặc chỉnh cấu trúc server rồi bấm Backup ngay lại nếu bạn cần một bản mới.':
    'Der Bot erstellt keine Duplikate. Schalte "Nachrichten einschließen" ein oder ändere die Serverstruktur und tippe dann erneut auf „Backup jetzt“, wenn du eine neue Kopie brauchst.',
  "Bot vẫn chưa xử lý xong yêu cầu backup":
    "Der Bot hat die Backup-Anfrage noch nicht abgeschlossen",
  "Bot online nhưng chưa xử lý xong — server lớn kèm tin nhắn có thể mất vài phút; nếu quá lâu hãy cập nhật bot lên bản mới nhất.":
    "Der Bot ist online, aber noch nicht fertig — ein großer Server mit Nachrichten kann ein paar Minuten brauchen; dauert es länger, aktualisiere den Bot auf die neueste Version.",
  "Bot đang OFFLINE — khởi động bot trên host rồi bấm Backup ngay lại.":
    "Der Bot ist OFFLINE — starte ihn auf dem Host und tippe dann erneut auf „Backup jetzt“.",
  "Bot không lưu được bản backup. Đọc lý do ở khung đỏ phía trên, khắc phục rồi bấm Backup ngay lại.":
    "Der Bot konnte das Backup nicht speichern. Lies den Grund im roten Feld oben, behebe ihn und tippe dann erneut auf „Backup jetzt“.",
  "Chọn kênh gửi trước khi bật tính năng này.":
    "Wähle zuerst einen Zielkanal, bevor du das einschaltest.",
  "Đã lưu kênh gửi": "Zielkanal gespeichert",
  "Đã yêu cầu khôi phục — bot thực hiện trong khoảng 1 phút":
    "Wiederherstellung angefordert — der Bot führt sie in etwa 1 Minute aus",

  /* ==== Lô 4 — viết lại copy panel AutoReply / Welcome & Goodbye / Giveaway / ReactionRoles. */
  "Bot tự trả lời khi tin nhắn chứa từ khóa hoặc tag @bot":
    "Der Bot antwortet automatisch, wenn eine Nachricht ein Stichwort enthält oder @bot markiert",
  "Chưa có rule nào. Tạo rule đầu tiên để bot tự trả lời khi ai đó gõ từ khóa hoặc tag bot.":
    "Noch keine Regel. Erstelle die erste, und der Bot antwortet, sobald jemand ein Stichwort tippt oder ihn markiert.",
  "Bot trả lời thành viên mỗi khi điều kiện kích hoạt bên dưới được thỏa.":
    "Der Bot antwortet einem Mitglied, sobald der Auslöser unten zutrifft.",
  'Đã bật rule "{p0}"': 'Regel "{p0}" aktiviert',
  'Đã tắt rule "{p0}"': 'Regel "{p0}" deaktiviert',
  "Giãn cách giữa các lần trả lời (giây, 0 = không giới hạn)":
    "Abstand zwischen Antworten (Sekunden, 0 = unbegrenzt)",
  "Gửi lời chào vào kênh bạn chọn mỗi khi có thành viên tham gia":
    "Sendet eine Begrüßung in den gewählten Kanal, sobald ein Mitglied beitritt",
  "Gửi lời tạm biệt khi có thành viên rời server":
    "Sendet einen Abschiedsgruß, wenn ein Mitglied den Server verlässt",
  "Mỗi dòng là một câu — bot chọn ngẫu nhiên mỗi lượt vào/rời server để tin nhắn không bị nhàm. Điền vào đây thì phần này thay cho nội dung ở trên.":
    "Eine Aussage pro Zeile — der Bot wählt bei jedem Beitritt oder Austritt zufällig eine, damit der Gruß nie eintönig wird. Ausgefüllt ersetzt dieser Teil die Nachricht oben.",
  "Đã lưu — bot áp dụng trong khoảng 3 phút":
    "Gespeichert — der Bot übernimmt es in etwa 3 Minuten",
  "Đang bật thì phải chọn kênh gửi, hoặc tắt tính năng này.":
    "Solange das aktiv ist, musst du einen Kanal wählen — oder die Funktion abschalten.",
  "Màu phải ở dạng #hex, ví dụ #57f287": "Die Farbe muss #hex sein, zum Beispiel #57f287",
  "Gửi lời chào riêng qua tin nhắn trực tiếp (DM) cho thành viên mới":
    "Sendet eine private Begrüßung per DM an das neue Mitglied",
  "Tự gán role cho thành viên mới ngay khi họ vào server":
    "Vergibt neuen Mitgliedern automatisch eine Rolle, sobald sie beitreten",
  "Role gán tự động": "Automatisch vergebene Rolle",
  "Chờ trước khi gán (giây, 0–120)": "Wartezeit vor der Vergabe (Sekunden, 0–120)",
  "Mặc định tắt — bot mới vào server không nhận role tự động":
    "Standardmäßig aus — beitretende Bots erhalten keine automatische Rolle",
  "Chống raid: khi server đang khóa vì raid, autorole tạm dừng để không gán role cho loạt tài khoản ập vào.":
    "Anti-Raid: Während der Server wegen eines Raids gesperrt ist, pausiert Autorole, damit keine Rollen an eine Kontenflut vergeben werden.",
  "Tắt = gửi tin nhắn thường, không có khung embed.": "Aus = einfache Nachricht ohne Embed-Rahmen.",
  "Chào mừng {user} đến {server}!\nRất vui có {username} trong nhà!\nNgười thứ {count} vừa xuất hiện 🎉":
    "Willkommen {user} auf {server}!\nSchön, dass {username} dabei ist!\nMitglied Nummer {count} ist da 🎉",
  "Chọn mẫu tin nhắn, thêm ảnh, viết lời dẫn và cấp role thưởng tự động — bot chọn người thắng rồi thông báo.":
    "Wähle eine Nachrichtenvorlage, füge ein Bild hinzu, schreibe den Einleitungstext und vergib automatisch eine Gewinnrolle — der Bot zieht die Gewinner und verkündet sie.",
  "Đã tạo giveaway — bot gửi trong khoảng 1 phút 🎉":
    "Giveaway erstellt — der Bot postet es in etwa 1 Minute 🎉",
  "⚠️ Bot không gửi được giveaway:": "⚠️ Der Bot konnte das Giveaway nicht posten:",
  "Chưa có giveaway nào. Tạo cái đầu tiên để chúc mừng thành viên 🎀":
    "Noch kein Giveaway. Erstelle das erste, um deine Mitglieder zu feiern 🎀",
  "Bot gửi embed giveaway kèm phản ứng 🎉 theo mẫu bạn chọn (thêm ảnh nếu muốn). Hết giờ, bot tự chọn người thắng, cấp role thưởng (nếu có) và thông báo.":
    "Der Bot postet das Giveaway-Embed mit 🎉-Reaktion in der gewählten Vorlage (auf Wunsch mit Bild). Nach Ablauf zieht er die Gewinner, vergibt die Gewinnrolle (falls gesetzt) und verkündet sie.",
  "Lời dẫn tùy chỉnh (hiện ở đầu embed, để trống = dùng giải thưởng)":
    "Eigener Einleitungstext (oben im Embed; leer lassen = Gewinn wird verwendet)",
  "Bot nhắn riêng kèm giải thưởng cho từng người thắng":
    "Der Bot schreibt jedem Gewinner eine DM mit dem Gewinn",
  "Thành viên bấm emoji dưới tin nhắn để tự nhận hoặc gỡ role. Tùy chỉnh được tên, mô tả, thumbnail và từng cặp emoji → role.":
    "Mitglieder klicken ein Emoji unter der Nachricht, um eine Rolle zu erhalten oder abzugeben. Titel, Beschreibung, Thumbnail und jedes Emoji-→-Rollen-Paar sind anpassbar.",
  "Mỗi dòng cần có emoji và role được chọn": "Jede Zeile braucht ein Emoji und eine Rolle",
  "Đã cập nhật bảng — bot gửi bảng mới trong khoảng 1 phút":
    "Panel aktualisiert — der Bot postet das neue Panel in etwa 1 Minute",
  "Đã tạo bảng — bot gửi tin nhắn trong khoảng 1 phút":
    "Panel erstellt — der Bot postet die Nachricht in etwa 1 Minute",
  "Bot gửi bảng mới với nội dung đã chỉnh trong khoảng 1 phút (tin nhắn cũ vẫn còn).":
    "Der Bot postet dein geändertes Panel in etwa 1 Minute (die alte Nachricht bleibt).",
  "Bot gửi một tin nhắn vào kênh đã chọn kèm các emoji; thành viên bấm emoji để nhận role.":
    "Der Bot postet eine Nachricht mit den Emojis im gewählten Kanal; Mitglieder klicken ein Emoji, um die Rolle zu erhalten.",

  /* ==== Lô 5 — viết lại copy panel ModActions / Dm / Hidden / Unlock / Whitelist / ExternalAppRaids. */
  "Chưa có hình phạt nào — server đang yên bình 🎉":
    "Noch keine Bestrafung — auf dem Server ist es ruhig 🎉",
  "(hình phạt, lý do, người xử lý) và tách rõ nguồn:":
    "(die Strafe, den Grund, wer sie ausgeführt hat) und eine klare Trennung nach Quelle:",
  "Đã gửi yêu cầu — bot gửi DM trong khoảng 1 phút 💌":
    "Anfrage gesendet — der Bot schickt die DM in etwa 1 Minute 💌",
  "Gửi tin nhắn riêng (DM)": "Direktnachricht (DM) senden",
  "Nhập ID người dùng Discord và nội dung, bot sẽ nhắn riêng cho họ. (Bật Chế độ nhà phát triển trong Discord → chuột phải tên người dùng → Sao chép ID người dùng)":
    "Gib die Discord-Benutzer-ID und deinen Text ein — der Bot schreibt der Person privat. (Entwicklermodus in Discord aktivieren → Rechtsklick auf den Nutzer → Benutzer-ID kopieren)",
  "Reaction role, giveaway, nhắn tin riêng, auto reply và tùy chỉnh giao diện — chỉ admin sở hữu bot mở khóa bằng mật khẩu mới dùng được.":
    "Reaction-Role, Giveaway, Direktnachrichten, Auto-Reply und Oberflächen-Anpassung — nur der Bot-besitzende Admin kann sie nach dem Entsperren mit dem Passwort nutzen.",
  "mới được thao tác mật khẩu và mở khóa tính năng ẩn — chủ hay mod của một server không thay thế được.":
    "darf das Passwort verwenden und den versteckten Bereich entsperren — Server-Owner oder Mod zu sein reicht dafür nicht.",
  "Chưa thiết lập chủ sở hữu. Người tạo bot cần đăng nhập bằng chính tài khoản Discord đã tạo bot, vào":
    "Noch kein Besitzer festgelegt. Wer den Bot erstellt hat, muss sich mit genau dem Discord-Konto anmelden, das den Bot erstellt hat, und dort",
  "Sai mật khẩu rồi, thử lại nhé!": "Falsches Passwort — versuch es noch einmal!",
  "Mục này được bảo vệ bằng mật khẩu do chủ sở hữu bot đặt. Chỉ người biết mật khẩu mới xem được nội dung bên trong.":
    "Dieser Bereich ist durch ein Passwort des Bot-Besitzers geschützt. Nur wer es kennt, sieht die Inhalte darin.",
  "Đã lưu danh sách trắng — bot áp dụng trong khoảng 3 phút":
    "Whitelist gespeichert — der Bot übernimmt sie in etwa 3 Minuten",
  "Người dùng và role trong danh sách này": "Nutzer und Rollen in dieser Liste",
  ". Mỗi server giữ danh sách trắng riêng, không chia sẻ sang server khác.":
    ". Jeder Server führt seine eigene Whitelist; nichts wird mit anderen Servern geteilt.",
  "Role Mod và Admin cấu hình trong Cài đặt vẫn hoạt động riêng — danh sách này dành cho role tùy chỉnh (ví dụ VIP, YouTuber, Staff…).":
    "Mod- und Admin-Rollen aus den Einstellungen gelten weiterhin separat — diese Liste ist für eigene Rollen (VIP, YouTuber, Staff…).",
  "ID Discord, VD: 123456789012345678 (cách nhau bằng dấu phẩy hoặc khoảng trắng)":
    "Discord-IDs, z. B. 123456789012345678 (getrennt durch Kommas oder Leerzeichen)",
  ": spam, từ ngữ xấu, link mời, link độc hại, file nguy hiểm, raid thành viên, ban/kick hàng loạt, tạo/xóa kênh và role hàng loạt, webhook/thread hàng loạt… Người dùng và role trong danh sách được bỏ qua hoàn toàn — không cộng nhiệt, không xóa tin, không ban. Danh sách này":
    ": Spam, Schimpfwörter, Einladungslinks, schädliche Links, gefährliche Dateien, Mitglieder-Raids, Massen-Bans/Kicks, massenhaftes Erstellen/Löschen von Kanälen und Rollen, Webhook- oder Thread-Flut… Nutzer und Rollen auf der Liste werden komplett übersprungen — keine Heat, keine gelöschten Nachrichten, keine Bans. Diese Liste",
  "Lưu ý: danh sách này không miễn trừ Join Gate — tính năng chống selfbot khi vào server có danh sách trắng riêng trong mục Join Gate.":
    "Hinweis: Diese Liste befreit nicht vom Join Gate — die Selfbot-Prüfung beim Beitritt hat unter Join Gate ihre eigene Whitelist.",
  "đã xử lý": "behandelt",
  "Chưa có vụ raid bằng ứng dụng ngoài nào bị chặn": "Noch kein External-App-Raid blockiert",
  "(hoặc một app đáng ngờ: giả mạo app nổi tiếng, tên scam, do tài khoản mới kết nối, app spam @everyone kèm link lừa đảo), vụ đó xuất hiện ở đây kèm kết luận của AI, danh sách ứng dụng và người dùng đã bị xử lý.":
    "(oder eine verdächtige App: Nachahmung einer bekannten App, Scam-Name, von einem brandneuen Konto verbunden oder eine App, die @everyone mit Scam-Links spammt), erscheint der Fall hier mit KI-Urteil, den beteiligten Apps und den behandelten Nutzern.",
  "người dùng app có đang raid không. AI học các dạng raid app ngoài (tài khoản phụ cài app, app giả mạo hoặc tên scam, spam @everyone kèm link lừa đảo, webhook spam) để chặn cả biến thể tương tự: app nào được kết nối, ai đã bị xử lý.":
    "ob die App-Nutzer tatsächlich raiden. Die KI lernt die Muster von External-App-Raids (Zweitkonten, die Apps installieren, gefälschte oder scam-benannte Apps, @everyone-Spam mit Scam-Links, Webhook-Spam), um auch ähnliche Varianten zu stoppen: welche App verbunden wurde und wer behandelt wurde.",

  /* ==== Lô 6 — viết lại nốt copy ModerationPanel + bảng nhiệt (HeatBar). */
  "Hệ số tái phạm (lần)": "Wiederholungsfaktor (mal)",
  "Mỗi từ tối đa 40 ký tự": "Jedes Wort darf bis zu 40 Zeichen lang sein",
  ". Đủ số warn trong cửa sổ thời gian thì hình phạt tự":
    ". Ist die Verwarnungszahl im Zeitfenster erreicht, eskaliert die Bestrafung",
  "lên một mức nặng hơn. Cơ chế này chạy song song với hệ thống nhiệt.":
    "auf eine schwerere Stufe. Dieser Mechanismus läuft parallel zum Heat-System.",
  "Đang tắt — mọi module chỉ cảnh báo, không tự tăng cấp theo số lần warn.":
    "Aus — jedes Modul verwarnt nur; nichts eskaliert nach Verwarnungen.",
  "Danh sách từ ngữ xấu": "Schimpfwort-Liste",
  "Chưa có ai vi phạm — server đang rất an toàn 🎉":
    "Noch kein Verstoß — der Server ist sehr sicher 🎉",
  "Bảng đang trống — chưa thành viên nào có nhiệt hay warn 🎉":
    "Noch leer — kein Mitglied hat Heat oder Verwarnungen 🎉",
  /* ==== Lô 7 — bọc translate() cho 2 description nội suy + window.confirm của
     BackupPanel. Danh sách tùy chỉnh ghép từ các MỤC ĐÃ DỊCH (không nối mảnh
     câu tiếng Việt), nên mục bỏ qua mang tiền tố ⏭️ như log embed của bot. */
  role: "Rollen",
  "emoji/sticker": "Emoji/Sticker",
  "các kênh": "Kanäle",
  "⏭️ bỏ qua {p0}": "⏭️ {p0} überspringen",
  "không phần nào": "nichts",
  "Phần khôi phục: {p0} · BỎ QUA: {p1}.": "Wiederherstellung: {p0} · ÜBERSPRUNGEN: {p1}.",
  "Phần khôi phục: {p0} (tất cả).": "Wiederherstellung: {p0} (alles).",
  "Bot tự nhận diện định dạng (JSON thường, base64 hoặc có lớp bọc), dựng lại kênh đúng thứ tự cùng role/emoji/sticker theo Tùy chỉnh khôi phục, rồi phục hồi tin nhắn kèm media (ảnh/video…). Lỗi (nếu có) sẽ hiện ngay khi bot báo lại.":
    "Der Bot erkennt das Format selbst (normales JSON, Base64 oder mit Wrapper), baut die Kanäle in der richtigen Reihenfolge sowie Rollen und Emoji/Sticker gemäß den Wiederherstellungs-Optionen neu auf und stellt danach Nachrichten samt Medien (Bilder/Videos…) wieder her. Fehler erscheinen, sobald der Bot sie meldet.",
  'Khôi phục backup của "{p0}" vào server hiện tại?':
    'Backup von "{p0}" im aktuellen Server wiederherstellen?',
  "Bot dựng lại cấu trúc theo backup (kênh đúng thứ tự, kèm role và emoji/sticker nếu backup có) rồi phục hồi tin nhắn cùng media (ảnh/video…), theo đúng Tùy chỉnh khôi phục bên dưới. Các role/kênh đang có của server này được giữ nguyên.":
    "Der Bot baut die Struktur aus dem Backup neu auf (Kanäle in der richtigen Reihenfolge, dazu Rollen und Emoji/Sticker, wenn das Backup sie enthält) und stellt danach Nachrichten samt Medien (Bilder/Videos…) wieder her — gemäß den Wiederherstellungs-Optionen unten. Bereits vorhandene Rollen und Kanäle dieses Servers bleiben unangetastet.",
  "Tùy chỉnh đang áp dụng: {p0}.": "Aktive Optionen: {p0}.",
  /* ==== Ticket / Beschwerden (27/09/2026) ==== */
  "Ticket — kênh riêng cho thành viên và ban quản trị":
    "Tickets — ein eigener Kanal für Mitglied und Moderation",
  "Mỗi lượt mở tạo một kênh riêng để thành viên hỏi đáp, báo cáo chuyện gì, hoặc khiếu nại khi bị phạt oan.":
    "Jedes eröffnete Ticket bekommt einen eigenen Kanal — für Fragen, Meldungen oder Einsprachen gegen Strafen.",
  "Đang bật · {p0} đang mở": "Aktiv · {p0} offen",
  "Bật tính năng ticket": "Tickets aktivieren",
  "Thành viên dùng lệnh /ticket trong server, hoặc bấm nút trong tin nhắn riêng nếu đã bị ban. Bot cần quyền Quản lý kênh.":
    "Mitglieder nutzen /ticket im Server oder drücken den Knopf in der DM, falls sie gesperrt wurden. Der Bot braucht die Berechtigung „Kanäle verwalten“.",
  "Đã bật ticket": "Tickets aktiviert",
  "Đã tắt ticket": "Tickets deaktiviert",
  "⚠️ Chưa chọn danh mục chứa ticket — thành viên sẽ không mở được ticket cho tới khi bạn chọn bên dưới.":
    "⚠️ Keine Ticket-Kategorie gewählt — Mitglieder können erst Tickets eröffnen, wenn du unten eine auswählst.",
  "Danh mục chứa kênh ticket": "Kategorie für Ticket-Kanäle",
  "Đã cập nhật danh mục ticket": "Ticket-Kategorie aktualisiert",
  "Chọn danh mục…": "Kategorie wählen…",
  "— Chưa chọn —": "— Nicht gewählt —",
  "Server chưa có danh mục nào — tạo một danh mục trong Discord trước.":
    "Dieser Server hat noch keine Kategorie — erstelle zuerst eine in Discord.",
  "Kênh ticket sẽ được tạo tự động bên trong danh mục này.":
    "Ticket-Kanäle werden automatisch in dieser Kategorie erstellt.",
  "Role xử lý ticket": "Rolle für Ticket-Bearbeitung",
  "Đã cập nhật role xử lý ticket": "Ticket-Rolle aktualisiert",
  "— Dùng role mod —": "— Mod-Rolle verwenden —",
  "Hiện tại: {p0}": "Aktuell: {p0}",
  "Chưa chọn — bot dùng role mod của server ({p0}). Chọn riêng khi người xử lý ticket khác người làm mod.":
    "Nicht gewählt — der Bot nutzt die Mod-Rolle des Servers ({p0}). Wähle eine eigene, wenn Ticket-Bearbeitung ≠ Moderation.",
  "chưa có role mod nào": "keine Mod-Rolle gesetzt",
  "Loại ticket mặc định": "Standard-Tickettyp",
  "Đã đổi loại ticket mặc định": "Standard-Tickettyp geändert",
  "Hỗ trợ chung — hỏi đáp, báo cáo bất kỳ chuyện gì":
    "Allgemeiner Support — Frage stellen, alles melden",
  "Khiếu nại — dành cho người bị phạt oan":
    "Beschwerde — für Mitglieder, die eine Strafe für falsch halten",
  "Thành viên vẫn chọn được loại khác khi gõ lệnh. Loại này chỉ là mặc định khi họ không chọn.":
    "Mitglieder können beim Befehl weiterhin einen anderen Typ wählen. Das hier ist nur der Standard, wenn sie nichts wählen.",
  "Giới hạn chống spam": "Spam-Limits",
  "Không có giới hạn thì 1 người có thể spam hàng trăm kênh trong một đêm và làm chạm trần 500 kênh của Discord.":
    "Ohne Limits kann eine Person nachts Hunderte Kanäle zuspammen und Discord's Limit von 500 Kanälen erreichen.",
  "Tối đa ticket đang mở ({p0})": "Max. offene Tickets ({p0})",
  "Đã cập nhật giới hạn": "Limit aktualisiert",
  "Chờ giữa 2 lượt mở ({p0} giờ)": "Abklingzeit zwischen Eröffnungen ({p0} Std.)",
  "Đã cập nhật thời gian chờ": "Abklingzeit aktualisiert",
  "Gửi tin nhắn riêng cho người bị ban": "Gesperrte Mitglieder per DM anschreiben",
  "Kèm lý do ban và nút mở khiếu nại. Không có bước này, người bị ban không biết bot có lệnh gỡ ban.":
    "Sendet den Sperrgrund plus einen Knopf zum Einsprachen. Ohne das wissen Gesperrte nicht, dass es einen Entbann-Befehl gibt.",
  "Sẽ gửi DM sau khi ban": "Sendet DM nach einer Sperre",
  "Không gửi DM sau khi ban": "Sendet keine DM nach einer Sperre",
  "Ghi chú khi đóng ticket (tuỳ chọn)": "Abschlussnotiz (optional)",
  "VD: Ticket đã được xử lý, cảm ơn bạn đã liên hệ.":
    "z. B. Ticket bearbeitet — danke für deine Nachricht.",
  "Đã lưu ghi chú": "Notiz gespeichert",
  "Đang mở": "Offen",
  "Đã đóng": "Geschlossen",
  "Đã đóng ticket #{p0}": "Ticket #{p0} geschlossen",
  "Đóng ticket thất bại": "Ticket konnte nicht geschlossen werden",
  "Không có ticket nào đang mở.": "Keine offenen Tickets.",
  "Chưa có ticket nào đã đóng.": "Noch keine geschlossenen Tickets.",
  "Lỗi mở kênh: {p0}": "Kanal konnte nicht erstellt werden: {p0}",
  "Đóng bởi {p0}": "Geschlossen von {p0}",
  " · đã gỡ ban": " · entbannt",
  "Mở kênh": "Kanal öffnen",
  Đóng: "Schließen",
  "Khiếu nại": "Beschwerde",
  "Hỗ trợ chung": "Allgemeiner Support",
  "Ticket & Khiếu nại": "Tickets & Beschwerden",

  // ── Plan A — mua bằng chuyển khoản ngân hàng (Premium + Admin) ──────────
  "Chuyển khoản để mua": "Per Überweisung kaufen",
  "Chuyển khoản mua gói Premium": "Überweisung für den Premium-Tarif",
  "Thanh toán một lần qua chuyển khoản — không tự động gia hạn":
    "Einmalige Zahlung per Überweisung – keine automatische Verlängerung",
  "Quét mã QR để chuyển khoản": "QR-Code zum Überweisen scannen",
  "Số tiền": "Betrag",
  "Nội dung chuyển khoản (bắt buộc)": "Verwendungszweck (erforderlich)",
  "SĐT nhận tiền": "Empfänger-Telefonnummer",
  "Mã QR nhận chuyển khoản của NGUYEN DUY KHIEM": "QR-Code für Überweisungen an NGUYEN DUY KHIEM",
  "Đã sao chép": "Kopiert",
  "Bước 1: Mở app ngân hàng hoặc ví điện tử, quét mã QR bên phải.":
    "Schritt 1: Öffne deine Banking-App oder dein Wallet und scanne den QR-Code rechts.",
  "Bước 2: Chuyển đúng SỐ TIỀN và gõ đúng NỘI DUNG ở trên.":
    "Schritt 2: Überweise den exakten BETRAG und gib den exakten VERWENDUNGSZWECK von oben an.",
  'Bước 3: Bấm nút "Tôi đã chuyển khoản" và chờ xác nhận.':
    "Schritt 3: Tippe auf „Ich habe überwiesen“ und warte auf die Bestätigung.",
  "đang tải trạng thái…": "Status wird geladen…",
  "Đang tạo mã chuyển khoản…": "Überweisungscode wird erstellt…",
  "Tôi đã chuyển khoản": "Ich habe überwiesen",
  "Đóng hướng dẫn": "Anleitung schließen",
  "Bấm sau khi bạn ĐÃ chuyển xong — chủ bot so sao kê rồi kích hoạt gói.":
    "Tippe erst darauf, nachdem du überwiesen hast – der Bot-Besitzer prüft den Kontoauszug und aktiviert den Tarif.",
  "Đã báo chuyển khoản — chờ chủ bot xác nhận":
    "Überweisung gemeldet – wartet auf Bestätigung durch den Bot-Besitzer",
  "Thanh toán thành công": "Zahlung erfolgreich",
  "Gói {goi} đã được kích hoạt — dùng tới {ngay}": "Dein Tarif {goi} ist aktiv – gültig bis {ngay}",
  "Gói của bạn đã được kích hoạt. Cảm ơn bạn đã ủng hộ!":
    "Dein Tarif ist jetzt aktiv. Danke für deine Unterstützung!",
  "Không tạo được mã chuyển khoản — thử lại sau ít phút.":
    "Überweisungscode konnte nicht erstellt werden – bitte in einigen Minuten erneut versuchen.",
  "Không báo được trạng thái — thử lại sau.":
    "Status konnte nicht gemeldet werden – bitte später erneut versuchen.",
  "Đơn này đã hết hạn hoặc bị đóng — hãy tạo mã chuyển khoản mới.":
    "Diese Bestellung ist abgelaufen oder geschlossen – erstelle einen neuen Überweisungscode.",
  "Gói được kích hoạt chậm nhất 24 giờ sau khi xác nhận đã nhận tiền (thường là ngay lập tức).":
    "Der Tarif wird spätestens 24 Stunden nach Bestätigung des Zahlungseingangs aktiviert (meist sofort).",
  "Quá 24 giờ chưa kích hoạt? Báo tại Discord kèm mã đơn {ma}.":
    "Nach 24 Stunden noch nicht aktiviert? Melde es auf Discord mit dem Bestellcode {ma}.",
  "Chính sách mua bán & cam kết dịch vụ": "Kaufbedingungen & Service-Zusage",
  "Gói Premium có hiệu lực 30 ngày kể từ khi thanh toán được xác nhận. Mỗi lần mua là một giao dịch riêng, không tự động gia hạn và không lưu thông tin thẻ hay tài khoản ngân hàng của bạn.":
    "Ein Premium-Tarif gilt 30 Tage ab Bestätigung der Zahlung. Jeder Kauf ist eine eigene Transaktion, er verlängert sich nicht automatisch, und wir speichern weder Karten- noch Kontodaten.",
  "Thời gian kích hoạt — chậm nhất 24 giờ:": "Aktivierungszeit – höchstens 24 Stunden:",
  "thường là ngay sau khi chủ bot xác nhận đã nhận tiền; trong mọi trường hợp gói được kích hoạt chậm nhất 24 giờ kể từ thời điểm đó.":
    "meist direkt nachdem der Bot-Besitzer den Zahlungseingang bestätigt hat; in jedem Fall wird der Tarif innerhalb von 24 Stunden danach aktiviert.",
  "Quá 24 giờ thì sao:": "Was passiert nach mehr als 24 Stunden:",
  "nếu quá 24 giờ chưa được kích hoạt, hãy báo tại Discord của chủ bot kèm MÃ ĐƠN (nội dung chuyển khoản). Khiếu nại được xử lý trong 24 giờ tiếp theo; nếu vẫn không kích hoạt được vì lỗi từ phía dịch vụ, bạn được HOÀN 100% số tiền đã chuyển.":
    "wenn nach 24 Stunden noch nichts aktiviert ist, melde es auf dem Discord des Bot-Besitzers mit dem BESTELLCODE (Verwendungszweck). Beschwerden werden innerhalb der nächsten 24 Stunden bearbeitet; lässt sich der Tarif weiterhin nicht aktivieren, weil der Fehler bei uns liegt, erhältst du 100 % des überwiesenen Betrags zurück.",
  "Hoàn tiền:": "Rückerstattung:",
  "hoàn 100% trong 7 ngày kể từ khi xác nhận nếu lỗi phát sinh từ phía dịch vụ khiến bạn không dùng được gói (không kích hoạt, lỗi kéo dài không khắc phục được). Dịch vụ là phần mềm phi vật thể nên không áp dụng đổi trả hàng hóa; khiếu nại xử lý theo hướng hoàn tiền hoặc kích hoạt lại, do bạn chọn.":
    "100 % Rückerstattung innerhalb von 7 Tagen nach Bestätigung, wenn der Fehler bei unserem Dienst liegt und du den Tarif nicht nutzen kannst (keine Aktivierung, anhaltender nicht behebbarer Fehler). Der Dienst ist immaterielle Software, ein Warenumtausch gilt daher nicht; Beschwerden werden per Rückerstattung oder erneuter Aktivierung gelöst – du entscheidest.",
  "Thanh toán an toàn:": "Sichere Zahlung:",
  "chỉ quét mã QR do trang này hiển thị và kiểm tra đúng chủ ví NGUYEN DUY KHIEM trước khi chuyển. Chủ bot KHÔNG BAO GIỜ yêu cầu bạn cung cấp mật khẩu ví, mã OTP hay thông tin thẻ.":
    "scanne nur den auf dieser Seite angezeigten QR-Code und prüfe vor der Überweisung, dass der Wallet-Inhaber wirklich NGUYEN DUY KHIEM ist. Der Bot-Besitzer fragt dich NIEMALS nach Wallet-Passwort, OTP-Code oder Kartendaten.",
  "Cơ sở pháp lý:": "Rechtsgrundlage:",
  "giao dịch được lập bằng hình thức điện tử theo Bộ luật Dân sự 2015 (Điều 119); quyền lợi người tiêu dùng theo Luật Bảo vệ quyền lợi người tiêu dùng số 19/2023/QH15; mua bán qua trang mạng theo Luật Thương mại điện tử số 51/2005/QH11 (sửa đổi, bổ sung). Khiếu nại gửi qua Discord của chủ bot và được phản hồi trong 48 giờ.":
    "die Transaktion erfolgt in elektronischer Form nach dem Zivilgesetzbuch 2015 (Artikel 119); Verbraucherrechte nach dem Gesetz zum Schutz der Verbraucherrechte Nr. 19/2023/QH15; Online-Verkauf nach dem E-Commerce-Gesetz Nr. 51/2005/QH11 (geändert). Beschwerden gehen über den Discord des Bot-Besitzers ein und werden innerhalb von 48 Stunden beantwortet.",
  "Bằng việc bấm mua, bạn xác nhận đã đọc chính sách này. Thanh toán là giao dịch giữa bạn và chủ ví được nêu trên — Protogon chỉ lưu mã đơn và trạng thái để kích hoạt gói.":
    "Mit dem Kauf bestätigst du, diese Bedingungen gelesen zu haben. Die Zahlung ist eine Transaktion zwischen dir und dem oben genannten Wallet-Inhaber – Protogon speichert nur Bestellcode und Status, um den Tarif zu aktivieren.",

  // ── Admin: đơn chờ xác nhận + tổng doanh thu ────────────────────────────
  "Đơn chuyển khoản chờ xác nhận": "Überweisungen warten auf Bestätigung",
  "Hiện không có đơn nào chờ xác nhận.": "Derzeit warten keine Bestellungen auf Bestätigung.",
  "Mua premium": "Premium-Kauf",
  Gói: "Tarif",
  "báo lúc": "gemeldet um",
  "Đã nhận tiền → kích hoạt": "Geld erhalten → aktivieren",
  "Đã nhận tiền và kích hoạt gói.": "Zahlung erhalten – Tarif aktiviert.",
  "Tổng doanh thu theo tháng / năm": "Gesamtumsatz nach Monat / Jahr",
  "tổng cộng": "insgesamt",
  "giao dịch": "Transaktionen",
  "Theo tháng": "Nach Monat",
  Tháng: "Monat",
  "Số GD": "Bestellungen",
  "Doanh thu": "Umsatz",
  "Chưa có giao dịch.": "Noch keine Transaktionen.",
  "Theo năm": "Nach Jahr",

  // ── Đồng ý điều khoản + hạn mức theo server (08/10/2026) ────────────────
  "Xác nhận mua gói": "Kauf bestätigen",
  "Xác nhận mua gói {goi}": "Kauf des Tarifs {goi} bestätigen",
  "Server được mở gói": "Freizuschaltender Server",
  "Server được mở:": "Freigeschalteter Server:",
  "Server này đang dùng gói Miễn phí.": "Dieser Server nutzt den Gratis-Tarif.",
  "Server này đang dùng gói {goi} — hạn tới {ngay}.":
    "Dieser Server nutzt den Tarif {goi} – gültig bis {ngay}.",
  "Gói áp dụng theo TỪNG SERVER: hạn mức nâng lên chỉ có hiệu lực ở server bạn chọn tại đây.":
    "Tarife gelten PRO SERVER: die höheren Limits wirken nur auf dem hier gewählten Server.",
  "Bạn chưa quản lý server nào có bot Protogon — hãy mời bot vào server trước.":
    "Du verwaltest noch keinen Server mit dem Protogon-Bot – lade den Bot zuerst auf einen Server ein.",
  "Hãy chọn server cần mở gói trước khi mua.":
    "Wähle vor dem Kauf den Server, der freigeschaltet werden soll.",
  "Gói KHÔNG được cấp tự động — bạn chỉ nhận được sau khi admin kiểm tra và kích hoạt.":
    "Der Tarif wird NICHT automatisch vergeben – du erhältst ihn erst, nachdem ein Admin geprüft und aktiviert hat.",
  "Thời gian kích hoạt chậm nhất 24 giờ kể từ khi xác nhận đã nhận tiền; nhanh hơn thì thường là ngay.":
    "Aktivierung spätestens 24 Stunden nach Bestätigung des Zahlungseingangs; meist geht es sofort.",
  'Sau khi chuyển khoản, bấm "Tôi đã chuyển khoản" để admin đối soát đúng đơn của bạn.':
    "Tippe nach der Überweisung auf „Ich habe überwiesen“, damit ein Admin deine Bestellung zuordnen kann.",
  "Quá 24 giờ chưa kích hoạt thì báo tại Discord chủ bot kèm mã đơn — hoàn 100% nếu lỗi từ phía dịch vụ.":
    "Nach 24 Stunden noch nicht aktiviert? Melde es auf dem Discord des Bot-Besitzers mit dem Bestellcode – 100 % Rückerstattung, wenn der Fehler bei uns liegt.",
  "Tôi đã đọc và đồng ý Điều khoản dịch vụ cùng Chính sách mua bán — hiểu rằng gói không được cấp tự động và chỉ được kích hoạt sau khi admin xác nhận, chậm nhất 24 giờ.":
    "Ich habe die Nutzungsbedingungen und die Kaufbedingungen gelesen und stimme ihnen zu – und mir ist klar, dass der Tarif nicht automatisch vergeben wird und erst nach Bestätigung durch einen Admin aktiviert wird, spätestens nach 24 Stunden.",
  "Tôi đồng ý và tạo mã chuyển khoản": "Ich stimme zu und erstelle den Überweisungscode",
  "Điều khoản phiên bản {v}.": "Bedingungen, Version {v}.",
  "Điều khoản dịch vụ": "Nutzungsbedingungen",
  "Chính sách mua bán": "Kaufbedingungen",
  "Gói không được cấp tự động: sau khi chuyển khoản, admin đối soát rồi kích hoạt — chậm nhất 24 giờ.":
    "Der Tarif wird nicht automatisch vergeben: nach der Überweisung gleicht ein Admin ab und aktiviert – spätestens nach 24 Stunden.",
  "Còn khoảng {gio} giờ trước mốc cam kết 24 giờ.":
    "Noch etwa {gio} Stunden bis zur 24-Stunden-Zusage.",
  "Đã quá cam kết 24 giờ — báo ngay tại Discord kèm mã đơn để được xử lý.":
    "Die 24-Stunden-Zusage ist überschritten – melde es sofort auf Discord mit dem Bestellcode.",
  "Quá 12 giờ chưa xác nhận": "Über 12 Stunden unbestätigt",

  // ── Thẻ gói trong dashboard (PlanCard) ──────────────────────────────────
  "Gói {goi}": "Tarif {goi}",
  "còn {n} ngày": "noch {n} Tage",
  "Đang áp dụng cho server này — hạn tới {ngay}.": "Gilt für diesen Server – gültig bis {ngay}.",
  "Server đang dùng gói Miễn phí — mọi hạn mức ở mức cơ bản.":
    "Der Server nutzt den Gratis-Tarif – alle Limits sind auf Basisniveau.",
  "Gia hạn": "Verlängern",
  "Nâng gói": "Upgrade",
  "Rule auto reply": "Auto-Antwort-Regeln",
  "Từ khoá cấm": "Gesperrte Wörter",
  "Bản backup giữ": "Behaltene Backups",
  "Ngày giữ backup": "Backup-Aufbewahrung (Tage)",
  "Gói sắp hết hạn — hết hạn là hạn mức trở về mức Miễn phí ngay. Gia hạn để giữ nguyên.":
    "Der Tarif läuft bald ab – danach gelten sofort wieder die Gratis-Limits. Verlängere, um sie zu behalten.",
  "Giữ nguyên toàn bộ tính năng bảo vệ của gói Miễn phí":
    "Behält alle Schutzfunktionen des Gratis-Tarifs",
  "Tối đa {n} rule auto reply mỗi server": "Bis zu {n} Auto-Antwort-Regeln pro Server",
  "Tối đa {n} từ khoá cấm cho automod": "Bis zu {n} gesperrte Wörter fürs Automod",
  "Giữ {n} bản backup gần nhất": "Die {n} neuesten Backups behalten",
  "Giữ backup trong {n} ngày": "Backups {n} Tage aufbewahren",
  "Cho server lớn cần trần dữ liệu cao nhất và chặn tối đa.":
    "Für große Server, die die höchsten Datenlimits und maximale Filterung brauchen.",
  "Dành cho server muốn giữ nhiều dữ liệu và chặn nhiều hơn.":
    "Für Server, die mehr Daten behalten und mehr filtern wollen.",
};
