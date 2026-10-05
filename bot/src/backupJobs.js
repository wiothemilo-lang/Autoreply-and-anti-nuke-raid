/**
 * backupJobs.js — clone cấu trúc từ server nguồn sang server đích.
 * Tách từ handlers/backup.js (đợt #5).
 *
 * VÌ SAO FILE NÀY GIỜ CHỈ CÒN `cloneToServer`:
 * Trước đây file này giữ `pollBackups` + `claim` + `inFlight` — vòng quét định
 * kỳ đọc `backup:botGetPending` rồi định tuyến job backup/restore/plan/import.
 * Nhưng bot KHÔNG còn gọi nó: `index.js` chạy duy nhất qua `tick.js`
 * (`setupTick` → `runBackupJobs`), và cả hai nơi require `./handlers/backup`
 * (`tick.js`, `localSnapshot.js`) đều chỉ đọc THUỘC TÍNH của module
 * (`runBackup`, `snapshotWithSettings`…), không ai gọi export mặc định. Vòng quét
 * cũ bị `bot_tick:getPendingJobs` thay thế (gộp 1 batch call thay vì vài
 * query riêng).
 *
 * Hậu quả khi để lại: hai bản sao logic định tuyến job cùng sống. Điều đó
 * KHÔNG phải chuyện lý thuyết — bản fix "backup hỏng thì báo lỗi thay vì treo
 * cờ restore" phải vá CẢ HAI chỗ, và bản vá lọt ở `bot_tick` đã khiến
 * `backupChecksum` không bao giờ tới bot trên toàn bộ đường thật. Xoá bản sao
 * để chỉ còn một nguồn sự thật.
 */
const { filterBackupComponents } = require("./backupUtils");
const { snapshotWithSettings } = require("./backupCapture");
const { restoreCore } = require("./backupRestore");

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
  cloneToServer,
};
