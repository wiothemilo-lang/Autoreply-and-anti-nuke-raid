# Tăng cường an ninh VPS + bot & giả lập tấn công

> Dành cho chủ bot Protogon. Trả lời hai câu hỏi: **(1)** làm sao "giả lập kẻ tấn
> công" một cách an toàn để kiểm tra phòng thủ, và **(2)** trỏ **Freebuff CLI**
> đúng tệp của repo này để nó tăng cường an ninh VPS + debug lỗi VPS và bot.
>
> Đọc kèm: [`docs/opencode-vps-guide.md`](./opencode-vps-guide.md) (cài agent,
> Kiira, `/health`, `/deploy`, 3 vùng quyền) và [`AGENTS.md`](../AGENTS.md)
> (hợp đồng làm việc — mọi agent đọc file này khi mở trong repo).

---

## 1. Bề mặt tấn công & chốt phòng thủ đã có sẵn

Không cần đoán "hệ thống có chống được DDoS không" — mỗi lớp phòng thủ dưới đây
đã nằm trong repo **kèm test chứng minh**. Cột cuối là lệnh bạn tự chạy để thấy nó
hoạt động.

| Lớp                            | Kẻ tấn công làm gì                                                    | Chốt phòng thủ (tệp)                                                                                                   | Bằng chứng (lệnh)                          |
| ------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Web tĩnh (dashboard)           | Chèn script lạ, clickjacking, dò MIME                                 | CSP + security headers — `scripts/security-headers.cjs` (chèn qua `scripts/build.mjs`)                                 | `node scripts/test-web-contracts.cjs`      |
| Convex action **public**       | Spam `publicConfig` / `aiStatus` / `/geo_lang` để đốt usage free tier | Trần mỗi danh tính **+ trần toàn cục** — `convex/rateGuard.ts`; trần mỗi IP **+ toàn cục** — `convex/geoGuard.ts`      | `bun scripts/test-rate-guard.ts`           |
| Đăng nhập / refresh OAuth      | Brute-force login, spam đổi mới phiên                                 | `checkLoginRateLimit` (20 lượt/phút) — `convex/sessionAuth.ts`; phiên — `convex/sessionHardening.ts`, `convex/auth.ts` | `bun run test:ts`                          |
| Giả mạo bot để đọc dữ liệu     | Gọi `botGetPending` / `getBotConfig` với botKey giả                   | `requireBotKeyStrict` — `convex/botAuth.ts` (KHÔNG còn đường back-compat)                                              | `node scripts/test-security-hardening.cjs` |
| Bot: raid / spam / mass-join   | Flood tin, đăng app ngoài để lừa, kéo hàng loạt acc                   | `bot/src/externalAppGuard.js` + `bot/src/handlers/antinuke/*` (heat, joinGate, alt)                                    | `node scripts/test-external-app-guard.cjs` |
| VPS: đốt RAM / treo tiến trình | Tích lũy state trong RAM cho tới khi bot chết                         | `bot/src/memGuard.js` + `bot/src/sweeper.js` (dọn tập trung, KHÔNG timer rời)                                          | `node scripts/test-resource-guard.cjs`     |
| Lộ secret trong git            | Commit lộ token/key                                                   | gitleaks (job `security` trong CI) + `bun audit` chặn CVE critical                                                     | CI (GitHub Actions)                        |

> Điểm mấu chốt: các trần rate-limit là **in-memory** (sống trong 1 instance) — đủ
> chặn scripted burst và botnet phân tán ở mức thực tế, **không phải** giải pháp
> chống DDoS tầng mạng. DDoS tầng mạng (SYN flood, làm ngập băng thông) phải xử lý
> ở **nhà cung cấp VPS / Cloudflare**, không phải trong code repo. Xem mục 5.

---

## 2. Giả lập tấn công (an toàn — KHÔNG bắn lưu lượng thật)

### 2.1. Offline, chạy trên chính hàm phòng thủ thật (khuyến nghị)

```bash
bun scripts/simulate-attack.ts
```

Công cụ gọi **trực tiếp** `convex/rateGuard`, `convex/geoGuard`,
`bot/src/externalAppGuard`, `src/lib/authRoute` — mô phỏng vòng lặp tấn công y như
kẻ xấu làm, **không mở socket, không gửi request ra ngoài, không đọc secret**. Kết
quả in ra bảng:

```
Kịch bản tấn công                                  Lượt   Cho qua   Chặn từ   Kết
Flood 1 danh tính → publicConfig                   400       30       31   ✅  trần per-identity 30/phút
Botnet xoay danh tính → publicConfig              5000      600      601   ✅  trần toàn cục 600/phút chặn botnet phân tán
Flood 1 IP → /geo_lang                             200       20       21   ✅  trần per-IP 20/phút
Botnet nhiều IP → /geo_lang                       2000      300      301   ✅  trần toàn cục 300/phút
Dò cửa hậu botKey                                    6        6        —   ✅  mọi hàm nhạy cảm dùng requireBotKeyStrict
Flood tin qua app ngoài → bot                        4        2        2   ✅  phát hiện từ tin thứ 2
Ép vòng lặp /auth (phiên còn sống)                   7        4        —   ✅  chặn mọi đích tự-quay-lại
IP nội bộ / rác không tới upstream                   8        8        —   ✅  chỉ IP công cộng được gọi
```

Thoát `0` khi mọi chốt giữ vững, `1` khi có chốt bị xuyên thủng → dùng được làm
cổng kiểm tra tay. (Đã **red-proof**: tắt trần toàn cục và để rỗng danh sách chặn
`/auth` → công cụ báo đúng 2 chốt ❌ và thoát `1`.)

### 2.2. Chạy từng bộ test phòng thủ như "báo cáo"

```bash
bun scripts/test-rate-guard.ts            # rate/geo guard: per-identity, per-IP, botnet, no-throw
node scripts/test-external-app-guard.cjs  # bot: flood tin app ngoài, click flood
node scripts/test-security-hardening.cjs  # botKey strict, không cửa hậu
node scripts/test-resource-guard.cjs      # memGuard dọn RAM, fail-open
```

### 2.3. Thăm dò LIVE — chỉ nhắm hạ tầng CỦA BẠN, có rào

Muốn xác nhận trần thật chạy trên deployment, tự chạy một lượt **giới hạn** nhắm
**đúng URL Convex của bạn** (lấy từ dashboard Convex), rồi kiểm tra cờ
`rateLimited`:

```bash
# 40 lượt, cách nhau 0.2s — nhẹ, chỉ để THẤY trần bật. KHÔNG tăng số lượng.
URL="https://<deployment-cua-ban>.convex.cloud/api/query"
for i in $(seq 1 40); do curl -s -o /dev/null -w "%{http_code}\n" "$URL"; sleep 0.2; done
```

Endpoint `publicConfig` (xem `convex/public.ts`) trả kèm cờ `rateLimited: true` khi
vượt trần — đó là **bằng chứng phòng thủ đang bật**, không phải lỗi. Nếu 40 lượt
đều OK và không bao giờ thấy `rateLimited` khi tăng nhẹ, mới cần điều tra.

> ⚠️ **Ranh giới đỏ — không vượt:**
>
> - **Chỉ** nhắm hạ tầng của chính bạn. Bắn vào hệ thống người khác là hành vi tấn
>   công, kể cả khi "chỉ để test".
> - **Không** dùng công cụ DDoS/load-test nặng (hping, LOIC, ab -n lớn…) vào
>   production — có thể làm VPS hết RAM, bot ngắt kết nối Discord và mất dữ liệu
>   người dùng thật.
> - **Không** bắn từ VPS vào chính VPS: bạn tự làm nghẽn máy đang chạy bot.
> - Agent **bị cấm** (`AGENTS.md` điều khoản 3, vùng 🔴) đụng `ufw`/`iptables` —
>   mọi lệnh tường lửa ở mục 5 là **bạn tự chạy**.

---

## 3. Trỏ Freebuff CLI đúng tệp của repo này

### 3.1. Cài & chạy ĐÚNG thư mục (điểm quan trọng nhất)

```bash
npm i -g freebuff          # cài CLI (npm có sẵn trên VPS)
cd /root/Autoreply-and-anti-nuke-raid   # PHẢI đứng ở GỐC repo
freebuff                   # lần đầu in link đăng nhập → mở trên máy có trình duyệt
```

**Vì sao phải đứng ở gốc repo:** Freebuff CLI (và OpenCode) đọc `AGENTS.md` ở thư
mục hiện tại — đó là **hợp đồng 5 pha** (hiểu → lập kế hoạch → thực hiện → kiểm
chứng → báo cáo), danh sách lệnh kiểm chứng bắt buộc, và **3 vùng quyền hạ tầng**
🟢/🟡/🔴. Chạy ở thư mục khác (`/root`, `/tmp`) là agent **không** thấy hợp đồng →
hành xử tự do, dễ chạm vào vùng cấm.

**Kể cả khi chỉ sửa mỗi `bot/`** — vẫn mở Freebuff CLI ở **gốc repo** rồi yêu cầu
đích danh tệp trong `bot/`. `bot/` **không phải git repo riêng**: mọi lệnh
`git add/commit/push` chỉ đúng khi chạy từ gốc (chạy trong `bot/` chỉ thấy phạm vi
`bot/`). Nếu bạn lỡ mở trong `bot/`, agent sẽ đọc `bot/AGENTS.md` và tự được trỏ về
`../AGENTS.md` — nhưng gốc repo vẫn là chỗ đúng.

Kiểm tra nhanh sau khi mở: hỏi

```
Đọc AGENTS.md và tóm tắt 5 pha + 3 vùng quyền hạ tầng.
```

Trả lời đúng = đã nạp hợp đồng. (Nếu chạy trong repo nhưng nó bảo không thấy
`AGENTS.md` → bạn đang ở sai thư mục — `pwd` để kiểm tra.)

### 3.2. Bảng "việc → tệp cần chỉ cho agent"

Cách hiệu quả nhất là **chỉ đích danh tệp** trong câu lệnh. Agent tự tìm phần còn
lại, nhưng tệp dưới đây là "điểm vào" đúng và tiết kiệm token.

| Việc cần làm                 | Chỉ agent đọc/đụng                                                                                    | Lệnh kiểm chứng bắt buộc                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Rà & siết an ninh VPS        | `AGENTS.md` (điều khoản 3), `docs/vps-security-hardening.md` (tệp này), `scripts/smoke-vps.cjs`       | `node scripts/smoke-vps.cjs`                   |
| Debug bot crash trên VPS     | `bot/src/index.js` + log `pm2 logs protogon-bot --lines 50 --nostream`; `bot/src/handlers/antinuke/*` | `node scripts/smoke-vps.cjs` (7 PASS, 0 FAIL)  |
| Debug lỗi gọi Convex của bot | `scripts/check-convex-contract.cjs` (hợp đồng tên hàm bot ⇄ Convex)                                   | `node scripts/check-convex-contract.cjs`       |
| Bot không phản hồi / AI hỏng | `convex/haimiya.ts` (`aiStatus`, `aiProviders`), `bot/src/ai.js`                                      | `node scripts/check-ai-status.cjs --self-test` |
| Thẻ ảnh chào không vẽ        | `bot/src/handlers/welcomeCard.js` + `bot/assets/fonts/`                                               | `bun run test:ts`                              |
| Vá lỗi dashboard/web         | `src/pages/*`, `src/lib/*`, `src/components/*`                                                        | `bun tsc -b --noEmit && bun run lint`          |
| Vá lỗi backend Convex        | `convex/*.ts` (KHÔNG sửa `convex/_generated/`)                                                        | `bun convex dev --once && bun tsc -b --noEmit` |
| Quét lỗ hổng bảo mật sâu     | `.opencode/skills/security-audit/` (skill tự kích hoạt khi nói "security audit")                      | — (chạy trên bản clone, xem §3.4)              |

### 3.3. Mẫu prompt cho Freebuff CLI (dán thẳng)

**A. Siết an ninh VPS (chỉ chẩn đoán trước, không tự đổi gì):**

```
Đọc AGENTS.md và docs/vps-security-hardening.md. Chạy chẩn đoán read-only trên VPS
(3 vùng quyền trong AGENTS.md điều khoản 3): disk, RAM, load, pm2 status
protogon-bot, proxy kiira __health. KHÔNG đụng ufw/iptables/systemctl cat.
Báo cáo bảng: vấn đề → mức độ (🟢/🟡/🔴) → lệnh đề xuất. Chưa sửa gì cả.
```

**B. Debug bot trên VPS:**

```
Bot Protogon crash loop trên VPS. Đọc AGENTS.md, rồi tìm gốc rễ bằng:
node scripts/smoke-vps.cjs và pm2 logs protogon-bot --lines 50 --nostream.
Sửa gốc rễ (không che lỗi), thêm test chặn tái diễn, chạy đủ bộ kiểm chứng Pha 4
trong AGENTS.md rồi báo cáo. Không restart bot cho tới khi test xanh.
```

**C. Rà phòng thủ chống DDoS:**

```
Chạy bun scripts/simulate-attack.ts và giải thích từng dòng bảng. Đối chiếu với
các tệp phòng thủ thật (convex/rateGuard.ts, convex/geoGuard.ts,
bot/src/externalAppGuard.js) và chỉ ra chốt nào là in-memory (không chống được
DDoS tầng mạng). Đề xuất bổ sung ở tầng VPS/nhà cung cấp nếu cần.
```

### 3.4. Quy tắc an toàn khi dùng Freebuff CLI (bắt buộc)

1. **Tuyệt đối không dán secret** (`.env`, Discord token, `bot/.bot-key`, key
   Kiira/Convex) vào chat — nội dung có thể được dùng để huấn luyện AI. Đúng nguyên
   tắc điều khoản 1 trong `AGENTS.md`.
2. **Chạy thử ở `/root/freebuff-lab`** (bản clone) trước khi giao việc lên repo
   production. Riêng **security-audit** 6 pha luôn chạy trên bản clone — tốn token
   lớn (nhiều sub-agent song song).
3. **Luôn `git diff` review** trước khi để agent commit. Guardrail của agent chặn
   đọc secret, nhưng mắt người vẫn là lớp cuối.
4. Trial có **giới hạn session** — dành cho việc khó thật, đừng đốt vào việc
   DeepSeek/OpenCode làm được.

---

## 4. Playbook debug VPS + bot (theo 3 vùng quyền)

### 4.1. 🟢 Agent tự chạy (chẩn đoán read-only)

```bash
systemctl status kiira-retry-proxy      # proxy AI còn sống?
journalctl -u kiira-retry-proxy -n 50   # log proxy
curl -s http://127.0.0.1:8787/__health  # {"ok":true,...} = proxy khoẻ
docker ps && docker logs --tail 50 <id> # container nào đang chạy / log
df -h                                   # còn chỗ đĩa không (đầy = bot chết)
free -m                                 # RAM còn bao nhiêu
ps aux --sort=-%mem | head              # tiến trình ngốn RAM nhất
du -sh /root/Autoreply-and-anti-nuke-raid # repo chiếm bao nhiêu
uptime                                  # load average
```

### 4.2. 🟡 Phải hỏi trước khi agent làm

`pm2 restart/stop/delete protogon-bot`, `docker restart/stop`, `kill <pid>`, sửa
unit file của dịch vụ khác. Agent **in đúng lệnh + nguyên nhân**, bạn tự chạy (hoặc
gật "ok").

### 4.3. 🔴 Không bao giờ (kể cả "để debug")

`systemctl cat/show` (unit chứa `Environment=` token), `docker inspect/exec/cp`,
`/proc/*/environ`, `printenv`, `ufw`/`iptables`, `reboot`/`shutdown`,
`docker system/volume prune`.

### 4.4. Bảng lỗi thường gặp (bot + VPS)

| Triệu chứng                                 | Nguyên nhân                                                               | Xử lý                                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `pm2 status` báo bot `errored`/loop restart | Thiếu env, module nạp lỗi, Convex không tới được                          | `node scripts/smoke-vps.cjs` → xem mục ❌; sửa rồi mới `pm2 restart`                                           |
| Bot chạy nhưng AI không trả lời             | `AI_API_KEY` sai / hết hạn (Kiira/Groq); xem `aiStatus`                   | `node scripts/check-ai-status.cjs --self-test`; kiểm tra key trong `bot/.env`                                  |
| Thẻ ảnh chào không vẽ                       | Thiếu `@napi-rs/canvas` hoặc font `bot/assets/fonts/NotoSans-Regular.ttf` | `bun install` trong `bot/`; bot tự lùi về embed thường + báo qua `reportCardCapability`                        |
| `npx convex deploy` báo chưa xác thực       | Thiếu `CONVEX_DEPLOY_KEY` trong shell VPS                                 | Người dùng `export` key vào `~/.bashrc` — agent DỪNG chờ, không in key ra                                      |
| Bot gọi Convex lỗi tên hàm                  | Đổi tên function mà quên 1 phía                                           | `node scripts/check-convex-contract.cjs`                                                                       |
| `df -h` gần đầy                             | Log pm2 / backup phình                                                    | `pm2 flush`; dọn backup cũ; xem `du -sh`                                                                       |
| Port `8787` bận                             | 2 proxy chạy song song                                                    | `tmux kill-session -t kiira 2>/dev/null \|\| true` rồi `systemctl restart kiira-retry-proxy` → kiểm `__health` |
| `git pull` "divergent branches"             | VPS có commit riêng, GitHub cũng có commit mới                            | `git push origin main` → `git pull --no-rebase` → `git config pull.rebase false`                               |
| `git push` "key marked as read only"        | Deploy key chưa bật ghi                                                   | GitHub → repo → Settings → Deploy keys → tick **Allow write access**                                           |

---

## 5. Checklist hardening VPS — **bạn tự chạy** (agent bị cấm đụng 🔴)

Đây là phần "tăng cường an ninh" mà **không** nằm trong tay agent — chạy bằng SSH
trực tiếp:

- [ ] **SSH**: chỉ dùng key (`PasswordAuthentication no`), `PermitRootLogin no`,
      cân nhắc đổi port. Test ở phiên thứ hai **trước khi** đóng phiên hiện tại.
- [ ] **Tường lửa**: `ufw default deny incoming`, `ufw default allow outgoing`,
      `ufw allow 22/tcp` (+ 80/443 nếu cần), rồi `ufw enable`.
- [ ] **fail2ban**: cài + bật cho `sshd` (chặn brute-force SSH).
- [ ] **Docker**: KHÔNG publish cổng ra `0.0.0.0` trừ khi cần; ưu tiên `127.0.0.1:<port>:<port>`.
- [ ] **Secret**: `chmod 600 bot/.env`; không commit `.env`/`.bot-key` (đã gitignore — kiểm tra lại).
- [ ] **DDoS tầng mạng**: bật bảo vệ phía nhà cung cấp (Cloudflare proxy / DDoS
      protection của VPS). Code repo chỉ chống được tầng ứng dụng (mục 1).
- [ ] **Xoay token định kỳ**: Discord token, Kiira/Convex key khi nghi lộ.
- [ ] **pm2 startup**: `pm2 startup` + `pm2 save` để bot tự dậy sau reboot.
- [ ] **Backup**: bật backup định kỳ (dashboard → Backup) và **thử khôi phục** một
      lần để biết còn dùng được.
- [ ] **Update**: `apt-get update && apt-get upgrade` định kỳ; `bun update` cho deps.

---

## 6. Nếu bị tấn công thật — thứ tự xử lý

1. **Xác nhận**: `df -h`, `free -m`, `uptime`, `curl __health`, `pm2 status` —
   phân biệt tắc tầng mạng (VPS/nhà cung cấp) với tấn công tầng ứng dụng.
2. **Cô lập nếu cần**: nhờ nhà cung cấp bật lọc, hoặc tạm đổi cổng, chặn dải IP
   (bạn tự chạy, agent không đụng tường lửa).
3. **Thu log**: `journalctl`, `pm2 logs --nostream`, `docker logs` — **trước khi**
   restart để không mất bằng chứng.
4. **Xoay secret** nghi bị lộ (Discord token, Kiira/Convex key) và cập nhật `.env`.
5. **Khôi phục** từ backup nếu dữ liệu hỏng; đối chiếu dashboard event feed.
6. **Ghi lại** nguyên nhân + cách vá vào `docs/agent-journal.md` để lần sau nhanh hơn.

---

_Xem thêm: [`docs/opencode-vps-guide.md`](./opencode-vps-guide.md) · [`AGENTS.md`](../AGENTS.md) · [`scripts/smoke-checklist.md`](../scripts/smoke-checklist.md)_
