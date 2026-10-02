/**
 * metrics.js — đo lường toàn hệ thống bot (prom-client).
 *
 * Vì sao có: trước đây bot KHÔNG có số đo nào — `rg "prom-client|metrics"
 * bot/src/` không ra hit nào. Khi `test-browser-contracts` treo trong CI, log
 * chỉ biết "đang treo ở đâu" sau khi tải log về đọc tay; khi hạt nhiệt AI
 * tăng, không ai biết module nào đắt; khi database chậm, không ai biết lệnh
 * nào chậm. Không đo thì mọi lần chẩn đoán đều bắt đầu bằng "đoán xem".
 *
 * Nguyên tắc thiết kế (nhất quán với actionBudget/memGuard — module đo KHÔNG
 * được phép làm hỏng thứ nó đang đo):
 *  - **Never throw**: mọi lời gọi bọc try/catch. Đo lỗi rồi chết cùng request
 *    là tự tạo sự cố mới.
 *  - **Không phụ thuộc discord.js / Convex** → test hermetic, không cần môi
 *    trường thật.
 *  - **Hẹn, có tên**: chỉ những gì cần cảnh báo. Metric không ai đọc chỉ làm
 *    chậm và tốn RAM.
 *
 * Vì sao KHÔNG parse `getMetricsAsJSON()` mà tự tích luỹ: prom-client trả
 * histogram theo TỪNG BUCKET (mỗi bucket một dòng JSON, mỗi dòng có `value`
 * chứ không có `count`/`sum`), và counter đặt nhãn ở tầng MetricObject chứ
 * không phải ở từng value. Đọc sai chỗ đó cho ra snapshot RỖNG mà không báo
 * lỗi — kiểu hỏng nguy hiểm nhất. Vì vậy:
 *   - prom-client lo phần ĐẦU RA `/metrics` (text chuẩn cho Prometheus);
 *   - `agg` bên dưới lo phần SỐ ĐẨU LÊN CONVEX (đếm tích luỹ của chính ta).
 *
 * Nơi lưu (song song, theo chủ đích):
 *  1. `render()` ra stdout theo chu kỳ → pm2/node_exporter gom được.
 *  2. `snapshot()` đẩy lên Convex → dashboard web đọc.
 */
const client = require("prom-client");

/** Registry riêng cho bot — không dùng registry global của prom-client để
 *  tránh trùng đăng ký khi test nạp lại module trong cùng tiến trình. */
const registry = new client.Registry();

/** Biên label: tên subsystem/op đến từ hằng số trong code nên lẫm nhẹ, nhưng
 *  caller có thể truyền chuỗi bất kỳ. Bỏ qua cách dựng label động chuỗi hợp lệ
 *  (`{id}`), chỉ cắt bớt độ dài + ký tự lạ để không phá định dạng Prometheus. */
const MAX_LABEL_LEN = 64;
function label(v) {
  if (v === undefined || v === null) return "unknown";
  return String(v)
    .slice(0, MAX_LABEL_LEN)
    .replace(/[^a-zA-Z0-9_:./-]/g, "_");
}

/**
 * Trần số cặp nhãn giữ trong RAM. Không có trần này thì một caller truyền nhãn
 * động (vd tên hàm sinh từ nội dung tin nhắn) sẽ phình bảng bất tận — đúng
 * cái loại rò bộ nhớ mà metrics không được phép gây ra. Vượt trần thì bỏ qua
 * (mất số đo chứ không chết tiến trình) và ghi cảnh báo một lần.
 */
const MAX_AGG_KEYS = 500;
const OVERFLOW_WARNED = { done: false };
const agg = {
  operations: new Map(),
  durations: new Map(),
  gauges: new Map(),
  aiTokens: new Map(),
  aiCost: new Map(),
  aiCalls: new Map(),
};

function bump(map, key, by = 1) {
  if (!map.has(key)) {
    if (map.size >= MAX_AGG_KEYS) {
      if (!OVERFLOW_WARNED.done) {
        OVERFLOW_WARNED.done = true;
        console.warn(`[metrics] vượt trần ${MAX_AGG_KEYS} cặp nhãn — bỏ qua số đo mới`);
      }
      return;
    }
    map.set(key, 0);
  }
  map.set(key, map.get(key) + by);
}

/** Kết quả của một lần đo: ok hay lỗi. Dùng chuỗi để Prometheus đọc được. */
const OUTCOME_OK = "ok";
const OUTCOME_ERROR = "error";

/** Ngân sách ngay cả khi lỗi hệ thống: phải có độ trễ ghi được. */
const DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30];

const operationsTotal = new client.Counter({
  name: "bot_operations_total",
  help: "Số lần bot thực hiện một thao tác (gọi Convex, gọi AI, hình phạt, tick…)",
  labelNames: ["subsystem", "op", "outcome"],
  registers: [registry],
});

const operationDuration = new client.Histogram({
  name: "bot_operation_duration_seconds",
  help: "Thời gian một thao tác của bot (giây)",
  labelNames: ["subsystem", "op"],
  buckets: DURATION_BUCKETS,
  registers: [registry],
});

/** Gauge động: tên → Gauge. Chỉ tạo khi được set lần đầu (tránh metric rác). */
const gauges = new Map();

/** Cổng đo token/chi phí AI — dùng từ #2, khai báo sẵn ở đây để #2 không
 *  phải sửa lại registry (thêm metric giữa chừng làm số liệu cũ đứt đoạn). */
const aiTokensTotal = new client.Counter({
  name: "bot_ai_tokens_total",
  help: "Số token AI đã dùng (prompt=đi vào, completion=ra)",
  labelNames: ["provider", "direction"],
  registers: [registry],
});

const aiCostTotal = new client.Counter({
  name: "bot_ai_cost_usd_total",
  help: "Chi phí AI ước tính (USD) theo provider",
  labelNames: ["provider"],
  registers: [registry],
});

const aiDuration = new client.Histogram({
  name: "bot_ai_duration_seconds",
  help: "Thời gian chờ một provider AI trả lời (giây)",
  labelNames: ["provider", "outcome"],
  buckets: DURATION_BUCKETS,
  registers: [registry],
});

/**
 * Ghi nhận một thao tác đã xong.
 * `outcome` mặc định "ok" — chỉ truyền "error" khi thao tác thật sự thất bại.
 */
function count(subsystem, op, outcome = OUTCOME_OK) {
  try {
    const l = { subsystem: label(subsystem), op: label(op), outcome: label(outcome) };
    operationsTotal.inc(l);
    bump(agg.operations, `${l.subsystem}|${l.op}|${l.outcome}`, 1);
  } catch {
    // never throw — đo lỗi không được phép tạo lỗi
  }
}

/** Ghi độ trễ của một thao tác (giây). */
function observeDuration(subsystem, op, seconds) {
  try {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    const l = { subsystem: label(subsystem), op: label(op) };
    operationDuration.observe(l, seconds);
    const key = `${l.subsystem}|${l.op}`;
    const prev = agg.durations.get(key) ?? { count: 0, sumSec: 0 };
    prev.count += 1;
    prev.sumSec += seconds;
    if (agg.durations.size >= MAX_AGG_KEYS && !agg.durations.has(key)) {
      bump(agg.operations, "|__overflow__", 1);
      return;
    }
    agg.durations.set(key, prev);
  } catch {
    // never throw
  }
}

/**
 * Bọc một thao tác bất đồng bộ để tự đếm + đo thời gian.
 *
 * Cố ý KHÔNG nuốt lỗi: `fn` ném gì thì `timeAsync` ném lại đúng cái đó, chỉ
 * ghi thêm outcome="error" trước khi ném. Nuốt lỗi ở đây là cách nhanh nhất
 * để biến một module hỏng thành module im lặng.
 *
 *   await timeAsync("convex", "botSyncGuilds", () => store.botSyncGuilds(ids));
 */
async function timeAsync(subsystem, op, fn) {
  const started = process.hrtime.bigint();
  try {
    const out = await fn();
    count(subsystem, op, OUTCOME_OK);
    return out;
  } catch (err) {
    count(subsystem, op, OUTCOME_ERROR);
    throw err;
  } finally {
    const seconds = Number(process.hrtime.bigint() - started) / 1e9;
    observeDuration(subsystem, op, seconds);
  }
}

/**
 * Đặt một gauge động (ví dụ số guild, RSS). Tạo metric ở lần đầu.
 * Gauge là giá trị TẠI THỜI ĐIỂM — khác counter là tích luỹ từ đầu tiến trình.
 */
function setGauge(name, value, help) {
  try {
    const key = label(name);
    if (!Number.isFinite(value)) return;
    agg.gauges.set(key, value);
    let g = gauges.get(key);
    if (!g) {
      g = new client.Gauge({
        name: key.startsWith("bot_") ? key : `bot_${key}`,
        help: help || `Giá trị hiện tại của ${key}`,
        registers: [registry],
      });
      gauges.set(key, g);
    }
    g.set(value);
  } catch {
    // never throw
  }
}

/** Ghi token + chi phí + độ trễ của một lượt gọi AI (dùng cho #2). */
function observeAiCall(
  provider,
  { durationSeconds, promptTokens, completionTokens, costUsd } = {},
) {
  const p = label(provider);
  try {
    if (Number.isFinite(promptTokens)) {
      aiTokensTotal.inc({ provider: p, direction: "prompt" }, promptTokens);
      bump(agg.aiTokens, `${p}|prompt`, promptTokens);
    }
    if (Number.isFinite(completionTokens)) {
      aiTokensTotal.inc({ provider: p, direction: "completion" }, completionTokens);
      bump(agg.aiTokens, `${p}|completion`, completionTokens);
    }
    if (Number.isFinite(costUsd) && costUsd > 0) {
      aiCostTotal.inc({ provider: p }, costUsd);
      bump(agg.aiCost, p, costUsd);
    }
    if (Number.isFinite(durationSeconds) && durationSeconds >= 0) {
      aiDuration.observe({ provider: p, outcome: OUTCOME_OK }, durationSeconds);
      bump(agg.aiCalls, `${p}|${OUTCOME_OK}`, 1);
    }
  } catch {
    // never throw
  }
}

/** Ghi một lượt gọi AI thất bại (chỉ đếm lượt + độ trễ, không có token vì không có kết quả). */
function observeAiFailure(provider, durationSeconds) {
  const p = label(provider);
  try {
    if (Number.isFinite(durationSeconds) && durationSeconds >= 0) {
      aiDuration.observe({ provider: p, outcome: OUTCOME_ERROR }, durationSeconds);
    }
    bump(agg.aiCalls, `${p}|${OUTCOME_ERROR}`, 1);
  } catch {
    // never throw
  }
}

/**
 * Metric mặc định của Node (heap, event-loop lag, GC…).
 *
 * Cố ý KHÔNG bật ở cấp module: `collectDefaultMetrics` đăng ký hook đo, giữ
 * tiến trình sống và làm test khó đoán. Chỉ bật trong `index.js` khi tiến
 * trình thật đã login.
 */
let defaultMetricsStarted = false;
function startDefaultMetrics() {
  if (defaultMetricsStarted) return true;
  try {
    client.collectDefaultMetrics({ register: registry });
    defaultMetricsStarted = true;
    return true;
  } catch {
    return false;
  }
}

/** Đo vùng nhớ bot — nguồn rò RAM đã từng làm bot chết trên VPS. */
function sampleMemory() {
  try {
    const mem = process.memoryUsage();
    setGauge("memory_rss_bytes", mem.rss, "RAM thực dụng của tiến trình bot (byte)");
    setGauge("memory_heap_used_bytes", mem.heapUsed, "Heap đang dùng của tiến trình bot (byte)");
  } catch {
    // never throw
  }
}

/**
 * Bản số liệu phẳng để đẩy lên Convex — chỉ số của bot, đã gộp sẵn.
 *
 * Cố ý trả về ĐỒNG BỘ và không cần await: đẩy số liệu là việc thừa chạy nền,
 * không được làm caller (vòng tick, xử lý interaction) chờ. `render()` mới là
 * async vì prom-client bắt buộc vậy.
 */
function snapshot() {
  const counters = {};
  const gaugesOut = {};
  const histograms = {};
  try {
    for (const [key, value] of agg.operations) {
      const [subsystem, op, outcome] = key.split("|");
      counters[
        `bot_operations_total{subsystem=${JSON.stringify(subsystem)},op=${JSON.stringify(op)},outcome=${JSON.stringify(outcome)}}`
      ] = value;
    }
    for (const [key, value] of agg.gauges) {
      gaugesOut[key.startsWith("bot_") ? key : `bot_${key}`] = value;
    }
    for (const [key, v] of agg.durations) {
      const [subsystem, op] = key.split("|");
      const labels = `subsystem=${JSON.stringify(subsystem)},op=${JSON.stringify(op)}`;
      histograms[`bot_operation_duration_seconds_count{${labels}}`] = v.count;
      histograms[`bot_operation_duration_seconds_sum{${labels}}`] =
        Math.round(v.sumSec * 1000) / 1000;
    }
    for (const [key, value] of agg.aiTokens) {
      const [provider, direction] = key.split("|");
      counters[
        `bot_ai_tokens_total{provider=${JSON.stringify(provider)},direction=${JSON.stringify(direction)}}`
      ] = value;
    }
    for (const [provider, value] of agg.aiCost) {
      counters[`bot_ai_cost_usd_total{provider=${JSON.stringify(provider)}}`] =
        Math.round(value * 1e6) / 1e6;
    }
    for (const [key, value] of agg.aiCalls) {
      const [provider, outcome] = key.split("|");
      counters[
        `bot_ai_calls_total{provider=${JSON.stringify(provider)},outcome=${JSON.stringify(outcome)}}`
      ] = value;
    }
    return { at: Date.now(), counters, gauges: gaugesOut, histograms };
  } catch {
    return { at: Date.now(), counters: {}, gauges: {}, histograms: {} };
  }
}

/** Bản số liệu ở định dạng Prometheus để in ra stdout. */
async function render() {
  try {
    return await registry.metrics();
  } catch {
    return "";
  }
}

/**
 * Vòng đẩy số liệu định kỳ.
 *
 * `push` được TIÊM vào tham số (không import Convex ở đây) để module này test
 * được không cần mạng, và để `index.js` quyết định nơi gửi.
 *
 * Trả về hàm dừng. Interval CÓ unref: nó chỉ là việc thừa, không được giữ tiến
 * trình bot sống thêm một nhịp khi đang tắt (đúng quy ước của các vòng unref
 * sẵn có trong bot).
 */
function startFlush(intervalMs, push) {
  const ms = Number(intervalMs) || 300_000;
  const timer = setInterval(() => {
    void flushNow(push);
  }, ms);
  timer.unref?.();
  return () => clearInterval(timer);
}

/** Đẩy ngay một lần (dùng lúc khởi động và lúc tắt, để không mất mẫu cuối). */
async function flushNow(push) {
  try {
    await push(snapshot());
    return true;
  } catch {
    return false;
  }
}

/** Xoá sạch cả registry lẫn bảng tích luỹ (test). */
function __resetForTest() {
  try {
    registry.resetMetrics();
  } catch {
    // never throw
  }
  for (const m of Object.values(agg)) m.clear();
  gauges.clear();
  defaultMetricsStarted = false;
}

module.exports = {
  registry,
  count,
  observeDuration,
  timeAsync,
  setGauge,
  observeAiCall,
  observeAiFailure,
  startDefaultMetrics,
  sampleMemory,
  snapshot,
  render,
  startFlush,
  flushNow,
  __resetForTest,
  OUTCOME_OK,
  OUTCOME_ERROR,
};
