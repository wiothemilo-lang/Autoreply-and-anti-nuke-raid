/**
 * Từ điển EN — kiểu gettext: key là CHÍNH chuỗi tiếng Việt trong code.
 * Thiếu key → translate() rơi về nguyên chuỗi VI (không vỡ UI).
 * Giữ nguyên placeholder {p0}, {p1}… — translate() thay bằng biến lúc chạy.
 *
 * File chia 3 phần theo alphabet để dễ rà soát; KHÔNG đổi tên file
 * (src/lib/i18n.tsx import "./i18n.en").
 */
export const EN: Record<string, string> = {
  /* ==== Khả năng truy cập (28/09/2026) ==== Skip-to-content trên mọi trang
     công khai — lối tắt bàn phìm bỏ qua điều hướng (WCAG 2.4.1). */
  "Bỏ qua tới nội dung": "Skip to content",
  /* ==== Gom menu server thành nhóm (27/09/2026) ==== */
  "Bảo vệ": "Protection",
  "Nội dung & phạt": "Content & punishments",
  "Vận hành": "Operations",
  /* ==== Xuất / nhập cấu hình server (27/09/2026) ==== Tab trong Cài đặt,
     giữ cấu hình để không mất khi đổi VPS. */
  "Cấu hình server": "Server config",
  "Xuất & nhập cấu hình": "Export & import config",
  "Tải toàn bộ cấu hình bảo vệ của server ra file .json để lưu lại, hoặc nạp file đã lưu.":
    "Download all of this server's protection settings to a .json file, or load a file you saved earlier.",
  "Chỉ dùng được cho cùng một server: kênh, vai trò và thành viên trong file là ID của server cũ, mang sang server khác sẽ không khớp.":
    "Only valid for the same server: the channels, roles and members in the file are IDs from the original server, so they won't match on a different one.",
  "Xuất cấu hình": "Export config",
  "Nạp cấu hình": "Import config",
  "Đã tải cấu hình về máy": "Config downloaded",
  "Đã nạp {p0} mục cấu hình": "Imported {p0} config entries",
  "Đã bỏ {p0} mục không phải cấu hình": "Skipped {p0} entries that aren't config",
  "Bỏ {p0} mục vì giá trị không hợp lệ": "Skipped {p0} entries with invalid values",
  "File không chứa cấu hình nào hợp lệ": "File contains no valid config",
  "File không phải JSON hợp lệ": "File is not valid JSON",
  "Nạp thất bại": "Import failed",
  /* ==== ThreeUI toggle (27/09/2026) ==== Nhãn truy cập dự phòng cho
     <Switch> khi hàng cấu hình không truyền aria-label. "Tắt" đã có sẵn ở
     đợt web UX — đừng khai lại (tsc chặn trùng key). Prettier bỏ dấu nháy
     ở các key là identifier hợp lệ (Bật/Tắt đều là), nên nhìn không có
     nháy là BÌNH THƯỜNG, không phải dấu nháy bị nuốt. */
  Bật: "On",
  /* ==== web UX 1+2+3+4 (27/09/2026) ==== Cảnh báo chưa lưu · command palette
     · bật chống nuke hàng loạt · badge trạng thái đồng bộ. */
  "Tìm kiếm nhanh": "Quick search",
  "Gõ để tìm panel, sau đó Enter để mở.": "Type to search panels, then press Enter to open.",
  "Tìm panel hoặc hành động…": "Search panels or actions…",
  "Tìm panel hoặc hành động": "Search panels or actions",
  "Không có kết quả nào.": "No results.",
  /* "Điều hướng" · "Lịch sử chống nuke" · "Sự cố" · "Giám sát bot" đã có sẵn
     ở cuối từ điển — đừng khai lại (tsc chặn trùng key). */
  "Trang khác": "Other pages",
  "Danh sách server": "Server list",
  "Đang gửi cấu hình cho bot…": "Sending settings to the bot…",
  "Đã gửi cấu hình cho bot": "Settings sent to the bot",
  "Bot offline — cấu hình chưa được áp dụng": "Bot offline — settings not applied yet",
  "Dashboard và bot dùng chung cấu hình nhưng cập nhật không cùng lúc. Lúc này bot có thể vẫn chạy cấu hình cũ.":
    "The dashboard and the bot share settings but do not update at the same time. The bot may still be running the previous settings.",
  "Chọn server để bật/tắt chống nuke hàng loạt": "Select servers to toggle anti-nuke in bulk",
  "Chọn server {p0}": "Select server {p0}",
  "server đã chọn": "servers selected",
  "Bật chống nuke": "Enable anti-nuke",
  Tắt: "Disable",
  "Đã bật chống nuke cho {p0} server": "Enabled anti-nuke for {p0} servers",
  "Đã tắt chống nuke ở {p0} server": "Disabled anti-nuke on {p0} servers",
  "{p0} server bị bỏ qua — bạn không có quyền quản lý":
    "{p0} servers were skipped — you don't have permission to manage them",
  "Thất bại": "Failed",

  /* ==== risk explain + guild stats (27/09/2026) ==== Nhãn yếu tố rủi ro Alt
     Detection + bảng "Tình hình hôm nay". Placeholder {p0} giữ nguyên. */
  "Tài khoản mới tạo dưới 1 ngày": "Account created less than 1 day ago",
  "Tài khoản mới tạo dưới 3 ngày": "Account created less than 3 days ago",
  "Tài khoản mới tạo dưới {p0} ngày": "Account created less than {p0} days ago",
  "Tài khoản đã trên 30 ngày": "Account older than 30 days",
  "Tài khoản đã trên 6 tháng": "Account older than 6 months",
  "Tài khoản đã trên 1 năm": "Account older than 1 year",
  "Có huy hiệu HypeSquad": "Has the HypeSquad badge",
  "Có huy hiệu Early Verified Bot Developer": "Has the Early Verified Bot Developer badge",
  "Có huy hiệu Early Supporter": "Has the Early Supporter badge",
  "Tài khoản được Discord gắn nhãn bot": "Account is flagged as a bot by Discord",
  "Tên giống tài khoản đã gặp {p0}%": "Name is {p0}% similar to a seen account",
  "Tên tài khoản giống mẫu tạo hàng loạt, nhưng tài khoản đã cũ":
    "Name looks mass-generated, but the account is old",
  "Trùng với tài khoản trước đó đã bị phạt": "Matches a previously punished account",
  "Dùng chung avatar với tài khoản vừa vào": "Shares an avatar with a recent account",
  "Cùng lúc {p0} người rủi ro cao vào server": "{p0} high-risk accounts joined at once",
  "Giống người dùng đã bị ban {p0}%": "{p0}% similar to a banned user",
  "chưa đủ bằng chứng để phạt": "not enough evidence to punish",
  "Chỉ theo dõi — chưa đủ bằng chứng để phạt": "Monitor only — not enough evidence to punish",
  "Cảnh cáo": "Warn",
  "Yêu cầu xác minh": "Verification required",
  "Không xử lý": "No action",
  "điểm rủi ro tích luỹ cao": "accumulated risk score is high",
  "Tình hình hôm nay": "Today at a glance",
  "Tính từ 00:00 hôm nay theo giờ Việt Nam.": "Counted from 00:00 today, Vietnam time.",
  "Đe doạ đã chặn": "Threats blocked",
  "Người mới vào": "New members",
  "Tài khoản bị xử lý": "Accounts actioned",
  "Nghi phạm phạt nhầm": "Suspected false positives",
  "Điểm rủi ro dưới ngưỡng nhưng vẫn bị xử lý": "Risk score below threshold but still actioned",
  "Yếu tố rủi ro hôm nay": "Risk factors today",

  /* ==== host-health + incidents (27/09/2026) ==== Cảnh báo sức khoẻ máy chủ
     + trang Sự cố gom cụm. Chèn ở ĐẦU file theo thói quen của từ điển này. */
  "Sức khoẻ máy chủ": "Server health",
  "Bot đo mỗi 5 phút · chỉ chủ bot nhìn thấy": "Measured every 5 minutes · owner only",
  "chưa có dữ liệu": "no data yet",
  "Nghiêm trọng": "Critical",
  "Cần chú ý": "Warning",
  "Bình thường": "Healthy",
  "Đĩa đã dùng:": "Disk used:",
  "Còn trống:": "Free:",
  "RAM bot:": "Bot RAM:",
  "Đã chạy:": "Uptime:",

  /* ==== Đồng hồ hệ thống (đợt #1 observability) ==== Bảng số đo bot tự đo:
     thao tác nào chậm/lỗi, AI tốn bao nhiêu. Bổ sung cho card sức khoẻ máy chủ
     ở trên (card đó đo MÁY CHỦ, card này đo BOT). */
  "Đồng hồ hệ thống": "System clock",
  "Bot tự đo mỗi 5 phút · chỉ chủ bot nhìn thấy": "Self-measured every 5 minutes · owner only",
  "Bot chưa đẩy số đo nào — thường chỉ xảy ra ngay sau khi deploy.":
    "The bot has not reported any metrics yet — usually right after a deploy.",
  "RAM tiến trình:": "Process RAM:",
  "Số server:": "Servers:",
  "Lượt gọi AI:": "AI calls:",
  "Chi phí AI:": "AI cost:",
  "Thao tác": "Operation",
  "Độ trễ TB": "Avg latency",
  "Số lần": "Calls",
  Lỗi: "Errors",
  "Chưa có thao tác nào được đo — bot vừa khởi động.":
    "No operations measured yet — the bot just started.",

  /* ==== Tiền AI + hạn mức ngày (đợt #2) ==== */
  "Chi AI hôm nay:": "AI cost today:",
  "chưa biết giá": "price unknown",
  lượt: "calls",
  "đã cũ": "stale",
  "Bảng giá AI lần rà gần nhất:": "AI price table last reviewed:",
  "Đã vượt hạn mức tiền AI hôm nay — provider trả phí đã bị hạ xuống cuối danh sách, bot vẫn chống raid bằng provider miễn phí.":
    "Today's AI budget is exceeded — paid providers were moved to the end of the list; the bot still protects servers using free providers.",
  "Bot đang offline hoặc mất kết nối Convex — số liệu máy chủ tạm dừng cập nhật.":
    "The bot is offline or lost its Convex connection — server readings are paused.",
  "Máy chủ bot đang chịu tải nặng — có thể gián đoạn.":
    "The bot's server is under heavy load — interruptions are possible.",
  "Máy chủ bot sắp đầy dung lượng.": "The bot's server is running out of disk space.",
  "Đội ngũ đang xử lý. Có thể phản hồi chậm hoặc mất kết nối trong lúc này.":
    "Our team is on it. Responses may be slow or connections may drop meanwhile.",
  /* "Sự cố" đã có sẵn ở cuối từ điển — đừng khai lại (tsc chặn trùng key). */
  "Xem theo sự cố": "View by incident",
  "Xem lịch sử thô": "View raw log",
  "chưa xử lý": "unresolved",
  "Hành động kiểm duyệt": "Moderation action",
  chặn: "blocked",
  "đối tượng bị tác động": "affected targets",
  "Đã xử lý": "Resolved",
  "Mở lại": "Reopen",
  "Các sự kiện cùng loại của cùng một người trong 15 phút được gom thành một sự cố.":
    "Matching events by the same person within 15 minutes are grouped into one incident.",
  "Chưa có sự cố nào trong 14 ngày gần nhất — server đang yên ổn.":
    "No incidents in the last 14 days — the server is calm.",
  "sự kiện": "events",

  /* ==== status-page ==== Thẻ trạng thái hệ thống (trang /monitor + /status).
     Chèn ở ĐẦU file theo bài học journal: str_replace không chạm được vùng
     cuối file từ điển lớn; alphabet chỉ là thói quen đọc, cổng i18n không đòi. */
  "Trạng thái hệ thống": "System status",
  "Trang web": "Website",
  "Trang bạn đang mở — tải được là web sống.":
    "The page you're viewing — if it loaded, the web is up.",
  "Backend (dữ liệu)": "Backend (data)",
  "Không phản hồi": "No response",
  "Không gọi được API dữ liệu.": "Data API unreachable.",
  "Khôi phục kênh và role sau khi bị nuke": "Restore channels and roles after a nuke",
  "Phản hồi:": "Response:",
  "Đồng bộ lần cuối:": "Last sync:",
  "Heartbeat cuối:": "Last heartbeat:",
  "Chưa từng thấy heartbeat.": "No heartbeat ever received.",
  "đang kiểm tra…": "checking…",
  "Bot Discord": "Discord bot",
  /* ==== i18n-extra-chrome ==== Đợt bổ sung: công tắc ngôn ngữ, chrome
     dashboard, trang đăng nhập. Gồm cả nhãn sidebar (hằng số cấp module —
     nay dịch lúc render) vốn nằm ngoài đợt codemod đầu. */
  "Ngôn ngữ": "Language",
  "Tiếng Việt": "Vietnamese",
  English: "English",
  "mất kết nối": "disconnected",
  "thành viên": "members",
  "Chống nuke bật": "Anti-nuke on",
  "Chống nuke tắt": "Anti-nuke off",
  /* ==== i18n-extra-altdetect ==== Panel Alt Detection (nhãn rủi ro, tuổi tài
     khoản, bảng join) — nhóm này trước đây viết tiếng Việt KHÔNG DẤU. */
  "Rủi ro trung bình": "Medium risk",
  "Rủi ro thấp": "Low risk",
  "An toàn": "Safe",
  "hôm nay": "today",
  "1 ngày": "1 day",
  "{n} ngày": "{n} days",
  "{n} tháng": "{n} months",
  "{n} năm": "{n} years",
  "Chế độ VPN/Proxy": "VPN/Proxy mode",
  "Lượt join (7 ngày)": "Joins (7 days)",
  "Rủi ro cao": "High risk",
  "Rủi ro": "Risk",
  "Bằng chứng": "Evidence",
  "Xử lý": "Action",
  Tuổi: "Age",
  "Yếu tố": "Factor",
  "Lượt join gần đây": "Recent joins",
  "Chưa có dữ liệu join nào.": "No join data yet.",
  "Yếu tố rủi ro phổ biến": "Most common risk factors",
  "Đã bật Alt Detection": "Alt Detection enabled",
  "Đã tắt Alt Detection": "Alt Detection disabled",
  /* ==== Chuỗi render thẳng (trước đây trôi tiếng Việt ra UI khi chọn EN/DE)
     + default prop của MultiSelect — 28/09/2026 ==== */
  "Phát hiện và chặn alt account, VPN/Proxy khi thành viên mới tham gia server.":
    "Detects and blocks alt accounts and VPN/proxies when a new member joins the server.",
  "Ngưỡng rủi ro:": "Risk threshold:",
  "Tài khoản mới": "New accounts",
  "10 (nghiêm ngặt)": "10 (strict)",
  "100 (lỏng lẻo)": "100 (lenient)",
  "Chọn…": "Select…",
  "Không có lựa chọn": "No options",
  ẨN: "HIDDEN",
  "trên thiết bị này": "on this device",
  "Đang chuyển tới Discord…": "Redirecting to Discord…",
  "Đăng nhập với Discord": "Sign in with Discord",
  "sự kiện đã hiển thị": "events shown",
  "Tổng quan": "Overview",
  "Auto-mod": "Auto-mod",
  "Join Gate": "Join Gate",
  "Alt Detection": "Alt Detection",
  "Raid external app": "External app raid",
  Whitelist: "Whitelist",
  "Backup server": "Server backup",
  "Tôi là Haimiya, trợ lý ảo của Protogon — bot Discord bảo vệ server. Tôi có thể giải đáp về hệ thống nhiệt độ, Join Gate, chống nuke/raid, auto reply, công cụ mod… Bạn cứ hỏi, tôi sẽ trả lời rõ ràng.":
    "I'm Haimiya, Protogon's assistant — the Discord bot that protects your server. I can walk you through violation heat, Join Gate, anti-nuke/raid, auto-replies and mod tools… Ask away and I'll answer plainly.",
  "Dashboard là trang quản lý bot trên web 🖥️. Bạn đăng nhập bằng Discord, chọn server, rồi quản lý mọi thứ: Moderation (nhiệt độ, warn, lọc nội dung), Join Gate, Chống nuke/raid, Hình phạt và Cài đặt (prefix, kênh log, chủ đề màu). Thay đổi được bot áp dụng trong khoảng 3 phút.":
    "The dashboard is the web control panel 🖥️. Sign in with Discord, pick a server, then manage everything: Moderation (heat, warns, content filtering), Join Gate, anti-nuke/raid, punishments and Settings (prefix, log channels, colour theme). The bot applies changes within about 3 minutes.",
  "Bot hỗ trợ cả prefix và slash command ⌨️. Công cụ Mod: /mod timeout, /mod kick, /mod ban, /mod purge — lệnh text tương đương !timeout !kick !ban !purge. Ngoài ra: /heat status xem nhiệt & warn, /antinuke bật tắt bảo vệ, /prefix đổi prefix, /badword quản lý từ ngữ xấu. Gõ / trong Discord để xem toàn bộ danh sách slash command.":
    "The bot supports both prefix and slash commands ⌨️. Mod tools: /mod timeout, /mod kick, /mod ban, /mod purge — the text equivalents are !timeout !kick !ban !purge. Also: /heat status for heat & warns, /antinuke to toggle protection, /prefix to change the prefix, /badword to manage banned words. Type / in Discord for the full slash command list.",
  // ── Bổ sung 22/09: bịt rò rỉ khu vực chủ bot + gộp cấu hình kênh log ──
  "Phần này nằm trong khu vực riêng của chủ sở hữu bot nên mình không chia sẻ công khai 🔒. Nếu bạn cần hỗ trợ về các tính năng dùng chung — auto reply, nhiệt độ vi phạm, chống nuke/raid, Join Gate, verify, backup — cứ hỏi mình nhé.":
    "That part belongs to the bot owner's private area, so I don't share it publicly 🔒. If you need help with the shared features — auto-replies, violation heat, anti-nuke/raid, Join Gate, verification, backups — just ask.",
  "Khóa khu vực riêng tư dành cho chủ sở hữu bot. Mật khẩu thuộc về chủ bot và áp dụng cho":
    "Locks the bot owner's private area. The password belongs to the bot owner and applies to",
  "mọi server": "every server",
  "bạn quản lý trên dashboard — không riêng server này. Chỉ":
    "you manage on the dashboard — not just this one. Only",
  "được đặt, đổi hoặc xóa.": "may set, change or clear it.",
  "Chống nuke/raid, Join Gate, verify, báo cáo hàng ngày và mọi thông báo hệ thống. Để trống = tắt toàn bộ log.":
    "Anti-nuke/raid, Join Gate, verification, the daily report and every system notice. Leave empty to turn all logging off.",
  "Kênh log hành động mod (tùy chọn)": "Mod action log channel (optional)",
  "Case ban · kick · timeout · warn và auto-mod (embed hình phạt với":
    "Ban · kick · timeout · warn cases and auto-mod (punishment embed with",
  // ── Rà soát copy 22/09/2026: bỏ tên model/vendor khỏi câu chào hàng, sửa câu
  //    nói sai số module, và Haimiya nay trả lời theo ngôn ngữ người dùng chọn.
  "embed hình phạt chi tiết": "detailed punishment embed",
  "Dùng /report hoặc !report khi server bị raid/nuke hay bot phạt nhầm: hệ thống đọc lại hàng trăm tin nhắn gần nhất để dựng đúng diễn biến và gửi báo cáo kèm bằng chứng cho bạn.":
    "Use /report or !report when a raid/nuke hits or the bot punishes the wrong member: the system re-reads hundreds of recent messages to reconstruct what happened, then sends you a report with the evidence.",
  "Đang hiển thị 20/32 module.": "Showing 20 of 32 modules.",
  "12 module chống nuke còn lại bật/tắt trong dashboard.":
    "The other 12 anti-nuke modules are toggled in the dashboard.",
  "Haimiya là trợ lý ảo của Protogon, luôn túc trực trên website và dashboard. Haimiya trả lời bằng đúng ngôn ngữ bạn đang chọn — tiếng Việt, tiếng Anh hoặc tiếng Đức — về hệ thống nhiệt độ, warn tích lũy, Join Gate, chống nuke/raid, auto reply và cách cấu hình bot.":
    "Haimiya is Protogon's virtual assistant, always available on the website and in the dashboard. Haimiya answers in whichever language you have selected — Vietnamese, English, or German — about the heat system, accumulated warnings, Join Gate, anti-nuke/raid, auto-reply, and how to configure the bot.",
  '; lý do trống → ghi "không có lý do"). Để trống = dùng kênh log chung; chọn trùng kênh log chung thì bot vẫn chỉ gửi một tin cho mỗi case — không nhân đôi log.':
    '; an empty reason is logged as "no reason"). Leave empty to use the general log channel; picking the same channel as the general log still sends only one message per case — no duplicate logs.',
  "Kênh nhận thông báo": "Notification channel",
  "Bot gửi case vào kênh log hành động mod; chưa đặt thì dùng kênh log chung. Nơi cấu hình duy nhất là":
    "The bot posts each case to the mod action log channel, or to the general log channel if that is not set. The only place to configure it is",
  "Cài đặt → Kênh log": "Settings → Log channels",
  "— không chọn kênh lại ở đây để tránh hai nơi ghi đè nhau và log bị nhân đôi.":
    "— don't pick a channel again here, so two places can't override each other and duplicate logs.",
  "Đang gửi tới:": "Currently sending to:",
  "Chưa chọn kênh log nào nên bot chưa gửi được thông báo hình phạt — vào Cài đặt → Kênh log để chọn.":
    "No log channel is set yet, so the bot cannot post punishment notices — pick one in Settings → Log channels.",
  "Xác minh (Verify)": "Verify",
  "Webhook & Log": "Webhook & Log",
  "Cài đặt": "Settings",
  "Hệ thống nhiệt độ 4 giai đoạn + warn tích lũy": "4-stage heat system + accumulated warns",
  "Join Gate chống selfbot khi vào server": "Join Gate blocks selfbots on entry",
  "Chặn link độc hại & file nguy hiểm": "Blocks malicious links & dangerous files",
  "Công cụ mod: timeout, kick, ban, purge kèm lý do":
    "Mod tools: timeout, kick, ban, purge with reasons",
  "Tùy chọn lưu / không lưu đăng nhập": "Remember / don't remember login option",
  /* ==== i18n-extra-kb ==== Nốt phần kiến thức cục bộ còn lại của Haimiya
     (vùng riêng tư, mod tools, warn, moderation, chủ đề màu, báo cáo…). */
  "Mỗi server có thể chọn chủ đề màu riêng cho trang quản lý 🎨. Vào Cài đặt → mục Chủ đề màu của server: chọn 1 trong 8 màu (Hồng anh đào, Hồng đỏ, Cam hoàng hôn, Vàng hổ phách, Xanh lá, Xanh ngọc, Xanh trời, Tím oải hương) rồi bấm Áp dụng. Màu sẽ áp dụng ngay cho nút bấm, thẻ và sidebar của riêng server đó trên web.":
    "Every server can pick its own colour theme for the management pages 🎨. Go to Settings → Server colour theme: choose one of 8 colours (Cherry pink, Crimson, Sunset orange, Amber, Green, Teal, Sky blue, Lavender) then click Apply. The colour applies immediately to that server's buttons, cards and sidebar on the web.",
  "Công cụ Mod giúp xử lý thành viên nhanh chóng và có ghi chép đầy đủ 🛠️: /mod timeout @user 10m [lý do], /mod kick @user [lý do], /mod ban @user [lý do] (kèm --days để xóa tin nhắn) và /mod purge <số tin>. Lệnh text tương đương: !timeout, !kick, !ban, !purge. Mọi hành động đều được ghi vào kênh log và bảng hình phạt trên dashboard với lý do + người thực hiện. Cần quyền Quản lý server hoặc role Mod/Admin được cấu hình.":
    "Mod tools let you deal with members quickly and keep a full record 🛠️: /mod timeout @user 10m [reason], /mod kick @user [reason], /mod ban @user [reason] (add --days to delete messages) and /mod purge <count>. Text equivalents: !timeout, !kick, !ban, !purge. Every action is written to the log channel and the dashboard punishment table with the reason and the moderator. You need Manage Server or a configured Mod/Admin role.",
  "Trang đăng nhập có tùy chọn lưu đăng nhập 🪪. Tích Lưu đăng nhập → phiên đăng nhập được giữ lại trên thiết bị, mở lại trình duyệt không cần đăng nhập lại. Chọn Không lưu đăng nhập → token chỉ sống trong tab hiện tại, đóng trình duyệt là phải đăng nhập lại — an toàn hơn khi dùng máy công cộng.":
    "The login page offers a remember-login option 🪪. Tick Remember login → the session is kept on this device, so reopening the browser needs no new sign-in. Choose Don't remember login → the token lives only in the current tab and closing the browser requires signing in again — safer on shared computers.",
  "Warn tích lũy giúp phát hiện người tái phạm liên tục ⚠️. Mỗi lần vi phạm bị xử lý Cảnh báo sẽ được đếm; đủ N lần (mặc định 3) trong cửa sổ (mặc định 60 phút) thì tự tăng cấp hình phạt (tạm khóa / kick / ban — bạn chọn được). Số warn hiển thị dạng X/N ngay trong bảng nhiệt trên dashboard và báo cáo hàng ngày.":
    "Accumulated warns catch members who keep reoffending ⚠️. Every violation punished with a warning is counted; after N warns (default 3) inside the window (default 60 minutes) the punishment escalates automatically (timeout / kick / ban — your choice). The warn count shows as X/N right in the dashboard heat table and the daily report.",
  "Module chống link độc hại & file nguy hiểm bảo vệ thành viên khỏi lừa đảo 🛡️. Bot phát hiện và xóa tin chứa: domain lừa đảo phổ biến (nitro giả, gift giả, crypto scam…), link IP trực tiếp, chữ ký nội dung scam, và file đuôi nguy hiểm (.exe .scr .bat .msi .vbs .ps1 .jar .apk .hta…). Mỗi lần phát hiện đều cảnh báo trong kênh log kèm tên file hoặc link.":
    "The malicious-link & dangerous-file module protects members from scams 🛡️. The bot detects and deletes messages containing: common scam domains (fake nitro, fake gifts, crypto scams…), raw IP links, scam content signatures, and dangerous file extensions (.exe .scr .bat .msi .vbs .ps1 .jar .apk .hta…). Every detection is reported in the log channel with the file name or link.",
  "Mục Moderation tập trung lọc nội dung tin nhắn ✂️: chống spam tin nhắn, chống spam mention, lọc từ ngữ xấu (danh sách tùy chỉnh), chống spam ảnh/file đính kèm, chặn link mời Discord (discord.gg, discord.com/invite) và chống link độc hại/file nguy hiểm. Mỗi module bật/tắt riêng, chỉnh ngưỡng, hình phạt và mức nhiệt cộng cho từng vi phạm.":
    "Moderation focuses on filtering message content ✂️: anti message spam, anti mention spam, bad-word filtering (custom list), anti attachment/image spam, Discord invite blocking (discord.gg, discord.com/invite) and malicious-link/dangerous-file blocking. Each module toggles separately, with its own thresholds, punishments and heat added per violation.",
  "Báo cáo hàng ngày là bản tóm tắt gửi vào kênh log mỗi ngày 📊: tổng số sự kiện, chi tiết theo module, thủ phạm thường xuyên, trạng thái khóa kênh, cùng danh sách nhiệt độ và warn tích lũy của từng thành viên. Bật/tắt trong Cài đặt → Báo cáo chống nuke hàng ngày, nhớ đặt kênh log.":
    "The daily report is a summary posted to the log channel every day 📊: total events, a per-module breakdown, repeat offenders, channel-lock status, plus each member's heat and accumulated warns. Toggle it in Settings → Daily anti-nuke report, and remember to set the log channel.",
  /* ==== i18n-extra-chat ==== Chrome của khung chat Haimiya. */
  "Ảnh không đọc được": "Could not read the image",
  "Video không đọc được": "Could not read the video",
  "Không trích được khung hình từ video": "Could not extract frames from the video",
  "Chỉ hỗ trợ ảnh (jpg/png/webp) hoặc video (mp4/webm)":
    "Only images (jpg/png/webp) or videos (mp4/webm) are supported",
  "Máy chủ AI đang lỗi tạm thời": "The AI server is temporarily down",
  "(xem ảnh)": "(see image)",
  "Hãy mô tả ảnh này.": "Please describe this image.",
  "Không đọc được file": "Could not read the file",
  "Mô tả về ảnh…": "Describe the image…",
  "Hỏi tôi điều gì đó…": "Ask me anything…",
  "Haimiya sẵn sàng giải đáp — hỏi về Protogon hay bất cứ điều gì ngoài lề.":
    "Haimiya is ready — ask about Protogon or anything off-topic.",
  "Haimiya trò chuyện thoải mái — hỏi về Protogon hoặc bất cứ điều gì bạn muốn.":
    "Haimiya chats freely — ask about Protogon or anything else you like.",
  "⚠️ AI trên máy chủ chưa phản hồi — {reason}. Tạm trả lời bằng kiến thức cục bộ.":
    "⚠️ The AI server did not respond — {reason}. Answering from local knowledge for now.",
  "⚠️ AI trên máy chủ chưa phản hồi. Tạm trả lời bằng kiến thức cục bộ.":
    "⚠️ The AI server did not respond. Answering from local knowledge for now.",
  /* ==== i18n-extra-haimiya ==== Phần giới thiệu + câu hỏi gợi ý của
     Haimiya (kiến thức cục bộ, dùng khi AI thật offline). */
  "Xin chào! Tôi là Haimiya, trợ lý ảo của Protogon — bot Discord bảo vệ server. Tôi có thể giúp bạn giải đáp về hệ thống nhiệt độ, Join Gate, chống nuke/raid, công cụ mod và nhiều hơn nữa. Bạn muốn hỏi điều gì?":
    "Hello! I'm Haimiya, Protogon's virtual assistant — a Discord bot that protects your server. I can explain the heat system, Join Gate, anti-nuke/raid, mod tools and much more. What would you like to know?",
  "Mình rất muốn trò chuyện về điều đó! Hiện tại AI thật chưa kết nối được nên mình chỉ trả lời được các câu hỏi về Protogon trong kiến thức sẵn có. Bạn thử hỏi về: nhiệt độ, join gate, warn, hosting, bảng hình phạt… Hoặc chọn một câu hỏi gợi ý bên dưới nhé.":
    "I'd love to chat about that! The live AI isn't connected right now, so I can only answer Protogon questions from my built-in knowledge. Try asking about: heat, join gate, warns, hosting, the punishment table… Or pick a suggestion below.",
  "Hệ thống nhiệt độ hoạt động thế nào?": "How does the heat system work?",
  "Join Gate là gì?": "What is Join Gate?",
  "Cách chạy bot trên hosting": "How to run the bot on hosting",
  "Công cụ mod gồm những gì?": "What do the mod tools include?",
  "Bảng hình phạt là gì?": "What is the punishment table?",
  "Cách xem nhiệt của thành viên": "How to view a member's heat",
  "Chống nuke/raid là gì?": "What is anti-nuke/raid?",
  "Moderation lọc những gì?": "What does Moderation filter?",
  "Join Gate chống được gì?": "What does Join Gate block?",
  "Warn tích lũy là gì?": "What are accumulated warns?",
  "Báo cáo hàng ngày là gì?": "What is the daily report?",
  "Chủ đề màu server là gì?": "What is the server colour theme?",
  "Đổi avatar bot ở đâu?": "Where do I change the bot avatar?",
  "Cách đặt kênh log": "How to set the log channel",
  "Cách đăng nhập dashboard": "How to sign in to the dashboard",
  "Bot có những lệnh nào?": "What commands does the bot have?",
  "Lưu đăng nhập là gì?": "What does 'remember login' mean?",
  /* ==== i18n-extra-haimiya-answers ==== Câu trả lời cục bộ, dùng khi AI
     thật không phản hồi được (xem FALLBACK trong src/lib/haimiya.ts). */
  "Hệ thống nhiệt độ hoạt động theo thang điểm 0–100 🌡️. Mỗi vi phạm cộng điểm nhiệt theo cài đặt; ngưỡng mặc định: cảnh báo 25, tạm khóa 40, kick 70, ban 90. Khi chạm ngưỡng, bot tự xử lý (cảnh báo DM → tạm khóa → kick → ban). Nhiệt giảm dần theo phút (mặc định 3 điểm/phút) và nếu tái phạm trong cửa sổ (mặc định 30 phút) sẽ bị nhân nhiệt (mặc định x2). Tất cả ngưỡng đều chỉnh được trong Moderation.":
    "The heat system runs on a 0–100 scale 🌡️. Each violation adds heat based on your settings; default thresholds: warn 25, timeout 40, kick 70, ban 90. When a threshold is reached the bot acts automatically (DM warn → timeout → kick → ban). Heat decays per minute (default 3 points/minute), and repeat offences inside a window (default 30 minutes) multiply heat (default x2). Every threshold is configurable in Moderation.",
  "Join Gate là cổng kiểm soát thành viên khi vào server 🚪. Bạn bật từng tùy chọn trong mục Join Gate: chặn tài khoản quá mới (số ngày tùy chỉnh), bắt buộc có avatar, bắt buộc có huy hiệu, và chặn toàn bộ lượt vào khi server đang bị raid. Có danh sách trắng để miễn trừ, và chọn hình phạt Kick hoặc Ban cho các trường hợp bị chặn.":
    "Join Gate screens members as they enter the server 🚪. Enable each option in the Join Gate section: block accounts that are too new (customisable days), require an avatar, require a badge, and block all joins while the server is being raided. A whitelist can exempt members, and you choose Kick or Ban for blocked cases.",
  "Chống nuke/raid bảo vệ cấu trúc server 🛡️ với 10 module nuke: ban hàng loạt, kick hàng loạt, raid thành viên, tạo kênh hàng loạt, xóa kênh hàng loạt, tạo role hàng loạt, xóa role hàng loạt, xóa tin hàng loạt, tạo webhook hàng loạt, tạo thread hàng loạt. Các module này phạt trực tiếp (warn/kick/ban/timeout), không cộng nhiệt. Bot có AI Guard 🧠 tự phân biệt đâu là raid/nuke thật sự (leo thang ban + khóa kênh) với vi phạm cá nhân (chỉ cộng nhiệt, moderation bình thường) — nhận diện cả spam tin dài cực dài, tin lặp nội dung và tin giả blank (toàn khoảng trắng/ký tự ẩn) gây nhiễu. Khi bị tấn công, bot tự khóa kênh (lockdown) và mở khóa bằng /antinuke unlock.":
    "Anti-nuke/raid protects your server's structure 🛡️ with 10 nuke modules: mass ban, mass kick, member raids, mass channel create, mass channel delete, mass role create, mass role delete, mass message delete, mass webhook create, mass thread create. These punish directly (warn/kick/ban/timeout) instead of adding heat. AI Guard 🧠 tells a real raid/nuke (escalating bans + channel lockdown) from individual offences (heat only, normal moderation) — it also spots extremely long message spam, repeated content and blank-noise messages (whitespace/invisible characters). When attacked, the bot locks channels (lockdown); unlock with /antinuke unlock.",
  "Auto Reply tự động trả lời tin nhắn theo rule 💬. Mỗi rule gồm: tên, loại kích hoạt (từ khóa xuất hiện trong tin hoặc khi thành viên tag bot), nội dung trả lời (hỗ trợ {user} và {username}), giới hạn kênh và cooldown chống spam. Quản lý rule ngay trên dashboard hoặc lệnh !autoreply add/list/remove.":
    "Auto Reply answers messages by rule 💬. Each rule has: a name, a trigger type (a keyword found in a message, or a member tagging the bot), reply content (supports {user} and {username}), channel limits and an anti-spam cooldown. Manage rules on the dashboard or with !autoreply add/list/remove.",
  "Protogon miễn phí cho mọi server 💰. Toàn bộ tính năng công khai — auto reply, nhiệt độ 4 giai đoạn, warn tích lũy, Join Gate, chống nuke/raid, chặn link độc hại, công cụ mod, bảng hình phạt, báo cáo hàng ngày — đều dùng được không giới hạn. Bạn chỉ cần host bot và dùng dashboard, không mất phí.":
    "Protogon is free for every server 💰. All public features — auto reply, 4-stage heat, accumulated warns, Join Gate, anti-nuke/raid, malicious-link blocking, mod tools, the punishment table, daily reports — are unlimited. You only host the bot and use the dashboard; no fees.",
  "Đăng nhập rất nhanh 🪪. Bấm nút Đăng nhập với Discord ở góc phải trên cùng (hoặc nút Mở dashboard), Discord xác nhận quyền, xong là vào thẳng dashboard. Trang đăng nhập có tùy chọn Lưu đăng nhập / Không lưu đăng nhập. Chỉ server nào bạn có quyền quản lý mới hiện ra — nếu chưa thấy server, hãy mời bot vào server đó trước.":
    "Signing in takes seconds 🪪. Click Sign in with Discord at the top right (or the Open dashboard button), Discord confirms access and you land straight on the dashboard. The login page offers Remember / Don't remember login. Only servers you can manage appear — if a server is missing, invite the bot to it first.",
  "Để bot chạy 24/7, bạn cần một hosting bot (ví dụ Wispbyte) 🚀. Quy trình: tải file zip bot từ nhánh host-deploy trên GitHub → vào hosting, xóa file cũ → upload zip mới → Unarchive → Restart. Mỗi lần có bản cập nhật, lặp lại đúng quy trình đó. Nhớ cấu hình đủ token Discord và khóa Convex trong file cấu hình.":
    "To keep the bot online 24/7 you need bot hosting (Wispbyte, for example) 🚀. Steps: download the bot zip from the host-deploy branch on GitHub → open your hosting, delete the old files → upload the new zip → Unarchive → Restart. Repeat the same steps for every update. Remember to configure the Discord token and the Convex key in the config file.",
  "Bảng hình phạt nằm trong mục Hình phạt trên sidebar trang quản lý server 🛠️. Nó liệt kê đầy đủ các hình phạt gần nhất: timeout, kick, ban, purge — kèm thời gian, thành viên bị phạt, người thực hiện (mod) và lý do. Các hình phạt tự động từ hệ thống chống nuke/nhiệt độ cũng được ghi vào bảng này với nhãn Tự động. Bot ghi nhận khi bạn dùng /mod hoặc !timeout !kick !ban !purge.":
    "The punishment table lives under Punishments in the server sidebar 🛠️. It lists recent punishments in full: timeout, kick, ban, purge — with time, punished member, the moderator and the reason. Automatic punishments from anti-nuke/heat are logged here too, tagged Automatic. The bot records them when you use /mod or !timeout !kick !ban !purge.",
  "! Thử một trận Valorant 5v5 không? 🎮": "! Up for a 5v5 Valorant match? 🎮",
  '"{p0}" đã có trong danh sách': '"{p0}" is already in the list',
  "(7 ngày)": "(7 days)",
  "(8 module) sàng lọc nội dung độc hại mỗi ngày. Vượt ngưỡng, bot truy ra thủ phạm qua audit log, phạt đúng cài đặt và báo real-time về kênh log.":
    "(8 modules) screen harmful content every day. Break a threshold and the bot traces the offender through the audit log, punishes per your settings and alerts the log channel in real time.",
  "(JSON thường / base64 / có lớp bọc), tạo lại": "(plain JSON / base64 / wrapped), recreate",
  "(chỉ server này)": "(this server only)",
  "(chống nuke / auto-mod — Responsible moderator hiển thị là “Bot tự động”) lẫn":
    "(anti-nuke / auto-mod — Responsible moderator shows as “Automated”) and",
  "(hiển thị tên người thực hiện). Lý do để trống → ghi “không có lý do”. Chọn":
    "(shows the moderator's name). Empty reason → recorded as “no reason”. Choose",
  "(kể cả raid/nuke phát hiện qua AI). Role ở server khác không ảnh hưởng.":
    "(including AI-detected raids/nukes). Roles from other servers have no effect.",
  "(tên, màu, hoist, mentionable, quyền),": "(name, colour, hoist, mentionable, permissions),",
  "(tối thiểu": "(minimum",
  "(đã đặt trong Keys) — owner các server khác": "(set in Keys) — owners of other servers",
  ", không avatar, không huy hiệu → đã bị kick.": ", no avatar, no badge → kicked.",
  ", mỗi lần vi phạm đếm": ", each violation counts",
  ". Bot chưa có BOT_KEY sẽ": ". A bot without BOT_KEY will",
  ". Slash command hoạt động độc lập.": ". Slash commands work independently.",
  "1. Backup đã được đẩy lên GitHub từ trước → dữ liệu vẫn còn.":
    "1. The backup was already pushed to GitHub → data still exists.",
  "2. Tạo server phụ, mời bot vào.": "2. Create a backup server and invite the bot.",
  "3 bản mới nhất": "latest 3 versions",
  "3. Vào dashboard → server phụ → Backup → bấm “Khôi phục”.":
    "3. Open the dashboard → backup server → Backup → click “Restore”.",
  "32 module bảo vệ": "32 protection modules",
  "32/32 bật": "32/32 on",
  "4. Bot tạo lại role (tên, màu, quyền), danh mục, kênh + quyền truy cập và cấu hình cơ bản. Các role/kênh có sẵn của server phụ được giữ nguyên (không xóa gì).":
    "4. The bot recreates roles (name, colour, permissions), categories, channels + access and basic config. Existing roles/channels on the backup server are kept (nothing deleted).",
  "AI chẩn đoán lỗi runtime · đề xuất vá vào kênh log (không tự sửa)":
    "AI diagnoses runtime errors · posts a suggested patch to the log channel (no auto-fix)",
  "AI nhận diện": "AI detection",
  "AI tổng hợp (Mimo V2.5)": "AI synthesis (Mimo V2.5)",
  "App ngoài phát hiện": "External apps detected",
  "Auto-mod nội dung": "Content auto-mod",
  "Avatar URL ghi đè (tùy chọn)": "Avatar URL override (optional)",
  "Backup có sẵn": "Available backups",
  /* ==== Kế hoạch khôi phục / dry-run (29/09/2026) ==== Xem trước bot sẽ tạo gì,
     server chưa bị thay đổi — trước khi bấm khôi phục không hoàn tác được. */
  "Xem kế hoạch": "Preview plan",
  /* ==== Phạm vi chụp mở rộng (29/09/2026) ==== ban list, link mời, tên/mô tả/
     icon server, thread — server bị nuke mất đúng những thứ này. */
  "Khôi phục tên / mô tả / icon server": "Restore server name / description / icon",
  "Khôi phục danh sách ban + link mời": "Restore ban list + invite links",
  "không hoàn tác được": "cannot be undone",
  /* ==== Xoá kênh sẵn có khi khôi phục (06/10/2026) ==== khôi phục vào server
     đã có rác cần dọn; mặc định TẮT vì không hoàn tác được. */
  "Xoá kênh sẵn có của server trước khi dựng lại":
    "Delete the server's existing channels before rebuilding",
  "NGOẠI LỆ: “xoá kênh sẵn có” đang BẬT nên các KÊNH đang có của server này sẽ bị XOÁ trước khi dựng lại — không hoàn tác được (tin nhắn trong kênh mất theo). Role thì vẫn giữ nguyên.":
    "EXCEPTION: “delete existing channels” is ON, so the existing CHANNELS of this server will be DELETED before rebuilding — this cannot be undone (messages in those channels are lost). Roles are still kept.",
  "Chỉ bật khi khôi phục vào server đã có sẵn kênh rác cần dọn: bot sẽ XOÁ các kênh xoá được của server này TRƯỚC khi dựng lại kênh theo backup (tin nhắn trong kênh mất theo). Kênh bot không xoá được — kênh nằm trên role của bot, kênh quy tắc/thông báo cập nhật — vẫn được giữ nguyên.":
    "Only enable this when restoring into a server that already has junk channels to clean up: the bot will DELETE the deletable channels of this server BEFORE rebuilding the channels from the backup (messages in them are lost). Channels the bot cannot delete — channels above the bot's role, or the rules/updates channels — are kept.",
  /* ==== Quy tắc giữ bản (29/09/2026) ==== thay cho slice(3) hard-code. */
  Giữ: "Keep",
  "bản gần nhất": "most recent backups",
  "xoá bản cũ hơn": "delete backups older than",
  "ngày (0 = không xoá theo tuổi)": "days (0 = no age limit)",
  "Lưu quy tắc giữ bản": "Save retention rule",
  "Đã lưu quy tắc giữ bản: giữ {p0} bản gần nhất, xoá bản cũ hơn {p1} ngày.":
    "Retention saved: keep the {p0} most recent backups, delete anything older than {p1} days.",
  "Quy tắc này áp dụng cho các lần backup TIẾP THEO — bot xoá bản cũ ngay khi lưu bản mới, không xoá ngược lại những bản đang có.":
    "This rule applies to the NEXT backups — the bot prunes old ones when it saves a new backup; it does not delete anything you already have.",
  "Quy tắc có hiệu lực từ lần backup kế tiếp. Những bản đang có không bị xoá ngay.":
    "The rule takes effect from the next backup. Existing backups are not deleted right now.",
  "Kế hoạch khôi phục (chưa thay đổi server)": "Restore plan (server untouched)",
  "Xem trước sẽ tạo gì mà không thay đổi server (dry-run)":
    "Preview what would be created without changing the server (dry-run)",
  "Đang tính kế hoạch khôi phục…": "Calculating the restore plan…",
  "Bot cần vài giây để đối chiếu backup với quyền hiện tại của server. Server chưa bị thay đổi.":
    "The bot needs a few seconds to compare the backup against the server's current permissions. Nothing has changed yet.",
  "Bot đang đối chiếu backup với server hiện tại…":
    "The bot is comparing the backup with the current server…",
  "Không xem được kế hoạch: {p0}": "Could not build the plan: {p0}",
  "Không tính được kế hoạch: {p0}": "Could not calculate the plan: {p0}",
  "mục cấu hình": "config fields",
  "Không phát hiện vấn đề gì — bot đủ quyền tạo lại cấu trúc này.":
    "No issues found — the bot has the permissions needed to rebuild this structure.",
  "Đây chỉ là kế hoạch — server chưa bị thay đổi. Bấm “Khôi phục vào server này” ở bản backup tương ứng để thực sự tạo lại.":
    'This is only a plan — the server is unchanged. Press "Restore into this server" on the matching backup to actually create it.',
  "Backup thất bại: {p0}": "Backup failed: {p0}",
  "Biểu đồ độ trễ (5 giây / mẫu)": "Latency chart (5s / sample)",
  "Bot Discord bảo vệ server, đồng hành cùng trợ lý Haimiya":
    "Discord server-protection bot, with the Haimiya assistant",
  "Bot vẫn chưa xử lý file backup": "The bot has not processed the backup file yet",
  "Bot vẫn chưa xử lý xong khôi phục": "The bot has not finished restoring yet",
  "Bot đang OFFLINE — hãy khởi động bot trên host (Wispbyte…) rồi tải lại file.":
    "The bot is OFFLINE — start it on your host (Wispbyte…) and reload the file.",
  "Bot đang OFFLINE — không thể backup lúc này": "The bot is OFFLINE — cannot back up right now",
  "Bot đang OFFLINE — không thể khôi phục lúc này": "The bot is OFFLINE — cannot restore right now",
  "Bot đang phục vụ": "Servers using the bot",
  "Bot đang trực tuyến": "Bot is online",
  "Bot đã khôi phục xong": "The bot finished restoring",
  "Bot đã khôi phục xong backup từ file": "The bot finished restoring the backup file",
  "Báo cáo chống nuke hàng ngày": "Daily anti-nuke report",
  "Bạn chưa quản lý server nào có bot — hãy mời bot vào server trước.":
    "You don't manage any server with the bot yet — invite it first.",
  "Bạn không có quyền quản lý, hoặc bot chưa đồng bộ server này.":
    "You lack manage permissions, or the bot hasn't synced this server yet.",
  "Bạn đã xác minh thành công. Chào mừng bạn đến với server!":
    "You verified successfully. Welcome to the server!",
  "Bảng hình phạt": "Punishment log",
  "Bảng xếp hạng nhiệt độ": "Heat leaderboard",
  "Bảng điều khiển": "Dashboard",
  "Bảo mật": "Security",
  "Bật Join Gate": "Enable Join Gate",
  "Bật bảo vệ": "Enable protection",
  "Bật xác minh thành viên": "Enable member verification",
  "Bắt đầu ngay": "Get started",
  "Bắt đầu nhanh": "Quick start",
  "Bỏ ảnh": "Remove image",
  Chào: "Hi",
  "Chào {user}! Cần tớ giúp gì không?": "Hi {user}! How can I help?",
  "Chèn:": "Insert:",
  "Chìa khóa bảo mật API": "API security key",
  "Chưa có ID nào — mọi thành viên mới đều bị kiểm tra.":
    "No IDs yet — every new member is checked.",
  "Chưa có backup nào — bấm “Backup ngay” phía trên để tạo bản đầu tiên.":
    "No backups yet — click “Back up now” above to create the first one.",
  'Chưa có bảng reaction role nào. Bấm "Tạo bảng mới" để bắt đầu 🌸':
    'No reaction-role panels yet. Click "New panel" to start 🌸',
  "Chưa có người dùng nào — thêm ID phía trên để miễn trừ.":
    "No users yet — add IDs above to exempt them.",
  "Chưa có server nào": "No servers yet",
  "Chưa có — bot sẽ": "None yet — the bot will",
  "Chưa học được từ khóa nào — bật research và chờ lượt chạy đầu tiên (5 phút sau khi bot online).":
    "No keywords learned yet — enable research and wait for the first run (5 minutes after the bot comes online).",
  "Chưa thêm bot": "Bot not invited",
  "Chưa xác định được tên app": "App name unknown",
  "Chưa đặt mật khẩu": "No password set",
  Chậm: "Slow",
  "Chặn tài khoản quá mới": "Block accounts that are too new",
  "Chặn đứng kẻ phá hoại": "Stop vandals in their tracks",
  "Chế độ an toàn (chống chặn nhầm)": "Safe mode (avoid false positives)",
  Chỉ: "Only",
  "Chỉ phạt khi có": "Only punish with",
  "Chọn emoji": "Choose emoji",
  "Chọn kênh": "Choose channel",
  "Ngôn ngữ cho log": "Log language",
  "Chỉ đổi nhãn bot tự sinh trong log (kiểu ban, kick, cảnh cáo). Lý do do mod gõ giữ nguyên.":
    "Only changes the labels the bot generates in logs (ban, kick, warn). Reasons typed by moderators stay as written.",
  "Chọn kênh…": "Choose channel…",
  "Chọn loại": "Choose type",
  "Chọn role admin…": "Choose admin role…",
  "Chọn role miễn trừ…": "Choose exempt role…",
  "Chọn role mod…": "Choose mod role…",
  "Chọn role…": "Choose role…",
  "Chọn server": "Choose server",
  "Chọn server để cấu hình auto reply, nhiệt độ, Join Gate, chống nuke và các module bảo vệ.":
    "Pick a server to configure auto-reply, heat, Join Gate, anti-nuke and protection modules.",
  "Chọn server…": "Choose server…",
  "Chống nuke / raid": "Anti-nuke / raid",
  "Chống nuke / raid → Thành viên & quyền": "Anti-nuke / raid → Members & permissions",
  "Chủ bot:": "Bot owner:",
  "Chủ sở hữu": "Owner",
  "Cài đặt server": "Server settings",
  "Cài đặt → Mật khẩu tính năng ẩn": "Settings → Hidden features password",
  "Cách hoạt động:": "How it works:",
  "Có lỗi xảy ra khi kết nối với backend. Trang khác vẫn hoạt động bình thường — bạn có thể chuyển sang mục khác ở sidebar.":
    "Failed to connect to the backend. Other pages still work — you can switch to another sidebar section.",
  "Có thay đổi chưa lưu — bấm Lưu để áp dụng.": "You have unsaved changes — click Save to apply.",
  "Cơ bản": "Basic",
  "Cảnh báo khẩn khi raid/nuke": "Urgent alert on raid/nuke",
  "Chống spam báo cáo khẩn": "Emergency alert spam control",
  "Chỉ gửi cảnh báo khẩn khi đã dồn đủ số sự kiện nuke VÀ đủ khoảng cách từ báo cáo trước — sự kiện trong lúc chờ vẫn được giữ, không mất.":
    "Only send an urgent alert once enough nuke events have piled up AND enough time has passed since the previous report — events raised while waiting are kept, not dropped.",
  "Phút tối thiểu giữa 2 báo cáo": "Minimum minutes between two reports",
  "Sự kiện nuke tối thiểu": "Minimum nuke events",
  "Lưu chính sách": "Save policy",
  "Đã lưu chính sách báo cáo khẩn": "Emergency report policy saved",
  "Cần cấu hình Client ID": "Client ID required",
  "Cập nhật gần nhất": "Last updated",
  "Cập nhật khung giờ ngay bây giờ": "Update the schedule now",
  "Cập nhật tiếp theo": "Next update",
  "Cụm từ mới:": "New phrases:",
  "Cửa sổ (giây)": "Window (seconds)",
  "Cửa sổ (phút)": "Window (minutes)",
  "Cửa sổ Admin": "Admin window",
  "Cửa sổ tái phạm (phút)": "Repeat window (minutes)",
  "DM chào mừng": "Welcome DM",
  "DM chào mừng bật": "Welcome DM on",
  "Danh sách các vụ bot đã chặn khi loạt": "Cases the bot blocked in a burst",
  "Danh sách trắng": "Whitelist",
  "Danh sách tối đa 100 từ": "Up to 100 words",
  "Dán vào API Keys với tên": "Paste it into API Keys as",
  "Dán đường dẫn ảnh hợp lệ (bắt đầu bằng http:// hoặc https://)":
    "Paste a valid image URL (starting with http:// or https://)",
  Dùng: "Use",
  "Dọn tin nhắn": "Message cleanup",
  "Emoji tùy chỉnh": "Custom emoji",
  "File quá lớn (tối đa 8 MB) — hãy nén backup hoặc bỏ bớt media nặng rồi thử lại":
    "File too large (max 8 MB) — compress the backup or drop heavy media and retry",
  "GIỜ VIỆT NAM": "VIETNAM TIME",
  "Ghi chú nhanh": "Quick note",
  "Giao diện": "Appearance",
  "Gist riêng tư": "Private Gist",
  "GitHub của chủ bot": "Bot owner's GitHub",
  "Giá trị": "Value",
  "Giám sát bot": "Bot monitor",
  "Giải thưởng (hiển thị trong embed)": "Prize (shown in the embed)",
  "Giảm nhiệt (điểm/phút)": "Heat decay (points/minute)",
  "Giới hạn file": "File limit",
  "Gặp gỡ trợ lý ảo": "Meet the assistant",
  Gửi: "Send",
  "Gửi DM": "Send DM",
  "Gửi DM chào mừng sau khi verify": "Send a welcome DM after verification",
  "Gửi embed": "Send embed",
  "Gửi panel xác minh vào kênh": "Post the verification panel",
  "Gửi thành công!": "Sent successfully!",
  "Gửi thông báo học tập vào kênh log các server (kết quả lượt học thủ công + digest tuần). MẶC ĐỊNH TẮT — bật khi muốn admin theo dõi bot học được gì ngay trên Discord thay vì mở web.":
    "Post learning notices to servers' log channels (manual-run results + weekly digest). OFF BY DEFAULT — enable it to follow what the bot learns right in Discord instead of opening the web.",
  "Gửi ảnh (jpg/png/webp) hoặc video ≤50MB — Haimiya sẽ xem giúp bạn":
    "Send an image (jpg/png/webp) or video ≤50MB — Haimiya will take a look",
  "Gửi ảnh hoặc video": "Send image or video",
  "Hai lớp phòng thủ:": "Two layers of defence:",
  "Haimiya gợi ý": "Haimiya suggests",
  "Haimiya — trợ lý ảo đáng tin cậy": "Haimiya — your reliable assistant",
  "Hoạt động chống nuke gần đây": "Recent anti-nuke activity",
  "Hoạt động trong 3 bước": "Works in 3 steps",
  "Hoặc dán đường dẫn ảnh": "Or paste an image URL",
  "Hình phạt": "Punishments",
  "Hình phạt khi tăng cấp": "Punishment on escalation",
  "Hình phạt thành viên": "Member punishment",
  "Hình thức xử lý": "Action type",
  "Hôm nay chơi gì @protogon?": "What are we playing today @protogon?",
  "Hôm nay chơi gì?": "What are we playing today?",
  "Hôm nay lúc 00:00": "Today at 00:00",
  "Hệ thống nhiệt độ vi phạm": "Violation heat system",
  "Hỏi Haimiya": "Ask Haimiya",
  "Hỏi thử Haimiya ngay": "Ask Haimiya now",
  Hủy: "Cancel",
  "ID người dùng": "User ID",
  "ID người dùng không hợp lệ (15–20 chữ số)": "Invalid user ID (15–20 digits)",
  "ID này đã có trong danh sách trắng": "This ID is already whitelisted",
  "JOIN GATE — TỰ ĐỘNG CHẶN SELFBOT": "JOIN GATE — AUTO-BLOCK SELFBOTS",
  "Join Gate chống selfbot": "Join Gate anti-selfbot",
  "Join Gate — cổng vào server": "Join Gate — server entry gate",
  "Khi bật, bot tải tin an ninh công khai (Reddit security, CISA KEV) mỗi giờ, học từ khóa scam mới và dùng MIỄN PHÍ vĩnh viễn trong bộ lọc link độc hại. Từ khóa sai có thể bấm xóa bên dưới. Chi phí: gần như 0 — không cần key thêm.":
    "When on, the bot fetches public security feeds (Reddit security, CISA KEV) hourly, learns new scam keywords and uses them FREE forever in the malicious-link filter. Remove wrong keywords below. Cost: near zero — no extra key needed.",
  "Khi bật, mỗi khi bot gặp lỗi runtime (unhandled rejection / uncaught exception), lỗi + đoạn code liên quan được gửi cho AI (Mimo V2.5 qua Kira — free 30M tokens/ngày riêng cho việc học) để chẩn đoán nguyên nhân và đề xuất bản vá dạng diff. KẾT QUẢ CHỈ LÀ ĐỀ XUẤT đăng vào kênh log — bot không tự sửa code, không tự restart. Cùng 1 lỗi chỉ chẩn đoán 1 lần/giờ.":
    "When on, every runtime error the bot hits (unhandled rejection / uncaught exception) is sent to AI (Mimo V2.5 via Kira — 30M free tokens/day dedicated to learning) for a root-cause diagnosis and a diff-style patch suggestion. THE RESULT IS ONLY A SUGGESTION posted to the log channel — the bot never edits its own code or restarts. The same error is diagnosed at most once per hour.",
  "Khi module dùng hình phạt": "When a module uses a punishment",
  "Khi đăng nhập, Protogon cần quyền": "On sign-in, Protogon needs the",
  "Khung giờ cập nhật": "Update schedule",
  "Khóa kênh khi bị raid": "Lock channels during a raid",
  "Khóa lại": "Lock again",
  "Khôi phục emoji / sticker": "Restore emoji / stickers",
  "Khôi phục kênh (danh mục, văn bản, thoại…)": "Restore channels (categories, text, voice…)",
  "Khôi phục role (tên, màu, quyền, thứ tự)": "Restore roles (name, colour, permissions, order)",
  "Khôi phục thất bại: {p0}": "Restore failed: {p0}",
  "Khôi phục tin nhắn + media": "Restore messages + media",
  "Khôi phục từ file backup của bot nuke (.msc / .json)":
    "Restore from a nuke bot's backup file (.msc / .json)",
  "Khôi phục từ file thất bại: {p0}": "Restore from file failed: {p0}",
  "Không ai đang nóng đầu cả — server đang rất bình yên.":
    "Nobody is running hot — your server is calm.",
  "Không có quyền truy cập": "No access",
  "Không cấp role": "Grant no role",
  "Không ghi nhận sự cố trong phiên này — hệ thống ổn định ✅":
    "No incidents this session — the system is stable ✅",
  "Không gửi tin nhắn": "Send no message",
  "Không kết nối được máy chủ": "Cannot reach the server",
  "Không lưu đăng nhập": "Don't remember sign-in",
  "Không phát hiện lỗi nào — bot hoạt động bình thường ✅":
    "No errors found — the bot is running normally ✅",
  // Sự cố "lặp đăng nhập" 06/10/2026: câu cũ ("hãy thử nút Tải lại hoặc Đăng nhập
  // lại") khiến người dùng tưởng phiên đã hỏng phải đăng nhập lại — trong khi
  // danh sách server hiện tại vẫn dùng bình thường, chỉ là lượt làm mới im lặng
  // bị Discord từ chối. Nói rõ "không sao" thay vì đòi đăng nhập.
  "Không làm mới được danh sách server (Discord từ chối làm mới im lặng). Bạn vẫn dùng bình thường — chỉ bấm “Tải lại” khi cần.":
    "Couldn't refresh the server list (Discord declined the silent refresh). Everything still works — just hit “Reload” when you need it.",
  "Không thể truy cập server này": "Cannot access this server",
  "Không thể truy cập server này — bạn không có quyền quản lý.":
    "Cannot access this server — you lack manage permissions.",
  "Không thể đọc dữ liệu — bạn không có quyền quản lý server này.":
    "Cannot read data — you lack manage permissions on this server.",
  "Không tìm thấy emoji phù hợp.": "No matching emoji found.",
  "Không tìm thấy trang này": "Page not found",
  "Không tải được nội dung mục này": "Couldn't load this section",
  "Kick/Ban thành viên": "Kick/Ban members",
  "Kênh gửi giveaway": "Giveaway channel",
  "Kênh gửi tin nhắn": "Message channel",
  "Kênh hiển thị embed xác minh. Thành viên mới chỉ thấy kênh này.":
    "The channel showing the verification embed. New members only see this channel.",
  "Kênh log chung": "Shared log channel",
  "Kênh xác minh": "Verification channel",
  "Loại kích hoạt": "Trigger type",
  "Loại sự kiện nhận log": "Event types to log",
  "Lý do": "Reason",
  "Lưu ý: bản ghi sự cố được ghi nhận trong phiên xem này (mất kết nối máy chủ, độ trễ quá cao). Để theo dõi xuyên suốt, hãy giữ trang này mở hoặc kiểm tra kênh log trong Discord.":
    "Note: incident records cover this viewing session (server disconnects, excessive latency). To track continuously, keep this page open or check the log channel in Discord.",
  "Lưu đăng nhập": "Remember sign-in",

  // ── D–G ──
  "Lượt chạy gần nhất:": "Last run:",
  "Lượt chẩn đoán gần nhất:": "Last diagnosis:",
  "Lần backup trước": "Previous backup",
  "Lần cuối:": "Last:",
  "Lần khôi phục trước": "Previous restore",
  "Lần thử trước": "Previous attempt",
  "Lịch sử chống nuke": "Anti-nuke history",
  "Lọc từ ngữ xấu": "Bad-word filter",
  "Lời chúc mừng riêng khi gửi DM người thắng (tùy chọn)":
    "Custom congratulation in the winner DM (optional)",
  "Miễn trừ hoàn toàn khỏi mọi module chống nuke.": "Fully exempt from every anti-nuke module.",
  "Moderation — thông báo sau khi phạt": "Moderation — post-punishment notice",
  "Module đang bảo vệ": "Modules protecting",
  Màu: "Colour",
  "Màu embed": "Embed colour",
  "Máy chủ đang gặp sự cố 🌸": "The server is having trouble 🌸",
  "Mô tả / nội dung chính...": "Description / main content...",
  "Mẫu tin nhắn giveaway": "Giveaway message template",
  "Mật khẩu mới": "New password",
  "Mật khẩu tính năng ẩn 🔒": "Hidden features password 🔒",
  "Mật khẩu tính năng ẩn…": "Hidden features password…",
  "MẶC ĐỊNH — tự động": "DEFAULT — automatic",
  "Mọi thành viên": "Everyone",
  "Trọn bộ trong một bot": "A full toolkit in one bot",
  Mỗi: "Every",
  "Mỗi backup tạo một": "Each backup creates a",
  "Mời bot": "Invite the bot",
  "Mời bot vào server": "Invite the bot to your server",
  "Mời thêm": "Invite more",
  "Mở Discord": "Open Discord",
  "Mở Discord server": "Open Discord server",
  "Mở dashboard": "Open dashboard",
  "Mở khóa": "Unlock",
  "Mở khóa ngay": "Unlock now",
  "Mức an toàn của server": "Server safety level",
  "N ngày": "N days",
  "NHIỆT ĐỘ VI PHẠM — THÀNH VIÊN “dang_spam”": "VIOLATION HEAT — MEMBER “dang_spam”",
  "Nguyên tắc ưu tiên": "Priority rules",
  Nguồn: "Source",
  "Người dùng bị xử lý": "Users handled",
  "Người dùng đã bị xử lý": "Users handled",
  "Người dùng được miễn trừ": "Exempt users",
  "Người thực hiện": "Moderator",
  "Ngưỡng ban": "Ban threshold",
  "Ngưỡng kick": "Kick threshold",
  "Ngưỡng tạm khóa": "Timeout threshold",
  "Ngưỡng warn": "Warn threshold",
  "Nhiệt cao nhất:": "Highest heat:",
  "Nhiệt · Warn": "Heat · Warns",
  "Nhận signature từ server khác": "Receive signatures from other servers",
  Nhập: "Enter",
  "Nhập Discord Webhook URL": "Enter a Discord Webhook URL",
  "Nhập ID người dùng Discord…": "Enter a Discord user ID…",
  "Nhập nội dung trả lời": "Enter the reply content",
  "Nhập tên rule": "Enter the rule name",
  "Nhập từ ngữ cần chặn…": "Enter words to block…",
  "Nhập ít nhất một từ khóa": "Enter at least one keyword",
  "Nhập đúng ID người dùng Discord (15-20 chữ số)": "Enter a valid Discord user ID (15–20 digits)",
  "Nhật ký sự cố chi tiết": "Detailed incident log",
  "Những ID người dùng này": "These user IDs",
  Nén: "Compressed",
  "Nội dung / mô tả": "Content / description",
  "Nội dung embed": "Embed content",
  "Nội dung kèm (template)": "Attached content (template)",
  "Nội dung tin nhắn": "Message content",
  "Nội dung tin nhắn (tùy chọn — gửi cùng embed)":
    "Message content (optional — sent with the embed)",
  "Nội dung tin nhắn Discord...": "Discord message content...",
  "Nội dung trả lời": "Reply content",

  // ── P–S ──
  "Phân quyền": "Permissions",
  "Phòng thủ 32 module": "32 defence modules",
  "Phương thức xác minh": "Verification method",
  "Ping @everyone khi cảnh báo khẩn": "Ping @everyone on urgent alerts",
  "Prefix lệnh": "Command prefix",
  "Prefix · kênh log · phân quyền · bảo mật · giao diện":
    "Prefix · log channels · permissions · security · appearance",
  "Preset bảo mật 1 chạm": "One-tap security preset",
  "Protogon không kết nối được với máy chủ dữ liệu (backend Convex đang trả lỗi). Trang web sẽ hoạt động lại ngay khi máy chủ khỏe — bạn có thể thử tải lại.":
    "Protogon can't reach the data server (the Convex backend is erroring). The site works again as soon as the server recovers — try reloading.",
  "Quyền quản lý server không đủ để mở khóa mục này.":
    "Manage Server permission is not enough to unlock this section.",
  "Quên mật khẩu? Vào Cài đặt để đặt lại (chỉ chủ sở hữu bot).":
    "Forgot the password? Reset it in Settings (bot owner only).",
  "Quản lý bot Discord của bạn từ một nơi": "Manage your Discord bot from one place",
  "Quản lý server": "Manage servers",
  "Raid Intel — săn nguồn cơn raid 🎯": "Raid Intel — hunt the raid's source 🎯",
  "Raid bằng ứng dụng ngoài": "External-app raid",
  "Role chưa xác minh (Unverified)": "Unverified role",
  "Role miễn trừ": "Exempt role",
  "Role đã xác minh (Verified)": "Verified role",
  "Role được miễn trừ": "Exempt roles",
  "Sao chép": "Copy",
  "Seed bí mật (dòng bất kỳ, ví dụ: chuỗi ngẫu nhiên)":
    "Secret seed (any line, e.g. a random string)",
  "Self-Diagnose — bot tự dò lỗi": "Self-Diagnose — the bot finds its own bugs",
  "Server của bạn": "Your server",
  "Server hiện tại": "Current server",
  "Server khác": "Other server",
  "Server quản lý": "Managed servers",
  "Soạn Embed": "Compose embed",
  "Săn lùng nguồn cơn raid": "Hunt the raid's source",
  "Sẵn sàng để Haimiya": "Ready for Haimiya",
  "Số người thắng": "Number of winners",
  "Số server đang dùng bot": "Servers using the bot",
  "Sử dụng tài khoản Discord để quản lý các server của bạn":
    "Use your Discord account to manage your servers",
  "Sửa bảng": "Edit panel",
  "Sự cố": "Incidents",
  "Sự cố / lỗi": "Incidents / errors",
  "Threat Intel — bot tự học": "Threat Intel — the bot learns",
  "Threat relay liên server": "Cross-server threat relay",
  "Thumbnail (ảnh nhỏ, tùy chọn)": "Thumbnail (small image, optional)",
  "Thành viên": "Members",
  "Thành viên sở hữu role này được bỏ qua toàn bộ kiểm tra moderation, anti-raid và anti-nuke của":
    "Members with this role skip all moderation, anti-raid and anti-nuke checks of",
  Thêm: "Add",
  "Thêm cặp emoji/role": "Add emoji/role pairs",
  "Thêm rule": "Add rule",
  rule: "rule",
  "Thêm server": "Add server",
  "Thống kê nhiệt độ 🔥": "Heat statistics 🔥",
  "Thời gian": "Time",
  "Thời gian khóa (phút)": "Lock duration (minutes)",
  "Thời lượng": "Duration",
  "Thử lại": "Retry",
  "Timeout · kick · ban · warn · purge — ghi kèm":
    "Timeout · kick · ban · warn · purge — recorded with",
  "Tin nhắn trực tiếp từ Protogon": "Direct message from Protogon",
  "Tiêu đề embed": "Embed title",
  "Top 10 thành viên bị cảnh báo nhiệt độ vi phạm":
    "Top 10 members with the highest violation heat",
  "Trang trước": "Previous page",
  "Trung bình": "Average",
  "Trò chuyện với Haimiya": "Chat with Haimiya",
  "Trạng thái bot": "Bot status",
  "Trợ lý ảo của Protogon — giải đáp về bot, nhiệt độ, tính năng ẩn":
    "Protogon's assistant — answers about the bot, heat and hidden features",
  "Tuổi tối thiểu (ngày)": "Minimum age (days)",
  Tên: "Name",
  "Tên Discord…": "Discord name…",
  "Tên bảng": "Panel name",
  "Tên field": "Field name",
  "Tên giveaway": "Giveaway name",
  "Tên rule": "Rule name",
  "Tên tác giả": "Author name",
  "Tìm emoji hoặc chủ đề…": "Search emoji or topic…",
  "Tìm theo tên thủ phạm": "Search by offender name",
  "Tích hợp": "Integrations",
  "Tính năng ẩn — dành riêng admin sở hữu bot": "Hidden features — for the bot-owning admin only",
  "Tính năng ẩn 🔒": "Hidden features 🔒",
  "Tùy chỉnh": "Customisation",
  "Tùy chỉnh Webhook Log": "Customise log webhook",
  "Tùy chỉnh giao diện bot": "Customise the bot's appearance",
  "Tùy chỉnh giao diện chỉ dành cho": "Appearance customisation is available only to",
  "Tùy chỉnh khôi phục": "Restore options",
  "Tạm khóa (giây)": "Timeout (seconds)",
  "Tạo bot tại Discord Developer Portal": "Create a bot on the Discord Developer Portal",
  "Tạo bảng mới": "New panel",
  "Tạo giveaway": "Create giveaway",
  "Tạo giveaway mới": "Create a new giveaway",
  "Tạo lại role, quyền role và kênh của backup này trong server hiện tại":
    "Recreate this backup's roles, permissions and channels on the current server",
  "Tạo webhook": "Create webhook",
  "Tải lên & khôi phục": "Upload & restore",
  "Tải lại": "Reload",
  "Tải lại danh sách backup": "Reload backup list",
  "Tải lại danh sách server (server mới mời bot sẽ hiện ra)":
    "Reload the server list (newly invited servers appear)",
  "Tải lại trang": "Reload page",
  "Tải nguồn mở mỗi giờ (0 token) · AI ≤ 1 lần/tuần":
    "Fetches open sources hourly (0 tokens) · AI ≤ once a week",
  "Tất cả kênh": "All channels",
  "Tất cả module": "All modules",
  "Tổng lượt:": "Total runs:",
  "Tổng thành viên": "Total members",
  "Từ file": "From file",
  "Từ khóa (phân cách bằng dấu phẩy)": "Keywords (comma-separated)",
  "Từ khóa mới lượt trước:": "New keywords last run:",
  "Từ khóa trong tin nhắn": "Keywords in messages",
  "Từ ngày": "From date",
  "Tự ban nghi phạm nguồn cơn": "Auto-ban the source suspect",
  "Tự ban tài khoản đủ điểm nghi vấn (chủ mưu, trùng avatar…).":
    "Auto-bans accounts scoring high enough (mastermind, matching avatars…).",
  "Tự khôi phục theo ảnh chụp gần nhất. Tắt nếu bạn tự dọn và tạo lại kênh — snapshot cũ có thể hồi lại những thứ bạn đã bỏ.":
    "Restores from the latest snapshot. Turn this off if you clean up and recreate channels yourself — an old snapshot can bring back things you removed.",
  "Tự động backup định kỳ": "Automatic scheduled backups",
  "Tự động:": "Automatic:",
  "URL khi nhấn tên": "URL when the name is clicked",
  "VD: 1 tháng Nitro Boost 🚀": "e.g. 1 month of Nitro Boost 🚀",
  "VD: Bấm emoji bên dưới để nhận role tương ứng 🌸":
    "e.g. React below to get the matching role 🌸",
  "VD: Chào bạn, bạn đã thắng giải thưởng của server chúng mình 🎁":
    "e.g. Hi! You won our server's prize 🎁",
  "VD: Chào mừng đến với server! Tham gia ngay để có cơ hội nhận…":
    "e.g. Welcome to the server! Join now for a chance to win…",
  "VD: Chọn game của bạn 🎮": "e.g. Pick your game 🎮",
  "VD: Nitro 1 tháng": "e.g. 1 month of Nitro",
  "VD: Xin chúc mừng! Bạn là người may mắn nhất…": "e.g. Congratulations! You're the lucky winner…",
  "Vào dashboard": "Open dashboard",
  "Về trang chủ": "Back to home",
  "Vụ đã chặn": "Cases blocked",
  "Warn tích lũy (tăng cấp hình phạt)": "Accumulated warns (escalating punishment)",
  "Whitelist của server này": "This server's whitelist",
  "Xem lịch sử": "View history",
  "Xem trước": "Preview",
  "Xem trước DM chào mừng": "Preview the welcome DM",
  "Xác minh thành viên (Verify)": "Member verification (Verify)",
  "Xóa bảng": "Delete panel",
  "Xóa bộ lọc": "Clear filter",
  "Xóa cụm từ học sai": "Remove a mis-learned phrase",
  "Xóa mật khẩu": "Delete password",
  "Xóa tin phát hiện": "Delete the detected message",
  "Xóa toàn bộ nhiệt": "Clear all heat",
  "Xóa tìm kiếm": "Clear search",
  "Xóa từ khóa học sai": "Remove a mis-learned keyword",
  "Xóa ảnh": "Remove image",
  "Yêu cầu có avatar riêng": "Require a custom avatar",
  "Yêu cầu có huy hiệu tài khoản": "Require an account badge",
  "Yêu cầu khôi phục đã được xử lý": "Restore request processed",
  "Yêu cầu role để tham gia (tùy chọn)": "Required role to enter (optional)",
  "Yêu cầu đã được xử lý xong": "Request processed",
  "admin sở hữu bot": "the bot-owning admin",
  "bot gửi sau khi phạt — kể cả": "the bot posts after punishing — including",
  "bot gửi sau khi đã trừng phạt thành viên vi phạm — đồng bộ cả kênh lẫn mức chi tiết, theo từng hành động ban · timeout · warn · kick (cả tự động lẫn lệnh thủ công).":
    "the bot posts after punishing a violating member — both the channel and the detail level are configurable per action ban · timeout · warn · kick (automatic and manual commands).",
  "chặn link độc hại & file nguy hiểm": "blocks malicious links & dangerous files",
  "chỉ dọn tin": "cleanup only",
  "chủ sở hữu bot": "the bot owner",
  "chứa file JSON cấu trúc server — bạn không cần tạo repo, không tốn bộ nhớ GitHub. Chỉ cần":
    "holds the server structure JSON — no repo to create, no GitHub storage used. Just",
  "cùng trợ lý Haimiya": "with the Haimiya assistant",
  "cả backup của Protogon": "including Protogon backups",
  "của họ. Nếu token chưa được cấu hình, phần GitHub bị bỏ qua và bot chỉ lưu trong Convex.":
    "of theirs. If no token is configured, the GitHub part is skipped and the bot stores in Convex only.",
  "của ứng dụng": "of the app",
  "duy nhất": "unique",
  "embed moderation kiểu Carl-bot": "Carl-bot style moderation embeds",
  "file backup của bot nuke": "a nuke bot's backup file",
  "giờ Việt Nam": "Vietnam time",
  "hello, xin chào, chào": "hello, hi, hey",
  "hoặc ID emoji.": "or an emoji ID.",
  "https://… (đường dẫn ảnh)": "https://… (image URL)",
  "hỗ trợ bạn quản lý server?": "help you manage your server?",
  "khi khởi động (xác minh token Discord thật) — không cần thao tác gì thêm.":
    "on startup (it verifies the real Discord token) — nothing else to do.",
  "không bị": "won't get",
  "không cho bot đọc": "does not let the bot read",
  "không cần tự dán token": "no need to paste a token",
  "không ảnh hưởng đến các server khác": "doesn't affect other servers",
  "kick hoặc ban": "kick or ban",
  kênh: "channel",
  "kênh xác minh": "verification channel",
  "kẻ chủ mưu": "the mastermind",
  "luôn được vào": "always allowed in",
  "lấy tên thành viên.": "fetch the member's name.",
  một: "one",
  "mới 2 ngày": "only 2 days old",
  "mức an toàn của server": "the server's safety level",
  "ngay lập tức.": "immediately.",
  ngày: "days",
  "nhiệt độ 4 giai đoạn": "4-stage heat",
  "như trong file, phục hồi": "as in the file, restoring",
  "nhận diện định dạng": "detect the format",
  "nếu file có lưu.": "if the file saved them.",
  "role + kênh đúng thứ tự": "roles + channels in the right order",
  "role chưa xác minh": "the unverified role",
  "role đã xác minh": "the verified role",
  "rồi khôi phục lại từ backup.": "then restore from a backup.",
  "sau khi bạn": "after you",
  "server này": "this server",
  "server phụ": "the backup server",
  "thất bại": "failed",
  "thủ công": "manual",
  "tin nhắn": "messages",
  "trong Cài đặt.": "in Settings.",
  "trong phiên này": "this session",
  "trước khi server sụp đổ": "before the server went down",
  "tăng cấp": "escalates",
  "tại server này": "on this server",
  "tạm khóa": "timeout",
  "tạm khóa 40": "timeout 40",
  "tạo lại emoji/sticker": "recreate emoji/stickers",
  tắt: "off",
  "từ khóa": "keywords",
  "tự cấp phát chìa khóa an toàn": "issues a secure key itself",
  "tự động": "automatic",
  "và cấu hình cơ bản (prefix, từ ngữ xấu, role mod/admin, kênh log).":
    "and basic config (prefix, bad words, mod/admin roles, log channels).",
  "với embed tùy chỉnh đến thành viên đã xác minh.": "with a custom embed to verified members.",
  "với nút / phản ứng để xác minh.": "with a button / reaction to verify.",
  "· chọn 1": "· choose 1",
  "· chọn nhiều, kết hợp được": "· multi-select, combinable",
  "· đã gửi DM cảnh báo ⚠️": "· warning DM sent ⚠️",
  "Đang chọn:": "Selected:",
  "Đang chờ bot mở khóa…": "Waiting for the bot to unlock…",
  "Đang chờ bot xử lý file — bot quét mỗi ~20 giây, server lớn có thể mất 1-2 phút. Lỗi (nếu có) sẽ hiện ngay tại đây.":
    "Waiting for the bot to process the file — it polls every ~20s; large servers may take 1–2 minutes. Any error appears right here.",
  "Đang kiểm tra phiên đăng nhập…": "Checking your session…",
  "Đang kết nối…": "Connecting…",
  "Đang lọc kết quả": "Filtering results",
  "Đang thu thập dữ liệu… (cần ít nhất 2 mẫu)": "Collecting data… (needs at least 2 samples)",
  "Đang tải lên…": "Uploading…",
  "Đang tải lịch sử…": "Loading history…",
  "Đang tải…": "Loading…",
  "Thiếu CONVEX_URL cho production build": "Missing CONVEX_URL for the production build",
  "Đăng nhập thất bại, vui lòng thử lại.": "Sign-in failed. Please try again.",
  "Đang xác thực với Discord…": "Authenticating with Discord…",
  "Quá nhiều lượt đăng nhập — thử lại sau ít phút":
    "Too many sign-in attempts — try again in a few minutes",
  "Chưa cấu hình redirect_uri cho phép trên deployment":
    "No allowed redirect URI is configured for this deployment",
  "Địa chỉ callback không được phép — kiểm tra cấu hình OAuth":
    "Callback address is not allowed — check the OAuth configuration",
  "Mã OAuth hoặc PKCE không hợp lệ": "Invalid OAuth code or PKCE verifier",
  "Không kết nối được tới Discord — thử lại sau ít phút":
    "Cannot connect to Discord — try again in a few minutes",
  "Discord không trả dữ liệu hợp lệ — thử lại": "Discord returned invalid data — try again",
  "Trao đổi mã đăng nhập với Discord thất bại": "Could not exchange the sign-in code with Discord",
  "Không ghi được phiên đăng nhập — thử lại": "Could not save the sign-in session — try again",
  "DISCORD_CLIENT_ID chưa được cấu hình trên deployment":
    "DISCORD_CLIENT_ID is not configured for this deployment",
  "Đang yêu cầu…": "Requesting…",
  "Điều hướng": "Navigation",
  "Điều hướng bảng điều khiển": "Dashboard navigation",
  'Đã cập nhật rule "{p0}"': 'Updated rule "{p0}"',
  "Đã hủy giveaway": "Giveaway cancelled",
  "Đã khóa kênh": "Channels locked",
  "Đã làm mới danh sách server": "Server list refreshed",
  "Đã lưu cài đặt hệ thống nhiệt độ": "Heat system settings saved",
  "Đã lưu cài đặt khóa kênh": "Channel lock settings saved",
  "Đã lưu cài đặt warn tích lũy": "Accumulated warn settings saved",
  "Đã lưu tùy chỉnh khôi phục": "Restore options saved",
  "Đã lưu webhook log": "Log webhook saved",
  "Đã lưu — bot áp dụng trong vòng ~3 phút": "Saved — applied within ~3 minutes",
  "Đã mở khóa tính năng ẩn 🔓": "Hidden features unlocked 🔓",
  'Đã thêm "{p0}"': 'Added "{p0}"',
  "Đã thêm {p0} ID — bấm Lưu để áp dụng": "Added {p0} IDs — click Save to apply",
  'Đã tạo rule "{p0}"': 'Created rule "{p0}"',
  'Đã tải "{p0}" lên — bot đang xử lý': 'Uploaded "{p0}" — the bot is processing',
  'Đã xóa "{p0}"': 'Deleted "{p0}"',
  "Đã xóa bảng (tin nhắn cũ trong Discord vẫn còn)":
    "Panel deleted (the old Discord message remains)",
  "Đã xóa mật khẩu tính năng ẩn": "Hidden features password deleted",
  "Đã xóa nhiệt của {p0}": "Cleared heat for {p0}",
  "Đã xóa toàn bộ nhiệt độ vi phạm": "Cleared all violation heat",
  "Đã yêu cầu mở khóa — bot thực hiện trong vài giây":
    "Unlock requested — the bot does it in seconds",
  "Đã áp dụng sắc độ mới": "New shade applied",
  "Đã đặt mật khẩu": "Password set",
  "Đã đặt mật khẩu tính năng ẩn": "Hidden features password set",
  Đóng: "Close",
  "Đóng góp signature (khi bị raid)": "Contribute signatures (when raided)",
  "Đăng nhập": "Sign in",
  "Đăng nhập thất bại": "Sign-in failed",
  "Đăng nhập vào Protogon": "Sign in to Protogon",
  "Đăng xuất": "Sign out",
  "Đường dẫn bạn mở không tồn tại hoặc đã bị đổi. Kiểm tra lại liên kết, hoặc quay về một trong hai trang dưới đây.":
    "The link you opened doesn't exist or has changed. Check it again, or head back to one of the pages below.",
  "Đến ngày": "To date",
  "Đồng thời đẩy lên GitHub (Gist riêng tư)": "Also push to GitHub (private Gist)",
  "Độ trễ hiện tại": "Current latency",
  "Độ trễ · tốc độ phản hồi · trạng thái server — không hiển thị tên server":
    "Latency · response speed · server status — server names are never shown",
  "Độ tương phản của server": "Server contrast",
  "đang bị khóa kênh": "is under channel lock",
  "đang chạy": "running",
  "đám mây GitHub": "the GitHub cloud",
  "đã tắt": "off",
  "đăng lại media": "re-upload media",
  "đặt trong tab": "set in the tab",
  "để bot tiếp tục chặn.": "so the bot keeps blocking.",
  "để chỉnh cấu hình.": "to configure it.",
  "để hiển thị server bạn quản lý. Chúng tôi không lưu mật khẩu hay tin nhắn của bạn.":
    "to show the servers you manage. We never store your password or messages.",
  "để đặt mật khẩu đầu tiên — người đó sẽ trở thành chủ sở hữu bot.":
    "to set the first password — that person becomes the bot owner.",
  "đủ bằng chứng độc lập": "enough independent evidence",
  "Ảnh nền embed (tùy chọn)": "Embed background image (optional)",
  "Ứng dụng ngoài được kết nối": "External apps connected",
  "— Chọn kênh —": "— Choose channel —",
  "— Chọn role —": "— Choose role —",
  "— Dùng kênh log chung —": "— Use the shared log channel —",
  "— Không cấp role —": "— Grant no role —",
  "— Không dùng —": "— None —",
  "— Mọi thành viên —": "— Everyone —",
  "— mọi server dùng chung, các owner server khác không phải cấu hình gì. Số bản backup giữ lại theo quy tắc Giữ bản bên dưới (mặc định 3 bản mới nhất).":
    "— shared by all servers; other owners configure nothing. How many backups are kept follows the Keep backups rule below (3 most recent by default).",
  "— đóng trình duyệt sẽ phải đăng nhập lại": "— closing the browser means signing in again",
  "• Bot cần quyền": "• The bot needs the",
  "• Bot gửi": "• The bot posts",
  "• Bot gửi embed trong": "• The bot posts an embed in",
  "• Giờ hiển thị theo": "• Times shown in",
  "• Hỗ trợ: author (tên + avatar + link), title, description, color hex, fields (tên + giá trị + inline), image, thumbnail, footer + icon, timestamp.":
    "• Supports: author (name + avatar + link), title, description, colour hex, fields (name + value + inline), image, thumbnail, footer + icon, timestamp.",
  "• Không hiển thị tên server — chỉ hiện số lượng để bảo mật.":
    "• Server names are never shown — only counts, for privacy.",
  "• Mỗi server có độ tương phản riêng trong Cài đặt.":
    "• Each server has its own contrast setting in Settings.",
  "• Nuke/raid phạt trực tiếp, không cộng nhiệt.":
    "• Nuke/raid punishments are direct, no heat added.",
  "• Sau khi xác minh → gỡ role chưa xác minh, gán":
    "• After verification → remove the unverified role, grant",
  "• Thay đổi áp dụng trong ~3 phút.": "• Changes apply in ~3 minutes.",
  "• Thành viên mới vào server → tự động nhận": "• New members joining → automatically receive",
  "• Trang Cửa sổ Admin (chỉ chủ sở hữu bot) chia sẻ khung giờ cập nhật này và theo dõi lỗi chi tiết hơn.":
    "• The Admin window page (bot owner only) shares this update schedule and tracks errors in more detail.",
  "• Vào Discord → Kênh cần gửi →": "• In Discord → target channel →",
  "• 🔒 Tính năng ẩn — khu vực riêng tư, chỉ chủ sở hữu bot mở khóa bằng mật khẩu.":
    "• 🔒 Hidden features — a private area only the bot owner unlocks with a password.",
  "• 🛠️ Lệnh mod: /mod timeout · kick · ban · purge + !timeout !kick !ban !purge — mọi hình phạt hiện trong mục Hình phạt.":
    "• 🛠️ Mod commands: /mod timeout · kick · ban · purge + !timeout !kick !ban !purge — every punishment appears in the Punishments section.",
  "ℹ️ Ghi chú": "ℹ️ Note",
  "← Về danh sách server": "← Back to server list",
  "← Về trang chủ": "← Back to home",
  "→ bot không gửi embed nhưng dashboard vẫn ghi nhận case. Embed xóa tin / purge luôn đầy đủ.":
    "→ the bot posts no embed but the dashboard still records the case. Delete/purge embeds are always complete.",
  "⏳ chờ bot gửi": "⏳ waiting for the bot",
  "⏸️ Tạm khóa (timeout)": "⏸️ Timeout",
  "☁️ Đám mây GitHub": "☁️ GitHub cloud",
  "⚠️ Bot không gửi được panel xác minh": "⚠️ The bot couldn't post the verification panel",
  "⚠️ DM gần nhất thất bại": "⚠️ The last DM failed",
  "⚠️ Lượt học gần nhất thất bại": "⚠️ The last learning run failed",
  "⚠️ lỗi gửi": "⚠️ send error",
  "⚠️ Đang ở chế độ": "⚠️ Currently in",
  "⚡ bot tự động": "⚡ automatic by the bot",
  "🌸 Chào mừng bạn!": "🌸 Welcome!",
  "🎖️ Role tự cấp cho người thắng (tùy chọn)": "🎖️ Role auto-granted to winners (optional)",
  "💌 DM người thắng": "💌 Winner DM",
  "💡 Hướng dẫn nhanh:": "💡 Quick guide:",
  "💡 Lệnh nhanh:": "💡 Quick commands:",
  "💡 Đây chính là embed": "💡 This is exactly the embed",
  "📌 Lưu ý quan trọng": "📌 Important note",
  "🔑 Captcha — nhập mã từ DM": "🔑 Captcha — enter the code from the DM",
  "🔒 Khóa kênh khi raid:": "🔒 Channel lock during raids:",
  "🔒 Mã hóa": "🔒 Encrypted",
  "🔒 Quyền riêng tư": "🔒 Privacy",
  "🔒 Server của bạn": "🔒 Your server",
  "🔥 Thành viên có nhiệt độ cao nhất": "🔥 Members with the highest heat",
  "🖐️ Học thủ công": "🖐️ Learn manually",
  "🖱️ Button — bấm nút xác minh": "🖱️ Button — click to verify",
  "🛠️ lệnh thủ công của mod": "🛠️ manual mod commands",
  "🛡️ Anti Nuke / Raid — phạt trực tiếp": "🛡️ Anti Nuke / Raid — direct punishment",
  "🛡️ Khi bị nuke/raid phá sập": "🛡️ When a nuke/raid takes it down",
  "🧹 Moderation nội dung — cộng nhiệt + warn": "🧹 Content moderation — heat + warns",

  /* ==== i18n-ai-health ==== Đợt 12: panel Sức khỏe AI trong cửa sổ Admin
     (chỉ owner). Chuỗi trạng thái + nhãn số liệu. */
  "Sức khỏe AI": "AI health",
  "Bot tổng hợp mỗi phút · chỉ chủ bot nhìn thấy":
    "Bot reports every minute · visible to the bot owner only",
  "Hoạt động": "Operational",
  "Không khả dụng": "Unavailable",
  "Bot đang offline hoặc mất kết nối Convex — số liệu AI tạm dừng cập nhật.":
    "Bot is offline or disconnected from Convex — AI metrics paused.",
  "Provider:": "Providers:",
  nghỉ: "resting",
  "Gọi AI/phút:": "AI calls/min:",
  "Verdict 1 giờ:": "Verdicts 1h:",
  "từ cache": "from cache",
  "Phạt nhầm 7 ngày:": "Wrongful punishments 7d:",
  raid: "raid",
  "cá biệt": "individual",
  "lành tính": "benign",
  offline: "offline",
  "Đang nghỉ tạm:": "Currently cooling down:",
  "≥5 phạt nhầm đã xác nhận — AI đang tự siết độ tin cậy (bias giảm nhẹ + nhắc thận trọng trong prompt).":
    "≥5 confirmed wrongful punishments — the AI is self-tightening its confidence (slight bias cut + caution reminder in the prompt).",
  "Đang kiểm tra phiên đăng nhập": "Checking your session",
  "Mặc định": "Default",
  "Không thể làm mới danh sách server": "Could not refresh the server list",
  "Protogon giúp bảo vệ server Discord với auto-reply, hệ thống nhiệt độ 4 giai đoạn, Join Gate chống selfbot, chặn link độc hại và 32 module chống nuke/raid.":
    "Protogon protects Discord servers with auto-replies, a four-stage heat system, Join Gate anti-selfbot, malicious-link blocking, and 32 anti-nuke/raid modules.",
  "Điều khoản sử dụng bot Protogon và bảng điều khiển web cho cộng đồng Discord.":
    "Terms for using the Protogon Discord bot and web dashboard for Discord communities.",
  "Chính sách quyền riêng tư và cách Protogon xử lý dữ liệu người dùng.":
    "Privacy policy and how Protogon handles user data.",
  "Thông tin lưu trữ, thời hạn và quy trình yêu cầu xoá dữ liệu của Protogon.":
    "Protogon retention information and the process for requesting data deletion.",
  "Theo dõi trạng thái, độ trễ và số liệu vận hành của bot Protogon theo thời gian thực.":
    "Live Protogon bot status, latency, and operational metrics.",
  "Đăng nhập an toàn bằng Discord để quản lý các server của bạn trên Protogon.":
    "Securely sign in with Discord to manage your servers on Protogon.",
  "Quản lý cấu hình bảo vệ và tự động hóa cho các server Discord của bạn.":
    "Manage protection settings and automation for your Discord servers.",
  "Theo dõi thành viên có nhiệt độ vi phạm cao trong các server bạn quản lý.":
    "Track members with the highest violation heat across servers you manage.",
  "Khu vực quản trị dành riêng cho chủ sở hữu bot Protogon.":
    "Administration area reserved for the Protogon bot owner.",
  "Đang xác thực Discord — Protogon": "Authenticating with Discord — Protogon",
  "Đang hoàn tất đăng nhập Discord an toàn với Protogon.":
    "Completing secure Discord sign-in with Protogon.",
  "Không dùng CONVEX_URL localhost trong production build":
    "Do not use a localhost CONVEX_URL in a production build",
  Xóa: "Remove",
  "CONVEX_URL không hợp lệ hoặc không nằm trong allowlist":
    "CONVEX_URL is invalid or is not allowlisted",
  /* ==== onboarding checklist (W1) ==== */
  "Ch\u1ecdn k\u00eanh nh\u1eadn log s\u1ef1 ki\u1ec7n": "Pick an event log channel",
  "M\u1ecdi c\u1ea3nh b\u00e1o nuke/raid, h\u00ecnh ph\u1ea1t v\u00e0 backup \u0111\u1ec1u c\u1ea7n k\u00eanh log \u0111\u1ec3 b\u1ea1n nh\u00ecn th\u1ea5y.":
    "Nuke/raid alerts, punishments and backups all need a log channel so you can see them.",
  "B\u1eadt l\u1eddi ch\u00e0o th\u00e0nh vi\u00ean m\u1edbi": "Turn on member greetings",
  "Bot t\u1ef1 ch\u00e0o ng\u01b0\u1eddi v\u00e0o server \u2014 l\u00e0m server th\u00e2n thi\u1ec7n ngay t\u1eeb gi\u00e2y \u0111\u1ea7u.":
    "The bot greets newcomers automatically \u2014 a friendly server from the first second.",
  "T\u1ea1o rule auto reply \u0111\u1ea7u ti\u00ean": "Create your first auto-reply rule",
  'Th\u1eed kh\u1ed1i "Th\u1eed rule" ngay trong panel \u0111\u1ec3 xem bot s\u1ebd tr\u1ea3 l\u1eddi g\u00ec tr\u01b0\u1edbc khi l\u01b0u.':
    "Use the \u201cTry rules\u201d box in the panel to see what the bot will reply before saving.",
  "B\u1eadt Join Gate ch\u1ed1ng acc \u1ea3o": "Turn on Join Gate to stop fake accounts",
  "L\u1ecdc acc m\u1edbi l\u1eadp b\u1eb1ng tu\u1ed5i t\u00e0i kho\u1ea3n / avatar tr\u01b0\u1edbc khi v\u00e0o \u0111\u01b0\u1ee3c server.":
    "Filter freshly-made accounts by account age / avatar before they can join.",
  "B\u1eadt backup t\u1ef1 \u0111\u1ed9ng \u0111\u1ec3 ch\u1ed1ng nuke":
    "Enable automatic backups against nukes",
  "Snapshot role/k\u00eanh \u0111\u1ecbnh k\u1ef3 \u2014 b\u1ecb nuke l\u00e0 kh\u00f4i ph\u1ee5c l\u1ea1i trong v\u00e0i ph\u00fat.":
    "Periodic role/channel snapshots \u2014 after a nuke, restore takes minutes.",
  "Thi\u1ebft l\u1eadp server trong 5 b\u01b0\u1edbc": "Set up your server in 5 steps",
  "L\u00e0m xong m\u1ed7i b\u01b0\u1edbc l\u00e0 t\u1ef1 chuy\u1ec3n xanh \u2014 bot s\u1eb5n s\u00e0ng canh server.":
    "Each step turns green automatically once done \u2014 then your bot is on guard.",
  "Ti\u1ebfn \u0111\u1ed9 thi\u1ebft l\u1eadp": "Setup progress",
  "C\u1ea5u h\u00ecnh": "Set up",
  "C\u1ea5u h\u00ecnh m\u1edbi t\u1edbi bot sau kho\u1ea3ng 1 ph\u00fat qua Convex.":
    "New settings reach the bot within about a minute via Convex.",
  /* ==== autoreply try-out (W3) ==== */
  "Th\u1eed rule \u2014 g\u00f5 tin nh\u1eafn m\u1eabu": "Try rules \u2014 type a sample message",
  "v\u00ed d\u1ee5: m\u1ecdi ng\u01b0\u1eddi \u01a1i hello!": "e.g. hey everyone, hello!",
  "Tin nh\u1eafn c\u00f3 tag bot": "Message mentions the bot",
  "K\u00eanh": "Channel",
  "Bot s\u1ebd kh\u00f4ng tr\u1ea3 l\u1eddi (kh\u00f4ng c\u00f3 n\u1ed9i dung).":
    "The bot will not reply (no content).",
  'Bot tr\u1ea3 l\u1eddi b\u1eb1ng rule "{p0}":': 'The bot replies with rule "{p0}":',
  "{p0} rule kh\u00e1c c\u0169ng kh\u1edbp \u2014 bot ch\u1ec9 tr\u1ea3 l\u1eddi rule \u0111\u1ea7u ti\u00ean.":
    "{p0} other rule(s) also match \u2014 the bot only replies with the first one.",
  "Kh\u00f4ng rule n\u00e0o kh\u1edbp \u2014 bot im l\u1eb7ng.":
    "No rule matches \u2014 the bot stays silent.",
  "Gi\u00e3n c\u00e1ch (cooldown) \u00e1p d\u1ee5ng tr\u00ean Discord th\u1eadt n\u00ean kh\u00f4ng t\u00ednh trong b\u1ea3n th\u1eed n\u00e0y.":
    "Cooldowns apply on real Discord and are not simulated in this preview.",
  /* ==== features page (/features) ==== */
  "Bot th\u00f4ng th\u01b0\u1eddng": "Typical bots",
  "T\u00ednh n\u0103ng \u2014 Protogon: bot Discord t\u1ef1 tr\u1ea3 l\u1eddi & ch\u1ed1ng nuke/raid":
    "Features \u2014 Protogon: Discord auto-reply & anti-nuke bot",
  "To\u00e0n b\u1ed9 t\u00ednh n\u0103ng c\u1ee7a bot Discord Protogon: t\u1ef1 tr\u1ea3 l\u1eddi theo t\u1eeb kho\u00e1, h\u1ec7 th\u1ed1ng nhi\u1ec7t \u0111\u1ed9 4 giai \u0111o\u1ea1n, Join Gate, 32 module ch\u1ed1ng nuke/raid v\u00e0 backup server.":
    "Every Protogon Discord bot feature: keyword auto-replies, a four-stage heat system, Join Gate, 32 anti-nuke/raid modules, and full server backup & restore.",
  /* ==== Ticket / khiếu nại (27/09/2026) ==== */
  "Ticket — kênh riêng cho thành viên và ban quản trị":
    "Tickets — a private channel per member and moderator",
  "Mỗi lượt mở tạo một kênh riêng để thành viên hỏi đáp, báo cáo chuyện gì, hoặc khiếu nại khi bị phạt oan.":
    "Each open ticket creates its own channel so members can ask a question, report something, or appeal a punishment.",
  "Đang bật · {p0} đang mở": "Enabled · {p0} open",
  "Bật tính năng ticket": "Enable tickets",
  "Thành viên dùng lệnh /ticket trong server, hoặc bấm nút trong tin nhắn riêng nếu đã bị ban. Bot cần quyền Quản lý kênh.":
    "Members use /ticket in the server, or press the button in the DM they received if they are banned. The bot needs Manage Channels.",
  "Đã bật ticket": "Tickets enabled",
  "Đã tắt ticket": "Tickets disabled",
  "⚠️ Chưa chọn danh mục chứa ticket — thành viên sẽ không mở được ticket cho tới khi bạn chọn bên dưới.":
    "⚠️ No ticket category selected — members cannot open tickets until you pick one below.",
  "Danh mục chứa kênh ticket": "Category for ticket channels",
  "Đã cập nhật danh mục ticket": "Ticket category updated",
  "Chọn danh mục…": "Choose a category…",
  "— Chưa chọn —": "— Not selected —",
  "Server chưa có danh mục nào — tạo một danh mục trong Discord trước.":
    "This server has no category yet — create one in Discord first.",
  "Kênh ticket sẽ được tạo tự động bên trong danh mục này.":
    "Ticket channels are created automatically inside this category.",
  "Role xử lý ticket": "Role that handles tickets",
  "Kênh dán panel mở ticket": "Channel for the ticket panel",
  "Chọn kênh công khai…": "Choose a public channel…",
  "Đã chọn kênh dán panel — bot sẽ gửi trong ~2 phút":
    "Panel channel picked — the bot will post it in about 2 minutes",
  "Thành viên bấm nút trong kênh này để tự mở ticket — không cần gõ lệnh /ticket. Chọn kênh xong bot tự dán trong ~2 phút.":
    "Members tap a button in this channel to open a ticket — no /ticket command needed. The bot posts the panel within about 2 minutes of your choice.",
  "⚠️ Bot không dán được panel mở ticket": "⚠️ The bot could not post the ticket panel",
  '— hãy sửa lỗi rồi bấm "Gửi lại panel"': '— fix it, then hit "Send panel again"',
  "Gửi lại panel mở ticket vào kênh": "Send the ticket panel again",
  "Đã yêu cầu bot dán panel mở ticket!": "Asked the bot to post the ticket panel!",
  "Đã cập nhật role xử lý ticket": "Ticket role updated",
  "— Dùng role mod —": "— Use the mod role —",
  "Hiện tại: {p0}": "Currently: {p0}",
  "Chưa chọn — bot dùng role mod của server ({p0}). Chọn riêng khi người xử lý ticket khác người làm mod.":
    "Not selected — the bot uses the server's mod role ({p0}). Pick a separate one when ticket handlers differ from moderators.",
  "chưa có role mod nào": "no mod role set",
  "Loại ticket mặc định": "Default ticket type",
  "Đã đổi loại ticket mặc định": "Default ticket type changed",
  "Hỗ trợ chung — hỏi đáp, báo cáo bất kỳ chuyện gì":
    "General support — ask a question, report anything",
  "Khiếu nại — dành cho người bị phạt oan": "Appeal — for members who think a punishment was wrong",
  "Thành viên vẫn chọn được loại khác khi gõ lệnh. Loại này chỉ là mặc định khi họ không chọn.":
    "Members can still pick another type when using the command. This is only the default when they don't choose.",
  "Giới hạn chống spam": "Spam limits",
  "Không có giới hạn thì 1 người có thể spam hàng trăm kênh trong một đêm và làm chạm trần 500 kênh của Discord.":
    "Without limits, one person can spam hundreds of channels in a night and hit Discord's 500 channel cap.",
  "Tối đa ticket đang mở ({p0})": "Max open tickets ({p0})",
  "Đã cập nhật giới hạn": "Limit updated",
  "Chờ giữa 2 lượt mở ({p0} giờ)": "Cooldown between openings ({p0} h)",
  "Đã cập nhật thời gian chờ": "Cooldown updated",
  "Gửi tin nhắn riêng cho người bị ban": "DM banned members",
  "Kèm lý do ban và nút mở khiếu nại. Không có bước này, người bị ban không biết bot có lệnh gỡ ban.":
    "Sends the ban reason plus an appeal button. Without this, banned members don't know an unban command exists.",
  "Sẽ gửi DM sau khi ban": "Will DM after a ban",
  "Không gửi DM sau khi ban": "No DM after a ban",
  "Ghi chú khi đóng ticket (tuỳ chọn)": "Closing note (optional)",
  "VD: Ticket đã được xử lý, cảm ơn bạn đã liên hệ.":
    "e.g. Ticket handled — thanks for reaching out.",
  "Đã lưu ghi chú": "Note saved",
  "Đang mở": "Open",
  "Đã đóng": "Closed",
  "Đã đóng ticket #{p0}": "Ticket #{p0} closed",
  "Đóng ticket thất bại": "Could not close the ticket",
  "Không có ticket nào đang mở.": "No open tickets.",
  "Chưa có ticket nào đã đóng.": "No closed tickets yet.",
  "Lỗi mở kênh: {p0}": "Could not create the channel: {p0}",
  "Đóng bởi {p0}": "Closed by {p0}",
  " · đã gỡ ban": " · unbanned",
  "Mở kênh": "Open channel",
  "Khiếu nại": "Appeal",
  "Hỗ trợ chung": "General support",
  "Ticket & Khiếu nại": "Tickets & appeals",

  /* ==== ticket: tu dong lam sach, phan cong, /language ==== */
  "Tự động dọn & phân công": "Automatic cleanup & assignment",
  "Kênh ticket không ai trả lời sẽ tự đóng. Khi đóng đủ lâu, bot lưu toàn bộ nội dung rồi mới xoá kênh — không bao giờ xoá trước khi lưu.":
    "A ticket channel with no replies closes itself. After it stays closed long enough, the bot saves the full conversation and only then deletes the channel — it never deletes before saving.",
  "Tự đóng sau (giờ không ai chat)": "Auto-close after (hours without a reply)",
  "0 = tắt. Tối đa 720 giờ (30 ngày). Mặc định 24 giờ.":
    "0 = off. Max 720 hours (30 days). Default 24 hours.",
  "Giữ kênh sau khi đóng (giờ)": "Keep the channel after closing (hours)",
  "Sau khoảng này bot lưu transcript rồi xoá kênh. Tối thiểu 1 giờ.":
    "After this, the bot saves the transcript and deletes the channel. Minimum 1 hour.",
  "Đã lưu thời gian giữ kênh": "Channel keep time saved",
  "Nội dung panel trong kênh ticket (tuỳ chọn)": "Panel text inside the ticket channel (optional)",
  "Chào {user}! Kênh này dành riêng cho bạn — staff sẽ phản hồi sớm.":
    "Hi {user}! This channel is just for you — staff will reply soon.",
  "Đã lưu nội dung panel": "Panel text saved",
  "Có thể dùng: {user} tên người mở, {number} số ticket, {kind} loại, {idle} giờ tự đóng. Bỏ trống thì dùng mặc định.":
    "Available: {user} opener name, {number} ticket number, {kind} type, {idle} auto-close hours. Leave empty to use the default.",
  "Tag role khi mở ticket (tối đa 3)": "Tag a role when a ticket opens (max 3)",
  "Role này được nhắc mỗi khi có ticket mới. Để trống nếu không muốn ai bị tag.":
    "This role gets pinged whenever a new ticket opens. Leave empty to ping nobody.",
  "Chưa có role nào trong server.": "This server has no roles yet.",
  "Đã lưu role được tag": "Ping roles saved",
  "Đã lưu thời gian tự đóng": "Auto-close time saved",
  "Đã tắt tự đóng": "Auto-close turned off",
  "Đã có người nhận": "Claimed",
  "Chờ nhận": "Unclaimed",
  "Transcript đã lưu": "Transcript saved",

  /* ==== ticket: tuy chinh panel mo + loi dan + DM ==== */
  "Tuỳ chỉnh panel mở ticket": "Customize the ticket panel",
  "Sửa tiêu đề, màu và nội dung panel thành viên thấy trước khi bấm nút. Bot tự dán lại trong khoảng 2 phút và xoá bản cũ — không cần bấm gì thêm.":
    "Change the title, color and text members see before tapping a button. The bot reposts within about 2 minutes and deletes the old panel — nothing else to click.",
  "Tiêu đề panel (tuỳ chọn)": "Panel title (optional)",
  "Cần trợ giúp?": "Need help?",
  "Đã lưu tiêu đề panel": "Panel title saved",
  "Màu panel": "Panel color",
  "Chọn màu panel": "Pick a panel color",
  "Đã về màu mặc định": "Back to the default color",
  "Nội dung panel mở (tuỳ chọn)": "Open panel text (optional)",
  "Bấm nút bên dưới, kể lại vấn đề của bạn. {server} đang có {open} ticket chờ.":
    "Tap the button below and tell us what happened. {server} has {open} tickets waiting.",
  "Đã lưu nội dung panel mở": "Open panel text saved",
  "Dùng được: {server} tên server, {open} số ticket đang mở, {support} tên nút Hỗ trợ. Bỏ trống thì dùng nội dung mặc định.":
    "Available: {server} server name, {open} number of open tickets, {support} the Support button label. Leave empty to use the default text.",
  'Hiện nút "Khiếu nại hình phạt"': 'Show the "Appeal a punishment" button',
  "Tắt nếu server bạn không dùng hình phạt — thành viên chỉ thấy một nút Hỗ trợ.":
    "Turn this off if your server has no punishments — members then only see the Support button.",
  "Đã hiện nút Khiếu nại": "Appeal button shown",
  "Đã ẩn nút Khiếu nại": "Appeal button hidden",
  "Lời dặn dán ở đầu kênh ticket (tuỳ chọn)":
    "Note posted at the top of the ticket channel (optional)",
  "Chào {user}! Bạn đang ở ticket #{number} của {server}. Staff phản hồi trong 24 giờ.":
    "Hi {user}! You're in ticket #{number} of {server}. Staff replies within 24 hours.",
  "Đã lưu lời dặn đầu kênh": "Channel note saved",
  "Dán TRƯỚC nội dung khiếu nại, cho cả người mở lẫn staff đọc. Dùng được: {user} tên người mở, {number} số ticket, {server} tên server.":
    "Posted BEFORE the request text, read by both the opener and staff. Available: {user} opener name, {number} ticket number, {server} server name.",
  "Gửi DM cho người mở ticket": "DM the ticket opener",
  "DM kèm link thẳng tới kênh ticket vừa tạo. Người đã tắt tin nhắn riêng sẽ không nhận được — ticket vẫn mở bình thường.":
    "Sends a DM with a direct link to the new ticket channel. People with DMs off won't get it — the ticket still opens normally.",
  "Sẽ DM khi mở ticket": "Will DM on ticket open",
  "Không DM khi mở ticket": "No DM on ticket open",
  "Đã lưu màu panel": "Panel color saved",
  "Mã hex 6 chữ số, ví dụ #5865f2. Ô trống = màu mặc định của bot.":
    "A 6-digit hex code, e.g. #5865f2. Leave empty to use the bot's default color.",
  // ── Xem transcript (tab "Đã lưu trữ") — 28/09/2026 ──
  "Đã lưu trữ": "Archived",
  "Chưa có ticket nào đã lưu trữ.": "No archived tickets yet.",
  "Xem transcript": "View transcript",
  "Transcript ticket #{p0}": "Ticket #{p0} transcript",
  "Đang tải transcript…": "Loading transcript…",
  "Chưa có transcript cho ticket này.": "This ticket has no transcript yet.",
  "Transcript rỗng — kênh không có tin nhắn nào.":
    "Empty transcript — the channel had no messages.",
  "Tải file JSON": "Download JSON",
  // ── Số liệu SLA (28/09/2026) ──
  "Số liệu xử lý ticket": "Ticket handling stats",
  "Chỉ tính ticket đã có người nhận hoặc đã đóng. Phản hồi đầu tính từ lúc mở tới lúc staff bấm “Nhận việc”.":
    "Only counts tickets that were claimed or closed. First response is measured from when the ticket opened until staff pressed “Claim”.",
  "Ticket trong kỳ": "Tickets in period",
  "Chờ phản hồi đầu": "First response",
  "Thời gian xử lý": "Time to resolve",
  "Đóng mà không ai nhận": "Closed unclaimed",
  "Khiếu nại được gỡ ban": "Appeals unbanned",
  "{p0} phút": "{p0} min",
  "{p0} giờ": "{p0} h",
  "{p0}%": "{p0}%",
  "7 ngày": "7 days",
  "30 ngày": "30 days",
  "90 ngày": "90 days",
  "{p0} khiếu nại trong kỳ, {p1} kết thúc bằng gỡ ban.":
    "{p0} appeal(s) in this period, {p1} ended in an unban.",
  "{p0} tệp đính kèm": "{p0} attachments",

  "Đã bật toàn bộ auto-mod nội dung": "Enabled all content auto-mod",
  "Đã tắt toàn bộ auto-mod nội dung": "Disabled all content auto-mod",
  "Đang kiểm duyệt nội dung": "Content moderation is on",
  "⚠️ Auto-mod đang tắt toàn bộ — link mời, link độc hại, từ ngữ xấu, file nguy hiểm và spam đều không bị chặn.":
    "⚠️ Content auto-mod is fully off — invite links, malicious links, bad words, dangerous files and spam are not blocked.",

  "Không đọc được transcript": "Could not read the transcript",

  /* ==== Loại ticket tuỳ chỉnh (29/09/2026) ==== Xem i18n.de.ts ==== */
  "Mã loại chỉ gồm chữ thường, số, _ hoặc - (tối đa 32 ký tự).":
    "The kind code may only contain lowercase letters, digits, _ or - (max 32 characters).",
  "Cần có tên hiển thị trên nút.": "A label for the button is required.",
  'Đã cập nhật loại ticket "{p0}"': 'Updated ticket type "{p0}"',
  'Đã thêm loại ticket "{p0}"': 'Added ticket type "{p0}"',
  'Đã xoá loại ticket "{p0}"': 'Deleted ticket type "{p0}"',
  "Loại ticket": "Ticket types",
  "Mỗi loại là 1 nút trên panel, 1 câu hỏi riêng trong modal và có thể có role xử lý riêng. Xoá hết thì bot quay về 2 loại mặc định.":
    "Each type is one panel button, one question in the modal, and can have its own staff roles. Deleting them all brings back the two defaults.",
  "Thêm loại": "Add type",
  "Chưa có loại tuỳ chỉnh — bot đang dùng 2 loại mặc định: Hỗ trợ chung và Khiếu nại hình phạt.":
    "No custom types yet — the bot is using the two defaults: General support and Appeal a punishment.",
  "{p0} role riêng": "{p0} own roles",
  "Đổi danh sách xong bấm “Gửi lại panel mở ticket” để thay nút trên kênh công khai. Tối đa 10 loại.":
    'After changing the list, hit "Send the ticket panel again" to replace the buttons in the public channel. Up to 10 types.',
  'Chỉnh sửa loại "{p0}"': 'Edit type "{p0}"',
  "Thêm loại ticket": "Add ticket type",
  "Mã loại (tiếng Anh, không dấu)": "Type code (lowercase, no accents)",
  "Mã nằm trong nút nên không đổi sau khi tạo. Ticket đã mở vẫn tra được loại này.":
    "The code is part of the button, so it cannot change after creation. Already open tickets still resolve to this type.",
  "Tên trên nút": "Button label",
  "Hoá đơn & thanh toán": "Billing & payments",
  "Emoji (tuỳ chọn)": "Emoji (optional)",
  "Mô tả ngắn (tuỳ chọn)": "Short description (optional)",
  "Câu hỏi trong modal": "Question in the modal",
  "Bạn cần hỏi gì về hoá đơn?": "What do you need to ask about billing?",
  "Bỏ trống thì dùng câu hỏi mặc định. Tối đa 45 ký tự.":
    "Leave empty to use the default question. Max 45 characters.",
  "Gợi ý trong ô nhập (tuỳ chọn)": "Input placeholder (optional)",
  "Câu hỏi ô bằng chứng (tuỳ chọn)": "Evidence question (optional)",
  "Role xử lý riêng cho loại này": "Staff roles for this type",
  "Bỏ trống thì dùng role xử lý ticket chung đã cấu hình ở trên.":
    "Leave empty to use the server-wide ticket staff role configured above.",
  "Bật loại ticket này": "Enable this ticket type",
  "Đưa lên trên": "Move up",
  "Đưa xuống dưới": "Move down",
  "Sửa loại ticket này": "Edit this ticket type",
  "Xoá loại ticket này": "Delete this ticket type",
  "Ô nhập bổ sung (tối đa 3)": "Extra input fields (up to 3)",
  "Thêm ô": "Add field",
  "Mỗi ô là 1 câu hỏi thêm trong modal mở ticket. 2 ô nội dung và bằng chứng đã có sẵn nên chỉ thêm được 3 ô nữa.":
    "Each field is one extra question in the ticket modal. The message and evidence fields already exist, so only 3 more fit.",
  "Chưa thêm ô nào.": "No extra fields yet.",
  "Tiêu đề ô": "Field label",
  "Mã ô (tiếng Anh, không dấu)": "Field code (lowercase, no accents)",
  "Bắt buộc nhập": "Required",
  "Ô nhiều dòng": "Multi-line field",
  "Xoá ô này": "Remove this field",
  "Mẫu kênh ticket": "Ticket channel template",
  "Mỗi kênh ticket mở ra sẽ theo mẫu này. Bỏ trống mọi ô thì bot dùng cách cũ: tên ticket-<số>, chỉ staff và người mở nhìn thấy.":
    "Every ticket channel follows this template. Leave everything blank to keep the old behaviour: named ticket-<number>, visible only to staff and the opener.",
  "Mẫu tên kênh": "Channel name template",
  "Dùng được:": "Available:",
  "số ticket,": "ticket number,",
  "tên người mở,": "opener name,",
  "loại. Tự động bỏ dấu và ký tự lạ.":
    "type. Accents and odd characters are stripped automatically.",
  "Slowmode trong kênh ticket (giây)": "Slowmode in ticket channels (seconds)",
  "0 = không có. Tối đa 21600 giây (6 giờ).": "0 = off. Max 21600 seconds (6 hours).",
  "Ngân sách tin nhắn mỗi kênh": "Message budget per channel",
  "Vượt thì bot tự đóng kênh (nội dung đã lưu trước). 0 = không giới hạn. Dùng để chặn 1 người spam rồi bỏ mặc.":
    "When exceeded the bot closes the channel (the transcript is saved first). 0 = unlimited. Stops one member from spamming a channel and walking away.",
  "Cho @everyone nhìn thấy kênh ticket": "Let @everyone see ticket channels",
  "Tắt (mặc định) là chỉ staff và người mở thấy — khiếu nại mà ai đọc được thì người dùng không dám kêu. Bật nếu server muốn ticket công khai kiểu diễn đàn.":
    "Off (default) means only staff and the opener can see it — an appeal anyone can read is an appeal nobody files. Turn it on if you want a public forum-style ticket.",
  "Tạo danh mục con riêng cho từng loại ticket": "Create a separate category per ticket type",
  "Kênh ticket sẽ nằm trong danh mục con theo loại, thay vì dồn thẳng vào danh mục đã chọn.":
    "Ticket channels go into a per-type sub-category instead of piling into the category you picked.",
  "Đã lưu mẫu tên kênh": "Channel name template saved",
  "Đã lưu slowmode": "Slowmode saved",
  "Đã lưu ngân sách tin nhắn": "Message budget saved",
  "Đã lưu quyền xem kênh ticket": "Ticket channel visibility saved",
  "Đã lưu cách chia danh mục": "Category layout saved",

  // ── Bộ chọn trang + trang Ủng hộ / Premium ──
  Menu: "Menu",
  "Trang chủ": "Home",
  "Thống kê": "Stats",
  "Khám phá": "Explore",
  "Tài khoản": "Account",
  "Ủng hộ": "Support",
  "Ủng hộ nhà phát triển": "Support the developer",
  "Gói Premium": "Premium plans",
  Mới: "New",
  "Giữ cho Protogon mở cửa miễn phí": "Keep Protogon free and open",
  "Protogon được một người duy trì, chi phí máy chủ và thời gian đều tự bỏ ra. Mọi tính năng đều miễn phí và sẽ luôn miễn phí — quyền góp của bạn giúp bot có thêm tháng độ ổn định, không phải để mở khoá tính năng.":
    "Protogon is maintained by one person, who pays for the server and the time out of pocket. Every feature is free and always will be — your support buys the bot more uptime, not a feature unlock.",
  "Ủng hộ qua Discord": "Support via Discord",
  "Xem gói Premium": "See premium plans",

  // ── Trang Góp ý (/feedback) ──
  "Góp ý": "Feedback",
  "Phản hồi của bạn": "Your feedback",
  "Góp ý cho Protogon": "Send feedback about Protogon",
  "Bạn gặp lỗi, thiếu tính năng, hay chỉ muốn góp ý? Gửi ở đây — góp ý đi thẳng tới người làm bot, không cần tài khoản Discord và không ai khác đọc được.":
    "Found a bug, missing a feature, or just want to say something? Send it here — feedback goes straight to the bot's developer, needs no Discord account, and nobody else can read it.",
  "Loại góp ý": "Feedback type",
  "Báo lỗi": "Bug report",
  "Bot hoặc web làm sai điều gì đó": "The bot or the website did something wrong",
  "Đề xuất tính năng": "Feature request",
  "Bạn muốn bot làm được thêm gì": "Something you wish the bot could do",
  "Góp ý chung": "General comment",
  "Cảm nhận, câu hỏi, hoặc lời cảm ơn": "Impressions, questions, or a thank-you",
  "Mô tả càng rõ càng tốt: bạn đang làm gì, thấy gì, và mong đợi điều gì.":
    "The more detail the better: what you were doing, what you saw, and what you expected.",
  "Cần ít nhất {p0} ký tự.": "At least {p0} characters needed.",
  "{p0}/{p1} ký tự": "{p0}/{p1} characters",
  "Email (không bắt buộc)": "Email (optional)",
  "Điền nếu bạn muốn mình phản hồi lại — bỏ trống vẫn gửi được.":
    "Fill this in if you want a reply — you can leave it empty.",
  "Gửi góp ý": "Send feedback",
  "Đang gửi…": "Sending…",
  "Không gửi được góp ý — thử lại sau ít phút nhé.":
    "Could not send your feedback — please try again in a few minutes.",
  "Hệ thống vừa nhận quá nhiều góp ý — bạn thử lại sau ít phút nhé, hoặc nhắn trực tiếp trong Discord.":
    "The system just received too much feedback — please try again in a few minutes, or message directly on Discord.",
  "Email chưa đúng dạng — bỏ trống cũng được nếu bạn không cần phản hồi.":
    "That email doesn't look right — leave it empty if you don't need a reply.",
  "Không cần đăng nhập. Mình không chia sẻ góp ý của bạn cho ai khác.":
    "No sign-in needed. I don't share your feedback with anyone else.",
  "Đã nhận góp ý của bạn": "Your feedback has been received",
  "Cảm ơn bạn! Mình đọc hết góp ý và sẽ trả lời qua email nếu bạn có để lại địa chỉ.":
    "Thank you! I read every message and will reply by email if you left an address.",
  "Gửi thêm góp ý": "Send more feedback",
  "Vào Discord để trao đổi trực tiếp": "Join Discord to talk directly",
  "Muốn trao đổi trực tiếp?": "Want to talk it through?",
  "Nếu bạn cần trả lời gấp hoặc muốn cả cộng đồng cùng bàn, vào Discord — kênh hỗ trợ có người theo dõi.":
    "If you need a quick answer, or want the community to weigh in, join Discord — the support channel is monitored.",
  "Vào Discord": "Join Discord",
  "Ủng hộ trực tiếp bằng mã QR": "Support directly with a QR code",
  "Không cần đăng nhập, không qua cổng thanh toán: mở app ngân hàng hoặc ví điện tử của bạn, quét mã rồi chuyển số tiền bạn muốn. Tiền vào thẳng ví nhà phát triển.":
    "No sign-in and no payment gateway: open your banking or wallet app, scan the code and send whatever amount you like. The money goes straight to the developer's wallet.",
  "Quét được bằng ZaloPay, MoMo, VietQR và app ngân hàng bất kỳ":
    "Works with ZaloPay, MoMo, VietQR and any banking app",
  "Chủ ví: NGUYEN DUY KHIEM — kiểm tra đúng tên trước khi chuyển":
    "Account holder: NGUYEN DUY KHIEM — check that the name matches before sending",
  "Ủng hộ qua QR là quà tặng cá nhân, không tự mở khoá Premium. Cần xác nhận thì nhắn trong Discord.":
    "A QR donation is a personal gift and does not unlock Premium by itself. Message us on Discord if you need confirmation.",
  "Mã QR nhận ủng hộ của NGUYEN DUY KHIEM": "Donation QR code of NGUYEN DUY KHIEM",
  "Quét mã bằng app chuyển tiền bất kỳ": "Scan the code with any money transfer app",
  "Chọn mức tùy khả năng": "Pick whatever feels comfortable",
  "Đây chỉ là gợi ý. Mọi mức đều được chào đón, kể cả một lời cảm ơn.":
    "These are suggestions only. Every amount is welcome, including a simple thank-you.",
  "Quyền góp giúp được gì": "What your support pays for",
  "Nói thẳng: quyền góp KHÔNG tạo ra tính năng độc quyền và không xoá được quảng cáo. Nó giữ cho bot có máy chủ và có người trực sửa lỗi.":
    "Straight talk: support does not unlock exclusive features and does not remove ads. It keeps the server running and someone on hand to fix bugs.",
  "Giúp theo cách khác": "Other ways to help",
  "Tham gia cộng đồng Discord": "Join the Discord community",
  "Báo lỗi, xin tính năng, hoặc chỉ để chào": "Report bugs, request features, or just say hi",
  "Theo dõi trên Facebook": "Follow on Facebook",
  "Cập nhật khi có phiên bản mới": "Updates when a new version ships",
  "Trả phí để bot có thêm sức làm việc": "Pay to give the bot more room to work",
  "Gói Miễn phí luôn ở đó và không bao giờ bị cắt bớt. Premium chỉ mở thêm tiện ích cho server cần nhiều hơn — và là cách duy nhất để duy trì bot trong dài hạn.":
    "The free plan stays and is never trimmed down. Premium only adds extras for servers that need more — and it is the only way to keep the bot running long term.",
  "Được nhiều người chọn": "Most popular",
  "Đăng ký qua Discord": "Sign up via Discord",
  // ── Điểm cấu hình (panel Tổng quan, đợt #4) ──
  "Điểm cấu hình": "Configuration score",
  "Đã bật đủ các lớp bảo vệ chính.": "All main protection layers are enabled.",
  "lớp bảo vệ chưa bật": "protection layers not enabled yet",
  "Xem chi tiết": "See details",
  "Thu gọn": "Collapse",
  "Mở panel": "Open panel",
  Tốt: "Good",
  "Cần xem lại": "Needs review",
  "Chưa bật chống nuke": "Anti-nuke is off",
  "Không có lớp phòng thủ đầu tiên khi bị raid: bot sẽ không chặn mass ban, mass role hay xoá kênh hàng loạt.":
    "No first line of defence during a raid: the bot will not stop mass bans, mass role changes or mass channel deletions.",
  "Chưa chọn kênh nhận log": "No log channel selected",
  "Mọi cảnh báo nuke, hình phạt và kết quả backup đều cần kênh log — không có kênh log thì bot xử lý xong mà bạn không thấy gì.":
    "Every nuke alert, punishment and backup result needs a log channel — without one the bot acts and you never see it.",
  "Chưa bật backup tự động": "Automatic backup is off",
  "Bị nuke hoặc xoá nhầm mà không có bản backup gần nhất thì khôi phục gần như không thể.":
    "Getting nuked or deleting something by mistake is almost impossible to recover from without a recent backup.",
  "Chưa bật auto-mod nội dung": "Content auto-mod is off",
  "Link độc, spam và từ cấm sẽ tới tận người dùng trước khi mod kịp xử lý.":
    "Malicious links, spam and banned words reach members before a moderator can react.",
  "Chưa bật Join Gate": "Join Gate is off",
  "Tài khoản ảo mới lập lọt vào được server, làm loãng thành viên thật và tốn công xử lý.":
    "Fresh alt accounts walk right in, cluttering real members and costing moderation time.",
  "Chưa bật xác minh thành viên": "Member verification is off",
  "Acc ảo vào là có role ngay, không cần đợi con người duyệt.":
    "Alts get roles immediately, with nobody to approve them.",
  // ── Trang Sự cố: dò thời gian + so sánh kỳ (đợt #4) ──
  "Chi tiết": "Details",
  "Hành động": "Action",
  "Khoảng thời gian": "Duration",
  phút: "min",
  "Thủ phạm": "Perpetrator",
  "Không rõ (sự kiện tự động)": "Unknown (automated event)",
  "Đối tượng bị tác động": "Affected targets",
  "sự cố": "incidents",
  "Hôm nay": "Today",
  "Lượt bị chặn": "Blocked actions",
  "Sự kiện": "Events",
  "không đổi": "no change",
  "so với kỳ trước": "vs previous period",
  "ngày gần nhất so với": "days vs the previous",
  "ngày trước": "days",
  "Ước lượng trên dữ liệu bot còn lưu (tối đa 500 sự kiện mỗi nguồn)":
    "Estimated from the data the bot still stores (max 500 events per source)",
  // ── Thống kê: nhịp 24 giờ + 7 ngày (đợt #4) ──
  "Người vào theo giờ hôm nay": "Joins by hour today",
  "Giờ Việt Nam — bật chống nuke sớm ở khung giờ đông nhất":
    "Vietnam time — turn anti-nuke on ahead of the busiest hours",
  "Người vào 7 ngày gần nhất": "Joins over the last 7 days",
  // ── Admin: hàng đợi việc (đợt #4) ──
  "Hàng đợi việc": "Job backlog",
  "Việc bot được giao · chỉ chủ bot nhìn thấy": "Jobs assigned to the bot · owner only",
  "server kẹt": "stuck guilds",
  "Đang chờ": "Waiting",
  Sạch: "Clear",
  Backup: "Backup",
  "Báo cáo": "Report",
  "Panel xác minh": "Verification panel",
  "Panel ticket": "Ticket panel",
  DM: "DM",
  "Server đang kẹt việc (lâu nhất trước)": "Guilds with stuck jobs (longest waiting first)",
  việc: "jobs",
  "Không có việc nào bị kẹt.": "No stuck jobs.",
  "Chỉ tính việc chờ quá 15 phút — tick bot chạy mỗi 3 phút, quá ngưỡng là đứt mắt xích.":
    "Only counts jobs waiting more than 15 minutes — the bot ticks every 3 minutes, past that the chain is broken.",
  // ── Tra cứu backup / mã khôi phục (đường cứu hộ khi mất quyền server gốc) ──
  "Tra cứu & cứu hộ backup": "Backup lookup & rescue",
  "Xem mã khôi phục của các bản backup bạn đang quản lý":
    "View the restore keys of backups you manage",
  "Mã khôi phục của tôi": "My restore keys",
  "Ẩn mã của tôi": "Hide my keys",
  "Mã khôi phục": "Restore key",
  "Tra cứu": "Look up",
  tin: "msgs",
  "(bản cũ — chưa có mã)": "(older backup — no key yet)",
  "Chưa có bản backup nào — bấm “Backup ngay” để có mã khôi phục.":
    "No backups yet — click “Back up now” to get a restore key.",
  "Hãy lưu mã lại (kèm ảnh chụp hoặc ghi chú) — mất server là mất luôn đường xem lại mã này.":
    "Save the key somewhere safe (screenshot or note) — losing the server means losing your only way to see it again.",
  "Đã mất quyền với server gốc (bị nuke mất role, bị kick, hoặc đã xoá server)? Dán mã khôi phục của bản backup vào đây để dựng lại cấu trúc server đó vào server hiện tại.":
    "Lost access to the original server (nuked out of your roles, kicked, or the server was deleted)? Paste a backup's restore key here to rebuild that server's structure in the current one.",
  "Không tìm thấy bản backup nào với mã này — kiểm tra lại mã, hoặc dùng bản backup mới nhất.":
    "No backup matches this key — double-check it, or use the most recent backup.",
  /* ==== Thanh toán ZaloPay (06/10/2026) ==== /donate + /premium + banner PaymentReturn. */
  "Đang mở ZaloPay…": "Opening ZaloPay…",
  "Ủng hộ {so}": "Donate {so}",
  "Ủng hộ số tiền này": "Donate this amount",
  "Số tiền khác (VND)": "Other amount (VND)",
  "Không tạo được đơn thanh toán — thử lại sau ít phút.":
    "Couldn't create the payment order — try again in a few minutes.",
  "Số tiền phải từ 10.000đ đến 100.000.000đ.": "Amount must be between 10,000₫ and 100,000,000₫.",
  "Thanh toán một lần qua ZaloPay — không lưu thông tin thẻ, không tự động trừ tiền.":
    "One-time payment via ZaloPay — no card details stored, no automatic charges.",
  "Miễn phí vĩnh viễn": "Free forever",
  "Bạn đang có gói cao hơn": "You already have a higher plan",
  "Gia hạn thêm 30 ngày": "Extend by 30 days",
  "Mua bằng ZaloPay": "Buy with ZaloPay",
  "Gói {goi} đang hoạt động — dùng tới {ngay}": "Plan {goi} active until {ngay}",
  "Gói {goi} đã hết hạn {ngay}": "Plan {goi} expired on {ngay}",
  "Thanh toán một lần qua ZaloPay — không tự động gia hạn":
    "One-time payment via ZaloPay — no auto-renewal",
  "Một lần thanh toán cho 30 ngày Premium — không tự động trừ tiền, hết hạn thì mua lại nếu muốn.":
    "One payment covers 30 days of Premium — no automatic charges; buy again after expiry if you want.",
  "Cần giúp trước khi mua?": "Need help before buying?",
  "Nhắn một câu trong Discord — mình trả lời trong 24 giờ, kể cả khi bạn chỉ muốn hỏi Premium làm gì.":
    "Send a message on Discord — I reply within 24 hours, even if you just want to ask what Premium does.",
  "Đang xác nhận thanh toán…": "Confirming payment…",
  "Mã đơn": "Order ID",
  "Thanh toán thành công — cảm ơn bạn!": "Payment successful — thank you!",
  "Đã thanh toán {so}đ qua ZaloPay — gói {goi} đã kích hoạt.":
    "Paid {so}₫ via ZaloPay — the {goi} plan is now active.",
  "Đã thanh toán {so}đ qua ZaloPay. Cảm ơn bạn đã giữ Protogon mở cửa miễn phí.":
    "Paid {so}₫ via ZaloPay. Thank you for keeping Protogon free.",
  "Hoàn tất": "Done",
  "Chưa nhận được xác nhận": "No confirmation yet",
  "ZaloPay chưa báo giao dịch thành công. Nếu bạn ĐÃ thanh toán, quay lại trang này sau vài phút — tiền không bị mất.":
    "ZaloPay hasn't reported a successful transaction yet. If you DID pay, come back to this page in a few minutes — your money is safe.",
  "Thanh toán thất bại": "Payment failed",
  "Giao dịch bị huỷ hoặc không thành công — chưa có khoản tiền nào bị trừ.":
    "The transaction was cancelled or failed — no money was charged.",
  "Đăng nhập lại để kiểm tra đơn": "Sign in again to check this order",
  "Phiên đăng nhập cần thiết để xem trạng thái đơn thanh toán này.":
    "You need to be signed in to see the status of this payment.",
  /* ==== Bộ chọn trang ở HEADER + quản trị viên nhóm (07/10/2026) ====
     Dock nổi góc dưới trái → dải header dính trên đỉnh (components/SiteNav.tsx)
     + cửa sổ Admin mở cho team (convex/hidden.ts: isBotAdminUser). */
  "Về trang chủ Protogon": "Back to the Protogon home page",
  Trang: "Pages",
  "Bảng chọn trang": "Page menu",
  "Chuyển trang": "Switch page",
  "Mở bảng chọn trang": "Open the page menu",
  // Nút chọn giao diện sáng/tối trong bảng chọn trang.
  Sáng: "Light",
  Tối: "Dark",
  "Đóng bảng chọn trang": "Close the page menu",
  "Bot đang chạy": "Bot is running",
  "Bot mất kết nối": "Bot is offline",
  "Quản trị viên nhóm": "Team admins",
  "Chủ sở hữu bot & quản trị viên nhóm · theo dõi lỗi & dữ liệu bot":
    "Bot owner & team admins · monitors bot errors & data",
  "Cửa sổ Admin là khu vực riêng tư của chủ sở hữu bot và quản trị viên nhóm — người dùng khác không nhìn thấy và không vào được.":
    "The Admin window is private to the bot owner and the team admins — other users can't see or open it.",
  "Cửa sổ Admin chỉ hiển thị với": "The Admin window is only shown to",
  "và những người trong": "and the people on the",
  "danh sách quản trị viên nhóm": "team admin list",
  "(do chủ bot đặt). Người dùng khác không thấy nút này và không truy cập được trang này.":
    "(set by the bot owner). Other users don't see this entry and can't open the page.",
  "Thêm thành viên trong team để họ cũng vào được cửa sổ Admin (theo dõi lỗi, sức khoẻ máy chủ, AI, threat research). Họ KHÔNG đụng được mật khẩu ẩn hay chìa khoá bảo mật API.":
    "Add team members so they can also open the Admin window (errors, host health, AI, threat research). They can NOT touch the hidden password or the API security key.",
  "Bạn là quản trị viên nhóm — danh sách này do chủ bot quản lý. Cần thêm hoặc bớt người, hãy báo chủ bot.":
    "You are a team admin — the bot owner manages this list. Ask the bot owner to add or remove people.",
  "Chưa có ai — hiện chỉ chủ bot vào được cửa sổ này.":
    "Nobody yet — currently only the bot owner can open this window.",
  "Chưa từng đăng nhập web": "Never signed in on the web",
  "Bỏ quyền quản trị viên nhóm": "Revoke team admin",
  "Discord ID (15-21 chữ số)": "Discord ID (15-21 digits)",
  "Tối đa": "Up to",
  "người.": "people.",
  "Cách lấy ID: bật Chế độ nhà phát triển trong Discord → chuột phải vào người dùng → Sao chép ID.":
    "How to get the ID: enable Developer Mode in Discord → right-click the user → Copy ID.",
  "Đã lưu danh sách quản trị viên nhóm.": "Team admin list saved.",
  "Không lưu được.": "Could not save.",
  "Không kiểm tra được trạng thái": "Can't check the status",
  "Lỗi kết nối — thử lại sau ít phút.": "Connection error — try again in a few minutes.",
  /* ==== Chuẩn hoá ảnh avatar (07/10/2026) ==== Lỗi từ chối file hỏng lúc
     upload avatar (src/lib/avatarImage.ts) — file không decode được bị chặn
     ngay tại máy khách thay vì âm thầm lên production rồi vỡ avatar. */
  "Kích thước ảnh không hợp lệ.": "Invalid image dimensions.",
  "Ảnh không đọc được — hãy chọn file JPG/PNG/WebP khác.":
    "This image can't be read — please choose another JPG/PNG/WebP file.",
  "Trình duyệt không vẽ được ảnh — thử trình duyệt khác nhé.":
    "Your browser can't render this image — try a different browser.",
  "Không nén được ảnh — hãy chọn file ảnh khác.":
    "Couldn't compress the image — please pick another image.",
};
