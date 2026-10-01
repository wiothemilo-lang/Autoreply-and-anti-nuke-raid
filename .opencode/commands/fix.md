---
description: "Sửa bug: gốc rễ → vá → test chặn tái diễn (đúng quy trình)"
agent: build
---

Nhận mô tả lỗi: $ARGUMENTS

Xử lý bug theo đúng quy trình AGENTS.md (nhánh 🐛 Bug thật), không lệch bước:

1. **Tái hiện**: chạy test/tình huống tái hiện lỗi trước khi sửa — chưa tái
   hiện được thì chưa được vá. Lỗi môi trường (thiếu deps) thì chạy
   `bun install` rồi thử lại, báo rõ.
2. **Tìm gốc rễ**: đọc code liên quan (grep/tìm kiếm, không đọc cả file lớn),
   giải thích được TẠI SAO lỗi xảy ra — không chỉ "ở đâu".
3. **Lập todo** nếu việc cần hơn 2 bước thao tác, làm từng mục một.
4. **Vá**: thay đổi nhỏ nhất đúng chỗ, giữ phong cách tiếng Việt của repo.
5. **Test chặn tái diễn**: bug thuộc engine đã có test (antinuke, altDetection,
   heat, joinGate, backup, oauth client id…) → thêm test đúng chỗ cạnh test cũ,
   chạy lại toàn bộ `bun run test` phải xanh toàn bộ suites (
   xem AGENTS.md Pha 4).
6. **Kiểm chứng đủ**: `bun tsc -b --noEmit` + `bun run lint`.
7. **Báo cáo**: gốc rễ → bản vá → kết quả số → rồi mới commit (KHÔNG push).

Yêu cầu mơ hồ thì dừng và hỏi thay vì đoán.
