import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAction } from "convex/react";
import { AlertTriangle } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Button } from "../components/ui/button";
import SkipLink from "../components/SkipLink";
import PageSplash from "../components/PageSplash";
import {
  OAUTH_STATE_KEY,
  OAUTH_VERIFIER_KEY,
  SILENT_STATE_KEY,
  SILENT_VERIFIER_KEY,
  getSessionToken,
  safeRedirectPath,
  setSessionToken,
} from "../lib/discord";

import { translate } from "../lib/i18n";
/**
 * Chuyển lỗi đăng nhập thành thông điệp người dùng hiểu được.
 * Đặc biệt: 15/09/2026 Discord gặp sự cố "Session Unavailability" (500) —
 * người dùng tưởng dashboard lỗi, cần nói rõ lỗi nằm ở phía Discord.
 * Server trả { ok: false, reason } thay vì throw (Convex prod mask message
 * của action thành "Server Error") — reason giờ luôn là text thật.
 */
function friendlyAuthError(raw: string): string {
  if (raw.includes("NEED_CLIENT_SECRET_EXCHANGE")) {
    return translate("Cấu hình đăng nhập chưa hoàn tất — thử lại sau ít phút.");
  }
  // Lỗi trao đổi token từ Discord (5xx) → Discord đang sự cố, không phải lỗi dashboard.
  const m = raw.match(/Discord token API lỗi (\d{3})/);
  if (m && Number(m[1]) >= 500) {
    return translate(
      "Discord đang gặp sự cố tạm thời (lỗi {p0} từ phía Discord). Vui lòng thử lại sau ít phút — trạng thái: status.discord.com",
      { p0: m[1] },
    );
  }
  if (/Không lấy được thông tin người dùng \((\d{3})\)/.test(raw)) {
    const code = raw.match(/\((\d{3})\)/)?.[1];
    if (code && Number(code) >= 500) {
      return translate(
        "Discord đang gặp sự cố tạm thời (lỗi {p0} từ phía Discord). Vui lòng thử lại sau ít phút — trạng thái: status.discord.com",
        { p0: code },
      );
    }
  }
  // Server trả lý do tiếng Việt để không lộ chi tiết nội bộ; ánh xạ các lý do
  // biết trước sang thông điệp đã bản dịch để EN/DE không bị rơi về tiếng Việt.
  const knownReasons: Array<[RegExp, string]> = [
    [/Quá nhiều lượt đăng nhập/, "Quá nhiều lượt đăng nhập — thử lại sau ít phút"],
    [/Chưa cấu hình redirect_uri/, "Chưa cấu hình redirect_uri cho phép trên deployment"],
    [/redirect_uri không nằm/, "Địa chỉ callback không được phép — kiểm tra cấu hình OAuth"],
    [/Mã OAuth hoặc PKCE/, "Mã OAuth hoặc PKCE không hợp lệ"],
    [/Không kết nối được tới Discord/, "Không kết nối được tới Discord — thử lại sau ít phút"],
    [/Discord không trả (access token|dữ liệu)/, "Discord không trả dữ liệu hợp lệ — thử lại"],
    [/Trao đổi code với Discord/, "Trao đổi mã đăng nhập với Discord thất bại"],
    [/Không ghi được phiên/, "Không ghi được phiên đăng nhập — thử lại"],
    [/DISCORD_CLIENT_ID chưa/, "DISCORD_CLIENT_ID chưa được cấu hình trên deployment"],
  ];
  for (const [pattern, message] of knownReasons) {
    if (pattern.test(raw)) return translate(message);
  }
  return translate("Đăng nhập thất bại, vui lòng thử lại.");
}

export default function DiscordCallback() {
  const navigate = useNavigate();
  const exchangeAndLogin = useAction(api.sessionAuth.exchangeAndLogin);
  // Làm mới im lặng: authorization code + PKCE được exchange server-side; client không tự báo.
  const refreshGuildsServer = useAction(api.sessionAuth.refreshGuildsServer);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const oauthError = params.get("error");
    const savedState = sessionStorage.getItem(OAUTH_STATE_KEY);
    const verifier = sessionStorage.getItem(OAUTH_VERIFIER_KEY);
    const returnTo = sessionStorage.getItem("wio_oauth_return") ?? "/dashboard";

    async function run() {
      // Luồng làm mới im lặng (dashboard chuyển hướng tới đây, không đăng nhập mới).
      const silentState = sessionStorage.getItem(SILENT_STATE_KEY);
      const isSilent = !!silentState && silentState === state;
      if (isSilent) {
        sessionStorage.removeItem(SILENT_STATE_KEY);
        const silentVerifier = sessionStorage.getItem(SILENT_VERIFIER_KEY);
        sessionStorage.removeItem(SILENT_VERIFIER_KEY);
        const silentReturn = safeRedirectPath(sessionStorage.getItem("wio_silent_return"));
        sessionStorage.removeItem("wio_silent_return");
        async function runSilent() {
          if (oauthError || !code || !silentVerifier) {
            window.location.replace(`${silentReturn}?silent=err`);
            return;
          }
          try {
            const sessToken = getSessionToken();
            if (!sessToken) {
              window.location.replace(`${silentReturn}?silent=err`);
              return;
            }
            const refreshed = await refreshGuildsServer({
              token: sessToken,
              code,
              codeVerifier: silentVerifier,
              redirectUri: window.location.origin + "/discord/callback",
            });
            window.location.replace(`${silentReturn}?${refreshed.ok ? "silent=ok" : "silent=err"}`);
          } catch {
            window.location.replace(`${silentReturn}?silent=err`);
          }
        }
        void runSilent();
        return;
      }

      if (oauthError || !code) {
        setError(oauthError ?? translate("Thiếu mã xác nhận từ Discord."));
        return;
      }
      if (!verifier || !savedState || savedState !== state) {
        // Mất verifier/state = storage của TAB này không còn (mở lại tab sau khi
        // tắt máy, trình duyệt trong app Discord/WebView có vùng lưu trữ riêng,
        // chế độ riêng tư, hoặc người dùng quay lại bằng Back).
        //
        // Nếu PHIÊN VẪN CÒN SỐNG thì tuyệt đối KHÔNG được hiện "đăng nhập lại":
        // người dùng đã đăng nhập, chỉ là lượt trao đổi code lần này không kiểm
        // chứng được. Trước đây rơi vào đây là màn "Đăng nhập thất bại" khô khan
        // — đúng cái người dùng mô tả là "đăng nhập vô rồi mà cứ yêu cầu đăng
        // nhập lại". Đưa thẳng về trang đích (returnTo đã qua safeRedirectPath).
        if (getSessionToken()) {
          navigate(safeRedirectPath(returnTo), { replace: true });
          return;
        }
        setError(translate("Phiên đăng nhập không hợp lệ. Vui lòng thử lại."));
        return;
      }
      try {
        // Đăng nhập an toàn: server tự trao đổi code với Discord (kèm
        // client_secret) và tự tạo session token — client không thể giả mạo
        // danh tính hay tự cấp token cho mình. Lỗi trả { ok: false, reason }
        // (không throw — Convex prod mask message action).
        const result = await exchangeAndLogin({
          code,
          codeVerifier: verifier,
          redirectUri: window.location.origin + "/discord/callback",
        });
        if (!result.ok || !result.token) {
          setError(friendlyAuthError(!result.ok ? (result.reason ?? "") : ""));
          return;
        }
        setSessionToken(result.token);
        sessionStorage.removeItem(OAUTH_VERIFIER_KEY);
        sessionStorage.removeItem(OAUTH_STATE_KEY);
        sessionStorage.removeItem("wio_oauth_return");
        navigate(safeRedirectPath(returnTo), { replace: true });
      } catch (e) {
        setError(friendlyAuthError(e instanceof Error ? e.message : ""));
      }
    }
    void run();
  }, [exchangeAndLogin, navigate]);

  return (
    <main id="main" tabIndex={-1} className="flex min-h-screen items-center justify-center px-4">
      <SkipLink />
      <div className="w-full max-w-md text-center">
        {error ? (
          <div className="rounded-2xl border border-danger/30 bg-danger/10 p-4 sm:p-6">
            <AlertTriangle className="mx-auto h-8 w-8 text-danger" />
            <h1 className="mt-3 font-display text-lg font-semibold">
              {translate("Đăng nhập thất bại")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <div className="mt-5 flex justify-center gap-3">
              <Link to="/auth">
                <Button variant="secondary">{translate("Thử lại")}</Button>
              </Link>
              <Link to="/">
                <Button variant="ghost">{translate("Về trang chủ")}</Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <PageSplash minHeight="min-h-0" label={translate("Đang xác thực với Discord…")} />
          </div>
        )}
      </div>
    </main>
  );
}
