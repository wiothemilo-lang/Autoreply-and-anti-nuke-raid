const { ConvexHttpClient } = require("convex/browser");
const metrics = require("./metrics");

// TTL mặc định 300s (tăng từ 180s): cấu hình hiếm khi đổi — giảm số query
// getConfig thêm ~40% so với TTL 180s và ~10 lần so với TTL 30s ban đầu.
// Riêng guild có "cờ chờ xử lý" (lockdownRequested, heatResetRequested, DM chờ,
// verify panel) dùng TTL ngắn 30s để nút bấm trên dashboard có tác dụng nhanh.
// Ngoài ra getConfig(guildId, { force: true }) luôn đọc mới — dùng cho các chỗ
// cần kết quả tức thì (mở khóa kênh, xóa nhiệt, gửi panel, backup ngay).
// TỐI ƯU I/O: 600s (trước 300s) — getBotConfig đọc guild row + modules +
// autoreplies + giveaways mỗi lần miss cache; guild có cờ chờ vẫn cache ngắn 30s
// nên thao tác dashboard không chậm. Giảm 50% reads nhóm này.
const CONFIG_TTL_MS = 1_800_000; // D1: 30 phút — preload + TTL dài cắt ~2/3 reads getConfig
const CONFIG_TTL_PENDING_MS = 30_000;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 500;

/** Đường dẫn file cache botKey (nội bộ bootstrap + xoay key). */
function botKeyFilePath() {
  const path = require("path");
  return path.join(process.cwd(), ".bot-key");
}

/**
 * Lỗi có PHẢI là Convex từ chối botKey không? Nhận diện theo thông điệp thật
 * từ convex/botAuth.ts ("Chìa khóa bot không hợp lệ (botKey)" / "Chìa khóa bot
 * chưa được cấp phát") — so khớp thông điệp vì Convex trả Server Error 500
 * (không có mã lỗi riêng cho auth), và thông điệp tiếng Việt đặc thù đủ khó
 * trùng với lỗi khác. KHÔNG khớp lỗi mạng/validator khác → không xoay oan.
 */
function isBotKeyRejection(err) {
  const msg = String(err?.message ?? err ?? "");
  return (
    msg.includes("Chìa khóa bot không hợp lệ") || msg.includes("Chìa khóa bot chưa được cấp phát")
  );
}

/**
 * Wraps a Convex HTTP call with retry + exponential backoff.
 * Transient network errors and 5xx are retried; 4xx (except 429) fail immediately.
 *
 * ĐÂY LÀ CHỖ DUY NHẤT mọi lời gọi Convex của bot đi qua — nên đo ở đây là rẻ
 * nhất và đầy đủ nhất: một số đo bao phủ lời gọi nào chậm, lời gọi nào hỏng,
 * lời gọi nào phải retry (tín hiệu sớm của Convex bắt đầu chậm) mà không phải
 * sửa từng chỗ gọi. `outcome="retry"` đếm riêng từng lần thử lại — tách khỏi
 * ok/error để "chậm nhưng không hỏng" không bị chôn vào nhóm lỗi.
 */
async function withRetry(fn, label) {
  const started = process.hrtime.bigint();
  try {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const out = await fn();
        metrics.count("convex", label, metrics.OUTCOME_OK);
        return out;
      } catch (err) {
        const status = err?.statusCode ?? err?.status;
        const isRetryable =
          !status ||
          status >= 500 ||
          status === 429 ||
          err?.code === "ECONNRESET" ||
          err?.code === "ETIMEDOUT";
        if (attempt === MAX_RETRIES || !isRetryable) {
          console.error(
            `[convex:${label}] attempt ${attempt}/${MAX_RETRIES} failed:`,
            err?.message || err,
          );
          metrics.count("convex", label, metrics.OUTCOME_ERROR);
          throw err;
        }
        metrics.count("convex", label, "retry");
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 200;
        console.warn(
          `[convex:${label}] attempt ${attempt} failed, retrying in ${Math.round(delay)}ms...`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  } finally {
    metrics.observeDuration("convex", label, Number(process.hrtime.bigint() - started) / 1e9);
  }
}

/**
 * Mutation bot TỰ ghi cấu hình mà chính bot đọc lại qua `guilds:getBotConfig`
 * (bundle cache TTL 30 phút). Ghi xong là bản cache cục bộ SAI ngay — bot phải
 * xoá để lượt đọc sau thấy giá trị mới.
 *
 * Vì sao tập trung ở đây thay vì gọi store.invalidate() ở từng chỗ gọi: thực tế
 * đã đo được 7/35 chỗ gọi quên, gây bug thật (23/09/2026) — server bị khoá kênh
 * LÂU HƠN cấu hình vì tickUnlocks đọc `lockdownUntil` cũ, mở khoá xong bot tưởng
 * còn đang khoá nên bỏ qua raid sau, báo cáo ngày gửi lặp, và restore xong vẫn
 * chạy cấu hình cũ tới 30 phút. Proxy bên dưới bắt MỌI lượt ghi (kể cả chỗ gọi
 * thêm sau này) nên không thể quên lần nữa.
 *
 * Danh sách này phải khớp CHÍNH XÁC tập mutation ghi field bot đọc trong
 * convex/bot_writes.ts — `scripts/check-settings-signal.cjs` đối chiếu 2 chiều
 * (lệch là CI đỏ), nên thêm mutation cấu hình mới mà quên đây sẽ bị chặn.
 */
const CONFIG_WRITE_MUTATIONS = new Set([
  "bot_writes:botUpdateSettings",
  "bot_writes:botModuleUpdate",
  "bot_writes:botUpdateLockdown",
  "bot_writes:botLockState",
  "bot_writes:botClearHeatReset",
  "bot_writes:botSetReportAt",
  "bot_writes:botSetAntinuke",
  "bot_writes:botSetAutoBackup",
  "bot_writes:botRestoreSettings",
]);

/**
 * Xoá cache config sau khi bot tự ghi cấu hình. Tổng (không bao giờ ném): lỗi ở
 * bước dọn cache không được biến một mutation THÀNH CÔNG thành lỗi.
 */
function invalidateAfterConfigWrite(store, prop, fnName, payload) {
  try {
    if (prop !== "mutation" || !CONFIG_WRITE_MUTATIONS.has(fnName)) return;
    const guildId = payload && payload.guildId;
    if (guildId) store.invalidate(String(guildId));
  } catch (e) {
    console.error(`[convex] không xoá được cache config sau ${fnName}:`, e?.message || e);
  }
}

class ConvexStore {
  constructor() {
    const url = process.env.CONVEX_URL;
    if (!url) {
      throw new Error(
        "❌ CONVEX_URL không được để trống. " +
          "Kiểm tra file .env ở thư mục bot hoặc biến môi trường trên VPS.",
      );
    }
    this.client = new ConvexHttpClient(url);
    if (process.env.CONVEX_DEPLOY_KEY) {
      this.client.setAdminAuth(process.env.CONVEX_DEPLOY_KEY);
    }
    this.cache = new Map(); // guildId -> { config, fetchedAt }
    // Thế hệ cache theo guild: tăng mỗi lần invalidate(). Fetch đang bay mà bị
    // invalidate giữa chừng (bot vừa tự ghi cấu hình) thì kết quả CŨ không được
    // ghi đè cache — nếu không, cấu hình trước khi ghi bị giữ tới 30 phút.
    this._cacheGen = new Map(); // guildId -> số thế hệ
    this.ruleCooldowns = new Map(); // `${guildId}:${ruleId}` -> timestamp
    this._startedAt = Date.now();
    this._lastHeartbeat = 0;
    this._heartbeatOk = false;

    // Bảo mật: tự động chèn botKey vào MỌI query/mutation/action — Convex phía
    // server kiểm tra SHA-256(botKey) khớp botKeySeed (đặt qua Admin web). Kẻ
    // ngoài không có BOT_KEY thì không gọi được các function bot-side. Proxy
    // phải bọc cả `action` (vd backup_github:githubPush) — nếu không, các call
    // action của bot sẽ vỡ khi BOT_KEY đã cấu hình.
    // Ngoài ra proxy CHỜ ensureBotKey() trước mỗi call: bot thiếu BOT_KEY tự
    // bootstrap (xác minh Discord token) rồi mọi call tiếp theo có key — không
    // bị rơi vào trạng thái "call không key bị từ chối".
    const self = this;
    this._rawClient = this.client; // client thô — dùng bên trong bootstrap (tránh đệ quy proxy)
    this.client = new Proxy(this.client, {
      get(target, prop) {
        if (prop !== "query" && prop !== "mutation" && prop !== "action") return target[prop];
        return async function (fnName, args) {
          await self.ensureBotKey();
          const payload = args && typeof args === "object" ? { ...args } : {};
          if (self.botKey && payload.botKey === undefined) {
            payload.botKey = self.botKey;
          }
          try {
            const result = await target[prop](fnName, payload);
            // Bot vừa ghi cấu hình → cache cục bộ của guild này sai ngay.
            invalidateAfterConfigWrite(self, prop, fnName, payload);
            return result;
          } catch (e) {
            // Key cache LỆCH (server đã xoay seed / key cũ hết hạn): Convex từ
            // chối → tự xoay key (bỏ cache + bootstrap lại) rồi retry ĐÚNG call
            // đó 1 lần. Sự cố thật 20/09/2026: bot kẹt vĩnh viễn với key stale,
            // phải nhờ người xóa tay .bot-key + restart. Chỉ xoay khi lỗi THẬT
            // là từ chối botKey (không nhầm với lỗi mạng) và chỉ retry 1 lần.
            if (isBotKeyRejection(e)) {
              await self.rotateBotKey();
              const retry = { ...payload, botKey: self.botKey };
              const retried = await target[prop](fnName, retry);
              invalidateAfterConfigWrite(self, prop, fnName, payload);
              return retried;
            }
            throw e;
          }
        };
      },
    });

    // Tính botKey từ BOT_KEY trong .env (SHA-256 hex) — protocol khớp convex/botAuth.ts.
    if (process.env.BOT_KEY) {
      this.botKey = process.env.BOT_KEY.trim();
    }
  }

  /**
   * TỰ CẤP PHÁT CHÌA KHÓA (bootstrap): khi BOT_KEY chưa cấu hình, bot gọi action
   * `botBootstrapAction:requestBotKey` với DISCORD_TOKEN — Convex xác minh token
   * qua Discord API rồi cấp botKey random (server chỉ lưu BĂM). Kẻ ngoài không
   * có token bot → không cấp được key → không gọi được các function bot-side.
   * Key được cache ở file (700) để restart không phải bootstrap lại (cooldown 10 phút).
   * Đặt BOT_KEY trong .env vẫn được ưu tiên (key tĩnh chủ động quản lý).
   */
  async ensureBotKey() {
    if (this.botKey) return this.botKey;
    if (this._botKeyPromise) return this._botKeyPromise;
    this._botKeyPromise = (async () => {
      try {
        const fs = require("fs");
        const keyFile = botKeyFilePath();
        if (fs.existsSync(keyFile)) {
          const cached = fs.readFileSync(keyFile, "utf8").trim();
          if (/^[0-9a-f]{64}$/.test(cached)) {
            this.botKey = cached;
            console.log("[auth] Đã nạp botKey từ cache .bot-key");
            return this.botKey;
          }
        }
        const token = process.env.DISCORD_TOKEN;
        if (!token) throw new Error("Thiếu DISCORD_TOKEN để bootstrap");
        // Dùng RAW client — proxy sẽ chờ _botKeyPromise (chính promise này) → deadlock nếu đi qua proxy.
        const res = await this._rawClient.action("botBootstrapAction:requestBotKey", {
          botToken: token,
        });
        if (res && res.ok && res.botKey) {
          this.botKey = res.botKey;
          try {
            fs.writeFileSync(keyFile, this.botKey + "\n", { mode: 0o600 });
          } catch {}
          console.log("[auth] ✅ Đã tự cấp phát botKey (bootstrap) — lưu cache .bot-key");
          return this.botKey;
        }
        throw new Error(res?.error || "bootstrap từ chối");
      } catch (e) {
        console.error("[auth] Bootstrap botKey thất bại:", e?.message || e);
        console.error(
          "[auth] → Các function bảo mật cao (backup, sync…) sẽ bị từ chối cho tới khi bootstrap thành công.",
        );
        console.error("[auth] → Kiểm tra DISCORD_TOKEN/CONVEX_URL rồi khởi động lại bot.");
        return null;
      } finally {
        // Cho phép thử lại sau 5 phút nếu thất bại.
        setTimeout(() => {
          this._botKeyPromise = null;
        }, 5 * 60_000).unref?.();
      }
    })();
    return this._botKeyPromise;
  }

  /**
   * XOAY KEY KHI BỊ TỪ CHỐI: key cache hiện tại lệch seed phía server (server
   * đã xoay seed / key cũ hết hạn). Bỏ key bộ nhớ + xóa file cache rồi bootstrap
   * CẤP PHÁT LẠI key mới qua Discord token. Không ném — xoay lỗi thì call gọi
   * xoay nhận lỗi gốc từ Convex (retry bằng key null bị server từ chối như cũ).
   */
  async rotateBotKey() {
    if (this._rotating) {
      await this._rotating.catch(() => {});
      return;
    }
    this._rotating = (async () => {
      try {
        const fs = require("fs");
        this.botKey = undefined;
        try {
          fs.rmSync(botKeyFilePath(), { force: true });
        } catch {}
        // Reset promise bootstrap để ensureBotKey chạy lại từ đầu (không trả
        // promise cũ đã cache key stale).
        this._botKeyPromise = null;
        await this.ensureBotKey();
        console.log("[auth] 🔄 Đã xoay botKey sau khi bị Convex từ chối (key cache lệch)");
      } finally {
        this._rotating = null;
      }
    })();
    await this._rotating.catch(() => {});
  }

  /**
   * D1 — Preload config cho danh sách guild (gọi lúc bot online): làm ấm cache
   * TRƯỚC khi có sự kiện → antinuke/lockdown phản hồi không chờ mạng. Mỗi guild
   * đúng 1 query, lỗi 1 guild không ảnh hưởng guild khác.
   */
  async prewarmConfigs(guildIds) {
    const ids = [...new Set(guildIds)].filter(Boolean);
    const results = await Promise.allSettled(ids.map((id) => this.getConfig(id)));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    if (ids.length) console.log(`[convex] prewarm config: ${ok}/${ids.length} guild`);
    return ok;
  }

  /**
   * Fetch the config bundle for a guild, with TTL cache + retry.
   * opts.force: luôn đọc mới (bỏ qua cache) — cho các thao tác cần tức thì.
   * Guild có cờ chờ xử lý được tự động cache ngắn (30s).
   */
  async getConfig(guildId, opts = {}) {
    const hit = this.cache.get(guildId);
    if (!opts.force && hit) {
      const now = Date.now();
      const hasPending =
        hit.config?.lockdownRequested ||
        hit.config?.heatResetRequested ||
        hit.config?.dmRequested ||
        hit.config?.verifySendPanel ||
        hit.config?.ticketSendPanel ||
        // Đang trong cửa sổ khóa kênh: cần thấy cờ "Mở khóa" từ dashboard nhanh.
        (typeof hit.config?.lockdownUntil === "number" && hit.config.lockdownUntil > now);
      const ttl = hasPending ? CONFIG_TTL_PENDING_MS : CONFIG_TTL_MS;
      if (now - hit.fetchedAt < ttl) return hit.config;
    }
    const gen = this._cacheGen.get(guildId) ?? 0;
    try {
      const config = await withRetry(
        () => this.client.query("guilds:getBotConfig", { guildId }),
        `getConfig:${guildId}`,
      );
      // Chỉ ghi cache nếu không có lượt invalidate nào xen vào trong lúc fetch.
      if ((this._cacheGen.get(guildId) ?? 0) === gen) {
        this.cache.set(guildId, { config, fetchedAt: Date.now() });
      }
      return config;
    } catch (err) {
      console.error(`[convex] getConfig(${guildId}) failed after retries:`, err?.message);
      // Return cached version if available (even if stale)
      if (hit) return hit.config;
      throw err;
    }
  }

  /** Invalidate the cache after the bot itself writes config. */
  invalidate(guildId) {
    this._cacheGen.set(guildId, (this._cacheGen.get(guildId) ?? 0) + 1);
    this.cache.delete(guildId);
  }

  /**
   * Dọn cache config của guild đã rời (memGuard gọi định kỳ — Đợt 7). Guild rời
   * thì không bao giờ getConfig nữa nhưng cache vẫn giữ config cũ mãi. Trả về
   * số entry đã dọn.
   */
  pruneCache(liveGuildIds) {
    let removed = 0;
    for (const guildId of [...this.cache.keys()]) {
      if (!liveGuildIds.has(guildId)) {
        this.cache.delete(guildId);
        this._cacheGen.delete(guildId);
        removed++;
      }
    }
    return removed;
  }

  /** Send health check heartbeat to Convex. */
  async sendHeartbeat(guildCount, memberCount) {
    try {
      await withRetry(
        () =>
          this.client.mutation("status:heartbeat", {
            online: true,
            guildCount,
            memberCount,
            version: "3.0.0",
          }),
        "heartbeat",
      );
      this._lastHeartbeat = Date.now();
      this._heartbeatOk = true;
    } catch (err) {
      this._heartbeatOk = false;
      console.error("[health] heartbeat failed:", err?.message);
    }
  }

  /**
   * Đẩy số đo đo lường lên Convex để dashboard đọc (bot/src/metrics.js).
   *
   * Cố ý NUỐT lỗi và chỉ ghi cảnh báo: đây là việc thừa theo định kỳ, không
   * được phép làm phiền vòng gọi, và cũng không được báo lỗi mỗi 5 phút nếu
   * Convex đang chập chờn. Counter trong metrics.js không bị ảnh hưởng vì
   * snapshot lấy ở tiến trình bot, không phụ thuộc lần đẩy có thành công hay
   * không — mất một lần đẩy chỉ mất một mốc lịch sử.
   */
  async recordMetrics(snapshot) {
    try {
      await withRetry(
        () =>
          this.client.mutation("bot_writes:botRecordMetrics", {
            at: snapshot.at,
            counters: snapshot.counters,
            gauges: snapshot.gauges,
            histograms: snapshot.histograms,
          }),
        "metrics",
      );
      return true;
    } catch (err) {
      console.warn(`[metrics] không đẩy được lên Convex: ${err?.message ?? err}`);
      return false;
    }
  }

  /** Check the per-rule cooldown; returns true when the bot must stay quiet. */
  isCooledDown(guildId, ruleId, cooldownSeconds) {
    if (!cooldownSeconds) return false;
    const hit = this.ruleCooldowns.get(`${guildId}:${ruleId}`);
    return !!hit && Date.now() - hit < cooldownSeconds * 1000;
  }

  recordReply(guildId, ruleId) {
    this.ruleCooldowns.set(`${guildId}:${ruleId}`, Date.now());
    if (this.ruleCooldowns.size > 500) {
      const now = Date.now();
      for (const [k, v] of this.ruleCooldowns) {
        if (now - v > 86_400_000) this.ruleCooldowns.delete(k);
      }
    }
  }

  /** Simple mutation wrapper with retry. */
  async mutation(name, args) {
    return withRetry(() => this.client.mutation(name, args), `mutation:${name}`);
  }

  /** Simple query wrapper with retry. */
  async query(name, args) {
    return withRetry(() => this.client.query(name, args), `query:${name}`);
  }

  /** Simple action wrapper with retry. */
  async action(name, args) {
    return withRetry(() => this.client.action(name, args), `action:${name}`);
  }
}

module.exports = ConvexStore;
