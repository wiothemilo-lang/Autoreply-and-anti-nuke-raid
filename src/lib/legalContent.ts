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
export const LEGAL_UPDATED = "12/11/2026";

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
      "Protogon là bot Discord kèm bảng điều khiển web tại protogon.freebuff.app, do đội ngũ RFTV vận hành. Toàn bộ tính năng hiện được cung cấp miễn phí cho mọi server; chúng tôi chưa mở bán gói trả phí nào. Khi mời bot vào server, đăng nhập dashboard hoặc dùng bất kỳ tính năng nào, bạn đồng ý với các điều khoản dưới đây. Nếu không đồng ý, hãy gỡ bot khỏi server và ngừng dùng dashboard.",
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
          "Khi bật xác minh qua web, thông báo rõ rằng trang xác minh thu IP và tín hiệu thiết bị, gửi IP một lần tới ipapi.is và có thể ra quyết định tự động; chỉ bật khi bạn có căn cứ pháp lý và tuân thủ Chính sách quyền riêng tư.",
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
          "Toàn bộ tính năng được cung cấp miễn phí, không kèm cam kết mức dịch vụ (SLA) và không phát sinh giao dịch mua bán nào. Bot có thể gián đoạn khi Discord, nhà cung cấp hạ tầng hoặc dịch vụ AI gặp sự cố; chúng tôi xử lý và thông báo trong kênh cộng đồng.",
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
    summary:
      "Protogon lưu dữ liệu gì, để làm gì, gửi cho ai, giữ bao lâu và bạn kiểm soát chúng thế nào.",
    updated: LEGAL_UPDATED,
    intro:
      "Protogon chỉ lưu những dữ liệu cần thiết để bot bảo vệ server và để dashboard hiển thị đúng cấu hình của bạn. Chính sách này nói rõ ai chịu trách nhiệm, dữ liệu nào được thu (kể cả IP và tín hiệu thiết bị khi bật xác minh web), vì sao, gửi cho ai, giữ bao lâu và bạn kiểm soát thế nào. Chúng tôi không bán dữ liệu, không dùng dữ liệu cho quảng cáo và không đọc tin nhắn riêng tư của bạn.",
    sections: [
      {
        heading: "1. Tóm tắt nhanh",
        paragraphs: ["Ba điểm quan trọng nhất trước khi đi vào chi tiết:"],
        bullets: [
          "Chúng tôi lưu ID Discord, cấu hình server và bản ghi hành động của bot — không lưu nội dung tin nhắn thường. Hai ngoại lệ có chủ đích: nội dung bạn tự gửi trong ticket (kèm transcript khi ticket đóng) và đoạn nội dung spam ngắn khi server bật chia sẻ tín hiệu chống spam.",
          "Khi server bật xác minh web, trang xác minh thu IP và tín hiệu thiết bị. IP thô không được lưu; chỉ lưu HMAC-SHA-256 tách theo từng server, và IP được gửi một lần tới ipapi.is để tra VPN/proxy/Tor.",
          "Dữ liệu không được bán, không được chia sẻ cho quảng cáo. Bạn có thể yêu cầu xoá bất cứ lúc nào; hướng dẫn ở trang Lưu trữ & xoá dữ liệu.",
        ],
      },
      {
        heading: "2. Ai chịu trách nhiệm về dữ liệu",
        paragraphs: [
          "Protogon là bot Discord kèm dashboard web tại protogon.freebuff.app, do đội ngũ RFTV vận hành. Đội ngũ RFTV là bên kiểm soát dữ liệu tài khoản dashboard, dữ liệu vận hành nền tảng và dữ liệu xác minh do bot tạo.",
          "Khi bot ở trong một server, chủ server quyết định bật/tắt tính năng và cấu hình hình phạt. Với dữ liệu của thành viên trong server, chủ server là bên quyết định mục đích và phạm vi xử lý; Protogon xử lý theo cấu hình đó và theo chính sách này. Chủ server có trách nhiệm thông báo cho thành viên và bảo đảm có căn cứ pháp lý khi bật tính năng thu dữ liệu, đặc biệt là xác minh web.",
          "Kênh liên hệ chính thức về dữ liệu là kênh hỗ trợ trong Discord Protogon và fanpage Facebook, liên kết ở chân trang. Chúng tôi có thể yêu cầu bạn xác minh danh tính trước khi xử lý yêu cầu để tránh xoá nhầm dữ liệu của người khác.",
        ],
      },
      {
        heading: "3. Dữ liệu chúng tôi lưu",
        paragraphs: [
          "Dữ liệu nằm trong các nhóm sau, tất cả đều phục vụ vận hành bot và dashboard:",
        ],
        bullets: [
          "Tài khoản dashboard: ID Discord, tên người dùng, tên hiển thị, ảnh đại diện, danh sách server bạn có quyền quản lý, thời điểm đăng nhập gần nhất và phiên đăng nhập.",
          "Thanh toán (khi bạn ủng hộ hoặc mua gói): ID Discord, loại gói, số tiền, mã đơn ZaloPay, trạng thái và thời điểm, phiên bản điều khoản đã đồng ý. Không lưu số thẻ hay số tài khoản ngân hàng — ZaloPay xử lý.",
          "Góp ý: nội dung bạn gửi, email nếu bạn tự nguyện nhập, ngôn ngữ và trang gửi.",
          "Server: ID, tên, biểu tượng, số lượng thành viên, prefix, cấu hình từng module, kênh và role dùng cho log, whitelist, webhook đã tạo.",
          "Hoạt động của bot: hành động hình phạt kèm lý do và người thực hiện, điểm nhiệt và số lần cảnh báo, sự kiện chống nuke/raid, lượt vào server khi bật Join Gate (ID, tên, ảnh đại diện, tuổi tài khoản, điểm rủi ro và lý do, hành động xử lý).",
          "Nội dung bạn tạo: câu tự trả lời, lời chào và tạm biệt, giveaway, bảng reaction role; nội dung bạn gửi trong ticket (nội dung, bằng chứng, ô bổ sung) và transcript kênh ticket khi đóng; file backup khi bạn bật tính năng sao lưu.",
          "Tín hiệu chống spam liên server (chỉ khi bạn bật chia sẻ): đoạn nội dung spam tối đa 60 ký tự đã lược mention và tên bot lạ; không kèm ID người dùng, server nguồn được băm một chiều, tự xoá sau 24 giờ.",
          "Xác minh web: phiên xác minh (token đã băm, ID server/người dùng, trạng thái, quyết định, thời gian), hash IP và tín hiệu thiết bị, liên kết tài khoản phụ, ban IP và nhật ký thao tác. Chi tiết ở mục 13.",
        ],
      },
      {
        heading: "4. Nội dung tin nhắn",
        paragraphs: [
          "Bot đọc tin nhắn trong server để chạy tự trả lời, lọc spam, phát hiện link độc hại và tổng hợp báo cáo khi có raid. Tin nhắn thường không được lưu vào cơ sở dữ liệu.",
          "Chỉ những đoạn bị xử lý mới được ghi lại (nội dung vi phạm, lý do, hình phạt) để mod xem lại và giải trình. Nếu bạn bật sao lưu kèm tin nhắn, nội dung tin nhắn sẽ nằm trong file backup do bạn quản lý.",
          "Hai ngoại lệ có chủ đích. Thứ nhất, nội dung bạn tự gửi trong ticket — nội dung, bằng chứng, ô bổ sung — được lưu để staff xử lý; khi ticket đóng, bot lưu transcript các tin nhắn trong kênh ticket vào storage. Chỉ staff của chính server đó xem được qua dashboard, và cả hai bị xoá 180 ngày sau khi ticket đóng. Thứ hai, nếu bạn bật chia sẻ tín hiệu chống spam, đoạn nội dung spam tối đa 60 ký tự (đã lược mention) và tên bot lạ được chia sẻ với các server khác cùng bật nhận; không kèm ID người dùng, server nguồn bị băm một chiều và tín hiệu tự xoá sau 24 giờ.",
          "Bot không đọc tin nhắn riêng tư (DM) giữa các thành viên. Nếu bạn nhắn trực tiếp cho bot, bot chỉ dùng nội dung đó để trả lời bạn.",
        ],
      },
      {
        heading: "5. Mục đích sử dụng",
        paragraphs: ["Dữ liệu chỉ được dùng cho những việc sau:"],
        bullets: [
          "Chạy đúng các tính năng bạn đã bật: tự trả lời, nhiệt độ vi phạm, chống nuke/raid, Join Gate, welcome, hình phạt.",
          "Phòng chống lạm dụng và tấn công: phát hiện raid, chặn bot lạ, chống dò mật khẩu, chặn tài khoản phá server quay lại.",
          "Chia sẻ tín hiệu chống spam giữa các server đã bật tính năng (opt-in cả hai phía) để chặn raid sớm hơn.",
          "Cải thiện nhận diện raid bằng mẫu sự kiện đã bỏ ID server và ID người dùng; mẫu này không dùng để định danh hay chấm điểm cá nhân.",
          "Hỗ trợ khi bạn báo sự cố, kèm bằng chứng cần thiết để truy nguyên.",
          "Số liệu sức khoẻ hệ thống ở dạng tổng hợp (số server, số yêu cầu) — không định danh cá nhân.",
          "Tuân thủ nghĩa vụ pháp lý và bảo vệ quyền, lợi ích hợp pháp của chúng tôi và của người dùng khác.",
        ],
      },
      {
        heading: "6. Cơ sở pháp lý",
        paragraphs: [
          "Với dữ liệu cần để vận hành bot và dashboard, chúng tôi xử lý trên cơ sở thực hiện dịch vụ theo Điều khoản sử dụng và lợi ích hợp pháp trong việc bảo vệ hệ thống, chống lạm dụng. Với IP và tín hiệu thiết bị trong xác minh web, chúng tôi dựa trên sự đồng ý của bạn: bạn chỉ gửi dữ liệu sau khi tick ô đồng ý trên trang xác minh, và có thể từ chối bằng cách đóng trang (khi đó bạn không được xác minh). Ở nơi pháp luật cho phép xử lý vì lợi ích hợp pháp hoặc nghĩa vụ pháp lý, chúng tôi vẫn giới hạn dữ liệu ở mức tối thiểu.",
          "Với người ở Việt Nam, IP và tín hiệu thiết bị/hành vi trong xác minh web được xác định là dữ liệu cá nhân nhạy cảm theo Điều 4(l) Nghị định 356/2025/NĐ-CP (dữ liệu theo dõi hành vi, hoạt động sử dụng dịch vụ mạng xã hội và dịch vụ trực tuyến khác). Trước khi xin đồng ý, trang xác minh thông báo rõ đây là dữ liệu cá nhân nhạy cảm theo Điều 6(4); ô đồng ý mặc định trống, không gộp mục đích và bạn có thể từ chối.",
          "Nếu bạn ở Việt Nam, chúng tôi áp dụng Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và Nghị định 356/2025/NĐ-CP. Nếu bạn ở Khu vực Kinh tế Châu Âu (EEA) hoặc Vương quốc Anh, chúng tôi áp dụng các quyền tương ứng của GDPR. Chúng tôi tôn trọng các quyền này cho mọi người dùng, kể cả khi luật địa phương chưa bắt buộc.",
        ],
      },
      {
        heading: "7. Nơi lưu trữ, chuyển dữ liệu xuyên biên giới và thời hạn",
        paragraphs: [
          "Dữ liệu được lưu trên hạ tầng Convex do Protogon sử dụng và mặc định tách theo từng server. Hai ngoại lệ có kiểm soát: tín hiệu chống spam liên server (chỉ khi server bật chia sẻ, không kèm ID người dùng, nguồn bị băm một chiều, tự xoá sau 24 giờ) và mẫu sự kiện raid đã bỏ ID server/người dùng dùng để cải thiện nhận diện toàn mạng. Một số nhà cung cấp (Convex, Discord, GitHub, ipapi.is, nhà cung cấp AI và hạ tầng web) có thể xử lý dữ liệu ngoài Việt Nam hoặc ngoài EEA. Chúng tôi chỉ gửi lượng dữ liệu tối thiểu cần cho đúng mục đích, yêu cầu nhà cung cấp bảo mật theo hợp đồng/điều khoản dịch vụ và không chuyển dữ liệu cho bên thứ ba ngoài các trường hợp ở mục 8.",
          "Thời hạn lưu trữ:",
        ],
        bullets: [
          "Phiên đăng nhập dashboard: hết hiệu lực sau 30 ngày; đăng xuất xoá ngay; phiên quá hạn bị dọn tự động.",
          "Góp ý: tối đa 365 ngày kể từ khi gửi.",
          "Thanh toán/đối soát: giữ theo thời hạn kế toán luật định (tối đa 10 năm) rồi xoá; chỉ gồm dữ liệu đơn hàng, không có thông tin thẻ hay tài khoản ngân hàng.",
          "Phiên xác minh web: hết hạn sau 10 phút; xoá 7 ngày sau khi hết hạn.",
          "Tín hiệu xác minh (hash IP/thiết bị/cookie/UA): tối đa 730 ngày kể từ lần cuối xuất hiện.",
          "Liên kết tài khoản phụ: tối đa 180 ngày kể từ tín hiệu cuối.",
          "Nhật ký xác minh: tối đa 365 ngày.",
          "Ban IP: thời hạn ban 1–90 ngày; bản ghi được giữ thêm tối đa 90 ngày ở trạng thái vô hiệu để đối chiếu rồi xoá hẳn (tổng tối đa khoảng 180 ngày).",
          "Cache tra cứu ipapi.is: 24 giờ; xoá ngay khi hết hạn.",
          "Hành động hình phạt: tối đa 365 ngày kể từ khi tạo, trừ khi bạn yêu cầu xoá sớm hơn. Điểm nhiệt và số lần cảnh báo: giữ khi còn hiệu lực để bot áp đúng hình phạt; quản trị viên có thể đặt lại bất cứ lúc nào.",
          "Sự kiện chống nuke/raid: tối đa 365 ngày. Lượt vào server khi bật Join Gate: tối đa 90 ngày. Mẫu sự kiện raid dùng để cải thiện nhận diện (đã bỏ ID server/người dùng): tối đa 180 ngày.",
          "Ticket đã đóng (nội dung, bằng chứng, ô bổ sung, transcript): xoá 180 ngày sau khi đóng. Ticket còn mở được giữ tới khi đóng để staff còn xử lý.",
          "Tín hiệu chống spam liên server: tự xoá sau 24 giờ.",
          "File backup: giữ theo lịch bạn chọn (2–30 ngày một bản); bản cũ trong bot tự bị xoá khi có bản mới, còn bản trên GitHub Gist do bạn quản lý.",
        ],
      },
      {
        heading: "8. Bên thứ ba",
        paragraphs: [
          "Protogon dựa trên các dịch vụ sau để hoạt động. Chúng tôi không bán hoặc trao dữ liệu cho bên quảng cáo:",
        ],
        bullets: [
          "Discord: nguồn dữ liệu và nơi bot thực thi hành động theo API chính thức.",
          "Convex: lưu trữ cơ sở dữ liệu và chạy backend của dashboard.",
          "GitHub: chỉ nhận file backup khi bạn bật đẩy Gist bằng khoá của bạn.",
          "Nhà cung cấp AI: xử lý trích đoạn hội thoại cần thiết khi bạn dùng báo cáo raid hoặc trợ lý Haimiya, phục vụ đúng yêu cầu đó.",
          "ipapi.is: chỉ nhận địa chỉ IP khi server bật xác minh qua web, để tra quốc gia/ASN và dấu hiệu VPN/proxy/Tor/datacenter. Dữ liệu được xử lý tại Đức, Hoa Kỳ hoặc Singapore; ipapi.is xử lý thay mặt chúng tôi theo DPA công bố của họ. Không nhận ID Discord, tên người dùng hay bất kỳ dữ liệu định danh nào khác. Kết quả được cache theo hash tách server trong 24 giờ.",
          "Nhà cung cấp hạ tầng web/tên miền: phục vụ dashboard và trang xác minh; xử lý IP như mọi máy chủ web khi trình duyệt kết nối.",
        ],
      },
      {
        heading: "9. Quyền của bạn",
        paragraphs: [
          "TRƯỚC KHI chúng tôi thu thập, chúng tôi cho bạn biết dữ liệu nào được thu, vì sao, gửi cho ai và giữ bao lâu. Bạn có các quyền sau với dữ liệu cá nhân của mình:",
        ],
        bullets: [
          "Được biết dữ liệu nào được thu, vì sao, gửi cho ai và giữ bao lâu — trước khi chúng tôi thu thập.",
          "Xem, chỉnh sửa cấu hình, whitelist, câu trả lời và backup trong dashboard.",
          "Yêu cầu xuất hoặc xoá dữ liệu của server hoặc của cá nhân bạn.",
          "Rút lại sự đồng ý bất cứ lúc nào; việc rút lại không làm mất hiệu lực xử lý đã diễn ra trước đó, nhưng chúng tôi sẽ ngừng thu mới và xoá theo yêu cầu.",
          "Phản đối hoặc yêu cầu hạn chế xử lý; cách triệt để nhất là gỡ bot khỏi server, sau đó gửi yêu cầu xoá.",
          "Yêu cầu xem lại quyết định tự động (ví dụ bị từ chối xác minh) và trình bày lý do.",
          "Khiếu nại với cơ quan quản lý nhà nước có thẩm quyền về bảo vệ dữ liệu cá nhân tại nơi bạn sinh sống, hoặc tại Việt Nam. Chúng tôi mong bạn liên hệ trước để có cơ hội giải quyết.",
        ],
      },
      {
        heading: "10. Cách gửi yêu cầu và thời gian phản hồi",
        paragraphs: [
          "Gửi yêu cầu qua kênh hỗ trợ Discord hoặc fanpage Facebook ở chân trang, kèm ID server/ID người dùng và mô tả ngắn. Chúng tôi phản hồi trong tối đa 02 ngày làm việc và hoàn tất trong tối đa 10 ngày với yêu cầu xem, chỉnh sửa hoặc cung cấp dữ liệu; 15 ngày với yêu cầu rút lại đồng ý, hạn chế hoặc phản đối xử lý; 20 ngày với yêu cầu xoá. Nếu phức tạp, chúng tôi gia hạn một lần theo mức luật cho phép và thông báo lý do.",
          "Để tránh xoá nhầm dữ liệu của người khác, chúng tôi cần xác minh: người có tài khoản dashboard xác nhận qua đăng nhập Discord, hoặc chủ server xác nhận cho thành viên trong server của mình.",
        ],
      },
      {
        heading: "11. Bảo mật",
        paragraphs: [
          "Quyền truy cập dashboard dựa trên đăng nhập Discord OAuth2 và được kiểm tra lại ở phía backend cho từng yêu cầu; không có backdoor hay đường tắt bỏ qua xác thực. Dữ liệu xác minh chỉ quản trị viên của chính server đó và bot được đọc; team admin của bot không có quyền đọc xuyên server.",
          "Các thao tác quản trị cấp cao cần khoá bot riêng, khoá này được lưu ở dạng băm. File backup có thể được mã hoá AES-256-GCM và kiểm tra toàn vẹn bằng SHA-256 trước khi khôi phục.",
          "IP thô không được ghi vào cơ sở dữ liệu; hash IP dùng HMAC-SHA-256 với khoá bí mật, tách theo từng server. Hash vẫn là dữ liệu cá nhân giả danh, không phải dữ liệu ẩn danh hoàn toàn — chúng tôi đối xử như vậy.",
          "Phát hiện sự cố ảnh hưởng dữ liệu: chúng tôi thông báo cho chủ server bị ảnh hưởng qua kênh liên hệ đã đăng ký. Nếu sự cố có thể xâm phạm tính mạng, sức khoẻ, danh dự, nhân phẩm, tài sản của chủ thể dữ liệu hoặc ảnh hưởng an ninh quốc gia, trật tự, an toàn xã hội, chúng tôi thông báo cho cơ quan chuyên trách bảo vệ dữ liệu cá nhân chậm nhất 72 giờ kể từ khi phát hiện, lập biên bản xác nhận và áp dụng biện pháp khắc phục cần thiết.",
          "Không hệ thống nào an toàn tuyệt đối. Nếu bạn phát hiện lỗ hổng, hãy báo riêng cho chúng tôi qua kênh hỗ trợ thay vì công khai; chúng tôi ghi nhận và xử lý trước khi công bố.",
        ],
      },
      {
        heading: "12. Cookie và lưu trữ cục bộ",
        paragraphs: [
          "Dashboard dùng localStorage để giữ token phiên đăng nhập (thời hạn tối đa 30 ngày). Đây là lưu trữ thiết yếu để bạn không phải đăng nhập lại sau mỗi lần tải trang; đăng xuất sẽ xoá token.",
          "Trang xác minh đặt một mã thiết bị ngẫu nhiên trong localStorage và đọc các tín hiệu trình duyệt (user-agent, canvas, WebGL, kích thước màn hình, ngôn ngữ, múi giờ, số nhân CPU). Mã và tín hiệu chỉ được gửi dưới dạng băm; mục đích là chống tài khoản giả và tái sử dụng thiết bị để lách ban.",
          "Chúng tôi không dùng cookie quảng cáo, cookie theo dõi của bên thứ ba hay pixel quảng cáo. Bạn có thể xoá localStorage/cookie trong trình duyệt; khi đó xác minh có thể không hoàn tất vì thiếu tín hiệu thiết bị, và bạn có thể phải xác minh lại.",
        ],
      },
      {
        heading: "13. Xác minh qua web: IP, thiết bị, quyết định tự động",
        paragraphs: [
          "Khi chủ server bật xác minh qua web (phương thức “Web”), trang xác minh thu một số tín hiệu để chặn tài khoản giả, VPN/proxy và tài khoản phụ. Việc này chỉ xảy ra khi bạn mở link xác minh do bot gửi và tick ô đồng ý; nếu bạn không đồng ý, trang không gửi IP/thiết bị và bạn không được xác minh.",
          "Đây là dữ liệu cá nhân nhạy cảm theo Điều 4(l) Nghị định 356/2025/NĐ-CP. Trang xác minh thông báo rõ điều này trước khi xin đồng ý theo Điều 6(4); ô đồng ý mặc định trống, không gộp mục đích và bạn có thể từ chối bất cứ lúc nào trước khi bấm xác minh.",
        ],
        bullets: [
          "Địa chỉ IP: server đọc địa chỉ nguồn của kết nối (mục cuối của X-Forwarded-For do hạ tầng thêm, lùi về metadata của Convex), không tin giá trị client tự khai. IP thô chỉ được xử lý trong bộ nhớ cho lượt xác minh và không ghi vào cơ sở dữ liệu.",
          "Lưu hash: IP được băm HMAC-SHA-256 bằng khoá bí mật, tách riêng theo từng server. Cùng một IP ở hai server cho hai giá trị khác nhau; phiên mới không lưu hash toàn cục. Hash là dữ liệu cá nhân giả danh, không thể đảo ngược nếu không có khoá bí mật, nhưng chúng tôi vẫn bảo vệ như dữ liệu cá nhân.",
          "Tra cứu mạng: IP được gửi tới ipapi.is cho đúng một lượt tra cứu để nhận quốc gia/ASN và dấu hiệu VPN/proxy/Tor/datacenter/mobile. Dữ liệu được xử lý tại Đức, Hoa Kỳ hoặc Singapore theo DPA công bố của ipapi.is. Không gửi ID Discord hay tên người dùng. Kết quả lưu theo hash tách server trong 24 giờ.",
          "Dấu vết thiết bị/trình duyệt: user-agent, canvas, WebGL, kích thước màn hình, ngôn ngữ, múi giờ, số nhân CPU và một mã ngẫu nhiên do trang đặt — tất cả chỉ lưu dưới dạng băm.",
          "Kiểm tra người thật: trang dùng bẫy ẩn (honeypot), thời gian ở trang tối thiểu và cử động chuột/bàn phím — không dùng captcha hình ảnh.",
          "Quyết định tự động: theo cấu hình của chủ server, kết quả có thể là cho qua, từ chối, timeout, kick hoặc ban. Chủ server, quản trị viên, bot và người trong whitelist luôn được miễn; IP dùng chung (CGNAT, mạng di động) chỉ bị từ chối xác minh, không tự động ban. Không phải mọi quyết định đều có người xem trước.",
          "Ban theo IP: quản trị viên có thể chặn một hash IP từ 1 đến 90 ngày (mặc định 7), phạm vi chính xác hoặc prefix IPv6 /64. Bản ghi ban được giữ thêm tối đa 90 ngày ở trạng thái vô hiệu rồi xoá hẳn.",
          "Thời hạn: phiên xác minh xoá 7 ngày sau khi hết hạn; tín hiệu thiết bị/IP dùng để phát hiện tài khoản phụ giữ tối đa 730 ngày; liên kết tài khoản phụ tối đa 180 ngày; nhật ký xác minh tối đa 365 ngày.",
          "Tắt tính năng hoặc rút lại đồng ý: khi chủ server tắt xác minh web, không có lượt thu tín hiệu mới nào. Bạn có thể yêu cầu xoá dữ liệu xác minh của mình; quản trị viên server có nút xoá theo từng thành viên. Dữ liệu cũ vẫn được dọn theo thời hạn ở trên.",
        ],
      },
      {
        heading: "14. Khiếu nại quyết định tự động",
        paragraphs: [
          "Liên hệ quản trị viên server hoặc kênh hỗ trợ của Protogon kèm ID server/ID người dùng và thời điểm xác minh. Chúng tôi sẽ xem lại tín hiệu, giải thích lý do trong phạm vi không tiết lộ dữ liệu của người khác, và có thể yêu cầu xác minh lại hoặc gỡ hạn chế nếu phát hiện nhầm.",
        ],
      },
      {
        heading: "15. Thay đổi chính sách và liên hệ",
        paragraphs: [
          "Chính sách có thể được cập nhật; ngày rà soát gần nhất ghi ở đầu trang và mọi thay đổi quan trọng được thông báo trong cộng đồng Discord. Việc bạn tiếp tục dùng bot sau ngày đó nghĩa là bạn chấp nhận bản mới; nếu thay đổi làm thay đổi mục đích hoặc phạm vi xử lý dữ liệu xác minh, chúng tôi sẽ xin lại sự đồng ý trước khi áp dụng cho lượt xác minh mới.",
          "Mọi câu hỏi hoặc yêu cầu liên quan dữ liệu: gửi trong kênh hỗ trợ của cộng đồng Discord Protogon hoặc fanpage Facebook ở chân trang, kèm ID server hoặc ID người dùng liên quan. Đây là kênh tiếp nhận chính thức; chúng tôi phản hồi trong tối đa 02 ngày làm việc và hoàn tất theo thời hạn luật định (10 ngày với xem/chỉnh sửa/cung cấp, 15 ngày với hạn chế hoặc phản đối xử lý, 20 ngày với xoá; gia hạn một lần theo mức luật cho phép nếu phức tạp).",
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
          "Phiên đăng nhập dashboard: hết hiệu lực sau 30 ngày; đăng xuất xoá ngay; phiên quá hạn bị dọn tự động.",
          "Góp ý: tối đa 365 ngày kể từ khi gửi.",
          "Thanh toán/đối soát: giữ theo thời hạn kế toán luật định (tối đa 10 năm) rồi xoá; chỉ gồm dữ liệu đơn hàng, không có thông tin thẻ hay tài khoản ngân hàng.",
          "Phiên xác minh web: hết hạn sau 10 phút; xoá 7 ngày sau khi hết hạn.",
          "Tín hiệu xác minh (hash IP/thiết bị/cookie/UA): tối đa 730 ngày kể từ lần cuối xuất hiện.",
          "Liên kết tài khoản phụ: tối đa 180 ngày kể từ tín hiệu cuối.",
          "Nhật ký xác minh: tối đa 365 ngày.",
          "Ban IP: thời hạn ban 1–90 ngày; bản ghi được giữ thêm tối đa 90 ngày ở trạng thái vô hiệu rồi xoá hẳn (tổng tối đa khoảng 180 ngày).",
          "Cache tra cứu ipapi.is: 24 giờ; xoá ngay khi hết hạn.",
          "Hành động hình phạt: tối đa 365 ngày kể từ khi tạo, trừ khi bạn yêu cầu xoá sớm hơn. Điểm nhiệt và số lần cảnh báo: giữ khi còn hiệu lực; quản trị viên đặt lại được bất cứ lúc nào.",
          "Sự kiện chống nuke/raid: tối đa 365 ngày. Lượt vào server: tối đa 90 ngày. Mẫu sự kiện raid đã bỏ định danh: tối đa 180 ngày.",
          "Ticket đã đóng (nội dung, bằng chứng, transcript): xoá 180 ngày sau khi đóng; ticket còn mở giữ tới khi đóng.",
          "Tín hiệu chống spam liên server: 24 giờ.",
          "File backup: giữ theo lịch bạn chọn (2–30 ngày một bản); bản cũ trong bot tự bị xoá khi có bản mới, còn bản trên GitHub Gist do bạn quản lý.",
        ],
      },
      {
        heading: "3. Tự xoá ngay trong dashboard",
        paragraphs: [
          "Phần lớn dữ liệu bạn xoá được mà không cần chờ ai: mỗi panel đều có nút xoá tương ứng.",
        ],
        bullets: [
          "Xoá file backup không cần dùng nữa: đặt trần lưu trữ (số bản hoặc số ngày) để bot tự xoá bản cũ ngay khi lưu bản mới; bản đã đẩy lên GitHub Gist bằng khoá của bạn thì bạn tự xoá trong Gist. Muốn xoá ngay một bản cụ thể, gửi yêu cầu ở kênh hỗ trợ.",
          "Xoá danh sách whitelist, câu tự trả lời, giveaway, bảng reaction role khi không còn dùng.",
          "Trong panel Xác minh web, quản trị viên có thể xoá dữ liệu xác minh của một thành viên (phiên, tín hiệu, liên kết tài khoản phụ).",
          "Đặt lại điểm nhiệt và số lần cảnh báo của một thành viên.",
          "Đăng xuất dashboard để vô hiệu hoá phiên đăng nhập hiện tại.",
        ],
      },
      {
        heading: "4. Xoá vĩnh viễn dữ liệu của cả server",
        paragraphs: [
          "Khi bạn muốn xoá toàn bộ dấu vết của server khỏi Protogon, hãy thực hiện theo thứ tự: gỡ bot khỏi server, sau đó gửi yêu cầu trong kênh hỗ trợ kèm ID server.",
          "Chúng tôi xác nhận đã nhận yêu cầu, xoá cấu hình, bản ghi hành động, lịch sử nhiệt, thành viên vào/rời, ticket và transcript, dữ liệu xác minh web (phiên, tín hiệu, liên kết tài khoản phụ) và file backup do bot đang giữ, rồi phản hồi khi hoàn tất. Nhật ký xác minh đã bỏ định danh và bản ghi ban IP đã bỏ định danh có thể được giữ tối đa theo thời hạn an ninh ở mục 2. Thời hạn thực hiện: phản hồi trong tối đa 02 ngày làm việc, hoàn tất trong tối đa 20 ngày (gia hạn một lần theo mức luật cho phép nếu phức tạp).",
        ],
      },
      {
        heading: "5. Xoá dữ liệu cá nhân",
        paragraphs: [
          "Thành viên trong server có thể yêu cầu xoá dữ liệu liên quan tới chính mình: ID, lượt vào/rời, bản ghi vi phạm, phiên đăng nhập dashboard nếu có.",
          "Để tránh xoá nhầm dữ liệu của người khác, chúng tôi cần xác minh: người có tài khoản dashboard xác nhận qua đăng nhập Discord, hoặc chủ server xác nhận cho thành viên trong server của mình.",
          "Với dữ liệu xác minh web, quản trị viên server có thể xoá ngay trong panel Xác minh web; yêu cầu qua kênh hỗ trợ cũng được xử lý. Phiên, tín hiệu và liên kết bị xoá; nhật ký audit và bản ghi ban IP được bỏ định danh (không còn userId) và chỉ giữ tối đa theo thời hạn an ninh để chống lạm dụng.",
        ],
      },
      {
        heading: "6. Cách gửi yêu cầu xoá",
        paragraphs: [
          "Gửi yêu cầu trong kênh hỗ trợ của cộng đồng Discord Protogon, kèm: mục cần xoá, ID server (nếu là dữ liệu server), ID người dùng (nếu là dữ liệu cá nhân) và mô tả ngắn. Chúng tôi phản hồi trong tối đa 02 ngày làm việc và hoàn tất trong tối đa 20 ngày.",
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
          "Một lượng tối thiểu bản ghi có thể được giữ lâu hơn khi cần phòng chống lạm dụng (ví dụ bằng chứng về hành vi tấn công hệ thống, nhật ký xác minh đã bỏ định danh hoặc bản ghi ban IP đã bỏ định danh) hoặc khi pháp luật yêu cầu. Trong trường hợp đó, chúng tôi giới hạn ở mức nhỏ nhất và không dùng cho mục đích khác.",
          "Sau khi dữ liệu đã bị xoá, việc khôi phục là không thể, kể cả khi bạn mời lại bot vào server.",
        ],
      },
      {
        heading: "9. Xác nhận và liên hệ",
        paragraphs: [
          "Yêu cầu xoá luôn được phản hồi xác nhận: đã nhận, đang xử lý, hoặc đã hoàn tất. Nếu quá 20 ngày bạn chưa nhận được phản hồi, hãy nhắc lại trong kênh hỗ trợ.",
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
      "Protogon is a Discord bot with a web dashboard at protogon.freebuff.app, operated by the RFTV team. Every feature is currently provided free of charge for every server; no paid plan is on sale. By inviting the bot, signing in to the dashboard, or using any feature, you agree to the terms below. If you do not agree, remove the bot from your server and stop using the dashboard.",
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
          "When you enable web verification, clearly tell members that the verification page collects IP and device signals, sends the IP once to ipapi.is, and may make automated decisions; enable it only when you have a legal basis and comply with the Privacy Policy.",
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
          "Every feature is provided free of charge, with no service-level commitment (SLA) and no purchase transaction. The bot may be interrupted when Discord, our hosting provider, or the AI service has an incident; we work on it and report in the community channel.",
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
    summary:
      "What data Protogon stores, why, who receives it, how long it is kept, and how you stay in control.",
    updated: LEGAL_UPDATED,
    intro:
      "Protogon stores only what is needed for the bot to protect your server and for the dashboard to show your configuration. This policy explains who is responsible, what data is collected (including IP and device signals when web verification is enabled), why, who receives it, how long it is kept, and how you stay in control. We do not sell data, we do not use it for advertising, and we do not read your private messages.",
    sections: [
      {
        heading: "1. Quick summary",
        paragraphs: ["Three points matter most before the details:"],
        bullets: [
          "We store Discord IDs, server configuration, and records of bot actions — not ordinary message content. There are two deliberate exceptions: content you submit in a ticket (plus the transcript when it closes) and short spam snippets when a server enables cross-server threat sharing.",
          "When a server enables web verification, the verification page collects IP and device signals. Raw IP is not stored; only a per-server HMAC-SHA-256 value is kept, and the IP is sent once to ipapi.is for VPN/proxy/Tor lookup.",
          "Data is never sold or shared for advertising. You can request deletion at any time; the steps are on the Retention & Data Deletion page.",
        ],
      },
      {
        heading: "2. Who is responsible for data",
        paragraphs: [
          "Protogon is a Discord bot with a web dashboard at protogon.freebuff.app, operated by the RFTV team. The RFTV team is the controller for dashboard account data, platform operation data, and verification data created by the bot.",
          "When the bot is in a server, the server owner decides whether to enable features and how punishments are configured. For member data in that server, the server owner determines the purpose and scope; Protogon processes it according to that configuration and this policy. Server owners must inform members and ensure they have a legal basis when enabling data-collecting features, especially web verification.",
          "The official data contact channels are the support channel in the Protogon Discord and the Facebook page linked in the footer. We may ask you to verify your identity before handling a request so we do not delete someone else's data.",
        ],
      },
      {
        heading: "3. Data we store",
        paragraphs: [
          "The data falls into the following groups, all of them serving the operation of the bot and dashboard:",
        ],
        bullets: [
          "Dashboard account: Discord ID, username, display name, avatar, the list of servers you can manage, last sign-in time, and your dashboard session.",
          "Payments (when you donate or buy a plan): Discord ID, plan, amount, ZaloPay order code, status and timestamps, and the terms version you accepted. We do not store card or bank account numbers — ZaloPay handles them.",
          "Feedback: the message you send, an email if you voluntarily provide one, your language, and the page you sent it from.",
          "Server: ID, name, icon, member count, prefix, per-module configuration, channels and roles used for logging, whitelist entries, and created webhooks.",
          "Bot activity: punishment records with reason and moderator, heat score and warning count, anti-nuke/raid events, and join records when Join Gate is enabled (ID, username, avatar, account age, risk score and reasons, action taken).",
          "Content you create: auto-reply lines, welcome and goodbye messages, giveaways, reaction-role panels; content you submit in tickets (body, evidence, custom fields) and the ticket-channel transcript when a ticket closes; backup files when you enable backups.",
          "Cross-server threat signals (only when you enable sharing): a spam snippet of up to 60 characters with mentions stripped, plus suspicious bot names; no user IDs, the source server is one-way hashed, and the signal expires after 24 hours.",
          "Web verification: verification sessions (hashed token, server/user ID, status, decision, timestamps), IP and device hashes, alt-account links, IP bans, and audit records. Details in section 13.",
        ],
      },
      {
        heading: "4. Message content",
        paragraphs: [
          "The bot reads messages in your server to run auto-replies, filter spam, detect malicious links, and compile reports during a raid. Ordinary messages are not stored in the database.",
          "Only the parts that triggered a filter are recorded (offending content, reason, punishment) so moderators can review and explain the action. If you enable backups with messages included, that content ends up in a backup file you control.",
          "There are two deliberate exceptions. First, content you submit in a ticket — body, evidence, custom fields — is stored so staff can handle it; when the ticket closes, the bot saves a transcript of the ticket channel to storage. Only staff of that server can view either through the dashboard, and both are deleted 180 days after the ticket closes. Second, if you enable threat sharing, a spam snippet of up to 60 characters (mentions stripped) and suspicious bot names are shared with other servers that enabled receiving; no user IDs are included, the source server is one-way hashed, and the signal expires after 24 hours.",
          "The bot does not read direct messages between members. If you message the bot directly, that content is used only to answer you.",
        ],
      },
      {
        heading: "5. How we use data",
        paragraphs: ["Data is used only for the following purposes:"],
        bullets: [
          "Running the features you enabled: auto-reply, heat and warnings, anti-nuke/raid, Join Gate, welcome messages, punishments.",
          "Preventing abuse and attacks: detecting raids, blocking rogue bots, blocking password guessing, and stopping raiders from returning.",
          "Sharing threat signals between servers that enabled the feature (opt-in on both sides) so raids can be blocked earlier.",
          "Improving raid detection with event samples that have server and user IDs removed; these samples are not used to identify or score individuals.",
          "Supporting you when you report an incident, with the evidence needed to trace it.",
          "Aggregate system health figures (server counts, request counts) with no personal identification.",
          "Complying with legal obligations and protecting our rights and the rights of other users.",
        ],
      },
      {
        heading: "6. Legal basis",
        paragraphs: [
          "For data needed to run the bot and dashboard, we process on the basis of performing the service under the Terms of Service and our legitimate interest in protecting the system against abuse. For IP and device signals in web verification, we rely on your consent: data is sent only after you tick the consent box on the verification page, and you can refuse by closing the page (in which case you will not be verified). Where the law allows processing for legitimate interests or legal obligations, we still minimise the data.",
          "For people in Vietnam, IP and device/behaviour signals in web verification are sensitive personal data under Article 4(l) of Decree 356/2025/ND-CP (data tracking behaviour and use of social networks and other online services). Before asking for consent, the verification page states clearly that this is sensitive personal data, as required by Article 6(4); the consent box is empty by default, purposes are not bundled, and you can refuse.",
          "If you are in Vietnam, we apply the Personal Data Protection Law No. 91/2025/QH15 and Decree 356/2025/ND-CP. If you are in the European Economic Area (EEA) or the United Kingdom, we apply the corresponding GDPR rights. We respect these rights for all users, even where local law does not yet require it.",
        ],
      },
      {
        heading: "7. Where data lives, cross-border transfers, and retention",
        paragraphs: [
          "Data is stored on the Convex infrastructure Protogon uses and is separated per server by default. There are two controlled exceptions: cross-server threat signals (only when a server enables sharing, no user IDs, the source is one-way hashed, and signals expire after 24 hours) and raid event samples with server and user IDs removed, used to improve detection across the network. Some providers (Convex, Discord, GitHub, ipapi.is, AI providers, and web hosting) may process data outside Vietnam or the EEA. We send only the minimum data needed for the purpose, require providers to protect it under their contracts/terms of service, and do not transfer data to third parties except as described in section 8.",
          "Retention periods:",
        ],
        bullets: [
          "Dashboard session: valid for at most 30 days; signing out deletes it immediately, and expired sessions are cleaned up automatically.",
          "Feedback: at most 365 days from submission.",
          "Payments/reconciliation: kept for the statutory accounting period (up to 10 years), then deleted; order data only, with no card or bank account details.",
          "Web verification session: expires after 10 minutes; deleted 7 days after expiry.",
          "Verification signals (IP/device/cookie/UA hashes): at most 730 days from the last sighting.",
          "Alt-account links: at most 180 days from the last signal.",
          "Verification audit records: at most 365 days.",
          "IP bans: ban duration 1–90 days; the record is kept for up to 90 more days in an inactive state for reference, then deleted (about 180 days in total).",
          "ipapi.is lookup cache: 24 hours; deleted as soon as it expires.",
          "Punishments: at most 365 days from creation, unless you request earlier deletion. Heat scores and warnings: kept while active so the bot can apply the right punishment; administrators can reset them at any time.",
          "Anti-nuke/raid events: at most 365 days. Join records when Join Gate is enabled: at most 90 days. Raid event samples used to improve detection (server and user IDs removed): at most 180 days.",
          "Closed tickets (body, evidence, custom fields, transcript): deleted 180 days after closing. Open tickets are kept until they close so staff can still handle them.",
          "Cross-server threat signals: deleted automatically after 24 hours.",
          "Backup files: kept on the schedule you choose (one every 2–30 days); older copies inside the bot are deleted when a new one is created, while copies on GitHub Gist are yours to manage.",
        ],
      },
      {
        heading: "8. Third parties",
        paragraphs: [
          "Protogon relies on the services below to operate. We do not sell or hand data to advertisers, each provider receives only what it needs, and we do not transfer data to other third parties unless you agree or the law requires it:",
        ],
        bullets: [
          "Discord: the source of the data and the platform where the bot acts through the official API.",
          "Convex: hosts the database and runs the dashboard backend.",
          "GitHub: receives backup files only when you enable Gist upload with your own key.",
          "AI providers: process the conversation excerpts necessary when you use raid reports or the Haimiya assistant, for that request only.",
          "ipapi.is: receives only the IP address when a server enables web verification, to look up country/ASN and VPN/proxy/Tor/datacenter signals. Data is processed in Germany, the United States, or Singapore; ipapi.is processes it on our behalf under its published DPA. It receives no Discord ID, username, or other identifying data. Results are cached by a per-server hash for 24 hours.",
          "Web/domain hosting: serves the dashboard and verification page and processes IP addresses like any web server when your browser connects.",
        ],
      },
      {
        heading: "9. Your rights",
        paragraphs: [
          "BEFORE we collect, we tell you what data is collected, why, who receives it, and how long it is kept. You have the following rights over your personal data:",
        ],
        bullets: [
          "To know what data is collected, why, who receives it, and how long it is kept — before we collect it.",
          "To view and edit configuration, whitelist entries, auto-replies, and backups in the dashboard.",
          "To request an export or deletion of your server's data or your personal data.",
          "To withdraw consent at any time; withdrawal does not affect processing that already happened, but we stop new collection and delete on request.",
          "To object to or request restriction of processing; the most thorough route is to remove the bot from the server, then send a deletion request.",
          "To request a review of an automated decision (for example, a denied verification) and an explanation of the reasons.",
          "To complain to the competent personal data protection authority where you live, or in Vietnam. We ask you to contact us first so we have a chance to resolve it.",
        ],
      },
      {
        heading: "10. How to send a request and response times",
        paragraphs: [
          "Send requests through the Discord support channel or the Facebook page in the footer, with the server ID/user ID and a short description. We respond within 2 working days and complete within 10 days for access, correction or data-portability requests; 15 days for withdrawal of consent, restriction or objection; and 20 days for erasure. If a request is complex, we extend once by the maximum the law allows and explain why.",
          "To avoid deleting someone else's data, we verify: dashboard account holders confirm by signing in with Discord, or a server owner confirms on behalf of a member in their server.",
        ],
      },
      {
        heading: "11. Security",
        paragraphs: [
          "Dashboard access relies on Discord OAuth2 sign-in and is re-checked on the backend for every request; there is no backdoor and no way to skip authentication. Verification data can be read only by administrators of that same server and by the bot; the bot's team admins have no cross-server access.",
          "High-privilege administrative actions require a separate bot key, stored as a hash. Backup files can be encrypted with AES-256-GCM and verified with SHA-256 before a restore.",
          "Raw IP is not written to the database; IP hashes use HMAC-SHA-256 with a secret key, scoped per server. A hash is still pseudonymous personal data, not fully anonymous data — we treat it that way.",
          "If an incident affects data, we notify the affected server owners through their registered contact channel. Where the incident may harm the life, health, honour, dignity or property of data subjects, or affect national security, public order or social safety, we notify the competent personal data protection authority within 72 hours of discovery, record a written confirmation of the incident, and apply the necessary remedial measures.",
          "No system is completely secure. If you find a vulnerability, report it privately through our support channel rather than publicly; we will acknowledge and address it before disclosure.",
        ],
      },
      {
        heading: "12. Cookies and local storage",
        paragraphs: [
          "The dashboard uses localStorage to keep your sign-in session token (valid for at most 30 days). This is strictly necessary storage so you do not have to sign in again after every page load; signing out clears the token.",
          "The verification page stores a random device ID in localStorage and reads browser signals (user-agent, canvas, WebGL, screen size, languages, timezone, CPU core count). The ID and signals are sent only as hashes; the purpose is to stop fake accounts and device reuse to evade bans.",
          "We do not use advertising cookies, third-party tracking cookies, or advertising pixels. You can clear localStorage/cookies in your browser; verification may then fail because device signals are missing, and you may need to verify again.",
        ],
      },
      {
        heading: "13. Web verification: IP, device, automated decisions",
        paragraphs: [
          "When a server owner enables web verification (the “Web” method), the verification page collects a few signals to block fake accounts, VPNs/proxies, and alt accounts. This happens only when you open the verification link the bot sends and tick the consent box; if you do not consent, the page does not send IP/device data and you will not be verified.",
          "This is sensitive personal data under Article 4(l) of Decree 356/2025/ND-CP. The verification page states this clearly before asking for consent, as required by Article 6(4); the consent box is empty by default, purposes are not bundled, and you can refuse at any time before pressing verify.",
        ],
        bullets: [
          "IP address: the server reads the source address of the connection (the last entry of X-Forwarded-For added by the edge, falling back to Convex metadata), never a value the client declares. Raw IP is processed in memory for that verification and is not written to the database.",
          "Hashing: the IP is hashed with HMAC-SHA-256 using a secret key, scoped per server. The same IP on two servers produces different values; new sessions do not store a global hash. A hash is pseudonymous personal data, not reversible without the secret key, but we still protect it as personal data.",
          "Network lookup: the IP is sent to ipapi.is for that single lookup to obtain country/ASN and VPN/proxy/Tor/datacenter/mobile signals. Data is processed in Germany, the United States, or Singapore under ipapi.is's published DPA. We do not send your Discord ID or username. The result is cached by a per-server hash for 24 hours.",
          "Device/browser fingerprint: user-agent, canvas, WebGL, screen size, languages, timezone, CPU core count, and a random ID the page sets — all stored only as hashes.",
          "Human check: the page uses a hidden honeypot field, a minimum time on page, and pointer/keyboard movement — no image captcha.",
          "Automated decision: depending on the server owner's configuration, the result may be allow, deny, timeout, kick, or ban. Server owners, administrators, bots, and whitelisted users are always exempt; shared IPs (CGNAT, mobile networks) are only denied verification and never auto-banned. Not every decision is reviewed by a human first.",
          "IP bans: admins can block an IP hash for 1 to 90 days (7 by default), scoped to the exact address or an IPv6 /64 prefix. The ban record is kept for up to 90 more days in an inactive state, then deleted.",
          "Retention: verification sessions are deleted 7 days after they expire; device/IP traces used to detect alt accounts are kept for at most 730 days; alt-account links for at most 180 days; verification audit records for at most 365 days.",
          "Turning it off or withdrawing consent: when the server owner disables web verification, no new signals are collected. You can request deletion of your verification data; server admins have a per-member delete control. Older data is still cleaned up under the periods above.",
        ],
      },
      {
        heading: "14. Appealing automated decisions",
        paragraphs: [
          "Contact the server administrators or the Protogon support channel with the server ID/user ID and the verification time. We will review the signals, explain the reasons without disclosing other people's data, and may ask you to verify again or remove the restriction if we find a mistake.",
        ],
      },
      {
        heading: "15. Changes to this policy and contact",
        paragraphs: [
          "This policy may be updated; the last review date is shown at the top of the page, and material changes are announced in the Discord community. Continuing to use the bot after that date means you accept the new version; if a change alters the purpose or scope of verification data processing, we will ask for consent again before applying it to a new verification.",
          "For any privacy question or request: post in the support channel of the Protogon Discord community or the Facebook page in the footer, with the relevant server ID or user ID. These are the official contact channels; we respond within 2 working days and complete within the statutory deadlines (10 days for access/correction/portability, 15 days for restriction or objection, 20 days for erasure; one extension within the statutory limit where a request is complex).",
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
          "Dashboard session: valid for at most 30 days; signing out deletes it immediately, and expired sessions are cleaned up automatically.",
          "Feedback: at most 365 days from submission.",
          "Payments/reconciliation: kept for the statutory accounting period (up to 10 years), then deleted; order data only, with no card or bank account details.",
          "Web verification session: expires after 10 minutes; deleted 7 days after expiry.",
          "Verification signals (IP/device/cookie/UA hashes): at most 730 days from the last sighting.",
          "Alt-account links: at most 180 days from the last signal.",
          "Verification audit records: at most 365 days.",
          "IP bans: ban duration 1–90 days; the record is kept for up to 90 more days in an inactive state, then deleted (about 180 days in total).",
          "ipapi.is lookup cache: 24 hours; deleted as soon as it expires.",
          "Punishments: at most 365 days from creation, unless you request earlier deletion. Heat scores and warnings: kept while active so the bot can apply the right punishment; administrators can reset them at any time.",
          "Anti-nuke/raid events: at most 365 days. Join records when Join Gate is enabled: at most 90 days. Raid event samples used to improve detection (server and user IDs removed): at most 180 days.",
          "Closed tickets (body, evidence, custom fields, transcript): deleted 180 days after closing. Open tickets are kept until they close so staff can still handle them.",
          "Cross-server threat signals: deleted automatically after 24 hours.",
          "Backup files: kept on the schedule you choose (one every 2–30 days); older copies inside the bot are deleted when a new one is created, while copies on GitHub Gist are yours to manage.",
        ],
      },
      {
        heading: "3. Deleting data yourself in the dashboard",
        paragraphs: [
          "Most data can be deleted without waiting for anyone: every panel has its own delete control.",
        ],
        bullets: [
          "Delete backups you no longer need: set a retention cap (by count or by days) so the bot removes older copies as soon as it saves a new one; copies pushed to GitHub Gist with your own key are yours to delete there. To delete a specific copy right away, send a request in the support channel.",
          "Delete whitelist entries, auto-replies, giveaways, and reaction-role panels you no longer use.",
          "In the Web Verification panel, administrators can delete a member's verification data (sessions, signals, alt-account links).",
          "Reset a member's heat score and warning count.",
          "Sign out of the dashboard to invalidate the current session.",
        ],
      },
      {
        heading: "4. Permanently deleting a server's data",
        paragraphs: [
          "To remove every trace of a server from Protogon, do this in order: remove the bot from the server, then send a request in the support channel with the server ID.",
          "We confirm receipt, delete the configuration, action records, heat history, join/leave records, tickets and transcripts, web verification data (sessions, signals, alt-account links), and any backup files the bot still holds, then reply once it is done. De-identified verification audit records and de-identified IP ban records may be kept up to the security periods in section 2. Timing: we respond within 2 working days and complete within 20 days (one extension within the statutory limit where a request is complex).",
        ],
      },
      {
        heading: "5. Deleting personal data",
        paragraphs: [
          "A member of a server can request deletion of data relating to them: their ID, join/leave records, punishment records, and any dashboard session.",
          "To avoid deleting someone else's data by mistake we verify the request: dashboard account holders confirm by signing in with Discord, or a server owner confirms on behalf of a member in their server.",
          "For web verification data, server administrators can delete it directly in the Web Verification panel; requests through the support channel are also handled. Sessions, signals, and links are deleted; audit records and IP ban records are de-identified (no userId) and kept only up to the security periods to prevent abuse.",
        ],
      },
      {
        heading: "6. How to send a deletion request",
        paragraphs: [
          "Post the request in the support channel of the Protogon Discord community, including: what to delete, the server ID (for server data), the user ID (for personal data), and a short description. We respond within 2 working days and complete within 20 days.",
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
          "A minimal set of records may be kept longer where needed to prevent abuse (for example evidence of an attack on our systems, de-identified verification audit records, or de-identified IP ban records) or where the law requires it. In that case we limit it to the smallest amount and do not use it for anything else.",
          "Once data is deleted, it cannot be restored, even if you invite the bot to the server again.",
        ],
      },
      {
        heading: "9. Confirmation and contact",
        paragraphs: [
          "Every deletion request gets an acknowledgement: received, in progress, or completed. If 20 days pass without a reply, remind us in the support channel.",
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
      "Protogon ist ein Discord-Bot mit Web-Dashboard unter protogon.freebuff.app, betrieben vom RFTV-Team. Alle Funktionen sind derzeit für jeden Server kostenlos; kostenpflichtige Tarife werden nicht verkauft. Wenn du den Bot einlädst, dich im Dashboard anmeldest oder eine Funktion nutzt, akzeptierst du die folgenden Bedingungen. Wenn du nicht einverstanden bist, entferne den Bot vom Server und nutze das Dashboard nicht weiter.",
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
          "Bei aktivierter Web-Verifizierung klar mitteilen, dass die Verifizierungsseite IP- und Gerätesignale erfasst, die IP einmalig an ipapi.is sendet und automatisierte Entscheidungen treffen kann; nur mit Rechtsgrundlage und im Einklang mit der Datenschutzerklärung aktivieren.",
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
          "Alle Funktionen werden unentgeltlich und ohne Service-Level-Zusage (SLA) bereitgestellt; es gibt keinen Kaufvorgang. Der Bot kann ausfallen, wenn Discord, unser Hosting-Anbieter oder der KI-Dienst eine Störung hat; wir arbeiten daran und informieren im Community-Kanal.",
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
      "Welche Daten Protogon speichert, warum, wer sie erhält, wie lange sie bleiben und wie du die Kontrolle behältst.",
    updated: LEGAL_UPDATED,
    intro:
      "Protogon speichert nur, was nötig ist, damit der Bot deinen Server schützt und das Dashboard deine Konfiguration zeigt. Diese Erklärung nennt, wer verantwortlich ist, welche Daten erhoben werden (auch IP- und Gerätesignale bei aktivierter Web-Verifizierung), warum, wer sie erhält, wie lange sie gespeichert werden und wie du die Kontrolle behältst. Wir verkaufen keine Daten, nutzen sie nicht für Werbung und lesen keine privaten Nachrichten.",
    sections: [
      {
        heading: "1. Kurzfassung",
        paragraphs: ["Drei Punkte sind vor allen Details wichtig:"],
        bullets: [
          "Wir speichern Discord-IDs, Serverkonfiguration und Aufzeichnungen der Bot-Aktionen — nicht normale Nachrichteninhalte. Zwei bewusste Ausnahmen: Inhalte, die du selbst in einem Ticket sendest (samt Transcript beim Schließen), und kurze Spam-Ausschnitte, wenn ein Server die serverübergreifende Bedrohungsteilung aktiviert.",
          "Bei aktivierter Web-Verifizierung erfasst die Seite IP- und Gerätesignale. Die rohe IP wird nicht gespeichert; nur ein serverbezogener HMAC-SHA-256-Wert bleibt, und die IP wird einmalig an ipapi.is für die VPN-/Proxy-/Tor-Abfrage gesendet.",
          "Daten werden nicht verkauft und nicht für Werbung weitergegeben. Du kannst jederzeit Löschung verlangen; die Schritte stehen auf der Seite Löschung & Aufbewahrung.",
        ],
      },
      {
        heading: "2. Wer für die Daten verantwortlich ist",
        paragraphs: [
          "Protogon ist ein Discord-Bot mit Web-Dashboard unter protogon.freebuff.app, betrieben vom RFTV-Team. Das RFTV-Team ist verantwortlich für Dashboard-Kontodaten, Betriebsdaten der Plattform und die vom Bot erzeugten Verifizierungsdaten.",
          "Wenn der Bot in einem Server ist, entscheidet der Serverbesitzer, ob Funktionen aktiviert werden und wie Strafen konfiguriert sind. Für Mitgliederdaten in diesem Server bestimmt der Serverbesitzer Zweck und Umfang; Protogon verarbeitet sie nach dieser Konfiguration und dieser Erklärung. Serverbesitzer müssen Mitglieder informieren und eine Rechtsgrundlage sicherstellen, wenn sie datenerhebende Funktionen aktivieren, insbesondere die Web-Verifizierung.",
          "Offizielle Kontaktwege für Datenfragen sind der Support-Kanal im Protogon-Discord und die im Footer verlinkte Facebook-Seite. Wir können dich bitten, deine Identität zu bestätigen, bevor wir einen Antrag bearbeiten, damit wir nicht fremde Daten löschen.",
        ],
      },
      {
        heading: "3. Gespeicherte Daten",
        paragraphs: [
          "Die Daten fallen in folgende Gruppen, alle dienen dem Betrieb von Bot und Dashboard:",
        ],
        bullets: [
          "Dashboard-Konto: Discord-ID, Benutzername, Anzeigename, Avatar, Liste der verwaltbaren Server, letzte Anmeldung und deine Dashboard-Sitzung.",
          "Zahlungen (bei Spende oder Paketkauf): Discord-ID, Paket, Betrag, ZaloPay-Bestellcode, Status und Zeitstempel sowie die akzeptierte Fassung der Bedingungen. Karten- oder Bankkontodaten speichern wir nicht — ZaloPay verarbeitet sie.",
          "Feedback: deine Nachricht, eine E-Mail-Adresse, wenn du sie freiwillig angibst, deine Sprache und die Seite, von der du sie gesendet hast.",
          "Server: ID, Name, Icon, Mitgliederzahl, Präfix, Konfiguration je Modul, für Logs genutzte Kanäle und Rollen, Whitelist-Einträge und erstellte Webhooks.",
          "Bot-Aktivität: Strafen mit Grund und Moderator, Hitzewert und Verwarnungen, Anti-Nuke-/Raid-Ereignisse sowie Beitrittsdaten bei aktivem Join Gate (ID, Name, Avatar, Kontoalter, Risikowert und Gründe, ergriffene Maßnahme).",
          "Von dir erstellte Inhalte: Auto-Antworten, Willkommens- und Abschiedstexte, Giveaways, Reaction-Role-Panels; Inhalte, die du in Tickets sendest (Text, Belege, Zusatzfelder) und das Transcript des Ticket-Kanals beim Schließen; Backup-Dateien bei aktiviertem Backup.",
          "Serverübergreifende Bedrohungssignale (nur bei aktivierter Freigabe): ein Spam-Ausschnitt von höchstens 60 Zeichen ohne Mentions sowie Namen auffälliger Bots; keine Nutzer-IDs, der Quellserver wird mit einem Einweg-Hash versehen, das Signal verfällt nach 24 Stunden.",
          "Web-Verifizierung: Verifizierungssitzungen (gehashter Token, Server-/Nutzer-ID, Status, Entscheidung, Zeitstempel), IP- und Geräte-Hashes, Alt-Konto-Verknüpfungen, IP-Sperren und Audit-Aufzeichnungen. Details in Abschnitt 13.",
        ],
      },
      {
        heading: "4. Nachrichteninhalte",
        paragraphs: [
          "Der Bot liest Nachrichten im Server, um Auto-Antworten auszuführen, Spam zu filtern, schädliche Links zu erkennen und bei einem Raid Berichte zu erstellen. Normale Nachrichten werden nicht in der Datenbank gespeichert.",
          "Aufgezeichnet werden nur die auslösenden Teile (Inhalt, Grund, Strafe), damit Moderatoren die Aktion nachvollziehen können. Ist das Backup samt Nachrichten aktiviert, landen diese Inhalte in einer Backup-Datei, die du kontrollierst.",
          "Es gibt zwei bewusste Ausnahmen. Erstens: Inhalte, die du selbst in einem Ticket sendest — Text, Belege, Zusatzfelder — werden gespeichert, damit das Team sie bearbeiten kann; beim Schließen speichert der Bot ein Transcript des Ticket-Kanals im Storage. Nur das Team genau dieses Servers kann beides im Dashboard sehen, und beides wird 180 Tage nach dem Schließen gelöscht. Zweitens: Wenn du die Bedrohungsteilung aktivierst, werden ein Spam-Ausschnitt von höchstens 60 Zeichen (ohne Mentions) und Namen auffälliger Bots mit anderen Servern geteilt, die den Empfang aktiviert haben; keine Nutzer-IDs, der Quellserver wird mit einem Einweg-Hash versehen, das Signal verfällt nach 24 Stunden.",
          "Direktnachrichten zwischen Mitgliedern liest der Bot nicht. Schreibst du dem Bot direkt, wird der Inhalt nur für die Antwort genutzt.",
        ],
      },
      {
        heading: "5. Zwecke der Verarbeitung",
        paragraphs: ["Daten werden ausschließlich für folgende Zwecke genutzt:"],
        bullets: [
          "Betrieb der von dir aktivierten Funktionen: Auto-Antworten, Hitze und Verwarnungen, Anti-Nuke/Raid, Join Gate, Willkommensnachrichten, Strafen.",
          "Abwehr von Missbrauch und Angriffen: Raid-Erkennung, Blockieren fremder Bots, Schutz vor Passwortraten und daran hindern, dass Raider zurückkehren.",
          "Teilen von Bedrohungssignalen zwischen Servern, die die Funktion aktiviert haben (Opt-in auf beiden Seiten), um Raids früher zu stoppen.",
          "Verbesserung der Raid-Erkennung mit Ereignisproben, aus denen Server- und Nutzer-IDs entfernt wurden; diese Proben dienen nicht zur Identifizierung oder Bewertung einzelner Personen.",
          "Support bei gemeldeten Vorfällen, mit den nötigen Belegen zur Nachverfolgung.",
          "Aggregierte Gesundheitswerte des Systems (Server- und Anfragezahlen) ohne Personenbezug.",
          "Erfüllung gesetzlicher Pflichten und Schutz unserer Rechte sowie der Rechte anderer Nutzer.",
        ],
      },
      {
        heading: "6. Rechtsgrundlage",
        paragraphs: [
          "Für Daten, die zum Betrieb von Bot und Dashboard nötig sind, verarbeiten wir auf Grundlage der Vertragserfüllung nach den Nutzungsbedingungen und unseres berechtigten Interesses am Schutz des Systems vor Missbrauch. Für IP- und Gerätesignale bei der Web-Verifizierung stützen wir uns auf deine Einwilligung: Daten werden erst gesendet, nachdem du auf der Verifizierungsseite das Kästchen angekreuzt hast, und du kannst ablehnen, indem du die Seite schließt (dann wirst du nicht verifiziert). Wo das Gesetz die Verarbeitung aufgrund berechtigter Interessen oder gesetzlicher Pflichten erlaubt, beschränken wir die Daten trotzdem auf das Minimum.",
          "Für Personen in Vietnam sind IP- und Geräte-/Verhaltenssignale bei der Web-Verifizierung sensible personenbezogene Daten nach Artikel 4(l) der Verordnung 356/2025/NĐ-CP (Daten zur Nachverfolgung von Verhalten und Nutzung sozialer Netzwerke und anderer Online-Dienste). Vor der Einwilligung weist die Verifizierungsseite gemäß Artikel 6(4) ausdrücklich darauf hin; das Kästchen ist standardmäßig leer, Zwecke werden nicht gebündelt, und du kannst ablehnen.",
          "Wenn du in Vietnam bist, wenden wir das Gesetz zum Schutz personenbezogener Daten Nr. 91/2025/QH15 und die Verordnung 356/2025/NĐ-CP an. Wenn du im Europäischen Wirtschaftsraum (EWR) oder im Vereinigten Königreich bist, wenden wir die entsprechenden GDPR-Rechte an. Wir respektieren diese Rechte für alle Nutzer, auch wenn lokales Recht sie noch nicht zwingend vorschreibt.",
        ],
      },
      {
        heading: "7. Speicherort, grenzüberschreitende Übermittlung und Speicherdauer",
        paragraphs: [
          "Die Daten liegen auf der von Protogon genutzten Convex-Infrastruktur und sind standardmäßig je Server getrennt. Zwei kontrollierte Ausnahmen: serverübergreifende Bedrohungssignale (nur bei aktivierter Freigabe, keine Nutzer-IDs, Quellserver mit Einweg-Hash, Verfall nach 24 Stunden) und Raid-Ereignisproben ohne Server- und Nutzer-IDs, die die Erkennung im gesamten Netz verbessern. Einige Anbieter (Convex, Discord, GitHub, ipapi.is, KI-Anbieter und Webhosting) können Daten außerhalb Vietnams oder des EWR verarbeiten. Wir senden nur die für den Zweck nötigen Mindestdaten, verpflichten Anbieter vertraglich bzw. über ihre Nutzungsbedingungen zum Schutz und übermitteln keine Daten an andere Dritte, außer wie in Abschnitt 8 beschrieben.",
          "Aufbewahrungsfristen:",
        ],
        bullets: [
          "Dashboard-Sitzung: höchstens 30 Tage gültig; Abmelden löscht sie sofort, abgelaufene Sitzungen werden automatisch bereinigt.",
          "Feedback: höchstens 365 Tage ab Absendung.",
          "Zahlungen/Abgleich: Aufbewahrung nach der gesetzlichen Buchhaltungsfrist (bis zu 10 Jahre), danach Löschung; nur Bestelldaten, keine Karten- oder Bankkontodaten.",
          "Web-Verifizierungssitzung: läuft nach 10 Minuten ab; wird 7 Tage nach Ablauf gelöscht.",
          "Verifizierungssignale (IP-/Geräte-/Cookie-/UA-Hashes): höchstens 730 Tage seit der letzten Sichtung.",
          "Alt-Konto-Verknüpfungen: höchstens 180 Tage seit dem letzten Signal.",
          "Verifizierungs-Audit: höchstens 365 Tage.",
          "IP-Sperren: Sperrdauer 1–90 Tage; der Datensatz bleibt bis zu 90 weitere Tage inaktiv zur Nachvollziehbarkeit und wird dann gelöscht (insgesamt etwa 180 Tage).",
          "ipapi.is-Abfragecache: 24 Stunden; wird sofort nach Ablauf gelöscht.",
          "Strafen: höchstens 365 Tage ab Erstellung, sofern du nicht früher Löschung verlangst. Hitzewerte und Verwarnungen: bleiben, solange sie gelten, damit der Bot die richtige Strafe anwendet; Administratoren können sie jederzeit zurücksetzen.",
          "Anti-Nuke-/Raid-Ereignisse: höchstens 365 Tage. Beitrittsdaten bei aktivem Join Gate: höchstens 90 Tage. Raid-Ereignisproben zur Verbesserung der Erkennung (ohne Server-/Nutzer-IDs): höchstens 180 Tage.",
          "Geschlossene Tickets (Text, Belege, Zusatzfelder, Transcript): werden 180 Tage nach dem Schließen gelöscht. Offene Tickets bleiben bis zum Schließen, damit das Team sie bearbeiten kann.",
          "Serverübergreifende Bedrohungssignale: werden nach 24 Stunden automatisch gelöscht.",
          "Backup-Dateien: nach deinem Zeitplan (eine alle 2–30 Tage); ältere Kopien im Bot werden bei einer neuen gelöscht, Kopien in GitHub Gist verwaltest du selbst.",
        ],
      },
      {
        heading: "8. Dritte",
        paragraphs: [
          "Protogon stützt sich für den Betrieb auf folgende Dienste. Wir verkaufen keine Daten und geben sie nicht an Werbetreibende weiter; jeder Anbieter erhält nur, was er braucht, und wir übermitteln keine Daten an andere Dritte, außer du stimmst zu oder das Gesetz verlangt es:",
        ],
        bullets: [
          "Discord: Datenquelle und Plattform, auf der der Bot über die offizielle API handelt.",
          "Convex: beherbergt die Datenbank und das Backend des Dashboards.",
          "GitHub: erhält Backup-Dateien nur, wenn du den Gist-Upload mit deinem Schlüssel aktivierst.",
          "KI-Anbieter: verarbeiten die notwendigen Gesprächsausschnitte, wenn du Raid-Berichte oder den Assistenten Haimiya nutzt — nur für diese Anfrage.",
          "ipapi.is: erhält nur die IP-Adresse, wenn ein Server die Web-Verifizierung aktiviert, um Land/ASN und VPN-/Proxy-/Tor-/Rechenzentrums-Signale nachzuschlagen. Die Daten werden in Deutschland, den USA oder Singapur verarbeitet; ipapi.is verarbeitet sie in unserem Auftrag gemäß der veröffentlichten DPA. Discord-ID, Nutzername oder andere identifizierende Daten werden nicht übermittelt. Ergebnisse werden 24 Stunden per serverbezogenem Hash zwischengespeichert.",
          "Web-/Domain-Hosting: liefert Dashboard und Verifizierungsseite aus und verarbeitet IP-Adressen wie jeder Webserver, wenn dein Browser sich verbindet.",
        ],
      },
      {
        heading: "9. Deine Rechte",
        paragraphs: [
          "Vor der Erhebung sagen wir dir, welche Daten erhoben werden, warum, wer sie erhält und wie lange sie gespeichert werden. Du hast folgende Rechte an deinen personenbezogenen Daten:",
        ],
        bullets: [
          "Zu erfahren, welche Daten erhoben werden, warum, wer sie erhält und wie lange sie bleiben — bevor wir sie erheben.",
          "Konfiguration, Whitelist, Auto-Antworten und Backups im Dashboard ansehen und ändern.",
          "Export oder Löschung der Server- oder Personendaten verlangen.",
          "Die Einwilligung jederzeit widerrufen; der Widerruf berührt die bereits erfolgte Verarbeitung nicht, aber wir stoppen die neue Erhebung und löschen auf Antrag.",
          "Der Verarbeitung widersprechen oder ihre Einschränkung verlangen; am gründlichsten, indem du den Bot entfernst und dann eine Löschung beantragst.",
          "Überprüfung einer automatisierten Entscheidung (z. B. einer abgelehnten Verifizierung) und Erklärung der Gründe verlangen.",
          "Bei der zuständigen Datenschutzaufsichtsbehörde an deinem Wohnort oder in Vietnam Beschwerde einlegen. Wir bitten dich, zuerst uns zu kontaktieren, damit wir eine Lösung finden können.",
        ],
      },
      {
        heading: "10. Anträge und Antwortzeiten",
        paragraphs: [
          "Sende Anträge über den Discord-Support-Kanal oder die Facebook-Seite im Footer, mit Server-ID/Nutzer-ID und einer kurzen Beschreibung. Wir antworten innerhalb von 2 Werktagen und erledigen den Antrag innerhalb von 10 Tagen bei Auskunft, Berichtigung oder Datenübertragbarkeit; 15 Tagen bei Widerruf der Einwilligung, Einschränkung oder Widerspruch; 20 Tagen bei Löschung. Bei komplexen Anträgen verlängern wir einmalig im gesetzlich zulässigen Rahmen und begründen dies.",
          "Um fremde Daten nicht versehentlich zu löschen, prüfen wir den Antrag: Dashboard-Konten bestätigen sich per Discord-Anmeldung, oder ein Serverbesitzer bestätigt für ein Mitglied seines Servers.",
        ],
      },
      {
        heading: "11. Sicherheit",
        paragraphs: [
          "Der Dashboard-Zugang beruht auf Discord-OAuth2 und wird bei jeder Anfrage im Backend erneut geprüft; es gibt keine Hintertür und keinen Weg an der Authentifizierung vorbei. Verifizierungsdaten können nur Administratoren desselben Servers und der Bot lesen; die Team-Admins des Bots haben keinen serverübergreifenden Zugriff.",
          "Verwaltungsaktionen mit hohen Rechten benötigen einen separaten Bot-Schlüssel, der als Hash gespeichert wird. Backup-Dateien können mit AES-256-GCM verschlüsselt und vor dem Wiederherstellen per SHA-256 geprüft werden.",
          "Die rohe IP wird nicht in die Datenbank geschrieben; IP-Hashes nutzen HMAC-SHA-256 mit einem geheimen Schlüssel, getrennt pro Server. Ein Hash ist weiterhin pseudonyme personenbezogene Daten, keine völlig anonymen Daten — wir behandeln ihn so.",
          "Bei einem Vorfall mit Datenbezug informieren wir die betroffenen Serverbesitzer über ihren hinterlegten Kontaktweg. Kann der Vorfall Leben, Gesundheit, Ehre, Würde oder Eigentum der Betroffenen beeinträchtigen oder die nationale Sicherheit, die öffentliche Ordnung oder die soziale Sicherheit berühren, informieren wir die zuständige Datenschutzbehörde innerhalb von 72 Stunden nach Kenntnis, fertigen eine schriftliche Bestätigung des Vorfalls an und ergreifen die erforderlichen Abhilfemaßnahmen.",
          "Kein System ist vollständig sicher. Wenn du eine Schwachstelle findest, melde sie bitte vertraulich über unseren Support-Kanal statt öffentlich; wir bestätigen und beheben sie vor einer Veröffentlichung.",
        ],
      },
      {
        heading: "12. Cookies und lokale Speicherung",
        paragraphs: [
          "Das Dashboard nutzt localStorage, um deinen Anmelde-Token zu speichern (höchstens 30 Tage gültig). Das ist unbedingt erforderliche Speicherung, damit du dich nicht nach jedem Seitenaufruf neu anmelden musst; Abmelden löscht den Token.",
          "Die Verifizierungsseite speichert eine zufällige Geräte-ID im localStorage und liest Browsersignale (User-Agent, Canvas, WebGL, Bildschirmgröße, Sprachen, Zeitzone, CPU-Kerne). ID und Signale werden nur als Hashes gesendet; Zweck ist die Abwehr von Fake-Accounts und Gerätewiederverwendung zur Umgehung von Sperren.",
          "Wir verwenden keine Werbe-Cookies, keine Tracking-Cookies Dritter und keine Werbepixel. Du kannst localStorage/Cookies im Browser löschen; die Verifizierung kann dann wegen fehlender Gerätesignale scheitern, und du musst dich eventuell erneut verifizieren.",
        ],
      },
      {
        heading: "13. Web-Verifizierung: IP, Gerät, automatisierte Entscheidungen",
        paragraphs: [
          "Wenn der Serverbesitzer die Web-Verifizierung aktiviert (Methode „Web“), erfasst die Verifizierungsseite einige Signale, um Fake-Accounts, VPNs/Proxys und Alt-Accounts zu blockieren. Das geschieht nur, wenn du den vom Bot gesendeten Verifizierungslink öffnest und das Einwilligungskästchen ankreuzt; ohne Einwilligung sendet die Seite keine IP-/Gerätedaten und du wirst nicht verifiziert.",
          "Dies sind sensible personenbezogene Daten nach Artikel 4(l) der Verordnung 356/2025/NĐ-CP. Die Verifizierungsseite weist vor der Einwilligung gemäß Artikel 6(4) ausdrücklich darauf hin; das Kästchen ist standardmäßig leer, Zwecke werden nicht gebündelt, und du kannst jederzeit vor dem Klick auf Verifizieren ablehnen.",
        ],
        bullets: [
          "IP-Adresse: Der Server liest die Quelladresse der Verbindung (letzter, vom Edge ergänzter X-Forwarded-For-Eintrag, sonst Convex-Metadaten), niemals einen vom Client behaupteten Wert. Die rohe IP wird nur im Speicher für diese Verifizierung verarbeitet und nicht in die Datenbank geschrieben.",
          "Hashing: Die IP wird mit HMAC-SHA-256 und einem geheimen Schlüssel gehasht, getrennt pro Server. Dieselbe IP ergibt auf zwei Servern verschiedene Werte; neue Sitzungen speichern keinen globalen Hash. Ein Hash ist pseudonyme personenbezogene Daten, ohne den geheimen Schlüssel nicht rückrechenbar, wird aber weiterhin als personenbezogene Daten geschützt.",
          "Netzwerkabfrage: Die IP wird für genau diese eine Abfrage an ipapi.is gesendet, um Land/ASN und VPN-/Proxy-/Tor-/Rechenzentrums-/Mobilfunk-Signale zu erhalten. Die Daten werden in Deutschland, den USA oder Singapur gemäß der veröffentlichten DPA von ipapi.is verarbeitet. Discord-ID oder Nutzername senden wir nicht. Das Ergebnis wird 24 Stunden per serverbezogenem Hash zwischengespeichert.",
          "Geräte-/Browser-Fingerabdruck: User-Agent, Canvas, WebGL, Bildschirmgröße, Sprachen, Zeitzone, CPU-Kerne und eine zufällige, von der Seite gesetzte ID — alles nur als Hash gespeichert.",
          "Menschlichkeitsprüfung: verstecktes Honeypot-Feld, Mindestverweildauer sowie Maus- und Tastaturbewegung — kein Bild-Captcha.",
          "Automatisierte Entscheidung: Je nach Konfiguration des Serverbesitzers kann das Ergebnis Allow, Deny, Timeout, Kick oder Ban sein. Serverbesitzer, Administratoren, Bots und Whitelist-Nutzer sind immer ausgenommen; geteilte IPs (CGNAT, Mobilfunk) werden nur abgelehnt, nie automatisch gebannt. Nicht jede Entscheidung wird vorher von einem Menschen geprüft.",
          "IP-Sperren: Admins können einen IP-Hash 1 bis 90 Tage sperren (Standard 7), genau oder als IPv6-/64-Präfix. Der Sperrdatensatz bleibt bis zu 90 weitere Tage inaktiv und wird dann gelöscht.",
          "Aufbewahrung: Verifizierungssitzungen werden 7 Tage nach Ablauf gelöscht; Geräte-/IP-Spuren zur Alt-Erkennung höchstens 730 Tage; Alt-Konto-Verknüpfungen höchstens 180 Tage; Verifizierungs-Audit höchstens 365 Tage.",
          "Deaktivierung oder Widerruf: Schaltet der Serverbesitzer die Web-Verifizierung ab, werden keine neuen Signale erfasst. Du kannst die Löschung deiner Verifizierungsdaten verlangen; Server-Admins haben eine Löschfunktion pro Mitglied. Ältere Daten werden weiterhin nach den obigen Fristen bereinigt.",
        ],
      },
      {
        heading: "14. Widerspruch gegen automatisierte Entscheidungen",
        paragraphs: [
          "Kontaktiere die Server-Administratoren oder den Protogon-Support-Kanal mit Server-ID/Nutzer-ID und dem Zeitpunkt der Verifizierung. Wir prüfen die Signale, erklären die Gründe ohne Offenlegung fremder Daten und können dich bitten, erneut zu verifizieren, oder die Einschränkung aufheben, wenn wir einen Fehler finden.",
        ],
      },
      {
        heading: "15. Änderungen und Kontakt",
        paragraphs: [
          "Diese Erklärung kann aktualisiert werden; das Datum der letzten Prüfung steht oben auf der Seite, wesentliche Änderungen kündigen wir in der Discord-Community an. Wer den Bot danach weiter nutzt, akzeptiert die neue Fassung; ändert eine Änderung den Zweck oder Umfang der Verarbeitung von Verifizierungsdaten, holen wir vor der Anwendung auf eine neue Verifizierung erneut die Einwilligung ein.",
          "Für Datenschutzfragen oder -anträge: im Support-Kanal der Protogon-Discord-Community oder auf der Facebook-Seite im Footer, mit der betreffenden Server- oder Nutzer-ID. Das sind die offiziellen Kontaktwege; wir antworten innerhalb von 2 Werktagen und erledigen den Antrag innerhalb der gesetzlichen Fristen (10 Tage bei Auskunft/Berichtigung/Übertragbarkeit, 15 Tage bei Einschränkung oder Widerspruch, 20 Tage bei Löschung; einmalige Verlängerung im gesetzlich zulässigen Rahmen bei komplexen Anträgen).",
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
          "Dashboard-Sitzung: höchstens 30 Tage gültig; Abmelden löscht sie sofort, abgelaufene Sitzungen werden automatisch bereinigt.",
          "Feedback: höchstens 365 Tage ab Absendung.",
          "Zahlungen/Abgleich: Aufbewahrung nach der gesetzlichen Buchhaltungsfrist (bis zu 10 Jahre), danach Löschung; nur Bestelldaten, keine Karten- oder Bankkontodaten.",
          "Web-Verifizierungssitzung: läuft nach 10 Minuten ab; wird 7 Tage nach Ablauf gelöscht.",
          "Verifizierungssignale (IP-/Geräte-/Cookie-/UA-Hashes): höchstens 730 Tage seit der letzten Sichtung.",
          "Alt-Konto-Verknüpfungen: höchstens 180 Tage seit dem letzten Signal.",
          "Verifizierungs-Audit: höchstens 365 Tage.",
          "IP-Sperren: Sperrdauer 1–90 Tage; der Datensatz bleibt bis zu 90 weitere Tage inaktiv und wird dann gelöscht (insgesamt etwa 180 Tage).",
          "ipapi.is-Abfragecache: 24 Stunden; wird sofort nach Ablauf gelöscht.",
          "Strafen: höchstens 365 Tage ab Erstellung, sofern du nicht früher Löschung verlangst. Hitzewerte und Verwarnungen: bleiben, solange sie gelten, damit der Bot die richtige Strafe anwendet; Administratoren können sie jederzeit zurücksetzen.",
          "Anti-Nuke-/Raid-Ereignisse: höchstens 365 Tage. Beitrittsdaten bei aktivem Join Gate: höchstens 90 Tage. Raid-Ereignisproben zur Verbesserung der Erkennung (ohne Server-/Nutzer-IDs): höchstens 180 Tage.",
          "Geschlossene Tickets (Text, Belege, Zusatzfelder, Transcript): werden 180 Tage nach dem Schließen gelöscht. Offene Tickets bleiben bis zum Schließen, damit das Team sie bearbeiten kann.",
          "Serverübergreifende Bedrohungssignale: werden nach 24 Stunden automatisch gelöscht.",
          "Backup-Dateien: nach deinem Zeitplan (eine alle 2–30 Tage); ältere Kopien im Bot werden bei einer neuen gelöscht, Kopien in GitHub Gist verwaltest du selbst.",
        ],
      },
      {
        heading: "3. Selbst löschen im Dashboard",
        paragraphs: [
          "Die meisten Daten kannst du ohne Wartezeit löschen: jedes Panel hat eine eigene Löschfunktion.",
        ],
        bullets: [
          "Backups löschen, die du nicht mehr brauchst: Aufbewahrungsgrenze setzen (Anzahl oder Tage), damit der Bot ältere Kopien beim Speichern einer neuen löscht; mit deinem eigenen Schlüssel zu GitHub Gist hochgeladene Kopien löschst du dort selbst. Soll eine bestimmte Kopie sofort weg, sende eine Anfrage im Support-Kanal.",
          "Whitelist-Einträge, Auto-Antworten, Giveaways und Reaction-Role-Panels löschen, die nicht mehr genutzt werden.",
          "Im Panel Web-Verifizierung können Administratoren die Verifizierungsdaten eines Mitglieds löschen (Sitzungen, Signale, Alt-Konto-Verknüpfungen).",
          "Hitzewert und Verwarnungen eines Mitglieds zurücksetzen.",
          "Im Dashboard abmelden, um die aktuelle Sitzung ungültig zu machen.",
        ],
      },
      {
        heading: "4. Serverdaten endgültig löschen",
        paragraphs: [
          "Um jede Spur eines Servers aus Protogon zu entfernen, gehe in dieser Reihenfolge vor: Bot vom Server entfernen, dann eine Anfrage mit der Server-ID im Support-Kanal senden.",
          "Wir bestätigen den Eingang, löschen Konfiguration, Aktionsprotokolle, Hitze-Verlauf, Beitritts-/Austrittsdaten, Tickets und Transcripts, Web-Verifizierungsdaten (Sitzungen, Signale, Alt-Konto-Verknüpfungen) und die noch vorhandenen Backup-Dateien und melden uns nach Abschluss. De-identifizierte Verifizierungs-Audits und de-identifizierte IP-Sperrdatensätze können bis zu den Sicherheitsfristen in Abschnitt 2 aufbewahrt werden. Wir antworten innerhalb von 2 Werktagen und schließen die Löschung innerhalb von 20 Tagen ab (eine Verlängerung im gesetzlichen Rahmen bei komplexen Anträgen).",
        ],
      },
      {
        heading: "5. Personendaten löschen",
        paragraphs: [
          "Mitglieder eines Servers können die Löschung der eigenen Daten verlangen: ID, Beitritts-/Austrittsdaten, Strafaufzeichnungen und eine etwaige Dashboard-Sitzung.",
          "Um fremde Daten nicht versehentlich zu löschen, prüfen wir die Anfrage: Dashboard-Konten bestätigen sich per Discord-Anmeldung, oder ein Serverbesitzer bestätigt für ein Mitglied seines Servers.",
          "Bei Web-Verifizierungsdaten können Server-Administratoren sie direkt im Panel Web-Verifizierung löschen; Anträge über den Support-Kanal werden ebenfalls bearbeitet. Sitzungen, Signale und Verknüpfungen werden gelöscht; Audit- und IP-Sperrdatensätze werden de-identifiziert (keine userId) und nur bis zu den Sicherheitsfristen zur Missbrauchsabwehr aufbewahrt.",
        ],
      },
      {
        heading: "6. Löschanfrage stellen",
        paragraphs: [
          "Sende die Anfrage im Support-Kanal der Protogon-Discord-Community und nenne: was gelöscht werden soll, die Server-ID (bei Serverdaten), die Nutzer-ID (bei Personendaten) und eine kurze Beschreibung. Wir antworten innerhalb von 2 Werktagen und schließen den Antrag innerhalb von 20 Tagen ab.",
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
          "Ein Mindestbestand an Aufzeichnungen kann länger aufbewahrt werden, wenn das zur Missbrauchsabwehr nötig ist (etwa Belege für einen Angriff auf unsere Systeme, de-identifizierte Verifizierungs-Audits oder de-identifizierte IP-Sperrdatensätze) oder das Gesetz es verlangt. Dann beschränken wir es auf das Minimum und nutzen es für nichts anderes.",
          "Gelöschte Daten können nicht wiederhergestellt werden, auch wenn du den Bot erneut einlädst.",
        ],
      },
      {
        heading: "9. Bestätigung und Kontakt",
        paragraphs: [
          "Jede Löschanfrage wird bestätigt: eingegangen, in Bearbeitung oder abgeschlossen. Kommt nach 20 Tagen keine Antwort, erinnere uns im Support-Kanal.",
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
