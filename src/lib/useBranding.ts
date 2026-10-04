import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export interface Branding {
  botAvatarUrl: string | null;
  haimiyaAvatarUrl: string | null;
}

/** Dữ liệu `hidden.getBotBranding` trả về (chỉ phần hook này dùng). */
export interface BrandingData {
  botAvatarUrl?: string | null;
  haimiyaAvatarUrl?: string | null;
}

/**
 * `undefined` = query chưa trả lời ⇒ ĐANG TẢI, chưa có branding nào để hiện.
 */
export type BrandingInput = BrandingData | undefined;

/**
 * Chuyển dữ liệu query thành `Branding` — HÀM THUẦN, tách riêng khỏi hook.
 *
 * Vì sao tách: `useQuery` của Convex chỉ chạy được trong cây React có
 * `ConvexProvider`, nên `useBranding()` không gọi được trong script test —
 * mà lỗi ở đây là lỗi NHÌN THẤY: avatar bot/Haimiya rỗng thì logo vỡ hoặc
 * rơi về ảnh mặc định trên mọi trang. Phần thật sự đáng test là ánh xạ này,
 * nên để riêng và để hook chỉ còn một dòng gọi.
 *
 * Vì sao `?? null` dù chính query đã `?? null` rồi: schema khai
 * `v.optional(v.string())` cho hai trường này (`convex/schema.ts`), nên
 * `undefined` là giá trị thật trong dữ liệu. Chuẩn hoá tại đây giữ cho
 * kiểu `Branding` luôn là `string | null` — không có `undefined` lọt vào JSX.
 */
export function toBranding(data: BrandingInput): Branding | null {
  if (data === undefined) return null;
  return {
    botAvatarUrl: data.botAvatarUrl ?? null,
    haimiyaAvatarUrl: data.haimiyaAvatarUrl ?? null,
  };
}

/**
 * Avatar tùy chỉnh của bot & Haimiya (do admin sở hữu bot đặt trong
 * Tính năng ẩn → Tùy chỉnh giao diện). Trả về null khi đang tải.
 */
export function useBranding(): Branding | null {
  return toBranding(useQuery(api.hidden.getBotBranding));
}
