import { Flame, RotateCcw, Trash2 } from "lucide-react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { toastConvexError } from "../../lib/toastError";
import { api } from "../../../convex/_generated/api";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { HEAT_DEFAULTS, HEAT_TIER_LABEL } from "../../lib/constants";
import type { GuildData, HeatState } from "../../lib/types";
import { getSessionToken } from "../../lib/discord";

import { translate } from "../../lib/i18n";
const TOKEN = () => getSessionToken();

/** Nhiệt độ hiệu dụng sau khi trừ decay theo thời gian. */
export function effectiveHeat(heat: number, updatedAt: number, decayPerMin: number): number {
  const elapsedMin = (Date.now() - updatedAt) / 60000;
  return Math.max(0, Math.round(heat - elapsedMin * decayPerMin));
}

export function tierOf(heat: number, timeoutAt: number, kickAt: number, banAt: number): string {
  if (heat >= banAt) return "ban";
  if (heat >= kickAt) return "kick";
  if (heat >= timeoutAt) return "timeout";
  return "warn";
}

/* Tier nhiệt theo bảng đen trắng: mức càng nặng → nền càng đậm (contrast = thứ bậc). */
const TIER_STYLE: Record<string, string> = {
  warn: "bg-secondary text-secondary-foreground border border-border",
  timeout: "bg-foreground/10 text-foreground border border-foreground/20",
  kick: "bg-foreground/20 text-foreground border border-foreground/30",
  ban: "bg-danger text-danger-foreground border border-danger",
};

function decayedStates(data: GuildData): HeatState[] {
  const decay = data.guild.heatDecayPerMin ?? HEAT_DEFAULTS.decayPerMin;
  return (data.heatStates || [])
    .map((h) => ({
      ...h,
      heat: effectiveHeat(h.heat, h.updatedAt, decay),
      warnStrikes: h.warnStrikes ?? 0,
    }))
    .filter((h) => h.heat > 0 || h.warnStrikes > 0)
    .sort((a, b) => b.heat - a.heat);
}

/** Thanh phần trăm thể hiện mức an toàn của server. */
export function SafetyBar({ data }: { data: GuildData }) {
  const resetHeat = useMutation(api.guilds.resetHeat);
  const states = decayedStates(data);
  const maxHeat = states[0]?.heat ?? 0;
  const safety = Math.max(0, Math.min(100, 100 - maxHeat));
  const barColor = "bg-foreground";
  const barText =
    safety >= 70 ? "text-foreground" : safety >= 40 ? "text-foreground" : "text-danger";

  async function resetAll() {
    try {
      await resetHeat({ token: TOKEN(), guildId: data.guild.discordId });
      toast.success(translate("Đã xóa toàn bộ nhiệt độ vi phạm"));
    } catch (e) {
      toastConvexError(e, translate("Xóa thất bại"));
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-display text-3xl font-bold tabular-nums">{safety}%</p>
          <p className="text-xs text-muted-foreground">{translate("mức an toàn của server")}</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>
            {translate("Nhiệt cao nhất:")}{" "}
            <span className={`font-semibold ${barText}`}>{maxHeat}/100</span>
          </p>
          <p>
            {translate("Nhiệt giảm {p0} điểm/phút", {
              p0: data.guild.heatDecayPerMin ?? HEAT_DEFAULTS.decayPerMin,
            })}
          </p>
        </div>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${safety}%` }}
        />
      </div>{" "}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span>■ {data.guild.heatBanAt ?? HEAT_DEFAULTS.banAt} = ban</span>
          <span>▪ {data.guild.heatKickAt ?? HEAT_DEFAULTS.kickAt} = kick</span>
          <span>
            ▪ {data.guild.heatTimeoutAt ?? HEAT_DEFAULTS.timeoutAt} {translate("= tạm khóa")}
          </span>
          <span>
            ▪ {data.guild.heatWarnAt ?? HEAT_DEFAULTS.warnAt} {translate("= cảnh báo")}
          </span>
          <span>□ {translate("0 = an toàn")}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={resetAll}
          disabled={states.length === 0}
          className="gap-1.5 text-muted-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" /> {translate("Xóa toàn bộ nhiệt")}{" "}
        </Button>
      </div>
    </div>
  );
}

/** Danh sách thành viên đang có nhiệt độ / warn cao nhất (kèm nút xóa nhiệt từng người). */
export function TopOffenders({ data, limit = 5 }: { data: GuildData; limit?: number }) {
  const resetHeat = useMutation(api.guilds.resetHeat);
  const states = decayedStates(data).slice(0, limit);
  if (states.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-secondary/40 px-3 py-3 text-sm text-muted-foreground">
        <Flame className="h-4 w-4" />
        {translate("Chưa có ai vi phạm — server đang rất an toàn 🎉")}{" "}
      </div>
    );
  }
  const g = data.guild;

  async function resetUser(userId: string, username: string) {
    try {
      await resetHeat({ token: TOKEN(), guildId: data.guild.discordId, userId });
      toast.success(translate("Đã xóa nhiệt của {p0}", { p0: username || userId }));
    } catch (e) {
      toastConvexError(e, translate("Xóa thất bại"));
    }
  }

  return (
    <ul className="space-y-2">
      {states.map((h) => {
        const tier = tierOf(h.heat, g.heatTimeoutAt ?? 40, g.heatKickAt ?? 70, g.heatBanAt ?? 90);
        return (
          <li key={h.userId} className="rounded-lg bg-secondary/40 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{h.username || `<@${h.userId}>`}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{h.userId}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {h.warnStrikes > 0 && (
                  <Badge variant="secondary" className="gap-1 border border-border">
                    ⚠️ {h.warnStrikes}/{g.warnStrikeLimit || 3}
                  </Badge>
                )}
                <span className="font-mono text-sm font-semibold tabular-nums">{h.heat}/100</span>
                <Badge className={TIER_STYLE[tier]}>{translate(HEAT_TIER_LABEL[tier])}</Badge>
                <button
                  onClick={() => resetUser(h.userId, h.username)}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                  title={translate("Xóa nhiệt của {p0}", { p0: h.username || h.userId })}
                  aria-label={translate("Xóa nhiệt của {p0}", { p0: h.username || h.userId })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {/* Thanh nhiệt xoáy bên dưới: xanh → vàng → đỏ */}
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 w-full max-w-[200px] overflow-hidden rounded-full bg-secondary">
                <div
                  className="heat-swirl h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(2, h.heat)}%` }}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Bảng đầy đủ nhiệt độ & warn tích lũy của từng thành viên (Moderation).
 * Mỗi dòng: tên + ID, thanh nhiệt mini, giai đoạn, warn X/N, nút xóa nhiệt.
 */
export function HeatTable({ data, limit = 20 }: { data: GuildData; limit?: number }) {
  const resetHeat = useMutation(api.guilds.resetHeat);
  const states = decayedStates(data).slice(0, limit);
  const g = data.guild;
  const strikeLimit = g.warnStrikeLimit || 3;

  if (states.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-secondary/40 px-3 py-3 text-sm text-muted-foreground">
        <Flame className="h-4 w-4" />
        {translate("Bảng đang trống — chưa thành viên nào có nhiệt hay warn 🎉")}{" "}
      </div>
    );
  }

  async function resetUser(userId: string, username: string) {
    try {
      await resetHeat({ token: TOKEN(), guildId: g.discordId, userId });
      toast.success(translate("Đã xóa nhiệt của {p0}", { p0: username || userId }));
    } catch (e) {
      toastConvexError(e, translate("Xóa thất bại"));
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="grid grid-cols-[1fr_auto] items-center gap-2 border-b border-border px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>{translate("Thành viên")}</span>
        <span className="text-right">{translate("Nhiệt · Warn")}</span>
      </div>
      <ul className="divide-y divide-border/60">
        {states.map((h) => {
          const tier = tierOf(h.heat, g.heatTimeoutAt ?? 40, g.heatKickAt ?? 70, g.heatBanAt ?? 90);
          return (
            <li key={h.userId} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">
                    {h.username || `<@${h.userId}>`}
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                      {h.userId}
                    </span>
                  </p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {h.warnStrikes > 0 && (
                      <Badge variant="secondary" className="gap-1 border border-border px-1.5">
                        ⚠️ {h.warnStrikes}/{strikeLimit}
                      </Badge>
                    )}
                    <Badge className={TIER_STYLE[tier]}>{translate(HEAT_TIER_LABEL[tier])}</Badge>
                    <button
                      onClick={() => resetUser(h.userId, h.username)}
                      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                      title={translate("Xóa nhiệt của {p0}", { p0: h.username || h.userId })}
                      aria-label={translate("Xóa nhiệt của {p0}", { p0: h.username || h.userId })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 w-full max-w-[160px] overflow-hidden rounded-full bg-secondary">
                    <div
                      className="heat-swirl h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(2, h.heat)}%` }}
                    />
                  </div>
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {h.heat}/100
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
