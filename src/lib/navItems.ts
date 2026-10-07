import {
  Activity,
  BarChart3,
  Crown,
  Heart,
  Home,
  LayoutDashboard,
  Lock,
  MessageSquareHeart,
  Sparkles,
} from "lucide-react";

/**
 * navItems.ts — nguồn duy nhất cho bộ chọn trang (bảng chọn trang nổi).
 *
 * VÌ SAO TÁCH RA KHỎI COMPONENT: đây là DỮ LIỆU, không phải giao diện. Nằm
 * trong Taskbar.tsx thì không test được bằng node:test vì file đó là TSX + kéo
 * theo Convex provider. Tách ra để scripts/test-web-contracts.cjs kiểm được
 * điều quan trọng nhất: MỌI trang công khai phải có mặt trong bảng này.
 *
 * LÝ DO CẦN BẢO VỆ: bảng chọn trang cũ chỉ liệt kê 3 mục (/monitor,
 * /dashboard, /admin) trong khi web có 12 route — phần lớn trang không có
 * đường vào từ giao diện, và không có gì báo sai. Đây là loại lỗi im lặng
 * mà test so khớp chuỗi mới bắt được.
 */

export interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Chuỗi tiếng Việt — bọc translate() lúc render. */
  label: string;
  /** Ghi chú nhỏ bên phải (VD "ẨN"). */
  hint?: string;
  /** Chỉ hiện khi đúng vai trò (isOwner). */
  ownerOnly?: boolean;
  /** Nhấn mạnh — dùng cho lời kêu gọi ủng hộ. */
  accent?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Khám phá",
    items: [
      { to: "/", icon: Home, label: "Trang chủ" },
      { to: "/features", icon: Sparkles, label: "Tính năng" },
      { to: "/monitor", icon: Activity, label: "Giám sát bot" },
      { to: "/feedback", icon: MessageSquareHeart, label: "Góp ý" },
    ],
  },
  {
    title: "Tài khoản",
    items: [
      { to: "/dashboard", icon: LayoutDashboard, label: "Bảng điều khiển" },
      { to: "/stats", icon: BarChart3, label: "Thống kê" },
      { to: "/admin", icon: Lock, label: "Cửa sổ Admin", hint: "ẨN", ownerOnly: true },
    ],
  },
  {
    title: "Ủng hộ",
    items: [
      { to: "/donate", icon: Heart, label: "Ủng hộ nhà phát triển" },
      { to: "/premium", icon: Crown, label: "Gói Premium", accent: true },
    ],
  },
];

/** Mọi đường dẫn trong bảng chọn trang (đã bỏ trùng). */
export function navPaths(): string[] {
  return [...new Set(NAV_GROUPS.flatMap((g) => g.items.map((i) => i.to)))];
}

/**
 * Trang đang mở có khớp mục nav không.
 *
 * `/` chỉ khớp CHÍNH nó — nếu không, trang chủ sẽ sáng ở mọi URL vì mọi
 * đường dẫn đều bắt đầu bằng "/". `/dashboard` khớp cả `/dashboard/g1` vì
 * đó là cùng một khu vực.
 */
export function isNavItemActive(pathname: string, to: string): boolean {
  const path = pathname || "/";
  if (to === "/") return path === "/";
  return path === to || path.startsWith(`${to}/`);
}
