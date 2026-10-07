import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Hiển thị khi phần này lỗi — mặc định ẩn hẳn phần đó. */
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Lớp chặn lỗi cho TỪNG PHẦN NHỎ của trang (nav, header, avatar…).
 * Khi query Convex của phần đó thất bại (vd: backend đang down), phần này
 * tự ẩn đi thay vì làm sập cả trang — phần còn lại vẫn hiển thị bình thường.
 */
export default class SectionBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[SectionBoundary]", error?.message ?? error, info.componentStack);
  }

  render() {
    if (this.state.error) return this.props.fallback ?? null;
    return this.props.children;
  }
}
