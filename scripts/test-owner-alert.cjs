// Test ownerAlert.js — DM khẩn cho owner khi server bị nuke/raid:
//   - alertOwner: cooldown 5 phút/guild (vụ kích nhiều module chỉ DM 1 lần)
//   - tôn trọng toggle emergencyAlertEnabled === false → không gửi
//   - DM thành công → KHÔNG fallback kênh log; DM lỗi → fallback sendLog
//   - privileged: tiêu đề + ghi chú "bot không phạt" đúng
//   - pruneCache: guild rời → entry cooldown bị dọn
// Không mạng, không Discord thật. Chạy: node scripts/test-owner-alert.cjs

const path = require("path");
const DJS_MOCK = require("./support/djs-mock-path.cjs");
const Module = require("module");
const fs = require("fs");

const origResolve = Module._resolveFilename;
let utilMockPath = null;
Module._resolveFilename = function (request, ...args) {
  if (request === "discord.js") return DJS_MOCK;
  if (utilMockPath && request.endsWith("/util")) return utilMockPath;
  return origResolve.call(this, request, ...args);
};
fs.writeFileSync(
  DJS_MOCK,
  `module.exports = { Colors: { Red: 0xed4245, Orange: 0xe67e22 }, EmbedBuilder: class { setColor() { return this; } setTitle() { return this; } setDescription() { return this; } setTimestamp() { return this; } addFields() { return this; } setFooter() { return this; } } };`,
);

// Nuốt util.js (dùng discord.js thật) — mock sendLog/logEmbed ghi nhận lời gọi.
const sendLogCalls = [];
utilMockPath = path.join(__dirname, "_util-mock.cjs");
globalThis.__sendLogCalls = sendLogCalls;
fs.writeFileSync(
  path.join(__dirname, "_util-mock.cjs"),
  `module.exports = {
  logEmbed: (o) => o,
  sendLog: async (...a) => { globalThis.__sendLogCalls.push(a); },
  sendCaseLog: async () => ({}),
};`,
);
process.on("exit", () => {
  try {
    fs.unlinkSync(path.join(__dirname, "_util-mock.cjs"));
  } catch {}
});

const ownerAlert = require("../bot/src/handlers/antinuke/ownerAlert");
const { alertOwner, _ownerAlertForTest, COOLDOWN_MS } = ownerAlert;

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

function makeGuild(id = "g1") {
  return { id, name: "Test Guild", memberCount: 100, ownerId: "owner-1" };
}
function makeStore(cfg = {}) {
  const configs = new Map([["g1", { emergencyAlertEnabled: true, ...cfg }]]);
  return { getConfig: async (gid) => configs.get(gid) ?? { emergencyAlertEnabled: true, ...cfg } };
}
function makeClient({ dmOk = true } = {}) {
  const dmCalls = [];
  return {
    users: {
      fetch: async (id) => ({
        id,
        send: async (msg) => {
          if (!dmOk) throw new Error("DM tắt");
          dmCalls.push({ id, msg });
          return {};
        },
      }),
    },
    _dmCalls: dmCalls,
  };
}

(async () => {
  // 0. getConfig lỗi (Convex load cao đúng lúc raid) KHÔNG được ăn mất slot
  //    cooldown — nếu ăn, cả đợt raid sau đó không có DM nào tới owner dù
  //    module sau vẫn cảnh báo. DM là kênh DUY NHẤT còn lại khi kẻ nuke đã
  //    xoá kênh log.
  {
    _ownerAlertForTest();
    const client = makeClient();
    let reads = 0;
    const flakyStore = {
      getConfig: async () => {
        reads += 1;
        return reads === 1 ? null : { emergencyAlertEnabled: true };
      },
    };
    const guild = makeGuild();
    const first = await alertOwner(client, flakyStore, {
      guild,
      module: "massBan",
      summary: "lần 1",
    });
    check("getConfig lỗi → không DM (trả false)", first === false);
    const second = await alertOwner(client, flakyStore, {
      guild,
      module: "massChannelDelete",
      summary: "lần 2",
    });
    check(
      `lượt sau vẫn DM được owner (thực tế ${client._dmCalls.length} DM)`,
      second === true && client._dmCalls.length === 1,
    );
  }

  // 1. DM thành công cơ bản
  {
    _ownerAlertForTest();
    sendLogCalls.length = 0;
    const client = makeClient();
    const store = makeStore();
    const guild = makeGuild();
    const ok = await alertOwner(client, store, {
      guild,
      module: "massBan",
      summary: "Mass ban — 5 lượt",
    });
    check("DM thành công trả true", ok === true);
    check("DM đúng người owner", client._dmCalls[0]?.id === "owner-1");
    check("DM thành công KHÔNG fallback kênh log", sendLogCalls.length === 0);
  }

  // 2. Cooldown 5 phút — lượt thứ 2 ngay lập tức bị chặn
  {
    _ownerAlertForTest();
    sendLogCalls.length = 0;
    const client = makeClient();
    const store = makeStore();
    const guild = makeGuild();
    await alertOwner(client, store, { guild, module: "massBan", summary: "lần 1" });
    const again = await alertOwner(client, store, {
      guild,
      module: "massKick",
      summary: "lần 2 cùng vụ",
    });
    check("lượt 2 trong cooldown bị chặn (1 vụ nhiều module không spam DM)", again === false);
    check("chỉ 1 DM được gửi", client._dmCalls.length === 1);
  }

  // 3. Cooldown chỉ theo guild — guild khác không bị ảnh hưởng
  {
    _ownerAlertForTest();
    const client = makeClient();
    const store = makeStore();
    await alertOwner(client, store, { guild: makeGuild("gA"), module: "massBan", summary: "x" });
    const okB = await alertOwner(client, store, {
      guild: makeGuild("gB"),
      module: "massBan",
      summary: "x",
    });
    check(
      "guild khác vẫn được DM (cooldown per-guild)",
      okB === true && client._dmCalls.length === 2,
    );
  }

  // 4. Toggle tắt → không gửi cả DM lẫn log
  {
    _ownerAlertForTest();
    sendLogCalls.length = 0;
    const client = makeClient();
    const store = makeStore({ emergencyAlertEnabled: false });
    const guild = makeGuild();
    const ok = await alertOwner(client, store, { guild, module: "massBan", summary: "x" });
    check(
      "toggle emergencyAlertEnabled=false → trả false, không gửi gì",
      ok === false && client._dmCalls.length === 0 && sendLogCalls.length === 0,
    );
  }

  // 5. DM thất bại → fallback kênh log
  {
    _ownerAlertForTest();
    sendLogCalls.length = 0;
    const client = makeClient({ dmOk: false });
    const store = makeStore();
    const guild = makeGuild();
    const ok = await alertOwner(client, store, { guild, module: "massBan", summary: "x" });
    check("DM lỗi vẫn trả true (fallback log đã gửi)", ok === true);
    check("fallback đúng 1 lượt sendLog", sendLogCalls.length === 1);
  }

  // 6. Privileged: ghi chú "bot không phạt" có trong nội dung, màu Orange khác thường
  {
    _ownerAlertForTest();
    sendLogCalls.length = 0;
    const client = makeClient();
    const store = makeStore();
    const guild = makeGuild();
    await alertOwner(client, store, {
      guild,
      module: "massBan",
      summary: "x",
      executorId: "bad-admin",
      executorName: "BadAdmin",
      privileged: true,
    });
    const desc = client._dmCalls[0]?.msg?.embeds?.[0]?.description ?? "";
    check("privileged: nội dung nhắc 'không phạt'", desc.includes("không phạt"));
    check("privileged: có mention thủ phạm", desc.includes("<@bad-admin>"));
  }

  // 7. Thường: ghi chú "đã xử lý tự động"
  {
    _ownerAlertForTest();
    const client = makeClient();
    const store = makeStore();
    const guild = makeGuild();
    await alertOwner(client, store, { guild, module: "massBan", summary: "x" });
    const desc = client._dmCalls[0]?.msg?.embeds?.[0]?.description ?? "";
    check("thường: nội dung nhắc 'đã xử lý tự động'", desc.includes("đã xử lý tự động"));
  }

  // 8. pruneCache dọn guild rời
  {
    _ownerAlertForTest();
    const client = makeClient();
    const store = makeStore();
    await alertOwner(client, store, {
      guild: makeGuild("gPrune"),
      module: "massBan",
      summary: "x",
    });
    const removed = ownerAlert.pruneCache(new Set(["g-other"]));
    check("pruneCache xoá guild đã rời", removed >= 1);
    const okAgain = await alertOwner(client, store, {
      guild: makeGuild("gPrune"),
      module: "massBan",
      summary: "sau prune",
    });
    check("sau prune, guild đó cooldown reset → DM lại được", okAgain === true);
  }

  // 9. Hằng số cooldown đúng 5 phút
  check("COOLDOWN_MS = 5 phút", COOLDOWN_MS === 5 * 60_000);

  console.log(`\nKết quả owner-alert: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
})();
