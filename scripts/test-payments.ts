// TEST: bề mặt MIỄN PHÍ — Protogon không còn cổng thanh toán nào.
// Chạy: bun scripts/test-payments.ts
//
// VÌ SAO CẦN: đây là bộ khoá chống revert. Một lần ai đó thêm lại nút "Mua
// gói"/route /donate/IPN ZaloPay là test đỏ ngay, thay vì để web bán một thứ
// không tồn tại. Nội dung kiểm:
//   1. Ba module thanh toán cũ đã bị xoá hẳn khỏi cây nguồn.
//   2. HTTP backend không còn route/IPN ZaloPay.
//   3. Web không còn gọi api.payments / api.plans / safeZaloPayUrl.
//   4. Route /donate, nav, sitemap, llms.txt đã sạch; /premium chỉ redirect.
//   5. Dữ liệu kế toán cũ vẫn được giữ trong schema (không xoá âm thầm).
// Hermetic: chỉ đọc file, không mạng, không DB.
import { existsSync, readFileSync } from "node:fs";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    (ok ? "PASS " : "FAIL ") +
      label +
      (ok || detail === undefined ? "" : " — " + JSON.stringify(detail)),
  );
  ok ? pass++ : fail++;
};
const read = (rel: string) => readFileSync(new URL("../" + rel, import.meta.url), "utf8");

console.log("── 1. Module thanh toán đã bị xoá hẳn ──");
{
  for (const file of ["convex/payments.ts", "convex/paymentsAction.ts", "convex/plans.ts"]) {
    check(file + " không còn tồn tại", !existsSync(new URL("../" + file, import.meta.url)));
  }
}

console.log("\n── 2. Backend không còn cổng ZaloPay ──");
{
  const http = read("convex/http.ts");
  check("http.ts không còn route zalopay", !/zalopay/i.test(http));
  check("http.ts vẫn còn httpRouter", /httpRouter\(\)/.test(http));
}

console.log("\n── 3. Web không còn gọi API thanh toán ──");
{
  const files = [
    "src/pages/Dashboard.tsx",
    "src/pages/Admin.tsx",
    "src/pages/StatsPage.tsx",
    "src/components/UserTags.tsx",
    "src/components/dashboard/ExportCsvButton.tsx",
    "src/lib/constants.ts",
    "src/lib/safeUrl.ts",
  ];
  for (const file of files) {
    const src = read(file);
    check(
      file + " không còn api.payments/api.plans",
      !/api\.(payments|plans)\b|safeZaloPayUrl|planDisplayName/.test(src),
    );
  }
  check(
    "DonatePage đã bị xoá",
    !existsSync(new URL("../src/pages/DonatePage.tsx", import.meta.url)),
  );
  check(
    "PaymentReturn đã bị xoá",
    !existsSync(new URL("../src/components/PaymentReturn.tsx", import.meta.url)),
  );
}

console.log("\n── 4. Route/nav/SEO sạch ──");
{
  const routes = JSON.parse(read("src/lib/routes.json")) as {
    routes: { path: string; redirect: string | null }[];
  };
  check("routes.json không còn /donate", !routes.routes.some((r) => r.path === "/donate"));
  const premium = routes.routes.find((r) => r.path === "/premium");
  check("/premium vẫn là alias redirect về /", premium?.redirect === "/", premium);
  check("App.tsx không còn route/trang donate", !/DonatePage|\/donate/.test(read("src/App.tsx")));
  check("navItems không còn mục ủng hộ", !/\/donate/.test(read("src/lib/navItems.ts")));
  check("sitemap.xml không còn /donate", !read("public/sitemap.xml").includes("/donate"));
  check("llms.txt không còn /donate", !read("public/llms.txt").includes("/donate"));
}

console.log("\n── 5. Dữ liệu kế toán cũ vẫn được bảo toàn ──");
{
  const schema = read("convex/schema.ts");
  check("schema vẫn định nghĩa bảng payments", /payments: defineTable/.test(schema));
  check("schema vẫn định nghĩa bảng entitlements", /entitlements: defineTable/.test(schema));
  check("schema ghi rõ chỉ lưu trữ lịch sử", /LƯU TRỮ LỊCH SỬ/.test(schema));
  check(
    "văn bản pháp lý không còn nhắc ZaloPay",
    !/zalopay/i.test(read("src/lib/legalContent.ts")),
  );
}

console.log("\n" + pass + "/" + (pass + fail) + " assertion xanh");
if (fail > 0) process.exit(1);
