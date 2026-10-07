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
 * navItems.ts — nguồn duy nhất cho bộ chọn trang (menu ở header).
 *
 * VÌ SAO TÁCH RA KHỎI COMPONENT: đây là DỮ LIỆU, không phải giao diện. Nằm
 * trong component thì không test được bằng node:test vì file đó là TSX + kéo
 * theo Convex provider. Tách ra để scripts/test-web-contracts.cjs kiểm được
 * điều quan trọng nhất: MỌI trang công khai phải có mặt trong bảng này.
 *
 * LÝ DO CẦN BẢO VỆ: bảng chọn trang cũ chỉ liệt kê 3 mục (/monitor,
 * /dashboard, /admin) trong khi web có 12 route — phần lớn trang không có
 * đường vào từ giao diện, và không có gì báo sai. Đây là loại lỗi im lặng
 * mà test so khớp chuỗi mới bắt được.
 *
 * HAI HÀM THUẦN Ở ĐÂY LÀ CỔNG QUYỀN (07/10/2026): `visibleNavGroups` lọc mục
 * theo vai trò và `navLabelFor` nói đang ở trang nào. Cả hai thuần dữ liệu ⇒
 * test được không cần DOM, không cần Convex, không cần trình duyệt.
 */

export interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Chuỗi tiếng Việt — bọc translate() lúc render. */
  label: string;
  /** Ghi chú nhỏ bên phải (VD "ẨN"). */
  hint?: string;
  /**
   * Chỉ hiện với chủ bot HOẶC quản trị viên nhóm (isAdmin) — dùng cho
   * "Cửa sổ Admin". Trước đây là `ownerOnly`: team vận hành bot chỉ có MỘT
   * tài khoản vào được cửa sổ Admin nên phải dùng chung tài khoản owner.
   */
  adminOnly?: boolean;
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
      { to: "/admin", icon: Lock, label: "Cửa sổ Admin", adminOnly: true },
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

/**
 * Bảng chọn trang ĐÃ LỌC THEO VAI TRÒ — thứ giao diện thật sự vẽ.
 *
 * Nhóm không còn mục nào thì bỏ luôn cả nhóm (không để tiêu đề trống).
 * Hàm thuần: cùng đầu vào luôn cùng đầu ra, nên test không cần DOM.
 */
export function visibleNavGroups(opts: { isAdmin: boolean }): NavGroup[] {
  const isAdmin = opts?.isAdmin === true;
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.adminOnly || isAdmin),
  })).filter((group) => group.items.length > 0);
}

/**
 * Nhãn của TRANG ĐANG MỞ — dùng cho nút mở menu ở header (nút nói rõ "bạn đang
 * ở đâu" thay vì chỉ ghi "Menu", người dùng không phải bấm để biết).
 *
 * Trang con dùng nhãn của mục cha: `/dashboard/g1/history` → "Bảng điều khiển"
 * (đúng khu vực) chứ không phải "Trang chủ". Khớp DÀI NHẤT thắng, nên nếu sau
 * này thêm mục cha–con thì con luôn thắng. Không khớp mục nào (trang pháp lý,
 * 404) → null để nơi gọi tự hiển thị chữ mặc định.
 */
export function navLabelFor(pathname: string): string | null {
  const matched = navPaths()
    .filter((p) => isNavItemActive(pathname, p))
    .sort((a, b) => b.length - a.length)[0];
  if (!matched) return null;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.to === matched) return item.label;
    }
  }
  return null;
}
