import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexReactClient, ConvexProvider } from "convex/react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import RootErrorBoundary, { RouteErrorBoundary } from "./components/RootErrorBoundary";
import { LangProvider, prepareInitialLanguage } from "./lib/i18n";
import { resolveConvexUrl } from "./lib/convexUrl";
import { clearLegacyDiscordAccess } from "./lib/discord";
import { finishBootOverlay } from "./lib/bootOverlay";
import { installStaleChunkRecovery } from "./lib/staleChunk";
import "./index.css";

clearLegacyDiscordAccess();
installStaleChunkRecovery();

async function start() {
  try {
    const convex = new ConvexReactClient(resolveConvexUrl());
    // Từ điển EN/DE nạp lười. Trước đây chờ tới 4s trước khi mount React —
    // mạng chậm là màn preloader đứng im dù toàn bộ app đã sẵn sàng. Giờ chỉ
    // chờ tối đa 250ms (đủ cho bản đã cache); tới muộn thì LangProvider tự vẽ
    // lại nhờ `dictListeners`, không chặn first paint.
    await prepareInitialLanguage(250);

    // DATA ROUTER (createBrowserRouter) thay BrowserRouter: `useBlocker` chỉ
    // hoạt động dưới data router. App vẫn giữ <Routes> bên trong qua splat
    // route — không phải chuyển toàn bộ cây route, chỉ đổi nhà cung cấp
    // context để chặn được điều hướng SPA khi form còn thay đổi chưa lưu.
    // `errorElement` BẮT BUỘC: thiếu nó, router tự bọc route gốc bằng boundary
    // mặc định của react-router và lỗi lazy chunk/route render bị nuốt trước khi
    // tới RootErrorBoundary (bọc ngoài RouterProvider) — người dùng thấy màn
    // lỗi trắng tiếng Anh thay vì màn "Máy chủ đang gặp sự cố".
    const router = createBrowserRouter([
      { path: "*", element: <App />, errorElement: <RouteErrorBoundary /> },
    ]);

    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        <LangProvider>
          <ConvexProvider client={convex}>
            <RootErrorBoundary>
              <RouterProvider router={router} />
            </RootErrorBoundary>
          </ConvexProvider>
        </LangProvider>
      </React.StrictMode>,
    );
  } catch (error) {
    // Bootstrap chết TRƯỚC khi React mount (resolveConvexUrl throw fail-closed,
    // DOM thiếu #root, lỗi parse bundle…) → không component nào chạy được để đóng
    // preloader. Gỡ lớp phủ ở đây để người dùng nhìn thấy trang trắng + lỗi ở
    // console, thay vì màn "Protogon. 0%" kẹt vĩnh viễn.
    console.error("[bootstrap] Khởi động app thất bại:", error);
    finishBootOverlay();
    throw error;
  }
}

void start();
