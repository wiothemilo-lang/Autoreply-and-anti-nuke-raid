import { lazy, Suspense, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Route, Routes } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { Toaster } from "sonner";
import NotFound from "./pages/NotFound";
import RequireAuth from "./components/RequireAuth";

import { translate, useT } from "./lib/i18n";
import { syncRouteMetadata } from "./lib/seo";
// Route-level code splitting: khách vào landing chỉ tải Landing + vendors.
// Các trang dashboard/admin nặng (nhiều panel) chỉ tải khi thật sự mở —
// giảm đáng kể JS parse/execute lần đầu.
const Landing = lazy(() => import("./pages/Landing"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const DiscordCallback = lazy(() => import("./pages/DiscordCallback"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const GuildPage = lazy(() => import("./pages/GuildPage"));
const GuildHistory = lazy(() => import("./pages/GuildHistory"));
const Monitor = lazy(() => import("./pages/Monitor"));
const FeaturesPage = lazy(() => import("./pages/FeaturesPage"));
const Admin = lazy(() => import("./pages/Admin"));
const StatsPage = lazy(() => import("./pages/StatsPage"));
// Trang pháp lý: 3 văn bản dùng CHUNG một component (khác tham số slug) — nội
// dung nằm ở src/lib/legalContent.ts, không nhân bản code 3 lần.
const LegalPage = lazy(() => import("./pages/LegalPage"));

function RouteMetadataSync({ lang }: { lang: "vi" | "en" | "de" }) {
  const { pathname } = useLocation();
  useEffect(() => {
    syncRouteMetadata(pathname, lang);
  }, [pathname, lang]);
  return null;
}

/**
 * Màn hình chờ khi chunk route đang tải lần đầu: logo + thanh tiến trình mảnh
 * chạy vô hạn ở đỉnh trang (kiểu GitHub/YouTube — người dùng thấy "đang đi"
 * thay vì spinner đứng yên giữa màn hình trống).
 */
function RouteFallback() {
  return (
    <main className="flex min-h-screen flex-col" aria-busy="true">
      {/* Progress bar mảnh bám đỉnh — như top loading bar quen thuộc */}
      <div aria-hidden className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden">
        <div className="h-full w-1/3 animate-route-progress bg-foreground" />
      </div>
      <div
        className="flex flex-1 flex-col items-center justify-center gap-4"
        role="status"
        aria-live="polite"
      >
        <img src="/favicon.svg" alt="" className="h-10 w-10 animate-pulse-fade" />
        <p className="text-xs tracking-wide text-muted-foreground">{translate("Đang tải…")}</p>
      </div>
    </main>
  );
}

export default function App() {
  // App là consumer của LangContext: khi người dùng đổi ngôn ngữ, App re-render
  // và tạo lại element cho toàn bộ Routes → mọi component con vẽ lại bằng
  // translate() ở ngôn ngữ mới (translate đọc trạng thái module lúc render).
  const { lang } = useT();
  return (
    <>
      <RouteMetadataSync lang={lang} />
      <MotionConfig reducedMotion="user">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/discord/callback" element={<DiscordCallback />} />
            {/* Trang công khai, không cần đăng nhập: Discord yêu cầu URL riêng cho
              Terms of Service và Privacy Policy khi xác minh bot. */}
            <Route path="/terms" element={<LegalPage slug="terms" />} />
            <Route path="/privacy" element={<LegalPage slug="privacy" />} />
            <Route path="/data-deletion" element={<LegalPage slug="data-deletion" />} />
            <Route path="/monitor" element={<Monitor />} />
            {/* Trang tính năng công khai (SEO quốc tế, nội dung 3 thứ tiếng). */}
            <Route path="/features" element={<FeaturesPage />} />
            {/* Alias dễ nhớ của trang giám sát — không nhân bản component: cùng
                1 trang Monitor, 2 đường vào (/status dùng cho status page công
                khai, /monitor là tên gọi gốc trong dashboard link cũ). */}
            <Route path="/status" element={<Monitor />} />
            <Route
              path="/admin"
              element={
                <RequireAuth>
                  <Admin />
                </RequireAuth>
              }
            />
            <Route
              path="/stats"
              element={
                <RequireAuth>
                  <StatsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/dashboard"
              element={
                <RequireAuth>
                  <Dashboard />
                </RequireAuth>
              }
            />
            <Route
              path="/dashboard/:guildId"
              element={
                <RequireAuth>
                  <GuildPage />
                </RequireAuth>
              }
            />
            <Route
              path="/dashboard/:guildId/history"
              element={
                <RequireAuth>
                  <GuildHistory />
                </RequireAuth>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </MotionConfig>
      <Toaster
        position="top-right"
        theme="system"
        toastOptions={{
          className: "rounded-[0.625rem]",
        }}
      />
    </>
  );
}
