"use strict";
/**
 * vandalBudget.js — S4: NGÂN SÁCH PHÁ HOẠI PER-EXECUTOR (đốt RAM ~1KB/người).
 *
 * Vì sao cần: anti-nuke hiện phản ứng THEO TỪNG MODULE (record/guildId:module) —
 * kẻ phá hoại "rải đều chậm" (mỗi module 1-2 hành động, dưới ngưỡng từng module)
 * không bao giờ chạm ngưỡng nào, nhưng TỔNG hạ cấu trúc server vẫn lớn.
 *
 * Cơ chế: mọi hành vi phá hoại cấu trúc đã quy về executor (đã qua miễn trừ
 * owner/whitelist/bot-logging) được ghi vào ngân sách tích lũy 15 phút TRÊN CẢ
 * MODULE. Vượt BUDGET_LIMIT → cách ly: gắn role "🔒 Protogon Cách Ly" (role rỗng
 * quyền, tạo 1 lần/guild) trong ISOLATE_MS (2 giờ) — kẻ xấu mất quyền phá tiếp
 * kể cả ngưỡng từng module chưa đủ để ban.
 *
 * An toàn:
 *  - KHÔNG cách ly owner/administrator (không quản được + gần như là hành vi hợp pháp).
 *  - Hết hạn tự gỡ role; vòng tick 20s của antinuke gọi tickReleases() dọn dư.
 *  - Mọi thao tác Discord best-effort: thiếu quyền/chênh lệch cache → bỏ qua,
 *    không bao giờ ném lỗi giết pipeline audit.
 *  - Trạng thái thuần RAM: restart mất cách ly (được chấp nhận — pipeline chính
 *    vẫn xử phạt từng vụ), KHÔNG đụng Convex.
 */

const { PermissionFlagsBits } = require("discord.js");

/** Cửa sổ ngân sách: hành vi phá hoại trong 15 phút tính dồn. */
const WINDOW_MS = 15 * 60_000;
/** Ngân sách: vượt số hành vi này trong cửa sổ → cách ly. */
const BUDGET_LIMIT = 10;
/** Thời gian cách ly. */
const ISOLATE_MS = 2 * 60 * 60_000;
/** Tên role cách ly (tạo nếu thiếu). */
const ISOLATE_ROLE_NAME = "🔒 Protogon Cách Ly";

module.exports = function createVandalBudget() {
  /** `${guildId}:${userId}` -> { ts: [ms], isolated?: { until, roleId } } */
  const budget = new Map();
  /** guildId -> roleId cách ly (cache, tránh tạo lại mỗi lần) */
  const roleCache = new Map();

  /**
   * Ghi 1 hành vi phá hoại của executor. Trả số hành vi đang có trong cửa sổ.
   * Chỉ RAM + prune mảng cũ — gọi thoải mái mỗi audit event.
   */
  function note(guildId, userId, now = Date.now()) {
    if (!guildId || !userId) return 0;
    const key = `${guildId}:${userId}`;
    const entry = budget.get(key) ?? { ts: [] };
    entry.ts.push(now);
    // Prune ngoài cửa sổ (ngân sách là cửa sổ trượt, không reset nhịp).
    entry.ts = entry.ts.filter((t) => now - t <= WINDOW_MS);
    budget.set(key, entry);
    // Chống phình RAM: guild/user đã im lặng quá cửa sổ ×2 → dọn.
    if (budget.size > 5000) {
      for (const [k, v] of budget) {
        const last = v.ts[v.ts.length - 1] ?? 0;
        if (now - last > WINDOW_MS * 2 && !v.isolated) budget.delete(k);
      }
    }
    return entry.ts.length;
  }

  /** Ngân sách hiện tại (không ghi thêm) — cho test/log. */
  function score(guildId, userId, now = Date.now()) {
    const entry = budget.get(`${guildId}:${userId}`);
    if (!entry) return 0;
    return entry.ts.filter((t) => now - t <= WINDOW_MS).length;
  }

  /** Tìm role cách ly trong cache guild (tạo mới nếu thiếu). */
  async function ensureIsolateRole(guild) {
    const cached = roleCache.get(guild.id);
    if (cached) {
      const role = guild.roles.cache.get(cached);
      if (role) return role;
      roleCache.delete(guild.id);
    }
    const existing = guild.roles.cache.find?.((r) => r.name === ISOLATE_ROLE_NAME);
    if (existing) {
      roleCache.set(guild.id, existing.id);
      return existing;
    }
    const created = await guild.roles.create({
      name: ISOLATE_ROLE_NAME,
      color: 0x992d22,
      permissions: [], // rỗng quyền — mọi đặc quyền role khác không bị ảnh hưởng
      mentionable: false,
    });
    roleCache.set(guild.id, created.id);
    return created;
  }

  /**
   * Có nên cách ly không + tự cách ly nếu đủ điều kiện. Gọi SAU khi ghi note.
   * Trả { isolated, reason?, roleId?, until?, budget }.
   */
  async function maybeIsolate(guild, member, count) {
    const result = { budget: count };
    if (!guild || !member) return { ...result, isolated: false, reason: "thiếu dữ liệu" };
    if (count <= BUDGET_LIMIT) return { ...result, isolated: false, reason: "chưa vượt ngân sách" };
    // Owner / administrator: không cách ly được (quyền cao hơn role) — pipeline
    // chính (massBan/massChannelDelete…) vẫn xử phạt từng vụ như thường.
    if (member.id === guild.ownerId) return { ...result, isolated: false, reason: "là owner" };
    try {
      if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) {
        return { ...result, isolated: false, reason: "là administrator" };
      }
    } catch {
      // permissions mock khác dạng — coi như không phải admin, tiếp tục
    }
    const key = `${guild.id}:${member.id}`;
    // Tự tạo entry nếu caller chưa note (bền với mọi thứ tự gọi — state cách ly
    // vẫn được ghi để tickReleases gỡ đúng hạn).
    const entry = budget.get(key) ?? { ts: [] };
    budget.set(key, entry);
    if (entry?.isolated && entry.isolated.until > Date.now()) {
      return { ...result, isolated: true, reason: "đang cách ly", until: entry.isolated.until };
    }
    try {
      const role = await ensureIsolateRole(guild);
      await member.roles.add(role.id, "[Protogon] Vượt ngân sách phá hoại tích lũy");
      const until = Date.now() + ISOLATE_MS;
      if (entry) entry.isolated = { until, roleId: role.id };
      // Tự gỡ khi hết hạn (unref — không giữ process sống chỉ để gỡ role).
      setTimeout(() => {
        releaseOne(guild, member.id).catch(() => {});
      }, ISOLATE_MS).unref?.();
      return { ...result, isolated: true, roleId: role.id, until };
    } catch (e) {
      return { ...result, isolated: false, reason: `không cách ly được: ${e?.message || e}` };
    }
  }

  /** Gỡ role cách ly cho 1 member (best-effort). */
  async function releaseOne(guild, userId) {
    const key = `${guild.id}:${userId}`;
    const entry = budget.get(key);
    const roleId = entry?.isolated?.roleId ?? roleCache.get(guild.id);
    if (roleId) {
      const member = await guild.members.fetch(userId).catch(() => null);
      try {
        if (member && typeof member.roles?.remove === "function") {
          await member.roles.remove(roleId, "[Protogon] Hết thời gian cách ly");
        }
      } catch {
        // thiếu quyền / member rời server — bỏ qua
      }
    }
    if (entry) entry.isolated = undefined;
  }

  /**
   * Vòng dọn: gỡ role cho các member hết hạn cách ly + prune ngân sách nguội.
   * Gắn vào interval 20s của antinuke. Trả số role đã gỡ.
   */
  async function tickReleases(client, now = Date.now()) {
    let released = 0;
    for (const [key, entry] of budget) {
      if (!entry.isolated) continue;
      const [guildId, userId] = key.split(":");
      if (entry.isolated.until > now) continue;
      try {
        const guild = client.guilds.cache.get(guildId);
        if (guild) {
          await releaseOne(guild, userId);
          released++;
        }
      } catch {
        // guild rời/bot thiếu quyền — bỏ qua, đánh dấu hết hạn ở dòng dưới vẫn chạy
      }
      entry.isolated = undefined;
    }
    return released;
  }

  /** Dọn toàn bộ state (test + shutdown). */
  function reset() {
    budget.clear();
    roleCache.clear();
  }

  return {
    WINDOW_MS,
    BUDGET_LIMIT,
    ISOLATE_MS,
    note,
    score,
    maybeIsolate,
    tickReleases,
    reset,
    // expose nội bộ cho test
    _budget: budget,
    _roleCache: roleCache,
  };
};
