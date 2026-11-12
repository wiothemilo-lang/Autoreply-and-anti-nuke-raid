# Hồ sơ đánh giá tác động xử lý dữ liệu cá nhân (DPIA)

**Căn cứ:** Điều 21 Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15; Điều 19 Nghị định
356/2025/NĐ-CP.

| Trường                 | Giá trị                                                   |
| ---------------------- | --------------------------------------------------------- |
| Bên kiểm soát          | `[HỌ TÊN]` — cá nhân vận hành Protogon, chưa có pháp nhân |
| Địa chỉ liên hệ        | `[ĐỊA CHỈ LIÊN HỆ]`                                       |
| Email                  | `[EMAIL LIÊN HỆ]`                                         |
| Đầu mối bảo vệ dữ liệu | `[HỌ TÊN]` (chính bên kiểm soát), email trên              |
| Phiên bản / ngày lập   | 1.0 — `[NGÀY]`                                            |
| Người phê duyệt        | `[HỌ TÊN]`, chức danh `[CHỨC DANH]`                       |
| Ngày nộp / nơi nộp     | `[NGÀY]` — Cổng thông tin quốc gia về BVDPCN              |

> Bản nháp kỹ thuật. Trước khi nộp: chuyển sang **Mẫu số 10** Phụ lục Nghị định
> 356 và điền các trường `[…]`.

## 1. Mô tả hoạt động xử lý

| #   | Hoạt động                   | Chủ thể              | Dữ liệu                                                                                                        | Mục đích                                         | Vai trò của Protogon                       |
| --- | --------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------ |
| 1   | Bot vận hành server Discord | Thành viên server    | ID Discord, tên hiển thị, join/leave, hành vi vi phạm, heat, ticket                                            | Bảo vệ server khỏi raid/spam/alt, trả lời ticket | Bên xử lý (chủ server quyết định mục đích) |
| 2   | Dashboard quản trị          | Quản trị viên server | ID Discord, username, tên hiển thị, avatar, danh sách server, lần đăng nhập cuối, phiên                        | Cho chủ server cấu hình bot                      | Bên kiểm soát                              |
| 3   | Xác minh qua web            | Người được xác minh  | IP (chỉ trong RAM), hash HMAC tách guild, tín hiệu thiết bị đã băm, kết quả ipapi, audit, liên kết alt, ban IP | Chặn tài khoản giả/VPN/proxy khi chủ server bật  | Bên kiểm soát và xử lý                     |
| 4   | Tính năng AI (Haimiya)      | Người gọi lệnh       | Nội dung lệnh/tin nhắn liên quan, ID server/kênh                                                               | Trả lời, tóm tắt, kiểm duyệt                     | Bên xử lý                                  |
| 5   | Sao lưu                     | Chủ server           | Cấu hình, bản ghi hành động, heat                                                                              | Khôi phục khi sự cố                              | Bên xử lý                                  |

## 2. Luồng dữ liệu

```
Discord (US) ──gateway/HTTP──► Bot (VPS) ──► Convex (US) ──► Dashboard (web)
                                   │              │
                                   │              ├─► ipapi.is (DE/US/SG): chỉ IP
                                   │              └─► GitHub (US): Gist nếu chủ server bật
                                   └─► Nhà cung cấp AI (Kira VN; Groq/OpenAI US) khi có lệnh
```

Chi tiết endpoint, biến môi trường và cách đọc XFF: `docs/verify-ip-architecture.md`.

## 3. Cơ sở pháp lý và nguyên tắc

| Hoạt động | Cơ sở                                                                              |
| --------- | ---------------------------------------------------------------------------------- |
| 1, 5      | Hợp đồng/hợp tác với chủ server; lợi ích hợp pháp (an ninh server)                 |
| 2         | Thực hiện hợp đồng; lợi ích hợp pháp (vận hành dịch vụ)                            |
| 3         | **Sự đồng ý** của người được xác minh (checkbox, ghi `consentVersion`/`consentAt`) |
| 4         | Thực hiện yêu cầu của người dùng                                                   |

Nguyên tắc: tối thiểu hoá (không lưu IP thô, không lưu nội dung tin nhắn thường),
giới hạn mục đích (không quảng cáo, không bán), tách theo guild, có thời hạn xoá.

## 4. Sự cần thiết và tương xứng

- Xác minh web chỉ chạy khi chủ server bật (`verifyWebEnabled`) và người dùng tick
  đồng ý; không đồng ý thì không gửi IP/thiết bị và không được xác minh.
- Không cần đăng nhập Discord để xác minh → giảm dữ liệu thu so với OAuth.
- IP thô không vào DB; hash HMAC-SHA-256 với khoá bí mật, **tách theo từng guild**
  nên không thể ghép một người giữa hai server.
- Tín hiệu thiết bị chỉ lưu dạng băm; không đọc nội dung tin nhắn riêng tư.
- Thời hạn ngắn hơn mức tối đa cần thiết ở phần lớn hạng mục (xem §6).

## 5. Đánh giá rủi ro

| Rủi ro                                           | Khả năng   | Tác động   | Biện pháp                                                                         | Dư               |
| ------------------------------------------------ | ---------- | ---------- | --------------------------------------------------------------------------------- | ---------------- |
| Lộ hash IP/thiết bị → liên kết hành vi           | Thấp       | Cao        | HMAC tách guild; khoá trong env Convex; không trả hash qua API; audit 365 ngày    | Thấp             |
| Admin guild đọc dữ liệu thành viên ngoài phạm vi | Trung bình | Trung bình | Kiểm tra quyền theo guild ở backend; team admin không đọc xuyên server; test IDOR | Thấp             |
| Chặn nhầm người thật (CGNAT, mạng di động)       | Trung bình | Trung bình | IP dùng chung chỉ bị từ chối xác minh, không auto-ban; whitelist; khiếu nại       | Thấp             |
| Chuyển dữ liệu ra nước ngoài bị yêu cầu dừng     | Thấp       | Cao        | Tối thiểu hoá; CTIA; tắt được theo guild                                          | Trung bình       |
| Nhà cung cấp AI giữ nội dung lệnh                | Trung bình | Trung bình | Chỉ gửi khi có lệnh; cần xác nhận điều khoản không huấn luyện                     | **Cần xác minh** |
| Trẻ em dùng Discord                              | Thấp       | Cao        | Không thu ngày sinh; Discord yêu cầu 13+; không dùng dữ liệu cho quảng cáo        | Thấp             |
| Sự cố không báo kịp 72 giờ                       | Trung bình | Cao        | Runbook + biểu mẫu biên bản (`runbook-du-lieu-ca-nhan.md`)                        | Thấp             |
| Backup Gist bị lộ                                | Thấp       | Trung bình | Chủ server tự chọn; mã hoá AES-256-GCM; huỷ gist khi xoá                          | Thấp             |

## 6. Thời hạn lưu và xoá

| Dữ liệu                | Thời hạn                             | Cơ chế               |
| ---------------------- | ------------------------------------ | -------------------- |
| Phiên xác minh         | 7 ngày sau khi hết hạn               | `botRunRetention`    |
| Liên kết tài khoản phụ | 180 ngày                             | `botRunRetention`    |
| Nhật ký xác minh       | 365 ngày                             | `botRunRetention`    |
| Ban IP                 | Xoá hẳn 90 ngày sau khi hết hiệu lực | `botRunRetention`    |
| Tín hiệu thiết bị/IP   | 730 ngày kể từ lần cuối              | `botRunRetention`    |
| Cache ipapi            | 24 giờ                               | Xoá ngay khi hết hạn |
| Phiên dashboard        | 30 ngày                              | Đăng xuất xoá ngay   |
| Backup                 | Theo lịch chủ server (2–30 ngày/bản) | Bot xoá bản cũ       |

## 7. Biện pháp kỹ thuật và tổ chức

- Truy cập dashboard qua OAuth2 Discord, kiểm tra lại ở backend từng request.
- Action bảo mật cao dùng `botKey` dẫn xuất SHA-256; không có backdoor.
- Phân quyền đọc dữ liệu xác minh: chỉ admin guild + bot.
- XFF lấy mục cuối, fail-closed khi IP riêng; có `/verify/self-test`.
- Backup có thể mã hoá AES-256-GCM + kiểm tra SHA-256.
- Nhật ký hành động phục vụ truy vết; không ghi IP thô.

## 8. Quyền của chủ thể dữ liệu

Quy trình và mẫu trả lời: `runbook-du-lieu-ca-nhan.md`. Thời hạn: phản hồi 02
ngày làm việc; thực hiện 10 ngày (xem/chỉnh sửa/cung cấp), 15 ngày (hạn chế/phản
đối/rút đồng ý), 20 ngày (xoá); gia hạn một lần theo mức luật cho phép.

## 9. Chuyển dữ liệu xuyên biên giới

Xem `ctia-protogon.md` và `vendor-register.md`.

## 10. Kết luận

Với các biện pháp ở §5 và §7, rủi ro còn lại được đánh giá **thấp đến trung
bình**. Điều kiện để kết luận này đứng vững:

1. Duy trì đúng thời hạn xoá ở §6 (kiểm tra hàng quý).
2. Xác nhận điều khoản của nhà cung cấp AI về việc không dùng dữ liệu để huấn luyện.
3. Không bật xác minh web cho guild mới khi chưa chạy `/verify/self-test`.
4. Cập nhật hồ sơ trong 10 ngày khi thay đổi bên kiểm soát/nhà cung cấp.

**Người lập:** `[HỌ TÊN]` — **Ngày:** `[NGÀY]`
**Phê duyệt:** `[HỌ TÊN]` — **Chữ ký:** `[KÝ]`
