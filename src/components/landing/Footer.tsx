import { Link } from "react-router-dom";
import { Facebook, MessageCircle, User } from "lucide-react";
import { Button } from "../ui/button";
import { SafeHaimiyaAvatar } from "./shared";
import { useBotStatus } from "../../lib/useBotStatus";

import { translate } from "../../lib/i18n";
/** Khối chủ bot ở footer — tự chặn lỗi riêng, mặc định về tên gốc khi backend down. */
function FooterOwner() {
  const botStatus = useBotStatus();
  const ownerName = botStatus?.ownerName ?? "wiothemilo";
  const ownerAvatar = botStatus?.ownerAvatarUrl ?? null;
  return (
    <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
      {ownerAvatar ? (
        <img
          src={ownerAvatar}
          alt={ownerName}
          className="h-8 w-8 rounded-full object-cover ring-2 ring-white/70"
          draggable={false}
        />
      ) : (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <User className="h-4 w-4" />
        </span>
      )}
      <span>
        {translate("Chủ bot:")} <b className="text-foreground">{ownerName}</b>
        <span className="ml-1.5 hidden sm:inline">{translate("· hoạt động 24/7")}</span>
      </span>
    </div>
  );
}

/** Footer landing — liên kết cộng đồng + thông tin chủ bot. */
export default function Footer({
  discordInvite,
  facebookUrl,
}: {
  discordInvite: string;
  facebookUrl: string;
}) {
  return (
    <footer className="border-t border-border py-10">
      <div className="container">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-primary p-0.5 shadow-sm">
              <SafeHaimiyaAvatar className="h-full w-full" />
            </span>
            <div>
              <p className="font-display font-semibold">Protogon Bot</p>
              <p className="text-xs text-muted-foreground">
                {translate("Bot Discord bảo vệ server, đồng hành cùng trợ lý Haimiya")}{" "}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={discordInvite} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" />
                Discord server
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={facebookUrl} target="_blank" rel="noreferrer">
                <Facebook className="h-4 w-4" />
                Fanpage Facebook
              </a>
            </Button>
          </div>
        </div>
        {/* Liên kết pháp lý: mọi trang (kể cả trang pháp lý khác) đều có đường
            tới 3 văn bản này — yêu cầu bắt buộc để xác minh bot trên Discord. */}
        <nav
          aria-label={translate("Văn bản pháp lý")}
          className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground"
        >
          <span className="font-semibold text-foreground">{translate("Văn bản pháp lý")}</span>
          <Link to="/features" className="transition-colors hover:text-foreground">
            {translate("Tính năng")}
          </Link>
          <Link to="/terms" className="transition-colors hover:text-foreground">
            {translate("Điều khoản sử dụng")}
          </Link>
          <Link to="/privacy" className="transition-colors hover:text-foreground">
            {translate("Chính sách quyền riêng tư")}
          </Link>
          <Link to="/data-deletion" className="transition-colors hover:text-foreground">
            {translate("Lưu trữ & xoá dữ liệu")}
          </Link>
          {/* Trạng thái hệ thống: công khai (không auth) — người dùng tự kiểm
              bot/web có sống không mà không cần hỏi trong Discord. */}
          <Link to="/status" className="transition-colors hover:text-foreground">
            {translate("Trạng thái hệ thống")}
          </Link>
        </nav>
        <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-border/60 pt-6 md:flex-row">
          <p className="text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()}{" "}
            {translate(
              "Protogon Bot · Tự trả lời theo từ khóa, nhiệt độ vi phạm, Join Gate và phòng thủ chống raid cho cộng đồng Discord",
            )}
          </p>
          <FooterOwner />
        </div>
      </div>
    </footer>
  );
}
