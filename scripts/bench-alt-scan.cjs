// Benchmark cô lập trên Linux.
// rustc --edition=2021 --crate-name alt_scan -O scripts/support/alt-scan.rs -o /tmp/alt-scan
// bun scripts/bench-alt-scan.cjs /tmp/alt-scan
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { scanGuildForAltsAsync } = require("../bot/src/altDetection");

const MODES = ["current", "bun-worker", "rust"];
const SAMPLE_MS = 10;
const SOURCES = [
  ["username", "username", "username"],
  ["displayname", "nickname", "nickname"],
  ["cross_name", "nickname", "username"],
  ["cross_name", "username", "nickname"],
];

function membersFromNames(names) {
  return names.map(([username, nickname], index) => ({
    id: String(index),
    user: { username, bot: false },
    nickname,
  }));
}

function fixtureNames(size) {
  let seed = 30011;
  const charset = "abcdefghijklmnopqrstuvwxyz0123456789";
  const name = () => {
    let text = "";
    for (let index = 0; index < 12; index++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      text += charset[(seed >>> 16) % charset.length];
    }
    return text;
  };
  const names = [];
  for (let i = 0; i < size; i++) {
    names.push([i % 41 === 1 ? names[i - 1][0] : name(), name()]);
  }
  return names;
}

async function runBun(members, threshold, useWorker = false) {
  const cache = new Map(members.map((member) => [member.id, member]));
  const result = await scanGuildForAltsAsync(
    { members: { cache } },
    { altSimilarityThreshold: threshold },
    { deadlineMs: 60_000, useWorker },
  );
  assert.equal(result.truncated, false, "bộ quét gốc phải hoàn tất để đối chiếu");
  assert.equal(result.engine, useWorker ? "worker" : "main");
  return result.links;
}

async function runProcess(args, options = {}) {
  const child = globalThis.Bun.spawn(args, {
    stdin: options.input === undefined ? "ignore" : new Blob([options.input]),
    stdout: "pipe",
    stderr: "pipe",
  });
  options.onChild?.(child.pid);
  try {
    const [output, error, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    assert.equal(code, 0, error || args[0] + " không chạy được");
    return output;
  } finally {
    options.onChild?.(null);
  }
}

async function runRust(binary, members, threshold, onChild) {
  const normalize = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const input = members
    .map(({ user, nickname }) => [normalize(user.username), nickname ? normalize(nickname) : null])
    .map(([user, nick]) => (nick === null ? user : [user, nick].join("\t")) + "\n")
    .join("");
  const data = await runProcess([binary, String(threshold)], { input, onChild });
  return data
    ? data
        .trimEnd()
        .split("\n")
        .map((line) => line.split("\t").map(Number))
    : [];
}

function toLinks(members, matches) {
  const name = (member, field) => (field === "nickname" ? member.nickname : member.user.username);
  return matches
    .map(([i, j, kind, similarity]) => {
      const [reason, left, right] = SOURCES[kind];
      return {
        userId1: members[i].id,
        userId2: members[j].id,
        username1: name(members[i], left),
        username2: name(members[j], right),
        similarity,
        reason: reason + "_similarity_" + similarity + "%",
      };
    })
    .sort((a, b) => b.similarity - a.similarity);
}

async function verify(binary) {
  const members = membersFromNames([
    ["linh12345", "tên riêng"],
    ["Linh12346", "nickkhac"],
    ["nguyenvana", "nickkhac"],
    ["nguyenvanb", "tên riêng"],
    ["User123456", "NGUYENVANA"],
    ["user654321", "nguyenvanb"],
    ["User123456", null],
    ["linh", "👍"],
    ["linh", ""],
    ["K12345", "họ và tên"],
    ["k12345", null],
    ["😀", null],
    ...fixtureNames(100),
  ]);
  const thresholds = [0, 1, 50, 70, 80, 85, 100, 101];
  for (const threshold of thresholds) {
    const expected = await runBun(members, threshold);
    assert.deepEqual(await runBun(members, threshold, true), expected, "Bun worker");
    assert.deepEqual(toLinks(members, await runRust(binary, members, threshold)), expected, "Rust");
  }
  console.log("Khớp toàn bộ kết quả ở " + thresholds.length + " ngưỡng điểm trên 112 thành viên.");
}

function rss(pid) {
  if (!pid) return 0;
  try {
    const line = readFileSync("/proc/" + pid + "/status", "utf8").match(/^VmRSS:\s+(\d+)/m);
    return Number(line?.[1] ?? 0) * 1024;
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ESRCH") return 0;
    throw error;
  }
}

function percentile(numbers, fraction) {
  const sorted = [...numbers].sort((a, b) => a - b);
  return sorted[Math.ceil(fraction * sorted.length) - 1] ?? 0;
}

async function measure(mode, binary, size) {
  const members = membersFromNames(fixtureNames(size));
  const initialRss = process.memoryUsage.rss();
  let activeChild = null;
  let peakRss = initialRss;
  const lag = [];
  const started = performance.now();
  let previous = started;
  const sampler = setInterval(() => {
    const now = performance.now();
    lag.push(Math.max(0, now - previous - SAMPLE_MS));
    previous = now;
    peakRss = Math.max(peakRss, process.memoryUsage.rss() + rss(activeChild));
  }, SAMPLE_MS);
  try {
    const threshold = 70;
    let links;
    if (mode === "current") {
      links = await runBun(members, threshold);
    } else if (mode === "bun-worker") {
      links = await runBun(members, threshold, true);
    } else {
      const matches = await runRust(binary, members, threshold, (pid) => (activeChild = pid));
      links = toLinks(members, matches);
    }
    const elapsedMs = performance.now() - started;
    // Ghi độ trễ của khoảng cuối, kể cả khi job kết thúc trước nhịp timer tiếp theo.
    lag.push(Math.max(0, performance.now() - previous - SAMPLE_MS));
    return {
      elapsedMs,
      peakExtraMiB: (Math.max(peakRss, process.memoryUsage.rss()) - initialRss) / 1024 ** 2,
      lagP95Ms: percentile(lag, 0.95),
      results: links.length,
      digest: createHash("sha256").update(JSON.stringify(links)).digest("hex"),
    };
  } finally {
    clearInterval(sampler);
  }
}

async function main() {
  const [binary, mode, rawSize] = process.argv.slice(2);
  assert(globalThis.Bun, "Chạy benchmark bằng Bun.");
  assert(binary, "Cần truyền đường dẫn tới bộ quét Rust đã biên dịch.");
  if (mode === "--verify") return verify(binary);
  if (mode) {
    assert(MODES.includes(mode));
    console.log(JSON.stringify(await measure(mode, binary, Number(rawSize))));
    return;
  }

  await verify(binary);
  const sizes = [500, 1000, 2000];
  for (const size of sizes) {
    const samples = new Map(MODES.map((name) => [name, []]));
    for (let round = 0; round < 3; round++) {
      for (const offset of MODES.keys()) {
        const name = MODES[(offset + round) % MODES.length];
        const output = await runProcess([process.execPath, __filename, binary, name, String(size)]);
        samples.get(name).push(JSON.parse(output));
      }
    }
    const all = [...samples.values()].flat();
    assert.equal(
      new Set(all.map(({ digest }) => digest)).size,
      1,
      "các bộ quét phải trả cùng kết quả",
    );
    for (const [name, runs] of samples) {
      const median = (field) =>
        Number(
          percentile(
            runs.map((run) => run[field]),
            0.5,
          ).toFixed(2),
        );
      console.log(
        JSON.stringify({
          members: size,
          mode: name,
          elapsedMs: median("elapsedMs"),
          peakExtraMiB: median("peakExtraMiB"),
          lagP95Ms: median("lagP95Ms"),
          matches: runs[0].results,
        }),
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
