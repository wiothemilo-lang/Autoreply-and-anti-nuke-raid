# Hồ sơ bảo vệ dữ liệu cá nhân — Protogon

Thư mục này chứa **hồ sơ pháp lý bắt buộc** theo Luật Bảo vệ dữ liệu cá nhân
91/2025/QH15 và Nghị định 356/2025/NĐ-CP (cả hai hiệu lực 01/01/2026; Nghị định
356 thay Nghị định 13/2023/NĐ-CP).

> Đây là **bản nháp kỹ thuật** do agent soạn từ kiến trúc thật của hệ thống.
> Trước khi nộp: điền các trường `[…]`, chuyển sang đúng biểu mẫu trong Phụ lục
> Nghị định 356, và để người có trách nhiệm pháp lý đọc lại. Không thay thế ý
> kiến luật sư.

## 1. Chỉ cần nộp 2 hồ sơ

| Hồ sơ                                                   | Tệp                                    | Căn cứ                       | Trạng thái             |
| ------------------------------------------------------- | -------------------------------------- | ---------------------------- | ---------------------- |
| Đánh giá tác động xử lý dữ liệu cá nhân (DPIA)          | `dpia-protogon.md`                     | Điều 21 Luật; Điều 19 NĐ 356 | Nháp — cần điền + nộp  |
| Đánh giá tác động chuyển dữ liệu xuyên biên giới (CTIA) | `ctia-protogon.md`                     | Điều 20 Luật; Điều 18 NĐ 356 | Nháp — cần điền + nộp  |
| Danh mục nhà cung cấp / bên xử lý                       | `vendor-register.md`                   | Điều 19(2)(b) NĐ 356         | Nháp — cần lưu URL+ảnh |
| Quy trình nội bộ (yêu cầu, sự cố, đồng ý, lưu trữ)      | `runbook-du-lieu-ca-nhan.md`           | Điều 5, 19(2)(c), 23 Luật    | Nháp                   |
| Chính sách công khai                                    | `src/lib/legalContent.ts` → `/privacy` | Điều 9, 13 Luật              | Đã cập nhật 12/11/2026 |

**Không có "tờ khai" thứ ba.** DPIA và CTIA là hai hồ sơ duy nhất phải nộp cho
cơ quan chuyên trách. Các tài liệu còn lại là phụ lục nội bộ để chứng minh khi bị
kiểm tra.

## 2. Việc phải làm trước khi nộp

1. Điền `[HỌ TÊN]`, `[ĐỊA CHỈ LIÊN HỆ]`, `[EMAIL LIÊN HỆ]` — bên kiểm soát hiện
   là **cá nhân chưa có pháp nhân**. Nếu sau này lập hộ kinh doanh/công ty thì
   cập nhật hồ sơ trong **10 ngày** (Điều 20(2) NĐ 356).
2. Chuyển nội dung sang **Mẫu số 10** (DPIA) và **Mẫu 01a/01b** (CTIA) trong Phụ
   lục Nghị định 356. Không cần soạn văn bản mới từ đầu — hai tệp trong thư mục
   này đã đúng thứ tự mục.
3. Lưu chứng từ nhà cung cấp theo `vendor-register.md`: **URL + ngày truy cập +
   PDF/ảnh chụp**. Không cần xin hợp đồng ký song phương với từng nhà cung cấp.
4. Ký tên người đứng đầu (chính bạn, hoặc người được uỷ quyền) trên báo cáo.
5. Nộp **01 bản chính** qua Cổng thông tin quốc gia về bảo vệ dữ liệu cá nhân,
   trực tiếp hoặc qua bưu chính, tới cơ quan chuyên trách bảo vệ dữ liệu cá nhân
   (Bộ Công an; hồ sơ được phân loại và chuyển Công an tỉnh/thành phố theo địa
   bàn — Nghị quyết 22/2026/NQ-CP).
6. Lưu biên nhận nộp hồ sơ và ngày nộp trong chính tệp này.

## 3. Việc có thể bỏ — không làm cũng không sai

| Việc từng bị hiểu là bắt buộc           | Thực tế                                                                                                                                                                           |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Xin DPA ký song phương với từng vendor  | Không bắt buộc. Điều 19(2)(b) chấp nhận **bản sao hợp đồng hoặc thoả thuận**; DPA/điều khoản công bố và được chấp nhận khi dùng dịch vụ là đủ. Chỉ xin bản ký khi vendor yêu cầu. |
| Nộp thêm "bản khai xử lý dữ liệu" riêng | Không có thủ tục này. Chỉ DPIA + CTIA.                                                                                                                                            |
| Công chứng/hợp pháp hoá hồ sơ           | Không yêu cầu. Bản chính có ký tên là đủ.                                                                                                                                         |
| Thuê luật sư/DPO ngoài để nộp           | Không bắt buộc. Bạn có thể là đầu mối bảo vệ dữ liệu của chính mình; nên nhờ luật sư **đọc lại** trước khi nộp.                                                                   |
| Nộp lại mỗi lần đổi giá/đổi tính năng   | Chỉ cập nhật định kỳ 06 tháng hoặc khi đổi bên kiểm soát/nhà cung cấp/mục đích (Điều 20 NĐ 356).                                                                                  |

## 4. Mốc thời gian

| Việc                    | Thời hạn                                                                             | Căn cứ                   |
| ----------------------- | ------------------------------------------------------------------------------------ | ------------------------ |
| Nộp DPIA                | 60 ngày kể từ khi bắt đầu xử lý                                                      | Điều 19(4) NĐ 356        |
| Nộp CTIA                | 60 ngày kể từ khi bắt đầu chuyển dữ liệu                                             | Điều 18(4) NĐ 356        |
| Cơ quan trả kết quả     | 15 ngày                                                                              | Điều 19(5), 18(5) NĐ 356 |
| Cập nhật định kỳ        | 06 tháng/lần kể từ lần nộp đầu                                                       | Điều 20(1) NĐ 356        |
| Cập nhật đột xuất       | 10 ngày khi đổi bên kiểm soát, tổ chức lại, đổi bên cung cấp dịch vụ bảo vệ dữ liệu… | Điều 20(2) NĐ 356        |
| Trả lời chủ thể dữ liệu | 02 ngày làm việc                                                                     | Điều 5 NĐ 356            |
| Thực hiện quyền         | 10 / 15 / 20 ngày (xem/chỉnh sửa; hạn chế/phản đối; xoá)                             | Điều 5 NĐ 356            |
| Thông báo vi phạm       | 72 giờ kể từ khi phát hiện                                                           | Điều 23(1) Luật          |

## 5. Vì sao không được dựa vào miễn trừ "quy mô nhỏ"

Điều 41 NĐ 356 miễn DPIA/CTIA và đầu mối bảo vệ dữ liệu cho hộ kinh doanh,
doanh nghiệp siêu nhỏ/nhỏ — **trừ khi** kinh doanh dịch vụ xử lý dữ liệu, xử lý
dữ liệu nhạy cảm, hoặc đạt 100.000 chủ thể. Bạn là **cá nhân**, không phải hộ
kinh doanh/doanh nghiệp, nên miễn trừ này không áp dụng ngay từ đầu.

Điều 4(l) NĐ 356 xếp **"dữ liệu theo dõi hành vi, hoạt động sử dụng dịch vụ
viễn thông, mạng xã hội, dịch vụ truyền thông trực tuyến và các dịch vụ khác
trên không gian mạng"** vào nhóm nhạy cảm. Protogon ghi hành vi vi phạm, heat,
join/leave và tín hiệu thiết bị của thành viên trên Discord — cách đọc an toàn
là thuộc nhóm này. Vì vậy DPIA/CTIA là **bắt buộc**, không phụ thuộc quy mô.

## 6. Mức phạt cần biết (Nghị định 330/2026/NĐ-CP, hiệu lực 19/8/2026)

| Hành vi                                                     | Mức phạt         |
| ----------------------------------------------------------- | ---------------- |
| Không thông báo dữ liệu cá nhân **nhạy cảm** khi xin đồng ý | 30–50 triệu đồng |
| Không lưu nhật ký chứng minh sự đồng ý                      | 30–50 triệu đồng |
| Thiết lập mặc định đồng ý / chỉ dẫn gây nhầm lẫn            | 30–50 triệu đồng |
| Vi phạm hồ sơ đánh giá tác động (DPIA/CTIA)                 | 30–50 triệu đồng |
| Xử lý dữ liệu khi chủ thể im lặng, coi im lặng là đồng ý    | 50–70 triệu đồng |

Đây là lý do trang xác minh phải nói rõ **"dữ liệu cá nhân nhạy cảm"** trước ô
đồng ý, ô mặc định trống, và mỗi phiên lưu `consentVersion` + `consentAt`.

## 7. Nguyên tắc

- Không đưa khoá bí mật, token, IP thô hay dữ liệu cá nhân thật vào hồ sơ.
- Mọi số liệu thời hạn trong hồ sơ phải khớp code và `/privacy`; lệch là bằng
  chứng bất lợi khi bị kiểm tra.
- Hồ sơ được lưu, cập nhật định kỳ 06 tháng và cập nhật ngay trong 10 ngày khi
  có thay đổi thuộc Điều 20(2) NĐ 356.
