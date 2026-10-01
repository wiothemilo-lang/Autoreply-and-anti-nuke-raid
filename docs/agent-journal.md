# Nhật ký tiến trình agent

> Agent ghi vào đây qua skill **progress-journal**. Entry mới nhất trên cùng,
> tối đa ~30 entry. Mục "Đang dở" là danh sách việc chưa xong — đọc đầu tiên
> mỗi phiên.

## 30/09/2026 (3) — Rà soát 4 hướng song song + sửa có test ĐỎ trên code cũ → XANH

- 🧭 **Cách làm**: 4 reviewer chỉ-đọc (bot runtime / Convex / dashboard / tooling) chạy song
  song, mỗi phát hiện kèm `file:line`. Mình tự tái hiện bằng module thật (mô phỏng) TRƯỚC khi
  sửa, rồi chứng minh test mới ĐỎ trên code cũ bằng cách trả file về `HEAD` (hoặc đảo helper về
  hành vi cũ). Phát hiện trùng việc upstream vừa merge (#22 sweeper) → dùng bản upstream.
- 🔴 **Đã sửa** (mỗi mục một commit, có decision-log khi là quyết định):
  1. `antinuke/state.js` `sweepMemory`: `const stale` khai báo SAU vòng `exemptBuckets` → TDZ
     `ReferenceError` ngay lần quét đầu có entry exempt → `uncaughtException` → `exit(1)` mỗi khi
     owner/admin/whitelist thao tác (từ f250aae 28/09). + try/catch quanh sweep.
  2. Nhiệt độ bị trừ decay 3 lần: `flushGuild` ghi heat đã decay + `updatedAt` CŨ →
     `loadHeatStates` trừ lần 2 → `HeatBar` trừ lần 3 (người nóng 30 hiện 0, biến khỏi
     `/heat top`). Nay cặp (heat, updatedAt) luôn nhất quán; `heatLeaderboard` trả decay thật.
  3. `strike()` ghi `firstAt: now` mọi lần → cửa sổ warn tích luỹ trượt mãi.
  4. Retention `antinukeEvents`/`modActions`/`memberJoins` cổng theo đồng hồ (~0,8% lượt ghi) và
     chỉ xoá 1 dòng → bảng phình vô hạn (không có cron). Nay 1/40 lượt + lô 100 dòng.
  5. `channelLocks:botDueChannelLocks` `lte("until", now)` khớp cả khoá VÔ HẠN (Convex xếp
     undefined/null trước số) → khoá vô hạn tự mở trong ≤3 phút; fake test từng che bug.
  6. Dry-run khôi phục: batch tick không sinh job `plan`, `runBackupJobs` không có nhánh → nút
     "xem kế hoạch" quay mãi. Nay có đủ hai phía + báo lỗi qua `botReportRestorePlan`.
  7. Dashboard: toast bật/tắt Alt Detection ngược; `safeRedirectPath` lọt `"/\t/evil.com"`;
     thêm tự tải lại ĐÚNG 1 lần khi chunk cũ bị xoá sau deploy (`vite:preloadError`).
- 🟢 **Hiệu năng (đo bằng sourcemap + build thật)**: 6 file từ điển i18n chiếm ~404 KB / 509 KB
  chunk entry → nạp lười theo ngôn ngữ: entry **509,7 → 104,9 KB raw (168,2 → 33,0 KB gzip)**,
  EN 66 KB / DE 71 KB gzip chỉ tải khi dùng (người dùng VI không tải cả hai). 5 test Chromium thật.
- 🧪 **Hạ tầng test**: 45 suite từng dùng chung `bot/test-djs-mock.cjs` (34 nội dung khác nhau) →
  chạy song song là giẫm nhau (đo 7 suite đỏ giả) và `lockdown`/`boost-modules` chỉ xanh nhờ file
  suite trước để lại. Nay mock riêng theo PID (`scripts/support/djs-mock-path.cjs`), runner song
  song (pool ≤4, làn độc quyền cho `kiira-proxy`/Chromium, retry lẻ, giết cả nhóm tiến trình khi
  quá hạn) + test hermetic 24 check; runner tự kiểm số suite khớp AGENTS.md + CONTRACT_SUITES.
  Sai lầm phiên này: codemod làm 31 suite thừa `const path` → lint đỏ; bắt được nhờ chạy `eslint .`
  toàn repo (không chỉ vài file) — **luôn lint toàn repo sau codemod**.
- 🛠️ **CI**: quyền tối thiểu, huỷ lượt cũ của PR, `timeout-minutes`, cache Chromium, bot cài
  `--frozen-lockfile`, audit fail-closed cho cả root + bot, `test:mutation` chạy đủ 20 mutant.
- 📁 File đụng: `bot/src/{heat,tick,handlers/antinuke/{state,index}}.js`,
  `convex/{guilds,reports,bot_writes,bot_tick,altDetection,channelLocks}.ts`,
  `src/lib/{i18n.tsx,i18n.dict.*.ts,staleChunk.ts,discord.ts}`, `src/main.tsx`,
  `scripts/run-all-tests.cjs` + 45 suite, `.github/workflows/ci.yml`, docs/README/AGENTS (số
  suite 82 CJS + 21 TS).
- 🧪 **Kiểm chứng (head cuối)**: `bun run test:coverage` **82/82** (147s trên máy 2 lõi, gồm 15
  test Chromium) · coverage 94,97% stmts / 79,66% nhánh / 98,19% hàm, sàn theo file đạt · 21/21
  TS · mutation 20/20 · tsc · eslint toàn repo · prettier toàn repo · repo-map · convex-contract ·
  i18n --self-test · settings-signal --self-test.
- 🔁 **Kiểm lại sau check đỏ của PR #2** (check duy nhất đỏ là Kilo Code Review — app review AI bên
  thứ ba báo "Assistant request timed out", không có finding nào; fork không có run Actions nào):
  · Tái hiện CI cục bộ bằng binary release (kiểm checksum, để ở /tmp, không vào repo):
  `gitleaks git --log-opts="upstream/main..HEAD"` (bản 8.24.3 như CI ghim) + so tập phát hiện của
  cây cuối với cây `upstream/main` (7 phát hiện cũ, không cái nào do PR) · `actionlint` + `shellcheck` cho mọi
  bước `run:` của ci.yml. Precedent b84af3c: ID giả 18 chữ số làm đỏ job security → test mới dùng ID chữ.
  · `test-browser-contracts.cjs` test **B** (chờ CỐ ĐỊNH 1,6s cho preloader rời DOM) đỏ ở sandbox chậm
  cả trên `upstream/main` chưa sửa: gỡ overlay sau `load` đo 1,1–2,1s (hai đỉnh ~1,1s / ~1,8s, TB
  1665ms nhánh này vs 1639ms upstream, n=18) → KHÔNG do PR, nên đổi sang poll (`waitForPage`) như H/I.
  · Sai lầm: `pkill -f <mẫu>` khớp luôn dòng lệnh của CHÍNH shell đang chạy nó → giết shell (exit 143) và
  bỏ dở thí nghiệm; dùng PID đã lưu hoặc lọc theo `comm`. Và: `t.after(() => page.close())` treo khi
  renderer kẹt thì một test đỏ kéo cả file đỏ — bọc bằng race 5s (`closeQuietly`).
- ⚠️ **Backlog ĐÃ KIỂM CHỨNG NHƯNG CHƯA SỬA** (quyết định chính sách hoặc rủi ro đường raid — cần
  người quyết; chi tiết `file:line` từ đợt rà soát):
  · **Bot/raid**: `antinuke/shared.js:65-72` `isKnownLoggingBot` chỉ khớp TÊN (bot/webhook đặt tên
  "Dyno" lách mọi module; `externalApp.js:450` còn dùng `includes`) — đề xuất yêu cầu
  `VerifiedBot`/ID cố định, cần đổi mock ở ≥5 suite · `antinuke/members.js:449-456` ngân sách
  20 phạt/phút: `punishMember` trả "bỏ qua" nhưng massJoin vẫn `markHandled` và `joiners` đã
  reset → phần còn lại của làn sóng không bao giờ bị xử lý lại · `lockdown.js`: guard và
  `locked.add` cách nhau cả vòng kênh (trigger đồng thời sửa quyền lặp), `isTextBased()` true
  cho voice (nhánh Connect chết), unlock đặt `null` làm mất override gốc (`channelLock.js` đã có
  `prev`), `joinGate.js:237-271` lặp logic · `convex.js:282-310` getConfig không gộp request +
  fetch trước `invalidate()` có thể cache lại dữ liệu cũ 30 phút, `withRetry` thử lại cả lỗi
  không có status → mutation không idempotent ghi đôi · `altDetection.js:443`
  `guild.bans.fetch()` mỗi lượt join · `webhookHub.js:179-184` WebhookClient không `destroy()`
  (rò ~30 MB/20k lượt) · `nukeRollback.js:86` đặt cooldown trước khi khôi phục ·
  `threatEngine.js` OpenPhish không tới filters, `filters.js:280` khớp host chính xác (lách bằng
  `:443`/`user@`) · `raidIntel.js:93-131` ban mọi người vừa ban/kick trong 30 phút ·
  `welcomeCard.js` 25 ms/thẻ trên main thread, `index.js:93-124` thứ tự khởi động.
  · **Convex**: `bot_writes.ts:1579-1803` (+ `tickets.ts:403`, `bot_tick.ts:171`) tìm ticket bằng
  `collect()` cả guild rồi `.find` — thay bằng `db.get` (`botTouchTickets` chạy mỗi tin nhắn
  trong kênh ticket) · `sessions.ts:36` `me` collect mọi guild, `getGuild` →
  `hiddenPasswordIsSet` quét mọi guild · `guilds.ts:804,1022-1026,1142-1153` `updateSettings`
  thiếu trần độ dài nhiều field (doc phình ≤1 MiB, tick đọc hai lần) · `webhooks.ts:217-316`
  `sendEmbed` không giới hạn theo user/không timeout (relay spam), `sessionAuth.ts:180` bucket
  "public" toàn cục khoá đăng nhập · `guilds.ts:1313-1335` `ctx.storage.delete` rồi `throw` bị
  rollback (file mồ côi), `saveGreetingImage` nhận storageId bất kỳ · `auth.ts:38-44`
  `manageableGuildIds` snapshot 30 ngày · `botStatus` (4–10 KB) đọc mỗi call bot và ghi mỗi
  180s làm mọi `getGuild` mở chạy lại, cửa sổ "online" 180s = chu kỳ heartbeat → nhấp nháy
  offline · hàm/index không dùng: `audit:*`, `guilds:listMine`, `threatIntel:sampleStats`, 8
  index.
  · **Dashboard**: lỗi Convex production bị che thành "Server Error" (139 `throw new Error`, 0
  `ConvexError`, ~67 chỗ in `e.message`) → cần `ConvexError` + helper `errorMessage` ·
  `ui/switch.tsx` ModernToggle không hoàn tác khi mutation reject (43 Switch) · `SettingsPanel`
  seed state một lần, không đồng bộ lại sau import-config → "Lưu" ghi đè · `Date.now()` lúc
  render (badge online, `syncState`, đếm ngược lockdown) cần `useNow()` · `ui/dialog.tsx` không
  cuộn ≤768px, Enter bỏ qua IME (Telex), nhiều nút chỉ-icon thiếu `aria-label`, guard "chưa
  lưu" chưa phủ Welcome/Ticket, theme không áp ở `/auth` · first-load: `RequireAuth` chờ
  `sessions.me` mới tải chunk, Google Fonts chặn render, HaimiyaChat 32 KB import tĩnh,
  framer-motion có thể `LazyMotion` (~35 KB).
  · **Tooling**: timing test nhạy tải (`test-chaos.cjs:346-378`, `test-convex-client.cjs:91`,
  `test-local-snapshot.cjs:214`, `test-browser-contracts.cjs` test B chờ cố định 1,6s) — runner đã
  retry lẻ nhưng nên làm tất định;
  `check-sync-trust` / `check-research-chain` là script kiểm tra thật nhưng không nằm trong glob
  `test-*`; không có `.env.example`; ESLint không phủ `scripts/*.mjs` (gồm
  `kiira-retry-proxy.mjs` chạy production); `coverage` loại `commands/**`, `ai.js`, `index.js`
  (4.553 / 27.806 dòng).
- ▶️ **Tiếp theo**: chọn từ backlog trên theo mức rủi ro — đề xuất thứ tự: (1) tìm ticket bằng
  `db.get`, (2) `ConvexError` + `errorMessage`, (3) ngân sách hành động vs massJoin, (4) khoá
  `isKnownLoggingBot` bằng VerifiedBot. Mỗi việc cần test đỏ→xanh như các mục trên.

## 30/09/2026 — Sweeper nhiệt dùng decay thật của guild (bug dọn mất nhiệt còn sống)

- 🐛 **BUG THẬT (đã sửa)**: `HeatTracker.sweepCold()` (memGuard gọi mỗi 10 phút) giả
  định MỌI guild giảm **1 điểm/phút**, trong khi `heatDecayPerMin` cấu hình được
  (`Math.max(0, …)`, kể cả 0 = không bao giờ giảm). Guild đặt decay < 1 vì thế bị coi là
  "đã nguội" → dọn **MẤT nhiệt còn sống** sau ~10 phút im lặng: bot quên leo thang
  (timeout/kick/ban) trong khi hàng `heatStates` trên Convex vẫn còn nhiệt → dashboard
  và bot nói hai chuyện khác nhau (đúng kiểu lệch RAM ⇄ DB).
- ✅ Sửa: `add()` ghi kèm `decayPerMin` của guild lên entry · `markPunished()` giữ
  nguyên · `getHeat()` cập nhật lại theo config mới nhất (mỗi vi phạm, mỗi lượt
  `/heat status`) · `sweepCold()` dùng đúng decay đó (entry cũ thiếu field → giữ nguyên
  hành vi 1 điểm/phút, không đổi dữ liệu cũ).
- 🧪 Thêm 7 check vào `scripts/test-heat.cjs` (81 → **88**): `add` ghi decay · decay 0 →
  sweeper KHÔNG dọn · decay 0.5 → giữ nhiệt còn sống · decay 3 → vẫn dọn khi nguội thật
  (không rò rỉ RAM) · `getHeat` cập nhật decay mới · đổi config sang decay 0 → giữ nhiệt
  · `markPunished` không làm mất decay.
- 🧪 Chứng minh test bắt bug: trả `sweepCold` về hardcode 1 điểm/phút → **3 FAIL**
  (85/88); áp lại fix → 88/88.
- 📁 File đụng: `bot/src/heat.js`, `scripts/test-heat.cjs`, `docs/agent-journal.md`,
  `docs/decision-log.md`
- 🧪 Kiểm chứng: format OK · lint OK · tsc OK · 81/81 suites CJS · 20/20 suites TS ·
  coverage floor OK (`heat.js` 99.09% dòng, hàm 100%) · mutation 20/20 · repo-map /
  convex-contract / i18n / settings-signal OK
- ▶️ Tiếp theo: không có — chờ yêu cầu mới

## 30/09/2026 — Test tầng bot `heat.js` + sửa lỗi mất mốc tái phạm

- 🐛 **BUG THẬT (đã sửa)**: `HeatTracker.getHeat()` xoá entry khi nhiệt nguội về 0
  **bất kể** `lastPunishedAt`. Nhưng `add()` gọi `getHeat()` TRƯỚC khi đọc entry, mà
  entry là chỗ DUY NHẤT nhớ mốc vừa bị phạt → mọi lần tái phạm sau khi nhiệt đã nguội
  về 0 đều **không được nhân `heatRepeatMultiplier`**, dù `flushGuild` (`keepPunished`)
  lẫn `sweepCold` đều cố ý giữ entry cho đúng mục đích này (tức phần giữ đó vô hiệu).
  Đây là ca BÌNH THƯỜNG, không phải hiếm: điểm warn nhỏ + decay mặc định 3/phút → nhiệt
  về 0 sau vài phút, ngắn hơn hẳn cửa sổ tái phạm 30 phút. Sửa: `getHeat` giữ entry khi
  `lastPunishedAt` còn trong `heatRepeatWindowMin`, hết cửa sổ thì dọn ngay tại đó →
  vẫn không rò rỉ RAM.
- ✅ Mở rộng `scripts/test-heat.cjs` (30 → 81 check): ranh giới 10 mốc `tierFor` · cổng
  chặn điểm rác của `add` (0/âm/`heatEnabled=false`) · **hồi quy tái phạm** (nhiệt nguội
  về 0 vẫn nhân x2 rồi x3, ca bị phạt khi chưa có nhiệt, đường flush → add) · ra khỏi
  cửa sổ → dọn RAM + hết nhân · DM cảnh báo `_maybeWarn` (1 lần/chu kỳ, cảnh báo lại khi
  nguội xuống dưới ngưỡng, fetch lỗi/DM đóng/guild lạ không ném) · `heatSnapshot` (sắp
  giảm dần, cap 15, bỏ nhiệt 0, tên trống) · `flushAll` + gộp lịch flush · user chỉ có
  warn strike · `getConfig` lỗi → dùng defaults · config riêng của guild (decay 0) ·
  tăng cấp strike + `warnStrikeLimit=0` · `resetGuild` xoá warn tích luỹ · `heatSummary`.
- 🧪 Chứng minh test bắt bug: đảo nhánh giữ entry về `false` → **5 FAIL đúng các check
  tái phạm** (76/81); áp lại fix → 81/81.
- 📁 File đụng: `bot/src/heat.js`, `scripts/test-heat.cjs`, `docs/agent-journal.md`,
  `docs/decision-log.md`
- 🧪 Kiểm chứng: format OK · lint OK · tsc OK · 81/81 suites CJS · 20/20 suites TS ·
  coverage floor OK (`heat.js` 92.6% → **99.06%** dòng, nhánh 93.5%, hàm 100%) · toàn cục
  95.04% stmts · mutation 20/20 · repo-map / convex-contract / i18n / settings-signal OK
- ▶️ Tiếp theo (đã xử lý trong entry mới nhất phía trên): `sweepCold()` hardcode decay
  1 điểm/phút cho mọi guild → guild đặt decay < 1 bị dọn mất nhiệt còn hiệu lực.

## 30/09/2026 — Test `botRecordHeatBatch` + sửa lỗi bịa nhiệt độ 0

- 🐛 **BUG THẬT (đã sửa)**: `botRecordHeatBatch` và `botRecordHeat` ép nhiệt tối thiểu 1
  (`Math.max(1, Math.min(100, Math.round(x)))`). Nhưng nhiệt là số vi phạm bị trừ dần
  theo thời gian, và bot flush gửi `heat: Math.max(0, heat)` + `warnStrikes` RIÊNG →
  tình huống **nhiệt 0 nhưng còn warn tích luỹ** là thật. Hàng đó bị ghi thành
  `heat: 1` = bịa 1 lần vi phạm cho người không có vi phạm. Lệch với mọi nơi đọc:
  `reports.ts` đã lọc `heat > 0`, `guilds.ts` tính `% an toàn = 100 - heat`, lệnh
  `/heat top` xếp hạng theo nhiệt → người bị đẩy lên top-heat oan. Sửa: tách helper
  `clampHeat()` chặn `[0, 100]` + chặn `NaN/Infinity` → 0, dùng chung cho cả 4 chỗ
  ghi `heatStates` (patch/insert của cả hai mutation).
- ✅ Thêm `scripts/test-bot-record-heat-batch.ts` — 36 check, ctx giả trong bộ nhớ:
  cổng botKey (sai/thiếu → từ chối và 0 dòng ghi) · ghi mới · batch 3 người · upsert
  (patch không tạo trùng, thiếu `username` → giữ tên cũ) · dọn hàng 0/0 · chặn rác
  (âm, >100, phân thập, `warnStrikes` âm) · `userId` lặp trong 1 batch (entry cuối
  thắng) · batch rỗng · tách guild. **Chứng minh bắt bug**: đảo `clampHeat` về
  công thức cũ → 33/36 (3 ❌ đúng chỗ nhiệt 0 bị làm thành 1); áp lại fix → 36/36.
- 📁 File đụng: `convex/bot_writes.ts`, `scripts/test-bot-record-heat-batch.ts`,
  `AGENTS.md` (suite TS 19 → 20), `docs/agent-journal.md`
- 🧪 Kiểm chứng: convex codegen OK · tsc OK · lint OK · format OK · 81/81 suites CJS ·
  **20/20 suites TS** · repo-map OK · convex-contract OK · i18n + settings-signal
  self-test OK · web-contracts 231 PASS · mutation 20/20 · coverage 94.88% stmts
- ▶️ Tiếp theo: không có — chờ yêu cầu mới

## 28/09/2026 — Đợt "cửa trước production + desloppify" (session polish)

- 🔴 **BUG THẢM HOẠ ĐÃ SỬA (đo bằng trình duyệt thật)**: CSP production cả
  `vercel.json` lẫn `Dockerfile.web` đặt `script-src 'self'` NHƯNG preloader
  script viết inline trong `index.html` → bị chặn im lặng → `#boot` không bao
  giờ nhận `is-done` → **lớp phủ preloader phủ kín app ở MỌI trang, kẹt 0%
  vĩnh viễn** (app render bình thường phía dưới, không ai thấy). Sửa: tách
  script sang `public/boot.js` (external, cùng origin — vừa chạy vừa KHÔNG
  nới lỏng CSP). Ảnh chụp trước/sau + contract test chặn inline script.
- 🟠 Sửa bug production routing/SEO: `/features` **404 khi mở trực tiếp** ở cả
  Vercel (thiếu rewrite) lẫn nginx Docker (thiếu location SPA); nginx phát
  `X-Robots-Tag: noindex` lên đúng `/terms /privacy /data-deletion /monitor
/status` — 5 trang đang cần index; `seo.ts` coi `/status` là `not-found`
  (title "404 — …" + noindex trên trang CÔNG KHAI); sitemap đăng ký `/auth`
  (mâu thuẫn robots.txt Disallow + noindex); llms.txt thiếu `/features`.
- 🟡 Perf (đo bằng build): chunk entry **531→459KB raw (171→151KB gzip)** —
  `manualChunks` dạng object chỉ bắt module gốc, subpath `convex/*` rơi vào
  chunk entry; đổi sang function form + gom `three` một chỗ (trước nằm nhân
  bản trong 2 chunk WebGL chết ~830KB). Idle-prefetch chunk `/auth`, hero
  `fetchPriority="high"`, ticker `now` dùng chung cho useBotStatus (trước mỗi
  consumer một interval 15s, chạy cả khi tab ẩn).
- 🟢 A11y/hoàn thiện: SkipLink "Bỏ qua tới nội dung" + `<main id="main">` toàn
  bộ trang; AuthPage gộp 2 H1 (mobile/desktop) về một; Taskbar nhận alias
  `/status`; thang bo góc chuẩn hoá (card 12px, control 8px, panel 16px — ghi
  trong tailwind.config.ts); bỏ container thừa ở dải điểm nổi bật landing.
- 🟢 Thiếu còn thiếu: favicon.ico, icon PWA 192/512, site.webmanifest,
  `.well-known/security.txt`, JSON-LD Organization + WebPage/BreadcrumbList
  theo route, `<lastmod>` sitemap — đều đã thêm kèm contract test
  (test-web-contracts: 134→161 check).
- ✅ Kiểm chứng: 79/79 CJS + 17/17 TS + tsc + lint + format + repo-map +
  convex-contract + i18n + settings-signal + coverage floor + mutation 12/12
  XANH; browser thật (Chromium headless, CSP production) 0 console error mọi
  route, preloader tắt đúng, JSON-LD parse được, Tab-1 focus đúng skip link.

## 28/09/2026 (2) — Đợt "production invariants": fail-open preloader, canonical gộp, bảng tuyến đường, test trình duyệt thật

- 🔴 **Fail-open preloader (bug lớp còn sót của PR #15)**: `/boot.js` chuyển ra file ngoài cho khỏi CSP, nhưng CHỐT AN TOÀN (`window.__bootDone`) vẫn nằm trong file đó — file 404/bị chặn/tải dở/throw → app render phía dưới nhưng lớp phủ `#boot` phủ kín vĩnh viễn. Thêm `finishBootOverlay()` (src/lib/bootOverlay.ts): boot.js sống thì dùng `__bootDone`, hỏng thì tự gỡ DOM. Dùng ở BootSignal (kèm chốt 3s cho trường hợp `fonts.ready` treo), RootErrorBoundary, và catch bootstrap trong `main.tsx` (React chết trước cả khi mount cũng không kẹt).
- 🟠 **Gộp canonical `/status` + `/monitor`**: `/monitor` là canonical; `/status` chỉ là alias — Vercel `redirects` 301 + nginx `location = /status { return 301 }` (nginx đã kiểm bằng `nginx -t` trong container thật). seo.ts suy canonical/og:url/JSON-LD từ bảng tuyến đường: mở `/status` cũng khai canonical `/monitor`. Sitemap bỏ `/status`, Footer trỏ thẳng `/monitor`.
- 🟠 **BẢNG TUYẾN ĐƯỜNG (`src/lib/routes.json`) là nguồn duy nhất** cho public/private/index/sitemap/SPA-fallback/alias. seo.ts đọc bảng thay vì bảng route viết tay; `test-web-contracts` + `test-route-manifest` SUY kỳ vọng cho vercel.json, nginx, sitemap, robots.txt, App.tsx TỪ bảng → thêm route public mà quên sửa hosting = CI đỏ (đúng lớp bug của `/features`).
- 🟢 **Test trình duyệt THẬT** (`scripts/test-browser-contracts.cjs`, 7 test, chạy trong `bun run test`): điều khiển Chromium bằng DevTools Protocol qua WebSocket sẵn có của Node — **không cài dependency mới**. Chặn request `/boot.js` rồi chứng minh app vẫn hiện + lớp phủ biến mất + bấm nút đổi ngôn ngữ được (toạ độ chuột thật); đường boot bình thường vẫn đúng; `/status` redirect + canonical; skip-link bằng Tab/Enter với focus rơi vào `<main>` (đã thêm `tabIndex={-1}`); public/private/404; 0 console error qua 6 route.
- 🟢 Hoàn thiện: manifest bỏ `orientation: portrait-primary` (dashboard dùng được trên tablet xoay ngang); sitemap bỏ `lastmod` bịa — chỉ 3 trang pháp lý có ngày THẬT (LEGAL_UPDATED trong legalContent.ts); skip-link + `main#main` đủ ở MỌI trang (kể cả DiscordCallback); CI cài Chromium cho job test.
- ✅ Kiểm chứng: **80/80 CJS + 18/18 TS** suites · tsc · lint · format · repo-map · convex-contract · i18n · settings-signal · coverage floor · mutation 12/12 · `nginx -t` trong container nginx:1.27 thật · browser suite 7/7. Cập nhật AGENTS.md + guardrails (79→80, 17→18) và repo-map.

## Đang dở

- 📌 **Backlog rà soát 30/09 (đã kiểm chứng, CHƯA sửa)**: xem mục "Backlog" trong entry đầu
  file ("30/09/2026 (3)") — gồm cả việc trên đường raid cần người quyết định chính sách.

- 🔴 **Bot production OFFLINE từ 26/09 13:23 UTC (11h lúc phát hiện 27/09)** —
  `status:botStatus` trả `online: false`, `guildCount: 9`, heartbeat cũ. Nghi do
  VPS mất kết nốn/mất mạng (host Meowlix đã từng rơi `emergency_ro` 2 lần 25/09).
  User báo "VPS đang lỗi mất kết nối, sẽ sớm fix". **Khi VPS sống lại, chạy ngay:**
  `pm2 status` · `pm2 logs protogon-bot --lines 30 --nostream` · `df -h /` ·
  `free -h` — rồi xác nhận heartbeat mới qua lại gọi `status:botStatus` (online
  phải về `true`, `lastHeartbeat` < 3 phút). `reboot` thuộc vùng 🔴: user tự gõ.

- ✅ **GIẢI TRỪ reinstall (25/09 20:15)**: staff Bhadoria420 xác nhận VM 205
  KHÔNG nằm trên India node sắp reinstall ("The vps are not on india node"),
  chưa mua node mới ("Not now"), reinstall node khác sẽ giải phóng đĩa host
  ("The disk would be somewhat freed" — đúng gốc rễ sự cố #1/#2), và không cần
  backup ("No need"). Việc deploy bản refactor lên VPS trở lại như kế hoạch
  bình thường: user chạy git pull + bun install + pm2 restart (hướng dẫn đã
  gửi); CI đã deploy Convex xanh; hosting mirror deployable.
- 🔍 **Review refactor trên nhánh `host-deploy` (commit `df7dd00`, 18:56 25/09)**
  — XONG phần review + ĐÃ MERGE (commit b6e2fcd + a639490): zip `l7qsdt.zip` =
  snapshot repo nguyên vẹn tên `protogon-quality-pass`, niêm phong 24/09 06:04,
  base ≈ main sau 24/09 sáng (journal có tới 3 mục 24/09, thiếu t3-devbox.md).
  Refactor thật ~105 file, các nhóm chính: (1) **claimAt lease fencing** cho
  backup (chống 2 lượt xử lý trùng, sửa cả lỗi chính tả "BÁO LỄN" main đang
  có), (2) **cứng hoá sessionAuth** (rate-limit login + chuẩn hoá redirect URI),
  (3) **botBootstrapAction** fetch Discord có AbortController 8s + xác nhận app
  ID khớp, (4) **relay** chặn scan unbounded (MAX_SOURCE_HASHES/…), (5) **bộ
  artifact Vercel** mới toàn phần: vercel.json (CSP có hash, noindex route
  riêng tư), seo.ts, convexUrl.ts (allowlist URL Convex fail-closed), 404.js,
  og-image — main chưa từng có. **Kiểm chứng trên chính code zip: 61/61 suite
  CJS + 9/9 TS + tsc + lint + format XANH** (chạy trong /tmp, node_modules
  riêng). Zip sạch secret (không .env/.pem/bot-key). → ĐÃ MERGE TOÀN BỘ (user
  chốt "lấy hết") vào main: commit b6e2fcd (merge + chữa 3 regression của
  zip: 2 index Convex, otherSlots ×2, seed authVersion cho 2 e2e) + a639490
  (bỏ CSP hash chết trong Dockerfile.web/vercel.json + bổ sung /status vào
  SPA routes — phát hiện khi build verify trước deploy).
- ⬇️ **HẠ CẤP — reinstall KHÔNG còn đe doạ VM 205** (xem mục ✅ giải trừ
  phía trên): cảnh báo 17:50 của staff Hiro (MLX) về reinstall India node
  từng đặt VM 205 vào tình huống dữ liệu sẽ mất (geo-IP `203.154.14.8` =
  Thái Lan, coi như bị ảnh hưởng tới khi staff xác nhận). Staff Bhadoria420
  đã xác nhận 20:03–20:14: VM 205 không nằm trên node đó, chưa mua node mới,
  reinstall node khác sẽ giải phóng đĩa host, không cần backup. Checklist
  backup gấp hạ cấp thành việc nên làm khi rảnh (env vẫn nên lưu + xoay 2
  key lộ vì đã vào screenshot). Runbook dự phòng vẫn giữ ở
  `docs/t3-devbox.md` mục 7.
- 🚧 **VPS chết — chờ Meowlix** (25/09): host storage đầy, staff xác nhận trong
  ticket #363 _"our main node disk is full — wait till we buy a new node"_. VM
  205 boot-loop, bot pm2 + dashboard chỉ còn tồn tại theo RAM. Checklist khôi
  phục đã soạn ở `docs/t3-devbox.md` mục 4b — làm theo đúng thứ tự khi VM sống
  lại (fs check → swarm → pm2/curl → redeploy t3-code → xoay 2 key lộ + fix
  bashrc dòng 111 → docs).
- 🚧 **Setup T3 Code devbox — sót 2 việc phía người dùng** (xem `docs/t3-devbox.md`):
  (1) app mobile T3 đăng nhập bằng account `wiothemilo` (GitHub, cùng account
  devbox) → bật T3 Connect → chấm xanh; (2) đổi `GH_TOKEN` trong Dokploy
  (service `t3-code` → Environment) sang PAT của `wiothemilo` scope `repo` →
  redeploy → kiểm `/workspace/repos/` có repo Protogon. Hạ tầng đã xanh:
  T3 web 200, VS Code 302, devbox authorized `wiothemilo@gmail.com`, relay
  provisioned. Việc agent còn treo: `t3 uninstall` trên host (tuỳ chọn).
- Không có việc bắt buộc khác (ngoài khối VPS chết phía trên). (Nợ cũ "dọn 119 bản dịch EN chết + 12 DE mồ côi" ĐÃ XONG phiên 23/09 —
  dùng `scripts/_i18n-dead-remove.cjs`, check-i18n giờ sạch 100% không còn mục ℹ️.)
- ✅ Nợ cũ "~144 câu nội suy chưa bọc translate()" (ghi nhận 20/09) ĐÃ XONG — đo lại
  24/09: check-i18n --all báo 0 JSX text · 0 biểu thức · 0 thuộc tính còn nợ (các đợt
  viết lại copy lô 2→5 ngày 21/09 đã xử luôn khi viết lại copy). Sót lại cố ý: 3
  `placeholder` mẫu cú pháp kỹ thuật (`{server} · {action}`…) và nhãn thuật ngữ
  Kick/Ban — dịch sẽ phá mục đích sử dụng.
- 🚧 **Chặn kỹ thuật đã xác định được quy luật (đọc trước khi làm tiếp)**: công cụ patch
  (`str_replace`) chỉ sửa được **vùng ĐẦU của file lớn** — trong `src/lib/i18n.en.ts` (87 KB) sửa được
  entry ở offset ~5 KB nhưng mọi `oldString` lấy từ offset ~56 KB đều báo "not found" (dòng tồn tại
  thật, `grep` xác nhận; `i18n.de.ts` 92 KB và các file từ điển lớn tương tự). Quy tắc rút ra:
  1. **Đừng sửa key ở cuối file từ điển lớn** — muốn đổi câu hiển thị thì tạo key MỚI chèn ở vùng đầu
     (patch được) và chấp nhận entry cũ thành bản dịch chết (guard báo mềm), HOẶC ghi đè giá trị
     EN/DE cho **cùng key** bằng entry trùng tên trong `i18n.*.labels.ts`/`.panels.ts` (file nhỏ, gộp
     sau nên thắng) khi không cần đổi chính chuỗi VI.
  2. Việc cần xoá entry ở vùng cuối → dùng `scripts/_i18n-dead-remove.cjs` (script xoá theo key-list,
     backup + kiểm esbuild sau mỗi file) — KHÔNG dùng str_replace cho entry vùng cuối.
  3. `str_replace` cũng có lúc báo "file does not exist" hoặc dùng snapshot cũ cho file vừa ghi → luôn
     `grep`/`read_files` kiểm lại nội dung trên đĩa sau mỗi lần áp patch.
  4. **Cách xử lý TỐT NHẤT khi cần sửa ở vùng cuối file lớn: đổi thiết kế cho khỏi phải sửa ở đó.**
     Ca thật 23/09: `bot/src/handlers/backup.js` (2126 dòng) cần thêm `store.invalidate()` sau
     `botRestoreSettings` ở dòng ~1781 — patch báo "not found" dù `grep` xác nhận chuỗi đúng.
     Thay vì mò cách vá đuôi file, gom việc đó về **một điểm chặn duy nhất ở file nhỏ**
     (`bot/src/convex.js`: proxy tự xoá cache sau mọi lượt ghi cấu hình của bot) → vừa vá được
     cả 7 chỗ cùng lúc, vừa không bao giờ phải chạm đuôi file lớn nữa.

---

## 2026-09-27c — UX web: chưa lưu · ⌘K · bật hàng loạt · badge đồng bộ

1. **Cảnh báo chưa lưu** (`src/lib/useUnsavedChanges.ts`): kho dùng chung ở tầng
   module + `beforeunload` + `confirmLeave()` do `GuildPage` gọi khi đổi panel.
   Vì sao kho chứ không phải state trong panel: điều hướng nằm ở `GuildPage`,
   panel không biết trang cha sắp đổi tab. `beforeunload` một mình là KHÔNG
   đủ — bấm nhầm tab mới là hành vi hằng ngày, đóng tab thì hiếm.
2. **Command palette ⌘K** (`src/components/CommandPalette.tsx`): dùng
   `@radix-ui/react-dialog` ĐÃ CÓ sẵn, **không** thêm `@radix-ui/react-command`
   (AGENTS.md cấm cài dependency khi chưa hỏi). Lọc bằng chấm điểm + bỏ dấu
   tiếng Việt để gõ "gac hieu" vẫn ra "Gác hiệu".
3. **Bật chống nuke hàng loạt**: `guilds.setAntinukeGlobalBatch` + ô chọn trên
   Dashboard. Quyền kiểm cho TỪNG guild trong cùng lượt — không tin danh sách
   client gửi lên (client luôn tự bịa được `guildId`). Có trần 50 server.
4. **Badge trạng thái đồng bộ** (`src/lib/syncState.ts`): web đã lưu ≠ bot
   đang chạy. Chỉ nói điều CHỨNG MINH ĐƯỢC.

### Quyết định đáng ghi: KHÔNG báo "bot đã áp dụng"

Phía bot **không** ghi mốc "đã áp dụng" — nó chỉ xoá cache. Nên ta KHÔNG có
tín hiệu đó, và **không được bịa**. Badge chỉ nói: vừa lưu (< 3 phút) → "đang
gửi"; quá 3 phút → "đã gửi"; bot offline → "chưa áp dụng". Nói "đã áp dụng" khi
không có bằng chứng chính là tự tạo lại ảo giác mà tính năng này sinh ra để
xoá. Nếu sau này muốn nói "đã áp dụng" thật thì phải cho bot ghi mốc ngược
(`settingsAppliedAt`) — việc riêng, chưa làm.

### Sai lầm trong phiên này (đều là test sai, code đúng)

1. Regex bỏ dấu lúc đầu tôi gõ **ký tự tổ hợp thô** (U+0300–U+036F) — rất dễ
   bị trình soạn thảo/Prettier nuốt mà không báo lỗi. Sửa bằng `\p{Diacritic}`
   - cờ `u`. Cùng kiểu này đã xảy ra với `⚠️` (2 codepoint) ở phiên trước.
2. Test tôi kỳ vọng `foldDiacritics` trả về chữ thường, nhưng hàm cố ý KHÔNG đổi
   hoa/thường (việc của người gọi). Test sai, code đúng.
3. Test biên heartbeat đặt `now` bằng `settingsChangedAt` → nhánh "just-saved"
   chạy trước nên không tới được nhánh stale. Sửa test, không sửa code.
4. `confirmLeave()` dùng `window.confirm` → crash khi test chạy ngoài trình duyệt.
   Sửa thành `globalThis.confirm` (cũng an toàn hơn khi render phía server).

### Kiểm chứng

`bun run test` **62/62** · `bun run test:ts` **14/14** (thêm
`test-web-ux-upgrades.ts`, 32 assertion) · `tsc -b` sạch · `lint` sạch ·
`format:check` sạch · `check-repo-map` OK · `check-i18n` 0 FAIL ·
`check-convex-contract` OK · `check-settings-signal` OK.

**Số suite TS đổi 13 → 14** → đã sửa `AGENTS.md`. `CONTRACT_SUITES` (chỉ đếm
suite CJS) **không** đổi.

---

## 2026-09-27b — #1 Hồ sơ thành viên · #3 Tình hình server

- **#1 Hồ sơ thành viên**: bot lưu `riskFactors` dạng MÃ THÔ (`❌ account_age_1day`)
  và dashboard in thẳng mã đó cho chủ server — họ không hiểu nên không biết vì
  sao người bị kick, chỉ còn cách tắt cả module. `src/lib/riskExplain.ts` (mới)
  dịch mã + tách mức mạnh/yếu/tốt + `explainPunishment()` sinh câu "Vì sao bị
  phạt" 1 dòng. Chỉ đọc, KHÔNG đụng schema.
- **#3 Tình hình server**: `convex/guildStats.ts` (mới) gom `antinukeEvents` +
  `memberJoins` thành 4 chỉ số chủ server THẬT SỰ quan tâm: đe doạ đã chặn,
  người mới vào, tài khoản bị xử lý, **nghi phạm phạt nhầm** (bị xử lý mà điểm
  rủi ro dưới ngưỡng). Chỉ số cuối là thứ quyết định giữ hay bỏ bot.
  Ngưỡng lấy theo `guild.altMaxRiskScore` của từng server, không cứng 70.

### Bug thật bắt được nhờ test (đáng ghi)

`⚠️` gồm **HAI codepoint** (U+26A0 + U+FE0F). Regex `[❌⚠️✅]` chỉ bóc 1
codepoint → còn lại U+FE0F dính vào mã → tra bảng dịch **trượt**, MỌI tín
hiệu yếu rơi vào nhánh "mã lạ" và hiện nguyên mã không dịch. `❌`/`✅` là 1
codepoint nên không lộ — chỉ `⚠️` hỏng. Sửa bằng `\ufe0f?` + so sánh theo
`codePointAt(0)`, và có test khoá lại (kiểm mã không còn ký tự vô hình).
Đây đúng loại lỗi "chạy không lỗi gì nhưng người dùng đọc không hiểu".

### Quyết định thiết kế đáng nhớ

Template động (`account_age_under_5d`) dùng placeholder `{p0}` kiểu gettext +
`formatLabel()`, **không** nội suy số thẳng vào chuỗi. Nội suy trực tiếp thì
mỗi giá trị là một key từ điển riêng → không dịch được và từ điển phình vô hạn.

### Sai lầm lặp lại trong phiên này

- Lần vá đầu tôi tạo biến trùng (`actionName`, `score` khai 2 lần) — bun báo
  lỗi ngay, đã gộp lại. Nên chạy test sớm sau mỗi vá thay vì gộp nhiều
  thay đổi rồi mới chạy.
- `formatLabel` import ở 2 file UI nhưng không dùng (UI gọi `translate(label, vars)`
  đã tự thay biến) → `tsc` bắt bằng TS6133.

### Kiểm chứng

`bun run test` **62/62** · `bun run test:ts` **13/13** (thêm `test-guild-stats.ts`,
52 assertion) · `tsc -b` sạch · `lint` sạch · `format:check` sạch ·
`check-repo-map` OK (13 trang, 34 convex) · `check-i18n` 0 FAIL ·
`check-convex-contract` OK · `check-settings-signal` OK.
Convex codegen chạy trước typecheck.

**Số suite TS đổi 12 → 13** → đã sửa dòng kiểm chứng trong `AGENTS.md`.
(`CONTRACT_SUITES` trong `guardrails.js` chỉ đếm suite CJS nên **không** đổi.)

---

## 2026-09-27 — A: canh sức khoẻ máy chủ · B: trang Sự cố (gom cụm)

**Bối cảnh:** VPS Ấn Độ mới (NexoraCloud, India 1, 14 vCPU / 128 GB / 100 GB,
Ubuntu 24.04) đang chờ gán public IP; trong lúc chờ, user chọn làm 2 nâng cấp
thay vì đứng yên. Cả hai đều chạy được trên node hiện tại.

### A — Cảnh báo sức khoẻ máy chủ (chống tái diễn sự cố 25/09)

- **Gốc rễ sự cố 25/09**: host storage đầu → đĩa rơi `ext4 emergency_ro` → bot
  chết cả buổi, và **không có tín hiệu nào trước đó** — mọi cảnh báo cũ (RAM)
  chỉ in ra console rồi tan vào `pm2 logs`, lúc 3h sáng không ai đọc.
- `bot/src/handlers/healthWatch.js` (mới): đo đĩa bằng `fs.statfsSync` (có sẵn
  từ Node 18.15, **không thêm dependency**) + RSS + uptime; ngưỡng 85%/92% và
  700/1000 MB. Không đo được → KHÔNG báo (thiếu số liệu ≠ máy chết).
- DM chủ bot **chỉ khi mức NẶNG HƠN lần trước**, tối đa 1 lần/6h cho cùng mức
  — đĩa đầy kéo cả ngày không được spam 288 tin.
- `checkOnce()` tách khỏi `setInterval` để test gọi thẳng nhiều lượt liên tiếp;
  `startHealthWatch()` chỉ lo việc lặp thời gian.
- Convex: `status:reportHealth` (yêu cầu botKey) ghi `botStatus.hostHealth`;
  `status:getHostHealth` chỉ owner xem được số liệu thật. Query công khai
  `botStatus` chỉ trả **MỨC** (ok/warn/critical) — không lộ % đĩa/GB trống ra
  trang chủ. Quá 30 phút không báo lại → `null` (cảnh báo cũ treo là cảnh báo sai).
- Web: `Monitor.tsx` hiện banner đỏ/amber khi mức ≠ ok; `Admin.tsx` thêm card
  chi tiết (đĩa %, GB trống, RAM, uptime) — chỉ chủ bot.

### B — Sự cố gom cụm (thay lịch sử thô)

- `convex/incidents.ts` (mới): `groupIntoIncidents()` là **hàm thuần** (không
  Convex/DB/mạng) gom `antinukeEvents` + `modActions` thành cụm 15 phút.
- Cửa sổ tính từ sự kiện **trước**, không chia đều theo giờ → một đợt raid kéo
  40 phút vẫn là MỘT sự cố (chia đều theo giờ sẽ tách nó thành 3 sự cố vô nghĩa).
- Sự kiện không có `executorId` **không gom** — gom mọi thứ vô danh tạo ra "sự
  cố" mà không ai chịu trách nhiệm. 3 người khác nhau trong cùng 1 phút vẫn là 3
  sự cố (gom rộng = quy trách oan cho người không liên quan).
- Khoá tất định `kind:module:firstAt` → bấm "Đã xử lý" hai lần vẫn một dòng;
  2 sự cố khác nhau KHÔNG được trùng khoá (test khoá lại chính xác điều này).
- Bảng mới `incidentMarks` chỉ lưu dấu "đã xử lý" — nguồn sự thật vẫn là 2 bảng
  sự kiện, không nhân bản dữ liệu.
- Web: trang `/dashboard/:guildId/incidents` + link 2 chiều từ `GuildHistory`.

### Sai lầm đã mắc phải trong phiên này

1. **Test viết sai, không phải code sai**: ban đầu test khoảng cách sự kiện từ
   `firstAt` của cụm, trong khi thiết kế cố ý đo từ sự kiện trước. Đọc lại
   thiết kế thấy code đúng → sửa test, không sửa code. Ghi lại vì dễ ngược lại.
2. **`read_files` tool hỏng với object `{path, offset, limit}`** — chỉ nhận
   chuỗi. Chuyển sang `sed -n` qua terminal cho phần đọc file.
3. Key `"Sự cố"` đã tồn tại ở cuối `i18n.en.ts` → khai trùng làm `tsc` đỏ
   (TS1117). Cổng i18n KHÔNG bắt được (thiếu EN = đỏ, trùng key = im lặng).

### Kiểm chứng

`bun run test` **62/62** (49.3s) · `bun run test:ts` **12/12** · `tsc -b` sạch ·
`lint` sạch · `format:check` sạch · `check-repo-map` OK (13 trang, 33 convex,
27 module bot) · `check-i18n` 0 FAIL · `check-convex-contract` OK (82 call) ·
`check-settings-signal` OK. Convex codegen chạy trước typecheck (bảng mới
`incidentMarks` + field `hostHealth`).

⚠️ **Số suite đã đổi: 61 → 62 CJS, 11 → 12 TS.** Đã sửa **CẢ HAI** chỗ theo
đúng luật AGENTS.md: `CONTRACT_SUITES` trong `.opencode/plugins/guardrails.js` và
dòng kiểm chứng trong `AGENTS.md`.

### Việc chưa làm

- `docs/t3-devbox.md` mục 8 (B1 chụp compose) + B0.5 vẫn treo, chờ user chạy
  trên VPS. **KHÔNG** dán nội dung compose vào chat để agent gõ lại (bài học
  26/09: làm hỏng 11/33 mục).
- VPS Ấn Độ chưa có public IP → chưa SSH được, chưa quyết vai trò (devbox
  dự phòng / bot failover). Số đo ping/disk chờ chạy.

---

## 2026-09-26 — Runbook tiếp tục setup T3 (phiên trước bị dừng giữa chừng)

- Bối cảnh: phiên 25/09 dừng đột ngột ở giữa checklist mục 4b (`docs/t3-devbox.md`)
  sau khi sự cố đĩa emergency_ro tái diễn lần 2. Không rõ đã làm tới bước nào →
  viết lại thành **mục 8 `docs/t3-devbox.md`**: B0 sàng lọc trạng thái (bảng điền
  loại trừ, chỉ làm phần còn thiếu), B1 chụp compose `t3-code` vào repo, B2
  redeploy + symlink SSH, B3 agent CLI trong devbox, B4 xoay 2 key đã lộ.
- 🔍 Xác minh từ ngoài VPS: dashboard 200 · `t3.protogon` 200 · `code.protogon` 302
  → tunnel + 4 hostname còn nguyên, việc dở dang **chỉ là phía trong devbox**.
- 🧠 Quyết định: "kiểm tra trạng thái trước, chỉ làm phần còn thiếu" — lệnh
  idempotent chạy lại vô hại, lệnh phá dữ liệu tuyệt đối không chạy lại mù; mỗi
  bước có dòng "Kỳ vọng" để dừng đúng chỗ.
- ✅ **B0 chạy xong (user tự chạy trên VPS)**: `mount /` = `rw,relatime,stripe=16`
  **không** `emergency_ro` · `df /` 24G/79G = 32% · `pm2 protogon-bot` online ↺4
  uptime 9h · `dokploy.1` healthy · `devbox` Up 26h · `ssh vps` từ devbox ra host
  **thông** (thấy pm2 online) · `t3 connect status` provisioned + relay. Còn 2
  lệch: `hostname` in ra container ID (đã deploy từ compose bản cũ chưa có
  `hostname: t3-devbox`) và `/workspace/repos/` mới chỉ tới `wiothemilo-lang`.
- 🐛 **Bài học 26/09: KHÔNG gõ lại base64 qua khung chat.** B1 ban đầu bảo user
  dán compose `t3-code` vào đây để agent gõ vào repo → tôi gõ lại và **11/33 mục
  FAIL**: 8 khối base64 decode ra byte rác (U+FFFD), 3 khối script sai cú pháp
  (`bash -n` fail). Nguy hiểm vì YAML vẫn hợp lệ, compose vẫn build được — chỉ
  chết lúc script bootstrap chạy, giữa production. Sửa: xoá file hỏng, thêm cổng
  `scripts/check-t3-compose.cjs` (decode + `bash -n`/`node --check` từng khối),
  và B1 giờ bắt **copy thẳng trên VPS** qua đường byte, không qua trung gian.
- 📌 Ưu tiên khi chỉ làm được 1 việc: **B1 chụp compose vào repo** (tài sản hiện
  chỉ nằm ở tab Files của Dokploy, mất là dựng lại từ đầu) → B4 xoay key lộ →
  B2/B3.
- 📁 File đụng: `docs/t3-devbox.md` (mục 8), `docs/agent-journal.md`,
  `scripts/check-t3-compose.cjs` (mới)
- 🧪 Kiểm chứng: `check-t3-compose.cjs` OK (skip khi chưa có file) · lint OK ·
  `format:check` OK · `bun run test` **61/61 suites** (chạy lại sau khi lint sửa
  1 biến không dùng)
- ▶️ Tiếp theo: user chạy B1 (cp compose gốc từ `/etc/dokploy/compose/protogon/`
  vào repo + `node scripts/check-t3-compose.cjs`) và B0.5 (repo + agent trong
  devbox), rồi B2 redeploy để lấy `hostname: t3-devbox`.

---

## 2026-09-25 — Deploy production: pull `b1f70ba` → `3b3697b` + merge journal

- Xong: pull vấp conflict `docs/agent-journal.md` (2 bên cùng chèn mục sau
  dòng 34) → commit mục journal cũ của phiên trước (`0d78846`) rồi merge, gộp
  theo quy tắc "mới nhất trên cùng" (2 mục 25/09 lên trước, mục 24/09 xuống
  sau) → `3616376`.
- Dependency: `bun.lock` + `bot/bun.lock` đều đổi → `bun install
--frozen-lockfile` ở cả root lẫn `bot/` (34 + 3 package).
- Kiểm chứng: `61/61` suites CJS · tsc · lint · format:check **đều XANH**.
- Convex: pull mang 20 file `convex/` → `npx convex deploy` OK (production
  `accomplished-chipmunk-74`, không có index bị xoá).
- Bot: `pm2 restart protogon-bot` → `online`, `↺ 1`, uptime 2m+; log
  `✅ Protogon đã online: Protogon#8933 — 9 server` + `16 slash commands`,
  `[convex] prewarm config: 9/9 guild`, không Error mới (error.log cũ nhất
  vẫn là 24/09).
- Tiếp theo: push các commit lokal lên `main` (CI sẽ deploy Convex lại —
  idempotent).

---

## 2026-09-25 — Sự cố #2: đĩa RO tái diễn → staff xác nhận host storage đầy

- 🚨 **Diễn biến (~14:30)**: sau deploy compose (thêm `hostname: t3-devbox`,
  build nặng) đĩa rơi `emergency_ro` LẦN 2 trong ngày → panel 502, dokploy
  container unhealthy, docker exec báo "read-only file system", swarm manager
  mất, sshd chết, Stop/Start từ panel → **boot-loop**.
- 🔍 **Chẩn đoán then chốt**: `journalctl -k` trong VM SẠCH — không một dòng
  EXT4/jbd2/I/O error nào, dù đĩa chuyển emergency_ro 2 lần. Nếu filesystem
  trong VM hỏng thật thì kernel VM phải kêu; nó im lặng → bệnh nằm ở tầng
  dưới (host storage / thin pool). Chốt bằng lời staff `Bhadoria420` (15:55,
  ticket #363): _"our main node disk is full — wait till we buy a new node"_.
- ✅ **Việc làm được khi VPS chết** (chỉ đụng repo): bổ sung runbook
  `docs/t3-devbox.md` mục 4b (bảng chẩn đoán + checklist khôi phục 6 bước khi
  VM sống lại, gồm fs check → swarm → pm2 → redeploy t3-code → xoay 2 key lộ)
  - decision-log 2 dòng (chờ node mới; checklist khôi phục). KHÔNG làm gì ở
    VM nữa — mọi lệnh sửa đều fail, chỉ tốn công.
- ⏸️ Kế hoạch: chờ staff. Khi VM sống → làm checklist 4b đúng thứ tự, KHÔNG
  deploy gì nặng trước khi fs ổn định qua vài boot.

---

## 2026-09-25 — T3 devbox đổi account + sự cố đĩa VPS emergency read-only

- ✅ Xong: runbook đầy đủ ở `docs/t3-devbox.md` (bản đồ compose `t3-code`,
  đường truy cập, quy tắc vàng tài khoản, runbook đổi account, sự cố đĩa).
  Tóm tắt trạng thái cuối phiên:
  - Devbox authorized `wiothemilo@gmail.com` qua GitHub — đúng GitHub chủ
    repo Protogon (`wiothemilo-lang/Autoreply-and-anti-nuke-raid`). Login
    đầu tiên nhầm identity (2 Gmail + 2 GitHub) → app điện thoại không thấy
    environment dù relay provisioned. Bài học: **app và devbox phải cùng
    tài khoản T3, cùng provider**; mở login URL bằng cửa sổ Ẩn danh.
  - Di vật T3 host cũ (pre-Dokploy, v0.0.42 ở `/root/.local/bin/t3`): đã
    `t3 connect logout` xoá credential; không chạy server trên host nữa
    (bind 3773 thất bại âm thầm vì docker-proxy giữ port — từng gây nghi
    sai rằng `t3.protogon…` là host cũ trả lời).
- 🚨 **Sự cố hạ tầng: đĩa gốc VPS bị kernel chuyển emergency read-only**
  (phát hiện khi `t3` trên host báo EROFS; `mount` thấy
  `ext4 (rw,…,emergency_ro)`; `touch /tmp/x` xác nhận). Chẩn đoán sai ban
  đầu: tưởng T3 host cũ chiếm port / tưởng lỗi T3 — thực ra là filesystem.
  Chữa đúng: **không cài/vá gì thêm, `sudo reboot`** → fsck tự quét sửa lúc
  boot (ext4 flag lỗi) → FS sạch, toàn hệ hồi sinh (pm2 bot online, 8
  container Up, tunnel/dashboard 200, không mất dữ liệu). Bài học ghi trong
  runbook mục 4: gặp EROFS rải rác → `mount | grep " / "` TRƯỚC khi chẩn
  đoán sâu app.
- 🧠 Ghi chú kỹ thuật: `ps aux` trên host thấy `t3 serve --host 0.0.0.0
--port 3773` (node wrapper + native binary) là **process của devbox
  container** — bình thường, đừng nhầm với T3 host cũ.

---

## 2026-09-24 — Deploy production bot lên commit b1f70ba

- Xong: pull fast-forward `cac6e0c` → `b1f70ba`; `bun.lock` không đổi; Convex production đã deploy; `protogon-bot` restart và ổn định.
- File đụng: không có file mã nguồn cục bộ; chỉ cập nhật `docs/agent-journal.md`.
- Kiểm chứng: `61/61` CJS · `11/11` TS · tsc/lint/format OK · Convex deploy OK · PM2 `online`, `↺ 15`, uptime 70s.
- Tiếp theo: không có, chờ yêu cầu mới.

---

## 2026-09-24 — Production live: dashboard tự host trên VPS qua Cloudflare Tunnel

- ✅ Xong: dashboard Protogon LIVE tại `https://protogon.dpdns.org` (HTTP 200,
  SSL Cloudflare biên, code mới nhất) + Dokploy panel tại `https://panel.protogon.dpdns.org`.
  Người dùng đã thêm OAuth redirect URI + đăng nhập Discord thành công.
  Toàn bộ MIỄN PHÍ — không cần Meowlix (provider) mở cổng inbound nào.
- 🧩 Chuỗi hạ tầng được dựng hôm nay (đã verify từng mắt xích):
  1. Domain miễn phí `protogon.dpdns.org` từ DigitalPlat (nằm trong Public
     Suffix List → dùng được với Cloudflare; `us.kg` đang PAUSED đăng ký —
     mất 1 lượt, đổi sang `dpdns.org`). NS trỏ `pat`+`quincy.ns.cloudflare.com`.
  2. Cloudflare zone Active → **không dùng Zero Trust UI** (đòi credit card) —
     tạo tunnel bằng CLI: `cloudflared tunnel login` → `tunnel create meowlix`
     → route dns → config.yml → `service install`. Tunnel UUID
     `30583a3c-4f9b-4e37-a6ee-fd6695352e04` (kèm trong config trên VPS).
  3. Tunnel nối 2 hostname: `panel` → localhost:3000 (Dokploy),
     `protogon.dpdns.org` → localhost:8080 (app). CNAME `@` và `panel` →
     `<UUID>.cfargotunnel.com`, Proxied 🟠.
- 🐛 Chẩn đoán dài hôm nay (bài học để đời): Meowlix chặn TOÀN BỘ inbound TCP
  ở tầng provider (ping thông, ufw inactive, kể cả SSH public — chỉ tunnel
  outbound mới qua). Trong VPS lại dính 502 giữa Traefik (container thường)
  và swarm service: DNS overlay phân giải được (10.0.1.8) nhưng connection
  refused — bệnh VIP overlay vs container thường trên môi trường LXC/Proxmox,
  KHÔNG đáng đánh nhau → đường vòng sạch: phát port Host-mode 8080→80 trong
  Dokploy (Advanced → Ports) + trỏ cloudflared thẳng `localhost:8080`, bypass
  Traefik/Traefik-label hoàn toàn. Traefik vẫn chạy song song cho panel.
- 📁 Tài liệu: `docs/deploy-dokploy.md` đã bổ sung DuckDNS PSL, Cloudflare
  Tunnel (quick + named), hàng lỗi provider-chặn-inbound.
- ⚠️ Việc còn treo nhẹ (không gấp): xoá zone cũ `protogon.us.kg` trong
  Cloudflare; container Traefik không route được qua overlay — nếu sau này
  muốn domain thứ 2 qua Traefik phải đào tiếp (hoặc lặp lại mẹo Host-port).
- ▶️ Tiếp theo: không có — production ổn định, chờ feedback người dùng.

## 2026-09-24 — Audit Convex lần 2: bỏ 2 full-scan trong batch tick 60s

- ✅ Xong: rà lại toàn bộ query convex/ — còn 10 điểm collect() không index;
  xếp hạng theo tần suất × kích thước bảng, vá 3 điểm đắt nhất:
  - `buildHiddenJobs` (chạy MỖI 60s qua bot_tick:getPendingJobs) từng quét
    toàn bảng `reactionRolePanels` + `giveaways` → giờ dùng 2 index mới
    `by_enabled` / `by_status`, chỉ lấy panel CHƯA gửi + giveaway ĐANG chạy.
    Đắt nhất vì panel/giveaway đã kết thúc KHÔNG bao giờ bị xoá (chủ đích lưu
    lịch sử) → bảng phình dần, quét mỗi phút sẽ chậm dần theo thời gian.
  - `getVerifySendPanelGuilds` (fallback tick) quét toàn bảng guilds →
    `by_botInGuild` có sẵn.
- 🟢 Cố tình giữ nguyên (có lý do): `backup:botGetPending` (fallback, bảng
  guilds đang có bot quản lý được) · `sessions.me` / `backup:listMine`
  (per-user, kích thước bounded) · admin stats (admin-only) · `threatIntel`
  (raidSamples giới hạn 500/guild) · per-guild webhook lookup trong
  buildHiddenJobs (đã dùng index by_guildId — đọc nội bộ Convex tính theo doc
  quét, không phải N+1 mạng).
- 📁 File đụng: `convex/schema.ts` (+2 index), `convex/hidden.ts`,
  `convex/guilds.ts` — không đổi hợp đồng bot ⇄ Convex (không đổi tên function
  hay field bot đọc).
- 🧪 Kiểm chứng: convex codegen tạo 2 index mới · tsc · test 61/61 CJS ·
  11/11 TS · lint · format · contract · settings-signal · repo-map · i18n —
  xanh đủ. Bài học: mock db của test-bot-tick-settings đã hỗ trợ withIndex sẵn
  nên đổi query style không vỡ test.
- ▶️ Tiếp theo: không có — khi server lớn hơn (>500 guild) xét thêm index
  boolean `verifySendPanel` nếu fallback trở thành đường chính.

## 2026-09-24 — Vá rò file ảnh greeting + hoàn tất luồng 6-9 greeting e2e

- ✅ Xong: tiếp nối phiên gián đoạn — LUỒNG 6-9 của `test-greeting-flow-e2e.ts`
  (nền CDN, SSRF chặn, upload ảnh nền qua storage giả, goodbye card riêng,
  autorole trễ + welcomeRandom bỏ dòng trống) đã viết đủ nhưng CHƯA commit;
  chạy thử bộc lộ 1 lỗi thật còn sót → vá + thêm 7g chặn tái diễn. 62/62.
- 🐛 Bug thật (rò file storage vĩnh viễn): phép kiểm tra "file còn dùng ở ô
  khác" trong `removeGreetingImage` lẫn vòng dọn của `updateSettings` đều
  BAO GỒM cả ô đang bị xoá — `guild[slot]` lúc đó vẫn còn URL cũ (patch chạy
  sau) nên `every()` luôn false → ảnh cũ không bao giờ được dọn khỏi Convex
  storage. `saveGreetingImage` không sai vì nó lọc `otherSlots` trước. Vá:
  loại ô đang xoá khỏi phép kiểm tra ở CẢ 2 chỗ.
- 📁 File đụng: `convex/guilds.ts`, `scripts/test-greeting-flow-e2e.ts`
  (luồng 6-9 + 7g: xoá qua updateSettings cũng dọn file).
- 🧪 Kiểm chứng: greeting e2e 62/62 · test 61/61 CJS · 11/11 TS · tsc · lint ·
  format · convex codegen · contract (80 call) · settings-signal self-test.
- ▶️ Tiếp theo: cài Dokploy trên VPS theo `docs/deploy-dokploy.md` (đã có sẵn
  `Dockerfile.web` — build dashboard, bot vẫn chạy Bun/pm2 trực tiếp).

## 2026-09-24 — Test sâu backup + welcome + lệnh prefix/slash xuyên 3 tầng

- ✅ Xong: 3 suite e2e xuyên tầng theo cùng một khuôn mẫu "dispatcher thật →
  handler thật → Convex handler thật trên ctx.db Map":
  - `test-backup-flow-e2e.ts` thêm luồng 6-10: restore (tạo lại role/kênh/emoji/
    sticker TẬN TAY), import file .msc bot nuke (phát lại tin nhắn qua webhook
    giữ tên người gửi + thứ tự), file rác → báo lỗi dashboard, backup ma →
    tick không trả job, GitHub chết → backup vẫn lưu. 74/74.
  - `test-greeting-flow-e2e.ts` (mới): dashboard updateSettings thật → tick tín
    hiệu settingsChangedAt → ConvexStore cache TTL tự xoá → member join → thẻ
    PNG canvas thật + DM + autorole + RAID-SAFE lockdown. 33/33.
  - `test-commands-flow-e2e.ts` (mới): lệnh prefix + slash — đổi prefix chạy
    ngay lượt sau, autoreply thêm/trả lời/xóa theo rule thật, quyền Manage
    Guild chặn đủ nhánh, backup now đặt cờ mà tick thật nhặt được, /mod timeout
    ghi case tăng dần + log tới kênh log qua webhookHub thật. 41/41.
- 🐛 Bug mock (không phải production): (1) mock db.patch mutate in-place lệch
  semantics Convex (document bất biến, patch = phiên bản mới) — handler đọc lại
  field vừa xoá và bỏ qua storage.delete; (2) patch test thay store.client bằng
  Proxy riêng làm MẤT logic CONFIG_WRITE_MUTATIONS tự xoá cache của production →
  phải patch ở TẦNG DƯỚI NHẤT (ConvexHttpClient.prototype) dưới proxy của store;
  (3) test flaky rotateLogs theo ngày thật — cố định mốc giờ tất định.
- 📁 File đụng: `scripts/test-backup-flow-e2e.ts`, `scripts/test-greeting-flow-e2e.ts`,
  `scripts/test-commands-flow-e2e.ts`, `scripts/test-boost-modules.cjs`, `AGENTS.md`
  (số suite TS 9→10→11).
- 🧪 Kiểm chứng: 61/61 CJS · 11/11 TS · tsc web+convex · lint · format · repo-map ·
  convex-contract — xanh đủ. Commit `bb8f61c` + `fce5570` đã push main.
- ▶️ Tiếp theo: không có — chờ feedback.

## 2026-09-23 — Dọn sạch từ điển chết + rà pháp lý + tối ưu relay index

- ✅ **Xong nợ cũ "dọn 119 bản dịch chết + 12 DE mồ côi"** (thực đo lúc chạy: 123 EN chết + 12 DE
  mồ côi + 195 bản DE đối xứng theo sau): viết `scripts/_i18n-dead-remove.cjs` — xoá entry theo
  đúng bộ lọc của script chẩn đoán (`_i18n-dead-lines.cjs`), backup `/tmp` + kiểm esbuild sau MỖI
  file. `check-i18n` giờ sạch hoàn toàn: **1275 key ⇄ 1586 EN ⇄ 1586 DE, 0 entry chết, 0 mồ côi**.
  Hai bài học ghi vào journal: (1) `parseEntries` của runner từng nuốt NHẦM dòng key kế làm entry
  rớt value → tsc vỡ TS1005 (backup khôi phục được ngay); (2) dựa vào tsc + backup, đừng tin
  script biến-đổi-chạy-một-lần nếu không có bước kiểm cú pháp.
- ✅ **Rà 3 trang pháp lý** (`/terms`, `/privacy`, `/data-deletion`): route công khai không auth ✓,
  footer link đủ 3 ✓, nội dung **3 ngôn ngữ × 26 mục đối xứng** (cổng 3f kiểm cấu trúc) ✓,
  `test-web-contracts` 36 PASS ✓ — đủ điều kiện verify bot (URL riêng, công khai, không cần đăng nhập).
- 🔧 **Tối ưu cân bằng Convex** — rà hết query không index (`withIndex`): mọi đường nóng đã dùng
  index; phát hiện `relaySignatures` THIẾU index `by_createdAt` khiến **4 đường đọc relay full
  scan toàn bảng** (relayStatus, relaySignatures admin, botGetRelaySignatures mỗi 10 phút/guild,
  botCleanupRelay mỗi tick). Thêm index + sửa cả 4 đường: lọc TTL bằng `q.gt("createdAt", …)`,
  cleanup chỉ đọc phần HẾT hạn (`q.lte`) → 0 đọc khi không có gì hết hạn. Bảng tăng theo số
  server (mỗi nguồn tới 10 signature/phút) nên không phải tối ưu cosmetics.
- 🧪 Kiểm chứng: `61/61` CJS · `9/9` TS · tsc web + convex · lint · format · repo-map ·
  contract (199 exports) · i18n 0 FAIL + 0 ℹ️ · coverage 86.37% · mutation 12/12 ·
  codegen OK (index đã tạo trên deployment) · welcome-goodbye 83 PASS · backup 4 suite 114 PASS.
- 📁 File đụng: `src/lib/i18n.{en,de}{,.panels,.labels}.ts`, `convex/{schema,relay}.ts`,
  `scripts/_i18n-dead-remove.cjs` (mới), docs.
- ▶️ Tiếp theo: không có — chờ yêu cầu mới.

---

## 2026-09-23 — Tín hiệu cấu hình: vá nốt 6 chỗ sót + CỔNG chặn cả lớp

- ✅ **Xong việc "▶️ Tiếp theo" của lượt trước** (các mutation cấu hình chưa gắn tín hiệu).
  Không vá bằng mắt: viết cổng tự-dò trước, cổng trả về worklist, rồi vá — nhờ vậy tìm thêm
  được chỗ mà danh sách ghi tay bỏ sót.
- 🐛 **6 chỗ sót thật của cùng lớp bug 30 phút** (thay đổi từ dashboard không tới bot):
  1. `guilds.ts::resetHeat` — nút **"Xóa nhiệt" đứng im tới 30 phút**: cờ `heatResetRequested`
     được bot đọc qua bundle cache, mà `hasPending` phía bot chỉ rút ngắn TTL khi bản **cache ĐÃ
     có cờ** → lần yêu cầu ĐẦU TIÊN (false → true) không được rút ngắn.
  2. `guilds.ts::requestUnlock` — ca "khóa đã hết hạn mà kênh chưa mở" rơi vào TTL 30 phút.
  3. `guilds.ts::updateLockdown` — bật/tắt "khóa kênh khi raid" trễ 30 phút.
  4. `presets.ts::applyPreset` — "Áp preset" ghi cả cục `def.global` (antinuke/joinGate/
     actionBudget) + bảng `antinukeModules`; preset xong bot vẫn chạy cấu hình cũ.
  5. `webhooks.ts` (toggle/update webhook mặc định) — **lớp riêng**: cache webhook phía bot TTL
     **5 phút** ở `webhookHub`, không phải 30 phút. Nay ghi `settingsChangedAt` → tick xoá luôn
     cache webhook của guild đó → áp dụng trong ~1 tick.
  6. **Phía bot tự ghi cấu hình — 7/35 chỗ gọi quên `store.invalidate()`** (bug nặng hơn cả
     nhóm trên, tìm bằng luật B của cổng): server bị **khóa kênh LÂU HƠN cấu hình** vì
     `tickUnlocks` đọc `lockdownUntil` cũ (auto-lock 5 phút thành tới 30 phút); **mở khóa xong bot
     tưởng còn đang khóa** → lần raid sau bị bỏ qua → server mất bảo vệ; **báo cáo ngày gửi lặp**
     (`lastReportAt` cũ ⇒ vẫn "đến hạn" ⇒ gửi lại mỗi tick); **restore xong vẫn chạy cấu hình cũ**.
- 🛠️ **Cách vá chỗ 6: một điểm chặn thay vì 35 chỗ** — proxy sẵn có trong `convex.js` (đang dùng
  để chèn/ xoay botKey) thêm bước xoá cache khi tên mutation thuộc `CONFIG_WRITE_MUTATIONS`
  (9 tên). "Đã đo được 7/35 chỗ quên" là bằng chứng không nên tin vào kỷ luật ở call site —
  và nó cũng gỡ luôn chặn kỹ thuật "không patch được đuôi `backup.js` 2126 dòng".
- 🛡️ **Cổng mới `scripts/check-settings-signal.cjs`** (2 luật, hợp đồng SUY TỪ CODE):
  · **Luật A**: `BOT_FIELDS` = key trong `return` của `getBotConfig` ∩ field khai báo của bảng
  `guilds` trong schema (**101 field** — thêm field mới là tự vào phạm vi kiểm). Mutation nào
  ghi field đó phải có `settingsChangedAt`, hoặc là mutation bot-side trong danh sách của bot
  (proxy tự xoá), hoặc nằm trong ALLOWLIST kèm lý do.
  · **Luật B**: đối chiếu **2 chiều** `CONFIG_WRITE_MUTATIONS` (bot) ⇄ tập suy từ `bot_writes.ts`
  — thêm mutation cấu hình mới mà quên danh sách là CI đỏ.
  · Bắt được cả **gán động** (`patch.lockdownEnabled = …`) và **key tính toán** (`globalPatch[k] = v`)
  — chính là 2 dạng mà bản nháp đầu của cổng bỏ lọt.
  · **Bỏ comment trước khi phân tích** — cần thiết thật: test hồi quy của tôi gỡ CODE ghi tín hiệu
  nhưng comment "// settingsChangedAt: …" còn lại làm cổng báo SẠCH.
- 🧪 **Kiểm chứng**: **61/61 suite CJS** (+1: `test-settings-signal`) · **9/9 suite TS** · `tsc` web +
  convex · `lint` · `format:check` · `check-repo-map` · `check-convex-contract` (199 exports) ·
  `check-i18n` (0 FAIL) · `check-settings-signal --self-test` (**9 case**, gồm case báo nhầm
  `saveBrandingUpload` — cổng từng báo nhầm vì key tính toán vào `botStatus`, đã siết: chỉ tính
  key tính toán khi thân hàm thật sự đụng bảng `guilds`) · `coverage` 86.26% (sàn 58/65) ·
  `coverage:floor` · `test:mutation` 12/12 · convex codegen OK.
  Suite mới còn chạy hồi quy trên **nguồn THẬT**: tách `updateLockdown`/`resetHeat`/`requestUnlock`/
  `applyPreset` từ file thật, gỡ tín hiệu → cổng phải báo đúng field đó (4 case).
- 📁 File đụng: `convex/{guilds,presets,webhooks}.ts`, `bot/src/{convex.js,tick.js,lockdown.js}`,
  `bot/src/handlers/joinGate.js`, `scripts/{check-settings-signal,test-settings-signal}.cjs`,
  `scripts/{test-convex-client,test-tick}.cjs`, `.github/workflows/ci.yml`,
  `.opencode/plugins/guardrails.js` (60→61), `AGENTS.md`, docs.
- ▶️ Tiếp theo: không có việc bắt buộc. Nợ còn lại (không thuộc lớp này): dọn 119 bản dịch EN chết
  - 12 bản DE mồ côi (mục "Đang dở" ở đầu file).

---

## 2026-09-23 — Welcome/Goodbye B: bot tự vẽ THẺ ẢNH PNG theo từng thành viên

- ✅ **Xong**: `bot/src/handlers/welcomeCard.js` vẽ PNG 900×300 — nền người dùng tải lên +
  avatar tròn + nhãn ngôn ngữ server + tên hiển thị + số thành viên; vạch màu nhấn dùng
  chung `welcome/goodbyeEmbedColor`. Gửi kèm dạng attachment, embed trỏ
  `attachment://protogon-card.png`.
- 🔎 **Hai thứ phải khám phá bằng thực nghiệm mới dùng được** (ghi lại để lần sau không mất thời gian):
  1. Máy chủ này **không có font hệ thống nào** (`GlobalFonts.families === 0`) → `fillText`
     im lặng không vẽ gì, ảnh ra PNG hợp lệ nhưng TRỐNG CHỮ. Font KaTeX có sẵn trong máy
     (CMU/KaTeX SansSerif) **thiếu toàn bộ dấu tiếng Việt** → không dùng được. Giải pháp:
     nhúng `bot/assets/fonts/NotoSans-Regular.ttf` (OFL, 569 KB, kèm `OFL.txt`) và nạp
     tường minh. Skia có sẵn bold tổng hợp (`bold 54px`) nên không cần thêm file Bold.
  2. Phép đoán glyph khuyết bằng BỀ RỘNG là sai: trong Noto Sans, chữ **"V" rộng đúng
     bằng glyph khuyết (14.4px)** → bị xoá oan khỏi ảnh (phát hiện qua test: câu
     "Nguyễn Văn A" bị mất chữ V). Đổi sang so **chữ ký điểm ảnh** trên canvas 48×48.
- 🛡️ **Không làm vỡ tính năng chào**: thiếu thư viện/font, ảnh nền hỏng (bị chặn SSRF),
  ném lỗi bất kỳ → trả `null` → gửi embed thường. Thiếu thư viện/font thì bot báo lý do qua
  `status:reportCardCapability` (mutation mới) → `getGuild` trả `botCardReady`/`botCardReason`
  → panel hiện cảnh báo thay vì để người dùng tự đoán. `null` = bot chưa báo (bản cũ).
- 📁 File đụng: `bot/src/handlers/welcomeCard.js` (mới), `bot/assets/fonts/*` (mới),
  `bot/src/handlers/{welcome,lang}.js`, `bot/src/index.js`, `bot/package.json` + `bun.lock`,
  `convex/{schema,guilds,status}.ts`, `src/lib/types.ts`, `src/components/dashboard/*`,
  `src/lib/i18n.{en,de}.panels.ts`, `scripts/test-welcome-card.ts` (mới), `scripts/test-welcome-goodbye.cjs`.
- 🧪 Kiểm chứng: **60/60** CJS · **9/9** TS (thêm `test-welcome-card`: PNG hợp lệ, đúng 900×300,
  đếm điểm ảnh chứng minh CHỮ CÓ VẼ, chữ có dấu, emoji bị bỏ, mất thư viện → lùi an toàn) ·
  `tsc` web + convex · `lint` · `format:check` · repo-map · convex-contract (199 exports) ·
  i18n (0 FAIL) · coverage:floor · mutation 12/12.
- ▶️ **Tiếp theo**: không có — B đã xong. Lưu ý triển khai: VPS cần `bun install` trong `bot/`
  để lấy binary native `@napi-rs/canvas` (một lần), sau đó `/deploy` như bình thường.

## 2026-09-23 — Welcome/Goodbye v3: chèn emoji/kênh, xem trước trực tiếp, tải ảnh + test luồng thật

- ✅ **Xong (A — không thêm dependency)**:
  1. **Emoji tuỳ chỉnh của server**: bot đồng bộ `guild.emojis` lên bảng mới `guildEmojis`
     (`syncEmojis`, chỉ ghi khi danh sách đổi) → `getGuild` trả `emojis` → panel có picker,
     bấm là chèn `<:ten:id>` / `<a:ten:id>` tại vị trí con trỏ. Emoji động nhận đúng `a:`.
  2. **Chèn liên kết kênh** `<#id>` bằng nút (danh sách kênh văn bản đã đồng bộ). Bot không
     escape nên Discord tự vẽ link; `allowedMentions {users:[member], parse:[]}` giữ nguyên
     → không ping ai, không ping @everyone từ nội dung người dùng.
  3. **Xem trước trực tiếp** (`GreetingPreview.tsx`): dựng lại khung Discord (thanh màu, tiêu
     đề, ảnh, thumbnail, emoji CDN, `#kênh`, chip mention) thay cho dòng chữ thô "Xem trước:".
     Cảnh báo @everyone/@here bị chặn + cảnh báo emoji đã bị xoá khỏi server.
  4. **Tải ảnh thật**: banner/thumbnail tải thẳng từ dashboard → Convex storage
     (`generateGreetingImageUploadUrl` + `saveGreetingImage` + `removeGreetingImage`), vẫn giữ
     đường dán URL ngoài. Đổi/xoá ảnh dọn file cũ (chỉ khi không dùng ở ô khác).
- 🐛 **Hai lệch hành vi web ⇔ bot tìm được khi viết preview** (đã vá + test chặn):
  1. Template ngẫu nhiên toàn dòng trống khiến bot gửi **câu mặc định** và **BỎ QUA nội dung
     gốc** người dùng đã cấu hình, trong khi panel hiện nội dung gốc. Nay thứ tự fallback khớp
     hẳn nhau: câu ngẫu nhiên → nội dung gốc → mặc định theo ngôn ngữ server.
  2. `fillTemplate` cắt ở 1500 ký tự **giữa mã emoji** → để lại rác kiểu `<:wio:1234`. Nay
     `sliceSafe()` bỏ nguyên mã bị cắt ngang.
  3. Hồi quy do chính lượt này: bỏ guard `focused` khiến effect reset state mỗi lần `data` đổi
     → **chọn kênh là mất chữ đang gõ dở**. Nay chỉ đồng bộ field có giá trị SERVER thay đổi thật.
- 🧪 **Test "giống thật"**:
  - `scripts/test-backup-flow-e2e.ts` (mới) — luồng backup THẬT xuyên 3 tầng: `requestBackup`
    → `bot_tick:getPendingJobs` → claim → **`bot/src/handlers/backup.js:runBackup` thật** →
    `botStoreBackup`/`botClearBackup` → `importStatus`/`listGuild`. 5 luồng: tạo mới, không đổi,
    Convex từ chối document >1 MB, kèm tin nhắn, emoji/sticker. Convex giả là ctx.db trên Map —
    mọi handler và mọi dòng của runBackup đều là code production.
  - `scripts/test-greeting-preview.ts` (mới) — tokenizer emoji/kênh/mention, mã hỏng, ghép lại
    phải bằng chuỗi gốc, cảnh báo emoji chết.
  - `scripts/test-welcome-goodbye.cjs` — 44 → **69 PASS** (thêm luồng đầy đủ emoji + kênh + ảnh +
    embed + DM + autorole, fallback, sliceSafe).
  - `scripts/test-guild-panel-contract.cjs` — thêm tầng **top-level** (`data.emojis`…) + self-test.
- 🧪 Kiểm chứng: **60/60 suite CJS** · **8/8 suite TS** · `tsc` (web) + `tsc -p convex/tsconfig.json`
  · `lint` · `format:check` · `check-repo-map` · `check-convex-contract` (198 exports) · `check-i18n`
  (0 FAIL) · `coverage:floor` · `test:mutation` 12/12 · convex codegen OK.
- ▶️ **Tiếp theo (B, đã được người dùng duyệt "làm A trước, B sau")**: bot tự VẼ thẻ chào PNG
  theo từng thành viên (avatar + tên + nền tuỳ chỉnh kiểu ảnh chào của Sapphire) — cần thêm thư
  viện canvas phía bot (`@napi-rs/canvas`), chưa cài. Ảnh nền đã có đường upload sẵn từ A.

## 2026-09-23 — Welcome/Goodbye "không hoạt động" + "Backup ngay" không ra bản nào

Người dùng báo 2 lỗi thật. Cả hai đều KHÔNG phải bot hỏng — bot làm đúng phần
việc của nó; lỗi nằm ở dữ liệu web nhận được và ở tín hiệu giữa web ⇄ bot.

- 🐛 **Gốc rễ welcome/goodbye: `convex/guilds.ts` `getGuild` thiếu TOÀN BỘ 24 field
  welcome/goodbye/autorole.** Panel đọc `data.guild.welcomeEnabled`, `welcomeChannelId`,
  `welcomeRandom`, `autoroleRoleId`… nhưng query không trả field nào → công tắc luôn
  hiện TẮT (đọc `undefined`), kênh/nội dung đã lưu không hiện, badge "N đang bật" luôn
  0, và **mỗi lượt bấm "Lưu cài đặt" ghi đè bằng chuỗi rỗng** → xoá luôn nội dung thật
  trong DB. `GuildData.guild` trong `src/lib/types.ts` khai báo đủ + GuildPage ép
  `useQuery(...) as GuildData` nên **tsc mù hoàn toàn** với lớp lỗi này.
- 🐛 **Phụ 1 — độ trễ cấu hình tới 30 phút trong khi giao diện hứa ~3 phút**: cache
  `getConfig` trong bot có TTL 30 phút và chỉ rút ngắn với vài cờ (lockdown/heat/DM/
  verify panel). Bật welcome xong join thử là bot vẫn chạy cấu hình CŨ. `store.invalidate()`
  chỉ được gọi sau khi CHÍNH BOT ghi cấu hình — không nhánh nào cho thay đổi từ web.
- 🐛 **Phụ 2 — chọn kênh rồi bật công tắc là mất kênh**: `Select` chỉ set state, phải bấm
  "Lưu cài đặt" mới ghi; công tắc thì lưu NGAY. Kết quả: `welcomeEnabled=true` +
  `welcomeChannelId=""` → bot `return false` im lặng, không có cảnh báo nào trên web.
- 🐛 **Gốc rễ backup — 4 lỗi cộng dồn thành "bấm Backup ngay xong không có gì"**:
  1. Bot **nuốt lỗi `botStoreBackup`**: chỉ `console.error` rồi vẫn xoá cờ + ghi log
     "Đã tạo backup server" → dashboard không bao giờ biết (thủ phạm thường gặp: document
     Convex tối đa 1 MB, backup kèm tin nhắn của server lớn vượt ngưỡng).
  2. **Bỏ qua vì "server không đổi"** chỉ có log trong Discord, web không nhận gì.
  3. **Không có tín hiệu hoàn tất** nào cho web — nhánh thành công của `backupWatch`
     im lặng, người dùng chỉ thấy cờ chờ biến mất.
  4. **Copy sai thời gian**: hứa "trong khoảng 20 giây" + tự refresh danh sách ở 25s,
     trong khi vòng tick của bot là **180s** → web tải lại quá sớm rồi đứng im.
- ✅ **Vá**: thêm đủ 24 field vào `getGuild` (kèm comment chốt hợp đồng) · tín hiệu
  `settingsChangedAt` (schema) được ghi ở 6 đường cấu hình của dashboard (updateSettings,
  setAntinukeGlobal, updateModule, updateAltConfig, autoreplies ×3, setRestoreOptions,
  setAutoBackup) → `bot_tick:getPendingJobs` trả `settingsChanges` → tick của bot xoá cache
  đúng guild (mỗi thay đổi 1 lần, không xoá lặp) · panel welcome lưu kênh ngay khi chọn +
  chặn bật khi chưa có kênh · bot báo `botReportBackupError` (kèm hướng dẫn "tắt Kèm tin
  nhắn") + log đỏ khi lưu thất bại, KHÔNG ghi log thành công · `botClearBackup` ghi
  `backupFinishedAt` + `backupUnchanged` · `importStatus` trả 2 field mới + `requestBackup`
  xoá mốc cũ · panel: banner "Đang tạo backup (~3 phút)", toast kết quả (tạo mới / không
  đổi), cảnh báo sau 4 phút, copy đúng thời gian, 12 key EN/DE mới.
- 🛡️ **Cổng mới chặn đúng lớp lỗi này** (không chỉ vá 1 chỗ):
  `scripts/test-guild-panel-contract.cjs` — phân tích tĩnh 3 chiều (field panel đọc ⊆
  getGuild trả; `GuildData.guild` khai báo ⊆ getGuild trả; khoá 24 field welcome) +
  self-test + case hồi quy chạy trên WelcomePanel THẬT với getGuild cũ → đỏ 25 field
  (đúng bug). Thêm `scripts/test-bot-tick-settings.ts` cho đầu producer của tín hiệu.
- 🧪 Kiểm chứng: **60/60 suite CJS** · **6/6 suite TS** · `tsc` · `lint` · `format:check` ·
  `check-repo-map` · `check-convex-contract` (194 exports) · `check-i18n` (0 FAIL, 0 bản dịch
  chết mới do lượt này) · `coverage:floor` (13 engine đạt sàn) · `test:mutation` 12/12 mutant
  bị giết · `bun convex dev --once` OK · preview ready (index + WelcomePanel + BackupPanel
  transform HTTP 200) · 12/12 khoá dịch mới tra được ở EN + DE.
- 📁 File đụng: `convex/{guilds,schema,bot_tick,bot_writes,backup,antinuke,altDetection,autoreplies}.ts`,
  `bot/src/{tick.js,handlers/backup.js}`, `src/components/dashboard/{WelcomePanel,BackupPanel}.tsx`,
  `src/lib/i18n.{en,de}.panels.ts`, `scripts/test-{silent-error-reporting,tick,backup-convex}.*`,
  `scripts/test-{guild-panel-contract.cjs,bot-tick-settings.ts}`, `.opencode/plugins/guardrails.js`,
  `AGENTS.md`
- ▶️ Tiếp theo: các mutation cấu hình còn lại chưa gắn `settingsChangedAt` (hidden/*, webhooks,
  relay, threatIntel, presets, guilds.updateLockdown) — cùng lớp lỗi trễ 30 phút, nối tiếp khi cần.

---

## 2026-09-22 — Trang pháp lý 3 route + rà soát copy AI-slop + siết cổng nội dung đa ngữ

- ✨ **Ba trang pháp lý công khai, URL riêng**: `/terms` · `/privacy` · `/data-deletion` (Discord chỉ
  xác minh bot khi ToS + Privacy có URL riêng, không cần đăng nhập — dùng luôn tên miền dashboard,
  không phải nuôi site phụ). Nội dung thật 3 thứ tiếng ở `src/lib/legalContent.ts`: **3 văn bản ×
  3 ngôn ngữ × 9 mục**, viết theo đúng dữ liệu bot thật (bảng `users/sessions/guilds/modActions/
guildBackups/antinukeEvents/memberJoins`, backup AES-256-GCM, gist GitHub, phiên dashboard).
- 🎨 `src/pages/LegalPage.tsx`: MỘT component dùng chung cho 3 route (khác tham số `slug`) — layout
  editorial (mục lục sticky, mục đánh số 01/02…, khối tóm tắt, liên kết chéo 3 văn bản, CTA liên hệ,
  nút về đầu trang), đi qua `translate()` như mọi trang khác. Đổi văn bản tự cuộn về đầu trang.
- 🔍 **Cổng i18n mới 3f — không có lỗ miễn trừ**: file đánh dấu `@i18n-content` được miễn luật "nhãn
  dữ liệu phải có bản EN", ĐỔI LẠI phải qua kiểm tra CẤU TRÚC bằng parser: cây `vi` vs `en`/`de` phải
  trùng đường dẫn, không ô rỗng, không đoạn nào giữ nguyên tiếng Việt. 3 test mới trong
  `test-i18n.cjs` (đủ 3 ngôn ngữ → xanh; thiếu nhánh DE → đỏ; BỎ marker → vẫn đỏ vì luật nhãn dữ liệu)
  chứng minh miễn trừ không phải lỗ.
- 🧹 **Rà soát copy AI-slop/sai** (đợt này): bỏ tên model/hãng khỏi câu chào hàng (`AI Mimu v2.5` →
  "hệ thống đọc lại hàng trăm tin nhắn…"), bỏ **4 chỗ gọi tên bot đối thủ** ("kiểu Carl-bot" → "embed
  hình phạt chi tiết" / "(hình phạt, lý do, người xử lý)"), sửa câu nói **sai số module** ("…cùng 12
  module chống nuke khác" sau danh sách 8 module → "Đang hiển thị 20/32 module. 12 module chống nuke
  còn lại bật/tắt trong dashboard."), và Haimiya hết bị quảng cáo là "chỉ tiếng Việt" (nay đúng: trả
  lời theo ngôn ngữ đang chọn) — kèm bản EN/DE cho mọi câu mới.
- 🐛 **Bug tương phản thật ở trang chủ**: khối "Khóa kênh khi raid" hardcode `text-white` + `bg-white/5`
  → ở theme SÁNG là chữ trắng trên nền trắng, không đọc được. Chuyển sang token theme
  (`border-border`/`bg-secondary`/`text-foreground`) + test chặn tái diễn trong `test-web-contracts.cjs`
  (bỏ qua dòng comment).
- 🧪 `test-web-contracts.cjs` +21 case: 3 route pháp lý tồn tại, KHÔNG bọc `RequireAuth`, đứng trước
  catch-all; footer trỏ đủ 3; `legalContent.ts` có marker + đủ 3 bộ ngôn ngữ + mỗi slug đủ 3 bản;
  sitemap có 3 URL; chuỗi `translate("…")` không còn tên bot khác.
- 📄 `docs/repo-map.md` (+2 dòng), `public/sitemap.xml` (+3 URL), `public/llms.txt` (danh sách trang
  công khai + sửa câu "Haimiya tiếng Việt").
- 🐛 Sửa **regression tiềm ẩn từ lượt trước**: `scripts/test-haimiya-web.ts` bắt cứng cụm "riêng tư"
  trong câu trả lời OWNER_ONLY_ANSWER (đã đổi giọng ở đợt siết rò rỉ tính năng ẩn) → 5/5 suite TS
  đang đỏ. Nay khớp theo NGỮ NGHĨA (`/riêng tư|riêng của chủ sở hữu bot|không chia sẻ công khai/`).
- ✅ Kiểm chứng: `59/59 suites` · `test:ts 5/5` · `tsc` · `lint` · `format:check` · `check-repo-map`
  (11 trang) · `check-convex-contract` · `check-i18n` (0 FAIL) · `bun convex dev --once` OK.

---

## 2026-09-22 — Dọn bản dịch chết: xong 12 entry rồi bị CHẶN bởi công cụ patch với chuỗi tiếng Việt

- ✅ Xoá **12 entry chết** trong `src/lib/i18n.en.ts` (bản cũ của các câu đã viết lại: "Tắt nếu không
  muốn cảnh báo…", "Từ ngữ tối đa 40 ký tự", "Xem thêm..."…). Mỗi key đều đối chiếu bằng
  `scripts/_i18n-dead-lines.cjs` (không xuất hiện ở `src/` + `convex/`) trước khi xoá.
- 🚧 **Không dọn hết trong phiên này — chặn ở công cụ, không phải ở code.** `str_replace` trả "old
  string not found" cho MỌI entry chứa tiếng Việt của `i18n.en.ts`, dù đã loại trừ từng giả thuyết:
  - `grep` + script đọc file khẳng định dòng tồn tại và **đúng NFC** (kiểm codepoint: ả = 1EA3,
    ệ = 1EC7);
  - gửi lại ở dạng **NFD** (`a + U+0302 + U+0301`) vẫn "not found" → không phải lệch chuẩn hoá phía
    mình;
  - `oldString` **ASCII** trong CÙNG file (`"Backup server": "Server backup",`) áp bình thường;
  - `write_file` ghi tiếng Việt xuống đĩa **đúng NFC** (kiểm bằng codepoint) → loại trừ "transport
    làm hỏng tiếng Việt".
    ⇒ Chỉ nhánh _so khớp khi thay thế_ lỗi, và chỉ với ký tự có dấu. Đã báo người dùng; **không lách
    bằng shell** vì luật môi trường cấm sửa file bằng sed/script.
- ⚠️ Nợ phát sinh cần dọn cùng lượt sau: 12 bản DE của 12 entry vừa xoá giờ là **DE mồ côi** (guard báo
  MỀM, không làm đỏ CI).
- 🧪 Kiểm chứng (xanh hết): **59/59 suites** · `tsc` · `lint` · `format:check` · `check-i18n` (0 FAIL).
- 📁 File đụng: `src/lib/i18n.en.ts`, `docs/agent-journal.md`

---

## 2026-09-22 — Trang chủ: 2 danh sách module chưa dịch + cổng i18n bắt được đúng kiểu lỗi này

- 🐛 Người dùng báo (ảnh chụp panel "Schutzmodule aktiv"): người dùng DE đọc nguyên tiếng Việt 20
  nhãn module. **Không phải thiếu bản dịch** — cả 20 nhãn đã có EN + DE trong `i18n.en|de.labels.ts`
  và `i18n.en|de.ts`; gốc rễ là `AntiNuke` (`src/components/landing/sections.tsx`) render `{m}`
  thẳng trong `.map()`. Mảng khai báo NGOÀI JSX nên không phải JsxText (cổng 3) cũng không phải
  `{x.label}` (cổng 3d) → **cả hai cổng mù**, chuỗi VI không bao giờ bị đòi bản dịch.
- ✅ Vá: `{translate(m)}` cho cả `nukeModules` lẫn `modModules`, kèm ghi chú `// i18n-ok` nêu rõ
  "nhãn dịch lúc render" để không ai tưởng chuỗi VI còn sót là bug.
- 🛡️ Thêm cổng CỨNG **3e** vào `scripts/check-i18n.cjs`: parser TS tìm `ARR.map((p) => …)` với ARR
  là mảng chuỗi VI khai báo trong CÙNG file rồi bắt `>{p}` chưa bọc `translate()`. Bỏ qua `key={p}`
  (thuộc tính, không phải chữ hiển thị) và mảng nhập từ file khác (không đủ dữ liệu để phán —
  tránh báo nhầm). Miễn trừ: `// i18n-ok` trong 2 dòng trên lời gọi `.map()`.
- 🧪 Đo TRƯỚC khi vá bằng script thăm dò AST tạm (`scripts/_i18n-raw-render-probe.cjs`, đã xoá):
  đúng 2 điểm (dòng 405/421); sau khi vá về **0**, và guard mới bắt lại được khi tạm khôi phục code cũ
  (đã kiểm bằng `git stash` file đó rồi pop lại).
- 🧪 `scripts/test-i18n.cjs` +**2 case**: fixture mảng VI render `{m}` ⇒ cổng phải đổ; bọc
  `translate(m)` ⇒ phải xanh (đối chứng, chứng minh test không xanh vô nghĩa).
- ℹ️ Quét thêm toàn `src/`: không còn chỗ nào dùng mảng VI + `.map()` inline khác.
- 🧪 Kiểm chứng: **59/59 suites** · `tsc` · `lint` · `format:check` · repo-map · convex-contract ·
  `check-i18n` (0 FAIL) — tất cả xanh.
- 📁 File đụng: `src/components/landing/sections.tsx`, `scripts/check-i18n.cjs`,
  `scripts/test-i18n.cjs`, `docs/{agent-journal,decision-log}.md`

---

## 2026-09-22 — Cổng i18n: vá 2 lỗi cổng tự-báo-nhầm, thêm mục "DE mồ côi", dọn 251 entry chết

- 🐛 2 lỗi của `scripts/check-i18n.cjs`, đều kiểu "cổng tự lừa mình":
  1. Đọc key từ điển ở nhánh NHÁY ĐƠN lấy nguyên văn ⇒ key chứa escape (`\n`, dấu `"`) không bao giờ
     khớp key trong code — bản dịch ĐÃ CÓ mà vẫn báo "THIẾU EN" (lộ ra đúng lúc bọc `translate()` cho
     câu xác nhận khôi phục nhiều đoạn).
  2. `codeFiles` chỉ loại base dict (`i18n.en.ts`/`i18n.de.ts`) ⇒ key sống sót nhờ entry của CHÍNH NÓ
     trong `i18n.*.panels.ts`/`.labels.ts` không bao giờ bị báo là chết (từ điển tự quét chính mình),
     che mất 223 bản dịch chết.
- ✅ Thêm mục báo **mềm** "bản DE mồ côi" (key DE không có bản EN): rác không bao giờ hiển thị vì
  tra cứu theo chuỗi VI + thiếu EN thì rơi về VI. Cố ý để mềm — nợ vệ sinh từ điển không nên làm đỏ CI.
- ✅ Dọn **251 entry chết** (bản cũ của các câu đã viết lại: tiền tố trùng, hậu tố khác):
  `i18n.en.panels.ts` 41 · `i18n.de.panels.ts` 41 · `i18n.en.ts` 85 · `i18n.de.ts` 84. Mỗi key đều
  được grep toàn `src/` (trừ từ điển) + `convex/` trước khi xoá.
- 🧪 `scripts/test-i18n.cjs` +1 case (fixture DE mồ côi ⇒ cổng báo nhưng vẫn xanh) và ghim `stdio` cho
  tiến trình con — trước đây case ĐỐI CHỨNG in ❌ của guard ra màn hình, dễ tưởng suite đỏ.
- ⚠️ Còn tồn (đo được, không giấu): 97 bản EN chết + 60/38 bản DE + 5 bản DE mồ côi → xem "Đang dở".
- 🧪 Kiểm chứng: 59/59 suites · tsc · lint · format · repo-map · contract · check-i18n xanh.
- 📁 File đụng: `scripts/check-i18n.cjs`, `scripts/test-i18n.cjs`,
  `src/lib/{i18n.en.ts,i18n.en.panels.ts,i18n.de.ts,i18n.de.panels.ts}`,
  `docs/{agent-journal,decision-log}.md` + script audit tạm `scripts/_i18n-dead-lines.cjs`

---

## 2026-09-20 — Kiểm tra sức khỏe AI bot + huấn luyện nhận diện raid/nuke

- 🔍 Chẩn đoán: chain fallback + offline an toàn vẫn tốt (test xanh); Kira gateway live (44 model) NHƯNG 2 default đã chết — Groq `llama-3.3-70b-versatile` (retire 08/2026) và Kira `mimo-v2.5-free` (không còn trong danh sách live). Bot không có self-heal như `haimiya.ts` → call model chết đốt cả chain.
- ✅ Vá `bot/src/ai.js`: default Groq → `openai/gpt-oss-120b`, Kira → `mimo-v2.5`, tự vá 400/404 thử lại 1 lần cùng provider, `KIRA_USE_PROXY=1` opt-in qua proxy retry local.
- ✅ "Huấn luyện": few-shot raid/benign + checklist dương tính giả + hiệu chuẩn confidence (≥0.8 chỉ khi ≥2 tín hiệu) cho cả 3 prompt; `classifyViolation` nhận `knownThreats` — mẫu scam bot tự học từ raid thật (filters → messages → AI, 0 token).
- 🧪 Test: ai-fallback +2 case (self-heal, prompt markers) · antinuke-ai +1 (knownThreats passthrough) · misfire-guard +2 (getter) · chat-flow-classify sửa mock (chỉ đọc user msg, ví dụ system không tính là tín hiệu) · eval live tay `scripts/test-ai-raid-eval.mjs` (6 case, SKIP khi không key). 55/55 suites · tsc · lint · format · repo-map · contract · i18n xanh.
- 📁 File đụng: `bot/src/{ai.js,handlers/filters.js,handlers/antinuke/{ai,messages}.js}`, `bot/README.md`, `AGENTS.md`, `scripts/{test-ai-fallback,test-antinuke-ai,test-misfire-guard,test-chat-flow-classify}.cjs` + mới `test-ai-raid-eval.mjs`, `docs/{decision-log,agent-journal}.md`
- ▶️ Tiếp theo: chạy `node scripts/test-ai-raid-eval.mjs` trên VPS (có key) để đo chính xác/trễ thực tế sau đợt huấn luyện này.

---

## 2026-09-20 — Nâng cấp nhận diện raid + vá log sai kênh/trùng (massJoin, routing, raidIntel)

- 🐛 3 gốc rễ tìm bằng test RED trên code cũ:
  1. `handleRaidJoin` multi-fire: mỗi join vượt ngưỡng chạy lại toàn pipeline → N-T+1 log "Raid thành viên!" + phạt lặp + recordEvent/sample trùng (test cũ còn ghi nhận hành vi bug).
  2. `deliverViaWebhooks` gửi case ban/kick qua webhook mặc định ở kênh log chung thay vì kênh hình phạt đã cấu hình (sai kênh); `inferEventType` gắn nhãn "raid" cho mọi log antinuke.
  3. Gate cụm ratio≥0.5 với điểm≥2 coi acc mới đơn lẻ là raid → báo raid oan sóng bạn bè acc mới.
- ✅ Vá: wave dedupe 1 sóng=1 xử lý (markHandled + reset joiners) · `raidLikely` yêu cầu ≥1 tín hiệu phối hợp cứng/≥2 mềm + `joinWaveVerdict` 3 mức raid/watch/calm (calm im lặng, watch vàng, raid đỏ) · gate cá nhân 3→4 · AI `aiAnalyzeRaid` phủ quyết trước phạt · `huntRaidSource` audit hủy diệt +5 / lành tính +2 · routing webhook đúng kênh + `inferEventType` export để test.
- 🧪 Test: false-positive +3 case (27), member-layers +4 (22, gồm dedupe/AI veto/gate 4), webhook-hub +10 routing (29), antinuke-ai +1 (40). 55/55 suites · tsc · lint · format · repo-map · convex-contract xanh.
- 📁 File đụng: `bot/src/handlers/antinuke/{shared,members,raidIntel,index}.js`, `bot/src/{util,webhookHub}.js`, 4 suite test, `docs/{decision-log,agent-journal}.md`
- ▶️ Tiếp theo: theo dõi production xem còn báo raid oan/kênh sai không; cân nhắc ngưỡng `raidLikely` nếu raid tool né (đổi tên/avt).

> Lưu ý phiên 20/09/2026: local từng đi sau `origin/main` 3 commit (đợt i18n).
> Nếu thấy cây thiếu `src/lib/i18n.tsx`/`LangSwitch.tsx` → pull trước khi làm.

---

## 2026-09-20 — Vá bot tự xoay botKey khi bị Convex từ chối + deploy production

- 🐛 Sự cố deploy thật: sau `pm2 restart`, Convex từ chối mọi call (`Chìa khóa
bot không hợp lệ (botKey)`) — file cache `/protogon/bot/.bot-key` lệch seed
  phía server, và `ensureBotKey()` chỉ bootstrap khi CHƯA có key → bot kẹt
  vĩnh viễn, phải nhờ người xóa tay cache. Chữa tức thời: xoay key thủ công
  (xóa cache → restart → bot bootstrap, prewarm 0/8 → 8/8).
- ✅ Vá gốc rễ `bot/src/convex.js`: `isBotKeyRejection()` nhận diện lỗi từ chối
  key (so khớp thông điệp đặc thù của botAuth.ts — không nhầm lỗi mạng); proxy
  `query/mutation/action` bắt lỗi này → `rotateBotKey()` (bỏ key + xóa cache
  file + bootstrap lại qua Discord token) → **retry đúng call đó 1 lần**. Lỗi
  mạng/validator khác KHÔNG xoay oan; xoay dồn dập bị chặn (flag `_rotating`).
- 🧪 TDD: thêm 4 case vào `scripts/test-convex-client.cjs` (red trên code cũ:
  call bị từ chối → chết, 0 lượt xoay; xanh sau vá: 1 lượt xoay + retry thành
  công + cache file ghi lại key mới + lỗi mạng không xoay). 28 pass.
- 🧪 Deploy: pull up-to-date · 4 lớp xanh · Convex bỏ qua (không đổi convex/) ·
  pm2 online ổn định, sync nhịp đều, prewarm 8/8, guild mới join được bắt.
- ▶️ Tiếp theo: không có — chờ yêu cầu mới

---

## 2026-09-20 — Review toàn bộ bot/src: vá 4 bug bảo mật/hành vi

- 🐛 4 bug thật khi review ~15k dòng `bot/src/`:
  1. `antinuke/messages.js` gọi `reportSignatureBatch` 2 lần liên tiếp trong
     nhánh raid → Convex dedupe tăng weight mỗi lần → 1 server tự nâng weight
     signature 1→2, vượt `MIN_WEIGHT_AGED=2` → signature "xác nhận bởi 1
     server" được phân phối toàn mạng (vỡ chống đầu độc relay).
  2. `joinGate.js` burst auto-lockdown chỉ gọi `botUpdateLockdown` (cờ tính
     năng) — không gọi `botLockState { until }` → `lockdownUntil` không bao
     giờ được ghi → `tickUnlocks` không mở → server khóa kênh VĨNH VIỄN.
  3. `interactionCreate.js` khai báo Map `verifyAttempts` (rate-limit captcha
     DM) + vòng dọn, nhưng KHÔNG BAO GIỜ check → spam nút "Nhận mã" = bot DM
     vô hạn. Vá: check 3 lần/10 phút trước khi tạo mã.
  4. `captchaStore.verifyCode` không hủy mã khi sai → brute-force 10^6 tổ hợp
     trong cửa sổ 5 phút đoán trúng captcha 6 chữ số. Vá: sai 5 lần hủy mã.
- ✅ Thêm suite `scripts/test-bot-contracts.cjs` (hermetic: regex + require
  captchaStore) chặn cả 4; suite 54 → **55**.
- 📁 File đụng: `bot/src/handlers/antinuke/messages.js`, `bot/src/handlers/joinGate.js`,
  `bot/src/handlers/interactionCreate.js`, `bot/src/captchaStore.js`,
  `scripts/test-bot-contracts.cjs`, `AGENTS.md`, `docs/repo-map.md`,
  `.opencode/plugins/guardrails.js`
- 🧪 Kiểm chứng: 55/55 suites · tsc · lint · format · repo-map · convex-contract xanh

## 2026-09-20 — Lá chắn hợp đồng web (test-web-contracts) + vá 3 bug dashboard/landing

- 🐛 3 bug thật khi scan `src/`:
  1. `OverviewPanel.RecentEvents` đọc `localStorage.getItem("wio_session_token")`
     thô → chế độ "Lưu đăng nhập" gửi blob JSON `{"t","e"}` làm token (backend
     từ chối), chế độ session gửi `""` → khối "hoạt động gần đây" luôn trắng.
     Vá bằng `getSessionToken()`.
  2. `Landing` dispatch event `"haimiya-open"` (hero + `HaimiyaSection`) nhưng
     KHÔNG mount `<HaimiyaChat/>` → bấm "Hỏi Haimiya" chết lặng. Vá: mount chat.
  3. `AnalyticsPanel` + `AuditLogPanel` chết (không ai import) vẫn nằm repo →
     hiểu nhầm còn dùng. Đã xoá (lịch sử thật do `GuildHistory` phục vụ).
- ✅ Thêm suite hermetic `scripts/test-web-contracts.cjs` chặn tái diễn cả 3:
  kỷ luật token (chỉ `lib/discord.ts` chạm storage thô), trang dispatch
  `haimiya-open` phải mount chat, không panel chết. Suite 53 → **54**.
- 📁 File đụng: `src/components/dashboard/OverviewPanel.tsx`,
  `src/pages/Landing.tsx`, `src/components/landing/shared.tsx`,
  `scripts/test-web-contracts.cjs`, `AGENTS.md`, `docs/{repo-map,agent-journal}.md`,
  `.opencode/plugins/guardrails.js`
- 🧪 Kiểm chứng: 54/54 suites · tsc · lint · format · repo-map · convex-contract ·
  i18n đều xanh

## 2026-09-20 — Đa ngôn ngữ VI/EN phủ HẾT (gồm chuỗi nội suy) + thu gọn layout mobile

- 🐛 Gốc rễ "một số nút/nội dung không đổi sang tiếng Anh": lá chắn cũ chỉ rà
  bằng **regex theo dòng** nên bỏ sót 2 nhóm — text node một từ/nhiều dòng và
  chữ Việt nằm trong `{…}` (ví dụ `{cond ? "Trực tuyến" : "Không hoạt động"}`,
  `` ` · lần cuối ${x}` ``). Ngoài ra nhãn dữ liệu cấp module render trực tiếp
  (`{ANTINUKE_MODULE_META[m].label}`, `{HEAT_TIER_LABEL[tier]}`, `{group.label}`)
  chưa qua translate() nên không bao giờ dịch.
- ✅ `scripts/check-i18n.cjs` nay phân tích bằng **parser TypeScript**
  (`ts.isJsxText` + duyệt `JsxExpression`) → phủ text node nhiều dòng, biểu thức
  `{}`, template literal, thuộc tính JSX; **FAIL cứng** thay vì cảnh báo mềm.
  Có cơ chế miễn trừ tường minh `// i18n-ok: <lý do>` cho nhãn được dịch lúc
  render (không dùng để che lỗi).
- ✅ Dịch trọn phần còn lại: **+225 key EN** (`src/lib/i18n.en.panels.ts` — đợt 2,
  gộp trong `i18n.tsx` bằng `DICT = { ...EN, ...EN_PANELS }`), sửa cả key nháy
  đơn (`translate('Chỉnh sửa "{p0}"')`) mà regex cũ bỏ sót. Hiện **1018 key
  translate() ⇄ 1080 bản EN, 0 mục chưa dịch**.
- ✅ Mobile: thu gọn padding/khoảng cách (`p-5` → `p-4 sm:p-5`, `p-6`,
  `space-y-6`, `gap-5`) trên toàn dashboard + landing; nav mục cấu hình thành
  **app tab bar dính trên đầu** (`max-lg:sticky`, `-mx-3` chạm mép, nền mờ) để
  đổi mục không phải cuộn ngược; `#root` thêm `max-width: 100%` và trên
  mobile cho phép ngắt chuỗi trong `code/.font-mono` (`overflow-wrap: anywhere`)
  — nguồn tràn phải phổ biến nhất là ID/URL/token không có khoảng trắng.
- ⚠️ Chưa kiểm chứng được bằng mắt: sandbox không có trình duyệt headless nên
  không đo được `scrollWidth` thật ở 360px. Bằng chứng hiện có: tsc/lint/format
  xanh, 53/53 suite, preview ready — nếu người dùng còn thấy tràn thì cần ảnh
  chụp đúng chỗ.

---

## 2026-09-20 — Fix "khoá kín" tràn ngang + thiết kế lại trang server cho điện thoại

- 🐛 Gốc rễ lỗi "nội dung bị khoá kín" (không xem được mép phải): `#root`
  đặt `overflow-x: clip` — cố ý để không bao giờ có thanh cuộn ngang — nhưng
  con của grid (`grid lg:grid-cols-[230px_1fr]`) thiếu `min-w-0`, nên nội
  dung rộng bên trong panel kéo cả track grid rộng hơn màn hình → phần tràn
  bị cắt vĩnh viễn thay vì cuộn tới được. Kèm theo: nav sidebar dùng `-mx-4`
  vượt quá padding 12px (`max-sm:px-3`) của container mobile.
- ✅ Sửa: thêm `min-w-0` cho con grid ở GuildPage/Admin/Monitor + bỏ `-mx-4`
  ở nav; header trang server tách 2 hàng cho mobile (hàng 1: quay lại + nhận
  diện server + hành động; hàng 2: dải badge cuộn ngang `-mx-3 px-3` khớp
  đúng padding nên chạm mép màn hình mà KHÔNG vượt), nút "Mời thêm" chỉ còn
  icon trên mobile, badge dùng chung 1 khai báo cho 2 hàng; padding header
  khớp padding nội dung (`max-sm:px-3`) để không lệch trục.
- ✅ Kèm: panel Alt Detection trước đây viết tiếng Việt KHÔNG DẤU ("Tat",
  "Canh bao", "Rui ro", "Luot join", "Yeu to"…) — trông như UI lỗi; đã thêm
  dấu + bọc translate + 22 key EN (nhãn rủi ro dùng key "Rủi ro …" vì
  "Trung bình" đã là key chỉ số thống kê khác).
- 📁 File đụng: `src/pages/{GuildPage,Admin,Monitor}.tsx`,
  `src/components/dashboard/AltDetectionPanel.tsx`, `src/lib/i18n.en.ts`,
  `docs/agent-journal.md`
- 🧪 Kiểm chứng: i18n OK · repo-map OK · contract OK · format · lint · tsc ·
  53/53 suites · preview ready (bản mới đã được serve, kiểm bằng cách tải
  module GuildPage/AltDetectionPanel qua Vite)
- ▶️ Tiếp theo: vẫn còn 144 câu nội suy trong panel chưa bọc translate
  (mục "Đang dở" của entry ngay dưới)

## 2026-09-20 — Đa ngôn ngữ VI/EN toàn web + Haimiya chat

- ✅ Xong: lõi i18n kiểu gettext (`src/lib/i18n.tsx` — LangProvider/useT,
  `translate()` toàn cục, `dateLocale()`; key = nguyên chuỗi tiếng Việt, thiếu
  bản EN thì rơi về VI nên không bao giờ vỡ UI) + từ điển `i18n.en.ts`
  (831 key); bọc `translate()` cho 769 literal trên src/ bằng codemod;
  công tắc VI/EN (`components/LangSwitch.tsx`) gắn vào nav landing, taskbar,
  header dashboard/GuildPage/Monitor/Admin/Stats/GuildHistory/auth
- ✅ Xong: phần giới thiệu Haimiya + toàn bộ 46 chuỗi kiến thức cục bộ có
  bản EN; chat dịch lúc render nên đổi ngôn ngữ là cập nhật ngay; action
  `haimiya.ask` nhận thêm arg optional `lang` để AI trả lời đúng ngôn ngữ
  (system prompt dùng placeholder `{LANG}`)
- 🐛 Bug tìm thấy khi rà: nhãn sidebar `NAV_ITEMS` là hằng số cấp module nên
  eval 1 lần lúc import — bọc translate() vẫn không dịch (đã sửa thành dịch
  lúc render) · 20 chỗ hardcode locale ngày/giờ `"vi-VN"` khiến người dùng EN
  vẫn thấy định dạng Việt · `WebhookPanel` dùng locale rác `"vi-VV"`
- 📁 File đụng: `src/lib/{i18n.tsx,i18n.en.ts,i18n.en.new.ts}`, ~45 file
  src/, `src/components/LangSwitch.tsx`, `convex/haimiya.ts`,
  `scripts/{check-i18n.cjs,test-i18n.cjs}`, CI + guardrails (52→53 suites) +
  AGENTS.md + `docs/repo-map.md`
- ⚠️ Chưa xong (đo được, không giấu): còn **144 dòng chữ Việt trong JSX**
  chưa bọc `translate()` — đều là câu bị nội suy nhiều mảnh (`{n}/{m} module
chống nuke bật`, `Đang khóa — tự mở sau ~{n} phút`…) trong 20 panel
  dashboard. Vá theo lối bọc từng mảnh sẽ ra tiếng Anh vụn (thứ tự từ lệch)
  nên cố ý KHÔNG làm: cách đúng là gộp mỗi câu thành 1 key có placeholder
  `{p0}` rồi dịch trọn câu. `node scripts/check-i18n.cjs` in ra danh sách này
  (mục ℹ️) để phiên sau đo tiến độ — bản dịch thiếu vẫn an toàn (rơi về VI,
  không vỡ UI).
- 🧪 Kiểm chứng: check-i18n OK (0 thiếu) · repo-map OK · contract OK ·
  format · lint · tsc · convex codegen · 53/53 suites · preview ready
  (HTTP 200, LangSwitch transform OK)
- ▶️ Tiếp theo: gộp 144 câu nội suy trong panel thành key có placeholder rồi
  dịch — mỗi panel một lượt, giữ check-i18n xanh sau từng lượt

## 2026-09-20 — Audit hợp đồng + 2 skill an toàn kiến trúc

- ✅ Xong: audit số suites lệch 3 nơi (49/41 → 52, CONTRACT_SUITES là nguồn
  duy nhất); thêm skill `convex-contract-guard` + script
  `check-convex-contract.cjs` (78 call bot ⇄ 191 exports, CI job lint) và
  skill `schema-migration-safety` (checklist 2 client lệch pha); AGENTS.md
  Pha 3/4 + ship.md + guardrails compaction + repo-map cập nhật đồng bộ
- 📁 File đụng: `AGENTS.md`, `scripts/check-convex-contract.cjs`,
  `.opencode/skills/{convex-contract-guard,schema-migration-safety}/SKILL.md`,
  `.github/workflows/ci.yml`, `docs/repo-map.md`, `.opencode/{commands,plugins}`
- 🧪 Kiểm chứng: format OK · lint OK · 52/52 suites · repo-map OK ·
  contract OK + self-test script bắt đúng lỗi giả lập
- 🧹 Dọn dẹp cuối phiên: sửa 2 SKILL.md vỡ code fence + dọn thư mục rác
  `.tmp-contract-test/` (dùng nhầm làm TMPDIR, đã mv ra /tmp giữ nguyên dữ liệu)
- ▶️ Tiếp theo: không có — chờ yêu cầu mới

## 2026-09-20 — Thêm 2 skill tiết kiệm token

- ✅ Xong: skill `token-economy` (search-first, đọc cửa sổ) + `verification-loop`
  (gộp bộ kiểm chứng 1 lệnh, re-check tối thiểu theo bảng delta)
- 📁 File đụng: `.opencode/skills/token-economy/SKILL.md`,
  `.opencode/skills/verification-loop/SKILL.md`
- 🧪 Kiểm chứng: format OK · lint OK · 52/52 suites (audit cấu trúc hợp đồng)
- ▶️ Tiếp theo: pull về VPS để OpenCode session mới nhận 2 skill

## 2026-09-20 — Merge redesign + polish Taskbar/nav/loading

- ✅ Xong: merge `redesign/vercel-monochrome` → main (`d81ed45`), nav scroll
  mượt + scroll-margin, RouteFallback thành progress bar thương hiệu, Taskbar
  pill mới có Escape/click-outside
- 📁 File đụng: `src/components/Taskbar.tsx`, `src/App.tsx`,
  `src/components/landing/Nav.tsx`, `tailwind.config.ts`
- 🧪 Kiểm chứng: 51/51 suites · tsc OK · build 8.3s · production active
  (bundle `index-DloJ15Ak.js`)
- ▶️ Tiếp theo: không có — chờ feedback UI từ người dùng
