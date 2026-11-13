/**
 * useDraft — bản nháp của MỘT ô form, đồng bộ với giá trị server mà không
 * nuốt thay đổi của người khác.
 *
 * Vì sao cần (bug thật 13/11/2026): TicketPanel dùng `defaultValue` +
 * `onBlur` so với giá trị server HIỆN TẠI. Khi admin khác (hoặc tab khác) vừa
 * lưu cùng field, ô trong tab này vẫn hiện chữ cũ; người dùng chỉ focus rồi
 * rời ô là `onBlur` thấy "khác server" → ghi lại chữ cũ → **âm thầm revert**
 * thay đổi vừa lưu. Đúng lớp lỗi im lặng mà repo này đang chặn ở tầng dữ liệu.
 *
 * Cách làm: input là CONTROLLED theo `draft`; khi giá trị server đổi (so với
 * lần cuối hook nhìn thấy), draft được nạp lại. Nhờ vậy `onBlur` chỉ ghi khi
 * người dùng thật sự sửa — không còn đường ghi đè dữ liệu mới hơn.
 *
 * Đánh đổi có chủ đích (giống WelcomePanel): nếu server đổi ĐÚNG lúc người
 * dùng đang gõ dở thì chữ đang gõ bị thay bằng giá trị mới. Chọn vậy vì mất
 * vài ký tự đang gõ nhìn thấy được, còn revert dữ liệu của người khác thì
 * không ai thấy.
 */

import { useEffect, useRef, useState } from "react";

/**
 * Giá trị kế tiếp của bản nháp (hàm THUẦN để test được).
 * - Server không đổi so với lần cuối nhìn thấy → giữ nguyên bản nháp đang gõ.
 * - Server đổi → lấy giá trị server.
 */
export function resyncDraft<T>(server: T, lastSeen: T, draft: T): T {
  return Object.is(server, lastSeen) ? draft : server;
}

/** Bản nháp controlled + tự nạp lại khi giá trị server đổi. */
export function useDraft<T>(server: T): [T, (next: T) => void] {
  const [draft, setDraft] = useState<T>(server);
  const lastSeen = useRef<T>(server);

  useEffect(() => {
    const previous = lastSeen.current;
    if (Object.is(previous, server)) return;
    lastSeen.current = server;
    setDraft((current) => resyncDraft(server, previous, current));
  }, [server]);

  return [draft, setDraft];
}

/**
 * Đọc ô số của người dùng mà KHÔNG kẹp giá trị ngay trong `onChange`.
 *
 * Vì sao: kẹp mỗi lần gõ làm hỏng số nhiều chữ số — muốn nhập "15" thì gõ `1`
 * bị kẹp thành `2`, gõ tiếp `5` thành **25**. Ở đây chỉ đọc số; việc kẹp làm
 * một lần khi blur/lưu (`clampNumber`). Ô trống giữ nguyên giá trị trước đó.
 */
export function parseNumberInput(raw: string, fallback: number): number {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : fallback;
}

/** Kẹp số nguyên vào [min, max] (dùng khi blur/lưu, không dùng khi đang gõ). */
export function clampNumber(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}
