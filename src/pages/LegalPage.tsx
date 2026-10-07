import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUp, Facebook, MessageCircle, Scale, ShieldCheck } from "lucide-react";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import Footer from "../components/landing/Footer";
import LangSwitch from "../components/LangSwitch";
import { usePublicConfig } from "../lib/usePublicConfig";
import { legalDoc, legalDocs, type LegalSlug } from "../lib/legalContent";
import { translate, useT } from "../lib/i18n";

/** Khối tiêu đề nhỏ dùng chung cho các mục con trong văn bản. */
function SectionBlock({
  index,
  heading,
  children,
}: {
  index: number;
  heading: string;
  children: ReactNode;
}) {
  return (
    <section id={`muc-${index + 1}`} className="scroll-mt-24 border-t border-border pt-8">
      <h2 className="flex items-baseline gap-3 font-display text-xl font-bold tracking-tight">
        <span className="font-mono text-sm font-semibold text-primary">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span>{heading}</span>
      </h2>
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

/**
 * Trang văn bản pháp lý (điều khoản / quyền riêng tư / lưu trữ & xoá dữ liệu).
 *
 * Vì sao là 3 route riêng thay vì một trang dài: Discord yêu cầu bot xác minh
 * phải có URL riêng, ổn định cho Terms of Service và Privacy Policy — dùng
 * chính tên miền dashboard (protogon.freebuff.app/terms, /privacy) nên không
 * phải nuôi thêm site phụ.
 *
 * Nội dung nằm ở src/lib/legalContent.ts (3 thứ tiếng, kiểm cấu trúc bằng cổng
 * 3f của scripts/check-i18n.cjs); phần chữ giao diện ở đây đi qua translate()
 * như mọi trang khác.
 */
export default function LegalPage({ slug }: { slug: LegalSlug }) {
  const { lang } = useT();
  const { discordInvite, facebookUrl } = usePublicConfig();
  const docs = legalDocs(lang);
  const doc = legalDoc(lang, slug);
  const others = docs.filter((d) => d.slug !== doc.slug);

  // Đổi văn bản phải đưa người đọc về đầu trang — nếu không, bấm từ /terms sang
  // /privacy khi đang cuộn giữa bài sẽ rơi vào giữa bài khác (rất dễ tưởng lỗi).
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [slug]);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* top-12 = h-12 của SiteNav (thanh điều hướng chung) — xem Dashboard.tsx. */}
      <header className="sticky top-12 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo-mark.png" alt="" className="h-8 w-8" />
            <span className="font-display text-lg font-bold tracking-tight">
              Protogon<span className="text-primary">.</span>
            </span>
            <span className="hidden text-xs font-semibold text-muted-foreground sm:inline">
              · {translate("Văn bản pháp lý")}{" "}
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <LangSwitch />
            <Button asChild variant="outline" size="sm">
              <Link to="/">
                <ArrowLeft className="h-4 w-4" /> {translate("Về trang chủ")}{" "}
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="container max-w-6xl py-10 md:py-14">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-14">
          <article className="min-w-0">
            <Badge variant="secondary" className="border border-primary/30">
              <Scale className="h-3.5 w-3.5" /> {translate("Văn bản pháp lý")}{" "}
            </Badge>
            <h1 className="mt-4 font-display text-3xl font-bold tracking-tight md:text-4xl">
              {doc.name}
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
              {doc.summary}
            </p>
            <dl className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <dt className="font-semibold text-foreground">{translate("Cập nhật lần cuối")}:</dt>
                <dd className="font-mono">{doc.updated}</dd>
              </div>
              <div className="flex items-center gap-1.5">
                <dt className="font-semibold text-foreground">{translate("Áp dụng cho")}:</dt>
                <dd>{translate("bot Protogon và dashboard web")}</dd>
              </div>
            </dl>

            <div className="mt-6 rounded-xl border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground">
              <p className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{doc.intro}</span>
              </p>
            </div>

            <div className="mt-10 space-y-8">
              {doc.sections.map((sec, i) => (
                <SectionBlock key={sec.heading} index={i} heading={sec.heading}>
                  {sec.paragraphs.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                  {sec.bullets ? (
                    <ul className="mt-2 space-y-2">
                      {sec.bullets.map((b) => (
                        <li key={b} className="flex items-start gap-2.5">
                          <span
                            aria-hidden
                            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                          />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </SectionBlock>
              ))}
            </div>

            <div className="mt-12 rounded-xl border border-border bg-secondary/50 p-5">
              <p className="font-display text-sm font-semibold">{translate("Cần hỗ trợ thêm?")}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {translate(
                  "Mọi câu hỏi về văn bản này, yêu cầu xoá dữ liệu hoặc báo lỗi bot đều được tiếp nhận trong kênh hỗ trợ của cộng đồng.",
                )}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <a href={discordInvite} target="_blank" rel="noreferrer">
                    <MessageCircle className="h-4 w-4" /> Discord server
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={facebookUrl} target="_blank" rel="noreferrer">
                    <Facebook className="h-4 w-4" /> Fanpage Facebook
                  </a>
                </Button>
                <button
                  type="button"
                  onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ArrowUp className="h-3.5 w-3.5" /> {translate("Về đầu trang")}{" "}
                </button>
              </div>
            </div>
          </article>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <nav aria-label={translate("Mục lục")} className="text-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {translate("Mục lục")}
              </p>
              <ol className="mt-3 space-y-2 border-l border-border pl-4">
                {doc.sections.map((sec, i) => (
                  <li key={sec.heading}>
                    <a
                      href={`#muc-${i + 1}`}
                      className="block text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {sec.heading}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <div className="mt-8 text-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {translate("Văn bản khác")}
              </p>
              <div className="mt-3 space-y-2">
                {others.map((o) => (
                  <Link
                    key={o.slug}
                    to={`/${o.slug}`}
                    className="flex items-start gap-2 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-accent"
                  >
                    <span className="font-semibold">{o.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </main>

      <Footer discordInvite={discordInvite} facebookUrl={facebookUrl} />
    </div>
  );
}
