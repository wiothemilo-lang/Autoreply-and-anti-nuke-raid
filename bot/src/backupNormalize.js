/**
 * backupNormalize.js — chuẩn hoá file backup (.msc/.json của bot nuke khác) về
 * shape nội bộ của Protogon + giải mã các định dạng mã hoá riêng.
 *
 * Tách từ handlers/backup.js (đợt #5) — code giữ nguyên hành vi. Module lá, chỉ
 * phụ thuộc zlib + discord.js + ./backupUtils (giải nén bản backup Protogon).
 */
const zlib = require("zlib");
const { ChannelType, PermissionsBitField } = require("discord.js");
const { decompressAndDecryptBackup } = require("./backupUtils");

/** Trần output khi bung nén payload .msc (chống decompression bomb). */
const MAX_DECOMPRESSED_BYTES = 64 * 1024 * 1024;

/** Đếm tổng tin nhắn có trong backup (kể cả tin nằm trong thread). */
function countMessages(backup) {
  return (backup.channels || []).reduce(
    (n, c) =>
      n +
      (Array.isArray(c.messages) ? c.messages.length : 0) +
      (c.threads || []).reduce(
        (m, t) => m + (Array.isArray(t?.messages) ? t.messages.length : 0),
        0,
      ),
    0,
  );
}

/* ------------------------- Nhập file backup .msc (bot nuke) ------------------------- */

const CHANNEL_TYPE_BY_NAME = {
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  category: ChannelType.GuildCategory,
  announcement: ChannelType.GuildAnnouncement,
  news: ChannelType.GuildAnnouncement,
  stage: ChannelType.GuildStageVoice,
  stagevoice: ChannelType.GuildStageVoice,
  forum: ChannelType.GuildForum,
};

function pickFirst(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

function parseColor(c) {
  if (c === undefined || c === null) return 0;
  if (typeof c === "number") return Math.max(0, Math.min(0xffffff, Math.floor(c)));
  const s = String(c).trim();
  const hex = s.replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return parseInt(hex, 16);
  if (/^0x[0-9a-fA-F]{1,6}$/i.test(s)) return parseInt(s.slice(2), 16);
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(0xffffff, n)) : 0;
}

function num(v, fallback = 0) {
  const n = typeof v === "number" ? v : parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function str(v, fallback = "") {
  if (v === undefined || v === null) return fallback;
  return String(v);
}

function normalizeType(v, fallback = ChannelType.GuildText) {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const key = v.toLowerCase().replace(/[^a-z]/g, "");
    if (CHANNEL_TYPE_BY_NAME[key] !== undefined) return CHANNEL_TYPE_BY_NAME[key];
    const n = parseInt(v, 10);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function normalizeOverwrite(o) {
  if (!o || typeof o !== "object") return null;
  const type = o.type === 1 || o.type === "member" ? 1 : 0;
  return {
    id: str(o.id ?? o.roleId ?? o.userId ?? o.targetId, ""),
    type,
    // allow/deny có thể là số, chuỗi số, hoặc DANH SÁCH TÊN quyền (vd "manage_messages,view_channel").
    allow: parsePermissions(o.allow ?? o.allowNew ?? "0"),
    deny: parsePermissions(o.deny ?? o.denyNew ?? "0"),
  };
}

function normalizeMessage(m) {
  if (m === null || typeof m !== "object") return null;
  let ts = pickFirst(m, ["timestamp", "createdAt", "created_at", "date", "time"]);
  if (typeof ts === "string") ts = Date.parse(ts);
  ts = Number.isFinite(ts) ? ts : 0;
  const author =
    m.author && typeof m.author === "object"
      ? str(m.author.username ?? m.author.name ?? m.author.id, "?")
      : str(m.author ?? m.username ?? m.user ?? "?", "?");
  return {
    id: str(m.id ?? "", ""),
    authorId: str(m.author?.id ?? m.userId ?? "", ""),
    authorName: author.slice(0, 32) || "?",
    timestamp: ts,
    content: str(m.content ?? m.text ?? m.message ?? "", "").slice(0, 2000),
    attachments: Array.isArray(m.attachments)
      ? m.attachments
          .map((a) => (typeof a === "string" ? a : str(a?.url ?? a?.proxyUrl ?? "", "")))
          .filter(Boolean)
          .slice(0, 3)
      : [],
  };
}

function normalizeRole(r, index) {
  if (!r || typeof r !== "object") return null;
  const name = str(r.name ?? r.roleName ?? r.role_name ?? "", "");
  if (!name) return null;
  return {
    id: str(r.id ?? r.roleId ?? r.role_id ?? `role-${index}`, ""),
    name: name.slice(0, 100),
    color: parseColor(r.color ?? r.colour),
    hoist: !!r.hoist,
    mentionable: !!r.mentionable,
    // permissions có thể là số/chuỗi số, hoặc danh sách tên quyền ("manage_messages,ban_members").
    permissions: parsePermissions(r.permissions ?? r.permissionBits ?? "0"),
    position: num(r.position, index),
    icon: str(r.icon ?? r.iconUrl ?? "", null),
    unicodeEmoji: r.unicodeEmoji ?? r.emoji ?? null,
  };
}

function normalizeChannel(c, index) {
  if (!c || typeof c !== "object") return null;
  const name = str(c.name ?? c.channelName ?? c.channel_name ?? "", "");
  if (!name) return null;
  const overwrites = Array.isArray(
    c.overwrites ??
      c.permissionOverwrites ??
      c.permission_overwrites ??
      c.permissionOverwritesRaw ??
      c.rolePermissions,
  )
    ? (
        c.overwrites ??
        c.permissionOverwrites ??
        c.permission_overwrites ??
        c.permissionOverwritesRaw ??
        c.rolePermissions
      )
        .map(normalizeOverwrite)
        .filter(Boolean)
    : [];
  const messages = asArray(c.messages ?? c.messageData ?? c.msgs)
    ? asArray(c.messages ?? c.messageData ?? c.msgs)
        .map(normalizeMessage)
        .filter(Boolean)
    : [];
  return {
    id: str(c.id ?? c.channelId ?? c.channel_id ?? `ch-${index}`, ""),
    name: name.slice(0, 100),
    type: normalizeType(c.type ?? c.channelType ?? c.channel_type),
    topic: str(c.topic ?? c.topicText ?? "", null),
    nsfw: !!c.nsfw,
    bitrate: c.bitrate ? num(c.bitrate, null) : null,
    userLimit: c.userLimit ? num(c.userLimit, null) : null,
    position: num(c.position, index),
    parentId: str(
      c.parentId ??
        c.parent ??
        c.parent_id ??
        c.categoryId ??
        c.category_id ??
        c.category ??
        c.parentChannelId ??
        "",
      null,
    ),
    overwrites,
    messages,
  };
}

/**
 * Chuẩn hóa 1 emoji từ file bot nuke khác: chuỗi `<:name:id>` / `<a:name:id>` /
 * `name:id` / tên trần, hoặc object có { name, url/imageUrl, raw base64 }.
 */
function normalizeEmoji(e, index) {
  if (e === null || e === undefined) return null;
  if (typeof e === "string") {
    const s = e.trim();
    if (!s) return null;
    // URL CDN trực tiếp (file bot nuke lưu emoji dạng link, KHÔNG kèm tên):
    // lấy ID từ đường dẫn /emojis/<id>.png và tự đặt tên theo ID (Discord bắt buộc tên).
    if (s.startsWith("http")) {
      const idm = s.match(/\/emojis\/(\d+)/);
      const id = idm ? idm[1] : "";
      return {
        id: id || `emoji-${index}`,
        name: id ? `e${id}` : `emoji_${index}`,
        animated: /\.gif(?:[?#]|$)/i.test(s),
        url: s,
        raw: null,
      };
    }
    let name;
    let id;
    const m = s.match(/^<a?:([a-zA-Z0-9_]+):(\d+)>$/);
    if (m) {
      name = m[1];
      id = m[2];
    } else {
      const parts = s.split(":");
      name = parts[0];
      id = parts[1] ?? "";
    }
    if (!name) return null;
    return {
      id: id || `emoji-${index}`,
      name: name.slice(0, 32),
      animated: s.startsWith("<a:"),
      url: null,
      raw: null,
    };
  }
  if (typeof e === "object") {
    const name = str(e.name ?? e.emojiName ?? e.emoji_name ?? "", "");
    if (!name) return null;
    const urlRaw = str(e.url ?? e.imageUrl ?? e.image_url ?? e.assetUrl ?? "", null);
    // data URI nhét trong trường url → chuyển sang raw (không lưu blob vào bản gọn).
    const url = urlRaw && urlRaw.startsWith("http") ? urlRaw : null;
    const raw =
      typeof e.raw === "string" && e.raw.startsWith("data:")
        ? e.raw
        : typeof e.image === "string" && e.image.startsWith("data:")
          ? e.image
          : urlRaw && urlRaw.startsWith("data:")
            ? urlRaw
            : null;
    return {
      id: str(e.id ?? e.emojiId ?? e.emoji_id ?? `emoji-${index}`, ""),
      name: name.slice(0, 32),
      animated: !!e.animated,
      url,
      raw,
    };
  }
  return null;
}

/**
 * Chuẩn hóa 1 sticker từ file bot nuke khác: chuỗi (URL/data URI) hoặc object
 * có { name, tags, description, url/assetUrl, raw base64 }.
 */
function normalizeSticker(s, index) {
  if (s === null || s === undefined) return null;
  if (typeof s === "string") {
    const v = s.trim();
    if (!v) return null;
    return {
      id: `sticker-${index}`,
      name: `sticker_${index}`,
      description: null,
      tags: null,
      formatType: null,
      url: v.startsWith("http") ? v : null,
      raw: v.startsWith("data:") ? v : null,
    };
  }
  if (typeof s === "object") {
    const name = str(s.name ?? s.stickerName ?? s.sticker_name ?? "", "");
    if (!name) return null;
    // asset là hash của Discord chứ không phải URL — chỉ nhận khi là link đầy đủ;
    // data URI nhét trong trường url/asset → chuyển sang raw.
    const urlRaw = str(s.url ?? s.assetUrl ?? s.asset ?? "", null);
    const url = urlRaw && urlRaw.startsWith("http") ? urlRaw : null;
    const raw =
      typeof s.raw === "string" && s.raw.startsWith("data:")
        ? s.raw
        : urlRaw && urlRaw.startsWith("data:")
          ? urlRaw
          : null;
    return {
      id: str(s.id ?? s.stickerId ?? s.sticker_id ?? `sticker-${index}`, ""),
      name: name.slice(0, 30),
      description:
        s.description === null || s.description === undefined
          ? null
          : String(s.description).slice(0, 100),
      tags: s.tags ?? s.tag ?? null,
      formatType: s.formatType ?? s.format_type ?? s.format ?? null,
      url,
      raw,
    };
  }
  return null;
}

/** Quyền lưu dạng danh sách TÊN → bitfield (discord.js: tên camelCase "ManageMessages"). */
function permFlagValue(key) {
  const k = String(key || "").trim();
  if (!k) return null;
  const F = PermissionsBitField.Flags;
  // Chỉ nhận giá trị bigint. Truy cập trực tiếp F[k] với "__proto__",
  // "constructor", "toString"… trả về giá trị prototype (object/function) →
  // BigInt() ném và cả file import hỏng (test-backup-import phủ).
  const asFlag = (v) => (typeof v === "bigint" ? v : null);
  const direct = asFlag(F[k]);
  if (direct !== null) return direct;
  const camel = k
    .replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/^([a-z])/, (c) => c.toUpperCase());
  const camelV = asFlag(F[camel]);
  if (camelV !== null) return camelV;
  const lower = k.toLowerCase();
  for (const fk of Object.keys(F)) {
    if (fk.toLowerCase() === lower) {
      const v = asFlag(F[fk]);
      if (v !== null) return v;
    }
  }
  return null;
}

/**
 * Chuẩn hóa permissions: số / chuỗi số / mảng tên / chuỗi tên cách nhau
 * ("manage_messages,ban_members") → bitfield dạng chuỗi.
 */
function parsePermissions(raw) {
  if (raw === undefined || raw === null || raw === "") return "0";
  if (typeof raw === "number") return String(Math.max(0, Math.floor(raw)));
  if (Array.isArray(raw)) raw = raw.join(",");
  const s = String(raw).trim();
  if (/^\d+$/.test(s)) return s;
  let bits = 0n;
  for (const part of s.split(/[,\s|]+/)) {
    // Mỗi phần có thể là TÊN quyền ("manage_messages") HOẶC giá trị bitfield
    // dạng số ("8", 8192). Trước đây chỉ tra TÊN nên mọi dạng danh sách số
    // (["8","8192"], "8,8192", 8|8192) rơi hết về 0 — role và permission
    // overwrite được khôi phục MẤT SẠCH quyền, không có cảnh báo nào.
    // BigInt giữ nguyên độ chính xác kể cả bitfield vượt 2^53.
    if (/^\d+$/.test(part)) {
      bits |= BigInt(part);
      continue;
    }
    const v = permFlagValue(part);
    if (v !== undefined && v !== null) bits |= BigInt(v);
  }
  return bits.toString();
}

/** Nhận array hoặc object keyed-by-id (biến thể "channels": {"123": {...}} → [...values]). */
function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") return Object.values(v);
  return null;
}

/** Thử đọc JSON từ chuỗi; trả null nếu không phải. */
function tryParseJson(text) {
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

/** Giải mã base64 (bỏ khoảng trắng); chỉ nhận khi kết quả trông giống JSON. */
function decodeB64Text(text) {
  try {
    const cleaned = String(text).replace(/\s+/g, "");
    if (cleaned.length < 8) return text;
    const out = Buffer.from(cleaned, "base64").toString("utf8");
    return /[{}[\]]/.test(out) ? out : text;
  } catch {
    return text;
  }
}

/** Cắt lấy phần JSON nằm giữa văn bản thừa (dòng tiêu đề "MSC BACKUP v1.0" / trailer…). */
function extractJsonFromText(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const parsed = tryParseJson(text.slice(start, end + 1));
    if (parsed) return parsed;
  }
  const startB = text.indexOf("[");
  const endB = text.lastIndexOf("]");
  if (startB >= 0 && endB > startB) {
    const parsed = tryParseJson(text.slice(startB, endB + 1));
    if (parsed) return parsed;
  }
  return null;
}

/** Các khóa chứa nội dung backup thật (array hoặc object keyed-by-id). */
const BACKUP_CONTENT_KEYS = [
  "roles",
  "guildRoles",
  "rolesData",
  "roleData",
  "channels",
  "guildChannels",
  "channelsData",
  "channelData",
  "emojis",
  "guildEmojis",
  "emojiData",
  "stickers",
  "guildStickers",
  "stickerData",
];
/** Các khóa wrapper thường gặp của file bot nuke khác. */
const WRAP_KEYS = [
  "data",
  "guild",
  "server",
  "backup",
  "snapshot",
  "result",
  "body",
  "content",
  "file",
  "json",
  "payload",
  "response",
  "message",
];

/**
 * Tìm object chứa roles/channels/emojis/stickers ở bất kỳ độ sâu nào trong file
 * backup (wrapper lồng nhau tối đa 10 lớp, kể cả wrapper chứa chuỗi JSON/base64
 * nhúng — đọc đệ quy chính nó). Trả null nếu không tìm thấy.
 */
function findBackupPayload(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 10) return null;
  if (Array.isArray(node)) return null;
  const hasContent = BACKUP_CONTENT_KEYS.some((k) => node[k] !== undefined && node[k] !== null);
  if (hasContent) return node;
  for (const k of WRAP_KEYS) {
    const v = node[k];
    if (v === undefined || v === null) continue;
    if (typeof v === "string") {
      // Chuỗi lớn (> 1MB) chắc chắn là payload blob (alphabet+key+payload của file
      // mã hóa, base64 media…) chứ không phải wrapper JSON — bỏ qua cho nhanh.
      if (v.length > 1_000_000) continue;
      // Nhận chuỗi JSON trực tiếp HOẶC chuỗi base64 giải mã ra JSON.
      const looksJsonish = /[{}[\]]/.test(v) || decodeB64Text(v) !== v;
      if (looksJsonish) {
        try {
          const nested = normalizeBackupFile(v);
          if (nested) return nested;
        } catch {
          // không phải JSON — tiếp tục
        }
      }
      continue;
    }
    const found = findBackupPayload(v, depth + 1);
    if (found) return found;
  }
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (v && typeof v === "object") {
      const found = findBackupPayload(v, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/* ----------------------------------------------------------------------------------------
 * Giải mã file .msc mã hóa theo định dạng riêng của bot nuke:
 *   {"v":1,"guild_id":…,"saved_at":…,"alphabet":"<bảng chữ cái tùy biến>","key":"…","payload":"…"}
 * Payload là dữ liệu backup được mã hóa bằng base-N (thường base85) với bảng chữ cái
 * tùy biến theo từng file, kèm khóa XOR / dịch Vigenère (key nằm ngay trong file).
 * Vì không có chuẩn chung, bot thử một loạt sơ đồ phổ biến rồi XÁC THỰC kết quả phải
 * là JSON chứa role/kênh/emoji/sticker — sơ đồ sai gần như không thể cho kết quả hợp lệ.
 * ---------------------------------------------------------------------------------------- */

/** Có phải object chứa nội dung backup (roles/channels/emojis/stickers) không. */
function hasBackupContent(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  return BACKUP_CONTENT_KEYS.some((k) => obj[k] !== undefined && obj[k] !== null);
}

/**
 * Giải mã base-N theo nhóm: group=5 → mỗi 5 ký tự → 4 byte (base85 tùy biến),
 * group=4 → mỗi 4 ký tự → 3 byte (base64 tùy biến). Nhóm lẻ k ký tự (2..4) → k-1
 * byte; file theo chuẩn "pad tới bội của nhóm" sẽ có byte 0 dẫn đầu —
 * textFromBuffer đã bỏ qua byte 0 đầu.
 */
function baseNDecode(indices, N, group = 5) {
  const bytes = [];
  const full = Math.floor(indices.length / group);
  for (let g = 0; g < full; g++) {
    let v = 0;
    const base = g * group;
    for (let j = 0; j < group; j++) v = v * N + indices[base + j];
    if (group === 5) {
      bytes.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
    } else {
      bytes.push((v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
    }
  }
  const rem = indices.length % group;
  if (rem >= 2) {
    let v = 0;
    for (let j = 0; j < rem; j++) v = v * N + indices[indices.length - rem + j];
    for (let j = rem - 2; j >= 0; j--) bytes.push((v >>> (8 * j)) & 0xff);
  }
  return Buffer.from(bytes);
}

/**
 * Sinh danh sách Buffer ứng viên từ {alphabet, key, payload}. Quét hai họ mã hóa:
 *  - base-N nhóm 5 ký tự → 4 byte (thường là base85 với bảng chữ tùy biến);
 *  - base-64 nhóm 4 ký tự → 3 byte (bảng chữ 64 ký tự — biến thể base64 tùy biến).
 * Với mỗi họ: biến đổi chỉ số theo key (Vigenère +,-,XOR theo chỉ số alphabet HOẶC mã ASCII
 * của key) trước khi giải mã, rồi biến đổi byte (XOR/trừ theo key) sau khi giải mã.
 */
function mscDecodeCandidates({ alphabet, key, payload }) {
  const alpha = [...new Set([...String(alphabet)])];
  const N = alpha.length;
  if (N < 10 || N > 128 || typeof payload !== "string" || payload.length < 8) return [];
  const idx = new Map();
  alpha.forEach((c, i) => idx.set(c, i));
  const pIdx = [...payload].map((c) => idx.get(c));
  if (pIdx.some((v) => v === undefined)) return [];
  const kIdx =
    typeof key === "string" ? [...key].map((c) => idx.get(c)).filter((v) => v !== undefined) : [];
  const kAscii = typeof key === "string" ? Buffer.from(key, "latin1") : Buffer.alloc(0);
  const huge = payload.length > 300_000; // file rất lớn → giới hạn số ứng viên để không tốn RAM

  // JS % giữ dấu của số bị chia → dùng mod Euclid để kết quả luôn trong [0, N).
  const mod = (a, n) => ((a % n) + n) % n;
  // 1) Biến đổi trên DÃY CHỈ SỐ (trước base-N).
  const indexVariants = [pIdx];
  if (!huge) {
    if (kIdx.length > 0) {
      indexVariants.push(
        pIdx.map((v, i) => mod(v - kIdx[i % kIdx.length], N)),
        pIdx.map((v, i) => mod(v + kIdx[i % kIdx.length], N)),
        pIdx.map((v, i) => mod(v ^ kIdx[i % kIdx.length], N)),
      );
    }
    if (kAscii.length > 0) {
      indexVariants.push(
        pIdx.map((v, i) => mod(v - kAscii[i % kAscii.length], N)),
        pIdx.map((v, i) => mod(v + kAscii[i % kAscii.length], N)),
        pIdx.map((v, i) => mod(v ^ kAscii[i % kAscii.length], N)),
      );
    }
    indexVariants.push(pIdx.map((v) => N - 1 - v));
  }

  const groupSize = N === 64 ? 4 : 5;
  const out = [];
  for (const iv of indexVariants) {
    const bytes = baseNDecode(iv, N, groupSize);
    if (bytes.length === 0) continue;
    // 2) Biến đổi trên BYTES (sau base-N): nguyên trạng / XOR / trừ theo key.
    const byteVariants = [bytes];
    if (kIdx.length > 0) {
      const k1 = Buffer.from(kIdx.map((v) => v & 0xff));
      byteVariants.push(
        Buffer.from(bytes.map((b, i) => b ^ k1[i % k1.length])),
        Buffer.from(bytes.map((b, i) => b ^ kAscii[i % kAscii.length])),
        Buffer.from(bytes.map((b, i) => (b - k1[i % k1.length] + 256) % 256)),
      );
    }
    for (const bv of byteVariants) out.push(bv);
  }
  return out;
}

/** Đọc Buffer thành text; nhận UTF-8 và UTF-16LE (bỏ byte 0 dẫn đầu + kết quả có NUL rác). */
function textFromBuffer(buf) {
  if (!buf || buf.length === 0) return null;
  let i = 0;
  while (i < buf.length && buf[i] === 0) i++;
  const s = buf.subarray(i).toString("utf8");
  if (!s.includes("\u0000")) return s;
  const s16 = buf.subarray(i).toString("utf16le");
  return s16.includes("\u0000") ? null : s16;
}

/** Thử nén ngược gzip/zlib/deflate — một số bot nén backup trước khi mã hóa. */
function decompressCandidates(buf) {
  const out = [];
  // Chặn decompression bomb: payload .msc nhỏ có thể bung ra cực lớn.
  const opts = { maxOutputLength: MAX_DECOMPRESSED_BYTES };
  if (buf.length > 4 && buf[0] === 0x1f && buf[1] === 0x8b) {
    try {
      out.push(zlib.gunzipSync(buf, opts));
    } catch {
      /* bỏ qua */
    }
  } else if (buf.length > 2 && buf[0] === 0x78) {
    try {
      out.push(zlib.inflateSync(buf, opts));
    } catch {
      /* bỏ qua */
    }
    try {
      out.push(zlib.inflateRawSync(buf, opts));
    } catch {
      /* bỏ qua */
    }
  }
  return out;
}

/**
 * Giải mã payload {alphabet, key, payload} → object backup thật, hoặc null nếu
 * không khớp sơ đồ nào đã biết. Chỉ chấp nhận kết quả là JSON chứa nội dung backup.
 */
/** Bảng base64 chuẩn (64 ký tự) — phần đầu của bảng chữ của file .msc mã hóa. */
const STD_B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Giải mã đúng định dạng file .msc mã hóa của bot nuke (đã xác minh trên file thật):
 *   1. Nội dung backup là chuỗi JSON → base64 chuẩn (64 ký tự).
 *   2. Mỗi ký tự base64 có chỉ số i (0-63) được dịch Vigenère theo key trên bảng
 *      chữ 89 ký tự: payload[i] = alphabet[(i + keyIdx[j]) % 89], key lặp lại 32 ký tự
 *      (keyIdx[j] = alphabet.indexOf(key[j])). Ký tự padding '=' (chỉ số 64) cũng bị
 *      dịch → khi giải mã ngược cho giá trị ≥ 64, bỏ qua (chính là padding).
 * Trả về object backup hoặc null nếu không khớp.
 */
function decodeVigenereB64({ alphabet, key, payload }) {
  const alpha = [...new Set([...String(alphabet)])];
  const N = alpha.length;
  if (N < 64 || N > 128) return null;
  const idx = new Map();
  alpha.forEach((c, i) => idx.set(c, i));
  const kIdx = [...String(key || "")].map((c) => idx.get(c)).filter((v) => v !== undefined);
  if (kIdx.length === 0 || typeof payload !== "string" || payload.length < 8) return null;
  const mod = (a, n) => ((a % n) + n) % n;
  const chunks = [];
  let b64 = "";
  const maxChunks = Math.ceil(payload.length / 131_072) + 2; // chống payload bất thường
  for (let i = 0; i < payload.length; i++) {
    const p = idx.get(payload[i]);
    if (p === undefined) continue; // ký tự lạ ngoài bảng chữ — bỏ qua
    const v = mod(p - kIdx[i % kIdx.length], N);
    if (v >= 64) continue; // padding '=' bị dịch chuyển — bỏ qua
    b64 += STD_B64_ALPHABET[v];
    if (b64.length >= 131_072) {
      chunks.push(b64);
      b64 = "";
      if (chunks.length > maxChunks) return null;
    }
  }
  if (b64) chunks.push(b64);
  const raw = Buffer.concat(chunks.map((c) => Buffer.from(c, "base64")));
  if (raw.length === 0) return null;
  const text = textFromBuffer(raw);
  if (!text) return null;
  const obj = tryParseJson(text);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  // guild_id là số 18 chữ số bị JSON.parse làm mất chính xác → lấy lại đúng chuỗi số từ text.
  if (obj.guild_id !== undefined && typeof obj.guild_id === "number") {
    const m = text.match(/"guild_id"\s*:\s*(\d{15,})/);
    if (m) obj.guildId = m[1];
  }
  return obj;
}

function decodeEncryptedMsc(parsed) {
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof parsed.alphabet !== "string" ||
    typeof parsed.payload !== "string"
  ) {
    return null;
  }
  // 1) Sơ đồ đã xác minh trên file thật: base64 + Vigenère theo key trên bảng chữ 89 ký tự.
  try {
    const obj = decodeVigenereB64(parsed);
    if (obj && hasBackupContent(obj)) return obj;
  } catch {
    // rơi xuống các sơ đồ dự đoán bên dưới
  }
  // 2) Fallback: quét các sơ đồ base-N phổ biến khác (chưa xác minh file thật).
  let candidates;
  try {
    candidates = mscDecodeCandidates(parsed);
  } catch {
    return null;
  }
  for (const buf of candidates) {
    const tryObj = (bytes) => {
      const text = textFromBuffer(bytes);
      if (!text) return null;
      const obj = tryParseJson(text);
      return obj && hasBackupContent(obj) ? obj : null;
    };
    const obj = tryObj(buf);
    if (obj) return obj;
    for (const dec of decompressCandidates(buf)) {
      const obj2 = tryObj(dec);
      if (obj2) return obj2;
    }
  }
  return null;
}

/**
 * Chuẩn hóa nội dung file backup từ bot nuke khác (.msc / .json) về đúng shape
 * nội bộ của Protogon để chạy restore: { version, guildId, guildName, roles,
 * channels, emojis, stickers, settings, messageCount }. Nhận diện:
 *  - JSON trực tiếp / bọc base64 (kể cả có tiền tố data:...;base64, / base64://) / URL-encode;
 *  - JSON nằm giữa văn bản thừa (dòng tiêu đề, trailer…);
 *  - có wrapper ngoài (data / guild / server / backup / snapshot / result / body…)
 *    tới 5 lớp, kể cả wrapper chứa chuỗi JSON/base64 nhúng;
 *  - roles/channels/emojis/stickers/messages dạng ARRAY hoặc OBJECT keyed-by-id;
 *  - tên trường đa dạng (guildRoles, channelData, permission_overwrites…);
 *  - màu dạng số / hex "#RRGGBB" / "0x…"; type kênh dạng số hoặc chuỗi;
 *  - quyền dạng bitfield số hoặc danh sách tên ("manage_messages,ban_members").
 * Ném Error kèm lý do nếu không đọc được.
 */
function normalizeBackupFile(content) {
  let text = String(content || "")
    .replace(/^\uFEFF/, "")
    .trim();
  // Bản backup của chính Protogon (nén zlib "z:" / nén+mã hóa "e:" — tải từ Gist
  // GitHub hoặc file tải từ nơi khác): bung nén + giải mã TRƯỚC khi parse JSON.
  // Trước đây file Gist nén import vào server phụ bị lỗi "Không đọc được file
  // backup" dù file hoàn toàn hợp lệ.
  if (/^z:/.test(text) || /^e:/.test(text)) {
    try {
      text = decompressAndDecryptBackup(text);
    } catch {
      // không bung được (key sai / file hỏng) — vẫn thử các bước parse bên dưới
    }
  }
  // Gỡ tiền tố base64 thường gặp: data:application/json;base64, / base64:// / base64: / b64:
  const prefixed = text.match(
    /^(?:data:application\/(?:json|octet-stream)[^,]*;base64,|base64:\/\/|base64:|b64:)(.+)$/is,
  );
  if (prefixed) text = prefixed[1].trim();
  // URL-encode (có %7B… mà chưa có dấu { thật)
  if (!text.includes("{") && /%7B|%7D|%5B|%5D/i.test(text)) {
    try {
      text = decodeURIComponent(text);
    } catch {
      // giữ nguyên — các bước sau vẫn thử
    }
  }

  let parsed = tryParseJson(text);
  if (!parsed) parsed = tryParseJson(decodeB64Text(text));
  if (!parsed) parsed = extractJsonFromText(text);
  if (!parsed) parsed = extractJsonFromText(decodeB64Text(text));
  if (!parsed) {
    throw new Error(
      "Không đọc được file backup (.msc/.json) — đã thử: JSON trực tiếp, cắt theo dấu {…}, base64 và URL-encode. Hãy mở file bằng Notepad xem có phải văn bản JSON không.",
    );
  }
  // File mã hóa theo định dạng riêng của bot nuke: {alphabet, key, payload}.
  // Ưu tiên nội dung plaintext nếu có; chỉ giải mã khi không tìm thấy role/kênh thật.
  const encryptedWrapper =
    typeof parsed.alphabet === "string" &&
    typeof parsed.payload === "string" &&
    !findBackupPayload(parsed);
  if (encryptedWrapper) {
    const decoded = decodeEncryptedMsc(parsed);
    if (decoded) {
      parsed = decoded;
    } else {
      throw new Error(
        "File backup được mã hóa theo định dạng riêng của bot nuke (alphabet+key+payload) và bot chưa giải mã được định dạng này — hãy gửi nội dung file (.msc) cho nhà phát triển để hỗ trợ thêm.",
      );
    }
  }
  // Tìm object chứa roles/channels/emojis/stickers ở bất kỳ độ sâu (wrapper lồng nhau).
  const payload = findBackupPayload(parsed);
  if (!payload) {
    throw new Error("File backup không có cấu trúc role/kênh (hoặc emoji/sticker) để khôi phục");
  }
  parsed = payload;

  const rolesRaw = asArray(pickFirst(parsed, ["roles", "guildRoles", "rolesData", "roleData"]));
  const roles = rolesRaw ? rolesRaw.map(normalizeRole).filter(Boolean) : [];
  const channelsRaw = asArray(
    pickFirst(parsed, [
      "channels",
      "guildChannels",
      "channelsData",
      "channelData",
      "guildChannelsData",
    ]),
  );
  const channels = channelsRaw ? channelsRaw.map(normalizeChannel).filter(Boolean) : [];
  const emojisRaw = asArray(
    pickFirst(parsed, [
      "emojis",
      "guildEmojis",
      "emojiData",
      "emojisData",
      "customEmojis",
      "emojiList",
    ]),
  );
  const emojis = emojisRaw ? emojisRaw.map(normalizeEmoji).filter(Boolean) : [];
  const stickersRaw = asArray(
    pickFirst(parsed, ["stickers", "guildStickers", "stickerData", "stickersData", "stickerList"]),
  );
  const stickers = stickersRaw ? stickersRaw.map(normalizeSticker).filter(Boolean) : [];
  if (roles.length === 0 && channels.length === 0 && emojis.length === 0 && stickers.length === 0) {
    throw new Error("File backup không chứa role, kênh, emoji hoặc sticker nào để khôi phục");
  }
  const settings = pickFirst(parsed, ["settings", "config", "guildSettings", "botSettings"]) ?? {};
  // File import (.msc/.json) thường KHÔNG có guildId → trả undefined thay vì
  // chuỗi rỗng. guildId="" gây hiểu nhầm "đã có guild gốc" và làm audit phân
  // loại sai; overwrite @everyone cần guildId thật mới map được (xem createChannels).
  const rawGuildId = pickFirst(parsed, ["guildId", "id", "serverId", "guild_id"]);
  const guildId =
    rawGuildId === undefined || rawGuildId === null || String(rawGuildId).trim() === ""
      ? undefined
      : String(rawGuildId);
  return {
    version: 4,
    guildId,
    guildName: str(
      parsed.guildName ??
        parsed.guild_name ??
        parsed.name ??
        parsed.serverName ??
        parsed.server_name ??
        "",
      "server từ file backup",
    ),
    roles,
    channels,
    emojis,
    stickers,
    emojiCount: emojis.length,
    stickerCount: stickers.length,
    settings: settings && typeof settings === "object" ? settings : {},
    messageCount: countMessages({ channels }),
    source: "import",
  };
}

module.exports = {
  MAX_DECOMPRESSED_BYTES,
  countMessages,
  pickFirst,
  parsePermissions,
  normalizeEmoji,
  normalizeSticker,
  normalizeBackupFile,
};
