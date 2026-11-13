import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Crosshair, Database, Lock, ShieldAlert, Unlock } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent } from "../ui/card";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { useState } from "react";
import { moduleMeta, DEFAULT_MODULE_ACTIONS, NUKE_GROUPS, NUKE_MODULES } from "../../lib/constants";
import ModuleCard, { ModuleNumber } from "./ModuleCard";
import type { GuildData, ModuleConfig, RaidIntel } from "../../lib/types";
import { getSessionToken } from "../../lib/discord";
import { timeAgo } from "../../lib/utils";

import { translate } from "../../lib/i18n";
const TOKEN = () => getSessionToken();

export default function AntiNukePanel({ data }: { data: GuildData }) {
  const updateModule = useMutation(api.antinuke.updateModule);
  const setGlobal = useMutation(api.guilds.setAntinukeGlobal);
  const updateLockdown = useMutation(api.guilds.updateLockdown);
  const requestUnlock = useMutation(api.guilds.requestUnlock);
  const updateSettings = useMutation(api.guilds.updateSettings);
  const applyPreset = useMutation(api.presets.applyPreset);
  const setRelaySettings = useMutation(api.relay.setRelaySettings);
  const relayStatus = useQuery(api.relay.relayStatus, {
    token: TOKEN(),
    guildId: data.guild.discordId,
  });

  const [presetApplying, setPresetApplying] = useState<string | null>(null);
  const [confirmPreset, setConfirmPreset] = useState<string | null>(null);

  function configFor(module: string): ModuleConfig {
    const found = data.modules.find((m) => m.module === module);
    const meta = moduleMeta(module);
    return (
      found ?? {
        module,
        enabled: true,
        threshold: meta.defaultThreshold,
        windowSeconds: meta.defaultWindowSeconds,
        punish: meta.defaultPunish,
        actions: DEFAULT_MODULE_ACTIONS[module] ?? [meta.defaultPunish],
        timeoutSeconds: 300,
        whitelistRoles: [],
        heat: meta.defaultHeat,
      }
    );
  }

  async function patchModule(
    module: string,
    patch: Partial<Omit<ModuleConfig, "module">>,
    successMsg?: string,
  ): Promise<boolean> {
    try {
      await updateModule({ token: TOKEN(), guildId: data.guild.discordId, module, ...patch });
      if (successMsg) toast.success(successMsg);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Lưu thất bại"));
      return false; // Switch tự trả núm về giá trị thật
    }
  }

  async function toggleGlobal(enabled: boolean): Promise<boolean> {
    try {
      await setGlobal({ token: TOKEN(), guildId: data.guild.discordId, enabled });
      toast.success(
        enabled ? translate("Đã bật toàn bộ chống nuke") : translate("Đã tắt toàn bộ chống nuke"),
      );
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Thất bại"));
      return false;
    }
  }

  async function doApplyPreset(key: string) {
    setPresetApplying(key);
    setConfirmPreset(null);
    try {
      const res = await applyPreset({
        token: TOKEN(),
        guildId: data.guild.discordId,
        preset: key as "small" | "community" | "highrisk",
      });
      toast.success(
        translate('Đã áp preset "{p0}": {p1} module', {
          p0: res.label,
          p1: res.modulesUpdated + res.modulesCreated,
        }),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Áp preset thất bại"));
    } finally {
      setPresetApplying(null);
    }
  }

  async function toggleRelay(
    field: "relayShare" | "relayReceive",
    value: boolean,
  ): Promise<boolean> {
    try {
      await setRelaySettings({ token: TOKEN(), guildId: data.guild.discordId, [field]: value });
      toast.success(
        value ? translate("Đã bật chia sẻ threat relay") : translate("Đã tắt threat relay"),
      );
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Thất bại"));
      return false;
    }
  }

  async function setLockdown(patch: { enabled?: boolean; minutes?: number }): Promise<boolean> {
    try {
      await updateLockdown({ token: TOKEN(), guildId: data.guild.discordId, ...patch });
      toast.success(translate("Đã lưu cài đặt khóa kênh"));
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Lưu thất bại"));
      return false;
    }
  }

  async function unlockNow() {
    try {
      await requestUnlock({ token: TOKEN(), guildId: data.guild.discordId });
      toast.success(translate("Đã yêu cầu mở khóa — bot thực hiện trong vài giây"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Thất bại"));
    }
  }

  async function setRaidHunt(patch: {
    raidHuntEnabled?: boolean;
    raidHuntBanSuspects?: boolean;
    rollbackEnabled?: boolean;
  }): Promise<boolean> {
    try {
      await updateSettings({ token: TOKEN(), guildId: data.guild.discordId, ...patch });
      toast.success(translate("Đã lưu cài đặt Raid Intel — bot áp dụng trong khoảng 3 phút"));
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Lưu thất bại"));
      return false;
    }
  }

  /** Bật/tắt toàn bộ module trong một nhóm hiển thị. */
  async function toggleGroup(modules: string[], enabled: boolean) {
    try {
      await Promise.all(
        modules.map((m) =>
          updateModule({ token: TOKEN(), guildId: data.guild.discordId, module: m, enabled }),
        ),
      );
      toast.success(
        enabled
          ? translate("Đã bật nhóm ({p0} module)", { p0: modules.length })
          : translate("Đã tắt nhóm ({p0} module)", { p0: modules.length }),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Lưu thất bại"));
    }
  }

  const raidIntel = useQuery(api.antinuke.raidIntel, {
    token: TOKEN(),
    guildId: data.guild.discordId,
  }) as RaidIntel | null | undefined;

  // Phân trang kiểu web truyện cho "Vụ gần đây" — mỗi trang 3 vụ, bấm ‹ › lật qua lại.
  const [raidPage, setRaidPage] = useState(1);
  const PAGE_SIZE = 3;
  const recentList = raidIntel?.recent ?? [];
  const totalPages = Math.max(1, Math.ceil(recentList.length / PAGE_SIZE));
  const page = Math.min(raidPage, totalPages);
  const pageItems = recentList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const enabledCount = NUKE_MODULES.filter((m) => configFor(m).enabled).length;
  const g = data.guild;
  const locked = g.lockdownUntil !== null && g.lockdownUntil > Date.now();
  const minutesLeft =
    locked && g.lockdownUntil ? Math.max(1, Math.ceil((g.lockdownUntil - Date.now()) / 60_000)) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">{translate("Chống nuke / raid")}</h2>
          <p className="text-sm text-muted-foreground">
            {translate(
              "Bảo vệ cấu trúc server khỏi các đợt tấn công hàng loạt: ban, kick, tạo/xóa kênh và role…",
            )}{" "}
          </p>
        </div>
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-4 p-4">
            <ShieldAlert className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold">
                {translate(data.guild.antinukeEnabled ? "Đang bảo vệ server" : "Đã tắt toàn bộ")}
              </p>
              <p className="text-xs text-muted-foreground">
                {enabledCount}/{NUKE_MODULES.length} {translate("module chống nuke bật")}
              </p>
            </div>
            <Switch checked={data.guild.antinukeEnabled} onCheckedChange={toggleGlobal} />
          </CardContent>
        </Card>
      </div>

      {!data.guild.antinukeEnabled && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {translate("⚠️ Chống nuke đang tắt toàn bộ — server chưa được bảo vệ khỏi raid.")}{" "}
        </div>
      )}

      {/* Preset 1-chạm + Threat Relay (Đợt 6) */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Crosshair className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display font-semibold">{translate("Preset bảo mật 1 chạm")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {translate(
                    "Áp cấu hình tối ưu theo quy mô server; danh sách trắng của bạn giữ nguyên.",
                  )}{" "}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {[
                    // i18n-ok: tên/mô tả preset dịch lúc render bằng translate(p.name)
                    { key: "small", name: "Server nhỏ", desc: "< 500 thành viên" },
                    { key: "community", name: "Cộng đồng", desc: "500 – 10k" },
                    { key: "highrisk", name: "Rủi ro cao", desc: "Trading / tài sản" },
                  ].map((p) =>
                    confirmPreset === p.key ? (
                      <div key={p.key} className="flex items-center gap-1 sm:col-span-1">
                        <Button
                          size="sm"
                          variant="danger"
                          className="flex-1 px-2"
                          disabled={presetApplying !== null}
                          onClick={() => doApplyPreset(p.key)}
                        >
                          {translate(presetApplying === p.key ? "Đang áp…" : "Xác nhận")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmPreset(null)}>
                          ✕
                        </Button>
                      </div>
                    ) : (
                      <Button
                        key={p.key}
                        size="sm"
                        variant="secondary"
                        className="h-auto flex-col items-start gap-0.5 px-3 py-2"
                        disabled={presetApplying !== null}
                        onClick={() => setConfirmPreset(p.key)}
                      >
                        <span className="text-xs font-semibold">{translate(p.name)}</span>
                        <span className="text-[10px] font-normal text-muted-foreground">
                          {translate(p.desc)}
                        </span>
                      </Button>
                    ),
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
                  <Database className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-display font-semibold">
                    {translate("Threat relay liên server")}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {translate(
                      "Chia sẻ chữ ký raid ẩn danh với các server khác dùng Protogon — server của bạn được bảo vệ bằng kinh nghiệm toàn mạng.",
                    )}{" "}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {translate(
                      "Khi bật đóng góp: đoạn nội dung spam tối đa 60 ký tự (đã lược mention) và tên bot lạ được chia sẻ ẩn danh trong 24 giờ; không gửi ID người dùng, server nguồn bị băm một chiều.",
                    )}
                  </p>
                  {relayStatus && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {translate("Hiện có")} {relayStatus.activeSignatures}{" "}
                      {translate("signature từ")} {relayStatus.distinctSources} {translate("nguồn")}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm">{translate("Đóng góp signature (khi bị raid)")}</p>
                <Switch
                  checked={relayStatus?.relayShare ?? false}
                  onCheckedChange={(v) => toggleRelay("relayShare", v)}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm">{translate("Nhận signature từ server khác")}</p>
                <Switch
                  checked={relayStatus?.relayReceive ?? false}
                  onCheckedChange={(v) => toggleRelay("relayReceive", v)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Khóa kênh + Raid Intel — 2 thẻ cạnh nhau trên màn hình rộng, không giãn ngang */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
                  <Lock className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-display font-semibold">{translate("Khóa kênh khi bị raid")}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {translate(
                      "Tự chặn gửi tin nhắn và voice khi phát hiện raid; mở lại khi hết giờ hoặc bằng",
                    )}{" "}
                    <code className="font-mono text-xs">/antinuke unlock</code>.
                  </p>
                </div>
              </div>
              <Switch
                checked={g.lockdownEnabled}
                onCheckedChange={(v) => setLockdown({ enabled: v })}
              />
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="grid w-32 gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {translate("Thời gian khóa (phút)")}
                </Label>
                <ModuleNumber
                  value={g.lockdownMinutes}
                  min={1}
                  max={120}
                  onCommit={(n) => setLockdown({ minutes: n })}
                />
              </div>
              <div className="flex flex-1 flex-wrap items-end justify-end gap-2">
                {locked ? (
                  <>
                    <Badge variant="danger" className="gap-1.5 px-3 py-1">
                      <Lock className="h-3 w-3" />{" "}
                      {translate("Đang khóa — tự mở sau khoảng {p0} phút", { p0: minutesLeft })}
                    </Badge>
                    <Button variant="secondary" size="sm" onClick={unlockNow}>
                      <Unlock className="h-3.5 w-3.5" /> {translate("Mở khóa ngay")}{" "}
                    </Button>
                  </>
                ) : g.lockdownRequested ? (
                  <Badge variant="secondary" className="px-3 py-1">
                    {translate("Đang chờ bot mở khóa…")}{" "}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="px-3 py-1">
                    {translate("Hiện không có kênh nào bị khóa")}{" "}
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Raid Intel — thu thập dữ liệu + săn nguồn cơn raid */}
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
                  <Crosshair className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-display font-semibold">
                    {translate("Raid Intel — săn nguồn cơn raid 🎯")}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {translate("Thu thập mẫu raid và dùng AI phân tích để tìm")}{" "}
                    <b className="text-foreground">{translate("kẻ chủ mưu")}</b>{" "}
                    {translate(
                      "(tài khoản trùng avatar/username, người tạo invite, audit log) rồi tự ban.",
                    )}{" "}
                  </p>
                </div>
              </div>
              <Badge variant="secondary" className="shrink-0 gap-1.5 px-3 py-1.5">
                <Database className="h-3.5 w-3.5" />
                {raidIntel
                  ? translate("{p0} mẫu", { p0: raidIntel.count })
                  : translate("đang tải…")}
              </Badge>
            </div>

            <div className="mt-4 grid gap-2">
              <div className="flex items-center justify-between gap-3 rounded-lg bg-secondary/40 p-3">
                <div>
                  <p className="text-sm font-semibold">{translate("Săn lùng nguồn cơn raid")}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {translate("Phân tích cụm tài khoản và audit log sau mỗi vụ.")}{" "}
                  </p>
                </div>
                <Switch
                  checked={g.raidHuntEnabled}
                  onCheckedChange={(v) => setRaidHunt({ raidHuntEnabled: v })}
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-secondary/40 p-3">
                <div>
                  <p className="text-sm font-semibold">{translate("Tự ban nghi phạm nguồn cơn")}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {translate("Tự ban tài khoản đủ điểm nghi vấn (chủ mưu, trùng avatar…).")}{" "}
                  </p>
                </div>
                <Switch
                  checked={g.raidHuntBanSuspects}
                  onCheckedChange={(v) => setRaidHunt({ raidHuntBanSuspects: v })}
                />
              </div>
              {/* Cờ tắt rollback: trước đây bot đọc field không tồn tại nên luôn
                  bật — chủ server không có đường tắt khi rollback hồi lại kênh
                  họ đã dọn có chủ đích. */}
              <div className="flex items-center justify-between gap-3 rounded-lg bg-secondary/40 p-3">
                <div>
                  <p className="text-sm font-semibold">
                    {translate("Khôi phục kênh và role sau khi bị nuke")}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {translate(
                      "Tự khôi phục theo ảnh chụp gần nhất. Tắt nếu bạn tự dọn và tạo lại kênh — snapshot cũ có thể hồi lại những thứ bạn đã bỏ.",
                    )}{" "}
                  </p>
                </div>
                <Switch
                  checked={g.rollbackEnabled}
                  onCheckedChange={(v) => setRaidHunt({ rollbackEnabled: v })}
                />
              </div>
            </div>

            {raidIntel && raidIntel.recent.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {translate("Vụ gần đây")} ({raidIntel.recent.length})
                  </p>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={page <= 1}
                        onClick={() => setRaidPage(page - 1)}
                        aria-label={translate("Trang trước")}
                        className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-card text-sm leading-none text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:hover:bg-card"
                      >
                        ‹
                      </button>
                      <span className="min-w-10 px-1 text-center font-mono text-[11px] text-muted-foreground">
                        {page}/{totalPages}
                      </span>
                      <button
                        type="button"
                        disabled={page >= totalPages}
                        onClick={() => setRaidPage(page + 1)}
                        aria-label="Trang sau"
                        className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-card text-sm leading-none text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:hover:bg-card"
                      >
                        ›
                      </button>
                    </div>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {pageItems.map((s, i) => (
                    <li
                      key={`${s.createdAt}-${i}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-secondary/30 px-3 py-2 text-xs"
                    >
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                        {s.module}
                      </code>
                      <span className="text-muted-foreground">
                        {s.count} {translate("lượt")}
                        {s.clusterMemberCount ? ` · ${s.clusterMemberCount} acc` : ""} ·{" "}
                        {timeAgo(s.createdAt)}
                      </span>
                      {s.aiClassification && (
                        <Badge
                          variant="secondary"
                          className={
                            s.aiClassification === "raid"
                              ? "bg-danger text-danger-foreground"
                              : s.aiClassification === "benign"
                                ? "bg-secondary text-secondary-foreground border border-border"
                                : "bg-foreground/10 text-foreground border border-foreground/20"
                          }
                        >
                          AI: {s.aiClassification}
                          {s.aiConfidence != null ? ` ${Math.round(s.aiConfidence * 100)}%` : ""}
                        </Badge>
                      )}
                      {s.suspectedSourceName && (
                        <span
                          className={s.banned ? "text-danger font-semibold" : "text-foreground"}
                        >
                          {s.banned
                            ? `🎯 ${translate("đã ban nguồn cơn")}: ${s.suspectedSourceName}`
                            : `${translate("nghi")}: ${s.suspectedSourceName}`}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Module chống nuke — chia nhóm gọn gàng */}
      <div className="space-y-5">
        {NUKE_GROUPS.map((group) => {
          const on = group.modules.filter((m) => configFor(m).enabled).length;
          const allOn = on === group.modules.length;
          return (
            <div key={group.label}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-sm font-semibold">{translate(group.label)}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {on}/{group.modules.length} {translate("bật")}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    onClick={() => toggleGroup(group.modules, !allOn)}
                  >
                    {translate(allOn ? "Tắt tất cả" : "Bật tất cả")}
                  </Button>
                </div>
              </div>
              <div className="grid gap-2 xl:grid-cols-2">
                {group.modules.map((key) => (
                  <ModuleCard
                    key={key}
                    data={data}
                    module={key}
                    config={configFor(key)}
                    patchModule={patchModule}
                    unit={translate("vi phạm")}
                    showHeat={false}
                    compact
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
