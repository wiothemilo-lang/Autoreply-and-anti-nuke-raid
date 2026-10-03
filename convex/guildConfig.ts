/**
 * Cấu hình server — xuất / nhập để KHÔNG MẤT khi đổi host.
 *
 * Vì sao cần: `convex/backup.ts` chỉ backup NỘI DUNG DISCORD (role, kênh,
 * quyền). Cấu hình của chính Protogon — ngưỡng nhiệt độ, luật auto-reply,
 * Join Gate, welcome, preset antinuke — sống trong bảng `guilds` và **không
 * có bản sao nào ngoài VPS**. Mất Convex hoặc mất host là mất sạch, phải
 * gõ tay lại từng ngưỡng.
 *
 * File này chỉ chứa HÀM THUẦN (không đụng db) để test được trực tiếp bằng
 * `scripts/test-guild-config-portability.ts` — cùng kiểu với `guildStats.ts`.
 * Phần gọi db nằm ở `guilds/configPortability.ts` (`exportGuildConfig` /
 * `importGuildConfig`) — wrapper giữ ở `guilds.ts` để tên function không đổi.
 *
 * ⚠️ Một giới hạn phải nói rõ khi hiện trên UI: các field chứa **Discord ID**
 * (kênh, vai trò, thành viên) chỉ đúng **trong server gốc**. File này dùng
 * để khôi phục CÙNG một server (đổi VPS, khôi phục sau sự cố) — KHÔNG phải
 * để mang cấu hình sang server khác. Nếu chuyển server, các ID đó sẽ trỏ
 * nhầm hoặc không tồn tại.
 *
 * ⚠️ Vì sao có `PORTABLE_CONFIG_FIELDS` thay vì xuất thẳng toàn bộ document:
 * bảng `guilds` trộn CẤU HÌNH với TRẠNG THÁI VẬN HÀNH và DANH TÍNH —
 * `ownerId`, `lastHeartbeat`, `memberCount`, `backupRequested`, các cờ
 * restore/lease, `verifyPanelError`… Xuất cả những thứ đó là rò dữ liệu vận
 * hành, và nạp lại sẽ ghi đè trạng thái đang chạy bằng trạng thái cũ. Danh
 * sách ở đây là ALLOWLIST tường minh: không có gì lọt vào nếu không được liệt
 * kê tên.
 */

import { HEAT_DEFAULTS } from "./modules";

/**
 * Bump khi thêm/bỏ field trong allowlist, để file cũ nạp vẫn được (và để
 * đọc ra biết nó từ thời nào).
 */
export const PORTABLE_CONFIG_VERSION = 1;

/** Sơn màu dashboard — trùng danh sách trong `updateSettings`. */
const THEME_KEYS = [
  "graphite",
  "slate",
  "steel",
  "mist",
  "fog",
  "pink",
  "rose",
  "orange",
  "amber",
  "green",
  "teal",
  "sky",
  "violet",
] as const;

/** Mức chi tiết thông báo trừng phạt — trùng `updateSettings`. */
const PUNISH_NOTICE_LEVELS = ["none", "action", "reason", "full"] as const;

const PREFIX_RE = /^[!^$#&%]{1,3}$/;
const SNOWFLAKE_RE = /^\d{15,20}$/;

/**
 * 72 field cấu hình — sinh từ đúng danh sách `args` của `updateSettings`
 * (`token`/`guildId` không phải cấu hình). Thêm field cấu hình mới thì phải
 * thêm vào đây, nếu không nó sẽ không được xuất.
 *
 * `antinukeEnabled` không nằm trong args của `updateSettings` (nó do
 * `setAntinukeGlobal` ghi) nhưng vẫn là cấu hình nên được mang đi — thêm thủ
 * công ở đây.
 */
export const PORTABLE_CONFIG_FIELDS = [
  "prefix",
  "theme",
  "logChannelId",
  "modLogChannelId",
  "punishNoticeChannelId",
  "punishNotice",
  "whitelistUsers",
  "whitelistRoles",
  "modRoles",
  "adminRoles",
  "dailyReportEnabled",
  "emergencyAlertEnabled",
  "logPingEveryone",
  "welcomeEnabled",
  "welcomeChannelId",
  "welcomeMessage",
  "welcomeUseEmbed",
  "goodbyeEnabled",
  "goodbyeChannelId",
  "goodbyeMessage",
  "goodbyeUseEmbed",
  "welcomeRandom",
  "goodbyeRandom",
  "welcomeDmEnabled",
  "welcomeDmMessage",
  "welcomeEmbedTitle",
  "welcomeEmbedColor",
  "welcomeEmbedImage",
  "welcomeEmbedThumbnail",
  "goodbyeEmbedTitle",
  "goodbyeEmbedColor",
  "goodbyeEmbedImage",
  "goodbyeEmbedThumbnail",
  "autoroleEnabled",
  "autoroleRoleId",
  "autoroleDelaySec",
  "autoroleIncludeBots",
  "welcomeCardEnabled",
  "welcomeCardBackground",
  "goodbyeCardEnabled",
  "goodbyeCardBackground",
  "badWords",
  "heatEnabled",
  "heatDecayPerMin",
  "heatWarnAt",
  "heatTimeoutAt",
  "heatKickAt",
  "heatBanAt",
  "heatRepeatMultiplier",
  "heatRepeatWindowMin",
  "warnStrikeLimit",
  "warnStrikeWindowMin",
  "warnStrikePunish",
  "joinGateEnabled",
  "joinGateMinAgeDays",
  "joinGateRequireAvatar",
  "joinGateRequireFlag",
  "joinGateRaidKick",
  "joinGatePunish",
  "joinGateWhitelist",
  "raidHuntEnabled",
  "raidHuntBanSuspects",
  "verifyEnabled",
  "verifyMethod",
  "verifyChannelId",
  "unverifiedRoleId",
  "verifiedRoleId",
  "verifyWelcomeEnabled",
  "verifyWelcomeTitle",
  "verifyWelcomeDescription",
  "verifyWelcomeColor",
  "verifySendPanel",
  "antinukeEnabled",
  "automodEnabled",
] as const;

export type PortableConfigField = (typeof PORTABLE_CONFIG_FIELDS)[number];

const FIELD_SET = new Set<string>(PORTABLE_CONFIG_FIELDS);

/** Field boolean — giá trị khác `boolean` bị loại. */
const BOOL_FIELDS = new Set<string>([
  "dailyReportEnabled",
  "emergencyAlertEnabled",
  "logPingEveryone",
  "welcomeEnabled",
  "welcomeUseEmbed",
  "goodbyeEnabled",
  "goodbyeUseEmbed",
  "welcomeDmEnabled",
  "autoroleEnabled",
  "autoroleIncludeBots",
  "welcomeCardEnabled",
  "goodbyeCardEnabled",
  "heatEnabled",
  "joinGateEnabled",
  "joinGateRequireAvatar",
  "joinGateRequireFlag",
  "joinGateRaidKick",
  "raidHuntEnabled",
  "raidHuntBanSuspects",
  "verifyEnabled",
  "verifyWelcomeEnabled",
  "verifySendPanel",
  "antinukeEnabled",
  "automodEnabled",
]);

/**
 * Field số — khoảng `[min, max]` y hệt `updateSettings`. Dùng `clamp` nên
 * giá trị vượt ngưỡng bị siết về biên chứ không bị loại: ngưỡng nhiệt/ngày
 * bị dashboard gõ tay sai 1 chút vẫn nên nạp được.
 */
const NUMBER_RANGES: Record<string, readonly [number, number]> = {
  autoroleDelaySec: [0, 120],
  heatDecayPerMin: [0, 60],
  heatWarnAt: [1, 99],
  heatTimeoutAt: [1, 100],
  heatKickAt: [1, 100],
  heatBanAt: [1, 100],
  heatRepeatMultiplier: [1, 10],
  heatRepeatWindowMin: [1, 1440],
  warnStrikeLimit: [0, 20],
  warnStrikeWindowMin: [1, 1440],
  joinGateMinAgeDays: [0, 3650],
};

/** Field chuỗi thuần — `null`/rỗng ⇒ xoá (undefined), còn lại bị cắt theo trần. */
const STRING_FIELDS: Record<string, number> = {
  welcomeMessage: 1000,
  goodbyeMessage: 1000,
  welcomeDmMessage: 1000,
  welcomeEmbedTitle: 256,
  goodbyeEmbedTitle: 256,
  welcomeRandom: 4000,
  goodbyeRandom: 4000,
  verifyWelcomeTitle: 256,
  verifyWelcomeDescription: 1000,
};

/** Field ảnh/nền: phải là URL http(s), màu phải là #hex — cùng `cleanGreetingField`. */
const URL_OR_COLOR_FIELDS = new Set<string>([
  "welcomeEmbedImage",
  "welcomeEmbedThumbnail",
  "goodbyeEmbedImage",
  "goodbyeEmbedThumbnail",
  "welcomeCardBackground",
  "goodbyeCardBackground",
  "welcomeEmbedColor",
  "goodbyeEmbedColor",
  "verifyWelcomeColor",
]);

/** Field chuỗi rỗng được ⇒ xoá (ID kênh/vai trò để trống). */
const CLEARABLE_STRING_FIELDS = new Set<string>([
  "logChannelId",
  "modLogChannelId",
  "punishNoticeChannelId",
  "welcomeChannelId",
  "goodbyeChannelId",
  "verifyChannelId",
  "unverifiedRoleId",
  "verifiedRoleId",
  "verifyWelcomeTitle",
  "verifyWelcomeDescription",
  "verifyWelcomeColor",
]);

/** Mảng Discord ID — lọc snowflake, cắt trần, bỏ trùng (giống `updateSettings`). */
const ID_ARRAY_FIELDS: Record<string, number> = {
  whitelistUsers: 100,
  whitelistRoles: 100,
  modRoles: 50,
  adminRoles: 50,
  joinGateWhitelist: 100,
};

/** Giá trị enum — lấy đúng từ `schema.ts`. */
const ENUM_FIELDS: Record<string, readonly string[]> = {
  theme: THEME_KEYS,
  joinGatePunish: ["kick", "ban"],
  warnStrikePunish: ["timeout", "kick", "ban"],
  verifyMethod: ["button", "captcha"],
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** URL hợp lệ, hoặc mã màu #hex — cùng quy tắc `cleanGreetingField`. */
function cleanUrlOrColor(field: string, raw: string): string | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  if (field.endsWith("Color")) {
    return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s.toLowerCase() : undefined;
  }
  return /^https?:\/\/\S+$/.test(s) && s.length <= 2000 ? s : undefined;
}

export type SanitizeResult = {
  /** Field hợp lệ, đã chuẩn hoá — sẵn sàng patch. */
  patch: Record<string, unknown>;
  /** Đã áp dụng. */
  applied: string[];
  /** Có trong file nhưng không thuộc allowlist (vd `ownerId`) — cố ý bỏ. */
  ignored: string[];
  /** Thuộc allowlist nhưng giá trị sai kiểu/sai luật — bỏ, KHÔNG làm hỏng file. */
  invalid: string[];
};

/**
 * Lọc + chuẩn hoá cấu hình nạp từ file.
 *
 * Cố ý KHÔNG throw: một file sửa tay có 1 field hỏng vẫn phải nạp được phần
 * còn lại, và UI báo `invalid` để người dùng biết mình bỏ sót gì. Field hỏng
 * bị BỎ, không được ghi rác xuống db.
 *
 * `current` là giá trị đang có trên server — cần cho validate chéo ngưỡng
 * nhiệt (kiểu `updateSettings` dùng `guild`).
 */
export function sanitizeImportedConfig(
  raw: unknown,
  current: {
    heatTimeoutAt?: number;
    heatKickAt?: number;
    heatBanAt?: number;
  } = {},
): SanitizeResult {
  const patch: Record<string, unknown> = {};
  const applied: string[] = [];
  const ignored: string[] = [];
  const invalid: string[] = [];

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { patch, applied, ignored, invalid: [] };
  }
  const input = raw as Record<string, unknown>;

  for (const [key, value] of Object.entries(input)) {
    if (!FIELD_SET.has(key)) {
      ignored.push(key);
      continue;
    }
    if (value === undefined || value === null) {
      // null = xoá field. Bỏ qua: file export của ta chỉ chứa field đang có
      // giá trị, nên `null` ở đây chỉ xuất hiện khi người dùng tự sửa file.
      continue;
    }

    // ── ngưỡng nhiệt: 4 field phụ thuộc lẫn nhau, xử lý một lượt ở dưới ──
    if (key.startsWith("heat") && key.endsWith("At")) continue;

    const fail = () => invalid.push(key);

    if (BOOL_FIELDS.has(key)) {
      if (typeof value !== "boolean") fail();
      else {
        patch[key] = value;
        applied.push(key);
      }
      continue;
    }

    if (key === "prefix") {
      if (typeof value !== "string" || !PREFIX_RE.test(value)) fail();
      else {
        patch.prefix = value;
        applied.push(key);
      }
      continue;
    }

    if (key === "punishNotice") {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        fail();
        continue;
      }
      const src = value as Record<string, unknown>;
      const next: Record<string, string> = {};
      let bad = false;
      for (const level of ["ban", "timeout", "kick", "warn"] as const) {
        const v = src[level];
        if (typeof v !== "string" || !PUNISH_NOTICE_LEVELS.includes(v as never)) {
          bad = true;
          break;
        }
        next[level] = v;
      }
      if (bad) fail();
      else {
        patch.punishNotice = next;
        applied.push(key);
      }
      continue;
    }

    if (key === "badWords") {
      if (!Array.isArray(value) || value.length > 100) {
        fail();
        continue;
      }
      const words = [
        ...new Set(
          value
            .filter((w): w is string => typeof w === "string")
            .map((w) => w.trim().toLowerCase())
            .filter((w) => w.length > 0 && w.length <= 40),
        ),
      ];
      patch.badWords = words;
      applied.push(key);
      continue;
    }

    const range = NUMBER_RANGES[key];
    if (range) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        fail();
        continue;
      }
      patch[key] = clamp(Math.floor(value), range[0], range[1]);
      applied.push(key);
      continue;
    }

    const enumValues = ENUM_FIELDS[key];
    if (enumValues) {
      if (typeof value !== "string" || !enumValues.includes(value)) fail();
      else {
        patch[key] = value;
        applied.push(key);
      }
      continue;
    }

    if (key === "autoroleRoleId") {
      if (typeof value !== "string" || !SNOWFLAKE_RE.test(value)) fail();
      else {
        patch.autoroleRoleId = value;
        applied.push(key);
      }
      continue;
    }

    if (URL_OR_COLOR_FIELDS.has(key)) {
      if (typeof value !== "string") fail();
      else {
        const cleaned = cleanUrlOrColor(key, value);
        if (cleaned === undefined && value.trim()) fail();
        else {
          patch[key] = cleaned;
          applied.push(key);
        }
      }
      continue;
    }

    const idArrayCap = ID_ARRAY_FIELDS[key];
    if (idArrayCap) {
      if (!Array.isArray(value)) {
        fail();
        continue;
      }
      const ids = [
        ...new Set(
          value
            .filter((v): v is string => typeof v === "string")
            .map((v) => v.trim())
            .filter((v) => SNOWFLAKE_RE.test(v))
            .slice(0, idArrayCap),
        ),
      ];
      patch[key] = ids;
      applied.push(key);
      continue;
    }

    const cap = STRING_FIELDS[key];
    if (cap !== undefined) {
      if (typeof value !== "string") fail();
      else {
        patch[key] = value ? value.slice(0, cap) : undefined;
        applied.push(key);
      }
      continue;
    }

    if (CLEARABLE_STRING_FIELDS.has(key)) {
      if (typeof value !== "string") fail();
      else {
        patch[key] = value || undefined;
        applied.push(key);
      }
      continue;
    }

    // Field lọt allowlist nhưng chưa có nhánh xử lý ở trên → coi như hỏng để
    // không lọt giá trị chưa được kiểm tra.
    fail();
  }

  applyHeatThresholds(input, current, patch, applied, invalid);
  return { patch, applied, ignored, invalid };
}

/**
 * Ngưỡng nhiệt 4 field phụ thuộc lẫn nhau nên phải quyết định cả cụm:
 * timeout < kick < ban, và warn < timeout. Sai một chiều thì hệ thống nhiệt
 * độ hỏng theo (không bao giờ kick/ban được).
 *
 * `updateSettings` dùng cùng quy tắc với `guild` làm fallback; ở đây `current`
 * đóng vai trò đó.
 */
function applyHeatThresholds(
  input: Record<string, unknown>,
  current: { heatTimeoutAt?: number; heatKickAt?: number; heatBanAt?: number },
  patch: Record<string, unknown>,
  applied: string[],
  invalid: string[],
): void {
  const read = (key: string): number | undefined => {
    const v = input[key];
    return typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : undefined;
  };

  if (
    read("heatTimeoutAt") !== undefined ||
    read("heatKickAt") !== undefined ||
    read("heatBanAt") !== undefined
  ) {
    const t = clamp(
      read("heatTimeoutAt") ?? current.heatTimeoutAt ?? HEAT_DEFAULTS.timeoutAt,
      1,
      100,
    );
    const k = clamp(read("heatKickAt") ?? current.heatKickAt ?? HEAT_DEFAULTS.kickAt, 1, 100);
    const b = clamp(read("heatBanAt") ?? current.heatBanAt ?? HEAT_DEFAULTS.banAt, 1, 100);
    if (!(t < k && k < b)) {
      invalid.push("heatTimeoutAt", "heatKickAt", "heatBanAt");
    } else {
      patch.heatTimeoutAt = t;
      patch.heatKickAt = k;
      patch.heatBanAt = b;
      applied.push("heatTimeoutAt", "heatKickAt", "heatBanAt");
    }
  }

  const warn = read("heatWarnAt");
  if (warn === undefined) return;
  // Ngưỡng tạm khóa phải lấy từ giá trị VỪA quyết định ở trên, không phải từ
  // `current` — nếu không, file mang cả 4 ngưỡng sẽ tự mâu thuẫn với chính nó.
  const decided = patch.heatTimeoutAt;
  const decidedNum = typeof decided === "number" ? decided : undefined;
  const timeout = clamp(
    read("heatTimeoutAt") ?? decidedNum ?? current.heatTimeoutAt ?? HEAT_DEFAULTS.timeoutAt,
    1,
    100,
  );
  const w = clamp(warn, 1, 99);
  if (w >= timeout) invalid.push("heatWarnAt");
  else {
    patch.heatWarnAt = w;
    applied.push("heatWarnAt");
  }
}

/** Đọc `guildId`/`name` ra khỏi document — chỉ để hiển thị, KHÔNG phải cấu hình. */
export function buildGuildConfigExport(guild: {
  discordId: string;
  name: string;
  [key: string]: unknown;
}): {
  version: number;
  exportedAt: number;
  guild: { discordId: string; name: string };
  config: Record<string, unknown>;
} {
  const config: Record<string, unknown> = {};
  for (const field of PORTABLE_CONFIG_FIELDS) {
    const value = guild[field];
    // `undefined` = chưa cấu hình, không phải giá trị cần mang đi.
    if (value !== undefined) config[field] = value;
  }
  return {
    version: PORTABLE_CONFIG_VERSION,
    exportedAt: Date.now(),
    guild: { discordId: guild.discordId, name: guild.name },
    config,
  };
}
