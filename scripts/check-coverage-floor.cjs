#!/usr/bin/env node
/**
 * check-coverage-floor.cjs — CI gate NGƯỠNG SÀN THEO FILE cho các engine bảo vệ.
 *
 * Ngưỡng c8 toàn cục (58%) chỉ chặn coverage TỔNG tụt — code mới có thể làm rớt
 * coverage của engine chống nuke xuống gần 0 mà tổng vẫn pass (vì các file khác
 * bù lại). Script này chặn RIÊNG từng file quan trọng: coverage của engine bảo vệ
 * không được tụt dưới sàn — sửa engine mà không có test sẽ bị CI từ chối.
 *
 * Đọc coverage/coverage-summary.json do c8 sinh (bun run test:coverage).
 * Chạy: node scripts/check-coverage-floor.cjs  (thường qua npm script coverage:floor)
 */
const fs = require("fs");
const path = require("path");

/** Sàn tối thiểu theo file (lines %) — key là đường dẫn tương đối từ bot/src. */
const FLOORS = {
  // Tran thoi gian + backoff (dot #3). Lop nay hong thi bot khong bao loi ma
  // chi... dung im — dung kieu hong kho thay nhat, va la kieu hong da lam suite
  // trinh duyet treo trong CI. 90% (do duoc ~97%).
  "resilience.js": 90,
  // Tien AI + han muc ngan sach (dot #2). Logic nay khong lam bot do — no lam
  // chu bot tieu tien ma khong biet. Sai o day im lang, nen can san cao hon mat.
  // 90% (do duoc ~97%).
  "aiPricing.js": 90,
  "altDetection.js": 75,
  "actionBudget.js": 80,
  "externalAppGuard.js": 90,
  "handlers/antinuke/audit.js": 80,
  "handlers/antinuke/members.js": 85,
  "handlers/antinuke/messages.js": 90,
  "handlers/antinuke/shared.js": 95,
  "handlers/antinuke/externalApp.js": 85,
  "handlers/antinuke/state.js": 85,
  "handlers/antinuke/raidIntel.js": 80,
  // Bo do nhiet: quyet dinh ai bi timeout/kick/ban. Phan ghi xuong Convex
  // (flushGuild/flushAll/resetGuild) truoc day gan nhu khong duoc test.
  // Sàn 90 (do duoc 92.6%): phan chua phu la nhanh loi hiem.
  "heat.js": 90,
  // Join Gate: cong vao server + auto-lockdown khi burst acc. Khoa nham
  // ca server la tai hai lon nhat cua file nay. Sàn 92 (do 95.8%).
  "handlers/joinGate.js": 92,
  "threatEngine.js": 85,
  "handlers/filters.js": 90,
  // Ticket/khiếu nại: file này gán QUYỀN kênh. Gán sai là lộ khiếu nại ra
  // công khai, nên nó cũng phải có sàn chứ không để trôi về 0% âm thầm.
  // Sàn 95% (đo được 98.6% sau khi có test-tickets-handler): phần chưa phủ là
  // các nhánh lỗi Discord hiếm, không phải đường chính.
  "handlers/tickets.js": 95,
  // Chọn hình phạt + dọn tin nhắn. Trước đây KHÔNG có test nào; hồi quy nguy
  // hiểm là "báo đã xoá N tin" khi xoá hỏng (nuốt lỗi rồi trả số mong muốn).
  "moduleActions.js": 80,
  // Case log hình phạt: quyết định báo cáo gì cho staff.
  "caseLog.js": 90,
  // Hàm thuần của ticket — phải gần như tuyệt đối, không có I/O để bào lỗi.
  "ticketCore.js": 95,
  // Đăng ký slash command: PUT là THAY THẾ TOÀN BỘ, nên một lệnh sai shape
  // khiến bot mất trần lệnh mà không có lỗi log cục bộ nào.
  // register-slash: PUT la THAY THE TOAN BO nen mot clientId rac = mat tran
  // lenh. Da phu ca duong REST tu env va nhanh CLI. Sàn 95 (do 100%).
  "register-slash.js": 95,
  // research.js: pipeline threat-intel + digest tuan. Sàn 80 (do 82.7%).
  "research.js": 80,
  // Job tu dong lam sach: XOA KENH Discord (khong hoan tac). Phai rat cao.
  // Sàn 90 (sau khi có test-ticket-jobs bảo đệ thứ tự lưu + lưu trước để không xoá mất transcript).
  "handlers/ticketJobs.js": 90,
  // Nhừn việc + panel tuự biến: quyết định ai được xữ lý.
  "handlers/ticketActivity.js": 90,
  // Thẻ ảnh chào: lỗi nguy hiểm nhất KHÔNG phải crash (đã bọc null) mà là
  // "vẽ ra ảnh trống" — font thiếu khiến fillText im lặng không vẽ gì.
  "handlers/welcomeCard.js": 80,
  // Snapshot cục bộ + log theo ngày: chạy mỗi giờ, là nguồn khôi phục khi
  // Convex chết. Lỗi ở đây = mất dữ liệu im lặng. Sàn 90 (đo 99.2% sau khi có
  // test phủ rotateLogs + vòng lặp chụp; đã vá bug mkdirSync ném ra ngoài try).
  "localSnapshot.js": 90,
  // Tự hồi phục sau nuke: đối chiếu snapshot và TẠO LẠI role/kênh đã mất.
  // File này quyết định server có tự lành hay không — chạy sai là chủ server
  // phải restore tay, hoặc tệ hơn là tạo trùng hàng loạt. Sàn 95 (đo 100%
  // sau khi có test-nuke-rollback phủ cả vòng grace + các nhánh lỗi).
  "handlers/antinuke/nukeRollback.js": 95,
  // Lớp dẫn log dùng chung: quyết định log moderation rơi vào kênh nào và
  // có bị mất không khi webhook chết. Sàn 95 (đo 100%).
  "util.js": 95,
  // Tương tác (đợt #5 tách monolith 03/10/2026): facade định tuyến + lớp dẫn
  // ticket + nút xác minh. Rẫy customId, quyền staff, rate-limit DM, cổng alt —
  // sai ở đây là ticket/verify chết câm hoặc bot thành vòi DM.
  // Sàn 90 (đo 99,3% facade · 97,7% ticket · 94,8% verify).
  "handlers/interactionCreate.js": 90,
  "handlers/interactionTicketFlow.js": 90,
  "handlers/interactionVerify.js": 90,
  // Reaction role + giveaway + panel xác minh. Sàn 95 (đo 100% sau khi phủ
  // postPanel/postGiveaway/endGiveaway + đường DM trực tiếp của admin).
  "handlers/hidden.js": 95,
  // Khoá server khi raid: trao quyền kênh cho bot và thu lại. Sàn 95 (đo 99.1%).
  "lockdown.js": 95,
};

const summaryPath = path.join(process.cwd(), "coverage", "coverage-summary.json");
if (!fs.existsSync(summaryPath)) {
  console.error(
    "✗ Không tìm thấy coverage/coverage-summary.json — chạy `bun run test:coverage` trước.",
  );
  process.exit(2);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
const files = new Map();
for (const [fullPath, data] of Object.entries(summary)) {
  if (fullPath === "total") continue;
  const rel = fullPath.replace(/\\/g, "/");
  const m = rel.match(/bot\/src\/(.+)$/);
  if (m) files.set(m[1], data); // đường dẫn tương đối từ bot/src (khớp key FLOORS)
}

let violations = 0;
console.log("════ Coverage floor — sàn tối thiểu theo file (lines %) ════\n");
for (const [file, floor] of Object.entries(FLOORS)) {
  const data = files.get(file);
  if (!data) {
    // KHÔNG được "cảnh báo rồi bỏ qua": file biến mất khỏi báo cáo coverage
    // (đổi tên, bị thêm vào exclude, hoặc không test nào nạp nữa) nghĩa là
    // SÀN BỊ VÔ HIỆU IM LẶNG — đúng kiểu lỗi cổng này sinh ra để chặn.
    console.log(
      `❌ ${file.padEnd(32)} — KHÔNG có dữ liệu coverage (đổi tên / bị exclude / không test nào nạp?)`,
    );
    violations++;
    continue;
  }
  const pct = data.lines.pct;
  const ok = pct >= floor;
  const mark = ok ? "✅" : "❌";
  console.log(`${mark} ${file.padEnd(32)} ${String(pct).padStart(6)}%  (sàn ${floor}%)`);
  if (!ok) violations++;
}

console.log("");
if (violations > 0) {
  console.error(
    `✗ ${violations} file tụt dưới sàn coverage — thêm/khôi phục test cho engine bảo vệ trước khi merge.`,
  );
  process.exit(1);
}
console.log("✅ Tất cả engine bảo vệ đạt sàn coverage.");
