/**
 * avatarImage — chuẩn hoá ảnh avatar TRƯỚC KHI upload lên Convex storage.
 *
 * Vì sao cần (bug thật 07/10/2026, "lỗi avatar" trên trang chủ): avatar
 * Haimiya đang lưu là ảnh 3600×2025 (~1.1MB) — to gấp ~18 lần khung hiển thị
 * 192px. Điện thoại decode ảnh đó chậm và tốn ~29MB bitmap → khung vẽ dở
 * lúc cuộn, ảnh hiện nhòe/sọc ngang (đúng triệu chứng người dùng bắt gặp),
 * và file nguồn format lạ (progressive/CMYK/HEIC) có máy đọc ra rác. Chuẩn hoá
 * tại máy khách bằng <canvas>:
 *
 *   - decode thật qua <img> (mọi định dạng trình duyệt đọc được) — file KHÔNG
 *     đọc được bị TỪ CHỐI ngay, không âm thầm lên production rồi vỡ màn hình;
 *   - co về AVATAR_MAX_DIM (512px — dư 2–3× cho khung 192px retina);
 *   - encode lại thành JPEG baseline/PNG chuẩn, EXIF bị cắt luôn (ảnh xoay
 *     lật cũng được chỉnh về đúng chiều vẽ).
 *
 * GIF giữ nguyên (giữ hoạt ảnh; GIF luôn ≤640 màu nên máy nào cũng decode
 * chuẩn). Hàm thuần `planAvatarResize` test được ngoài trình duyệt.
 */

import { translate } from "./i18n";

/** Khung lớn nhất avatar cần tới (hero desktop 192px × hệ số retina ~2.7). */
export const AVATAR_MAX_DIM = 512;

export type AvatarResizePlan = {
  width: number;
  height: number;
  scale: number;
};

/**
 * Tính kích thước đích khi co ảnh về `maxDim` — không phóng to ảnh đã nhỏ.
 * Hàm thuần: nhận số, trả số — test hermetic được.
 */
export function planAvatarResize(
  width: number,
  height: number,
  maxDim: number = AVATAR_MAX_DIM,
): AvatarResizePlan {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(translate("Kích thước ảnh không hợp lệ."));
  }
  const long = Math.max(width, height);
  if (long <= maxDim) return { width: Math.round(width), height: Math.round(height), scale: 1 };
  const scale = maxDim / long;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

export type NormalizedAvatar = { blob: Blob; width: number; height: number };

/**
 * Decode → co ≤512px → encode lại. Ném Error tiếng Việt nếu file hỏng —
 * caller (BrandingPanel) bắt và toast, KHÔNG upload file không đọc được.
 *
 * Chỉ chạy được trong trình duyệt (dùng <img>/<canvas>) — test thuần dùng
 * `planAvatarResize`, phần DOM này được khoá bằng contract test nguồn.
 */
export async function normalizeAvatarFile(file: File): Promise<NormalizedAvatar> {
  // GIF: giữ nguyên hoạt ảnh (không qua canvas).
  if (file.type === "image/gif") {
    return { blob: file, width: 0, height: 0 };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () =>
        reject(new Error(translate("Ảnh không đọc được — hãy chọn file JPG/PNG/WebP khác.")));
      el.src = url;
    });
    const plan = planAvatarResize(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = plan.width;
    canvas.height = plan.height;
    const ctx = canvas.getContext("2d");
    if (!ctx)
      throw new Error(translate("Trình duyệt không vẽ được ảnh — thử trình duyệt khác nhé."));
    ctx.drawImage(img, 0, 0, plan.width, plan.height);
    // PNG/WebP giữ kênh alpha (logo trong suốt); phần còn lại → JPEG baseline.
    const keepAlpha = file.type === "image/png" || file.type === "image/webp";
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, keepAlpha ? "image/png" : "image/jpeg", 0.9),
    );
    if (!blob) throw new Error(translate("Không nén được ảnh — hãy chọn file ảnh khác."));
    return { blob, width: plan.width, height: plan.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
