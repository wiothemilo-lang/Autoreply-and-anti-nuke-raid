import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import { Button } from "../ui/button";
import { HaimiyaAvatar } from "../HaimiyaAvatar";
import SectionBoundary from "../SectionBoundary";
import { useBranding } from "../../lib/useBranding";
import { getSessionToken } from "../../lib/discord";
import type { MeData } from "../../lib/types";

/** Variants chuyển động dùng chung cho các section landing. */
export const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" as const } },
};

export const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

/**
 * Nút mở dashboard thông minh: nếu có token đăng nhập → vào thẳng /dashboard
 * (RequireAuth tự đưa về /auth nếu token hết hạn), ngược lại → sang trang đăng
 * nhập kèm returnTo. Không query backend nên luôn hiển thị kể cả khi máy chủ down.
 */
export function DashboardCta({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "outline";
}) {
  const loggedIn = getSessionToken() !== "";
  const to = loggedIn ? "/dashboard" : "/auth?returnTo=/dashboard";
  return (
    <Button asChild size="lg" variant={variant}>
      <Link to={to}>{children}</Link>
    </Button>
  );
}

/**
 * Avatar Haimiya chống lỗi backend: nếu query branding thất bại (backend down),
 * tự rơi về SVG mặc định thay vì làm sập cả trang.
 */
export function SafeHaimiyaAvatar({ className }: { className?: string }) {
  return (
    <SectionBoundary>
      <SafeHaimiyaAvatarInner className={className} />
    </SectionBoundary>
  );
}

function SafeHaimiyaAvatarInner({ className }: { className?: string }) {
  const branding = useBranding();
  return <HaimiyaAvatar className={className} src={branding?.haimiyaAvatarUrl ?? null} />;
}

/** Hook xác thực dùng chung cho Nav/Footer (subscription me, logout). */
export function useMeSession() {
  const token = getSessionToken();
  // Chưa đăng nhập → skip subscription, không tốn lần đọc hạn mức.
  const me = useQuery(api.sessions.me, token ? { token } : "skip") as MeData | null | undefined;
  return { token, me };
}
