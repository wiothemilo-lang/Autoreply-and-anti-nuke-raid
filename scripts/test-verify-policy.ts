// TEST: convex/verifyPolicy.ts — quyết định allow/deny/ban của verify web.
// Chạy: bun scripts/test-verify-policy.ts
//
// VÌ SAO CẦN: đây là nơi duy nhất quyết định có BAN một Discord account hay
// không. Sai một nhánh là ban oan người thật (CGNAT, owner server) hoặc bỏ lọt
// kẻ ban evasion. Test khoá đúng thứ tự ưu tiên và các chốt chống false positive.
import { decideVerify, decisionLabel, type VerifyPolicyInput } from "../convex/verifyPolicy";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "PASS" : "FAIL"} ${label}${ok || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`,
  );
  ok ? pass++ : fail++;
};

const base: VerifyPolicyInput = {
  ipBanned: false,
  ipBanAction: "ban",
  ipBanWhitelisted: false,
  userWhitelisted: false,
  privileged: false,
  sharedIp: false,
  intel: null,
  vpnMode: "off",
  altPunish: "ban",
  links: [],
};

const run = (patch: Partial<VerifyPolicyInput>) => decideVerify({ ...base, ...patch });

// ── Sạch ─────────────────────────────────────────────────────────────────────
{
  const r = run({});
  check("sạch → allow", r.decision === "allow");
  check("sạch → không phạt", r.punish === null);
  check("sạch → không flag", !r.flagged);
  check("sạch → risk 0", r.riskScore === 0);
}

// ── IP ban ───────────────────────────────────────────────────────────────────
{
  const r = run({ ipBanned: true, ipBanAction: "ban" });
  check("IP ban + action ban → ban", r.decision === "ban");
  check("IP ban → punish ban", r.punish === "ban");
  check("IP ban → risk 100", r.riskScore === 100);
  check("IP ban → reason ip_ban_match", r.reasons.includes("ip_ban_match"));
}
{
  const r = run({ ipBanned: true, ipBanAction: "deny" });
  check("IP ban + action deny → deny", r.decision === "deny");
  check("IP ban + deny → không punish", r.punish === null);
}
{
  const r = run({ ipBanned: true, sharedIp: true });
  check("IP ban + CGNAT → deny (KHÔNG ban)", r.decision === "deny");
  check("IP ban + CGNAT → reason shared_ip", r.reasons.includes("shared_ip"));
}
{
  const r = run({ ipBanned: true, privileged: true });
  check("IP ban + owner/admin → allow", r.decision === "allow");
  check("IP ban + owner/admin → flag", r.flagged);
  check("IP ban + owner/admin → reason admin_exempt", r.reasons.includes("admin_exempt"));
}
{
  const r = run({ ipBanned: true, userWhitelisted: true });
  check("IP ban + whitelist user → allow", r.decision === "allow");
  check("IP ban + whitelist user → risk 0", r.riskScore === 0);
}
{
  const r = run({ ipBanned: true, ipBanWhitelisted: true });
  check("IP ban + whitelist hash → allow", r.decision === "allow");
}

// ── Ban evasion ──────────────────────────────────────────────────────────────
const bannedLink = { userId: "u2", score: 80, reasons: ["fingerprint_match"], banned: true };
{
  const r = run({ links: [bannedLink], altPunish: "ban" });
  check("link bị ban + altPunish ban → ban", r.decision === "ban");
  check("ban evasion → reason linked_banned_account", r.reasons.includes("linked_banned_account"));
  check("ban evasion → risk 100", r.riskScore === 100);
}
{
  const r = run({ links: [bannedLink], altPunish: "kick" });
  check("link bị ban + altPunish kick → deny", r.decision === "deny");
  check("link bị ban + kick → punish kick", r.punish === "kick");
}
{
  const r = run({ links: [bannedLink], altPunish: "timeout" });
  check(
    "link bị ban + timeout → deny + punish timeout",
    r.decision === "deny" && r.punish === "timeout",
  );
}
{
  const r = run({ links: [bannedLink], privileged: true });
  check("link bị ban + owner/admin → allow", r.decision === "allow");
  check("link bị ban + owner/admin → flag", r.flagged);
}
{
  const weak = { userId: "u3", score: 40, reasons: ["ip_match"], banned: true };
  const r = run({ links: [weak] });
  check("link yếu dưới ngưỡng → allow", r.decision === "allow");
  check("link yếu dưới ngưỡng → không flag", !r.flagged);
}

// ── VPN ──────────────────────────────────────────────────────────────────────
const vpn = { isVpn: true };
{
  const r = run({ intel: vpn, vpnMode: "off" });
  check("VPN + mode off → allow", r.decision === "allow");
  check("VPN + mode off → không flag", !r.flagged);
}
{
  const r = run({ intel: vpn, vpnMode: "warn" });
  check("VPN + warn → allow", r.decision === "allow");
  check("VPN + warn → flag", r.flagged);
  check("VPN + warn → reason vpn_detected", r.reasons.includes("vpn_detected"));
}
{
  const r = run({ intel: vpn, vpnMode: "strict" });
  check("VPN + strict → deny", r.decision === "deny");
  check("VPN + strict → không punish", r.punish === null);
}
{
  const r = run({ intel: vpn, vpnMode: "kick" });
  check("VPN + kick → deny + punish kick", r.decision === "deny" && r.punish === "kick");
}
{
  const r = run({ intel: vpn, vpnMode: "ban" });
  check("VPN + ban → ban", r.decision === "ban" && r.punish === "ban");
}
{
  const r = run({ intel: { isTor: true }, vpnMode: "strict" });
  check("Tor + strict → deny", r.decision === "deny");
  check("Tor → reason tor_detected", r.reasons.includes("tor_detected"));
}
{
  const r = run({ intel: { isHosting: true }, vpnMode: "strict" });
  check("datacenter + strict → deny", r.decision === "deny");
  check("datacenter → reason datacenter_detected", r.reasons.includes("datacenter_detected"));
}
{
  const r = run({ intel: { isProxy: true }, vpnMode: "warn" });
  check("proxy + warn → allow + flag", r.decision === "allow" && r.flagged);
}

// ── Link mềm ─────────────────────────────────────────────────────────────────
{
  const soft = { userId: "u4", score: 70, reasons: ["cookie_match"], banned: false };
  const r = run({ links: [soft] });
  check("link mềm đủ mạnh → allow + flag", r.decision === "allow" && r.flagged);
  check("link mềm → reason linked_account", r.reasons.includes("linked_account"));
  check("link mềm → risk 70", r.riskScore === 70);
}

// ── Tổ hợp ưu tiên ───────────────────────────────────────────────────────────
{
  const r = run({
    ipBanned: true,
    sharedIp: true,
    links: [bannedLink],
    intel: vpn,
    vpnMode: "ban",
  });
  check(
    "ưu tiên IP ban hơn ban evasion/VPN",
    r.reasons.includes("ip_ban_match") && r.decision === "deny",
  );
  check("IP ban shared không kéo theo ban evasion", !r.reasons.includes("linked_banned_account"));
}
{
  const r = run({ intel: vpn, vpnMode: "ban", links: [bannedLink] });
  check("ưu tiên ban evasion hơn VPN", r.reasons.includes("linked_banned_account"));
}

// ── Nhãn audit ───────────────────────────────────────────────────────────────
check(
  "label ban",
  decisionLabel({ decision: "ban", punish: "ban", riskScore: 100, reasons: [], flagged: true }) ===
    "ban",
);
check(
  "label deny:kick",
  decisionLabel({ decision: "deny", punish: "kick", riskScore: 80, reasons: [], flagged: true }) ===
    "deny:kick",
);
check(
  "label allow:flagged",
  decisionLabel({ decision: "allow", punish: null, riskScore: 70, reasons: [], flagged: true }) ===
    "allow:flagged",
);
check(
  "label allow",
  decisionLabel({ decision: "allow", punish: null, riskScore: 0, reasons: [], flagged: false }) ===
    "allow",
);

console.log(`\n${pass}/${pass + fail} assertion xanh`);
if (fail > 0) process.exit(1);
