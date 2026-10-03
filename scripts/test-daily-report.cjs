// Test dailyReport.js — báo cáo Anti-Nuke hằng ngày:
//   - chỉ chạy guild ĐẾN HẠN (đã bật + có kênh log + quá ~20h), cập nhật mốc sau khi gửi
//   - gộp sự kiện theo module + thủ phạm thường xuyên
//   - server bình yên → thông điệp "Server bình yên!"
//   - gộp bảng nhiệt độ + warn tích lũy (heatSnapshot/strikeSnapshot)
//   - lỗi từng guild không làm sập vòng lặp
// Mock discord.js + ./antinuke + ../heat + ../util (không gửi Discord thật).
// Chạy: node scripts/test-daily-report.cjs
const DJS_MOCK = require("./support/djs-mock-path.cjs");

const Module = require("module");
const fs = require("fs");
const path = require("path");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "discord.js") return DJS_MOCK;
  return origResolve.call(this, request, ...args);
};
fs.writeFileSync(
  DJS_MOCK,
  `class EmbedBuilder {
  constructor(data = {}) { this.data = { ...data }; this.d = this.data; }
  setColor(c) { this.data.color = c; return this; }
  setTitle(t) { this.data.title = t; return this; }
  setDescription(t) { this.data.description = t; return this; }
  addFields(...f) { this.data.fields = [...(this.data.fields ?? []), ...f.flat(Infinity)]; return this; }
  setTimestamp() { return this; }
  setFooter(f) { this.data.footer = f; return this; }
}
module.exports = {
  Colors: { Red: 1, Green: 2, Yellow: 3, Blue: 4, Blurple: 5, Aqua: 6 },
  EmbedBuilder,
};
`,
);

const sentLogs = [];
let heatSnapshotRows = [];
let strikeSnapshotRows = [];
let eventsForGuild = [];
let queryShouldThrow = false;
let sendLogShouldThrow = false;

const origLoad = Module._load;
Module._load = function (request, parent) {
  const fromDaily = parent && /handlers[\\/]dailyReport\.js$/.test(parent.filename);
  if (fromDaily) {
    if (request === "../util") {
      return {
        async sendLog(guild, config, embed) {
          if (sendLogShouldThrow) throw new Error("webhook sập");
          sentLogs.push({ guild, config, embed });
        },
      };
    }
    if (request === "./antinuke") {
      return { MODULE_LABELS: { massBan: "Ban hàng loạt", massJoin: "Raid thành viên" } };
    }
    if (request === "../heat") {
      return {
        heatSettings: (config) => config.heat || {},
      };
    }
  }
  return origLoad.apply(this, arguments);
};

(async () => {
  const { runDailyReports, processReportJobs } = require("../bot/src/handlers/dailyReport");

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
    sentLogs.length = 0;
    heatSnapshotRows = [];
    strikeSnapshotRows = [];
    eventsForGuild = [];
    queryShouldThrow = false;
    sendLogShouldThrow = false;
  };

  function makeStore(configs) {
    const mutations = [];
    const queries = [];
    return {
      mutations,
      queries,
      getConfig: async (guildId) => configs.get(guildId) ?? null,
      client: {
        query: async (name, args) => {
          queries.push({ name, args });
          if (queryShouldThrow) throw new Error("query sập");
          return eventsForGuild;
        },
        mutation: async (name, args) => {
          mutations.push({ name, args });
          return { ok: true };
        },
      },
    };
  }
  const heat = {
    heatSnapshot: () => heatSnapshotRows,
    strikeSnapshot: () => strikeSnapshotRows,
  };
  const client = { guilds: { cache: new Map() } };

  // ── 1. Guild đến hạn, có sự kiện → gửi báo cáo + cập nhật mốc ──
  {
    clear();
    const configs = new Map();
    configs.set("g1", { logChannelId: "c1", lastReportAt: Date.now() - 25 * 60 * 60 * 1000 });
    const store = makeStore(configs);
    client.guilds.cache.set("g1", { id: "g1", name: "Server Một" });
    eventsForGuild = [
      { module: "massBan", action: "ban", executorId: "u1", createdAt: Date.now() - 3_600_000 },
      { module: "massBan", action: "ban", executorId: "u1", createdAt: Date.now() - 2_000_000 },
      { module: "massJoin", action: "kick", executorId: "u2", createdAt: Date.now() - 1_000_000 },
    ];
    await runDailyReports(client, store, heat);
    check("guild đến hạn → gửi 1 báo cáo", sentLogs.length === 1);
    check("báo cáo có tiêu đề daily", sentLogs[0].embed.data.title.includes("Báo cáo Anti-Nuke"));
    check(
      "báo cáo gộp đúng tổng sự kiện",
      sentLogs[0].embed.data.fields.some((f) => f.name === "Tổng sự kiện" && f.value === "3"),
    );
    check(
      "báo cáo có chi tiết theo module",
      sentLogs[0].embed.data.fields.some((f) => f.name === "Chi tiết theo module"),
    );
    check(
      "báo cáo có thủ phạm thường xuyên",
      sentLogs[0].embed.data.fields.some((f) => f.name === "Thủ phạm thường xuyên"),
    );
    check(
      "gửi xong → cập nhật mốc botSetReportAt",
      store.mutations.some(
        (m) => m.name === "bot_writes:botSetReportAt" && m.args.guildId === "g1",
      ),
    );
  }

  // ── 2. Guild CHƯA đến hạn → bỏ qua ──
  {
    clear();
    const configs = new Map();
    configs.set("g1", { logChannelId: "c1", lastReportAt: Date.now() - 3_600_000 });
    const store = makeStore(configs);
    client.guilds.cache.set("g1", { id: "g1", name: "Server Một" });
    await runDailyReports(client, store, heat);
    check("chưa đủ ~20h → không gửi", sentLogs.length === 0 && store.mutations.length === 0);
  }

  // ── 3. Thiếu kênh log / tắt báo cáo → bỏ qua ──
  {
    clear();
    const configs = new Map();
    configs.set("g-nochan", { lastReportAt: 0 });
    configs.set("g-off", { logChannelId: "c", dailyReportEnabled: false, lastReportAt: 0 });
    const store = makeStore(configs);
    client.guilds.cache.set("g-nochan", { id: "g-nochan", name: "A" });
    client.guilds.cache.set("g-off", { id: "g-off", name: "B" });
    await runDailyReports(client, store, heat);
    check("thiếu kênh log hoặc bị tắt → không gửi", sentLogs.length === 0);
  }

  // ── 4. Server bình yên (không sự kiện) → thông điệp bình yên ──
  {
    clear();
    const configs = new Map();
    configs.set("g-quiet", { logChannelId: "c", lastReportAt: 0 });
    const store = makeStore(configs);
    client.guilds.cache.set("g-quiet", { id: "g-quiet", name: "Yên Bình" });
    eventsForGuild = [];
    await runDailyReports(client, store, heat);
    check(
      "không sự kiện → báo cáo 'Server bình yên'",
      sentLogs.length === 1 && sentLogs[0].embed.data.description.includes("Server bình yên"),
    );
  }

  // ── 5. Bảng nhiệt độ + warn tích lũy được gộp ──
  {
    clear();
    const configs = new Map();
    configs.set("g-heat", { logChannelId: "c", lastReportAt: 0, heat: {} });
    const store = makeStore(configs);
    client.guilds.cache.set("g-heat", { id: "g-heat", name: "Nóng" });
    eventsForGuild = [];
    heatSnapshotRows = [
      { userId: "u1", heat: 80, tier: "kick" },
      { userId: "u2", heat: 0, tier: null },
    ];
    strikeSnapshotRows = [{ userId: "u1", count: 2, limit: 3 }];
    await runDailyReports(client, store, heat);
    const field = sentLogs[0].embed.data.fields.find((f) => f.name.includes("Nhiệt độ"));
    check("có bảng nhiệt độ & warn", !!field);
    check(
      "gộp warn vào đúng user, sắp theo nhiệt giảm dần",
      field.value.includes("u1") && field.value.indexOf("u1") < field.value.indexOf("u2"),
    );
    check("warn của u1 hiển thị 2/3", field.value.includes("2/3"));
  }

  // ── 6. Lọc sự kiện theo mốc lastReportAt ──
  {
    clear();
    const configs = new Map();
    const lastAt = Date.now() - 25 * 60 * 60 * 1000;
    configs.set("g-filter", { logChannelId: "c", lastReportAt: lastAt });
    const store = makeStore(configs);
    client.guilds.cache.set("g-filter", { id: "g-filter", name: "Lọc" });
    eventsForGuild = [
      { module: "massBan", action: "ban", createdAt: lastAt - 3_600_000 }, // trước mốc → bỏ
      { module: "massBan", action: "ban", createdAt: lastAt + 60_000 }, // sau mốc → giữ
    ];
    await runDailyReports(client, store, heat);
    check(
      "chỉ tính sự kiện sau mốc báo cáo",
      sentLogs[0].embed.data.fields.some((f) => f.name === "Tổng sự kiện" && f.value === "1"),
    );
  }

  // ── 7. Lỗi query từng guild → coi như không có sự kiện, vẫn gửi báo cáo bình yên ──
  {
    clear();
    const configs = new Map();
    configs.set("g-err", { logChannelId: "c", lastReportAt: 0 });
    const store = makeStore(configs);
    client.guilds.cache.set("g-err", { id: "g-err", name: "Lỗi" });
    queryShouldThrow = true;
    await runDailyReports(client, store, heat);
    check(
      "query lỗi → fail-safe coi như rỗng, gửi báo cáo bình yên (không crash)",
      sentLogs.length === 1 && sentLogs[0].embed.data.description.includes("Server bình yên"),
    );
  }

  // ── 8. sendLog lỗi → vẫn cập nhật mốc? Không: lỗi được bắt, không crash ──
  {
    clear();
    const configs = new Map();
    configs.set("g-send", { logChannelId: "c", lastReportAt: 0 });
    const store = makeStore(configs);
    client.guilds.cache.set("g-send", { id: "g-send", name: "Send" });
    eventsForGuild = [];
    sendLogShouldThrow = true;
    await runDailyReports(client, store, heat);
    check("sendLog lỗi → bắt lỗi, không crash", true);
  }

  // ── 9. Đợt #4: cờ cron do Convex đặt → tick xử lý + chặn hồi quy kiến trúc ──
  {
    clear();
    const configs = new Map();
    configs.set("g-cron", { logChannelId: "c", lastReportAt: Date.now() - 25 * 3_600_000 });
    const store = makeStore(configs);
    client.guilds.cache.set("g-cron", { id: "g-cron", name: "Cron" });
    eventsForGuild = [];
    await processReportJobs(client, store, heat, [{ guildId: "g-cron" }, { guildId: "g-missing" }]);
    check("cờ cron → gửi báo cáo cho guild đến hạn", sentLogs.length === 1);
    check(
      "cờ cron → gửi xong xoá cờ qua botSetReportAt",
      store.mutations.some(
        (m) => m.name === "bot_writes:botSetReportAt" && m.args.guildId === "g-cron",
      ),
    );
    check(
      "cờ cho guild bot đã rời → bỏ qua an toàn (không mutation sai)",
      store.mutations.every((m) => m.args.guildId === "g-cron"),
    );
  }
  {
    const ROOT = path.join(__dirname, "..");
    const cronsSrc = fs.readFileSync(path.join(ROOT, "convex", "crons.ts"), "utf8");
    check(
      "convex/crons.ts: lịch báo cáo 30 phút → internal.reports.sweepDueDailyReports",
      /crons\.interval\(\s*"daily-report-sweep",\s*\{\s*minutes:\s*30\s*\},\s*internal\.reports\.sweepDueDailyReports/.test(
        cronsSrc,
      ),
    );
    const idxSrc = fs.readFileSync(path.join(ROOT, "bot", "src", "index.js"), "utf8");
    check(
      "bot/src/index.js không còn reportInterval (lịch thuộc Convex cron)",
      !idxSrc.includes("reportInterval"),
    );
    const reportsSrc = fs.readFileSync(path.join(ROOT, "convex", "reports.ts"), "utf8");
    const botDailySrc = fs.readFileSync(
      path.join(ROOT, "bot", "src", "handlers", "dailyReport.js"),
      "utf8",
    );
    check(
      "ngưỡng 20h của cron khớp MIN_INTERVAL_MS phía bot (không lệch gây bỏ sót)",
      reportsSrc.includes("20 * 60 * 60 * 1000") && botDailySrc.includes("20 * 60 * 60 * 1000"),
    );
    const settingsSrc = fs.readFileSync(
      path.join(ROOT, "convex", "bot_writes", "settings.ts"),
      "utf8",
    );
    check(
      "botSetReportAt xoá cờ reportRequestedAt sau khi gửi (cờ chỉ sống khi chưa gửi)",
      /lastReportAt: at[\s\S]{0,200}reportRequestedAt: undefined/.test(settingsSrc),
    );
  }

  fs.unlinkSync(DJS_MOCK);
  console.log(`\nKết quả daily report: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
