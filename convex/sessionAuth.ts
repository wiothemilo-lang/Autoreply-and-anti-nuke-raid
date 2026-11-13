"use node";

/// <reference types="node" />

/** Minimal env typing so this file also type-checks from the Vite app. */
declare const process: {
  env: Record<string, string | undefined>;
};

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
// OAuth codes are exchanged server-side; the browser never receives a Discord token.

const DISCORD_API = "https://discord.com/api/v10";
const PERM_MANAGE_GUILD = 0x20;
const DISCORD_SNOWFLAKE_RE = /^\d{15,21}$/;

function configuredClientId(value: string | undefined | null): string {
  const candidate = String(value ?? "").trim();
  return DISCORD_SNOWFLAKE_RE.test(candidate) ? candidate : "";
}

/**
 * Rate-limit login attempts (in-memory, 60s window). Convex không expose IP ổn
 * định cho action, nên đây là trần global theo instance; refresh đã dùng bucket
 * riêng theo Discord user. Without this, anyone can spam bogus codes → each
 * attempt burns a Discord API roundtrip + writes; a botnet could drain quota and
 * get the deployment's Discord OAuth client flagged.
 * (Best-effort: in-memory only survives one action instance — enough against
 * scripted bursts, same approach as haimiya:ask.)
 *
 * Trả chuỗi lỗi khi vượt hạn mức (thay vì throw — Convex production MASK mọi
 * error message từ action thành "Server Error", người dùng không thấy gì).
 */
const loginBuckets = new Map<string, { calls: number[] }>();
const LOGIN_WINDOW_MS = 60_000;
const LOGIN_MAX_PER_WINDOW = 20;

function checkLoginRateLimit(identity: string): string | null {
  const now = Date.now();
  const bucket = loginBuckets.get(identity);
  if (bucket) {
    bucket.calls = bucket.calls.filter((t) => now - t < LOGIN_WINDOW_MS);
    if (bucket.calls.length >= LOGIN_MAX_PER_WINDOW) {
      return "Quá nhiều lượt đăng nhập — thử lại sau ít phút";
    }
    bucket.calls.push(now);
  } else {
    loginBuckets.set(identity, { calls: [now] });
    if (loginBuckets.size > 500) {
      for (const [k, b] of loginBuckets) {
        if (b.calls.every((t) => now - t > LOGIN_WINDOW_MS)) loginBuckets.delete(k);
      }
    }
  }
  return null;
}

/**
 * redirect_uri phải khớp CHÍNH XÁC một trong những URL đăng ký trong Discord
 * Developer Portal (/discord/callback trên domain dashboard). Chặn kẻ xấu trao đổi
 * code theo redirect_uri tùy ý ( authorization code bị kẹp có thể bị gửi tới
 * endpoint attacker-controlled và trao đổi thành access token).
 * Trả chuỗi lỗi thay vì throw (xem checkLoginRateLimit).
 */
function normalizeRedirectUri(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return `${url.origin}${url.pathname.replace(/\/+$/, "") || "/"}`;
  } catch {
    return null;
  }
}

function checkAllowedRedirectUri(uri: string): string | null {
  const candidate = normalizeRedirectUri(uri);
  if (!candidate) return "redirect_uri không hợp lệ";
  const ALLOWED = [
    process.env.OAUTH_REDIRECT_URI,
    process.env.DASHBOARD_URL
      ? `${process.env.DASHBOARD_URL.replace(/\/+$/, "")}/discord/callback`
      : undefined,
  ]
    .filter((u): u is string => !!u)
    .map((u) => normalizeRedirectUri(u))
    .filter((u): u is string => !!u);
  if (ALLOWED.length === 0) return "Chưa cấu hình redirect_uri cho phép trên deployment";
  if (!ALLOWED.includes(candidate)) {
    return "redirect_uri không nằm trong danh sách cho phép";
  }
  return null;
}

function hasValidOAuthParams(code: string, codeVerifier: string): boolean {
  return (
    code.length >= 8 &&
    code.length <= 2048 &&
    /^[A-Za-z0-9._~-]+$/.test(code) &&
    codeVerifier.length >= 43 &&
    codeVerifier.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(codeVerifier)
  );
}

async function fetchDiscord(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  // Giữ signal sống tới khi body đọc xong, không chỉ tới lúc headers về; nếu
  // clear ngay trong finally, res.json() có thể treo vô hạn sau header.
  const timer = setTimeout(() => controller.abort(), 10_000);
  (timer as unknown as { unref?: () => void }).unref?.();
  return fetch(url, { ...init, signal: controller.signal });
}

/**
 * Trao đổi authorization code trên server. Có client secret thì dùng confidential
 * flow; deployment chỉ có public client vẫn dùng PKCE an toàn, không cần browser
 * gửi access token lên Convex.
 */
async function exchangeCodeOnServer(
  clientId: string,
  clientSecret: string | undefined,
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<{ token?: string; error?: string }> {
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });
  if (clientSecret) body.set("client_secret", clientSecret);

  let res: Response;
  try {
    res = await fetchDiscord(`${DISCORD_API}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    return { error: "Không kết nối được tới Discord (mạng)" };
  }
  if (!res.ok) return { error: `Discord token API lỗi ${res.status}` };
  const data = (await res.json().catch(() => null)) as { access_token?: string } | null;
  if (!data?.access_token) return { error: "Discord không trả access token" };
  return { token: data.access_token };
}

/**
 * Trao đổi code OAuth Discord + tạo phiên đăng nhập NGAY TRÊN SERVER.
 *
 * Web chỉ gửi authorization code + PKCE verifier. Browser không nhận và không
 * lưu access/refresh token; mọi token chỉ tồn tại trong request server-side.
 */
export const exchangeAndLogin = action({
  args: {
    code: v.string(),
    codeVerifier: v.string(),
    redirectUri: v.string(),
  },
  handler: async (ctx, { code, codeVerifier, redirectUri }) => {
    // Mọi lỗi trả về dạng { ok: false, reason } — Convex production MASK message
    // của mọi action (kể cả ConvexError) thành "Server Error", khiến web không
    // phân biệt được thiếu client secret / Discord sự cố / sai redirect...
    // Chỉ lỗi NỘI BỘ bất ngờ (DB) mới ném ra ngoài.
    const fail = (reason: string) => ({ ok: false as const, reason });

    // Validate RẺ trước khi tiêu lượt rate-limit: code/redirect sai định dạng
    // không được phép đốt bucket chung của mọi người (DoS đăng nhập). Chỉ
    // request đã qua validate mới tiêu lượt gọi Discord.
    const redirectErr = checkAllowedRedirectUri(redirectUri);
    if (redirectErr) return fail(redirectErr);
    if (!hasValidOAuthParams(code, codeVerifier)) {
      return fail("Mã OAuth hoặc PKCE không hợp lệ");
    }
    const rl = checkLoginRateLimit("public");
    if (rl) return fail(rl);

    const status = await ctx.runQuery(internal.botAuth.getBotKeyStatusInternal).catch(() => null);
    const clientId =
      configuredClientId(process.env.DISCORD_CLIENT_ID) ||
      configuredClientId(status?.botApplicationId);
    if (!clientId) {
      return fail(
        "DISCORD_CLIENT_ID chưa được cấu hình trên deployment — thêm trong Keys/API keys",
      );
    }
    const exchanged = await exchangeCodeOnServer(
      clientId,
      process.env.DISCORD_CLIENT_SECRET,
      code,
      codeVerifier,
      redirectUri,
    );
    if (exchanged.error || !exchanged.token) {
      return fail(exchanged.error ?? "Trao đổi code với Discord thất bại");
    }
    const accessTokenValue = exchanged.token;

    // 2. Lấy danh tính + danh sách server NGAY TỪ DISCORD — không tin client.
    const authHeaders = { Authorization: `Bearer ${accessTokenValue}` };
    let userRes: Response;
    let guildsRes: Response;
    try {
      [userRes, guildsRes] = await Promise.all([
        fetchDiscord(`${DISCORD_API}/users/@me`, { headers: authHeaders }),
        fetchDiscord(`${DISCORD_API}/users/@me/guilds`, { headers: authHeaders }),
      ]);
    } catch {
      return fail("Không kết nối được tới Discord (mạng) — thử lại sau ít phút");
    }
    if (!userRes.ok) {
      const st = userRes.status;
      return fail(
        st >= 500
          ? `Discord đang gặp sự cố tạm thời (lỗi ${st} từ phía Discord) — xem status.discord.com`
          : `Không lấy được thông tin người dùng (${st})`,
      );
    }
    let user: {
      id: string;
      username: string;
      global_name?: string | null;
      avatar?: string | null;
    };
    try {
      user = (await userRes.json()) as typeof user;
    } catch {
      return fail("Discord trả dữ liệu người dùng không hợp lệ — thử lại");
    }
    if (!guildsRes.ok) {
      const st = guildsRes.status;
      return fail(
        st >= 500
          ? `Discord đang gặp sự cố tạm thời (lỗi ${st} từ phía Discord) — xem status.discord.com`
          : `Không lấy được danh sách server (${st})`,
      );
    }
    let guilds: {
      id: string;
      name: string;
      icon?: string | null;
      permissions: string;
    }[];
    try {
      guilds = (await guildsRes.json()) as typeof guilds;
    } catch {
      return fail("Discord trả dữ liệu server không hợp lệ — thử lại");
    }

    // 3. Tạo session token phía server và đăng nhập (internal mutation — client không gọi được)
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const token = btoa(String.fromCharCode(...tokenBytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    try {
      await ctx.runMutation(internal.sessionHardening.loginInternal, {
        token,
        user: {
          discordId: user.id,
          username: user.username,
          globalName: user.global_name ?? undefined,
          avatar: user.avatar ?? undefined,
        },
        guilds: guilds.map((g) => ({
          id: g.id,
          name: g.name,
          icon: g.icon ?? undefined,
          permissions: g.permissions,
        })),
      });
    } catch {
      return fail("Không ghi được phiên đăng nhập trên máy chủ — thử lại");
    }

    return {
      ok: true as const,
      token,
      user: {
        discordId: user.id,
        username: user.username,
        globalName: user.global_name ?? undefined,
        avatar: user.avatar ?? undefined,
      },
      guilds: guilds.map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.icon ?? undefined,
        permissions: g.permissions,
      })),
      manageableCount: guilds.filter(
        (g) => (BigInt(g.permissions) & BigInt(PERM_MANAGE_GUILD)) !== 0n,
      ).length,
    };
  },
});

/**
 * Làm mới danh sách server NGAY TỪ DISCORD — không tin client.
 * Trước đây `sessions:refreshGuilds` nhận danh sách guilds do client tự báo →
 * người dùng đã đăng nhập có thể tự nhận quyền Manage Server trên BẤT KỲ guild
 * nào bằng cách gửi permissions giả. Giờ web chỉ gửi session token + authorization
 * code/PKCE verifier; server tự trao đổi code và gọi /users/@me/guilds.
 */
export const refreshGuildsServer = action({
  args: {
    /** Session token hiện tại; không dùng làm access token Discord. */
    token: v.string(),
    /** Authorization code mới tỉa Discord sau prompt=none. */
    code: v.string(),
    codeVerifier: v.string(),
    redirectUri: v.string(),
  },
  handler: async (ctx, { token, code, codeVerifier, redirectUri }) => {
    const me = await ctx.runQuery(internal.sessionHardening.getUserByTokenInternal, { token });
    if (!me) return { ok: false as const, reason: "not_logged_in" as const };
    const redirectErr = checkAllowedRedirectUri(redirectUri);
    if (redirectErr) return { ok: false as const, reason: redirectErr };
    if (!hasValidOAuthParams(code, codeVerifier)) {
      return { ok: false as const, reason: "invalid_oauth_params" };
    }
    const rl = checkLoginRateLimit(`refresh:${me.discordId}`);
    if (rl) return { ok: false as const, reason: rl };
    const status = await ctx.runQuery(internal.botAuth.getBotKeyStatusInternal).catch(() => null);
    const clientId =
      configuredClientId(process.env.DISCORD_CLIENT_ID) ||
      configuredClientId(status?.botApplicationId);
    if (!clientId) return { ok: false as const, reason: "oauth_not_configured" as const };
    const exchanged = await exchangeCodeOnServer(
      clientId,
      process.env.DISCORD_CLIENT_SECRET,
      code,
      codeVerifier,
      redirectUri,
    );
    if (exchanged.error || !exchanged.token) {
      return { ok: false as const, reason: exchanged.error ?? "oauth_exchange_failed" };
    }

    const authHeaders = { Authorization: `Bearer ${exchanged.token}` };
    let identityRes: Response;
    let guildsRes: Response;
    try {
      [identityRes, guildsRes] = await Promise.all([
        fetchDiscord(`${DISCORD_API}/users/@me`, { headers: authHeaders }),
        fetchDiscord(`${DISCORD_API}/users/@me/guilds`, { headers: authHeaders }),
      ]);
    } catch {
      return { ok: false as const, reason: "network" as const };
    }
    if (!identityRes.ok || !guildsRes.ok) {
      return { ok: false as const, reason: "discord_error" as const };
    }
    const identity = (await identityRes.json().catch(() => null)) as { id?: string } | null;
    if (!identity?.id || identity.id !== me.discordId) {
      return { ok: false as const, reason: "identity_mismatch" as const };
    }

    let guilds: { id: string; name: string; icon?: string; permissions: string }[];
    try {
      const raw = (await guildsRes.json()) as {
        id: string;
        name: string;
        icon?: string | null;
        permissions: string;
      }[];
      guilds = raw.map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.icon ?? undefined,
        permissions: g.permissions,
      }));
    } catch {
      return { ok: false as const, reason: "network" as const };
    }

    await ctx.runMutation(internal.sessionHardening.guildsInternal, {
      discordId: me.discordId,
      guilds,
    });
    return {
      ok: true as const,
      manageableCount: guilds.filter(
        (g) => (BigInt(g.permissions) & BigInt(PERM_MANAGE_GUILD)) !== 0n,
      ).length,
    };
  },
});
