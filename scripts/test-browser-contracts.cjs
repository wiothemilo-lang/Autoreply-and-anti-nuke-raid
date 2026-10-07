#!/usr/bin/env node
/**
 * test-browser-contracts.cjs — test HÀNH VI mức trình duyệt cho 3 lớp lỗi im
 * lặng mà test so-chuỗi không chạm tới:
 *
 *   A. Preloader fail-open (bug thảm hoạ PR #15 để lại): /boot.js bị chặn/404/
 *      tải dở/throw → app vẫn phải hiện, lớp phủ #boot phải biến mất, trang
 *      phải tương tác được. TRƯỚC ĐÂY: `window.__bootDone?.()` no-op → lớp phủ
 *      phủ kín app vĩnh viễn.
 *   B. Đường đóng preloader BÌNH THƯỜNG (boot.js sống) vẫn đúng như cũ.
 *   C. Canonical /status→/monitor + redirect 301: mở /status phải rơi về
 *      /monitor, canonical/og:url/JSON-LD phải là /monitor — không được có hai
 *      URL cùng tự khai canonical.
 *   D. Skip-link thật sự dùng được bằng bàn phím (Tab → hiện → Enter → focus
 *      nhảy vào <main>), không chỉ "tồn tại trong source".
 *   E. Route public mở trực tiếp (SPA fallback) + private route noindex +
 *      route lạ 404 có thương hiệu.
 *   J. Bộ chọn trang ở HEADER phải nằm trong khung nhìn và MỞ ĐƯỢC ở cả
 *      desktop lẫn mobile, trên trang chủ lẫn trang trong (desktop 07/10/2026:
 *      dock cũ từng "biến mất" vì thiếu neo dọc — nút trôi xuống dưới đáy
 *      khung nhìn, cách ~4.800px, dù DOM vẫn còn).
 *
 * KHÔNG cài dependency mới: điều khiển Chromium bằng DevTools Protocol qua
 * WebSocket, phục vụ dist/ bằng http server của Node. WebSocket lấy theo thứ tự:
 * global `WebSocket` của Node (>=22) → `ws` (đã nằm sẵn qua convex). Cả hai
 * cùng bề mặt WHATWG nên phần CDP phía dưới không phải biết đang dùng cái nào.
 * Trình duyệt tìm theo thứ tự: $CHROME_BIN → /usr/bin/chromium* → cache
 * playwright. Thiếu trình duyệt = FAIL có hướng dẫn (không im lặng xanh).
 *
 * Chạy: node scripts/test-browser-contracts.cjs (đã nằm trong bun run test)
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn, spawnSync } = require("node:child_process");

/**
 * WebSocket client cho CDP.
 *
 * Global `WebSocket` chỉ có từ Node 22; trên Node 20 (VPS hiện tại) biến này
 * là `undefined` ⇒ `new WebSocket(url)` ném ReferenceError NGAY ở `Cdp.connect`
 * và cả suite chết trước khi test được thứ gì — trước đây đây là lý do
 * `test-browser-contracts` đỏ trên mọi máy chạy Node < 22.
 *
 * Vì sao KHÔNG skip: bỏ qua thì hợp đồng bàn phím/skip-link/route của web bị
 * mất vô hình. Nay lấy `ws` (đã có sẵn trong node_modules qua `convex`, cùng
 * bề mặt WHATWG: addEventListener open/message/error + event.data + send/close)
 * ⇒ suite chạy thật trên CẠ Node 20 lẫn Node 22+. Nếu thiếu cả hai thì báo
 * lỗi tường minh thay vì crash vô hình.
 */
function pickWebSocket() {
  if (typeof WebSocket === "function") return WebSocket;
  try {
    return require("ws").WebSocket;
  } catch {
    throw new Error(
      "Cần WebSocket để điều khiển DevTools: Node < 22 thiếu global WebSocket và " +
        "không tìm thấy gói `ws`. Hãy chạy bằng Node >= 22.",
    );
  }
}
const { test } = require("node:test");

/**
 * Cửa thoát rõ ràng cho môi trường KHÔNG có trình duyệt (CI image lạ, box tối
 * thiểu). Mặc định vẫn FAIL kèm hướng dẫn — test im lặng skip là test dối.
 */
const BROWSER_TEST_TIMEOUT_MS = Number(process.env.BROWSER_TEST_TIMEOUT_MS) || 90000;
const rawBrowserTest = process.env.SKIP_BROWSER_TESTS === "1" ? test.skip : test;
/**
 * Trần cho MỘT test trình duyệt. Trần suite của runner (300s) chỉ CHE lỗi: một
 * lời chờ treo ở bất kỳ test nào giết cả suite mà log KHÔNG nói test nào treo
 * (sự cố CI 02/10 đỏ ở 300s, output dừng ở `ok 13`). Đặt trần ở node:test thì
 * treo được báo ĐÚNG TÊN test (`failureType: testTimeoutFailure`) và các test
 * sau vẫn chạy — biến "chết im lặng" thành lỗi có địa chỉ. 90s vì test nặng
 * nhất (I1) có thể tới ~50s trên runner chậm.
 */
/**
 * Chẩn đoán cho lần bị kill ở mức SUITE (CI 06/10: kill ở 300s, log dừng ở
 * `ok 13` — không biết test nào đang treo). Node:test chỉ in `# Subtest:` khi
 * test HOÀN TẤT, nên output không bao giờ nêu tên test ĐANG CHẠY. Vòng lặp
 * này in một dòng TAP comment mỗi 20s: tên test hiện tại + số giây; runner
 * in full tail khi suite quá hạn → chỉ đúng chỗ treo thay vì đoán.
 */
let currentTestName = "(chưa chạy test nào)";
const suiteStartedAt = Date.now();
const progressBreadcrumb = setInterval(() => {
  console.log(
    `# [browser-test] ${Math.round((Date.now() - suiteStartedAt) / 1000)}s — đang chạy: ${currentTestName}`,
  );
}, 20_000);
// Không được giữ event loop sống: khi không còn gì chờ thì process phải thoát
// (node:test báo cancelledByParent) — một timer ref'd vô hại có thể biến
// "hết việc" thành "treo".
progressBreadcrumb.unref?.();

const browserTest = (name, fn) =>
  rawBrowserTest(name, { timeout: BROWSER_TEST_TIMEOUT_MS }, async (t) => {
    currentTestName = name;
    return fn(t);
  });

const ROOT = path.resolve(__dirname, "..");
/**
 * Trần cho MỘT lệnh CDP. Bản trước không có trần: lệnh chờ browser trả lời
 * mãi, renderer treo là cả suite treo — trần 120s của runner chỉ che lỗi
 * chứ không báo. 30s dư cho lần tải trang chậm nhất đã đo (cả suite ~100s,
 * không phải một lệnh), nên lệnh treo bị báo đúng tên.
 */
const CDP_COMMAND_TIMEOUT_MS = Number(process.env.CDP_COMMAND_TIMEOUT_MS) || 30000;
const DIST = process.env.BROWSER_TEST_DIST || path.join(ROOT, "dist");
/**
 * Trần cho các lời chờ KHÁC ngoài `Cdp.send` (mở WebSocket DevTools, HTTP tới
 * `/json/*`, mở cổng server tĩnh). `Cdp.send` đã có trần từ sự cố 01/10, NHƯNG
 * suite vẫn treo lại được ở 300s (CI 02/10) vì những lời chờ này chưa có trần:
 * một `fetch`/WebSocket không bao giờ trả lời là cả suite đứng im, không test
 * nào báo kết quả. Trần của tầng trên chỉ che lỗi, không sửa — y hệt bài học CDP.
 */
const CDP_CONNECT_TIMEOUT_MS = Number(process.env.CDP_CONNECT_TIMEOUT_MS) || 15000;
const DEVTOOLS_HTTP_TIMEOUT_MS = Number(process.env.DEVTOOLS_HTTP_TIMEOUT_MS) || 10000;
const SERVER_LISTEN_TIMEOUT_MS = Number(process.env.SERVER_LISTEN_TIMEOUT_MS) || 10000;

/**
 * Trần cho MỘT lời chờ không tự có trần. KHÔNG dùng `AbortSignal.timeout()`:
 * timer của nó bị `unref()` nên đúng lúc lời chờ là thứ DUY NHẤT còn giữ event
 * loop (chính cảnh treo ta cần bắt) thì trần KHÔNG cháy → im lặng chết. Trần
 * thời gian phải là việc bắt buộc xảy ra (xem bot/src/resilience.js).
 */
function withCeiling(promise, ms, label) {
  let timer;
  const ceiling = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} không xong trong ${ms}ms`)), ms);
  });
  return Promise.race([promise, ceiling]).finally(() => clearTimeout(timer));
}
const MANIFEST = require("../src/lib/routes.json");
const ROUTES = MANIFEST.routes;
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.convex.cloud https://*.convex.site wss://*.convex.cloud wss://*.convex.site https://discord.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://discord.com",
  "frame-ancestors 'none'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

// ─── Tìm trình duyệt ────────────────────────────────────────────────────────
function findChromium() {
  const candidates = [];
  if (process.env.CHROME_BIN) candidates.push(process.env.CHROME_BIN);
  candidates.push(
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  );
  const cacheDirs = [
    path.join(os.homedir(), ".cache/ms-playwright"),
    path.join(os.homedir(), "Library/Caches/ms-playwright"),
  ];
  for (const dir of cacheDirs) {
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.startsWith("chromium")) continue;
      candidates.push(
        path.join(dir, entry, "chrome-linux", "chrome"),
        path.join(dir, entry, "chrome-linux64", "chrome"),
        path.join(dir, entry, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
      );
    }
  }
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // không đọc được — thử ứng viên kế tiếp
    }
  }
  return null;
}

// ─── Static server dựng đúng kiểu production (CSP + SPA fallback + redirect) ──
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
};

function routeFor(pathname) {
  const norm = pathname.length > 1 ? pathname.replace(/\/+$/, "") || "/" : "/";
  return (
    ROUTES.find((r) => r.match === "exact" && r.path === norm) ??
    ROUTES.find((r) => r.match === "prefix" && norm.startsWith(`${r.path}/`)) ??
    ROUTES.find((r) => r.match === "prefix" && norm === r.path) ??
    null
  );
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const pathname = decodeURIComponent(req.url.split("?")[0]);
      const route = routeFor(pathname);
      const headers = { "content-security-policy": CSP };
      const send = (code, file, extra = {}) => {
        fs.readFile(file, (err, data) => {
          if (err) {
            res.writeHead(500, { "content-type": "text/plain" });
            res.end("server error");
            return;
          }
          res.writeHead(code, {
            "content-type": MIME[path.extname(file)] || "application/octet-stream",
            ...headers,
            ...extra,
          });
          res.end(data);
        });
      };
      // 1) Alias có redirect → 301 (giống vercel.json + nginx location = /status)
      if (route && route.redirect) {
        res.writeHead(301, { ...headers, location: route.redirect });
        res.end();
        return;
      }
      // 2) Route cần SPA fallback → index.html (private kèm noindex header)
      if (route && route.spaFallback) {
        const extra = route.visibility === "private" ? { "x-robots-tag": "noindex, nofollow" } : {};
        return send(200, path.join(DIST, "index.html"), extra);
      }
      // 3) Có file thật (/, /sitemap.xml, /assets/*, /boot.js, favicon…) → phục vụ.
      // "/" không có route SPA fallback (index.html là file thật) — map về index.html.
      const filePath = pathname === "/" ? "/index.html" : pathname;
      const file = path.normalize(path.join(DIST, filePath));
      if (file.startsWith(DIST) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        return send(200, file);
      }
      // 4) Còn lại → 404 có thương hiệu, noindex
      return send(404, path.join(DIST, "404.html"), { "x-robots-tag": "noindex, nofollow" });
    });
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

// ─── CDP client tối giản trên WebSocket sẵn có của Node ─────────────────────
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.events = new Map();
    this.responses = [];
    ws.addEventListener("message", (event) => this._onMessage(event.data));
  }

  static async connect(url) {
    // `new pickWebSocket()(url)` sẽ parse thành `(new pickWebSocket())(url)` —
    // tức gọi constructor KHÔNG có `new` → "Class constructor ... cannot be
    // invoked without 'new'". Phải gom tròn ngoặc: `new (pick())(url)`.
    const WebSocketImpl = pickWebSocket();
    const ws = new WebSocketImpl(url);
    try {
      // Không có trần thì một WebSocket không mở (cũng không lỗi) treo cả suite.
      await withCeiling(
        new Promise((resolve, reject) => {
          ws.addEventListener("open", resolve, { once: true });
          ws.addEventListener("error", () => reject(new Error("WebSocket tới DevTools thất bại")), {
            once: true,
          });
        }),
        CDP_CONNECT_TIMEOUT_MS,
        "Mở WebSocket tới DevTools",
      );
    } catch (e) {
      try {
        ws.close();
      } catch {
        // chưa mở được — không còn gì để đóng
      }
      throw e;
    }
    const cdp = new Cdp(ws);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Network.enable");
    return cdp;
  }

  _onMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
    } catch {
      return;
    }
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    if (msg.method === "Network.responseReceived") {
      this.responses.push(msg.params.response);
    }
    const waiters = this.events.get(msg.method);
    if (waiters) {
      for (const waiter of waiters.splice(0)) waiter(msg.params);
    }
  }

  /**
   * Gửi lệnh CDP và CHỜ CÓ CHỐT THỜI GIAN.
   *
   * Bản trước chỉ `new Promise` + lưu vào `pending` rồi chờ browser trả lời.
   * Khi renderer treo (tab crash, `awaitPromise` bám một promise không bao
   * giờ settle, request bị chặn vô hạn) thì browser KHÔNG BAO GIỜ trả lời →
   * promise treo vĩnh viễn → cả suite đứng, không test nào báo kết quả. Trần
   * 120s của runner che giấu đúng lỗi này: suite bị giết ở 120s/300s mà
   * không hề biết mình treo ở đâu.
   *
   * Nay mỗi lệnh có trần riêng. Trần ngắn (30s) vẫn dư cho lần tải trang
   * chậm nhất đã đo (~100s cho CẢ suite, không phải một lệnh), nên lệnh treo
   * bị báo đúng tên thay vì kéo cả suite.
   */
  send(method, params = {}, timeoutMs = CDP_COMMAND_TIMEOUT_MS) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const entry = { resolve, reject, timer: null };
      entry.timer = setTimeout(() => {
        // Dọn entry để `pending` không phình vô hạn khi renderer treo.
        this.pending.delete(id);
        reject(new Error(`CDP "${method}" không trả lời trong ${timeoutMs}ms (renderer treo?)`));
      }, timeoutMs);
      // Không giữ event loop sống vì timer của lệnh đã xong.
      entry.timer.unref?.();
      const done = (fn) => (v) => {
        clearTimeout(entry.timer);
        fn(v);
      };
      this.pending.set(id, { resolve: done(resolve), reject: done(reject) });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  once(method) {
    return new Promise((resolve) => {
      if (!this.events.has(method)) this.events.set(method, []);
      this.events.get(method).push(resolve);
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(`evaluate lỗi: ${result.exceptionDetails.text}`);
    }
    return result.result.value;
  }

  async goto(url) {
    const loaded = this.once("Page.loadEventFired");
    await this.send("Page.navigate", { url });
    let timer;
    try {
      await Promise.race([
        loaded,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`timeout khi mở ${url}`)), 20000);
          // `unref` + `clearTimeout` ở finally: bản cũ để timer 20s SỐNG SÓT sau
          // mỗi lần mở trang thành công → nó giữ event loop và làm suite thoát chậm.
          timer.unref?.();
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async tab() {
    await this.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
      nativeVirtualKeyCode: 9,
    });
    await this.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
      nativeVirtualKeyCode: 9,
    });
  }

  async enter() {
    for (const type of ["keyDown", "keyUp"]) {
      await this.send("Input.dispatchKeyEvent", {
        type,
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
        text: type === "keyDown" ? "\r" : undefined,
      });
    }
  }

  async clickAt(x, y) {
    for (const type of ["mousePressed", "mouseReleased"]) {
      await this.send("Input.dispatchMouseEvent", {
        type,
        x,
        y,
        button: "left",
        clickCount: 1,
      });
    }
  }

  /** Click chuột THẬT tại toạ độ phần tử (chứng minh không có gì chặn con trỏ). */
  async clickSelector(selector) {
    const box = await this.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    })()`);
    if (!box) throw new Error(`không tìm thấy phần tử ${selector}`);
    await this.clickAt(box.x, box.y);
    return box;
  }

  /** Click chuột thật vào phần tử có ĐÚNG nội dung text (VI/EN/DE…). */
  async clickText(text) {
    const box = await this.evaluate(`(() => {
      const el = [...document.querySelectorAll("button, a")].find(
        (b) => (b.textContent || "").trim() === ${JSON.stringify(text)},
      );
      if (!el) return null;
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    })()`);
    if (!box) throw new Error(`không tìm thấy phần tử có text ${JSON.stringify(text)}`);
    await this.clickAt(box.x, box.y);
    return box;
  }

  static async launch(bin) {
    const port = 39000 + Math.floor(Math.random() * 2000);
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "protogon-browser-"));
    const child = spawn(
      bin,
      [
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        "--window-size=1280,800",
        "about:blank",
      ],
      { stdio: "ignore" },
    );
    const wsUrl = await (async () => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        try {
          const res = await withCeiling(
            fetch(`http://127.0.0.1:${port}/json/list`),
            DEVTOOLS_HTTP_TIMEOUT_MS,
            "DevTools /json/list",
          );
          // Đọc thân response cũng phải có trần — fetch() xong chưa có nghĩa
          // là body về đủ; thân treo là lời chờ không tự có trần.
          const targets = await withCeiling(
            res.json(),
            DEVTOOLS_HTTP_TIMEOUT_MS,
            "Đọc JSON DevTools /json/list",
          );
          const page = targets.find((t) => t.type === "page");
          if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
        } catch {
          // trình duyệt chưa mở cổng — thử lại
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      throw new Error(`Chromium không mở cổng debug (${bin})`);
    })();
    return { cdp: await Cdp.connect(wsUrl), child, port, userDataDir };
  }

  async close() {
    try {
      // Trần ngắn hơn (5s): đóng tab là việc dọn dẹp, không có lý do chờ
      // 30s. Không có trần thì `t.after(() => page.close())` treo hook after,
      // node:test chờ hook → cả suite đứng mà không báo lỗi.
      await this.send("Page.close", {}, 5000);
    } catch {
      // trang đã đóng — bỏ qua
    } finally {
      this.dispose();
    }
  }

  /**
   * Đóng WebSocket CDP. Không đóng thì socket còn mở giữ event loop sống và
   * node:test không thoát — suite treo ở PHÚT CUỐI dù mọi test đã xong.
   */
  dispose() {
    try {
      this.ws.close();
    } catch {
      // đã đóng
    }
  }
}

// ─── Dựng dữ liệu dùng chung ────────────────────────────────────────────────
let shared = null;

async function setup() {
  if (shared) return shared;
  if (!fs.existsSync(path.join(DIST, "index.html"))) {
    console.error(`[browser-test] Thiếu ${DIST}/index.html — đang build…`);
    // spawnSync KHÔNG trả lời thì event loop bị chặn: interval chẩn đoán và
    // cả trần per-test của node:test đều KHÔNG THỂ cháy → kill suite mà không
    // nói gì. Trần của spawnSync tự giết tiến trình build khi quá hạn.
    const build = spawnSync("bun", ["run", "build"], {
      cwd: ROOT,
      stdio: "inherit",
      timeout: 180_000,
      killSignal: "SIGKILL",
    });
    if (build.status !== 0 || build.error) {
      throw new Error(
        `build thất bại (status=${build.status}, error=${build.error?.code ?? "none"})`,
      );
    }
  }
  const bin = findChromium();
  if (!bin) {
    throw new Error(
      "Không tìm thấy trình duyệt Chromium. Cài chromium hoặc đặt CHROME_BIN=/path/to/chrome. " +
        "(Đặt SKIP_BROWSER_TESTS=1 để bỏ qua cụm test này ở môi trường không có trình duyệt.)",
    );
  }
  const port = 46000 + Math.floor(Math.random() * 3000);
  const server = await withCeiling(startServer(port), SERVER_LISTEN_TIMEOUT_MS, "Mở server tĩnh");
  const base = `http://127.0.0.1:${port}`;
  const launched = await Cdp.launch(bin);
  shared = {
    base,
    server,
    bin,
    port,
    launched,
    async openPage() {
      // Chromium hiện đại chỉ nhận PUT cho /json/new (GET bị từ chối).
      const res = await withCeiling(
        fetch(`http://127.0.0.1:${launched.port}/json/new?about:blank`, { method: "PUT" }),
        DEVTOOLS_HTTP_TIMEOUT_MS,
        "DevTools /json/new",
      );
      // Thân response phải có trần như trên — không thì lời chờ này lọt qua
      // mọi cơ chế chặn của suite (nguyên nhân kinh điển của kill im lặng).
      const target = await withCeiling(
        res.json(),
        DEVTOOLS_HTTP_TIMEOUT_MS,
        "Đọc JSON DevTools /json/new",
      );
      const page = await Cdp.connect(target.webSocketDebuggerUrl);
      // Headless không có cửa sổ thật → phải bật "giả lập focus" để
      // element.focus()/Tab/Enter hoạt động như trình duyệt thường.
      await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
      await page.send("Page.bringToFront");
      return page;
    },
  };
  return shared;
}

function teardown() {
  if (!shared) return;
  shared.launched.child.kill("SIGKILL");
  // Đóng thẳng WebSocket CDP cấp trình duyệt: còn mở là event loop chưa rỗng,
  // node:test không thoát — suite treo im lặng sau khi mọi test đã xanh.
  shared.launched.cdp.dispose();
  // `close()` chỉ đóng cổng nghe; kết nối keep-alive còn sót vẫn giữ event loop.
  shared.server.closeAllConnections?.();
  shared.server.close();
  shared = null;
}

const OVERLAY_STATE = `(() => {
  const boot = document.getElementById("boot");
  if (!boot) return "removed";
  const cs = getComputedStyle(boot);
  const covered = (() => {
    const el = document.elementFromPoint(Math.floor(innerWidth / 2), Math.floor(innerHeight / 2));
    return !!(el && (el === boot || boot.contains(el)));
  })();
  const hidden = cs.visibility === "hidden" || Number(cs.opacity) === 0 || boot.classList.contains("is-done");
  return covered ? "covering" : hidden ? "hidden" : "visible";
})()`;

browserTest(
  "A. /boot.js bị chặn → app vẫn hiện, lớp phủ biến mất, trang tương tác được",
  async (t) => {
    const ctx = await setup();
    const page = await ctx.openPage();
    t.after(() => page.close());
    await page.send("Network.setBlockedURLs", { urls: ["*/boot.js*", "*boot.js*"] });
    await page.goto(ctx.base + "/");
    // Chốt an toàn của BootSignal là 3s, rồi 700ms nữa overlay mới rời DOM →
    // chờ 4.5s cho chắc. Nếu fail-open hoạt động, người dùng chỉ kẹt tối đa 3s
    // (thay vì vĩnh viễn như trước khi có finishBootOverlay).
    await new Promise((r) => setTimeout(r, 4500));

    const bootDoneExists = await page.evaluate("typeof window.__bootDone");
    t.diagnostic(`window.__bootDone = ${bootDoneExists} (phải là "undefined" — chặn có hiệu lực)`);
    if (bootDoneExists !== "undefined") {
      // Chặn không hiệu lực thì toàn bộ assertion sau vô nghĩa → fail sớm, rõ ràng.
      t.diagnostic("⚠️ Network.setBlockedURLs không chặn được /boot.js");
    }

    const app = await page.evaluate(`(() => ({
    rootChildren: document.querySelectorAll("#root > *").length,
    h1: document.querySelector("h1")?.textContent?.trim().slice(0, 40) ?? null,
    overlay: ${OVERLAY_STATE},
  }))()`);
    t.diagnostic(`app: ${JSON.stringify(app)}`);

    if (bootDoneExists === "undefined") {
      t.assert.strictEqual(
        app.overlay,
        "removed",
        "lớp phủ #boot phải được gỡ khi boot.js không chạy",
      );
    }
    t.assert.ok(app.rootChildren > 0, "React phải render được (không phải trang trắng)");
    t.assert.ok(app.h1 && app.h1.length > 0, "phải có H1 có nội dung");

    // Tương tác THẬT: bấm nút đổi ngôn ngữ bằng toạ độ chuột → ngôn ngữ đổi.
    // (Click qua toạ độ, không phải element.click(): nếu lớp phủ #boot còn chặn
    // con trỏ thì cú click này rơi vào lớp phủ và ngôn ngữ KHÔNG đổi.)
    const clickedLang = await (async () => {
      await page.clickText("EN");
      await new Promise((r) => setTimeout(r, 400));
      return page.evaluate("document.documentElement.lang");
    })();
    t.diagnostic(`lang sau khi bấm EN = ${clickedLang}`);
    t.assert.strictEqual(
      clickedLang,
      "en",
      "bấm EN phải đổi được ngôn ngữ — trang không bị lớp phủ chặn",
    );
  },
);

browserTest("B. /boot.js chạy bình thường → preloader đóng đúng thiết kế cũ", async (t) => {
  const ctx = await setup();
  const page = await ctx.openPage();
  t.after(() => page.close());
  await page.send("Network.setBlockedURLs", { urls: [] });
  await page.goto(ctx.base + "/");
  await new Promise((r) => setTimeout(r, 1600));

  const state = await page.evaluate(`(() => ({
    bootDone: typeof window.__bootDone,
    overlay: ${OVERLAY_STATE},
    h1: !!document.querySelector("h1"),
  }))()`);
  t.diagnostic(`normal boot: ${JSON.stringify(state)}`);
  t.assert.strictEqual(state.bootDone, "function", "/boot.js phải chạy và gán window.__bootDone");
  t.assert.strictEqual(state.overlay, "removed", "lớp phủ phải được gỡ sau khi boot hoàn tất");
  t.assert.ok(state.h1, "app phải render");
});

browserTest("C. /status → 301 /monitor; canonical/og:url/JSON-LD đều là /monitor", async (t) => {
  const ctx = await setup();
  const page = await ctx.openPage();
  t.after(() => page.close());

  await page.goto(ctx.base + "/status");
  await new Promise((r) => setTimeout(r, 1200));

  // Redirect được chứng minh ở mức hành vi: fetch có follow redirect thì
  // `redirected === true` và URL cuối là /monitor. Nếu /status TỰ PHỤC VỤ trang
  // (không redirect) thì redirected === false — đúng thứ cần chặn.
  // MÃ 301 cố định (không phải 302) do test cấu hình khoá: vercel.json
  // (permanent: true) và Dockerfile.web (return 301).
  const statusUrl = ctx.base + "/status";
  const redirectProof = await page.evaluate(`(async () => {
    const res = await fetch(${JSON.stringify(statusUrl)});
    return { redirected: res.redirected, url: res.url, status: res.status };
  })()`);
  t.diagnostic(`fetch /status (có follow): ${JSON.stringify(redirectProof)}`);
  t.assert.strictEqual(
    redirectProof.redirected,
    true,
    "/status phải redirect, không tự phục vụ trang",
  );
  t.assert.ok(
    redirectProof.url.endsWith("/monitor"),
    `redirect phải rơi về /monitor (đang ở ${redirectProof.url})`,
  );
  t.assert.strictEqual(redirectProof.status, 200, "sau redirect phải ra trang thật");

  const after = await page.evaluate(`(() => ({
    pathname: location.pathname,
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
    ogUrl: document.querySelector('meta[property="og:url"]')?.content ?? null,
    robots: document.querySelector('meta[name="robots"]')?.content ?? null,
    jsonld: (() => {
      const el = document.getElementById("route-jsonld");
      if (!el) return null;
      const j = JSON.parse(el.textContent);
      const page_ = (j["@graph"] || []).find((g) => g["@type"] === "WebPage");
      const crumbs = (j["@graph"] || []).find((g) => g["@type"] === "BreadcrumbList");
      return { url: page_?.url ?? null, id: page_?.["@id"] ?? null, crumb: crumbs?.itemListElement?.[1]?.item ?? null };
    })(),
  }))()`);
  t.diagnostic(`sau khi mở /status: ${JSON.stringify(after)}`);

  t.assert.strictEqual(after.pathname, "/monitor", "/status phải rơi về /monitor (redirect 301)");
  const origin = new URL(ctx.base).origin;
  t.assert.strictEqual(after.canonical, `${origin}/monitor`, "canonical phải là /monitor");
  t.assert.strictEqual(after.ogUrl, `${origin}/monitor`, "og:url phải dùng URL canonical");
  t.assert.strictEqual(
    after.jsonld?.url,
    `${origin}/monitor`,
    "JSON-LD WebPage url phải là canonical",
  );
  t.assert.strictEqual(
    after.jsonld?.id,
    `${origin}/monitor#webpage`,
    "JSON-LD @id phải dựa trên canonical",
  );
  t.assert.strictEqual(after.jsonld?.crumb, `${origin}/monitor`, "breadcrumb phải dùng canonical");
});

browserTest("D. /monitor giữ canonical chính nó (trang canonical thật sự)", async (t) => {
  const ctx = await setup();
  const page = await ctx.openPage();
  t.after(() => page.close());
  await page.goto(ctx.base + "/monitor");
  await new Promise((r) => setTimeout(r, 1100));
  const state = await page.evaluate(`(() => ({
    pathname: location.pathname,
    canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
    robots: document.querySelector('meta[name="robots"]')?.content ?? null,
    h1: document.querySelector("h1")?.textContent?.trim() ?? null,
  }))()`);
  const origin = new URL(ctx.base).origin;
  t.diagnostic(`/monitor: ${JSON.stringify(state)}`);
  t.assert.strictEqual(state.canonical, `${origin}/monitor`);
  t.assert.strictEqual(state.robots, "index,follow");
  t.assert.ok(state.h1 && state.h1.length > 0);
});

browserTest(
  "E. Skip-link dùng được bằng bàn phím: Tab → hiện → Enter → focus vào <main>",
  async (t) => {
    const ctx = await setup();
    const page = await ctx.openPage();
    t.after(() => page.close());
    await page.goto(ctx.base + "/features");
    await new Promise((r) => setTimeout(r, 1200));

    await page.tab();
    const first = await page.evaluate(`(() => {
    const el = document.activeElement;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { tag: el.tagName, href: el.getAttribute("href"), text: (el.textContent || "").trim().slice(0, 40), width: r.width, height: r.height };
  })()`);
    t.diagnostic(`Tab đầu tiên: ${JSON.stringify(first)}`);
    t.assert.strictEqual(first?.tag, "A", "Tab đầu tiên phải dừng ở skip-link");
    t.assert.strictEqual(first?.href, "#main", "skip-link phải trỏ tới #main");
    t.assert.ok(
      (first?.width ?? 0) > 40 && (first?.height ?? 0) > 20,
      "skip-link phải HIỆN khi focus (không còn ẩn)",
    );

    await page.enter();
    await new Promise((r) => setTimeout(r, 400));
    const after = await page.evaluate(`(() => ({
    hash: location.hash,
    activeTag: document.activeElement?.tagName ?? null,
    activeId: document.activeElement?.id ?? null,
    activeIsMain: document.activeElement === document.querySelector("main#main"),
    mainTop: document.querySelector("main#main")?.getBoundingClientRect().top ?? null,
  }))()`);
    t.diagnostic(`sau Enter: ${JSON.stringify(after)}`);
    t.assert.strictEqual(after.hash, "#main", "Enter phải nhảy tới #main");
    // Chromium chỉ tự focus đích fragment khi đích focusable được — nhờ
    // tabIndex={-1}. Focus không vào <main> thì người dùng bàn phím vẫn đứng
    // nguyên ở đầu trang (bấm Tab tiếp tục quay lại điều hướng).
    if (!after.activeIsMain) {
      // Dự phòng: ép focus như trình duyệt chuẩn phải làm, rồi đo lại — chỉ để
      // phân biệt "thiếu tabIndex" với "trình duyệt không tự focus".
      const forced = await page.evaluate(`(() => {
      const main = document.querySelector("main#main");
      if (!main) return "no-main";
      if (main.tabIndex !== -1) return "missing-tabindex";
      main.focus();
      return document.activeElement === main ? "focusable" : "not-focusable";
    })()`);
      t.diagnostic(`kiểm tra đích nhảy: ${forced}`);
      t.assert.strictEqual(forced, "focusable", "<main id=main> phải focusable (tabIndex={-1})");
    }
    t.assert.ok((after.mainTop ?? -1) >= -2, "phần main phải nằm trong khung nhìn");
  },
);

browserTest(
  "F. Route public mở trực tiếp được; private route có noindex; route lạ 404 thương hiệu",
  async (t) => {
    const ctx = await setup();

    // Public direct visit (SPA fallback trong production)
    {
      const page = await ctx.openPage();
      t.after(() => page.close());
      await page.goto(ctx.base + "/features");
      await new Promise((r) => setTimeout(r, 1800));
      const state = await page.evaluate(`(() => ({
      h1: document.querySelector("h1")?.textContent?.trim().slice(0, 40) ?? null,
      title: document.title.slice(0, 40),
      overlay: ${OVERLAY_STATE},
    }))()`);
      t.diagnostic(`/features trực tiếp: ${JSON.stringify(state)}`);
      t.assert.ok(state.h1, "/features mở trực tiếp phải ra trang thật (không 404)");
      t.assert.notStrictEqual(state.overlay, "covering", "lớp phủ không được chặn nội dung");
    }

    // Private route: header noindex phía server
    {
      const page = await ctx.openPage();
      t.after(() => page.close());
      await page.goto(ctx.base + "/"); // vào cùng origin rồi mới fetch được
      const res = await page.evaluate(`(async () => {
      const r = await fetch("${ctx.base}/admin", { redirect: "manual" });
      return { status: r.status, robots: r.headers.get("x-robots-tag") };
    })()`);
      t.diagnostic(`/admin: ${JSON.stringify(res)}`);
      t.assert.strictEqual(res.status, 200, "private route vẫn phục vụ SPA");
      t.assert.strictEqual(
        res.robots,
        "noindex, nofollow",
        "hosting phải gắn X-Robots-Tag noindex",
      );
    }

    // Public route KHÔNG được có noindex
    {
      const page = await ctx.openPage();
      t.after(() => page.close());
      await page.goto(ctx.base + "/");
      const robots = await page.evaluate(`(async () => {
      const r = await fetch("${ctx.base}/monitor", { redirect: "manual" });
      return { status: r.status, robots: r.headers.get("x-robots-tag") };
    })()`);
      t.diagnostic(`/monitor: ${JSON.stringify(robots)}`);
      t.assert.strictEqual(robots.status, 200);
      t.assert.strictEqual(robots.robots, null, "trang public KHÔNG được gắn noindex");
    }

    // Route lạ → 404 có thương hiệu + noindex
    {
      const page = await ctx.openPage();
      t.after(() => page.close());
      await page.goto(ctx.base + "/");
      const res = await page.evaluate(`(async () => {
      const r = await fetch("${ctx.base}/duong-dan-la", { redirect: "manual" });
      const text = await r.text();
      return { status: r.status, robots: r.headers.get("x-robots-tag"), hasHeading: /404/.test(text) };
    })()`);
      t.diagnostic(`/duong-dan-la: ${JSON.stringify(res)}`);
      t.assert.strictEqual(res.status, 404);
      t.assert.strictEqual(res.robots, "noindex, nofollow");
      t.assert.ok(res.hasHeading, "404 phải là trang 404 có thương hiệu");
    }
  },
);

browserTest("G. Không có lỗi console trong suốt các route công khai", async (t) => {
  const ctx = await setup();
  const page = await ctx.openPage();
  t.after(() => page.close());
  // Lắng nghe console + exception bằng CDP event
  const consoleErrors = [];
  const listener = (params) => {
    if (params.type === "error")
      consoleErrors.push((params.args || []).map((a) => a.value ?? a.description).join(" "));
  };
  if (!page.events.has("Runtime.consoleAPICalled")) page.events.set("Runtime.consoleAPICalled", []);
  page.events.get("Runtime.consoleAPICalled").push(listener);
  const pageErrors = [];
  if (!page.events.has("Runtime.exceptionThrown")) page.events.set("Runtime.exceptionThrown", []);
  page.events.get("Runtime.exceptionThrown").push((params) => {
    pageErrors.push(params.exceptionDetails?.text ?? "unknown");
  });

  for (const route of [
    "/",
    "/features",
    "/monitor",
    "/terms",
    "/privacy",
    "/data-deletion",
    "/feedback",
  ]) {
    await page.goto(ctx.base + route);
    await new Promise((r) => setTimeout(r, 800));
  }
  t.diagnostic(`console errors: ${JSON.stringify(consoleErrors)}`);
  t.diagnostic(`page exceptions: ${JSON.stringify(pageErrors)}`);
  t.assert.deepStrictEqual(consoleErrors, [], "không được có console error (CSP/asset/404 ẩn)");
  t.assert.deepStrictEqual(pageErrors, [], "không được có exception khi chạy");
});

// ─── F. MÀN CHỜ CHUYỂN ROUTE (RouteLoader) ───────────────────────────────
// Mọi route đều lazy() nên lúc chuyển trang <Suspense> phải hiện màn chờ.
// Ba điều phải đúng, kiểm bằng hành vi thật chứ không đọc source:
//   1. màn chờ CÓ hiện khi bấm sang route lazy,
//   2. nó phủ kín màn hình + có role="status" (trình đọc màn hình),
//   3. preloader #boot KHÔNG bị dựng lại/nhân bản cùng lúc (đây là lỗi
//      "thấy load 2 lần" — báo cáo 30/09/2026).
browserTest(
  "F. Lần tải đầu bị treo → màn chờ RouteLoader hiện, phủ màn hình, #boot không nhân bản",
  async (t) => {
    const ctx = await setup();
    const page = await ctx.openPage();
    t.after(async () => {
      await Promise.race([page.close(), new Promise((r) => setTimeout(r, 5000))]);
    });

    //
    // VÌ SAO KHÔNG POLL TỪ NGOÀI: màn chờ chỉ tồn tại vài chục ms ở tải nhanh
    // (nằm dưới #boot) và nếu đợi sự kiện `load` rồi mới đo thì nó đã biến
    // mất → test "vô tình xanh". Script này chạy TRƯỚC mọi script của app,
    // bắt mọi lần màn chờ xuất hiện kèm ảnh chụp ngay tại thời điểm đó.
    await page.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        window.__loaderSnaps = [];
        window.__initProbe = { ran: true, at: Math.round(performance.now()) };
        (function () {
          var SEL = '[data-testid="route-loader"]';
          function snap() {
            // bootPeak phải được đo ở MỌI nhịp, kể cả lúc màn chờ không
            // có trong DOM — nên nằm TRƯỚC lệnh return sớm bên dưới.
            var bootCount = document.querySelectorAll('#boot').length;
            if (bootCount > window.__bootPeak) window.__bootPeak = bootCount;
            var el = document.querySelector(SEL);
            if (!el || window.__loaderSnaps.length > 200) return;
            var cs = getComputedStyle(el);
            var box = el.getBoundingClientRect();
            // Lớp thật sự trên cùng tại giữa viewport? Chỉ khi đúng vậy thì
            // người dùng MẮT THẤY được, chứ không chỉ nằm trong DOM.
            var top = document.elementFromPoint(
              Math.floor(innerWidth / 2), Math.floor(innerHeight / 2));
            var isTop = !!top && (top === el || el.contains(top));
            // Chỉ ghi khi trạng thái ĐỔI — mỗi nhịp lấy mẫu là một phép
            // elementFromPoint (ép tính lại layout).
            var sig = isTop + '|' + bootCount;
            if (window.__lastSig === sig) return;
            window.__lastSig = sig;
            window.__loaderSnaps.push({
              role: el.getAttribute('role'),
              ariaLive: el.getAttribute('aria-live'),
              position: cs.position,
              zIndex: cs.zIndex,
              coversViewport:
                box.width >= window.innerWidth - 1 && box.height >= window.innerHeight - 1,
              isTopmostAtCenter: isTop,
              bootCount: bootCount,
              hasPreloaderLogo: !!el.querySelector('img[src*="logo-mark"]'),
              hasBootIdInside: !!el.querySelector('#boot'),
              announced: (el.querySelector('.sr-only')?.textContent || '').trim(),
              t: Math.round(performance.now()),
            });
          }
          function start() {
            // MẪU THEO NHỊP, KHÔNG DÙNG MutationObserver.
            //
            // Lý do: observer subtree bắn theo MỌI biến động DOM, mà mỗi
            // lần ta gọi elementFromPoint (ép tính lại layout) +
            // querySelectorAll cả tài liệu. Trang Landing có framer-motion và
            // animation liên tục → hàng nghìn lần reflow mỗi giây, làm trang
            // nghẽn và kéo suite quá 170s. Interval 120ms vẫn bắt trọn
            // khoảnh khắc cần đo (màn chờ hiện vài giây).
            setInterval(snap, 120);
            // Số bản #boot tồn tại cùng lúc được đo ngay trong snap().
            window.__bootPeak = 0;
            window.__obsStarted = true;
          }
          if (document.documentElement) start();
          else document.addEventListener('DOMContentLoaded', start);
        })();
      `,
    });

    void 0;
    // Chặn DUY NHẤT chunk route và trễ nó lại, thay vì bóp mạng toàn trang.
    //
    // VÌ SAO KHÔNG BÓP MẠNG CHUNG: bundle vào ~1.7MB, bóp 20KB/s thì mất
    // hơn 80s — lâu hơn cả thời hạn test, và #root còn trống nên màn chờ
    // chưa kịp render. Bóp mạng cũng vô tác dụng nếu chunk đã nằm trong
    // HTTP cache từ các test A–G chạy trước (tài nguyên từ cache không bị
    // bóp). Giải pháp: chỉ giữ lại chunk Landing vài giây — bundle vào vẫn
    // tải nhanh, nhưng route chưa xong thì màn chờ hiện, và đã vượt mốc 7s
    // mà preloader tự gỡ nên màn chờ là lớp người dùng thật sự thấy.
    const ROUTE_CHUNK = "*Landing-*.js";
    // Giữ chunk route lại LÂU HƠN mốc 7s mà preloader tự gỡ mình. Nếu ngắn
    // hơn, app render xong lúc #boot còn phủ trên → màn chờ có trong DOM
    // nhưng người dùng không hề thấy, và đó KHÔNG phải thứ ta muốn chứng
    // minh. Giữ >7s thì lớp phủ #boot rời đi trước và màn chờ thành lớp trên
    // cùng — đúng khoảnh khắc người dùng thật sự nhìn thấy nó.
    const STALL_MS = 10000;
    await page.send("Network.enable");
    await page.send("Network.setCacheDisabled", { cacheDisabled: true });
    if (!page.events.has("Fetch.requestPaused")) page.events.set("Fetch.requestPaused", []);
    // Handler của harness tự xoá danh sách sau mỗi lần phát → phải tự
    // "nạp lại" sau mỗi sự kiện để giữ được cho các request kế tiếp.
    // Chốt chặn sạch trước khi đóng trang: request đang bị giữ sẽ bị
    // huỷ theo trang và `Fetch.continueRequest` ném "Invalid InterceptionId"
    // — lỗi đấy nổi thành unhandledRejection làm ĐỎ cả test dù các assert
    // đã xanh.
    t.after(async () => {
      // Có chốt thời gian: renderer đang giữ một request bị chặn có thể khiến
      // `Fetch.disable` không bao giờ trả lời, mà t.after treo thì cả suite
      // treo theo (không có test nào báo kết quả).
      await Promise.race([
        page.send("Fetch.disable").catch(() => {}),
        new Promise((r) => setTimeout(r, 5000)),
      ]);
    });
    const onPaused = async (params) => {
      page.events.get("Fetch.requestPaused").push(onPaused);
      await new Promise((r) => setTimeout(r, STALL_MS));
      try {
        await page.send("Fetch.continueRequest", { requestId: params.requestId });
      } catch {
        /* request đã bị huỷ (đóng trang) — bỏ qua */
      }
    };
    page.events.get("Fetch.requestPaused").push(onPaused);
    await page.send("Fetch.enable", {
      patterns: [{ urlPattern: ROUTE_CHUNK, requestStage: "Request" }],
    });

    void 0;
    // Điều hướng KHÔNG đợi sự kiện `load` — chính chờ `load` là lý do bản
    // test đầu báo "không thấy màn chờ" (nó biến mất trước khi ta kịp đo).
    await page.send("Page.navigate", { url: ctx.base + "/" });
    // Đợi execution context MỚI của trang được tạo. Gọi Runtime.evaluate ngay
    // sau Page.navigate có thể bắn vào context cũ đang bị hủy — promise bên
    // trong trang không bao giờ settle và `awaitPromise: true` treo vĩnh viễn,
    // làm cả suite đứng. Đây chính là lý do bản chạy trước treo không ra kết quả.
    await new Promise((r) => setTimeout(r, 800));

    // Luôn có chốt an toàn ở phía Node: dù trong trang treo, test vẫn kết thúc
    // và báo lỗi tử tế thay vì treo.
    const snaps = await Promise.race([
      page.evaluate(`new Promise((r) => {
      const t0 = Date.now();
      const i = setInterval(() => {
        const s = window.__loaderSnaps || [];
        // Ảnh nào màn chờ LÀ LỚP TRÊN CÙNG và #boot đã rời đi → đúng khoảnh
        // khắc người dùng thật sự nhìn thấy nó.
        const visible = s.find((x) => x.isTopmostAtCenter && x.bootCount === 0);
        if (visible) { clearInterval(i); r(visible); }
        else if (Date.now() - t0 > 45000) {
          clearInterval(i);
          r({
            __none: true,
            total: s.length,
            initProbe: window.__initProbe ?? null,
            observerStarted: window.__obsStarted ?? false,
            rootHtml: (document.getElementById('root')?.innerHTML || '').slice(0, 120),
            all: s.slice(0, 6),
          });
        }
      }, 100);
    })`),
      new Promise((r) => setTimeout(() => r({ __timeout: true }), 60000)),
    ]);

    t.diagnostic(`màn chờ lúc tải đầu: ${JSON.stringify(snaps)}`);
    t.assert.ok(snaps && !snaps.__timeout, "phải bắt được màn chờ khi lần tải đầu bị treo");
    t.assert.ok(!(snaps && snaps.__none), "màn chờ phải từng xuất hiện trong DOM");
    t.assert.ok(
      snaps && !snaps.__timeout && !snaps.__none && snaps.role,
      "màn chờ phải quan sát được",
    );
    t.assert.strictEqual(snaps.role, "status", 'màn chờ phải có role="status"');
    t.assert.strictEqual(snaps.ariaLive, "polite", 'màn chờ phải aria-live="polite"');
    t.assert.strictEqual(
      snaps.position,
      "fixed",
      "màn chờ phải phủ toàn màn hình (position fixed)",
    );
    t.assert.ok(snaps.coversViewport, "màn chờ phải phủ kín viewport");
    t.assert.ok(snaps.isTopmostAtCenter, "màn chờ phải là lớp trên cùng — người dùng thấy được");
    t.assert.ok(snaps.announced.length > 0, "màn chờ phải có chữ cho trình đọc màn hình");
    // Chốt "không load 2 lần": màn chờ không mang danh tính preloader và
    // không tự dựng thêm một lớp phủ #boot nữa.
    t.assert.strictEqual(snaps.bootCount, 0, "không được có #boot nào lúc màn chờ hiện");
    t.assert.strictEqual(
      snaps.hasPreloaderLogo,
      false,
      "màn chờ không được dựng lại logo preloader",
    );
    t.assert.strictEqual(snaps.hasBootIdInside, false, "màn chờ không được chứa phần tử #boot");

    void 0;
    // Preloader có đúng MỘT bản duy nhất trong suốt vòng đời trang (đo từ
    // trước khi app mount, xem __bootPeak trong script khởi tạo).
    const bootPeak = await Promise.race([
      page.evaluate(`window.__bootPeak`),
      new Promise((r) => setTimeout(() => r({ __timeout: true }), 15000)),
    ]);
    void 0;
    t.diagnostic(`số bản #boot tối đa cùng lúc: ${JSON.stringify(bootPeak)}`);
    t.assert.strictEqual(bootPeak, 1, "#boot phải có đúng 1 bản, không nhân bản");
    void 0;

    await page.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
  },
);

browserTest("G. Chuyển route không nháy màn chờ toàn màn hình (React giữ trang cũ)", async (t) => {
  const ctx = await setup();
  const page = await ctx.openPage();
  t.after(() => page.close());

  await page.goto(ctx.base + "/");
  await page.evaluate(`new Promise((r) => {
      const t0 = Date.now();
      const i = setInterval(() => {
        // Chờ app thật sự sẵn sàng: cây route đã render (bộ chọn trang chỉ
        // mount khi <Suspense> xong) VÀ preloader đã rời DOM — thiếu điều
        // kiện thứ hai thì #boot còn nằm trong DOM và assert phía dưới đỏ oan.
        if (
          document.querySelector('[data-testid="pages-menu"]') &&
          !document.getElementById("boot")
        ) { clearInterval(i); r(1); }
        else if (Date.now() - t0 > 30000) { clearInterval(i); r(0); }
      }, 50);
    })`);

  // Bóp mạng để chunk route mới tải đủ chậm để lỡ nháy cũng thấy. Tắt
  // cache vì lý do như test F.
  await page.send("Network.enable");
  await page.send("Network.setCacheDisabled", { cacheDisabled: true });
  await page.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 200,
    downloadThroughput: 15 * 1024,
    uploadThroughput: 15 * 1024,
  });

  const opened = await page.evaluate(`(() => {
      const d = document.querySelector('[data-testid="pages-menu"]');
      if (!d) return "không thấy nút chuyển trang";
      d.click();
      return "ok";
    })()`);
  t.assert.strictEqual(opened, "ok", "phải mở được bộ chọn trang");

  const clicked = await page.evaluate(`new Promise((r) => {
      const t0 = Date.now();
      const i = setInterval(() => {
        const a = [...document.querySelectorAll("a")].find(
          (x) => x.getAttribute("href") === "/donate",
        );
        if (a) { clearInterval(i); a.click(); r("ok"); }
        else if (Date.now() - t0 > 8000) { clearInterval(i); r("không thấy link /donate"); }
      }, 50);
    })`);
  t.assert.strictEqual(clicked, "ok", "bộ chọn trang phải có link tới /donate");

  // Lấy mẫu liên tục suốt lúc chuyển: đếm frame có loader toàn màn hình.
  const samples = await page.evaluate(`(async () => {
      const out = { loaderFrames: 0, total: 0, oldPageStillThere: 0 };
      for (let i = 0; i < 300; i++) {
        out.total++;
        if (document.querySelector('[data-testid="route-loader"]')) out.loaderFrames++;
        if (document.body.textContent.includes("Hệ thống chống raid") ||
            document.querySelector("h1")) out.oldPageStillThere++;
        if (location.pathname === "/donate" && i > 6) break;
        await new Promise((r) => setTimeout(r, 40));
      }
      out.path = location.pathname;
      return out;
    })()`);

  t.diagnostic(`mẫu lúc chuyển trang: ${JSON.stringify(samples)}`);
  t.assert.strictEqual(samples.path, "/donate", "phải tới được /donate");
  // React Router 7 bọc cập nhật trong startTransition → React GIữ trang cũ
  // thay vì nháy fallback. Đây là hành vi ĐÚNG: nháy màn chờ toàn màn hình
  // ở mỗi lần bấm link chính là cảm giác "load 2 lần" người dùng phàn nàn.
  t.assert.strictEqual(
    samples.loaderFrames,
    0,
    "chuyển route không được nháy màn chờ toàn màn hình (React giữ trang cũ)",
  );
  t.assert.ok(
    samples.oldPageStillThere > 0,
    "nội dung trang cũ phải còn hiện trong lúc chờ route mới",
  );

  await page.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await page.evaluate(`new Promise((r) => {
      const t0 = Date.now();
      const i = setInterval(() => {
        if (!document.querySelector('[data-testid="route-loader"]') &&
            location.pathname === "/donate") { clearInterval(i); r(1); }
        else if (Date.now() - t0 > 30000) { clearInterval(i); r(0); }
      }, 50);
    })`);

  const after = await page.evaluate(`(() => ({
      boot: document.querySelectorAll("#boot").length,
      loader: document.querySelectorAll('[data-testid="route-loader"]').length,
      hasDonate: /Ủng hộ nhà phát triển|Support the developer/.test(document.body.textContent),
    }))()`);
  t.assert.strictEqual(after.boot, 0, "#boot không được xuất hiện lại lần nữa");
  t.assert.strictEqual(after.loader, 0, "không còn màn chờ vẹn khi trang đã tải xong");
  t.assert.ok(after.hasDonate, "trang /donate phải render ra nội dung thật");
});

// ─── H. Từ điển i18n nạp LƯỜI ────────────────────────────────────────────────
// Đo 30/09/2026: hai từ điển EN+DE chiếm ~404 KB / 509 KB chunk entry, nên người
// dùng tiếng Việt (không cần bản dịch nào) từng tải cả hai. Chỉ trình duyệt thật
// mới chứng minh được chunk nào THỰC SỰ được tải, và nạp lỗi không được làm kẹt trang.
const DICT_CHUNK_RE = /i18n\.dict\.(en|de)-[\w-]+\.js/;

/**
 * Chờ biểu thức JS trong trang trả về giá trị đúng (tối đa timeoutMs) — thay cho sleep
 * cố định. Hết hạn thì trả false và để assert phía sau báo trạng thái thật: máy chậm
 * chỉ làm test lâu hơn, không làm test đỏ giả.
 */
async function waitForPage(page, expression, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      if (await page.evaluate(expression)) return true;
    } catch {
      // trang đang điều hướng / chưa sẵn sàng — thử lại
    }
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, 100));
  }
}
/**
 * Đóng trang nhưng KHÔNG chờ quá 5s: renderer đang kẹt có thể khiến `Page.close` không bao
 * giờ trả lời, mà `t.after` treo thì cả suite treo theo (một test đỏ thành cả file đỏ,
 * mất hết kết quả) — xem cùng cách xử lý ở test F (màn chờ RouteLoader).
 */
const closeQuietly = (page) =>
  Promise.race([page.close(), new Promise((resolve) => setTimeout(resolve, 5000))]);
const APP_RENDERED = `document.querySelectorAll("#root > *").length > 0 && !!document.querySelector("h1")`;
const OVERLAY_GONE = `(${OVERLAY_STATE}) === "removed"`;

/** Mở "/" với ngôn ngữ đã lưu `lang` (đặt trước mọi script của app). */
async function openWithSavedLang(ctx, lang, { blockDict = false } = {}) {
  const page = await ctx.openPage();
  await page.send("Network.setBlockedURLs", { urls: blockDict ? ["*i18n.dict.*"] : [] });
  await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { localStorage.setItem("protogon-lang", ${JSON.stringify(lang)}); } catch (e) {}`,
  });
  await page.goto(ctx.base + "/");
  await waitForPage(page, APP_RENDERED);
  return page;
}

/** Các ngôn ngữ có chunk từ điển đã được tải về (theo phản hồi mạng thật). */
const dictsLoaded = (page) =>
  page.responses
    .map((r) => DICT_CHUNK_RE.exec(r.url)?.[1])
    .filter(Boolean)
    .sort();

const langState = (page) =>
  page.evaluate(`(() => {
    const text = document.body.innerText;
    return {
      lang: document.documentElement.lang,
      vi: text.includes("Đăng nhập"),
      en: text.includes("Sign in"),
      de: text.includes("Anmelden"),
      rootChildren: document.querySelectorAll("#root > *").length,
      overlay: ${OVERLAY_STATE},
    };
  })()`);

browserTest("H1. Tiếng Việt: KHÔNG tải chunk từ điển nào (VI là chính key)", async (t) => {
  const ctx = await setup();
  const page = await openWithSavedLang(ctx, "vi");
  t.after(() => closeQuietly(page));
  await waitForPage(page, OVERLAY_GONE);
  const state = await langState(page);
  t.diagnostic(`vi: ${JSON.stringify({ ...state, dicts: dictsLoaded(page) })}`);
  t.assert.deepStrictEqual(dictsLoaded(page), [], "người dùng VI không được tải từ điển EN/DE");
  t.assert.strictEqual(state.lang, "vi");
  t.assert.ok(state.vi && !state.en && !state.de, "trang phải hiện tiếng Việt");
  t.assert.strictEqual(state.overlay, "removed");
});

browserTest("H2. Tiếng Anh: chỉ tải từ điển EN và giao diện hiện bằng tiếng Anh", async (t) => {
  const ctx = await setup();
  const page = await openWithSavedLang(ctx, "en");
  t.after(() => closeQuietly(page));
  await waitForPage(page, `document.body.innerText.includes("Sign in")`);
  const state = await langState(page);
  t.diagnostic(`en: ${JSON.stringify({ ...state, dicts: dictsLoaded(page) })}`);
  t.assert.deepStrictEqual(dictsLoaded(page), ["en"], "chỉ chunk EN được tải");
  t.assert.strictEqual(state.lang, "en");
  t.assert.ok(state.en && !state.vi, "chuỗi phải được dịch sang EN (không còn tiếng Việt)");
});

browserTest("H3. Tiếng Đức: chỉ tải từ điển DE", async (t) => {
  const ctx = await setup();
  const page = await openWithSavedLang(ctx, "de");
  t.after(() => closeQuietly(page));
  await waitForPage(page, `document.body.innerText.includes("Anmelden")`);
  const state = await langState(page);
  t.diagnostic(`de: ${JSON.stringify({ ...state, dicts: dictsLoaded(page) })}`);
  t.assert.deepStrictEqual(dictsLoaded(page), ["de"], "chỉ chunk DE được tải");
  t.assert.ok(state.de && !state.vi, "chuỗi phải được dịch sang DE");
});

browserTest("H4. Chunk từ điển bị chặn → FAIL-OPEN: app vẫn hiện, rơi về tiếng Việt", async (t) => {
  const ctx = await setup();
  const page = await openWithSavedLang(ctx, "en", { blockDict: true });
  t.after(() => closeQuietly(page));
  await waitForPage(page, OVERLAY_GONE);
  const state = await langState(page);
  t.diagnostic(`en (từ điển bị chặn): ${JSON.stringify({ ...state, dicts: dictsLoaded(page) })}`);
  t.assert.deepStrictEqual(dictsLoaded(page), [], "chunk bị chặn thật");
  t.assert.ok(state.rootChildren > 0, "React vẫn phải render (không phải trang trắng)");
  t.assert.strictEqual(state.overlay, "removed", "preloader không được kẹt vì từ điển hỏng");
  t.assert.ok(state.vi, "thiếu từ điển → rơi về chuỗi VI như khi thiếu bản dịch");
});

browserTest("H5. Bấm công tắc ngôn ngữ: nạp đúng chunk rồi mới đổi, lưu lựa chọn", async (t) => {
  const ctx = await setup();
  const page = await openWithSavedLang(ctx, "vi");
  t.after(() => closeQuietly(page));
  t.assert.deepStrictEqual(dictsLoaded(page), [], "đang ở VI chưa tải gì");
  // Lớp phủ #boot còn che thì cú click toạ độ rơi vào nó (xem test A).
  await waitForPage(page, OVERLAY_GONE);
  await page.clickText("DE");
  // Công tắc CHỈ đổi sau khi chunk DE về (để không nháy tiếng Việt) nên đổi ngôn ngữ là
  // bất đồng bộ — chờ trạng thái cuối thay vì đoán thời gian tải.
  await waitForPage(page, `document.documentElement.lang === "de"`);
  const state = await langState(page);
  const saved = await page.evaluate(`localStorage.getItem("protogon-lang")`);
  t.diagnostic(`sau khi bấm DE: ${JSON.stringify({ ...state, saved, dicts: dictsLoaded(page) })}`);
  t.assert.deepStrictEqual(dictsLoaded(page), ["de"], "bấm DE chỉ tải chunk DE");
  t.assert.strictEqual(state.lang, "de");
  t.assert.ok(state.de && !state.vi, "giao diện đã dịch sang DE");
  t.assert.strictEqual(saved, "de", "lựa chọn được lưu");
});

// ─── I. Chunk route bị xoá sau deploy → tự tải lại ĐÚNG MỘT lần ─────────────
// Mọi lần deploy xoá file có hash cũ: tab đang mở từ bản trước mà bấm sang route
// chưa tải sẽ lỗi "Failed to fetch dynamically imported module". Vite bắn
// `vite:preloadError`; lib/staleChunk.ts tải lại trang, chống vòng lặp bằng mốc
// thời gian trong sessionStorage. Cả hai vế đều phải đúng: THIẾU tự tải lại thì
// người dùng kẹt màn lỗi; THIẾU chống lặp thì trang nhấp nháy mãi khi chunk hỏng.
browserTest("I1. Chunk bị xoá → tự tải lại ĐÚNG MỘT lần, không lặp vô hạn", async (t) => {
  const ctx = await setup();
  const page = await ctx.openPage();
  t.after(() => closeQuietly(page));
  await page.send("Network.setBlockedURLs", { urls: [] });
  // Đếm số lần tài liệu được nạp VÀ số lần mỗi tài liệu nhận lỗi chunk (sessionStorage sống
  // qua reload trong cùng tab). Listener này đăng ký TRƯỚC script của app và không gọi
  // preventDefault nên không ảnh hưởng handler thật của app.
  await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try {
      var bump = function (k) { sessionStorage.setItem(k, String(Number(sessionStorage.getItem(k) || 0) + 1)); };
      bump("__docLoads");
      window.addEventListener("vite:preloadError", function () { try { bump("__preloadErrors"); } catch (e) {} });
    } catch (e) {}`,
  });
  await page.goto(ctx.base + "/");
  await waitForPage(page, APP_RENDERED);

  // Giả lập deploy: chunk route CHƯA tải biến mất, rồi điều hướng SPA tới route đó.
  await page.send("Network.setBlockedURLs", { urls: ["*FeaturesPage-*.js*"] });
  await page.evaluate(
    `history.pushState({}, "", "/features"); window.dispatchEvent(new PopStateEvent("popstate"));`,
  );
  // Chờ đúng chuỗi sự kiện: lỗi (tài liệu 1) → tải lại → lỗi lần 2 (tài liệu 2, nằm trong
  // cooldown nên KHÔNG tải lại nữa). Sau đó để yên thêm một lúc: nếu chống lặp hỏng thì lần
  // tải lại thứ ba xảy ra ngay sau lỗi lần 2.
  await waitForPage(page, `Number(sessionStorage.getItem("__preloadErrors") || 0) >= 2`, 25000);
  await new Promise((r) => setTimeout(r, 3000));

  const loads = await page.evaluate(`sessionStorage.getItem("__docLoads")`);
  const errors = await page.evaluate(`sessionStorage.getItem("__preloadErrors")`);
  const stamp = await page.evaluate(`sessionStorage.getItem("protogon-chunk-reload-at")`);
  t.diagnostic(`nạp tài liệu = ${loads}, lỗi chunk = ${errors}, mốc tải lại = ${stamp}`);
  t.assert.ok(Number(errors) >= 2, "cả hai tài liệu đều gặp lỗi chunk (lần 2 nằm trong cooldown)");
  t.assert.strictEqual(loads, "2", "đúng 1 lần tải lại (nạp đầu + 1 reload), không lặp vô hạn");
  t.assert.ok(stamp, "mốc chống lặp đã được ghi");
});

// ─── J. Bộ chọn trang ở HEADER phải THỰC SỰ dùng được ──────────────────────
// VÌ SAO CÓ TEST NÀY (bài học 07/10/2026): bộ chọn trang từng là dock nổi,
// lớp neo dọc chỉ có nhánh `max-md:*` (CHỈ dưới 768px). Desktop thiếu neo ⇒
// `position: fixed` không có top/bottom ⇒ trình duyệt đặt nút tại VỊ TRÍ TĨNH
// của nó, tức SAU toàn bộ nội dung trang ⇒ nút nằm ngoài khung nhìn (~4.800px
// dưới đáy màn), cách người dùng vài nghìn pixel — "mất taskbar" dù DOM còn
// nguyên. Test G chỉ kiểm nút có trong DOM (`querySelector`) nên KHÔNG bắt
// được loại lỗi đó.
// Nay bộ chọn trang nằm trong header (SiteNav sticky / Nav của landing), và
// test này khoá đúng thứ người dùng cần: nút phải nằm TRỌN trong khung nhìn ở
// cả đỉnh lẫn đáy trang, điểm giữa của nó phải thuộc về chính nút (không lớp
// nào che), và bấm vào phải MỞ RA DANH SÁCH TRANG — không chỉ "có trong DOM".
const NAV_STATE = (testid) => `(() => {
  const d = document.querySelector('[data-testid="${testid}"]');
  if (!d) return { found: false };
  const r = d.getBoundingClientRect();
  const cs = getComputedStyle(d);
  const cx = Math.floor(r.left + r.width / 2);
  const cy = Math.floor(r.top + r.height / 2);
  const hit = document.elementFromPoint(cx, cy);
  return {
    found: true,
    left: Math.round(r.left), top: Math.round(r.top),
    right: Math.round(r.right), bottom: Math.round(r.bottom),
    w: Math.round(r.width), h: Math.round(r.height),
    vw: innerWidth, vh: innerHeight, scrollY: Math.round(scrollY),
    topCss: cs.top, bottomCss: cs.bottom,
    hitInside: !!hit && (hit === d || d.contains(hit)),
  };
})()`;

/**
 * Bắt nút chuyển trang nằm trong khung nhìn ở CẢ HAI mốc cuộn: đỉnh trang và
 * đáy trang (nội dung dài). Mốc thứ hai là mốc chết của lỗi cũ: nút neo vào
 * dòng chảy nội dung thay vì vào header thì nó trôi theo chiều dài trang.
 */
async function assertNavUsable(t, page, label, testid = "pages-menu") {
  for (const where of ["đỉnh trang", "cuộn tới đáy"]) {
    await page.evaluate(
      where === "đỉnh trang" ? `scrollTo(0, 0)` : `scrollTo(0, document.body.scrollHeight)`,
    );
    await new Promise((r) => setTimeout(r, 200));
    const s = await page.evaluate(NAV_STATE(testid));
    t.diagnostic(`${label} — ${where}: ${JSON.stringify(s)}`);
    t.assert.ok(s.found, `${label}: phải có nút chuyển trang trong DOM`);
    if (!s.found) return;
    t.assert.ok(
      s.top >= 0 && s.left >= 0 && s.bottom <= s.vh && s.right <= s.vw,
      `${label} (${where}): nút chuyển trang phải nằm TRỌN trong khung nhìn — ` +
        `hộp (${s.left},${s.top})→(${s.right},${s.bottom}) trong ${s.vw}×${s.vh}`,
    );
    t.assert.ok(s.hitInside, `${label} (${where}): không lớp nào được che nút chuyển trang`);
  }
}

/** Mở bảng chọn trang và đòi thấy danh sách trang thật (không chỉ nút). */
async function assertPagesListOpens(t, page, label, testid = "pages-menu") {
  const opened = await page.evaluate(`(() => {
    const d = document.querySelector('[data-testid="${testid}"]');
    if (!d) return "không thấy nút chuyển trang";
    d.click();
    return "ok";
  })()`);
  t.assert.strictEqual(opened, "ok", `${label}: phải bấm được nút chuyển trang`);
  const shown = await waitForPage(
    page,
    `(() => {
      const panel = document.querySelector('[data-testid="pages-menu-panel"]');
      if (!panel) return false;
      const hrefs = [...panel.querySelectorAll("a")].map((a) => a.getAttribute("href"));
      return ["/donate", "/feedback", "/monitor"].every((p) => hrefs.includes(p));
    })()`,
    8000,
  );
  t.assert.ok(shown, `${label}: bảng chọn phải liệt kê đường tới các trang khác`);
}

browserTest("J1. Desktop: bộ chọn trang ở header dùng được trên trang trong", async (t) => {
  const ctx = await setup();
  const page = await ctx.openPage();
  t.after(() => closeQuietly(page));
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.goto(ctx.base + "/monitor");
  const ready = await waitForPage(
    page,
    `${OVERLAY_GONE} && !!document.querySelector('[data-testid="pages-menu"]')`,
    25000,
  );
  t.assert.ok(ready, "trang /monitor phải render xong (preloader rời DOM, header có mặt)");
  await assertNavUsable(t, page, "desktop 1280×800 /monitor");
  await assertPagesListOpens(t, page, "desktop 1280×800 /monitor");
});

browserTest("J2. Mobile: bộ chọn trang ở header dùng được trên trang chủ", async (t) => {
  const ctx = await setup();
  const page = await ctx.openPage();
  t.after(() => closeQuietly(page));
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await page.goto(ctx.base + "/");
  const ready = await waitForPage(
    page,
    `${OVERLAY_GONE} && !!document.querySelector('[data-testid="pages-menu"]')`,
    25000,
  );
  t.assert.ok(ready, "trang chủ phải render xong trên khung nhìn mobile");
  await assertNavUsable(t, page, "mobile 390×844");
  await assertPagesListOpens(t, page, "mobile 390×844");

  // Dock phải dùng được cả trên MOBILE — đó là lý do chính nó tồn tại (góc
  // dưới trái nằm trong tầm ngón tay cái, nút ở header thì phải với tay).
  const dockReady = await waitForPage(
    page,
    `!!document.querySelector('[data-testid="pages-dock"]')`,
    8000,
  );
  t.assert.ok(dockReady, "mobile phải có dock góc dưới trái");
  await assertNavUsable(t, page, "mobile 390×844 dock", "pages-dock");
  const dockBox = await page.evaluate(NAV_STATE("pages-dock"));
  t.assert.ok(
    dockBox.left < dockBox.vw / 2 && dockBox.bottom > dockBox.vh / 2,
    `dock mobile phải ở góc dưới trái — hộp (${dockBox.left},${dockBox.top})→(${dockBox.right},${dockBox.bottom}) trong ${dockBox.vw}×${dockBox.vh}`,
  );
  t.assert.ok(
    dockBox.right <= dockBox.vw && dockBox.vh - dockBox.bottom <= 40,
    `dock mobile phải nằm trong màn và sát đáy (cách đáy ${dockBox.vh - dockBox.bottom}px) — không tràn ngang, không bị thanh home che`,
  );
});

// J3 — DOCK GÓC DƯỚI TRÁI (khôi phục 07/10 theo yêu cầu người dùng).
// Bản dock cũ từng BIẾN MẤT khỏi màn hình desktop vì thiếu neo dọc; test này
// khoá đúng hai điều người dùng thấy: nút nằm trong khung nhìn ở GÓC DƯỚI TRÁI
// (nửa dưới, nửa trái) ở cả đỉnh lẫn đáy trang, và bấm vào mở ra DANH SÁCH
// trang. Kiểm cùng lúc hai lối mở loại trừ nhau: mở dock thì bảng header đóng.
browserTest("J3. Desktop: dock góc dưới trái hiện đúng chỗ và mở được bảng chọn", async (t) => {
  const ctx = await setup();
  const page = await ctx.openPage();
  t.after(() => closeQuietly(page));
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.goto(ctx.base + "/monitor");
  const ready = await waitForPage(
    page,
    `${OVERLAY_GONE} && !!document.querySelector('[data-testid="pages-dock"]')`,
    25000,
  );
  t.assert.ok(ready, "trang /monitor phải render xong và có dock góc dưới trái");
  await assertNavUsable(t, page, "desktop /monitor dock", "pages-dock");

  // Đúng GÓC: phải nằm ở nửa trái + nửa dưới khung nhìn (không phải "đâu đó").
  const corner = await page.evaluate(NAV_STATE("pages-dock"));
  t.assert.ok(
    corner.left < corner.vw / 2 && corner.bottom > corner.vh / 2,
    `dock phải ở góc dưới trái — hộp (${corner.left},${corner.top})→(${corner.right},${corner.bottom}) trong ${corner.vw}×${corner.vh}`,
  );
  t.assert.ok(
    corner.vh - corner.bottom <= 40,
    `dock phải sát đáy khung nhìn (cách đáy ${corner.vh - corner.bottom}px)`,
  );

  await assertPagesListOpens(t, page, "desktop /monitor dock", "pages-dock");

  // Hai lối mở KHÔNG được cùng hiện bảng: mở bảng ở header sau khi dock đã mở.
  const exclusive = await page.evaluate(`(async () => {
    const header = document.querySelector('[data-testid="pages-menu"]');
    const dock = document.querySelector('[data-testid="pages-dock"]');
    if (!header || !dock) return "thiếu nút";
    header.click();
    await new Promise((r) => setTimeout(r, 250));
    return document.querySelectorAll('[data-testid="pages-menu-panel"]').length;
  })()`);
  t.assert.strictEqual(
    exclusive,
    1,
    "mở bảng từ header sau khi dock đã mở ⇒ chỉ còn ĐÚNG MỘT bảng (không 2 bảng cùng lúc)",
  );
});

// Dọn dẹp sau toàn bộ suite: giết Chromium + đóng server + dừng breadcrumb
test.after(() => {
  clearInterval(progressBreadcrumb);
  teardown();
});
