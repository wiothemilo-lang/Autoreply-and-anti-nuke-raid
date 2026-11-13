import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1200px" },
    },
    extend: {
      fontFamily: {
        /* Một họ chữ duy nhất (Vercel style): hierarchy đến từ weight/size,
           không cần font display riêng. */
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        danger: {
          DEFAULT: "hsl(var(--danger))",
          foreground: "hsl(var(--danger-foreground))",
        },
        /* success/warning là màu NGỮ NGHĨA (trạng thái tốt/cần chú ý), không
           phải màu trang trí — cùng nhóm với danger. Trước đây vài nơi dùng
           `bg-success`/`text-warn` nhưng token không tồn tại nên Tailwind
           không sinh CSS: thanh "Điểm cấu hình" vô hình, badge gói mất màu. */
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        /* Thang bo góc dùng chung — mọi chỗ phải chọn ĐÚNG một mốc, không tự
           đặt số riêng (lệch mốc là dấu hiệu UI "dựng vội" rõ nhất):
             sm/md (4/8px)  · nút, input, switch — control nhỏ
             lg (10px)      · mốc token gốc, giữ cho thành phần cũ đang dùng
             xl (12px)      · CARD — card tính năng, bảng, hàng danh sách
             2xl (16px)     · panel lớn / khối nổi bật một mình
             3xl (24px)     · CHỈ ảnh thương hiệu hero (brand-whale)
             full           · pill, badge, avatar
           Đổi một mốc ở đây = đổi đồng loạt mọi nơi đang dùng đúng mốc. */
      },
      boxShadow: {
        /* Scale bóng 3 cấp — mọi card/nút dùng đúng 1 trong 3, hết bóng tùy tiện. */
        sm: "0 1px 2px hsl(var(--shadow-color) / 0.06), 0 1px 3px hsl(var(--shadow-color) / 0.08)",
        DEFAULT: "0 4px 12px -4px hsl(var(--shadow-color) / 0.14)",
        md: "0 4px 12px -4px hsl(var(--shadow-color) / 0.14)",
        lg: "0 12px 32px -12px hsl(var(--shadow-color) / 0.24)",
      },
      keyframes: {
        "route-progress": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(400%)" },
        },
        "pulse-fade": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.7" },
          "70%": { transform: "scale(1.6)", opacity: "0" },
          "100%": { transform: "scale(1.6)", opacity: "0" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
      animation: {
        "route-progress": "route-progress 1.1s cubic-bezier(0.4, 0, 0.2, 1) infinite",
        "pulse-fade": "pulse-fade 1.6s ease-in-out infinite",
        "pulse-ring": "pulse-ring 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        shimmer: "shimmer 2.4s linear infinite",
        float: "float 5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
