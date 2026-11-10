import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";

import { translate } from "../lib/i18n";
interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Lớp chặn lỗi cho từng panel dashboard: nếu một query/mutation Convex thất bại
 * (vd: function chưa được deploy lên backend production), thay vì làm trắng cả
 * trang web, hiển thị thẻ cảnh báo có thể khôi phục. Sidebar vẫn dùng được để
 * chuyển sang mục khác.
 */
export default class PanelErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[PanelErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <Card className="border-danger/30" role="alert">
        <CardContent className="flex flex-col items-start gap-3 p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-danger/15 text-danger">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <p className="font-display font-semibold">
                {translate("Không tải được nội dung mục này")}
              </p>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                {translate(
                  "Có lỗi xảy ra khi kết nối với backend. Trang khác vẫn hoạt động bình thường — bạn có thể chuyển sang mục khác ở sidebar.",
                )}{" "}
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" /> {translate("Tải lại trang")}{" "}
          </Button>
        </CardContent>
      </Card>
    );
  }
}
