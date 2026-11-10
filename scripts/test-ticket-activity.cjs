// TEST: bot/src/handlers/ticketActivity.js — đẩy lùi đồng hồ tự đóng.
// Chạy: node scripts/test-ticket-activity.cjs
//
// Rủi ro chính: nếu nhận ra sai kênh ticket thì hoặc (a) botTouchTickets
// không bao giờ được gọi → ticket đang thảo luận vẫn bị tự đóng, hoặc (b)
// gọi nhầm cho kênh thường → đốt mutation vô ích. Cả hai đều là lỗi thật.
const activity = require("../bot/src/handlers/ticketActivity.js");

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  ok ? pass++ : fail++;
};
const section = (t) => console.log(`\n── ${t} ──`);

function mkStore(config) {
  const mutations = [];
  return {
    mutations,
    getConfig: async () => config,
    client: {
      mutation: async (name, args) => {
        mutations.push({ name, args });
        return {};
      },
      query: async () => null,
    },
  };
}

function mkMessage({ guildId = "G1", channelId = "CH1", parentId = "CAT", bot = false } = {}) {
  return {
    author: { bot },
    guild: guildId ? { id: guildId } : null,
    channel: { id: channelId, parentId },
  };
}

(async () => {
  section("isTicketChannel — nhận ra đúng kênh ticket");
  {
    const store = mkStore({ ticketEnabled: true, ticketCategoryId: "CAT" });
    check(
      "kênh trong category ticket → đúng",
      (await activity.isTicketChannel(mkMessage(), store)) === true,
    );
  }
  {
    const store = mkStore({ ticketEnabled: true, ticketCategoryId: "CAT" });
    check(
      "kênh category KHÁC → không phải ticket",
      (await activity.isTicketChannel(mkMessage({ parentId: "CAT_KHAC" }), store)) === false,
    );
  }
  {
    const store = mkStore({ ticketEnabled: false, ticketCategoryId: "CAT" });
    check(
      "ticket ĐANG TẮT → không ghi hoạt động (tránh đốt mutation)",
      (await activity.isTicketChannel(mkMessage(), store)) === false,
    );
  }
  {
    const store = mkStore({ ticketEnabled: true, ticketCategoryId: null });
    check(
      "chưa cấu hình category → false",
      (await activity.isTicketChannel(mkMessage(), store)) === false,
    );
  }
  {
    const store = {
      getConfig: async () => {
        throw new Error("mất mạng");
      },
    };
    check(
      "getConfig lỗi → false, KHÔNG ném ra ngoài",
      (await activity.isTicketChannel(mkMessage(), store)) === false,
    );
  }
  {
    check(
      "không có guild → false",
      (await activity.isTicketChannel(mkMessage({ guildId: null }), mkStore({}))) === false,
    );
    check("null message → false", (await activity.isTicketChannel(null, mkStore({}))) === false);
  }

  section("noteActivity — ghi lùi đúng kênh");
  {
    const store = mkStore({ ticketEnabled: true, ticketCategoryId: "CAT" });
    const ok = await activity.noteActivity(mkMessage(), store);
    check("ghi thành công", ok === true);
    check(
      "gọi botTouchTickets đúng guild + channel",
      store.mutations.length === 1 &&
        store.mutations[0].name === "bot_writes:botTouchTickets" &&
        store.mutations[0].args.guildId === "G1" &&
        store.mutations[0].args.channelIds[0] === "CH1",
      JSON.stringify(store.mutations),
    );
  }
  {
    // Tin nhắn bot KHÔNG được đẩy lùi — nếu không, bot tự thải 1 dòng
    // embed thành công cũng giữ ticket mở mãi.
    const store = mkStore({ ticketEnabled: true, ticketCategoryId: "CAT" });
    check(
      "tin nhắn của bot → bỏ qua",
      (await activity.noteActivity(mkMessage({ bot: true }), store)) === false,
    );
    check("không gọi mutation", store.mutations.length === 0);
  }
  {
    // Đa số tin nhắn trong server nằm ngoài category ticket — phải thoát
    // sớm, không được tạo mutation rác.
    const store = mkStore({ ticketEnabled: true, ticketCategoryId: "CAT" });
    check(
      "kênh thường → không tạo mutation",
      (await activity.noteActivity(mkMessage({ parentId: "KHAC" }), store)) === false,
    );
    check(
      "0 mutation cho kênh thường",
      store.mutations.length === 0,
      JSON.stringify(store.mutations),
    );
  }
  {
    // Mutation lỗi (mất mạng Convex) KHÔNG được làm rơi tin nhắn.
    const store = {
      getConfig: async () => ({ ticketEnabled: true, ticketCategoryId: "CAT" }),
      client: {
        mutation: async () => {
          throw new Error("Convex down");
        },
      },
    };
    let threw = false;
    let r;
    try {
      r = await activity.noteActivity(mkMessage(), store);
    } catch {
      threw = true;
    }
    check("mutation lỗi → trả false, KHÔNG ném", threw === false && r === false);
  }
  {
    check("null message → false", (await activity.noteActivity(null, mkStore({}))) === false);
  }

  console.log(`\nKết quả ticket activity: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
})();
