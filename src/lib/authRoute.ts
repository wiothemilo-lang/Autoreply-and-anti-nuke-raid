/**
 * authRoute.ts — quyết định của TRANG ĐĂNG NHẬP (`/auth`): hiện form đăng nhập,
 * đang kiểm tra phiên, hay đưa thẳng người dùng vào app.
 *
 * ── Vì sao cần (bug thật "đăng nhập rồi vẫn bị hỏi đăng nhập lại") ───────────
 * `/auth` trước đây LUÔN hiện nút "Đăng nhập với Discord", kể cả khi phiên vẫn
 * còn sống. Hệ quả thật, không phải giả thuyết:
 *   · Người dùng bấm Back sau khi đăng nhập → về `/auth` → thấy form đăng nhập
 *     → tưởng đã bị đăng xuất → đăng nhập LẦN NỮA (đúng nghĩa "duplicate").
 *   · Link/bookmark `/auth` còn lưu → mở ra là form đăng nhập dù phiên 30 ngày
 *     vẫn hợp lệ.
 *   · Vòng tự thân: `returnTo` có thể trỏ về chính `/auth` (URL bị mã hoá hai
 *     lần, hoặc link cũ). Nếu đích đến sau đăng nhập vẫn là `/auth` thì người
 *     dùng đăng nhập xong lại thấy form đăng nhập — vòng lặp không lối ra.
 *     `resolveAuthPageState` chặn cả `/auth` lẫn `/discord/callback` làm đích.
 *
 * Hàm THUẦN (không đụng window/React) để test hermetic được: quyết định này
 * quyết định người dùng có bị đá sang Discord một lần nữa hay không.
 */
import { safeRedirectPath } from "./discord";

/** Kết quả quyết định cho `/auth`. */
export type AuthPageState =
  /** Chưa biết phiên còn sống hay không (query đang chạy) — chưa được hiện form. */
  | { kind: "splash" }
  /** Không có phiên hợp lệ → hiện form đăng nhập. */
  | { kind: "login" }
  /** Đã đăng nhập → đưa thẳng vào app, KHÔNG hỏi lại. */
  | { kind: "app"; to: string };

/**
 * Đường dẫn KHÔNG bao giờ được dùng làm đích sau đăng nhập: `/auth` (tự quay
 * lại form đăng nhập = vòng lặp) và `/discord/callback` (trang chỉ chạy được
 * khi có `code`, mở trực tiếp là lỗi "thiếu mã xác nhận").
 */
const NEVER_REDIRECT_TO = ["/auth", "/discord/callback"];

/** Bỏ query/hash + dấu `/` thừa để so đường dẫn với danh sách chặn. */
function pathKey(path: string): string {
  const clean = path.split("?")[0].split("#")[0].replace(/\/+$/, "");
  return clean === "" ? "/" : clean;
}

/** Đích đến có làm người dùng quay lại chính trang đăng nhập không. */
export function isAuthLoopTarget(path: string): boolean {
  const key = pathKey(path);
  return NEVER_REDIRECT_TO.some((blocked) => key === blocked || key.startsWith(`${blocked}/`));
}

/**
 * `me` là giá trị thô của `api.sessions.me`:
 *   undefined = đang tải, null = phiên không hợp lệ, object = đã đăng nhập.
 * `hasToken` = có token trong storage (chưa chắc còn hợp lệ — server mới là
 * nguồn sự thật). Chỉ khi CẢ HAI đúng thì mới đưa vào app.
 */
export function resolveAuthPageState({
  hasToken,
  me,
  returnTo,
}: {
  hasToken: boolean;
  me: unknown;
  returnTo: string | null | undefined;
}): AuthPageState {
  if (me === undefined && hasToken) return { kind: "splash" };
  // ↑ Splash CHỈ khi ĐANG CÓ token cần kiểm tra. Không token thì query bị
  // "skip" nên me = undefined MÃI MÃI — phải hiện form ngay. Bug thật
  // 10/10/2026: nhánh trên từng bỏ qua hasToken → khách chưa đăng nhập mở
  // /auth (hoặc bị RequireAuth đá sang) bị kẹt vô hạn ở màn "Đang kiểm tra
  // phiên đăng nhập…", không thấy nút đăng nhập, không đăng nhập được.
  if (hasToken && me) {
    const to = safeRedirectPath(returnTo, "/dashboard");
    return { kind: "app", to: isAuthLoopTarget(to) ? "/dashboard" : to };
  }
  return { kind: "login" };
}
