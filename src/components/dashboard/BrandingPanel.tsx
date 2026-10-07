import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { ImagePlus, Link2, Palette, Trash2, Upload } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Card, CardContent } from "../ui/card";
import type { GenericId } from "convex/values";
import { getSessionToken } from "../../lib/discord";
import { useBranding } from "../../lib/useBranding";
import { normalizeAvatarFile } from "../../lib/avatarImage";
import { HaimiyaAvatar } from "../HaimiyaChat";
import type { GuildData } from "../../lib/types";

import { translate } from "../../lib/i18n";
type Slot = "bot" | "haimiya";

const SLOT_META: Record<Slot, { title: string; desc: string }> = {
  bot: {
    title: "Avatar bot (Protogon)",
    desc: "Logo bot xuất hiện trên trang chủ, trang quản lý và toàn bộ website.",
  },
  haimiya: {
    title: "Avatar trợ lý AI (Haimiya-senpai)",
    desc: "Ảnh đại diện của Haimiya trong cửa sổ trò chuyện trợ giúp.",
  },
};

export default function BrandingPanel({ data }: { data: GuildData }) {
  const branding = useBranding();
  const generateUploadUrl = useMutation(api.hidden.generateUploadUrl);
  const saveBrandingUpload = useMutation(api.hidden.saveBrandingUpload);
  const setBotBranding = useMutation(api.hidden.setBotBranding);

  const [uploading, setUploading] = useState<Slot | null>(null);
  const [urls, setUrls] = useState<Record<Slot, string>>({ bot: "", haimiya: "" });
  const [savingUrl, setSavingUrl] = useState<Slot | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingSlot, setPendingSlot] = useState<Slot>("bot");

  const token = getSessionToken();
  const guildId = data.guild.discordId;

  if (!data.guild.isBotOwner) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-4 sm:p-5 text-sm text-muted-foreground">
          <Palette className="h-5 w-5 shrink-0 text-primary" />
          {translate("Tùy chỉnh giao diện chỉ dành cho")} <b>{translate("admin sở hữu bot")}</b>.
        </CardContent>
      </Card>
    );
  }

  async function pickFile(slot: Slot) {
    setPendingSlot(slot);
    fileRef.current?.click();
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 2_000_000) {
      toast.error(translate("Ảnh tối đa 2MB, vui lòng chọn ảnh nhỏ hơn."));
      return;
    }
    const slot = pendingSlot;
    setUploading(slot);
    try {
      // Chuẩn hoá TRƯỚC khi upload: decode thật + co ≤512px + encode JPEG/PNG
      // chuẩn (xem src/lib/avatarImage.ts). File không đọc được bị TỪ CHỐI ở
      // đây với thông điệp rõ ràng, không âm thầm lên production rồi vỡ avatar
      // trên trang chủ (bug ảnh 3600px nhòe sọc 07/10/2026).
      const { blob } = await normalizeAvatarFile(file);
      const uploadUrl = await generateUploadUrl({ token, guildId });
      // Convex storage upload URL yêu cầu POST (không phải PUT) — PUT bị chặn
      // bởi CORS preflight nên fetch báo "Failed to fetch".
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": blob.type || "image/jpeg" },
        body: blob,
      });
      if (!res.ok)
        throw new Error(translate("Tải ảnh lên máy chủ thất bại (HTTP {p0})", { p0: res.status }));
      let storageId = "";
      try {
        const data = (await res.json()) as { storageId?: string };
        storageId = data?.storageId ?? "";
      } catch {
        // phản hồi không phải JSON
      }
      if (!storageId)
        throw new Error(
          translate("Máy chủ không trả về ID ảnh — hãy thử dán đường dẫn ảnh thay thế"),
        );
      const out = await saveBrandingUpload({
        token,
        guildId,
        storageId: storageId as GenericId<"_storage">,
        slot,
      });
      toast.success(
        slot === "bot"
          ? translate("Đã đổi avatar bot, áp dụng ngay toàn web")
          : translate("Đã đổi avatar Haimiya, áp dụng ngay toàn web 🎀"),
      );
      setUrls((u) => ({ ...u, [slot]: "" }));
      void out;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : translate("Tải ảnh thất bại"));
    } finally {
      setUploading(null);
    }
  }

  async function saveUrl(slot: Slot) {
    const value = urls[slot].trim();
    if (!/^https?:\/\//i.test(value)) {
      toast.error(translate("Dán đường dẫn ảnh hợp lệ (bắt đầu bằng http:// hoặc https://)"));
      return;
    }
    setSavingUrl(slot);
    try {
      await setBotBranding({
        token,
        guildId,
        ...(slot === "bot" ? { botAvatarUrl: value } : { haimiyaAvatarUrl: value }),
      });
      toast.success(translate("Đã lưu ảnh mới, áp dụng ngay toàn web"));
      setUrls((u) => ({ ...u, [slot]: "" }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : translate("Lưu thất bại"));
    } finally {
      setSavingUrl(null);
    }
  }

  async function removeAvatar(slot: Slot) {
    try {
      await setBotBranding({
        token,
        guildId,
        ...(slot === "bot" ? { botAvatarUrl: null } : { haimiyaAvatarUrl: null }),
      });
      toast.success(translate("Đã xóa ảnh tùy chỉnh, trở về mặc định"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : translate("Xóa thất bại"));
    }
  }

  const current: Record<Slot, string | null> = {
    bot: branding?.botAvatarUrl ?? null,
    haimiya: branding?.haimiyaAvatarUrl ?? null,
  };

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-display font-semibold">
              <Palette className="h-4 w-4 text-primary" />{" "}
              {translate("Tùy chỉnh giao diện bot")}{" "}
            </h3>
            <p className="text-sm text-muted-foreground">
              {translate(
                "Đổi avatar bot và trợ lý AI ngay trên web — chỉ admin sở hữu bot được phép.",
              )}{" "}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {(["bot", "haimiya"] as Slot[]).map((slot) => (
            <div key={slot} className="rounded-xl border border-border bg-secondary/30 p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/80 ring-2 ring-primary/30">
                  {slot === "haimiya" ? (
                    <HaimiyaAvatar className="h-16 w-16" src={current[slot]} />
                  ) : current[slot] ? (
                    <img
                      src={current[slot]}
                      alt="Bot"
                      className="h-14 w-14 rounded-full object-cover"
                    />
                  ) : (
                    <HaimiyaAvatar className="h-16 w-16" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{translate(SLOT_META[slot].title)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {translate(SLOT_META[slot].desc)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => pickFile(slot)}
                      disabled={uploading !== null}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {translate(uploading === slot ? "Đang tải…" : "Tải ảnh lên")}
                    </Button>
                    {current[slot] && (
                      <Button size="sm" variant="outline" onClick={() => removeAvatar(slot)}>
                        <Trash2 className="h-3.5 w-3.5" /> {translate("Xóa ảnh")}{" "}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-2">
                <div className="grid gap-1">
                  <Label className="text-[11px] text-muted-foreground">
                    {translate("Hoặc dán đường dẫn ảnh")}{" "}
                  </Label>
                  <Input
                    value={urls[slot]}
                    onChange={(e) => setUrls((u) => ({ ...u, [slot]: e.target.value }))}
                    placeholder="https://…"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() => saveUrl(slot)}
                  disabled={savingUrl === slot || !urls[slot].trim()}
                >
                  {savingUrl === slot ? "…" : <Link2 className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <ImagePlus className="h-3.5 w-3.5 text-primary" />
          {translate(
            "Ảnh tải lên được lưu trên bộ nhớ đám mây của bot và áp dụng ngay toàn web (trang chủ, đăng nhập, dashboard, chat AI).",
          )}{" "}
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFileChosen}
        />
      </CardContent>
    </Card>
  );
}
