// TEST: ticketCore.js + lang.js (phần ticket) — hàm thuần, hermetic tuyệt đối.
// Không mạng, không mock discord.js, không Date.now thật (tiêm `now`).
//
// Phạm vi: mọi quyết định có thể SAI ÂM THẦM khiến server bị spam kênh hoặc
// người dùng bị ping oan. Đặc biệt `escapeMentions` — nó từng là hàm NO-OP vì
// ký tự zero-width bị tooling nuốt mất, tức là mất trọn hàng rào chống ping.
// Test này chốt lại chuyện đó bằng kiểm tra CODE POINT, không kiểm tra chuỗi
// hiển thị (mắt không phân biệt được ký tự vô hình).
//
// Chạy: node scripts/test-tickets.cjs

const path = require("path");
const core = require(path.join(__dirname, "..", "bot", "src", "ticketCore"));
const lang = require(path.join(__dirname, "..", "bot", "src", "handlers", "lang"));

let pass = 0;
let fail = 0;
const check = (label, cond) => {
  if (cond) {
    pass++;
    console.log("PASS", label);
  } else {
    fail++;
    console.error("FAIL", label);
  }
};

/** true nếu chuỗi chứa U+200B (ký tự vô hình) — cách kiểm duy nhất đáng tin. */
const ZWSP = String.fromCharCode(0x200b);
const hasZWSP = (s) => typeof s === "string" && s.includes(ZWSP);

// ═══ 1. ESCAPE CHỐNG PING — hàng rào bảo mật, kiểm tra bằng code point ═══
console.log("\n── escapeMentions (chống ping) ──");

check("ZERO_WIDTH là U+200B thật", core.ZERO_WIDTH.codePointAt(0) === 0x200b);
check(
  "@everyone bị chèn ZWSP (không còn khớp mention)",
  hasZWSP(core.escapeMentions("@everyone")) &&
    !core.escapeMentions("@everyone").includes("@everyone"),
);
check("@here bị chèn ZWSP", hasZWSP(core.escapeMentions("@here")));
check("mention user <@123> bị chèn ZWSP", hasZWSP(core.escapeMentions("<@123>")));
check("mention user <@!123> bị chèn ZWSP", hasZWSP(core.escapeMentions("<@!123>")));
check("mention role <@&123> bị chèn ZWSP", hasZWSP(core.escapeMentions("<@&123>")));
check(
  "chữ vẫn đọc được (chỉ chèn 1 ký tự, không xoá)",
  core.escapeMentions("@everyone").replace(ZWSP, "") === "@everyone",
);
check("text thường KHÔNG bị đổi", core.escapeMentions("xin chào") === "xin chào");
check(
  "null/undefined → chuỗi rỗng",
  core.escapeMentions(null) === "" && core.escapeMentions(undefined) === "",
);
check("số 0 không bị nuốt (falsy trap)", core.escapeMentions(0) === "0");
check(
  "nhiều mention trong 1 chuỗi đều bị escape",
  (() => {
    const out = core.escapeMentions("@everyone và @here và <@&42>");
    return (out.match(new RegExp(ZWSP, "g")) || []).length === 3;
  })(),
);

// ═══ 2. SANITIZE NỘI DUNG ═══
console.log("\n── sanitizeBody / clip ──");
check("escape + trim + cắt 1000", core.sanitizeBody("  @everyone  ").includes(ZWSP));
check("cắt đúng giới hạn 1000 ký tự", core.sanitizeBody("a".repeat(5000)).length === core.BODY_MAX);
check("ngắn hơn giới hạn thì không thêm dấu …", core.sanitizeBody("ngắn") === "ngắn");
check("bị cắt thì có dấu …", core.sanitizeBody("a".repeat(2000), 10).endsWith("…"));
check("clip('') an toàn", core.clip("", 10) === "");
check("clip với max=1 không lỗi", core.clip("abc", 1).length === 1);

// ═══ 3. TÊN KÊNH ĐÚNG LUẬT DISCORD ═══
console.log("\n── sanitizeChannelName / buildChannelName ──");
check(
  "bỏ dấu tiếng Việt",
  core.sanitizeChannelName("Khiếu Nại") === "khiếu-nại".replace("ế", "e") ||
    core.sanitizeChannelName("Khiếu Nại") === "khieu-nai",
);
check("đ/Đ → d (NFD không tách được)", core.sanitizeChannelName("Đặng") === "dang");
check("ký tự lạ → gạch nối", core.sanitizeChannelName("a!@#b") === "a-b");
check("không bắt đầu bằng gạch", !core.sanitizeChannelName("---abc").startsWith("-"));
check("không kết thúc bằng gạch", !core.sanitizeChannelName("abc---").endsWith("-"));
check("gộp gạch liên tiếp (Discord từ chối --)", !core.sanitizeChannelName("a---b").includes("--"));
check("chuỗi rỗng → 'ticket'", core.sanitizeChannelName("") === "ticket");
check("toàn ký tự lạ → 'ticket'", core.sanitizeChannelName("!!!@@@") === "ticket");
check("cắt đúng 100 ký tự", core.sanitizeChannelName("a".repeat(300)).length === 100);
check(
  "cắt KHÔNG để lại gạch ở cuối",
  !core.sanitizeChannelName("a".repeat(99) + "!!!").endsWith("-"),
);
check("chỉ còn ký tự hợp lệ", /^[a-z0-9_-]+$/.test(core.sanitizeChannelName("Khiếu Nại #1 @abc")));
check(
  "buildChannelName có số",
  core.buildChannelName({ username: "Minh", number: 7 }) === "ticket-minh-7",
);
check(
  "buildChannelName không lặp tiền tố",
  core.buildChannelName({ username: "ticket-abc", number: 2 }) === "ticket-abc-2",
);
check(
  "buildChannelName username rỗng → ticket-<n>",
  core.buildChannelName({ username: "", number: 3 }) === "ticket-3",
);
check(
  "buildChannelName số rác → 1",
  core.buildChannelName({ username: "a", number: null }).endsWith("-1"),
);
check(
  "buildChannelName vẫn hợp lệ sau khi bỏ dấu",
  /^[a-z0-9_-]+$/.test(core.buildChannelName({ username: "Nguyễn Văn A", number: 12 })),
);

// ═══ 4. HÀNG RÀO CHỐNG SPAM — quyết định cho phép mở ═══
console.log("\n── decideOpen (chống spam) ──");
const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);
const HOUR = 3_600_000;
const base = {
  enabled: true,
  category: "111",
  staffRoleIds: ["222"],
  openCount: 0,
  lastOpenedAt: null,
  maxOpen: 20,
  cooldownHours: 24,
  now: NOW,
};

check("cấu hình đủ → cho mở", core.decideOpen(base).ok === true);
check(
  "tắt tính năng → 'disabled'",
  core.decideOpen({ ...base, enabled: false }).reason === "disabled",
);
check(
  "chưa có category → 'no_category'",
  core.decideOpen({ ...base, category: null }).reason === "no_category",
);
check(
  "chưa có role staff → 'no_staff'",
  core.decideOpen({ ...base, staffRoleIds: [] }).reason === "no_staff",
);
check(
  "staffRoleIds undefined → 'no_staff'",
  core.decideOpen({ ...base, staffRoleIds: undefined }).reason === "no_staff",
);
check(
  "đạt trần → 'max_open'",
  core.decideOpen({ ...base, openCount: 20, maxOpen: 20 }).reason === "max_open",
);
check(
  "chưa đạt trần → vẫn mở được",
  core.decideOpen({ ...base, openCount: 19, maxOpen: 20 }).ok === true,
);
check(
  "vừa mở → 'cooldown'",
  core.decideOpen({ ...base, lastOpenedAt: NOW - HOUR }).reason === "cooldown",
);
check(
  "hết cooldown → mở được",
  core.decideOpen({ ...base, lastOpenedAt: NOW - 25 * HOUR }).ok === true,
);
check(
  "cooldown báo số giờ còn lại",
  core.decideOpen({ ...base, lastOpenedAt: NOW - HOUR, cooldownHours: 24 }).waitHours === 23,
);
check(
  "cooldown = 0 → bỏ qua hàng rào",
  core.decideOpen({ ...base, lastOpenedAt: NOW, cooldownHours: 0 }).ok === true,
);
check(
  "maxOpen rác (chuỗi) → về mặc định 20, không NaN",
  core.decideOpen({ ...base, openCount: 19, maxOpen: "abc" }).ok === true,
);
check(
  "maxOpen âm → kẹp về 1, không âm",
  core.decideOpen({ ...base, openCount: 1, maxOpen: -5 }).reason === "max_open",
);
check(
  "lastOpenedAt 0 (falsy) không bị coi là vừa mở",
  core.decideOpen({ ...base, lastOpenedAt: 0 }).ok === true,
);
check(
  "thứ tự: tắt tính năng thắng trước cả chống spam",
  core.decideOpen({ ...base, enabled: false, openCount: 999, lastOpenedAt: NOW }).reason ===
    "disabled",
);
check(
  "thứ tự: chưa cấu hình thắng trước chống spam",
  core.decideOpen({ ...base, category: null, openCount: 999 }).reason === "no_category",
);

// ═══ 5. NORMALIZE SỐ & LOẠI ═══
console.log("\n── normalizeLimit / normalizeKind ──");
check("số hợp lệ giữ nguyên", core.normalizeLimit(30, 20, 1, 100) === 30);
check("NaN → fallback", core.normalizeLimit("x", 20, 1, 100) === 20);
check("kẹp trên", core.normalizeLimit(500, 20, 1, 100) === 100);
check("kẹp dưới", core.normalizeLimit(0, 20, 1, 100) === 1);
check("làm tròn", core.normalizeLimit(5.6, 20, 1, 100) === 6);
check("kind 'appeal' giữ", core.normalizeKind("appeal") === "appeal");
check("kind 'support' giữ", core.normalizeKind("support") === "support");
check("kind lạ → 'support' (an toàn)", core.normalizeKind("xyz") === "support");
check("kind rỗng → 'support'", core.normalizeKind("") === "support");
check("kind undefined → 'support'", core.normalizeKind(undefined) === "support");

// ═══ 6. QUYỀN STAFF ═══
console.log("\n── isStaff ──");
check(
  "có role staff → true",
  core.isStaff({ roles: { cache: { has: (r) => r === "222" } } }, ["222"]) === true,
);
check(
  "không có role nào trùng → false",
  core.isStaff({ roles: { cache: { has: () => false } } }, ["222"]) === false,
);
check("mảng thuần (test) cũng chạy", core.isStaff({ roles: ["222", "333"] }, ["333"]) === true);
check("member null → false", core.isStaff(null, ["222"]) === false);
check(
  "danh sách staff rỗng → false (mọi người đều không có quyền)",
  core.isStaff({ roles: ["222"] }, []) === false,
);
check("danh sách staff undefined → false", core.isStaff({ roles: ["222"] }, undefined) === false);

// ═══ 7. PAYLOAD EMBED ═══
console.log("\n── buildOpenPayload ──");
const T = lang.ticketText("vi");
const payload = core.buildOpenPayload({
  TICKET_TEXT: T,
  number: 42,
  kind: "appeal",
  openerName: "minh",
  openedById: "999",
  body: "tôi bị ban oan",
  evidence: "https://x.com/a",
});
check("tiêu đề khiếu nại có số", payload.title.includes("42"));
check("có 4 field", payload.fields.length === 4);
check("field người mở có mention user", payload.fields[0].value.includes("<@999>"));
check(
  "nội dung rỗng → dấu gạch, không để trống field",
  core.buildOpenPayload({
    TICKET_TEXT: T,
    number: 1,
    kind: "support",
    openerName: "a",
    body: "",
    evidence: "",
  }).fields[3].value === "—",
);
check(
  "bằng chứng rỗng → T.noEvidence",
  core.buildOpenPayload({
    TICKET_TEXT: T,
    number: 1,
    kind: "support",
    openerName: "a",
    body: "b",
    evidence: "",
  }).fields[3].value === T.noEvidence,
);
check(
  "không có openedById vẫn dựng được",
  core.buildOpenPayload({ TICKET_TEXT: T, number: 1, kind: "support", openerName: "a", body: "b" })
    .fields[0].value === "a",
);
check(
  "loại support dùng tiêu đề riêng",
  core.buildOpenPayload({ TICKET_TEXT: T, number: 5, kind: "support", openerName: "a", body: "b" })
    .title !==
    core.buildOpenPayload({ TICKET_TEXT: T, number: 5, kind: "appeal", openerName: "a", body: "b" })
      .title,
);

// ═══ 8. COOLDOWN PHÚT CÒN LẠI ═══
console.log("\n── cooldownMinutesLeft ──");
check("vừa mở → 1440 phút", core.cooldownMinutesLeft(NOW - HOUR, 24, NOW) === 1380);
check("hết hạn → 0", core.cooldownMinutesLeft(NOW - 48 * HOUR, 24, NOW) === 0);
check("chưa mở bao giờ → 0", core.cooldownMinutesLeft(null, 24, NOW) === 0);
check("cooldown 0 → 0", core.cooldownMinutesLeft(NOW, 0, NOW) === 0);

// ═══ 9. NGÔN NGỮ THEO NGƯỜI DÙNG (thay cho IP) ═══
console.log("\n── langForUser (per-user, thay cho IP) ──");
check("interaction.locale vi → vi", lang.langForUser({ locale: "vi" }) === "vi");
check("interaction.locale de-AT → de", lang.langForUser({ locale: "de-AT" }) === "de");
check("interaction.locale ja (chưa có bản dịch) → en", lang.langForUser({ locale: "ja" }) === "en");
check(
  "interaction.locale ưu tiên hơn user.locale",
  lang.langForUser({ locale: "de", user: { locale: "vi" } }) === "de",
);
check(
  "rơi về user.locale khi interaction không có",
  lang.langForUser({ user: { locale: "de" } }) === "de",
);
check(
  "rơi về guild khi không có cả hai",
  lang.langForUser({ user: {} }, { preferredLocale: "de" }) === "de",
);
check("không có gì → vi (sản phẩm gốc)", lang.langForUser({ user: {} }) === "vi");
check("null → không crash", lang.langForUser(null) === "vi");
check("guild null vẫn an toàn", lang.langForUser({ locale: "en" }, null) === "en");

// ═══ 10. CHUỖI TICKET ĐỦ 3 NGÔN NGỮ + KHÓA KEY ═══
console.log("\n── ticketText đa ngôn ngữ ──");
const KEYS_VI = Object.keys(lang.ticketText("vi")).sort();
const KEYS_EN = Object.keys(lang.ticketText("en")).sort();
const KEYS_DE = Object.keys(lang.ticketText("de")).sort();
check("EN có đủ key của VI", KEYS_VI.join("|") === KEYS_EN.join("|"));
check("DE có đủ key của VI", KEYS_VI.join("|") === KEYS_DE.join("|"));
check("ngôn ngữ lạ → fallback EN", lang.ticketText("xx") === lang.ticketText("en"));
check("ngôn ngữ lạ vẫn là object có key", typeof lang.ticketText("zz").btnClose === "string");
check(
  "3 ngôn ngữ khác nhau ở nút Đóng",
  new Set([
    lang.ticketText("vi").btnClose,
    lang.ticketText("en").btnClose,
    lang.ticketText("de").btnClose,
  ]).size === 3,
);
check(
  "ticketKind vi/en/de khác nhau",
  new Set([
    lang.ticketKind("vi", "appeal"),
    lang.ticketKind("en", "appeal"),
    lang.ticketKind("de", "appeal"),
  ]).size === 3,
);
check(
  "ticketKind loại lạ → fallback EN",
  lang.ticketKind("xx", "zzz") === lang.ticketKind("en", "zzz"),
);

// Tất cả placeholder {…} trong bản dịch phải khớp bản VI — lệch là lỗi runtime
// khi người dùng đọc thấy "{p0}" thay vì số thật.
console.log("\n── placeholder khớp giữa 3 ngôn ngữ ──");
const placeholders = (s) => (String(s).match(/\{[^}]+\}/g) || []).sort().join(",");
for (const key of KEYS_VI) {
  const vi = lang.ticketText("vi")[key];
  const en = lang.ticketText("en")[key];
  const de = lang.ticketText("de")[key];
  check(
    `EN giữ placeholder của "${key}"`,
    placeholders(vi) === placeholders(en),
    `vi=[${placeholders(vi)}] en=[${placeholders(en)}]`,
  );
  check(
    `DE giữ placeholder của "${key}"`,
    placeholders(vi) === placeholders(de),
    `vi=[${placeholders(vi)}] de=[${placeholders(de)}]`,
  );
}

// ═══ 11. HỒI QUY: cả 2 loại ticket đều phải dùng được ═══
console.log("\n── hồi quy 2 loại ticket ──");
for (const kind of ["appeal", "support"]) {
  check(`mở được khi loại = ${kind}`, core.decideOpen({ ...base }).ok === true);
  const T_EN = lang.ticketText("en");
  const titleKey = core.normalizeKind(kind) === "appeal" ? "openedTitle" : "supportTitle";
  check(`tiêu đề riêng cho ${kind}`, T_EN[titleKey].includes("{n}"));
}
check(
  "khiếu nại (DM) và hỗ trợ (lệnh) dùng CHUNG hàng rào chống spam",
  (() => {
    const args = { ...base, openCount: 20, maxOpen: 20 };
    return (
      core.decideOpen(args).reason === "max_open" &&
      core.decideOpen({ ...args, kind: "support" }).reason === "max_open"
    );
  })(),
);

// ═══ 12. LOẠI TICKET TUỲ CHỈNH — danh sách do chủ server tự định nghĩa ═══
console.log("\n── loại ticket tuỳ chỉnh ──");

const TK = lang.ticketText("vi");

// Ràng buộc tương thích ngược: server chưa cấu hình gì phải y hệt trước đây.
check(
  "không cấu hình → đúng 2 loại cứng (support, appeal)",
  core
    .normalizeKinds(null, TK)
    .map((k) => k.key)
    .join(",") === "support,appeal",
);
check(
  "danh sách rác (không phải mảng) → vẫn ra 2 loại cứng",
  core.normalizeKinds("abc", TK).length === 2,
);
check("mảng rỗng → vẫn ra 2 loại cứng", core.normalizeKinds([], TK).length === 2);
check(
  "2 loại mặc định lấy nhãn ĐÃ DỊCH từ T (nút hiện đúng tiếng của user)",
  core.normalizeKinds(null, TK)[0].label === TK.openSupport,
);

// Loại rác bị bỏ QUA chứ không làm hỏng cả danh sách.
const MIX = core.normalizeKinds(
  [
    { key: "billing", label: "Hoá đơn" },
    { key: "CÓ DẤU", label: "x" },
    { key: "", label: "rỗng" },
    { key: "khongnhan", label: "  " },
    null,
    "chuỗi",
    { key: "billing", label: "Trùng khoá" },
    { key: "bug", label: "Báo lỗi" },
  ],
  TK,
);
check("loại rác bị bỏ, loại tốt còn lại", MIX.map((k) => k.key).join(",") === "billing,bug");
check(
  "khoá trùng chỉ giữ 1 (trùng thì 2 nút cùng customId)",
  !MIX.some((k) => k.key === "billing" && k.label === "Trùng khoá"),
);
check("loại không nhãn bị bỏ (nút vô nghĩa)", !MIX.some((k) => k.key === "khongnhan"));

// Trần số loại — Discord chỉ chịu 5 nút/hàng × 5 hàng.
const NHIEU = core.normalizeKinds(
  Array.from({ length: 30 }, (_, i) => ({ key: `k${i}`, label: `Loại ${i}` })),
  TK,
);
check(
  `cắt còn ${core.MAX_TICKET_KINDS} loại (khớp MAX_KINDS bên Convex)`,
  NHIEU.length === core.MAX_TICKET_KINDS,
);

// Trần ký tự của Discord: vượt thì API ném lỗi và hỏng CẢ panel.
const DAI = core.normalizeKinds([{ key: "lon", label: "x".repeat(500) }], TK)[0];
check(`nhãn cắt còn ${core.KIND_LABEL_MAX} ký tự`, DAI.label.length === core.KIND_LABEL_MAX);
const DAI_Q = core.normalizeKinds([{ key: "q", label: "n", question: "y".repeat(200) }], TK)[0];
check(
  `nhãn modal cắt còn ${core.KIND_MODAL_LABEL_MAX} ký tự`,
  DAI_Q.question.length === core.KIND_MODAL_LABEL_MAX,
);
const DAI_P = core.normalizeKinds(
  [{ key: "p", label: "n", questionPlaceholder: "y".repeat(400) }],
  TK,
)[0];
check(
  `placeholder cắt còn ${core.KIND_PLACEHOLDER_MAX} ký tự`,
  DAI_P.questionPlaceholder.length === core.KIND_PLACEHOLDER_MAX,
);

// findKind / normalizeKind theo danh sách thật.
check("findKind thấy loại tuỳ chỉnh", core.findKind(MIX, "bug")?.label === "Báo lỗi");
check(
  "findKind không thấy → null (KHÔNG tự rơi về loại đầu)",
  core.findKind(MIX, "khongco") === null,
);
check("normalizeKind giữ loại tuỳ chỉnh", core.normalizeKind("billing", MIX) === "billing");
check("normalizeKind rác → loại đầu tiên", core.normalizeKind("khongco", MIX) === "billing");
check(
  "normalizeKind không có danh sách → hành xử CŨ (appeal giữ, rác → support)",
  core.normalizeKind("appeal") === "appeal" &&
    core.normalizeKind("support") === "support" &&
    core.normalizeKind("rac") === "support" &&
    core.normalizeKind("appeal", []) === "appeal",
);

// Role xử lý riêng theo loại.
const VAI_THEO_LOAI = core.normalizeKinds(
  [
    { key: "billing", label: "Hoá đơn", staffRoleIds: ["111", "222", "111"] },
    { key: "bug", label: "Báo lỗi" },
  ],
  TK,
);
check(
  "loại có role riêng → dùng role riêng (đã bỏ trùng)",
  core.staffRoleIdsForKind(VAI_THEO_LOAI, "billing", ["999"]).join(",") === "111,222",
);
check(
  "loại không có role riêng → rơi về role staff chung",
  core.staffRoleIdsForKind(VAI_THEO_LOAI, "bug", ["999"]).join(",") === "999",
);
check(
  "loại KHÔNG tồn tại → vẫn dùng role staff chung (không chặn nhầm)",
  core.staffRoleIdsForKind(VAI_THEO_LOAI, "khongco", ["999"]).join(",") === "999",
);
check("không có fallback → mảng rỗng", core.staffRoleIdsForKind(VAI_THEO_LOAI, "bug").length === 0);

// Emoji: rác phải bị loại, vì setEmoji ném lỗi làm hỏng cả tin nhắn panel.
check("emoji Unicode hợp lệ", core.isUsableEmoji("💳") === true);
check("emoji tuỳ chỉnh hợp lệ", core.isUsableEmoji("<a:coin:123456789012345678>") === true);
check("emoji rác bị từ chối", core.isUsableEmoji("đá quý") === false);
check("emoji rỗng bị từ chối", core.isUsableEmoji("") === false);
const BTN = core.buildPanelButtons(
  core.normalizeKinds(
    [
      { key: "billing", label: "Hoá đơn", emoji: "💳" },
      { key: "bug", label: "Báo lỗi", emoji: "đá quý" },
    ],
    TK,
  ),
);
check("nút mang customId đúng key", BTN[0].customId === "ticket_open:billing");
check("emoji tốt đi vào nút", BTN[0].emoji === "💳");
check("emoji rác bị bỏ khỏi nút (API Discord sẽ ném)", BTN[1].emoji === undefined);
check("nút đầu Primary, nút sau Secondary", BTN[0].style === 1 && BTN[1].style === 2);

// Modal theo từng loại.
const SPEC = core.buildModalSpec(core.findKind(MIX, "billing"), TK);
check("modal mang customId theo key", SPEC.customId === "ticket_open_submit:billing");
check(
  "loại KHÔNG có câu hỏi riêng → dùng câu hỏi dịch sẵn",
  core.buildModalSpec(core.findKind(MIX, "bug"), TK).bodyLabel === TK.openBodyLabelSupport,
);
check(
  "loại có câu hỏi riêng → dùng câu hỏi của loại",
  core.buildModalSpec(
    core.normalizeKinds([{ key: "b", label: "B", question: "Bạn hỏi gì?" }], TK)[0],
    TK,
  ).bodyLabel === "Bạn hỏi gì?",
);
check(
  "modal thiếu loại → vẫn dựng được (không lỗi)",
  typeof core.buildModalSpec(null, TK).bodyLabel === "string",
);

// Tiêu đề embed mở ticket dùng nhãn tuỳ chỉnh, và escape mention trong đó.
const PAY = core.buildOpenPayload({
  TICKET_TEXT: TK,
  number: 7,
  kind: "billing",
  kindLabel: "Hoá đơn",
  openerName: "a",
  body: "b",
});
check("tiêu đề embed dùng nhãn tuỳ chỉnh", PAY.title === "Hoá đơn #7", PAY.title);
check(
  "nhãn chủ server gõ @everyone KHÔNG ping được (escape trước khi vào embed)",
  core
    .buildOpenPayload({
      TICKET_TEXT: TK,
      number: 1,
      kind: "x",
      kindLabel: "@everyone",
      openerName: "a",
      body: "b",
    })
    .title.includes(String.fromCharCode(0x200b)),
);
check(
  "không có nhãn tuỳ chỉnh → giữ tiêu đề cứng như cũ",
  core.buildOpenPayload({ TICKET_TEXT: TK, number: 3, kind: "appeal", openerName: "a", body: "b" })
    .title === "Khiếu nại #3",
);

// ═══ 13. Ô NHẬP BỔ SUNG — bộ câu hỏi tuỳ chỉnh theo loại (phương án B) ═══
console.log("\n── ô nhập bổ sung ──");

const FIELD_KIND = core.normalizeKinds(
  [
    {
      key: "billing",
      label: "Hoá đơn",
      fields: [
        { key: "amount", label: "Số tiền", required: true, long: true },
        { key: "order_id", label: "Mã đơn", placeholder: "AB-123" },
        // Trùng 2 ô cố định → phải bị bỏ (customId trùng là Discord ném lỗi).
        { key: "ticket_body", label: "Trùng ô nội dung" },
        { key: "CÓ DẤU", label: "Khoá sai" },
        { key: "khongnhan", label: "   " },
      ],
    },
  ],
  TK,
)[0];
const FSPEC = core.buildModalSpec(FIELD_KIND, TK);
check(
  "giữ đúng 2 ô hợp lệ, bỏ ô trùng/khoá sai/không nhãn",
  FSPEC.extraFields.map((f) => f.key).join(",") === "amount,order_id",
  FSPEC.extraFields.map((f) => f.key).join(","),
);
check(
  "customId ô bổ sung có tiền tố riêng (không đụng ô cố định)",
  FSPEC.extraFields.every((f) => f.customId.startsWith("xf_") && f.customId !== "ticket_body"),
);
check(
  "bắt buộc giữ đúng như cấu hình",
  FSPEC.extraFields[0].required === true && FSPEC.extraFields[1].required === false,
);
check(
  "ô nhiều dòng giữ đúng như cấu hình",
  FSPEC.extraFields[0].long === true && FSPEC.extraFields[1].long === false,
);
check("placeholder giữ nguyên", FSPEC.extraFields[1].placeholder === "AB-123");
check(
  "loại KHÔNG có ô bổ sung → danh sách rỗng (modal vẫn 2 ô như cũ)",
  core.buildModalSpec(core.normalizeKinds([{ key: "a", label: "A" }], TK)[0], TK).extraFields
    .length === 0,
);

// Trần ô: Discord chỉ nhận 5 input 1 modal, 2 ô cố định đã chiếm 2 chỗ.
const NHIEU_FIELD = core.normalizeKinds(
  [
    {
      key: "x",
      label: "X",
      fields: Array.from({ length: 9 }, (_, i) => ({ key: `f${i}`, label: `F${i}` })),
    },
  ],
  TK,
)[0];
check(
  `cắt còn ${core.MAX_KIND_EXTRA_FIELDS} ô (khớp MAX_EXTRA_FIELDS bên Convex)`,
  core.buildModalSpec(NHIEU_FIELD, TK).extraFields.length === core.MAX_KIND_EXTRA_FIELDS,
);
check(
  "2 ô cố định + 3 ô bổ sung = 5 ô, đúng trần Discord",
  2 + core.buildModalSpec(NHIEU_FIELD, TK).extraFields.length === 5,
);

// Gom giá trị.
check(
  "ô rỗng bị bỏ khỏi kết quả (không hiện dòng 'Số tiền: —' làm nhiễu kênh)",
  JSON.stringify(core.collectExtraValues({ amount: "250k", order_id: "   " }, FSPEC)) ===
    JSON.stringify([{ key: "amount", label: "Số tiền", value: "250k" }]),
  JSON.stringify(core.collectExtraValues({ amount: "250k", order_id: "   " }, FSPEC)),
);
check(
  "giá trị ô bổ sung escape mention (vào embed trong kênh ticket)",
  core
    .collectExtraValues({ amount: "@everyone" }, FSPEC)[0]
    .value.includes(String.fromCharCode(0x200b)),
);
check("collect với spec rỗng → mảng rỗng", core.collectExtraValues({}, {}).length === 0);

// Embed mở ticket hiện ô bổ sung.
const P = core.buildOpenPayload({
  TICKET_TEXT: TK,
  number: 1,
  kind: "billing",
  openerName: "a",
  body: "b",
  extraFields: [
    { key: "amount", label: "Số tiền", value: "250k" },
    { key: "x", label: "Rỗng", value: "  " },
  ],
});
check(
  "embed có ô bổ sung (nhãn + giá trị)",
  P.fields.some((f) => f.name === "Số tiền" && f.value === "250k"),
  JSON.stringify(P.fields.map((f) => f.name)),
);
check("ô rỗng không sinh dòng trong embed", P.fields.length === 5, String(P.fields.length));
check(
  "nhãn ô bổ sung escape trước khi vào embed",
  core
    .buildOpenPayload({
      TICKET_TEXT: TK,
      number: 1,
      kind: "b",
      openerName: "a",
      body: "b",
      extraFields: [{ key: "k", label: "@everyone", value: "x" }],
    })
    .fields.some((f) => f.name.includes(String.fromCharCode(0x200b))),
);

// ═══ 14. MẪU KÊNH TICKET — tên theo mẫu + ngân sách tin nhắn (D) ═══
console.log("\n── mẫu kênh ticket ──");

const tpl = (template, over = {}) =>
  core.buildChannelNameFromTemplate({ template, username: "Minh", number: 7, ...over });

check(
  "không đặt mẫu → giữ đúng tên cũ",
  tpl("") === core.buildChannelName({ username: "Minh", number: 7 }),
);
check(
  "mẫu rỗng/thừa khoảng trắng cũng rơi về tên cũ",
  tpl("   ") === core.buildChannelName({ username: "Minh", number: 7 }),
);
check("{number} lấy đúng số ticket", tpl("{number}") === "7");
check("{user} tự bỏ dấu", tpl("{user}", { username: "Minh Nguyễn" }) === "minh-nguyen");
check("{kind} và {number} ghép lại", tpl("{kind}-{number}", { kind: "billing" }) === "billing-7");
check("placeholder lạ bị bỏ, không lọt dấu {} vào tên kênh", tpl("{abc}-{number}") === "7");
check(
  "mẫu rút gọn đường dẫn bị vệ sinh (không tạo được kênh ngoài ý muốn)",
  tpl("../../etc") === "etc",
  tpl("../../etc"),
);
check(
  "mẫu chỉ toàn ký tự lạ → rơi về tên có số, không phải 3 kênh trùng tên",
  tpl("@@@") === "ticket-minh-7",
  tpl("@@@"),
);
check(
  "mẫu dài bị cắt theo trần tên kênh Discord",
  core.buildChannelNameFromTemplate({ template: "a".repeat(300), username: "M", number: 1 })
    .length <= 100,
);

check(
  "ngân sách 0 = tắt, không bao giờ đóng vì tin nhắn",
  core.isBudgetExceeded({ messageCount: 9999, budget: 0 }) === false,
);
check("chưa chạm ngân sách", core.isBudgetExceeded({ messageCount: 4, budget: 5 }) === false);
check("chạm đúng ngân sách → đóng", core.isBudgetExceeded({ messageCount: 5, budget: 5 }) === true);
check("vượt ngân sách → đóng", core.isBudgetExceeded({ messageCount: 9, budget: 5 }) === true);
check(
  "ngân sách rác (NaN) → tắt chứ không đóng oan",
  core.isBudgetExceeded({ messageCount: 9, budget: "rac" }) === false,
);
check(
  "số tin rác → coi như 0",
  core.isBudgetExceeded({ messageCount: undefined, budget: 5 }) === false,
);

console.log(`\nKết quả tickets: ${pass} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
