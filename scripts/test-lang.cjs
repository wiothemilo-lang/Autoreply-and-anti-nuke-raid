// Test lang.js — tự chọn ngôn ngữ theo QUỐC GIA của server:
//   - langForLocale: locale có bản dịch (vi/en/de) → dùng; biến thể vùng
//     (en-US, pt-BR, de-AT…) quy về phần ngôn ngữ; quốc gia khác (ja, ko, ru…)
//     và rỗng/lạ → EN mặc định (riêng rỗng → VI, sản phẩm gốc tiếng Việt).
//   - langForGuild: đọc guild.preferredLocale dạng string lẫn object { code }.
//   - Template welcome/goodbye theo ngôn ngữ + fallback EN cho lang lạ.
// Hermetic: không mạng, không Discord SDK. Chạy: node scripts/test-lang.cjs

const lang = require("../bot/src/handlers/lang");

// /language + resolveUserLang dùng await ở cấp top-level → bọc toàn khối
// trong async IIFE để không làm hỏng CommonJS require.

let pass = 0,
  fail = 0;
function check(label, cond) {
  if (cond) {
    pass++;
    console.log("PASS", label);
  } else {
    fail++;
    console.log("FAIL", label);
  }
}

// ── langForLocale: quốc gia có bản dịch riêng ──
check("vi → vi", lang.langForLocale("vi") === "vi");
check("en → en", lang.langForLocale("en") === "en");
check("de → de", lang.langForLocale("de") === "de");

// ── biến thể vùng: quy về phần ngôn ngữ trước gạch nối ──
check("en-US → en", lang.langForLocale("en-US") === "en");
check("en-GB → en", lang.langForLocale("en-GB") === "en");
check("pt-BR → en (bản dịch pt chưa có)", lang.langForLocale("pt-BR") === "en");
check("de-AT → de", lang.langForLocale("de-AT") === "de");

// ── quốc gia chưa có bản dịch riêng → EN mặc định ──
check("ja → en", lang.langForLocale("ja") === "en");
check("ko → en", lang.langForLocale("ko") === "en");
check("ru → en", lang.langForLocale("ru") === "en");
check("zh-CN → en", lang.langForLocale("zh-CN") === "en");
check("fr → en", lang.langForLocale("fr") === "es" ? false : lang.langForLocale("fr") === "en");

// ── dữ liệu lạ không crash ──
check("rỗng → vi (mặc định sản phẩm)", lang.langForLocale("") === "vi");
check("undefined → vi", lang.langForLocale(undefined) === "vi");
check("null → vi", lang.langForLocale(null) === "vi");
check("dấu gạch dưới (en_US) → en", lang.langForLocale("en_US") === "en");
check("có khoảng trắng (  vi  ) → vi", lang.langForLocale("  vi  ") === "vi");

// ── langForGuild: guild thật (string) lẫn mock (object { code }) ──
check("guild string vi", lang.langForGuild({ preferredLocale: "vi" }) === "vi");
check(
  "guild object { code: 'en-US' }",
  lang.langForGuild({ preferredLocale: { code: "en-US" } }) === "en",
);
check("guild không có preferredLocale → vi", lang.langForGuild({}) === "vi");
check("guild null → vi", lang.langForGuild(null) === "vi");

// ── template welcome/goodbye theo ngôn ngữ ──
check("welcome vi giữ placeholder {user}", lang.welcomeDefault("vi").includes("{user}"));
check("welcome en khác bản vi", lang.welcomeDefault("en") !== lang.welcomeDefault("vi"));
check("goodbye de khác bản en", lang.goodbyeDefault("de") !== lang.goodbyeDefault("en"));
check("welcome lang lạ → fallback EN", lang.welcomeDefault("xx") === lang.welcomeDefault("en"));
check("goodbye lang lạ → fallback EN", lang.goodbyeDefault("zz") === lang.goodbyeDefault("en"));
// Placeholder bắt buộc phải đủ ở mọi bản dịch — fillTemplate phụ thuộc chúng.
for (const [code, tpl] of Object.entries({
  vi: lang.welcomeDefault("vi"),
  en: lang.welcomeDefault("en"),
  de: lang.welcomeDefault("de"),
})) {
  check(
    `welcome ${code} đủ 3 placeholder ({user}/{server}/{count})`,
    tpl.includes("{user}") && tpl.includes("{server}") && tpl.includes("{count}"),
  );
  check(
    `goodbye ${code} đủ 2 placeholder ({user}/{server})`,
    lang.goodbyeDefault(code).includes("{user}") && lang.goodbyeDefault(code).includes("{server}"),
  );
}

// ── SUPPORTED khớp số bản dịch template ──
check("SUPPORTED = vi,en,de", [...lang.SUPPORTED].sort().join(",") === "de,en,vi");

// ── resolveUserLang + /language ──
// Lý do cần: hai hàm này chạy ở MỌI tin nhắn và ở /language, nhưng chưa có
// test nào chạm tới → một nhánh hỏng ở đây chỉ lộ ra trên production.
// Ưu tiên lựa chọn đã lưu là điều kiện cốt lõi: người dùng đã nói rõ
// "tôi muốn tiếng Việt" thì đổi client sang English KHÔNG được lật ngược.
void (async () => {
  const mkStore = (savedLang) => ({
    client: {
      query: async () => (savedLang ? { lang: savedLang } : null),
      mutation: async () => ({ ok: true }),
    },
  });
  const mkInteraction = (opts = {}) => ({
    user: { id: "u1", locale: opts.locale ?? "en-US" },
    guild: opts.guild === null ? null : { id: "g1", preferredLocale: opts.guildLocale ?? "vi" },
    options: {
      getString: (name) => (name === "ngon_ngu" ? (opts.option ?? null) : null),
    },
    replies: [],
    reply: async function (r) {
      this.replies.push(r);
      return r;
    },
  });

  // 1) Lựa chọn đã lưu thắng locale client VÀ locale guild.
  check(
    "resolveUserLang: lựa chọn đã lưu thắng mọi thứ",
    (await lang.resolveUserLang(mkStore("de"), mkInteraction({ locale: "en-US" }), {})) === "de",
  );
  // 2) Chưa lưu → tự nhận ra từ locale client.
  check(
    "resolveUserLang: chưa lưu → locale client",
    (await lang.resolveUserLang(mkStore(null), mkInteraction({ locale: "de-AT" }), {})) === "de",
  );
  // 3) Lưu ngôn ngữ KHÔNG hỗ trợ (rác trong DB) → bỏ qua, tự nhận ra.
  check(
    "resolveUserLang: giá trị rác trong DB bị bỏ qua",
    (await lang.resolveUserLang(mkStore("xx"), mkInteraction({ locale: "en-US" }), {})) === "en",
  );
  // 4) Mất mạng (query throw) → fail-open sang tự nhận ra, không crash.
  const brokenStore = {
    client: {
      query: async () => {
        throw new Error("mạng chết");
      },
      mutation: async () => ({ ok: true }),
    },
  };
  check(
    "resolveUserLang: query lỗi → fail-open, không throw",
    (await lang.resolveUserLang(brokenStore, mkInteraction({ locale: "vi" }), {})) === "vi",
  );

  // 5) /language không có option → báo ngôn ngữ hiện tại, ephemeral.
  const i1 = mkInteraction();
  const r1 = await lang.languageCommand(mkStore("de"), i1);
  check("/language: không option → báo hiện tại", /Deutsch/.test(r1.content));
  check("/language: không option → ephemeral", r1.ephemeral === true);

  // 6) /language có option hợp lệ → GHI xuống DB, trả lời bằng ngôn ngữ MỚI.
  const written = [];
  const store2 = {
    client: {
      query: async () => ({ lang: "vi" }),
      mutation: async (name, args) => {
        written.push([name, args]);
        return { ok: true };
      },
    },
  };
  const r2 = await lang.languageCommand(store2, mkInteraction({ option: "en" }));
  check(
    "/language: đổi ngôn ngữ → gọi botSetUserLang",
    written.length === 1 && written[0][0] === "bot_writes:botSetUserLang",
  );
  check(
    "/language: đổi ngôn ngữ → lưu đúng mã",
    written[0]?.[1]?.lang === "en" && written[0]?.[1]?.userId === "u1",
  );
  check("/language: đổi ngôn ngữ → trả lời bằng ngôn ngữ mới", /English/i.test(r2.content));

  // 7) Option rác (choices ở client nhưng dữ liệu cũ/script có thể gửi) →
  //    KHÔNG ghi, báo lại ngôn ngữ hiện tại.
  const r3 = await lang.languageCommand(
    { client: { query: async () => ({ lang: "vi" }), mutation: async () => ({ ok: true }) } },
    mkInteraction({ option: "fr" }),
  );
  check(
    "/language: option lạ → báo lại hiện tại, không báo đã đặt",
    !/đã đặt|set/i.test(r3.content),
  );

  // 8) Ghi lỗi → vẫn trả lời (người dùng không phải biết lỗi kỹ thuật).
  const failStore = {
    client: {
      query: async () => ({ lang: "vi" }),
      mutation: async () => {
        throw new Error("convex down");
      },
    },
  };
  const r4 = await lang.languageCommand(failStore, mkInteraction({ option: "de" }));
  check(
    "/language: ghi lỗi → vẫn trả lời cho người dùng",
    typeof r4.content === "string" && r4.content.length > 0,
  );

  console.log(`\nKết quả lang: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
})();
