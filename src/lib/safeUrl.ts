/**
 * Allowlist URL cho các chỗ mở link từ dữ liệu server trả về.
 *
 * Vì sao cần: `href={githubUrl}` nhận giá trị từ API bên ngoài. Nếu response bị
 * đổi thành `javascript:...` (MITM, lỗi cấu hình, hoặc bug phía đối tác) thì
 * click là chạy script trong origin dashboard — đúng lỗ hổng XSS qua scheme.
 * Chỉ nhận HTTPS + đúng host.
 */

const GITHUB_HOSTS = new Set(["gist.github.com", "github.com", "www.github.com"]);

function parseHttps(raw: string | null | undefined): URL | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

/** URL Gist/GitHub hợp lệ (https + host allowlist), ngược lại null. */
export function safeGithubUrl(raw: string | null | undefined): string | null {
  const url = parseHttps(raw);
  if (!url || !GITHUB_HOSTS.has(url.hostname.toLowerCase())) return null;
  return url.toString();
}
