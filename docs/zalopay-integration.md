# Tích hợp ZaloPay — thanh toán /donate + /premium

> 06/10/2026 · Code: `convex/payments.ts` (logic + giá) · `convex/paymentsAction.ts`
> (action Node gọi ZaloPay) · `convex/http.ts` (IPN `/zalopay/callback`) ·
> `src/components/PaymentReturn.tsx` + `DonatePage`/`PremiumPage` (UI) ·
> test: `scripts/test-payments.ts` (65 assertion hermetic).

## 1. Đăng ký tài khoản ZaloPay ( việc của CON NGƯỜI — agent không làm thay )

1. Vào <https://developers.zalopay.vn> → **Đăng nhập bằng Zalo** (quét QR) hoặc
   số điện thoại + mã OTP.
2. Tạo ứng dụng trong Developer Studio → nhận **App ID**. Môi trường **Sandbox**
   thường bật ngay; nếu portal chưa hiện key, cung cấp SĐT + email cho bộ phận
   hỗ trợ ZaloPay để họ tạo tài khoản sandbox (theo Integration Guide chính thức).
3. Trang chi tiết ứng dụng → lấy **Key 1 (Mac key)** và **Key 2 (Callback key)**:
   - **key1** ký mọi yêu cầu ĐI tới ZaloPay (create, query).
   - **key2** verify phản hồi VỀ từ ZaloPay (IPN callback).
4. Cài app **ZaloPay Sandbox** (App Store/CH Play) + ví test để thanh toán ảo —
   xem docs `Việc kiểm thử` → `Ví kiểm thử` trên docs.zalopay.vn.
5. Sang **production** cần hoàn tất hồ sơ merchant (cá nhân: CCCD + tài khoản
   nhận tiền; doanh nghiệp: GPKD) → nhận bộ key production riêng.

**Không dán key vào chat/repo/env file do agent quản lý.** Key chỉ đi vào:

- Sandbox preview: tab **Settings → Environment** của Freebuff (user tự nhập).
- Convex production: `npx convex env set ZALOPAY_APP_ID "<giá trị>"` (chạy trên
  VPS, có auth Convex) hoặc Convex Dashboard → Deployment Settings → Environment.
  Hành động `"use node"` chỉ đọc được env CỦA DEPLOYMENT CONVEX — set ở
  Freebuff mà không set ở Convex thì production vẫn báo
  "Cổng thanh toán chưa được cấu hình".

## 2. Biến môi trường

| Biến              | Bắt buộc             | Nghĩa                                                                                                                                                                                       |
| ----------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ZALOPAY_APP_ID`  | ✅                   | App ID (số)                                                                                                                                                                                 |
| `ZALOPAY_KEY1`    | ✅                   | Mac key — ký create/query                                                                                                                                                                   |
| `ZALOPAY_KEY2`    | ✅                   | Callback key — verify IPN                                                                                                                                                                   |
| `ZALOPAY_MODE`    | (mặc định `sandbox`) | `live` = cổng thật (`openapi.zalopay.vn`), còn lại = sandbox (`sb-openapi.zalopay.vn`)                                                                                                      |
| `DASHBOARD_URL`   | nên có               | Gốc dashboard (vd `https://protogon.freebuff.app`) — làm `redirecturl` sau thanh toán; thiếu thì fallback theo `OAUTH_REDIRECT_URI`, thiếu cả hai thì ZaloPay dùng URL đăng ký trong portal |
| `CONVEX_SITE_URL` | tự có                | Convex tự inject → `callback_url` trỏ đúng `…/zalopay/callback`                                                                                                                             |

## 3. Luồng tiền (không có chỗ nào tin client)

```
/trang?…  →  paymentsAction.startPayment
              ├─ createIntentInternal: xác thực phiên, CHẾT GIÁ theo plan
              │  (client chỉ gửi plan; chặn spam ≤3 đơn pending/giờ;
              │   chặn mua gói thấp hơn quyền đang có)
              ├─ ký MAC key1 = HMAC(app_id|app_trans_id|app_user|amount|
              │                     app_time|embed_data|item)
              └─ POST /v2/create → { order_url } → browser redirect

ZaloPay ──IPN POST──► https://<deploy>.convex.site/zalopay/callback
              └─ http.ts → paymentsAction.handleCallback
                 verify HMAC(key2, data) → markPaidInternal (idempotent)
                 → entitlement (nếu premium)

Trang ?order= ──► paymentsAction.queryOrder (poll ≤4 lần)
              └─ DB đã paid? dùng luôn. Chưa → POST /v2/query (MAC key1)
                 → paid → markPaidInternal (chốt tiền khi IPN bị lỡ)
```

- **Tiền lệch** (ZaloPay báo số khác đơn): vẫn `paid` (đã MAC-verify là tiền
  thật) nhưng ghi chú vào `payments.error` để đối soát.
- **Hết hạn Premium tính lười**: quá `expiresAt` là hết hạn khi đọc — không có
  cron (cron repo này chỉ được đụng cờ trên `guilds`).
- **Quyền lợi**: 1 đơn premium = +30 ngày; cùng gói cộng dồn; nâng gói đổi ngay
  - giữ thời gian còn lại; **không thể mua gói thấp hơn khi gói cao đang chạy**
    (chặn từ lúc tạo đơn — không có khe "mua rẻ gia hạn gói đắt").

## 4. Checklist chuyển SANDBOX → LIVE

- [ ] Thanh toán thử sandbox thành công: đơn trong bảng `payments` chuyển
      `paid`, `entitlements` có dòng đúng hạn, trang /premium hiện "Gói … đang
      hoạt động — dùng tới …".
- [ ] Kiểm tra IPN tới nơi: ZaloPay Developer Portal → callback log (sandbox).
- [ ] On production deployment: set `ZALOPAY_MODE=live` + bộ key production
      (`npx convex env set …`) — key sandbox ≠ key production.
- [ ] Portal (production): URL callback mặc định =
      `https://<deploy>.convex.site/zalopay/callback`; URL trả về =
      `https://protogon.freebuff.app/donate`.
- [ ] Mua thật gói thấp nhất (49.000đ) một lần, xác nhận hiển thị + đối soát
      trên Merchant portal, rồi thử refund từ portal nếu muốn (repo chưa có
      API refund — đối soát tay qua portal).

## 5. Troubleshooting

| Triệu chứng                                                      | Nguyên nhân / Cách xử                                                                                                      |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| "Cổng thanh toán chưa được cấu hình — thiếu ZALOPAY_APP_ID/KEY1" | Thiếu env Ở CONVEX DEPLOYMENT (không phải file .env cục bộ). `npx convex env list` để xem tên (không in giá trị).          |
| "ZaloPay từ chối tạo đơn (…)"                                    | Xem chi tiết trong cột `error` của bảng `payments`. Thường: sai key/app_id (sandbox key gọi endpoint live hoặc ngược lại). |
| Đã trừ tiền nhưng chưa `paid`                                    | IPN tới chậm hoặc chưa tới → trang trả về tự query (queryOrder) chốt; nếu quá 10 phút, mở lại trang `?order=<mã đơn>`.     |
| Callback trả `return_code: 2 mac not equal`                      | Sai `ZALOPAY_KEY2` hoặc portal gửi key khác — đối chiếu key callback trong portal.                                         |
| Người dùng quay về trang không có `?order=`                      | Portal redirect URL chưa đặt → đặt theo mục 4 (embed_data.redirecturl chỉ ghi đè khi tạo đơn có `DASHBOARD_URL`).          |

Đơn cần tra nhanh: bảng `payments` trong Convex Dashboard (index `by_appTransId`),
chuỗi `appTransId` chính là **Mã đơn** hiển thị trên banner cho người dùng.
