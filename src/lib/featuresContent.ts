// @i18n-content: nội dung trang /features — 3 thứ tiếng tự chứa (mẫu legalContent.ts).
//
// Vì sao tự chứa thay vì từ điển key-VI: trang SEO quốc tế cần văn phòng phẩm
// dài (mô tả tính năng, hướng dẫn cài, so sánh) × 3 ngôn ngữ; nhét vào
// i18n.en.ts/i18n.de.ts thì mỗi lần sửa một câu phải sửa 3 file và mất khả
// năng đối chiếu VI ⇄ EN ⇄ DE. Marker `@i18n-content` miễn luật 3c của
// scripts/check-i18n.cjs, đổi lại gate 3f kiểm CẤU TRÚC: vi/en/de phải cùng
// cây đường dẫn, không ô rỗng, không đoạn VI nào còn nguyên tiếng Việt.

export type FeaturesLang = "vi" | "en" | "de";

export interface FeatureBlock {
  name: string;
  description: string;
}

export interface FeaturesDoc {
  hero: {
    title: string;
    subtitle: string;
  };
  blocks: FeatureBlock[];
  setupTitle: string;
  setupSteps: string[];
  comparisonTitle: string;
  comparisonRows: {
    feature: string;
    protogon: string;
    typical: string;
  }[];
  ctaTitle: string;
  ctaBody: string;
}

/**
 * Bố cục cố định mọi ngôn ngữ phải có ĐÚNG 6 block theo cùng thứ tự — gate
 * kiểm cấu trúc dựa vào đây; đổi bố cục phải đổi cả 3 ngôn ngữ cùng commit.
 */
export const FEATURE_ORDER = [
  "autoReply",
  "heatSystem",
  "joinGate",
  "antiNuke",
  "linkFilter",
  "backup",
] as const;

export function featuresDoc(lang: FeaturesLang): FeaturesDoc {
  return CONTENT[lang];
}

const CONTENT: Record<FeaturesLang, FeaturesDoc> = {
  vi: {
    hero: {
      title: "Protogon làm được gì cho server Discord của bạn?",
      subtitle:
        "Tự trả lời theo từ khoá, quản lý vi phạm bằng nhiệt độ, chặn raid và nuke — tất cả cấu hình từ dashboard web, không cần nhớ lệnh phức tạp.",
    },
    blocks: [
      {
        name: "Tự trả lời theo từ khoá",
        description:
          "Thêm cặp từ khoá → câu trả lời riêng cho từng server. Thành viên tag hoặc nhắc từ khoá là bot trả lời ngay bằng tin nhắn bạn soạn sẵn, hỗ trợ biến {user} chèn tên người hỏi. Không giới hạn số rule ở mức cơ bản.",
      },
      {
        name: "Hệ thống nhiệt độ 4 giai đoạn",
        description:
          "Mỗi vi phạm cộng nhiệt, nhiệt tự nguội theo thời gian. Chạm ngưỡng lần lượt: cảnh báo → tạm khóa (timeout) → kick → ban. Ngưỡng mỗi server chỉnh riêng, có multiplier phạt lặp vi phạm trong cửa sổ ngắn.",
      },
      {
        name: "Join Gate chống selfbot",
        description:
          "Chặn làn sóng acc mới: lọc theo tuổi tài khoản, yêu cầu avatar, lọc cờ Discord nghi ngờ. Có chế độ raid kick và whitelist để không đụng thành viên thật.",
      },
      {
        name: "32 module chống nuke/raid",
        description:
          "Phát hiện xóa kênh, xóa role, spam tạo kênh/role, ban hàng loạt, webhook lạ… Bật/tắt từng module, đặt ngưỡng + cửa sổ thời gian riêng, kèm Raid Intel săn nguồn cơn raid và AI phân loại raid thật/bình thường.",
      },
      {
        name: "Lọc link độc hại & nội dung xấu",
        description:
          "Chặn link đã biết là scam/phishing, chặn file nguy hiểm theo đuôi, danh sách từ cấm tự quản. Log rõ ai gửi gì vào kênh log riêng.",
      },
      {
        name: "Backup & khôi phục server",
        description:
          "Chụp toàn bộ role, kênh, tin nhắn ghim, emoji, sticker. Tự backup định kỳ 2–30 ngày, khôi phục lại cấu trúc server sau khi bị nuke chỉ với một lệnh. Đẩy bản backup lên GitHub chủ bot.",
      },
    ],
    setupTitle: "Cài đặt trong 3 bước",
    setupSteps: [
      "Mời bot vào server bằng nút đăng nhập Discord trên trang chủ — cấu hình mặc định an toàn được tạo sẵn.",
      "Đăng nhập dashboard, chọn server và bật từng tính năng theo ý muốn: auto-reply, nhiệt độ, Join Gate, module chống nuke.",
      "Bot áp dụng cấu hình mới trong khoảng 1 phút — không cần restart, không cần gõ lệnh trong Discord.",
    ],
    comparisonTitle: "So sánh nhanh",
    comparisonRows: [
      {
        feature: "Tự trả lời theo từ khoá",
        protogon: "Miễn phí, không giới hạn số rule cơ bản, soạn từ dashboard",
        typical: "Tính phí theo gói hoặc giới hạn 3–5 rule",
      },
      {
        feature: "Chống nuke/raid theo module",
        protogon: "32 module bật/tắt riêng từng module, ngưỡng riêng",
        typical: "Bật/tắt nguyên cụm, không chỉnh ngưỡng được",
      },
      {
        feature: "Khôi phục sau nuke",
        protogon: "Backup tự động định kỳ + khôi phục role/kênh/tin nhắn",
        typical: "Chỉ backup role/kênh, không kèm tin nhắn",
      },
      {
        feature: "Ngôn ngữ dashboard",
        protogon: "Tiếng Việt, English, Deutsch",
        typical: "Chỉ tiếng Anh",
      },
    ],
    ctaTitle: "Sẵn sàng bảo vệ server của bạn?",
    ctaBody: "Thêm Protogon vào server miễn phí — mất chưa tới một phút, không cần thẻ tín dụng.",
  },
  en: {
    hero: {
      title: "What does Protogon do for your Discord server?",
      subtitle:
        "Keyword auto-replies, heat-based moderation, raid and nuke protection — all configured from a web dashboard, no complex commands to memorize.",
    },
    blocks: [
      {
        name: "Keyword auto-replies",
        description:
          "Add keyword → reply pairs per server. When a member mentions a keyword, the bot answers instantly with your pre-written message, including the {user} placeholder for the asker's name. No limits on the number of basic rules.",
      },
      {
        name: "Four-stage heat system",
        description:
          "Every violation adds heat; heat cools down over time. Thresholds trigger in order: warn → timeout → kick → ban. Each server tunes its own thresholds, with a repeat multiplier for violations in short windows.",
      },
      {
        name: "Join Gate anti-selfbot",
        description:
          "Stops waves of fresh accounts: account-age filtering, avatar requirements, and suspicious Discord flags. Includes raid-kick mode and whitelists so real members are never touched.",
      },
      {
        name: "32 anti-nuke/raid modules",
        description:
          "Detects channel deletion, role deletion, channel/role spam, mass bans, rogue webhooks, and more. Toggle each module independently with its own threshold and time window, plus Raid Intel to hunt the raid source and AI classification of real raids vs. normal activity.",
      },
      {
        name: "Malicious link & content filter",
        description:
          "Blocks known scam/phishing links, dangerous file types, and your own custom word list. Every blocked message is logged with sender details to a dedicated log channel.",
      },
      {
        name: "Server backup & restore",
        description:
          "Snapshots all roles, channels, pinned messages, emojis, and stickers. Automatic backups every 2–30 days, and a single command restores your server structure after a nuke. Backups are pushed to the bot owner's GitHub.",
      },
    ],
    setupTitle: "Set up in 3 steps",
    setupSteps: [
      "Invite the bot with the Discord sign-in button on the home page — safe default configuration is created automatically.",
      "Sign in to the dashboard, pick your server, and toggle each feature you want: auto-replies, heat moderation, Join Gate, anti-nuke modules.",
      "The bot applies new settings within about a minute — no restart, no commands to type in Discord.",
    ],
    comparisonTitle: "Quick comparison",
    comparisonRows: [
      {
        feature: "Keyword auto-replies",
        protogon: "Free, no limit on basic rules, written from the dashboard",
        typical: "Paywalled or capped at 3–5 rules",
      },
      {
        feature: "Modular anti-nuke/raid",
        protogon: "32 modules, each toggleable with its own threshold",
        typical: "Group-level toggles only, thresholds not adjustable",
      },
      {
        feature: "Post-nuke restore",
        protogon: "Scheduled backups + restore of roles/channels/messages",
        typical: "Role/channel backups only, no messages",
      },
      {
        feature: "Dashboard language",
        protogon: "Vietnamese, English & German",
        typical: "English only",
      },
    ],
    ctaTitle: "Ready to protect your server?",
    ctaBody:
      "Add Protogon to your server for free — takes less than a minute, no credit card required.",
  },
  de: {
    hero: {
      title: "Was macht Protogon für deinen Discord-Server?",
      subtitle:
        "Auto-Antworten nach Schlüsselwörtern, Heat-basierte Moderation, Raid- und Nuke-Schutz — alles über das Web-Dashboard konfiguriert, ohne komplizierte Befehle.",
    },
    blocks: [
      {
        name: "Auto-Antworten nach Schlüsselwörtern",
        description:
          "Füge pro Server Paare aus Schlüsselwort → Antwort hinzu. Erwähnt ein Mitglied ein Schlüsselwort, antwortet der Bot sofort mit deiner vorgeschriebenen Nachricht, inklusive Platzhalter {user} für den Namen der fragenden Person. Keine Begrenzung der einfachen Regeln.",
      },
      {
        name: "Vierstufiges Heat-System",
        description:
          "Jeder Verstoß erhöht die Heat; die Heat kühlt mit der Zeit ab. Die Schwellen lösen nacheinander aus: Warnung → Timeout → Kick → Ban. Jeder Server stellt eigene Schwellen ein, mit einem Wiederholungs-Multiplikator für Verstöße in kurzen Zeitfenstern.",
      },
      {
        name: "Join Gate gegen Selfbots",
        description:
          "Stoppt Wellen frischer Accounts: Filter nach Kontoalter, Avatar-Pflicht und verdächtigen Discord-Flags. Inklusive Raid-Kick-Modus und Whitelists, damit echte Mitglieder nie betroffen sind.",
      },
      {
        name: "32 Anti-Nuke/Raid-Module",
        description:
          "Erkennt Löschen von Kanälen, Löschen von Rollen, Spam von Kanälen/Rollen, Massen-Bans, fremde Webhooks und mehr. Jedes Modul einzeln ein-/ausschaltbar mit eigenem Schwellwert und Zeitfenster, dazu Raid Intel zur Jagd nach der Raid-Quelle und KI-Klassifizierung echter Raids gegen normale Aktivität.",
      },
      {
        name: "Filter für bösartige Links & Inhalte",
        description:
          "Blockiert bekannte Scam-/Phishing-Links, gefährliche Dateitypen und deine eigene Wortliste. Jede blockierte Nachricht wird mit Absenderdetails in einem eigenen Log-Kanal protokolliert.",
      },
      {
        name: "Server-Backup & Wiederherstellung",
        description:
          "Sichert alle Rollen, Kanäle, angepinnte Nachrichten, Emojis und Sticker. Automatische Backups alle 2–30 Tage, und ein einziger Befehl stellt die Serverstruktur nach einem Nuke wieder her. Backups werden auf das GitHub des Bot-Besitzers gepusht.",
      },
    ],
    setupTitle: "In 3 Schritten eingerichtet",
    setupSteps: [
      "Lade den Bot über den Discord-Anmeldebutton auf der Startseite ein — eine sichere Standardkonfiguration wird automatisch erstellt.",
      "Melde dich im Dashboard an, wähle deinen Server und aktiviere jede gewünschte Funktion: Auto-Antworten, Heat-Moderation, Join Gate, Anti-Nuke-Module.",
      "Der Bot übernimmt neue Einstellungen innerhalb von etwa einer Minute — kein Neustart, keine Befehle in Discord nötig.",
    ],
    comparisonTitle: "Kurzer Vergleich",
    comparisonRows: [
      {
        feature: "Auto-Antworten nach Schlüsselwörtern",
        protogon: "Kostenlos, keine Begrenzung der einfachen Regeln, direkt im Dashboard",
        typical: "Hinter Bezahlschranken oder auf 3–5 Regeln begrenzt",
      },
      {
        feature: "Modularer Anti-Nuke/Raid-Schutz",
        protogon: "32 Module, jedes einzeln schaltbar mit eigenem Schwellwert",
        typical: "Nur Gruppen-Schalter, Schwellwerte nicht einstellbar",
      },
      {
        feature: "Wiederherstellung nach Nuke",
        protogon: "Geplante Backups + Wiederherstellung von Rollen/Kanälen/Nachrichten",
        typical: "Nur Rollen/Kanäle, ohne Nachrichten",
      },
      {
        feature: "Dashboard-Sprache",
        protogon: "Vietnamesisch, Englisch & Deutsch",
        typical: "Nur Englisch",
      },
    ],
    ctaTitle: "Bereit, deinen Server zu schützen?",
    ctaBody:
      "Füge Protogon kostenlos zu deinem Server hinzu — dauert unter einer Minute, keine Kreditkarte nötig.",
  },
};
