// TEST BẢO MẬT — xác minh các vá chống giả mạo bot-side + khóa tính năng ẩn.
// Chạy: node scripts/test-security-hardening.cjs
// Không mạng, không Convex thật — kiểm bằng phân tích nguồn + logic thuần.
const fs = require("fs");
const path = require("path");

let pass = 0;
let fail = 0;
const check = (label, ok, extra) => {
  console.log(ok ? `PASS ${label}` : `FAIL ${label}${extra ? " — " + extra : ""}`);
  ok ? pass++ : fail++;
};
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

// ===== 1. Strict botKey: không còn cửa hậu back-compat =====
const botAuth = read("convex/botAuth.ts");
check(
  "requireBotKeyStrict từ chối khi seed chưa cấp phát (không back-compat)",
  botAuth.includes("Chìa khóa bot chưa được cấp phát"),
);
check(
  "requireBotKeyStrict so khớp SHA-256(botKey) với seed",
  botAuth.includes("computeBotKey(botKey) !== seed"),
);
check(
  "requireBotKey cũ (back-compat) không còn được dùng ở function nào",
  !/await requireBotKey\(/.test(
    fs
      .readdirSync(path.join(__dirname, "..", "convex"))
      .filter((f) => f.endsWith(".ts"))
      .map((f) => read(path.join("convex", f)))
      .join("\n"),
  ),
);

// Danh sách function nhạy cảm bắt buộc strict
const sensitive = [
  ["convex/backup.ts", "botGetPending (đọc toàn bộ backup JSON)"],
  ["convex/backup_github.ts", "githubPush (đẩy Gist)"],
  ["convex/bot_writes.ts", "botStoreBackup / botClaimBackup / botClearBackup"],
  ["convex/guilds.ts", "getBotConfig (lộ whitelist + autoReplies)"],
  ["convex/webhooks.ts", "botGetWebhooks (lộ token webhook)"],
  ["convex/hidden.ts", "getBotHiddenJobs / botSetOwner"],
];
for (const [p, desc] of sensitive) {
  check(`${p} dùng strict — bảo vệ ${desc}`, read(p).includes("requireBotKeyStrict"));
}

// ===== 2. Bootstrap: chốt chặn là Discord token thật =====
const bootstrapAction = read("convex/botBootstrapAction.ts");
check(
  "bootstrap là action PUBLIC (bot HTTP client gọi được)",
  /export const requestBotKey = action\(/.test(bootstrapAction),
);
check(
  "bootstrap xác minh token qua Discord API /users/@me",
  bootstrapAction.includes("discord.com/api/v10/users/@me"),
);
check(
  "bootstrap từ chối token không phải bot (data.bot !== true)",
  bootstrapAction.includes("data.bot !== true"),
);
check(
  "server chỉ lưu BĂM key (không lưu botKey thô)",
  read("convex/botBootstrap.ts").includes("botKeySeed: seed") &&
    !/botKey:\s*v\.string\(\)/.test(read("convex/botBootstrap.ts")),
);
check(
  "key random 32 bytes bằng webcrypto (không seed tĩnh)",
  bootstrapAction.includes("crypto.getRandomValues"),
);
check(
  "attempt rate-limit chặn relay spam Discord API (1 lần thử/10 phút)",
  read("convex/botBootstrap.ts").includes("ATTEMPT_COOLDOWN_MS = 10 * 60_000"),
);
check(
  "bootstrap không bị request sai khóa cooldown bot thật",
  (() => {
    const body = bootstrapAction.slice(bootstrapAction.indexOf("export const requestBotKey"));
    return body.indexOf("markBootstrapAttempt") > body.indexOf("assertExpectedBotApplication");
  })(),
);
check(
  "backup/restore có lease renewal + claim fencing ở từng giai đoạn",
  read("convex/bot_writes.ts").includes("botRenewBackupClaim") &&
    read("convex/bot_writes.ts").includes("backupLeaseUntil") &&
    // Đợt #5: restoreCore (nơi gia hạn claim ở từng giai đoạn) nằm ở backupRestore.js.
    read("bot/src/backupRestore.js").includes("botRenewBackupClaim"),
);
check(
  "Discord bootstrap có timeout và rate-limit trước API",
  bootstrapAction.includes("AbortController") &&
    bootstrapAction.includes("KEY_STATUS_MAX_PER_WINDOW") &&
    bootstrapAction.includes("BOOTSTRAP_MAX_PER_WINDOW"),
);
check(
  "xoay key: bootstrap lại được ngay sau khi seed thay (success >= attempt mở cổng)",
  read("convex/botBootstrap.ts").includes("lastSuccess >= lastAttempt"),
);

// ===== 3. Bot tự bootstrap + cache key an toàn =====
const convexJs = read("bot/src/convex.js");
check("bot tự bootstrap khi thiếu BOT_KEY (ensureBotKey)", convexJs.includes("ensureBotKey"));
check(
  "bot gọi bootstrap qua RAW client (tránh deadlock proxy)",
  convexJs.includes("this._rawClient.action"),
);
check("key cache vào file .bot-key quyền 600", convexJs.includes("mode: 0o600"));
check(
  "proxy chờ ensureBotKey trước MỌI call (không rơi trạng thái thiếu key)",
  /await self\.ensureBotKey\(\);/.test(convexJs),
);
check("proxy bọc cả action (githubPush)", /prop !== "action"/.test(convexJs));
const gitignore = read(".gitignore");
check(".bot-key đã gitignore (key không vào git)", gitignore.includes("bot/.bot-key"));

// ===== 4. Khoá tính năng ẩn: owner-gating server-side =====
const hidden = read("convex/hidden.ts");
const guilds = read("convex/guilds.ts");
check(
  "requireHiddenManage (guild manager + CHỦ BOT) tồn tại",
  hidden.includes("requireHiddenManage"),
);
for (const fn of [
  "createPanel",
  "updatePanel",
  "deletePanel",
  "togglePanel",
  "createGiveaway",
  "cancelGiveaway",
  "requestDm",
]) {
  // Đếm số lần requireGuild vẫn còn trong handler của fn đó — phải 0 (đã thay bằng requireHiddenManage)
  const seg = hidden.slice(hidden.indexOf(`export const ${fn} =`));
  const nextFn = seg.indexOf("export const", 20);
  const body = nextFn > 0 ? seg.slice(0, nextFn) : seg;
  check(
    `hidden.${fn} yêu cầu chủ bot (không chỉ manager)`,
    body.includes("requireHiddenManage") &&
      !/await requireGuild\(ctx, token, guildId\);/.test(body.replace("requireHiddenManage", "")),
  );
}
check(
  "getGuild chỉ trả panels cho isBotOwner",
  guilds.includes("panels: isBotOwner") &&
    guilds.includes("giveaways: isBotOwner") &&
    guilds.includes("autoReplies: isBotOwner"),
);

// ===== 5. Rate-limit dò mật khẩu ẩn =====
check(
  "verifyHiddenPassword chặn sau 5 lần sai / 10 phút",
  hidden.includes("HIDDEN_VERIFY_MAX_FAILS = 5") &&
    hidden.includes("HIDDEN_VERIFY_WINDOW_MS = 10 * 60_000"),
);
check("đổi mật khẩu reset bộ đếm dò", hidden.includes("hiddenVerifyFails: undefined"));
check(
  "schema có trường rate-limit",
  read("convex/schema.ts").includes("hiddenVerifyFails") &&
    read("convex/schema.ts").includes("hiddenVerifyLastAt"),
);

// ===== 6. Schema bootstrap đầy đủ =====
const schema = read("convex/schema.ts");
check(
  "schema botStatus có botKeySeed + lastBootstrapAt + botApplicationId",
  schema.includes("botKeySeed") &&
    schema.includes("lastBootstrapAt") &&
    schema.includes("botApplicationId"),
);

// ===== 7. Test logic rate-limit (thuần) =====
{
  // Mô phỏng đúng logic trong verifyHiddenPassword
  const MAX = 5;
  const WINDOW = 10 * 60_000;
  let fails = 0;
  let lastAt = 0;
  const now0 = 1_000_000;
  const attempt = (now, ok) => {
    if (now - lastAt < WINDOW && fails >= MAX) return { blocked: true };
    if (ok) {
      if (fails > 0) {
        fails = 0;
        lastAt = 0;
      }
      return { blocked: false, unlocked: true };
    }
    const expired = now - lastAt >= WINDOW;
    fails = expired ? 1 : fails + 1;
    lastAt = now;
    return { blocked: false };
  };
  let blockedSeen = false;
  for (let i = 1; i <= 6; i++) {
    const r = attempt(now0 + i * 1000, false);
    if (r.blocked) blockedSeen = true;
  }
  check("5 lần sai trong 10 phút → lần 6 bị khóa", blockedSeen && fails === 5);
  const afterWindow = attempt(now0 + 11 * 60_000, false);
  check("qua cửa sổ 10 phút → đếm lại từ 1", !afterWindow.blocked && fails === 1);
  const okRes = attempt(now0 + 11 * 60_000 + 1000, true);
  check("đúng mật khẩu → mở khóa + reset đếm", okRes.unlocked && fails === 0);
}

// ===== 8. Web Admin mô tả cơ chế mới =====
check(
  "Admin.tsx ghi rõ bot tự cấp phát chìa khóa",
  read("src/pages/Admin.tsx").includes("tự cấp phát chìa khóa an toàn"),
);
check("README bot tài liệu cơ chế bootstrap", read("bot/README.md").includes("bot/.bot-key"));

// ===== 9. Các lớp fail-closed mới: không được quay lại first-user/first-audit =====
// Các check này khóa đúng các bug kiểm tra tay đã tìm thấy trong audit toàn repo.
check(
  "bootstrap gắn bot ID đã xác minh với Application ID deployment",
  /(BOT_APPLICATION_ID|EXPECTED_BOT_APPLICATION_ID)/.test(bootstrapAction) &&
    /bot\.id\s*!==\s*expected/.test(bootstrapAction),
);
check(
  "owner gate fail-closed khi chưa có owner hợp lệ",
  /Chủ sở hữu bot chưa được khởi tạo/.test(hidden) &&
    !/setOwnerId\(ctx, user\.discordId\)/.test(hidden),
);
check(
  "guild authorization không còn tin guild.managers cũ",
  !/guild\.managers/.test(
    read("convex/auth.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, ""),
  ),
);
check(
  "session purge dùng implicit _creation_time index có sẵn",
  read("convex/sessionHardening.ts").includes('withIndex("by_creation_time")'),
);
check(
  "schema khai báo đủ self-diagnose fields bot đang ghi",
  ["selfDiagnoseLastFingerprint", "selfDiagnoseLastSeverity", "selfDiagnoseLastSummary"].every(
    (field) => schema.includes(field),
  ),
);
check(
  "relay weight có danh sách source distinct",
  schema.includes("sourceHashes") && read("convex/relay.ts").includes("sourceHashes"),
);
check(
  "func key so sánh đúng hash gửi từ client",
  read("convex/botFunc.ts").includes("funcKey === computeFuncKey(funcSeed)"),
);

const statusSrc = read("convex/status.ts");
const selfDiagnoseSrc = read("convex/selfDiagnose.ts");
const threatIntelSrc = read("convex/threatIntel.ts");
const relaySrc = read("convex/relay.ts");
const guildsSrc = read("convex/guilds.ts");
const sessionHardeningSrc = read("convex/sessionHardening.ts");
const sessionAuthSrc = read("convex/sessionAuth.ts");
const discordClientSrc = read("src/lib/discord.ts");
const callbackSrc = read("src/pages/DiscordCallback.tsx");
const altDetectionSrc = read("convex/altDetection.ts");
const authSrc = read("convex/auth.ts");
const authLogic = authSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

check(
  "requestBotKey + keyStatus cùng kiểm tra Application ID deployment",
  (bootstrapAction.match(/assertExpectedBotApplication\(bot, status\.botApplicationId\)/g) ?? [])
    .length === 2 &&
    /BOT_APPLICATION_ID[\s\S]*EXPECTED_BOT_APPLICATION_ID[\s\S]*DISCORD_CLIENT_ID[\s\S]*storedApplicationId/.test(
      bootstrapAction,
    ),
);
check(
  "canonical owner không phụ thuộc users row và chỉ nhận snowflake hợp lệ",
  hidden.includes("export function isBotOwnerUser") &&
    /DISCORD_SNOWFLAKE_RE\.test\(ownerDiscordId\)/.test(hidden) &&
    !hidden.slice(0, hidden.indexOf("export const botSetOwner")).includes('query("users")'),
);
check(
  "mọi path owner toàn cục dùng helper chuẩn, không còn so sánh owner yếu",
  [statusSrc, selfDiagnoseSrc, threatIntelSrc, relaySrc, guildsSrc].every((src) =>
    /isBotOwnerUser\(|requireBotOwner\(/.test(src),
  ) &&
    [statusSrc, selfDiagnoseSrc, threatIntelSrc, relaySrc, guildsSrc].every(
      (src) => !/(owner|status)\?\.ownerDiscordId\s*&&/.test(src),
    ),
);
const botSetOwnerBody = hidden.slice(
  hidden.indexOf("export const botSetOwner"),
  hidden.indexOf("export const setBotBranding"),
);
check(
  "botSetOwner vẫn strict nhưng cho bot cập nhật owner sau khi Discord đổi chủ",
  botSetOwnerBody.includes("requireBotKeyStrict") &&
    botSetOwnerBody.includes("ownerDiscordId: ownerId") &&
    !botSetOwnerBody.includes("ownerIsValid"),
);
check(
  "setHiddenPassword không còn first-web-manager claim",
  !hidden.slice(hidden.indexOf("export const setHiddenPassword")).includes("setOwnerId("),
);
check(
  "guild.managers chỉ còn compatibility/display, authorization dùng snapshot",
  authSrc.includes("managers?: string[]") &&
    authLogic.includes("manageableGuildIds") &&
    !authLogic.includes("guild.managers"),
);
check(
  "refresh session xác minh /users/@me khớp user trước khi cập nhật guild",
  (() => {
    const refresh = sessionAuthSrc.slice(
      sessionAuthSrc.indexOf("export const refreshGuildsServer"),
    );
    return (
      refresh.includes("/users/@me") &&
      /identity\.id\s*!==\s*me\.discordId|identity\.id\s*!==\s*user\.discordId/.test(refresh) &&
      refresh.indexOf("/users/@me") < refresh.indexOf("internal.sessionHardening.guildsInternal")
    );
  })(),
);
check(
  "legacy session không còn dùng sau đổi sang server-side OAuth",
  read("convex/auth.ts").includes("isCurrentSession") &&
    read("convex/sessionHardening.ts").includes("authVersion: CURRENT_SESSION_AUTH_VERSION") &&
    schema.includes("authVersion"),
);
check(
  "redirect allowless deployment fail closed",
  sessionAuthSrc.includes("Chưa cấu hình redirect_uri cho phép") &&
    !sessionAuthSrc.includes("ALLOWED.length === 0) return null"),
);
check(
  "OAuth access token không còn được lưu/gửi từ browser",
  !/storeDiscordAccess|getDiscordAccessToken|exchangeCode\(/.test(discordClientSrc) &&
    !/localStorage\.setItem\([^)]*wio_discord_access/.test(discordClientSrc) &&
    !sessionAuthSrc.includes("accessToken: v.optional"),
);
check(
  "OAuth code + PKCE verifier được trao đổi trong Convex server action",
  sessionAuthSrc.includes("exchangeCodeOnServer") &&
    sessionAuthSrc.includes("code_verifier") &&
    sessionAuthSrc.includes("codeVerifier: v.string()") &&
    sessionAuthSrc.includes("hasValidOAuthParams"),
);
check(
  "OAuth client ID dùng cùng Application ID đã xác minh khi env thiếu",
  sessionAuthSrc.includes("configuredClientId(status?.botApplicationId)") &&
    read("convex/public.ts").includes("validClientId(status?.botApplicationId)"),
);
check(
  "silent refresh chỉ báo thành công khi action trả ok",
  callbackSrc.includes('refreshed.ok ? "silent=ok" : "silent=err"'),
);
check(
  "session purge dùng index _creation_time ẩn, schema không khai báo index thừa",
  sessionHardeningSrc.includes('withIndex("by_creation_time")') &&
    !/sessions:[\s\S]*?\.index\("by_creation_time"/.test(schema),
);
const recentJoinsBody = altDetectionSrc.slice(
  altDetectionSrc.indexOf("export const getRecentJoins"),
  altDetectionSrc.indexOf("export const getAltStats"),
);
const altStatsBody = altDetectionSrc.slice(altDetectionSrc.indexOf("export const getAltStats"));
check(
  "recent joins dùng index guild+joinedAt có range/order",
  recentJoinsBody.includes('withIndex("by_guildId_joinedAt"') &&
    recentJoinsBody.includes('.gte("joinedAt", 0)') &&
    recentJoinsBody.includes('.order("desc")'),
);
check(
  "alt stats 7 ngày dùng index + joinedAt range",
  altStatsBody.includes('withIndex("by_guildId_joinedAt"') &&
    altStatsBody.includes('.gte("joinedAt", sevenDaysAgo)'),
);
check(
  "relay giữ nguồn distinct có giới hạn và chỉ tăng weight cho nguồn mới",
  schema.includes("sourceHashes") &&
    relaySrc.includes("MAX_SOURCE_HASHES") &&
    /new Set\(\[\.\.\.sourceHashes, sourceHash\]\)/.test(relaySrc) &&
    relaySrc.includes("effectiveWeight") &&
    /\.slice\(\s*-MAX_SOURCE_HASHES/.test(relaySrc),
);

console.log(`\nKết quả security hardening: ${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
