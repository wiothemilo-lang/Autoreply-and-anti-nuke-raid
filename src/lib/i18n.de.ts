/**
 * Từ điển DE — kiểu gettext: key là CHÍNH chuỗi tiếng Việt trong code.
 * Song song với src/lib/i18n.en.ts (đợt 1); thiếu key → translate() rơi về EN,
 * vẫn thiếu nữa mới rơi về VI. Giữ nguyên placeholder {p0}, {p1}…
 */
export const DE: Record<string, string> = {
  /* ==== ĐẶC QUYỀN DỮ LIỆU — P1–P4 (10/10/2026) ==== Xem i18n.en.ts. */
  "Bảng nhiệt hiện top {n} thành viên": "Die Hitze-Rangliste zeigt die Top {n} Mitglieder",
  "Log hành động hiện {n} dòng gần nhất": "Das Aktionsprotokoll zeigt die letzten {n} Einträge",
  "Top {n} thành viên bị cảnh báo nhiệt độ vi phạm":
    "Top {n} Mitglieder mit der höchsten Verstoß-Heat",
  "Xuất CSV tới {n} dòng mỗi lượt": "Exportiert bis zu {n} Zeilen pro Durchlauf",
  "Xuất được lịch sử trong {n} ngày": "Exportiert den Verlauf der letzten {n} Tage",
  "Không xuất được dữ liệu của server này.":
    "Die Daten dieses Servers konnten nicht exportiert werden.",
  "Không xuất được dữ liệu — thử lại sau ít phút.":
    "Datenexport fehlgeschlagen — bitte in ein paar Minuten erneut versuchen.",
  "{ten} — tối đa {n} dòng · {d} ngày": "{ten} — max. {n} Zeilen · {d} Tage",
  /* ==== Khả năng truy cập (28/09/2026) ==== Xem i18n.en.ts. */
  "Bỏ qua tới nội dung": "Zum Inhalt springen",
  /* ==== Gom menu server thành nhóm (27/09/2026) ==== Xem i18n.en.ts. */
  "Bảo vệ": "Schutz",
  "Nội dung & phạt": "Inhalte & Strafen",
  "Vận hành": "Betrieb",
  /* ==== Xuất / nhập cấu hình server (27/09/2026) ==== Xem i18n.en.ts. */
  "Cấu hình server": "Server-Konfiguration",
  "Xuất & nhập cấu hình": "Konfiguration exportieren & importieren",
  "Tải toàn bộ cấu hình bảo vệ của server ra file .json để lưu lại, hoặc nạp file đã lưu.":
    "Lade alle Schutz-Einstellungen dieses Servers als .json-Datei herunter oder lade eine gespeicherte Datei.",
  "Chỉ dùng được cho cùng một server: kênh, vai trò và thành viên trong file là ID của server cũ, mang sang server khác sẽ không khớp.":
    "Gilt nur für denselben Server: Kanäle, Rollen und Mitglieder in der Datei sind IDs des ursprünglichen Servers und passen auf einem anderen nicht.",
  "Xuất cấu hình": "Konfiguration exportieren",
  "Nạp cấu hình": "Konfiguration importieren",
  "Đã tải cấu hình về máy": "Konfiguration heruntergeladen",
  "Đã nạp {p0} mục cấu hình": "{p0} Konfigurationseinträge importiert",
  "Đã bỏ {p0} mục không phải cấu hình": "{p0} Einträge übersprungen, die keine Konfiguration sind",
  "Bỏ {p0} mục vì giá trị không hợp lệ": "{p0} Einträge wegen ungültiger Werte übersprungen",
  "File không chứa cấu hình nào hợp lệ": "Datei enthält keine gültige Konfiguration",
  "File không phải JSON hợp lệ": "Datei ist kein gültiges JSON",
  "Nạp thất bại": "Import fehlgeschlagen",
  /* ==== ThreeUI toggle (27/09/2026) ==== Nhãn truy cập dự phòng cho <Switch>.
     "Tắt" đã có sẵn — xem chú thích tương ứng trong i18n.en.ts. */
  Bật: "Ein",
  /* ==== web UX 1+2+3+4 (27/09/2026) ==== */
  "Tìm kiếm nhanh": "Schnellsuche",
  "Gõ để tìm panel, sau đó Enter để mở.": "Tippen, um Panels zu suchen, dann Enter zum Öffnen.",
  "Tìm panel hoặc hành động…": "Panels oder Aktionen suchen…",
  "Tìm panel hoặc hành động": "Panels oder Aktionen suchen",
  "Không có kết quả nào.": "Keine Ergebnisse.",
  /* Xem chú thích tương ứng trong i18n.en.ts: các key này đã có sẵn ở cuối. */
  "Trang khác": "Weitere Seiten",
  "Danh sách server": "Serverliste",
  "Đang gửi cấu hình cho bot…": "Einstellungen werden an den Bot gesendet…",
  "Đã gửi cấu hình cho bot": "Einstellungen an den Bot gesendet",
  "Bot offline — cấu hình chưa được áp dụng": "Bot offline — Einstellungen noch nicht übernommen",
  "Dashboard và bot dùng chung cấu hình nhưng cập nhật không cùng lúc. Lúc này bot có thể vẫn chạy cấu hình cũ.":
    "Dashboard und Bot teilen sich die Einstellungen, aktualisieren aber nicht gleichzeitig. Der Bot nutzt möglicherweise noch die vorherigen Einstellungen.",
  "Chọn server để bật/tắt chống nuke hàng loạt":
    "Server auswählen, um Anti-Nuke gesammelt umzuschalten",
  "Chọn server {p0}": "Server {p0} auswählen",
  "server đã chọn": "Server ausgewählt",
  "Bật chống nuke": "Anti-Nuke aktivieren",
  Tắt: "Deaktivieren",
  "Đã bật chống nuke cho {p0} server": "Anti-Nuke für {p0} Server aktiviert",
  "Đã tắt chống nuke ở {p0} server": "Anti-Nuke auf {p0} Servern deaktiviert",
  "{p0} server bị bỏ qua — bạn không có quyền quản lý":
    "{p0} Server übersprungen — dir fehlt die Berechtigung",
  "Thất bại": "Fehlgeschlagen",

  /* ==== risk explain + guild stats (27/09/2026) ==== */
  "Tài khoản mới tạo dưới 1 ngày": "Konto weniger als 1 Tag alt",
  "Tài khoản mới tạo dưới 3 ngày": "Konto weniger als 3 Tage alt",
  "Tài khoản mới tạo dưới {p0} ngày": "Konto weniger als {p0} Tage alt",
  "Tài khoản đã trên 30 ngày": "Konto älter als 30 Tage",
  "Tài khoản đã trên 6 tháng": "Konto älter als 6 Monate",
  "Tài khoản đã trên 1 năm": "Konto älter als 1 Jahr",
  "Có huy hiệu HypeSquad": "Hat das HypeSquad-Abzeichen",
  "Có huy hiệu Early Verified Bot Developer": "Hat das Early-Verified-Bot-Developer-Abzeichen",
  "Có huy hiệu Early Supporter": "Hat das Early-Supporter-Abzeichen",
  "Tài khoản được Discord gắn nhãn bot": "Von Discord als Bot markiertes Konto",
  "Tên giống tài khoản đã gặp {p0}%": "Name ist zu {p0}% ähnlich zu einem bekannten Konto",
  "Tên tài khoản giống mẫu tạo hàng loạt, nhưng tài khoản đã cũ":
    "Name wirkt massenhaft generiert, aber das Konto ist alt",
  "Trùng với tài khoản trước đó đã bị phạt": "Entspricht einem previously bestraften Konto",
  "Dùng chung avatar với tài khoản vừa vào":
    "Teilt den Avatar mit einem kürzlich beigetretenen Konto",
  "Cùng lúc {p0} người rủi ro cao vào server": "{p0} risikoreiche Konten gleichzeitig beigetreten",
  "Giống người dùng đã bị ban {p0}%": "Zu {p0}% ähnlich zu einem gesperrten Nutzer",
  "chưa đủ bằng chứng để phạt": "nicht genug Beweise für eine Bestrafung",
  "Chỉ theo dõi — chưa đủ bằng chứng để phạt":
    "Nur beobachten — nicht genug Beweise für eine Bestrafung",
  "Cảnh cáo": "Verwarnung",
  "Yêu cầu xác minh": "Verifikation erforderlich",
  "Không xử lý": "Keine Maßnahme",
  "điểm rủi ro tích luỹ cao": "akkumulierter Risikowert ist hoch",
  "Tình hình hôm nay": "Heute im Überblick",
  "Tính từ 00:00 hôm nay theo giờ Việt Nam.": "Gezählt ab 00:00 heute (Vietnam-Zeit).",
  "Đe doạ đã chặn": "Blockierte Bedrohungen",
  "Người mới vào": "Neue Mitglieder",
  "Tài khoản bị xử lý": "Maßnahmen gegen Konten",
  "Nghi phạm phạt nhầm": "Verdacht auf Fehlbestrafung",
  "Điểm rủi ro dưới ngưỡng nhưng vẫn bị xử lý":
    "Risikowert unter dem Grenzwert, dennoch wurde gehandelt",
  "Yếu tố rủi ro hôm nay": "Risikofaktoren heute",

  /* ==== host-health + incidents (27/09/2026) ==== */
  "Sức khoẻ máy chủ": "Serverzustand",
  "Bot đo mỗi 5 phút · chỉ chủ bot nhìn thấy": "Alle 5 Minuten gemessen · nur für den Bot-Besitzer",
  "chưa có dữ liệu": "noch keine Daten",
  "Nghiêm trọng": "Kritisch",
  "Cần chú ý": "Warnung",
  "Bình thường": "Normal",
  "Đĩa đã dùng:": "Belegter Speicher:",
  "Còn trống:": "Frei:",
  "RAM bot:": "Bot-RAM:",
  "Đã chạy:": "Laufzeit:",

  /* ==== Đồng hồ hệ thống (đợt #1 observability) ==== */
  "Đồng hồ hệ thống": "Systemuhr",
  "Bot tự đo mỗi 5 phút · chỉ chủ bot nhìn thấy":
    "Selbst gemessen alle 5 Minuten · nur für den Bot-Besitzer",
  "Bot chưa đẩy số đo nào — thường chỉ xảy ra ngay sau khi deploy.":
    "Der Bot hat noch keine Messwerte gemeldet — meist direkt nach einem Deploy.",
  "RAM tiến trình:": "Prozess-RAM:",
  "Số server:": "Server:",
  "Lượt gọi AI:": "KI-Aufrufe:",
  "Chi phí AI:": "KI-Kosten:",
  "Thao tác": "Vorgang",
  "Độ trễ TB": "Ø Latenz",
  "Số lần": "Aufrufe",
  Lỗi: "Fehler",
  "Chưa có thao tác nào được đo — bot vừa khởi động.":
    "Noch kein Vorgang gemessen — der Bot wurde gerade gestartet.",

  /* ==== Tiền AI + hạn mức ngày (đợt #2) ==== */
  "Chi AI hôm nay:": "KI-Kosten heute:",
  "chưa biết giá": "Preis unbekannt",
  lượt: "Aufrufe",
  "đã cũ": "veraltet",
  "Bảng giá AI lần rà gần nhất:": "KI-Preistabelle zuletzt geprüft:",
  "Đã vượt hạn mức tiền AI hôm nay — provider trả phí đã bị hạ xuống cuối danh sách, bot vẫn chống raid bằng provider miễn phí.":
    "Das KI-Budget für heute ist überschritten — kostenpflichtige Anbieter wurden ans Ende der Liste verschoben; der Bot schützt Server weiterhin über kostenlose Anbieter.",
  "Bot đang offline hoặc mất kết nối Convex — số liệu máy chủ tạm dừng cập nhật.":
    "Der Bot ist offline oder hat die Convex-Verbindung verloren — die Serverwerte sind pausiert.",
  "Máy chủ bot đang chịu tải nặng — có thể gián đoạn.":
    "Der Bot-Server ist stark ausgelastet — Unterbrechungen sind möglich.",
  "Máy chủ bot sắp đầy dung lượng.": "Dem Bot-Server geht der Speicher aus.",
  "Đội ngũ đang xử lý. Có thể phản hồi chậm hoặc mất kết nối trong lúc này.":
    "Unser Team kümmert sich darum. Antworten können währenddessen langsam sein oder ausfallen.",
  /* "Sự cố" đã có sẵn ở cuối từ điển — đừng khai lại (tsc chặn trùng key). */
  "Xem theo sự cố": "Nach Vorfall ansehen",
  "Xem lịch sử thô": "Rohes Protokoll ansehen",
  "chưa xử lý": "offen",
  "Hành động kiểm duyệt": "Moderationsaktion",
  chặn: "blockiert",
  "đối tượng bị tác động": "betroffene Ziele",
  "Đã xử lý": "Erledigt",
  "Mở lại": "Wieder öffnen",
  "Các sự kiện cùng loại của cùng một người trong 15 phút được gom thành một sự cố.":
    "Gleichartige Ereignisse derselben Person innerhalb von 15 Minuten werden zu einem Vorfall zusammengefasst.",
  "Chưa có sự cố nào trong 14 ngày gần nhất — server đang yên ổn.":
    "Keine Vorfälle in den letzten 14 Tagen — der Server ist ruhig.",
  "sự kiện": "Ereignisse",

  /* ==== status-page ==== Song song với EN (xem chú thích ở i18n.en.ts). */
  "Trạng thái hệ thống": "Systemstatus",
  "Trang web": "Webseite",
  "Trang bạn đang mở — tải được là web sống.":
    "Die gerade geöffnete Seite — wenn sie lädt, läuft die Website.",
  "Backend (dữ liệu)": "Backend (Daten)",
  "Không phản hồi": "Keine Antwort",
  "Không gọi được API dữ liệu.": "Daten-API nicht erreichbar.",
  "Phản hồi:": "Antwort:",
  "Đồng bộ lần cuối:": "Letzte Synchronisierung:",
  "Heartbeat cuối:": "Letzter Heartbeat:",
  "Chưa từng thấy heartbeat.": "Noch nie einen Heartbeat erhalten.",
  "đang kiểm tra…": "wird geprüft…",
  "Bot Discord": "Discord-Bot",
  /* ==== i18n-extra-chrome ==== */
  "Ngôn ngữ": "Sprache",
  "Tiếng Việt": "Vietnamesisch",
  English: "Englisch",
  "Tiếng Đức": "Deutsch",
  "mất kết nối": "getrennt",
  "thành viên": "Mitglieder",
  "Chống nuke bật": "Anti-Nuke an",
  "Chống nuke tắt": "Anti-Nuke aus",
  /* ==== i18n-extra-altdetect ==== */
  "Rủi ro trung bình": "Mittleres Risiko",
  "Rủi ro thấp": "Niedriges Risiko",
  "An toàn": "Sicher",
  "hôm nay": "heute",
  "1 ngày": "1 Tag",
  "{n} ngày": "{n} Tage",
  "{n} tháng": "{n} Monate",
  "{n} năm": "{n} Jahre",
  "Chế độ VPN/Proxy": "VPN/Proxy-Modus",
  "Lượt join (7 ngày)": "Beitritte (7 Tage)",
  "Rủi ro cao": "Hohes Risiko",
  "Rủi ro": "Risiko",
  "Bằng chứng": "Belege",
  "Bằng việc đăng nhập, bạn đồng ý với hai văn bản pháp lý sau:":
    "Mit der Anmeldung stimmst du diesen beiden Rechtstexten zu:",
  "Xử lý": "Maßnahme",
  Tuổi: "Alter",
  "Yếu tố": "Faktor",
  "Lượt join gần đây": "Neue Beitritte",
  "Chưa có dữ liệu join nào.": "Noch keine Beitrittsdaten.",
  "Yếu tố rủi ro phổ biến": "Häufigste Risikofaktoren",
  "Đã bật Alt Detection": "Alt-Erkennung aktiviert",
  "Đã tắt Alt Detection": "Alt-Erkennung deaktiviert",
  /* ==== Chuỗi render thẳng + default prop của MultiSelect — 28/09/2026 ==== */
  "Phát hiện và chặn alt account, VPN/Proxy khi thành viên mới tham gia server.":
    "Erkennt und blockiert Alt-Accounts sowie VPN/Proxy, wenn neue Mitglieder beitreten.",
  "Ngưỡng rủi ro:": "Risikoschwelle:",
  "Tài khoản mới": "Neue Konten",
  "10 (nghiêm ngặt)": "10 (streng)",
  "100 (lỏng lẻo)": "100 (locker)",
  "Chọn…": "Auswählen…",
  "Không có lựa chọn": "Keine Auswahl",
  ẨN: "VERSTECKT",
  "trên thiết bị này": "auf diesem Gerät",
  "Đang chuyển tới Discord…": "Weiterleitung zu Discord…",
  "Đăng nhập với Discord": "Mit Discord anmelden",
  "sự kiện đã hiển thị": "Ereignisse angezeigt",
  "Tổng quan": "Übersicht",
  "Auto-mod": "Auto-Mod",
  "Join Gate": "Join Gate",
  "Alt Detection": "Alt-Erkennung",
  "Raid external app": "Extern-App-Raid",
  Whitelist: "Whitelist",
  "Backup server": "Server-Backup",
  "Tôi là Haimiya, trợ lý ảo của Protogon — bot Discord bảo vệ server. Tôi có thể giải đáp về hệ thống nhiệt độ, Join Gate, chống nuke/raid, auto reply, công cụ mod… Bạn cứ hỏi, tôi sẽ trả lời rõ ràng.":
    "Ich bin Haimiya, die Assistentin von Protogon — dem Discord-Bot, der deinen Server schützt. Ich erkläre dir Verstoß-Heat, Join Gate, Anti-Nuke/Raid, Auto-Reply und Mod-Werkzeuge… Frag einfach, ich antworte klar.",
  "Dashboard là trang quản lý bot trên web 🖥️. Bạn đăng nhập bằng Discord, chọn server, rồi quản lý mọi thứ: Moderation (nhiệt độ, warn, lọc nội dung), Join Gate, Chống nuke/raid, Hình phạt và Cài đặt (prefix, kênh log, chủ đề màu). Thay đổi được bot áp dụng trong khoảng 3 phút.":
    "Das Dashboard ist die Web-Oberfläche 🖥️. Melde dich mit Discord an, wähle einen Server und verwalte alles: Moderation (Heat, Verwarnungen, Inhaltsfilter), Join Gate, Anti-Nuke/Raid, Strafen und Einstellungen (Prefix, Log-Kanäle, Farbschema). Änderungen greifen in etwa 3 Minuten.",
  "Bot hỗ trợ cả prefix và slash command ⌨️. Công cụ Mod: /mod timeout, /mod kick, /mod ban, /mod purge — lệnh text tương đương !timeout !kick !ban !purge. Ngoài ra: /heat status xem nhiệt & warn, /antinuke bật tắt bảo vệ, /prefix đổi prefix, /badword quản lý từ ngữ xấu. Gõ / trong Discord để xem toàn bộ danh sách slash command.":
    "Der Bot unterstützt Prefix- und Slash-Befehle ⌨️. Mod-Werkzeuge: /mod timeout, /mod kick, /mod ban, /mod purge — Text-Äquivalente: !timeout !kick !ban !purge. Außerdem: /heat status für Heat & Verwarnungen, /antinuke zum Ein-/Ausschalten des Schutzes, /prefix zum Ändern des Prefix, /badword zur Pflege der Wortfilter. Tippe / in Discord für die vollständige Slash-Liste.",
  // ── Bổ sung 22/09: bịt rò rỉ khu vực chủ bot + gộp cấu hình kênh log ──
  "Phần này nằm trong khu vực riêng của chủ sở hữu bot nên mình không chia sẻ công khai 🔒. Nếu bạn cần hỗ trợ về các tính năng dùng chung — auto reply, nhiệt độ vi phạm, chống nuke/raid, Join Gate, verify, backup — cứ hỏi mình nhé.":
    "Dieser Bereich gehört dem Bot-Besitzer, deshalb gebe ich ihn nicht öffentlich preis 🔒. Wenn du Hilfe zu den gemeinsamen Funktionen brauchst — Auto-Reply, Verstoß-Heat, Anti-Nuke/Raid, Join Gate, Verifizierung, Backups — frag einfach.",
  "Khóa khu vực riêng tư dành cho chủ sở hữu bot. Mật khẩu thuộc về chủ bot và áp dụng cho":
    "Sperrt den privaten Bereich des Bot-Besitzers. Das Passwort gehört dem Bot-Besitzer und gilt für",
  "mọi server": "alle Server",
  "bạn quản lý trên dashboard — không riêng server này. Chỉ":
    "die du im Dashboard verwaltest — nicht nur diesen. Nur",
  "được đặt, đổi hoặc xóa.": "darf es setzen, ändern oder löschen.",
  "Chống nuke/raid, Join Gate, verify, báo cáo hàng ngày và mọi thông báo hệ thống. Để trống = tắt toàn bộ log.":
    "Anti-Nuke/Raid, Join Gate, Verifizierung, Tagesbericht und alle Systemmeldungen. Leer lassen = Logging komplett aus.",
  "Kênh log hành động mod (tùy chọn)": "Log-Kanal für Mod-Aktionen (optional)",
  "Case ban · kick · timeout · warn và auto-mod (embed hình phạt với":
    "Fälle für Ban · Kick · Timeout · Warn sowie Auto-Mod (Straf-Embed mit",
  "embed hình phạt chi tiết": "detailliertes Straf-Embed",
  "Dùng /report hoặc !report khi server bị raid/nuke hay bot phạt nhầm: hệ thống đọc lại hàng trăm tin nhắn gần nhất để dựng đúng diễn biến và gửi báo cáo kèm bằng chứng cho bạn.":
    "Nutze /report oder !report, wenn ein Raid/Nuke läuft oder der Bot die falsche Person bestraft: das System liest hunderte der jüngsten Nachrichten erneut, um den Ablauf zu rekonstruieren, und schickt dir einen Bericht mit Belegen.",
  "Đang hiển thị 20/32 module.": "20 von 32 Modulen werden hier gezeigt.",
  "12 module chống nuke còn lại bật/tắt trong dashboard.":
    "Die übrigen 12 Anti-Nuke-Module lassen sich im Dashboard ein- und ausschalten.",
  "Haimiya là trợ lý ảo của Protogon, luôn túc trực trên website và dashboard. Haimiya trả lời bằng đúng ngôn ngữ bạn đang chọn — tiếng Việt, tiếng Anh hoặc tiếng Đức — về hệ thống nhiệt độ, warn tích lũy, Join Gate, chống nuke/raid, auto reply và cách cấu hình bot.":
    "Haimiya ist der virtuelle Assistent von Protogon und immer auf der Website und im Dashboard erreichbar. Haimiya antwortet in der Sprache, die du ausgewählt hast — Vietnamesisch, Englisch oder Deutsch — zu Hitzesystem, Verwarnungen, Join Gate, Anti-Nuke/Raid, Auto-Antworten und der Bot-Konfiguration.",
  '; lý do trống → ghi "không có lý do"). Để trống = dùng kênh log chung; chọn trùng kênh log chung thì bot vẫn chỉ gửi một tin cho mỗi case — không nhân đôi log.':
    '; ein leeres Motiv wird als "kein Motiv" geloggt). Leer lassen = allgemeinen Log-Kanal nutzen; derselbe Kanal wie der allgemeine Log sendet trotzdem nur eine Nachricht pro Fall — keine doppelten Logs.',
  "Kênh nhận thông báo": "Kanal für Benachrichtigungen",
  "Bot gửi case vào kênh log hành động mod; chưa đặt thì dùng kênh log chung. Nơi cấu hình duy nhất là":
    "Der Bot meldet jeden Fall im Log-Kanal für Mod-Aktionen, sonst im allgemeinen Log-Kanal. Konfiguriert wird das nur unter",
  "Cài đặt → Kênh log": "Einstellungen → Log-Kanäle",
  "— không chọn kênh lại ở đây để tránh hai nơi ghi đè nhau và log bị nhân đôi.":
    "— wähle hier keinen Kanal erneut, damit sich zwei Stellen nicht überschreiben und Logs nicht doppelt erscheinen.",
  "Đang gửi tới:": "Aktuell geht an:",
  "Chưa chọn kênh log nào nên bot chưa gửi được thông báo hình phạt — vào Cài đặt → Kênh log để chọn.":
    "Es ist noch kein Log-Kanal gesetzt, daher kann der Bot keine Straf-Hinweise senden — wähle einen unter Einstellungen → Log-Kanäle.",
  "Xác minh (Verify)": "Verifizierung",
  "Webhook & Log": "Webhook & Log",
  "Cài đặt": "Einstellungen",
  "Hệ thống nhiệt độ 4 giai đoạn + warn tích lũy":
    "4-stufiges Heat-System + kumulierte Verwarnungen",
  "Join Gate chống selfbot khi vào server": "Join Gate blockt Selfbots beim Beitritt",
  "Chặn link độc hại & file nguy hiểm": "Blockt bösartige Links & gefährliche Dateien",
  "Công cụ mod: timeout, kick, ban, purge kèm lý do":
    "Mod-Werkzeuge: Timeout, Kick, Ban, Purge mit Grund",
  "Tùy chọn lưu / không lưu đăng nhập": "Option: Anmeldung merken / nicht merken",
  /* ==== i18n-extra-kb ==== */
  "Mỗi server có thể chọn chủ đề màu riêng cho trang quản lý 🎨. Vào Cài đặt → mục Chủ đề màu của server: chọn 1 trong 8 màu (Hồng anh đào, Hồng đỏ, Cam hoàng hôn, Vàng hổ phách, Xanh lá, Xanh ngọc, Xanh trời, Tím oải hương) rồi bấm Áp dụng. Màu sẽ áp dụng ngay cho nút bấm, thẻ và sidebar của riêng server đó trên web.":
    "Jeder Server kann ein eigenes Farbschema für seine Verwaltungsseite wählen 🎨. Gehe zu Einstellungen → Server-Farbschema: wähle 1 von 8 Farben (Kirschrosa, Purpurrot, Sonnenuntergangsorange, Bernsteingelb, Grün, Türkis, Himmelblau, Lavendel) und klicke auf Anwenden. Die Farbe gilt sofort für die Schaltflächen, Karten und die Seitenleiste dieses Servers im Web.",
  "Công cụ Mod giúp xử lý thành viên nhanh chóng và có ghi chép đầy đủ 🛠️: /mod timeout @user 10m [lý do], /mod kick @user [lý do], /mod ban @user [lý do] (kèm --days để xóa tin nhắn) và /mod purge <số tin>. Lệnh text tương đương: !timeout, !kick, !ban, !purge. Mọi hành động đều được ghi vào kênh log và bảng hình phạt trên dashboard với lý do + người thực hiện. Cần quyền Quản lý server hoặc role Mod/Admin được cấu hình.":
    "Mit den Mod-Werkzeugen reagierst du schnell und lückenlos dokumentiert 🛠️: /mod timeout @user 10m [Grund], /mod kick @user [Grund], /mod ban @user [Grund] (mit --days werden Nachrichten gelöscht) und /mod purge <Anzahl>. Text-Äquivalente: !timeout, !kick, !ban, !purge. Jede Aktion wird mit Grund + Ausführendem in den Log-Kanal und die Straftabelle im Dashboard geschrieben. Erfordert Server verwalten oder eine konfigurierte Mod/Admin-Rolle.",
  "Trang đăng nhập có tùy chọn lưu đăng nhập 🪪. Tích Lưu đăng nhập → phiên đăng nhập được giữ lại trên thiết bị, mở lại trình duyệt không cần đăng nhập lại. Chọn Không lưu đăng nhập → token chỉ sống trong tab hiện tại, đóng trình duyệt là phải đăng nhập lại — an toàn hơn khi dùng máy công cộng.":
    "Die Anmeldeseite bietet eine Option zum Merken der Anmeldung 🪪. Anmeldung merken anhaken → die Sitzung bleibt auf dem Gerät; beim erneuten Öffnen des Browsers ist keine neue Anmeldung nötig. Anmeldung nicht merken wählen → der Token lebt nur im aktuellen Tab; beim Schließen des Browsers muss man sich neu anmelden — sicherer an öffentlichen Rechnern.",
  "Warn tích lũy giúp phát hiện người tái phạm liên tục ⚠️. Mỗi lần vi phạm bị xử lý Cảnh báo sẽ được đếm; đủ N lần (mặc định 3) trong cửa sổ (mặc định 60 phút) thì tự tăng cấp hình phạt (tạm khóa / kick / ban — bạn chọn được). Số warn hiển thị dạng X/N ngay trong bảng nhiệt trên dashboard và báo cáo hàng ngày.":
    "Kumulierte Verwarnungen entlarven Wiederholungstäter ⚠️. Jede mit einer Verwarnung geahndete Übertretung wird gezählt; nach N Verwarnungen (Standard 3) im Zeitfenster (Standard 60 Minuten) eskaliert die Strafe automatisch (Timeout / Kick / Ban — frei wählbar). Die Verwarnungszahl erscheint als X/N direkt in der Heat-Tabelle im Dashboard und im Tagesbericht.",
  "Module chống link độc hại & file nguy hiểm bảo vệ thành viên khỏi lừa đảo 🛡️. Bot phát hiện và xóa tin chứa: domain lừa đảo phổ biến (nitro giả, gift giả, crypto scam…), link IP trực tiếp, chữ ký nội dung scam, và file đuôi nguy hiểm (.exe .scr .bat .msi .vbs .ps1 .jar .apk .hta…). Mỗi lần phát hiện đều cảnh báo trong kênh log kèm tên file hoặc link.":
    "Das Modul für bösartige Links & gefährliche Dateien schützt Mitglieder vor Betrug 🛡️. Der Bot erkennt und löscht Nachrichten mit: verbreiteten Scam-Domains (Fake-Nitro, Fake-Geschenke, Crypto-Scams…), direkten IP-Links, Scam-Inhalts-Signaturen und gefährlichen Dateiendungen (.exe .scr .bat .msi .vbs .ps1 .jar .apk .hta…). Jeder Fund wird mit Dateiname oder Link im Log-Kanal gemeldet.",
  "Mục Moderation tập trung lọc nội dung tin nhắn ✂️: chống spam tin nhắn, chống spam mention, lọc từ ngữ xấu (danh sách tùy chỉnh), chống spam ảnh/file đính kèm, chặn link mời Discord (discord.gg, discord.com/invite) và chống link độc hại/file nguy hiểm. Mỗi module bật/tắt riêng, chỉnh ngưỡng, hình phạt và mức nhiệt cộng cho từng vi phạm.":
    "Moderation filtert Nachrichteninhalte ✂️: Anti-Nachrichten-Spam, Anti-Mention-Spam, Schimpfwortfilter (eigene Liste), Anti-Bild/Datei-Spam, Block von Discord-Einladungen (discord.gg, discord.com/invite) sowie bösartige Links/gefährliche Dateien. Jedes Modul einzeln schaltbar, mit eigenen Schwellen, Strafen und Heat-Zuschlag pro Verstoß.",
  "Báo cáo hàng ngày là bản tóm tắt gửi vào kênh log mỗi ngày 📊: tổng số sự kiện, chi tiết theo module, thủ phạm thường xuyên, trạng thái khóa kênh, cùng danh sách nhiệt độ và warn tích lũy của từng thành viên. Bật/tắt trong Cài đặt → Báo cáo chống nuke hàng ngày, nhớ đặt kênh log.":
    "Der Tagesbericht ist eine Zusammenfassung, die täglich in den Log-Kanal posted 📊: Ereignisanzahl, Aufschlüsselung nach Modul, Vielfach-Täter, Kanalsperr-Status sowie Heat und kumulierte Verwarnungen jedes Mitglieds. Schalten unter Einstellungen → Täglicher Anti-Nuke-Bericht; Log-Kanal nicht vergessen.",
  /* ==== i18n-extra-chat ==== */
  "Ảnh không đọc được": "Bild konnte nicht gelesen werden",
  "Video không đọc được": "Video konnte nicht gelesen werden",
  "Không trích được khung hình từ video": "Konnte keine Frames aus dem Video extrahieren",
  "Chỉ hỗ trợ ảnh (jpg/png/webp) hoặc video (mp4/webm)":
    "Nur Bilder (jpg/png/webp) oder Videos (mp4/webm) werden unterstützt",
  "Máy chủ AI đang lỗi tạm thời": "Der KI-Server ist vorübergehend gestört",
  "(xem ảnh)": "(siehe Bild)",
  "Hãy mô tả ảnh này.": "Bitte beschreibe dieses Bild.",
  "Không đọc được file": "Datei konnte nicht gelesen werden",
  "Mô tả về ảnh…": "Bild beschreiben…",
  "Hỏi tôi điều gì đó…": "Frag mich etwas…",
  "Haimiya sẵn sàng giải đáp — hỏi về Protogon hay bất cứ điều gì ngoài lề.":
    "Haimiya ist bereit — frag nach Protogon oder allem anderen.",
  "Haimiya trò chuyện thoải mái — hỏi về Protogon hoặc bất cứ điều gì bạn muốn.":
    "Haimiya plaudert gern — frag nach Protogon oder allem, was du magst.",
  "⚠️ AI trên máy chủ chưa phản hồi — {reason}. Tạm trả lời bằng kiến thức cục bộ.":
    "⚠️ Die KI auf dem Server hat nicht geantwortet — {reason}. Vorerst antworte ich aus dem lokalen Wissen.",
  "⚠️ AI trên máy chủ chưa phản hồi. Tạm trả lời bằng kiến thức cục bộ.":
    "⚠️ Die KI auf dem Server hat nicht geantwortet. Vorerst antworte ich aus dem lokalen Wissen.",
  /* ==== i18n-extra-haimiya ==== */
  "Xin chào! Tôi là Haimiya, trợ lý ảo của Protogon — bot Discord bảo vệ server. Tôi có thể giúp bạn giải đáp về hệ thống nhiệt độ, Join Gate, chống nuke/raid, công cụ mod và nhiều hơn nữa. Bạn muốn hỏi điều gì?":
    "Hallo! Ich bin Haimiya, Protogons virtuelle Assistentin — ein Discord-Bot, der deinen Server schützt. Ich erkläre dir Heat-System, Join Gate, Anti-Nuke/Raid, Mod-Werkzeuge und viel mehr. Was möchtest du wissen?",
  "Mình rất muốn trò chuyện về điều đó! Hiện tại AI thật chưa kết nối được nên mình chỉ trả lời được các câu hỏi về Protogon trong kiến thức sẵn có. Bạn thử hỏi về: nhiệt độ, join gate, warn, hosting, bảng hình phạt… Hoặc chọn một câu hỏi gợi ý bên dưới nhé.":
    "Darüber rede ich sehr gern! Die echte KI ist gerade nicht verbunden, deshalb kann ich nur Protogon-Fragen aus meinem eingebauten Wissen beantworten. Frag doch nach: Heat, Join Gate, Verwarnungen, Hosting, Straftabelle… Oder wähle unten einen Vorschlag.",
  "Hệ thống nhiệt độ hoạt động thế nào?": "Wie funktioniert das Heat-System?",
  "Join Gate là gì?": "Was ist Join Gate?",
  "Cách chạy bot trên hosting": "So betreibst du den Bot auf einem Hosting",
  "Công cụ mod gồm những gì?": "Was umfassen die Mod-Werkzeuge?",
  "Bảng hình phạt là gì?": "Was ist die Straftabelle?",
  "Cách xem nhiệt của thành viên": "So siehst du die Heat eines Mitglieds",
  "Chống nuke/raid là gì?": "Was ist Anti-Nuke/Raid?",
  "Moderation lọc những gì?": "Was filtert Moderation?",
  "Join Gate chống được gì?": "Wogegen schützt Join Gate?",
  "Warn tích lũy là gì?": "Was sind kumulierte Verwarnungen?",
  "Báo cáo hàng ngày là gì?": "Was ist der Tagesbericht?",
  "Chủ đề màu server là gì?": "Was ist das Server-Farbschema?",
  "Đổi avatar bot ở đâu?": "Wo ändere ich den Bot-Avatar?",
  "Cách đặt kênh log": "So setzt du den Log-Kanal",
  "Cách đăng nhập dashboard": "So meldest du dich im Dashboard an",
  "Bot có những lệnh nào?": "Welche Befehle hat der Bot?",
  "Lưu đăng nhập là gì?": "Was bedeutet „Anmeldung merken“?",
  /* ==== i18n-extra-haimiya-answers ==== */
  "Hệ thống nhiệt độ hoạt động theo thang điểm 0–100 🌡️. Mỗi vi phạm cộng điểm nhiệt theo cài đặt; ngưỡng mặc định: cảnh báo 25, tạm khóa 40, kick 70, ban 90. Khi chạm ngưỡng, bot tự xử lý (cảnh báo DM → tạm khóa → kick → ban). Nhiệt giảm dần theo phút (mặc định 3 điểm/phút) và nếu tái phạm trong cửa sổ (mặc định 30 phút) sẽ bị nhân nhiệt (mặc định x2). Tất cả ngưỡng đều chỉnh được trong Moderation.":
    "Das Heat-System läuft auf einer 0–100-Skala 🌡️. Jede Übertretung addiert Heat nach deinen Einstellungen; Standardschwellen: Verwarnung 25, Timeout 40, Kick 70, Ban 90. Wird ein Schwellenwert erreicht, greift der Bot automatisch ein (DM-Verwarnung → Timeout → Kick → Ban). Heat sinkt pro Minute (Standard 3 Punkte/Minute); Wiederholung im Zeitfenster (Standard 30 Minuten) multipliziert die Heat (Standard ×2). Alle Schwellen sind in Moderation einstellbar.",
  "Join Gate là cổng kiểm soát thành viên khi vào server 🚪. Bạn bật từng tùy chọn trong mục Join Gate: chặn tài khoản quá mới (số ngày tùy chỉnh), bắt buộc có avatar, bắt buộc có huy hiệu, và chặn toàn bộ lượt vào khi server đang bị raid. Có danh sách trắng để miễn trừ, và chọn hình phạt Kick hoặc Ban cho các trường hợp bị chặn.":
    "Join Gate prüft Mitglieder beim Server-Beitritt 🚪. Aktiviere jede Option im Bereich Join Gate: zu neue Konten blocken (Tage einstellbar), Avatar erzwingen, Abzeichen erzwingen und alle Beitritte sperren, während der Server geraidet wird. Eine Whitelist kann ausnehmen; für Blockierte wählst du Kick oder Ban.",
  "Chống nuke/raid bảo vệ cấu trúc server 🛡️ với 10 module nuke: ban hàng loạt, kick hàng loạt, raid thành viên, tạo kênh hàng loạt, xóa kênh hàng loạt, tạo role hàng loạt, xóa role hàng loạt, xóa tin hàng loạt, tạo webhook hàng loạt, tạo thread hàng loạt. Các module này phạt trực tiếp (warn/kick/ban/timeout), không cộng nhiệt. Bot có AI Guard 🧠 tự phân biệt đâu là raid/nuke thật sự (leo thang ban + khóa kênh) với vi phạm cá nhân (chỉ cộng nhiệt, moderation bình thường) — nhận diện cả spam tin dài cực dài, tin lặp nội dung và tin giả blank (toàn khoảng trắng/ký tự ẩn) gây nhiễu. Khi bị tấn công, bot tự khóa kênh (lockdown) và mở khóa bằng /antinuke unlock.":
    "Anti-Nuke/Raid schützt die Serverstruktur 🛡️ mit 10 Nuke-Modulen: Massen-Ban, Massen-Kick, Mitglieder-Raid, Massen-Kanalerstellung, Massen-Kanallöschung, Massen-Rollenerstellung, Massen-Rollenlöschung, Massen-Nachrichtenlöschung, Massen-Webhook-Erstellung, Massen-Thread-Erstellung. Diese Module strafen direkt (Warn/Kick/Ban/Timeout), ohne Heat. Der KI-Wächter 🧠 unterscheidet echtes Raid/Nuke (Ban-Eskalation + Kanalsperre) von Einzeltätern (nur Heat, normale Moderation) — und erkennt auch extrem lange Nachrichten, Duplikate und Blank-Rauschen (nur Leerzeichen/unsichtbare Zeichen). Bei Angriff sperrt der Bot Kanäle (Lockdown); Entsperren mit /antinuke unlock.",
  "Auto Reply tự động trả lời tin nhắn theo rule 💬. Mỗi rule gồm: tên, loại kích hoạt (từ khóa xuất hiện trong tin hoặc khi thành viên tag bot), nội dung trả lời (hỗ trợ {user} và {username}), giới hạn kênh và cooldown chống spam. Quản lý rule ngay trên dashboard hoặc lệnh !autoreply add/list/remove.":
    "Auto Reply beantwortet Nachrichten nach Regel 💬. Jede Regel hat: Namen, Auslösertyp (Schlüsselwort in der Nachricht oder Mitglied taggt den Bot), Antworttext (unterstützt {user} und {username}), Kanaleinschränkung und Anti-Spam-Cooldown. Regeln verwaltest du im Dashboard oder mit !autoreply add/list/remove.",
  "Protogon miễn phí cho mọi server 💰. Toàn bộ tính năng công khai — auto reply, nhiệt độ 4 giai đoạn, warn tích lũy, Join Gate, chống nuke/raid, chặn link độc hại, công cụ mod, bảng hình phạt, báo cáo hàng ngày — đều dùng được không giới hạn. Bạn chỉ cần host bot và dùng dashboard, không mất phí.":
    "Protogon ist für jeden Server kostenlos 💰. Alle öffentlichen Funktionen — Auto-Reply, 4-stufiges Heat, kumulierte Verwarnungen, Join Gate, Anti-Nuke/Raid, Block bösartiger Links, Mod-Werkzeuge, Straftabelle, Tagesbericht — sind unbegrenzt nutzbar. Du hostest nur den Bot und nutzt das Dashboard; keine Gebühren.",
  "Đăng nhập rất nhanh 🪪. Bấm nút Đăng nhập với Discord ở góc phải trên cùng (hoặc nút Mở dashboard), Discord xác nhận quyền, xong là vào thẳng dashboard. Trang đăng nhập có tùy chọn Lưu đăng nhập / Không lưu đăng nhập. Chỉ server nào bạn có quyền quản lý mới hiện ra — nếu chưa thấy server, hãy mời bot vào server đó trước.":
    "Die Anmeldung dauert Sekunden 🪪. Klicke auf Mit Discord anmelden oben rechts (oder Dashboard öffnen), Discord bestätigt die Rechte, und du landest direkt im Dashboard. Die Anmeldeseite bietet Anmeldung merken / nicht merken. Nur Server mit Verwaltungsrecht erscheinen — fehlt einer, lade den Bot zuerst dorthin ein.",
  "Để bot chạy 24/7, bạn cần một hosting bot (ví dụ Wispbyte) 🚀. Quy trình: tải file zip bot từ nhánh host-deploy trên GitHub → vào hosting, xóa file cũ → upload zip mới → Unarchive → Restart. Mỗi lần có bản cập nhật, lặp lại đúng quy trình đó. Nhớ cấu hình đủ token Discord và khóa Convex trong file cấu hình.":
    "Damit der Bot 24/7 läuft, brauchst du ein Bot-Hosting (z. B. Wispbyte) 🚀. Ablauf: Bot-Zip vom GitHub-Zweig host-deploy laden → im Hosting alte Dateien löschen → neue Zip hochladen → Unarchive → Neustart. Bei jedem Update denselben Ablauf wiederholen. Discord-Token und Convex-Schlüssel in der Konfigurationsdatei nicht vergessen.",
  "Bảng hình phạt nằm trong mục Hình phạt trên sidebar trang quản lý server 🛠️. Nó liệt kê đầy đủ các hình phạt gần nhất: timeout, kick, ban, purge — kèm thời gian, thành viên bị phạt, người thực hiện (mod) và lý do. Các hình phạt tự động từ hệ thống chống nuke/nhiệt độ cũng được ghi vào bảng này với nhãn Tự động. Bot ghi nhận khi bạn dùng /mod hoặc !timeout !kick !ban !purge.":
    "Die Straftabelle liegt unter Strafen in der Server-Seitenleiste 🛠️. Sie listet die neuesten Strafen vollständig: Timeout, Kick, Ban, Purge — mit Zeit, bestraftem Mitglied, Ausführendem (Mod) und Grund. Automatische Strafen aus Anti-Nuke/Heat landen ebenfalls hier, mit der Markierung Automatisch. Der Bot erfasst sie bei /mod oder !timeout !kick !ban !purge.",
  "! Thử một trận Valorant 5v5 không? 🎮": "! Lust auf ein 5v5 in Valorant? 🎮",
  '"{p0}" đã có trong danh sách': "„{p0}“ ist bereits in der Liste",
  "(7 ngày)": "(7 Tage)",
  "(JSON thường / base64 / có lớp bọc), tạo lại":
    "(einfaches JSON / base64 / verpackt), neu erstellen",
  "(chỉ server này)": "(nur dieser Server)",
  "(chống nuke / auto-mod — Responsible moderator hiển thị là “Bot tự động”) lẫn":
    "(Anti-Nuke / Auto-Mod — Verantwortlicher Moderator erscheint als „Automatisch“) als auch",
  "(hiển thị tên người thực hiện). Lý do để trống → ghi “không có lý do”. Chọn":
    "(zeigt den Ausführenden). Leerer Grund → als „kein Grund“ vermerkt. Wähle",
  "(kể cả raid/nuke phát hiện qua AI). Role ở server khác không ảnh hưởng.":
    "(auch KI-erkannte Raids/Nukes). Rollen anderer Server bleiben ohne Wirkung.",
  "(tên, màu, hoist, mentionable, quyền),": "(Name, Farbe, Hoist, Nennbar, Rechte),",
  "(tối thiểu": "(mindestens",
  "(đã đặt trong Keys) — owner các server khác": "(unter Keys gesetzt) — Owner anderer Server",
  ", không avatar, không huy hiệu → đã bị kick.": ", kein Avatar, kein Abzeichen → gekickt.",
  ", mỗi lần vi phạm đếm": ", jede Übertretung zählt",
  ". Bot chưa có BOT_KEY sẽ": ". Ein Bot ohne BOT_KEY wird",
  ". Slash command hoạt động độc lập.": ". Slash-Befehle funktionieren unabhängig.",
  "1. Backup đã được đẩy lên GitHub từ trước → dữ liệu vẫn còn.":
    "1. Das Backup wurde zuvor bereits zu GitHub geschoben → Daten sind noch da.",
  "2. Tạo server phụ, mời bot vào.": "2. Erstelle einen Backup-Server und lade den Bot ein.",
  "3 bản mới nhất": "die 3 neuesten Versionen",
  "3. Vào dashboard → server phụ → Backup → bấm “Khôi phục”.":
    "3. Dashboard öffnen → Backup-Server → Backup → auf „Wiederherstellen“ klicken.",
  "32 module bảo vệ": "32 Schutzmodule",
  "32/32 bật": "32/32 an",
  "4. Bot tạo lại role (tên, màu, quyền), danh mục, kênh + quyền truy cập và cấu hình cơ bản. Các role/kênh có sẵn của server phụ được giữ nguyên (không xóa gì).":
    "4. Der Bot erstellt Rollen (Name, Farbe, Rechte), Kategorien, Kanäle + Zugriffsrechte und Grundkonfiguration neu. Vorhandene Rollen/Kanäle des Backup-Servers bleiben unangetastet (nichts wird gelöscht).",
  "AI chẩn đoán lỗi runtime · đề xuất vá vào kênh log (không tự sửa)":
    "KI diagnostiziert Laufzeitfehler · schlägt Patch im Log-Kanal vor (kein Auto-Fix)",
  "AI nhận diện": "KI-Erkennung",
  "AI tổng hợp (Mimo V2.5)": "KI-Synthese (Mimo V2.5)",
  "App ngoài phát hiện": "Externe Apps erkannt",
  "Auto-mod nội dung": "Inhalts-Auto-Mod",
  "Avatar URL ghi đè (tùy chọn)": "Avatar-URL überschreiben (optional)",
  "Backup có sẵn": "Verfügbare Backups",
  /* ==== Kế hoạch khôi phục / dry-run (29/09/2026) ==== */
  "Xem kế hoạch": "Plan ansehen",
  /* ==== Phạm vi chụp mở rộng (29/09/2026) ==== */
  "Khôi phục tên / mô tả / icon server": "Servername / Beschreibung / Icon wiederherstellen",
  "Khôi phục danh sách ban + link mời": "Ban-Liste + Einladungslinks wiederherstellen",
  "không hoàn tác được": "nicht rückgängig machbar",
  /* ==== Vorhandene Kanäle beim Wiederherstellen löschen (06/10/2026) ==== */
  "Xoá kênh sẵn có của server trước khi dựng lại":
    "Vorhandene Kanäle des Servers vor dem Neuaufbau löschen",
  "NGOẠI LỆ: “xoá kênh sẵn có” đang BẬT nên các KÊNH đang có của server này sẽ bị XOÁ trước khi dựng lại — không hoàn tác được (tin nhắn trong kênh mất theo). Role thì vẫn giữ nguyên.":
    "AUSNAHME: “vorhandene Kanäle löschen” ist AN — die vorhandenen KANÄLE dieses Servers werden vor dem Neuaufbau GELÖSCHT, das ist nicht rückgängig machbar (Nachrichten in diesen Kanälen gehen verloren). Rollen bleiben erhalten.",
  "Chỉ bật khi khôi phục vào server đã có sẵn kênh rác cần dọn: bot sẽ XOÁ các kênh xoá được của server này TRƯỚC khi dựng lại kênh theo backup (tin nhắn trong kênh mất theo). Kênh bot không xoá được — kênh nằm trên role của bot, kênh quy tắc/thông báo cập nhật — vẫn được giữ nguyên.":
    "Nur aktivieren, wenn in einen Server wiederhergestellt wird, der noch alte Kanäle zum Aufräumen hat: der Bot LÖSCHT die löschbaren Kanäle dieses Servers VOR dem Neuaufbau der Kanäle aus dem Backup (Nachrichten darin gehen verloren). Kanäle, die der Bot nicht löschen kann — über der Bot-Rolle oder Regel-/Update-Kanäle — bleiben erhalten.",
  /* ==== Quy tắc giữ bản (29/09/2026) ==== */
  Giữ: "Behalte",
  "bản gần nhất": "neueste Backups",
  "xoá bản cũ hơn": "Backups löschen, die älter sind als",
  "ngày (0 = không xoá theo tuổi)": "Tage (0 = kein Alterslimit)",
  "Lưu quy tắc giữ bản": "Aufbewahrungsregel speichern",
  "Đã lưu quy tắc giữ bản: giữ {p0} bản gần nhất, xoá bản cũ hơn {p1} ngày.":
    "Aufbewahrungsregel gespeichert: die {p0} neuesten Backups behalten, alles älter als {p1} Tage löschen.",
  "Quy tắc này áp dụng cho các lần backup TIẾP THEO — bot xoá bản cũ ngay khi lưu bản mới, không xoá ngược lại những bản đang có.":
    "Diese Regel gilt für die NÄCHSTEN Backups — der Bot löscht alte beim Speichern eines neuen; vorhandene Backups werden nicht gelöscht.",
  "Quy tắc có hiệu lực từ lần backup kế tiếp. Những bản đang có không bị xoá ngay.":
    "Die Regel gilt ab dem nächsten Backup. Vorhandene Backups werden nicht sofort gelöscht.",
  "Kế hoạch khôi phục (chưa thay đổi server)": "Wiederherstellungsplan (Server unverändert)",
  "Xem trước sẽ tạo gì mà không thay đổi server (dry-run)":
    "Vorschau, was erstellt würde, ohne den Server zu verändern (Dry-Run)",
  "Đang tính kế hoạch khôi phục…": "Wiederherstellungsplan wird berechnet…",
  "Bot cần vài giây để đối chiếu backup với quyền hiện tại của server. Server chưa bị thay đổi.":
    "Der Bot braucht einige Sekunden, um das Backup mit den aktuellen Serverrechten abzugleichen. Am Server wurde noch nichts geändert.",
  "Bot đang đối chiếu backup với server hiện tại…":
    "Der Bot gleicht das Backup mit dem aktuellen Server ab…",
  "Không xem được kế hoạch: {p0}": "Plan konnte nicht angezeigt werden: {p0}",
  "Không tính được kế hoạch: {p0}": "Plan konnte nicht berechnet werden: {p0}",
  "mục cấu hình": "Konfigurationsfelder",
  "Không phát hiện vấn đề gì — bot đủ quyền tạo lại cấu trúc này.":
    "Keine Probleme gefunden — dem Bot fehlen keine Rechte, um diese Struktur neu aufzubauen.",
  "Đây chỉ là kế hoạch — server chưa bị thay đổi. Bấm “Khôi phục vào server này” ở bản backup tương ứng để thực sự tạo lại.":
    "Das ist nur ein Plan — am Server wurde nichts geändert. Klicke beim passenden Backup auf „In diesen Server wiederherstellen“, um es wirklich zu erstellen.",
  "Backup thất bại: {p0}": "Backup fehlgeschlagen: {p0}",
  "Biểu đồ độ trễ (5 giây / mẫu)": "Latenzdiagramm (5 s / Messung)",
  "Bot Discord bảo vệ server, đồng hành cùng trợ lý Haimiya":
    "Discord-Serverschutz-Bot, begleitet von Assistentin Haimiya",
  "Bot vẫn chưa xử lý file backup": "Der Bot hat die Backup-Datei noch nicht verarbeitet",
  "Bot vẫn chưa xử lý xong khôi phục": "Der Bot hat die Wiederherstellung noch nicht abgeschlossen",
  "Bot đang OFFLINE — hãy khởi động bot trên host (Wispbyte…) rồi tải lại file.":
    "Der Bot ist OFFLINE — starte ihn auf dem Host (Wispbyte…) und lade die Datei neu.",
  "Bot đang OFFLINE — không thể backup lúc này":
    "Der Bot ist OFFLINE — Backup gerade nicht möglich",
  "Bot đang OFFLINE — không thể khôi phục lúc này":
    "Der Bot ist OFFLINE — Wiederherstellung gerade nicht möglich",
  "Bot đang phục vụ": "Server mit dem Bot",
  "Bot đang trực tuyến": "Bot ist online",
  "Bot đã khôi phục xong": "Der Bot hat die Wiederherstellung abgeschlossen",
  "Bot đã khôi phục xong backup từ file": "Der Bot hat das Backup aus der Datei wiederhergestellt",
  "Báo cáo chống nuke hàng ngày": "Täglicher Anti-Nuke-Bericht",
  "Bạn chưa quản lý server nào có bot — hãy mời bot vào server trước.":
    "Du verwaltest noch keinen Server mit dem Bot — lade ihn zuerst ein.",
  "Bạn không có quyền quản lý, hoặc bot chưa đồng bộ server này.":
    "Dir fehlt die Verwaltungsberechtigung, oder der Bot hat diesen Server noch nicht synchronisiert.",
  "Bạn đã xác minh thành công. Chào mừng bạn đến với server!":
    "Du hast dich erfolgreich verifiziert. Willkommen auf dem Server!",
  "Bảng hình phạt": "Strafprotokoll",
  "Bảng xếp hạng nhiệt độ": "Heat-Bestenliste",
  "Bảng điều khiển": "Dashboard",
  "Bảo mật": "Sicherheit",
  "Bật Join Gate": "Join Gate einschalten",
  "Bật bảo vệ": "Schutz einschalten",
  "Bật xác minh thành viên": "Mitgliederverifizierung einschalten",
  "Bắt đầu ngay": "Jetzt starten",
  "Bắt đầu nhanh": "Schnellstart",
  "Bỏ ảnh": "Bild entfernen",
  Chào: "Hallo",
  "Chào {user}! Cần tớ giúp gì không?": "Hallo {user}! Kann ich dir helfen?",
  "Chèn:": "Einfügen:",
  "Chìa khóa bảo mật API": "API-Sicherheitsschlüssel",
  "Chưa có ID nào — mọi thành viên mới đều bị kiểm tra.":
    "Noch keine IDs — jedes neue Mitglied wird geprüft.",
  "Chưa có backup nào — bấm “Backup ngay” phía trên để tạo bản đầu tiên.":
    "Noch keine Backups — klicke oben auf „Jetzt sichern“, um das erste zu erstellen.",
  'Chưa có bảng reaction role nào. Bấm "Tạo bảng mới" để bắt đầu 🌸':
    "Noch keine Reaktions-Rollen-Panels. Klicke auf „Neues Panel“, um zu starten 🌸",
  "Chưa có người dùng nào — thêm ID phía trên để miễn trừ.":
    "Noch keine Nutzer — füge oben IDs hinzu, um sie auszunehmen.",
  "Chưa có server nào": "Noch keine Server",
  "Chưa có — bot sẽ": "Noch nichts — der Bot wird",
  "Chưa học được từ khóa nào — bật research và chờ lượt chạy đầu tiên (5 phút sau khi bot online).":
    "Noch keine Schlüsselwörter gelernt — Research aktivieren und den ersten Lauf abwarten (5 Minuten nach Bot-Start).",
  "Chưa thêm bot": "Bot nicht eingeladen",
  "Chưa xác định được tên app": "App-Name unbekannt",
  "Chưa đặt mật khẩu": "Kein Passwort gesetzt",
  Chậm: "Langsam",
  "Chặn tài khoản quá mới": "Zu neue Konten blocken",
  "Chặn đứng kẻ phá hoại": "Vandalen stoppen",
  "Chế độ an toàn (chống chặn nhầm)": "Sicherer Modus (weniger Fehlalarme)",
  Chỉ: "Nur",
  "Chỉ phạt khi có": "Straft nur bei",
  "Chọn emoji": "Emoji wählen",
  "Chọn kênh": "Kanal wählen",
  "Ngôn ngữ cho log": "Protokoll-Sprache",
  "Chỉ đổi nhãn bot tự sinh trong log (kiểu ban, kick, cảnh cáo). Lý do do mod gõ giữ nguyên.":
    "Ändert nur die Bezeichnungen, die der Bot im Protokoll erzeugt (Bann, Kick, Verwarnung). Von Moderatoren eingegebene Gründe bleiben unverändert.",
  "Chọn kênh…": "Kanal wählen…",
  "Chọn loại": "Typ wählen",
  "Chọn role admin…": "Admin-Rolle wählen…",
  "Chọn role miễn trừ…": "Ausgenommene Rolle wählen…",
  "Chọn role mod…": "Mod-Rolle wählen…",
  "Chọn role…": "Rolle wählen…",
  "Chọn server": "Server wählen",
  "Chọn server để cấu hình auto reply, nhiệt độ, Join Gate, chống nuke và các module bảo vệ.":
    "Wähle einen Server, um Auto-Reply, Heat, Join Gate, Anti-Nuke und Schutzmodule zu konfigurieren.",
  "Chọn server…": "Server wählen…",
  "Chống nuke / raid": "Anti-Nuke / Raid",
  "Chống nuke / raid → Thành viên & quyền": "Anti-Nuke / Raid → Mitglieder & Rechte",
  "Chủ bot:": "Bot-Besitzer:",
  "Chủ sở hữu": "Besitzer",
  "Cài đặt server": "Server-Einstellungen",
  "Cài đặt → Mật khẩu tính năng ẩn": "Einstellungen → Passwort für versteckte Funktionen",
  "Cách hoạt động:": "So funktioniert es:",
  "Có lỗi xảy ra khi kết nối với backend. Trang khác vẫn hoạt động bình thường — bạn có thể chuyển sang mục khác ở sidebar.":
    "Fehler bei der Verbindung zum Backend. Andere Seiten funktionieren normal — wechsle einfach zu einem anderen Abschnitt in der Seitenleiste.",
  "Có thay đổi chưa lưu — bấm Lưu để áp dụng.":
    "Es gibt ungespeicherte Änderungen — klicke auf Speichern.",
  "Cơ bản": "Einfach",
  "Cảnh báo khẩn khi raid/nuke": "Dringend-Alarm bei Raid/Nuke",
  "Chống spam báo cáo khẩn": "Spam-Schutz für Dringend-Alarme",
  "Chỉ gửi cảnh báo khẩn khi đã dồn đủ số sự kiện nuke VÀ đủ khoảng cách từ báo cáo trước — sự kiện trong lúc chờ vẫn được giữ, không mất.":
    "Ein Dringend-Alarm wird erst gesendet, wenn sich genug Nuke-Ereignisse angesammelt haben UND genug Zeit seit dem letzten Bericht vergangen ist — Ereignisse in der Wartezeit bleiben erhalten.",
  "Phút tối thiểu giữa 2 báo cáo": "Mindestminuten zwischen zwei Berichten",
  "Sự kiện nuke tối thiểu": "Mindestanzahl Nuke-Ereignisse",
  "Lưu chính sách": "Richtlinie speichern",
  "Đã lưu chính sách báo cáo khẩn": "Richtlinie für Dringend-Berichte gespeichert",
  "Cần cấu hình Client ID": "Client ID muss konfiguriert werden",
  "Cập nhật gần nhất": "Zuletzt aktualisiert",
  "Cập nhật khung giờ ngay bây giờ": "Zeitfenster jetzt aktualisieren",
  "Cập nhật tiếp theo": "Nächstes Update",
  "Cụm từ mới:": "Neue Ausdrücke:",
  "Cửa sổ (giây)": "Zeitfenster (Sekunden)",
  "Cửa sổ (phút)": "Zeitfenster (Minuten)",
  "Cửa sổ Admin": "Admin-Fenster",
  "Cửa sổ tái phạm (phút)": "Wiederholungszeitraum (Minuten)",
  "DM chào mừng": "Willkommens-DM",
  "DM chào mừng bật": "Willkommens-DM an",
  "Danh sách các vụ bot đã chặn khi loạt": "Fälle, die der Bot im Schub blockiert hat",
  "Danh sách trắng": "Whitelist",
  "Danh sách tối đa 100 từ": "Bis zu 100 Wörter",
  "Dán vào API Keys với tên": "Unter API-Schlüssel einfügen als",
  "Dán đường dẫn ảnh hợp lệ (bắt đầu bằng http:// hoặc https://)":
    "Gültige Bild-URL einfügen (beginnend mit http:// oder https://)",
  Dùng: "Verwende",
  "Dọn tin nhắn": "Nachrichtenaufräumung",
  "Emoji tùy chỉnh": "Eigenes Emoji",
  "File quá lớn (tối đa 8 MB) — hãy nén backup hoặc bỏ bớt media nặng rồi thử lại":
    "Datei zu groß (max. 8 MB) — Backup komprimieren oder schwere Medien entfernen und erneut versuchen",
  "GIỜ VIỆT NAM": "VIETNAM-ZEIT",
  "Ghi chú nhanh": "Kurznotiz",
  "Giao diện": "Erscheinungsbild",
  "Gist riêng tư": "Privates Gist",
  "GitHub của chủ bot": "GitHub des Bot-Besitzers",
  "Giá trị": "Wert",
  "Giám sát bot": "Bot-Monitor",
  "Giải thưởng (hiển thị trong embed)": "Preis (im Embed gezeigt)",
  "Giảm nhiệt (điểm/phút)": "Heat-Abbau (Punkte/Minute)",
  "Giới hạn file": "Dateilimit",
  "Gặp gỡ trợ lý ảo": "Triff die Assistentin",
  Gửi: "Senden",
  "Gửi DM": "DM senden",
  "Gửi DM chào mừng sau khi verify": "Willkommens-DM nach Verifizierung senden",
  "Gửi embed": "Embed senden",
  "Gửi panel xác minh vào kênh": "Verifizierungspanel in den Kanal posten",
  "Gửi thành công!": "Erfolgreich gesendet!",
  "Gửi thông báo học tập vào kênh log các server (kết quả lượt học thủ công + digest tuần). MẶC ĐỊNH TẮT — bật khi muốn admin theo dõi bot học được gì ngay trên Discord thay vì mở web.":
    "Postet Lernhinweise in die Log-Kanäle der Server (Ergebnisse manueller Läufe + Wochenübersicht). STANDARDMÄSSIG AUS — aktivieren, um zu verfolgen, was der Bot lernt, direkt in Discord statt im Web.",
  "Gửi ảnh (jpg/png/webp) hoặc video ≤50MB — Haimiya sẽ xem giúp bạn":
    "Sende ein Bild (jpg/png/webp) oder Video ≤50 MB — Haimiya schaut es sich an",
  "Gửi ảnh hoặc video": "Bild oder Video senden",
  "Hai lớp phòng thủ:": "Zwei Verteidigungsebenen:",
  "Haimiya gợi ý": "Haimiya schlägt vor",
  "Haimiya — trợ lý ảo đáng tin cậy": "Haimiya — deine verlässliche Assistentin",
  "Hoạt động chống nuke gần đây": "Neue Anti-Nuke-Aktivität",
  "Hoạt động trong 3 bước": "In 3 Schritten",
  "Hoặc dán đường dẫn ảnh": "Oder Bild-URL einfügen",
  "Hình phạt": "Strafen",
  "Hình phạt khi tăng cấp": "Strafe bei Eskalation",
  "Hình phạt thành viên": "Mitgliederstrafe",
  "Hình thức xử lý": "Maßnahme",
  "Hôm nay chơi gì @protogon?": "Was spielen wir heute, @protogon?",
  "Hôm nay chơi gì?": "Was spielen wir heute?",
  "Hôm nay lúc 00:00": "Heute um 00:00",
  "Hệ thống nhiệt độ vi phạm": "Verstoß-Heat-System",
  "Hỏi Haimiya": "Haimiya fragen",
  "Hỏi thử Haimiya ngay": "Frag jetzt Haimiya",
  Hủy: "Abbrechen",
  "ID người dùng": "Nutzer-ID",
  "ID người dùng không hợp lệ (15–20 chữ số)": "Ungültige Nutzer-ID (15–20 Ziffern)",
  "ID này đã có trong danh sách trắng": "Diese ID ist bereits auf der Whitelist",
  "JOIN GATE — TỰ ĐỘNG CHẶN SELFBOT": "JOIN GATE — SELFBOTS AUTO-BLOCKEN",
  "Join Gate chống selfbot": "Join Gate gegen Selfbots",
  "Join Gate — cổng vào server": "Join Gate — Server-Eingangstor",
  "Khi bật, bot tải tin an ninh công khai (Reddit security, CISA KEV) mỗi giờ, học từ khóa scam mới và dùng MIỄN PHÍ vĩnh viễn trong bộ lọc link độc hại. Từ khóa sai có thể bấm xóa bên dưới. Chi phí: gần như 0 — không cần key thêm.":
    "Aktiv lädt der Bot stündlich öffentliche Sicherheits-Feeds (Reddit Security, CISA KEV), lernt neue Scam-Schlüsselwörter und nutzt sie FÜR IMMER KOSTENLOS im Filter für bösartige Links. Falsche Schlüsselwörter kannst du unten löschen. Kosten: nahezu 0 — kein zusätzlicher Schlüssel nötig.",
  "Khi bật, mỗi khi bot gặp lỗi runtime (unhandled rejection / uncaught exception), lỗi + đoạn code liên quan được gửi cho AI (Mimo V2.5 qua Kira — free 30M tokens/ngày riêng cho việc học) để chẩn đoán nguyên nhân và đề xuất bản vá dạng diff. KẾT QUẢ CHỈ LÀ ĐỀ XUẤT đăng vào kênh log — bot không tự sửa code, không tự restart. Cùng 1 lỗi chỉ chẩn đoán 1 lần/giờ.":
    "Aktiv wird jeder Laufzeitfehler des Bots (unhandled rejection / uncaught exception) an die KI geschickt (Mimo V2.5 über Kira — 30 Mio. Gratis-Tokens/Tag nur fürs Lernen), um die Ursache zu diagnostizieren und einen Diff-Patch vorzuschlagen. DAS ERGEBNIS IST NUR EIN VORSCHLAG im Log-Kanal — der Bot ändert keinen Code und startet nicht neu. Derselbe Fehler wird höchstens 1×/Stunde diagnostiziert.",
  "Khi module dùng hình phạt": "Wenn ein Modul diese Strafe nutzt",
  "Khi đăng nhập, Protogon cần quyền": "Bei der Anmeldung braucht Protogon die Rechte",
  "Khung giờ cập nhật": "Update-Zeitfenster",
  "Khóa kênh khi bị raid": "Kanäle bei Raid sperren",
  "Khóa lại": "Erneut sperren",
  "Khôi phục emoji / sticker": "Emojis/Sticker wiederherstellen",
  "Khôi phục kênh (danh mục, văn bản, thoại…)":
    "Kanäle wiederherstellen (Kategorien, Text, Voice…)",
  "Khôi phục role (tên, màu, quyền, thứ tự)":
    "Rollen wiederherstellen (Name, Farbe, Rechte, Reihenfolge)",
  "Khôi phục thất bại: {p0}": "Wiederherstellung fehlgeschlagen: {p0}",
  "Khôi phục tin nhắn + media": "Nachrichten + Medien wiederherstellen",
  "Khôi phục từ file backup của bot nuke (.msc / .json)":
    "Aus der Backup-Datei eines Nuke-Bots wiederherstellen (.msc / .json)",
  "Khôi phục từ file thất bại: {p0}": "Wiederherstellung aus Datei fehlgeschlagen: {p0}",
  "Không ai đang nóng đầu cả — server đang rất bình yên.":
    "Niemand ist aufgeheizt — dein Server ist ganz ruhig.",
  "Không có quyền truy cập": "Kein Zugriff",
  "Không cấp role": "Keine Rolle vergeben",
  "Không ghi nhận sự cố trong phiên này — hệ thống ổn định ✅":
    "Keine Vorfälle in dieser Sitzung — das System ist stabil ✅",
  "Không gửi tin nhắn": "Keine Nachricht senden",
  "Không kết nối được máy chủ": "Server nicht erreichbar",
  "Không lưu đăng nhập": "Anmeldung nicht merken",
  "Không phát hiện lỗi nào — bot hoạt động bình thường ✅":
    "Keine Fehler gefunden — der Bot läuft normal ✅",
  "Không làm mới được danh sách server (Discord từ chối làm mới im lặng). Bạn vẫn dùng bình thường — chỉ bấm “Tải lại” khi cần.":
    "Serverliste konnte nicht aktualisiert werden (Discord hat die stille Aktualisierung abgelehnt). Alles funktioniert weiterhin — drücke bei Bedarf “Neu laden”.",
  "Không thể truy cập server này": "Dieser Server ist nicht zugänglich",
  "Không thể truy cập server này — bạn không có quyền quản lý.":
    "Dieser Server ist nicht zugänglich — dir fehlt die Verwaltungsberechtigung.",
  "Không thể đọc dữ liệu — bạn không có quyền quản lý server này.":
    "Daten nicht lesbar — dir fehlt die Verwaltungsberechtigung für diesen Server.",
  "Không tìm thấy emoji phù hợp.": "Kein passendes Emoji gefunden.",
  "Không tìm thấy trang này": "Seite nicht gefunden",
  "Không tải được nội dung mục này": "Dieser Abschnitt ließ sich nicht laden",
  "Kick/Ban thành viên": "Mitglieder kicken/bannen",
  "Kênh gửi giveaway": "Giveaway-Kanal",
  "Kênh gửi tin nhắn": "Nachrichtenkanal",
  "Kênh hiển thị embed xác minh. Thành viên mới chỉ thấy kênh này.":
    "Der Kanal mit dem Verifizierungs-Embed. Neue Mitglieder sehen nur diesen Kanal.",
  "Kênh log chung": "Gemeinsamer Log-Kanal",
  "Kênh xác minh": "Verifizierungskanal",
  "Loại kích hoạt": "Auslösertyp",
  "Loại sự kiện nhận log": "Zu loggende Ereignistypen",
  "Lý do": "Grund",
  "Lưu ý: bản ghi sự cố được ghi nhận trong phiên xem này (mất kết nối máy chủ, độ trễ quá cao). Để theo dõi xuyên suốt, hãy giữ trang này mở hoặc kiểm tra kênh log trong Discord.":
    "Hinweis: Vorfallaufzeichnungen gelten nur für diese Sitzung (Server-Verbindungsabbrüche, übermäßige Latenz). Für eine durchgehende Verfolgung lass diese Seite offen oder prüfe den Log-Kanal in Discord.",
  "Lưu đăng nhập": "Anmeldung merken",

  // ── D–G ──
  "Lượt chạy gần nhất:": "Letzter Lauf:",
  "Lượt chẩn đoán gần nhất:": "Letzte Diagnose:",
  "Lần backup trước": "Vorheriges Backup",
  "Lần cuối:": "Zuletzt:",
  "Lần khôi phục trước": "Vorherige Wiederherstellung",
  "Lần thử trước": "Vorheriger Versuch",
  "Lịch sử chống nuke": "Anti-Nuke-Verlauf",
  "Lọc từ ngữ xấu": "Schimpfwortfilter",
  "Lời chúc mừng riêng khi gửi DM người thắng (tùy chọn)":
    "Eigener Glückwunsch in der Gewinner-DM (optional)",
  "Miễn trừ hoàn toàn khỏi mọi module chống nuke.":
    "Vollständig von allen Anti-Nuke-Modulen ausgenommen.",
  "Moderation — thông báo sau khi phạt": "Moderation — Hinweis nach der Strafe",
  "Module đang bảo vệ": "Schutzmodule aktiv",
  Màu: "Farbe",
  "Màu embed": "Embed-Farbe",
  "Máy chủ đang gặp sự cố 🌸": "Der Server hat gerade Probleme 🌸",
  "Mô tả / nội dung chính...": "Beschreibung / Hauptinhalt...",
  "Mẫu tin nhắn giveaway": "Giveaway-Nachrichtenvorlage",
  "Mật khẩu mới": "Neues Passwort",
  "Mật khẩu tính năng ẩn 🔒": "Passwort für versteckte Funktionen 🔒",
  "Mật khẩu tính năng ẩn…": "Passwort für versteckte Funktionen…",
  "MẶC ĐỊNH — tự động": "STANDARD — automatisch",
  "Mọi thành viên": "Alle Mitglieder",
  Mỗi: "Jede",
  "Mỗi backup tạo một": "Jedes Backup erstellt ein",
  "Mời bot": "Bot einladen",
  "Mời bot vào server": "Bot auf den Server einladen",
  "Mời thêm": "Mehr einladen",
  "Mở Discord": "Discord öffnen",
  "Mở Discord server": "Discord-Server öffnen",
  "Mở dashboard": "Dashboard öffnen",
  "Mở khóa": "Entsperren",
  "Mở khóa ngay": "Jetzt entsperren",
  "Mức an toàn của server": "Sicherheitsniveau des Servers",
  "N ngày": "N Tage",
  "NHIỆT ĐỘ VI PHẠM — THÀNH VIÊN “dang_spam”": "VERSTOẞ-HEAT — MITGLIED „dang_spam“",
  "Nguyên tắc ưu tiên": "Prioritätsregeln",
  Nguồn: "Quelle",
  "Người dùng bị xử lý": "Sanktionierte Nutzer",
  "Người dùng đã bị xử lý": "Sanktionierte Nutzer",
  "Người dùng được miễn trừ": "Ausgenommene Nutzer",
  "Người thực hiện": "Moderator",
  "Ngưỡng ban": "Ban-Schwelle",
  "Ngưỡng kick": "Kick-Schwelle",
  "Ngưỡng tạm khóa": "Timeout-Schwelle",
  "Ngưỡng warn": "Verwarnungs-Schwelle",
  "Nhiệt cao nhất:": "Höchste Heat:",
  "Nhiệt · Warn": "Heat · Verwarnungen",
  "Nhận signature từ server khác": "Signaturen von anderen Servern empfangen",
  Nhập: "Eingeben",
  "Nhập Discord Webhook URL": "Discord-Webhook-URL eingeben",
  "Nhập ID người dùng Discord…": "Discord-Nutzer-ID eingeben…",
  "Nhập nội dung trả lời": "Antworttext eingeben",
  "Nhập tên rule": "Regelnamen eingeben",
  "Nhập từ ngữ cần chặn…": "Zu blockierende Wörter eingeben…",
  "Nhập ít nhất một từ khóa": "Mindestens ein Schlüsselwort eingeben",
  "Nhập đúng ID người dùng Discord (15-20 chữ số)":
    "Gültige Discord-Nutzer-ID eingeben (15–20 Ziffern)",
  "Nhật ký sự cố chi tiết": "Detailliertes Vorfallprotokoll",
  "Những ID người dùng này": "Diese Nutzer-IDs",
  Nén: "Komprimiert",
  "Nội dung / mô tả": "Inhalt / Beschreibung",
  "Nội dung embed": "Embed-Inhalt",
  "Nội dung kèm (template)": "Angehängter Inhalt (Vorlage)",
  "Nội dung tin nhắn": "Nachrichteninhalt",
  "Nội dung tin nhắn (tùy chọn — gửi cùng embed)":
    "Nachrichteninhalt (optional — mit dem Embed gesendet)",
  "Nội dung tin nhắn Discord...": "Discord-Nachrichteninhalt...",
  "Nội dung trả lời": "Antworttext",

  // ── P–S ──
  "Phân quyền": "Berechtigungen",
  "Phòng thủ 32 module": "32 Verteidigungsmodule",
  "Phương thức xác minh": "Verifizierungsmethode",
  "Ping @everyone khi cảnh báo khẩn": "@everyone bei Dringend-Alarm pingen",
  "Prefix lệnh": "Befehlspräfix",
  "Prefix · kênh log · phân quyền · bảo mật · giao diện":
    "Präfix · Log-Kanäle · Berechtigungen · Sicherheit · Erscheinungsbild",
  "Preset bảo mật 1 chạm": "Sicherheits-Preset auf einen Klick",
  "Protogon không kết nối được với máy chủ dữ liệu (backend Convex đang trả lỗi). Trang web sẽ hoạt động lại ngay khi máy chủ khỏe — bạn có thể thử tải lại.":
    "Protogon erreicht den Datenserver nicht (das Convex-Backend meldet Fehler). Die Seite funktioniert wieder, sobald der Server gesundet — versuche neu zu laden.",
  "Quyền quản lý server không đủ để mở khóa mục này.":
    "Die Berechtigung „Server verwalten“ reicht nicht, um diesen Bereich zu entsperren.",
  "Quên mật khẩu? Vào Cài đặt để đặt lại (chỉ chủ sở hữu bot).":
    "Passwort vergessen? In den Einstellungen zurücksetzen (nur Bot-Besitzer).",
  "Quản lý bot Discord của bạn từ một nơi": "Verwalte deinen Discord-Bot an einem Ort",
  "Quản lý server": "Server verwalten",
  "Raid Intel — săn nguồn cơn raid 🎯": "Raid Intel — der Raid-Quelle auf der Spur 🎯",
  "Raid bằng ứng dụng ngoài": "Raid über externe App",
  "Role chưa xác minh (Unverified)": "Unverifiziert-Rolle",
  "Role miễn trừ": "Ausgenommene Rolle",
  "Role đã xác minh (Verified)": "Verifiziert-Rolle",
  "Role được miễn trừ": "Ausgenommene Rollen",
  "Sao chép": "Kopieren",
  "Seed bí mật (dòng bất kỳ, ví dụ: chuỗi ngẫu nhiên)":
    "Geheimer Seed (beliebige Zeile, z. B. Zufallszeichenkette)",
  "Self-Diagnose — bot tự dò lỗi": "Selbstdiagnose — der Bot findet eigene Fehler",
  "Server của bạn": "Dein Server",
  "Server hiện tại": "Aktueller Server",
  "Server khác": "Anderer Server",
  "Server quản lý": "Verwaltete Server",
  "Soạn Embed": "Embed verfassen",
  "Săn lùng nguồn cơn raid": "Der Raid-Quelle nachjagen",
  "Sẵn sàng để Haimiya": "Bereit für Haimiya",
  "Số người thắng": "Anzahl der Gewinner",
  "Số server đang dùng bot": "Server mit dem Bot",
  "Sử dụng tài khoản Discord để quản lý các server của bạn":
    "Nutze dein Discord-Konto, um deine Server zu verwalten",
  "Sửa bảng": "Panel bearbeiten",
  "Sự cố": "Vorfälle",
  "Sự cố / lỗi": "Vorfälle / Fehler",
  "Threat Intel — bot tự học": "Threat Intel — der Bot lernt",
  "Threat relay liên server": "Serverübergreifendes Threat-Relay",
  "Thumbnail (ảnh nhỏ, tùy chọn)": "Vorschaubild (kleines Bild, optional)",
  "Thành viên": "Mitglieder",
  "Thành viên sở hữu role này được bỏ qua toàn bộ kiểm tra moderation, anti-raid và anti-nuke của":
    "Mitglieder mit dieser Rolle überspringen alle Moderations-, Anti-Raid- und Anti-Nuke-Prüfungen von",
  Thêm: "Hinzufügen",
  "Thêm cặp emoji/role": "Emoji/Rollen-Paare hinzufügen",
  "Thêm rule": "Regel hinzufügen",
  "Thêm server": "Server hinzufügen",
  "Thống kê nhiệt độ 🔥": "Heat-Statistiken 🔥",
  "Thời gian": "Zeit",
  rule: "Regel",
  "Thời gian khóa (phút)": "Sperrdauer (Minuten)",
  "Thời lượng": "Dauer",
  "Thử lại": "Erneut versuchen",
  "Timeout · kick · ban · warn · purge — ghi kèm":
    "Timeout · Kick · Ban · Warn · Purge — protokolliert mit",
  "Tin nhắn trực tiếp từ Protogon": "Direktnachricht von Protogon",
  "Tiêu đề embed": "Embed-Titel",
  "Trang trước": "Vorherige Seite",
  "Trung bình": "Durchschnitt",
  "Trò chuyện với Haimiya": "Mit Haimiya chatten",
  "Trạng thái bot": "Bot-Status",
  "Trợ lý ảo của Protogon — giải đáp về bot, nhiệt độ, tính năng ẩn":
    "Protogons Assistentin — Antworten zu Bot, Heat und versteckten Funktionen",
  "Tuổi tối thiểu (ngày)": "Mindestalter (Tage)",
  Tên: "Name",
  "Tên Discord…": "Discord-Name…",
  "Tên bảng": "Panelname",
  "Tên field": "Feldname",
  "Tên giveaway": "Giveaway-Name",
  "Tên rule": "Regelname",
  "Tên tác giả": "Autorname",
  "Tìm emoji hoặc chủ đề…": "Emoji oder Thema suchen…",
  "Tìm theo tên thủ phạm": "Nach Täternamen suchen",
  "Tích hợp": "Integrationen",
  "Tính năng ẩn — dành riêng admin sở hữu bot":
    "Versteckte Funktionen — nur für den botbesitzenden Admin",
  "Tính năng ẩn 🔒": "Versteckte Funktionen 🔒",
  "Tùy chỉnh": "Anpassung",
  "Tùy chỉnh Webhook Log": "Log-Webhook anpassen",
  "Tùy chỉnh giao diện bot": "Erscheinungsbild des Bots anpassen",
  "Tùy chỉnh giao diện chỉ dành cho": "Design-Anpassung nur für",
  "Tùy chỉnh khôi phục": "Wiederherstellungsoptionen",
  "Tạm khóa (giây)": "Timeout (Sekunden)",
  "Tạo bot tại Discord Developer Portal": "Bot im Discord Developer Portal erstellen",
  "Tạo bảng mới": "Neues Panel",
  "Tạo giveaway": "Giveaway erstellen",
  "Tạo giveaway mới": "Neues Giveaway erstellen",
  "Tạo lại role, quyền role và kênh của backup này trong server hiện tại":
    "Rollen, Rollenrechte und Kanäle dieses Backups im aktuellen Server neu erstellen",
  "Tạo webhook": "Webhook erstellen",
  "Tải lên & khôi phục": "Hochladen & wiederherstellen",
  "Tải lại": "Neu laden",
  "Tải lại danh sách backup": "Backup-Liste neu laden",
  "Tải lại danh sách server (server mới mời bot sẽ hiện ra)":
    "Serverliste neu laden (neu eingeladene Server erscheinen)",
  "Tải lại trang": "Seite neu laden",
  "Tải nguồn mở mỗi giờ (0 token) · AI ≤ 1 lần/tuần":
    "Stündlich offene Quellen laden (0 Token) · KI ≤ 1×/Woche",
  "Tất cả kênh": "Alle Kanäle",
  "Tất cả module": "Alle Module",
  "Tổng lượt:": "Läufe gesamt:",
  "Tổng thành viên": "Mitglieder gesamt",
  "Từ file": "Aus Datei",
  "Từ khóa (phân cách bằng dấu phẩy)": "Schlüsselwörter (kommagetrennt)",
  "Từ khóa mới lượt trước:": "Neue Schlüsselwörter beim letzten Lauf:",
  "Từ khóa trong tin nhắn": "Schlüsselwörter in Nachrichten",
  "Từ ngày": "Von Datum",
  "Tự ban nghi phạm nguồn cơn": "Quell-Verdächtigen automatisch bannen",
  "Tự ban tài khoản đủ điểm nghi vấn (chủ mưu, trùng avatar…).":
    "Bant Konten mit ausreichend Verdachtspunkten (Haupttäter, gleiche Avatare…) automatisch.",
  "Khôi phục kênh và role sau khi bị nuke": "Kanäle und Rollen nach einem Nuke wiederherstellen",
  "Tự khôi phục theo ảnh chụp gần nhất. Tắt nếu bạn tự dọn và tạo lại kênh — snapshot cũ có thể hồi lại những thứ bạn đã bỏ.":
    "Stellt aus dem neuesten Snapshot wieder her. Ausschalten, wenn du Kanäle selbst aufräumst und neu anlegst — ein alter Snapshot kann Entferntes zurückbringen.",
  "Tự động backup định kỳ": "Automatische geplante Backups",
  "Tự động:": "Automatisch:",
  "URL khi nhấn tên": "URL beim Klick auf den Namen",
  "VD: 1 tháng Nitro Boost 🚀": "z. B. 1 Monat Nitro Boost 🚀",
  "VD: Bấm emoji bên dưới để nhận role tương ứng 🌸":
    "z. B. Reagiere unten mit dem Emoji, um die passende Rolle zu bekommen 🌸",
  "VD: Chào bạn, bạn đã thắng giải thưởng của server chúng mình 🎁":
    "z. B. Hallo! Du hast den Preis unseres Servers gewonnen 🎁",
  "VD: Chào mừng đến với server! Tham gia ngay để có cơ hội nhận…":
    "z. B. Willkommen auf dem Server! Mach jetzt mit für eine Chance auf…",
  "VD: Chọn game của bạn 🎮": "z. B. Wähle dein Spiel 🎮",
  "VD: Nitro 1 tháng": "z. B. Nitro 1 Monat",
  "VD: Xin chúc mừng! Bạn là người may mắn nhất…":
    "z. B. Herzlichen Glückwunsch! Du bist der/die Glückliche…",
  "Vào dashboard": "Dashboard öffnen",
  "Về trang chủ": "Zur Startseite",
  "Vụ đã chặn": "Blockierte Fälle",
  "Warn tích lũy (tăng cấp hình phạt)": "Kumulierte Verwarnungen (Strafeskalation)",
  "Whitelist của server này": "Whitelist dieses Servers",
  "Xem lịch sử": "Verlauf ansehen",
  "Xem trước": "Vorschau",
  "Xem trước DM chào mừng": "Willkommens-DM-Vorschau",
  "Xác minh thành viên (Verify)": "Mitgliederverifizierung (Verify)",
  "Xóa bảng": "Panel löschen",
  "Xóa bộ lọc": "Filter löschen",
  "Xóa cụm từ học sai": "Falsch gelernte Phrase entfernen",
  "Xóa mật khẩu": "Passwort löschen",
  "Xóa tin phát hiện": "Erkannte Nachricht löschen",
  "Xóa toàn bộ nhiệt": "Gesamte Heat löschen",
  "Xóa tìm kiếm": "Suche löschen",
  "Xóa từ khóa học sai": "Falsch gelerntes Schlüsselwort entfernen",
  "Xóa ảnh": "Bild entfernen",
  "Yêu cầu có avatar riêng": "Eigenen Avatar verlangen",
  "Yêu cầu có huy hiệu tài khoản": "Konto-Abzeichen verlangen",
  "Yêu cầu khôi phục đã được xử lý": "Wiederherstellungsanfrage bearbeitet",
  "Yêu cầu role để tham gia (tùy chọn)": "Erforderliche Rolle für den Beitritt (optional)",
  "Yêu cầu đã được xử lý xong": "Anfrage abgeschlossen",
  "admin sở hữu bot": "der botbesitzende Admin",
  "bot gửi sau khi phạt — kể cả": "postet der Bot nach der Strafe — auch bei",
  "bot gửi sau khi đã trừng phạt thành viên vi phạm — đồng bộ cả kênh lẫn mức chi tiết, theo từng hành động ban · timeout · warn · kick (cả tự động lẫn lệnh thủ công).":
    "postet der Bot nach der Bestrafung des Mitglieds — Kanal und Detailgrad sind je Aktion Ban · Timeout · Warn · Kick einstellbar (automatisch und manuell).",
  "chặn link độc hại & file nguy hiểm": "blockt bösartige Links & gefährliche Dateien",
  "chỉ dọn tin": "nur aufräumen",
  "chủ sở hữu bot": "der Bot-Besitzer",
  "chứa file JSON cấu trúc server — bạn không cần tạo repo, không tốn bộ nhớ GitHub. Chỉ cần":
    "speichert die Serverstruktur als JSON — kein Repo nötig, kein GitHub-Speicher. Einfach",
  "cùng trợ lý Haimiya": "mit Assistentin Haimiya",
  "cả backup của Protogon": "auch Protogon-Backups",
  "của họ. Nếu token chưa được cấu hình, phần GitHub bị bỏ qua và bot chỉ lưu trong Convex.":
    "von ihnen. Ohne konfigurierten Token wird der GitHub-Teil übersprungen und der Bot speichert nur in Convex.",
  "của ứng dụng": "der App",
  "duy nhất": "einzigartig",
  "embed moderation kiểu Carl-bot": "Moderations-Embeds im Carl-Bot-Stil",
  "file backup của bot nuke": "Backup-Datei eines Nuke-Bots",
  "giờ Việt Nam": "Vietnam-Zeit",
  "hello, xin chào, chào": "hallo, hi, hey",
  "hoặc ID emoji.": "oder eine Emoji-ID.",
  "https://… (đường dẫn ảnh)": "https://… (Bild-URL)",
  "hỗ trợ bạn quản lý server?": "dir bei der Serververwaltung helfen?",
  "khi khởi động (xác minh token Discord thật) — không cần thao tác gì thêm.":
    "beim Start (verifiziert den echten Discord-Token) — nichts weiter zu tun.",
  "không bị": "nicht",
  "không cho bot đọc": "gibt dem Bot nicht das Leserecht",
  "không cần tự dán token": "kein Token nötig",
  "không ảnh hưởng đến các server khác": "berührt andere Server nicht",
  "kick hoặc ban": "Kick oder Ban",
  kênh: "Kanal",
  "kênh xác minh": "Verifizierungskanal",
  "kẻ chủ mưu": "der Drahtzieher",
  "luôn được vào": "immer hinein dürfen",
  "lấy tên thành viên.": "den Mitgliedsnamen holen.",
  một: "eine",
  "mới 2 ngày": "erst 2 Tage alt",
  "mức an toàn của server": "das Sicherheitsniveau des Servers",
  "ngay lập tức.": "sofort.",
  ngày: "Tage",
  "nhiệt độ 4 giai đoạn": "4-stufiges Heat",
  "như trong file, phục hồi": "wie in der Datei, stellt wieder her",
  "nhận diện định dạng": "Format erkennen",
  "nếu file có lưu.": "falls die Datei sie gespeichert hat.",
  "role + kênh đúng thứ tự": "Rollen + Kanäle in korrekter Reihenfolge",
  "role chưa xác minh": "die Unverifiziert-Rolle",
  "role đã xác minh": "die Verifiziert-Rolle",
  "rồi khôi phục lại từ backup.": "und aus dem Backup wiederherstellen.",
  "sau khi bạn": "nachdem du",
  "server này": "diesen Server",
  "server phụ": "den Backup-Server",
  "thất bại": "fehlgeschlagen",
  "thủ công": "manuell",
  "tin nhắn": "Nachrichten",
  "trong Cài đặt.": "in den Einstellungen.",
  "trong phiên này": "in dieser Sitzung",
  "trước khi server sụp đổ": "bevor der Server zusammenbrach",
  "tăng cấp": "eskaliert",
  "tại server này": "auf diesem Server",
  "tạm khóa": "Timeout",
  "tạm khóa 40": "Timeout 40",
  "tạo lại emoji/sticker": "Emojis/Sticker neu erstellen",
  tắt: "aus",
  "từ khóa": "Schlüsselwörter",
  "tự cấp phát chìa khóa an toàn": "stellt selbst einen Sicherheitsschlüssel aus",
  "tự động": "automatisch",
  "và cấu hình cơ bản (prefix, từ ngữ xấu, role mod/admin, kênh log).":
    "und Grundkonfiguration (Präfix, Schimpfwörter, Mod/Admin-Rollen, Log-Kanäle).",
  "với embed tùy chỉnh đến thành viên đã xác minh.":
    "mit eigenem Embed an verifizierte Mitglieder.",
  "với nút / phản ứng để xác minh.": "mit Schaltfläche/Reaktion zum Verifizieren.",
  "· chọn 1": "· Einfachauswahl",
  "· chọn nhiều, kết hợp được": "· Mehrfachauswahl, kombinierbar",
  "· đã gửi DM cảnh báo ⚠️": "· Warn-DM gesendet ⚠️",
  "Đang chọn:": "Ausgewählt:",
  "Đang chờ bot mở khóa…": "Warte, bis der Bot entsperrt…",
  "Đang chờ bot xử lý file — bot quét mỗi ~20 giây, server lớn có thể mất 1-2 phút. Lỗi (nếu có) sẽ hiện ngay tại đây.":
    "Warte auf die Verarbeitung durch den Bot — er fragt alle ~20 s ab; große Server können 1–2 Minuten dauern. Fehler erscheinen direkt hier.",
  "Đang kiểm tra phiên đăng nhập…": "Sitzung wird geprüft…",
  "Đang kết nối…": "Verbinde…",
  "Đang lọc kết quả": "Ergebnisse werden gefiltert",
  "Đang thu thập dữ liệu… (cần ít nhất 2 mẫu)": "Sammle Daten… (mind. 2 Messungen nötig)",
  "Đang tải lên…": "Wird hochgeladen…",
  "Đang tải lịch sử…": "Verlauf wird geladen…",
  "Đang tải…": "Wird geladen…",
  "Thiếu CONVEX_URL cho production build": "CONVEX_URL fehlt für den Production-Build",
  "Đăng nhập thất bại, vui lòng thử lại.": "Anmeldung fehlgeschlagen. Bitte erneut versuchen.",
  "Đang xác thực với Discord…": "Authentifizierung mit Discord…",
  "Quá nhiều lượt đăng nhập — thử lại sau ít phút":
    "Zu viele Anmeldeversuche — in wenigen Minuten erneut versuchen",
  "Chưa cấu hình redirect_uri cho phép trên deployment":
    "Für dieses Deployment ist keine erlaubte Redirect-URI konfiguriert",
  "Địa chỉ callback không được phép — kiểm tra cấu hình OAuth":
    "Callback-Adresse ist nicht erlaubt — OAuth-Konfiguration prüfen",
  "Mã OAuth hoặc PKCE không hợp lệ": "Ungültiger OAuth-Code oder PKCE-Verifier",
  "Không kết nối được tới Discord — thử lại sau ít phút":
    "Keine Verbindung zu Discord möglich — in wenigen Minuten erneut versuchen",
  "Discord không trả dữ liệu hợp lệ — thử lại":
    "Discord hat ungültige Daten geliefert — erneut versuchen",
  "Trao đổi mã đăng nhập với Discord thất bại":
    "Der Anmeldecode konnte nicht mit Discord ausgetauscht werden",
  "Không ghi được phiên đăng nhập — thử lại":
    "Anmeldesitzung konnte nicht gespeichert werden — erneut versuchen",
  "DISCORD_CLIENT_ID chưa được cấu hình trên deployment":
    "DISCORD_CLIENT_ID ist für dieses Deployment nicht konfiguriert",
  "Đang yêu cầu…": "Anfrage läuft…",
  "Điều hướng": "Navigation",
  "Điều hướng bảng điều khiển": "Dashboard-Navigation",
  'Đã cập nhật rule "{p0}"': "Regel „{p0}“ aktualisiert",
  "Đã hủy giveaway": "Giveaway abgebrochen",
  "Đã khóa kênh": "Kanäle gesperrt",
  "Đã làm mới danh sách server": "Serverliste aktualisiert",
  "Đã lưu cài đặt hệ thống nhiệt độ": "Heat-System-Einstellungen gespeichert",
  "Đã lưu cài đặt khóa kênh": "Kanalsperren-Einstellungen gespeichert",
  "Đã lưu cài đặt warn tích lũy": "Einstellungen für kumulierte Verwarnungen gespeichert",
  "Đã lưu tùy chỉnh khôi phục": "Wiederherstellungsoptionen gespeichert",
  "Đã lưu webhook log": "Log-Webhook gespeichert",
  "Đã lưu — bot áp dụng trong vòng ~3 phút": "Gespeichert — greift innerhalb ~3 Minuten",
  "Đã mở khóa tính năng ẩn 🔓": "Versteckte Funktionen entsperrt 🔓",
  'Đã thêm "{p0}"': "„{p0}“ hinzugefügt",
  "Đã thêm {p0} ID — bấm Lưu để áp dụng": "{p0} IDs hinzugefügt — klicke auf Speichern",
  'Đã tạo rule "{p0}"': "Regel „{p0}“ erstellt",
  'Đã tải "{p0}" lên — bot đang xử lý': "„{p0}“ hochgeladen — der Bot verarbeitet",
  'Đã xóa "{p0}"': "„{p0}“ gelöscht",
  "Đã xóa bảng (tin nhắn cũ trong Discord vẫn còn)":
    "Panel gelöscht (die alte Discord-Nachricht bleibt)",
  "Đã xóa mật khẩu tính năng ẩn": "Passwort für versteckte Funktionen gelöscht",
  "Đã xóa nhiệt của {p0}": "Heat von {p0} gelöscht",
  "Đã xóa toàn bộ nhiệt độ vi phạm": "Gesamte Verstoß-Heat gelöscht",
  "Đã yêu cầu mở khóa — bot thực hiện trong vài giây":
    "Entsperren angefordert — der Bot macht es in Sekunden",
  "Đã áp dụng sắc độ mới": "Neue Graustufe angewendet",
  "Đã đặt mật khẩu": "Passwort gesetzt",
  "Đã đặt mật khẩu tính năng ẩn": "Passwort für versteckte Funktionen gesetzt",
  Đóng: "Schließen",
  "Đóng góp signature (khi bị raid)": "Signaturen beitragen (bei Raid)",
  "Đăng nhập": "Anmelden",
  "Đăng nhập thất bại": "Anmeldung fehlgeschlagen",
  "Đăng nhập vào Protogon": "Bei Protogon anmelden",
  "Đăng xuất": "Abmelden",
  "Đường dẫn bạn mở không tồn tại hoặc đã bị đổi. Kiểm tra lại liên kết, hoặc quay về một trong hai trang dưới đây.":
    "Der Link existiert nicht oder wurde geändert. Prüfe ihn erneut oder kehre zu einer der Seiten unten zurück.",
  "Đến ngày": "Bis Datum",
  "Đồng thời đẩy lên GitHub (Gist riêng tư)": "Zusätzlich zu GitHub schieben (privates Gist)",
  "Độ trễ hiện tại": "Aktuelle Latenz",
  "Độ trễ · tốc độ phản hồi · trạng thái server — không hiển thị tên server":
    "Latenz · Antwortgeschwindigkeit · Serverstatus — Servernamen werden nie gezeigt",
  "Độ tương phản của server": "Server-Kontrast",
  "đang bị khóa kênh": "steht unter Kanalsperre",
  "đang chạy": "läuft",
  "đám mây GitHub": "die GitHub-Cloud",
  "đã tắt": "aus",
  "đăng lại media": "Medien erneut hochladen",
  "đặt trong tab": "im Tab gesetzt",
  "để bot tiếp tục chặn.": "damit der Bot weiter blockt.",
  "để chỉnh cấu hình.": "um ihn zu konfigurieren.",
  "để hiển thị server bạn quản lý. Chúng tôi không lưu mật khẩu hay tin nhắn của bạn.":
    "um deine verwalteten Server anzuzeigen. Wir speichern weder dein Passwort noch deine Nachrichten.",
  "để đặt mật khẩu đầu tiên — người đó sẽ trở thành chủ sở hữu bot.":
    "um das erste Passwort zu setzen — diese Person wird Bot-Besitzer.",
  "đủ bằng chứng độc lập": "ausreichend unabhängige Belege",
  "Ảnh nền embed (tùy chọn)": "Embed-Hintergrundbild (optional)",
  "Ứng dụng ngoài được kết nối": "Externe Apps verbunden",
  "— Chọn kênh —": "— Kanal wählen —",
  "— Chọn role —": "— Rolle wählen —",
  "— Dùng kênh log chung —": "— Gemeinsamen Log-Kanal nutzen —",
  "— Không cấp role —": "— Keine Rolle vergeben —",
  "— Không dùng —": "— Keine —",
  "— Mọi thành viên —": "— Alle Mitglieder —",
  "— mọi server dùng chung, các owner server khác không phải cấu hình gì. Số bản backup giữ lại theo quy tắc Giữ bản bên dưới (mặc định 3 bản mới nhất).":
    "— von allen Servern geteilt; andere Owner konfigurieren nichts. Der Bot behält die 3 neuesten Backups pro Server.",
  "— đóng trình duyệt sẽ phải đăng nhập lại":
    "— beim Schließen des Browsers ist neue Anmeldung nötig",
  "• Bot cần quyền": "• Der Bot braucht die Berechtigung",
  "• Bot gửi": "• Der Bot postet",
  "• Bot gửi embed trong": "• Der Bot postet eine Embed in",
  "• Giờ hiển thị theo": "• Zeiten angezeigt in",
  "• Hỗ trợ: author (tên + avatar + link), title, description, color hex, fields (tên + giá trị + inline), image, thumbnail, footer + icon, timestamp.":
    "• Unterstützt: Autor (Name + Avatar + Link), Titel, Beschreibung, Hex-Farbe, Felder (Name + Wert + inline), Bild, Vorschaubild, Fußzeile + Icon, Zeitstempel.",
  "• Không hiển thị tên server — chỉ hiện số lượng để bảo mật.":
    "• Servernamen werden nie gezeigt — nur Zahlen, aus Datenschutz.",
  "• Mỗi server có độ tương phản riêng trong Cài đặt.":
    "• Jeder Server hat seinen eigenen Kontrast in den Einstellungen.",
  "• Nuke/raid phạt trực tiếp, không cộng nhiệt.": "• Nuke/Raid straft direkt, ohne Heat.",
  "• Sau khi xác minh → gỡ role chưa xác minh, gán":
    "• Nach der Verifizierung → Unverifiziert-Rolle entfernen,",
  "• Thay đổi áp dụng trong ~3 phút.": "• Änderungen greifen in ~3 Minuten.",
  "• Thành viên mới vào server → tự động nhận":
    "• Neue Mitglieder beim Beitritt → erhalten automatisch",
  "• Trang Cửa sổ Admin (chỉ chủ sở hữu bot) chia sẻ khung giờ cập nhật này và theo dõi lỗi chi tiết hơn.":
    "• Die Admin-Fenster-Seite (nur Bot-Besitzer) teilt dieses Update-Zeitfenster und verfolgt Fehler detaillierter.",
  "• Vào Discord → Kênh cần gửi →": "• In Discord → Zielkanal →",
  "• 🔒 Tính năng ẩn — khu vực riêng tư, chỉ chủ sở hữu bot mở khóa bằng mật khẩu.":
    "• 🔒 Versteckte Funktionen — privater Bereich, nur der Bot-Besitzer entsperrt per Passwort.",
  "• 🛠️ Lệnh mod: /mod timeout · kick · ban · purge + !timeout !kick !ban !purge — mọi hình phạt hiện trong mục Hình phạt.":
    "• 🛠️ Mod-Befehle: /mod timeout · kick · ban · purge + !timeout !kick !ban !purge — jede Strafe erscheint unter Strafen.",
  "ℹ️ Ghi chú": "ℹ️ Hinweis",
  "← Về danh sách server": "← Zur Serverliste",
  "← Về trang chủ": "← Zur Startseite",
  "→ bot không gửi embed nhưng dashboard vẫn ghi nhận case. Embed xóa tin / purge luôn đầy đủ.":
    "→ postet der Bot kein Embed, aber das Dashboard erfasst den Fall. Lösch-/Purge-Embeds sind immer vollständig.",
  "⏳ chờ bot gửi": "⏳ warte auf den Bot",
  "⏸️ Tạm khóa (timeout)": "⏸️ Timeout",
  "☁️ Đám mây GitHub": "☁️ GitHub-Cloud",
  "⚠️ Bot không gửi được panel xác minh": "⚠️ Der Bot konnte das Verifizierungspanel nicht posten",
  "⚠️ DM gần nhất thất bại": "⚠️ Die letzte DM ist fehlgeschlagen",
  "⚠️ Lượt học gần nhất thất bại": "⚠️ Der letzte Lernlauf ist fehlgeschlagen",
  "⚠️ lỗi gửi": "⚠️ Sende-Fehler",
  "⚠️ Đang ở chế độ": "⚠️ Aktuell im Modus",
  "⚡ bot tự động": "⚡ automatisch durch den Bot",
  "🌸 Chào mừng bạn!": "🌸 Willkommen!",
  "🎖️ Role tự cấp cho người thắng (tùy chọn)":
    "🎖️ Rolle, die Gewinnern automatisch gegeben wird (optional)",
  "💌 DM người thắng": "💌 Gewinner-DM",
  "💡 Hướng dẫn nhanh:": "💡 Kurzanleitung:",
  "💡 Lệnh nhanh:": "💡 Schnellbefehle:",
  "💡 Đây chính là embed": "💡 Genau dieses Embed",
  "📌 Lưu ý quan trọng": "📌 Wichtiger Hinweis",
  "🔑 Captcha — nhập mã từ DM": "🔑 Captcha — Code aus der DM eingeben",
  "🔒 Khóa kênh khi raid:": "🔒 Kanalsperre bei Raids:",
  "🔒 Mã hóa": "🔒 Verschlüsselt",
  "🔒 Quyền riêng tư": "🔒 Privatsphäre",
  "🔒 Server của bạn": "🔒 Dein Server",
  "🔥 Thành viên có nhiệt độ cao nhất": "🔥 Mitglieder mit höchster Heat",
  "🖐️ Học thủ công": "🖐️ Manuell lernen",
  "🖱️ Button — bấm nút xác minh": "🖱️ Schaltfläche — Klick zum Verifizieren",
  "🛠️ lệnh thủ công của mod": "🛠️ manuelle Mod-Befehle",
  "🛡️ Anti Nuke / Raid — phạt trực tiếp": "🛡️ Anti-Nuke/Raid — direkte Strafe",
  "🛡️ Khi bị nuke/raid phá sập": "🛡️ Wenn ein Nuke/Raid alles zerlegt",
  "🧹 Moderation nội dung — cộng nhiệt + warn": "🧹 Inhalts-Moderation — Heat + Verwarnungen",

  /* ==== i18n-ai-health ==== Đợt 12: panel Sức khỏe AI trong cửa sổ Admin
     (chỉ owner). Chuỗi trạng thái + nhãn số liệu — bản dịch Đức. */
  "Sức khỏe AI": "KI-Zustand",
  "Bot tổng hợp mỗi phút · chỉ chủ bot nhìn thấy":
    "Bot meldet jede Minute · nur für den Bot-Besitzer sichtbar",
  "Hoạt động": "Betriebsbereit",
  "Không khả dụng": "Nicht verfügbar",
  "Bot đang offline hoặc mất kết nối Convex — số liệu AI tạm dừng cập nhật.":
    "Bot ist offline oder vom Convex getrennt — KI-Metriken pausiert.",
  "Provider:": "Anbieter:",
  nghỉ: "Pause",
  "Gọi AI/phút:": "KI-Aufrufe/Min:",
  "Verdict 1 giờ:": "Urteile 1 Std:",
  "từ cache": "aus Cache",
  "Phạt nhầm 7 ngày:": "Fehlstrafen 7 Tage:",
  raid: "Raid",
  "cá biệt": "einzeln",
  "lành tính": "harmlos",
  offline: "offline",
  "Đang nghỉ tạm:": "Derzeit in Abkülhung:",
  "≥5 phạt nhầm đã xác nhận — AI đang tự siết độ tin cậy (bias giảm nhẹ + nhắc thận trọng trong prompt).":
    "≥5 bestätigte Fehlstrafen — die KI verschärft selbst ihr Vertrauen (leichte Bias-Kürzung + Vorsichtshinweis im Prompt).",
  "Đang kiểm tra phiên đăng nhập": "Anmeldung wird geprüft",
  "Mặc định": "Standard",
  "Không thể làm mới danh sách server": "Serverliste konnte nicht aktualisiert werden",
  "Protogon giúp bảo vệ server Discord với auto-reply, hệ thống nhiệt độ 4 giai đoạn, Join Gate chống selfbot, chặn link độc hại và 32 module chống nuke/raid.":
    "Protogon schützt Discord-Server mit Auto-Antworten, einem vierstufigen Heat-System, Join Gate gegen Selfbots, Malware-Link-Blockierung und 32 Anti-Nuke-/Raid-Modulen.",
  "Điều khoản sử dụng bot Protogon và bảng điều khiển web cho cộng đồng Discord.":
    "Nutzungsbedingungen für den Protogon-Bot und das Web-Dashboard für Discord-Communitys.",
  "Chính sách quyền riêng tư và cách Protogon xử lý dữ liệu người dùng.":
    "Datenschutzrichtlinie und die Verarbeitung von Benutzerdaten durch Protogon.",
  "Thông tin lưu trữ, thời hạn và quy trình yêu cầu xoá dữ liệu của Protogon.":
    "Speicherinformationen und das Verfahren zur Anforderung einer Datenlöschung bei Protogon.",
  "Theo dõi trạng thái, độ trễ và số liệu vận hành của bot Protogon theo thời gian thực.":
    "Live-Status, Latenz und Betriebsdaten des Protogon-Bots.",
  "Đăng nhập an toàn bằng Discord để quản lý các server của bạn trên Protogon.":
    "Sicher mit Discord anmelden, um deine Server auf Protogon zu verwalten.",
  "Quản lý cấu hình bảo vệ và tự động hóa cho các server Discord của bạn.":
    "Schutz- und Automatisierungseinstellungen deiner Discord-Server verwalten.",
  "Theo dõi thành viên có nhiệt độ vi phạm cao trong các server bạn quản lý.":
    "Mitglieder mit der höchsten Verstoß-Heat auf deinen Servern verfolgen.",
  "Khu vực quản trị dành riêng cho chủ sở hữu bot Protogon.":
    "Administrationsbereich nur für den Protogon-Bot-Besitzer.",
  "Đang xác thực Discord — Protogon": "Discord-Authentifizierung — Protogon",
  "Đang hoàn tất đăng nhập Discord an toàn với Protogon.":
    "Sichere Discord-Anmeldung bei Protogon wird abgeschlossen.",
  "Không dùng CONVEX_URL localhost trong production build":
    "Keine localhost-CONVEX_URL in einem Production-Build verwenden",
  Xóa: "Entfernen",
  "CONVEX_URL không hợp lệ hoặc không nằm trong allowlist":
    "CONVEX_URL ist ungültig oder nicht auf der Allowlist",
  /* ==== onboarding checklist (W1) ==== */
  "Ch\u1ecdn k\u00eanh nh\u1eadn log s\u1ef1 ki\u1ec7n":
    "Log-Kanal f\u00fcr Ereignisse w\u00e4hlen",
  "M\u1ecdi c\u1ea3nh b\u00e1o nuke/raid, h\u00ecnh ph\u1ea1t v\u00e0 backup \u0111\u1ec1u c\u1ea7n k\u00eanh log \u0111\u1ec3 b\u1ea1n nh\u00ecn th\u1ea5y.":
    "Nuke/Raid-Warnungen, Strafen und Backups brauchen einen Log-Kanal, damit du sie siehst.",
  "B\u1eadt l\u1eddi ch\u00e0o th\u00e0nh vi\u00ean m\u1edbi":
    "Begr\u00fc\u00dfung neuer Mitglieder aktivieren",
  "Bot t\u1ef1 ch\u00e0o ng\u01b0\u1eddi v\u00e0o server \u2014 l\u00e0m server th\u00e2n thi\u1ec7n ngay t\u1eeb gi\u00e2y \u0111\u1ea7u.":
    "Der Bot begr\u00fc\u00dft Neulinge automatisch \u2014 ein freundlicher Server von Sekunde eins.",
  "T\u1ea1o rule auto reply \u0111\u1ea7u ti\u00ean": "Erste Auto-Antwort-Regel erstellen",
  'Th\u1eed kh\u1ed1i "Th\u1eed rule" ngay trong panel \u0111\u1ec3 xem bot s\u1ebd tr\u1ea3 l\u1eddi g\u00ec tr\u01b0\u1edbc khi l\u01b0u.':
    "Nutze das \u201eRegeln testen\u201c-Feld im Panel, um vor dem Speichern zu sehen, was der Bot antwortet.",
  "B\u1eadt Join Gate ch\u1ed1ng acc \u1ea3o": "Join Gate gegen Fake-Accounts aktivieren",
  "L\u1ecdc acc m\u1edbi l\u1eadp b\u1eb1ng tu\u1ed5i t\u00e0i kho\u1ea3n / avatar tr\u01b0\u1edbc khi v\u00e0o \u0111\u01b0\u1ee3c server.":
    "Frisch erstellte Konten nach Kontoalter / Avatar filtern, bevor sie beitreten k\u00f6nnen.",
  "B\u1eadt backup t\u1ef1 \u0111\u1ed9ng \u0111\u1ec3 ch\u1ed1ng nuke":
    "Automatische Backups gegen Nukes aktivieren",
  "Snapshot role/k\u00eanh \u0111\u1ecbnh k\u1ef3 \u2014 b\u1ecb nuke l\u00e0 kh\u00f4i ph\u1ee5c l\u1ea1i trong v\u00e0i ph\u00fat.":
    "Regelm\u00e4\u00dfige Rollen-/Kanal-Snapshots \u2014 nach einem Nuke dauert die Wiederherstellung Minuten.",
  "Thi\u1ebft l\u1eadp server trong 5 b\u01b0\u1edbc": "Server in 5 Schritten einrichten",
  "L\u00e0m xong m\u1ed7i b\u01b0\u1edbc l\u00e0 t\u1ef1 chuy\u1ec3n xanh \u2014 bot s\u1eb5n s\u00e0ng canh server.":
    "Jeder Schritt wird automatisch gr\u00fcn \u2014 dann steht dein Bot Wache.",
  "Ti\u1ebfn \u0111\u1ed9 thi\u1ebft l\u1eadp": "Einrichtungsfortschritt",
  "C\u1ea5u h\u00ecnh": "Einrichten",
  "C\u1ea5u h\u00ecnh m\u1edbi t\u1edbi bot sau kho\u1ea3ng 1 ph\u00fat qua Convex.":
    "Neue Einstellungen erreichen den Bot in etwa einer Minute \u00fcber Convex.",
  /* ==== autoreply try-out (W3) ==== */
  "Th\u1eed rule \u2014 g\u00f5 tin nh\u1eafn m\u1eabu":
    "Regeln testen \u2014 Beispielnachricht eingeben",
  "v\u00ed d\u1ee5: m\u1ecdi ng\u01b0\u1eddi \u01a1i hello!": "z. B. hallo zusammen!",
  "Tin nh\u1eafn c\u00f3 tag bot": "Nachricht erw\u00e4hnt den Bot",
  "K\u00eanh": "Kanal",
  "Bot s\u1ebd kh\u00f4ng tr\u1ea3 l\u1eddi (kh\u00f4ng c\u00f3 n\u1ed9i dung).":
    "Der Bot antwortet nicht (kein Inhalt).",
  'Bot tr\u1ea3 l\u1eddi b\u1eb1ng rule "{p0}":': 'Der Bot antwortet mit Regel "{p0}":',
  "{p0} rule kh\u00e1c c\u0169ng kh\u1edbp \u2014 bot ch\u1ec9 tr\u1ea3 l\u1eddi rule \u0111\u1ea7u ti\u00ean.":
    "{p0} weitere Regel(n) passen ebenfalls \u2014 der Bot antwortet nur mit der ersten.",
  "Kh\u00f4ng rule n\u00e0o kh\u1edbp \u2014 bot im l\u1eb7ng.":
    "Keine Regel passt \u2014 der Bot bleibt stumm.",
  "Gi\u00e3n c\u00e1ch (cooldown) \u00e1p d\u1ee5ng tr\u00ean Discord th\u1eadt n\u00ean kh\u00f4ng t\u00ednh trong b\u1ea3n th\u1eed n\u00e0y.":
    "Abklingzeiten gelten nur auf dem echten Discord und sind in dieser Vorschau nicht simuliert.",
  /* ==== features page (/features) ==== */
  "Bot th\u00f4ng th\u01b0\u1eddng": "Typische Bots",
  "T\u00ednh n\u0103ng \u2014 Protogon: bot Discord t\u1ef1 tr\u1ea3 l\u1eddi & ch\u1ed1ng nuke/raid":
    "Funktionen \u2014 Protogon: Discord-Bot mit Auto-Antworten & Anti-Nuke",
  "To\u00e0n b\u1ed9 t\u00ednh n\u0103ng c\u1ee7a bot Discord Protogon: t\u1ef1 tr\u1ea3 l\u1eddi theo t\u1eeb kho\u00e1, h\u1ec7 th\u1ed1ng nhi\u1ec7t \u0111\u1ed9 4 giai \u0111o\u1ea1n, Join Gate, 32 module ch\u1ed1ng nuke/raid v\u00e0 backup server.":
    "Alle Funktionen des Protogon-Discord-Bots: Auto-Antworten nach Schl\u00fcsselw\u00f6rtern, vierstufiges Heat-System, Join Gate, 32 Anti-Nuke/Raid-Module und Server-Backup.",

  /* ==== ticket: tu dong lam sach, phan cong, /language ==== */
  "Kênh dán panel mở ticket": "Kanal für das Ticket-Panel",
  "Chọn kênh công khai…": "Öffentlichen Kanal wählen…",
  "Đã chọn kênh dán panel — bot sẽ gửi trong ~2 phút":
    "Panel-Kanal gewählt — der Bot postet es in etwa 2 Minuten",
  "Thành viên bấm nút trong kênh này để tự mở ticket — không cần gõ lệnh /ticket. Chọn kênh xong bot tự dán trong ~2 phút.":
    "Mitglieder tippen in diesem Kanal auf eine Schaltfläche, um ein Ticket zu öffnen — kein /ticket-Befehl nötig. Der Bot postet das Panel etwa 2 Minuten nach der Auswahl.",
  "⚠️ Bot không dán được panel mở ticket": "⚠️ Der Bot konnte das Ticket-Panel nicht posten",
  '— hãy sửa lỗi rồi bấm "Gửi lại panel"': '— behebe den Fehler und tippe "Panel erneut senden"',
  "Gửi lại panel mở ticket vào kênh": "Ticket-Panel erneut senden",
  "Đã yêu cầu bot dán panel mở ticket!": "Der Bot soll das Ticket-Panel posten!",
  "Tự động dọn & phân công": "Automatische Aufräumung & Zuweisung",
  "Kênh ticket không ai trả lời sẽ tự đóng. Khi đóng đủ lâu, bot lưu toàn bộ nội dung rồi mới xoá kênh — không bao giờ xoá trước khi lưu.":
    "Ein Ticket-Kanal ohne Antworten schließt sich selbst. Nach ausreichender Zeit speichert der Bot das gesamte Gespräch und löscht den Kanal erst danach — er löscht niemals vor dem Speichern.",
  "Tự đóng sau (giờ không ai chat)": "Automatisch schließen nach (Stunden ohne Antwort)",
  "0 = tắt. Tối đa 720 giờ (30 ngày). Mặc định 24 giờ.":
    "0 = aus. Maximal 720 Stunden (30 Tage). Standard 24 Stunden.",
  "Giữ kênh sau khi đóng (giờ)": "Kanal nach dem Schließen behalten (Stunden)",
  "Sau khoảng này bot lưu transcript rồi xoá kênh. Tối thiểu 1 giờ.":
    "Danach speichert der Bot das Transkript und löscht den Kanal. Mindestens 1 Stunde.",
  "Đã lưu thời gian giữ kênh": "Kanal-Aufbewahrungszeit gespeichert",
  "Nội dung panel trong kênh ticket (tuỳ chọn)": "Panel-Text im Ticket-Kanal (optional)",
  "Chào {user}! Kênh này dành riêng cho bạn — staff sẽ phản hồi sớm.":
    "Hallo {user}! Dieser Kanal ist nur für dich — das Team antwortet bald.",
  "Đã lưu nội dung panel": "Panel-Text gespeichert",
  "Có thể dùng: {user} tên người mở, {number} số ticket, {kind} loại, {idle} giờ tự đóng. Bỏ trống thì dùng mặc định.":
    "Verfügbar: {user} Name des Erstellers, {number} Ticketnummer, {kind} Typ, {idle} Stunden bis Auto-Schließung. Leer lassen für die Standardausgabe.",
  "Tag role khi mở ticket (tối đa 3)": "Rolle beim Öffnen eines Tickets markieren (max. 3)",
  "Role này được nhắc mỗi khi có ticket mới. Để trống nếu không muốn ai bị tag.":
    "Diese Rolle wird bei jedem neuen Ticket erwähnt. Leer lassen, um niemanden zu markieren.",
  "Chưa có role nào trong server.": "Dieser Server hat noch keine Rollen.",
  "Đã lưu role được tag": "Erwähnte Rollen gespeichert",
  "Đã lưu thời gian tự đóng": "Auto-Schließzeit gespeichert",
  "Đã tắt tự đóng": "Auto-Schließung deaktiviert",
  "Đã có người nhận": "Übernommen",
  "Chờ nhận": "Offen",
  "Transcript đã lưu": "Transkript gespeichert",

  /* ==== ticket: tuy chinh panel mo + loi dan + DM ==== */
  "Tuỳ chỉnh panel mở ticket": "Ticket-Panel anpassen",
  "Sửa tiêu đề, màu và nội dung panel thành viên thấy trước khi bấm nút. Bot tự dán lại trong khoảng 2 phút và xoá bản cũ — không cần bấm gì thêm.":
    "Ändere Titel, Farbe und Text, die Mitglieder vor dem Klick sehen. Der Bot postet das Panel nach etwa 2 Minuten neu und löscht das alte — du musst nichts weiter anklicken.",
  "Tiêu đề panel (tuỳ chọn)": "Panel-Titel (optional)",
  "Cần trợ giúp?": "Brauchst du Hilfe?",
  "Đã lưu tiêu đề panel": "Panel-Titel gespeichert",
  "Màu panel": "Panel-Farbe",
  "Chọn màu panel": "Panel-Farbe wählen",
  "Đã về màu mặc định": "Zurück zur Standardfarbe",
  "Nội dung panel mở (tuỳ chọn)": "Text des Panels (optional)",
  "Bấm nút bên dưới, kể lại vấn đề của bạn. {server} đang có {open} ticket chờ.":
    "Klicke unten und erzähl uns, was los ist. {server} hat {open} wartende Tickets.",
  "Đã lưu nội dung panel mở": "Panel-Text gespeichert",
  "Dùng được: {server} tên server, {open} số ticket đang mở, {support} tên nút Hỗ trợ. Bỏ trống thì dùng nội dung mặc định.":
    "Verfügbar: {server} Servername, {open} Anzahl offener Tickets, {support} Beschriftung des Support-Buttons. Leer lassen für den Standardtext.",
  'Hiện nút "Khiếu nại hình phạt"': 'Schaltfläche "Beschwerde einreichen" anzeigen',
  "Tắt nếu server bạn không dùng hình phạt — thành viên chỉ thấy một nút Hỗ trợ.":
    "Ausschalten, wenn dein Server keine Strafen nutzt — Mitglieder sehen dann nur den Support-Button.",
  "Đã hiện nút Khiếu nại": "Beschwerde-Button angezeigt",
  "Đã ẩn nút Khiếu nại": "Beschwerde-Button ausgeblendet",
  "Lời dặn dán ở đầu kênh ticket (tuỳ chọn)": "Hinweis oben im Ticket-Kanal (optional)",
  "Chào {user}! Bạn đang ở ticket #{number} của {server}. Staff phản hồi trong 24 giờ.":
    "Hallo {user}! Du bist in Ticket #{number} von {server}. Das Team antwortet innerhalb von 24 Stunden.",
  "Đã lưu lời dặn đầu kênh": "Kanal-Hinweis gespeichert",
  "Dán TRƯỚC nội dung khiếu nại, cho cả người mở lẫn staff đọc. Dùng được: {user} tên người mở, {number} số ticket, {server} tên server.":
    "Erscheint VOR dem Anfragetext, gelesen von Ersteller und Team. Verfügbar: {user} Name, {number} Ticket-Nummer, {server} Servername.",
  "Gửi DM cho người mở ticket": "Ticket-Ersteller an DM schreiben",
  "DM kèm link thẳng tới kênh ticket vừa tạo. Người đã tắt tin nhắn riêng sẽ không nhận được — ticket vẫn mở bình thường.":
    "Sendet eine DM mit direktem Link zum neuen Ticket-Kanal. Wer DMs deaktiviert hat, bekommt nichts — das Ticket öffnet sich trotzdem.",
  "Sẽ DM khi mở ticket": "DM beim Öffnen senden",
  "Không DM khi mở ticket": "Keine DM beim Öffnen",
  "Đã lưu màu panel": "Panel-Farbe gespeichert",
  "Mã hex 6 chữ số, ví dụ #5865f2. Ô trống = màu mặc định của bot.":
    "Ein 6-stelliger Hex-Code, z. B. #5865f2. Leer lassen für die Standardfarbe des Bots.",
  // ── Transkript ansehen (Tab "Archiviert") — 28/09/2026 ──
  "Đã lưu trữ": "Archiviert",
  "Chưa có ticket nào đã lưu trữ.": "Noch keine archivierten Tickets.",
  "Xem transcript": "Transkript ansehen",
  "Transcript ticket #{p0}": "Transkript von Ticket #{p0}",
  "Đang tải transcript…": "Transkript wird geladen…",
  "Chưa có transcript cho ticket này.": "Für dieses Ticket gibt es noch kein Transkript.",
  "Transcript rỗng — kênh không có tin nhắn nào.":
    "Leeres Transkript — der Kanal enthielt keine Nachrichten.",
  "Tải file JSON": "JSON-Datei laden",
  // ── Số liệu SLA (28/09/2026) ──
  "Số liệu xử lý ticket": "Ticket-Statistik",
  "Chỉ tính ticket đã có người nhận hoặc đã đóng. Phản hồi đầu tính từ lúc mở tới lúc staff bấm “Nhận việc”.":
    "Zählt nur Tickets, die übernommen oder geschlossen wurden. Die erste Reaktion wird vom Eröffnen bis zum Klick auf „Übernehmen“ gemessen.",
  "Ticket trong kỳ": "Tickets im Zeitraum",
  "Chờ phản hồi đầu": "Erste Reaktion",
  "Thời gian xử lý": "Bearbeitungsdauer",
  "Đóng mà không ai nhận": "Ohne Übernahme geschlossen",
  "Khiếu nại được gỡ ban": "Beschwerden entsperrt",
  "{p0} phút": "{p0} Min.",
  "{p0} giờ": "{p0} Std.",
  "{p0}%": "{p0} %",
  "7 ngày": "7 Tage",
  "30 ngày": "30 Tage",
  "90 ngày": "90 Tage",
  "{p0} khiếu nại trong kỳ, {p1} kết thúc bằng gỡ ban.":
    "{p0} Beschwerde(n) im Zeitraum, {p1} endeten mit einer Sperr aufhebung.",
  "{p0} tệp đính kèm": "{p0} Anhänge",

  "Đã bật toàn bộ auto-mod nội dung": "Gesamte Inhalts-Automatik eingeschaltet",
  "Đã tắt toàn bộ auto-mod nội dung": "Gesamte Inhalts-Automatik abgeschaltet",
  "Đang kiểm duyệt nội dung": "Inhaltsmoderation ist aktiv",
  "⚠️ Auto-mod đang tắt toàn bộ — link mời, link độc hại, từ ngữ xấu, file nguy hiểm và spam đều không bị chặn.":
    "⚠️ Die Inhalts-Automatik ist vollständig aus — Einladungslinks, schädliche Links, Beleidigungen, gefährliche Dateien und Spam werden nicht blockiert.",

  "Không đọc được transcript": "Transkript konnte nicht gelesen werden",

  /* ==== Loại ticket tuỳ chỉnh (29/09/2026) ==== Xem i18n.en.ts ==== */
  "Mã loại chỉ gồm chữ thường, số, _ hoặc - (tối đa 32 ký tự).":
    "Der Typ-Code darf nur Kleinbuchstaben, Ziffern, _ oder - enthalten (max. 32 Zeichen).",
  "Cần có tên hiển thị trên nút.": "Eine Beschriftung für den Button ist erforderlich.",
  'Đã cập nhật loại ticket "{p0}"': 'Ticket-Typ "{p0}" aktualisiert',
  'Đã thêm loại ticket "{p0}"': 'Ticket-Typ "{p0}" hinzugefügt',
  'Đã xoá loại ticket "{p0}"': 'Ticket-Typ "{p0}" gelöscht',
  "Loại ticket": "Ticket-Typen",
  "Mỗi loại là 1 nút trên panel, 1 câu hỏi riêng trong modal và có thể có role xử lý riêng. Xoá hết thì bot quay về 2 loại mặc định.":
    "Jeder Typ ist ein Panel-Button, eine eigene Frage im Modal und kann eigene Staff-Rollen haben. Werden alle gelöscht, gelten wieder die zwei Standardtypen.",
  "Thêm loại": "Typ hinzufügen",
  "Chưa có loại tuỳ chỉnh — bot đang dùng 2 loại mặc định: Hỗ trợ chung và Khiếu nại hình phạt.":
    "Noch keine eigenen Typen — der Bot nutzt die zwei Standardtypen: Allgemeiner Support und Strafe anfechten.",
  "{p0} role riêng": "{p0} eigene Rollen",
  "Đổi danh sách xong bấm “Gửi lại panel mở ticket” để thay nút trên kênh công khai. Tối đa 10 loại.":
    'Nach der Änderung der Liste auf "Ticket-Panel erneut senden" klicken, um die Buttons im öffentlichen Kanal zu ersetzen. Max. 10 Typen.',
  'Chỉnh sửa loại "{p0}"': 'Typ "{p0}" bearbeiten',
  "Thêm loại ticket": "Ticket-Typ hinzufügen",
  "Mã loại (tiếng Anh, không dấu)": "Typ-Code (Kleinbuchstaben, ohne Umlaute)",
  "Mã nằm trong nút nên không đổi sau khi tạo. Ticket đã mở vẫn tra được loại này.":
    "Der Code steckt im Button und kann nach dem Anlegen nicht mehr geändert werden. Bereits offene Tickets finden diesen Typ weiterhin.",
  "Tên trên nút": "Button-Beschriftung",
  "Hoá đơn & thanh toán": "Rechnung & Zahlung",
  "Emoji (tuỳ chọn)": "Emoji (optional)",
  "Mô tả ngắn (tuỳ chọn)": "Kurzbeschreibung (optional)",
  "Câu hỏi trong modal": "Frage im Modal",
  "Bạn cần hỏi gì về hoá đơn?": "Was möchtest du zur Rechnung wissen?",
  "Bỏ trống thì dùng câu hỏi mặc định. Tối đa 45 ký tự.":
    "Leer lassen, um die Standardfrage zu verwenden. Max. 45 Zeichen.",
  "Gợi ý trong ô nhập (tuỳ chọn)": "Platzhalter im Eingabefeld (optional)",
  "Câu hỏi ô bằng chứng (tuỳ chọn)": "Frage zum Beweisfeld (optional)",
  "Role xử lý riêng cho loại này": "Staff-Rollen für diesen Typ",
  "Bỏ trống thì dùng role xử lý ticket chung đã cấu hình ở trên.":
    "Leer lassen, um die oben konfigurierte allgemeine Ticket-Staff-Rolle zu verwenden.",
  "Bật loại ticket này": "Diesen Ticket-Typ aktivieren",
  "Đưa lên trên": "Nach oben",
  "Đưa xuống dưới": "Nach unten",
  "Sửa loại ticket này": "Diesen Ticket-Typ bearbeiten",
  "Xoá loại ticket này": "Diesen Ticket-Typ löschen",
  "Ô nhập bổ sung (tối đa 3)": "Zusätzliche Eingabefelder (max. 3)",
  "Thêm ô": "Feld hinzufügen",
  "Mỗi ô là 1 câu hỏi thêm trong modal mở ticket. 2 ô nội dung và bằng chứng đã có sẵn nên chỉ thêm được 3 ô nữa.":
    "Jedes Feld ist eine zusätzliche Frage im Ticket-Modal. Nachricht und Beweis gibt es bereits, daher passen nur 3 weitere.",
  "Chưa thêm ô nào.": "Noch keine zusätzlichen Felder.",
  "Tiêu đề ô": "Feldbezeichnung",
  "Mã ô (tiếng Anh, không dấu)": "Feld-Code (Kleinbuchstaben, ohne Umlaute)",
  "Bắt buộc nhập": "Pflichtfeld",
  "Ô nhiều dòng": "Mehrzeiliges Feld",
  "Xoá ô này": "Dieses Feld entfernen",
  "Mẫu kênh ticket": "Vorlage für Ticket-Kanäle",
  "Mỗi kênh ticket mở ra sẽ theo mẫu này. Bỏ trống mọi ô thì bot dùng cách cũ: tên ticket-<số>, chỉ staff và người mở nhìn thấy.":
    "Jeder Ticket-Kanal folgt dieser Vorlage. Alles leer lassen behält das alte Verhalten: Name ticket-<Nummer>, sichtbar nur für Staff und Ersteller.",
  "Mẫu tên kênh": "Namensvorlage für Kanäle",
  "Dùng được:": "Verfügbar:",
  "số ticket,": "Ticket-Nummer,",
  "tên người mở,": "Name des Erstellers,",
  "loại. Tự động bỏ dấu và ký tự lạ.":
    "Typ. Umlaute und Sonderzeichen werden automatisch entfernt.",
  "Slowmode trong kênh ticket (giây)": "Slowmode in Ticket-Kanälen (Sekunden)",
  "0 = không có. Tối đa 21600 giây (6 giờ).": "0 = aus. Maximal 21600 Sekunden (6 Stunden).",
  "Ngân sách tin nhắn mỗi kênh": "Nachrichtenbudget pro Kanal",
  "Vượt thì bot tự đóng kênh (nội dung đã lưu trước). 0 = không giới hạn. Dùng để chặn 1 người spam rồi bỏ mặc.":
    "Bei Überschreitung schließt der Bot den Kanal (das Transkript wird zuvor gespeichert). 0 = unbegrenzt. Verhindert, dass jemand einen Kanal zumüllt und verschwindet.",
  "Cho @everyone nhìn thấy kênh ticket": "@everyone soll Ticket-Kanäle sehen können",
  "Tắt (mặc định) là chỉ staff và người mở thấy — khiếu nại mà ai đọc được thì người dùng không dám kêu. Bật nếu server muốn ticket công khai kiểu diễn đàn.":
    "Aus (Standard) heißt: nur Staff und Ersteller sehen den Kanal — eine Beschwerde, die jeder lesen kann, meldet niemand. Einschalten für ein öffentliches Forum.",
  "Tạo danh mục con riêng cho từng loại ticket": "Eigene Kategorie pro Ticket-Typ anlegen",
  "Kênh ticket sẽ nằm trong danh mục con theo loại, thay vì dồn thẳng vào danh mục đã chọn.":
    "Ticket-Kanäle liegen in einer Unterkategorie je Typ, statt alles in die gewählte Kategorie zu werfen.",
  "Đã lưu mẫu tên kênh": "Namensvorlage gespeichert",
  "Đã lưu slowmode": "Slowmode gespeichert",
  "Đã lưu ngân sách tin nhắn": "Nachrichtenbudget gespeichert",
  "Đã lưu quyền xem kênh ticket": "Sichtbarkeit der Ticket-Kanäle gespeichert",
  "Đã lưu cách chia danh mục": "Kategorie-Layout gespeichert",

  // ── Seitennavigator + Seiten Unterstützung / Premium ──
  Menu: "Menü",
  "Trang chủ": "Startseite",
  "Thống kê": "Statistiken",
  "Khám phá": "Entdecken",
  "Tài khoản": "Konto",
  "Ủng hộ": "Unterstützen",
  "Ủng hộ nhà phát triển": "Entwickler unterstützen",
  "Gói Premium": "Premium-Tarife",
  Mới: "Neu",
  "Giữ cho Protogon mở cửa miễn phí": "Halt Protogon kostenlos und offen",
  "Protogon do nhóm RFTV tự bỏ chi phí máy chủ và thời gian duy trì. Gói Miễn phí vẫn dùng được cho mọi server — quyền góp ở đây KHÔNG nằm trong luồng mua gói Premium, mà để bot có thêm tháng độ ổn định.":
    "Das RFTV-Team trägt Serverkosten und Wartungszeit von Protogon. Der kostenlose Tarif bleibt für jeden Server nutzbar — Spenden hier sind NICHT Teil des Premium-Kaufs; sie kaufen dem Bot mehr Laufzeit.",
  "Ủng hộ qua Discord": "Über Discord unterstützen",
  "Xem gói Premium": "Premium-Tarife ansehen",

  // ── Seite Feedback (/feedback) ──
  "Góp ý": "Feedback",
  "Phản hồi của bạn": "Dein Feedback",
  "Góp ý cho Protogon": "Feedback zu Protogon senden",
  "Bạn gặp lỗi, thiếu tính năng, hay chỉ muốn góp ý? Gửi ở đây — góp ý đi thẳng tới người làm bot, không cần tài khoản Discord và không ai khác đọc được.":
    "Fehler gefunden, Funktion vermisst oder einfach etwas loswerden? Schreib es hier — das Feedback geht direkt an den Entwickler, braucht kein Discord-Konto und niemand sonst liest mit.",
  "Loại góp ý": "Art des Feedbacks",
  "Báo lỗi": "Fehler melden",
  "Bot hoặc web làm sai điều gì đó": "Der Bot oder die Website hat etwas falsch gemacht",
  "Đề xuất tính năng": "Funktion vorschlagen",
  "Bạn muốn bot làm được thêm gì": "Etwas, das der Bot können sollte",
  "Góp ý chung": "Allgemeines Feedback",
  "Cảm nhận, câu hỏi, hoặc lời cảm ơn": "Eindrücke, Fragen oder ein Dankeschön",
  "Mô tả càng rõ càng tốt: bạn đang làm gì, thấy gì, và mong đợi điều gì.":
    "Je genauer, desto besser: was du gemacht hast, was du gesehen hast und was du erwartet hättest.",
  "Cần ít nhất {p0} ký tự.": "Mindestens {p0} Zeichen nötig.",
  "{p0}/{p1} ký tự": "{p0}/{p1} Zeichen",
  "Email (không bắt buộc)": "E-Mail (optional)",
  "Điền nếu bạn muốn mình phản hồi lại — bỏ trống vẫn gửi được.":
    "Nur ausfüllen, wenn du eine Antwort möchtest — leer lassen ist in Ordnung.",
  "Gửi góp ý": "Feedback senden",
  "Đang gửi…": "Wird gesendet…",
  "Không gửi được góp ý — thử lại sau ít phút nhé.":
    "Feedback konnte nicht gesendet werden — bitte in ein paar Minuten erneut versuchen.",
  "Hệ thống vừa nhận quá nhiều góp ý — bạn thử lại sau ít phút nhé, hoặc nhắn trực tiếp trong Discord.":
    "Das System hat gerade sehr viel Feedback erhalten — bitte in ein paar Minuten erneut versuchen oder direkt auf Discord schreiben.",
  "Email chưa đúng dạng — bỏ trống cũng được nếu bạn không cần phản hồi.":
    "Diese E-Mail sieht nicht korrekt aus — leer lassen, wenn du keine Antwort brauchst.",
  "Không cần đăng nhập. Mình không chia sẻ góp ý của bạn cho ai khác.":
    "Keine Anmeldung nötig. Dein Feedback wird nicht an Dritte weitergegeben.",
  "Đã nhận góp ý của bạn": "Dein Feedback ist angekommen",
  "Cảm ơn bạn! Mình đọc hết góp ý và sẽ trả lời qua email nếu bạn có để lại địa chỉ.":
    "Danke! Ich lese jede Nachricht und antworte per E-Mail, wenn du eine Adresse hinterlassen hast.",
  "Gửi thêm góp ý": "Weiteres Feedback senden",
  "Vào Discord để trao đổi trực tiếp": "Auf Discord direkt austauschen",
  "Muốn trao đổi trực tiếp?": "Lieber direkt sprechen?",
  "Nếu bạn cần trả lời gấp hoặc muốn cả cộng đồng cùng bàn, vào Discord — kênh hỗ trợ có người theo dõi.":
    "Wenn es schnell gehen soll oder die Community mitreden soll: komm auf Discord — der Support-Kanal wird betreut.",
  "Vào Discord": "Discord beitreten",
  "Ủng hộ trực tiếp bằng mã QR": "Direkt per QR-Code unterstützen",
  "Không cần đăng nhập, không qua cổng thanh toán: mở app ngân hàng hoặc ví điện tử của bạn, quét mã rồi chuyển số tiền bạn muốn. Tiền vào thẳng ví nhà phát triển.":
    "Keine Anmeldung, kein Zahlungsanbieter dazwischen: öffne deine Banking- oder Wallet-App, scanne den Code und sende den Betrag, den du möchtest. Das Geld landet direkt im Wallet des Entwicklers.",
  "Quét được bằng ZaloPay, MoMo, VietQR và app ngân hàng bất kỳ":
    "Funktioniert mit ZaloPay, MoMo, VietQR und jeder Banking-App",
  "Chủ ví: NGUYEN DUY KHIEM — kiểm tra đúng tên trước khi chuyển":
    "Kontoinhaber: NGUYEN DUY KHIEM — prüfe den Namen, bevor du sendest",
  "Ủng hộ qua QR là quà tặng cá nhân, không tự mở khoá Premium. Cần xác nhận thì nhắn trong Discord.":
    "Eine QR-Spende ist ein persönliches Geschenk und schaltet Premium nicht automatisch frei. Schreib uns auf Discord, wenn du eine Bestätigung brauchst.",
  "Mã QR nhận ủng hộ của NGUYEN DUY KHIEM": "Spenden-QR-Code von NGUYEN DUY KHIEM",
  "Quét mã bằng app chuyển tiền bất kỳ": "Scanne den Code mit einer beliebigen Überweisungs-App",
  "Chọn mức tùy khả năng": "Wähle, was dir entspricht",
  "Đây chỉ là gợi ý. Mọi mức đều được chào đón, kể cả một lời cảm ơn.":
    "Das sind nur Vorschläge. Jeder Betrag ist willkommen, auch ein einfaches Danke.",
  "Quyền góp giúp được gì": "Was deine Unterstützung bewirkt",
  "Nói thẳng: quyền góp KHÔNG tạo ra tính năng độc quyền và không xoá được quảng cáo. Nó giữ cho bot có máy chủ và có người trực sửa lỗi.":
    "Ganz direkt: Unterstützung schaltet keine Exklusivfunktionen frei und entfernt keine Werbung. Sie hält den Server am Laufen und jemanden da, der Fehler behebt.",
  "Giúp theo cách khác": "Andere Wege zu helfen",
  "Tham gia cộng đồng Discord": "Discord-Community beitreten",
  "Báo lỗi, xin tính năng, hoặc chỉ để chào":
    "Fehler melden, Features wünschen oder einfach hallo sagen",
  "Theo dõi trên Facebook": "Auf Facebook folgen",
  "Cập nhật khi có phiên bản mới": "Updates bei neuen Versionen",
  "Trả phí để bot có thêm sức làm việc": "Bezahlen, damit der Bot mehr Luft bekommt",
  "Gói Miễn phí luôn ở đó và không bao giờ bị cắt bớt. Premium chỉ mở thêm tiện ích cho server cần nhiều hơn — và là cách duy nhất để duy trì bot trong dài hạn.":
    "Der kostenlose Tarif bleibt und wird nie beschnitten. Premium ergänzt nur Extras für Server mit mehr Bedarf — und ist der einzige Weg, den Bot dauerhaft zu betreiben.",
  "Được nhiều người chọn": "Am beliebtesten",
  "Đăng ký qua Discord": "Über Discord anmelden",
  // ── Konfigurations-Score (Übersicht, Runde #4) ──
  "Điểm cấu hình": "Konfigurations-Score",
  "Đã bật đủ các lớp bảo vệ chính.": "Alle wichtigen Schutzebenen sind aktiv.",
  "lớp bảo vệ chưa bật": "Schutzebenen noch nicht aktiv",
  "Xem chi tiết": "Details ansehen",
  "Thu gọn": "Einklappen",
  "Mở panel": "Panel öffnen",
  Tốt: "Gut",
  "Cần xem lại": "Prüfen",
  "Chưa bật chống nuke": "Anti-Nuke ist aus",
  "Không có lớp phòng thủ đầu tiên khi bị raid: bot sẽ không chặn mass ban, mass role hay xoá kênh hàng loạt.":
    "Keine erste Verteidigungslinie bei einem Raid: der Bot stoppt weder Massen-Banns noch Massen-Rollenwechsel oder Kanallöschungen.",
  "Chưa chọn kênh nhận log": "Kein Log-Kanal gewählt",
  "Mọi cảnh báo nuke, hình phạt và kết quả backup đều cần kênh log — không có kênh log thì bot xử lý xong mà bạn không thấy gì.":
    "Jede Nuke-Warnung, Strafe und jedes Backup-Ergebnis braucht einen Log-Kanal — sonst arbeitet der Bot, ohne dass du etwas siehst.",
  "Chưa bật backup tự động": "Automatisches Backup ist aus",
  "Bị nuke hoặc xoá nhầm mà không có bản backup gần nhất thì khôi phục gần như không thể.":
    "Nach einem Nuke oder einem Versehen ist ohne aktuelles Backup fast nichts wiederherstellbar.",
  "Chưa bật auto-mod nội dung": "Inhalts-Auto-Mod ist aus",
  "Link độc, spam và từ cấm sẽ tới tận người dùng trước khi mod kịp xử lý.":
    "Schädliche Links, Spam und verbotene Wörter erreichen Mitglieder, bevor ein Moderator reagieren kann.",
  "Chưa bật Join Gate": "Join Gate ist aus",
  "Tài khoản ảo mới lập lọt vào được server, làm loãng thành viên thật và tốn công xử lý.":
    "Frische Alts kommen direkt hinein, verschmutzen echte Mitglieder und kosten Moderationszeit.",
  "Chưa bật xác minh thành viên": "Mitglieder-Verifizierung ist aus",
  "Acc ảo vào là có role ngay, không cần đợi con người duyệt.":
    "Alts bekommen sofort Rollen, ohne dass jemand sie freigeben muss.",
  // ── Seite Vorfälle: Zeitachse + Periodenvergleich (Runde #4) ──
  "Chi tiết": "Details",
  "Hành động": "Aktion",
  "Khoảng thời gian": "Dauer",
  phút: "Min.",
  "Thủ phạm": "Verursacher",
  "Không rõ (sự kiện tự động)": "Unbekannt (automatisiertes Ereignis)",
  "Đối tượng bị tác động": "Betroffene Ziele",
  "sự cố": "Vorfälle",
  "Hôm nay": "Heute",
  "Lượt bị chặn": "Blockierte Aktionen",
  "Sự kiện": "Ereignisse",
  "không đổi": "unverändert",
  "so với kỳ trước": "ggü. Vorperiode",
  "ngày gần nhất so với": "Tage gegenüber den vorherigen",
  "ngày trước": "Tagen",
  "Ước lượng trên dữ liệu bot còn lưu (tối đa 500 sự kiện mỗi nguồn)":
    "Geschätzt aus den noch gespeicherten Daten (max. 500 Ereignisse je Quelle)",
  // ── Statistik: 24-Stunden-Rhythmus + 7 Tage (Runde #4) ──
  "Người vào theo giờ hôm nay": "Beitritte nach Stunde heute",
  "Giờ Việt Nam — bật chống nuke sớm ở khung giờ đông nhất":
    "Vietnamesische Zeit — Anti-Nuke vor den stärksten Stunden aktivieren",
  "Người vào 7 ngày gần nhất": "Beitritte der letzten 7 Tage",
  // ── Admin: Auftragswarteschlange (Runde #4) ──
  "Hàng đợi việc": "Auftragswarteschlange",
  "Việc bot được giao · chỉ chủ bot nhìn thấy":
    "Dem Bot zugewiesene Aufträge · nur für den Bot-Eigentümer",
  "server kẹt": "festhängende Server",
  "Đang chờ": "Wartend",
  Sạch: "Leer",
  Backup: "Backup",
  "Báo cáo": "Bericht",
  "Panel xác minh": "Bestätigungs-Panel",
  "Panel ticket": "Ticket-Panel",
  DM: "DM",
  "Server đang kẹt việc (lâu nhất trước)":
    "Server mit festhängenden Aufträgen (längste Wartezeit zuerst)",
  việc: "Aufträge",
  "Không có việc nào bị kẹt.": "Keine festhängenden Aufträge.",
  "Chỉ tính việc chờ quá 15 phút — tick bot chạy mỗi 3 phút, quá ngưỡng là đứt mắt xích.":
    "Zählt nur Aufträge mit mehr als 15 Minuten Wartezeit — der Bot tickt alle 3 Minuten, darüber ist die Kette gerissen.",
  // ── Tra cứu backup / mã khôi phục (đường cứu hộ khi mất quyền server gốc) ──
  "Tra cứu & cứu hộ backup": "Backup-Suche & Rettung",
  "Xem mã khôi phục của các bản backup bạn đang quản lý":
    "Wiederherstellungsschlüssel der verwalteten Backups ansehen",
  "Mã khôi phục của tôi": "Meine Wiederherstellungsschlüssel",
  "Ẩn mã của tôi": "Schlüssel ausblenden",
  "Mã khôi phục": "Wiederherstellungsschlüssel",
  "Tra cứu": "Suchen",
  tin: "Nachr.",
  "(bản cũ — chưa có mã)": "(älteres Backup — noch kein Schlüssel)",
  "Chưa có bản backup nào — bấm “Backup ngay” để có mã khôi phục.":
    "Noch keine Backups — „Jetzt sichern“ anklicken, um einen Schlüssel zu erhalten.",
  "Hãy lưu mã lại (kèm ảnh chụp hoặc ghi chú) — mất server là mất luôn đường xem lại mã này.":
    "Schlüssel gut aufbewahren (Screenshot oder Notiz) — ohne Server gibt es keinen Weg, ihn nochmals zu sehen.",
  "Đã mất quyền với server gốc (bị nuke mất role, bị kick, hoặc đã xoá server)? Dán mã khôi phục của bản backup vào đây để dựng lại cấu trúc server đó vào server hiện tại.":
    "Zugriff auf den Ursprungsserver verloren (Rollen durch Nuke entfernt, rausgeworfen oder Server gelöscht)? Hier den Wiederherstellungsschlüssel eines Backups einfügen, um dessen Struktur im aktuellen Server neu aufzubauen.",
  "Không tìm thấy bản backup nào với mã này — kiểm tra lại mã, hoặc dùng bản backup mới nhất.":
    "Kein Backup passt zu diesem Schlüssel — bitte prüfen oder das neueste Backup verwenden.",
  /* ==== Thanh toán ZaloPay (06/10/2026) ==== Xem i18n.en.ts. */
  "Đang mở ZaloPay…": "ZaloPay wird geöffnet…",
  "Ủng hộ {so}": "{so} spenden",
  "Ủng hộ số tiền này": "Diesen Betrag spenden",
  "Số tiền khác (VND)": "Anderer Betrag (VND)",
  "Không tạo được đơn thanh toán — thử lại sau ít phút.":
    "Zahlungsauftrag konnte nicht erstellt werden – bitte in wenigen Minuten erneut versuchen.",
  "Số tiền phải từ 10.000đ đến 100.000.000đ.":
    "Der Betrag muss zwischen 10.000 ₫ und 100.000.000 ₫ liegen.",
  "Thanh toán một lần qua ZaloPay — không lưu thông tin thẻ, không tự động trừ tiền.":
    "Einmalige Zahlung über ZaloPay – keine Kartendaten gespeichert, keine automatischen Abbuchungen.",
  "Miễn phí vĩnh viễn": "Kostenlos auf unbegrenzte Zeit",
  "Bạn đang có gói cao hơn": "Du hast bereits einen höheren Tarif",
  "Gia hạn thêm 30 ngày": "Um 30 Tage verlängern",
  "Gói {goi} đang hoạt động — dùng tới {ngay}": "Tarif {goi} aktiv bis {ngay}",
  "Gói {goi} đã hết hạn {ngay}": "Tarif {goi} am {ngay} abgelaufen",
  "Một lần thanh toán cho 30 ngày Premium — không tự động trừ tiền, hết hạn thì mua lại nếu muốn.":
    "Eine Zahlung deckt 30 Tage Premium – keine automatischen Abbuchungen; bei Bedarf nach Ablauf erneut kaufen.",
  "Cần giúp trước khi mua?": "Brauchst du Hilfe vor dem Kauf?",
  "Nhắn một câu trong Discord — mình trả lời trong 24 giờ, kể cả khi bạn chỉ muốn hỏi Premium làm gì.":
    "Schreib kurz auf Discord – ich antworte innerhalb von 24 Stunden, auch wenn du nur fragen willst, was Premium bringt.",
  "Đang xác nhận thanh toán…": "Zahlung wird bestätigt…",
  "Mã đơn": "Bestellnummer",
  "Thanh toán thành công — cảm ơn bạn!": "Zahlung erfolgreich – danke!",
  "Đã thanh toán {so}đ qua ZaloPay — gói {goi} đã kích hoạt.":
    "{so} ₫ über ZaloPay bezahlt – der Tarif {goi} ist jetzt aktiv.",
  "Đã thanh toán {so}đ qua ZaloPay. Cảm ơn bạn đã giữ Protogon mở cửa miễn phí.":
    "{so} ₫ über ZaloPay bezahlt. Danke, dass Protogon kostenlos bleibt.",
  "Hoàn tất": "Fertig",
  "Chưa nhận được xác nhận": "Noch keine Bestätigung",
  "ZaloPay chưa báo giao dịch thành công. Nếu bạn ĐÃ thanh toán, quay lại trang này sau vài phút — tiền không bị mất.":
    "ZaloPay hat die Transaktion noch nicht bestätigt. Wenn du bereits bezahlt hast, kehre in wenigen Minuten zurück – dein Geld ist sicher.",
  "Thanh toán thất bại": "Zahlung fehlgeschlagen",
  "Giao dịch bị huỷ hoặc không thành công — chưa có khoản tiền nào bị trừ.":
    "Die Transaktion wurde abgebrochen oder ist fehlgeschlagen – es wurde nichts abgebucht.",
  "Đăng nhập lại để kiểm tra đơn": "Erneut anmelden, um diese Bestellung zu prüfen",
  "Phiên đăng nhập cần thiết để xem trạng thái đơn thanh toán này.":
    "Für den Status dieser Zahlung musst du angemeldet sein.",
  /* ==== Seitenauswahl im HEADER + Team-Admins (07.10.2026) ==== */
  "Về trang chủ Protogon": "Zurück zur Protogon-Startseite",
  Trang: "Seiten",
  "Bảng chọn trang": "Seitenmenü",
  "Chuyển trang": "Seite wechseln",
  "Mở bảng chọn trang": "Seitenmenü öffnen",
  // Nút chọn giao diện sáng/tối trong bảng chọn trang.
  Sáng: "Hell",
  Tối: "Dunkel",
  "Đóng bảng chọn trang": "Seitenmenü schließen",
  "Bot đang chạy": "Bot läuft",
  "Bot mất kết nối": "Bot ist offline",
  "Quản trị viên nhóm": "Team-Admins",
  "Chủ sở hữu bot & quản trị viên nhóm · theo dõi lỗi & dữ liệu bot":
    "Bot-Inhaber & Team-Admins · überwacht Bot-Fehler & Daten",
  "Cửa sổ Admin là khu vực riêng tư của chủ sở hữu bot và quản trị viên nhóm — người dùng khác không nhìn thấy và không vào được.":
    "Das Admin-Fenster ist privat für den Bot-Inhaber und die Team-Admins — andere Nutzer sehen und öffnen es nicht.",
  "Cửa sổ Admin chỉ hiển thị với": "Das Admin-Fenster ist nur sichtbar für",
  "và những người trong": "und die Personen auf der",
  "danh sách quản trị viên nhóm": "Team-Admin-Liste",
  "(do chủ bot đặt). Người dùng khác không thấy nút này và không truy cập được trang này.":
    "(vom Bot-Inhaber festgelegt). Andere Nutzer sehen diesen Eintrag nicht und können die Seite nicht öffnen.",
  /* ==== 10/10/2026 — Team-Admin nutzt das GANZE Admin-Fenster + Badge am
     Logo + manuelles Plan-Vergeben (payments.grantPlan) ==== */
  Owner: "Owner",
  Admin: "Admin",
  "Thêm thành viên vào team để họ dùng TOÀN BỘ cửa sổ Admin (theo dõi lỗi, sức khoẻ máy chủ, AI, threat research, đối soát tiền, cấp gói). Họ KHÔNG đụng được mật khẩu ẩn/chìa khoá bảo mật API và không tự thêm hay bớt người.":
    "Füge Personen zum Team hinzu, damit sie das GANZE Admin-Fenster nutzen (Fehlerüberwachung, Host-Zustand, KI, Threat Research, Zahlungsabgleich, Plan-Vergabe). Sie können das versteckte Passwort/den API-Sicherheitsschlüssel NICHT anfassen und selbst niemanden hinzufügen oder entfernen.",
  "Chưa có ai trong team — hãy thêm thành viên bên dưới.":
    "Noch niemand im Team – füge unten Mitglieder hinzu.",
  "Cấp gói premium": "Premium-Plan vergeben",
  "Cấp gói": "Plan vergeben",
  "Gói cấp": "Vergebener Plan",
  "Đã cấp gói.": "Plan vergeben.",
  "Đã cấp gói {goi} — hạn tới {ngay}.": "{goi} vergeben – gültig bis {ngay}.",
  "Cộng quyền lợi cho một người mà KHÔNG qua đơn thanh toán (bồi thường, đối tác, tài khoản thử). Nhập Discord ID người được cấp; nhập thêm Server ID nếu quyền lợi phải áp đúng cho server đó.":
    "Berechtigungen vergeben ohne Zahlungsbestellung (Entschädigung, Partner, Testkonto). Gib die Discord-ID des Empfängers ein; füge eine Server-ID hinzu, wenn die Berechtigung nur für diesen Server gelten soll.",
  "Discord ID người được cấp (15-21 chữ số)": "Discord-ID des Empfängers (15-21 Ziffern)",
  "Server ID (tùy chọn — 15-21 chữ số)": "Server-ID (optional – 15-21 Ziffern)",
  "Số ngày (1–365)": "Anzahl Tage (1–365)",
  "Bạn là quản trị viên nhóm — danh sách này do chủ bot quản lý. Cần thêm hoặc bớt người, hãy báo chủ bot.":
    "Du bist Team-Admin — diese Liste verwaltet der Bot-Inhaber. Bitte den Bot-Inhaber, Personen hinzuzufügen oder zu entfernen.",
  "Chưa từng đăng nhập web": "Noch nie im Web angemeldet",
  "Bỏ quyền quản trị viên nhóm": "Team-Admin-Rechte entziehen",
  "Discord ID (15-21 chữ số)": "Discord-ID (15-21 Ziffern)",
  "Tối đa": "Höchstens",
  "người.": "Personen.",
  "Cách lấy ID: bật Chế độ nhà phát triển trong Discord → chuột phải vào người dùng → Sao chép ID.":
    "ID ermitteln: Entwicklermodus in Discord aktivieren → Nutzer rechtsklicken → ID kopieren.",
  "Đã lưu danh sách quản trị viên nhóm.": "Team-Admin-Liste gespeichert.",
  "Không lưu được.": "Speichern nicht möglich.",
  "Không kiểm tra được trạng thái": "Status kann nicht abgefragt werden",
  "Lỗi kết nối — thử lại sau ít phút.":
    "Verbindungsfehler – bitte in wenigen Minuten erneut versuchen.",
  /* ==== Chuẩn hoá ảnh avatar (07/10/2026) ==== Ablehnungsfehler beim
     Avatar-Upload (src/lib/avatarImage.ts). */
  "Kích thước ảnh không hợp lệ.": "Ungültige Bildabmessungen.",
  "Ảnh không đọc được — hãy chọn file JPG/PNG/WebP khác.":
    "Dieses Bild kann nicht gelesen werden – bitte eine andere JPG/PNG/WebP-Datei wählen.",
  "Trình duyệt không vẽ được ảnh — thử trình duyệt khác nhé.":
    "Dein Browser kann dieses Bild nicht darstellen – probiere einen anderen Browser.",
  "Không nén được ảnh — hãy chọn file ảnh khác.":
    "Bild konnte nicht komprimiert werden – bitte ein anderes Bild wählen.",
  /* ==== Update-Ankündigungen + aktuelle Version (10/10/2026) ==== Admin
     schreibt im Admin-Panel; Web zeigt es seitenweit (UpdateNotice). */
  "Thông báo cập nhật": "Update-Ankündigungen",
  "Viết thông báo hiển thị cho MỌI người trên web (thanh thông báo toàn trang — kể cả khách chưa đăng nhập). Dùng cho bản cập nhật, bảo trì, sự cố.":
    "Schreibe eine Ankündigung, die ALLEN auf dem Web angezeigt wird (seitenweite Hinweisleiste – auch Gästen ohne Anmeldung). Für Updates, Wartung, Störungen.",
  "Bản cập nhật hiện tại": "Aktuelle Version",
  "Bản cập nhật hiện tại: {ver}": "Aktuelle Version: {ver}",
  "vd 1.4.0 — để trống để ẩn nhãn": "z. B. 1.4.0 – leer lassen, um das Label auszublenden",
  "Nhãn hiện ở thanh thông báo cho mọi khách truy cập.":
    "Das Label erscheint in der Hinweisleiste für alle Besucher.",
  "Tiêu đề thông báo": "Titel der Ankündigung",
  "Nội dung thông báo — điều người dùng cần biết": "Ankündigungstext – was Nutzer wissen müssen",
  "Phiên bản (tuỳ chọn — vd 1.4.0)": "Version (optional – z. B. 1.4.0)",
  "Đăng thông báo": "Veröffentlichen",
  "Đã lưu thay đổi.": "Änderungen gespeichert.",
  "Đã đăng thông báo.": "Ankündigung veröffentlicht.",
  "Đã hiện thông báo.": "Ankündigung ist jetzt sichtbar.",
  "Đã ẩn thông báo.": "Ankündigung ausgeblendet.",
  "Đã xoá thông báo.": "Ankündigung gelöscht.",
  "Đã lưu bản cập nhật hiện tại.": "Aktuelle Version gespeichert.",
  "Đang hiển thị": "Sichtbar",
  "Đã ẩn": "Ausgeblendet",
  "Chưa có thông báo nào.": "Noch keine Ankündigungen.",
  "Đóng thông báo": "Hinweis schließen",
  Lưu: "Speichern",
  Huỷ: "Abbrechen",
  Sửa: "Bearbeiten",
  Ẩn: "Ausblenden",
  Hiện: "Anzeigen",
  Xoá: "Löschen",
};
