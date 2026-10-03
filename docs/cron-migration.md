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

**Dọn bộ nhớ trong RAM của tiến trình** — cron không có RAM để dọn, và nếu dọn
bằng cách đọc lại từ DB thì tốn reads vô ích mỗi phút:

| File:dòng                          | Chu kỳ  | Việc                                                          |
| ---------------------------------- | ------- | ------------------------------------------------------------- |
| `captchaStore.js:48`               | 5 phút  | Xoá mã captcha hết hạn                                        |
| `handlers/filters.js:607`          | 5 phút  | Xoá bucket chống spam                                         |
| `handlers/interactionVerify.js:20` | 5 phút  | Xoá rate-limit xác minh tương tác                             |
| `handlers/antinuke/index.js:210`   | 20 giây | tickUnlocks/tickHeatResets/tickVandalReleases + `sweepMemory` |
| `altDetection.js:969`              | 1 giờ   | Dọn `voiceIpMap`                                              |

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

## Kiểm chứng

- `scripts/test-backup-pipeline.cjs` — có case hồi quy **kiến trúc**: `crons.ts`
  phải khai báo lịch, `index.js` không được còn `autoBackupInterval`/
  `autoBackupSweep`, `backupJobs.js` không được còn `autoBackupSweep`. Ràng buộc
  kiến trúc có test ⇒ không thể vô tình lùi về vòng quét trong bot.
- `scripts/test-daily-report.cjs` — tương tự cho `reportInterval`, cộng kiểm
  ngưỡng 20h khớp ở cả 2 phía và `botSetReportAt` xoá cờ sau khi gửi.
- `scripts/test-backup-convex.ts` / `scripts/test-bot-tick-settings.ts` — hành vi
  của hai mutation quét và việc bot nhận `jobs.reports` từ batch tick.
- `npx convex run backup:sweepDueAutoBackups '{}'` /
  `npx convex run reports:sweepDueDailyReports '{}'` — cron callable (chạy được
  trên deployment).

## Giới hạn đã biết

- **Lịch cron chỉ được Convex lên khi deploy.** `convex run` trên deployment dev
  chứng minh _callable_, KHÔNG chứng minh production đã lên lịch — phải xem
  `npx convex cron list` (lệnh deploy của CI chạy `npx convex deploy` sau mỗi
  push `main`) và nhật ký cron trên production mới khẳng định được.
- Bot offline thì cờ tích tụ; khi bot online lại tick sẽ xử lý các cờ cũ. Job quét
  được đặt cờ tối đa mỗi 30 phút (báo cáo) / 1 giờ (backup), nên không có bão cờ.
