# Protogon Bot — Auto Reply & Anti Nuke Raid

[![CI — Lint, Test & Deploy](https://github.com/wiothemilo-lang/Autoreply-and-anti-nuke-raid/actions/workflows/ci.yml/badge.svg)](https://github.com/wiothemilo-lang/Autoreply-and-anti-nuke-raid/actions/workflows/ci.yml)

Bot Discord tự động trả lời tin nhắn thành viên theo **từ khóa** hoặc khi bị **tag @mention** (nội dung do bạn tùy chỉnh), hỗ trợ đầy đủ **prefix (`!`) + slash commands**, kèm hệ thống **chống nuke/raid** bật tắt từng phần theo ý mod & owner — tất cả quản lý qua một **dashboard web** tùy chỉnh.

> **Chất lượng**: 87 CJS + 22 TS test suites · coverage c8 (94,6% dòng / 97,3% hàm / 79,8% nhánh — toàn bộ engine chống nuke + alt detection + ticket + lớp dẫn log được phủ test trực tiếp, **không còn file nào dưới 80%**, **sàn coverage theo file** chặn engine bảo vệ tụt) · **mutation score 100%** (`bun run test:mutation`) · property-based + fuzz test · **memGuard sweeper bộ nhớ tập trung** · ESLint sạch · typecheck sạch · smoke test VPS · CI 4 job (lint + security + test → deploy): gitleaks chặn secret lộ, bun audit chặn CVE critical (`bun run test` để chạy local).
>
> **Hệ sinh thái**: threat relay liên server (chia sẻ signature raid ẩn danh, opt-in từng chiều) · preset bảo mật 1 chạm (server nhỏ / cộng đồng / rủi ro cao) — bật trên dashboard, tab Chống nuke.

## Kiến trúc

```
┌─────────────────────────┐      ┌──────────────────────┐
│  Dashboard web (React)  │◄────►│  Convex (backend + DB)│
│  - OAuth Discord (PKCE) │      │  - cấu hình mỗi guild │
│  - auto reply / antinuke│      │  - autoReplies, modules│
│  - prefix, roles, log   │      │  - sessions, botStatus│
└─────────────────────────┘      └──────────▲───────────┘
                                             │ HTTP (ConvexHttpClient)
                                 ┌───────────┴───────────┐
                                 │  Bot Discord (discord.js)│
                                 │  - prefix + slash cmds  │
                                 │  - auto reply matcher    │
                                 │  - anti-nuke engine      │
                                 └─────────────────────────┘
```

- **Dashboard** (thư mục gốc): React + Vite + Tailwind + Convex. Đăng nhập bằng Discord (OAuth authorization code + PKCE; Convex trao đổi server-side, browser không giữ Discord access token), chọn server, cấu hình mọi thứ.
- **Bot** (`bot/`): process Node.js standalone chạy 24/7 (máy bạn hoặc hosting). Đọc/ghi cấu hình qua Convex — dashboard và bot luôn đồng bộ trong ~1 phút.
- **Backend** (`convex/`): schema + query/mutation. Mọi ghi dữ liệu từ dashboard được kiểm tra quyền _Manage Guild_ (xác thực qua Discord OAuth); bot dùng các mutation riêng `bot-writes:*` bảo vệ bằng deploy key.

## Bắt đầu

### 1. Tạo ứng dụng Discord

1. Vào [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. Tab **Bot** → bật **Presence**, **Server Members**, **Message Content** intent → **Reset Token** để lấy `BOT_TOKEN`.
3. Lưu **Application ID** (Client ID).

### 2. Cấu hình dashboard (Freebuff)

Điền vào mục **API Keys** của dự án:

| Key                           | Giá trị                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| `DISCORD_CLIENT_ID`           | Application ID ở bước 1 (khuyến nghị; nếu thiếu, Convex dùng ID bot đã bootstrap đã xác minh) |
| `CONVEX_URL` (production)     | URL deployment `.convex.cloud` — bắt buộc cho build, set qua `freebuff-deploy env set`        |
| `OAUTH_REDIRECT_URI` (Convex) | Đúng URL callback, ví dụ `https://dashboard.example.com/discord/callback` — bắt buộc          |

Chạy preview → **Đăng nhập với Discord** → dán redirect URI `https://<địa chỉ preview>/discord/callback` vào ứng dụng Discord (_OAuth2 → Redirects_) **và** đặt cùng URL đó cho Convex bằng `OAUTH_REDIRECT_URI` (hoặc `DASHBOARD_URL` gốc, không có dấu `/` cuối). Hai danh sách phải khớp chính xác; với bản local thêm `http://localhost:5173/discord/callback` và biến tương ứng.

### 3. Chạy bot

Xem hướng dẫn chi tiết tại [`bot/README.md`](bot/README.md). Tóm tắt:

```bash
cd bot
bun install
bun run start
```

**Không có máy/VPS để chạy bot?** → Dùng **Wispbyte miễn phí** (wispbyte.com — cloud chuyên host bot Discord, không cần thẻ, bot chạy 24/7 không ngủ, chỉ cần đăng nhập panel 1 lần/2 tuần): `cd bot && npm install && npm run pack:host` rồi upload `protogon-bot.zip` theo hướng dẫn trong [`bot/README.md`](bot/README.md) → mục “Chạy bot MIỄN PHÍ trên Wispbyte”.

**Bot trên cloud cần Convex backend công khai?** → Hướng dẫn deploy Convex Cloud miễn phí (`npx convex login` + `npx convex deploy`, lấy URL + Deploy Key): xem [`bot/README.md`](bot/README.md) → mục “Deploy Convex backend lên cloud miễn phí”.

Bot tự đăng ký slash commands và đồng bộ server/kênh/role lên Convex mỗi 60 giây.

### 4. Mời bot & quản lý

- Nhấn **Mời bot** trong dashboard (hoặc dùng link invite tạo từ `DISCORD_CLIENT_ID`).
- Vào server → tab **Auto Reply**: tạo rule từ khóa / @mention với nội dung tùy chỉnh, cooldown, giới hạn kênh.
- Tab **Anti Nuke**: bật tắt toàn bộ hoặc từng module, chỉnh ngưỡng & hình thức xử lý, role miễn trừ.
- Tab **Ticket & Khiếu nại**: bật tính năng, chọn danh mục chứa kênh ticket + role xử lý, đặt hạn mức chống spam, **tự định nghĩa danh sách loại ticket** (nhãn/emoji/câu hỏi/ô nhập bổ sung/role riêng/thứ tự), và xem/dóng ticket.
- Tab **Cài đặt**: prefix, kênh log, role Mod/Admin.
- Tab **Backup server**: bấm **Backup ngay** hoặc bật **tự động backup định kỳ** (2–30 ngày) — bot đẩy backup lên GitHub của chủ bot, chỉ giữ 3 bản mới nhất trong bot.
- Hoặc quản lý trực tiếp trong Discord bằng `!autoreply`, `!antinuke`, `!backup`, `/setup`…

## Tính năng chính

- 🤖 **Auto reply**: kích hoạt bằng từ khóa hoặc tag bot; placeholder `{user}` (tag người nhắn), `{username}`; cooldown chống spam; giới hạn theo kênh.
- 🛡️ **Chống nuke/raid**: **24 module chống nuke + 8 module auto-mod = 32 module** (ban/kick/join/channel/role/message/spam + biến thể: xóa thread, đổi tên/quyền kênh, sửa role, tự cấp quyền quản trị, gán role/biệt danh hàng loạt, emoji/sticker, bot add, tạo invite, đổi cấu hình server, bot hit-and-run…), phát hiện qua audit log, xử lý cảnh báo → tạm khóa → kick → ban, **tự động khóa kênh khi raid**, cảnh báo real-time tới kênh log, role Mod/Admin + whitelist được miễn trừ. Kèm **báo cáo hoạt động chống nuke hàng ngày** gửi vào kênh log.
- 🧰 **Auto-moderation — 8 module**: spam, mass message, blank noise, mention, badword, attachment, invite, malware — lọc nội dung độc hại theo nhiệt độ vi phạm (warn → timeout → kick → ban).
  ★ **Cổng bật riêng, không dính chống nuke**: tab Auto-mod có công tắc tổng **riêng** (`automodEnabled`). Trước đây tắt "Chống nuke" là mất luôn bộ lọc link mời/link độc hại/file .exe mà không ai báo — nay hai cổng tách bạch, tắt cổng nào cũng có dải cảnh báo đỏ ngay trên panel.
- 🎫 **Ticket & Khiếu nại (Kênh riêng cho từng người)**: mỗi lượt mở tạo **một kênh riêng** thay vì nhắn ở kênh chung — `@everyone` bị chặn ngay từ đầu, chỉ người mở + role staff nhìn thấy. Có **2 điểm vào**: nút _Mở khiếu nại_ trong **DM gửi kèo sau khi ban** (dành cho người bị ban — họ không gõ được lệnh trong server), và lệnh `/ticket` cho thành viên đang ở trong server. Trong kênh có 6 nút trong 2 hàng: **Đóng**, **Đóng kèm lý do** (bắt buộc — cả staff lẫn người mở đều thấy), **Nhận việc** (chỉ **1 người** nhận — người sau bị từ chối, tránh 3 mod cùng trả lời), **Gỡ ban** (đi qua `unbanMember` nên vòng đo phạt nhầm tự chạy), **Ghim**, **Ghi chú AI**. Hàng rào chống spam: trần số ticket đang mở, thời gian chờ giữa 2 lượt, và giới hạn 500 kênh của Discord. Chủ server đặt hạn mức, role xử lý, danh mục chứa ticket, loại mặc định, ghi chú khi đóng, **thời gian tự đóng**, **nội dung panel** và **role được tag** ở dashboard → tab **Ticket & Khiếu nại**.
- 🏷️ **Loại ticket tuỳ chỉnh (thay 2 loại cứng)**: trước đây bot chỉ có đúng **2 loại cứng** `support` | `appeal` nằm thẳng trong code — muốn thêm nút thì phải sửa bot. Nay mỗi loại là **1 dòng dữ liệu** chủ server tự tạo trên dashboard: **tên + emoji** trên nút, **câu hỏi riêng** trong modal (kèm gợi ý ô nhập), **role xử lý riêng** (kế toán riêng khác CS hỗ trợ), **thứ tự hiển thị** và **bật/tắt** tạm mà không xoá. Panel tự chia hàng 5 nút, tối đa 10 loại. Server nào chưa cấu hình gì thì bot dùng y hệt 2 loại cũ — **không migration, không đụng server đang chạy**.
- 📝 **Bộ câu hỏi tuỳ chỉnh theo loại**: mỗi loại thêm tối đa **3 ô nhập riêng** trong modal (tiêu đề ô, gợi ý nhập, đánh dấu **bắt buộc**, chọn ô **nhiều dòng**) — ví dụ loại "Hoá đơn" hỏi thêm _Số tiền_ và _Mã đơn_. Ô bắt buộc bỏ trống thì bot chặn ngay, không tạo kênh rỗng rồi mới báo lỗi. Câu trả lời hiện trong **embed kênh ticket** và trên **danh sách ticket** ở dashboard, lưu kèm tiêu đề ô nên 3 tháng sau vẫn biết ô đó hỏi cái gì. Trần **3 ô** là do Discord chỉ nhận 5 ô 1 modal — vượt trần là API từ chối **cả modal**, người dùng bấm nút xong không thấy gì.
  ★ **Tự đóng + dọn kênh**: kênh ticket không ai chat quá hạn số giờ chủ server đặt (mặc định 24h, tắt được bằng 0) sẽ tự đóng; đóng đủ số giờ nữa (mặc định 24h) bot **lưu toàn bộ nội dung vào storage rồi mới xoá kênh** — không bao giờ xoá trước khi lưu. Có người chat trong kênh thì đồng hồ tự đóng lùi lại. Đây là cơ chế bảo vệ trần 500 kênh Discord mà server đã dùng tích năng ticket sẽ dẫn tới.
  ★ **Đa ngôn ngữ**: mọi việc viết theo ngôn ngữ **của người gõ** (locale client Discord), không phải locale server. `/language` để ghim lựa chọn; lệnh **chạy được cả trong server lẫn trong DM** để người bị ban đổi được (họ không vào được kênh nào). Hỗ trợ **VI / EN / DE**.
- 🧠 **Threat Intel — bot tự học**: tải tin an ninh công khai (Reddit security, CISA KEV) **mỗi giờ** (0 token), học từ khóa scam mới dùng miễn phí trong bộ lọc link độc hại; AI tổng hợp ≤ 1 lần/tuần. Theo dõi + học thủ công qua `/research status|learn|history` và `!research`, xem tiến độ trên dashboard → Admin.
- 🎓 **AI chống raid được rèn luyện đa lớp** (không cần fine-tune): nạp **bằng chứng engine** (trùng lặp nội dung, link rút gọn/@everyone, tuổi acc, avatar, tên app giả mạo) vào prompt để AI đối chiếu dữ liệu thật thay vì đoán chay · parse JSON cứng hoá (fence/phẩy thừa/lời bình đều đọc được) · **hiệu chỉnh tin cậy** khi khớp mẫu scam đã học (0 token) · **chống lái prompt** (sanitize mẫu tin giả dạng chỉ dẫn) · **verdict cache 90s** + rate guard 30 lượt/phút bảo vệ hạn mức · timeout đồng bộ 6.5s giữa fallback chain và tầng race · **test hermetic 19 case** khoá toàn bộ hành vi.
- 🚨 **Báo cáo khẩn `/report` + `!report`**: khi có raid/nuke hoặc bot phạt nhầm thành viên, AI (Mimu v2.5) dò hàng trăm tin nhắn gần nhất + dữ liệu phạt để hiểu tình huống và công bố báo cáo rõ ràng cho cả server; mod ghi chú thêm bối cảnh; dashboard có nút bật/tắt cảnh báo khẩn + ping @everyone.
- 🎯 **Raid Intel — thu thập dữ liệu + săn nguồn cơn raid**: bot tự ghi **mẫu dữ liệu huấn luyện** cho mỗi vụ raid/nuke (module, cụm tài khoản, AI verdict); bot + AI phân tích cụm (acc chủ mưu, avatar/username trùng nhau, người tạo invite, kẻ phá hoại trong audit log) để tìm **kẻ đứng sau raid rồi tự ban** — bật/tắt từng phần trên dashboard → Chống nuke/raid → Raid Intel.
- 📱 **Chống raid bằng ứng dụng ngoài (External App Guard)**: phát hiện tấn công bằng **external app / integration** thay vì bot thành viên — đội quân sockpuppet cài app ồ ạt, app giả mạo app nổi tiếng / tên chứa từ khóa scam (nitro/giveaway/boost/free...), app spam @everyone + link mời/link rút gọn/lừa đảo, lặp nội dung giống hệt hoặc **gần giống** (đổi số/emoji/URL để né filter), webhook spam. **AI học hỏi cách raid này và chặn cả biến thể tương tự**: raid → xóa tin/webhook + ban + khóa kênh; còn lại → kick theo cấu hình. Xem danh sách vụ bị chặn (ai, app gì, lúc nào) trên dashboard → Chống nuke/raid → Raid bằng ứng dụng ngoài.
- 📩 **DM khẩn cho owner — 2 loại tín hiệu tách cooldown**: (1) _server đang bị tấn công_ và (2) _người có quyền quản lý đang phá_ (bot cố ý không phạt owner/admin/whitelist để tránh phạt oan, nhưng hành vi nuke vẫng phải báo — kẻ có quyền xoá được cả kênh log, DM là kênh duy nhất không xoá được từ trong server). Mọi tầng chống nuke đều nối chung một cơ chế này, kể cả đường raid bằng ứng dụng ngoài và nút bấm.
- 📒 **Log kiểu Carl-bot, gộp 2 luồng** (Cài đặt → Kênh log): 🛡️ **Anti nuke/raid** → kênh log chung · ⚙️ **Auto-mod + lệnh thủ công của mod/owner** (ban/timeout/kick/warn/gỡ hình phạt/purge/xóa tin) → **gộp chung 1 kênh log hành động mod** (chưa đặt → kênh log chung), mỗi embed hiển thị `Offender` / `Reason` / `Responsible moderator` + `case N` tăng dần: bot tự động để tên bot, mod dùng lệnh để tên mod, lý do trống ghi **“không có lý do”**.
- ⌨️ **Prefix + slash**: `!help !ping !prefix !autoreply !antinuke !heat !badword !setlog !backup !report !research`, `/ticket mo|khieunai|dong`, `/language` và tương đương `/…` (kèm `/backup now|list|restore|auto` để tạo/liệt kê/khôi phục + tự động backup định kỳ server ngay trong Discord).
- ♻️ **Tùy chỉnh khôi phục (Backup server → Tùy chỉnh khôi phục)**: bật/tắt từng phần **role** và **emoji/sticker** khi bot khôi phục — đồng bộ bot ↔ web, áp dụng cho **cả backup Protogon lẫn file backup của bot nuke** (.msc/.json tải lên). Phần tắt sẽ được bỏ qua khi restore; kênh, tin nhắn + media vẫn xử lý bình thường.
- 🖥️ **Dashboard**: server list, tổng quan, quản lý rule, chống nuke, cài đặt — áp dụng tự động sau ~1 phút.

## Kiểm thử & Coverage

```bash
bun run test            # chạy tất cả suite CJS (~1 phút, song song; --serial để chạy tuần tự; thoát khác 0 nếu fail)
bun run test:ts         # chạy suite TypeScript
bun run test:coverage   # chạy test + đo coverage (báo cáo HTML tại coverage/)
bun run smoke:vps       # smoke test VPS (env + module + Convex + Discord login)
bash scripts/update-vps-findings.sh   # sinh bản ghi findings VPS (chỉ chạy trên VPS, output docs/vps-audit-YYYY-MM-DD.md — không commit, dùng để trace resource / bot heap / proxy / dấu hiệu DDoS theo thời gian)
```

Coverage được đo bằng [`c8`](https://github.com/bcoe/c8) (V8 native, không phải đo giả): mỗi dòng/hàm/nhánh của `bot/src` bị đánh dấu **đã chạy qua hay chưa** trong lúc test. Con số hiện tại:

| Chỉ số          | Giá trị | Ý nghĩa                                                    |
| --------------- | ------- | ---------------------------------------------------------- |
| Dòng            | 94,6%   | phần lớn dòng `bot/src` được test chạm tới                 |
| Hàm             | 97,3%   | 97% hàm được **gọi thật** (không chỉ import)               |
| Nhánh (if/else) | 79,8%   | cả hai phía true/false của phần lớn điều kiện đã được kiểm |

**Bản đồ nhiệt theo file** (phần quan trọng nhất — sinh từ `coverage/coverage-summary.json`, 56 file):

- ✅ **≥ 90% — 49/56 file** (đều có sàn theo file trong `scripts/check-coverage-floor.cjs`): `caseLog`, `misfire`, `register-slash`, `util`, `handlers/dailyReport`, `handlers/hidden`, `handlers/researchCommands`, `handlers/ticketActivity`, `handlers/antinuke/enforce`, `handlers/antinuke/index`, `handlers/antinuke/nukeRollback` (100%), `ticketCore` (99,9%), `antinuke/shared` (99,6%), `channelLock` (99,5%), `localSnapshot` (99,2%), `lockdown` (99,1%), `handlers/tickets` (99%), `handlers/welcome` (98,7%), `antinuke/ownerAlert` (98,4%), `antinuke/members` (98%), `incidentReport` (97,9%), `handlers/healthWatch` (97,8%), `antinuke/messages` (97,5%), `handlers/messageCreate` (97,2%), `antinuke/ai` (97%), `backupUtils` (96,9%), `handlers/guildSync` (96,9%), `memGuard` (96,7%), `moduleActions` (96,6%), `flaggedMessages` (96,5%), **`handlers/backup` (95,8%)**, `externalAppGuard` (95,9%), `handlers/joinGate` (95,8%), `handlers/interactionCreate` (95,5%), `antinuke/raidIntel` (95%), `handlers/ticketJobs` (94,8%), `antinuke/audit` (94,3%), `logDedupe` (94%), `convex` (93,8%), `handlers/filters` (93,4%), `handlers/selfDiagnose` (92,8%), `heat` (92,6%), `antinuke/state` (92%), `tick` (92%), `antinuke/externalApp` (91,6%), `handlers/lang` (90,7%), `handlers/modTools` (90,5%), `webhookHub` (90,3%), `relayClient` (90%) — **toàn bộ engine chống nuke + alt detection + ticket + lớp dẫn log được phủ test trực tiếp**, đúng chỗ xử lý mọi vụ nuke thật.
- ⚠️ **80–90% — 7 file**: `handlers/welcomeCard` (89,5%), `threatEngine` (89%), `antinuke/vandalBudget` (88,3%), `backupAudit` (88,2%), `actionBudget` (85,1%), `research` (82,7%), `altDetection` (82%) — luồng chính có test nhưng còn nhánh hiếm gặp chưa phủ.
- ✅ **Không còn file nào dưới 80%**: entry-point `antinuke/index` (nối cổng gateway Discord) từng chỉ 13,9%, nay đã có bộ test orchestrator riêng (43 check) nên lên 100%. Phần kết nối gateway thật vẫn kiểm bằng `bun run smoke:vps` trên VPS.

> **Giới hạn cần biết**: c8 chỉ đo được code chạy dưới V8 — 21 suite `.ts` chạy bằng **Bun** nên **không** xuất hiện trong báo cáo (đó là giới hạn ĐO, không phải giới hạn TEST; ví dụ `test-welcome-card.ts` vẫn kiểm thẻ ảnh rất kỹ, và `test-welcome-card-render.cjs` chạy dưới node để c8 thấy). Dashboard `src/` và `convex/` hiện **chưa** được đo — đó là hạn chế của chuỗi c8+Bun, chưa phải lỗi cấu hình.

**Chống regress bằng ngưỡng**: `.c8rc.json` đặt ngưỡng tối thiểu (lines 58 / functions 65 / branches 50) — nếu code mới làm rớt coverage xuống dưới ngưỡng, `bun run test:coverage` thất bại, chặn regress trước khi commit.

Coverage **không phải điểm số để đẹp**: nó chỉ ra chính xác nơi thiếu test. Ví dụ: bộ test alt detection viết trong đợt này vừa chạy vừa bắt được **bug thật** — `usernameSimilarity` trả 100 cho 2 tên ngắn giống hệt nhau ("mai"/"mai") trước khi chạm guard 5 ký tự → `scanGuildForAlts` ghép oan 2 người lạ trùng tên ngắn phổ biến. Đã vá ngay + assertion chặn tái diễn.

**Xác minh trên VPS thật**: CI chỉ đảm bảo logic đúng trong môi trường test; môi trường thật (env, mạng, quyền Discord) được kiểm bằng `bun run smoke:vps` — check Node ≥ 18, biến môi trường bắt buộc, nạp sạch 14 module lõi (bắt lỗi import mà test không thấy), ping Convex, login Discord. Chạy sau mỗi lần `git pull` trên VPS. Checklist xác minh từng kịch bản tấn công trên server phụ: `scripts/smoke-checklist.md`.

## Lint, Format & Dependencies

```bash
bun run lint            # ESLint — chặn bug tĩnh trước cả khi chạy test
bun run lint:fix        # tự sửa những gì sửa được
bun run format          # Prettier — format toàn repo
bun run format:check    # CI dùng lệnh này để chặn code chưa format
```

**ESLint là lá chắn thứ hai (sau typecheck, trước test).** Rule `no-undef` trên phần bot CommonJS chặn chính xác loại bug nguy hiểm nhất với bot runtime: **gọi biến/hàm chưa import** — crash xảy ra đúng lúc raid thật xảy ra, ngay cả khi test vẫn xanh (test không đụng nhánh đó). Bằng chứng ngay ngày cấu hình: `no-undef` bắt được **3 bug crash thật** (biến `reason`/`channel`/`store` không tồn tại trong `antinuke/audit.js`, `hidden.js`, `research.js` — tàn dư của đợt tách file) và 1 **bug biến che khuất hàm cùng tên** trong `backup.js` (`pushToGithub` boolean option đè hàm `pushToGithub` — mọi backup đẩy GitHub sẽ TypeError).

**Dependabot** (`.github/dependabot.yml`) quét weekly: root `bun`, `bot/` (discord.js, convex) và `github-actions` — tự tạo PR cập nhật, group các bump minor/patch thành 1 PR. Bot bảo mật không được để deps cũ.

**Thứ tự gate trong CI**: `lint` (ESLint + Prettier + check repo-map/hợp đồng bot⇄Convex/đa ngôn ngữ) → `test` (87 CJS + 22 TS suites + coverage + typecheck) → `deploy` Convex production. Job sau chỉ chạy khi job trước pass.

## AI coding agent trên VPS (OpenCode)

Cài môi trường + agent bảo trì bot ngay trên server (chạy bằng user thường, không cần root):

```bash
sh ./scripts/setup-vps-agent.sh   # cài Bun + OpenCode + cấu hình an toàn
opencode                          # mở TUI Ở GỐC REPO (KHÔNG cd vào bot/ — xem lưu ý dưới)
```

> ⚠️ **Mở agent ở GỐC repo, KHÔNG `cd bot && opencode`.** `bot/` không phải git repo
> riêng và không có `AGENTS.md`/`.opencode/` của riêng nó: mở trong đó agent mất hợp
> đồng 5 pha lẫn các lệnh `/verify` `/fix` `/ship`, còn `git`/`bun run test` chỉ nhìn
> thấy phạm vi `bot/` (dễ commit thiếu file phía `convex/`). Muốn nhờ agent sửa bot thì
> mở ở gốc rồi yêu cầu đích danh — ví dụ _“sửa `bot/src/handlers/…`”_. Nếu bạn vẫn mở
> trong `bot/`, agent sẽ tự đọc `bot/AGENTS.md` để được trỏ về hợp đồng đầy đủ.

Bộ cấu hình an toàn đi kèm repo:

- **`opencode.json`** — permission: chặn đọc `.env`/`.bot-key`/key files, **cho phép agent `git add`/`commit`/`push`** (chỉ sau khi kiểm chứng xanh — xem `AGENTS.md`), **cấm `git reset`/`clean`/`rebase`** (không sửa lịch sử), cấm lệnh phá hoại (`rm -rf`, `sudo`, `dd`…), cho sẵn các lệnh test/lint/typecheck của repo.
- **`AGENTS.md`** — quy tắc ứng xử: chạy `bun run test` + typecheck sau mỗi thay đổi, không bỏ qua `requireBotKeyStrict`, không sửa `convex/_generated/`, kèm test chặn tái diễn khi vá bug.

> 🔐 **Siết an ninh VPS + giả lập tấn công + trỏ Freebuff CLI đúng tệp**: xem [`docs/vps-security-hardening.md`](docs/vps-security-hardening.md) — bảng bề mặt tấn công, công cụ mô phỏng `bun scripts/simulate-attack.ts`, và playbook debug VPS + bot.

> ⚠️ VPS chứa secret trong `.env` — snapshot/backup VPS trước khi nhờ agent sửa hàng loạt, và luôn review `git diff` trước khi commit.

## Phát triển

```bash
bun install
bun convex dev --once   # codegen + chạy Convex local (http://127.0.0.1:3210)
bun run dev             # Vite dev server
bun tsc -b --noEmit     # typecheck
```

> Lưu ý: bot process không chạy trong môi trường preview (hosting tĩnh). Chạy `bot/` trên máy/VPS của bạn.
