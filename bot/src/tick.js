/**
 * tick.js — Vòng quét TỔNG HỢP của bot (chuyển bớt sang VPS, tiết kiệm Convex).
 *
 * Trước đây bot chạy 3 vòng quét riêng: hidden 120s (2 query), verify panel 120s
 * (1 query), backup 60s (1 query) → ~120 query/giờ kể cả khi không có việc gì.
 * Giờ 1 vòng tick duy nhất mỗi 60s gọi bot_tick:getPendingJobs — 1 query batch
 * trả { hidden, verifyPanels, backups } cho MỌI guild, bot tự lọc server mình
 * đang ở → tiết kiệm ~50% function calls của nhóm này trên Convex free tier,
 * đồng thời hidden/verify phản hồi NHANH HƠN (60s thay vì 120s).
 *
 * Khi batch lỗi (query chưa deploy, lỗi mạng thoáng qua) → fallback về 3 query
 * riêng đúng như hành vi cũ để KHÔNG bỏ lỡ việc. Sau lỗi batch, tạm tránh gọi
 * batch trong 10 phút (chống spam log khi query chưa có trên deployment).
 *
 * Việc xử lý tái dùng processor của từng module (không nhân bản logic):
 *  - hidden jobs  → hidden.processHiddenJobsData (panel, giveaway, DM, webhook log)
 *  - verify panel → hidden.processVerifyPanelItems
 *  - backup       → backup.runBackup / runRestore / runImportRestore + claimAt fencing
 *  - settings đổi → xóa cache config + cache webhook của guild vừa được dashboard sửa
 *    (settingsChanges)
 *  - báo cáo ngày → dailyReport.processReportJobs (cờ reportRequestedAt do cron
 *    Convex `reports:sweepDueDailyReports` đặt — đợt #4, thay vòng 15 phút)
 */

// TỐI ƯU I/O: 180s (trước 120s, ban đầu 60s) — các cờ backup/restore/panel vẫn
// xử lý trong ~3 phút, đủ nhanh cho trải nghiệm; giảm thêm 33% reads của batch
// query (mỗi lượt collect() toàn bảng guilds/panels/giveaways là nguồn I/O lớn).
const TICK_INTERVAL_MS = 180_000;
/** Sau khi batch lỗi, tránh gọi lại batch trong khoảng này (dùng fallback). */
const BATCH_RETRY_AFTER_MS = 10 * 60_000;
/**
 * Nhịp gia hạn lease khi job backup/restore còn chạy. PHẢI nhỏ hơn
 * `BACKUP_CLAIM_TTL_MS` của Convex (10 phút) — chọn 4 phút để một lần mạng lỗi
 * vẫn còn dư một nhịp trước khi lease hết hạn.
 */
const CLAIM_RENEW_EVERY_MS = 4 * 60_000;

const hiddenMod = require("./handlers/hidden");
const backupMod = require("./handlers/backup");

/** Chống xử lý trùng trong process: item đang chạy bị bỏ qua ở lượt sau. */
const backupInFlight = new Set();
let batchBrokenUntil = 0;
/** guildId → mốc `settingsChangedAt` đã xử lý (chống xóa cache lặp mỗi lượt tick). */
const settingsSeen = new Map();

/**
 * Dashboard vừa sửa cấu hình → xóa cache cục bộ của đúng guild đó.
 *
 * Bối cảnh: getConfig cache tới 30 phút (cắt reads cho Convex free tier), còn
 * giao diện hứa "bot áp dụng trong khoảng 3 phút". Không có bước này thì bật
 * welcome/goodbye, đổi module antinuke... xong join thử sẽ thấy bot im lặng
 * (bug thật 23/09). Mốc `at` giữ trong process để mỗi thay đổi chỉ xóa cache 1 lần.
 *
 * Xóa CẢ cache webhook (TTL 5 phút ở webhookHub): webhook log cũng là cấu hình
 * dashboard sửa được (bật/tắt, lọc sự kiện, màu, template nội dung) — không xóa
 * thì thay đổi chậm tới 5 phút dù tín hiệu đã về trong 1 tick.
 */
function applySettingsChanges(store, changes) {
  if (!Array.isArray(changes)) return 0;
  let cleared = 0;
  for (const c of changes) {
    const guildId = c?.guildId;
    const at = Number(c?.at) || 0;
    if (!guildId || !at) continue;
    if ((settingsSeen.get(guildId) ?? 0) >= at) continue; // mốc này xử lý rồi
    settingsSeen.set(guildId, at);
    store.invalidate(guildId);
    // Lỗi ở module webhook KHÔNG được làm hỏng vòng tick (các việc khác trong
    // batch vẫn phải chạy) — cùng nguyên tắc fail-open của tick.
    try {
      require("./webhookHub").invalidateCache(guildId);
    } catch {}
    cleared++;
  }
  return cleared;
}

/**
 * Gia hạn lease định kỳ trong lúc job còn chạy.
 *
 * Vì sao cần: lease của Convex chỉ sống 10 phút (`BACKUP_CLAIM_TTL_MS`).
 * `restoreCore` tự gia hạn theo từng bước, nhưng nhánh BACKUP chỉ có một bước
 * dài (chụp snapshot role/kênh/tin) nên không có chỗ nào móc vào: job quá 10
 * phút bị Convex từ chối kết quả cuối bằng `stale_claim`, và lần báo lỗi cũng
 * dùng đúng claimAt cũ nên cũng bị từ chối ⇒ dashboard KHÔNG thấy lỗi gì, cờ
 * yêu cầu còn nguyên ⇒ bot chụp lại từ đầu mỗi 3 phút, vô hạn (bug thật).
 *
 * Trả về hàm dừng — job xong thì tắt (job chết theo process, timer chết theo).
 */
function startClaimRenewal(store, guildId, kind, claimAt, everyMs = CLAIM_RENEW_EVERY_MS) {
  // claimAt undefined = bot bản cũ không gửi fencing token → không có gì để gia hạn.
  if (typeof claimAt !== "number") return () => {};
  const timer = setInterval(() => {
    store.client
      .mutation("bot_writes:botRenewBackupClaim", { guildId, kind, claimAt })
      .catch(() => {});
  }, everyMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

/**
 * Giành quyền xử lý trên Convex — chỉ ai claim được mới chạy (chống trùng khi
 * chạy 2 bot / 2 lượt quét chồng nhau — giống claim trong handlers/backup.js).
 */
async function claimBackup(store, guildId, kind) {
  try {
    const res = await store.client.mutation("bot_writes:botClaimBackup", {
      guildId,
      kind,
    });
    if (!res?.ok) return null;
    return { claimAt: typeof res.claimAt === "number" ? res.claimAt : undefined };
  } catch (e) {
    console.error(`[tick:backup:claim] ${guildId}:`, e.message);
    return null;
  }
}

/** Tải nội dung file import từ Convex file storage (URL trong batch trả về). */
async function readImportContent(item) {
  if (item.importFileUrl) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    try {
      const res = await fetch(item.importFileUrl, { signal: ctrl.signal });
      if (res.ok) return await res.text();
      throw new Error(
        `Không tải được file backup từ đám mây (HTTP ${res.status}) — hãy thử tải lại file`,
      );
    } catch (e) {
      if (e?.name === "AbortError" || e?.code === "ABORT_ERR") {
        throw new Error("Tải file backup từ đám mây quá lâu (> 60 giây) — hãy thử lại", {
          cause: e,
        });
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  if (item.fileContent) return item.fileContent;
  throw new Error("Không lấy được file backup từ đám mây — hãy thử tải lại file");
}

/** Xử lý các yêu cầu backup/restore/import trong batch (như pollBackups cũ). */
/**
 * Khoá chat hết hạn → tự mở khoá.
 *
 * Vì sao gọi query RIÊNG thay vì gộp vào `getPendingJobs`: bảng `channelLocks`
 * index theo HẠN (không theo guild) nên không dựng được từ danh sách guild
 * sẵn có, và mỗi lượt tick vốn đã hỏi Convex ở nhiều chỗ — thêm một query
 * gọn thành một chỗ, dễ bỏ sót hơn là nhét vào batch chung.
 *
 * `processDueLocks` tự nuốt lỗi từng guild, nên 1 server lỗi không chặn
 * các server còn lại trong cùng lượt.
 */
async function runChannelLocks(client, store) {
  const due = await store.client.query("channelLocks:botDueChannelLocks", {});
  await require("./channelLock").processDueLocks(client, store, due ?? []);
}

async function runBackupJobs(client, store, items) {
  if (!items || items.length === 0) return;
  for (const item of items) {
    const key = `${item.guildId}:${item.kind}`;
    if (backupInFlight.has(key)) continue;
    const lease = await claimBackup(store, item.guildId, item.kind);
    if (!lease) continue;
    const claimAt = lease.claimAt;
    backupInFlight.add(key);
    const stopRenewal = startClaimRenewal(store, item.guildId, item.kind, claimAt);
    try {
      if (item.kind === "backup") {
        await backupMod.runBackup(client, store, item.guildId, {
          pushToGithub: !!item.pushToGithub,
          includeMessages: !!item.includeMessages,
          // Yêu cầu đến từ người dùng (dashboard/lệnh) hoặc lịch tự động —
          // nếu bị skip vì "không thay đổi" thì phải thông báo, không im lặng.
          skipNotice: true,
          claimAt,
        });
      } else if (item.kind === "restore") {
        await backupMod.runRestore(client, store, item.guildId, item.backupJson, item.guildName, {
          claimAt,
        });
      } else if (item.kind === "plan") {
        // Dry-run: chỉ tính kế hoạch khôi phục, KHÔNG đụng server (xem runRestorePlan).
        await backupMod.runRestorePlan(
          client,
          store,
          item.guildId,
          item.backupJson,
          item.guildName,
          {
            claimAt,
          },
        );
      } else if (item.kind === "import") {
        const content = await readImportContent(item);
        await backupMod.runImportRestore(client, store, item.guildId, content, item.fileName, {
          claimAt,
        });
      }
    } catch (e) {
      console.error(`[tick:backup:${item.kind}] ${item.guildId}:`, e.message);
      // Mọi nhánh đều BÁO LỖI lên dashboard để người dùng thấy lý do thay vì
      // chờ mãi không thấy gì (restore/import trước đây xóa cờ IM LẶNG).
      if (item.kind === "import") {
        await store.client
          .mutation("bot_writes:botReportImportError", {
            guildId: item.guildId,
            error: String(e?.message || "Lỗi không xác định").slice(0, 300),
            claimAt,
          })
          .catch(() => {});
      } else if (item.kind === "restore") {
        await store.client
          .mutation("bot_writes:botReportRestoreError", {
            guildId: item.guildId,
            error: String(e?.message || "Lỗi không xác định").slice(0, 300),
            claimAt,
          })
          .catch(() => {});
      } else if (item.kind === "plan") {
        // Lỗi dry-run có mutation riêng: botClearBackup/ReportBackupError sẽ đặt
        // mốc backup/restore xong giả và xoá nhầm cờ khôi phục thật.
        await store.client
          .mutation("bot_writes:botReportRestorePlan", {
            guildId: item.guildId,
            error: String(e?.message || "Lỗi không xác định").slice(0, 300),
            claimAt,
          })
          .catch(() => {});
      } else {
        await store.client
          .mutation("bot_writes:botReportBackupError", {
            guildId: item.guildId,
            error: String(e?.message || "Lỗi không xác định").slice(0, 300),
            claimAt,
          })
          .catch(() => {});
      }
    } finally {
      stopRenewal();
      backupInFlight.delete(key);
    }
  }
}

/** Một lượt tick: 1 query batch → xử lý toàn bộ việc chờ của mọi guild. */
async function runTickOnce(client, store, heat) {
  let jobs = null;
  if (Date.now() >= batchBrokenUntil) {
    try {
      jobs = await store.client.query("bot_tick:getPendingJobs", {});
      batchBrokenUntil = 0;
    } catch (e) {
      batchBrokenUntil = Date.now() + BATCH_RETRY_AFTER_MS;
      console.warn(`[tick] batch lỗi, tạm dùng fallback 10 phút: ${e?.message || e}`);
    }
  }

  if (jobs && typeof jobs === "object") {
    // Self-Diagnose: đồng bộ flag bật/tắt từ batch (không tốn call thêm).
    try {
      const cleared = applySettingsChanges(store, jobs.settingsChanges);
      if (cleared > 0)
        console.log(
          `[tick:settings] xóa cache config ${cleared} guild (dashboard vừa đổi cấu hình)`,
        );
    } catch (e) {
      console.error("[tick:settings]", e?.message || e);
    }
    try {
      require("./handlers/selfDiagnose").setEnabledFromJobs(jobs.selfDiagnose);
    } catch {}
    try {
      // Báo cáo ngày: gửi cho guild có cờ cron rồi xoá cờ (botSetReportAt).
      await require("./handlers/dailyReport").processReportJobs(
        client,
        store,
        heat,
        jobs.reports ?? [],
      );
    } catch (e) {
      console.error("[tick:reports]", e?.message || e);
    }
    try {
      await hiddenMod.processHiddenJobsData(client, store, jobs.hidden ?? []);
    } catch (e) {
      console.error("[tick:hidden]", e?.message || e);
    }
    try {
      await hiddenMod.processVerifyPanelItems(client, store, jobs.verifyPanels ?? []);
    } catch (e) {
      console.error("[tick:verify]", e?.message || e);
    }
    try {
      await require("./handlers/tickets").processOpenPanelItems(
        client,
        store,
        jobs.ticketPanels ?? [],
      );
    } catch (e) {
      console.error("[tick:ticketPanel]", e?.message || e);
    }
    try {
      await require("./handlers/ticketJobs").processTicketJobs(client, store, jobs.tickets ?? []);
    } catch (e) {
      console.error("[tick:tickets]", e?.message || e);
    }
    try {
      await runChannelLocks(client, store);
    } catch (e) {
      console.error("[tick:channelLock]", e?.message || e);
    }
    await runBackupJobs(client, store, jobs.backups ?? []);
    return;
  }

  // ---- Fallback: 3 query riêng (đúng hành vi cũ, chỉ khi batch không dùng được) ----
  try {
    const hiddenJobs = await store.client.query("hidden:getBotHiddenJobs", {});
    await hiddenMod.processHiddenJobsData(client, store, hiddenJobs ?? []);
  } catch (e) {
    console.error("[tick:hidden:fallback]", e?.message || e);
  }
  try {
    const items = await store.client.query("guilds:getVerifySendPanelGuilds", {});
    await hiddenMod.processVerifyPanelItems(client, store, items ?? []);
  } catch (e) {
    console.error("[tick:verify:fallback]", e?.message || e);
  }
  try {
    const pending = await store.client.query("backup:botGetPending", {});
    await runBackupJobs(client, store, pending ?? []);
  } catch (e) {
    console.error("[tick:backup:fallback]", e?.message || e);
  }
  try {
    await runChannelLocks(client, store);
  } catch (e) {
    console.error("[tick:channelLock:fallback]", e?.message || e);
  }
  // Batch hỏng: vẫn giữ đường báo cáo cũ (quét theo cache config) — nếu không,
  // báo cáo ngày sẽ đứng im suốt thời gian batch lỗi.
  try {
    await require("./handlers/dailyReport").runDailyReports(client, store, heat);
  } catch (e) {
    console.error("[tick:reports:fallback]", e?.message || e);
  }
}

/**
 * Gắn vòng tick sau khi bot online. Gọi 1 lần từ index.js (TỪ TRONG handler
 * clientReady).
 *
 * BẪY discord.js v14.27: `clientReady` emit SAU `ready` (WebSocketManager:
 * emit("ready") rồi emit(Events.ClientReady)). Nếu ở đây ta lại đăng ký
 * `client.once("ready")` thì listener gắn sau khi event đã bắn → KHÔNG BAO GIỜ
 * chạy → cả vòng tick (hidden + verify + backup/restore/import) chết lặng.
 * Đã từng xảy ra: gộp tick ngày 12/09 làm auto-backup đứng im tới 19/09.
 *
 * Vì vậy: client đã ready (isReady() true khi đang trong handler clientReady)
 * → chạy ngay; chỉ khi chưa ready mới chờ clientReady. Dùng đúng tên event
 * `clientReady` (không dùng `ready` đã deprecated).
 */
function setupTick(client, store, heat) {
  const start = () => {
    // Chạy ngay 1 lượt sau 15s (đợi gateway ổn định) — việc chờ từ lúc bot
    // offline (backup/panel/webhook log) được xử lý sớm, không đợi hết chu kỳ.
    setTimeout(() => runTickOnce(client, store, heat).catch(() => {}), 15_000).unref?.();
    const interval = setInterval(() => {
      runTickOnce(client, store, heat).catch((e) => console.error("[tick]", e?.message || e));
    }, TICK_INTERVAL_MS);
    interval.unref?.();
  };
  if (typeof client.isReady === "function" && client.isReady()) {
    start();
  } else {
    client.once("clientReady", start);
  }
}

module.exports = {
  setupTick,
  runBackupJobs,
  runTickOnce,
  applySettingsChanges,
  startClaimRenewal,
};
