// TEST: bot/src/register-slash.js — đăng ký slash command lên Discord.
// Chạy: node scripts/test-register-slash.cjs
//
// Vì sao suite này tồn tại, và vì sao nghiêm trọng:
//
//   `PUT /applications/{id}/commands` là THAY THẾ TOÀN BỘ, không phải thêm
//   từng lệnh. Nên chỉ cần MỘT lệnh sai shape là Discord trả 400 và bot mất
//   TRẦN lệnh — kể cả những lệnh đang chạy tốt. Đó là kiểu chết âm thầm:
//   code đúng hết, không lỗi log cục bộ, chỉ "gõ lệnh không thấy".
//
//   File này trước đây có 0% coverage vì nó chỉ chạy lúc bot boot. Rủi ro thứ
//   hai: `DISCORD_CLIENT_ID` rác (dán nhầm, copy còn khoảng trắng) cũng khiến
//   PUT 400 → mất toàn bộ lệnh. Không có bước nào kiểm tra trước khi bắn.
//
// Vì vậy test ở đây kiểm 2 tầng:
//   1. Shape của `commands` theo đúng giới hạn Discord API (tự viết lại,
//      không cần network).
//   2. `registerCommands` — route, body, và chuyện clientId rác.
const Module = require("module");

// register-slash.js require("discord.js") chỉ để dựng REST khi không truyền
// rest vào; test LUÔN truyền rest giả nên chỉ cần Routes trả về đúng route.
const origLoad = Module._load;
Module._load = function (request, ..._args) {
  if (request === "discord.js") {
    return {
      REST: class {},
      Routes: { applicationCommands: (id) => `/applications/${id}/commands` },
    };
  }
  return origLoad.apply(this, arguments);
};

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  ok ? pass++ : fail++;
};

// Env phải set TRƯỚC require: `loadEnv()` không ghi đè biến đã có, và chỉ chạy
// một lần lúc nạp module. Snowflake giả — chỉ để đi qua regex, không gọi API.
process.env.DISCORD_CLIENT_ID = "123456789012345678";
const { registerCommands, commands } = require("../bot/src/register-slash.js");

// ═══ Tầng 1: shape của `commands` theo giới hạn Discord API ═══
console.log("── shape lệnh theo giới hạn Discord API ──");

const NAME_RE = /^[\w-]{1,32}$/;
const problems = [];

/** Kiểm 1 option/subcommand và mọi option con của nó. */
function checkOption(opt, pathLabel, depth) {
  if (typeof opt.name !== "string" || !NAME_RE.test(opt.name)) {
    problems.push(`${pathLabel}: tên "${opt.name}" không hợp lệ (1-32 ký tự, a-z 0-9 _ -)`);
  }
  if (typeof opt.description !== "string" || opt.description.length < 1) {
    problems.push(`${pathLabel}: thiếu description (Discord bắt buộc)`);
  } else if (opt.description.length > 100) {
    problems.push(`${pathLabel}: description ${opt.description.length} ký tự (>100)`);
  }
  if (opt.type === undefined || typeof opt.type !== "number") {
    problems.push(`${pathLabel}: thiếu type`);
  }
  // Mọi bản dịch mô tả cũng bị giới hạn 100 ký tự, lỗi này chỉ lộ lúc deploy.
  for (const [loc, text] of Object.entries(opt.description_localizations || {})) {
    if (typeof text !== "string" || text.length > 100) {
      problems.push(`${pathLabel}: description_localizations.${loc} dài ${String(text).length}`);
    }
  }
  if (opt.choices) {
    if (!Array.isArray(opt.choices) || opt.choices.length < 1 || opt.choices.length > 25) {
      problems.push(`${pathLabel}: choices phải có 1-25 phần tử`);
    } else {
      for (const ch of opt.choices) {
        // ⚠️ KHÁC tên lệnh/option: choice name được phép có dấu tiếng Việt và
        // khoảng trắng (vd "Bật", "Button — bấm nút xác minh"). Chỉ giới hạn
        // độ dài. Dùng chung NAME_RE ở đây là validator SAI — từng khiến test đỏ
        // giả và dễ dẫn tới sửa nhầm code đang đúng.
        if (typeof ch.name !== "string" || ch.name.length < 1 || ch.name.length > 32) {
          problems.push(`${pathLabel}: choice thiếu tên hợp lệ (1-32 ký tự)`);
        }
        if (ch.value === undefined) problems.push(`${pathLabel}: choice thiếu value`);
      }
    }
  }
  // Option lồng nhau chỉ hợp lệ ở subcommand group (type 1), tối đa 25 mỗi cấp.
  if (opt.options) {
    if (depth >= 1) {
      problems.push(`${pathLabel}: có option con ở cấp sâu quá (Discord chỉ cho 1 cấp)`);
    }
    if (!Array.isArray(opt.options) || opt.options.length < 1) {
      problems.push(`${pathLabel}: options rỗng`);
    } else if (opt.options.length > 25) {
      problems.push(`${pathLabel}: ${opt.options.length} option (>25)`);
    } else {
      for (const child of opt.options)
        checkOption(child, `${pathLabel} > ${child.name}`, depth + 1);
    }
  }
}

if (!Array.isArray(commands) || commands.length === 0) {
  problems.push("commands không phải mảng / rỗng");
} else {
  if (commands.length > 100) problems.push(`${commands.length} lệnh (>100 giới hạn Discord)`);
  const seen = new Set();
  for (const c of commands) {
    if (typeof c.name !== "string" || !NAME_RE.test(c.name)) {
      problems.push(`tên lệnh "${c.name}" không hợp lệ`);
    }
    if (seen.has(c.name)) problems.push(`trùng tên lệnh "${c.name}"`);
    seen.add(c.name);
    if (typeof c.description !== "string" || c.description.length < 1) {
      problems.push(`/${c.name}: thiếu description`);
    } else if (c.description.length > 100) {
      problems.push(`/${c.name}: description ${c.description.length} ký tự (>100)`);
    }
    for (const [loc, text] of Object.entries(c.description_localizations || {})) {
      if (typeof text !== "string" || text.length > 100) {
        problems.push(`/${c.name}: description_localizations.${loc} dài ${String(text).length}`);
      }
    }
    for (const opt of c.options || []) checkOption(opt, `/${c.name} ${opt.name}`, 0);
  }
}

check(
  `toàn bộ ${commands.length} lệnh đúng shape Discord (PUT là thay thế toàn bộ)`,
  problems.length === 0,
  problems.slice(0, 6).join(" | "),
);

// `/backup keep` phải CÓ TRONG danh sách đăng ký — nếu handler xử lý được mà
// lệnh không được đăng ký thì người dùng gõ `/backup keep` không thấy gì, và
// đó là kiểu chết âm thầm mà shape check ở trên không bắt được.
{
  const backup = commands.find((c) => c.name === "backup");
  const keep = backup?.options?.find((o) => o.name === "keep");
  check("/backup có subcommand keep", !!keep, JSON.stringify(backup?.options?.map((o) => o.name)));
  const count = keep?.options?.find((o) => o.name === "count");
  const days = keep?.options?.find((o) => o.name === "days");
  check(
    "/backup keep có option count (bắt buộc, số nguyên)",
    count?.type === 4 && count.required === true,
    JSON.stringify(count),
  );
  check(
    "/backup keep có option days (tuỳ chọn, số nguyên)",
    days?.type === 4 && days.required === false,
    JSON.stringify(days),
  );
}

// ── Autocomplete: option bật `autocomplete: true` phải hợp lệ với Discord ──
// Discord CHỈ cho autocomplete trên STRING(3)/INTEGER(4)/NUMBER(10) và CẤM
// dùng chung với `choices`. Sai shape → PUT 400 → mất TRẦN lệnh câm.
{
  const AUTOCOMPLETE_TYPES = new Set([3, 4, 10]);
  const autoProblems = [];
  const found = [];
  const walk = (opt, path) => {
    if (opt.autocomplete === true) {
      found.push(path);
      if (!AUTOCOMPLETE_TYPES.has(opt.type)) {
        autoProblems.push(`${path}: type ${opt.type} không hỗ trợ autocomplete`);
      }
      if (opt.choices) autoProblems.push(`${path}: autocomplete + choices là không hợp lệ`);
    }
    for (const child of opt.options || []) walk(child, `${path}/${child.name}`);
  };
  for (const c of commands) for (const opt of c.options || []) walk(opt, `/${c.name} ${opt.name}`);
  check(
    "mọi option autocomplete đúng shape Discord (type 3/4/10, không choices)",
    autoProblems.length === 0,
    autoProblems.join(" | "),
  );
  check(
    "có option autocomplete được bật (gợi ý khi gõ lệnh)",
    found.length >= 4,
    `found=${found.length}`,
  );
}

// ═══ Tầng 2: registerCommands ═══
console.log("\n── registerCommands ──");

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

function fakeRest() {
  const calls = [];
  return {
    calls,
    put: async (route, init) => {
      calls.push({ route, init });
      return [{ name: "x" }];
    },
  };
}

(async () => {
  {
    const rest = fakeRest();
    const n = await registerCommands(rest);
    check(
      "gửi đúng route applicationCommands",
      rest.calls[0]?.route?.includes(CLIENT_ID),
      rest.calls[0]?.route,
    );
    check("body đúng bằng danh sách lệnh", rest.calls[0]?.init?.body === commands);
    check("trả về số lệnh đã đăng ký", n === 1);
  }
  {
    // Thiếu clientId → bỏ qua, KHÔNG bắn API (giữ được lệnh cũ).
    const saved = process.env.DISCORD_CLIENT_ID;
    delete process.env.DISCORD_CLIENT_ID;
    const rest = fakeRest();
    const n = await registerCommands(rest);
    check("thiếu DISCORD_CLIENT_ID → bỏ qua", n === 0 && rest.calls.length === 0);
    process.env.DISCORD_CLIENT_ID = saved;
  }
  {
    // ⚠️ ClientId rác: Discord trả 400 → mất TRẦN lệnh. Phải chặn TRƯỚC
    // khi bắn, không phải để Discord trả lỗi.
    for (const bad of ["abc", "123", "12345678901234567890abc", "12345678901234567899999999"]) {
      const saved = process.env.DISCORD_CLIENT_ID;
      process.env.DISCORD_CLIENT_ID = bad;
      const rest = fakeRest();
      const n = await registerCommands(rest);
      check(
        `clientId rác "${bad}" → không bắn API, trả 0`,
        n === 0 && rest.calls.length === 0,
        `calls=${rest.calls.length}`,
      );
      process.env.DISCORD_CLIENT_ID = saved;
    }
  }
  {
    // ClientId hợp lệ 17-20 chữ số vẫn phải đăng ký được.
    process.env.DISCORD_CLIENT_ID = "12345678901234567";
    const rest = fakeRest();
    const n = await registerCommands(rest);
    check("clientId snowflake hợp lệ → vẫn đăng ký", n === 1 && rest.calls.length === 1);
    process.env.DISCORD_CLIENT_ID = CLIENT_ID;
  }
  {
    // Khoảng trắng thừa (hay do copy từ .env hoặc panel hosting) PHẢI được
    // chấp nhận sau khi trim — đây là lỗi cấu hình phổ biến, không phải lý do
    // để bỏ qua đăng ký.
    process.env.DISCORD_CLIENT_ID = " 123456789012345678 ";
    const rest = fakeRest();
    const n = await registerCommands(rest);
    check(
      "clientId có khoảng trắng thừa → trim rồi đăng ký",
      n === 1 && rest.calls[0]?.route?.includes("123456789012345678"),
    );
    process.env.DISCORD_CLIENT_ID = CLIENT_ID;
  }

  // ── Dựng REST từ env khi KHÔNG truyền rest vào ──
  // Đây là đường bot thật sự dùng lúc boot (index.js gọi registerCommands()
  // không tham số). Trước đây test luôn truyền rest giả nên nhánh này không
  // phủ: thiếu token lúc deploy = bot start lên rồi im, không đăng ký lệnh.
  {
    const realLoad = Module._load;
    let built = 0;
    Module._load = function (request, ..._args) {
      if (request === "discord.js") {
        return {
          REST: class {
            constructor() {
              built++;
            }
            setToken() {
              return this;
            }
          },
          Routes: { applicationCommands: (id) => `/applications/${id}/commands` },
        };
      }
      return realLoad.apply(this, arguments);
    };
    const savedTok = process.env.DISCORD_TOKEN;
    process.env.DISCORD_TOKEN = "fake-token-for-test";
    const rest = fakeRest();
    try {
      const n = await registerCommands(rest);
      check(
        "có rest.put dùng rest truyền vào, KHÔNG dựng REST mới",
        built === 0 && n === 1,
        `built=${built}`,
      );
    } finally {
      Module._load = realLoad;
      if (savedTok === undefined) delete process.env.DISCORD_TOKEN;
      else process.env.DISCORD_TOKEN = savedTok;
    }
  }
  {
    // Không rest + không token → phải NÉM lỗi rõ ràng, không im lặng bỏ qua
    // (bỏ qua im lặng = bot lên nhưng mất trần slash command).
    const realLoad = Module._load;
    Module._load = function (request, ..._args) {
      if (request === "discord.js") {
        return {
          REST: class {
            setToken() {
              return this;
            }
          },
          Routes: { applicationCommands: (id) => `/applications/${id}/commands` },
        };
      }
      return realLoad.apply(this, arguments);
    };
    const savedTok = process.env.DISCORD_TOKEN;
    delete process.env.DISCORD_TOKEN;
    let msg = "";
    try {
      await registerCommands(null);
    } catch (e) {
      msg = e.message;
    } finally {
      Module._load = realLoad;
      if (savedTok !== undefined) process.env.DISCORD_TOKEN = savedTok;
    }
    check(
      "không rest + thiếu DISCORD_TOKEN → ném lỗi nêu đích danh",
      msg.includes("DISCORD_TOKEN"),
      msg,
    );
  }

  // ── Nhánh CLI: chạy file thật như subprocess ──
  // main() không export nên không gọi được trong process này (và cũng không
  // nên — nó tự process.exit). Chạy node thật là cách duy nhất phủ trung thực.
  {
    const { spawnSync } = require("child_process");
    const run = (env) =>
      spawnSync(process.execPath, [require.resolve("../bot/src/register-slash.js")], {
        env: { ...process.env, ...env },
        encoding: "utf8",
      });
    const good = run({ DISCORD_CLIENT_ID: "123456789012345678", DISCORD_TOKEN: "x" });
    check(
      "CLI chạy tới bước đăng ký mà không crash kiểu ReferenceError/TypeError",
      !good.error &&
        (good.status === 0 || good.status === 1) &&
        !/\bReferenceError\b|\bTypeError\b/.test(good.stderr || ""),
      `status=${good.status} stderr=${(good.stderr || "").slice(0, 200)}`,
    );
    // Cảnh báo đi qua console.warn → stderr, KHÔNG phải stdout. Exit 0 là điều
    // kiện quan trọng: bot đăng ký lệnh hỏng mà exit ≠ 0 sẽ làm pm2 restart
    // liên tục, tệ hơn nhiều so với bỏ qua và giữ lệnh cũ.
    const noId = run({ DISCORD_CLIENT_ID: "", DISCORD_TOKEN: "x" });
    check(
      "CLI thiếu clientId → cảnh báo + exit 0 (không chết bot)",
      noId.status === 0 &&
        (noId.stderr || "").includes("DISCORD_CLIENT_ID") &&
        (noId.stdout || "").includes("0"),
      `status=${noId.status} err=${(noId.stderr || "").slice(0, 200)}`,
    );
    const badId = run({ DISCORD_CLIENT_ID: "banana", DISCORD_TOKEN: "x" });
    check(
      "CLI clientId rác → cảnh báo rõ ràng, KHÔNG bắn API",
      badId.status === 0 && (badId.stderr || "").includes("snowflake"),
      `status=${badId.status} err=${(badId.stderr || "").slice(0, 200)}`,
    );
  }

  console.log(`\nKết quả register-slash: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
})();
