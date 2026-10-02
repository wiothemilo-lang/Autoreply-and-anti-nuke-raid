/**
 * backupJobs.js — vòng quét định kỳ + giành quyền xử lý (claim) + lịch tự động
 * backup + clone giữa hai server. Tách từ handlers/backup.js (đợt #5) — code
 * giữ nguyên hành vi.
 *
 * `pollBackups` là điểm vào chính (index.js/tick.js gọi mỗi ~20 giây): đọc
 * backup:botGetPending rồi định tuyến theo kind (backup/restore/plan/import);
 * mọi nhánh đều đi qua `claim` (botClaimBackup) để hai bot chạy song song không
 * xử lý trùng, và lỗi luôn báo ngược lên dashboard bằng mutation riêng.
 */
const { filterBackupComponents } = require("./backupUtils");
const { runBackup, snapshotWithSettings } = require("./backupCapture");
const { restoreCore, runRestore, runRestorePlan } = require("./backupRestore");
const { readImportContent, runImportRestore } = require("./backupImport");

/**
 * Chống lặp backup ngay trong process: guild đang được xử lý sẽ bị bỏ qua ở
 * lượt quét tiếp theo (kể cả khi lượt quét 20s bị chồng lấn do GitHub chậm).
 */
const inFlight = new Set();

/** Giành quyền xử lý trên Convex — chỉ ai claim được mới được chạy (chống trùng khi chạy 2 bot). */
async function claim(client, store, guildId, kind) {
  try {
    const res = await store.client.mutation("bot_writes:botClaimBackup", {
      guildId,
      kind,
    });
    // Backend cũ chưa trả claimAt vẫn chạy được; undefined bị JSON stringify
    // bỏ khỏi args, nên không làm bot mới gửi field lạ lên Convex cũ.
    return res?.ok ? { claimAt: typeof res.claimAt === "number" ? res.claimAt : null } : null;
  } catch (e) {
    console.error(`[backup:claim] ${guildId}:`, e.message);
    return false;
  }
}

/** Vòng quét định kỳ: nhận yêu cầu backup / khôi phục / import từ dashboard. */
async function pollBackups(client, store) {
  let pending;
  try {
    pending = await store.client.query("backup:botGetPending", {});
  } catch (e) {
    console.error(`[backup:poll]`, e.message);
    return;
  }
  if (!pending || pending.length === 0) return;
  for (const item of pending) {
    const key = `${item.guildId}:${item.kind}`;
    if (inFlight.has(key)) continue; // lượt quét trước đang xử lý — bỏ qua.
    // Giành quyền: nếu bot khác/lượt quét khác đã giành thì bỏ qua (không lặp).
    const lease = await claim(client, store, item.guildId, item.kind);
    if (!lease) continue;
    const claimAt = lease.claimAt ?? undefined;
    inFlight.add(key);
    try {
      if (item.kind === "backup") {
        await runBackup(client, store, item.guildId, {
          pushToGithub: !!item.pushToGithub,
          includeMessages: !!item.includeMessages,
          skipNotice: true,
          claimAt,
        });
      } else if (item.kind === "restore") {
        await runRestore(client, store, item.guildId, item.backupJson, item.guildName, {
          claimAt,
        });
      } else if (item.kind === "plan") {
        await runRestorePlan(client, store, item.guildId, item.backupJson, item.guildName, {
          claimAt,
        });
      } else if (item.kind === "import") {
        const content = await readImportContent(item);
        await runImportRestore(client, store, item.guildId, content, item.fileName, {
          claimAt,
        });
      }
    } catch (e) {
      console.error(`[backup:${item.kind}] ${item.guildId}:`, e.message);
      // Luôn đi qua mutation báo lỗi riêng. `botClearBackup` được xem là
      // xử lý thành công và sẽ đặt restoreFinishedAt/lastBackupAt — dùng nó ở
      // catch khiến dashboard báo xong giả sau khi restore/backup đã hỏng.
      const reportKind =
        item.kind === "import"
          ? "bot_writes:botReportImportError"
          : item.kind === "restore"
            ? "bot_writes:botReportRestoreError"
            : item.kind === "plan"
              ? "bot_writes:botReportRestorePlan"
              : "bot_writes:botReportBackupError";
      await store.client
        .mutation(reportKind, {
          guildId: item.guildId,
          error: String(e?.message || "Lỗi không xác định").slice(0, 300),
          claimAt,
        })
        .catch(() => {});
    } finally {
      inFlight.delete(key);
    }
  }
}

/**
 * Bot quét mỗi giờ: tìm server đã bật lịch tự động backup (2-30 ngày) và đã đến
 * hạn → đặt cờ yêu cầu để vòng tick thực hiện (đẩy lên GitHub chủ bot).
 * "Kèm tin nhắn" của bản auto theo bản backup gần nhất của từng server (đọc
 * backupMessageCount từ backup:botGetLastChecksum), để incremental backup so
 * checksum cùng chế độ — không tạo bản trùng lặp khi server không đổi.
 */
async function autoBackupSweep(client, store) {
  let due;
  try {
    due = await store.client.query("backup:botGetDueAuto", {});
  } catch (e) {
    console.error(`[backup:auto]`, e.message);
    return;
  }
  if (!due || due.length === 0) return;
  for (const item of due) {
    try {
      // Đồng bộ lựa chọn "Kèm tin nhắn" theo BẢN BACKUP GẦN NHẤT của server:
      // bản gần nhất có tin nhắn (messageCount > 0) → auto backup cũng kèm tin.
      // Quan trọng cho incremental: checksum snapshot phải cùng chế độ với bản
      // trước, ngược lại server không đổi vẫn tạo bản trùng lặp (hoặc bỏ nhầm).
      const last = await store.client
        .query("backup:botGetLastChecksum", { guildId: item.guildId })
        .catch(() => null);
      const includeMessages = (last?.backupMessageCount ?? 0) > 0;
      await store.client.mutation("bot_writes:botSetBackupRequest", {
        guildId: item.guildId,
        pushToGithub: true,
        includeMessages,
      });
      console.log(
        `[backup:auto] ${item.guildId}: lịch mỗi ${item.days} ngày → đã đặt yêu cầu backup`,
      );
    } catch (e) {
      console.error(`[backup:auto] ${item.guildId}:`, e.message);
    }
  }
}

/**
 * Clone server structure to another server.
 * Takes a backup from one server and restores it on the target.
 */
async function cloneToServer(
  client,
  store,
  sourceGuildId,
  targetGuildId,
  { componentFilter } = {},
) {
  const sourceGuild = client.guilds.cache.get(sourceGuildId);
  if (!sourceGuild) throw new Error("Bot khong co trong server nguon");
  const targetGuild = client.guilds.cache.get(targetGuildId);
  if (!targetGuild) throw new Error("Bot khong co trong server dich");

  // Take a snapshot of the source server
  const { snapshot } = await snapshotWithSettings(client, store, sourceGuildId, false);

  // Apply component filter if provided
  let backupData = snapshot;
  if (componentFilter) {
    backupData = filterBackupComponents(snapshot, componentFilter);
  }

  // Restore on the target server
  const result = await restoreCore(client, store, targetGuildId, backupData, {
    backupName: sourceGuild.name + " (clone)",
    source: "clone",
  });

  return { ...result, sourceName: sourceGuild.name, targetName: targetGuild.name };
}

module.exports = {
  pollBackups,
  claim,
  autoBackupSweep,
  cloneToServer,
};
