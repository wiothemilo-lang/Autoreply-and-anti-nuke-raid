/**
 * simulate-attack.ts — MÔ PHỎNG KẺ TẤN CÔNG (DDoS/abuse) chạy OFFLINE 100%.
 *
 * ── Vì sao offline ─────────────────────────────────────────────────────────
 * Sandbox/CI không có quyền — và cũng không nên — bắn lưu lượng tấn công thật
 * vào deployment hay VPS. Tấn công thật (dù để test) cần sự cho phép rõ ràng và
 * có thể gây hại cho hạ tầng hoặc cho người khác. Cách làm ở đây an toàn tuyệt
 * đối: gọi TRỰC TIẾP các hàm phòng thủ THẬT trong repo và mô phỏng vòng lặp tấn
 * công y như kẻ xấu sẽ làm — không mở socket, không gửi request ra ngoài, không
 * đọc secret.
 *
 * Đây KHÔNG phải một test suite (không nằm trong `bun run test`): nó là công cụ
 * chạy tay, in ra "báo cáo tấn công" để soi từng chốt phòng thủ khi cần điều tra.
 *
 * Chạy:  bun scripts/simulate-attack.ts
 * Thoát 0 khi MỌI chốt giữ vững; thoát 1 khi có chốt bị xuyên thủng (dùng được
 * làm cổng kiểm tra tay trong phiên debug).
 *
 * Tài liệu kèm theo: docs/vps-security-hardening.md (mục "Giả lập DDoS").
 */
import fs from "node:fs";
import path from "node:path";
import { rateLimitPublicAction, __resetRateGuardForTest } from "../convex/rateGuard";
import {
  allowVerifyRequest,
  __resetHttpRateGuardForTest,
  VERIFY_MAX_PER_IP_PER_MIN,
  VERIFY_MAX_GLOBAL_PER_MIN,
} from "../convex/httpRateGuard";
import { isPublicIp, parseClientIp } from "../convex/clientIp";
import { isExternalAppSpam, messageFingerprint } from "../bot/src/externalAppGuard.js";
import { isAuthLoopTarget, resolveAuthPageState } from "../src/lib/authRoute";

const ROOT = path.join(import.meta.dir, "..");

interface Row {
  vector: string;
  attempts: number;
  allowed: number;
  blockedFrom: number | null;
  verdict: "PASS" | "FAIL";
  note: string;
}
const rows: Row[] = [];
let fail = 0;

function record(
  vector: string,
  attempts: number,
  allowed: number,
  blockedFrom: number | null,
  ok: boolean,
  note: string,
): void {
  if (!ok) fail++;
  rows.push({ vector, attempts, allowed, blockedFrom, verdict: ok ? "PASS" : "FAIL", note });
}

console.log("═══ MÔ PHỎNG TẤN CÔNG (offline — gọi hàm phòng thủ thật) ═══\n");

/* ── V1. Flood MỘT danh tính vào action public (publicConfig) ─────────────── */
{
  __resetRateGuardForTest();
  const ATTEMPTS = 400;
  let allowed = 0;
  let blockedFrom: number | null = null;
  for (let i = 1; i <= ATTEMPTS; i++) {
    const r = rateLimitPublicAction(
      { auth: { getIdentity: () => "attacker-1" } },
      { name: "publicConfig", maxPerMin: 30, globalMaxPerMin: 600 },
    );
    if (r.ok) allowed++;
    else if (blockedFrom === null) blockedFrom = i;
  }
  // Trần per-identity = 30/phút → lượt 31 phải bị chặn.
  record(
    "Flood 1 danh tính → publicConfig",
    ATTEMPTS,
    allowed,
    blockedFrom,
    blockedFrom === 31 && allowed === 30,
    "trần per-identity 30/phút",
  );
}

/* ── V2. Botnet XOAY danh tính (mỗi request 1 danh tính mới) ──────────────── */
{
  __resetRateGuardForTest();
  const ATTEMPTS = 5_000;
  let allowed = 0;
  let blockedFrom: number | null = null;
  for (let i = 1; i <= ATTEMPTS; i++) {
    const r = rateLimitPublicAction(
      { auth: { getIdentity: () => `botnet-${i}` } },
      { name: "publicConfig", maxPerMin: 30, globalMaxPerMin: 600 },
    );
    if (r.ok) allowed++;
    else {
      blockedFrom = i;
      break;
    }
  }
  // Xoay danh tính né được trần per-identity, nhưng trần TOÀN CỤC 600/phút chặn.
  record(
    "Botnet xoay danh tính → publicConfig",
    ATTEMPTS,
    allowed,
    blockedFrom,
    allowed === 600 && blockedFrom === 601,
    "trần toàn cục 600/phút chặn botnet phân tán",
  );
}

/* ── V3. Flood một IP vào /verify/complete ────────────────────────────────── */
{
  __resetHttpRateGuardForTest();
  const ATTEMPTS = 200;
  const ip = "198.51.100.9";
  let allowed = 0;
  let blockedFrom: number | null = null;
  for (let i = 1; i <= ATTEMPTS; i++) {
    if (allowVerifyRequest(ip, Date.now())) allowed++;
    else {
      blockedFrom = i;
      break;
    }
  }
  record(
    "Flood 1 IP → /verify/complete",
    ATTEMPTS,
    allowed,
    blockedFrom,
    allowed === VERIFY_MAX_PER_IP_PER_MIN && blockedFrom === VERIFY_MAX_PER_IP_PER_MIN + 1,
    `trần per-IP ${VERIFY_MAX_PER_IP_PER_MIN}/phút`,
  );
}

/* ── V4. Botnet NHIỀU IP vào /verify/complete (trần toàn cục) ─────────────── */
{
  __resetHttpRateGuardForTest();
  const ATTEMPTS = 2_000;
  let allowed = 0;
  let blockedFrom: number | null = null;
  for (let i = 1; i <= ATTEMPTS; i++) {
    // Mỗi i một IP công cộng khác nhau → né trần per-IP.
    const ip = `9.9.${Math.floor(i / 250)}.${i % 250}`;
    if (allowVerifyRequest(ip, Date.now())) allowed++;
    else {
      blockedFrom = i;
      break;
    }
  }
  record(
    "Botnet nhiều IP → /verify/complete",
    ATTEMPTS,
    allowed,
    blockedFrom,
    allowed === VERIFY_MAX_GLOBAL_PER_MIN && blockedFrom === VERIFY_MAX_GLOBAL_PER_MIN + 1,
    `trần toàn cục ${VERIFY_MAX_GLOBAL_PER_MIN}/phút`,
  );
}

/* ── V5. Dò cửa hậu botKey (giả mạo bot để đọc dữ liệu) ───────────────────── */
{
  const SENSITIVE: Array<[string, string]> = [
    ["convex/backup.ts", "botGetPending — đọc toàn bộ backup"],
    ["convex/guilds.ts", "getBotConfig — lộ whitelist + autoReplies"],
    ["convex/webhooks.ts", "botGetWebhooks — lộ token webhook"],
    ["convex/hidden.ts", "getBotHiddenJobs / botSetOwner"],
    ["convex/bot_writes/backup.ts", "botStoreBackup"],
    ["convex/bot_writes/restore.ts", "botClaimBackup / botClearBackup"],
  ];
  const missing: string[] = [];
  for (const [file, label] of SENSITIVE) {
    let src = "";
    try {
      src = fs.readFileSync(path.join(ROOT, file), "utf8");
    } catch {
      missing.push(`${label} (không đọc được ${file})`);
      continue;
    }
    if (!src.includes("requireBotKeyStrict")) missing.push(`${label} (${file})`);
  }
  // Không còn lối back-compat `requireBotKey(` nào được await trong convex/.
  const convexDir = path.join(ROOT, "convex");
  const convexFiles = fs.readdirSync(convexDir).filter((f) => f.endsWith(".ts"));
  const backCompat = convexFiles.some((f) =>
    /await requireBotKey\(/.test(fs.readFileSync(path.join(convexDir, f), "utf8")),
  );
  record(
    "Dò cửa hậu botKey",
    SENSITIVE.length,
    SENSITIVE.length - missing.length,
    null,
    missing.length === 0 && !backCompat,
    missing.length === 0
      ? backCompat
        ? "CÒN requireBotKey back-compat — cửa hậu!"
        : "mọi hàm nhạy cảm dùng requireBotKeyStrict, không back-compat"
      : `thiếu chốt: ${missing.join(", ")}`,
  );
}

/* ── V6. Flood tin nhắn qua APP NGOÀI (tấn công vào bot) ───────────────────── */
{
  const messages = [
    { content: "free nitro now" },
    { content: "claim your prize" },
    { content: "join our telegram" },
    { content: "limited giveaway!!" },
  ];
  const samples: Array<{ fp: string; ts: number }> = [];
  let triggeredAt: number | null = null;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    samples.push({ fp: messageFingerprint(m), ts: Date.now() });
    const fresh = samples;
    const res = isExternalAppSpam({
      samples: fresh,
      currentFingerprint: messageFingerprint(m),
      count: fresh.length,
      threshold: 2,
      hay: m.content,
    });
    if (res.triggered) {
      triggeredAt = i + 1;
      break;
    }
  }
  record(
    "Flood tin qua app ngoài → bot",
    messages.length,
    triggeredAt === null ? 0 : triggeredAt,
    triggeredAt,
    triggeredAt !== null,
    triggeredAt === null ? "KHÔNG phát hiện — guard mù" : `phát hiện từ tin thứ ${triggeredAt}`,
  );
}

/* ── V7. Ép người dùng kẹt vòng lặp đăng nhập (/auth) ─────────────────────── */
{
  const loopTargets = ["/auth", "/auth/", "/auth/nested?x=1", "/discord/callback?code=1"];
  const safeTargets = ["/dashboard", "/stats", "/backup"];
  const blockedAll = loopTargets.every((p) => isAuthLoopTarget(p));
  const allowsSafe = safeTargets.every((p) => !isAuthLoopTarget(p));
  const alive = resolveAuthPageState({
    hasToken: true,
    me: { discordId: "1" },
    returnTo: "/auth",
  });
  const noLoop = alive.kind === "app" && alive.to === "/dashboard";
  const ok = blockedAll && allowsSafe && noLoop;
  record(
    "Ép vòng lặp /auth (phiên còn sống)",
    loopTargets.length + safeTargets.length,
    blockedAll && allowsSafe ? loopTargets.length : 0,
    null,
    ok,
    ok
      ? "chặn mọi đích tự-quay-lại; phiên sống → đi thẳng /dashboard"
      : `blockedAll=${blockedAll} allowsSafe=${allowsSafe} noLoop=${noLoop}`,
  );
}

/* ── V8. Dò IP nội bộ / IP rác không được gọi upstream ────────────────────── */
{
  const bad = ["127.0.0.1", "10.1.2.3", "192.168.1.5", "::1", "fd00::1", "999.1.1.1", "abc", ""];
  const refused = bad.filter((ip) => !isPublicIp(ip)).length;
  const xff = parseClientIp("203.0.113.7, 10.0.0.1");
  const ok = refused === bad.length && xff === "10.0.0.1";
  record(
    "IP nội bộ / rác không tới upstream",
    bad.length,
    refused,
    null,
    ok,
    ok
      ? "chỉ IP công cộng được gọi; x-forwarded-for lấy mục cuối (proxy append)"
      : `refused=${refused}/${bad.length} xff=${xff}`,
  );
}

/* ── Báo cáo ──────────────────────────────────────────────────────────────── */
console.log("Kịch bản tấn công                                  Lượt   Cho qua   Chặn từ   Kết");
console.log("─".repeat(96));
for (const r of rows) {
  const v = r.vector.padEnd(48);
  const a = String(r.attempts).padStart(5);
  const al = String(r.allowed).padStart(8);
  const b = (r.blockedFrom === null ? "—" : String(r.blockedFrom)).padStart(8);
  const verdict = r.verdict === "PASS" ? "✅" : "❌";
  console.log(`${v} ${a} ${al} ${b}   ${verdict}  ${r.note}`);
}
console.log("─".repeat(96));
const passed = rows.length - fail;
console.log(`\nKết luận: ${passed}/${rows.length} chốt phòng thủ giữ vững.`);
if (fail > 0) {
  console.error(`\n❌ ${fail} chốt bị XUYÊN THỦNG — xem dòng ❌ phía trên.`);
  process.exit(1);
}
console.log("✅ Không chốt nào bị xuyên thủng trong mô phỏng.");
