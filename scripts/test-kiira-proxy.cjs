#!/usr/bin/env node
/**
 * test-kiira-proxy.cjs — kiểm tra retry proxy chống chập chờn Kiira.
 *
 * Bối cảnh: gateway Kiira đôi lúc trả 5xx/429 hoặc rớt kết nối thoáng qua →
 * OpenCode báo "AI service stream failed" và ngắt phiên giữa chừng. OpenCode
 * không có retry tích hợp → repo thêm proxy nội bộ (scripts/kiira-retry-proxy.mjs)
 * đứng giữa OpenCode và Kiira, tự thử lại lỗi tạm thời với backoff.
 *
 * Suite này kiểm tra 2 lớp, KHÔNG cần mạng và KHÔNG gọi Kiira thật:
 *   1. Thử lại thật sự qua proxy chạy cục bộ:
 *      - 503→200 phải tự retry; 500 liên tục → hết N lượt; 401 → chuyển thẳng.
 *      - POST (đúng /chat/completions của OpenCode) 503→200 retry được và body
 *        gửi lên nguyên vẹn — chặn "Body already used".
 *      - TĂNG CƯỜNG 19/09/2026:
 *        + Chờ byte đầu (first-byte) cắt sớm khi upstream treo header, thay vì
 *          đứng im hết timeout 120s mỗi lượt.
 *        + Idle watchdog cắt stream im lặng quá lâu giữa 2 chunk.
 *        + Ngân sách tổng chặn retry cộng dồn thành phiên treo vô tận.
 *        + Ngắt mạch bán mở: lỗi liên tiếp → tạm chặn nhanh, rồi một thăm dò.
 *   2. Khóa hình thức file: KHÔNG log/ghi Authorization, lắng nghe 127.0.0.1,
 *      danh sách retryable có 429/5xx, body đọc 1 lần, tôn trọng Retry-After,
 *      trần backoff, có các cơ chế tăng cường.
 */

const { spawn } = require("child_process");
const http = require("http");
const net = require("net");
const path = require("path");
const fs = require("fs");

const PROXY_SCRIPT = path.join(__dirname, "kiira-retry-proxy.mjs");
const BUN_BIN =
  process.env.BUN_BIN ||
  ["/usr/local/bun/bin/bun", "/usr/local/bin/bun", "/usr/bin/bun"].find((candidate) =>
    fs.existsSync(candidate),
  ) ||
  "bun";
// Cổng test lấy ĐỘNG từ OS thay vì cố định 8791: từng có proxy cũ còn giữ cổng
// sau một lượt chạy bị kill, khiến suite đỏ giả (health 200 từ proxy lạ, hits=undefined).
let PORT = Number(process.env.KIIRA_TEST_PORT) || 0;

let pass = 0;
let fail = 0;
function check(label, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`PASS ${label}${extra ? " — " + extra : ""}`);
  } else {
    fail++;
    console.error(`FAIL ${label}${extra ? " — " + extra : ""}`);
  }
}

function waitForPort(port, timeoutMs = 8000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    (function probe() {
      const req = http.get({ host: "127.0.0.1", port, path: "/__health", timeout: 500 }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) return reject(new Error("proxy không lên được"));
        setTimeout(probe, 150);
      });
      req.on("timeout", () => req.destroy());
    })();
  });
}

function request(port, reqPath, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: reqPath,
        method,
        headers: { authorization: "Bearer test-secret" },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function postJson(port, reqPath, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: reqPath,
        method: "POST",
        headers: {
          authorization: "Bearer test-secret",
          "content-type": "application/json",
          "content-length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on("error", reject);
    req.end(data);
  });
}

/** Upstream giả: trả `statuses` tuần tự theo MỖI path, đếm số lượt gọi, lưu body nhận được. */
function startMockUpstream(statuses) {
  const hits = {};
  const bodies = {};
  const server = http.createServer((req, res) => {
    hits[req.url] = (hits[req.url] ?? 0) + 1;
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      bodies[req.url] = raw;
      const status = statuses[Math.min(hits[req.url] - 1, statuses.length - 1)];
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ mock: true, status, hit: hits[req.url], gotBody: raw }));
    });
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, hits, bodies, port: server.address().port }),
    ),
  );
}

/** Upstream giả tùy biến: handler(req, res) tự quyết định phản hồi. */
function startRawUpstream(handler) {
  const hits = {};
  const server = http.createServer((req, res) => {
    hits[req.url] = (hits[req.url] ?? 0) + 1;
    req.on("data", () => {});
    req.on("end", () => handler(req, res, hits[req.url]));
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve({ server, hits, port: server.address().port })),
  );
}

function stopServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

/** Xin OS một cổng trống (bind :0 rồi nhả) — tránh đụng cổng cố định còn proxy cũ. */
function pickFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function startProxy(upstream, extraEnv = {}) {
  return spawn(BUN_BIN, [PROXY_SCRIPT], {
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      KIRA_PROXY_PORT: String(PORT),
      KIRA_UPSTREAM: upstream,
      KIRA_PROXY_RETRIES: "2",
      KIRA_PROXY_TIMEOUT_MS: "4000",
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

(async () => {
  if (!PORT) PORT = await pickFreePort();
  const src = fs.readFileSync(PROXY_SCRIPT, "utf8");

  // ─── 1. Hành vi thử lại thật sự ─────────────────────────────────────────
  // 1a. 503 rồi 200 → client phải nhận 200 nhờ retry.
  {
    const mock = await startMockUpstream([503, 200]);
    const proxy = startProxy(`http://127.0.0.1:${mock.port}`);
    try {
      check("proxy khởi động (health 200)", (await waitForPort(PORT)) === 200);
      const res = await request(PORT, "/chat/completions");
      check("503 tạm thời → tự thử lại → client nhận 200", res.status === 200);
      check(
        "upstream bị gọi đúng 2 lần (1 lỗi + 1 thành công)",
        mock.hits["/chat/completions"] === 2,
      );
    } finally {
      proxy.kill();
      await stopServer(mock.server);
    }
  }

  // 1b. Luôn 500 → hết 3 lượt gọi (1 + 2 retry) → client nhận 500.
  {
    const mock = await startMockUpstream([500]);
    const proxy = startProxy(`http://127.0.0.1:${mock.port}`);
    try {
      await waitForPort(PORT);
      const res = await request(PORT, "/chat/completions");
      check("500 liên tục → client nhận 500 sau khi hết lượt thử", res.status === 500);
      check("đúng 3 lượt gọi upstream (1 + 2 retry)", mock.hits["/chat/completions"] === 3);
    } finally {
      proxy.kill();
      await stopServer(mock.server);
    }
  }

  // 1c. 401 sai key = lỗi cứng → chuyển thẳng, KHÔNG thử lại.
  {
    const mock = await startMockUpstream([401]);
    const proxy = startProxy(`http://127.0.0.1:${mock.port}`);
    try {
      await waitForPort(PORT);
      const res = await request(PORT, "/chat/completions");
      check("401 lỗi cứng → trả ngay, không retry", res.status === 401);
      check("401 chỉ gọi upstream đúng 1 lần", mock.hits["/chat/completions"] === 1);
    } finally {
      proxy.kill();
      await stopServer(mock.server);
    }
  }

  // 1d. POST 503→200 (đúng /chat/completions của OpenCode) → retry thành công,
  //     body gửi lên NGUYÊN VẸN. Chặn tái diễn "Body already used".
  {
    const mock = await startMockUpstream([503, 200]);
    const proxy = startProxy(`http://127.0.0.1:${mock.port}`);
    try {
      await waitForPort(PORT);
      const payload = {
        model: "kiira",
        messages: [{ role: "user", content: "xin chào" }],
        stream: true,
      };
      const res = await postJson(PORT, "/chat/completions", payload);
      check("POST 503→200: proxy tự thử lại → client nhận 200", res.status === 200);
      check(
        "POST bị gọi upstream đúng 2 lần (1 lỗi + 1 thành công)",
        mock.hits["/chat/completions"] === 2,
      );
      check(
        "body POST gửi lên upstream nguyên vẹn qua lần retry",
        mock.bodies["/chat/completions"] === JSON.stringify(payload),
      );
    } finally {
      proxy.kill();
      await stopServer(mock.server);
    }
  }

  // ─── 1d2. Mã Cloudflare 520/529 phải được coi là chập chờn → retry ──────────
  {
    const mock = await startRawUpstream((req, res, hit) => {
      if (hit === 1) {
        res.writeHead(520, { "content-type": "text/html" });
        res.end("<html>cloudflare 520</html>");
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"ok":true}');
    });
    const proxy = startProxy(`http://127.0.0.1:${mock.port}`, {
      KIRA_PROXY_RETRIES: "3",
      KIRA_PROXY_MAX_BACKOFF_MS: "50",
    });
    try {
      await waitForPort(PORT);
      const res = await request(PORT, "/chat/completions");
      check(
        "Cloudflare 520 → tự retry → client nhận 200",
        res.status === 200,
        `status=${res.status}`,
      );
      check(
        "520 gọi upstream 2 lần",
        mock.hits["/chat/completions"] === 2,
        `hits=${mock.hits["/chat/completions"]}`,
      );
    } finally {
      proxy.kill();
      await stopServer(mock.server);
    }
  }

  // ─── 1d3. Lỗi cứng vẫn trả nguyên vẹn body cho client (peekError dùng clone) ─
  {
    const errBody = JSON.stringify({ error: { message: "sai key", code: "bad_key" } });
    const mock = await startRawUpstream((req, res) => {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(errBody);
    });
    const proxy = startProxy(`http://127.0.0.1:${mock.port}`, { KIRA_PROXY_RETRIES: "2" });
    try {
      await waitForPort(PORT);
      const res = await request(PORT, "/chat/completions");
      check(
        "401 trả nguyên vẹn body dù proxy đã đọc chẩn đoán",
        res.status === 401 && res.body === errBody,
        JSON.stringify(res.body),
      );
    } finally {
      proxy.kill();
      await stopServer(mock.server);
    }
  }

  // ─── 1d4. GỐC RỄ 19/09: Kiira trả 404 kèm provider_error (lỗi tạm thời) ─────
  {
    // Quan sát thật: 404 {"error":{...,"code":"provider_error"}} — nếu coi 404 là
    // lỗi cứng thì client nhận đúng "AI service stream failed" dù còn dư lượt.
    const mock = await startRawUpstream((req, res, hit) => {
      if (hit === 1) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            error: {
              message:
                "AI service stream failed: The AI model service is temporarily unavailable. Please try again shortly.",
              type: "api_error",
              code: "provider_error",
            },
          }),
        );
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"ok":true}');
    });
    const proxy = startProxy(`http://127.0.0.1:${mock.port}`, {
      KIRA_PROXY_RETRIES: "3",
      KIRA_PROXY_MAX_BACKOFF_MS: "50",
    });
    try {
      await waitForPort(PORT);
      const res = await request(PORT, "/chat/completions");
      check(
        "404 kèm provider_error → retry → client nhận 200 (hết 'stream failed')",
        res.status === 200,
        `status=${res.status}, body=${JSON.stringify(res.body)}`,
      );
      check(
        "đã gọi upstream 2 lần cho 404 tạm thời",
        mock.hits["/chat/completions"] === 2,
        `hits=${mock.hits["/chat/completions"]}`,
      );
    } finally {
      proxy.kill();
      await stopServer(mock.server);
    }
  }

  // ─── 1d5. 404 thật (không phải provider_error) KHÔNG retry, body nguyên vẹn ─
  {
    const errBody = JSON.stringify({
      error: { message: "model không tồn tại", code: "not_found" },
    });
    const mock = await startRawUpstream((req, res) => {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(errBody);
    });
    const proxy = startProxy(`http://127.0.0.1:${mock.port}`, {
      KIRA_PROXY_RETRIES: "3",
      KIRA_PROXY_MAX_BACKOFF_MS: "50",
    });
    try {
      await waitForPort(PORT);
      const res = await request(PORT, "/chat/completions");
      check(
        "404 thật (not_found) → trả ngay, không retry",
        res.status === 404 && res.body === errBody,
      );
      check(
        "chỉ gọi upstream 1 lần",
        mock.hits["/chat/completions"] === 1,
        `hits=${mock.hits["/chat/completions"]}`,
      );
    } finally {
      proxy.kill();
      await stopServer(mock.server);
    }
  }

  // ─── 1e. First-byte timeout: upstream treo header → cắt sớm, không đứng im ─
  {
    // Upstream nhận kết nối nhưng chỉ trả sau 5s; proxy chờ byte đầu 400ms.
    const mock = await startRawUpstream((req, res) =>
      setTimeout(() => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end('{"late":true}');
      }, 5000),
    );
    const proxy = startProxy(`http://127.0.0.1:${mock.port}`, {
      KIRA_PROXY_RETRIES: "2",
      KIRA_PROXY_FIRST_BYTE_MS: "400",
      KIRA_PROXY_TIMEOUT_MS: "10000",
      KIRA_PROXY_MAX_BACKOFF_MS: "50",
    });
    try {
      await waitForPort(PORT);
      const t0 = Date.now();
      const res = await request(PORT, "/chat/completions");
      const dt = Date.now() - t0;
      check(
        "upstream treo header → proxy cắt theo first-byte rồi trả 502",
        res.status === 502,
        `${dt}ms`,
      );
      check("cắt sớm (không đứng im hết timeout 10s)", dt < 3000, `${dt}ms`);
      check(
        "đã thử lại đủ 3 lượt trước khi bỏ",
        mock.hits["/chat/completions"] === 3,
        `hits=${mock.hits["/chat/completions"]}`,
      );
    } finally {
      proxy.kill();
      await stopServer(mock.server);
    }
  }

  // ─── 1f. Idle watchdog giữa stream: gửi 1 chunk rồi im → proxy đóng sạch ───
  {
    const mock = await startRawUpstream((req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.flushHeaders();
      res.write('data: {"delta":"xin"}\n\n');
      // rồi im lặng mãi mãi, không end()
    });
    const proxy = startProxy(`http://127.0.0.1:${mock.port}`, {
      KIRA_PROXY_RETRIES: "0",
      KIRA_PROXY_IDLE_MS: "400",
      KIRA_PROXY_TIMEOUT_MS: "10000",
    });
    try {
      await waitForPort(PORT);
      const outcome = await new Promise((resolve) => {
        const req = http.request(
          {
            host: "127.0.0.1",
            port: PORT,
            path: "/chat/completions",
            method: "POST",
            headers: { authorization: "Bearer t", "content-type": "application/json" },
          },
          (res) => {
            let got = "";
            res.on("data", (c) => (got += c));
            const done = (how) => resolve({ how, got });
            res.on("end", () => done("end"));
            res.on("aborted", () => done("aborted"));
            res.on("error", () => done("error"));
          },
        );
        req.on("error", () => resolve({ how: "req-error", got: "" }));
        req.end("{}");
        setTimeout(() => resolve({ how: "treo", got: "" }), 3000);
      });
      check(
        "stream im lặng giữa chừng → proxy đóng sạch, client không bị treo",
        outcome.how === "end",
        outcome.how,
      );
      check(
        "chunk đầu vẫn tới client trước khi bị đóng",
        outcome.got.includes('"xin"'),
        JSON.stringify(outcome.got),
      );
    } finally {
      proxy.kill();
      await stopServer(mock.server);
    }
  }

  // ─── 1f2. Im lặng TRƯỚC chunk đầu (ca "kẹt" thật) → hủy lượt và thử lại ────
  {
    // Lần 1: flush header rồi treo; lần 2: trả dữ liệu đầy đủ.
    const mock = await startRawUpstream((req, res, hit) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.flushHeaders();
      if (hit === 1) return; // im lặng trước chunk đầu
      res.write('data: {"delta":"lan2"}\n\n');
      res.end("data: [DONE]\n\n");
    });
    const proxy = startProxy(`http://127.0.0.1:${mock.port}`, {
      KIRA_PROXY_RETRIES: "3",
      KIRA_PROXY_IDLE_MS: "400",
      KIRA_PROXY_TIMEOUT_MS: "10000",
      KIRA_PROXY_MAX_BACKOFF_MS: "50",
    });
    try {
      await waitForPort(PORT);
      const res = await request(PORT, "/chat/completions");
      check(
        "im lặng trước chunk đầu → hủy lượt, thử lại, client nhận 200",
        res.status === 200,
        `status=${res.status}`,
      );
      check("client nhận dữ liệu lượt 2", res.body.includes("lan2"), JSON.stringify(res.body));
      check(
        "đã gọi upstream đúng 2 lần",
        mock.hits["/chat/completions"] === 2,
        `hits=${mock.hits["/chat/completions"]}`,
      );
    } finally {
      proxy.kill();
      await stopServer(mock.server);
    }
  }

  // ─── 1f2b. HTTP 200 nhưng thân báo lỗi (lỗi ẩn trong SSE) → thử lại ─────────
  {
    // Lần 1: 200 kèm event lỗi; lần 2: dữ liệu thật. Không bắt ca này thì client
    // nhận "stream failed" mà proxy không hề retry (lỗi hay gặp trên Kiira).
    const mock = await startRawUpstream((req, res, hit) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.flushHeaders();
      if (hit === 1) {
        res.write(
          'data: {"error":{"message":"The AI model service is temporarily unavailable"}}\n\n',
        );
        res.end();
        return;
      }
      res.write('data: {"delta":"lan2"}\n\n');
      res.end("data: [DONE]\n\n");
    });
    const proxy = startProxy(`http://127.0.0.1:${mock.port}`, {
      KIRA_PROXY_RETRIES: "3",
      KIRA_PROXY_MAX_BACKOFF_MS: "50",
    });
    try {
      await waitForPort(PORT);
      const res = await request(PORT, "/chat/completions");
      check(
        "200 kèm thân báo lỗi → proxy thử lại, client nhận dữ liệu lượt 2",
        res.status === 200 && res.body.includes("lan2"),
        `status=${res.status}, body=${JSON.stringify(res.body)}`,
      );
      check(
        "đã gọi upstream đúng 2 lần (1 lỗi ẩn + 1 thành công)",
        mock.hits["/chat/completions"] === 2,
        `hits=${mock.hits["/chat/completions"]}`,
      );
    } finally {
      proxy.kill();
      await stopServer(mock.server);
    }
  }

  // ─── 1f2c. Upstream RỚT GIỮA STREAM (sau chunk đầu) → proxy đóng SẠCH ───────
  {
    // Bug thật: `continueStream` gọi reader.read() mà không bắt reject. Khi
    // upstream reset socket giữa stream, promise reject → pull() ném ra ngoài →
    // ReadableStream chuyển sang errored state → client nhận "terminated" đột
    // ngột thay vì kết thúc êm (OpenCode báo "AI service stream failed").
    // Kỳ vọng: client nhận "end" (đóng sạch) và giữ được chunk đã tới.
    const mock = await startRawUpstream((req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.flushHeaders();
      res.write('data: {"delta":"xin chao"}\n\n');
      setTimeout(() => req.socket.destroy(), 200); // reset giữa stream
    });
    const proxy = startProxy(`http://127.0.0.1:${mock.port}`, {
      KIRA_PROXY_RETRIES: "2",
      KIRA_PROXY_IDLE_MS: "5000",
      KIRA_PROXY_TIMEOUT_MS: "10000",
    });
    try {
      await waitForPort(PORT);
      const outcome = await new Promise((resolve) => {
        const req = http.request(
          {
            host: "127.0.0.1",
            port: PORT,
            path: "/chat/completions",
            method: "POST",
            headers: { authorization: "Bearer t", "content-type": "application/json" },
          },
          (res) => {
            let got = "";
            res.on("data", (c) => (got += c));
            res.on("end", () => resolve({ how: "end", got }));
            res.on("aborted", () => resolve({ how: "aborted", got }));
            res.on("error", (e) => resolve({ how: "error:" + e.message, got }));
          },
        );
        req.on("error", (e) => resolve({ how: "req-error:" + e.message, got: "" }));
        req.end("{}");
        setTimeout(() => resolve({ how: "treo", got: "" }), 5000);
      });
      check(
        "upstream rớt giữa stream → client đóng SẠCH (không 'terminated' đột ngột)",
        outcome.how === "end",
        outcome.how,
      );
      check(
        "chunk đã nhận trước khi rớt vẫn tới client",
        outcome.got.includes("xin chao"),
        JSON.stringify(outcome.got),
      );
    } finally {
      proxy.kill();
      await stopServer(mock.server);
    }
  }

  // ─── 1f2d. Upstream reset TRƯỚC chunk đầu → phải retry (chưa gửi byte nào) ──
  {
    // Lần 1: gửi header rồi phá socket ngay (chưa có chunk). Lần 2: dữ liệu đầy đủ.
    // Vì chưa byte nào tới client nên proxy AN TOÀN thử lại.
    const mock = await startRawUpstream((req, res, hit) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.flushHeaders();
      if (hit === 1) {
        setTimeout(() => req.socket.destroy(), 100);
        return;
      }
      res.write('data: {"delta":"lan2"}\n\n');
      res.end("data: [DONE]\n\n");
    });
    const proxy = startProxy(`http://127.0.0.1:${mock.port}`, {
      KIRA_PROXY_RETRIES: "3",
      KIRA_PROXY_IDLE_MS: "5000",
      KIRA_PROXY_TIMEOUT_MS: "10000",
      KIRA_PROXY_MAX_BACKOFF_MS: "50",
    });
    try {
      await waitForPort(PORT);
      const res = await request(PORT, "/chat/completions");
      check(
        "reset trước chunk đầu → thử lại, client nhận dữ liệu lượt 2",
        res.status === 200 && res.body.includes("lan2"),
        `status=${res.status}, body=${JSON.stringify(res.body)}`,
      );
      check(
        "đã gọi upstream đúng 2 lần",
        mock.hits["/chat/completions"] === 2,
        `hits=${mock.hits["/chat/completions"]}`,
      );
    } finally {
      proxy.kill();
      await stopServer(mock.server);
    }
  }

  // ─── 1f3. Stream chảy dài hơn first-byte KHÔNG bị cắt oan ───────────────────
  {
    // first-byte 300ms, nhưng stream gửi chunk đều trong ~1.5s → phải nhận đủ.
    const mock = await startRawUpstream((req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.flushHeaders();
      let n = 0;
      const iv = setInterval(() => {
        n++;
        res.write(`data: {"n":${n}}\n\n`);
        if (n === 5) {
          clearInterval(iv);
          res.end("data: [DONE]\n\n");
        }
      }, 250);
    });
    const proxy = startProxy(`http://127.0.0.1:${mock.port}`, {
      KIRA_PROXY_RETRIES: "0",
      KIRA_PROXY_FIRST_BYTE_MS: "300",
      KIRA_PROXY_IDLE_MS: "2000",
      KIRA_PROXY_TIMEOUT_MS: "10000",
    });
    try {
      await waitForPort(PORT);
      const t0 = Date.now();
      const res = await request(PORT, "/chat/completions");
      const dt = Date.now() - t0;
      check(
        "stream dài hơn first-byte vẫn nhận đủ (không cắt oan)",
        res.status === 200 && res.body.includes("[DONE]"),
        `status=${res.status}, ${dt}ms`,
      );
      check(
        "nhận đủ 5 chunk",
        (res.body.match(/"n":/g) || []).length === 5,
        JSON.stringify(res.body),
      );
    } finally {
      proxy.kill();
      await stopServer(mock.server);
    }
  }

  // ─── 1f4. Nội dung model chứa "500"/"error" KHÔNG bị retry nhầm ─────────────
  {
    const mock = await startRawUpstream((req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.flushHeaders();
      res.write('data: {"delta":"Mã lỗi HTTP 500 và error là chủ đề ta đang bàn"}\n\n');
      res.end("data: [DONE]\n\n");
    });
    const proxy = startProxy(`http://127.0.0.1:${mock.port}`, {
      KIRA_PROXY_RETRIES: "3",
      KIRA_PROXY_MAX_BACKOFF_MS: "50",
    });
    try {
      await waitForPort(PORT);
      const res = await request(PORT, "/chat/completions");
      check(
        "nội dung có chữ '500'/'error' không bị retry nhầm",
        res.status === 200 && res.body.includes("chủ đề"),
        `status=${res.status}`,
      );
      check(
        "chỉ gọi upstream 1 lần (không retry oan)",
        mock.hits["/chat/completions"] === 1,
        `hits=${mock.hits["/chat/completions"]}`,
      );
    } finally {
      proxy.kill();
      await stopServer(mock.server);
    }
  }

  // ─── 1g. Ngân sách tổng: upstream treo hết → dừng theo budget, không vô tận ─
  {
    const mock = await startRawUpstream(() => {
      /* nhận kết nối, không bao giờ trả lời */
    });
    const proxy = startProxy(`http://127.0.0.1:${mock.port}`, {
      KIRA_PROXY_RETRIES: "20",
      KIRA_PROXY_FIRST_BYTE_MS: "30000",
      KIRA_PROXY_TOTAL_BUDGET_MS: "800",
      KIRA_PROXY_MAX_BACKOFF_MS: "50",
    });
    try {
      await waitForPort(PORT);
      const t0 = Date.now();
      const res = await request(PORT, "/chat/completions");
      const dt = Date.now() - t0;
      check(
        "hết ngân sách tổng → trả 502 (không retry 20 lần × 30s)",
        res.status === 502,
        `${dt}ms`,
      );
      check("dừng đúng gần ngân sách 800ms", dt < 2000, `${dt}ms`);
    } finally {
      proxy.kill();
      await stopServer(mock.server);
    }
  }

  // ─── 1h. Ngắt mạch MỀM: lỗi liên tiếp KHÔNG bao giờ chặn request ────────────
  {
    // Bài học 19/09: ngắt mạch cứng trả 503 hàng loạt khi upstream nghẽn — chính
    // nó gây "service unavailable". Bản mềm chỉ giảm lượt thử, không chặn.
    let mode = 500; // đổi sang 200 để kiểm tra hồi phục
    const mock = await startRawUpstream((req, res) => {
      res.writeHead(mode, { "content-type": "application/json" });
      res.end(JSON.stringify({ mode }));
    });
    const proxy = startProxy(`http://127.0.0.1:${mock.port}`, {
      KIRA_PROXY_RETRIES: "0", // mỗi request 1 lượt → đếm thất bại rõ ràng
      KIRA_PROXY_BREAKER_THRESHOLD: "2",
      KIRA_PROXY_BREAKER_MS: "1200",
    });
    try {
      await waitForPort(PORT);
      const r1 = await request(PORT, "/chat/completions");
      const r2 = await request(PORT, "/chat/completions");
      const r3 = await request(PORT, "/chat/completions");
      check(
        "lỗi liên tiếp → request vẫn được phục vụ, KHÔNG bị chặn 503",
        r1.status === 500 && r2.status === 500 && r3.status === 500,
        `${r1.status}/${r2.status}/${r3.status}`,
      );
      await new Promise((r) => setTimeout(r, 1400));
      mode = 200; // hồi phục
      const r4 = await request(PORT, "/chat/completions");
      check(
        "upstream hồi phục → request nhận 200 bình thường",
        r4.status === 200,
        `status=${r4.status}`,
      );
    } finally {
      proxy.kill();
      await stopServer(mock.server);
    }
  }

  // ─── 1h2. Ngắt mạch mềm thực sự giảm lượt thử khi upstream lỗi liên tiếp ────
  {
    // Upstream luôn 500. RETRIES=6 → mỗi request 7 lượt. Sau ngưỡng, lượt thử
    // giảm còn ~3 → số hits/request giảm hẳn (đỡ dội tải) nhưng vẫn phục vụ.
    let hits = 0;
    const mock = await startRawUpstream((req, res) => {
      hits++;
      res.writeHead(500, { "content-type": "application/json" });
      res.end("{}");
    });
    const proxy = startProxy(`http://127.0.0.1:${mock.port}`, {
      KIRA_PROXY_RETRIES: "6",
      KIRA_PROXY_BREAKER_THRESHOLD: "1",
      KIRA_PROXY_BREAKER_MS: "60000",
      KIRA_PROXY_MAX_BACKOFF_MS: "30",
    });
    try {
      await waitForPort(PORT);
      await request(PORT, "/chat/completions"); // request đầu: 7 lượt, mở mềm
      const hitsAfterFirst = hits;
      const res2 = await request(PORT, "/chat/completions"); // request sau: ít lượt
      const hitsSecond = hits - hitsAfterFirst;
      check("request đầu thử đủ 7 lượt", hitsAfterFirst === 7, `hits=${hitsAfterFirst}`);
      check(
        "request sau (đang nghỉ mềm) thử ít hơn để đỡ dội tải",
        hitsSecond > 0 && hitsSecond < 7,
        `hits=${hitsSecond}`,
      );
      check("vẫn phục vụ chứ không trả 503", res2.status === 500, `status=${res2.status}`);
    } finally {
      proxy.kill();
      await stopServer(mock.server);
    }
  }

  // ─── 2. Khóa hình thức: an toàn secret + cấu hình đúng ──────────────────
  // Chỉ được log header PHẢN HỒI không nhạy cảm (content-type). Cấm log header
  // request/authorization (chứa secret) dưới mọi hình thức.
  check(
    "KHÔNG log Authorization/header request (secret không lọt qua log)",
    !/console\.(log|error|info)\([^)]*authorization/i.test(src) &&
      !/console\.(log|error|info)\([^)]*req\.headers/i.test(src) &&
      !/JSON\.stringify\([^)]*headers/i.test(src),
  );
  check(
    "chẩn đoán chỉ log content-type của phản hồi (không log giá trị header nhạy cảm)",
    !/console\.(log|error|info)\([^)]*res\.headers\.get\(["'](?!content-type)/i.test(src),
  );
  check(
    "chỉ chuyển tiếp header an toàn (authorization/content-type/accept/user-agent)",
    src.includes('PASS_HEADERS = ["authorization", "content-type", "accept", "user-agent"]'),
  );
  check("lắng nghe 127.0.0.1 — không lộ proxy ra internet", src.includes('hostname: "127.0.0.1"'));
  check(
    "danh sách retryable gồm 408 + 429 + 5xx chuẩn + Cloudflare 520-529",
    src.includes("429") &&
      src.includes("408") &&
      src.includes("502") &&
      src.includes("503") &&
      src.includes("504") &&
      src.includes("520") &&
      src.includes("529"),
  );
  check(
    "phân loại lỗi theo THÂN (404 provider_error vẫn retry) — gốc rễ 19/09",
    src.includes("isRetryableErrorBody") &&
      src.includes("provider_error") &&
      src.includes("AI service stream failed"),
  );
  check(
    "backoff tăng dần kèm jitter chống thundering herd",
    src.includes("1000 * 2 ** attempt") && src.includes("Math.random()"),
  );
  check(
    "mặc định chịu nghẽn 6 lần thử (KIRA_PROXY_RETRIES ?? 6)",
    src.includes("KIRA_PROXY_RETRIES ?? 6"),
  );
  check("log mỗi lần thử lại để chẩn đoán qua journalctl", src.includes("thử lại sau"));
  check(
    "lỗi cứng 400/401/403 không nằm trong danh sách retry",
    !/\b(400|401|403)\b[^\n]*RETRYABLE/.test(src),
  );
  check("có health endpoint để giám sát", src.includes("/__health"));
  check("timeout mỗi lượt gọi (không treo vô hạn)", src.includes("AbortSignal.timeout"));
  check(
    "body đọc MỘT lần thành ArrayBuffer trước vòng retry (không 'Body already used')",
    src.includes("req.arrayBuffer()") && !/body:\s*await\s+req\.text\(\)/.test(src),
  );
  check(
    "tôn trọng header Retry-After của upstream",
    src.includes("retry-after") && src.includes("retryAfterMs"),
  );
  check(
    "có trần backoff (KIRA_PROXY_MAX_BACKOFF_MS) tránh treo dài",
    src.includes("KIRA_PROXY_MAX_BACKOFF_MS"),
  );
  check(
    "dừng thử lại khi client hủy kết nối (AbortSignal.any + req.signal)",
    src.includes("AbortSignal.any") && src.includes("req.signal"),
  );
  check(
    "systemd unit đi kèm — proxy tự sống lại khi crash/reboot",
    fs.existsSync(path.join(__dirname, "kiira-retry-proxy.service")) &&
      fs
        .readFileSync(path.join(__dirname, "kiira-retry-proxy.service"), "utf8")
        .includes("Restart=always"),
  );

  // Tăng cường 19/09/2026
  check(
    "tách timeout chờ byte đầu (KIRA_PROXY_FIRST_BYTE_MS + firstByteTimer)",
    src.includes("KIRA_PROXY_FIRST_BYTE_MS") && src.includes("firstByteTimer"),
  );
  check(
    "huỷ timer first-byte ngay khi nhận header (không cắt oan stream dài)",
    src.includes("clearTimeout(firstByteTimer)") && src.includes("attemptController.abort"),
  );
  check(
    "idle watchdog cho stream (KIRA_PROXY_IDLE_MS + waitFirstChunk/continueStream)",
    src.includes("KIRA_PROXY_IDLE_MS") &&
      src.includes("waitFirstChunk") &&
      src.includes("continueStream"),
  );
  check(
    "im lặng trước chunk đầu thì hủy lượt và thử lại (first.idle)",
    src.includes("first.idle") && src.includes("upstream im lặng trước chunk đầu"),
  );
  check(
    "ngân sách tổng chặn retry cộng dồn vô tận (KIRA_PROXY_TOTAL_BUDGET_MS + deadline)",
    src.includes("KIRA_PROXY_TOTAL_BUDGET_MS") && src.includes("deadline"),
  );
  check(
    "ngắt mạch MỀM: giảm lượt thử khi lỗi liên tiếp, KHÔNG chặn request",
    src.includes("KIRA_PROXY_BREAKER_THRESHOLD") &&
      src.includes("effectiveRetries") &&
      src.includes("breakerFailure") &&
      !src.includes("breakerAllows"),
  );
  check(
    "health endpoint phơi trạng thái ngắt mạch mềm để giám sát",
    src.includes("breaker:") && src.includes("breakerFails") && src.includes("effectiveRetries"),
  );
  check(
    "KHÔNG trả 503 khi upstream nghẽn (proxy là lớp retry, không từ chối phục vụ)",
    !/status:\s*503/.test(src),
  );
  check(
    "giải phóng kết nối lỗi có giới hạn (drain + MAX_ERROR_BODY)",
    src.includes("MAX_ERROR_BODY") && src.includes("async function drain"),
  );
  check(
    "continueStream bắt reject khi upstream rớt giữa stream (đóng sạch, không terminated)",
    /async pull\(controller\)[\s\S]*?try \{[\s\S]*?reader\.read\(\)[\s\S]*?\} catch \(err\)/.test(
      src,
    ) && src.includes("upstream rớt giữa stream"),
  );

  console.log(`\nKết quả kiira-proxy: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((err) => {
  console.error("LỖI SUITE:", err);
  process.exit(1);
});
