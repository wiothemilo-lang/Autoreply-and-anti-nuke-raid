/**
 * Incidents — gom sự kiện rời rạc thành "sự cố" đọc được.
 *
 * Vì sao có: `antinukeEvents` + `modActions` là bảng GHI TỪNG SỰ KIỆN. Một
 * đợt raid 200 người tạo hàng chục dòng gần như trùng nhau; chủ server phải tự
 * đếm, tự đoán bao nhiêu "con" thì thuộc cùng một lần. Trang lịch sử buộc họ
 * đọc thô. Ở đây mỗi cụm trong 15 phút thành MỘT sự cố: số lần bị chặn,
 * thành viên liên quan, và cờ "đã xử lý" để không phải nhớ.
 *
 * Nguyên tắc:
 *  - CHỈ ĐỌC dữ liệu đã có, không sinh bản ghi mới cho sự kiện (nguồn sự thật
 *    vẫn là antinukeEvents/modActions). Bảng duy nhất mới là `incidentMarks`:
 *    dấu "đã xử lý", theo khoá tất định để bấm hai lần vẫn là một dòng.
 *  - Cửa sổ 15 phút TÍNH TỪ SỰ KIỆN ĐẦU của cụm, không phải chia đều theo
 *    giờ: raid kéo 40 phút vẫn là một sự cố, hai đợt cách nhau 20 phút thì
 *    là hai sự cố.
 */

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getUserByToken, canManageGuild } from "./auth";

/** Cửa sổ gom cụm (ms). 15 phút: đủ gom một đợt raid, đủ tách hai lần vi phạm. */
export const INCIDENT_WINDOW_MS = 15 * 60_000;

/** Một dòng sự kiện đã chuẩn hoá từ nhiều bảng về cùng hình dạng. */
export interface RawIncidentEvent {
  kind: "antinuke" | "modaction";
  /** Nhóm hành vi: antinuke = module, modaction = action. */
  module: string;
  action: string;
  createdAt: number;
  executorId?: string;
  executorName?: string;
  targetId?: string;
  targetName?: string;
  /** Số "đơn vị" bị chặn (antinuke có `count`; modaction tính 1). */
  count: number;
  punish?: string;
  reason?: string;
}

export interface Incident {
  /** Khoá tất định: gom cụm + người gây ra. Dùng để đánh dấu đã xử lý. */
  key: string;
  kind: "antinuke" | "modaction";
  module: string;
  action: string;
  firstAt: number;
  lastAt: number;
  /** Số dòng sự kiện gộp lại. */
  events: number;
  /** Tổng số "đơn vị" bị chặn (raid chặn 200 người = 200, không phải 1). */
  blocked: number;
  executors: { id?: string; name?: string }[];
  targets: { id?: string; name?: string }[];
  punish?: string;
}

/**
 * Gom sự kiện thành sự cố. HÀM THUẦN — không đụng Convex, không DB, không mạng
 * — để test được trực tiếp bằng dữ liệu giả.
 *
 * Sắp xếp theo thời gian tăng dần trước: dữ liệu vào đã DESC từ index, hàm
 * không tự sắp lại để giữ hành vi rõ ràng với người đọc.
 */
export function groupIntoIncidents(
  events: RawIncidentEvent[],
  windowMs: number = INCIDENT_WINDOW_MS,
): Incident[] {
  const out: Incident[] = [];
  let cur: Incident | null = null;

  const fits = (e: RawIncidentEvent) =>
    !!cur &&
    cur.kind === e.kind &&
    cur.module === e.module &&
    // Không có executorId thì KHÔNG gom: gom mọi sự kiện vô danh vào một cụm
    // sẽ tạo ra "sự cố" nghĩa vô. Thà hai sự cố riêng còn hơn gộp sai.
    !!e.executorId &&
    cur.executors[0]?.id === e.executorId &&
    e.createdAt - cur.lastAt <= windowMs;

  for (const e of events) {
    // Biến cục bộ thay vì `cur` để TypeScript thu hẹp kiểu: sau nhánh else
    // chắc chắn `cur` khác null, nhưng `cur` khai báo ngoài vòng lặp thì tsc
    // không tự hiểu (nó có thể bị gán null giữa các lần lặp).
    const merged = cur && fits(e) ? cur : null;
    const inc: Incident = merged ?? {
      key: "",
      kind: e.kind,
      module: e.module,
      action: e.action,
      firstAt: e.createdAt,
      lastAt: e.createdAt,
      events: 1,
      blocked: e.count,
      executors: [{ id: e.executorId, name: e.executorName }],
      targets: [],
      punish: e.punish,
    };
    if (merged) {
      inc.events += 1;
      inc.lastAt = e.createdAt;
      inc.blocked += e.count;
      // Tên có thể đổi giữa cụm — chỉ giữ tên nếu cụm chưa có.
      if (e.executorName && !inc.executors[0]?.name) inc.executors[0].name = e.executorName;
    } else {
      out.push(inc);
    }
    if (e.targetId || e.targetName) {
      const t = { id: e.targetId, name: e.targetName };
      if (!inc.targets.some((x) => x.id === t.id && x.name === t.name)) inc.targets.push(t);
    }
    cur = inc;
  }

  // Khoá tất định: loại + hành vi + thời điểm mở đầu. Không có thời điểm
  // đầu thì hai sự cố khác nhau sẽ trùng khoá và ghi đè nhau.
  for (const inc of out) inc.key = `${inc.kind}:${inc.module}:${inc.firstAt}`;
  return out;
}

/** Sự cố của 1 server, mới nhất trước (quản lý server — manager-gated). */
export const listForGuild = query({
  args: {
    token: v.string(),
    guildId: v.string(),
    /** Số sự cố tối đa trả về. */
    limit: v.optional(v.number()),
    /** Chỉ lấy sự kiện từ mốc này trở đi (ms). */
    since: v.optional(v.number()),
  },
  handler: async (ctx, { token, guildId, limit, since }) => {
    const user = await getUserByToken(ctx, token);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!canManageGuild(user, guild)) return null;

    // Sự cố là khái niệm "gần đây" — mặc định 14 ngày. Lấy cả hai bảng, đổi
    // về cùng hình dạng rồi gom; không cần bảng riêng cho "incident".
    const from = since ?? Date.now() - 14 * 24 * 60 * 60_000;
    const [nuke, mods] = await Promise.all([
      ctx.db
        .query("antinukeEvents")
        .withIndex("by_guildId_createdAt", (q) => q.eq("guildId", guildId).gte("createdAt", from))
        .order("desc")
        .take(500),
      ctx.db
        .query("modActions")
        .withIndex("by_guildId_createdAt", (q) => q.eq("guildId", guildId).gte("createdAt", from))
        .order("desc")
        .take(500),
    ]);

    const events: RawIncidentEvent[] = [
      ...nuke.map((e) => ({
        kind: "antinuke" as const,
        module: e.module,
        action: e.action,
        createdAt: e.createdAt,
        executorId: e.executorId ?? undefined,
        executorName: e.executorName ?? undefined,
        count: e.count,
        punish: e.punish,
      })),
      ...mods.map((m) => ({
        kind: "modaction" as const,
        module: m.action,
        action: m.action,
        createdAt: m.createdAt,
        executorId: m.executorId ?? undefined,
        executorName: m.executorName ?? undefined,
        targetId: m.targetId ?? undefined,
        targetName: m.targetName ?? undefined,
        count: 1,
        reason: m.reason ?? undefined,
      })),
    ];
    events.sort((a, b) => a.createdAt - b.createdAt);

    const incidents = groupIntoIncidents(events);
    // Mới nhất trước — người dùng muốn xem chuyện vừa xảy ra trước.
    incidents.reverse();
    const top = incidents.slice(0, Math.min(limit ?? 50, 200));

    // Gắn cờ "đã xử lý" — chỉ tra đúng các khoá SẮP TRẢ VỀ (≤200), không
    // collect toàn bộ dấu của server. Bảng dấu không có retention nên collect
    // từng tăng vô hạn theo lịch sử server.
    const marks = await Promise.all(
      top.map((inc) =>
        ctx.db
          .query("incidentMarks")
          .withIndex("by_guildId_key", (q) => q.eq("guildId", guildId).eq("incidentKey", inc.key))
          .first(),
      ),
    );
    const done = new Set(marks.filter((m) => m !== null).map((m) => m!.incidentKey));
    return top.map((inc) => ({ ...inc, resolved: done.has(inc.key) }));
  },
});

/** Đánh dấu / bỏ đánh dấu một sự cố đã xử lý (quản lý server — manager-gated). */
export const setResolved = mutation({
  args: {
    token: v.string(),
    guildId: v.string(),
    incidentKey: v.string(),
    resolved: v.boolean(),
  },
  handler: async (ctx, { token, guildId, incidentKey, resolved }) => {
    const user = await getUserByToken(ctx, token);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!canManageGuild(user, guild)) return { ok: false };
    if (!user) return { ok: false };

    const existing = await ctx.db
      .query("incidentMarks")
      .withIndex("by_guildId_key", (q) => q.eq("guildId", guildId).eq("incidentKey", incidentKey))
      .first();

    if (!resolved) {
      if (existing) await ctx.db.delete(existing._id);
      return { ok: true, resolved: false };
    }
    if (existing) {
      await ctx.db.patch(existing._id, { resolvedAt: Date.now() });
      return { ok: true, resolved: true };
    }
    await ctx.db.insert("incidentMarks", {
      guildId,
      incidentKey,
      resolvedAt: Date.now(),
      executorId: user.discordId,
      executorName: user.username,
    });
    return { ok: true, resolved: true };
  },
});
