"use strict";
/**
 * nukeRollback.js — S3: TỰ HỒI PHỤC KÊNH/ROLE SAU NUKE TỪ SNAPSHOT CỤC BỘ.
 *
 * Vì sao cần: anti-nuke hiện PHÁT HIỆN + BAN kẻ phá nhưng kênh/role đã bị xoá
 * thì vẫn mất — chủ server phải restore tay. Từ khi có snapshot cục bộ C1
 * (mỗi giờ, zlib, 48 điểm trên VPS), ta có nguồn khôi phục KHÔNG phụ thuộc
 * Convex/GitHub/Discord-CDN. Module này nối dây: sau khi anti-nuke xử phạt
 * một vụ nuke cấu trúc, ghim snapshot mới nhất tại lúc phát hiện, chờ GRACE_MS
 * (60s — Discord audit/cache kịp ổn định), rồi đối chiếu guild hiện tại:
 *   - role/kênh có trong snapshot mà guild đang thiếu → tạo lại (dùng
 *     createRoles/createChannels của backup engine — tái sử dụng 100% logic
 *     đã có, không nhân bản code).
 *   - KHÔNG xoá gì: nuke kiểu "thêm rác" (massCreate) không bị đụng tới ở đây
 *     (kẻ xấu tạo kênh rác thì chủ server xoá tay — rollback chỉ hồi phục mất mát).
 *   - Config guild bật `rollbackEnabled` (mặc định BẬT) mới chạy; kênh log nhận
 *     embed kết quả.
 *
 * An toàn: thao tác Discord best-effort; thiếu snapshot → bỏ qua và ghi lý do;
 * không tự retry khi khôi phục từng phần để tránh tạo trùng; không đụng Convex;
 * cooldown 1 rollback/guild/10 phút.
 */

const { Colors } = require("discord.js");
const { logEmbed, sendLog } = require("../../util");
const localSnapshot = require("../../localSnapshot");

/** Chờ sau vụ nuke trước khi đối chiếu — audit log + cache Discord ổn định. */
const GRACE_MS = 60_000;
/** Tối thiểu số role/kênh bị mất mới đáng chạy rollback (tránh nhạy quá). */
const MIN_MISSING = 2;
/** Cooldown giữa 2 lần rollback cùng guild. */
const COOLDOWN_MS = 10 * 60_000;

module.exports = function createNukeRollback({ store }) {
  /** guildId -> mốc cooldown sau lần đối chiếu có cấu trúc hợp lệ */
  const lastRun = new Map();
  /** guildId -> job đã lên kế hoạch trong grace window hiện tại */
  const pending = new Map();
  /** guildId -> job đang thực thi, tránh rollback song song. */
  const active = new Map();

  /**
   * Gọi từ pipeline anti-nuke SAU khi xử phạt 1 vụ nuke cấu trúc. Chỉ ghi dấu
   * (fire-and-forget) — rollback thật chạy sau GRACE_MS.
   */
  function scheduleRollback(guild, module, executorId) {
    if (!guild?.id) return { scheduled: false, reason: "thiếu guild" };
    if (!module || typeof module !== "string") {
      return { scheduled: false, reason: "module không hợp lệ" };
    }
    const activeJob = active.get(guild.id);
    if (activeJob) {
      activeJob.modules.add(module);
      activeJob.executorId ??= executorId;
      return { scheduled: false, reason: "đang xử lý rollback" };
    }
    const already = pending.has(guild.id);
    if (already) {
      const job = pending.get(guild.id);
      job.modules.add(module);
      job.executorId ??= executorId;
      return { scheduled: false, reason: "đã có lịch trong grace window" };
    }
    // Pin snapshot ngay tại thời điểm đầu tiên phát hiện; không thay mốc này
    // bằng snapshot mới hơn khi nhiều sự kiện bị gộp trong grace window.
    let latestSnapshot = null;
    try {
      const latest = localSnapshot.listLocalSnapshots(guild.id)[0];
      if (latest) {
        latestSnapshot = {
          ts: latest.ts,
          data: localSnapshot.readLocalSnapshot(guild.id, latest.ts),
        };
      }
    } catch {
      // Pin thất bại thì fail-closed, không dùng snapshot được chụp sau event.
    }
    const job = {
      modules: new Set(),
      executorId,
      snapshotTs: latestSnapshot?.ts ?? null,
      pinnedSnapshot: latestSnapshot?.data ?? null,
    };
    job.modules.add(module);
    pending.set(guild.id, job);
    try {
      localSnapshot.appendLog(
        `[nukeRollback] guild=${guild.id} status=scheduled modules=${module} snapshot=${job.snapshotTs ?? "none"}`,
      );
    } catch (e) {
      console.error(
        `[nukeRollback] ${guild.id}: không ghi được log lịch rollback`,
        e?.message || e,
      );
    }
    setTimeout(async () => {
      const currentJob = pending.get(guild.id);
      pending.delete(guild.id);
      if (!currentJob) return;
      active.set(guild.id, currentJob);
      try {
        const result = await runRollback(guild, [...currentJob.modules], currentJob.executorId, {
          snapshotTs: currentJob.snapshotTs,
          snapshotPinned: true,
          pinnedSnapshot: currentJob.pinnedSnapshot,
          force: true,
        });
        reportResult(guild, result, [...currentJob.modules]);
      } catch (e) {
        reportFailure(guild, e, currentJob);
      } finally {
        active.delete(guild.id);
      }
    }, GRACE_MS).unref?.();
    return { scheduled: true, graceMs: GRACE_MS };
  }

  function reportFailure(guild, error, job) {
    const message = String(error?.message || error || "lỗi không xác định").slice(0, 180);
    const entry = `[nukeRollback] guild=${guild.id} status=error snapshot=${job?.snapshotTs ?? "none"} error=${message}`;
    try {
      localSnapshot.appendLog(entry);
    } catch (e) {
      console.error(entry, "(không ghi được log cục bộ)", e?.message || e);
    }
    console.error(entry);
  }

  function reportResult(guild, result, modules) {
    const status = result.partialFailure ? "partial" : result.ran ? "complete" : "skipped";
    const details = result.ran
      ? `restoredRoles=${result.restoredRoles} restoredChannels=${result.restoredChannels} missingRoles=${result.missingRoles} missingChannels=${result.missingChannels}`
      : `reason=${result.reason ?? "unknown"}`;
    const warning = result.partialFailure ? "; khôi phục chưa đầy đủ, cần kiểm tra thủ công" : "";
    const entry = `[nukeRollback] guild=${guild.id} status=${status} modules=${modules.join(",")} snapshot=${result.snapshotTs ?? "none"} ${details}${warning}`;
    try {
      localSnapshot.appendLog(entry);
    } catch (e) {
      console.error(entry, "(không ghi được log cục bộ)", e?.message || e);
    }
    if (result.partialFailure) console.warn(entry);
    else if (!result.ran) console.info(entry);
  }

  /**
   * Đối chiếu + khôi phục. Export cho test — chạy trực tiếp không cần đợi grace.
   * Trả { ran, restoredRoles, restoredChannels, snapshotTs, reason? }.
   */
  async function runRollback(guild, modules = [], executorId, opts = {}) {
    const out = {
      ran: false,
      restoredRoles: 0,
      restoredChannels: 0,
      snapshotTs: null,
      missingRoles: 0,
      missingChannels: 0,
      partialFailure: false,
    };
    if (!guild || guild.available === false) return { ...out, reason: "guild không sẵn sàng" };
    const config = await store.getConfig(guild.id).catch(() => null);
    if (!config || config.rollbackEnabled === false) return { ...out, reason: "rollback tắt" };
    const now = Date.now();
    if (!opts.force && lastRun.has(guild.id) && now - lastRun.get(guild.id) < COOLDOWN_MS) {
      return { ...out, reason: "trong cooldown" };
    }
    if (!opts.force && opts.snapshotPinned) {
      return { ...out, reason: "rollback tự động cần chế độ thực thi nội bộ" };
    }

    // Tự động rollback chỉ nhận snapshot đã ghim tại lúc phát hiện, không đọc
    // snapshot mới nhất sau grace window vì snapshot đó có thể đã chứa trạng thái bị phá.
    if (opts.snapshotPinned && !opts.pinnedSnapshot) {
      return { ...out, reason: "chưa có snapshot tại thời điểm phát hiện" };
    }
    const snap = opts.snapshotPinned
      ? opts.pinnedSnapshot
      : localSnapshot.readLocalSnapshot(guild.id, opts.snapshotTs ?? null);
    if (!snap?.guild) {
      return { ...out, reason: "không có snapshot" };
    }
    const backup = snap.guild;
    if (
      !Array.isArray(backup.roles) ||
      backup.roles.length > 250 ||
      !Array.isArray(backup.channels) ||
      backup.channels.length > 500
    ) {
      return { ...out, reason: "snapshot không có cấu trúc" };
    }
    if (opts.snapshotPinned && !Number.isFinite(opts.snapshotTs)) {
      return { ...out, reason: "mốc snapshot không hợp lệ" };
    }
    if (opts.snapshotPinned && snap.snapshotAt != null && snap.snapshotAt > opts.snapshotTs) {
      return { ...out, reason: "snapshot mới hơn thời điểm rollback" };
    }

    // ── Đối chiếu: những gì snapshot có mà guild đang thiếu ──
    const roleCache = guild.roles?.cache;
    const channelCache = guild.channels?.cache;
    if (typeof roleCache?.values !== "function" || typeof channelCache?.values !== "function") {
      return { ...out, snapshotTs: snap.snapshotAt ?? null, reason: "Discord cache chưa sẵn sàng" };
    }
    const backupEngine = require("../backup");
    const existingRoles = [...roleCache.values()];
    const existingRoleNames = new Set(existingRoles.map((r) => `${r.name}`.toLowerCase()));
    const roleIdsByName = new Map();
    const roleIds = new Set();
    for (const role of existingRoles) {
      roleIds.add(role.id);
      const key = `${role.name}`.toLowerCase();
      const ids = roleIdsByName.get(key) ?? [];
      ids.push(role.id);
      roleIdsByName.set(key, ids);
    }
    const existingChannelKeys = new Set(
      [...channelCache.values()].map((c) => `${c.type}:${c.name}`.toLowerCase()),
    );
    // guildId snapshot KHÔNG kiểm tra snowflake ở đây: test/fixture dùng ID giả,
    // và overwrite @everyone đã được ánh xạ an toàn hai tầng
    // (safeChannels → createChannels map `o.id === backup.guildId` sang guild.id).
    const usableRoles = backup.roles.filter(
      (role) =>
        typeof role?.id === "string" &&
        role.id &&
        typeof role.name === "string" &&
        role.name &&
        (typeof role.permissions === "string" || typeof role.permissions === "number") &&
        /^\d+$/.test(`${role.permissions}`),
    );
    const usableChannels = backup.channels.filter(
      (channel) =>
        typeof channel?.id === "string" &&
        channel.id &&
        typeof channel.name === "string" &&
        channel.name &&
        Number.isInteger(channel.type) &&
        Array.isArray(channel.overwrites) &&
        channel.overwrites.every(
          (overwrite) =>
            overwrite &&
            typeof overwrite.id === "string" &&
            /^\d+$/.test(`${overwrite.allow}`) &&
            /^\d+$/.test(`${overwrite.deny}`) &&
            (overwrite.type === 0 || overwrite.type === 1),
        ),
    );
    const backedUpRoleIds = new Set(backup.roles.map((role) => role?.id).filter(Boolean));
    const invalidSnapshotEntries =
      backup.roles.length - usableRoles.length + backup.channels.length - usableChannels.length;
    // Trong snapshot, role hiện có → loại trừ trước khi tạo lại.
    const missingRoles = usableRoles.filter(
      (r) => r.name && !existingRoleNames.has(r.name.toLowerCase()),
    );
    const missingChannels = usableChannels.filter(
      (c) => c.name && !existingChannelKeys.has(`${c.type}:${c.name}`.toLowerCase()),
    );
    out.missingRoles = missingRoles.length;
    out.missingChannels = missingChannels.length;
    const total = missingRoles.length + missingChannels.length;
    if (total < MIN_MISSING) {
      lastRun.set(guild.id, now);
      const skipped = invalidSnapshotEntries > 0;
      return {
        ...out,
        snapshotTs: snap.snapshotAt ?? null,
        partialFailure: skipped,
        reason: `chỉ thiếu ${total} mục${invalidSnapshotEntries ? `; bỏ qua ${invalidSnapshotEntries} mục snapshot lỗi` : ""} — không đáng rollback`,
      };
    }

    // ── Khôi phục TẠO LẠI phần thiếu (dùng engine backup có sẵn) ──
    const partial = {
      roles: missingRoles,
      channels: missingChannels,
      guildId: backup.guildId,
      guildName: backup.guildName,
      settings: backup.settings,
    };
    let createdRoles = new Map();
    let createdChannels = new Map();
    let roleError = false;
    let channelError = false;
    const restoreRoles = config.restoreRolesEnabled !== false && missingRoles.length > 0;
    const restoreChannels = config.restoreChannelsEnabled !== false && missingChannels.length > 0;
    if (restoreRoles) {
      // createRoles tạo theo thứ tự vị trí; trả Map oldId -> newId.
      try {
        createdRoles = await backupEngine.createRoles(guild, partial);
      } catch {
        roleError = true;
      }
    }
    // Overwrite trong snapshot trỏ tới ID cũ; map role còn sống theo tên duy
    // nhất + role vừa tạo sang ID hiện tại. Nếu không ánh xạ chắc chắn được,
    // bỏ qua cả kênh đó (không tạo kênh với quyền mặc định rộng hơn).
    const channelRoleMap = new Map();
    for (const oldRole of usableRoles) {
      if (missingRoles.some((role) => role.id === oldRole.id)) continue;
      const ids = roleIdsByName.get(oldRole.name.toLowerCase());
      if (ids?.length === 1) channelRoleMap.set(oldRole.id, ids[0]);
    }
    for (const [oldId, newId] of createdRoles) channelRoleMap.set(oldId, newId);
    const safeChannels = missingChannels.filter((channel) =>
      channel.overwrites.every(
        (overwrite) =>
          overwrite &&
          typeof overwrite.id === "string" &&
          ((overwrite.type === 1 &&
            !roleIds.has(overwrite.id) &&
            !backedUpRoleIds.has(overwrite.id)) ||
            (overwrite.type === 0 &&
              (overwrite.id === backup.guildId || channelRoleMap.has(overwrite.id)))),
      ),
    );
    if (restoreChannels && safeChannels.length > 0) {
      partial.channels = safeChannels;
      try {
        createdChannels = await backupEngine.createChannels(guild, partial, channelRoleMap);
      } catch {
        channelError = true;
      }
    }
    out.restoredRoles = createdRoles.size;
    out.restoredChannels = createdChannels.size;
    out.snapshotTs = snap.snapshotAt ?? null;
    out.ran = true;
    out.partialFailure =
      roleError ||
      channelError ||
      invalidSnapshotEntries > 0 ||
      safeChannels.length < missingChannels.length ||
      (!restoreRoles && missingRoles.length > 0) ||
      (!restoreChannels && missingChannels.length > 0) ||
      (restoreRoles && createdRoles.size < missingRoles.length) ||
      (restoreChannels && createdChannels.size < safeChannels.length);
    // Dù restore từng phần, không lặp API tạo role/kênh liên tiếp cho cùng sự cố.
    lastRun.set(guild.id, now);

    // ── Báo cáo lên kênh log ──
    try {
      const embed = logEmbed({
        title: out.partialFailure
          ? "⚠️ Nuke Rollback — khôi phục chưa đầy đủ"
          : "♻️ Nuke Rollback — đã hồi phục cấu trúc",
        description:
          `Sau vụ **${modules.join(", ") || "nuke"}**${executorId ? ` của <@${executorId}>` : ""}, ` +
          `đã tạo lại **${out.restoredRoles} role** + **${out.restoredChannels} kênh** ` +
          `từ snapshot cục bộ${snap.snapshotAt ? ` (${new Date(snap.snapshotAt).toISOString().slice(0, 16).replace("T", " ")} UTC)` : ""}.`,
        color: out.partialFailure ? Colors.Orange : Colors.Green,
        fields: [
          { name: "Role thiếu", value: `${missingRoles.length}`, inline: true },
          { name: "Kênh thiếu", value: `${missingChannels.length}`, inline: true },
          {
            name: "Kết quả",
            value: out.partialFailure
              ? `Chưa khôi phục đủ; kiểm tra quyền/rate limit hoặc snapshot lỗi${
                  !restoreRoles && missingRoles.length > 0
                    ? "; khôi phục role đang tắt trong cấu hình"
                    : ""
                }${
                  !restoreChannels && missingChannels.length > 0
                    ? "; khôi phục kênh đang tắt trong cấu hình"
                    : ""
                }`
              : "Hoàn tất",
            inline: true,
          },
          { name: "Nguồn", value: "💾 Snapshot VPS (không phụ thuộc cloud)", inline: true },
        ],
        footer: "Protogon · Nuke Rollback",
      });
      await sendLog(guild, config, embed);
    } catch {
      // log fail không ảnh hưởng kết quả
    }
    console.log(
      `[nukeRollback] ${guild.id}: +${out.restoredRoles} roles, +${out.restoredChannels} channels (thiếu ${missingRoles.length}/${missingChannels.length}, partial=${out.partialFailure})`,
    );
    return out;
  }

  /** Dọn state (test). */
  function reset() {
    lastRun.clear();
    pending.clear();
    active.clear();
  }

  return { scheduleRollback, runRollback, reset, GRACE_MS, MIN_MISSING, COOLDOWN_MS };
};
