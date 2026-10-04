/**
 * test-greeting-preview.ts — logic "Xem trước trực tiếp" của Welcome & Goodbye.
 *
 * Panel cho phép chèn emoji tuỳ chỉnh (`<:ten:id>`), emoji động (`<a:ten:id>`) và
 * liên kết kênh (`<#id>`) vào tin nhắn chào/tạm biệt, rồi render lại ĐÚNG như
 * Discord. Sai ở đây là người dùng thấy preview một đằng, thành viên thật nhận
 * một nẻo — loại lỗi test giao diện thường bỏ sót vì không ai bấm thử.
 *
 * Suite này kiểm TOÀN BỘ tokenizer + cảnh báo emoji chết, thuần logic, không DOM.
 * Chạy: bun scripts/test-greeting-preview.ts
 */

import {
  fillPreviewSample,
  tokenizeGreeting,
  unknownCustomEmojis,
} from "../src/components/dashboard/GreetingPreview";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean) => {
  console.log(ok ? `  ✅ ${label}` : `  ❌ ${label}`);
  if (ok) pass++;
  else fail++;
};

const STATIC = "<:wio:222222222222222222>";
const ANIM = "<a:party:111111111111111111>";
const CHANNEL = "<#333333333333333333>";

type Tok = ReturnType<typeof tokenizeGreeting>[number];

/** Dựng lại mã gốc từ token — dùng cho phép thử "ghép lại phải bằng chuỗi gốc". */
function rebuild(toks: Tok[]): string {
  return toks
    .map((t) => {
      if (t.t === "text") return t.v;
      if (t.t === "emoji") return `<${t.animated ? "a" : ""}:${t.name}:${t.id}>`;
      if (t.t === "channel") return `<#${t.id}>`;
      if (t.t === "user") return `<@${t.id}>`;
      return t.v;
    })
    .join("");
}

const sample = {
  username: "user1",
  server: "Server Thật",
  count: 128,
  created: 365,
  joined: 210,
  boost: 4,
};

console.log("\n── fillPreviewSample: placeholder giống hệt bot ──");
{
  const out = fillPreviewSample(
    "{user}|{username}|{server}|{count}|{created}|{joined}|{boost}",
    sample,
  );
  const [user, username, server, count, created, joined, boost] = out.split("|");
  check("{user} → mã mention (không phải tên chữ)", /^<@\d{15,21}>$/.test(user));
  check("{username} → tên người dùng", username === "user1");
  check("{server} → tên server thật", server === "Server Thật");
  check("{count} → số thành viên", count === "128");
  check("{created} → tuổi account (ngày)", created === "365");
  check("{joined} → số ngày đã ở trong server", joined === "210");
  check("{boost} → số boost", boost === "4");
  check(
    "chuỗi rỗng giữ nguyên rỗng (không tự thêm mặc định)",
    fillPreviewSample("", sample) === "",
  );
}

console.log("\n── tokenizeGreeting: emoji/kênh/mention ──");
{
  const toks = tokenizeGreeting(`Chào ${ANIM} ${STATIC} vào ${CHANNEL} <@123456789012345678>`);
  check(
    "emoji động nhận đúng `animated: true`",
    toks.some((t) => t.t === "emoji" && t.id === "111111111111111111" && t.animated === true),
  );
  check(
    "emoji tĩnh nhận đúng `animated: false`",
    toks.some((t) => t.t === "emoji" && t.id === "222222222222222222" && t.animated === false),
  );
  check(
    "liên kết kênh tách thành token riêng",
    toks.some((t) => t.t === "channel" && t.id === "333333333333333333"),
  );
  check(
    "mention người dùng nhận ra",
    toks.some((t) => t.t === "user"),
  );
  check(
    "chữ bao quanh giữ nguyên",
    toks.some((t) => t.t === "text" && t.v.includes("Chào")),
  );
  check(
    "ghép lại token = chuỗi gốc (không nuốt/mất ký tự)",
    rebuild(toks) === `Chào ${ANIM} ${STATIC} vào ${CHANNEL} <@123456789012345678>`,
  );
}

console.log("\n── tokenizeGreeting: mã hỏng không được làm vỡ preview ──");
{
  const bad = [
    "<:bad>",
    "<:wio:123>", // id quá ngắn — không phải emoji hợp lệ
    "<:",
    "<",
    "<#khong-phai-id>",
  ];
  check(
    "mã sai → trả về chữ thô, không token hoá bừa",
    bad.every((b) => {
      const t = tokenizeGreeting(b);
      return t.length === 1 && t[0].t === "text" && t[0].v === b;
    }),
  );
  // `<@everyone>` KHÔNG phải mention hợp lệ (Discord không ping ai) nhưng phần
  // `@everyone` bên trong vẫn phải bị đánh dấu để panel cảnh báo người dùng.
  check(
    "`<@everyone>` → tách ra cảnh báo @everyone thay vì lọt lưới",
    tokenizeGreeting("<@everyone>").some((t) => t.t === "broadcast"),
  );
  check("chuỗi rỗng → không token nào", tokenizeGreeting("").length === 0);
  const many = tokenizeGreeting(STATIC.repeat(50));
  check("50 emoji liên tiếp → 50 token riêng", many.length === 50);
  check("ghép lại vẫn khớp", rebuild(many) === STATIC.repeat(50));
}

console.log("\n── tokenizeGreeting: @everyone/@here luôn bị đánh dấu để cảnh báo ──");
{
  const toks = tokenizeGreeting("Chào @everyone và @here nhé");
  const broadcasts = toks.filter((t) => t.t === "broadcast");
  check("nhận cả @everyone lẫn @here", broadcasts.length === 2);
  check(
    "giữ nguyên chữ để preview hiển thị đúng",
    broadcasts.map((t: any) => t.v).join(",") === "@everyone,@here",
  );
  // Panel dựa vào chính tokenizer để bật cảnh báo "bot luôn chặn ping" — nội dung
  // sạch KHÔNG được có token broadcast (nếu không cảnh báo hiện vô cớ).
  check(
    "nội dung sạch không sinh cảnh báo ping",
    !tokenizeGreeting("Chào cả nhà nhé").some((t) => t.t === "broadcast"),
  );
}

console.log("\n── unknownCustomEmojis: emoji đã bị xoá khỏi server ──");
{
  const server = [
    { emojiId: "111111111111111111", name: "party", animated: true },
    { emojiId: "222222222222222222", name: "wio", animated: false },
  ];
  check(
    "emoji còn trong server → không cảnh báo",
    unknownCustomEmojis(`Chào ${ANIM} ${STATIC}`, server).length === 0,
  );
  const gone = unknownCustomEmojis(`Chào ${STATIC} <:ghost:999999999999999999>`, server);
  check("emoji đã mất → báo đúng tên", gone.length === 1 && gone[0] === ":ghost:");
  const dup = unknownCustomEmojis(
    "<:ghost:9>".replace("9", "999999999999999999") + "<:ghost:999999999999999998>",
    server,
  );
  check("2 emoji chết khác nhau → báo cả hai", dup.length === 2);
}

console.log(`\n${pass}/${pass + fail} ✅`);
process.exit(fail > 0 ? 1 : 0);
