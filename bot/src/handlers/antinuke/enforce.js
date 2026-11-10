"use strict";
/**
 Lớp xử phạt chung: punishWithHeat (kết hợp nhiệt) + configOf + maybeLockdown. 
 */
const { isLocked, lockGuild } = require("../../lockdown");
const { heatSettings, punishMember, choosePunish, heatSummary } = require("../../heat");
const { actionsOf, memberPunishOf } = require("../../moduleActions");
const { NUKE_MODULES } = require("./shared");

module.exports = function createAntiNukeLayer({ client, store, heat, state }) {
  const { lastConfigs } = state.state;

  /**
   * Phạt một thành viên theo danh sách hành động kết hợp của module (multi-select):
   * dùng hình phạt thành viên MẠNH NHẤT (ban > kick > timeout > warn); nếu không
   * chọn hình phạt nào thì chỉ dọn tin nhắn (delete/purge) mà không đụng thành viên.
   * Module nuke/raid: phạt trực tiếp (không nhiệt). Module moderation: cộng nhiệt
   * và tự tăng cấp nếu vượt ngưỡng.
   * Trả về mô tả hành động.
   */
  async function punishWithHeat(guild, member, moduleCfg, reason) {
    const actions = actionsOf(moduleCfg);
    const memberActions = actions.filter((a) => ["warn", "kick", "ban", "timeout"].includes(a));
    if (memberActions.length === 0) {
      return {
        action: "không phạt thành viên (chỉ dọn tin nhắn)",
        caseNumber: undefined,
        chosen: null,
      };
    }
    const base = memberPunishOf(actions, moduleCfg.punish || "warn");
    // Nuke module: phạt trực tiếp theo cấu hình. BOT (thành viên là bot user) trigger
    // module chống nuke/raid: cũng phạt THẲNG TAY theo cấu hình — bot không cần cộng
    // nhiệt như người dùng (không "học" sau nhiều lần nhắc nhở).
    if (NUKE_MODULES.has(moduleCfg.module) || member?.user?.bot === true) {
      const chosen = base;
      const res = await punishMember(
        guild,
        member,
        chosen,
        reason,
        moduleCfg.timeoutSeconds,
        store,
      );
      return { action: res.action, caseNumber: res.caseNumber, chosen };
    }
    const s = heatSettings(lastConfigs.get(guild.id) ?? {});
    const heatRes = await heat.add(
      guild.id,
      member.id,
      member.user?.username,
      moduleCfg.heat ?? 10,
      s,
    );
    const chosen = choosePunish(base, heatRes);
    const res = await punishMember(guild, member, chosen, reason, moduleCfg.timeoutSeconds, store);
    if (chosen !== "warn") heat.markPunished(guild.id, member.id);
    return { action: res.action + heatSummary(heatRes), caseNumber: res.caseNumber, chosen };
  }

  /** Auto-lock channels when a raid is confirmed and lockdown is enabled. */
  async function maybeLockdown(guild, config) {
    if (!config.lockdownEnabled) return;
    if (isLocked(guild.id)) return;
    await lockGuild(client, guild, config, store);
  }

  return { punishWithHeat, maybeLockdown };
};
