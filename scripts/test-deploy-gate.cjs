#!/usr/bin/env node
/**
 * test-deploy-gate.cjs — chặn tái diễn bug cổng deploy của guardrail (19/09/2026).
 *
 * Bug thật: guardrail chặn `pm2 restart protogon-bot` / `npx convex deploy` tới khi
 * phiên chạy đủ 4 lớp kiểm chứng xanh. Nhưng 2 lỗi khiến cổng KHÔNG BAO GIỜ mở:
 *   1) `tool.execute.after` đọc nhầm field: output.args/output.result thay vì
 *      input.args.command + output.output (API opencode v1.18.31) → command luôn
 *      undefined → isFullVerifyRun luôn false.
 *   2) Dò lỗi bằng substring "fail " → output XANH hợp lệ ("0 FAIL",
 *      "PASS case3: all fail →") khớp nhầm → kể cả đọc đúng field vẫn chặn.
 *
 * Bug thật thứ 3 (11/10/2026 — nâng OpenCode V1 → V2): plugin viết theo API V1
 * (export hàm `GuardrailsPlugin()` trả object hook "tool.execute.before") KHÔNG
 * còn được V2 nạp — log: "Plugin must export a default definition with an id
 * and an effect or setup function" → guardrail chết IM LẶNG, không chặn gì cả.
 *
 * Test nạp CHÍNH plugin thật và gọi đúng hook theo API V2 (default export
 * `{ id, setup }`, hook đăng ký qua ctx.tool.hook) — không copy logic vì copy
 * sẽ lệch khi API đổi. Mỗi kịch bản dùng module instance MỚI để cổng (biến
 * verifiedAt cấp module) bắt đầu ở trạng thái đóng.
 */
const path = require("path");
const { pathToFileURL } = require("url");

let pass = 0;
let fail = 0;
function check(name, ok) {
  if (ok) {
    pass++;
    console.log(`PASS ${name}`);
  } else {
    fail++;
    console.log(`FAIL ${name}`);
  }
}

const PLUGIN_URL = pathToFileURL(
  path.join(__dirname, "..", ".opencode", "plugins", "guardrails.js"),
).href;

const FULL_CMD = "bun run test && bun tsc -b --noEmit && bun run lint && bun run format:check";

// Output XANH y hệt runner thật in — CỐ TÌNH chứa "0 FAIL" và "all fail" để
// bắt đúng dạng dương tính giả đã gây bug.
const GREEN_OUT = [
  "✅ test-ai-fallback (0.1s) — PASS case3: all fail → offline an toàn",
  "✅ test-backup-utils (1.3s) — Kết quả backup utils: 37 PASS, 0 FAIL",
  "✅ 51/51 suites pass (47.1s)",
  "All matched files use Prettier code style!",
].join("\n");

const RED_OUT = [
  "❌ test-something — THẤT BẠI",
  "   FAIL expected 1 got 2",
  "❌ 50/51 suites pass (12.0s)",
  "Suites thất bại: test-something",
].join("\n");

/** Module instance mới mỗi lần → verifiedAt = 0 (cổng đóng). */
let instance = 0;

/**
 * Nạp plugin thật + dựng ctx giả đúng shape V2: hook() chỉ ghi lại callback
 * để test gọi tay như Core sẽ gọi. Lấy mod kèm hooks để kiểm chứng đăng ký.
 */
async function freshHooks() {
  instance++;
  const mod = await import(`${PLUGIN_URL}?v=${instance}`);
  const hooks = { tool: {}, session: {} };
  await mod.default.setup({
    tool: { hook: async (name, cb) => void (hooks.tool[name] = cb) },
    session: { hook: async (name, cb) => void (hooks.session[name] = cb) },
  });
  return { mod, hooks };
}

/** Gọi hook execute.before đúng event V2 (tool shell, input.command). */
async function beforeCommand(hooks, command, tool = "shell") {
  await hooks.tool["execute.before"]({ tool, input: { command } });
}

/** Chạy hook after đúng event V2 rồi thử mở cổng — trả true nếu cổng cho qua. */
async function gateAfterRun(command, output, { status = "completed", tool = "shell" } = {}) {
  const { hooks } = await freshHooks();
  if (command !== null) {
    await hooks.tool["execute.after"]({
      tool,
      input: { command },
      status,
      result: status === "completed" ? { content: output } : undefined,
      error: status === "completed" ? undefined : { message: output },
    });
  }
  try {
    await beforeCommand(hooks, "pm2 restart protogon-bot");
    return true;
  } catch {
    return false;
  }
}

(async () => {
  // ── 0. Plugin phải theo đúng API V2 — đây là cổng chặn "plugin chết im lặng". ──
  {
    const { mod, hooks } = await freshHooks();
    check(
      "plugin V2: default export có id + setup (bản V1 từng làm plugin KHÔNG nạp)",
      mod.default && typeof mod.default.id === "string" && typeof mod.default.setup === "function",
    );
    check(
      "plugin không import @opencode/plugin (plugin local không resolve được gói đó)",
      !/from\s+["']@opencode\/plugin["']/.test(
        require("fs").readFileSync(
          path.join(__dirname, "..", ".opencode", "plugins", "guardrails.js"),
          "utf8",
        ),
      ),
    );
    check(
      "setup đăng ký đủ 3 hook: execute.before/after + compaction",
      typeof hooks.tool["execute.before"] === "function" &&
        typeof hooks.tool["execute.after"] === "function" &&
        typeof hooks.session["compaction"] === "function",
    );
    // Hook compaction là bản V2 của experimental.session.compacting — nhắc hợp
    // đồng AGENTS.md khi session bị nén. Thiếu nó là mất mục 2 của plugin.
    const probe = { system: [] };
    await hooks.session["compaction"](probe);
    check(
      "hook compaction đẩy hợp đồng AGENTS.md vào system",
      probe.system.length > 0 && probe.system[0].text.includes("AGENTS.md"),
    );
  }

  // ── 0b. Guardrail phải chặn CẢ "protogon" lẫn "protogon-bot" khi cổng đóng
  // (tài liệu từng ghi sai tên "protogon"; nếu regex chỉ khớp 1 tên thì lệnh
  // dùng tên kia sẽ lọt cổng — test này khóa cả hai). ──
  {
    const { hooks } = await freshHooks();
    for (const name of ["protogon", "protogon-bot"]) {
      let blocked = false;
      try {
        await beforeCommand(hooks, `pm2 restart ${name}`);
      } catch {
        blocked = true;
      }
      check(`chặn restart "${name}" khi chưa kiểm chứng`, blocked === true);
    }
  }

  // ── 0c. Tên tool đổi giữa bản: V1 "bash" → V2 "shell". Plugin phải khớp cả
  // hai, nếu không upgraded Core là lớp chặn biến mất. ──
  {
    const { hooks } = await freshHooks();
    for (const tool of ["shell", "bash"]) {
      let blocked = false;
      try {
        await beforeCommand(hooks, "pm2 restart protogon-bot", tool);
      } catch {
        blocked = true;
      }
      check(`chặn restart khi tool tên "${tool}"`, blocked === true);
    }
  }

  // ── 0d. Convex MCP envGet/envList đọc secret production, KHÔNG qua shell —
  // permission theo tên lệnh trong opencode.json không phủ. Guardrail phải
  // chặn theo TÊN TOOL trong execute.before (chặn hồi quy lỗ hổng MCP). ──
  {
    const { hooks } = await freshHooks();
    for (const tool of [
      "mcp__convex__envGet",
      "mcp__convex__envList",
      "convex.envGet",
      "convex.envList",
      "envGet",
      "envList",
    ]) {
      let blocked = false;
      try {
        await hooks.tool["execute.before"]({ tool, input: {} });
      } catch {
        blocked = true;
      }
      check(`chặn Convex MCP tool "${tool}" (đọc secret production)`, blocked === true);
    }
    // Tool KHÔNG chứa envGet/envList phải KHÔNG bị chặn (không chặn nhầm).
    let wronglyBlocked = false;
    try {
      await hooks.tool["execute.before"]({ tool: "mcp__convex__tables", input: {} });
    } catch {
      wronglyBlocked = true;
    }
    check("không chặn nhầm Convex MCP tool khác (tables)", wronglyBlocked === false);
  }

  // ── 1. Chưa chạy gì → cổng đóng ──
  check("cổng đóng khi chưa kiểm chứng", (await gateAfterRun(null, "")) === false);

  // ── 2. Lệnh thiếu lớp → không mở ──
  check(
    "lệnh chỉ có test (thiếu 3 lớp) → không mở cổng",
    (await gateAfterRun("bun run test", GREEN_OUT)) === false,
  );

  // ── 3. Đủ 4 lớp nhưng output ĐỎ → không mở ──
  check(
    "đủ 4 lớp nhưng output đỏ (run-all-tests) → không mở cổng",
    (await gateAfterRun(FULL_CMD, RED_OUT)) === false,
  );

  // ── 3b. Đủ 4 lớp, output xanh nhưng lệnh THOÁT LỖI (status error) → không mở.
  // Bản V1 đọc output bất kể lỗi → cổng mở dù verify chết giữa chừng. ──
  check(
    "status error (exit khác 0) dù output xanh → không mở cổng",
    (await gateAfterRun(FULL_CMD, GREEN_OUT, { status: "error" })) === false,
  );

  // ── 4. Đủ 4 lớp, output XANH (chứa "0 FAIL"/"all fail") → MỞ ──
  check(
    "đủ 4 lớp + output xanh → MỞ cổng restart",
    (await gateAfterRun(FULL_CMD, GREEN_OUT)) === true,
  );

  // ── 4b. Output dạng mảng content (Core đổi cách bọc output) vẫn soi được ──
  check(
    "output dạng mảng {type:text} → vẫn mở cổng khi xanh",
    (await gateAfterRun(FULL_CMD, [
      { type: "text", text: GREEN_OUT },
      { type: "text", text: "All matched files use Prettier code style!" },
    ])) === true,
  );

  // ── 5. Output đỏ của từng tool riêng vẫn bị chặn ──
  for (const [label, red] of [
    ["tsc", "src/a.ts(1,2): error TS2322: Type 'x' is not assignable.\nFound 1 error."],
    ["eslint", '✖ 3 problems (3 errors, 0 warnings)\nerror: script "lint" exited with code 1'],
    ["prettier", "[warn] src/a.ts\nCode style issues found in the above file."],
  ]) {
    check(`output đỏ kiểu ${label} → không mở cổng`, (await gateAfterRun(FULL_CMD, red)) === false);
  }

  // ── 6. Cổng mở cũng cho qua npx convex deploy ──
  {
    const { hooks } = await freshHooks();
    await hooks.tool["execute.after"]({
      tool: "shell",
      input: { command: FULL_CMD },
      status: "completed",
      result: { content: GREEN_OUT },
    });
    let convexOk = true;
    try {
      await beforeCommand(hooks, "npx convex deploy");
    } catch {
      convexOk = false;
    }
    check("cổng mở → cho qua npx convex deploy", convexOk === true);
  }

  // ── 7. Vá cổng KHÔNG nới lỏng denylist secret/infra ──
  {
    const { hooks } = await freshHooks();
    for (const [label, cmd] of [
      ["đọc .env", "cat bot/.env"],
      ["printenv", "printenv"],
      ["systemctl cat", "systemctl cat protogon-bot"],
      ["docker inspect", "docker inspect abc"],
    ]) {
      let blocked = false;
      try {
        await beforeCommand(hooks, cmd);
      } catch {
        blocked = true;
      }
      check(`vẫn chặn: ${label}`, blocked === true);
    }
  }

  // ── 8. smoke-vps phải THỰC SỰ nạp bot/.env + tìm thấy discord.js ──
  // Bug thật 05/10/2026 (dựng VPS mới): smoke-vps chỉ `require(...)` loadenv.js
  // mà không gọi loadEnv() → bot/.env bị bỏ qua im lặng, 2 biến bắt buộc luôn ❌;
  // và require("discord.js") từ scripts/ không dò tới bot/node_modules → luôn
  // "Cannot find module". Smoke báo "loadenv.js nạp xong" trong khi chưa nạp gì.
  {
    const fs = require("fs");
    const src = fs.readFileSync(path.join(__dirname, "smoke-vps.cjs"), "utf8");
    // Bỏ comment dòng trước khi so khớp — nếu không, chính dòng comment giải
    // thích bug sẽ khớp regex và làm cổng báo xanh giả.
    const code = src
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, ""))
      .join("\n");

    check("smoke-vps gọi loadEnv() chứ không chỉ require loadenv.js", /\.loadEnv\(\)/.test(code));
    check(
      "smoke-vps KHÔNG còn require loadenv.js kiểu treo bỏ",
      !/require\([^;]*"loadenv\.js"\)\s*;/.test(code),
    );
    check(
      "smoke-vps resolve discord.js từ gốc bot (createRequire)",
      /createRequire\(path\.join\(__dirname, "..", "bot", "package\.json"\)\)/.test(code) &&
        /botRequire\("discord\.js"\)/.test(code),
    );
    check(
      'smoke-vps KHÔNG còn require("discord.js") trần ở scripts/',
      !/require\("discord\.js"\)/.test(code),
    );
    // Chốt nguyên tắc gốc: loadenv.js KHÔNG tự chạy khi require.
    const le = require(path.join(__dirname, "..", "bot", "src", "loadenv.js"));
    check(
      "bot/src/loadenv.js chỉ export loadEnv, không tự nạp khi require",
      typeof le.loadEnv === "function",
    );
  }

  // ── 9. TOÀN BỘ scripts/ + bot/: không file nào require loadenv mà quên gọi ──
  // Cùng lớp bug như smoke-vps nhưng áp cho MỌI file. `require("loadenv")` trần
  // là code chạy được nhưng im lặng không nạp .env — dạng lỗi mà review mắt thường
  // bỏ sót vì "có require vẫn thấy loadenv.js trong file".
  {
    const fs = require("fs");
    const roots = [path.join(__dirname), path.join(__dirname, "..", "bot", "src")];
    const offenders = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          walk(p);
          continue;
        }
        if (!/\.(c?js)$/.test(e.name)) continue;
        const code = fs
          .readFileSync(p, "utf8")
          .split("\n")
          .map((l) => l.replace(/\/\/.*$/, ""))
          .join("\n");
        // require loadenv mà KHÔNG kèm .loadEnv() ngay sau → treo bỏ.
        // KHÔNG đặt `"` trước `loadenv`: dạng `require("../bot/src/loadenv.js")`
        // chỉ có quote ở ĐẦU chuỗi, không có quote ngay trước "loadenv".
        // Bản cũ có `"` đó → không bao giờ khớp → cổng luôn xanh (vô dụng).
        if (/require\([^;]*loadenv(?:\.js)?"\)\s*;/.test(code)) {
          offenders.push(path.relative(path.join(__dirname, ".."), p));
        }
      }
    };
    for (const r of roots) walk(r);
    // check() chỉ nhận 2 tham số (tên, ok) → nhét danh sách file vi phạm VÀO
    // chính tên, nếu không test đỏ mà không ai biết file nào sai.
    check(
      offenders.length === 0
        ? "không script nào require loadenv mà quên gọi loadEnv()"
        : `require loadenv mà quên loadEnv() ở: ${offenders.join(", ")}`,
      offenders.length === 0,
    );
  }

  console.log(`\nKết quả deploy gate: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
