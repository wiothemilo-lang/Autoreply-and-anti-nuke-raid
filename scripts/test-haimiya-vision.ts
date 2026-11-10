// TEST Haimiya vision — luồng gửi ảnh qua `haimiya:ask`.
// Chạy: bun scripts/test-haimiya-vision.ts
// Gọi trực tiếp handler (fetch mock) — xác minh:
//   A) request có image_url content parts (chuẩn OpenAI-compatible)
//   B) guard: mime sai/không base64 → bị bỏ, không crash
//   C) cap 3 ảnh + cap kích thước ~550KB/ảnh
//   D) history không đổi khi không có ảnh; system prompt có ghi chú ảnh
//   F) ảnh KHÔNG kèm chữ vẫn hỏi được (bug 27/09/2026: "Tin nhắn rỗng")
import { ask } from "../convex/haimiya";

const askHandler = (ask as any)._handler;
if (typeof askHandler !== "function") {
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

const AI_ENV_KEYS = [
  "AI_API_KEY",
  "AI_BASE_URL",
  "AI_MODEL",
  "GROQ_API_KEY",
  "NVIDIA_API_KEY",
  "DEEPSEEK_NIM_KEY",
  "SAMBANOVA_API_KEY",
  "OPENAI_API_KEY",
  "FUNC_SEED",
] as const;
function clearAIEnv() {
  for (const k of AI_ENV_KEYS) delete process.env[k];
}

type ReqInfo = { model?: string; system?: string; history?: any[] };
let requests: ReqInfo[] = [];

function mockFetch(reply = "Mình thấy ảnh rồi nhé!", status = 200) {
  requests = [];
  globalThis.fetch = (async (url: any, opts: any = {}) => {
    const body = JSON.parse(opts?.body || "{}");
    requests.push({
      model: body.model,
      system: body.messages?.[0]?.content,
      history: body.messages?.slice(1),
    });
    if (status !== 200) return { ok: false, status, json: async () => ({}), text: async () => "" };
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: reply } }] }),
    } as any;
  }) as typeof fetch;
}

const ctxMock = {
  runQuery: async (_fn: unknown, args?: { token?: string }) => {
    if (args?.token === "test-session-token") {
      return { discordId: "123456789012345678", username: "tester" };
    }
    return null;
  },
} as any;

const png = (bytes: number) =>
  `data:image/png;base64,${Buffer.alloc(Math.max(1, bytes), 7).toString("base64")}`;
const jpeg = (bytes: number) =>
  `data:image/jpeg;base64,${Buffer.alloc(Math.max(1, bytes), 7).toString("base64")}`;

const askWith = async (args: Record<string, unknown>) =>
  (await askHandler(ctxMock, {
    messages: [{ role: "user", content: "Ảnh này là gì?" }],
    token: "test-session-token",
    ...args,
  })) as any;

(async () => {
  clearAIEnv();
  (process.env as any).GROQ_API_KEY = "test-groq";
  mockFetch();

  console.log("A) 1 ảnh hợp lệ → content parts image_url:");
  const r1 = await askWith({ images: [{ dataUrl: jpeg(50_000) }] });
  check("trả reply, không offline", r1.offline === false && r1.reply.length > 0);
  const parts = requests[0]?.history?.[0]?.content;
  check("content là mảng parts", Array.isArray(parts) && parts.length === 2);
  check(
    "part 1 là text đúng nội dung",
    parts?.[0]?.type === "text" && parts[0].text === "Ảnh này là gì?",
  );
  check(
    "part 2 là image_url với dataUrl nguyên vẹn",
    parts?.[1]?.type === "image_url" && parts[1].image_url.url.startsWith("data:image/jpeg"),
  );
  check(
    "system prompt có ghi chú ảnh",
    String(requests[0]?.system).includes("1 ẢNH") || String(requests[0]?.system).includes("ẢNH"),
  );

  console.log("\nB) Guard mime/size:");
  mockFetch();
  const r2 = await askWith({
    images: [
      { dataUrl: "data:application/pdf;base64,AAA" }, // mime sai
      { dataUrl: "data:image/gif;base64,AAA" }, // gif không nằm trong whitelist
      { dataUrl: "https://example.com/x.png" }, // không phải data URL
      { dataUrl: png(20_000) },
    ],
  });
  const parts2 = requests[0]?.history?.[0]?.content;
  check(
    "chỉ 1 ảnh hợp lệ còn lại (png)",
    Array.isArray(parts2) && parts2.filter((p: any) => p.type === "image_url").length === 1,
  );
  check("vẫn trả lời bình thường (bỏ ảnh lỗi, không crash)", r2.offline === false);

  console.log("\nC) Cap số lượng + kích thước:");
  mockFetch();
  const r3 = await askWith({
    images: [
      { dataUrl: jpeg(10_000) },
      { dataUrl: jpeg(10_000) },
      { dataUrl: jpeg(10_000) },
      { dataUrl: jpeg(10_000) }, // thứ 4 vượt cap 3
      { dataUrl: png(2_000_000) }, // quá 550KB
    ],
  });
  const parts3 = requests[0]?.history?.[0]?.content;
  check(
    "tối đa 3 ảnh được gửi",
    Array.isArray(parts3) && parts3.filter((p: any) => p.type === "image_url").length === 3,
  );
  check("ảnh quá lớn bị bỏ", r3.offline === false);

  console.log("\nD) Không có ảnh → hành vi cũ giữ nguyên:");
  mockFetch();
  const r4 = await askWith({});
  check("content vẫn là string thuần", typeof requests[0]?.history?.[0]?.content === "string");
  check("system prompt KHÔNG có ghi chú ảnh", !String(requests[0]?.system).includes("ẢNH"));
  check("reply bình thường", r4.offline === false);

  console.log("\nE) Tin assistant giữa chừng không bị ghép ảnh:");
  mockFetch();
  await askHandler(ctxMock, {
    token: "test-session-token",
    messages: [
      { role: "assistant", content: "trả lời cũ" },
      { role: "user", content: "xem giúp" },
    ],
    images: [{ dataUrl: jpeg(10_000) }],
  } as any);
  const hist = requests[0]?.history ?? [];
  check("turn assistant giữ string", typeof hist[0]?.content === "string");
  check("turn user CUỐI là mảng parts", Array.isArray(hist[1]?.content));

  console.log("\nF) Ảnh KHÔNG kèm chữ (gửi ảnh rồi bấm gửi) — bug 27/09/2026:");
  // Trước đây action trả "Tin nhắn rỗng" → web báo "AI chưa phản hồi" và trả
  // lời bằng kiến thức cục bộ, tức ảnh gửi lên bị bỏ rơi hoàn toàn.
  mockFetch();
  const r5 = (await askHandler(ctxMock, {
    token: "test-session-token",
    messages: [{ role: "user", content: "" }],
    images: [{ dataUrl: jpeg(20_000) }],
  } as any)) as any;
  check(
    "text rỗng + ảnh hợp lệ → vẫn hỏi AI được",
    r5.offline === false && r5.reply.length > 0,
    r5,
  );
  const partsF = requests[0]?.history?.[0]?.content;
  check(
    "part text KHÔNG bị gửi rỗng (có chỉ dẫn mặc định)",
    Array.isArray(partsF) && partsF[0]?.type === "text" && partsF[0].text.trim().length > 0,
    partsF,
  );
  check(
    "ảnh vẫn được gửi kèm lượt không có chữ",
    partsF?.[1]?.type === "image_url" && partsF[1].image_url.url.startsWith("data:image/jpeg"),
  );
  // Ranh giới: rỗng mà KHÔNG có ảnh hợp lệ thì vẫn phải từ chối.
  mockFetch();
  const r6 = (await askHandler(ctxMock, {
    token: "test-session-token",
    messages: [{ role: "user", content: "  " }],
  } as any)) as any;
  check("rỗng mà không có ảnh → vẫn từ chối (không đốt lượt AI)", r6.offline === true, r6);
  const r7 = (await askHandler(ctxMock, {
    token: "test-session-token",
    messages: [{ role: "user", content: "" }],
    images: [{ dataUrl: "https://example.com/x.png" }], // ảnh không hợp lệ
  } as any)) as any;
  check(
    "rỗng + ảnh KHÔNG hợp lệ → từ chối, không gọi AI",
    r7.offline === true && requests.length === 0,
    {
      r7,
      requests: requests.length,
    },
  );

  console.log(`\nKết quả: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
