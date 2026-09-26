import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowUp, Check, MessageCircle, ShieldCheck, X } from "lucide-react";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import Footer from "../components/landing/Footer";
import LangSwitch from "../components/LangSwitch";
import { usePublicConfig } from "../lib/usePublicConfig";
import { featuresDoc } from "../lib/featuresContent";
import { translate, useT } from "../lib/i18n";

/**
 * Trang /features — landing SEO quốc tế bằng tiếng Anh (làm mặc định khi vào
 * trực tiếp, theo ngôn ngữ người chọn nếu đã đổi). Mục tiêu: người EN/DE tìm
 * "discord anti nuke bot", "discord keyword auto reply bot"… trên Google và
 * rơi vào đây — nội dung dài thật, so sánh thật, CTA dẫn sang OAuth.
 *
 * Nội dung nằm ở src/lib/featuresContent.ts (3 thứ tiếng, kiểm cấu trúc bằng
 * cổng 3f của scripts/check-i18n.cjs); phần chữ giao diện ở đây đi qua
 * translate() như mọi trang khác.
 */
export default function FeaturesPage() {
  const { lang } = useT();
  const doc = featuresDoc(lang);
  const { discordInvite, facebookUrl } = usePublicConfig();

  return (
    <div className="min-h-screen bg-background">
      {/* Thanh đầu trang: về trang chủ + đổi ngôn ngữ — dùng chung khuôn LegalPage */}
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 pt-6">
        <Link
          to="/"
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowUp className="h-4 w-4 -rotate-90" />
          {translate("Về trang chủ")}
        </Link>
        <LangSwitch />
      </div>

      <main className="mx-auto max-w-4xl px-6 pb-16 pt-10">
        {/* Hero */}
        <header>
          <Badge variant="secondary" className="mb-4 gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Protogon
          </Badge>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {translate(doc.hero.title)}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            {translate(doc.hero.subtitle)}
          </p>
        </header>

        {/* 6 khối tính năng */}
        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {doc.blocks.map((block, i) => (
            <motion.section
              key={block.name}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.05 }}
              className="rounded-2xl border border-border bg-card p-5"
            >
              <h2 className="font-display text-base font-bold tracking-tight text-foreground">
                {translate(block.name)}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {translate(block.description)}
              </p>
            </motion.section>
          ))}
        </div>

        {/* Cài đặt 3 bước */}
        <section className="mt-14">
          <h2 className="font-display text-2xl font-bold tracking-tight">{doc.setupTitle}</h2>
          <ol className="mt-5 space-y-4">
            {doc.setupSteps.map((step, i) => (
              <li key={step} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-sm font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <p className="pt-1 text-sm leading-relaxed text-muted-foreground">
                  {translate(step)}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* So sánh */}
        <section className="mt-14">
          <h2 className="font-display text-2xl font-bold tracking-tight">{doc.comparisonTitle}</h2>
          <div className="mt-5 overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/60 text-left">
                  <th className="px-4 py-3 font-semibold text-foreground">
                    {translate("Tính năng")}
                  </th>
                  <th className="px-4 py-3 font-semibold text-foreground">Protogon</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">
                    {translate("Bot thông thường")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {doc.comparisonRows.map((row) => (
                  <tr key={row.feature} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">{row.feature}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-start gap-1.5 text-foreground/90">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        {row.protogon}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-start gap-1.5 text-muted-foreground">
                        <X className="mt-0.5 h-4 w-4 shrink-0" />
                        {row.typical}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* CTA */}
        <section className="mt-14 rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center sm:p-10">
          <h2 className="font-display text-2xl font-bold tracking-tight">{doc.ctaTitle}</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            {doc.ctaBody}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {discordInvite && (
              <Button asChild size="lg">
                <a href={discordInvite} target="_blank" rel="noreferrer">
                  <MessageCircle className="mr-2 h-4 w-4" />
                  {translate("Mời bot vào server")}
                </a>
              </Button>
            )}
            <Button asChild size="lg" variant="outline">
              <Link to="/auth">{translate("Mở dashboard")}</Link>
            </Button>
          </div>
        </section>
      </main>

      <Footer discordInvite={discordInvite} facebookUrl={facebookUrl} />
      {/* Nút về đầu trang — ẩn trên mobile cho gọn */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label={translate("Về đầu trang")}
        className="fixed bottom-24 right-5 z-30 hidden rounded-full border border-border bg-card p-2.5 text-muted-foreground shadow-md transition-colors hover:text-foreground sm:block"
      >
        <ArrowUp className="h-4 w-4" />
      </button>
    </div>
  );
}
