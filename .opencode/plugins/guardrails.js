// Plugin guardrails cho OpenCode — lớp bảo vệ chủ động song song với permission.
//
// Permission trong opencode.json chặn theo TÊN file/lệnh; plugin này chặn theo
// HÀNH VI thực sự: lệnh bash tìm cách đọc nội dung env/secret (cat, grep, tail,
// redirect từ file env…), kể cả khi agent tự tạo file mới rồi dùng lệnh đọc nó.
// Kèm theo: giữ "hợp đồng" AGENTS.md không bị mai một khi session dài bị nén.
//
// ⚠️ Dạng plugin V2 (OpenCode 2.x): default export `{ id, setup(ctx) }` — hook
// đăng ký qua ctx.tool.hook / ctx.session.hook. Bản V1 (export hàm trả về object
// hook "tool.execute.before") KHÔNG được nạp nữa: log báo
// "Plugin must export a default definition with an id and an effect or setup
// function" và plugin chết ÂM THẦM (03/10/2026). KHÔNG import "@opencode/plugin"
// — plugin local không resolve được gói đó (đã xác minh: ResolveMessage), chỉ
// cần object thường là đủ.
//
// Tên tool đổi giữa 2 bản: V1 "bash" → V2 "shell" (permission map cũ vẫn được
// V2 tự chuẩn hoá). Plugin khớp CẢ HAI tên để không mất lớp chặn nếu đổi bản.

const SHELL_TOOLS = new Set(["shell", "bash"]);

// Convex MCP envGet/envList đọc TRỰC TIẾP env secret của deployment production
// (KIRA_API_KEY, CONVEX_DEPLOY_KEY…) mà KHÔNG qua shell — permission theo tên
// lệnh trong opencode.json không phủ, SHELL_TOOLS cũng không khớp. Đây là lỗ
// hổng thực sự (đọc được secret production nếu agent gọi MCP tool). Chặn theo
// tên tool trong hook execute.before — tool name của Convex MCP chứa "envGet"
// hoặc "envList" (kiểu mcp__convex__envGet / convex.envGet).
const CONVEX_ENV_TOOLS = /env(get|list)/i;

const SECRET_HINTS = [".env", ".bot-key", "auth.json", "id_rsa", "credentials.json"];

// Tách chuỗi lệnh thành từng segment theo &&, ||, ;, |, xuống dòng — TÔN TRỌNG
// quote để `git commit -m "…; pm2 restart …"` không bị cắt giữa chuỗi.
// Dùng chung cho denylist secret lẫn cổng deploy.
function commandSegments(command) {
  const s = String(command ?? "");
  const out = [];
  let buf = "";
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      buf += ch;
      if (ch === "\\" && i + 1 < s.length) {
        buf += s[++i];
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === "\\" && i + 1 < s.length) {
      buf += ch + s[++i];
      continue;
    }
    if ((ch === "&" && s[i + 1] === "&") || (ch === "|" && s[i + 1] === "|")) {
      out.push(buf);
      buf = "";
      i++;
      continue;
    }
    if (ch === ";" || ch === "\n" || ch === "|") {
      out.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  out.push(buf);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** Tokenize 1 segment, bỏ quote bao ngoài (không xử lý escape phức tạp). */
function shellTokens(segment) {
  const out = [];
  let buf = "";
  let quote = null;
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (quote) {
      if (ch === quote) quote = null;
      else buf += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (buf) out.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}

const SHELLS = new Set(["bash", "sh", "zsh", "dash", "fish"]);

/** Nếu segment là `bash -c "<lệnh>"` thì trả lệnh bên trong, ngược lại null. */
function shellInner(segment) {
  const tokens = shellTokens(segment);
  let i = 0;
  if (tokens[i]?.split("/").pop() === "sudo") {
    i++;
    while (i < tokens.length && tokens[i].startsWith("-")) i++;
  }
  if (!SHELLS.has(tokens[i]?.split("/").pop() ?? "")) return null;
  if (tokens[i + 1] !== "-c" || tokens[i + 2] === undefined) return null;
  return tokens.slice(i + 2).join(" ");
}

function looksLikeSecretAccess(command) {
  const raw = String(command ?? "").toLowerCase();
  // `.env.example` / `.sample` / `.template` / `.dist` là file mẫu, không chứa
  // secret thật — bỏ trước khi dò để không chặn nhầm `cat .env.example`.
  const cmd = raw.replace(/\.env\.(?:example|sample|template|dist)/g, "");
  // Đọc trực tiếp file secret qua cat/less/tail/head/grep/sed/awk…
  if (SECRET_HINTS.some((hint) => cmd.includes(hint))) {
    const readers = [
      "cat ",
      "less ",
      "more ",
      "head ",
      "tail ",
      "grep ",
      "rg ",
      "xxd",
      "base64 ",
      "strings ",
      "print ",
      "source ",
      "sed ",
      "awk ",
      "dd ",
      "od ",
      "cut ",
      "nl ",
      "hexdump",
      "perl ",
    ];
    if (readers.some((r) => cmd.includes(r))) return true;
    // `. .env` (source) — neo đầu segment để không chặn nhầm dấu chấm câu.
    if (/(^|[;&|]\s*)\.\s+/.test(cmd)) return true;
    // Redirect nội dung secret ra ngoài: `cp .env`, `< .env`, `$(< .env)`
    if (cmd.includes("cp ") || cmd.includes("< ") || cmd.includes("$(")) return true;
  }
  // Dump cả thư mục chứa secret
  if (cmd.includes("tar ") && cmd.includes(".env")) return true;
  return false;
}

// Rò secret QUA HẠ TẦNG — đường vòng mà permission theo tên lệnh có thể lọt
// khi lệnh bị ghép chuỗi (a && b). Unit file systemd chứa Environment=<token>,
// container chứa env riêng, process khác chứa env trong /proc — agent được
// chẩn đoán hạ tầng nhưng KHÔNG được soi các chỗ này.
const INFRA_LEAK_PATTERNS = [
  /systemctl\s+(cat|show)\s/, // unit file → Environment= chứa KIRA/bot key
  /docker\s+(inspect|exec|cp)\s/, // env container / copy file ra khỏi container
  /\/proc\/(?:self|\d+|\$\$)\/environ/, // env của process khác/chính shell
  /\bprintenv\b/, // dump env shell — chứa key provider của OpenCode
  // lower-case vì `cmd` đã lowercase — pattern chữ HOA cũ không bao giờ khớp.
  /\bconvex_deploy_key\b/, // không in/nhét key deploy Convex ra lệnh
];

/** `env`, `env -0`, `sudo env -i` (không kèm lệnh) = dump toàn bộ env. */
function isBareEnv(segment) {
  const tokens = shellTokens(segment);
  let i = 0;
  if (tokens[i]?.split("/").pop() === "sudo") {
    i++;
    while (i < tokens.length && tokens[i].startsWith("-")) i++;
  }
  if (tokens[i]?.split("/").pop() !== "env") return false;
  i++;
  while (i < tokens.length && tokens[i].startsWith("-")) i++;
  return i >= tokens.length;
}

function looksLikeInfraLeak(command) {
  const cmd = String(command ?? "").toLowerCase();
  if (INFRA_LEAK_PATTERNS.some((re) => re.test(cmd))) return true;
  for (const seg of commandSegments(cmd)) {
    const inner = shellInner(seg);
    if (inner !== null) {
      if (looksLikeInfraLeak(inner)) return true;
      continue;
    }
    if (isBareEnv(seg)) return true;
  }
  return false;
}

// Deploy bot (pm2 restart protogon-bot) là hành động production — chỉ cho qua khi
// phiên đã chạy đủ bộ kiểm chứng xanh. Agent ghi dấu bằng biến môi trường
// GUARDRAIL_VERIFIED=1 ngay sau khi test/typecheck/lint/format đạt; plugin chỉ
// chấp nhận dấu trong 15 phút (đủ cho 1 nhịp deploy, hết hạn phải chạy lại).
// Số suites phải khớp AGENTS.md Pha 4 — đổi suite phải sửa CẢ HAI chỗ.
// ⚠️ Đếm theo `bun run test` (suite .cjs). Suite .ts chạy ở `bun run test:ts`
// và KHÔNG cộng vào đây — nếu cộng nhầm thì con số lệch 1 và cả hai chỗ
// cùng sai.
const CONTRACT_SUITES = 89;
let verifiedAt = 0;
const VERIFY_WINDOW_MS = 15 * 60 * 1000;

function verifyGateActive() {
  return verifiedAt > 0 && Date.now() - verifiedAt < VERIFY_WINDOW_MS;
}

// Dấu hiệu LỖI THẬT do các runners in ra khi đỏ. TUYỆT ĐỐI không dùng substring
// thô kiểu "fail " — output XANH hợp lệ chứa "0 FAIL" và
// "PASS case3: all fail →" sẽ khớp nhầm, khiến cổng deploy KHÔNG BAO GIỜ mở
// (bug thật 19/09/2026: 4 lớp xanh nhưng guardrail vẫn chặn restart vô hạn).
const FAIL_PATTERNS = [
  /❌/, // run-all-tests in khi có suite thất bại
  /Suites thất bại:/, // dòng tổng kết đỏ của run-all-tests
  /\bTHẤT BẠI\b/, // suite tự báo đỏ
  /error TS\d+/, // tsc — lỗi biên dịch
  /Found \d+ error/, // tsc — dòng tổng kết
  /✖\s+\d+\s+problem/, // eslint
  /Code style issues found/, // prettier
  /error: script .+ exited with code [1-9]/, // bun/npm script thoát khác 0
];

// Chỉ tính là kiểm chứng khi lệnh chạy TRỌN bộ 4 lớp và KHÔNG có dấu hiệu lỗi.
// Mỗi segment phải khớp CHÍNH XÁC whitelist — trước đây dùng `includes()` nên
// `bun run test:ts` (31 suite TS) khớp "bun run test" và mở cổng dù chưa chạy
// 89 suite .cjs; `echo "bun run test tsc lint format:check"` cũng mở cổng.
const VERIFY_SEGMENTS = [
  /^git pull(?: --[a-z-]+)*$/,
  /^git status$/,
  /^bun install$/,
  /^bun run test(?: --serial)?$/,
  /^bun tsc -b --noemit$/, // segment đã lowercase
  /^bun run typecheck$/,
  /^bun run lint$/,
  /^bun run format:check$/,
];

function isFullVerifyRun(command, output) {
  const text = String(output ?? "");
  if (FAIL_PATTERNS.some((re) => re.test(text))) return false;
  // Bằng chứng DƯƠNG: đúng số suite hợp đồng + prettier xanh. Output bị cắt
  // hoặc chỉ chạy `test:ts` thì không có dòng tổng kết → cổng ĐÓNG (fail-closed).
  if (!new RegExp(`\\b${CONTRACT_SUITES}/${CONTRACT_SUITES}\\s+suites pass\\b`).test(text)) {
    return false;
  }
  if (!/All matched files use Prettier code style!/.test(text)) return false;

  const segments = commandSegments(String(command ?? "")).map((s) => s.trim().toLowerCase());
  if (segments.length === 0) return false;
  const seen = { test: false, tsc: false, lint: false, format: false };
  for (const seg of segments) {
    if (!VERIFY_SEGMENTS.some((re) => re.test(seg))) return false;
    if (/^bun run test(?: --serial)?$/.test(seg)) seen.test = true;
    else if (/^bun (?:tsc -b --noemit|run typecheck)$/.test(seg)) seen.tsc = true;
    else if (seg === "bun run lint") seen.lint = true;
    else if (seg === "bun run format:check") seen.format = true;
  }
  return seen.test && seen.tsc && seen.lint && seen.format;
}

// Lệnh chỉ đọc text (git/grep/echo…) — bỏ qua khi dò pm2/convex để không chặn
// nhầm commit message hay lệnh grep tài liệu. Lệnh thật trong segment khác vẫn
// bị kiểm (echo x; pm2 restart → segment pm2 vẫn khớp).
const TEXT_ONLY_SEGMENTS = /^(git|grep|rg|echo|printf|cat|sed|awk|less|more|head|tail|man)\b/;

const PM2_MUTATING = new Set(["restart", "reload", "stop", "delete", "start", "kill", "resurrect"]);

function isPm2Mutation(segment) {
  const tokens = shellTokens(segment);
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].split("/").pop() !== "pm2") continue;
    return PM2_MUTATING.has((tokens[i + 1] ?? "").toLowerCase());
  }
  return false;
}

function isConvexDeploy(segment) {
  const tokens = shellTokens(segment);
  for (let i = 0; i < tokens.length; i++) {
    const base = tokens[i].split("/").pop().replace(/@.*$/, "");
    if (base !== "convex") continue;
    let j = i + 1;
    while (j < tokens.length && tokens[j].startsWith("-")) j++;
    if ((tokens[j] ?? "").toLowerCase() === "deploy") return true;
  }
  return false;
}

/** Dò cả lệnh lồng trong `bash -c "…"`; bỏ qua segment chỉ đọc text. */
function containsGateBypass(command, predicate) {
  for (const seg of commandSegments(command)) {
    const inner = shellInner(seg);
    if (inner !== null) {
      if (containsGateBypass(inner, predicate)) return true;
      continue;
    }
    if (TEXT_ONLY_SEGMENTS.test(seg.trim())) continue;
    if (predicate(seg)) return true;
  }
  return false;
}

// Lệnh của tool shell/bash nằm ở event.input.command (V2: input là object tool
// input; V1: nằm ở output.args.command). Thiếu trường này → coi như rỗng, tức
// không bao giờ mở cổng (fail-closed).
function commandOf(event) {
  const input = event?.input;
  const raw = input?.command ?? input?.args?.command;
  return typeof raw === "string" ? raw : "";
}

// Trích text output của tool shell để soi dấu hiệu lỗi. Tool.Result của V2 có
// `content` (string | mảng {type:"text",text}) hoặc `output` (chuỗi/obj stdout)
// — đọc cả hai để không vỡ khi Core đổi cách bọc output.
function resultText(result) {
  if (!result || typeof result !== "object") return "";
  const { content, output } = result;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part.text === "string" ? part.text : ""))
      .join("\n");
  }
  if (typeof output === "string") return output;
  if (output && typeof output === "object") {
    return [output.stdout, output.stderr, output.output]
      .filter((s) => typeof s === "string")
      .join("\n");
  }
  return "";
}

// Hợp đồng nhắc lại khi session bị nén — y hệt nội dung bản V1 push vào
// output.context của experimental.session.compacting (V2: system của yêu cầu
// tóm tắt, hook "compaction").
const CONTRACT_REMINDER = [
  "## Hợp đồng cần nhớ (từ AGENTS.md)",
  "- Workflow 5 pha: Hiểu → Kế hoạch (todo) → Thực hiện → Xác minh → Báo cáo+commit",
  "- Bị gián đoạn rồi được bảo continue/tiếp đi → TIẾP TỤC ĐÚNG CHỖ DỪNG (xem git diff + todo), không làm lại từ đầu; đi đến khi đủ kiểm chứng xanh + báo cáo mới dừng",
  `- Xong việc = test xanh toàn bộ (hiện ${CONTRACT_SUITES} suites — khớp AGENTS.md; thêm/xoá suite phải sửa CẢ HAI) + typecheck + lint XANH, chưa chạy thật thì không claim xanh`,
  "- Không đọc secret (.env/.bot-key/key) — cần thì hỏi người dùng; kể cả qua hạ tầng: systemctl cat/show, docker inspect/exec, /proc/*/environ, printenv đều cấm",
  "- Hạ tầng VPS 3 vùng: 🟢 TỰ LÀM — chẩn đoán (systemctl status, journalctl, docker ps/logs, df, free) + sửa rồi tự restart kiira-retry-proxy + curl /__health thấy ok:true; restart bot `pm2 restart protogon-bot` và deploy `npx convex deploy` CHỈ sau khi pull + kiểm chứng đủ 4 lớp xanh (guardrail tự mở cổng 15 phút) — sau restart bot phải pm2 status online + logs không crash; thiếu CONVEX_DEPLOY_KEY → nhờ người dùng export, không in key; 🟡 IN LỆNH nhờ người dùng — docker restart, dịch vụ khác; 🔴 CẤM — ufw/iptables, reboot, prune",
  "- Được git add + commit + push NHÁNH RIÊNG + mở PR (tiếng Việt, footer 🤖 Generated with OpenCode) — push CHỈ sau khi cả 3 kiểm chứng XANH trong phiên; merge `--rebase` khi CI xanh + MERGEABLE/CLEAN; KHÔNG push thẳng `main`",
  "- Bug thuộc engine đã có test → bắt buộc thêm test chặn tái diễn",
  "- Đổi tên/di chuyển function Convex (bot gọi bằng tên chuỗi) → grep sửa cả 2 phía + chạy scripts/check-convex-contract.cjs; đụng convex/schema.ts → skill schema-migration-safety (2 client lệch pha ~1 phút)",
].join("\n");

export default {
  id: "guardrails",

  async setup(ctx) {
    // 1) Chặn lệnh bash đọc secret trước khi nó chạy (V2: throw = chặn)
    await ctx.tool.hook("execute.before", async (event) => {
      // Chặn Convex MCP envGet/envList — đọc secret production, không qua shell.
      if (CONVEX_ENV_TOOLS.test(event.tool ?? "")) {
        throw new Error(
          "GUARDRAIL: Convex MCP envGet/envList đọc trực tiếp env secret của deployment " +
            "production (KIRA_API_KEY, CONVEX_DEPLOY_KEY…). Theo AGENTS.md điều khoản 1: " +
            "KHÔNG đọc secret — cần giá trị env cụ thể thì hỏi người dùng cung cấp.",
        );
      }
      if (!SHELL_TOOLS.has(event.tool)) return;
      const command = commandOf(event);
      if (looksLikeSecretAccess(command)) {
        throw new Error(
          "GUARDRAIL: Lệnh này có dấu hiệu đọc nội dung file secret (.env/.bot-key/key). " +
            "Theo AGENTS.md điều khoản 1: DỪNG và hỏi người dùng cung cấp giá trị nếu cần. " +
            "Không tìm lối tắt khác để đọc secret.",
        );
      }
      if (looksLikeInfraLeak(command)) {
        throw new Error(
          "GUARDRAIL: Lệnh này chạm vào chỗ chứa secret của hạ tầng (unit file systemd " +
            "có Environment=, env của container/process, env của shell). Chẩn đoán bằng " +
            "status/journalctl/docker logs/df/free là đủ; cần giá trị env cụ thể thì " +
            "hỏi người dùng (AGENTS.md điều khoản 1 + bảng vùng quyền 🟢🟡🔴).",
        );
      }
      // Chặn restart/reload/stop/delete process pm2 khi chưa đủ điều kiện —
      // bot là production thật, service khác thuộc vùng 🟡 (hỏi trước). Regex
      // cũ neo `^\s*` nên `sudo pm2`, `cd && pm2`, `pm2 reload`, `pm2 restart all`
      // đều lọt. Nay tokenize từng segment, bỏ qua segment chỉ đọc text.
      if (containsGateBypass(command, isPm2Mutation)) {
        if (!verifyGateActive()) {
          throw new Error(
            "GUARDRAIL: Chưa đủ điều kiện restart bot. Quy trình bắt buộc (AGENTS.md " +
              "điều khoản 3 — bot trong vùng 🟢 có rào cản): chạy `git pull " +
              "--no-rebase --no-edit` → `bun install` (nếu lockfile đổi) → kiểm chứng " +
              "đủ `bun run test` + typecheck + lint + format:check XANH → rồi mới " +
              "`pm2 restart protogon-bot`. Sau restart phải `pm2 status` thấy online + " +
              "`pm2 logs protogon-bot --lines 20 --nostream` không có crash loop.",
          );
        }
      }
      // Deploy Convex cũng là hành động production — cùng cổng kiểm chứng.
      // Nhận mọi runner (npx/bunx/bun x/pnpm exec/yarn) và `convex@version`,
      // kể cả khi lồng trong `bash -c`.
      if (containsGateBypass(command, isConvexDeploy)) {
        if (!verifyGateActive()) {
          throw new Error(
            "GUARDRAIL: Chưa đủ điều kiện deploy Convex. Quy trình bắt buộc: chạy " +
              "đủ `bun run test` + typecheck + lint + format:check XANH trong phiên " +
              "(cửa 15 phút) rồi mới `npx convex deploy`. Nếu lệnh báo thiếu " +
              "CONVEX_DEPLOY_KEY → DỪNG, nhờ người dùng thêm key vào môi trường " +
              "(export trong shell, không dán key vào chat hay file trong repo) — " +
              "không tìm lối tắt quanh guardrail.",
          );
        }
      }
    });

    // 1.5) Quan sát kết quả shell — phiên chạy đủ bộ kiểm chứng XANH TRỌN VẸN
    //      thì mở cổng deploy-bot trong 15 phút (xem VERIFY_WINDOW_MS).
    //      V2: command ở event.input.command, output ở event.result (chỉ khi
    //      status === "completed"). LỆCH BẢN V1: trước đây đọc output.output
    //      bất kể lỗi → lệnh chết giữa chừng (exit khác 0) mà output vẫn còn
    //      khớp 4 lớp là cổng mở; bản này FAIL-CLOSED: status lỗi → không mở.
    await ctx.tool.hook("execute.after", async (event) => {
      if (!SHELL_TOOLS.has(event.tool)) return;
      if (event.status !== "completed") return;
      if (isFullVerifyRun(commandOf(event), resultText(event.result))) {
        verifiedAt = Date.now();
      }
    });

    // 2) Khi session dài bị nén (compaction), nhắc lại hợp đồng làm việc để
    //    agent không "quên" quy trình 5 pha sau nhiều lượt hội thoại.
    //    V1: experimental.session.compacting push vào output.context (ngữ cảnh
    //    gắn vào prompt tóm tắt). V2: hook "compaction" — system của yêu cầu
    //    tóm tắt (tóm tắt sinh ra chính là ngữ cảnh agent thấy sau khi nén).
    await ctx.session.hook("compaction", async (event) => {
      event.system.push({ type: "text", text: CONTRACT_REMINDER });
    });
  },
};
