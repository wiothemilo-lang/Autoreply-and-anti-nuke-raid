/**
 * backupWatch — theo dõi kết quả một việc dài mà BOT thực hiện trong vòng quét
 * (backup, khôi phục, khôi phục từ file): khi nào được phép kết luận "xong" /
 * "lỗi", và khi nào phải tiếp tục chờ.
 *
 * Vì sao cần (bug thật): dashboard bấm → gọi mutation → `setWatch({ startedAt })`.
 * Nhưng trạng thái Convex trong React còn là bản CŨ của lượt TRƯỚC — kết quả
 * mutation về trước, kết quả query tới sau một nhịp. Đọc thẳng bản cũ đó nghĩa
 * là: vừa bấm "Khôi phục" đã hiện toast "Bot đã khôi phục xong" (vì bản cũ có
 * `restoreRequested: false`), và lượt theo dõi bị khoá luôn ⇒ lỗi thật (bot thiếu
 * quyền, backup hỏng…) KHÔNG BAO GIỜ hiện ra. Với "Backup ngay" thì ngược lại:
 * lượt theo dõi bị tiêu huỷ sớm nên không có toast kết quả nào.
 *
 * LUẬT: chỉ kết luận khi có BẰNG CHỨNG của CHÍNH lượt này —
 *  1. lỗi có mốc thời gian MỚI HƠN lúc bấm;
 *  2. luồng CÓ mốc "xong" (backup/restore): mốc "xong" MỚI HƠN lúc bấm;
 *  3. luồng KHÔNG có mốc "xong" (import — server chỉ xoá cờ yêu cầu): đã TỪNG
 *     thấy cờ yêu cầu bật lên rồi mới tắt.
 * Số liệu cũ không thoả luật nào ⇒ vẫn CHỜ (giữ nguyên lượt theo dõi).
 *
 * Hàm thuần để test khoá đúng biên thời gian mà không cần trình duyệt.
 */

export type JobWatch = {
  /** Thời điểm bấm (ms) — mọi mốc cũ hơn đều thuộc lượt trước. */
  startedAt: number;
  /** Đã từng thấy cờ "bot đang có việc này" bật lên chưa (xem luật 3). */
  sawPending?: boolean;
};

export type JobStatus = {
  /** Cờ bot đang có việc: backupRequested / restoreRequested / importRestoreRequested. */
  requested: boolean;
  /** Thông báo lỗi bot ghi lại (null/undefined = không có lỗi). */
  error?: string | null;
  /** Mốc lỗi được ghi (dùng để loại lỗi của lượt trước). */
  errorAt?: number | null;
  /** Mốc bot báo "đã xong" — chỉ dùng khi `hasFinishMarker`. */
  finishedAt?: number | null;
};

export type JobVerdict =
  { outcome: "waiting"; watch: JobWatch } | { outcome: "error" } | { outcome: "done" };

export function judgeJobWatch(
  watch: JobWatch,
  status: JobStatus,
  /** Luồng này có mốc "xong" do server ghi không (backup/restore: CÓ; import: KHÔNG). */
  opts: { hasFinishMarker: boolean },
): JobVerdict {
  // 1. Lỗi của lượt TRƯỚC vẫn nằm trong trạng thái cũ → không được báo oan.
  if (status.error && (status.errorAt ?? 0) > watch.startedAt) return { outcome: "error" };

  if (status.requested) {
    // Đang chạy: ghi nhớ đã thấy cờ bật (luật 3) rồi tiếp tục chờ. Chỉ tạo object
    // mới khi trạng thái thật sự đổi để không gây vòng render vô hạn.
    return {
      outcome: "waiting",
      watch: watch.sawPending ? watch : { ...watch, sawPending: true },
    };
  }

  if (opts.hasFinishMarker) {
    // 2. Chỉ mốc MỚI HƠN lúc bấm mới là kết quả của lượt này. Mốc cũ (hoặc chưa có)
    // = trạng thái tới chậm một nhịp → còn chờ, KHÔNG kết luận.
    return typeof status.finishedAt === "number" && status.finishedAt > watch.startedAt
      ? { outcome: "done" }
      : { outcome: "waiting", watch };
  }

  // 3. Import: không có mốc "xong". Biết chắc đã xong chỉ khi cờ yêu cầu từng bật.
  return watch.sawPending ? { outcome: "done" } : { outcome: "waiting", watch };
}
