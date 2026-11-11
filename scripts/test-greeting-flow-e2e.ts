/**
 * test-greeting-flow-e2e.ts — LUỒNG CHÀO/TẠM BIỆT THẬT, chạy xuyên cả 3 tầng.
 *
 * Đối xứng với test-backup-flow-e2e.ts: backup đã có luồng e2e xuyên tầng, còn
 * welcome/goodbye từng chỉ được test RỜI TỪNG TẦNG (test-welcome-goodbye.cjs:
 * handler bot với discord.js giả; test-greeting-preview.ts: tokenizer web;
 * test-welcome-card.ts: canvas). Khoảng trống nguy hiểm nhất nằm ở KHỚP NỐI:
 *
 *   dashboard (updateSettings thật, bump settingsChangedAt)
 *     → bot_tick:getPendingJobs thật (settingsChanges)
 *     → tick.js runTickOnce thật (applySettingsChanges → store.invalidate)
 *     → ConvexStore thật (getConfig cache TTL 90 phút)
 *     → guilds:getBotConfig thật (đọc doc guild)
 *     → welcome.js handleWelcome/handleGoodbye thật
 *     → thẻ PNG vẽ bằng @napi-rs/canvas THẬT + font nhúng
 *     → gửi kênh / DM / autorole
 *
 * Bug thật 23/09/2026 đúng nằm ở khớp nối này: bật welcome trên dashboard xong
 * bot IM LẶNG tới 30 phút vì cache getConfig không được xoá. Suite rời tầng
 * không bao giờ bắt được lỗi đó — chỉ luồng xuyên tầng mới thấy.
 *
 * "Convex giả" chỉ là ctx.db trên Map (patch tạo phiên bản mới như Convex thật)
 * — mọi handler Convex (guilds.updateSettings, bot_tick, bot_writes.botLockState,
 * botAuth) và MỌI dòng của bot (ConvexStore, tick, welcome.js) đều là code
 * production. Không mạng, không Discord thật.
 *
 * Chạy: bun scripts/test-greeting-flow-e2e.ts
 */

import {
  updateSettings,
  getBotConfig,
  saveGreetingImage,
  removeGreetingImage,
} from "../convex/guilds";
import { botLockState } from "../convex/bot_writes";
import { getPendingJobs } from "../convex/bot_tick";
import { computeBotKey } from "../convex/botAuth";

import { createRequire } from "node:module";
/** Bot là CommonJS — nạp module THẬT của production qua createRequire. */
const botRequire = createRequire(new URL("../bot/src/index.js", import.meta.url));
const ConvexStore = botRequire("../src/convex.js") as any; // store thật: cache TTL + proxy botKey
const tickMod = botRequire("../src/tick.js") as any; // runTickOnce + applySettingsChanges thật
const welcomeMod = botRequire("../src/handlers/welcome.js") as any; // handleWelcome/Goodbye thật
const cardMod = botRequire("../src/handlers/welcomeCard.js") as any; // CARD_W/H + canvas thật
const canvas = botRequire("@napi-rs/canvas") as any;

const GID = "123456789012345678";
const TOKEN = "session-token-dashboard-thật";
const BOT_KEY = "key-thô-32-bytes-của-bot";
const OWNER_ID = "100000000000000001";

// Store thật đọc BOT_KEY từ env lúc constructor — đặt TRƯỚC khi nạp module để
// ensureBotKey() trả ngay (không bootstrap ra mạng). CONVEX_URL chỉ được lưu,
// không bao giờ gọi thật (client bị patch hết trong test này).
process.env.BOT_KEY = BOT_KEY;
process.env.CONVEX_URL = process.env.CONVEX_URL || "https://e2e-greeting-test.convex.cloud";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean) => {
  console.log(ok ? `  ✅ ${label}` : `  ❌ ${label}`);
  if (ok) pass++;
  else fail++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

  /** File storage giả: id → { bytes, contentType, size } — cho luồng upload ảnh. */
  const storage = new Map<string, { bytes: Buffer; contentType: string; size: number }>();
  let storageIdc = 0;
  const deletedStorage: string[] = [];

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
        // Convex: document là snapshot bất biến — patch tạo phiên bản mới, tham
        // chiếu cũ (vd `guild` trong handler) giữ giá trị TRƯỚC patch. Bài học
        // từ test-backup-flow-e2e (24/09/2026): mutate in-place làm handler đọc
        // lại field vừa xoá → nhánh bảo vệ bị bỏ qua (lỗi giả).
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
    ctx: {
      db,
      storage: {
        getUrl: async (id: string) =>
          storage.has(id) ? `https://cloud.example/api/storage/${id}` : null,
        delete: async (id: string) => {
          storage.delete(id);
          deletedStorage.push(id);
        },
        generateUploadUrl: async () => "https://upload.example/convex",
        getMetadata: async (id: string) => {
          const f = storage.get(id);
          return f ? { contentType: f.contentType, size: f.size } : null;
        },
      },
    },
    /** Tải file lên storage giả — id trả về là chuỗi "st_<n>". */
    putStorage(bytes: Buffer, contentType: string) {
      const id = `st_${++storageIdc}`;
      storage.set(id, { bytes, contentType, size: bytes.length });
      return id;
    },
    /** Danh sách ID file đã bị xoá — test dùng để khẳng định dọn ảnh không rò rỉ. */
    deletedStorage,
    rows: rowsOf,
    tables,
  };
}

/** Seed tối thiểu: botStatus (botKeySeed) + user/session dashboard + guild trống. */
function seed() {
  const h = makeCtx();
  h.rows("botStatus").push({
    _id: "st",
    kind: "status",
    botKeySeed: computeBotKey(BOT_KEY),
    online: true,
  });
  h.rows("users").push({ _id: "u_x", discordId: OWNER_ID, manageableGuildIds: [GID] });
  h.rows("sessions").push({
    _id: "s1",
    token: TOKEN,
    userId: "u_x",
    createdAt: Date.now(),
    // Phiên mới phải có marker authVersion — legacy session bị từ chối (isCurrentSession).
    authVersion: 1,
  });
  h.rows("guilds").push({
    _id: "g1",
    discordId: GID,
    name: "Server Thật",
    botInGuild: true,
    // managers không còn cấp quyền (chỉ hiển thị) — quyền đến từ
    // manageableGuildIds của user, được Discord xác nhận lúc đăng nhập.
    managers: [OWNER_ID],
  });
  return h;
}

// ───────────────────────────── Discord client giả ───────────────────────────
function makeDiscordClient(opts: { noPerms?: boolean } = {}) {
  const sents: { channelId: string; payload: any }[] = [];
  const dms: any[] = [];
  const channel = (id: string, name: string) => ({
    id,
    name,
    isTextBased: () => true,
    send: async (payload: any) => {
      sents.push({ channelId: id, payload });
      return {};
    },
  });
  const channels = new Map([
    ["c1", channel("c1", "chung")],
    ["c2", channel("c2", "tạm-biệt")],
  ]);
  const guild = {
    id: GID,
    name: "Server Thật",
    memberCount: 128,
    preferredLocale: "vi-VN",
    members: {
      me: {
        permissionsIn: () => ({ has: () => !opts.noPerms }),
      },
    },
  };
  const client = {
    channels: {
      fetch: async (id: string) => channels.get(id) ?? null,
      cache: { get: (id: string) => channels.get(id) ?? null },
    },
    guilds: { cache: { get: (id: string) => (id === GID ? guild : null) } },
  };
  // member.send ghi DM vào guild.__dms — makeMember nhận guild nên gắn tại đây
  // (bài học 24/09/2026: gắn __dms trên client làm member.send ném lỗi và luồng
  // DM bị nuốt im lặng theo đúng best-effort của production → fail giả).
  (client as any).__sents = sents;
  (guild as any).__dms = dms;
  return { client, sents, dms, guild };
}

function makeMember(guild: any, over: Row = {}) {
  const roleAdds: { memberId: string; roleId: string; reason?: string }[] = [];
  const member: any = {
    id: "u1",
    displayName: "Wio",
    user: { bot: false, username: "wio", createdTimestamp: Date.now() - 365 * 86_400_000 },
    guild,
    roles: {
      add: async (roleId: string, reason?: string) =>
        void roleAdds.push({ memberId: "u1", roleId, reason }),
    },
    send: async (payload: any) => void (guild as any).__dms.push(payload),
    displayAvatarURL: () => null, // không avatar → canvas vẽ vòng tròn mặc định
    ...over,
  };
  return { member, roleAdds };
}

// ───── Store thật + patch tầng HTTP để gọi thẳng handler Convex giả ─────
/**
 * Dùng ConvexStore THẬT của bot NGUYÊN VẸN (cache TTL 90 phút, proxy chèn
 * botKey, TỰ xoá cache sau khi bot tự ghi cấu hình qua CONFIG_WRITE_MUTATIONS,
 * retry). Patch nằm ở TẦNG DƯỚI NHẤT — ConvexHttpClient.prototype — tức dưới
 * proxy của store, nên mọi logic production chạy như trên VPS; test KHÔNG tự
 * sao chép danh sách mutation cấu hình nào (tránh trôi khi prod thêm mới).
 * Bài học 24/09/2026: thay store.client bằng Proxy riêng làm MẤT logic tự xoá
 * cache của production → luồng RAID-SAVE fail giả.
 */
let ACTIVE: { ctx: any; handlers: Record<string, Record<string, any>> } | null = null;
/** Lưu ý SSRF cho fetch mock — dùng chung khi test luồng ảnh nền (luồng 6). */
let ALLOW_FETCH_HTTPS = false;
let FAIL_FETCH = false;

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

/** Bảng function Convex thật mà luồng này được gọi (đủ hợp đồng bot ⇄ Convex). */
function installHandlers(h: ReturnType<typeof seed>) {
  ACTIVE = {
    ctx: h.ctx,
    handlers: {
      query: {
        "guilds:getBotConfig": getBotConfig,
        "bot_tick:getPendingJobs": getPendingJobs,
      },
      mutation: {
        "bot_writes:botLockState": botLockState,
        "guilds:saveGreetingImage": saveGreetingImage,
        "guilds:removeGreetingImage": removeGreetingImage,
      },
    },
  };
}

/**
 * Chuỗi sự kiện production: dashboard lưu cấu hình → tick chạy 1 lượt (tín hiệu
 * settingsChangedAt → xoá cache) → bot đọc lại config PHẢI thấy giá trị mới.
 * Trả config mới — đây chính là cổng bắt bug "bật welcome xong bot im lặng".
 */
async function applyDashboard(h: ReturnType<typeof seed>, store: any, client: any, args: Row) {
  await sleep(3); // đảm bảo settingsChangedAt tăng (settingsSeen so ≥, cùng ms sẽ bị bỏ qua)
  const res = await (updateSettings as any)._handler(h.ctx, {
    token: TOKEN,
    guildId: GID,
    ...args,
  });
  if (!res?.ok) throw new Error("updateSettings thất bại — seed sai quyền?");
  await tickMod.runTickOnce(client, store);
  return store.getConfig(GID);
}

(async () => {
  console.log("\n═══ LUỒNG 1: dashboard bật welcome → tín hiệu → cache mới → chào thật ═══");
  {
    const h = seed();
    const { client, sents, guild } = makeDiscordClient();
    const store = makeStore();
    installHandlers(h);

    // Làm ấm cache như bot thật (prewarmConfigs): cache giờ giữ config v0.
    const v0 = await store.getConfig(GID);
    check("config ban đầu: welcome TẮT (mặc định an toàn)", v0.welcomeEnabled === false);

    // Dashboard bật welcome → tick → đọc lại phải thấy MỚI (cache đã bị xoá).
    const v1 = await applyDashboard(h, store, client, {
      welcomeEnabled: true,
      welcomeChannelId: "c1",
      welcomeMessage: "Chào mừng {username} tới **{server}**",
    });
    check("bot thấy welcomeEnabled=true ngay sau 1 tick", v1.welcomeEnabled === true);
    check("kênh gửi đúng cấu hình dashboard", v1.welcomeChannelId === "c1");

    // Thành viên join → chào đi đúng kênh, đúng nội dung, không ping lung tung.
    const { member } = makeMember(guild);
    await welcomeMod.handleWelcome(client, store, member);
    check("đúng 1 tin nhắn chào được gửi", sents.length === 1);
    check("gửi vào đúng kênh cấu hình", sents[0]?.channelId === "c1");
    check(
      "mention thành viên trong content (embed mode mặc định)",
      sents[0]?.payload?.content === "<@u1>",
    );
    check(
      "placeholder {username}/{server} được thay trong embed",
      sents[0]?.payload?.embeds?.[0]?.data?.description === "Chào mừng wio tới **Server Thật**",
    );
    check(
      "allowedMentions KHÔNG cho parse mọi thứ (chống @everyone từ nội dung)",
      sents[0]?.payload?.allowedMentions?.parse?.length === 0 &&
        Array.isArray(sents[0]?.payload?.allowedMentions?.users),
    );

    // Dashboard TẮT welcome → tick → join tiếp phải im lặng (không chào ma).
    await applyDashboard(h, store, client, { welcomeEnabled: false });
    await welcomeMod.handleWelcome(client, store, makeMember(guild).member);
    check("tắt welcome xong bot im lặng ngay (không chào bằng config cũ)", sents.length === 1);
  }

  console.log("\n═══ LUỒNG 2: thẻ PNG thật + goodbye + DM riêng + autorole ═══");
  {
    const h = seed();
    const { client, sents, dms, guild } = makeDiscordClient();
    const store = makeStore();
    installHandlers(h);

    await applyDashboard(h, store, client, {
      welcomeEnabled: true,
      welcomeChannelId: "c1",
      welcomeMessage: "Chào {username}!",
      welcomeCardEnabled: true,
      welcomeEmbedColor: "#57f287",
      // Ảnh banner tĩnh — thẻ PNG vẽ riêng PHẢI THẮNG ảnh này trong embed.
      welcomeEmbedImage: "https://cdn.example/banner.png",
      welcomeDmEnabled: true,
      welcomeDmMessage: "Chào riêng {username} nhé",
      autoroleEnabled: true,
      autoroleRoleId: "999999999999999999",
      autoroleDelaySec: 0,
      goodbyeEnabled: true,
      goodbyeChannelId: "c2",
      goodbyeMessage: "Tạm biệt {username}",
      goodbyeUseEmbed: false,
    });

    const { member, roleAdds } = makeMember(guild);
    await welcomeMod.handleWelcome(client, store, member);
    check("welcome gửi đúng 1 tin vào kênh", sents.length === 1);

    const files = sents[0]?.payload?.files ?? [];
    check("thẻ PNG đính kèm dạng attachment (không phải URL ngoài)", files.length === 1);
    check("attachment tên đúng CARD_FILE_NAME", files[0]?.name === cardMod.CARD_FILE_NAME);
    const png: Buffer | undefined = files[0]?.attachment;
    check(
      "attachment là Buffer PNG hợp lệ",
      !!png && png.slice(0, 8).toString("hex") === "89504e470d0a1a0a",
    );
    const img = await canvas.loadImage(png!);
    check(
      `kích thước thẻ đúng ${cardMod.CARD_W}×${cardMod.CARD_H}`,
      img.width === cardMod.CARD_W && img.height === cardMod.CARD_H,
    );
    check(
      "embed trỏ ảnh vào attachment:// (Discord mới hiển thị được)",
      sents[0]?.payload?.embeds?.[0]?.data?.image?.url === `attachment://${cardMod.CARD_FILE_NAME}`,
    );
    check(
      "thẻ PNG THẮNG banner tĩnh (welcomeEmbedImage bị bỏ qua)",
      sents[0]?.payload?.embeds?.[0]?.data?.image?.url !== "https://cdn.example/banner.png",
    );
    check(
      "màu embed theo cấu hình #57f287",
      sents[0]?.payload?.embeds?.[0]?.data?.color === 0x57f287,
    );

    // DM riêng + autorole (delay 0 → đợi microtask setTimeout).
    await sleep(20);
    check(
      "DM riêng gửi đúng nội dung đã fill placeholder",
      dms.length === 1 && dms[0]?.content === "Chào riêng wio nhé",
    );
    check(
      "autorole cấp đúng role cấu hình",
      roleAdds.length === 1 && roleAdds[0]?.roleId === "999999999999999999",
    );

    // Rời server → goodbye plain mode (tắt embed → content trực tiếp).
    await welcomeMod.handleGoodbye(client, store, member);
    check("goodbye gửi vào kênh riêng", sents.length === 2 && sents[1]?.channelId === "c2");
    check(
      "goodbye plain mode: content trực tiếp, không embed",
      sents[1]?.payload?.content === "Tạm biệt wio" && !sents[1]?.payload?.embeds,
    );
  }

  console.log(
    "\n═══ LUỒNG 3: template ngẫu nhiên — mỗi lượt chọn 1 dòng, không rơi về mặc định ═══",
  );
  {
    const h = seed();
    const { client, sents, guild } = makeDiscordClient();
    const store = makeStore();
    installHandlers(h);

    await applyDashboard(h, store, client, {
      welcomeEnabled: true,
      welcomeChannelId: "c1",
      welcomeMessage: "Câu gốc bị thay thế",
      welcomeRandom: "Câu A {user}\nCâu B {username}",
      welcomeUseEmbed: false,
    });

    for (let i = 0; i < 20; i++) {
      await welcomeMod.handleWelcome(client, store, makeMember(guild).member);
    }
    check("20 lượt join → 20 tin nhắn chào", sents.length === 20);
    const contents = sents.map((s) => s.payload?.content as string);
    check(
      "KHÔNG lượt nào gửi câu gốc hay câu mặc định (preview và bot khớp nhau)",
      contents.every((c) => c !== "Câu gốc bị thay thế"),
    );
    check(
      "cả 2 dòng mẫu đều xuất hiện qua các lượt (bot chọn ngẫu nhiên thật)",
      contents.some((c) => c === "Câu A <@u1>") && contents.some((c) => c === "Câu B wio"),
    );
  }

  console.log("\n═══ LUỒNG 4: đủ hàng rào an toàn — tắt/thiếu kênh/bot/thiếu quyền ═══");
  {
    const h = seed();
    const { client, sents, guild } = makeDiscordClient();
    const store = makeStore();
    installHandlers(h);

    // 4a. Mặc định tắt → join không chào.
    await welcomeMod.handleWelcome(client, store, makeMember(guild).member);
    check("4a: welcome tắt mặc định → không gửi", sents.length === 0);

    // 4b. Bật nhưng chưa chọn kênh → không gửi (không crash).
    await applyDashboard(h, store, client, { welcomeEnabled: true });
    await welcomeMod.handleWelcome(client, store, makeMember(guild).member);
    check("4b: bật nhưng thiếu kênh → bỏ qua im lặng", sents.length === 0);

    // 4c. Bot join → không chào (chống vòng lặp bot chào bot).
    await applyDashboard(h, store, client, {
      welcomeEnabled: true,
      welcomeChannelId: "c1",
      welcomeMessage: "hi",
    });
    const botJoin = makeMember(guild, {
      id: "b1",
      user: { bot: true, username: "botbot" },
      displayName: "BotBot",
    });
    await welcomeMod.handleWelcome(client, store, botJoin.member);
    check("4c: bot join → không chào", sents.length === 0);
    check(
      "4c: bot join → không autorole (mặc định không cấp cho bot)",
      botJoin.roleAdds.length === 0,
    );

    // 4d. Thiếu quyền SendMessages → bỏ qua im lặng, không spam lỗi.
    const noPerms = makeDiscordClient({ noPerms: true });
    const store2 = makeStore();
    installHandlers(h);
    await welcomeMod.handleWelcome(noPerms.client, store2, makeMember(noPerms.guild).member);
    check("4d: thiếu quyền gửi → không gửi, không chết luồng", noPerms.sents.length === 0);
  }

  console.log("\n═══ LUỒNG 5: RAID-SAFE — bot tự ghi lockdown → cache tự xoá → chào im lặng ═══");
  {
    const h = seed();
    const { client, sents, dms, guild } = makeDiscordClient();
    const store = makeStore();
    installHandlers(h);

    await applyDashboard(h, store, client, {
      welcomeEnabled: true,
      welcomeChannelId: "c1",
      welcomeMessage: "Chào {username}",
      welcomeDmEnabled: true,
      welcomeDmMessage: "DM {username}",
    });
    const { member } = makeMember(guild);
    await welcomeMod.handleWelcome(client, store, member);
    check("chuẩn bị: chào + DM hoạt động bình thường", sents.length === 1 && dms.length === 1);

    // Bot TỰ khóa server (phản ứng raid): ghi qua store.client — proxy thật phải
    // tự xoá cache (CONFIG_WRITE_MUTATIONS) không cần tín hiệu dashboard.
    await store.client.mutation("bot_writes:botLockState", {
      guildId: GID,
      until: Date.now() + 120_000,
    });
    const fresh = await store.getConfig(GID);
    check(
      "cache TỰ mới sau khi bot tự ghi lockdown (proxy CONFIG_WRITE_MUTATIONS)",
      typeof fresh.lockdownUntil === "number" && fresh.lockdownUntil > Date.now(),
    );

    // Raid đang diễn ra → chào/DM/autorole phải IM LẶNG (không spam kênh, không cấp role).
    const raidJoin = makeMember(guild);
    await welcomeMod.handleWelcome(client, store, raidJoin.member);
    check("lockdown: KHÔNG chào vào kênh", sents.length === 1);
    check("lockdown: KHÔNG DM thành viên mới", dms.length === 1);
  }

  console.log("\n═══ LUỒNG 6: nền thẻ từ URL — canvas vẽ được + SSRF chặn nội bộ ═══");
  {
    // Chặn mạng thật: chỉ https://cdn.example/* trả PNG 1×1 hợp lệ; mọi URL
    // khác là lỗi test. CẢ DNS phải giả — assertSafeRemoteUrl phân giải host
    // TRƯỚC khi fetch, sandbox không có DNS → host nào cũng chết ở bước lookup.
    const realFetch = globalThis.fetch;
    const dnsMod = require("node:dns");
    const realLookup = dnsMod.promises.lookup;
    dnsMod.promises.lookup = async (host: string) => {
      if (host === "cdn.example") return [{ address: "93.184.216.34", family: 4 }];
      throw new Error(`test không cho phân giải host: ${host}`);
    };
    const PNG_1PX = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    globalThis.fetch = (async (url: any) => {
      const s = String(url);
      if (s.startsWith("https://cdn.example/") && ALLOW_FETCH_HTTPS)
        return new Response(PNG_1PX, { status: 200, headers: { "content-type": "image/png" } });
      throw new Error(`test không cho fetch thật: ${s}`);
    }) as typeof fetch;

    try {
      // 6a. Nền CDN hợp lệ → fetchImage nhận buffer PNG → thẻ vẫn vẽ được.
      ALLOW_FETCH_HTTPS = true;
      const okCard = await cardMod.renderCard({
        eyebrow: "CHÀO MỪNG",
        name: "Wio",
        meta: "Server Thật · Thành viên thứ 128",
        backgroundUrl: "https://cdn.example/bg.png",
        accent: "#57f287",
      });
      check("6a: nền CDN hợp lệ → thẻ vẫn vẽ ra PNG", Buffer.isBuffer(okCard));
      check(
        "6a: PNG đúng chữ ký + kích thước",
        okCard.slice(0, 8).toString("hex") === "89504e470d0a1a0a",
      );

      // 6b. SSRF: URL nội bộ bị assertSafeRemoteUrl chặn TRƯỚC cả khi fetch —
      // fetchImage trả null → renderCard rơi về gradient, KHÔNG crash.
      ALLOW_FETCH_HTTPS = false;
      const ssrf = await cardMod.renderCard({
        eyebrow: "CHÀO MỪNG",
        name: "Wio",
        meta: "Server",
        backgroundUrl: "http://169.254.169.254/latest/meta-data/",
        accent: "#5865f2",
      });
      check(
        "6b: URL nội bộ (SSRF) → không fetch, rơi về gradient, vẫn vẽ được",
        Buffer.isBuffer(ssrf),
      );
      const badHost = await cardMod.renderCard({
        eyebrow: "CHÀO MỪNG",
        name: "Wio",
        meta: "Server",
        backgroundUrl: "https://host-khong-ton-tai.example/bg.png",
        accent: "#5865f2",
      });
      check(
        "6b: host không phân giải được → fallback gradient, không chết",
        Buffer.isBuffer(badHost),
      );

      // 6c. Fetch chết hoàn toàn → thẻ vẫn vẽ (tin nhắn chào không bao giờ mất).
      FAIL_FETCH = true;
      const deadNet = await cardMod.renderCard({ eyebrow: "CHÀO", name: "Wio", meta: "S" });
      check("6c: mạng chết hoàn toàn → thẻ vẫn vẽ", Buffer.isBuffer(deadNet));
      FAIL_FETCH = false;
    } finally {
      globalThis.fetch = realFetch;
      dnsMod.promises.lookup = realLookup;
      ALLOW_FETCH_HTTPS = false;
    }
  }

  console.log("\n═══ LUỒNG 7: dashboard tải ảnh nền lên → bot dùng ảnh đó mỗi lượt join ═══");
  {
    const h = seed();
    const { client, sents, guild } = makeDiscordClient();
    const store = makeStore();
    installHandlers(h);

    // 7a. Upload ảnh vào ô welcomeCardBackground qua handler thật.
    const PNG_1PX = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    const id1 = h.putStorage(PNG_1PX, "image/png");
    await sleep(3);
    const saved = await (saveGreetingImage as any)._handler(h.ctx, {
      token: TOKEN,
      guildId: GID,
      storageId: id1,
      slot: "welcomeCardBackground",
    });
    check(
      "7a: saveGreetingImage lưu ảnh + trả URL công khai",
      saved.ok === true && saved.url === `https://cloud.example/api/storage/${id1}`,
    );
    check(
      "7a: tín hiệu settingsChangedAt được bump (bot áp dụng trong ~1 tick)",
      typeof h.rows("guilds")[0].settingsChangedAt === "number",
    );

    // 7b. Bot lái qua tick + join thật → thẻ vẽ bằng nền vừa tải lên.
    await applyDashboard(h, store, client, {
      welcomeEnabled: true,
      welcomeChannelId: "c1",
      welcomeMessage: "Chào {username}!",
      welcomeCardEnabled: true,
    });
    await welcomeMod.handleWelcome(client, store, makeMember(guild).member);
    const card = sents[0]?.payload?.files?.[0]?.attachment as Buffer | undefined;
    check("7b: thẻ PNG vẫn vẽ được với nền từ storage", Buffer.isBuffer(card));
    check(
      "7b: file gốc KHÔNG bị xoá sau khi bot đọc URL (chỉ dọn khi thay thế)",
      !h.deletedStorage.includes(id1),
    );

    // 7c. Thay ảnh mới → ảnh CŨ bị dọn khỏi storage (không rác vĩnh viễn).
    const id2 = h.putStorage(PNG_1PX, "image/png");
    await sleep(3);
    await (saveGreetingImage as any)._handler(h.ctx, {
      token: TOKEN,
      guildId: GID,
      storageId: id2,
      slot: "welcomeCardBackground",
    });
    check("7c: ảnh cũ bị xoá khỏi storage sau khi thay", h.deletedStorage.includes(id1));
    check("7c: ảnh mới còn sống", !h.deletedStorage.includes(id2));

    // 7d. Dùng lại CÙNG ảnh cho ô goodbye → thay ô welcome KHÔNG được xoá file
    // (người dùng có thể dùng chung một banner cho cả welcome lẫn goodbye).
    await (saveGreetingImage as any)._handler(h.ctx, {
      token: TOKEN,
      guildId: GID,
      storageId: id2,
      slot: "goodbyeCardBackground",
    });
    const d2 = h.deletedStorage.length;
    await sleep(3);
    const id3 = h.putStorage(PNG_1PX, "image/png");
    await (saveGreetingImage as any)._handler(h.ctx, {
      token: TOKEN,
      guildId: GID,
      storageId: id3,
      slot: "welcomeCardBackground",
    });
    check(
      "7d: file còn dùng ở ô goodbye KHÔNG bị xoá khi thay ô welcome",
      !h.deletedStorage.includes(id2) && h.deletedStorage.length === d2,
    );

    // 7e. Nút "Xoá ảnh" — xoá đúng ô, file bị dọn, ô còn lại giữ nguyên.
    await (removeGreetingImage as any)._handler(h.ctx, {
      token: TOKEN,
      guildId: GID,
      slot: "goodbyeCardBackground",
    });
    check("7e: removeGreetingImage dọn file ô goodbye", h.deletedStorage.includes(id2));
    check("7e: ô welcome KHÔNG bị đụng", h.rows("guilds")[0].welcomeCardBackground?.includes(id3));

    // 7f. Upload sai loại file → bị TỪ CHỐI + file bị drop ngay.
    const idTxt = h.putStorage(Buffer.from("không phải ảnh"), "text/plain");
    await sleep(3);
    let threw = "";
    try {
      await (saveGreetingImage as any)._handler(h.ctx, {
        token: TOKEN,
        guildId: GID,
        storageId: idTxt,
        slot: "welcomeEmbedImage",
      });
    } catch (e: any) {
      threw = e?.message ?? "";
    }
    check("7f: file text bị từ chối", threw.includes("ảnh"));
    check("7f: file sai loại bị drop khỏi storage", h.deletedStorage.includes(idTxt));

    // 7g. Xoá ảnh qua updateSettings (dashboard xoá URL trong ô) — file cũng
    // phải được dọn. Bug thật 24/09: phép kiểm tra "còn dùng ở ô khác" bao gồm
    // cả ô đang bị xoá → every() luôn false → file rác vĩnh viễn.
    const idDel = h.putStorage(PNG_1PX, "image/png");
    await sleep(3);
    await (saveGreetingImage as any)._handler(h.ctx, {
      token: TOKEN,
      guildId: GID,
      storageId: idDel,
      slot: "welcomeEmbedImage",
    });
    check(
      "7g: chuẩn bị — ảnh đã lưu vào ô welcomeEmbedImage",
      !!h.rows("guilds")[0].welcomeEmbedImage,
    );
    const dBefore = h.deletedStorage.length;
    await (updateSettings as any)._handler(h.ctx, {
      token: TOKEN,
      guildId: GID,
      welcomeEmbedImage: null, // dashboard xoá ảnh trong ô
    });
    check(
      "7g: xoá ảnh qua updateSettings dọn file storage",
      h.deletedStorage.includes(idDel) && h.deletedStorage.length > dBefore,
    );
    check("7g: ô bị xoá được đặt về trống", h.rows("guilds")[0].welcomeEmbedImage === undefined);
  }

  console.log("\n═══ LUỒNG 8: goodbye card — tạm biệt cũng có ảnh riêng ═══");
  {
    const h = seed();
    const { client, sents, guild } = makeDiscordClient();
    const store = makeStore();
    installHandlers(h);

    await applyDashboard(h, store, client, {
      goodbyeEnabled: true,
      goodbyeChannelId: "c2",
      goodbyeMessage: "Tạm biệt {username}",
      goodbyeCardEnabled: true,
      goodbyeEmbedColor: "#ed4245",
    });
    await welcomeMod.handleGoodbye(client, store, makeMember(guild).member);
    check("goodbye gửi đúng kênh", sents.length === 1 && sents[0]?.channelId === "c2");
    const files = sents[0]?.payload?.files ?? [];
    check("goodbye có thẻ PNG riêng", files.length === 1 && Buffer.isBuffer(files[0]?.attachment));
    check(
      "embed trỏ attachment đúng",
      sents[0]?.payload?.embeds?.[0]?.data?.image?.url === `attachment://${cardMod.CARD_FILE_NAME}`,
    );
    check(
      "màu goodbye theo cấu hình #ed4245",
      sents[0]?.payload?.embeds?.[0]?.data?.color === 0xed4245,
    );

    // Bot rời server → không gửi goodbye (bỏ qua bot — v1 giữ nguyên).
    const botLeave = makeMember(guild, { id: "b1", user: { bot: true, username: "botbot" } });
    await welcomeMod.handleGoodbye(client, store, botLeave.member);
    check("goodbye bỏ qua bot", sents.length === 1);
  }

  console.log("\n═══ LUỒNG 9: autorole trễ 1s + welcomeRandom có dòng rỗng ═══");
  {
    const h = seed();
    const { client, sents, guild } = makeDiscordClient();
    const store = makeStore();
    installHandlers(h);

    await applyDashboard(h, store, client, {
      welcomeEnabled: true,
      welcomeChannelId: "c1",
      welcomeMessage: "Câu gốc",
      // Dòng trống/dòng chỉ khoảng trắng bị bỏ — chỉ dòng có nội dung được chọn.
      welcomeRandom: "\n   \nDòng 1 {username}\n\nDòng 2 {username}\n",
      welcomeUseEmbed: false,
      autoroleEnabled: true,
      autoroleRoleId: "888888888888888888",
      autoroleDelaySec: 1, // trễ thật 1 giây
    });
    const { member, roleAdds } = makeMember(guild);
    await welcomeMod.handleWelcome(client, store, member);
    check("chào gửi ngay (autorole không chặn tin nhắn)", sents.length === 1);
    check("role CHƯA được cấp trước trễ 1s", roleAdds.length === 0);
    await sleep(1300);
    check(
      "role được cấp đúng sau trễ 1s",
      roleAdds.length === 1 && roleAdds[0]?.roleId === "888888888888888888",
    );
    check("nguyên nhân ghi rõ (Protogon autorole)", roleAdds[0]?.reason === "Protogon autorole");

    // welcomeRandom: 40 lượt — chỉ xuất hiện 1 trong 2 dòng thật, không có câu gốc/mặc định.
    const contents = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const before = sents.length;
      await welcomeMod.handleWelcome(client, store, makeMember(guild).member);
      contents.add((sents[before]?.payload?.content as string) ?? "");
    }
    const lines = [...contents].filter((c) => c.startsWith("Dòng"));
    check(
      "dòng trống bị bỏ — chỉ 2 dòng có nội dung xuất hiện qua 40 lượt",
      lines.length === 2 &&
        contents.has("Dòng 1 wio") &&
        contents.has("Dòng 2 wio") &&
        !contents.has("Câu gốc"),
    );
  }

  console.log(`\n${pass}/${pass + fail} ✅`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("\n❌ suite crashed:", e);
  process.exit(1);
});
