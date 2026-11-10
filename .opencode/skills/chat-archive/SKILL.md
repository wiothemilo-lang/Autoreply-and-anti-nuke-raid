---
name: chat-archive
description: Use when the user asks to save or archive a conversation/chat into the Obsidian vault ("lưu cuộc trò chuyện", "archive chat", "tổng kết phiên", "bộ não thứ hai"), or to bulk-archive past T3 threads. Reads thread messages with t3_thread_read, writes a dated note with summary, decisions, open questions and links, updates hoi-thoai/00-index.md, and distills decisions into docs/decision-log.md. Never stores secrets.
---

# Chat Archive (lưu hội thoại vào vault)

## Overview

Cuộc trò chuyện là nơi quyết định ra đời, nhưng T3/OpenCode không phải nơi đọc
lại lâu dài: thread trôi, subagent rối, không link được vào ghi chú khác. Vault
giữ bản đọc lại trong 5 phút: bối cảnh, đã chốt, đã làm, còn mở.

Vault là nơi nghĩ; `docs/` trong repo vẫn là nguồn sự thật. Note hội thoại
KHÔNG thay thế `docs/decision-log.md` hay `docs/agent-journal.md`.

## Đường dẫn

`/home/wio/Tài liệu/Obsidian Vault/protogon/hoi-thoai/`

Nếu đường dẫn không tồn tại (đang chạy trên VPS) → bỏ qua, không tạo lại.

## Lưu một cuộc trò chuyện

1. Xác định thread: thread hiện tại, hoặc id người dùng đưa. Liệt kê bằng
   `t3_thread_list`; bỏ qua thread có `parentThreadId` (đó là subagent).
2. Đọc nội dung bằng `t3_thread_read` (`messages`).
3. Tóm tắt theo `template/hoi-thoai.md`:
   - **Bối cảnh** — vì sao mở cuộc trò chuyện, 1–3 câu.
   - **Đã chốt** — quyết định, kèm vì sao 1 câu.
   - **Đã làm** — file, commit, PR kèm link.
   - **Phát hiện** — gốc rễ, số liệu, bẫy.
   - **Câu hỏi mở** — việc chưa quyết.
   - **Liên kết** — wiki link tới note liên quan.
4. Đặt tên `YYYY-MM-DD-HHMM-slug.md` (giờ local, slug không dấu).
5. Thêm một dòng vào `hoi-thoai/00-index.md` (mới nhất trên cùng).
6. Chưng cất: quyết định → một dòng `docs/decision-log.md`; việc đã làm/dở →
   `docs/agent-journal.md`.

## Lưu hàng loạt

- `t3_thread_list` lấy hết (phân trang bằng `cursor`), chỉ lấy thread gốc.
- Ưu tiên thread có quyết định/PR; bỏ thread hỏi đáp ngắn.
- Hỏi trước khi lưu hơn 10 thread. Mỗi note vẫn phải đọc và tóm tắt, không
  chép máy móc.

## Không lưu

- Secret, token, key, giá trị `.env`, nội dung file secret.
- Toàn bộ transcript mặc định. Nếu người dùng yêu cầu raw: để trong
  `hoi-thoai/raw/` và ghi rõ "raw, chưa kiểm chứng".
- Suy đoán như sự thật: việc chưa chạy kiểm chứng phải ghi "chưa kiểm chứng".

## Ranh giới

- Note hội thoại là bản đọc lại, không phải nguồn sự thật.
- Vault không có trên VPS/CI → đừng để code/CI phụ thuộc vào nó.
- Đường dẫn có dấu và khoảng trắng — quote khi dùng shell.
