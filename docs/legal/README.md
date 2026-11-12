# Hồ sơ bảo vệ dữ liệu cá nhân — Protogon

Thư mục này chứa **hồ sơ pháp lý bắt buộc** theo Luật Bảo vệ dữ liệu cá nhân
91/2025/QH15 (hiệu lực 01/01/2026) và Nghị định 356/2025/NĐ-CP (hiệu lực
01/01/2026, thay Nghị định 13/2023/NĐ-CP).

> Đây là **bản nháp kỹ thuật** do agent soạn từ kiến trúc thật của hệ thống.
> Trước khi nộp phải: điền các trường `[…]`, đối chiếu đúng biểu mẫu trong Phụ lục
> Nghị định 356, và để người có trách nhiệm pháp lý đọc lại. Không thay thế ý
> kiến luật sư.

## 1. Danh mục hồ sơ

| Hồ sơ                                                   | Tệp                                    | Căn cứ                       | Trạng thái             |
| ------------------------------------------------------- | -------------------------------------- | ---------------------------- | ---------------------- |
| Đánh giá tác động xử lý dữ liệu cá nhân (DPIA)          | `dpia-protogon.md`                     | Điều 21 Luật; Điều 19 NĐ 356 | Nháp — cần điền + nộp  |
| Đánh giá tác động chuyển dữ liệu xuyên biên giới (CTIA) | `ctia-protogon.md`                     | Điều 20 Luật; Điều 18 NĐ 356 | Nháp — cần điền + nộp  |
| Danh mục nhà cung cấp / bên xử lý                       | `vendor-register.md`                   | Điều 19(2)(b) NĐ 356         | Nháp — cần lưu DPA     |
| Quy trình nội bộ (yêu cầu, sự cố, đồng ý, lưu trữ)      | `runbook-du-lieu-ca-nhan.md`           | Điều 5, 19(2)(c), 23 Luật    | Nháp                   |
| Chính sách công khai                                    | `src/lib/legalContent.ts` → `/privacy` | Điều 9, 13 Luật              | Đã cập nhật 12/11/2026 |

## 2. Việc phải làm trước khi nộp

1. Điền `[HỌ TÊN]`, `[ĐỊA CHỈ LIÊN HỆ]`, `[EMAIL LIÊN HỆ]` — bên kiểm soát hiện
   là **cá nhân chưa có pháp nhân**. Nếu sau này lập hộ kinh doanh/công ty thì
   cập nhật hồ sơ trong **10 ngày** (Điều 20(2) NĐ 356).
2. Đối chiếu cấu trúc báo cáo với **Mẫu số 10** (DPIA) và **Mẫu 01a/01b** (CTIA)
   trong Phụ lục Nghị định 356; chuyển nội dung sang đúng biểu mẫu.
3. Lưu bản sao điều khoản/DPA của từng nhà cung cấp trong `vendor-register.md`
   (ít nhất là ảnh chụp trang điều khoản kèm ngày truy cập).
4. Ký tên người đứng đầu (hoặc người được uỷ quyền) trên báo cáo.
5. Nộp **01 bản chính** qua Cổng thông tin quốc gia về bảo vệ dữ liệu cá nhân,
   trực tiếp hoặc qua bưu chính, tới cơ quan chuyên trách bảo vệ dữ liệu cá nhân
   (Bộ Công an; hồ sơ được phân loại và chuyển Công an tỉnh/thành phố theo địa
   bàn — Nghị quyết 22/2026/NQ-CP).
6. Lưu biên nhận nộp hồ sơ và ngày nộp trong chính tệp này.

## 3. Mốc thời gian

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

## 4. Vì sao không được dựa vào miễn trừ "quy mô nhỏ"

Điều 41 NĐ 356 miễn DPIA/CTIA và đầu mối bảo vệ dữ liệu cho hộ kinh doanh,
doanh nghiệp siêu nhỏ/nhỏ — **trừ khi** kinh doanh dịch vụ xử lý dữ liệu, xử lý
dữ liệu nhạy cảm, hoặc đạt 100.000 chủ thể.

Điều 4(l) NĐ 356 xếp **"dữ liệu theo dõi hành vi, hoạt động sử dụng dịch vụ
viễn thông, mạng xã hội, dịch vụ truyền thông trực tuyến và các dịch vụ khác
trên không gian mạng"** vào nhóm nhạy cảm. Protogon ghi hành vi vi phạm, heat,
join/leave và tín hiệu thiết bị của thành viên trên Discord — cách đọc an toàn
là thuộc nhóm này. Vì vậy hồ sơ DPIA/CTIA là **bắt buộc**, không phụ thuộc quy mô.

## 5. Nguyên tắc

- Không đưa khoá bí mật, token, IP thô hay dữ liệu cá nhân thật vào hồ sơ.
- Mọi số liệu thời hạn trong hồ sơ phải khớp code và `/privacy`; lệch là bằng
  chứng bất lợi khi bị kiểm tra.
- Hồ sơ được lưu, cập nhật định kỳ 06 tháng và cập nhật ngay trong 10 ngày khi
  có thay đổi thuộc Điều 20(2) NĐ 356.
