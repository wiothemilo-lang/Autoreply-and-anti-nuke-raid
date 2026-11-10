import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
// LƯU Ý: block `server` (hmr: false) là yêu cầu của Freebuff — KHÔNG sửa.
// Block `build` bên dưới chỉ tách vendor ra khỏi app code để browser cache
// hiệu quả hơn (thay deps hiếm khi đổi → chunk riêng, app đổi → chunk nhỏ).
//
// Vì sao viết bằng FUNCTION chứ không phải object {"vendor-x": ["ten"]}:
// object form chỉ khớp ĐÚNG module gốc. `"convex": ["convex"]` không bắt
// `convex/react`, `convex/values`, `convex/browser` — các subpath đó rơi tung
// vào chunk entry (đo 28/09: chunk app 531KB raw, convex nằm trong đó DÙ
// đã có vendor-convex riêng). Function form khớp theo ĐƯỜNG DẪN nên mỗi thư
// viện chỉ về đúng MỘT chunk, kể cả subpath.
const VENDOR_GROUPS: Record<string, RegExp> = {
  "vendor-react": /node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//,
  "vendor-convex": /node_modules\/convex\//,
  "vendor-motion": /node_modules\/(framer-motion|motion-dom|motion-utils)\//,
  "vendor-icons": /node_modules\/lucide-react\//,
  // three chỉ tới từ các variant toggle WebGL của bộ ThreeUI đã vendor.
  // Sau 10/11/2026 `ui/switch.tsx` import thẳng ModernToggle nên nhánh này
  // KHÔNG còn được dựng vào artifact — giữ khai báo làm lưới an toàn nếu ai
  // đó import lại `SkeuomorphicToggleCollection` (cây shader vẫn được
  // `scripts/_resolve-shaders.cjs` kiểm tra độc lập).
  "vendor-three": /node_modules\/(three|@napi-rs)\//,
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: Number(process.env.PORT || 5173),
    hmr: false,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          for (const [chunk, pattern] of Object.entries(VENDOR_GROUPS)) {
            if (pattern.test(id)) return chunk;
          }
          return undefined;
        },
      },
    },
  },
});
