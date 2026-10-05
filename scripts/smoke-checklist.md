# ✅ Checklist xác minh Protogon trên SERVER PHỤ

> Mục đích: xác minh **toàn bộ luồng bảo vệ hoạt động thật** sau khi deploy — làm đúng thứ tự,
> tick từng mục. Mọi luồng ĐÚNG đều hiện sự kiện trên web dashboard (event feed + case log).
> Làm trên **server phụ** (server thật không phải nơi test).

## Bước 0 — Chuẩn bị (5 phút)

- [ ] `cd /protogon && git pull` — code mới nhất
- [ ] `node scripts/smoke-vps.cjs` — **SMOKE TEST phải PASS 100%** (env, 14 module, Convex, Discord login)
  - Mục tiêu: **7 PASS, 0 FAIL**
  - `❌` ở nhánh "Biến môi trường" → bot chưa đọc được `bot/.env`
  - `❌ Discord login — Cannot find module 'discord.js'` → script chưa resolve được dep của bot, KHÔNG phải thiếu `bun install`
- [ ] `pm2 restart protogon-bot && pm2 logs protogon-bot --lines 30` — không có error loop
- [ ] Mở web dashboard → server phụ xuất hiện trong danh sách, bot hiển thị **Online**

## Bước 1 — Discord Portal (làm 1 lần)

- [ ] Tab **Bot**: bật **SERVER MEMBERS INTENT** (không bật = massJoin/alt/hit-and-run mù)
- [ ] Tab **Bot**: bật **MESSAGE CONTENT INTENT** (không bật = auto-mod spam mù)
- [ ] PRESENCE INTENT: tắt (bot không dùng)
- [ ] OAuth2 URL: scopes `bot` + `applications.commands`; quyền Manage Roles/Channels/Webhooks/Guild, Ban/Kick/Moderate, View Audit Log, Manage Messages (hoặc Administrator)

## Bước 2 — Thiết lập cơ bản trên server phụ

- [ ] `/setup log` → chỉ định kênh log (mọi embed báo động đổ về đây)
- [ ] `/antinuke enable` → bật hệ thống chống nuke (mặc định mọi module **TẮT**, bật từng cái theo nhu cầu hoặc bật tổng)
- [ ] Dashboard: kiểm tra nút bật/tắt từng module hoạt động — bật module `massBan` + `massChannelDelete` + `spam` + `massJoin` cho đợt test này

## Bước 3 — Bắn từng kịch bản tấn công (mỗi kịch bản ~2 phút)

### Kịch bản A — Mass ban (nuke cấu trúc)

- [ ] Acc phụ (KHÔNG phải owner, không whitelist, có quyền Ban) ban 3 acc phụ khác
- [ ] **Mong đợi**: bot ban NGAY thủ phạm + embed case vào kênh log + event `massBan` trên dashboard
- [ ] Lặp lại nhưng bằng **owner** → **Mong đợi**: bot IM LẶNG (owner exempt — luồng vừa vá)
- [ ] Lặp lại nhưng để **Carl-bot** thực hiện → **Mong đợi**: bot im lặng (bot logging hợp pháp)

### Kịch bản B — Bot lạ + hit-and-run

- [ ] Invite 1 bot lạ (không tick xác minh) → **Mong đợi**: embed "👁️ Bot lạ mới vào server" (KHÔNG phạt)
- [ ] Cho bot đó tự rời trong 30 phút → **Mong đợi**: embed hit-and-run + xử lý người добав bot (theo cấu hình)
- [ ] Cho bot bị mod kick thủ công → **Mong đợi**: KHÔNG tính là hit-and-run

### Kịch bản C — Spam flood

- [ ] 1 acc phụ gửi 6 tin dồn dập (< 10s) → **Mong đợi**: DM cảnh báo lần đầu (heat), xóa tin
- [ ] Spam tiếp nhiều đợt → heat tăng → timeout/kick theo bậc
- [ ] 8 acc phụ gửi CÙNG nội dung có link mời → **Mong đợi**: AI xác nhận raid → ban + khóa kênh toàn server + embed khẩn
- [ ] `/antinuke unlock` hoặc chờ hết hạn → kênh mở lại, embed "🔓 Đã mở khóa"

### Kịch bản D — Mass join (raid thành viên)

- [ ] Cho 6 acc mới (acc < 7 ngày, không avatar) vào trong 10s → **Mong đợi**: xử lý acc đáng ngờ, event `massJoin`
- [ ] Cho 5 người THẬT (acc cũ, có avatar) vào → **Mong đợi**: chỉ ghi nhận "hồ sơ bình thường — bỏ qua", không ai bị phạt
- [ ] Cho 1 người thật lẫn trong 6 acc mới → **Mong đợi**: người thật được bỏ qua, chỉ acc đáng ngờ bị xử lý

### Kịch bản E — External app

- [ ] Connect 1 app lạ có tên scam ("Free Nitro Generator"…) → **Mong đợi**: cảnh báo khẩn + tự kick app
- [ ] Connect app hợp pháp (YouTube/Twitch) → **Mong đợi**: bỏ qua hoàn toàn

### Kịch bản F — Alt detection (nếu bật)

- [ ] Acc mới tạo username gần hệt 1 member đang có (vd `vanghinhano2`) → **Mong đợi**: risk cao, xử lý theo cấu hình
- [ ] Acc bị kick quay lại bằng tên/avatar tương tự → **Mong đợi**: "matches_previously_punished_account" → xử lý mạnh hơn
- [ ] Người thật tên VN phổ biến (vd `tranvanphuoc` vs `tranvanphu`) → **Mong đợi**: chỉ theo dõi (monitor), KHÔNG phạt

### Kịch bản G — Backup & khôi phục

- [ ] Dashboard → Backup → "Tạo backup" → bản backup xuất hiện, nén + đẩy GitHub (nếu cấu hình)
- [ ] "Khôi phục vào server này" trỏ vào SERVER PHỤ → **Mong đợi**: role (đúng thứ tự + màu + quyền) → category → kênh + overwrite được tạo lại
- [ ] Kiểm tra 2-3 role/kênh trọng yếu sau khôi phục — so với bản gốc

## Bước 4 — Kiểm tra web dashboard đồng bộ

- [ ] Mọi kịch bản trên đều có event tương ứng trong event feed (thời gian khớp)
- [ ] Case log hiển thị đúng offender + reason + moderator (bot tự động = tên bot)
- [ ] Thông số server (member count, uptime bot…) cập nhật đúng

## Bước 5 — Sau khi PASS toàn bộ

- [ ] Tắt các module test không cần trên server phụ (hoặc giữ làm môi trường demo)
- [ ] Ghi lại ngày xác minh vào cuối file này

---

### Lịch sử xác minh

| Ngày | Người | Server | Kết quả |
| ---- | ----- | ------ | ------- |
|      |       |        |         |
