/**
 * Hợp đồng bot ⇄ Convex cho các thao tác GHI phía bot — đợt #5 tách file 75KB
 * (41 function) nhưng GIỮ NGUYÊN mọi tên `bot_writes:<fn>` và validator.
 *
 * Wrapper `export const X = mutation/query({ args, handler })` ở lại đây; thân
 * hàm nằm ở `convex/bot_writes/*`:
 *   - settings.ts   — cấu hình server (prefix/verify/alt, lockdown, antinuke…)
 *   - antinuke.ts   — module antinuke, heat, sự kiện chống nuke, mẫu raid
 *   - autoReplies.ts— rule trả lời tự động
 *   - backup.ts     — tạo/giữ/đẩy/xoá backup + báo lỗi chụp backup
 *   - restore.ts    — yêu cầu/claim/khôi phục/import
 *   - tickets.ts    — mở/đóng/nhận ticket, transcript
 *   - modActions.ts — case mod
 *   - metrics.ts    — số đo hệ thống
 *   - language.ts   — ngôn ngữ người dùng
 *
 * Cổng `scripts/check-settings-signal.cjs` suy tập mutation bot-side ghi cấu
 * hình từ wrapper → handler (theo cả module con) và đối chiếu với
 * `CONFIG_WRITE_MUTATIONS` trong `bot/src/convex.js`. Đổi tên/ di chuyển function
 * phải chạy `node scripts/check-convex-contract.cjs` + script trên.
 */
import { mutation, query } from "./_generated/server";
import {
  botUpdateSettingsArgs,
  botUpdateSettingsHandler,
  botUpdateLockdownArgs,
  botUpdateLockdownHandler,
  botLockStateArgs,
  botLockStateHandler,
  botClearHeatResetArgs,
  botClearHeatResetHandler,
  botSetReportAtArgs,
  botSetReportAtHandler,
  botSetAntinukeArgs,
  botSetAntinukeHandler,
} from "./bot_writes/settings";
import {
  botModuleUpdateArgs,
  botModuleUpdateHandler,
  botRecordAntinukeEventArgs,
  botRecordAntinukeEventHandler,
  botRecordHeatBatchArgs,
  botRecordHeatBatchHandler,
  botEnsureModulesArgs,
  botEnsureModulesHandler,
  botRecordHeatArgs,
  botRecordHeatHandler,
  botRecordRaidSampleArgs,
  botRecordRaidSampleHandler,
} from "./bot_writes/antinuke";
import {
  botAutoReplyUpsertArgs,
  botAutoReplyUpsertHandler,
  botAutoReplyRemoveArgs,
  botAutoReplyRemoveHandler,
} from "./bot_writes/autoReplies";
import {
  botStoreBackupArgs,
  botStoreBackupHandler,
  botSetBackupRetentionArgs,
  botSetBackupRetentionHandler,
  botSetBackupGithubArgs,
  botSetBackupGithubHandler,
  botSetAutoBackupArgs,
  botSetAutoBackupHandler,
  botSetBackupRequestArgs,
  botSetBackupRequestHandler,
  botDeleteBackupArgs,
  botDeleteBackupHandler,
  botReportBackupErrorArgs,
  botReportBackupErrorHandler,
} from "./bot_writes/backup";
import {
  botSetRestoreRequestArgs,
  botSetRestoreRequestHandler,
  botClaimBackupArgs,
  botClaimBackupHandler,
  botRenewBackupClaimArgs,
  botRenewBackupClaimHandler,
  botReportRestoreErrorArgs,
  botReportRestoreErrorHandler,
  botClearBackupArgs,
  botClearBackupHandler,
  botReportRestorePlanArgs,
  botReportRestorePlanHandler,
  botReportImportErrorArgs,
  botReportImportErrorHandler,
  botRestoreSettingsArgs,
  botRestoreSettingsHandler,
} from "./bot_writes/restore";
import {
  botOpenTicketArgs,
  botOpenTicketHandler,
  botCloseTicketArgs,
  botCloseTicketHandler,
  botSetTicketChannelArgs,
  botSetTicketChannelHandler,
  botClaimTicketArgs,
  botClaimTicketHandler,
  botUnclaimTicketArgs,
  botUnclaimTicketHandler,
  botMarkTicketChannelClosedArgs,
  botMarkTicketChannelClosedHandler,
  botTouchTicketsArgs,
  botTouchTicketsHandler,
  botSaveTicketTranscriptArgs,
  botSaveTicketTranscriptHandler,
} from "./bot_writes/tickets";
import { botRecordModActionArgs, botRecordModActionHandler } from "./bot_writes/modActions";
import { botRecordMetricsArgs, botRecordMetricsHandler } from "./bot_writes/metrics";
import {
  botSetUserLangArgs,
  botSetUserLangHandler,
  botGetUserLangArgs,
  botGetUserLangHandler,
} from "./bot_writes/language";

/**
 * These mutations are called by the Discord bot process itself. The bot
 * validates the executor's Discord permissions before calling them, and only
 * the bot holds the Convex admin/deploy key, so no session token is checked.
 */

/** Cấu hình server — thân hàm ở `bot_writes/settings.ts` (đợt #5). */
export const botUpdateSettings = mutation({
  args: botUpdateSettingsArgs,
  handler: botUpdateSettingsHandler,
});

export const botUpdateLockdown = mutation({
  args: botUpdateLockdownArgs,
  handler: botUpdateLockdownHandler,
});

export const botLockState = mutation({
  args: botLockStateArgs,
  handler: botLockStateHandler,
});

export const botClearHeatReset = mutation({
  args: botClearHeatResetArgs,
  handler: botClearHeatResetHandler,
});

export const botSetReportAt = mutation({
  args: botSetReportAtArgs,
  handler: botSetReportAtHandler,
});

export const botSetAntinuke = mutation({
  args: botSetAntinukeArgs,
  handler: botSetAntinukeHandler,
});

/** Chống nuke / heat / raid — thân hàm ở `bot_writes/antinuke.ts` (đợt #5). */
export const botModuleUpdate = mutation({
  args: botModuleUpdateArgs,
  handler: botModuleUpdateHandler,
});

export const botRecordAntinukeEvent = mutation({
  args: botRecordAntinukeEventArgs,
  handler: botRecordAntinukeEventHandler,
});

export const botRecordHeatBatch = mutation({
  args: botRecordHeatBatchArgs,
  handler: botRecordHeatBatchHandler,
});

export const botEnsureModules = mutation({
  args: botEnsureModulesArgs,
  handler: botEnsureModulesHandler,
});

export const botRecordHeat = mutation({
  args: botRecordHeatArgs,
  handler: botRecordHeatHandler,
});

export const botRecordRaidSample = mutation({
  args: botRecordRaidSampleArgs,
  handler: botRecordRaidSampleHandler,
});

/** Auto-reply — thân hàm ở `bot_writes/autoReplies.ts` (đợt #5). */
export const botAutoReplyUpsert = mutation({
  args: botAutoReplyUpsertArgs,
  handler: botAutoReplyUpsertHandler,
});

export const botAutoReplyRemove = mutation({
  args: botAutoReplyRemoveArgs,
  handler: botAutoReplyRemoveHandler,
});

/** Backup — thân hàm ở `bot_writes/backup.ts` (đợt #5). */
export const botStoreBackup = mutation({
  args: botStoreBackupArgs,
  handler: botStoreBackupHandler,
});

export const botSetBackupRetention = mutation({
  args: botSetBackupRetentionArgs,
  handler: botSetBackupRetentionHandler,
});

export const botSetBackupGithub = mutation({
  args: botSetBackupGithubArgs,
  handler: botSetBackupGithubHandler,
});

export const botSetAutoBackup = mutation({
  args: botSetAutoBackupArgs,
  handler: botSetAutoBackupHandler,
});

export const botSetBackupRequest = mutation({
  args: botSetBackupRequestArgs,
  handler: botSetBackupRequestHandler,
});

export const botDeleteBackup = mutation({
  args: botDeleteBackupArgs,
  handler: botDeleteBackupHandler,
});

export const botReportBackupError = mutation({
  args: botReportBackupErrorArgs,
  handler: botReportBackupErrorHandler,
});

/** Khôi phục / import — thân hàm ở `bot_writes/restore.ts` (đợt #5). */
export const botSetRestoreRequest = mutation({
  args: botSetRestoreRequestArgs,
  handler: botSetRestoreRequestHandler,
});

export const botClaimBackup = mutation({
  args: botClaimBackupArgs,
  handler: botClaimBackupHandler,
});

export const botRenewBackupClaim = mutation({
  args: botRenewBackupClaimArgs,
  handler: botRenewBackupClaimHandler,
});

export const botReportRestoreError = mutation({
  args: botReportRestoreErrorArgs,
  handler: botReportRestoreErrorHandler,
});

export const botClearBackup = mutation({
  args: botClearBackupArgs,
  handler: botClearBackupHandler,
});

export const botReportRestorePlan = mutation({
  args: botReportRestorePlanArgs,
  handler: botReportRestorePlanHandler,
});

export const botReportImportError = mutation({
  args: botReportImportErrorArgs,
  handler: botReportImportErrorHandler,
});

export const botRestoreSettings = mutation({
  args: botRestoreSettingsArgs,
  handler: botRestoreSettingsHandler,
});

/** Ticket — thân hàm ở `bot_writes/tickets.ts` (đợt #5). */
export const botOpenTicket = mutation({
  args: botOpenTicketArgs,
  handler: botOpenTicketHandler,
});

export const botCloseTicket = mutation({
  args: botCloseTicketArgs,
  handler: botCloseTicketHandler,
});

export const botSetTicketChannel = mutation({
  args: botSetTicketChannelArgs,
  handler: botSetTicketChannelHandler,
});

export const botClaimTicket = mutation({
  args: botClaimTicketArgs,
  handler: botClaimTicketHandler,
});

export const botUnclaimTicket = mutation({
  args: botUnclaimTicketArgs,
  handler: botUnclaimTicketHandler,
});

export const botMarkTicketChannelClosed = mutation({
  args: botMarkTicketChannelClosedArgs,
  handler: botMarkTicketChannelClosedHandler,
});

export const botTouchTickets = mutation({
  args: botTouchTicketsArgs,
  handler: botTouchTicketsHandler,
});

export const botSaveTicketTranscript = mutation({
  args: botSaveTicketTranscriptArgs,
  handler: botSaveTicketTranscriptHandler,
});

/** Case mod — thân hàm ở `bot_writes/modActions.ts` (đợt #5). */
export const botRecordModAction = mutation({
  args: botRecordModActionArgs,
  handler: botRecordModActionHandler,
});

/** Số đo hệ thống — thân hàm ở `bot_writes/metrics.ts` (đợt #5). */
export const botRecordMetrics = mutation({
  args: botRecordMetricsArgs,
  handler: botRecordMetricsHandler,
});

/** Ngôn ngữ người dùng — thân hàm ở `bot_writes/language.ts` (đợt #5). */
export const botSetUserLang = mutation({
  args: botSetUserLangArgs,
  handler: botSetUserLangHandler,
});

export const botGetUserLang = query({
  args: botGetUserLangArgs,
  handler: botGetUserLangHandler,
});
