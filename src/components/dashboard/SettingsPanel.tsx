import { useEffect, useRef, useState } from "react";
import { useUnsavedChanges } from "../../lib/useUnsavedChanges";
import { useMutation, useQuery, useConvex } from "convex/react";
import { toast } from "sonner";
import {
  BarChart3,
  BellRing,
  Command,
  Download,
  FileJson,
  Hash,
  KeyRound,
  Palette,
  Save,
  Shield,
  ShieldHalf,
  Siren,
  Trash2,
  Upload,
  Users,
  Webhook,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { MultiSelect } from "../ui/multi-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { DEFAULT_THEME, SERVER_THEMES } from "../../lib/constants";
import type { GuildData } from "../../lib/types";
import { getSessionToken } from "../../lib/discord";

import { translate } from "../../lib/i18n";
const TOKEN = () => getSessionToken();
const DEFAULT_WEBHOOK_EVENT_TYPES = ["antinuke", "mod", "join", "leave", "general"];

export default function SettingsPanel({ data }: { data: GuildData }) {
  const updateSettings = useMutation(api.guilds.updateSettings);
  const setHiddenPassword = useMutation(api.hidden.setHiddenPassword);
  // `useQuery` sẽ gọi export ngay khi mở panel — không muốn. `useConvex` là
  // cách gọi 1 lần theo yêu cầu (bấm nút mới chạy), đúng nghĩa "tải file".
  const convex = useConvex();
  const importGuildConfig = useMutation(api.guilds.importGuildConfig);
  const configFileRef = useRef<HTMLInputElement>(null);
  const [configBusy, setConfigBusy] = useState(false);
  const [hiddenPassword, setHiddenPasswordInput] = useState("");
  const [hiddenSaving, setHiddenSaving] = useState(false);

  const [prefix, setPrefix] = useState(data.guild.prefix);
  const [logChannelId, setLogChannelId] = useState(data.guild.logChannelId ?? "none");
  // Ngôn ngữ NHÃN trong log (nhãn hành động, tên trường) — chọn cho cả kênh
  // log của server, tách khỏi ngôn ngữ giao diện của từng người dùng.
  const [logLang, setLogLang] = useState(data.guild.logLang ?? "vi");
  const [modLogChannelId, setModLogChannelId] = useState(data.guild.modLogChannelId ?? "none");
  const [modRoles, setModRoles] = useState<string[]>(data.guild.modRoles);
  const [adminRoles, setAdminRoles] = useState<string[]>(data.guild.adminRoles);
  const [theme, setTheme] = useState(data.guild.theme || DEFAULT_THEME);
  const [themeSaving, setThemeSaving] = useState(false);
  const [saving, setSaving] = useState(false);

  // Webhook config
  const webhookData = useQuery(api.webhooks.getGuildWebhooks, {
    token: TOKEN(),
    guildId: data.guild.discordId,
  });
  const updateDefaultWebhook = useMutation(api.webhooks.updateDefaultWebhook);
  const [webhookEventTypes, setWebhookEventTypes] = useState<string[]>(DEFAULT_WEBHOOK_EVENT_TYPES);
  const [webhookColor, setWebhookColor] = useState<string>("");
  const [webhookTemplate, setWebhookTemplate] = useState<string>("");
  const [webhookSaving, setWebhookSaving] = useState(false);
  const webhookHydrated = useRef(false);

  useEffect(() => {
    const current = webhookData?.[0];
    if (!current || webhookHydrated.current) return;
    webhookHydrated.current = true;
    setWebhookEventTypes(current.eventTypes ?? DEFAULT_WEBHOOK_EVENT_TYPES);
    setWebhookColor(
      typeof current.color === "number" ? `#${current.color.toString(16).padStart(6, "0")}` : "",
    );
    setWebhookTemplate(current.contentTemplate ?? "");
  }, [webhookData]);

  const textChannels = data.channels.filter((c) => c.type === 0 || c.type === 5);
  const roleOptions = data.roles
    .filter((r) => r.name !== "@everyone")
    .map((r) => ({ value: r.roleId, label: r.name }));

  async function toggleDailyReport(v: boolean) {
    try {
      await updateSettings({
        token: TOKEN(),
        guildId: data.guild.discordId,
        dailyReportEnabled: v,
      });
      toast.success(
        v ? translate("Đã bật báo cáo hàng ngày") : translate("Đã tắt báo cáo hàng ngày"),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Lưu thất bại"));
    }
  }

  async function toggleEmergencyAlert(v: boolean) {
    try {
      await updateSettings({
        token: TOKEN(),
        guildId: data.guild.discordId,
        emergencyAlertEnabled: v,
      });
      toast.success(v ? translate("Đã bật cảnh báo khẩn") : translate("Đã tắt cảnh báo khẩn"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Lưu thất bại"));
    }
  }

  async function togglePingEveryone(v: boolean) {
    try {
      await updateSettings({
        token: TOKEN(),
        guildId: data.guild.discordId,
        logPingEveryone: v,
      });
      toast.success(v ? translate("Đã bật ping @everyone") : translate("Đã tắt ping @everyone"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Lưu thất bại"));
    }
  }

  /**
   * Form này có nút "Lưu" nên thay đổi chưa lưu là thay đổi SẼ MẤT. Đánh dấu
   * bẩn để `GuildPage` hỏi trước khi người dùng bấm sang panel khác, và
   * `beforeunload` chặn đóng tab (xem lib/useUnsavedChanges.ts).
   */
  const dirty =
    prefix !== data.guild.prefix ||
    logChannelId !== (data.guild.logChannelId ?? "none") ||
    logLang !== (data.guild.logLang ?? "vi") ||
    modLogChannelId !== (data.guild.modLogChannelId ?? "none") ||
    JSON.stringify(modRoles) !== JSON.stringify(data.guild.modRoles) ||
    JSON.stringify(adminRoles) !== JSON.stringify(data.guild.adminRoles);
  useUnsavedChanges("settings", dirty);

  async function handleSave() {
    if (!/^[!^$#&%]{1,3}$/.test(prefix)) {
      return toast.error(translate("Prefix gồm 1–3 ký tự đặc biệt, ví dụ: !, ^, !!"));
    }
    setSaving(true);
    try {
      await updateSettings({
        token: TOKEN(),
        guildId: data.guild.discordId,
        prefix,
        // "" (chuỗi rỗng) để XÓA kênh đã đặt; undefined = không đổi.
        logChannelId: logChannelId === "none" ? "" : logChannelId,
        logLang,
        modLogChannelId: modLogChannelId === "none" ? "" : modLogChannelId,
        modRoles,
        adminRoles,
      });
      toast.success(translate("Đã lưu cài đặt, bot áp dụng trong khoảng 3 phút"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Lưu thất bại"));
    } finally {
      setSaving(false);
    }
  }

  const handleExportConfig = async () => {
    setConfigBusy(true);
    try {
      const payload = await convex.query(api.guilds.exportGuildConfig, {
        token: TOKEN(),
        guildId: data.guild.discordId,
      });
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Tên server Discord có thể chứa emoji và dấu cách → chỉ giữ chữ/số/dấu
      // gạch nối, \p{L} giữ được cả tiếng Việt có dấu.
      const safeName = payload.guild.name.replace(/[^\p{L}\p{N}-]+/gu, "-");
      a.download = `protogon-${safeName}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(translate("Đã tải cấu hình về máy"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Nạp thất bại"));
    } finally {
      setConfigBusy(false);
    }
  };

  const handleImportConfig = async (file: File) => {
    setConfigBusy(true);
    try {
      const parsed = JSON.parse(await file.text());
      // Chấp nhận cả file đầy đủ (có vỏ {version, guild, config}) lẫn object
      // cấu hình trần — người dùng hay tự bỏ vỏ đi trước khi nạp lại.
      const config =
        parsed && typeof parsed === "object" && !Array.isArray(parsed) && "config" in parsed
          ? (parsed as { config: Record<string, unknown> }).config
          : parsed;
      const r = await importGuildConfig({
        token: TOKEN(),
        guildId: data.guild.discordId,
        config: config as Record<string, unknown>,
      });
      if (r.applied.length === 0) {
        toast.error(translate("File không chứa cấu hình nào hợp lệ"));
      } else {
        toast.success(translate("Đã nạp {p0} mục cấu hình", { p0: r.applied.length }));
      }
      // Báo rõ từng nhóm bị bỏ, thay vì im lặng — người dùng cần biết vì sao
      // file của họ không được áp hết.
      if (r.ignored.length > 0)
        toast.info(translate("Đã bỏ {p0} mục không phải cấu hình", { p0: r.ignored.length }));
      if (r.invalid.length > 0)
        toast.warning(translate("Bỏ {p0} mục vì giá trị không hợp lệ", { p0: r.invalid.length }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("File không phải JSON hợp lệ"));
    } finally {
      setConfigBusy(false);
      if (configFileRef.current) configFileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold">{translate("Cài đặt server")}</h2>
        <p className="text-sm text-muted-foreground">
          {translate("Prefix · kênh log · phân quyền · bảo mật · giao diện")}{" "}
        </p>
      </div>

      <Tabs defaultValue="basic">
        <TabsList className="w-full justify-start overflow-x-auto lg:w-auto">
          <TabsTrigger value="basic">
            <Command className="h-4 w-4" /> {translate("Cơ bản")}{" "}
          </TabsTrigger>
          <TabsTrigger value="roles">
            <Users className="h-4 w-4" /> {translate("Phân quyền")}{" "}
          </TabsTrigger>
          <TabsTrigger value="security">
            <KeyRound className="h-4 w-4" /> {translate("Bảo mật")}{" "}
          </TabsTrigger>
          <TabsTrigger value="appearance">
            <Palette className="h-4 w-4" /> {translate("Giao diện")}{" "}
          </TabsTrigger>
          <TabsTrigger value="config">
            <FileJson className="h-4 w-4" /> {translate("Cấu hình server")}{" "}
          </TabsTrigger>
        </TabsList>

        {/* ── Cơ bản: prefix + kênh log + báo cáo ─────────────────────── */}
        <TabsContent value="basic">
          <Card>
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>{translate("Prefix lệnh")}</Label>
                  <Input
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                    maxLength={3}
                    placeholder="!"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {translate("1–3 ký tự đặc biệt, dùng cho lệnh text như")}{" "}
                    <code className="font-mono text-primary">{prefix}help</code>
                    {translate(". Slash command hoạt động độc lập.")}{" "}
                  </p>
                </div>

                <div className="grid gap-1.5">
                  <Label>{translate("Ngôn ngữ cho log")}</Label>
                  <Select value={logLang} onValueChange={setLogLang}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vi">{translate("Tiếng Việt")}</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="de">Deutsch</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {translate(
                      "Chỉ đổi nhãn bot tự sinh trong log (kiểu ban, kick, cảnh cáo). Lý do do mod gõ giữ nguyên.",
                    )}
                  </p>
                </div>

                <div className="grid gap-1.5">
                  <Label>{translate("Kênh log chung")}</Label>
                  <Select value={logChannelId} onValueChange={setLogChannelId}>
                    <SelectTrigger>
                      <SelectValue placeholder={translate("Chọn kênh")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{translate("— Không dùng —")}</SelectItem>
                      {textChannels.map((c) => (
                        <SelectItem key={c.channelId} value={c.channelId}>
                          #{c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    {translate(
                      "Chống nuke/raid, Join Gate, verify, báo cáo hàng ngày và mọi thông báo hệ thống. Để trống = tắt toàn bộ log.",
                    )}{" "}
                  </p>
                </div>
              </div>

              {/* Kênh log hành động mod: TUỲ CHỌN. Đây là nơi DUY NHẤT chọn kênh
                  log (bảng Moderation chỉ hiển thị lại), nên không còn cảnh hai
                  nơi ghi đè nhau rồi một case bị gửi hai lần. */}
              <div className="grid gap-1.5 rounded-xl border border-border bg-secondary/20 p-3">
                <Label>
                  <Hash className="mr-1 inline h-3.5 w-3.5" />
                  {translate("Kênh log hành động mod (tùy chọn)")}{" "}
                </Label>
                <Select value={modLogChannelId} onValueChange={setModLogChannelId}>
                  <SelectTrigger>
                    <SelectValue placeholder={translate("Chọn kênh")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{translate("— Dùng kênh log chung —")}</SelectItem>
                    {textChannels.map((c) => (
                      <SelectItem key={c.channelId} value={c.channelId}>
                        #{c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {translate("Case ban · kick · timeout · warn và auto-mod (embed hình phạt với")}{" "}
                  <b>Offender</b> / <b>Reason</b> / <b>Responsible moderator</b>
                  {translate(
                    '; lý do trống → ghi "không có lý do"). Để trống = dùng kênh log chung; chọn trùng kênh log chung thì bot vẫn chỉ gửi một tin cho mỗi case — không nhân đôi log.',
                  )}{" "}
                </p>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-secondary/30 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">
                    <BarChart3 className="mr-1.5 inline h-4 w-4 text-primary" />
                    {translate("Báo cáo chống nuke hàng ngày")}{" "}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {translate(
                      "Tóm tắt sự kiện chống nuke gửi vào kênh log vào khoảng 00:00 UTC mỗi ngày",
                    )}{" "}
                  </p>
                </div>
                <Switch
                  checked={data.guild.dailyReportEnabled}
                  onCheckedChange={toggleDailyReport}
                />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-secondary/30 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">
                    <Siren className="mr-1.5 inline h-4 w-4 text-danger" />
                    {translate("Cảnh báo khẩn khi raid/nuke")}{" "}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {translate(
                      "Khi bot xác nhận raid/nuke: gửi DM khẩn cho chủ server (kẻ nuke không xóa được), AI quét chat và báo cáo vào kênh log, kèm lệnh",
                    )}{" "}
                    <code className="font-mono">/report</code>
                    {translate(", kể cả người có quyền phá server.")}{" "}
                  </p>
                </div>
                <Switch
                  checked={data.guild.emergencyAlertEnabled}
                  onCheckedChange={toggleEmergencyAlert}
                />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-secondary/30 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">
                    <BellRing className="mr-1.5 inline h-4 w-4" />
                    {translate("Ping @everyone khi cảnh báo khẩn")}{" "}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {translate(
                      "Tắt nếu không muốn cảnh báo làm phiền cả server — mod vẫn thấy log",
                    )}{" "}
                  </p>
                </div>
                <Switch checked={data.guild.logPingEveryone} onCheckedChange={togglePingEveryone} />
              </div>

              {/* ── Webhook Log Config ─────────────────────────────── */}
              {webhookData && webhookData.length > 0 && (
                <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Webhook className="h-4 w-4 text-primary" />
                    <p className="text-sm font-medium">{translate("Tùy chỉnh Webhook Log")}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {translate("Webhook")} "{webhookData[0]?.name}"{" "}
                    {translate(
                      "tự gửi log khi có sự kiện; tùy chỉnh loại sự kiện, màu embed và nội dung kèm.",
                    )}
                  </p>
                  <div className="grid gap-1.5">
                    <Label>{translate("Loại sự kiện nhận log")}</Label>
                    <div className="flex flex-wrap gap-2">
                      {["antinuke", "mod", "join", "leave", "general", "all"].map((et) => (
                        <button
                          key={et}
                          type="button"
                          onClick={() => {
                            setWebhookEventTypes((prev) =>
                              prev.includes(et) ? prev.filter((e) => e !== et) : [...prev, et],
                            );
                          }}
                          className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                            webhookEventTypes.includes(et)
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background text-muted-foreground border-border hover:border-primary/50"
                          }`}
                        >
                          {translate(
                            et === "antinuke"
                              ? "🛡️ Chống nuke"
                              : et === "mod"
                                ? "⚙️ Moderation"
                                : et === "join"
                                  ? "📥 Vào server"
                                  : et === "leave"
                                    ? "📤 Rời server"
                                    : et === "general"
                                      ? "📋 Chung"
                                      : "🌐 Tất cả",
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label>{translate("Màu embed (hex, để trống = mặc định)")}</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="webhook-color"
                          aria-label={translate("Màu embed (hex, để trống = mặc định)")}
                          type="color"
                          value={webhookColor || "#111111"}
                          onChange={(e) => setWebhookColor(e.target.value)}
                          className="h-9 w-16 cursor-pointer"
                        />
                        <button
                          type="button"
                          onClick={() => setWebhookColor("")}
                          className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {translate("Mặc định")}
                        </button>
                      </div>
                    </div>
                    <div className="grid gap-1.5">
                      <Label>{translate("Nội dung kèm (template)")}</Label>
                      <Input
                        value={webhookTemplate}
                        onChange={(e) => setWebhookTemplate(e.target.value)}
                        placeholder="{server} · {action} · {time}"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Placeholder: {"{server}"} {"{time}"} {"{action}"} {"{reason}"} {"{user}"}{" "}
                        {"{mod}"}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        setWebhookSaving(true);
                        try {
                          const parsedColor = webhookColor
                            ? parseInt(webhookColor.replace("#", ""), 16)
                            : null;
                          await updateDefaultWebhook({
                            token: TOKEN(),
                            guildId: data.guild.discordId,
                            eventTypes: webhookEventTypes,
                            color: parsedColor,
                            contentTemplate: webhookTemplate || null,
                          });
                          toast.success(translate("Đã lưu webhook log"));
                        } catch (e) {
                          toast.error(
                            e instanceof Error ? e.message : translate("Lỗi lưu webhook"),
                          );
                        } finally {
                          setWebhookSaving(false);
                        }
                      }}
                      disabled={webhookSaving}
                    >
                      {translate(webhookSaving ? "Đang lưu…" : "Lưu webhook")}
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4" /> {translate(saving ? "Đang lưu…" : "Lưu cài đặt")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Phân quyền: role mod + admin ─────────────────────────────── */}
        <TabsContent value="roles">
          <Card>
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label className="flex items-center gap-1.5">
                    <ShieldHalf className="h-4 w-4 text-primary" /> Role Mod
                  </Label>
                  <MultiSelect
                    options={roleOptions}
                    value={modRoles}
                    onChange={setModRoles}
                    placeholder={translate("Chọn role mod…")}
                    emptyLabel={translate("Chưa có role được đồng bộ")}
                    searchPlaceholder={translate("Gõ tên role để tìm nhanh…")}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {translate(
                      "Được miễn trừ chống nuke và có quyền quản lý rule auto reply trong Discord.",
                    )}{" "}
                  </p>
                </div>
                <div className="grid gap-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Shield className="h-4 w-4 text-primary" /> Role Admin
                  </Label>
                  <MultiSelect
                    options={roleOptions}
                    value={adminRoles}
                    onChange={setAdminRoles}
                    placeholder={translate("Chọn role admin…")}
                    emptyLabel={translate("Chưa có role được đồng bộ")}
                    searchPlaceholder={translate("Gõ tên role để tìm nhanh…")}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {translate("Miễn trừ hoàn toàn khỏi mọi module chống nuke.")}{" "}
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4" /> {translate(saving ? "Đang lưu…" : "Lưu phân quyền")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Bảo mật: mật khẩu tính năng ẩn ───────────────────────────── */}
        <TabsContent value="security">
          <Card>
            <CardContent className="space-y-3 p-4 sm:p-5">
              <div>
                <p className="flex items-center gap-1.5 font-medium">
                  <KeyRound className="h-4 w-4 text-primary" />{" "}
                  {translate("Mật khẩu tính năng ẩn 🔒")}{" "}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {translate(
                    "Khóa khu vực riêng tư dành cho chủ sở hữu bot. Mật khẩu thuộc về chủ bot và áp dụng cho",
                  )}{" "}
                  <b>{translate("mọi server")}</b>{" "}
                  {translate("bạn quản lý trên dashboard — không riêng server này. Chỉ")}{" "}
                  <b>{translate("admin sở hữu bot")}</b> {translate("được đặt, đổi hoặc xóa.")}{" "}
                </p>
              </div>

              {!data.guild.isBotOwner && (
                <p className="rounded-lg bg-secondary px-3 py-2.5 text-xs text-muted-foreground">
                  {translate(
                    "🔒 Bạn không phải admin sở hữu bot — chỉ chủ sở hữu bot mới được đặt, đổi hoặc xóa mật khẩu này.",
                  )}{" "}
                </p>
              )}

              <div
                className={data.guild.isBotOwner ? "space-y-3" : "pointer-events-none opacity-50"}
              >
                <div className="grid gap-1.5">
                  <Label>{translate("Mật khẩu mới")}</Label>
                  <Input
                    type="password"
                    value={hiddenPassword}
                    onChange={(e) => setHiddenPasswordInput(e.target.value)}
                    placeholder={
                      data.guild.hiddenPasswordSet
                        ? translate("Nhập mật khẩu mới để thay đổi…")
                        : translate("Nhập mật khẩu (4–64 ký tự)…")
                    }
                    maxLength={64}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    disabled={hiddenSaving || hiddenPassword.length < 4}
                    onClick={async () => {
                      setHiddenSaving(true);
                      try {
                        await setHiddenPassword({
                          token: TOKEN(),
                          guildId: data.guild.discordId,
                          password: hiddenPassword,
                        });
                        toast.success(translate("Đã đặt mật khẩu tính năng ẩn"));
                        setHiddenPasswordInput("");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : translate("Lưu thất bại"));
                      } finally {
                        setHiddenSaving(false);
                      }
                    }}
                  >
                    <KeyRound className="h-4 w-4" />
                    {translate(data.guild.hiddenPasswordSet ? "Đổi mật khẩu" : "Đặt mật khẩu")}
                  </Button>
                  {data.guild.hiddenPasswordSet && (
                    <Button
                      variant="outline"
                      disabled={hiddenSaving}
                      onClick={async () => {
                        setHiddenSaving(true);
                        try {
                          await setHiddenPassword({
                            token: TOKEN(),
                            guildId: data.guild.discordId,
                            password: "",
                          });
                          toast.success(translate("Đã xóa mật khẩu tính năng ẩn"));
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : translate("Xóa thất bại"));
                        } finally {
                          setHiddenSaving(false);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" /> {translate("Xóa mật khẩu")}{" "}
                    </Button>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {translate("Trạng thái:")}{" "}
                    {data.guild.hiddenPasswordSet ? (
                      <span className="font-medium text-foreground">
                        {translate("Đã đặt mật khẩu")}
                      </span>
                    ) : (
                      <span className="font-medium text-muted-foreground">
                        {translate("Chưa đặt mật khẩu")}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Giao diện: chủ đề màu server ─────────────────────────────── */}
        <TabsContent value="appearance">
          <Card>
            <CardContent className="p-4 sm:p-5">
              <p className="text-sm font-medium">{translate("Độ tương phản của server")}</p>
              <p className="mb-3 text-[11px] text-muted-foreground">
                {translate(
                  "Chọn sắc độ xám áp dụng cho toàn bộ trang quản lý của server (nút, thẻ, sidebar).",
                )}{" "}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries(SERVER_THEMES).map(([key, t]) => (
                  <button
                    key={key}
                    onClick={() => setTheme(key)}
                    className={`flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-colors ${
                      theme === key
                        ? "border-foreground ring-1 ring-foreground"
                        : "border-border hover:border-foreground/40"
                    }`}
                  >
                    <span
                      className="h-8 w-full rounded-lg border border-border"
                      style={{ background: t.swatch }}
                    />
                    <span className="text-xs font-medium">{translate(t.label)}</span>
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  {translate("Đang chọn:")}{" "}
                  <span className="font-medium text-foreground">
                    {translate(SERVER_THEMES[theme]?.label ?? "—")}
                  </span>{" "}
                  — {translate(SERVER_THEMES[theme]?.desc ?? "—")}
                </p>
                <Button
                  size="sm"
                  disabled={themeSaving || theme === (data.guild.theme || DEFAULT_THEME)}
                  onClick={async () => {
                    setThemeSaving(true);
                    try {
                      await updateSettings({
                        token: TOKEN(),
                        guildId: data.guild.discordId,
                        theme,
                      });
                      toast.success(translate("Đã áp dụng sắc độ mới"));
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : translate("Lưu thất bại"));
                    } finally {
                      setThemeSaving(false);
                    }
                  }}
                >
                  <Palette className="h-4 w-4" /> {translate(themeSaving ? "Đang lưu…" : "Áp dụng")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Cấu hình server: xuất / nhập để KHÔNG MẤT khi đổi host ───── */}
        <TabsContent value="config">
          <Card>
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div>
                <p className="text-sm font-medium">{translate("Xuất & nhập cấu hình")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {translate(
                    "Tải toàn bộ cấu hình bảo vệ của server ra file .json để lưu lại, hoặc nạp file đã lưu.",
                  )}
                </p>
              </div>

              <p className="rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
                {translate(
                  "Chỉ dùng được cho cùng một server: kênh, vai trò và thành viên trong file là ID của server cũ, mang sang server khác sẽ không khớp.",
                )}
              </p>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleExportConfig}
                  disabled={configBusy}
                >
                  <Download className="h-4 w-4" /> {translate("Xuất cấu hình")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => configFileRef.current?.click()}
                  disabled={configBusy}
                >
                  <Upload className="h-4 w-4" /> {translate("Nạp cấu hình")}
                </Button>
                <input
                  ref={configFileRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleImportConfig(file);
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
