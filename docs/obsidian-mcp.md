# Obsidian MCP — nối vault với mọi AI agent

Vault của máy này là **repo Protogon** (`/home/wio/Protogon`); ghi chú bộ não
thứ hai nằm trong `second-brain/`. Agent đọc/ghi vault qua **MCP server dựng
sẵn trong plugin Obsidian**, không cần server MCP bên thứ ba.

## Kiến trúc

```
Agent (MCP client)
   │  Streamable HTTP + Bearer key
   ▼
http://127.0.0.1:27123/mcp/     ← plugin "Local REST API with MCP" 5.5.2
   │
   ▼
Obsidian desktop (Flatpak md.obsidian.Obsidian) → vault /home/wio/Protogon
```

- Plugin chạy **trong** Obsidian nên có metadata sống: tag, frontmatter,
  backlink, file đang mở, command palette.
- Endpoint chỉ bind `127.0.0.1` — máy khác trong LAN không vào được.
- Hai cổng: `27123` (HTTP, chỉ loopback) và `27124` (HTTPS, chứng chỉ tự ký).
  Agent chạy cùng máy dùng `27123`; client bắt buộc HTTPS dùng `27124`.

## Đã cài trên máy này

| Thứ                             | Vị trí                                                      |
| ------------------------------- | ----------------------------------------------------------- |
| Plugin                          | `.obsidian/plugins/obsidian-local-rest-api/` (đã gitignore) |
| Cấu hình plugin (port, API key) | `.obsidian/plugins/obsidian-local-rest-api/data.json`       |
| API key                         | `~/.secrets/obsidian-api-key` (quyền `600`)                 |
| Bật community plugin            | `.obsidian/community-plugins.json`                          |
| Bỏ qua thư mục nặng khi index   | `.obsidian/app.json` → `userIgnoreFilters`                  |

`data.json` và `~/.secrets/obsidian-api-key` **không bao giờ được commit**.
`.obsidian/` chứa key nên đã nằm trong `.gitignore`.

## Chuẩn bị biến môi trường

Các client bên dưới đọc key từ `OBSIDIAN_API_KEY`, không nhúng key vào file:

```bash
export OBSIDIAN_API_KEY="$(cat ~/.secrets/obsidian-api-key)"
```

Thêm dòng trên vào `~/.bashrc`/`~/.zshrc` nếu muốn mọi phiên terminal có sẵn.
Không dán giá trị key vào chat, commit, hay file cấu hình.

## OpenCode

Đã cấu hình ở **global** `~/.config/opencode/opencode.json` (không đưa vào
`opencode.json` của repo để VPS không thấy server chết):

```json
{
  "mcp": {
    "obsidian": {
      "type": "remote",
      "url": "http://127.0.0.1:27123/mcp/",
      "oauth": false,
      "headers": {
        "Authorization": "Bearer {file:~/.secrets/obsidian-api-key}"
      }
    }
  }
}
```

`{file:…}` đọc key trực tiếp từ file — không cần export biến. Kiểm tra:

```bash
opencode mcp list          # obsidian  connected
```

Nếu bản OpenCode khác không hỗ trợ `{file:…}` trong header, đổi thành
`"Bearer {env:OBSIDIAN_API_KEY}"` và export biến như trên.

## Claude Code

File `.mcp.json` ở repo root (đã có sẵn):

```json
{
  "mcpServers": {
    "obsidian": {
      "type": "http",
      "url": "http://127.0.0.1:27123/mcp/",
      "headers": { "Authorization": "Bearer ${OBSIDIAN_API_KEY}" }
    }
  }
}
```

Claude Code dùng cú pháp `${VAR}` và **bắt buộc** `"type": "http"` cho remote.
Kiểm tra bằng `claude mcp list`.

## Cursor

File `.cursor/mcp.json` (đã có sẵn):

```json
{
  "mcpServers": {
    "obsidian": {
      "url": "http://127.0.0.1:27123/mcp/",
      "headers": { "Authorization": "Bearer ${env:OBSIDIAN_API_KEY}" }
    }
  }
}
```

Cursor dùng `${env:VAR}` và không cần `type` cho remote server. Biến phải có
trong môi trường **lúc Cursor khởi động** — mở Cursor từ terminal đã export nếu
desktop entry không thấy biến.

Đã có báo cáo `${env:VAR}` trong `headers` của remote server không được nội suy
ở một số bản Cursor. Nếu gặp: copy entry sang `~/.cursor/mcp.json` (user-level,
**không commit**) và dán key trực tiếp, hoặc dùng một server MCP stdio bọc HTTP.

## VS Code / GitHub Copilot

File `.vscode/mcp.json` (đã có sẵn) dùng input prompt, key lưu trong secret
store của VS Code:

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "obsidian-api-key",
      "description": "Obsidian Local REST API key",
      "password": true
    }
  ],
  "servers": {
    "obsidian": {
      "type": "http",
      "url": "http://127.0.0.1:27123/mcp/",
      "headers": { "Authorization": "Bearer ${input:obsidian-api-key}" }
    }
  }
}
```

Lưu ý: VS Code dùng key `servers` (không phải `mcpServers`). Chạy
`MCP: List Servers` để xem trạng thái.

## Codex CLI

Codex đọc `~/.codex/config.toml` (user-level). Thêm:

```toml
[mcp_servers.obsidian]
url = "http://127.0.0.1:27123/mcp/"
bearer_token_env_var = "OBSIDIAN_API_KEY"
```

Hoặc:

```bash
codex mcp add obsidian \
  --url http://127.0.0.1:27123/mcp/ \
  --bearer-token-env-var OBSIDIAN_API_KEY
```

`bearer_token_env_var` là **tên biến**, Codex tự thêm `Bearer `. Kiểm tra:
`codex mcp list`.

## Trạng thái kiểm chứng

| Client      | Cấu hình                                  | Đã chạy thật trên máy này?                                          |
| ----------- | ----------------------------------------- | ------------------------------------------------------------------- |
| OpenCode    | global `~/.config/opencode/opencode.json` | ✅ `obsidian connected`, `vault_list`/`vault_read` trả dữ liệu thật |
| Claude Code | `.mcp.json`                               | ❌ máy chưa cài `claude`                                            |
| Cursor      | `.cursor/mcp.json`                        | ❌ máy chưa cài `cursor`                                            |
| VS Code     | `.vscode/mcp.json`                        | ❌ máy chưa cài `code`                                              |
| Codex       | `~/.codex/config.toml`                    | ❌ máy chưa cài `codex`                                             |

Cấu hình các client còn lại theo tài liệu chính thức; chưa chạy thật nên chưa
coi là đã xác nhận.

## Kiểm chứng nhanh (không cần client)

```bash
KEY="$(cat ~/.secrets/obsidian-api-key)"

# REST sống + đã xác thực
curl -s -H "Authorization: Bearer $KEY" http://127.0.0.1:27123/ | head -5

# Liệt kê vault
curl -s -H "Authorization: Bearer $KEY" http://127.0.0.1:27123/vault/ | head -5
```

MCP là Streamable HTTP: gọi `tools/list` trần sẽ trả
`"Server not initialized"` — phải `initialize` trước (client MCP tự làm). Đó
không phải lỗi cấu hình.

## Bảo mật

- Key = toàn quyền đọc/ghi/xoá vault. Đối xử như mật khẩu.
- Chỉ bind loopback. **Không** đổi bind host sang `0.0.0.0` hay mở cổng ra
  Internet; cần truy cập từ xa thì dùng SSH tunnel:
  `ssh -L 27123:127.0.0.1:27123 user@may-chu`.
- Không commit `.obsidian/`, `second-brain/`, hay bất kỳ file chứa key.
- Xoay key: tạo key mới, ghi vào `data.json` + `~/.secrets/obsidian-api-key`,
  cập nhật client, rồi khởi động lại Obsidian.
- Agent chỉ nên ghi vào `second-brain/`; `docs/` vẫn là nguồn sự thật và đi qua
  PR như mọi thay đổi code.

## Sự cố thường gặp

| Triệu chứng                        | Nguyên nhân / cách sửa                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `Connection refused` cổng 27123    | Obsidian chưa chạy, hoặc plugin chưa bật. `obsidian-cli plugins:enabled filter=community` phải thấy `obsidian-local-rest-api`. |
| `401 Unauthorized`                 | Key sai hoặc client gửi thiếu `Bearer `. So lại `data.json` với `~/.secrets/obsidian-api-key`.                                 |
| `Server not initialized`           | Gọi MCP bằng curl thủ công — cần `initialize` + `Mcp-Session-Id`. Client thật tự làm.                                          |
| Tool không xuất hiện               | Client chưa reload; khởi động lại client. Với Cursor/VS Code, biến môi trường phải có lúc app khởi động.                       |
| Chạy trên VPS thấy server `failed` | Bình thường — VPS không có Obsidian. Xoá entry hoặc đặt `enabled: false`.                                                      |
| Obsidian chậm / index quá nhiều    | Kiểm tra `userIgnoreFilters` trong `.obsidian/app.json` (node_modules, dist, coverage, .git).                                  |

## Cài lại trên máy mới

1. Cài Obsidian desktop, mở repo làm vault.
2. Cài plugin **Local REST API with MCP** (community plugin) hoặc chép thư mục
   `.obsidian/plugins/obsidian-local-rest-api/`.
3. Bật plugin; tạo key: `mkdir -p ~/.secrets && openssl rand -hex 32 > ~/.secrets/obsidian-api-key && chmod 600 ~/.secrets/obsidian-api-key`.
4. Ghi `data.json` với `port`, `insecurePort`, `enableInsecureServer: true`,
   `enableSignedUrls: true`, `apiKey` — **không** đưa file này vào git.
5. Khởi động lại Obsidian; kiểm tra `ss -ltn | grep 2712`.
6. Cấu hình client theo mục tương ứng ở trên.

## Liên quan

- `.opencode/skills/second-brain/SKILL.md` — cách agent dùng vault.
- `.opencode/skills/chat-archive/SKILL.md` — lưu hội thoại vào `second-brain/hoi-thoai/`.
- Plugin: <https://github.com/coddingtonbear/obsidian-local-rest-api>
