# OpenCode trên VPS + Kiira AI + T3 Code trên điện thoại

> Viết cho người mới — đi từng bước, giải thích thuật ngữ ngay tại chỗ.
> Thời gian: ~20 phút. Yêu cầu: VPS đã chạy bot Protogon (xem `bot/VPS-DEPLOY.md`).
>
> 🔐 Siết an ninh VPS + giả lập tấn công + trỏ Freebuff CLI đúng tệp:
> xem [`docs/vps-security-hardening.md`](./vps-security-hardening.md).

---

## Phần 1 — Cài OpenCode trên VPS (5 phút)

OpenCode là "trợ lý AI chạy trong terminal": bạn gõ yêu cầu bằng tiếng Việt, nó
đọc code, sửa file, chạy test và commit thay đổi thay bạn — nhưng vẫn nằm trong
giới hạn an toàn do repo quy định (xem `AGENTS.md` + `opencode.json`).

### 1.1. SSH vào VPS và chạy script cài sẵn của repo

> 📁 **Đường dẫn repo trên VPS không cố định** (`/opt/protogon` theo
> `bot/VPS-DEPLOY.md`, hoặc thư mục bạn tự clone). Cách tìm nhanh:
> [`docs/vps-security-hardening.md`](./vps-security-hardening.md) **§0 — Tìm thư mục
> repo trên VPS**. Đoán đường dẫn là gặp `cd: No such file or directory`.

```bash
ssh root@IP-VPS-CỦA-BẠN
cd "$REPO_DIR"                           # GỐC repo — đổi thành đường dẫn thật (§0)
git pull                                 # lấy AGENTS.md + opencode.json mới nhất
sh ./scripts/setup-vps-agent.sh
```

Script tự làm 4 việc: kiểm tra Bun/Node, cài OpenCode, chép cấu hình permission
an toàn vào `~/.config/opencode/opencode.json` (KHÔNG đè file có sẵn), và xác
nhận `AGENTS.md` đã nằm ở root repo.

> Nếu `~/.config/opencode/opencode.json` đã tồn tại từ lần cài cũ — hãy mở ra và
> đảm bảo phần `bash` có: `"git add *": "allow"`, `"git commit *": "allow"` và
> `"git push *": "allow"` (chủ bot đã bật push tự do — agent tự đẩy sau khi
> kiểm chứng xanh; muốn siết lại thì đổi thành "deny").

### 1.2. Mở OpenCode lần đầu

```bash
cd "$REPO_DIR"     # GỐC repo (§0) — KHÔNG đoán đường dẫn
opencode
```

Lần đầu chạy, OpenCode hỏi chọn provider/model — bỏ qua bước này lúc đầu, mình
sẽ nạp key Kiira AI ở Phần 2. Nếu nó bắt buộc chọn, chọn **Other** rồi bấm Esc.

### 1.3. Kiểm tra agent đã hiểu luật repo

Gõ thử trong OpenCode:

```
git status
```

Agent sẽ chạy được. Thử tiếp một lệnh nguy hiểm (nó phải TỪ CHỐI):

```
git push origin main
```

Nếu agent hỏi xác nhận hoặc từ chối → cấu hình an toàn hoạt động đúng.

---

## Phần 2 — Nạp API key Kiira AI vào OpenCode (5 phút)

Kiira AI (kiraai.vn) cấp **30 triệu tokens miễn phí mỗi ngày** qua API tương
thích OpenAI. Bot Protogon đã tích hợp sẵn Kiira làm provider dự phòng (xem
`bot/src/ai.js`), giờ mình cho OpenCode dùng chung key đó.

### 2.1. Lấy key Kiira

1. Đăng nhập trang quản lý của Kiira AI (nơi bạn đã đăng ký gói free)
2. Vào mục **API Keys** → **Create key** → đặt tên (vd: `opencode-vps`)
3. Copy key (kiểu `kira-...` hoặc chuỗi dài) — **chỉ hiện 1 lần**
4. Ghi lại **Base URL** của gói: mặc định là `https://kiraai.vn/api/v1`

### 2.2. Đăng ký provider trong OpenCode

Trong giao diện OpenCode đang mở, gõ:

```
/connect
```

- Danh sách hiện ra → chọn **Other** (provider tùy chỉnh)
- Nhập **API key** vừa copy → Enter

Key được lưu an toàn tại `~/.local/share/opencode/auth.json` (không nằm trong
repo, không bao giờ được commit).

### 2.3. Khai báo model trong opencode.json

Mở file cấu hình:

```bash
nano ~/.config/opencode/opencode.json
```

Thêm khối `provider` vào **cùng cấp** với `permission` (giữ nguyên phần cũ):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "kiira": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Kiira AI",
      "options": {
        "baseURL": "https://kiraai.vn/api/v1"
      },
      "models": {
        "deepseek-v4.1-flash": {
          "name": "DeepSeek v4.1 Flash"
        },
        "glm-5.3-flash": {
          "name": "GLM 5.3 Flash"
        },
        "mimo-v2.5": {
          "name": "Mimo V2.5"
        },
        "deepseek-v4-flash-vision-exp": {
          "name": "DeepSeek V4 Flash Vision"
        }
      }
    }
  },
  "model": "kiira/deepseek-v4.1-flash",
  "small_model": "kiira/deepseek-v4.1-flash",
  "permission": { ... giữ nguyên ... }
}
```

> **Nhiều model, 1 key duy nhất:** tất cả model khai báo trong khối `models` dùng
> chung key đã lưu ở Bước `/connect` — không cần tạo key mới. Danh sách ID model
> thật của Kiira (đã xác minh 18/09/2026 qua `GET /api/v1/models`, không cần key):
> `deepseek-v4.1-flash`, `glm-5.3-flash`, `mimo-v2.5`, `deepseek-v4-pro`,
> `minimax-m3`, `kimi-k3`, `grok-4.6`, `qwen3.8-flash`… Model nhận biết vision
> (đọc được ảnh): `deepseek-v4-flash-vision-exp` — muốn agent đọc screenshot thì
> thêm nó vào `models` rồi chuyển qua bằng `/models` khi cần. Khai model nào thì
> mới hiện model đó trong OpenCode — chỉ thêm cái bạn thật sự dùng.

Giải thích từng dòng:

| Dòng                                 | Ý nghĩa                                                                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `"npm": "@ai-sdk/openai-compatible"` | Kiira nói "giọng" OpenAI — dùng bộ kết nối tương thích                                                                  |
| `"baseURL"`                          | Địa chỉ API của Kiira (chính là giá trị `KIRA_BASE_URL` trong `bot/.env` của bot)                                       |
| `"models"`                           | ID model phải đúng tên Kiira đặt. Xem danh sách thật: `curl https://kiraai.vn/api/v1/models` (công khai, không cần key) |
| `"model"`                            | Model mặc định OpenCode dùng cho việc code                                                                              |

Lưu file (Ctrl+O, Enter) rồi thoát (Ctrl+X). Khởi động lại OpenCode.

### 2.4. Kiểm tra

Trong OpenCode:

```
/models
```

→ danh sách sẽ có **Kiira AI**: DeepSeek v4.1 Flash (mặc định), GLM 5.3 Flash,
Mimo V2.5, DeepSeek Vision — chuyển qua lại tuỳ việc. Hỏi thử:

```
Đọc file bot/src/ai.js và tóm tắt 5 dòng đầu tiên
```

Agent trả lời được = key hoạt động.

### 2.6. Provider phụ miễn phí: OpenHands (DeepSeek) + Cline (Kimi K3)

Hai provider phụ miễn phí, tương thích OpenAI, đã xác minh key + gọi chat thật
ngày 19/09/2026. Dùng làm model dự phòng / thay đổi không khí, không thay Kiira
làm mặc định.

**A. OpenHands Cloud** (openhands.dev — All Hands AI) — DeepSeek v4.1 Flash:

```json
"openhands": {
  "npm": "@ai-sdk/openai-compatible",
  "name": "OpenHands (DeepSeek)",
  "options": { "baseURL": "https://llm-proxy.app.all-hands.dev/v1" },
  "models": {
    "deepseek/deepseek-v4.1-flash": { "name": "DeepSeek v4.1 Flash (OpenHands)" }
  }
},
```

Lần đầu dùng: `/connect` → chọn **OpenHands (DeepSeek)** → dán key (bắt đầu
`sk-oh-...`). Key lưu ở `auth.json` ngoài repo.

**B. Cline API** (api.cline.bot) — Kimi K3 (+ 447 model khác, kể cả
DeepSeek/GLM/Gemini/Claude): base URL là `https://api.cline.bot/api` (CHÚ Ý có
đường `/api` — không phải `/v1` như provider thường; thử `/v1/...` sẽ báo
Not Found). Endpoint đầy đủ: `/api/v1/chat/completions`, danh sách model:
`/api/v1/models` (447 model đã xác minh 19/09/2026 — `moonshotai/kimi-k3`,
`deepseek/deepseek-v4.1-flash`, `anthropic/claude-fable-5.1`,
`google/gemini-3.8-flash`…).

```json
"cline": {
  "npm": "@ai-sdk/openai-compatible",
  "name": "Cline (Kimi K3)",
  "options": { "baseURL": "https://api.cline.bot/api/v1" },
  "models": {
    "moonshotai/kimi-k3": { "name": "Kimi K3 (Cline)" },
    "deepseek/deepseek-v4.1-flash": { "name": "DeepSeek v4.1 Flash (Cline)" }
  }
},
```

Lưu ý riêng của Cline: key gửi qua header `Authorization: Bearer` như thường —
trong `auth.json` giữ nguyên dạng key `sk_...`. Response trả JSON bọc trong key
`data` (không thuần OpenAI schema) — nếu @ai-sdk/openai-compatible báo lỗi parse
thì chuyển npm sang `@ai-sdk/anthropic`-style custom hoặc dùng model này qua
`curl` (chưa chặn việc dùng, chỉ cần biết). Ưu tiên dùng qua OpenCode với model
đơn giản trước; gặp lỗi parse phải xác minh lại endpoint.

Cách khai trong `~/.config/opencode/opencode.json`: thêm 2 khối trên vào cạnh
khối `kiira` (cùng cấp trong `provider`), khởi động lại OpenCode, kiểm tra
`/models` thấy thêm 2 provider. Test nhanh từng model bằng câu lệnh nhỏ trước
khi giao việc thật.

Bảng tổng hợp dự phòng (cập nhật sau khi thêm 2 provider mới):

| Sự cố                               | Dùng gì                                                            |
| ----------------------------------- | ------------------------------------------------------------------ |
| Nghẽn thoáng qua (503/429)          | Proxy tự gánh — không làm gì                                       |
| Model riêng lỗi (DeepSeek chậm/lỗi) | Đổi GLM 5.3 Flash / Mimo V2.5 trong `/models` (cùng gateway Kiira) |
| **Cả gateway Kiira sập**            | **Groq** — provider khác hẳn, độc lập với Kiira                    |
| Kiira + Groq cùng lỗi               | OpenHands (DeepSeek) hoặc Cline (Kimi K3) trong `/models`          |

### 2.7. (Nên làm) Nạp key Kiira cho luôn cho bot dùng chung

Key OpenCode và key bot là HAI nơi riêng biệt. Nếu muốn bot cũng dùng Kiira
(30M tokens/ngày miễn phí cho research/học hỏi), thêm vào `bot/.env` trên VPS:

```bash
echo 'KIRA_API_KEY=KEY-CỦA-BẠN' >> bot/.env
pm2 restart protogon-bot   # hoặc lệnh restart bot bạn đang dùng
```

> ⚠️ KHÔNG paste key vào chat với agent, KHÔNG commit file .env — agent đã bị
> chặn đọc file này bởi `opencode.json`. Khi cần giá trị mới, bạn tự sửa env.

---

## Phần 3 — T3 Code trên điện thoại (10 phút)

T3 Code (t3.codes) là "bộ điều khiển agent" mã nguồn mở của Theo (t3dotgg):
chạy một server nhỏ trên VPS, rồi điều khiển từ **app điện thoại (iOS/Android),
web hoặc desktop**. Nó không thay OpenCode — nó điều khiển OpenCode (và Codex,
Claude Code…) từ xa. Bạn ra ngoài, mở điện thoại ra là bảo agent sửa code, xong
nó commit vào repo luôn.

### 3.1. Cài T3 Code trên VPS (+ sửa lỗi "không có lệnh t3")

Vẫn trong SSH:

```bash
curl -fsSL https://t3.codes/install.sh | sh
```

**Lỗi thường gặp ngay bước này:** gõ `t3` báo `command not found`. Lý do: trình
cài đặt đặt lệnh vào `~/.local/bin` — thư mục này chưa nằm trong PATH của VPS.
Sửa một dòng:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
t3 --version   # phải in ra số phiên bản
```

**Mẹo khi làm từ điện thoại:** gõ TỪNG lệnh một, Enter xong mới gõ lệnh kế —
paste cả khối hay bị dính dòng (ví dụ thành `~/.bashrc.bashrc`) làm hỏng đường
dẫn. Nếu vẫn `command not found`, kiểm tra binary có tồn tại thật không:

```bash
ls /root/.local/bin
```

- Có `t3` trong danh sách → chỉ là PATH: chạy `export PATH=/root/.local/bin:$PATH`
  rồi `t3 --version` (hiệu lực ngay trong phiên). Lưu vĩnh viễn vào `.profile`
  (SSH login đọc file này):
  `echo 'export PATH=/root/.local/bin:$PATH' >> /root/.profile`
- Không có / báo "No such file or directory" → lần cài chưa thành công: chạy lại
  `curl -fsSL https://t3.codes/install.sh | sh` và ĐỌC dòng cuối nó in ra — lỗi
  tải (mạng chặn GitHub) thì thử `wget -qO- https://t3.codes/install.sh | sh`,
  thiếu công cụ thì `apt-get install -y tar curl` rồi cài lại.

### 3.2. Nối điện thoại với VPS — chọn 1 trong 2 cách

> Lỗi hay gặp trên màn "Add Environment" của app: ô HOST phải là **địa chỉ VPS**
> (IP hoặc domain), ô Pairing code là **mã do VPS phát ra** — KHÔNG phải handle
> mạng xã hội. Nhập sai → app thử mở `https://handle-.../.well-known/t3/environment`
> và báo "Failed to fetch remote environment".

**Cách A — T3 Connect (KHUYÊN DÙNG: chạy được qua mọi mạng 4G/WiFi, không cần mở port trên router):**

```bash
# Trên VPS:
t3 connect
```

1. Nó in ra một **link đăng nhập + mã ngắn** — mở link đó trên trình duyệt
   (điện thoại hay máy tính đều được), đăng nhập tài khoản T3, xác nhận mã
   khớp rồi bấm Approve.

   **Chạy qua SSH/không có trình duyệt trên VPS: bấm `H` (headless mode).**
   Nó đổi sang "Device flow": in link dạng
   `https://accounts.t3.codes/device?user_code=XXXX-XXXX` + mã xác nhận — mở
   link trên máy có trình duyệt, đăng nhập, nhập/xác nhận mã, Approve. Rồi
   **quay lại terminal ĐỢI** — dòng "Waiting for approval" tự đổi thành
   connected trong ít phút; **đừng Ctrl+C** vội. Link `app.t3.codes/connect`
   chỉ dùng khi mở ngay trên máy chạy T3.

   Mã `XXXX-XXXX` là mã xác nhận tài khoản trên trang duyệt — KHÔNG phải
   pairing code để điền vào app

2. Mở app T3 Code trên điện thoại → đăng nhập **CÙNG tài khoản** → environment
   VPS tự xuất hiện trong danh sách, không cần điền host/code tay
3. Khi được hỏi chạy nền, chọn yes (hoặc tự chạy `t3 service install`)

> ⚠️ **Sau khi bấm Allow, trình duyệt có nhảy ra trang lỗi
> `127.0.0.1:34338 … ERR_CONNECTION_REFUSED` — đó là BÌNH THƯỜNG, đừng lo.**
> Trang đó là OAuth callback về localhost của máy MỞ LINK (điện thoại), nơi
> không có gì chạy. Docs chính thức ghi rõ: "The CLI continues on its own, so
> you do not need to forward an OAuth callback port" — VPS vẫn nhận ủy quyền
> đầy đủ. Quay lại terminal VPS xem dòng "connected" là được. Tương tự,
> **đừng** điền `127.0.0.1` vào ô HOST của app (loopback chỉ tới chính chiếc
> điện thoại → "Failed to fetch remote environment"). Cách A không bao giờ cần
> màn "Add Environment" — chỉ cần đăng nhập đúng tài khoản.

Kiểm tra trạng thái bất cứ lúc nào: `t3 connect status` (kèm đó
`t3 service status` để xác nhận server nền đang chạy). Chưa thấy environment
trên app dù đã Approve: (1) kiểm tra app đăng nhập ĐÚNG tài khoản Google vừa
duyệt; (2) `t3 connect status` trên VPS — nếu chưa login, chạy lại `t3 connect`
và làm trọn luồng headless phía trên; (3) bảo đảm server nền đang chạy
(`t3 service status` → không chạy thì `t3 service install`).

> ⚠️ **VPS đăng nhập root**: `t3 service install` có thể từ chối vì thiếu
> systemd user-session (dòng cảnh báo "do not run T3 with sudo"). Khi đó chạy
> server trong **tmux** để sống sót khi đóng SSH:
>
> ```bash
> apt-get install -y tmux
> tmux new -s t3        # vào phiên riêng
> t3 serve              # chạy server; tắt màn = Ctrl+B rồi nhấn D (detach)
> tmux attach -t t3     # quay lại phiên sau này
> ```
>
> Cảnh báo `ping_group_range`/ICMP của cloudflared khi tunnel lên là vô hại —
> chỉ mất tính năng ping qua tunnel, mọi thứ khác vẫn hoạt động. Nếu T3 Code
> báo thiếu agent (vd "Claude Agent CLI health check failed" là vì chưa cài
> Claude Code) → bật provider **OpenCode** đã cài ở Phần 1 trong
> Settings → Providers của app.

**Cách B — Pairing QR (dùng khi điện thoại và VPS trong cùng mạng LAN, hoặc cả
hai đã joined Tailscale):**

```bash
# Trên VPS — chạy server nền 24/24 rồi phát mã ghép nối:
t3 service install
t3 pair
```

- Màn hình in ra **QR code + URL + mã** dạng `xxx-yyy-zzz`
- Trên app điện thoại: **Settings → Environments → Add environment** → **quét
  QR** (nhanh nhất), hoặc điền tay:
  - HOST: địa chỉ VPS mà điện thoại với tới được (IP LAN `192.168.x.x`, IP
    Tailscale `100.x.x.x`, hoặc domain HTTPS)
  - PAIRING CODE: mã vừa in
- Qua Tailscale HTTPS (mã hóa từ đầu tới cuối): `t3 pair --tailscale` → link
  dạng `https://tên-máy.tailXXXX.ts.net/`

> Mỗi máy điện thoại mới cần một link pair mới — link một-lần, coi như mật khẩu,
> đừng chụp màn hình gửi ai.

### 3.3. Dùng thử từ điện thoại

1. Mở app → chọn environment VPS
2. Tạo task mới, gõ: `bun run test` → agent chạy test trên VPS, bạn xem kết
   quả trực tiếp trên điện thoại
3. Thử một việc thật: `Sửa lỗi X trong panel Y, chạy test rồi commit + push` —
   agent sửa, kiểm chứng xanh rồi tự commit + push (push tự do đã được bật;
   vẫn cấm reset/clean/rebase và đọc secret)

### 3.4. Ai cần gì?

| Vai                      | Công cụ              | Địa chỉ                               |
| ------------------------ | -------------------- | ------------------------------------- |
| Viết code trên VPS       | OpenCode (terminal)  | `opencode` trong SSH                  |
| Điều khiển từ điện thoại | T3 Code app/web      | Play Store / App Store / app.t3.codes |
| Bot Discord              | Process bot (Bun)    | `pm2` trên VPS                        |
| Dashboard                | Freebuff (đang dùng) | protogon.freebuff.app                 |

---

## Phần 4.5 — Chống chập chờn Kiira AI (retry proxy)

Lỗi `AI service stream failed: The AI model service is temporarily unavailable`
là gateway Kiira trả 5xx/429 thoáng qua — OpenCode không có retry tích hợp nên
phiên bị ngắt. Repo có sẵn **retry proxy** (`scripts/kiira-retry-proxy.mjs`):
proxy nhỏ chạy tại `127.0.0.1:8787` trên VPS, tự thử lại lỗi tạm thời với
backoff tăng dần trước khi chịu báo lỗi; lỗi cứng (401 sai key, 400 sai request)
chuyển thẳng ngay. Proxy **không đọc API key** — chỉ chuyển tiếp header.

Ngoài ra khi vẫn dính gián đoạn, chỉ cần gõ **`continue`** — hợp đồng AGENTS.md
buộc agent tiếp tục ĐÚNG CHỖ DỪNG (không làm lại từ đầu) cho tới khi kiểm chứng
xanh + báo cáo xong mới dừng hẳn.

### Xử lý 2 ca git trên VPS hay gặp

**1. `git pull` báo "divergent branches"** — local có commit riêng (agent vừa
commit trên VPS) mà GitHub cũng có commit mới (đẩy từ Freebuff). Trình tự chuẩn:

```bash
git push origin main          # đẩy commit local lên trước (nếu key có quyền write)
git pull --no-rebase          # hợp nhất commit mới từ GitHub vào local
git config pull.rebase false  # đặt 1 lần — pull sau này tự merge, hết hỏi
```

Nếu push bị chặn vì lý do số 2 dưới đây → xử lý số 2 trước rồi quay lại.

**2. `git push` báo "key marked as read only"** — deploy key trên GitHub đang
chặn ghi. Sửa 1 lần, vĩnh viễn: mở **GitHub → repo → Settings → Deploy keys** →
bấm vào key của VPS → tick **Allow write access** → Update. Sau đó push lại.
(GitHub không cho sửa trực tiếp? Xóa key cũ, thêm lại với tick write.)

Cách chạy bền nhất — **systemd** (tự bật sau reboot, tự chạy lại khi crash,
không phụ thuộc tmux). Cài 3 lệnh, lần đầu thôi:

```bash
cp "$REPO_DIR/scripts/kiira-retry-proxy.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now kiira-retry-proxy
curl http://127.0.0.1:8787/__health   # {"ok":true,...} là đang chạy
```

Nếu trước đây đã chạy bằng tmux → tắt phiên cũ để tránh 2 proxy giành port:
`tmux kill-session -t kiira 2>/dev/null || true`. Xem log của proxy:
`journalctl -u kiira-retry-proxy -f` (thoát xem: Ctrl+C).

Rồi đổi `baseURL` trong `~/.config/opencode/opencode.json` từ
`https://kiraai.vn/api/v1` → `http://127.0.0.1:8787` — từ đó OpenCode nói
chuyện với proxy, proxy chống chập cho. Proxy mặc định **thử lại tối đa 6 lần**
với backoff 1s→2s→4s→8s→16s→30s (+ jitter) — chịu được nghẽn Kiira kéo dài mà
phiên OpenCode không đứt; vẫn lỗi mới trả về client. Tùy chỉnh qua env:
`KIRA_PROXY_PORT` (8787), `KIRA_PROXY_RETRIES` (6), `KIRA_PROXY_TIMEOUT_MS`
(120000), `KIRA_PROXY_FIRST_BYTE_MS` (15000), `KIRA_PROXY_IDLE_MS` (60000),
`KIRA_PROXY_TOTAL_BUDGET_MS` (600000), `KIRA_PROXY_MAX_BACKOFF_MS` (30000),
`KIRA_PROXY_BREAKER_THRESHOLD` (5), `KIRA_PROXY_BREAKER_MS` (15000), `KIRA_UPSTREAM`
(https://kiraai.vn/api/v1).

**Cơ chế chịu nghẽn (quan trọng):**

- **Body đọc một lần** thành `ArrayBuffer` trước vòng thử lại. Request body là
  stream dùng một lần — nếu đọc lại mỗi lượt, retry cho POST `/chat/completions`
  (đúng loại request OpenCode dùng) sẽ ném `Body already used` và client nhận 502
  ngay khi upstream chập. Test `scripts/test-kiira-proxy.cjs` chặn tái diễn.
- **Tách "chờ byte đầu" khỏi "chờ cả lượt"** (19/09/2026). Bản cũ dùng một timeout
  120s cho mỗi lượt fetch: Kiira nhận kết nối nhưng không trả header thì mỗi lượt
  đứng im 2 phút → nhiều lượt thành treo cứng hàng chục phút. Giờ chỉ chờ tối đa
  `KIRA_PROXY_FIRST_BYTE_MS` (15s) để thấy phản hồi đầu; quá hạn coi là nghẽn và
  thử lại ngay.
- **Idle watchdog cho stream** (19/09/2026). Timer cũ 120s còn CẮT OAN stream hợp
  lệ dài hơn 120s (model chậm, câu trả lời dài). Giờ stream chạy bao lâu cũng được
  miễn là giữa 2 chunk không im lặng quá `KIRA_PROXY_IDLE_MS` (60s). Nếu im lặng
  **trước chunk đầu** (chưa có byte nào tới client) → hủy lượt và thử lại; im lặng
  **giữa chừng** → đóng sạch để client tự xử lý.
- **Ngân sách tổng** `KIRA_PROXY_TOTAL_BUDGET_MS` (10 phút) chặn việc cộng dồn
  nhiều lượt retry thành phiên treo vô tận; hết ngân sách trả lỗi sớm.
- **Ngắt mạch bán mở**: Kiira lỗi liên tiếp `KIRA_PROXY_BREAKER_THRESHOLD` lần thì
  tạm ngưng thử `KIRA_PROXY_BREAKER_MS`, rồi cho MỘT request thăm dò đi trước;
  thành công → đóng mạch ngay, thất bại → tiếp tục nghỉ. Trạng thái xem được tại
  `curl http://127.0.0.1:8787/__health`.
- **Tôn trọng `Retry-After`** của Kiira (giây hoặc HTTP-date) khi bị 429/503 —
  chờ đúng thời gian gateway yêu cầu thay vì đoán theo backoff.
- **Trần backoff** `KIRA_PROXY_MAX_BACKOFF_MS` để tổng thời gian chờ luôn có biên,
  không treo phiên hàng phút vì một lần nghẽn dài.
- **Dừng khi client hủy**: nếu OpenCode đã bỏ cuộc (đóng kết nối), proxy ngừng
  thử lại ngay, không đốt lượt gọi Kiira vô ích.

> Lưu ý kỹ thuật (Bun v1.4.2): không dùng `controller.error()` hay `abort()` từ
> callback timer để ngắt stream — Bun in lỗi đó như uncaught exception và reset
> socket thô. Proxy dùng sentinel `IDLE` (resolve, không reject) và đóng stream
> sạch; test `test-kiira-proxy.cjs` khóa hành vi này.

### Khi Kiira sập hoàn toàn — fallback Groq (phương án B)

Proxy gánh được nghẽn ≤~30 giây, nhưng nếu **cả gateway Kiira sập** (vài phút
trở lên) thì agent không tự chữa được — não tắt thì cái sửa cũng cần não. Lúc
đó chuyển model phụ **Groq free** (`openai/gpt-oss-120b` — cùng model bot đã
dùng làm self-heal fallback trong `convex/haimiya.ts`, nhất quán về hành vi).

Phân biệt 3 lớp dự phòng:

| Sự cố                               | Dùng gì                                                            |
| ----------------------------------- | ------------------------------------------------------------------ |
| Nghẽn thoáng qua (503/429)          | Proxy tự gánh — không làm gì                                       |
| Model riêng lỗi (DeepSeek chậm/lỗi) | Đổi GLM 5.3 Flash / Mimo V2.5 trong `/models` (cùng gateway Kiira) |
| **Cả gateway Kiira sập**            | **Groq** — provider khác hẳn, độc lập với Kiira                    |

Cài 1 lần:

1. Tạo key free tại `console.groq.com` (đăng nhập Google account là đủ).
2. Thêm provider vào `~/.config/opencode/opencode.json` (cạnh khối kiira):

```json
"groq": {
  "npm": "@ai-sdk/openai-compatible",
  "name": "Groq (fallback)",
  "options": { "baseURL": "https://api.groq.com/openai/v1" },
  "models": {
    "openai/gpt-oss-120b": { "name": "GPT-OSS 120B (Groq)" }
  }
},
```

3. Lần đầu dùng: OpenCode hỏi key → dán key Groq (lưu vào `auth.json` ở thư mục
   cấu hình, không nằm trong repo — không vi phạm điều khoản secret).

Khi Kiira sập: mở OpenCode → `/models` → chọn **GPT-OSS 120B (Groq)** → gõ
`continue` — agent nối việc đúng chỗ dừng trên model phụ. Kiira sống lại thì
đổi về DeepSeek v4.1 Flash. Lưu ý: agent **không tự đổi model được** khi não
tắt — bước này là của bạn, mất ~5 giây.

## Phần 4 — Nâng cấp OpenCode giống Freebuff (đã có sẵn trong repo)

Repo đi kèm bộ nâng cấp giúp OpenCode làm việc kỷ luật và an toàn như Freebuff:

| Thành phần         | Vị trí                                                                                                                                             | Công dụng                                                                                                                                                                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/verify`          | `.opencode/commands/verify.md`                                                                                                                     | Chạy đủ bộ kiểm chứng (test + typecheck + lint), báo kết quả số — ranh giới "xong việc"                                                                                                                                                                                                                    |
| `/fix <mô tả>`     | `.opencode/commands/fix.md`                                                                                                                        | Sửa bug theo quy trình: tái hiện → gốc rễ → vá → test chặn tái diễn                                                                                                                                                                                                                                        |
| `/ship`            | `.opencode/commands/ship.md`                                                                                                                       | Hoàn tất phiên: kiểm chứng → commit chọn lọc (không push) → báo cáo                                                                                                                                                                                                                                        |
| `/review`          | `.opencode/commands/review.md`                                                                                                                     | Review diff/code theo 5 lớp như senior reviewer (chỉ nhận xét, không sửa)                                                                                                                                                                                                                                  |
| Guardrails         | `.opencode/plugins/guardrails.js`                                                                                                                  | Chặn chủ động lệnh bash đọc secret; nhắc lại hợp đồng AGENTS.md khi session dài bị nén                                                                                                                                                                                                                     |     | Hộp lịch sử | `.opencode/plugins/session-history.js` + `/history` | Ghi mỗi phiên vào hộp JSONL, tự dọn sau TTL (mặc định 14 ngày) — xem bằng lệnh `/history` |     | Skill bảo mật | `.opencode/skills/security-audit/` | Skill **security-audit của Cloudflare** (MIT) — agent tự kích hoạt khi nghe "security audit", "tìm lỗ hổng"… Pha: thám sát → săn lỗi có bảng che phủ → đối chứng chéo (verifier khác hunter) → báo cáo có bằng chứng nguồn |
| Bộ skills kỹ thuật | `.opencode/skills/{debugging-and-error-recovery,test-driven-development,security-and-hardening,doubt-driven-development,code-review-and-quality}/` | 5 skill chọn lọc từ **addyosmani/agent-skills** (Addy Osmani — Google): debug có hệ thống tìm gốc rễ, TDD red-green-refactor, hardening OWASP khi đụng input/auth/data, nghi ngờ chéo mọi quyết định rủi ro cao, review đa trục trước merge. Mỗi skill tự kích hoạt theo ngữ cảnh việc — không cần gọi tay |

Bộ này nằm trong repo nên **ai clone repo cũng tự có** — không cần cài thêm gì.
Ngoài ra `opencode.json` đã bật `autoupdate` (tự cập nhật OpenCode) và tắt
`share` (không tạo link chia sẻ session công khai).

> Cập nhật OpenCode thủ công bất cứ lúc nào: `opencode upgrade`.
>
> **Hộp lịch sử làm việc**: mỗi phiên của agent được ghi tóm tắt vào
> `~/.config/opencode/history/sessions.jsonl` (thời gian, tên phiên, thư mục,
> trạng thái). Sau TTL ngày mục cũ tự dọn mỗi khi ghi mục mới — không cần cron.
> Đổi hạn giữ: sửa `AGENT_HISTORY_TTL_DAYS` trong `opencode.json` (số ngày;
> `0` = giữ vô hạn, tắt hẳn dọn). Xem lại lịch sử bằng lệnh `/history`
> trong OpenCode, hoặc đọc thẳng file. Lịch sử chỉ chứa metadata — không bao
> giờ ghi nội dung tin nhắn hay secret.

## Phần 5 — Freebuff CLI + Claude Fable 5.1 (súng lớn cho việc khó)

Ngoài OpenCode + Kiira, VPS có thể cài thêm **Freebuff CLI** — coding agent cùng
gia đình với nền tảng Freebuff Web, đang trial miễn phí model **Claude Fable 5.1**
(Anthropic, dòng mạnh nhất, hỗ trợ đọc ảnh). Hai công cụ **không xung đột nhau**.

### 5.1. Cài đặt

```bash
npm i -g freebuff          # cài CLI (npm có sẵn trên VPS)
freebuff --version         # kiểm tra
mkdir -p /root/freebuff-lab && cd /root/freebuff-lab   # sân chơi test — KHÔNG chạy trong repo production
freebuff                   # lần đầu sẽ in link đăng nhập → mở trên điện thoại, đăng nhập tài khoản Freebuff
```

### 5.2. Vai trò trong hệ thống

| Công cụ          | Model                         | Dùng khi                                                    |
| ---------------- | ----------------------------- | ----------------------------------------------------------- |
| OpenCode (chính) | DeepSeek v4.1 Flash qua Kiira | Việc hằng ngày — sửa bug, thêm tính năng, `/verify`         |
| Freebuff CLI     | Claude Fable 5.1 (trial)      | Việc khó thật sự — thiết kế kiến trúc, bug ma, refactor lớn |

### 5.3. Quy tắc an toàn (bắt buộc)

1. **Tuyệt đối không dán secret** (`.env`, bot token, `bot/.bot-key`, key Kiira)
   vào chat Freebuff CLI — nội dung có thể được dùng để train AI (ghi rõ trong
   sản phẩm). Đúng nguyên tắc điều khoản 1 trong `AGENTS.md`.
2. **Chạy ở `/root/freebuff-lab` trước** cho quen hành vi; chưa chạy trong repo
   bot production cho đến khi quen.
3. Trial **giới hạn session mỗi user** — dùng có chọn lọc cho việc khó, không
   đốt vào việc DeepSeek làm được.

> Cả hai CLI đều đọc `AGENTS.md` trong repo khi chạy trong thư mục repo — hợp
> đồng làm việc (5 pha, cấm secret, kiểm chứng xanh mới push) tự áp dụng.

## Dùng skills trong repo

**security-audit (Cloudflare)** — xem mục riêng phía dưới. Còn 5 skill của
Addy Osmani hoạt động khác Cloudflare: **tự kích hoạt theo ngữ cảnh**, không
cần lệnh gì — agent thấy đang fix bug → nạp `debugging-and-error-recovery`;
đụng input/auth → `security-and-hardening`; quyết định lớn rủi ro cao →
`doubt-driven-development`. Muốn gọi thẳng thì nhắc tên skill trong câu.

**security-audit (Cloudflare)** — audit đầy đủ 6 pha tốn token lớn (nhiều
sub-agent song song): chỉ chạy trên **bản clone** (`/root/freebuff-lab/lab-repo`)
cho tới khi quen chi phí, không chạy trực tiếp trong repo production. Kết quả
ghi ra `findings.json` + `REPORT.md` có bằng chứng nguồn từng dòng.

Tất cả skills tôn trọng điều khoản repo: không tự mò secret, hết sandbox thì
không chạy code mục tiêu.

## Tự chữa hạ tầng VPS — 3 vùng quyền (19/09/2026)

Agent được mở quyền chẩn đoán + tự chữa **có kiểm soát** trên VPS. Chi tiết đầy
đủ nằm trong `AGENTS.md` điều khoản 3; tóm tắt:

| Vùng             | Agent được gì                                                                                                       | Ví dụ                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 🟢 **TỰ LÀM**    | Chẩn đoán read-only + tự sửa rồi tự restart **kiira-retry-proxy** (bắt buộc health check `ok:true` sau khi restart) | `systemctl status`, `journalctl`, `docker ps/logs`, `df`, `free` · sửa proxy → restart → curl `__health`                |
| 🟡 **HỎI TRƯỚC** | Chẩn đoán xong → in đúng lệnh + nguyên nhân, người dùng tự chạy (hoặc gật)                                          | restart bot, `docker restart`, `kill`, sửa unit file của dịch vụ khác                                                   |
| 🔴 **CẤM**       | Không bao giờ — kể cả "để debug"                                                                                    | `systemctl cat/show`, `docker inspect/exec`, `printenv` (rò secret hạ tầng); `ufw`/`iptables`; `reboot`; `docker prune` |

Hai lớp chặn bảo vệ: `opencode.json` permission (theo tên lệnh) + plugin
`guardrails.js` (theo hành vi — bắt cả lệnh ghép `&&` tìm đường vòng đọc env).

**Quy trình chuẩn khi VPS có dấu hiệu lỗi:** gõ `/health` trong OpenCode — quét
disk/RAM/load/services/proxy/docker, báo cáo bảng đánh giá kèm đề xuất chia
[TỰ LÀM] / [CẦN BẠN chạy]. Gật là nó xử phần của nó, còn phần của bạn thì chạy
đúng lệnh nó in.

## Deploy bot tự động — lệnh `/deploy` (19/09/2026)

Bot Discord chạy bằng pm2 (process `protogon-bot`). Từ 19/09 agent được phép tự
cập nhật bot, nhưng có **rào cản kiểm chứng cứng** — guardrail chỉ mở cổng
`pm2 restart protogon-bot` sau khi phiên vừa chạy đủ 4 lớp kiểm chứng xanh (test +
typecheck + lint + format:check, hết hạn sau 15 phút). Quy trình trong lệnh:

1. `git pull --no-rebase --no-edit` (conflict → dừng hỏi)
2. `bun install --frozen-lockfile` (chỉ khi lockfile đổi)
3. `bun run test && bun tsc -b --noEmit && bun run lint && bun run format:check`
4. `pm2 restart protogon-bot`
5. Xác minh: `pm2 status` → `protogon-bot` online, `pm2 logs protogon-bot --lines 30
--nostream` → không crash loop. Chết lại → vá theo log, không restart mù.

**Convex backend — 2 đường deploy song song, không xung đột:** CI (GitHub
Actions) tự `npx convex deploy` sau mỗi push lên `main` (job deploy chỉ chạy khi
lint + test xanh), và agent trên VPS cũng deploy được ngay trong `/deploy` khi
pull mang thay đổi `convex/` — Convex deploy cùng commit 2 lần chỉ ghi nhận,
không phá dữ liệu. Bot và dashboard tự thấy bản mới qua URL deployment (không
phải restart vì Convex).

### Setup 1 lần cho agent deploy Convex từ VPS (bạn làm, ~2 phút)

1. Vào [dashboard.convex.dev](https://dashboard.convex.dev) → chọn deployment →
   **Settings → Deploy keys → Generate** (đặt tên gợi nhớ, ví dụ `vps-agent`).
2. Trên VPS, thêm key vào môi trường shell (key KHÔNG vào chat, KHÔNG vào file
   trong repo — đúng luật secret của AGENTS.md):

   ```bash
   echo 'export CONVEX_DEPLOY_KEY="dán-key-vào-đây"' >> ~/.bashrc && source ~/.bashrc
   ```

3. Kiểm tra: `npx convex deploy --dry-run 2>&1 | head -5` không báo thiếu key là
   xong (chạy trong repo; dùng `--dry-run` cho an toàn).

**Tóm tắt 3 luồng cập nhật sau khi push lên `main`:**

| Thành phần     | Ai cập nhật                                                             | Điều kiện                      |
| -------------- | ----------------------------------------------------------------------- | ------------------------------ |
| Convex backend | CI tự động + agent VPS trong `/deploy` (khi pull có thay đổi `convex/`) | 4 lớp kiểm chứng xanh          |
| Bot Discord    | Agent trên VPS (`/deploy` → pm2 restart)                                | pull + 4 lớp kiểm chứng xanh   |
| Dashboard web  | Deploy thủ công qua Dokploy (build Docker)                              | khi cần — front-end ít đổi hơn |

## Xử lý sự cố

| Triệu chứng                                                            | Nguyên nhân                                                                                                                                     | Cách xử lý                                                                                                                                           |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `freebuff` không hiện link đăng nhập                                   | CLI đợi xác thực ở chế độ khác                                                                                                                  | Chạy `freebuff login` (hoặc `freebuff --help` xem lệnh auth) rồi thử lại                                                                             |
| `/verify` `/fix` `/ship` biến mất khỏi menu                            | OpenCode đang chạy **ngoài thư mục repo** (nhìn `/~` góc màn hình) — các lệnh nằm trong `.opencode/commands/` của repo, chỉ nạp khi mở đúng chỗ | `cd "$REPO_DIR" && opencode` — hoặc tạo lệnh tắt `alias oc='cd "$REPO_DIR" && opencode'`                                                             |
| `git commit` bị chặn dù đã bật push tự do                              | Phiên OpenCode đang chạy **nạp permission CŨ lúc khởi động** — sửa config giữa phiên không có hiệu lực với phiên hiện tại                       | Thoát OpenCode → mở lại **trong thư mục repo** (config mới của repo được nạp) — agent tự commit/push được ngay                                       |
| OpenCode không thấy model Kiira                                        | Sai baseURL, ID model sai, hoặc model chưa khai trong `models`                                                                                  | Kiểm tra `opencode.json` — OpenCode chỉ hiện model đã khai báo; lấy đúng ID từ `curl https://kiraai.vn/api/v1/models`                                |
| `git commit` bị từ chối trong OpenCode                                 | File `~/.config/opencode/opencode.json` cũ chưa có rule `git add/commit: allow`                                                                 | Merge lại từ `opencode.json` trong repo                                                                                                              |
| Gõ `t3` báo "command not found"                                        | `~/.local/bin` chưa nằm trong PATH                                                                                                              | `echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc`                                                                       |
| Cài xong báo `libatomic.so.1: cannot open shared object file`          | VPS tối giản thiếu thư viện hệ thống                                                                                                            | `apt-get update && apt-get install -y libatomic1` rồi chạy lại trình cài                                                                             |
| App điện thoại báo "Failed to fetch remote environment"                | Ô HOST chứa handle/IP sai, hoặc server chưa chạy                                                                                                | Dùng **Cách A (t3 connect)** — đăng nhập cùng tài khoản, khỏi điền tay; hoặc `t3 pair` trên VPS rồi quét QR                                          |
| T3 Code không kết nối được VPS                                         | Port SSH/firewall, hoặc VPS tắt                                                                                                                 | Dùng T3 Connect (đi qua relay của T3); kiểm tra `t3 service status` trên VPS                                                                         |     | Agent đọc được file .env | CẤM — phải xảy ra lỗi cấu hình | Kiểm tra rule `read: { "*.env": "deny", ... }` trong `opencode.json` đang dùng |
| Agent chạm env hạ tầng (unit systemd/container)                        | Vùng 🔴 — guardrails chặn `systemctl cat/show`, `docker inspect/exec`, `printenv`                                                               | Đúng thiết kế. Chẩn đoán bằng `status`/`journalctl`/`docker logs`; cần giá trị env → hỏi người dùng                                                  |
| CI đỏ ở job security trên PR Dependabot                                | GITHUB_TOKEN bị giới hạn quyền trên PR dependabot — gitleaks-action gọi API bị từ chối                                                          | Đã vá 19/09: nhánh CLI chạy gitleaks trực tiếp cho PR dependabot (`ci.yml`); nếu tái diễn thì xem lại version action                                 |
| `/deploy` dừng ở bước restart với lỗi GUARDRAIL                        | Chưa chạy đủ 4 lớp kiểm chứng xanh trong phiên, hoặc đã quá 15 phút kể từ lần chạy cuối                                                         | Chạy lại `bun run test && bun tsc -b --noEmit && bun run lint && bun run format:check` rồi restart — không tìm lối tắt quanh guardrail               |
| `npx convex deploy` báo "Error: you are not authenticated" / thiếu key | `CONVEX_DEPLOY_KEY` chưa export trong shell VPS (setup 1 lần — mục "Setup 1 lần cho agent deploy Convex từ VPS" phía trên)                      | Người dùng thêm `export CONVEX_DEPLOY_KEY=...` vào `~/.bashrc` rồi `source ~/.bashrc`; agent DỪNG chờ — không in key ra chat, không ghi key vào file |
| Token Kiira hết nhanh                                                  | OpenCode đọc rất nhiều file mỗi task                                                                                                            | 30M tokens/ngày thường đủ; nếu hết, chuyển model phụ sang Groq free (console.groq.com)                                                               |

---

## Checklist nhanh

- [ ] `sh ./scripts/setup-vps-agent.sh` chạy xong không lỗi
- [ ] OpenCode cho phép `git commit` + `git push` (vẫn chặn reset/rebase)
- [ ] `/models` trong OpenCode thấy DeepSeek v4.1 Flash (Kiira)
- [ ] Agent trả lời được câu hỏi về code (key hoạt động)
- [ ] `bot/.env` có `KIRA_API_KEY` nếu muốn bot dùng chung
- [ ] T3 Code cài trên VPS, app điện thoại kết nối được qua SSH
- [ ] Test từ điện thoại: chạy `bun run test` thấy kết quả PASS
- [ ] `/health` trong OpenCode chạy xong ra báo cáo bảng 🟢🟡🔴 (không đụng gì cả — chỉ chẩn đoán)
