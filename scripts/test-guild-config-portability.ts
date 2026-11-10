// TEST: guildConfig (xuất / nhập cấu hình server để không mất khi đổi host).
// Chạy: bun scripts/test-guild-config-portability.ts
//
// Vì sao test: đây là hàng phòng thủ cuối cùng trước khi ghi đè cả cấu hình
// bảo vệ của một server. Rủi ro cụ thể:
//  - RÒ DỮ LIỆU: bảng `guilds` trộn cấu hình với trạng thái vận hành và
//    danh tính (ownerId, lastHeartbeat, cờ backup/restore, lease). Xuất cả
//    document là rò; nạp lại là ghi đè trạng thái đang chạy bằng trạng thái cũ.
//  - FILE SỬA TAY: người dùng tải file về, sửa, nạp lại. Giá trị rác phải bị
//    BỎ chứ không được ghi xuống db.
//  - NGƯỠNG NHIỆT HỎNG: 4 ngưỡng phụ thuộc lẫn nhau (warn < timeout < kick <
//    ban). Nạp sai thứ tự là hệ thống nhiệt độ không bao giờ kick/ban được.
import {
  PORTABLE_CONFIG_FIELDS,
  PORTABLE_CONFIG_VERSION,
  buildGuildConfigExport,
  sanitizeImportedConfig,
} from "../convex/guildConfig";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean) => {
  console.log(ok ? `  ✅ ${label}` : `  ❌ ${label}`);
  if (ok) pass++;
  else fail++;
};

console.log("── allowlist: không lọt trạng thái vận hành / danh tính ──");

// 1. Field trạng thái vận hành + danh tính TUYỆT ĐỐI không được phép mang.
{
  const forbidden = [
    "ownerId",
    "discordId",
    "name",
    "icon",
    "lastHeartbeat",
    "memberCount",
    "botInGuild",
    "createdAt",
    "updatedAt",
    "settingsChangedAt",
    "backupRequested",
    "backupClaimedAt",
    "backupLeaseUntil",
    "restoreRequested",
    "restoreBackupId",
    "importStorageId",
    "importFileName",
    "verifyPanelError",
    "lastBackupAt",
    "modCaseCounter",
  ];
  const leaked = forbidden.filter((f) => (PORTABLE_CONFIG_FIELDS as readonly string[]).includes(f));
  check(
    `không field vận hành/danh tính nào lọt (${forbidden.length} cái bị chặn)`,
    leaked.length === 0,
  );
  if (leaked.length) console.log("     lọt:", leaked.join(", "));
}

// 2. Cấu hình quan trọng phải CÓ mặt trong allowlist (thêm field mới mà quên
//    thêm vào đây thì nó không được xuất — test này chống đúng lỗi đó).
{
  const mustHave = [
    "prefix",
    "theme",
    "antinukeEnabled",
    "automodEnabled",
    "heatEnabled",
    "heatWarnAt",
    "heatTimeoutAt",
    "heatKickAt",
    "heatBanAt",
    "joinGateEnabled",
    "joinGatePunish",
    "welcomeEnabled",
    "welcomeMessage",
    "badWords",
    "whitelistUsers",
    "modRoles",
    "verifyEnabled",
    "raidHuntEnabled",
    "warnStrikePunish",
  ];
  const missing = mustHave.filter(
    (f) => !(PORTABLE_CONFIG_FIELDS as readonly string[]).includes(f),
  );
  check(
    `cấu hình quan trọng đều có trong allowlist (${mustHave.length} mục)`,
    missing.length === 0,
  );
  if (missing.length) console.log("     thiếu:", missing.join(", "));
}

// 3. Allowlist không trùng lặp.
{
  const dup = PORTABLE_CONFIG_FIELDS.filter((f, i) => PORTABLE_CONFIG_FIELDS.indexOf(f) !== i);
  check("allowlist không có key trùng", dup.length === 0);
}

console.log("\n── buildGuildConfigExport: chỉ lấy cấu hình ──");

{
  const guild = {
    discordId: "111",
    name: "Server A",
    ownerId: "owner-1",
    lastHeartbeat: 12345,
    memberCount: 624,
    backupRequested: true,
    prefix: "!",
    heatEnabled: true,
    heatWarnAt: 20,
    antinukeEnabled: true,
  };
  const out = buildGuildConfigExport(guild);
  check("có version", out.version === PORTABLE_CONFIG_VERSION);
  check("giữ tên/id server để hiển thị", out.guild.name === "Server A");
  check(
    "KHÔNG rò ownerId",
    !("ownerId" in out.config) && !JSON.stringify(out.config).includes("owner-1"),
  );
  check("KHÔNG rò lastHeartbeat", !("lastHeartbeat" in out.config));
  check("KHÔNG rò memberCount", !("memberCount" in out.config));
  check("KHÔNG rò backupRequested", !("backupRequested" in out.config));
  check("lấy prefix", out.config.prefix === "!");
  check("lấy heatWarnAt", out.config.heatWarnAt === 20);
  check("lấy antinukeEnabled", out.config.antinukeEnabled === true);
}

// 4. Field undefined (chưa cấu hình) KHÔNG được mang đi.
{
  const out = buildGuildConfigExport({ discordId: "1", name: "B", prefix: "!" });
  check(
    "field undefined không lọt vào file",
    Object.keys(out.config).length === 1 && out.config.prefix === "!",
  );
}

console.log("\n── sanitize: loại field lạ, không ghi rác ──");

{
  const r = sanitizeImportedConfig({
    prefix: "!",
    ownerId: "attacker",
    lastHeartbeat: 999,
    backupRequested: true,
  });
  check("field trong allowlist được áp", r.patch.prefix === "!");
  check("ownerId bị bỏ", !("ownerId" in r.patch));
  check("lastHeartbeat bị bỏ", !("lastHeartbeat" in r.patch));
  check(
    "field lạ được BÁO CÁO (ignored) chứ không im lặng",
    r.ignored.includes("ownerId") && r.ignored.includes("lastHeartbeat"),
  );
  check("patch không chứa giá trị rác", !JSON.stringify(r.patch).includes("attacker"));
}

// 5. Kiểu sai → invalid, KHÔNG throw (file sửa tay vẫn phải nạp được phần còn lại).
{
  const r = sanitizeImportedConfig({
    prefix: "!",
    heatEnabled: "yes", // string thay vì boolean
    joinGateMinAgeDays: "30", // string thay vì number
    badWords: "không phải mảng",
  });
  check("prefix hợp lệ vẫn được giữ", r.patch.prefix === "!");
  check("boolean sai kiểu → invalid", r.invalid.includes("heatEnabled"));
  check("number sai kiểu → invalid", r.invalid.includes("joinGateMinAgeDays"));
  check("mảng sai kiểu → invalid", r.invalid.includes("badWords"));
}

// 6. File rác / sai hình dạng → trả về rỗng, không ném.
{
  for (const junk of [null, undefined, "chuỗi", 42, [1, 2, 3]]) {
    const r = sanitizeImportedConfig(junk);
    check(
      `junk ${JSON.stringify(junk) ?? "undefined"} → rỗng, không ném`,
      r.applied.length === 0 && Object.keys(r.patch).length === 0,
    );
  }
}

console.log("\n── luật giá trị: khớp updateSettings ──");

{
  const r = sanitizeImportedConfig({ prefix: "abc" });
  check("prefix sai (gõ chữ) → invalid", r.invalid.includes("prefix"));

  const r2 = sanitizeImportedConfig({ prefix: "!!!" });
  check("prefix 3 ký tự đặc biệt → OK", r2.patch.prefix === "!!!");

  const r3 = sanitizeImportedConfig({ prefix: "!!!!" });
  check("prefix 4 ký tự → invalid", r3.invalid.includes("prefix"));

  const r4 = sanitizeImportedConfig({ theme: "neon" });
  check("theme ngoài danh sách → invalid", r4.invalid.includes("theme"));

  const r5 = sanitizeImportedConfig({ joinGatePunish: "nuke" });
  check("joinGatePunish sai → invalid", r5.invalid.includes("joinGatePunish"));

  const r6 = sanitizeImportedConfig({ verifyMethod: "captcha" });
  check("verifyMethod hợp lệ → OK", r6.patch.verifyMethod === "captcha");
}

// 7. Số bị siết về biên (giống clamp của updateSettings) chứ không bị loại.
{
  const r = sanitizeImportedConfig({
    heatDecayPerMin: 9999,
    joinGateMinAgeDays: -5,
    warnStrikeLimit: 100,
  });
  check("heatDecayPerMin siết về 60", r.patch.heatDecayPerMin === 60);
  check("joinGateMinAgeDays siết về 0", r.patch.joinGateMinAgeDays === 0);
  check("warnStrikeLimit siết về 20", r.patch.warnStrikeLimit === 20);
}

console.log("\n── ID Discord: lọc rác, cắt trần, bỏ trùng ──");

{
  const r = sanitizeImportedConfig({
    modRoles: ["123456789012345678", "123456789012345678", "abc", "999"],
  });
  check(
    "chỉ giữ snowflake hợp lệ + bỏ trùng",
    Array.isArray(r.patch.modRoles) &&
      r.patch.modRoles.length === 1 &&
      r.patch.modRoles[0] === "123456789012345678",
  );

  const many = Array.from({ length: 80 }, (_, i) => String(1000000000000000n + BigInt(i)));
  const r2 = sanitizeImportedConfig({ adminRoles: many });
  check("adminRoles cắt còn 50", (r2.patch.adminRoles as string[]).length === 50);

  const r3 = sanitizeImportedConfig({ modRoles: "không phải mảng" });
  check("mảng sai kiểu → invalid", r3.invalid.includes("modRoles"));
}

console.log("\n── URL / màu: đúng luật cleanGreetingField ──");

{
  const r = sanitizeImportedConfig({
    welcomeEmbedImage: "https://cdn.example.com/a.png",
    welcomeEmbedColor: "#AABBCC",
    goodbyeEmbedImage: "javascript:alert(1)",
  });
  check("URL hợp lệ → giữ", r.patch.welcomeEmbedImage === "https://cdn.example.com/a.png");
  check("màu #hex → hạ chữ thường", r.patch.welcomeEmbedColor === "#aabbcc");
  check("URL độc hại → invalid", r.invalid.includes("goodbyeEmbedImage"));

  const r2 = sanitizeImportedConfig({ welcomeEmbedColor: "đỏ" });
  check("màu không phải hex → invalid", r2.invalid.includes("welcomeEmbedColor"));
}

console.log("\n── ngưỡng nhiệt: 4 field phụ thuộc nhau ──");

{
  // Thứ tự đúng → áp cả cụm.
  const ok = sanitizeImportedConfig({
    heatWarnAt: 10,
    heatTimeoutAt: 40,
    heatKickAt: 60,
    heatBanAt: 80,
  });
  check(
    "thứ tự đúng → áp cả 4",
    ok.applied.filter((f) => f.startsWith("heat") && f.endsWith("At")).length === 4,
  );

  // Kick < timeout → hỏng, phải bỏ CẢ CỤM chứ không áp dở.
  const bad = sanitizeImportedConfig({ heatTimeoutAt: 70, heatKickAt: 50, heatBanAt: 90 });
  check(
    "thứ tự sai → bỏ cả cụm timeout/kick/ban",
    bad.patch.heatTimeoutAt === undefined &&
      bad.patch.heatKickAt === undefined &&
      bad.patch.heatBanAt === undefined,
  );
  check(
    "báo đủ 3 field hỏng",
    bad.invalid.includes("heatTimeoutAt") && bad.invalid.includes("heatBanAt"),
  );

  // warn >= timeout → bỏ riêng warn, KHÔNG bỏ timeout.
  const warn = sanitizeImportedConfig({
    heatWarnAt: 50,
    heatTimeoutAt: 40,
    heatKickAt: 60,
    heatBanAt: 80,
  });
  check("warn >= timeout → bỏ warn", warn.patch.heatWarnAt === undefined);
  check("nhưng vẫn giữ timeout/kick/ban", warn.patch.heatBanAt === 80);

  // File chỉ có warn, timeout lấy từ `current`.
  const onlyWarn = sanitizeImportedConfig(
    { heatWarnAt: 15 },
    { heatTimeoutAt: 30, heatKickAt: 50, heatBanAt: 70 },
  );
  check("chỉ có warn → dùng timeout hiện có để so", onlyWarn.patch.heatWarnAt === 15);

  // current không có gì → lấy HEAT_DEFAULTS.
  const fallback = sanitizeImportedConfig({ heatWarnAt: 5 });
  check("không có current → vẫn hợp lệ theo mặc định", fallback.patch.heatWarnAt === 5);
}

console.log("\n── vòng tròn: export → import giữ nguyên cấu hình ──");

{
  const source = {
    discordId: "999",
    name: "Server X",
    ownerId: "o",
    lastHeartbeat: 7,
    prefix: "$",
    theme: "slate",
    antinukeEnabled: true,
    heatEnabled: true,
    heatWarnAt: 15,
    heatTimeoutAt: 40,
    heatKickAt: 60,
    heatBanAt: 85,
    joinGateEnabled: true,
    joinGateMinAgeDays: 7,
    welcomeMessage: "Chào {p0}!",
    badWords: ["XinChào", "spam"],
    modRoles: ["111111111111111111"],
  };
  const exported = buildGuildConfigExport(source);
  const reimported = sanitizeImportedConfig(exported.config);
  check("nạp lại không có field hỏng", reimported.invalid.length === 0);
  check("không bỏ field nào", reimported.ignored.length === 0);
  check(
    "giữ nguyên giá trị sau vòng tròn",
    reimported.patch.prefix === "$" &&
      reimported.patch.theme === "slate" &&
      reimported.patch.heatBanAt === 85 &&
      reimported.patch.welcomeMessage === "Chào {p0}!" &&
      (reimported.patch.badWords as string[]).includes("xinchào"),
  );
  check(
    "trạng thái vận hành KHÔNG quay lại qua vòng tròn",
    !("lastHeartbeat" in reimported.patch) && !("ownerId" in reimported.patch),
  );
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
