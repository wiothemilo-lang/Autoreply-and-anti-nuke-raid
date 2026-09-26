import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import {
  AtSign,
  Bot,
  KeyRound,
  Loader2,
  MessageSquareQuote,
  Pencil,
  Plus,
  Sparkles,
  Timer,
  Trash2,
} from "lucide-react";
import { simulateAutoReply, type SimRule } from "../../lib/autoreplySim";
import { api } from "../../../convex/_generated/api";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card, CardContent } from "../ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Switch } from "../ui/switch";
import { MultiSelect } from "../ui/multi-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { CHANNEL_TYPE_LABEL } from "../../lib/constants";
import type { AutoReply, GuildData } from "../../lib/types";
import { getSessionToken } from "../../lib/discord";

import { translate } from "../../lib/i18n";
const TOKEN = () => getSessionToken();

interface FormState {
  name: string;
  triggerType: "keyword" | "mention";
  keywords: string;
  response: string;
  channels: string[];
  cooldownSeconds: number;
}

const emptyForm: FormState = {
  name: "",
  triggerType: "keyword",
  keywords: "",
  response: "",
  channels: [],
  cooldownSeconds: 30,
};

export default function AutoReplyPanel({ data }: { data: GuildData }) {
  const addRule = useMutation(api.autoreplies.add);
  const updateRule = useMutation(api.autoreplies.update);
  const removeRule = useMutation(api.autoreplies.remove);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AutoReply | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  // ── "Thử rule": mô phỏng bot trả lời ngay trên web trước khi lưu ──
  const [testMessage, setTestMessage] = useState("");
  const [testMentioned, setTestMentioned] = useState(false);
  const [testChannelId, setTestChannelId] = useState<string>("");
  const simMatches = useMemo(
    () =>
      simulateAutoReply(data.autoReplies as SimRule[], {
        content: testMessage,
        mentioned: testMentioned,
        channelId: testChannelId || null,
        username: "Minh",
      }),
    [data.autoReplies, testMessage, testMentioned, testChannelId],
  );
  const winner = simMatches[0];

  const textChannels = data.channels.filter((c) => c.type === 0 || c.type === 5);
  const channelOptions = textChannels.map((c) => ({
    value: c.channelId,
    label: `#${c.name}`,
    sublabel: CHANNEL_TYPE_LABEL[c.type],
  }));

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(rule: AutoReply) {
    setEditing(rule);
    setForm({
      name: rule.name,
      triggerType: rule.triggerType,
      keywords: rule.keywords.join(", "),
      response: rule.response,
      channels: rule.channels,
      cooldownSeconds: rule.cooldownSeconds,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return toast.error(translate("Nhập tên rule"));
    if (!form.response.trim()) return toast.error(translate("Nhập nội dung trả lời"));
    if (form.triggerType === "keyword" && !form.keywords.trim()) {
      return toast.error(translate("Nhập ít nhất một từ khóa"));
    }
    setSaving(true);
    try {
      const keywords = form.keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      if (editing) {
        await updateRule({
          token: TOKEN(),
          id: editing._id,
          name: form.name.trim(),
          triggerType: form.triggerType,
          keywords,
          response: form.response,
          channels: form.channels,
          cooldownSeconds: Number(form.cooldownSeconds) || 0,
        });
        toast.success(translate('Đã cập nhật rule "{p0}"', { p0: form.name }));
      } else {
        await addRule({
          token: TOKEN(),
          guildId: data.guild.discordId,
          name: form.name.trim(),
          triggerType: form.triggerType,
          keywords,
          response: form.response,
          channels: form.channels,
          cooldownSeconds: Number(form.cooldownSeconds) || 0,
        });
        toast.success(translate('Đã tạo rule "{p0}"', { p0: form.name }));
      }
      setDialogOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Lưu thất bại"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleRule(rule: AutoReply, enabled: boolean) {
    try {
      await updateRule({ token: TOKEN(), id: rule._id, enabled });
      // Ghép chuỗi kiểu "Rule X {đã bật}" không dịch được sang EN/DE — mỗi
      // trạng thái là một câu trọn vẹn để bản dịch giữ đúng ngữ pháp.
      toast.success(
        translate(enabled ? 'Đã bật rule "{p0}"' : 'Đã tắt rule "{p0}"', { p0: rule.name }),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Thất bại"));
    }
  }

  async function handleDelete(rule: AutoReply) {
    if (!confirm(translate('Xóa rule "{p0}"?', { p0: rule.name }))) return;
    try {
      await removeRule({ token: TOKEN(), id: rule._id });
      toast.success(translate('Đã xóa "{p0}"', { p0: rule.name }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Xóa thất bại"));
    }
  }

  const totalRules = data.autoReplies.length;
  const activeRules = useMemo(
    () => data.autoReplies.filter((r) => r.enabled).length,
    [data.autoReplies],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MessageSquareQuote className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-semibold tracking-tight">Auto Reply</h2>
              <Badge variant="outline" className="font-mono text-xs">
                {totalRules} {translate("rule")}
              </Badge>
              {totalRules > 0 && (
                <Badge variant={activeRules > 0 ? "secondary" : "outline"} className="text-xs">
                  {activeRules}/{totalRules} {translate(activeRules > 0 ? "Đang bật" : "Đã tắt")}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {translate("Bot tự trả lời khi tin nhắn chứa từ khóa hoặc tag @bot")}{" "}
            </p>
          </div>
        </div>
        <Button
          onClick={openCreate}
          className="gap-2 shadow-sm transition-all duration-200 hover:shadow"
        >
          <Plus className="h-4 w-4" /> {translate("Thêm rule")}{" "}
        </Button>
      </div>

      {/* ── "Thử rule": gõ tin nhắn mẫu → thấy ngay bot sẽ trả lời gì ──
          Logic mô phỏng nằm ở lib/autoreplySim.ts (khớp messageCreate.js);
          cooldown là trạng thái in-memory của bot nên không mô phỏng được. */}
      <Card className="overflow-hidden border border-border/70 bg-card/60 backdrop-blur-sm shadow-sm transition-all duration-200 hover:border-border">
        <div className="flex items-center gap-2 border-b border-border/50 bg-muted/20 px-4 py-2.5 sm:px-5">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {translate("Thử rule — gõ tin nhắn mẫu")}
          </span>
        </div>
        <CardContent className="p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 sm:items-end">
            <div className="sm:col-span-6 lg:col-span-7">
              <Label htmlFor="test-message" className="text-xs font-medium text-muted-foreground">
                {translate("Thử rule — gõ tin nhắn mẫu")}
              </Label>
              <Input
                id="test-message"
                placeholder={translate("ví dụ: mọi người ơi hello!")}
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                className="mt-1.5 transition-colors duration-150"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/50 px-3 py-2 transition-all duration-150 hover:bg-accent/40 sm:col-span-3 sm:justify-start sm:gap-2.5">
              <Switch
                id="test-mention"
                checked={testMentioned}
                onCheckedChange={setTestMentioned}
              />
              <Label htmlFor="test-mention" className="cursor-pointer text-xs font-normal">
                {translate("Tin nhắn có tag bot")}
              </Label>
            </div>
            <div className="sm:col-span-3 lg:col-span-2">
              <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {translate("Kênh")}
              </Label>
              <Select
                value={testChannelId || "all"}
                onValueChange={(v) => setTestChannelId(v === "all" ? "" : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{translate("Tất cả kênh")}</SelectItem>
                  {textChannels.map((c) => (
                    <SelectItem key={c.channelId} value={c.channelId}>
                      #{c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-border/80 bg-secondary/30 p-3.5 sm:p-4 transition-all duration-200">
            {!testMessage.trim() && !testMentioned ? (
              <p className="text-xs text-muted-foreground">
                {translate("Bot sẽ không trả lời (không có nội dung).")}
              </p>
            ) : winner ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-xs font-semibold text-foreground">Protogon</span>
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
                    {translate('Bot trả lời bằng rule "{p0}":', { p0: winner.rule.name })}
                  </Badge>
                </div>
                <div className="ml-8 rounded-lg border border-border/60 bg-background/80 p-3 text-sm text-foreground shadow-sm">
                  <p className="whitespace-pre-wrap">{winner.response}</p>
                </div>
                {simMatches.length > 1 && (
                  <p className="ml-8 text-xs text-muted-foreground">
                    {translate("{p0} rule khác cũng khớp — bot chỉ trả lời rule đầu tiên.", {
                      p0: simMatches.length - 1,
                    })}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {translate("Không rule nào khớp — bot im lặng.")}
              </p>
            )}
          </div>
          <p className="mt-2.5 text-xs text-muted-foreground">
            {translate(
              "Giãn cách (cooldown) áp dụng trên Discord thật nên không tính trong bản thử này.",
            )}
          </p>
        </CardContent>
      </Card>

      {data.autoReplies.length === 0 ? (
        <Card className="border-dashed border-border/80 bg-card/40 backdrop-blur-sm">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-8 ring-primary/5 transition-transform duration-200 hover:scale-105">
              <AtSign className="h-6 w-6" />
            </span>
            <p className="max-w-sm text-sm text-muted-foreground">
              {translate(
                "Chưa có rule nào. Tạo rule đầu tiên để bot tự trả lời khi ai đó gõ từ khóa hoặc tag bot.",
              )}{" "}
            </p>
            <Button
              onClick={openCreate}
              className="mt-2 gap-2 shadow-sm transition-all duration-200 hover:shadow"
            >
              <Plus className="h-4 w-4" /> {translate("Thêm rule")}{" "}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {data.autoReplies.map((rule) => (
            <Card
              key={rule._id}
              className={`group flex flex-col justify-between overflow-hidden border border-border/70 bg-card/70 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md ${
                rule.enabled ? "" : "opacity-65"
              }`}
            >
              <CardContent className="flex flex-1 flex-col justify-between p-4 sm:p-5">
                <div className="space-y-3">
                  {/* Card Header: Title + Trigger Badge + Controls */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate font-display font-semibold text-foreground">
                          {rule.name}
                        </p>
                        <Badge
                          variant={rule.triggerType === "mention" ? "default" : "secondary"}
                          className="gap-1 text-[11px] font-normal"
                        >
                          {rule.triggerType === "mention" ? (
                            <>
                              <AtSign className="h-3 w-3" /> @mention
                            </>
                          ) : (
                            <>
                              <KeyRound className="h-3 w-3" /> {translate("từ khóa")}{" "}
                            </>
                          )}
                        </Badge>
                        <Badge
                          variant={rule.enabled ? "success" : "secondary"}
                          className="px-1.5 py-0 text-[10px]"
                        >
                          {translate(rule.enabled ? "Đang bật" : "Đã tắt")}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={(v) => toggleRule(rule, v)}
                        className="transition-transform duration-150"
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEdit(rule)}
                        className="h-8 w-8 text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="h-8 w-8 text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-danger"
                        onClick={() => handleDelete(rule)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Keywords list */}
                  {rule.triggerType === "keyword" && (
                    <div className="flex flex-wrap gap-1.5">
                      {rule.keywords.map((k) => (
                        <span
                          key={k}
                          className="rounded-md border border-border/50 bg-secondary/60 px-2 py-0.5 font-mono text-xs text-primary transition-colors duration-150 hover:bg-secondary"
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Response bubble */}
                  <div className="rounded-lg border border-border/70 bg-secondary/30 p-3 text-sm text-foreground/90 transition-colors duration-150 group-hover:border-border">
                    <p className="line-clamp-4 whitespace-pre-wrap text-xs sm:text-sm">
                      {rule.response}
                    </p>
                  </div>
                </div>

                {/* Card Footer: Metadata */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 font-mono text-[11px]">
                    <Timer className="h-3 w-3" /> {rule.cooldownSeconds}s
                  </span>
                  <span className="truncate text-[11px]">
                    {rule.channels.length === 0
                      ? translate("Áp dụng mọi kênh")
                      : translate("{p0} kênh được chọn", { p0: rule.channels.length })}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? translate('Chỉnh sửa "{p0}"', { p0: editing.name })
                : translate("Thêm rule auto reply")}
            </DialogTitle>
            <DialogDescription>
              {translate(
                "Bot trả lời thành viên mỗi khi điều kiện kích hoạt bên dưới được thỏa.",
              )}{" "}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="rule-name">{translate("Tên rule")}</Label>
              <Input
                id="rule-name"
                placeholder="vi-du: chao-hoi"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label>{translate("Loại kích hoạt")}</Label>
              <Select
                value={form.triggerType}
                onValueChange={(v) => setForm({ ...form, triggerType: v as "keyword" | "mention" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={translate("Chọn loại")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keyword">{translate("Từ khóa trong tin nhắn")}</SelectItem>
                  <SelectItem value="mention">Tag bot (@protogon)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {translate(
                  form.triggerType === "mention"
                    ? "Kích hoạt khi thành viên tag bot trong tin nhắn."
                    : "Kích hoạt khi tin nhắn chứa một trong các từ khóa bên dưới.",
                )}
              </p>
            </div>

            {form.triggerType === "keyword" && (
              <div className="grid gap-2">
                <Label htmlFor="rule-keywords">
                  {translate("Từ khóa (phân cách bằng dấu phẩy)")}
                </Label>
                <Input
                  id="rule-keywords"
                  placeholder={translate("hello, xin chào, chào")}
                  value={form.keywords}
                  onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                />
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="rule-response">{translate("Nội dung trả lời")}</Label>
              <Textarea
                id="rule-response"
                placeholder={translate("Chào {user}! Cần tớ giúp gì không?")}
                value={form.response}
                onChange={(e) => setForm({ ...form, response: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Placeholder: <code className="font-mono">{"{user}"}</code>{" "}
                {translate("tag người nhắn,")} <code className="font-mono">{"{username}"}</code>{" "}
                {translate("lấy tên thành viên.")}{" "}
              </p>
            </div>

            <div className="grid gap-2">
              <Label>{translate("Chỉ áp dụng cho kênh (bỏ trống = mọi kênh)")}</Label>
              <MultiSelect
                options={channelOptions}
                value={form.channels}
                onChange={(v) => setForm({ ...form, channels: v })}
                placeholder={translate("Tất cả kênh")}
                emptyLabel={translate("Chưa có kênh nào được đồng bộ")}
                searchPlaceholder={translate("Gõ tên kênh để tìm nhanh…")}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="rule-cooldown">
                {translate("Giãn cách giữa các lần trả lời (giây, 0 = không giới hạn)")}
              </Label>
              <Input
                id="rule-cooldown"
                type="number"
                min={0}
                max={86400}
                value={form.cooldownSeconds}
                onChange={(e) => setForm({ ...form, cooldownSeconds: Number(e.target.value) })}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              className="transition-colors duration-150"
            >
              {translate("Hủy")}{" "}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="gap-2 transition-all duration-150"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {translate(saving ? "Đang lưu…" : editing ? "Lưu thay đổi" : "Tạo rule")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
