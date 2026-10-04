// Test research.js — threat intel pipeline với fetch + store GIẢ (không mạng thật).
// Chạy: node scripts/test-research.cjs

// Ghim interval 4h cho test này (mặc định code hiện là 1h — tính năng tăng CPU;
// env override của bot cho phép ghim để assertion về nextRunAt ổn định).
process.env.RESEARCH_INTERVAL_MS = String(4 * 3600 * 1000);

const realFetch = globalThis.fetch;

// --- Fake nguồn mở: Reddit JSON + CISA KEV JSON ---
const redditJson = {
  data: {
    children: [
      {
        data: {
          title: "Beware of the new token-stealer scam hitting Discord moderators",
          selftext:
            "A crypto-wallet phishing campaign uses fake captcha v0lt pages to harvest discord tokens. Reported by several bot-net operators.",
        },
      },
      {
        data: {
          title: "What is the best music bot?", // noise → bị lọc
          selftext: "",
        },
      },
    ],
  },
};
const cisaJson = {
  vulnerabilities: [
    {
      cveID: "CVE-2026-12345",
      vendorProject: "ExampleSoft",
      product: "WebGate",
      shortDescription: "Remote code execution in WebGate panel allows full takeover",
    },
    {
      cveID: "CVE-2026-67890",
      vendorProject: "HypotheticalCorp",
      product: "ChatRelay",
      shortDescription: "JWT bypass lets attacker impersonate webhook sender",
    },
  ],
};

const mutations = [];

const store = {
  client: {
    query: async (name) => {
      if (name === "threatIntel:botGetIntel") {
        return {
          researchEnabled: true,
          aiWeeklyEnabled: true,
          nextRunAt: 0,
          lastRunAt: 0,
          keywords: ["alreadyknown"],
        };
      }
      if (name === "antinuke:recentRaidSamples") {
        return [
          { aiReason: "raid-botnet payload detected in massjoin wave" },
          { aiReason: "fake verify captcha link spam" },
        ];
      }
      return null;
    },
    mutation: async (name, args) => {
      mutations.push({ name, args });
      return { ok: true };
    },
  },
};

// Không có key AI trong env → aiAvailable() false → AI tổng hợp bị bỏ qua (0 token),
// research vẫn phải lưu từ khóa heuristic. Đây chính là "ai dùng gì khi không có key".
delete process.env.GROQ_API_KEY;
delete process.env.NVIDIA_API_KEY;
delete process.env.DEEPSEEK_NIM_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.SAMBANOVA_API_KEY;
delete process.env.AI_API_KEY;
delete process.env.AI_BASE_URL;

globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes("reddit.com")) {
    return { ok: true, status: 200, text: async () => JSON.stringify(redditJson) };
  }
  if (u.includes("cisa.gov")) {
    return { ok: true, status: 200, text: async () => JSON.stringify(cisaJson) };
  }
  return { ok: false, status: 404, text: async () => "" };
};

const research = require("../bot/src/research.js");

(async () => {
  let pass = 0;
  let fail = 0;
  const check = (label, ok) => {
    console.log(ok ? `PASS ${label}` : `FAIL ${label}`);
    ok ? pass++ : fail++;
  };

  // setupResearch không được chờ thêm event nào (bot đã online khi được gọi) —
  // chỉ kiểm tra không crash khi gọi với client tối giản.
  research.setupResearch({ once: () => {} }, store);
  check("setupResearch không crash", true);

  const res = await research.runResearch(store);

  console.log("[result]", JSON.stringify(res));
  check(
    "đã dùng nguồn reddit",
    res.sources.some((s) => s.startsWith("reddit")),
  );
  check("đã dùng nguồn cisa-kev", res.sources.includes("cisa-kev"));
  check("đã học từ raid-incidents", res.sources.includes("raid-incidents"));
  check("có từ khóa mới heuristic", res.newKeywords > 0);
  check("AI không được gọi khi chưa cấu hình key", res.aiUsed === false);

  const saved = mutations.find((m) => m.name === "threatIntel:botSetResearchRun");
  check("đã lưu 1 lượt nghiên cứu vào Convex", !!saved);
  if (saved) {
    check(
      "keyword từ Reddit được lưu",
      (saved.args.keywords || []).some(
        (k) => k.includes("token-stealer") || k.includes("phishing"),
      ),
    );
    check(
      "CVE được lưu thành phrase",
      (saved.args.scamPhrases || []).some((p) => p.startsWith("cve-")),
    );
    check(
      "nextRunAt là 4 giờ sau (interval ghim qua env)",
      saved.args.nextRunAt - Date.now() > 3.9 * 3600 * 1000,
    );
  }

  // Lượt 2: intel cũ giờ chứa từ khóa vừa lưu → không học lại từ khóa cũ (không spam).
  mutations.length = 0;
  const res2 = await research.runResearch(store);
  console.log("[result2]", JSON.stringify(res2));
  check("lượt 2: ít từ khóa mới hơn (không lặp)", res2.newKeywords <= res.newKeywords);

  // ── Digest tuần (buildWeeklyDigest + postDigestToLog) ──
  // Trước đây phần này không có test: suite cũ xoá sạch key AI nên
  // researchAvailable() luôn false → digest luôn null, hai hàm cuối file chỉ
  // nằm trên giấy. Rủi ro: digest là thứ admin ĐỌC để biết xu hướng tuần, hỏng
  // im lặng = admin tin nhầm là server yên ổn.
  {
    const aiPath = require.resolve("../bot/src/ai.js");
    const utilPath = require.resolve("../bot/src/util.js");
    const realAi = require.cache[aiPath];
    const realUtil = require.cache[utilPath];
    const digestCalls = [];
    const sent = [];
    // Nạp sẵn vào require.cache: research.js require("./ai") LÚC CHẠY nên
    // cache sẵn được dùng đúng, không cần sửa code production.
    require.cache[aiPath] = {
      id: aiPath,
      filename: aiPath,
      loaded: true,
      exports: {
        researchAvailable: () => true,
        researchChat: async (messages) => {
          // researchChat dùng chung cho cả aiSynthesize VÀ digest → chỉ tính
          // lời gọi nào thực sự là digest (prompt chứa "DIGEST").
          const isDigest = JSON.stringify(messages).includes("DIGEST");
          if (isDigest) digestCalls.push(messages);
          return isDigest ? "  Xu hướng tuần: raid giả mạo captcha Discord tăng mạnh.  " : "";
        },
        extractJson: () => ({}),
        aiAvailable: () => true,
        classifyViolation: async () => ({ ok: true }),
        analyzeRaid: async () => ({ ok: true }),
        analyzeExternalApp: async () => ({ ok: true }),
        chatForResearch: async () => "",
        aiStats: () => ({}),
      },
    };
    require.cache[utilPath] = {
      id: utilPath,
      filename: utilPath,
      loaded: true,
      exports: {
        Colors: new Proxy({}, { get: () => 0x000000 }),
        logEmbed: (o) => o,
        sendLog: async (guild, cfg, embed) => {
          sent.push({ guildId: guild.id, embed });
        },
      },
    };

    // Buộc digest ĐẾN HẠN: __protogonLastDigest là mốc process-wide, đặt về 0.
    globalThis.__protogonLastDigest = 0;
    mutations.length = 0;
    const digestStore = {
      client: {
        query: async (name) => {
          if (name === "threatIntel:botGetIntel") {
            return {
              researchEnabled: true,
              aiWeeklyEnabled: true,
              nextRunAt: 0,
              lastRunAt: 0,
              keywords: ["captcha-scam"],
              notifyEnabled: true,
            };
          }
          return [];
        },
        mutation: async (name, args) => {
          mutations.push({ name, args });
          return { ok: true };
        },
      },
      getConfig: async (guildId) => (guildId === "g-bad" ? null : { logChannelId: "L" }),
    };
    const mkClient = (n) => ({
      guilds: {
        cache: new Map(
          Array.from({ length: n }, (_, i) => [`g${i}`, { id: `g${i}`, name: `G${i}` }]),
        ),
      },
    });
    mkClient.gBad = null;
    const client = mkClient(5);
    client.guilds.cache.set("g-bad", { id: "g-bad", name: "GBad" });
    research.setupResearch(client, digestStore);
    await research.runResearch(digestStore);

    check("digest gọi AI đúng 1 lần", digestCalls.length === 1, String(digestCalls.length));
    const meta = mutations.find((m) => m.name === "threatIntel:botSetResearchMeta");
    check("digest được lưu lên Convex", !!meta, JSON.stringify(mutations.map((m) => m.name)));
    check(
      "digest cắt khoảng trắng thừa",
      meta?.args.digest === "Xu hướng tuần: raid giả mạo captcha Discord tăng mạnh.",
      JSON.stringify(meta?.args.digest),
    );
    check(
      "digest tôn trọng giới hạn 3 server (KHÔNG spam mọi server)",
      sent.length === 3,
      String(sent.length),
    );
    check(
      "digest bỏ qua guild không có cấu hình log",
      !sent.some((s2) => s2.guildId === "g-bad") && sent.every((s2) => s2.guildId.startsWith("g")),
      JSON.stringify(sent.map((s2) => s2.guildId)),
    );
    check(
      "mốc digest được ghi lại (không gửi lại trong 7 ngày)",
      globalThis.__protogonLastDigest > 0,
    );

    // Lượt sau: digest KHÔNG đến hạn → không gọi AI, không gửi log lần nữa.
    mutations.length = 0;
    sent.length = 0;
    digestCalls.length = 0;
    await research.runResearch(digestStore);
    check(
      "digest chưa đến hạn → không gọi lại AI",
      digestCalls.length === 0 &&
        !mutations.some((m) => m.name === "threatIntel:botSetResearchMeta"),
      `ai=${digestCalls.length}`,
    );

    // Không client Discord (bot chưa online / chưa setupResearch) → không ném.
    const savedClient = research.runResearch._client;
    research.runResearch._client = null;
    globalThis.__protogonLastDigest = 0;
    let threw = false;
    try {
      await research.runResearch(digestStore);
    } catch {
      threw = true;
    }
    check("digest không có client Discord → không ném ra ngoài", !threw);
    research.runResearch._client = savedClient;

    // Bỏ cờ notify → digest vẫn lưu Convex nhưng KHÔNG đăng kênh log.
    mutations.length = 0;
    sent.length = 0;
    globalThis.__protogonLastDigest = 0;
    const quietStore = {
      ...digestStore,
      client: {
        ...digestStore.client,
        query: async (name) =>
          name === "threatIntel:botGetIntel"
            ? {
                researchEnabled: true,
                aiWeeklyEnabled: true,
                nextRunAt: 0,
                keywords: ["x"],
                notifyEnabled: false,
              }
            : [],
      },
    };
    research.setupResearch(client, quietStore);
    await research.runResearch(quietStore);
    check(
      "tắt cờ thông báo → digest lưu Convex nhưng KHÔNG đăng kênh log",
      mutations.some((m) => m.name === "threatIntel:botSetResearchMeta") && sent.length === 0,
      `sent=${sent.length}`,
    );

    if (realUtil) require.cache[utilPath] = realUtil;
    else delete require.cache[utilPath];
    if (realAi) require.cache[aiPath] = realAi;
    else delete require.cache[aiPath];
  }

  // ── Vòng tick của setupResearch + thông báo học thủ công ──
  // Trước đây setupResearch chỉ được gọi để "không crash": thân tick() và
  // notifyManualResult() KHÔNG có dòng nào chạy trong test. Học thủ công là
  // đường người dùng THẬT (nút "Học ngay" trên web + `/research learn`) — hỏng
  // im lặng nghĩa là chủ bot bấm mà bot không làm gì, không có lỗi nào lộ ra.
  {
    // Bắt callback mà setupResearch hẹn giờ (KHÔNG để timer thật chạy).
    const captureTick = (st, discordClient) => {
      const savedST = global.setTimeout;
      const savedSI = global.setInterval;
      const timeouts = [];
      global.setTimeout = (fn, ms) => {
        timeouts.push({ fn, ms });
        return { unref() {} };
      };
      global.setInterval = () => ({ unref() {} });
      try {
        research.setupResearch(discordClient, st);
      } finally {
        global.setTimeout = savedST;
        global.setInterval = savedSI;
      }
      // tick nằm ở lần hẹn 60s (và 5 phút) — chọn chắc chắn một cái.
      return (timeouts.find((t) => t.ms === 60_000) || timeouts[0]).fn;
    };
    const mkClient = () => ({ guilds: { cache: new Map([["g1", { id: "g1", name: "G1" }]]) } });
    const baseIntel = {
      researchEnabled: true,
      aiWeeklyEnabled: false,
      nextRunAt: 0,
      keywords: [],
      notifyEnabled: false,
    };

    // (a) cờ học thủ công → claim + chạy NGAY (bỏ qua enabled/nextRunAt).
    {
      const calls = [];
      const st = {
        client: {
          query: async (name) =>
            name === "threatIntel:botGetIntel"
              ? {
                  ...baseIntel,
                  researchEnabled: false,
                  nextRunAt: Number.MAX_SAFE_INTEGER,
                  manualLearnPending: true,
                }
              : [],
          mutation: async (name, args) => {
            calls.push({ name, args });
            if (name === "threatIntel:botClaimManualLearn") return { requestedBy: "u1" };
            return null;
          },
        },
        getConfig: async () => ({ logChannelId: "L" }),
      };
      const tick = captureTick(st, mkClient());
      check("setupResearch hẹn callback tick", typeof tick === "function");
      await tick();
      check(
        "cờ học thủ công → claim ngay",
        calls.some((c) => c.name === "threatIntel:botClaimManualLearn"),
        JSON.stringify(calls.map((c) => c.name)),
      );
      const run = calls.find((c) => c.name === "threatIntel:botSetResearchRun");
      check(
        "học thủ công chạy dù research tắt + chưa đến hạn",
        run?.args?.trigger === "manual" && run?.args?.requestedBy === "u1",
        JSON.stringify(run?.args),
      );
    }

    // (b) cờ đã bị nơi khác lấy (claim null) → rơi xuống nhánh thường; tắt → dừng.
    {
      const calls = [];
      const st = {
        client: {
          query: async (name) =>
            name === "threatIntel:botGetIntel"
              ? { ...baseIntel, researchEnabled: false, manualLearnPending: true }
              : [],
          mutation: async (name, args) => {
            calls.push({ name, args });
            return null; // botClaimManualLearn trả null = đã có người lấy cờ
          },
        },
        getConfig: async () => null,
      };
      await captureTick(st, mkClient())();
      check(
        "claim đã bị lấy + research tắt → KHÔNG chạy research",
        !calls.some((c) => c.name === "threatIntel:botSetResearchRun"),
        JSON.stringify(calls.map((c) => c.name)),
      );
    }

    // (c) tự động: đến hạn → chạy và báo trigger=auto.
    {
      const calls = [];
      const st = {
        client: {
          query: async (name) =>
            name === "threatIntel:botGetIntel"
              ? { ...baseIntel, researchEnabled: true, nextRunAt: 0 }
              : [],
          mutation: async (name, args) => {
            calls.push({ name, args });
            return null;
          },
        },
        getConfig: async () => ({ logChannelId: "L" }),
      };
      await captureTick(st, mkClient())();
      const run = calls.find((c) => c.name === "threatIntel:botSetResearchRun");
      check("đến hạn → chạy research trigger=auto", run?.args?.trigger === "auto");
    }

    // (d) chưa đến hạn → không tốn call nghiên cứu nào.
    {
      const calls = [];
      const st = {
        client: {
          query: async (name) =>
            name === "threatIntel:botGetIntel"
              ? { ...baseIntel, researchEnabled: true, nextRunAt: Date.now() + 3_600_000 }
              : [],
          mutation: async (name, args) => {
            calls.push({ name, args });
            return null;
          },
        },
        getConfig: async () => ({ logChannelId: "L" }),
      };
      await captureTick(st, mkClient())();
      check(
        "chưa đến hạn → không chạy research",
        !calls.some((c) => c.name === "threatIntel:botSetResearchRun"),
      );
    }

    // (e) lỗi SAU khi đã xác định ngữ cảnh → báo lên Convex để Admin thấy lý do.
    {
      const calls = [];
      let n = 0;
      const st = {
        client: {
          query: (name) => {
            if (name !== "threatIntel:botGetIntel") return Promise.resolve([]);
            n++;
            // Lượt 1: tick đọc cờ. Lượt 2: runResearch đọc lại → ném để mô phỏng Convex sập.
            if (n === 2) throw new Error("Convex sập khi chạy research");
            return Promise.resolve({ ...baseIntel, researchEnabled: true, nextRunAt: 0 });
          },
          mutation: async (name, args) => {
            calls.push({ name, args });
            return null;
          },
        },
        getConfig: async () => ({ logChannelId: "L" }),
      };
      let threw = false;
      try {
        await captureTick(st, mkClient())();
      } catch {
        threw = true;
      }
      const rep = calls.find((c) => c.name === "threatIntel:botReportResearchError");
      check("lỗi research không ném ra ngoài vòng tick", !threw);
      check(
        "lỗi research được báo lên Convex kèm trigger=auto",
        rep?.args?.trigger === "auto" && String(rep?.args?.error).includes("Convex sập"),
        JSON.stringify(rep?.args),
      );
    }

    // (f) chống chồng lấn: tick đang chạy thì lượt hẹn mới phải bị bỏ qua.
    {
      let resolveQ;
      let qCount = 0;
      const st = {
        client: {
          query: (name) => {
            if (name !== "threatIntel:botGetIntel") return Promise.resolve(null);
            qCount++;
            if (qCount === 1) {
              return new Promise((r) => {
                resolveQ = () => r({ ...baseIntel, researchEnabled: false });
              });
            }
            return Promise.resolve({ ...baseIntel, researchEnabled: false });
          },
          mutation: async () => null,
        },
        getConfig: async () => null,
      };
      const tick = captureTick(st, mkClient());
      const first = tick();
      check("tick đang chờ query đầu → đã đặt cờ đang chạy", qCount === 1);
      const second = tick();
      check("tick chồng lấn bị bỏ qua (không phát query mới)", qCount === 1);
      resolveQ();
      await first;
      await second;
    }

    // (g) thông báo học thủ công: tối đa 3 server, bỏ guild chưa cấu hình log.
    {
      const utilPath = require.resolve("../bot/src/util.js");
      const realUtil = require.cache[utilPath];
      const sent = [];
      require.cache[utilPath] = {
        id: utilPath,
        filename: utilPath,
        loaded: true,
        exports: {
          Colors: new Proxy({}, { get: () => 0x000000 }),
          logEmbed: (o) => o,
          sendLog: async (guild, cfg, embed) => {
            sent.push({ guildId: guild.id, embed });
          },
        },
      };
      // Ghim mốc digest để chỉ có thông báo học thủ công đăng log.
      globalThis.__protogonLastDigest = Date.now();
      const guilds = new Map([["g-bad", { id: "g-bad", name: "GBad" }]]);
      for (let i = 0; i < 4; i++) guilds.set(`g${i}`, { id: `g${i}`, name: `G${i}` });
      const st = {
        client: {
          query: async (name) =>
            name === "threatIntel:botGetIntel"
              ? {
                  ...baseIntel,
                  researchEnabled: false,
                  notifyEnabled: true,
                  manualLearnPending: true,
                }
              : [],
          mutation: async (name) => {
            if (name === "threatIntel:botClaimManualLearn") return { requestedBy: "u2" };
            return null;
          },
        },
        getConfig: async (guildId) => (guildId === "g-bad" ? null : { logChannelId: "L" }),
      };
      await captureTick(st, { guilds: { cache: guilds } })();
      // Chỉ xét 3 server đầu; g-bad nằm trong đó nhưng chưa cấu hình log → còn 2.
      check(
        "học thủ công xong → đăng thông báo cho server có log",
        sent.length === 2,
        String(sent.length),
      );
      check(
        "thông báo nêu người yêu cầu",
        JSON.stringify(sent[0]?.embed ?? {}).includes("u2"),
        JSON.stringify(sent[0]?.embed),
      );
      check("bỏ qua guild chưa cấu hình log", !sent.some((s) => s.guildId === "g-bad"));
      if (realUtil) require.cache[utilPath] = realUtil;
      else delete require.cache[utilPath];
    }
  }

  globalThis.fetch = realFetch;
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error("ERROR:", e);
  globalThis.fetch = realFetch;
  process.exit(1);
});
