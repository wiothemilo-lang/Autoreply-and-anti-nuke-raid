/**
 * convex/dataExport.ts — XUẤT DỮ LIỆU (CSV) cho chủ server (P2–P3, 10/10/2026).
 *
 * Vì sao tách file riêng: đây là mặt ĐỌC DUY NHẤT trả dữ liệu thô ra khỏi hệ
 * thống. Nó phải trả lời hai câu hỏi mà các panel không trả lời được: "tôi lấy
 * được dữ liệu của mình ra không?" và "lấy ra được bao nhiêu, xa tới đâu?".
 *
 * HẠN MỨC NẰM Ở ĐÂY, KHÔNG Ở UI: `exportRows` (số dòng mỗi lượt) và `exportDays`
 * (cửa sổ ngày) đọc từ `convex/plans.ts` — cùng bảng mà mọi điểm chặn khác dùng,
 * nên /premium không thể hứa khác hành vi thật. Ẩn nút trên web không phải là
 * bảo vệ: gọi API trực tiếp cũng bị cắt đúng trần đó (`.take(cap + 1)` để biết
 * mình vừa bị cắt chứ không im lặng trả về ít hơn).
 *
 * Bảo vệ CSV: (1) ô chứa dấu phẩy/nháy/xuống dòng được bọc và nhân đôi nháy dấu;
 * (2) ô bắt đầu bằng `= + - @` được ghép thêm `'` — nếu không, mở file bằng
 * Excel/Sheets là công thức trong tên thành viên ĐƯỢC THI HÀNH (CSV injection);
 * (3) tên người dùng/chi tiết cắt theo trần ký tự để một bản ghi rác không thổi
 * phồng payload.
 */
import { v } from "convex/values";
import { query } from "./_generated/server";
import { canManageGuild, getUserByToken } from "./auth";
import { planForGuild, planLimits } from "./plans";

const DAY_MS = 86_400_000;
/** Trần ký tự mỗi ô chữ tự do (tên, lý do, chi tiết) — chặn bản ghi rác. */
const MAX_CELL_CHARS = 300;

/** Loại dữ liệu xuất được. Thêm loại mới = thêm nhánh ở `buildRows`. */
export const EXPORT_KINDS = ["modActions", "events", "heat"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

/**
 * Một ô CSV an toàn: chuẩn hoá kiểu → chuỗi, cắt độ dài, vô hiệu công thức, và
 * bọc nháy khi cần. Cố ý KHÔNG dùng `JSON.stringify` (ra nháy kép JSON, Excel
 * đọc thành chuỗi có nháy).
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (s.length > MAX_CELL_CHARS) s = `${s.slice(0, MAX_CELL_CHARS)}…`;
  // `=1+1`, `+HYPERLINK(...)`, `-2+3`, `@SUM(...)` đều là công thức khi mở bằng
  // bảng tính → ghép `'` để Excel/Sheets coi là chữ.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Ghép CSV kiểu Excel: CRLF (Excel trên Windows nhận đúng), không BOM. */
export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

async function buildRows(
  ctx: Parameters<typeof getUserByToken>[0],
  guildId: string,
  kind: ExportKind,
  since: number,
  cap: number,
): Promise<{ header: string[]; rows: unknown[][]; truncated: boolean }> {
  // take(cap + 1): thêm 1 dòng chỉ để biết "còn nữa" — thiếu nó thì người dùng
  // nhận file 100 dòng và tưởng đó là toàn bộ lịch sử.
  if (kind === "modActions") {
    const docs = await ctx.db
      .query("modActions")
      .withIndex("by_guildId_createdAt", (q) => q.eq("guildId", guildId).gte("createdAt", since))
      .order("desc")
      .take(cap + 1);
    return {
      header: [
        "Thời gian (UTC+0)",
        "Case",
        "Hành động",
        "Đối tượng",
        "ID đối tượng",
        "Người thực hiện",
        "Lý do",
        "Chi tiết",
      ],
      rows: docs.map((a) => [
        new Date(a.createdAt).toISOString(),
        a.caseNumber ?? "",
        a.action,
        a.targetName ?? "",
        a.targetId ?? "",
        a.executorName ?? a.executorId ?? "",
        a.reason ?? "",
        a.details ?? "",
      ]),
      truncated: docs.length > cap,
    };
  }

  if (kind === "events") {
    const docs = await ctx.db
      .query("antinukeEvents")
      .withIndex("by_guildId_createdAt", (q) => q.eq("guildId", guildId).gte("createdAt", since))
      .order("desc")
      .take(cap + 1);
    return {
      header: [
        "Thời gian (UTC+0)",
        "Module",
        "Hành động phát hiện",
        "Người thực hiện",
        "ID người thực hiện",
        "Số lần",
        "Ngưỡng",
        "Cửa sổ (giây)",
        "Hình phạt",
      ],
      rows: docs.map((e) => [
        new Date(e.createdAt).toISOString(),
        e.module,
        e.action,
        e.executorName ?? "",
        e.executorId ?? "",
        e.count,
        e.threshold,
        e.windowSeconds,
        e.punish,
      ]),
      truncated: docs.length > cap,
    };
  }

  const docs = await ctx.db
    .query("heatStates")
    .withIndex("by_guildId_heat", (q) => q.eq("guildId", guildId))
    .order("desc")
    .take(cap + 1);
  const alive = docs.filter((h) => h.heat > 0 || (h.warnStrikes ?? 0) > 0);
  return {
    header: [
      "Thành viên",
      "ID",
      "Điểm nhiệt",
      "Số lần cảnh báo",
      "Cập nhật cuối (UTC+0)",
      "Ghi chú",
    ],
    rows: alive
      .slice(0, cap)
      .map((h) => [
        h.username,
        h.userId,
        h.heat,
        h.warnStrikes ?? 0,
        new Date(h.updatedAt).toISOString(),
        "",
      ]),
    truncated: alive.length > cap,
  };
}

/**
 * Xuất CSV cho chủ server (manager-gated). Trả `null` khi không quản lý được
 * server — cùng quy ước im lặng như các query dashboard khác (không tiết lộ
 * server có tồn tại hay không).
 */
export const exportGuildCsv = query({
  args: {
    token: v.string(),
    guildId: v.string(),
    kind: v.union(v.literal("modActions"), v.literal("events"), v.literal("heat")),
  },
  handler: async (ctx, { token, guildId, kind }) => {
    const user = await getUserByToken(ctx, token);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild || !canManageGuild(user, guild)) return null;

    const { plan } = await planForGuild(ctx, guildId);
    const limits = planLimits(plan);
    // Gói không có quyền xuất (tương lai) → lỗi NÓI RÕ, không trả file rỗng.
    if (limits.exportRows <= 0) {
      throw new Error(`Gói ${plan} không có quyền xuất dữ liệu. Nâng gói để xuất lịch sử ra CSV.`);
    }

    const now = Date.now();
    const since = now - limits.exportDays * DAY_MS;
    // Bảng nhiệt cũng là dữ liệu, nhưng trần riêng (top N) vì một server có thể
    // có hàng nghìn dòng heat — xuất hết không giúp gì mà chỉ tốn I/O.
    const cap = kind === "heat" ? limits.heatTopRows : limits.exportRows;
    const built = await buildRows(ctx, guildId, kind, since, cap);
    const csv = toCsv(built.header, built.rows);
    const stamp = new Date(now).toISOString().slice(0, 10);

    return {
      kind,
      csv,
      rows: Math.min(built.rows.length, cap),
      truncated: built.truncated,
      plan,
      exportRows: limits.exportRows,
      exportDays: limits.exportDays,
      heatTopRows: limits.heatTopRows,
      since,
      filename: `protogon-${kind}-${guildId}-${stamp}.csv`,
    };
  },
});
