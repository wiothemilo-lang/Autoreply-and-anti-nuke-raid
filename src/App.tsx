import { lazy, Suspense, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Route, Routes } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { Toaster } from "sonner";
import NotFound from "./pages/NotFound";
import RequireAuth from "./components/RequireAuth";
import SiteNav from "./components/SiteNav";
import RouteLoader from "./components/RouteLoader";
import SkipLink from "./components/SkipLink";

import { useT } from "./lib/i18n";
import { finishBootOverlay } from "./lib/bootOverlay";
import { syncRouteMetadata } from "./lib/seo";

/**
 * Chốt an toàn của BootSignal: app hiện ra chậm nhất sau bao lâu kể từ khi
 * React mount, bất kể font đã tải xong chưa. 3s đủ cho lần tải đầu bình
 * thường (fonts.ready thường < 1s) và đủ ngắn để người dùng không tưởng web
 * treo. Treo `fonts.ready` (CDN font chết) là kịch bản có thật.
 */
const BOOT_SIGNAL_CAP_MS = 3000;
// Route-level code splitting: khách vào landing chỉ tải Landing + vendors.
// Các trang dashboard/admin nặng (nhiều panel) chỉ tải khi thật sự mở —
// giảm đáng kể JS parse/execute lần đầu.
const Landing = lazy(() => import("./pages/Landing"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const DiscordCallback = lazy(() => import("./pages/DiscordCallback"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const GuildPage = lazy(() => import("./pages/GuildPage"));
const GuildHistory = lazy(() => import("./pages/GuildHistory"));
const GuildIncidents = lazy(() => import("./pages/GuildIncidents"));
const Monitor = lazy(() => import("./pages/Monitor"));
const FeaturesPage = lazy(() => import("./pages/FeaturesPage"));
const Admin = lazy(() => import("./pages/Admin"));
const StatsPage = lazy(() => import("./pages/StatsPage"));
// Trang pháp lý: 3 văn bản dùng CHUNG một component (khác tham số slug) — nội
// dung nằm ở src/lib/legalContent.ts, không nhân bản code 3 lần.
const LegalPage = lazy(() => import("./pages/LegalPage"));
const DonatePage = lazy(() => import("./pages/DonatePage"));
const FeedbackPage = lazy(() => import("./pages/FeedbackPage"));
const PremiumPage = lazy(() => import("./pages/PremiumPage"));

function RouteMetadataSync({ lang }: { lang: "vi" | "en" | "de" }) {
  const { pathname } = useLocation();
  useEffect(() => {
    syncRouteMetadata(pathname, lang);
  }, [pathname, lang]);
  return null;
}

declare global {
  interface Window {
    /** Preloader trong index.html gọi hàm này để fade khi app đã vẽ xong. */
    __bootDone?: () => void;
  }
}

/**
 * Báo preloader (index.html) biết đã tới lúc hiện web.
 *
 * Đặt BÊN TRONG <Suspense> là cố ý: chunk route đầu tiên chưa tải xong thì
 * component này chưa mount → preloader giữ nguyên, không bao giờ thấy cảnh
 * preloader biến mất rồi lại nhảy sang RouteFallback. Chờ font sẵn sàng để
 * trang hiện ra không bị FOUT ngay sau khi màn che mờ.
 *
 * CHỐT AN TOÀN + ĐƯỜNG RA DỰ PHÒNG (đều đi qua finishBootOverlay):
 *   · `document.fonts.ready` treo được (fonts.googleapis.com chậm/bị chặn/
 *     mạng đứt) — treo là kẹt preloader vĩnh viễn nên có chốt 3s.
 *   · /boot.js hỏng → `window.__bootDone` không tồn tại → finishBootOverlay tự
 *     gỡ lớp phủ bằng DOM. Xem src/lib/bootOverlay.ts.
 */
function BootSignal() {
  useEffect(() => {
    let cancelled = false;
    const done = () => {
      if (!cancelled) finishBootOverlay();
    };
    // Chốt 3s: app phải hiện ra kể cả khi font chưa tải xong — màn hình trắng
    // có chủ đích, còn lớp phủ kẹt vĩnh viễn thì không.
    const cap = window.setTimeout(done, BOOT_SIGNAL_CAP_MS);
    if (document.fonts?.ready) {
      document.fonts.ready.then(done).catch(done);
    } else {
      done();
    }
    return () => {
      cancelled = true;
      window.clearTimeout(cap);
    };
  }, []);
  return null;
}

/**
 * Màn chờ toàn màn hình khi đang tải chunk của route mới.
 *
 * Dùng component dựng sẵn ở `components/RouteLoader.tsx` — giải thích vì sao
 * bố cục phải KHÁC HẲN preloader #boot nằm ở file đó.
 *
 * IMPORT TRỰC TIẾP, KHÔNG lazy(): fallback của <Suspense> phải nằm sẵn trong
 * bundle chính. Nếu lazy() nó, lúc route treo React phải tải chunk của chính
 * màn chờ — màn chờ lại cần tải thì treo tiếp, thành vòng lặp và người dùng
 * chỉ thấy trang trắng.
 */
const RouteFallback = RouteLoader;

export default function App() {
  // App là consumer của LangContext: khi người dùng đổi ngôn ngữ, App re-render
  // và tạo lại element cho toàn bộ Routes → mọi component con vẽ lại bằng
  // translate() ở ngôn ngữ mới (translate đọc trạng thái module lúc render).
  const { lang } = useT();
  const { pathname } = useLocation();
  // Bộ chọn trang nằm trong HEADER (SiteNav). Ẩn trên /auth và
  // /discord/callback — hai màn hình tạm, thêm nav ở đó chỉ gây nhiễu. Ẩn
  // trên landing vì landing có header riêng to hơn (components/landing/Nav
  // đã cắm cùng `PagesMenu` vào cụm bên phải) — hai header chồng nhau sẽ
  // thành hai tầng dính trên đỉnh.
  const transient = pathname === "/auth" || pathname === "/discord/callback";
  const isLanding = pathname === "/";
  return (
    <>
      {/* SKIP LINK PHẢI ĐỨNG TRƯỚC MỌI THỨ FOCUS ĐƯỢC — đặt ở đây (không
          trong từng trang) chính vì header chung nằm trước nội dung trang:
          để trong trang thì người dùng bàn phím phải Tab qua TOÀN BỘ header
          (logo, menu trang) trước khi tới được lối tắt — đúng thứ WCAG 2.4.1
          sinh ra để tránh. Test trình duyệt E khoá điều này: Tab đầu tiên
          trong mọi trang phải dừng ở liên kết "Bỏ qua tới nội dung". */}
      <SkipLink />
      <RouteMetadataSync lang={lang} />
      {/* NGOÀI <Suspense> là cố ý: header không phụ thuộc chunk route nào, để
          trong Suspense thì mỗi lần tải chunk nó bị gỡ ra lắp lại — header
          nháy trắng đúng lúc người dùng đang chờ trang mới. */}
      {!transient && !isLanding && <SiteNav />}
      <MotionConfig reducedMotion="user">
        <Suspense fallback={<RouteFallback />}>
          <BootSignal />
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
            {/* Ủng hộ nhà phát triển + xem trước gói Premium. Cả hai trang công
                khai: ai cũng đọc được, kể cả khách chưa đăng nhập. */}
            <Route path="/donate" element={<DonatePage />} />
            <Route path="/feedback" element={<FeedbackPage />} />
            <Route path="/premium" element={<PremiumPage />} />
            {/* Trang tính năng công khai (SEO quốc tế, nội dung 3 thứ tiếng). */}
            <Route path="/features" element={<FeaturesPage />} />
            {/* Alias dễ nhớ của trang giám sát — không nhân bản component: cùng
                1 trang Monitor. CANONICAL là /monitor; /status chỉ là đường
                vào phụ và hosting đã redirect 301 /status → /monitor (xem
                vercel.json + Dockerfile.web). Route này vẫn tồn tại để
                (1) hosting/dev chưa áp redirect thì không 404,
                (2) seo.ts canonical hóa /status về /monitor thay vì để 2 URL
                tự khai canonical. Khai báo trong src/lib/routes.json. */}
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
            <Route
              path="/dashboard/:guildId/incidents"
              element={
                <RequireAuth>
                  <GuildIncidents />
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
