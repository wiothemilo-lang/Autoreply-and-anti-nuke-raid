/**
 * src/lib/i18n.en.labels.ts — Bản dịch EN cho NHÃN & DỮ LIỆU HIỂN THỊ.
 *
 * Vì sao tách riêng file: các chuỗi ở đây không nằm trong JSX dưới dạng literal,
 * mà là nhãn của hằng số dữ liệu (ANTINUKE_MODULE_META[m].label,
 * HEAT_TIER_LABEL[tier], PUNISH_META[p].label, nhóm danh mục, nhãn thời lượng…)
 * được render động qua translate(item.label). Chúng vẫn phải có bản EN thì chế
 * độ tiếng Anh mới phủ đều — script scripts/check-i18n.cjs quét cả nhóm này.
 *
 * Nhiều mục là MẢNH CÂU (bắt đầu bằng dấu phẩy hoặc khoảng trắng) vì code ghép
 * lại thành câu dài; bản EN giữ đúng vị trí mảnh để câu ghép không bị đảo.
 */
export const EN_LABELS: Record<string, string> = {
  "(tất cả)": "(all)",
  "1 giờ": "1 hour",
  "24 module": "24 modules",
  "3 ngày": "3 days",
  "30 phút": "30 minutes",
  "5 phút": "5 minutes",
  "7 ngày": "7 days",
  "< 500 thành viên": "under 500 members",
  "AI phân biệt raid hay cá nhân": "AI tells raids apart from lone offenders",
  "Avatar trợ lý AI (Haimiya-senpai)": "AI assistant avatar (Haimiya-senpai)",
  "Backup & khôi phục server": "Server backup & restore",
  "Backup (kèm tin nhắn) sẽ được lưu trên Convex.":
    "The backup (messages included) is stored on Convex.",
  "Backup sẽ được lưu trên Convex.": "The backup is stored on Convex.",
  "Ban hàng loạt": "Mass ban",
  "Bot Discord tự trả lời & chống nuke/raid": "Discord bot: auto-replies & anti-nuke/raid",
  "Bot im lặng sau khi trừng phạt (dashboard vẫn ghi nhận case)":
    "The bot stays silent after punishing (the dashboard still logs the case)",
  "Bot không gửi embed nào sau khi trừng phạt (dashboard vẫn ghi nhận case).":
    "The bot posts no embed after punishing (the dashboard still logs the case).",
  "Bot không gửi heartbeat. Hãy khởi động bot trên host rồi thử khôi phục lại sau khi bot online.":
    "The bot is not sending heartbeats. Start the bot on your host, then try restoring again once it is online.",
  "Bot lạ": "Unknown bot",
  "Bot vào-rồi-rời": "Bot join-and-leave",
  "Bot vào-rồi-rời (hit-and-run)": "Bot join-and-leave (hit-and-run)",
  "Bot đang học…": "The bot is learning…",
  "Báo cáo hàng ngày": "Daily report",
  "Báo cáo khẩn & report": "Urgent alert & report",
  "Bảng nhiệt & warn": "Heat & warn table",
  "Bảo vệ server": "Server protection",
  Bật: "On",
  "Bật bảng": "Enable panel",
  "Bật tất cả": "Enable all",
  "Chưa có sự kiện chống nuke nào được ghi nhận.": "No anti-nuke events recorded yet.",
  "Chặn VPN/Proxy ngay lập tức": "Block VPN/proxy immediately",
  "Chặn domain lừa đảo (nitro giả, gift giả…), link IP và file đuôi nguy hiểm (.exe, .scr, .bat…)":
    "Block scam domains (fake nitro, fake gifts…), raw IP links and dangerous file extensions (.exe, .scr, .bat…)",
  "Chặn link mời Discord": "Block Discord invites",
  "Chỉnh trên web, bot áp dụng sau khoảng một phút":
    "Edit on the web, the bot applies it in about a minute",
  "Chọn…": "Select…",
  "Chống ban hàng loạt": "Anti mass ban",
  "Chống kick hàng loạt": "Anti mass kick",
  "Chống link độc hại & file nguy hiểm": "Malicious links & dangerous files",
  "Chống lặp tin nhắn": "Anti duplicate messages",
  "Chống raid thành viên": "Anti member raid",
  "Chống spam mention": "Anti mention spam",
  "Chống spam tin nhắn": "Anti message spam",
  "Chống spam ảnh & file": "Anti image & file spam",
  "Chống spam ảnh/file": "Anti image/file spam",
  "Chống thêm bot hàng loạt": "Anti mass bot add",
  "Chống tin rỗng/nhiễu": "Anti blank/noise messages",
  "Chống tạo webhook hàng loạt": "Anti mass webhook creation",
  "Chống tạo/xóa kênh": "Anti channel create/delete",
  "Chống tạo/xóa role": "Anti role create/delete",
  "Chống tạo/xóa thread": "Anti thread create/delete",
  "Chống xóa tin hàng loạt": "Anti mass message delete",
  "Sao lưu toàn bộ server (role, kênh, tin nhắn kèm media, emoji), nén và đẩy lên GitHub Gist, tự động chạy định kỳ 2–30 ngày. Khôi phục sang server khác hoặc nhập trực tiếp file backup của bot nuke (.msc).":
    "Backs up the whole server (roles, channels, messages with media, emoji), compresses it into a GitHub Gist and runs automatically every 2–30 days. Restore into another server or import a nuke-bot backup file (.msc) directly.",
  "Cách hoạt động": "How it works",
  "Công cụ Mod": "Mod tools",
  "Cảm xúc": "Expressions",
  "Cảnh báo": "Warn",
  "Cảnh báo bot lạ": "Unknown bot alerts",
  "Cấm thành viên vĩnh viễn": "Permanently ban the member",
  "Cấu hình trên dashboard": "Configure on the dashboard",
  "Cộng đồng": "Community",
  "Cử chỉ": "Gestures",
  "Danh mục": "Categories",
  "Diễn đàn": "Forum",
  "Embed chỉ hiển thị Offender + hành động": "Embed shows Offender + action only",
  "Game & hoạt động": "Games & activities",
  "Ghi log VPN nhưng không chặn": "Log VPNs without blocking",
  "Giai đoạn nhiệt": "Heat stages",
  "Giám sát tự động": "Automatic monitoring",
  "Gán/gỡ role hàng loạt": "Mass role add/remove",
  "Gửi cảnh báo riêng (DM) cho thành viên": "Send the member a private warning (DM)",
  "Hãy kiểm tra lại file backup hoặc tải lại file khác.":
    "Check the backup file again, or upload another one.",
  "Hệ thống nhiệt độ 4 giai đoạn": "4-stage heat system",
  "Học ngay": "Learn now",
  "Hồng anh đào, lời chào cơ bản": "Cherry blossom: a basic greeting",
  Khác: "Other",
  "Khóa tạm thời (đặt thời lượng bên dưới)": "Temporary lock (set the duration below)",
  "Không có lựa chọn": "No options",
  "Không có sự kiện nào khớp với bộ lọc hiện tại.": "No events match the current filter.",
  "Không hoạt động": "Inactive",
  "Không kiểm tra VPN": "Don't check for VPNs",
  "Kick hàng loạt": "Mass kick",
  "Kênh & thread": "Channels & threads",
  "Role · Emoji · Server": "Roles · Emojis · Server",
  "Kênh log": "Log channel",
  "Kích hoạt khi thành viên tag bot trong tin nhắn.":
    "Triggers when a member tags the bot in a message.",
  "Kích hoạt khi tin nhắn chứa một trong các từ khóa bên dưới.":
    "Triggers when a message contains one of the keywords below.",
  "Lưu cài đặt": "Save settings",
  "Lưu phân quyền": "Save permissions",
  "Lưu thay đổi": "Save changes",
  "Lưu webhook": "Save webhook",
  "Lưu whitelist": "Save whitelist",
  "Moderation lọc nội dung": "Content moderation",
  "Module bảo vệ": "Protection modules",
  "Module chống nuke": "Anti-nuke modules",
  "Màu sắc": "Colour",
  "Mất kết nối tới máy chủ": "Lost connection to the server",
  "Mỗi vi phạm cộng điểm nhiệt và tự leo thang hình phạt: cảnh báo qua DM → tạm khóa → kick → ban. Nhiệt giảm dần theo phút, tái phạm trong cửa sổ ngắn bị nhân đôi.":
    "Every violation adds heat and escalates the punishment: DM warning → timeout → kick → ban. Heat decays by the minute, and a repeat offence inside the window doubles it.",
  "Nghi phạm nguồn cơn:": "Likely source offender:",
  "Nghiêm ngặt": "Strict",
  "Nội dung nguy hiểm": "Dangerous content",
  "Offender + lý do": "Offender + reason",
  "Offender + lý do + moderator": "Offender + reason + moderator",
  "Phát hiện làn sóng thành viên giả mạo tham gia ồ ạt":
    "Detects a wave of fake accounts joining at once",
  "Phát hiện nhiều lượt ban trong thời gian ngắn": "Detects many bans in a short window",
  "Phát hiện nhiều lượt kick thành viên": "Detects many member kicks",
  "Phát hiện quét sạch kênh (bulk delete / nuke channel)":
    "Detects channel wipes (bulk delete / nuke channel)",
  "Phát hiện spam tag người/role/kênh liên tục trong thời gian ngắn":
    "Detects repeated pings of people/roles/channels in a short window",
  "Phát hiện spam tạo kênh mới": "Detects spam channel creation",
  "Phát hiện spam tạo role mới": "Detects spam role creation",
  "Phát hiện spam tạo thread (forum/thread nhiễu loạn)":
    "Detects spam thread creation (forum/thread flooding)",
  "Phát hiện spam tạo webhook (kênh đăng webhook giả để phá server)":
    "Detects spam webhook creation (fake webhooks used to wreck the server)",
  "Phát hiện spam xóa kênh": "Detects spam channel deletion",
  "Phát hiện spam xóa role": "Detects spam role deletion",
  "Phát hiện spam xóa thread (quét sạch diễn đàn/thread)":
    "Detects spam thread deletion (forum/thread wipe)",
  "Phát hiện spam đổi tên/chủ đề/vị trí kênh (phá hoại giao diện)":
    "Detects spam channel renames/topic/position edits (layout vandalism)",
  "Phát hiện spam ảnh, file đính kèm liên tục trong thời gian ngắn":
    "Detects repeated image/attachment spam in a short window",
  "Phát hiện sửa tên/màu/quyền nhiều role (role tampering)":
    "Detects edits to many role names/colours/permissions (role tampering)",
  "Phát hiện thành viên gửi quá nhiều tin nhắn trong thời gian ngắn":
    "Detects a member sending too many messages in a short window",
  "Phát hiện tin nhắn chỉ gồm khoảng trắng / ký tự ẩn (zero-width) gây nhiễu kênh":
    "Detects messages made only of whitespace / zero-width characters flooding the channel",
  "Phổ biến": "Popular",
  Protogon: "Protogon",
  "Purge tin liên quan": "Purge related messages",
  "Purge toàn bộ tin liên quan": "Purge all related messages",
  "Quản lý": "Management",
  "Raid thành viên": "Member raid",
  "Role, kênh, tin nhắn + media và emoji/sticker đã được tạo lại trên server.":
    "Roles, channels, messages + media and emoji/stickers were recreated on the server.",
  "Role, kênh, tin nhắn và emoji/sticker đã được tạo lại theo backup. Kiểm tra embed xác nhận trong kênh log.":
    "Roles, channels, messages and emoji/stickers were recreated from the backup. Check the confirmation embed in the log channel.",
  "Role, quyền role và kênh sẽ được tạo lại theo backup. Kết quả sẽ hiện ở đây.":
    "Roles, role permissions and channels will be recreated from the backup. The result shows up here.",
  "Đặt rule theo từ khóa hoặc @mention, chèn {user}, {username}, kèm cooldown chống spam. Bot phản hồi tức thì, đúng giọng điệu của server bạn.":
    "Keyword or @mention rules, with {user} and {username} placeholders and an anti-spam cooldown. Instant replies in your server's own voice.",
  "Server nhỏ": "Small server",
  "Spam & nhiễu kênh": "Spam & channel noise",
  "Spam tin dài / lặp nội dung": "Long / duplicate message spam",
  "Spam tạo emoji/sticker để lấp đầy slot hoặc chèn ảnh phá hoại":
    "Spam emoji/sticker creation to fill slots or insert vandal images",
  Sáng: "Light",
  "Sân khấu": "Stage",
  "Sửa bảng reaction role": "Edit the reaction-role panel",
  "Sửa role": "Edit role",
  "Sửa role hàng loạt": "Mass role edit",
  "Sửa/đổi tên kênh hàng loạt": "Mass channel rename/edit",
  "Tag thành viên": "Mention members",
  "Thay đổi quyền kênh hàng loạt": "Mass channel permission change",
  "Theo dõi": "Following",
  Thoại: "Voice",
  "Thành viên & quyền": "Members & permissions",
  "Thêm bot": "Add bot",
  "Thêm bot hàng loạt": "Mass bot add",
  'Thêm dòng Reason (để trống → ghi "không có lý do")':
    'Add a Reason line (empty → recorded as "no reason")',
  "Thêm dòng Responsible moderator (bot tự động = tên bot · mod lệnh = tên người dùng)":
    "Add a Responsible moderator line (automatic bot = bot name · manual mod = user name)",
  "Thông báo": "Notifications",
  "Tin giả blank gây nhiễu": "Blank/noise fake messages",
  "Trading / tài sản": "Trading / assets",
  "Trực tuyến": "Online",
  "Tên server": "Server name",
  "Tím, chữ GIVEAWAY VIP": "Purple, GIVEAWAY VIP text",
  "Tính năng": "Features",
  "Tóm tắt sự kiện, nhiệt và warn gửi thẳng vào kênh log":
    "Event, heat and warn summaries posted straight to the log channel",
  "Tạm khóa": "Timeout",
  "Tạm khóa (timeout)": "Temporary lock (timeout)",
  "Tạo bot trên Discord Developer Portal, lấy token và Client ID rồi dán vào mục API Keys của Protogon.":
    "Create a bot on the Discord Developer Portal, copy its token and Client ID, then paste them into Protogon's API Keys.",
  "Tạo bảng": "Create panel",
  "Tạo bảng reaction role": "Create the reaction-role panel",
  "Tạo emoji/sticker hàng loạt": "Mass emoji/sticker creation",
  "Tạo giveaway 🎉": "Create a giveaway 🎉",
  "Tạo kênh": "Create channel",
  "Tạo kênh hàng loạt": "Mass channel creation",
  "Tạo link mời hàng loạt": "Mass invite creation",
  "Tạo role": "Create role",
  "Tạo role hàng loạt": "Mass role creation",
  "Tạo rule": "Create rule",
  "Tạo thread hàng loạt": "Mass thread creation",
  "Tạo webhook hàng loạt": "Mass webhook creation",
  "Tạo ứng dụng Discord": "Create a Discord application",
  "Tải ảnh lên": "Upload image",
  "Tắt bảng": "Disable panel",
  "Tắt tất cả": "Disable all",
  Tối: "Dark",
  "Tự cấp quyền": "Self-granted permissions",
  "Tự cấp quyền quản trị": "Self-granted admin rights",
  "Tự trả lời thông minh": "Smart auto-replies",
  "Tự động xóa tin nhắn chứa từ trong danh sách từ ngữ xấu của server":
    "Automatically deletes messages containing words from the server's bad-word list",
  "Video quá lớn (tối đa 50MB)": "Video too large (50MB max)",
  "Vàng, chữ GIVEAWAY SANG TRỌNG": "Gold, GIVEAWAY LUXE text",
  "Văn bản": "Text",
  "Warn tích lũy": "Cumulative warns",
  "Xanh lá, chữ QUÀ TẶNG": "Green, GIFT text",
  "Theo dõi từng thành viên, xóa nhiệt bằng một cú nhấn":
    "Track every member, clear heat in one click",
  "Xác nhận": "Confirm",
  "Xóa hàng loạt mọi tin nhắn liên quan đến vụ vi phạm (ví dụ: toàn bộ tin spam trong cửa sổ phát hiện)":
    "Bulk-deletes every message tied to the incident (for example, all spam within the detection window)",
  "Xóa kênh": "Delete channel",
  "Xóa kênh hàng loạt": "Mass channel deletion",
  "Xóa ngay tin nhắn vi phạm tại thời điểm bot nhận ra vi phạm":
    "Deletes the offending message the moment the bot spots it",
  "Xóa role": "Delete role",
  "Xóa role hàng loạt": "Mass role deletion",
  "Xóa thread hàng loạt": "Mass thread deletion",
  "Xóa tin nhắn chứa link mời discord.gg / discord.com/invite":
    "Deletes messages containing discord.gg / discord.com/invite links",
  "Xóa tin nhắn hàng loạt": "Mass message deletion",
  "[đăng-nhập] ": "[sign-in] ",
  "ai đó tự gán role Admin/ManageGuild/ManageRoles":
    "someone grants themselves Admin/ManageGuild/ManageRoles",
  "ban thất bại": "ban failed",
  "bot đăng cảnh báo kèm chi tiết tài khoản (tuổi acc, tick xác minh, quyền, người thêm). CHỈ CẢNH BÁO, không phạt; kết hợp với module hit-and-run để bắt trọn vòng đời bot nuke":
    "the bot posts an alert with account details (account age, verification tick, permissions, inviter). ALERT ONLY, no punishment; pair it with the hit-and-run module to catch the full nuke-bot lifecycle",
  "chưa rõ": "unknown",
  "cân bằng, rõ ràng": "balanced, clear",
  "có thể bot đang chạy bản cũ, hãy cập nhật bot lên bản mới nhất rồi thử lại.":
    "the bot may be running an older build — update it to the latest version and try again.",
  "dày dặn, trầm": "full-bodied, deep",
  "dùng chung mọi server).": "shared across every server).",
  "dấu hiệu kinh điển của bot nuke (dọn dấu vết, né audit log). Chỉ bot KHÔNG xác minh và MỚI vào server mới bị phạt; bot xác minh/ở lại lâu/mod kick bình thường được bỏ qua":
    "the classic nuke-bot signature (covering tracks, dodging the audit log). Only unverified bots that JOINED RECENTLY are punished; verified bots, long-time members and normal mod kicks are skipped",
  "gán/gỡ role cho nhiều thành viên cùng lúc": "adds/removes roles for many members at once",
  "hãy khởi động bot trên host rồi tải lại file.":
    "start the bot on your host, then reload the file.",
  "hãy kiểm tra bot có online không (tab Giám sát bot).":
    "check whether the bot is online (Bot monitor tab).",
  "khởi động bot trên host rồi bấm Khôi phục lại.":
    "start the bot on your host, then press Restore again.",
  "mời nhiều bot vào server cùng lúc": "invites many bots to the server at once",
  "nhẹ nhàng, mờ ảo": "soft, ethereal",
  "raid → ban + khóa kênh": "raid → ban + channel lockdown",
  "server lớn kèm tin nhắn có thể mất vài phút; nếu quá lâu hãy cập nhật bot lên bản mới nhất.":
    "large servers with messages can take a few minutes; if it drags on, update the bot to the latest version.",
  "sửa overwrite nhiều kênh để khóa mọi người hoặc mở toang":
    "edits overwrites on many channels to lock everyone out or fling them wide open",
  "thử dán đường dẫn ảnh thay thế": "try pasting an image URL instead",
  "thử lại": "try again",
  "thử lại sau ít phút.": "try again in a few minutes.",
  "tin có mention": "messages with mentions",
  "tin có ảnh/file": "messages with images/files",
  "tạo nhiều link mời trước khi tràn vào": "creates many invites before flooding in",
  "tối giản tuyệt đối": "absolutely minimal",
  "xử lý": "Action",
  "Áp dụng": "Apply",
  "Âm nhạc & giải trí": "Music & entertainment",
  "Đang bảo vệ server": "Protecting the server",
  "Đang bật": "Enabled",
  "Đang gửi...": "Sending...",
  "Đang lưu…": "Saving…",
  "Đang tạo…": "Creating…",
  "Đang áp…": "Applying…",
  "Đuổi thành viên khỏi server": "Kick the member from the server",
  "Đã ban nguồn cơn:": "Source offender banned:",
  "Đã bật DM chào mừng": "Welcome DM enabled",
  "Đã bật Join Gate": "Join Gate enabled",
  "Đã bật bảng": "Panel enabled",
  "Đã bật webhook mặc định": "Default webhook enabled",
  "Đã bật xác minh thành viên": "Member verification enabled",
  "Đã gửi thành công! Kiểm tra kênh Discord.": "Sent successfully! Check the Discord channel.",
  "Đã tắt": "Disabled",
  "Đã tắt DM chào mừng": "Welcome DM disabled",
  "Đã tắt Join Gate": "Join Gate disabled",
  "Đã tắt bảng": "Panel disabled",
  "Đã tắt webhook mặc định": "Default webhook disabled",
  "Đã tắt xác minh thành viên": "Member verification disabled",
  "Đặt mật khẩu": "Set a password",
  "Đồng bộ tự động": "Auto sync",
  "Đổi biệt danh hàng loạt": "Mass nickname change",
  "Đổi cấu hình": "Config change",
  "Đổi cấu hình server": "Server config change",
  "Đổi mật khẩu": "Change password",
  "Động vật": "Animals",
  "Đủ N lần warn là tự tăng cấp hình phạt": "Reaching N warns escalates the punishment",
  "đen thuần khiết": "pure black",
  "đã bật": "enabled",
  "đã hủy": "cancelled",
  "đã kết thúc": "ended",
  "đổi nickname của nhiều thành viên": "changes many members' nicknames",
  "đổi tên/icon/bật MFA/giảm verification…":
    "renames / changes icon / enables MFA / lowers verification…",

  // ── Tiêu đề route (App.tsx, dịch lúc render trong TitleSync) ─────────────
  "Protogon — Bot Discord tự trả lời & chống nuke/raid":
    "Protogon — Discord bot with auto-replies & anti-nuke/raid",
  "Đăng nhập — Protogon": "Sign in — Protogon",
  "Thống kê nhiệt độ — Protogon": "Heat stats — Protogon",
  "Giám sát bot — Protogon": "Bot monitor — Protogon",
  "Quản trị — Protogon": "Admin — Protogon",

  // ── Gợi ý/warning trong BackupPanel ──────────────────────────────────────
  "Bot đang OFFLINE (không nhận được heartbeat) — hãy khởi động bot trên host rồi tải lại file.":
    "The bot is OFFLINE (no heartbeat) — start the bot on your host, then reload the file.",
  "Bot online nhưng chưa xử lý — có thể bot đang chạy bản cũ, hãy cập nhật bot lên bản mới nhất rồi thử lại.":
    "The bot is online but has not processed the file — it may be running an older build; update it to the latest version and try again.",
  "Không xác định được trạng thái bot — hãy kiểm tra bot có online không (tab Giám sát bot).":
    "Can't determine the bot's status — check whether it is online (Bot monitor tab).",
  "Bot đang OFFLINE — khởi động bot trên host rồi bấm Khôi phục lại.":
    "The bot is OFFLINE — start it on your host, then press Restore again.",
  "Bot online nhưng chưa xử lý xong — server lớn kèm tin nhắn có thể mất vài phút; nếu quá lâu hãy cập nhật bot lên bản mới nhất.":
    "The bot is online but hasn't finished — large servers with messages can take a few minutes; if it drags on, update the bot to the latest version.",
  "Backup (kèm tin nhắn) sẽ được lưu trên Convex và đẩy lên GitHub (token của chủ bot — dùng chung mọi server).":
    "The backup (messages included) is stored on Convex and pushed to GitHub (bot owner's token — shared across all servers).",
  "Backup sẽ được lưu trên Convex và đẩy lên GitHub (token của chủ bot — dùng chung mọi server).":
    "The backup is stored on Convex and pushed to GitHub (bot owner's token — shared across all servers).",
  "Không tải file lên được — thử lại": "Couldn't upload the file — try again",
  "Không nhận được mã file — thử lại": "No file id received — try again",
  "Cấu hình đăng nhập chưa hoàn tất — thử lại sau ít phút.":
    "Sign-in configuration isn't finished — try again in a few minutes.",

  // ── Landing: mô tả từng tính năng (sections.tsx) ─────────────────────────
  "Tự động chặn spam tin nhắn, mention, ảnh/file và link mời Discord, lọc từ ngữ thô tục — song song với hệ thống warn tích lũy leo thang hình phạt.":
    "Blocks message, mention and image/file spam plus Discord invites, and filters profanity — running alongside the accumulated-warn escalation.",
  "Nhận diện domain lừa đảo (nitro giả, gift giả, crypto scam…), link IP và tệp nguy hiểm (.exe, .scr, .bat…) rồi xóa tin nhắn kèm cảnh báo cho mod.":
    "Recognises scam domains (fake nitro, fake gifts, crypto scams…), raw IP links and dangerous files (.exe, .scr, .bat…), then deletes the message and alerts your mods.",
  "Cổng kiểm soát đầu vào: chặn tài khoản quá mới, không avatar, không huy hiệu và mọi lượt vào khi server đang bị raid — vẫn có danh sách trắng cho người quen.":
    "An entry checkpoint: blocks accounts that are too new or have no avatar or badges, plus every join while the server is under raid — with a whitelist for people you trust.",
  "Chống nuke & raid — 24 module": "Anti-nuke & raid — 24 modules",
  "Ban/kick hàng loạt, raid thành viên, phá kênh/role, webhook spam, bot hit-and-run, tự cấp quyền quản trị… đều bị phát hiện và xử lý tức thì, kèm khóa kênh tự động khi server bị tấn công.":
    "Mass bans/kicks, member raids, channel/role vandalism, webhook spam, hit-and-run bots, self-granted admin… all detected and handled on the spot, with automatic channel lockdown under attack.",
  "Đầy đủ /mod timeout · kick · ban · purge cùng các lệnh text !timeout !kick !ban !purge — mọi hành động đều được ghi lại kèm lý do và người thực hiện.":
    "The full /mod timeout · kick · ban · purge set plus the !timeout !kick !ban !purge text commands — every action logged with its reason and moderator.",
  "Nhấn Mời bot và chọn server của bạn — Protogon tạo sẵn cấu hình an toàn với đủ 32 module bật, chỉnh lại bất cứ lúc nào.":
    "Hit Invite bot and pick your server — Protogon sets up a safe default with all 32 modules enabled; adjust anything later.",
  "Thêm rule trả lời, tinh chỉnh nhiệt độ và warn, bật Join Gate, chọn hình phạt — mọi thay đổi có hiệu lực sau khoảng một phút.":
    "Add reply rules, fine-tune heat and warns, enable Join Gate, pick punishments — every change takes effect in about a minute.",

  // ── Mô tả module chống nuke (constants.ts → ModuleCard) ──────────────────
  "Permission bombing — sửa overwrite nhiều kênh để khóa mọi người hoặc mở toang":
    "Permission bombing — edits overwrites on many channels to lock everyone out or fling them wide open",
  "Leo thang đặc quyền — ai đó tự gán role Admin/ManageGuild/ManageRoles":
    "Privilege escalation — someone grants themselves Admin/ManageGuild/ManageRoles",
  "Role bombing — gán/gỡ role cho nhiều thành viên cùng lúc":
    "Role bombing — adds/removes roles for many members at once",
  "Rename raid — đổi nickname của nhiều thành viên":
    "Rename raid — changes many members' nicknames",
  "Bot raid — mời nhiều bot vào server cùng lúc":
    "Bot raid — invites many bots to the server at once",
  "Bot chưa biết được thêm vào server — bot đăng cảnh báo kèm chi tiết tài khoản (tuổi acc, tick xác minh, quyền, người thêm). CHỈ CẢNH BÁO, không phạt; kết hợp với module hit-and-run để bắt trọn vòng đời bot nuke":
    "An unknown bot was added to the server — the bot posts an alert with account details (account age, verification tick, permissions, inviter). ALERT ONLY, no punishment; pair it with the hit-and-run module to catch the full nuke-bot lifecycle",
  "Bot lạ tự rời server ngay sau khi được thêm — dấu hiệu kinh điển của bot nuke (dọn dấu vết, né audit log). Chỉ bot KHÔNG xác minh và MỚI vào server mới bị phạt; bot xác minh/ở lại lâu/mod kick bình thường được bỏ qua":
    "An unknown bot leaves right after being added — the classic nuke-bot signature (covering its tracks, dodging the audit log). Only unverified bots that JOINED RECENTLY are punished; verified bots, long-time members and normal mod kicks are skipped",
  "Chống raid bằng external app (ứng dụng mở rộng): AI học hỏi các dạng tấn công app ngoài (sockpuppet cài app ồ ạt, app giả mạo/tên scam, spam @everyone/link lừa đảo, webhook spam) và chặn cả biến thể tương tự — raid → ban + khóa kênh":
    "Anti external-app raid: the AI learns external-app attack patterns (sockpuppets mass-installing apps, fake or scam-named apps, @everyone spam, scam links, webhook spam) and blocks their variants too — raid → ban + channel lockdown",
  "Chuẩn bị raid — tạo nhiều link mời trước khi tràn vào":
    "Raid preparation — creates many invites before flooding in",
  "Phá hoại cấp server — đổi tên/icon/bật MFA/giảm verification…":
    "Server-level vandalism — renames, changes the icon, enables MFA, lowers verification…",
  "Phát hiện spam tin nhắn cực dài hoặc lặp lại nội dung giống hệt — AI phân biệt raid hay cá nhân":
    "Detects ultra-long or exactly duplicated messages — the AI tells raids apart from lone offenders",

  // ── Sắc độ xám của server theme (SERVER_THEMES.desc) ────────────────────
  "Mặc định — đen thuần khiết": "Default — pure black",
  "Xám đậm — dày dặn, trầm": "Dark grey — full-bodied, deep",
  "Xám vừa — cân bằng, rõ ràng": "Mid grey — balanced, clear",
  "Xám nhạt — nhẹ nhàng, mờ ảo": "Light grey — soft, ethereal",
  "Xám rất nhạt — tối giản tuyệt đối": "Very light grey — absolutely minimal",

  // ── Toast preset chống nuke (AntiNukePanel, có placeholder {p0}/{p1}) ───
  'Đã áp preset "{p0}": {p1} module': 'Applied preset "{p0}": {p1} modules',
  "Áp preset thất bại": "Failed to apply the preset",

  // ── Toast lỗi/thành công dựng trong callback (không phải JSX) ────────────
  "Gửi thất bại": "Sending failed",
  "Tạo thất bại": "Creation failed",
  "Tải file thất bại": "File upload failed",
  "Mở khóa thất bại": "Unlock failed",
  "Thiếu mã xác nhận từ Discord.": "Missing the confirmation code from Discord.",
  "Phiên đăng nhập không hợp lệ. Vui lòng thử lại.":
    "The sign-in session is invalid. Please try again.",
  /* backend ghi vào DB (convex/hidden.ts: postError/dmError) rồi dashboard hiện
     qua translate() — key phải ở đây, không phải chuỗi rời trong JSX. */
  "Lỗi không xác định": "Unknown error",
  "Đã bật toàn bộ chống nuke": "All anti-nuke modules enabled",
  "Đã tắt toàn bộ chống nuke": "All anti-nuke modules disabled",
  "Đã bật chia sẻ threat relay": "Threat relay sharing enabled",
  "Đã tắt threat relay": "Threat relay disabled",
  "Đã bật báo cáo hàng ngày": "Daily report enabled",
  "Đã tắt báo cáo hàng ngày": "Daily report disabled",
  "Đã bật cảnh báo khẩn": "Urgent alerts enabled",
  "Đã tắt cảnh báo khẩn": "Urgent alerts disabled",
  "Đã bật ping @everyone": "Pinging @everyone enabled",
  "Đã tắt ping @everyone": "Pinging @everyone disabled",
  "Đã bật chế độ an toàn — chỉ phạt khi có đủ bằng chứng":
    "Safe mode enabled — only punish with solid evidence",
  "Đã tắt chế độ an toàn — phạt theo điểm rủi ro": "Safe mode disabled — punish by risk score",
  "Đã bật tự động backup mỗi {p0} ngày": "Automatic backup every {p0} days enabled",
  "Đã tắt tự động backup": "Automatic backup disabled",
  "kênh đã xóa": "deleted channel",
  // Tiền tố dữ liệu bot cũ ghi trong nhật ký hình phạt (action = "Tự động: …").
  "Tự động": "Automatic",
  "Tự động: ": "Automatic: ",
  "không rõ": "unknown",
  "@thành viên": "@member",
  "URL webhook không hợp lệ — phải đúng định dạng discord.com/api/webhooks/{id}/{token}":
    "Invalid webhook URL — it must match discord.com/api/webhooks/{id}/{token}",
  "Nhập ID Discord hợp lệ (15–20 chữ số), cách nhau bởi dấu phẩy hoặc khoảng trắng.":
    "Enter valid Discord IDs (15–20 digits), separated by commas or spaces.",
  "✅ Đã gửi yêu cầu — bot sẽ học ngay (xem kết quả trong lịch sử bên dưới, tối đa ~10 phút)":
    "✅ Request sent — the bot will learn right away (see the result in the history below, up to ~10 minutes)",
  "Không gửi được yêu cầu": "Couldn't send the request",
  "Bot đang chạy bản cũ ({p0}) nên không xác nhận được kết quả — hãy kiểm tra server trực tiếp và cập nhật bot lên bản mới nhất (v{p1}+) để nhận báo cáo chính xác.":
    "The bot is running an older build ({p0}), so it can't confirm the result — check the server directly and update the bot to the latest version (v{p1}+) for accurate reports.",
  "Bot đang chạy bản cũ ({p0}) — hãy kiểm tra server trực tiếp và cập nhật bot lên bản mới nhất (v{p1}+).":
    "The bot is running an older build ({p0}) — check the server directly and update the bot to the latest version (v{p1}+).",
  "Discord đang gặp sự cố tạm thời (lỗi {p0} từ phía Discord). Vui lòng thử lại sau ít phút — trạng thái: status.discord.com":
    "Discord is having a temporary outage (error {p0} on Discord's side). Please try again in a few minutes — status: status.discord.com",
  "Đăng nhập thất bại, vui lòng thử lại.": "Sign-in failed, please try again.",
  "🌸 Chào mừng bạn!": "🌸 Welcome!",
  "Bạn đã xác minh thành công. Chào mừng bạn đến với server!":
    "You've been verified. Welcome to the server!",
  "Phạt trực tiếp": "Direct punishment",
  "Khóa kênh khi raid": "Channel lockdown on raids",
  "Miễn trừ role": "Role exemptions",
  "Kênh log riêng": "Dedicated log channel",
  "Giải đáp tức thì, 24/7 — không cần chờ đợi": "Instant answers, 24/7 — no waiting",
  "Biết rõ từng tính năng & cách cấu hình của Protogon":
    "Knows every Protogon feature and how to configure it",
  "Trả lời rõ ràng, nghiêm túc — trên web lẫn trong dashboard":
    "Answers clearly and seriously — on the site and in the dashboard",
  "Khu vực riêng tư dành cho chủ sở hữu bot 🔒": "Private area reserved for the bot owner 🔒",
  "⚡ Bot tự động": "⚡ Automatic (bot)",
  "✨ Sang trọng": "✨ Luxurious",
  "🌐 Tất cả": "🌐 All",
  "🎁 Nhanh gọn": "🎁 Quick & clean",
  "🎉 Mặc định": "🎉 Default",
  "📤 Rời server": "📤 Leave server",
  "📥 Vào server": "📥 Join server",
  "🛠️ Lệnh mod": "🛠️ Mod commands",
  "🛡️ Chống nuke": "🛡️ Anti-nuke",
  "Tiếng Đức": "German",
  "Đã bật nhóm ({p0} module)": "Enabled group ({p0} modules)",
  "Đã tắt nhóm ({p0} module)": "Disabled group ({p0} modules)",
  'Xóa rule "{p0}"?': 'Delete rule "{p0}"?',
  "{p}s trước": "{p}s ago",
  "{p}p trước": "{p}m ago",
  "{p} giờ trước": "{p}h ago",
  "{p} ngày trước": "{p}d ago",
  "đã ban": "banned",
  // ── Trang pháp lý (/terms, /privacy, /data-deletion) ──
  "Văn bản pháp lý": "Legal documents",
  "Cập nhật lần cuối": "Last updated",
  "Áp dụng cho": "Applies to",
  "bot Protogon và dashboard web": "the Protogon bot and web dashboard",
  "Mục lục": "Contents",
  "Văn bản khác": "Other documents",
  "Về đầu trang": "Back to top",
  "Cần hỗ trợ thêm?": "Need more help?",
  "Mọi câu hỏi về văn bản này, yêu cầu xoá dữ liệu hoặc báo lỗi bot đều được tiếp nhận trong kênh hỗ trợ của cộng đồng.":
    "Questions about this document, data deletion requests, and bot bug reports are all handled in the community support channel.",
  "Điều khoản sử dụng": "Terms of Service",
  "Chính sách quyền riêng tư": "Privacy Policy",
  "Lưu trữ & xoá dữ liệu": "Retention & Data Deletion",
  "Điều khoản sử dụng — Protogon": "Terms of Service — Protogon",
  "Chính sách quyền riêng tư — Protogon": "Privacy Policy — Protogon",
  "Lưu trữ & xoá dữ liệu — Protogon": "Retention & Data Deletion — Protogon",
  "Ủng hộ nhà phát triển — Protogon": "Support the developer — Protogon",
  "Giúp duy trì Protogon — bot Discord miễn phí do một người làm. Mọi tính năng luôn miễn phí, quyền góp giúp bot có thêm máy chủ và người sửa lỗi.":
    "Help keep Protogon running — a free Discord bot maintained by one person. Every feature stays free; contributions pay for the server and the bug fixes.",
  "Gói Premium — Protogon": "Premium plans — Protogon",
  "Xem trước các gói Premium của Protogon: nhiều kênh riêng hơn, báo cáo nâng cao, tên bot riêng và hỗ trợ ưu tiên. Gói miễn phí luôn được giữ nguyên.":
    "Preview Protogon premium tiers: more private channels, advanced reports, a custom bot name, and priority support. The free plan is never cut down.",

  // ── Mức ủng hộ (tiền VND) ──
  "50.000đ": "VND 50,000",
  "100.000đ": "VND 100,000",
  "300.000đ": "VND 300,000",
  "Một ly cà phê cho ngày thức khuya": "One coffee for a late night",
  "Một giờ server không phải lo lỗi cấu hình": "An hour of not worrying about a config breaking",
  "Một đêm deploy mà không sập giữa chừng": "A deploy night that doesn't crash halfway",

  // ── Quyền lợi ủng hộ ──
  "Bot luôn miễn phí, không giới hạn số server": "The bot stays free, with no server limit",
  "Không bán dữ liệu, không bán lịch sử tin nhắn của bạn":
    "No selling your data, no selling your message history",
  "Báo lỗi và yêu cầu tính năng được trả lời trong 24 giờ":
    "Bug reports and feature requests answered within 24 hours",
  "Ưu tiên hỗ trợ khi server của bạn gặp sự cố": "Priority help when your server breaks",

  // ── Tên + mức giá các gói Premium ──
  "Miễn phí": "Free",
  "Đồng hành": "Supporter",
  "Tiên phong": "Pioneer",
  "0đ": "VND 0",
  "49.000đ": "VND 49,000",
  "99.000đ": "VND 99,000",
  "vĩnh viễn": "forever",
  "mỗi tháng": "per month",
  "Đủ dùng cho hầu hết server cộng đồng.": "Enough for most community servers.",
  "Dành cho server muốn nhiều kênh riêng và báo cáo đẹp hơn.":
    "For servers that want more private channels and nicer reports.",
  "Cho người muốn bot bám sát server mình nhất.":
    "For people who want the bot to fit their server as closely as possible.",

  // ── Tính năng từng gói ──
  "Tự trả lời, chặn link độc hại, 32 module chống nuke":
    "Auto-reply, malicious link blocking, 32 anti-nuke modules",
  "Không giới hạn số server": "No limit on the number of servers",
  "Backup & khôi phục cấu trúc server": "Server backup & structure restore",
  "Số kênh riêng của bot (ví dụ bảng điều khiển)":
    "The bot's own private channels (dashboards, for example)",
  "Báo cáo nâng cao & xuất dữ liệu": "Advanced reports & data export",
  "Hỗ trợ ưu tiên": "Priority support",
  "Tất cả tính năng của gói Miễn phí": "Everything in the Free plan",
  "Tất cả tính năng của gói Đồng hành": "Everything in the Supporter plan",
  "Tối đa 10 kênh riêng có thư mục riêng": "Up to 10 private channels, each with its own folder",
  "Tên riêng cho bot (thay vì Protogon)": "A custom bot name instead of Protogon",
  "Số kênh riêng không giới hạn": "Unlimited private channels",
  "Hỗ trợ ưu tiên trong 24 giờ": "Priority support within 24 hours",
  "Ý tưởng tính năng được xếp hạng đầu": "Feature ideas get top ranking",
  "Avatar & biểu tượng riêng cho bot": "Custom avatar & icon for the bot",
};
