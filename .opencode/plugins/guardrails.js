// Plugin guardrails cho OpenCode — lớp bảo vệ chủ động song song với permission.
//
// Permission trong opencode.json chặn theo TÊN file/lệnh; plugin này chặn theo
// HÀNH VI thực sự: lệnh bash tìm cách đọc nội dung env/secret (cat, grep, tail,
// redirect từ file env…), kể cả khi agent tự tạo file mới rồi dùng lệnh đọc nó.
// Kèm theo: giữ "hợp đồng" AGENTS.md không bị mai một khi session dài bị nén.
//
// Lấy cảm hứng từ cơ chế Keys/Environment của Freebuff: agent không bao giờ tự// đọc được giá trị secret — cần thì phải hỏi người dùng.

const SECRET_HINTS = [".env", ".bot-key", "auth.json", "id_rsa", "credentials.json"];

function looksLikeSecretAccess(command) {
  const cmd = command.toLowerCase();
  // Đọc trực tiếp file secret qua cat/less/tail/head/grep/xxod…
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
      ". ",
    ];
    if (readers.some((r) => cmd.includes(r))) return true;
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
  /\/proc\/\d+\/environ/, // env của process khác
  /\bprintenv\b/, // dump env shell — chứa key provider của OpenCode
  /^\s*env\s*[|>]/, // `env | ...` = dump toàn bộ env ra stdout
  /\bCONVEX_DEPLOY_KEY\s*=/, // không in/nhét key deploy Convex ra lệnh
];

function looksLikeInfraLeak(command) {
  const cmd = command.toLowerCase();
  return INFRA_LEAK_PATTERNS.some((re) => re.test(cmd));
}

// Deploy bot (pm2 restart protogon-bot) là hành động production — chỉ cho qua khi
// phiên đã chạy đủ bộ kiểm chứng xanh. Agent ghi dấu bằng biến môi trường
// GUARDRAIL_VERIFIED=1 ngay sau khi test/typecheck/lint/format đạt; plugin chỉ
// chấp nhận dấu trong 15 phút (đủ cho 1 nhịp deploy, hết hạn phải chạy lại).
// Số suites phải khớp AGENTS.md Pha 4 — đổi suite phải sửa CẢ HAI chỗ.
// ⚠️ Đếm theo `bun run test` (suite .cjs). Suite .ts chạy ở `bun run test:ts`
// và KHÔNG cộng vào đây — nếu cộng nhầm thì con số lệch 1 và cả hai chỗ
// cùng sai.
const CONTRACT_SUITES = 84;
let verifiedAt = 0;
const VERIFY_WINDOW_MS = 15 * 60 * 1000;

function verifyGateActive() {
  return verifiedAt > 0 && Date.now() - verifiedAt < VERIFY_WINDOW_MS;
}

// Dấu hiệu LỖI THẬT do các runner in ra khi đỏ. TUYỆT ĐỐI không dùng substring
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

// Chỉ tính là kiểm chứng khi lệnh chạy trọn bộ 4 lớp và KHÔNG có dấu hiệu lỗi.
function isFullVerifyRun(command, output) {
  const cmd = String(command ?? "").toLowerCase();
  const text = String(output ?? "");
  const hasAll =
    cmd.includes("bun run test") &&
    (cmd.includes("tsc") || cmd.includes("typecheck")) &&
    cmd.includes("lint") &&
    (cmd.includes("format:check") || cmd.includes("format"));
  if (!hasAll) return false;
  return !FAIL_PATTERNS.some((re) => re.test(text));
}

export const GuardrailsPlugin = async () => {
  return {
    // 1) Chặn lệnh bash đọc secret trước khi nó chạy
    "tool.execute.before": async (input, output) => {
      const command = output.args.command || "";
      if (input.tool === "bash" && looksLikeSecretAccess(command)) {
        throw new Error(
          "GUARDRAIL: Lệnh này có dấu hiệu đọc nội dung file secret (.env/.bot-key/key). " +
            "Theo AGENTS.md điều khoản 1: DỪNG và hỏi người dùng cung cấp giá trị nếu cần. " +
            "Không tìm lối tắt khác để đọc secret.",
        );
      }
      if (input.tool === "bash" && looksLikeInfraLeak(command)) {
        throw new Error(
          "GUARDRAIL: Lệnh này chạm vào chỗ chứa secret của hạ tầng (unit file systemd " +
            "có Environment=, env của container/process, env của shell). Chẩn đoán bằng " +
            "status/journalctl/docker logs/df/free là đủ; cần giá trị env cụ thể thì " +
            "hỏi người dùng (AGENTS.md điều khoản 1 + bảng vùng quyền 🟢🟡🔴).",
        );
      }
      // Chặn restart bot khi chưa đủ điều kiện — bot là production thật.
      // Tên process thật là "protogon-bot"; vẫn khớp "protogon" để chặn cả
      // lệnh gõ thiếu (trước đây tài liệu ghi sai tên nên agent gõ nhầm).
      if (input.tool === "bash" && /^\s*pm2\s+restart\s+protogon(-bot)?\b/.test(command)) {
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
      if (input.tool === "bash" && /(^|\s|&&)(npx|bunx|bun)\s+convex\s+deploy\b/.test(command)) {
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
    },

    // 1.5) Quan sát kết quả bash — phiên chạy đủ bộ kiểm chứng xanh thì mở
    //      cổng deploy-bot trong 15 phút (xem VERIFY_WINDOW_MS).
    //      API v1.18.31: lệnh nằm ở input.args.command, output ở output.output
    //      (trước đây đọc nhầm output.args/output.result → luôn undefined →
    //      cổng không bao giờ mở dù 4 lớp xanh).
    "tool.execute.after": async (input, output) => {
      const cmd = input?.args?.command;
      if (input.tool === "bash" && isFullVerifyRun(cmd, output?.output)) {
        verifiedAt = Date.now();
      }
    },

    // 2) Khi session dài bị nén (compaction), nhắc lại hợp đồng làm việc để
    //    agent không "quên" quy trình 5 pha sau nhiều lượt hội thoại.
    "experimental.session.compacting": async (input, output) => {
      output.context.push(
        [
          "## Hợp đồng cần nhớ (từ AGENTS.md)",
          "- Workflow 5 pha: Hiểu → Kế hoạch (todo) → Thực hiện → Xác minh → Báo cáo+commit",
          "- Bị gián đoạn rồi được bảo continue/tiếp đi → TIẾP TỤC ĐÚNG CHỖ DỪNG (xem git diff + todo), không làm lại từ đầu; đi đến khi đủ kiểm chứng xanh + báo cáo mới dừng",
          `- Xong việc = test xanh toàn bộ (hiện ${CONTRACT_SUITES} suites — khớp AGENTS.md; thêm/xoá suite phải sửa CẢ HAI) + typecheck + lint XANH, chưa chạy thật thì không claim xanh`,
          "- Không đọc secret (.env/.bot-key/key) — cần thì hỏi người dùng; kể cả qua hạ tầng: systemctl cat/show, docker inspect/exec, /proc/*/environ, printenv đều cấm",
          "- Hạ tầng VPS 3 vùng: 🟢 TỰ LÀM — chẩn đoán (systemctl status, journalctl, docker ps/logs, df, free) + sửa rồi tự restart kiira-retry-proxy + curl /__health thấy ok:true; restart bot `pm2 restart protogon-bot` và deploy `npx convex deploy` CHỈ sau khi pull + kiểm chứng đủ 4 lớp xanh (guardrail tự mở cổng 15 phút) — sau restart bot phải pm2 status online + logs không crash; thiếu CONVEX_DEPLOY_KEY → nhờ người dùng export, không in key; 🟡 IN LỆNH nhờ người dùng — docker restart, dịch vụ khác; 🔴 CẤM — ufw/iptables, reboot, prune",
          "- Được git add + commit + push origin main (tiếng Việt, footer 🤖 Generated with OpenCode) — push CHỈ sau khi cả 3 kiểm chứng XANH trong phiên",
          "- Bug thuộc engine đã có test → bắt buộc thêm test chặn tái diễn",
          "- Đổi tên/di chuyển function Convex (bot gọi bằng tên chuỗi) → grep sửa cả 2 phía + chạy scripts/check-convex-contract.cjs; đụng convex/schema.ts → skill schema-migration-safety (2 client lệch pha ~1 phút)",
        ].join("\n"),
      );
    },
  };
};
