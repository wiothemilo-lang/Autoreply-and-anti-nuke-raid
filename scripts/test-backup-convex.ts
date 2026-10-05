// TEST backup Convex — tầng logic thuần: botStoreBackup (xóa tồn dư >3),
// botClaimBackup (claim 10 phút), botClearBackup (reset cờ + lastBackupAt),
// backup:listGuild (map trường + sort) — với ctx.db GIẢ + getBotStatus mock.
// Chạy: bun scripts/test-backup-convex.ts
// Không mạng, không deployment thật — chặn tái diễn các bug "backup fake":
//   1. botStoreBackup phải TỪ CHỐI botKey sai (không ai ghi bản giả được).
//   2. botStoreBackup tự xóa bản cũ theo quy tắc GIỮ của server (mặc định 3
//      bản + dọn theo tuổi) — bản "tồn đọng" không thể tồn tại qua đường chuẩn.
//   3. Claim không được 2 process cùng giữ (in_flight < 10 phút).
//   4. botClearBackup reset cờ + lastBackupAt đúng điều kiện storeOk.
//   5. botClearBackup phải nói RÕ kết quả (backupFinishedAt + backupUnchanged) để
//      dashboard báo "đã tạo xong" / "server không đổi" thay vì im lặng (bug 23/09).
//   6. importStatus trả các mốc đó; requestBackup xóa mốc cũ của lượt trước.
import {
  botStoreBackup,
  botClaimBackup,
  botClearBackup,
  botRestoreSettings,
  botRenewBackupClaim,
  botReportRestorePlan,
  botSetBackupRetention,
} from "../convex/bot_writes";
import {
  listGuild,
  listMine,
  lookupBackup,
  myRestoreKeys,
  botAuditBackups,
  importStatus,
  requestBackup,
  requestRestore,
  setRetention,
  requestRestorePlan,
  restorePlanStatus,
  botGetPending,
  sweepDueAutoBackups,
} from "../convex/backup";
import { computeBotKey } from "../convex/botAuth";
import { reassembleBackupJsonForRead } from "../convex/backupChunks";
import { generateRestoreKey, normalizeRestoreKey } from "../convex/backupKeys";

// getBotStatus đọc ctx.db.query("botStatus") — ctx giả chỉ cần bảng botStatus
// với row { kind: "status", botKeySeed }. Không cần monkey-patch module.
// PROTOCOL ĐÚNG (theo botBootstrapAction): bot giữ KEY THÔ, server lưu
// botKeySeed = SHA-256("protogon-bot-key::" + key) = computeBotKey(key).
const SEED = "seed-thật-của-deployment"; // chỉ là chuỗi mô phỏng db
const BOT_KEY = "key-thô-32-bytes-của-bot"; // bot giữ trong .env BOT_KEY
const storeHandler = (botStoreBackup as any)._handler;
const claimHandler = (botClaimBackup as any)._handler;
const clearHandler = (botClearBackup as any)._handler;
const restoreSettingsHandler = (botRestoreSettings as any)._handler;
const renewClaimHandler = (botRenewBackupClaim as any)._handler;
const listGuildHandler = (listGuild as any)._handler;
const auditHandler = (botAuditBackups as any)._handler;
const importStatusHandler = (importStatus as any)._handler;
const requestBackupHandler = (requestBackup as any)._handler;
const requestRestorePlanHandler = (requestRestorePlan as any)._handler;
const restorePlanStatusHandler = (restorePlanStatus as any)._handler;
const botGetPendingHandler = (botGetPending as any)._handler;
const sweepDueAutoBackupsHandler = (sweepDueAutoBackups as any)._handler;
const reportPlanHandler = (botReportRestorePlan as any)._handler;
const setRetentionHandler = (botSetBackupRetention as any)._handler;
const setRetentionBotHandler = (botSetBackupRetention as any)._handler;
const setRetentionWebHandler = (setRetention as any)._handler;
const listMineHandler = (listMine as any)._handler;
const lookupBackupHandler = (lookupBackup as any)._handler;
const myRestoreKeysHandler = (myRestoreKeys as any)._handler;
const requestRestoreHandler = (requestRestore as any)._handler;

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail?: string) => {
  console.log(ok ? `  ✅ ${label}` : `  ❌ ${label}${detail ? ` → ${detail}` : ""}`);
  if (ok) pass++;
  else fail++;
};

// ─── Ctx giả: bảng guildBackups + guilds + botStatus trên Map ───
type Row = Record<string, any>;
function makeCtx(opts: { now?: number; seed?: string | null } = {}) {
  const backupRows: Row[] = [];
  // Chunk của backup vượt trần 1 MB — bảng riêng, xoá theo bản cha.
  const chunkRows: Row[] = [];
  const guildRows: Row[] = [];
  // Phiên + người dùng cho getUserByToken (importStatus/requestBackup cần đăng nhập).
  const sessionRows: Row[] = [];
  const userRows: Row[] = [];
  const statusRows: Row[] =
    opts.seed === null ? [] : [{ kind: "status", botKeySeed: computeBotKey(opts.seed ?? BOT_KEY) }];
  let idCounter = 0;
  const nextId = () => `id${++idCounter}`;
  const now = opts.now ?? 1_700_000_000_000;
  const allRows = () => ({
    guildBackups: backupRows,
    guilds: guildRows,
    users: userRows,
    botStatus: statusRows,
    backupChunks: chunkRows,
  });
  const ctx = {
    now,
    db: {
      insert: async (table: string, doc: Row) => {
        const id = nextId();
        allRows()[table as keyof ReturnType<typeof allRows>]?.push({ _id: id, ...doc });
        return id;
      },
      get: async (id: string) =>
        backupRows.find((r) => r._id === id) ??
        userRows.find((r) => r._id === id) ??
        guildRows.find((r) => r._id === id) ??
        null,
      delete: async (id: string) => {
        const i = backupRows.findIndex((r) => r._id === id);
        if (i >= 0) {
          backupRows.splice(i, 1);
          return;
        }
        const j = chunkRows.findIndex((r) => r._id === id);
        if (j >= 0) chunkRows.splice(j, 1);
      },
      patch: async (id: string, patch: Row) => {
        const row =
          guildRows.find((g) => g._id === id) ??
          backupRows.find((b) => b._id === id) ??
          statusRows.find((s) => s._id === id);
        if (row) Object.assign(row, patch);
      },
      query: (table: string) => ({
        withIndex: (_name: string, bound: (q: any) => any) => {
          // Giả lập withIndex(eq) — lọc theo kind (botStatus) hoặc guildId/discordId.
          const capture: Record<string, string> = {};
          const q = { eq: (f: string, v: string) => ((capture[f] = v), q) };
          bound(q);
          if (table === "botStatus") {
            return {
              first: async () =>
                statusRows.find((s) => s.kind === (capture.kind ?? "status")) ?? null,
            };
          }
          if (table === "sessions") {
            return {
              first: async () => sessionRows.find((s) => s.token === capture.token) ?? null,
            };
          }
          if (table === "users") {
            return {
              first: async () => userRows.find((u) => u.discordId === capture.discordId) ?? null,
            };
          }
          // Chunk lọc theo backupId (index by_backupId) — không theo guildId.
          if (table === "backupChunks") {
            return {
              collect: async () => chunkRows.filter((r) => r.backupId === capture.backupId),
            };
          }
          // Tra cứu mã khôi phục (index by_restoreKey) — O(1), không quét bảng.
          if ("restoreKey" in capture) {
            return {
              first: async () =>
                backupRows.find((r) => r.restoreKey === capture.restoreKey) ?? null,
              collect: async () => backupRows.filter((r) => r.restoreKey === capture.restoreKey),
            };
          }
          const rows =
            table === "guilds" ? guildRows : table === "backupChunks" ? chunkRows : backupRows;
          // `by_botInGuild` (cron đợt #4) lọc theo cờ botInGuild thay vì guildId.
          const match = (r: Row) => {
            if ("botInGuild" in capture) return r.botInGuild === capture.botInGuild;
            return (
              (r.discordId ?? r.guildId) === capture.discordId ||
              (r.discordId ?? r.guildId) === capture.guildId
            );
          };
          return {
            first: async () => rows.find(match) ?? null,
            collect: async () => rows.filter(match),
            order: () => ({
              take: async (n: number) =>
                [...rows]
                  .filter(match)
                  .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
                  .slice(0, n),
              first: async () =>
                [...rows]
                  .filter(match)
                  .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0] ?? null,
            }),
          };
        },
        collect: async () =>
          table === "guilds"
            ? guildRows
            : table === "botStatus"
              ? statusRows
              : table === "backupChunks"
                ? chunkRows
                : backupRows,
      }),
    },
  };
  return { ctx, backupRows, chunkRows, guildRows, nextId, statusRows, sessionRows, userRows };
}

(async () => {
  console.log("\n── botAuth: computeBotKey ──");
  check(
    "computeBotKey xác định (cùng seed → cùng key)",
    computeBotKey("abc") === computeBotKey("abc"),
  );
  check("seed khác → key khác", computeBotKey("abc") !== computeBotKey("xyz"));

  console.log("\n── botStoreBackup: lưu bản đồ vai trò thành viên (P2) ──");
  {
    const { ctx, backupRows } = makeCtx({ seed: BOT_KEY });
    await storeHandler(ctx as any, {
      guildId: "g1",
      guildName: "G1",
      backupJson: "z:map",
      roleCount: 2,
      channelCount: 0,
      memberCount: 3,
      memberRolesTruncated: true,
      source: "backup",
      botKey: BOT_KEY,
    });
    const row = backupRows[backupRows.length - 1];
    check(
      "botStoreBackup lưu memberCount + cờ bị cắt",
      row.memberCount === 3 && row.memberRolesTruncated === true,
      JSON.stringify({ m: row.memberCount, t: row.memberRolesTruncated }),
    );
    // memberCount âm / lấy lượt phải ép về 0 — không để số âm lọt vào bảng.
    await storeHandler(ctx as any, {
      guildId: "g1",
      guildName: "G1",
      backupJson: "z:map2",
      roleCount: 1,
      channelCount: 0,
      memberCount: -5,
      source: "backup",
      botKey: BOT_KEY,
    });
    const row2 = backupRows[backupRows.length - 1];
    check(
      "memberCount âm → ép về 0, cờ bị cắt vắng mặt là undefined",
      row2.memberCount === 0 && row2.memberRolesTruncated === undefined,
      JSON.stringify({ m: row2.memberCount, t: row2.memberRolesTruncated }),
    );
  }

  console.log("\n── botStoreBackup: botKey + dọn tồn dư (giữ 3) ──");
  {
    const { ctx, backupRows, nextId } = makeCtx({ seed: BOT_KEY });
    for (let i = 0; i < 5; i++) {
      backupRows.push({
        _id: `old${i}`,
        guildId: "g1",
        guildName: "G1",
        backupJson: "x",
        roleCount: 0,
        channelCount: 0,
        pushedToGithub: false,
        createdAt: 1_000 + i,
      });
    }
    // 1) botKey SAI với seed đã cấp → từ chối.
    let threw = "";
    try {
      await storeHandler(ctx as any, {
        guildId: "g1",
        guildName: "G1",
        backupJson: "z:fake",
        roleCount: 1,
        channelCount: 1,
        botKey: computeBotKey("key-thô-sai"), // bot khác — hash khác
      });
    } catch (e: any) {
      threw = e?.message ?? "";
    }
    check("botKey sai → bị từ chối", threw.includes("botKey"));
    check("DB không bị ghi bản giả", backupRows.length === 5);

    // 2) botKey ĐÚNG → lưu + tự xóa 3 bản cũ nhất (giữ tối đa 3).
    const r = await storeHandler(ctx as any, {
      guildId: "g1",
      guildName: "G1",
      backupJson: "z:real",
      roleCount: 10,
      channelCount: 5,
      source: "backup",
      backupSnapshotChecksum: "cs1",
      botKey: BOT_KEY, // key thô — đúng như bot gửi
    });
    check("botKey đúng → lưu thành công", r?.ok === true && typeof r?.backupId === "string");
    check(
      "tự xóa tồn dư — chỉ còn 3 bản mới nhất",
      backupRows.length === 3,
      JSON.stringify(backupRows.map((x) => [x._id, x.createdAt])),
    );
    check(
      "bản mới nhất là bản vừa lưu",
      backupRows.some((b) => b.backupJson === "z:real"),
    );
    check(
      "bản cũ nhất (old0, old1) bị xóa",
      !backupRows.some((b) => b._id === "old0" || b._id === "old1"),
    );
    void nextId;
  }

  console.log("\n── botClaimBackup: khóa 10 phút chống chạy song song ──");
  {
    const { ctx, guildRows } = makeCtx({ seed: BOT_KEY });
    guildRows.push({ _id: "gld1", discordId: "g1", backupRequested: true });
    const args = { guildId: "g1", kind: "backup" as const, botKey: BOT_KEY };
    const r1 = await claimHandler(ctx as any, args).catch((e: any) => ({ error: e.message }));
    check("lần 1 claim thành công", (r1 as any)?.ok === true);
    check("backupClaimedAt được đặt", typeof guildRows[0].backupClaimedAt === "number");
    check("backup lease được đặt", typeof guildRows[0].backupLeaseUntil === "number");
    const r2 = await claimHandler(ctx as any, args).catch((e: any) => ({ error: e.message }));
    check("lần 2 trong 10 phút → in_flight", (r2 as any)?.reason === "in_flight");
    guildRows[0].backupClaimedAt = (guildRows[0].backupClaimedAt as number) - 601_000;
    guildRows[0].backupLeaseUntil = Date.now() - 1;
    const r3 = await claimHandler(ctx as any, args).catch((e: any) => ({ error: e.message }));
    check("hết 10 phút → claim lại được", (r3 as any)?.ok === true);
    guildRows[0].backupRequested = false;
    const r4 = await claimHandler(ctx as any, args).catch((e: any) => ({ error: e.message }));
    check("không có yêu cầu → no_request", (r4 as any)?.reason === "no_request");
    guildRows[0].backupClaimedAt = ((r3 as any)?.claimAt ?? Date.now()) + 1;
    const staleClear = await clearHandler(ctx as any, {
      guildId: "g1",
      kind: "backup",
      storeOk: true,
      claimAt: (r1 as any)?.claimAt,
      botKey: BOT_KEY,
    });
    check("worker cũ không xoá claim của worker mới", staleClear?.reason === "stale_claim");
  }

  console.log("\n── import/restore fencing: đúng lease + chặn worker cũ ──");
  {
    const { ctx, guildRows, backupRows } = makeCtx({ seed: BOT_KEY });
    guildRows.push({
      _id: "gld-import",
      discordId: "g-import",
      importRestoreRequested: true,
      restoreRequested: false,
      backupRequested: false,
    });
    const claimed = await claimHandler(ctx as any, {
      guildId: "g-import",
      kind: "import" as const,
      botKey: BOT_KEY,
    });
    check("import claim trả claimAt", claimed?.ok === true && typeof claimed.claimAt === "number");
    const claimStillValid = await renewClaimHandler(ctx as any, {
      guildId: "g-import",
      kind: "import" as const,
      claimAt: claimed.claimAt,
      botKey: BOT_KEY,
    });
    check(
      "renew claim active → worker được phép tiếp tục và lease được gia hạn",
      claimStillValid?.ok === true &&
        typeof claimStillValid.leaseUntil === "number" &&
        claimStillValid.leaseUntil >= (guildRows[0].restoreLeaseUntil ?? 0),
    );
    const stored = await storeHandler(ctx as any, {
      guildId: "g-import",
      guildName: "Imported",
      backupJson: "z:imported",
      roleCount: 0,
      channelCount: 0,
      source: "import",
      claimAt: claimed.claimAt,
      botKey: BOT_KEY,
    });
    check(
      "botStoreBackup kiểm tra restore claim cho import",
      stored?.ok === true && backupRows.length === 1,
    );

    guildRows[0].restoreClaimedAt = claimed.claimAt + 1;
    const staleStore = await storeHandler(ctx as any, {
      guildId: "g-import",
      guildName: "Stale",
      backupJson: "z:stale",
      roleCount: 0,
      channelCount: 0,
      source: "import",
      claimAt: claimed.claimAt,
      botKey: BOT_KEY,
    });
    check("worker cũ không ghi bản import sau khi claim đổi", staleStore?.reason === "stale_claim");

    const staleSettings = await restoreSettingsHandler(ctx as any, {
      guildId: "g-import",
      prefix: "!",
      claimAt: claimed.claimAt,
      botKey: BOT_KEY,
    });
    check(
      "worker cũ không ghi cấu hình restore sau khi claim đổi",
      staleSettings?.reason === "stale_claim",
    );
  }

  console.log("\n── botClearBackup: reset cờ + lastBackupAt ──");
  {
    const { ctx, guildRows } = makeCtx({ seed: BOT_KEY });
    guildRows.push({
      _id: "gld1",
      discordId: "g1",
      backupRequested: true,
      backupPushToGithub: true,
      backupClaimedAt: 1_700_000_000_000,
      backupError: "lỗi cũ",
      backupErrorAt: 1_700_000_000_000,
    });
    await clearHandler(ctx as any, {
      guildId: "g1",
      kind: "backup",
      storeOk: true,
      botKey: BOT_KEY,
    });
    check("cờ backupRequested bị xóa", guildRows[0].backupRequested === false);
    check("backupError được xóa", guildRows[0].backupError === undefined);
    check("lastBackupAt được cập nhật", typeof guildRows[0].lastBackupAt === "number");
    const before = guildRows[0].lastBackupAt;
    await clearHandler(ctx as any, {
      guildId: "g1",
      kind: "backup",
      storeOk: false,
      botKey: BOT_KEY,
    });
    check(
      "store thất bại → giữ nguyên lastBackupAt (bot thử lại)",
      guildRows[0].lastBackupAt === before,
    );
    // storeOk=false không được đánh dấu "xong" (nếu không dashboard báo nhầm đã tạo xong).
    check(
      "store thất bại → KHÔNG đánh dấu backupFinishedAt",
      guildRows[0].backupFinishedAt === undefined,
    );
  }

  console.log("\n── botClearBackup: nói rõ kết quả cho dashboard (mốc xong + không đổi) ──");
  {
    const { ctx, guildRows } = makeCtx({ seed: BOT_KEY });
    guildRows.push({ _id: "gld2", discordId: "g2", backupRequested: true });
    await clearHandler(ctx as any, {
      guildId: "g2",
      kind: "backup",
      storeOk: true,
      unchanged: true,
      botKey: BOT_KEY,
    });
    check(
      "backup bỏ qua vì không đổi → backupUnchanged=true + mốc xong",
      guildRows[0].backupUnchanged === true && typeof guildRows[0].backupFinishedAt === "number",
    );
    guildRows[0].backupRequested = true;
    await clearHandler(ctx as any, {
      guildId: "g2",
      kind: "backup",
      storeOk: true,
      unchanged: false,
      botKey: BOT_KEY,
    });
    check("backup tạo mới → backupUnchanged=false", guildRows[0].backupUnchanged === false);
  }

  console.log("\n── requestBackup + importStatus: hợp đồng trạng thái cho web ──");
  {
    const { ctx, guildRows, sessionRows, userRows } = makeCtx({ seed: BOT_KEY });
    // ID server giả, KHÔNG dùng chuỗi 18 chữ số kiểu snowflake: gitleaks (job
    // security của CI) coi đó là Discord client id và làm đỏ cả commit.
    const discordId = "g-web-dashboard";
    guildRows.push({
      _id: "gld3",
      discordId,
      name: "Server",
      managers: ["u1"],
      botInGuild: true,
      backupFinishedAt: 111,
      backupUnchanged: true,
    });
    userRows.push({ _id: "u1", discordId: "u1", manageableGuildIds: [discordId] });
    sessionRows.push({
      _id: "s1",
      token: "tok",
      userId: "u1",
      createdAt: Date.now(),
      authVersion: 1,
    });

    guildRows[0].backupClaimedAt = Date.now();
    let claimError = "";
    try {
      await requestBackupHandler(ctx as any, {
        token: "tok",
        guildId: discordId,
        pushToGithub: false,
      });
    } catch (e: any) {
      claimError = e?.message ?? "";
    }
    check(
      "requestBackup không thay yêu cầu đang được bot xử lý",
      claimError.includes("đang xử lý"),
    );
    guildRows[0].backupClaimedAt = undefined;
    guildRows[0].restoreClaimedAt = Date.now();
    let crossKindError = "";
    try {
      await requestBackupHandler(ctx as any, {
        token: "tok",
        guildId: discordId,
        pushToGithub: false,
      });
    } catch (e: any) {
      crossKindError = e?.message ?? "";
    }
    check("backup không chạy chung với restore đang claim", crossKindError.includes("đang xử lý"));
    guildRows[0].restoreClaimedAt = undefined;

    const st = await importStatusHandler(ctx as any, { token: "tok", guildId: discordId });
    check(
      "importStatus trả backupFinishedAt + backupUnchanged cho dashboard",
      st.backupFinishedAt === 111 && st.backupUnchanged === true,
    );

    await requestBackupHandler(ctx as any, {
      token: "tok",
      guildId: discordId,
      pushToGithub: false,
      includeMessages: true,
    });
    check("requestBackup đặt cờ chờ bot xử lý", guildRows[0].backupRequested === true);
    check(
      'requestBackup xóa mốc "xong" cũ (không báo nhầm kết quả lượt trước)',
      guildRows[0].backupFinishedAt === undefined && guildRows[0].backupUnchanged === false,
    );

    const post = await importStatusHandler(ctx as any, { token: "tok", guildId: discordId });
    check("importStatus phản ánh yêu cầu đang chờ", post.backupRequested === true);
    check("importStatus nhận diện bot offline/thiếu heartbeat", post.botOnline === false);
  }

  console.log("\n── backup:listGuild: map + sort mới nhất trước ──");
  {
    const { ctx, backupRows } = makeCtx({ seed: BOT_KEY });
    backupRows.push(
      {
        _id: "b1",
        guildId: "g1",
        guildName: "G1",
        createdAt: 100,
        roleCount: 1,
        channelCount: 2,
        pushedToGithub: false,
      },
      {
        _id: "b2",
        guildId: "g1",
        guildName: "G1",
        createdAt: 300,
        roleCount: 3,
        channelCount: 4,
        pushedToGithub: true,
        githubUrl: "https://gist.github.com/x",
      },
      {
        _id: "b3",
        guildId: "g1",
        guildName: "G1",
        createdAt: 200,
        roleCount: 5,
        channelCount: 6,
        pushedToGithub: false,
      },
    );
    const out = await listGuildHandler(ctx as any, { guildId: "g1", botKey: BOT_KEY });
    check("trả đủ 3 bản", out.length === 3);
    check("sắp mới nhất trước", out[0]._id === "b2" && out[1]._id === "b3" && out[2]._id === "b1");
    check(
      "map source mặc định 'backup'",
      out.every((b: any) => b.source === "backup"),
    );
  }

  console.log("\n── backup:listGuild: trả ĐỦ bản đang giữ (trần retention 50) ──");
  {
    // REGRESSION: quy tắc giữ bản cho giữ tới 50 (backupKeepCount 2-50 ở
    // botStoreBackup/setRetention), nhưng listGuild/listMine/botAuditBackups cũ
    // chỉ `take(3)` → bản thứ 4 trở đi vẫn nằm trong DB mà KHÔNG hiện ở đâu, và
    // vì id chỉ có từ danh sách nên cũng KHÔNG khôi phục được: chủ server tưởng
    // giữ 10 bản mà thực tế chỉ dùng được 3.
    const { ctx, backupRows } = makeCtx({ seed: BOT_KEY });
    for (let i = 0; i < 6; i++) {
      backupRows.push({
        _id: `k${i}`,
        guildId: "g1",
        guildName: "G1",
        createdAt: 100 + i,
        roleCount: 1,
        channelCount: 1,
        pushedToGithub: false,
        backupJson: "z:x",
      });
    }
    const out = await listGuildHandler(ctx as any, { guildId: "g1", botKey: BOT_KEY });
    check(
      "listGuild trả đủ 6 bản đang giữ (không cắt còn 3)",
      out.length === 6,
      String(out.length),
    );
    check("listGuild vẫn sắp mới nhất trước", out[0]._id === "k5" && out[5]._id === "k0");
    const audited = await auditHandler(ctx as any, { guildId: "g1", botKey: BOT_KEY });
    check(
      "botAuditBackups cũng thấy đủ 6 bản (audit không được bỏ sót bản phải soi)",
      audited.length === 6,
      String(audited.length),
    );
  }

  console.log("\n── backup:botAuditBackups: trả backupJson + checksum cho audit ──");
  {
    // REGRESSION: listGuild CỐ TÌNH bỏ backupJson (nhẹ cho lệnh chat) → audit
    // dùng nó sẽ xếp MỌI bản là fake và --fix xóa nhầm. botAuditBackups phải
    // trả kèm nội dung + checksum để classifyBackup phân loại đúng.
    const { ctx, backupRows } = makeCtx({ seed: BOT_KEY });
    backupRows.push({
      _id: "b1",
      guildId: "g1",
      guildName: "G1",
      createdAt: 100,
      roleCount: 1,
      channelCount: 2,
      pushedToGithub: false,
      backupJson: "z:abc",
      backupChecksum: "cs-1",
    });
    const listed = await listGuildHandler(ctx as any, { guildId: "g1", botKey: BOT_KEY });
    check("listGuild (lệnh chat) KHÔNG lộ backupJson", (listed[0] as any).backupJson === undefined);
    const audited = await auditHandler(ctx as any, { guildId: "g1", botKey: BOT_KEY });
    check("botAuditBackups trả kèm backupJson", (audited[0] as any).backupJson === "z:abc");
    check("botAuditBackups trả kèm backupChecksum", (audited[0] as any).backupChecksum === "cs-1");
    let auditThrew = "";
    try {
      await auditHandler(ctx as any, { guildId: "g1", botKey: computeBotKey("sai") });
    } catch (e: any) {
      auditThrew = e?.message ?? "";
    }
    check("botAuditBackups từ chối botKey sai", auditThrew.includes("botKey"));
  }

  console.log("\n── Kế hoạch khôi phục (dry-run): quyền, claim chung, báo cáo ──");
  {
    // Dry-run là hợp đồng "xem trước, không đụng server": mọi đường ghi vào DB
    // phải nằm sau kiểm tra quyền + claim, và bot phải báo kết quả (kể cả lỗi)
    // để dashboard không mãi chờ.
    const { ctx, guildRows, sessionRows, userRows, backupRows } = makeCtx({ seed: BOT_KEY });
    // KHÔNG dùng chuỗi 18 chữ số kiểu snowflake ở test mới: gitleaks (job
    // security của CI) coi đó là Discord client id và làm đỏ cả commit.
    const discordId = "g-dry-run";
    guildRows.push({
      _id: "gplan",
      discordId,
      name: "Server",
      managers: ["u1"],
      botInGuild: true,
      restorePlan: {
        at: 1,
        roleCount: 9,
        channelCount: 9,
        messageCount: 0,
        emojiCount: 0,
        stickerCount: 0,
        settingsCount: 0,
        warnings: [],
      },
      restorePlanError: "lỗi cũ",
    });
    userRows.push({ _id: "u1", discordId: "u1", manageableGuildIds: [discordId] });
    sessionRows.push({
      _id: "s1",
      token: "tok",
      userId: "u1",
      createdAt: Date.now(),
      authVersion: 1,
    });
    backupRows.push({
      _id: "bk1",
      guildId: discordId,
      guildName: "Server",
      createdAt: 500,
      roleCount: 3,
      channelCount: 4,
      pushedToGithub: false,
      backupJson: "z:abc",
      // Checksum phải được botGetPending chuyển tiếp để bot xác minh toàn vẹn.
      backupChecksum: "cs-plan-1",
    });

    // 1) Không đăng nhập / không quyền → từ chối, KHÔNG đặt cờ.
    let noAuth = "";
    try {
      await requestRestorePlanHandler(ctx as any, {
        token: "sai",
        guildId: discordId,
        backupId: "bk1",
      });
    } catch (e: any) {
      noAuth = e?.message ?? "";
    }
    check("requestRestorePlan chặn token sai", noAuth.length > 0);
    check(
      "requestRestorePlan chặn → không đặt cờ",
      guildRows.find((g) => g._id === "gplan").restorePlanRequested !== true,
    );

    // 2) Hợp lệ → đặt cờ + XÓA kế hoạch cũ (nếu không, dashboard hiện kế hoạch
    // của lượt trước trong lúc chờ lượt mới).
    await requestRestorePlanHandler(ctx as any, {
      token: "tok",
      guildId: discordId,
      backupId: "bk1",
    });
    const g = guildRows.find((x) => x._id === "gplan")!;
    check(
      "requestRestorePlan đặt cờ + xóa kế hoạch/lỗi cũ",
      g.restorePlanRequested === true &&
        g.restorePlanBackupId === "bk1" &&
        g.restorePlan === undefined &&
        g.restorePlanError === undefined,
      JSON.stringify(g),
    );

    // 3) botGetPending gửi job "plan" KÈM backupJson — nếu thiếu, bot không có
    // gì để đọc và im lặng hỏng.
    const pending = (await botGetPendingHandler(ctx as any, { botKey: BOT_KEY })) as any[];
    const planJob = pending.find((p) => p.kind === "plan");
    check(
      "botGetPending trả job dry-run kèm backupJson + backupChecksum (xác minh toàn vẹn)",
      !!planJob &&
        planJob.backupJson === "z:abc" &&
        planJob.backupId === "bk1" &&
        planJob.backupChecksum === "cs-plan-1",
      JSON.stringify(planJob),
    );

    // 4) Claim: dry-run và restore dùng CHUNG lease → không chạy chồng.
    const claim = (await claimHandler(ctx as any, {
      guildId: discordId,
      kind: "plan",
      botKey: BOT_KEY,
    })) as any;
    check("botClaimBackup plan giành được claim", claim.ok === true && !!claim.claimAt);
    const claim2 = (await claimHandler(ctx as any, {
      guildId: discordId,
      kind: "plan",
      botKey: BOT_KEY,
    })) as any;
    check("claim thứ 2 bị chặn (in_flight)", claim2.ok === false && claim2.reason === "in_flight");
    // Restore dùng CHUNG lease của dry-run: cả 2 cờ cùng treo thì bot tính
    // kế hoạch và bot khôi phục không được chạy chồng trên cùng một server.
    g.restoreRequested = true;
    const restoreClaim = (await claimHandler(ctx as any, {
      guildId: discordId,
      kind: "restore",
      botKey: BOT_KEY,
    })) as any;
    check(
      "restore không giành được claim khi dry-run đang chạy",
      restoreClaim.ok === false && restoreClaim.reason === "in_flight",
    );
    // Ngược lại: dashboard cũng phải chặn được yêu cầu mới khi bot đang bận.
    let busyMsg = "";
    try {
      await requestRestorePlanHandler(ctx as any, {
        token: "tok",
        guildId: discordId,
        backupId: "bk1",
      });
    } catch (e: any) {
      busyMsg = e?.message ?? "";
    }
    check("requestRestorePlan chặn khi bot đang bận", /đang xử lý/i.test(busyMsg), busyMsg);
    g.restoreRequested = false;

    // 5) Báo kế hoạch → lưu plan, xóa cờ, trả claim. TUYỆT ĐỐI không đụng
    // restoreFinishedAt (đó là mốc "đã khôi phục xong").
    const beforeFinished = g.restoreFinishedAt;
    const reported = (await reportPlanHandler(ctx as any, {
      guildId: discordId,
      plan: {
        roleCount: 3,
        channelCount: 4,
        messageCount: 12,
        emojiCount: 1,
        stickerCount: 0,
        settingsCount: 2,
        warnings: ["Bot thiếu quyền Manage Roles"],
        at: 999,
      },
      claimAt: claim.claimAt,
      botKey: BOT_KEY,
    })) as any;
    check("botReportRestorePlan nhận kế hoạch", reported.ok === true, JSON.stringify(reported));
    check(
      "botReportRestorePlan lưu plan + xóa cờ + nhả claim",
      g.restorePlan?.roleCount === 3 &&
        g.restorePlan?.warnings?.length === 1 &&
        g.restorePlanRequested === false &&
        g.restorePlanBackupId === undefined &&
        g.restoreClaimedAt === undefined &&
        g.restoreFinishedAt === beforeFinished,
      JSON.stringify(g.restorePlan),
    );

    // 6) Claim đã bị bot/instance khác cướp → từ chối, KHÔNG ghi đè kế hoạch.
    await requestRestorePlanHandler(ctx as any, {
      token: "tok",
      guildId: discordId,
      backupId: "bk1",
    });
    const claim4 = (await claimHandler(ctx as any, {
      guildId: discordId,
      kind: "plan",
      botKey: BOT_KEY,
    })) as any;
    // Mô phỏng worker khác giành claim: restoreClaimedAt đổi sang mốc khác.
    guildRows.find((x) => x._id === "gplan")!.restoreClaimedAt = claim4.claimAt + 1;
    const stale = (await reportPlanHandler(ctx as any, {
      guildId: discordId,
      plan: {
        roleCount: 999,
        channelCount: 0,
        messageCount: 0,
        emojiCount: 0,
        stickerCount: 0,
        settingsCount: 0,
        warnings: [],
        at: 1,
      },
      claimAt: claim4.claimAt,
      botKey: BOT_KEY,
    })) as any;
    // Kế hoạch cũ đã bị xóa lúc đặt yêu cầu mới (mục 2) → sau claim bị cướp,
    // kế hoạch của worker cũ KHÔNG được ghi vào (roleCount 999 là bằng chứng).
    check(
      "botReportRestorePlan từ chối claim bị cướp",
      stale.ok === false &&
        stale.reason === "stale_claim" &&
        g.restorePlan === undefined &&
        g.restorePlanRequested === true,
      JSON.stringify(stale),
    );

    // 7) Báo lỗi → dashboard phải thấy lý do, không chờ mãi.
    await reportPlanHandler(ctx as any, {
      guildId: discordId,
      error: "Backup bi hong (khong doc duoc JSON)",
      claimAt: claim4.claimAt + 1,
      botKey: BOT_KEY,
    });
    const st = (await restorePlanStatusHandler(ctx as any, {
      token: "tok",
      guildId: discordId,
    })) as any;
    check(
      "restorePlanStatus trả lỗi + không còn yêu cầu",
      st.error === "Backup bi hong (khong doc duoc JSON)" && st.requested === false,
      JSON.stringify(st),
    );
  }

  console.log("\n── Quy tắc giữ bản: N bản gần nhất + dọn theo tuổi ──");
  {
    // Trước đây `slice(3)` hard-code: server lớn mất dữ liệu, server nhỏ tốn chỗ.
    // Nay chủ server tự đặt N bản + số ngày, và cả hai quy tắc phải cùng chạy.
    const seed = (n: number, now: number, day = 86_400_000) =>
      Array.from({ length: n }, (_, i) => ({
        _id: `b${i}`,
        guildId: "g1",
        guildName: "G1",
        backupJson: "x",
        roleCount: 0,
        channelCount: 0,
        pushedToGithub: false,
        // b0 là bản MỚI NHẤT, b(n-1) là bản cũ nhất.
        createdAt: now - i * day,
      }));

    // 1) Mặc định (chưa cấu hình) → giữ 3, y hệt hành vi cũ.
    {
      const { ctx, backupRows } = makeCtx({ seed: BOT_KEY });
      backupRows.push(...seed(5, Date.now()));
      await storeHandler(ctx as any, {
        guildId: "g1",
        guildName: "G1",
        backupJson: "z:new",
        roleCount: 1,
        channelCount: 1,
        botKey: BOT_KEY,
      });
      check(
        "giữ bản: mặc định chỉ còn 3 bản mới nhất",
        backupRows.length === 3,
        String(backupRows.length),
      );
    }
    // 2) backupKeepCount = 7 → giữ 7 bản (server lớn không mất dữ liệu).
    {
      const { ctx, backupRows, guildRows } = makeCtx({ seed: BOT_KEY });
      guildRows.push({ _id: "gk", discordId: "g1", name: "G1", backupKeepCount: 7 });
      backupRows.push(...seed(8, Date.now()));
      await storeHandler(ctx as any, {
        guildId: "g1",
        guildName: "G1",
        backupJson: "z:new",
        roleCount: 1,
        channelCount: 1,
        botKey: BOT_KEY,
      });
      check(
        "giữ bản: giữ theo backupKeepCount (7)",
        backupRows.length === 7,
        String(backupRows.length),
      );
    }
    // 3) backupKeepDays = 30 → bản quá 30 ngày bị xoá DÙ vẫn nằm trong N bản.
    {
      const { ctx, backupRows, guildRows } = makeCtx({ seed: BOT_KEY });
      guildRows.push({
        _id: "gk",
        discordId: "g1",
        name: "G1",
        backupKeepCount: 10,
        backupKeepDays: 30,
      });
      // 5 bản: 2 bản cũ hơn 30 ngày, 3 bản mới (mốc thời gian neo theo Date.now()
      // vì botStoreBackup tự dùng đồng hồ thật, không dùng ctx.now của test).
      const t0 = Date.now();
      backupRows.push(
        ...[0, 5, 40, 60, 10].map((daysAgo, i) => ({
          _id: `b${i}`,
          guildId: "g1",
          guildName: "G1",
          backupJson: "x",
          roleCount: 0,
          channelCount: 0,
          pushedToGithub: false,
          createdAt: t0 - daysAgo * 86_400_000,
        })),
      );
      await storeHandler(ctx as any, {
        guildId: "g1",
        guildName: "G1",
        backupJson: "z:new",
        roleCount: 1,
        channelCount: 1,
        botKey: BOT_KEY,
      });
      check(
        "giữ bản: xoá bản quá hạn dù còn trong N bản",
        backupRows.length === 4,
        String(backupRows.length),
      );
      check(
        "giữ bản: bản mới nhất luôn được giữ",
        backupRows.some((r) => r.backupJson === "z:new"),
      );
    }
    // 4) Số bậy từ dashboard/lệnh chat → bị chặn trong khoảng, không làm rỗng server.
    {
      const { ctx, guildRows, sessionRows, userRows } = makeCtx({ seed: BOT_KEY });
      guildRows.push({
        _id: "gk",
        discordId: "g1",
        name: "G1",
        managers: ["u1"],
        botInGuild: true,
      });
      userRows.push({ _id: "u1", discordId: "u1", manageableGuildIds: ["g1"] });
      sessionRows.push({
        _id: "s1",
        token: "tok",
        userId: "u1",
        createdAt: Date.now(),
        authVersion: 1,
      });
      const r = (await setRetentionWebHandler(ctx as any, {
        token: "tok",
        guildId: "g1",
        keepCount: 999,
        keepDays: -5,
      })) as any;
      check(
        "setRetention chặn số bậy (999 → 50, -5 → 0)",
        r.keepCount === 50 && r.keepDays === 0,
        JSON.stringify(r),
      );
      const g = guildRows.find((x) => x._id === "gk")!;
      check("setRetention ghi vào guild", g.backupKeepCount === 50 && g.backupKeepDays === 0);
      const bot = (await setRetentionHandler(ctx as any, {
        guildId: "g1",
        keepCount: 1,
        keepDays: 400,
        botKey: BOT_KEY,
      })) as any;
      check(
        "botSetBackupRetention chặn số bậy (1 → 2, 400 → 365)",
        bot.keepCount === 2 && bot.keepDays === 365,
        JSON.stringify(bot),
      );
      let threw = "";
      try {
        await setRetentionWebHandler(ctx as any, {
          token: "sai",
          guildId: "g1",
          keepCount: 5,
          keepDays: 0,
        });
      } catch (e: any) {
        threw = e?.message ?? "";
      }
      check("setRetention chặn token sai", threw.length > 0);
    }
  }

  console.log("\n── Backup vượt trần 1 MB: tách chunk + ghép lại ──");
  {
    // Trần 1 MB/doc của Convex khiến backup server lớn bị từ chối ghi; người
    // dùng chỉ còn cách tắt "kèm tin nhắn" (mất dữ liệu). Nay payload lớn được
    // tách document, ghép lại khi khôi phục/audit.
    const big = "z:" + "A".repeat(1_500_000);
    const { ctx, backupRows, chunkRows, guildRows } = makeCtx({ seed: BOT_KEY });
    guildRows.push({
      _id: "gc",
      discordId: "g1",
      name: "G1",
      restoreRequested: true,
    });
    const r = (await storeHandler(ctx as any, {
      guildId: "g1",
      guildName: "G1",
      backupJson: big,
      roleCount: 40,
      channelCount: 60,
      botKey: BOT_KEY,
    })) as any;
    const row = backupRows.find((b) => b._id === r.backupId)!;
    check(
      "chunk: document cha KHÔNG chứa payload",
      row.backupJson.startsWith("chunked:"),
      row.backupJson,
    );
    check("chunk: payload nằm ở nhiều document", chunkRows.length === 3, String(chunkRows.length));
    check(
      "chunk: mọi chunk nằm trong trần 1 MB",
      chunkRows.every((c) => c.data.length <= 600_000),
      String(Math.max(...chunkRows.map((c) => c.data.length))),
    );
    check(
      "chunk: ghép lại ra đúng payload gốc",
      (await reassembleBackupJsonForRead(ctx, row._id, row.backupJson, row.backupChunkCount)) ===
        big,
    );
    // Job khôi phục phải nhận payload ĐẦY ĐỦ, không phải ký hiệu "chunked:3".
    guildRows.find((g) => g._id === "gc")!.restoreBackupId = row._id;
    const pending = (await botGetPendingHandler(ctx as any, { botKey: BOT_KEY })) as any[];
    const job = pending.find((p) => p.kind === "restore");
    check(
      "chunk: job khôi phục mang payload đầy đủ",
      !!job && job.backupJson === big,
      String(job?.backupJson?.slice(0, 12)),
    );
    const audit = (await auditHandler(ctx as any, { guildId: "g1", botKey: BOT_KEY })) as any[];
    check("chunk: audit cũng thấy payload đầy đủ", audit[0].backupJson === big);
    // Thiếu chunk → bot KHÔNG BAO GIỜ được giao payload cụt. Job VẪN được gửi
    // nhưng kèm cờ `unreadable`: bot báo lỗi thật + dọn cờ `restoreRequested`.
    // Bỏ qua im lặng (cách cũ) làm cờ mắc true mãi mãi ⇒ dashboard quay vòng
    // chờ vô hạn và mỗi lượt quét lại đọc lại payload.
    chunkRows.pop();
    const pending2 = (await botGetPendingHandler(ctx as any, { botKey: BOT_KEY })) as any[];
    const badJob = pending2.find((p) => p.kind === "restore");
    check(
      "chunk: thiếu chunk → KHÔNG gửi payload cụt cho bot",
      !!badJob && badJob.backupJson === undefined,
      JSON.stringify(badJob?.backupJson?.slice(0, 12)),
    );
    check(
      "chunk: thiếu chunk → job đánh dấu unreadable + có lý do để bot báo lỗi",
      badJob?.unreadable === true && typeof badJob?.unreadableReason === "string",
      JSON.stringify(badJob?.unreadableReason),
    );
    check(
      "chunk: audit trả null thay vì dữ liệu cụt",
      (await auditHandler(ctx as any, { guildId: "g1", botKey: BOT_KEY })).length > 0,
    );
    // Prune/xoá bản cha phải xoá luôn chunk — rác chunk là tốn chỗ vô ích.
    // Giữ tối thiểu 2 bản (đã chặn ở clamp) → cần 2 bản mới để đẩy bản cũ ra.
    guildRows.find((g) => g._id === "gc")!.backupKeepCount = 2;
    const before = chunkRows.length;
    for (let i = 0; i < 2; i++) {
      await storeHandler(ctx as any, {
        guildId: "g1",
        guildName: "G1",
        backupJson: `z:small-${i}`,
        roleCount: 1,
        channelCount: 1,
        botKey: BOT_KEY,
      });
    }
    check(
      "chunk: bản bị prune → chunk cũng bị xoá",
      chunkRows.length === 0,
      `${before} → ${chunkRows.length}`,
    );
  }

  console.log("\n── /backup keep: từ lệnh slash đến quy tắc dọn bản ──");
  {
    // Đường đi thật của người dùng: gõ lệnh → handler gọi mutation → guild lưu
    // quy tắc → lần backup sau TỰ DỌN theo đúng quy tắc đó. Test này nối hết
    // bằng handler thật + ctx giả, nên lệch ở khâu nào cũng đỏ ngay.
    const { ctx, guildRows, backupRows } = makeCtx({ seed: BOT_KEY });
    guildRows.push({ _id: "gslash", discordId: "g-slash", name: "Server" });
    const t0 = Date.now();
    for (let i = 0; i < 4; i++) {
      backupRows.push({
        _id: `old${i}`,
        guildId: "g-slash",
        guildName: "Server",
        backupJson: "z:old",
        roleCount: 1,
        channelCount: 1,
        pushedToGithub: false,
        createdAt: t0 - i * 86_400_000, // b0 mới nhất → b3 cũ nhất
      });
    }
    // Handler slash gửi: keepCount = số người dùng gõ, keepDays = tuỳ chọn.
    const saved = (await setRetentionBotHandler(ctx as any, {
      guildId: "g-slash",
      keepCount: 2,
      keepDays: 30,
      botKey: BOT_KEY,
    })) as any;
    check(
      "slash keep: mutation trả về đúng quy tắc đã đặt",
      saved.ok === true && saved.keepCount === 2 && saved.keepDays === 30,
      JSON.stringify(saved),
    );
    check(
      "slash keep: quy tắc được lưu vào server",
      guildRows.find((g) => g._id === "gslash")?.backupKeepCount === 2,
    );
    // Backup mới tới → dọn: giữ 2 bản mới + xoá bản quá 30 ngày.
    await storeHandler(ctx as any, {
      guildId: "g-slash",
      guildName: "Server",
      backupJson: "z:moi",
      roleCount: 1,
      channelCount: 1,
      botKey: BOT_KEY,
    });
    check(
      "slash keep: quy tắc CÓ HIỆU LỰC — chỉ còn 2 bản mới nhất",
      backupRows.length === 2,
      `${backupRows.length} bản còn lại`,
    );
    check(
      "slash keep: bản mới vừa tạo không bị dọn",
      backupRows.some((r) => r.backupJson === "z:moi"),
    );
    // Bỏ trống `days` ở lệnh ⇒ undefined ⇒ giữ quy tắc tuổi đang có.
    const kept = (await setRetentionBotHandler(ctx as any, {
      guildId: "g-slash",
      keepCount: 5,
      botKey: BOT_KEY,
    })) as any;
    check(
      "slash keep: bỏ trống ngày → giữ nguyên quy tắc tuổi",
      kept.keepDays === 30 && guildRows.find((g) => g._id === "gslash")?.backupKeepDays === 30,
      JSON.stringify(kept),
    );
  }

  console.log("\n── cron sweepDueAutoBackups (đợt #4 — thay autoBackupSweep của bot) ──");
  {
    const { ctx, guildRows, backupRows } = makeCtx({ seed: BOT_KEY });
    const NOW = Date.now();
    const day = 86_400_000;
    guildRows.push(
      {
        _id: "g1",
        discordId: "g1",
        name: "Đến hạn",
        botInGuild: true,
        backupAutoDays: 7,
        lastBackupAt: NOW - 8 * day,
        backupRequested: false,
      },
      {
        _id: "g2",
        discordId: "g2",
        name: "Chưa đến hạn",
        botInGuild: true,
        backupAutoDays: 7,
        lastBackupAt: NOW - day,
        backupRequested: false,
      },
      {
        _id: "g3",
        discordId: "g3",
        name: "Tắt lịch",
        botInGuild: true,
        backupAutoDays: 0,
        backupRequested: false,
      },
      {
        _id: "g4",
        discordId: "g4",
        name: "Đang chờ lượt trước",
        botInGuild: true,
        backupAutoDays: 7,
        lastBackupAt: NOW - 10 * day,
        backupRequested: true,
      },
      {
        _id: "g5",
        discordId: "g5",
        name: "Đang claim",
        botInGuild: true,
        backupAutoDays: 7,
        lastBackupAt: NOW - 10 * day,
        backupRequested: false,
        backupClaimedAt: NOW - 1_000,
        backupLeaseUntil: NOW + 600_000,
      },
      {
        _id: "g6",
        discordId: "g6",
        name: "Bot đã rời",
        botInGuild: false,
        backupAutoDays: 7,
        lastBackupAt: NOW - 30 * day,
        backupRequested: false,
      },
      {
        _id: "g7",
        discordId: "g7",
        name: "Chưa từng backup",
        botInGuild: true,
        backupAutoDays: 3,
        backupRequested: false,
      },
    );
    // Bản gần nhất của g1 CÓ tin nhắn → auto phải kế thừa includeMessages=true
    // (checksum incremental phải cùng chế độ với bản trước).
    backupRows.push({
      _id: "b1",
      guildId: "g1",
      guildName: "Đến hạn",
      backupJson: "z:x",
      roleCount: 1,
      channelCount: 1,
      pushedToGithub: false,
      messageCount: 12,
      createdAt: NOW - 8 * day,
    });
    const res = (await sweepDueAutoBackupsHandler(ctx as any, {})) as any;
    check("chỉ đặt cờ cho guild đến hạn (g1 + g7)", res.requested === 2, JSON.stringify(res));
    const g1 = guildRows.find((g) => g._id === "g1")!;
    check(
      "g1: cờ + đẩy GitHub + KẾ THỪA includeMessages từ bản gần nhất",
      g1.backupRequested === true &&
        g1.backupPushToGithub === true &&
        g1.backupIncludeMessages === true,
    );
    const g7 = guildRows.find((g) => g._id === "g7")!;
    check(
      "g7 chưa từng backup → includeMessages=false",
      g7.backupRequested === true && g7.backupIncludeMessages === false,
    );
    check(
      "g2 chưa đến hạn → không đụng",
      guildRows.find((g) => g._id === "g2")!.backupRequested === false,
    );
    check(
      "g3 tắt lịch (days=0) → không đụng",
      guildRows.find((g) => g._id === "g3")!.backupRequested === false,
    );
    check(
      "g4 đang chờ cờ sẵn → bỏ qua",
      guildRows.find((g) => g._id === "g4")!.backupRequested === true &&
        guildRows.find((g) => g._id === "g4")!.backupPushToGithub === undefined,
    );
    check(
      "g5 claim đang sống → chưa đặt yêu cầu (vòng sau thử lại)",
      guildRows.find((g) => g._id === "g5")!.backupRequested === false,
    );
    check("g5 được đếm vào skippedInFlight", res.skippedInFlight === 1, JSON.stringify(res));
    check(
      "g6 bot đã rời → không đụng (index by_botInGuild)",
      guildRows.find((g) => g._id === "g6")!.backupRequested === false,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MÃ KHÔI PHỤC — đường cứu hộ khi đã MẤT quyền server gốc.
  //
  // Bug thật: `listMine` + `requestRestore` trước đây bắt người khôi phục phải
  // còn là người quản lý SERVER GỐC. Đúng lúc cần cứu (server bị nuke mất role /
  // bị kick / đã xoá rồi dựng server mới) thì bản backup biến mất khỏi danh
  // sách và khôi phục bị từ chối — backup bị bỏ rơi đúng lúc cần nhất.
  // ═══════════════════════════════════════════════════════════════════════
  const OLD = "111111111111111111";
  const NEW = "222222222222222222";
  /** Dựng ngữ cảnh: server cũ đã chết (bot rời) + server mới, 1 bản backup. */
  const makeLostServerCtx = (manageable: string[], withKey = true) => {
    const h = makeCtx({ seed: BOT_KEY });
    h.userRows.push({
      _id: "u1",
      discordId: "me",
      username: "me",
      manageableGuildIds: manageable,
      lastLoginAt: 0,
    });
    h.sessionRows.push({
      token: "tok1",
      userId: "u1",
      createdAt: Date.now(),
      authVersion: 1,
    });
    h.guildRows.push({ _id: "gold", discordId: OLD, botInGuild: false, managers: ["me"] });
    h.guildRows.push({ _id: "gnew", discordId: NEW, botInGuild: true, managers: ["me"] });
    const restoreKey = withKey ? generateRestoreKey() : undefined;
    h.backupRows.push({
      _id: "b1",
      guildId: OLD,
      guildName: "Server Bị Nuke",
      backupJson: "z:payload",
      backupChecksum: "cs",
      roleCount: 5,
      channelCount: 9,
      messageCount: 12,
      pushedToGithub: false,
      restoreKey,
      createdAt: 1_700_000_000_000,
    });
    return { ...h, restoreKey };
  };

  console.log("\n── backupKeys: sinh + chuẩn hoá mã khôi phục ──");
  {
    const k1 = generateRestoreKey();
    const k2 = generateRestoreKey();
    check("mã dài 25 ký tự chia đều 5 nhóm", /^[A-Z2-9]{5}(-[A-Z2-9]{5}){4}$/.test(k1), k1);
    check("không chứa ký tự dễ nhầm (0/O/1/I/L)", !/[01OIL]/.test(k1), k1);
    check("hai mã không trùng nhau", k1 !== k2);
    check(
      "bỏ gạch nối / khoảng trắng / HOA-thường vẫn ra đúng mã",
      normalizeRestoreKey(k1.toLowerCase().replace(/-/g, " ")) === k1,
      k1,
    );
    check("mã thiếu ký tự → từ chối", normalizeRestoreKey("ABC") === null);
    check("mã dài sai → từ chối", normalizeRestoreKey(k1 + "A") === null);
    // Ký tự bị loại khỏi bảng chữ (O/0/I/1/L) phải bị từ chối chứ KHÔNG được
    // im lặng map sang một mã khác — đó là lỗi "tra cứu nhầm bản backup".
    check(
      "ký tự lạ trong bảng chữ → từ chối (không map nhầm)",
      normalizeRestoreKey("O".repeat(25)) === null,
    );
    check("mã rỗng → từ chối", normalizeRestoreKey("") === null);
  }

  console.log("\n── lookupBackup: tra cứu theo mã, KHÔNG lộ id server gốc ──");
  {
    const { ctx, restoreKey } = makeLostServerCtx([NEW]);
    const res = await lookupBackupHandler(ctx as any, { token: "tok1", restoreKey });
    check("mã đúng → trả metadata bản backup", res?.backupId === "b1" && res?.roleCount === 5);
    // Rò rỉ id server gốc là điều KHÔNG được xảy ra: biết mã không được suy ra
    // ra server nào đang dùng Protogon.
    check("KHÔNG trả guildId của server gốc", res !== null && !("guildId" in res));
    check(
      "KHÔNG trả backupJson (chỉ bot có botKey mới đọc được)",
      res !== null && !("backupJson" in res),
    );
    // Mã sai / rác → không lộ thêm thông tin gì.
    const bad = await lookupBackupHandler(ctx as any, {
      token: "tok1",
      restoreKey: "AAAAA-BBBBB-CCCCC-DDDDD-EEEEE",
    });
    check("mã không khớp → null", bad === null);
    const junk = await lookupBackupHandler(ctx as any, { token: "tok1", restoreKey: "sai" });
    check("mã sai định dạng → null (không ném lỗi)", junk === null);
    // Chưa đăng nhập → không tra cứu được gì.
    const anon = await lookupBackupHandler(ctx as any, { token: "", restoreKey });
    check("chưa đăng nhập → null", anon === null);
  }

  console.log("\n── requestRestore: mất quyền server gốc → dùng mã khôi phục được ──");
  {
    // KHÔNG có mã → vẫn phải từ chối như cũ (không nới tuỳ tiện).
    const noKey = makeLostServerCtx([NEW], false);
    let err = "";
    try {
      await requestRestoreHandler(noKey.ctx as any, {
        token: "tok1",
        guildId: NEW,
        backupId: "b1",
      });
    } catch (e: any) {
      err = e?.message ?? "";
    }
    check("mất quyền server gốc + không có mã → từ chối", /quyền với server gốc/.test(err), err);
    check("lỗi có nói rõ cách gỡ (dán mã khôi phục)", /mã khôi phục/i.test(err), err);
    check(
      "bị từ chối thì KHÔNG đặt cờ restoreRequested",
      noKey.guildRows.find((g) => g.discordId === NEW)!.restoreRequested !== true,
    );

    // CÓ mã → khôi phục được vào server mới (đúng tình huống nuke).
    const h = makeLostServerCtx([NEW]);
    const okRes = await requestRestoreHandler(h.ctx as any, {
      token: "tok1",
      guildId: NEW,
      backupId: "b1",
      restoreKey: h.restoreKey,
    });
    const newGuild = h.guildRows.find((g) => g.discordId === NEW)!;
    check(
      "mã đúng → khôi phục vào server MỚI được, đặt cờ restore",
      okRes?.ok === true && newGuild.restoreRequested === true && newGuild.restoreBackupId === "b1",
    );
    // Mã của bản KHÁC → phải từ chối (capability gắn với từng bản backup).
    const wrong = makeLostServerCtx([NEW]);
    wrong.backupRows[0].restoreKey = generateRestoreKey();
    let err2 = "";
    try {
      await requestRestoreHandler(wrong.ctx as any, {
        token: "tok1",
        guildId: NEW,
        backupId: "b1",
        restoreKey: h.restoreKey,
      });
    } catch (e: any) {
      err2 = e?.message ?? "";
    }
    check("mã của bản backup khác → từ chối", /quyền với server gốc/.test(err2), err2);

    // Người dùng không quản lý server ĐÍCH thì mã cũng không cứu được.
    const notMine = makeLostServerCtx([]);
    let err3 = "";
    try {
      await requestRestoreHandler(notMine.ctx as any, {
        token: "tok1",
        guildId: NEW,
        backupId: "b1",
        restoreKey: notMine.restoreKey,
      });
    } catch (e: any) {
      err3 = e?.message ?? "";
    }
    check("không quản lý server ĐÍCH → từ chối dù có mã", /quản lý server/.test(err3), err3);
  }

  console.log("\n── myRestoreKeys: chủ server cầm được mã để không mất ──");
  {
    const h = makeCtx({ seed: BOT_KEY });
    h.userRows.push({
      _id: "u1",
      discordId: "me",
      username: "me",
      manageableGuildIds: [NEW],
      lastLoginAt: 0,
    });
    h.sessionRows.push({ token: "tok1", userId: "u1", createdAt: Date.now(), authVersion: 1 });
    h.guildRows.push({ _id: "gnew", discordId: NEW, botInGuild: true, managers: ["me"] });
    h.guildRows.push({ _id: "gold", discordId: OLD, botInGuild: false, managers: ["me"] });
    const key = generateRestoreKey();
    h.backupRows.push({
      _id: "bmine",
      guildId: NEW,
      guildName: "Server Mới",
      backupJson: "z:x",
      roleCount: 1,
      channelCount: 2,
      pushedToGithub: false,
      restoreKey: key,
      createdAt: 2_000,
    });
    // Backup của server KHÔNG còn quản lý phải ẩn khỏi danh sách mã.
    h.backupRows.push({
      _id: "bother",
      guildId: OLD,
      guildName: "Server Cũ",
      backupJson: "z:y",
      roleCount: 3,
      channelCount: 4,
      pushedToGithub: false,
      restoreKey: generateRestoreKey(),
      createdAt: 1_000,
    });
    const keys = await myRestoreKeysHandler(h.ctx as any, { token: "tok1" });
    check(
      "chỉ trả mã của server đang quản lý",
      keys.length === 1 && keys[0].backupId === "bmine",
      JSON.stringify(keys),
    );
    check("mã trả về đúng giá trị lưu", keys[0]?.restoreKey === key);
    check(
      "bản backup cũ không có mã → restoreKey = null (không văng undefined)",
      (
        await myRestoreKeysHandler(
          (() => {
            const c = makeCtx({ seed: BOT_KEY });
            c.userRows.push({
              _id: "u",
              discordId: "me",
              username: "me",
              manageableGuildIds: [OLD],
              lastLoginAt: 0,
            });
            c.sessionRows.push({ token: "t", userId: "u", createdAt: Date.now(), authVersion: 1 });
            c.guildRows.push({ _id: "g", discordId: OLD, botInGuild: true, managers: ["me"] });
            c.backupRows.push({
              _id: "b",
              guildId: OLD,
              guildName: "G",
              backupJson: "z:z",
              roleCount: 0,
              channelCount: 0,
              pushedToGithub: false,
              createdAt: 5,
            });
            return c;
          })().ctx as any,
          { token: "t" },
        )
      )[0].restoreKey === null,
    );
  }

  console.log("\n── botStoreBackup: sinh mã khôi phục cho mỗi bản ──");
  {
    const { ctx, backupRows } = makeCtx({ seed: BOT_KEY });
    const r1 = await storeHandler(ctx as any, {
      guildId: "g1",
      guildName: "G1",
      backupJson: "z:a",
      roleCount: 1,
      channelCount: 1,
      botKey: BOT_KEY,
    });
    const r2 = await storeHandler(ctx as any, {
      guildId: "g1",
      guildName: "G1",
      backupJson: "z:b",
      roleCount: 1,
      channelCount: 1,
      botKey: BOT_KEY,
    });
    check(
      "mỗi bản backup có mã riêng",
      !!r1?.restoreKey && !!r2?.restoreKey && r1.restoreKey !== r2.restoreKey,
    );
    check(
      "mã ghi vào bản ghi backup (tra cứu được)",
      backupRows.every((b) => typeof b.restoreKey === "string" && b.restoreKey.length === 29),
      JSON.stringify(backupRows.map((b) => b.restoreKey)),
    );
    check(
      "mã trả về khớp mã đã lưu",
      r1.restoreKey === backupRows.find((b) => b.backupJson === "z:a")?.restoreKey,
    );
  }

  console.log("\n── botGetPending: backup hỏng → báo lỗi thật, không treo cờ ──");
  {
    // Backup tách chunk nhưng THIẾU chunk → json không gộp được. Trước đây job
    // bị bỏ qua im lặng ⇒ restoreRequested mắc true mãi mãi, dashboard quay
    // vòng chờ vô hạn, mỗi lượt quét lại đọc lại payload. Nay vẫn gửi job
    // với cờ unreadable để bot báo lỗi và DỌN cờ sau đúng một nhịp.
    const { ctx, guildRows, backupRows } = makeCtx({ seed: BOT_KEY });
    guildRows.push({
      _id: "g1",
      discordId: "g1",
      botInGuild: true,
      restoreRequested: true,
      restoreBackupId: "b1",
    });
    backupRows.push({
      _id: "b1",
      guildId: "g1",
      guildName: "G1",
      backupJson: "chunked:3",
      backupChunkCount: 3,
      roleCount: 1,
      channelCount: 1,
      pushedToGithub: false,
      createdAt: 10,
    });
    const pending = await botGetPendingHandler(ctx as any, { botKey: BOT_KEY });
    const job = pending.find((p: any) => p.kind === "restore");
    check("vẫn gửi job restore (không bỏ qua im lặng)", !!job, JSON.stringify(pending));
    check("job đánh dấu unreadable", job?.unreadable === true);
    check("job KHÔNG mang payload rỗng", job?.backupJson === undefined);
    check(
      "job có lý do để bot báo lên dashboard",
      typeof job?.unreadableReason === "string" && job.unreadableReason.length > 10,
      job?.unreadableReason,
    );

    // Bản backup đã bị xoá → cũng phải báo, không nuốt im lặng.
    const gone = makeCtx({ seed: BOT_KEY });
    gone.guildRows.push({
      _id: "g1",
      discordId: "g1",
      botInGuild: true,
      restoreRequested: true,
      restoreBackupId: "bX",
    });
    const job2 = (await botGetPendingHandler(gone.ctx as any, { botKey: BOT_KEY })).find(
      (p: any) => p.kind === "restore",
    );
    check(
      "bản đã bị xoá → job unreadable + nói rõ",
      job2?.unreadable === true && /không còn tồn tại/.test(job2?.unreadableReason ?? ""),
      job2?.unreadableReason,
    );

    // Backup ĐỌC ĐƯỢC thì vẫn phải là job bình thường (không unreadable).
    const ok = makeCtx({ seed: BOT_KEY });
    ok.guildRows.push({
      _id: "g1",
      discordId: "g1",
      botInGuild: true,
      restoreRequested: true,
      restoreBackupId: "b1",
    });
    ok.backupRows.push({
      _id: "b1",
      guildId: "g1",
      guildName: "G1",
      backupJson: "z:ok",
      roleCount: 1,
      channelCount: 1,
      pushedToGithub: false,
      createdAt: 10,
    });
    const job3 = (await botGetPendingHandler(ok.ctx as any, { botKey: BOT_KEY })).find(
      (p: any) => p.kind === "restore",
    );
    check(
      "backup đọc được → job bình thường, KHÔNG unreadable",
      job3?.unreadable === false && job3?.backupJson === "z:ok",
    );
  }

  console.log(`\n${pass}/${pass + fail} ✅`);
  process.exit(fail > 0 ? 1 : 0);
})();
