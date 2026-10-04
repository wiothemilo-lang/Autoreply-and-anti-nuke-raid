// TEST: healthWatch — canh sức khoẻ máy chủ (đĩa/bộ nhớ).
// Chạy: node scripts/test-health-watch.cjs
//
// Vì sao test: ngưỡng cảnh báo là thứ chống sự cố 25/09/2026 (đĩa đầu →
// emergency_ro → bot chết cả buổi). Ranh giới 85/92% sai 1% là cảnh báo hoàn
// toàn vô dụng hoặc spam. Test ở đây khoá CHÍNH XÁC hành vi mong muốn:
//   - xếp mức (ok/warn/critical) ở biên ngưỡng
//   - DM chỉ khi NẶNG HƠN lần trước + cooldown 6h cho critical kéo dài
//   - ghi Convex hỏng KHÔNG được làm chết vòng canh
//   - KHÔNG đo được gì thì KHÔNG DM (cảnh báo oan mất niềm tin)
const hw = require("../bot/src/handlers/healthWatch");

let pass = 0;
let fail = 0;
const check = (label, ok) => {
  console.log(ok ? `  ✅ ${label}` : `  ❌ ${label}`);
  if (ok) pass++;
  else fail++;
};

// ── 1. Xếp mức ──
check("đĩa 50% + RAM 300MB → ok", hw.classifyHealth({ diskUsedPct: 50, rssMb: 300 }) === "ok");
check("đĩa 84% → ok", hw.classifyHealth({ diskUsedPct: 84, rssMb: 100 }) === "ok");
check(
  "đĩa 85% → warn (biên dùng >=)",
  hw.classifyHealth({ diskUsedPct: 85, rssMb: 100 }) === "warn",
);
check("đĩa 92% → critical", hw.classifyHealth({ diskUsedPct: 92, rssMb: 100 }) === "critical");
check("đĩa 99% → critical", hw.classifyHealth({ diskUsedPct: 99, rssMb: 100 }) === "critical");
check(
  "RAM 1000MB (đĩa 10%) → critical",
  hw.classifyHealth({ diskUsedPct: 10, rssMb: 1000 }) === "critical",
);
check(
  "mức nghiêm trọng nhất thắng (đĩa warn + RAM critical → critical)",
  hw.classifyHealth({ diskUsedPct: 85, rssMb: 1000 }) === "critical",
);
check("không đo được đĩa (undefined) + RAM thấp → ok", hw.classifyHealth({ rssMb: 100 }) === "ok");

// ── 2. readHostHealth trả về đủ + không ném ──
const real = hw.readHostHealth();
check("readHostHealth có level hợp lệ", ["ok", "warn", "critical"].includes(real.level));
check("readHostHealth có rssMb số", typeof real.rssMb === "number" && real.rssMb > 0);
check("readHostHealth có uptimeHours số", typeof real.uptimeHours === "number");
check(
  "đĩa đo được thì diskUsedPct là số 0..100",
  real.diskUsedPct === undefined ||
    (typeof real.diskUsedPct === "number" && real.diskUsedPct >= 0 && real.diskUsedPct <= 100),
);

// ── 3. shouldAlert — chống spam ──
const T0 = 1_700_000_000_000;
const warn = { level: "warn", diskUsedPct: 86, rssMb: 100 };
const crit = { level: "critical", diskUsedPct: 95, rssMb: 100 };
const okH = { level: "ok", diskUsedPct: 20, rssMb: 100 };

check("lần đầu thấy warn → báo", hw.shouldAlert(null, warn, T0) === true);
check(
  "warn lặp lại ngay sau đó → KHÔNG báo",
  hw.shouldAlert({ level: "warn", lastAlertAt: T0 }, warn, T0 + 60_000) === false,
);
check(
  "nhảy từ warn lên critical → báo",
  hw.shouldAlert({ level: "warn", lastAlertAt: T0 }, crit, T0 + 60_000) === true,
);
check(
  "critical kéo dài > 6h → báo lại (nhắc đều, không im lặng)",
  hw.shouldAlert({ level: "critical", lastAlertAt: T0 }, crit, T0 + 6 * 3600_000 + 1) === true,
);
check(
  "critical vừa báo < 6h → im",
  hw.shouldAlert({ level: "critical", lastAlertAt: T0 }, crit, T0 + 3600_000) === false,
);
check(
  "mức ok → không báo",
  hw.shouldAlert({ level: "critical", lastAlertAt: T0 }, okH, T0) === false,
);
check("ok → warn (từng hồi phục rồi lại xấu) → báo lại", hw.shouldAlert(null, warn, T0) === true);

// ── 3b. Gateway: mất kết nối Discord phải NÂNG mức (bệnh chết lặng) ──
check(
  "gateway bình thường + đĩa/RAM thấp → ok",
  hw.classifyHealth({ diskUsedPct: 10, rssMb: 100, gatewayConnected: true }) === "ok",
);
check(
  "mất kết nối 30s (< 1 phút) → ok (nhiễu mạng ngắn không báo oan)",
  hw.classifyHealth({
    diskUsedPct: 10,
    rssMb: 100,
    gatewayConnected: false,
    gatewayDisconnectedMs: 30_000,
  }) === "ok",
);
check(
  "mất kết nối 60s → warn",
  hw.classifyHealth({
    diskUsedPct: 10,
    rssMb: 100,
    gatewayConnected: false,
    gatewayDisconnectedMs: 60_000,
  }) === "warn",
);
check(
  "mất kết nối 5 phút → critical",
  hw.classifyHealth({
    diskUsedPct: 10,
    rssMb: 100,
    gatewayConnected: false,
    gatewayDisconnectedMs: 5 * 60_000,
  }) === "critical",
);
check(
  "gateway rớt KHÔNG bị coi là ok dù đĩa/RAM thấp",
  hw.classifyHealth({
    diskUsedPct: 10,
    rssMb: 100,
    gatewayConnected: false,
    gatewayDisconnectedMs: 10 * 60_000,
  }) !== "ok",
);

// ── 3c. createGatewayTracker — đếm + thời lượng (đồng hồ giả) ──
{
  let t = 1_000_000;
  const tracker = hw.createGatewayTracker({ now: () => t });
  const birth = tracker.snapshot();
  check(
    "mới tạo → đang kết nối, 0 lần rớt, thời lượng 0",
    birth.gatewayConnected === true &&
      birth.gatewayDisconnects === 0 &&
      birth.gatewayDisconnectedMs === 0,
  );
  tracker.onDisconnect();
  t += 90_000;
  const down = tracker.snapshot();
  check(
    "sau onDisconnect → false + đếm 1 + 90s",
    down.gatewayConnected === false &&
      down.gatewayDisconnects === 1 &&
      down.gatewayDisconnectedMs === 90_000,
  );
  tracker.onDisconnect();
  check(
    "onDisconnect trùng (chưa reconnect) vẫn đếm 1",
    tracker.snapshot().gatewayDisconnects === 1,
  );
  t += 10_000;
  tracker.onReconnect();
  const up = tracker.snapshot();
  check(
    "onReconnect → true + thời lượng về 0",
    up.gatewayConnected === true && up.gatewayDisconnectedMs === 0,
  );
  tracker.onError(new Error("boom"));
  check(
    "snapshot đủ 3 trường gateway",
    "gatewayConnected" in up && "gatewayDisconnectedMs" in up && "gatewayDisconnects" in up,
  );
}

// ── 4. Chuỗi nhiều lượt: chỉ DM khi mức NẶNG HƠN, Convex hỏng vẫn chạy ──
async function runLoop() {
  const written = [];
  const dms = [];
  const reads = [
    { level: "ok", diskUsedPct: 20, diskFreeGb: 100, rssMb: 300, uptimeHours: 1 },
    { level: "warn", diskUsedPct: 87, diskFreeGb: 8, rssMb: 300, uptimeHours: 1 },
    { level: "warn", diskUsedPct: 88, diskFreeGb: 7, rssMb: 300, uptimeHours: 1 },
    { level: "critical", diskUsedPct: 95, diskFreeGb: 3, rssMb: 900, uptimeHours: 1 },
  ];
  let i = 0;
  const opts = {
    store: {
      mutation: async (name, args) => {
        written.push({ name, args });
      },
    },
    sendAlert: async (text) => {
      dms.push(text);
    },
    now: () => T0,
    read: () => reads[Math.min(i++, reads.length - 1)],
  };

  let state = null;
  for (let k = 0; k < reads.length; k++) state = await hw.checkOnce({ ...opts, state });

  check(
    "ghi đúng tên mutation",
    written.length === 4 && written.every((w) => w.name === "status:reportHealth"),
  );
  check(
    "mutation có đủ level/diskUsedPct/rssMb/reportedAt",
    written[0]?.args?.level === "ok" &&
      written[0]?.args?.diskUsedPct === 20 &&
      written[0]?.args?.rssMb === 300 &&
      written[0]?.args?.reportedAt === T0,
  );
  check("chỉ DM khi warn mới + critical mới (2 DM)", dms.length === 2);
  check("DM warn nói đúng % đĩa", dms[0]?.includes("87%") === true);
  check("DM critical nói đúng % đĩa + RAM", dms[1]?.includes("95%") && dms[1]?.includes("900 MB"));
  check("DM có hướng dẫn xử lý", dms[1]?.includes("dọn") === true);
  check("sau cùng state = critical (lượt sau biết đã báo rồi)", state?.level === "critical");

  // Convex hỏng KHÔNG được làm chết vòng canh, và DM vẫn chạy.
  const dms2 = [];
  let calls = 0;
  let st2 = null;
  for (let k = 0; k < 2; k++) {
    st2 = await hw.checkOnce({
      store: {
        mutation: async () => {
          calls++;
          throw new Error("Convex chết");
        },
      },
      sendAlert: async () => {
        dms2.push("x");
      },
      now: () => T0,
      read: () => ({ level: "critical", diskUsedPct: 97, rssMb: 100, uptimeHours: 1 }),
      state: st2,
    });
  }
  check("Convex hỏng vẫn gọi tiếp (không chết vòng)", calls === 2);
  check("Convex hỏng vẫn DM cảnh báo đúng 1 lần", dms2.length === 1);
  check("DM lỗi không làm hỏng state (vẫn ghi nhớ mức)", st2?.level === "critical");

  // startHealthWatch + gateway: mất kết nối 5 phút phải được GỘP vào số đo,
  // tính lại mức (critical) và ghi kèm field gateway lên Convex.
  {
    let t = 5_000_000;
    const tracker = hw.createGatewayTracker({ now: () => t });
    tracker.onDisconnect();
    t += 5 * 60_000;
    const gwWritten = [];
    const stopGw = hw.startHealthWatch({
      store: { mutation: async (name, args) => gwWritten.push({ name, args }) },
      gateway: tracker,
      read: () => ({ diskUsedPct: 10, diskFreeGb: 100, rssMb: 100, uptimeHours: 1 }),
      intervalMs: 10_000,
    });
    await new Promise((r) => setTimeout(r, 20));
    stopGw();
    check(
      "gateway rớt 5 phút → mức critical dù đĩa/RAM thấp",
      gwWritten[0]?.args?.level === "critical",
      JSON.stringify(gwWritten[0]?.args),
    );
    check(
      "số đo ghi kèm field gateway (connected=false, 300s)",
      gwWritten[0]?.args?.gatewayConnected === false &&
        gwWritten[0]?.args?.gatewayDisconnectedMs === 300_000,
      JSON.stringify(gwWritten[0]?.args),
    );
    check("vẫn ghi đúng mutation reportHealth", gwWritten[0]?.name === "status:reportHealth");
  }

  // startHealthWatch tồn tại và trả hàm dừng (gọi 1 lượt rồi dừng, không treo).
  const stop = hw.startHealthWatch({ ...opts, intervalMs: 50 });
  await new Promise((r) => setTimeout(r, 20));
  check("startHealthWatch trả hàm dừng", typeof stop === "function");
  stop();
  const before = written.length;
  await new Promise((r) => setTimeout(r, 80));
  check("dừng vòng thì không đo thêm", written.length === before);
}

runLoop()
  .then(() => {
    console.log(`\n${pass} PASS, ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
  })
  .catch((e) => {
    console.error("LỖI test:", e);
    process.exit(1);
  });
