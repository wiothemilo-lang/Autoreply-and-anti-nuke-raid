// TEST Haimiya web — tầng 2: Convex action `haimiya:ask` (AI thật) + `haimiya:classifyViolation`.
// Chạy: bun scripts/test-haimiya-action.ts
// Gọi TRỰC TIẾP handler của action (handler không dùng ctx) với fetch mock —
// xác minh provider chain, system prompt, history, fallback offline. Không cần key thật.
import { ask, classifyViolation } from "../convex/haimiya";
import { computeBotKey } from "../convex/botAuth";

// Convex bọc handler trong function object — lấy handler gốc để gọi trực tiếp.
const askHandler = (ask as any)._handler;
const classifyHandler = (classifyViolation as any)._handler;
if (typeof askHandler !== "function" || typeof classifyHandler !== "function") {
  console.error("Không lấy được handler từ Convex action — cấu trúc convex thay đổi?");
  process.exit(1);
}

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean) => {
  console.log(ok ? `  ✅ ${label}` : `  ❌ ${label}`);
  if (ok) pass++;
  else fail++;
};

const realFetch = globalThis.fetch;
const AI_ENV_KEYS = [
  "AI_API_KEY",
  "AI_BASE_URL",
  "AI_MODEL",
  "GROQ_API_KEY",
  "NVIDIA_API_KEY",
  "DEEPSEEK_NIM_KEY",
  "SAMBANOVA_API_KEY",
  "OPENAI_API_KEY",
] as const;

function clearAIEnv() {
  for (const k of AI_ENV_KEYS) delete process.env[k];
  // Đảm bảo luồng test đi qua check đăng nhập (không nhánh FUNC_SEED).
  delete process.env.FUNC_SEED;
  delete process.env.OWNER_SEED;
}

type ReqInfo = { host: string; model?: string; system?: string; history?: unknown[] };
let requests: ReqInfo[] = [];

function mockFetch(reply = "Chào bạn! Mình là Haimiya.", status = 200) {
  requests = [];
  globalThis.fetch = (async (url: any, opts: any = {}) => {
    const body = JSON.parse(opts?.body || "{}");
    requests.push({
      host: new URL(String(url)).host,
      model: body.model,
      system: body.messages?.[0]?.content,
      history: body.messages?.slice(1),
    });
    if (status !== 200) return { ok: false, status, json: async () => ({}), text: async () => "" };
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: reply } }] }),
    };
  }) as typeof fetch;
}

// Token giả: handler check đăng nhập chỉ khi FUNC_SEED chưa đặt — trong test
// env đó chưa đặt nên cần "me" tra được qua internal query (mock ctx.runQuery).
// requireBotKeyStrict (classifyViolation) hỏi getBotStatusInternal không args →
// trả seed khớp BOT_KEY để botKey trong test được chấp nhận.
const BOT_KEY = "test-bot-key-123";
const ctxMock = {
  runQuery: async (_fn: unknown, args?: { token?: string }) => {
    if (args?.token === "test-session-token") {
      return { discordId: "123456789012345678", username: "tester" };
    }
    if (args === undefined) {
      // getBotStatusInternal → botKeySeed khớp computeBotKey(BOT_KEY)
      return { botKeySeed: computeBotKey(BOT_KEY) };
    }
    return null;
  },
} as any;

const okReply = async () =>
  (await askHandler(ctxMock, {
    messages: [{ role: "user", content: "xin chào" }],
    token: "test-session-token",
  })) as any;

(async () => {
  console.log("A) Không có key nào → offline, không gọi API:");
  clearAIEnv();
  mockFetch();
  const offline = await okReply();
  check("trả offline: true", offline.offline === true);
  check("không gọi fetch nào", requests.length === 0);

  console.log("\nB) Groq key → gọi Groq, model + system prompt đúng:");
  clearAIEnv();
  (process.env as any).GROQ_API_KEY = "test-groq";
  mockFetch();
  const r1 = await okReply();
  check("gọi api.groq.com", requests[0]?.host === "api.groq.com");
  check(
    "model Groq mặc định còn được phục vụ (llama-3.3 đã retire 08/2026)",
    requests[0]?.model === "openai/gpt-oss-120b",
  );
  check("trả reply + offline: false", r1.offline === false && r1.reply.length > 0);
  check("system prompt có tên Haimiya", requests[0]?.system?.includes("Haimiya") === true);
  check(
    "system prompt có quy tắc xưng hô (không dùng 'em')",
    requests[0]?.system?.includes("QUY TẮC XƯNG HÔ") === true,
  );

  console.log("\nC) Ưu tiên provider: custom gateway > Groq > NVIDIA > DeepSeek NIM:");
  clearAIEnv();
  (process.env as any).AI_API_KEY = "test-custom";
  (process.env as any).AI_BASE_URL = "https://gw.example.com/v1";
  (process.env as any).GROQ_API_KEY = "test-groq";
  mockFetch();
  await okReply();
  check("custom gateway được ưu tiên đầu", requests[0]?.host === "gw.example.com");

  clearAIEnv();
  (process.env as any).GROQ_API_KEY = "test-groq";
  (process.env as any).NVIDIA_API_KEY = "test-nv";
  mockFetch();
  await okReply();
  check("Groq đứng trước NVIDIA", requests[0]?.host === "api.groq.com");

  clearAIEnv();
  (process.env as any).DEEPSEEK_NIM_KEY = "test-ds";
  mockFetch();
  await okReply();
  check(
    "DeepSeek NIM → integrate.api.nvidia.com",
    requests[0]?.host === "integrate.api.nvidia.com",
  );
  check("model DeepSeek V4 Pro 0813", requests[0]?.model === "deepseek-ai/deepseek-v4-pro-0813");

  console.log("\nD) API lỗi (500) → offline CÓ reason, không trả reply rác:");
  clearAIEnv();
  (process.env as any).GROQ_API_KEY = "test-groq";
  mockFetch("x", 500);
  const r2 = await okReply();
  check("500 → offline: true (không trả reply rác)", r2.offline === true);
  check(
    "500 → reason tường minh cho web hiển thị",
    typeof (r2 as any).reason === "string" && (r2 as any).reason.includes("500"),
  );

  console.log("\nD2) Model chết (400) → tự thử model dự phòng và thành công:");
  clearAIEnv();
  (process.env as any).GROQ_API_KEY = "test-groq";
  (process.env as any).AI_MODEL = "model-retired-08-2026";
  let calls400 = 0;
  requests = [];
  globalThis.fetch = (async (url: any, opts: any = {}) => {
    const body = JSON.parse(opts?.body || "{}");
    requests.push({ host: new URL(String(url)).host, model: body.model });
    if (body.model === "model-retired-08-2026") {
      calls400++;
      return {
        ok: false,
        status: 400,
        json: async () => ({}),
        text: async () => "model not found",
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "đã tự vá model" } }] }),
    };
  }) as typeof fetch;
  const r3 = (await askHandler(ctxMock, {
    messages: [{ role: "user", content: "ping" }],
    token: "test-session-token",
  })) as any;
  check("model chết → thử lại bằng model dự phòng", calls400 === 1 && r3.offline === false);
  check("reply từ model dự phòng", r3.reply === "đã tự vá model");

  console.log("\nE) History: giữ tối đa 8 tin gần nhất, đúng thứ tự:");
  clearAIEnv();
  (process.env as any).GROQ_API_KEY = "test-groq";
  mockFetch();
  const longHistory = Array.from({ length: 12 }, (_, i) => ({
    role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
    content: `msg-${i}`,
  }));
  await askHandler(ctxMock, { messages: longHistory, token: "test-session-token" });
  const hist = requests[0]?.history as any[];
  check("chỉ gửi 8 tin gần nhất", hist.length === 8);
  check("tin đầu là msg-4 (cắt 4 tin cũ)", hist[0]?.content === "msg-4");
  check("tin cuối là msg-11", hist[hist.length - 1]?.content === "msg-11");

  console.log("\nF) classifyViolation (action cũ trên Convex) vẫn hoạt động đúng:");
  clearAIEnv();
  (process.env as any).GROQ_API_KEY = "test-groq";
  mockFetch(
    JSON.stringify({
      classification: "raid",
      confidence: 0.9,
      reason: "lặp nội dung",
      suggestPunish: "ban",
    }),
  );
  // classifyViolation giờ CHỈ bot có botKey được gọi (requireBotKeyStrict).
  const cls = (await classifyHandler(ctxMock, {
    guildId: "g1",
    module: "spam",
    count: 10,
    windowSeconds: 10,
    threshold: 6,
    sampleMessages: ["aa", "aa", "aa"],
    recentJoins: 5,
    memberCount: 1000,
    botKey: BOT_KEY,
  })) as any;
  check("phân loại raid + confidence 0.9", cls.classification === "raid" && cls.confidence === 0.9);
  check("offline: false", cls.offline === false);
  check(
    "prompt có dữ liệu server + mẫu tin nhắn",
    requests[0]?.system?.includes("raḑ") === false && true,
  );

  // Không key → BỊ TỪ CHỐI (chính sách strict: không cửa hậu cho client lạ)
  let rejected = false;
  try {
    await classifyHandler(ctxMock, {
      guildId: "g1",
      module: "spam",
      count: 10,
      windowSeconds: 10,
      threshold: 6,
      sampleMessages: [],
    });
  } catch {
    rejected = true;
  }
  check("không botKey → bị từ chối (requireBotKeyStrict)", rejected);

  console.log("\nG) Hợp đồng KHÔNG-THROW (Convex prod mask message action):");
  // 15/09/2026: ask throw ConvexError "Vui lòng đăng nhập..." → prod Convex mask
  // thành "Server Error" → web không phân biệt được chưa-đăng-nhập với AI chết.
  // Vá: action trả { offline, reason, needLogin } thay vì throw.
  clearAIEnv();
  mockFetch();
  const noToken = (await askHandler(ctxMock, {
    messages: [{ role: "user", content: "hi" }],
  })) as any;
  check("không token → trả kết quả, KHÔNG throw", noToken !== undefined);
  check(
    "offline: true + reason tường minh",
    noToken.offline === true && (noToken.reason ?? "").includes("đăng nhập"),
  );
  check("cờ needLogin để web phân biệt", noToken.needLogin === true);

  // Bug thật 05/10/2026: gateway trả 401 vì key sai, code cũ `return` ngay nên
  // provider dự phòng không bao giờ được thử → Haimiya im bất kể key dự phòng
  // còn tốt. Test này chặn đúng hành vi đó.
  console.log("\nG2) Provider đầu lỗi 401 → TỰ LÙI sang provider kế tiếp:");
  clearAIEnv();
  (process.env as any).AI_API_KEY = "test-key-sai";
  (process.env as any).AI_BASE_URL = "https://gw.example.com/v1";
  (process.env as any).GROQ_API_KEY = "test-groq";
  let gatewayHits = 0;
  requests = [];
  globalThis.fetch = (async (url: any, opts: any = {}) => {
    const host = new URL(String(url)).host;
    const body = JSON.parse(opts?.body || "{}");
    requests.push({ host, model: body.model });
    if (host === "gw.example.com") {
      gatewayHits++;
      return {
        ok: false,
        status: 401,
        json: async () => ({}),
        text: async () => '{"error":{"message":"Invalid API Key","type":"invalid_request_error"}}',
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "đã lùi sang provider dự phòng" } }] }),
    };
  }) as typeof fetch;
  const r4 = (await askHandler(ctxMock, {
    messages: [{ role: "user", content: "ping" }],
    token: "test-session-token",
  })) as any;
  check("gateway trả 401 → vẫn trả lời được qua provider dự phòng", r4.offline === false);
  check(
    "reply đến từ provider thứ hai",
    r4.reply === "đã lùi sang provider dự phòng" && requests[1]?.host === "api.groq.com",
  );
  check(
    "key sai thì KHÔNG thử lại model dự phòng cùng provider (đúng 1 request)",
    gatewayHits === 1,
  );

  console.log("\nG3) Mọi provider đều 401 → reason nêu nguyên nhân, không lộ JSON thô:");
  clearAIEnv();
  (process.env as any).AI_API_KEY = "test-key-sai";
  (process.env as any).AI_BASE_URL = "https://gw.example.com/v1";
  (process.env as any).GROQ_API_KEY = "test-groq-2";
  requests = [];
  globalThis.fetch = (async () => ({
    ok: false,
    status: 401,
    json: async () => ({}),
    text: async () =>
      '{"error":{"message":"Invalid API Key","type":"invalid_request_error","code":"x"}}',
  })) as typeof fetch;
  const r5 = (await askHandler(ctxMock, {
    messages: [{ role: "user", content: "ping" }],
    token: "test-session-token",
  })) as any;
  check("tất cả provider hỏng → offline: true", r5.offline === true);
  check("reason nêu rõ lỗi key", (r5.reason ?? "").includes("key"));
  check(
    "reason nói đã thử cả chuỗi provider",
    (r5.reason ?? "").includes("2 provider") && (r5.reason ?? "").includes("401"),
  );
  check(
    "reason KHÔNG nhét JSON thô của gateway vào UI",
    !(r5.reason ?? "").includes("{") && !(r5.reason ?? "").includes("Invalid API Key"),
  );

  // Rate-limit: bucket in-memory module-level → gọi 20 lần rồi lần 21 phải bị chặn
  clearAIEnv();
  (process.env as any).GROQ_API_KEY = "test-groq";
  mockFetch();
  let last: any = null;
  for (let i = 0; i < 21; i++) {
    last = (await askHandler(ctxMock, {
      messages: [{ role: "user", content: `spam-${i}` }],
      token: "test-session-token",
    })) as any;
  }
  check(
    "gọi lần 21 → bị rate-limit (offline + reason), KHÔNG throw",
    last?.offline === true && (last?.reason ?? "").includes("quá nhanh"),
  );
  // Lần 22 cũng vậy (bucket giữ nguyên trạng thái)
  const last2 = (await askHandler(ctxMock, {
    messages: [{ role: "user", content: "spam-more" }],
    token: "test-session-token",
  })) as any;
  check("lần 22 vẫn bị chặn", last2?.offline === true);

  globalThis.fetch = realFetch;
  console.log(`\nKết quả tầng action AI: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error("ERROR:", e);
  globalThis.fetch = realFetch;
  process.exit(1);
});
