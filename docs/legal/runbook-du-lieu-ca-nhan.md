# Runbook dữ liệu cá nhân

Quy trình nội bộ hỗ trợ Điều 5, Điều 19(2)(c) và Điều 23 Luật 91/2025/QH15;
Điều 5, 20, 28 Nghị định 356/2025/NĐ-CP.

Đầu mối: `[HỌ TÊN]` — `[EMAIL LIÊN HỆ]`.

## 1. Tiếp nhận yêu cầu của chủ thể dữ liệu

### 1.1 Kênh

- Kênh hỗ trợ của cộng đồng Discord Protogon.
- Fanpage Facebook ở chân trang.
- Email `[EMAIL LIÊN HỆ]` (kênh chính thức, có dấu thời gian).

### 1.2 Các bước

| Bước | Việc                                                                                                   | Thời hạn               |
| ---- | ------------------------------------------------------------------------------------------------------ | ---------------------- |
| 1    | Ghi nhận vào bảng theo dõi: ngày nhận, kênh, loại yêu cầu, ID server/người dùng                        | Ngay                   |
| 2    | Xác minh danh tính: chủ tài khoản dashboard đăng nhập Discord, hoặc chủ server xác nhận cho thành viên | ≤ 1 ngày làm việc      |
| 3    | Phản hồi xác nhận + nêu thủ tục                                                                        | **≤ 02 ngày làm việc** |
| 4    | Thực hiện                                                                                              | Xem bảng dưới          |
| 5    | Phản hồi kết quả + lưu bằng chứng                                                                      | Cùng ngày hoàn tất     |

### 1.3 Thời hạn thực hiện (Điều 5 NĐ 356)

| Loại yêu cầu                            | Thực hiện | Gia hạn tối đa (01 lần) |
| --------------------------------------- | --------- | ----------------------- |
| Xem, chỉnh sửa, cung cấp dữ liệu        | 10 ngày   | 10 ngày                 |
| Rút lại đồng ý, hạn chế, phản đối xử lý | 15 ngày   | 15 ngày                 |
| Xoá dữ liệu                             | 20 ngày   | 20 ngày                 |
| Yêu cầu biện pháp bảo vệ khác           | 15 ngày   | 15 ngày                 |

Trường hợp phải yêu cầu bên xử lý/bên thứ ba thực hiện: cộng thêm tối đa 10 ngày
(xem/chỉnh sửa) hoặc 10 ngày (xoá) theo Điều 5(3)(4) NĐ 356. Khi gia hạn phải
thông báo lý do và chứng minh việc gia hạn là cần thiết.

### 1.4 Mẫu phản hồi

```
Chào bạn,

Protogon đã nhận yêu cầu [xoá/xem/chỉnh sửa/hạn chế] dữ liệu của
[ID người dùng/server] gửi ngày [ngày].

Chúng tôi sẽ xử lý trong thời hạn [10/15/20] ngày theo Điều 5 Nghị định
356/2025/NĐ-CP. Nếu cần gia hạn, chúng tôi sẽ thông báo lý do trước khi hết hạn.

Lưu ý: chúng tôi không bao giờ yêu cầu token bot, mật khẩu hay mã 2FA.
```

### 1.5 Bảng theo dõi (lưu ngoài repo, có dấu thời gian)

| Ngày nhận | Kênh | Chủ thể | Loại | Hạn phản hồi | Hạn thực hiện | Trạng thái | Bằng chứng |
| --------- | ---- | ------- | ---- | ------------ | ------------- | ---------- | ---------- |

## 2. Sự cố dữ liệu cá nhân

### 2.1 Phân loại

- **Mức 1** — rò rỉ/hỏng dữ liệu có thể xâm phạm tính mạng, sức khoẻ, danh dự,
  nhân phẩm, tài sản của chủ thể, hoặc ảnh hưởng an ninh quốc gia/trật tự.
  → Bắt buộc thông báo cơ quan chuyên trách.
- **Mức 2** — sự cố kỹ thuật không ảnh hưởng dữ liệu cá nhân (ví dụ bot offline).
  → Chỉ xử lý nội bộ.

### 2.2 Trình tự

| Mốc       | Việc                                                                                                 |
| --------- | ---------------------------------------------------------------------------------------------------- |
| T+0       | Phát hiện, ghi giờ chính xác, cách ly hệ thống bị ảnh hưởng                                          |
| T+4h      | Xác định dữ liệu bị ảnh hưởng, số chủ thể, nguyên nhân sơ bộ                                         |
| T+24h     | Khoanh vùng, vá, đổi khoá nếu cần (`IP_HASH_SECRET` rotation làm mất khả năng khớp hash cũ — ghi rõ) |
| **T+72h** | Gửi thông báo cơ quan chuyên trách (Mẫu số 08 NĐ 356, Điều 28)                                       |
| T+72h     | Thông báo chủ thể bị ảnh hưởng nếu có nguy cơ cao                                                    |
| T+7d      | Báo cáo khắc phục, cập nhật DPIA nếu cần                                                             |

### 2.3 Nội dung thông báo (Mẫu 08)

- Tính chất, thời gian, địa điểm, hành vi vi phạm.
- Loại dữ liệu, số lượng chủ thể bị ảnh hưởng.
- Hậu quả có thể xảy ra.
- Biện pháp đã áp dụng và biện pháp tiếp theo.
- Đầu mối liên hệ: `[HỌ TÊN]`, `[EMAIL LIÊN HỆ]`.

### 2.4 Biên bản

Mọi sự cố Mức 1 phải có biên bản xác nhận (Điều 23(2) Luật), lưu cùng hồ sơ
nộp cơ quan. Không xoá log của sự cố trước khi có kết luận.

## 3. Bằng chứng đồng ý

- Phiên bản đồng ý hiện tại: `VERIFY_CONSENT_VERSION` trong
  `convex/verifyCrypto.ts`.
- Mỗi phiên xác minh lưu `consentVersion` + `consentAt`.
- Khi đổi nội dung đồng ý: tăng version, ghi hash SHA-256 của đoạn văn bản tương
  ứng và lưu cùng tag git `consent-<version>`.
- Không suy ra đồng ý từ im lặng; không gộp mục đích.

## 4. Kiểm tra lưu trữ (hàng quý)

1. Chạy `botRunRetention` và đối chiếu số bản ghi còn hạn.
2. Kiểm tra cache ipapi không còn bản ghi quá 24h.
3. Kiểm tra phiên xác minh quá 7 ngày sau hết hạn đã bị xoá.
4. Ghi kết quả vào nhật ký nội bộ; lệch → mở issue sửa code, không sửa tay DB.

## 5. Đào tạo và rà soát

- Tự rà soát lại runbook này mỗi 06 tháng (cùng lúc cập nhật DPIA/CTIA).
- Khi thêm nhà cung cấp hoặc đổi luồng dữ liệu: cập nhật DPIA, CTIA, vendor
  register **trước** khi bật.
- Khi có nhân sự mới: đọc mục 1, 2, 3 trước khi được cấp quyền.
