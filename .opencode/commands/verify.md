---
description: Chạy đủ bộ kiểm chứng (test + typecheck + lint) — ranh giới "xong việc"
agent: build
---

Đây là lệnh xác minh bắt buộc trước khi coi bất kỳ đơn vị công việc nào là XONG
(theo AGENTS.md Pha 4). Thực hiện theo đúng thứ tự, không bỏ bước:

1. `bun run test` — toàn bộ test suites phải xanh (số lượng: xem AGENTS.md — runner tự kiểm khớp). Nếu đỏ: đọc kỹ lỗi,
   xác định đây là bug thật hay lỗi môi trường (thiếu node_modules → chạy
   `bun install` trước), KHÔNG vá bừa cho hết đỏ.
2. `bun tsc -b --noEmit` — typecheck phải sạch. Nếu vừa đụng file trong
   `convex/` mà chưa codegen, chạy `bun convex dev --once` rồi typecheck lại.
3. `bun run lint` — ESLint phải sạch.
4. `bun run format:check` — format Prettier phải sạch (CI đã đỏ 5 run vì bước
   này bị quên). Lệch format → chạy `bun run format` rồi kiểm tra lại; đây là
   biến đổi tất-định nên được phép tự sửa, nhưng phải báo rõ "đã format lại N
   file" trong kết quả.

Báo cáo kết quả dạng số: `X/<tổng> suites · typecheck OK/LỖI · lint OK/LỖI ·
format OK/LỖI`. Có lỗi thì liệt kê từng lỗi + nguyên nhân gốc rễ + cách vá đề
xuất, KHÔNG tự vá khi chưa được yêu cầu (riêng format được tự sửa như trên).
KHÔNG commit trong lệnh này — chỉ xác minh và báo.
