"use node";

/// <reference types="node" />

/**
 * verifyActions — phần DUY NHẤT của luồng verify cần Node runtime.
 *
 * Vì sao phải tách: Convex default runtime KHÔNG đọc được `process.env` (xem
 * `botAuth.ts`) và cần `fetch` ra ngoài. Ở đây ta:
 *   1. đọc `IP_HASH_SECRET` + `IPINTEL_API_KEY`,
 *   2. băm IP/tín hiệu (KHÔNG đưa IP thô vào DB),
 *   3. tra cache `ipIntelCache`, thiếu thì gọi ipapi.is,
 *   4. giao toàn bộ quyết định cho `internal.verify.finalize` (mutation).
 *
 * Mọi lỗi cấu hình/mạng đều KHÔNG làm sập luồng: phiên bị đánh dấu `failed` với
 * mã kỹ thuật, người dùng thấy thông báo chung. Đây là chủ ý — trang verify
 * không được biến thành cửa sổ đọc lỗi hạ tầng.
 */

/** Minimal env typing để file này type-check cả từ Vite app (theo paymentsAction.ts). */
declare const process: {
  env: Record<string, string | undefined>;
};

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  globalIpHash,
  hashVerifyToken,
  ipHash,
  ipPrefixHash,
  ipv6Prefix64,
  isSharedIp,
  normalizeIp,
  signalHash,
} from "./verifyCrypto";

/** Cache kết quả ipapi.is: 24h — đủ tươi cho VPN/proxy, đủ rẻ cho hạn mức API. */
const INTEL_TTL_MS = 24 * 3600_000;
/** Timeout gọi ipapi.is — chậm hơn thì bỏ qua, không treo trang verify. */
const INTEL_TIMEOUT_MS = 4000;

type Intel = {
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

/** Đọc một boolean từ JSON không tin cậy — chỉ nhận `true` thật. */
function bool(value: unknown): boolean {
  return value === true;
}

/** Rút gọn phản hồi ipapi.is thành đúng những field ta dùng. */
export function parseIntel(raw: unknown): Intel | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  const company = (data.company ?? {}) as Record<string, unknown>;
  const asn = (data.asn ?? {}) as Record<string, unknown>;
  const location = (data.location ?? {}) as Record<string, unknown>;
  const asnNumber = Number(asn.asn);
  const country = typeof location.country_code === "string" ? location.country_code : undefined;
  return {
    country:
      country && /^[A-Z]{2}$/.test(country.toUpperCase()) ? country.toUpperCase() : undefined,
    asn: Number.isFinite(asnNumber) && asnNumber > 0 ? Math.floor(asnNumber) : undefined,
    org: typeof company.name === "string" ? company.name.slice(0, 120) : undefined,
    isVpn: bool(data.is_vpn),
    isProxy: bool(data.is_proxy),
    isTor: bool(data.is_tor),
    isHosting: bool(data.is_datacenter),
    isMobile: bool(data.is_mobile),
    isAbuser: bool(data.is_abuser),
  };
}

/**
 * Hoàn tất một lượt verify từ trình duyệt.
 *
 * `ip` do HTTP route truyền vào (đọc từ `x-forwarded-for`) — KHÔNG BAO GIỜ lấy
 * IP từ body, vì client tự khai IP là tự khai "tôi sạch".
 */
export const complete = internalAction({
  args: {
    token: v.string(),
    ip: v.string(),
    userAgent: v.string(),
    fingerprint: v.optional(v.string()),
    cookieId: v.optional(v.string()),
    /** Kết quả kiểm tra người-thật phía client (honeypot + dwell + pointer). */
    human: v.boolean(),
    /**
     * Người dùng đã tick checkbox đồng ý xử lý dữ liệu. Bắt buộc: không có
     * consent thì KHÔNG băm/ghi bất kỳ tín hiệu nào. Phiên vẫn pending để
     * người dùng tick rồi thử lại (không đốt token).
     */
    consent: v.boolean(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { ok: false; code: string }
    | {
        ok: true;
        decision: "allow" | "deny" | "ban";
        reason: string;
        riskScore: number;
        flagged: boolean;
        country: string | null;
      }
  > => {
    const token = args.token.trim();
    if (!token || token.length > 128) return { ok: false, code: "not_found" };
    // Chốt consent TRƯỚC mọi thao tác đọc/ghi: chưa đồng ý thì không băm,
    // không gọi ipapi.is, không ghi DB. Phiên giữ nguyên pending để thử lại.
    if (args.consent !== true) return { ok: false, code: "consent_required" };
    const tokenHash = hashVerifyToken(token);

    const session = await ctx.runQuery(internal.verify.getSessionForAction, { tokenHash });
    if (!session) return { ok: false, code: "not_found" };
    if (session.status !== "pending") return { ok: false, code: "used" };
    if (session.expiresAt < Date.now()) {
      await ctx.runMutation(internal.verify.markFailed, {
        tokenHash,
        failureCode: "expired",
      });
      return { ok: false, code: "expired" };
    }

    const secret = process.env.IP_HASH_SECRET;
    if (!secret) {
      // Không có secret thì KHÔNG được ghi gì: ghi hash bằng secret rỗng sẽ tạo
      // bộ hash vĩnh viễn không bao giờ khớp lại sau khi cấu hình đúng.
      await ctx.runMutation(internal.verify.markFailed, {
        tokenHash,
        failureCode: "missing_secret",
      });
      return { ok: false, code: "not_configured" };
    }

    const ip = normalizeIp(args.ip);
    if (!ip) {
      await ctx.runMutation(internal.verify.markFailed, {
        tokenHash,
        failureCode: "ip_unavailable",
      });
      return { ok: false, code: "ip_unavailable" };
    }

    let guildIpHash: string;
    let globalHash: string;
    try {
      guildIpHash = ipHash(secret, session.guildId, ip);
      globalHash = globalIpHash(secret, ip);
    } catch {
      await ctx.runMutation(internal.verify.markFailed, {
        tokenHash,
        failureCode: "ip_unavailable",
      });
      return { ok: false, code: "ip_unavailable" };
    }

    const prefix = ipv6Prefix64(ip);
    const guildPrefixHash = prefix ? ipPrefixHash(secret, session.guildId, prefix) : undefined;

    // ── Tín hiệu thiết bị: băm, cắt độ dài, bỏ nếu rỗng ────────────────────
    const fingerprint = (args.fingerprint ?? "").trim().slice(0, 512);
    const cookieId = (args.cookieId ?? "").trim().slice(0, 128);
    const ua = (args.userAgent ?? "").trim().slice(0, 512);
    const fingerprintHash = fingerprint ? signalHash(secret, "fp", fingerprint) : undefined;
    const cookieHash = cookieId ? signalHash(secret, "cookie", cookieId) : undefined;
    const uaHash = ua ? signalHash(secret, "ua", ua) : undefined;

    // ── IP intelligence: cache trước, gọi API sau ──────────────────────────
    let intel: Intel | null = null;
    const cached = await ctx.runQuery(internal.verify.getIntelCache, { ipHash: globalHash });
    if (cached) {
      intel = {
        country: cached.country,
        asn: cached.asn,
        org: cached.org,
        isVpn: cached.isVpn,
        isProxy: cached.isProxy,
        isTor: cached.isTor,
        isHosting: cached.isHosting,
        isMobile: cached.isMobile,
        isAbuser: cached.isAbuser,
      };
    } else {
      const apiKey = process.env.IPINTEL_API_KEY;
      if (apiKey) {
        try {
          const url = `https://api.ipapi.is/?q=${encodeURIComponent(ip)}&key=${encodeURIComponent(apiKey)}`;
          const res = await fetch(url, {
            headers: { accept: "application/json", "user-agent": "protogon-verify" },
            signal: AbortSignal.timeout(INTEL_TIMEOUT_MS),
          });
          if (res.ok) {
            intel = parseIntel(await res.json());
          }
        } catch {
          // Mạng lỗi/chậm → verify vẫn chạy với intel null (chỉ mất phần VPN).
        }
      }
      if (intel) {
        await ctx.runMutation(internal.verify.putIntelCache, {
          ipHash: globalHash,
          country: intel.country,
          asn: intel.asn,
          org: intel.org,
          isVpn: intel.isVpn === true,
          isProxy: intel.isProxy,
          isTor: intel.isTor,
          isHosting: intel.isHosting,
          isMobile: intel.isMobile,
          isAbuser: intel.isAbuser,
          ttlMs: INTEL_TTL_MS,
        });
      }
    }

    // IP dùng chung: CGNAT, mạng di động, hoặc hosting báo mobile. Đây là chốt
    // chống ban nhầm quan trọng nhất — quyết định có auto-ban hay chỉ từ chối.
    const sharedIp = isSharedIp(ip) || intel?.isMobile === true;

    const result = await ctx.runMutation(internal.verify.finalize, {
      tokenHash,
      ipHash: guildIpHash,
      ipPrefixHash: guildPrefixHash,
      globalIpHash: globalHash,
      fingerprintHash,
      cookieHash,
      uaHash,
      sharedIp,
      human: args.human === true,
      intel: intel ?? undefined,
    });

    if (!result.ok) return { ok: false, code: result.code };

    // Chỉ trả mã công khai: KHÔNG trả lý do chi tiết (tránh dạy kẻ gian cách lách
    // và tránh lộ thông tin về tài khoản khác đang bị link).
    const publicReason =
      result.decision === "allow"
        ? result.flagged
          ? "flagged"
          : "allowed"
        : result.decision === "ban"
          ? "banned"
          : result.reason === "human_check_failed"
            ? "human_check_failed"
            : "blocked";

    return {
      ok: true,
      decision: result.decision,
      reason: publicReason,
      riskScore: result.riskScore,
      flagged: result.flagged,
      country: result.country ?? null,
    };
  },
});
