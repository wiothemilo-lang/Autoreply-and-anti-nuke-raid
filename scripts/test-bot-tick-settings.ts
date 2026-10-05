// TEST bot_tick:getPendingJobs — batch query bot gọi mỗi 180s (1 query thay 3).
// Trọng tâm lượt này: `settingsChanges` — danh sách guild vừa được DASHBOARD sửa
// cấu hình. Đây là kênh duy nhất để thay đổi từ web tới bot trong ~3 phút; thiếu
// nó thì bot giữ cache getConfig 30 phút → bật welcome/goodbye, đổi module antinuke
// xong bot vẫn im lặng (bug thật 23/09/2026).
//
// Chạy: bun scripts/test-bot-tick-settings.ts
import { getPendingJobs } from "../convex/bot_tick";
import { sweepDueDailyReports } from "../convex/reports";
import { computeBotKey } from "../convex/botAuth";

const BOT_KEY = "key-thô-32-bytes-của-bot";
const handler = (getPendingJobs as any)._handler;

type Row = Record<string, any>;

/**
 * ctx giả tối thiểu: query builder dùng được cả .withIndex().first()/collect(),
 * .collect(), .take(), .order() và .filter() (buildHiddenJobs dùng .filter()).
 */
function makeCtx(tables: Record<string, Row[]>) {
  const db = {
    query: (table: string) => {
      const rows = tables[table] ?? [];
      const builder: any = {
        withIndex: (_name: string, bound: (q: any) => any) => {
          const capture: Record<string, any> = {};
          const q = {
            eq: (f: string, v: any) => {
              capture[f] = v;
              return q;
            },
            field: (f: string) => f,
          };
          bound(q);
          return makeView(
            rows.filter((r) => Object.entries(capture).every(([k, v]) => r[k] === v)),
          );
        },
        ...makeView(rows),
      };
      return builder;
    },
    get: async (id: string) =>
      Object.values(tables)
        .flat()
        .find((r) => r._id === id) ?? null,
    // Cron đợt #4 (sweep báo cáo ngày / auto backup) ghi bằng patch — cần cho test.
    patch: async (id: string, patch: Row) => {
      for (const rows of Object.values(tables)) {
        const row = rows.find((r) => r._id === id);
        if (row) Object.assign(row, patch);
      }
    },
  };
  return { db } as any;
}

function makeView(rows: Row[]) {
  const view: any = {
    collect: async () => rows,
    take: async (n: number) => rows.slice(0, n),
    first: async () => rows[0] ?? null,
    order: () => view,
    filter: () => view,
  };
  return view;
}

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean) => {
  console.log(ok ? `  ✅ ${label}` : `  ❌ ${label}`);
  if (ok) pass++;
  else fail++;
};

const NOW = Date.now();
const status = { _id: "st", kind: "status", botKeySeed: computeBotKey(BOT_KEY), online: true };

(async () => {
  console.log("\n── settingsChanges: guild vừa sửa cấu hình ──");
  {
    const ctx = makeCtx({
      botStatus: [status],
      guilds: [
        {
          _id: "g1",
          discordId: "g-fresh",
          botInGuild: true,
          name: "Mới sửa",
          settingsChangedAt: NOW - 60_000,
        },
        {
          _id: "g2",
          discordId: "g-old",
          botInGuild: true,
          name: "Sửa lâu rồi",
          settingsChangedAt: NOW - 60 * 60_000,
        },
        { _id: "g3", discordId: "g-none", botInGuild: true, name: "Chưa từng sửa" },
        {
          _id: "g4",
          discordId: "g-gone",
          botInGuild: false,
          name: "Bot đã rời",
          settingsChangedAt: NOW,
        },
      ],
    });
    const jobs = await handler(ctx, { botKey: BOT_KEY });
    check(
      "guild vừa sửa cấu hình → có trong settingsChanges kèm mốc `at`",
      jobs.settingsChanges.length === 1 &&
        jobs.settingsChanges[0].guildId === "g-fresh" &&
        typeof jobs.settingsChanges[0].at === "number",
    );
    check(
      "cấu hình sửa quá cũ (1 giờ) → không gửi lại (chống xóa cache lặp / payload phình)",
      !jobs.settingsChanges.some((c: any) => c.guildId === "g-old"),
    );
    check(
      "guild chưa từng sửa + guild bot đã rời → không có trong settingsChanges",
      jobs.settingsChanges.length === 1,
    );
  }

  console.log("\n── Hồi quy: các nhánh cũ của batch vẫn chạy ──");
  {
    const ctx = makeCtx({
      botStatus: [status],
      guilds: [
        {
          _id: "g1",
          discordId: "g-bk",
          botInGuild: true,
          name: "Cần backup",
          backupRequested: true,
          backupPushToGithub: true,
          backupIncludeMessages: true,
        },
        {
          _id: "g2",
          discordId: "g-verify",
          botInGuild: true,
          name: "Cần panel xác minh",
          verifySendPanel: true,
          verifyEnabled: true,
          verifyChannelId: "ch-1",
          unverifiedRoleId: "r1",
          verifiedRoleId: "r2",
          verifyMethod: "button",
        },
      ],
      reactionRolePanels: [],
      giveaways: [],
      guildWebhooks: [],
    });
    const jobs = await handler(ctx, { botKey: BOT_KEY });
    check(
      "yêu cầu backup đang chờ vẫn được trả (kèm cờ pushGitHub/includeMessages)",
      jobs.backups.some(
        (b: any) =>
          b.kind === "backup" &&
          b.guildId === "g-bk" &&
          b.pushToGithub === true &&
          b.includeMessages === true,
      ),
    );
    check(
      "guild cần gửi panel xác minh vẫn được trả",
      jobs.verifyPanels.some((v: any) => v.guildId === "g-verify" && v.verifyChannelId === "ch-1"),
    );
    check(
      "hidden jobs là mảng (buildHiddenJobs chạy được trên ctx giả)",
      Array.isArray(jobs.hidden),
    );
    check("không có guild sửa cấu hình → settingsChanges rỗng", jobs.settingsChanges.length === 0);
  }

  console.log("\n── Job dọn kênh ticket ──");
  {
    // Bug thật 28/09/2026: `runPurge` lưu transcript xong mới xoá kênh. Nếu
    // `channel.delete()` lỗi (thiếu quyền) thì bản ghi vẫn `closed` + ĐÃ CÓ
    // transcript → lượt tick sau `continue` vì `transcriptStorageId` → kênh
    // không bao giờ được dọn lần nữa. Phải vẫn sinh job, kèm cờ báo đã có
    // transcript để bot khỏi lưu lại.
    const OLD = NOW - 40 * 3_600_000;
    const ctx = makeCtx({
      botStatus: [status],
      guilds: [
        {
          _id: "g1",
          discordId: "g-tk",
          botInGuild: true,
          name: "Ticket",
          ticketEnabled: true,
          ticketIdleHours: 24,
          ticketCloseGraceHours: 24,
        },
      ],
      tickets: [
        {
          _id: "t-saved",
          guildId: "g-tk",
          channelId: "ch-1",
          status: "closed",
          createdAt: OLD,
          closedAt: OLD,
          // Đã lưu transcript (lượt purge trước) + đã thu quyền, nhưng
          // `channel.delete()` lỗi → kênh còn treo, phải được thử xoá lại.
          transcriptStorageId: "st-1",
          channelClosedAt: OLD,
        },
        {
          _id: "t-fresh",
          guildId: "g-tk",
          channelId: "ch-2",
          status: "closed",
          createdAt: OLD,
          closedAt: NOW - 60_000,
          channelClosedAt: OLD,
        },
      ],
    });
    const jobs = await handler(ctx, { botKey: BOT_KEY });
    const saved = jobs.tickets.find((j: any) => j.ticketId === "t-saved");
    check(
      "ticket đã lưu transcript + hết hạn → VẪN sinh job purge (không bị bỏ rơi)",
      !!saved && saved.status === "purge",
      JSON.stringify(saved),
    );
    check("job purge kèm cờ transcriptReady", saved?.transcriptReady === true);
    check(
      "ticket mới đóng (chưa hết hạn giữ kênh) → không sinh purge",
      !jobs.tickets.some((j: any) => j.ticketId === "t-fresh" && j.status === "purge"),
    );
  }

  console.log("\n── botKey: batch là function bảo mật cao ──");
  {
    const ctx = makeCtx({ botStatus: [status], guilds: [] });
    let threw = "";
    try {
      await handler(ctx, { botKey: "key-sai" });
    } catch (e: any) {
      threw = String(e?.message ?? e);
    }
    check("botKey sai → bị từ chối", threw.includes("botKey") || threw.includes("Chìa khóa bot"));
  }

  // ═══ Ngân sách tin nhắn (phương án D — 29/09/2026) ═══
  console.log("\n── job đóng vì chạm ngân sách tin nhắn ──");
  {
    // ⚠️ Ngân sách tin phải kiểm TRƯỚC đồng hồ im lặng: kênh đang bị spam
    // thì lastActivityAt cứ được đẩy lùi, nhánh idle không bao giờ chạm
    // ngưỡng — tức hàng rào chống spam chỉ có tác dụng khi im lặng.
    const mk = (ticketOver: Row, guildOver: Row = {}) =>
      makeCtx({
        botStatus: [status],
        guilds: [
          {
            _id: "g1",
            discordId: "g-tk",
            botInGuild: true,
            name: "Ticket",
            ticketEnabled: true,
            ticketIdleHours: 24,
            ticketCloseGraceHours: 24,
            ticketMessageBudget: 5,
            ...guildOver,
          },
        ],
        tickets: [
          {
            _id: "t1",
            guildId: "g-tk",
            channelId: "ch-1",
            number: 1,
            kind: "support",
            openerId: "u1",
            status: "open",
            createdAt: NOW - 60_000,
            // VỪA có tin vừa gần đây → nhánh im lặng KHÔNG chạm ngưỡng.
            lastActivityAt: NOW - 1_000,
            ...ticketOver,
          },
        ],
      });
    const jobsOf = (out: any) => (out.tickets ?? []).filter((j: Row) => j.ticketId === "t1");

    const busy = await handler(mk({ messageCount: 5 }), { botKey: BOT_KEY });
    check("chạm ngân sách → có job đóng dù vừa có tin", jobsOf(busy).length === 1);
    check(
      "job ghi lý do budget để bot đóng đúng câu chữ",
      jobsOf(busy)[0]?.closeCause === "budget",
    );

    const chua = await handler(mk({ messageCount: 4 }), { botKey: BOT_KEY });
    check("chưa chạm ngân sách → KHÔNG sinh job", jobsOf(chua).length === 0);

    // Tắt ngân sách (0) → hành vi y như cũ: chỉ đóng khi im lặng.
    const tat = await handler(mk({ messageCount: 9999 }, { ticketMessageBudget: 0 }), {
      botKey: BOT_KEY,
    });
    check("ngân sách 0 = tắt, tin nhắn nhiều không sinh job", jobsOf(tat).length === 0);

    // Vẫn phải đóng vì IM LẶNG khi chưa chạm ngân sách.
    const imLang = await handler(mk({ messageCount: 1, lastActivityAt: NOW - 40 * 3_600_000 }), {
      botKey: BOT_KEY,
    });
    check("chưa chạm ngân sách nhưng im lặng lâu → vẫn đóng", jobsOf(imLang).length === 1);
    check("job do im lặng không gắn cờ budget", jobsOf(imLang)[0]?.closeCause === undefined);
  }

  console.log("\n── Job restore: backup tách chunk phải được ghép lại ──");
  {
    // Bug thật 30/09/2026: `bot_tick.getPendingJobs` đẩy thẳng `b.backupJson`
    // cho bot, KHÔNG qua `reassembleBackupJsonForRead`. Bản backup >700KB được
    // tách chunk nên `backupJson` chỉ là ký hiệu "chunked:N" — bot sẽ khôi
    // phục từ chuỗi đó và báo "thành công" trong khi thực tế không có server
    // nào được khôi phục. Đường cũ (`backup:botGetPending`) đã làm đúng: ghép
    // lại + THIẾU CHUNK thì KHÔNG gửi job (bỏ cờ restore để thấy lỗi rõ).
    const mkRestoreCtx = (backupRow: any, chunks: any[] = []) => {
      const ctx = makeCtx({
        botStatus: [status],
        guilds: [
          {
            _id: "g1",
            discordId: "g-restore",
            botInGuild: true,
            name: "Cần khôi phục",
            restoreRequested: true,
            restoreBackupId: "b1",
          },
        ],
        guildBackups: [backupRow],
        backupChunks: chunks,
        reactionRolePanels: [],
        giveaways: [],
        guildWebhooks: [],
      });
      return ctx;
    };

    // 1) Bản nhỏ (không tách chunk) → trả nguyên văn.
    const small = await handler(
      mkRestoreCtx({ _id: "b1", guildId: "g-restore", guildName: "S", backupJson: "z:AAAA" }),
      { botKey: BOT_KEY },
    );
    const smallJob = small.backups.find((b: any) => b.kind === "restore");
    check(
      "bản không tách chunk → backupJson nguyên vẹn",
      !!smallJob && smallJob.backupJson === "z:AAAA",
    );

    // 2) Bản TÁCH CHUNK, chunk đủ → phải GHÉP LẠI trước khi gửi bot.
    const payload = "z:" + "X".repeat(1_200_000);
    const full = await handler(
      mkRestoreCtx(
        {
          _id: "b1",
          guildId: "g-restore",
          guildName: "S",
          backupJson: "chunked:2",
          backupChunkCount: 2,
        },
        [
          { _id: "c0", backupId: "b1", index: 0, data: payload.slice(0, 600_000) },
          { _id: "c1", backupId: "b1", index: 1, data: payload.slice(600_000) },
        ],
      ),
      { botKey: BOT_KEY },
    );
    const fullJob = full.backups.find((b: any) => b.kind === "restore");
    check(
      "bản tách chunk (chunk đủ) → ghép lại, KHÔNG gửi ký hiệu chunked:N cho bot",
      !!fullJob && fullJob.backupJson === payload,
    );

    // 3) Thiếu chunk → bot KHÔNG BAO GIỜ được giao payload cụt. Job vẫn gửi
    //    kèm cờ `unreadable` để bot báo lỗi thật và DỌN cờ restoreRequested
    //    (bỏ qua im lặng làm dashboard quay vòng chờ vô hạn).
    const missing = await handler(
      mkRestoreCtx(
        {
          _id: "b1",
          guildId: "g-restore",
          guildName: "S",
          backupJson: "chunked:3",
          backupChunkCount: 3,
        },
        [
          { _id: "c0", backupId: "b1", index: 0, data: payload.slice(0, 600_000) },
          { _id: "c1", backupId: "b1", index: 1, data: payload.slice(600_000) },
        ],
      ),
      { botKey: BOT_KEY },
    );
    const missingJob = missing.backups.find((b: any) => b.kind === "restore");
    check(
      "thiếu chunk → KHÔNG gửi payload cụt cho bot",
      !!missingJob && missingJob.backupJson === undefined,
      JSON.stringify(missingJob?.backupJson?.slice(0, 12)),
    );
    check(
      "thiếu chunk → job unreadable + có lý do (bot báo lỗi rồi dọn cờ)",
      missingJob?.unreadable === true && typeof missingJob?.unreadableReason === "string",
      JSON.stringify(missingJob?.unreadableReason),
    );
  }

  console.log("\n── Job plan (dry-run khôi phục): batch tick phải sinh job cho bot ──");
  {
    // Nút "xem kế hoạch khôi phục" đặt restorePlanRequested. Đường quét cũ sinh job
    // `plan` nhưng batch tick thì không → yêu cầu không bao giờ được trả lời.
    const mkPlanCtx = (guildExtra: any, backupRow: any, chunks: any[] = []) =>
      makeCtx({
        botStatus: [status],
        guilds: [
          {
            _id: "g1",
            discordId: "g-plan",
            botInGuild: true,
            name: "Cần xem kế hoạch",
            ...guildExtra,
          },
        ],
        guildBackups: [backupRow],
        backupChunks: chunks,
        reactionRolePanels: [],
        giveaways: [],
        guildWebhooks: [],
      });
    const row = (extra: any = {}) => ({
      _id: "b1",
      guildId: "g-plan",
      guildName: "Bản sao",
      backupJson: "z:PLAN",
      createdAt: 1234,
      ...extra,
    });

    const asked = await handler(
      mkPlanCtx({ restorePlanRequested: true, restorePlanBackupId: "b1" }, row()),
      { botKey: BOT_KEY },
    );
    const planJob = asked.backups.find((b: any) => b.kind === "plan");
    check(
      "restorePlanRequested → sinh job kind plan kèm nội dung backup",
      !!planJob && planJob.guildId === "g-plan" && planJob.backupJson === "z:PLAN",
    );
    check(
      "job plan mang đúng backupId + tên + mốc tạo",
      planJob?.backupId === "b1" &&
        planJob?.guildName === "Bản sao" &&
        planJob?.backupCreatedAt === 1234,
    );
    check(
      "plan KHÔNG bị nhầm thành restore thật",
      !asked.backups.some((b: any) => b.kind === "restore"),
    );

    const notAsked = await handler(mkPlanCtx({}, row()), { botKey: BOT_KEY });
    check(
      "không có cờ plan → không sinh job plan",
      !notAsked.backups.some((b: any) => b.kind === "plan"),
    );
    const noBackupId = await handler(mkPlanCtx({ restorePlanRequested: true }, row()), {
      botKey: BOT_KEY,
    });
    check(
      "cờ plan nhưng thiếu restorePlanBackupId → không sinh job",
      !noBackupId.backups.some((b: any) => b.kind === "plan"),
    );
    const gone = await handler(
      mkPlanCtx({ restorePlanRequested: true, restorePlanBackupId: "b-khong-con" }, row()),
      { botKey: BOT_KEY },
    );
    const goneJob = gone.backups.find((b: any) => b.kind === "plan");
    check(
      "backup đã bị xoá → job unreadable + nói rõ (bot báo lỗi rồi dọn cờ plan)",
      goneJob?.unreadable === true && /không còn tồn tại/.test(goneJob?.unreadableReason ?? ""),
      JSON.stringify(goneJob?.unreadableReason),
    );

    // Backup tách chunk phải được GHÉP LẠI như restore (nếu không bot tính kế hoạch từ chuỗi rác).
    const payload = "z:" + "P".repeat(1_200_000);
    const chunked = await handler(
      mkPlanCtx(
        { restorePlanRequested: true, restorePlanBackupId: "b1" },
        row({ backupJson: "chunked:2", backupChunkCount: 2 }),
        [
          { _id: "c0", backupId: "b1", index: 0, data: payload.slice(0, 600_000) },
          { _id: "c1", backupId: "b1", index: 1, data: payload.slice(600_000) },
        ],
      ),
      { botKey: BOT_KEY },
    );
    check(
      "plan của bản tách chunk → ghép lại đủ, không gửi ký hiệu chunked:N",
      chunked.backups.find((b: any) => b.kind === "plan")?.backupJson === payload,
    );
    const brokenChunks = await handler(
      mkPlanCtx(
        { restorePlanRequested: true, restorePlanBackupId: "b1" },
        row({ backupJson: "chunked:3", backupChunkCount: 3 }),
        [{ _id: "c0", backupId: "b1", index: 0, data: payload.slice(0, 600_000) }],
      ),
      { botKey: BOT_KEY },
    );
    const brokenPlanJob = brokenChunks.backups.find((b: any) => b.kind === "plan");
    check(
      "thiếu chunk → KHÔNG giao payload cụt cho bot",
      !!brokenPlanJob && brokenPlanJob.backupJson === undefined,
      JSON.stringify(brokenPlanJob?.backupJson?.slice(0, 12)),
    );
    check(
      "thiếu chunk → job plan unreadable (nút xem kế hoạch báo lỗi thay vì quay vòng)",
      brokenPlanJob?.unreadable === true && typeof brokenPlanJob?.unreadableReason === "string",
      JSON.stringify(brokenPlanJob?.unreadableReason),
    );

    // Yêu cầu restore thật VÀ plan cùng lúc → cả hai job, không cái nào nuốt cái nào.
    const both = await handler(
      mkPlanCtx(
        {
          restoreRequested: true,
          restoreBackupId: "b1",
          restorePlanRequested: true,
          restorePlanBackupId: "b1",
        },
        row(),
      ),
      { botKey: BOT_KEY },
    );
    check(
      "restore thật + plan cùng lúc → đủ 2 job phân biệt",
      both.backups.filter((b: any) => b.kind === "restore").length === 1 &&
        both.backups.filter((b: any) => b.kind === "plan").length === 1,
    );
  }

  console.log("\n── Báo cáo ngày: batch trả cờ cron (đợt #4) ──");
  {
    const ctx = makeCtx({
      botStatus: [status],
      guilds: [
        {
          _id: "r1",
          discordId: "g-report",
          botInGuild: true,
          name: "Cờ chờ gửi",
          reportRequestedAt: NOW - 1_000,
        },
        { _id: "r2", discordId: "g-no-report", botInGuild: true, name: "Không cờ" },
        {
          _id: "r3",
          discordId: "g-gone-report",
          botInGuild: false,
          name: "Bot đã rời",
          reportRequestedAt: NOW,
        },
      ],
      reactionRolePanels: [],
      giveaways: [],
      guildWebhooks: [],
    });
    const jobs = await handler(ctx, { botKey: BOT_KEY });
    check(
      "guild có cờ reportRequestedAt → trả trong jobs.reports",
      jobs.reports.length === 1 && jobs.reports[0].guildId === "g-report",
      JSON.stringify(jobs.reports),
    );
    check(
      "guild không cờ → không trả job báo cáo",
      !jobs.reports.some((r: any) => r.guildId === "g-no-report"),
    );
    check(
      "guild bot đã rời (botInGuild=false) → không trả job báo cáo",
      !jobs.reports.some((r: any) => r.guildId === "g-gone-report"),
    );
  }

  console.log("\n── Báo cáo ngày: luật đặt cờ của cron (sweepDueDailyReports) ──");
  {
    const sweep = (sweepDueDailyReports as any)._handler as (
      ctx: any,
      args: any,
    ) => Promise<{ flagged: number }>;
    const NOW2 = Date.now();
    const HOUR = 60 * 60_000;
    const tables = {
      guilds: [
        {
          _id: "s1",
          discordId: "s1",
          botInGuild: true,
          name: "Đến hạn",
          logChannelId: "ch",
          lastReportAt: NOW2 - 21 * HOUR,
        },
        {
          _id: "s2",
          discordId: "s2",
          botInGuild: true,
          name: "Mới gửi 2h trước",
          logChannelId: "ch",
          lastReportAt: NOW2 - 2 * HOUR,
        },
        {
          _id: "s3",
          discordId: "s3",
          botInGuild: true,
          name: "Chưa từng gửi",
          logChannelId: "ch",
        },
        { _id: "s4", discordId: "s4", botInGuild: true, name: "Không kênh log" },
        {
          _id: "s5",
          discordId: "s5",
          botInGuild: true,
          name: "Tắt báo cáo",
          logChannelId: "ch",
          dailyReportEnabled: false,
          lastReportAt: NOW2 - 30 * HOUR,
        },
        {
          _id: "s6",
          discordId: "s6",
          botInGuild: true,
          name: "Đã có cờ chờ",
          logChannelId: "ch",
          lastReportAt: NOW2 - 30 * HOUR,
          reportRequestedAt: NOW2 - 5_000,
        },
        {
          _id: "s7",
          discordId: "s7",
          botInGuild: false,
          name: "Bot đã rời",
          logChannelId: "ch",
          lastReportAt: NOW2 - 30 * HOUR,
        },
      ],
    } as Record<string, Row[]>;
    const ctx = makeCtx(tables);
    const res = await sweep(ctx, {});
    const by = (id: string) => tables.guilds.find((g) => g._id === id)!;
    check(
      "chỉ đặt cờ cho guild đủ điều kiện (s1 quá 20h + s3 chưa gửi)",
      res.flagged === 2,
      JSON.stringify(res),
    );
    check("s1 → có cờ", typeof by("s1").reportRequestedAt === "number");
    check("s3 → có cờ", typeof by("s3").reportRequestedAt === "number");
    check("s2 mới gửi 2h → không cờ", by("s2").reportRequestedAt === undefined);
    check("s4 thiếu kênh log → không cờ", by("s4").reportRequestedAt === undefined);
    check("s5 tắt báo cáo → không cờ", by("s5").reportRequestedAt === undefined);
    check(
      "s6 đã có cờ → giữ nguyên mốc cũ (không ghi đè liên tục)",
      by("s6").reportRequestedAt === NOW2 - 5_000,
    );
    check("s7 bot đã rời → không cờ", by("s7").reportRequestedAt === undefined);
  }

  console.log(`\n${pass}/${pass + fail} ✅`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
