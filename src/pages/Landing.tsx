import { motion } from "framer-motion";
import { useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import Nav from "../components/landing/Nav";
import Footer from "../components/landing/Footer";
import HaimiyaChat from "../components/HaimiyaChat";
import HeroChatCard from "../components/landing/HeroChatCard";
import {
  Features,
  AntiNuke,
  HaimiyaSection,
  HowItWorks,
  CtaBanner,
} from "../components/landing/sections";
import { DashboardCta, SafeHaimiyaAvatar } from "../components/landing/shared";
import SkipLink from "../components/SkipLink";
import { usePublicConfig } from "../lib/usePublicConfig";

import { translate } from "../lib/i18n";
export default function Landing() {
  const { discordInvite, facebookUrl } = usePublicConfig();
  // Nạp sẵn chunk /auth khi trình duyệt RẢNH (sau khi landing đã vẽ xong):
  // khách đọc xong hero gần như chắc chắn bấm "Đăng nhập"/"Mở dashboard" —
  // nạp trước lúc rảnh thì cú nhấp đó khỏi chờ mạng, còn không làm chậm lần
  // tải đầu (requestIdleCallback chỉ chạy khi main thread đã thong thả).
  useEffect(() => {
    const warm = () => void import("./AuthPage");
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(warm, { timeout: 3000 });
    } else {
      window.setTimeout(warm, 1500);
    }
  }, []);
  return (
    <div className="relative min-h-screen text-foreground">
      <SkipLink />
      {/* Các phần phụ thuộc backend được bọc chặn lỗi riêng — backend down thì
          phần đó tự ẩn, hero/tính năng/footer vẫn hiển thị đầy đủ. */}
      <Nav />
      <main id="main" tabIndex={-1}>
        {/* ============ HERO ============ */}
        <section className="relative overflow-hidden pb-16 pt-28 md:pb-20 md:pt-32">
          {/* Bố cục hero: hai cột ngay từ đầu. Trước đây ảnh thương hiệu là một
              khối full-width max-w-2xl (~500px cao) đứng một mình giữa trang,
              đẩy tiêu đề + nút bấm xuống dưới màn hình đầu và để lại một khoảng
              trống toàn diện — nhìn như "logo to đùng rồi bỏ trống". Nay ảnh
              thu nhỏ và ghép vào CỘT PHẢI cùng mockup chat, nên hero gọn đúng một
              màn hình và hai cột cân nhau. */}
          <div className="container relative grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="flex flex-col items-center gap-4 text-center lg:block lg:text-left"
              >
                <span className="flex h-24 w-24 items-center justify-center rounded-full border border-border bg-card shadow-sm lg:hidden">
                  <SafeHaimiyaAvatar className="h-20 w-20" />
                </span>
                <Badge variant="secondary" className="border border-primary/30">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                  {translate(
                    "Bot Discord · Nhiệt độ · Join Gate · Chào thành viên · Trợ lý AI",
                  )}{" "}
                </Badge>
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.1 }}
                className="mt-4 text-center font-display text-4xl font-bold leading-[1.15] tracking-tight sm:text-5xl lg:mt-0 lg:text-left lg:text-4xl xl:text-[2.75rem]"
              >
                Bot Discord
                <span className="block text-primary">{translate("bảo vệ server toàn diện")}</span>
                <span className="block">{translate("tự trả lời & chống raid")}</span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.2 }}
                className="mx-auto mt-5 max-w-lg text-center text-base text-muted-foreground sm:text-lg lg:mx-0 lg:text-left"
              >
                Tag <span className="font-mono text-primary">@protogon</span>{" "}
                {translate("hoặc gọi từ khóa để bot phản hồi tức thì. Đi kèm")}{" "}
                <b className="text-foreground">{translate("nhiệt độ 4 giai đoạn")}</b>{" "}
                {translate("cùng warn tích lũy")},{" "}
                <b className="text-foreground">{translate("Join Gate chống selfbot")}</b>,{" "}
                <b className="text-foreground">{translate("chặn link độc hại & file nguy hiểm")}</b>{" "}
                {translate("và")} <b className="text-foreground">{translate("32 module bảo vệ")}</b>{" "}
                {translate("giám sát server 24/7.")}
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.3 }}
                className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start"
              >
                <DashboardCta>
                  {translate("Mở dashboard")} <ArrowRight className="h-4 w-4" />
                </DashboardCta>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => window.dispatchEvent(new Event("haimiya-open"))}
                >
                  <SafeHaimiyaAvatar className="h-6 w-6" /> {translate("Hỏi Haimiya")}{" "}
                </Button>
              </motion.div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.5 }}
                className="mx-auto mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-border pt-6 lg:mx-0"
              >
                {(
                  [
                    // i18n-ok: nhãn dịch lúc render bằng translate(l)
                    ["32", "Module bảo vệ"],
                    ["4", "Giai đoạn nhiệt"],
                    ["24/7", "Giám sát tự động"],
                  ] as const
                ).map(([v, l]) => (
                  <div key={l}>
                    <p className="font-display text-2xl font-bold text-primary">{v}</p>
                    <p className="text-xs text-muted-foreground">{translate(l)}</p>
                  </div>
                ))}
              </motion.div>
            </div>
            <div className="flex flex-col items-center gap-6 lg:items-stretch">
              {/* Ảnh thương hiệu: bức tranh cá voi bứt sóng (đã bỏ dải chữ, sinh
                  từ assets/brand/whale-source.png bằng
                  scripts/build-logo-assets.cjs). Nét trắng nên phải nằm trên khối
                  tối ở MỌI chủ đề; chữ "Protogon." dưới ảnh đúng bố cục lockup
                  của tranh gốc. */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7 }}
                className="w-full max-w-xs overflow-hidden rounded-2xl bg-neutral-950 shadow-sm ring-1 ring-white/10 sm:max-w-sm"
              >
                <img
                  src="/brand-whale.png"
                  alt="Protogon"
                  width={1024}
                  height={652}
                  decoding="async"
                  // Ảnh này là phần tử LCP của trang — ưu tiên tải NGAY, đừng
                  // xếp sau các chunk JS như ảnh bình thường.
                  fetchPriority="high"
                  draggable={false}
                  className="w-full"
                />
                <p className="pb-4 text-center font-display text-xl font-bold tracking-tight text-white">
                  Protogon<span className="text-primary">.</span>
                </p>
              </motion.div>
              <div className="hidden w-full lg:block">
                <HeroChatCard />
              </div>
            </div>
          </div>
        </section>

        <Features />
        <AntiNuke />
        <HaimiyaSection />
        <HowItWorks />
        <CtaBanner />
      </main>
      <Footer discordInvite={discordInvite} facebookUrl={facebookUrl} />
      {/* Bộ chọn trang do App.tsx mount ở cấp gốc (mọi trang đều có, không
          riêng Landing) — mount thêm ở đây sẽ render hai cái chồng lên nhau. */}
      {/* Hứng event "haimiya-open" từ các nút "Hỏi Haimiya" trên trang
          (hero + HaimiyaSection) — thiếu mount này nút bấm chết lặng. */}
      <HaimiyaChat />
    </div>
  );
}
