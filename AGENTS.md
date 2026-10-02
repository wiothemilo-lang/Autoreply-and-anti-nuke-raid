# AGENTS.md — Bản hợp đồng làm việc cho AI agent trong repo Protogon

> Áp dụng cho **mọi** agent AI làm việc trong repo này: OpenCode trên VPS, Freebuff,
> hoặc agent khác. Mục tiêu: agent làm việc có kỷ luật — **có kế hoạch, có kiểm chứng,
> có báo cáo** — không phải gõ lệnh may rủi.
>
> Repo chứa **bot Discord production** + **dashboard web** đang chạy thật. Hãy làm việc
> như một kỹ sư cẩn trọng, không phải một người thử nghiệm.

## 0. Nhận diện công việc trước khi làm

| Thành phần    | Vị trí                                                        | Công nghệ                                        |
| ------------- | ------------------------------------------------------------- | ------------------------------------------------ |
| Bot Discord   | `bot/`                                                        | discord.js, CommonJS, chạy Bun trên VPS          |
| Dashboard web | `src/`                                                        | React + Vite + Tailwind + shadcn/ui (TypeScript) |
| Backend/DB    | `convex/`                                                     | Convex functions (TypeScript)                    |
| Test          | `scripts/test-*.cjs` (CommonJS), `scripts/test-*.ts` (Convex) | node:test                                        |

Khi nhận việc, **tự phân loại** rồi đi đúng nhánh:

- 🐛 **Bug thật** → tìm gốc rễ trước khi vá; vá xong phải kèm test chặn tái diễn
- ✨ **Feature mới** → làm nhỏ, có test, chạy đủ bộ kiểm chứng (mục 3)
- 🔧 **Refactor** → KHÔNG đổi hành vi; test cũ phải vẫn xanh; không gộp với feature khác
- 📄 **Docs/cấu hình** → không cần test nhưng phải lint sạch

## 1. Workflow chuẩn — luôn đi đủ 5 pha

### Pha 1 — HIỂU (chưa sửa file nào cả)

1. `git status` + `git log --oneline -5` — nắm trạng thái working tree và công việc gần nhất
2. Đọc code liên quan (dùng search/grep, không đọc cả file lớn khi chỉ cần một đoạn)
3. Nếu yêu cầu mơ hồ → **dừng và hỏi**, đừng đoán. Đưa phương án kèm đề xuất thay vì hỏi mở

### Pha 2 — LẬP KẾ HOẠCH (todo)

Việc cần **hơn 2 bước thao tác** thì PHẢI lập todo trước khi sửa file đầu tiên:

- OpenCode: dùng công cụ `todowrite` / `todoread`
- Freebuff: dùng `write_todos`

Mỗi mục todo = một kết quả kiểm chứng được, không phải một vùng code chung chung.
❌ `"Sửa dashboard"` → ✅ `"Thêm bảng top heat vào trang /stats + test hermetic"`

### Pha 3 — THỰC HIỆN từng bước nhỏ

- Làm đúng **một mục todo** một lúc; xong cái nào cập nhật todo cái đó (không đợi cuối)
- Việc phát sinh giữa chừng → **thêm vào todo** rồi làm, không làm lén ngoài kế hoạch
- **Skills tự kích hoạt theo ngữ cảnh** (đọc qua mô tả skill rồi nạp khi khớp —
  14 skills trong `.opencode/skills/`):
  - Nhánh việc: debug bug thật → `debugging-and-error-recovery`; đụng
    input/auth/data/dependency → `security-and-hardening`; vá logic/đổi hành
    vi → `test-driven-development`; quyết định rủi ro cao ở production →
    `doubt-driven-development`; trước merge → `code-review-and-quality`;
    đổi tên/xoá function Convex hoặc thêm call từ bot →
    `convex-contract-guard`; đụng `convex/schema.ts` →
    `schema-migration-safety`; audit bảo mật lớn gọi `/audit`
  - Nền tảng phiên: đầu phiên → `repo-map` (định hướng) + `progress-journal`
    (chỗ dừng) + `decision-log` (quyết định chốt sẵn); lập kế hoạch ≥3 bước
    → `strategy-mindmap`; đọc file/chạy lệnh nhiều → `token-economy`; chạy
    kiểm chứng → `verification-loop` (gộp 1 lệnh + re-check tối thiểu)
- Giữa các bước, tóm tắt ngắn (progress note) những gì vừa làm + phát hiện — người theo
  dõi phải hiểu tiến độ mà không cần đọc diff

**Khi phiên bị gián đoạn** (lỗi "AI service stream failed", người dùng gõ
`continue`/`tiếp đi`/`làm tiếp`): **TIẾP TỤC ĐÚNG CHỖ DỪNG** — đọc lại todo +
file đã sửa gần nhất để xác định đã xong đến đâu, làm nốt phần còn thiếu.
KHÔNG làm lại từ đầu, KHÔNG hỏi lại mục tiêu. Cứ đi đến khi đủ Pha 4 (kiểm
chứng xanh) + Pha 5 (báo cáo) rồi mới dừng — trừ khi người dùng chủ động bảo
thôi. Khi nghi file có thể sửa dở: xem `git diff` trước khi sửa tiếp.

### Pha 4 — XÁC MINH (ranh giới "xong việc")

Đơn vị công việc chỉ coi là XONG khi tất cả điều này thoả:

- [ ] `bun run test` — toàn bộ suites xanh (hiện tại **83 suites** — số liệu 02/10/2026; đếm theo lệnh này, KHÔNG cộng suite .ts của `bun run test:ts`. Nếu runner báo ít hơn nhiều → có suite bị bỏ sót, điều tra trước khi kết luận xanh). Số liệu này phải khớp với `CONTRACT_SUITES` trong `.opencode/plugins/guardrails.js` — đổi suite mới phải sửa CẢ HAI chỗ trong cùng commit
- [ ] `bun run test:ts` — 21 suite tầng Convex/Haimiya/bot/web viết bằng TypeScript (chạy bằng bun; tách khỏi `bun run test` để không đụng phép đo coverage c8). Đụng `convex/`, `bot/src/ai.js`, logic panel hoặc thẻ ảnh `bot/src/handlers/welcomeCard.js` thì bắt buộc chạy
- [ ] `bun tsc -b --noEmit` — typecheck sạch
- [ ] `bun run lint` — sạch
- [ ] `node scripts/check-repo-map.cjs` — bản đồ khớp cấu trúc thật (chỉ khi
      thêm/xoá trang/panel/module/Convex function; CI cũng chặn bước này)
- [ ] `node scripts/check-convex-contract.cjs` — hợp đồng bot ⇄ Convex khớp
      (chỉ khi đổi tên/di chuyển function Convex hoặc thêm/sửa call từ bot;
      CI cũng chặn bước này) - [ ] `node scripts/check-i18n.cjs` (kèm `--self-test`) — mọi chuỗi người dùng đều có bản EN
      (chỉ khi thêm/sửa chuỗi UI hoặc từ điển `src/lib/i18n.en.ts`; CI cũng
      chặn bước này). Chuỗi UI viết thẳng bằng tiếng Việt rồi bọc
      `translate("…")` — key chính là chuỗi VI đó
- [ ] `node scripts/check-settings-signal.cjs` (kèm `--self-test`) — mọi
      mutation ghi field bot đọc phải có đường tới bot NGAY: `settingsChangedAt`
      (dashboard sửa) hoặc nằm trong `CONFIG_WRITE_MUTATIONS` của bot (bot tự ghi →
      proxy tự xoá cache). Chỉ khi đụng `convex/` (mutation cấu hình) hoặc thêm
      mutation `bot_writes:*` mới; CI cũng chặn. Thêm mutation cấu hình mới mà
      quên tín hiệu → thay đổi từ dashboard trễ tới 30 phút (bug thật 23/09)
- [ ] `bun run format:check` — format Prettier sạch. Lệch format → chạy `bun run format` rồi kiểm tra lại (đây là biến đổi tất-định, tự sửa được; CI đã đỏ 5 run liên tiếp vì quên bước này — 19/09/2026)
- [ ] Đụng file trong `convex/` → chạy `bun convex dev --once` (codegen) **trước** typecheck
- [ ] Bug thuộc engine đã có test (antinuke, altDetection, heat, joinGate, backup,
      oauth client id…) → **đã thêm test chặn tái diễn** đúng nơi với test cũ
- [ ] Chưa từng claim "đã chạy/đã xanh" khi chưa chạy thật

Các lệnh kiểm chứng đã được allow sẵn trong `opencode.json` — chạy thẳng, không cần hỏi.

### Pha 5 — BÁO CÁO + COMMIT

1. Báo cáo ngắn gọn, cấu trúc: **đã làm gì → kiểm chứng gì, kết quả số → việc còn lại
   (nếu có)**. Không viết văn dài; bảng khi so sánh nhiều mục.
2. `git add` **chọn lọc đúng file thuộc việc này** + `git commit`:
   - Message **tiếng Việt**, dòng đầu ≤72 ký tự, nói rõ _vì sao_ thay vì liệt kê máy móc
   - Footer bắt buộc: `🤖 Generated with OpenCode`
3. **Push sau khi báo cáo** — kiểm chứng xanh rồi mới đẩy. Trước push chạy
   `git pull --no-rebase --no-edit` để lấy commit mới từ Freebuff (sandbox đẩy
   thường xuyên; VPS không pull trước thì push bị "fetch first" — đã xảy ra 2
   lần 19/09/2026). Rồi `git push origin main`. Lỗi xác thực/thiếu quyền → in
   lệnh, nhờ người dùng tự chạy (Freebuff quản lý credential git, agent không
   tự cấu hình).

## 2. Điều khoản cứng — TUYỆT ĐỐI KHÔNG

1. **Không đọc file secret**: `.env`, `bot/.env`, `bot/.bot-key`, `*.pem`, `*.key`.
   Permission trong `opencode.json` đã chặn. Nếu thấy cần nội dung env để trả lời →
   **dừng, hỏi người dùng**, không tìm lối tắt khác. Không bao giờ "giúp" bỏ qua
   `requireBotKeyStrict` hay cơ chế `botKey` (`convex/botAuth.ts`) — không có backdoor.
2. **Không `reset` / `clean` / `rebase` / sửa lịch sử.** `git add` + `git commit`
   được phép (điều khoản 5 phía trên). `git push` ĐƯỢC PHÉP **với điều kiện**:
   đã chạy đủ bộ kiểm chứng (test + typecheck + lint) XANH trong phiên và chỉ
   đẩy lên `main` sau khi đã báo cáo kết quả cho người dùng. Chưa kiểm chứng →
   chưa push. Gặp lỗi xác thực khi push → in lệnh cho người dùng tự chạy,
   không tìm lối tắt quanh credentials.
3. **Hạ tầng VPS — 3 vùng quyền** (permission + guardrails trong repo chặn nghiêm):

   | Vùng             | Bao gồm                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Agent được gì                                                                                                  |
   | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
   | 🟢 **TỰ LÀM**    | Chẩn đoán read-only: `systemctl status/is-active`, `journalctl`, `docker ps/logs/stats`, `df`, `free`, `ps`, `du`, `uptime`. Tự chữa **kiira-retry-proxy**: sửa code/unit → `systemctl restart kiira-retry-proxy` → bắt buộc `curl http://127.0.0.1:8787/__health` thấy `"ok":true` mới coi là xong. **Deploy bot** (`/deploy`): `git pull --no-rebase --no-edit` → `bun install` (lockfile đổi) → kiểm chứng đủ 4 lớp XANH → `pm2 restart protogon-bot` → bắt buộc `pm2 status` online + logs không crash loop — guardrail chỉ mở cổng restart sau khi cả 4 lớp xanh trong 15 phút. **Deploy Convex** (`/deploy`): pull mang thay đổi `convex/` → `npx convex deploy` (cùng cổng kiểm chứng); thiếu `CONVEX_DEPLOY_KEY` → nhờ người dùng export, **không in giá trị key ra chat/log/file** | Làm luôn, không cần hỏi                                                                                        |
   | 🟡 **HỎI TRƯỚC** | `pm2 delete/stop` bot, `pm2 startup/system`, `docker restart/stop`; `kill`; thay đổi unit file của dịch vụ khác                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Chẩn đoán xong → **in đúng lệnh + giải thích nguyên nhân**, người dùng tự chạy (hoặc trả lời "ok" thì mới làm) |
   | 🔴 **CẤM**       | `systemctl cat/show` (unit chứa Environment= với token), `docker inspect/exec/cp/commit`, `/proc/*/environ`, `printenv` (rò secret hạ tầng); `ufw`/`iptables` (tường lửa); `reboot`/`shutdown`; `docker system/volume prune` (xoá dữ liệu)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Không bao giờ — kể cả "để debug"                                                                               |

   Quy trình tự chữa hạ tầng chuẩn: `/health` → đọc nguyên nhân bằng công cụ 🟢 →
   sửa thứ thuộc tay mình (repo config + proxy) → kiểm chứng → báo cáo. Lỗi nằm
   ngoài vùng 🟢 → báo cáo kèm lệnh cho người dùng, không mò.

   **Deploy bot production** — dùng lệnh `/deploy`, quy trình cứng: pull → kiểm
   chứng đủ → restart → xác minh sống. Convex backend không deploy tay: CI tự
   `npx convex deploy` sau mỗi push lên `main` (job deploy chạy sau lint + test).

4. **Không cài dependency mới khi chưa hỏi.** Bot chạy Bun — ưu tiên thứ đã có trong
   `bot/package.json` / `package.json`. Lưu ý: `bun install` theo đúng lockfile trên máy
   mới **không phải** cài dependency mới — được phép, nhưng nên báo trước một dòng.
5. **Không sửa `convex/_generated/`** — sinh tự động bằng `bun convex dev --once`.
6. **Không đụng `vite.config.ts`** — `server.hmr: false` là có chủ đích (Freebuff yêu cầu).
7. **Không tạo framework test mới** — bám cấu trúc hiện có (mục 0).

## 3. Chuẩn code

- **Tiếng Việt** trong comment, log, user-facing string — sản phẩm tiếng Việt.
- Bot CommonJS trong `bot/src/`; test bot CommonJS `scripts/test-*.cjs`; test Convex TS
  `scripts/test-*.ts`.
- Sửa lỗi xong phải giải thích được **gốc rễ**, không phải chỉ "nó chạy rồi".
- Ưu tiên sửa file có sẵn, tránh sinh file mới trùng chức năng.
- Dashboard đồng bộ bot qua Convex trong ~1 phút — đừng kỳ vọng realtime khi test luồng cấu hình.

## 4. Bối cảnh dự án cần biết

- **Kiến trúc**: `bot/` (discord.js trên VPS) ⇄ Convex (DB + backend) ⇄ `src/` (dashboard web).
- **Bảo mật**: action bảo mật cao dùng `botKey = SHA-256("protogon-bot-key::" + OWNER_SEED)`
  (`convex/botAuth.ts`). Bot tự bootstrap key và cache vào `bot/.bot-key` (đã gitignore).
- **CI**: lint (kèm check repo-map + hợp đồng bot⇄Convex) → test (coverage
  floor) → deploy Convex. Thay đổi làm CI đỏ coi như chưa xong.
- **Hợp đồng bot ⇄ Convex**: bot gọi function bằng tên chuỗi
  (`"bot_writes:botClaimBackup"`) — tsc không phủ; đổi tên function phải grep
  - sửa cả 2 phía, script `check-convex-contract.cjs` chốt hạ.
- **Thẻ ảnh chào (`bot/src/handlers/welcomeCard.js`)**: bot tự vẽ PNG 900×300 mỗi lượt join/leave → **cần dependency native `@napi-rs/canvas` trong `bot/`** (cài bằng `bun install` trong `bot/`) và **font nhúng** `bot/assets/fonts/NotoSans-Regular.ttf` (OFL, kèm `OFL.txt`). Font phải nhúng: nhiều máy chủ không có font hệ thống (`GlobalFonts.families === 0`) → `fillText` im lặng không vẽ gì. Thiếu thư viện/font → bot KHÔNG vỡ: lùi về embed thường và báo lý do qua `status:reportCardCapability` để dashboard hiển thị.
- **Vấn đề đã biết**: Groq retire `llama-3.3-70b-versatile` 08/2026 — self-heal
  fallback `openai/gpt-oss-120b` có ở cả `convex/haimiya.ts` lẫn `bot/src/ai.js`
  (mặc định bot đã đổi sang model sống; Kira mặc định `mimo-v2.5` theo danh sách
  live 20/09/2026); đừng hardcode lại model cũ.
  Gateway Kiira (`KIRA_API_KEY`/`KIRA_BASE_URL`/`KIRA_MODEL`) là provider AI chính của bot.
- **OAuth dashboard**: `DISCORD_CLIENT_ID` phải là snowflake số (regex `^\d{15,21}$`) —
  đã có bộ lọc `pickValidClientId` + test `scripts/test-oauth-client-id.cjs` chặn giá trị rác.

## 5. Lệnh hữu ích

```
bun run test              # toàn bộ test suites (~1 phút, chạy song song; thêm --serial để chạy tuần tự) — chạy sau MỌI thay đổi logic
bun tsc -b --noEmit       # typecheck
bun run lint              # ESLint
bun run test:coverage     # test + đo coverage (c8, có ngưỡng chặn)
bun run test:mutation     # mutation testing (phải 100% kill)
bun run smoke:vps         # smoke test môi trường VPS (env + module + Discord login)
sh ./scripts/setup-vps-agent.sh   # cài lại môi trường + OpenCode trên VPS
```

---

_Tài liệu này là hợp đồng: đổi nó phải có lý do chính đáng và ghi rõ trong commit message._
