// TEST: tự đóng ticket, panel tuỳ biến, nhận việc (đợt nâng cấp).
// Chạy: node scripts/test-ticket-auto-close.cjs
//
// Vì sao suite này tồn tại: đây là phần quyết định KHI NÀO MẤT MỘT THỨ
// không thu hồi được. Xoá kênh Discord là không hoàn tác, nên mọi quyết định
// dẫn tới nó phải test bằng hàm thuần, không đợi chạy thật trên server.
//
// Ba rủi ro cụ thể chốt ở đây:
//   1. Xoá kênh TRƯỚC khi lưu transcript → mất bằng chứng khiếu nại.
//   2. idleHours = 0 (chủ server tắt) mà bot vẫn đóng → mất ticket đang xử lý.
//   3. Tin nhắn cũ đọc lại từ backlog giữ ticket mở mãi.
const DJS_MOCK = require("./support/djs-mock-path.cjs");
const Module = require("module");

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "discord.js") return DJS_MOCK;
  return origResolve.call(this, request, ...args);
};

const core = require("../bot/src/ticketCore.js");

const H = 3_600_000;
const now = 1_000 * H;

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  ok ? pass++ : fail++;
};
const section = (t) => console.log(`\n── ${t} ──`);

// ═══ 1. Chuẩn hoá số giờ ═══
section("normalizeIdleHours / normalizeGraceHours");
{
  check("24 giờ giữ nguyên", core.normalizeIdleHours(24) === 24);
  check(
    "0 = TẮT (không ép về 24)",
    core.normalizeIdleHours(0) === 0,
    String(core.normalizeIdleHours(0)),
  );
  check("âm = tắt", core.normalizeIdleHours(-10) === 0);
  check("rác = tắt", core.normalizeIdleHours("abc") === 0);
  check("NaN = tắt", core.normalizeIdleHours(NaN) === 0);
  check("null = tắt", core.normalizeIdleHours(null) === 0);
  check("trần 720", core.normalizeIdleHours(99999) === 720, String(core.normalizeIdleHours(99999)));
  check(
    "cắt phần thập phân",
    core.normalizeIdleHours(23.9) === 23,
    String(core.normalizeIdleHours(23.9)),
  );
}
{
  check("grace rác → mặc định 24", core.normalizeGraceHours("x") === 24);
  check(
    "grace 0 → mặc định 24 (không xoá ngay)",
    core.normalizeGraceHours(0) === 24,
    String(core.normalizeGraceHours(0)),
  );
  check("grace âm → mặc định 24", core.normalizeGraceHours(-5) === 24);
  check("grace 1 giữ nguyên", core.normalizeGraceHours(1) === 1);
  check("grace trần 720", core.normalizeGraceHours(1e9) === 720);
}

// ═══ 2. Hết hạn khi không ai chat ═══
section("isIdleExpired");
{
  check(
    "ticket im 25h > 24h → hết hạn",
    core.isIdleExpired({ status: "open", lastActivityAt: now - 25 * H }, 24, now) === true,
  );
  check(
    "ticket vừa có người chat 1h → chưa hết hạn",
    core.isIdleExpired({ status: "open", lastActivityAt: now - 1 * H }, 24, now) === false,
  );
  check(
    "idleHours = 0 → KHÔNG BAO GIỜ tự đóng (chủ server tắt)",
    core.isIdleExpired({ status: "open", lastActivityAt: 0 }, 0, now) === false,
  );
  check(
    "ticket đã đóng → không tính",
    core.isIdleExpired({ status: "closed", lastActivityAt: 0 }, 24, now) === false,
  );
  check(
    "chưa từng có hoạt động → dùng createdAt",
    core.isIdleExpired({ status: "open", createdAt: now - 25 * H }, 24, now) === true,
  );
  check(
    "vừa mở, chưa ai chat → dùng createdAt nên CHƯA hết hạn",
    core.isIdleExpired({ status: "open", createdAt: now - 1 * H }, 24, now) === false,
  );
  check(
    "mốc 0 và createdAt 0 (không biết mở lúc nào) → không đoán",
    core.isIdleExpired({ status: "open" }, 24, now) === false,
  );
  check("bản ghi null → false", core.isIdleExpired(null, 24, now) === false);
  check(
    "rác config ('abc') → tắt, không tự đóng nhầm",
    core.isIdleExpired({ status: "open", lastActivityAt: 0 }, "abc", now) === false,
  );
}

// ═══ 3. Hạn dọn kênh ═══
section("isPurgeDue — nguyên tắc KHÔNG xoá mất transcript");
{
  check(
    "đóng 25h > 24h → đến hạn dọn",
    core.isPurgeDue({ status: "closed", closedAt: now - 25 * H }, 24, now) === true,
  );
  check(
    "đóng 1h → chưa đến hạn",
    core.isPurgeDue({ status: "closed", closedAt: now - 1 * H }, 24, now) === false,
  );
  check(
    "ĐÃ LƯU transcript → không xoá 2 lần",
    core.isPurgeDue(
      { status: "closed", closedAt: now - 99 * H, transcriptStorageId: "s1" },
      24,
      now,
    ) === false,
  );
  check(
    "ticket còn mở → không dọn",
    core.isPurgeDue({ status: "open", closedAt: now - 99 * H }, 24, now) === false,
  );
  check("chưa có closedAt → không dọn", core.isPurgeDue({ status: "closed" }, 24, now) === false);
  check("bản ghi null → false", core.isPurgeDue(null, 24, now) === false);
}
{
  check(
    "còn 23h → 23",
    core.purgeHoursLeft({ status: "closed", closedAt: now - 1 * H }, 24, now) === 23,
  );
  check(
    "hết hạn → 0",
    core.purgeHoursLeft({ status: "closed", closedAt: now - 30 * H }, 24, now) === 0,
  );
  check(
    "đã lưu transcript → 0",
    core.purgeHoursLeft({ status: "closed", closedAt: now, transcriptStorageId: "s" }, 24, now) ===
      0,
  );
  check("còn mở → 0", core.purgeHoursLeft({ status: "open", closedAt: now }, 24, now) === 0);
}

// ═══ 4. Nội dung panel tuỳ chỉnh ═══
section("fillPanelText — escape mention cho nội dung CHỦ SERVER");
{
  const out = core.fillPanelText(
    "Chào {user}! Ticket #{number}, loại {kind}, tự đóng sau {idle}h.",
    { user: "Minh", number: 7, kind: "khiếu nại", idle: 24 },
    { panelTitle: "mặc định" },
  );
  check(
    "thay đủ 4 placeholder",
    out === "Chào Minh! Ticket #7, loại khiếu nại, tự đóng sau 24h.",
    out,
  );
}
{
  // RÀO CHỐNG PING: chủ server gõ @everyone trong ô tuỳ chỉnh → mỗi lần có
  // ticket đều ping cả server. Phải escape.
  const ZW = String.fromCharCode(0x200b);
  const out = core.fillPanelText("Chào @everyone từ {user}", { user: "Minh" }, { panelTitle: "" });
  check(
    "escape @everyone trong panel tuỳ chỉnh",
    !out.includes("@everyone") && out.includes("@" + ZW + "everyone"),
    out,
  );
  const out2 = core.fillPanelText("Role <@&123> xem đây", {}, { panelTitle: "" });
  check(
    "escape role mention trong panel",
    !out2.includes("<@&123>") && out2.includes("<@&" + ZW + "123>"),
    out2,
  );
  const out3 = core.fillPanelText("Gọi <@456> vào", {}, { panelTitle: "" });
  check(
    "escape user mention trong panel",
    !out3.includes("<@456>") && out3.includes("<@" + ZW + "456>"),
    out3,
  );
}
{
  check(
    "placeholder lạ giữ nguyên (không nuốt)",
    core.fillPanelText("Hello {unknown} {user}", { user: "A" }, { panelTitle: "" }) ===
      "Hello {unknown} A",
  );
  check(
    "nội dung rỗng → dùng panelTitle",
    core.fillPanelText("", { user: "A" }, { panelTitle: "Panel mặc định {n}" }) ===
      "Panel mặc định ",
  );
  check(
    "nội dung undefined → dùng panelTitle",
    core.fillPanelText(undefined, {}, { panelTitle: "X" }) === "X",
  );
  const long = core.fillPanelText("a".repeat(5000), {}, { panelTitle: "" });
  check("cắt ở trần 1000 ký tự", long.length === 1000, String(long.length));
}

// ═══ 4b. Placeholder panel MỞ + màu tuỳ chỉnh ═══
section("fillPanelText — placeholder panel mở ({server} {open} {support})");
{
  const out = core.fillPanelText(
    "{server} đang có {open} ticket chờ — bấm {support} nhé.",
    { server: "Protogon", open: "3", support: "Hỗ trợ" },
    { panelTitle: "" },
  );
  check(
    "thay đủ placeholder panel mở",
    out === "Protogon đang có 3 ticket chờ — bấm Hỗ trợ nhé.",
    out,
  );
}
{
  // Giá trị placeholder đi vào embed → cũng phải escape, không chỉ template.
  const ZW = String.fromCharCode(0x200b);
  const out = core.fillPanelText(
    "Server {server} @everyone",
    { server: "<@&123>" },
    { panelTitle: "" },
  );
  check(
    "escape mention TRONG GIÁ TRỊ placeholder",
    !out.includes("<@&123>") && !out.includes("@everyone"),
    out,
  );
  const out2 = core.fillPanelText("Số: {open}", { open: "<@777>" }, { panelTitle: "" });
  check(
    "escape user mention trong {open}",
    !out2.includes("<@777>") && out2.includes("<@" + ZW + "777>"),
    out2,
  );
  const out3 = core.fillPanelText("Tên: {support}", { support: "@here" }, { panelTitle: "" });
  check("escape @here trong {support}", !out3.includes("@here"), out3);
}
{
  // Thiếu giá trị → thành chuỗi rỗng, KHÔNG in ra chữ "undefined".
  const out = core.fillPanelText("Số: {open}", {}, { panelTitle: "" });
  check("placeholder thiếu giá trị → rỗng, không in undefined", out === "Số: ", out);
}

section("parsePanelColor — màu tuỳ chỉnh của chủ server");
{
  const FALLBACK = 0x5865f2;
  check("hex 6 chữ số → số nguyên", core.parsePanelColor("ff0000", FALLBACK) === 0xff0000);
  check("hex viết hoa → vẫn đúng", core.parsePanelColor("FF0000", FALLBACK) === 0xff0000);
  check("có dấu # ở đầu → bỏ rồi parse", core.parsePanelColor("#00FF00", FALLBACK) === 0x00ff00);
  check(
    "khoảng trắng thừa → vẫn parse được",
    core.parsePanelColor("  123abc  ", FALLBACK) === 0x123abc,
  );
  // setColor NÉM khi nhận chuỗi rác → hỏng cả panel kèm nút mở.
  check("chuỗi rác → fallback", core.parsePanelColor("đỏ", FALLBACK) === FALLBACK);
  check(
    "thiếu dấu # nhưng sai ký tự → fallback",
    core.parsePanelColor("#GGG", FALLBACK) === FALLBACK,
  );
  check("hex quá ngắn (3 chữ số) → fallback", core.parsePanelColor("fff", FALLBACK) === FALLBACK);
  check(
    "hex quá dài (7 chữ số) → fallback",
    core.parsePanelColor("fffffffff", FALLBACK) === FALLBACK,
  );
  check("rỗng → fallback", core.parsePanelColor("", FALLBACK) === FALLBACK);
  check("undefined → fallback", core.parsePanelColor(undefined, FALLBACK) === FALLBACK);
  check("null → fallback", core.parsePanelColor(null, FALLBACK) === FALLBACK);
  // Giá trị không phải chuỗi bị ép về chuỗi (đúng quy ước `String(x ?? "")` ở
  // khắp codebase) rồi mới qua regex: số 6 chữ số hex vẫn ra màu hợp lệ,
  // số quá độ dài thì rơi về fallback — KHÔNG bao giờ trả màu setColor ném.
  check("số 6 chữ số hex → vẫn ra màu hợp lệ", core.parsePanelColor(123456, FALLBACK) === 0x123456);
  check("số quá độ dài hex → fallback", core.parsePanelColor(1234567, FALLBACK) === FALLBACK);
  check(
    "mọi kiểu rác đều ra số nguyên hợp lệ cho setColor",
    [undefined, null, "", "đỏ", "fff", 0, {}, [], "12345678", "#GGG"].every((v) => {
      const c = core.parsePanelColor(v, FALLBACK);
      return Number.isInteger(c) && c >= 0 && c <= 0xffffff;
    }),
  );
}

// ═══ 5. Lý do đóng ═══
section("sanitizeCloseReason");
{
  check("cắt khoảng trắng", core.sanitizeCloseReason("  xong rồi  ") === "xong rồi");
  check("rỗng → rỗng", core.sanitizeCloseReason("   ") === "");
  check("null → rỗng", core.sanitizeCloseReason(null) === "");
  // Lý do hiện cho CẢ staff lẫn người mở — staff gõ <@&id> sẽ ping role đó
  // trong tin nhắn riêng của người dùng.
  const ZW2 = String.fromCharCode(0x200b);
  const r = core.sanitizeCloseReason("<@&123> đã gỡ ban");
  check(
    "escape role mention trong lý do đóng",
    !r.includes("<@&123>") && r.includes("<@&" + ZW2 + "123>"),
    r,
  );
  check(
    "escape @everyone trong lý do",
    !core.sanitizeCloseReason("@everyone xin").includes("@everyone"),
  );
  const long = core.sanitizeCloseReason("y".repeat(999));
  check("cắt ở trần 300", long.length === 300, String(long.length));
}

// ═══ 6. Tag role ═══
section("buildRoleMentions");
{
  check(
    "snowflake hợp lệ → mention",
    core.buildRoleMentions(["123456789012345678"])[0] === "<@&123456789012345678>",
  );
  check("rác bị loại", core.buildRoleMentions(["abc", "", "12"]).length === 0);
  check(
    "trùng lặp bị loại",
    core.buildRoleMentions(["123456789012345678", "123456789012345678"]).length === 1,
  );
  check(
    "tối đa 3 role",
    core.buildRoleMentions([
      "111111111111111111",
      "222222222222222222",
      "333333333333333333",
      "444444444444444444",
    ]).length === 3,
  );
  check("undefined → rỗng", core.buildRoleMentions(undefined).length === 0);
  check("không phải mảng → rỗng", core.buildRoleMentions("x").length === 0);
}

console.log(`\nKết quả ticket auto-close: ${pass} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
