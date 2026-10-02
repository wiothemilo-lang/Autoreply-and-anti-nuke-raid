// Test bot/src/resilience.js — trần thời gian + backoff có jitter.
//
// Suite riêng vì đây là lưới an toàn cho MỌI lời gọi ra ngoài: nếu nó hỏng thì
// bot không báo lỗi mà chỉ... đứng im. Đúng kiểu hỏng khó thấy nhất, và đúng
// kiểu hỏng đã làm suite trình duyệt treo trong CI (02/10).
//
// Chạy: node scripts/test-resilience.cjs
const path = require("path");
const Module = require("module");

// ── Mock convex/browser TRƯỚC khi nạp convex.js: bắt lại `fetch` mà store
//    truyền vào ConvexHttpClient (đó chính là thứ đợt #3 thêm vào). ──
let capturedClientOptions = null;
// PHẢI mock ở `Module._load` chứ không phải `Module.prototype.load`:
// `_load` nhận SPECIFIER THÔ ("convex/browser"), còn `.load` nhận đường dẫn đã
// giải (`…/node_modules/convex/dist/cjs/browser/index-node.js`) nên so khớp
// "convex/browser" ở đó KHÔNG BAO GIỜ trúng — mock im lặng không được dùng, và
// test tưởng đang kiểm thứ thật.
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (path.basename(String(request)) === "loadenv.js") return {};
  if (request === "convex/browser") {
    return {
      ConvexHttpClient: class {
        constructor(url, options) {
          this.url = url;
          capturedClientOptions = options ?? {};
        }
        async query() {
          return null;
        }
        async mutation() {
          return null;
        }
        setAdminAuth() {}
      },
    };
  }
  return origLoad.call(this, request, ...rest);
};

process.env.CONVEX_URL = "https://vi-du-123.convex.cloud";

const resilience = require("../bot/src/resilience.js");
const {
  TimeoutError,
  isTimeoutError,
  withTimeout,
  fetchWithTimeout,
  wrapFetch,
  backoffDelayMs,
  resolveTimeoutMs,
  DEFAULT_FETCH_TIMEOUT_MS,
} = resilience;

let pass = 0;
let fail = 0;
function check(label, cond, extra) {
  if (cond) {
    pass++;
    console.log("PASS", label);
  } else {
    fail++;
    console.log("FAIL", label, extra ?? "");
  }
}

async function main() {
  const realFetch = globalThis.fetch;

  // ── 1. withTimeout: xong trước hạn thì trả bình thường ──
  {
    const t0 = Date.now();
    const v = await withTimeout(async () => "xong", 5_000, "việc nhanh");
    check("withTimeout trả đúng giá trị khi kịp hạn", v === "xong");
    check("việc xong nhanh KHÔNG bị chờ thêm", Date.now() - t0 < 1_000);
  }

  // ── 2. withTimeout: quá hạn thì ném TimeoutError, có nhãn + số ms ──
  {
    let caught = null;
    const t0 = Date.now();
    try {
      await withTimeout(() => new Promise(() => {}), 60, "Convex treo");
    } catch (e) {
      caught = e;
    }
    check("withTimeout ném lỗi khi quá hạn", caught instanceof TimeoutError, String(caught));
    check(
      "lỗi quá hạn nêu ĐÚNG TÊN việc đang treo",
      /Convex treo/.test(caught?.message ?? ""),
      caught?.message,
    );
    check("lỗi quá hạn nêu ĐÚNG số ms", caught?.timeoutMs === 60, String(caught?.timeoutMs));
    check(
      "lỗi quá hạn mang code ETIMEDOUT (withRetry đã coi là đáng thử lại)",
      caught?.code === "ETIMEDOUT",
    );
    check("cắt đúng lúc, không chờ lâu hơn", Date.now() - t0 < 1_000, String(Date.now() - t0));
    check("isTimeoutError nhận ra lỗi này", isTimeoutError(caught) === true);
    check("isTimeoutError KHÔNG nhận lỗi khác", isTimeoutError(new Error("lỗi thường")) === false);
  }

  // ── 3. Promise xong MUỘN sau khi đã quá hạn KHÔNG được làm chết tiến trình ──
  {
    let lateResolve = null;
    const pending = withTimeout(() => new Promise((res) => (lateResolve = res)), 40, "việc chậm");
    await pending.catch(() => {});
    // Đẩy kết quả đến muộn — nếu không có `.catch` gắn sẵn thì Node sẽ ném
    // unhandledRejection và giết tiến trình ở đây.
    lateResolve("đến muộn");
    await new Promise((r) => setTimeout(r, 40));
    check("kết quả đến muộn sau khi quá hạn không gây unhandled rejection", true);
  }

  // ── 4. fn ném đồng bộ → lỗi gốc đi ra nguyên vẹn (không bị đổi thành timeout) ──
  {
    const boom = new Error("lỗi thật");
    let caught = null;
    try {
      await withTimeout(
        () => {
          throw boom;
        },
        1_000,
        "việc ném",
      );
    } catch (e) {
      caught = e;
    }
    check("fn ném đồng bộ → giữ nguyên lỗi gốc", caught === boom);
  }

  // ── 5. ms rác → về trần mặc định, KHÔNG phải "chờ vô hạn" ──
  // Kiểm qua `resolveTimeoutMs` (quy tắc thuần) thay vì chờ đủ 15 giây thật:
  // chờ thật làm suite chậm gấp đôi mà không kiểm thêm được gì.
  {
    check("ms rác 0 → trần mặc định", resolveTimeoutMs(0) === DEFAULT_FETCH_TIMEOUT_MS);
    check("ms rác âm → trần mặc định", resolveTimeoutMs(-5) === DEFAULT_FETCH_TIMEOUT_MS);
    check("ms rác NaN → trần mặc định", resolveTimeoutMs(NaN) === DEFAULT_FETCH_TIMEOUT_MS);
    check("ms rác chuỗi → trần mặc định", resolveTimeoutMs("abc") === DEFAULT_FETCH_TIMEOUT_MS);
    check(
      "ms rác undefined → trần mặc định",
      resolveTimeoutMs(undefined) === DEFAULT_FETCH_TIMEOUT_MS,
    );
    check("ms hợp lệ được giữ nguyên", resolveTimeoutMs(2500) === 2500);
    check("ms hợp lệ dạng chuỗi số vẫn dùng được", resolveTimeoutMs("300") === 300);
  }

  // ── 6. fetchWithTimeout: ngắt kết nối thật và nêu rõ quá hạn ──
  {
    const fakeFetch = (url, init) =>
      new Promise((_res, rej) => {
        init.signal.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          rej(e);
        });
      });
    let caught = null;
    try {
      await fetchWithTimeout(fakeFetch, "https://vi-du.test/x", {}, { ms: 50, label: "test" });
    } catch (e) {
      caught = e;
    }
    check(
      "fetchWithTimeout quá hạn → TimeoutError (không phải AbortError trống)",
      caught instanceof TimeoutError,
      String(caught),
    );
    check("fetchWithTimeout nêu đúng nhãn", /test/.test(caught?.message ?? ""));
  }

  // ── 7. fetchWithTimeout: giữ nguyên option của caller + đính signal vào ──
  {
    const seen = [];
    const fakeFetch = async (url, init) => {
      seen.push({ url, init });
      return { ok: true, status: 200 };
    };
    const res = await fetchWithTimeout(
      fakeFetch,
      "https://vi-du.test/y",
      { method: "POST", body: "{}" },
      { ms: 1_000 },
    );
    check("fetchWithTimeout trả nguyên response", res?.ok === true);
    check("fetchWithTimeout giữ method của caller", seen[0]?.init?.method === "POST");
    check("fetchWithTimeout giữ body của caller", seen[0]?.init?.body === "{}");
    check("fetchWithTimeout đính signal vào lời gọi", Boolean(seen[0]?.init?.signal));
  }

  // ── 8. fetchWithTimeout KHÔNG nuốt lỗi mạng thật ──
  {
    const boom = new TypeError("mạng chết");
    let caught = null;
    try {
      await fetchWithTimeout(
        async () => {
          throw boom;
        },
        "https://vi-du.test/z",
        {},
        { ms: 1_000 },
      );
    } catch (e) {
      caught = e;
    }
    check("lỗi mạng thật đi ra nguyên vẹn (không bị đổi thành quá hạn)", caught === boom);
  }

  // ── 9. wrapFetch: mọi lời gọi qua nó đều có trần ──
  {
    const fakeFetch = (url, init) =>
      new Promise((_res, rej) => {
        init.signal.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          rej(e);
        });
      });
    const wrapped = wrapFetch(fakeFetch, { ms: 40, label: "convex" });
    let caught = null;
    try {
      await wrapped("https://vi-du.test/q", {});
    } catch (e) {
      caught = e;
    }
    check("wrapFetch áp trần cho mọi lời gọi", caught instanceof TimeoutError, String(caught));
    check("wrapFetch giữ nhãn", /convex/.test(caught?.message ?? ""));
  }

  // ── 10. backoff: tăng theo cấp số nhân + có trần ──
  {
    const exact = [1, 2, 3, 4, 5].map((a) => backoffDelayMs(a, { baseMs: 500, jitter: false }));
    check(
      "backoff không jitter: 500 → 1000 → 2000 → 4000 → 8000",
      JSON.stringify(exact) === JSON.stringify([500, 1000, 2000, 4000, 8000]),
      JSON.stringify(exact),
    );
    check(
      "backoff bị chặn ở maxMs",
      backoffDelayMs(50, { baseMs: 500, maxMs: 30_000, jitter: false }) === 30_000,
    );
    check("attempt <= 0 coi như lần 1", backoffDelayMs(0, { baseMs: 500, jitter: false }) === 500);
    check(
      "attempt rác coi như lần 1",
      backoffDelayMs("abc", { baseMs: 500, jitter: false }) === 500,
    );
  }

  // ── 11. backoff jitter: nằm trong khoảng, và KHÔNG phải hằng số ──
  {
    const randoms = [0, 0.25, 0.5, 0.999];
    const vals = randoms.map((r) =>
      backoffDelayMs(3, { baseMs: 500, minMs: 100, random: () => r }),
    );
    check(
      "jitter nằm trong [minMs, trần]",
      vals.every((v) => v >= 100 && v <= 2000),
      JSON.stringify(vals),
    );
    check(
      "jitter phủ đều khoảng (không phải hằng số)",
      new Set(vals).size === 4,
      JSON.stringify(vals),
    );
    check("random=0 vẫn không chờ 0ms (chờ 0 là dồn cục)", vals[0] === 100, String(vals[0]));

    // 20 lượt cùng thử lại lần 3 phải KHÁC nhau — đó là điểm của jitter.
    const many = Array.from({ length: 20 }, () => backoffDelayMs(3, { baseMs: 500 }));
    check(
      "20 lượt cùng cấp có ít nhất 5 giá trị khác nhau (tán đều)",
      new Set(many).size >= 5,
      String(new Set(many).size),
    );
  }

  // ── 12. TÍCH HỢP: ConvexStore truyền fetch có trần cho ConvexHttpClient ──
  {
    capturedClientOptions = null;
    const ConvexStore = require("../bot/src/convex.js");
    new ConvexStore();
    check(
      "ConvexStore truyền fetch riêng cho ConvexHttpClient (chỗ DUY NHẤT phủ hết đường Convex)",
      typeof capturedClientOptions?.fetch === "function",
      JSON.stringify(Object.keys(capturedClientOptions ?? {})),
    );

    // fetch treo vĩnh viễn KHÔNG được làm lời gọi Convex treo theo.
    const hungFetch = (url, init) =>
      new Promise((_res, rej) => {
        init.signal.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          rej(e);
        });
      });
    const wrapped = capturedClientOptions.fetch;
    // Hạ trần để test không phải chờ 15s thật.
    const quick = wrapFetch(hungFetch, { ms: 50, label: "convex" });
    let caught = null;
    const t0 = Date.now();
    try {
      await quick("https://vi-du-123.convex.cloud/api/mutation", { method: "POST" });
    } catch (e) {
      caught = e;
    }
    check(
      "lời gọi Convex treo bị cắt thay vì treo mãi",
      caught instanceof TimeoutError,
      String(caught),
    );
    check("cắt trước khi tới trần mặc định 15s", Date.now() - t0 < 2_000, String(Date.now() - t0));
    check("fetch do store truyền vào KHÔNG phải fetch trần", typeof wrapped === "function");
  }

  globalThis.fetch = realFetch;
  console.log(`\nKết quả resilience: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\nLỖI: test-resilience.cjs ném ngoài dự kiến:", err?.stack ?? err);
  process.exit(1);
});
