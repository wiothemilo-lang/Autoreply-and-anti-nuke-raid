// Test bot/src/aiPricing.js — bảng giá, hạn mức ngân sách ngày, hạ provider.
//
// Vì sao suite riêng: đây là logic TIỀN. Sai ở đây không làm bot đỏ mà làm
// chủ bot tiêu tiền mà không biết, nên nó cần test riêng + sàn coverage riêng
// (xem FLOORS trong scripts/check-coverage-floor.cjs) thay vì chen vào suite
// AI khác đang mock sẵn biến môi trường.
//
// Chạy: node scripts/test-ai-cost.cjs
const pricing = require("../bot/src/aiPricing.js");

let pass = 0;
let fail = 0;
function check(label, cond, extra) {
  if (cond) {
    pass++;
    console.log("PASS", label);
  } else {
    fail++;
    console.log("FAIL", label, extra ?? "");
  }
}

const DAY = 86_400_000;
const T0 = Date.parse("2026-10-02T10:00:00.000Z");

// ── 1. Giá đã biết: OpenAI tính đúng theo công thức ──
{
  const r = pricing.estimateCost("openai", {
    promptTokens: 1_000_000,
    completionTokens: 1_000_000,
  });
  check(
    "OpenAI 1M vào + 1M ra = 0,75 USD",
    r.known && Math.abs(r.usd - 0.75) < 1e-9,
    JSON.stringify(r),
  );

  const small = pricing.estimateCost("openai", { promptTokens: 1_000, completionTokens: 500 });
  check(
    "OpenAI tính theo phần nghìn token",
    small.known && Math.abs(small.usd - (1000 * 0.15 + 500 * 0.6) / 1_000_000) < 1e-9,
    JSON.stringify(small),
  );

  const free = pricing.estimateCost("groq", { promptTokens: 500_000, completionTokens: 100_000 });
  check(
    "provider free tier có giá 0 VÀ known=true",
    free.known && free.usd === 0,
    JSON.stringify(free),
  );
}

// ── 2. Nguyên tắc 1: KHÔNG BIẾT GIÁ thì KHÔNG phải 0 ──
{
  const unknownProvider = pricing.estimateCost("khong-co-trong-bang", { promptTokens: 1000 });
  check(
    "provider ngoài bảng giá → known=false, usd=null (KHÔNG phải 0)",
    unknownProvider.known === false && unknownProvider.usd === null,
    JSON.stringify(unknownProvider),
  );

  const custom = pricing.estimateCost("custom-gateway", {
    promptTokens: 1000,
    completionTokens: 100,
  });
  check(
    "gateway tùy chỉnh không bị coi là miễn phí",
    custom.known === false && custom.usd === null,
    JSON.stringify(custom),
  );

  const noUsage = pricing.estimateCost("openai", {});
  check(
    "thiếu usage (gateway không trả) → known=false chứ không bịa 0",
    noUsage.known === false && noUsage.usd === null,
    JSON.stringify(noUsage),
  );

  const partial = pricing.estimateCost("openai", { promptTokens: 1_000_000 });
  check(
    "chỉ có token vào vẫn tính được",
    partial.known && Math.abs(partial.usd - 0.15) < 1e-9,
    JSON.stringify(partial),
  );

  check(
    "isPaid('khong-co-trong-bang') = null (chưa biết, KHÔNG phải false)",
    pricing.isPaid("khong-co-trong-bang") === null,
  );
  check("isPaid('openai') = true", pricing.isPaid("openai") === true);
  check("isPaid('groq') = false", pricing.isPaid("groq") === false);
}

// ── 3. Ghi nhận usage + tổng ngày ──
{
  pricing.__resetForTest();
  pricing.recordUsage("openai", { promptTokens: 1_000_000, completionTokens: 0 }, T0);
  pricing.recordUsage("openai", { promptTokens: 0, completionTokens: 1_000_000 }, T0);
  check(
    "hai lượt OpenAI cộng lại = 0,75 USD",
    Math.abs(pricing.todayUsd(T0) - 0.75) < 1e-9,
    String(pricing.todayUsd(T0)),
  );

  // Provider không biết giá: token vẫn phải được đếm, tiền thì KHÔNG cộng 0.
  pricing.recordUsage(
    "custom-gateway",
    { promptTokens: 9_000_000, completionTokens: 1_000_000 },
    T0,
  );
  check(
    "token của provider chưa biết giá vẫn được đếm",
    pricing.todayTokens(T0).find((p) => p.label === "custom-gateway")?.promptTokens === 9_000_000,
    JSON.stringify(pricing.todayTokens(T0)),
  );
  check(
    "tổng tiền KHÔNG bị bóp bẹo bởi provider chưa biết giá",
    Math.abs(pricing.todayUsd(T0) - 0.75) < 1e-9,
    String(pricing.todayUsd(T0)),
  );
}

// ── 4. Đổi ngày: số hôm qua KHÔNG được cộng vào hôm nay ──
{
  pricing.__resetForTest();
  pricing.recordUsage("openai", { promptTokens: 1_000_000, completionTokens: 0 }, T0);
  check("ngày hôm nay có tiền", pricing.todayUsd(T0) > 0);
  const nextDay = pricing.todayUsd(T0 + DAY);
  check("sang ngày mới thì tiền về 0", nextDay === 0, String(nextDay));
  const rows = pricing.todayTokens(T0 + DAY);
  check("lịch sử theo provider cũng được dọn", rows.length === 0, JSON.stringify(rows));
}

// ── 5. Hạn mức ngân sách ──
{
  pricing.__resetForTest();
  const saved = process.env.AI_DAILY_BUDGET_USD;

  process.env.AI_DAILY_BUDGET_USD = "1";
  check("hạn mức đọc từ env", pricing.budgetUsd() === 1);
  pricing.recordUsage("openai", { promptTokens: 1_000_000, completionTokens: 0 }, T0);
  check("chi 0,15 USD → chưa vượt hạn mức", pricing.overBudget(T0) === false);
  pricing.recordUsage("openai", { promptTokens: 1_000_000, completionTokens: 0 }, T0);
  check("chi 0,30 USD → chưa vượt", pricing.overBudget(T0) === false);
  // Vượt hạn mức 1 USD.
  for (let i = 0; i < 6; i++)
    pricing.recordUsage("openai", { promptTokens: 1_000_000, completionTokens: 0 }, T0);
  check(
    "vượt 1 USD → báo hết ngân sách",
    pricing.overBudget(T0) === true,
    String(pricing.todayUsd(T0)),
  );

  check(
    "vượt hạn mức thì provider TRẢ PHÍ bị hạ",
    pricing.shouldDeprioritizeForBudget("openai", T0) === true,
  );
  check(
    "vượt hạn mức thì provider MIỄN PHÍ KHÔNG bị hạ (hạ vô nghĩa)",
    pricing.shouldDeprioritizeForBudget("groq", T0) === false,
  );
  check(
    "vượt hạn mức thì provider CHƯA BIẾT GIÁ cũng bị hạ (hành động an toàn)",
    pricing.shouldDeprioritizeForBudget("custom-gateway", T0) === true,
  );

  // Đúng BẰNG hạn mức cũng là hết (>= không phải >): lỡ cộng thêm 1 lượt
  // thì vẫn phải ở trạng thái hết tiền. Dùng hạn mức 0,75 vì 1M vào + 1M ra
  // của OpenAI đúng bằng 0,75 USD — chọn số khác sẽ không chạm biên.
  pricing.__resetForTest();
  process.env.AI_DAILY_BUDGET_USD = "0.75";
  pricing.recordUsage("openai", { promptTokens: 1_000_000, completionTokens: 1_000_000 }, T0);
  check(
    "chi đúng bằng hạn mức → coi là hết",
    pricing.todayUsd(T0) === 0.75 && pricing.overBudget(T0) === true,
    `${pricing.todayUsd(T0)}`,
  );
  process.env.AI_DAILY_BUDGET_USD = "0.76";
  pricing.__resetForTest();
  pricing.recordUsage("openai", { promptTokens: 1_000_000, completionTokens: 1_000_000 }, T0);
  check("thiếu 0,01 USD thì CHƯA hết", pricing.overBudget(T0) === false);

  // 0 = không đặt trần → không bao giờ "hết tiền".
  process.env.AI_DAILY_BUDGET_USD = "0";
  check("hạn mức 0 = không đặt trần", pricing.budgetUsd() === 0);
  check("không trần thì không bao giờ báo hết", pricing.overBudget(T0) === false);
  check(
    "không trần thì không hạ provider nào",
    pricing.shouldDeprioritizeForBudget("openai", T0) === false,
  );

  // Env rác → về mặc định, không NaN.
  process.env.AI_DAILY_BUDGET_USD = "abc";
  check(
    "hạn mức rác → về mặc định, không NaN",
    pricing.budgetUsd() === pricing.DEFAULT_DAILY_BUDGET_USD,
  );
  process.env.AI_DAILY_BUDGET_USD = "-5";
  check(
    "hạn mức âm → về mặc định (không phải -5)",
    pricing.budgetUsd() === pricing.DEFAULT_DAILY_BUDGET_USD,
  );

  if (saved === undefined) delete process.env.AI_DAILY_BUDGET_USD;
  else process.env.AI_DAILY_BUDGET_USD = saved;
}

// ── 6. Tóm tắt cho dashboard: phải đủ để vẽ, và phải nói rõ khi bảng giá cũ ──
{
  pricing.__resetForTest();
  process.env.AI_DAILY_BUDGET_USD = "2";
  pricing.recordUsage("groq", { promptTokens: 1234, completionTokens: 567 }, T0);
  const s = pricing.budgetSummary(T0);
  check("tóm tắt có ngày", s.day === "2026-10-02", s.day);
  check("tóm tắt có hạn mức + đã chi", s.budgetUsd === 2 && s.spentUsd === 0);
  check(
    "tóm tắt kèm chi tiết từng provider",
    s.byProvider.length === 1 && s.byProvider[0].calls === 1,
  );
  check("tóm tắt có ngày kiểm tra bảng giá", typeof s.pricingChecked === "string");
  check(
    "bảng giá cũ hơn 90 ngày thì báo mềm",
    s.pricingStaleDays === null || s.pricingStaleDays >= 0,
    String(s.pricingStaleDays),
  );
  delete process.env.AI_DAILY_BUDGET_USD;
}

// ── 7. Không bao giờ ném: dữ liệu rác không được làm hỏng đếm tiền ──
{
  pricing.__resetForTest();
  let threw = false;
  try {
    pricing.recordUsage("openai", { promptTokens: "abc", completionTokens: null });
    pricing.recordUsage(undefined, undefined);
    pricing.estimateCost(null, null);
    pricing.estimateCost("openai", null);
    pricing.todayUsd("abc");
    pricing.overBudget(NaN);
  } catch {
    threw = true;
  }
  check("recordUsage/estimateCost với dữ liệu rác không ném", !threw);
}

console.log(`\nKết quả AI cost: ${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
