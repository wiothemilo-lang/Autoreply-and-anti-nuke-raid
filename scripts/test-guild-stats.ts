// TEST: riskExplain (giải thích vì sao bị phạt) + guildStats (tình hình server).
// Chạy: bun scripts/test-guild-stats.ts
//
// Vì sao test: hai hàm thuần này quyết định chủ server đọc được gì.
// Rủi ro cụ thể đã biết:
//  - Dịch mã rủi ro: mã bot thêm MỚI không có trong bảng dịch → nếu im lặng
//    bỏ trống thì mất dấu vết "vì sao bị phạt" (đúng lớp lỗi im lặng mà
//    dự án này chặn). Phải hiện nguyên mã.
//  - Đếm "phạm nhầm": sai biên là báo động giả hoặc bỏ sót thật.
//  - Ngày VN (UTC+7): dùng UTC sẽ lệch 7 tiếng → "hôm nay" sai.
import { explainRiskFactor, explainPunishment, formatLabel } from "../src/lib/riskExplain";
import {
  hourlyProfile,
  startOfDayVietnam,
  summarize,
  weeklyProfile,
  type StatEvent,
  type StatJoin,
} from "../convex/guildStats";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean) => {
  console.log(ok ? `  ✅ ${label}` : `  ❌ ${label}`);
  if (ok) pass++;
  else fail++;
};

console.log("── riskExplain: dịch mã ──");

// 1. Bỏ emoji tiền tố, dịch mã biết.
{
  const r = explainRiskFactor("❌ account_age_1day");
  check("mã được bỏ emoji", r.code === "account_age_1day");
  check("mã biết → dịch tiếng Việt", r.label === "Tài khoản mới tạo dưới 1 ngày");
  check("❌ = tín hiệu mạnh", r.strength === "strong");
}
check("⚠️ = tín hiệu yếu", explainRiskFactor("⚠️ is_bot_account").strength === "weak");
check("✅ = dấu hiệu tốt", explainRiskFactor("✅ account_1yr+").strength === "positive");

// 1b. CHỐNG HỒI QUY: `⚠️` gồm 2 codepoint (U+26A0 + U+FE0F). Regex bóc thiếu
// U+FE0F sẽ để lại ký tự vô hình trong mã → tra bảng dịch trượt. Đây là bug
// đã xảy ra thật; khoá lại bằng cách kiểm mã KHÔNG còn ký tự vô hình.
{
  const r = explainRiskFactor("⚠️ is_bot_account");
  check("mã sau khi bóc KHÔNG còn ký tự vô hình", !/[\uFE0F\u200B-\u200D]/.test(r.code));
  check("mã sạch, dịch đúng", r.code === "is_bot_account");
  check("không rơi vào nhánh mã lạ", r.label !== r.code);
}

// 2. Mã LẠ (bot mới thêm) → hiện nguyên mã, KHÔNG biến mất.
{
  const r = explainRiskFactor("❌ brand_new_signal_xyz");
  check("mã lạ → giữ nguyên mã", r.code === "brand_new_signal_xyz");
  check("mã lạ → nhãn = chính mã (không trắng)", r.label === "brand_new_signal_xyz");
}

// 3. Mã có số động — template + biến riêng (để translate() thay được).
{
  const r = explainRiskFactor("❌ account_age_under_5d");
  check("template động giữ placeholder {p0}", r.label === "Tài khoản mới tạo dưới {p0} ngày");
  check("truyền biến p0", formatLabel(r.label, r.vars) === "Tài khoản mới tạo dưới 5 ngày");
  check("mỗi giá trị KHÔNG tạo key mới (1 template cho mọi số)", r.label.includes("{p0}"));
}
{
  const r = explainRiskFactor("❌ username_similarity_87%");
  check("template similarity", formatLabel(r.label, r.vars) === "Tên giống tài khoản đã gặp 87%");
}
{
  const r = explainRiskFactor("❌ high_risk_join_burst_12+");
  check(
    "template join burst",
    formatLabel(r.label, r.vars) === "Cùng lúc 12 người rủi ro cao vào server",
  );
}
check("formatLabel không có biến → giữ nguyên", formatLabel("x {p0}") === "x {p0}");
{
  const r = explainRiskFactor("⚠️ generated_username_digits_but_old");
  check("template: username nhưng tài khoản cũ", r.label.includes("mẫu tạo hàng loạt"));
  check("template giữ mức yếu", r.strength === "weak");
}

console.log("── explainPunishment ──");

// 4. Chưa bị phạt → null (UI không hiện câu rỗng).
check("action rỗng → null", explainPunishment({ action: null }) === null);
check("action = pass → null", explainPunishment({ action: "pass", riskScore: 10 }) === null);
check(
  "action undefined → null",
  explainPunishment({ riskScore: 90, riskFactors: ["❌ account_age_1day"] }) === null,
);

// 5. Bị phạt → có câu giải thích, ưu tiên tín hiệu MẠNH.
{
  const text = explainPunishment({
    action: "kick",
    riskScore: 85,
    riskFactors: ["❌ account_age_1day", "⚠️ is_bot_account"],
  });
  check("có câu giải thích", !!text);
  check("nêu đúng hình phạt (kick)", text!.includes("Kick"));
  check("nêu điểm rủi ro", text!.includes("85/100"));
  check("ưu tiên lý do MẠNH", text!.includes("Tài khoản mới tạo dưới 1 ngày"));
  check("KHÔNG lẫn tín hiệu yếu vào lý do chính", !text!.includes("nhãn bot"));
}

// 5b. Câu giải thích có placeholder phải ĐÃ điền số (không còn `{p0}` lọt lên UI).
{
  const text = explainPunishment({
    action: "ban",
    riskScore: 99,
    riskFactors: ["❌ account_age_under_2d"],
  })!;
  check("placeholder đã điền trong câu giải thích", !text.includes("{p0}"));
  check("câu giải thích có số thật", text.includes("2 ngày"));
}

// 6. Chỉ có tín hiệu yếu → dùng yếu, không bịa cớ.
{
  const text = explainPunishment({
    action: "timeout",
    riskScore: 60,
    riskFactors: ["⚠️ is_bot_account"],
  });
  check("chỉ tín hiệu yếu → vẫn giải thích được", text!.includes("nhãn bot"));
  check("dịch timeout sang tiếng Việt", text!.includes("Tạm khóa"));
}

// 7. Không có yếu tố nào → nói thẳng là điểm tích luỹ, không bịa lý do.
{
  const text = explainPunishment({ action: "ban", riskScore: 100, riskFactors: [] });
  check("không có yếu tố → nói điểm tích luỹ cao", text!.includes("điểm rủi ro tích luỹ cao"));
  check("không sinh lý do giả", !text!.includes("Lý do: ."));
}

console.log("── startOfDayVietnam ──");

// 8. Ngày VN bắt đầu 00:00 giờ VN = 17:00 UTC hôm trước.
{
  const ts = Date.UTC(2026, 8, 27, 0, 0, 0); // 00:00 UTC 27/09
  const start = startOfDayVietnam(ts);
  // 00:00 VN 27/09 = 17:00 UTC 26/09
  check("00:00 UTC 27/09 → mốc là 17:00 UTC 26/09", start === Date.UTC(2026, 8, 26, 17, 0, 0));
  check("mốc <= mọi thời điểm trong ngày", start < ts);
}
{
  // 20:00 UTC 26/09 = 03:00 VN 27/09 → vẫn thuộc 27/09
  const ts = Date.UTC(2026, 8, 26, 20, 0, 0);
  check(
    "20:00 UTC 26/09 thuộc ngày VN 27/09",
    startOfDayVietnam(ts) === Date.UTC(2026, 8, 26, 17, 0, 0),
  );
}
{
  // 16:00 UTC 26/09 = 23:00 VN 26/09 → ngày VN 26/09, KHÁC hẳn
  const ts = Date.UTC(2026, 8, 26, 16, 0, 0);
  check(
    "16:00 UTC 26/09 vẫn là ngày VN 26/09 (biên đúng)",
    startOfDayVietnam(ts) === Date.UTC(2026, 8, 25, 17, 0, 0),
  );
}

console.log("── summarize: chỉ tính hôm nay ──");

const dayStart = Date.UTC(2026, 8, 27, 0, 0, 0); // dùng mốc cố định cho test
const ev = (o: Partial<StatEvent> & { createdAt: number }): StatEvent => ({
  module: "massBan",
  action: "ban",
  count: 1,
  ...o,
});
const jn = (o: Partial<StatJoin> & { createdAt: number }): StatJoin => ({
  riskScore: 50,
  riskFactors: [],
  ...o,
});

{
  const s = summarize(
    [ev({ createdAt: dayStart + 1000 }), ev({ createdAt: dayStart - 86_400_000 })],
    [jn({ createdAt: dayStart + 2000 }), jn({ createdAt: dayStart - 86_400_000 })],
    dayStart,
  );
  check("sự kiện hôm qua bị loại", s.events === 1);
  check("lượt join hôm qua bị loại", s.joins === 1);
}

// 9. Gộp cùng loại đe doạ — 20 dòng massBan/ban = MỘT loại, không phải 20.
{
  const s = summarize(
    [
      ev({ createdAt: dayStart + 1, module: "massBan", action: "ban" }),
      ev({ createdAt: dayStart + 2, module: "massBan", action: "ban" }),
      ev({ createdAt: dayStart + 3, module: "massJoin", action: "kick" }),
    ],
    [],
    dayStart,
  );
  check("2 module khác nhau → 2 loại đe doạ", s.threatsBlocked === 2);
  check("3 dòng sự kiện vẫn đếm 3", s.events === 3);
}

// 10. Tổng "lượt bị chặn" cộng dồn `count`, không phải đếm dòng.
{
  const s = summarize([ev({ createdAt: dayStart + 1, count: 120 })], [], dayStart);
  check("raid chặn 120 người = 120 lượt", s.blocked === 120);
  check("vẫn là 1 sự kiện", s.events === 1);
}

console.log("── summarize: phạm nhầm ──");

// 11. Bị xử lý nhưng điểm dưới ngưỡng → nghi phạm phạt nhầm.
{
  const s = summarize(
    [],
    [
      jn({ createdAt: dayStart + 1, action: "kick", riskScore: 30 }),
      jn({ createdAt: dayStart + 2, action: "ban", riskScore: 90 }),
      jn({ createdAt: dayStart + 3, action: "pass", riskScore: 20 }),
    ],
    dayStart,
    70,
  );
  check("2 tài khoản bị xử lý", s.punished === 2);
  check("1 nghi phạm phạt nhầm (30 < 70)", s.suspectedFalsePositives === 1);
}

// 12. Biên: đúng ngưỡng thì KHÔNG phải nghi phạm (>= ngưỡng = hợp lệ).
{
  const s = summarize(
    [],
    [jn({ createdAt: dayStart + 1, action: "kick", riskScore: 70 })],
    dayStart,
    70,
  );
  check("điểm ĐÚNG ngưỡng 70 → không nghi phạm", s.suspectedFalsePositives === 0);
}

// 13. Tôn trọng ngưỡng RIÊNG của server (chủ hạ ngưỡng xuống 40).
{
  const s = summarize(
    [],
    [
      jn({ createdAt: dayStart + 1, action: "kick", riskScore: 50 }),
      jn({ createdAt: dayStart + 2, action: "kick", riskScore: 20 }),
    ],
    dayStart,
    40,
  );
  check("ngưỡng 40: điểm 50 hợp lệ, 20 là nghi phạm", s.suspectedFalsePositives === 1);
}

console.log("── summarize: top yếu tố ──");

// 14. Bỏ emoji khi gom mã, sắp theo số lần giảm dần.
{
  const s = summarize(
    [],
    [
      jn({ createdAt: dayStart + 1, riskFactors: ["❌ account_age_1day"] }),
      jn({ createdAt: dayStart + 2, riskFactors: ["⚠️ account_age_1day"] }),
      jn({ createdAt: dayStart + 3, riskFactors: ["⚠️ is_bot_account"] }),
    ],
    dayStart,
  );
  check("emoji khác nhau vẫn gộp cùng 1 mã", s.topRiskFactors[0][0] === "account_age_1day");
  check("mã phổ biến nhất đứng đầu", s.topRiskFactors[0][1] === 2);
  check("không trùng lặp mã", s.topRiskFactors.length === 2);
}

// 15. Không có dữ liệu → số 0, KHÔNG ném, KHÔNG undefined.
{
  const s = summarize([], [], dayStart);
  check("rỗng → mọi số = 0", s.events === 0 && s.blocked === 0 && s.joins === 0);
  check("rỗng → không có yếu tố", s.topRiskFactors.length === 0);
  check("rỗng → không có nghi phạm", s.suspectedFalsePositives === 0);
}

console.log("── hourlyProfile / weeklyProfile (A6) ──");

{
  // Mốc 00:00 giờ VN cố định để test không phụ thuộc múi giờ máy.
  const dayStart = startOfDayVietnam(Date.UTC(2026, 8, 27, 12, 0, 0));
  const H = 3_600_000;
  const e = (at: number, count = 1): StatEvent => ({
    module: "massBan",
    action: "mass ban",
    count,
    createdAt: at,
    punish: null,
  });
  const j = (at: number): StatJoin => ({
    createdAt: at,
    riskScore: 10,
    action: "pass",
    riskFactors: [],
  });

  const hourly = hourlyProfile(
    [
      e(dayStart + 2 * H + 10 * 60_000, 5),
      e(dayStart + 2 * H + 50 * 60_000, 3),
      e(dayStart + 23 * H),
    ],
    [j(dayStart + 2 * H), j(dayStart + 2 * H), j(dayStart + 9 * H)],
    dayStart,
  );
  check("luôn có đúng 24 ô", hourly.length === 24);
  check("ô 2 gộp cả sự kiện lẫn người vào", hourly[2].events === 2 && hourly[2].joins === 2);
  check("ô 2 gộp lượt chặn theo count", hourly[2].blocked === 8);
  check("ô 23 có 1 sự kiện", hourly[23].events === 1);
  check("ô không có gì vẫn là 0", hourly[5].events === 0 && hourly[5].joins === 0);
  check(
    "sự kiện ngoài 24h bị bỏ qua",
    hourlyProfile([e(dayStart + 25 * H)], [], dayStart).every((b) => b.events === 0),
  );
  check(
    "sự kiện trước dayStart bị bỏ qua",
    hourlyProfile([e(dayStart - H)], [], dayStart).every((b) => b.events === 0),
  );

  const weekly = weeklyProfile(
    [e(dayStart + 3 * H, 2), e(dayStart - 86_400_000 + H, 4)],
    [j(dayStart + H), j(dayStart - 2 * 86_400_000 + H)],
    dayStart + 10 * H,
  );
  check("luôn có đúng 7 ngày", weekly.length === 7);
  check("ngày cũ nhất đứng trước", weekly[0].dayStart < weekly[6].dayStart);
  check("ngày hôm nay là ô cuối", weekly[6].dayStart === dayStart);
  check("ngày hôm nay gom lượt chặn của hôm nay", weekly[6].blocked === 2 && weekly[6].joins === 1);
  check("ngày hôm qua đếm đúng", weekly[5].blocked === 4 && weekly[5].joins === 0);
  check("2 ngày trước chỉ có người vào", weekly[4].joins === 1 && weekly[4].blocked === 0);
  check(
    "sự kiện ngoài 7 ngày không vào ô nào",
    weeklyProfile([e(dayStart - 9 * 86_400_000)], [], dayStart + H).every((d) => d.blocked === 0),
  );
  check(
    "rỗng → 7 ngày toàn 0",
    weeklyProfile([], [], dayStart + H).every((d) => d.joins === 0 && d.blocked === 0),
  );
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
