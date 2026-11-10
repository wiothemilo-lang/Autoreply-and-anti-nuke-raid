"use strict";
/**
 Lớp gọi AI phân loại raid/vi phạm (best-effort, 6s timeout) — trả null khi AI offline. 
 */
const aiClient = require("../../ai");

/** Trần chờ AI cho mọi nhánh phân tích — một chỗ để không lệch 6000/6000/6000. */
const AI_TIMEOUT_MS = 6000;

/**
 * Chờ `promise` tối đa AI_TIMEOUT_MS rồi trả null (AI coi như offline).
 * `clearTimeout` ở finally để lời gọi xong sớm không giữ timer 6 giây.
 */
function withAiTimeout(promise) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), AI_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

module.exports = function createAntiNukeLayer({ state }) {
  const { joiners } = state.state;

  // FEEDBACK LOOP (vòng 4): verdict quá khứ từ raidSamples (Convex) — cache 5
  // phút để không query mỗi vụ; lỗi/lazy-require vòng → trả rỗng, AI chạy thiếu
  // bias như cũ.
  let recentSamplesCache = { at: 0, rows: [] };
  async function recentAiSamples(store) {
    if (!store?.client?.query) return [];
    if (Date.now() - recentSamplesCache.at < 5 * 60_000) return recentSamplesCache.rows;
    try {
      const rows = await store.client.query("antinuke:recentRaidSamples", { limit: 40 });
      const mapped = (rows || [])
        .filter((r) => r && typeof r.aiClassification === "string")
        .map((r) => ({ classification: r.aiClassification, punish: r.punish ?? null }));
      recentSamplesCache = { at: Date.now(), rows: mapped };
      return mapped;
    } catch {
      return recentSamplesCache.rows;
    }
  }

  /** Gọi AI phân loại sự kiện raid vs cá nhân. Trả về null khi AI không có.
   *  Chạy TRỰC TIẾP từ process bot (bot/src/ai.js) — không tốn Convex actions.
   *  opts.knownThreats (tùy chọn): { keywords, phrases } — mẫu scam mạng đã xác
   *  nhận để AI đối chiếu (bot tự học từ các vụ raid thật, 0 token).
   */
  async function aiClassify(guild, module, count, windowSeconds, threshold, samples, opts = {}) {
    try {
      if (!aiClient.aiAvailable()) return null;
      const recentJoins = joiners.get(guild.id)?.length ?? 0;
      const recentSamples = await recentAiSamples(opts?.store);
      const res = await withAiTimeout(
        aiClient.classifyViolation({
          module,
          count,
          windowSeconds,
          threshold,
          sampleMessages: samples,
          recentJoins,
          memberCount: guild.memberCount ?? undefined,
          knownThreats: opts?.knownThreats ?? undefined,
          evidence: opts?.evidence ?? undefined,
          recentSamples,
        }),
      );
      if (!res || res.offline) return null;
      return res;
    } catch (err) {
      console.error("[ai:classify]", err.message);
      return null;
    }
  }

  /** Gọi AI phân tích cụm raid (best-effort, 6s timeout). Trả null khi AI offline.
   *  Chạy TRỰC TIẾP từ process bot — không tốn Convex actions.
   */
  async function aiAnalyzeRaid(
    guild,
    module,
    count,
    windowSeconds,
    threshold,
    clusterProfile,
    recentActions,
    opts = {},
  ) {
    try {
      if (!aiClient.aiAvailable()) return null;
      const res = await withAiTimeout(
        aiClient.analyzeRaid({
          module,
          count,
          windowSeconds,
          threshold,
          clusterProfile: clusterProfile ? String(clusterProfile).slice(0, 1500) : undefined,
          recentActions: recentActions ? String(recentActions).slice(0, 1500) : undefined,
          evidence: opts?.evidence ?? undefined,
        }),
      );
      if (!res || res.offline) return null;
      return res;
    } catch (err) {
      console.error("[ai:analyzeRaid]", err.message);
      return null;
    }
  }

  /** Gọi AI xác định chuỗi kết nối external app có phải raid không (best-effort, 6s timeout).
   *  Chạy TRỰC TIẾP từ process bot — không tốn Convex actions.
   */
  async function aiAnalyzeExternalApp(
    guild,
    count,
    windowSeconds,
    threshold,
    appProfile,
    recentJoins,
    opts = {},
  ) {
    try {
      if (!aiClient.aiAvailable()) return null;
      const res = await withAiTimeout(
        aiClient.analyzeExternalApp({
          count,
          windowSeconds,
          threshold,
          appProfile: appProfile ? String(appProfile).slice(0, 1500) : undefined,
          recentJoins: recentJoins ?? undefined,
          memberCount: guild.memberCount ?? undefined,
          evidence: opts?.evidence ?? undefined,
          knownThreats: opts?.knownThreats ?? undefined,
        }),
      );
      if (!res || res.offline) return null;
      return res;
    } catch (err) {
      console.error("[ai:analyzeExternalApp]", err.message);
      return null;
    }
  }

  /** Nhãn nguồn phát hiện raid: AI xác nhận hay tín hiệu deterministic (AI offline). */
  function raidNote(ai, isRaid) {
    if (!isRaid) return "";
    return ai && ai.offline !== true
      ? ` — AI xác nhận RAID (${ai?.reason || "phối hợp"})`
      : " — phát hiện RAID (nghi vấn cao)";
  }

  /**
   * Hồ sơ cụm tài khoản raid → dữ liệu huấn luyện (số acc, tuổi acc trung bình,
   * số avatar trùng nhau, thời gian vào rải rác).
   */
  function clusterStats(cluster) {
    if (!cluster || cluster.length === 0) return {};
    const now = Date.now();
    const ages = cluster.filter((m) => m.createdAt).map((m) => (now - m.createdAt) / 86_400_000);
    const avatarCounts = new Map();
    for (const m of cluster) {
      if (!m.avatar) continue;
      avatarCounts.set(m.avatar, (avatarCounts.get(m.avatar) ?? 0) + 1);
    }
    const shared = [...avatarCounts.values()].filter((c) => c >= 2).length;
    const sortedTs = cluster.map((m) => m.joinedAt || now).sort((a, b) => a - b);
    const burst = sortedTs.length > 1 ? (sortedTs[sortedTs.length - 1] - sortedTs[0]) / 1000 : 0;
    return {
      clusterMemberCount: cluster.length,
      clusterAvgAccountAgeDays: ages.length
        ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length)
        : undefined,
      clusterSharedAvatarCount: shared,
      clusterJoinBurstSeconds: Math.round(burst),
    };
  }

  return { aiClassify, aiAnalyzeRaid, aiAnalyzeExternalApp, raidNote, clusterStats };
};
