# Kiến trúc thu thập IP cho Verify — IP ban & VPN

> **Trạng thái:** thiết kế **đã chốt 4 quyết định** (11/11/2026), **chưa triển
> khai**. Ngày 11/11/2026.
> **Phạm vi:** `bot/` (verify + join gate), `convex/` (HTTP action, schema, job),
> `src/` (trang verify + panel quản trị).
> **Nguyên tắc:** không đổi hành vi hiện tại khi chưa bật cờ; mọi field mới là
> `optional`; IP là dữ liệu cá nhân nên phải tối giản, có hạn lưu và có đường xoá.

## 1. Kết luận nền tảng — đọc trước khi thiết kế

1. **Discord KHÔNG cung cấp IP của thành viên.** Bot API không có field IP ở
   `GuildMember`, `User`, `VoiceState` hay event join. Điều này đã được ghi rõ
   trong `bot/src/altDetection.js:441-449` và là lý do toàn bộ subsystem
   voice-IP/VPN cũ bị xoá (journal 10/11/2026).
2. **Chỉ có 3 nguồn IP hợp lệ trong hệ thống này:**
   - Trình duyệt mở **trang verify do mình host** → HTTP request đến Convex mang
     `x-forwarded-for` của người dùng.
   - **OAuth callback** do mình host (nếu chọn luồng OAuth).
   - **Reverse proxy/WAF** của hạ tầng mình (nginx/Cloudflare) — chỉ áp dụng cho
     web, không áp dụng cho Discord.
3. **Hệ quả với "ban IP":** Discord không có API ban theo IP. "Ban IP" chỉ có
   nghĩa một trong hai:
   - **Chặn ở cổng verify**: IP đã ban không được cấp role → account mới không
     vào được server nếu verify là bắt buộc.
   - **Correlate rồi ban account**: account verify từ IP đã ban bị ban/kick —
     đây là "ban theo IP" trên thực tế, nhưng phải chấp nhận rủi ro false
     positive (IP dùng chung).
4. **`vpnBlockEnabled` hiện là field chết.** `analyzeNewMember()` luôn trả
   `isVPN = false`, `ipCountry = null`, `ipOrg = null`
   (`bot/src/altDetection.js:446-449`), nên `vpnCount` trên dashboard luôn 0 và
   bật/tắt `vpnBlockEnabled` không có tác dụng. Hệ thống mới phải thay bằng
   hành động có ngưỡng, không phải boolean.
5. **`/geo_lang` đã có sẵn hạ tầng đọc IP**: `parseClientIp()` +
   `isPublicIp()` + rate-limit — hàm thuần nằm ở `convex/clientIp.ts` (tách khỏi
   `geoGuard.ts` để verify và geo dùng CHUNG một quy tắc), gọi từ
   `convex/http.ts`. Quy tắc: lấy mục **cuối** của `x-forwarded-for` (proxy
   append), KHÔNG lấy mục đầu — mục đầu do client tự đặt được. Xem mục 8.

## 2. Hiện trạng verification

### 2.1. Luồng Discord-native (đang chạy)

```
Thành viên join
  └─ joinGate.assignUnverifiedRole()        bot/src/handlers/joinGate.js:25-43
       └─ gán role "chưa xác minh" nếu verify bật đủ 3 thành phần

Panel verify (bot gửi qua tick)
  └─ hidden.processVerifyPanelItems()       bot/src/handlers/hidden.js:374-438
       ├─ method "button"  → nút verify_confirm
       └─ method "captcha" → nút verify_request_captcha

Button
  ├─ verify_confirm          → handleVerifyConfirm()   interactionVerify.js:105-203
  └─ verify_request_captcha  → handleVerifyRequestCaptcha()  :38-99
       └─ captchaStore: mã 6 số, TTL 5 phút, sai 5 lần huỷ
          (bot/src/captchaStore.js)

Captcha
  └─ messageCreate: tin nhắn 6 số trong kênh verify
       → verifyCode() → alt gate → cấp role
       (bot/src/handlers/messageCreate.js:81-159)
```

- Rate-limit hiện tại: 3 lần xin mã / 10 phút / user (`interactionVerify.js:17-32`),
  lưu **in-memory** trong tiến trình bot.
- Alt gate dùng chung `enforceAltGate()` (`bot/src/altDetection.js`) ở cả 3 cửa:
  join, button, captcha.
- Panel được đặt qua job `verifyPanels` trong `bot_tick:getPendingJobs`
  (`convex/bot_tick.ts:151-152`) và fallback `guilds:getVerifySendPanelGuilds`
  (`convex/guilds.ts:987-1003`).

### 2.2. Dữ liệu đã có nhưng chưa được nuôi

`memberJoins` đã có `isVPN`, `ipCountry`, `ipOrg`
(`convex/schema.ts:1191-1215`), `recordJoin` nhận các field này
(`convex/altDetection.ts:100-151`), dashboard đọc và hiển thị
(`src/components/dashboard/AltDetectionPanel.tsx:441`). Nhưng **không có nguồn
nào ghi giá trị thật** — đây là chỗ nối vào hệ thống mới.

### 2.3. Điểm yếu cần sửa khi thêm IP

| Điểm yếu                   | Hệ quả                                                              |
| -------------------------- | ------------------------------------------------------------------- |
| Rate-limit in-memory       | Nhiều instance Convex/bot → trần thực tế nhân lên; restart xoá sạch |
| Captcha 6 số gửi DM        | Không buộc người dùng mở trình duyệt → không thấy IP                |
| Token verify không tồn tại | Không có thứ để bind IP với đúng guild/user                         |
| Không có bảng IP           | Không thể ban/chặn theo IP, không thể chống rejoin                  |
| `vpnBlockEnabled` boolean  | Không có ngưỡng, không có hành động, không có appeal                |

## 3. Kiến trúc đề xuất

### 3.1. Sơ đồ tổng thể

```
┌──────────────┐  1. bấm Verify        ┌────────────────────────────┐
│ Discord user │ ────────────────────► │ Bot (discord.js)           │
└──────┬───────┘                       │ interactionVerify.js       │
       │                               └─────────────┬──────────────┘
       │ 2. link ephemeral                           │ createSession(botKey)
       ▼                                             ▼
┌──────────────────────────┐            ┌────────────────────────────┐
│ Trang /verify/<token>    │            │ Convex                     │
│ (React, Vercel hoặc      │            │ verifySessions (token hash)│
│  Convex-hosted HTML)     │            │ TTL 10 phút, dùng 1 lần    │
│  - thông báo mục đích    │            └─────────────┬──────────────┘
│  - consent + captcha     │                          │
└────────────┬─────────────┘                          │
             │ 3. POST /verify/complete               │
             │    (browser → Convex, KHÔNG qua Vercel │
             │     serverless — nếu qua đó thì Convex │
             │     thấy IP của Vercel, không phải user)│
             ▼                                        ▼
┌──────────────────────────────────────────────────────────────┐
│ Convex HTTP action (http.ts)                                 │
│  0. chốt `consent` trước mọi thao tác đọc/ghi                │
│  1. resolveClientIp(x-forwarded-for cuối → metadata Convex)   │
│     + isPublicIp() — private/rỗng thì fail-closed             │
│  2. HMAC-SHA-256 → ipHash (theo guild)                       │
│  3. tra ipBans → trúng: deny + audit + enqueue banJob        │
│  4. tra ipIntelCache → nếu thiếu: gọi provider (timeout 4s)  │
│  5. ghi verifySessions + memberIpLinks                       │
│  6. enqueue job verifyGrant (hoặc banAccount nếu trúng ban)  │
└──────────────────────────────┬───────────────────────────────┘
                               │ 4. bot tick 180s
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ Bot: jobs.verifyGrants                                       │
│  - verified → gỡ unverified, gán verified, DM chào           │
│  - denied   → báo generic + alert admin (không lộ lý do)     │
│  - ipBanned → BAN account (mặc định) + xoá session, alert    │
└──────────────────────────────────────────────────────────────┘
```

### 3.2. Vì sao là trang web, không phải Discord

- Chỉ request HTTP từ trình duyệt người dùng mới mang IP thật của họ.
- Trang web cho phép **consent + thông báo mục đích** trước khi xử lý IP — yêu
  cầu của Nghị định 13/2023/NĐ-CP và GDPR (nếu có người dùng EU).
- Trang web là nơi duy nhất có thể chạy captcha/Turnstile và hiển thị lý do bị
  từ chối mà không lộ thông tin nhạy cảm trong kênh công khai.

### 3.3. Hai biến thể triển khai trang verify

| Biến thể                                                   | Ưu                                                              | Nhược                                                                  | Trạng thái              |
| ---------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------- |
| **A. React SPA trên Vercel**, gọi thẳng Convex HTTP action | Dùng chung UI/i18n/theme; route mới trong `src/lib/routes.json` | Cần CORS allowlist; CSP `connect-src` phải có `*.convex.cloud` (đã có) | **ĐÃ CHỐT — chọn A**    |
| **B. HTML tĩnh do Convex HTTP action trả về** (`/verify`)  | Same-origin, không CORS, không phụ thuộc Vercel; nhẹ            | Phải viết HTML/CSS riêng, khó dùng i18n/theme                          | Loại (giữ làm fallback) |

> **Bẫy quan trọng:** nếu trang gọi một serverless function của Vercel rồi hàm đó
> mới gọi Convex, Convex sẽ thấy IP của Vercel. Luôn gọi Convex **trực tiếp từ
> trình duyệt** (hoặc để Convex tự phục vụ trang).

### 3.4. Luồng chi tiết

1. **Tạo session** — bot gọi `verify:createSession` (botKey) với `guildId`,
   `userId`. Convex kiểm tra guild bật verify, tạo token 32 byte ngẫu nhiên
   (base64url), **chỉ lưu SHA-256(token)**, TTL 10 phút, trả token + URL cho bot.
   Bot trả ephemeral link (không gửi token vào kênh công khai).
2. **Mở trang** — người dùng mở `/verify/<token>`. Trang hiển thị tên server,
   mục đích thu thập IP, thời hạn lưu, nút đồng ý + captcha/Turnstile.
3. **Hoàn tất** — trình duyệt `POST /verify/complete` với `{ token, captchaToken,
consent: true }`. Convex:
   - kiểm tra token hash, hết hạn/chưa dùng, đúng guild/user;
   - đọc IP từ `x-forwarded-for`, chỉ nhận IP công cộng (`isPublicIp`);
   - tính `ipHash = HMAC(secret, guildId + ":" + ip)`, `ipPrefixHash` cho IPv6 /64;
   - tra `ipBans` (theo `ipHash` hoặc `ipPrefixHash`);
   - tra `ipIntelCache`; nếu thiếu gọi provider (fixed URL, timeout 4s, cache 24h);
   - ghi `verifySessions` (kết quả) + upsert `memberIpLinks`;
   - enqueue `verifyGrant` (hoặc trả `denied` nếu IP ban/VPN policy).
4. **Cấp role** — bot tick nhận `jobs.verifyGrants`, thực hiện đúng chuỗi hiện
   tại: gỡ `unverifiedRoleId`, gán `verifiedRoleId`, DM chào, ghi log/audit.
   Nếu `denied`: báo generic cho người dùng, ghi audit, alert admin.
5. **IP ban** — admin bấm "Ban IP này" trên session/member đã verify. Hệ thống
   lưu `ipHash` (không lưu IP thô), scope `ip` hoặc `prefix` (IPv6 /64), thời
   hạn, lý do, người tạo. Lần verify sau từ hash đó bị **từ chối + ban account**
   (quyết định 11/11/2026 — xem §6 và cảnh báo false positive).
6. **VPN** — kết quả provider ghi vào session + `memberIpLinks`; policy
   `vpnAction` quyết định: `off` / `flag` / `deny_verify` / `kick` / `ban`.
   Mặc định **`flag`** — VPN **không** tự ban; chỉ IP đã nằm trong `ipBans` mới
   kích hoạt ban tự động.

## 4. Schema đề xuất (tất cả field mới là optional)

```ts
// convex/schema.ts — thêm 4 bảng, không sửa bảng cũ

verifySessions: defineTable({
  tokenHash: v.string(),          // SHA-256(token), KHÔNG lưu token thô
  guildId: v.string(),
  userId: v.string(),
  createdAt: v.number(),
  expiresAt: v.number(),
  consumedAt: v.optional(v.number()),
  status: v.union(
    v.literal("pending"),
    v.literal("verified"),
    v.literal("denied"),
    v.literal("ipBanned"),
    v.literal("expired"),
  ),
  reason: v.optional(v.string()), // mã lý do nội bộ, không trả nguyên văn cho user
  ipHash: v.optional(v.string()), // HMAC 128-bit hex
  ipPrefixHash: v.optional(v.string()), // IPv6 /64, null nếu IPv4
  country: v.optional(v.string()),
  asn: v.optional(v.number()),
  org: v.optional(v.string()),
  isVpn: v.optional(v.boolean()),
  vpnScore: v.optional(v.number()),
  userAgentHash: v.optional(v.string()), // chỉ để chống lạm dụng, không hiển thị
})
  .index("by_tokenHash", ["tokenHash"])
  .index("by_guildId_createdAt", ["guildId", "createdAt"])
  .index("by_expiresAt", ["expiresAt"]),

memberIpLinks: defineTable({
  guildId: v.string(),
  userId: v.string(),
  ipHash: v.string(),
  ipPrefixHash: v.optional(v.string()),
  firstSeenAt: v.number(),
  lastSeenAt: v.number(),
  verifyCount: v.number(),
  country: v.optional(v.string()),
  asn: v.optional(v.number()),
  org: v.optional(v.string()),
  isVpn: v.optional(v.boolean()),
})
  .index("by_guildId_userId", ["guildId", "userId"])
  .index("by_guildId_ipHash", ["guildId", "ipHash"])
  .index("by_lastSeenAt", ["lastSeenAt"]),

ipBans: defineTable({
  guildId: v.string(),
  ipHash: v.string(),
  ipPrefixHash: v.optional(v.string()),
  scope: v.union(v.literal("ip"), v.literal("prefix")),
  reason: v.string(),
  createdBy: v.string(),          // Discord userId của admin (hoặc "system")
  createdAt: v.number(),
  expiresAt: v.number(),          // BẮT BUỘC — trần 90 ngày, không ban vĩnh viễn
  evidenceUserId: v.optional(v.string()),
  evidenceSessionId: v.optional(v.id("verifySessions")),
  active: v.boolean(),
})
  .index("by_guildId_ipHash", ["guildId", "ipHash"])
  .index("by_guildId_ipPrefixHash", ["guildId", "ipPrefixHash"])
  .index("by_guildId_expiresAt", ["guildId", "expiresAt"]),

ipIntelCache: defineTable({
  ipHash: v.string(),             // cache theo hash, không theo IP thô
  provider: v.string(),
  country: v.optional(v.string()),
  asn: v.optional(v.number()),
  org: v.optional(v.string()),
  isVpn: v.boolean(),
  isProxy: v.optional(v.boolean()),
  isTor: v.optional(v.boolean()),
  isHosting: v.optional(v.boolean()),
  vpnScore: v.optional(v.number()),
  checkedAt: v.number(),
  expiresAt: v.number(),
}).index("by_ipHash", ["ipHash"]),
```

**Vì sao không lưu IP thô:**

- IP thô là định danh cá nhân; rò rỉ qua log/backup/dashboard là sự cố riêng.
- Hash đủ để so khớp ban và đếm trùng, không đủ để truy ngược người dùng nếu
  secret không bị lộ.
- Nếu cần điều tra sâu, admin có thể yêu cầu người dùng cung cấp IP — không cần
  hệ thống lưu sẵn.

**Vì sao hash theo guild:** tránh correlate người dùng giữa các server (một
người dùng chung nhiều server không bị ghép danh tính). Ban toàn cục (nếu có)
dùng hash miền riêng, chỉ owner thấy.

### 4.1. Field mới trên `guilds` (optional, expand-only)

```ts
verifyWebEnabled: v.optional(v.boolean()),   // cờ bật luồng web, default false
vpnAction: v.optional(v.union(               // default "flag"
  v.literal("off"), v.literal("flag"),
  v.literal("deny_verify"), v.literal("kick"),
)),
ipBanAction: v.optional(v.union(             // default "ban" (đã chốt)
  v.literal("deny_verify"), v.literal("ban"),
)),
ipBanAcknowledgedAt: v.optional(v.number()), // bắt buộc có trước khi bật "ban"
ipBanMaxDays: v.optional(v.number()),        // trần riêng của guild, ≤ 90
ipBanWhitelistUsers: v.optional(v.array(v.string())),
ipBanWhitelistHashes: v.optional(v.array(v.string())),
```

Mọi field đều optional và có default trong code đọc (`?? false`, `?? "flag"`,
`?? "ban"`) → guild cũ không cần migration, dashboard cũ vẫn chạy.

## 5. Convex functions & job

| Function                    | Loại                            | Ai gọi                               | Việc                                                                    |
| --------------------------- | ------------------------------- | ------------------------------------ | ----------------------------------------------------------------------- |
| `verify:createSession`      | mutation                        | bot (botKey)                         | tạo token, lưu hash, trả token + expiry                                 |
| `verify:completeSession`    | HTTP action + internal mutation | trình duyệt                          | validate token, đọc IP, tra ban/intel, ghi kết quả, enqueue job         |
| `verify:getStatus`          | query                           | trình duyệt                          | trả `status`/`reason` chung, không trả IP/hash                          |
| `verify:expireSessions`     | internal mutation (cron)        | cron                                 | đánh dấu hết hạn, xoá token cũ                                          |
| `verifyGrants` (job)        | query trong `bot_tick`          | bot tick                             | trả session `verified`/`denied` chưa xử lý                              |
| `verify:ackGrant`           | mutation                        | bot (botKey)                         | đánh dấu đã cấp role/đã xử lý                                           |
| `ipBans:list/create/revoke` | query/mutation                  | dashboard (token + `canManageGuild`) | quản lý ban                                                             |
| `ipBans:check`              | internal query                  | HTTP action                          | tra ban theo hash/prefix                                                |
| `ipIntel:lookup`            | action                          | HTTP action                          | gọi provider, cache 24h                                                 |
| `retention:sweepVerifyIp`   | internal mutation (cron)        | cron                                 | xoá session hết hạn, `memberIpLinks` cũ, `ipIntelCache` cũ, ban hết hạn |

**Không** để HTTP action tự gán role Discord — nó không có quyền và không có
gateway. Mọi thao tác Discord vẫn đi qua bot tick, đúng kiến trúc hiện tại
(`convex/bot_tick.ts` → `bot/src/tick.js`).

## 6. Chính sách IP ban & VPN — chống false positive

Đây là phần dễ gây thiệt hại nhất. IP dùng chung là chuyện thường:

- **CGNAT** (nhà mạng di động, `100.64.0.0/10`): hàng nghìn người cùng một IP.
- **Văn phòng/trường học/quán net**: một IP cho cả tập thể.
- **IPv6 privacy address**: mỗi phiên một địa chỉ; ban một địa chỉ gần như vô
  dụng, ban `/64` có thể trúng hàng xóm.
- **VPN/proxy**: người dùng hợp pháp (công ty, kiểm duyệt viên, người ở vùng
  chặn) cũng dùng.

Chính sách **đã chốt 11/11/2026** (auto-ban khi trúng IP ban):

| Tình huống                            | Hành động mặc định                              | Ghi chú                                                        |
| ------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------- |
| IP nằm trong `ipBans` (hash khớp)     | **Từ chối verify + BAN account** + alert admin  | Quyết định của chủ dự án; có cảnh báo + appeal bắt buộc (§6.1) |
| IP mới, VPN score cao                 | `flag` (ghi nhận, vẫn cho verify)               | `vpnAction` mặc định `flag` — VPN **không** tự ban             |
| VPN + nhiều tín hiệu alt khác         | Tăng `riskScore`, có thể `deny_verify`          | Dùng chung `enforceAltGate`                                    |
| IP ban vĩnh viễn                      | **Cấm tạo** — mọi ban phải có `expiresAt`       | Mặc định 7 ngày, trần 90 ngày, gia hạn phải qua admin          |
| Ban nhầm                              | Revoke ban + **unban account** + whitelist hash | Có audit, có link appeal; unban là một nút, không phải xin xỏ  |
| Owner/admin/bot của server trúng hash | **Không bao giờ auto-ban**                      | Bỏ qua auto-ban cho owner, admin có role quản lý, và bot       |

### 6.1. Cảnh báo false positive — đọc trước khi bật

Auto-ban theo IP là biện pháp **thô** và sẽ có lúc ban nhầm người thật. Các
trường hợp chắc chắn xảy ra:

1. **CGNAT / mạng di động** (`100.64.0.0/10`, nhiều mạng 4G/5G): hàng nghìn
   thuê bao dùng chung một IP công cộng. Một kẻ bị ban có thể kéo theo người
   lạ cùng nhà mạng.
2. **Văn phòng, trường học, quán net, ký túc xá**: cả tập thể ra internet bằng
   một IP.
3. **IP động của ISP**: nhà mạng tái cấp IP cho thuê bao khác sau vài giờ/ngày;
   người nhận IP mới "thừa hưởng" lệnh ban.
4. **VPN/proxy dùng chung**: exit node của VPN trả phí có thể phục vụ hàng trăm
   người; ban theo IP VPN là ban cả exit node.
5. **IPv6 `/64`**: một `/64` là cả một mạng hộ gia đình/doanh nghiệp nhỏ; ban
   prefix có thể trúng thiết bị khác trong nhà.

Vì vậy, khi bật auto-ban, hệ thống **bắt buộc** kèm các chốt sau (đưa vào test,
không chỉ vào docs):

- **Cảnh báo trong UI** khi admin bật: hiển thị nguyên văn rủi ro + yêu cầu
  tick "Tôi hiểu có thể ban nhầm" trước khi lưu `ipBanAction: "ban"`.
- **Mọi ban có hạn**: `expiresAt` bắt buộc; mặc định 7 ngày, tối đa 90 ngày.
  Không có "ban vĩnh viễn" trong schema (chỉ gia hạn).
- **Không auto-ban khi IP là CGNAT/shared**: `isSharedIpRange()` chặn
  `100.64.0.0/10` và các dải reserved; guild có thể chọn "chỉ deny verify"
  cho các dải này.
- **Không auto-ban owner/admin/bot**: kiểm tra role trước khi thực thi; nếu
  trúng, chỉ alert.
- **Whitelist 2 lớp**: `ipBanWhitelistUsers` (userId) và `ipBanWhitelistHashes`
  (hash cụ thể) — kiểm tra trước khi ban.
- **Alert giàu bằng chứng**: admin nhận embed gồm account, thời điểm verify,
  hash rút gọn, lý do ban gốc, nút **Unban + Revoke** ngay trong embed.
- **Appeal**: trang verify hiển thị thông báo chung + link liên hệ quản trị;
  không lộ hash/IP/lý do chi tiết (chống dò).
- **Audit bất biến**: mỗi auto-ban ghi `securityAudit` với `actor: "system"`,
  `reason: "ip_ban_match"`, `evidenceSessionId`.
- **Chỉ ban khi token hợp lệ**: không bao giờ ban từ request không qua
  `verifySessions` (chống kẻ xấu gửi request giả để mượn tay hệ thống ban
  người khác — đây là lỗ hổng nghiêm trọng nếu bỏ qua).
- **Fail-open**: provider IP intel lỗi/timeout → không auto-ban; chỉ áp dụng
  cho `ipBans` khớp hash (dữ liệu nội bộ, không phụ thuộc bên thứ ba).

## 7. Bảo mật — threat model (STRIDE)

| Mối đe dọa                 | Kịch bản                                   | Kiểm soát                                                                                                                                                                                                          |
| -------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Spoofing**               | Đoán/đánh cắp token verify                 | 32 byte CSPRNG, chỉ lưu hash, TTL 10 phút, dùng 1 lần, bind guild+user                                                                                                                                             |
| **Spoofing IP**            | Client tự gửi `X-Forwarded-For` giả        | Chỉ lấy mục **cuối** (proxy append), lùi về metadata Convex khi mục cuối private; `isPublicIp()`; self-test `/verify/self-test` dò hạ tầng có để client điều khiển XFF không. KHÔNG lấy mục đầu — đó là lỗ hổng cũ |
| **Tampering**              | Sửa `guildId`/`userId` trong request       | Token bind cả hai; server đọc từ session, không tin body                                                                                                                                                           |
| **Repudiation**            | Admin phủ nhận đã ban IP                   | Audit log bất biến (bảng `securityAudit`/`antinukeEvents`)                                                                                                                                                         |
| **Information disclosure** | Lộ IP thô qua dashboard/log/backup         | Chỉ lưu hash; log redact; dashboard chỉ hiện country/ASN/VPN; không trả hash cho client                                                                                                                            |
| **DoS**                    | Spam `/verify/complete` đốt provider quota | Rate-limit DB-backed: per token 5, per user 3/10 phút, per IP hash 10/giờ, global 300/phút; cache 24h; circuit breaker                                                                                             |
| **Elevation**              | User thường gọi `ipBans:create`            | `canManageGuild` + token session; chỉ admin server; audit                                                                                                                                                          |
| **SSRF**                   | Provider URL bị điều khiển                 | URL cố định trong code; không nhận URL từ client                                                                                                                                                                   |
| **Replay**                 | Dùng lại token đã consume                  | `consumedAt` + status; transaction kiểm tra trước khi ghi                                                                                                                                                          |
| **Enumeration**            | Dò IP nào bị ban                           | Luôn trả cùng một thông báo generic; không trả lý do chi tiết                                                                                                                                                      |
| **Open redirect**          | `?next=` dẫn sang site lạ                  | Không nhận redirect param; success page cố định                                                                                                                                                                    |

Bổ sung:

- **CSRF**: token trong URL là bí mật; vẫn kiểm tra `Origin`/`Referer` với
  allowlist (`https://<dashboard>`, `https://<convex-site>`).
- **CSP**: trang verify dùng CSP `default-src 'self'` + `connect-src` đúng
  Convex; không `unsafe-inline` nếu tránh được.
- **Secret**: `IP_HASH_SECRET`, `IPINTEL_API_KEY` nằm trong Convex env; không
  bao giờ gửi xuống client; rotate định kỳ; không log.
- **Fail-open vs fail-closed**: provider lỗi → `unknown`, **không** tự deny
  (tránh chặn nhầm khi dịch vụ bên thứ ba sập). Guild có thể chọn
  `vpnFailClosed` nếu thật sự cần.
- **Bot key**: `createSession`/`ackGrant` dùng `requireBotKeyStrict`, không
  thêm đường tắt.

## 8. Quyền riêng tư & pháp lý

IP là **dữ liệu cá nhân** theo Nghị định 13/2023/NĐ-CP (Việt Nam) và GDPR nếu
có người dùng EU. Trước khi triển khai phải có:

1. **Cơ sở pháp lý & mục đích**: chống raid/alt/bot, không dùng cho quảng cáo
   hay bán dữ liệu. Ghi rõ trong `/privacy` (đã có route) và trong trang verify.
2. **Thông báo + đồng ý**: checkbox trước khi gửi; nêu mục đích, thời hạn lưu,
   bên nhận (provider IP intel), quyền yêu cầu xoá. Server tự gắn
   `consentVersion` + `consentAt` — client chỉ khai `consent: true`, và thiếu
   consent thì KHÔNG băm/gọi provider/ghi DB.
3. **Tối giản**: không lưu IP thô; chỉ lưu hash + country/ASN/VPN; không lưu
   user-agent thô (chỉ hash nếu cần chống lạm dụng).
4. **Hạn lưu** (đang cài trong `botRunRetention`): phiên xoá 7 ngày sau khi hết
   hạn; cạnh link 180 ngày; audit 365 ngày; `ipBans` xoá hẳn 90 ngày sau khi
   hết hạn; `ipIntelCache` 24 giờ; tín hiệu identity 24 tháng.
5. **Quyền chủ thể**: admin có nút "Xoá dữ liệu xác minh của thành viên" trong
   `VerifyWebCard` (`verify.deleteUserVerifyData` — xoá phiên/tín hiệu/link,
   bỏ định danh audit + IP ban); hỗ trợ yêu cầu qua `/data-deletion`.
6. **Chuyển dữ liệu xuyên biên giới**: provider IP intel thường ở nước ngoài →
   cần DPA/SCC và ghi rõ trong chính sách; nếu không, chọn provider nội địa hoặc
   chỉ dùng country từ `api.country.is` (không đủ cho VPN).
7. **Discord Developer Policy**: cập nhật mô tả app/privacy policy; không thu
   thập dữ liệu ngoài phạm vi cần thiết; không chia sẻ với bên thứ ba ngoài
   provider đã nêu.
8. **Trẻ vị thành niên**: Discord yêu cầu 13+; vẫn cần hạn chế lưu và quyền xoá.

## 9. Lộ trình triển khai (6 pha)

| Pha                       | Nội dung                                                                                                                    | Test chặn                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **0. Chốt quyết định** ✅ | Provider (ipapi.is), hash-only, auto-ban, Vercel SPA — đã chốt 11/11/2026                                                   | Đã ghi `docs/decision-log.md`                                                |
| **1. Nền tảng dữ liệu**   | 4 bảng + crypto util (`ipHash`, `tokenHash`) + cron retention; **chưa đổi hành vi**                                         | unit test hash/token/retention; schema typecheck                             |
| **2. API + trang verify** | `createSession`, `completeSession`, `getStatus`, trang `/verify/:token`, consent + captcha; feature flag `verifyWebEnabled` | test token hết hạn/replay/cross-guild; XFF giả; IP private; rate-limit; CORS |
| **3. Bot integration**    | Link ephemeral, `jobs.verifyGrants`, ack, fallback button/captcha cũ                                                        | `test-interactionVerify`, `test-tick`, `test-bot-tick-settings`; e2e mock    |
| **4. IP intel + VPN**     | Adapter ipapi.is, cache, `vpnAction`, dashboard hiển thị country/ASN/VPN                                                    | mock provider; fail-open; cache hit; quota/circuit breaker                   |
| **5. IP ban + audit**     | `ipBans` CRUD, check ở completeSession, auto-ban + unban, audit, alert, appeal                                              | ban/revoke/expiry; hash mismatch; prefix; permission; owner/admin skip       |
| **6. Vận hành**           | Docs, privacy policy, i18n, rollout guild test → production; theo dõi false positive                                        | full gate + smoke VPS                                                        |

**Feature flag:** `guilds.verifyWebEnabled` (optional, default false). Bật theo
từng guild; khi tắt, hành vi cũ giữ nguyên 100%.

## 10. Quyết định đã chốt (11/11/2026)

| #   | Quyết định              | Lựa chọn                                                               | Hệ quả triển khai                                                                                           |
| --- | ----------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | Provider IP/VPN         | **ipapi.is**                                                           | Adapter `convex/ipIntel.ts`; đọc `isVPN/isProxy/isTor/isHosting`, ASN, country; timeout 4s; cache 24h       |
| 2   | Dữ liệu IP lưu          | **Chỉ HMAC-SHA-256 hash**                                              | Không có bảng raw IP; `IP_HASH_SECRET` trong Convex env; hash theo `guildId` để không correlate giữa server |
| 3   | Trúng IP ban khi verify | **Từ chối + tự động ban account**                                      | `ipBanAction: "ban"` mặc định; **bắt buộc** cảnh báo false positive, hạn ban, whitelist, appeal (§6.1)      |
| 4   | Nơi đặt trang verify    | **React SPA trên Vercel**, gọi thẳng Convex HTTP action từ trình duyệt | Route `/verify/:token` trong `src/lib/routes.json`; CORS allowlist; **không** proxy qua Vercel serverless   |

Bốn quyết định trên đã ghi vào `docs/decision-log.md`.

### 10.1. Còn mở — chốt ở pha tương ứng

1. **Phạm vi ban**: theo guild hay toàn cục? → đề xuất **theo guild**; toàn cục
   chỉ owner, dùng hash miền riêng. Chốt ở pha 5.
2. **IPv6**: ban địa chỉ hay `/64`? → đề xuất mặc định `/64` nhưng **tắt** cho
   đến khi admin chủ động bật; cảnh báo false positive. Chốt ở pha 5.
3. **Hành động VPN mặc định**: `flag` (đề xuất) / `deny_verify` / `kick`. VPN
   không tự ban — chỉ IP ban mới auto-ban. Chốt ở pha 4.
4. **Pháp lý**: privacy policy + DPA với ipapi.is + nội dung consent. **Chặn
   pha 2**: không thu thập IP thật trước khi xong.
5. **Hạn lưu cụ thể**: `memberIpLinks` 30 ngày (7–90), `ipBans` 7 ngày mặc định
   (trần 90), `ipIntelCache` 24h. Chốt ở pha 1 khi viết cron.
6. **Turnstile**: dùng Cloudflare Turnstile hay captcha tự vẽ? → đề xuất
   Turnstile (miễn phí, không cần server verify phức tạp). Chốt ở pha 2.

## 11. Tệp sẽ đụng (dự kiến)

- `convex/schema.ts` — 4 bảng mới (optional, expand-only).
- `convex/verify.ts` (mới) — session + grant.
- `convex/ipBans.ts` (mới) — CRUD + check.
- `convex/ipIntel.ts` (mới) — provider adapter + cache.
- `convex/http.ts` — route `/verify/complete`, `/verify/status`.
- `convex/bot_tick.ts` — `jobs.verifyGrants`.
- `bot/src/handlers/interactionVerify.js` — tạo session + link.
- `bot/src/handlers/hidden.js` — panel method `web`.
- `bot/src/tick.js` — xử lý grant.
- `src/pages/VerifyPage.tsx` (mới) + `src/lib/routes.json`.
- `src/components/dashboard/VerifyPanel.tsx` / `AltDetectionPanel.tsx` — UI.
- `src/lib/i18n.en.ts` — chuỗi EN.
- `docs/privacy` (hoặc `src/pages/PrivacyPage.tsx`) — nội dung IP.
- `scripts/test-verify-ip.ts` / `test-ip-bans.ts` (mới).

---

_Thiết kế đã chốt provider (ipapi.is), cách lưu (chỉ hash HMAC), hành vi khi
trúng IP ban (từ chối + auto-ban kèm chốt chống false positive) và nơi đặt
trang verify (SPA Vercel). Tài liệu này không thay đổi runtime; pha 1 chỉ thêm
bảng/helper/cron, chưa thu thập IP thật._

## 9. Trạng thái triển khai (11/11/2026)

Phần đã có trong code — đọc mục này thay vì suy từ kế hoạch phía trên:

| Thành phần              | File                                     | Ghi chú                                                                                                                                   |
| ----------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Token + băm IP/tín hiệu | `convex/verifyCrypto.ts`                 | Token 256-bit base64url; DB chỉ lưu SHA-256(token). HMAC tách miền `guild-ip` / `global-ip` / `signal`.                                   |
| Quyết định              | `convex/verifyPolicy.ts`                 | Thuần, không DB/mạng. Thứ tự: IP ban → ban evasion → VPN → link mềm → allow.                                                              |
| Phiên + đồ thị + grant  | `convex/verify.ts`                       | `botCreateSession`, `finalize`, `botPendingGrants`/`botClaimGrant`/`botFinishGrant`, `listSessions`, `listLinks`, `botRunRetention`.      |
| IP intel                | `convex/verifyActions.ts` (`"use node"`) | Đọc `IP_HASH_SECRET` + `IPINTEL_API_KEY`, cache 24h theo hash global. Thiếu key → vẫn verify, chỉ mất phần VPN.                           |
| Ban IP                  | `convex/verifyBans.ts`                   | 1..90 ngày (mặc định 7), không ban vĩnh viễn; `botSyncGuildBan` + `botReplaceGuildBans`.                                                  |
| HTTP                    | `convex/http.ts`                         | `POST /verify/complete` — IP đọc từ `x-forwarded-for`, CORS allowlist, trần tần suất RIÊNG trong `geoGuard` (không chia với `/geo_lang`). |
| Bot                     | `bot/src/verifyWeb.js`                   | Tạo phiên + DM link, thi hành grant, đồng bộ ban, bảo trì 1 lần/ngày trong tick.                                                          |
| Web                     | `src/pages/VerifyPage.tsx`               | Fingerprint canvas/WebGL + cookie first-party; honeypot + dwell ≥1.5s + `navigator.webdriver`.                                            |

### Biến môi trường

| Biến              | Nơi đặt          | Bắt buộc       | Thiếu thì sao                                                |
| ----------------- | ---------------- | -------------- | ------------------------------------------------------------ |
| `IP_HASH_SECRET`  | Convex env       | Có (để thu IP) | Phiên bị đánh `failed: missing_secret`; KHÔNG ghi hash rỗng. |
| `IPINTEL_API_KEY` | Convex env       | Không          | Không phát hiện VPN/proxy/Tor; mọi tín hiệu khác vẫn chạy.   |
| `DASHBOARD_URL`   | env bot trên VPS | Không          | Mặc định `https://protogon.freebuff.app` — link trong DM.    |

### Khác kế hoạch ban đầu (có chủ đích)

- **TTL phiên 10 phút**, không phải 15 — đủ cho một lượt bấm link, ngắn hơn thì
  link rò ra ngoài ít giá trị hơn.
- **Rate-limit tầng HTTP** nằm trong `geoGuard`: `/geo_lang` 20/phút/IP +
  300/phút toàn cục, `/verify/complete` 10/phút/IP + 300/phút toàn cục với
  **bộ đếm riêng** — flood endpoint geo công khai không khoá được đường xác
  minh. Không dùng bảng đếm DB: Convex free tier không đáng để thêm 3 reads
  mỗi lượt.
- **Không có `vpnFailClosed`**: provider lỗi → intel `null` → coi như sạch. Chặn
  toàn bộ người dùng khi ipapi.is sập là đánh đổi tệ hơn.
- **`/verify/complete` trả lý do công khai** (`allowed`/`flagged`/`blocked`/
  `banned`), KHÔNG trả `linkedUserId` hay mã lý do chi tiết.

## 10. Sửa sau review luồng người xác minh (11/11/2026)

- **Web không còn báo "thành công" khi mới xếp việc.** `getSession` trả thêm
  `grantState` (`pending` / `applied` / `failed`). Trang chỉ hiện "đã cấp quyền"
  khi bot ghi `grantAppliedAt` sau khi Discord API xác nhận; trước đó hiện
  "đang cấp quyền" và tự cập nhật reactive.
- **Deny không còn mặc định kick.** `human_check_failed`, IP ban chế độ
  "chỉ từ chối", CGNAT/IP dùng chung và VPN `strict` chỉ đóng phiên với
  `denied_no_action`. Chỉ `altPunish` hoặc `altVpnMode` do admin chọn
  `kick`/`ban`/`timeout` mới tạo hình phạt.
- **Lỗi Discord không bị nuốt.** `grantVerified`/ban/kick/timeout trả
  `applied:false` kèm `retryable`; `botFinishGrant` đưa lỗi tạm thời lại hàng
  chờ tối đa 5 lượt rồi ghi `grantFailedAt`. `grantAppliedAt` chỉ được ghi khi
  thao tác Discord thành công.
- **Nhắc mở DM.** Thành viên mới đóng DM nhận mention trong `verifyChannelId`
  kèm nút `verify_web_start`; không bao giờ đăng token/link công khai.

## 11. Sửa sau review bảo mật lại (11/11/2026)

- **`/verify/complete` có bộ đếm rate-limit riêng.** Trước đó nó dùng chung
  `allowGeoRequest` với `/geo_lang` — endpoint công khai, CORS mở. Flood 300
  lượt/phút (chỉ cần ~15 IP) vào `/geo_lang` làm mọi lượt xác minh trên instance
  nhận 429, người thật bị join gate đá ra. Nay `allowVerifyRequest` có Map +
  trần riêng; test `scripts/test-rate-guard.ts` khoá cả hai chiều độc lập.
- **Xác minh thực nghiệm giới hạn tin cậy của IP.** Trên backend Convex local,
  `ctx.meta.getRequestMetadata().ip` và `x-forwarded-for` cùng trả giá trị
  client gửi — nghĩa là đổi sang `ctx.meta` KHÔNG tự khắc phục giả mạo XFF.
  Việc edge production có ghi đè XFF hay không phải kiểm bằng request thật tới
  `*.convex.site`; đến khi xác nhận, coi XFF là ranh giới cần platform bảo đảm.
  Trần per-IP và ban IP chỉ đáng tin khi edge ghi đè header.

## 12. Gia cố P0 (11/11/2026)

- **XFF: lấy mục CUỐI, không lấy mục đầu.** `convex/clientIp.ts` là bản duy
  nhất của quy tắc (dùng cho `/geo_lang`, `/verify/complete`, self-test).
  `resolveClientIp()` ưu tiên mục cuối nếu công cộng, lùi về metadata Convex,
  và fail-closed khi cả hai private. Đổi `TRUSTED_PROXY_HOPS` chỉ khi biết chắc
  số hop — mặc định 1.
- **Self-test trước khi bật.** `POST /verify/self-test` (Bearer token admin)
  kiểm env, ipapi.is, cấu hình guild, heartbeat bot và dò XFF bằng IP TEST-NET.
  Trình duyệt không gửi được `x-forwarded-for` → check XFF là advisory
  `probe_missing`; muốn kết luận phải chạy curl kèm header thật.
- **Consent server-authoritative.** Thiếu `consent: true` → `consent_required`
  trước khi đọc DB/băm/gọi provider. `consentVersion` + `consentAt` do server
  ghi.
- **Xoá dữ liệu theo guild.** `verify.deleteUserVerifyData` xoá phiên/tín
  hiệu/link, bỏ định danh audit + IP ban (giữ hồ sơ an ninh). `listSessions`
  không còn trả hash IP đầy đủ — chỉ `canBanIp`.

## 13. Mô hình truy cập dữ liệu verify (11/11/2026)

Chỉ bốn nhóm dưới đây chạm được dữ liệu IP/PII; mọi nhóm khác nhận `null`
(query) hoặc lỗi (mutation). Test `scripts/test-verify-flow.ts` mục 15 khoá
từng dòng.

| Chủ thể                                            | Được đọc                                                                                                                                                            | Cổng kiểm tra                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Trang verify công khai**                         | Chỉ metadata phiên CỦA CHÍNH MÌNH qua token 256-bit: trạng thái, tên server, hạn, quyết định. KHÔNG có `ipHash`, `ipHashShort`, `linkedUserId`, tín hiệu hay IP thô | `getSession` băm token rồi tra `by_tokenHash`; token sai/hết hạn → `null`                                               |
| **Quản trị viên server** (Discord `Manage Server`) | Phiên, link alt, IP ban, thống kê, xoá dữ liệu — **chỉ guild mình quản lý**                                                                                         | `canManageGuild` ⇄ `manageableGuildIds` do Discord trả về lúc đăng nhập; mọi query/mutation nhận `guildId` đều kiểm lại |
| **Bot**                                            | Phiên chờ cấp quyền, userId/guildId để thi hành, đồng bộ guild ban                                                                                                  | `requireBotKeyStrict` — botKey = HMAC của `OWNER_SEED`, chỉ tiến trình bot có                                           |
| **Chủ sở hữu bot**                                 | Trong app: như quản trị viên server (chỉ guild họ quản lý). Ngoài app: quyền hạ tầng Convex dashboard                                                               | `isBotOwnerUser` chỉ dùng cho cửa sổ Admin (feedback/payments/status), KHÔNG mở rộng quyền đọc verify                   |

Ghi chú:

- **Team admin không phải guild admin** → không thấy dữ liệu verify. `requireBotAdmin`
  là cổng của Admin panel, tách hẳn khỏi dữ liệu guild.
- **Không trả hash đầy đủ**: `listSessions` trả `canBanIp`, `listIpBans` trả
  `ipHashShort` (12 ký tự); `createIpBan`/`revokeIpBan` nhận `id`/`sessionId` và
  tự đọc hash phía server.
- **IDOR đã khoá**: admin guild A truyền `guildId`/`sessionId`/`linkId` của guild
  B → `null`/lỗi; `createIpBan` kiểm `session.guildId === args.guildId`.
- **Quyền có thể trễ**: `manageableGuildIds` làm mới khi đăng nhập; phiên sống
  30 ngày, nên admin bị giáng chức vẫn đọc được tới lần đăng nhập kế tiếp. Muốn
  thu hồi tức thì phải xoá phiên (`sessions`) hoặc giảm TTL — chưa làm vì đổi
  hành vi đăng nhập ngoài phạm vi việc này.
