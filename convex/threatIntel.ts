import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getUserByToken } from "./auth";
import { getBotStatus, isBotAdminUser } from "./hidden";
import { requireBotKeyStrict } from "./botAuth";

/**
 * Threat Intel — bộ não học hỏi của bot: lưu kết quả nghiên cứu định kỳ từ nguồn
 * mở (Reddit security subs, threat feed JSON công khai — KHÔNG tốn tiền) + từ
 * khóa scam mới khai thác được (bằng AI mỗi tuần 1 lần hoặc từ các vụ raid thật).
 *
 * Phân bổ tài nguyên (rẻ cho học sinh/sinh viên):
 *  - Bot tải nguồn mở mỗi 4 giờ (6 lần/ngày) — 0 token, chỉ network.
 *  - AI tổng hợp CHỈ khi có tin mới + mỗi tuần tối đa 1 lần bắt buộc (~8-15k tokens/tháng).
 *  - Từ khóa scam học được hợp nhất vào wildcard — bot dùng MIỄN PHÍ vĩnh viễn.
 *  - Ambient learning: mọi vụ raid thật AI đã phân loại → từ khóa được khai thác
 *    mà không tốn thêm token nào.
 */

/** Làm sạch text: giới hạn độ dài, bỏ ký tự điều khiển. */
const clean = (s: string | undefined, max = 200) =>
  String(s ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, max);

const cleanArray = (arr: string[] | undefined, max = 40) =>
  (arr ?? [])
    .map((s) => clean(s, 80))
    .filter(Boolean)
    .slice(0, max);

/** Row duy nhất của bảng botStatus (đọc helper từ hidden.ts). */

export const getSettings = query({
  // Chỉ chủ bot (đăng nhập web) được đọc — panel Admin. Trước đây mở công khai:
  // kẻ ngoài có thể dò từ khóa scam + trạng thái nghiên cứu (recon cho spam).
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await getUserByToken(ctx, token);
    if (!user) return null;
    const status = await getBotStatus(ctx);
    if (!status || !isBotAdminUser(user, status)) return null;
    return {
      researchEnabled: status?.threatResearchEnabled ?? false,
      aiWeeklyEnabled: status?.threatResearchAiWeekly ?? true,
      notifyEnabled: status?.researchNotifyEnabled ?? false,
      lastRunAt: status?.threatResearchLastRunAt ?? null,
      lastRunAtMs: status?.threatResearchLastRunAt ?? null,
      keywords: status?.threatKeywords ?? [],
      scamPhrases: status?.threatScamPhrases ?? [],
      lastSources: status?.threatResearchLastSources ?? [],
      totalRuns: status?.threatResearchRuns ?? 0,
      nextRunHintMs: status?.threatResearchNextRunAt ?? null,
      // Tiến độ học lượt gần nhất (bảng "Bot đã học được gì").
      lastNewKeywords: status?.threatResearchLastNewKeywords ?? null,
      lastNewPhrases: status?.threatResearchLastNewPhrases ?? null,
      lastSourceCount: status?.threatResearchLastSourceCount ?? null,
      // Học thủ công.
      manualPending: status?.threatManualLearnRequested ?? false,
      manualLastAt: status?.threatManualLearnAt ?? null,
      manualLastBy: status?.threatManualLearnBy ?? null,
      // Digest tuần + AI review từ khóa + engine cục bộ (n-gram, URLhaus).
      digestLast: status?.threatDigestLast ?? null,
      digestLastAt: status?.threatDigestLastAt ?? null,
      keywordReviewAt: status?.threatKeywordReviewAt ?? null,
      keywordReviewSuspects: status?.threatKeywordReviewSuspects ?? [],
      aiReviewPending: status?.threatAiReviewRequested ?? false,
      /** Lỗi lượt nghiên cứu gần nhất (bot báo lại) — Admin hiển thị dòng đỏ. */
      lastError: status?.threatResearchLastError ?? null,
      lastErrorAt: status?.threatResearchLastErrorAt ?? null,
      urlhausDomains: status?.threatUrlhausDomains ?? 0,
      ngramClusters: status?.threatNgramClusters ?? 0,
    };
  },
});

export const setResearchSettings = mutation({
  args: {
    token: v.string(),
    enabled: v.optional(v.boolean()),
    aiWeeklyEnabled: v.optional(v.boolean()),
    notifyEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, { token, enabled, aiWeeklyEnabled, notifyEnabled }) => {
    const user = await getUserByToken(ctx, token);
    if (!user) throw new Error("Vui lòng đăng nhập");
    const status = await getBotStatus(ctx);
    if (!isBotAdminUser(user, status)) {
      throw new Error("Chỉ chủ bot hoặc quản trị viên nhóm mới được đổi cài đặt Threat Intel 🔒");
    }
    const patch: Record<string, unknown> = {};
    if (enabled !== undefined) patch.threatResearchEnabled = enabled;
    if (aiWeeklyEnabled !== undefined) patch.threatResearchAiWeekly = aiWeeklyEnabled;
    if (notifyEnabled !== undefined) patch.researchNotifyEnabled = notifyEnabled;
    if (status) {
      await ctx.db.patch(status._id, patch);
    } else {
      const now = Date.now();
      await ctx.db.insert("botStatus", {
        kind: "status",
        online: false,
        guildCount: 0,
        memberCount: 0,
        lastHeartbeat: now,
        startedAt: now,
        version: "",
        ...patch,
      });
    }
    return { ok: true };
  },
});

/** Bot lưu 1 lượt nghiên cứu: nguồn đã tải, từ khóa/phrases mới khai thác được, tóm tắt AI. */
export const botSetResearchRun = mutation({
  args: {
    sources: v.array(v.string()),
    keywords: v.array(v.string()),
    scamPhrases: v.array(v.string()),
    summary: v.optional(v.string()),
    aiUsed: v.boolean(),
    nextRunAt: v.number(),
    /** Từ khóa từ các vụ raid thật (ambient learning) — gộp chung vào keywords. */
    learnedFromIncidents: v.optional(v.number()),
    /** "auto" (định kỳ) | "manual" (/research learn hoặc nút web). */
    trigger: v.optional(v.string()),
    /** Người yêu cầu học thủ công (username) — chỉ với trigger manual. */
    requestedBy: v.optional(v.string()),
    /** Chìa khóa bot (botAuth). */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // CHỈ bot được ghi intel: kẻ ngoài gọi công khai sẽ ĐỘC intel (giả từ khóa
    // scam → bot lọc nhầm thành viên thật = đầu độc dữ liệu) + đốt hạn mức ghi.
    await requireBotKeyStrict(ctx, args.botKey);
    const status = await getBotStatus(ctx);
    const now = Date.now();
    // Hợp nhất từ khóa: giữ tối đa 60 keywords + 40 phrases, ưu tiên mới nhất.
    const oldKeywords = status?.threatKeywords ?? [];
    const oldPhrases = status?.threatScamPhrases ?? [];
    const merge = (oldArr: string[], newArr: string[], cap: number) => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const s of [...newArr, ...oldArr]) {
        const k = s.toLowerCase().trim();
        if (!k || k.length < 3 || seen.has(k)) continue;
        seen.add(k);
        out.push(s.trim());
        if (out.length >= cap) break;
      }
      return out;
    };
    const keywords = merge(oldKeywords, cleanArray(args.keywords, 20), 60);
    const scamPhrases = merge(oldPhrases, cleanArray(args.scamPhrases, 15), 40);
    const patch: Record<string, unknown> = {
      // KHÔNG ép threatResearchEnabled = true ở đây: nếu chủ bot vừa tắt research
      // trên web trong lúc bot đang chạy 1 lượt, cờ bật sẽ bị lật lại nhầm.
      threatResearchLastRunAt: now,
      threatResearchNextRunAt: args.nextRunAt,
      threatResearchRuns: (status?.threatResearchRuns ?? 0) + 1,
      threatResearchLastSources: cleanArray(args.sources, 8),
      threatKeywords: keywords,
      threatScamPhrases: scamPhrases,
      // Tiến độ học của lượt này (hiển thị bảng "Bot đã học được gì" trên web).
      threatResearchLastNewKeywords: Math.min(args.keywords.length, 20),
      threatResearchLastNewPhrases: Math.min(args.scamPhrases.length, 10),
      threatResearchLastSourceCount: Math.min(args.sources.length, 8),
    };
    if (args.summary) patch.threatResearchLastSummary = clean(args.summary, 700);
    if (args.aiUsed !== undefined) patch.threatResearchLastAiUsed = args.aiUsed;
    // Lượt chạy THÀNH CÔNG → xóa lỗi lượt trước (nếu có).
    patch.threatResearchLastError = undefined;
    patch.threatResearchLastErrorAt = undefined;
    if (status) {
      await ctx.db.patch(status._id, patch);
    } else {
      await ctx.db.insert("botStatus", {
        kind: "status",
        online: false,
        guildCount: 0,
        memberCount: 0,
        lastHeartbeat: now,
        startedAt: now,
        version: "",
        ...patch,
      });
    }
    // Ghi lịch sử học (bảng researchRuns) — 1 row/lượt, tự dọn giữ 50 row mới.
    await ctx.db.insert("researchRuns", {
      trigger: args.trigger === "manual" ? "manual" : "auto",
      sources: cleanArray(args.sources, 8),
      newKeywords: Math.min(args.keywords.length, 20),
      newPhrases: Math.min(args.scamPhrases.length, 10),
      aiUsed: args.aiUsed === true,
      summary: args.summary ? clean(args.summary, 700) : undefined,
      totalKeywords: keywords.length,
      totalPhrases: scamPhrases.length,
      learnedFromIncidents: args.learnedFromIncidents,
      requestedBy: args.requestedBy ? clean(args.requestedBy, 60) : undefined,
      createdAt: now,
    });
    // Dọn row cũ — giữ 50 row mới nhất (bảng luôn nhỏ, reads rẻ).
    const allRuns = await ctx.db
      .query("researchRuns")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", now + 1000))
      .order("desc")
      .take(100);
    for (const row of allRuns.slice(50)) await ctx.db.delete(row._id);
    return { ok: true, keywords, scamPhrases };
  },
});

/** Bot đọc intel hiện có (từ khóa + phrases) — 1 query, rẻ, cache trong tick. */
export const botGetIntel = query({
  args: {
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { botKey }) => {
    await requireBotKeyStrict(ctx, botKey);
    const status = await getBotStatus(ctx);
    const now = Date.now();
    return {
      keywords: status?.threatKeywords ?? [],
      scamPhrases: status?.threatScamPhrases ?? [],
      researchEnabled: status?.threatResearchEnabled ?? false,
      aiWeeklyEnabled: status?.threatResearchAiWeekly ?? true,
      notifyEnabled: status?.researchNotifyEnabled ?? false,
      /** Cờ học thủ công đang chờ (bot đọc query trước, chỉ mutation claim khi có). */
      manualLearnPending: status?.threatManualLearnRequested ?? false,
      nextRunAt: status?.threatResearchNextRunAt ?? null,
      lastRunAt: status?.threatResearchLastRunAt ?? null,
      lastAiUsed: status?.threatResearchLastAiUsed ?? false,
      summary: status?.threatResearchLastSummary ?? null,
      sources: status?.threatResearchLastSources ?? [],
      runs: status?.threatResearchRuns ?? 0,
      now,
    };
  },
});

/** Bot xóa từ khóa sai/hỏng (nếu AI học nhầm) — gọi từ web Admin. */
export const removeKeyword = mutation({
  args: {
    token: v.string(),
    keyword: v.string(),
    kind: v.union(v.literal("keyword"), v.literal("phrase")),
  },
  handler: async (ctx, { token, keyword, kind }) => {
    const user = await getUserByToken(ctx, token);
    if (!user) throw new Error("Vui lòng đăng nhập");
    const status = await getBotStatus(ctx);
    if (!isBotAdminUser(user, status)) {
      throw new Error("Chỉ chủ bot hoặc quản trị viên nhóm mới được sửa Threat Intel 🔒");
    }
    if (!status) return { ok: false };
    if (kind === "keyword") {
      const keywords = (status.threatKeywords ?? []).filter((k) => k !== keyword);
      await ctx.db.patch(status._id, { threatKeywords: keywords });
    } else {
      const scamPhrases = (status.threatScamPhrases ?? []).filter((k) => k !== keyword);
      await ctx.db.patch(status._id, { threatScamPhrases: scamPhrases });
    }
    return { ok: true };
  },
});

/** Thống kê mẫu raid đã thu thập (hiển thị trong panel Admin — chỉ chủ bot). */
export const sampleStats = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await getUserByToken(ctx, token);
    if (!user) return { total: 0, last30d: 0, byModule: [] };
    const status = await getBotStatus(ctx);
    if (!isBotAdminUser(user, status)) {
      return { total: 0, last30d: 0, byModule: [] };
    }
    const all = await ctx.db.query("raidSamples").collect();
    const byModule = new Map<string, number>();
    for (const s of all) byModule.set(s.module, (byModule.get(s.module) ?? 0) + 1);
    const last30 = all.filter((s) => s.createdAt > Date.now() - 30 * 24 * 3600 * 1000);
    return {
      total: all.length,
      last30d: last30.length,
      byModule: [...byModule.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([module, count]) => ({ module, count })),
    };
  },
});

/**
 * Web Admin + bot — lịch sử học tập gần đây (bảng researchRuns, 20 row mới).
 * Chủ bot (token) HOẶC bot (botKey) đọc được. 1 query rẻ (index, take 20).
 */
export const getResearchHistory = query({
  args: {
    token: v.optional(v.string()),
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, { token, botKey }) => {
    let isOwner = false;
    if (token) {
      const user = await getUserByToken(ctx, token);
      if (!user) return [];
      const status = await getBotStatus(ctx);
      if (!isBotAdminUser(user, status)) return [];
      isOwner = true;
    } else {
      await requireBotKeyStrict(ctx, botKey);
      isOwner = true;
    }
    if (!isOwner) return [];
    const rows = await ctx.db
      .query("researchRuns")
      .withIndex("by_createdAt", (q) => q.gt("createdAt", 0))
      .order("desc")
      .take(20);
    return rows.map((r) => ({
      trigger: r.trigger,
      sources: r.sources,
      newKeywords: r.newKeywords,
      newPhrases: r.newPhrases,
      aiUsed: r.aiUsed,
      summary: r.summary ?? null,
      totalKeywords: r.totalKeywords,
      totalPhrases: r.totalPhrases,
      learnedFromIncidents: r.learnedFromIncidents ?? 0,
      requestedBy: r.requestedBy ?? null,
      createdAt: r.createdAt,
    }));
  },
});

/**
 * Web Admin / bot — YÊU CẦU học thủ công: đặt cờ threatManualLearnRequested
 * trong botStatus; vòng tick của bot nhận cờ (getPendingJobs batch sẵn có,
 * KHÔNG thêm polling mới) rồi chạy runResearch ngay. Cooldown 2 phút chống spam.
 */
export const requestManualLearn = mutation({
  args: {
    /** Token web (chủ bot) — hoặc bot gọi bằng botKey. */
    token: v.optional(v.string()),
    botKey: v.optional(v.string()),
    requestedBy: v.optional(v.string()),
  },
  handler: async (ctx, { token, botKey, requestedBy }) => {
    // Cho phép 2 đường: web (token chủ bot) hoặc bot (botKey) — lệnh /research learn.
    let isOwner = false;
    if (token) {
      const user = await getUserByToken(ctx, token);
      if (!user) throw new Error("Vui lòng đăng nhập");
      const status = await getBotStatus(ctx);
      if (!isBotAdminUser(user, status)) {
        throw new Error("Chỉ chủ bot hoặc quản trị viên nhóm mới được kích hoạt học thủ công 🔒");
      }
      isOwner = true;
    } else {
      await requireBotKeyStrict(ctx, botKey);
    }
    const status = await getBotStatus(ctx);
    if (!status) return { ok: false, error: "Bot chưa từng online — không thể kích hoạt" };
    if (status.threatManualLearnRequested) {
      return { ok: false, error: "Một lượt học thủ công đã được yêu cầu — bot đang xử lý" };
    }
    const lastManual = status.threatManualLearnAt ?? 0;
    if (Date.now() - lastManual < 2 * 60_000) {
      return { ok: false, error: "Vừa học xong — thử lại sau ít phút để tiết kiệm token" };
    }
    await ctx.db.patch(status._id, {
      threatManualLearnRequested: true,
      threatManualLearnBy: clean(requestedBy, 60) || (isOwner ? "web-admin" : "bot"),
      // Yêu cầu học mới = lần thử lại → xóa lỗi lượt trước (nếu có).
      threatResearchLastError: undefined,
      threatResearchLastErrorAt: undefined,
    });
    return { ok: true };
  },
});

/**
 * Bot — nhận + XÓA cờ học thủ công (gọi trong tick batch sẵn có).
 * Trả null khi không có yêu cầu → bot không tốn mutation thừa.
 */
export const botClaimManualLearn = mutation({
  args: { botKey: v.optional(v.string()) },
  handler: async (ctx, { botKey }) => {
    await requireBotKeyStrict(ctx, botKey);
    const status = await getBotStatus(ctx);
    if (!status?.threatManualLearnRequested) return null;
    await ctx.db.patch(status._id, {
      threatManualLearnRequested: false,
      threatManualLearnAt: Date.now(),
    });
    return { requestedBy: status.threatManualLearnBy ?? "admin" };
  },
});

/**
 * Bot — CỜ yêu cầu AI review từ khóa (đặt từ web Admin). Nhận + xóa cờ
 * (pattern botClaimManualLearn) — đi nhờ tick research 1h sẵn có.
 */
export const botClaimAiReview = mutation({
  args: { botKey: v.optional(v.string()) },
  handler: async (ctx, { botKey }) => {
    await requireBotKeyStrict(ctx, botKey);
    const status = await getBotStatus(ctx);
    if (!status?.threatAiReviewRequested) return null;
    await ctx.db.patch(status._id, { threatAiReviewRequested: false });
    return { ok: true };
  },
});

/**
 * Bot — lưu kết quả AI review từ khóa: danh sách từ khóa đáng ngờ
 * (từ khóa quá phổ biến có nguy cơ gây ban nhầm). ĐỀ XUẤT thôi — không tự xóa;
 * chủ bot xem trên Admin rồi quyết định xóa qua removeKeyword.
 */
export const botSetKeywordReview = mutation({
  args: {
    botKey: v.optional(v.string()),
    suspects: v.array(v.object({ keyword: v.string(), benignHits: v.number() })),
  },
  handler: async (ctx, { botKey, suspects }) => {
    await requireBotKeyStrict(ctx, botKey);
    const status = await getBotStatus(ctx);
    if (!status) return { ok: false };
    await ctx.db.patch(status._id, {
      threatKeywordReviewSuspects: suspects
        .slice(0, 15)
        .map((s) => ({
          keyword: clean(s.keyword, 80),
          benignHits: Math.max(0, Math.min(9999, s.benignHits | 0)),
        }))
        .filter((s) => s.keyword),
      threatKeywordReviewAt: Date.now(),
    });
    return { ok: true };
  },
});

/**
 * Bot — lưu digest tuần (AI tổng hợp xu hướng nguy cơ) + meta engine cục bộ
 * (số domain URLhaus đang nhớ, số cụm n-gram phát hiện được). 1 patch rẻ/lượt.
 */
export const botSetResearchMeta = mutation({
  args: {
    botKey: v.optional(v.string()),
    digest: v.optional(v.string()),
    urlhausDomains: v.optional(v.number()),
    ngramClusters: v.optional(v.number()),
    /** Lượt chạy thành công → xóa lỗi cũ (nếu có). */
    clearError: v.optional(v.boolean()),
  },
  handler: async (ctx, { botKey, digest, urlhausDomains, ngramClusters, clearError }) => {
    await requireBotKeyStrict(ctx, botKey);
    const status = await getBotStatus(ctx);
    if (!status) return { ok: false };
    const patch: Record<string, unknown> = {};
    if (digest) {
      patch.threatDigestLast = clean(digest, 700);
      patch.threatDigestLastAt = Date.now();
    }
    if (urlhausDomains !== undefined)
      patch.threatUrlhausDomains = Math.max(0, Math.min(50000, urlhausDomains | 0));
    if (ngramClusters !== undefined)
      patch.threatNgramClusters = Math.max(0, Math.min(5000, ngramClusters | 0));
    if (clearError) {
      patch.threatResearchLastError = undefined;
      patch.threatResearchLastErrorAt = undefined;
    }
    if (Object.keys(patch).length === 0) return { ok: false };
    await ctx.db.patch(status._id, patch);
    return { ok: true };
  },
});

/** Bot báo lỗi 1 lượt nghiên cứu/học (mạng, AI lỗi, nguồn chặn…) — Admin hiển thị thay vì im lặng. */
export const botReportResearchError = mutation({
  args: {
    botKey: v.optional(v.string()),
    error: v.string(),
    /** Lượt học thủ công (cờ đã claim) hay lượt tự động — chỉ để ghi chú. */
    trigger: v.optional(v.string()),
  },
  handler: async (ctx, { botKey, error, trigger }) => {
    await requireBotKeyStrict(ctx, botKey);
    const status = await getBotStatus(ctx);
    if (!status) return { ok: false };
    await ctx.db.patch(status._id, {
      threatResearchLastError:
        `${trigger ? `[${trigger}] ` : ""}${String(error || "Lỗi không xác định").slice(0, 260)}`.slice(
          0,
          300,
        ),
      threatResearchLastErrorAt: Date.now(),
    });
    return { ok: true };
  },
});
