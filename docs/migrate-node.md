# Runbook chuyển bot sang VPS node mới

> Dùng khi node cũ sắp hết hạn/bị thu hồi (ví dụ provider dừng gói) hoặc cần
> đổi nhà cung cấp. Mục tiêu: bot online lại trên node mới **mà không mất
> session Discord**, không quên secret, và có cách quay về nếu lỗi.
>
> Tài liệu này mở rộng `bot/VPS-DEPLOY.md` (cài lần đầu). Cutover node là
> chuyện khác cài lần đầu ở một chỗ: **giữ token Discord chỉ chạy đúng 1
> process** — 2 bot song song sẽ giành session, reconnect lặp.

## Nguyên tắc cứng

1. **Secret mang TAY, không qua agent.** Agent không được đọc `.env`,
   `bot/.bot-key`, `*.pem`/`*.key` (điều khoản #1 trong `AGENTS.md`). Chủ bot
   tự copy giá trị giữa 2 node. Agent chỉ liệt kê được **tên key** cần mang.
2. **Không chạy 2 bot cùng lúc.** Thứ tự luôn là: kiểm chứng node mới tới
   bước trước khi login → **stop node cũ** → start node mới → xác minh.
3. **Mọi thứ không nằm trong node không phải mang.** Convex là cloud (CI tự
   `npx convex deploy` sau push), dashboard chạy trên hosting Freebuff,
   backup nằm trên Convex storage + GitHub. Node mới chỉ chạy bot +
   `kiira-retry-proxy`.

## Pha 0 — Trên node cũ: lập danh sách mang theo (5 phút)

Chủ bot tự làm, không cần agent:

| Cần mang                                        | Ở đâu trên node cũ                  | Ghi chú                                              |
| ----------------------------------------------- | ----------------------------------- | ---------------------------------------------------- |
| `DISCORD_TOKEN`                                 | `bot/.env`                          | Dính chặt session — không đổi token trong lúc chuyển |
| `CONVEX_URL`                                    | `bot/.env`                          | Deployment production hiện tại                       |
| `OWNER_SEED`                                    | `bot/.env`                          | Seed tính `botKey` — mất là bot mất quyền mutation   |
| `KIRA_API_KEY` / `KIRA_BASE_URL` / `KIRA_MODEL` | `bot/.env`                          | Provider AI chính qua retry-proxy                    |
| Bất kỳ key khác trong `bot/.env`                | `bot/.env`                          | Soi từng dòng, chép đủ                               |
| `pm2 save` đã chạy chưa                         | `pm2 status` + `ls ~/.pm2/dump.pm2` | Node mới phải bật lại như C mục dưới                 |

Kiểm tra nhanh node cũ còn thiếu gì: chạy `free -h` + `df -h` trước khi ngắt
để có baseline RAM/disk so sánh sau chuyển.

## Pha 1 — Trên node mới: cài môi trường (15 phút)

```bash
# 1. Cài hệ thống + Node 20 + PM2 + Bun + swap (script root có sẵn trong repo)
sudo bash bot/scripts/vps-setup.sh

# 2. Lấy code
git clone https://github.com/wiothemilo-lang/Autoreply-and-anti-nuke-raid.git protogon
cd protogon

# 3. Cài đúng lockfile (không phải cài dependency mới — theo lockfile)
cd bot && bun install --frozen-lockfile

# 4. (Tùy chọn) Cài OpenCode + AGENTS.md để bảo trì ngay trên node mới
sh ./scripts/setup-vps-agent.sh
```

## Pha 2 — Cấu hình + kiểm chứng OFFLINE (chưa login Discord)

1. Chủ bot tự tạo `bot/.env` với các key ở Pha 0 (paste tay vào `nano bot/.env`).
2. Cài `kiira-retry-proxy` (bot gọi AI qua nó):

   ```bash
   sudo cp scripts/kiira-retry-proxy.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now kiira-retry-proxy
   # Bắt buộc thấy "ok":true mới coi là xong
   curl -s http://127.0.0.1:8787/__health
   ```

3. Smoke test — kiểm tra env đủ, module load được, **Discord login thành công**:

   ```bash
   bun run smoke:vps
   ```

   Lệnh này login Discord thật → chỉ chạy khi đã sẵn sàng cutover. Nếu chỉ
   muốn kiểm tra không login, dừng ở `bun run test` + `bun tsc -b --noEmit`.

## Pha 3 — Cutover (khoảng 1 phút downtime)

```bash
# 1. Node CŨ — dừng bot (một người chạy lệnh này là đủ)
pm2 stop protogon-bot

# 2. Node MỚI — start
cd protogon/bot
pm2 start ecosystem.config.js
pm2 save && pm2 startup   # sống lại sau reboot
```

⚠️ `pm2 stop` trên node cũ nằm vùng **🟡 HỎI TRƯỚC** theo `AGENTS.md` — agent
in lệnh cho chủ bot tự chạy, không tự stop.

## Pha 4 — Xác minh sau cutover (bắt buộc, không bỏ qua)

| Kiểm tra         | Cách                                    | Đạt khi                                             |
| ---------------- | --------------------------------------- | --------------------------------------------------- |
| Process sống     | `pm2 status`                            | `protogon-bot` state `online`, uptime tăng đều      |
| Không crash loop | `pm2 logs protogon-bot --lines 50`      | Không lặp lỗi restart < 10s                         |
| Heartbeat        | Mở `/monitor` trên dashboard            | Bot "online", mốc heartbeat < 2 phút                |
| AI sống          | Gửi thử 1 tin nhắn tag bot trong server | Bot trả lời (đi qua retry-proxy)                    |
| Sync guild       | Mở `/dashboard`                         | Danh sách server hiện đúng, cấu hình không biến mất |
| Tài nguyên       | `free -h` + `df -h`                     | RAM/disk tương đương baseline Pha 0                 |

## Rollback

Nếu node mới lỗi sau cutover: `pm2 stop protogon-bot` trên node mới →
`pm2 start protogon-bot` trên node cũ (bot cũ vẫn giữ code + env nguyên vẹn —
đừng xoá node cũ trước khi node mới sống ổn ít nhất 24 giờ). Discord cho phép
login lại bằng token cũ bình thường.

## Checklist tóm tắt

- [ ] Pha 0: chép tay đủ secret từ `bot/.env`, `pm2 save` node cũ, ghi baseline RAM/disk
- [ ] Pha 1: `vps-setup.sh` → clone → `bun install --frozen-lockfile`
- [ ] Pha 2: `bot/.env` tay → `kiira-retry-proxy` + health `ok:true` → `bun run smoke:vps` xanh
- [ ] Pha 3: stop cũ → start mới → `pm2 save` + `pm2 startup`
- [ ] Pha 4: 6 hạng mục xác minh trên bảng đều đạt
- [ ] 24 giờ ổn định → mới dọn node cũ
