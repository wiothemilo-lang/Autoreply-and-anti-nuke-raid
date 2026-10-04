/**
 * test-commands-flow-e2e.ts — LUỒNG LỆNH PREFIX + SLASH THẬT, xuyên cả 3 tầng.
 *
 * Đối xứng với test-backup-flow-e2e.ts / test-greeting-flow-e2e.ts: các suite cũ
 * rời từng tầng (test-interaction-create: slash với store mock; test-message-create:
 * chỉ nhánh dispatch của prefix). Khoảng trống nằm ở KHỚP NỐI dispatcher ↔
 * handler ↔ Convex handlers — lệnh chạy thật gọi function Convex bằng TÊN CHUỖI
 * (tsc không phủ): sai tên/tham số là hỏng câm trên production mà test tầng mock
 * không bao giờ thấy.
 *
 *   PREFIX: "!prefix set ^" → onMessageCreate (dispatcher thật)
 *     → commands/prefix.js thật → bot_writes:botUpdateSettings (Convex thật)
 *     → store.invalidate → lượt lệnh sau chạy với prefix MỚI ngay
 *   SLASH: "/prefix set ^" → onInteractionCreate (dispatcher thật)
 *     → case "prefix" thật → CÙNG mutation Convex thật
 *   MOD: "/mod timeout" → modTools thật → botRecordModAction (số case thật)
 *     → caseLog thật → webhookHub thật → webhook mặc định trong kênh log
 *
 * "Convex giả" chỉ là ctx.db trên Map (patch tạo phiên bản mới như Convex thật —
 * bài học 24/09/2026 từ test-backup-flow-e2e); MỌI handler Convex và MỌI dòng
 * dispatcher/handler/modTools/caseLog/webhookHub đều là code production.
 * Patch test nằm ở TẦNG DƯỚI NHẤT (ConvexHttpClient.prototype) — dưới proxy của
 * ConvexStore — để logic tự xoá cache CONFIG_WRITE_MUTATIONS của production chạy
 * nguyên vẹn (bài học 24/09/2026 từ test-greeting-flow-e2e).
 * Không mạng, không Discord thật.
 *
 * Chạy: bun scripts/test-commands-flow-e2e.ts
 */

import { getBotConfig } from "../convex/guilds";
import {
  botUpdateSettings,
  botAutoReplyUpsert,
  botAutoReplyRemove,
  botSetAntinuke,
  botModuleUpdate,
  botUpdateLockdown,
  botSetBackupRequest,
  botSetBackupRetention,
  botRecordModAction,
} from "../convex/bot_writes";
import { listGuild as backupListGuild } from "../convex/backup";
import { botGetWebhooks } from "../convex/webhooks";
import { getPendingJobs } from "../convex/bot_tick";
import { computeBotKey } from "../convex/botAuth";

import { createRequire } from "node:module";
/** Bot là CommonJS — nạp module THẬT của production qua createRequire. */
const botRequire = createRequire(new URL("../bot/src/index.js", import.meta.url));
const ConvexStore = botRequire("../src/convex.js") as any;
const onMessageCreate = botRequire("../src/handlers/messageCreate.js") as any;
const onInteractionCreate = botRequire("../src/handlers/interactionCreate.js") as any;
const prefixCommands = botRequire("../src/commands/prefix.js") as any;
const slashDefs = botRequire("../src/commands/slash.js").commands as { name: string }[];
const webhookHub = botRequire("../src/webhookHub.js") as any;

const GID = "123456789012345678";
const BOT_KEY = "key-thô-32-bytes-của-bot";

process.env.BOT_KEY = BOT_KEY;
process.env.CONVEX_URL = process.env.CONVEX_URL || "https://e2e-commands-test.convex.cloud";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean) => {
  console.log(ok ? `  ✅ ${label}` : `  ❌ ${label}`);
  if (ok) pass++;
  else fail++;
};

// ──────────────────────────── Convex giả (đúng semantics) ───────────────────
type Row = Record<string, any>;

function makeCtx() {
  const tables = new Map<string, Row[]>();
  let idc = 0;
  let creation = 1_700_000_000_000;
  const rowsOf = (t: string) => {
    if (!tables.has(t)) tables.set(t, []);
    return tables.get(t)!;
  };
  function chain(t: string, predicates: ((r: Row) => boolean)[] = []) {
    const base = () => rowsOf(t).filter((r) => predicates.every((p) => p(r)));
    const sorted = () =>
      [...base()].sort((a, b) => (b._creationTime ?? 0) - (a._creationTime ?? 0));
    return {
      withIndex: (_name: string, bound?: (q: unknown) => unknown) => {
        const cap: Row = {};
        const q = { eq: (f: string, v: unknown) => ((cap[f] = v), q) };
        bound?.(q);
        return chain(
          t,
          predicates.concat([(r) => Object.entries(cap).every(([k, v]) => r[k] === v)]),
        );
      },
      filter: (fn: (r: Row) => boolean) => chain(t, predicates.concat([fn])),
      first: async () => base()[0] ?? null,
      collect: async () => base(),
      take: async (n: number) => base().slice(0, n),
      order: (_dir: "asc" | "desc") => ({
        first: async () => sorted()[0] ?? null,
        collect: async () => sorted(),
        take: async (n: number) => sorted().slice(0, n),
      }),
    };
  }
  const db = {
    insert: async (t: string, doc: Row) => {
      const id = `${t}_${++idc}`;
      rowsOf(t).push({ _id: id, _creationTime: creation++, ...doc });
      return id;
    },
    get: async (id: string) => {
      for (const rows of tables.values()) {
        const hit = rows.find((r) => r._id === id);
        if (hit) return hit;
      }
      return null;
    },
    patch: async (id: string, patch: Row) => {
      for (const rows of tables.values()) {
        const i = rows.findIndex((r) => r._id === id);
        if (i < 0) continue;
        // Convex: patch tạo phiên bản MỚI (document bất biến) — tham chiếu cũ
        // giữ giá trị trước patch.
        const next: Row = { ...rows[i] };
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined) delete next[k];
          else next[k] = v;
        }
        rows[i] = next;
        return;
      }
    },
    delete: async (id: string) => {
      for (const rows of tables.values()) {
        const i = rows.findIndex((r) => r._id === id);
        if (i >= 0) {
          rows.splice(i, 1);
          return;
        }
      }
    },
    query: (t: string) => chain(t),
  };
  return {
    ctx: { db, storage: { getUrl: async () => null, delete: async () => {} } },
    rows: rowsOf,
    tables,
  };
}

/** Seed: botStatus (botKeySeed) + guild + 1 module antinuke. */
function seed() {
  const h = makeCtx();
  h.rows("botStatus").push({
    _id: "st",
    kind: "status",
    botKeySeed: computeBotKey(BOT_KEY),
    online: true,
  });
  h.rows("guilds").push({
    _id: "g1",
    discordId: GID,
    name: "Server Thật",
    botInGuild: true,
    prefix: "!",
    modRoles: [],
    adminRoles: [],
    badWords: [],
    antinukeEnabled: false,
    logChannelId: "c_log",
  });
  h.rows("antinukeModules").push({
    _id: "m1",
    guildId: GID,
    module: "massBan",
    enabled: true,
    threshold: 5,
    windowSeconds: 10,
    punish: "ban",
    actions: ["ban"],
    timeoutSeconds: 300,
    whitelistRoles: [],
    heat: 25,
  });
  return h;
}

// ───── Patch tầng HTTP (dưới proxy của store) gọi handler Convex thật ─────
let ACTIVE: { ctx: any; handlers: Record<string, Record<string, any>> } | null = null;

const ConvexHttpClient = botRequire("convex/browser").ConvexHttpClient as any;
for (const prop of ["query", "mutation", "action"] as const) {
  (ConvexHttpClient.prototype as any)[prop] = async function (fnName: string, args: any = {}) {
    if (!ACTIVE) throw new Error("test chưa setActive — gọi installHandlers trước");
    const fn = ACTIVE.handlers[prop]?.[fnName];
    if (!fn) throw new Error(`test không cho gọi ${prop} ${fnName}`);
    return (fn as any)._handler(ACTIVE.ctx, args);
  };
}

function makeStore() {
  return new ConvexStore();
}

/** Bảng function Convex thật mà dispatcher lệnh được gọi (hợp đồng tên chuỗi). */
function installHandlers(h: ReturnType<typeof seed>) {
  ACTIVE = {
    ctx: h.ctx,
    handlers: {
      query: {
        "guilds:getBotConfig": getBotConfig,
        "bot_tick:getPendingJobs": getPendingJobs,
        "backup:listGuild": backupListGuild,
        "webhooks:botGetWebhooks": botGetWebhooks,
      },
      mutation: {
        "bot_writes:botUpdateSettings": botUpdateSettings,
        "bot_writes:botAutoReplyUpsert": botAutoReplyUpsert,
        "bot_writes:botAutoReplyRemove": botAutoReplyRemove,
        "bot_writes:botSetAntinuke": botSetAntinuke,
        "bot_writes:botModuleUpdate": botModuleUpdate,
        "bot_writes:botUpdateLockdown": botUpdateLockdown,
        "bot_writes:botSetBackupRequest": botSetBackupRequest,
        "bot_writes:botSetBackupRetention": botSetBackupRetention,
        "bot_writes:botRecordModAction": botRecordModAction,
      },
    },
  };
}

// ───────────────────────────── Discord giả chung ────────────────────────────
function makeMember(over: Row = {}) {
  const roles = new Map<string, true>(over.rolesMap ?? []);
  return {
    id: over.id ?? "u1",
    user: {
      bot: false,
      username: over.username ?? "user1",
      tag: "user1#0001",
      id: over.id ?? "u1",
    },
    permissions: { has: () => !!over.manageGuild },
    roles: { cache: { has: (id: string) => roles.has(id) } },
    timeout: async () => {},
    kick: async () => {},
    ban: async () => {},
  };
}

function makeLogChannel(id: string, name: string, client: any) {
  return {
    id,
    name,
    isTextBased: () => true,
    isDMBased: () => false,
    send: async (p: any) => void client.__sents.push({ channelId: id, payload: p }),
    createWebhook: async () => null,
    guild: { id: GID, name: "Server Thật" },
    client,
  };
}

/** message giả khớp cách dispatcher + prefix handlers dùng. */
function makeMessage(client: any, content: string, over: Row = {}) {
  const replies: any[] = [];
  const member = over.member ?? makeMember();
  const message: any = {
    content,
    author: { bot: false, username: member.user.username, id: member.id },
    member,
    guild: {
      id: GID,
      name: "Server Thật",
      available: true,
      members: { me: { id: "bot1", permissions: { has: () => true } } },
      roles: { cache: new Map() },
      channels: {
        fetch: async (id: string) => client.__channels.get(id) ?? null,
        cache: client.__channels,
      },
      client,
    },
    mentions: {
      members: { first: () => over.mentionedMember ?? null },
      users: new Map([[client.user.id, client.user]]),
    },
    reply: async (payload: any) => {
      replies.push(typeof payload === "string" ? { content: payload } : payload);
      // handlePing trả lời 2 bước: reply("Đang đo…") rồi sent.edit("Pong …").
      return {
        edit: async (p: any) => {
          replies.push(typeof p === "string" ? { content: p } : p);
          return {};
        },
        delete: async () => {},
      };
    },
    delete: async () => {},
  };
  message.channel = {
    id: over.channelId ?? "c1",
    name: "chung",
    isTextBased: () => true,
    isDMBased: () => false,
    send: async (p: any) =>
      void client.__sents.push({ channelId: over.channelId ?? "c1", payload: p }),
    bulkDelete: async (n: number) => {
      client.__bulkDeleted.push(n);
      return { size: n };
    },
    guild: message.guild,
    client,
  };
  return { message, replies };
}

/** interaction giả khớp cách dispatcher + slash handlers dùng. */
function makeInteraction(client: any, path: string[], opts: Row = {}) {
  const replies: any[] = [];
  const member = opts.member ?? makeMember({ manageGuild: true });
  const interaction: any = {
    commandName: path[0],
    // Dispatcher kiểm tra isButton() / isModalSubmit() TRƯỚC khi vào nhánh
    // chat input. discord.js luôn có đủ các predicate này trên Interaction —
    // mock thiếu thì handler gọi tới sẽ ném TypeError.
    isButton: () => false,
    isModalSubmit: () => false,
    // Dispatcher kiểm tra autocomplete TRƯỚC cả chat input (discord.js luôn có).
    isAutocomplete: () => false,
    isChatInputCommand: () => true,
    isDMBased: () => false,
    guild: {
      id: GID,
      name: "Server Thật",
      members: { me: { id: "bot1", permissions: { has: () => true } } },
      roles: { cache: new Map() },
      channels: {
        fetch: async (id: string) => client.__channels.get(id) ?? null,
        cache: client.__channels,
      },
      client,
    },
    member,
    user: { id: member.id, username: member.user.username, tag: member.user.tag },
    options: {
      getSubcommand: () => (path.length >= 2 ? path[1] : null),
      getSubcommandGroup: () => null,
      getString: (name: string) =>
        (opts.values ?? []).find((v: any) => v.name === name)?.value ?? null,
      getInteger: (name: string) =>
        (opts.values ?? []).find((v: any) => v.name === name)?.value ?? null,
      getMember: (name: string) => (opts.members ?? {})[name] ?? null,
      getChannel: (name: string) => (opts.channels ?? {})[name] ?? null,
      getRole: (name: string) => (opts.roles ?? {})[name] ?? null,
    },
    reply: async (payload: any) => {
      replies.push(typeof payload === "string" ? { content: payload } : payload);
      return {};
    },
    editReply: async (payload: any) => {
      replies.push(typeof payload === "string" ? { content: payload } : payload);
      return {};
    },
    deferReply: async () => {},
    replied: false,
    deferred: false,
  };
  return { interaction, replies };
}

function newClient(extra: Row = {}) {
  return {
    user: { id: "bot1", username: "Protogon", displayAvatarURL: () => null },
    ws: { ping: 42 },
    __channels: new Map<string, any>(),
    __sents: [] as { channelId: string; payload: any }[],
    __bulkDeleted: [] as number[],
    ...extra,
  };
}

(async () => {
  console.log("\n═══ HỢP ĐỒNG: dispatcher biết đủ mọi lệnh đã đăng ký ═══");
  {
    // Mọi lệnh trong slash.js phải nằm trong switch của onInteractionCreate
    // (danh sách case "…") — lệnh đăng ký mà không có route là chết câm.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("../bot/src/handlers/interactionCreate.js", import.meta.url), "utf8"),
    );
    const cases = new Set([...src.matchAll(/case "([a-z]+)"/g)].map((m) => m[1]));
    const missing = slashDefs.filter((c) => !cases.has(c.name));
    check(
      `slash.js đăng ký ${slashDefs.length} lệnh — tất cả có case trong dispatcher`,
      missing.length === 0,
    );
    // Đối xứng: mọi handler prefix export đều là hàm (không thiếu module).
    const fnCount = Object.values(prefixCommands).filter((v) => typeof v === "function").length;
    check(`prefix.js export ${fnCount} handler (tất cả là hàm)`, fnCount >= 25);
  }

  console.log("\n═══ PREFIX 1: !prefix set ^ → Convex thật → lệnh sau chạy prefix mới ═══");
  {
    const h = seed();
    const client = newClient();
    const store = makeStore();
    installHandlers(h);
    await store.getConfig(GID); // làm ấm cache (prefix "!")

    const warm = makeMessage(client, "!prefix", { member: makeMember({ manageGuild: true }) });
    await onMessageCreate(client, warm.message, store, {});
    check(
      "prefix không đối số → báo prefix hiện tại `!`",
      warm.replies[0]?.content?.includes("`!`"),
    );

    // Đổi prefix "^" (dispatcher thật → botUpdateSettings thật → invalidate).
    const set = makeMessage(client, "!prefix set ^", {
      member: makeMember({ manageGuild: true }),
    });
    await onMessageCreate(client, set.message, store, {});
    check("bot xác nhận đã đổi prefix", set.replies[0]?.content?.includes("^"));
    check(
      "DB ghi prefix mới + KHÔNG bump settingsChangedAt (bot tự ghi không cần tín hiệu)",
      h.rows("guilds")[0].prefix === "^" && h.rows("guilds")[0].settingsChangedAt === undefined,
    );

    // Lượt sau dùng prefix MỚI — dispatcher đọc config đã invalidate.
    const after = makeMessage(client, "^ping", { member: makeMember() });
    await onMessageCreate(client, after.message, store, {});
    check(
      "lệnh ^ping chạy ngay với prefix mới (2 tin: đo → kết quả)",
      after.replies.some((r: any) => r?.content?.includes("Pong")),
    );

    const old = makeMessage(client, "!ping", { member: makeMember() });
    await onMessageCreate(client, old.message, store, {});
    check("prefix cũ ! không còn kích hoạt lệnh", old.replies.length === 0);

    // Prefix rác → bot từ chối, DB không đổi (lệnh qua prefix MỚI ^).
    const bad = makeMessage(client, "^prefix set abc", {
      member: makeMember({ manageGuild: true }),
    });
    await onMessageCreate(client, bad.message, store, {});
    check("prefix rác → từ chối", bad.replies[0]?.content?.includes("Prefix"));
    check("prefix rác không ghi DB", h.rows("guilds")[0].prefix === "^");
  }

  console.log("\n═══ PREFIX 2: !autoreply add → Convex thật → bot trả lời theo rule ═══");
  {
    const h = seed();
    const client = newClient();
    const store = makeStore();
    installHandlers(h);

    const denied = makeMessage(client, "!autoreply add chao keyword hi | Xin chào!", {
      member: makeMember(),
    });
    await onMessageCreate(client, denied.message, store, {});
    check("thiếu quyền → từ chối", denied.replies[0]?.content?.includes("Quản lý server"));
    check("không ghi rule khi thiếu quyền", h.rows("autoReplies").length === 0);

    const add = makeMessage(client, "!autoreply add chao keyword hi,hello | Xin chào {user}!", {
      member: makeMember({ manageGuild: true }),
    });
    await onMessageCreate(client, add.message, store, {});
    check("thêm rule thành công", add.replies[0]?.content?.includes("chao"));
    check("rule ghi vào bảng autoReplies (Convex thật)", h.rows("autoReplies").length === 1);

    // Người dùng gõ "hello" → auto reply khớp + fill {user}.
    const chat = makeMessage(client, "hello cả nhà", { member: makeMember() });
    await onMessageCreate(client, chat.message, store, {});
    check(
      "bot trả lời theo rule vừa thêm ({user} được fill)",
      chat.replies[0]?.content === "Xin chào <@u1>!",
    );

    const rm = makeMessage(client, "!autoreply remove chao", {
      member: makeMember({ manageGuild: true }),
    });
    await onMessageCreate(client, rm.message, store, {});
    check("xóa rule thành công", rm.replies[0]?.content?.includes("chao"));
    const chat2 = makeMessage(client, "hello lần nữa", { member: makeMember() });
    await onMessageCreate(client, chat2.message, store, {});
    check("rule đã xóa → bot im lặng", chat2.replies.length === 0);
  }

  console.log("\n═══ PREFIX 3: antinuke/lockdown/badword/backup — quyền + Convex thật ═══");
  {
    const h = seed();
    const client = newClient();
    const store = makeStore();
    installHandlers(h);

    const den = makeMessage(client, "!antinuke on", { member: makeMember() });
    await onMessageCreate(client, den.message, store, {});
    check("antinuke on thiếu quyền → chặn", den.replies[0]?.content?.includes("Quản lý server"));

    const on = makeMessage(client, "!antinuke on", { member: makeMember({ manageGuild: true }) });
    await onMessageCreate(client, on.message, store, {});
    check("antinuke on đủ quyền → bật", on.replies[0]?.content?.includes("bật"));
    check("antinukeEnabled ghi thật vào guild", h.rows("guilds")[0].antinukeEnabled === true);

    const mod = makeMessage(client, "!antinuke module massBan off", {
      member: makeMember({ manageGuild: true }),
    });
    await onMessageCreate(client, mod.message, store, {});
    check("module massBan tắt", mod.replies[0]?.content?.includes("tắt"));
    check("antinukeModules ghi thật", h.rows("antinukeModules")[0].enabled === false);

    const lock = makeMessage(client, "!lockdown off", {
      member: makeMember({ manageGuild: true }),
    });
    await onMessageCreate(client, lock.message, store, {});
    check("lockdown off xác nhận", lock.replies[0]?.content?.includes("tắt"));
    check("lockdownEnabled ghi thật", h.rows("guilds")[0].lockdownEnabled === false);

    const bad = makeMessage(client, "!badword add  ChửiThề ", {
      member: makeMember({ manageGuild: true }),
    });
    await onMessageCreate(client, bad.message, store, {});
    check("badword add thành công", bad.replies[0]?.content?.includes("Đã thêm"));
    check(
      "từ được chuẩn hóa lowercase khi ghi DB",
      h.rows("guilds")[0].badWords?.includes("chửithề"),
    );

    const bk = makeMessage(client, "!backup now", {
      member: makeMember({ manageGuild: true }),
    });
    await onMessageCreate(client, bk.message, store, {});
    check("backup now xác nhận", bk.replies[0]?.content?.includes("backup"));
    check("cờ backupRequested ghi thật", h.rows("guilds")[0].backupRequested === true);

    // Xuyên tầng: tick thật nhặt job backup từ cờ lệnh vừa đặt.
    const jobs = await (getPendingJobs as any)._handler(h.ctx, { botKey: BOT_KEY });
    check(
      "bot_tick:getPendingJobs trả job backup từ cờ lệnh vừa đặt",
      jobs.backups.some((b: any) => b.kind === "backup"),
    );
  }

  console.log("\n═══ Quy tắc giữ bản: !backup keep + /backup keep — mutation Convex thật ═══");
  {
    // Đối xứng 2 lối vào cùng một tính năng: lệnh chat và lệnh slash phải cho
    // ra CÙNG một kết quả trong DB, và lệnh slash phải được đăng ký thật.
    const h = seed();
    const client = newClient();
    const store = makeStore();
    installHandlers(h);

    const chat = makeMessage(client, "!backup keep 7 30", {
      member: makeMember({ manageGuild: true }),
    });
    await onMessageCreate(client, chat.message, store, {});
    check(
      "!backup keep báo đã đặt quy tắc",
      chat.replies[0]?.content?.includes("7") && chat.replies[0]?.content?.includes("30"),
      chat.replies[0]?.content,
    );
    check(
      "!backup keep ghi thật backupKeepCount/backupKeepDays",
      h.rows("guilds")[0].backupKeepCount === 7 && h.rows("guilds")[0].backupKeepDays === 30,
      JSON.stringify({
        c: h.rows("guilds")[0].backupKeepCount,
        d: h.rows("guilds")[0].backupKeepDays,
      }),
    );

    // Slash: đổi số bản, bỏ trống ngày → phải GIỮ NGUYÊN 30 ngày đã đặt.
    const slash = makeInteraction(client, ["backup", "keep"], {
      values: [
        { name: "count", value: 10 },
        { name: "days", value: null },
      ],
    });
    await onInteractionCreate(client, slash.interaction, store, {});
    check(
      "/backup keep báo đúng quy tắc sau khi chạy",
      slash.replies[0]?.content?.includes("10") && slash.replies[0]?.content?.includes("30"),
      slash.replies[0]?.content,
    );
    check(
      "/backup keep đổi số bản và GIỮ NGUYÊN quy tắc tuổi",
      h.rows("guilds")[0].backupKeepCount === 10 && h.rows("guilds")[0].backupKeepDays === 30,
      JSON.stringify({
        c: h.rows("guilds")[0].backupKeepCount,
        d: h.rows("guilds")[0].backupKeepDays,
      }),
    );
    check(
      "/backup keep có trong danh sách lệnh đăng ký",
      slashDefs.some(
        (c: any) => c.name === "backup" && c.options?.some((o: any) => o.name === "keep"),
      ),
    );

    // Không có quyền quản lý → từ chối, DB không đổi.
    const before = h.rows("guilds")[0].backupKeepCount;
    const noPerm = makeInteraction(client, ["backup", "keep"], {
      member: makeMember({ manageGuild: false }),
      values: [{ name: "count", value: 3 }],
    });
    await onInteractionCreate(client, noPerm.interaction, store, {});
    check(
      "/backup keep không có quyền → từ chối, DB không đổi",
      h.rows("guilds")[0].backupKeepCount === before,
      String(h.rows("guilds")[0].backupKeepCount),
    );
  }

  console.log("\n═══ SLASH 1: /prefix set + /autoreply — cùng mutation Convex thật ═══");
  {
    const h = seed();
    const client = newClient();
    const store = makeStore();
    installHandlers(h);

    const bad = makeInteraction(client, ["prefix"], {
      values: [{ name: "set", value: "abc" }],
    });
    await onInteractionCreate(client, bad.interaction, store, {});
    check("prefix rác → từ chối tại bot", bad.replies[0]?.content?.includes("Prefix"));
    check("prefix rác KHÔNG ghi DB", h.rows("guilds")[0].prefix === "!");

    const ok = makeInteraction(client, ["prefix"], {
      values: [{ name: "set", value: "$" }],
    });
    await onInteractionCreate(client, ok.interaction, store, {});
    check("/prefix set $ thành công", ok.replies[0]?.content?.includes("$"));
    check("prefix ghi thật vào guild", h.rows("guilds")[0].prefix === "$");

    const ar = makeInteraction(client, ["autoreply", "add"], {
      values: [
        { name: "name", value: "welcome" },
        { name: "trigger", value: "keyword" },
        { name: "response", value: "Chào {user}" },
        { name: "keywords", value: "chào,hi" },
      ],
    });
    await onInteractionCreate(client, ar.interaction, store, {});
    check("/autoreply add thành công", ar.replies[0]?.content?.includes("welcome"));
    check("rule ghi thật (Convex thật)", h.rows("autoReplies").length === 1);

    const list = makeInteraction(client, ["autoreply", "list"], {});
    await onInteractionCreate(client, list.interaction, store, {});
    check(
      "/autoreply list hiển thị rule",
      list.replies[0]?.embeds?.[0]?.data?.description?.includes("welcome") ||
        list.replies[0]?.embeds?.[0]?.description?.includes("welcome"),
    );

    const den = makeInteraction(client, ["autoreply", "add"], {
      member: makeMember(),
      values: [
        { name: "name", value: "x" },
        { name: "trigger", value: "mention" },
        { name: "response", value: "y" },
      ],
    });
    await onInteractionCreate(client, den.interaction, store, {});
    check(
      "/autoreply add thiếu quyền → needPerm",
      den.replies[0]?.content?.includes("Quản lý server"),
    );
  }

  console.log("\n═══ SLASH 2: /mod timeout — modTools thật + case log + webhook thật ═══");
  {
    const h = seed();
    const client = newClient();
    client.__channels.set("c_log", makeLogChannel("c_log", "log", client));
    const store = makeStore();
    installHandlers(h);
    webhookHub.init(client, store); // production: index.js gọi init khi online

    const target = makeMember({ id: "u_target", username: "badactor" });
    const it = makeInteraction(client, ["mod", "timeout"], {
      values: [
        { name: "duration", value: "10m" },
        { name: "reason", value: "spam" },
      ],
      members: { user: target },
    });
    await onInteractionCreate(client, it.interaction, store, {});
    check("/mod timeout trả lời thành công", it.replies[0]?.content?.includes("timeout"));
    check(
      "botRecordModAction ghi case thật (case số 1)",
      h.rows("modActions").length === 1 && h.rows("modActions")[0].caseNumber === 1,
    );
    check(
      "case log tới kênh log (webhook mặc định hoặc kênh thường)",
      client.__sents.some((s: any) => s.channelId === "c_log"),
    );

    // Lệnh thứ hai → số case tăng dần (không reset).
    const it2 = makeInteraction(client, ["mod", "timeout"], {
      values: [{ name: "duration", value: "5m" }],
      members: { user: target },
    });
    await onInteractionCreate(client, it2.interaction, store, {});
    check(
      "case số 2 tăng dần đúng",
      h.rows("modActions").length === 2 && h.rows("modActions")[1].caseNumber === 2,
    );

    // Thiếu quyền mod → needPerm, không ghi case.
    const den = makeInteraction(client, ["mod", "timeout"], {
      member: makeMember(),
      values: [{ name: "duration", value: "10m" }],
      members: { user: target },
    });
    await onInteractionCreate(client, den.interaction, store, {});
    check(
      "thiếu quyền → needPerm, không ghi case",
      den.replies[0]?.content?.includes("Quản lý server") && h.rows("modActions").length === 2,
    );
  }

  console.log(`\n${pass}/${pass + fail} ✅`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("\n❌ suite crashed:", e);
  process.exit(1);
});
