/**
 * i18n.en.panels.ts — Bản dịch EN đợt 2.
 *
 * Đợt 1 (src/lib/i18n.en.ts) phủ các chuỗi t(…) một mảnh. Đợt 2 phủ nhóm còn
 * sót: câu bị JSX cắt thành nhiều mảnh quanh thẻ <b>/<code> (nên phải dịch
 * từng mảnh sao cho ghép lại đọc tự nhiên), nhãn điều kiện trong {}, và nhãn
 * dữ liệu được dịch lúc render bằng translate(item.label).
 *
 * Gộp trong src/lib/i18n.tsx: DICT = { ...EN, ...EN_PANELS }.
 */
export const EN_PANELS: Record<string, string> = {
  "chưa có dữ liệu": "no data yet",
  "Bot tự đồng bộ dữ liệu (trạng thái, số server, chủ sở hữu) lên máy chủ":
    "The bot syncs data (status, server count, owner) to the backend",
  "mỗi {p0} giây": "every {p0} seconds",
  Tắt: "Off",
  "module chống nuke bật": "anti-nuke modules on",
  "Hiện có": "Currently",
  "signature từ": "signatures from",
  nguồn: "sources",
  "{p0} mẫu": "{p0} samples",
  "đang tải…": "loading…",
  "Vụ gần đây": "Recent incidents",
  lượt: "hits",
  "đã ban nguồn cơn": "banned the source",
  nghi: "suspect",
  bật: "on",
  "vi phạm": "violations",
  "module đang bật": "modules on",
  "thành viên nhận cảnh báo riêng, rồi tự tăng cấp hình phạt:":
    "threshold the member gets a private warning, then punishments escalate:",
  "tái phạm trong {p0} phút": "reoffends within {p0} minutes",
  "sẽ nhận": "gets",
  "điểm nhiệt": "heat points",
  "Số warn để tăng cấp (0 = tắt)": "Warns before escalation (0 = off)",
  "Đang bật:": "Active:",
  "trong {p0} phút → tự": "within {p0} minutes → auto",
  "(mặc định: {limit} warn / {window} phút).": "(default: {limit} warns / {window} minutes).",
  "Xóa {p0}": "Remove {p0}",
  "Áp dụng mọi kênh": "Applies to all channels",
  "{p0} kênh được chọn": "{p0} channels selected",
  "Thêm rule auto reply": "Add auto reply rule",
  "tag người nhắn,": "tags the sender,",
  "Chỉ áp dụng cho kênh (bỏ trống = mọi kênh)": "Only these channels (empty = all channels)",
  "Chưa có kênh nào được đồng bộ": "No channels synced yet",
  "Gõ tên kênh để tìm nhanh…": "Type a channel name to filter…",
  "— khắc phục rồi bấm Backup ngay lại.": "— fix it and press Backup now again.",
  "— khắc phục (bot còn trong server, đủ quyền Administrator) rồi bấm Khôi phục lại.":
    "— fix it (the bot must still be in the server with Administrator) and press Restore again.",
  "Tạo backup cho": "Create a backup for",
  "(danh mục, văn bản, thoại…) kèm quyền truy cập từng kênh, cùng":
    "(categories, text, voice…) with per-channel access, plus",
  "Backup luôn được lưu trong Convex; đẩy lên GitHub giúp bạn còn giữ được dữ liệu ngay cả khi Convex bị xóa. Mọi server đều dùng chung":
    "Backups are always kept in Convex; pushing to GitHub keeps your data even if Convex is wiped. All servers share the",
  của: "of",
  hoặc: "or",
  "), tải file lên đây — bot sẽ": "), upload it here — the bot will",
  "(ảnh/video…) và": "(images/videos…) and",
  "Bot đang chạy bản cũ ({version}) — cần cập nhật bot lên bản mới nhất (v{min}+) để khôi phục và báo kết quả chính xác.":
    "The bot is running an older build ({version}) — update it to the latest (v{min}+) to restore and report accurate results.",
  "không rõ": "unknown",
  "— kiểm tra lại file rồi tải lên.": "— check the file and upload it again.",
  mỗi: "every",
  ", tối đa": ", max",
  "Backup gần nhất:": "Latest backup:",
  "· lần tới:": "· next:",
  "Đang tắt — bot chỉ backup khi bạn bấm “Backup ngay” hoặc dùng lệnh.":
    "Off — the bot only backs up when you press “Backup now” or use the command.",
  "Lưu lịch tự động": "Save schedule",
  "Bật/tắt từng phần khi bot khôi phục — áp dụng cho": "Toggle each restore part — applies to",
  lẫn: "and",
  "Lưu tùy chỉnh khôi phục": "Save restore options",
  "(quyền": "(scope",
  ") của": ") of",
  "💡 Ngoài dashboard, bạn cũng có thể dùng lệnh trong Discord:":
    "💡 Outside the dashboard you can also use Discord commands:",
  "!backup restore <số>": "!backup restore <number>",
  bản: "backups",
  "Khôi phục vào server này": "Restore into this server",
  "Đang gửi…": "Sending…",
  "— thường do người nhận tắt DM hoặc không dùng chung server với bot":
    "— usually because the recipient has DMs off or shares no server with the bot",
  "Khi bot phát hiện loạt kết nối ứng dụng ngoài vượt ngưỡng module":
    "When the bot detects a burst of external app connections over the module threshold",
  người: "people",
  "kết nối": "connections",
  bởi: "by",
  "app khác…": "more apps…",
  "Chưa xác định được người dùng — chỉ ghi nhận": "No user identified — logged only",
  "Không có": "None",
  "(ứng dụng mở rộng) được kết nối ồ ạt hoặc app spam vào server — kèm":
    "(extended apps) connecting en masse or spamming into the server — with",
  "đang tắt — bật lại trong mục": "is off — turn it back on in",
  "kết thúc": "ends",
  "bất cứ lúc nào": "any moment",
  "người tham gia": "entries",
  "người thắng": "winners",
  " · 🎖️ cấp role thưởng": " · 🎖️ grants a prize role",
  " · DM người thắng": " · DMs the winners",
  " · 🖼️ có ảnh": " · 🖼️ has an image",
  "Hủy thất bại": "Cancel failed",
  "lượt tham gia": "entries",
  "Nhiệt giảm {p0} điểm/phút": "Heat drops {p0} points/minute",
  "= tạm khóa": "= timeout",
  "= cảnh báo": "= warning",
  "0 = an toàn": "0 = safe",
  "Xóa nhiệt của {p0}": "Clear heat for {p0}",
  "Đang bật · {p0} tiêu chí": "On · {p0} checks",
  "Đang tắt": "Off",
  "hành động gần nhất": "most recent actions",
  "đang bật thông báo": "notifications on",
  "Nội dung thông báo sau khi bot": "Notification content after the bot",
  từ: "of",
  "từ lệnh": "from the command",
  Ngưỡng: "Threshold",
  "= xóa ngay tin vi phạm ·": "= delete the violating message right away ·",
  "Chưa có role được đồng bộ": "No roles synced yet",
  "Gõ tên role để tìm nhanh…": "Type a role name to filter…",
  "Báo cáo hàng ngày:": "Daily report:",
  "lần cuối": "last",
  "thủ phạm": "offender",
  "{p0} đang bật": "{p0} enabled",
  "Đang bảo vệ": "Protected",
  "Đã tắt toàn bộ": "Fully disabled",
  "đồng bộ qua bot": "synced via the bot",
  "Chưa đặt": "Not set",
  "cảnh báo & sự kiện": "alerts & events",
  "đặt trong Cài đặt": "set in Settings",
  "Lần cuối đồng bộ:": "Last synced:",
  "Chọn từ gợi ý bên dưới hoặc dán emoji tùy chỉnh: emoji unicode, custom emoji":
    "Pick from the suggestions below or paste a custom emoji: unicode emoji, custom emoji",
  "chưa có": "not set",
  "🖼️ có thumbnail ·": "🖼️ has a thumbnail ·",
  "Thất bại": "Failed",
  "Xóa thất bại": "Delete failed",
  "Màu embed (hex, để trống = mặc định)": "Embed colour (hex, empty = default)",
  "Lỗi lưu webhook": "Failed to save the webhook",
  "Nhập mật khẩu mới để thay đổi…": "Enter a new password to change it…",
  "Nhập mật khẩu (4–64 ký tự)…": "Enter a password (4–64 characters)…",
  "Lưu thất bại": "Save failed",
  "Trạng thái:": "Status:",
  Webhook: "Webhook",
  "Đang kiểm tra…": "Checking…",
  "Đã đổi phương thức xác minh": "Verification method updated",
  "để tag,": "to tag,",
  "để tên server": "for the server name",
  "để trống = màu mặc định": "empty = default colour",
  "Đã cập nhật kênh xác minh": "Verification channel updated",
  "Đã cập nhật role chưa xác minh": "Unverified role updated",
  "Đã cập nhật role đã xác minh": "Verified role updated",
  "Đã yêu cầu bot gửi panel xác minh!": "Asked the bot to post the verification panel!",
  "Chưa chọn kênh": "No channel selected",
  "Chưa chọn role": "No role selected",
  "Webhook mặc định của bot": "The bot's default webhook",
  "· kênh": "· channel",
  "kênh đã bị xóa": "channel deleted",
  "Hôm nay lúc": "Today at",
  "moderation, anti-raid và anti-nuke xử lý —": "moderation, anti-raid and anti-nuke —",
  "chỉ áp dụng cho": "applies only to",
  "của người dùng (bật Chế độ nhà phát triển trong Discord → chuột phải tên người dùng → Sao chép ID người dùng) để họ không bị hệ thống xử lý":
    "of the user (enable Developer Mode in Discord → right-click the username → Copy User ID) so the system skips them",
  "người dùng": "users",
  "Danh sách áp dụng cho": "The list applies to",
  "toàn bộ module của server": "every module of the server",
  "đang dùng bot.": "using the bot.",
  "Protogon Bot · Tự trả lời theo từ khóa, nhiệt độ vi phạm, Join Gate và phòng thủ chống raid cho cộng đồng Discord":
    "Protogon Bot · Keyword auto-reply, violation heat, Join Gate and raid defence for the Discord community",
  "bị chặn: tài khoản": "blocked: the account is",
  "Bảo vệ vững chắc, giao tiếp mượt mà cho server của bạn":
    "Solid protection and smooth conversation for your server",
  "(24 module) bám sát cấu trúc server (ban/kick hàng loạt, phá kênh, phá role…); còn":
    "(24 modules) watch the server structure (mass bans/kicks, channel and role vandalism…), while",
  "Không khớp": "No match for",
  "{p0} server · {p1} thành viên": "{p0} servers · {p1} members",
  "Lỗi kết nối": "Connection error",
  "Khi đã đặt seed, MỌI lệnh của bot yêu cầu chìa khóa khớp — kẻ ngoài không thể giả mạo heartbeat/backup/lockdown. Trên VPS dán giá trị seed VỪA NHẬP vào biến":
    "Once a seed is set, EVERY bot command needs the matching key — outsiders cannot fake heartbeat/backup/lockdown. On the VPS, paste the seed you JUST entered into the variable",
  "trong bot/.env rồi": "in bot/.env, then",
  "Đã bật bảo vệ ✅ — dán giá trị seed VỪA NHẬP vào BOT_KEY trên VPS (không hiện lại ở đây).":
    "Protection enabled ✅ — paste the seed you JUST entered into BOT_KEY on the VPS (it is not shown here again).",
  "Lỗi khi đặt seed — thử lại.": "Failed to set the seed — try again.",
  "Cho phép AI tổng hợp (Mimo V2.5 qua Kira AI — free 30M tokens/ngày riêng cho việc học; tổng hợp mỗi lượt khi có dữ liệu mới, không đụng hạn mức Groq/NVIDIA)":
    "Allow AI synthesis (Mimo V2.5 via Kira AI — 30M free tokens/day dedicated to learning; synthesises each run when there is new data, without touching the Groq/NVIDIA quota)",
  "Nguồn lượt trước": "Sources last run",
  "Kích hoạt bot học NGAY từ nguồn mở + AI tổng hợp. Lần cuối:":
    "Make the bot learn NOW from open sources + AI synthesis. Last time:",
  "Lịch sử học": "Learning history",
  "lượt gần nhất": "latest runs",
  "· nhớ": "· remembers",
  "Từ khóa đã học": "Learned keywords",
  "Máy chủ backend của Protogon hiện không truy cập được từ trang web này (lỗi kết nối Convex). Nếu bạn là quản trị viên, hãy kiểm tra cấu hình":
    "Protogon's backend is currently unreachable from this site (Convex connection error). If you are an administrator, check the",
  "và thử lại sau ít phút.": "and try again in a few minutes.",
  "Để đăng nhập, bạn cần tạo ứng dụng Discord và điền":
    "To sign in you need to create a Discord application and fill in",
  "vào mục API Keys. Cách làm:": "in API Keys. How to:",
  "Thêm redirect URI": "Add the redirect URI",
  vào: "to",
  và: "and",
  "Mời Protogon vào server của bạn rồi quay lại đây. Cần quyền":
    "Invite Protogon to your server, then come back here. You need the",
  "thành viên · prefix": "members · prefix",
  "Mời bot vào server trước khi quản lý": "Invite the bot to the server before managing it",
  "Bạn sẽ được chuyển tới trang mời bot.": "You will be taken to the bot invite page.",
  ngưỡng: "threshold",
  trong: "in",
  "Tải thêm sự kiện": "Load more events",
  "— Đã hiển thị toàn bộ": "— Showing all",
  "sự kiện": "events",
  "• Auto-mod = spam tin, mention, từ xấu, ảnh/file, link mời + link độc hại.":
    "• Auto-mod = message spam, mentions, bad words, images/files, invite + malicious links.",
  "• Moderation = thông báo sau khi bot phạt (ban · timeout · warn · kick) — chọn mức chi tiết riêng cho từng hành động.":
    "• Moderation = notifications after the bot punishes (ban · timeout · warn · kick) — pick the detail level per action.",
  "• Join Gate = chặn selfbot khi vào server.": "• Join Gate = blocks selfbots on join.",
  "• ⭐ Whitelist = chọn người dùng/role miễn trừ moderation, anti-raid và nuke.":
    "• ⭐ Whitelist = pick users/roles exempt from moderation, anti-raid and nuke.",
  "• 💾 Backup server = chụp role + kênh lên đám mây riêng; khôi phục lại khi server bị nuke phá sập.":
    "• 💾 Server backup = snapshots roles + channels to your own cloud; restore after a nuke wipes the server.",
  "• 🔗 Webhook & Log = bot tự tạo webhook tên/avatar/màu tùy chỉnh để nhận log.":
    "• 🔗 Webhook & Log = the bot creates a custom-named/avatar/colour webhook to receive logs.",
  "tự trả lời & chống raid": "auto-reply & anti-raid",
  "cùng warn tích lũy": "plus accumulated warns",
  "giám sát server 24/7.": "monitoring your server 24/7.",
  "Trung bình:": "Average:",
  "Tối đa:": "Peak:",
  "đang đo": "measuring",
  "Đánh giá:": "Rating:",
  Nhanh: "Fast",
  "Nhiệt giảm {decay} điểm/phút — thành viên ngoan tự rời bảng sau một lúc im giọng. ▪ {warn} cảnh báo · ▪ {timeout} tạm khóa · ▪ {kick} kick · ■ {ban} ban":
    "Heat drops {decay} points/minute — well-behaved members leave the board after staying quiet. ▪ {warn} warning · ▪ {timeout} timeout · ▪ {kick} kick · ■ {ban} ban",
  "lần cảnh báo": "warnings",
  'Chỉnh sửa "{p0}"': 'Edit "{p0}"',
  'Hủy giveaway "{p0}"?': 'Cancel the giveaway "{p0}"?',
  'Xóa bảng "{p0}"?': 'Delete the panel "{p0}"?',
  '— bấm "Học ngay" để thử lại': '— press "Learn now" to try again',
  '— hãy sửa lỗi rồi bấm "Gửi panel xác minh vào kênh" lại':
    '— fix the error, then press "Post the verification panel into the channel" again',
  "—": "—",
  "Chào thành viên mới": "Greet new members",
  "Tạm biệt thành viên rời server": "Farewell to leaving members",
  "Kênh gửi": "Send channel",
  "Nội dung": "Message body",
  "Xem trước:": "Preview:",
  "Gửi dạng embed": "Send as embed",
  "Welcome & Goodbye": "Welcome & Goodbye",
  "đang bật": "active",
  "Đã bật": "Enabled",
  "Đã tắt": "Disabled",
  "Đã lưu": "Saved",
  "Đã lưu — bot áp dụng trong vòng ~3 phút": "Saved — the bot applies it within ~3 minutes",
  "Chào mừng {user} đã đến {server}! Bạn là thành viên thứ {count} 🎉":
    "Welcome {user} to {server}! You are member #{count} 🎉",
  "{user} đã rời {server}. Hẹn gặp lại!": "{user} left {server}. See you again!",
  "Bot Discord · Nhiệt độ · Join Gate · Chào thành viên · Trợ lý AI":
    "Discord bot · Heat · Join Gate · Greetings · AI assistant",
  "Chào thành viên mới và tạm biệt người rời đi bằng kênh riêng, nội dung tùy chỉnh với placeholder ({user}, {server}, {count}…), gửi dạng embed hoặc tin nhắn thường.":
    "Greet new members and farewell to those leaving — separate channels, custom text with placeholders ({user}, {server}, {count}…), sent as an embed or a plain message.",
  /* ==== Welcome & Goodbye v2 — template ngẫu nhiên, embed tùy chỉnh, DM, autorole ==== */
  "Template ngẫu nhiên": "Random templates",
  "{n} câu": "{n} lines",
  "🎉 Thành viên mới!": "🎉 New member!",
  "👋 Tạm biệt": "👋 Farewell",
  "Màu (#hex)": "Color (#hex)",
  ThànhViênMới: "NewMember",
  "Chào qua DM": "Welcome via DM",
  "Nội dung DM": "DM body",
  "Cảm ơn {username} đã tham gia {server}! Đọc #quy-tắc trước khi chat nhé.":
    "Thanks for joining {server}, {username}! Check the #rules before chatting.",
  "Autorole — tự cấp role": "Autorole — assign role automatically",
  "Chọn role": "Pick a role",
  "Cấp role cho bot": "Assign role to bots",

  /* ==== Welcome & Goodbye v3 — chèn emoji/kênh/biến, preview trực tiếp, tải ảnh ==== */
  Emoji: "Emoji",
  Kênh: "Channel",
  Biến: "Variable",
  "Chèn {p0}": "Insert {p0}",
  "Bấm để chèn ngay tại vị trí con trỏ.": "Click to insert at the cursor.",
  "Emoji của server": "Server emoji",
  "Chưa có emoji tuỳ chỉnh nào trong server này.": "This server has no custom emoji yet.",
  "Emoji phổ biến": "Common emoji",
  "Chọn kênh để chèn liên kết <#kênh> vào tin nhắn.": "Pick a channel to link it into the message.",
  "Chưa đồng bộ được kênh nào của server.": "No channels have synced for this server yet.",
  "Danh sách câu": "Message list",
  "Xem trước trực tiếp": "Live preview",
  "Tạm biệt": "Farewell",
  "Bot chèn {user} ở dòng riêng khi gửi embed, còn nội dung nằm trong khung.":
    "With embeds the bot puts {user} on its own line and your text inside the frame.",
  "Emoji không còn trong server: {list} — Discord sẽ hiện dạng chữ. Hãy chèn lại từ danh sách emoji.":
    "Emoji no longer in this server: {list} — Discord shows them as plain text. Insert them again from the emoji list.",
  "Chào thành viên mới và tạm biệt người rời server: template ngẫu nhiên, embed tùy chỉnh, ảnh banner tự tải lên, emoji và kênh của server chèn thẳng vào tin nhắn, DM chào riêng và autorole. Xem trước ngay bên cạnh để biết tin nhắn ra sao trước khi thành viên thật vào.":
    "Greet new members and farewell to those leaving: random templates, custom embeds, banner images you upload yourself, and the server's own emoji and channels inserted straight into the message, plus a separate welcome DM and autorole. The live preview beside each card shows exactly what members will see.",
  "Bot luôn chặn ping @everyone/@here từ nội dung bạn nhập.":
    "The bot always blocks @everyone/@here pings coming from your text.",
  "kênh không có trong server": "channel not in this server",
  "Emoji này không có trong server": "This emoji is not in this server",
  "Nội dung có @everyone/@here — bot luôn chặn, không ai bị ping.":
    "Your text contains @everyone/@here — the bot always blocks it, so nobody gets pinged.",
  /* Ảnh thẻ chào: tải lên / dán URL / xoá */
  "Ảnh banner": "Banner image",
  "Ảnh lớn hiện dưới nội dung embed.": "Large image shown under the embed text.",
  Thumbnail: "Thumbnail",
  "Ảnh nhỏ ở góc phải embed.": "Small image in the embed's top-right corner.",
  "Xoá ảnh": "Remove image",
  "Hoặc dán URL ảnh": "Or paste an image URL",
  "Dùng URL": "Use URL",
  "Ảnh tối đa 8MB, vui lòng chọn ảnh nhỏ hơn.":
    "Images are capped at 8MB — please pick a smaller one.",
  "Đã lưu ảnh — bot dùng ảnh mới trong khoảng 1 phút":
    "Image saved — the bot switches to it within about a minute",
  "Đã xoá ảnh": "Image removed",
  "Lưu ảnh thất bại": "Saving the image failed",
  "Xoá ảnh thất bại": "Removing the image failed",
  /* Thẻ ảnh v3 — bot tự vẽ PNG riêng cho từng thành viên */
  "Thẻ ảnh riêng": "Personal image card",
  "Bot tự vẽ một tấm ảnh cho riêng thành viên: nền của bạn + avatar tròn + tên + số thành viên.":
    "The bot draws a picture just for that member: your background, their round avatar, name and member number.",
  "Ảnh nền thẻ": "Card background",
  "Ảnh hiện phía sau avatar và tên (bỏ trống = nền màu chuyển sắc).":
    "Sits behind the avatar and name (leave empty for a colour gradient).",
  "Máy chủ bot chưa vẽ được ảnh nên thẻ này chưa hoạt động — bot vẫn gửi tin nhắn thường. Lý do: {p0}":
    "The bot host cannot draw images yet, so this card is inactive — the bot still sends the normal message. Reason: {p0}",
  "không xác định": "unknown",
  "Chưa nhận được báo cáo từ bot (bot đang chạy bản cũ hoặc chưa khởi động lại).":
    "No report from the bot yet (it is running an older build or has not restarted).",
  "Thẻ ảnh dùng avatar của thành viên thật khi gửi; ở đây hiện vị trí giữ chỗ.":
    "The real card uses the member's own avatar — this is just the placeholder position.",
  "CHÀO MỪNG": "WELCOME",
  "TẠM BIỆT": "GOODBYE",
  "Thành viên thứ {count}": "Member #{count}",
  /* Gợi ý cho chip chèn biến (hiện khi rê chuột) */
  "Nhắc tên thành viên kèm thông báo": "Mentions the member and notifies them",
  "Tên người dùng (không thông báo)": "Username, without notifying anyone",
  "Số thành viên hiện tại": "Current member count",
  "Tài khoản đã tạo bao nhiêu ngày": "How many days ago the account was created",
  "Đã ở trong server bao nhiêu ngày": "How many days they have been in the server",
  "Số lượt boost của server": "Server boost count",

  /* ==== Landing — đợt viết lại copy (Lô 1). Các key này còn bản cũ nằm ở
     section theo alphabet trong i18n.en.ts (entry trùng, không còn dùng) —
     gom về đây để một chỗ dễ rà soát. */
  "bảo vệ server toàn diện": "all-round server protection",
  "hoặc gọi từ khóa để bot phản hồi tức thì. Đi kèm":
    "or call a keyword and the bot answers instantly. Alongside",
  "· hoạt động 24/7": "· running 24/7",
  "Tái phạm trong 30 phút, nhiệt sẽ nhân": "Repeat within 30 minutes and the heat multiplies",
  "Protogon gom hệ thống tự trả lời và 32 module bảo vệ (24 chống nuke + 8 auto-mod) vào một chỗ: cấu hình trực quan trên dashboard, giám sát server 24/7, có trợ lý Haimiya đồng hành khi bạn cần.":
    "Protogon brings auto-reply and 32 protection modules (24 anti-nuke + 8 auto-mod) together in one place: configure everything from a clear dashboard, keep your server watched 24/7, with the Haimiya assistant on hand when you need it.",
  "Nhiệt tăng dần, hình phạt leo thang theo ngưỡng":
    "Heat climbs, punishments escalate by threshold",
  "Vừa bị phạt mà tái phạm, nhiệt sẽ nhân":
    "Repeat right after a punishment and the heat multiplies",
  "trong 30 phút. Warn tích lũy chạy song song: đủ 3 lần là tự tăng cấp.":
    "within 30 minutes. Accumulated warns run in parallel: 3 warns trigger automatic escalation.",
  "khi bất kỳ module nào vượt ngưỡng, bot sẽ chặn toàn bộ thành viên gửi tin trong server, tự mở lại sau vài phút hoặc khi mod dùng":
    "when any module crosses its threshold the bot blocks everyone from sending server-wide, reopening after a few minutes or when a mod runs",
  "Đăng nhập bằng Discord, mời Protogon vào server để bật nhiệt độ, Join Gate, lọc nội dung và 32 module chống nuke ngay trên dashboard — cùng trợ lý ảo Haimiya đồng hành. Miễn phí cho mọi server.":
    "Sign in with Discord and invite Protogon to switch on heat, Join Gate, content filtering and 32 anti-nuke modules right from the dashboard — with the Haimiya assistant along the way. Free for every server.",

  /* ==== Lô 2 — viết lại copy panel Overview / Settings / Branding / ModuleCard. */
  "Chưa ghi nhận sự kiện nào — bot chưa xử lý vi phạm chống nuke ở server này.":
    "No events recorded yet — the bot hasn't handled any anti-nuke violation on this server.",
  "Tính từ tổng nhiệt độ và warn tích lũy của thành viên. Vi phạm càng nhiều thì nhiệt càng cao và mức an toàn càng giảm; khi chạm ngưỡng, hình phạt tự tăng cấp (cảnh báo → tạm khóa → kick → ban) và tái phạm bị nhân đôi nhiệt.":
    "Calculated from your members' total heat and accumulated warns. The more violations, the higher the heat and the lower the safety score; once a threshold is reached the punishment escalates automatically (warning → timeout → kick → ban) and repeat offences double the heat.",
  "Rule auto reply hỗ trợ placeholder:": "Auto-reply rules support placeholders:",
  "để tag người nhắn và": "to mention the sender, and",
  "để lấy tên hiển thị.": "for their display name.",
  "Mọi thay đổi cấu hình được bot đồng bộ tự động trong khoảng 3 phút.":
    "Every configuration change syncs to the bot automatically within about 3 minutes.",
  "Bảng nhiệt & warn trong Moderation có nút xóa nhiệt cho từng người hoặc toàn bộ.":
    "The heat & warn table in Moderation can clear heat for one member or for everyone.",
  "Join Gate chặn selfbot ngay khi vào server: tài khoản quá mới, thiếu avatar hoặc huy hiệu.":
    "Join Gate blocks selfbots the moment they join: accounts that are too new or missing an avatar or badge.",
  "Module “Chống link độc hại & file nguy hiểm” quét domain lừa đảo và tệp đuôi .exe/.scr…":
    "The “malicious links & dangerous files” module scans scam domains and files ending in .exe/.scr…",
  "Mod/Admin có tên trong Cài đặt được miễn trừ khỏi toàn bộ hệ thống chống nuke.":
    "Mods/Admins listed in Settings are exempt from the entire anti-nuke system.",
  "Nhiệt tự giảm dần theo phút; đủ ngưỡng là hình phạt tự tăng cấp.":
    "Heat decays by the minute; once the threshold is reached the punishment escalates automatically.",
  "⚡ Phạt thẳng theo hành động đã chọn, không cộng nhiệt.":
    "⚡ Punishes directly with the chosen action and adds no heat.",
  "Không có — mọi role đều bị kiểm tra": "None — every role is checked",
  "Chưa có role nào được đồng bộ": "No roles synced yet",
  "= xóa toàn bộ tin liên quan đến vụ vi phạm.":
    "= deletes every message related to the violation.",
  "🔥 Nhiệt mỗi vi phạm": "🔥 Heat per violation",
  "Logo bot xuất hiện trên trang chủ, trang quản lý và toàn bộ website.":
    "The bot logo appears on the landing page, the management pages and the whole website.",
  "Ảnh đại diện của Haimiya trong cửa sổ trò chuyện trợ giúp.":
    "Haimiya's avatar inside the help chat window.",
  "Đổi avatar bot và trợ lý AI ngay trên web — chỉ admin sở hữu bot được phép.":
    "Change the bot and AI-assistant avatars right from the web — bot-owning admin only.",
  "Ảnh tải lên được lưu trên bộ nhớ đám mây của bot và áp dụng ngay toàn web (trang chủ, đăng nhập, dashboard, chat AI).":
    "Uploaded images are stored in the bot's cloud storage and applied across the site instantly (landing page, sign-in, dashboard, AI chat).",
  "Ảnh tối đa 2MB, vui lòng chọn ảnh nhỏ hơn.":
    "Images are capped at 2MB — please choose a smaller one.",
  "Tải ảnh lên máy chủ thất bại (HTTP {p0})": "Image upload to the server failed (HTTP {p0})",
  "Máy chủ không trả về ID ảnh — hãy thử dán đường dẫn ảnh thay thế":
    "The server returned no image ID — try pasting an image URL instead",
  "Đã đổi avatar bot, áp dụng ngay toàn web":
    "Bot avatar updated — applied across the site instantly",
  "Đã đổi avatar Haimiya, áp dụng ngay toàn web 🎀":
    "Haimiya's avatar updated — applied across the site instantly 🎀",
  "Tải ảnh thất bại": "Image upload failed",
  "Đã lưu ảnh mới, áp dụng ngay toàn web": "New image saved — applied across the site instantly",
  "Đã xóa ảnh tùy chỉnh, trở về mặc định": "Custom image removed — back to the default",
  "Tóm tắt sự kiện chống nuke gửi vào kênh log vào khoảng 00:00 UTC mỗi ngày":
    "Posts an anti-nuke summary to the log channel around 00:00 UTC every day",
  "Khi bot xác nhận raid/nuke: gửi DM khẩn cho chủ server (kẻ nuke không xóa được), AI quét chat và báo cáo vào kênh log, kèm lệnh":
    "When the bot confirms a raid/nuke: an urgent DM to the server owner (a nuker can't delete it), the AI scans the chat and reports to the log channel, plus the command",
  "Tắt nếu không muốn cảnh báo làm phiền cả server — mod vẫn thấy log":
    "Turn off if you don't want the alert to bother the whole server — mods still see the log",
  "tự gửi log khi có sự kiện; tùy chỉnh loại sự kiện, màu embed và nội dung kèm.":
    "posts logs automatically when events happen; customise event types, embed colour and included content.",
  "Được miễn trừ chống nuke và có quyền quản lý rule auto reply trong Discord.":
    "Exempt from anti-nuke and allowed to manage auto-reply rules inside Discord.",
  "🔒 Bạn không phải admin sở hữu bot — chỉ chủ sở hữu bot mới được đặt, đổi hoặc xóa mật khẩu này.":
    "🔒 You are not the bot-owning admin — only the bot owner can set, change or delete this password.",
  "Chọn sắc độ xám áp dụng cho toàn bộ trang quản lý của server (nút, thẻ, sidebar).":
    "Pick the grey shade applied to this server's whole management area (buttons, cards, sidebar).",
  "Đã lưu cài đặt, bot áp dụng trong khoảng 3 phút":
    "Settings saved — the bot applies them within about 3 minutes",
  "Prefix gồm 1–3 ký tự đặc biệt, ví dụ: !, ^, !!":
    "The prefix is 1–3 special characters, e.g. !, ^, !!",
  "1–3 ký tự đặc biệt, dùng cho lệnh text như":
    "1–3 special characters, used for text commands such as",
  ", kể cả người có quyền phá server.": ", including anyone with permission to wreck the server.",

  /* ==== Lô 3a — viết lại copy panel AntiNuke / AutoMod / AltDetection. */
  "Bảo vệ cấu trúc server khỏi các đợt tấn công hàng loạt: ban, kick, tạo/xóa kênh và role…":
    "Protects the server structure from mass attacks: bans, kicks, channel and role create/delete…",
  "⚠️ Chống nuke đang tắt toàn bộ — server chưa được bảo vệ khỏi raid.":
    "⚠️ Anti-nuke is fully off — your server is not protected against raids.",
  "Áp cấu hình tối ưu theo quy mô server; danh sách trắng của bạn giữ nguyên.":
    "Applies an optimal config for your server size; your whitelist stays untouched.",
  "Chia sẻ chữ ký raid ẩn danh với các server khác dùng Protogon — server của bạn được bảo vệ bằng kinh nghiệm toàn mạng.":
    "Shares anonymised raid signatures with other servers running Protogon — your server benefits from network-wide experience.",
  "Tự chặn gửi tin nhắn và voice khi phát hiện raid; mở lại khi hết giờ hoặc bằng":
    "Automatically blocks messages and voice when a raid is detected; reopens when the timer ends or with",
  "(tài khoản trùng avatar/username, người tạo invite, audit log) rồi tự ban.":
    "(accounts sharing an avatar/username, the invite creator, the audit log) and bans them automatically.",
  "Đã lưu cài đặt Raid Intel — bot áp dụng trong khoảng 3 phút":
    "Raid Intel settings saved — the bot applies them within about 3 minutes",
  "Thu thập mẫu raid và dùng AI phân tích để tìm": "Collects raid samples and uses AI to trace",
  "Phân tích cụm tài khoản và audit log sau mỗi vụ.":
    "Analyses the account cluster and the audit log after every case.",
  "Đang khóa — tự mở sau khoảng {p0} phút": "Locked — reopens in about {p0} minutes",
  "Hiện không có kênh nào bị khóa": "No channel is locked right now",
  "Tự động kiểm duyệt nội dung: chống spam tin nhắn, mention, từ ngữ thô tục, ảnh/file và link mời Discord":
    "Automatic content moderation: message spam, mentions, profanity, image/file spam and Discord invites",
  "Mỗi vi phạm cộng điểm nhiệt theo cài đặt của module. Nhiệt tăng dần rồi tự giảm theo thời gian; khi chạm ngưỡng":
    "Every violation adds heat based on the module settings. Heat rises and then decays over time; once it reaches a threshold",
  "Ngưỡng phải tăng dần: cảnh báo < tạm khóa < kick < ban (tối đa 100 điểm). Thành viên vừa bị phạt mà":
    "Thresholds must increase: warning < timeout < kick < ban (max 100 points). A member who is punished and",
  "bật, mọi tin nhắn chứa từ trong danh sách dưới đây sẽ bị xóa và xử lý tự động. Xóa hết từ để tắt bộ lọc từ ngữ xấu.":
    "on, every message containing a word from the list below is deleted and handled automatically. Remove all words to turn the bad-word filter off.",
  "Chưa có từ nào — bộ lọc từ ngữ xấu chỉ hoạt động sau khi bạn thêm từ.":
    "No words yet — the bad-word filter only works once you add some.",
  "mỗi lần vi phạm, thanh nhiệt đầy nhanh hơn.": "per violation, so the heat bar fills faster.",
  "🔥 Bảng nhiệt và warn tích lũy của từng thành viên":
    "🔥 Heat and accumulated warns for every member",
  "⚠️ Discord không cung cấp địa chỉ IP của thành viên cho bot, nên phát hiện VPN/Proxy trực tiếp là không khả thi với dữ liệu hiện có. Hệ thống tập trung vào phát hiện tài khoản phụ bằng bằng chứng hành vi (tuổi tài khoản, tên/avatar trùng, lịch sử bị phạt, cụm join) — cách chặn tài khoản lạm dụng VPN hiệu quả nhất mà Discord cho phép.":
    "⚠️ Discord does not expose members' IP addresses to bots, so detecting VPNs/proxies directly is not feasible with the available data. The system focuses on spotting alt accounts through behavioural evidence (account age, matching names/avatars, punishment history, join clusters) — the most effective way Discord allows to stop accounts abusing a VPN.",
  ": từ 2 tín hiệu mạnh trở lên → phạt đúng cấu hình; 1 tín hiệu → hạ cấp nhẹ hơn (ban → kick, kick → timeout); không có tín hiệu → chỉ theo dõi. Tắt để phạt theo điểm rủi ro như trước (dễ chặn nhầm hơn).":
    ": two or more strong signals → punish per your config; one signal → a milder punishment (ban → kick, kick → timeout); no signals → monitor only. Turn it off to punish by risk score as before (more prone to false positives).",

  /* ==== Lô 3b — viết lại copy panel JoinGate / Verify / Webhook / Backup. */
  "Đã thêm {p0} vào danh sách trắng": "Added {p0} to the whitelist",
  "Đã xóa {p0} khỏi danh sách trắng": "Removed {p0} from the whitelist",
  "Kiểm tra mọi thành viên mới ngay khi vào server và tự động chặn tài khoản nghi selfbot":
    "Checks every new member on join and automatically blocks suspected selfbot accounts",
  "Khi bật, mọi thành viên mới đều phải vượt qua các tiêu chí bên dưới mới được ở lại server. Ai không đạt sẽ bị":
    "When on, every new member must pass the checks below to stay in the server. Anyone who fails is",
  "⚠️ Join Gate đang tắt — mọi tài khoản đều vào được, kể cả selfbot.":
    "⚠️ Join Gate is off — every account can join, selfbots included.",
  "Tài khoản mới hơn số ngày dưới đây sẽ bị chặn (0 = tắt). Selfbot thường đăng ký tài khoản mới hàng loạt.":
    "Accounts younger than the number of days below are blocked (0 = off). Selfbots usually register fresh accounts in bulk.",
  "Khuyến nghị 7–14 ngày để chặn tài khoản dùng một lần.":
    "7–14 days is recommended to block throwaway accounts.",
  "Tài khoản còn dùng ảnh đại diện mặc định sẽ bị chặn.":
    "Accounts still on the default avatar are blocked.",
  "Tài khoản không có huy hiệu công khai nào (flag = 0) sẽ bị chặn — selfbot mới gần như không bao giờ có huy hiệu.":
    "Accounts with no public badge at all (flag = 0) are blocked — fresh selfbots almost never have one.",
  "Chặn người vào khi server đang bị raid": "Block joins while the server is being raided",
  "Khi server đang khóa kênh vì raid, mọi thành viên mới đều bị xử lý — cắt đợt tấn công thứ hai.":
    "While the server is channel-locked for a raid, every new member is punished — cutting off the second wave.",
  "— bật tiêu chí trên thì mọi thành viên mới sẽ bị xử lý ngay lúc này.":
    "— with the check above on, every new member is punished right now.",
  "Kick = có thể quay lại; Ban = chặn vĩnh viễn (hiệu quả hơn với selfbot).":
    "Kick = they can come back; Ban = blocked for good (more effective against selfbots).",
  "— tài khoản vi phạm bị chặn vĩnh viễn. Chọn Kick nếu bạn muốn nhẹ tay hơn.":
    "— offending accounts are blocked permanently. Pick Kick if you want to be gentler.",
  ", bỏ qua mọi tiêu chí — dành cho tài khoản phụ hoặc người bạn tin tưởng.":
    ", skipping every check — for alt accounts or people you trust.",
  "trạng thái email/số điện thoại đã xác thực, nên Join Gate chỉ dựa vào tín hiệu công khai (tuổi tài khoản, avatar, huy hiệu, trạng thái raid) để nhận diện selfbot.":
    "whether an email address or phone number is verified, so Join Gate relies on public signals only (account age, avatar, badges, raid status) to spot selfbots.",
  "để xử lý. Muốn một người luôn được vào, hãy thêm ID của họ vào danh sách trắng phía trên.":
    "to act. To let someone in every time, add their ID to the whitelist above.",
  "Thành viên mới nhận role Unverified và phải xác minh trước khi vào server.":
    "New members get the Unverified role and must verify before they can see the server.",
  "Khi bật, thành viên mới nhận role chưa xác minh và phải verify mới vào được server.":
    "When on, new members get the unverified role and must verify before they can enter the server.",
  "— thành viên bấm nút là xác minh xong ngay.":
    "— members click a button and are verified instantly.",
  "— bot gửi mã qua DM, thành viên nhập lại mã trong kênh.":
    "— the bot DMs a code and the member types it back in the channel.",
  "Bot gửi embed chào mừng qua DM ngay khi thành viên xác minh thành công.":
    "The bot DMs the welcome embed the moment a member verifies successfully.",
  "Role tự gán cho thành viên mới ngay khi vừa vào server.":
    "Role assigned automatically the moment a new member joins.",
  "Role gán sau khi xác minh thành công; role chưa xác minh được gỡ ra.":
    "Role granted after a successful verification; the unverified role is removed.",
  "— thiết lập xác minh ngay trong Discord.": "— set up verification right inside Discord.",
  "Chưa có nội dung embed — hãy soạn ở khung bên trái.":
    "No embed content yet — write something in the panel on the left.",
  "Đã gửi thành công! Kiểm tra kênh Discord.": "Sent successfully! Check the Discord channel.",
  "(theo Kênh log trong Cài đặt) · nhận mọi log hình phạt và anti nuke/raid.":
    "(follows the Log channel in Settings) · receives every punishment and anti-nuke/raid log.",
  "tự tạo trong khoảng 1 phút": "creates it within about 1 minute",
  "chọn Kênh log": "set the Log channel",
  "Dán webhook URL từ Discord (Kênh → Tích hợp → Webhook → Tạo webhook), soạn nội dung và embed rồi bấm gửi.":
    "Paste a webhook URL from Discord (Channel → Integrations → Webhooks → New webhook), write the message and embed, then hit send.",
  "Tên người gửi ghi đè (tùy chọn)": "Override display name (optional)",
  "Hiển thị thời gian hiện tại": "Show the current time",
  "• Dán URL vào ô trên, soạn embed với tiêu đề, mô tả, màu sắc, field… rồi bấm":
    "• Paste the URL above, build an embed with a title, description, colour and fields… then press",
  "• Webhook mặc định (Protogon Log) ở trên chỉ dùng để nhận log hình phạt và anti nuke từ bot — không liên quan tới trình gửi embed.":
    "• The default webhook (Protogon Log) above only receives punishment and anti-nuke logs from the bot — it has nothing to do with the embed sender.",
  "Hãy kiểm tra lại file backup hoặc tải lại file khác.":
    "Check the backup file again or upload a different one.",
  "Bot đã dừng giữa chừng. Kiểm tra bot còn trong server và đủ quyền Administrator rồi thử khôi phục lại.":
    "The bot stopped part-way. Make sure it is still in the server with Administrator permission, then try restoring again.",
  "Bot không gửi heartbeat (offline hơn 3 phút). Hãy khởi động bot trên host (pm2 start protogon-bot / bật lại service) rồi bấm Backup ngay sau khi bot online.":
    "The bot is not sending heartbeats (offline for more than 3 minutes). Start it on your host (pm2 start protogon-bot / restart the service), then hit Back up now once it is online.",
  "Bot không gửi heartbeat. Hãy khởi động bot trên host rồi thử khôi phục lại sau khi bot online.":
    "The bot is not sending heartbeats. Start it on your host, then try restoring again once it is online.",
  "Role, quyền role và kênh sẽ được tạo lại theo backup. Kết quả sẽ hiện ở đây.":
    "Roles, role permissions and channels are recreated from the backup. The result appears here.",
  "Sao lưu cấu trúc server (role, quyền role, kênh và quyền kênh) lên":
    "Backs up your server structure (roles, role permissions, channels and channel permissions) to",
  ". Khi server bị nuke/raid phá sập hoàn toàn, hãy mời bot vào":
    ". If your server is ever wiped out by a nuke or raid, invite the bot to a",
  "Đang khôi phục vào server này… server lớn kèm tin nhắn có thể mất vài phút. Kết quả hiện ở đây và trong kênh log.":
    "Restoring into this server… a large server with messages can take a few minutes. The result shows up here and in the log channel.",
  "Bot sao lưu toàn bộ": "The bot backs up every",
  "Kèm tin nhắn và media (tối đa 50 tin/kênh)": "Include messages and media (up to 50 per channel)",
  "Nếu server bị": "If your server was",
  "phá sập mà bạn còn giữ được file backup của nó (định dạng":
    "wrecked and you still have its backup file (in",
  "(gồm cả media — file lưu trên đám mây, không nhét vào bộ nhớ bot). Bot giữ nguyên role/kênh có sẵn của server hiện tại, chỉ thêm mới theo file chứ không xóa gì.":
    "(media included — the file stays in the cloud instead of being loaded into the bot's memory). The bot keeps the current server's existing roles and channels, only adding what the file contains and deleting nothing.",
  "Bot tự sao lưu và đẩy lên": "The bot backs up and pushes to",
  "). Bot chỉ giữ": "). The bot keeps only",
  "trong bot — bản cũ hơn tự bị xóa, còn GitHub giữ bản lưu vĩnh viễn.":
    "inside the bot — older ones are deleted automatically, while GitHub keeps them permanently.",
  "Bật lên là bot sao lưu bản đầu tiên trong khoảng 1 phút, sau đó lặp lại theo chu kỳ bạn chọn.":
    "Switch it on and the bot takes its first backup within about a minute, then repeats on the cycle you chose.",
  "(.msc/.json tải lên). Phần tắt sẽ được bỏ qua khi khôi phục (kênh, tin nhắn và media vẫn xử lý bình thường).":
    "(.msc/.json uploads). Anything switched off is skipped during a restore (channels, messages and media are still processed as usual).",
  "Đã gửi yêu cầu tạo backup — bot xử lý trong khoảng 3 phút":
    "Backup requested — the bot runs it within about 3 minutes",
  "Đang tạo backup — bot quét yêu cầu mỗi khoảng 3 phút. Kết quả hiện ngay tại đây.":
    "Backup in progress — the bot picks up requests about every 3 minutes. The result appears right here.",
  "Bot đã tạo xong bản backup mới": "The bot finished creating a new backup",
  "Bản backup mới đã có trong danh sách bên dưới và được lưu trên cloud.":
    "The new backup is in the list below and stored in the cloud.",
  "Server không có thay đổi kể từ bản backup gần nhất":
    "The server has not changed since the last backup",
  'Bot không tạo bản trùng lặp. Bật "Kèm tin nhắn" hoặc chỉnh cấu trúc server rồi bấm Backup ngay lại nếu bạn cần một bản mới.':
    'The bot does not create duplicate copies. Turn on "Include messages" or change the server structure, then press Backup now again if you need a fresh copy.',
  "Bot vẫn chưa xử lý xong yêu cầu backup": "The bot has not finished the backup request yet",
  "Bot online nhưng chưa xử lý xong — server lớn kèm tin nhắn có thể mất vài phút; nếu quá lâu hãy cập nhật bot lên bản mới nhất.":
    "The bot is online but has not finished — a large server with messages can take a few minutes; if it drags on, update the bot to the latest version.",
  "Bot đang OFFLINE — khởi động bot trên host rồi bấm Backup ngay lại.":
    "The bot is OFFLINE — start it on the host, then press Backup now again.",
  "Bot không lưu được bản backup. Đọc lý do ở khung đỏ phía trên, khắc phục rồi bấm Backup ngay lại.":
    "The bot could not store the backup. Read the reason in the red box above, fix it, then press Backup now again.",
  "Chọn kênh gửi trước khi bật tính năng này.":
    "Pick a destination channel before turning this on.",
  "Đã lưu kênh gửi": "Destination channel saved",
  "Đã yêu cầu khôi phục — bot thực hiện trong khoảng 1 phút":
    "Restore requested — the bot runs it within about 1 minute",

  /* ==== Lô 4 — viết lại copy panel AutoReply / Welcome & Goodbye / Giveaway / ReactionRoles. */
  "Bot tự trả lời khi tin nhắn chứa từ khóa hoặc tag @bot":
    "The bot replies automatically when a message contains a keyword or tags @bot",
  "Chưa có rule nào. Tạo rule đầu tiên để bot tự trả lời khi ai đó gõ từ khóa hoặc tag bot.":
    "No rules yet. Create your first one and the bot replies whenever someone types a keyword or tags it.",
  "Bot trả lời thành viên mỗi khi điều kiện kích hoạt bên dưới được thỏa.":
    "The bot replies to a member whenever the trigger below matches.",
  'Đã bật rule "{p0}"': 'Enabled rule "{p0}"',
  'Đã tắt rule "{p0}"': 'Disabled rule "{p0}"',
  "Giãn cách giữa các lần trả lời (giây, 0 = không giới hạn)":
    "Gap between replies (seconds, 0 = unlimited)",
  "Gửi lời chào vào kênh bạn chọn mỗi khi có thành viên tham gia":
    "Posts a welcome message in the channel you pick whenever a member joins",
  "Gửi lời tạm biệt khi có thành viên rời server":
    "Posts a farewell message when a member leaves the server",
  "Mỗi dòng là một câu — bot chọn ngẫu nhiên mỗi lượt vào/rời server để tin nhắn không bị nhàm. Điền vào đây thì phần này thay cho nội dung ở trên.":
    "One sentence per line — the bot picks one at random on every join or leave so the greeting never gets stale. Fill this in and it replaces the message above.",
  "Đã lưu — bot áp dụng trong khoảng 3 phút": "Saved — the bot applies it within about 3 minutes",
  "Đang bật thì phải chọn kênh gửi, hoặc tắt tính năng này.":
    "While this is on you have to pick a channel, or turn the feature off.",
  "Màu phải ở dạng #hex, ví dụ #57f287": "The colour must be #hex, for example #57f287",
  "Gửi lời chào riêng qua tin nhắn trực tiếp (DM) cho thành viên mới":
    "Sends a private welcome to the new member's DMs",
  "Tự gán role cho thành viên mới ngay khi họ vào server":
    "Assigns a role to every new member the moment they join",
  "Role gán tự động": "Role assigned automatically",
  "Chờ trước khi gán (giây, 0–120)": "Delay before assigning (seconds, 0–120)",
  "Mặc định tắt — bot mới vào server không nhận role tự động":
    "Off by default — bots joining the server get no automatic role",
  "Chống raid: khi server đang khóa vì raid, autorole tạm dừng để không gán role cho loạt tài khoản ập vào.":
    "Anti-raid: while the server is locked down for a raid, autorole pauses so it never mass-assigns roles to a flood of accounts.",
  "Tắt = gửi tin nhắn thường, không có khung embed.": "Off = a plain message with no embed frame.",
  "Chào mừng {user} đến {server}!\nRất vui có {username} trong nhà!\nNgười thứ {count} vừa xuất hiện 🎉":
    "Welcome {user} to {server}!\nGreat to have {username} here!\nMember number {count} just showed up 🎉",
  "Chọn mẫu tin nhắn, thêm ảnh, viết lời dẫn và cấp role thưởng tự động — bot chọn người thắng rồi thông báo.":
    "Pick a message template, add an image, write the intro text and auto-grant a prize role — the bot picks the winners and announces them.",
  "Đã tạo giveaway — bot gửi trong khoảng 1 phút 🎉":
    "Giveaway created — the bot posts it within about 1 minute 🎉",
  "⚠️ Bot không gửi được giveaway:": "⚠️ The bot could not post the giveaway:",
  "Chưa có giveaway nào. Tạo cái đầu tiên để chúc mừng thành viên 🎀":
    "No giveaways yet. Create the first one to celebrate your members 🎀",
  "Bot gửi embed giveaway kèm phản ứng 🎉 theo mẫu bạn chọn (thêm ảnh nếu muốn). Hết giờ, bot tự chọn người thắng, cấp role thưởng (nếu có) và thông báo.":
    "The bot posts the giveaway embed with a 🎉 reaction using the template you picked (add an image if you like). When time is up it picks the winners, grants the prize role if set, and announces them.",
  "Lời dẫn tùy chỉnh (hiện ở đầu embed, để trống = dùng giải thưởng)":
    "Custom intro text (shown at the top of the embed; leave empty to use the prize)",
  "Bot nhắn riêng kèm giải thưởng cho từng người thắng":
    "The bot DMs every winner with their prize",
  "Thành viên bấm emoji dưới tin nhắn để tự nhận hoặc gỡ role. Tùy chỉnh được tên, mô tả, thumbnail và từng cặp emoji → role.":
    "Members click an emoji under the message to add or remove a role. You can customise the title, description, thumbnail and every emoji → role pair.",
  "Mỗi dòng cần có emoji và role được chọn": "Each row needs an emoji and a role",
  "Đã cập nhật bảng — bot gửi bảng mới trong khoảng 1 phút":
    "Panel updated — the bot posts the new panel within about 1 minute",
  "Đã tạo bảng — bot gửi tin nhắn trong khoảng 1 phút":
    "Panel created — the bot posts the message within about 1 minute",
  "Bot gửi bảng mới với nội dung đã chỉnh trong khoảng 1 phút (tin nhắn cũ vẫn còn).":
    "The bot posts a new panel with your edits within about 1 minute (the old message stays).",
  "Bot gửi một tin nhắn vào kênh đã chọn kèm các emoji; thành viên bấm emoji để nhận role.":
    "The bot posts a message with the emojis in the channel you picked; members click an emoji to get the role.",

  /* ==== Lô 5 — viết lại copy panel ModActions / Dm / Hidden / Unlock / Whitelist / ExternalAppRaids. */
  "Chưa có hình phạt nào — server đang yên bình 🎉": "No punishments yet — the server is calm 🎉",
  "(hình phạt, lý do, người xử lý) và tách rõ nguồn:":
    "(the punishment, the reason, who handled it) and a clear split by source:",
  "Đã gửi yêu cầu — bot gửi DM trong khoảng 1 phút 💌":
    "Request sent — the bot sends the DM within about 1 minute 💌",
  "Gửi tin nhắn riêng (DM)": "Send a direct message (DM)",
  "Nhập ID người dùng Discord và nội dung, bot sẽ nhắn riêng cho họ. (Bật Chế độ nhà phát triển trong Discord → chuột phải tên người dùng → Sao chép ID người dùng)":
    "Enter the Discord user ID and your text and the bot will DM that person. (Turn on Developer Mode in Discord → right-click the user → Copy User ID)",
  "Reaction role, giveaway, nhắn tin riêng, auto reply và tùy chỉnh giao diện — chỉ admin sở hữu bot mở khóa bằng mật khẩu mới dùng được.":
    "Reaction role, giveaway, direct messages, auto reply and interface branding — only the bot-owning admin can use them, after unlocking with the password.",
  "mới được thao tác mật khẩu và mở khóa tính năng ẩn — chủ hay mod của một server không thay thế được.":
    "can touch the password and unlock the hidden area — being the owner or a mod of a server is not enough.",
  "Chưa thiết lập chủ sở hữu. Người tạo bot cần đăng nhập bằng chính tài khoản Discord đã tạo bot, vào":
    "No owner set up yet. Whoever created the bot has to sign in with the very Discord account that created it, then open",
  "Sai mật khẩu rồi, thử lại nhé!": "Wrong password — try again!",
  "Mục này được bảo vệ bằng mật khẩu do chủ sở hữu bot đặt. Chỉ người biết mật khẩu mới xem được nội dung bên trong.":
    "This section is protected by a password set by the bot owner. Only someone who knows it can see what is inside.",
  "Đã lưu danh sách trắng — bot áp dụng trong khoảng 3 phút":
    "Whitelist saved — the bot applies it within about 3 minutes",
  "Người dùng và role trong danh sách này": "Users and roles on this list",
  ". Mỗi server giữ danh sách trắng riêng, không chia sẻ sang server khác.":
    ". Every server keeps its own whitelist; nothing is shared with other servers.",
  "Role Mod và Admin cấu hình trong Cài đặt vẫn hoạt động riêng — danh sách này dành cho role tùy chỉnh (ví dụ VIP, YouTuber, Staff…).":
    "Mod and Admin roles from Settings keep working separately — this list is for custom roles (VIP, YouTuber, Staff…).",
  "ID Discord, VD: 123456789012345678 (cách nhau bằng dấu phẩy hoặc khoảng trắng)":
    "Discord IDs, e.g. 123456789012345678 (separated by commas or spaces)",
  ": spam, từ ngữ xấu, link mời, link độc hại, file nguy hiểm, raid thành viên, ban/kick hàng loạt, tạo/xóa kênh và role hàng loạt, webhook/thread hàng loạt… Người dùng và role trong danh sách được bỏ qua hoàn toàn — không cộng nhiệt, không xóa tin, không ban. Danh sách này":
    ": spam, bad words, invite links, malicious links, dangerous files, member raids, mass bans/kicks, mass channel and role create/delete, webhook or thread flooding… Users and roles on the list are skipped entirely — no heat, no deleted messages, no bans. This list",
  "Lưu ý: danh sách này không miễn trừ Join Gate — tính năng chống selfbot khi vào server có danh sách trắng riêng trong mục Join Gate.":
    "Note: this list does not exempt Join Gate — the anti-selfbot check on join keeps its own whitelist under Join Gate.",
  "đã xử lý": "handled",
  "Chưa có vụ raid bằng ứng dụng ngoài nào bị chặn": "No external-app raid blocked yet",
  "(hoặc một app đáng ngờ: giả mạo app nổi tiếng, tên scam, do tài khoản mới kết nối, app spam @everyone kèm link lừa đảo), vụ đó xuất hiện ở đây kèm kết luận của AI, danh sách ứng dụng và người dùng đã bị xử lý.":
    "(or a suspicious app: impersonating a well-known app, a scam name, connected by a brand-new account, or an app spamming @everyone with scam links), the incident shows up here with the AI verdict, the apps involved and the users that were handled.",
  "người dùng app có đang raid không. AI học các dạng raid app ngoài (tài khoản phụ cài app, app giả mạo hoặc tên scam, spam @everyone kèm link lừa đảo, webhook spam) để chặn cả biến thể tương tự: app nào được kết nối, ai đã bị xử lý.":
    "whether the app users are actually raiding. The AI learns the shapes of external-app raids (sockpuppet accounts installing apps, fake or scam-named apps, @everyone spam with scam links, webhook spam) so it can stop look-alike variants too: which app connected, and who was handled.",

  /* ==== Lô 6 — viết lại nốt copy ModerationPanel + bảng nhiệt (HeatBar). */
  "Hệ số tái phạm (lần)": "Repeat multiplier (times)",
  "Mỗi từ tối đa 40 ký tự": "Each word can be up to 40 characters",
  ". Đủ số warn trong cửa sổ thời gian thì hình phạt tự":
    ". Once the warn count is reached inside the time window the punishment",
  "lên một mức nặng hơn. Cơ chế này chạy song song với hệ thống nhiệt.":
    "to a heavier level. This mechanism runs alongside the heat system.",
  "Đang tắt — mọi module chỉ cảnh báo, không tự tăng cấp theo số lần warn.":
    "Off — every module only warns; nothing escalates by warn count.",
  "Danh sách từ ngữ xấu": "Bad-word list",
  "Chưa có ai vi phạm — server đang rất an toàn 🎉":
    "Nobody has broken a rule — the server is very safe 🎉",
  "Bảng đang trống — chưa thành viên nào có nhiệt hay warn 🎉":
    "Nothing to show — no member has heat or warns 🎉",
  /* ==== Lô 7 — bọc translate() cho 2 description nội suy + window.confirm của
     BackupPanel. Danh sách tùy chỉnh ghép từ các MỤC ĐÃ DỊCH (không nối mảnh
     câu tiếng Việt), nên mục bỏ qua mang tiền tố ⏭️ như log embed của bot. */
  role: "roles",
  "emoji/sticker": "emoji/stickers",
  "các kênh": "channels",
  "⏭️ bỏ qua {p0}": "⏭️ skip {p0}",
  "không phần nào": "nothing",
  "Phần khôi phục: {p0} · BỎ QUA: {p1}.": "Restoring: {p0} · SKIPPED: {p1}.",
  "Phần khôi phục: {p0} (tất cả).": "Restoring: {p0} (everything).",
  "Bot tự nhận diện định dạng (JSON thường, base64 hoặc có lớp bọc), dựng lại kênh đúng thứ tự cùng role/emoji/sticker theo Tùy chỉnh khôi phục, rồi phục hồi tin nhắn kèm media (ảnh/video…). Lỗi (nếu có) sẽ hiện ngay khi bot báo lại.":
    "The bot detects the format itself (plain JSON, base64 or wrapped), rebuilds the channels in the right order plus roles and emoji/stickers according to your Restore options, then restores messages with their media (images/videos…). Any error shows up as soon as the bot reports back.",
  'Khôi phục backup của "{p0}" vào server hiện tại?':
    'Restore the backup of "{p0}" into the current server?',
  "Bot dựng lại cấu trúc theo backup (kênh đúng thứ tự, kèm role và emoji/sticker nếu backup có) rồi phục hồi tin nhắn cùng media (ảnh/video…), theo đúng Tùy chỉnh khôi phục bên dưới. Các role/kênh đang có của server này được giữ nguyên.":
    "The bot rebuilds the structure from the backup (channels in the right order, plus roles and emoji/stickers when the backup has them) and then restores messages with their media (images/videos…), following the Restore options below. Roles and channels already on this server stay untouched.",
  "Tùy chỉnh đang áp dụng: {p0}.": "Options in effect: {p0}.",

  // ── Plan A — mua bằng chuyển khoản ngân hàng (Premium + Admin) ──────────
  "Chuyển khoản để mua": "Pay by bank transfer",
  "Chuyển khoản mua gói Premium": "Bank transfer to buy Premium",
  "Thanh toán một lần qua chuyển khoản — không tự động gia hạn":
    "One-time bank transfer payment — no automatic renewal",
  "Quét mã QR để chuyển khoản": "Scan the QR code to transfer",
  "Số tiền": "Amount",
  "Nội dung chuyển khoản (bắt buộc)": "Transfer reference (required)",
  "SĐT nhận tiền": "Recipient phone number",
  "Mã QR nhận chuyển khoản của NGUYEN DUY KHIEM": "QR code for transfers to NGUYEN DUY KHIEM",
  "Đã sao chép": "Copied",
  "Bước 1: Mở app ngân hàng hoặc ví điện tử, quét mã QR bên phải.":
    "Step 1: Open your banking app or e-wallet and scan the QR code on the right.",
  "Bước 2: Chuyển đúng SỐ TIỀN và gõ đúng NỘI DUNG ở trên.":
    "Step 2: Transfer the exact AMOUNT and enter the exact REFERENCE above.",
  'Bước 3: Bấm nút "Tôi đã chuyển khoản" và chờ xác nhận.':
    'Step 3: Tap "I have transferred" and wait for confirmation.',
  "đang tải trạng thái…": "loading status…",
  "Đang tạo mã chuyển khoản…": "Creating transfer code…",
  "Tôi đã chuyển khoản": "I have transferred",
  "Đóng hướng dẫn": "Close instructions",
  "Bấm sau khi bạn ĐÃ chuyển xong — chủ bot so sao kê rồi kích hoạt gói.":
    "Tap this after you HAVE transferred — the bot owner checks the statement and activates your plan.",
  "Đã báo chuyển khoản — chờ chủ bot xác nhận":
    "Transfer reported — waiting for the bot owner to confirm",
  "Thanh toán thành công": "Payment successful",
  "Gói {goi} đã được kích hoạt — dùng tới {ngay}": "Your {goi} plan is active — valid until {ngay}",
  "Gói của bạn đã được kích hoạt. Cảm ơn bạn đã ủng hộ!":
    "Your plan is now active. Thank you for your support!",
  "Không tạo được mã chuyển khoản — thử lại sau ít phút.":
    "Could not create the transfer code — please try again in a few minutes.",
  "Không báo được trạng thái — thử lại sau.":
    "Could not report the status — please try again later.",
  "Đơn này đã hết hạn hoặc bị đóng — hãy tạo mã chuyển khoản mới.":
    "This order expired or was closed — create a new transfer code.",
  "Gói được kích hoạt chậm nhất 24 giờ sau khi xác nhận đã nhận tiền (thường là ngay lập tức).":
    "Your plan is activated within 24 hours of the payment being confirmed (usually immediately).",
  "Quá 24 giờ chưa kích hoạt? Báo tại Discord kèm mã đơn {ma}.":
    "Not activated after 24 hours? Report it on Discord with the order code {ma}.",
  "Chính sách mua bán & cam kết dịch vụ": "Purchase policy & service commitment",
  "Gói Premium có hiệu lực 30 ngày kể từ khi thanh toán được xác nhận. Mỗi lần mua là một giao dịch riêng, không tự động gia hạn và không lưu thông tin thẻ hay tài khoản ngân hàng của bạn.":
    "A Premium plan is valid for 30 days from the moment the payment is confirmed. Each purchase is a separate transaction, it never renews automatically, and we do not store your card or bank account details.",
  "Thời gian kích hoạt — chậm nhất 24 giờ:": "Activation time — at most 24 hours:",
  "thường là ngay sau khi chủ bot xác nhận đã nhận tiền; trong mọi trường hợp gói được kích hoạt chậm nhất 24 giờ kể từ thời điểm đó.":
    "usually right after the bot owner confirms the payment was received; in every case the plan is activated within 24 hours of that moment.",
  "Quá 24 giờ thì sao:": "What if it takes longer than 24 hours:",
  "nếu quá 24 giờ chưa được kích hoạt, hãy báo tại Discord của chủ bot kèm MÃ ĐƠN (nội dung chuyển khoản). Khiếu nại được xử lý trong 24 giờ tiếp theo; nếu vẫn không kích hoạt được vì lỗi từ phía dịch vụ, bạn được HOÀN 100% số tiền đã chuyển.":
    "if it is still not activated after 24 hours, report it on the bot owner's Discord with your ORDER CODE (the transfer reference). Complaints are handled within the next 24 hours; if it still cannot be activated because of a fault on our side, you receive a 100% REFUND of the amount you transferred.",
  "Hoàn tiền:": "Refunds:",
  "hoàn 100% trong 7 ngày kể từ khi xác nhận nếu lỗi phát sinh từ phía dịch vụ khiến bạn không dùng được gói (không kích hoạt, lỗi kéo dài không khắc phục được). Dịch vụ là phần mềm phi vật thể nên không áp dụng đổi trả hàng hóa; khiếu nại xử lý theo hướng hoàn tiền hoặc kích hoạt lại, do bạn chọn.":
    "a 100% refund within 7 days of confirmation if the fault is on the service side and keeps you from using the plan (no activation, a lasting failure that cannot be fixed). The service is intangible software, so goods returns do not apply; complaints are resolved either by refund or by re-activation, your choice.",
  "Thanh toán an toàn:": "Safe payment:",
  "chỉ quét mã QR do trang này hiển thị và kiểm tra đúng chủ ví NGUYEN DUY KHIEM trước khi chuyển. Chủ bot KHÔNG BAO GIỜ yêu cầu bạn cung cấp mật khẩu ví, mã OTP hay thông tin thẻ.":
    "only scan the QR code shown on this page and check that the wallet owner really is NGUYEN DUY KHIEM before transferring. The bot owner NEVER asks you for your wallet password, OTP code or card details.",
  "Cơ sở pháp lý:": "Legal basis:",
  "giao dịch được lập bằng hình thức điện tử theo Bộ luật Dân sự 2015 (Điều 119); quyền lợi người tiêu dùng theo Luật Bảo vệ quyền lợi người tiêu dùng số 19/2023/QH15; mua bán qua trang mạng theo Luật Thương mại điện tử số 51/2005/QH11 (sửa đổi, bổ sung). Khiếu nại gửi qua Discord của chủ bot và được phản hồi trong 48 giờ.":
    "the transaction is made in electronic form under the 2015 Civil Code (Article 119); consumer rights under the Law on Protection of Consumer Rights No. 19/2023/QH15; online sales under the Law on E-Commerce No. 51/2005/QH11 (as amended). Complaints are sent via the bot owner's Discord and answered within 48 hours.",
  "Bằng việc bấm mua, bạn xác nhận đã đọc chính sách này. Thanh toán là giao dịch giữa bạn và chủ ví được nêu trên — Protogon chỉ lưu mã đơn và trạng thái để kích hoạt gói.":
    "By clicking buy you confirm that you have read this policy. The payment is a transaction between you and the wallet owner named above — Protogon only stores the order code and status in order to activate the plan.",

  // ── Admin: đơn chờ xác nhận + tổng doanh thu ────────────────────────────
  "Đơn chuyển khoản chờ xác nhận": "Bank transfers awaiting confirmation",
  "Hiện không có đơn nào chờ xác nhận.": "No orders are awaiting confirmation right now.",
  "Mua premium": "Premium purchase",
  Gói: "Plan",
  "báo lúc": "reported at",
  "Đã nhận tiền → kích hoạt": "Payment received → activate",
  "Đã nhận tiền và kích hoạt gói.": "Payment received — plan activated.",
  "Tổng doanh thu theo tháng / năm": "Total revenue by month / year",
  "tổng cộng": "total",
  "giao dịch": "transactions",
  "Theo tháng": "By month",
  Tháng: "Month",
  "Số GD": "Orders",
  "Doanh thu": "Revenue",
  "Chưa có giao dịch.": "No transactions yet.",
  "Theo năm": "By year",

  // ── Đồng ý điều khoản + hạn mức theo server (08/10/2026) ────────────────
  "Xác nhận mua gói": "Confirm purchase",
  "Xác nhận mua gói {goi}": "Confirm the {goi} purchase",
  "Server được mở gói": "Server to unlock",
  "Server được mở:": "Server being unlocked:",
  "Server này đang dùng gói Miễn phí.": "This server is on the Free plan.",
  "Server này đang dùng gói {goi} — hạn tới {ngay}.":
    "This server is on the {goi} plan — valid until {ngay}.",
  "Gói áp dụng theo TỪNG SERVER: hạn mức nâng lên chỉ có hiệu lực ở server bạn chọn tại đây.":
    "Plans apply PER SERVER: the higher limits only take effect on the server you pick here.",
  "Bạn chưa quản lý server nào có bot Protogon — hãy mời bot vào server trước.":
    "You do not manage any server with the Protogon bot yet — invite the bot to a server first.",
  "Hãy chọn server cần mở gói trước khi mua.": "Choose the server to unlock before buying.",
  "Gói KHÔNG được cấp tự động — bạn chỉ nhận được sau khi admin kiểm tra và kích hoạt.":
    "The plan is NOT granted automatically — you only receive it after an admin verifies and activates it.",
  "Thời gian kích hoạt chậm nhất 24 giờ kể từ khi xác nhận đã nhận tiền; nhanh hơn thì thường là ngay.":
    "Activation within 24 hours of the payment being confirmed; usually it is immediate.",
  'Sau khi chuyển khoản, bấm "Tôi đã chuyển khoản" để admin đối soát đúng đơn của bạn.':
    'After transferring, tap "I have transferred" so an admin can match your order.',
  "Quá 24 giờ chưa kích hoạt thì báo tại Discord chủ bot kèm mã đơn — hoàn 100% nếu lỗi từ phía dịch vụ.":
    "Not activated after 24 hours? Report it on the bot owner's Discord with your order code — a 100% refund if the fault is on the service side.",
  "Tôi đã đọc và đồng ý Điều khoản dịch vụ cùng Chính sách mua bán — hiểu rằng gói không được cấp tự động và chỉ được kích hoạt sau khi admin xác nhận, chậm nhất 24 giờ.":
    "I have read and agree to the Terms of Service and the Purchase policy — and I understand the plan is not granted automatically and is only activated after an admin confirms, within 24 hours at the latest.",
  "Tôi đồng ý và tạo mã chuyển khoản": "I agree and create the transfer code",
  "Điều khoản phiên bản {v}.": "Terms version {v}.",
  "Điều khoản dịch vụ": "Terms of Service",
  "Chính sách mua bán": "Purchase policy",
  "Gói không được cấp tự động: sau khi chuyển khoản, admin đối soát rồi kích hoạt — chậm nhất 24 giờ.":
    "The plan is not granted automatically: after your transfer an admin matches it and activates — within 24 hours at the latest.",
  "Còn khoảng {gio} giờ trước mốc cam kết 24 giờ.":
    "About {gio} hours left before the 24-hour commitment.",
  "Đã quá cam kết 24 giờ — báo ngay tại Discord kèm mã đơn để được xử lý.":
    "The 24-hour commitment has passed — report it on Discord with your order code right away so it gets handled.",
  "Quá 12 giờ chưa xác nhận": "Over 12 hours unconfirmed",

  // ── Thẻ gói trong dashboard (PlanCard) ──────────────────────────────────
  "Gói {goi}": "{goi} plan",
  "còn {n} ngày": "{n} days left",
  "Đang áp dụng cho server này — hạn tới {ngay}.": "Active on this server — valid until {ngay}.",
  "Server đang dùng gói Miễn phí — mọi hạn mức ở mức cơ bản.":
    "The server is on the Free plan — every limit is at the basic level.",
  "Gia hạn": "Renew",
  "Nâng gói": "Upgrade",
  "Rule auto reply": "Auto-reply rules",
  "Từ khoá cấm": "Banned words",
  "Bản backup giữ": "Backups kept",
  "Ngày giữ backup": "Backup retention (days)",
  "Gói sắp hết hạn — hết hạn là hạn mức trở về mức Miễn phí ngay. Gia hạn để giữ nguyên.":
    "The plan is about to expire — once it does the limits drop back to Free immediately. Renew to keep them.",
  "Giữ nguyên toàn bộ tính năng bảo vệ của gói Miễn phí":
    "Keeps every protection from the Free plan",
  "Tối đa {n} rule auto reply mỗi server": "Up to {n} auto-reply rules per server",
  "Tối đa {n} từ khoá cấm cho automod": "Up to {n} banned words for automod",
  "Giữ {n} bản backup gần nhất": "Keep the {n} most recent backups",
  "Giữ backup trong {n} ngày": "Keep backups for {n} days",
  "Cho server lớn cần trần dữ liệu cao nhất và chặn tối đa.":
    "For large servers that need the highest data limits and maximum filtering.",
  "Dành cho server muốn giữ nhiều dữ liệu và chặn nhiều hơn.":
    "For servers that want to keep more data and filter more.",
};
