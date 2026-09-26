# Prompt AI cho Antigravity CLI (`agy`) trên VPS

> Bộ prompt sẵn dùng để dùng `agy` (Antigravity CLI, gói Google AI Pro) làm trợ lý
> viết UI/thiết kế dashboard ngay trên VPS. Viết 26/09/2026 — mô hình trong tên có
> thể thay đổi theo thời gian, các khối prompt thì không.
>
> Quy tắc chung: **agy = pair-programmer, không phải người giữ kho**. Nó tự sửa code
>
> - tự chạy test; còn review, commit, push là việc của bạn (hoặc agent OpenCode
>   trên VPS). Đừng bao giờ để agy tự `git commit`/`git push` trên máy production.

---

## 0. Cài đặt một lần trên VPS

```bash
curl -fsSL https://antigravity.google/cli/install.sh | bash   # vào ~/.local/bin/agy
agy   # lần đầu: nó in URL → mở trên máy bạn → dán code trở lại terminal
```

- Chạy trong `tmux`/`screen` để phiên không chết khi mất SSH.
- Chọn model trong CLI: **Gemini 3.8 Flash** (mới nhất, kế thừa 3.7 Flash) hoặc
  **Gemini 3.1 Pro** khi cần suy luận khó. Cả hai đều thuộc hạn mức Google AI Pro.
- agy đọc `AGENTS.md` tự động nếu nó nằm ở gốc repo (nó đọc theo chuẩn agent file
  giống AGENTS.md của OpenCode/Claude Code). Vẫn dán khối hợp đồng dưới đây khi
  muốn siết chặt hơn hợp đồng chung.

---

## 1. Khối hợp đồng — dán vào ĐẦU mỗi phiên agy

```text
Bạn là pair-programmer trên VPS production của bot Discord Protogon.
Đọc AGENTS.md ở gốc repo trước khi làm gì. Luật bắt buộc:

1. CHỈ sửa file trong src/ (dashboard React + TS). KHÔNG đụng bot/, convex/,
   vite.config.ts, package.json, lockfile. Đụng gì khác phải hỏi tôi trước.
2. Chuỗi UI viết thẳng tiếng Việt rồi bọc translate("…"); không thêm key tiếng
   Anh. Không đụng src/lib/i18n.en.ts / i18n.de.ts — tôi sẽ tự chạy
   node scripts/check-i18n.cjs và bổ sung bản dịch.
3. Sau MỖI thay đổi chạy: bun tsc -b --noEmit && node scripts/check-i18n.cjs
   && bun run lint. Cả 3 phải sạch trước khi báo xong. KHÔNG chạy bun run dev,
   KHÔNG git commit/push.
4. Giữ nguyên provider tree của app (App.tsx, main.tsx), shadcn/ui + Tailwind
   hiện có; không cài thư viện mới; không đổi routing hay auth wrapper.
5. Làm việc theo bước nhỏ: nêu kế hoạch ≤ 5 bước → chờ tôi ok → làm từng bước,
   mỗi bước nêu file đã sửa + tóm tắt thay đổi.
```

---

## 2. Prompt thiết kế UI (chọn 1 khi cần)

### 2.1 — Redesign một panel có sẵn

```text
Nhiệm vụ: redesign giao diện panel X trong src/components/dashboard/XPanel.tsx
theo hướng hiện đại, sáng sủa, giữ NGUYÊN mọi logic + props + hook + đường dẫn
Convex — chỉ đổi phần render.

Yêu cầu thiết kế:
- Bám hệ màu/token Tailwind hiện có (bg-card, text-muted-foreground, border,
  bg-primary…), không tự chế màu mới.
- Grid/responsive: mobile 1 cột, md 2 cột, lg 3 cột; khoảng cách đều, thoáng.
- Thêm hover/focus state nhẹ, transition 150–200ms, không animation lòe loẹt.
- Icon dùng lucide-react đã có trong repo, không thêm icon library.
- Empty state + loading state phải có, dùng cùng pattern các panel khác.

Sau khi sửa: chạy bun tsc -b --noEmit && bun run lint — sạch mới báo xong,
KHÔNG tự commit.
```

### 2.2 — Panel mới theo pattern hiện có

```text
Tạo panel mới "TênPanel" cho dashboard Protogon:
- File: src/components/dashboard/TenPanel.tsx, đăng ký trong nơi liệt kê panel
  hiện có (cùng chỗ các panel khác được import/render).
- Copy cấu trúc từ panel gần nhất về mục đích (đọc trước 2 panel để bắt chước
  pattern: cách lấy token qua getSessionToken(), cách gọi useQuery/mutation,
  cách bọc translate()).
- UI: Card + CardHeader/CardContent của shadcn/ui, responsive, empty/loading
  state, icon lucide.
- Chuỗi tiếng Việt bọc translate("…"). KHÔNG sửa i18n.en.ts/i18n.de.ts.
- KHÔNG tự chạy bun convex codegen hay đụng convex/.
- Kiểm chứng: bun tsc -b --noEmit && node scripts/check-i18n.cjs && bun run lint
  — cả 3 sạch mới báo xong.
```

### 2.3 — Sửa landing/SEO

```text
Cải thiện landing page (src/pages/Landing.tsx hoặc FeaturesPage.tsx):
- Giữ nguyên route, meta/seo (src/lib/seo.ts, public/sitemap.xml), i18n pattern
  hiện có (featuresContent.ts tự chứa vi/en/de trong @i18n-content).
- Chỉ tăng chất lượng hiển thị: hero rõ hơn, CTA nổi hơn, section social-proof,
  spacing theo thang Tailwind, dark mode vẫn ổn.
- Không thêm dependency; không đổi vite.config.ts; không đổi router.
- Kiểm chứng sau khi sửa: bun tsc -b --noEmit && bun run lint.
```

### 2.4 — Sửa bug UI nhỏ

```text
Bug: [mô tả hiện tượng + bước tái hiện + kết quả mong đợi].
Phạm vi: chỉ src/. Đọc code liên quan trước, nêu GỐC RỄ (không phải vá bề mặt),
đề xuất sửa ≤ 30 dòng. Tôi ok rồi mới sửa. Sau khi sửa chạy
bun tsc -b --noEmit && bun run lint và báo kết quả thật.
```

### 2.5 — Rà soát UI đồng bộ trước khi merge

```text
Rà soát diff hiện tại (git diff) theo checklist, KHÔNG sửa gì, chỉ báo cáo:
1. Chuỗi mới đã bọc translate() chưa? Có key nào thiếu bản EN/DE không?
2. Có phá pattern hiện có không (token màu lạ, hardcoded hex, px tự chế)?
3. Responsive: có class chỉ đẹp trên desktop không?
4. Có đụng vùng cấm (bot/, convex/, vite.config.ts, router, App.tsx) không?
Trả về danh sách vấn đề theo mức: [chặn merge] / [nên sửa] / [gợi ý].
```

---

## 3. Sau khi agy làm xong — QUY TRÌNH BẮT BUỘC

```bash
git diff                                    # đọc bằng mắt, review từng file
bun run test                                # 61 suites
bun tsc -b --noEmit                         # typecheck
bun run lint                                # ESLint
node scripts/check-i18n.cjs                 # bổ sung bản EN/DE nếu agy thêm key mới
bun run format                              # rồi format:check
node scripts/check-repo-map.cjs             # nếu thêm/xoá trang/panel
```

- i18n guard sẽ đỏ nếu agy thêm chuỗi mới mà chưa có bản EN/DE — bổ sung vào
  `src/lib/i18n.en.ts` / `i18n.de.ts` rồi chạy lại `node scripts/check-i18n.cjs`.
- Xong hết → commit theo đúng quy ước AGENTS.md (tiếng Việt, ≤ 72 ký tự, footer
  `🤖 Generated with OpenCode`), hoặc đưa vào panel Changes của Freebuff.
- Ưu tiên: để agent OpenCode trên VPS review diff một lượt trước khi commit.

```

```
