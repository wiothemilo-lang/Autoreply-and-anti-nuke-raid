---
name: second-brain
description: Use when the user mentions an Obsidian vault, "bộ não thứ hai", "ghi chú", "ý tưởng", "brainstorm", "nháp", or asks where to keep long-form notes/architecture sketches; also use at session start to read the vault index and the latest session note. The vault is a thinking space, NOT a source of truth — decisions must still be distilled into docs/decision-log.md and docs/agent-journal.md.
---

# Second Brain (Obsidian vault)

## Overview

Repo đã có ba nơi nhớ: `docs/repo-map.md` (cấu trúc), `docs/decision-log.md`
(vì sao), `docs/agent-journal.md` (đang dở). Cả ba đều là bản **đã chưng cất**.
Vault là nơi **nghĩ trước khi chưng cất**: nháp dài, so sánh phương án, câu hỏi
mở, ghi chú xuyên dự án.

Ranh giới: vault nằm trong working tree tại `second-brain/` nhưng bị loại khỏi
git (`.gitignore` + `.git/info/exclude`) → không có trên VPS/CI, không bao giờ
là nguồn sự thật, không chứa secret, không chứa thứ code phụ thuộc.

## Đường dẫn

`/home/wio/Protogon/second-brain/` (Obsidian mở repo `/home/wio/Protogon`
làm vault; `second-brain/` là thư mục ghi chú).

Nếu đường dẫn không tồn tại (ví dụ đang chạy trên VPS) → bỏ qua, không tạo lại,
không coi là lỗi.

## Ưu tiên MCP

Nếu có MCP server `obsidian` (plugin Local REST API with MCP) → dùng tool thay
vì đọc file:

| Việc               | Tool                                               |
| ------------------ | -------------------------------------------------- |
| Liệt kê thư mục    | `obsidian.vault_list`                              |
| Đọc note           | `obsidian.vault_read`                              |
| Ghi/overwrite      | `obsidian.vault_write`                             |
| Sửa một đoạn       | `obsidian.vault_patch`                             |
| Nối cuối file      | `obsidian.vault_append`                            |
| Tìm kiếm           | `obsidian.search_simple` / `obsidian.search_query` |
| Di chuyển/đổi tên  | `obsidian.vault_move`                              |
| Đang mở file nào   | `obsidian.active_file_get_path`                    |
| Chạy lệnh Obsidian | `obsidian.command_execute`                         |

Đường dẫn trong tool tính từ **vault root** (`/home/wio/Protogon`), nên note
phải ghi `second-brain/...`. Không có MCP → dùng đường dẫn filesystem bên trên.
Cài đặt cho agent khác: `docs/obsidian-mcp.md`.

## Đọc

1. `00-index.md` — quy ước + trạng thái vault.
2. `so-do-he-thong.md` — kiến trúc, luồng cấu hình, "hỏng đâu mở đó".
3. Note mới nhất trong `phien-lam-viec/` khi tiếp tục việc dở.
4. `hoi-thoai/00-index.md` khi cần lại bối cảnh một cuộc trò chuyện cũ.

Chỉ đọc khi cần định hướng hoặc khi người dùng nhắc vault. Đừng đọc cả vault
mỗi phiên — index đủ.

## Ghi

- Phiên: `phien-lam-viec/YYYY-MM-DD.md`, dùng `template/phien.md`.
- Quyết định: `quyet-dinh/YYYY-MM-DD-slug.md`, dùng `template/quyet-dinh.md`,
  rồi thêm một dòng vào `docs/decision-log.md`.
- Ý tưởng: `y-tuong/slug.md`, dùng `template/y-tuong.md`.
- Hội thoại: `hoi-thoai/YYYY-MM-DD-HHMM-slug.md`, dùng `template/hoi-thoai.md`
  (chi tiết ở skill `chat-archive`).

Cuối phiên, chưng cất đúng 3 đích: journal (5 dòng), decision-log (1 dòng mỗi
quyết định), repo-map (khi cấu trúc đổi). Phần còn lại giữ trong vault.

## Luật

- Một chiều: vault → `docs/`. Không sửa quyết định chỉ trong vault.
- Không ghi secret/token/key/nội dung `.env`.
- Không chép `docs/` vào vault; link tới file trong repo.
- Đường dẫn có dấu và khoảng trắng — quote khi dùng shell.
