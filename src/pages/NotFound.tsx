import { Link } from "react-router-dom";
import { ArrowLeft, LayoutDashboard } from "lucide-react";
import { Button } from "../components/ui/button";
import { getSessionToken } from "../lib/discord";

import { translate } from "../lib/i18n";
/** Trang 404: URL lạ hiển thị thông báo rõ ràng thay vì nhảy im lặng về trang chủ. */
export default function NotFound() {
  const loggedIn = getSessionToken() !== "";
  return (
    <main
      id="main"
      tabIndex={-1}
      className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
    >
      <p className="font-mono text-sm font-semibold text-muted-foreground">404</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">
        {translate("Không tìm thấy trang này")}{" "}
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        {translate(
          "Đường dẫn bạn mở không tồn tại hoặc đã bị đổi. Kiểm tra lại liên kết, hoặc quay về một trong hai trang dưới đây.",
        )}{" "}
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild variant="outline">
          <Link to="/">
            <ArrowLeft className="h-4 w-4" /> {translate("Về trang chủ")}{" "}
          </Link>
        </Button>
        {loggedIn && (
          <Button asChild>
            <Link to="/dashboard">
              <LayoutDashboard className="h-4 w-4" /> {translate("Mở dashboard")}{" "}
            </Link>
          </Button>
        )}
      </div>
    </main>
  );
}
