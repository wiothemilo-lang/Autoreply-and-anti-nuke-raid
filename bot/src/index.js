// ============================================================
// Protogon Bot — Full-Featured Production Entry Point
// Target: VPS with 32GB RAM, 6 CPU cores, 80GB storage
// ============================================================

require("./loadenv").loadEnv();

// --- Startup env validation ---
const REQUIRED_VARS = ["DISCORD_TOKEN"];
const MISSING = REQUIRED_VARS.filter((k) => !process.env[k]);
if (MISSING.length > 0) {
  console.error(`❌ Thiếu biến môi trường bắt buộc: ${MISSING.join(", ")}`);
  console.error("   Kiểm tra file .env hoặc biến môi trường trên VPS.");
  process.exit(1);
}
if (!process.env.CONVEX_URL) {
  console.error("❌ Thiếu CONVEX_URL — bot cần kết nối Convex backend.");
  console.error("   Thêm CONVEX_URL=https://xxx-xxx-xx.convex.cloud vào file .env");
  process.exit(1);
}

const { Client, GatewayIntentBits, ActivityType, Collection, Partials } = require("discord.js");
const ConvexStore = require("./convex");
const { HeatTracker } = require("./heat");
const guildSync = require("./handlers/guildSync");
const onMessageCreate = require("./handlers/messageCreate");
const onInteractionCreate = require("./handlers/interactionCreate");
const joinGate = require("./handlers/joinGate");
const { scanGuildForAltsAsync, sweepStaleGuilds } = require("./altDetection");
const webhookHub = require("./webhookHub");
const { registerSweeper, startMemGuard } = require("./memGuard");
const { startMetrics } = require("./metricsRuntime");

/** Hàm dừng đo lường — gán trong clientReady, dùng lúc thoát (xem shutdown). */
let stopMetrics = null;
const metricsModule = require("./metrics");

// --- Client config: full-featured for powerful VPS ---
const client = new Client({
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User,
    Partials.GuildMember,
  ],
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
  ],
  makeCache: (_manager) => {
    // Use default Collection for all managers (full caching)
    return new Collection();
  },
  sweepers: {
    messages: { interval: 3600, lifetime: 1800 }, // 1 hour interval, 30 min lifetime
    users: { interval: 3600, filter: () => (user) => user.id !== client.user?.id },
    guildMembers: { interval: 3600, filter: () => (member) => member.id !== member.guild?.ownerId },
  },
});

const store = new ConvexStore();
const heat = new HeatTracker(client, store);

// --- memGuard (Đợt 7): đăng ký sweeper cho các vùng bộ nhớ BỊ LỠ trước đây.
// Vùng nóng đã có sweeper riêng (state.js 20s, timeoutWatch, altDetection 1h…)
// — không đăng ký lại. registerSweeper phải chạy trước clientReady để vòng đầu
// không bỏ sót guild.
registerSweeper("heat-states", () => heat.sweepCold());
registerSweeper("alt-guilds", () => sweepStaleGuilds(new Set(client.guilds.cache.keys())));
registerSweeper("config-cache", () => store.pruneCache(new Set(client.guilds.cache.keys())));
registerSweeper("owner-alert", () =>
  require("./handlers/antinuke/ownerAlert").pruneCache(new Set(client.guilds.cache.keys())),
);
registerSweeper("voice-presence", () => {
  let removed = 0;
  const live = new Set(client.guilds.cache.keys());
  for (const guildId of [...voicePresenceMap.keys()]) {
    if (!live.has(guildId)) {
      voicePresenceMap.delete(guildId);
      removed++;
    }
  }
  return removed;
});

client.once("clientReady", async () => {
  console.log(`✅ Protogon đã online: ${client.user.tag} — ${client.guilds.cache.size} server`);

  // Thẻ ảnh chào (v3): báo cho Convex biết máy chủ này có vẽ được thẻ hay không.
  // Gọi MỘT LẦN — kết quả nạp thư viện/font được cache trong tiến trình. Phải
  // báo cả trường hợp THẤT BẠI, nếu không dashboard chỉ thấy "thẻ đang bật" mà
  // không có gì giải thích tại sao không có ảnh nào.
  try {
    const cardMod = require("./handlers/welcomeCard");
    const ready = cardMod.cardAvailable();
    // CHỈ gửi `reason` khi thất bại: validator Convex không nhận field optional mang
    // giá trị undefined tường minh (test-convex-arg-contract chặn đúng kiểu này).
    await store.client
      .mutation(
        "status:reportCardCapability",
        ready
          ? { ready: true }
          : { ready: false, reason: cardMod.cardUnavailableReason?.() || "không rõ lý do" },
      )
      .then(() => console.log(`[welcomeCard] đã báo khả năng vẽ thẻ: ${ready}`))
      .catch((e) => console.warn("[welcomeCard] không báo được trạng thái thẻ:", e?.message || e));
  } catch (e) {
    console.warn("[welcomeCard] bỏ qua báo trạng thái thẻ:", e?.message || e);
  }

  // Register slash commands
  if (process.env.AUTO_REGISTER_COMMANDS !== "false") {
    try {
      const { registerCommands } = require("./register-slash");
      const count = await registerCommands();
      console.log(`✅ Đã đăng ký ${count} slash commands`);
    } catch (err) {
      console.error("⚠️ Đăng ký slash commands thất bại:", err.message);
    }
  }

  // Init heavy modules
  const antinuke = require("./handlers/antinuke")(client, store, heat);
  antinuke.attach();
  require("./timeoutWatch").attach(client, store);
  require("./handlers/hidden").setupHidden(client, store);
  webhookHub.init(client, store);

  // C1 — snapshot backup cục bộ trên VPS: mỗi giờ, nén zlib, giữ 48 điểm.
  // (đốt disk + CPU nhẹ của VPS đổi lớp dự phòng restore khi Convex/GitHub sự cố)
  try {
    require("./localSnapshot").startLocalSnapshotLoop(client, store);
  } catch (e) {
    console.error("⚠️ localSnapshot không khởi động được:", e?.message || e);
  }

  // Canh sức khoẻ máy chủ (đĩa/bộ nhớ) — sự cố 25/09 đĩa đầu làm bot chết
  // cả buổi mà không ai được báo trước. Bot đo 5 phút/lần, ghi lên dashboard;
  // mức nặng hơn lần trước thì DM chủ bot (chống lặp trong healthWatch).
  try {
    const healthWatch = require("./handlers/healthWatch");
    healthWatch.startHealthWatch({
      store,
      sendAlert: async (text) => {
        const app = await client.application.fetch();
        const ownerId = app?.owner?.id ?? app?.owner?.ownerId;
        if (!ownerId) return;
        const owner = await client.users.fetch(ownerId).catch(() => null);
        if (!owner) return;
        await owner.send(text.slice(0, 1900));
      },
    });
    console.log("[health] đã bật canh sức khoẻ máy chủ (5 phút/lần)");
  } catch (e) {
    console.error("⚠️ healthWatch không khởi động được:", e?.message || e);
  }

  // D1 — preload config mọi guild lúc online: làm ấm cache trước khi có sự kiện
  // → antinuke/lockdown phản hồi tức thì; TTL 30 phút cắt ~2/3 reads getConfig.
  try {
    const ids = [...client.guilds.cache.keys()];
    if (ids.length) await store.prewarmConfigs(ids);
  } catch (e) {
    console.error("⚠️ prewarm config lỗi:", e?.message || e);
  }

  // D2 — member cache đầy đủ lúc online cho guild ≤ 5000 người: altDetection/
  // joinGate/heat tra TỨC THÌ từ cache, không bị Discord rate-limit khi raid đông.
  // Guild lớn hơn 5k: opt-in qua biến MEMBER_PREFETCH_MAX (đặt cao hơn nếu đủ RAM).
  try {
    const MEMBER_PREFETCH_MAX = Number(process.env.MEMBER_PREFETCH_MAX || 5000);
    let warmed = 0;
    for (const [, guild] of client.guilds.cache) {
      if (guild.memberCount > MEMBER_PREFETCH_MAX) continue;
      if (guild.members.cache.size >= guild.memberCount) continue;
      await guild.members.fetch({ limit: 1000 }).catch(() => {});
      warmed++;
    }
    if (warmed)
      console.log(`[members] đã cache đầy đủ ${warmed} guild (≤${MEMBER_PREFETCH_MAX} người)`);
  } catch (e) {
    console.error("⚠️ member prefetch lỗi:", e?.message || e);
  }

  // Bot owner detection
  try {
    const app = await client.application.fetch();
    const owner = app?.owner;
    const ownerId = owner?.ownerId || (/^\d{15,20}$/.test(owner?.id || "") ? owner.id : null);
    if (ownerId) {
      let ownerName, ownerAvatarUrl;
      try {
        const ownerUser = await client.users.fetch(ownerId).catch(() => null);
        if (ownerUser) {
          ownerName = ownerUser.username;
          ownerAvatarUrl = ownerUser.displayAvatarURL({ size: 256, extension: "png" });
        }
      } catch {}
      await store.client.mutation("hidden:botSetOwner", { ownerId, ownerName, ownerAvatarUrl });
    }
  } catch (e) {
    console.error("[owner]", e.message);
  }

  // Guild sync loop — mỗi 1 phút (đầy đủ)
  const runSyncLoop = () => {
    void (async () => {
      try {
        const res = await metricsModule.timeAsync("guildSync", "syncAll", () =>
          guildSync.syncAll(client, store),
        );
        console.log(
          `[sync] ${res?.count ?? "?"} server${res?.trustedFullList === false ? " (cache thiếu)" : ""}`,
        );
      } catch (e) {
        console.error("[sync]", e.message);
      }
      // TỐI ƯU USAGE: 180s (trước 120s, ban đầu 60s) — guild MỚI/kick vẫn sync
      // TỨC THÌ qua sự kiện guildCreate/guildDelete (syncOne/markGone), vòng này
      // chỉ nhịp nền cho metadata; giảm thêm 33% calls nhóm này.
      setTimeout(runSyncLoop, 180_000);
    })();
  };
  setTimeout(() => {
    void (async () => {
      try {
        await guildSync.ensureModules(client, store);
      } catch (e) {
        console.error("[sync:ensure]", e.message);
      }
      runSyncLoop();
    })();
  }, 5_000);

  // Presence update — mỗi 60s (nhẹ: chỉ Discord cache, không gọi Convex)
  const presenceInterval = setInterval(() => {
    client.user.setPresence({
      activities: [
        { name: `${client.guilds.cache.size} server · /help`, type: ActivityType.Watching },
      ],
      status: "online",
    });
  }, 60_000);
  presenceInterval.unref();

  // Daily report — lịch đã chuyển sang cron Convex (đợt #4):
  // `convex/crons.ts` → reports:sweepDueDailyReports mỗi 30 phút đặt cờ
  // `reportRequestedAt`; tick gửi embed rồi xoá cờ. Giữ lượt chạy đầu sau 15s
  // như cũ để guild "còn nợ" báo cáo được gửi ngay khi bot online.
  const { runDailyReports } = require("./handlers/dailyReport");
  setTimeout(
    () => runDailyReports(client, store, heat).catch((e) => console.error("[report]", e.message)),
    15_000,
  );

  // Heat flush — mỗi 30s (batch 1 mutation/guild — rẻ mà heat cập nhật nhanh,
  // dashboard thấy "nhiệt độ" thành viên gần như realtime).
  const heatInterval = setInterval(
    () => heat.flushAll().catch((e) => console.error("[heat:flush]", e.message)),
    30_000,
  );
  heatInterval.unref();

  // Vòng quét TỔNG HỢP — mỗi 180s, 1 query batch (bot_tick:getPendingJobs) trả
  // { hidden, verifyPanels, backups, reports } cho mọi guild: panel reaction role,
  // giveaway, DM chờ, webhook log mặc định, panel xác minh, backup/restore/import,
  // báo cáo ngày (cờ cron). Thay 3 vòng quét riêng cũ (hidden 120s + verify 120s
  // + backup 60s) — tiết kiệm ~50% function calls nhóm này trên Convex free tier,
  // hidden/verify nhanh hơn. `heat` để vòng tick chèn bảng nhiệt vào báo cáo ngày.
  require("./tick").setupTick(client, store, heat);

  // Auto backup — lịch đã chuyển sang cron Convex (đợt #4): `convex/crons.ts` →
  // backup:sweepDueAutoBackups mỗi giờ đặt cờ `backupRequested`; bot chỉ thực
  // thi trong tick. Không còn vòng setInterval phía bot.

  // Threat Intel research — mỗi 4 giờ (6 lần/ngày), tải nguồn mở MIỄN PHÍ
  // (Reddit JSON API + CISA KEV) + AI tổng hợp tối đa 1 lần/tuần (~15k tokens/tháng).
  // Chỉ chạy khi chủ bot bật trên web Admin. Học từ khóa scam → dùng miễn phí vĩnh viễn.
  require("./research").setupResearch(client, store);

  // Threat Engine cục bộ — URLhaus feed (mỗi giờ), n-gram clustering (30 phút),
  // self-test regex, backfill raidSamples (1 lần). Toàn bộ chạy trên VPS: 0 token AI,
  // tận dụng CPU nhàn rỗi. URLhaus nạp vào filters chặn link malware mới.
  require("./threatEngine").setupThreatEngine(store);

  // Self-Diagnose — bắt unhandledRejection/uncaughtException toàn cục, gửi AI
  // (chuỗi research Kira/Mimo) chẩn đoán + đăng ĐỀ XUẤT vá vào kênh log. Chỉ
  // chạy khi owner bật trên Admin web (flag đi nhờ batch tick 60s sẵn có).
  // Flag cập nhật từng lượt tick qua setEnabledFromJobs (xem setupTick dưới).
  selfDiagnose.attach(client, store);

  // TỐI ƯU USAGE: KHÔNG còn vòng heartbeat 60s riêng (status:heartbeat) — nó
  // trùng 100% với guild sync loop 60s (đã gộp heartbeat vào botSyncGuilds qua
  // globalStatus). Vòng riêng cũ đốt ~43k function calls/tháng cho thông tin
  // y hệt. sendHeartbeat chỉ còn là FALLBACK khi sync loop lỗi liên tiếp.
  const heartbeatInterval = setInterval(() => {
    if (guildSync.isSyncHealthy()) return; // sync loop đang sống → không cần
    const memberCount = client.guilds.cache.reduce((a, g) => a + (g.memberCount ?? 0), 0);
    store.sendHeartbeat(client.guilds.cache.size, memberCount).catch(() => {});
  }, 5 * 60_000);
  heartbeatInterval.unref();

  // Memory monitoring — mỗi 30 phút (nhẹ nhàng) + khởi động memGuard sweeper
  // (Đợt 7: dọn các vùng bộ nhớ bị lỡ — heat nguội, guild đã rời, cache cũ).
  const stopMemGuard = startMemGuard(10 * 60_000);
  void stopMemGuard; // giữ tham chiếu — không dùng trong production
  const memMonitorInterval = setInterval(
    () => {
      const mem = process.memoryUsage();
      const rss = Math.round(mem.rss / 1024 / 1024);
      const heap = Math.round(mem.heapUsed / 1024 / 1024);
      if (rss > 500) console.warn(`[mem] RSS=${rss}MB, Heap=${heap}MB — cao bất thường!`);
    },
    30 * 60 * 1000,
  );
  memMonitorInterval.unref();

  // Observability (đợt #1) — bật SAU khi client đã sẵn sàng, cùng chỗ với các
  // vòng giám sát khác. `startMetrics` tự cắm: đo RAM/quy mô server, in
  // `/metrics` ra stdout mỗi 5 phút, đẩy snapshot lên Convex cho dashboard.
  // Tắt bằng biến môi trường `METRICS=0`.
  stopMetrics = startMetrics({ client, store });
});

// --- Global error handlers ---
// Self-Diagnose: khi bot online, các lỗi này cũng được gửi AI (chuỗi research
// Kira/Mimo) chẩn đoán + đăng đề xuất vá vào kênh log (chỉ khi owner bật).
// diagnoseError giữ nguyên console.error cũ — console vẫn in đủ để pm2 logs đọc.
const selfDiagnose = require("./handlers/selfDiagnose");
const UNCAUGHT_DIAGNOSIS_TIMEOUT_MS = 5_000;
process.on("unhandledRejection", (reason) => {
  selfDiagnose.diagnoseError("unhandledRejection", reason).catch(() => {});
});
process.on("uncaughtException", (err) => {
  const diagnosisTimeout = setTimeout(() => {
    console.error("[uncaughtException] chẩn đoán treo quá 5 giây — buộc restart");
    process.exit(1);
  }, UNCAUGHT_DIAGNOSIS_TIMEOUT_MS);
  selfDiagnose
    .diagnoseError("uncaughtException", err)
    .catch(() => {})
    .finally(() => {
      clearTimeout(diagnosisTimeout);
      process.exit(1);
    });
});

// --- Event handlers ---
client.on("messageCreate", (m) => {
  if (m.author?.bot) return;
  onMessageCreate(client, m, store, heat).catch((e) => console.error("[messageCreate]", e.message));
});
client.on("messageCreate", (m) => {
  if (m.author?.bot) return;
  require("./handlers/filters")(client, m, store, heat).catch((e) =>
    console.error("[filters]", e.message),
  );
});
// Đẩy lùi đồng hồ tự đóng ticket: có người chat trong kênh ticket thì ticket
// KHÔNG được tự đóng. Listener RIÊNG — dùng chung handler với filters sẽ khiến
// lỗi Convex ở đây nuốt luôn nhánh filters phía trên.
client.on("messageCreate", (m) => {
  if (m.author?.bot) return;
  require("./handlers/ticketActivity")
    .noteActivity(m, store)
    .catch((e) => console.error("[ticketActivity]", e.message));
});
client.on("interactionCreate", (i) =>
  onInteractionCreate(client, i, store, heat).catch((e) => {
    console.error("[interaction]", e?.message || e);
    try {
      if (
        !i.replied &&
        !i.deferred &&
        (i.isChatInputCommand() || i.isButton() || i.isStringSelectMenu())
      ) {
        i.reply({ content: "❌ Có lỗi xảy ra khi xử lý lệnh.", ephemeral: true }).catch(() => {});
      }
    } catch {}
  }),
);
client.on("guildMemberAdd", (m) => {
  joinGate(client, m, store).catch((e) => console.error("[joinGate]", e.message));
  require("./handlers/welcome").handleWelcome(client, store, m);
});
client.on("guildMemberRemove", (m) => {
  require("./handlers/welcome").handleGoodbye(client, store, m);
});
client.on("guildCreate", (guild) => {
  console.log(`[guildCreate] ${guild.name} (${guild.id}) — ${client.guilds.cache.size} server`);
  guildSync
    .syncOne(client, store, guild.id)
    .catch((e) => console.error(`[guildCreate:sync] ${guild.id}:`, e.message));
  // Đảm bảo server mới có đủ module antinuke mặc định (nếu botSyncGuilds bị lỗi).
  guildSync
    .ensureModules(client, store)
    .catch((e) => console.error(`[guildCreate:ensure] ${guild.id}:`, e.message));
});
client.on("guildDelete", (guild) => {
  console.log(`[guildDelete] ${guild.name ?? guild.id} — ${client.guilds.cache.size} server`);
  guildSync
    .markGone(client, store, guild.id)
    .catch((e) => console.error(`[guildDelete:sync] ${guild.id}:`, e.message));
});

// --- Voice Presence Tracking (weaker signal, NO fake IP) ---
// Discord does NOT expose individual user IPs via the API.
// Previous code used region:channelId as a pseudo-IP which caused MASSIVE
// false positives — ALL users in the same voice channel were flagged as
// "IP-linked" adding +30 risk score to innocent members.
//
// Replacement: track voice channel co-presence as a WEAK signal only.
// We only flag when the SAME user joins voice from a NEW guild join
// within a short window (not just co-presence).
const voicePresenceMap = new Map(); // guildId -> Map<channelId, Set<userId>>

client.on("voiceStateUpdate", (oldState, newState) => {
  if (!oldState.channelId && newState.channelId && newState.member) {
    const guildId = newState.guild.id;
    const channelId = newState.channelId;
    const userId = newState.member.id;

    void (async () => {
      try {
        const config = await store.getConfig(guildId);
        if (!config?.altDetectionEnabled) return;
        // Track presence for monitoring only — NO IP linking
        if (!voicePresenceMap.has(guildId)) voicePresenceMap.set(guildId, new Map());
        const guildMap = voicePresenceMap.get(guildId);
        if (!guildMap.has(channelId)) guildMap.set(channelId, new Set());
        guildMap.get(channelId).add(userId);
      } catch {}
    })();
  }
  // Remove user from presence when they leave voice
  if (oldState.channelId && !newState.channelId && oldState.member) {
    const guildId = oldState.guild.id;
    const channelId = oldState.channelId;
    const userId = oldState.member.id;
    const guildMap = voicePresenceMap.get(guildId);
    if (guildMap) {
      const chSet = guildMap.get(channelId);
      if (chSet) {
        chSet.delete(userId);
        if (chSet.size === 0) guildMap.delete(channelId);
      }
    }
  }
});

// --- Upgrade C: Periodic Auto-scan Members ---
const ALT_SCAN_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
const altScanInterval = setInterval(() => {
  void (async () => {
    for (const [, guild] of client.guilds.cache) {
      try {
        const config = await store.getConfig(guild.id);
        if (!config?.altDetectionEnabled) continue;
        // Ensure members are cached
        if (guild.memberCount > guild.members.cache.size) {
          await guild.members.fetch({ limit: 1000 }).catch(() => {});
        }
        // Bản async: nhường event loop giữa lúc quét + trần quy mô/deadline.
        // Bản sync chặn bot hàng chục giây trên server lớn — đúng lúc có raid
        // thì anti-nuke cũng đứng hình theo.
        const scan = await scanGuildForAltsAsync(guild, config);
        const links = scan.links;
        if (links.length > 0) {
          console.log(`[altScan] ${guild.name}: found ${links.length} potential alt pairs`);
          // Log the top 3 to console
          for (const link of links.slice(0, 3)) {
            console.log(
              `  - ${link.username1} <-> ${link.username2} (${link.similarity}% via ${link.reason})`,
            );
          }
        }
        if (scan.truncated) {
          // KHÔNG im lặng khi bỏ sót: chủ server cần biết quét chưa trọn.
          console.log(
            `[altScan] ${guild.name}: quét ${scan.scanned}/${scan.total} thành viên` +
              (scan.hitDeadline ? " (chạm deadline)" : " (chạm trần quy mô)") +
              " — cặp ngoài phạm vi phải đợi vòng sau",
          );
        }
      } catch (e) {
        console.error(`[altScan] ${guild.id}:`, e.message);
      }
    }
  })().catch(() => {});
}, ALT_SCAN_INTERVAL);
altScanInterval.unref();

// --- Login ---
client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error("❌ Không thể đăng nhập Discord:", err.message);
  process.exit(1);
});

// Graceful shutdown
// Dừng metrics TRƯỚC khi thoát: `stopMetrics()` đẩy nốt mẫu cuối lên Convex,
// nên deploy/restart không làm mất đúng số liệu của lúc tắt — mà lúc tắt
// thường là lúc đáng nhìn nhất (sau khi đã thấy độ trễ tăng).
function shutdown() {
  try {
    stopMetrics?.();
  } catch {
    // không để lỗi dọn dẹp chặn thoát
  }
  client.destroy();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
