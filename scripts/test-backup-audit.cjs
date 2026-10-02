// TEST backupAudit — phân loại backup THẬT/FAKE/SUSPECT (bot/src/backupAudit.js).
// Chạy: node scripts/test-backup-audit.cjs
//
// Bug không bị bắt nếu thiếu suite này: phân loại sai bản hỏng thành thật
// (nén bung lỗi, JSON cắt cụt, thiếu roles/channels, checksum lệch, nguồn lạ,
// mã hóa thiếu key) → script audit xóa nhầm bản tốt HOẶC giữ lại bản rác.
const zlib = require("zlib");
const crypto = require("crypto");
const audit = require("../bot/src/backupAudit");

let pass = 0;
let fail = 0;
const check = (label, ok) => {
  if (ok) pass++;
  else {
    fail++;
    console.error(`FAIL: ${label}`);
  }
};

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const pack = (obj) => "z:" + zlib.deflateSync(Buffer.from(JSON.stringify(obj))).toString("base64");

function makeSnapshot(overrides = {}) {
  return {
    version: 4,
    guildId: "g1",
    guildName: "G1",
    createdAt: 1_700_000_000_000,
    roles: [{ id: "r1", name: "Member", permissions: "1024" }],
    channels: [{ id: "c1", name: "general", type: 0, overwrites: [] }],
    emojis: [],
    stickers: [],
    ...overrides,
  };
}

(async () => {
  // ── unpackBackupJson ──
  {
    const snap = makeSnapshot();
    const packed = pack(snap);
    const u1 = audit.unpackBackupJson(packed);
    check("unpack: bản nén 'z:' bung đúng", u1.error === null && u1.json.guildId === "g1");
    const u2 = audit.unpackBackupJson(JSON.stringify(snap));
    check("unpack: JSON thô (bản cũ) vẫn đọc được", u2.error === null && u2.json.version === 4);
    const u3 = audit.unpackBackupJson("z:!!!không-phải-base64!!!");
    check("unpack: base64 hỏng → lỗi rõ ràng", u3.json === null && /bung|zlib/.test(u3.error));
    const u4 = audit.unpackBackupJson("z:" + Buffer.from("không phải zlib").toString("base64"));
    check("unpack: zlib stream hỏng → lỗi", u4.json === null);
    const u5 = audit.unpackBackupJson("{cắt cụt");
    check("unpack: JSON cắt cụt → lỗi parse", u5.json === null && /parse/.test(u5.error));
    const u6 = audit.unpackBackupJson("");
    check("unpack: rỗng → lỗi", u6.json === null);
    const u7 = audit.unpackBackupJson("e:AAAA");
    check(
      "unpack: mã hóa thiếu key → lỗi (không crash)",
      u7.json === null && /BACKUP_ENCRYPT_KEY/.test(u7.error),
    );
  }

  // ── classifyBackup: REAL ──
  {
    const snap = makeSnapshot();
    const row = {
      _id: "b1",
      guildId: "g1",
      guildName: "G1",
      backupJson: pack(snap),
      roleCount: 1,
      channelCount: 1,
      source: "backup",
      backupChecksum: sha(JSON.stringify(snap)),
      createdAt: 1_700_000_000_000,
    };
    const v = audit.classifyBackup(row);
    check("real: bản chuẩn nén + checksum khớp", v.verdict === "real" && v.reasons.length === 0);
  }
  {
    // Bản cũ không có checksum/source (schema optional) — vẫn real.
    const row = {
      _id: "b2",
      guildId: "g1",
      backupJson: pack(makeSnapshot()),
      roleCount: 1,
      channelCount: 1,
    };
    check(
      "real: không checksum → không so (không nghi oan)",
      audit.classifyBackup(row).verdict === "real",
    );
  }

  // ── classifyBackup: FAKE ──
  {
    const v = audit.classifyBackup({ _id: "f1", backupJson: "z:!!!hỏng!!!" });
    check("fake: nén hỏng → fake", v.verdict === "fake");
  }
  {
    const v = audit.classifyBackup({ _id: "f2", backupJson: "" });
    check("fake: backupJson rỗng → fake", v.verdict === "fake");
  }
  {
    const v = audit.classifyBackup({ _id: "f3", backupJson: JSON.stringify({ foo: 1 }) });
    check(
      "fake: JSON parse được nhưng thiếu cấu trúc snapshot → fake",
      v.verdict === "fake" && v.reasons.some((r) => r.includes("guildId")),
    );
  }
  {
    // REGRESSION: file import (.msc/.json) hợp lệ thường KHÔNG có guildId nhưng
    // vẫn khôi phục được role/kênh. Trước đây xếp "fake" → audit --fix XÓA NHẦM
    // backup thật. Phải là "suspect" (báo để xem tay, KHÔNG tự xóa).
    const snap = {
      guildName: "Server Nuke",
      roles: [{ id: "r1", name: "Admin", permissions: "8" }],
      channels: [{ id: "c1", name: "general", type: 0, overwrites: [] }],
    };
    const v = audit.classifyBackup({ _id: "imp", backupJson: pack(snap) });
    check(
      "import thiếu guildId nhưng có roles/channels → suspect (không xóa nhầm)",
      v.verdict === "suspect" && v.reasons.some((r) => r.includes("guildId")),
    );
  }
  {
    const snap = { guildId: "g1", roles: "không-phải-mảng", channels: [] };
    const v = audit.classifyBackup({ _id: "f4", backupJson: pack(snap) });
    check("fake: roles không phải mảng → fake", v.verdict === "fake");
  }
  {
    const v = audit.classifyBackup({ _id: "f5", backupJson: null });
    check("fake: thiếu backupJson → fake", v.verdict === "fake");
  }

  // ── classifyBackup: SUSPECT ──
  {
    const snap = makeSnapshot();
    const row = {
      _id: "s1",
      guildId: "g1",
      backupJson: pack(snap),
      roleCount: 1,
      channelCount: 1,
      backupChecksum: sha("nội-dung-khác"), // checksum không khớp
    };
    const v = audit.classifyBackup(row);
    check(
      "suspect: checksum lệch → suspect (không phải fake — giữ làm bằng chứng)",
      v.verdict === "suspect",
    );
  }
  {
    const snap = makeSnapshot();
    const row = {
      _id: "s2",
      guildId: "g1",
      backupJson: pack(snap),
      roleCount: 5, // metadata lệch nội dung (1)
      channelCount: 1,
    };
    const v = audit.classifyBackup(row);
    check(
      "suspect: roleCount lệch → suspect",
      v.verdict === "suspect" && v.reasons.some((r) => r.includes("roleCount")),
    );
  }
  {
    const row = {
      _id: "s3",
      guildId: "g1",
      backupJson: pack(makeSnapshot()),
      roleCount: 1,
      channelCount: 1,
      source: "hack",
    };
    const v = audit.classifyBackup(row);
    check(
      "suspect: nguồn lạ → có lý do nguồn lạ",
      v.reasons.some((r) => r.includes("nguồn lạ")),
    );
  }

  // ── summarize ──
  {
    const snap = makeSnapshot();
    const rows = [
      { _id: "a", backupJson: pack(snap), roleCount: 1, channelCount: 1 }, // real
      { _id: "b", backupJson: "z:!!!" }, // fake
      { _id: "c", backupJson: pack(snap), roleCount: 9, channelCount: 1 }, // suspect
    ];
    const s = audit.summarize(rows);
    check(
      "summarize: đếm đúng 1/1/1",
      s.real === 1 && s.fake === 1 && s.suspect === 1 && s.total === 3,
    );
  }

  // ── Chống xóa nhầm: bản REAL chuẩn của bot (đúng path production) ──
  {
    // Mô phỏng đúng luồng production: snapshot → compressAndEncryptBackup → row.
    delete process.env.BACKUP_ENCRYPT_KEY;
    const utils = require("../bot/src/backupUtils");
    const snap = makeSnapshot({
      roles: Array.from({ length: 30 }, (_, i) => ({
        id: "r" + i,
        name: "R" + i,
        permissions: "0",
      })),
    });
    const { backupJson, checksum } = utils.compressAndEncryptBackup(snap);
    const row = {
      _id: "prod",
      guildId: "g1",
      backupJson,
      roleCount: 30,
      channelCount: 1,
      backupChecksum: checksum,
    };
    const v = audit.classifyBackup(row);
    check("production path: bản từ backupUtils thật → real (chống xóa nhầm)", v.verdict === "real");
  }

  // ── verifyBackup: báo cáo cho lệnh /backup verify (chỉ đọc) ──
  {
    const snap = makeSnapshot({
      emojis: [
        { id: "e1", name: "pepe" },
        { id: "e2", name: "cat" },
      ],
      stickers: [{ id: "s1", name: "wave" }],
      channels: [
        { id: "c1", name: "general", type: 0, overwrites: [], messages: [{}, {}] },
        { id: "c2", name: "chat", type: 0, overwrites: [], messages: [{}] },
      ],
    });
    const row = {
      _id: "v1",
      guildName: "G1",
      backupJson: pack(snap),
      roleCount: 1,
      channelCount: 2,
      emojiCount: 2,
      stickerCount: 1,
      messageCount: 3,
      backupChecksum: sha(JSON.stringify(snap)),
    };
    const r = audit.verifyBackup(row);
    check(
      "verify: bản chuẩn → ok, đếm đúng 1 role/2 kênh/2 emoji/1 sticker/3 tin",
      r.ok &&
        r.verdict === "real" &&
        r.counts.roles === 1 &&
        r.counts.channels === 2 &&
        r.counts.emojis === 2 &&
        r.counts.stickers === 1 &&
        r.counts.messages === 3 &&
        r.deviations.length === 0 &&
        r.checksumOk === true,
    );
  }
  {
    // Số đã lưu sai vs nội dung → CẢNH BÁO (khôi phục được, nhưng danh sách hiển thị sai).
    const snap = makeSnapshot();
    const row = {
      _id: "v2",
      backupJson: pack(snap),
      roleCount: 9,
      channelCount: 1,
      emojiCount: 0,
      stickerCount: 0,
      messageCount: 0,
      backupChecksum: sha(JSON.stringify(snap)),
    };
    const r = audit.verifyBackup(row);
    check(
      "verify: roleCount lệch → độ lệch ghi rõ, vẫn OK, verdict suspect",
      r.ok &&
        r.verdict === "suspect" &&
        r.deviations.some((d) => d.includes("role")) &&
        r.problems.length === 0,
    );
  }
  {
    const r = audit.verifyBackup({
      _id: "v3",
      backupJson: pack({ guildId: "g1", roles: "không-mảng", channels: [] }),
    });
    check(
      "verify: thiếu mảng roles → KHÔNG khôi phục được",
      !r.ok && r.verdict === "fake" && r.problems.some((p) => p.includes("roles")),
    );
  }
  {
    const r = audit.verifyBackup({ _id: "v4", backupJson: "z:!!!hỏng!!!" });
    check(
      "verify: nén hỏng → KHÔNG khôi phục được kèm lý do",
      !r.ok && r.verdict === "fake" && r.problems.length > 0,
    );
  }
  {
    const snap = makeSnapshot();
    const row = {
      _id: "v5",
      backupJson: pack(snap),
      roleCount: 1,
      channelCount: 1,
      backupChecksum: sha("nội-dung-khác"),
    };
    const r = audit.verifyBackup(row);
    check(
      "verify: checksum lệch → nêu rõ, KHÔNG khôi phục tin cậy",
      !r.ok && r.checksumOk === false && r.problems.some((p) => p.includes("checksum")),
    );
  }
  {
    // Backup tách chunk: Convex ghép sẵn; thiếu chunk → backupJson null.
    const r = audit.verifyBackup({ _id: "v6", backupChunkCount: 3, backupJson: null });
    check(
      "verify: thiếu chunk → báo RÕ 'thiếu chunk' chứ không phải JSON hỏng",
      !r.ok && r.chunked && r.problems.some((p) => p.includes("thiếu chunk")),
    );
  }
  {
    const snap = makeSnapshot();
    const row = {
      _id: "v7",
      backupJson: pack(snap),
      backupChunkCount: 2,
      roleCount: 1,
      channelCount: 1,
    };
    const r = audit.verifyBackup(row);
    check(
      "verify: ghép đủ chunk → ghi chú số phần, vẫn OK",
      r.ok && r.chunked && r.chunkCount === 2 && r.notes.some((n) => n.includes("2 chunk")),
    );
  }
  {
    const r = audit.verifyBackup(null);
    check("verify: không có row → không crash, báo không tìm thấy", !r.ok && r.problems.length > 0);
  }

  // ── formatVerifyReport: một nguồn chữ cho cả /backup verify lẫn !backup verify ──
  {
    const snap = makeSnapshot({ emojis: [{ id: "e1", name: "pepe" }] });
    const ok = audit.formatVerifyReport(
      audit.verifyBackup({
        backupJson: pack(snap),
        roleCount: 1,
        channelCount: 1,
        emojiCount: 1,
        stickerCount: 0,
        messageCount: 0,
        backupChecksum: sha(JSON.stringify(snap)),
      }),
    );
    check(
      "format: dòng đếm có đủ role/kênh/emoji/sticker/tin + kết luận khôi phục được",
      ok.some((l) => l.includes("1 role") && l.includes("1 kênh") && l.includes("1 emoji")) &&
        ok.some((l) => l.includes("khôi phục được")),
    );
    const bad = audit.formatVerifyReport(audit.verifyBackup({ backupJson: "z:!!!" }));
    check(
      "format: bản hỏng → có dòng ❌ và kết luận KHÔNG khôi phục được",
      bad.some((l) => l.startsWith("❌")) && bad.some((l) => l.includes("KHÔNG khôi phục được")),
    );
  }

  console.log(`\n${pass}/${pass + fail} ✅`);
  process.exit(fail > 0 ? 1 : 0);
})();
