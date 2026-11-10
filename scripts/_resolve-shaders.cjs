/**
 * Kiểm tra graph phân giải của cây ThreeUI đã vendored — KHÔNG chạy production
 * build, chỉ hỏi Vite resolver "mọi import trong src/shaders/ + adapter trỏ
 * tới file thật chứ?".
 *
 * Vì sao cần: tsc tự có bộ quy tắc riêng (và `vite/client` khai báo sẵn mọi
 * `?raw`), nên tsc xanh KHÔNG chứng minh Vite dựng được. Biến `three` và 17
 * file `sources/*.html?raw` chỉ lộ ra lúc Vite resolve. Đây là chỗ hỏng
 * im lặng của một lần vendor dependency.
 *
 * Chạy: node scripts/_resolve-shaders.cjs
 *
 * ENTRY là `SkeuomorphicToggleCollection` (không phải `ui/switch.tsx` nữa):
 * switch đã import thẳng `ModernToggle` để cắt chunk three khỏi build graph,
 * nên nếu vẫn bắt đầu từ switch thì script sẽ không còn đi qua glass/shader/
 * packaged — đúng những file cần kiểm tra nhất.
 */
const path = require("node:path");
const fs = require("node:fs");
const { createServer } = require("vite");

const ROOT = path.join(__dirname, "..");
const ENTRY = path.join(
  ROOT,
  "src/shaders/skeuomorphic-toggle/SkeuomorphicToggleCollection.tsx",
);

async function main() {
  const server = await createServer({
    root: ROOT,
    logLevel: "silent",
    server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const seen = new Set();
    const queue = [ENTRY];
    const failures = [];
    let checked = 0;
    let threeResolved = null;

    while (queue.length) {
      const importer = queue.pop();
      if (seen.has(importer)) continue;
      seen.add(importer);

      let code;
      try {
        code = fs.readFileSync(importer, "utf8");
      } catch {
        continue; // CSS hoặc ?raw — không parse như TS
      }
      if (!/\.(ts|tsx|js|jsx)$/.test(importer)) continue;
      /* Không đào vào node_modules: nội dung pre-bundled của Vite chứa code
         đã minify, regex của ta sẽ bắt nhầm chuỗi trong đó (false positive).
         Ta chỉ cần biết dependency CÓ resolve, không cần duyệt bên trong nó. */
      if (importer.includes("node_modules")) continue;

      const specifiers = new Set();
      const re = /(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g;
      const re2 = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
      const re3 = /import\s*["']([^"']+)["']/g;
      for (const r of [re, re2, re3]) {
        let m;
        while ((m = r.exec(code))) specifiers.add(m[1]);
      }

      for (const spec of specifiers) {
        checked++;
        if (spec.startsWith("\0")) continue; // virtual
        if (spec.startsWith(".") || spec.startsWith("/")) {
          // import tương đối: chỉ quan tâm nó có tồn tại không
        } else if (spec.includes(":")) {
          continue; // react/jsx-runtime, vite/client… — do plugin ảo cấp
        }
        try {
          const resolved = await server.pluginContainer.resolveId(spec, importer);
          if (!resolved) {
            failures.push(`${path.relative(ROOT, importer)} → ${spec}  (KHÔNG resolve)`);
            continue;
          }
          if (spec === "three") threeResolved = resolved.id;
          const id = resolved.id.split("?")[0];
          if (id.includes("node_modules")) continue;
          if (fs.existsSync(id)) queue.push(id);
        } catch (error) {
          failures.push(`${path.relative(ROOT, importer)} → ${spec}  (${error.message})`);
        }
      }
    }

    const shaders = [...seen].filter((f) => f.includes("src/shaders"));
    const html = [...seen].filter((f) => f.endsWith(".html"));
    console.log(`module đã duyệt : ${seen.size}`);
    console.log(`  · trong src/shaders : ${shaders.length}`);
    console.log(`  · HTML ?raw nối được: ${html.length}/18`);
    console.log(
      `  · three nối được    : ${
        threeResolved ? path.basename(threeResolved) : "KHÔNG — cảnh báo"
      }`,
    );
    console.log(`import đã thử      : ${checked}`);
    if (failures.length === 0 && !threeResolved) {
      failures.push("import `three` không resolve được");
    }
    if (failures.length) {
      console.error(`\n❌ ${failures.length} import KHÔNG resolve:`);
      for (const f of failures.slice(0, 30)) console.error("   " + f);
      process.exitCode = 1;
    } else {
      console.log("\n✅ Mọi import trong cây ThreeUI + adapter đều resolve được.");
    }
  } finally {
    await server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
