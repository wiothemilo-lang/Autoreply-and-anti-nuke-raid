// TEST bootstrap botKey — guard chống xoay seed ngoài luồng (sự cố 06/10).
// Chạy: bun scripts/test-bot-bootstrap.ts
// Gọi TRỰC TIẾP handler action với fetch + ctx mock; không mạng, không Convex thật.
import { requestBotKey } from "../convex/botBootstrapAction";
import { computeBotKey } from "../convex/botAuth";

const handler = (requestBotKey as any)._handler;
if (typeof handler !== "function") {
  console.error("Không lấy được handler từ Convex action — cấu trúc convex thay đổi?");
  process.exit(1);
}

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, extra?: string) => {
  console.log(ok ? `  ✅ ${label}` : `  ❌ ${label}${extra ? ` — ${extra}` : ""}`);
  if (ok) pass++;
  else fail++;
};

const realFetch = globalThis.fetch;
const APP_ID = "123456789012345678";

function clearAppEnv() {
  delete process.env.BOT_APPLICATION_ID;
  delete process.env.EXPECTED_BOT_APPLICATION_ID;
  delete process.env.DISCORD_CLIENT_ID;
}

function mockFetch(bot: boolean) {
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({ id: APP_ID, bot, username: "protogon" }),
  })) as unknown as typeof fetch;
}

type Status = {
  seeded: boolean;
  botApplicationId: string | null;
  lastBootstrapAt: number | null;
  lastHeartbeat: number | null;
};

/** ctx tối thiểu: trả status cố định, ghi lại mọi runMutation. */
function makeCtx(status: Status) {
  const mutations: Array<{ args: Record<string, unknown> }> = [];
  const ctx = {
    runQuery: async () => status,
    runMutation: async (_ref: unknown, args: Record<string, unknown>) => {
      mutations.push({ args: args ?? {} });
      return { ok: true as const };
    },
  };
  return { ctx, mutations };
}

function status(over: Partial<Status>): Status {
  return {
    seeded: true,
    botApplicationId: APP_ID,
    lastBootstrapAt: Date.now() - 60 * 60_000,
    lastHeartbeat: Date.now() - 10 * 60_000,
    ...over,
  };
}

(async () => {
  clearAppEnv();
  process.env.BOT_APPLICATION_ID = APP_ID;

  // 1. Bot còn sống (heartbeat 30 giây) → từ chối xoay, không ghi gì.
  {
    mockFetch(true);
    const { ctx, mutations } = makeCtx(status({ lastHeartbeat: Date.now() - 30_000 }));
    const res: any = await handler(ctx, { botToken: "token-that" });
    check(
      "heartbeat mới (< 3 phút) → từ chối xoay seed",
      res?.ok === false && String(res?.error ?? "").includes("heartbeat"),
      JSON.stringify(res),
    );
    check("lượt bị chặn KHÔNG gọi markBootstrapAttempt/storeBotKeySeed", mutations.length === 0);
  }

  // 2. Heartbeat cũ (bot đang bị từ chối) → self-heal hợp lệ, cấp key mới.
  {
    mockFetch(true);
    const { ctx, mutations } = makeCtx(status({ lastHeartbeat: Date.now() - 10 * 60_000 }));
    const res: any = await handler(ctx, { botToken: "token-that" });
    check(
      "heartbeat cũ (> 3 phút) → bootstrap thành công",
      res?.ok === true && /^[0-9a-f]{64}$/.test(String(res?.botKey ?? "")),
      JSON.stringify({ ok: res?.ok, error: res?.error }),
    );
    const store = mutations.find((m) => typeof m.args.seed === "string");
    check("có ghi seed mới qua storeBotKeySeed", !!store);
    check(
      "seed ghi đúng SHA-256(botKey trả về)",
      !!store && store.args.seed === computeBotKey(String(res?.botKey)),
    );
  }

  // 3. Chưa có seed → heartbeat mới vẫn cho bootstrap (chưa có gì để bảo vệ).
  {
    mockFetch(true);
    const { ctx, mutations } = makeCtx(
      status({ seeded: false, lastHeartbeat: Date.now() - 30_000 }),
    );
    const res: any = await handler(ctx, { botToken: "token-that" });
    check("seed chưa cấp phát → không chặn dù heartbeat mới", res?.ok === true);
    check(
      "có ghi seed lần đầu",
      mutations.some((m) => typeof m.args.seed === "string"),
    );
  }

  // 4. Chưa từng có heartbeat (null) → cho bootstrap.
  {
    mockFetch(true);
    const { ctx } = makeCtx(status({ lastHeartbeat: null }));
    const res: any = await handler(ctx, { botToken: "token-that" });
    check("lastHeartbeat null → không chặn", res?.ok === true);
  }

  // 5. Token không phải bot → từ chối trước khi chạm status/DB.
  {
    mockFetch(false);
    const { ctx, mutations } = makeCtx(status({ lastHeartbeat: Date.now() - 30_000 }));
    const res: any = await handler(ctx, { botToken: "token-sai" });
    check(
      "token không phải bot → từ chối, không ghi DB",
      res?.ok === false && mutations.length === 0,
      JSON.stringify(res),
    );
  }

  globalThis.fetch = realFetch;
  clearAppEnv();
  console.log(`\nKết quả bootstrap botKey: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error("ERROR:", e);
  globalThis.fetch = realFetch;
  clearAppEnv();
  process.exit(1);
});
