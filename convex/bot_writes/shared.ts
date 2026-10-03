/**
 * Đợt #5 tách `convex/bot_writes.ts` (75KB, 41 function) — helper dùng CHUNG
 * giữa các module con.
 *
 * - Nhóm retention: `convex/bot_writes/antinuke.ts`, `convex/bot_writes/modActions.ts`
 *   và `convex/altDetection.ts` (bảng join của alt detection) dùng chung.
 * - Nhóm claim backup/restore: `backup.ts` + `restore.ts` dùng chung để fencing
 *   (chống 2 worker cùng chạy một job).
 *
 * Chỉ tách file, KHÔNG đổi hành vi: nội dung hàm giữ nguyên từng dòng so với
 * bản trước khi tách.
 */

export const BACKUP_CLAIM_TTL_MS = 600_000;

/**
 * Giữ các bảng log theo trần số dòng mỗi server (800 sự kiện / 100 case / 500
 * lượt join). Dọn theo XÁC SUẤT và theo LÔ: mỗi lượt ghi có 1/TRIM_ODDS khả năng
 * đọc (cap + TRIM_BATCH) dòng mới nhất rồi xoá phần vượt trần (tối đa TRIM_BATCH
 * dòng cũ nhất).
 *
 * Bản cũ cổng theo `Date.now() % 240_000 < 2000` (~0,8% lượt ghi) và mỗi lần chỉ
 * xoá tối đa 1 dòng → ~99% dòng ghi vào sống mãi, bảng phình vô hạn (không có
 * cron nào dọn thay). Nay xoá TRIM_BATCH dòng mỗi 1/TRIM_ODDS lượt ghi (2,5
 * dòng/lượt ≥ 1 dòng ghi vào) nên bảng hội tụ về trần cộng tối đa ~TRIM_ODDS
 * dòng, kể cả khi còn tồn đọng từ bản cũ (mỗi lần dọn 100 dòng).
 */
export const TRIM_ODDS = 40;
export const TRIM_BATCH = 100;

export function shouldTrim(): boolean {
  return Math.random() * TRIM_ODDS < 1;
}

/** Xoá các dòng vượt `cap` trong danh sách đã sắp MỚI NHẤT TRƯỚC; trả về số dòng đã xoá. */
export async function dropBeyondCap(
  ctx: { db: { delete: (id: any) => Promise<unknown> } },
  newestFirst: { _id: unknown }[],
  cap: number,
): Promise<number> {
  const extra = newestFirst.slice(cap);
  for (const row of extra) await ctx.db.delete(row._id);
  return extra.length;
}

export function claimIsActive(claimedAt: number | undefined, leaseUntil?: number): boolean {
  if (claimedAt === undefined) return false;
  return leaseUntil !== undefined
    ? leaseUntil > Date.now()
    : Date.now() - claimedAt < BACKUP_CLAIM_TTL_MS;
}

export function claimMatches(
  guild: {
    backupClaimedAt?: number;
    backupLeaseUntil?: number;
    restoreClaimedAt?: number;
    restoreLeaseUntil?: number;
  },
  kind: "backup" | "restore" | "import" | "plan",
  claimAt: number | undefined,
): boolean {
  if (claimAt === undefined) return true; // tương thích client cũ trong lúc rollout
  const current = kind === "backup" ? guild.backupClaimedAt : guild.restoreClaimedAt;
  const leaseUntil = kind === "backup" ? guild.backupLeaseUntil : guild.restoreLeaseUntil;
  return current === claimAt && claimIsActive(current, leaseUntil);
}
