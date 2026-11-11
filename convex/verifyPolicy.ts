/**
 * verifyPolicy — bộ quyết định THUẦN cho một lượt xác minh web.
 *
 * Tách khỏi Convex/HTTP để test được mọi tổ hợp mà không cần DB, mạng hay
 * Discord. Đây là nơi duy nhất quyết định allow / deny / ban; handler chỉ ghi
 * kết quả. Muốn đổi chính sách (thêm tín hiệu, đổi ngưỡng) thì sửa file này +
 * test, không rải điều kiện khắp action.
 *
 * Mô hình học từ Double Counter: nhiều tín hiệu (IP, cookie, fingerprint, UA)
 * cộng điểm; tài khoản đã bị ban trong server mà xuất hiện lại qua tín hiệu
 * trùng bị coi là ban evasion. Khác Double Counter ở chỗ mọi ngưỡng đều cấu
 * hình được và auto-ban có chốt chống ban nhầm (CGNAT/mobile, owner/admin).
 */

export type VpnMode = "off" | "warn" | "strict" | "kick" | "ban";
export type AltPunish = "kick" | "ban" | "timeout" | "verify";
export type IpBanAction = "deny" | "ban";
export type VerifyDecisionKind = "allow" | "deny" | "ban";

export type VerifyIntel = {
  country?: string;
  asn?: number;
  org?: string;
  isVpn?: boolean;
  isProxy?: boolean;
  isTor?: boolean;
  isHosting?: boolean;
  isMobile?: boolean;
  isAbuser?: boolean;
};

export type VerifyLink = {
  userId: string;
  score: number;
  reasons: string[];
  /** Tài khoản này đang bị ban trong guild (bảng guildBans hoặc modActions). */
  banned: boolean;
};

export type VerifyPolicyInput = {
  ipBanned: boolean;
  ipBanAction: IpBanAction;
  /** Hash IP nằm trong whitelist của guild. */
  ipBanWhitelisted: boolean;
  /** User nằm trong altWhitelistUsers. */
  userWhitelisted: boolean;
  /** Owner server / admin role / bot — không bao giờ auto-ban. */
  privileged: boolean;
  /** IP thuộc CGNAT hoặc ipapi.is báo is_mobile — dùng chung, dễ ban nhầm. */
  sharedIp: boolean;
  intel: VerifyIntel | null;
  vpnMode: VpnMode;
  altPunish: AltPunish;
  /** Ngưỡng score tối thiểu để coi một link là đủ mạnh (mặc định 60). */
  linkThreshold?: number;
  links: VerifyLink[];
};

export type VerifyPolicyResult = {
  decision: VerifyDecisionKind;
  /** Hình phạt bot nên áp dụng khi decision != allow (null = không phạt). */
  punish: AltPunish | null;
  riskScore: number;
  /** Mã lý do ổn định — web/i18n dịch, log/audit lưu nguyên mã. */
  reasons: string[];
  /** Có tín hiệu đáng chú ý nhưng vẫn cho qua (admin nên xem). */
  flagged: boolean;
};

const DEFAULT_LINK_THRESHOLD = 60;

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Cộng điểm link mạnh nhất + điểm tín hiệu phụ, không cộng dồn vô hạn. */
function linkRisk(links: VerifyLink[], threshold: number): { score: number; reasons: string[] } {
  const strong = links.filter((l) => l.score >= threshold).sort((a, b) => b.score - a.score)[0];
  if (!strong) return { score: 0, reasons: [] };
  return { score: clampScore(strong.score), reasons: strong.reasons.slice(0, 6) };
}

function vpnReasons(intel: VerifyIntel | null): string[] {
  if (!intel) return [];
  const out: string[] = [];
  if (intel.isVpn) out.push("vpn_detected");
  if (intel.isProxy) out.push("proxy_detected");
  if (intel.isTor) out.push("tor_detected");
  if (intel.isHosting) out.push("datacenter_detected");
  return out;
}

/**
 * Quyết định cuối cùng. Thứ tự ưu tiên: IP ban (cứng nhất) → ban evasion →
 * VPN policy → link mềm (flag) → allow.
 */
export function decideVerify(input: VerifyPolicyInput): VerifyPolicyResult {
  const threshold = input.linkThreshold ?? DEFAULT_LINK_THRESHOLD;
  const reasons: string[] = [];
  const vpnCodes = vpnReasons(input.intel);
  const vpnHit = vpnCodes.length > 0;
  const link = linkRisk(input.links, threshold);
  const bannedLink = input.links
    .filter((l) => l.banned && l.score >= threshold)
    .sort((a, b) => b.score - a.score)[0];

  // 1. IP ban — quyết định cứng nhất, nhưng vẫn có đường thoát.
  if (input.ipBanned) {
    if (input.ipBanWhitelisted || input.userWhitelisted) {
      return {
        decision: "allow",
        punish: null,
        riskScore: 0,
        reasons: ["whitelist"],
        flagged: false,
      };
    }
    if (input.privileged) {
      return {
        decision: "allow",
        punish: null,
        riskScore: 50,
        reasons: ["ip_ban_match", "admin_exempt"],
        flagged: true,
      };
    }
    // CGNAT/mobile: hàng nghìn người dùng chung IP. Từ chối verify là đủ để
    // chặn account mới, nhưng BAN account là ban oan người lạ cùng mạng.
    if (input.sharedIp) {
      return {
        decision: "deny",
        punish: null,
        riskScore: 90,
        reasons: ["ip_ban_match", "shared_ip"],
        flagged: true,
      };
    }
    if (input.ipBanAction === "ban") {
      return {
        decision: "ban",
        punish: "ban",
        riskScore: 100,
        reasons: ["ip_ban_match"],
        flagged: true,
      };
    }
    return {
      decision: "deny",
      punish: null,
      riskScore: 90,
      reasons: ["ip_ban_match"],
      flagged: true,
    };
  }

  // 2. Ban evasion: tài khoản đã bị ban trong server xuất hiện lại qua tín hiệu.
  if (bannedLink) {
    if (input.userWhitelisted || input.privileged) {
      return {
        decision: "allow",
        punish: null,
        riskScore: clampScore(bannedLink.score),
        reasons: ["linked_banned_account", input.privileged ? "admin_exempt" : "whitelist"],
        flagged: true,
      };
    }
    if (input.altPunish === "ban") {
      return {
        decision: "ban",
        punish: "ban",
        riskScore: 100,
        reasons: ["linked_banned_account", ...bannedLink.reasons].slice(0, 8),
        flagged: true,
      };
    }
    return {
      decision: "deny",
      punish: input.altPunish,
      riskScore: 95,
      reasons: ["linked_banned_account", ...bannedLink.reasons].slice(0, 8),
      flagged: true,
    };
  }

  // 3. VPN/proxy/Tor/datacenter — theo cấu hình của guild.
  if (vpnHit && input.vpnMode !== "off") {
    const base = vpnCodes.slice();
    if (input.sharedIp) base.push("shared_ip");
    if (input.vpnMode === "warn") {
      return {
        decision: "allow",
        punish: null,
        riskScore: clampScore(30 + (input.intel?.isAbuser ? 20 : 0)),
        reasons: base,
        flagged: true,
      };
    }
    if (input.vpnMode === "strict") {
      return {
        decision: "deny",
        punish: null,
        riskScore: 80,
        reasons: base,
        flagged: true,
      };
    }
    // kick/ban: chặn + phạt; đây là lựa chọn có ý thức của admin.
    return {
      decision: input.vpnMode === "ban" ? "ban" : "deny",
      punish: input.vpnMode,
      riskScore: 85,
      reasons: base,
      flagged: true,
    };
  }

  // 4. Link mềm: cùng IP/cookie/fingerprint với account khác nhưng chưa ban.
  // Double Counter gắn cờ để staff xem; không tự phạt nếu chưa có ban evasion.
  if (link.score >= threshold) {
    return {
      decision: "allow",
      punish: null,
      riskScore: link.score,
      reasons: ["linked_account", ...link.reasons].slice(0, 8),
      flagged: true,
    };
  }

  // 5. Sạch.
  if (input.sharedIp) reasons.push("shared_ip");
  if (input.intel?.isAbuser) reasons.push("abuser_network");
  return {
    decision: "allow",
    punish: null,
    riskScore: clampScore(link.score + (input.intel?.isAbuser ? 20 : 0)),
    reasons,
    flagged: reasons.length > 0,
  };
}

/** Nhãn ngắn để log/audit không phình; UI tự dịch mã đầy đủ. */
export function decisionLabel(result: VerifyPolicyResult): string {
  if (result.decision === "ban") return "ban";
  if (result.decision === "deny") return result.punish ? `deny:${result.punish}` : "deny";
  return result.flagged ? "allow:flagged" : "allow";
}
