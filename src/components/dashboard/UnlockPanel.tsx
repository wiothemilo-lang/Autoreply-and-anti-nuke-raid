import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { KeyRound, Lock, ShieldCheck, ShieldX } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardContent } from "../ui/card";
import { getSessionToken } from "../../lib/discord";
import type { GuildData } from "../../lib/types";
import { hiddenUnlockKey } from "../../lib/hiddenUnlock";

import { translate } from "../../lib/i18n";

export { hiddenUnlockKey } from "../../lib/hiddenUnlock";

export default function UnlockPanel({
  data,
  onUnlocked,
}: {
  data: GuildData;
  onUnlocked: () => void;
}) {
  const verify = useMutation(api.hidden.verifyHiddenPassword);
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);

  // 🔒 CHỈ admin sở hữu bot mới được tương tác mật khẩu / tính năng ẩn.
  if (!data.guild.isBotOwner) {
    return (
      <Card className="mx-auto max-w-md">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-secondary text-danger shadow-sm">
            <ShieldX className="h-8 w-8" />
          </span>
          <div>
            <h2 className="font-display text-xl font-bold">{translate("Tính năng ẩn 🔒")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {translate("Chỉ")} <b>{translate("admin sở hữu bot")}</b>{" "}
              {translate(
                "mới được thao tác mật khẩu và mở khóa tính năng ẩn — chủ hay mod của một server không thay thế được.",
              )}{" "}
            </p>
            {!data.guild.botOwnerSet && (
              <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
                {translate(
                  "Chưa thiết lập chủ sở hữu. Người tạo bot cần đăng nhập bằng chính tài khoản Discord đã tạo bot, vào",
                )}{" "}
                <b>{translate("Cài đặt → Mật khẩu tính năng ẩn")}</b>{" "}
                {translate("để đặt mật khẩu đầu tiên — người đó sẽ trở thành chủ sở hữu bot.")}{" "}
              </p>
            )}
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            {translate("Quyền quản lý server không đủ để mở khóa mục này.")}{" "}
          </p>
        </CardContent>
      </Card>
    );
  }

  async function unlock() {
    if (!password) return;
    setChecking(true);
    try {
      const ok = await verify({
        token: getSessionToken(),
        guildId: data.guild.discordId,
        password,
      });
      if (ok) {
        sessionStorage.setItem(hiddenUnlockKey(), "1");
        toast.success(translate("Đã mở khóa tính năng ẩn 🔓"));
        onUnlocked();
      } else {
        toast.error(translate("Sai mật khẩu rồi, thử lại nhé!"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Mở khóa thất bại"));
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card className="mx-auto max-w-md border-primary/30">
      <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-secondary text-foreground shadow-sm">
          <Lock className="h-8 w-8" />
        </span>
        <div>
          <h2 className="font-display text-xl font-bold">{translate("Tính năng ẩn 🔒")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {translate(
              "Mục này được bảo vệ bằng mật khẩu do chủ sở hữu bot đặt. Chỉ người biết mật khẩu mới xem được nội dung bên trong.",
            )}{" "}
          </p>
        </div>
        <div className="grid w-full gap-1.5">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") unlock();
            }}
            placeholder={translate("Mật khẩu tính năng ẩn…")}
            autoFocus
            maxLength={64}
          />
          <Button onClick={unlock} disabled={checking || !password} className="w-full">
            {checking ? (
              translate("Đang kiểm tra…")
            ) : (
              <>
                <KeyRound className="h-4 w-4" /> {translate("Mở khóa")}{" "}
              </>
            )}
          </Button>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          {translate("Quên mật khẩu? Vào Cài đặt để đặt lại (chỉ chủ sở hữu bot).")}{" "}
        </p>
      </CardContent>
    </Card>
  );
}
