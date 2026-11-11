// TEST: convex/verifyCrypto.ts — token, hash IP/tín hiệu, prefix IPv6, clamp.
// Chạy: bun scripts/test-verify-crypto.ts
//
// VÌ SAO CẦN: đây là lớp duy nhất biến IP thô thành hash trước khi chạm DB.
// Một lỗi ở đây không làm web đỏ — nó làm hash SAI ÂM THẦM, khiến ipBans không
// bao giờ khớp (kẻ bị ban rejoin được) hoặc khớp nhầm giữa hai server (ban oan).
// Test khoá: token đủ entropy/URL-safe, hash tách miền theo guild, IPv6 prefix
// đúng 64 bit, và clamp ban không cho vượt trần 90 ngày.
import {
  IP_BAN_MAX_DAYS,
  base64UrlEncode,
  clampBanDays,
  generateVerifyToken,
  hashVerifyToken,
  ipHash,
  ipPrefixHash,
  ipv6Prefix64,
  isSharedIp,
  isSharedIpv4,
  normalizeIp,
  signalHash,
} from "../convex/verifyCrypto";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "PASS" : "FAIL"} ${label}${ok || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`,
  );
  ok ? pass++ : fail++;
};

const SECRET = "test-secret-khong-dung-production";

// ── Token ────────────────────────────────────────────────────────────────────
const t1 = generateVerifyToken();
const t2 = generateVerifyToken();
check("token dài 43 ký tự base64url (32 byte)", t1.length === 43, t1.length);
check("token chỉ chứa ký tự URL-safe", /^[A-Za-z0-9_-]+$/.test(t1), t1);
check("hai token khác nhau", t1 !== t2);
check("hash token ổn định", hashVerifyToken(t1) === hashVerifyToken(t1));
check("hash token khác nhau", hashVerifyToken(t1) !== hashVerifyToken(t2));
check("hash token là 64 hex", /^[0-9a-f]{64}$/.test(hashVerifyToken(t1)));
check(
  "base64url không padding",
  base64UrlEncode(new Uint8Array([0, 0, 0])) === "AAAA" &&
    base64UrlEncode(new Uint8Array([255])) === "_w",
);

// ── Chuẩn hoá IP ─────────────────────────────────────────────────────────────
check("normalize IPv4", normalizeIp(" 1.2.3.4 ") === "1.2.3.4");
check("normalize IPv4 kèm cổng", normalizeIp("1.2.3.4:5678") === "1.2.3.4");
check("normalize IPv6 trong ngoặc", normalizeIp("[2001:DB8::1]:443") === "2001:db8::1");
check("normalize IPv6 zone id", normalizeIp("fe80::1%eth0") === "fe80::1");
check("normalize rỗng", normalizeIp("") === "");
check("normalize quá dài", normalizeIp("a".repeat(65)) === "");

// ── Hash IP ──────────────────────────────────────────────────────────────────
const ip = "203.0.113.9";
const h1 = ipHash(SECRET, "guild-a", ip);
const h2 = ipHash(SECRET, "guild-a", ip);
const h3 = ipHash(SECRET, "guild-b", ip);
check("ipHash ổn định", h1 === h2);
check("ipHash tách guild", h1 !== h3);
check("ipHash 64 hex", /^[0-9a-f]{64}$/.test(h1));
check("ipHash đổi secret", h1 !== ipHash("secret-khac", "guild-a", ip));
check("ipHash chuẩn hoá trước khi băm", h1 === ipHash(SECRET, "guild-a", " 203.0.113.9 "));

// ── Signal hash ──────────────────────────────────────────────────────────────
const s1 = signalHash(SECRET, "fp", "abc");
check("signalHash tách kind", s1 !== signalHash(SECRET, "cookie", "abc"));
check("signalHash ổn định", s1 === signalHash(SECRET, "fp", "abc"));
check("signalHash đổi value", s1 !== signalHash(SECRET, "fp", "abd"));
check(
  "signalHash từ chối rỗng",
  (() => {
    try {
      signalHash(SECRET, "fp", "  ");
      return false;
    } catch {
      return true;
    }
  })(),
);

// ── IPv6 /64 ─────────────────────────────────────────────────────────────────
check(
  "prefix /64 IPv6 đầy đủ",
  ipv6Prefix64("2001:db8:abcd:1234:5678:9abc:def0:1234") === "2001:db8:abcd:1234::/64",
);
check(
  "prefix /64 IPv6 rút gọn",
  ipv6Prefix64("2001:db8:abcd:1234::1") === "2001:db8:abcd:1234::/64",
);
check("prefix /64 IPv6 loopback", ipv6Prefix64("::1") === "0:0:0:0::/64");
check("prefix IPv4 trả null", ipv6Prefix64("1.2.3.4") === null);
check("prefix rác trả null", ipv6Prefix64("2001:db8::zz") === null);
check(
  "ipPrefixHash tách guild",
  ipPrefixHash(SECRET, "a", "2001:db8::/64") !== ipPrefixHash(SECRET, "b", "2001:db8::/64"),
);

// ── Shared IP / clamp ────────────────────────────────────────────────────────
check("CGNAT 100.64.0.1 là shared", isSharedIpv4("100.64.0.1"));
check("CGNAT 100.127.255.255 là shared", isSharedIpv4("100.127.255.255"));
check("100.128.0.1 không phải shared", !isSharedIpv4("100.128.0.1"));
check("IP thường không shared", !isSharedIp("203.0.113.9"));
check("clamp mặc định 7", clampBanDays(undefined) === 7);
check("clamp 0 → mặc định", clampBanDays(0) === 7);
check("clamp âm → mặc định", clampBanDays(-5) === 7);
check("clamp trần 90", clampBanDays(9999) === IP_BAN_MAX_DAYS);
check("clamp số lẻ", clampBanDays(12.9) === 12);
check("clamp chuỗi số", clampBanDays("30") === 30);

console.log(`\n${pass}/${pass + fail} assertion xanh`);
if (fail > 0) process.exit(1);
