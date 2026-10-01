// TEST: bot/src/lockdown.js — khoá kênh khi bị raid.
// Chạy: node scripts/test-lockdown.cjs
//
// Vì sao suite này tồn tại: đây là CƠ CHẾ bảo vệ lúc server đang bị raid.
// Trước đây nó chỉ được gọi gián tiếp qua một vài test khác nên ~46% nhánh
// chưa từng chạy — mà nhánh chưa chạy ở đây là "bot thiếu quyền" và "kênh
// không sửa được overwrite", tức đúng lúc cần nhất thì im.
//
// ⚠️ `locked` là Set ở PHẠM VI MODULE, dùng chung cho mọi guild trong tiến
// trình bot. Mỗi case ở đây dùng guildId RIÊNG để không lẫn trạng thái —
// nếu không, một case để kẹt `locked` sẽ làm các case sau "tưởng đã khoá".
const path = require("path");
const DJS_MOCK = require("./support/djs-mock-path.cjs");
const Module = require("module");
const fs = require("fs");

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "discord.js") return DJS_MOCK;
  if (request === "./util" || request.endsWith(path.join("src", "util")))
    return path.join(__dirname, "_lockdown-util.cjs");
  return origResolve.call(this, request, ...args);
};
// Mock riêng: suite này từng KHÔNG tự ghi file mock mà dựa vào file do suite đứng
// trước để lại — chạy lẻ trên cây sạch (hoặc song song) là hỏng. lockdown.js chỉ
// cần PermissionFlagsBits.ManageChannels và Colors.{Yellow,Red,Green}.
fs.writeFileSync(
  DJS_MOCK,
  `module.exports = {
  PermissionFlagsBits: new Proxy({}, { get: (t, k) => (t[k] ??= BigInt(Object.keys(t).length + 1)) }),
  Colors: new Proxy({}, { get: (t, k) => (t[k] ??= Object.keys(t).length + 1) }),
};
`,
);
fs.writeFileSync(
  path.join(__dirname, "_lockdown-util.cjs"),
  `const calls = [];
module.exports = {
  calls,
  logEmbed: (o) => o,
  sendLog: async (guild, cfg, embed) => { calls.push({ guildId: guild.id, embed }); },
};
`,
);

const lockdown = require("../bot/src/lockdown.js");
const utilStub = require("./_lockdown-util.cjs");

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  ok ? pass++ : fail++;
};
const section = (t) => console.log(`\n── ${t} ──`);

/**
 * Guild giả.
 * @param hasPerm bot có ManageChannels hay không
 * @param channels mảng kênh (mỗi phần tử có isTextBased/isVoiceBased tự định nghĩa)
 */
function mkGuild(id, { hasPerm = true, channels = [], everyone = "EVERYONE" } = {}) {
  const edits = [];
  const cache = new Map(channels.map((c) => [c.id, c]));
  return {
    id,
    name: "G-" + id,
    roles: { everyone },
    channels: { cache },
    members: {
      fetchMe: async () =>
        hasPerm ? { permissions: { has: () => true } } : { permissions: { has: () => false } },
    },
    edits,
  };
}

function mkStore() {
  const mutations = [];
  return {
    mutations,
    client: {
      mutation: async (name, args) => {
        mutations.push({ name, args });
        return {};
      },
    },
  };
}

(async () => {
  // ═══ 1. isLocked / markLocked ═══
  section("isLocked / markLocked");
  {
    check("chưa khoá thì isLocked = false", lockdown.isLocked("L1") === false);
    lockdown.markLocked("L1");
    check("markLocked xong thì isLocked = true", lockdown.isLocked("L1") === true);
    check("guild khác không bị ảnh hưởng", lockdown.isLocked("L2") === false);
  }

  // ═══ 2. lockGuild: thiếu quyền ═══
  section("lockGuild — bot thiếu quyền phải BÁO, không crash");
  {
    const g = mkGuild("G1", { hasPerm: false });
    const store = mkStore();
    utilStub.calls.length = 0;
    const ok = await lockdown.lockGuild({}, g, { lockdownMinutes: 5 }, store);
    check("trả false khi thiếu quyền", ok === false);
    check(
      "KHÔNG ghi botLockState",
      store.mutations.length === 0,
      JSON.stringify(store.mutations.map((m) => m.name)),
    );
    check(
      "gửi log cảnh báo thiếu quyền",
      utilStub.calls.length === 1 &&
        /Quản lý kênh/.test(utilStub.calls[0].embed.title + utilStub.calls[0].embed.description),
    );
    check("chưa đánh dấu là đã khoá", lockdown.isLocked("G1") === false);
  }
  {
    // `fetchMe` ném lỗi (mất mạng gateway) → phải coi như không có quyền.
    const g = mkGuild("G2", { hasPerm: true });
    g.members.fetchMe = async () => {
      throw new Error("gateway down");
    };
    const store = mkStore();
    const ok = await lockdown.lockGuild({}, g, {}, store);
    check("fetchMe lỗi → trả false, không ném", ok === false);
    check("fetchMe lỗi → không ghi botLockState", store.mutations.length === 0);
  }

  // ═══ 3. lockGuild: khoá đúng kênh ═══
  section("lockGuild — chỉ khoá kênh text + voice, BỎ qua thread");
  {
    const text = {
      id: "t1",
      name: "general",
      isTextBased: () => true,
      permissionOverwrites: {
        edit: async (t, p) => {
          text.edited = p;
        },
      },
    };
    const voice = {
      id: "v1",
      name: "Voice",
      // discord.js v14: voice channel CÓ `.messages` → isTextBased() trả true.
      // Mock theo ĐÚNG hành vi thật để không che bug "nhánh Connect chết".
      isTextBased: () => true,
      isVoiceBased: () => true,
      permissionOverwrites: {
        edit: async (t, p) => {
          voice.edited = p;
        },
      },
    };
    const thread = {
      id: "th1",
      name: "thread",
      isTextBased: () => true,
      isThread: () => true,
      permissionOverwrites: {
        edit: async () => {
          thread.edited = true;
        },
      },
    };
    const broken = {
      id: "b1",
      name: "broken",
      isTextBased: () => true,
      isThread: () => false,
      permissionOverwrites: {
        edit: async () => {
          throw new Error("Missing Permissions");
        },
      },
    };
    const neither = {
      id: "n1",
      name: "stage",
      isTextBased: () => false,
      permissionOverwrites: {
        edit: async () => {
          neither.edited = true;
        },
      },
    };
    const g = mkGuild("G3", { channels: [text, voice, thread, broken, neither] });
    const store = mkStore();
    utilStub.calls.length = 0;
    const ok = await lockdown.lockGuild({}, g, { lockdownMinutes: 7 }, store);
    check("khoá thành công", ok === true);
    check(
      "kênh text bị chặn SendMessages",
      text.edited?.SendMessages === false,
      JSON.stringify(text.edited),
    );
    check(
      "kênh voice bị chặn Connect",
      voice.edited?.Connect === false,
      JSON.stringify(voice.edited),
    );
    check(
      "kênh voice KHÔNG bị chặn SendMessages (isTextBased()=true không được lấn nhánh Connect)",
      voice.edited?.SendMessages === undefined,
      JSON.stringify(voice.edited),
    );
    check("THREAD KHÔNG bị khoá (nằm trong kênh cha)", thread.edited !== true);
    check("kênh hỏng KHÔNG làm hỏng cả lượt", ok === true);
    check("đánh dấu server đã khoá", lockdown.isLocked("G3") === true);
    const lock = store.mutations.find((m) => m.name === "bot_writes:botLockState");
    check("ghi botLockState", !!lock, JSON.stringify(store.mutations.map((m) => m.name)));
    check(
      "hạn khóa = lockdownMinutes phút",
      Math.abs(lock.args.until - (Date.now() + 7 * 60_000)) < 5_000,
      String(lock.args.until),
    );
    check(
      "gửi log đã khoá",
      utilStub.calls.length === 1 && /khóa/.test(utilStub.calls[0].embed.title),
    );
  }
  {
    // Kênh KHÔNG có hàm isTextBased (mock cũ / object thô) → không ném.
    const raw = { id: "r1", name: "raw", permissionOverwrites: { edit: async () => {} } };
    const g = mkGuild("G4", { channels: [raw] });
    const store = mkStore();
    const ok = await lockdown.lockGuild({}, g, {}, store);
    check("kênh không có isTextBased → bỏ qua, không ném", ok === true);
  }
  {
    // Đã khoá rồi thì không khoá 2 lần (tránh spam log + mutation).
    const g = mkGuild("G5", { channels: [] });
    lockdown.markLocked("G5");
    const store = mkStore();
    utilStub.calls.length = 0;
    const ok = await lockdown.lockGuild({}, g, {}, store);
    check("đã khoá → trả false, KHÔNG ghi thêm", ok === false && store.mutations.length === 0);
    check("đã khoá → KHÔNG gửi log lần 2", utilStub.calls.length === 0);
  }
  {
    // 2 trigger đồng thời (raid + bấm nút) chỉ được sửa quyền/log MỘT lần: cổng
    // chống chồng lượt phải đóng TRƯỚC mọi await, nếu không cả hai cùng lọt.
    let edits = 0;
    const text = {
      id: "t4",
      name: "general",
      isTextBased: () => true,
      permissionOverwrites: {
        edit: async () => {
          edits++;
        },
      },
    };
    const g = mkGuild("G5b", { channels: [text] });
    const store = mkStore();
    const [a, b] = await Promise.all([
      lockdown.lockGuild({}, g, {}, store),
      lockdown.lockGuild({}, g, {}, store),
    ]);
    check("2 lượt khoá đồng thời: đúng 1 lượt thắng", a !== b, `a=${a} b=${b}`);
    check("2 lượt khoá đồng thời: sửa quyền đúng 1 lần", edits === 1, String(edits));
    check(
      "2 lượt khoá đồng thời: đúng 1 mutation",
      store.mutations.length === 1,
      String(store.mutations.length),
    );
  }

  // ═══ 4. unlockGuild ═══
  section("unlockGuild — mở lại đúng hạn");
  {
    const text = {
      id: "t2",
      name: "general",
      isTextBased: () => true,
      permissionOverwrites: {
        edit: async (t, p) => {
          text.edited = p;
        },
      },
    };
    const g = mkGuild("G6", { channels: [text] });
    await lockdown.lockGuild({}, g, { lockdownMinutes: 5 }, mkStore());
    const store = mkStore();
    utilStub.calls.length = 0;
    const ok = await lockdown.unlockGuild({}, g, {}, store);
    check("mở khoá thành công", ok === true);
    check(
      "khôi phục SendMessages về trạng thái trước khoá (null) và không đụng quyền khác",
      text.edited?.SendMessages === null && !!text.edited && !("Connect" in text.edited),
      JSON.stringify(text.edited),
    );
    check("KHÔNG còn đánh dấu khoá", lockdown.isLocked("G6") === false);
    const unlock = store.mutations.find((m) => m.name === "bot_writes:botLockState");
    check(
      "ghi until=null + requested=false để tickUnlocks không khoá lại",
      unlock && unlock.args.until === null && unlock.args.requested === false,
      JSON.stringify(unlock),
    );
    check(
      "gửi log đã mở khoá",
      utilStub.calls.length === 1 && /mở khóa/i.test(utilStub.calls[0].embed.title),
      utilStub.calls[0]?.embed?.title,
    );
  }
  {
    // Kênh có overwrite @everyone TỪ TRƯỚC (chủ server cố ý chặn/cho quyền):
    // mở khoá phải TRẢ LẠI giá trị cũ, không được xoá trắng. Trước đây text bị
    // mất deny và voice bị mở toang vì luôn set null.
    const text = {
      id: "t3",
      name: "announcement",
      isTextBased: () => true,
      isVoiceBased: () => false,
      permissionOverwrites: {
        // deny mọi quyền → prevOverwrite(SendMessages) phải thấy false.
        cache: new Map([["EVERYONE", { allow: { has: () => false }, deny: { has: () => true } }]]),
        edit: async (t, p) => {
          text.edited = p;
        },
      },
    };
    const voice = {
      id: "v3",
      name: "Voice",
      isTextBased: () => true,
      isVoiceBased: () => true,
      permissionOverwrites: {
        // allow mọi quyền → prevOverwrite(Connect) phải thấy true.
        cache: new Map([["EVERYONE", { allow: { has: () => true }, deny: { has: () => false } }]]),
        edit: async (t, p) => {
          voice.edited = p;
        },
      },
    };
    const g = mkGuild("G6b", { channels: [text, voice], everyone: { id: "EVERYONE" } });
    await lockdown.lockGuild({}, g, {}, mkStore());
    check(
      "khoá: text ghi SendMessages=false",
      text.edited?.SendMessages === false,
      JSON.stringify(text.edited),
    );
    check(
      "khoá: voice ghi Connect=false và KHÔNG đụng SendMessages",
      voice.edited?.Connect === false && voice.edited?.SendMessages === undefined,
      JSON.stringify(voice.edited),
    );
    const ok = await lockdown.unlockGuild({}, g, {}, mkStore());
    check("mở khoá kênh có overwrite cũ thành công", ok === true);
    check(
      "mở khoá: TRẢ LẠI deny SendMessages cũ (không xoá trắng)",
      text.edited?.SendMessages === false && !!text.edited && !("Connect" in text.edited),
      JSON.stringify(text.edited),
    );
    check(
      "mở khoá: TRẢ LẠI allow Connect cũ",
      voice.edited?.Connect === true && !!voice.edited && !("SendMessages" in voice.edited),
      JSON.stringify(voice.edited),
    );
  }
  {
    const g = mkGuild("G7", { channels: [] });
    const store = mkStore();
    const ok = await lockdown.unlockGuild({}, g, {}, store);
    check("server chưa khoá → mở khoá trả false", ok === false);
    check("không ghi mutation khi chưa khoá", store.mutations.length === 0);
  }
  {
    // Kênh lỗi khi mở khoá → vẫn phải gỡ cờ `locked`, nếu không server bị kẹt
    // vĩnh viễn ở trạng thái "đang khoá".
    const broken = {
      id: "b2",
      name: "broken",
      isTextBased: () => true,
      isThread: () => false,
      permissionOverwrites: {
        edit: async () => {
          throw new Error("nope");
        },
      },
    };
    const g = mkGuild("G8", { channels: [broken] });
    await lockdown.lockGuild({}, g, {}, mkStore());
    const store = mkStore();
    const ok = await lockdown.unlockGuild({}, g, {}, store);
    check("kênh hỏng khi mở khoá → vẫn mở xong", ok === true);
    check("gỡ cờ locked dù kênh hỏng", lockdown.isLocked("G8") === false);
  }
  {
    // Vòng đời đầy đủ: khoá → mở → khoá lại được (trạng thái không bị dính).
    const g = mkGuild("G9", { channels: [] });
    const s1 = mkStore();
    const a = await lockdown.lockGuild({}, g, {}, s1);
    const s2 = mkStore();
    const b = await lockdown.unlockGuild({}, g, {}, s2);
    const s3 = mkStore();
    const c = await lockdown.lockGuild({}, g, {}, s3);
    check(
      "khoá → mở → khoá lại đều thành công",
      a === true && b === true && c === true,
      `${a}/${b}/${c}`,
    );
  }

  // ═══ 5. Tiến trình chạy lại mất trạng thái ═══
  section("bot khởi động lại thì mất trạng thái khoá");
  {
    // Set `locked` chỉ nằm trong RAM. Sau restart, server thật vẫn đang bị
    // khoá ở Discord nhưng bot tưởng là chưa khoá → bị khoá 2 lần. Đây là
    // hành vi chấp nhận được (khoá lại là an toàn, còn hơn bỏ sót), nhưng phải
    // ghi rõ để không ai tưởng là bug.
    check("Set không đọc từ đâu khác ngoài RAM", lockdown.isLocked("G9") === true);
    console.log("  ℹ️  Sau restart process, isLocked() = false cho mọi guild (Set chỉ ở RAM).");
    console.log("     `tickUnlocks` đọc `lockdownUntil` từ Convex nên vẫn mở khoá đúng hạn.");
  }

  console.log(`\nKết quả lockdown: ${pass} PASS, ${fail} FAIL`);
  fs.rmSync(path.join(__dirname, "_lockdown-util.cjs"), { force: true });
  process.exit(fail === 0 ? 0 : 1);
})();
