export const SESSION_TOKEN_KEY = "wio_session_token";
export const OAUTH_VERIFIER_KEY = "wio_oauth_verifier";
export const OAUTH_STATE_KEY = "wio_oauth_state";
export const REMEMBER_LOGIN_KEY = "wio_remember_login";

/**
 * Luồng làm mới im lặng: prompt=none, dùng chung redirect /discord/callback.
 * PKCE verifier + state phải ở sessionStorage (khớp đúng tab vừa chuyển trang).
 * Khoá chống lặp (`thử gần nhất` / `đã hỏng`) nằm ở `silentRefresh.ts` và dùng
 * localStorage — phạm vi trình duyệt, vì sessionStorage là riêng từng tab nên
 * tab mới luôn bị đẩy sang Discord lại từ đầu (bug thật 06/10/2026).
 */
export const SILENT_VERIFIER_KEY = "wio_silent_verifier";
export const SILENT_STATE_KEY = "wio_silent_state";

/** Chỉ lưu đăng nhập tối đa 7 ngày khi bật "Lưu đăng nhập". */
export const SESSION_EXPIRY_DAYS = 7;

interface StoredSession {
  t: string;
  e: number; // expiresAt (ms)
}

/** Bật/tắt "Lưu đăng nhập" — chuyển token giữa sessionStorage và localStorage. */
export function setRememberLogin(remember: boolean): void {
  sessionStorage.setItem(REMEMBER_LOGIN_KEY, remember ? "1" : "0");
  const token = getSessionToken();
  if (!token) return;
  if (remember) {
    localStorage.setItem(
      SESSION_TOKEN_KEY,
      JSON.stringify({
        t: token,
        e: Date.now() + SESSION_EXPIRY_DAYS * 86400_000,
      } as StoredSession),
    );
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
  } else {
    localStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  }
}

/**
 * Đọc token phiên: ưu tiên sessionStorage (không lưu đăng nhập) rồi
 * localStorage (có lưu đăng nhập — tự hết hạn sau 7 ngày).
 */
export function getSessionToken(): string {
  const fromSession = sessionStorage.getItem(SESSION_TOKEN_KEY);
  if (fromSession) return fromSession;
  const raw = localStorage.getItem(SESSION_TOKEN_KEY);
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as StoredSession;
    if (parsed && typeof parsed.t === "string" && typeof parsed.e === "number") {
      if (Date.now() > parsed.e) {
        localStorage.removeItem(SESSION_TOKEN_KEY);
        return "";
      }
      return parsed.t;
    }
  } catch {
    // dữ liệu cũ (token thô chưa có hạn) — vẫn chấp nhận.
  }
  return raw;
}

/** Lưu token theo lựa chọn "Lưu đăng nhập" của người dùng. */
export function setSessionToken(token: string): void {
  clearLegacyDiscordAccess();
  const remember = sessionStorage.getItem(REMEMBER_LOGIN_KEY) !== "0";
  if (remember) {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    localStorage.setItem(
      SESSION_TOKEN_KEY,
      JSON.stringify({
        t: token,
        e: Date.now() + SESSION_EXPIRY_DAYS * 86400_000,
      } as StoredSession),
    );
  } else {
    localStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  }
}

/** Key token OAuth cũ đã lưu nhầm trong trình duyệt sau khi chuyển sang server-side flow. */
const LEGACY_DISCORD_ACCESS_KEY = "wio_discord_access";

/** Xóa token OAuth cũ đã lưu nhầm trong trình duyệt sau khi chuyển sang server-side flow. */
export function clearLegacyDiscordAccess(): void {
  localStorage.removeItem(LEGACY_DISCORD_ACCESS_KEY);
}

/** Xóa token phiên ở cả hai nơi. */
export function clearSessionToken(): void {
  localStorage.removeItem(SESSION_TOKEN_KEY);
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
}

export const PERM_MANAGE_GUILD = 0x20n;

export function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateVerifier(): string {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function generateChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

export function randomState(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
}

/**
 * Kiểm tra Client ID có đúng dạng Discord Application ID không (snowflake: chỉ
 * gồm chữ số, 15-21 ký tự).
 *
 * VỀ SAO CẦN (bug thật 18/09): giá trị env "DISCORD_CLIENT_ID" từng bị dán nhầm
 * bằng blob mã hóa của dashboard khác (dạng base64 `{"v":"v2","c":"..."}`) —
 * web vẫn nhận được clientId “có nội dung” nên tưởng cấu hình OK, rồi nhét
 * chuỗi rác vào `client_id` của URL ủy quyền → Discord trả màn hình đỏ
 * “Invalid Form Body” NGAY TRANG DISCORD, người dùng tưởng web lỗi.
 * Chặn sớm ở client: giá trị không hợp lệ bị loại → UI hiện hướng dẫn cấu hình
 * thay vì điều hướng người dùng tới một trang lỗi của Discord.
 */
export function isValidDiscordClientId(clientId: string | undefined | null): boolean {
  return typeof clientId === "string" && /^\d{15,21}$/.test(clientId.trim());
}

/**
 * Lọc danh sách ID ứng viên → trả về giá trị snowflake hợp lệ đầu tiên, hoặc
 * rỗng nếu không có giá trị nào hợp lệ (không fallback về giá trị rác).
 */
export function pickValidClientId(...candidates: (string | undefined | null)[]): string {
  for (const c of candidates) {
    if (isValidDiscordClientId(c)) return (c as string).trim();
  }
  return "";
}

/**
 * Lọc đường dẫn chuyển hướng nội bộ an toàn (chống open redirect).
 *
 * `returnTo` đến từ query string (`/auth?returnTo=...`) do người dùng kiểm soát.
 * Chỉ kiểm `startsWith("/")` là KHÔNG đủ: `//evil.com` là URL protocol-relative
 * → trình duyệt hiểu thành `https://evil.com`, biến trang đăng nhập thành bàn
 * đạp phishing (đúng CVE-2025-68470 của react-router).
 *
 * Chỉ chấp nhận đường dẫn TUYỆT ĐỐI trong cùng origin: bắt đầu bằng đúng một
 * dấu `/`, không phải `//` hay `/\` (trình duyệt quy đổi `\` thành `/`), không
 * chứa ký tự điều khiển/backslash, và phải phân giải về ĐÚNG origin hiện tại.
 * Mọi giá trị khác → fallback `/dashboard`.
 */
export function safeRedirectPath(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (typeof raw !== "string") return fallback;
  const path = raw.trim();
  if (!path.startsWith("/")) return fallback;
  if (path.startsWith("//") || path.startsWith("/\\")) return fallback;
  if (path.includes("\\")) return fallback;
  // Bộ phân tích URL của trình duyệt BỎ tab/CR/LF nên "/\t/evil.com" thành
  // "//evil.com" (protocol-relative) dù bề ngoài chỉ có một dấu `/` đầu.
  if (/[\u0000-\u001f\u007f]/.test(path)) return fallback;
  // Chốt cuối: bất kể còn lối lách nào, kết quả phải nằm trong cùng origin.
  try {
    if (new URL(path, "https://same-origin.invalid").origin !== "https://same-origin.invalid") {
      return fallback;
    }
  } catch {
    return fallback;
  }
  return path;
}

export function redirectUri(): string {
  return `${window.location.origin}/discord/callback`;
}

export function buildAuthorizeUrl(clientId: string, state: string, challenge: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: "identify guilds",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "consent",
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

/**
 * URL OAuth KHÔNG hiện màn hình xác nhận (prompt=none): dùng khi người dùng ĐÃ
 * cấp quyền trước đó — Discord tự chuyển về /discord/callback với code ngay,
 * giúp dashboard làm mới danh sách server mà không cần đăng nhập lại.
 */
export function buildSilentAuthorizeUrl(
  clientId: string,
  state: string,
  challenge: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: "identify guilds",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "none",
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export function hasPermission(permissions: string, bit: bigint): boolean {
  return (BigInt(permissions) & bit) !== 0n;
}

export function discordAvatarUrl(
  user: { id: string; avatar?: string | null },
  size = 128,
): string | null {
  if (!user.avatar) return null;
  const ext = user.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=${size}`;
}

export function discordGuildIconUrl(
  guild: { id: string; icon?: string | null },
  size = 128,
): string | null {
  if (!guild.icon) return null;
  const ext = guild.icon.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${ext}?size=${size}`;
}

export function buildBotInviteUrl(clientId: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: "8",
    scope: "bot applications.commands",
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}
