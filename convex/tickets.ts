/**
 * convex/tickets.ts — DỮ LIỆU PHÍA WEB cho tính năng ticket / khiếu nại.
 *
 * Phạm vi file này CHỈ là phía dashboard (đọc danh sách + đóng ticket từ web).
 * Phía bot tạo kênh / bấm nút nằm ở `bot/src/handlers/tickets.js` và ghi qua
 * `bot_writes:botOpenTicket` / `bot_writes:botCloseTicket`.
 *
 * Vì sao tách khỏi `guilds.ts`: `guilds.ts` đã 1800+ dòng và là file cấu
 * hình. Ticket có vòng đời riêng, cần index riêng, tách ra để không làm file
 * cấu hình phình thêm.
 *
 * ⚠️ Luật chung của mọi mutation ở đây: `canManageGuild` + ghi
 * `settingsChangedAt` khi đụng cấu hình. Cổng `check-settings-signal.cjs` và
 * `check-convex-contract.cjs` canh hai chỗ này.
 */

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { action, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { canManageGuild, getUserByToken } from "./auth";
import { requireBotKeyStrict } from "./botAuth";

/** Số ticket tối đa trả về cho dashboard (đủ dùng, không kéo hết DB). */
const LIST_LIMIT = 100;

/** Trần số bản ghi quét cho số liệu SLA (một cửa sổ 90 ngày đã là rất nhiều). */
const STAT_LIMIT = 5_000;

/** Trạng thái ticket hợp lệ. Mọi giá trị khác coi như "không lọc". */
const STATUSES = new Set(["open", "closed", "locked"]);

/**
 * Sắp theo `createdAt` GIẢM DẦN.
 *
 * ⚠️ Không dựa vào `order("desc")` của Convex: `order` chỉ đảo thứ tự theo
 * field CUỐI của index. Index `by_guildId_status` có field cuối là `status` —
 * sau khi `eq("status", ...)` thì field đó CỐ ĐỊNH cho mọi bản ghi trong kết
 * quả, nên `order("desc")` là lời hứa rỗng: trả về đúng thứ tự scan thẳng.
 * Hậu quả đã thấy trong test: danh sách dashboard lệch thứ tự, cooldown tính
 * nhầm (phạt oan), và "bạn đã có ticket mở" bị bypass. Sắp ở đây thì đúng với
 * mọi index, kể cả khi sau này đổi index.
 */
function newestFirst<T extends { createdAt?: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

/**
 * Danh sách ticket của 1 server, mới nhất trước.
 *
 * `status` lọc tuỳ chọn: bỏ trống = tất cả (dashboard hiện cả 2 tab
 * "đang mở" và "đã đóng"). Chỉ "open" thì dùng index `by_guildId_status` —
 * không quét toàn bảng.
 */
export const listTickets = query({
  args: {
    token: v.string(),
    guildId: v.string(),
    /** "open" | "closed" | "locked" — bỏ trống lấy tất cả. */
    status: v.optional(v.string()),
  },
  handler: async (ctx, { token, guildId, status }) => {
    const user = await getUserByToken(ctx, token);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild || !canManageGuild(user, guild))
      throw new Error("Không có quyền quản lý server này");

    // `status` lạ (bộ lọc cũ còn sót, gõ tay) → coi như không lọc. Trả rỗng
    // sẽ khiến dashboard hiện "không có ticket nào" một cách sai lệch.
    const filter = status && STATUSES.has(status) ? (status as "open" | "closed" | "locked") : null;
    // ⚠️ Cắt (take) SAU khi đã sắp trong DB, không phải trước.
    // Index 2 field (`by_guildId_status`) scan theo `status` cố định rồi tới
    // document id → `take(100)` trả về 100 bản ghi CŨ nhất rồi `newestFirst`
    // mới sắp lại, tức ticket MỚI NHẤT không bao giờ hiện trên dashboard khi
    // server đã có hơn 100 ticket cùng trạng thái (lỗi thật 28/09/2026).
    // Index 3 field `by_guildId_status_createdAt` có `createdAt` ở CUỐI nên
    // `order("desc")` lần này là lời hứa có thật: cắt 100 bản ghi ĐÚNG là 100
    // ticket mới nhất.
    const rows = filter
      ? await ctx.db
          .query("tickets")
          .withIndex("by_guildId_status_createdAt", (q) =>
            q.eq("guildId", guildId).eq("status", filter),
          )
          .order("desc")
          .take(LIST_LIMIT)
      : await ctx.db
          .query("tickets")
          .withIndex("by_guildId_createdAt", (q) => q.eq("guildId", guildId))
          .order("desc")
          .take(LIST_LIMIT);

    return newestFirst(rows).map((t) => ({
      id: t._id,
      number: t.number ?? 0,
      channelId: t.channelId,
      kind: t.kind,
      openerId: t.openerId,
      openerName: t.openerName,
      body: t.body ?? "",
      evidence: t.evidence ?? "",
      // Ô nhập bổ sung của chủ server (29/09/2026). Trả kèm nhãn ô để staff
      // đọc được "Số tiền: 250.000đ" thay vì 3 dòng vô danh.
      fields: t.fields ?? [],
      source: t.source,
      status: t.status,
      closedByName: t.closedByName ?? null,
      closeReason: t.closeReason ?? null,
      unbanned: t.unbanned ?? false,
      openError: t.openError ?? null,
      createdAt: t.createdAt,
      closedAt: t.closedAt ?? null,
      claimedById: t.claimedById ?? null,
      claimedByName: t.claimedByName ?? null,
      lastActivityAt: t.lastActivityAt ?? t.createdAt,
      hasTranscript: !!t.transcriptStorageId,
      transcriptAt: t.transcriptAt ?? null,
    }));
  },
});

/**
 * Số liệu tóm tắt cho badge trên menu.
 *
 * Tách khỏi `listTickets` vì menu gọi nó mỗi lần render còn danh sách chỉ gọi
 * khi mở panel. Trả luôn `ticketsCategoryId` + `ticketsMissingPerm` để menu
 * không phải gọi thêm 1 query chỉ để biết cấu hình còn thiếu gì.
 */
export const ticketSummary = query({
  args: { token: v.string(), guildId: v.string() },
  handler: async (ctx, { token, guildId }) => {
    const user = await getUserByToken(ctx, token);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild || !canManageGuild(user, guild))
      throw new Error("Không có quyền quản lý server này");

    const open = await ctx.db
      .query("tickets")
      .withIndex("by_guildId_status", (q) => q.eq("guildId", guildId).eq("status", "open"))
      .take(1_000);
    return {
      openCount: open.length,
      enabled: guild.ticketEnabled ?? false,
      /** Category chưa chọn → panel báo rõ thay vì bấm mới thấy lỗi. */
      missingCategory: !guild.ticketCategoryId,
      /** Role staff chưa chọn (rỗng thì bot lấy `modRoles` — vẫn chạy được). */
      staffRoleId: guild.ticketStaffRoleId ?? null,
      dmOnBan: guild.ticketDmOnBan ?? true,
      maxOpen: guild.ticketMaxOpen ?? 20,
      cooldownHours: guild.ticketCooldownHours ?? 24,
      defaultKind: guild.ticketDefaultKind ?? "support",
      /** 0 = tắt tự đóng. Panel hiển rõ đang nhắp ngưỗi chọn để tắt. */
      idleHours: guild.ticketIdleHours ?? 24,
      closeGraceHours: guild.ticketCloseGraceHours ?? 24,
      panelText: guild.ticketPanelText ?? "",
      pingRoleIds: guild.ticketPingRoleIds ?? [],
    };
  },
});

/**
 * SỐ LIỆU SLA trong khoảng `days` ngày gần nhất.
 *
 * Vì sao cần: trước đây dashboard chỉ cho xem TỪNG ticket, không trả lời
 * được câu hỏi duy nhất chủ server quan tâm — "nhân viên có phản hồi kịp
 * không?" Tín hiệu để biết khi nào phải thúc hoặc thêm người.
 *
 * Mốc đo (đều lấy từ field đã có sẵn trong bản ghi, không thêm schema):
 *   - `firstResponseMs` = `claimedAt - createdAt`: staff bấm "Nhận việc".
 *     Đây là phản hồi đầu TIÊN chắc chắn có người nhận trách nhiệm, đo được
 *     ngay cả khi ticket bị auto-close.
 *   - `resolutionMs` = `closedAt - createdAt`: thời gian tới khi đóng.
 *   - `unclaimedClosed` = ticket đã đóng mà KHÔNG ai bấm nhận — tỉ lệ này
 *     mới chỉ ra chất lượng phục vụ, không phải số lượng.
 *   - `unbanRate` = tỉ lệ khiếu nại kết thúc bằng việc gỡ ban, tính trên
 *     RIÊNG nhóm khiếu nại (ticket hỗ trợ gỡ ban là chuyện khác).
 *
 * Mọi trung bình trả `null` khi mẫu bằng 0 — dashboard hiện "chưa đủ dữ liệu"
 * thay vì số 0 phút (0 phút là một lời nói dối).
 */
export const ticketStats = query({
  args: {
    token: v.string(),
    guildId: v.string(),
    /** Cửa sổ thống kê. Chặn 1..90 để không quét cả lịch sử server. */
    days: v.optional(v.number()),
  },
  handler: async (ctx, { token, guildId, days }) => {
    const user = await getUserByToken(ctx, token);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!user || !guild || !canManageGuild(user, guild))
      throw new Error("Không có quyền quản lý server này");

    const windowDays = Math.min(Math.max(Math.floor(days ?? 30), 1), 90);
    const since = Date.now() - windowDays * 86_400_000;
    // Index `by_guildId_createdAt` tạo range theo createdAt → chỉ quét ticket
    // trong cửa sổ, không kéo cả lịch sử của server.
    const rows = await ctx.db
      .query("tickets")
      .withIndex("by_guildId_createdAt", (q) => q.eq("guildId", guildId).gte("createdAt", since))
      .take(STAT_LIMIT);

    let open = 0;
    let closed = 0;
    let unclaimedClosed = 0;
    let appeals = 0;
    let appealsUnbanned = 0;
    const firstResponse: number[] = [];
    const resolution: number[] = [];
    for (const t of rows) {
      if (t.status === "open") open++;
      else closed++;
      if (t.claimedAt && t.claimedAt > t.createdAt) firstResponse.push(t.claimedAt - t.createdAt);
      if (t.closedAt && t.closedAt > t.createdAt) resolution.push(t.closedAt - t.createdAt);
      if (t.status !== "open" && !t.claimedAt) unclaimedClosed++;
      if (t.kind === "appeal") {
        appeals++;
        if (t.unbanned) appealsUnbanned++;
      }
    }
    const avg = (xs: number[]) =>
      xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
    return {
      days: windowDays,
      since,
      total: rows.length,
      open,
      closed,
      /** Trả về đủ mẫu thì mới có trung bình — UI tự hiện "chưa đủ dữ liệu". */
      avgFirstResponseMs: avg(firstResponse),
      firstResponseCount: firstResponse.length,
      avgResolutionMs: avg(resolution),
      resolutionCount: resolution.length,
      unclaimedClosed,
      appeals,
      appealsUnbanned,
      /** 0..1, null khi không có khiếu nại nào trong kỳ. */
      unbanRate: appeals ? appealsUnbanned / appeals : null,
    };
  },
});

/**
 * Đóng ticket TỪ DASHBOARD.
 *
 * Vì sao cần: staff không phải lúc nào cũng ở trong Discord. Đóng ở đây chỉ
 * đổi trạng thái trong DB; bot KHÔNG tự thu quyền kênh Discord (không có
 * sự kiện để biết web vừa đóng, và job tick chỉ XOÁ kênh ở lượt dọn sau
 * closeGraceHours). Hệ quả: sau khi đóng ở đây, kênh vẫn giữ tên cũ và quyền
 * cũ cho tới lúc bị dọn. Muốn khoá ngay thì bấm nút trong kênh ticket —
 * handler cho phép thao tác cả khi bản ghi đã `closed`.
 *
 * Không sửa nội dung ticket. Không gỡ ban ở đây (việc đó cần quyền Discord,
 * chỉ bot làm được) — bảo đảm nút Gỡ ban trong kênh ticket vẫn là đường duy
 * nhất để gỡ ban, và nó đi qua `unbanMember` nên vòng đo phạt nhầm vẫn chạy.
 */
export const closeTicket = mutation({
  args: {
    token: v.string(),
    guildId: v.string(),
    ticketId: v.id("tickets"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { token, guildId, ticketId, reason }) => {
    const user = await getUserByToken(ctx, token);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    // `canManageGuild` đã trả false khi user null, nhưng TypeScript không suy ra
    // được — nên kiểm riêng cho chắc trước khi đọc `user.discordId` bên dưới.
    if (!user || !guild || !canManageGuild(user, guild))
      throw new Error("Không có quyền quản lý server này");

    const ticket = await ctx.db.get(ticketId);
    if (!ticket || ticket.guildId !== guildId) throw new Error("Không tìm thấy ticket");
    if (ticket.status !== "open") return { ok: true, alreadyClosed: true };

    const now = Date.now();
    await ctx.db.patch(ticketId, {
      status: "closed",
      closedById: user.discordId,
      closedByName: user.username,
      closeReason: reason ? reason.slice(0, 300) : undefined,
      closedAt: now,
    });
    return { ok: true, alreadyClosed: false };
  },
});

/**
 * BOT đọc trạng thái ticket trước khi quyết định cho phép mở.
 *
 * Vì sao cần query riêng thay vì để bot tự đếm: `ticketCore.decideOpen` là
 * HÀM THUẦN (test hermetic, không I/O), nên nó chỉ nhận số liệu đã đếm sẵn.
 * Việc đếm đặt ở đây → hai bên kiểm chứng độc lập: quyết định "có cho mở
 * không" test được, và số đếm thật do index lo.
 *
 * Trả về:
 *   - `openCount` — số ticket đang mở (hàng rào `ticketMaxOpen`).
 *   - `lastOpenedAt` — lần mở gần nhất CỦA CHÍNH người này (hàng rào cooldown).
 *   - `openChannelId` — ticket đang mở của họ, để báo "bạn đã có ticket".
 *
 * ⚠️ Không đọc qua `getBotConfig`: đây không phải CẤU HÌNH, mà là trạng thái
 * đổi mỗi giây. Nếu nhét vào bundle cache 30 phút thì hàng rào chống spam
 * sẽ đếm trên dữ liệu cũ — tức là vô hiệu. Query riêng luôn đọc tươi.
 */
/**
 * BOT đếm nhanh số ticket đang mở của cả server (không lọc theo người gọi).
 *
 * Vì sao cần query riêng thay vì dùng `ticketSummary`: bản đó xác thực bằng
 * `token` phiên đăng nhập của CHỦ SERVER (người bấm nút trên dashboard) —
 * bot không có token đó. `botTicketState` thì lọc theo `userId` nên không
 * dùng được cho placeholder `{open}` trên panel mở ticket.
 *
 * ⚠️ Đọc tươi (không đi qua `getBotConfig` cache 30 phút): con số này chỉ
 * dùng cho hiển thị, nhưng dán lại từ cache cũ sẽ ra "0 ticket" sai lệch
 * với thực tế. Query riêng giữ panel luôn khớp với DB.
 */
export const botTicketSummary = query({
  args: {
    guildId: v.string(),
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { guildId, botKey }) => {
    await requireBotKeyStrict(ctx, botKey);
    // `.take(1_000)` chứ không `.collect()`: chỉ cần số, không cần cả danh
    // sách. Trần mềm giữ để không kéo hàng nghìn doc khi server bị lạm dụng.
    const open = await ctx.db
      .query("tickets")
      .withIndex("by_guildId_status", (q) => q.eq("guildId", guildId).eq("status", "open"))
      .take(1_000);
    return { openCount: open.length };
  },
});

export const botTicketState = query({
  args: {
    guildId: v.string(),
    userId: v.string(),
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { guildId, userId, botKey }) => {
    await requireBotKeyStrict(ctx, botKey);
    const open = await ctx.db
      .query("tickets")
      .withIndex("by_guildId_status", (q) => q.eq("guildId", guildId).eq("status", "open"))
      .collect();
    // ⚠️ KHÔNG dùng `order("desc").take(1)` ở đây: index
    // `by_guildId_openerId` có field cuối `openerId`, mà sau `eq` thì field
    // đó cố định → thứ tự trả về là thứ tự scan, KHÔNG phải mới nhất. Lấy
    // nhầm bản ghi cũ thì cooldown tính sai và vòng "đã có ticket mở" bị
    // bypass (người dùng mở được 2 ticket cùng lúc).
    const mine = newestFirst(
      await ctx.db
        .query("tickets")
        .withIndex("by_guildId_openerId", (q) => q.eq("guildId", guildId).eq("openerId", userId))
        .collect(),
    );
    const last = mine[0];
    // Ticket ĐANG MỞ của riêng người này. Tách khỏi `last`: dữ liệu cũ có thể
    // có nhiều ticket mở, và bản ghi mới nhất đã đóng trong khi bản ghi cũ
    // vẫn mở — lúc đó vẫn phải trả kênh cũ.
    const openTicket = mine.find((t) => t.status === "open");
    return {
      openCount: open.length,
      lastOpenedAt: last?.createdAt ?? null,
      /** Ticket `open` của riêng người này (nếu có) — để báo trả lại kênh cũ. */
      openChannelId: openTicket?.channelId ?? null,
      openTicketId: openTicket?._id ?? null,
    };
  },
});

/**
 * Bot đọc 1 bản ghi ticket theo id (dùng khi staff bấm nút trong kênh).
 *
 * Vì sao cần, và vì sao không suy ra từ kênh: kênh Discord không giữ id người
 * mở ticket, tên kênh thì staff có thể đổi tay, còn nút có thể bị dán lại vào
 * kênh khác. Bản ghi DB là nguồn duy nhất đáng tin — đặc biệt với nút
 * "Gỡ ban", nơi đọc nhầm người là hành động phạt nặng.
 *
 * Chỉ trả về đúng những trường nút cần — không trả `body` vì không có chỗ nào
 * dùng và nội dung khiếu nại không cần thiết phải đọc lại mỗi lượt bấm.
 */
export const botTicketById = query({
  args: {
    guildId: v.string(),
    ticketId: v.string(),
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { guildId, ticketId, botKey }) => {
    await requireBotKeyStrict(ctx, botKey);
    // `normalizeId` xác nhận chuỗi đúng định dạng id của bảng `tickets` (sai →
    // null) rồi `get` đọc ĐÚNG 1 document. Bản cũ `collect()` toàn bộ ticket của
    // guild rồi tự `.find` ở MỖI lần staff bấm nút trong kênh ticket. Vẫn kiểm
    // `guildId` vì nút có thể bị dán sang kênh của guild khác.
    const id = ctx.db.normalizeId("tickets", ticketId);
    const ticket = id ? await ctx.db.get(id) : null;
    if (!ticket || ticket.guildId !== guildId) return null;
    return {
      openerId: ticket.openerId,
      openerName: ticket.openerName,
      kind: ticket.kind,
      status: ticket.status,
    };
  },
});

/**
 * NỘI DUNG transcript để hiển thị ngay trong panel.
 *
 * ⚠️ Phải là ACTION chứ không phải query: `ctx.storage.get` chỉ có trong
 * mutation; query chỉ lấy được link có hạn. Action gọi lại chính
 * `ticketTranscriptUrl` (nơi kiểm quyền) để lấy link rồi tải về parse.
 *
 * Không cắt bớt ở đây: bot đã cắt 1500 ký tự/tin lúc lưu. Cắt thêm lần hai
 * thì panel hiện khác với file tải về, staff đối chiếu lại sẽ bối rồi.
 */
export const ticketTranscript = action({
  args: { token: v.string(), guildId: v.string(), ticketId: v.string() },
  handler: async (ctx, args) => {
    // Chính query này kiểm quyền (canManageGuild) + trả link có hạn.
    const meta = (await ctx.runQuery(api.tickets.ticketTranscriptUrl, args)) as {
      url: string | null;
      at: number | null;
    } | null;
    if (!meta?.url) return null;
    // TRẦN THỜI GIAN (đợt #3): trước đây `fetch` KHÔNG có signal nên nếu kho lưu
    // trữ treo, action này giữ kết nối tới trần của Convex và dashboard quay vô
    // hạn — người dùng không biết là đang chờ hay đã hỏng.
    const res = await fetch(meta.url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const parsed = (await res.json()) as {
      channelName?: string;
      savedAt?: number;
      messageCount?: number;
      messages?: {
        at: number;
        author: string;
        content: string;
        attachments?: string[];
      }[];
    };
    return {
      channelName: parsed.channelName ?? "",
      savedAt: parsed.savedAt ?? meta.at ?? 0,
      messageCount: parsed.messageCount ?? parsed.messages?.length ?? 0,
      messages: (parsed.messages ?? []).map((m) => ({
        at: m.at ?? 0,
        author: m.author ?? "?",
        content: m.content ?? "",
        attachments: m.attachments ?? [],
      })),
    };
  },
});

/**
 * Trả link tải transcript (nút "Tải transcript" trên panel).
 *
 * Trả `null` thay vì ném khi chưa lưu — panel gọi lúc render, ném ở đây sẽ
 * làm hỏng cả panel chứ không chỉ ô transcript.
 */
export const ticketTranscriptUrl = query({
  args: { token: v.string(), guildId: v.string(), ticketId: v.string() },
  handler: async (ctx, { token, guildId, ticketId }) => {
    const user = await getUserByToken(ctx, token);
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discordId", (q) => q.eq("discordId", guildId))
      .first();
    if (!guild || !canManageGuild(user, guild))
      throw new Error("Không có quyền quản lý server này");
    const ticket = await ctx.db.get(ticketId as Id<"tickets">);
    if (!ticket || ticket.guildId !== guildId) return { url: null, at: null };
    if (!ticket.transcriptStorageId) return { url: null, at: ticket.transcriptAt ?? null };
    const url = await ctx.storage.getUrl(ticket.transcriptStorageId).catch(() => null);
    return { url, at: ticket.transcriptAt ?? null };
  },
});
