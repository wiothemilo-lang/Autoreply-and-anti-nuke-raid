const { WebhookClient, EmbedBuilder } = require("discord.js");
const { escapeMentions } = require("./ticketCore");

/**
 * Webhook Hub — gửi log qua webhook MẶC ĐỊNH của bot (Protogon Log).
 *
 * Webhook mặc định do bot tự tạo khi chủ server set kênh log.
 * Webhook tùy chỉnh (discohook.org style) do người dùng gửi trực tiếp từ web
 * — không lưu trên Convex, không cần bot xử lý.
 */

const WEBHOOK_CACHE_TTL_MS = 5 * 60_000;
const webhookCache = new Map();
const inflight = new Map();
const defaultBackoff = new Map();

let client = null;
let store = null;

/** Nhóm hạng mục: webhook chọn "mod"/"general" nhận toàn bộ nhóm tương ứng. */
const MOD_EVENTS = new Set(["ban", "kick", "timeout", "warn", "purge", "unban", "untimeout"]);
const GENERAL_EVENTS = new Set(["antinuke", "raid", "join", "leave", "settings", "general"]);

/** Webhook có nhận sự kiện eventType không (khớp chính xác / nhóm / "all"). */
function webhookMatches(w, eventType) {
  const types = w.eventTypes || [];
  if (types.includes("all")) return true;
  if (types.includes(eventType)) return true;
  if (MOD_EVENTS.has(eventType) && types.includes("mod")) return true;
  if (GENERAL_EVENTS.has(eventType) && types.includes("general")) return true;
  return false;
}

/** Tải avatar từ URL → Buffer (discord.js cần buffer/base64). */
async function resolveAvatar(url) {
  if (!url || !/^https?:\/\//i.test(url)) return undefined;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return undefined;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 0 && buf.length <= 512 * 1024 ? buf : undefined;
  } catch {
    return undefined;
  }
}

function init(c, s) {
  client = c;
  store = s;
}

function invalidateCache(guildId) {
  webhookCache.delete(guildId);
  inflight.delete(guildId);
}

/** Thay placeholder trong nội dung kèm: {server} {time} {action} {reason} {user} {mod}. */
function fillTemplate(tpl, { guildName, action, reason, user, mod }) {
  if (!tpl) return "";
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const clean = (s) =>
    s
      ? String(s)
          .replace(/[\r\n]+/g, " ")
          .slice(0, 120)
      : "—";
  return tpl
    .replaceAll("{server}", guildName ?? "server")
    .replaceAll("{time}", time)
    .replaceAll("{action}", clean(action) || "log")
    .replaceAll("{reason}", clean(reason))
    .replaceAll("{user}", clean(user))
    .replaceAll("{mod}", clean(mod));
}

/** Tạo payload gửi qua webhook: nội dung kèm + embed (màu ghi đè nếu có). */
function buildPayload(whInfo, embed, meta = {}) {
  const payload = { embeds: [embed] };
  const content = fillTemplate(whInfo.contentTemplate, meta);
  if (content) payload.content = escapeMentions(content).slice(0, 1900);
  // ⚠️ Chặn ping ở đúng chỗ sinh ping. `content` là phần DUY NHẤT Discord
  // render thành mention — embed thì không ping ai dù có ghi `<@&id>`. Trước đây
  // `content` lấy thẳng từ `{reason}` (lý do do mod gõ) và chưa kèm
  // `allowed_mentions`, nên dán `<@everyone` vào lý do là ping cả server ở
  // kênh log.
  //
  // Không mất tính năng gì: `fillTemplate` chỉ có 6 placeholder
  // ({server} {time} {action} {reason} {user} {mod}) và không placeholder nào
  // cố tình ping. Chủ server muốn ping thì dùng webhook riêng, không dùng
  // khu vực log hình phạt.
  payload.allowed_mentions = { parse: [] };
  if (whInfo.color !== null && whInfo.color !== undefined) {
    payload.embeds = [new EmbedBuilder(embed.data).setColor(whInfo.color)];
  }
  return payload;
}

/**
 * Lấy danh sách webhook sẵn sàng của guild (cache 5 phút, 1 query/guild/lần).
 */
async function getForGuild(guildId) {
  const hit = webhookCache.get(guildId);
  if (hit && Date.now() - hit.fetchedAt < WEBHOOK_CACHE_TTL_MS) return hit.webhooks;
  if (inflight.has(guildId)) return inflight.get(guildId);
  const p = (async () => {
    try {
      const webhooks = await store.client.query("webhooks:botGetWebhooks", { guildId });
      webhookCache.set(guildId, { webhooks, fetchedAt: Date.now() });
      return webhooks;
    } catch (e) {
      console.error(`[webhook:list] ${guildId}:`, e.message);
      const old = webhookCache.get(guildId);
      return old ? old.webhooks : [];
    } finally {
      inflight.delete(guildId);
    }
  })();
  inflight.set(guildId, p);
  return p;
}

/**
 * Webhook mặc định khớp sự kiện — chỉ còn webhook MẶC ĐỊNH của bot (isDefault).
 */
async function matchFor(guildId, eventType) {
  if (!store) return [];
  const webhooks = await getForGuild(guildId);
  return webhooks.filter((w) => w.enabled !== false && w.isDefault && webhookMatches(w, eventType));
}

/**
 * Bot tự tạo/gỡ webhook MẶC ĐỊNH theo yêu cầu từ batch hidden (getBotHiddenJobs).
 */
async function reconcileDefaultWebhook(guild, req) {
  if (!client || !store || !guild || !req) return;
  const guildId = guild.id;
  try {
    if (req.kind === "create") {
      if (Date.now() < (defaultBackoff.get(guildId) || 0)) return;
      const channel = await guild.channels.fetch(req.channelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        defaultBackoff.set(guildId, Date.now() + 10 * 60_000);
        return;
      }
      const created = await channel.createWebhook({
        name: "Protogon Log",
        avatar: (await resolveAvatar(client.user?.displayAvatarURL({ size: 256 }))) || undefined,
      });
      await store.client.mutation("webhooks:botDefaultWebhookReady", {
        guildId,
        channelId: req.channelId,
        discordWebhookId: created.id,
        token: created.token,
      });
      defaultBackoff.delete(guildId);
      invalidateCache(guildId);
      console.log(`[webhook:default] ${guildId}: đã tự tạo "Protogon Log" tại #${channel.name}`);
    } else if (req.kind === "delete") {
      if (req.webhookId && req.token) {
        const wh = new WebhookClient({ id: req.webhookId, token: req.token });
        try {
          await wh.delete();
        } catch (e) {
          console.warn(`[webhook:default:delete] ${guildId}:`, e.message);
        } finally {
          wh.destroy();
        }
      }
      await store.client.mutation("webhooks:botDefaultWebhookDeleted", { guildId });
      defaultBackoff.delete(guildId);
      invalidateCache(guildId);
      console.log(`[webhook:default] ${guildId}: đã gỡ webhook log mặc định (kênh log đổi/bỏ)`);
    }
  } catch (e) {
    console.error(`[webhook:default] ${guildId}:`, e.message);
    if (req.kind === "create") defaultBackoff.set(guildId, Date.now() + 10 * 60_000);
  }
}

/** Gửi embed qua 1 webhook. Trả về true nếu Discord nhận. */
async function send(whInfo, embed, meta = {}) {
  const wh = new WebhookClient({ id: whInfo.webhookId, token: whInfo.token });
  try {
    const payload = buildPayload(whInfo, embed, meta);
    await wh.send(payload);
    return true;
  } finally {
    // Mỗi lượt log tạo một WebhookClient (một REST client riêng kèm timer
    // sweeper của @discordjs/rest). Không destroy thì chúng dồn theo số log →
    // rò bộ nhớ thật (đo ~30 MB sau ~20k lượt). Finally để lượt gửi LỖI cũng được dọn.
    wh.destroy();
  }
}

/**
 * Đảm bảo webhook MẶC ĐỊNH "Protogon Log" tồn tại cho guild + channelId.
 * Nếu đã có trong cache → trả về ngay. Nếu chưa có trên Discord → tạo mới.
 * Trả về object webhook info (phù hợp với matchFor/send) hoặc null nếu tạo thất bại.
 * Dùng trong util.js: khi gửi log mà chưa có webhook → gọi hàm này để tạo on-the-fly.
 */
async function ensureDefaultWebhook(guild, channelId) {
  if (!client || !store || !guild || !channelId) return null;
  const guildId = guild.id;

  // 1. Kiểm tra cache trước — webhook mặc định đã tạo rồi?
  const cached = await getForGuild(guildId);
  const existing = cached.find((w) => w.isDefault);
  if (existing) return existing;

  // 2. Kiểm tra trên Convex (có thể bot vừa nhận config mới chưa sync cache).
  try {
    const rows = await store.client.query("webhooks:botGetWebhooks", { guildId });
    const def = rows.find((w) => w.isDefault);
    if (def) {
      invalidateCache(guildId);
      return def;
    }
  } catch {
    // Bỏ qua — sẽ tạo mới bên dưới.
  }

  // 3. Chưa có → tạo webhook trên Discord.
  try {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      console.warn(
        `[webhook:ensure] ${guildId}: kênh #${channelId} không tồn tại hoặc không phải text`,
      );
      return null;
    }
    const created = await channel
      .createWebhook({
        name: "Protogon Log",
        avatar: (await resolveAvatar(client.user?.displayAvatarURL({ size: 256 }))) || undefined,
      })
      .catch((e) => {
        console.error(
          `[webhook:ensure] ${guildId}: không tạo được webhook — ${e.message} (kiểm tra quyền ManageWebhooks)`,
        );
        return null;
      });
    if (!created) return null;

    await store.client.mutation("webhooks:botDefaultWebhookReady", {
      guildId,
      channelId,
      discordWebhookId: created.id,
      token: created.token,
    });
    invalidateCache(guildId);
    console.log(`[webhook:ensure] ${guildId}: đã tự tạo "Protogon Log" tại #${channel.name}`);
    return {
      _id: "new",
      name: created.name,
      webhookId: created.id,
      token: created.token,
      channelId,
      color: null,
      contentTemplate: null,
      eventTypes: ["all"],
      isDefault: true,
    };
  } catch (e) {
    console.error(`[webhook:ensure] ${guildId}:`, e.message);
    return null;
  }
}

module.exports = {
  init,
  reconcileDefaultWebhook,
  ensureDefaultWebhook,
  matchFor,
  send,
  getForGuild,
  invalidateCache,
};
