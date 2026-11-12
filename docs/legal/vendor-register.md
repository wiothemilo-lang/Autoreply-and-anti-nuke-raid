# Danh mục nhà cung cấp và bên xử lý dữ liệu

Tài liệu hỗ trợ Điều 19(2)(b) Nghị định 356/2025/NĐ-CP: hồ sơ DPIA phải kèm bản
sao hợp đồng/thoả thuận xử lý dữ liệu với các bên tham gia.

> Cột **Chứng từ** ghi nơi lưu bản sao. Không dán nội dung hợp đồng vào repo;
> lưu PDF/ảnh chụp trong thư mục ngoài repo và ghi đường dẫn nội bộ.

| Nhà cung cấp     | Dịch vụ         | Dữ liệu                                                             | Nơi xử lý                | Vai trò               | Cơ sở chuyển                           | Chứng từ               | Trạng thái             |
| ---------------- | --------------- | ------------------------------------------------------------------- | ------------------------ | --------------------- | -------------------------------------- | ---------------------- | ---------------------- |
| Convex           | DB + backend    | Toàn bộ dữ liệu guild, tài khoản, dữ liệu xác minh đã băm           | Hoa Kỳ                   | Bên xử lý             | Hợp đồng                               | `[lưu DPA Convex]`     | **Cần tải DPA**        |
| Discord Inc.     | Nền tảng        | ID, tên, avatar, nội dung tương tác                                 | Hoa Kỳ                   | Bên kiểm soát độc lập | n/a                                    | Chính sách của Discord | n/a                    |
| ipapi.is         | Tra IP          | Chỉ IP                                                              | Đức / Hoa Kỳ / Singapore | Bên xử lý             | DPA tự động khi dùng API (Điều 12 DPA) | `[lưu DPA ipapi.is]`   | **Đã xác nhận cơ chế** |
| Kira (kiraai.vn) | AI              | Nội dung lệnh                                                       | Việt Nam                 | Bên xử lý             | Hợp đồng                               | `[lưu điều khoản]`     | **Cần xác nhận**       |
| Groq             | AI              | Nội dung lệnh                                                       | Hoa Kỳ                   | Bên xử lý             | Hợp đồng                               | `[lưu DPA]`            | **Cần tải DPA**        |
| OpenAI           | AI              | Nội dung lệnh                                                       | Hoa Kỳ                   | Bên xử lý             | Hợp đồng                               | `[lưu DPA]`            | **Cần tải DPA**        |
| GitHub           | Lưu code + Gist | Code; backup nếu chủ server bật                                     | Hoa Kỳ                   | Bên xử lý             | Hợp đồng                               | `[lưu DPA]`            | **Cần tải DPA**        |
| ZaloPay          | Cổng thanh toán | Mã đơn, số tiền, trạng thái; thông tin thẻ/tài khoản do ZaloPay giữ | Việt Nam                 | Bên xử lý             | Hợp đồng/điều khoản dịch vụ            | `[lưu điều khoản]`     | **Cần xác nhận**       |
| Nhà cung cấp VPS | Hạ tầng         | Log hạ tầng                                                         | `[NƯỚC]`                 | Bên xử lý             | Hợp đồng                               | `[lưu hợp đồng]`       | **Cần điền tên**       |

## Việc phải làm

1. Tải và lưu DPA/điều khoản của Convex, Groq, OpenAI, GitHub, Kira, VPS — kèm
   ngày truy cập và phiên bản.
2. Xác nhận bằng văn bản với nhà cung cấp AI: **không dùng dữ liệu gửi lên để
   huấn luyện**, thời hạn lưu log, cách xoá.
3. Với ipapi.is: lưu bản DPA công bố + ảnh chụp điều khoản; nếu cần bản ký song
   phương thì gửi yêu cầu tới `info@ipapi.is` (không bắt buộc).
4. Mỗi lần thêm nhà cung cấp mới: cập nhật bảng này **và** `ctia-protogon.md`
   trước khi bật luồng dữ liệu.
5. Rà lại mỗi 06 tháng cùng lúc cập nhật DPIA/CTIA.

## Nguyên tắc chọn nhà cung cấp

- Chỉ gửi lượng dữ liệu tối thiểu cần cho mục đích.
- Ưu tiên nhà cung cấp có DPA công bố và cam kết không huấn luyện trên dữ liệu khách.
- Không dùng nhà cung cấp không nêu rõ thời hạn lưu/xoá.
- Có đường thoát: dữ liệu phải xuất được và luồng phải tắt được theo guild.
