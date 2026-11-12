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
| 6   | Ticket hỗ trợ               | Người mở ticket      | Nội dung/bằng chứng/ô bổ sung do người dùng gửi, transcript kênh ticket, ID người mở, staff xử lý              | Xử lý khiếu nại/hỗ trợ                           | Bên xử lý (chủ server quyết định)          |
| 7   | Threat relay liên server    | Thành viên server    | Đoạn spam ≤60 ký tự đã lược mention, tên bot lạ; không có ID người dùng, guild nguồn băm một chiều             | Chặn raid sớm ở server khác (opt-in hai phía)    | Bên kiểm soát và xử lý                     |
| 8   | Học mẫu raid (ambient)      | Thành viên server    | Module, hành động, phân loại AI, lý do AI, tên app; không có ID server/người dùng khi bot đọc toàn mạng        | Cải thiện nhận diện raid, giảm phạt nhầm         | Bên kiểm soát và xử lý                     |
| 9   | Thanh toán / ủng hộ         | Người mua            | ID Discord, gói, số tiền, mã đơn ZaloPay, trạng thái, thời điểm, phiên bản điều khoản; không có dữ liệu thẻ    | Xử lý đơn, đối soát, nghĩa vụ kế toán            | Bên kiểm soát                              |
| 10  | Góp ý                       | Người gửi            | Nội dung góp ý, email tự nguyện, ngôn ngữ, trang gửi                                                           | Cải thiện sản phẩm, phản hồi khi cần             | Bên kiểm soát                              |

## 2. Luồng dữ liệu

```
Discord (US) ──gateway/HTTP──► Bot (VPS) ──► Convex (US) ──► Dashboard (web)
                                   │              │
                                   │              ├─► ipapi.is (DE/US/SG): chỉ IP
                                   │              ├─► ZaloPay (VN): mã đơn + số tiền khi thanh toán
                                   │              └─► GitHub (US): Gist nếu chủ server bật
                                   └─► Nhà cung cấp AI (Kira VN; Groq/OpenAI US) khi có lệnh
```

Chi tiết endpoint, biến môi trường và cách đọc XFF: `docs/verify-ip-architecture.md`.

## 3. Cơ sở pháp lý và nguyên tắc

| Hoạt động | Cơ sở                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1, 5      | Hợp đồng/hợp tác với chủ server; lợi ích hợp pháp (an ninh server)                                                                                           |
| 2         | Thực hiện hợp đồng; lợi ích hợp pháp (vận hành dịch vụ)                                                                                                      |
| 3         | **Sự đồng ý** rõ ràng của người được xác minh; thông báo trước rằng đây là **dữ liệu cá nhân nhạy cảm** (Điều 6(4) NĐ 356); ghi `consentVersion`/`consentAt` |
| 4         | Thực hiện yêu cầu của người dùng                                                                                                                             |
| 6         | Thực hiện dịch vụ hỗ trợ theo yêu cầu của người dùng/chủ server                                                                                              |
| 7         | **Sự đồng ý** của chủ server (opt-in `relayShare`/`relayReceive`) + lợi ích hợp pháp                                                                         |
| 8         | Lợi ích hợp pháp (an ninh hệ thống); dữ liệu đã bỏ định danh trước khi bot đọc                                                                               |
| 9         | Thực hiện hợp đồng mua/ủng hộ + nghĩa vụ kế toán                                                                                                             |
| 10        | Sự đồng ý của người gửi (tự nguyện gửi form)                                                                                                                 |

Nguyên tắc: tối thiểu hoá (không lưu IP thô, không lưu nội dung tin nhắn thường),
giới hạn mục đích (không quảng cáo, không bán), tách theo guild, có thời hạn xoá.

### 3.1. Vì sao xác minh web là dữ liệu cá nhân nhạy cảm

Điều 4(l) Nghị định 356/2025/NĐ-CP xếp **dữ liệu theo dõi hành vi, hoạt động sử
dụng dịch vụ viễn thông, mạng xã hội, dịch vụ truyền thông trực tuyến và các
dịch vụ khác trên không gian mạng** vào nhóm nhạy cảm. Xác minh web ghi nhận
hành vi trên trang (thời gian ở trang, cử động chuột/bàn phím), tín hiệu thiết
bị/trình duyệt và IP của người dùng Discord — cách đọc an toàn là thuộc nhóm
này. Vì vậy:

- Trang xác minh hiển thị khối **"Dữ liệu cá nhân nhạy cảm"** trước ô đồng ý,
  nêu rõ ipapi.is là bên thứ ba nhận IP và các nước xử lý (Đức, Hoa Kỳ, Singapore).
- Ô đồng ý **mặc định trống**, không gộp mục đích, không coi im lặng là đồng ý.
- Server gắn `VERIFY_CONSENT_VERSION` và `consentAt` cho từng phiên; đổi nội dung
  đồng ý phải tăng version và lưu ảnh chụp màn hình tương ứng.
- Từ chối đồng ý = không gửi IP/thiết bị, không xác minh; không có hình phạt tự động.

## 4. Sự cần thiết và tương xứng

- Xác minh web chỉ chạy khi chủ server bật (`verifyWebEnabled`) và người dùng tick
  đồng ý; không đồng ý thì không gửi IP/thiết bị và không được xác minh.
- Không cần đăng nhập Discord để xác minh → giảm dữ liệu thu so với OAuth.
- IP thô không vào DB; hash HMAC-SHA-256 với khoá bí mật, **tách theo từng guild**
  nên không thể ghép một người giữa hai server.
- Tín hiệu thiết bị chỉ lưu dạng băm; không đọc nội dung tin nhắn riêng tư.
- Ngoại lệ liên server được kiểm soát: threat relay chỉ chạy khi cả hai phía opt-in,
  chỉ gửi đoạn spam ≤60 ký tự/tên bot (không ID người dùng, nguồn băm, TTL 24h);
  mẫu raid bot đọc toàn mạng đã bỏ ID server/người dùng và chỉ dùng để cải thiện
  phân loại.
- Nội dung ticket/transcript chỉ staff của chính server đó đọc được; job dọn xoá
  file storage trước rồi mới xoá hàng DB, tránh blob mồ côi.
- Thời hạn ngắn hơn mức tối đa cần thiết ở phần lớn hạng mục (xem §6).

## 5. Đánh giá rủi ro

| Rủi ro                                           | Khả năng   | Tác động   | Biện pháp                                                                                | Dư               |
| ------------------------------------------------ | ---------- | ---------- | ---------------------------------------------------------------------------------------- | ---------------- |
| Lộ hash IP/thiết bị → liên kết hành vi           | Thấp       | Cao        | HMAC tách guild; khoá trong env Convex; không trả hash qua API; audit 365 ngày           | Thấp             |
| Admin guild đọc dữ liệu thành viên ngoài phạm vi | Trung bình | Trung bình | Kiểm tra quyền theo guild ở backend; team admin không đọc xuyên server; test IDOR        | Thấp             |
| Chặn nhầm người thật (CGNAT, mạng di động)       | Trung bình | Trung bình | IP dùng chung chỉ bị từ chối xác minh, không auto-ban; whitelist; khiếu nại              | Thấp             |
| Chuyển dữ liệu ra nước ngoài bị yêu cầu dừng     | Thấp       | Cao        | Tối thiểu hoá; CTIA; tắt được theo guild                                                 | Trung bình       |
| Nhà cung cấp AI giữ nội dung lệnh                | Trung bình | Trung bình | Chỉ gửi khi có lệnh; cần xác nhận điều khoản không huấn luyện                            | **Cần xác minh** |
| Trẻ em dùng Discord                              | Thấp       | Cao        | Không thu ngày sinh; Discord yêu cầu 13+; không dùng dữ liệu cho quảng cáo               | Thấp             |
| Sự cố không báo kịp 72 giờ                       | Trung bình | Cao        | Runbook + biểu mẫu biên bản (`runbook-du-lieu-ca-nhan.md`)                               | Thấp             |
| Backup Gist bị lộ                                | Thấp       | Trung bình | Chủ server tự chọn; mã hoá AES-256-GCM; huỷ gist khi xoá                                 | Thấp             |
| Ticket/transcript lộ nội dung nhạy cảm           | Trung bình | Cao        | Chỉ staff guild đọc; không trả qua API công khai; xoá storage + hàng DB sau 180 ngày     | Thấp             |
| Relay bị đầu độc/lộ nội dung sang server khác    | Thấp       | Trung bình | Opt-in hai phía; lược mention, cắt 60 ký tự; weight ≥2; TTL 24h; nguồn băm               | Thấp             |
| Dữ liệu cũ không được dọn (retention trên giấy)  | Trung bình | Cao        | `botRunRetention` xoá thật + test chặn hồi quy; chạy mỗi tick bot                        | Thấp             |
| Lộ dữ liệu đơn thanh toán                        | Thấp       | Trung bình | Chỉ lưu mã đơn/số tiền/ID Discord; không lưu thẻ hay tài khoản; quyền admin có kiểm soát | Thấp             |
| Email trong góp ý bị lạm dụng                    | Thấp       | Thấp       | Chỉ chủ bot đọc; xoá sau 365 ngày; không hiển thị công khai                              | Thấp             |

## 6. Thời hạn lưu và xoá

| Dữ liệu                | Thời hạn                              | Cơ chế                               |
| ---------------------- | ------------------------------------- | ------------------------------------ |
| Phiên xác minh         | 7 ngày sau khi hết hạn                | `botRunRetention`                    |
| Liên kết tài khoản phụ | 180 ngày                              | `botRunRetention`                    |
| Nhật ký xác minh       | 365 ngày                              | `botRunRetention`                    |
| Ban IP                 | Xoá hẳn 90 ngày sau khi hết hiệu lực  | `botRunRetention`                    |
| Tín hiệu thiết bị/IP   | 730 ngày kể từ lần cuối               | `botRunRetention`                    |
| Cache ipapi            | 24 giờ                                | Xoá ngay khi hết hạn                 |
| Phiên dashboard        | 30 ngày                               | Đăng xuất xoá ngay + sweep           |
| Backup                 | Theo lịch chủ server (2–30 ngày/bản)  | Bot xoá bản cũ                       |
| Góp ý                  | 365 ngày                              | `botRunRetention`                    |
| Thanh toán/đối soát    | Theo thời hạn kế toán (tối đa 10 năm) | Không tự động xoá — rà soát thủ công |
| Lượt join (Join Gate)  | 90 ngày                               | `botRunRetention`                    |
| Hành động hình phạt    | 365 ngày                              | `botRunRetention`                    |
| Sự kiện antinuke/raid  | 365 ngày                              | `botRunRetention`                    |
| Mẫu raid (ẩn danh)     | 180 ngày                              | `botRunRetention`                    |
| Ticket đã đóng         | 180 ngày sau khi đóng                 | `botRunRetention`                    |
| Threat relay           | 24 giờ                                | `botCleanupRelay`                    |

## 7. Biện pháp kỹ thuật và tổ chức

- Truy cập dashboard qua OAuth2 Discord, kiểm tra lại ở backend từng request.
- Action bảo mật cao dùng `botKey` dẫn xuất SHA-256; không có backdoor.
- Phân quyền đọc dữ liệu xác minh: chỉ admin guild + bot.
- XFF lấy mục cuối, fail-closed khi IP riêng; có `/verify/self-test`.
- Đồng ý xác minh: khối thông báo dữ liệu nhạy cảm + ipapi.is/3 nước hiển thị
  trước checkbox; ô mặc định trống; server lưu `consentVersion` + `consentAt`.
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
5. Duy trì test `scripts/test-verify-flow.ts` cho các sweep của `botRunRetention`
   (join, hình phạt, antinuke, mẫu raid, ticket + transcript) — retention chỉ có
   giá trị pháp lý khi code thực sự xoá.
6. Giữ khối thông báo **dữ liệu cá nhân nhạy cảm** + ipapi.is/3 nước trên trang
   xác minh và trong tin nhắn bot; mỗi lần đổi nội dung phải tăng
   `VERIFY_CONSENT_VERSION`, lưu ảnh chụp màn hình và tag git `consent-<version>`.

**Người lập:** `[HỌ TÊN]` — **Ngày:** `[NGÀY]`
**Phê duyệt:** `[HỌ TÊN]` — **Chữ ký:** `[KÝ]`
