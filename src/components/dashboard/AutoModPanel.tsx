import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { AlertTriangle, Flame, ListX, Plus, ShieldCheck, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent } from "../ui/card";
import { Switch } from "../ui/switch";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  ANTINUKE_MODULE_META,
  DEFAULT_MODULE_ACTIONS,
  MODERATION_GROUPS,
  MODERATION_MODULES,
  WARN_STRIKE_DEFAULTS,
} from "../../lib/constants";
import ModuleCard from "./ModuleCard";
import { HeatTable, SafetyBar } from "./HeatBar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import type { GuildData, ModuleConfig } from "../../lib/types";
import { getSessionToken } from "../../lib/discord";

import { translate } from "../../lib/i18n";
const TOKEN = () => getSessionToken();

function ModuleNumber({
  value,
  min,
  max,
  onCommit,
}: {
  value: number;
  min: number;
  max?: number;
  onCommit: (n: number) => void;
}) {
  const [v, setV] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setV(String(value));
  }, [value, focused]);
  return (
    <Input
      type="number"
      min={min}
      max={max}
      value={v}
      onFocus={() => setFocused(true)}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        setFocused(false);
        const n = Number(v);
        // Phải kiểm CẢ trần: thuộc tính max của <input> chỉ chặn con trỏ/spinner,
        // gõ tay 999 vẫn qua. Trước đây chỉ kiểm min nên UI hiện 99 trong khi
        // server đã clamp về 99 — hai bên lệch nhau, người dùng tưởng lưu sai.
        // Ngoài miền → trả về giá trị server (effect dưới đây tự đồng bộ lại).
        // Phải kiểm CẢ trần: thuộc tính max của <input> chỉ chặn con trỏ/spinner,
        // gõ tay 999 vẫn qua. Trước đây chỉ kiểm min nên UI hiện 99 trong khi
        // server đã clamp về 99 — hai bên lệch nhau, người dùng tưởng lưu sai.
        // Ngoài miền → trả về giá trị server (effect dưới đây tự đồng bộ lại).
        if (Number.isNaN(n) || n < min || (max !== undefined && n > max)) return;
        onCommit(Math.round(n));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export default function ModerationPanel({ data }: { data: GuildData }) {
  const updateModule = useMutation(api.antinuke.updateModule);
  const updateSettings = useMutation(api.guilds.updateSettings);
  const setAutomod = useMutation(api.guilds.setAutomod);

  const [tiers, setTiers] = useState({
    warnAt: data.guild.heatWarnAt,
    timeoutAt: data.guild.heatTimeoutAt,
    kickAt: data.guild.heatKickAt,
    banAt: data.guild.heatBanAt,
  });
  const [repeat, setRepeat] = useState({
    multiplier: data.guild.heatRepeatMultiplier,
    windowMin: data.guild.heatRepeatWindowMin,
  });
  const [strikes, setStrikes] = useState({
    limit: data.guild.warnStrikeLimit,
    windowMin: data.guild.warnStrikeWindowMin,
    punish: data.guild.warnStrikePunish,
  });
  const [badWordInput, setBadWordInput] = useState("");

  function configFor(module: string): ModuleConfig {
    const found = data.modules.find((m) => m.module === module);
    const meta = ANTINUKE_MODULE_META[module];
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
  ) {
    try {
      await updateModule({ token: TOKEN(), guildId: data.guild.discordId, module, ...patch });
      if (successMsg) toast.success(successMsg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Lưu thất bại"));
    }
  }

  /** Cổng RIÊNG của tab Auto-mod: tắt chống nuke không tắt bộ lọc nội dung nữa. */
  async function toggleAutomod(enabled: boolean) {
    try {
      await setAutomod({ token: TOKEN(), guildId: data.guild.discordId, enabled });
      toast.success(
        enabled
          ? translate("Đã bật toàn bộ auto-mod nội dung")
          : translate("Đã tắt toàn bộ auto-mod nội dung"),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Thất bại"));
    }
  }

  async function patchHeatSettings(patch: {
    heatEnabled?: boolean;
    heatDecayPerMin?: number;
    heatWarnAt?: number;
    heatTimeoutAt?: number;
    heatKickAt?: number;
    heatBanAt?: number;
    heatRepeatMultiplier?: number;
    heatRepeatWindowMin?: number;
  }): Promise<boolean> {
    try {
      await updateSettings({ token: TOKEN(), guildId: data.guild.discordId, ...patch });
      toast.success(translate("Đã lưu cài đặt hệ thống nhiệt độ"));
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Lưu thất bại"));
      return false;
    }
  }

  async function commitRepeat(field: "multiplier" | "windowMin", n: number) {
    const prev = repeat;
    const next = {
      multiplier: field === "multiplier" ? n : repeat.multiplier,
      windowMin: field === "windowMin" ? n : repeat.windowMin,
    };
    setRepeat(next);
    const ok = await patchHeatSettings({
      heatRepeatMultiplier: next.multiplier,
      heatRepeatWindowMin: next.windowMin,
    });
    // Ô nhập KHÔNG tự đồng bộ lại từ server khi data.guild đổi, nên nếu lưu
    // hỏng mà giữ số mới thì màn hình mãi hiện giá trị server chưa nhận —
    // người dùng tin là đã lưu trong khi bot vẫn chạy ngưỡng cũ. Hoàn nguyên.
    if (!ok) setRepeat(prev);
  }

  async function commitStrikes(patch: {
    warnStrikeLimit?: number;
    warnStrikeWindowMin?: number;
    warnStrikePunish?: "timeout" | "kick" | "ban";
  }) {
    const prev = strikes;
    const next = {
      limit: patch.warnStrikeLimit ?? strikes.limit,
      windowMin: patch.warnStrikeWindowMin ?? strikes.windowMin,
      punish: patch.warnStrikePunish ?? strikes.punish,
    };
    setStrikes(next);
    try {
      await updateSettings({ token: TOKEN(), guildId: data.guild.discordId, ...patch });
      toast.success(translate("Đã lưu cài đặt warn tích lũy"));
    } catch (e) {
      setStrikes(prev);
      toast.error(e instanceof Error ? e.message : translate("Lưu thất bại"));
    }
  }

  /** Cập nhật 4 ngưỡng cùng lúc để luôn tăng dần (cảnh báo < tạm khóa < kick < ban). */
  async function commitTier(
    field: "heatWarnAt" | "heatTimeoutAt" | "heatKickAt" | "heatBanAt",
    n: number,
  ) {
    const prev = tiers;
    const next = {
      heatWarnAt: field === "heatWarnAt" ? n : tiers.warnAt,
      heatTimeoutAt: field === "heatTimeoutAt" ? n : tiers.timeoutAt,
      heatKickAt: field === "heatKickAt" ? n : tiers.kickAt,
      heatBanAt: field === "heatBanAt" ? n : tiers.banAt,
    };
    setTiers({
      warnAt: next.heatWarnAt,
      timeoutAt: next.heatTimeoutAt,
      kickAt: next.heatKickAt,
      banAt: next.heatBanAt,
    });
    const ok = await patchHeatSettings(next);
    if (!ok) setTiers(prev);
  }

  async function addBadWord() {
    const word = badWordInput.trim().toLowerCase();
    if (!word) return;
    if (word.length > 40) return toast.error(translate("Mỗi từ tối đa 40 ký tự"));
    const current = data.guild.badWords || [];
    if (current.includes(word)) {
      setBadWordInput("");
      return toast.info(translate('"{p0}" đã có trong danh sách', { p0: word }));
    }
    if (current.length >= 100) return toast.error(translate("Danh sách tối đa 100 từ"));
    try {
      await updateSettings({
        token: TOKEN(),
        guildId: data.guild.discordId,
        badWords: [...current, word],
      });
      setBadWordInput("");
      toast.success(translate('Đã thêm "{p0}"', { p0: word }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Thất bại"));
    }
  }

  async function removeBadWord(word: string) {
    try {
      await updateSettings({
        token: TOKEN(),
        guildId: data.guild.discordId,
        badWords: (data.guild.badWords || []).filter((w) => w !== word),
      });
      toast.success(translate('Đã xóa "{p0}"', { p0: word }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Thất bại"));
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

  const enabledCount = MODERATION_MODULES.filter((m) => configFor(m).enabled).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">{translate("Auto-mod nội dung")}</h2>
          <p className="text-sm text-muted-foreground">
            {translate(
              "Tự động kiểm duyệt nội dung: chống spam tin nhắn, mention, từ ngữ thô tục, ảnh/file và link mời Discord",
            )}{" "}
          </p>
        </div>
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-4 p-4">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold">
                {translate(
                  data.guild.automodEnabled ? "Đang kiểm duyệt nội dung" : "Đã tắt toàn bộ",
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {enabledCount}/{MODERATION_MODULES.length} {translate("module đang bật")}
              </p>
            </div>
            <Switch checked={data.guild.automodEnabled} onCheckedChange={toggleAutomod} />
          </CardContent>
        </Card>
      </div>

      {!data.guild.automodEnabled && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {translate(
            "⚠️ Auto-mod đang tắt toàn bộ — link mời, link độc hại, từ ngữ xấu, file nguy hiểm và spam đều không bị chặn.",
          )}{" "}
        </div>
      )}

      {/* Hệ thống nhiệt độ */}
      <Card>
        <CardContent className="grid gap-4 sm:gap-5 p-4 sm:p-5 lg:grid-cols-2">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
                  <Flame className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-display font-semibold">
                    {translate("Hệ thống nhiệt độ vi phạm")}
                  </p>
                  <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                    {translate(
                      "Mỗi vi phạm cộng điểm nhiệt theo cài đặt của module. Nhiệt tăng dần rồi tự giảm theo thời gian; khi chạm ngưỡng",
                    )}{" "}
                    <b className="text-foreground">warn</b>{" "}
                    {translate("thành viên nhận cảnh báo riêng, rồi tự tăng cấp hình phạt:")}{" "}
                    <b className="text-foreground">{translate("tạm khóa")}</b> →{""}
                    <b className="text-foreground">kick</b> → <b className="text-danger">ban</b>.
                  </p>
                </div>
              </div>
              <Switch
                checked={data.guild.heatEnabled}
                onCheckedChange={(v) => patchHeatSettings({ heatEnabled: v })}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {translate("Giảm nhiệt (điểm/phút)")}
                </Label>
                <ModuleNumber
                  value={data.guild.heatDecayPerMin}
                  min={0}
                  max={60}
                  onCommit={(n) => patchHeatSettings({ heatDecayPerMin: n })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {translate("Hệ số tái phạm (lần)")}
                </Label>
                <ModuleNumber
                  value={repeat.multiplier}
                  min={1}
                  max={10}
                  onCommit={(n) => commitRepeat("multiplier", n)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {translate("Cửa sổ tái phạm (phút)")}
                </Label>
                <ModuleNumber
                  value={repeat.windowMin}
                  min={1}
                  max={1440}
                  onCommit={(n) => commitRepeat("windowMin", n)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">{translate("Ngưỡng warn")}</Label>
                <ModuleNumber
                  value={tiers.warnAt}
                  min={1}
                  max={99}
                  onCommit={(n) => commitTier("heatWarnAt", n)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {translate("Ngưỡng tạm khóa")}
                </Label>
                <ModuleNumber
                  value={tiers.timeoutAt}
                  min={1}
                  max={100}
                  onCommit={(n) => commitTier("heatTimeoutAt", n)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">{translate("Ngưỡng kick")}</Label>
                <ModuleNumber
                  value={tiers.kickAt}
                  min={1}
                  max={100}
                  onCommit={(n) => commitTier("heatKickAt", n)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-danger">{translate("Ngưỡng ban")}</Label>
                <ModuleNumber
                  value={tiers.banAt}
                  min={1}
                  max={100}
                  onCommit={(n) => commitTier("heatBanAt", n)}
                />
              </div>
              <p className="col-span-full text-xs text-muted-foreground">
                {translate(
                  "Ngưỡng phải tăng dần: cảnh báo < tạm khóa < kick < ban (tối đa 100 điểm). Thành viên vừa bị phạt mà",
                )}{" "}
                <b className="text-foreground">
                  {translate("tái phạm trong {p0} phút", { p0: repeat.windowMin })}
                </b>{" "}
                {translate("sẽ nhận")}{" "}
                <b className="text-foreground">
                  ×{repeat.multiplier} {translate("điểm nhiệt")}
                </b>{" "}
                {translate("mỗi lần vi phạm, thanh nhiệt đầy nhanh hơn.")}{" "}
              </p>
            </div>
          </div>
          <div className="flex flex-col justify-center gap-4 rounded-xl border border-border bg-secondary/50 p-4">
            <SafetyBar data={data} />
            <p className="text-xs font-medium text-muted-foreground">
              {translate("🔥 Bảng nhiệt và warn tích lũy của từng thành viên")}{" "}
            </p>
            <HeatTable data={data} />
          </div>
        </CardContent>
      </Card>

      {/* Warn tích lũy */}
      <Card>
        <CardContent className="grid gap-4 sm:gap-5 p-4 sm:p-5 lg:grid-cols-[1fr_1fr]">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <p className="font-display font-semibold">
                {translate("Warn tích lũy (tăng cấp hình phạt)")}
              </p>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                {translate("Khi module dùng hình phạt")} <b className="text-foreground">Warn</b>
                {translate(", mỗi lần vi phạm đếm")} <b className="text-foreground">1 warn</b>
                {translate(". Đủ số warn trong cửa sổ thời gian thì hình phạt tự")}{" "}
                <b className="text-foreground">{translate("tăng cấp")}</b>{" "}
                {translate(
                  "lên một mức nặng hơn. Cơ chế này chạy song song với hệ thống nhiệt.",
                )}{" "}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">
                {translate("Số warn để tăng cấp (0 = tắt)")}
              </Label>
              <ModuleNumber
                value={strikes.limit}
                min={0}
                max={20}
                onCommit={(n) => commitStrikes({ warnStrikeLimit: n })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">{translate("Cửa sổ (phút)")}</Label>
              <ModuleNumber
                value={strikes.windowMin}
                min={1}
                max={1440}
                onCommit={(n) => commitStrikes({ warnStrikeWindowMin: n })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">
                {translate("Hình phạt khi tăng cấp")}
              </Label>
              <Select
                value={strikes.punish}
                onValueChange={(v) =>
                  commitStrikes({ warnStrikePunish: v as "timeout" | "kick" | "ban" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="timeout">{translate("⏸️ Tạm khóa (timeout)")}</SelectItem>
                  <SelectItem value="kick">👢 Kick</SelectItem>
                  <SelectItem value="ban">🚫 Ban</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="col-span-full text-xs text-muted-foreground">
              {strikes.limit > 0 ? (
                <>
                  {" "}
                  {translate("Đang bật:")} <b className="text-foreground">{strikes.limit} warn</b>{" "}
                  {translate("trong {p0} phút → tự", { p0: strikes.windowMin })}{" "}
                  <b className="text-foreground">
                    {translate(
                      strikes.punish === "timeout"
                        ? "tạm khóa"
                        : strikes.punish === "kick"
                          ? "kick"
                          : "ban",
                    )}
                  </b>{" "}
                  {translate("(mặc định: {limit} warn / {window} phút).", {
                    limit: WARN_STRIKE_DEFAULTS.limit,
                    window: WARN_STRIKE_DEFAULTS.windowMin,
                  })}
                </>
              ) : (
                <>
                  {translate(
                    "Đang tắt — mọi module chỉ cảnh báo, không tự tăng cấp theo số lần warn.",
                  )}
                </>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Danh sách từ ngữ xấu */}
      <Card className="border-danger/25">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-danger/15 text-danger">
                <ListX className="h-5 w-5" />
              </span>
              <div>
                <p className="font-display font-semibold">{translate("Danh sách từ ngữ xấu")}</p>
                <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                  Khi module <b className="text-foreground">{translate("Lọc từ ngữ xấu")}</b>{" "}
                  {translate(
                    "bật, mọi tin nhắn chứa từ trong danh sách dưới đây sẽ bị xóa và xử lý tự động. Xóa hết từ để tắt bộ lọc từ ngữ xấu.",
                  )}{" "}
                </p>
              </div>
            </div>
            <Badge variant="secondary">
              {data.guild.badWords?.length ?? 0}/100 {translate("từ")}
            </Badge>
          </div>

          <div className="mt-4 flex gap-2">
            <Input
              placeholder={translate("Nhập từ ngữ cần chặn…")}
              value={badWordInput}
              onChange={(e) => setBadWordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addBadWord();
              }}
            />
            <Button onClick={addBadWord}>
              <Plus className="h-4 w-4" /> {translate("Thêm")}{" "}
            </Button>
          </div>

          {(data.guild.badWords ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {translate(
                "Chưa có từ nào — bộ lọc từ ngữ xấu chỉ hoạt động sau khi bạn thêm từ.",
              )}{" "}
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {data.guild.badWords.map((w) => (
                <span
                  key={w}
                  className="group flex items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-1 font-mono text-xs text-danger transition-colors hover:bg-danger/20"
                >
                  {w}
                  <button
                    onClick={() => removeBadWord(w)}
                    className="text-danger/60 transition-colors hover:text-danger"
                    aria-label={translate("Xóa {p0}", { p0: w })}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Module auto-mod — chia nhóm gọn gàng */}
      <div className="space-y-5">
        {MODERATION_GROUPS.map((group) => {
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
              <div className="space-y-2">
                {group.modules.map((key) => (
                  <ModuleCard
                    key={key}
                    data={data}
                    module={key}
                    config={configFor(key)}
                    patchModule={patchModule}
                    unit={translate(
                      key === "spam"
                        ? "tin nhắn"
                        : key === "mention"
                          ? "tin có mention"
                          : key === "attachment"
                            ? "tin có ảnh/file"
                            : "vi phạm",
                    )}
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
