// @i18n-content: nội dung dài 3 thứ tiếng tự chứa (không dùng từ điển key-VI).
//
// Vì sao không để trong i18n.en.ts/i18n.de.ts: 3 văn bản pháp lý × 3 ngôn ngữ là
// ~150 đoạn văn dài; nhét vào từ điển key-tiếng-Việt thì mỗi lần sửa một câu phải
// sửa 3 file, và mắt người không còn đối chiếu được VI ⇄ EN ⇄ DE nữa.
//
// ĐỔI LẠI: scripts/check-i18n.cjs có luật 3f — file mang marker này được miễn
// luật "nhãn dữ liệu phải có bản EN", nhưng phải qua kiểm tra CẤU TRÚC: cây `vi`
// và `en`/`de` phải trùng đường dẫn, không ô nào rỗng, và không đoạn VI nào giữ
// nguyên tiếng Việt ở bản dịch. Thiếu là CI đỏ.

export type LegalLang = "vi" | "en" | "de";

export interface LegalSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface LegalDoc {
  slug: string;
  name: string;
  summary: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}

/** Ngày rà soát gần nhất — hiển thị ở đầu mỗi văn bản. */
export const LEGAL_UPDATED = "09/10/2026";

/**
 * Bố cục cố định: mọi ngôn ngữ phải có ĐÚNG các văn bản này, cùng số mục.
 * Thứ tự trong mảng cũng là thứ tự liên kết chéo giữa các trang.
 */
export const LEGAL_SLUGS = ["terms", "privacy", "data-deletion"] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

const VI: LegalDoc[] = [
  {
    slug: "terms",
    name: "Điều khoản sử dụng",
    summary:
      "Quy định áp dụng khi bạn mời Protogon vào server hoặc dùng dashboard tại protogon.freebuff.app.",
    updated: LEGAL_UPDATED,
    intro:
      "Protogon là bot Discord kèm bảng điều khiển web, do đội ngũ RFTV vận hành và cung cấp miễn phí cho cộng đồng. Khi mời bot vào server, đăng nhập dashboard hoặc dùng bất kỳ tính năng nào, bạn đồng ý với các điều khoản dưới đây. Nếu không đồng ý, hãy gỡ bot khỏi server và ngừng dùng dashboard.",
    sections: [
      {
        heading: "1. Phạm vi và cách hiểu",
        paragraphs: [
          "“Protogon” trong văn bản này gồm hai phần: bot Discord và dashboard web tại protogon.freebuff.app. “Chủ server” là người có quyền quản trị server đã mời bot. “Người dùng” là bất kỳ ai tương tác với bot, kể cả thành viên không phải chủ server.",
          "Bản tiếng Việt là bản gốc và có giá trị áp dụng; bản tiếng Anh và tiếng Đức được cung cấp để bạn đọc thuận tiện.",
        ],
      },
      {
        heading: "2. Điều kiện sử dụng",
        paragraphs: [
          "Bạn cần một tài khoản Discord hợp lệ và phải tuân theo Điều khoản dịch vụ cùng Nguyên tắc cộng đồng của Discord. Protogon không hướng tới người dùng dưới 13 tuổi hoặc dưới độ tuổi tối thiểu theo luật tại nơi bạn sinh sống.",
          "Để cấu hình bot cho một server, bạn phải có quyền quản trị server đó. Protogon không cấp quyền mà bạn chưa có trên Discord.",
          "Để mua gói Premium trên dashboard, bạn phải đủ 18 tuổi và có đầy đủ năng lực hành vi dân sự theo quy định pháp luật; người chưa đủ 18 tuổi chỉ tham gia giao dịch khi có người giám hộ hợp pháp đứng tên.",
        ],
      },
      {
        heading: "3. Trách nhiệm của chủ server",
        paragraphs: [
          "Bot chỉ làm đúng những gì bạn cấu hình, nên chủ server chịu trách nhiệm về cách dùng bot trong server của mình.",
        ],
        bullets: [
          "Cấu hình hợp lệ và phù hợp pháp luật: nội dung tự trả lời, lời chào, danh sách từ khoá lọc, mức hình phạt, whitelist.",
          "Thông báo cho thành viên rằng server có bot lọc nội dung, ghi log hành động và có thể áp dụng hình phạt tự động.",
          "Tiếp nhận và xử lý khiếu nại của thành viên khi bot xử lý nhầm.",
          "Không dùng bot để theo dõi, quấy rối hoặc trấn áp thành viên một cách trái phép.",
        ],
      },
      {
        heading: "4. Hành vi bị cấm",
        paragraphs: [
          "Các hành vi sau đây bị coi là vi phạm điều khoản và có thể dẫn tới chấm dứt quyền sử dụng:",
        ],
        bullets: [
          "Lạm dụng hạ tầng: spam API, dò mật khẩu, thử nghiệm khai thác lỗ hổng mà không báo trước cho chúng tôi.",
          "Dùng Protogon để tấn công, raid hoặc phá server khác.",
          "Dịch ngược, sao chép để bán lại, hoặc giả mạo Protogon dưới bất kỳ hình thức nào.",
          "Dùng tự trả lời, lời chào hoặc webhook để phát tán nội dung vi phạm pháp luật, mã độc, lừa đảo hoặc quấy rối.",
        ],
      },
      {
        heading: "5. Quyền của chúng tôi",
        paragraphs: [
          "Chúng tôi có thể tạm ngừng hoặc chấm dứt quyền dùng bot của một server hay một tài khoản khi phát hiện vi phạm điều khoản, hành vi tấn công hệ thống, hoặc khi cần bảo vệ hạ tầng và dữ liệu của người dùng khác.",
          "Protogon đang phát triển liên tục: tính năng có thể được thêm, thay đổi hoặc gỡ bỏ. Khi một tính năng bị gỡ, chúng tôi cố gắng thông báo trước trong cộng đồng Discord.",
        ],
      },
      {
        heading: "6. Tính khả dụng và hỗ trợ",
        paragraphs: [
          "Protogon được cung cấp miễn phí, không kèm cam kết mức dịch vụ (SLA). Bot có thể gián đoạn khi Discord, nhà cung cấp hạ tầng hoặc dịch vụ AI gặp sự cố; chúng tôi xử lý và thông báo trong kênh cộng đồng.",
          "Hỗ trợ được thực hiện qua kênh Discord của cộng đồng. Thời gian phản hồi phụ thuộc tình trạng thực tế, không phải nghĩa vụ theo hợp đồng.",
        ],
      },
      {
        heading: "7. Giới hạn trách nhiệm",
        paragraphs: [
          "Bot là công cụ hỗ trợ, không thay thế phán đoán của quản trị viên. Bạn nên xem lại log và cấu hình hình phạt định kỳ để bảo đảm bot xử lý đúng ý bạn.",
          "Trong phạm vi pháp luật cho phép, chúng tôi không chịu trách nhiệm cho thiệt hại gián tiếp, mất mát dữ liệu do cấu hình sai, hành vi của thành viên trong server, hoặc quyết định hình phạt mà bot tự động đưa ra theo cấu hình của bạn.",
        ],
      },
      {
        heading: "8. Thay đổi điều khoản và liên hệ",
        paragraphs: [
          "Điều khoản có thể được cập nhật; ngày rà soát gần nhất ghi ở đầu trang. Việc bạn tiếp tục dùng bot sau ngày đó nghĩa là bạn chấp nhận bản mới.",
          "Câu hỏi về điều khoản: gửi trong kênh hỗ trợ của cộng đồng Discord Protogon. Liên kết nằm ở phần chân trang của website.",
        ],
      },
      {
        heading: "9. Luật áp dụng và giải quyết tranh chấp",
        paragraphs: [
          "Điều khoản này chịu sự điều chỉnh của pháp luật Việt Nam. Tranh chấp phát sinh từ việc sử dụng Protogon được ưu tiên giải quyết bằng thương lượng, hòa giải tại kênh hỗ trợ của cộng đồng.",
          "Nếu không đạt được thỏa thuận, một trong hai bên có quyền yêu cầu giải quyết tại trọng tài thương mại hoặc Tòa án có thẩm quyền tại Việt Nam.",
        ],
      },
    ],
  },
  {
    slug: "privacy",
    name: "Chính sách quyền riêng tư",
    summary: "Protogon lưu dữ liệu gì, để làm gì, lưu ở đâu và bạn kiểm soát chúng thế nào.",
    updated: LEGAL_UPDATED,
    intro:
      "Protogon chỉ lưu những dữ liệu cần thiết để bot bảo vệ server và để dashboard hiển thị đúng cấu hình của bạn. Chúng tôi không bán dữ liệu, không dùng dữ liệu cho quảng cáo và không đọc tin nhắn riêng tư của bạn.",
    sections: [
      {
        heading: "1. Tóm tắt nhanh",
        paragraphs: ["Ba điểm quan trọng nhất trước khi đi vào chi tiết:"],
        bullets: [
          "Chúng tôi lưu ID Discord, cấu hình server và bản ghi hành động của bot — không lưu nội dung tin nhắn thường.",
          "Dữ liệu không được bán, không được chia sẻ cho mục đích quảng cáo.",
          "Bạn có thể yêu cầu xoá dữ liệu bất cứ lúc nào; hướng dẫn ở trang Lưu trữ & xoá dữ liệu.",
        ],
      },
      {
        heading: "2. Dữ liệu chúng tôi lưu",
        paragraphs: ["Dữ liệu nằm trong bốn nhóm, tất cả đều phục vụ vận hành bot và dashboard:"],
        bullets: [
          "Tài khoản dashboard: ID Discord, tên người dùng, tên hiển thị, ảnh đại diện, danh sách server bạn có quyền quản lý, thời điểm đăng nhập gần nhất và phiên đăng nhập.",
          "Server: ID, tên, biểu tượng, số lượng thành viên, prefix, cấu hình từng module, kênh và role dùng cho log, whitelist, webhook đã tạo.",
          "Hoạt động của bot: hành động hình phạt kèm lý do và người thực hiện, điểm nhiệt và số lần cảnh báo, sự kiện chống nuke/raid, lượt vào và rời server khi bật Join Gate.",
          "Nội dung bạn tạo: câu tự trả lời, lời chào và tạm biệt, giveaway, bảng reaction role, và file backup khi bạn bật tính năng sao lưu.",
        ],
      },
      {
        heading: "3. Nội dung tin nhắn",
        paragraphs: [
          "Bot đọc tin nhắn trong server để chạy tự trả lời, lọc spam, phát hiện link độc hại và tổng hợp báo cáo khi có raid. Tin nhắn thường không được lưu vào cơ sở dữ liệu.",
          "Chỉ những đoạn bị xử lý mới được ghi lại (nội dung vi phạm, lý do, hình phạt) để mod xem lại và giải trình. Nếu bạn bật sao lưu kèm tin nhắn, nội dung tin nhắn sẽ nằm trong file backup do bạn quản lý.",
          "Bot không đọc tin nhắn riêng tư (DM) giữa các thành viên. Nếu bạn nhắn trực tiếp cho bot, bot chỉ dùng nội dung đó để trả lời bạn.",
        ],
      },
      {
        heading: "4. Mục đích sử dụng",
        paragraphs: ["Dữ liệu chỉ được dùng cho những việc sau:"],
        bullets: [
          "Chạy đúng các tính năng bạn đã bật: tự trả lời, nhiệt độ vi phạm, chống nuke/raid, Join Gate, welcome, hình phạt.",
          "Phòng chống lạm dụng và tấn công: phát hiện raid, chặn bot lạ, chống dò mật khẩu.",
          "Hỗ trợ khi bạn báo sự cố, kèm bằng chứng cần thiết để truy nguyên.",
          "Số liệu sức khoẻ hệ thống ở dạng tổng hợp (số server, số yêu cầu) — không định danh cá nhân.",
        ],
      },
      {
        heading: "5. Nơi lưu trữ và thời hạn",
        paragraphs: [
          "Dữ liệu được lưu trên hạ tầng Convex do Protogon sử dụng, tách theo từng server. Phiên đăng nhập dashboard tự hết hạn theo lựa chọn ghi nhớ của bạn khi đăng nhập.",
          "File backup chỉ được đẩy lên GitHub Gist khi bạn bật tính năng đó và tự cấu hình khoá truy cập. Trong trường hợp này, dữ liệu backup nằm trong tài khoản GitHub của bạn và bạn toàn quyền xoá.",
        ],
      },
      {
        heading: "6. Bên thứ ba",
        paragraphs: [
          "Protogon dựa trên các dịch vụ sau để hoạt động. Chúng tôi không bán hoặc trao dữ liệu cho bên quảng cáo:",
        ],
        bullets: [
          "Discord: nguồn dữ liệu và nơi bot thực thi hành động theo API chính thức.",
          "Convex: lưu trữ cơ sở dữ liệu và chạy backend của dashboard.",
          "GitHub: chỉ nhận file backup khi bạn bật đẩy Gist bằng khoá của bạn.",
          "Nhà cung cấp AI: xử lý trích đoạn hội thoại cần thiết khi bạn dùng báo cáo raid hoặc trợ lý Haimiya, phục vụ đúng yêu cầu đó.",
        ],
      },
      {
        heading: "7. Quyền của bạn",
        paragraphs: [
          "Bạn kiểm soát dữ liệu của server mình ngay trong dashboard. Ngoài ra, bạn có thể liên hệ để được hỗ trợ:",
        ],
        bullets: [
          "Xem và chỉnh sửa cấu hình, danh sách whitelist, câu trả lời và backup trong dashboard.",
          "Yêu cầu xuất hoặc xoá dữ liệu của server hoặc của cá nhân bạn.",
          "Phản đối việc tiếp tục lưu trữ: cách triệt để nhất là gỡ bot khỏi server, sau đó gửi yêu cầu xoá.",
          "Được thông báo rõ mục đích, phạm vi và thời hạn lưu trữ TRƯỚC KHI chúng tôi thu thập thông tin, tự chọn phạm vi thông tin đồng ý cung cấp; khi thay đổi mục đích sử dụng, chúng tôi thông báo lại và xin đồng ý mới.",
        ],
      },
      {
        heading: "8. Bảo mật",
        paragraphs: [
          "Quyền truy cập dashboard dựa trên đăng nhập Discord OAuth2 và được kiểm tra lại ở phía backend cho từng yêu cầu; không có backdoor hay đường tắt bỏ qua xác thực.",
          "Các thao tác quản trị cấp cao cần khoá bot riêng, khoá này được lưu ở dạng băm. File backup có thể được mã hoá AES-256-GCM và kiểm tra toàn vẹn bằng SHA-256 trước khi khôi phục.",
          "Phát hiện sự cố ảnh hưởng dữ liệu: chúng tôi thông báo cho chủ server bị ảnh hưởng qua kênh liên hệ đã đăng ký.",
          "Khi hệ thống thông tin bị tấn công làm phát sinh nguy cơ mất an ninh mạng của người tiêu dùng, chúng tôi thông báo cho cơ quan quản lý nhà nước có thẩm quyền trong thời hạn 24 giờ kể từ thời điểm phát hiện và áp dụng các biện pháp khắc phục cần thiết.",
        ],
      },
      {
        heading: "9. Thay đổi chính sách và liên hệ",
        paragraphs: [
          "Chính sách có thể được cập nhật; ngày rà soát gần nhất ghi ở đầu trang và mọi thay đổi quan trọng được thông báo trong cộng đồng Discord.",
          "Mọi câu hỏi hoặc yêu cầu liên quan dữ liệu: gửi trong kênh hỗ trợ của cộng đồng Discord Protogon kèm ID server hoặc ID người dùng liên quan.",
        ],
      },
    ],
  },
  {
    slug: "data-deletion",
    name: "Lưu trữ & xoá dữ liệu",
    summary:
      "Dữ liệu được giữ trong bao lâu, cách xoá ngay trong dashboard và cách yêu cầu xoá vĩnh viễn.",
    updated: LEGAL_UPDATED,
    intro:
      "Protogon giữ dữ liệu ở mức tối thiểu cần thiết và xoá khi bạn yêu cầu. Trang này nói rõ thời hạn lưu trữ của từng nhóm dữ liệu, những gì bạn tự xoá được trong dashboard, và cách yêu cầu xoá vĩnh viễn.",
    sections: [
      {
        heading: "1. Nguyên tắc",
        paragraphs: [
          "Chúng tôi lưu ít nhất có thể, chỉ để bot vận hành đúng và để bạn xem lại được lịch sử khi cần. Không có bản sao nào được giữ ngoài hệ thống vận hành, trừ file backup mà chính bạn bật đẩy lên GitHub.",
          "Khi bạn yêu cầu xoá, dữ liệu bị xoá khỏi cơ sở dữ liệu đang dùng; bản sao lưu kỹ thuật (nếu có) được ghi đè theo chu kỳ vận hành thông thường.",
        ],
      },
      {
        heading: "2. Thời hạn lưu trữ",
        paragraphs: ["Thời hạn dưới đây áp dụng cho dữ liệu vận hành thường ngày:"],
        bullets: [
          "Phiên đăng nhập dashboard: hết hạn theo lựa chọn ghi nhớ khi bạn đăng nhập; bạn cũng có thể đăng xuất để xoá ngay.",
          "Hành động hình phạt, điểm nhiệt và cảnh báo: giữ tới khi bạn xoá trong dashboard hoặc xoá dữ liệu server.",
          "Sự kiện chống nuke/raid và lượt vào/rời server: chỉ giữ số bản ghi gần nhất để mod xem lại, bản cũ tự bị loại khi vượt giới hạn.",
          "File backup: giữ theo lịch bạn chọn (2–30 ngày một bản); bản cũ trong bot tự bị xoá khi có bản mới, còn bản trên GitHub Gist do bạn quản lý.",
        ],
      },
      {
        heading: "3. Tự xoá ngay trong dashboard",
        paragraphs: [
          "Phần lớn dữ liệu bạn xoá được mà không cần chờ ai: mỗi panel đều có nút xoá tương ứng.",
        ],
        bullets: [
          "Xoá file backup không cần dùng nữa, kể cả bản đã đẩy lên GitHub.",
          "Xoá danh sách whitelist, câu tự trả lời, giveaway, bảng reaction role khi không còn dùng.",
          "Đặt lại điểm nhiệt và số lần cảnh báo của một thành viên.",
          "Đăng xuất dashboard để vô hiệu hoá phiên đăng nhập hiện tại.",
        ],
      },
      {
        heading: "4. Xoá vĩnh viễn dữ liệu của cả server",
        paragraphs: [
          "Khi bạn muốn xoá toàn bộ dấu vết của server khỏi Protogon, hãy thực hiện theo thứ tự: gỡ bot khỏi server, sau đó gửi yêu cầu trong kênh hỗ trợ kèm ID server.",
          "Chúng tôi xác nhận đã nhận yêu cầu, xoá cấu hình, bản ghi hành động, lịch sử nhiệt, thành viên vào/rời và file backup do bot đang giữ, rồi phản hồi khi hoàn tất. Thời gian xử lý thông thường không quá 30 ngày.",
        ],
      },
      {
        heading: "5. Xoá dữ liệu cá nhân",
        paragraphs: [
          "Thành viên trong server có thể yêu cầu xoá dữ liệu liên quan tới chính mình: ID, lượt vào/rời, bản ghi vi phạm, phiên đăng nhập dashboard nếu có.",
          "Để tránh xoá nhầm dữ liệu của người khác, chúng tôi cần xác minh: người có tài khoản dashboard xác nhận qua đăng nhập Discord, hoặc chủ server xác nhận cho thành viên trong server của mình.",
        ],
      },
      {
        heading: "6. Cách gửi yêu cầu xoá",
        paragraphs: [
          "Gửi yêu cầu trong kênh hỗ trợ của cộng đồng Discord Protogon, kèm: mục cần xoá, ID server (nếu là dữ liệu server), ID người dùng (nếu là dữ liệu cá nhân) và mô tả ngắn.",
          "Không ai trong đội ngũ Protogon yêu cầu bạn gửi token bot, mật khẩu, mã xác thực hai lớp hay khoá API. Yêu cầu như vậy là giả mạo — đừng cung cấp và hãy báo lại cho chúng tôi.",
        ],
      },
      {
        heading: "7. File backup trên GitHub",
        paragraphs: [
          "Nếu bạn bật đẩy backup lên GitHub Gist, bản backup nằm trong tài khoản GitHub của bạn. Bạn có thể xoá gist ngay trong GitHub, hoặc dùng nút xoá backup trên dashboard khi bot có quyền xoá gist đó.",
          "Khi bạn yêu cầu xoá dữ liệu server, chúng tôi cũng xoá các gist do bot tạo trong phạm vi quyền truy cập bạn đã cấp.",
        ],
      },
      {
        heading: "8. Trường hợp phải giữ lại",
        paragraphs: [
          "Một lượng tối thiểu bản ghi có thể được giữ lâu hơn khi cần phòng chống lạm dụng (ví dụ bằng chứng về hành vi tấn công hệ thống) hoặc khi pháp luật yêu cầu. Trong trường hợp đó, chúng tôi giới hạn ở mức nhỏ nhất và không dùng cho mục đích khác.",
          "Sau khi dữ liệu đã bị xoá, việc khôi phục là không thể, kể cả khi bạn mời lại bot vào server.",
        ],
      },
      {
        heading: "9. Xác nhận và liên hệ",
        paragraphs: [
          "Yêu cầu xoá luôn được phản hồi xác nhận: đã nhận, đang xử lý, hoặc đã hoàn tất. Nếu quá 30 ngày bạn chưa nhận được phản hồi, hãy nhắc lại trong kênh hỗ trợ.",
          "Liên kết tới cộng đồng Discord và fanpage nằm ở phần chân trang của website; đây cũng là kênh tiếp nhận mọi yêu cầu về dữ liệu.",
        ],
      },
    ],
  },
];

const EN: LegalDoc[] = [
  {
    slug: "terms",
    name: "Terms of Service",
    summary:
      "The rules that apply when you invite Protogon to a server or use the dashboard at protogon.freebuff.app.",
    updated: LEGAL_UPDATED,
    intro:
      "Protogon is a Discord bot with a web dashboard, operated by the RFTV team and provided free of charge to the community. By inviting the bot, signing in to the dashboard, or using any feature, you agree to the terms below. If you do not agree, remove the bot from your server and stop using the dashboard.",
    sections: [
      {
        heading: "1. Scope and interpretation",
        paragraphs: [
          "\u201cProtogon\u201d in this document covers two parts: the Discord bot and the web dashboard at protogon.freebuff.app. \u201cServer owner\u201d means the person with administrative rights over a server that invited the bot. \u201cUser\u201d means anyone interacting with the bot, including members who are not server owners.",
          "The Vietnamese version is the authoritative text. The English and German versions are provided for your convenience.",
        ],
      },
      {
        heading: "2. Conditions of use",
        paragraphs: [
          "You need a valid Discord account and must comply with Discord's Terms of Service and Community Guidelines. Protogon is not intended for users under 13, or under the minimum age required by the law where you live.",
          "To configure the bot for a server you must hold administrative rights on that server. Protogon never grants you permissions you do not already have on Discord.",
          "To buy a Premium plan on the dashboard you must be at least 18 years old and have full civil capacity under the law; anyone under 18 may only take part in a transaction when a legal guardian is the contracting party.",
        ],
      },
      {
        heading: "3. Responsibilities of the server owner",
        paragraphs: [
          "The bot does exactly what you configure, so the server owner is responsible for how the bot is used in their server.",
        ],
        bullets: [
          "Keep the configuration lawful and appropriate: auto-reply content, greetings, filtered word lists, punishment levels, whitelist.",
          "Inform members that the server uses a bot that filters content, logs actions, and may apply automatic punishments.",
          "Handle member appeals when the bot acts on the wrong person.",
          "Do not use the bot to monitor, harass, or unlawfully suppress members.",
        ],
      },
      {
        heading: "4. Prohibited behaviour",
        paragraphs: ["The following behaviours breach these terms and may lead to losing access:"],
        bullets: [
          "Abusing the infrastructure: API spam, password guessing, or probing for vulnerabilities without telling us first.",
          "Using Protogon to attack, raid, or destroy other servers.",
          "Reverse engineering, reselling, or impersonating Protogon in any form.",
          "Using auto-reply, greetings, or webhooks to spread unlawful content, malware, scams, or harassment.",
        ],
      },
      {
        heading: "5. Our rights",
        paragraphs: [
          "We may suspend or terminate a server's or an account's access when we find a breach of these terms, an attack on our systems, or when we need to protect the infrastructure and other users' data.",
          "Protogon is under continuous development: features may be added, changed, or removed. When a feature is removed we aim to announce it in the Discord community first.",
        ],
      },
      {
        heading: "6. Availability and support",
        paragraphs: [
          "Protogon is provided free of charge with no service-level commitment (SLA). The bot may be interrupted when Discord, our hosting provider, or the AI service has an incident; we work on it and report in the community channel.",
          "Support happens through our Discord community. Response times depend on real-world workload and are not a contractual obligation.",
        ],
      },
      {
        heading: "7. Limitation of liability",
        paragraphs: [
          "The bot is an assistive tool and does not replace an administrator's judgement. Review logs and punishment settings periodically so the bot keeps acting as you intend.",
          "To the extent the law allows, we are not liable for indirect damage, data loss caused by misconfiguration, members' behaviour in your server, or punishment decisions the bot makes automatically according to your configuration.",
        ],
      },
      {
        heading: "8. Changes to these terms and contact",
        paragraphs: [
          "These terms may be updated; the last review date is shown at the top of the page. Continuing to use the bot after that date means you accept the new version.",
          "Questions about these terms: post in the support channel of the Protogon Discord community. The link is in the website footer.",
        ],
      },
      {
        heading: "9. Governing law and dispute resolution",
        paragraphs: [
          "These terms are governed by Vietnamese law. Disputes arising from the use of Protogon are first settled through negotiation and conciliation in the community support channel.",
          "If no agreement is reached, either party may request settlement by commercial arbitration or by a competent court in Vietnam.",
        ],
      },
    ],
  },
  {
    slug: "privacy",
    name: "Privacy Policy",
    summary: "What data Protogon stores, why, where it lives, and how you stay in control of it.",
    updated: LEGAL_UPDATED,
    intro:
      "Protogon stores only what is needed for the bot to protect your server and for the dashboard to show your configuration. We do not sell data, we do not use it for advertising, and we do not read your private messages.",
    sections: [
      {
        heading: "1. Quick summary",
        paragraphs: ["Three points matter most before the details:"],
        bullets: [
          "We store Discord IDs, server configuration, and records of bot actions — not ordinary message content.",
          "Data is never sold and never shared for advertising.",
          "You can request deletion at any time; the steps are on the Retention & Data Deletion page.",
        ],
      },
      {
        heading: "2. Data we store",
        paragraphs: [
          "The data falls into four groups, all of them serving the operation of the bot and dashboard:",
        ],
        bullets: [
          "Dashboard account: Discord ID, username, display name, avatar, the list of servers you can manage, last sign-in time, and your dashboard session.",
          "Server: ID, name, icon, member count, prefix, per-module configuration, channels and roles used for logging, whitelist entries, and created webhooks.",
          "Bot activity: punishment records with reason and moderator, heat score and warning count, anti-nuke/raid events, and join/leave records when Join Gate is enabled.",
          "Content you create: auto-reply lines, welcome and goodbye messages, giveaways, reaction-role panels, and backup files when you enable backups.",
        ],
      },
      {
        heading: "3. Message content",
        paragraphs: [
          "The bot reads messages in your server to run auto-replies, filter spam, detect malicious links, and compile reports during a raid. Ordinary messages are not stored in the database.",
          "Only the parts that triggered a filter are recorded (offending content, reason, punishment) so moderators can review and explain the action. If you enable backups with messages included, that content ends up in a backup file you control.",
          "The bot does not read direct messages between members. If you message the bot directly, that content is used only to answer you.",
        ],
      },
      {
        heading: "4. How we use data",
        paragraphs: ["Data is used only for the following purposes:"],
        bullets: [
          "Running the features you enabled: auto-reply, heat and warnings, anti-nuke/raid, Join Gate, welcome messages, punishments.",
          "Preventing abuse and attacks: detecting raids, blocking rogue bots, blocking password guessing.",
          "Supporting you when you report an incident, with the evidence needed to trace it.",
          "Aggregate system health figures (server counts, request counts) with no personal identification.",
        ],
      },
      {
        heading: "5. Where data lives and for how long",
        paragraphs: [
          "Data is stored on the Convex infrastructure Protogon uses, separated per server. Dashboard sessions expire according to the remember-me option you choose at sign-in.",
          "Backup files are pushed to GitHub Gist only when you enable that feature and configure your own access key. In that case the backup lives in your GitHub account and you can delete it at any time.",
        ],
      },
      {
        heading: "6. Third parties",
        paragraphs: [
          "Protogon relies on the services below to operate. We do not sell or hand data to advertisers:",
        ],
        bullets: [
          "Discord: the source of the data and the platform where the bot acts through the official API.",
          "Convex: hosts the database and runs the dashboard backend.",
          "GitHub: receives backup files only when you enable Gist upload with your own key.",
          "AI providers: process the conversation excerpts necessary when you use raid reports or the Haimiya assistant, for that request only.",
        ],
      },
      {
        heading: "7. Your rights",
        paragraphs: [
          "You control your server's data directly in the dashboard. Beyond that, you can contact us for help:",
        ],
        bullets: [
          "View and edit configuration, whitelist entries, auto-replies, and backups in the dashboard.",
          "Request an export or deletion of your server's data or your personal data.",
          "Object to continued storage: the most thorough route is to remove the bot from the server, then send a deletion request.",
          "Be informed of the purpose, scope, and retention period BEFORE we collect your information, and choose which scope of information you consent to provide; if the purpose of use changes, we notify you again and ask for new consent.",
        ],
      },
      {
        heading: "8. Security",
        paragraphs: [
          "Dashboard access relies on Discord OAuth2 sign-in and is re-checked on the backend for every request; there is no backdoor and no way to skip authentication.",
          "High-privilege administrative actions require a separate bot key, stored as a hash. Backup files can be encrypted with AES-256-GCM and verified with SHA-256 before a restore.",
          "If an incident affects data, we notify the affected server owners through their registered contact channel.",
          "When an attack on an information system creates a risk to the cybersecurity of consumer information, we notify the competent state management authority within 24 hours of becoming aware of the attack and apply the necessary remedial measures.",
        ],
      },
      {
        heading: "9. Changes to this policy and contact",
        paragraphs: [
          "This policy may be updated; the last review date is shown at the top of the page, and material changes are announced in the Discord community.",
          "For any privacy question or request: post in the support channel of the Protogon Discord community with the relevant server ID or user ID.",
        ],
      },
    ],
  },
  {
    slug: "data-deletion",
    name: "Retention & Data Deletion",
    summary:
      "How long data is kept, what you can delete yourself in the dashboard, and how to request permanent deletion.",
    updated: LEGAL_UPDATED,
    intro:
      "Protogon keeps data to the minimum needed and deletes it on request. This page sets out the retention window for each data group, what you can delete yourself in the dashboard, and how to request permanent deletion.",
    sections: [
      {
        heading: "1. Principles",
        paragraphs: [
          "We store as little as possible, only so the bot runs correctly and you can review history when needed. No copies are kept outside the operating system, except for backup files that you yourself choose to push to GitHub.",
          "When you request deletion, the data is removed from the live database; operational backups, if any, are overwritten on the normal maintenance cycle.",
        ],
      },
      {
        heading: "2. Retention windows",
        paragraphs: ["The windows below apply to day-to-day operational data:"],
        bullets: [
          "Dashboard session: expires according to the remember-me option you choose at sign-in; signing out deletes it immediately.",
          "Punishments, heat scores, and warnings: kept until you clear them in the dashboard or delete the server's data.",
          "Anti-nuke/raid events and join/leave records: only the most recent records are kept for moderator review; older ones are dropped once the cap is reached.",
          "Backup files: kept on the schedule you choose (one every 2–30 days); older copies inside the bot are deleted when a new one is created, while copies on GitHub Gist are yours to manage.",
        ],
      },
      {
        heading: "3. Deleting data yourself in the dashboard",
        paragraphs: [
          "Most data can be deleted without waiting for anyone: every panel has its own delete control.",
        ],
        bullets: [
          "Delete backups you no longer need, including ones already pushed to GitHub.",
          "Delete whitelist entries, auto-replies, giveaways, and reaction-role panels you no longer use.",
          "Reset a member's heat score and warning count.",
          "Sign out of the dashboard to invalidate the current session.",
        ],
      },
      {
        heading: "4. Permanently deleting a server's data",
        paragraphs: [
          "To remove every trace of a server from Protogon, do this in order: remove the bot from the server, then send a request in the support channel with the server ID.",
          "We confirm receipt, delete the configuration, action records, heat history, join/leave records, and any backup files the bot still holds, then reply once it is done. Processing normally takes no more than 30 days.",
        ],
      },
      {
        heading: "5. Deleting personal data",
        paragraphs: [
          "A member of a server can request deletion of data relating to them: their ID, join/leave records, punishment records, and any dashboard session.",
          "To avoid deleting someone else's data by mistake we verify the request: dashboard account holders confirm by signing in with Discord, or a server owner confirms on behalf of a member in their server.",
        ],
      },
      {
        heading: "6. How to send a deletion request",
        paragraphs: [
          "Post the request in the support channel of the Protogon Discord community, including: what to delete, the server ID (for server data), the user ID (for personal data), and a short description.",
          "Nobody on the Protogon team asks you to send a bot token, password, two-factor code, or API key. Such a request is impersonation — do not provide it, and report it to us.",
        ],
      },
      {
        heading: "7. Backup files on GitHub",
        paragraphs: [
          "If you enabled backup uploads to GitHub Gist, that backup lives in your GitHub account. You can delete the gist in GitHub at any time, or use the delete-backup control in the dashboard when the bot has permission to remove that gist.",
          "When you request server data deletion, we also delete the gists the bot created, within the access you granted.",
        ],
      },
      {
        heading: "8. When data must be kept",
        paragraphs: [
          "A minimal set of records may be kept longer where needed to prevent abuse (for example evidence of an attack on our systems) or where the law requires it. In that case we limit it to the smallest amount and do not use it for anything else.",
          "Once data is deleted, it cannot be restored, even if you invite the bot to the server again.",
        ],
      },
      {
        heading: "9. Confirmation and contact",
        paragraphs: [
          "Every deletion request gets an acknowledgement: received, in progress, or completed. If 30 days pass without a reply, remind us in the support channel.",
          "Links to the Discord community and the Facebook page are in the website footer; that is also where we take data requests.",
        ],
      },
    ],
  },
];

const DE: LegalDoc[] = [
  {
    slug: "terms",
    name: "Nutzungsbedingungen",
    summary:
      "Die Regeln, die gelten, wenn du Protogon auf einen Server einlädst oder das Dashboard unter protogon.freebuff.app nutzt.",
    updated: LEGAL_UPDATED,
    intro:
      "Protogon ist ein Discord-Bot mit Web-Dashboard, betrieben vom RFTV-Team und kostenlos für die Community. Wenn du den Bot einlädst, dich im Dashboard anmeldest oder eine Funktion nutzt, akzeptierst du die folgenden Bedingungen. Wenn du nicht einverstanden bist, entferne den Bot vom Server und nutze das Dashboard nicht weiter.",
    sections: [
      {
        heading: "1. Geltungsbereich und Auslegung",
        paragraphs: [
          "\u201eProtogon\u201c umfasst in diesem Dokument zwei Teile: den Discord-Bot und das Web-Dashboard unter protogon.freebuff.app. \u201eServerbesitzer\u201c ist die Person mit Verwaltungsrechten auf einem Server, der den Bot eingeladen hat. \u201eNutzer\u201c ist jede Person, die mit dem Bot interagiert, auch Mitglieder ohne Serverbesitz.",
          "Die vietnamesische Fassung ist die maßgebliche Fassung. Die englische und die deutsche Fassung dienen nur der besseren Lesbarkeit.",
        ],
      },
      {
        heading: "2. Nutzungsvoraussetzungen",
        paragraphs: [
          "Du brauchst ein gültiges Discord-Konto und musst die Discord-Nutzungsbedingungen und Community-Richtlinien einhalten. Protogon richtet sich nicht an Personen unter 13 Jahren oder unter dem in deinem Land geltenden Mindestalter.",
          "Um den Bot für einen Server zu konfigurieren, brauchst du Verwaltungsrechte auf diesem Server. Protogon vergibt keine Rechte, die du auf Discord nicht schon hast.",
          "Um einen Premium-Tarif im Dashboard zu kaufen, musst du mindestens 18 Jahre alt und voll geschäftsfähig sein; Personen unter 18 Jahren nehmen nur teil, wenn ein gesetzlicher Vertreter als Vertragspartner auftritt.",
        ],
      },
      {
        heading: "3. Pflichten des Serverbesitzers",
        paragraphs: [
          "Der Bot macht genau das, was du konfigurierst — deshalb liegt die Verantwortung für die Nutzung im Server beim Serverbesitzer.",
        ],
        bullets: [
          "Konfiguration rechtmäßig und angemessen halten: Auto-Antworten, Begrüßungen, Wortfilter, Strafstufen, Whitelist.",
          "Mitglieder darüber informieren, dass ein Bot Inhalte filtert, Aktionen protokolliert und automatische Strafen verhängen kann.",
          "Einwände von Mitgliedern bearbeiten, wenn der Bot die falsche Person trifft.",
          "Den Bot nicht einsetzen, um Mitglieder zu überwachen, zu belästigen oder rechtswidrig zu unterdrücken.",
        ],
      },
      {
        heading: "4. Verbotenes Verhalten",
        paragraphs: [
          "Folgendes verstößt gegen diese Bedingungen und kann zum Verlust des Zugangs führen:",
        ],
        bullets: [
          "Missbrauch der Infrastruktur: API-Spam, Passwortraten oder Sondieren nach Schwachstellen ohne vorherige Meldung an uns.",
          "Protogon nutzen, um andere Server anzugreifen, zu raiden oder zu zerstören.",
          "Reverse Engineering, Weiterverkauf oder jede Form der Nachahmung von Protogon.",
          "Auto-Antworten, Begrüßungen oder Webhooks nutzen, um rechtswidrige Inhalte, Malware, Betrug oder Belästigung zu verbreiten.",
        ],
      },
      {
        heading: "5. Unsere Rechte",
        paragraphs: [
          "Wir können den Zugang eines Servers oder Kontos sperren oder beenden, wenn wir einen Verstoß gegen diese Bedingungen, einen Angriff auf unsere Systeme oder die Notwendigkeit feststellen, die Infrastruktur und die Daten anderer Nutzer zu schützen.",
          "Protogon wird laufend weiterentwickelt: Funktionen können hinzukommen, sich ändern oder entfallen. Wenn eine Funktion entfällt, kündigen wir das möglichst vorher in der Discord-Community an.",
        ],
      },
      {
        heading: "6. Verfügbarkeit und Support",
        paragraphs: [
          "Protogon ist kostenlos und ohne Service-Level-Zusage (SLA). Der Bot kann ausfallen, wenn Discord, unser Hosting-Anbieter oder der KI-Dienst eine Störung hat; wir arbeiten daran und informieren im Community-Kanal.",
          "Support läuft über unsere Discord-Community. Antwortzeiten hängen von der tatsächlichen Auslastung ab und sind keine vertragliche Pflicht.",
        ],
      },
      {
        heading: "7. Haftungsbeschränkung",
        paragraphs: [
          "Der Bot ist ein Hilfsmittel und ersetzt nicht die Einschätzung eines Administrators. Prüfe Logs und Strafstufen regelmäßig, damit der Bot so handelt, wie du es beabsichtigst.",
          "Soweit gesetzlich zulässig, haften wir nicht für mittelbare Schäden, Datenverlust durch Fehlkonfiguration, das Verhalten von Mitgliedern in deinem Server oder Strafentscheidungen, die der Bot automatisch nach deiner Konfiguration trifft.",
        ],
      },
      {
        heading: "8. Änderungen dieser Bedingungen und Kontakt",
        paragraphs: [
          "Diese Bedingungen können aktualisiert werden; das Datum der letzten Prüfung steht oben auf der Seite. Wer den Bot danach weiter nutzt, akzeptiert die neue Fassung.",
          "Fragen zu diesen Bedingungen: im Support-Kanal der Protogon-Discord-Community. Der Link steht im Footer der Website.",
        ],
      },
      {
        heading: "9. Anwendbares Recht und Streitbeilegung",
        paragraphs: [
          "Diese Bedingungen unterliegen dem vietnamesischen Recht. Streitigkeiten aus der Nutzung von Protogon werden zuerst durch Verhandlung und Schlichtung im Support-Kanal der Community geklärt.",
          "Kommt keine Einigung zustande, kann jede Partei die Entscheidung durch ein kommerzielles Schiedsgericht oder ein zuständiges Gericht in Vietnam beantragen.",
        ],
      },
    ],
  },
  {
    slug: "privacy",
    name: "Datenschutzerklärung",
    summary:
      "Welche Daten Protogon speichert, warum, wo sie liegen und wie du die Kontrolle behältst.",
    updated: LEGAL_UPDATED,
    intro:
      "Protogon speichert nur, was nötig ist, damit der Bot deinen Server schützt und das Dashboard deine Konfiguration zeigt. Wir verkaufen keine Daten, nutzen sie nicht für Werbung und lesen keine privaten Nachrichten.",
    sections: [
      {
        heading: "1. Kurzfassung",
        paragraphs: ["Drei Punkte sind vor allen Details wichtig:"],
        bullets: [
          "Wir speichern Discord-IDs, Serverkonfiguration und Aufzeichnungen der Bot-Aktionen — nicht normale Nachrichteninhalte.",
          "Daten werden nicht verkauft und nicht für Werbung weitergegeben.",
          "Du kannst jederzeit Löschung verlangen; die Schritte stehen auf der Seite Löschung & Aufbewahrung.",
        ],
      },
      {
        heading: "2. Gespeicherte Daten",
        paragraphs: [
          "Die Daten fallen in vier Gruppen, alle dienen dem Betrieb von Bot und Dashboard:",
        ],
        bullets: [
          "Dashboard-Konto: Discord-ID, Benutzername, Anzeigename, Avatar, Liste der verwaltbaren Server, letzte Anmeldung und deine Dashboard-Sitzung.",
          "Server: ID, Name, Icon, Mitgliederzahl, Präfix, Konfiguration je Modul, für Logs genutzte Kanäle und Rollen, Whitelist-Einträge und erstellte Webhooks.",
          "Bot-Aktivität: Strafen mit Grund und Moderator, Hitzewert und Verwarnungen, Anti-Nuke-/Raid-Ereignisse sowie Beitritts- und Austrittsdaten bei aktivem Join Gate.",
          "Von dir erstellte Inhalte: Auto-Antworten, Willkommens- und Abschiedstexte, Giveaways, Reaction-Role-Panels und Backup-Dateien bei aktiviertem Backup.",
        ],
      },
      {
        heading: "3. Nachrichteninhalte",
        paragraphs: [
          "Der Bot liest Nachrichten im Server, um Auto-Antworten auszuführen, Spam zu filtern, schädliche Links zu erkennen und bei einem Raid Berichte zu erstellen. Normale Nachrichten werden nicht in der Datenbank gespeichert.",
          "Aufgezeichnet werden nur die auslösenden Teile (Inhalt, Grund, Strafe), damit Moderatoren die Aktion nachvollziehen können. Ist das Backup samt Nachrichten aktiviert, landen diese Inhalte in einer Backup-Datei, die du kontrollierst.",
          "Direktnachrichten zwischen Mitgliedern liest der Bot nicht. Schreibst du dem Bot direkt, wird der Inhalt nur für die Antwort genutzt.",
        ],
      },
      {
        heading: "4. Zwecke der Verarbeitung",
        paragraphs: ["Daten werden ausschließlich für folgende Zwecke genutzt:"],
        bullets: [
          "Betrieb der von dir aktivierten Funktionen: Auto-Antworten, Hitze und Verwarnungen, Anti-Nuke/Raid, Join Gate, Willkommensnachrichten, Strafen.",
          "Abwehr von Missbrauch und Angriffen: Raid-Erkennung, Blockieren fremder Bots, Schutz vor Passwortraten.",
          "Support bei gemeldeten Vorfällen, mit den nötigen Belegen zur Nachverfolgung.",
          "Aggregierte Gesundheitswerte des Systems (Server- und Anfragezahlen) ohne Personenbezug.",
        ],
      },
      {
        heading: "5. Speicherort und Speicherdauer",
        paragraphs: [
          "Die Daten liegen auf der von Protogon genutzten Convex-Infrastruktur, je Server getrennt. Dashboard-Sitzungen laufen je nach gewählter Anmeldeoption aus.",
          "Backup-Dateien werden nur dann zu GitHub Gist hochgeladen, wenn du diese Funktion aktivierst und deinen eigenen Zugangsschlüssel hinterlegst. Dann liegen sie in deinem GitHub-Konto und du kannst sie jederzeit löschen.",
        ],
      },
      {
        heading: "6. Dritte",
        paragraphs: [
          "Protogon stützt sich für den Betrieb auf folgende Dienste. Wir verkaufen keine Daten und geben sie nicht an Werbetreibende weiter:",
        ],
        bullets: [
          "Discord: Datenquelle und Plattform, auf der der Bot über die offizielle API handelt.",
          "Convex: beherbergt die Datenbank und das Backend des Dashboards.",
          "GitHub: erhält Backup-Dateien nur, wenn du den Gist-Upload mit deinem Schlüssel aktivierst.",
          "KI-Anbieter: verarbeiten die notwendigen Gesprächsausschnitte, wenn du Raid-Berichte oder den Assistenten Haimiya nutzt — nur für diese Anfrage.",
        ],
      },
      {
        heading: "7. Deine Rechte",
        paragraphs: [
          "Die Daten deines Servers steuerst du direkt im Dashboard. Darüber hinaus kannst du uns kontaktieren:",
        ],
        bullets: [
          "Konfiguration, Whitelist, Auto-Antworten und Backups im Dashboard ansehen und ändern.",
          "Export oder Löschung der Server- oder Personendaten verlangen.",
          "Der weiteren Speicherung widersprechen: am gründlichsten, indem du den Bot entfernst und dann eine Löschung beantragst.",
          "Vor der Erhebung über Zweck, Umfang und Aufbewahrungsdauer deiner Informationen INFORMIERT zu werden und selbst zu wählen, welchem Umfang du zustimmst; ändert sich der Verwendungszweck, informieren wir erneut und holen eine neue Einwilligung ein.",
        ],
      },
      {
        heading: "8. Sicherheit",
        paragraphs: [
          "Der Dashboard-Zugang beruht auf Discord-OAuth2 und wird bei jeder Anfrage im Backend erneut geprüft; es gibt keine Hintertür und keinen Weg an der Authentifizierung vorbei.",
          "Verwaltungsaktionen mit hohen Rechten benötigen einen separaten Bot-Schlüssel, der als Hash gespeichert wird. Backup-Dateien können mit AES-256-GCM verschlüsselt und vor dem Wiederherstellen per SHA-256 geprüft werden.",
          "Bei einem Vorfall mit Datenbezug informieren wir die betroffenen Serverbesitzer über ihren hinterlegten Kontaktweg.",
          "Wird ein Informationssystem angegriffen und entsteht dadurch ein Risiko für die Cybersicherheit der Verbraucherdaten, informieren wir die zuständige staatliche Stelle innerhalb von 24 Stunden nach Kenntnis des Angriffs und ergreifen die erforderlichen Abhilfemaßnahmen.",
        ],
      },
      {
        heading: "9. Änderungen und Kontakt",
        paragraphs: [
          "Diese Erklärung kann aktualisiert werden; das Datum der letzten Prüfung steht oben auf der Seite, wesentliche Änderungen kündigen wir in der Discord-Community an.",
          "Für Datenschutzfragen oder -anträge: im Support-Kanal der Protogon-Discord-Community, mit der betreffenden Server- oder Nutzer-ID.",
        ],
      },
    ],
  },
  {
    slug: "data-deletion",
    name: "Aufbewahrung & Löschung",
    summary:
      "Wie lange Daten bleiben, was du selbst im Dashboard löschen kannst und wie du die endgültige Löschung beantragst.",
    updated: LEGAL_UPDATED,
    intro:
      "Protogon hält Daten so kurz wie nötig und löscht sie auf Verlangen. Diese Seite nennt die Aufbewahrungsfristen je Datengruppe, was du selbst im Dashboard löschen kannst und wie du die endgültige Löschung beantragst.",
    sections: [
      {
        heading: "1. Grundsätze",
        paragraphs: [
          "Wir speichern so wenig wie möglich, nur damit der Bot korrekt läuft und du Verläufe prüfen kannst. Außerhalb des Betriebssystems liegen keine Kopien, ausgenommen Backup-Dateien, die du selbst zu GitHub hochlädst.",
          "Nach einer Löschanfrage werden die Daten aus der aktiven Datenbank entfernt; betriebliche Sicherungen, falls vorhanden, werden im normalen Wartungszyklus überschrieben.",
        ],
      },
      {
        heading: "2. Aufbewahrungsfristen",
        paragraphs: ["Die folgenden Fristen gelten für den laufenden Betrieb:"],
        bullets: [
          "Dashboard-Sitzung: läuft je nach Anmeldeoption aus; Abmelden löscht sie sofort.",
          "Strafen, Hitzewerte und Verwarnungen: bleiben, bis du sie im Dashboard zurücksetzt oder die Serverdaten gelöscht werden.",
          "Anti-Nuke-/Raid-Ereignisse und Beitritts-/Austrittsdaten: nur die jüngsten Einträge bleiben zur Prüfung; ältere fallen bei Erreichen der Obergrenze weg.",
          "Backup-Dateien: nach deinem Zeitplan (eine alle 2–30 Tage); ältere Kopien im Bot werden bei einer neuen gelöscht, Kopien in GitHub Gist verwaltest du selbst.",
        ],
      },
      {
        heading: "3. Selbst löschen im Dashboard",
        paragraphs: [
          "Die meisten Daten kannst du ohne Wartezeit löschen: jedes Panel hat eine eigene Löschfunktion.",
        ],
        bullets: [
          "Backups löschen, die du nicht mehr brauchst, auch bereits zu GitHub hochgeladene.",
          "Whitelist-Einträge, Auto-Antworten, Giveaways und Reaction-Role-Panels löschen, die nicht mehr genutzt werden.",
          "Hitzewert und Verwarnungen eines Mitglieds zurücksetzen.",
          "Im Dashboard abmelden, um die aktuelle Sitzung ungültig zu machen.",
        ],
      },
      {
        heading: "4. Serverdaten endgültig löschen",
        paragraphs: [
          "Um jede Spur eines Servers aus Protogon zu entfernen, gehe in dieser Reihenfolge vor: Bot vom Server entfernen, dann eine Anfrage mit der Server-ID im Support-Kanal senden.",
          "Wir bestätigen den Eingang, löschen Konfiguration, Aktionsprotokolle, Hitze-Verlauf, Beitritts-/Austrittsdaten und die noch vorhandenen Backup-Dateien und melden uns nach Abschluss. Die Bearbeitung dauert üblicherweise nicht länger als 30 Tage.",
        ],
      },
      {
        heading: "5. Personendaten löschen",
        paragraphs: [
          "Mitglieder eines Servers können die Löschung der eigenen Daten verlangen: ID, Beitritts-/Austrittsdaten, Strafaufzeichnungen und eine etwaige Dashboard-Sitzung.",
          "Um fremde Daten nicht versehentlich zu löschen, prüfen wir die Anfrage: Dashboard-Konten bestätigen sich per Discord-Anmeldung, oder ein Serverbesitzer bestätigt für ein Mitglied seines Servers.",
        ],
      },
      {
        heading: "6. Löschanfrage stellen",
        paragraphs: [
          "Sende die Anfrage im Support-Kanal der Protogon-Discord-Community und nenne: was gelöscht werden soll, die Server-ID (bei Serverdaten), die Nutzer-ID (bei Personendaten) und eine kurze Beschreibung.",
          "Niemand im Protogon-Team bittet dich um Bot-Token, Passwort, Zwei-Faktor-Code oder API-Schlüssel. Eine solche Bitte ist Betrug — gib nichts heraus und melde sie uns.",
        ],
      },
      {
        heading: "7. Backup-Dateien auf GitHub",
        paragraphs: [
          "Hast du den Backup-Upload zu GitHub Gist aktiviert, liegt das Backup in deinem GitHub-Konto. Du kannst den Gist in GitHub jederzeit löschen oder die Backup-Löschfunktion im Dashboard nutzen, wenn der Bot den Gist löschen darf.",
          "Bei einer Löschanfrage für Serverdaten löschen wir auch die vom Bot erstellten Gists, soweit die von dir erteilten Rechte das zulassen.",
        ],
      },
      {
        heading: "8. Fälle, in denen Daten bleiben müssen",
        paragraphs: [
          "Ein Mindestbestand an Aufzeichnungen kann länger aufbewahrt werden, wenn das zur Missbrauchsabwehr nötig ist (etwa Belege für einen Angriff auf unsere Systeme) oder das Gesetz es verlangt. Dann beschränken wir es auf das Minimum und nutzen es für nichts anderes.",
          "Gelöschte Daten können nicht wiederhergestellt werden, auch wenn du den Bot erneut einlädst.",
        ],
      },
      {
        heading: "9. Bestätigung und Kontakt",
        paragraphs: [
          "Jede Löschanfrage wird bestätigt: eingegangen, in Bearbeitung oder abgeschlossen. Kommt nach 30 Tagen keine Antwort, erinnere uns im Support-Kanal.",
          "Links zur Discord-Community und zur Facebook-Seite stehen im Footer der Website; dort nehmen wir auch Datenanfragen entgegen.",
        ],
      },
    ],
  },
];

/** Nội dung 3 văn bản pháp lý theo ngôn ngữ đang chọn. */
export const LEGAL_DOCS: Record<LegalLang, LegalDoc[]> = { vi: VI, en: EN, de: DE };

/** Lấy 1 văn bản theo slug + ngôn ngữ (rơi về bản VI nếu slug lạ để không vỡ trang). */
export function legalDoc(lang: LegalLang, slug: string): LegalDoc {
  const list = LEGAL_DOCS[lang] ?? LEGAL_DOCS.vi;
  return list.find((d) => d.slug === slug) ?? LEGAL_DOCS.vi[0];
}

/** Danh sách văn bản của ngôn ngữ đang chọn — dùng cho liên kết chéo và mục lục. */
export function legalDocs(lang: LegalLang): LegalDoc[] {
  return LEGAL_DOCS[lang] ?? LEGAL_DOCS.vi;
}
