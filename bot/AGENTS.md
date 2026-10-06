# AGENTS.md (`bot/`) — CON TRỎ, không phải hợp đồng đầy đủ

Bạn đang ở trong `bot/`. Hợp đồng làm việc **ĐẦY ĐỦ** nằm ở **`../AGENTS.md`** —
đọc nó TRƯỚC khi làm bất cứ việc gì.

> Vì sao có file này: agent mở trong `bot/` chỉ thấy file này. Không có nó, agent
> tưởng "không có luật nào" → bỏ qua 5 pha, bỏ kiểm chứng, dễ đụng vùng 🔴
> (`ufw`/`iptables`, `systemctl cat/show`, `printenv`…) mà `../AGENTS.md` cấm.

## 3 điều bắt buộc khi làm việc trong `bot/`

1. **Đọc `../AGENTS.md`** — 5 pha, điều khoản cứng, 3 vùng quyền hạ tầng, danh
   sách kiểm chứng Pha 4. File đó là nguồn sự thật duy nhất.
2. **Mọi lệnh `git` chạy từ GỐC repo.** `bot/` KHÔNG phải git repo riêng — nó
   thuộc repo gốc. Chạy `git` trong `bot/` chỉ nhìn thấy phạm vi `bot/`, nên dễ
   commit **thiếu** file phía `convex/` khi thay đổi chạm hợp đồng bot ⇄ Convex.
   Luôn `cd ..` rồi mới `git add` / `commit` / `push`.
3. **Mọi lệnh kiểm chứng chạy từ GỐC repo.** `bun run test`, `bun run test:ts`,
   `bun tsc -b --noEmit`, `bun run lint`, `bun run format:check`,
   `node scripts/check-convex-contract.cjs`, `node scripts/smoke-vps.cjs`… là
   script của `package.json` ở **gốc**; chạy trong `bot/` sẽ sai hoặc không tồn tại.

## Riêng của thư mục này

- Cài đặt độc lập: `cd bot && bun install` (có `bot/package.json` + `bot/bun.lock` riêng).
- Lệnh vận hành bot nằm trong `bot/package.json`: `bun run start`, `bun run register`,
  `bun run pack:host`.
- Thẻ ảnh chào cần `@napi-rs/canvas` + font nhúng `bot/assets/fonts/NotoSans-Regular.ttf`
  — thiếu thì bot **không vỡ**, chỉ lùi về embed thường (xem `../AGENTS.md` mục 4).

## Đọc thêm

`bot/README.md` · `bot/VPS-DEPLOY.md` · `../docs/vps-security-hardening.md` ·
`../docs/opencode-vps-guide.md` · `../scripts/smoke-checklist.md`
