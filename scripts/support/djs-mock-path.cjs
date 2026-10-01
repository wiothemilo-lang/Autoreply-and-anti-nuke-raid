// Đường dẫn file mock discord.js RIÊNG CHO TỪNG TIẾN TRÌNH — mỗi suite tự ghi nội dung
// mock của mình vào đây (xem `DJS_MOCK` trong scripts/test-*.cjs).
//
// Vì sao không còn dùng chung `bot/test-djs-mock.cjs`: 45 suite ghi (34 nội dung khác
// nhau) và 15 suite tự xoá file đó → hai suite chạy cùng lúc (hay `bun run test` chạy
// song song `bun run test:ts`) giẫm lên nhau, và vài suite chỉ chạy được nhờ file do
// suite đứng trước để lại (chạy lẻ trên cây sạch là hỏng).
//
// Nằm ở os.tmpdir() nên `git status` luôn sạch; tự xoá khi tiến trình thoát.
const fs = require("fs");
const os = require("os");
const path = require("path");

const file = path.join(os.tmpdir(), `protogon-djs-mock-${process.pid}.cjs`);

process.on("exit", () => {
  try {
    fs.unlinkSync(file);
  } catch {
    // đã xoá (suite tự dọn) hoặc chưa từng ghi
  }
});

module.exports = file;
