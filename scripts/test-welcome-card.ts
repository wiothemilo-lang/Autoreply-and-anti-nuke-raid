/**
 * test-welcome-card.ts — kiểm thử THẺ ẢNH chào/tạm biệt (bot tự vẽ PNG).
 *
 * Vì sao phải test bằng ẢNH THẬT chứ không chỉ kiểm "hàm chạy không lỗi":
 * lỗi nguy hiểm nhất của tính năng này là VẼ RA ẢNH TRỐNG. Máy chủ không có font
 * hệ thống (`GlobalFonts.families === 0`) thì canvas không báo lỗi gì cả —
 * `fillText` chỉ đơn giản không vẽ gì. Ảnh vẫn ra PNG hợp lệ, không ai biết là
 * sai cho tới khi thành viên thật nhìn thấy một tấm ảnh không có chữ.
 * Nên ở đây: đếm điểm ảnh (ink) để chứng minh CHỮ CÓ ĐƯỢC VẼ, và vẽ cả chữ có
 * dấu tiếng Việt (font thiếu dấu → cũng ra ảnh thiếu chữ).
 *
 * Chạy: bun scripts/test-welcome-card.ts — không mạng (ảnh nền nội bộ bị chặn SSRF).
 */

import { createRequire } from "module";

// Nạp qua đúng đường dẫn của bot để `@napi-rs/canvas` resolve từ bot/node_modules.
const botRequire = createRequire(new URL("../bot/src/handlers/welcomeCard.js", import.meta.url));
const canvas = botRequire("@napi-rs/canvas") as any;

const card = require("../bot/src/handlers/welcomeCard");

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean) => {
  console.log(ok ? `  ✅ ${label}` : `  ❌ ${label}`);
  if (ok) pass++;
  else fail++;
};

/** Đọc lại PNG và đếm pixel có "mực" (khác nền) — cách duy nhất chứng minh chữ đã vẽ. */
async function inkOf(png: Buffer) {
  const img = await canvas.loadImage(png);
  const c = canvas.createCanvas(card.CARD_W, card.CARD_H);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, card.CARD_W, card.CARD_H).data;
  // Ảnh nền gradient tối + chữ trắng: đếm pixel SÁNG (chữ/avatar-ring/vạch màu).
  let light = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] + d[i + 1] + d[i + 2] > 540) light++;
  }
  return { light, total: d.length / 4 };
}

(async () => {
  console.log("\n── Trạng thái module (font + thư viện) ──");
  check("máy này vẽ được thẻ (canvas + font nhúng nạp được)", card.cardAvailable() === true);
  check("lý do không vẽ được = null khi vẽ được", card.cardUnavailableReason() === null);

  if (!card.cardAvailable()) {
    console.error(
      "\n❌ Không nạp được thư viện/font vẽ thẻ — tính năng thẻ ảnh sẽ IM LẶNG không chạy.",
    );
    process.exit(1);
  }

  console.log("\n── PNG hợp lệ + đúng kích thước ──");
  const basic = await card.renderCard({
    eyebrow: "CHÀO MỪNG",
    name: "Nguyễn Văn A",
    meta: "Server Thật · Thành viên thứ 128",
    accent: "#57f287",
  });
  check("trả về Buffer", Buffer.isBuffer(basic));
  check("chữ ký PNG đúng", basic.slice(0, 8).toString("hex") === "89504e470d0a1a0a");
  const dims = await canvas.loadImage(basic);
  check(
    `kích thước ${card.CARD_W}×${card.CARD_H}`,
    dims.width === card.CARD_W && dims.height === card.CARD_H,
  );

  console.log("\n── CHỮ PHẢI ĐƯỢC VẼ (bắt lỗi 'ảnh trống' khi thiếu font) ──");
  const withText = await inkOf(basic);
  check(`ảnh có nội dung (ink=${withText.light}/${withText.total})`, withText.light > 3000);
  const noText = await card.renderCard({
    eyebrow: "",
    name: "",
    meta: "",
    accent: "#57f287",
  });
  const emptyInk = await inkOf(noText);
  check(
    `có tên → nhiều mực hơn hẳn ảnh không chữ (${withText.light} vs ${emptyInk.light})`,
    withText.light > emptyInk.light + 1000,
  );

  console.log("\n── Tiếng Việt có dấu (font thiếu dấu cũng ra ảnh thiếu chữ) ──");
  const viet = await card.renderCard({
    eyebrow: "CHÀO MỪNG",
    name: "Đặng Thị Ngọc Huyền",
    meta: "Máy chủ ơi · Thành viên thứ 7",
    accent: "#5865f2",
  });
  const vietInk = await inkOf(viet);
  // 21 ký tự có dấu: nếu font rơi về bộ không có dấu (như KaTeX/CMU) thì phần
  // lớn glyph bị bỏ → mực tụt rõ rệt.
  check(`chữ có dấu vẫn vẽ đủ (ink=${vietInk.light})`, vietInk.light > withText.light * 0.85);

  console.log("\n── Cache ảnh nền: nhiều join không tải lại cùng URL ──");
  {
    const backupMod = require("../bot/src/handlers/backup");
    const origAssert = backupMod.assertSafeRemoteUrl;
    const origFetch = (globalThis as any).fetch;
    let fetches = 0;
    backupMod.assertSafeRemoteUrl = async (u: string) => u;
    (globalThis as any).fetch = async () => {
      fetches++;
      return {
        ok: true,
        headers: { get: (k: string) => (k === "content-type" ? "image/png" : null) },
        arrayBuffer: async () => basic,
      };
    };
    try {
      const url = "https://example.test/nen.png";
      await card.renderCard({ eyebrow: "A", name: "B", meta: "C", backgroundUrl: url });
      await card.renderCard({ eyebrow: "A", name: "B", meta: "C", backgroundUrl: url });
      check("2 thẻ cùng ảnh nền → chỉ 1 lần tải", fetches === 1);
      await card.renderCard({ eyebrow: "A", name: "B", meta: "C", backgroundUrl: url + "?v=2" });
      check("URL nền khác → tải mới", fetches === 2);
    } finally {
      backupMod.assertSafeRemoteUrl = origAssert;
      (globalThis as any).fetch = origFetch;
    }
  }

  console.log("\n── Emoji bị bỏ khỏi ẢNH (không vẽ ô tofu) ──");
  const FONT = "24px ProtogonCard";
  const drawable = (t: string) => card._drawableTextForTest(FONT, t);
  check("drawableText bỏ emoji, giữ chữ", drawable("Chào 🎉 bạn") === "Chào bạn");
  // Hồi quy thật: "V" trong Noto Sans rộng ĐÚNG BẰNG glyph khuyết (14.4px) nên
  // bản so-bề-rộng đã xoá oan chữ V. Phải giữ nguyên cả câu.
  check("drawableText giữ đủ dấu tiếng Việt", drawable("Nguyễn Văn A") === "Nguyễn Văn A");
  check(
    "drawableText giữ nguyên chữ hoa dễ trùng bề rộng notdef",
    drawable("VIVA Vũ") === "VIVA Vũ",
  );
  check("drawableText gộp khoảng trắng thừa", drawable("Wio    ơi") === "Wio ơi");
  check("drawableText bỏ chữ Hán (font không có glyph)", drawable("Wio 日本") === "Wio");
  const withEmoji = await card.renderCard({
    eyebrow: "CHÀO MỪNG 🎉",
    name: "Wio 🚀",
    meta: "Server 🎊",
    accent: "#57f287",
  });
  const emojiInk = await inkOf(withEmoji);
  check("vẫn vẽ ra ảnh có chữ, không crash", Buffer.isBuffer(withEmoji) && emojiInk.light > 1200);

  console.log("\n── Ảnh nền không tải được → rơi về nền gradient, KHÔNG chết ──");
  const badBg = await card.renderCard({
    eyebrow: "CHÀO MỪNG",
    name: "Wio",
    meta: "Server",
    // Địa chỉ nội bộ bị chặn SSRF trước cả khi thử mạng → tất định, không cần internet.
    backgroundUrl: "http://127.0.0.1:9/khong-co.png",
    avatarUrl: "http://169.254.169.254/meta.png",
    accent: "#5865f2",
  });
  check("vẫn vẽ được thẻ (dùng nền màu chuyển sắc)", Buffer.isBuffer(badBg));
  check("vẫn có chữ trên thẻ", (await inkOf(badBg)).light > 1200);

  console.log("\n── Màu nhấn: nhận #hex, 3 ký tự, số, rác ──");
  check("toColor #57f287", card._toColorForTest("#57f287", "#000000") === "#57f287");
  check("toColor #abc → #aabbcc", card._toColorForTest("#abc", "#000000") === "#aabbcc");
  check("toColor số → #hex", card._toColorForTest(0x5865f2, "#000000") === "#5865f2");
  check("toColor rác → màu dự phòng", card._toColorForTest("tôi là màu", "#123456") === "#123456");

  console.log("\n── Cắt chữ vừa khung (không tràn ra ngoài thẻ) ──");
  const fit = card._fitTextForTest;
  const measure = (t: string) => {
    const c = canvas.createCanvas(10, 10).getContext("2d");
    c.font = FONT;
    return c.measureText(t).width;
  };
  const wide = 260; // ~1/2 bề rộng vùng chữ của thẻ
  check("chữ ngắn giữ nguyên", fit(FONT, "Wio", wide) === "Wio");
  const longName = "Nguyễn Văn A với một cái tên rất là dài dòng";
  const cut = fit(FONT, longName, wide);
  check(
    `chữ dài bị cắt vừa khung + "…" ("${cut}")`,
    cut.endsWith("…") && cut.length < longName.length && measure(cut) <= wide,
  );
  check("chữ đúng bằng khung thì không bị cắt", fit(FONT, "Wio", measure("Wio")) === "Wio");

  console.log("\n── Máy chủ KHÔNG có thư viện/font: bot phải biết và lùi an toàn ──");
  card._setCanvasUnavailableForTest("thiếu thư viện trong môi trường test");
  check("cardAvailable() = false", card.cardAvailable() === false);
  check(
    "lý do được giữ lại để báo lên dashboard",
    card.cardUnavailableReason() === "thiếu thư viện trong môi trường test",
  );
  check(
    "renderCard trả null (KHÔNG ném lỗi làm chết luồng chào)",
    (await card.renderCard({ name: "x" })) === null,
  );
  card._resetForTest();
  check(
    "nạp lại được sau khi reset (test không để lại trạng thái bẩn)",
    card.cardAvailable() === true,
  );

  console.log(`\n${pass}/${pass + fail} ✅`);
  process.exit(fail > 0 ? 1 : 0);
})();
