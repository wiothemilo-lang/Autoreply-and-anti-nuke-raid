# Danh mục nhà cung cấp và bên xử lý dữ liệu

Tài liệu hỗ trợ **Điều 19(2)(b) Nghị định 356/2025/NĐ-CP**: hồ sơ DPIA phải kèm
bản sao hợp đồng hoặc thoả thuận xử lý dữ liệu với các bên tham gia.

## 1. Cách lưu chứng từ — 10 phút mỗi nhà cung cấp

Không cần gửi email xin hợp đồng ký song phương. Với nhà cung cấp có **DPA/điều
khoản công bố công khai** và được chấp nhận bằng việc dùng dịch vụ, bản công bố
đó chính là "hợp đồng hoặc thoả thuận" theo Điều 19(2)(b). Cách lưu:

1. Mở URL ở cột **Văn bản ràng buộc**.
2. In trang thành PDF hoặc chụp ảnh toàn trang (có ngày giờ hiển thị nếu được).
3. Đặt tên `YYYY-MM-DD-<nhà-cung-cấp>-dpa.pdf`, lưu **ngoài repo** (ổ cứng mã
   hoá hoặc thư mục cloud riêng tư).
4. Ghi đường dẫn nội bộ vào cột **Ảnh chụp** — không dán nội dung hợp đồng vào repo.
5. Chỉ xin bản ký song phương khi: nhà cung cấp bắt buộc, hoặc dữ liệu chuyển đi
   là dữ liệu nhạy cảm quy mô lớn. Với Protogon hiện tại, **không cần** bước này.

> Vì sao đủ: điều khoản/DPA công bố là văn bản ràng buộc đơn phương mà Protogon
> chấp nhận khi dùng dịch vụ; bản sao có ngày truy cập chứng minh phiên bản đã áp
> dụng tại thời điểm lập hồ sơ. Đây là cách hiểu thực tiễn — vẫn nên để luật sư
> xác nhận trước khi nộp (xem `README.md`).

## 2. Bảng nhà cung cấp

| Nhà cung cấp     | Dịch vụ         | Dữ liệu                                                             | Nơi xử lý                | Vai trò               | Văn bản ràng buộc                                                                                                     | Ngày truy cập | Ảnh chụp          |
| ---------------- | --------------- | ------------------------------------------------------------------- | ------------------------ | --------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------- |
| Convex           | DB + backend    | Toàn bộ dữ liệu guild, tài khoản, dữ liệu xác minh đã băm           | Hoa Kỳ                   | Bên xử lý             | https://www.convex.dev/legal/dpa                                                                                      | 12/11/2026    | `[đường dẫn PDF]` |
| Discord Inc.     | Nền tảng        | ID, tên, avatar, nội dung tương tác                                 | Hoa Kỳ                   | Bên kiểm soát độc lập | https://discord.com/privacy                                                                                           | 12/11/2026    | `[đường dẫn PDF]` |
| ipapi.is         | Tra IP          | Chỉ IP                                                              | Đức / Hoa Kỳ / Singapore | Bên xử lý             | https://ipapi.is/dpa.html · https://ipapi.is/privacy.html · https://ipapi.is/terms.html                               | 12/11/2026    | `[đường dẫn PDF]` |
| Kira (kiraai.vn) | AI              | Nội dung lệnh                                                       | Việt Nam                 | Bên xử lý             | https://kiraai.vn/dieu-khoan · https://kiraai.vn/privacy                                                              | 12/11/2026    | `[đường dẫn PDF]` |
| Groq             | AI              | Nội dung lệnh                                                       | Hoa Kỳ                   | Bên xử lý             | https://groq.com/terms-of-service/ · https://groq.com/privacy-policy/                                                 | 12/11/2026    | `[đường dẫn PDF]` |
| OpenAI           | AI              | Nội dung lệnh                                                       | Hoa Kỳ                   | Bên xử lý             | https://openai.com/policies/data-processing-addendum/                                                                 | 12/11/2026    | `[đường dẫn PDF]` |
| GitHub           | Lưu code + Gist | Code; backup nếu chủ server bật                                     | Hoa Kỳ                   | Bên xử lý             | https://docs.github.com/en/site-policy/privacy-policies/github-data-protection-agreement                              | 12/11/2026    | `[đường dẫn PDF]` |
| ZaloPay          | Cổng thanh toán | Mã đơn, số tiền, trạng thái; thông tin thẻ/tài khoản do ZaloPay giữ | Việt Nam                 | Bên xử lý             | https://zalopay.vn/quy-dinh/thoa-thuan-su-dung-zalopay · https://zalopay.vn/quy-dinh/chinh-sach-bao-ve-quyen-rieng-tu | 12/11/2026    | `[đường dẫn PDF]` |
| Nhà cung cấp VPS | Hạ tầng         | Log hạ tầng                                                         | `[NƯỚC]`                 | Bên xử lý             | `[URL điều khoản/DPA của nhà cung cấp]`                                                                               | `[NGÀY]`      | `[đường dẫn PDF]` |

## 3. Việc còn lại (ngắn)

1. Lưu PDF/ảnh chụp cho 8 nhà cung cấp ở trên, điền cột **Ảnh chụp**.
2. Điền tên + nước của nhà cung cấp VPS.
3. Xác nhận bằng văn bản với nhà cung cấp AI: **không dùng dữ liệu gửi lên để
   huấn luyện**, thời hạn lưu log, cách xoá. Câu trả lời lưu cùng PDF điều khoản.
4. Mỗi lần thêm nhà cung cấp mới: cập nhật bảng này **và** `ctia-protogon.md`
   trước khi bật luồng dữ liệu.
5. Rà lại mỗi 06 tháng cùng lúc cập nhật DPIA/CTIA; ghi ngày truy cập mới.

## 4. Nguyên tắc chọn nhà cung cấp

- Chỉ gửi lượng dữ liệu tối thiểu cần cho mục đích.
- Ưu tiên nhà cung cấp có DPA công bố và cam kết không huấn luyện trên dữ liệu khách.
- Không dùng nhà cung cấp không nêu rõ thời hạn lưu/xoá.
- Có đường thoát: dữ liệu phải xuất được và luồng phải tắt được theo guild.
