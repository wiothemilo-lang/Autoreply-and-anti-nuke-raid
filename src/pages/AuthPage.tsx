import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { ExternalLink, KeyRound, ShieldCheck, Loader2 } from "lucide-react";
import { LogoMark } from "../components/BotLogo";
import { Button } from "../components/ui/button";
import HaimiyaChat from "../components/HaimiyaChat";
import PageSplash from "../components/PageSplash";
import SkipLink from "../components/SkipLink";
import { api } from "../../convex/_generated/api";
import { usePublicConfig } from "../lib/usePublicConfig";
import { Card, CardContent, CardDescription, CardHeader } from "../components/ui/card";
import {
  OAUTH_VERIFIER_KEY,
  OAUTH_STATE_KEY,
  REMEMBER_LOGIN_KEY,
  buildAuthorizeUrl,
  generateChallenge,
  generateVerifier,
  getSessionToken,
  randomState,
  setRememberLogin,
} from "../lib/discord";
import { resolveAuthPageState } from "../lib/authRoute";

import LangSwitch from "../components/LangSwitch";

import { translate } from "../lib/i18n";
const DISCORD_LOGO = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
    <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
);

export default function AuthPage() {
  const { clientId, loading: configLoading, error: configError } = usePublicConfig();
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(
    () => sessionStorage.getItem(REMEMBER_LOGIN_KEY) !== "0",
  );
  const location = useLocation();
  const returnTo = new URLSearchParams(location.search).get("returnTo") ?? "/dashboard";
  // Phiên còn sống thì `/auth` KHÔNG được hỏi lại (bug thật: bấm Back sau khi
  // đăng nhập, hoặc mở lại bookmark `/auth`, là thấy form đăng nhập → người
  // dùng tưởng bị đăng xuất → đăng nhập lần nữa). Quyết định nằm ở hàm thuần
  // `resolveAuthPageState` (có test hermetic, kèm chặn đích vòng lặp `/auth`).
  const sessionToken = getSessionToken();
  const me = useQuery(
    api.sessions.me,
    sessionToken ? ({ token: sessionToken } as { token: string }) : "skip",
  );
  const authState = resolveAuthPageState({
    hasToken: Boolean(sessionToken),
    me,
    returnTo,
  });

  if (authState.kind === "app") {
    return <Navigate to={authState.to} replace />;
  }
  if (authState.kind === "splash") {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-background"
        aria-busy="true"
      >
        <h1 className="sr-only">{translate("Đang kiểm tra phiên đăng nhập")}</h1>
        <PageSplash minHeight="min-h-screen" label={translate("Đang kiểm tra phiên đăng nhập…")} />
      </main>
    );
  }

  async function startOAuth() {
    if (!clientId) return;
    setLoading(true);
    try {
      const verifier = generateVerifier();
      const challenge = await generateChallenge(verifier);
      const state = randomState();
      sessionStorage.setItem(OAUTH_VERIFIER_KEY, verifier);
      sessionStorage.setItem(OAUTH_STATE_KEY, state);
      sessionStorage.setItem("wio_oauth_return", returnTo);
      // Lưu lựa chọn "lưu đăng nhập" để callback quyết định nơi lưu token (7 ngày).
      setRememberLogin(remember);
      window.location.href = buildAuthorizeUrl(clientId, state, challenge);
    } catch {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <SkipLink />
      <HaimiyaChat position="dashboard" />
      <LangSwitch showIcon className="absolute right-4 top-4 z-20" />

      <main id="main" tabIndex={-1} className="relative grid w-full max-w-4xl gap-8 lg:grid-cols-2">
        {/* MỘT khối trái duy nhất: logo + H1 + danh sách. Mobile chỉ hiện H1
            (logo + danh sách ẩn bằng lg:*) và nhờ order để khối nằm DƯỚI card;
            desktop trở lại cột trái. TRƯỚC ĐÂY H1 bị NHÂN ĐÔI trong DOM — bản
            mobile `lg:hidden` + bản desktop trong cột trái — CSS hỏng là lòi
            cả hai H1; công cụ tìm kiếm và trình đọc màn hình cũng đọc nhầm
            cấu trúc heading của trang. */}
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="order-2 flex flex-col justify-center lg:order-1"
        >
          <Link to="/" className="mb-8 hidden items-center gap-2.5 lg:flex">
            <LogoMark className="h-10 w-10" />
            <span className="font-display text-xl font-bold">
              Protogon<span className="text-primary">.</span>
            </span>
          </Link>
          <h1 className="text-center font-display text-2xl font-bold tracking-tight lg:text-left lg:text-4xl lg:leading-tight">
            {translate("Quản lý bot Discord của bạn từ một nơi")}{" "}
          </h1>
          <ul className="mt-8 hidden space-y-4 lg:block">
            {[
              // i18n-ok: nhãn được dịch lúc render bằng translate(t)
              "Hệ thống nhiệt độ 4 giai đoạn + warn tích lũy",
              "Join Gate chống selfbot khi vào server",
              "Chặn link độc hại & file nguy hiểm",
              "Công cụ mod: timeout, kick, ban, purge kèm lý do",
              "Khu vực riêng tư dành cho chủ sở hữu bot 🔒",
              "Tùy chọn lưu / không lưu đăng nhập",
            ].map((t) => (
              <li key={t} className="flex items-center gap-3 text-muted-foreground">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <ShieldCheck className="h-3.5 w-3.5" />
                </span>
                {translate(t)}
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="order-1 lg:order-2"
        >
          <Card className="border-border/80 bg-card/95 shadow-lg backdrop-blur">
            <CardHeader className="text-center">
              <h2 className="font-display text-2xl font-semibold leading-tight tracking-tight">
                {translate("Đăng nhập vào Protogon")}
              </h2>
              <CardDescription>
                {translate("Sử dụng tài khoản Discord để quản lý các server của bạn")}{" "}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {configLoading ? (
                // Đang tải cấu hình — chỉ hiện spinner nhỏ, không hiện hộp cảnh báo vàng
                <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-secondary/30 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  {translate("Đang kết nối…")}{" "}
                </div>
              ) : clientId ? (
                <>
                  <Button
                    size="lg"
                    className="w-full bg-foreground text-primary-foreground shadow-none hover:bg-foreground/90"
                    onClick={startOAuth}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : DISCORD_LOGO}
                    {loading
                      ? translate("Đang chuyển tới Discord…")
                      : translate("Đăng nhập với Discord")}
                  </Button>
                  <div className="flex select-none items-center justify-center gap-2 text-xs text-muted-foreground">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={remember}
                      aria-label={translate(remember ? "Không lưu đăng nhập" : "Lưu đăng nhập")}
                      onClick={() => setRemember((r) => !r)}
                      className={`relative h-5 w-9 rounded-full transition-colors ${
                        remember ? "bg-primary" : "bg-secondary"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                          remember ? "left-[18px]" : "left-0.5"
                        }`}
                      />
                    </button>
                    {remember ? (
                      <span className="text-foreground/80">
                        <b className="text-primary">{translate("Lưu đăng nhập")}</b>{" "}
                        {translate("trên thiết bị này")}{" "}
                        <b className="text-primary/70">{translate("(7 ngày)")}</b>
                      </span>
                    ) : (
                      <span>
                        <b>{translate("Không lưu đăng nhập")}</b>{" "}
                        {translate("— đóng trình duyệt sẽ phải đăng nhập lại")}{" "}
                      </span>
                    )}
                  </div>
                </>
              ) : configError ? (
                <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm">
                  <p className="flex items-center gap-2 font-semibold text-danger">
                    <ShieldCheck className="h-4 w-4" />{" "}
                    {translate("Không kết nối được máy chủ")}{" "}
                  </p>
                  <p className="mt-2 leading-relaxed text-danger/80">
                    {translate(
                      "Máy chủ backend của Protogon hiện không truy cập được từ trang web này (lỗi kết nối Convex). Nếu bạn là quản trị viên, hãy kiểm tra cấu hình",
                    )}{" "}
                    <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs">
                      VITE_CONVEX_URL
                    </code>{" "}
                    {translate("và thử lại sau ít phút.")}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-secondary p-4 text-sm">
                  <p className="flex items-center gap-2 font-semibold text-foreground">
                    <KeyRound className="h-4 w-4" /> {translate("Cần cấu hình Client ID")}{" "}
                  </p>
                  <p className="mt-2 leading-relaxed text-muted-foreground">
                    {translate("Để đăng nhập, bạn cần tạo ứng dụng Discord và điền")}{" "}
                    <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs">
                      DISCORD_CLIENT_ID
                    </code>{" "}
                    {translate("vào mục API Keys. Cách làm:")}
                  </p>
                  <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-muted-foreground">
                    <li>{translate("Tạo bot tại Discord Developer Portal")}</li>
                    <li>
                      {translate("Sao chép")} <b>Application ID</b> (Client ID)
                    </li>
                    <li>
                      {translate("Dán vào API Keys với tên")} <b>DISCORD_CLIENT_ID</b>
                    </li>
                    <li>
                      {translate("Thêm redirect URI")}{" "}
                      <code className="rounded bg-black/30 px-1 font-mono text-xs">
                        {window.location.origin}/discord/callback
                      </code>{" "}
                      {translate("vào")} <b>OAuth2 → Redirects</b> {translate("của ứng dụng")}{" "}
                    </li>
                  </ol>
                </div>
              )}

              <p className="text-center text-xs leading-relaxed text-muted-foreground">
                {translate("Khi đăng nhập, Protogon cần quyền")}{" "}
                <b className="text-foreground">identify</b> {translate("và")}{" "}
                <b className="text-foreground">guilds</b> {translate("và")}{" "}
                {translate(
                  "để hiển thị server bạn quản lý. Chúng tôi không lưu mật khẩu hay tin nhắn của bạn.",
                )}{" "}
              </p>

              <div className="flex items-center justify-between border-t border-border pt-4 text-xs">
                <Link
                  to="/"
                  aria-label={translate("← Về trang chủ")}
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  {translate("← Về trang chủ")}{" "}
                </Link>
                <a
                  href="https://discord.com/developers/applications"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-primary"
                >
                  Discord Developer Portal <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}
