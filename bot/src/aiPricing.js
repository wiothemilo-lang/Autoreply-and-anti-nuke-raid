/**
 * aiPricing.js — tiền AI: bảng giá + hạn mức ngân sách theo ngày.
 *
 * Vì sao có: bot có chuỗi 7 provider và **không đếm token, không biết tốn bao
 * nhiêu** (`rg "usage|total_tokens|cost" bot/src/ai.js` → 0 hit trước đợt #1).
 * Hệ quả: không ai biết OpenAI đang đốt tiền bao nhiêu mỗi ngày, và cũng không
 * biết hạn mức free tier của Kira/Groq đã hết hay chưa. Đợt #1 đã đo được
 * `usage`; file này biến nó thành **tiền** và thành **hành động khi vượt trần**.
 *
 * Ba nguyên tắc, đều là bài học từ lỗi im lặng:
 *
 *  1. **Giá KHÔNG rõ thì KHÔNG được coi là 0.** Provider không có trong bảng
 *     (gateway tùy chỉnh) trả `known: false` và `usd: null` — không phải 0.
 *     Vì 0 trông y hệt "miễn phí", số 0 giả làm báo cáo chi phí sai lệch và làm
 *     hạn mức không bao giờ kích hoạt. Giá vô hạn phải được nhìn thấy.
 *  2. **Free tier CÓ HẠN.** Groq/NIM/SambaNova/Kira miễn phí TRONG HẠN MỨC;
 *     vượt hạn mức thì phát sinh tiền hoặc bị chặn. Ghi rõ hạn mức để lúc nó
 *     hết hạn mức ta biết đang đi qua ranh giới đó, không tưởng vẫn miễn phí.
 *  3. **Vượt trần KHÔNG được làm hỏng chống raid.** Hành động khi vượt là HẠ
 *     provider trả phí xuống cuối chuỗi (soft penalty, y hệt cooldown sức khoẻ),
 *     KHÔNG phải từ chối gọi. Bot vẫn chống nuke bằng provider miễn phí; nếu mọi
 *     provider chết thì mới về tới provider trả phí. Chặn cứng ở đây sẽ biến
 *     "hết tiền" thành "mất chống raid" — tệ hơn nhiều.
 *
 * Bảng giá có NGÀY KIỂM TRA vì giá AI đổi rất nhanh. Cũ quá sẽ báo mềm
 * (`isStale`) thay vì im lặng dùng số sai.
 *
 * Bộ nhớ: trong tiến trình bot. Reset khi restart là chấp nhận được (mất tối
 * đa số liệu 1 ngày); đừng biến việc đếm tiền thành nguồn sự cập thêm.
 */

/** Giá USD trên 1 TRIỆU token. */
const PER_MILLION = 1_000_000;

/**
 * Bảng giá theo `label` của provider trong `bot/src/ai.js`.
 * `freeTier` = miễn phí trong hạn mức; `monthlyLimit` ghi rõ hạn mức nếu có.
 * `null` ở `prompt`/`completion` = KHÔNG BIẾT GIÁ (xem nguyên tắc 1).
 */
const PRICING = {
  groq: {
    prompt: 0,
    completion: 0,
    freeTier: true,
    note: "Groq free tier — có hạn mức lượt/phút, vượt thì bị 429 chứ không thu tiền",
    checked: "2026-10-02",
  },
  "nvidia-nim": {
    prompt: 0,
    completion: 0,
    freeTier: true,
    note: "NVIDIA NIM free credits (build.nvidia.com)",
    checked: "2026-10-02",
  },
  "nvidia-nim-deepseek": {
    prompt: 0,
    completion: 0,
    freeTier: true,
    note: "NVIDIA NIM free credits — DeepSeek V4 Pro",
    checked: "2026-10-02",
  },
  sambanova: {
    prompt: 0,
    completion: 0,
    freeTier: true,
    note: "SambaNova free tier",
    checked: "2026-10-02",
  },
  "kira-mimo": {
    prompt: 0,
    completion: 0,
    freeTier: true,
    monthlyLimitTokens: 30_000_000,
    note: "Kira AI (kiraai.vn) — 30M token/ngày trên Mimo V2.5",
    checked: "2026-10-02",
  },
  openai: {
    // gpt-4o-mini: 0,15 USD/1M input · 0,60 USD/1M output.
    prompt: 0.15,
    completion: 0.6,
    freeTier: false,
    note: "OpenAI trả phí — model gpt-4o-mini (đổi qua OPENAI_MODEL thì giá đổi theo)",
    checked: "2026-10-02",
  },
  // Gateway tùy chỉnh: GIÁ KHÔNG BIẾT — cố ý để null, tuyệt đối không điền 0.
  "custom-gateway": { prompt: null, completion: null, freeTier: false, checked: null },
};

/** Ngày mà bảng giá được rà lại. Quá hạn thì báo mềm, không chặn. */
const STALE_AFTER_DAYS = 90;

/** Hạn mức/ngày (USD). `0` = không đặt trần. Mặc định 2 USD/ngày. */
const DEFAULT_DAILY_BUDGET_USD = 2;

function dailyBudgetUsd() {
  try {
    const n = Number(process.env.AI_DAILY_BUDGET_USD);
    if (!Number.isFinite(n) || n < 0) return DEFAULT_DAILY_BUDGET_USD;
    return n;
  } catch {
    return DEFAULT_DAILY_BUDGET_USD;
  }
}

/** Khoá ngày theo giờ địa phương (UTC) — ngân sách tính theo ngày, không theo 24h trôi. */
function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  // ts rác (NaN, chuỗi hỏng) → `toISOString()` ném RangeError, mà hàm này được
  // gọi TỪ `rollover` trước mọi try/catch phía ngoài. Trả ngày hôm nay thay vì
  // làm hỏng cả đếm tiền.
  return Number.isNaN(d.getTime())
    ? new Date().toISOString().slice(0, 10)
    : d.toISOString().slice(0, 10);
}

/** provider -> { usd, promptTokens, completionTokens } trong ngày hiện tại. */
let byProvider = new Map();
let trackedDay = dayKey();

/** Số ngày bảng giá đã cũ (null = không có ngày kiểm tra). */
function pricingAgeDays(now = Date.now()) {
  const checked = PRICING.openai?.checked;
  if (!checked) return null;
  const t = Date.parse(checked);
  if (!Number.isFinite(t)) return null;
  return Math.floor((now - t) / 86_400_000);
}

/** Bảng giá của một provider, hoặc null nếu chưa biết. */
function priceOf(label) {
  return PRICING[label] ?? null;
}

/** Provider này có trả phí không? `null` = chưa biết → coi như CÓ THỂ có. */
function isPaid(label) {
  const p = PRICING[label];
  if (!p) return null;
  return p.freeTier === false;
}

/**
 * Ước tính chi phí một lượt gọi.
 * Trả `{ usd, known }`; `known: false` khi không có giá (xem nguyên tắc 1).
 * Thiếu `usage` (gateway không trả) → `known: false` chứ KHÔNG phải 0.
 */
function estimateCost(label, usage) {
  // KHÔNG destructure trong chữ ký: `= {}` chỉ áp dụng cho `undefined`, gặp
  // `null` sẽ ném TypeError NGAY TẠI CHỮ KÝ — tức ngoài mọi try/catch bên
  // trong. Đếm tiền phải chịu được dữ liệu rác từ gateway.
  const { promptTokens, completionTokens } = usage ?? {};
  const p = PRICING[label];
  if (!p) return { usd: null, known: false, reason: "provider chưa có trong bảng giá" };
  const pin = Number(promptTokens);
  const pout = Number(completionTokens);
  if (!Number.isFinite(pin) && !Number.isFinite(pout)) {
    return { usd: null, known: false, reason: "gateway không trả usage" };
  }
  if (p.prompt === null || p.completion === null) {
    return { usd: null, known: false, reason: "chưa biết giá của gateway này" };
  }
  const usd =
    ((Number.isFinite(pin) ? pin : 0) * p.prompt +
      (Number.isFinite(pout) ? pout : 0) * p.completion) /
    PER_MILLION;
  return { usd: Math.round(usd * 1e8) / 1e8, known: true };
}

/** Đảo ngày nếu sang ngày mới — số liệu hôm qua không được cộng vào hôm nay. */
function rollover(now = Date.now()) {
  const today = dayKey(now);
  if (today !== trackedDay) {
    byProvider = new Map();
    trackedDay = today;
  }
}

/**
 * Ghi nhận một lượt gọi đã tốn token. Trả ước tính chi phí để `ai.js` đưa vào
 * metrics. `never throw` — đếm tiền hỏng không được làm AI hỏng.
 */
function recordUsage(label, usage, now = Date.now()) {
  try {
    const { promptTokens, completionTokens } = usage ?? {};
    rollover(now);
    const { usd, known } = estimateCost(label, { promptTokens, completionTokens });
    const entry = byProvider.get(label) ?? {
      usd: 0,
      promptTokens: 0,
      completionTokens: 0,
      calls: 0,
    };
    entry.calls += 1;
    if (Number.isFinite(Number(promptTokens))) entry.promptTokens += Number(promptTokens);
    if (Number.isFinite(Number(completionTokens)))
      entry.completionTokens += Number(completionTokens);
    // Tiền KHÔNG rõ vẫn được đếm token, nhưng KHÔNG cộng 0 vào tổng tiền —
    // tổng tiền phải là "ít nhất bằng" đã biết, không phải "chắc chắn bằng".
    if (known && Number.isFinite(usd)) entry.usd += usd;
    byProvider.set(label, entry);
    return { usd, known };
  } catch {
    return { usd: null, known: false };
  }
}

/** Tổng tiền hôm nay (USD) — chỉ tính phần GIÁ ĐÃ BIẾT. */
function todayUsd(now = Date.now()) {
  try {
    rollover(now);
    let sum = 0;
    for (const v of byProvider.values()) sum += v.usd;
    return Math.round(sum * 1e6) / 1e6;
  } catch {
    return 0;
  }
}

/** Tổng token hôm nay theo provider, để dashboard hiện mà không cần bảng giá. */
function todayTokens(now = Date.now()) {
  try {
    rollover(now);
    return [...byProvider.entries()].map(([label, v]) => ({
      label,
      calls: v.calls,
      promptTokens: v.promptTokens,
      completionTokens: v.completionTokens,
      usd: Math.round(v.usd * 1e6) / 1e6,
    }));
  } catch {
    return [];
  }
}

/** Hạn mức đang đặt (0 = không đặt). */
function budgetUsd() {
  return dailyBudgetUsd();
}

/**
 * Đã vượt hạn mức chưa? Chỉ tính khi hạn mức > 0.
 * Dùng `>=` chứ không phải `>`: tới đúng hạn là hết tiền, và lỡ cộng thêm
 * một lượt thì vẫn nên ở trạng thái hết tiền.
 */
function overBudget(now = Date.now()) {
  try {
    const cap = budgetUsd();
    if (cap <= 0) return false;
    return todayUsd(now) >= cap;
  } catch {
    return false;
  }
}

/**
 * Provider này có nên bị HẠ xuống cuối chuỗi vì hết ngân sách không?
 * Chỉ provider TRẢ PHÍ mới bị hạ — hạ provider miễn phí thì vô nghĩa, và
 * `isPaid() === null` (chưa biết giá) cũng bị hạ: đó là hành động AN TOÀN khi
 * ta không biết mình có tốn tiền hay không.
 */
function shouldDeprioritizeForBudget(label, now = Date.now()) {
  try {
    if (!overBudget(now)) return false;
    return isPaid(label) !== false;
  } catch {
    return false;
  }
}

/** Tóm tắt cho dashboard + `aiStats()`. */
function budgetSummary(now = Date.now()) {
  try {
    rollover(now);
    const cap = budgetUsd();
    const spent = todayUsd(now);
    const age = pricingAgeDays(now);
    return {
      day: dayKey(now),
      spentUsd: spent,
      budgetUsd: cap,
      // `overBudget` tách riêng: tỉ lệ >= 100% thì coi là hết tiền.
      overBudget: cap > 0 && spent >= cap,
      byProvider: todayTokens(now),
      /** Bảng giá đã cũ hơn 90 ngày chưa — số liệu có thể sai, báo mềm. */
      pricingStaleDays: age,
      pricingChecked: PRICING.openai?.checked ?? null,
    };
  } catch {
    return {
      day: dayKey(now),
      spentUsd: 0,
      budgetUsd: 0,
      overBudget: false,
      byProvider: [],
      pricingStaleDays: null,
      pricingChecked: null,
    };
  }
}

function __resetForTest() {
  byProvider = new Map();
  trackedDay = dayKey();
}

module.exports = {
  PRICING,
  priceOf,
  isPaid,
  estimateCost,
  recordUsage,
  todayUsd,
  todayTokens,
  budgetUsd,
  overBudget,
  shouldDeprioritizeForBudget,
  budgetSummary,
  pricingAgeDays,
  STALE_AFTER_DAYS,
  DEFAULT_DAILY_BUDGET_USD,
  __resetForTest,
};
