import { query } from "./_generated/server";
import { v } from "convex/values";
import { buildHiddenJobs, getBotStatus } from "./hidden";
import { requireBotKeyStrict } from "./botAuth";
import { reassembleBackupJsonForRead } from "./backupChunks";

/**
 * Batch TỔNG HỢP cho vòng quét định kỳ của bot (gọi mỗi 2 phút thay vì 3 query
 * riêng mỗi 20–120s — tiết kiệm ~40k+ function calls/tháng trên free tier):
 *  - hidden: panel reaction role chưa gửi, giveaway cần gửi/kết thúc, DM chờ,
 *    webhook mặc định cần tạo/gỡ (tái dùng buildHiddenJobs của hidden.ts).
 *  - verifyPanels: guild có cờ verifySendPanel (bot gửi panel xác minh rồi xóa cờ).
 *  - backups: yêu cầu backup/restore/import đang chờ + backup tự động đến hạn.
 *  - settingsChanges: guild vừa được dashboard sửa cấu hình (settingsChangedAt mới)
 *    → bot xóa cache getConfig của guild đó để thay đổi áp dụng trong ~1 tick.
 *  - reports: guild đến hạn báo cáo ngày — cờ `reportRequestedAt` do cron Convex
 *    `reports:sweepDueDailyReports` đặt (đợt #4, thay vòng reportInterval 15 phút).
 *  - meta: cờ lockdown/heat reset (tham khảo; bot vẫn đọc getConfig có cache).
 * Bot tự lọc guild mình đang ở. Query đọc-only, không có side effect.
 */
export const getPendingJobs = query({
  args: { botKey: v.optional(v.string()) },
  handler: async (ctx, { botKey }) => {
    await requireBotKeyStrict(ctx, botKey);
    const hidden = await buildHiddenJobs(ctx);

    // TỐI ƯU (audit Convex): bỏ collect() toàn bảng thứ 2 trong cùng 1 lượt tick
    // (buildHiddenJobs đã đọc guild đang hoạt động) — dùng index by_botInGuild.
    const guilds = await ctx.db
      .query("guilds")
      .withIndex("by_botInGuild", (q) => q.eq("botInGuild", true))
      .collect();
    const verifyPanels = guilds
      .filter((g) => g.verifySendPanel === true && g.verifyEnabled && g.verifyChannelId)
      .map((g) => ({
        guildId: g.discordId,
        verifyChannelId: g.verifyChannelId!,
        unverifiedRoleId: g.unverifiedRoleId ?? null,
        verifiedRoleId: g.verifiedRoleId ?? null,
        verifyMethod: g.verifyMethod ?? "button",
      }));
    // Panel MỞ ticket (nút cho thành viên tự mở ticket, không cần gõ lệnh).
    // Cùng khuôn cờ chờ với verify: dashboard bấm → bot dán xong xoá cờ.
    const ticketPanels = guilds
      .filter((g) => g.ticketSendPanel === true && g.ticketEnabled && g.ticketPanelChannelId)
      .map((g) => ({ guildId: g.discordId, channelId: g.ticketPanelChannelId! }));

    // Cấu hình vừa đổi từ dashboard (updateSettings / module antinuke / alt config /
    // auto reply / tùy chỉnh khôi phục / lịch backup) → bot xóa cache config của
    // đúng guild đó. Không có tín hiệu này thì thay đổi phải chờ hết TTL cache (30
    // phút) mới tới bot, trong khi giao diện hứa "khoảng 3 phút" — bug thật 23/09
    // (bật welcome xong join thử mà bot im lặng).
    const nowMs = Date.now();
    const SETTINGS_FRESH_MS = 15 * 60_000;
    const settingsChanges = guilds
      .filter((g) => (g.settingsChangedAt ?? 0) > nowMs - SETTINGS_FRESH_MS)
      .map((g) => ({ guildId: g.discordId, at: g.settingsChangedAt as number }));

    const backups: {
      kind: string;
      guildId: string;
      pushToGithub?: boolean;
      includeMessages?: boolean;
      backupId?: string;
      backupJson?: string;
      guildName?: string;
      fileName?: string;
      importStorageId?: string;
      importFileUrl?: string;
      // Số chunk của bản backup (chỉ có khi payload bị tách) — dùng để ghép lại.
      backupChunkCount?: number;
      backupCreatedAt?: number;
    }[] = [];
    for (const g of guilds) {
      if (g.backupRequested) {
        backups.push({
          kind: "backup",
          guildId: g.discordId,
          pushToGithub: !!g.backupPushToGithub,
          includeMessages: !!g.backupIncludeMessages,
          guildName: g.name,
        });
      }
      if (g.restoreRequested && g.restoreBackupId) {
        const b = await ctx.db.get(g.restoreBackupId);
        if (b) {
          // Bản backup >700KB được tách thành nhiều document `backupChunks`,
          // còn `backupJson` trên bản cha chỉ là ký hiệu "chunked:N". Gửi thẳng
          // ký hiệu đó cho bot ⇒ bot khôi phục từ chuỗi rác rồi báo "thành công"
          // trong khi không server nào được khôi phục. Đường cũ
          // (`backup:botGetPending`) đã làm đúng: ghép lại, và hỏng/thiếu chunk
          // thì KHÔNG sinh job để người dùng thấy cờ treo thay vì mất dữ liệu.
          const backupJson = await reassembleBackupJsonForRead(
            ctx,
            b._id,
            b.backupJson,
            b.backupChunkCount,
          );
          if (backupJson !== null) {
            backups.push({
              kind: "restore",
              guildId: g.discordId,
              backupId: b._id,
              backupJson,
              guildName: b.guildName,
            });
          }
        }
      }
      // Dry-run khôi phục ("xem kế hoạch trước khi bấm"): dashboard đặt
      // `restorePlanRequested` + `restorePlanBackupId`. Đường quét cũ
      // (`backup:botGetPending`) có sinh job này nhưng vòng quét cũ không còn được
      // lên lịch — batch tick thiếu nhánh → nút xem kế hoạch quay mãi không có
      // kết quả. Cùng quy tắc ghép chunk với restore; thiếu/hỏng chunk thì KHÔNG
      // sinh job để người dùng thấy cờ treo thay vì nhận kế hoạch sai.
      if (g.restorePlanRequested && g.restorePlanBackupId) {
        const b = await ctx.db.get(g.restorePlanBackupId);
        if (b) {
          const backupJson = await reassembleBackupJsonForRead(
            ctx,
            b._id,
            b.backupJson,
            b.backupChunkCount,
          );
          if (backupJson !== null) {
            backups.push({
              kind: "plan",
              guildId: g.discordId,
              backupId: b._id,
              backupJson,
              guildName: b.guildName,
              backupCreatedAt: b.createdAt,
            });
          }
        }
      }
      if (g.importRestoreRequested && g.importStorageId) {
        const importFileUrl = await ctx.storage.getUrl(g.importStorageId).catch(() => null);
        backups.push({
          kind: "import",
          guildId: g.discordId,
          fileName: g.importFileName ?? "backup.msc",
          importStorageId: g.importStorageId,
          importFileUrl: importFileUrl ?? undefined,
          guildName: g.name,
        });
      }
    }

    // Cấu hình self-diagnose (bot tự chẩn đoán lỗi qua AI) + cờ học thủ công /
    // AI review Threat Intel — đi nhờ batch query sẵn có, bot không cần thêm
    // call mutation "claim mù" mỗi 10 phút nữa (tiết kiệm ~4.3k calls/tháng).
    const status = await getBotStatus(ctx);
    const selfDiagnose = {
      enabled: status?.selfDiagnoseEnabled ?? false,
    };
    const threatFlags = {
      selfDiagnoseEnabled: status?.selfDiagnoseEnabled ?? false,
      manualLearn: status?.threatManualLearnRequested
        ? { requestedBy: status.threatManualLearnBy ?? "admin" }
        : null,
      aiReview: !!status?.threatAiReviewRequested,
    };

    // ── Job dọn ticket ──
    // Ba việc, cùng một lượt tick để không tốn thêm vòng query:
    //   1. closeChannel: ticket `closed` mà kênh CHƯA thu quyền (đóng từ
    //      dashboard) → thu quyền + đổi tên ngay, không chờ 24h.
    //   2. autoClose: ticket `open` quá idleHours không ai chat → đóng.
    //   3. purge: ticket `closed` quá closeGraceHours → lưu transcript rồi
    //      xoá kênh. KHÔNG tự xoá khi chưa lưu transcript.
    //
    // Mỗi ticket gửi kèm idleHours/graceHours CỦA SERVER ĐÓ (vì mỗi chủ
    // server tuỳ chỉnh khác nhau) — bot không cần gọi thêm getConfig.
    const tickets: {
      guildId: string;
      ticketId: string;
      channelId: string;
      number: number;
      kind: string;
      openerId: string;
      status: string;
      idleHours: number;
      closeGraceHours: number;
      /**
       * Lý do đóng khi status = "autoClose": `idle` = hết giờ im lặng,
       * `budget` = chạm ngân sách tin nhắn. Bot dùng để đóng đúng câu chữ.
       */
      closeCause?: string;
      lastActivityAt: number;
      closedAt: number;
      closeReason?: string;
      /** Purge: transcript đã nằm trong storage ở lượt trước → chỉ xoá kênh. */
      transcriptReady?: boolean;
    }[] = [];
    for (const g of guilds) {
      if (!g.ticketEnabled) continue;
      const idleHours = g.ticketIdleHours ?? 24;
      const closeGraceHours = g.ticketCloseGraceHours ?? 24;
      const messageBudget = g.ticketMessageBudget ?? 0;
      const rows = await ctx.db
        .query("tickets")
        .withIndex("by_guildId", (q) => q.eq("guildId", g.discordId))
        .collect();
      for (const t of rows) {
        if (t.status === "open") {
          // ⚠️ Kiểm NGÂN SÁCH TIN TRƯỚC đồng hồ im lặng: kênh đang bị spam thì
          // `lastActivityAt` cứ được đẩy lùi nên nhánh idle KHÔNG BAO GIỜ
          // chạm ngưỡng — tức hành rào chống spam chỉ có tác dụng khi im lặng,
          // đúng cái người spam không bao giờ làm.
          const overBudget = messageBudget > 0 && (t.messageCount ?? 0) >= messageBudget;
          if (!overBudget) {
            if (idleHours <= 0) continue;
            const last = t.lastActivityAt ?? t.createdAt;
            if (nowMs - last < idleHours * 3_600_000) continue;
            tickets.push({
              guildId: g.discordId,
              ticketId: t._id,
              channelId: t.channelId,
              number: t.number ?? 0,
              kind: t.kind,
              openerId: t.openerId,
              status: "autoClose",
              idleHours,
              closeGraceHours,
              lastActivityAt: t.lastActivityAt ?? t.createdAt,
              closedAt: 0,
            });
            continue;
          }
          tickets.push({
            guildId: g.discordId,
            ticketId: t._id,
            channelId: t.channelId,
            number: t.number ?? 0,
            kind: t.kind,
            openerId: t.openerId,
            status: "autoClose",
            closeCause: "budget",
            idleHours,
            closeGraceHours,
            lastActivityAt: t.lastActivityAt ?? t.createdAt,
            closedAt: 0,
          });
        } else if (t.status === "closed") {
          // ⚠️ KHÔNG `continue` khi transcript đã lưu — đó là cách khiến kênh
          // ticket treo VĨNH VIỄN: `runPurge` lưu transcript xong mới xoá
          // kênh, nếu `channel.delete()` lỗi (thiếu quyền, rate limit) thì
          // bản ghi vẫn `closed` + đã có transcript → mọi lượt tick sau đều
          // bỏ qua, kênh không bao giờ được dọn lần nữa (28/09/2026).
          // Thay vào đó vẫn sinh job purge với cờ `transcriptReady` để bot
          // bỏ qua bước lưu (không ghi file mỗi vòng) và chỉ thử xoá kênh.
          // Kênh CHƯA được thu quyền → khoá ngay ở lượt tick này. Trước
          // đây nhánh closed chỉ chờ tới lượt purge sau closeGraceHours,
          // tức dashboard đóng ticket xong thì kênh vẫn còn tên cũ + quyền cũ
          // tới 24h (lỗi thật 28/09/2026).
          if (!t.channelClosedAt && t.channelId && t.channelId !== "pending") {
            tickets.push({
              guildId: g.discordId,
              ticketId: t._id,
              channelId: t.channelId,
              number: t.number ?? 0,
              kind: t.kind,
              openerId: t.openerId,
              status: "closeChannel",
              idleHours,
              closeGraceHours,
              lastActivityAt: t.lastActivityAt ?? t.createdAt,
              closedAt: t.closedAt ?? 0,
              closeReason: t.closeReason ?? undefined,
            });
            continue;
          }
          const closed = t.closedAt ?? 0;
          if (!closed || nowMs - closed < closeGraceHours * 3_600_000) continue;
          tickets.push({
            guildId: g.discordId,
            ticketId: t._id,
            channelId: t.channelId,
            number: t.number ?? 0,
            kind: t.kind,
            openerId: t.openerId,
            status: "purge",
            idleHours,
            closeGraceHours,
            lastActivityAt: t.lastActivityAt ?? t.createdAt,
            closedAt: closed,
            transcriptReady: !!t.transcriptStorageId,
          });
        }
      }
    }

    // Báo cáo ngày (đợt #4): cờ cron đặt, bot gửi trong tick kế tiếp rồi xoá cờ
    // bằng botSetReportAt. Cờ còn = bot chưa gửi (offline / tắt tạm) — giữ nguyên.
    const reports = guilds
      .filter((g) => g.reportRequestedAt !== undefined)
      .map((g) => ({ guildId: g.discordId }));

    return {
      hidden,
      verifyPanels,
      ticketPanels,
      backups,
      settingsChanges,
      reports,
      selfDiagnose,
      threatFlags,
      tickets,
    };
  },
});
