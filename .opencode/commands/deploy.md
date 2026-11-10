---
description: Cập nhật bot trên VPS về commit mới nhất — pull → kiểm chứng đủ bộ → pm2 restart protogon-bot → xác minh sống
agent: build
---

Người dùng muốn cập nhật bot chạy trên VPS về code mới nhất từ repo. Đây là luồng
deploy production — đi ĐỦ các bước theo thứ tự, không nhảy cóc, không bỏ kiểm
chứng. Convex backend được deploy ngay trong lệnh này nếu pull mang theo thay
đổi `convex/` (xem bước 4) — song song đó CI (GitHub Actions) cũng tự
`npx convex deploy` sau mỗi push lên `main`, hai đường không xung đột (Convex
push-idempotent: deploy cùng commit 2 lần chỉ ghi nhận, không phá dữ liệu).

## Các bước bắt buộc (đúng thứ tự)

1. **Đồng bộ code mới nhất** (luôn dùng `--no-rebase --no-edit` — repo này có 2
   nguồn đẩy: VPS và Freebuff, rebase sẽ viết lại lịch sử):

   ```bash
   git pull --no-rebase --no-edit
   ```

   Gặp CONFLICT → DỪNG, báo cáo file xung đột, không tự giải — hỏi người dùng.

2. **Cài dependency nếu lockfile đổi** (so sánh `bun.lock` trước/sau pull; không
   đổi → bỏ qua bước này):

   ```bash
   bun install --frozen-lockfile
   ```

3. **Kiểm chứng đủ 4 lớp** — tất cả phải XANH, chưa xanh thì SỬA trước khi tiếp:

   ```bash
   bun run test && bun run typecheck && bun run lint && bun run format:check
   ```

   Format lệch → chạy `bun run format` rồi kiểm tra lại (biến đổi tất-định, tự
   sửa được). Test đỏ → xử lý như bug thật theo AGENTS.md, deploy bị hoãn.

4. **Deploy Convex nếu pull có thay đổi backend** — kiểm tra trước:

   ```bash
   git diff --name-only HEAD@{1} HEAD -- convex/ | head -1
   ```

   Có dòng trả về (pull mang file `convex/` mới) → deploy:

   ```bash
   npx convex deploy
   ```

   Lệnh cần biến môi trường `CONVEX_DEPLOY_KEY` đã export trong shell VPS (setup
   1 lần, xem `docs/opencode-vps-guide.md` → "Deploy Convex từ VPS"). Báo thiếu
   key → DỪNG, nhờ người dùng export rồi chạy lại lệnh — không dán key vào chat,
   không ghi key vào file trong repo. Không có thay đổi `convex/` → bỏ qua bước
   này (không deploy thừa).

5. **Restart bot** — bước này được phép tự làm vì đã qua cổng kiểm chứng ở bước 3
   (guardrail chỉ mở khi cả 4 lớp xanh trong 15 phút gần nhất):

   ```bash
   pm2 restart protogon-bot
   ```

6. **Xác minh bot sống** — bắt buộc, không restart là xong đâu:

   ```bash
   pm2 status
   ```

   → `protogon-bot` phải `online`, `↺` (số lần restart) không tăng liên tục.

   ```bash
   pm2 logs protogon-bot --lines 30 --nostream
   ```

   → thấy log đăng nhập Discord bình thường (không có `Error` lặp / crash loop).
   Bot chết lại ngay sau restart → xem log tìm nguyên nhân, vá rồi quay lại
   bước 3 — không lặp mù `pm2 restart`.

## Rào cản (theo AGENTS.md điều khoản 3)

- Được: `git pull`, `bun install` theo lockfile, kiểm chứng, `pm2 restart protogon-bot`,
  `npx convex deploy` (chỉ khi có thay đổi `convex/`).
- Hỏi trước (vùng 🟡): `pm2 delete`, đổi file ecosystem, đụng dịch vụ khác.
- Cấm (vùng 🔴): đọc `.env`/`bot/.bot-key`, `pm2 startup/system`, `reboot`, in giá
  trị `CONVEX_DEPLOY_KEY` ra chat/log/file trong repo.

## Báo cáo cuối

Gộp thành bảng ngắn: commit mới về | kết quả 4 lớp kiểm chứng | Convex đã deploy
hay bỏ qua (vì sao) | trạng thái `pm2 status` | dấu hiệu sống trong log. Có vấn
đề → nói rõ bước nào hỏng + kế hoạch sửa, không tự tung biện pháp ngoài kịch bản.
