"use strict";
/**
 * welcome.js — Chào thành viên mới + tạm biệt thành viên rời server (v2).
 *
 * Nâng cấp học từ Carl-bot / Welcomer / ProBot — bộ tính năng tốt nhất thị trường:
 *   1. Template NGẪU NHIÊN: welcomeRandom/goodbyeRandom nhiều dòng (mỗi dòng 1
 *      câu) — bot chọn ngẫu nhiên mỗi lượt join/leave, đỡ nhàm chán.
 *   2. Welcome DM riêng: gửi tin chào qua DM thành viên mới (nội dung riêng).
 *   3. Embed tùy chỉnh sâu: tiêu đề, màu #hex, ảnh banner, thumbnail.
 *   4. Autorole: tự cấp role khi vào server, trễ 0-120s, tùy chọn cấp cả bot.
 *   5. Placeholder mở rộng: {user} {username} {server} {count} {created} {boost}.
 *   6. RAID-SAFE (đặc thù Protogon): server đang lockdown → bỏ qua chào/DM/autorole
 *      (không spam kênh log khi raid dồn dập, không cấp role cho tài khoản raid).
 *   7. THẺ ẢNH (v3): bot tự VẼ ảnh chào riêng cho từng thành viên (nền người dùng
 *      tải lên + avatar tròn + tên + số thành viên) qua ./welcomeCard — xem module
 *      đó để biết vì sao font phải nhúng trong repo. Vẽ lỗi/thiếu thư viện → gửi
 *      embed thường, TUYỆT ĐỐI không làm mất tin nhắn chào.
 *
 * An toàn giữ nguyên v1: mọi gửi best-effort (kênh bị xoá/thiếu quyền → bỏ qua
 * im lặng); goodbye bỏ qua bot; nội dung trống → dùng mặc định theo ngôn ngữ
 * server (lang.js); allowedMentions giới hạn cho {user} — nội dung tùy chỉnh
 * không thể ping @everyone.
 */

const { EmbedBuilder, AttachmentBuilder, Colors, PermissionFlagsBits } = require("discord.js");
const lang = require("./lang");
// Gọi qua MODULE (không destructure) để test CJS stub được `renderCard` mà
// không cần cài module native `@napi-rs/canvas`.
const cardMod = require("./welcomeCard");

/** Mặc định EN (tương thích cũ) — luồng thật dùng lang.*Default(serverLang) theo ngôn ngữ server. */
const WELCOME_DEFAULT = lang.welcomeDefault("en");
const GOODBYE_DEFAULT = lang.goodbyeDefault("en");

/** Trần placeholder phải bền vững: tuổi account 4 chữ số, boost nhỏ. */
function accountAgeDays(member) {
  const ts = member.user?.createdTimestamp;
  if (typeof ts !== "number" || !Number.isFinite(ts)) return 0;
  return Math.max(0, Math.floor((Date.now() - ts) / 86_400_000));
}

/** Trần ký tự nội dung gửi đi (Discord cho 2000; chừa chỗ cho phần bot tự thêm). */
const MAX_CONTENT = 1500;

/**
 * Số ngày thành viên ĐÃ Ở trong server.
 *
 * Vì sao cần: `{created}` là tuổi tài khoản, nhưng khi tạm biệt, thứ người ta
 * muốn nhắc là "cảm ơn bạn đã ở lại 2 năm" — không có biến nào để nói. Đây là
 * lý do phần lớn tin tạm biệt mặc định rất chung chung.
 *
 * `guildMemberRemove` đôi khi đưa vào một member partial (joinedTimestamp
 * mất) → trả 0. Thà 0 còn hơn nói sai, và tin nhắn vẫn gửi được.
 */
function memberDays(member) {
  const ts = member?.joinedTimestamp;
  if (typeof ts !== "number" || !Number.isFinite(ts)) return 0;
  return Math.max(0, Math.floor((Date.now() - ts) / 86_400_000));
}

/**
 * Cắt tới trần ký tự nhưng KHÔNG cắt vào giữa một mã Discord.
 * Nội dung v3 có thể chứa `<:ten:id>`, `<a:ten:id>`, `<@id>`, `<#id>` — cắt ngang
 * sẽ để lại rác như `<:wio:12345` hiện nguyên trong tin nhắn của thành viên.
 */
function sliceSafe(text, max = MAX_CONTENT) {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const open = head.lastIndexOf("<");
  if (open !== -1 && !head.slice(open).includes(">")) return head.slice(0, open);
  return head;
}

/** Thay placeholder mở rộng. {user} giữ nguyên dạng mention để allowedMentions hoạt động. */
function fillTemplate(template, { member, guild }) {
  return sliceSafe(
    template
      .replaceAll("{user}", `<@${member.id}>`)
      .replaceAll("{username}", member.user?.username ?? member.id)
      .replaceAll("{server}", guild.name)
      .replaceAll("{count}", String(guild.memberCount ?? 0))
      .replaceAll("{created}", String(accountAgeDays(member)))
      .replaceAll("{joined}", String(memberDays(member)))
      .replaceAll("{boost}", String(guild.premiumSubscriptionCount ?? 0)),
  );
}

/** Chọn template ngẫu nhiên: config nhiều dòng (mỗi dòng 1 câu) → random 1 dòng. */
function pickTemplate(configured, fallback) {
  const lines = String(configured || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return fallback;
  return lines[Math.floor(Math.random() * lines.length)];
}

/**
 * Màu embed: config #hex (validate phía Convex) → parse; rác → màu mặc định.
 * Trả number cho EmbedBuilder.setColor.
 */
function embedColor(configured, fallback) {
  if (typeof configured === "number" && Number.isFinite(configured)) return configured;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(configured || "").trim());
  if (m) return parseInt(m[1], 16);
  // Cho phép #abc (3 ký tự) → mở rộng thành aabbcc.
  const m3 = /^#?([0-9a-fA-F]{3})$/.exec(String(configured || "").trim());
  if (m3)
    return parseInt(
      m3[1]
        .split("")
        .map((c) => c + c)
        .join(""),
      16,
    );
  return fallback;
}

/** URL hợp lệ cho embed (http/https) — rác → bỏ qua (không gửi embed lỗi). */
function safeUrl(v) {
  const s = String(v || "").trim();
  return /^https?:\/\/\S+$/.test(s) ? s : undefined;
}

/**
 * Xây payload (content + embed tùy chọn) từ config v2.
 * Config UseEmbed=false → tin nhắn thường (như v1, vẫn nhận title/color nếu
 * dashboard bật embed riêng — giữ hành vi cũ khi owner chưa đụng cài đặt mới).
 */
function buildPayload(kind, config, ctx, card = null) {
  const isWelcome = kind === "welcome";
  const serverLang = lang.langForGuild(ctx.guild);
  const randomCfg = isWelcome ? config.welcomeRandom : config.goodbyeRandom;
  const plainCfg = String((isWelcome ? config.welcomeMessage : config.goodbyeMessage) || "").trim();
  // Chuỗi fallback phải khớp CHÍNH XÁC thứ tự panel hiển thị ở "Xem trước trực tiếp":
  //   câu ngẫu nhiên → nội dung gốc → mặc định theo ngôn ngữ server.
  // Bản cũ truyền thẳng mặc định ngôn ngữ làm fallback, nên "template ngẫu nhiên"
  // toàn dòng trống (hoặc chỉ khoảng trắng) khiến bot gửi câu mặc định và BỎ QUA
  // nội dung gốc người dùng đã cấu hình — preview trên web lại hiện nội dung gốc.
  const rawTemplate = pickTemplate(
    randomCfg,
    plainCfg || (isWelcome ? lang.welcomeDefault(serverLang) : lang.goodbyeDefault(serverLang)),
  );
  const content = fillTemplate(rawTemplate, ctx);
  const useEmbed = isWelcome ? config.welcomeUseEmbed : config.goodbyeUseEmbed;

  const payload = { allowedMentions: { users: [ctx.member.id], parse: [] } };
  if (!useEmbed) {
    payload.content = content;
    return payload;
  }

  const embed = new EmbedBuilder()
    .setColor(
      embedColor(
        isWelcome ? config.welcomeEmbedColor : config.goodbyeEmbedColor,
        isWelcome ? Colors.Green : Colors.Grey,
      ),
    )
    .setTimestamp();
  const title = (isWelcome ? config.welcomeEmbedTitle : config.goodbyeEmbedTitle)?.trim();
  if (title) embed.setTitle(fillTemplate(title, ctx).slice(0, 256));
  embed.setDescription(content);
  // Thẻ PNG (nếu vẽ được) THẮNG ảnh banner tĩnh: đây là "ảnh chào" riêng của
  // từng thành viên, gửi kèm dưới dạng attachment rồi embed trỏ vào attachment đó.
  // Gửi ảnh local nên phải dùng `attachment://<tên>` — dán URL kiểu file:// không chạy.
  if (card) {
    payload.files = [new AttachmentBuilder(card, { name: cardMod.CARD_FILE_NAME })];
    embed.setImage(`attachment://${cardMod.CARD_FILE_NAME}`);
  } else {
    const image = safeUrl(isWelcome ? config.welcomeEmbedImage : config.goodbyeEmbedImage);
    if (image) embed.setImage(image);
  }
  const thumb = safeUrl(isWelcome ? config.welcomeEmbedThumbnail : config.goodbyeEmbedThumbnail);
  if (thumb) embed.setThumbnail(thumb);

  // Mention member: giữ hành vi v1 embed mode — mention trong content + mô tả trong embed.
  payload.content = `<@${ctx.member.id}>`;
  payload.embeds = [embed];
  return payload;
}

/**
 * Vẽ thẻ PNG nếu server bật thẻ. Trả Buffer hoặc null.
 * Chỉ áp dụng ở chế độ EMBED (ảnh cần embed mới hiển thị được); nếu người dùng
 * tắt embed thì thẻ không có chỗ hiển thị nên bỏ qua, không gửi file lơ lửng.
 */
async function buildCard(config, kind, member, guild) {
  const cardEnabled = kind === "welcome" ? config.welcomeCardEnabled : config.goodbyeCardEnabled;
  const useEmbed = kind === "welcome" ? config.welcomeUseEmbed : config.goodbyeUseEmbed;
  if (!cardEnabled || !useEmbed) return null;
  if (!cardMod.cardAvailable()) return null;
  const labels = lang.cardLabels(lang.langForGuild(guild));
  const count = guild.memberCount ?? 0;
  const avatarUrl =
    typeof member.displayAvatarURL === "function"
      ? member.displayAvatarURL({ size: 256, extension: "png" })
      : null;
  return cardMod
    .renderCard({
      eyebrow: kind === "welcome" ? labels.welcome : labels.goodbye,
      name: member.displayName ?? member.user?.username ?? member.id,
      meta: `${guild.name} · ${labels.member.replaceAll("{count}", String(count))}`,
      avatarUrl,
      backgroundUrl:
        kind === "welcome" ? config.welcomeCardBackground : config.goodbyeCardBackground,
      accent: kind === "welcome" ? config.welcomeEmbedColor : config.goodbyeEmbedColor,
    })
    .catch(() => null);
}

/**
 * Báo lỗi cấu hình chào/tạm biệt — NHƯNG có chống spam.
 *
 * Vì sao phải có: trước đây kênh bị xoá / bot mất quyền / gửi lỗi đều
 * `return false` trong im lặng. Chủ server bật welcome, cấu hình xong, không
 * thấy tin nào hiện ra và cũng không có cách nào biết vì sao — đúng loại lỗi
 * âm thầm mà phần còn lại của bot cố tránh.
 *
 * Dedupe 10 phút/khách: server join đông sẽ không in 200 dòng cùng một lỗi,
 * nhưng chủ vẫn thấy dòng đầu tiên nói rõ nguyên nhân.
 */
const _warnedAt = new Map();
function reportGreetingProblem(kind, guild, reason) {
  const key = `${kind}:${guild?.id}:${reason}`;
  const now = Date.now();
  if (now - (_warnedAt.get(key) ?? 0) < 10 * 60_000) return false;
  _warnedAt.set(key, now);
  console.error(`[${kind}] ${guild?.name ?? guild?.id ?? "?"}: ${reason}`);
  return true;
}

/**
 * Gửi welcome/goodbye vào kênh cấu hình. Trả true khi gửi thành công.
 * RAID-SAFE: lockdown đang hoạt động (guild.lockdownUntil > now) → bỏ qua.
 */
async function sendGreeting(client, config, kind, member, guild) {
  const enabled = kind === "welcome" ? config.welcomeEnabled : config.goodbyeEnabled;
  if (!enabled) return false;
  const channelId = kind === "welcome" ? config.welcomeChannelId : config.goodbyeChannelId;
  // Chủ chưa chọn kênh thì im lặng là ĐÚNG — đó là lựa chọn của họ, không phải lỗi.
  if (!channelId) return false;
  // Lockdown = đang bị raid → im lặng (config gửi chào sẽ trở thành noise + rò role).
  if ((config.lockdownUntil ?? 0) > Date.now()) return false;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) {
    reportGreetingProblem(
      kind,
      guild,
      `không gửi được — kênh <#${channelId}> đã bị xoá hoặc bot không còn quyền xem nó. Chọn lại kênh trong dashboard.`,
    );
    return false;
  }
  // Thiếu quyền gửi → báo RÕ (dedupe 10 phút) thay vì im lặng.
  // Optional chaining đầy đủ: guild.members có thể undefined (guild partial).
  const perms = guild.members?.me?.permissionsIn?.(channel);
  if (perms && !perms.has(PermissionFlagsBits.SendMessages)) {
    reportGreetingProblem(
      kind,
      guild,
      `thiếu quyền Send Messages trong #${channel.name ?? channelId} — cấp quyền cho bot rồi thử lại.`,
    );
    return false;
  }

  // RAID-SAFE + "không được làm chết tính năng": mọi lỗi vẽ thẻ trả null →
  // gửi embed thường, tin nhắn chào vẫn tới kênh.
  const card = await buildCard(config, kind, member, guild);
  const payload = buildPayload(kind, config, { member, guild }, card);
  const sent = await channel
    .send(payload)
    .then(() => true)
    .catch(() => false);
  if (!sent) {
    reportGreetingProblem(kind, guild, `gửi tin thất bại trong #${channel.name ?? channelId}.`);
  }
  return sent;
}

/** Welcome DM: tin nhắn riêng qua DM thành viên mới (best-effort — user tắt DM là bỏ qua).
 * RAID-SAFE: lockdown đang hoạt động → bỏ qua (không DM hàng loạt tài khoản raid). */
async function sendWelcomeDm(config, member) {
  if (!config.welcomeDmEnabled || member.user?.bot) return false;
  if ((config.lockdownUntil ?? 0) > Date.now()) return false;
  const raw = pickTemplate(
    config.welcomeDmMessage,
    lang.welcomeDefault(lang.langForGuild(member.guild)),
  );
  const content = fillTemplate(raw, { member, guild: member.guild });
  return member
    .send({ content, allowedMentions: { users: [member.id], parse: [] } })
    .then(() => true)
    .catch(() => false);
}

/**
 * Autorole: cấp role cấu hình cho thành viên mới sau autoroleDelaySec giây.
 * Bot chỉ được cấp khi autoroleIncludeBots=true; role có thể biến mất → catch im lặng.
 * RAID-SAFE: lockdown → bỏ qua (không cấp role cho tài khoản raid dồn dập).
 */
function applyAutorole(config, member) {
  if (!config.autoroleEnabled) return;
  if ((config.lockdownUntil ?? 0) > Date.now()) return;
  if (member.user?.bot && !config.autoroleIncludeBots) return;
  const roleId = config.autoroleRoleId;
  if (!roleId || !/^\d{15,20}$/.test(String(roleId))) return;
  const delaySec = Math.max(0, Math.min(120, Math.floor(config.autoroleDelaySec ?? 0)));
  setTimeout(() => {
    member.roles.add(roleId, "Protogon autorole").catch(() => {}); // role bị xoá/bot mất quyền → bỏ qua im lặng
  }, delaySec * 1000);
}

/** guildMemberAdd — chào thành viên mới (bỏ qua bot cho welcome channel + DM). */
async function handleWelcome(client, store, member) {
  try {
    if (!member?.guild) return;
    const config = await store.getConfig(member.guild.id);
    if (!config) return;
    // Autorole áp dụng cho CẢ bot (nếu bật include) — chạy trước nhánh bỏ qua bot.
    applyAutorole(config, member);
    if (member.user?.bot) return;
    await sendGreeting(client, config, "welcome", member, member.guild);
    await sendWelcomeDm(config, member);
  } catch (e) {
    console.error("[welcome]", e.message);
  }
}

/** guildMemberRemove — tạm biệt thành viên rời (bỏ qua bot). */
async function handleGoodbye(client, store, member) {
  try {
    if (!member?.guild || member.user?.bot) return;
    const config = await store.getConfig(member.guild.id);
    if (!config) return;
    await sendGreeting(client, config, "goodbye", member, member.guild);
  } catch (e) {
    console.error("[goodbye]", e.message);
  }
}

/** Test hooks (convention _…ForTest): dùng để so khớp template trong test. */
module.exports = {
  handleWelcome,
  handleGoodbye,
  WELCOME_DEFAULT,
  GOODBYE_DEFAULT,
  _fillTemplateForTest: fillTemplate,
  _sliceSafeForTest: sliceSafe,
  _pickTemplateForTest: pickTemplate,
  _embedColorForTest: embedColor,
  _safeUrlForTest: safeUrl,
  _buildPayloadForTest: buildPayload,
  _buildCardForTest: buildCard,
  _memberDaysForTest: memberDays,
  _reportGreetingProblemForTest: reportGreetingProblem,
  _resetGreetingProblemCacheForTest: () => _warnedAt.clear(),
};
