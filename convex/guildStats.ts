/**
 * guildStats — "TÌNH HÌNH SERVER": số liệu chủ server THẬT SỰ quan tâm.
 *
 * Vì sao có: dashboard có đầy số liệu kỹ thuật (độ trễ, heat, version) nhưng
 * thiếu đúng câu hỏi của một người quản trị: "hôm nay bot cứu server tôi bao
 * nhiêu lần, và có lần nào nó phạt nhầm tôi không?". Không có số liệu phạt
 * nhầm thì không thể quyết định có nên bật alt detection hay không — nên
 * đây là thứ quyết định giữ hay bỏ bot, không phải chi tiết làm đẹp.
 *
 * Nguyên tắc:
 *  - `summarize()` là HÀM THUẦN (không Convex/DB/mạng) → test được bằng dữ
 *    liệu giả, khoá đúng biên ngày VN và cách đếm.
 *  - Không đổi schema, không ghi gì: chỉ đọc antinukeEvents + memberJoins.
 */

import { query } from "./_generated/server";
import { v } from "convex/values";
import { getUserByToken, canManageGuild } from "./auth";
// Regex bóc ký hiệu: dùng CHUNG với web (src/lib/riskExplain.ts) để hai nơi
// không lệch nhau. Lưu ý `\ufe0f?` bắt buộc — `⚠️` là 2 codepoint, thiếu nó
// thì mọi tín hiệu yếu thành 2 mã khác nhau và thống kê đếm sai.
const RISK_PREFIX_RE = /^[❌⚠✅]\ufe0f?\s*/;

/** Một sự kiện antinuke rút gọn (chỉ field cần cho thống kê). */
export interface StatEvent {
  module: string;
  action: string;
  count: number;
  createdAt: number;
  punish?: string;
}

/** Một lượt join rút gọn (chỉ field cần cho thống kê). */
export interface StatJoin {
  createdAt: number;
  riskScore: number;
  action?: string | null;
  riskFactors: string[];
}

/** Số liệu 1 server trong 1 khoảng thời gian. */
export interface GuildSummary {
  /** Sự kiện antinuke (dòng), nhiều nhất trong ngày. */
  events: number;
  /** Tổng số "đơn vị" bị chặn (raid chặn 200 người = 200, không phải 1). */
  blocked: number;
  /** Số lượt join trong khoảng. */
  joins: number;
  /** Số tài khoản bị xử lý (khác `pass`). */
  punished: number;
  /**
   * Tài khoản bị xử lý DỚ rõ ràng: điểm rủi ro thấp (<70) mà vẫn bị phạt.
   * Đây là chỉ số cảnh báo cho chủ server — càng nhiều, bot càng đáng nghi.
   */
  suspectedFalsePositives: number;
  /** Số "cứu" khác nhau: (module, hành vi) đã chặn. */
  threatsBlocked: number;
  /** Yếu tố rủi ro phổ biến nhất, kèm số lần (tối đa 5). */
  topRiskFactors: [string, number][];
}

/** Bắt đầu ngày hôm nay theo giờ Việt Nam (UTC+7). */
export function startOfDayVietnam(now: number): number {
  const VN_OFFSET_MS = 7 * 3600_000;
  const local = now + VN_OFFSET_MS;
  const dayStartLocal = Math.floor(local / 86_400_000) * 86_400_000;
  return dayStartLocal - VN_OFFSET_MS;
}

/**
 * Gom số liệu thô → `GuildSummary`. Hàm thuần.
 *
 * Vì sao ngưỡng "phạm nhầm" là 70: đó là `altMaxRiskScore` MẶC ĐỊNH mà bot
 * dùng để quyết định có phạt hay không. Tài khoản bị xử lý mà điểm < ngưỡng
 * nghĩa là chủ server đã hạ ngưỡng, hoặc module khác (spam/badword) đã phạt —
 * đều đáng để họ soi lại, nên gọi là "nghi phạm phạt nhầm" chứ không khẳng
 * định bot sai.
 */
export function summarize(
  events: StatEvent[],
  joins: StatJoin[],
  dayStart: number,
  altMaxRiskScore = 70,
): GuildSummary {
  const todayEvents = events.filter((e) => e.createdAt >= dayStart);
  const todayJoins = joins.filter((j) => j.createdAt >= dayStart);

  const punished = todayJoins.filter((j) => !!j.action && j.action !== "pass");
  const factorCounts: Record<string, number> = {};
  for (const j of todayJoins) {
    for (const f of j.riskFactors) {
      const code = f.replace(RISK_PREFIX_RE, "");
      factorCounts[code] = (factorCounts[code] ?? 0) + 1;
    }
  }
  const topRiskFactors = Object.entries(factorCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5);

  return {
    events: todayEvents.length,
    blocked: todayEvents.reduce((sum, e) => sum + (e.count || 0), 0),
    joins: todayJoins.length,
    punished: punished.length,
    suspectedFalsePositives: punished.filter((j) => j.riskScore < altMaxRiskScore).length,
    // Set theo (module, hành vi) — 20 sự kiện cùng loại là MỘT loại đe doạ,
    // không phải 20. Đếm số dòng sẽ thổi phóng giá trị.
    threatsBlocked: new Set(todayEvents.map((e) => `${e.module}:${e.action}`)).size,
    topRiskFactors,
  };
}

/** Một ô giờ trong ngày (giờ Việt Nam, 0–23). */
export interface HourBucket {
  hour: number;
  joins: number;
  events: number;
  blocked: number;
}

/** Một ngày trong tuần (mốc = 00:00 giờ VN của ngày đó). */
export interface DayBucket {
  dayStart: number;
  joins: number;
  blocked: number;
}

/**
 * Nhịp 24 giờ của hôm nay + 7 ngày gần nhất (A6 — "heat theo giờ" và "ngày
 * nhận đông nhất"). Hàm thuần để test, giống `summarize`.
 *
 * Vì sao cần: chủ server muốn biết RẤT HAY TẤN CÔNG lúc nào (bật chống nuke
 * đúng giờ) và ngày nào server đông nhất. Tổng số "hôm nay 120 người vào"
 * không trả lời được câu hỏi đó.
 *
 * `dayStart` phải là mốc 00:00 giờ VN (xem `startOfDayVietnam`) — ô giờ tính
 * theo giờ VN nên số liệu khớp với con số "Tính từ 00:00 hôm nay theo giờ
 * Việt Nam" mà trang Thống kê đang ghi.
 */
export function hourlyProfile(
  events: StatEvent[],
  joins: StatJoin[],
  dayStart: number,
): HourBucket[] {
  const buckets: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    joins: 0,
    events: 0,
    blocked: 0,
  }));
  const hourOf = (ts: number) => {
    const h = Math.floor((ts - dayStart) / 3_600_000);
    return h >= 0 && h < 24 ? h : -1;
  };
  for (const e of events) {
    const h = hourOf(e.createdAt);
    if (h < 0) continue;
    buckets[h].events += 1;
    buckets[h].blocked += e.count || 0;
  }
  for (const j of joins) {
    const h = hourOf(j.createdAt);
    if (h < 0) continue;
    buckets[h].joins += 1;
  }
  return buckets;
}

/** 7 ngày VN gần nhất (cũ nhất trước), số người vào + lượt chặn theo ngày. */
export function weeklyProfile(events: StatEvent[], joins: StatJoin[], now: number): DayBucket[] {
  const today = startOfDayVietnam(now);
  const out: DayBucket[] = Array.from({ length: 7 }, (_, i) => ({
    dayStart: today - i * 86_400_000,
    joins: 0,
    blocked: 0,
  }));
  const indexOf = (ts: number) => {
    const d = Math.round((today - startOfDayVietnam(ts)) / 86_400_000);
    return d >= 0 && d < 7 ? d : -1;
  };
  for (const e of events) {
    const d = indexOf(e.createdAt);
    if (d >= 0) out[d].blocked += e.count || 0;
  }
  for (const j of joins) {
    const d = indexOf(j.createdAt);
    if (d >= 0) out[d].joins += 1;
  }
  return out.reverse(); // cũ nhất trước
}

/**
 * Số liệu "Tình hình server" hôm nay (quản lý server — manager-gated).
 *
 * Khoảng đọc 7 ngày rồi lọc theo ngày VN ở `summarize` — cần dự phòng vì
 * index theo ngày VN không tồn tại (và thêm index chỉ để báo cáo là quá đắt).
 */
export const todaySummary = query({
  args: { token: v.string(), guildId: v.string() },
  handler: async (ctx, { token, guildId }) => {
    const user = await getUserByToken(ctx, token);
    if (!user) return null;
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild || !canManageGuild(user, guild)) return null;

    const now = Date.now();
    const dayStart = startOfDayVietnam(now);
    const weekAgo = now - 7 * 86_400_000;
    const [events, joins] = await Promise.all([
      ctx.db
        .query("antinukeEvents")
        .withIndex("by_guildId_createdAt", (q) =>
          q.eq("guildId", guildId).gte("createdAt", weekAgo),
        )
        .order("desc")
        .take(1000),
      ctx.db
        .query("memberJoins")
        .withIndex("by_guildId_joinedAt", (q) => q.eq("guildId", guildId).gte("joinedAt", weekAgo))
        .order("desc")
        .take(1000),
    ]);

    // Field nằm thẳng trên document guild (xem convex/guilds.ts:500), không
    // phải trong `settings` — nếu sai chỗ này luôn rơi về 70 im lặng.
    const maxRisk = Number(guild.altMaxRiskScore ?? 70);
    const statEvents = events.map((e) => ({
      module: e.module,
      action: e.action,
      count: e.count,
      createdAt: e.createdAt,
      punish: e.punish,
    }));
    const statJoins = joins.map((j) => ({
      createdAt: j.joinedAt,
      riskScore: j.riskScore,
      action: j.action ?? null,
      riskFactors: j.riskFactors,
    }));
    return {
      ...summarize(statEvents, statJoins, dayStart, Number.isFinite(maxRisk) ? maxRisk : 70),
      /** Mốc bắt đầu ngày VN — UI hiện "tính từ HH:MM giờ VN" cho minh bạch. */
      dayStart,
      hourly: hourlyProfile(statEvents, statJoins, dayStart),
      weekly: weeklyProfile(statEvents, statJoins, now),
    };
  },
});
