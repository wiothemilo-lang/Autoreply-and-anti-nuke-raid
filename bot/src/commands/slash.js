/** Slash command definitions (JSON shape for the Discord REST API). */
// Mô tả mặc định là tiếng Việt (sản phẩm gốc). applyLocalizations thêm
// description_localizations (en-US/de) — Discord tự hiển thị theo ngôn ngữ
// client người dùng (interaction.locale), ví dụ trong App Discovery.
const { applyLocalizations } = require("./localizations");
const commands = applyLocalizations([
  {
    name: "help",
    description: "Xem danh sách lệnh của bot",
  },
  {
    name: "ping",
    description: "Kiểm tra độ trễ của bot",
  },
  {
    name: "health",
    description: "Xem sức khỏe AI: provider, cache, giới hạn gọi (mod/admin)",
  },
  {
    name: "prefix",
    description: "Xem hoặc đổi prefix lệnh text",
    options: [
      {
        name: "set",
        description: "Prefix mới (1-3 ký tự đặc biệt)",
        type: 3,
        required: false,
      },
    ],
  },
  {
    name: "autoreply",
    description: "Quản lý auto reply theo từ khóa / @mention",
    options: [
      {
        name: "add",
        description: "Thêm (hoặc cập nhật) rule auto reply",
        type: 1,
        options: [
          { name: "name", description: "Tên rule (chữ, số, _ -)", type: 3, required: true },
          {
            name: "trigger",
            description: "keyword | mention",
            type: 3,
            required: true,
            choices: [
              { name: "Từ khóa trong tin nhắn", value: "keyword" },
              { name: "Tag bot (@protogon)", value: "mention" },
            ],
          },
          {
            name: "response",
            description: "Nội dung trả lời ({user} để tag)",
            type: 3,
            required: true,
          },
          {
            name: "keywords",
            description: "Từ khóa, phân cách bằng dấu phẩy",
            type: 3,
            required: false,
          },
          {
            name: "cooldown",
            description: "Cooldown giây (0 = không giới hạn)",
            type: 4,
            required: false,
          },
        ],
      },
      {
        name: "edit",
        description: "Sửa nội dung trả lời / cooldown của rule",
        type: 1,
        options: [
          { name: "name", description: "Tên rule cần sửa", type: 3, required: true },
          {
            name: "response",
            description: "Nội dung trả lời mới ({user} để tag)",
            type: 3,
            required: false,
          },
          { name: "cooldown", description: "Cooldown giây mới", type: 4, required: false },
        ],
      },
      {
        name: "list",
        description: "Xem danh sách rule auto reply",
        type: 1,
      },
      {
        name: "remove",
        description: "Xóa rule auto reply",
        type: 1,
        options: [{ name: "name", description: "Tên rule", type: 3, required: true }],
      },
    ],
  },
  {
    name: "antinuke",
    description: "Quản lý chống nuke / raid",
    options: [
      { name: "status", description: "Xem trạng thái chống nuke", type: 1 },
      { name: "on", description: "Bật toàn bộ chống nuke", type: 1 },
      { name: "off", description: "Tắt toàn bộ chống nuke", type: 1 },
      {
        name: "module",
        description: "Bật/tắt một module cụ thể",
        type: 1,
        options: [
          { name: "module", description: "Tên module", type: 3, required: true },
          { name: "value", description: "on | off", type: 3, required: true },
        ],
      },
      {
        name: "unlock",
        description: "Mở khóa kênh ngay lập tức",
        type: 1,
      },
      {
        name: "lockdown",
        description: "Bật/tắt khóa kênh tự động khi raid",
        type: 1,
        options: [{ name: "value", description: "on | off", type: 3, required: true }],
      },
    ],
  },
  {
    name: "badword",
    description: "Quản lý danh sách từ ngữ xấu (bad word)",
    options: [
      {
        name: "add",
        description: "Thêm từ ngữ xấu",
        type: 1,
        options: [{ name: "word", description: "Từ ngữ cần chặn", type: 3, required: true }],
      },
      {
        name: "remove",
        description: "Xóa từ ngữ xấu",
        type: 1,
        options: [{ name: "word", description: "Từ ngữ cần bỏ chặn", type: 3, required: true }],
      },
      {
        name: "list",
        description: "Xem danh sách từ ngữ xấu",
        type: 1,
      },
    ],
  },
  {
    name: "heat",
    description: "Xem mức nhiệt độ vi phạm và độ an toàn của server",
    options: [
      {
        name: "status",
        description: "Xem trạng thái nhiệt độ & độ an toàn",
        type: 1,
      },
    ],
  },
  {
    name: "mod",
    description: "Công cụ mod: timeout, kick, ban, purge (ghi log lý do + người thực hiện)",
    options: [
      {
        name: "timeout",
        description: "Tạm khóa thành viên trong một khoảng thời gian",
        type: 1,
        options: [
          { name: "user", description: "Thành viên cần timeout", type: 6, required: true },
          {
            name: "duration",
            description: "Thời lượng: 10m, 2h, 1d, hoặc số phút (tối đa 7 ngày)",
            type: 3,
            required: true,
          },
          { name: "reason", description: "Lý do", type: 3, required: false },
        ],
      },
      {
        name: "kick",
        description: "Kick thành viên khỏi server",
        type: 1,
        options: [
          { name: "user", description: "Thành viên cần kick", type: 6, required: true },
          { name: "reason", description: "Lý do", type: 3, required: false },
        ],
      },
      {
        name: "ban",
        description: "Ban thành viên khỏi server",
        type: 1,
        options: [
          { name: "user", description: "Thành viên cần ban", type: 6, required: true },
          { name: "reason", description: "Lý do", type: 3, required: false },
          {
            name: "delete_days",
            description: "Xóa tin nhắn của họ trong N ngày (0-7)",
            type: 4,
            required: false,
          },
        ],
      },
      {
        name: "purge",
        description: "Xóa hàng loạt tin nhắn trong kênh hiện tại",
        type: 1,
        options: [
          {
            name: "count",
            description: "Số tin nhắn cần xóa (1-100)",
            type: 4,
            required: true,
          },
        ],
      },
      {
        name: "untimeout",
        description: "Gỡ timeout (tạm khóa) cho thành viên",
        type: 1,
        options: [
          { name: "user", description: "Thành viên cần gỡ timeout", type: 6, required: true },
          { name: "reason", description: "Lý do", type: 3, required: false },
        ],
      },
      {
        name: "unban",
        description: "Gỡ ban cho thành viên",
        type: 1,
        options: [
          { name: "user", description: "Thành viên cần gỡ ban", type: 6, required: true },
          { name: "reason", description: "Lý do", type: 3, required: false },
        ],
      },
      {
        name: "unwarn",
        description: "Gỡ toàn bộ warn tích lũy của thành viên",
        type: 1,
        options: [
          { name: "user", description: "Thành viên cần gỡ warn", type: 6, required: true },
          { name: "reason", description: "Lý do", type: 3, required: false },
        ],
      },
    ],
  },
  {
    name: "giveaway",
    description: "Quản lý giveaway ngay trong Discord",
    options: [
      {
        name: "start",
        description: "Tạo giveaway mới tại kênh hiện tại",
        type: 1,
        options: [
          { name: "title", description: "Tên giveaway", type: 3, required: true },
          { name: "prize", description: "Giải thưởng", type: 3, required: true },
          {
            name: "duration",
            description: "Thời lượng: 30m, 2h, 1d (tối đa 7 ngày)",
            type: 3,
            required: true,
          },
          {
            name: "winners",
            description: "Số người thắng (1-20, mặc định 1)",
            type: 4,
            required: false,
          },
          {
            name: "prize_role",
            description: "Role tự cấp cho người thắng",
            type: 8,
            required: false,
          },
        ],
      },
      {
        name: "list",
        description: "Xem danh sách giveaway đang chạy",
        type: 1,
      },
      {
        name: "end",
        description: "Kết thúc giveaway sớm (bot chốt người thắng)",
        type: 1,
        options: [
          { name: "title", description: "Tên giveaway cần kết thúc", type: 3, required: true },
        ],
      },
    ],
  },
  {
    name: "reactionrole",
    description: "Quản lý bảng reaction role (bấm emoji nhận role)",
    options: [
      {
        name: "list",
        description: "Xem danh sách bảng reaction role",
        type: 1,
      },
      {
        name: "create",
        description: "Tạo bảng reaction role mới",
        type: 1,
        options: [
          { name: "channel", description: "Kênh gửi bảng", type: 7, required: true },
          { name: "label", description: "Tên bảng", type: 3, required: true },
          {
            name: "pairs",
            description: "Cặp emoji:role, cách nhau khoảng trắng (VD: ✅:123 ⭐:456)",
            type: 3,
            required: true,
          },
          {
            name: "description",
            description: "Nội dung / mô tả hiển thị trong embed",
            type: 3,
            required: false,
          },
          {
            name: "thumbnail",
            description: "URL ảnh thumbnail của bảng",
            type: 3,
            required: false,
          },
        ],
      },
      {
        name: "add",
        description: "Thêm cặp emoji + role vào bảng",
        type: 1,
        options: [
          { name: "label", description: "Tên bảng", type: 3, required: true },
          {
            name: "emoji",
            description: "Emoji (unicode / <:name:id> / ID)",
            type: 3,
            required: true,
          },
          { name: "role", description: "Role cần gán khi bấm emoji", type: 8, required: true },
        ],
      },
      {
        name: "remove",
        description: "Gỡ một cặp emoji khỏi bảng",
        type: 1,
        options: [
          { name: "label", description: "Tên bảng", type: 3, required: true },
          { name: "emoji", description: "Emoji cần gỡ", type: 3, required: true },
        ],
      },
      {
        name: "edit",
        description: "Sửa tên / mô tả / thumbnail của bảng (dùng - để xóa)",
        type: 1,
        options: [
          { name: "label", description: "Tên bảng hiện tại", type: 3, required: true },
          { name: "new_label", description: "Tên bảng mới", type: 3, required: false },
          {
            name: "description",
            description: "Mô tả mới (dùng (-) để xóa)",
            type: 3,
            required: false,
          },
          {
            name: "thumbnail",
            description: "URL thumbnail mới (dùng (-) để xóa)",
            type: 3,
            required: false,
          },
        ],
      },
      {
        name: "delete",
        description: "Xóa bảng reaction role",
        type: 1,
        options: [{ name: "label", description: "Tên bảng", type: 3, required: true }],
      },
    ],
  },
  {
    name: "backup",
    description: "Backup server lên đám mây GitHub & khôi phục khi bị nuke phá sập",
    options: [
      {
        name: "now",
        description: "Tạo backup ngay (mặc định đẩy lên GitHub của chủ bot)",
        type: 1,
        options: [
          {
            name: "github",
            description: "Đẩy lên GitHub (bật mặc định) — tắt để chỉ lưu trên Convex",
            type: 5,
            required: false,
          },
        ],
      },
      {
        name: "list",
        description: "Xem danh sách backup của server này",
        type: 1,
      },
      {
        name: "restore",
        description: "Khôi phục cấu trúc server từ một backup",
        type: 1,
        options: [
          {
            name: "index",
            description: "Số thứ tự trong /backup list (1 = bản mới nhất)",
            type: 4,
            required: true,
          },
        ],
      },
      {
        name: "auto",
        description: "Bật/tắt tự động backup định kỳ (2-30 ngày, 0 = tắt)",
        type: 1,
        options: [
          {
            name: "days",
            description: "Số ngày giữa 2 lần backup (2-30; 0 = tắt)",
            type: 4,
            required: true,
          },
        ],
      },
    ],
  },
  {
    name: "research",
    description: "Theo dõi tiến độ học tập của bot (Threat Intel)",
    options: [
      {
        name: "status",
        description: "Xem tiến độ học: số từ khóa đã nhớ, lượt nghiên cứu, nguồn",
        type: 1,
      },
      {
        name: "learn",
        description: "Kích hoạt bot học NGAY từ nguồn mở + AI (thủ công)",
        type: 1,
      },
      { name: "history", description: "Xem 10 lượt học gần nhất", type: 1 },
    ],
  },
  {
    name: "report",
    description: "Báo cáo tình hình server — AI đọc chat dò raid/nuke hoặc phạt nhầm",
    options: [
      {
        name: "ghichu",
        description: "Ghi chú thêm cho AI (VD: bot vừa ban oan @abc)",
        type: 3,
        required: false,
      },
    ],
  },
  {
    name: "setup",
    description: "Cấu hình nhanh bot cho server",
    options: [
      {
        name: "log-channel",
        description: "Chọn kênh nhận cảnh báo chống nuke",
        type: 1,
        options: [{ name: "channel", description: "Kênh log", type: 7, required: true }],
      },
      {
        name: "mod-role",
        description: "Thiết lập role Mod (miễn trừ chống nuke)",
        type: 1,
        options: [{ name: "role", description: "Role Mod", type: 8, required: true }],
      },
      {
        name: "admin-role",
        description: "Thiết lập role Admin (miễn trừ hoàn toàn)",
        type: 1,
        options: [{ name: "role", description: "Role Admin", type: 8, required: true }],
      },
    ],
  },
  {
    name: "verify",
    description: "Cấu hình xác minh thành viên (verify)",
    options: [
      {
        name: "setup",
        description: "Thiết lập kênh + role xác minh",
        type: 1,
        options: [
          { name: "channel", description: "Kênh hiển thị embed xác minh", type: 7, required: true },
          {
            name: "unverified_role",
            description: "Role gán cho thành viên mới (chưa xác minh)",
            type: 8,
            required: true,
          },
          {
            name: "verified_role",
            description: "Role gán sau khi xác minh thành công",
            type: 8,
            required: true,
          },
          {
            name: "method",
            description: "Phương thức xác minh",
            type: 3,
            required: false,
            choices: [
              { name: "Button — bấm nút xác minh", value: "button" },
              { name: "Captcha — nhập mã từ DM", value: "captcha" },
            ],
          },
        ],
      },
      {
        name: "toggle",
        description: "Bật/tắt xác minh thành viên",
        type: 1,
        options: [
          {
            name: "value",
            description: "on hoặc off",
            type: 3,
            required: true,
            choices: [
              { name: "Bật", value: "on" },
              { name: "Tắt", value: "off" },
            ],
          },
        ],
      },
      {
        name: "method",
        description: "Đổi phương thức xác minh",
        type: 1,
        options: [
          {
            name: "type",
            description: "Phương thức",
            type: 3,
            required: true,
            choices: [
              { name: "Button — bấm nút", value: "button" },
              { name: "Captcha — nhập mã DM", value: "captcha" },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "alt",
    description: "Cấu hình phát hiện alt account / VPN",
    options: [
      {
        name: "status",
        description: "Xem trạng thái phát hiện alt account",
        type: 1,
      },
      {
        name: "on",
        description: "Bật phát hiện alt account",
        type: 1,
      },
      {
        name: "off",
        description: "Tắt phát hiện alt account",
        type: 1,
      },
      {
        name: "punish",
        description: "Đổi hình phạt cho alt account",
        type: 1,
        options: [
          {
            name: "type",
            description: "Hình phạt",
            type: 3,
            required: true,
            choices: [
              { name: "Kick", value: "kick" },
              { name: "Ban", value: "ban" },
              { name: "Timeout", value: "timeout" },
              { name: "Verify (gán lại role chưa xác minh)", value: "verify" },
            ],
          },
        ],
      },
      {
        name: "threshold",
        description: "Đổi ngưỡng rủi ro (10-100)",
        type: 1,
        options: [
          {
            name: "value",
            description: "Ngưỡng rủi ro",
            type: 4,
            required: true,
            min_value: 10,
            max_value: 100,
          },
        ],
      },
      {
        name: "vpn",
        description: "Đổi chế độ kiểm tra VPN",
        type: 1,
        options: [
          {
            name: "mode",
            description: "Chế độ VPN",
            type: 3,
            required: true,
            choices: [
              { name: "Nghiêm ngặt (block)", value: "strict" },
              { name: "Cảnh báo (chỉ log)", value: "warn" },
              { name: "Tắt", value: "off" },
            ],
          },
        ],
      },
    ],
  },
]);

module.exports = { commands, applyLocalizations };
