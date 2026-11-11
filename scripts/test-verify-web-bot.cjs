// TEST: bot/src/verifyWeb.js — phía bot của luồng xác minh web.
// Chạy: node scripts/test-verify-web-bot.cjs
//
// VÌ SAO CẦN: file này CẤP QUYỀN và BAN người thật trên Discord. Bốn bất biến
// phải khoá ở đây:
//   1. Không tạo được phiên thì KHÔNG gửi DM (không để người dùng bấm link chết).
//   2. Owner/admin/bot luôn được đánh dấu privileged — Convex dựa vào cờ này để
//      không auto-ban (ban owner = mất server).
//   3. Claim thất bại thì KHÔNG thi hành (2 tiến trình bot không ban 2 lần).
//   4. Mọi nhánh đều trả `{ applied, note }` — nuốt im lặng làm phiên kẹt.
const DJS_MOCK = require("./support/djs-mock-path.cjs");
const Module = require("module");
const fs = require("fs");

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "discord.js") return DJS_MOCK;
  return origResolve.call(this, request, ...args);
};
fs.writeFileSync(
  DJS_MOCK,
  `class EmbedBuilder {
  constructor(data = {}) { this.d = data; }
  setColor(c) { this.d.color = c; return this; }
  setTitle(t) { this.d.title = t; return this; }
  setDescription(t) { this.d.description = t; return this; }
  setFooter(f) { this.d.footer = f; return this; }
  setThumbnail(t) { this.d.thumbnail = t; return this; }
}
class Row {
  constructor() { this.components = []; }
  addComponents(...c) { this.components.push(...c.flat(Infinity)); return this; }
}
class Button {
  constructor() { this.d = {}; }
  setCustomId(v) { this.customId = v; return this; }
  setLabel(v) { this.label = v; return this; }
  setStyle(v) { this.style = v; return this; }
  setURL(v) { this.url = v; return this; }
}
module.exports = {
  Colors: { Blurple: 0x5865f2 },
  EmbedBuilder,
  ActionRowBuilder: Row,
  ButtonBuilder: Button,
  ButtonStyle: { Primary: 1, Link: 5 },
};
`,
);

const vw = require("../bot/src/verifyWeb.js");

let pass = 0;
let fail = 0;
function check(label, cond, detail) {
  if (cond) {
    pass++;
    console.log("PASS", label);
  } else {
    fail++;
    console.log("FAIL", label, detail === undefined ? "" : JSON.stringify(detail));
  }
}

/** Member giả tối thiểu: role cache Set + user + guild. */
function makeMember(id, opts = {}) {
  const roles = new Set(opts.roles ?? []);
  const channelMessages = [];
  const guild = {
    id: opts.guildId ?? "g1",
    name: opts.guildName ?? "Server Test",
    ownerId: opts.ownerId ?? "owner-1",
    iconURL: () => "https://cdn.example/icon.png",
    // Mặc định "đã rời server"; test nào cần thành viên còn đó thì ghi đè.
    members: { fetch: async () => null },
    bans: {
      create: async (userId, o) => {
        if (opts.banFails) throw new Error("Missing Permissions");
        guild._banned = { userId, ...o };
      },
    },
    channels: {
      cache: new Map([
        [
          "verify-channel",
          {
            send: async (payload) => {
              if (opts.channelSendFails) throw new Error("Missing Access");
              channelMessages.push(payload);
              return payload;
            },
          },
        ],
      ]),
      fetch: async (channelId) => guild.channels.cache.get(channelId) ?? null,
    },
    _channelMessages: channelMessages,
  };
  const dms = [];
  // `self` phải tồn tại TRƯỚC khi tạo object: kick/timeout/send là closure đọc
  // chính object này — dùng `member` mà chưa khai báo là ReferenceError bị
  // `.catch(() => {})` nuốt mất, test sẽ xanh giả.
  const self = {
    id,
    guild,
    user: { id, username: `user-${id}`, bot: opts.bot === true },
    permissions: { has: (flag) => (opts.perms ?? []).includes(flag) },
    roles: {
      cache: { has: (r) => roles.has(r) },
      add: async (r) => {
        if (opts.roleAddFails) throw new Error("Missing Permissions");
        roles.add(r);
        (guild._added ??= []).push(r);
      },
      remove: async (r) => {
        roles.delete(r);
        (guild._removed ??= []).push(r);
      },
    },
    send: async (payload) => {
      if (opts.dmFails) throw new Error("Cannot send messages to this user");
      dms.push(payload);
      return payload;
    },
    kick: async (reason) => {
      if (opts.kickFails) throw new Error("Missing Permissions");
      self._kicked = reason;
    },
    timeout: async (ms, reason) => {
      self._timedOut = { ms, reason };
    },
    _dms: dms,
  };
  return self;
}

/** Store giả: client Convex ghi lại mọi lệnh gọi + config trả về. */
function makeStore(config = {}, handlers = {}) {
  const calls = [];
  return {
    calls,
    getConfig: async () => config,
    client: {
      mutation: async (name, args) => {
        calls.push([name, args]);
        if (handlers[name]) return handlers[name](args);
        return { ok: true };
      },
      query: async () => [],
    },
  };
}

(async () => {
  // ══════════ 1. isPrivileged — không bao giờ auto-ban owner/admin/bot ══════════
  console.log("\n── isPrivileged ──");
  check("owner được miễn", vw.isPrivileged(makeMember("u1", { ownerId: "u1" })) === true);
  check("bot được miễn", vw.isPrivileged(makeMember("u2", { bot: true })) === true);
  check(
    "Administrator được miễn",
    vw.isPrivileged(makeMember("u3", { perms: ["Administrator"] })) === true,
  );
  check(
    "ManageGuild được miễn",
    vw.isPrivileged(makeMember("u4", { perms: ["ManageGuild"] })) === true,
  );
  check("thành viên thường KHÔNG được miễn", vw.isPrivileged(makeMember("u5")) === false);
  check("không có guild → false (không ném)", vw.isPrivileged({ id: "u6" }) === false);
  check("null → false", vw.isPrivileged(null) === false);
  check(
    "permissions.has ném lỗi → false, không làm sập luồng",
    vw.isPrivileged({
      id: "u7",
      guild: { ownerId: "x" },
      permissions: {
        has: () => {
          throw new Error("boom");
        },
      },
    }) === false,
  );

  // ══════════ 2. verifyUrl ══════════
  console.log("\n── verifyUrl ──");
  check("dựng URL từ token", vw.verifyUrl("abc").endsWith("/verify/abc"), vw.verifyUrl("abc"));
  check(
    "encode ký tự lạ",
    vw.verifyUrl("a/b c").endsWith("/verify/a%2Fb%20c"),
    vw.verifyUrl("a/b c"),
  );
  check("DASHBOARD_URL không có / cuối", !vw.DASHBOARD_URL.endsWith("/"), vw.DASHBOARD_URL);

  // ══════════ 3. createSession ══════════
  console.log("\n── createSession ──");
  {
    const store = makeStore(
      {},
      { "verify:botCreateSession": () => ({ token: "tok-1", expiresAt: Date.now() + 600_000 }) },
    );
    const member = makeMember("100000000000000001", { perms: ["ManageGuild"] });
    const session = await vw.createSession(store, member);
    check("trả token + url", session?.token === "tok-1" && session.url.endsWith("/verify/tok-1"));
    check("gửi privileged=true cho admin", store.calls[0][1].privileged === true, store.calls[0]);
    check(
      "gửi đúng guildId/userId",
      store.calls[0][1].guildId === "g1" && store.calls[0][1].userId === member.id,
    );
  }
  {
    const store = makeStore({}, { "verify:botCreateSession": () => ({}) });
    check(
      "Convex không trả token → null",
      (await vw.createSession(store, makeMember("u8"))) === null,
    );
  }
  {
    const store = makeStore(
      {},
      {
        "verify:botCreateSession": () => {
          throw new Error("Server chưa bật xác minh web");
        },
      },
    );
    check(
      "mutation lỗi → null (không ném)",
      (await vw.createSession(store, makeMember("u9"))) === null,
    );
  }
  check("không có guild → null", (await vw.createSession(makeStore(), { id: "u10" })) === null);

  // ══════════ 4. sendVerifyDm — cooldown chống spam ══════════
  console.log("\n── sendVerifyDm ──");
  {
    const member = makeMember("200000000000000001");
    const session = { token: "t", url: "https://x/verify/t", expiresAt: Date.now() + 600_000 };
    const first = await vw.sendVerifyDm(member, {}, session);
    const second = await vw.sendVerifyDm(member, {}, session);
    check("lần đầu gửi được", first === true);
    check("lần hai trong 60s bị chặn", second === false);
    check("chỉ nhận đúng 1 DM", member._dms.length === 1, member._dms.length);
    const embed = member._dms[0].embeds[0].d;
    check(
      "DM nói rõ KHÔNG lưu IP thô",
      /không lưu địa chỉ IP/i.test(embed.description),
      embed.description,
    );
    check(
      "nút là link tới trang verify",
      member._dms[0].components[0].components[0].url === session.url,
    );
  }
  {
    const member = makeMember("200000000000000002", { dmFails: true });
    const ok = await vw.sendVerifyDm(
      member,
      {},
      {
        token: "t2",
        url: "https://x/verify/t2",
        expiresAt: Date.now() + 600_000,
      },
    );
    check("người dùng chặn DM → false (không ném)", ok === false);
    const again = await vw.sendVerifyDm(
      member,
      {},
      {
        token: "t2",
        url: "https://x/verify/t2",
        expiresAt: Date.now() + 600_000,
      },
    );
    check("DM hỏng vẫn tính cooldown (không spam thử lại)", again === false);
  }

  // ══════════ 5. startVerification ══════════
  console.log("\n── startVerification ──");
  {
    const store = makeStore({}, { "verify:botCreateSession": () => null });
    const res = await vw.startVerification(store, makeMember("300000000000000001"), {});
    check(
      "không tạo được phiên → reason session_failed",
      res.ok === false && res.reason === "session_failed",
      res,
    );
  }
  {
    const store = makeStore(
      {},
      {
        "verify:botCreateSession": () => ({ token: "tok-ok", expiresAt: Date.now() + 600_000 }),
      },
    );
    const res = await vw.startVerification(store, makeMember("300000000000000002"), {});
    check("tạo phiên + gửi DM → ok", res.ok === true && res.reason === "sent", res);
    check("trả url cho caller", typeof res.url === "string" && res.url.includes("tok-ok"));
  }
  {
    const store = makeStore(
      {},
      {
        "verify:botCreateSession": () => ({
          token: "tok-blocked",
          expiresAt: Date.now() + 600_000,
        }),
      },
    );
    const res = await vw.startVerification(
      store,
      makeMember("300000000000000003", { dmFails: true }),
      {},
    );
    check("DM bị chặn → reason dm_blocked", res.ok === false && res.reason === "dm_blocked", res);
  }

  // ══════════ 5b. notifyOpenDm — nhắc mở DM, không lộ token ══════════
  console.log("\n── notifyOpenDm ──");
  {
    const member = makeMember("300000000000000004");
    const ok = await vw.notifyOpenDm(member, { verifyChannelId: "verify-channel" });
    check(
      "gửi được nhắc vào kênh verify",
      ok === true && member.guild._channelMessages.length === 1,
    );
    const msg = member.guild._channelMessages[0];
    check(
      "mention đúng người + nút mở lại luồng DM",
      msg.content.includes(member.id) &&
        msg.components[0].components[0].customId === "verify_web_start",
      msg,
    );
    check(
      "KHÔNG đăng link/token vào kênh công khai",
      !/https?:\/\/|\/verify\//.test(msg.content),
      msg.content,
    );
  }
  {
    const member = makeMember("300000000000000005", { channelSendFails: true });
    const ok = await vw.notifyOpenDm(member, { verifyChannelId: "verify-channel" });
    check("kênh lỗi/không có quyền → false, không ném", ok === false);
  }
  {
    const member = makeMember("300000000000000006");
    check(
      "thiếu verifyChannelId → không gửi",
      (await vw.notifyOpenDm(member, {})) === false && member.guild._channelMessages.length === 0,
    );
  }

  // ══════════ 6. grantVerified ══════════
  console.log("\n── grantVerified ──");
  {
    const member = makeMember("400000000000000001", { roles: ["unverified"] });
    const res = await vw.grantVerified(member, {
      unverifiedRoleId: "unverified",
      verifiedRoleId: "verified",
    });
    check(
      "cấp role verified + gỡ unverified",
      res.ok === true &&
        member.roles.cache.has("verified") &&
        !member.roles.cache.has("unverified"),
    );
    check("KHÔNG dùng roles.set (không xoá role khác)", member.guild._removed.length === 1);
  }
  {
    const member = makeMember("400000000000000002");
    const res = await vw.grantVerified(member, { unverifiedRoleId: "u", verifiedRoleId: null });
    check(
      "thiếu role verified → báo missing_verified_role, không cấp bừa",
      res.ok === false && res.note === "missing_verified_role",
    );
  }
  {
    const member = makeMember("400000000000000005", { roleAddFails: true });
    const res = await vw.grantVerified(member, { verifiedRoleId: "verified" });
    check(
      "Discord từ chối cấp role → ok=false, retryable",
      res.ok === false && res.note === "role_add_failed" && res.retryable === true,
      res,
    );
  }
  {
    const member = makeMember("400000000000000003");
    await vw.grantVerified(member, {
      verifiedRoleId: "verified",
      verifyWelcomeEnabled: true,
      verifyWelcomeTitle: "Chào {user}",
      verifyWelcomeDescription: "Mừng bạn đến {server}",
      verifyWelcomeColor: "#ff0000",
    });
    check("gửi DM chào khi bật", member._dms.length === 1, member._dms.length);
    const embed = member._dms[0].embeds[0].d;
    check(
      "thay placeholder {user}/{server}",
      embed.description === "Mừng bạn đến Server Test",
      embed.description,
    );
    check("áp màu hex", embed.color === 0xff0000, embed.color);
  }
  {
    const member = makeMember("400000000000000004", { dmFails: true });
    const res = await vw.grantVerified(member, {
      verifiedRoleId: "verified",
      verifyWelcomeEnabled: true,
    });
    check("DM chào hỏng KHÔNG làm hỏng việc cấp role", res.ok === true);
  }

  // ══════════ 7. applyGrant — hình phạt ══════════
  console.log("\n── applyGrant ──");
  {
    const member = makeMember("500000000000000001");
    const client = { guilds: { cache: new Map([["g1", member.guild]]) } };
    const res = await vw.applyGrant(client, makeStore({}), {
      guildId: "g1",
      userId: member.id,
      decision: "ban",
      reason: "ip_ban_match",
      riskScore: 90,
    });
    check(
      "decision ban → ban qua guild.bans",
      res.applied === true && member.guild._banned?.userId === member.id,
    );
    check(
      "lý do ban không chứa hash/IP",
      !/\b[0-9a-f]{32,}\b/.test(member.guild._banned.reason),
      member.guild._banned.reason,
    );
  }
  {
    const member = makeMember("500000000000000007", { banFails: true });
    const client = { guilds: { cache: new Map([["g1", member.guild]]) } };
    const res = await vw.applyGrant(client, makeStore({}), {
      guildId: "g1",
      userId: member.id,
      decision: "ban",
      reason: "ip_ban_match",
      riskScore: 90,
    });
    check(
      "ban Discord lỗi → applied=false, retryable",
      res.applied === false && res.note === "ban_failed" && res.retryable === true,
      res,
    );
  }
  {
    const member = makeMember("500000000000000008", { kickFails: true });
    member.guild.members = { fetch: async () => member };
    const client = { guilds: { cache: new Map([["g1", member.guild]]) } };
    const res = await vw.applyGrant(client, makeStore({}), {
      guildId: "g1",
      userId: member.id,
      decision: "deny",
      punish: "kick",
      riskScore: 80,
    });
    check(
      "kick Discord lỗi → applied=false, retryable",
      res.applied === false && res.note === "kick_failed" && res.retryable === true,
      res,
    );
  }
  {
    const member = makeMember("500000000000000002");
    member.guild.members = { fetch: async () => member };
    const client = { guilds: { cache: new Map([["g1", member.guild]]) } };
    const res = await vw.applyGrant(client, makeStore({ verifiedRoleId: "verified" }), {
      guildId: "g1",
      userId: member.id,
      decision: "allow",
      reason: "allow",
      riskScore: 0,
    });
    check("allow → cấp role verified", res.applied === true && member.roles.cache.has("verified"));
  }
  {
    const client = { guilds: { cache: new Map() } };
    const res = await vw.applyGrant(client, makeStore({}), {
      guildId: "g-missing",
      userId: "500000000000000003",
      decision: "allow",
      riskScore: 0,
    });
    check(
      "bot không ở server → applied=false, note rõ",
      res.applied === false && res.note === "bot_not_in_guild",
    );
  }
  {
    // Thành viên đã rời trước khi bot kịp cấp role → không được ném.
    const guild = makeMember("x").guild;
    guild.members = { fetch: async () => null };
    const client = { guilds: { cache: new Map([["g1", guild]]) } };
    const allow = await vw.applyGrant(client, makeStore({}), {
      guildId: "g1",
      userId: "500000000000000004",
      decision: "allow",
      riskScore: 0,
    });
    check(
      "allow + đã rời → left_before_grant",
      allow.applied === false && allow.note === "left_before_grant",
    );
    const deny = await vw.applyGrant(client, makeStore({}), {
      guildId: "g1",
      userId: "500000000000000004",
      decision: "deny",
      punish: "kick",
      riskScore: 80,
    });
    check(
      "deny + đã rời → left_before_punish",
      deny.applied === false && deny.note === "left_before_punish",
    );
  }
  {
    const member = makeMember("500000000000000005");
    member.guild.members = { fetch: async () => member };
    const client = { guilds: { cache: new Map([["g1", member.guild]]) } };
    const kick = await vw.applyGrant(client, makeStore({}), {
      guildId: "g1",
      userId: member.id,
      decision: "deny",
      punish: "kick",
      riskScore: 80,
    });
    check("deny + punish kick → kick", kick.applied === true && Boolean(member._kicked));
    const timeout = await vw.applyGrant(client, makeStore({ altTimeoutMinutes: 30 }), {
      guildId: "g1",
      userId: member.id,
      decision: "deny",
      punish: "timeout",
      riskScore: 80,
    });
    check(
      "deny + timeout → timeout 30 phút",
      timeout.applied === true && member._timedOut?.ms === 30 * 60_000,
      member._timedOut,
    );
    const reverify = await vw.applyGrant(
      client,
      makeStore({ unverifiedRoleId: "unverified", verifiedRoleId: "verified" }),
      { guildId: "g1", userId: member.id, decision: "deny", punish: "verify", riskScore: 80 },
    );
    check(
      "deny + verify → gỡ verified, gán unverified",
      reverify.applied === true &&
        member.roles.cache.has("unverified") &&
        !member.roles.cache.has("verified"),
    );
    const noPunish = makeMember("500000000000000009");
    noPunish.guild.members = { fetch: async () => noPunish };
    const noPunishClient = { guilds: { cache: new Map([["g1", noPunish.guild]]) } };
    const fallback = await vw.applyGrant(noPunishClient, makeStore({}), {
      guildId: "g1",
      userId: noPunish.id,
      decision: "deny",
      riskScore: 80,
    });
    check(
      "deny không cấu hình hình phạt → KHÔNG kick",
      fallback.applied === true && fallback.note === "denied_no_action" && !noPunish._kicked,
      fallback,
    );
  }
  {
    // punish=ban thắng decision=allow: cấu hình "ban" phải được thi hành.
    const member = makeMember("500000000000000006");
    const client = { guilds: { cache: new Map([["g1", member.guild]]) } };
    const res = await vw.applyGrant(client, makeStore({}), {
      guildId: "g1",
      userId: member.id,
      decision: "allow",
      punish: "ban",
      riskScore: 0,
    });
    check(
      "punish=ban được thi hành kể cả decision=allow",
      res.applied === true && res.note === "banned",
    );
  }

  // ══════════ 8. processVerifyGrants — fencing ══════════
  console.log("\n── processVerifyGrants ──");
  check(
    "mảng rỗng → 0, không gọi Convex",
    (await vw.processVerifyGrants({}, makeStore(), [])) === 0,
  );
  check("không phải mảng → 0", (await vw.processVerifyGrants({}, makeStore(), null)) === 0);
  {
    const member = makeMember("600000000000000001");
    member.guild.members = { fetch: async () => member };
    const client = { guilds: { cache: new Map([["g1", member.guild]]) } };
    const store = makeStore(
      { verifiedRoleId: "verified" },
      {
        "verify:botClaimGrant": () => ({ ok: false }),
      },
    );
    const done = await vw.processVerifyGrants(client, store, [
      { id: "s1", guildId: "g1", userId: member.id, decision: "allow", riskScore: 0 },
    ]);
    check("claim thất bại → KHÔNG thi hành", done === 0 && !member.roles.cache.has("verified"));
    check(
      "claim thất bại → không gọi botFinishGrant",
      !store.calls.some(([n]) => n === "verify:botFinishGrant"),
      store.calls.map(([n]) => n),
    );
  }
  {
    const member = makeMember("600000000000000002");
    member.guild.members = { fetch: async () => member };
    const client = { guilds: { cache: new Map([["g1", member.guild]]) } };
    const store = makeStore(
      { verifiedRoleId: "verified" },
      {
        "verify:botClaimGrant": () => ({ ok: true }),
      },
    );
    const done = await vw.processVerifyGrants(client, store, [
      { id: "s2", guildId: "g1", userId: member.id, decision: "allow", riskScore: 0 },
    ]);
    check("claim ok → thi hành + finish", done === 1 && member.roles.cache.has("verified"));
    const finish = store.calls.find(([n]) => n === "verify:botFinishGrant");
    check(
      "finish ghi applied=true + note",
      finish?.[1].applied === true && finish?.[1].note === "granted",
      finish,
    );
  }
  {
    const member = makeMember("600000000000000004", { roleAddFails: true });
    member.guild.members = { fetch: async () => member };
    const client = { guilds: { cache: new Map([["g1", member.guild]]) } };
    const store = makeStore(
      { verifiedRoleId: "verified" },
      { "verify:botClaimGrant": () => ({ ok: true }) },
    );
    await vw.processVerifyGrants(client, store, [
      { id: "s-fail", guildId: "g1", userId: member.id, decision: "allow", riskScore: 0 },
    ]);
    const finish = store.calls.find(([n]) => n === "verify:botFinishGrant");
    check(
      "cấp role lỗi → finish applied=false + retryable=true",
      finish?.[1].applied === false &&
        finish?.[1].retryable === true &&
        finish?.[1].note === "role_add_failed",
      finish,
    );
  }
  {
    const member = makeMember("600000000000000003");
    member.guild.members = { fetch: async () => member };
    const client = { guilds: { cache: new Map([["g1", member.guild]]) } };
    const store = makeStore(
      {},
      {
        "verify:botClaimGrant": (() => {
          let n = 0;
          return () => {
            n += 1;
            if (n === 1) throw new Error("Convex timeout");
            return { ok: true };
          };
        })(),
      },
    );
    const done = await vw.processVerifyGrants(client, store, [
      { id: "s3", guildId: "g1", userId: "bad", decision: "allow", riskScore: 0 },
      {
        id: "s4",
        guildId: "g1",
        userId: member.id,
        decision: "deny",
        punish: "kick",
        riskScore: 80,
      },
    ]);
    check("một grant lỗi KHÔNG chặn grant sau", done === 1 && Boolean(member._kicked), done);
  }

  // ══════════ 9. Đồng bộ ban ══════════
  console.log("\n── syncGuildBan / resyncGuildBans ──");
  {
    const store = makeStore();
    await vw.syncGuildBan(store, "g1", "700000000000000001", true, "spam");
    check(
      "ghi đúng module verifyBans + args",
      store.calls[0]?.[0] === "verifyBans:botSyncGuildBan" && store.calls[0][1].active === true,
      store.calls[0],
    );
    const before = store.calls.length;
    await vw.syncGuildBan(store, "", "", true);
    check("thiếu guildId/userId → không gọi Convex", store.calls.length === before);
    const broken = makeStore(
      {},
      {
        "verifyBans:botSyncGuildBan": () => {
          throw new Error("offline");
        },
      },
    );
    let threw = false;
    try {
      await vw.syncGuildBan(broken, "g1", "700000000000000002", true);
    } catch {
      threw = true;
    }
    check("lỗi Convex bị nuốt (không làm sập handler ban)", threw === false);
  }
  {
    const store = makeStore();
    const guild = {
      id: "g1",
      bans: {
        fetch: async () =>
          new Map([
            ["800000000000000001", {}],
            ["800000000000000002", {}],
          ]),
      },
    };
    const count = await vw.resyncGuildBans(store, guild);
    check("trả số ban đã đồng bộ", count === 2, count);
    check(
      "gọi verifyBans:botReplaceGuildBans với đủ userIds",
      store.calls[0]?.[0] === "verifyBans:botReplaceGuildBans" &&
        store.calls[0][1].userIds.length === 2,
      store.calls[0],
    );
  }
  {
    const store = makeStore();
    const count = await vw.resyncGuildBans(store, {
      id: "g1",
      bans: {
        fetch: async () => {
          throw new Error("Missing Permissions");
        },
      },
    });
    check("thiếu quyền xem ban → 0, không ném", count === 0);
  }

  // ══════════ 10. Audit reason + dọn cooldown ══════════
  console.log("\n── audit reason + sweep ──");
  check(
    "reason nêu account trùng khi có link",
    vw
      ._punishReasonForTest({
        reason: "alt_link",
        decision: "ban",
        linkedUserId: "999",
        riskScore: 85,
      })
      .includes("999"),
  );
  check(
    "reason không có link thì chỉ nêu rủi ro",
    !vw
      ._punishReasonForTest({ reason: "vpn", decision: "deny", riskScore: 60 })
      .includes("trùng tín hiệu"),
  );
  check(
    "sweep cooldown trả số mục đã xoá",
    typeof vw._sweepDmCooldownForTest(Date.now() + 10 * 60_000) === "number",
  );

  console.log(`\nKết quả verify-web-bot: ${pass} PASS, ${fail} FAIL`);
  if (fail > 0) process.exit(1);
})();
