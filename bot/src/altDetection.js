/**
 * Alt Account + VPN Detection Engine
 * ——————————————————————————————————
 * Phân tích tài khoản mới tham gia server:
 *  1. Tuổi tài khoản (Discord flags, creation date)
 *  2. Tương đồng username với account đã có trong server
 *  3. Pattern tài khoản tạo đại trà (username ngẫu nhiên, không avatar)
 *  4. VPN/Proxy detection (qua ip-api.com — free, 45 req/min)
 *  5. Behavioral correlation (join time proximity + shared signals)
 *  6. Cross-reference với danh sách đã ban trong server
 *
 * Inspired by Double Counter's approach:
 *  - IP fingerprinting (best-effort qua voice region khi có thể)
 *  - Account behavior analysis
 *  - Threshold-based risk scoring
 */

const https = require("https");
const http = require("http");
const { registerSweep } = require("./sweeper");

const DAY_MS = 86_400_000;

// ——— Utility: simple username similarity (Levenshtein-like) ———
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = Array(b.length + 1);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}

/**
 * Tính điểm tương đồng giữa 2 username (0-100).
 * Kết hợp Levenshtein distance + prefix/suffix matching.
 */
function usernameSimilarity(u1, u2) {
  const a = u1.toLowerCase().replace(/[^a-z0-9]/g, "");
  const b = u2.toLowerCase().replace(/[^a-z0-9]/g, "");
  // REQUIRE minimum 5 chars to avoid false positives on short/common names —
  // đặt TRƯỚC check trùng hoàn toàn: trước đây "mai"/"mai" (tên phổ biến 3-4
  // ký tự) vẫn trả 100 và scanGuildForAlts (không có guard riêng) ghép oan
  // 2 người lạ trùng tên ngắn.
  if (a.length < 5 || b.length < 5) return 0;
  if (a === b) return 100;
  if (!a || !b) return 0;

  // SKIP Discord default names like "User123456"
  if (/^user\d+$/i.test(a) || /^user\d+$/i.test(b)) return 0;

  const maxLen = Math.max(a.length, b.length);
  const dist = levenshtein(a, b);
  const baseScore = Math.round((1 - dist / maxLen) * 100);

  // Bonus: shared prefix — REDUCED from +3 to +1 per char
  let prefixBonus = 0;
  const prefixLen = Math.min(a.length, b.length);
  for (let i = 0; i < prefixLen && i < 6; i++) {
    if (a[i] === b[i]) prefixBonus += 1;
    else break;
  }

  // Number suffix match — only if BOTH have numbers AND core name is long enough
  const numSuffixA = a.match(/(\d+)$/);
  const numSuffixB = b.match(/(\d+)$/);
  if (numSuffixA && numSuffixB) {
    const coreA = a.slice(0, a.length - numSuffixA[1].length);
    const coreB = b.slice(0, b.length - numSuffixB[1].length);
    // Require core name to be 5+ chars AND same
    if (coreA === coreB && coreA.length >= 5) return Math.min(100, baseScore + prefixBonus + 10);
  }

  // Chống false positive tên thật kiểu VN: tiền tố dài ("nguyenvan", "phamthi")
  // cực phổ biến giữa người lạ. Quy tắc:
  //  - Tiền tố >= 6 ký tự → KHÔNG cộng prefix bonus (base score đã phản ánh độ
  //    giống; bonus là đếm trùng lặp).
  //  - Thêm nữa, nếu 2 tên chỉ chênh nhau 1-3 ký tự CUỐI ("nguyenvana" /
  //    "nguyenvanb", "phamthianh"/"phamthibinh") → hạ xuống 80: đủ theo dõi
  //    (+10) nhưng KHÔNG đủ thành bằng chứng mạnh (cần >= 85).
  //  - Riêng hậu tố SỐ ("linh12345"/"linh12346") vẫn giữ điểm cao — đó là
  //    pattern alt thật (tên + số tăng dần).
  const sharedPrefixLen = (() => {
    let n = 0;
    const cap = Math.min(a.length, b.length, 12);
    while (n < cap && a[n] === b[n]) n++;
    return n;
  })();
  const suffixA = a.slice(sharedPrefixLen);
  const suffixB = b.slice(sharedPrefixLen);
  // Ngưỡng 5: tên thật VN như "khanh", "thanh", "hoang" (5 ký tự) rất phổ biến
  // làm tiền tố trùng giữa người lạ ("khanhvy"/"khanhly").
  const longPrefix = sharedPrefixLen >= 5;
  if (longPrefix) {
    const shortSuffixDiff =
      suffixA.length > 0 && suffixA.length <= 3 && suffixB.length > 0 && suffixB.length <= 3;
    const bothDigitSuffix = /^\d+$/.test(suffixA) && /^\d+$/.test(suffixB);
    if (shortSuffixDiff && !bothDigitSuffix) {
      return Math.min(80, baseScore);
    }
    return Math.min(100, baseScore);
  }
  return Math.min(100, baseScore + prefixBonus);
}

// ——— Utility: detect generated/throwaway username patterns ———
function isGeneratedUsername(username) {
  const clean = username.toLowerCase().replace(/[^a-z0-9]/g, "");
  // Pattern 1: random letters + 4 digits (e.g., "xkqe8291")
  if (/^[a-z]{3,6}\d{3,6}$/.test(clean))
    return { generated: true, pattern: "random_letters+digits" };
  // Pattern 2: two words + numbers (e.g., "CoolFox1234")
  if (/^[a-z]{2,10}[a-z]{2,10}\d{2,6}$/.test(clean)) {
    // Check if the letters part looks random (high consonant ratio)
    const letters = clean.replace(/\d+$/, "");
    const vowels = letters.replace(/[^aeiou]/g, "").length;
    const vowelRatio = vowels / letters.length;
    // Very low vowel ratio often means random
    if (vowelRatio < 0.15 && letters.length >= 5) {
      return { generated: true, pattern: "low_vowel_ratio" };
    }
  }
  // Pattern 3: only digits (numeric-only username)
  if (/^\d{4,}$/.test(clean)) return { generated: true, pattern: "numeric_only" };
  // Pattern 4: 3 chars + 4 digits (e.g., "abc1234")
  if (/^[a-z]{3}\d{4,}$/.test(clean)) return { generated: true, pattern: "short_prefix+digits" };

  return { generated: false, pattern: null };
}

// ——— Utility: HTTP GET (for VPN check) ———
function httpGet(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { timeout: 5000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

// ——— VPN Detection ———
/**
 * Check if IP is VPN/Proxy via ip-api.com (free tier: 45 req/min).
 * Returns { isVPN, country, org, query }.
 */
async function checkVPN(ip) {
  if (!ip) return { isVPN: false, country: null, org: null };
  // ip-api.com không check VPN được ở free tier, dùng ipinfo
  // Nhưng tốt hơn là dùng proxycheck.io free (50 req/month)
  // Fallback: chỉ check basic signals
  try {
    const data = await httpGet(`http://ip-api.com/json/${ip}?fields=status,country,org,isp,proxy`);
    if (data?.status === "success") {
      return {
        isVPN: data.proxy === true,
        country: data.country || null,
        org: data.org || data.isp || null,
        query: data.query || null,
      };
    }
  } catch {}
  return { isVPN: false, country: null, org: null };
}

// ——— Core: Analyze a new member ———
/**
 * Phân tích tài khoản mới join và trả về risk analysis.
 *
 * @param {Object} member — Discord.js GuildMember
 * @param {Object} config — guild alt detection config
 * @param {Function} getConfig — store.getConfig(guildId)
 * @returns {{ riskScore, riskFactors, action, isVPN, ipCountry, ipOrg, linkedUserId, similarityScore }}
 */
async function analyzeNewMember(member, config, getConfig, store) {
  const factors = [];
  let riskScore = 0;
  let positiveScore = 0; // Positive signals REDUCE risk

  const ageDays = (Date.now() - member.user.createdTimestamp) / DAY_MS;
  const minAge = config?.altMinAgeDays ?? 7;

  // Lịch sử join từ Convex (khi có store) — bắt alt đã RỜI server (không còn
  // trong cache), alt từng bị phạt quay lại với account khác, và cluster chính
  // xác hơn. Cache chỉ thấy user còn ở lại — thiếu sót lớn của phiên bản cũ.
  let joinHistory = [];
  if (store?.client) {
    try {
      joinHistory = await store.client
        .query("altDetection:botGetJoinHistory", { guildId: member.guild.id, limit: 100 })
        .catch(() => []);
    } catch {
      joinHistory = [];
    }
  }

  // === POSITIVE SIGNALS (reduce risk) ===
  // Old account = trustworthy
  if (ageDays > 365) {
    positiveScore += 30;
    factors.push("✅ account_1yr+");
  } else if (ageDays > 180) {
    positiveScore += 20;
    factors.push("✅ account_6mo+");
  } else if (ageDays > 30) {
    positiveScore += 10;
    factors.push("✅ account_30d+");
  }
  // Has avatar = real person
  if (member.user.avatar) {
    positiveScore += 5;
  }
  // Has Discord badges = verified user
  const flags = member.user.flags?.bitfield ?? 0;
  if (flags & 128 || flags & 64 || flags & 32) {
    // HypeSquad
    positiveScore += 15;
    factors.push("✅ hypesquad_badge");
  }
  if (flags & 4) {
    // Verified bot developer
    positiveScore += 10;
    factors.push("✅ verified_dev_badge");
  }
  if (flags & 512) {
    // Early supporter
    positiveScore += 5;
    factors.push("✅ early_supporter");
  }
  // Has a normal-looking username (not generated)
  const usernameCheck = isGeneratedUsername(member.user.username);
  if (!usernameCheck.generated) {
    positiveScore += 5;
  }

  // === NEGATIVE SIGNALS (increase risk) ===

  // Layer 1: Account Age (only penalize VERY new accounts)
  if (ageDays < 1) {
    riskScore += 30;
    factors.push("❌ account_age_1day");
  } else if (ageDays < 3) {
    riskScore += 20;
    factors.push("❌ account_age_3days");
  } else if (ageDays < minAge) {
    riskScore += 10;
    factors.push(`❌ account_age_under_${minAge}d`);
  }

  // Layer 2: Avatar — REMOVED as penalty (too many false positives)
  // Only flag if MULTIPLE bad signals

  // Layer 3: Username Pattern (require longer match to reduce false positives)
  if (usernameCheck.generated) {
    // Only penalize if account is also NEW (< 30 days)
    if (ageDays < 30) {
      riskScore += 15;
      factors.push(`❌ generated_username_${usernameCheck.pattern}`);
    } else {
      riskScore += 5; // Older account with weird name = less suspicious
      factors.push(`⚠️ generated_username_${usernameCheck.pattern}_but_old`);
    }
  }

  // Layer 4: No flags — REMOVED as penalty (most users have no flags)

  // Layer 5: Bot flag
  if (member.user.bot) {
    riskScore += 5;
    factors.push("⚠️ is_bot_account");
  }

  // Layer 6: Username Similarity (require MINIMUM 5 char names to match)
  let maxSimilarity = 0;
  let linkedUserId = null;
  const threshold = config?.altSimilarityThreshold ?? 70;

  try {
    const guildMembers = member.guild.members.cache;
    for (const [, existingMember] of guildMembers) {
      if (existingMember.id === member.id) continue;
      if (existingMember.user.bot) continue;
      // SKIP short usernames (3-4 chars) to avoid false positives on common names
      if (member.user.username.length < 5 || existingMember.user.username.length < 5) continue;
      // SKIP common Discord default names like "User123456"
      if (
        /^user\d+$/i.test(member.user.username) ||
        /^user\d+$/i.test(existingMember.user.username)
      )
        continue;

      const sim = usernameSimilarity(member.user.username, existingMember.user.username);
      if (sim > maxSimilarity) {
        maxSimilarity = sim;
        linkedUserId = existingMember.id;
      }
      if (existingMember.nickname && existingMember.nickname.length >= 5) {
        const nickSim = usernameSimilarity(member.user.username, existingMember.nickname);
        if (nickSim > maxSimilarity) {
          maxSimilarity = nickSim;
          linkedUserId = existingMember.id;
        }
      }
    }
  } catch {}

  if (maxSimilarity >= threshold) {
    // Only penalize HIGH similarity (>= 85%) to reduce false positives
    if (maxSimilarity >= 85) {
      riskScore += 25;
      factors.push(`❌ username_similarity_${maxSimilarity}%`);
    } else {
      riskScore += 10;
      factors.push(`⚠️ username_similarity_${maxSimilarity}%`);
    }
  }

  // Layer 6b: Trùng với account TỪNG BỊ PHẠT (kick/ban/timeout/verify) — evasion
  // signal. User bị phạt rồi quay lại bằng account khác là dấu hiệu alt RẤT mạnh,
  // nhưng chỉ tính khi username/avatar khớp chặt (85%+) để tránh dính người lạ.
  let punishedMatch = false;
  const punishedRecords = joinHistory.filter((h) => h.userId !== member.id && h.action);
  if (punishedRecords.length > 0 && !punishedMatch) {
    for (const h of punishedRecords) {
      if (h.avatar && member.user.avatar && h.avatar === member.user.avatar) {
        punishedMatch = true;
        linkedUserId = h.userId;
        break;
      }
      if (h.username && member.user.username.length >= 5 && h.username.length >= 5) {
        const sim = usernameSimilarity(member.user.username, h.username);
        if (sim >= 85) {
          punishedMatch = true;
          linkedUserId = h.userId;
          break;
        }
      }
    }
    if (punishedMatch) {
      riskScore += 25;
      factors.push("❌ matches_previously_punished_account");
    }
  }

  // Layer 6c: Shared avatar với account TRẺ khác (< 30 ngày) — cùng file ảnh đại
  // diện là bằng chứng độc lập. Chỉ tính khi account kia CÒN MỚI để tránh dính
  // ảnh meme/ảnh phổ biến giữa người lạ (nguồn false positive lớn nhất của
  // avatar matching).
  let sharedAvatar = false;
  const myAvatar = member.user.avatar;
  if (myAvatar) {
    const nowMs = Date.now();
    for (const [, m] of member.guild.members.cache) {
      if (m.id === member.id || m.user.bot) continue;
      if (m.user.avatar === myAvatar) {
        const mAge = (nowMs - (m.user.createdTimestamp || 0)) / DAY_MS;
        if (mAge < 30) {
          sharedAvatar = true;
          linkedUserId = m.id;
          break;
        }
      }
    }
    if (!sharedAvatar) {
      for (const h of joinHistory) {
        if (h.userId === member.id || !h.avatar) continue;
        if (h.avatar === myAvatar) {
          const hAge = (nowMs - (h.createdAt || 0)) / DAY_MS;
          if (hAge < 30) {
            sharedAvatar = true;
            break;
          }
        }
      }
    }
    if (sharedAvatar) {
      riskScore += 20;
      factors.push("❌ shared_avatar_with_recent_account");
    }
  }

  // Layer 7: Join Burst / Cluster — đếm account MỚI (age < 30d, không avatar)
  // join trong cửa sổ. Nguồn dữ liệu: lịch sử join từ Convex (bao gồm user ĐÃ RỜI
  // server — cache không thấy), fallback về cache khi chưa có lịch sử.
  const joinWindowMs = (config?.altJoinWindowMinutes ?? 5) * 60 * 1000;
  const now = Date.now();
  let highRiskRecentJoins = 0;
  try {
    if (joinHistory.length > 0) {
      highRiskRecentJoins = joinHistory.filter((h) => {
        if (h.userId === member.id) return false;
        if (now - h.joinedAt > joinWindowMs) return false;
        const hAge = (now - (h.createdAt || 0)) / DAY_MS;
        // Giữ nguyên tiêu chí cũ (mới + không avatar) — chỉ mở rộng NGUỒN dữ liệu.
        return hAge < 30 && !h.avatar;
      }).length;
    } else {
      const recentMembers = member.guild.members.cache.filter((m) => {
        if (m.joinedTimestamp && now - m.joinedTimestamp < joinWindowMs && m.id !== member.id) {
          const mAge = (Date.now() - (m.user?.createdTimestamp ?? 0)) / DAY_MS;
          return mAge < 30 && !m.user?.avatar;
        }
        return false;
      });
      highRiskRecentJoins = recentMembers.size;
    }
    if (highRiskRecentJoins >= 5) {
      riskScore += 15;
      factors.push(`❌ high_risk_join_burst_${highRiskRecentJoins}+`);
    } else if (highRiskRecentJoins >= 3) {
      riskScore += 8;
      factors.push(`⚠️ high_risk_join_burst_${highRiskRecentJoins}`);
    }
  } catch {}

  // Layer 8: Cross-reference with banned users (require HIGH similarity)
  try {
    const bans = await member.guild.bans.fetch();
    for (const [, ban] of bans) {
      if (ban.user.username.length < 5) continue;
      const banUserSim = usernameSimilarity(member.user.username, ban.user.username);
      if (banUserSim >= 90) {
        // Require 90%+ match with banned users
        riskScore += 25;
        factors.push(`❌ matches_banned_user_${banUserSim}%`);
        break;
      }
    }
  } catch {}

  // Layer 9: Voice IP Linking — DISABLED (was causing false positives)
  // Previous code used region:channelId as a pseudo-IP which falsely linked
  // ALL users in the same voice channel. Discord does NOT expose real IPs.
  // Voice presence alone is NOT a reliable alt detection signal.

  // Layer 10: VPN — REMOVED behavioral heuristic (feedback loop)
  let isVPN = false;
  let ipCountry = null;
  let ipOrg = null;

  // === STRONG SIGNALS (bằng chứng độc lập) ===
  // Mỗi nhóm là một DẠNG bằng chứng khác nhau. Nhiều bằng chứng độc lập = độ
  // chắc chắn cao. Đây là lớp chống chặn nhầm quan trọng nhất: 1 tín hiệu đơn
  // lẻ (tên giống, tuổi trẻ, avatar trùng…) có thể là trùng hợp ngẫu nhiên,
  // còn 2+ tín hiệu độc lập cùng lúc thì gần như chắc chắn là alt.
  const strongSignals = [];
  if (ageDays < 3) strongSignals.push("age<3d");
  if (usernameCheck.generated && ageDays < 30) strongSignals.push("generated_name");
  if (maxSimilarity >= 85) strongSignals.push("name_sim_85+");
  if (sharedAvatar) strongSignals.push("shared_avatar");
  if (punishedMatch) strongSignals.push("punished_match");
  if (highRiskRecentJoins >= 3) strongSignals.push("join_cluster");
  if (member.user.bot) strongSignals.push("bot_account");

  // === FINAL SCORE CALCULATION ===
  // Apply positive score reduction (min 0)
  riskScore = Math.max(0, riskScore - positiveScore);
  riskScore = Math.min(100, riskScore);

  // === Determine Action (theo độ chắc chắn, không chỉ theo điểm số) ===
  const maxRisk = config?.altMaxRiskScore ?? 70;
  let action = "pass";
  if (riskScore >= maxRisk) {
    const punish = config?.altPunish || "kick";
    const safeMode = config?.altSafeMode !== false; // mặc định BẬT
    if (!safeMode) {
      // Chủ server tắt chế độ an toàn → hành vi cũ: phạt thẳng theo cấu hình.
      action = punish;
    } else if (strongSignals.length >= 2 || riskScore >= 95) {
      // >= 2 bằng chứng độc lập (hoặc điểm gần tuyệt đối) → chắc chắn → phạt đúng cấu hình.
      action = punish;
    } else if (strongSignals.length === 1) {
      // Chỉ 1 bằng chứng → HẠ CẤP 1 bậc để không phạt nặng nhầm:
      // ban → kick, kick → timeout. timeout/verify giữ nguyên (đã là phạt nhẹ).
      action = punish === "ban" ? "kick" : punish === "kick" ? "timeout" : punish;
    } else {
      // Điểm cao nhưng KHÔNG có bằng chứng độc lập nào (chỉ tín hiệu yếu cộng
      // dồn) → chỉ theo dõi, KHÔNG phạt — chống chặn nhầm người thật.
      factors.push("⚠️ monitor_only_insufficient_evidence");
      action = "pass";
    }
  }

  return {
    riskScore,
    riskFactors: factors,
    action,
    strongSignals,
    isVPN,
    ipCountry,
    ipOrg,
    linkedUserId: linkedUserId || undefined,
    similarityScore: maxSimilarity > 0 ? maxSimilarity : undefined,
  };
}

// ——— Execute Action ———
/**
 * Áp dụng hình phạt cho account vi phạm.
 * @returns {{ executed, action, reason }}
 */
async function executePunishment(member, analysis, config) {
  const { action: punish } = analysis;
  if (punish === "pass") return { executed: false, action: "pass", reason: "under threshold" };

  const reason = `[Protogon Alt Detection] Risk: ${analysis.riskScore}/100 — ${analysis.riskFactors.join(", ")}`;

  try {
    switch (punish) {
      case "ban":
        await member.ban({ reason, deleteMessageSeconds: 0 });
        return { executed: true, action: "ban", reason };

      case "kick":
        await member.kick(reason);
        return { executed: true, action: "kick", reason };

      case "timeout": {
        const minutes = config?.altTimeoutMinutes ?? 60;
        await member.timeout(minutes * 60 * 1000, reason);
        // Track để khi hết hạn tự nhiên có embed "⏱️ Timeout hết hạn" — nhất quán
        // với mọi timeout khác (manual + auto-mod). Gỡ sớm sẽ được forget.
        try {
          require("./timeoutWatch").track(
            member.guild.id,
            member.id,
            Date.now() + minutes * 60 * 1000,
          );
        } catch (e) {
          console.error(`[altDetect:timeoutTrack] ${member.guild.id}:`, e.message);
        }
        return { executed: true, action: "timeout", reason };
      }

      case "verify": {
        // Gán lại role unverified → buộc xác minh lại.
        // CHỈ dùng roles.add (KHÔNG dùng roles.set — roles.set XÓA SẠCH toàn bộ
        // role khác của member, phá hỏng role của thành viên hợp lệ bị nghi oan).
        // Chỉ ép xác minh khi hệ thống verify đã setup ĐẦY ĐỦ (bật + kênh + cả 2 role),
        // nếu không member sẽ bị kẹt không có cách xác minh.
        const unverifiedRoleId = config?.unverifiedRoleId;
        const verifyReady =
          config?.verifyEnabled &&
          unverifiedRoleId &&
          config?.verifiedRoleId &&
          config?.verifyChannelId;
        if (verifyReady) {
          await member.roles.add(unverifiedRoleId, "Alt detection — forced re-verify");
          return { executed: true, action: "verify", reason };
        }
        // Chưa setup verify đầy đủ → fallback to kick
        await member.kick(reason);
        return {
          executed: true,
          action: "kick",
          reason: reason + " (fallback: verify not fully set up)",
        };
      }

      default:
        return { executed: false, action: "pass", reason: "unknown punish" };
    }
  } catch (err) {
    console.error(`[altDetect:punish] ${member.guild.id}/${member.id}:`, err.message);
    return { executed: false, action: punish, reason: `failed: ${err.message}` };
  }
}

// ——— Generate risk report embed ———
function buildRiskEmbed(member, analysis, punishResult) {
  const { EmbedBuilder, Colors } = require("discord.js");
  const riskColor =
    analysis.riskScore >= 70
      ? Colors.Red
      : analysis.riskScore >= 40
        ? Colors.Orange
        : analysis.riskScore >= 20
          ? Colors.Yellow
          : Colors.Green;

  const embed = new EmbedBuilder()
    .setColor(riskColor)
    .setTitle(`🔍 Alt Detection: ${member.user.username}`)
    .setDescription(`Phân tích rủi ro cho <@${member.id}>`)
    .addFields([
      { name: "Điểm rủi ro", value: `**${analysis.riskScore}/100**`, inline: true },
      {
        name: "Hành động",
        value: punishResult?.executed ? `✅ ${punishResult.action}` : "✅ Pass",
        inline: true,
      },
      {
        name: "Tuổi tài khoản",
        value: `${Math.floor((Date.now() - member.user.createdTimestamp) / DAY_MS)} ngày`,
        inline: true,
      },
    ]);

  if (analysis.riskFactors.length > 0) {
    embed.addFields({
      name: "Yếu tố rủi ro",
      value: analysis.riskFactors
        .map((f) => `• ${f}`)
        .join("\n")
        .slice(0, 1024),
    });
  }

  if (analysis.linkedUserId) {
    embed.addFields({
      name: "🔗 Linked Account",
      value: `Tương đồng với <@${analysis.linkedUserId}> (${analysis.similarityScore}%)`,
    });
  }

  if (analysis.isVPN) {
    embed.addFields({ name: "🌐 VPN/Proxy", value: "Được phát hiện (behavioral)" });
  }

  embed.setFooter({ text: "Protogon Alt Detection" }).setTimestamp();
  return embed;
}

// ============================================================
// UPGRADE A: Voice IP Fingerprinting
// ============================================================
// Map<guildId, Map<userId, { ip, country, joinedAt }>>
const voiceIpMap = new Map();
// Map<guildId, Map<ip, Set<userId>>> — reverse lookup: IP -> users
const ipToUsers = new Map();

/**
 * Track voice IP when a user joins a voice channel.
 * Discord reveals the user's IP when they connect to voice.
 * We use this to link accounts sharing the same IP.
 */
function trackVoiceIp(guildId, userId, ip, country) {
  if (!ip || !guildId || !userId) return;
  // Normalize IP
  const normalizedIp = ip.trim();
  if (!normalizedIp) return;

  if (!voiceIpMap.has(guildId)) voiceIpMap.set(guildId, new Map());
  if (!ipToUsers.has(guildId)) ipToUsers.set(guildId, new Map());

  const guildUsers = voiceIpMap.get(guildId);
  const guildIps = ipToUsers.get(guildId);

  // Remove old IP mapping if exists
  const oldData = guildUsers.get(userId);
  if (oldData && oldData.ip !== normalizedIp) {
    const oldSet = guildIps.get(oldData.ip);
    if (oldSet) {
      oldSet.delete(userId);
      if (oldSet.size === 0) guildIps.delete(oldData.ip);
    }
  }

  // Set new mapping
  guildUsers.set(userId, { ip: normalizedIp, country, joinedAt: Date.now() });
  if (!guildIps.has(normalizedIp)) guildIps.set(normalizedIp, new Set());
  guildIps.get(normalizedIp).add(userId);
}

/**
 * Get all user IDs sharing the same IP as the given user.
 * Returns [{ userId, sharedIp }] or empty array.
 */
function getIpLinkedAccounts(guildId, userId) {
  const guildUsers = voiceIpMap.get(guildId);
  if (!guildUsers) return [];
  const userData = guildUsers.get(userId);
  if (!userData) return [];

  const guildIps = ipToUsers.get(guildId);
  if (!guildIps) return [];
  const sameIpUsers = guildIps.get(userData.ip);
  if (!sameIpUsers) return [];

  return Array.from(sameIpUsers)
    .filter((id) => id !== userId)
    .map((id) => ({ userId: id, sharedIp: userData.ip }));
}

/**
 * Get all known IPs for a guild (for stats).
 */
function getGuildVoiceIps(guildId) {
  const guildIps = ipToUsers.get(guildId);
  if (!guildIps) return [];
  const result = [];
  for (const [ip, users] of guildIps) {
    result.push({ ip, userCount: users.size, userIds: Array.from(users) });
  }
  return result;
}

/**
 * Get IP data for a specific user.
 */
function getUserVoiceIp(guildId, userId) {
  const guildUsers = voiceIpMap.get(guildId);
  if (!guildUsers) return null;
  return guildUsers.get(userId) ?? null;
}

// ============================================================
// UPGRADE D: Burst Detection + Auto-Lockdown
// ============================================================
// Map<guildId, { joins: [{ userId, riskScore, joinedAt }], lastAlertAt }>
const burstTracker = new Map();

/**
 * Track a join for burst detection. Returns { burstDetected, count, avgRisk }.
 */
function trackJoinForBurst(guildId, userId, riskScore) {
  if (!burstTracker.has(guildId)) {
    burstTracker.set(guildId, { joins: [], lastAlertAt: 0 });
  }
  const tracker = burstTracker.get(guildId);
  const now = Date.now();
  const BURST_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
  const BURST_MIN_COUNT = 5;
  const BURST_MIN_AVG_RISK = 40;
  const ALERT_COOLDOWN_MS = 15 * 60 * 1000; // 15 min cooldown between alerts

  // Add this join
  tracker.joins.push({ userId, riskScore, joinedAt: now });

  // Trim old joins outside window
  tracker.joins = tracker.joins.filter((j) => now - j.joinedAt < BURST_WINDOW_MS);

  // Check burst
  const count = tracker.joins.length;
  const avgRisk = count > 0 ? tracker.joins.reduce((a, j) => a + j.riskScore, 0) / count : 0;

  if (
    count >= BURST_MIN_COUNT &&
    avgRisk >= BURST_MIN_AVG_RISK &&
    now - tracker.lastAlertAt > ALERT_COOLDOWN_MS
  ) {
    tracker.lastAlertAt = now;
    return {
      burstDetected: true,
      count,
      avgRisk: Math.round(avgRisk),
      userIds: tracker.joins.map((j) => j.userId),
    };
  }

  return { burstDetected: false, count, avgRisk: Math.round(avgRisk) };
}

// ============================================================
// UPGRADE C: Auto-scan Existing Members
// ============================================================

/**
 * Scan all cached members in a guild for potential alt links.
 * Returns [{ userId1, userId2, similarity, reason }].
 */
/**
 * So sánh 1 cặp thành viên, đẩy các cặp khớp vào `results`.
 * Tách riêng để bản đồ bộ (sync) và bản lùi (async) dùng CHUNG một quy tắc —
 * hai bản lệch nhau là bản "cho bot chạy nhanh" âm thầm bỏ sót cặp alt.
 */
function compareAltPair(a, b, threshold, results) {
  // Check username similarity
  const sim = usernameSimilarity(a.user.username, b.user.username);
  if (sim >= threshold) {
    results.push({
      userId1: a.id,
      userId2: b.id,
      username1: a.user.username,
      username2: b.user.username,
      similarity: sim,
      reason: `username_similarity_${sim}%`,
    });
  }

  // Check display name similarity
  if (a.nickname && b.nickname) {
    const nickSim = usernameSimilarity(a.nickname, b.nickname);
    if (nickSim >= threshold && nickSim > sim) {
      results.push({
        userId1: a.id,
        userId2: b.id,
        username1: a.nickname,
        username2: b.nickname,
        similarity: nickSim,
        reason: `displayname_similarity_${nickSim}%`,
      });
    }
  }

  // Check cross username-displayname
  if (a.nickname) {
    const crossSim = usernameSimilarity(a.nickname, b.user.username);
    if (crossSim >= threshold) {
      results.push({
        userId1: a.id,
        userId2: b.id,
        username1: a.nickname,
        username2: b.user.username,
        similarity: crossSim,
        reason: `cross_name_similarity_${crossSim}%`,
      });
    }
  }
  if (b.nickname) {
    const crossSim = usernameSimilarity(a.user.username, b.nickname);
    if (crossSim >= threshold) {
      results.push({
        userId1: a.id,
        userId2: b.id,
        username1: a.user.username,
        username2: b.nickname,
        similarity: crossSim,
        reason: `cross_name_similarity_${crossSim}%`,
      });
    }
  }
}

/** Gộp link voice-IP, khử trùng lặp, sắp xếp theo độ tương đồng giảm dần. */
function finalizeAltLinks(results, members, guild) {
  // Also check IP-linked accounts
  for (const member of members) {
    const ipLinks = getIpLinkedAccounts(guild.id, member.id);
    for (const link of ipLinks) {
      // Avoid duplicates
      const alreadyFound = results.some(
        (r) =>
          (r.userId1 === member.id && r.userId2 === link.userId) ||
          (r.userId1 === link.userId && r.userId2 === member.id),
      );
      if (!alreadyFound) {
        results.push({
          userId1: member.id,
          userId2: link.userId,
          username1: member.user.username,
          username2: "(voice IP)",
          similarity: 100,
          reason: `shared_voice_ip`,
        });
      }
    }
  }

  // Deduplicate and sort by similarity
  const seen = new Set();
  const unique = [];
  for (const r of results) {
    const key = [r.userId1, r.userId2].sort().join(":");
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(r);
    }
  }
  return unique.sort((a, b) => b.similarity - a.similarity);
}

function scanGuildForAlts(guild, config) {
  const results = [];
  const threshold = config?.altSimilarityThreshold ?? 70;
  const members = Array.from(guild.members.cache.values()).filter((m) => !m.user.bot);
  // Compare each pair (O(n^2) — xem scanGuildForAltsAsync cho bản không chặn bot)
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      compareAltPair(members[i], members[j], threshold, results);
    }
  }
  return finalizeAltLinks(results, members, guild);
}

/**
 * TRẦN quét mỗi lượt. Đo thật (tên khác nhau ngẫu nhiên, 3 lần so khớp/cặp):
 * 1000 thành viên ~1,0s · 2000 ~4,5s · 3000 ~12,9s · 5000 ~36s — và đó là
 * thời gian bot ĐỨNG HÌNH, không nhận message, không phản ứng anti-nuke.
 */
const ALT_SCAN_MAX_MEMBERS = 2000;
/** Deadline mỗi guild — trên VPS yếu hơn máy đo thì cap này mới là chốt chặn. */
const ALT_SCAN_DEADLINE_MS = 20_000;
/** Số cặp xử lý giữa 2 lần nhường event loop. */
const ALT_SCAN_CHUNK = 2000;

/**
 * Quét alt MÀ KHÔNG CHẶN BOT: nhường event loop định kỳ, chặn trần quy mô và
 * deadline. Bản sync `scanGuildForAlts` chạy tuần tự trong vòng lặp mọi guild
 * mỗi 6 giờ — vài guild vài nghìn thành viên là bot đứng hình hàng chục giây,
 * tức đúng lúc có raid thì anti-nuke cũng không chạy.
 *
 * Trả `{ links, scanned, truncated, total, hitDeadline }` để gọi rõ với người
 * đọc log, không âm thầm bỏ sót cặp.
 */
async function scanGuildForAltsAsync(
  guild,
  config,
  { maxMembers = ALT_SCAN_MAX_MEMBERS, deadlineMs = ALT_SCAN_DEADLINE_MS } = {},
) {
  const threshold = config?.altSimilarityThreshold ?? 70;
  const all = Array.from(guild.members.cache.values()).filter((m) => !m.user.bot);
  const total = all.length;
  const members = total > maxMembers ? all.slice(0, maxMembers) : all;
  const results = [];
  const deadline = Date.now() + deadlineMs;
  let hitDeadline = false;
  let sinceYield = 0;
  // Số thành viên đã quét trọn — khai báo ngoài vòng lặp để `return` báo cáo
  // được con số thật khi chạm deadline (dừng giữa chừng).
  let i = 0;

  for (; i < members.length && !hitDeadline; i++) {
    for (let j = i + 1; j < members.length; j++) {
      compareAltPair(members[i], members[j], threshold, results);
      // Nhường event loop: tin nhắn/gateway vẫn xử lý được giữa lúc quét.
      if (++sinceYield >= ALT_SCAN_CHUNK) {
        sinceYield = 0;
        await new Promise((r) => setImmediate(r));
        if (Date.now() > deadline) {
          hitDeadline = true;
          break;
        }
      }
    }
  }
  return {
    links: finalizeAltLinks(results, members, guild),
    // Số thành viên THỰC SỰ đã quét. Trước đây dòng này là
    // `hitDeadline ? members.length : members.length` — hai nhánh giống hệt,
    // nên khi chạm deadline bot vẫn log "quét 2000/2000" dù chỉ mới đi tới
    // thành viên thứ 400. Chủ server đọc log tưởng đã quét trọn server và
    // không biết cặp nào còn bị bỏ sót (điều mà cả comment bên trên hứa là
    // không im lặng bỏ sót). `i` là chỉ số thành viên đang xét lúc vòng lặp
    // dừng → đã quét trọn các thành viên 0..i-1.
    scanned: hitDeadline ? i : members.length,
    total,
    truncated: total > maxMembers || hitDeadline,
    hitDeadline,
  };
}

// Dọn dữ liệu voice cũ (mốc 24h) mỗi giờ — qua vòng sweep CHUNG (đợt #4),
// không tự dựng timer nữa.
const VOICE_DATA_TTL_MS = 24 * 60 * 60 * 1000;

function sweepVoiceIpMap(now = Date.now()) {
  const cutoff = now - VOICE_DATA_TTL_MS;
  let removed = 0;
  for (const [guildId, users] of voiceIpMap) {
    for (const [userId, data] of users) {
      if (data.joinedAt < cutoff) {
        users.delete(userId);
        removed += 1;
        const guildIps = ipToUsers.get(guildId);
        if (guildIps) {
          const set = guildIps.get(data.ip);
          if (set) {
            set.delete(userId);
            if (set.size === 0) guildIps.delete(data.ip);
          }
        }
      }
    }
    if (users.size === 0) voiceIpMap.delete(guildId);
  }
  return removed;
}
registerSweep("altDetection", () => sweepVoiceIpMap(), 60 * 60_000);

/**
 * Dọn dữ liệu của guild bot đã rời (memGuard gọi định kỳ): burstTracker giữ
 * { joins: [...] } mãi cho guild đã kick bot; voiceIpMap/ipToUsers của guild
 * rời chỉ được dọn theo TUỔI dữ liệu (24h) chứ không theo guild.
 * liveGuildIds là Set discordId hiện tại của client — truyền từ index.js.
 * Trả về số Map con đã dọn.
 */
function sweepStaleGuilds(liveGuildIds) {
  let removed = 0;
  for (const guildId of burstTracker.keys()) {
    if (!liveGuildIds.has(guildId)) {
      burstTracker.delete(guildId);
      removed++;
    }
  }
  for (const guildId of [...voiceIpMap.keys()]) {
    if (!liveGuildIds.has(guildId)) {
      voiceIpMap.delete(guildId);
      ipToUsers.delete(guildId);
      removed++;
    }
  }
  return removed;
}

module.exports = {
  analyzeNewMember,
  executePunishment,
  buildRiskEmbed,
  usernameSimilarity,
  isGeneratedUsername,
  checkVPN,
  // Upgrade A: Voice IP
  trackVoiceIp,
  getIpLinkedAccounts,
  getGuildVoiceIps,
  getUserVoiceIp,
  // Upgrade D: Burst Detection
  trackJoinForBurst,
  // Upgrade C: Auto-scan
  scanGuildForAlts,
  scanGuildForAltsAsync,
  // Đợt 7: dọn guild đã rời (memGuard)
  sweepStaleGuilds,
  // Đợt #4: dọn dữ liệu voice cũ (qua vòng sweep chung)
  sweepVoiceIpMap,
  VOICE_DATA_TTL_MS,
};
