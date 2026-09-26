# Bản đồ repo thu gọn

> Agent đọc file này qua skill **repo-map** thay vì khám phá từ đầu.
> Cập nhật khi thêm/xoá trang/panel/module/Convex function — không cập nhật
> vì đổi logic bên trong. Mỗi dòng: 1 đơn vị + mô tả ngắn.

## Kiến trúc tổng

```
bot/ (discord.js, Bun, pm2 trên VPS) ⇄ convex/ (DB + backend) ⇄ src/ (React+Vite dashboard)
                                                      ⇄ protogon.freebuff.app (Freebuff hosting)
```

- Cấu hìnhbot ⇄ dashboard đồng bộ qua Convex, trễ ~1 phút.
- Deploy Convex: CI tự chạy sau push main (lint+test xanh); VPS agent cũng
  deploy được qua guardrail 4 lớp (xem `docs/opencode-vps-guide.md`).

## src/ — dashboard web

| Trang                       | Vai trò                                                |
| --------------------------- | ------------------------------------------------------ |
| `pages/Landing.tsx`         | Trang chủ mono + Taskbar pill trái + hero stagger      |
| `pages/AuthPage.tsx`        | Đăng nhập Discord OAuth                                |
| `pages/Dashboard.tsx`       | Danh sách server của user                              |
| `pages/GuildPage.tsx`       | Trang cấu hình 1 server (tabs → các panel dưới)        |
| `pages/Monitor.tsx`         | Giám sát thời gian thực (chart, sự cố)                 |
| `pages/StatsPage.tsx`       | Thống kê tổng                                          |
| `pages/Admin.tsx`           | Trang admin                                            |
| `pages/GuildHistory.tsx`    | Lịch sử sự kiện server                                 |
| `pages/DiscordCallback.tsx` | Bắt callback OAuth                                     |
| `pages/LegalPage.tsx`       | Văn bản pháp lý (/terms, /privacy, /data-deletion)     |
| `pages/FeaturesPage.tsx`    | Trang tính năng công khai (/features, SEO 3 thứ tiếng) |
| `pages/NotFound.tsx`        | 404                                                    |

| Component nhóm               | Vai trò                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `components/dashboard/`      | Các panel cấu hình: Overview, Webhook, Verify, JoinGate, Settings (theme xám), Branding…             |
| `components/landing/`        | Nav, Footer, sections trang chủ                                                                      |
| `components/ui/`             | shadcn/ui nền tảng (button border-first, card mono)                                                  |
| `components/Taskbar.tsx`     | Pill dọc trái + panel điều hướng nhanh (Escape/click-outside)                                        |
| `components/HaimiyaChat.tsx` | Chat nhân vật Haimiya (giữ màu brand illustration)                                                   |
| `components/LangSwitch.tsx`  | Công tắc ngôn ngữ VI/EN/DE — nhúng vào chrome mọi trang (nav, taskbar, header dashboard, trang auth) |
| `lib/i18n.tsx`               | Lõi đa ngôn ngữ gettext: LangProvider/useT, `translate()` toàn cục, `dateLocale()`                   |
| `lib/i18n.en.ts`             | Từ điển EN (key = nguyên chuỗi tiếng Việt); thiếu key thì rơi về VI                                  |
| `lib/legalContent.ts`        | Nội dung 3 văn bản pháp lý × VI/EN/DE (cổng 3f check-i18n kiểm cấu trúc)                             |
| `lib/useBotMonitor.ts`       | Hook trạng thái bot realtime                                                                         |
| `lib/constants.ts`           | SERVER_THEMES (đã mono xám), hằng số                                                                 |

## bot/ — Discord bot (CommonJS, chạy pm2 `protogon`)

| Nhóm                                                           | Vai trò                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------- |
| `index.js`                                                     | Khởi động + login                                                   |
| `threatEngine.js`, `heat.js`, `altDetection.js`, `lockdown.js` | Nhóm antinuke/raid                                                  |
| `commands/`, `handlers/`                                       | Slash commands + event handlers                                     |
| `convex.js`                                                    | Client Convex của bot                                               |
| `webhookHub.js`, `relayClient.js`                              | Relay/log sang webhook                                              |
| `localSnapshot.js`, `backupUtils.js`, `backupAudit.js`         | Backup                                                              |
| `actionBudget.js`, `memGuard.js`                               | Giới hạn hành động/bộ nhớ                                           |
| `captchaStore.js`, `joinGate`                                  | Join Gate captcha chống selfbot                                     |
| `externalAppGuard.js`, `flaggedMessages.js`                    | Chặn app ngoài + tin nhắn khả nghi                                  |
| `moduleActions.js`, `tick.js`, `timeoutWatch.js`, `misfire.js` | Điều phối module + chu kỳ + theo dõi timeout + misfire AI (vòng 11) |
| `caseLog.js`, `register-slash.js`, `loadenv.js`                | Log case + đăng ký slash + nạp env                                  |
| `research.js`                                                  | Tra cứu/threat research hỗ trợ AI                                   |
| `ai.js`                                                        | Client AI trực tiếp từ VPS (Kira gateway + fallback Groq/NVIDIA)    |
| `util.js`                                                      | Tiện ích dùng chung: quyền, định dạng, helper                       |
| `logDedupe.js`                                                 | Chống gửi trùng log (cùng embed + cùng kênh trong 3s)               |

## convex/ — backend

| Nhóm                                                              | Vai trò                                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `schema.ts`                                                       | Schema DB duy nhất                                                                    |
| `auth.ts`, `sessions.ts`, `sessionAuth.ts`, `sessionHardening.ts` | Auth dashboard                                                                        |
| `botAuth.ts`, `botBootstrap.ts`                                   | botKey SHA-256, bootstrap — KHÔNG backdoor                                            |
| `antinuke.ts`, `threatIntel.ts`                                   | Logic antinuke phía backend                                                           |
| `haimiya.ts`                                                      | Provider AI bot (self-heal fallback, không hardcode model cũ)                         |
| `altDetection.ts`                                                 | Chặn tài khoản phụ/trùng dấu hiệu (markJoinPunished theo cấu hình server)             |
| `autoreplies.ts`                                                  | CRUD rule auto reply (giới hạn 50 rule/server)                                        |
| `guilds.ts`                                                       | Document server + cấu hình bot ⇄ dashboard; botSyncGuilds gộp heartbeat + sức khỏe AI |
| `modules.ts`, `presets.ts`                                        | Bật/tắt module + bộ preset an toàn                                                    |
| `botFunc.ts`, `bot_tick.ts`, `bot_writes.ts`                      | Function bot gọi: tick chu kỳ, ghi dữ liệu                                            |
| `botBootstrap.ts`, `botBootstrapAction.ts`                        | Bootstrap bot lần đầu (lấy botKey)                                                    |
| `webhooks.ts`, `relay.ts`                                         | Webhook + relay log sự kiện                                                           |
| `backup_github.ts`                                                | Backup lên GitHub (kèm `backup.ts`)                                                   |
| `rateGuard.ts`                                                    | Giới hạn tần suất gọi API từ bot                                                      |
| `public.ts`, `hidden.ts`                                          | API công khai landing + endpoint ẩn                                                   |
| `http.ts`                                                         | httpRouter `/geo_lang`: dò quốc gia theo IP cho web tự chọn ngôn ngữ                  |
| `selfDiagnose.ts`                                                 | Tự chẩn đoán bot báo về dashboard                                                     |
| `sha256.ts`                                                       | Hash dùng chung (botKey, session)                                                     |
| `audit.ts`, `reports.ts`, `status.ts`                             | Log/sự kiện/trạng thái; getAiHealth chỉ owner đọc                                     |
| `_generated/`                                                     | Sinh tự động — không sửa tay, `bun convex dev --once`                                 |

## Vòng lặp làm việc

- Kiểm chứng: `bun run test` (61 CJS suites) · `bun run test:ts` (9 TS suites) · `bun tsc -b --noEmit` ·
  `bun run lint` · `bun run format:check` — chi tiết gộp 1 lệnh xem skill
  `verification-loop`.
- Kiểm tra cấu trúc: `scripts/check-repo-map.cjs` (bản đồ khớp thật) +
  `scripts/check-convex-contract.cjs` (tên function bot gọi tồn tại phía
  Convex) +
  `scripts/check-i18n.cjs` (mọi chuỗi người dùng có bản EN) — CI chạy cả 3
  trong job lint.
- Đa ngôn ngữ: UI viết chuỗi tiếng Việt thẳng trong JSX rồi bọc
  `translate("…")` (key = chuỗi VI). Thêm chuỗi mới → chạy
  `node scripts/check-i18n.cjs` để biết key nào còn thiếu bản EN; hằng số
  cấp module (mảng nhãn sidebar…) phải dịch lúc render, không dịch lúc
  import.
- Hạ tầng VPS 3 vùng quyền 🟢🟡🔴: `docs/opencode-vps-guide.md` +
  `AGENTS.md` mục 3.
