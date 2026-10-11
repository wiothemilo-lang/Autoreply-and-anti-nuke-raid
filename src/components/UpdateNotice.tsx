import { useEffect, useState } from "react";
import { ConvexHttpClient } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { Megaphone, X } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { cn } from "../lib/utils";
import { dateLocale, translate } from "../lib/i18n";
import { resolveConvexUrl } from "../lib/convexUrl";
/**
 * Thanh thông báo TOÀN TRANG (10/10/2026) — mount trong App.tsx nên hiện trên
 * MỌI trang, kể cả khách chưa đăng nhập:
 *
 *  - Bài thông báo admin vừa viết trong cửa sổ Admin (`announcements.publicFeed`
 *    trả bài `active` MỚI NHẤT) — kèm ngày đăng và nút đóng.
 *  - Nhãn "Bản cập nhật hiện tại: v…" lấy từ `siteInfo` do admin đặt — hiện
 *    CẢ khi không có thông báo nào (yêu cầu: hiển thị bản cập nhật hiện tại).
 *
 * Nút đóng ghi theo TỪNG BÀI (`id:updatedAt` vào localStorage): admin sửa bài
 * là thông báo hiện lại, và đóng bài không nuốt mất nhãn bản cập nhật.
 *
 * TẠI SAO ConvexHttpClient thay useQuery (không phải style, mà là Chốt sự cố
 * CI + production 10/10/2026):
 *  - useQuery khi backend CHƯA có function (khoảng CI chạy test TRƯỚC job
 *    deploy, hoặc frontend live trước Convex deploy ~2 phút) → convex client
 *    ghi `console.error("[CONVEX Q(...)] Server Error")` + ném lỗi during
 *    render → RootErrorBoundary thay CẢ trang bằng màn lỗi. Test trình duyệt
 *    G (không được có console error) bắt được đúng vậy, và người dùng thật
 *    cũng thấy trắng trang — một thanh banner phụ không được phép làm điều đó.
 *  - ConvexHttpClient ném exception trong promise → bắt bằng try/catch ở đây,
 *    im lặng tuyệt đối (HTTP 200 + status:error, không có network log). CORS
 *    của /api/query cho phép origin lạ (đã probe 10/10/2026), CSP đã mở
 *    https://*.convex.cloud.
 *  - Đổi lấy: không reactive (admin sửa bài → khách thấy sau F5) — chấp nhận
 *    được vì thông báo không phải dữ liệu thời gian thực.
 *
 * Không có loading flash: `feed === null` (chưa về / lỗi) → render rỗng, thanh
 * tự hiện khi có dữ liệu; không có gì để báo thì vẫn rỗng (không chiếm chỗ).
 */
type Feed = FunctionReturnType<typeof api.announcements.publicFeed>;
const LS_KEY = "protogon:update-notice";

function readHidden(): string | null {
  try {
    return window.localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}

function writeHidden(key: string): void {
  try {
    window.localStorage.setItem(LS_KEY, key);
  } catch {
    // storage bị chặn (chế độ riêng tư) — chỉ là mất trạng thái đóng thôi.
  }
}

export default function UpdateNotice() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [hidden, setHidden] = useState<string | null>(readHidden);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const client = new ConvexHttpClient(resolveConvexUrl());
        const result = await client.query(api.announcements.publicFeed, {});
        if (!cancelled) setFeed(result);
      } catch {
        // Backend chưa deploy function / lỗi tạm / URL chưa sẵn — banner chỉ là
        // lớp phụ, nuốt lỗi là ĐÚNG: không console.error, không ném render.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!feed) return null;
  const { currentVersion, notice } = feed;
  const noticeKey = notice ? `${notice.id}:${notice.updatedAt}` : null;
  const dismissed = !!noticeKey && hidden === noticeKey;
  const showNotice = !!notice && !dismissed;
  if (!showNotice && !currentVersion) return null;

  const dismiss = () => {
    if (!noticeKey) return;
    writeHidden(noticeKey);
    setHidden(noticeKey);
  };

  return (
    <div role="status" aria-live="polite" className="border-b border-border bg-primary/10">
      <div className="container flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 text-xs">
        {showNotice && notice && (
          <>
            <span className="inline-flex items-center gap-1 font-semibold text-foreground">
              <Megaphone className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {translate(notice.title)}
            </span>
            {notice.version && (
              <span className="shrink-0 rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-bold">
                v{notice.version}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{notice.body}</span>
            <span className="shrink-0 text-muted-foreground">
              {new Date(notice.createdAt).toLocaleDateString(dateLocale())}
            </span>
            <button
              type="button"
              onClick={dismiss}
              aria-label={translate("Đóng thông báo")}
              className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </>
        )}
        {currentVersion && (
          <span
            className={cn(
              "shrink-0 text-muted-foreground",
              showNotice && "font-medium text-foreground",
            )}
          >
            {translate("Bản cập nhật hiện tại: {ver}", { ver: `v${currentVersion}` })}
          </span>
        )}
      </div>
    </div>
  );
}
