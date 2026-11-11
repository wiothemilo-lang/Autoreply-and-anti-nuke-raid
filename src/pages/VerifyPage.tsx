import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  BadgeCheck,
  Fingerprint,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  TimerOff,
} from "lucide-react";

import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import LangSwitch from "../components/LangSwitch";
import { api } from "../../convex/_generated/api";
import { convexSiteUrl } from "../lib/convexUrl";
import { translate } from "../lib/i18n";

/**
 * Trang /verify/:token — xác minh thành viên kiểu Double Counter.
 *
 * Nguyên tắc:
 *  - KHÔNG đăng nhập Discord, KHÔNG captcha hình ảnh. Một nút duy nhất.
 *  - Tín hiệu thu trong im lặng (fingerprint, cookie, UA); IP do server đọc từ
 *    `x-forwarded-for` — client không bao giờ tự khai IP.
 *  - Kiểm tra "người thật" vô hình: honeypot, thời gian ở trang, cử động chuột.
 *    Không dùng puzzle vì puzzle chặn người dùng thật nhiều hơn chặn bot.
 *  - Trang KHÔNG quyết định gì: gửi tín hiệu lên Convex, Convex trả kết quả.
 *
 * Quyền riêng tư: trang nói rõ thu gì, giữ bao lâu, và rằng IP chỉ được lưu
 * dưới dạng băm một chiều. Nội dung đầy đủ ở /privacy.
 */

const COOKIE_KEY = "pg_vid";
/** Ở trang ít nhất 1.5s mới coi là người thật — bot điền form thường nhanh hơn. */
const MIN_DWELL_MS = 1500;

type Phase =
  | "loading"
  | "ready"
  | "sending"
  | "granting"
  | "granted"
  | "grant_failed"
  | "blocked"
  | "banned"
  | "error";

type CompleteResponse =
  | {
      ok: true;
      decision: "allow" | "deny" | "ban";
      reason: string;
      riskScore: number;
      flagged: boolean;
    }
  | { ok: false; code: string };

/** Đọc/khởi tạo id thiết bị bền (first-party). Xoá storage = danh tính mới. */
function deviceId(): string {
  try {
    const existing = localStorage.getItem(COOKIE_KEY);
    if (existing && /^[A-Za-z0-9_-]{16,64}$/.test(existing)) return existing;
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(COOKIE_KEY, id);
    return id;
  } catch {
    // Chế độ riêng tư/chặn storage → vẫn trả id tạm để không chặn xác minh.
    return "";
  }
}

/** SHA-256 hex của chuỗi — dùng cho fingerprint (không gửi giá trị thô lên server). */
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Dựng chuỗi fingerprint từ các đặc điểm ổn định của máy.
 *
 * Cố ý KHÔNG dùng mọi thứ có thể đổi giữa hai lần tải (pin, mạng, thời gian):
 * fingerprint đổi liên tục thì mọi lượt verify đều là "thiết bị mới" và tính
 * năng phát hiện alt mất tác dụng.
 */
async function buildFingerprint(): Promise<string> {
  const parts: string[] = [];
  const nav = navigator as Navigator & { deviceMemory?: number; webdriver?: boolean };
  parts.push(`ua:${navigator.userAgent}`);
  parts.push(`plat:${navigator.platform}`);
  parts.push(`lang:${(navigator.languages ?? []).join(",")}`);
  parts.push(`cores:${navigator.hardwareConcurrency ?? 0}`);
  parts.push(`mem:${nav.deviceMemory ?? 0}`);
  parts.push(`tz:${Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""}`);
  parts.push(`scr:${screen.width}x${screen.height}x${screen.colorDepth}`);
  parts.push(`touch:${navigator.maxTouchPoints ?? 0}`);

  // Canvas: mỗi tổ hợp GPU/driver/font vẽ ra pixel hơi khác nhau.
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 40;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "16px 'Arial'";
      ctx.fillStyle = "#f60";
      ctx.fillRect(0, 0, 200, 40);
      ctx.fillStyle = "#069";
      ctx.fillText("Protogon verify ✓ 日本語", 2, 4);
      ctx.fillStyle = "rgba(102,204,0,0.7)";
      ctx.fillText("Protogon verify ✓ 日本語", 4, 12);
      parts.push(`canvas:${canvas.toDataURL().slice(-96)}`);
    }
  } catch {
    parts.push("canvas:blocked");
  }

  // WebGL: vendor/renderer lộ GPU — tín hiệu mạnh nhất sau canvas.
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    if (gl) {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      const vendor = dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : "";
      const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "";
      parts.push(`gl:${vendor}|${renderer}`);
    }
  } catch {
    parts.push("gl:blocked");
  }

  return sha256Hex(parts.join("||"));
}

export default function VerifyPage() {
  const { token = "" } = useParams();
  const session = useQuery(api.verify.getSession, token ? { token } : "skip");

  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState("");
  const [human, setHuman] = useState(false);
  const mountedAt = useRef(Date.now());
  const honeypot = useRef<HTMLInputElement | null>(null);
  const moved = useRef(false);

  const expired = useMemo(() => {
    if (!session) return false;
    return session.status === "pending" && session.expiresAt < Date.now();
  }, [session]);

  // Theo dõi cử động chuột/chạm — bot headless thường không phát sinh sự kiện.
  useEffect(() => {
    const mark = () => {
      moved.current = true;
    };
    window.addEventListener("pointermove", mark, { passive: true, once: true });
    window.addEventListener("touchstart", mark, { passive: true, once: true });
    window.addEventListener("keydown", mark, { passive: true, once: true });
    return () => {
      window.removeEventListener("pointermove", mark);
      window.removeEventListener("touchstart", mark);
      window.removeEventListener("keydown", mark);
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    if (session.status === "verified") {
      // Convex cập nhật reactive: bot cấp role xong → trang tự chuyển từ
      // "đang cấp" sang "đã cấp". Chỉ grantState="applied" mới là thành công thật.
      setPhase(
        session.grantState === "applied" || session.grantState == null
          ? "granted"
          : session.grantState === "failed"
            ? "grant_failed"
            : "granting",
      );
      return;
    }
    if (session.status === "banned") {
      setPhase("banned");
      return;
    }
    if (session.status === "denied") {
      setPhase("blocked");
      return;
    }
    if (session.status === "pending") {
      setPhase(expired ? "error" : "ready");
      if (expired)
        setMessage(translate("Link đã hết hạn — hãy bấm lại nút xác minh trong Discord."));
      return;
    }
    setPhase("error");
  }, [session, expired]);

  const submit = useCallback(async () => {
    if (phase === "sending" || phase === "granting" || phase === "granted") return;
    setPhase("sending");
    setMessage("");

    const dwell = Date.now() - mountedAt.current;
    const nav = navigator as Navigator & { webdriver?: boolean };
    // 3 điều kiện vô hình. Thiếu bất kỳ điều nào → server từ chối, không phạt.
    const looksHuman =
      dwell >= MIN_DWELL_MS &&
      nav.webdriver !== true &&
      !honeypot.current?.value &&
      (moved.current || dwell >= MIN_DWELL_MS);
    setHuman(looksHuman);

    try {
      const fingerprint = await buildFingerprint().catch(() => "");
      const res = await fetch(`${convexSiteUrl()}/verify/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          fingerprint,
          cookieId: deviceId(),
          human: looksHuman,
        }),
      });
      const data = (await res.json()) as CompleteResponse;
      if (!data.ok) {
        setPhase("error");
        setMessage(codeMessage(data.code));
        return;
      }
      if (data.decision === "allow") {
        // "allow" chỉ là tín hiệu đã qua. Role do bot cấp ở tick kế tiếp, nên
        // chưa được nói "thành công" cho tới khi grantState = applied.
        setPhase("granting");
      } else if (data.decision === "ban") {
        setPhase("banned");
      } else {
        setPhase("blocked");
      }
    } catch {
      setPhase("error");
      setMessage(translate("Không kết nối được máy chủ — kiểm tra mạng rồi thử lại."));
    }
  }, [phase, token]);

  const guildName = session?.guildName || translate("server này");

  return (
    <main
      id="main"
      tabIndex={-1}
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-12 outline-none"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(88,101,242,0.18),transparent_60%)]" />
      <div className="absolute right-4 top-4">
        <LangSwitch />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative w-full max-w-lg"
      >
        <Card className="border-border/60 shadow-xl">
          <CardContent className="p-7">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-lg font-semibold">{translate("Xác minh thành viên")}</h1>
                <p className="text-xs text-muted-foreground">{guildName}</p>
              </div>
            </div>

            {phase === "loading" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {translate("Đang kiểm tra link…")}
              </div>
            )}

            {phase === "ready" && (
              <div className="space-y-5">
                <p className="text-sm text-muted-foreground">
                  {translate(
                    "Bấm nút bên dưới để xác minh và nhận quyền truy cập server. Quá trình mất vài giây.",
                  )}
                </p>
                <ul className="space-y-2 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Fingerprint className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {translate(
                      "Chúng tôi kiểm tra thiết bị và kết nối để chặn tài khoản giả, VPN và tài khoản phụ.",
                    )}
                  </li>
                  <li className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {translate(
                      "Địa chỉ IP không được lưu — chỉ lưu giá trị băm một chiều không thể đảo ngược.",
                    )}
                  </li>
                </ul>
                {/* Honeypot: ẩn với người thật, bot điền form tự động sẽ chạm vào. */}
                <input
                  ref={honeypot}
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="pointer-events-none absolute h-0 w-0 opacity-0"
                />
                <Button className="w-full" onClick={submit} disabled={phase !== "ready"}>
                  <BadgeCheck className="mr-2 h-4 w-4" />
                  {translate("Xác minh ngay")}
                </Button>
                <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                  {translate("Khi bấm, bạn đồng ý với")}{" "}
                  <a className="underline hover:text-foreground" href="/privacy">
                    {translate("Chính sách quyền riêng tư")}
                  </a>
                  .
                </p>
              </div>
            )}

            {phase === "sending" && (
              <div className="flex flex-col items-center gap-3 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                {translate("Đang xác minh…")}
              </div>
            )}

            {phase === "granting" && (
              <div className="space-y-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </span>
                <h2 className="text-base font-semibold">{translate("Đã xác minh tín hiệu")}</h2>
                <p className="text-sm text-muted-foreground">
                  {translate(
                    "Bot đang cấp quyền truy cập. Trang này sẽ tự cập nhật khi hoàn tất — thường mất tối đa 3 phút.",
                  )}
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => window.location.reload()}
                >
                  {translate("Kiểm tra lại")}
                </Button>
              </div>
            )}

            {phase === "granted" && (
              <Result
                tone="ok"
                icon={<BadgeCheck className="h-6 w-6" />}
                title={translate("Đã cấp quyền truy cập server")}
                body={translate("Bạn có thể quay lại Discord và bắt đầu trò chuyện.")}
              />
            )}

            {phase === "grant_failed" && (
              <Result
                tone="warn"
                icon={<ShieldAlert className="h-6 w-6" />}
                title={translate("Chưa cấp được quyền truy cập")}
                body={translate(
                  "Tín hiệu xác minh đã được ghi nhận nhưng bot chưa cấp được role. Hãy báo quản trị server để kiểm tra quyền của bot.",
                )}
              />
            )}

            {phase === "blocked" && (
              <Result
                tone="warn"
                icon={<ShieldAlert className="h-6 w-6" />}
                title={translate("Chưa thể xác minh")}
                body={translate(
                  "Kết nối hoặc thiết bị của bạn bị đánh giá là rủi ro. Hãy tắt VPN/proxy rồi thử lại, hoặc liên hệ quản trị server.",
                )}
              />
            )}

            {phase === "banned" && (
              <Result
                tone="danger"
                icon={<AlertTriangle className="h-6 w-6" />}
                title={translate("Truy cập bị chặn")}
                body={translate(
                  "Tài khoản hoặc kết nối này đã bị chặn khỏi server. Nếu bạn cho rằng đây là nhầm lẫn, hãy liên hệ quản trị server.",
                )}
              />
            )}

            {phase === "error" && (
              <Result
                tone="warn"
                icon={<TimerOff className="h-6 w-6" />}
                title={translate("Không xác minh được")}
                body={message || translate("Link không hợp lệ hoặc đã được dùng.")}
              />
            )}

            {human === false && (phase === "blocked" || phase === "error") && (
              <p className="mt-4 text-center text-[11px] text-muted-foreground">
                {translate("Nếu bạn là người thật, hãy thử lại và không dùng công cụ tự động.")}
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </main>
  );
}

/** Mã lỗi kỹ thuật → câu tiếng Việt (không lộ chi tiết hạ tầng). */
function codeMessage(code: string): string {
  switch (code) {
    case "expired":
      return translate("Link đã hết hạn — hãy bấm lại nút xác minh trong Discord.");
    case "used":
      return translate(
        "Link này đã được dùng rồi. Nếu cần xác minh lại, hãy bấm nút trong Discord.",
      );
    case "not_found":
      return translate("Link không hợp lệ. Hãy bấm nút xác minh trong Discord để nhận link mới.");
    case "not_configured":
      return translate("Server chưa cấu hình xong tính năng xác minh — hãy báo quản trị server.");
    case "ip_unavailable":
      return translate("Không xác định được kết nối của bạn — hãy thử lại bằng mạng khác.");
    case "rate_limited":
      return translate("Bạn thao tác quá nhanh — chờ một phút rồi thử lại.");
    case "forbidden_origin":
      return translate("Trang này không được phép gửi yêu cầu xác minh.");
    default:
      return translate("Có lỗi xảy ra — hãy thử lại sau ít phút.");
  }
}

function Result({
  tone,
  icon,
  title,
  body,
}: {
  tone: "ok" | "warn" | "danger";
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  const toneClass =
    tone === "ok"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : "bg-destructive/10 text-destructive";
  return (
    <div className="space-y-3">
      <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${toneClass}`}>
        {icon}
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
