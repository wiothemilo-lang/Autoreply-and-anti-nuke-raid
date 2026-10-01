import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { MessageSquareQuote, Pencil, Plus, Power, Search, Smile, Trash2, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { getSessionToken } from "../../lib/discord";
import { cn } from "../../lib/utils";
import type { GuildData, ReactionRolePanel } from "../../lib/types";

import { translate } from "../../lib/i18n";
interface EntryRow {
  emoji: string;
  roleId: string;
}

/** Bộ emoji gợi ý — nhóm theo chủ đề để dễ chọn. */
const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: "Phổ biến",
    emojis: ["✅", "❌", "⭐", "🔥", "💯", "👍", "👎", "👀", "❤️", "🎉", "🎁", "🏆"],
  },
  {
    label: "Cảm xúc",
    emojis: [
      "😀",
      "😄",
      "😁",
      "😂",
      "🤣",
      "😊",
      "😍",
      "🥰",
      "😎",
      "🤩",
      "😅",
      "😭",
      "😤",
      "🤔",
      "😴",
      "🙄",
    ],
  },
  {
    label: "Cử chỉ",
    emojis: ["👍", "👎", "👏", "🙌", "🙏", "🤝", "💪", "👋", "🤙", "✌️", "🤞", "👌"],
  },
  {
    label: "Màu sắc",
    emojis: ["🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⚫", "⚪", "🟤", "🔺", "🔻", "🔵"],
  },
  {
    label: "Động vật",
    emojis: [
      "🐶",
      "🐱",
      "🐭",
      "🐹",
      "🐰",
      "🦊",
      "🐻",
      "🐼",
      "🐨",
      "🐯",
      "🦁",
      "🐮",
      "🐷",
      "🐸",
      "🐵",
      "🦄",
    ],
  },
  {
    label: "Game & hoạt động",
    emojis: [
      "🎮",
      "🕹️",
      "🎯",
      "🎲",
      "🎳",
      "🎰",
      "🎪",
      "🛡️",
      "⚔️",
      "🏹",
      "🚀",
      "🏎️",
      "⚽",
      "🏀",
      "🏈",
      "🎾",
    ],
  },
  {
    label: "Âm nhạc & giải trí",
    emojis: ["🎵", "🎶", "🎤", "🎧", "🎸", "🎹", "🎬", "🎥", "📺", "📻", "🎨", "🖌️"],
  },
  {
    label: "Khác",
    emojis: [
      "☕",
      "🍕",
      "🍔",
      "🌮",
      "🍣",
      "🍰",
      "🎂",
      "🍬",
      "💎",
      "💰",
      "📚",
      "✏️",
      "💡",
      "🔔",
      "📌",
      "🧩",
    ],
  },
];

/** Bảng chọn emoji: tìm kiếm + lưới gợi ý + nhập emoji tùy chỉnh (unicode / <:name:id> / ID). */
function EmojiPicker({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (emoji: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = q
    ? EMOJI_CATEGORIES.flatMap((c) =>
        c.label.toLowerCase().includes(q)
          ? c.emojis.map((e) => ({ group: c.label, emoji: e }))
          : c.emojis
              .filter((e) => e.toLowerCase().includes(q))
              .map((e) => ({ group: c.label, emoji: e })),
      )
    : [];

  function pick(emoji: string) {
    onChange(emoji);
    onClose();
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smile className="h-4 w-4 text-primary" /> {translate("Chọn emoji")}{" "}
          </DialogTitle>
          <DialogDescription>
            {translate(
              "Chọn từ gợi ý bên dưới hoặc dán emoji tùy chỉnh: emoji unicode, custom emoji",
            )}{" "}
            <code className="rounded bg-secondary px-1">&lt;:name:id&gt;</code>{" "}
            {translate("hoặc ID emoji.")}{" "}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={translate("Tìm emoji hoặc chủ đề…")}
              className="pl-8"
            />
          </div>
          {q ? (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-border p-2">
              {filtered.length === 0 ? (
                <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                  {translate("Không tìm thấy emoji phù hợp.")}{" "}
                </p>
              ) : (
                <div className="grid grid-cols-8 gap-1">
                  {filtered.map(({ group, emoji }, i) => (
                    <button
                      key={`${group}-${emoji}-${i}`}
                      onClick={() => pick(emoji)}
                      title={group}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-xl transition-colors hover:bg-primary/10"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-border p-2">
              {EMOJI_CATEGORIES.map((cat) => (
                <div key={cat.label}>
                  <p className="px-1 pb-1 text-[11px] font-semibold text-muted-foreground">
                    {translate(cat.label)}
                  </p>
                  <div className="grid grid-cols-8 gap-1">
                    {cat.emojis.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => pick(emoji)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-xl transition-colors hover:bg-primary/10"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="grid gap-1.5">
            <Label>{translate("Emoji tùy chỉnh")}</Label>
            <div className="flex items-center gap-2">
              <Input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="VD: ✅ · <a:cat:123456789012345678> · 123456789012345678"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && custom.trim()) pick(custom.trim());
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => custom.trim() && pick(custom.trim())}
              >
                {translate("Dùng")}{" "}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {translate("Đang chọn:")}{" "}
              <span className="font-mono">{value || translate("chưa có")}</span>
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" /> {translate("Hủy")}{" "}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ReactionRolesPanel({ data }: { data: GuildData }) {
  const createPanel = useMutation(api.hidden.createPanel);
  const updatePanel = useMutation(api.hidden.updatePanel);
  const deletePanel = useMutation(api.hidden.deletePanel);
  const togglePanel = useMutation(api.hidden.togglePanel);

  const textChannels = data.channels.filter((c) => c.type === 0 || c.type === 5);
  const roleOptions = data.roles.filter((r) => r.name !== "@everyone");
  const token = getSessionToken();
  const guildId = data.guild.discordId;

  const [open, setOpen] = useState(false);
  const [editingPanel, setEditingPanel] = useState<ReactionRolePanel | null>(null);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [channelId, setChannelId] = useState("");
  const [rows, setRows] = useState<EntryRow[]>([{ emoji: "✅", roleId: "" }]);
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  function channelName(id: string) {
    return textChannels.find((c) => c.channelId === id)?.name ?? translate("kênh đã xóa");
  }
  function roleName(id: string) {
    return roleOptions.find((r) => r.roleId === id)?.name ?? id;
  }

  function openCreate() {
    setEditingPanel(null);
    setLabel("");
    setDescription("");
    setThumbnailUrl("");
    setChannelId("");
    setRows([{ emoji: "✅", roleId: "" }]);
    setOpen(true);
  }

  function openEdit(p: ReactionRolePanel) {
    setEditingPanel(p);
    setLabel(p.label);
    setDescription(p.description ?? "");
    setThumbnailUrl(p.thumbnailUrl ?? "");
    setChannelId(p.channelId);
    setRows(
      p.entries.length > 0
        ? p.entries.map((e) => ({ emoji: e.emoji, roleId: e.roleId }))
        : [{ emoji: "✅", roleId: "" }],
    );
    setOpen(true);
  }

  async function handleSave() {
    if (rows.some((r) => !r.emoji || !r.roleId)) {
      return toast.error(translate("Mỗi dòng cần có emoji và role được chọn"));
    }
    setSaving(true);
    try {
      if (editingPanel) {
        await updatePanel({
          token,
          guildId,
          panelId: editingPanel._id,
          label,
          description: description.trim() || null,
          thumbnailUrl: thumbnailUrl.trim() || null,
          entries: rows,
        });
        toast.success(translate("Đã cập nhật bảng — bot gửi bảng mới trong khoảng 1 phút"));
      } else {
        await createPanel({
          token,
          guildId,
          channelId,
          label,
          description: description.trim() || undefined,
          thumbnailUrl: thumbnailUrl.trim() || undefined,
          entries: rows,
        });
        toast.success(translate("Đã tạo bảng — bot gửi tin nhắn trong khoảng 1 phút"));
      }
      setOpen(false);
      setEditingPanel(null);
      setLabel("");
      setDescription("");
      setThumbnailUrl("");
      setChannelId("");
      setRows([{ emoji: "✅", roleId: "" }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Lưu thất bại"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-display font-semibold">
              <MessageSquareQuote className="h-4 w-4 text-primary" /> Reaction Role
            </h3>
            <p className="text-sm text-muted-foreground">
              {translate(
                "Thành viên bấm emoji dưới tin nhắn để tự nhận hoặc gỡ role. Tùy chỉnh được tên, mô tả, thumbnail và từng cặp emoji → role.",
              )}{" "}
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> {translate("Tạo bảng mới")}{" "}
          </Button>
        </div>

        {data.panels.length === 0 ? (
          <p className="mt-4 rounded-lg bg-secondary/40 px-3 py-3 text-sm text-muted-foreground">
            {translate('Chưa có bảng reaction role nào. Bấm "Tạo bảng mới" để bắt đầu 🌸')}{" "}
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {data.panels.map((p: ReactionRolePanel) => (
              <li
                key={p._id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {p.label}
                    {!p.messageId ? (
                      p.postError ? (
                        <Badge className="border-danger/40 bg-danger/10 text-danger">
                          {translate("⚠️ lỗi gửi")}{" "}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">{translate("⏳ chờ bot gửi")}</Badge>
                      )
                    ) : p.enabled ? (
                      <Badge variant="success">{translate("đang chạy")}</Badge>
                    ) : (
                      <Badge variant="secondary">{translate("đã tắt")}</Badge>
                    )}
                  </p>
                  {p.postError && (
                    <p className="mt-1 rounded-md border border-danger/30 bg-danger/10 px-2 py-1 text-xs text-danger">
                      {/* translate() là an toàn với mọi chuỗi: không có key thì trả
                          nguyên bản, nên lỗi từ Discord/Convex hiện như cũ — nhưng
                          lỗi do backend tự sinh ("Lỗi không xác định") sẽ được dịch
                          thay vì lọt tiếng Việt ra giao diện EN/DE. */}
                      ⚠️ {translate(p.postError)}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    #{channelName(p.channelId)} ·{" "}
                    {p.entries.map((e) => `${e.emoji} → ${roleName(e.roleId)}`).join(" · ")}
                  </p>
                  {(p.description || p.thumbnailUrl) && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground/80">
                      {p.thumbnailUrl ? translate("🖼️ có thumbnail ·") : ""}{" "}
                      {p.description ? `"${p.description}"` : ""}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title={translate("Sửa bảng")}
                    onClick={() => openEdit(p)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title={translate(p.enabled ? "Tắt bảng" : "Bật bảng")}
                    onClick={async () => {
                      try {
                        await togglePanel({ token, guildId, panelId: p._id });
                        toast.success(translate(p.enabled ? "Đã tắt bảng" : "Đã bật bảng"));
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : translate("Thất bại"));
                      }
                    }}
                  >
                    <Power className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title={translate("Xóa bảng")}
                    onClick={async () => {
                      if (!confirm(translate('Xóa bảng "{p0}"?', { p0: p.label }))) return;
                      try {
                        await deletePanel({ token, guildId, panelId: p._id });
                        toast.success(translate("Đã xóa bảng (tin nhắn cũ trong Discord vẫn còn)"));
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : translate("Xóa thất bại"));
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {translate(editingPanel ? "Sửa bảng reaction role" : "Tạo bảng reaction role")}
              </DialogTitle>
              <DialogDescription>
                {translate(
                  editingPanel
                    ? "Bot gửi bảng mới với nội dung đã chỉnh trong khoảng 1 phút (tin nhắn cũ vẫn còn)."
                    : "Bot gửi một tin nhắn vào kênh đã chọn kèm các emoji; thành viên bấm emoji để nhận role.",
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>{translate("Tên bảng")}</Label>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={translate("VD: Chọn game của bạn 🎮")}
                  maxLength={100}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{translate("Kênh gửi tin nhắn")}</Label>
                <Select value={channelId} onValueChange={setChannelId}>
                  <SelectTrigger>
                    <SelectValue placeholder={translate("Chọn kênh…")} />
                  </SelectTrigger>
                  <SelectContent>
                    {textChannels.map((c) => (
                      <SelectItem key={c.channelId} value={c.channelId}>
                        #{c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>{translate("Nội dung / mô tả")}</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={translate("VD: Bấm emoji bên dưới để nhận role tương ứng 🌸")}
                  maxLength={2000}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{translate("Thumbnail (ảnh nhỏ, tùy chọn)")}</Label>
                <Input
                  value={thumbnailUrl}
                  onChange={(e) => setThumbnailUrl(e.target.value)}
                  placeholder="https://i.imgur.com/….png"
                  maxLength={2000}
                />
                {thumbnailUrl.trim() && (
                  <img
                    src={thumbnailUrl.trim()}
                    alt=""
                    className="h-14 w-14 rounded-lg border border-border object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.opacity = "0.25";
                    }}
                  />
                )}
              </div>
              <div>
                <Label className="mb-1.5 block">Emoji → Role</Label>
                <div className="space-y-2">
                  {rows.map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        className={cn(
                          "h-10 w-12 shrink-0 text-xl",
                          !row.emoji && "text-muted-foreground",
                        )}
                        title={translate("Chọn emoji")}
                        onClick={() => setPickerFor(i)}
                      >
                        {row.emoji || "＋"}
                      </Button>
                      <Select
                        value={row.roleId}
                        onValueChange={(v) =>
                          setRows((rs) => rs.map((r, j) => (j === i ? { ...r, roleId: v } : r)))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={translate("Chọn role…")} />
                        </SelectTrigger>
                        <SelectContent>
                          {roleOptions.map((r) => (
                            <SelectItem key={r.roleId} value={r.roleId}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={rows.length === 1}
                        onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => setRows((rs) => [...rs, { emoji: "⭐", roleId: "" }])}
                >
                  <Plus className="h-4 w-4" /> {translate("Thêm cặp emoji/role")}{" "}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleSave}
                disabled={
                  saving ||
                  !label ||
                  (editingPanel ? false : !channelId) ||
                  rows.some((r) => !r.emoji || !r.roleId)
                }
              >
                {translate(saving ? "Đang lưu…" : editingPanel ? "Lưu thay đổi" : "Tạo bảng")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {pickerFor !== null && (
          <EmojiPicker
            value={rows[pickerFor]?.emoji ?? ""}
            onChange={(emoji) =>
              setRows((rs) => rs.map((r, j) => (j === pickerFor ? { ...r, emoji } : r)))
            }
            onClose={() => setPickerFor(null)}
          />
        )}
      </CardContent>
    </Card>
  );
}
