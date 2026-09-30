// TEST: bot/src/heat.js — bộ đo nhiệt vi phạm (warn → timeout → kick → ban).
// Chạy: node scripts/test-heat.cjs
//
// File này quyết định ai bị timeout/kick/ban. Trước đây chỉ được test rải rác
// trong 3 suite khác, nên phần **ghi xuống Convex** (`flushGuild`/`flushAll`/
// `resetGuild`) gần như không phủ — mà đó mới là nơi số liệu dashboard đến từ.
//
// Rủi ro cụ thể đã có: reset sai phạm vi sẽ xoá nhiệt của server KHÁC (một
// lệnh xoá nhầm là cả server mất dữ liệu), và flush nuốt lỗi âm thầm.
//
// Phủ thêm (vòng 2): ranh giới `tierFor`, cổng chặn điểm rác của `add`, HỆ SỐ
// NHÂN TÁI PHẠM trong `heatRepeatWindowMin` (bug thật: `getHeat` xoá mất mốc
// `lastPunishedAt` khi nhiệt nguội về 0 → tái phạm không bao giờ được nhân),
// DM cảnh báo `_maybeWarn` (1 lần/chu kỳ, DM đóng không spam, không ném),
// `heatSnapshot`, `flushAll` + gộp lịch flush, user chỉ có warn strike,
// tăng cấp strike, và `resetGuild` kèm warn tích luỹ.
const { HeatTracker, heatSettings, tierFor, heatSummary } = require("../bot/src/heat.js");

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  ok ? pass++ : fail++;
};

const MIN = 60_000;

/**
 * Tracker giả: store chỉ ghi lại, không chạm mạng.
 * opts.client: client Discord giả (cần cho _maybeWarn: guilds.cache + members.fetch).
 * opts.getConfig: cấu hình guild trả về khi flush (không truyền = như store lỗi → defaults).
 */
function mkTracker(opts = {}) {
  const calls = { mutations: [], queries: [] };
  const store = {
    client: {
      mutation: async (name, args) => {
        calls.mutations.push({ name, args });
        return {};
      },
      query: async (name) => {
        calls.queries.push(name);
        return null;
      },
    },
  };
  if (opts.getConfig) store.getConfig = opts.getConfig;
  return { tracker: new HeatTracker(opts.client ?? {}, store), calls };
}

(async () => {
  console.log("── heatSettings: kẹp giá trị rác ──");
  {
    const d = heatSettings(null);
    check("config null → dùng mặc định, không ném", d.warnAt === 25 && d.enabled === true);
    check("decay âm → 0", heatSettings({ heatDecayPerMin: -5 }).decayPerMin === 0);
    check(
      "ngưỡng vô lý vẫn được dùng (không tự ý chỉnh)",
      heatSettings({ heatKickAt: 1 }).kickAt === 1,
    );
    check(
      "repeatMultiplier kẹp trong 1..10",
      heatSettings({ heatRepeatMultiplier: 99 }).repeatMultiplier === 10,
    );
    check("heatEnabled = false → tắt", heatSettings({ heatEnabled: false }).enabled === false);
  }

  console.log("\n── tích luỹ + tắt dần ──");
  {
    const { tracker } = mkTracker();
    const s = heatSettings({ heatDecayPerMin: 0 });
    await tracker.add("g1", "u1", "Minh", 30, s);
    check(
      "nhiệt dồn đúng",
      tracker.getHeat("g1", "u1", s) === 30,
      String(tracker.getHeat("g1", "u1", s)),
    );
    await tracker.add("g1", "u1", "Minh", 20, s);
    check("cộng dồn", tracker.getHeat("g1", "u1", s) === 50);
    check("người khác không dính nhiệt", tracker.getHeat("g1", "u2", s) === 0);
    check("server khác không dính nhiệt", tracker.getHeat("g2", "u1", s) === 0);
    check("userId rác (rỗng) không ném", tracker.getHeat("g1", "", s) === 0);
  }
  {
    // Tắt dần là hành vi cốt lõi: nhiệt cũ phải tụt theo thời gian, nếu không
    // thì người đã xử lý lâu vẫn bị kick ở lượt sau.
    const { tracker } = mkTracker();
    const s = heatSettings({ heatDecayPerMin: 3 });
    await tracker.add("g1", "u1", "Minh", 60, s);
    const now = Date.now();
    // giả thời gian: sửa updatedAt lùi 10 phút
    const entry = tracker.states.get("g1:u1");
    entry.updatedAt = now - 10 * MIN;
    const h = tracker.getHeat("g1", "u1", s);
    check(`nhiệt tụt theo thời gian (60 → ${h})`, h < 60 && h > 20, String(h));
  }

  console.log("\n── strike: cửa sổ lặp lại ──");
  {
    const { tracker } = mkTracker();
    const s = heatSettings({});
    tracker.strike("g1", "u1", s, "Minh");
    tracker.strike("g1", "u1", s, "Minh");
    check(
      "đếm strike",
      tracker.strikeCount("g1", "u1", s) === 2,
      String(tracker.strikeCount("g1", "u1", s)),
    );
    check("strike lưu tên để hiển thị", tracker.strikeUsername("g1", "u1") === "Minh");
    // Lỗi thời (ngoài cửa sổ) không được tính.
    const old = tracker.strikes.get("g1:u1");
    old.firstAt = Date.now() - 999 * MIN;
    check(
      "strike ngoài cửa sổ không tính",
      tracker.strikeCount("g1", "u1", s) === 0,
      String(tracker.strikeCount("g1", "u1", s)),
    );
    tracker.clearStrikes("g1", "u1");
    check("clearStrikes xoá sạch", tracker.strikeCount("g1", "u1", s) === 0);
  }

  console.log("\n── resetGuild: phạm vi phải đúng ──");
  {
    const { tracker, calls } = mkTracker();
    const s = heatSettings({ heatDecayPerMin: 0 });
    await tracker.add("g1", "u1", "A", 30, s);
    await tracker.add("g1", "u2", "B", 40, s);
    await tracker.add("g2", "u1", "C", 50, s);

    // ⚠️ Xoá nhầm server khác là mất sạch dữ liệu của cả server đó.
    await tracker.resetGuild("g1", "u1");
    check("reset 1 user: xoá đúng user đó", tracker.getHeat("g1", "u1", s) === 0);
    check("reset 1 user: GIỮ user khác cùng server", tracker.getHeat("g1", "u2", s) === 40);
    check("reset 1 user: GIỮ server khác", tracker.getHeat("g2", "u1", s) === 50);
    check(
      "reset ghi heat=0 lên Convex",
      calls.mutations.some(
        (m) => m.name === "bot_writes:botRecordHeat" && m.args.userId === "u1" && m.args.heat === 0,
      ),
    );

    await tracker.resetGuild("g1");
    check("reset cả server: xoá hết user trong server", tracker.getHeat("g1", "u2", s) === 0);
    check("reset cả server: KHÔNG đụng server khác", tracker.getHeat("g2", "u1", s) === 50);
  }

  console.log("\n── flush: ghi batch lên Convex ──");
  {
    const { tracker, calls } = mkTracker();
    const s = heatSettings({ heatDecayPerMin: 0 });
    await tracker.add("g1", "u1", "A", 30, s);
    await tracker.add("g1", "u2", "B", 70, s);
    await tracker.add("g2", "u1", "C", 10, s);
    calls.mutations.length = 0;

    await tracker.flushGuild("g1");
    const batch = calls.mutations.find((m) => m.name === "bot_writes:botRecordHeatBatch");
    check("ghi 1 mutation batch", !!batch, JSON.stringify(calls.mutations.map((m) => m.name)));
    check("batch chỉ chứa guild đang flush", batch && batch.args.guildId === "g1");
    check(
      "batch có đủ 2 user",
      batch && batch.args.entries.length === 2,
      String(batch?.args.entries.length),
    );
    const ids = (batch?.args.entries || []).map((e) => e.userId).sort();
    check(
      "đúng danh sách user",
      JSON.stringify(ids) === JSON.stringify(["u1", "u2"]),
      JSON.stringify(ids),
    );
    check(
      "nhiệt không âm",
      (batch?.args.entries || []).every((e) => e.heat >= 0),
    );
    check(
      "còn giữ tên người dùng",
      (batch?.args.entries || []).every((e) => typeof e.username === "string" && e.username),
    );
  }
  {
    // Chống rò rỉ RAM: entry đã hết hạn phải bị xoá khỏi bộ nhớ sau flush.
    const { tracker } = mkTracker();
    const s = heatSettings({ heatDecayPerMin: 1 });
    await tracker.add("g1", "u1", "A", 5, s);
    await tracker.add("g1", "u2", "B", 80, s);
    // u1 tuyet het sau 10 phut (5 - 10*1 < 0); u2 con nhiet nen phai giu.
    tracker.states.get("g1:u1").updatedAt = Date.now() - 10 * MIN;
    await tracker.flushGuild("g1");
    check("nhiệt 0 sau flush → xoá khỏi RAM", !tracker.states.has("g1:u1"));
    check("nhiệt còn → giữ trong RAM", tracker.states.has("g1:u2"));
  }
  {
    const { tracker, calls } = mkTracker();
    const s = heatSettings({ heatDecayPerMin: 0 });
    await tracker.add("g1", "u1", "A", 10, s);
    calls.mutations.length = 0;
    await tracker.flushGuild("khong-co-guild-nao");
    check(
      "flush guild rỗng → KHÔNG gọi mutation",
      calls.mutations.length === 0,
      JSON.stringify(calls.mutations.map((m) => m.name)),
    );
  }

  console.log("\n── topWarned: sắp xếp + giới hạn ──");
  {
    const { tracker } = mkTracker();
    const s = heatSettings({ heatDecayPerMin: 0 });
    for (let i = 0; i < 20; i++) await tracker.add("g1", `u${i}`, `N${i}`, i + 1, s);
    const top = tracker.strikeSnapshot("g1", s);
    check(
      "strikeSnapshot sắp giảm dần",
      top.length === 0 || top[0].count >= top[top.length - 1].count,
    );
  }
  {
    const { tracker } = mkTracker();
    const s = heatSettings({ heatDecayPerMin: 0, warnStrikeLimit: 3 });
    for (let i = 0; i < 6; i++) {
      tracker.strike("g1", "u1", s, "Minh");
      tracker.strike("g1", `v${i}`, s, `N${i}`);
    }
    const top = tracker.strikeSnapshot("g1", s);
    check("tối đa 15 dòng", top.length <= 15, String(top.length));
    check(
      "không vượt giới hạn strike cấu hình",
      top.every((r) => r.count <= 3),
      JSON.stringify(top[0]),
    );
  }

  console.log("\n── tierFor: ranh giới từng bậc ──");
  {
    // Sai một mốc là phạt sai ai đó (kick thay vì ban, hoặc im lặng ở safe).
    const s = heatSettings({});
    const cases = [
      [0, "safe"],
      [24, "safe"],
      [25, "warn"],
      [39, "warn"],
      [40, "timeout"],
      [69, "timeout"],
      [70, "kick"],
      [89, "kick"],
      [90, "ban"],
      [150, "ban"],
    ];
    const wrong = cases.filter(([heat, want]) => tierFor(heat, s) !== want).map(([heat]) => heat);
    check(
      "10 mốc nhiệt → đúng bậc safe/warn/timeout/kick/ban",
      wrong.length === 0,
      `sai ở ${wrong}`,
    );
  }

  console.log("\n── add: cổng chặn điểm rác ──");
  {
    const { tracker } = mkTracker();
    const s = heatSettings({});
    check(
      "points = 0 → bỏ qua, không tạo entry",
      (await tracker.add("g1", "u1", "A", 0, s)) === null && !tracker.states.has("g1:u1"),
    );
    check("points âm → bỏ qua", (await tracker.add("g1", "u1", "A", -5, s)) === null);
    const off = heatSettings({ heatEnabled: false });
    check(
      "heatEnabled=false → bỏ qua dù điểm lớn",
      (await tracker.add("g1", "u1", "A", 30, off)) === null && !tracker.states.has("g1:u1"),
    );
  }

  console.log("\n── tái phạm: hệ số nhân trong heatRepeatWindowMin ──");
  {
    // ⚠️ Bug thật đã sửa: getHeat() xoá entry khi nhiệt nguội về 0 — kể cả khi
    // entry đó là chỖ DUY NHẤT nhớ lastPunishedAt. Vì add() gọi getHeat() trước
    // nên mọi lần tái phạm sau khi nhiệt đã nguội đều KHÔNG được nhân, dù
    // flushGuild lẫn sweepCold đều cố ý giữ entry cho đúng mục đích này.
    const { tracker } = mkTracker();
    const s = heatSettings({
      heatDecayPerMin: 3,
      heatRepeatWindowMin: 30,
      heatRepeatMultiplier: 2,
    });
    await tracker.add("g1", "u1", "A", 5, s);
    tracker.markPunished("g1", "u1");
    tracker.states.get("g1:u1").updatedAt = Date.now() - 3 * MIN; // 5 − 9 → 0
    check("nhiệt đã nguội về 0", tracker.getHeat("g1", "u1", s) === 0);
    check("VẪN giữ entry vì còn trong cửa sổ tái phạm", tracker.states.has("g1:u1"));
    const r = await tracker.add("g1", "u1", "A", 10, s);
    check("tái phạm nhân x2 (10 → 20)", r.repeated === true && r.heat === 20, JSON.stringify(r));
    const r2 = await tracker.add("g1", "u1", "A", 10, s);
    check(
      "tái phạm lần 3 trong cửa sổ vẫn nhân",
      r2.repeated === true && r2.heat === 40,
      JSON.stringify(r2),
    );
    // Ra khỏi cửa sổ → dọn RAM, không nhân nữa (không rò rỉ bộ nhớ).
    const e = tracker.states.get("g1:u1");
    e.lastPunishedAt = Date.now() - 31 * MIN;
    e.heat = 4;
    e.updatedAt = Date.now() - 3 * MIN; // 4 − 9 → 0, và đã quá cửa sổ tái phạm
    check("hết cửa sổ: nhiệt về 0", tracker.getHeat("g1", "u1", s) === 0);
    check("hết cửa sổ: dọn entry khỏi RAM", !tracker.states.has("g1:u1"));
    const r3 = await tracker.add("g1", "u1", "A", 10, s);
    check(
      "hết cửa sổ → không nhân nữa",
      r3.repeated === false && r3.heat === 10,
      JSON.stringify(r3),
    );
  }
  {
    // Ca hẹp hơn: bị phạt khi CHƯA có nhiệt (markPunished tạo entry heat 0) —
    // getHeat trước đây xoá ngay nên hệ số nhân không bao giờ chạy.
    const { tracker } = mkTracker();
    const s = heatSettings({ heatRepeatWindowMin: 30, heatRepeatMultiplier: 2 });
    tracker.markPunished("g1", "u2");
    const r = await tracker.add("g1", "u2", "B", 10, s);
    check(
      "bị phạt lúc nhiệt 0 → lần vi phạm sau vẫn nhân x2",
      r.repeated === true && r.heat === 20,
      JSON.stringify(r),
    );
  }
  {
    // Đường flush: flushGuild giữ entry (keepPunished) → lần vi phạm sau phải
    // còn nhân được. Trước đây flush giữ mà getHeat xoá ngay sau đó = vô nghĩa.
    const { tracker, calls } = mkTracker();
    const s = heatSettings({
      heatDecayPerMin: 3,
      heatRepeatWindowMin: 30,
      heatRepeatMultiplier: 2,
    });
    await tracker.add("g1", "u3", "C", 5, s);
    tracker.markPunished("g1", "u3");
    tracker.states.get("g1:u3").updatedAt = Date.now() - 3 * MIN;
    calls.mutations.length = 0;
    await tracker.flushGuild("g1");
    const batch = calls.mutations.find((m) => m.name === "bot_writes:botRecordHeatBatch");
    check("flush: giữ entry vừa bị phạt (chờ tái phạm)", tracker.states.has("g1:u3"));
    check(
      "flush: gửi nhiệt 0, không bịa nhiệt",
      batch?.args.entries[0]?.heat === 0,
      JSON.stringify(batch?.args.entries),
    );
    const r = await tracker.add("g1", "u3", "C", 10, s);
    check(
      "flush rồi tái phạm vẫn nhân x2",
      r.repeated === true && r.heat === 20,
      JSON.stringify(r),
    );
  }

  console.log("\n── _maybeWarn: DM cảnh báo đúng 1 lần/chu kỳ ──");
  {
    const dms = [];
    const member = { id: "u1", send: async (text) => void dms.push(text) };
    const client = {
      guilds: {
        cache: new Map([["g1", { name: "Server A", members: { fetch: async () => member } }]]),
      },
    };
    const { tracker } = mkTracker({ client });
    const s = heatSettings({ heatDecayPerMin: 0 });
    const r1 = await tracker.add("g1", "u1", "A", 30, s);
    check("chạm warnAt → gửi DM cảnh báo", r1.warned === true && dms.length === 1);
    check(
      "nội dung DM có mức nhiệt + các ngưỡng phạt",
      dms[0]?.includes("30/100") &&
        dms[0]?.includes("Tạm khóa khi chạm **40**") &&
        dms[0]?.includes("Ban khi chạm **90**"),
      dms[0]?.slice(0, 80),
    );
    const r2 = await tracker.add("g1", "u1", "A", 10, s);
    check("trong cùng chu kỳ KHÔNG spam DM", r2.warned === false && dms.length === 1);
    // Nguội xuống dưới ngưỡng rồi nóng lại → phải được cảnh báo lại.
    tracker.states.get("g1:u1").heat = 10;
    check("nhiệt tụt dưới warnAt", tracker.getHeat("g1", "u1", s) === 10);
    const r3 = await tracker.add("g1", "u1", "A", 20, s);
    check("nguội dưới ngưỡng rồi nóng lại → cảnh báo lại", r3.warned === true && dms.length === 2);
  }
  {
    // DM đóng / member không tồn tại / guild không có cache → vẫn tính "đã cảnh
    // báo" (không spam lại) và TUYỆT ĐỐI không ném ra ngoài.
    const client = {
      guilds: {
        cache: new Map([
          [
            "g1",
            {
              name: "A",
              members: {
                fetch: async () => {
                  throw new Error("Unknown Member");
                },
              },
            },
          ],
          [
            "g2",
            {
              name: "B",
              members: {
                fetch: async () => ({
                  id: "u9",
                  send: async () => {
                    throw new Error("Cannot send messages to this user");
                  },
                }),
              },
            },
          ],
        ]),
      },
    };
    const { tracker } = mkTracker({ client });
    const s = heatSettings({ heatDecayPerMin: 0 });
    const r1 = await tracker.add("g1", "u1", "A", 30, s);
    check("fetch member lỗi → coi như đã cảnh báo, không ném", r1.warned === true);
    const r2 = await tracker.add("g2", "u9", "B", 30, s);
    check("DM đóng → vẫn coi như đã cảnh báo", r2.warned === true);
    const r3 = await tracker.add("g3", "u3", "C", 30, s);
    check("guild không có trong cache → không ném", r3.warned === true);
    const r4 = await tracker.add("g3", "u4", "D", 10, s);
    check("dưới warnAt → không gửi cảnh báo", r4.warned === false);
  }

  console.log("\n── heatSnapshot: bảng nhiệt cho báo cáo ──");
  {
    const { tracker } = mkTracker();
    const s = heatSettings({ heatDecayPerMin: 0 });
    await tracker.add("g1", "u1", "A", 50, s);
    await tracker.add("g1", "u2", "B", 80, s);
    await tracker.add("g1", "u3", undefined, 30, s);
    await tracker.add("g2", "u9", "Server khác", 90, s);
    tracker.states.set("g1:u4", { heat: 0, updatedAt: Date.now(), username: "Nguội" });
    const snap = tracker.heatSnapshot("g1", s);
    check(
      "sắp giảm dần + chỉ guild này + bỏ nhiệt 0",
      JSON.stringify(snap.map((r) => r.userId)) === JSON.stringify(["u2", "u1", "u3"]),
      JSON.stringify(snap),
    );
    check("kèm bậc nhiệt (tier) đúng", snap[0].tier === "kick" && snap[1].tier === "timeout");
    check("thiếu username → chuỗi rỗng, không undefined", snap[2].username === "");
    check("số nguyên nhiệt đúng", snap[0].heat === 80 && snap[2].heat === 30);
  }
  {
    const { tracker } = mkTracker();
    const s = heatSettings({ heatDecayPerMin: 0 });
    for (let i = 0; i < 20; i++) await tracker.add("g1", `u${i}`, `N${i}`, i + 1, s);
    const snap = tracker.heatSnapshot("g1", s);
    check("tối đa 15 dòng báo cáo", snap.length === 15, String(snap.length));
    check("giữ những người nóng nhất", snap[0].heat === 20 && snap[14].heat === 6);
  }

  console.log("\n── flushAll + gộp lịch flush ──");
  {
    const { tracker, calls } = mkTracker();
    const s = heatSettings({ heatDecayPerMin: 0 });
    await tracker.add("g1", "u1", "A", 30, s);
    await tracker.add("g1", "u2", "B", 40, s);
    await tracker.add("g2", "u3", "C", 50, s);
    check(
      "2 lần thay đổi cùng guild → chỉ 1 lịch flush/guild",
      tracker.timers.size === 2 && tracker.pending.size === 2,
      `timers=${tracker.timers.size} pending=${tracker.pending.size}`,
    );
    calls.mutations.length = 0;
    await tracker.flushAll();
    check("flushAll quét sạch pending", tracker.pending.size === 0);
    const guildIds = calls.mutations.map((m) => m.args.guildId).sort();
    check(
      "flushAll ghi đúng 2 guild",
      JSON.stringify(guildIds) === JSON.stringify(["g1", "g2"]),
      JSON.stringify(guildIds),
    );
    const g1batch = calls.mutations.find((m) => m.args.guildId === "g1");
    check(
      "mỗi guild 1 mutation batch, đủ user",
      g1batch?.name === "bot_writes:botRecordHeatBatch" && g1batch.args.entries.length === 2,
      JSON.stringify(g1batch?.name),
    );
    calls.mutations.length = 0;
    await tracker.flushAll();
    check("flushAll khi không có gì chờ → không gọi mutation", calls.mutations.length === 0);
  }

  console.log("\n── flushGuild: user chỉ có warn strike / config lỗi ──");
  {
    const { tracker, calls } = mkTracker();
    const s = heatSettings({});
    tracker.strike("g1", "u1", s, "Minh"); // chỉ có warn strike, chưa có nhiệt
    calls.mutations.length = 0;
    await tracker.flushGuild("g1");
    const e = calls.mutations.find((m) => m.name === "bot_writes:botRecordHeatBatch")?.args
      .entries[0];
    check(
      "user chỉ có strike vẫn được ghi (heat 0 kèm warnStrikes)",
      !!e && e.userId === "u1" && e.heat === 0 && e.warnStrikes === 1,
      JSON.stringify(e),
    );
    check(
      "username lấy từ strike khi chưa có entry nhiệt",
      e?.username === "Minh",
      JSON.stringify(e),
    );
    check("strike còn hiệu lực → KHÔNG bị dọn khỏi RAM", tracker.strikes.has("g1:u1"));
  }
  {
    const { tracker, calls } = mkTracker({
      getConfig: async () => {
        throw new Error("Convex không trả lời");
      },
    });
    const s = heatSettings({ heatDecayPerMin: 0 });
    await tracker.add("g1", "u1", "A", 30, s);
    calls.mutations.length = 0;
    await tracker.flushGuild("g1");
    check("getConfig lỗi → vẫn flush bằng cài đặt mặc định", calls.mutations.length === 1);
  }
  {
    const { tracker, calls } = mkTracker({ getConfig: async () => ({ heatDecayPerMin: 0 }) });
    const s = heatSettings({ heatDecayPerMin: 0 });
    await tracker.add("g1", "u1", "A", 30, s);
    tracker.states.get("g1:u1").updatedAt = Date.now() - 100 * MIN;
    calls.mutations.length = 0;
    await tracker.flushGuild("g1");
    const e = calls.mutations[0]?.args.entries[0];
    check("cài đặt riêng của guild (decay 0) được tôn trọng", e?.heat === 30, JSON.stringify(e));
  }

  console.log("\n── strike: tăng cấp + tắt khi limit 0 ──");
  {
    const { tracker } = mkTracker();
    const off = heatSettings({ warnStrikeLimit: 0 });
    const st0 = tracker.strike("g1", "u1", off, "A");
    check(
      "warnStrikeLimit=0 → luôn trả warn, không ghi strike",
      st0.escalated === false && st0.count === 0 && !tracker.strikes.has("g1:u1"),
    );
    const s3 = heatSettings({ warnStrikeLimit: 3, warnStrikePunish: "kick" });
    tracker.strike("g1", "u2", s3, "B");
    tracker.strike("g1", "u2", s3, "B");
    const st = tracker.strike("g1", "u2", s3, "B");
    check(
      "đủ limit → tăng cấp đúng hình phạt cấu hình",
      st.escalated === true && st.punish === "kick" && st.count === 3,
      JSON.stringify(st),
    );
    check("sau tăng cấp → đếm strike reset", tracker.strikeCount("g1", "u2", s3) === 0);
    tracker.strike("g1", "u3", s3, "C");
    tracker.strike("g1", "u3", s3); // không truyền tên → giữ tên cũ
    check("strike thiếu username → giữ tên lần trước", tracker.strikeUsername("g1", "u3") === "C");
  }

  console.log("\n── resetGuild: xoá luôn warn tích luỹ ──");
  {
    const { tracker, calls } = mkTracker();
    const s = heatSettings({});
    tracker.strike("g1", "u1", s, "Minh"); // chỉ có strike, không có nhiệt
    calls.mutations.length = 0;
    tracker.resetGuild("g1", "u1");
    check(
      "reset user chỉ có strike → xoá strike + ghi heat=0",
      !tracker.strikes.has("g1:u1") &&
        calls.mutations.some(
          (m) => m.name === "bot_writes:botRecordHeat" && m.args.userId === "u1",
        ),
      JSON.stringify(calls.mutations.map((m) => m.args)),
    );
  }

  console.log("\n── heatSummary: dòng log cho mod ──");
  {
    check("không có kết quả nhiệt → chuỗi rỗng", heatSummary(null) === "");
    const txt = heatSummary({ added: 20, heat: 40.4, repeated: true, multiplier: 2, warned: true });
    check(
      "tóm tắt có tái phạm + DM + làm tròn nhiệt",
      txt.includes("tái phạm x2") && txt.includes("đã DM cảnh báo") && txt.includes("40/100"),
      txt,
    );
    const plain = heatSummary({ added: 10, heat: 10, repeated: false, warned: false });
    check("không tái phạm/DM → không thêm chú thích", plain === " · +10 nhiệt → 10/100", plain);
  }

  console.log(`\nKết quả heat: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
})();
