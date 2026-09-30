import { Navigate, useLocation } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { getSessionToken } from "../lib/discord";
import PageSplash from "./PageSplash";

import { translate } from "../lib/i18n";
export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const token = getSessionToken();
  // Chưa đăng nhập → skip (RequireAuth sẽ chuyển hướng sang /auth ngay).
  const me = useQuery(api.sessions.me, token ? { token } : "skip");

  if (!token) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?returnTo=${returnTo}`} replace />;
  }

  if (me === undefined) {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-background"
        aria-busy="true"
      >
        {/* Dùng chung PageSplash (vòng sóng) chứ không tự dựng Loader2: mở
            dashboard là đi qua màn này TRƯỚC PageSplash của trang, hai màn
            liền nhau phải trông như một. */}
        <h1 className="sr-only">{translate("Đang kiểm tra phiên đăng nhập")}</h1>
        <PageSplash minHeight="min-h-screen" label={translate("Đang kiểm tra phiên đăng nhập…")} />
      </main>
    );
  }

  if (me === null) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?returnTo=${returnTo}`} replace />;
  }

  return <>{children}</>;
}
