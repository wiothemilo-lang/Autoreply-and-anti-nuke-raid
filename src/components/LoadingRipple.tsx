/**
 * LoadingRipple — vòng sóng chờ, dùng chung cho MỌI màn chờ trong app.
 *
 * ── VÌ SAO TÁCH RA RIÊNG ──────────────────────────────────────────────────
 * Trước đây có hai bộ màn chờ cùng tồn tại nhưng vẽ theo hai ngôn ngữ khác
 * nhau, và cả hai đều trùng với preloader #boot:
 *   · RouteLoader (chuyển route)  — logo + thanh tiến trình + số %
 *   · PageSplash (đổi server)    — logo cá voi + thanh tiến trình
 * Người dùng vừa thoát màn "Protogon. 42%" lại thấy đúng màn đó lần nữa →
 * tưởng web bị nhân bản / load 2 lần (báo cáo 30/09/2026).
 *
 * Nay CHỈ CÒN MỘT ngôn ngữ hình ảnh: vòng sóng lan quanh chấm ở giữa.
 * Có logo và có thanh tiến trình là quyền riêng của preloader — không màn
 * chờ nào trong React được phép dùng lại, nên không thể nhầm lẫn nữa.
 *
 * ── MOTION ─────────────────────────────────────────────────────────────────
 * Tôn trọng `prefers-reduced-motion`: vòng sóng và vòng xoay tắt hẳn, thay
 * bằng một vòng tròn tĩnh + chấm ở giữa. Người dùng nhạy cảm chuyển động vẫn
 * đọc được "đang tải", chỉ là báo bằng hình thức tĩnh.
 */
export default function LoadingRipple({ className = "h-44 w-44" }: { className?: string }) {
  return (
    <div aria-hidden className={`relative flex items-center justify-center ${className}`}>
      {/* Vòng xoay nét đứt — chuyển động LIÊN TỤC để màn không bao giờ trông
          "đứng hình" giữa hai nhịp nở của vòng sóng.

          Dùng `animate-[spin_9s_linear_infinite]` (shorthand animation trong
          arbitrary value) CHỨ KHÔNG dùng `animate-spin` + `[animation-duration:9s]`:
          `animate-spin` phát ra shorthand `animation: spin 1s ...` và đặt nó
          SAU trong stylesheet nên nó ghi đè animation-duration → vòng quay
          1s, quá nhanh, gây nhoáng. Một khai báo shorthand duy nhất thì không
          ai ghi đè ai. (Đo được trên Chromium: 1s trước khi sửa.) */}
      <span className="absolute inset-0 rounded-full border border-dashed border-foreground/15 motion-safe:animate-[spin_9s_linear_infinite]" />

      <span className="absolute inset-6 rounded-full border border-foreground/20 motion-safe:animate-pulse-ring" />
      <span className="absolute inset-6 rounded-full border border-foreground/20 motion-safe:animate-pulse-ring [animation-delay:0.6s]" />

      {/* Chấm nguồn — neo mắt, đồng thời là chi tiết duy nhất "chạy" khi
          tắt chuyển động. */}
      <span className="relative h-2.5 w-2.5 rounded-full bg-foreground motion-safe:animate-pulse-fade" />
    </div>
  );
}
