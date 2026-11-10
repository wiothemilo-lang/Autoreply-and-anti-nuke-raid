require("../bot/src/loadenv").loadEnv();
const { ConvexHttpClient } = require("../bot/node_modules/convex/browser");

(async () => {
  const url = process.env.CONVEX_URL;
  if (!url) {
    console.log("NO CONVEX_URL");
    return;
  }
  const client = new ConvexHttpClient(url);
  if (process.env.CONVEX_DEPLOY_KEY) client.setAdminAuth(process.env.CONVEX_DEPLOY_KEY);
  // botKey (botAuth): chèn CHỈ KHI hàm chưa có botKey trong args — nếu không sẽ
  // đè lên giá trị args thật hoặc gửi thừa tham số làm hàm public từ chối.
  const botKey = process.env.BOT_KEY ? String(process.env.BOT_KEY).trim() : null;
  const withKey = (args) => {
    const payload = args && typeof args === "object" ? { ...args } : {};
    if (botKey && payload.botKey === undefined) payload.botKey = botKey;
    return payload;
  };
  const _q = client.query.bind(client);
  const _m = client.mutation.bind(client);
  client.query = (fn, args) => _q(fn, withKey(args));
  client.mutation = (fn, args) => _m(fn, withKey(args));

  const status = await client.query("status:botStatus");
  console.log(
    "botStatus:",
    JSON.stringify({
      online: status.online,
      guildCount: status.guildCount,
      memberCount: status.memberCount,
      lastHeartbeat: status.lastHeartbeat ? new Date(status.lastHeartbeat).toISOString() : null,
      secondsSinceHeartbeat: status.lastHeartbeat
        ? Math.round((Date.now() - status.lastHeartbeat) / 1000)
        : null,
    }),
  );

  const since = Date.now() - 14 * 24 * 3600 * 1000;
  const events = await client.query("reports:getDailyEvents", { since });
  const ext = events.filter((e) => e.module === "externalAppRaid");
  console.log(`\nAnti-nuke events (14 ngày): ${events.length} — externalAppRaid: ${ext.length}`);

  const byGuild = new Map();
  const modulesSeen = new Set();
  for (const e of events) {
    byGuild.set(e.guildId, (byGuild.get(e.guildId) ?? 0) + 1);
    modulesSeen.add(e.module);
  }
  console.log("modules gặp trong 14 ngày:", [...modulesSeen].join(", "));
  console.log("guildId → số sự kiện:", JSON.stringify(Object.fromEntries(byGuild)));

  if (ext.length > 0) {
    console.log("\nCác vụ externalAppRaid (14 ngày):");
    for (const e of ext.slice(0, 15)) {
      console.log(
        "-",
        new Date(e.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }),
        "| punish:",
        e.punish,
        "| count:",
        e.count,
        "| action:",
        String(e.action).slice(0, 120),
      );
    }
  }

  // AI có cấu hình không? (chỉ đọc cờ — KHÔNG gọi model, không lộ key)
  try {
    const ai = await client.action("haimiya:aiStatus", {});
    console.log("\nAI status:", JSON.stringify(ai));
  } catch (err) {
    console.log("\nAI check lỗi:", err.message);
  }
})().catch((err) => {
  console.log("ERROR:", err.message);
  process.exit(1);
});
