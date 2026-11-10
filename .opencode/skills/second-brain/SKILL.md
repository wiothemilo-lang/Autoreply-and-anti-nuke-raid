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

Ranh giới: vault không nằm trong git, không có trên VPS/CI → không bao giờ là
nguồn sự thật, không chứa secret, không chứa thứ code phụ thuộc.

## Đường dẫn

`/home/wio/Tài liệu/Obsidian Vault/protogon/`

Nếu đường dẫn không tồn tại (ví dụ đang chạy trên VPS) → bỏ qua, không tạo lại,
không coi là lỗi.

## Đọc

1. `00-index.md` — quy ước + trạng thái vault.
2. `so-do-he-thong.md` — kiến trúc, luồng cấu hình, "hỏng đâu mở đó".
3. Note mới nhất trong `phien-lam-viec/` khi tiếp tục việc dở.

Chỉ đọc khi cần định hướng hoặc khi người dùng nhắc vault. Đừng đọc cả vault
mỗi phiên — index đủ.

## Ghi

- Phiên: `phien-lam-viec/YYYY-MM-DD.md`, dùng `template/phien.md`.
- Quyết định: `quyet-dinh/YYYY-MM-DD-slug.md`, dùng `template/quyet-dinh.md`,
  rồi thêm một dòng vào `docs/decision-log.md`.
- Ý tưởng: `y-tuong/slug.md`, dùng `template/y-tuong.md`.

Cuối phiên, chưng cất đúng 3 đích: journal (5 dòng), decision-log (1 dòng mỗi
quyết định), repo-map (khi cấu trúc đổi). Phần còn lại giữ trong vault.

## Luật

- Một chiều: vault → `docs/`. Không sửa quyết định chỉ trong vault.
- Không ghi secret/token/key/nội dung `.env`.
- Không chép `docs/` vào vault; link tới file trong repo.
- Đường dẫn có dấu và khoảng trắng — quote khi dùng shell.
