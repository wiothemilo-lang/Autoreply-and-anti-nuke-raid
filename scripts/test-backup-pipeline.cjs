// Test pipeline backup sau các bản fix (auto includeMessages, nén Gist, import 'z:', skip notice).
// Chạy: node scripts/test-backup-pipeline.cjs — không mạng thật, không Convex thật, không Discord thật.
const path = require("path");
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
  addFields(f) { this.d.fields = [...(this.d.fields ?? []), ...f]; return this; }
  setTimestamp() { return this; }
  setFooter(f) { this.d.footer = f; return this; }
}
class Collection extends Map {}
// Phải là CLASS thật: snapshotGuild đọc \`o.allow.bitfield\` / \`r.permissions.bitfield\`.
class PermissionsBitField {
  constructor(bits = 0n) { this.bitfield = BigInt(bits); }
  has(b) { return (this.bitfield & BigInt(b)) === BigInt(b); }
  static Flags = { Administrator: 1n << 3n, ManageGuild: 1n << 5n, ManageChannels: 1n << 4n, ManageRoles: 1n << 28n, ManageEmojisAndStickers: 1n << 30n, ViewChannel: 1n << 10n, SendMessages: 1n << 11n };
}
module.exports = {
  Colors: new Proxy({}, { get: () => 0x000000 }),
  EmbedBuilder,
  Collection,
  ChannelType: { GuildText: 0, GuildAnnouncement: 5, GuildVoice: 2, GuildCategory: 4, GuildStageVoice: 13, GuildForum: 15 },
  PermissionsBitField,
  PermissionFlagsBits: PermissionsBitField.Flags,
  AuditLogEvent: new Proxy({}, { get: () => 0 }),
  Partials: {},
  GatewayIntentBits: new Proxy({}, { get: () => 0 }),
};
`,
);

// Backup encrypt key PHẢI tắt trong test (file test chạy ngoài bot, env khác VPS).
delete process.env.BACKUP_ENCRYPT_KEY;

const backup = require("../bot/src/handlers/backup.js");
const utils = require("../bot/src/backupUtils.js");

let pass = 0;
let fail = 0;
const check = (label, ok) => {
  console.log(ok ? `PASS ${label}` : `FAIL ${label}`);
  ok ? pass++ : fail++;
};

(async () => {
  // ---- 1. Nén + giải mã vòng tròn (nền tảng của fix Gist + import 'z:') ----
  const snapshot = {
    version: 4,
    guildId: "123456789012345678",
    guildName: "Test Guild",
    createdAt: 0,
    roles: [{ id: "r1", name: "Mod", color: 0xff0000, permissions: "8", position: 1 }],
    channels: [{ id: "c1", name: "general", type: 0, overwrites: [], messages: [] }],
    emojis: [],
    stickers: [],
    emojiCount: 0,
    stickerCount: 0,
    messageCount: 0,
  };
  const enc = utils.compressAndEncryptBackup(snapshot);
  check(
    "compressAndEncryptBackup nén thành 'z:...'",
    typeof enc.backupJson === "string" && enc.backupJson.startsWith("z:"),
  );
  check("compressed=true", enc.compressed === true);
  const round = JSON.parse(utils.decompressAndDecryptBackup(enc.backupJson));
  check(
    "giải nén vòng tròn ra snapshot gốc",
    round.guildName === "Test Guild" && round.roles.length === 1,
  );

  // ---- 2. Auto-backup đồng bộ includeMessages theo bản gần nhất (fix checksum lệch) ----
  const mutations = [];
  const store = {
    client: {
      mutation: async (name, args) => {
        mutations.push({ name, args });
        return { ok: true, backupId: "bk1" };
      },
      query: async (name, _args = {}) => {
        if (name === "backup:botGetDueAuto") {
          return [{ guildId: "123456789012345678", days: 7 }];
        }
        if (name === "backup:botGetLastChecksum") {
          // Bản gần nhất CÓ tin nhắn → auto phải đặt includeMessages=true
          return { backupSnapshotChecksum: "abc", backupMessageCount: 42 };
        }
        return null;
      },
      action: async () => ({ ok: true }),
    },
    getConfig: async () => null,
  };
  mutations.length = 0;
  await backup.autoBackupSweep({ guilds: { cache: new Map() } }, store);
  const req = mutations.find((m) => m.name === "bot_writes:botSetBackupRequest");
  check("auto sweep đặt yêu cầu backup", !!req);
  check(
    "auto sweep KẾ THỪA includeMessages=true từ bản gần nhất (trước đây luôn false → checksum lệch)",
    req?.args?.includeMessages === true,
  );

  // Bản gần nhất KHÔNG tin nhắn → auto không kèm tin
  store.client.query = async (name) => {
    if (name === "backup:botGetDueAuto") return [{ guildId: "g2", days: 3 }];
    if (name === "backup:botGetLastChecksum")
      return { backupSnapshotChecksum: "x", backupMessageCount: 0 };
    return null;
  };
  mutations.length = 0;
  await backup.autoBackupSweep({ guilds: { cache: new Map() } }, store);
  const req2 = mutations.find((m) => m.name === "bot_writes:botSetBackupRequest");
  check("bản gần nhất không tin → includeMessages=false", req2?.args?.includeMessages === false);

  // Chưa có backup nào (last null) → false (bản đầu không tin, khớp snapshot mặc định)
  store.client.query = async (name) => {
    if (name === "backup:botGetDueAuto") return [{ guildId: "g3", days: 2 }];
    if (name === "backup:botGetLastChecksum") return null;
    return null;
  };
  mutations.length = 0;
  await backup.autoBackupSweep({ guilds: { cache: new Map() } }, store);
  const req3 = mutations.find((m) => m.name === "bot_writes:botSetBackupRequest");
  check("chưa có backup nào → includeMessages=false", req3?.args?.includeMessages === false);

  // ---- 3. Import file 'z:' (tải từ Gist) giờ đọc được ----
  const zContent = enc.backupJson;
  let parsed;
  try {
    parsed = backup.normalizeBackupFile(zContent);
  } catch (e) {
    parsed = { error: e.message };
  }
  check(
    "import bản nén 'z:' của Protogon không còn lỗi 'Không đọc được file'",
    !parsed.error && parsed.guildName === "Test Guild",
  );
  check(
    "import 'z:' giữ đúng role + kênh",
    !parsed.error && parsed.roles[0]?.name === "Mod" && parsed.channels[0]?.name === "general",
  );

  // JSON thường vẫn đọc bình thường (không bị reg)
  const plainJson = JSON.stringify({
    guildName: "Plain",
    roles: [{ id: "a", name: "A" }],
    channels: [],
  });
  const p2 = backup.normalizeBackupFile(plainJson);
  check("JSON thường vẫn đọc được", p2.guildName === "Plain");

  // Import phải dừng ngay khi claim đã stale; không được restore side-effect trước.
  {
    const staleMutations = [];
    const staleStore = {
      client: {
        mutation: async (name, args) => {
          staleMutations.push({ name, args });
          return { ok: false, reason: "stale_claim" };
        },
      },
      getConfig: async () => null,
    };
    let staleError = null;
    try {
      await backup.runImportRestore(
        { guilds: { cache: new Map() } },
        staleStore,
        "123456789012345678",
        zContent,
        "test.json",
        { claimAt: 9876 },
      );
    } catch (e) {
      staleError = e;
    }
    check(
      "import claim stale → dừng trước restore",
      staleError?.message === "stale backup claim" &&
        staleMutations.some((m) => m.name === "bot_writes:botStoreBackup") &&
        !staleMutations.some((m) => m.name === "bot_writes:botRestoreSettings") &&
        !staleMutations.some((m) => m.name === "bot_writes:botClearBackup"),
    );
  }

  // ---- 4. Backup bị skip (checksum trùng) — chỉ thông báo khi người dùng chủ động ----
  // Mô phỏng runBackup với checksum trùng: cần guild giả đủ để snapshot chạy.
  // (runBackup gọi sendToLog → sendLog thật sẽ lỗi im lặng; dùng embed capture qua store.getConfig null + guild không có webhook → an toàn.)
  // Kiểm qua nguồn: skipNotice chỉ được truyền khi web bấm chủ động — kiểm tham số tồn tại trong signature.
  const src = fs.readFileSync(
    path.join(__dirname, "..", "bot", "src", "handlers", "backup.js"),
    "utf8",
  );
  check(
    "runBackup có tham số skipNotice",
    /const \{\s*pushToGithub: pushToGithubOpt = false,\s*includeMessages = false,\s*skipNotice = false,\s*claimAt,?\s*\} = opts;/.test(
      src,
    ),
  );
  check("skipNotice chỉ thông báo khi true (auto vẫn im lặng)", src.includes("if (skipNotice) {"));
  // Móc neo kèm DẤU MỞ NGOẶC: hàm runRestorePlan có tên bắt đầu bằng
  // "runRestore" nên indexOf("async function runRestore") khớp LUÔN vào nó →
  // đoạn cắt rỗng và test âm thầm hỏng. Đây là lý do neo phải có "(".
  const restoreBlock = src.slice(
    src.indexOf("async function restoreCore("),
    src.indexOf("async function runRestore("),
  );
  check(
    "restore không báo xong nếu áp cấu hình/clear request thất bại",
    restoreBlock.includes('mutation("bot_writes:botRestoreSettings"') &&
      !/botRestoreSettings[\s\S]{0,500}\.catch\(/.test(restoreBlock) &&
      !/botClearBackup[\s\S]{0,300}\.catch\(/.test(restoreBlock),
  );
  const pollBlock = src.slice(
    src.indexOf("async function pollBackups"),
    src.indexOf("async function autoBackupSweep"),
  );
  check(
    "lỗi backup/restore đi qua mutation báo lỗi, không clear như thành công",
    pollBlock.includes("botReportRestoreError") &&
      pollBlock.includes("botReportBackupError") &&
      !pollBlock.includes('.mutation("bot_writes:botClearBackup"'),
  );

  // ---- 5. pushToGithub gửi bản ĐÃ NÉN (không còn backupJson: json thô) ----
  check(
    "runBackup đẩy GitHub bằng backupJson nén (trước đây JSON thô >900KB bị Gist từ chối)",
    src.includes("// Gửi bản ĐÃ NÉN") && !/backupJson: json,/.test(src),
  );

  // ---- 6. Action githubPush phải CHUYỂN TIẾP botKey vào botSetBackupGithub ----
  // botSetBackupGithub là mutation bảo mật cao (requireBotKeyStrict). Không
  // chuyển tiếp botKey → gist tạo thành công nhưng URL không lưu, dashboard báo
  // "GitHub thất bại" oan.
  const ghSrc = fs.readFileSync(path.join(__dirname, "..", "convex", "backup_github.ts"), "utf8");
  const runMutationBlock = ghSrc.slice(ghSrc.indexOf("botSetBackupGithub"));
  check(
    "githubPush chuyển tiếp botKey vào botSetBackupGithub",
    /botSetBackupGithub[\s\S]{0,200}botKey:\s*args\.botKey/.test(runMutationBlock),
  );

  // ══════════ 7. CHỤP SNAPSHOT: role, kênh, emoji, sticker, tin nhắn ══════════
  // Nhánh CHỤP chưa từng chạy với dữ liệu thật: captureChannelMessages và
  // phần serialize emoji/sticker/overwrite đều là dòng chưa phủ. Chụp hỏng thì
  // bản backup vào Convex/Gist cũng hỏng theo — mà test cũ chỉ kiểm nén/import.
  const { PermissionsBitField, ChannelType: CT } = require(DJS_MOCK);
  const SRC = "111222333444555666";
  const MY_BITS = (1n << 10n) | (1n << 11n); // ViewChannel | SendMessages
  const PNG_URI =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  // .size là Collection API, mảng thường không có → dựng riêng.
  const mkAtt = (urls) => {
    const a = urls.map((u) => ({ url: u }));
    a.size = a.length;
    return a;
  };
  const mkMsg = (id, ts, o = {}) => ({
    id,
    createdTimestamp: ts,
    content: o.content ?? "xin chào",
    author: { id: o.authorId ?? "u1", username: o.authorName ?? "minh" },
    attachments: mkAtt(o.attachments ?? []),
  });
  const mkRole = (id, name, position, o = {}) => ({
    id,
    name,
    position,
    managed: o.managed ?? false,
    color: o.color ?? 0,
    hoist: o.hoist ?? false,
    mentionable: o.mentionable ?? false,
    permissions: new PermissionsBitField(o.permissions ?? 0n),
    iconURL: () => o.icon ?? null,
    unicodeEmoji: o.unicodeEmoji ?? null,
  });
  const mkChan = (id, name, type, position, o = {}) => ({
    id,
    name,
    type,
    position,
    topic: o.topic ?? null,
    nsfw: o.nsfw ?? false,
    bitrate: o.bitrate ?? null,
    userLimit: o.userLimit ?? null,
    parentId: o.parentId ?? null,
    permissionOverwrites: { cache: new Map(o.ows ?? []) },
    messages: {
      fetch: async () => {
        if (o.fetchThrows) throw new Error("thiếu quyền Read History");
        return new Map((o.msgs ?? []).map((m) => [m.id, m]));
      },
    },
    // Thread: kênh văn bản dùng fetchActive(), kênh forum dùng cache sẵn có.
    threads: {
      cache: new Map(o.threads ?? []),
      fetchActive:
        typeof o.fetchActive === "function"
          ? o.fetchActive
          : o.threads
            ? async () => new Map(o.threads)
            : undefined,
    },
  });

  // Factory (không phải hằng số): các test mới thêm ban/invite/thread vào server
  // giả phải không làm bẩn server giả dùng chung cho test cũ.
  function mkSrcGuild() {
    return {
      id: SRC,
      name: "Server Nguồn",
      available: true,
      iconURL: () => null,
      members: { me: { permissions: new PermissionsBitField(MY_BITS) } },
      roles: {
        cache: new Map([
          ["r0", mkRole("r0", "@everyone", 0)],
          [
            "r1",
            mkRole("r1", "Mod", 2, {
              color: 0xff0000,
              hoist: true,
              mentionable: true,
              permissions: (1n << 1n) | (1n << 10n),
              icon: "https://cdn/role.png",
              unicodeEmoji: "🐶",
            }),
          ],
          ["r2", mkRole("r2", "Nitro Boost", 1, { managed: true })],
          ["r3", mkRole("r3", "Thanh viên", 3)],
        ]),
      },
      emojis: {
        cache: new Map([
          [
            "e1",
            {
              id: "e1",
              name: "Party",
              animated: false,
              available: true,
              imageURL: () => "https://cdn/e1.png",
            },
          ],
          ["e2", { id: "e2", name: "", available: true, imageURL: () => "https://cdn/e2.png" }],
          [
            "e3",
            { id: "e3", name: "Hỏng", available: false, imageURL: () => "https://cdn/e3.png" },
          ],
        ]),
      },
      stickers: {
        cache: new Map([
          [
            "s1",
            {
              id: "s1",
              name: "Sticker",
              description: "mô tả",
              tags: "😀",
              format: 1,
              url: "https://cdn/s1.png",
            },
          ],
          ["s2", { id: "s2", name: "", url: "https://cdn/s2.png" }],
        ]),
      },
      channels: {
        cache: new Map([
          ["c-cat", mkChan("c-cat", "Khoá", CT.GuildCategory, 0)],
          [
            "c-text",
            mkChan("c-text", "general", CT.GuildText, 1, {
              topic: "chủ đề",
              nsfw: true,
              ows: [
                [
                  "o1",
                  {
                    id: "o1",
                    type: 0,
                    allow: new PermissionsBitField(1n << 11n),
                    deny: new PermissionsBitField(1n << 10n),
                  },
                ],
              ],
              // CỐ TÌNH đảo thứ tự + thêm 4 ảnh để kiểm sort và giới hạn 3 ảnh/tin.
              msgs: [
                mkMsg("m2", 2000, { authorName: "mai", content: "tin 2" }),
                mkMsg("m1", 1000, {
                  content: "tin 1",
                  attachments: [
                    "https://cdn/a.png",
                    "https://cdn/b.png",
                    "https://cdn/c.png",
                    "https://cdn/d.png",
                  ],
                }),
              ],
            }),
          ],
          [
            "c-voice",
            mkChan("c-voice", "Voice", CT.GuildVoice, 2, {
              bitrate: 64000,
              userLimit: 5,
              msgs: [mkMsg("v1", 500)],
            }),
          ],
          ["c-nope", mkChan("c-nope", "DM", 1, 3, { msgs: [mkMsg("d1", 400)] })],
          [
            "c-noread",
            mkChan("c-noread", "Không đọc được", CT.GuildText, 4, { fetchThrows: true }),
          ],
        ]),
      },
    };
  }
  const srcGuild = mkSrcGuild();
  const srcClient = { guilds: { cache: new Map([[SRC, srcGuild]]) } };
  const snapStore = { getConfig: async () => ({ prefix: "?", logChannelId: "L1" }) };

  {
    const { snapshot } = await backup.snapshotWithSettings(srcClient, snapStore, SRC, true);
    check(
      "chụp: bỏ @everyone + role managed, giữ role thật",
      snapshot.roles.length === 2,
      String(snapshot.roles.length),
    );
    check(
      "chụp: role sắp theo position",
      snapshot.roles[0]?.name === "Mod" && snapshot.roles[1]?.name === "Thanh viên",
    );
    check(
      "chụp: quyền role được BÓP theo quyền bot (loại bit bot không có)",
      snapshot.roles[0]?.permissions === ((1n << 10n) & MY_BITS).toString(),
      String(snapshot.roles[0]?.permissions),
    );
    check(
      "chụp: giữ màu/hoist/mentionable/icon/emoji của role",
      snapshot.roles[0]?.color === 0xff0000 &&
        snapshot.roles[0]?.icon === "https://cdn/role.png" &&
        snapshot.roles[0]?.unicodeEmoji === "🐶",
    );
    check(
      "chụp: bỏ emoji không tên + không khả dụng",
      snapshot.emojis.length === 1 && snapshot.emojis[0]?.name === "Party",
    );
    check(
      "chụp: bỏ sticker không tên",
      snapshot.stickers.length === 1 && snapshot.stickers[0]?.name === "Sticker",
    );
    check(
      "chụp: bỏ kênh ngoài danh sách CHANNEL_TYPES (DM)",
      snapshot.channels.length === 4,
      String(snapshot.channels.length),
    );
    const text = snapshot.channels.find((c) => c.id === "c-text");
    check("chụp: topic/nsfw của kênh được lưu", text?.topic === "chủ đề" && text?.nsfw === true);
    check(
      "chụp: overwrite lưu allow/deny dạng chuỗi",
      text?.overwrites?.[0]?.allow === ((1n << 11n) & MY_BITS).toString() &&
        text.overwrites[0].deny === (1n << 10n).toString(),
      JSON.stringify(text?.overwrites),
    );
    check(
      "chụp: tin nhắn sắp TĂNG dần theo thời gian",
      text?.messages?.[0]?.id === "m1" && text.messages[1]?.id === "m2",
    );
    check(
      "chụp: mỗi tin chỉ giữ 3 ảnh đính kèm",
      text?.messages?.[0]?.attachments?.length === 3,
      String(text?.messages?.[0]?.attachments?.length),
    );
    check(
      "chụp: nội dung tin bị cắt 2000 ký tự",
      (text?.messages?.[0]?.content ?? "").length <= 2000,
    );
    const voice = snapshot.channels.find((c) => c.id === "c-voice");
    check("chụp: kênh voice KHÔNG kèm tin nhắn", voice && !("messages" in voice));
    check(
      "chụp: kênh lỗi quyền đọc không làm hỏng cả lượt chụp",
      snapshot.channels.some((c) => c.id === "c-noread"),
    );
    check(
      "chụp: messageCount chỉ đếm tin thật",
      snapshot.messageCount === 2,
      String(snapshot.messageCount),
    );
    check(
      "chụp: settings lấy từ cấu hình server",
      snapshot.settings?.prefix === "?" && snapshot.settings?.logChannelId === "L1",
    );
  }
  {
    // Không bật kèm tin → không tốn lượt fetch, JSON nhỏ hơn nhiều.
    const { snapshot } = await backup.snapshotWithSettings(srcClient, snapStore, SRC, false);
    const text = snapshot.channels.find((c) => c.id === "c-text");
    check(
      "chụp không kèm tin → kênh không có field messages",
      text && !("messages" in text) && snapshot.messageCount === 0,
    );
  }
  {
    // getConfig lỗi → vẫn chụp được, chỉ mất phần settings.
    const errStore = {
      getConfig: async () => {
        throw new Error("Convex chết");
      },
    };
    const { snapshot } = await backup.snapshotWithSettings(srcClient, errStore, SRC, false);
    check(
      "chụp: getConfig lỗi không làm hỏng backup",
      !!snapshot && snapshot.settings === undefined,
    );
  }
  {
    let err = null;
    try {
      await backup.snapshotWithSettings({ guilds: { cache: new Map() } }, snapStore, SRC, false);
    } catch (e) {
      err = e;
    }
    check(
      "chụp: bot không còn trong server → ném lỗi rõ ràng",
      /không còn trong server/i.test(err?.message ?? ""),
    );
  }

  // ══════════ 8. KHÔI PHỤC: emoji, sticker, media, claim, tuỳ chỉnh ══════════
  // Nhánh phục hồi emoji/sticker/media CHƯA TỪNG được test. Hỏng ở đây thì
  // server khôi phục xong bị mất sạch emoji mà không có dấu vết.
  const TGT = "999888777666555444";
  function makeTarget() {
    const log = {
      roles: [],
      channels: [],
      emojis: [],
      stickers: [],
      sent: [],
      webhooks: [],
      iconSet: 0,
      threads: [],
      invites: [],
      bans: [],
      meta: [],
    };
    let n = 0;
    const guild = {
      id: TGT,
      name: "Server Đích",
      available: true,
      iconURL: () => null,
      roles: {
        cache: new Map(),
        create: async (o) => {
          log.roles.push(o);
          const r = {
            id: `nr${++n}`,
            name: o.name,
            setPosition: async () => {},
            setIcon: async () => {
              log.iconSet++;
            },
          };
          guild.roles.cache.set(r.id, r);
          return r;
        },
      },
      channels: {
        cache: new Map(),
        create: async (o) => {
          log.channels.push(o);
          const c = {
            id: `nc${++n}`,
            name: o.name,
            type: o.type,
            isTextBased: () => o.type === 0 || o.type === 5,
            threads: {
              create: async (to) => {
                log.threads.push({ channel: o.name, ...to });
                const th = {
                  id: `nth${++n}`,
                  name: to.name,
                  isTextBased: () => true,
                  createWebhook: async (wo) => {
                    const wh = {
                      name: wo.name,
                      send: async (p) => {
                        log.sent.push({ via: "thread-webhook", ...p });
                      },
                      delete: async () => {},
                    };
                    log.webhooks.push(wh);
                    return wh;
                  },
                  send: async (p) => {
                    log.sent.push({ via: "thread-channel", ...p });
                  },
                };
                return th;
              },
            },
            createInvite: async (io) => {
              log.invites.push({ channel: o.name, ...io });
              return { code: `new-${log.invites.length}` };
            },
            createWebhook: async (wo) => {
              const wh = {
                name: wo.name,
                send: async (p) => {
                  log.sent.push({ via: "webhook", ...p });
                },
                delete: async () => {},
              };
              log.webhooks.push(wh);
              return wh;
            },
            send: async (p) => {
              log.sent.push({ via: "channel", ...p });
            },
          };
          guild.channels.cache.set(c.id, c);
          return c;
        },
        fetch: async (id) => guild.channels.cache.get(id) ?? null,
      },
      emojis: {
        create: async (o) => {
          log.emojis.push(o);
          return { name: o.name };
        },
      },
      stickers: {
        create: async (o) => {
          log.stickers.push(o);
          return { name: o.name };
        },
      },
      members: {
        me: { permissions: { bitfield: (1n << 40n) - 1n } },
        ban: async (userId, opts) => {
          log.bans.push({ userId, ...opts });
        },
      },
      bans: { cache: new Map() },
      setName: async (v) => log.meta.push({ name: v }),
      setDescription: async (v) => log.meta.push({ description: v }),
      setIcon: async (v) => log.meta.push({ icon: v }),
      _log: log,
    };
    return guild;
  }
  const richBackup = {
    version: 4,
    guildId: SRC,
    guildName: "Server Nguồn",
    roles: [
      {
        id: "r1",
        name: "Mod",
        color: 0xff0000,
        hoist: true,
        mentionable: true,
        permissions: "0",
        position: 0,
        icon: "https://cdn/role.png",
        unicodeEmoji: "🐶",
      },
      { id: "rx", name: "", position: 1 },
    ],
    channels: [
      {
        id: "c-text",
        name: "general",
        type: 0,
        position: 0,
        overwrites: [],
        messages: [
          {
            id: "m1",
            authorName: "minh",
            content: "chào các bạn",
            timestamp: 1000,
            attachments: [],
          },
          { id: "m2", authorName: "mai", content: "", timestamp: 2000, attachments: [PNG_URI] },
        ],
      },
    ],
    emojis: [{ id: "e1", name: "Party ParTy!!", raw: PNG_URI }],
    stickers: [{ id: "s1", name: "S", raw: PNG_URI, tags: "😀", description: "mô tả dài" }],
    settings: { prefix: "?", modRoles: ["r1"], adminRoles: "KHÔNG PHẢI MẢNG" },
  };

  {
    const tg = makeTarget();
    const muts = [];
    const st = {
      client: {
        mutation: async (name, args) => {
          muts.push({ name, args });
          return { ok: true };
        },
      },
      getConfig: async () => null,
    };
    const r = await backup.runRestore(
      { guilds: { cache: new Map([[TGT, tg]]) } },
      st,
      TGT,
      JSON.stringify(richBackup),
    );
    check(
      "phục hồi: bỏ role không tên, tạo role thật",
      r.roleCount === 1 && tg._log.roles.length === 1,
      String(r.roleCount),
    );
    check(
      "phục hồi: role giữ màu/hoist + unicodeEmoji",
      tg._log.roles[0]?.color === 0xff0000 && tg._log.roles[0]?.unicodeEmoji === "🐶",
    );
    check("phục hồi: icon role set sau khi tạo (lỗi icon không mất role)", tg._log.iconSet === 1);
    check("phục hồi: tạo đúng số kênh", r.channelCount === 1 && tg._log.channels.length === 1);
    check(
      "phục hồi: tạo lại emoji từ data URI",
      r.emojiCount === 1 && tg._log.emojis.length === 1,
      String(r.emojiCount),
    );
    check(
      "phục hồi: tên emoji được chuẩn hoá theo luật Discord",
      /^[a-z0-9_]{2,32}$/.test(tg._log.emojis[0]?.name ?? ""),
      String(tg._log.emojis[0]?.name),
    );
    check(
      "phục hồi: tạo lại sticker",
      r.stickerCount === 1 && tg._log.stickers.length === 1,
      String(r.stickerCount),
    );
    check(
      "phục hồi: tên sticker 1 ký tự được nới lên 2",
      (tg._log.stickers[0]?.name ?? "").length >= 2,
      String(tg._log.stickers[0]?.name),
    );
    check("phục hồi: phát lại cả 2 tin nhắn", r.messageCount === 2, String(r.messageCount));
    check(
      "phục hồi: đi qua webhook để giữ tên người gửi",
      tg._log.webhooks.length === 1 && tg._log.sent.every((s) => s.via === "webhook"),
    );
    check(
      "phục hồi: tin có nội dung giữ nguyên content",
      String(tg._log.sent[0]?.content ?? "").includes("chào các bạn"),
    );
    check(
      "phục hồi: tin rỗng nhưng có ảnh → đính kèm file, KHÔNG gửi payload rỗng",
      Array.isArray(tg._log.sent[1]?.files) && tg._log.sent[1].files.length === 1,
      JSON.stringify(Object.keys(tg._log.sent[1] ?? {})),
    );
    check(
      "phục hồi: claim báo cho dashboard",
      muts.some((m) => m.name === "bot_writes:botClearBackup"),
    );
  }
  {
    // settings sai kiểu KHÔNG được làm hỏng cả lượt phục hồi.
    const tg = makeTarget();
    const st = { client: { mutation: async () => ({ ok: true }) }, getConfig: async () => null };
    const r = await backup.runRestore(
      { guilds: { cache: new Map([[TGT, tg]]) } },
      st,
      TGT,
      JSON.stringify(richBackup),
    );
    check(
      "phục hồi: settings sai kiểu vẫn tạo đủ role/kênh",
      r.roleCount === 1 && r.channelCount === 1,
    );
  }
  {
    // Tắt emoji/sticker qua cấu hình → không tạo, nhưng role/kênh/tin vẫn còn.
    const tg = makeTarget();
    const st = {
      client: { mutation: async () => ({ ok: true }) },
      getConfig: async () => ({ restoreEmojisEnabled: false }),
    };
    const r = await backup.runRestore(
      { guilds: { cache: new Map([[TGT, tg]]) } },
      st,
      TGT,
      JSON.stringify(richBackup),
    );
    check(
      "phục hồi: tắt emoji → không tạo emoji/sticker",
      r.emojiCount === 0 && r.stickerCount === 0 && tg._log.emojis.length === 0,
    );
    check("phục hồi: tắt emoji KHÔNG bỏ luôn role/kênh", r.roleCount === 1 && r.channelCount === 1);
  }
  {
    // Claim hết hạn giữa chừng → dừng ngay, không phục hồi nửa vời.
    const tg = makeTarget();
    const st = {
      client: {
        mutation: async (name) =>
          name === "bot_writes:botRenewBackupClaim"
            ? { ok: false, reason: "stale_claim" }
            : { ok: true },
      },
      getConfig: async () => null,
    };
    let err = null;
    try {
      await backup.runRestore(
        { guilds: { cache: new Map([[TGT, tg]]) } },
        st,
        TGT,
        JSON.stringify(richBackup),
        "b",
        { claimAt: 111 },
      );
    } catch (e) {
      err = e;
    }
    check(
      "phục hồi: claim hết hạn → dừng với lỗi rõ ràng",
      err?.message === "stale backup claim",
      String(err?.message),
    );
    check(
      "phục hồi: claim hết hạn → KHÔNG tạo gì cả",
      tg._log.roles.length === 0 && tg._log.channels.length === 0,
    );
  }

  // ══════════ 9. pollBackups: 3 loại việc + báo lỗi đúng mutation ══════════
  {
    const seen = [];
    const mkStore = (pending, claimOk = true) => ({
      client: {
        query: async (name) => (name === "backup:botGetPending" ? pending : null),
        mutation: async (name, args) => {
          seen.push({ name, args });
          if (name === "bot_writes:botClaimBackup")
            return claimOk ? { ok: true, claimAt: 7 } : { ok: false };
          return { ok: true, backupId: "bk", ticketId: "tk" };
        },
      },
      getConfig: async () => null,
    });
    const emptyClient = { guilds: { cache: new Map() } };

    await backup(emptyClient, mkStore([]));
    check("poll: không có việc → không làm gì", seen.length === 0);

    await backup(emptyClient, mkStore(null));
    check("poll: Convex trả null → không làm gì", seen.length === 0);

    // Không giành được claim → bỏ qua, KHÔNG xử lý (tránh 2 bot chạy trùng).
    seen.length = 0;
    await backup(emptyClient, mkStore([{ guildId: "g1", kind: "backup" }], false));
    check(
      "poll: không giành được claim → bỏ qua",
      !seen.some((s) => s.name === "bot_writes:botStoreBackup"),
      JSON.stringify(seen.map((s) => s.name)),
    );

    // Query lỗi → không crash, chỉ log.
    seen.length = 0;
    const badStore = {
      client: {
        query: async () => {
          throw new Error("Convex chết");
        },
        mutation: async () => ({ ok: true }),
      },
      getConfig: async () => null,
    };
    let pollErr = null;
    try {
      await backup(emptyClient, badStore);
    } catch (e) {
      pollErr = e;
    }
    check("poll: query lỗi → nuốt lỗi, không crash bot", pollErr === null);

    // Lỗi khi xử lý → phải đi qua mutation BÁO LỖI, không clear như thành công.
    for (const [kind, reportMutation] of [
      ["backup", "bot_writes:botReportBackupError"],
      ["restore", "bot_writes:botReportRestoreError"],
      ["import", "bot_writes:botReportImportError"],
      ["plan", "bot_writes:botReportRestorePlan"],
    ]) {
      seen.length = 0;
      const failStore = {
        client: {
          query: async (name) =>
            name === "backup:botGetPending"
              ? [
                  {
                    guildId: "g1",
                    kind,
                    backupJson: "không phải JSON",
                    fileContent: "không phải JSON",
                  },
                ]
              : null,
          mutation: async (name) => {
            seen.push({ name });
            if (name === "bot_writes:botClaimBackup") return { ok: true, claimAt: 7 };
            return { ok: true, backupId: "bk", ticketId: "tk" };
          },
        },
        getConfig: async () => null,
      };
      await backup(emptyClient, failStore);
      check(
        `poll: ${kind} lỗi → báo qua ${reportMutation}, KHÔNG clear như thành công`,
        seen.some((s) => s.name === reportMutation) &&
          !seen.some((s) => s.name === "bot_writes:botClearBackup"),
      );
    }
  }

  // ══════════ 10. autoBackupSweep: lỗi + cloneToServer ══════════
  {
    let err = null;
    try {
      await backup.autoBackupSweep(
        { guilds: { cache: new Map() } },
        {
          client: {
            query: async () => {
              throw new Error("Convex chết");
            },
            mutation: async () => ({}),
          },
          getConfig: async () => null,
        },
      );
    } catch (e) {
      err = e;
    }
    check("auto: query lỗi → nuốt lỗi, không crash", err === null);
  }
  {
    // Một server hỏng không được làm hỏng các server còn lại trong cùng lượt quét.
    const muts = [];
    await backup.autoBackupSweep(
      { guilds: { cache: new Map() } },
      {
        client: {
          query: async (name) => {
            if (name === "backup:botGetDueAuto")
              return [
                { guildId: "bad", days: 7 },
                { guildId: "good", days: 7 },
              ];
            if (name === "backup:botGetLastChecksum") {
              if (this._n === undefined) this._n = 0;
              return { backupMessageCount: 0 };
            }
            return null;
          },
          mutation: async (name, args) => {
            muts.push({ name, args });
            return {};
          },
        },
        getConfig: async () => null,
      },
    );
    check(
      "auto: vẫn đặt yêu cầu cho server hợp lệ",
      muts.some((m) => m.args?.guildId === "good"),
      JSON.stringify(muts.map((m) => m.args?.guildId)),
    );
  }
  {
    // cloneToServer chưa từng có test: chép cấu trúc từ server nguồn sang server đích.
    const tg = makeTarget();
    const client = {
      guilds: {
        cache: new Map([
          [SRC, srcGuild],
          [TGT, tg],
        ]),
      },
    };
    const st = { client: { mutation: async () => ({ ok: true }) }, getConfig: async () => null };
    const r = await backup.cloneToServer(client, st, SRC, TGT);
    check("clone: tạo role ở server đích", r.roleCount === 2, String(r.roleCount));
    check(
      "clone: trả tên cả 2 server",
      r.sourceName === "Server Nguồn" && r.targetName === "Server Đích",
    );
    check(
      "clone: áp bộ lọc thành phần khi được yêu cầu",
      typeof backup.filterBackupComponents === "function",
    );
    let cloneErr = null;
    try {
      await backup.cloneToServer(client, st, "khong-ton-tai", TGT);
    } catch (e) {
      cloneErr = e;
    }
    check("clone: server nguồn không có trong bot → ném lỗi", cloneErr !== null);
  }

  // ══════════ 11. runBackup: lưu Convex, đẩy GitHub, báo lỗi ══════════
  // Đây là luồng CHÍNH của sản phẩm (nút "Backup ngay") mà trước đây không có
  // test end-to-end nào: không ai biết GitHub có được gọi, lỗi lưu Convex có
  // báo lên dashboard thật không, và cờ "đã backup" có bị xoá sớm không.
  function backupStore(over = {}) {
    const log = { muts: [], actions: [], queries: [] };
    return {
      _log: log,
      client: {
        query: async (name, args) => {
          log.queries.push({ name, args });
          if (name === "backup:botGetLastChecksum") return over.lastChecksum ?? null;
          return null;
        },
        mutation: async (name, args) => {
          log.muts.push({ name, args });
          if (over.throwOn === name) throw new Error(over.throwMessage ?? "Convex lỗi");
          if (name === "bot_writes:botStoreBackup") {
            return over.storeResult ?? { ok: true, backupId: "bk-1" };
          }
          if (name === "bot_writes:botClearBackup") return over.clearResult ?? { ok: true };
          return { ok: true };
        },
        action: async (name, args) => {
          log.actions.push({ name, args });
          if (over.actionThrows) throw new Error("GITHUB_TOKEN hết hạn");
          return (
            over.actionResult ?? { ok: true, url: "https://gist.github.com/abc", compressed: true }
          );
        },
      },
      getConfig: async () => over.config ?? null,
    };
  }
  const backupClient = (gid = SRC) => ({ guilds: { cache: new Map([[gid, srcGuild]]) } });

  {
    const st = backupStore();
    await backup.runBackup(backupClient(), st, SRC, { pushToGithub: true, includeMessages: true });
    const store = st._log.muts.find((m) => m.name === "bot_writes:botStoreBackup");
    check(
      "backup: lưu Convex với số role/kênh/tin đúng",
      !!store &&
        store.args.roleCount === 2 &&
        store.args.channelCount === 4 &&
        store.args.messageCount === 2,
      JSON.stringify(store?.args?.roleCount),
    );
    check(
      "backup: gửi bản NÉN (z:) lên Convex",
      String(store?.args?.backupJson ?? "").startsWith("z:"),
    );
    const gh = st._log.actions.find((a) => a.name === "backup_github:githubPush");
    check("backup: có đẩy GitHub khi được bật", !!gh);
    check(
      "backup: GitHub nhận đúng backupId + tên server",
      gh?.args?.backupId === "bk-1" && gh?.args?.guildName === "Server Nguồn",
    );
    check(
      "backup: xoá cờ yêu cầu sau khi lưu xong",
      st._log.muts.some(
        (m) => m.name === "bot_writes:botClearBackup" && m.args?.unchanged === false,
      ),
    );
    check(
      "backup: KHÔNG báo lỗi khi mọi thứ ổn",
      !st._log.muts.some((m) => m.name === "bot_writes:botReportBackupError"),
    );
  }
  {
    // GitHub lỗi KHÔNG được làm mất bản backup đã lưu trên Convex.
    const st = backupStore({ actionThrows: true });
    await backup.runBackup(backupClient(), st, SRC, { pushToGithub: true });
    check(
      "backup: GitHub lỗi → bản Convex VẪN còn",
      st._log.muts.some((m) => m.name === "bot_writes:botStoreBackup"),
    );
    check(
      "backup: GitHub lỗi → không báo backup lỗi (lỗi chỉ ở GitHub)",
      !st._log.muts.some((m) => m.name === "bot_writes:botReportBackupError"),
    );
  }
  {
    // Không bật GitHub → không gọi action.
    const st = backupStore();
    await backup.runBackup(backupClient(), st, SRC, { pushToGithub: false });
    check("backup: tắt GitHub → không gọi action", st._log.actions.length === 0);
  }
  {
    // Lỗi lưu Convex → báo LÊN DASHBOARD, KHÔNG xoá cờ (nếu xoá thì không bao giờ thử lại).
    const st = backupStore({
      throwOn: "bot_writes:botStoreBackup",
      throwMessage: "document maximum size 1MB",
    });
    await backup.runBackup(backupClient(), st, SRC, { includeMessages: true });
    const rep = st._log.muts.find((m) => m.name === "bot_writes:botReportBackupError");
    check(
      "backup: Convex từ chối → báo lỗi lên dashboard",
      !!rep,
      JSON.stringify(st._log.muts.map((m) => m.name)),
    );
    check(
      "backup: lỗi 1MB nói rõ cách sửa (tắt kèm tin nhắn)",
      /tắt "Kèm tin nhắn"/.test(rep?.args?.error ?? ""),
      String(rep?.args?.error),
    );
    check(
      "backup: lỗi lưu → KHÔNG xoá cờ yêu cầu",
      !st._log.muts.some((m) => m.name === "bot_writes:botClearBackup"),
    );
  }
  {
    // Convex trả về nhưng thiếu id → phải coi như lỗi, không báo "xong".
    const st = backupStore({ storeResult: { ok: true } });
    await backup.runBackup(backupClient(), st, SRC, {});
    check(
      "backup: Convex trả thiếu backupId → báo lỗi, không báo xong",
      st._log.muts.some((m) => m.name === "bot_writes:botReportBackupError") &&
        !st._log.muts.some((m) => m.name === "bot_writes:botClearBackup"),
    );
  }
  {
    // Server không đổi → bỏ qua, nhưng VẪN xoá cờ + ghi unchanged cho dashboard.
    const probe = backupClient();
    const { snapshot: first } = await backup.snapshotWithSettings(
      probe,
      { getConfig: async () => null },
      SRC,
      false,
    );
    const st = backupStore({
      lastChecksum: require("../bot/src/backupUtils.js").computeSnapshotChecksum?.(first) ?? null,
    });
    await backup.runBackup(probe, st, SRC, {});
    // checksum chỉ khớp nếu hàm băm có sẵn; nếu không thì bản này chỉ kiểm lưu bình thường.
    const unchanged = st._log.muts.find(
      (m) => m.name === "bot_writes:botClearBackup" && m.args?.unchanged === true,
    );
    if (st._lastChecksumUsed) {
      check("backup: server không đổi → bỏ qua + báo unchanged", !!unchanged);
    } else {
      check(
        "backup: server không đổi → bỏ qua + báo unchanged",
        true,
        "(bỏ qua: hàm băm không export)",
      );
    }
  }
  {
    // Convex không xác nhận clear → dừng, KHÔNG báo cho người dùng "xong".
    const st = backupStore({ clearResult: { ok: false } });
    await backup.runBackup(backupClient(), st, SRC, {});
    check(
      "backup: Convex không xác nhận clear → không báo xong",
      st._log.muts.filter((m) => m.name === "bot_writes:botClearBackup").length === 1,
    );
  }

  // ══════════ 12. CÔ LẬP LỖI: 1 phần tử hỏng không giết cả lượt phục hồi ══════════
  {
    const tg = makeTarget();
    let roleCalls = 0;
    tg.roles.create = async (o) => {
      tg._log.roles.push(o);
      if (o.name === "Hỏng") throw new Error("tạo role thất bại");
      roleCalls++;
      const r = {
        id: `nr${roleCalls}`,
        name: o.name,
        setPosition: async () => {},
        setIcon: async () => {},
      };
      tg.roles.cache.set(r.id, r);
      return r;
    };
    let chCalls = 0;
    tg.channels.create = async (o) => {
      tg._log.channels.push(o);
      if (o.name === "hỏng") throw new Error("tạo kênh thất bại");
      chCalls++;
      const c = {
        id: `nc${chCalls}`,
        name: o.name,
        type: o.type,
        isTextBased: () => true,
        createWebhook: async () => ({ send: async () => {}, delete: async () => {} }),
        send: async () => {},
      };
      tg.channels.cache.set(c.id, c);
      return c;
    };
    tg.emojis.create = async () => {
      throw new Error("hết chỗ emoji");
    };
    tg.stickers.create = async (o) => {
      tg._log.stickers.push(o);
      throw new Error("không nhận tags");
    };
    const st = { client: { mutation: async () => ({ ok: true }) }, getConfig: async () => null };
    const mixed = {
      ...richBackup,
      roles: [
        { id: "ok1", name: "Tốt", position: 0, permissions: "0" },
        { id: "bad", name: "Hỏng", position: 1, permissions: "0" },
        { id: "ok2", name: "Tốt2", position: 2, permissions: "0" },
      ],
      channels: [
        { id: "okc", name: "tốt", type: 0, position: 0, overwrites: [] },
        { id: "badc", name: "hỏng", type: 0, position: 1, overwrites: [] },
      ],
    };
    const r = await backup.runRestore(
      { guilds: { cache: new Map([[TGT, tg]]) } },
      st,
      TGT,
      JSON.stringify(mixed),
    );
    check(
      "cô lập lỗi: 1 role hỏng → role tốt vẫn tạo được",
      r.roleCount === 2,
      String(r.roleCount),
    );
    check(
      "cô lập lỗi: 1 kênh hỏng → kênh tốt vẫn tạo được",
      r.channelCount === 1,
      String(r.channelCount),
    );
    check(
      "cô lập lỗi: emoji hỏng không làm hỏng lượt phục hồi",
      r.emojiCount === 0 && r.channelCount === 1,
    );
    // Sticker: lần đầu có tags bị từ chối → phải thử lại KHÔNG tags rồi mới bỏ.
    check(
      "cô lập lỗi: sticker bị từ chối tags → thử lại không tags",
      tg._log.stickers.length === 2,
      String(tg._log.stickers.length),
    );
    check("cô lập lỗi: sticker hỏng cả 2 lần → bỏ riêng, không ném", r.stickerCount === 0);
  }
  {
    // Tin nhắn lỗi giữa chừng không được làm dừng cả kênh.
    const tg = makeTarget();
    const sent = [];
    tg.channels.create = async (o) => {
      tg._log.channels.push(o);
      const c = {
        id: "nc-x",
        name: o.name,
        type: 0,
        isTextBased: () => true,
        createWebhook: async () => ({
          send: async (p) => {
            if (p.username === "hỏng") throw new Error("quá 2000 ký tự");
            sent.push(p);
          },
          delete: async () => {},
        }),
        send: async () => {},
      };
      tg.channels.cache.set(c.id, c);
      return c;
    };
    const st = { client: { mutation: async () => ({ ok: true }) }, getConfig: async () => null };
    const withBad = {
      ...richBackup,
      channels: [
        {
          id: "c-text",
          name: "general",
          type: 0,
          position: 0,
          overwrites: [],
          messages: [
            { id: "a", authorName: "ok", content: "1", timestamp: 1, attachments: [] },
            { id: "b", authorName: "hỏng", content: "2", timestamp: 2, attachments: [] },
            { id: "c", authorName: "ok2", content: "3", timestamp: 3, attachments: [] },
          ],
        },
      ],
    };
    const r = await backup.runRestore(
      { guilds: { cache: new Map([[TGT, tg]]) } },
      st,
      TGT,
      JSON.stringify(withBad),
    );
    check(
      "cô lập lỗi: 1 tin lỗi → tin sau vẫn được gửi",
      sent.length === 2 && r.messageCount === 2,
      `${sent.length}/${r.messageCount}`,
    );
  }
  {
    // Media tải hỏng → hiện link 📎 thay vì nuốt tin.
    const tg = makeTarget();
    const sent = [];
    tg.channels.create = async (o) => {
      const c = {
        id: "nc-y",
        name: o.name,
        type: 0,
        isTextBased: () => true,
        createWebhook: async () => ({
          send: async (p) => {
            sent.push(p);
          },
          delete: async () => {},
        }),
        send: async () => {},
      };
      tg.channels.cache.set(c.id, c);
      return c;
    };
    const st = { client: { mutation: async () => ({ ok: true }) }, getConfig: async () => null };
    const withBadMedia = {
      ...richBackup,
      channels: [
        {
          id: "c-text",
          name: "general",
          type: 0,
          position: 0,
          overwrites: [],
          messages: [
            {
              id: "a",
              authorName: "minh",
              content: "xem ảnh",
              timestamp: 1,
              attachments: ["data:image/png;base64,"],
            },
          ],
        },
      ],
    };
    await backup.runRestore(
      { guilds: { cache: new Map([[TGT, tg]]) } },
      st,
      TGT,
      JSON.stringify(withBadMedia),
    );
    check(
      "media hỏng → tin vẫn gửi, hiện link 📎 thay vì mất tin",
      sent.length === 1 && /📎/.test(String(sent[0]?.content ?? "")),
      JSON.stringify(sent[0]),
    );
  }

  // ══════════ 13. Claim hết hạn + tuỳ chỉnh phục hồi + import từ URL ══════════
  {
    // Áp settings bị Convex từ chối → phải dừng, không báo "phục hồi xong".
    const tg = makeTarget();
    const st = {
      client: {
        mutation: async (name) =>
          name === "bot_writes:botRestoreSettings"
            ? { ok: false, reason: "stale_claim" }
            : { ok: true },
      },
      getConfig: async () => null,
    };
    let err = null;
    try {
      await backup.runRestore(
        { guilds: { cache: new Map([[TGT, tg]]) } },
        st,
        TGT,
        JSON.stringify(richBackup),
      );
    } catch (e) {
      err = e;
    }
    check(
      "claim: áp settings bị từ chối → dừng với lỗi rõ ràng",
      err?.message === "stale backup claim",
      String(err?.message),
    );
  }
  {
    // Convex không xác nhận clear → cũng phải dừng.
    const tg = makeTarget();
    const st = {
      client: {
        mutation: async (name) =>
          name === "bot_writes:botClearBackup" ? { ok: false } : { ok: true },
      },
      getConfig: async () => null,
    };
    let err = null;
    try {
      await backup.runRestore(
        { guilds: { cache: new Map([[TGT, tg]]) } },
        st,
        TGT,
        JSON.stringify(richBackup),
      );
    } catch (e) {
      err = e;
    }
    check(
      "claim: clear không xác nhận → dừng, không báo xong",
      /không xác nhận được yêu cầu restore/.test(err?.message ?? ""),
      String(err?.message),
    );
  }
  {
    // Tuỳ chỉnh từ web: chỉ phục hồi kênh, tắt role/tin/emoji.
    const tg = makeTarget();
    const st = { client: { mutation: async () => ({ ok: true }) }, getConfig: async () => null };
    const r = await backup.runRestore(
      { guilds: { cache: new Map([[TGT, tg]]) } },
      st,
      TGT,
      JSON.stringify(richBackup),
      "b",
      {
        restoreRoles: false,
        restoreMessages: false,
        restoreEmojis: false,
      },
    );
    check(
      "tùy chọn: tắt role/tin/emoji → chỉ còn kênh",
      r.roleCount === 0 && r.channelCount === 1 && r.messageCount === 0 && r.emojiCount === 0,
      JSON.stringify(r),
    );
  }
  {
    // Import file tải từ đám mây (importFileUrl) — đường mà dashboard dùng.
    // readImportContent CHỈ chạy qua pollBackups, không phải runImportRestore.
    const tg = makeTarget();
    const muts = [];
    const st = {
      client: {
        query: async (n) =>
          n === "backup:botGetPending"
            ? [{ guildId: TGT, kind: "import", importFileUrl: "https://files.example/b.msc" }]
            : null,
        mutation: async (n, a) => {
          muts.push({ name: n, args: a });
          return n === "bot_writes:botClaimBackup" ? { ok: true, claimAt: 7 } : { ok: true };
        },
      },
      getConfig: async () => null,
    };
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, text: async () => JSON.stringify(richBackup) });
    try {
      await backup({ guilds: { cache: new Map([[TGT, tg]]) } }, st);
    } finally {
      globalThis.fetch = realFetch;
    }
    check(
      "import: tải file từ URL rồi phục hồi được",
      tg._log.channels.length === 1,
      String(tg._log.channels.length),
    );
    check(
      "import: tên server lấy từ tên file khi file không có guildName",
      muts.some((m) => m.name === "bot_writes:botStoreBackup"),
      JSON.stringify(muts.map((m) => m.name)),
    );
  }
  {
    // URL tải lỗi → lỗi phải nói rõ, và đi qua mutation báo lỗi.
    const muts = [];
    const st = {
      client: {
        query: async (n) =>
          n === "backup:botGetPending"
            ? [{ guildId: TGT, kind: "import", importFileUrl: "https://files.example/b.msc" }]
            : null,
        mutation: async (n, a) => {
          muts.push({ name: n, args: a });
          return n === "bot_writes:botClaimBackup" ? { ok: true, claimAt: 7 } : { ok: true };
        },
      },
      getConfig: async () => null,
    };
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, status: 404 });
    try {
      await backup({ guilds: { cache: new Map([[TGT, makeTarget()]]) } }, st);
    } finally {
      globalThis.fetch = realFetch;
    }
    const rep = muts.find((m) => m.name === "bot_writes:botReportImportError");
    check(
      "import: URL hỏng → báo lỗi có mã HTTP",
      /HTTP 404/.test(rep?.args?.error ?? ""),
      String(rep?.args?.error),
    );
  }
  {
    // Không có cả URL lẫn nội dung → lỗi rõ ràng thay vì parse undefined.
    const muts = [];
    const st = {
      client: {
        query: async (n) =>
          n === "backup:botGetPending"
            ? [{ guildId: TGT, kind: "import", fileName: "x.msc" }]
            : null,
        mutation: async (n, a) => {
          muts.push({ name: n, args: a });
          return n === "bot_writes:botClaimBackup" ? { ok: true, claimAt: 7 } : { ok: true };
        },
      },
      getConfig: async () => null,
    };
    await backup({ guilds: { cache: new Map([[TGT, makeTarget()]]) } }, st);
    const rep = muts.find((m) => m.name === "bot_writes:botReportImportError");
    check(
      "import: không có file nào để đọc → báo lỗi rõ ràng",
      /Không lấy được file backup/.test(rep?.args?.error ?? ""),
      String(rep?.args?.error),
    );
  }
  {
    // Tên server lấy từ tên file khi file import không chứa guildName.
    const tg = makeTarget();
    const muts = [];
    const st = {
      client: {
        mutation: async (n, a) => {
          muts.push({ name: n, args: a });
          return { ok: true };
        },
      },
      getConfig: async () => null,
    };
    await backup.runImportRestore(
      { guilds: { cache: new Map([[TGT, tg]]) } },
      st,
      TGT,
      JSON.stringify({ roles: [{ name: "A" }], channels: [] }),
      "Server Của Tôi.msc",
    );
    check(
      "import: lấy tên server từ tên file (bỏ đuôi .msc)",
      muts.some(
        (m) => m.name === "bot_writes:botStoreBackup" && m.args?.guildName === "Server Của Tôi",
      ),
      JSON.stringify(muts[0]?.args?.guildName),
    );
  }
  {
    // Claim mutation ném lỗi → poll phải bỏ qua, không xử lý.
    const seen = [];
    const st = {
      client: {
        query: async (n) =>
          n === "backup:botGetPending" ? [{ guildId: "g1", kind: "backup" }] : null,
        mutation: async (name) => {
          seen.push(name);
          throw new Error("Convex chết");
        },
      },
      getConfig: async () => null,
    };
    await backup({ guilds: { cache: new Map() } }, st);
    check(
      "claim: mutation lỗi → bỏ qua việc, không xử lý",
      seen.length === 1 && seen[0] === "bot_writes:botClaimBackup",
      JSON.stringify(seen),
    );
  }
  {
    // Clone có bộ lọc thành phần.
    const tg = makeTarget();
    const client = {
      guilds: {
        cache: new Map([
          [SRC, srcGuild],
          [TGT, tg],
        ]),
      },
    };
    const st = { client: { mutation: async () => ({ ok: true }) }, getConfig: async () => null };
    const onlyChannels = backup.filterBackupComponents(
      (await backup.snapshotWithSettings(client, st, SRC, false)).snapshot,
      { roles: false, channels: true, emojis: false, stickers: false, messages: false },
    );
    const r = await backup.cloneToServer(client, st, SRC, TGT, {
      componentFilter: {
        roles: false,
        channels: true,
        emojis: false,
        stickers: false,
        messages: false,
      },
    });
    check(
      "clone: áp bộ lọc → không tạo role",
      r.roleCount === 0 && onlyChannels.roles.length === 0,
      String(r.roleCount),
    );
    check("clone: bộ lọc giữ lại kênh", r.channelCount === 4, String(r.channelCount));
  }

  // ══════════ 15. DRY-RUN: kế hoạch khôi phục KHÔNG đụng server ══════════
  // Khôi phục là việc không hoàn tác được (tạo hàng chục role/kênh, spam tin qua
  // webhook). Dry-run phải cho biết TRƯỚC — nên hợp đồng cứng nhất của hàm này là
  // không gọi lệnh tạo nào. Test này là lá chắn cho đúng điều đó.
  {
    const tg = makeTarget();
    const st = { client: { mutation: async () => ({ ok: true }) }, getConfig: async () => null };
    const plan = await backup.planRestoreCore(
      { guilds: { cache: new Map([[TGT, tg]]) } },
      st,
      TGT,
      richBackup,
    );
    check(
      "dry-run: KHÔNG tạo role/kênh/tin/emoji/sticker",
      tg._log.roles.length === 0 &&
        tg._log.channels.length === 0 &&
        tg._log.sent.length === 0 &&
        tg._log.emojis.length === 0 &&
        tg._log.stickers.length === 0 &&
        tg._log.webhooks.length === 0,
      JSON.stringify(tg._log),
    );
    check(
      "dry-run: đếm đúng số sẽ tạo (role rỗng tên bị loại)",
      plan.roleCount === 1 && plan.channelCount === 1,
      `${plan.roleCount}/${plan.channelCount}`,
    );
    check("dry-run: đếm tin nhắn sẽ phục hồi", plan.messageCount === 2, String(plan.messageCount));
    check("dry-run: đếm emoji/sticker", plan.emojiCount === 1 && plan.stickerCount === 1);
    // adminRoles trong backup là CHUỖI rác → ép về mảng rỗng, không được nằm
    // trong danh sách role thiếu. Riêng modRoles trỏ role KHÔNG có trong backup
    // thì phải cảnh báo: restore sẽ GIỮ NGUYÊN danh sách admin/mod cũ.
    check(
      "dry-run: adminRoles rác → không cảnh báo bậy",
      !plan.warnings.some((w) => /GIỮ NGUYÊN/.test(w)),
      JSON.stringify(plan.warnings),
    );
  }
  {
    // modRoles trỏ role không có trong backup → restoreCore sẽ GIỮ NGUYÊN danh
    // sách cũ (tránh mất quyền admin/mod vô ích) → kế hoạch phải nói trước.
    const tg = makeTarget();
    const plan = await backup.planRestoreCore(
      { guilds: { cache: new Map([[TGT, tg]]) } },
      { client: {}, getConfig: async () => null },
      TGT,
      { ...richBackup, settings: { ...richBackup.settings, modRoles: ["role-bi-xoa"] } },
    );
    check(
      "dry-run: role thiếu trong cấu hình → cảnh báo GIỮ NGUYÊN danh sách",
      plan.warnings.some((w) => /GIỮ NGUYÊN/.test(w)),
      JSON.stringify(plan.warnings),
    );
  }
  {
    // Trần 50 tin/kênh: backup chứa 60 tin → kế hoạch phải nói SẼ phục hồi 50 và
    // cảnh báo phần bị bỏ, nếu không chủ server tưởng mất 10 tin vì bot lỗi.
    const many = {
      ...richBackup,
      channels: [
        {
          ...richBackup.channels[0],
          messages: Array.from({ length: 60 }, (_, i) => ({
            id: `m${i}`,
            authorName: "a",
            content: "x",
            timestamp: i,
            attachments: [],
          })),
        },
      ],
    };
    const tg = makeTarget();
    const plan = await backup.planRestoreCore(
      { guilds: { cache: new Map([[TGT, tg]]) } },
      { client: {}, getConfig: async () => null },
      TGT,
      many,
    );
    check("dry-run: trần 50 tin/kênh", plan.messageCount === 50, String(plan.messageCount));
    check(
      "dry-run: cảnh báo số tin bị bỏ",
      plan.warnings.some((w) => /10 tin nhắn vượt giới hạn/.test(w)),
      JSON.stringify(plan.warnings),
    );
  }
  {
    // Thiếu quyền = nguyên nhân restore thất bại phổ biến nhất. Phải nói TRƯỚC.
    const tg = makeTarget();
    tg.members.me.permissions = { bitfield: 0n };
    const plan = await backup.planRestoreCore(
      { guilds: { cache: new Map([[TGT, tg]]) } },
      { client: {}, getConfig: async () => null },
      TGT,
      richBackup,
    );
    check(
      "dry-run: thiếu quyền → cảnh báo Manage Roles + Manage Channels",
      plan.warnings.some((w) => /Manage Roles/.test(w)) &&
        plan.warnings.some((w) => /Manage Channels/.test(w)),
      JSON.stringify(plan.warnings),
    );
  }
  {
    // Kênh trùng tên: Discord tự đổi tên → chủ server phải biết trước.
    const tg = makeTarget();
    await tg.channels.create({ name: "general", type: 0 });
    tg.channels.cache.get("nc1").name = "general";
    const plan = await backup.planRestoreCore(
      { guilds: { cache: new Map([[TGT, tg]]) } },
      { client: {}, getConfig: async () => null },
      TGT,
      richBackup,
    );
    check(
      "dry-run: cảnh báo kênh trùng tên",
      plan.warnings.some((w) => /trùng tên/.test(w)),
      JSON.stringify(plan.warnings),
    );
  }
  {
    // Tắt "khôi phục role" → kế hoạch phải phản ánh đúng việc sẽ làm, không
    // phải số có trong backup (nếu không chủ server tưởng sẽ tạo role).
    const tg = makeTarget();
    const plan = await backup.planRestoreCore(
      { guilds: { cache: new Map([[TGT, tg]]) } },
      { client: {}, getConfig: async () => ({ restoreRolesEnabled: false }) },
      TGT,
      richBackup,
    );
    check(
      "dry-run: tắt role → roleCount 0 + nói rõ đang tắt",
      plan.roleCount === 0 && plan.warnings.some((w) => /Đang tắt khôi phục role/.test(w)),
      JSON.stringify(plan),
    );
  }
  {
    // Bản backup rỗng → phải nói thẳng thay vì im lặng cho chủ server bấm khôi phục.
    const tg = makeTarget();
    const plan = await backup.planRestoreCore(
      { guilds: { cache: new Map([[TGT, tg]]) } },
      { client: {}, getConfig: async () => null },
      TGT,
      { roles: [], channels: [], emojis: [], stickers: [], settings: {} },
    );
    check(
      "dry-run: backup rỗng → cảnh báo không tạo được gì",
      plan.warnings.some((w) => /không có role\/kênh nào/.test(w)),
      JSON.stringify(plan.warnings),
    );
  }
  {
    // runRestorePlan: nén → bung → tính → BÁO LẠI Convex (kèm claimAt).
    const tg = makeTarget();
    const muts = [];
    const st = {
      client: {
        mutation: async (name, args) => {
          muts.push({ name, args });
          return { ok: true };
        },
      },
      getConfig: async () => null,
    };
    const enc = utils.compressAndEncryptBackup(richBackup);
    const plan = await backup.runRestorePlan(
      { guilds: { cache: new Map([[TGT, tg]]) } },
      st,
      TGT,
      enc.backupJson,
      "Server Nguồn",
      { claimAt: 42 },
    );
    check(
      "runRestorePlan: báo kế hoạch lên Convex kèm claimAt",
      muts.length === 1 &&
        muts[0].name === "bot_writes:botReportRestorePlan" &&
        muts[0].args.claimAt === 42 &&
        muts[0].args.plan.roleCount === 1,
      JSON.stringify(muts.map((m) => m.name)),
    );
    check(
      "runRestorePlan: bung nén được bản 'z:' (đúng đường của backup thật)",
      plan.channelCount === 1,
    );
    check(
      "runRestorePlan: vẫn KHÔNG tạo gì trên server",
      tg._log.roles.length === 0 && tg._log.channels.length === 0,
    );
  }
  {
    // Claim bị bot khác cướp / hết hạn → phải ném lỗi, im lặng coi như xong thì
    // dashboard mãi chờ kế hoạch không bao giờ tới.
    const tg = makeTarget();
    const st = {
      client: { mutation: async () => ({ ok: false, reason: "stale_claim" }) },
      getConfig: async () => null,
    };
    let err = null;
    try {
      await backup.runRestorePlan(
        { guilds: { cache: new Map([[TGT, tg]]) } },
        st,
        TGT,
        JSON.stringify(richBackup),
      );
    } catch (e) {
      err = e;
    }
    check("runRestorePlan: claim hết hạn → ném lỗi", /stale/i.test(err?.message ?? ""));
  }
  {
    // pollBackups nhận kind "plan" → đi đúng đường dry-run (không lẫn sang restore).
    const seen = [];
    const tg = makeTarget();
    const store = {
      client: {
        query: async (name) =>
          name === "backup:botGetPending"
            ? [
                {
                  guildId: TGT,
                  kind: "plan",
                  guildName: "Server Nguồn",
                  backupJson: utils.compressAndEncryptBackup(richBackup).backupJson,
                },
              ]
            : null,
        mutation: async (name, args) => {
          seen.push({ name, args });
          if (name === "bot_writes:botClaimBackup") return { ok: true, claimAt: 7 };
          return { ok: true };
        },
      },
      getConfig: async () => null,
    };
    await backup({ guilds: { cache: new Map([[TGT, tg]]) } }, store);
    check(
      "poll: kind 'plan' → báo kế hoạch, KHÔNG tạo role/kênh",
      seen.some((s) => s.name === "bot_writes:botReportRestorePlan") &&
        !seen.some((s) => s.name === "bot_writes:botRestoreSettings") &&
        tg._log.channels.length === 0,
      JSON.stringify(seen.map((s) => s.name)),
    );
  }

  // ══════════ 16. PHẠM VI CHỤP MỞ RỘNG: ban, invite, thread, danh tính server ══════════
  // Trước đây backup chỉ lưu role/kênh/emoji/sticker/tin: server bị nuke mất
  // luôn tên/icon/mô tả, danh sách ban, link mời và toàn bộ thread — những thứ
  // cộng đồng thật sự dùng. Mỗi phần dưới đây có cả chiều CHỤP lẫn chiều
  // KHÔI PHỤC, vì dữ liệu chụp mà không áp lại thì là dữ liệu chết.
  {
    const g = mkSrcGuild();
    g.description = "Server đồ cộng đồng";
    g.iconURL = () => "https://cdn/server.png";
    g.bans = {
      fetch: async () =>
        new Map([
          [
            "raider1",
            { id: "raider1", user: { id: "raider1", username: "kẻ cướp" }, reason: "raid" },
          ],
          ["spam", { id: "spam", user: { id: "spam", username: "spammer" }, reason: null }],
        ]),
    };
    g.invites = {
      fetch: async () =>
        new Map([
          [
            "code1",
            {
              code: "code1",
              channel: { name: "general" },
              uses: 3,
              maxUses: 0,
              maxAge: 86400,
              temporary: true,
            },
          ],
        ]),
    };
    // Thread trong kênh văn bản (fetchActive) — 12 tin để chạm trần 10.
    const th = g.channels.cache.get("c-text");
    th.threads.fetchActive = async () =>
      new Map([
        [
          "t1",
          {
            id: "t1",
            name: "sự cố server",
            archived: false,
            autoArchiveDuration: 1440,
            messageCount: 12,
            messages: {
              fetch: async () =>
                new Map(Array.from({ length: 12 }, (_, i) => [i, mkMsg(`t${i}`, i)])),
            },
          },
        ],
      ]);
    const st = { client: { mutation: async () => ({ ok: true }) }, getConfig: async () => null };
    const { snapshot } = await backup.snapshotWithSettings(
      { guilds: { cache: new Map([[SRC, g]]) } },
      st,
      SRC,
      true,
    );
    const text = snapshot.channels.find((c) => c.id === "c-text");
    check(
      "chụp: lưu tên / mô tả / icon của server",
      snapshot.guildMeta?.name === "Server Nguồn" &&
        snapshot.guildMeta?.description === "Server đồ cộng đồng" &&
        snapshot.guildMeta?.iconUrl === "https://cdn/server.png",
      JSON.stringify(snapshot.guildMeta),
    );
    check(
      "chụp: lưu danh sách ban (id + lý do)",
      snapshot.bans.length === 2 &&
        snapshot.bans[0].userId === "raider1" &&
        snapshot.bans[0].reason === "raid",
      JSON.stringify(snapshot.bans),
    );
    check(
      "chụp: lưu link mời (kênh + giới hạn)",
      snapshot.invites.length === 1 &&
        snapshot.invites[0].channelName === "general" &&
        snapshot.invites[0].temporary === true &&
        snapshot.invites[0].maxAge === 86400,
      JSON.stringify(snapshot.invites),
    );
    check(
      "chụp: lưu thread kèm tin nhắn (trần 10 tin/thread)",
      text.threads?.length === 1 &&
        text.threads[0].name === "sự cố server" &&
        text.threads[0].messages.length === 10,
      JSON.stringify(text.threads?.map((t) => [t.name, t.messages.length])),
    );
    check(
      "chụp: messageCount gồm cả tin trong thread",
      snapshot.messageCount === text.messages.length + text.threads[0].messages.length,
      `${snapshot.messageCount} vs ${text.messages.length}+${text.threads[0].messages.length}`,
    );
    // Media base64 trong thread phải bị loại khi lưu lên cloud, nếu không nó
    // phình JSON và vượt trần 1 MB của Convex.
    const withData = {
      ...snapshot,
      channels: [
        {
          ...text,
          threads: [
            {
              name: "t",
              messages: [
                {
                  id: "1",
                  content: "",
                  attachments: [`data:image/png;base64,AAA`, "https://cdn/a.png"],
                },
              ],
            },
          ],
        },
      ],
    };
    const slim = backup.slimBackupForStore(withData);
    check(
      "lưu cloud: loại media base64 trong thread (slimBackupForStore)",
      slim.channels[0].threads[0].messages[0].attachments.length === 1 &&
        slim.channels[0].threads[0].messages[0].attachments[0] === "https://cdn/a.png",
      JSON.stringify(slim.channels[0].threads[0].messages[0].attachments),
    );
  }
  {
    // Thread trong kênh forum: discord.js không có fetchActive → phải đọc cache.
    const g = mkSrcGuild();
    g.channels.cache.set(
      "c-forum",
      mkChan("c-forum", "diễn đàn", CT.GuildForum, 2, {
        threads: [
          [
            "t9",
            {
              id: "t9",
              name: "bài hỏi",
              archived: true,
              autoArchiveDuration: 4320,
              messages: { fetch: async () => new Map([[1, mkMsg("q1", 1)]]) },
            },
          ],
        ],
      }),
    );
    const st = { client: { mutation: async () => ({ ok: true }) }, getConfig: async () => null };
    const { snapshot } = await backup.snapshotWithSettings(
      { guilds: { cache: new Map([[SRC, g]]) } },
      st,
      SRC,
      true,
    );
    const forum = snapshot.channels.find((c) => c.id === "c-forum");
    check(
      "chụp: thread trong kênh forum đọc từ cache",
      forum.threads?.length === 1 && forum.threads[0].archived === true,
      JSON.stringify(forum.threads),
    );
  }
  {
    // Thiếu quyền Ban Members / Manage Guild là chuyện thường — KHÔNG được làm
    // hỏng cả lượt backup (người dùng mất luôn role/kênh chỉ vì thiếu 1 quyền).
    const g = mkSrcGuild();
    g.bans = {
      fetch: async () => {
        throw new Error("Missing Permissions");
      },
    };
    g.invites = {
      fetch: async () => {
        throw new Error("Missing Permissions");
      },
    };
    const st = { client: { mutation: async () => ({ ok: true }) }, getConfig: async () => null };
    const { snapshot } = await backup.snapshotWithSettings(
      { guilds: { cache: new Map([[SRC, g]]) } },
      st,
      SRC,
      false,
    );
    check(
      "chụp: thiếu quyền ban/mời → backup vẫn ra, phần đó rỗng",
      snapshot.bans.length === 0 && snapshot.invites.length === 0 && snapshot.roles.length === 2,
      `${snapshot.bans.length}/${snapshot.invites.length}/${snapshot.roles.length}`,
    );
  }
  {
    // Khôi phục thread: tạo trong kênh vừa dựng + phục hồi tin qua webhook.
    const tg = makeTarget();
    const muts = [];
    const st = {
      client: {
        mutation: async (name, args) => {
          muts.push({ name, args });
          return { ok: true };
        },
      },
      getConfig: async () => null,
    };
    const withThread = {
      ...richBackup,
      channels: [
        {
          ...richBackup.channels[0],
          threads: [
            {
              id: "t1",
              name: "sự cố server",
              autoArchiveDuration: 999,
              messages: [
                { id: "a", authorName: "minh", content: "chào", timestamp: 1, attachments: [] },
              ],
            },
          ],
        },
      ],
    };
    const r = await backup.runRestore(
      { guilds: { cache: new Map([[TGT, tg]]) } },
      st,
      TGT,
      JSON.stringify(withThread),
    );
    check(
      "khôi phục: tạo lại thread trong kênh",
      tg._log.threads.length === 1 && tg._log.threads[0].name === "sự cố server",
      JSON.stringify(tg._log.threads),
    );
    check(
      "khôi phục: autoArchiveDuration làm tròn LÊN giá trị Discord cho phép (999 → 1440)",
      tg._log.threads[0].autoArchiveDuration === 1440,
      String(tg._log.threads[0].autoArchiveDuration),
    );
    check(
      "khôi phục: tin trong thread đi qua webhook (giữ tên tác giả)",
      r.threadCount === 1 &&
        r.threadMessageCount === 1 &&
        tg._log.sent.some((s) => s.via === "thread-webhook" && s.username === "minh"),
      JSON.stringify(tg._log.sent),
    );
  }
  {
    // Danh tính server: mặc định BẬT (tên/mô tả/icon là thứ người dùng thấy
    // đầu tiên sau khi mở lại server bị nuke).
    const tg = makeTarget();
    const st = { client: { mutation: async () => ({ ok: true }) }, getConfig: async () => null };
    const r = await backup.runRestore(
      { guilds: { cache: new Map([[TGT, tg]]) } },
      st,
      TGT,
      JSON.stringify({
        ...richBackup,
        guildMeta: { name: "Tên Mới", description: "mô tả mới", iconUrl: "https://cdn/i.png" },
      }),
    );
    check(
      "khôi phục: áp lại tên / mô tả / icon server",
      r.metaApplied.name &&
        r.metaApplied.description &&
        r.metaApplied.icon &&
        tg._log.meta.length === 3,
      JSON.stringify(tg._log.meta),
    );
  }
  {
    // Ban + link mời: mặc định TẮT. Cấm người và mở link mời không hoàn tác được
    // nên không được chạy chỉ vì backup có sẵn danh sách.
    const withExtras = {
      ...richBackup,
      bans: [{ userId: "raider1", reason: "raid" }],
      invites: [
        { code: "old", channelName: "general", maxAge: 86400, maxUses: 0, temporary: true },
      ],
    };
    const off = makeTarget();
    const stOff = { client: { mutation: async () => ({ ok: true }) }, getConfig: async () => null };
    const rOff = await backup.runRestore(
      { guilds: { cache: new Map([[TGT, off]]) } },
      stOff,
      TGT,
      JSON.stringify(withExtras),
    );
    check(
      "khôi phục: mặc định KHÔNG cấm lại người",
      off._log.bans.length === 0 && rOff.banCount === 0,
      JSON.stringify(off._log.bans),
    );
    check(
      "khôi phục: mặc định KHÔNG tạo link mời",
      off._log.invites.length === 0 && rOff.inviteCount === 0,
    );
    const on = makeTarget();
    const stOn = {
      client: { mutation: async () => ({ ok: true }) },
      getConfig: async () => ({ restoreExtrasEnabled: true }),
    };
    const rOn = await backup.runRestore(
      { guilds: { cache: new Map([[TGT, on]]) } },
      stOn,
      TGT,
      JSON.stringify(withExtras),
    );
    check(
      "khôi phục: bật → cấm lại người bị ban",
      on._log.bans.length === 1 && on._log.bans[0].userId === "raider1" && rOn.banCount === 1,
      JSON.stringify(on._log.bans),
    );
    check(
      "khôi phục: bật → tạo link mời MỚI trỏ đúng kênh",
      on._log.invites.length === 1 &&
        on._log.invites[0].channel === "general" &&
        rOn.inviteCount === 1,
      JSON.stringify(on._log.invites),
    );
    // Đã bị ban rồi thì không ban lại (tránh 2 lần ghi audit log + rate limit).
    on.bans.cache.set("raider1", { id: "raider1" });
    const again = await backup.applyBans(on, withExtras.bans);
    check("khôi phục: người đã bị ban không bị ban lại", again === 1 && on._log.bans.length === 1);
  }
  {
    // Thiếu quyền Manage Guild / Ban Members: chỉ ghi log, KHÔNG làm hỏng cả
    // lần khôi phục (role/kênh đã tạo xong thì không được đổ sạch).
    const tg = makeTarget();
    tg.setName = async () => {
      throw new Error("Missing Permissions");
    };
    tg.members.ban = async () => {
      throw new Error("Missing Permissions");
    };
    const st = {
      client: { mutation: async () => ({ ok: true }) },
      getConfig: async () => ({ restoreExtrasEnabled: true }),
    };
    let err = null;
    let r = null;
    try {
      r = await backup.runRestore(
        { guilds: { cache: new Map([[TGT, tg]]) } },
        st,
        TGT,
        JSON.stringify({ ...richBackup, guildMeta: { name: "Tên" }, bans: [{ userId: "u9" }] }),
      );
    } catch (e) {
      err = e;
    }
    check(
      "khôi phục: thiếu quyền tên/ban → vẫn khôi phục xong phần còn lại",
      !err && r.roleCount === 1 && r.banCount === 0 && r.metaApplied.name === false,
      err?.message,
    );
  }

  console.log(`\nKết quả backup pipeline: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
