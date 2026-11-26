// Test fallback chain của bot/src/ai.js — không dùng biến môi trường thật.
// Mock 2 provider: Groq (đầu chain) trả 429 → DeepSeek NIM (sau) trả 200 JSON hợp lệ.
const path = require("path");
const Module = require("module");

let calls = [];
let bodies = [];
const realFetch = globalThis.fetch;
// Mock Response đúng thực tế: HTTP Response thật luôn có .text() + .headers.get().
const mkRes = (status, body, headers) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k) => (headers || {})[String(k).toLowerCase()] ?? null },
  text: async () => JSON.stringify(body),
  json: async () => body,
});
globalThis.fetch = async (url) => {
  calls.push(new URL(url).host);
  if (String(url).includes("groq.com")) {
    return mkRes(429, {});
  }
  return mkRes(200, {
    choices: [
      {
        message: {
          content: JSON.stringify({
            classification: "raid",
            confidence: 0.9,
            reason: "test",
            suggestPunish: "ban",
          }),
        },
      },
    ],
  });
};

// Chặn loadenv để không đọc .env thật, và set fake env bằng cách ghi đè descriptor
const origLoad = Module.prototype.load;
Module.prototype.load = function (request) {
  if (path.basename(request) === "loadenv.js") {
    return {}; // không load thật
  }
  return origLoad.apply(this, arguments);
};

// Test phải HERMETIC: xóa mọi key provider AI từ môi trường ambient (CI/VPS có
// thể set AI_API_KEY/AI_BASE_URL → test trước đây FAIL vì chain có thêm
// custom-gateway ở đầu, số lần gọi fetch lệch khỏi kỳ vọng).
for (const k of [
  "AI_API_KEY",
  "AI_BASE_URL",
  "AI_MODEL",
  "GROQ_API_KEY",
  "DEEPSEEK_NIM_KEY",
  "DEEPSEEK_NIM_MODEL",
  "NVIDIA_API_KEY",
  "NVIDIA_MODEL",
  "SAMBANOVA_API_KEY",
  "KIRA_API_KEY",
  "KIRA_BASE_URL",
  "KIRA_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
]) {
  delete process.env[k];
}
Object.defineProperty(process.env, "GROQ_API_KEY", {
  value: "fake-groq",
  configurable: true,
  writable: true,
  enumerable: true,
});
Object.defineProperty(process.env, "DEEPSEEK_NIM_KEY", {
  value: "fake-nim",
  configurable: true,
  writable: true,
  enumerable: true,
});

const ai = require("../bot/src/ai.js");

// Case 1: Groq 429 → fallback sang DeepSeek NIM, nhận kết quả hợp lệ
ai.classifyViolation({
  module: "massBan",
  count: 12,
  windowSeconds: 10,
  threshold: 5,
  sampleMessages: [],
})
  .then((r) => {
    console.log("[case1: fallback] providers tried:", calls.join(" -> "));
    console.log("[case1: fallback] final:", JSON.stringify(r));
    // FIX HTTP (chatOne retry 429): Groq 429 → retry đúng 1 lần (2 lượt gọi
    // Groq) vẫn fail → mới nhảy sang NIM. Tổng 3 lượt, kết quả vẫn hợp lệ.
    const ok = calls.length === 3 && r.classification === "raid" && !r.offline;
    console.log(ok ? "PASS case1: fallback chain hoạt động" : "FAIL case1: fallback chain lỗi");
    if (!ok) process.exit(1);

    // Case 2: Groq thành công ngay — KHÔNG được gọi provider thứ hai
    calls = [];
    globalThis.fetch = async (url) => {
      calls.push(new URL(url).host);
      return mkRes(200, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                classification: "benign",
                confidence: 0.8,
                reason: "x",
                suggestPunish: null,
              }),
            },
          },
        ],
      });
    };
    return ai.classifyViolation({
      module: "spam",
      count: 3,
      windowSeconds: 10,
      threshold: 5,
      sampleMessages: [],
    });
  })
  .then((r) => {
    console.log("[case2: first ok] providers tried:", calls.join(" -> "));
    console.log("[case2: first ok] final:", JSON.stringify(r));
    const ok = calls.length === 1 && r.classification === "benign";
    console.log(ok ? "PASS case2: provider đầu thành công thì không fallback" : "FAIL case2");
    if (!ok) process.exit(1);

    // Case 3: cả hai provider đều fail → trả offline, không crash
    calls = [];
    globalThis.fetch = async (url) => {
      calls.push(new URL(url).host);
      return mkRes(500, {});
    };
    return ai.classifyViolation({
      module: "x",
      count: 2,
      windowSeconds: 5,
      threshold: 5,
      sampleMessages: [],
    });
  })
  .then((r) => {
    console.log("[case3: all fail] providers tried:", calls.join(" -> "));
    console.log("[case3: all fail] final:", JSON.stringify(r));
    // FIX HTTP: mỗi provider retry 1 lần khi 500 → 2 provider × 2 = 4 lượt.
    const ok = calls.length === 4 && r.offline === true;
    console.log(ok ? "PASS case3: all fail → offline an toàn" : "FAIL case3");
    if (!ok) {
      globalThis.fetch = realFetch;
      process.exit(1);
    }

    // Case 4: model chết (400) → TỰ VÁ: thử lại đúng 1 lần cùng provider với
    // model dự phòng, KHÔNG nhảy sang provider kế khi tự vá thành công.
    // Giả lập production còn cấu hình model cũ đã retire (llama-3.3-70b).
    calls = [];
    bodies = [];
    process.env.AI_MODEL = "llama-3.3-70b-versatile";
    globalThis.fetch = async (url, init) => {
      calls.push(new URL(url).host);
      bodies.push(JSON.parse(init.body).model);
      if (JSON.parse(init.body).model === "openai/gpt-oss-120b") {
        return mkRes(200, {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  classification: "raid",
                  confidence: 0.9,
                  reason: "healed",
                  suggestPunish: "ban",
                }),
              },
            },
          ],
        });
      }
      return mkRes(400, {});
    };
    return ai.classifyViolation({
      module: "massJoin",
      count: 8,
      windowSeconds: 10,
      threshold: 5,
      sampleMessages: [],
    });
  })
  .then((r) => {
    const ok =
      calls.length === 2 &&
      calls.every((h) => h === "api.groq.com") &&
      bodies[0] === "llama-3.3-70b-versatile" &&
      bodies[1] === "openai/gpt-oss-120b" &&
      r.classification === "raid" &&
      !r.offline;
    console.log("[case4: self-heal] models tried:", bodies.join(" -> "));
    console.log(ok ? "PASS case4: model chết → tự vá 1 lần, không đổi provider" : "FAIL case4");
    delete process.env.AI_MODEL;
    if (!ok) {
      globalThis.fetch = realFetch;
      process.exit(1);
    }

    // Case 5: prompt huấn luyện — có few-shot + checklist benign + JSON nghiêm.
    calls = [];
    let lastBody = "";
    globalThis.fetch = async (url, init) => {
      calls.push(new URL(url).host);
      lastBody = init.body;
      return mkRes(200, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                classification: "benign",
                confidence: 0.8,
                reason: "x",
                suggestPunish: null,
              }),
            },
          },
        ],
      });
    };
    return ai
      .classifyViolation({
        module: "spam",
        count: 3,
        windowSeconds: 10,
        threshold: 5,
        sampleMessages: ["hello anh em"],
        knownThreats: { keywords: ["free nitro"], phrases: ["claim reward now"] },
      })
      .then((r) => ({ r, lastBody }));
  })
  .then(({ r, lastBody }) => {
    const body = JSON.parse(lastBody);
    const sys = body.messages.find((m) => m.role === "system")?.content ?? "";
    const usr = body.messages.find((m) => m.role === "user")?.content ?? "";
    const ok =
      r.classification === "benign" &&
      sys.includes("VÍ DỤ") &&
      sys.includes("DƯƠNG TÍNH GIẢ") &&
      sys.includes("≥0.8") &&
      usr.includes("free nitro") &&
      usr.includes("claim reward now");
    console.log(
      ok ? "PASS case5: prompt có few-shot + benign checklist + mẫu scam đã học" : "FAIL case5",
    );
    if (!ok) {
      globalThis.fetch = realFetch;
      process.exit(1);
    }

    // Case 6: chạy đồng thời 2 lời gọi AI — TUYỆT ĐỐI KHÔNG mutate globalThis.fetch
    // (bản cũ ghi đè globalThis.fetch làm rò chuỗi wrapper vĩnh viễn khi A xong trước B).
    let fetchMutated = false;
    let callIdx = 0;
    const sentinelFetch = async () => {
      if (globalThis.fetch !== sentinelFetch) fetchMutated = true;
      const myIdx = ++callIdx;
      await new Promise((res) => setTimeout(res, myIdx === 1 ? 15 : 40));
      if (globalThis.fetch !== sentinelFetch) fetchMutated = true;
      return mkRes(200, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                classification: "benign",
                confidence: 0.9,
                reason: "ok",
                suggestPunish: null,
              }),
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });
    };
    globalThis.fetch = sentinelFetch;
    return Promise.all([
      ai.classifyViolation({
        module: "spam",
        count: 2,
        windowSeconds: 10,
        threshold: 5,
        sampleMessages: ["a"],
      }),
      ai.classifyViolation({
        module: "spam",
        count: 2,
        windowSeconds: 10,
        threshold: 5,
        sampleMessages: ["b"],
      }),
    ]).then(() => {
      const ok6 = !fetchMutated && globalThis.fetch === sentinelFetch;
      console.log(
        ok6
          ? "PASS case6: chạy song song không ghi đè globalThis.fetch"
          : "FAIL case6: globalThis.fetch bị ghi đè",
      );
      globalThis.fetch = realFetch;
      process.exit(ok6 ? 0 : 1);
    });
  })
  .catch((e) => {
    console.error("ERROR:", e);
    globalThis.fetch = realFetch;
    process.exit(1);
  });
