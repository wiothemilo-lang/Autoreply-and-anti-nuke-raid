// Test backupUtils.js — nén/giải nén, checksum, mã hóa AES-256-GCM, filter thành phần.
// Không mạng, không DB. Chạy: node scripts/test-backup-utils.cjs
const utils = require("../bot/src/backupUtils.js");

let pass = 0;
let fail = 0;
function check(label, cond) {
  if (cond) {
    pass++;
    console.log("PASS", label);
  } else {
    fail++;
    console.log("FAIL", label);
  }
}

// ── 1. Nén / giải nén round-trip ──
{
  const json = JSON.stringify({ roles: [{ id: "r1" }], channels: [], note: "tiếng Việt" });
  const compressed = utils.compressBackup(json);
  check("compressBackup trả tiền tố z:", compressed.startsWith("z:"));
  check("uncompressBackup khôi phục nguyên vẹn", utils.uncompressBackup(compressed) === json);
  check("uncompressBackup chuỗi thường → trả nguyên", utils.uncompressBackup("plain") === "plain");

  // Payload lớn lặp lại (giống backup thật) → nén phải nhỏ hơn đáng kể.
  const bigJson = JSON.stringify({
    channels: Array.from({ length: 200 }, (_, i) => ({
      id: "channel-" + i,
      name: "kenh-chung-" + i,
      messages: Array.from({ length: 20 }, (_, j) => ({
        id: "m" + j,
        content: "nội dung lặp lại",
      })),
    })),
  });
  const bigCompressed = utils.compressBackup(bigJson);
  check("compressBackup payload lớn → nhỏ hơn nhiều", bigCompressed.length < bigJson.length / 2);
  check("nén payload lớn → giải nén đúng", utils.uncompressBackup(bigCompressed) === bigJson);
}

// ── 2. Giải nén dữ liệu hỏng → trả nguyên, không throw ──
{
  const bad = "z:khong-phai-base64-hop-le";
  const out = utils.uncompressBackup(bad);
  check("uncompressBackup dữ liệu hỏng → trả nguyên (không crash)", out === bad);
}

// ── 3. Checksum ──
{
  const a = utils.computeChecksum("hello");
  const b = utils.computeChecksum("hello");
  const c = utils.computeChecksum("hello!");
  check("checksum ổn định", a === b && a.length === 64);
  check("checksum khác nội dung → khác", a !== c);

  const snap1 = {
    roles: [{ id: "r" }],
    channels: [],
    emojis: [],
    stickers: [],
    settings: { a: 1 },
  };
  const snap2 = { ...snap1, capturedAt: 123, name: "backup mới" };
  check(
    "snapshotChecksum bỏ qua trường biến động",
    utils.computeSnapshotChecksum(snap1) === utils.computeSnapshotChecksum(snap2),
  );
  const snap3 = { ...snap1, roles: [{ id: "r2" }] };
  check(
    "snapshotChecksum đổi khi nội dung đổi",
    utils.computeSnapshotChecksum(snap1) !== utils.computeSnapshotChecksum(snap3),
  );
  // P2: bản đồ thành viên ↔ vai trò phải nằm trong phần "ổn định". Nếu thiếu,
  // đổi vai trò của một thành viên sẽ bị incremental bỏ qua âm thầm và bản gần
  // nhất giữ nguyên vai trò đã lỗi thời.
  const snap4 = { ...snap1, members: [{ userId: "u1", roles: ["r1"] }] };
  check(
    "snapshotChecksum đổi khi bản đồ vai trò thành viên đổi",
    utils.computeSnapshotChecksum(snap1) !== utils.computeSnapshotChecksum(snap4),
  );
}

// ── 4. Mã hóa / giải mã ──
{
  const secret = "khoa-bi-mat";
  const plain = JSON.stringify({ x: 1, y: "dữ liệu" });
  const enc = utils.encryptBackup(plain, secret);
  check("encryptBackup trả tiền tố e:", enc.startsWith("e:"));
  check("encryptBackup không lộ plaintext", !enc.includes("dữ liệu"));
  check("decryptBackup khôi phục nguyên vẹn", utils.decryptBackup(enc, secret) === plain);

  check("encryptBackup không có secret → trả nguyên", utils.encryptBackup(plain, null) === plain);
  check("decryptBackup không có secret → trả nguyên", utils.decryptBackup(enc, null) === enc);
  check(
    "decryptBackup chuỗi không mã hóa → trả nguyên",
    utils.decryptBackup("plain", secret) === "plain",
  );
  check(
    "decryptBackup sai khóa → trả nguyên (không crash)",
    utils.decryptBackup(enc, "sai-khoa") === enc,
  );
}

// ── 5. Combined: compress + encrypt ──
{
  const snapshot = { roles: [{ id: "r1" }], channels: [{ id: "c1", messages: [{ id: "m" }] }] };
  process.env.BACKUP_ENCRYPT_KEY = "khoa-combined";
  const packed = utils.compressAndEncryptBackup(snapshot);
  check("compressAndEncryptBackup báo compressed", packed.compressed === true);
  check("compressAndEncryptBackup báo encrypted khi có khóa", packed.encrypted === true);
  check(
    "compressAndEncryptBackup có checksum",
    typeof packed.checksum === "string" && packed.checksum.length === 64,
  );
  const restored = utils.decompressAndDecryptBackup(packed.backupJson);
  check("decompressAndDecryptBackup round-trip khớp", restored === JSON.stringify(snapshot));
  delete process.env.BACKUP_ENCRYPT_KEY;
}

// ── 6. Combined không mã hóa ──
{
  delete process.env.BACKUP_ENCRYPT_KEY;
  const snapshot = { roles: [], channels: [] };
  const packed = utils.compressAndEncryptBackup(snapshot);
  check("không có khóa → encrypted false", packed.encrypted === false);
  check(
    "không có khóa → vẫn giải nén đúng",
    utils.decompressAndDecryptBackup(packed.backupJson) === JSON.stringify(snapshot),
  );
}

// ── 7. getEncryptionKey đọc env ──
{
  delete process.env.BACKUP_ENCRYPT_KEY;
  check("getEncryptionKey không có env → null", utils.getEncryptionKey() === null);
  process.env.BACKUP_ENCRYPT_KEY = "abc";
  check("getEncryptionKey có env → giá trị", utils.getEncryptionKey() === "abc");
  delete process.env.BACKUP_ENCRYPT_KEY;
}

// ── 8. filterBackupComponents ──
{
  const backup = {
    roles: [{ id: "r" }],
    channels: [
      { id: "c1", messages: [{ id: "m1" }, { id: "m2" }] },
      { id: "c2", messages: [{ id: "m3" }] },
    ],
    emojis: [{ id: "e" }],
    stickers: [{ id: "s" }],
  };

  const noMessages = utils.filterBackupComponents(backup, { messages: false });
  check(
    "filter tắt messages → xóa tin trong kênh",
    noMessages.channels.every((c) => c.messages.length === 0),
  );
  check("filter tắt messages → messageCount = 0", noMessages.messageCount === 0);
  check(
    "filter giữ roles/channels",
    noMessages.roles.length === 1 && noMessages.channels.length === 2,
  );

  const onlyRoles = utils.filterBackupComponents(backup, {
    channels: false,
    emojis: false,
    stickers: false,
  });
  check(
    "filter chỉ roles → mảng khác rỗng",
    onlyRoles.channels.length === 0 &&
      onlyRoles.emojis.length === 0 &&
      onlyRoles.stickers.length === 0,
  );
  check("filter cập nhật count", onlyRoles.roleCount === 1 && onlyRoles.channelCount === 0);

  const all = utils.filterBackupComponents(backup, {});
  check("filter rỗng → giữ nguyên dữ liệu", all.roles.length === 1 && all.channels.length === 2);
  check("filter rỗng → messageCount đúng", all.messageCount === 3);

  // Dữ liệu sai kiểu (channels không phải mảng) — filter không được ném.
  let badThrew = "";
  let badOut;
  try {
    badOut = utils.filterBackupComponents({ channels: "x" }, { messages: false });
  } catch (e) {
    badThrew = e.message;
  }
  check("channels sai kiểu → không ném", badThrew === "", badThrew);
  check("channels sai kiểu → ép về mảng rỗng", Array.isArray(badOut?.channels));

  let objThrew = "";
  try {
    utils.filterBackupComponents({ channels: { a: 1 } }, {});
  } catch (e) {
    objThrew = e.message;
  }
  check("channels dạng object → không ném", objThrew === "", objThrew);
}

// ── 6. Decompression bomb: zlib "z:" nhỏ nhưng bung ra cực lớn ──
// File import tối đa 8 MB, nhưng zlib có thể nở gấp ~1000 lần → 200 MB từ vài
// trăm KB. uncompressBackup phải chặn trần output, không để VPS hết RAM.
{
  const zlib = require("zlib");
  const bomb = "z:" + zlib.deflateSync(Buffer.alloc(200 * 1024 * 1024, 0x41)).toString("base64");
  check("bomb nén nhỏ (< 1 MB)", bomb.length < 1_000_000);
  let threw = false;
  let out;
  try {
    out = utils.uncompressBackup(bomb);
  } catch {
    threw = true;
  }
  // Kỳ vọng: KHÔNG trả chuỗi 200 MB (hoặc ném lỗi có kiểm soát). Trả về nguyên
  // input cũng chấp nhận (fail-safe như dữ liệu hỏng) miễn không phình RAM.
  const capped =
    threw || out === bomb || (typeof out === "string" && out.length <= 16 * 1024 * 1024);
  check("uncompressBackup chặn decompression bomb", capped, threw ? "threw" : `len=${out?.length}`);
}

console.log(`\nKết quả backup utils: ${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
