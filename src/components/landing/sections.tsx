import { motion } from "framer-motion";
import {
  Archive,
  ArrowRight,
  Bot,
  Bug,
  Crown,
  Facebook,
  Flame,
  Gavel,
  Heart,
  LayoutDashboard,
  MessageCircle,
  Megaphone,
  MessageSquareReply,
  PartyPopper,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Timer,
  UserCheck,
  Zap,
} from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { DashboardCta, SafeHaimiyaAvatar, fadeUp, stagger } from "./shared";

import { translate } from "../../lib/i18n";
/** Thanh nhiệt mini mô phỏng trong mockup chat. */
function HeatBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

export function Features() {
  const items = [
    {
      icon: MessageSquareReply,
      title: "Tự trả lời thông minh",
      desc: "Đặt rule theo từ khóa hoặc @mention, chèn {user}, {username}, kèm cooldown chống spam. Bot phản hồi tức thì, đúng giọng điệu của server bạn.",
    },
    {
      icon: Flame,
      title: "Hệ thống nhiệt độ 4 giai đoạn",
      desc: "Mỗi vi phạm cộng điểm nhiệt và tự leo thang hình phạt: cảnh báo qua DM → tạm khóa → kick → ban. Nhiệt giảm dần theo phút, tái phạm trong cửa sổ ngắn bị nhân đôi.",
    },
    {
      icon: ShieldCheck,
      title: "Moderation lọc nội dung",
      desc: "Tự động chặn spam tin nhắn, mention, ảnh/file và link mời Discord, lọc từ ngữ thô tục — song song với hệ thống warn tích lũy leo thang hình phạt.",
    },
    {
      icon: Bug,
      title: "Chặn link độc hại & file nguy hiểm",
      desc: "Nhận diện domain lừa đảo (nitro giả, gift giả, crypto scam…), link IP và tệp nguy hiểm (.exe, .scr, .bat…) rồi xóa tin nhắn kèm cảnh báo cho mod.",
    },
    {
      icon: UserCheck,
      title: "Join Gate chống selfbot",
      desc: "Cổng kiểm soát đầu vào: chặn tài khoản quá mới, không avatar, không huy hiệu và mọi lượt vào khi server đang bị raid — vẫn có danh sách trắng cho người quen.",
    },
    {
      icon: ShieldAlert,
      title: "Chống nuke & raid — 24 module",
      desc: "Ban/kick hàng loạt, raid thành viên, phá kênh/role, webhook spam, bot hit-and-run, tự cấp quyền quản trị… đều bị phát hiện và xử lý tức thì, kèm khóa kênh tự động khi server bị tấn công.",
    },
    {
      icon: Gavel,
      title: "Công cụ Mod",
      desc: "Đầy đủ /mod timeout · kick · ban · purge cùng các lệnh text !timeout !kick !ban !purge — mọi hành động đều được ghi lại kèm lý do và người thực hiện.",
    },
    {
      icon: Archive,
      title: "Backup & khôi phục server",
      desc: "Sao lưu toàn bộ server (role, kênh, tin nhắn kèm media, emoji), nén và đẩy lên GitHub Gist, tự động chạy định kỳ 2–30 ngày. Khôi phục sang server khác hoặc nhập trực tiếp file backup của bot nuke (.msc).",
    },
    {
      icon: Megaphone,
      title: "Báo cáo khẩn & report",
      desc: "Dùng /report hoặc !report khi server bị raid/nuke hay bot phạt nhầm: hệ thống đọc lại hàng trăm tin nhắn gần nhất để dựng đúng diễn biến và gửi báo cáo kèm bằng chứng cho bạn.",
    },
    {
      icon: PartyPopper,
      title: "Welcome & Goodbye",
      desc: "Chào thành viên mới và tạm biệt người rời đi bằng kênh riêng, nội dung tùy chỉnh với placeholder ({user}, {server}, {count}…), gửi dạng embed hoặc tin nhắn thường.",
    },
  ];
  return (
    <section id="features" className="relative py-24">
      <div className="container">
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="mx-auto max-w-2xl text-center"
        >
          <motion.div variants={fadeUp}>
            <Badge className="mb-4">
              <Sparkles className="h-3.5 w-3.5" /> {translate("Trọn bộ trong một bot")}{" "}
            </Badge>
          </motion.div>
          <motion.h2
            variants={fadeUp}
            className="font-display text-3xl font-bold tracking-tight md:text-5xl"
          >
            {translate("Bảo vệ vững chắc, giao tiếp mượt mà cho server của bạn")}
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-4 text-muted-foreground">
            {translate(
              "Protogon gom hệ thống tự trả lời và 32 module bảo vệ (24 chống nuke + 8 auto-mod) vào một chỗ: cấu hình trực quan trên dashboard, giám sát server 24/7, có trợ lý Haimiya đồng hành khi bạn cần.",
            )}{" "}
          </motion.p>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {items.map((f) => (
            <motion.div key={f.title} variants={fadeUp}>
              <div className="card-hover group h-full rounded-xl border border-border bg-card p-4 sm:p-6">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-display text-lg font-semibold">{translate(f.title)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {translate(f.desc)}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Dải điểm nổi bật — KHÔNG bọc container: 10 card tính năng phía trên
            đã đủ "hộp trong hộp"; dải này tách bằng đường kẻ + khoảng thở như
            hàng số liệu ở hero, đọc là một dãy thông tin chứ không phải thêm
            một cái thẻ nữa. */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="mt-10 grid gap-6 border-t border-border pt-6 sm:grid-cols-2 lg:grid-cols-4"
        >
          {[
            // i18n-ok: nhãn dịch lúc render bằng translate(b.t)/translate(b.d)
            { icon: Crown, t: "Warn tích lũy", d: "Đủ N lần warn là tự tăng cấp hình phạt" },
            {
              icon: LayoutDashboard,
              t: "Bảng nhiệt & warn",
              d: "Theo dõi từng thành viên, xóa nhiệt bằng một cú nhấn",
            },
            {
              icon: Zap,
              t: "Đồng bộ tự động",
              d: "Chỉnh trên web, bot áp dụng sau khoảng một phút",
            },
            {
              icon: Timer,
              t: "Báo cáo hàng ngày",
              d: "Tóm tắt sự kiện, nhiệt và warn gửi thẳng vào kênh log",
            },
          ].map((b) => (
            <div key={b.t} className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <b.icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">{translate(b.t)}</p>
                <p className="text-xs text-muted-foreground">{translate(b.d)}</p>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// (Khối quảng cáo khu vực riêng của chủ bot đã được GỠ khỏi trang chủ:
// quảng cáo một khu vực khoá bằng mật khẩu kèm "khả năng đặc biệt" là tiết lộ
// sự tồn tại + phạm vi của tính năng ẩn cho mọi người. Trang công khai chỉ nói
// về các tính năng ai cũng dùng được.)

/** Thang nhiệt 4 giai đoạn — trực quan + sinh động. */
function HeatLadder() {
  /* Thang nhiệt theo bảng đen trắng: mức càng cao → nền càng đậm.
     Thứ bậc đọc bằng độ đậm (contrast), không cần màu. */
  const tiers = [
    {
      label: "Cảnh báo",
      range: "25 → 39",
      chip: "border-border bg-secondary text-foreground",
      bar: "bg-foreground/40",
      fill: 25,
    },
    {
      label: "Tạm khóa",
      range: "40 → 69",
      chip: "border-foreground/30 bg-secondary text-foreground",
      bar: "bg-foreground/60",
      fill: 55,
    },
    {
      label: "Kick",
      range: "70 → 89",
      chip: "border-foreground/50 bg-secondary text-foreground",
      bar: "bg-foreground/80",
      fill: 80,
    },
    {
      label: "Ban",
      range: "90 → 100",
      chip: "border-foreground bg-foreground text-primary-foreground",
      bar: "bg-primary-foreground",
      fill: 100,
    },
  ];
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-foreground">
        <Flame className="h-4 w-4" />{" "}
        {translate("Nhiệt tăng dần, hình phạt leo thang theo ngưỡng")}{" "}
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        {tiers.map((t, i) => (
          <motion.div
            key={t.label}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.1 }}
            className={`rounded-lg border p-3 ${t.chip}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold">{translate(t.label)}</span>
              <span className="font-mono text-[10px] font-semibold opacity-80">{t.range}</span>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div className={`h-full rounded-full ${t.bar}`} style={{ width: `${t.fill}%` }} />
            </div>
          </motion.div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {translate("Vừa bị phạt mà tái phạm, nhiệt sẽ nhân")} <b className="text-foreground">×2</b>{" "}
        {translate("trong 30 phút. Warn tích lũy chạy song song: đủ 3 lần là tự tăng cấp.")}{" "}
      </p>
    </div>
  );
}

export function AntiNuke() {
  // i18n-ok: 12 nhãn dưới đây là mảng nội dung, dịch lúc render bằng translate(m)
  const nukeModules = [
    "Chống ban hàng loạt",
    "Chống kick hàng loạt",
    "Chống raid thành viên",
    "Chống tạo/xóa kênh",
    "Chống tạo/xóa thread",
    "Chống tạo webhook hàng loạt",
    "Chống xóa tin hàng loạt",
    "Chống tạo/xóa role",
    "Tự cấp quyền quản trị",
    "Chống thêm bot hàng loạt",
    "Cảnh báo bot lạ",
    "Bot vào-rồi-rời",
  ];
  // i18n-ok: 8 nhãn dưới đây là mảng nội dung, dịch lúc render bằng translate(m)
  const modModules = [
    "Chống spam tin nhắn",
    "Chống lặp tin nhắn",
    "Chống tin rỗng/nhiễu",
    "Chống spam mention",
    "Chống spam ảnh/file",
    "Lọc từ ngữ xấu",
    "Chặn link mời Discord",
    "Chặn link độc hại & file nguy hiểm",
  ];
  return (
    <section id="antinuke" className="relative overflow-hidden py-24">
      <div className="container relative">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
          >
            <Badge variant="danger" className="mb-4">
              <ShieldAlert className="h-3.5 w-3.5" /> {translate("Phòng thủ 32 module")}{" "}
            </Badge>
            <h2 className="font-display text-3xl font-bold tracking-tight md:text-5xl">
              {translate("Chặn đứng kẻ phá hoại")} <br />
              {translate("trước khi server sụp đổ")}{" "}
            </h2>
            <p className="mt-4 max-w-lg text-muted-foreground">
              {translate("Hai lớp phòng thủ:")} <b className="text-foreground">Anti Nuke</b>{" "}
              {translate(
                "(24 module) bám sát cấu trúc server (ban/kick hàng loạt, phá kênh, phá role…); còn",
              )}{" "}
              <b className="text-foreground">Moderation</b>{" "}
              {translate(
                "(8 module) sàng lọc nội dung độc hại mỗi ngày. Vượt ngưỡng, bot truy ra thủ phạm qua audit log, phạt đúng cài đặt và báo real-time về kênh log.",
              )}{" "}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {[
                // i18n-ok: nhãn dịch lúc render bằng translate(t)
                "Phạt trực tiếp",
                "Khóa kênh khi raid",
                "Miễn trừ role",
                "Kênh log riêng",
                "Báo cáo hàng ngày",
              ].map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs text-muted-foreground"
                >
                  {translate(t)}
                </span>
              ))}
            </div>
            <div className="mt-8">
              <HeatLadder />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-md"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 font-display font-semibold">
                <ShieldCheck className="h-5 w-5 text-primary" />{" "}
                {translate("Module đang bảo vệ")}{" "}
              </div>
              <Badge variant="success">{translate("32/32 bật")}</Badge>
            </div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {translate("🛡️ Anti Nuke / Raid — phạt trực tiếp")}{" "}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {nukeModules.map((m) => (
                <div
                  key={m}
                  className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-2"
                >
                  <span className="text-sm">{translate(m)}</span>
                  <span className="relative ml-2 flex h-4 w-7 items-center rounded-full bg-primary px-0.5">
                    <span className="ml-auto h-3 w-3 rounded-full bg-white" />
                  </span>
                </div>
              ))}
            </div>
            <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {translate("🧹 Moderation nội dung — cộng nhiệt + warn")}{" "}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {modModules.map((m) => (
                <div
                  key={m}
                  className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-2"
                >
                  <span className="text-sm">{translate(m)}</span>
                  <span className="relative ml-2 flex h-4 w-7 items-center rounded-full bg-primary px-0.5">
                    <span className="ml-auto h-3 w-3 rounded-full bg-white" />
                  </span>
                </div>
              ))}
            </div>
            <p className="mb-3 mt-3 text-center text-[11px] text-muted-foreground">
              {translate("Đang hiển thị 20/32 module.")}{" "}
              {translate("12 module chống nuke còn lại bật/tắt trong dashboard.")}{" "}
            </p>
            {/* Nền/viền dùng token theme (border-border + bg-secondary) thay vì
                trắng-trên-trắng: bản cũ hardcode chữ trắng trong khi nền ở light
                mode cũng sáng — người dùng không đọc được gì. */}
            <div className="mt-0 rounded-lg border border-border bg-secondary/60 p-3 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                {translate("🔒 Khóa kênh khi raid:")}
              </span>{" "}
              {translate(
                "khi bất kỳ module nào vượt ngưỡng, bot sẽ chặn toàn bộ thành viên gửi tin trong server, tự mở lại sau vài phút hoặc khi mod dùng",
              )}{" "}
              <code className="font-mono">/antinuke unlock</code>.
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/** Gặp gỡ Haimiya-senpai — trợ lý ảo. */
export function HaimiyaSection() {
  return (
    <section id="haimiya" className="relative overflow-hidden py-24">
      <div className="container relative">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="order-2 lg:order-1"
          >
            {" "}
            <div className="relative mx-auto w-fit">
              <div className="relative animate-float">
                <div className="flex h-64 w-64 items-center justify-center rounded-full border border-border bg-card shadow-sm">
                  <SafeHaimiyaAvatar className="h-48 w-48" />
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="order-1 lg:order-2"
          >
            <Badge className="mb-4">
              <Heart className="h-3.5 w-3.5" /> {translate("Gặp gỡ trợ lý ảo")}{" "}
            </Badge>
            <h2 className="font-display text-3xl font-bold tracking-tight md:text-5xl">
              {translate("Haimiya — trợ lý ảo đáng tin cậy")}{" "}
            </h2>
            <p className="mt-4 max-w-lg text-muted-foreground">
              {translate(
                "Haimiya là trợ lý ảo của Protogon, luôn túc trực trên website và dashboard. Haimiya trả lời bằng đúng ngôn ngữ bạn đang chọn — tiếng Việt, tiếng Anh hoặc tiếng Đức — về hệ thống nhiệt độ, warn tích lũy, Join Gate, chống nuke/raid, auto reply và cách cấu hình bot.",
              )}{" "}
            </p>
            <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
              {[
                // i18n-ok: nhãn dịch lúc render bằng translate(t)
                "Giải đáp tức thì, 24/7 — không cần chờ đợi",
                "Biết rõ từng tính năng & cách cấu hình của Protogon",
                "Trả lời rõ ràng, nghiêm túc — trên web lẫn trong dashboard",
              ].map((t) => (
                <li key={t} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs text-primary">
                    🌸
                  </span>
                  {translate(t)}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" onClick={() => window.dispatchEvent(new Event("haimiya-open"))}>
                <MessageCircle className="h-4 w-4" /> {translate("Hỏi thử Haimiya ngay")}{" "}
              </Button>
              <DashboardCta variant="outline">
                {translate("Vào dashboard")} <ArrowRight className="h-4 w-4" />
              </DashboardCta>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

export function HowItWorks() {
  const steps = [
    {
      n: "01",
      icon: Bot,
      title: "Tạo ứng dụng Discord",
      desc: "Tạo bot trên Discord Developer Portal, lấy token và Client ID rồi dán vào mục API Keys của Protogon.",
    },
    {
      n: "02",
      icon: ShieldCheck,
      title: "Mời bot vào server",
      desc: "Nhấn Mời bot và chọn server của bạn — Protogon tạo sẵn cấu hình an toàn với đủ 32 module bật, chỉnh lại bất cứ lúc nào.",
    },
    {
      n: "03",
      icon: LayoutDashboard,
      title: "Cấu hình trên dashboard",
      desc: "Thêm rule trả lời, tinh chỉnh nhiệt độ và warn, bật Join Gate, chọn hình phạt — mọi thay đổi có hiệu lực sau khoảng một phút.",
    },
  ];
  return (
    <section id="how" className="py-24">
      <div className="container">
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="mx-auto max-w-2xl text-center"
        >
          <motion.div variants={fadeUp}>
            <Badge className="mb-4">
              <Zap className="h-3.5 w-3.5" /> {translate("Bắt đầu nhanh")}{" "}
            </Badge>
          </motion.div>
          <motion.h2
            variants={fadeUp}
            className="font-display text-3xl font-bold tracking-tight md:text-4xl"
          >
            {translate("Hoạt động trong 3 bước")}{" "}
          </motion.h2>
        </motion.div>
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.12 }}
              className="relative rounded-xl border border-border bg-card p-4 sm:p-6"
            >
              <span className="font-mono text-4xl font-bold text-primary/25">{s.n}</span>
              <div className="mt-2 flex items-center gap-3">
                <s.icon className="h-5 w-5 text-primary" />
                <h3 className="font-display text-lg font-semibold">{translate(s.title)}</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {translate(s.desc)}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CtaBanner() {
  return (
    <section className="py-16">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-2xl border border-border bg-secondary p-8 text-center shadow-sm md:p-16"
        >
          <div className="relative">
            <SafeHaimiyaAvatar className="mx-auto h-28 w-28" />
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight md:text-5xl">
              {translate("Sẵn sàng để Haimiya")} <br className="hidden md:block" />{" "}
              {translate("hỗ trợ bạn quản lý server?")}{" "}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              {translate(
                "Đăng nhập bằng Discord, mời Protogon vào server để bật nhiệt độ, Join Gate, lọc nội dung và 32 module chống nuke ngay trên dashboard — cùng trợ lý ảo Haimiya đồng hành. Gói Miễn phí dùng được cho mọi server.",
              )}{" "}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <DashboardCta>
                {translate("Bắt đầu ngay")} <ArrowRight className="h-4 w-4" />
              </DashboardCta>
              <Button
                size="lg"
                variant="outline"
                onClick={() => window.dispatchEvent(new Event("haimiya-open"))}
              >
                <MessageCircle className="h-4 w-4" /> {translate("Trò chuyện với Haimiya")}{" "}
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export { HeatBar };
export { Facebook as FacebookIcon };
