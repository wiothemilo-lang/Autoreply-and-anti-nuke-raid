/**
 * metricsRuntime.js — bật đo lường thật trong tiến trình bot.
 *
 * Tách khỏi `metrics.js` (thư viện thuần) để: (1) `index.js` chỉ gọi MỘT
 * hàm thay vì dựng ba vòng setInterval; (2) test được phần lắp ráp mà không
 * cần đăng nhập Discord.
 *
 * Ba việc, cùng một nguồn số liệu:
 *   1. Đo RAM + số server/thành viên vào gauge (mỗi 60s).
 *   2. In bản `/metrics` (định dạng Prometheus) ra stdout theo chu kỳ để
 *      pm2/grafagent/node_exporter gom được — không mở cổng HTTP mới trên VPS.
 *   3. Đẩy snapshot lên Convex để dashboard web đọc.
 *
 * Tắt: `METRICS=0`. Khoảng cách đổi qua `METRICS_STDOUT_INTERVAL_MS` và
 * `METRICS_PUSH_INTERVAL_MS`.
 */
const metrics = require("./metrics");

const DEFAULT_SAMPLE_MS = 60_000;
// 5 phút: đủ để vẽ xu hướng mà không làm ngập pm2 logs. Mặc định 60s sẽ sinh
// ~1400 lần/ngày — rò log chứ không phải quan sát.
const DEFAULT_STDOUT_MS = 5 * 60_000;
const DEFAULT_PUSH_MS = 5 * 60_000;

function envMs(name, fallback) {
  try {
    const n = Number(process.env[name]);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Bật đo lường. Trả hàm dừng (an toàn kể cả khi đã tắt).
 *
 * `store` là ConvexStore; nếu không có thì chỉ chạy phần stdout — bot vẫn đo
 * được, chỉ không đẩy lên dashboard.
 */
function startMetrics({ client, store } = {}) {
  // Tắt hoàn toàn bằng biến môi trường — cần khi bot chạy ở chế độ thử.
  if (String(process.env.METRICS ?? "") === "0") return () => {};

  metrics.startDefaultMetrics();

  const timers = [];
  // Hàm DỪNG (không phải id timer) — `clearInterval` trên một hàm là NO-OP, nên
  // nhầm hai loại này làm vòng đẩy sống mãi sau khi gọi stop(): bot đã thoát
  // mà vẫn cứ ghi vào Convex. Đây là lý do hai mảng tách biệt.
  const stoppers = [];

  // 1) Gauge vùng nhớ + quy mô server. Chỉ đọc cache trong RAM, không gọi mạng.
  const sample = () => {
    try {
      metrics.sampleMemory();
    } catch {
      // never throw
    }
    // Mỗi gauge một khối try riêng: một cái hỏng không được kéo theo các cái
    // còn lại (trước đây `reduce` ném vì cache là Map thay vì Collection →
    // `members` và `uptime` im lặng biến mất mà không ai biết).
    try {
      if (client?.guilds?.cache) {
        metrics.setGauge("guilds", client.guilds.cache.size, "Số server bot đang ở trong");
      }
    } catch {
      // never throw
    }
    try {
      // Duyệt `.values()` thay vì `.reduce()`: Collection của discord.js có
      // reduce, Map thì không — viết theo cách chạy được với cả hai.
      let members = 0;
      if (client?.guilds?.cache) {
        for (const g of client.guilds.cache.values()) members += g?.memberCount ?? 0;
      }
      metrics.setGauge("members", members, "Tổng số thành viên bot nhìn thấy");
    } catch {
      // never throw
    }
    try {
      if (process.uptime) metrics.setGauge("uptime_seconds", Math.floor(process.uptime()));
    } catch {
      // never throw
    }
  };
  sample();
  timers.push(setInterval(sample, envMs("METRICS_SAMPLE_INTERVAL_MS", DEFAULT_SAMPLE_MS)));

  // 2) In `/metrics` ra stdout.
  const stdoutMs = envMs("METRICS_STDOUT_INTERVAL_MS", DEFAULT_STDOUT_MS);
  let printing = false;
  timers.push(
    setInterval(() => {
      // Không cho hai lần in chồng nhau: `render()` là async, lần trước còn
      // đang chờ Prometheus thì lần sau bắt đầu sẽ nhân bản log.
      if (printing) return;
      printing = true;
      void metrics
        .render()
        .then((text) => {
          if (text)
            console.log(
              `\n[metrics] ===== /metrics (mỗi ${Math.round(stdoutMs / 1000)}s) =====\n${text}`,
            );
        })
        .catch(() => {})
        .finally(() => {
          printing = false;
        });
    }, stdoutMs),
  );

  // 3) Đẩy lên Convex cho dashboard. Không có store (test) → bỏ qua, không lỗi.
  if (store && typeof store.recordMetrics === "function") {
    stoppers.push(
      metrics.startFlush(envMs("METRICS_PUSH_INTERVAL_MS", DEFAULT_PUSH_MS), (snapshot) =>
        store.recordMetrics(snapshot),
      ),
    );
  }

  for (const t of timers) t.unref?.();

  return () => {
    for (const t of timers) clearInterval(t);
    for (const stop of stoppers) stop();
    // Đẩy nốt mẫu cuối: bot chết giữa chừng thì dashboard không mất hẳn số liệu.
    if (store && typeof store.recordMetrics === "function") {
      void metrics.flushNow((snap) => store.recordMetrics(snap));
    }
  };
}

module.exports = { startMetrics };
