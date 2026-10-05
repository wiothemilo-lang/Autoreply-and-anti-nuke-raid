/**
 * Mã khôi phục (restore key) — capability của RIÊNG một bản backup.
 *
 * Vì sao cần (bug thật): `requestRestore`/`requestRestorePlan` trước đây bắt
 * người khôi phục phải còn là người quản lý SERVER GỐC đã tạo backup. Nhưng
 * chính tình huống cần khôi phục là khi bạn ĐÃ MẤT server đó — bị nuke mất
 * role, bị kick, hoặc xoá server chết rồi dựng server mới. Đúng lúc đó
 * `listMine` không liệt kê bản backup nữa (không còn quyền server gốc) và
 * `requestRestore` trả về "Bạn không có quyền với server gốc của backup này" —
 * tức backup bị BỎ RƠI đúng lúc cần nhất.
 *
 * Mã khôi phục thay cho id nội bộ của Convex:
 *  - 130 bit ngẫu nhiên (Convex `crypto.getRandomValues`) → không đoán được,
 *    không cần giấu id server.
 *  - Tra cứu theo INDEX `by_restoreKey` → O(1), không quét bảng.
 *  - `lookupBackup` KHÔNG trả về `guildId`: biết mã không làm lộ id server
 *    gốc (id server là thứ không nên phát tán).
 *  - Chủ server xoay được: xoá bản backup cũ là mã cũ chết luôn.
 */

/**
 * Bảng chữ cái CỐ Ý bỏ 0/O và 1/I/L — người gõ tay không nhầm, và mã sai chỉ
 * bị từ chối chứ không âm thầm khớp vào một mã khác.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 32 ký tự = 5 bit/ký tự
/**
 * 25 ký tự × 5 bit = 125 bit entropy — vượt xa ngưỡng đoán mò (2^125), và
 * CHIA ĐỀU 5 nhóm × 5 ký tự nên người gõ tay không bị lệch nhóm.
 */
const KEY_LENGTH = 25;
/** Nhóm 5 ký tự, ngăn cách bằng dấu gạch nối. */
const GROUP = 5;

/** Chỉ cần `getRandomValues` — không phụ thuộc tên kiểu nào của runtime/DOM lib. */
type RandomSource = { getRandomValues?: (a: Uint8Array) => Uint8Array };

function requireCrypto(): RandomSource {
  const c = (globalThis as { crypto?: RandomSource }).crypto;
  if (!c?.getRandomValues) {
    throw new Error("Runtime không hỗ trợ crypto.getRandomValues — không sinh được mã khôi phục");
  }
  return c;
}

/** Sinh mã khôi phục mới ở dạng chuẩn `XXXXX-XXXXX-XXXXX-XXXXX-XXXXX`. */
export function generateRestoreKey(): string {
  const c = requireCrypto();
  // GỌI THẲNG TRÊN OBJECT chứ không tách method ra biến: `getRandomValues` là
  // method của `Crypto` và runtime (Bun/Convex) kiểm tra `this` → gọi rời
  // ("const g = c.getRandomValues; g(...)") ném ERR_INVALID_THIS. Đã dính lỗi
  // này và test bắt được ngay.
  // Lấy dư thừa rồi cắt byte — 32 mỗi ký tự đều chạm ranh giới byte, không lệch pha.
  const bytes = c.getRandomValues!(new Uint8Array(KEY_LENGTH));
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return formatRestoreKey(out);
}

/** Ghép chuỗi 26 ký tự thô thành dạng nhóm 5 cho dễ đọc/gõ. */
export function formatRestoreKey(raw: string): string {
  const groups: string[] = [];
  for (let i = 0; i < raw.length; i += GROUP) groups.push(raw.slice(i, i + GROUP));
  return groups.join("-");
}

/**
 * Chuẩn hoá mã người dùng dán: bỏ khoảng trắng/gạch nối, đưa về HOA, kiểm tra
 * đúng bảng chữ + đúng độ dài. Trả `null` khi không hợp lệ — SAU ĐÓ KHÔNG được
 * so khớp "gần đúng": một mã sai phải bị từ chối chứ không được map sang một
 * bản backup khác.
 */
export function normalizeRestoreKey(input: string | undefined | null): string | null {
  const stripped = String(input ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (stripped.length !== KEY_LENGTH) return null;
  for (const ch of stripped) if (!ALPHABET.includes(ch)) return null;
  return formatRestoreKey(stripped);
}

/**
 * Tra cứu bản backup theo mã khôi phục — O(1) nhờ index `by_restoreKey`.
 * Trả `null` khi mã không khớp bản nào.
 *
 * `ctx` là QueryCtx/MutationCtx của Convex: helper này cố tình KHÔNG gắn kiểu
 * để dùng được cả 2 (và cả ctx giả trong test), nên kiểu trả về phải tự mô tả.
 */
export type BackupRowByRestoreKey = {
  _id: string;
  guildId: string;
  guildName: string;
  restoreKey?: string;
  roleCount: number;
  channelCount: number;
  emojiCount?: number;
  stickerCount?: number;
  messageCount?: number;
  source?: string;
  pushedToGithub: boolean;
  githubUrl?: string;
  createdAt: number;
};

export async function findBackupByRestoreKey(
  ctx: { db: { query: (table: any) => any } },
  key: string,
): Promise<BackupRowByRestoreKey | null> {
  const normalized = normalizeRestoreKey(key);
  if (!normalized) return null;
  return (await ctx.db
    .query("guildBackups")
    .withIndex("by_restoreKey", (q: any) => q.eq("restoreKey", normalized))
    .first()) as BackupRowByRestoreKey | null;
}
