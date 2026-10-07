import type { Lang } from "./i18n";
import { canonicalPathFor, routeForPath, type RouteEntry, type RouteSeoKind } from "./routes";

export const SITE_URL = "https://protogon.freebuff.app";

/** Static index dùng domain mặc định; sau hydration dùng origin của domain đang phục vụ. */
export function activeSiteUrl(): string {
  if (
    typeof window !== "undefined" &&
    window.location.origin &&
    window.location.origin !== "null"
  ) {
    return window.location.origin;
  }
  return SITE_URL;
}

/**
 * RouteKind = seoKind khai báo trong bảng tuyến đường (src/lib/routes.ts) cộng
 * "not-found" cho URL không khớp route nào. Bảng tuyến đường là NGUỒN DUY NHẤT
 * — thêm/sửa route phải sửa routes.json, không sửa bằng cách thêm nhánh riêng
 * trong file này (đó chính là cách bug "/features thiếu SPA fallback" và
 * "/status trùng canonical" ra đời).
 */
export type RouteKind = RouteSeoKind | "not-found";

type Copy = Record<Exclude<RouteKind, "not-found">, { title: string; description: string }>;

const COPY: Record<Lang, Copy> = {
  vi: {
    home: {
      title: "Protogon — Bot Discord tự trả lời & chống nuke/raid",
      description:
        "Protogon giúp bảo vệ server Discord với auto-reply, hệ thống nhiệt độ 4 giai đoạn, Join Gate chống selfbot, chặn link độc hại và 32 module chống nuke/raid.",
    },
    features: {
      title: "Tính năng — Protogon: bot Discord tự trả lời & chống nuke/raid",
      description:
        "Toàn bộ tính năng của bot Discord Protogon: tự trả lời theo từ khoá, hệ thống nhiệt độ 4 giai đoạn, Join Gate, 32 module chống nuke/raid và backup server.",
    },
    terms: {
      title: "Điều khoản sử dụng — Protogon",
      description: "Điều khoản sử dụng bot Protogon và bảng điều khiển web cho cộng đồng Discord.",
    },
    privacy: {
      title: "Chính sách quyền riêng tư — Protogon",
      description: "Chính sách quyền riêng tư và cách Protogon xử lý dữ liệu người dùng.",
    },
    "data-deletion": {
      title: "Lưu trữ & xoá dữ liệu — Protogon",
      description: "Thông tin lưu trữ, thời hạn và quy trình yêu cầu xoá dữ liệu của Protogon.",
    },
    monitor: {
      title: "Giám sát bot — Protogon",
      description:
        "Theo dõi trạng thái, độ trễ và số liệu vận hành của bot Protogon theo thời gian thực.",
    },
    donate: {
      title: "Ủng hộ nhà phát triển — Protogon",
      description:
        "Giúp duy trì Protogon — bot Discord miễn phí do một người làm. Mọi tính năng luôn miễn phí, quyền góp giúp bot có thêm máy chủ và người sửa lỗi.",
    },
    feedback: {
      title: "Góp ý — Protogon",
      description:
        "Gửi báo lỗi, đề xuất tính năng hoặc góp ý cho bot Protogon — không cần tài khoản Discord, góp ý đi thẳng tới người làm bot.",
    },
    premium: {
      title: "Gói Premium — Protogon",
      description:
        "Xem trước các gói Premium của Protogon: nhiều kênh riêng hơn, báo cáo nâng cao, tên bot riêng và hỗ trợ ưu tiên. Gói miễn phí luôn được giữ nguyên.",
    },
    auth: {
      title: "Đăng nhập — Protogon",
      description: "Đăng nhập an toàn bằng Discord để quản lý các server của bạn trên Protogon.",
    },
    dashboard: {
      title: "Dashboard — Protogon",
      description: "Quản lý cấu hình bảo vệ và tự động hóa cho các server Discord của bạn.",
    },
    stats: {
      title: "Thống kê nhiệt độ — Protogon",
      description: "Theo dõi thành viên có nhiệt độ vi phạm cao trong các server bạn quản lý.",
    },
    admin: {
      title: "Quản trị — Protogon",
      description: "Khu vực quản trị dành riêng cho chủ sở hữu bot Protogon.",
    },
    callback: {
      title: "Đang xác thực Discord — Protogon",
      description: "Đang hoàn tất đăng nhập Discord an toàn với Protogon.",
    },
  },
  en: {
    home: {
      title: "Protogon — Discord bot with auto-replies & anti-nuke/raid",
      description:
        "Protogon protects Discord servers with auto-replies, a four-stage heat system, Join Gate anti-selfbot, malicious-link blocking, and 32 anti-nuke/raid modules.",
    },
    features: {
      title: "Features — Protogon: Discord auto-reply & anti-nuke bot",
      description:
        "Every Protogon Discord bot feature: keyword auto-replies, a four-stage heat system, Join Gate, 32 anti-nuke/raid modules, and full server backup & restore.",
    },
    terms: {
      title: "Terms of Service — Protogon",
      description: "Terms for using the Protogon Discord bot and web dashboard.",
    },
    privacy: {
      title: "Privacy Policy — Protogon",
      description: "How Protogon handles user data and protects your privacy.",
    },
    "data-deletion": {
      title: "Data Retention & Deletion — Protogon",
      description: "Protogon retention information and the process for requesting data deletion.",
    },
    monitor: {
      title: "Bot monitor — Protogon",
      description: "Live Protogon bot status, latency, and operational metrics.",
    },
    donate: {
      title: "Support the developer — Protogon",
      description:
        "Help keep Protogon running — a free Discord bot maintained by one person. Every feature stays free; contributions pay for the server and the bug fixes.",
    },
    feedback: {
      title: "Feedback — Protogon",
      description:
        "Report a bug, suggest a feature, or send general feedback about the Protogon bot — no Discord account needed, it goes straight to the developer.",
    },
    premium: {
      title: "Premium plans — Protogon",
      description:
        "Preview Protogon premium tiers: more private channels, advanced reports, a custom bot name, and priority support. The free plan is never cut down.",
    },
    auth: {
      title: "Sign in — Protogon",
      description: "Securely sign in with Discord to manage your servers on Protogon.",
    },
    dashboard: {
      title: "Dashboard — Protogon",
      description: "Manage protection settings and automation for your Discord servers.",
    },
    stats: {
      title: "Heat stats — Protogon",
      description: "Track members with the highest violation heat across servers you manage.",
    },
    admin: {
      title: "Admin — Protogon",
      description: "A private administration area for the Protogon bot owner.",
    },
    callback: {
      title: "Verifying Discord — Protogon",
      description: "Completing a secure Discord sign-in for Protogon.",
    },
  },
  de: {
    home: {
      title: "Protogon — Discord-Bot mit Auto-Antworten & Anti-Nuke/Raid",
      description:
        "Protogon schützt Discord-Server mit Auto-Antworten, einem vierstufigen Heat-System, Join Gate gegen Selfbots, schädlichen Links und 32 Anti-Nuke/Raid-Modulen.",
    },
    features: {
      title: "Funktionen — Protogon: Discord-Bot mit Auto-Antworten & Anti-Nuke",
      description:
        "Alle Funktionen des Protogon-Discord-Bots: Auto-Antworten nach Schlüsselwörtern, vierstufiges Heat-System, Join Gate, 32 Anti-Nuke/Raid-Module und Server-Backup.",
    },
    terms: {
      title: "Nutzungsbedingungen — Protogon",
      description: "Nutzungsbedingungen für den Protogon-Discord-Bot und das Web-Dashboard.",
    },
    privacy: {
      title: "Datenschutzerklärung — Protogon",
      description: "Wie Protogon mit Benutzerdaten umgeht und Ihre Privatsphäre schützt.",
    },
    "data-deletion": {
      title: "Speicherung & Löschung — Protogon",
      description:
        "Informationen zu Speicherung, Aufbewahrung und Löschung von Daten bei Protogon.",
    },
    monitor: {
      title: "Bot-Monitor — Protogon",
      description: "Live-Status, Latenz und Betriebsdaten des Protogon-Bots.",
    },
    donate: {
      title: "Entwickler unterstützen — Protogon",
      description:
        "Protogon am Laufen halten — ein kostenloser Discord-Bot, gepflegt von einer Person. Alle Funktionen bleiben kostenlos; Spenden finanzieren Server und Fehlerbehebungen.",
    },
    feedback: {
      title: "Feedback — Protogon",
      description:
        "Fehler melden, Funktionen vorschlagen oder allgemeines Feedback zum Protogon-Bot senden — ohne Discord-Konto, direkt an den Entwickler.",
    },
    premium: {
      title: "Premium-Tarife — Protogon",
      description:
        "Protogon Premium-Tarife ansehen: mehr eigene Kanäle, erweiterte Berichte, eigener Bot-Name und priorisierter Support. Der kostenlose Tarif bleibt unverändert.",
    },
    auth: {
      title: "Anmelden — Protogon",
      description: "Mit Discord sicher anmelden und Ihre Server auf Protogon verwalten.",
    },
    dashboard: {
      title: "Dashboard — Protogon",
      description: "Schutz-Einstellungen und Automatisierung für Ihre Discord-Server verwalten.",
    },
    stats: {
      title: "Heat-Statistiken — Protogon",
      description: "Mitglieder mit der höchsten Verstoß-Heat in verwalteten Servern verfolgen.",
    },
    admin: {
      title: "Administration — Protogon",
      description: "Privater Verwaltungsbereich für den Protogon-Bot-Besitzer.",
    },
    callback: {
      title: "Discord wird geprüft — Protogon",
      description: "Sichere Discord-Anmeldung für Protogon wird abgeschlossen.",
    },
  },
};

/** Kind SEO cho pathname — tra bảng tuyến đường; không khớp thì là 404. */
function routeKind(pathname: string): RouteKind {
  return routeForPath(pathname)?.seoKind ?? "not-found";
}

/** Entry bảng tuyến đường cho pathname (null nếu URL không có route). */
function routeEntry(pathname: string): RouteEntry | null {
  return routeForPath(pathname);
}

/** Route được index — lấy thẳng từ bảng tuyến đường, không nhập tay. */
function isIndexableRoute(route: RouteEntry | null): boolean {
  return route !== null && route.index && route.visibility === "public";
}

function setMeta(attribute: "name" | "property", key: string, content: string): void {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function setCanonical(href: string | null): void {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!href) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.appendChild(element);
  }
  element.href = href;
}

/**
 * Dữ liệu có cấu trúc THEO ROUTE (WebPage + BreadcrumbList), gắn vào <head>
 * sau hydration. index.html đã có 2 khối tĩnh (Organization + SoftwareApplication)
 * — khối này bổ sung phần chỉ route cụ thể mới biết được (URL nào, thuộc trang
 * gì, nằm ở đâu trong cây điều hướng).
 *
 * Ba luật bắt buộc (bug lớp "alias tạo bản sao canonical"):
 *   1. Chỉ chạy cho route indexable — route private/noindex/404: GỠ hẳn.
 *   2. URL LUÔN là canonical: alias (/status) không được tự khai WebPage riêng,
 *      nó trỏ thẳng WebPage của /monitor.
 *   3. Trang chủ không có khối này — đã có JSON-LD tĩnh trong index.html và
 *      không cần breadcrumb một mức.
 */
function syncRouteJsonLd(route: RouteEntry, canonicalPath: string, lang: Lang): void {
  const ID = "route-jsonld";
  const existing = document.getElementById(ID);
  if (!isIndexableRoute(route) || route.seoKind === "home" || route.redirect) {
    existing?.remove();
    return;
  }
  const siteUrl = activeSiteUrl();
  const url = `${siteUrl}${canonicalPath}`;
  const copy = COPY[lang][route.seoKind];
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: copy.title,
        description: copy.description,
        inLanguage: lang,
        isPartOf: {
          "@id": `${siteUrl}/#website`,
          "@type": "WebSite",
          name: "Protogon",
          url: siteUrl,
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Protogon", item: siteUrl },
          { "@type": "ListItem", position: 2, name: copy.title, item: url },
        ],
      },
    ],
  };
  let element = document.getElementById(ID) as HTMLScriptElement | null;
  if (!element) {
    element = document.createElement("script");
    element.type = "application/ld+json";
    element.id = ID;
    document.head.appendChild(element);
  }
  element.textContent = JSON.stringify(data);
}

/** Đồng bộ metadata sau hydration; static index vẫn có fallback cho crawler. */
export function syncRouteMetadata(pathname: string, lang: Lang): void {
  const route = routeEntry(pathname);
  const kind = routeKind(pathname);
  const copy = kind === "not-found" ? COPY[lang].home : COPY[lang][kind];
  const indexed = isIndexableRoute(route);
  const isAlias = route !== null && route.redirect !== null;
  // Canonical: alias trỏ về đích redirect, route indexable trỏ về chính nó,
  // còn lại (private / 404) không có canonical.
  const canonicalPath = canonicalPathFor(pathname);
  const canonicalUrl =
    canonicalPath && (indexed || isAlias) ? `${activeSiteUrl()}${canonicalPath}` : null;
  const siteUrl = activeSiteUrl();
  const ogImage = `${siteUrl}/og-image.png`;

  document.title = kind === "not-found" ? `404 — ${copy.title}` : copy.title;
  setMeta("name", "description", copy.description);
  setMeta("property", "og:title", document.title);
  setMeta("property", "og:description", copy.description);
  // og:url dựng từ CANONICAL, không từ URL đang mở — mở /status phải báo
  // og:url là /monitor, nếu không hai URL cùng tranh giàn một nội dung.
  setMeta("property", "og:url", canonicalUrl ?? siteUrl);
  setMeta("property", "og:image", ogImage);
  setMeta("property", "og:image:alt", "Protogon — Discord server protection");
  setMeta("name", "twitter:title", document.title);
  setMeta("name", "twitter:description", copy.description);
  setMeta("name", "twitter:image", ogImage);
  setMeta("name", "twitter:image:alt", "Protogon — Discord server protection");
  // Alias: noindex nhưng follow — nó chỉ là đường vào phụ của /monitor.
  setMeta(
    "name",
    "robots",
    indexed ? "index,follow" : isAlias ? "noindex,follow" : "noindex,nofollow",
  );
  setCanonical(canonicalUrl);
  if (route && canonicalPath) syncRouteJsonLd(route, canonicalPath, lang);
  else document.getElementById("route-jsonld")?.remove();
}
