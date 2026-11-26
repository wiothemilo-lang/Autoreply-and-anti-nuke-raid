const { Worker, isMainThread, parentPort, workerData } = require("node:worker_threads");

const MAX_MEMBERS = 2000;
const DEADLINE_MS = 20_000;
const PAIRS_PER_CHUNK = 2000;
const MATCH_SOURCES = [
  ["username", "username", "username"],
  ["displayname", "nickname", "nickname"],
  ["cross_name", "nickname", "username"],
  ["cross_name", "username", "nickname"],
];

function prepareName(name) {
  const text = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const digits = text.match(/\d+$/)?.[0].length ?? 0;
  return {
    text,
    digits,
    core: text.slice(0, text.length - digits),
    isDefault: /^user\d+$/.test(text),
  };
}

// Levenshtein với một hàng dùng lại cho mọi cặp trong một lượt quét.
function distance(a, b, row = new Int32Array(b.length + 1)) {
  for (let j = 0; j <= b.length; j++) row[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    const letter = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(above + 1, row[j - 1] + 1, diagonal + (letter !== b.charCodeAt(j - 1)));
      diagonal = above;
    }
  }
  return row[b.length];
}

function similarity(left, right, row) {
  const a = left.text;
  const b = right.text;
  const minLen = Math.min(a.length, b.length);
  // Tên ngắn dễ trùng ngẫu nhiên. Bỏ qua mẫu tên Discord mặc định trừ trường hợp trùng hẳn.
  if (minLen < 5) return 0;
  if (a === b) return 100;
  if (left.isDefault || right.isDefault) return 0;

  const maxLen = Math.max(a.length, b.length);
  const base = Math.round((1 - distance(a, b, row) / maxLen) * 100);
  let prefix = 0;
  const prefixCap = Math.min(minLen, 12);
  while (prefix < prefixCap && a[prefix] === b[prefix]) prefix++;
  if (left.digits && right.digits && left.core.length >= 5 && left.core === right.core) {
    return Math.min(100, base + Math.min(6, prefix) + 10);
  }
  if (prefix < 5) return Math.min(100, base + prefix);
  // Tên thật có thể chung tiền tố dài. Giữ quy tắc hạ điểm khi hai hậu tố ngắn khác nhau.
  const tailA = a.length - prefix;
  const tailB = b.length - prefix;
  const shortTails = tailA > 0 && tailA <= 3 && tailB > 0 && tailB <= 3;
  const bothNumeric = tailA > 0 && tailB > 0 && tailA <= left.digits && tailB <= right.digits;
  return shortTails && !bothNumeric ? Math.min(80, base) : base;
}

function usernameSimilarity(left, right) {
  return similarity(prepareName(left), prepareName(right));
}

function firstMatch(a, b, threshold, row) {
  const userScore = similarity(a.user, b.user, row);
  if (userScore >= threshold) return [0, userScore];
  if (a.nick && b.nick) {
    const score = similarity(a.nick, b.nick, row);
    if (score >= threshold) return [1, score];
  }
  if (a.nick) {
    const score = similarity(a.nick, b.user, row);
    if (score >= threshold) return [2, score];
  }
  if (b.nick) {
    const score = similarity(a.user, b.nick, row);
    if (score >= threshold) return [3, score];
  }
  return null;
}

function storeLink(links, limit, a, b, [kind, score]) {
  if (limit === 0) return;
  if (links.length === limit && score <= links[limit - 1].similarity) return;
  const [reason, left, right] = MATCH_SOURCES[kind];
  const link = {
    userId1: a.id,
    userId2: b.id,
    username1: a[left],
    username2: b[right],
    similarity: score,
    reason: reason + "_similarity_" + score + "%",
  };
  if (limit === Infinity) {
    links.push(link);
    return;
  }
  // Lịch định kỳ chỉ in 3 cặp đầu. Giữ thứ tự gặp cặp khi bằng điểm.
  const index = links.findIndex((item) => item.similarity < score);
  links.splice(index < 0 ? links.length : index, 0, link);
  if (links.length > limit) links.pop();
}

function timedOut() {
  return { links: [], linkCount: 0, scanned: 0, hitDeadline: true };
}

async function scanMembers({ members, threshold, deadline, linkLimit }, yieldControl) {
  if (Date.now() >= deadline) return timedOut();
  const prepared = members.map(({ username, nickname }) => ({
    user: prepareName(username),
    nick: nickname ? prepareName(nickname) : null,
  }));
  const maxLength = prepared.reduce(
    (max, { user, nick }) => Math.max(max, user.text.length, nick?.text.length ?? 0),
    0,
  );
  const row = new Int32Array(maxLength + 1);
  const links = [];
  let linkCount = 0;
  let scanned = 0;
  let pairs = 0;
  let hitDeadline = false;
  for (; scanned < members.length && !hitDeadline; scanned++) {
    for (let j = scanned + 1; j < members.length; j++) {
      const match = firstMatch(prepared[scanned], prepared[j], threshold, row);
      if (match) {
        linkCount++;
        storeLink(links, linkLimit, members[scanned], members[j], match);
      }
      if (++pairs === PAIRS_PER_CHUNK) {
        pairs = 0;
        if (yieldControl) await new Promise((resolve) => setImmediate(resolve));
        if (Date.now() >= deadline) {
          hitDeadline = true;
          break;
        }
      }
    }
    if (hitDeadline) break;
  }
  if (linkLimit === Infinity) links.sort((a, b) => b.similarity - a.similarity);
  return { links, linkCount, scanned, hitDeadline };
}

function startWorker(job) {
  return new Worker(__filename, { workerData: { altScan: job }, env: {} });
}

async function runWorker(job, createWorker) {
  const worker = createWorker(job);
  let timer;
  try {
    return await new Promise((resolve, reject) => {
      timer = setTimeout(() => resolve(timedOut()), Math.max(0, job.deadline - Date.now()));
      worker.once("message", (result) => {
        if (result.error) reject(new Error(result.error));
        else resolve(result);
      });
      worker.once("error", reject);
      worker.once("exit", (code) => reject(new Error("Worker thoát sớm, mã " + code)));
    });
  } finally {
    clearTimeout(timer);
    await worker.terminate();
  }
}

async function scanGuildForAltsAsync(
  guild,
  config,
  {
    maxMembers = MAX_MEMBERS,
    deadlineMs = DEADLINE_MS,
    useWorker = false,
    linkLimit = Infinity,
    createWorker = startWorker,
    logger = console,
  } = {},
) {
  const deadline = Date.now() + deadlineMs;
  const members = [];
  let total = 0;
  for (const member of guild.members.cache.values()) {
    if (member.user.bot) continue;
    total++;
    if (members.length < maxMembers) {
      members.push({ id: member.id, username: member.user.username, nickname: member.nickname });
    }
  }
  const job = { members, threshold: config?.altSimilarityThreshold ?? 70, deadline, linkLimit };
  let result;
  let engine = "main";
  if (useWorker) {
    try {
      engine = "worker";
      result = Date.now() >= deadline ? timedOut() : await runWorker(job, createWorker);
    } catch (error) {
      engine = "fallback";
      logger.warn("[altScan] Lỗi worker, dùng đường dự phòng:", error.message);
    }
  }
  result ??= await scanMembers(job, true);
  return { ...result, total, truncated: total > members.length || result.hitDeadline, engine };
}

function createPeriodicAltScan(
  client,
  store,
  { useWorker, scan = scanGuildForAltsAsync, logger = console } = {},
) {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      for (const guild of client.guilds.cache.values()) {
        try {
          const config = await store.getConfig(guild.id);
          if (!config?.altDetectionEnabled) continue;
          if (guild.memberCount > guild.members.cache.size) {
            await guild.members.fetch({ limit: 1000 }).catch(() => {});
          }
          const started = Date.now();
          const result = await scan(guild, config, { useWorker, linkLimit: 3, logger });
          if (useWorker || result.linkCount || result.truncated) {
            logger.log(
              "[altScan] %s %s %dms, %d/%d thành viên, %d cặp%s",
              guild.name,
              result.engine,
              Date.now() - started,
              result.scanned,
              result.total,
              result.linkCount,
              result.hitDeadline ? " (hết hạn)" : result.truncated ? " (chạm trần)" : "",
            );
          }
          for (const link of result.links) {
            logger.log(
              "  - %s <-> %s (%d%%, %s)",
              link.username1,
              link.username2,
              link.similarity,
              link.reason,
            );
          }
        } catch (error) {
          logger.error("[altScan] %s: %s", guild.id, error.message);
        }
      }
    } finally {
      running = false;
    }
  };
}

if (!isMainThread && workerData?.altScan) {
  scanMembers(workerData.altScan, false).then(
    (result) => parentPort.postMessage(result),
    (error) => parentPort.postMessage({ error: error.message }),
  );
}

module.exports = { usernameSimilarity, scanGuildForAltsAsync, createPeriodicAltScan };
