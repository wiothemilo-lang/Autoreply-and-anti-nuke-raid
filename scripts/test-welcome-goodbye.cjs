// Test welcome.js — chào/tạm biệt thành viên:
//   - fillTemplate: {user} {username} {server} {count} {created} {boost} thay đúng + cắt 1500 ký tự
//   - handleWelcome/handleGoodbye: bỏ qua bot; tắt enabled → không gửi; thiếu kênh → không gửi
//   - payload: allowedMentions chỉ phép mention member (không @everyone từ nội dung)
//   - embed mode: content mention + embed description; plain mode: content trực tiếp
//   - kênh fetch lỗi / thiếu quyền gửi → bỏ qua im lặng (không crash, không gửi)
//   - nội dung trống → dùng mặc định theo ngôn ngữ server (locale quốc gia)
//   - v2: template ngẫu nhiên nhiều dòng, embed tùy chỉnh (màu/ảnh/thumbnail),
//     welcome DM riêng, autorole (trễ/include bot/role rác), RAID-SAFE lockdown → im lặng
// Không mạng, không Discord thật. Chạy: node scripts/test-welcome-goodbye.cjs

const path = require("path");
const Module = require("module");
const fs = require("fs");

let sent = [];
let fetchFail = false;
let noPerms = false;
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "discord.js") {
    return path.join(__dirname, "_djs-welcome-mock.cjs");
  }
  return origResolve.call(this, request, ...args);
};
fs.writeFileSync(
  path.join(__dirname, "_djs-welcome-mock.cjs"),
  `module.exports = {
  Colors: { Green: 0x57f287, Grey: 0x99aab5 },
  PermissionFlagsBits: { SendMessages: 1 },
  AttachmentBuilder: class {
    constructor(data, opts) { this.attachment = data; this.name = opts?.name; }
  },
  EmbedBuilder: class {
    setColor(c) { this.__color = c; return this; }
    setDescription(d) { this.__desc = d; return this; }
    setTitle(t) { this.__title = t; return this; }
    setImage(u) { this.__image = u; return this; }
    setThumbnail(u) { this.__thumb = u; return this; }
    setTimestamp() { return this; }
  },
};`,
);
process.on("exit", () => {
  try {
    fs.unlinkSync(path.join(__dirname, "_djs-welcome-mock.cjs"));
  } catch {}
});
const welcome = require("../bot/src/handlers/welcome");
const {
  handleWelcome,
  handleGoodbye,
  WELCOME_DEFAULT,
  GOODBYE_DEFAULT,
  _fillTemplateForTest,
  _memberDaysForTest,
  _resetGreetingProblemCacheForTest,
} = welcome;
const lang = require("../bot/src/handlers/lang");

let pass = 0,
  fail = 0;
function check(label, cond) {
  if (cond) {
    pass++;
    console.log("PASS", label);
  } else {
    fail++;
    console.log("FAIL", label);
  }
}

function makeGuild() {
  // guild.members.me.permissionsIn(channel) — mock để noPerms case hoạt động đúng.
  return {
    id: "g1",
    name: "Test Server",
    memberCount: 42,
    members: { me: { permissionsIn: () => ({ has: () => !noPerms }) } },
  };
}
function makeClient() {
  sent = [];
  return {
    channels: {
      fetch: async (id) => {
        if (fetchFail) throw new Error("kênh biến mất");
        if (noPerms)
          return {
            isTextBased: () => true,
            send: async () => {
              sent.push({});
              return {};
            },
          };
        return {
          id,
          isTextBased: () => true,
          send: async (payload) => {
            sent.push(payload);
            return {};
          },
        };
      },
    },
  };
}
function makeStore(cfg) {
  return { getConfig: async () => ({ emergencyAlertEnabled: true, ...cfg }) };
}
const guild = makeGuild();
// member.guild luôn tồn tại trên Discord thật (guildMemberAdd/Remove event) — fixture bám đúng đó.
const member = { id: "u1", user: { bot: false, username: "user1" }, guild };
const botMember = { id: "b1", user: { bot: true, username: "botbot" }, guild };

(async () => {
  // ── fillTemplate ──
  const filled = _fillTemplateForTest(
    "Chào {user} ({username}) đến {server} — thành viên #{count}",
    { member, guild, isGoodbye: false },
  );
  check("template: {user} → mention", filled.includes("<@u1>"));
  check("template: {username}", filled.includes("user1"));
  check("template: {server}", filled.includes("Test Server"));
  check("template: {count}", filled.includes("42"));

  const long = _fillTemplateForTest("x".repeat(2000), { member, guild, isGoodbye: false });
  check("template: cắt tối đa 1500 ký tự", long.length <= 1500);

  // ── {joined}: số ngày đã ở server (biến thiếu cho tin tạm biệt) ──
  {
    const joined30 = {
      ...member,
      joinedTimestamp: Date.now() - 30 * 86_400_000,
      user: { ...member.user, createdTimestamp: Date.now() - 400 * 86_400_000 },
    };
    const t = _fillTemplateForTest("{user} ở đây {joined} ngày", { member: joined30, guild });
    check("template: {joined} → số ngày đã ở server", t === "<@u1> ở đây 30 ngày", t);
    // Member partial (joinedTimestamp mất) → 0 chứ không phải "NaN".
    check("template: {joined} thiếu dữ liệu → 0", _memberDaysForTest({ id: "x" }) === 0);
    check(
      "template: {joined} tương lai (clock lệch) → không âm",
      _memberDaysForTest({ joinedTimestamp: Date.now() + 86_400_000 }) === 0,
    );
  }

  // ── welcome cơ bản ──
  sent = [];
  fetchFail = false;
  noPerms = false;
  await handleWelcome(
    makeClient(),
    makeStore({ welcomeEnabled: true, welcomeChannelId: "c1", welcomeMessage: "Hi {user}!" }),
    member,
  );
  check("welcome: gửi đúng 1 tin", sent.length === 1);
  check("welcome: plain mode — content trực tiếp", sent[0]?.content === "Hi <@u1>!");
  check(
    "welcome: allowedMentions chỉ member (không @everyone từ nội dung)",
    JSON.stringify(sent[0]?.allowedMentions) === JSON.stringify({ users: ["u1"], parse: [] }),
  );

  // ── embed mode ──
  sent = [];
  await handleWelcome(
    makeClient(),
    makeStore({
      welcomeEnabled: true,
      welcomeChannelId: "c1",
      welcomeMessage: "Hi {user}!",
      welcomeUseEmbed: true,
    }),
    member,
  );
  check(
    "welcome: embed mode — mention trong content + mô tả trong embed",
    sent[0]?.content === "<@u1>" && sent[0]?.embeds?.[0]?.__desc === "Hi <@u1>!",
  );

  // ── goodbye ──
  sent = [];
  await handleGoodbye(
    makeClient(),
    makeStore({ goodbyeEnabled: true, goodbyeChannelId: "c2", goodbyeMessage: "" }),
    member,
  );
  // Guild mock không có preferredLocale → mặc định sản phẩm VI (quy ước lang.js).
  check(
    "goodbye: nội dung trống → mặc định theo ngôn ngữ server (VI)",
    sent[0]?.content ===
      lang.goodbyeDefault("vi").replaceAll("{user}", "<@u1>").replaceAll("{server}", "Test Server"),
  );

  // ── auto ngôn ngữ theo quốc gia (guild.preferredLocale) ──
  const memberEn = { ...member, guild: { ...guild, preferredLocale: "en-US" } };
  sent = [];
  await handleWelcome(
    makeClient(),
    makeStore({ welcomeEnabled: true, welcomeChannelId: "c1", welcomeMessage: "" }),
    memberEn,
  );
  check(
    "welcome: locale en-US → mặc định EN",
    sent[0]?.content ===
      WELCOME_DEFAULT.replaceAll("{user}", "<@u1>")
        .replaceAll("{server}", "Test Server")
        .replaceAll("{count}", "42"),
  );
  sent = [];
  await handleGoodbye(
    makeClient(),
    makeStore({ goodbyeEnabled: true, goodbyeChannelId: "c2", goodbyeMessage: "" }),
    memberEn,
  );
  check(
    "goodbye: locale en-US → mặc định EN",
    sent[0]?.content ===
      GOODBYE_DEFAULT.replaceAll("{user}", "<@u1>").replaceAll("{server}", "Test Server"),
  );
  const memberJa = { ...member, guild: { ...guild, preferredLocale: "ja" } };
  sent = [];
  await handleWelcome(
    makeClient(),
    makeStore({ welcomeEnabled: true, welcomeChannelId: "c1", welcomeMessage: "" }),
    memberJa,
  );
  check("welcome: quốc gia không hỗ trợ (ja) → EN mặc định", sent[0]?.content.includes("Welcome"));
  // Nội dung tùy chỉnh luôn thắng mặc định bất kể ngôn ngữ server.
  sent = [];
  await handleWelcome(
    makeClient(),
    makeStore({ welcomeEnabled: true, welcomeChannelId: "c1", welcomeMessage: "Custom {user}" }),
    memberJa,
  );
  check("welcome: nội dung tùy chỉnh ưu tiên hơn mặc định", sent[0]?.content === "Custom <@u1>");

  // ── bỏ qua bot ──
  sent = [];
  await handleWelcome(
    makeClient(),
    makeStore({ welcomeEnabled: true, welcomeChannelId: "c1" }),
    botMember,
  );
  await handleGoodbye(
    makeClient(),
    makeStore({ goodbyeEnabled: true, goodbyeChannelId: "c2" }),
    botMember,
  );
  check("bot join/leave → không chào không tạm biệt", sent.length === 0);

  // ── tắt enabled ──
  sent = [];
  await handleWelcome(
    makeClient(),
    makeStore({ welcomeEnabled: false, welcomeChannelId: "c1" }),
    member,
  );
  check("welcomeEnabled=false → không gửi", sent.length === 0);

  // ── thiếu kênh ──
  sent = [];
  await handleWelcome(makeClient(), makeStore({ welcomeEnabled: true }), member);
  check("bật nhưng chưa chọn kênh → không gửi (không crash)", sent.length === 0);

  // ── kênh fetch lỗi ──
  sent = [];
  fetchFail = true;
  await handleWelcome(
    makeClient(),
    makeStore({ welcomeEnabled: true, welcomeChannelId: "cX" }),
    member,
  );
  check("kênh bị xoá → bỏ qua im lặng, không crash", sent.length === 0);

  // ── thiếu quyền gửi ──
  sent = [];
  fetchFail = false;
  noPerms = true;
  await handleWelcome(
    makeClient(),
    makeStore({ welcomeEnabled: true, welcomeChannelId: "c1" }),
    member,
  );
  check("bot thiếu quyền gửi trong kênh → bỏ qua", sent.length === 0);

  // ── CHẤM DỨT IM LẶNG: lỗi cấu hình phải nói ra lý do ──
  // Trước đây hai case trên chỉ "bỏ qua" — chủ server bật welcome, cấu hình xong,
  // không thấy gì hiện ra và không có cách nào biết vì sao. Đây là lỗi âm thầm.
  {
    _resetGreetingProblemCacheForTest();
    const realErr = console.error;
    const logs = [];
    console.error = (...a) => logs.push(a.join(" "));
    try {
      // (a) kênh bị xoá
      fetchFail = true;
      await handleWelcome(
        makeClient(),
        makeStore({ welcomeEnabled: true, welcomeChannelId: "cX" }),
        member,
      );
      // (b) thiếu quyền
      fetchFail = false;
      noPerms = true;
      await handleWelcome(
        makeClient(),
        makeStore({ welcomeEnabled: true, welcomeChannelId: "c1" }),
        member,
      );
      noPerms = false;
    } finally {
      console.error = realErr;
    }
    check(
      "lỗi cấu hình: kênh bị xoá → log nói rõ nguyên nhân + cách sửa",
      logs.some((l) => l.includes("[welcome]") && /đã bị xoá/.test(l) && /dashboard/.test(l)),
      JSON.stringify(logs),
    );
    check(
      "lỗi cấu hình: thiếu Send Messages → log nói rõ cần cấp quyền",
      logs.some((l) => /Send Messages/.test(l)),
      JSON.stringify(logs),
    );

    // Dedupe: 20 lượt join liên tiếp cùng một lỗi → chỉ 1 dòng log, không spam.
    _resetGreetingProblemCacheForTest();
    const logs2 = [];
    console.error = (...a) => logs2.push(a.join(" "));
    try {
      noPerms = true;
      for (let i = 0; i < 20; i++) {
        await handleWelcome(
          makeClient(),
          makeStore({ welcomeEnabled: true, welcomeChannelId: "c1" }),
          member,
        );
      }
      noPerms = false;
    } finally {
      console.error = realErr;
    }
    check(
      "lỗi cấu hình: 20 lượt join → chỉ 1 dòng log (chống spam)",
      logs2.length === 1,
      `lines=${logs2.length}`,
    );
  }

  // ── chưa chọn kênh thì KHÔNG log (đó là lựa chọn của chủ, không phải lỗi) ──
  {
    _resetGreetingProblemCacheForTest();
    const realErr = console.error;
    const logs = [];
    console.error = (...a) => logs.push(a.join(" "));
    try {
      sent = [];
      await handleWelcome(makeClient(), makeStore({ welcomeEnabled: true }), member);
    } finally {
      console.error = realErr;
    }
    check(
      "chưa chọn kênh → im lặng, KHÔNG log lỗi",
      sent.length === 0 && logs.length === 0,
      JSON.stringify(logs),
    );
  }

  // ══ Welcome/Goodbye v2 (học Carl-bot/Welcomer/ProBot) ══
  noPerms = false; // khôi phục sau case thiếu quyền ở trên
  const { _pickTemplateForTest, _embedColorForTest, _buildPayloadForTest } = welcome;
  const pick = _pickTemplateForTest;

  // ── template ngẫu nhiên: mỗi dòng 1 câu, bot chọn 1 trong số đó ──
  const tpl3 = "Câu một\nCâu hai\nCâu ba";
  const picks = new Set();
  for (let i = 0; i < 200; i++) picks.add(pick(tpl3, "fallback"));
  check(
    "random: chọn từ đúng 3 dòng",
    picks.size === 3 && [...picks].every((s) => ["Câu một", "Câu hai", "Câu ba"].includes(s)),
  );
  check("random: config rỗng → fallback", pick("\n \n", "fallback") === "fallback");
  check("random: 1 dòng → luôn dòng đó", pick("Chỉ một", "x") === "Chỉ một");

  // ── embedColor: parse #hex 6/3, rác → fallback ──
  check("color: #57f287 → 5757287? parse đúng", _embedColorForTest("#57f287", 0) === 0x57f287);
  check("color: #abc → 0xaabbcc", _embedColorForTest("#abc", 0) === 0xaabbcc);
  check("color: rác → fallback", _embedColorForTest("tôi là màu", 0x123456) === 0x123456);
  check("color: number hợp lệ giữ nguyên", _embedColorForTest(42, 0) === 42);

  // ── safeUrl qua buildPayload: URL rác không nhét vào embed ──
  const guildV2 = { ...guild, premiumSubscriptionCount: 7 };
  const memberV2 = {
    id: "u1",
    user: { bot: false, username: "user1", createdTimestamp: Date.now() - 365 * 86_400_000 },
    guild: guildV2,
  };
  const payloadV2 = _buildPayloadForTest(
    "welcome",
    {
      welcomeUseEmbed: true,
      welcomeEmbedTitle: "🎉 {username}",
      welcomeEmbedColor: "#57f287",
      welcomeEmbedImage: "not-a-url",
      welcomeEmbedThumbnail: "https://example.com/a.png",
      welcomeRandom: "Chào {user}! Tuổi account {created} ngày, server có {boost} boost",
    },
    { member: memberV2, guild: guildV2 },
  );
  const emb = payloadV2.embeds?.[0];
  check("v2 embed: màu #hex parse thành số", emb?.__color === 0x57f287);
  check("v2 embed: title fill placeholder + cắt 256", emb?.__title === "🎉 user1");
  check("v2 embed: URL rác → không setImage", emb?.__image === undefined);
  check("v2 embed: URL hợp lệ → setThumbnail", emb?.__thumb === "https://example.com/a.png");
  check(
    "v2 embed: {created}/{boost} thay đúng",
    emb?.__desc?.includes("365") && emb?.__desc?.includes("7"),
  );
  check("v2 embed: content là mention member", payloadV2.content === "<@u1>");

  // ── welcome DM ──
  let dms = [];
  const clientDm = { channels: makeClient().channels };
  const memberDm = {
    ...memberV2,
    send: async (p) => {
      dms.push(p);
      return {};
    },
  };
  sent = [];
  await handleWelcome(
    clientDm,
    makeStore({
      welcomeEnabled: true,
      welcomeChannelId: "c1",
      welcomeDmEnabled: true,
      welcomeDmMessage: "DM chào {username}!",
    }),
    memberDm,
  );
  check("v2 DM: gửi 1 tin vào kênh + 1 tin DM", sent.length === 1 && dms.length === 1);
  check("v2 DM: nội dung fill placeholder", dms[0]?.content === "DM chào user1!");
  check(
    "v2 DM: allowedMentions giới hạn member",
    JSON.stringify(dms[0]?.allowedMentions) === JSON.stringify({ users: ["u1"], parse: [] }),
  );

  // DM tắt → không gửi DM
  dms = [];
  await handleWelcome(
    clientDm,
    makeStore({ welcomeEnabled: true, welcomeChannelId: "c1", welcomeDmEnabled: false }),
    memberDm,
  );
  check("v2 DM: tắt welcomeDmEnabled → không DM", dms.length === 0);

  // Bot không nhận DM
  dms = [];
  await handleWelcome(clientDm, makeStore({ welcomeDmEnabled: true, welcomeDmMessage: "hi" }), {
    ...botMember,
    send: async (p) => dms.push(p),
  });
  check("v2 DM: bot join → không DM", dms.length === 0);

  // ── autorole ──
  let roleAdds = [];
  const memberRole = {
    ...memberV2,
    roles: { add: async (id, reason) => roleAdds.push({ id, reason }) },
  };
  await handleWelcome(
    makeClient(),
    makeStore({ autoroleEnabled: true, autoroleRoleId: "111111111111111111", autoroleDelaySec: 0 }),
    memberRole,
  );
  await new Promise((r) => setTimeout(r, 20));
  check(
    "v2 autorole: cấp role ngay (trễ 0)",
    roleAdds.length === 1 && roleAdds[0].id === "111111111111111111",
  );
  check("v2 autorole: kèm lý do Protogon autorole", roleAdds[0]?.reason === "Protogon autorole");

  // Bot không nhận autorole trừ khi bật include
  roleAdds = [];
  const botRole = { ...botMember, roles: { add: async (id) => roleAdds.push(id) }, guild };
  await handleWelcome(
    makeClient(),
    makeStore({ autoroleEnabled: true, autoroleRoleId: "111111111111111111", autoroleDelaySec: 0 }),
    botRole,
  );
  await new Promise((r) => setTimeout(r, 20));
  check("v2 autorole: bot → không cấp role", roleAdds.length === 0);

  roleAdds = [];
  await handleWelcome(
    makeClient(),
    makeStore({
      autoroleEnabled: true,
      autoroleRoleId: "111111111111111111",
      autoroleDelaySec: 0,
      autoroleIncludeBots: true,
    }),
    botRole,
  );
  await new Promise((r) => setTimeout(r, 20));
  check("v2 autorole: includeBots → bot nhận role", roleAdds.length === 1);

  // roleId rác → không cấp (không crash)
  roleAdds = [];
  await handleWelcome(
    makeClient(),
    makeStore({ autoroleEnabled: true, autoroleRoleId: "not-an-id", autoroleDelaySec: 0 }),
    memberRole,
  );
  await new Promise((r) => setTimeout(r, 20));
  check("v2 autorole: roleId rác → bỏ qua", roleAdds.length === 0);

  // ── RAID-SAFE: lockdown đang hoạt động → im lặng hoàn toàn ──
  sent = [];
  dms = [];
  roleAdds = [];
  const memberLock = { ...memberRole, send: async (p) => dms.push(p) };
  await handleWelcome(
    makeClient(),
    makeStore({
      welcomeEnabled: true,
      welcomeChannelId: "c1",
      welcomeDmEnabled: true,
      autoroleEnabled: true,
      autoroleRoleId: "111111111111111111",
      autoroleDelaySec: 0,
      lockdownUntil: Date.now() + 60_000,
    }),
    memberLock,
  );
  await new Promise((r) => setTimeout(r, 20));
  check(
    "v2 lockdown: không chào, không DM, không autorole",
    sent.length === 0 && dms.length === 0 && roleAdds.length === 0,
  );

  // Lockdown hết hạn → hoạt động trở lại
  sent = [];
  roleAdds = [];
  await handleWelcome(
    makeClient(),
    makeStore({
      welcomeEnabled: true,
      welcomeChannelId: "c1",
      autoroleEnabled: true,
      autoroleRoleId: "111111111111111111",
      autoroleDelaySec: 0,
      lockdownUntil: Date.now() - 1_000,
    }),
    memberRole,
  );
  await new Promise((r) => setTimeout(r, 20));
  check("v2 lockdown hết hạn: chào + autorole trở lại", sent.length === 1 && roleAdds.length === 1);

  // ══ Welcome/Goodbye v3 — emoji tuỳ chỉnh, liên kết kênh, ảnh thẻ chào ══
  const { _sliceSafeForTest } = welcome;
  const EMOJI_STATIC = "<:wio:222222222222222222>";
  const EMOJI_ANIM = "<a:party:111111111111111111>";
  const RULES_CHANNEL = "<#333333333333333333>";
  const ROLE_ID = "444444444444444444";

  // ── sliceSafe: không cắt vào giữa mã Discord ──
  check("v3 sliceSafe: nội dung ngắn giữ nguyên", _sliceSafeForTest("abc", 10) === "abc");
  check(
    "v3 sliceSafe: vượt trần → cắt đúng trần",
    _sliceSafeForTest("x".repeat(1600)).length === 1500,
  );
  const cutMidEmoji = _sliceSafeForTest("a".repeat(1490) + EMOJI_STATIC);
  check(
    "v3 sliceSafe: cắt ngang mã emoji → bỏ nguyên mã (không để lại '<:wio:1234')",
    cutMidEmoji.length === 1490 && !cutMidEmoji.includes("<"),
  );
  const cutMidChannel = _sliceSafeForTest("b".repeat(1495) + RULES_CHANNEL);
  check("v3 sliceSafe: cắt ngang mã kênh → bỏ nguyên mã", cutMidChannel === "b".repeat(1495));

  // ── thứ tự fallback: câu ngẫu nhiên → nội dung gốc → mặc định ngôn ngữ ──
  const guildFull = { ...makeGuild(), premiumSubscriptionCount: 7 };
  const memberFull = {
    id: "u1",
    user: { bot: false, username: "user1", createdTimestamp: Date.now() - 365 * 86_400_000 },
    guild: guildFull,
  };
  // buildPayload cần CẢ member (để dựng mention) lẫn guild — fixture bám đúng ctx thật.
  const silent = { member: memberFull, guild: guildFull };
  const fallbackToPlain = _buildPayloadForTest(
    "welcome",
    { welcomeUseEmbed: false, welcomeRandom: "\n   \n", welcomeMessage: "Nội dung gốc {user}" },
    silent,
  );
  check(
    "v3 fallback: template ngẫu nhiên toàn dòng trống → dùng NỘI DUNG GỐC (không nhảy về mặc định)",
    fallbackToPlain.content === "Nội dung gốc <@u1>",
  );
  const fallbackToDefault = _buildPayloadForTest(
    "welcome",
    { welcomeUseEmbed: false, welcomeRandom: "   ", welcomeMessage: "   " },
    silent,
  );
  check(
    "v3 fallback: cả hai đều trống → mặc định theo ngôn ngữ server",
    fallbackToDefault.content ===
      lang
        .welcomeDefault("vi")
        .replaceAll("{user}", "<@u1>")
        .replaceAll("{server}", "Test Server")
        .replaceAll("{count}", "42"),
  );

  // ── emoji tuỳ chỉnh + liên kết kênh đi xuyên qua nguyên vẹn ──
  const withEmoji = _buildPayloadForTest(
    "welcome",
    {
      welcomeUseEmbed: false,
      welcomeMessage: `${EMOJI_ANIM} Chào {user} · ${EMOJI_STATIC} đọc ${RULES_CHANNEL}`,
    },
    silent,
  );
  check(
    "v3 emoji: mã <:ten:id> và <a:ten:id> giữ nguyên",
    withEmoji.content.includes(EMOJI_STATIC) && withEmoji.content.includes(EMOJI_ANIM),
  );
  check(
    "v3 kênh: mã <#id> giữ nguyên (Discord tự vẽ thành link)",
    withEmoji.content.includes(RULES_CHANNEL),
  );
  check(
    "v3 an toàn: vẫn chỉ cho phép mention đúng thành viên dù nội dung có <#id>",
    JSON.stringify(withEmoji.allowedMentions) === JSON.stringify({ users: ["u1"], parse: [] }),
  );

  // Mã emoji hỏng (<:bad>) — Discord chỉ hiện chữ, bot không được crash.
  const malformed = _buildPayloadForTest(
    "welcome",
    { welcomeUseEmbed: false, welcomeMessage: "<:bad> {user}" },
    silent,
  );
  check(
    "v3 mã emoji hỏng → đi xuyên qua dạng chữ, không crash",
    malformed.content === "<:bad> <@u1>",
  );

  // Emoji trong TIÊU ĐỀ embed cũng phải đi xuyên qua
  const titleEmoji = _buildPayloadForTest(
    "welcome",
    {
      welcomeUseEmbed: true,
      welcomeEmbedTitle: `${EMOJI_STATIC} {username}`,
      welcomeMessage: "hi {user}",
    },
    silent,
  );
  check(
    "v3 emoji trong tiêu đề embed giữ nguyên",
    titleEmoji.embeds?.[0]?.__title === `${EMOJI_STATIC} user1`,
  );

  // ── LUỒNG THẬT: welcome đầy đủ (emoji + kênh + ảnh + embed + DM + autorole) ──
  const clientFull = makeClient();
  const dmsFull = [];
  const roleAddsFull = [];
  const memberReal = {
    ...memberFull,
    send: async (p) => {
      dmsFull.push(p);
      return {};
    },
    roles: { add: async (id, reason) => roleAddsFull.push({ id, reason }) },
  };
  const LINE_A = `${EMOJI_ANIM} Chào {user} đến {server}!`;
  const LINE_B = `${EMOJI_STATIC} {username} vừa vào, nhớ đọc ${RULES_CHANNEL} nhé!`;
  await handleWelcome(
    clientFull,
    makeStore({
      welcomeEnabled: true,
      welcomeChannelId: "c1",
      welcomeRandom: `${LINE_A}\n${LINE_B}`,
      welcomeMessage: "bị bỏ qua vì có template ngẫu nhiên",
      welcomeUseEmbed: true,
      welcomeEmbedTitle: `🎉 {username} · thành viên #{count}`,
      welcomeEmbedColor: "#57f287",
      welcomeEmbedImage: "https://cdn.example.com/banner.png",
      welcomeEmbedThumbnail: "https://cdn.example.com/thumb.png",
      welcomeDmEnabled: true,
      welcomeDmMessage: `Chào {username}, nhớ đọc ${RULES_CHANNEL}!`,
      autoroleEnabled: true,
      autoroleRoleId: ROLE_ID,
      autoroleDelaySec: 0,
    }),
    memberReal,
  );
  await new Promise((r) => setTimeout(r, 20));
  const full = sent[0];
  const fullEmb = full?.embeds?.[0];
  const fullDesc = String(fullEmb?.__desc ?? "");
  const filledA = LINE_A.replaceAll("{user}", "<@u1>").replaceAll("{server}", "Test Server");
  const filledB = LINE_B.replaceAll("{username}", "user1");
  check("v3 luồng thật: gửi đúng 1 tin vào kênh", sent.length === 1);
  check("v3 luồng thật: content là dòng mention thành viên", full?.content === "<@u1>");
  check(
    "v3 luồng thật: chọn 1 trong 2 câu ngẫu nhiên, giữ nguyên emoji + kênh",
    fullDesc === filledA || fullDesc === filledB,
  );
  check(
    "v3 luồng thật: tiêu đề embed fill {username}/{count} + emoji",
    fullEmb?.__title === "🎉 user1 · thành viên #42",
  );
  check("v3 luồng thật: màu #57f287 parse thành số", fullEmb?.__color === 0x57f287);
  check(
    "v3 luồng thật: ảnh banner + thumbnail vào embed",
    fullEmb?.__image === "https://cdn.example.com/banner.png" &&
      fullEmb?.__thumb === "https://cdn.example.com/thumb.png",
  );
  check(
    "v3 luồng thật: DM chào gửi kèm liên kết kênh cho thành viên mới",
    dmsFull.length === 1 && dmsFull[0].content === "Chào user1, nhớ đọc <#333333333333333333>!",
  );
  check(
    "v3 luồng thật: autorole cấp đúng role",
    roleAddsFull.length === 1 && roleAddsFull[0].id === ROLE_ID,
  );

  // ── LUỒNG THẬT: goodbye đầy đủ (KHÔNG DM, KHÔNG autorole) ──
  const clientGb = makeClient();
  const dmsGb = [];
  const roleAddsGb = [];
  const memberGb = {
    ...memberFull,
    send: async (p) => {
      dmsGb.push(p);
      return {};
    },
    roles: { add: async (id) => roleAddsGb.push(id) },
  };
  await handleGoodbye(
    clientGb,
    makeStore({
      goodbyeEnabled: true,
      goodbyeChannelId: "c2",
      goodbyeMessage: `Tạm biệt {user} ${EMOJI_STATIC}`,
      goodbyeUseEmbed: true,
      goodbyeEmbedColor: "#ed4245",
      goodbyeEmbedImage: "https://cdn.example.com/goodbye.png",
      // DM + autorole chỉ dành cho welcome — bật cũng không được chạy ở goodbye.
      welcomeDmEnabled: true,
      welcomeDmMessage: "không được gửi",
      autoroleEnabled: true,
      autoroleRoleId: ROLE_ID,
      autoroleDelaySec: 0,
    }),
    memberGb,
  );
  await new Promise((r) => setTimeout(r, 20));
  const gbEmb = sent[0]?.embeds?.[0];
  check("v3 goodbye: gửi đúng 1 tin", sent.length === 1);
  check(
    "v3 goodbye: nội dung fill placeholder + emoji giữ nguyên",
    gbEmb?.__desc === `Tạm biệt <@u1> ${EMOJI_STATIC}`,
  );
  check("v3 goodbye: màu riêng của goodbye (#ed4245)", gbEmb?.__color === 0xed4245);
  check(
    "v3 goodbye: ảnh riêng của goodbye",
    gbEmb?.__image === "https://cdn.example.com/goodbye.png",
  );
  check("v3 goodbye: KHÔNG gửi DM chào", dmsGb.length === 0);
  check("v3 goodbye: KHÔNG cấp autorole", roleAddsGb.length === 0);

  // ══ Welcome/Goodbye v3 — THẺ ẢNH: bot tự vẽ PNG riêng cho từng thành viên ══
  const cardMod = require("../bot/src/handlers/welcomeCard");
  const realRenderCard = cardMod.renderCard;
  let cardCalls = [];
  const FAKE_PNG = Buffer.from("89504e470d0a1a0a", "hex");
  const CARD_NAME = cardMod.CARD_FILE_NAME;
  const memberCard = {
    ...memberFull,
    displayName: "Nguyễn Văn A",
    displayAvatarURL: () => "https://cdn.example.com/avatar.png",
  };

  // ── Bật thẻ + embed: gửi kèm file PNG, embed trỏ vào attachment đó ──
  cardCalls = [];
  cardMod.renderCard = async (o) => {
    cardCalls.push(o);
    return FAKE_PNG;
  };
  sent = [];
  await handleWelcome(
    makeClient(),
    makeStore({
      welcomeEnabled: true,
      welcomeChannelId: "c1",
      welcomeUseEmbed: true,
      welcomeCardEnabled: true,
      welcomeCardBackground: "https://cdn.example.com/bg.png",
      welcomeEmbedColor: "#57f287",
      // Banner tĩnh cũng được cấu hình → thẻ phải THẮNG (ảnh chào riêng từng người).
      welcomeEmbedImage: "https://cdn.example.com/banner-tinh.png",
      welcomeEmbedTitle: "🎉 {username}",
      welcomeMessage: "Chào {user}",
    }),
    memberCard,
  );
  const cardPayload = sent[0];
  check("v3 thẻ: gửi đúng 1 tin", sent.length === 1);
  check(
    "v3 thẻ: PNG gửi kèm dưới dạng attachment đúng tên",
    cardPayload?.files?.length === 1 && cardPayload.files[0].name === CARD_NAME,
  );
  check(
    "v3 thẻ: embed trỏ vào attachment (attachment://) chứ không phải URL ngoài",
    cardPayload?.embeds?.[0]?.__image === `attachment://${CARD_NAME}`,
  );
  check(
    "v3 thẻ: thẻ THẮNG ảnh banner tĩnh đã cấu hình",
    cardPayload?.embeds?.[0]?.__image !== "https://cdn.example.com/banner-tinh.png",
  );
  check(
    "v3 thẻ: nhận đúng nền + màu nhấn + nhãn theo ngôn ngữ server",
    cardCalls.length === 1 &&
      cardCalls[0].backgroundUrl === "https://cdn.example.com/bg.png" &&
      cardCalls[0].accent === "#57f287" &&
      cardCalls[0].eyebrow === "CHÀO MỪNG",
  );
  check(
    "v3 thẻ: dùng tên hiển thị + avatar của thành viên",
    cardCalls[0].name === "Nguyễn Văn A" &&
      cardCalls[0].avatarUrl === "https://cdn.example.com/avatar.png",
  );
  check(
    "v3 thẻ: dòng phụ có tên server + số thành viên",
    /Test Server/.test(cardCalls[0].meta) && /42/.test(cardCalls[0].meta),
  );

  // ── Tắt thẻ → không vẽ, không gửi file (nhưng vẫn gửi tin nhắn) ──
  cardCalls = [];
  sent = [];
  await handleWelcome(
    makeClient(),
    makeStore({
      welcomeEnabled: true,
      welcomeChannelId: "c1",
      welcomeUseEmbed: true,
      welcomeCardEnabled: false,
      welcomeMessage: "Chào {user}",
    }),
    memberCard,
  );
  check(
    "v3 thẻ: tắt thẻ → không vẽ, không gửi file, vẫn gửi tin",
    cardCalls.length === 0 && sent.length === 1 && !sent[0]?.files,
  );

  // ── Thẻ chỉ dùng ở chế độ EMBED (ảnh cần embed mới hiển thị) ──
  cardCalls = [];
  sent = [];
  await handleWelcome(
    makeClient(),
    makeStore({
      welcomeEnabled: true,
      welcomeChannelId: "c1",
      welcomeUseEmbed: false,
      welcomeCardEnabled: true,
      welcomeMessage: "Chào {user}",
    }),
    memberCard,
  );
  check(
    "v3 thẻ: tắt embed → không vẽ thẻ (ảnh không có chỗ hiển thị)",
    cardCalls.length === 0 && sent.length === 1 && !sent[0]?.files,
  );
  check("v3 thẻ: tắt embed vẫn gửi nội dung thường", sent[0]?.content === "Chào <@u1>");

  // ── Máy chủ bot KHÔNG vẽ được (thiếu thư viện/font): không được làm mất tin ──
  cardCalls = [];
  sent = [];
  cardMod.renderCard = realRenderCard;
  cardMod._setCanvasUnavailableForTest("thiếu thư viện trong test");
  await handleWelcome(
    makeClient(),
    makeStore({
      welcomeEnabled: true,
      welcomeChannelId: "c1",
      welcomeUseEmbed: true,
      welcomeCardEnabled: true,
      welcomeEmbedTitle: "🎉 {username}",
      welcomeMessage: "Chào {user}",
    }),
    memberCard,
  );
  check("v3 thẻ: máy chủ bot không vẽ được → vẫn gửi tin nhắn chào", sent.length === 1);
  check(
    "v3 thẻ: không có file đính kèm và embed không trỏ vào attachment ma",
    !sent[0]?.files && sent[0]?.embeds?.[0]?.__image === undefined,
  );
  cardMod._resetForTest();
  check("v3 thẻ: khôi phục trạng thái vẽ được sau test", cardMod.cardAvailable() === true);
  cardMod.renderCard = realRenderCard;

  // ── Lỗi khi vẽ (mạng/ảnh hỏng) → bot vẫn gửi tin nhắn ──
  cardMod.renderCard = async () => {
    throw new Error("vẽ hỏng");
  };
  sent = [];
  await handleWelcome(
    makeClient(),
    makeStore({
      welcomeEnabled: true,
      welcomeChannelId: "c1",
      welcomeUseEmbed: true,
      welcomeCardEnabled: true,
      welcomeMessage: "Chào {user}",
    }),
    memberCard,
  );
  check("v3 thẻ: vẽ lỗi → bắt được, vẫn gửi tin nhắn chào", sent.length === 1 && !sent[0]?.files);
  cardMod.renderCard = realRenderCard;

  console.log(`\nKết quả welcome-goodbye: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
})();
