"use strict";
/**
 * MỘT vòng `setInterval` cho MỌI việc dọn trạng thái trong tiến trình bot.
 *
 * Vì sao (đợt #4 — sau khi khảo sát 28 vòng `setInterval`):
 *  - Trước đây mỗi module tự dựng timer RIÊNG lúc require: 5 module
 *    (captchaStore, filters, interactionVerify, antinuke, altDetection) = 5
 *    timer, mỗi timer một vòng try/catch riêng — dễ sót, khó đối chiếu khi đọc
 *    lại code, và timer lúc require giữ tiến trình test sống.
 *  - Nay mỗi module CHỈ đăng ký việc dọn của mình (`registerSweep`), còn một
 *    timer duy nhất gọi `runDueSweeps` mỗi `TICK_MS`.
 *
 * Vì sao KHÔNG gộp thành một chu kỳ chung (ví dụ 5 phút cho tất cả):
 *  - antinuke tick mở khoá/reset heat/gỡ role cách ly — trễ 5 phút là trễ
 *    hành vi thật. Nên vòng lấy nhịp NHỎ NHẤT (20 giây) và mỗi việc giữ chu
 *    kỳ RIÊNG qua cổng đếm hạn: 5 phút vẫn 5 phút (+≤20 giây), 1 giờ vẫn 1
 *    giờ. Hệ quả duy nhất: số lần thức tế 217/h → 270 lần gọi hàm rẻ/giây,
 *    trong đó 4/5 vòng là no-op vì chưa tới hạn.
 *
 * Ranh giới: module này KHÔNG dựng timer khi được require — chỉ `index.js`
 * gọi `startSweeper()` sau khi client sẵn sàng. Nhờ vậy test require module
 * không bị giữ tiến trình.
 */

/** Nhịp quét cổng đếm hạn = chu kỳ NHỎ NHẤT đang đăng ký (antinuke 20 giây). */
const TICK_MS = 20_000;

/** @type {Map<string, { fn: () => unknown, everyMs: number, nextAt: number }>} */
const sweeps = new Map();

let timer = null;

/**
 * Đăng ký một việc dọn. `everyMs` là chu kỳ THẬT của việc đó (không phải nhịp
 * quét) — lượt quét sớm hơn sẽ bị bỏ qua, không phải là chạy sớm.
 */
function registerSweep(name, fn, everyMs) {
  if (typeof name !== "string" || !name) throw new Error("registerSweep: thiếu tên");
  if (typeof fn !== "function") throw new Error(`registerSweep(${name}): fn phải là hàm`);
  if (!Number.isFinite(everyMs) || everyMs <= 0) {
    throw new Error(`registerSweep(${name}): everyMs phải là số dương`);
  }
  sweeps.set(name, { fn, everyMs, nextAt: 0 });
  return name;
}

/**
 * Chạy mọi việc dọn đã tới hạn. Trả về tên các việc VỪA chạy (test dùng để
 * đo nhịp thật, không phải đo bằng mắt).
 *
 * Lỗi của một việc KHÔNG được nuốt im lặng và không được chặn việc khác: mỗi
 * việc bọc try/catch riêng, lỗi in `[sweeper:<tên>]`. Lý do: dọn RAM ném đồng
 * bộ trong timer đi thẳng tới uncaughtException → exit(1) (đã ghi ở antinuke).
 */
function runDueSweeps(now = Date.now()) {
  const ran = [];
  for (const [name, entry] of sweeps) {
    if (now < entry.nextAt) continue;
    entry.nextAt = now + entry.everyMs;
    try {
      entry.fn();
      ran.push(name);
    } catch (e) {
      console.error(`[sweeper:${name}]`, e?.message || e);
    }
  }
  return ran;
}

/** Gắn vòng quét. Idempotent — gọi nhiều lần vẫn chỉ một timer. */
function startSweeper() {
  if (timer) return timer;
  timer = setInterval(() => {
    runDueSweeps();
  }, TICK_MS);
  // Không giữ tiến trình bot sống chỉ vì vòng dọn (bot đã có mạng + interval
  // của chính nó; giữ thêm là chặn shutdown sạch khi không còn việc gì).
  timer.unref?.();
  return timer;
}

/** Dừng vòng quét (test + dọn tài nguyên). */
function stopSweeper() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Trạng thái để test/điều tra: tên + chu kỳ + lần chạy kế tiếp. */
function sweeperState() {
  return [...sweeps.entries()].map(([name, e]) => ({
    name,
    everyMs: e.everyMs,
    nextAt: e.nextAt,
  }));
}

/** Test: xoá sạch đăng ký giữa các case. */
function resetSweeper() {
  stopSweeper();
  sweeps.clear();
}

module.exports = {
  TICK_MS,
  registerSweep,
  runDueSweeps,
  startSweeper,
  stopSweeper,
  sweeperState,
  resetSweeper,
};
