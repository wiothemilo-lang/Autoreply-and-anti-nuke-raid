/**
 * Đợt #5 tách `convex/bot_writes.ts` (75KB) — nhóm TICKET/KHIẾU NẠI: bot mở/
 * đóng ticket, gán/gỡ người nhận, đẩy lùi đồng hồ tự đóng, lưu transcript
 * (bảng `tickets`).
 *
 * Wrapper `export const X = mutation({…})` giữ NGUYÊN trong `convex/bot_writes.ts`
 * để tên function + validator không đổi (hợp đồng bot ⇄ Convex). Thân hàm nằm ở
 * đây — chỉ tách file, không đổi hành vi.
 */
import { v } from "convex/values";
import type { ObjectType } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import { requireBotKeyStrict } from "../botAuth";

/**
 * Tra 1 ticket theo id (chuỗi) mà bot gửi lên — CÓ kiểm guild.
 *
 * Vì sao cần: các mutation ticket trước đây `collect()` TOÀN BỘ ticket của guild
 * rồi tự `.find` chỉ để sửa 1 hàng. Với `botTouchTickets` (chạy MỖI tin nhắn
 * trong kênh ticket) là ~N lượt đọc document (kèm `body` dài) cho mỗi tin nhắn;
 * với các nút staff bấm là N lượt đọc cho mỗi cú bấm — I/O phình theo bình
 * phương số ticket của server. `normalizeId` xác nhận chuỗi đúng định dạng id
 * của bảng `tickets` (sai → null, KHÔNG ném lỗi) rồi `get` đọc đúng 1 document;
 * vẫn kiểm `guildId` nên guild này không đọc/ghi được ticket của guild khác.
 */
async function findGuildTicket(ctx: any, guildId: string, ticketId: string) {
  const id = ctx.db.normalizeId("tickets", ticketId);
  if (!id) return null;
  const ticket = await ctx.db.get(id);
  return ticket && ticket.guildId === guildId ? ticket : null;
}

/**
 * ═══ TICKET / KHIẾU NẠI (27/09/2026) ═══
 *
 * Hai mutation dưới đây là đường GHI duy nhất của ticket từ phía bot. Cùng
 * loại với `botRecordModAction`: cần `requireBotKeyStrict` (chỉ bot có
 * OWNER_SEED mới gọi được) và cắt mọi chuỗi theo giới hạn Discord.
 *
 * ⚠️ KHÔNG thêm `settingsChangedAt` ở đây: hai mutation này KHÔNG ghi field
 * cấu hình mà bot đọc (chúng ghi bảng `tickets`), nên không phải xoá cache
 * config. Cổng `check-settings-signal.cjs` miễn luật A cho mọi mutation
 * trong nhóm file `convex/bot_writes/**` (luật B phủ) — thêm `settingsChangedAt`
 * thừa sẽ chỉ làm cache bị xoá vô nghĩa.
 */

/** Bot ghi bản ghi ticket lúc mở (điểm vào DM hoặc lệnh /ticket). */
export const botOpenTicketArgs = {
  guildId: v.string(),
  channelId: v.string(),
  /** "appeal" | "support" — bot đã chuẩn hoá qua ticketCore.normalizeKind. */
  kind: v.string(),
  openerId: v.string(),
  openerName: v.string(),
  body: v.optional(v.string()),
  evidence: v.optional(v.string()),
  /**
   * Ô nhập bổ sung do chủ server thêm cho loại này (29/09/2026). Lưu kèm
   * nhãn để embed trong kênh + transcript hiện đúng tiêu đề ô.
   */
  fields: v.optional(
    v.array(
      v.object({
        label: v.string(),
        value: v.string(),
      }),
    ),
  ),
  /** "dm" | "command" */
  source: v.string(),
  /** Lỗi mở kênh (thiếu quyền, chạm trần 500 kênh…) — dashboard hiển thị. */
  openError: v.optional(v.string()),
  /** Chìa khóa bot (botAuth). */
  botKey: v.optional(v.string()),
};
export type BotOpenTicketArgs = ObjectType<typeof botOpenTicketArgs>;

export async function botOpenTicketHandler(ctx: MutationCtx, args: BotOpenTicketArgs) {
  await requireBotKeyStrict(ctx, args.botKey);
  const now = Date.now();
  const guild = await ctx.db
    .query("guilds")
    .withIndex("by_discordId", (q) => q.eq("discordId", args.guildId))
    .first();
  // Số thứ tự dùng CHUNG bộ đếm với mod case: một dãy số duy nhất trong
  // kênh log của server, đọc dễ hơn 2 dãy số lệch nhau.
  const number = (guild?.modCaseCounter ?? 0) + 1;
  if (guild) {
    await ctx.db.patch(guild._id, { modCaseCounter: number, updatedAt: now });
  }
  const id = await ctx.db.insert("tickets", {
    guildId: args.guildId,
    number,
    channelId: args.channelId,
    kind: args.kind,
    openerId: args.openerId,
    openerName: args.openerName.slice(0, 80),
    body: args.body ? args.body.slice(0, 1000) : undefined,
    evidence: args.evidence ? args.evidence.slice(0, 500) : undefined,
    // Cắt 3 ô × (nhãn 45 + giá trị 300) — chặn 1 modal gửi nội dung khổng lồ
    // làm phình document. Trần khớp MAX_EXTRA_FIELDS ở ticketKinds.ts.
    fields: args.fields
      ?.filter((f) => String(f?.value ?? "").trim())
      .slice(0, 3)
      .map((f) => ({
        label: String(f.label ?? "").slice(0, 45),
        value: String(f.value).slice(0, 300),
      })),
    source: args.source,
    status: "open",
    openError: args.openError ? args.openError.slice(0, 200) : undefined,
    openErrorAt: args.openError ? now : undefined,
    createdAt: now,
  });
  return { ok: true, ticketId: id, number };
}

/**
 * Bot ghi trạng thái cuối của ticket khi staff bấm nút trong kênh.
 *
 * `status: "closed"` khi staff đóng; `"locked"` dành cho lượt tự dọn kênh ở
 * đợt sau (chưa dùng, nhưng đã khai trong schema để không phải migrate).
 */
export const botCloseTicketArgs = {
  guildId: v.string(),
  /** id bản ghi lấy từ customId của nút (mã hoá sẵn). */
  ticketId: v.string(),
  /** "closed" | "locked" */
  status: v.string(),
  closedById: v.optional(v.string()),
  closedByName: v.optional(v.string()),
  closeReason: v.optional(v.string()),
  /** Staff bấm "Gỡ ban" trong ticket (thống kê dashboard; vòng đo đã chạy ở bot). */
  unbanned: v.optional(v.boolean()),
  botKey: v.optional(v.string()),
};
export type BotCloseTicketArgs = ObjectType<typeof botCloseTicketArgs>;

export async function botCloseTicketHandler(ctx: MutationCtx, args: BotCloseTicketArgs) {
  await requireBotKeyStrict(ctx, args.botKey);
  const row = await ctx.db
    .query("tickets")
    .withIndex("by_guildId", (q) => q.eq("guildId", args.guildId))
    .collect();
  const ticket = row.find((t) => t._id === args.ticketId);
  // Không tìm thấy = ticket đã bị dọn khỏi DB (giới hạn 200 bản/server).
  // Trả ok thay vì ném: người dùng bấm nút trên kênh cũ vẫn không nên thấy lỗi.
  if (!ticket) return { ok: true, found: false };
  const now = Date.now();
  await ctx.db.patch(ticket._id, {
    status: args.status === "locked" ? "locked" : "closed",
    closedById: args.closedById,
    closedByName: args.closedByName ? args.closedByName.slice(0, 80) : undefined,
    closeReason: args.closeReason ? args.closeReason.slice(0, 300) : undefined,
    unbanned: args.unbanned ?? ticket.unbanned,
    closedAt: now,
    // Bot gọi mutation này NGAY SAU khi đã thu quyền + đổi tên kênh →
    // đánh dấu để job tick không thu quyền lần hai. Job "closeChannel" chỉ
    // dành cho ticket đóng từ DASHBOARD (nơi chưa ai đụng kênh).
    ...(args.status === "locked" ? {} : { channelClosedAt: now }),
  });
  return { ok: true, found: true };
}

/**
 * Bot ghi channelId thật + lỗi mở kênh vào bản ghi ticket.
 *
 * Vì sao tách khỏi `botOpenTicket`: số thứ tự ticket lấy từ bộ đếm chung với
 * mod case nên phải ghi bản ghi TRƯỚC khi tạo kênh (để lấy số đặt tên kênh).
 * Nhưng lúc đó chưa có channelId. Thay vì ghi 2 lần trong 1 mutation, tách
 * mutation này ra: `botOpenTicket` ghi với `channelId: "pending"`, xong tạo
 * kênh thì gọi `botSetTicketChannel` để điền lại.
 *
 * Nếu tiện thì có thể gộp — nhưng gộp sẽ mất thông tin "ticket đã mở nhưng
 * tạo kênh hỏng", vốn đúng thứ dashboard cần hiện cho staff.
 */
export const botSetTicketChannelArgs = {
  guildId: v.string(),
  ticketId: v.string(),
  channelId: v.string(),
  /** Lỗi tạo kênh (thiếu quyền, chạm trần 500 kênh…) — dashboard hiển thị. */
  openError: v.optional(v.string()),
  botKey: v.optional(v.string()),
};
export type BotSetTicketChannelArgs = ObjectType<typeof botSetTicketChannelArgs>;

export async function botSetTicketChannelHandler(ctx: MutationCtx, args: BotSetTicketChannelArgs) {
  await requireBotKeyStrict(ctx, args.botKey);
  const ticket = await findGuildTicket(ctx, args.guildId, args.ticketId);
  if (!ticket) return { ok: true, found: false };
  await ctx.db.patch(ticket._id, {
    channelId: args.channelId,
    openError: args.openError ? args.openError.slice(0, 200) : undefined,
    openErrorAt: args.openError ? Date.now() : undefined,
  });
  return { ok: true, found: true };
}

/**
 * Staff bấm "Nhận việc" — CHỈ 1 người nhận được.
 *
 * Vì sao phải chặn người sau: 3 mod cùng trả lời một khiếu nại là người mở
 * phải đọc 3 câu trả lời mâu thuẫn, và staff tốn thời gian viết lại. Trả về
 * `taken: true` + tên người đã nhận để bot báo lại cho người bấm sau.
 */
export const botClaimTicketArgs = {
  guildId: v.string(),
  ticketId: v.string(),
  staffId: v.string(),
  staffName: v.optional(v.string()),
  botKey: v.optional(v.string()),
};
export type BotClaimTicketArgs = ObjectType<typeof botClaimTicketArgs>;

export async function botClaimTicketHandler(ctx: MutationCtx, args: BotClaimTicketArgs) {
  await requireBotKeyStrict(ctx, args.botKey);
  const ticket = await findGuildTicket(ctx, args.guildId, args.ticketId);
  if (!ticket) return { ok: false, reason: "not_found" };

  // Chặn ticket ĐÃ ĐÓNG: nút "Nhận việc" vẫn còn trong panel của kênh
  // `closed-*` (bot đóng bằng cách thu quyền + đổi tên, KHÔNG xoá panel)
  // nên staff bấm "Nhận việc" trên ticket đã xong sẽ ghi nhận việc lên
  // kênh chết, và dashboard hiện người nhận cho ticket đã đóng.
  if (ticket.status !== "open") return { ok: false, reason: "closed" };
  // Bấm lại nút của chính mình → idempotent, không báo "đã có người nhận".
  if (ticket.claimedById === args.staffId) {
    return { ok: true, taken: false, alreadyMine: true, byName: ticket.claimedByName ?? null };
  }
  if (ticket.claimedById) {
    return { ok: false, reason: "taken", byName: ticket.claimedByName ?? null };
  }
  await ctx.db.patch(ticket._id, {
    claimedById: args.staffId,
    claimedByName: args.staffName ? args.staffName.slice(0, 80) : undefined,
    claimedAt: Date.now(),
  });
  return { ok: true, taken: true, byName: args.staffName ?? null };
}

/** Bỏ nhận (staff đổi ý / ticket chuyển người) — giải phóng cho người khác nhận. */
export const botUnclaimTicketArgs = {
  guildId: v.string(),
  ticketId: v.string(),
  botKey: v.optional(v.string()),
};
export type BotUnclaimTicketArgs = ObjectType<typeof botUnclaimTicketArgs>;

export async function botUnclaimTicketHandler(ctx: MutationCtx, args: BotUnclaimTicketArgs) {
  await requireBotKeyStrict(ctx, args.botKey);
  const ticket = await findGuildTicket(ctx, args.guildId, args.ticketId);
  if (!ticket) return { ok: true, found: false };
  await ctx.db.patch(ticket._id, {
    claimedById: undefined,
    claimedByName: undefined,
    claimedAt: undefined,
  });
  return { ok: true, found: true };
}

/**
 * Bot đã thu quyền + đổi tên kênh cho ticket đóng từ DASHBOARD.
 *
 * Job `closeChannel` trong `getPendingJobs` gọi mutation này sau khi
 * `closeTicketChannel` chạy xong. Không có mốc đó thì mỗi lượt tick lại
 * thu quyền một lần nữa (vô hại nhưng spam API Discord mỗi vòng).
 *
 * KHÔNG đụng `closedAt`: chạm vào nó là đẩy lùi thêm `closeGraceHours`
 * lượt dọn kênh, vài lượt là kênh ticket không bao giờ được dọn.
 */
export const botMarkTicketChannelClosedArgs = {
  guildId: v.string(),
  ticketId: v.string(),
  botKey: v.optional(v.string()),
};
export type BotMarkTicketChannelClosedArgs = ObjectType<typeof botMarkTicketChannelClosedArgs>;

export async function botMarkTicketChannelClosedHandler(
  ctx: MutationCtx,
  args: BotMarkTicketChannelClosedArgs,
) {
  await requireBotKeyStrict(ctx, args.botKey);
  const ticket = await findGuildTicket(ctx, args.guildId, args.ticketId);
  if (!ticket) return { ok: true, found: false };
  await ctx.db.patch(ticket._id, { channelClosedAt: Date.now() });
  return { ok: true, found: true };
}

/**
 * Có người chat trong kênh ticket → đẩy lùi đồng hồ tự đóng.
 *
 * Ghi theo lô (mảng userId) vì bot nhận event messageCreate cho TỪNG tin nhắn:
 * gọi 1 mutation/tin nhắn là đốt operations vô ích. `lastActivityAt` chỉ đưa
 * lùi, không bao giờ đi tới — nếu không, một tin nhắn cũ đọc lại từ backlog
 * Discord sẽ giữ ticket mở mãi.
 */
export const botTouchTicketsArgs = {
  guildId: v.string(),
  channelIds: v.array(v.string()),
  at: v.optional(v.number()),
  botKey: v.optional(v.string()),
};
export type BotTouchTicketsArgs = ObjectType<typeof botTouchTicketsArgs>;

export async function botTouchTicketsHandler(ctx: MutationCtx, args: BotTouchTicketsArgs) {
  await requireBotKeyStrict(ctx, args.botKey);
  const now = args.at ?? Date.now();
  let touched = 0;
  // Tra ĐÚNG kênh qua index (guildId, channelId). Hàm này chạy MỖI tin nhắn
  // trong kênh ticket; bản cũ `collect()` toàn bộ ticket của guild rồi tự
  // `.find` → server 300 ticket tốn ~300 lượt đọc document (kèm `body` dài)
  // cho mỗi tin nhắn chỉ để sửa 1 hàng. Giờ đúng 1 document/kênh.
  for (const channelId of args.channelIds) {
    const t = await ctx.db
      .query("tickets")
      .withIndex("by_guildId_channelId", (q) =>
        q.eq("guildId", args.guildId).eq("channelId", channelId),
      )
      .first();
    if (!t || t.status !== "open") continue;
    const forward = (t.lastActivityAt ?? t.createdAt) < now;
    // Bộ đếm tin nhắn tăng Ở MỌI lượt, kể cả lượt mà đồng hồ im lặng KHÔNG
    // lùi được (2 tin gửi trong cùng mili-giây). Gộp vào nhánh `continue`
    // cũ thì ngân sách tin nhắn đếm thiếu → người spam không bao giờ bị chặn.
    await ctx.db.patch(t._id, {
      ...(forward ? { lastActivityAt: now } : {}),
      messageCount: (t.messageCount ?? 0) + 1,
    });
    if (forward) touched++;
  }
  return { touched };
}

/**
 * Lưu transcript vào storage + đánh dấu đã lưu — BẮT BUỘC trước khi xoá kênh.
 *
 * Vì sao tách 2 bước: xoá kênh Discord là không hoàn tác được. Nếu gộp "lưu +
 * xoá" thành 1 mutation mà storage ghi lỗi, bản ghi vẫn ghi `transcriptStorageId`
 * thành công trong khi file không tồn tại → staff thấy "đã lưu" rồi mở ra thì
 * 404. Tách ra, bot chỉ xoá kênh sau khi mutation này trả `ok: true`.
 */
export const botSaveTicketTranscriptArgs = {
  guildId: v.string(),
  ticketId: v.string(),
  storageId: v.string(),
  botKey: v.optional(v.string()),
};
export type BotSaveTicketTranscriptArgs = ObjectType<typeof botSaveTicketTranscriptArgs>;

export async function botSaveTicketTranscriptHandler(
  ctx: MutationCtx,
  args: BotSaveTicketTranscriptArgs,
) {
  await requireBotKeyStrict(ctx, args.botKey);
  const ticket = await findGuildTicket(ctx, args.guildId, args.ticketId);
  if (!ticket) return { ok: true, found: false };
  await ctx.db.patch(ticket._id, {
    transcriptStorageId: args.storageId,
    transcriptAt: Date.now(),
  });
  return { ok: true, found: true };
}
