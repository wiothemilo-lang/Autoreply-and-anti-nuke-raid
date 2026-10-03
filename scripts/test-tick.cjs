// Test vòng tick TỔNG HỢP (bot/src/tick.js):
//   - runTickOnce: batch bot_tick:getPendingJobs thành công → xử lý hidden/verify/backup;
//     batch lỗi/không phải object → fallback 3 query riêng; sau lỗi tạm bỏ batch.
//   - runBackupJobs: claim chống trùng, truyền claimAt fencing vào mọi processor,
//     dispatch backup/restore/import, tải file import (fileContent hoặc URL), báo lỗi đúng loại lên dashboard.
//   - readImportContent: URL lỗi/timeout/thiếu dữ liệu.
//   - setupTick: gắn 1 lần khi ready.
//   - settingsChanges: xóa cache config VÀ cache webhook của guild vừa sửa (nếu chỉ
//     xóa config thì thay đổi webhook log còn trễ tới 5 phút).
// Mock discord.js + handlers/{hidden,backup,selfDiagnose} + webhookHub (không mạng thật,
// không Convex thật).
// Chạy: node scripts/test-tick.cjs
const DJS_MOCK = require("./support/djs-mock-path.cjs");

const Module = require("module");
const fs = require("fs");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "discord.js") return DJS_MOCK;
  return origResolve.call(this, request, ...args);
};
fs.writeFileSync(DJS_MOCK, "module.exports = {};\n");

// ── Mocks cho các module mà tick.js require ──
const calls = {
  hidden: [],
  verify: [],
  backup: [],
  restore: [],
  plan: [],
  import: [],
  selfDiagnose: [],
  mutations: [],
  queries: [],
  invalidate: [],
  webhookCache: [],
  reports: [],
  reportsAll: [],
};
let batchResponse = null;
let batchShouldThrow = false;
let fallbackQueries = {};
let claimOk = true;
let claimAt = null;
let claimShouldThrow = false;
let backupShouldThrow = false;
let restoreShouldThrow = false;
let planShouldThrow = false;
let importShouldThrow = false;
let importFileUrlResponse = null;

const hiddenMock = {
  async processHiddenJobsData(client, store, data) {
    calls.hidden.push(data);
  },
  async processVerifyPanelItems(client, store, items) {
    calls.verify.push(items);
  },
};
const backupMock = {
  async runBackup(client, store, guildId, opts) {
    calls.backup.push({ guildId, opts });
    if (backupShouldThrow) throw new Error("backup lỗi");
  },
  async runRestore(client, store, guildId, backupJson, guildName, options) {
    calls.restore.push({ guildId, backupJson, guildName, options });
    if (restoreShouldThrow) throw new Error("restore lỗi");
  },
  async runRestorePlan(client, store, guildId, backupJson, guildName, options) {
    calls.plan.push({ guildId, backupJson, guildName, options });
    if (planShouldThrow) throw new Error("plan lỗi");
  },
  async runImportRestore(client, store, guildId, content, fileName, options) {
    calls.import.push({ guildId, content, fileName, options });
    if (importShouldThrow) throw new Error("import lỗi");
  },
};
// Webhook log cũng là cấu hình dashboard sửa được, nhưng cache ở webhookHub với
// TTL 5 phút — tick phải xoá luôn khi có tín hiệu cấu hình (xem applySettingsChanges).
const webhookMock = {
  invalidateCache(guildId) {
    calls.webhookCache.push(guildId);
  },
};

const selfDiagnoseMock = {
  setEnabledFromJobs(v) {
    calls.selfDiagnose.push(v);
  },
};
// Báo cáo ngày (đợt #4): tick xử lý cờ cron qua processReportJobs; batch hỏng thì
// rơi về runDailyReports (quét theo cache config) như hành vi cũ.
const dailyReportMock = {
  async processReportJobs(_client, _store, _heat, items) {
    calls.reports.push(items);
  },
  async runDailyReports(_client, _store, _heat) {
    calls.reportsAll.push(true);
  },
};

const origLoad = Module._load;
Module._load = function (request, parent) {
  const fromTick = parent && /bot[\\/]src[\\/]tick\.js$/.test(parent.filename);
  if (fromTick) {
    if (request === "./handlers/hidden") return hiddenMock;
    if (request === "./handlers/backup") return backupMock;
    if (request === "./handlers/selfDiagnose") return selfDiagnoseMock;
    if (request === "./handlers/dailyReport") return dailyReportMock;
    if (request === "./webhookHub") return webhookMock;
  }
  return origLoad.apply(this, arguments);
};

globalThis.fetch = async () => {
  if (importFileUrlResponse === "ok")
    return { ok: true, status: 200, text: async () => "nội-dung-file" };
  if (importFileUrlResponse === "http-error")
    return { ok: false, status: 500, text: async () => "" };
  throw new Error("mạng lỗi");
};

(async () => {
  const { runTickOnce, runBackupJobs, setupTick, startClaimRenewal } = require("../bot/src/tick");

  let pass = 0;
  let fail = 0;
  function check(label, cond) {
    if (cond) {
      pass++;
      console.log("PASS", label);
    } else {
      fail++;
      console.log("FAIL", label);
    }
  }
  const clear = () => {
    for (const k of Object.keys(calls)) calls[k].length = 0;
  };

  const client = {};
  const store = {
    client: {
      query: async (name) => {
        calls.queries.push(name);
        if (name === "bot_tick:getPendingJobs") {
          if (batchShouldThrow) throw new Error("batch chưa deploy");
          return batchResponse;
        }
        return fallbackQueries[name] ?? [];
      },
      mutation: async (name, args) => {
        calls.mutations.push({ name, args });
        if (name === "bot_writes:botClaimBackup") {
          if (claimShouldThrow) throw new Error("claim lỗi");
          return claimAt === null ? { ok: claimOk } : { ok: claimOk, claimAt };
        }
        return { ok: true };
      },
    },
    invalidate: (guildId) => calls.invalidate.push(guildId),
  };

  // ── 1. Batch thành công → xử lý hidden/verify/backup + selfDiagnose ──
  {
    clear();
    batchShouldThrow = false;
    batchResponse = {
      selfDiagnose: { enabled: true },
      hidden: [{ id: "h1" }],
      verifyPanels: [{ id: "v1" }],
      backups: [],
      reports: [{ guildId: "rep-g1" }],
    };
    await runTickOnce(client, store);
    check("batch thành công → gọi batch query", calls.queries.includes("bot_tick:getPendingJobs"));
    check(
      "batch thành công → xử lý hidden jobs",
      calls.hidden.length === 1 && calls.hidden[0][0].id === "h1",
    );
    check(
      "batch thành công → xử lý verify panels",
      calls.verify.length === 1 && calls.verify[0][0].id === "v1",
    );
    check("batch thành công → đồng bộ selfDiagnose", calls.selfDiagnose.length === 1);
    check(
      "batch thành công → xử lý báo cáo ngày từ cờ cron (jobs.reports)",
      calls.reports.length === 1 && calls.reports[0][0].guildId === "rep-g1",
    );
    check(
      "batch thành công → KHÔNG dùng fallback",
      !calls.queries.includes("hidden:getBotHiddenJobs"),
    );
  }

  // ── 1b. settingsChanges → xóa cache config (dashboard vừa sửa cấu hình) ──
  // Bối cảnh: cache getConfig là 30 phút, giao diện hứa "khoảng 3 phút" → không có
  // bước xóa cache này thì bật welcome/đổi module xong bot vẫn im lặng (bug 23/09).
  // Đặt NGAY sau case 1 vì case 3 bật cờ "tạm bỏ batch 10 phút" (batchBrokenUntil)
  // → mọi lượt tick sau đó không gọi batch nữa.
  {
    clear();
    batchResponse = {
      selfDiagnose: {},
      hidden: [],
      verifyPanels: [],
      backups: [],
      settingsChanges: [
        { guildId: "cfg-g1", at: 1000 },
        { guildId: "cfg-g2", at: 2000 },
      ],
    };
    await runTickOnce(client, store);
    check(
      "settingsChanges → xóa cache config từng guild vừa sửa",
      calls.invalidate.join(",") === "cfg-g1,cfg-g2",
    );
    check(
      "settingsChanges → xóa CẢ cache webhook (TTL 5 phút → áp dụng trong 1 tick)",
      calls.webhookCache.join(",") === "cfg-g1,cfg-g2",
    );

    clear();
    await runTickOnce(client, store);
    check(
      "cùng mốc cấu hình → không xóa cache lặp (chống reads thừa)",
      calls.invalidate.length === 0 && calls.webhookCache.length === 0,
    );

    clear();
    batchResponse.settingsChanges = [{ guildId: "cfg-g1", at: 3000 }];
    await runTickOnce(client, store);
    check("cấu hình đổi lần nữa → xóa cache lại", calls.invalidate.join(",") === "cfg-g1");
    check(
      "cấu hình đổi lần nữa → xóa cache webhook theo",
      calls.webhookCache.join(",") === "cfg-g1",
    );

    clear();
    batchResponse.settingsChanges = [{ guildId: "cfg-g3" }, { at: 5 }, null, "rác"];
    await runTickOnce(client, store);
    check(
      "mốc thiếu/rác → bỏ qua an toàn, không crash",
      calls.invalidate.length === 0 && calls.webhookCache.length === 0,
    );

    clear();
    batchResponse = { selfDiagnose: {}, hidden: [], verifyPanels: [], backups: [] };
    await runTickOnce(client, store);
    check("batch cũ không có settingsChanges → không xóa cache nào", calls.invalidate.length === 0);
  }

  // ── 2. Batch trả null → fallback 3 query ──
  {
    clear();
    batchResponse = null;
    fallbackQueries = {
      "hidden:getBotHiddenJobs": [{ id: "fh" }],
      "guilds:getVerifySendPanelGuilds": [{ id: "fv" }],
      "backup:botGetPending": [],
    };
    await runTickOnce(client, store);
    check(
      "batch null → fallback hidden",
      calls.queries.includes("hidden:getBotHiddenJobs") && calls.hidden.length === 1,
    );
    check(
      "batch null → fallback verify",
      calls.queries.includes("guilds:getVerifySendPanelGuilds"),
    );
    check("batch null → fallback backup", calls.queries.includes("backup:botGetPending"));
    check(
      "batch null → vẫn chạy vòng báo cáo theo cache config (không đứng im)",
      calls.reportsAll.length === 1,
    );
  }

  // ── 3. Batch lỗi → fallback + tạm bỏ batch lượt sau (10 phút) ──
  {
    clear();
    batchShouldThrow = true;
    fallbackQueries = {};
    await runTickOnce(client, store);
    check("batch lỗi → vẫn chạy fallback", calls.queries.includes("hidden:getBotHiddenJobs"));

    clear();
    await runTickOnce(client, store);
    check(
      "sau lỗi batch → lượt kế tiếp KHÔNG gọi batch (dùng fallback)",
      !calls.queries.includes("bot_tick:getPendingJobs"),
    );
  }

  // ── 4. runBackupJobs: claim bị từ chối → bỏ qua ──
  {
    clear();
    claimOk = false;
    await runBackupJobs(client, store, [{ guildId: "g1", kind: "backup" }]);
    check(
      "claim thất bại → không chạy backup",
      calls.backup.length === 0 &&
        calls.mutations.some((m) => m.name === "bot_writes:botClaimBackup"),
    );
    claimOk = true;
  }

  // ── 5. runBackupJobs: dispatch đúng loại ──
  {
    clear();
    claimAt = 12345;
    await runBackupJobs(client, store, [
      { guildId: "g1", kind: "backup", pushToGithub: true, includeMessages: true },
      { guildId: "g2", kind: "restore", backupJson: "{}", guildName: "G2" },
      { guildId: "g3", kind: "import", fileContent: "z:abc", fileName: "b.json" },
    ]);
    check(
      "kind backup → runBackup kèm cờ",
      calls.backup.length === 1 && calls.backup[0].opts.pushToGithub === true,
    );
    check("claimAt từ Convex được truyền vào backup", calls.backup[0].opts.claimAt === 12345);
    check(
      "kind restore → runRestore",
      calls.restore.length === 1 && calls.restore[0].guildName === "G2",
    );
    check("claimAt từ Convex được truyền vào restore", calls.restore[0].options.claimAt === 12345);
    check(
      "kind import (fileContent) → runImportRestore",
      calls.import.length === 1 && calls.import[0].content === "z:abc",
    );
    check("claimAt từ Convex được truyền vào import", calls.import[0].options.claimAt === 12345);
    claimAt = null;
  }

  // ── 6. runBackupJobs: import qua URL tải được ──
  {
    clear();
    importFileUrlResponse = "ok";
    await runBackupJobs(client, store, [
      {
        guildId: "g4",
        kind: "import",
        importFileUrl: "https://files.example/x",
        fileName: "x.json",
      },
    ]);
    check(
      "import qua URL → tải nội dung rồi restore",
      calls.import.length === 1 && calls.import[0].content === "nội-dung-file",
    );
  }

  // ── 7. runBackupJobs: lỗi từng loại → báo dashboard đúng mutation ──
  {
    clear();
    claimAt = 222;
    backupShouldThrow = true;
    await runBackupJobs(client, store, [{ guildId: "g1", kind: "backup" }]);
    check(
      "backup lỗi → botReportBackupError kèm claimAt",
      calls.mutations.some(
        (m) => m.name === "bot_writes:botReportBackupError" && m.args.claimAt === 222,
      ),
    );
    backupShouldThrow = false;

    clear();
    restoreShouldThrow = true;
    await runBackupJobs(client, store, [{ guildId: "g2", kind: "restore" }]);
    check(
      "restore lỗi → botReportRestoreError",
      calls.mutations.some((m) => m.name === "bot_writes:botReportRestoreError"),
    );
    restoreShouldThrow = false;

    clear();
    importShouldThrow = true;
    await runBackupJobs(client, store, [{ guildId: "g3", kind: "import", fileContent: "x" }]);
    check(
      "import lỗi → botReportImportError",
      calls.mutations.some((m) => m.name === "bot_writes:botReportImportError"),
    );
    importShouldThrow = false;
    claimAt = null;
  }

  // ── 8. runBackupJobs: claim lỗi mạng → bỏ qua an toàn ──
  // ── 7b. runBackupJobs: dry-run khôi phục (kind plan) ──
  // Batch tick từng không sinh job plan và runBackupJobs không có nhánh plan → nút
  // "xem kế hoạch khôi phục" trên dashboard quay mãi. Nay job được dispatch vào
  // runRestorePlan (KHÔNG phải runRestore — dry-run không được đụng server).
  {
    clear();
    claimAt = 4242;
    await runBackupJobs(client, store, [
      { guildId: "g5", kind: "plan", backupJson: "z:plan", guildName: "G5" },
    ]);
    check(
      "kind plan → runRestorePlan kèm nội dung + tên backup",
      calls.plan.length === 1 &&
        calls.plan[0].backupJson === "z:plan" &&
        calls.plan[0].guildName === "G5",
    );
    check("claimAt được truyền vào dry-run", calls.plan[0].options.claimAt === 4242);
    check("dry-run KHÔNG gọi runRestore (không đụng server)", calls.restore.length === 0);
    check(
      "claim giành quyền với đúng kind plan",
      calls.mutations.some((m) => m.name === "bot_writes:botClaimBackup" && m.args.kind === "plan"),
    );

    clear();
    planShouldThrow = true;
    await runBackupJobs(client, store, [{ guildId: "g5", kind: "plan", backupJson: "z:plan" }]);
    const report = calls.mutations.find((m) => m.name === "bot_writes:botReportRestorePlan");
    check(
      "dry-run lỗi → botReportRestorePlan kèm lý do + claimAt (để dashboard hết quay)",
      !!report && report.args.error === "plan lỗi" && report.args.claimAt === 4242,
    );
    check(
      "dry-run lỗi KHÔNG đi qua mutation lỗi backup/restore (sẽ đặt mốc xong giả)",
      !calls.mutations.some(
        (m) =>
          m.name === "bot_writes:botReportBackupError" ||
          m.name === "bot_writes:botReportRestoreError",
      ),
    );
    planShouldThrow = false;
    claimAt = null;
  }

  // ── 8. runBackupJobs: claim lỗi mạng → bỏ qua an toàn ──
  {
    clear();
    claimShouldThrow = true;
    await runBackupJobs(client, store, [{ guildId: "g9", kind: "backup" }]);
    check("claim lỗi → không chạy backup (không crash)", calls.backup.length === 0);
    claimShouldThrow = false;
  }

  // ── 9. runBackupJobs: danh sách rỗng → không làm gì ──
  {
    clear();
    await runBackupJobs(client, store, []);
    await runBackupJobs(client, store, null);
    check("danh sách rỗng/null → không mutation", calls.mutations.length === 0);
  }

  // ── 10. readImportContent: URL lỗi HTTP / thiếu dữ liệu ──
  {
    clear();
    importFileUrlResponse = "http-error";
    await runBackupJobs(client, store, [
      { guildId: "g5", kind: "import", importFileUrl: "https://files.example/y" },
    ]);
    check(
      "URL lỗi HTTP → botReportImportError (không crash)",
      calls.mutations.some((m) => m.name === "bot_writes:botReportImportError") &&
        calls.import.length === 0,
    );

    clear();
    await runBackupJobs(client, store, [{ guildId: "g6", kind: "import" }]);
    check(
      "import thiếu URL lẫn fileContent → báo lỗi",
      calls.mutations.some((m) => m.name === "bot_writes:botReportImportError"),
    );
  }

  // ── 11. setupTick: bot ĐÃ ready (index.js gọi từ trong clientReady) phải chạy
  // NGAY, không phụ thuộc listener — discord.js v14.27 emit clientReady SAU ready
  // nên `client.once("ready")` đăng ký muộn sẽ không bao giờ chạy (bug auto-backup
  // đứng im 12→19/09). Test cũ khóa hành vi sai (events.includes("ready")). ──
  {
    const realSetTimeout = global.setTimeout;
    const realSetInterval = global.setInterval;
    let started = 0;
    global.setTimeout = () => {
      started++;
      return { unref: () => {} };
    };
    global.setInterval = () => ({ unref: () => {} });
    try {
      const readyEvents = [];
      const readyClient = {
        isReady: () => true,
        once(evt) {
          readyEvents.push(evt);
        },
      };
      setupTick(readyClient, store);
      check("setupTick: bot đã ready → chạy ngay (không chờ event)", started === 1);
      check("setupTick: bot đã ready → KHÔNG đăng ký listener chết", readyEvents.length === 0);

      started = 0;
      const events = [];
      const notReadyClient = {
        isReady: () => false,
        once(evt, fn) {
          events.push(evt);
          fn();
        },
      };
      setupTick(notReadyClient, store);
      check("setupTick: chưa ready → đăng ký clientReady", events.includes("clientReady"));
      check("setupTick: KHÔNG dùng event 'ready' đã deprecated", !events.includes("ready"));
      check("setupTick: chưa ready → chờ event rồi mới chạy", started === 1);
    } finally {
      global.setTimeout = realSetTimeout;
      global.setInterval = realSetInterval;
    }
  }

  // ── 12. Gia hạn lease khi job chạy dài. restoreCore tự gia hạn theo từng bước,
  // nhưng nhánh BACKUP (chụp snapshot role/kênh/tin) không có bước nào để móc vào
  // → lease 10 phút hết hạn giữa chừng, Convex từ chối kết quả cuối (`stale_claim`)
  // và chính lần báo lỗi cũng dùng claimAt cũ nên cũng bị từ chối ⇒ dashboard im
  // lặng, cờ yêu cầu còn nguyên ⇒ bot chụp lại từ đầu mỗi lượt tick, vô hạn. ──
  {
    clear();
    const stop = startClaimRenewal(store, "g9", "backup", 777, 5);
    await new Promise((r) => setTimeout(r, 30));
    const renewals = calls.mutations.filter((m) => m.name === "bot_writes:botRenewBackupClaim");
    check(
      "gia hạn lease: gọi botRenewBackupClaim định kỳ với đúng claimAt (fencing token)",
      renewals.length >= 1 &&
        renewals.every(
          (m) => m.args.guildId === "g9" && m.args.kind === "backup" && m.args.claimAt === 777,
        ),
    );
    stop();
    const before = calls.mutations.length;
    await new Promise((r) => setTimeout(r, 20));
    check("gia hạn lease: job xong → DỪNG gia hạn", calls.mutations.length === before);

    clear();
    const stopNoop = startClaimRenewal(store, "g9", "backup", undefined, 5);
    await new Promise((r) => setTimeout(r, 20));
    check(
      "gia hạn lease: bot bản cũ không gửi claimAt → không gia hạn (không gọi thừa)",
      calls.mutations.length === 0,
    );
    stopNoop();
  }

  fs.unlinkSync(DJS_MOCK);
  console.log(`\nKết quả tick: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
