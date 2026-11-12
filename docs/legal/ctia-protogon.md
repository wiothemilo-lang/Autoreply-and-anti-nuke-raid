# Hồ sơ đánh giá tác động chuyển dữ liệu cá nhân xuyên biên giới (CTIA)

**Căn cứ:** Điều 20 Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15; Điều 18 Nghị định
356/2025/NĐ-CP.

| Trường               | Giá trị                                      |
| -------------------- | -------------------------------------------- |
| Bên chuyển dữ liệu   | `[HỌ TÊN]` — cá nhân vận hành Protogon       |
| Địa chỉ / email      | `[ĐỊA CHỈ LIÊN HỆ]` / `[EMAIL LIÊN HỆ]`      |
| Phiên bản / ngày lập | 1.0 — `[NGÀY]`                               |
| Ngày bắt đầu chuyển  | Trước 01/01/2026 (hạ tầng hiện hữu)          |
| Ngày nộp             | `[NGÀY]` — Cổng thông tin quốc gia về BVDPCN |

> Bản nháp kỹ thuật. Trước khi nộp: chuyển sang **Mẫu 01a/01b** Phụ lục Nghị
> định 356 và điền các trường `[…]`.

## 1. Các luồng chuyển dữ liệu

| #   | Bên nhận                 | Nước                     | Dữ liệu                                                             | Mục đích                                 | Phương thức |
| --- | ------------------------ | ------------------------ | ------------------------------------------------------------------- | ---------------------------------------- | ----------- |
| 1   | Convex                   | Hoa Kỳ                   | Toàn bộ dữ liệu guild, tài khoản dashboard, dữ liệu xác minh đã băm | Lưu trữ + chạy backend                   | HTTPS/TLS   |
| 2   | Discord Inc.             | Hoa Kỳ                   | ID, tên, avatar, nội dung tương tác                                 | Nền tảng bot chạy trên                   | HTTPS/TLS   |
| 3   | ipapi.is                 | Đức / Hoa Kỳ / Singapore | **Chỉ địa chỉ IP** của lượt xác minh                                | Tra quốc gia/ASN, dấu hiệu VPN/proxy/Tor | HTTPS/TLS   |
| 4   | Kira (kiraai.vn)         | Việt Nam                 | Nội dung lệnh AI                                                    | Trả lời lệnh                             | HTTPS/TLS   |
| 5   | Groq / OpenAI            | Hoa Kỳ                   | Nội dung lệnh AI (khi provider được chọn)                           | Trả lời lệnh                             | HTTPS/TLS   |
| 6   | GitHub                   | Hoa Kỳ                   | Bản backup guild (nếu chủ server bật Gist)                          | Sao lưu do chủ server kiểm soát          | HTTPS/TLS   |
| 7   | Nhà cung cấp VPS/Dokploy | `[NƯỚC]`                 | Log hạ tầng, không chứa IP thô trong DB                             | Chạy bot                                 | HTTPS/SSH   |

Luồng 4 không phải chuyển xuyên biên giới (xử lý tại Việt Nam) nhưng vẫn ghi để
đầy đủ chuỗi.

## 2. Đánh giá sự cần thiết

- Không có nhà cung cấp trong nước thay thế tương đương cho Convex (backend
  realtime + DB) và Discord (nền tảng bắt buộc).
- ipapi.is chỉ nhận IP, không nhận ID Discord/tên người dùng; kết quả cache 24h.
- Có thể tắt xác minh web theo từng guild → dừng luồng 3 ngay lập tức.
- Không chuyển dữ liệu cho mục đích quảng cáo, không bán dữ liệu.

## 3. Đánh giá khung pháp lý nước nhận

| Nước      | Đánh giá                                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hoa Kỳ    | Không có quyết định công nhận tương đương theo pháp luật Việt Nam. Có khung hợp đồng + luật bang; rủi ro truy cập của cơ quan nhà nước được xử lý bằng tối thiểu hoá và mã hoá. |
| Đức       | Khung GDPR; mức bảo vệ cao; ipapi.is cung cấp endpoint `de.ipapi.is` nếu cần giới hạn xử lý tại EEA.                                                                            |
| Singapore | PDPA; ipapi.is có thể định tuyến qua đây — chấp nhận được với dữ liệu chỉ là IP.                                                                                                |
| Việt Nam  | Không phải chuyển xuyên biên giới.                                                                                                                                              |

## 4. Biện pháp bảo vệ

1. **Tối thiểu hoá**: IP thô không lưu; chỉ hash HMAC tách guild; không gửi ID
   Discord cho ipapi.is.
2. **Hợp đồng**: chấp nhận DPA/điều khoản của từng nhà cung cấp (xem
   `vendor-register.md`); ipapi.is áp dụng DPA tự động khi dùng API.
3. **Mã hoá**: TLS khi truyền; backup có thể AES-256-GCM.
4. **Kiểm soát truy cập**: chỉ admin guild + bot đọc dữ liệu xác minh.
5. **Thời hạn**: cache ipapi 24h; phiên 7 ngày sau hết hạn; audit 365 ngày.
6. **Ứng cứu**: runbook 72h; có thể tắt xác minh web toàn bộ theo guild.

## 5. Quyền của chủ thể dữ liệu

Chủ thể liên hệ `[EMAIL LIÊN HỆ]` hoặc kênh hỗ trợ. Yêu cầu được xử lý theo
`runbook-du-lieu-ca-nhan.md`, kể cả khi dữ liệu đang ở nước ngoài: Protogon gửi
yêu cầu tới nhà cung cấp và xác nhận kết quả.

## 6. Sự cố và tạm dừng

- Sự cố liên quan dữ liệu chuyển ra nước ngoài: thông báo cơ quan chuyên trách
  trong **72 giờ** (Điều 23 Luật), thông báo chủ thể bị ảnh hưởng.
- Khi cơ quan chuyên trách yêu cầu ngừng chuyển (Điều 20(2) Luật), Protogon tắt
  luồng tương ứng trong 24 giờ và ghi lại thời điểm.

## 7. Cam kết cập nhật

- Cập nhật định kỳ **06 tháng** kể từ lần nộp đầu (Điều 20(1) NĐ 356).
- Cập nhật trong **10 ngày** khi: tổ chức lại/chấm dứt/giải thể; đổi bên cung cấp
  dịch vụ bảo vệ dữ liệu; đổi bên kiểm soát/bên xử lý/bên thứ ba; phát sinh mục
  đích mới (Điều 20(2) NĐ 356).
- Thêm nhà cung cấp mới = sửa hồ sơ này **trước** khi bật luồng dữ liệu.

## 8. Phụ lục

Bảng nhà cung cấp, vai trò, nơi xử lý và chứng từ: `vendor-register.md`.

**Người lập:** `[HỌ TÊN]` — **Ngày:** `[NGÀY]`
**Phê duyệt:** `[HỌ TÊN]` — **Chữ ký:** `[KÝ]`
