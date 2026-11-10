/**
 * relayClient.js — Threat Relay phía bot (Đợt 6).
 *
 *  - Tải signature chia sẻ từ các server khác (mỗi 10 phút, fire-and-forget —
 *    lỗi relay KHÔNG BAO GIỜ làm fail quét tin nhắn).
 *  - Bắn signature khi AI xác nhận raid (spam-text) hoặc bot nuke lạ được thêm
 *    (bot-name) — chỉ khi guild ĐÃ bật relayShare (Convex kiểm tra lại).
 *
 * Signature nhận về được filters.js dùng TRƯỚC AI classify: nếu nội dung khớp
 * signature raid đã được server khác xác nhận (weight >= 2 hoặc < 2h tuổi) thì
 * khớp ngay — server mới "có miễn dịch cộng đồng" không phải chờ học.
 *
 * Fail-open tuyệt đối: mọi lỗi → bỏ qua im lặng (chỉ console.warn), filters vẫn
 * chạy deterministic path như chưa từng có relay.
 */
const RELAY_REFRESH_MS = 10 * 60 * 1000;
const RELAY_RETRY_MS = 60 * 1000;
const MAX_GUILD_CACHE = 500;
const GUILD_CACHE_TTL_MS = 30 * 60 * 1000;
/** Signature nhận về tối đa giữ trong RAM. */
const MAX_LOCAL = 100;

let store = null;
let cleanupPending = false;
const byGuild = new Map();

function stateFor(guildId) {
  const now = Date.now();
  if (byGuild.size >= MAX_GUILD_CACHE) {
    for (const [id, state] of byGuild) {
      if (!state.loading && now - state.lastFetchAt >= GUILD_CACHE_TTL_MS) byGuild.delete(id);
      if (byGuild.size < MAX_GUILD_CACHE) break;
    }
    while (byGuild.size >= MAX_GUILD_CACHE) {
      const removable = [...byGuild.entries()].find(([, value]) => !value.loading);
      if (!removable) break;
      byGuild.delete(removable[0]);
    }
  }
  let state = byGuild.get(guildId);
  if (!state) {
    state = { lastFetchAt: 0, retryAt: 0, loading: false, signatures: [] };
    byGuild.set(guildId, state);
  }
  return state;
}

/** Gắn store (gọi 1 lần khi bot ready). */
function attach(storeRef) {
  store = storeRef;
}

/** Bắn 1 signature lên relay (fire-and-forget, không bao giờ throw). */
function reportSignature(guildId, kind, value) {
  try {
    if (!store || !guildId || !value) return;
    store.client
      .mutation("relay:botReportSignature", { guildId, kind, value: String(value).slice(0, 60) })
      .catch(() => {});
  } catch {
    // never throw
  }
}

/** Bắn hàng loạt (ví dụ samples spam của 1 vụ raid) — dedupe trước khi gửi. */
function reportSignatureBatch(guildId, kind, values) {
  try {
    const uniq = [
      ...new Set((values || []).map((v) => String(v ?? "").trim()).filter(Boolean)),
    ].slice(0, 10);
    for (const v of uniq) reportSignature(guildId, kind, v);
  } catch {
    // never throw
  }
}

/**
 * Tải signature về (fire-and-forget). Gọi từ filters.refreshThreatIntel cùng nhịp
 * 10 phút — dùng chung TTL để không thêm call Convex.
 */
function refreshSignatures(guildId) {
  if (!store || !guildId) return Promise.resolve();
  const state = stateFor(guildId);
  const now = Date.now();
  if (state.loading || state.retryAt > now || now - state.lastFetchAt < RELAY_REFRESH_MS) {
    return Promise.resolve();
  }
  const storeRef = store;
  state.loading = true;
  let request;
  try {
    request = storeRef.client.query("relay:botGetRelaySignatures", { guildId });
  } catch {
    state.loading = false;
    state.retryAt = Date.now() + RELAY_RETRY_MS;
    return Promise.resolve();
  }
  return Promise.resolve(request)
    .then((res) => {
      if (res && Array.isArray(res.signatures)) {
        state.signatures = res.signatures.slice(0, MAX_LOCAL);
        state.lastFetchAt = Date.now();
        state.retryAt = 0;
      } else {
        // Response malformed vẫn phải backoff; nếu không, mỗi tin nhắn sẽ gọi
        // lại Convex liên tục và tạo một vòng lặp tốn quota.
        state.retryAt = Date.now() + RELAY_RETRY_MS;
      }
    })
    .catch(() => {
      state.retryAt = Date.now() + RELAY_RETRY_MS;
    })
    .then(() => {
      if (cleanupPending) return;
      cleanupPending = true;
      return storeRef.client
        .mutation("relay:botCleanupRelay", {})
        .catch(() => {})
        .finally(() => {
          cleanupPending = false;
        });
    })
    .catch(() => {})
    .finally(() => {
      state.loading = false;
    });
}

/**
 * Khớp nội dung tin nhắn với signature spam-text đã nhận. Trả signature khớp
 * hoặc null. Signature là chuỗi đã chuẩn hóa phía Convex (≤60 ký tự) — so khớp
 * substring lower-case, đủ an toàn (không regex từ dữ liệu mạng).
 */
function matchSpamText(guildId, content) {
  try {
    const signatures = byGuild.get(guildId)?.signatures ?? [];
    if (signatures.length === 0 || !content) return null;
    const lower = String(content).toLowerCase();
    for (const sig of signatures) {
      if (sig.kind !== "spam-text") continue;
      const v = String(sig.value || "").toLowerCase();
      if (v.length >= 3 && lower.includes(v)) return sig;
    }
  } catch {
    return null; // fail-open: dữ liệu lạ → không khớp
  }
  return null;
}

/** Số signature đang giữ (cho test/đếm). */
function localCount(guildId) {
  return byGuild.get(guildId)?.signatures.length ?? 0;
}

/** Xóa cache local (test). */
function reset() {
  byGuild.clear();
  cleanupPending = false;
}

module.exports = {
  attach,
  reportSignature,
  reportSignatureBatch,
  refreshSignatures,
  matchSpamText,
  localCount,
  reset,
};
