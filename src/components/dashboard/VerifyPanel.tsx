import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { toastConvexError } from "../../lib/toastError";
import {
  BadgeCheck,
  Eye,
  Fingerprint,
  Hash,
  Mail,
  Send,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent } from "../ui/card";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import type { GuildData } from "../../lib/types";
import { getSessionToken } from "../../lib/discord";

import { dateLocale, translate } from "../../lib/i18n";
import VerifyWebCard from "./VerifyWebCard";
const TOKEN = () => getSessionToken();

export default function VerifyPanel({ data }: { data: GuildData }) {
  const updateSettings = useMutation(api.guilds.updateSettings);
  const g = data.guild;
  const channels = data.channels.filter((c) => c.type === 0 || c.type === 5);
  const roles = data.roles;

  // Local state for debounced text inputs
  const [localTitle, setLocalTitle] = useState(g.verifyWelcomeTitle ?? "");
  const [localDesc, setLocalDesc] = useState(g.verifyWelcomeDescription ?? "");
  const [localColor, setLocalColor] = useState(g.verifyWelcomeColor ?? "#111111");
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingRef = useRef<Record<string, unknown>>({});
  const descRef = useRef<HTMLTextAreaElement>(null);

  /** Chèn placeholder vào vị trí cursor của textarea */
  function insertPlaceholder(
    ref: RefObject<HTMLTextAreaElement | null>,
    setter: React.Dispatch<React.SetStateAction<string>>,
    current: string,
    debounce: (p: Record<string, unknown>) => void,
    basePatch: Record<string, unknown>,
    placeholder: string,
  ) {
    const el = ref.current;
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + placeholder + current.slice(end);
    setter(next);
    debounce({ ...basePatch, verifyWelcomeDescription: next || null });
    // Focus + đặt cursor sau placeholder
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.selectionStart = el.selectionEnd = start + placeholder.length;
      }
    });
  }

  const sendPatch = useCallback(
    async (patch: Record<string, unknown>) => {
      try {
        await updateSettings({ token: TOKEN(), guildId: g.discordId, ...patch });
      } catch (e: unknown) {
        toastConvexError(e, translate("Lưu thất bại"));
      }
    },
    [g.discordId, updateSettings],
  );

  const flushField = useCallback(
    (field: string, value: unknown) => {
      pendingRef.current[field] = value;
      const previous = timersRef.current[field];
      if (previous) clearTimeout(previous);
      timersRef.current[field] = setTimeout(() => {
        const patch = {
          [pendingRef.current[field] === null ? field : field]: pendingRef.current[field],
        };
        delete pendingRef.current[field];
        delete timersRef.current[field];
        void sendPatch(patch);
      }, 600);
    },
    [sendPatch],
  );

  const flushAll = useCallback(() => {
    const patch = { ...pendingRef.current };
    for (const timer of Object.values(timersRef.current)) clearTimeout(timer);
    timersRef.current = {};
    pendingRef.current = {};
    if (Object.keys(patch).length > 0) void sendPatch(patch);
  }, [sendPatch]);

  // Không để timer của panel cũ ghi đè cấu hình guild mới sau khi điều hướng.
  useEffect(() => flushAll, [flushAll]);

  async function patch(p: Record<string, unknown>, msg?: string) {
    try {
      await updateSettings({ token: TOKEN(), guildId: g.discordId, ...p });
      if (msg) toast.success(msg);
    } catch (e: unknown) {
      toastConvexError(e, translate("Lưu thất bại"));
    }
  }

  // Welcome embed preview
  const previewTitle = localTitle || translate("🌸 Chào mừng bạn!");
  const previewDesc = (
    localDesc || translate("Bạn đã xác minh thành công. Chào mừng bạn đến với server!")
  )
    .replace(/\{user\}/g, translate("@thành viên"))
    .replace(/\{server\}/g, g.name || "Server");
  const previewColor = localColor || "#111111";

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <BadgeCheck className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold">
            {translate("Xác minh thành viên (Verify)")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {translate(
              "Thành viên mới nhận role Unverified và phải xác minh trước khi vào server.",
            )}{" "}
          </p>
        </div>
      </div>

      {/* Enable / Disable */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-secondary/50 px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">{translate("Bật xác minh thành viên")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {translate(
                "Khi bật, thành viên mới nhận role chưa xác minh và phải verify mới vào được server.",
              )}{" "}
            </p>
          </div>
        </div>
        <Switch
          checked={g.verifyEnabled}
          onCheckedChange={(v) =>
            patch(
              { verifyEnabled: v },
              translate(v ? "Đã bật xác minh thành viên" : "Đã tắt xác minh thành viên"),
            )
          }
        />
      </div>

      {/* Verify Method Selector */}
      {g.verifyEnabled && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-secondary/50 px-4 py-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
              <Fingerprint className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">{translate("Phương thức xác minh")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <b>Button</b> {translate("— thành viên bấm nút là xác minh xong ngay.")}{" "}
                <b>Captcha</b>{" "}
                {translate("— bot gửi mã qua DM, thành viên nhập lại mã trong kênh.")} <b>Web</b>{" "}
                {translate(
                  "— bot mở link riêng trong kênh (hoặc gửi DM); trang web kiểm tra thiết bị/kết nối, chặn VPN và tài khoản phụ.",
                )}
              </p>
            </div>
          </div>
          <select
            value={g.verifyMethod}
            onChange={(e) => {
              const method = e.target.value as "button" | "captcha" | "web";
              // Chọn "web" phải bật luôn cờ tính năng — thiếu cờ thì bot không
              // gửi link và thành viên kẹt ở role Unverified.
              patch(
                method === "web"
                  ? { verifyMethod: method, verifyWebEnabled: true }
                  : { verifyMethod: method, verifyWebEnabled: false },
                translate("Đã đổi phương thức xác minh"),
              );
            }}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="button">{translate("🖱️ Button — bấm nút xác minh")}</option>
            <option value="captcha">{translate("🔑 Captcha — nhập mã từ DM")}</option>
            <option value="web">
              {translate("🛡️ Web — kiểm tra IP/thiết bị (Double Counter)")}
            </option>
          </select>
        </div>
      )}

      {/* Nghĩa vụ của chủ server: thông báo + căn cứ pháp lý trước khi thu IP.
          Đặt ngay dưới bộ chọn phương thức để người bật tính năng đọc trước. */}
      {g.verifyEnabled && g.verifyMethod === "web" && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          <p className="font-semibold text-foreground">{translate("Trước khi bật xác minh web")}</p>
          <p className="mt-1">
            {translate(
              "Trang xác minh thu IP và tín hiệu thiết bị, gửi IP một lần tới ipapi.is và có thể ra quyết định tự động. Hãy thông báo cho thành viên và chỉ bật khi bạn có căn cứ pháp lý.",
            )}{" "}
            <a
              href="/privacy#muc-13"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-foreground"
            >
              {translate("Chính sách quyền riêng tư")}
            </a>
          </p>
        </div>
      )}

      {g.verifyEnabled && g.verifyMethod === "web" && <VerifyWebCard data={data} />}

      {g.verifyEnabled && (
        <Card>
          <CardContent className="space-y-5 p-4 sm:p-5">
            {/* Welcome DM toggle */}
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background/50 px-4 py-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
                  <Mail className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">
                    {translate("Gửi DM chào mừng sau khi verify")}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {translate(
                      "Bot gửi embed chào mừng qua DM ngay khi thành viên xác minh thành công.",
                    )}{" "}
                  </p>
                </div>
              </div>
              <Switch
                checked={g.verifyWelcomeEnabled}
                onCheckedChange={(v) =>
                  patch(
                    { verifyWelcomeEnabled: v },
                    translate(v ? "Đã bật DM chào mừng" : "Đã tắt DM chào mừng"),
                  )
                }
              />
            </div>

            {g.verifyWelcomeEnabled && (
              <div className="space-y-4 rounded-xl border border-border bg-background/50 p-4">
                {/* Welcome title */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">{translate("Tiêu đề embed")}</Label>
                  <input
                    type="text"
                    value={localTitle}
                    onChange={(e) => {
                      setLocalTitle(e.target.value);
                      flushField("verifyWelcomeTitle", e.target.value || null);
                    }}
                    onBlur={flushAll}
                    placeholder={translate("🌸 Chào mừng bạn!")}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    maxLength={256}
                  />
                </div>
                {/* Welcome description */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">{translate("Nội dung embed")}</Label>
                  <textarea
                    ref={descRef}
                    value={localDesc}
                    onChange={(e) => {
                      setLocalDesc(e.target.value);
                      flushField("verifyWelcomeDescription", e.target.value || null);
                    }}
                    onBlur={flushAll}
                    placeholder={translate(
                      "Bạn đã xác minh thành công. Chào mừng bạn đến với server!",
                    )}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    rows={3}
                    maxLength={1000}
                  />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">{translate("Chèn:")}</span>
                    {(
                      [
                        // i18n-ok: nhãn placeholder dịch lúc render bằng translate(label)
                        ["{user}", "Tag thành viên"],
                        ["{server}", "Tên server"],
                      ] as const
                    ).map(([ph, label]) => (
                      <button
                        key={ph}
                        type="button"
                        onClick={() =>
                          insertPlaceholder(
                            descRef,
                            setLocalDesc,
                            localDesc,
                            (p) =>
                              flushField("verifyWelcomeDescription", p.verifyWelcomeDescription),
                            { verifyWelcomeDescription: null },
                            ph,
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-mono text-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                        title={translate(label)}
                      >
                        {ph}
                      </button>
                    ))}
                    <span className="text-[10px] text-muted-foreground">
                      {translate("—")} {"{user}"} {translate("để tag,")} {"{server}"}{" "}
                      {translate("để tên server")}
                    </span>
                  </div>
                </div>
                {/* Welcome color */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">{translate("Màu embed")}</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={localColor}
                      onChange={(e) => {
                        setLocalColor(e.target.value);
                        flushField("verifyWelcomeColor", e.target.value);
                      }}
                      className="h-8 w-8 cursor-pointer rounded border border-border bg-transparent"
                    />
                    <input
                      type="text"
                      value={localColor}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLocalColor(v);
                        if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                          flushField("verifyWelcomeColor", v);
                        }
                      }}
                      placeholder="#111111"
                      className="w-28 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-mono"
                      maxLength={7}
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {translate("để trống = màu mặc định")}
                    </span>
                  </div>
                </div>

                {/* Welcome embed preview */}
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs font-medium">
                    <Eye className="h-3 w-3" /> {translate("Xem trước DM chào mừng")}{" "}
                  </Label>
                  <div className="overflow-hidden rounded-xl border border-border">
                    <div
                      className="px-4 py-3"
                      style={{
                        backgroundColor: previewColor + "22",
                        borderLeft: `4px solid ${previewColor}`,
                      }}
                    >
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {translate("Tin nhắn trực tiếp từ Protogon")}{" "}
                      </p>
                    </div>
                    <div className="border-t border-border bg-background/80 p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
                          <span className="text-lg">🤖</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold">Protogon</p>
                            <Badge variant="secondary" className="text-[9px]">
                              APP
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {translate("Hôm nay lúc 00:00")}{" "}
                            </span>
                          </div>
                          <div className="mt-1 rounded-lg bg-muted/50 p-3">
                            <p className="text-sm font-semibold" style={{ color: previewColor }}>
                              {previewTitle}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground whitespace-pre-line">
                              {previewDesc}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Kênh Verify */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm font-medium">
                <Hash className="h-3.5 w-3.5" /> {translate("Kênh xác minh")}{" "}
              </Label>
              <p className="text-xs text-muted-foreground">
                {translate("Kênh hiển thị embed xác minh. Thành viên mới chỉ thấy kênh này.")}{" "}
              </p>
              <select
                value={g.verifyChannelId ?? ""}
                onChange={(e) =>
                  patch(
                    { verifyChannelId: e.target.value || null },
                    translate("Đã cập nhật kênh xác minh"),
                  )
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">{translate("— Chọn kênh —")}</option>
                {channels.map((ch) => (
                  <option key={ch.channelId} value={ch.channelId}>
                    # {ch.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Role Unverified */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm font-medium">
                <ShieldOff className="h-3.5 w-3.5" />{" "}
                {translate("Role chưa xác minh (Unverified)")}{" "}
              </Label>
              <p className="text-xs text-muted-foreground">
                {translate("Role tự gán cho thành viên mới ngay khi vừa vào server.")}{" "}
              </p>
              <select
                value={g.unverifiedRoleId ?? ""}
                onChange={(e) =>
                  patch(
                    { unverifiedRoleId: e.target.value || null },
                    translate("Đã cập nhật role chưa xác minh"),
                  )
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">{translate("— Chọn role —")}</option>
                {roles.map((r) => (
                  <option key={r.roleId} value={r.roleId}>
                    @{r.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Role Verified */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm font-medium">
                <ShieldCheck className="h-3.5 w-3.5" />{" "}
                {translate("Role đã xác minh (Verified)")}{" "}
              </Label>
              <p className="text-xs text-muted-foreground">
                {translate(
                  "Role gán sau khi xác minh thành công; role chưa xác minh được gỡ ra.",
                )}{" "}
              </p>
              <select
                value={g.verifiedRoleId ?? ""}
                onChange={(e) =>
                  patch(
                    { verifiedRoleId: e.target.value || null },
                    translate("Đã cập nhật role đã xác minh"),
                  )
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">{translate("— Chọn role —")}</option>
                {roles.map((r) => (
                  <option key={r.roleId} value={r.roleId}>
                    @{r.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Config summary */}
            <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">{translate("Cách hoạt động:")}</p>
              <p>
                {translate("• Thành viên mới vào server → tự động nhận")}{" "}
                <b>{translate("role chưa xác minh")}</b>.
              </p>
              <p>
                {translate("• Bot gửi embed trong")} <b>{translate("kênh xác minh")}</b>{" "}
                {translate("với nút / phản ứng để xác minh.")}{" "}
              </p>
              <p>
                {translate("• Sau khi xác minh → gỡ role chưa xác minh, gán")}{" "}
                <b>{translate("role đã xác minh")}</b>.
              </p>
              {g.verifyWelcomeEnabled && (
                <p>
                  {translate("• Bot gửi")} <b>{translate("DM chào mừng")}</b>{" "}
                  {translate("với embed tùy chỉnh đến thành viên đã xác minh.")}{" "}
                </p>
              )}
            </div>

            {/* Lỗi gửi panel gần nhất — bot báo lại thay vì im lặng */}
            {g.verifyPanelError && (
              <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
                <p className="font-semibold">{translate("⚠️ Bot không gửi được panel xác minh")}</p>
                <p className="mt-0.5 text-xs opacity-90">{g.verifyPanelError}</p>
                {g.verifyPanelErrorAt ? (
                  <p className="mt-1 text-[11px] opacity-70">
                    {new Date(g.verifyPanelErrorAt).toLocaleString(dateLocale())}{" "}
                    {translate('— hãy sửa lỗi rồi bấm "Gửi panel xác minh vào kênh" lại')}
                  </p>
                ) : null}
              </div>
            )}

            {/* Send panel button */}
            {g.verifyChannelId && (
              <button
                onClick={() =>
                  patch({ verifySendPanel: true }, translate("Đã yêu cầu bot gửi panel xác minh!"))
                }
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Send className="h-4 w-4" />
                {translate("Gửi panel xác minh vào kênh")}{" "}
              </button>
            )}

            {/* Current config badges */}
            <div className="flex flex-wrap gap-2">
              <Badge variant={g.verifyChannelId ? "default" : "secondary"}>
                <Hash className="mr-1 h-3 w-3" />
                {g.verifyChannelId
                  ? `#${data.channels.find((c) => c.channelId === g.verifyChannelId)?.name ?? "?"}`
                  : translate("Chưa chọn kênh")}
              </Badge>
              <Badge variant={g.unverifiedRoleId ? "default" : "secondary"}>
                <ShieldOff className="mr-1 h-3 w-3" />
                {g.unverifiedRoleId
                  ? `@${data.roles.find((r) => r.roleId === g.unverifiedRoleId)?.name ?? "?"}`
                  : translate("Chưa chọn role")}
              </Badge>
              <Badge variant={g.verifiedRoleId ? "default" : "secondary"}>
                <ShieldCheck className="mr-1 h-3 w-3" />
                {g.verifiedRoleId
                  ? `@${data.roles.find((r) => r.roleId === g.verifiedRoleId)?.name ?? "?"}`
                  : translate("Chưa chọn role")}
              </Badge>
              {g.verifyWelcomeEnabled && (
                <Badge variant="success">
                  <Mail className="mr-1 h-3 w-3" />
                  {translate("DM chào mừng bật")}{" "}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Slash / prefix command info */}
      <div className="rounded-xl bg-muted/50 p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">{translate("💡 Lệnh nhanh:")}</p>
        <p>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
            /verify setup
          </code>{" "}
          {translate("hoặc")}{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
            !verify setup
          </code>{" "}
          {translate("— thiết lập xác minh ngay trong Discord.")}
        </p>
      </div>
    </div>
  );
}
