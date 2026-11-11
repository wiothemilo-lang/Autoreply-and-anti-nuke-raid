"use node";

/// <reference types="node" />

/**
 * verifyPreflight — phần DUY NHẤT của self-test cần Node runtime.
 *
 * Đọc env và gọi ipapi.is (những thứ default runtime không làm được). Không
 * nhận input từ client: action chỉ trả trạng thái cấu hình, không trả giá trị
 * secret. Kết quả ipapi được cache 10 phút để bấm kiểm tra nhiều lần không đốt
 * hạn mức API.
 */

declare const process: {
  env: Record<string, string | undefined>;
};

import { internalAction } from "./_generated/server";

const IPAPI_TIMEOUT_MS = 4000;
const IPAPI_CACHE_MS = 10 * 60_000;

type IpapiResult = { ok: boolean; detail: string; latencyMs: number };

let ipapiCache: ({ at: number } & IpapiResult) | null = null;

/**
 * Phản hồi ipapi.is có đúng hình dạng `parseIntel` cần không?
 *
 * 200 OK chưa đủ: khóa sai có thể trả 200 kèm object lỗi, khi đó verify thật
 * luôn mất phần VPN mà self-test lại báo "kết nối OK". Hàm thuần để test được
 * không cần mạng.
 */
export function ipapiLooksValid(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const row = data as Record<string, unknown>;
  return (
    typeof row.ip === "string" ||
    typeof row.is_vpn === "boolean" ||
    (typeof row.asn === "object" && row.asn !== null)
  );
}

export const probe = internalAction({
  args: {},
  handler: async () => {
    const secret = process.env.IP_HASH_SECRET ?? "";
    const apiKey = process.env.IPINTEL_API_KEY ?? "";

    const env = {
      ipHashSecret: !secret ? "missing" : secret.length < 32 ? "too_short" : "ok",
      ipintelKey: apiKey ? "ok" : "missing",
    };

    let ipapi: IpapiResult;
    if (!apiKey) {
      ipapi = { ok: false, detail: "skipped_no_key", latencyMs: 0 };
    } else if (ipapiCache && Date.now() - ipapiCache.at < IPAPI_CACHE_MS) {
      ipapi = {
        ok: ipapiCache.ok,
        detail: ipapiCache.detail,
        latencyMs: ipapiCache.latencyMs,
      };
    } else {
      const started = Date.now();
      try {
        const res = await fetch(
          `https://api.ipapi.is/?q=1.1.1.1&key=${encodeURIComponent(apiKey)}`,
          {
            headers: { accept: "application/json", "user-agent": "protogon-verify-preflight" },
            signal: AbortSignal.timeout(IPAPI_TIMEOUT_MS),
          },
        );
        if (!res.ok) {
          ipapi = { ok: false, detail: `http_${res.status}`, latencyMs: Date.now() - started };
        } else {
          // 200 chưa đủ: khóa sai có thể trả 200 kèm object lỗi. Yêu cầu đúng
          // hình dạng dữ liệu mà `parseIntel` cần — nếu không, self-test báo
          // "kết nối OK" trong khi verify thật sẽ luôn mất phần VPN.
          const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
          ipapi = ipapiLooksValid(data)
            ? { ok: true, detail: "ok", latencyMs: Date.now() - started }
            : { ok: false, detail: "bad_response", latencyMs: Date.now() - started };
        }
      } catch (e) {
        const timeout =
          e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
        ipapi = {
          ok: false,
          detail: timeout ? "timeout" : "network",
          latencyMs: Date.now() - started,
        };
      }
      ipapiCache = { at: Date.now(), ...ipapi };
    }

    return { env, ipapi };
  },
});
