# Đợt #4 — `setInterval` của bot sang Convex cron

> Ngày: 03/10/2026. Kết quả: **3/28** vòng `setInterval` chuyển được sang cron
> phía Convex, **25/28** phải ở lại tiến trình bot — và đây là kết luận có chủ ý,
> không phải việc làm dở.

## Vì sao không chuyển hết

Convex cron chạy trong môi trường server của Convex: chạm được database
(`ctx.db`), nhưng **không** có tiến trình bot — không có Discord client/gateway,
không có RAM của bot, không có đĩa VPS. Một `setInterval` mà thân hàm cần những
thứ đó sẽ chết ngay khi chuyển lên cron (hoặc tệ hơn: chạy được nhưng im lặng
làm hỏng việc).

Nên quy tắc chốt cho đợt này:

- **Chuyển được** — vòng chỉ _quyết định việc gì cần làm_ rồi ghi cờ xuống
  `guilds`; phần thực thi nặng vẫn chạy ở bot.
- **Giữ lại** — vòng đọc/ghi trạng thái trong RAM của tiến trình bot, gọi
  Discord API, đọc/ghi đĩa VPS, hoặc giữ bộ nhớ ngắn hạn trong module.

## Mẫu chuyển đổi (cờ trên Convex, bot xử lý ở tick)

```
cron (internalMutation)          →  bot (tick chu kỳ)
─────────────────────────────         ─────────────────────────
quét guild đến hạn                  batch tick gọi bot_tick:getPendingJobs
đặt cờ reportRequestedAt /     →     nhận danh sách guildId cần việc
     backupRequested                thực thi (gửi embed / chạy backup)
                                    xoá cờ qua mutation sẵn có
                                    (botSetReportAt / botClaimBackup)
```

Bốn điểm cố ý giữ trong mẫu này:

1. Cron **chỉ tính + đặt cờ**, không thực thi — nên job không bao giờ chạm
   Discord từ phía server.
2. Bot đọc cờ **TƯƠI** qua batch tick `bot_tick:getPendingJobs`, không đi qua
   bundle cache `getBotConfig` (cache 30 phút sẽ giấu cờ mới → job trễ).
3. Cờ **còn nguyên = bot chưa xử lý** (bot offline, hoặc cấu hình vừa bị tắt).
   Lượt sau thử lại, không im lặng bỏ sót — không có hạn dùng nên không mất việc.
4. Chống trùng nằm ở phía server (`lastReportAt`, `backupClaimedAt`), không nằm ở
   RAM bot — bot restart không chạy lại job đã xong.

## 3 vòng đã chuyển

| Vòng cũ (`setInterval`)                                                                  | Cron mới (`convex/crons.ts`)         | Mutation quét                           | Bot xử lý ở                            |
| ---------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------- | -------------------------------------- |
| `autoBackupInterval` 1 giờ (đã xoá khỏi `index.js`, `backupJobs.autoBackupSweep` đã xoá) | `auto-backup-sweep` mỗi **1 giờ**    | `internal.backup.sweepDueAutoBackups`   | `runBackupJobs` (tick)                 |
| `reportInterval` 15 phút (đã xoá khỏi `index.js`)                                        | `daily-report-sweep` mỗi **30 phút** | `internal.reports.sweepDueDailyReports` | `dailyReport.processReportJobs` (tick) |

Hai mutation quét là `internalMutation` (chỉ gọi được bằng cron/`internal.*`),
không nhận botKey — không mở thêm mặt cửa cho bot.

- `sweepDueAutoBackups`: quét `by_botInGuild`, bỏ qua `autoBackupDays <= 0`,
  `backupRequested` đang chờ, chưa tới hạn, `claimIsActive(backup…)`,
  `claimIsActive(restore…)`; kế thừa `includeMessages` từ bản `guildBackups` gần
  nhất để hành vi khớp bản backup trước.
- `sweepDueDailyReports`: bỏ qua `dailyReportEnabled === false`, thiếu
  `logChannelId`, `reportRequestedAt` đang chờ, và guild gửi trong 20h gần nhất
  (ngưỡng `MIN_REPORT_INTERVAL_MS` phải khớp bot — có test chặn hồi quy).

Đổi hành vi có chủ ý: báo cáo ngày trễ tối đa 30 phút (thay vì 15) vẫn nằm trong
ngày; auto-backup trễ tối đa 1 giờ nhưng lịch tính theo ngày nên không đổi kết quả.

## 25 vòng giữ lại trong bot (kèm lý do)

> Đếm theo lần khảo sát đầu đợt (28 vòng − 3 đã chuyển). Trong đó 5 vòng dọn
> RAM đã được GOM về một vòng sweep chung (`bot/src/sweeper.js`) nhưng vẫn ở
> lại tiến trình bot — cổng `check-cron-boundary.cjs` giữ nguyên ranh giới này.

**Dọn bộ nhớ trong RAM của tiến trình** — cron không có RAM để dọn, và nếu dọn
bằng cách đọc lại từ DB thì tốn reads vô ích mỗi phút. Năm vòng này trước đây
mỗi module tự dựng timer riêng lúc `require`; nay đã gom về **MỘT** vòng sweep
chung `bot/src/sweeper.js` (xem mục kế bên), mỗi việc giữ chu kỳ RIÊNG:

| Việc (module)                   | Chu kỳ  | Nội dung                                                      |
| ------------------------------- | ------- | ------------------------------------------------------------- |
| `captchaStore.js`               | 5 phút  | Xoá mã captcha hết hạn                                        |
| `handlers/filters.js`           | 5 phút  | Xoá bucket chống spam                                         |
| `handlers/interactionVerify.js` | 5 phút  | Xoá rate-limit xác minh tương tác                             |
| `handlers/antinuke/index.js`    | 20 giây | tickUnlocks/tickHeatResets/tickVandalReleases + `sweepMemory` |
| `altDetection.js`               | 1 giờ   | Dọn `voiceIpMap`                                              |

**Chạm Discord/gateway (bot là nguồn sự thật)**:

| File:dòng                     | Chu kỳ  | Việc                                             |
| ----------------------------- | ------- | ------------------------------------------------ |
| `index.js:241`                | 60 giây | Đặt presence                                     |
| `index.js:301`                | 5 phút  | Heartbeat dự phòng (tick chính gắn heartbeat)    |
| `index.js:458`                | 6 giờ   | Quét tài khoản phụ                               |
| `timeoutWatch.js:193`         | 60 giây | Dọn bản ghi timeout hết hạn                      |
| `handlers/healthWatch.js:165` | 5 phút  | Canh đĩa/RAM + DM chủ (đọc `fs.statfs`, đĩa VPS) |

**Đọc/ghi trạng thái RAM rồi đẩy xuống Convex**:

| File:dòng              | Chu kỳ        | Việc                                                     |
| ---------------------- | ------------- | -------------------------------------------------------- |
| `index.js:263`         | 30 giây       | Flush heat theo batch                                    |
| `heat` liên quan tick  | 180 giây      | Vòng tick chu kỳ (đã có sẵn)                             |
| `metrics.js:352`       | theo cấu hình | Đẩy số đo prom-client lên Convex                         |
| `metricsRuntime.js:87` | 60 giây       | Lấy mẫu số đo trong RAM                                  |
| `metricsRuntime.js:93` | 5 phút        | In số đo ra stdout                                       |
| `localSnapshot.js:219` | 1 giờ         | Chụp snapshot cục bộ rồi đẩy lên                         |
| `memGuard.js:49`       | 10 phút       | Canh bộ nhớ tiến trình                                   |
| `tick.js:94`           | 4 phút        | Gia hạn claim backup (`startClaimRenewal`)               |
| `tick.js:375`          | 180 giây      | Vòng tick: backup/restore/import/verify/webhook/cấu hình |

**Tra cứu ngoài (mạng, không phải Discord)** — giữ ở bot vì kết quả nạp vào RAM
và dùng lại liên tục:

| File:dòng             | Chu kỳ        | Việc               |
| --------------------- | ------------- | ------------------ |
| `research.js:585`     | 10 phút       | Nạp lại nghiên cứu |
| `research.js:588`     | 4 giờ         | Nghiên cứu chậm    |
| `threatEngine.js:405` | theo cấu hình | Nạp feed URLhaus   |
| `threatEngine.js:410` | theo cấu hình | Nạp feed OpenPhish |
| `threatEngine.js:417` | theo cấu hình | Nạp n-gram         |
| `threatEngine.js:425` | theo cấu hình | Self-test từ khoá  |

## Vòng sweep chung của tiến trình bot (`bot/src/sweeper.js`)

Năm vòng dọn RAM phía trên trước đây là 5 `setInterval` riêng, mỗi cái một vòng
`try/catch` riêng và được dựng lúc `require` (test require module là bị giữ tiến
trình). Nay:

- Mỗi module **đăng ký** việc dọn của mình: `registerSweep(tên, fn, chuKỳ)`.
- `bot/src/index.js` gọi `startSweeper()` đúng một lần sau khi client sẵn sàng.
- Vòng quét lấy nhịp **nhỏ nhất** (20 giây = chu kỳ antinuke); mỗi việc giữ chu
  kỳ thật qua cổng đếm hạn ⇒ 5 phút vẫn 5 phút (+≤20 giây), 1 giờ vẫn 1 giờ.
  Không gộp về một chu kỳ chung vì trễ 5 phút ở nhánh mở khoá/reset heat là trễ
  hành vi thật.
- Lỗi của một việc bị bọc riêng, in `[sweeper:<tên>]`, không chặn việc khác và
  không làm bot chết (lỗi đồng bộ trong timer đi thẳng tới `uncaughtException`).
- Hệ quả: 5 timer → **1**; số lần gọi hàm 217/h → 270/h (trong đó 4/5 vòng là
  no-op vì chưa tới hạn).

## Cổng `check-cron-boundary.cjs` — cron chỉ được đặt cờ

Cron chạy ở nơi KHÔNG có tiến trình bot, nên "cron thông minh" (tự gửi embed,
tự chạy backup, tự viết trạng thái bot) không chạy được — hoặc chạy được rồi
hỏng âm thầm. Cổng chặn ngay ở CI (job lint, kèm `--self-test`):

| Luật   | Nội dung                                                                                                                                |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| **R1** | Target phải là `internalMutation` (không phải `mutation` mà client gọi được)                                                            |
| **R2** | Không nhận/kiểm tra `botKey` — cron không phải lối vào của bot                                                                          |
| **R3** | Không gọi hàm khác: `ctx.runQuery/runMutation/runAfter/scheduler/asyncWork`, `api.*`, `internal.*`                                      |
| **R4** | Không I/O ngoài DB: `fetch(`, `ctx.storage`, `require(`, `requireEnv(`, `process.env`                                                   |
| **R5** | Chỉ ghi bảng `guilds`; field ghi phải có trong allowlist cờ kèm lý do; field bot tự ghi thì chỉ được ghi `undefined` (nhả quyền sở hữu) |
| **R6** | Key dạng `[k]:` không xác định field ⇒ FAIL (phải khai tường minh)                                                                      |
| **R7** | `crons.ts` rỗng ⇒ FAIL (lịch biến mất mà cổng vẫn im)                                                                                   |

Danh sách field bot tự ghi **không gõ tay**: suy từ thân hàm thật trong
`convex/bot_writes.ts` + `convex/bot_writes/*.ts` (dùng chung
`collectConfigWrites`), nên bot thêm handler mới thì cổng tự biết. Phân biệt
"ghi giá trị" với "xoá bằng `undefined`": bot xoá cờ (`reportRequestedAt:
undefined`) là **trả lại**, không phải sở hữu — nên cron vẫn được phép đặt.

Bộ tự kiểm dựng lại 11 cách phá ranh giới trên **nguồn thật** (gọi `ctx.runMutation`,
nhận `botKey`, gọi `fetch`, ghi field bot tự ghi, ghi bảng khác, key động, đổi
`internalMutation`→`mutation`, xoá sạch lịch…) và một case chứng minh cổng
**không bị comment lừa**.

Sửa `collectConfigWrites` (dùng chung) trong đợt này cũng đóng một điểm mù thật:
handler dạng `export async function X(ctx, { botKey, guildId, at })` bị bỏ qua
im lặng vì brace-matching bắt nhầm khối `{...}` của tham số làm thân hàm. Sau
khi sửa, cổng tín hiệu cấu hình nhận ra **9** mutation bot-side tự xoá cache thay
vì 4 (vẫn xanh — 5 cái mới đều có tín hiệu đúng).

## Kiểm chứng

- `scripts/test-backup-pipeline.cjs` — có case hồi quy **kiến trúc**: `crons.ts`
  phải khai báo lịch, `index.js` không được còn `autoBackupInterval`/
  `autoBackupSweep`, `backupJobs.js` không được còn `autoBackupSweep`. Ràng buộc
  kiến trúc có test ⇒ không thể vô tình lùi về vòng quét trong bot.
- `scripts/test-daily-report.cjs` — tương tự cho `reportInterval`, cộng kiểm
  ngưỡng 20h khớp ở cả 2 phía và `botSetReportAt` xoá cờ sau khi gửi.
- `scripts/test-sweeper.cjs` — engine sweep (đếm hạn, cô lập lỗi, một timer),
  hành vi thật của captcha/voice-IP, và chặn hồi quy: 5 module không được tự
  dựng `setInterval`, chu kỳ phải khớp, `index.js` phải gọi `startSweeper`.
- `scripts/test-backup-convex.ts` / `scripts/test-bot-tick-settings.ts` — hành vi
  của hai mutation quét và việc bot nhận `jobs.reports` từ batch tick.
- `npx convex run backup:sweepDueAutoBackups '{}'` /
  `npx convex run reports:sweepDueDailyReports '{}'` — cron callable (chạy được
  trên deployment).
- `node scripts/check-cron-boundary.cjs --self-test` — 11/11 case.

## Giới hạn đã biết

- **Lịch cron đã được đẩy lên production, nhưng sandbox KHÔNG đọc được danh sách
  cron để tự khẳng định.** CI chạy `npx convex deploy` sau mỗi push `main`;
  log deploy của PR #41 ghi rõ `✔ Deployed Convex functions to
https://accomplished-chipmunk-74.convex.cloud`, và `crons.ts` nằm trong gói
  push đó. Cách kiểm chắc chắn nhất là dashboard: **Schedules → Cron Jobs** trên
  deployment production, phải thấy `auto-backup-sweep` (1 giờ) và
  `daily-report-sweep` (30 phút) kèm mốc lần chạy gần nhất. (CLI bản này không
  có `convex cron list`, và `crons:list` không được backend expose; workspace cũng
  không có `CONVEX_DEPLOY_KEY` để hỏi qua admin API.)
- Bot offline thì cờ tích tụ; khi bot online lại tick sẽ xử lý các cờ cũ. Job quét
  được đặt cờ tối đa mỗi 30 phút (báo cáo) / 1 giờ (backup), nên không có bão cờ.
