/**
 * staleChunk.ts — tự tải lại trang khi chunk JS đã bị xoá sau một lần deploy.
 *
 * Bối cảnh: file build có hash (`/assets/GuildPage-abc123.js`) và mỗi lần deploy
 * file cũ biến mất. Tab đang mở từ bản trước mà bấm sang route/panel CHƯA tải sẽ
 * gặp "Failed to fetch dynamically imported module" — người dùng thấy màn lỗi
 * dù chỉ cần F5. Vite bắn `vite:preloadError` đúng cho trường hợp này.
 *
 * Chống vòng lặp: chỉ tải lại nếu lần tải lại trước đó cách đây ≥ COOLDOWN_MS
 * (mốc lưu ở sessionStorage). Vừa tải lại mà vẫn lỗi (mạng hỏng, sự cố thật) thì
 * để lỗi nổi lên cho error boundary thay vì nhấp nháy mãi.
 */
const RELOAD_STAMP_KEY = "protogon-chunk-reload-at";
export const CHUNK_RELOAD_COOLDOWN_MS = 10_000;

interface StaleChunkDeps {
  target?: EventTarget;
  storage?: Pick<Storage, "getItem" | "setItem">;
  now?: () => number;
  reload?: () => void;
}

/** Gắn bộ lắng nghe; trả hàm gỡ. Tham số chỉ để test thay thế. */
export function installStaleChunkRecovery(deps: StaleChunkDeps = {}): () => void {
  const target = deps.target ?? window;
  const now = deps.now ?? Date.now;
  const reload = deps.reload ?? (() => window.location.reload());

  const handler = (event: Event) => {
    let storage = deps.storage;
    try {
      storage ??= sessionStorage;
      const last = Number(storage.getItem(RELOAD_STAMP_KEY) ?? 0);
      if (now() - last < CHUNK_RELOAD_COOLDOWN_MS) return; // vừa tải lại mà vẫn lỗi
      storage.setItem(RELOAD_STAMP_KEY, String(now()));
    } catch {
      // sessionStorage bị chặn → không có cách chống vòng lặp → KHÔNG tải lại.
      return;
    }
    // Chặn lỗi gốc để không nháy màn lỗi trong lúc trang đang tải lại.
    event.preventDefault();
    reload();
  };

  target.addEventListener("vite:preloadError", handler);
  return () => target.removeEventListener("vite:preloadError", handler);
}
