import { Component, useEffect, type ErrorInfo, type ReactNode } from "react";
import { useRouteError } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import BotLogo from "./BotLogo";
import { Button } from "./ui/button";
import { finishBootOverlay } from "../lib/bootOverlay";

import { translate } from "../lib/i18n";

/**
 * Màn hình lỗi dùng chung cho CẢ HAI lớp chặn:
 *   · `RootErrorBoundary` — lỗi React ngoài router (provider, bootstrap…).
 *   · `RouteErrorBoundary` — lỗi do router bắt (lazy chunk 404 sau deploy,
 *     loader/render của route ném).
 * Tách phần NHÌN ra một chỗ để hai lớp không lệch giao diện.
 */
export function ErrorScreen() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
      <div className="relative flex max-w-lg flex-col items-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary p-2 shadow-sm">
          <BotLogo className="h-full w-full" />
        </span>

        <h1 className="mt-7 font-display text-2xl font-bold tracking-tight md:text-3xl">
          {translate("Máy chủ đang gặp sự cố 🌸")}{" "}
        </h1>

        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          {translate(
            "Protogon không kết nối được với máy chủ dữ liệu (backend Convex đang trả lỗi). Trang web sẽ hoạt động lại ngay khi máy chủ khỏe — bạn có thể thử tải lại.",
          )}{" "}
        </p>

        <Button size="lg" className="mt-7" onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4" /> {translate("Tải lại trang")}{" "}
        </Button>
      </div>
    </main>
  );
}

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Lớp chặn lỗi TOÀN TRANG: nếu một query Convex thất bại (backend down, hàm
 * chưa deploy…) mà không phần nào chặn được, thay vì trắng trang chỉ còn nền,
 * hiển thị màn hình báo lỗi theo đúng chủ đề Protogon + nút tải lại.
 */
export default class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[RootErrorBoundary]", error, info.componentStack);
    // Preloader che toàn màn hình → phải mở ra, nếu không người dùng chỉ thấy
    // loading mãi dù app đã quyết định hiện màn báo lỗi. finishBootOverlay tự
    // chọn đường: dùng boot.js nếu còn sống, tự gỡ DOM nếu /boot.js hỏng —
    // KHÔNG được phụ thuộc vào file ngoài đang bị nghi ngờ.
    finishBootOverlay();
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <ErrorScreen />;
  }
}

/**
 * `errorElement` của data router.
 *
 * Vì sao cần lớp RIÊNG: `createBrowserRouter` luôn tự bọc route gốc bằng
 * `RenderErrorBoundary` của nó. Không khai `errorElement`, lỗi render/lazy
 * chunk bị router nuốt và hiện màn lỗi mặc định của react-router (trắng,
 * tiếng Anh) — `RootErrorBoundary` bọc ngoài `RouterProvider` không bao giờ
 * thấy lỗi đó. Đây là đường hỏng thật khi chunk cũ bị xoá sau deploy.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();
  useEffect(() => {
    console.error("[RouteErrorBoundary]", error);
    finishBootOverlay();
  }, [error]);
  return <ErrorScreen />;
}
